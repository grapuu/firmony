// The postman's work inside Firmony (26 October 2026): who can receive (kept a short while), which company a
// participant is, an e-invoice sent with its state, what the network delivered. Every query names the company it works
// for.
//
// A company sends and receives through us only once it is bound to its participant. A binding comes from the postman's
// notice that the company chose Firmony on the Financial Administration's portal, where its representative signs in
// with eID: typing somebody's DIČ into a free workspace sends and receives nothing. A client of ours (a contract, its
// identity checked) is bound by the notice itself; a free workspace only after the administrator confirms that it is
// that company. A notice no company can take is kept for the administrator, never answered as taken and lost.
import { now, sha256Hex } from '../db'
import { customerCountryOf, getInvoice, invoiceLines, ublOf, type StoredInvoice } from '../app/invoices'
import { intakeOpen, serviceOpen } from '../app/ending'
import { keepFilesFor } from '../app/intake'
import type { AppBindings } from '../app/routes'
import { COMPANY_COLUMNS, companyOf, documentByHash, eventStatement, type Company } from '../app/store'
import { fileHash } from '../app/read'
import { bratislavaDay } from '../time'
import { readInvoice } from '../app/xml'
import { lookupParticipant, slovakParticipant, smlName, type Lookup } from './participant'
import type { PeppolProvider, ProviderEvent, SendKind } from './provider'

/** How long the SML's answer is kept, at most (the privacy notice says three days); a missing one may come any day. */
export const FOUND_SECONDS = 3 * 86400
const MISSING_SECONDS = 6 * 3600
/** Tries of one sending before it is said to have failed, and the waits between them. */
const WAITS = [60, 300, 900, 3600, 3 * 3600, 6 * 3600, 12 * 3600]
/** A sending claimed by a run is left to it this long before another may try it. */
const CLAIM_SECONDS = 120
/** E-invoices a day: a client's company, a free workspace, and all free workspaces together (the postman bills each). */
export const SENDS_PER_DAY = 300
export const WORKSPACE_SENDS_PER_DAY = 50
export const WORKSPACES_SENDS_PER_DAY = 2000
/** A handled notice the administrator saw is kept a year, with the e-invoice it brought. */
const UNROUTED_KEPT_SECONDS = 365 * 86400

/** The key a participant's answer is kept under: the SML's own name for it, a hash, never the DIČ in clear. */
const lookupKey = async (participant: string): Promise<string> => (await smlName(participant)).split('.')[0] as string

/** The SML's answer for a participant, from what we kept or asked afresh; an unknown answer is not kept. */
export async function participantState(db: D1Database, participant: string, fetcher: typeof fetch = fetch): Promise<Lookup> {
  const name = await lookupKey(participant)
  const kept = await db.prepare('SELECT state, smp, checked_at FROM peppol_lookups WHERE name = ?').bind(name).first<{ state: 'found' | 'missing'; smp: string | null; checked_at: number }>()
  const age = kept ? now() - kept.checked_at : Infinity
  const answer = (k: NonNullable<typeof kept>): Lookup => (k.state === 'found' ? { state: 'found', smp: k.smp } : { state: 'missing' })
  if (kept && age < (kept.state === 'found' ? FOUND_SECONDS : MISSING_SECONDS)) return answer(kept)
  const fresh = await lookupParticipant(participant, fetcher)
  // The SML not answering: what we knew counts while it is younger than anything is kept at all.
  if (fresh.state === 'unknown') return kept && age < FOUND_SECONDS ? answer(kept) : fresh
  await db
    .prepare('INSERT INTO peppol_lookups (name, state, smp, checked_at) VALUES (?1, ?2, ?3, ?4) ON CONFLICT (name) DO UPDATE SET state = ?2, smp = ?3, checked_at = ?4')
    .bind(name, fresh.state, fresh.state === 'found' ? fresh.smp : null, now())
    .run()
  return fresh
}

/** The customer's participant: a Slovak company by its DIČ or IČ DPH; nobody else is addressed this way yet. */
export function customerParticipant(invoice: Pick<StoredInvoice, 'customerDic' | 'customerIcdph' | 'customerCountry'>): string | null {
  if (customerCountryOf(invoice) !== 'SK') return null
  return slovakParticipant(invoice.customerDic, invoice.customerIcdph)
}

export const companyParticipant = (company: Pick<Company, 'dic' | 'icdph'>): string | null => slovakParticipant(company.dic, company.icdph)

/** The participant a company is bound to, when the postman told us it chose Firmony (and, a workspace, we confirmed it). */
export async function bindingOf(db: D1Database, company: string): Promise<string | null> {
  const row = await db.prepare('SELECT participant FROM peppol_bindings WHERE company_id = ?').bind(company).first<{ participant: string }>()
  return row?.participant ?? null
}

/**
 * Whether the postman told us that this company chose Firmony and the administrator still confirms it: only a
 * registration recorded for the company itself, so nobody learns of another company's by typing its DIČ.
 */
export async function bindingWaits(db: D1Database, company: Pick<Company, 'id' | 'dic' | 'icdph'>): Promise<boolean> {
  const participant = companyParticipant(company)
  if (!participant) return false
  const row = await db
    .prepare("SELECT 1 AS x FROM peppol_unrouted WHERE kind = 'registered' AND resolved_at IS NULL AND participant = ? AND company_id = ? LIMIT 1")
    .bind(participant, company.id)
    .first()
  return Boolean(row)
}

