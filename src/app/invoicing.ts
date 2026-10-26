// Invoicing for everyone (26 October 2026). His word: "Bude to navždy zadarmo pre každého. Pre ľudí, čo používajú našu
// účtovnú firmu, pre ľudí, čo nepoužívajú našu účtovnú firmu." A business that is no client of ours gets a workspace of
// its own invoices: the same invoices, credit notes, requests for advances, numbering, logo, PAY by square and
// e-invoice our clients have, and nothing else of the app.
//
// What keeps it apart, so that nothing of the accounting side can ever reach it or be reached from it:
// - `companies.invoicing_only` is set when the workspace is made and can never change (a trigger); such a company has
//   no accountant, no contract and no data of the books (triggers refuse documents other than its own issued invoices,
//   payments, statements, accounts and messages);
// - the team sees none of them (team/store.ts `visible` and `canSee`), no schedule of the accounting reaches them, the
//   register's IČO of one never makes the company a client (order.ts `isClient`), and mail to its address for
//   documents is refused (inbox.ts);
// - the app lets such a session reach only the pages of invoicing (`invoicingPath`, the app's own middleware).
// An invoice of a workspace is paid by the user's word (there is no bank with us): `invoices.hand_paid_on`.
// Nothing of an invoice is emailed: the user downloads it or shares it himself (his word of 26 October 2026, 13:41).
import { INVOICING, PRIVACY_VERSION } from '../config'
import { now, sha256Hex } from '../db'
import { app } from './copy'
import { eurOf, rateMicro } from './fx'
import { advanceLines, getInvoice, invoiceLines, saveInvoiceStatements, totalsOf, type InvoiceValues, type StoredInvoice } from './invoices'
import { newToken } from './session'
import { eventStatement, type Company } from './store'

// ---------------------------------------------------------------------------------------------------------------
// Which pages a workspace reaches
// ---------------------------------------------------------------------------------------------------------------

/**
 * The app's pages a workspace of invoicing alone may open: its invoices (but not the reminders sent by email, which
 * are no more, nor the tax documents of advances made from bank payments, which it has none of), its customers, its
 * settings, its logo, and switching to another company. Everything else answers as if it did not exist.
 */
export function invoicingPath(path: string): boolean {
  // Nothing of an invoice is emailed from a workspace (his word of 26 October 2026), and no reminder goes by itself.
  if (/^\/app\/faktury\/upomienky$/.test(path) || /^\/app\/faktury\/[^/]+\/(?:zaloha|poslat|pripomenut)$/.test(path)) return false
  return /^\/app\/(?:faktury(?:\/.*)?|odberatelia|prijate(?:\/[A-Za-z0-9-]{1,64}(?:\/(?:zaplatena|nezaplatena|xml))?)?|fakturacia(?:\/[a-z-]+)?|logo|firma\/prepnut|potvrdit)$/.test(path)
}

// ---------------------------------------------------------------------------------------------------------------
// Signing up
// ---------------------------------------------------------------------------------------------------------------

export interface SignupValues {
  email: string
  ico: string | null
  company: string
  address: string | null
  registerLine: string | null
  legalForm: string | null
  /** The register knew the IČO: the name and register entry are its own and stay so in the workspace. */
  registerFound: boolean
  source: string | null
}

