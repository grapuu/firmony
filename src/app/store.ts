// The client's app in the database. Every read and every change names the company it belongs to, so nobody
// reaches another company's payments or documents by guessing an id. Whether a payment still needs a document
// is read from links and exempt every time and never stored on its own.
import { now } from '../db'
import { sameDocument, supplierKey, type Category } from './booking'
import { AUTO_SCORE, autoExempt, decide, type DocKind, type Exempt, type MatchDocument, type MatchPayment } from './match'
import type { Entry, Reading, Statement } from './xml'

export interface Company {
  id: string
  createdAt: number
  name: string
  ico: string | null
  dic: string | null
  icdph: string | null
  address: string | null
  registerLine: string | null
  vatPayer: boolean
  plan: string
  inbox: string
  accountantId: string | null
  accountantName: string | null
  accountantEmail: string | null
  note: string | null
  demo: boolean
  invoiceIban: string | null
  invoiceDueDays: number
  invoiceFooter: string | null
  /** The contract concluded online: when, by which director, under which terms, from which day. */
  contractAt: number | null
  signedBy: string | null
  termsVersion: string | null
  startOn: string | null
  /** The end of the contract: when it was set, by whom, from which side (the client's notice, or ours), and its last day. */
  noticeAt: number | null
  noticeBy: string | null
  noticeSide: 'client' | 'firmony' | null
  endsOn: string | null
}

export type Team = 'accountant' | 'admin'

export interface User {
  id: string
  name: string
  email: string
  team: Team | null
  reminders: boolean
}

export type PaymentState = 'missing' | 'done' | 'exempt'

export interface Payment {
  id: string
  bookedOn: string
  amountCents: number
  currency: string
  party: string | null
  partyIban: string | null
  vs: string | null
  ss: string | null
  ks: string | null
  note: string | null
  card: boolean
  source: string
  exempt: Exempt | null
  exemptNote: string | null
  exemptBy: string | null
  exemptByName: string | null
  checkedAt: number | null
  accountIban: string
  docs: number
  state: PaymentState
}

export type DocStatus = 'reading' | 'read' | 'manual'
export type DocSource = 'upload' | 'email' | 'einvoice' | 'issued'

export interface Doc {
  id: string
  companyId: string
  createdAt: number
  source: DocSource
  addedBy: string | null
  addedByName: string | null
  fileKey: string | null
  fileType: string | null
  fileName: string | null
  fileBytes: number | null
  status: DocStatus
  readBy: string | null
  kind: DocKind | null
  party: string | null
  partyIco: string | null
  partyIban: string | null
  number: string | null
  vs: string | null
  issuedOn: string | null
  dueOn: string | null
  totalCents: number | null
  vatCents: number | null
  currency: string | null
  category: Category | null
  proposal: 'ai' | 'rule' | null
  vatDeduct: boolean | null
  account: string | null
  bookedAt: number | null
  bookedByName: string | null
  duplicateOf: string | null
  invoiceId: string | null
  paidPrivately: boolean
  paymentId: string | null
  how: string | null
}

export interface Message {
  id: string
  createdAt: number
  side: 'client' | 'firmony'
  author: string | null
  authorName: string | null
  body: string
  paymentId: string | null
}

type Row = Record<string, unknown>
const str = (value: unknown): string | null => (typeof value === 'string' ? value : null)
const num = (value: unknown): number | null => (typeof value === 'number' ? value : null)

/** The columns of a company with its accountant's name, over the aliases c and acc. */
export const COMPANY_COLUMNS = `c.id, c.created_at, c.name, c.ico, c.dic, c.icdph, c.address, c.register_line, c.vat_payer, c.plan, c.inbox,
  c.accountant_id, acc.name AS accountant_name, acc.email AS accountant_email, c.note, c.demo, c.invoice_iban, c.invoice_due_days, c.invoice_footer,
  c.contract_at, c.signed_by, c.terms_version, c.start_on, c.notice_at, c.notice_by, c.notice_side, c.ends_on`

export function companyOf(row: Row): Company {
  return {
    id: String(row.id),
    createdAt: Number(row.created_at ?? 0),
    name: String(row.name),
    ico: str(row.ico),
    dic: str(row.dic),
    icdph: str(row.icdph),
    address: str(row.address),
    registerLine: str(row.register_line),
    vatPayer: row.vat_payer === 1,
    plan: String(row.plan),
    inbox: String(row.inbox),
    accountantId: str(row.accountant_id),
    accountantName: str(row.accountant_name),
    accountantEmail: str(row.accountant_email),
    note: str(row.note),
    demo: row.demo === 1,
    invoiceIban: str(row.invoice_iban),
    invoiceDueDays: num(row.invoice_due_days) ?? 14,
    invoiceFooter: str(row.invoice_footer),
    contractAt: num(row.contract_at),
    signedBy: str(row.signed_by),
    termsVersion: str(row.terms_version),
    startOn: str(row.start_on),
    noticeAt: num(row.notice_at),
    noticeBy: str(row.notice_by),
    noticeSide: row.notice_side === 'firmony' ? 'firmony' : row.notice_at ? 'client' : null,
    endsOn: str(row.ends_on),
  }
}

