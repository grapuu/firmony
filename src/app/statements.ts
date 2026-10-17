// Bank statements as records (14 October 2026). His word of that day, when Enable Banking asked 900 € a month: avoid
// it and still be "elita top smooth jednoduchy smart". So the bank comes in three ways that cost nothing: a statement
// the bank itself sends every day to the company's address for documents (set once in the bank; Slovenská
// sporiteľňa sends SEPA XML daily), the movements Fio banka gives for the client's own token (fio.ts), and a statement
// added on a page. Enable Banking stays built for when the number of clients pays for it.
//
// Every statement is kept with its file: a bank statement is an accounting document (Act No. 431/2002 Z. z., s. 35:
// ten years). What may come from anybody is checked before it touches the books. A statement sent by email
// - for an account the company does not have yet waits for the owner's yes ("Je to účet Vašej firmy?");
// - for one it has is taken when it follows the last one: it opens with the balance the last one closed with, and its
//   own figures add up (opening and movements make the closing). One that does not waits for the accountant, who takes
//   it or refuses it. A stranger who knows an IBAN (it is on every invoice) does not know its balance.
// A statement a member of the company adds on a page is taken as before: whoever adds it is signed in.
import { bell, ringStatement } from '../bell'
import { BRAND } from '../config'
import { now } from '../db'
import { fileHash } from './read'
import type { AppBindings } from './routes'
import { accountFor, balanceStatement, booksFromSql, eventStatement, importEntries, matchCompany, type Company } from './store'
import { readStatement, type Statement } from './xml'

export type StatementSource = 'upload' | 'email'
export type StatementStatus = 'taken' | 'known' | 'confirm' | 'held' | 'refused'

/** Why a statement waits for the accountant. */
export interface HeldReason {
  kind: 'gap' | 'sum' | 'overlap' | 'opening' | 'unknown'
  /** The balance the statement opens with, and the last one the books know (closing of the statement before). */
  opening?: number | null
  last?: { cents: number; on: string } | null
  /** What its movements make of its opening, against what it says it closes with. */
  sum?: number | null
  closing?: number | null
}

export interface AccountState {
  balanceCents: number | null
  balanceOn: string | null
}

/** Opening and movements make the closing, to the cent. */
export function sumsUp(s: Statement): boolean {
  if (!s.opening || !s.closing) return false
  return s.opening.cents + s.entries.reduce((sum, e) => sum + e.amountCents, 0) === s.closing.cents
}

export type Verdict = { status: 'taken' } | { status: 'known' | 'confirm' } | { status: 'held'; reason: HeldReason }

/**
 * What becomes of one statement. `account` is null when the company has no account of its IBAN; `known` holds the
 * references the account's payments already carry; `trusted` is a member who adds it on a page.
 */
export function verdictOf(s: Statement, account: AccountState | null, known: ReadonlySet<string>, trusted: boolean): Verdict {
  if (!account) return trusted ? { status: 'taken' } : { status: 'confirm' }
  if (trusted) return { status: 'taken' }
  // The same statement again (a bank that sends it twice, a monthly one after the daily ones): nothing new, nothing to ask.
  if (s.entries.every((e) => known.has(e.ref))) return { status: 'known' }
  if (!s.opening || !s.closing) return { status: 'held', reason: { kind: 'opening' } }
  const sum = s.opening.cents + s.entries.reduce((total, e) => total + e.amountCents, 0)
  if (sum !== s.closing.cents) return { status: 'held', reason: { kind: 'sum', opening: s.opening.cents, sum, closing: s.closing.cents } }
  // An account whose balance we do not know yet (its link never said it): nothing to hold the statement to.
  if (account.balanceOn === null || account.balanceCents === null) return { status: 'held', reason: { kind: 'unknown', opening: s.opening.cents } }
  const last = { cents: account.balanceCents, on: account.balanceOn }
  const starts = s.from ?? s.opening.on
  if (starts < account.balanceOn) return { status: 'held', reason: { kind: 'overlap', opening: s.opening.cents, last } }
  return s.opening.cents === account.balanceCents ? { status: 'taken' } : { status: 'held', reason: { kind: 'gap', opening: s.opening.cents, last } }
}

