import { accessOpenSql, archiveDueSql, AML_TODAY_SQL } from '../aml/retention'
import { autoReviewedSql } from '../aml/auto-review-model'
import { CURRENT_OFFICER_SQL } from '../aml/schema'
import { quoteSql } from '../aml/model'
// The accountants' side in the database. An accountant sees the companies she is assigned to; an administrator
// sees all of them. Every function that reads a company's things is given the user and checks it.
import { MAIL } from '../config'
import { now } from '../db'
import { type Category, type PaidBy } from '../app/booking'
import { CASH_PAID_COLUMN, PAID_ON_COLUMN, COMPANY_COLUMNS, DOC_FROM, MISSING, companyOf, docOf, type Company, type Doc, type Team, type User } from '../app/store'
import { POA_STATE_SQL, type PoaState } from '../app/papers'
import { DECLARATION_STATE_SQL, openReportsSql, type DeclarationState } from '../app/aml'

type Row = Record<string, unknown>

export function isAdmin(user: User): boolean {
  return user.team === 'admin'
}

/** Whether somebody of the team may see a company: an administrator always, an accountant only her own. */
export function canSee(user: User, company: Pick<Company, 'accountantId'> & { invoicingOnly?: boolean }): boolean {
  // A workspace of invoicing alone is nobody's of the team (app/invoicing.ts): it is no client.
  if (company.invoicingOnly) return false
  return user.team === 'admin' || (user.team === 'accountant' && company.accountantId === user.id)
}

/** The SQL that limits companies (alias c) to what a user of the team may see. */
export function visible(user: User, demo: boolean): { sql: string; binds: unknown[] } {
  const own = isAdmin(user) ? '' : 'AND c.accountant_id = ?'
  return { sql: `${accessOpenSql('c')} AND c.invoicing_only = 0 ${own} ${demo ? '' : 'AND c.demo = 0'}`, binds: isAdmin(user) ? [] : [user.id] }
}

/** Only an explicit personal reply closes the response clock. Filing notices, reminders and read receipts do
 * not answer a client's question, even when generated on behalf of a named accountant. The event and author
 * must belong to the same company/message. Stable ordering handles several messages within one second.
 * Restrict the CTE to visible companies before inspecting conversations.
 */
function unansweredSql(v: ReturnType<typeof visible>): string {
  return `WITH visible_companies AS (SELECT c.id FROM companies c WHERE ${v.sql}),
    answers AS (
      SELECT m.company_id, m.created_at, m.rowid AS seq,
        ROW_NUMBER() OVER (PARTITION BY m.company_id ORDER BY m.created_at DESC, m.rowid DESC) AS position
      FROM events e JOIN messages m ON m.id = e.subject AND m.company_id = e.company_id AND m.author = e.user_id
      JOIN visible_companies vc ON vc.id = m.company_id
      WHERE e.action = 'message.answered' AND m.side = 'firmony' AND m.author IS NOT NULL
    ), unanswered AS (
      SELECT m.id, m.company_id, m.created_at, m.body, m.author,
        ROW_NUMBER() OVER (PARTITION BY m.company_id ORDER BY m.created_at, m.rowid) AS position,
        COUNT(*) OVER (PARTITION BY m.company_id) AS pending_count
      FROM messages m JOIN visible_companies vc ON vc.id = m.company_id
      LEFT JOIN answers a ON a.company_id = m.company_id AND a.position = 1
      WHERE m.side = 'client' AND (a.company_id IS NULL OR m.created_at > a.created_at
        OR (m.created_at = a.created_at AND m.rowid > a.seq))
    )`
}

/** Point 10.4 of the terms: the books handed over and the power of attorney given up. Until both, the count is 0. */
export const POA_RESIGNED = 'poa.resigned'
export function handedOverSql(company: string): string {
  return `(CASE WHEN EXISTS (SELECT 1 FROM events ev WHERE ev.company_id = ${company}.id AND ev.action = '${POA_RESIGNED}')
    THEN (SELECT COUNT(*) FROM company_files f WHERE f.company_id = ${company}.id AND f.kind = 'handover' AND f.deleted_at IS NULL) ELSE 0 END)`
}

export interface ClientRow {
  company: Company
  missing: number
  toBook: number
  reading: number
  toCheck: number
  waiting: number | null
  /** Where the client's power of attorney stands. */
  poa: PoaState
  /** Where the client's declaration for the law against money laundering stands. */
  declaration: DeclarationState
  /** Internal reports about the client that the designated person has not decided yet. */
  openReports: number
  /** Files handed over at the end of the contract. */
  handover: number
}

