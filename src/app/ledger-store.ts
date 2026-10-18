// The books in the database: what ledger.ts works them out from, read in one go for a company, and what the
// accountant writes herself: internal documents and the opening balances (ledger_entries, removed only by a mark, so
// that a number once given is never given again), and the account of a payment that has no document.
import { now } from '../db'
import { buildBooks, canonicalAccount, type Books, type LedgerLine, type ManualEntry } from './ledger'
import type { Exempt } from './match'
import { BOOK_DOC_COLUMNS, BOOK_DOC_FROM, bratislavaDay, docOf, type Company } from './store'
import { filedReturns } from './vat-store'
import { ledgerPayroll, runsOf } from './payroll-store'
import { assetEntries } from './assets'
import { assetsOf } from './assets-store'
import { stockEntries } from './stock'
import { stockOf } from './stock-store'
import { ratesFor } from './fx-store'

type Row = Record<string, unknown>
const str = (value: unknown): string | null => (typeof value === 'string' ? value : null)

/** Stored lines, each checked again: an account of the chart on both sides and a whole positive amount. */
export function storedLines(json: unknown): LedgerLine[] {
  if (typeof json !== 'string') return []
  try {
    const value = JSON.parse(json) as unknown
    if (!Array.isArray(value)) return []
    return value.flatMap((line: Record<string, unknown>) => {
      const md = canonicalAccount(str(line?.md))
      const d = canonicalAccount(str(line?.d))
      const cents = Number(line?.cents)
      return md && d && md !== d && Number.isInteger(cents) && cents > 0 ? [{ md, d, cents }] : []
    })
  } catch {
    return []
  }
}

/** The internal documents and the opening balances that stand, in the order of their days. */
export async function manualEntries(db: D1Database, company: string): Promise<ManualEntry[]> {
  const rows = await db
    .prepare(
      `SELECT e.id, e.kind, e.number, e.on_date, e.text, e.lines, e.created_at, u.name AS by_name FROM ledger_entries e LEFT JOIN users u ON u.id = e.created_by
        WHERE e.company_id = ? AND e.deleted_at IS NULL ORDER BY e.on_date, e.created_at, e.id`,
    )
    .bind(company)
    .all<Row>()
  return rows.results.map((r) => ({
    id: String(r.id),
    kind: r.kind === 'opening' ? 'opening' : 'internal',
    number: str(r.number),
    on: String(r.on_date),
    text: String(r.text ?? ''),
    lines: storedLines(r.lines),
    createdAt: Number(r.created_at ?? 0),
    createdByName: str(r.by_name),
  }))
}

/** Everything the books of a company are worked out from, read at once, and the books. */
export async function booksOf(db: D1Database, company: Company): Promise<Books> {
  const [docs, payments, banks, filed, manual, runs, assets, stock] = await Promise.all([
    db.prepare(`SELECT ${BOOK_DOC_COLUMNS} FROM ${BOOK_DOC_FROM} WHERE d.company_id = ? AND d.deleted_at IS NULL ORDER BY d.created_at, d.id`).bind(company.id).all<Row>(),
    db
      .prepare(
        `SELECT p.id, p.booked_on, p.amount_cents, p.currency, p.party, p.party_iban, p.vs, p.note, p.exempt, p.exempt_note, p.contra, p.account_id, COALESCE(a.ledger, '221') AS ledger
           FROM payments p JOIN accounts a ON a.id = p.account_id WHERE p.company_id = ? ORDER BY p.booked_on, p.rowid`,
      )
      .bind(company.id)
      .all<Row>(),
    db.prepare("SELECT id, iban, COALESCE(ledger, '221') AS ledger, balance_cents, balance_on, currency FROM accounts WHERE company_id = ? ORDER BY ledger, iban").bind(company.id).all<Row>(),
    filedReturns(db, company.id),
    manualEntries(db, company.id),
    runsOf(db, company.id),
    assetsOf(db, company.id),
    stockOf(db, company.id),
  ])
  // The rates of every other currency the documents and payments are in.
  const currencies = [...docs.results.map((r) => str(r.currency)), ...payments.results.map((r) => str(r.currency)), ...banks.results.map((r) => str(r.currency))].filter((c): c is string => !!c && c !== 'EUR')
  const rates = await ratesFor(db, currencies)
  // An account's currency: as kept, else the one its payments are all in.
  const paidIn = new Map<string, Set<string>>()
  for (const r of payments.results) paidIn.set(String(r.account_id), (paidIn.get(String(r.account_id)) ?? new Set()).add(String(r.currency ?? 'EUR')))
  const currencyOf = (r: Row): string | null => {
    const kept = str(r.currency)
    if (kept) return kept
    const seen = paidIn.get(String(r.id))
    return seen && seen.size === 1 ? ([...seen][0] ?? null) : null
  }
  return buildBooks({
    company,
    rates,
    docs: docs.results.map(docOf),
    payments: payments.results.map((r) => ({
      id: String(r.id),
      bookedOn: String(r.booked_on),
      amountCents: Number(r.amount_cents),
      currency: String(r.currency ?? 'EUR'),
      party: str(r.party),
      partyIban: str(r.party_iban),
      vs: str(r.vs),
      note: str(r.note),
      exempt: str(r.exempt) as Exempt | null,
      exemptNote: str(r.exempt_note),
      contra: str(r.contra),
      bankId: String(r.account_id),
      bank: String(r.ledger),
    })),
    banks: banks.results.map((r) => ({
      id: String(r.id),
      iban: String(r.iban),
      ledger: String(r.ledger),
      balanceCents: typeof r.balance_cents === 'number' ? r.balance_cents : null,
      balanceOn: str(r.balance_on),
      currency: currencyOf(r),
    })),
    filed,
    manual,
    payroll: runs.map(ledgerPayroll).filter((r): r is NonNullable<typeof r> => r !== null),
    // A month's depreciation reaches the books once the month has ended, in Bratislava.
    assets: assetEntries(assets, bratislavaDay(now())),
    stock: stockEntries(stock.settings, stock.items, stock.moves),
  })
}

