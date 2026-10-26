// The postman's work inside Firmony (26 October 2026): who can receive (kept a while), an e-invoice sent with its
// state, what the network delivered to a company. Every query names the company it works for.
import { now, sha256Hex } from '../db'
import { customerCountryOf, getInvoice, invoiceLines, ublOf, type StoredInvoice } from '../app/invoices'
import { intakeOpen } from '../app/ending'
import { keepFilesFor } from '../app/intake'
import type { AppBindings } from '../app/routes'
import { COMPANY_COLUMNS, companyOf, eventStatement, type Company } from '../app/store'
import { bratislavaDay } from '../time'
import { readInvoice } from '../app/xml'
import { lookupParticipant, slovakParticipant, type Lookup } from './participant'
import type { PeppolProvider, ProviderEvent, SendKind } from './provider'

/** How long the SML's answer is kept: a registration rarely goes away; a missing one may come any day. */
const FOUND_SECONDS = 3 * 86400
const MISSING_SECONDS = 6 * 3600
/** Tries of one sending before it is said to have failed, and the waits between them. */
const WAITS = [60, 300, 900, 3600, 3 * 3600, 6 * 3600, 12 * 3600]
/** E-invoices one company sends in a day: a runaway click or script stops here (the postman bills each). */
export const SENDS_PER_DAY = 300

export type ReceiveState = Lookup['state']

/** The SML's answer for a participant, from what we kept or asked afresh; an unknown answer is not kept. */
export async function participantState(db: D1Database, participant: string, fetcher: typeof fetch = fetch): Promise<Lookup> {
  const kept = await db.prepare('SELECT state, smp, checked_at FROM peppol_lookups WHERE participant = ?').bind(participant).first<{ state: 'found' | 'missing'; smp: string | null; checked_at: number }>()
  const age = kept ? now() - kept.checked_at : Infinity
  if (kept && age < (kept.state === 'found' ? FOUND_SECONDS : MISSING_SECONDS)) return kept.state === 'found' ? { state: 'found', smp: kept.smp } : { state: 'missing' }
  const fresh = await lookupParticipant(participant, fetcher)
  if (fresh.state === 'unknown') return kept ? (kept.state === 'found' ? { state: 'found', smp: kept.smp } : { state: 'missing' }) : fresh
  await db
    .prepare('INSERT INTO peppol_lookups (participant, state, smp, checked_at) VALUES (?1, ?2, ?3, ?4) ON CONFLICT (participant) DO UPDATE SET state = ?2, smp = ?3, checked_at = ?4')
    .bind(participant, fresh.state, fresh.state === 'found' ? fresh.smp : null, now())
    .run()
  return fresh
}

/** The customer's participant: a Slovak company by its DIČ or IČ DPH; nobody else is addressed this way yet. */
export function customerParticipant(invoice: Pick<StoredInvoice, 'customerDic' | 'customerIcdph' | 'customerCountry'>): string | null {
  if (customerCountryOf(invoice) !== 'SK') return null
  return slovakParticipant(invoice.customerDic, invoice.customerIcdph)
}

export const companyParticipant = (company: Pick<Company, 'dic' | 'icdph'>): string | null => slovakParticipant(company.dic, company.icdph)

/** Why an invoice cannot travel through Peppol now, or null when it can. */
export type Blocked = 'draft' | 'proforma' | 'sellerId' | 'customerId' | 'ended'

export function blockedOf(company: Company, invoice: StoredInvoice, today: string): Blocked | null {
  if (invoice.status !== 'issued' || !invoice.number) return 'draft'
  // A request for an advance is no tax document and no e-invoice (Peppol BIS carries invoices and credit notes).
  if (invoice.kind === 'proforma') return 'proforma'
  if (!companyParticipant(company)) return 'sellerId'
  if (!customerParticipant(invoice)) return 'customerId'
  if (!intakeOpen(company, today)) return 'ended'
  return null
}

export interface Sending {
  id: string
  state: 'queued' | 'sent' | 'delivered' | 'rejected' | 'failed'
  stateAt: number
  sentAt: number | null
  createdAt: number
  reason: string | null
  tries: number
  receiver: string
}

const sendingOf = (r: Record<string, unknown>): Sending => ({
  id: String(r.id),
  state: r.state as Sending['state'],
  stateAt: Number(r.state_at),
  sentAt: typeof r.sent_at === 'number' ? r.sent_at : null,
  createdAt: Number(r.created_at),
  reason: typeof r.reason === 'string' ? r.reason : null,
  tries: Number(r.tries ?? 0),
  receiver: String(r.receiver),
})