/** Why an invoice cannot travel through Peppol now, or null when it can. */
export type Blocked = 'draft' | 'proforma' | 'sellerId' | 'customerId' | 'ended' | 'unbound'

export function blockedOf(company: Company, invoice: StoredInvoice, today: string, bound: string | null): Blocked | null {
  if (invoice.status !== 'issued' || !invoice.number) return 'draft'
  // A request for an advance is no tax document and no e-invoice (Peppol BIS carries invoices and credit notes).
  if (invoice.kind === 'proforma') return 'proforma'
  const own = companyParticipant(company)
  if (!own) return 'sellerId'
  if (!customerParticipant(invoice)) return 'customerId'
  // After the contract's last day nothing goes out in the company's name through us.
  if (!serviceOpen(company, today)) return 'ended'
  if (bound !== own) return 'unbound'
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

/** A sending that stands: one is enough for an invoice. A rejected one is answered by a credit note, not by itself again. */
const LIVE = "state IN ('queued', 'sent', 'delivered', 'rejected')"

/** Writes an invoice's sending down, once: a second click while one stands leads to it. */
export async function queueSend(db: D1Database, company: Company, invoice: StoredInvoice, user: string | null, today: string): Promise<QueueOutcome> {
  const blocked = blockedOf(company, invoice, today, await bindingOf(db, company.id))
  if (blocked) return { refused: blocked }
  const live = await db.prepare(`SELECT id FROM einvoice_sends WHERE invoice_id = ? AND company_id = ? AND ${LIVE}`).bind(invoice.id, company.id).first<{ id: string }>()
  if (live) return { id: live.id, fresh: false }
  const since = now() - 86400
  const day = await db.prepare('SELECT COUNT(*) AS n FROM einvoice_sends WHERE company_id = ? AND created_at > ?').bind(company.id, since).first<{ n: number }>()
  if ((day?.n ?? 0) >= (company.invoicingOnly ? WORKSPACE_SENDS_PER_DAY : SENDS_PER_DAY)) return { refused: 'limit' }
  if (company.invoicingOnly) {
    const all = await db.prepare('SELECT COUNT(*) AS n FROM einvoice_sends s JOIN companies c ON c.id = s.company_id WHERE c.invoicing_only = 1 AND s.created_at > ?').bind(since).first<{ n: number }>()
    if ((all?.n ?? 0) >= WORKSPACES_SENDS_PER_DAY) return { refused: 'limit' }
  }
  const xml = ublOf(invoice, await invoiceLines(db, invoice.id), company)
  const id = crypto.randomUUID()
  const ts = now()
  const kind: SendKind = invoice.kind === 'credit' ? 'credit' : 'invoice'
  // Claimed by the click that made it (`next_at` ahead): the schedule leaves it to that click a while.
  const results = await db.batch([
    db
      .prepare(
        `INSERT INTO einvoice_sends (id, company_id, invoice_id, created_at, created_by, sender, receiver, kind, sha256, state, state_at, next_at)
          SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'queued', ?4, ?10
          WHERE NOT EXISTS (SELECT 1 FROM einvoice_sends WHERE invoice_id = ?3 AND ${LIVE})`,
      )
      .bind(id, company.id, invoice.id, ts, user, companyParticipant(company), customerParticipant(invoice), kind, await sha256Hex(xml), ts + CLAIM_SECONDS),
    eventStatement(db, { company: company.id, user, action: 'einvoice.queued', subject: invoice.id }),
  ])
  if (!results[0]?.meta.changes) {
    const again = await db.prepare(`SELECT id FROM einvoice_sends WHERE invoice_id = ? AND company_id = ? AND ${LIVE}`).bind(invoice.id, company.id).first<{ id: string }>()
    if (again) return { id: again.id, fresh: false }
  }
  return { id, fresh: true }
}

/**
 * Hands a queued sending to the postman. The schedule claims it first (two runs never ask the postman for it at once);
 * the click that made it holds it already. The e-invoice is written again from the invoice as it stands (an issued
 * invoice does not change) and must be the one recorded, and the company must still be bound with its contract open.
 * Then the postman's answer moves the state: taken, refused for good, or tried again later.
 */
export async function trySend(db: D1Database, provider: PeppolProvider, sendId: string, claim = false): Promise<Sending['state'] | null> {
  const ts = now()
  const row = claim
    ? await db
        .prepare("UPDATE einvoice_sends SET next_at = ?2 WHERE id = ?1 AND state = 'queued' AND next_at <= ?3 RETURNING *")
        .bind(sendId, ts + CLAIM_SECONDS, ts)
        .first<Record<string, unknown>>()
    : await db.prepare("SELECT * FROM einvoice_sends WHERE id = ? AND state = 'queued'").bind(sendId).first<Record<string, unknown>>()
  if (!row) return null
  const companyRow = await db.prepare(`SELECT ${COMPANY_COLUMNS} FROM companies c LEFT JOIN users acc ON acc.id = c.accountant_id WHERE c.id = ? AND c.closed_at IS NULL`).bind(row.company_id).first<Record<string, unknown>>()
  const invoice = companyRow ? await getInvoice(db, String(row.company_id), String(row.invoice_id)) : null
  const fail = async (reason: string) => {
    await db.batch([
      db.prepare("UPDATE einvoice_sends SET state = 'failed', state_at = ?2, reason = ?3, next_at = NULL WHERE id = ?1 AND state = 'queued'").bind(sendId, now(), reason.slice(0, 500)),
      eventStatement(db, { company: String(row.company_id), user: null, action: 'einvoice.failed', subject: String(row.invoice_id), detail: { reason: reason.slice(0, 200) } }),
    ])
    return 'failed' as const
  }
  if (!companyRow || !invoice) return fail('Faktúra alebo firma už nie je k dispozícii.')
  const seller = companyOf(companyRow)
  if (!serviceOpen(seller, bratislavaDay(ts))) return fail('Zmluva skončila, e-faktúry už cez Firmony neposielame.')
  if ((await bindingOf(db, seller.id)) !== row.sender) return fail('E-faktúry Vašej firmy už nejdú cez Firmony.')
  const xml = ublOf(invoice, await invoiceLines(db, invoice.id), seller)
  if ((await sha256Hex(xml)) !== row.sha256) return fail('Faktúra sa od zaradenia na odoslanie zmenila.')
  const tries = Number(row.tries ?? 0) + 1
  const outcome = await provider.send({ id: sendId, sender: String(row.sender), receiver: String(row.receiver), kind: row.kind as SendKind, xml })
  if (outcome.ok) {
    await db.batch([
      db.prepare("UPDATE einvoice_sends SET state = 'sent', state_at = ?2, sent_at = ?2, provider = ?3, ref = ?4, tries = ?5, next_at = NULL, reason = NULL WHERE id = ?1 AND state = 'queued'").bind(sendId, now(), provider.name, outcome.ref, tries),
      eventStatement(db, { company: String(row.company_id), user: null, action: 'einvoice.sent', subject: String(row.invoice_id) }),
    ])
    // The postman's word may have come before its answer reached us (a lost answer, a retry): it counts now.
    const pending = await db.prepare("SELECT state, reason FROM einvoice_status_pending WHERE provider = ? AND ref = ? ORDER BY state = 'rejected', at").bind(provider.name, outcome.ref).all<{ state: 'delivered' | 'rejected'; reason: string | null }>()
    for (const p of pending.results) await applyStatus(db, provider.name, outcome.ref, p.state, p.reason)
    if (pending.results.length > 0) await db.prepare('DELETE FROM einvoice_status_pending WHERE provider = ? AND ref = ?').bind(provider.name, outcome.ref).run()
    return 'sent'
  }
  const wait = WAITS[tries - 1]
  if (!outcome.retry || wait === undefined) return fail(outcome.reason)
  await db.prepare("UPDATE einvoice_sends SET tries = ?2, next_at = ?3, reason = ?4 WHERE id = ?1 AND state = 'queued'").bind(sendId, tries, now() + wait, outcome.reason.slice(0, 500)).run()
  return 'queued'
}

/** The schedule: sendings whose next try has come, a few at a time, each claimed before the postman is asked. */
export async function sendDue(db: D1Database, provider: PeppolProvider, limit = 25): Promise<void> {
  const due = await db.prepare("SELECT id FROM einvoice_sends WHERE state = 'queued' AND next_at <= ? ORDER BY next_at LIMIT ?").bind(now(), limit).all<{ id: string }>()
  for (const { id } of due.results) {
    try {
      await trySend(db, provider, id, true)
    } catch (err) {
      console.error('peppol send', err instanceof Error ? err.name : 'error')
    }
  }
}

/** A sending's state from the postman: delivered from sent, rejected from sent or delivered. Whether it moved. */
async function applyStatus(db: D1Database, provider: string, ref: string, state: 'delivered' | 'rejected', reason: string | null): Promise<boolean> {
  const from = state === 'delivered' ? "('sent')" : "('sent', 'delivered')"
  const row = await db.prepare(`SELECT id, company_id, invoice_id FROM einvoice_sends WHERE provider = ? AND ref = ? AND state IN ${from}`).bind(provider, ref).first<{ id: string; company_id: string; invoice_id: string }>()
  if (!row) return false
  await db.batch([
    db.prepare(`UPDATE einvoice_sends SET state = ?2, state_at = ?3, reason = ?4 WHERE id = ?1 AND state IN ${from}`).bind(row.id, state, now(), state === 'rejected' ? (reason ?? 'Odberateľ faktúru odmietol.').slice(0, 500) : null),
    eventStatement(db, { company: row.company_id, user: null, action: `einvoice.${state}`, subject: row.invoice_id }),
  ])
  return true
}

/** The open companies (no sample) with a participant's DIČ, as their DIČ or the digits of their IČ DPH. */
export async function companiesOfParticipant(db: D1Database, participant: string | null): Promise<Company[]> {
  const m = /^0245:(\d{10})$/.exec(participant ?? '')
  if (!m) return []
  const rows = await db
    .prepare(`SELECT ${COMPANY_COLUMNS} FROM companies c LEFT JOIN users acc ON acc.id = c.accountant_id WHERE c.closed_at IS NULL AND c.demo = 0 AND (c.dic = ?1 OR c.icdph = 'SK' || ?1) ORDER BY c.created_at LIMIT 10`)
    .bind(m[1])
    .all<Record<string, unknown>>()
  return rows.results.map(companyOf)
}

/**
 * Where an e-invoice for a participant goes: the company bound to it while it is open and still has that participant
 * (a DIČ typed again after the binding is no address), or why it goes nowhere.
 */
async function routeOf(db: D1Database, participant: string): Promise<{ company: Company } | { reason: 'unbound' | 'ended' | 'conflict'; company: string | null }> {
  const binding = await db.prepare('SELECT company_id FROM peppol_bindings WHERE participant = ?').bind(participant).first<{ company_id: string }>()
  if (!binding) return { reason: 'unbound', company: null }
  const row = await db
    .prepare(`SELECT ${COMPANY_COLUMNS} FROM companies c LEFT JOIN users acc ON acc.id = c.accountant_id WHERE c.id = ? AND c.closed_at IS NULL`)
    .bind(binding.company_id)
    .first<Record<string, unknown>>()
  if (!row) return { reason: 'ended', company: binding.company_id }
  const company = companyOf(row)
  if (companyParticipant(company) !== participant) return { reason: 'conflict', company: company.id }
  if (!company.invoicingOnly && !intakeOpen(company, bratislavaDay(now()))) return { reason: 'ended', company: company.id }
  return { company }
}

type UnroutedKind = 'received' | 'registered' | 'event'
type UnroutedReason = 'unbound' | 'unverified' | 'ambiguous' | 'unknown' | 'conflict' | 'ended' | 'error'

function unroutedStatement(db: D1Database, provider: string, e: { ref?: string | null; kind: UnroutedKind; participant?: string | null; sender?: string | null; reason: UnroutedReason; company?: string | null; fileKey?: string | null }): D1PreparedStatement {
  return db
    .prepare('INSERT INTO peppol_unrouted (id, at, provider, ref, kind, participant, sender, reason, company_id, file_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(crypto.randomUUID(), now(), provider, e.ref?.slice(0, 200) ?? null, e.kind, e.participant?.slice(0, 64) ?? null, e.sender?.slice(0, 64) ?? null, e.reason, e.company ?? null, e.fileKey ?? null)
}

/**
 * Whether the same notice of the postman was kept already (it repeats a notice it thinks we did not take). A notice
 * that failed is no answer: when it comes again, it is tried again.
 */
async function unroutedSeen(db: D1Database, provider: string, ref: string, kind: UnroutedKind): Promise<boolean> {
  return Boolean(await db.prepare("SELECT 1 AS x FROM peppol_unrouted WHERE provider = ? AND ref = ? AND kind = ? AND reason <> 'error' LIMIT 1").bind(provider, ref, kind).first())
}

const cut = (v: string | null | undefined, n: number): string | null => (v ? v.slice(0, n) : null)

/**
 * Whether the network's sender is not the supplier the e-invoice names: its Peppol address differs, either is missing,
 * or a Slovak sender's DIČ is not the one in the supplier's VAT number. Shown, and then no account of it is offered.
 */
export function senderMismatch(sender: string | null, endpoint: string | null, supplierVatId: string | null | undefined): boolean {
  if (!sender || !endpoint || sender.toLowerCase() !== endpoint.toLowerCase()) return true
  const own = /^0245:(\d{10})$/.exec(sender)?.[1]
  const vat = /^SK(\d{10})$/.exec((supplierVatId ?? '').replace(/\s/g, '').toUpperCase())?.[1]
  return Boolean(own && vat && own !== vat)
}

interface Incoming {
  ref: string
  sender: string | null
  receiver: string
  xml: string
}

/**
 * One e-invoice handed to its company: a client's document (read by our code), or a workspace's received invoice kept
 * apart. Once: the postman's reference is unique. A failed notice of the same reference kept for the administrator is
 * settled by it.
 */
async function receiveFor(env: AppBindings, provider: string, company: Company, e: Incoming, later: (work: Promise<unknown>) => void): Promise<void> {
  const db = env.DB
  const id = crypto.randomUUID()
  const bytes = new TextEncoder().encode(e.xml)
  const hash = await sha256Hex(e.xml)
  const reading = readInvoice(e.xml, company.ico)
  const endpoint = reading?.supplierEndpoint ?? null
  const mismatch = senderMismatch(e.sender, endpoint, reading?.partyVatId)
  let documentId: string | null = null
  let fileKey: string | null = null
  if (!company.invoicingOnly) {
    const { kept, work } = await keepFilesFor(env, company, { user: null, source: 'einvoice', sender: e.sender }, [{ name: `e-faktura-${e.ref}.xml`.slice(0, 120), kind: 'xml', bytes }], null)
    // The same file among the documents already (a notice that came again after a failure, or sent twice): that one.
    documentId = kept.ids[0] ?? (kept.known.length > 0 ? await documentByHash(db, company.id, await fileHash(bytes)) : null)
    if (work) later(work)
    // Money goes only where the supplier who sent it says: an account of an e-invoice another participant sent is
    // not offered to a payment order; the accountant types it after checking.
    if (documentId && mismatch) await db.prepare('UPDATE documents SET party_iban = NULL WHERE id = ? AND company_id = ?').bind(documentId, company.id).run()
  }
  // A workspace of invoicing keeps what it receives apart from documents: a list to read and pay.
  if (company.invoicingOnly && env.FILES) {
    fileKey = `companies/${company.id}/einvoices/${id}.xml`
    await env.FILES.put(fileKey, bytes, { httpMetadata: { contentType: 'application/xml' } })
  }
  await db.batch([
    db
      .prepare(
        `INSERT OR IGNORE INTO einvoice_received (id, company_id, provider, ref, received_at, sender, receiver, sha256, file_key, document_id,
           kind, prepaid, supplier_endpoint, mismatch, party, party_iban, number, vs, issued_on, due_on, total_cents, currency)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22)`,
      )
      .bind(
        id, company.id, provider, e.ref, now(), e.sender, e.receiver, hash, fileKey, documentId,
        reading?.kind ?? null, reading?.prepaid ? 1 : 0, endpoint, mismatch ? 1 : 0, cut(reading?.party, 200), reading?.partyIban ?? null,
        reading?.number ?? null, reading?.vs ?? null, reading?.issuedOn ?? null, reading?.dueOn ?? null, reading?.totalCents ?? null, reading?.currency ?? null,
      ),
    eventStatement(db, { company: company.id, user: null, action: 'einvoice.received', subject: documentId ?? id }),
    db.prepare("UPDATE peppol_unrouted SET resolved_at = ?3, resolved_by = 'firmony' WHERE provider = ?1 AND ref = ?2 AND kind = 'received' AND resolved_at IS NULL").bind(provider, e.ref, now()),
  ])
}

/** Keeps a received e-invoice for the administrator, with the file itself: delivered to us, it must reach somebody. */
async function keepUnrouted(env: AppBindings, provider: string, e: Incoming, reason: UnroutedReason, company: string | null): Promise<void> {
  const id = crypto.randomUUID()
  let fileKey: string | null = null
  if (env.FILES) {
    fileKey = `peppol/unrouted/${id}.xml`
    await env.FILES.put(fileKey, new TextEncoder().encode(e.xml), { httpMetadata: { contentType: 'application/xml' } })
  }
  // A failed notice that comes again replaces its row: one line a reference for the administrator.
  if (reason === 'error') {
    const old = await env.DB.prepare("SELECT id, file_key FROM peppol_unrouted WHERE provider = ? AND ref = ? AND kind = 'received' AND reason = 'error' AND resolved_at IS NULL").bind(provider, e.ref).all<{ id: string; file_key: string | null }>()
    for (const row of old.results) {
      if (row.file_key && env.FILES) await env.FILES.delete(row.file_key)
      await env.DB.prepare('DELETE FROM peppol_unrouted WHERE id = ?').bind(row.id).run()
    }
  }
  await env.DB.batch([unroutedStatement(env.DB, provider, { ref: e.ref, kind: 'received', participant: e.receiver, sender: e.sender, reason, company, fileKey })])
}

export interface EventsOutcome {
  status: number
  received: number
  registered: number
  unrouted: number
  /** Events that failed: the notice is answered 503 so the postman sends it again; every step repeats safely. */
  failed: number
}

/**
 * What the postman told us: registrations, states of sendings, and e-invoices delivered to our companies. Each event
 * is handled apart, so one that fails does not stop the rest; a failure is kept for the administrator (with its
 * e-invoice) and the notice is answered so that the postman sends it again. A status of a sending whose reference we
 * have not recorded yet waits until it is. No company is bound by a notice alone: the administrator confirms it.
 */
export async function applyEvents(env: AppBindings, provider: PeppolProvider, events: ProviderEvent[], later: (work: Promise<unknown>) => void): Promise<EventsOutcome> {
  const db = env.DB
  const out: EventsOutcome = { status: 0, received: 0, registered: 0, unrouted: 0, failed: 0 }
  for (const e of events) {
    try {
      if (e.type === 'status') {
        if (await applyStatus(db, provider.name, e.ref, e.state, e.reason)) {
          out.status++
          continue
        }
        await db.prepare('INSERT OR IGNORE INTO einvoice_status_pending (provider, ref, state, reason, at) VALUES (?, ?, ?, ?, ?)').bind(provider.name, e.ref, e.state, e.reason?.slice(0, 500) ?? null, now()).run()
        // The sending may have got its reference between the two steps: asked once more, the word is not left waiting.
        if (await applyStatus(db, provider.name, e.ref, e.state, e.reason)) {
          await db.prepare('DELETE FROM einvoice_status_pending WHERE provider = ? AND ref = ? AND state = ?').bind(provider.name, e.ref, e.state).run()
          out.status++
        }
        continue
      }
      if (e.type === 'unregistered') {
        const bound = await db.prepare('SELECT company_id FROM peppol_bindings WHERE participant = ? AND provider = ?').bind(e.participant, provider.name).first<{ company_id: string }>()
        await db.batch([
          db.prepare('DELETE FROM peppol_bindings WHERE participant = ? AND provider = ?').bind(e.participant, provider.name),
          // A registration still waiting for the administrator is settled: the company left before it was confirmed.
          db.prepare("UPDATE peppol_unrouted SET resolved_at = ?2, resolved_by = 'postman' WHERE participant = ?1 AND kind = 'registered' AND resolved_at IS NULL").bind(e.participant, now()),
          ...(bound ? [eventStatement(db, { company: bound.company_id, user: null, action: 'peppol.unbound', subject: e.participant })] : []),
        ])
        out.registered++
        continue
      }
      if (e.type === 'registered') {
        if (await unroutedSeen(db, provider.name, e.ref, 'registered')) continue
        out.registered++
        const companies = await companiesOfParticipant(db, e.participant)
        const taken = await db.prepare('SELECT company_id FROM peppol_bindings WHERE participant = ?').bind(e.participant).first<{ company_id: string }>()
        const only = companies.length === 1 ? companies[0] : undefined
        if (only && taken?.company_id === only.id) continue
        // A company holds one participant: one bound under another DIČ before is the administrator's to settle.
        const other = only ? await bindingOf(db, only.id) : null
        const reason: UnroutedReason = companies.length === 0 ? 'unknown' : !only ? 'ambiguous' : taken || other ? 'conflict' : 'unverified'
        await db.batch([unroutedStatement(db, provider.name, { ref: e.ref, kind: 'registered', participant: e.participant, reason, company: only?.id ?? null })])
        out.unrouted++
        continue
      }
      // A delivery the network repeats is one.
      if (await db.prepare('SELECT 1 AS x FROM einvoice_received WHERE provider = ? AND ref = ?').bind(provider.name, e.ref).first()) continue
      if (await unroutedSeen(db, provider.name, e.ref, 'received')) continue
      const route = await routeOf(db, e.receiver)
      if ('reason' in route) {
        await keepUnrouted(env, provider.name, e, route.reason, route.company)
        out.unrouted++
        continue
      }
      await receiveFor(env, provider.name, route.company, e, later)
      out.received++
    } catch (err) {
      console.error('peppol event', err instanceof Error ? err.name : 'error')
      out.failed++
      try {
        if (e.type === 'received') await keepUnrouted(env, provider.name, e, 'error', null)
        else if (!(await db.prepare("SELECT 1 AS x FROM peppol_unrouted WHERE provider = ? AND ref = ? AND reason = 'error' AND resolved_at IS NULL").bind(provider.name, e.ref).first())) {
          await db.batch([unroutedStatement(db, provider.name, { ref: e.ref, kind: 'event', participant: e.type === 'status' ? null : e.participant, reason: 'error' })])
        }
      } catch {
        // Nothing can be written now; the 503 brings the notice again.
      }
    }
  }
  return out
}

/** Events of a notice that could not be read: kept as one line for the administrator. */
export async function noteMalformed(db: D1Database, provider: string, count: number): Promise<void> {
  if (count <= 0) return
  await db.batch([unroutedStatement(db, provider, { ref: `nečitateľné: ${count}`, kind: 'event', reason: 'error' })])
}

// ---------------------------------------------------------------------------------------------------------------
// What the administrator sees and settles
// ---------------------------------------------------------------------------------------------------------------

export interface Unrouted {
  id: string
  at: number
  kind: UnroutedKind
  participant: string | null
  reason: UnroutedReason
  company: { id: string; name: string } | null
  fileKey: string | null
  /** The companies a registration may be bound to: those with its DIČ. */
  candidates: { id: string; name: string; ico: string | null; workspace: boolean; owner: string | null }[]
  /** For an e-invoice: the company it can be handed to now (bound, open, its contract running), if any. */
  deliverTo: string | null
}

/** What waits for the administrator, the oldest first (it has waited longest), and how many in all. */
export async function unroutedOpen(db: D1Database, limit = 100): Promise<{ list: Unrouted[]; total: number }> {
  const rows = await db
    .prepare('SELECT u.*, c.name AS company_name FROM peppol_unrouted u LEFT JOIN companies c ON c.id = u.company_id WHERE u.resolved_at IS NULL ORDER BY u.at LIMIT ?')
    .bind(limit)
    .all<Record<string, unknown>>()
  const total = (await db.prepare('SELECT COUNT(*) AS n FROM peppol_unrouted WHERE resolved_at IS NULL').first<{ n: number }>())?.n ?? 0
  const list: Unrouted[] = []
  for (const r of rows.results) {
    const participant = typeof r.participant === 'string' ? r.participant : null
    const candidates =
      r.kind === 'registered'
        ? await Promise.all(
            (await companiesOfParticipant(db, participant)).map(async (c) => ({
              id: c.id,
              name: c.name,
              ico: c.ico,
              workspace: c.invoicingOnly,
              owner: (await db.prepare("SELECT u.email FROM members m JOIN users u ON u.id = m.user_id WHERE m.company_id = ? AND m.role = 'owner' ORDER BY m.created_at LIMIT 1").bind(c.id).first<{ email: string }>())?.email ?? null,
            })),
          )
        : []
    const route = r.kind === 'received' && participant && typeof r.file_key === 'string' ? await routeOf(db, participant) : null
    list.push({
      id: String(r.id),
      at: Number(r.at),
      kind: r.kind as UnroutedKind,
      participant,
      reason: r.reason as UnroutedReason,
      company: typeof r.company_id === 'string' ? { id: r.company_id, name: typeof r.company_name === 'string' ? r.company_name : '' } : null,
      fileKey: typeof r.file_key === 'string' ? r.file_key : null,
      candidates,
      deliverTo: route && 'company' in route && route.company && typeof route.company === 'object' ? route.company.name : null,
    })
  }
  return { list, total }
}

interface UnroutedRow {
  id: string
  provider: string
  ref: string | null
  kind: UnroutedKind
  participant: string | null
  sender: string | null
  fileKey: string | null
  resolvedAt: number | null
}

export async function unroutedOne(db: D1Database, id: string): Promise<UnroutedRow | null> {
  const r = await db.prepare('SELECT id, provider, ref, kind, participant, sender, file_key, resolved_at FROM peppol_unrouted WHERE id = ?').bind(id).first<Record<string, unknown>>()
  const str = (v: unknown) => (typeof v === 'string' ? v : null)
  return r ? { id: String(r.id), provider: String(r.provider), ref: str(r.ref), kind: r.kind as UnroutedKind, participant: str(r.participant), sender: str(r.sender), fileKey: str(r.file_key), resolvedAt: typeof r.resolved_at === 'number' ? r.resolved_at : null } : null
}

/** The companies bound now, the newest first. */
export async function bindingsList(db: D1Database, limit = 200): Promise<{ participant: string; company: string; name: string; workspace: boolean; boundAt: number }[]> {
  const rows = await db
    .prepare('SELECT b.participant, b.company_id, b.bound_at, c.name, c.invoicing_only FROM peppol_bindings b JOIN companies c ON c.id = b.company_id ORDER BY b.bound_at DESC LIMIT ?')
    .bind(limit)
    .all<Record<string, unknown>>()
  return rows.results.map((r) => ({ participant: String(r.participant), company: String(r.company_id), name: String(r.name), workspace: r.invoicing_only === 1, boundAt: Number(r.bound_at) }))
}

export type DeliverOutcome = 'delivered' | 'nobody' | 'gone'

/**
 * An e-invoice kept for the administrator handed to the company bound to its participant now (after the binding, or
 * once a failure passed). The same checks as a notice: bound, open, the participant still the company's, the contract
 * running. Its kept file goes once the company has it.
 */
export async function deliverUnrouted(env: AppBindings, id: string, user: string, later: (work: Promise<unknown>) => void): Promise<DeliverOutcome> {
  const db = env.DB
  const row = await unroutedOne(db, id)
  if (!row || row.kind !== 'received' || row.resolvedAt !== null || !row.fileKey || !row.participant || !row.ref || !env.FILES) return 'gone'
  const route = await routeOf(db, row.participant)
  if ('reason' in route) return 'nobody'
  const object = await env.FILES.get(row.fileKey)
  if (!object) return 'gone'
  const incoming: Incoming = { ref: row.ref, sender: row.sender, receiver: row.participant, xml: await object.text() }
  if (!(await db.prepare('SELECT 1 AS x FROM einvoice_received WHERE provider = ? AND ref = ?').bind(row.provider, row.ref).first())) await receiveFor(env, row.provider, route.company, incoming, later)
  const settled = await db.prepare('UPDATE peppol_unrouted SET resolved_at = ?2, resolved_by = ?3 WHERE id = ?1').bind(id, now(), user).run()
  if (settled.meta.changes) await db.batch([eventStatement(db, { company: null, user, action: 'peppol.delivered', subject: row.ref, detail: { company: route.company.id } })])
  await env.FILES.delete(row.fileKey)
  return 'delivered'
}

export type BindOutcome = 'bound' | 'gone' | 'mismatch' | 'taken'

/**
 * The administrator binds a registration the postman told of to one company with its DIČ, after confirming that the
 * company is who chose Firmony on the portal. Only an open registration, only a company that still has that DIČ, only
 * a participant and a company nobody else holds; the registration is settled in the same batch. What came for the
 * participant meanwhile is handed to the company at once.
 */
export async function bindByAdmin(env: AppBindings, provider: string, unroutedId: string, companyId: string, user: string, later: (work: Promise<unknown>) => void): Promise<BindOutcome> {
  const db = env.DB
  const row = await unroutedOne(db, unroutedId)
  if (!row || row.kind !== 'registered' || row.resolvedAt !== null || !row.participant) return 'gone'
  const digits = /^0245:(\d{10})$/.exec(row.participant)?.[1]
  if (!digits || !(await companiesOfParticipant(db, row.participant)).some((c) => c.id === companyId)) return 'mismatch'
  const results = await db.batch([
    db
      .prepare(
        `INSERT INTO peppol_bindings (participant, company_id, provider, bound_at)
           SELECT ?1, ?2, ?3, ?4 WHERE NOT EXISTS (SELECT 1 FROM peppol_bindings WHERE participant = ?1 OR company_id = ?2)
             AND EXISTS (SELECT 1 FROM peppol_unrouted WHERE id = ?5 AND resolved_at IS NULL)
             AND EXISTS (SELECT 1 FROM companies WHERE id = ?2 AND closed_at IS NULL AND demo = 0 AND (dic = ?6 OR icdph = 'SK' || ?6))`,
      )
      .bind(row.participant, companyId, provider, now(), unroutedId, digits),
    db.prepare('UPDATE peppol_unrouted SET resolved_at = ?2, resolved_by = ?3 WHERE id = ?1 AND resolved_at IS NULL AND EXISTS (SELECT 1 FROM peppol_bindings WHERE participant = ?4 AND company_id = ?5)').bind(unroutedId, now(), user, row.participant, companyId),
  ])
  if (!results[0]?.meta.changes) {
    const same = await db.prepare('SELECT 1 AS x FROM peppol_bindings WHERE participant = ? AND company_id = ?').bind(row.participant, companyId).first()
    return same ? 'bound' : 'taken'
  }
  // Written apart from the company's own events, so that the record stays when a workspace is deleted.
  await db.batch([eventStatement(db, { company: null, user, action: 'peppol.bound', subject: row.participant, detail: { company: companyId } })])
  const waiting = await db.prepare("SELECT id FROM peppol_unrouted WHERE kind = 'received' AND participant = ? AND resolved_at IS NULL AND file_key IS NOT NULL ORDER BY at LIMIT 20").bind(row.participant).all<{ id: string }>()
  for (const w of waiting.results) {
    try {
      await deliverUnrouted(env, w.id, user, later)
    } catch (err) {
      console.error('peppol deliver', err instanceof Error ? err.name : 'error')
    }
  }
  return 'bound'
}

/** A notice settled by the administrator (read, handed on, or not ours). */
export async function resolveUnrouted(db: D1Database, id: string, user: string): Promise<boolean> {
  const res = await db.prepare('UPDATE peppol_unrouted SET resolved_at = ?2, resolved_by = ?3 WHERE id = ?1 AND resolved_at IS NULL').bind(id, now(), user).run()
  if (!res.meta.changes) return false
  await db.batch([eventStatement(db, { company: null, user, action: 'peppol.resolved', subject: id })])
  return true
}

/** The administrator ends a binding (a wrong company, the company left): it sends and receives through us no more. */
export async function unbindByAdmin(db: D1Database, companyId: string, user: string): Promise<boolean> {
  const row = await db.prepare('DELETE FROM peppol_bindings WHERE company_id = ? RETURNING participant').bind(companyId).first<{ participant: string }>()
  if (!row) return false
  await db.batch([eventStatement(db, { company: null, user, action: 'peppol.unbound', subject: row.participant, detail: { company: companyId, by: 'admin' } })])
  return true
}

/** What the postman's part keeps no longer: answers past three days, waiting statuses past a month, settled notices past a year. */
export async function purgePeppol(db: D1Database, files: R2Bucket | undefined): Promise<void> {
  const ts = now()
  const old = await db.prepare('SELECT id, file_key FROM peppol_unrouted WHERE resolved_at < ? ORDER BY resolved_at LIMIT 100').bind(ts - UNROUTED_KEPT_SECONDS).all<{ id: string; file_key: string | null }>()
  // A notice's e-invoice goes first; a row whose file could not go stays for the next run.
  const gone: string[] = []
  for (const row of old.results) {
    if (row.file_key) {
      if (!files) continue
      await files.delete(row.file_key)
    }
    gone.push(row.id)
  }
  await db.batch([
    db.prepare('DELETE FROM peppol_lookups WHERE checked_at < ?').bind(ts - FOUND_SECONDS),
    // A binding whose company no longer has that participant (its DIČ changed) or no longer is: nothing goes by it.
    db.prepare(
      `DELETE FROM peppol_bindings WHERE NOT EXISTS (SELECT 1 FROM companies c WHERE c.id = peppol_bindings.company_id AND c.closed_at IS NULL
         AND CASE WHEN c.dic GLOB '[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]' THEN '0245:' || c.dic ELSE '0245:' || substr(c.icdph, 3) END = peppol_bindings.participant)`,
    ),
    db.prepare('DELETE FROM einvoice_status_pending WHERE at < ?').bind(ts - 30 * 86400),
    db.prepare('DELETE FROM peppol_unrouted WHERE id IN (SELECT value FROM json_each(?))').bind(JSON.stringify(gone)),
  ])
}

// ---------------------------------------------------------------------------------------------------------------
// What a company received
// ---------------------------------------------------------------------------------------------------------------

export interface Received {
  id: string
  receivedAt: number
  /** An invoice to pay; a credit note or a prepayment invoice (already paid) asks for nothing. */
  payable: boolean
  credit: boolean
  prepaid: boolean
  /** The network's sender and the supplier the e-invoice names differ: said, and no QR code is offered. */
  mismatch: boolean
  sender: string | null
  supplierEndpoint: string | null
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
  const sender = str(r.sender)
  const prepaid = r.prepaid === 1
  return {
    id: String(r.id),
    receivedAt: Number(r.received_at),
    payable: r.kind === 'invoice_in' && !prepaid,
    credit: r.kind === 'other',
    prepaid,
    mismatch: r.mismatch === 1,
    sender,
    supplierEndpoint: str(r.supplier_endpoint),
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

const PAYABLE = "kind = 'invoice_in' AND prepaid = 0"

/** A company's received e-invoices kept apart from documents, those to pay first, then the newest. */
export async function receivedList(db: D1Database, company: string, limit = 500): Promise<Received[]> {
  const rows = await db
    .prepare(`SELECT * FROM einvoice_received WHERE company_id = ? AND file_key IS NOT NULL ORDER BY (paid_on IS NULL AND ${PAYABLE}) DESC, COALESCE(due_on, issued_on) ASC, received_at DESC LIMIT ?`)
    .bind(company, limit)
    .all<Record<string, unknown>>()
  return rows.results.map(receivedOf)
}

export async function receivedOne(db: D1Database, company: string, id: string): Promise<Received | null> {
  const row = await db.prepare('SELECT * FROM einvoice_received WHERE company_id = ? AND id = ? AND file_key IS NOT NULL').bind(company, id).first<Record<string, unknown>>()
  return row ? receivedOf(row) : null
}

export function receivedPaidStatements(db: D1Database, company: string, id: string, day: string | null, user: string): D1PreparedStatement[] {
  return [
    db.prepare(`UPDATE einvoice_received SET paid_on = ?3 WHERE company_id = ?1 AND id = ?2 AND ${PAYABLE}`).bind(company, id, day),
    eventStatement(db, { company, user, action: day ? 'einvoice.paid' : 'einvoice.unpaid', subject: id }),
  ]
}

/** How many received e-invoices of a company wait to be paid. */
export async function receivedUnpaid(db: D1Database, company: string): Promise<number> {
  const row = await db.prepare(`SELECT COUNT(*) AS n FROM einvoice_received WHERE company_id = ? AND paid_on IS NULL AND file_key IS NOT NULL AND ${PAYABLE}`).bind(company).first<{ n: number }>()
  return row?.n ?? 0
}
