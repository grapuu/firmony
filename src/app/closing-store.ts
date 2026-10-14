// The closings in the database (closings, schema step 7): what the accountant set for a company's year, the deadline a
// notice moved, the internal document that books the tax, and the filing with what it asked the client to pay. And what
// the bank shows paid towards the income tax: the advances of a year (to the income tax's account, prefix 500224, with
// an advance's symbol of the year: 1100, the month, or 4 and the quarter, or 00, and the year) and the tax of a year
// (its own symbol, 170099 and the year). The rules are in closing.ts, the form in closing-form.ts, the page in
// views/closing.tsx; `closingView` puts a year together for the page and its files.
import { now } from '../db'
import { booksOf, internalStatement, removeInternalStatement } from './ledger-store'
import type { Books } from './ledger'
import {
  changedSinceFiled,
  closingDue,
  closingIssues,
  proposeTax,
  statementsOf,
  taxInputOf,
  taxOf,
  type ClosingInputs,
  type ClosingIssue,
  type Lines,
  type Proposal,
  type Statements,
  type TaxInput,
  type TaxResult,
  type TaxRows,
} from './closing'
import { storedInputs } from './closing-form'
import type { Company } from './store'
import { INCOME_PREFIX, TREASURY_BANK } from './vat-store'

type Row = Record<string, unknown>
const str = (value: unknown): string | null => (typeof value === 'string' ? value : null)

/** What was filed: the return's rows, the statements in whole euros, and the advances it brings for the next period. */
export interface FiledClosing {
  rows: TaxRows
  balance: Lines
  profit: Lines
  advancesNext: TaxResult['advancesNext']
}

export interface Closing {
  year: number
  inputs: ClosingInputs
  savedAt: number | null
  savedByName: string | null
  extendedTo: string | null
  /** The internal document that books the tax (ledger_entries.id). */
  taxEntry: string | null
  filedOn: string | null
  filedByName: string | null
  filed: FiledClosing | null
  /** The tax the filing asked the client to pay (row 1100), and by when. */
  payCents: number
  dueOn: string | null
}

const numbers = (value: unknown): Record<string, number> =>
  Object.fromEntries(Object.entries(value && typeof value === 'object' ? value : {}).filter(([, n]) => typeof n === 'number' && Number.isFinite(n))) as Record<string, number>

function filedOf(json: unknown): FiledClosing | null {
  if (typeof json !== 'string') return null
  try {
    const v = JSON.parse(json) as Partial<FiledClosing>
    const kind = v.advancesNext?.kind
    return {
      rows: numbers(v.rows),
      balance: numbers(v.balance),
      profit: numbers(v.profit),
      advancesNext: { kind: kind === 'monthly' || kind === 'quarterly' ? kind : 'none', each: Number(v.advancesNext?.each ?? 0) || 0 },
    }
  } catch {
    return null
  }
}

function closingOf(r: Row): Closing {
  const filedAt = typeof r.filed_at === 'number' ? r.filed_at : null
  return {
    year: Number(r.year),
    inputs: storedInputs(r.inputs),
    savedAt: typeof r.saved_at === 'number' ? r.saved_at : null,
    savedByName: str(r.saved_by_name),
    extendedTo: str(r.extended_to),
    taxEntry: str(r.tax_entry),
    filedOn: filedAt === null ? null : str(r.filed_on),
    filedByName: str(r.filed_by_name),
    filed: filedAt === null ? null : (filedOf(r.filed) ?? { rows: {}, balance: {}, profit: {}, advancesNext: { kind: 'none', each: 0 } }),
    payCents: Number(r.pay_cents ?? 0),
    dueOn: str(r.due_on),
  }
}

/** Every closing of a company, the newest year first. */
export async function closingsOf(db: D1Database, company: string): Promise<Closing[]> {
  const rows = await db
    .prepare(
      `SELECT k.*, s.name AS saved_by_name, f.name AS filed_by_name FROM closings k LEFT JOIN users s ON s.id = k.saved_by LEFT JOIN users f ON f.id = k.filed_by
        WHERE k.company_id = ? ORDER BY k.year DESC`,
    )
    .bind(company)
    .all<Row>()
  return rows.results.map(closingOf)
}

/** What the accountant set for a year, kept while the closing is not filed. */
export function saveInputsStatement(db: D1Database, company: string, year: number, inputs: ClosingInputs, by: string): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO closings (company_id, year, inputs, saved_at, saved_by) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (company_id, year) DO UPDATE SET inputs = excluded.inputs, saved_at = excluded.saved_at, saved_by = excluded.saved_by WHERE closings.filed_at IS NULL`,
    )
    .bind(company, year, JSON.stringify(inputs), now(), by)
}

/** The deadline a notice moved (§ 49(3)), or taken back (null); while the closing is not filed. */
export function extendStatement(db: D1Database, company: string, year: number, to: string | null): D1PreparedStatement {
  return db
    .prepare('INSERT INTO closings (company_id, year, extended_to) VALUES (?, ?, ?) ON CONFLICT (company_id, year) DO UPDATE SET extended_to = excluded.extended_to WHERE closings.filed_at IS NULL')
    .bind(company, year, to)
}

/**
 * The tax of a year booked by an internal document on its last day (591 against 341, the whole tax of row 1050: the
 * advances paid were booked to 341 already), in place of the one booked before; nought books nothing.
 */
export function bookTaxStatements(db: D1Database, company: string, year: number, cents: number, previous: string | null, by: string): D1PreparedStatement[] {
  const out: D1PreparedStatement[] = []
  if (previous) out.push(removeInternalStatement(db, company, previous, by))
  const id = cents > 0 ? crypto.randomUUID() : null
  if (id) out.push(internalStatement(db, company, { id, on: `${year}-12-31`, text: `Daň z príjmov za rok ${year}`, lines: [{ md: '591', d: '341', cents }] }, by))
  out.push(
    db
      .prepare('INSERT INTO closings (company_id, year, tax_entry) VALUES (?, ?, ?) ON CONFLICT (company_id, year) DO UPDATE SET tax_entry = excluded.tax_entry WHERE closings.filed_at IS NULL')
      .bind(company, year, id),
  )
  return out
}

/** The closing marked as filed, once: what was filed, the tax it asks for and by when. */
export function fileClosingStatement(db: D1Database, company: string, year: number, filed: FiledClosing, payCents: number, dueOn: string, by: string, today: string): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO closings (company_id, year, filed_on, filed_at, filed_by, filed, pay_cents, due_on) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (company_id, year) DO UPDATE SET filed_on = excluded.filed_on, filed_at = excluded.filed_at, filed_by = excluded.filed_by, filed = excluded.filed,
         pay_cents = excluded.pay_cents, due_on = excluded.due_on WHERE closings.filed_at IS NULL`,
    )
    .bind(company, year, today, now(), by, JSON.stringify(filed), payCents, dueOn)
}