/** Every sending of an invoice, the newest first. */
export async function sendingsOf(db: D1Database, company: string, invoice: string): Promise<Sending[]> {
  const rows = await db.prepare('SELECT * FROM einvoice_sends WHERE company_id = ? AND invoice_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 20').bind(company, invoice).all<Record<string, unknown>>()
  return rows.results.map(sendingOf)
}

/** The state of each invoice's newest sending, for the list. */
export async function sendStates(db: D1Database, company: string): Promise<Map<string, Sending['state']>> {
  const rows = await db
    .prepare(
      `SELECT s.invoice_id, s.state FROM einvoice_sends s
        WHERE s.company_id = ?1 AND s.rowid = (SELECT MAX(x.rowid) FROM einvoice_sends x WHERE x.invoice_id = s.invoice_id AND x.company_id = ?1)
        ORDER BY s.created_at DESC LIMIT 2000`,
    )
    .bind(company)
    .all<{ invoice_id: string; state: Sending['state'] }>()
  return new Map(rows.results.map((r) => [r.invoice_id, r.state]))
}

export type QueueOutcome = { id: string; fresh: boolean } | { refused: Blocked | 'limit' }

/** Writes an invoice's sending down, once: a second click while one is live leads to it. */
export async function queueSend(db: D1Database, company: Company, invoice: StoredInvoice, user: string | null, today: string): Promise<QueueOutcome> {
  const blocked = blockedOf(company, invoice, today)
  if (blocked) return { refused: blocked }
  const live = await db.prepare("SELECT id FROM einvoice_sends WHERE invoice_id = ? AND company_id = ? AND state IN ('queued', 'sent', 'delivered')").bind(invoice.id, company.id).first<{ id: string }>()
  if (live) return { id: live.id, fresh: false }
  const day = await db.prepare('SELECT COUNT(*) AS n FROM einvoice_sends WHERE company_id = ? AND created_at > ?').bind(company.id, now() - 86400).first<{ n: number }>()
  if ((day?.n ?? 0) >= SENDS_PER_DAY) return { refused: 'limit' }
  const xml = ublOf(invoice, await invoiceLines(db, invoice.id), company)
  const id = crypto.randomUUID()
  const ts = now()
  const kind: SendKind = invoice.kind === 'credit' ? 'credit' : 'invoice'
  const results = await db.batch([
    db
      .prepare(
        `INSERT INTO einvoice_sends (id, company_id, invoice_id, created_at, created_by, sender, receiver, kind, sha256, state, state_at, next_at)
          SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'queued', ?4, ?4
          WHERE NOT EXISTS (SELECT 1 FROM einvoice_sends WHERE invoice_id = ?3 AND state IN ('queued', 'sent', 'delivered'))`,
      )
      .bind(id, company.id, invoice.id, ts, user, companyParticipant(company), customerParticipant(invoice), kind, await sha256Hex(xml)),
    eventStatement(db, { company: company.id, user, action: 'einvoice.queued', subject: invoice.id }),
  ])
  if (!results[0]?.meta.changes) {
    const again = await db.prepare("SELECT id FROM einvoice_sends WHERE invoice_id = ? AND company_id = ? AND state IN ('queued', 'sent', 'delivered')").bind(invoice.id, company.id).first<{ id: string }>()
    if (again) return { id: again.id, fresh: false }
  }
  return { id, fresh: true }
}

/**
 * Hands a queued sending to the postman. The e-invoice is written again from the invoice as it stands (an issued
 * invoice does not change) and must be the one recorded; then the postman's answer moves the state: taken, refused
 * for good, or tried again later. Two runs at once send it once: the provider is asked under the same key.
 */