export interface Taken {
  /** Statements in the file (a file may hold one for each account). */
  statements: number
  added: number
  known: number
  /** Statements that wait: for the owner (a new account), for the accountant (they do not follow). */
  confirm: number
  held: number
}

type Row = Record<string, unknown>

async function accountState(db: D1Database, company: string, iban: string): Promise<(AccountState & { id: string }) | null> {
  const row = await db.prepare('SELECT id, balance_cents, balance_on FROM accounts WHERE company_id = ? AND iban = ?').bind(company, iban).first<Row>()
  if (!row) return null
  return { id: String(row.id), balanceCents: typeof row.balance_cents === 'number' ? row.balance_cents : null, balanceOn: typeof row.balance_on === 'string' ? row.balance_on : null }
}

async function knownRefs(db: D1Database, company: string, account: string, s: Statement): Promise<Set<string>> {
  const days = s.entries.map((e) => e.bookedOn).sort()
  if (days.length === 0) return new Set()
  const rows = await db
    .prepare('SELECT ref FROM payments WHERE company_id = ? AND account_id = ? AND booked_on BETWEEN ? AND ?')
    .bind(company, account, days[0], days[days.length - 1])
    .all<{ ref: string }>()
  return new Set(rows.results.map((r) => r.ref))
}

/** Takes one statement into the books: its payments, and its closing balance when it is the newest. */
async function take(db: D1Database, company: string, account: string, s: Statement): Promise<{ added: number; known: number }> {
  const result = await importEntries(db, company, account, s.entries, 'statement')
  if (s.closing) await balanceStatement(db, account, s.closing.cents, s.closing.on).run()
  return { added: result.added, known: result.known }
}