/** A mark set by mistake taken back: what the accountant set stays. */
export function unfileClosingStatement(db: D1Database, company: string, year: number): D1PreparedStatement {
  return db
    .prepare('UPDATE closings SET filed_on = NULL, filed_at = NULL, filed_by = NULL, filed = NULL, pay_cents = NULL, due_on = NULL WHERE company_id = ? AND year = ? AND filed_at IS NOT NULL')
    .bind(company, year)
}

/** The income tax's accounts at the State Treasury, as an IBAN has them after its check digits: 8180 and 500224. */
const INCOME_BBAN = `${TREASURY_BANK}${INCOME_PREFIX}`

/** The variable symbol of the income tax of a year (not of its advances): 170099 and the year. */
export const incomeSymbol = (year: number): string => `170099${year}`

export interface IncomePaid {
  /** The advances paid for the year, to the income tax's account with a symbol of the year (row 1010 proposed). */
  advances: number
  /** The tax of the year paid with its own symbol, and the last day it was. */
  tax: number
  last: string | null
}

/** What the bank shows paid towards a year's income tax. An advance shares its symbol with VAT's, so only one to the income tax's account counts. */
export async function incomePaid(db: D1Database, company: string, year: number): Promise<IncomePaid> {
  const y = String(year)
  const r = await db
    .prepare(
      `SELECT
         (SELECT COALESCE(-SUM(amount_cents), 0) FROM payments WHERE company_id = ?1 AND amount_cents < 0 AND length(ltrim(vs, '0')) = 10 AND ltrim(vs, '0') LIKE '1100__' || ?2
            AND substr(upper(replace(COALESCE(party_iban, ''), ' ', '')), 5, 10) = ?3) AS advances,
         (SELECT COALESCE(-SUM(amount_cents), 0) FROM payments WHERE company_id = ?1 AND amount_cents < 0 AND ltrim(vs, '0') = ?4) AS tax,
         (SELECT MAX(booked_on) FROM payments WHERE company_id = ?1 AND amount_cents < 0 AND ltrim(vs, '0') = ?4) AS last`,
    )
    .bind(company, y, INCOME_BBAN, incomeSymbol(year))
    .first<Row>()
  return { advances: Number(r?.advances ?? 0), tax: Number(r?.tax ?? 0), last: str(r?.last) }
}

/** A year's closing put together: the statements, the return, what keeps it from being filed, where it stands. */
export interface ClosingView {
  year: number
  closing: Closing | null
  books: Books
  statements: Statements
  /** The year before, when the books hold it (the statements show it beside). */
  previous: Statements | null
  proposal: Proposal
  /** What the accountant set (the activity of the last year that has one when this one has none). */
  inputs: ClosingInputs
  input: TaxInput
  tax: TaxResult
  paid: IncomePaid
  /** The tax of the year booked on 591. */
  booked: number
  issues: ClosingIssue[]
  running: boolean
  due: string
  changed: { rows: string[]; statements: boolean } | null
}

export async function closingView(db: D1Database, company: Company, year: number, today: string, loaded?: { books?: Books; closings?: Closing[] }): Promise<ClosingView> {
  const [books, closings, paid] = await Promise.all([loaded?.books ?? booksOf(db, company), loaded?.closings ?? closingsOf(db, company.id), incomePaid(db, company.id, year)])
  const closing = closings.find((k) => k.year === year) ?? null
  const statements = statementsOf(books, year)
  const previous = books.start && books.start < `${year}-01-01` ? statementsOf(books, year - 1) : null
  const proposal = proposeTax(statements)
  // The activity is the company's: what was set for the year, else the last year that has it.
  const stored = closing?.inputs ?? storedInputs(null)
  const earlier = closings.find((k) => k.year < year && k.inputs.nace)?.inputs
  const own = stored.nace || !earlier ? stored : { ...stored, nace: earlier.nace, activity: stored.activity || earlier.activity }
  const input = taxInputOf(year, proposal, own, { advances: paid.advances })
  const tax = taxOf(input)
  const booked = statements.accounts['591'] ?? 0
  const running = today <= `${year}-12-31`
  return {
    year,
    closing,
    books,
    statements,
    previous,
    proposal,
    inputs: own,
    input,
    tax,
    paid,
    booked,
    issues: closingIssues({ books, year, company, nace: own.nace, statements, tax: running ? null : { computed: tax.rows.r1050 ?? 0, booked } }),
    running,
    due: closing?.dueOn ?? closingDue(year, closing?.extendedTo ?? null),
    changed: closing?.filed ? changedSinceFiled(closing.filed, tax, statements) : null,
  }
}