export async function getCompany(db: D1Database, id: string): Promise<Company | null> {
  const row = await db.prepare(`SELECT ${COMPANY_COLUMNS} FROM companies c LEFT JOIN users acc ON acc.id = c.accountant_id WHERE c.id = ?`).bind(id).first<Row>()
  return row ? companyOf(row) : null
}

const PAYMENT_COLUMNS = `p.id, p.booked_on, p.amount_cents, p.currency, p.party, p.party_iban, p.vs, p.ss, p.ks, p.note, p.card, p.source,
  p.exempt, p.exempt_note, p.exempt_by, eb.name AS exempt_by_name, p.checked_at, a.iban AS account_iban,
  (SELECT COUNT(*) FROM links l WHERE l.payment_id = p.id) AS docs`
const PAYMENT_FROM = 'payments p JOIN accounts a ON a.id = p.account_id LEFT JOIN users eb ON eb.id = p.exempt_by'

/** A payment that still needs a document, as SQL over the alias p. */
export const MISSING = 'p.exempt IS NULL AND NOT EXISTS (SELECT 1 FROM links l WHERE l.payment_id = p.id)'

function paymentOf(row: Row): Payment {
  const docs = num(row.docs) ?? 0
  const exempt = str(row.exempt) as Exempt | null
  return {
    id: String(row.id),
    bookedOn: String(row.booked_on),
    amountCents: Number(row.amount_cents),
    currency: String(row.currency),
    party: str(row.party),
    partyIban: str(row.party_iban),
    vs: str(row.vs),
    ss: str(row.ss),
    ks: str(row.ks),
    note: str(row.note),
    card: row.card === 1,
    source: String(row.source ?? 'statement'),
    exempt,
    exemptNote: str(row.exempt_note),
    exemptBy: str(row.exempt_by),
    exemptByName: str(row.exempt_by_name),
    checkedAt: num(row.checked_at),
    accountIban: String(row.account_iban ?? ''),
    docs,
    state: exempt ? 'exempt' : docs > 0 ? 'done' : 'missing',
  }
}

export const DOC_COLUMNS = `d.id, d.company_id, d.created_at, d.source, d.added_by, ab.name AS added_by_name, d.file_key, d.file_type, d.file_name, d.file_bytes,
  d.status, d.read_by, d.kind, d.party, d.party_ico, d.party_iban, d.number, d.vs, d.issued_on, d.due_on, d.total_cents, d.vat_cents, d.currency,
  d.category, d.proposal, d.vat_deduct, d.account, d.booked_at, bb.name AS booked_by_name, d.duplicate_of, d.invoice_id,
  d.paid_privately, l.payment_id, l.how`
export const DOC_FROM = 'documents d LEFT JOIN links l ON l.document_id = d.id LEFT JOIN users ab ON ab.id = d.added_by LEFT JOIN users bb ON bb.id = d.booked_by'