function insertStatement(
  db: D1Database,
  row: {
    id: string
    company: string
    account: string | null
    s: Statement
    source: StatementSource
    by: string | null
    sender: string | null
    fileKey: string | null
    hash: string
    name: string
    part: number
    status: StatementStatus
    reason: HeldReason | null
    added: number
    known: number
  },
): D1PreparedStatement {
  const { s } = row
  return db
    .prepare(
      `INSERT INTO statements (id, company_id, account_id, iban, created_at, source, added_by, sender, file_key, file_hash, file_name, part, number, from_on, to_on,
         opening_cents, opening_on, closing_cents, closing_on, entries, added, known, status, reason)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      row.id,
      row.company,
      row.account,
      s.iban,
      now(),
      row.source,
      row.by,
      row.sender?.slice(0, 200) ?? null,
      row.fileKey,
      row.hash,
      row.name.slice(0, 120),
      row.part,
      s.number,
      s.from ?? s.opening?.on ?? null,
      s.to ?? s.closing?.on ?? null,
      s.opening?.cents ?? null,
      s.opening?.on ?? null,
      s.closing?.cents ?? null,
      s.closing?.on ?? null,
      s.entries.length,
      row.added,
      row.known,
      row.status,
      row.reason ? JSON.stringify(row.reason) : null,
    )
}

/** Where a statement waits, said to whoever decides: the owners for a new account, the accountant for one that does not follow. */
async function ringFor(db: D1Database, company: Company, status: 'confirm' | 'held', id: string, origin: string): Promise<D1PreparedStatement[]> {
  if (status === 'held') return [ringStatement(db, 'statement-held', id, company.accountantEmail ?? BRAND.email, bell.teamStatement(`${origin}/ucto/klienti/${company.id}#vypisy`))]
  const owners = await db.prepare("SELECT u.email FROM members m JOIN users u ON u.id = m.user_id WHERE m.company_id = ? AND m.role = 'owner'").bind(company.id).all<{ email: string }>()
  return owners.results.map((o) => ringStatement(db, 'statement-confirm', id, o.email, bell.statementConfirm(`${origin}/app/banka#vypisy`)))
}

/**
 * Takes a file that may be a bank statement (camt.053). Null when it is none: the caller keeps it as a document. The
 * same file twice is taken once; a file with statements of several accounts is a statement for each.
 */
export async function takeStatementFile(
  env: AppBindings,
  company: Company,
  by: { user: string | null; source: StatementSource; sender?: string | null },
  file: { name: string; bytes: Uint8Array },
  origin: string = BRAND.origin,
): Promise<Taken | null> {
  const parsed = readStatement(new TextDecoder().decode(file.bytes))
  const statements = (parsed ?? []).filter((s) => s.iban)
  if (statements.length === 0) return null
  const db = env.DB
  const out: Taken = { statements: statements.length, added: 0, known: 0, confirm: 0, held: 0 }
  const hash = await fileHash(file.bytes)
  const seen = await db.prepare('SELECT COUNT(*) AS n FROM statements WHERE company_id = ? AND file_hash = ?').bind(company.id, hash).first<{ n: number }>()
  if ((seen?.n ?? 0) > 0) {
    out.known = statements.reduce((n, s) => n + s.entries.length, 0)
    return out
  }
  const fileId = crypto.randomUUID()
  const fileKey = env.FILES ? `companies/${company.id}/statements/${fileId}.xml` : null
  if (env.FILES && fileKey) await env.FILES.put(fileKey, file.bytes, { httpMetadata: { contentType: 'application/xml' } })
  const trusted = by.source === 'upload' && by.user !== null
  const rows: D1PreparedStatement[] = []
  let anyTaken = false
  for (const [part, s] of statements.entries()) {
    const iban = s.iban as string
    let account = await accountState(db, company.id, iban)
    if (!account && trusted) {
      const id = await accountFor(db, company.id, iban)
      account = id ? { id, balanceCents: null, balanceOn: null } : null
    }
    const verdict = verdictOf(s, account, account ? await knownRefs(db, company.id, account.id, s) : new Set(), trusted)
    const id = crypto.randomUUID()
    let added = 0
    let known = 0
    if (verdict.status === 'taken' && account) {
      ;({ added, known } = await take(db, company.id, account.id, s))
      anyTaken = true
    } else if (verdict.status === 'known') known = s.entries.length
    out.added += added
    out.known += known
    if (verdict.status === 'confirm') out.confirm++
    if (verdict.status === 'held') out.held++
    const reason = verdict.status === 'held' ? verdict.reason : null
    rows.push(
      insertStatement(db, {
        id,
        company: company.id,
        account: account?.id ?? null,
        s,
        source: by.source,
        by: by.user,
        sender: by.sender ?? null,
        fileKey,
        hash,
        name: file.name,
        part,
        status: verdict.status,
        reason,
        added,
        known,
      }),
      eventStatement(db, {
        company: company.id,
        user: by.user,
        action: `statement.${verdict.status}`,
        subject: id,
        detail: { source: by.source, entries: s.entries.length, added, known, ...(reason ? { reason: reason.kind } : {}) },
      }),
    )
    if (verdict.status === 'confirm' || verdict.status === 'held') rows.push(...(await ringFor(db, company, verdict.status, id, origin)))
  }
  await db.batch(rows)
  if (anyTaken && out.added > 0) await matchCompany(db, company.id)
  return out
}

/** A statement as it was kept: read again from its file. */
async function storedStatement(env: AppBindings, row: { file_key: string | null; part: number }): Promise<Statement | null> {
  if (!row.file_key || !env.FILES) return null
  const object = await env.FILES.get(row.file_key)
  if (!object) return null
  const all = readStatement(await object.text())
  return all?.filter((s) => s.iban)[row.part] ?? null
}

/**
 * The owner's answer about an account a statement came for. Yes: the account becomes the company's and every
 * statement that waited for it is taken, the oldest first, as if it had come now (the first one opens the account,
 * the next ones have to follow it). No: they are refused, and nothing of them reaches the books.
 */
export async function answerAccount(
  env: AppBindings,
  company: Company,
  user: string,
  statementId: string,
  yes: boolean,
  origin: string = BRAND.origin,
): Promise<{ iban: string; taken: number } | null> {
  const db = env.DB
  const first = await db.prepare("SELECT iban FROM statements WHERE id = ? AND company_id = ? AND status = 'confirm'").bind(statementId, company.id).first<{ iban: string }>()
  if (!first) return null
  const waiting = await db
    .prepare("SELECT id, file_key, part FROM statements WHERE company_id = ? AND iban = ? AND status = 'confirm' ORDER BY COALESCE(from_on, opening_on, ''), created_at")
    .bind(company.id, first.iban)
    .all<{ id: string; file_key: string | null; part: number }>()
  if (!yes) {
    await db.batch([
      db.prepare("UPDATE statements SET status = 'refused', decided_at = ?, decided_by = ? WHERE company_id = ? AND iban = ? AND status = 'confirm'").bind(now(), user, company.id, first.iban),
      eventStatement(db, { company: company.id, user, action: 'statement.account.refused', subject: statementId, detail: { statements: waiting.results.length } }),
    ])
    return { iban: first.iban, taken: 0 }
  }
  const accountId = await accountFor(db, company.id, first.iban)
  if (!accountId) return null
  let taken = 0
  let added = 0
  const rings: D1PreparedStatement[] = []
  for (const row of waiting.results) {
    const s = await storedStatement(env, row)
    const account = await accountState(db, company.id, first.iban)
    if (!s || !account) {
      await db
        .prepare("UPDATE statements SET status = 'held', reason = ?, account_id = ? WHERE id = ?")
        .bind(JSON.stringify({ kind: 'opening' }), accountId, row.id)
        .run()
      continue
    }
    // The first statement of the account opens it; the ones after it are judged as if they had come now.
    const verdict = taken === 0 ? ({ status: 'taken' } as Verdict) : verdictOf(s, account, await knownRefs(db, company.id, accountId, s), false)
    if (verdict.status === 'taken') {
      const result = await take(db, company.id, accountId, s)
      added += result.added
      taken++
      await db
        .prepare("UPDATE statements SET status = 'taken', account_id = ?, added = ?, known = ?, decided_at = ?, decided_by = ? WHERE id = ?")
        .bind(accountId, result.added, result.known, now(), user, row.id)
        .run()
    } else {
      await db
        .prepare('UPDATE statements SET status = ?, account_id = ?, reason = ?, known = ? WHERE id = ?')
        .bind(verdict.status, accountId, verdict.status === 'held' ? JSON.stringify(verdict.reason) : null, verdict.status === 'known' ? s.entries.length : 0, row.id)
        .run()
      // One that does not follow the one before it waits for the accountant, who is told.
      if (verdict.status === 'held') rings.push(...(await ringFor(db, company, 'held', row.id, origin)))
    }
  }
  await db.batch([
    eventStatement(db, { company: company.id, user, action: 'statement.account.confirmed', subject: statementId, detail: { statements: waiting.results.length, taken, added } }),
    ...rings,
  ])
  if (added > 0) await matchCompany(db, company.id)
  return { iban: first.iban, taken }
}

/** The accountant's answer about a statement that did not follow: taken as it is, or refused. */
export async function answerHeld(env: AppBindings, company: Company, user: string, statementId: string, take_: boolean): Promise<boolean> {
  const db = env.DB
  const row = await db
    .prepare("SELECT id, account_id, iban, file_key, part FROM statements WHERE id = ? AND company_id = ? AND status = 'held'")
    .bind(statementId, company.id)
    .first<{ id: string; account_id: string | null; iban: string; file_key: string | null; part: number }>()
  if (!row) return false
  if (!take_) {
    await db.batch([
      db.prepare("UPDATE statements SET status = 'refused', decided_at = ?, decided_by = ? WHERE id = ? AND status = 'held'").bind(now(), user, row.id),
      eventStatement(db, { company: company.id, user, action: 'statement.refused', subject: row.id }),
    ])
    return true
  }
  const s = await storedStatement(env, row)
  const accountId = row.account_id ?? (await accountFor(db, company.id, row.iban))
  if (!s || !accountId) return false
  const result = await take(db, company.id, accountId, s)
  await db.batch([
    db
      .prepare("UPDATE statements SET status = 'taken', account_id = ?, added = ?, known = ?, decided_at = ?, decided_by = ? WHERE id = ? AND status = 'held'")
      .bind(accountId, result.added, result.known, now(), user, row.id),
    eventStatement(db, { company: company.id, user, action: 'statement.accepted', subject: row.id, detail: { added: result.added, known: result.known } }),
  ])
  if (result.added > 0) await matchCompany(db, company.id)
  return true
}

// ---------------------------------------------------------------------------------------------------------------
// What the pages show
// ---------------------------------------------------------------------------------------------------------------

export interface StatementView {
  id: string
  iban: string
  createdAt: number
  source: StatementSource
  number: string | null
  from: string | null
  to: string | null
  opening: number | null
  closing: number | null
  entries: number
  added: number
  known: number
  status: StatementStatus
  reason: HeldReason | null
  fileName: string | null
  hasFile: boolean
}

function viewOf(r: Row): StatementView {
  let reason: HeldReason | null = null
  if (typeof r.reason === 'string') {
    try {
      reason = JSON.parse(r.reason) as HeldReason
    } catch {
      reason = null
    }
  }
  return {
    id: String(r.id),
    iban: String(r.iban),
    createdAt: Number(r.created_at),
    source: r.source === 'email' ? 'email' : 'upload',
    number: typeof r.number === 'string' ? r.number : null,
    from: typeof r.from_on === 'string' ? r.from_on : null,
    to: typeof r.to_on === 'string' ? r.to_on : null,
    opening: typeof r.opening_cents === 'number' ? r.opening_cents : null,
    closing: typeof r.closing_cents === 'number' ? r.closing_cents : null,
    entries: Number(r.entries ?? 0),
    added: Number(r.added ?? 0),
    known: Number(r.known ?? 0),
    status: String(r.status) as StatementStatus,
    reason,
    fileName: typeof r.file_name === 'string' ? r.file_name : null,
    hasFile: typeof r.file_key === 'string',
  }
}

const COLUMNS = 'id, iban, created_at, source, number, from_on, to_on, opening_cents, closing_cents, entries, added, known, status, reason, file_name, file_key'

/** The newest statements of a company, and every one that waits, whatever its age. */
export async function statementsOf(db: D1Database, company: string, limit = 12): Promise<StatementView[]> {
  const rows = await db
    .prepare(
      `SELECT ${COLUMNS} FROM statements WHERE company_id = ? AND (status IN ('confirm', 'held') OR id IN (SELECT id FROM statements WHERE company_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?))
       ORDER BY created_at DESC, rowid DESC`,
    )
    .bind(company, company, limit)
    .all<Row>()
  return rows.results.map(viewOf)
}

export async function statementById(db: D1Database, company: string, id: string): Promise<(StatementView & { fileKey: string | null }) | null> {
  const row = await db.prepare(`SELECT ${COLUMNS} FROM statements WHERE id = ? AND company_id = ?`).bind(id, company).first<Row>()
  return row ? { ...viewOf(row), fileKey: typeof row.file_key === 'string' ? row.file_key : null } : null
}

/** The last day of the month before the one of a day: 2026-11-14 → 2026-10-31. */
export function lastDayBefore(day: string): string {
  const first = new Date(`${day.slice(0, 7)}-01T12:00:00Z`)
  first.setUTCDate(0)
  return first.toISOString().slice(0, 10)
}

/**
 * The month whose statement is still to be added (YYYY-MM), or null. From the first day of a month, an account that no
 * link reads and whose statements are not sent by the bank itself has to have a statement that reaches the last day
 * of the month before. A statement the bank sends every day comes only on days with a movement, so it is not asked
 * for; a link reads by itself. A company without accounts is asked by its first steps instead.
 */
export async function statementDue(db: D1Database, company: string, today: string): Promise<string | null> {
  const end = lastDayBefore(today)
  const rows = await db
    .prepare(
      `SELECT a.id, a.balance_on,
              (SELECT s.source FROM statements s WHERE s.account_id = a.id AND s.status IN ('taken', 'known') ORDER BY COALESCE(s.closing_on, '') DESC, s.created_at DESC LIMIT 1) AS source
         FROM accounts a WHERE a.company_id = ?1
          AND NOT EXISTS (SELECT 1 FROM bank_links l WHERE l.id = a.link_id AND l.status = 'active')
          -- A month before our books start is the former accountant's: no statement of it is due.
          AND ?2 >= ${booksFromSql('?1')}`,
    )
    .bind(company, end)
    .all<{ id: string; balance_on: string | null; source: string | null }>()
  const due = rows.results.some((a) => a.source !== 'email' && (a.balance_on === null || a.balance_on < end))
  return due ? end.slice(0, 7) : null
}