const plainLines = (lines: readonly LedgerLine[]): string => JSON.stringify(lines.map(({ md, d, cents }) => ({ md, d, cents })))

/**
 * A new internal document. Its number is the next of the company's year (ID-2027-001), given in the same statement
 * that writes it, so that two at the same moment never share one; a removed document keeps its number.
 */
export function internalStatement(db: D1Database, company: string, entry: { id: string; on: string; text: string; lines: readonly LedgerLine[] }, by: string): D1PreparedStatement {
  const year = Number(entry.on.slice(0, 4))
  return db
    .prepare(
      `INSERT INTO ledger_entries (id, company_id, kind, year, seq, number, on_date, text, lines, created_at, created_by)
       SELECT ?1, ?2, 'internal', ?3, s, printf('ID-%d-%03d', ?3, s), ?4, ?5, ?6, ?7, ?8
         FROM (SELECT COALESCE(MAX(seq), 0) + 1 AS s FROM ledger_entries WHERE company_id = ?2 AND kind = 'internal' AND year = ?3)`,
    )
    .bind(entry.id, company, year, entry.on, entry.text, plainLines(entry.lines), now(), by)
}

/** An internal document removed: marked, never deleted (its number stays taken, and the record of events says who). */
export function removeInternalStatement(db: D1Database, company: string, id: string, by: string): D1PreparedStatement {
  return db.prepare("UPDATE ledger_entries SET deleted_at = ?, deleted_by = ? WHERE id = ? AND company_id = ? AND kind = 'internal' AND deleted_at IS NULL").bind(now(), by, id, company)
}

/** The opening balances written anew: the ones that stood are marked removed, and the new ones (if any) take their place. */
export function openingStatements(db: D1Database, company: string, entry: { id: string; on: string; lines: readonly LedgerLine[] }, by: string): D1PreparedStatement[] {
  const ts = now()
  const out = [db.prepare("UPDATE ledger_entries SET deleted_at = ?, deleted_by = ? WHERE company_id = ? AND kind = 'opening' AND deleted_at IS NULL").bind(ts, by, company)]
  if (entry.lines.length > 0) {
    out.push(
      db
        .prepare("INSERT INTO ledger_entries (id, company_id, kind, year, number, on_date, text, lines, created_at, created_by) VALUES (?, ?, 'opening', ?, 'PS', ?, 'Počiatočné stavy', ?, ?, ?)")
        .bind(entry.id, company, Number(entry.on.slice(0, 4)), entry.on, plainLines(entry.lines), ts, by),
    )
  }
  return out
}

/** The account the accountant gave a payment that has no document to book it by; null puts its reason's back. */
export function contraStatement(db: D1Database, company: string, payment: string, account: string | null): D1PreparedStatement {
  return db.prepare('UPDATE payments SET contra = ? WHERE id = ? AND company_id = ?').bind(account, payment, company)
}
