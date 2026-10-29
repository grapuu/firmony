// The closings in the database (closings, schema step 7): what the accountant set for a company's year, the deadline a
// notice moved, the internal document that books the tax, and the filing with what it asked the client to pay. And what
// the bank shows paid towards the income tax: the advances of a year (to the income tax's account, prefix 500224, with
// an advance's symbol of the year: 1100, the month, or 4 and the quarter, or 00, and the year) and the tax of a year
// (its own symbol, 170099 and the year). The rules are in closing.ts, the form in closing-form.ts, the page in
// views/closing.tsx; `closingView` puts a year together for the page and its files.
import { now } from '../db'
import { deliveryStatusSql, revisableSql, safeJson, type DeliveryStatus, type FilingFile } from '../filings/model'
import { booksOf } from './ledger-store'
import { assetYear, temporaryDifferences, type Asset } from './assets'
import type { NotesSource } from './notes'
import { assetsOf } from './assets-store'
import { employeesOf } from './payroll-store'
import { priorStatementsOf, statementsOfPrior } from './takeover-store'
import type { Books } from './ledger'
import {
  auditOf,
  averageEmployees,
  changedSinceFiled,
  closingBalancesByYear,
  closingDue,
  closingIssues,
  deferredTaxOf,
  DEFERRED_ASSET,
  DEFERRED_LIABILITY,
  formOf,
  proposeSize,
  proposeTax,
  statementsFrom,
  taxInputOf,
  taxOf,
  taxRate,
  type ClosingInputs,
  type DeferredResult,
  type EntitySize,
  type SizeFigures,
  type SizeReason,
  type ClosingIssue,
  type Lines,
  type Proposal,
  type Statements,
  type TaxInput,
  type TaxResult,
  type TaxRows,
} from './closing'
import { storedInputs, type ClosingFound } from './closing-form'
import type { Company } from './store'
import { distributionOf, equityOf, type Distribution, type EntryLine, type Equity } from './distribution'
import { INCOME_PREFIX, TREASURY_BANK } from './vat-store'

type Row = Record<string, unknown>
const str = (value: unknown): string | null => (typeof value === 'string' ? value : null)

/** What was filed: the return's rows, the statements in whole euros (Úč POD's gross amounts too), and the advances it brings for the next period. */
export interface FiledClosing {
  rows: TaxRows
  balance: Lines
  profit: Lines
  gross?: Lines
  advancesNext: TaxResult['advancesNext']
  files?: ClosingFiles
}

/** Exact UTF-8 files prepared when the closing was marked as filed. Legacy filings may not have them. */
export interface ClosingFiles {
  version: 1
  declaredOn: string
  return: FilingFile
  statements: FilingFile
  /** The notes as they were when the podklady were saved: a PDF, which is ASCII text (pdf.ts). */
  notes?: { name: string; text: string; sha256: string }
}

export interface Closing {
  deliveryStatus?: DeliveryStatus
  canReprepare?: boolean
  year: number
  revision: number
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
  /** The year's result distributed as the general meeting decided (distribution.ts), and the internal documents that book it. */
  distribution: Distribution | null
  distributionEntries: string[]
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
      ...(v.gross && typeof v.gross === 'object' ? { gross: numbers(v.gross) } : {}),
      advancesNext: { kind: kind === 'monthly' || kind === 'quarterly' ? kind : 'none', each: Number(v.advancesNext?.each ?? 0) || 0 },
      ...(v.files?.version === 1 && typeof v.files.return?.xml === 'string' && typeof v.files.return.name === 'string' && typeof v.files.statements?.xml === 'string' && typeof v.files.statements.name === 'string' ? { files: v.files } : {}),
    }
  } catch {
    return null
  }
}