export function docOf(row: Row): Doc {
  return {
    id: String(row.id),
    companyId: String(row.company_id),
    createdAt: Number(row.created_at),
    source: String(row.source) as DocSource,
    addedBy: str(row.added_by),
    addedByName: str(row.added_by_name),
    fileKey: str(row.file_key),
    fileType: str(row.file_type),
    fileName: str(row.file_name),
    fileBytes: num(row.file_bytes),
    status: String(row.status) as DocStatus,
    readBy: str(row.read_by),
    kind: str(row.kind) as DocKind | null,
    party: str(row.party),
    partyIco: str(row.party_ico),
    partyIban: str(row.party_iban),
    number: str(row.number),
    vs: str(row.vs),
    issuedOn: str(row.issued_on),
    dueOn: str(row.due_on),
    totalCents: num(row.total_cents),
    vatCents: num(row.vat_cents),
    currency: str(row.currency),
    category: str(row.category) as Category | null,
    proposal: str(row.proposal) as Doc['proposal'],
    vatDeduct: row.vat_deduct === null || row.vat_deduct === undefined ? null : row.vat_deduct === 1,
    account: str(row.account),
    bookedAt: num(row.booked_at),
    bookedByName: str(row.booked_by_name),
    duplicateOf: str(row.duplicate_of),
    invoiceId: str(row.invoice_id),
    paidPrivately: row.paid_privately === 1,
    paymentId: str(row.payment_id),
    how: str(row.how),
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Who is signed in
// ---------------------------------------------------------------------------------------------------------------

function userOf(row: Row, prefix = ''): User {
  const team = str(row[`${prefix}team`])
  return {
    id: String(row[`${prefix}id`]),
    name: String(row[`${prefix}name`]),
    email: String(row[`${prefix}email`]),
    team: team === 'admin' || team === 'accountant' ? team : null,
    reminders: row[`${prefix}reminders`] !== 0,
  }
}

export async function userByEmail(db: D1Database, email: string): Promise<User | null> {
  const row = await db.prepare('SELECT id, name, email, team, reminders FROM users WHERE email = ?').bind(email.trim()).first<Row>()
  return row ? userOf(row) : null
}

export async function userById(db: D1Database, id: string): Promise<User | null> {
  const row = await db.prepare('SELECT id, name, email, team, reminders FROM users WHERE id = ?').bind(id).first<Row>()
  return row ? userOf(row) : null
}

/** The company a user signs in to: one where they are the owner first, then any other; never a closed one. */
export async function firstCompanyOf(db: D1Database, userId: string): Promise<string | null> {
  const row = await db
    .prepare(
      `SELECT m.company_id FROM members m JOIN companies c ON c.id = m.company_id AND c.closed_at IS NULL
       WHERE m.user_id = ? ORDER BY CASE m.role WHEN 'owner' THEN 0 ELSE 1 END, m.created_at LIMIT 1`,
    )
    .bind(userId)
    .first<{ company_id: string }>()
  return row?.company_id ?? null
}

/** The companies a user is a member of, for switching between them. */
export async function companiesOf(db: D1Database, userId: string): Promise<{ id: string; name: string }[]> {
  const rows = await db
    .prepare('SELECT c.id, c.name FROM members m JOIN companies c ON c.id = m.company_id AND c.closed_at IS NULL WHERE m.user_id = ? ORDER BY c.name')
    .bind(userId)
    .all<{ id: string; name: string }>()
  return rows.results
}

export interface Who {
  user: User
  /** The company the session is in, while the user is still its member; null for somebody of the team alone. */
  company: Company | null
  role: string | null
  session: string
}

/** The user (and company, while still a member) of a session that has not expired. */
export async function whoBySession(db: D1Database, sessionId: string): Promise<Who | null> {
  const row = await db
    .prepare(
      `SELECT u.id AS u_id, u.name AS u_name, u.email AS u_email, u.team AS u_team, u.reminders AS u_reminders, m.role AS m_role,
              ${COMPANY_COLUMNS}
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       LEFT JOIN members m ON m.user_id = s.user_id AND m.company_id = s.company_id
       LEFT JOIN companies c ON c.id = m.company_id AND c.closed_at IS NULL
       LEFT JOIN users acc ON acc.id = c.accountant_id
       WHERE s.id = ? AND s.expires_at > ?`,
    )
    .bind(sessionId, now())
    .first<Row>()
  if (!row) return null
  const company = row.id ? companyOf(row) : null
  return { user: userOf(row, 'u_'), company, role: company ? str(row.m_role) : null, session: sessionId }
}

export function eventStatement(db: D1Database, e: { company: string | null; user: string | null; action: string; subject?: string | null; detail?: unknown }): D1PreparedStatement {
  return db
    .prepare('INSERT INTO events (at, company_id, user_id, action, subject, detail) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(now(), e.company, e.user, e.action, e.subject ?? null, e.detail === undefined ? null : JSON.stringify(e.detail))
}

/** The people of a company who get its emails: every member who did not turn reminders off, or all of them. */
export async function membersOf(db: D1Database, company: string, onlyReminders = false): Promise<User[]> {
  const rows = await db
    .prepare(`SELECT u.id, u.name, u.email, u.team, u.reminders FROM members m JOIN users u ON u.id = m.user_id WHERE m.company_id = ? ${onlyReminders ? 'AND u.reminders = 1' : ''} ORDER BY m.created_at`)
    .bind(company)
    .all<Row>()
  return rows.results.map((row) => userOf(row))
}

export interface Person extends User {
  role: string
}

/** The people of a company with their role, the owners first. */
export async function peopleOf(db: D1Database, company: string): Promise<Person[]> {
  const rows = await db
    .prepare(
      `SELECT u.id, u.name, u.email, u.team, u.reminders, m.role FROM members m JOIN users u ON u.id = m.user_id
       WHERE m.company_id = ? ORDER BY CASE m.role WHEN 'owner' THEN 0 ELSE 1 END, m.created_at`,
    )
    .bind(company)
    .all<Row>()
  return rows.results.map((row) => ({ ...userOf(row), role: String(row.role) }))
}

// ---------------------------------------------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------------------------------------------

export type PaymentFilter = 'missing' | 'done' | 'all'

export async function listPayments(db: D1Database, company: string, filter: PaymentFilter, limit = 400, search = ''): Promise<Payment[]> {
  const where =
    filter === 'missing'
      ? `AND ${MISSING}`
      : filter === 'done'
        ? 'AND (p.exempt IS NOT NULL OR EXISTS (SELECT 1 FROM links l WHERE l.payment_id = p.id))'
        : ''
  const { sql, binds } = searchSql(search, ['p.party', 'p.note', 'p.vs'], 'ABS(p.amount_cents)')
  const rows = await db
    .prepare(`SELECT ${PAYMENT_COLUMNS} FROM ${PAYMENT_FROM} WHERE p.company_id = ? ${where} ${sql} ORDER BY p.booked_on DESC, p.created_at DESC LIMIT ?`)
    .bind(company, ...binds, limit)
    .all<Row>()
  return rows.results.map(paymentOf)
}

/**
 * What a search box asks for, as SQL: every word must be in one of the columns (accents and case ignored by SQLite's
 * LIKE only for ASCII, so the words are matched as typed and as written without accents), and a number such as
 * "12,40" also finds that amount.
 */
export function searchSql(search: string, columns: string[], amountColumn: string): { sql: string; binds: (string | number)[] } {
  const words = search
    .trim()
    .slice(0, 80)
    .split(/\s+/)
    .filter((word) => word.length > 0)
    .slice(0, 5)
  if (words.length === 0) return { sql: '', binds: [] }
  const parts: string[] = []
  const binds: (string | number)[] = []
  for (const word of words) {
    const amount = /^\d+(?:[.,]\d{1,2})?$/.test(word) ? Math.round(Number(word.replace(',', '.')) * 100) : null
    const like = `%${word.replace(/[%_\\]/g, (ch) => `\\${ch}`)}%`
    const plain = `%${word.normalize('NFD').replace(/\p{M}/gu, '').replace(/[%_\\]/g, (ch) => `\\${ch}`)}%`
    const ors = columns.flatMap((column) => [`${column} LIKE ? ESCAPE '\\'`, `${column} LIKE ? ESCAPE '\\'`])
    for (let i = 0; i < columns.length; i++) binds.push(like, plain)
    if (amount !== null) {
      ors.push(`${amountColumn} = ?`)
      binds.push(amount)
    }
    parts.push(`(${ors.join(' OR ')})`)
  }
  return { sql: `AND ${parts.join(' AND ')}`, binds }
}

export async function getPayment(db: D1Database, company: string, id: string): Promise<Payment | null> {
  const row = await db.prepare(`SELECT ${PAYMENT_COLUMNS} FROM ${PAYMENT_FROM} WHERE p.company_id = ? AND p.id = ?`).bind(company, id).first<Row>()
  return row ? paymentOf(row) : null
}

export async function countMissing(db: D1Database, company: string): Promise<number> {
  const row = await db.prepare(`SELECT COUNT(*) AS n FROM payments p WHERE p.company_id = ? AND ${MISSING}`).bind(company).first<{ n: number }>()
  return row?.n ?? 0
}

/** What came in and went out in a month, and what the accounts hold by the newest statement. */
export async function monthFigures(db: D1Database, company: string, from: string, to: string): Promise<{ inCents: number; outCents: number; balanceCents: number | null; balanceOn: string | null }> {
  const [sums, balance] = await db.batch<Row>([
    db
      .prepare(
        `SELECT COALESCE(SUM(CASE WHEN amount_cents > 0 THEN amount_cents END), 0) AS in_cents,
                COALESCE(SUM(CASE WHEN amount_cents < 0 THEN -amount_cents END), 0) AS out_cents
         FROM payments WHERE company_id = ? AND booked_on >= ? AND booked_on < ? AND (exempt IS NULL OR exempt NOT IN ('own'))`,
      )
      .bind(company, from, to),
    db.prepare('SELECT SUM(balance_cents) AS cents, MAX(balance_on) AS on_day FROM accounts WHERE company_id = ? AND balance_cents IS NOT NULL').bind(company),
  ])
  const s = sums?.results[0] ?? {}
  const b = balance?.results[0] ?? {}
  return { inCents: Number(s.in_cents ?? 0), outCents: Number(s.out_cents ?? 0), balanceCents: num(b.cents), balanceOn: str(b.on_day) }
}

/** Marks a payment as needing no document. Made by somebody of the team, it is checked at the same time. */
export function exemptStatement(db: D1Database, company: string, payment: string, reason: Exempt, note: string | null, by: string, checked = false): D1PreparedStatement {
  return db
    .prepare(
      `UPDATE payments SET exempt = ?, exempt_note = ?, exempt_by = ?, checked_at = ?, checked_by = ?
       WHERE id = ? AND company_id = ? AND exempt IS NULL AND NOT EXISTS (SELECT 1 FROM links l WHERE l.payment_id = payments.id)`,
    )
    .bind(reason, note, by, checked ? now() : null, checked ? by : null, payment, company)
}

export function clearExemptStatement(db: D1Database, company: string, payment: string): D1PreparedStatement {
  return db
    .prepare('UPDATE payments SET exempt = NULL, exempt_note = NULL, exempt_by = NULL, checked_at = NULL, checked_by = NULL WHERE id = ? AND company_id = ? AND exempt IS NOT NULL')
    .bind(payment, company)
}

/** The accountant agrees that a payment needs no document. */
export function checkStatement(db: D1Database, company: string, payment: string, by: string): D1PreparedStatement {
  return db.prepare('UPDATE payments SET checked_at = ?, checked_by = ? WHERE id = ? AND company_id = ? AND exempt IS NOT NULL AND checked_at IS NULL').bind(now(), by, payment, company)
}

/**
 * Pairs a document with a payment of the same company. Nothing happens when the document is already paired,
 * deleted or of another company, or when the payment needs no document. A pair made without asking (`alone`)
 * also needs the payment to have no document yet; a client may give one payment several documents.
 */
export function linkStatement(db: D1Database, company: string, payment: string, doc: string, how: 'auto' | 'client' | 'accountant', by: string | null, alone = false): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO links (document_id, payment_id, company_id, how, by, created_at)
       SELECT d.id, p.id, p.company_id, ?, ?, ?
       FROM documents d JOIN payments p ON p.company_id = d.company_id
       WHERE d.id = ? AND p.id = ? AND p.company_id = ? AND d.deleted_at IS NULL AND d.paid_privately = 0 AND p.exempt IS NULL
         AND NOT EXISTS (SELECT 1 FROM links WHERE document_id = d.id)
         ${alone ? 'AND NOT EXISTS (SELECT 1 FROM links WHERE payment_id = p.id)' : ''}`,
    )
    .bind(how, by, now(), doc, payment, company)
}

export function unlinkStatement(db: D1Database, company: string, doc: string): D1PreparedStatement {
  return db.prepare('DELETE FROM links WHERE document_id = ? AND company_id = ?').bind(doc, company)
}

// ---------------------------------------------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------------------------------------------

export type DocFilter = 'all' | 'loose'

export async function listDocuments(db: D1Database, company: string, filter: DocFilter = 'all', limit = 400, search = ''): Promise<Doc[]> {
  const { sql, binds } = searchSql(search, ['d.party', 'd.number', 'd.file_name', 'd.vs'], 'd.total_cents')
  const rows = await db
    .prepare(
      `SELECT ${DOC_COLUMNS} FROM ${DOC_FROM}
       WHERE d.company_id = ? AND d.deleted_at IS NULL ${filter === 'loose' ? 'AND l.document_id IS NULL AND d.paid_privately = 0' : ''} ${sql}
       ORDER BY d.created_at DESC LIMIT ?`,
    )
    .bind(company, ...binds, limit)
    .all<Row>()
  return rows.results.map(docOf)
}

export async function getDocument(db: D1Database, company: string, id: string): Promise<Doc | null> {
  const row = await db.prepare(`SELECT ${DOC_COLUMNS} FROM ${DOC_FROM} WHERE d.company_id = ? AND d.id = ? AND d.deleted_at IS NULL`).bind(company, id).first<Row>()
  return row ? docOf(row) : null
}

export async function documentsOfPayment(db: D1Database, company: string, payment: string): Promise<Doc[]> {
  const rows = await db.prepare(`SELECT ${DOC_COLUMNS} FROM ${DOC_FROM} WHERE d.company_id = ? AND l.payment_id = ? AND d.deleted_at IS NULL ORDER BY l.created_at`).bind(company, payment).all<Row>()
  return rows.results.map(docOf)
}

export interface NewDocument {
  id: string
  company: string
  source: DocSource
  addedBy: string | null
  fileKey: string | null
  fileType: string | null
  fileName: string | null
  fileBytes: number | null
  fileHash: string | null
  /** What was read already (an e-invoice), or null while the reader has it. */
  reading: Reading | null
  readBy: string | null
  status: DocStatus
  invoiceId?: string | null
}

export function insertDocumentStatement(db: D1Database, d: NewDocument): D1PreparedStatement {
  const r = d.reading
  return db
    .prepare(
      `INSERT INTO documents (id, company_id, created_at, source, added_by, file_key, file_type, file_name, file_bytes, file_hash, status, read_by,
         kind, party, party_ico, party_iban, number, vs, issued_on, due_on, total_cents, vat_cents, currency, category, proposal, invoice_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      d.id, d.company, now(), d.source, d.addedBy, d.fileKey, d.fileType, d.fileName, d.fileBytes, d.fileHash, d.status, d.readBy,
      r?.kind ?? null, r?.party ?? null, r?.partyIco ?? null, r?.partyIban ?? null, r?.number ?? null, r?.vs ?? null,
      r?.issuedOn ?? null, r?.dueOn ?? null, r?.totalCents ?? null, r?.vatCents ?? null, r?.currency ?? null,
      r?.category ?? null, r?.category ? 'ai' : null, d.invoiceId ?? null,
    )
}

/** Writes what the reader found; only while the document is still being read, so a second answer changes nothing. */
export function readingStatement(db: D1Database, company: string, doc: string, reading: Reading, by: string): D1PreparedStatement {
  return db
    .prepare(
      `UPDATE documents SET status = 'read', read_by = ?, kind = ?, party = ?, party_ico = ?, party_iban = ?, number = ?, vs = ?,
         issued_on = ?, due_on = ?, total_cents = ?, vat_cents = ?, currency = ?, category = ?, proposal = ?
       WHERE id = ? AND company_id = ? AND status = 'reading'`,
    )
    .bind(
      by, reading.kind, reading.party, reading.partyIco, reading.partyIban, reading.number, reading.vs, reading.issuedOn, reading.dueOn,
      reading.totalCents, reading.vatCents, reading.currency, reading.category ?? null, reading.category ? 'ai' : null, doc, company,
    )
}

/**
 * What the accountant decided once for a supplier is proposed for its next documents: the category and whether
 * VAT is deducted. A rule wins over the reader's guess; a booked document is never changed by it.
 */
export function ruleStatement(db: D1Database, company: string, doc: string, key: string | null): D1PreparedStatement {
  return db
    .prepare(
      `UPDATE documents SET
         category = (SELECT category FROM supplier_rules WHERE company_id = ?1 AND key = ?2),
         vat_deduct = (SELECT vat_deduct FROM supplier_rules WHERE company_id = ?1 AND key = ?2),
         proposal = 'rule'
       WHERE id = ?3 AND company_id = ?1 AND booked_at IS NULL AND EXISTS (SELECT 1 FROM supplier_rules WHERE company_id = ?1 AND key = ?2)`,
    )
    .bind(company, key ?? '', doc)
}

export function ruleUpsertStatement(db: D1Database, company: string, key: string, name: string | null, category: Category, vatDeduct: boolean, by: string): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO supplier_rules (company_id, key, name, category, vat_deduct, uses, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, 1, ?, ?)
       ON CONFLICT(company_id, key) DO UPDATE SET name = excluded.name, category = excluded.category, vat_deduct = excluded.vat_deduct,
         uses = supplier_rules.uses + 1, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
    )
    .bind(company, key, name, category, vatDeduct ? 1 : 0, now(), by)
}