export async function teamClients(db: D1Database, user: User, demo: boolean): Promise<ClientRow[]> {
  const v = visible(user, demo)
  const rows = await db
    .prepare(
      `${unansweredSql(v)} SELECT ${COMPANY_COLUMNS},
         (SELECT COUNT(*) FROM payments p WHERE p.company_id = c.id AND ${MISSING}) AS missing,
         (SELECT COUNT(*) FROM documents d WHERE d.company_id = c.id AND d.deleted_at IS NULL AND d.booked_at IS NULL AND d.status IN ('read', 'manual')) AS to_book,
         (SELECT COUNT(*) FROM documents d WHERE d.company_id = c.id AND d.deleted_at IS NULL AND d.status = 'reading') AS reading,
         (SELECT COUNT(*) FROM payments p WHERE p.company_id = c.id AND p.exempt IS NOT NULL AND p.checked_at IS NULL AND p.exempt_by <> 'auto')
           + (SELECT COUNT(*) FROM statements s WHERE s.company_id = c.id AND s.status = 'held') AS to_check,
         pending.created_at AS waiting,
         ${POA_STATE_SQL} AS poa,
         ${DECLARATION_STATE_SQL} AS declaration,
         ${openReportsSql(user.id)} AS open_reports,
         ${handedOverSql('c')} AS handover
       FROM companies c LEFT JOIN users acc ON acc.id = c.accountant_id
       JOIN visible_companies vc ON vc.id = c.id
       LEFT JOIN unanswered pending ON pending.company_id = c.id AND pending.position = 1
       ORDER BY c.name COLLATE NOCASE`,
    )
    .bind(...v.binds)
    .all<Row>()
  return rows.results.map((row) => ({
    company: companyOf(row),
    missing: Number(row.missing ?? 0),
    toBook: Number(row.to_book ?? 0),
    reading: Number(row.reading ?? 0),
    toCheck: Number(row.to_check ?? 0),
    waiting: typeof row.waiting === 'number' ? row.waiting : null,
    poa: row.poa === 'checked' ? 'checked' : row.poa === 'waiting' ? 'waiting' : 'missing',
    declaration: row.declaration === 'checked' ? 'checked' : row.declaration === 'waiting' ? 'waiting' : 'missing',
    openReports: Number(row.open_reports ?? 0),
    handover: Number(row.handover ?? 0),
  }))
}

/** Companies whose data were deleted after their contract, for the administrator: what the law keeps of them. */
export async function endedCompanies(db: D1Database, user: User): Promise<{ id: string; name: string; ico: string | null; endsOn: string; purgedAt: number }[]> {
  const rows = await db
    .prepare(`SELECT c.id, c.name, c.ico, c.ends_on, COALESCE(c.aml_archived_at,c.purged_at,unixepoch(date(c.ends_on,'+91 days')||'T00:00:00Z')) AS purged_at FROM companies c WHERE ${archiveDueSql('c', AML_TODAY_SQL)} AND c.demo = 0 AND ${quoteSql(user.id)} = ${CURRENT_OFFICER_SQL} ORDER BY c.ends_on DESC LIMIT 200`)
    .all<{ id: string; name: string; ico: string | null; ends_on: string; purged_at: number }>()
  return rows.results.map((r) => ({ id: r.id, name: r.name, ico: r.ico, endsOn: r.ends_on, purgedAt: r.purged_at }))
}

/**
 * A client with nothing waiting on anybody: nothing to book or check, no unanswered message, the power of attorney and
 * the identification checked, no open report, the books handed over when owed, and nothing of ours late or due within
 * a week (`pressing`, team/deadlines.ts).
 */
export function clientDone(row: ClientRow, owed: boolean, pressing: number): boolean {
  return row.toBook === 0 && row.toCheck === 0 && row.waiting === null && row.poa === 'checked' && row.declaration === 'checked' && row.openReports === 0 && !owed && pressing === 0
}

/** Emails the outbox gave up on in the last two weeks: a doorbell nobody heard, for the administrator to look into. */
export async function failedMail(db: D1Database): Promise<{ n: number; error: string | null }> {
  const row = await db
    .prepare('SELECT COUNT(*) AS n, MAX(error) AS error FROM outbox WHERE sent_at IS NULL AND attempts >= ? AND created_at > ?')
    .bind(MAIL.maxAttempts, now() - 14 * 86400)
    .first<{ n: number; error: string | null }>()
  return { n: Number(row?.n ?? 0), error: row?.error ?? null }
}