function closingOf(r: Row): Closing {
  const filedAt = typeof r.filed_at === 'number' ? r.filed_at : null
  return {
    deliveryStatus: (typeof r.delivery_status === 'string' ? r.delivery_status : 'unverified') as DeliveryStatus,
    canReprepare: r.can_reprepare === 1,
    year: Number(r.year),
    revision: Number(r.revision ?? 0),
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
    distribution: distributionOf(r.distribution),
    distributionEntries: (str(r.distribution_entry) ?? '').split(',').filter((id) => id.length > 0),
  }
}

/** Every closing of a company, the newest year first. */
export async function closingsOf(db: D1Database, company: string): Promise<Closing[]> {
  const rows = await db
    .prepare(
      `SELECT k.*, s.name AS saved_by_name, f.name AS filed_by_name,
        ${deliveryStatusSql('k.company_id', [safeJson('k.filed', '$.files.return.attemptId'), safeJson('k.filed', '$.files.statements.attemptId')])} AS delivery_status
        , ${revisableSql('k.company_id', [safeJson('k.filed', '$.files.return.attemptId'), safeJson('k.filed', '$.files.statements.attemptId')])} AS can_reprepare
        FROM closings k LEFT JOIN users s ON s.id = k.saved_by LEFT JOIN users f ON f.id = k.filed_by
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
       ON CONFLICT (company_id, year) DO UPDATE SET inputs = excluded.inputs, saved_at = excluded.saved_at, saved_by = excluded.saved_by, revision = closings.revision + 1 WHERE closings.filed_at IS NULL`,
    )
    .bind(company, year, JSON.stringify(inputs), now(), by)
}

/** The deadline a notice moved (§ 49(3)), or taken back (null); while the closing is not filed. */
export function extendStatement(db: D1Database, company: string, year: number, to: string | null): D1PreparedStatement {
  return db
    .prepare('INSERT INTO closings (company_id, year, extended_to) VALUES (?, ?, ?) ON CONFLICT (company_id, year) DO UPDATE SET extended_to = excluded.extended_to, revision = closings.revision + 1 WHERE closings.filed_at IS NULL')
    .bind(company, year, to)
}

/**
 * The tax of a year booked by an internal document on its last day (591 against 341, the whole tax of row 1050: the
 * advances paid were booked to 341 already; and deferred tax's change, 592 against 481.100 and 481.200), in place of
 * the one booked before; nought books nothing.
 */
export function bookTaxStatements(db: D1Database, company: string, year: number, cents: number, previous: string | null, by: string, revision: number, deferred: readonly { md: string; d: string; cents: number }[] = []): D1PreparedStatement[] {
  const lines = [...(cents > 0 ? [{ md: '591', d: '341', cents }] : []), ...deferred.filter((l) => l.cents > 0)]
  const id = lines.length > 0 ? crypto.randomUUID() : null
  // D1 batch is one transaction. Claim the revision first; every ledger write below requires that exact claim.
  // A second request that read the same revision can neither delete the first entry nor insert a duplicate.
  const out = [
    db.prepare('INSERT OR IGNORE INTO closings (company_id, year) VALUES (?, ?)').bind(company, year),
    db
      .prepare('UPDATE closings SET tax_entry = ?, revision = revision + 1 WHERE company_id = ? AND year = ? AND revision = ? AND tax_entry IS ? AND filed_at IS NULL')
      .bind(id, company, year, revision, previous),
  ]
  const claim = 'EXISTS (SELECT 1 FROM closings WHERE company_id = ? AND year = ? AND revision = ? AND tax_entry IS ? AND filed_at IS NULL)'
  if (previous) out.push(db.prepare(`UPDATE ledger_entries SET deleted_at = ?, deleted_by = ? WHERE id = ? AND company_id = ? AND deleted_at IS NULL AND ${claim}`).bind(now(), by, previous, company, company, year, revision + 1, id))
  if (id) out.push(db.prepare(
    `INSERT INTO ledger_entries (id, company_id, kind, year, seq, number, on_date, text, lines, created_at, created_by)
     SELECT ?1, ?2, 'internal', ?3, s, printf('ID-%d-%03d', ?3, s), ?4, ?5, ?6, ?7, ?8
       FROM (SELECT COALESCE(MAX(seq), 0) + 1 AS s FROM ledger_entries WHERE company_id = ?2 AND kind = 'internal' AND year = ?3)
       WHERE EXISTS (SELECT 1 FROM closings WHERE company_id = ?2 AND year = ?3 AND revision = ?9 AND tax_entry = ?1 AND filed_at IS NULL)`,
  ).bind(id, company, year, `${year}-12-31`, `Daň z príjmov za rok ${year}`, JSON.stringify(lines), now(), by, revision + 1))
  return out
}

