// The accountants' side in the database. An accountant sees the companies she is assigned to; an administrator
// sees all of them. Every function that reads a company's things is given the user and checks it.
import { now } from '../db'
import { CATEGORIES, entryFor, type Category, type PaidBy } from '../app/booking'
import { COMPANY_COLUMNS, DOC_FROM, MISSING, companyOf, docOf, type Company, type Doc, type Team, type User } from '../app/store'
import type { DocKind } from '../app/match'

type Row = Record<string, unknown>

export function isAdmin(user: User): boolean {
  return user.team === 'admin'
}

/** Whether somebody of the team may see a company: an administrator always, an accountant only her own. */
export function canSee(user: User, company: Pick<Company, 'accountantId'>): boolean {
  return user.team === 'admin' || (user.team === 'accountant' && company.accountantId === user.id)
}

/** The SQL that limits companies (alias c) to what a user of the team may see. */
function visible(user: User, demo: boolean): { sql: string; binds: unknown[] } {
  const own = isAdmin(user) ? '' : 'AND c.accountant_id = ?'
  return { sql: `c.closed_at IS NULL ${own} ${demo ? '' : 'AND c.demo = 0'}`, binds: isAdmin(user) ? [] : [user.id] }
}

export interface ClientRow {
  company: Company
  missing: number
  toBook: number
  reading: number
  toCheck: number
  waiting: number | null
}