export async function trySend(db: D1Database, provider: PeppolProvider, sendId: string): Promise<Sending['state'] | null> {
  const row = await db.prepare("SELECT * FROM einvoice_sends WHERE id = ? AND state = 'queued'").bind(sendId).first<Record<string, unknown>>()
  if (!row) return null
  const company = await db.prepare(`SELECT ${COMPANY_COLUMNS} FROM companies c LEFT JOIN users acc ON acc.id = c.accountant_id WHERE c.id = ? AND c.closed_at IS NULL`).bind(row.company_id).first<Record<string, unknown>>()
  const invoice = company ? await getInvoice(db, String(row.company_id), String(row.invoice_id)) : null
  const fail = async (reason: string) => {
    await db.batch([
      db.prepare("UPDATE einvoice_sends SET state = 'failed', state_at = ?2, reason = ?3, next_at = NULL WHERE id = ?1 AND state = 'queued'").bind(sendId, now(), reason),
      eventStatement(db, { company: String(row.company_id), user: null, action: 'einvoice.failed', subject: String(row.invoice_id), detail: { reason } }),
    ])
    return 'failed' as const
  }
  if (!company || !invoice) return fail('Faktúra alebo firma už nie je k dispozícii.')
  const seller = companyOf(company)
  const xml = ublOf(invoice, await invoiceLines(db, invoice.id), seller)
  if ((await sha256Hex(xml)) !== row.sha256) return fail('Faktúra sa od zaradenia na odoslanie zmenila.')
  const tries = Number(row.tries ?? 0) + 1
  const outcome = await provider.send({ id: sendId, sender: String(row.sender), receiver: String(row.receiver), kind: row.kind as SendKind, xml })
  if (outcome.ok) {
    await db.batch([
      db.prepare("UPDATE einvoice_sends SET state = 'sent', state_at = ?2, sent_at = ?2, provider = ?3, ref = ?4, tries = ?5, next_at = NULL, reason = NULL WHERE id = ?1 AND state = 'queued'").bind(sendId, now(), provider.name, outcome.ref, tries),
      eventStatement(db, { company: String(row.company_id), user: null, action: 'einvoice.sent', subject: String(row.invoice_id) }),
    ])
    return 'sent'
  }
  const wait = WAITS[tries - 1]
  if (!outcome.retry || wait === undefined) return fail(outcome.reason)
  await db.prepare("UPDATE einvoice_sends SET tries = ?2, next_at = ?3, reason = ?4 WHERE id = ?1 AND state = 'queued'").bind(sendId, tries, now() + wait, outcome.reason).run()
  return 'queued'
}

/** The schedule: sendings whose next try has come, a few at a time. */
export async function sendDue(db: D1Database, provider: PeppolProvider, limit = 25): Promise<void> {
  const due = await db.prepare("SELECT id FROM einvoice_sends WHERE state = 'queued' AND next_at <= ? ORDER BY next_at LIMIT ?").bind(now(), limit).all<{ id: string }>()
  for (const { id } of due.results) {
    try {
      await trySend(db, provider, id)
    } catch (err) {
      console.error('peppol send', err instanceof Error ? err.name : 'error')
    }
  }
}

/** The company a participant is: a client's or a workspace's, open, with that DIČ; none when two would match. */
async function companyOfParticipant(db: D1Database, participant: string): Promise<Company | null> {
  const m = /^0245:(\d{10})$/.exec(participant)
  if (!m) return null
  const rows = await db
    .prepare(`SELECT ${COMPANY_COLUMNS} FROM companies c LEFT JOIN users acc ON acc.id = c.accountant_id WHERE c.closed_at IS NULL AND (c.dic = ?1 OR c.icdph = 'SK' || ?1) LIMIT 2`)
    .bind(m[1])
    .all<Record<string, unknown>>()
  const only = rows.results.length === 1 ? rows.results[0] : undefined
  return only ? companyOf(only) : null
}

export interface EventsOutcome {
  status: number
  received: number
  unknown: number
}

