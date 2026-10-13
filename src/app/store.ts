// The client's app in the database. Every read and every change names the company it belongs to, so nobody
// reaches another company's payments or documents by guessing an id. Whether a payment still needs a document
// is read from links and exempt every time and never stored on its own.
import { now } from '../db'
import { AUTO_SCORE, autoExempt, decide, type DocKind, type Exempt, type MatchDocument, type MatchPayment } from './match'
import type { Entry, Reading, Statement } from './xml'

export interface Company {
  id: string
  name: string
  ico: string | null
  vatPayer: boolean
  plan: string
  inbox: string
  accountant: string | null
  demo: boolean
}

export interface User {
  id: string
  name: string
  email: string
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
  exempt: Exempt | null
  exemptNote: string | null
  exemptBy: string | null
  accountIban: string
  docs: number
  state: PaymentState
}

export type DocStatus = 'reading' | 'read' | 'manual'

export interface Doc {
  id: string
  createdAt: number
  source: 'upload' | 'email' | 'einvoice'
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

function companyOf(row: Row): Company {
  return {
    id: String(row.id),
    name: String(row.name),
    ico: str(row.ico),
    vatPayer: row.vat_payer === 1,
    plan: String(row.plan),
    inbox: String(row.inbox),
    accountant: str(row.accountant),
    demo: row.demo === 1,
  }
}

const PAYMENT_COLUMNS = `p.id, p.booked_on, p.amount_cents, p.currency, p.party, p.party_iban, p.vs, p.ss, p.ks, p.note, p.card,
  p.exempt, p.exempt_note, p.exempt_by, a.iban AS account_iban,
  (SELECT COUNT(*) FROM links l WHERE l.payment_id = p.id) AS docs`

/** A payment that still needs a document, as SQL over the alias p. */
const MISSING = 'p.exempt IS NULL AND NOT EXISTS (SELECT 1 FROM links l WHERE l.payment_id = p.id)'

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
    exempt,
    exemptNote: str(row.exempt_note),
    exemptBy: str(row.exempt_by),
    accountIban: String(row.account_iban ?? ''),
    docs,
    state: exempt ? 'exempt' : docs > 0 ? 'done' : 'missing',
  }
}

const DOC_COLUMNS = `d.id, d.created_at, d.source, d.file_key, d.file_type, d.file_name, d.file_bytes, d.status, d.read_by, d.kind,
  d.party, d.party_ico, d.party_iban, d.number, d.vs, d.issued_on, d.due_on, d.total_cents, d.vat_cents, d.currency,
  d.paid_privately, l.payment_id, l.how`