export async function teamClients(db: D1Database, user: User, demo: boolean): Promise<ClientRow[]> {
  const v = visible(user, demo)
  const rows = await db
    .prepare(
      `SELECT ${COMPANY_COLUMNS},
         (SELECT COUNT(*) FROM payments p WHERE p.company_id = c.id AND ${MISSING}) AS missing,
         (SELECT COUNT(*) FROM documents d WHERE d.company_id = c.id AND d.deleted_at IS NULL AND d.booked_at IS NULL AND d.status IN ('read', 'manual')) AS to_book,
         (SELECT COUNT(*) FROM documents d WHERE d.company_id = c.id AND d.deleted_at IS NULL AND d.status = 'reading') AS reading,
         (SELECT COUNT(*) FROM payments p WHERE p.company_id = c.id AND p.exempt IS NOT NULL AND p.checked_at IS NULL AND p.exempt_by <> 'auto') AS to_check,
         (SELECT CASE WHEN m.side = 'client' THEN m.created_at END FROM messages m WHERE m.company_id = c.id ORDER BY m.created_at DESC, m.rowid DESC LIMIT 1) AS waiting
       FROM companies c LEFT JOIN users acc ON acc.id = c.accountant_id
       WHERE ${v.sql}
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
  }))
}

/** A company somebody of the team may see, or null. */
export async function teamCompany(db: D1Database, user: User, id: string): Promise<Company | null> {
  const row = await db.prepare(`SELECT ${COMPANY_COLUMNS} FROM companies c LEFT JOIN users acc ON acc.id = c.accountant_id WHERE c.id = ? AND c.closed_at IS NULL`).bind(id).first<Row>()
  const company = row ? companyOf(row) : null
  return company && canSee(user, company) ? company : null
}

export interface QueueDoc extends Doc {
  companyName: string
}

const DOC_COLUMNS_ALL = `d.*, ab.name AS added_by_name, bb.name AS booked_by_name, l.payment_id, l.how`

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
}

/** Companies whose newest message is the client's: they wait for an answer, the longest waiting first. */
export async function waitingThreads(db: D1Database, user: User, demo: boolean): Promise<Thread[]> {
  const v = visible(user, demo)
  const rows = await db
    .prepare(
      `SELECT ${COMPANY_COLUMNS}, m.body AS m_body, m.created_at AS m_at, u.name AS m_author
       FROM companies c LEFT JOIN users acc ON acc.id = c.accountant_id
       JOIN messages m ON m.id = (SELECT id FROM messages WHERE company_id = c.id ORDER BY created_at DESC, rowid DESC LIMIT 1)
       LEFT JOIN users u ON u.id = m.author
       WHERE ${v.sql} AND m.side = 'client'
       ORDER BY m.created_at`,
    )
    .bind(...v.binds)
    .all<Row>()
  return rows.results.map((row) => ({ company: companyOf(row), body: String(row.m_body), at: Number(row.m_at), author: typeof row.m_author === 'string' ? row.m_author : null }))
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
}

export async function rulesOf(db: D1Database, company: string): Promise<Rule[]> {
  const rows = await db.prepare('SELECT key, name, category, vat_deduct, uses FROM supplier_rules WHERE company_id = ? ORDER BY uses DESC, name LIMIT 100').bind(company).all<Row>()
  return rows.results.map((row) => ({ key: String(row.key), name: typeof row.name === 'string' ? row.name : null, category: String(row.category) as Category, vatDeduct: row.vat_deduct === 1, uses: Number(row.uses) }))
}

export interface TeamMember {
  id: string
  name: string
  email: string
  team: Team
  clients: number
}

export async function teamMembers(db: D1Database): Promise<TeamMember[]> {
  const rows = await db
    .prepare("SELECT u.id, u.name, u.email, u.team, (SELECT COUNT(*) FROM companies c WHERE c.accountant_id = u.id AND c.closed_at IS NULL AND c.demo = 0) AS clients FROM users u WHERE u.team IS NOT NULL ORDER BY u.name")
    .all<Row>()
  return rows.results.map((row) => ({ id: String(row.id), name: String(row.name), email: String(row.email), team: String(row.team) as Team, clients: Number(row.clients ?? 0) }))
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
  }
}

export async function listRequests(db: D1Database, limit = 300): Promise<Request[]> {
  const rows = await db.prepare("SELECT * FROM requests ORDER BY CASE status WHEN 'new' THEN 0 WHEN 'contacted' THEN 1 ELSE 2 END, created_at DESC LIMIT ?").bind(limit).all<Row>()
  return rows.results.map(requestOf)
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
      .prepare(`SELECT COUNT(*) AS n FROM companies c WHERE ${v.sql} AND (SELECT side FROM messages m WHERE m.company_id = c.id ORDER BY m.created_at DESC, m.rowid DESC LIMIT 1) = 'client'`)
      .bind(...v.binds),
  ])
  return { queue: queue?.results[0]?.n ?? 0, inbox: inbox?.results[0]?.n ?? 0, requests: isAdmin(user) ? await newRequests(db) : 0 }
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

export interface ExportRow {
  doc: Doc
  paidOn: string | null
  paidBy: PaidBy
  bookedByName: string | null
}

/** The booked documents of a month (by their date, or the day they arrived when they have none), with their payment. */
export async function exportRows(db: D1Database, company: string, month: string): Promise<ExportRow[]> {
  const from = `${month}-01`
  const [y, m] = month.split('-').map(Number) as [number, number]
  const to = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`
  const rows = await db
    .prepare(
      `SELECT ${DOC_COLUMNS_ALL}, p.booked_on AS paid_on FROM ${DOC_FROM} LEFT JOIN payments p ON p.id = l.payment_id
       WHERE d.company_id = ? AND d.deleted_at IS NULL AND d.booked_at IS NOT NULL
         AND COALESCE(d.issued_on, date(d.created_at, 'unixepoch')) >= ? AND COALESCE(d.issued_on, date(d.created_at, 'unixepoch')) < ?
       ORDER BY COALESCE(d.issued_on, date(d.created_at, 'unixepoch')), d.created_at`,
    )
    .bind(company, from, to)
    .all<Row>()
  return rows.results.map((row) => {
    const doc = docOf(row)
    const paidOn = typeof row.paid_on === 'string' ? row.paid_on : null
    return { doc, paidOn, paidBy: paidByOf(doc, paidOn !== null), bookedByName: doc.bookedByName }
  })
}

export function paidByOf(doc: Pick<Doc, 'paidPrivately' | 'kind'>, linked: boolean): PaidBy {
  if (linked) return 'bank'
  if (doc.paidPrivately) return 'private'
  return doc.kind === 'receipt' ? 'cash' : 'unpaid'
}

export function exportCsv(rows: ExportRow[], vatPayer: boolean, headers: readonly string[], kinds: Record<DocKind, string>, paidNames: Record<PaidBy, string>): string {
  const lines = [headers.map(csvCell).join(';')]
  for (const { doc, paidOn, paidBy, bookedByName } of rows) {
    const entry = entryFor({ kind: doc.kind, category: doc.category, totalCents: doc.totalCents, vatCents: doc.vatCents, vatPayer, vatDeduct: doc.vatDeduct ?? false, paidBy, account: doc.account })
    const first = entry[0]
    const vat = entry.find((line) => line.what === 'vat')
    const base = doc.totalCents === null ? null : doc.totalCents - (doc.vatCents ?? 0)
    lines.push(
      [
        doc.issuedOn ?? '',
        doc.kind ? kinds[doc.kind] : '',
        doc.number ?? '',
        doc.party ?? '',
        doc.partyIco ?? '',
        csvMoney(doc.totalCents),
        csvMoney(doc.vatCents),
        csvMoney(base),
        doc.category ? CATEGORIES[doc.category].name : '',
        first?.md ?? '',
        first?.d ?? '',
        vat && doc.kind !== 'invoice_out' ? 'áno' : 'nie',
        paidOn ?? '',
        paidNames[paidBy],
        doc.vs ?? '',
        bookedByName ?? '',
        doc.bookedAt ? new Date(doc.bookedAt * 1000).toISOString().slice(0, 10) : '',
      ]
        .map((value) => csvCell(value))
        .join(';'),
    )
  }
  return `﻿${lines.join('\r\n')}\r\n`
}

export function stamp(): number {
  return now()
}