/**
 * A year's distribution kept and booked: the internal document of the approval day (distributionLines) and, once the
 * dividends are paid to natural persons, the tax withheld on the day of the payout (364 against 342), in place of the
 * documents booked before. Claimed by the closing's revision like the tax's document.
 */
export function bookDistributionStatements(
  db: D1Database,
  company: string,
  year: number,
  d: Distribution | null,
  entries: { on: string; text: string; lines: EntryLine[] }[],
  previous: readonly string[],
  by: string,
  revision: number,
): D1PreparedStatement[] {
  const made = entries.filter((e) => e.lines.length > 0).map((e) => ({ ...e, id: crypto.randomUUID() }))
  const ids = made.map((e) => e.id).join(',') || null
  const out = [
    db.prepare('INSERT OR IGNORE INTO closings (company_id, year) VALUES (?, ?)').bind(company, year),
    db.prepare('UPDATE closings SET distribution = ?, distribution_entry = ?, revision = revision + 1 WHERE company_id = ? AND year = ? AND revision = ?').bind(d ? JSON.stringify(d) : null, ids, company, year, revision),
  ]
  const claim = 'EXISTS (SELECT 1 FROM closings WHERE company_id = ? AND year = ? AND revision = ? AND distribution_entry IS ?)'
  for (const id of previous) out.push(db.prepare(`UPDATE ledger_entries SET deleted_at = ?, deleted_by = ? WHERE id = ? AND company_id = ? AND deleted_at IS NULL AND ${claim}`).bind(now(), by, id, company, company, year, revision + 1, ids))
  for (const e of made)
    out.push(
      db
        .prepare(
          `INSERT INTO ledger_entries (id, company_id, kind, year, seq, number, on_date, text, lines, created_at, created_by)
           SELECT ?1, ?2, 'internal', ?3, s, printf('ID-%d-%03d', ?3, s), ?4, ?5, ?6, ?7, ?8
             FROM (SELECT COALESCE(MAX(seq), 0) + 1 AS s FROM ledger_entries WHERE company_id = ?2 AND kind = 'internal' AND year = ?3)
             WHERE EXISTS (SELECT 1 FROM closings WHERE company_id = ?2 AND year = ?9 AND revision = ?10 AND distribution_entry IS ?11)`,
        )
        .bind(e.id, company, Number(e.on.slice(0, 4)), e.on, e.text, JSON.stringify(e.lines), now(), by, year, revision + 1, ids),
    )
  return out
}

/** The year's tax not booked as computed (its own and the deferred tax), while the closing is not filed: the result to distribute is not final. */
export const taxUnbooked = (view: Pick<ClosingView, 'running' | 'closing' | 'tax' | 'booked' | 'deferred' | 'deferredBooked'>): boolean =>
  !view.running && !view.closing?.filed && ((view.tax.rows.r1050 ?? 0) !== view.booked || view.deferred.expense !== view.deferredBooked)

/** The notice of the tax withheld on dividends marked as filed, or the mark taken back (the distribution's own field). */
export function dividendTaxMarkStatement(db: D1Database, company: string, year: number, d: Distribution, on: string | null): D1PreparedStatement {
  return db.prepare('UPDATE closings SET distribution = ?, revision = revision + 1 WHERE company_id = ? AND year = ?').bind(JSON.stringify({ ...d, taxFiledOn: on }), company, year)
}