/** Marks a document as a suspected duplicate of an older one of the company; such a document is never paired by itself. */
export async function markDuplicate(db: D1Database, company: string, doc: string): Promise<string | null> {
  const self = await getDocument(db, company, doc)
  if (!self || self.totalCents === null) return null
  const rows = await db
    .prepare(`SELECT ${DOC_COLUMNS} FROM ${DOC_FROM} WHERE d.company_id = ? AND d.id <> ? AND d.deleted_at IS NULL AND d.total_cents = ? AND d.created_at <= ? ORDER BY d.created_at LIMIT 20`)
    .bind(company, doc, self.totalCents, self.createdAt)
    .all<Row>()
  const twin = rows.results.map(docOf).find((other) => sameDocument(self, other))
  if (!twin) return null
  await db.prepare('UPDATE documents SET duplicate_of = ? WHERE id = ? AND company_id = ? AND duplicate_of IS NULL').bind(twin.id, doc, company).run()
  return twin.id
}

export function manualStatement(db: D1Database, company: string, doc: string, why: string): D1PreparedStatement {
  return db.prepare("UPDATE documents SET status = 'manual', read_by = ? WHERE id = ? AND company_id = ? AND status = 'reading'").bind(`person: ${why}`.slice(0, 80), doc, company)
}