/**
 * A company somebody of the team may see, or null. A company whose data were deleted after its contract is seen only
 * by an administrator, and only where `ended` says so: what the law keeps of it (the identification and the risk).
 */
export async function teamCompany(db: D1Database, user: User, id: string, ended = false): Promise<Company | null> {
  const row = await db
    .prepare(`SELECT ${COMPANY_COLUMNS} FROM companies c LEFT JOIN users acc ON acc.id = c.accountant_id WHERE c.id = ?1 AND (${accessOpenSql('c')} OR (?2 = 1 AND ?3 = ${CURRENT_OFFICER_SQL}))`)
    .bind(id, ended ? 1 : 0, user.id)
    .first<Row>()
  const company = row ? companyOf(row) : null
  return company && canSee(user, company) ? company : null
}

export interface QueueDoc extends Doc {
  companyName: string
}

const DOC_COLUMNS_ALL = `d.*, ab.name AS added_by_name, COALESCE(bb.name, CASE WHEN d.booked_by = 'auto' THEN 'Firmony (samo)' END) AS booked_by_name, l.payment_id, l.how, ${CASH_PAID_COLUMN}, ${PAID_ON_COLUMN}`

/** Documents that wait to be booked, the oldest first: of one company, or of every company the user sees. */
export async function bookingQueue(db: D1Database, user: User, demo: boolean, company: string | null = null, limit = 300): Promise<QueueDoc[]> {
  const v = visible(user, demo)
  const rows = await db
    .prepare(
      `SELECT ${DOC_COLUMNS_ALL}, c.name AS company_name FROM ${DOC_FROM} JOIN companies c ON c.id = d.company_id
       WHERE d.deleted_at IS NULL AND d.booked_at IS NULL AND d.status IN ('read', 'manual') AND ${v.sql} ${company ? 'AND d.company_id = ?' : ''}
       ORDER BY d.created_at, d.id LIMIT ?`,
    )
    .bind(...v.binds, ...(company ? [company] : []), limit)
    .all<Row>()
  return rows.results.map((row) => ({ ...docOf(row), companyName: String(row.company_name) }))
}

/** A document somebody of the team may see, with its company. */
export async function teamDocument(db: D1Database, user: User, id: string): Promise<{ doc: Doc; company: Company } | null> {
  const row = await db.prepare(`SELECT ${DOC_COLUMNS_ALL} FROM ${DOC_FROM} WHERE d.id = ? AND d.deleted_at IS NULL`).bind(id).first<Row>()
  if (!row) return null
  const doc = docOf(row)
  const company = await teamCompany(db, user, doc.companyId)
  return company ? { doc, company } : null
}

export interface Thread {
  company: Company
  body: string
  at: number
  author: string | null
  pending: number
}

/** Oldest unanswered client message per visible company, longest waiting first. */
export async function waitingThreads(db: D1Database, user: User, demo: boolean): Promise<Thread[]> {
  const v = visible(user, demo)
  const rows = await db
    .prepare(
      `${unansweredSql(v)} SELECT ${COMPANY_COLUMNS}, m.body AS m_body, m.created_at AS m_at, u.name AS m_author, m.pending_count
       FROM companies c LEFT JOIN users acc ON acc.id = c.accountant_id
       JOIN unanswered m ON m.company_id = c.id AND m.position = 1
       LEFT JOIN users u ON u.id = m.author
       ORDER BY m.created_at, c.id`,
    )
    .bind(...v.binds)
    .all<Row>()
  return rows.results.map((row) => ({ company: companyOf(row), body: String(row.m_body), at: Number(row.m_at), author: typeof row.m_author === 'string' ? row.m_author : null, pending: Number(row.pending_count) }))
}

export interface ToCheck {
  id: string
  bookedOn: string
  amountCents: number
  party: string | null
  note: string | null
  exempt: string
  exemptNote: string | null
  byName: string | null
}

export async function paymentsToCheck(db: D1Database, company: string): Promise<ToCheck[]> {
  const rows = await db
    .prepare(
      `SELECT p.id, p.booked_on, p.amount_cents, p.party, p.note, p.exempt, p.exempt_note, u.name AS by_name
       FROM payments p LEFT JOIN users u ON u.id = p.exempt_by
       WHERE p.company_id = ? AND p.exempt IS NOT NULL AND p.checked_at IS NULL AND p.exempt_by <> 'auto' ORDER BY p.booked_on`,
    )
    .bind(company)
    .all<Row>()
  return rows.results.map((row) => ({
    id: String(row.id),
    bookedOn: String(row.booked_on),
    amountCents: Number(row.amount_cents),
    party: typeof row.party === 'string' ? row.party : null,
    note: typeof row.note === 'string' ? row.note : null,
    exempt: String(row.exempt),
    exemptNote: typeof row.exempt_note === 'string' ? row.exempt_note : null,
    byName: typeof row.by_name === 'string' ? row.by_name : null,
  }))
}