/** What the postman told us: states of sendings, and e-invoices delivered to our companies. */
export async function applyEvents(env: AppBindings, provider: PeppolProvider, events: ProviderEvent[], later: (work: Promise<unknown>) => void): Promise<EventsOutcome> {
  const db = env.DB
  const out: EventsOutcome = { status: 0, received: 0, unknown: 0 }
  for (const e of events) {
    if (e.type === 'status') {
      const row = await db.prepare("SELECT id, company_id, invoice_id FROM einvoice_sends WHERE provider = ? AND ref = ? AND state = 'sent'").bind(provider.name, e.ref).first<{ id: string; company_id: string; invoice_id: string }>()
      if (!row) continue
      await db.batch([
        db.prepare("UPDATE einvoice_sends SET state = ?2, state_at = ?3, reason = ?4 WHERE id = ?1 AND state = 'sent'").bind(row.id, e.state, now(), e.state === 'rejected' ? (e.reason ?? 'Odberateľ faktúru odmietol.') : null),
        eventStatement(db, { company: row.company_id, user: null, action: `einvoice.${e.state}`, subject: row.invoice_id }),
      ])
      out.status++
      continue
    }
    // A delivery the network repeats is one.
    if (await db.prepare('SELECT 1 AS x FROM einvoice_received WHERE provider = ? AND ref = ?').bind(provider.name, e.ref).first()) continue
    const company = await companyOfParticipant(db, e.receiver)
    if (!company) {
      out.unknown++
      continue
    }
    const bytes = new TextEncoder().encode(e.xml)
    const hash = await sha256Hex(e.xml)
    const id = crypto.randomUUID()
    const reading = readInvoice(e.xml, company.ico)
    let documentId: string | null = null
    let fileKey: string | null = null
    if (!company.invoicingOnly && intakeOpen(company, bratislavaDay(now()))) {
      const { kept, work } = await keepFilesFor(env, company, { user: null, source: 'einvoice', sender: e.sender }, [{ name: `e-faktura-${e.ref}.xml`.slice(0, 120), kind: 'xml', bytes }], null)
      documentId = kept.ids[0] ?? null
      if (work) later(work)
    }
    // A workspace of invoicing keeps what it receives apart from documents (a list to read and pay); so does a company
    // whose contract ended, as evidence of what came.
    if (!documentId && env.FILES) {
      fileKey = `companies/${company.id}/einvoices/${id}.xml`
      await env.FILES.put(fileKey, bytes, { httpMetadata: { contentType: 'application/xml' } })
    }
    await db.batch([
      db
        .prepare(
          `INSERT OR IGNORE INTO einvoice_received (id, company_id, provider, ref, received_at, sender, receiver, sha256, file_key, document_id,
             kind, party, party_iban, number, vs, issued_on, due_on, total_cents, currency)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19)`,
        )
        .bind(
          id, company.id, provider.name, e.ref, now(), e.sender, e.receiver, hash, fileKey, documentId,
          reading?.kind ?? null, reading?.party ?? null, reading?.partyIban ?? null, reading?.number ?? null, reading?.vs ?? null,
          reading?.issuedOn ?? null, reading?.dueOn ?? null, reading?.totalCents ?? null, reading?.currency ?? null,
        ),
      eventStatement(db, { company: company.id, user: null, action: 'einvoice.received', subject: documentId ?? id }),
    ])
    out.received++
  }
  return out
}

// ---------------------------------------------------------------------------------------------------------------
// What a workspace received
// ---------------------------------------------------------------------------------------------------------------

export interface Received {
  id: string
  receivedAt: number
  party: string | null
  partyIban: string | null
  number: string | null
  vs: string | null
  issuedOn: string | null
  dueOn: string | null
  totalCents: number | null
  currency: string | null
  paidOn: string | null
  fileKey: string | null
  documentId: string | null
}

const receivedOf = (r: Record<string, unknown>): Received => {
  const str = (v: unknown) => (typeof v === 'string' ? v : null)
  return {
    id: String(r.id),
    receivedAt: Number(r.received_at),
    party: str(r.party),
    partyIban: str(r.party_iban),
    number: str(r.number),
    vs: str(r.vs),
    issuedOn: str(r.issued_on),
    dueOn: str(r.due_on),
    totalCents: typeof r.total_cents === 'number' ? r.total_cents : null,
    currency: str(r.currency),
    paidOn: str(r.paid_on),
    fileKey: str(r.file_key),
    documentId: str(r.document_id),
  }
}

/** A company's received e-invoices, the unpaid first, then the newest. */
export async function receivedList(db: D1Database, company: string): Promise<Received[]> {
  const rows = await db
    .prepare('SELECT * FROM einvoice_received WHERE company_id = ? ORDER BY paid_on IS NOT NULL, COALESCE(due_on, issued_on) ASC, received_at DESC LIMIT 500')
    .bind(company)
    .all<Record<string, unknown>>()
  return rows.results.map(receivedOf)
}

export async function receivedOne(db: D1Database, company: string, id: string): Promise<Received | null> {
  const row = await db.prepare('SELECT * FROM einvoice_received WHERE company_id = ? AND id = ?').bind(company, id).first<Record<string, unknown>>()
  return row ? receivedOf(row) : null
}

export function receivedPaidStatements(db: D1Database, company: string, id: string, day: string | null, user: string): D1PreparedStatement[] {
  return [
    db.prepare('UPDATE einvoice_received SET paid_on = ?3 WHERE company_id = ?1 AND id = ?2').bind(company, id, day),
    eventStatement(db, { company, user, action: day ? 'einvoice.paid' : 'einvoice.unpaid', subject: id }),
  ]
}

/** How many received e-invoices of a company wait to be paid. */
export async function receivedUnpaid(db: D1Database, company: string): Promise<number> {
  const row = await db.prepare('SELECT COUNT(*) AS n FROM einvoice_received WHERE company_id = ? AND paid_on IS NULL AND file_key IS NOT NULL').bind(company).first<{ n: number }>()
  return row?.n ?? 0
}