export function privatelyStatement(db: D1Database, company: string, doc: string, paid: boolean): D1PreparedStatement {
  return db
    .prepare('UPDATE documents SET paid_privately = ? WHERE id = ? AND company_id = ? AND deleted_at IS NULL AND NOT EXISTS (SELECT 1 FROM links WHERE document_id = documents.id)')
    .bind(paid ? 1 : 0, doc, company)
}

/** A client deletes a document sent by mistake; not one the accountant has booked. */
export function deleteDocumentStatements(db: D1Database, company: string, doc: string): D1PreparedStatement[] {
  return [
    db.prepare('DELETE FROM links WHERE document_id = ? AND company_id = ? AND NOT EXISTS (SELECT 1 FROM documents WHERE id = ? AND booked_at IS NOT NULL)').bind(doc, company, doc),
    db.prepare('UPDATE documents SET deleted_at = ? WHERE id = ? AND company_id = ? AND deleted_at IS NULL AND booked_at IS NULL').bind(now(), doc, company),
  ]
}

/** A document of the company with the same file, if it was sent before and not deleted. */
export async function documentByHash(db: D1Database, company: string, hash: string): Promise<string | null> {
  const row = await db.prepare('SELECT id FROM documents WHERE company_id = ? AND file_hash = ? AND deleted_at IS NULL LIMIT 1').bind(company, hash).first<{ id: string }>()
  return row?.id ?? null
}