/** The closing marked as filed, once: what was filed, the tax it asks for and by when. */
export function fileClosingStatement(db: D1Database, company: string, year: number, filed: FiledClosing, payCents: number, dueOn: string, by: string, today: string, revision: number): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO closings (company_id, year, filed_on, filed_at, filed_by, filed, pay_cents, due_on) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (company_id, year) DO UPDATE SET filed_on = excluded.filed_on, filed_at = excluded.filed_at, filed_by = excluded.filed_by, filed = excluded.filed,
         pay_cents = excluded.pay_cents, due_on = excluded.due_on, revision = closings.revision + 1 WHERE closings.filed_at IS NULL AND closings.revision = ?`,
    )
    .bind(company, year, today, now(), by, JSON.stringify(filed), payCents, dueOn, revision)
}

/** A mark set by mistake taken back: what the accountant set stays. */
export function unfileClosingStatement(db: D1Database, company: string, year: number): D1PreparedStatement {
  return db
    .prepare('UPDATE closings SET filed_on = NULL, filed_at = NULL, filed_by = NULL, filed = NULL, pay_cents = NULL, due_on = NULL, revision = revision + 1 WHERE company_id = ? AND year = ? AND filed_at IS NOT NULL')
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
  /** The year's result after tax and the equity it is distributed against (distribution.ts). */
  equity: Equity
  statements: Statements
  /** The year before, when the books hold it or the former accountant's statements were taken over on the same form (the statements show it beside). */
  previous: Statements | null
  /** Where the year before comes from; `otherForm` when it was taken over on the other form (Úč MUJ against Úč POD) and so is not shown. */
  previousFrom: 'books' | 'prior' | 'otherForm' | null
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
  /** The size group the statements are made for, and the one the books propose with why; the employees counted. */
  size: EntitySize
  sizeProposal: { size: EntitySize; reason: SizeReason }
  employees: number
  /** What the form shows beside what was stored: the advances paid, the proposed size group, the employees from payroll. */
  found: ClosingFound
  /** The year's figures for the size group and the audit, and whether the audit is required (§ 19). */
  figures: SizeFigures
  audit: 'yes' | 'maybe' | 'no'
  /** Deferred tax: as computed for the year's end, with the register's differences, and the 592 the year's tax document books. */
  deferred: DeferredResult
  deferredAssets: { taxable: number; deductible: number }
  deferredBooked: number
  /** The register of assets, for the notes' depreciation plan; the day the year before's statements were approved here. */
  assets: Asset[]
  priorApproved: string | null
  /** How the company keeps its stock, when it does. */
  stock: { method: 'A' | 'B'; valuation: 'average' | 'fifo' } | null
}

/** What the notes are made of: the company and the closing's year as the page shows it. */
export function notesSource(company: Pick<Company, 'name' | 'ico' | 'dic' | 'address' | 'registerLine'>, view: ClosingView): NotesSource {
  return {
    company: { name: company.name, ico: company.ico, dic: company.dic, address: company.address, registerLine: company.registerLine },
    year: view.year,
    from: view.inputs.from ?? `${view.year}-01-01`,
    size: view.size,
    statements: view.statements,
    previous: view.previous,
    employees: view.employees,
    nace: view.inputs.nace,
    activity: view.inputs.activity,
    priorApproved: view.priorApproved,
    assets: view.assets,
    tax: { rate: view.tax.rate, current: view.tax.rows.r1050 ?? 0 },
    deferred: { on: view.deferred.on, asset: view.deferred.asset, liability: view.deferred.liability, rate: view.deferred.rate },
    audit: view.audit,
    notes: view.inputs.notes,
    stock: view.stock,
  }
}

/** How many years before the one shown the size group is followed back (§ 2(10) looks at two; a chain of kept groups at more). */
const SIZE_YEARS = 6

export async function closingView(db: D1Database, company: Company, year: number, today: string, loaded?: { books?: Books; closings?: Closing[] }): Promise<ClosingView> {
  const [books, closings, paid, assets, staff, stockRow, prior] = await Promise.all([
    loaded?.books ?? booksOf(db, company),
    loaded?.closings ?? closingsOf(db, company.id),
    incomePaid(db, company.id, year),
    assetsOf(db, company.id),
    // Employments only: an agreement outside employment or a director's remuneration is no employee of the count.
    employeesOf(db, company.id).then((all) => all.filter((e) => e.contract === 'employment')),
    db
      .prepare(
        `SELECT s.method, s.valuation,
           EXISTS (SELECT 1 FROM stock_items i WHERE i.company_id = s.company_id AND i.deleted_at IS NULL) AS items,
           EXISTS (SELECT 1 FROM stock_moves m WHERE m.company_id = s.company_id AND m.kind = 'count' AND m.deleted_at IS NULL AND substr(m.on_date, 1, 4) = ?2) AS in_year,
           EXISTS (SELECT 1 FROM stock_moves m WHERE m.company_id = s.company_id AND m.kind = 'count' AND m.deleted_at IS NULL AND m.on_date = ?2 || '-12-31') AS year_end
         FROM stock_settings s WHERE s.company_id = ?1`,
      )
      .bind(company.id, String(year))
      .first<Row>(),
    priorStatementsOf(db, company.id),
  ])
  const stock = stockRow ? { method: stockRow.method === 'B' ? ('B' as const) : ('A' as const), valuation: stockRow.valuation === 'fifo' ? ('fifo' as const) : ('average' as const), items: stockRow.items === 1, inYear: stockRow.in_year === 1, yearEnd: stockRow.year_end === 1 } : null
  const closing = closings.find((k) => k.year === year) ?? null
  // The activity is the company's: what was set for the year, else the last year that has it.
  const stored = closing?.inputs ?? storedInputs(null)
  const earlier = closings.find((k) => k.year < year && k.inputs.nace)?.inputs
  const own = stored.nace || !earlier ? stored : { ...stored, nace: earlier.nace, activity: stored.activity || earlier.activity }
  // Every year the size group looks at, in one pass over the books; the figures of the years the books hold whole.
  // The statements taken over from the accountant before reach back as far as she filed them.
  const priorYears = [...prior.keys()].filter((y) => y < year)
  const first = Math.min(books.start ? Math.min(year, Number(books.start.slice(0, 4))) : year, ...priorYears)
  const years = Array.from({ length: year - Math.max(first, year - SIZE_YEARS) + 1 }, (_, i) => Math.max(first, year - SIZE_YEARS) + i)
  const balances = closingBalancesByYear(books.entries, years)
  const inputsOf = (y: number) => closings.find((k) => k.year === y)?.inputs ?? null
  const whole = (y: number): boolean => {
    if (!books.start) return false
    if (books.start <= `${y}-01-01`) return true
    // A company founded in the year, whose books begin the day it was: its first period is whole.
    return inputsOf(y)?.from === books.start
  }
  const figures = new Map<number, SizeFigures>()
  for (const y of years) {
    if (y >= year) continue
    const taken = prior.get(y)
    if (!whole(y) && !taken) continue
    const st = whole(y) ? statementsFrom(balances.get(y) ?? new Map(), y, 'pod') : taken!
    figures.set(y, { year: y, assetsNet: st.assetsNet, assetsGross: st.assetsGross, turnover: st.turnover, employees: inputsOf(y)?.employees ?? averageEmployees(staff, y) })
  }
  const chosen = new Map<number, EntitySize>()
  for (const k of closings) if (k.inputs.size) chosen.set(k.year, k.inputs.size)
  const sizeProposal = proposeSize(year, figures, chosen, first)
  const size = own.size ?? sizeProposal.size
  const form = formOf(size)
  const statements = statementsFrom(balances.get(year) ?? new Map(), year, form, own.placements)
  const before = prior.get(year - 1)
  const fromBooks = !!books.start && books.start < `${year}-01-01`
  const previousFrom = fromBooks ? 'books' : before ? (before.form === form ? 'prior' : 'otherForm') : null
  const previous = fromBooks ? statementsFrom(balances.get(year - 1) ?? new Map(), year - 1, form, own.placements) : previousFrom === 'prior' && before ? statementsOfPrior(before) : null
  const employeesFound = averageEmployees(staff, year)
  const employees = own.employees ?? employeesFound
  const yearFigures: SizeFigures = { year, assetsNet: statements.assetsNet, assetsGross: statements.assetsGross, turnover: statements.turnover, employees }
  const audit = auditOf(yearFigures, figures.get(year - 1) ?? null)
  const assetsOfYear = assets.length > 0 ? assetYear(assets, year) : null
  const proposal = proposeTax(statements, assetsOfYear)
  const input = taxInputOf(year, proposal, own, { advances: paid.advances })
  const tax = taxOf(input)
  const booked = statements.accounts['591'] ?? 0
  const running = today <= `${year}-12-31`
  // Deferred tax: never for a micro entity; by the law when the statements must be audited, else as she decides.
  const deferredByLaw = size !== 'micro' && audit === 'yes'
  const deferredOn = size !== 'micro' && (own.deferred ?? deferredByLaw)
  const reserves = form === 'pod' ? ['r119', 'r120', 'r137', 'r138'].reduce((s, r) => s + Math.max(0, statements.balance[r] ?? 0), 0) : 0
  const taxKey = closing?.taxEntry ? `m:${closing.taxEntry}` : null
  let assetBefore = 0
  let liabilityBefore = 0
  let deferredBooked = 0
  for (const e of books.entries) {
    if (e.on > `${year}-12-31`) break
    const own = e.key === taxKey
    for (const l of e.lines) {
      if (!own) {
        if (l.md === DEFERRED_ASSET) assetBefore += l.cents
        if (l.d === DEFERRED_ASSET) assetBefore -= l.cents
        if (l.md === DEFERRED_LIABILITY) liabilityBefore += l.cents
        if (l.d === DEFERRED_LIABILITY) liabilityBefore -= l.cents
      } else {
        if (l.md === '592') deferredBooked += l.cents
        if (l.d === '592') deferredBooked -= l.cents
      }
    }
  }
  const deferredAssets = assets.length > 0 ? temporaryDifferences(assets, year) : { taxable: 0, deductible: 0 }
  const deferred = deferredTaxOf({
    on: deferredOn,
    rate: taxRate(year + 1, input.taxable),
    assets: deferredAssets,
    otherTaxable: own.deferredTaxable ?? 0,
    otherDeductible: own.deferredDeductible ?? reserves,
    losses: tax.losses.reduce((sum, l) => sum + l.left, 0) + Math.max(0, -(tax.rows.r400 ?? 0)),
    useLosses: own.deferredLosses,
    assetBefore,
    liabilityBefore,
  })
  return {
    year,
    closing,
    books,
    equity: equityOf(balances.get(year) ?? new Map()),
    statements,
    previous,
    previousFrom,
    proposal,
    inputs: own,
    input,
    tax,
    paid,
    booked,
    issues: closingIssues({
      books,
      year,
      company,
      nace: own.nace,
      statements,
      tax: running ? null : { computed: tax.rows.r1050 ?? 0, booked, deferred: { computed: deferred.expense, booked: deferredBooked } },
      audit,
      stock,
      carsSold: assetsOfYear?.carsSold ?? 0,
    }),
    running,
    due: closing?.dueOn ?? closingDue(year, closing?.extendedTo ?? null),
    changed: closing?.filed ? changedSinceFiled(closing.filed, tax, statements) : null,
    size,
    sizeProposal,
    employees,
    found: { advances: paid.advances, size: sizeProposal.size, employees: employeesFound, deferred: deferredByLaw, deferredDeductible: reserves },
    figures: yearFigures,
    audit,
    deferred,
    deferredAssets,
    deferredBooked,
    assets,
    priorApproved: closings.find((k) => k.year === year - 1)?.inputs.approvedOn ?? null,
    stock: stock ? { method: stock.method, valuation: stock.valuation } : null,
  }
}