/** A sign-up waiting for its link: written down as a hash of the token, which only the email carries. */
export async function newSignupStatement(db: D1Database, token: string, s: SignupValues): Promise<D1PreparedStatement> {
  const ts = now()
  return db
    .prepare(
      `INSERT INTO invoicing_signups (id, created_at, expires_at, email, ico, company, address, register_line, legal_form, register_found, source, terms_version, privacy_version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(await sha256Hex(token), ts, ts + INVOICING.linkHours * 3600, s.email.toLowerCase(), s.ico, s.company, s.address, s.registerLine, s.legalForm, s.registerFound ? 1 : 0, s.source, INVOICING.termsVersion, PRIVACY_VERSION)
}

const TOKEN = /^[A-Za-z0-9_-]{43}$/

export interface Signup extends SignupValues {
  id: string
  /** The person's name, given on the page of the link. */
  name: string
  termsVersion: string
}

function signupOf(row: Record<string, unknown>): Signup {
  const str = (v: unknown) => (typeof v === 'string' && v !== '' ? v : null)
  return {
    id: String(row.id),
    email: String(row.email),
    name: str(row.name) ?? '',
    ico: str(row.ico),
    company: String(row.company),
    address: str(row.address),
    registerLine: str(row.register_line),
    legalForm: str(row.legal_form),
    registerFound: row.register_found === 1,
    source: str(row.source),
    termsVersion: String(row.terms_version),
  }
}

/** The sign-up a link is for while it can still be used, without using it (the page that asks for the click). */
export async function signupFor(db: D1Database, token: string): Promise<Signup | null> {
  if (!TOKEN.test(token)) return null
  const row = await db.prepare('SELECT * FROM invoicing_signups WHERE id = ? AND used_at IS NULL AND expires_at > ?').bind(await sha256Hex(token), now()).first<Record<string, unknown>>()
  return row ? signupOf(row) : null
}

/** Uses a sign-up's link once, with the name the person gave on its page: two clicks at once make one workspace. */
export async function useSignup(db: D1Database, token: string, name: string): Promise<Signup | null> {
  if (!TOKEN.test(token)) return null
  const row = await db
    .prepare('UPDATE invoicing_signups SET used_at = ?1, name = ?3 WHERE id = ?2 AND used_at IS NULL AND expires_at > ?1 RETURNING *')
    .bind(now(), await sha256Hex(token), name)
    .first<Record<string, unknown>>()
  return row ? signupOf(row) : null
}

/** A code for the company's address for documents (a column every company has); a workspace's refuses all mail. */
function inboxCode(): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789'
  return [...crypto.getRandomValues(new Uint8Array(10))].map((b) => alphabet[b % alphabet.length]).join('')
}

export type MadeWorkspace = { user: string; company: string; existing: boolean } | { refused: 'workspaces' | 'client' | 'blocked' }

/**
 * The workspace a used sign-up makes, with its owner: the person of that address (made when new), the company as the
 * register named it when the form was sent. A person who already owns a workspace of the same IČO is taken into it;
 * nobody owns more than `INVOICING.workspacesPerUser`.
 */
export async function makeWorkspace(db: D1Database, s: Signup): Promise<MadeWorkspace> {
  const known = await db.prepare('SELECT id FROM users WHERE email = ?').bind(s.email).first<{ id: string }>()
  // A client of ours invoices in its own company's app: its IČO makes no workspace for anybody who is not its member.
  if (s.ico) {
    const client = await db
      .prepare('SELECT c.id, EXISTS (SELECT 1 FROM members m WHERE m.company_id = c.id AND m.user_id = ?2) AS member FROM companies c WHERE c.ico = ?1 AND c.invoicing_only = 0 AND c.demo = 0 AND c.operator = 0 AND c.closed_at IS NULL AND c.contract_at IS NOT NULL LIMIT 1')
      .bind(s.ico, known?.id ?? '')
      .first<{ id: string; member: number }>()
    if (client) return client.member === 1 && known ? { user: known.id, company: client.id, existing: true } : { refused: 'client' }
  }
  if (known && s.ico) {
    const same = await db
      .prepare("SELECT c.id FROM companies c JOIN members m ON m.company_id = c.id AND m.user_id = ? AND m.role = 'owner' WHERE c.invoicing_only = 1 AND c.ico = ? AND c.closed_at IS NULL LIMIT 1")
      .bind(known.id, s.ico)
      .first<{ id: string }>()
    if (same) return { user: known.id, company: same.id, existing: true }
  }
  if (known) {
    // A person whose workspace the administrator stopped makes no new one (the terms of use, point 4.2).
    const blocked = await db
      .prepare("SELECT 1 AS x FROM companies c JOIN members m ON m.company_id = c.id AND m.user_id = ? AND m.role = 'owner' WHERE c.invoicing_only = 1 AND c.closed_at IS NOT NULL LIMIT 1")
      .bind(known.id)
      .first()
    if (blocked) return { refused: 'blocked' }
    const owned = await db
      .prepare("SELECT COUNT(*) AS n FROM companies c JOIN members m ON m.company_id = c.id AND m.user_id = ? AND m.role = 'owner' WHERE c.invoicing_only = 1 AND c.closed_at IS NULL")
      .bind(known.id)
      .first<{ n: number }>()
    if ((owned?.n ?? 0) >= INVOICING.workspacesPerUser) return { refused: 'workspaces' }
  }
  const user = known?.id ?? crypto.randomUUID()
  const company = crypto.randomUUID()
  const ts = now()
  let inbox = inboxCode()
  for (let i = 0; i < 5 && (await db.prepare('SELECT 1 AS x FROM companies WHERE inbox = ?').bind(inbox).first()); i++) inbox = inboxCode()
  await db.batch([
    // Two links of one new address used at once: the second finds the person the first made (users.email is unique).
    ...(known ? [] : [db.prepare('INSERT OR IGNORE INTO users (id, created_at, email, name, reminders) VALUES (?, ?, ?, ?, 0)').bind(user, ts, s.email, s.name)]),
    db
      .prepare(
        `INSERT INTO companies (id, created_at, name, ico, address, register_line, legal_form, vat_payer, plan, inbox, invoicing_only, terms_version, register_found)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 1, ?, ?)`,
      )
      .bind(company, ts, s.company, s.ico, s.address, s.registerLine, s.legalForm, INVOICING.plan, inbox, `fakturacia-${s.termsVersion}`, s.registerFound ? 1 : 0),
    db.prepare("INSERT INTO members (company_id, user_id, role, created_at) SELECT ?1, id, 'owner', ?2 FROM users WHERE email = ?3").bind(company, ts, s.email),
    db
      .prepare("INSERT INTO events (at, company_id, user_id, action, subject, detail) SELECT ?1, ?2, id, 'invoicing.started', NULL, ?3 FROM users WHERE email = ?4")
      .bind(ts, company, JSON.stringify({ terms: s.termsVersion, source: s.source }), s.email),
  ])
  const owner = await db.prepare('SELECT id FROM users WHERE email = ?').bind(s.email).first<{ id: string }>()
  return { user: owner?.id ?? user, company, existing: false }
}

// ---------------------------------------------------------------------------------------------------------------
// The workspace's own settings
// ---------------------------------------------------------------------------------------------------------------

export interface WorkspaceValues {
  name: string
  address: string
  ico: string
  dic: string
  icdph: string
  registerLine: string
  vatPayer: boolean
  iban: string
  dueDays: string
  footer: string
}

export type WorkspaceErrors = Partial<Record<keyof WorkspaceValues | 'form' | 'register', string>>

/** The company's data as an owner of a workspace sets them (a client's are kept by its accountant). */
export function workspaceStatement(db: D1Database, company: string, v: { name: string; address: string | null; ico: string | null; dic: string | null; icdph: string | null; registerLine: string | null; vatPayer: boolean; iban: string | null; dueDays: number; footer: string | null }, user: string): D1PreparedStatement[] {
  return [
    db
      .prepare(
        `UPDATE companies SET name = ?, address = ?, ico = ?, dic = ?, icdph = ?, register_line = ?, vat_payer = ?, invoice_iban = ?, invoice_due_days = ?, invoice_footer = ?
         WHERE id = ? AND invoicing_only = 1`,
      )
      .bind(v.name, v.address, v.ico, v.dic, v.icdph, v.registerLine, v.vatPayer ? 1 : 0, v.iban, v.dueDays, v.footer, company),
    eventStatement(db, { company, user, action: 'invoicing.settings' }),
  ]
}

/** Whether the workspace still lacks what every invoice it issues asks: the account money is paid to. */
export const workspaceReady = (company: Pick<Company, 'invoiceIban'>): boolean => Boolean(company.invoiceIban)

// ---------------------------------------------------------------------------------------------------------------
// Paid by hand
// ---------------------------------------------------------------------------------------------------------------

/**
 * Marks an issued invoice or request paid on a day (not ahead, not before it was issued), or takes the mark back. Only
 * a workspace's: a client's invoice is paid by the payment its bank brings.
 */
export function handPaidStatement(db: D1Database, company: string, invoice: string, day: string | null, user: string): D1PreparedStatement[] {
  return [
    db
      .prepare(
        `UPDATE invoices SET hand_paid_on = ?1, hand_paid_by = ?2 WHERE id = ?3 AND company_id = ?4 AND status = 'issued' AND kind IN ('invoice', 'proforma')
           AND (?1 IS NULL OR ?1 >= issued_on)
           AND EXISTS (SELECT 1 FROM companies c WHERE c.id = ?4 AND c.invoicing_only = 1)`,
      )
      .bind(day, day ? user : null, invoice, company),
    eventStatement(db, { company, user, action: day ? 'invoice.paid.hand' : 'invoice.paid.hand.undone', subject: invoice, detail: day ? { day } : null }),
  ]
}

/**
 * The tax document of an advance a workspace received (§ 73: within 15 days of it; a company that is no VAT payer the
 * document of the money received): the request paid whole on the day it was marked, its amount split by the request's
 * rates as for a payment of the bank. One for a request (`invoices_payment` holds it: its payment is `hand:<request>`).
 */
export async function issueHandAdvance(db: D1Database, company: Company, request: StoredInvoice, user: string, day: string): Promise<string | null> {
  if (!company.invoicingOnly || request.kind !== 'proforma' || request.status !== 'issued' || !request.handPaidOn || !request.number) return null
  if (company.vatPayer && request.mode !== 'domestic') return null
  const lines = advanceLines(await invoiceLines(db, request.id), request.totalCents, company.vatPayer, (rate) =>
    company.vatPayer ? app.invoices.form.advanceLine(request.number ?? '', rate) : app.invoices.form.advanceLineNoVat(request.number ?? ''),
  )
  if (lines.length === 0) return null
  const values: InvoiceValues = {
    customerName: request.customerName,
    customerAddress: request.customerAddress ?? '',
    customerIco: request.customerIco ?? '',
    customerDic: request.customerDic ?? '',
    customerIcdph: request.customerIcdph ?? '',
    customerCountry: request.customerCountry ?? '',
    customerEmail: request.customerEmail ?? '',
    issued: day,
    delivered: request.handPaidOn,
    due: request.handPaidOn,
    iban: '',
    note: '',
    lines: [],
    mode: request.mode,
    reverseKind: request.reverse?.kind ?? '',
    reverseCode: request.reverse?.code ?? '',
    center: '',
  }
  const invoiceId = crypto.randomUUID()
  try {
    await db.batch([
      ...saveInvoiceStatements(db, {
        id: invoiceId,
        company: company.id,
        user,
        issue: true,
        values,
        lines,
        totals: totalsOf(lines, company.vatPayer),
        issued: day,
        delivered: request.handPaidOn,
        due: request.handPaidOn,
        token: newToken(),
        iban: null,
        documentId: crypto.randomUUID(),
        kind: 'advance',
        relates: request.id,
        payment: `hand:${request.id}`,
      }),
      eventStatement(db, { company: company.id, user, action: 'invoice.advance', subject: invoiceId, detail: { request: request.id, total: request.totalCents, how: 'hand' } }),
    ])
  } catch (err) {
    // Made meanwhile by a second click: the one made stands.
    console.error('a hand advance failed', err instanceof Error ? err.name : 'error')
    return null
  }
  return invoiceId
}

/** The advance's tax document a request paid by hand already has. */
export async function handAdvanceOf(db: D1Database, company: string, request: string): Promise<StoredInvoice | null> {
  const row = await db.prepare("SELECT id FROM invoices WHERE company_id = ? AND payment_id = ? AND kind = 'advance' AND status = 'issued'").bind(company, `hand:${request}`).first<{ id: string }>()
  return row ? getInvoice(db, company, row.id) : null
}

// ---------------------------------------------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------------------------------------------

export interface Customer {
  /** The latest invoice to the customer, which a new one starts from. */
  latest: string
  name: string
  ico: string | null
  address: string | null
  invoices: number
  /** Invoiced (invoices less credit notes, in euros) and still unpaid of it. */
  invoicedCents: number
  openCents: number
  lastOn: string
}

/**
 * The company's customers, from its issued invoices (no list of its own to keep in step): each by its IČO, else by its
 * name, with what was invoiced in euros and what of it is open. Requests for advances and their tax documents are not
 * invoicing of their own (their final invoice is).
 */
export async function customersOf(db: D1Database, company: string): Promise<Customer[]> {
  const rows = await db
    .prepare(
      `SELECT i.id, i.customer_name, i.customer_ico, i.customer_address, i.issued_on, i.kind, i.total_cents, i.currency, i.fx_rate, i.hand_paid_on, i.corrects,
         EXISTS (SELECT 1 FROM links l WHERE l.document_id = i.document_id) AS linked
       FROM invoices i WHERE i.company_id = ? AND i.status = 'issued' AND i.kind IN ('invoice', 'credit')
       ORDER BY i.issued_on DESC, i.seq DESC LIMIT 5000`,
    )
    .bind(company)
    .all<Record<string, unknown>>()
  const byWho = new Map<string, Customer>()
  // What each open invoice still asks: its total less its credit notes, never below nothing.
  const open = new Map<string, { customer: Customer; cents: number }>()
  const credits: { corrects: string; cents: number }[] = []
  for (const r of rows.results) {
    const ico = typeof r.customer_ico === 'string' ? r.customer_ico.replace(/\s/g, '') : ''
    const name = String(r.customer_name)
    const who = ico !== '' ? `ico:${ico}` : `name:${name.toLocaleLowerCase('sk').replace(/\s+/g, ' ').trim()}`
    const currency = typeof r.currency === 'string' && r.currency !== '' ? r.currency : 'EUR'
    const rate = currency === 'EUR' ? null : rateMicro(typeof r.fx_rate === 'string' ? r.fx_rate : null)
    const total = Number(r.total_cents ?? 0)
    const eur = currency === 'EUR' ? total : rate ? eurOf(total, rate) : 0
    let c = byWho.get(who)
    if (!c) {
      // The rows come newest first: the first one names the customer as it is now.
      c = { latest: '', name, ico: ico || null, address: typeof r.customer_address === 'string' && r.customer_address !== '' ? r.customer_address : null, invoices: 0, invoicedCents: 0, openCents: 0, lastOn: String(r.issued_on) }
      byWho.set(who, c)
    }
    c.invoicedCents += eur
    if (r.kind === 'invoice') {
      c.invoices += 1
      if (!c.latest) c.latest = String(r.id)
      if (eur > 0 && !r.hand_paid_on && Number(r.linked) !== 1) open.set(String(r.id), { customer: c, cents: eur })
    } else if (typeof r.corrects === 'string') credits.push({ corrects: r.corrects, cents: eur })
  }
  for (const credit of credits) {
    const o = open.get(credit.corrects)
    if (o) o.cents += credit.cents
  }
  for (const o of open.values()) o.customer.openCents += Math.max(0, o.cents)
  return [...byWho.values()].filter((c) => c.latest !== '')
}

// ---------------------------------------------------------------------------------------------------------------
// Ending a workspace
// ---------------------------------------------------------------------------------------------------------------

/**
 * Deletes a workspace and everything of it, at its owner's word (the terms of use: the user keeps his invoices himself,
 * ten years by § 35 of the Act on Accounting, and downloads them first). The people who belong to nothing else are
 * forgotten by the schedule (purge.ts `forgetLonely`). Only a workspace: a client's company ends by its contract.
 */
export async function deleteWorkspace(db: D1Database, files: R2Bucket | undefined, company: string, email: string): Promise<boolean> {
  const row = await db.prepare('SELECT invoicing_only FROM companies WHERE id = ?').bind(company).first<{ invoicing_only: number }>()
  if (row?.invoicing_only !== 1) return false
  const guard = '(SELECT invoicing_only FROM companies WHERE id = ?1) = 1'
  // The database first: a hold that keeps it (an incident) keeps the files too, and nothing is half deleted.
  try {
    await db.batch([
      db.prepare(`DELETE FROM invoice_lines WHERE invoice_id IN (SELECT id FROM invoices WHERE company_id = ?1) AND ${guard}`).bind(company),
      db.prepare(`DELETE FROM invoice_repeats WHERE company_id = ?1 AND ${guard}`).bind(company),
      db.prepare(`DELETE FROM einvoice_sends WHERE company_id = ?1 AND ${guard}`).bind(company),
      db.prepare(`DELETE FROM einvoice_received WHERE company_id = ?1 AND ${guard}`).bind(company),
      db.prepare(`DELETE FROM invoices WHERE company_id = ?1 AND ${guard}`).bind(company),
      db.prepare(`DELETE FROM documents WHERE company_id = ?1 AND ${guard}`).bind(company),
      db.prepare(`DELETE FROM cost_centers WHERE company_id = ?1 AND ${guard}`).bind(company),
      db.prepare(`DELETE FROM events WHERE company_id = ?1 AND ${guard}`).bind(company),
      db.prepare(`DELETE FROM sessions WHERE company_id = ?1 AND ${guard}`).bind(company),
      db.prepare(`DELETE FROM members WHERE company_id = ?1 AND ${guard}`).bind(company),
      db.prepare(`DELETE FROM company_data_revisions WHERE company_id = ?1 AND ${guard}`).bind(company),
      db.prepare('DELETE FROM invoicing_signups WHERE email = ?1').bind(email.toLowerCase()),
      db.prepare('DELETE FROM companies WHERE id = ?1 AND invoicing_only = 1').bind(company),
    ])
  } catch (err) {
    console.error('a workspace was not deleted', err instanceof Error ? err.name : 'error')
    return false
  }
  if (files) {
    let cursor: string | undefined
    do {
      const list = await files.list({ prefix: `companies/${company}/`, cursor })
      if (list.objects.length > 0) await files.delete(list.objects.map((o) => o.key))
      cursor = list.truncated ? list.cursor : undefined
    } while (cursor)
  }
  return true
}