/** Files added by a company today, by any way, to hold back a runaway script or a flood of email. */
export async function filesToday(db: D1Database, company: string): Promise<number> {
  const row = await db.prepare("SELECT COUNT(*) AS n FROM documents WHERE company_id = ? AND source IN ('upload', 'email') AND created_at > ?").bind(company, now() - 86400).first<{ n: number }>()
  return row?.n ?? 0
}

// ---------------------------------------------------------------------------------------------------------------
// Pairing
// ---------------------------------------------------------------------------------------------------------------

function asMatchPayment(p: Payment): MatchPayment {
  return { id: p.id, bookedOn: p.bookedOn, amountCents: p.amountCents, party: p.party, partyIban: p.partyIban, vs: p.vs }
}

function asMatchDocument(d: Doc): MatchDocument {
  return { id: d.id, kind: d.kind, issuedOn: d.issuedOn, dueOn: d.dueOn, totalCents: d.totalCents, party: d.party, partyIban: d.partyIban, vs: d.vs }
}

/** Documents that were read, wait for their payment and are no suspected duplicate. */
async function looseRead(db: D1Database, company: string): Promise<Doc[]> {
  return (await listDocuments(db, company, 'loose', 500)).filter((d) => (d.status === 'read' || d.bookedAt !== null) && d.totalCents !== null && !d.duplicateOf)
}