function docOf(row: Row): Doc {
  return {
    id: String(row.id),
    createdAt: Number(row.created_at),
    source: String(row.source) as Doc['source'],
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
    paidPrivately: row.paid_privately === 1,
    paymentId: str(row.payment_id),
    how: str(row.how),
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Who is signed in
// ---------------------------------------------------------------------------------------------------------------

export async function userByEmail(db: D1Database, email: string): Promise<User | null> {
  const row = await db.prepare('SELECT id, name, email FROM users WHERE email = ?').bind(email.trim()).first<Row>()
  return row ? { id: String(row.id), name: String(row.name), email: String(row.email) } : null
}

/** The company a user signs in to: one where they are the owner first, then any other. */
export async function firstCompanyOf(db: D1Database, userId: string): Promise<string | null> {
  const row = await db
    .prepare("SELECT company_id FROM members WHERE user_id = ? ORDER BY CASE role WHEN 'owner' THEN 0 ELSE 1 END, created_at LIMIT 1")
    .bind(userId)
    .first<{ company_id: string }>()
  return row?.company_id ?? null
}

export interface Who {
  user: User
  company: Company
  role: string
  session: string
}

/** The user and company of a session that has not expired, and only while the user is still a member. */
export async function whoBySession(db: D1Database, sessionId: string): Promise<Who | null> {
  const row = await db
    .prepare(
      `SELECT u.id AS user_id, u.name AS user_name, u.email, m.role, c.*
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       JOIN members m ON m.user_id = s.user_id AND m.company_id = s.company_id
       JOIN companies c ON c.id = s.company_id
       WHERE s.id = ? AND s.expires_at > ?`,
    )
    .bind(sessionId, now())
    .first<Row>()
  if (!row) return null
  return {
    user: { id: String(row.user_id), name: String(row.user_name), email: String(row.email) },
    company: companyOf(row),
    role: String(row.role),
    session: sessionId,
  }
}

export function eventStatement(db: D1Database, e: { company: string | null; user: string | null; action: string; subject?: string | null; detail?: unknown }): D1PreparedStatement {
  return db
    .prepare('INSERT INTO events (at, company_id, user_id, action, subject, detail) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(now(), e.company, e.user, e.action, e.subject ?? null, e.detail === undefined ? null : JSON.stringify(e.detail))
}

// ---------------------------------------------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------------------------------------------

export type PaymentFilter = 'missing' | 'done' | 'all'

export async function listPayments(db: D1Database, company: string, filter: PaymentFilter, limit = 400): Promise<Payment[]> {
  const where =
    filter === 'missing'
      ? `AND ${MISSING}`
      : filter === 'done'
        ? 'AND (p.exempt IS NOT NULL OR EXISTS (SELECT 1 FROM links l WHERE l.payment_id = p.id))'
        : ''
  const rows = await db
    .prepare(`SELECT ${PAYMENT_COLUMNS} FROM payments p JOIN accounts a ON a.id = p.account_id WHERE p.company_id = ? ${where} ORDER BY p.booked_on DESC, p.created_at DESC LIMIT ?`)
    .bind(company, limit)
    .all<Row>()
  return rows.results.map(paymentOf)
}

export async function getPayment(db: D1Database, company: string, id: string): Promise<Payment | null> {
  const row = await db
    .prepare(`SELECT ${PAYMENT_COLUMNS} FROM payments p JOIN accounts a ON a.id = p.account_id WHERE p.company_id = ? AND p.id = ?`)
    .bind(company, id)
    .first<Row>()
  return row ? paymentOf(row) : null
}

export async function countMissing(db: D1Database, company: string): Promise<number> {
  const row = await db.prepare(`SELECT COUNT(*) AS n FROM payments p WHERE p.company_id = ? AND ${MISSING}`).bind(company).first<{ n: number }>()
  return row?.n ?? 0
}

/** What came in and went out in a month, and what the account holds by the newest statement. */
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

export function exemptStatement(db: D1Database, company: string, payment: string, reason: Exempt, note: string | null, by: string): D1PreparedStatement {
  return db
    .prepare(
      `UPDATE payments SET exempt = ?, exempt_note = ?, exempt_by = ?
       WHERE id = ? AND company_id = ? AND exempt IS NULL AND NOT EXISTS (SELECT 1 FROM links l WHERE l.payment_id = payments.id)`,
    )
    .bind(reason, note, by, payment, company)
}

export function clearExemptStatement(db: D1Database, company: string, payment: string): D1PreparedStatement {
  return db.prepare('UPDATE payments SET exempt = NULL, exempt_note = NULL, exempt_by = NULL WHERE id = ? AND company_id = ? AND exempt IS NOT NULL').bind(payment, company)
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

export async function listDocuments(db: D1Database, company: string, filter: DocFilter = 'all', limit = 400): Promise<Doc[]> {
  const rows = await db
    .prepare(
      `SELECT ${DOC_COLUMNS} FROM documents d LEFT JOIN links l ON l.document_id = d.id
       WHERE d.company_id = ? AND d.deleted_at IS NULL ${filter === 'loose' ? 'AND l.document_id IS NULL AND d.paid_privately = 0' : ''}
       ORDER BY d.created_at DESC LIMIT ?`,
    )
    .bind(company, limit)
    .all<Row>()
  return rows.results.map(docOf)
}

export async function getDocument(db: D1Database, company: string, id: string): Promise<Doc | null> {
  const row = await db
    .prepare(`SELECT ${DOC_COLUMNS} FROM documents d LEFT JOIN links l ON l.document_id = d.id WHERE d.company_id = ? AND d.id = ? AND d.deleted_at IS NULL`)
    .bind(company, id)
    .first<Row>()
  return row ? docOf(row) : null
}

export async function documentsOfPayment(db: D1Database, company: string, payment: string): Promise<Doc[]> {
  const rows = await db
    .prepare(`SELECT ${DOC_COLUMNS} FROM documents d JOIN links l ON l.document_id = d.id WHERE d.company_id = ? AND l.payment_id = ? AND d.deleted_at IS NULL ORDER BY l.created_at`)
    .bind(company, payment)
    .all<Row>()
  return rows.results.map(docOf)
}

export interface NewDocument {
  id: string
  company: string
  source: Doc['source']
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
}

export function insertDocumentStatement(db: D1Database, d: NewDocument): D1PreparedStatement {
  const r = d.reading
  return db
    .prepare(
      `INSERT INTO documents (id, company_id, created_at, source, added_by, file_key, file_type, file_name, file_bytes, file_hash, status, read_by,
         kind, party, party_ico, party_iban, number, vs, issued_on, due_on, total_cents, vat_cents, currency)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      d.id, d.company, now(), d.source, d.addedBy, d.fileKey, d.fileType, d.fileName, d.fileBytes, d.fileHash, d.status, d.readBy,
      r?.kind ?? null, r?.party ?? null, r?.partyIco ?? null, r?.partyIban ?? null, r?.number ?? null, r?.vs ?? null,
      r?.issuedOn ?? null, r?.dueOn ?? null, r?.totalCents ?? null, r?.vatCents ?? null, r?.currency ?? null,
    )
}

/** Writes what the reader found; only while the document is still being read, so a second answer changes nothing. */
export function readingStatement(db: D1Database, company: string, doc: string, reading: Reading, by: string): D1PreparedStatement {
  return db
    .prepare(
      `UPDATE documents SET status = 'read', read_by = ?, kind = ?, party = ?, party_ico = ?, party_iban = ?, number = ?, vs = ?,
         issued_on = ?, due_on = ?, total_cents = ?, vat_cents = ?, currency = ?
       WHERE id = ? AND company_id = ? AND status = 'reading'`,
    )
    .bind(by, reading.kind, reading.party, reading.partyIco, reading.partyIban, reading.number, reading.vs, reading.issuedOn, reading.dueOn, reading.totalCents, reading.vatCents, reading.currency, doc, company)
}

export function manualStatement(db: D1Database, company: string, doc: string, why: string): D1PreparedStatement {
  return db.prepare("UPDATE documents SET status = 'manual', read_by = ? WHERE id = ? AND company_id = ? AND status = 'reading'").bind(`person: ${why}`.slice(0, 80), doc, company)
}

export function privatelyStatement(db: D1Database, company: string, doc: string, paid: boolean): D1PreparedStatement {
  return db
    .prepare('UPDATE documents SET paid_privately = ? WHERE id = ? AND company_id = ? AND deleted_at IS NULL AND NOT EXISTS (SELECT 1 FROM links WHERE document_id = documents.id)')
    .bind(paid ? 1 : 0, doc, company)
}

export function deleteDocumentStatements(db: D1Database, company: string, doc: string): D1PreparedStatement[] {
  return [
    db.prepare("DELETE FROM links WHERE document_id = ? AND company_id = ? AND how <> 'accountant'").bind(doc, company),
    db
      .prepare("UPDATE documents SET deleted_at = ? WHERE id = ? AND company_id = ? AND deleted_at IS NULL AND NOT EXISTS (SELECT 1 FROM links WHERE document_id = documents.id AND how = 'accountant')")
      .bind(now(), doc, company),
  ]
}

/** A document of the company with the same file, if it was sent before and not deleted. */
export async function documentByHash(db: D1Database, company: string, hash: string): Promise<string | null> {
  const row = await db.prepare('SELECT id FROM documents WHERE company_id = ? AND file_hash = ? AND deleted_at IS NULL LIMIT 1').bind(company, hash).first<{ id: string }>()
  return row?.id ?? null
}

/** Files added by a company today, to hold back a runaway script. */
export async function filesToday(db: D1Database, company: string): Promise<number> {
  const row = await db.prepare("SELECT COUNT(*) AS n FROM documents WHERE company_id = ? AND source = 'upload' AND created_at > ?").bind(company, now() - 86400).first<{ n: number }>()
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

/** Documents that were read and wait for their payment. */
async function looseRead(db: D1Database, company: string): Promise<Doc[]> {
  return (await listDocuments(db, company, 'loose', 500)).filter((d) => d.status === 'read' && d.totalCents !== null)
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

// ---------------------------------------------------------------------------------------------------------------
// The bank's statement
// ---------------------------------------------------------------------------------------------------------------

export interface Imported {
  added: number
  known: number
  exempt: number
  accounts: number
}

/** Adds what a statement holds and is not known yet; a statement added twice adds nothing the second time. */
export async function importStatements(db: D1Database, company: string, user: string | null, statements: Statement[]): Promise<Imported> {
  const out: Imported = { added: 0, known: 0, exempt: 0, accounts: 0 }
  for (const statement of statements) {
    if (!statement.iban) continue
    await db.prepare('INSERT OR IGNORE INTO accounts (id, company_id, iban) VALUES (?, ?, ?)').bind(crypto.randomUUID(), company, statement.iban).run()
    const account = await db.prepare('SELECT id FROM accounts WHERE company_id = ? AND iban = ?').bind(company, statement.iban).first<{ id: string }>()
    if (!account) continue
    out.accounts++
    const own = (await db.prepare('SELECT iban FROM accounts WHERE company_id = ?').bind(company).all<{ iban: string }>()).results.map((r) => r.iban)
    const fresh: D1PreparedStatement[] = []
    const reasons: (string | null)[] = []
    for (const entry of statement.entries) {
      const reason = autoExempt(entry, own)
      reasons.push(reason)
      fresh.push(insertPaymentStatement(db, company, account.id, entry, reason))
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
    if (statement.closing) {
      await db
        .prepare('UPDATE accounts SET balance_cents = ?, balance_on = ? WHERE id = ? AND (balance_on IS NULL OR balance_on <= ?)')
        .bind(statement.closing.cents, statement.closing.on, account.id, statement.closing.on)
        .run()
    }
  }
  await db.batch([eventStatement(db, { company, user, action: 'statement.imported', detail: out })])
  if (out.added > 0) await matchCompany(db, company)
  return out
}

export function insertPaymentStatement(db: D1Database, company: string, account: string, e: Entry, exempt: string | null): D1PreparedStatement {
  return db
    .prepare(
      `INSERT OR IGNORE INTO payments (id, company_id, account_id, created_at, booked_on, amount_cents, currency, party, party_iban, vs, ss, ks, note, card, ref, exempt, exempt_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(crypto.randomUUID(), company, account, now(), e.bookedOn, e.amountCents, e.currency, e.party, e.partyIban, e.vs, e.ss, e.ks, e.note, e.card ? 1 : 0, e.ref, exempt, exempt ? 'auto' : null)
}

// ---------------------------------------------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------------------------------------------

export async function listMessages(db: D1Database, company: string, limit = 200): Promise<Message[]> {
  const rows = await db
    .prepare(
      `SELECT m.id, m.created_at, m.side, m.author, u.name AS author_name, m.body, m.payment_id
       FROM messages m LEFT JOIN users u ON u.id = m.author WHERE m.company_id = ? ORDER BY m.created_at DESC LIMIT ?`,
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

export function seenStatement(db: D1Database, company: string): D1PreparedStatement {
  return db.prepare("UPDATE messages SET seen_at = ? WHERE company_id = ? AND side = 'firmony' AND seen_at IS NULL").bind(now(), company)
}

export function messageStatement(db: D1Database, m: { id: string; company: string; author: string | null; side: Message['side']; body: string; payment: string | null; at?: number }): D1PreparedStatement {
  return db
    .prepare('INSERT INTO messages (id, company_id, created_at, author, side, body, payment_id) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(m.id, m.company, m.at ?? now(), m.author, m.side, m.body, m.payment)
}