export interface Rule {
  key: string
  name: string | null
  category: Category
  vatDeduct: boolean
  uses: number
  /** The cost centre it gives the supplier's documents, by its code. */
  center?: string | null
}

export async function rulesOf(db: D1Database, company: string): Promise<Rule[]> {
  const rows = await db
    .prepare('SELECT r.key, r.name, r.category, r.vat_deduct, r.uses, cc.code AS center FROM supplier_rules r LEFT JOIN cost_centers cc ON cc.id = r.center_id WHERE r.company_id = ? ORDER BY r.uses DESC, r.name LIMIT 100')
    .bind(company)
    .all<Row>()
  return rows.results.map((row) => ({
    key: String(row.key),
    name: typeof row.name === 'string' ? row.name : null,
    category: String(row.category) as Category,
    vatDeduct: row.vat_deduct === 1,
    uses: Number(row.uses),
    center: typeof row.center === 'string' ? row.center : null,
  }))
}

export interface TeamMember {
  id: string
  name: string
  email: string
  team: Team
  clients: number
  /** Passkeys registered: without one the person cannot work in the team's part (an activation code first). */
  keys: number
}

export async function teamMembers(db: D1Database): Promise<TeamMember[]> {
  const rows = await db
    .prepare(
      `SELECT u.id, u.name, u.email, u.team, (SELECT COUNT(*) FROM companies c WHERE c.accountant_id = u.id AND c.closed_at IS NULL AND c.demo = 0) AS clients,
         (SELECT COUNT(*) FROM passkeys k WHERE k.user_id = u.id) AS keys FROM users u WHERE u.team IS NOT NULL ORDER BY u.name`,
    )
    .all<Row>()
  return rows.results.map((row) => ({ id: String(row.id), name: String(row.name), email: String(row.email), team: String(row.team) as Team, clients: Number(row.clients ?? 0), keys: Number(row.keys ?? 0) }))
}

export interface Request {
  id: string
  createdAt: number
  ico: string | null
  company: string | null
  address: string | null
  plan: string
  situation: string
  name: string
  email: string
  phone: string | null
  note: string | null
  status: string
  /** Whether it became an order: the company is an s. r. o. in the register, so its director concludes online. */
  hasOrder: boolean
}

function requestOf(row: Row): Request {
  const s = (v: unknown) => (typeof v === 'string' ? v : null)
  return {
    id: String(row.id),
    createdAt: Number(row.created_at),
    ico: s(row.ico),
    company: s(row.company),
    address: s(row.address),
    plan: String(row.plan),
    situation: String(row.situation),
    name: String(row.name),
    email: String(row.email),
    phone: s(row.phone),
    note: s(row.note),
    status: String(row.status),
    hasOrder: Number(row.has_order ?? 0) === 1,
  }
}

export async function listRequests(db: D1Database, limit = 300): Promise<Request[]> {
  const rows = await db
    .prepare(
      `SELECT r.*, EXISTS (SELECT 1 FROM orders o WHERE o.request_id = r.id) AS has_order FROM requests r
       ORDER BY CASE r.status WHEN 'new' THEN 0 WHEN 'contacted' THEN 1 ELSE 2 END, r.created_at DESC LIMIT ?`,
    )
    .bind(limit)
    .all<Row>()
  return rows.results.map(requestOf)
}

export interface InvestorRequest {
  email: string
  createdAt: number
  updatedAt: number
  brokers: string[]
  way: string | null
}

/** The people who want the investors' tax return, the newest first, and how many there are. */
export async function listInvestors(db: D1Database, limit = 200): Promise<{ total: number; list: InvestorRequest[] }> {
  const [count, rows] = await db.batch<Row>([
    db.prepare('SELECT COUNT(*) AS n FROM investor_requests'),
    db.prepare('SELECT email, created_at, updated_at, brokers, way FROM investor_requests ORDER BY updated_at DESC LIMIT ?').bind(limit),
  ])
  return {
    total: Number(count?.results[0]?.n ?? 0),
    list: (rows?.results ?? []).map((r) => ({
      email: String(r.email),
      createdAt: Number(r.created_at),
      updatedAt: Number(r.updated_at),
      brokers: typeof r.brokers === 'string' && r.brokers !== '' ? r.brokers.split(',') : [],
      way: typeof r.way === 'string' ? r.way : null,
    })),
  }
}