/** Pairs what is sure to belong together; says how many pairs were made. */
export async function matchCompany(db: D1Database, company: string): Promise<number> {
  const [payments, docs] = await Promise.all([listPayments(db, company, 'missing', 500), looseRead(db, company)])
  if (payments.length === 0 || docs.length === 0) return 0
  const { auto } = decide(payments.map(asMatchPayment), docs.map(asMatchDocument))
  if (auto.length === 0) return 0
  const results = await db.batch(
    auto.flatMap(([payment, doc]) => [linkStatement(db, company, payment, doc, 'auto', null, true), eventStatement(db, { company, user: null, action: 'link.auto', subject: payment, detail: { doc, min: AUTO_SCORE } })]),
  )
  return results.filter((result, index) => index % 2 === 0 && (result.meta?.changes ?? 0) > 0).length
}

/** For each payment that needs a document, the documents that may be it, best first. */
export async function suggestions(db: D1Database, company: string, payments: Payment[]): Promise<Map<string, Doc[]>> {
  const missing = payments.filter((p) => p.state === 'missing')
  if (missing.length === 0) return new Map()
  const docs = await looseRead(db, company)
  const byId = new Map(docs.map((d) => [d.id, d]))
  const { suggest } = decide(missing.map(asMatchPayment), docs.map(asMatchDocument))
  return new Map([...suggest].map(([payment, ids]) => [payment, ids.map((id) => byId.get(id)).filter((d): d is Doc => Boolean(d))]))
}

/** After a document was read or changed: a rule of its supplier, a suspected twin, and pairing. */
export async function afterReading(db: D1Database, company: string, doc: string): Promise<void> {
  const d = await getDocument(db, company, doc)
  if (!d) return
  await db.batch([ruleStatement(db, company, doc, supplierKey(d.partyIco, d.party))])
  await markDuplicate(db, company, doc)
}

// ---------------------------------------------------------------------------------------------------------------
// The bank's statement, and a bank's own feed
// ---------------------------------------------------------------------------------------------------------------

export interface Imported {
  added: number
  known: number
  exempt: number
  accounts: number
}

/** The company's account of an IBAN, made when it is first seen. */
export async function accountFor(db: D1Database, company: string, iban: string, extra: { bank?: string | null; link?: string | null; remote?: string | null } = {}): Promise<string | null> {
  await db.prepare('INSERT OR IGNORE INTO accounts (id, company_id, iban, bank, link_id, remote_id) VALUES (?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(), company, iban, extra.bank ?? null, extra.link ?? null, extra.remote ?? null).run()
  if (extra.link || extra.remote || extra.bank) {
    await db
      .prepare('UPDATE accounts SET bank = COALESCE(?, bank), link_id = COALESCE(?, link_id), remote_id = COALESCE(?, remote_id) WHERE company_id = ? AND iban = ?')
      .bind(extra.bank ?? null, extra.link ?? null, extra.remote ?? null, company, iban)
      .run()
  }
  const account = await db.prepare('SELECT id FROM accounts WHERE company_id = ? AND iban = ?').bind(company, iban).first<{ id: string }>()
  return account?.id ?? null
}

/**
 * Adds payments that are not known yet; the same payment brought twice is one. Twice from one source (two
 * statements, two reads of the bank) it carries the same reference. From the other source (a statement added
 * before the bank was linked, or after) it carries another, so it is known by its day, its amount and, where both
 * have them, its symbol and the other side's account; each payment known that way stands for one entry only, so
 * two coffees of the same price on one day stay two.
 */
export async function importEntries(db: D1Database, company: string, accountId: string, entries: Entry[], source: string): Promise<{ added: number; known: number; exempt: number }> {
  const out = { added: 0, known: 0, exempt: 0 }
  const own = (await db.prepare('SELECT iban FROM accounts WHERE company_id = ?').bind(company).all<{ iban: string }>()).results.map((r) => r.iban)
  const days = entries.map((e) => e.bookedOn).sort()
  const others =
    days.length === 0
      ? []
      : (
          await db
            .prepare('SELECT ref, booked_on, amount_cents, vs, party_iban FROM payments WHERE account_id = ? AND company_id = ? AND source <> ? AND booked_on BETWEEN ? AND ?')
            .bind(accountId, company, source, days[0], days[days.length - 1])
            .all<{ ref: string; booked_on: string; amount_cents: number; vs: string | null; party_iban: string | null }>()
        ).results
  const mine = new Set(
    days.length === 0
      ? []
      : (
          await db
            .prepare('SELECT ref FROM payments WHERE account_id = ? AND company_id = ? AND source = ? AND booked_on BETWEEN ? AND ?')
            .bind(accountId, company, source, days[0], days[days.length - 1])
            .all<{ ref: string }>()
        ).results.map((r) => r.ref),
  )
  const sameAs = (e: Entry, p: (typeof others)[number]) =>
    p.booked_on === e.bookedOn && p.amount_cents === e.amountCents && (!p.vs || !e.vs || p.vs === e.vs) && (!p.party_iban || !e.partyIban || p.party_iban === e.partyIban)
  const fresh: D1PreparedStatement[] = []
  const reasons: (string | null)[] = []
  for (const entry of entries) {
    // Known from this source by its reference: the insert below leaves it, and it takes no other payment's place.
    if (!mine.has(entry.ref)) {
      const twin = others.findIndex((p) => sameAs(entry, p))
      if (twin >= 0) {
        others.splice(twin, 1)
        out.known++
        continue
      }
    }
    const reason = autoExempt(entry, own)
    reasons.push(reason)
    fresh.push(insertPaymentStatement(db, company, accountId, entry, reason, source))
  }
  for (let i = 0; i < fresh.length; i += 50) {
    const results = await db.batch(fresh.slice(i, i + 50))
    results.forEach((result, j) => {
      if ((result.meta?.changes ?? 0) > 0) {
        out.added++
        if (reasons[i + j]) out.exempt++
      } else out.known++
    })
  }
  return out
}

export function balanceStatement(db: D1Database, accountId: string, cents: number, on: string): D1PreparedStatement {
  return db.prepare('UPDATE accounts SET balance_cents = ?, balance_on = ? WHERE id = ? AND (balance_on IS NULL OR balance_on <= ?)').bind(cents, on, accountId, on)
}

/** Adds what a statement holds and is not known yet; a statement added twice adds nothing the second time. */
export async function importStatements(db: D1Database, company: string, user: string | null, statements: Statement[]): Promise<Imported> {
  const out: Imported = { added: 0, known: 0, exempt: 0, accounts: 0 }
  for (const statement of statements) {
    if (!statement.iban) continue
    const account = await accountFor(db, company, statement.iban)
    if (!account) continue
    out.accounts++
    const result = await importEntries(db, company, account, statement.entries, 'statement')
    out.added += result.added
    out.known += result.known
    out.exempt += result.exempt
    if (statement.closing) await balanceStatement(db, account, statement.closing.cents, statement.closing.on).run()
  }
  await db.batch([eventStatement(db, { company, user, action: 'statement.imported', detail: out })])
  if (out.added > 0) await matchCompany(db, company)
  return out
}

export function insertPaymentStatement(db: D1Database, company: string, account: string, e: Entry, exempt: string | null, source = 'statement'): D1PreparedStatement {
  return db
    .prepare(
      `INSERT OR IGNORE INTO payments (id, company_id, account_id, created_at, booked_on, amount_cents, currency, party, party_iban, vs, ss, ks, note, card, ref, source, exempt, exempt_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(crypto.randomUUID(), company, account, now(), e.bookedOn, e.amountCents, e.currency, e.party, e.partyIban, e.vs, e.ss, e.ks, e.note, e.card ? 1 : 0, e.ref, source, exempt, exempt ? 'auto' : null)
}

// ---------------------------------------------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------------------------------------------

export async function listMessages(db: D1Database, company: string, limit = 200): Promise<Message[]> {
  const rows = await db
    .prepare(
      `SELECT m.id, m.created_at, m.side, m.author, u.name AS author_name, m.body, m.payment_id
       FROM messages m LEFT JOIN users u ON u.id = m.author WHERE m.company_id = ? ORDER BY m.created_at DESC, m.rowid DESC LIMIT ?`,
    )
    .bind(company, limit)
    .all<Row>()
  return rows.results
    .map((row) => ({
      id: String(row.id),
      createdAt: Number(row.created_at),
      side: String(row.side) as Message['side'],
      author: str(row.author),
      authorName: str(row.author_name),
      body: String(row.body),
      paymentId: str(row.payment_id),
    }))
    .reverse()
}

export async function unseenFromFirmony(db: D1Database, company: string): Promise<number> {
  const row = await db.prepare("SELECT COUNT(*) AS n FROM messages WHERE company_id = ? AND side = 'firmony' AND seen_at IS NULL").bind(company).first<{ n: number }>()
  return row?.n ?? 0
}

export function seenStatement(db: D1Database, company: string, side: Message['side'] = 'firmony'): D1PreparedStatement {
  return db.prepare('UPDATE messages SET seen_at = ? WHERE company_id = ? AND side = ? AND seen_at IS NULL').bind(now(), company, side)
}

export function messageStatement(db: D1Database, m: { id: string; company: string; author: string | null; side: Message['side']; body: string; payment: string | null; at?: number }): D1PreparedStatement {
  return db
    .prepare('INSERT INTO messages (id, company_id, created_at, author, side, body, payment_id) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(m.id, m.company, m.at ?? now(), m.author, m.side, m.body, m.payment)
}