export async function getRequest(db: D1Database, id: string): Promise<Request | null> {
  const row = await db.prepare('SELECT * FROM requests WHERE id = ?').bind(id).first<Row>()
  return row ? requestOf(row) : null
}

export async function newRequests(db: D1Database): Promise<number> {
  const row = await db.prepare("SELECT COUNT(*) AS n FROM requests WHERE status = 'new'").first<{ n: number }>()
  return row?.n ?? 0
}

/** The counts of the team's navigation. */
export async function teamCounts(db: D1Database, user: User, demo: boolean): Promise<{ queue: number; inbox: number; requests: number }> {
  const v = visible(user, demo)
  const [queue, inbox] = await db.batch<{ n: number }>([
    db.prepare(`SELECT COUNT(*) AS n FROM documents d JOIN companies c ON c.id = d.company_id WHERE d.deleted_at IS NULL AND d.booked_at IS NULL AND d.status IN ('read', 'manual') AND ${v.sql}`).bind(...v.binds),
    db
      .prepare(`${unansweredSql(v)} SELECT COUNT(*) AS n FROM unanswered WHERE position = 1`)
      .bind(...v.binds),
  ])
  return { queue: queue?.results[0]?.n ?? 0, inbox: inbox?.results[0]?.n ?? 0, requests: isAdmin(user) ? await newRequests(db) : 0 }
}

/** A document the app booked by itself and nobody checked since (its company, what it was and when), across the
 *  clients somebody of the team may see: the queue page's own section, oldest first. */
export interface AutoQueued {
  id: string
  companyId: string
  companyName: string
  party: string | null
  totalCents: number | null
  bookedAt: number
}

export async function autoQueue(db: D1Database, user: User, demo: boolean): Promise<AutoQueued[]> {
  const v = visible(user, demo)
  const rows = await db
    .prepare(
      `SELECT d.id, d.company_id, c.name AS company_name, d.party, d.total_cents, d.booked_at
       FROM documents d JOIN companies c ON c.id = d.company_id
       WHERE d.booked_by = 'auto' AND NOT (${autoReviewedSql('d')}) AND d.deleted_at IS NULL AND ${v.sql}
       ORDER BY d.booked_at, d.company_id LIMIT 200`,
    )
    .bind(...v.binds)
    .all<{ id: string; company_id: string; company_name: string; party: string | null; total_cents: number | null; booked_at: number }>()
  return rows.results.map((r) => ({
    id: String(r.id),
    companyId: String(r.company_id),
    companyName: String(r.company_name),
    party: r.party,
    totalCents: r.total_cents,
    bookedAt: Number(r.booked_at),
  }))
}

/** A code for the address documents are forwarded to: eight letters and digits that cannot be mistaken for each other. */
export function inboxCode(): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789'
  const bytes = crypto.getRandomValues(new Uint8Array(8))
  return [...bytes].map((b) => alphabet[b % alphabet.length]).join('')
}

// ---------------------------------------------------------------------------------------------------------------
// The export for the accountant's program
// ---------------------------------------------------------------------------------------------------------------

/** A cell of a CSV for Slovak Excel: no separator inside, and nothing that Excel would run as a formula. */
export function csvCell(value: string | number | null): string {
  if (value === null) return ''
  let text = String(value).replace(/[\r\n]+/g, ' ').replace(/;/g, ',')
  // A negative amount stays a number; anything else that Excel would start a formula with is made text.
  if (/^[=+\-@\t]/.test(text) && !/^-\d+(?:,\d+)?$/.test(text)) text = `'${text}`
  return /["]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** Cents as Slovak Excel reads them: "12,40". */
export function csvMoney(cents: number | null): string {
  if (cents === null) return ''
  const negative = cents < 0
  const abs = Math.abs(cents)
  return `${negative ? '-' : ''}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, '0')}`
}

export function paidByOf(doc: Pick<Doc, 'paidPrivately' | 'kind'>, linked: boolean): PaidBy {
  if (linked) return 'bank'
  if (doc.paidPrivately) return 'private'
  return doc.kind === 'receipt' ? 'cash' : 'unpaid'
}

export function stamp(): number {
  return now()
}
