// What the team's screen of deadlines reads (src/team/deadlines.ts has the rules). Every company the user sees, in a
// fixed number of queries whatever their number: the companies, the returns filed, the VAT paid, the payments without a
// document, the filings marked, the closings with the income tax paid, the employees and the payroll months closed; and
// the documents of each VAT company's last periods, many companies in one batch.
import { DEADLINES } from '../config'
import { COMPANY_COLUMNS, MISSING, companyOf, docOf, type Company, type Doc, type User } from '../app/store'
import { FILED_SELECT, NOT_OTHER_TREASURY, SUMMARY_KIND, docsAroundStatement, filedReturnOf, paidByPeriod, svFiledOf, svViewsOf, viewOf, type FiledReturn } from '../app/vat-store'
import { quarterOf, summaryLookbackFrom, type SvFiled } from '../app/vat-summary'
import { payrollSettingsOf } from '../app/payroll-store'
import { compareDues, deadlinesOf, summaryWindow, vatWindow, type ClosingFact, type Due, type MarkedKind, type PayrollFact } from './deadlines'
import { visible } from './store'

type Row = Record<string, unknown>

export interface DueRow extends Due {
  company: Company
  companyName: string
}

/** Which companies: one, those of an accountant, those of nobody ('none'), or all the user sees. */
export interface DueScope {
  company?: string
  accountant?: string | null
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key)
  if (list) list.push(value)
  else map.set(key, [value])
}

export async function teamDeadlines(db: D1Database, user: User, demo: boolean, today: string, scope: DueScope = {}): Promise<{ companies: Company[]; dues: DueRow[] }> {
  const v = visible(user, demo)
  const where = [v.sql]
  const binds = [...v.binds]
  if (scope.company) {
    where.push('AND c.id = ?')
    binds.push(scope.company)
  }
  if (scope.accountant === 'none') where.push('AND c.accountant_id IS NULL')
  else if (scope.accountant) {
    where.push('AND c.accountant_id = ?')
    binds.push(scope.accountant)
  }
  const sql = where.join(' ')
  const [companyRows, filedRows, paidRows, missingRows, filingRows, closingRows, employeeRows, runRows] = await db.batch<Row>([
    db
      .prepare(
        `SELECT ${COMPANY_COLUMNS}, c.payroll AS payroll_settings, (SELECT COUNT(*) FROM company_files f WHERE f.company_id = c.id AND f.kind = 'handover') AS handover
           FROM companies c LEFT JOIN users acc ON acc.id = c.accountant_id WHERE ${sql} ORDER BY c.name COLLATE NOCASE`,
      )
      .bind(...binds),
    db
      .prepare(`SELECT ${FILED_SELECT} FROM vat_returns v JOIN companies c ON c.id = v.company_id LEFT JOIN users u ON u.id = v.filed_by WHERE ${sql} ORDER BY v.period DESC`)
      .bind(...binds),
    // Every VAT symbol begins 1100 (vat-store.ts, taxPaid): what each company paid with each.
    db
      .prepare(
        `SELECT p.company_id, ltrim(p.vs, '0') AS vs, -SUM(p.amount_cents) AS paid, MAX(p.booked_on) AS last
           FROM payments p JOIN companies c ON c.id = p.company_id
          WHERE ${sql} AND p.amount_cents < 0 AND ltrim(p.vs, '0') LIKE '1100%' AND ${NOT_OTHER_TREASURY.replace(/party_iban/g, 'p.party_iban')}
          GROUP BY p.company_id, ltrim(p.vs, '0')`,
      )
      .bind(...binds),
    db
      .prepare(
        `SELECT p.company_id, substr(p.booked_on, 1, 7) AS month, COUNT(*) AS n FROM payments p JOIN companies c ON c.id = p.company_id
          WHERE ${sql} AND ${MISSING} GROUP BY p.company_id, substr(p.booked_on, 1, 7)`,
      )
      .bind(...binds),
    db.prepare(`SELECT f.company_id, f.kind, f.period, f.filed_on, f.filed_at, f.filed_by, f.data FROM filings f JOIN companies c ON c.id = f.company_id WHERE ${sql}`).bind(...binds),
    // The income tax of a year is paid with its own symbol, 170099 and the year (closing-store.ts).
    db
      .prepare(
        `SELECT k.company_id, k.year, k.extended_to, k.filed_at, k.pay_cents, k.due_on,
                (SELECT COALESCE(-SUM(p.amount_cents), 0) FROM payments p WHERE p.company_id = k.company_id AND p.amount_cents < 0 AND ltrim(p.vs, '0') = '170099' || k.year) AS paid
           FROM closings k JOIN companies c ON c.id = k.company_id WHERE ${sql}`,
      )
      .bind(...binds),
    db
      .prepare(
        `SELECT e.company_id, MIN(e.started_on) AS first, MAX(COALESCE(e.ended_on, '9999-12-31')) AS last FROM employees e JOIN companies c ON c.id = e.company_id WHERE ${sql} GROUP BY e.company_id`,
      )
      .bind(...binds),
    db.prepare(`SELECT r.company_id, r.period, r.payday FROM payroll_runs r JOIN companies c ON c.id = r.company_id WHERE ${sql} AND r.closed_at IS NOT NULL`).bind(...binds),
  ])
  const companies = (companyRows?.results ?? []).map(companyOf)
  const handover = new Map((companyRows?.results ?? []).map((r) => [String(r.id), Number(r.handover ?? 0)]))
  const filed = new Map<string, FiledReturn[]>()
  for (const r of filedRows?.results ?? []) push(filed, String(r.company_id), filedReturnOf(r))
  const paid = new Map<string, { vs: string; paid: number; last: string }[]>()
  for (const r of paidRows?.results ?? []) push(paid, String(r.company_id), { vs: String(r.vs), paid: Number(r.paid), last: String(r.last) })
  const missing = new Map<string, Map<string, number>>()
  for (const r of missingRows?.results ?? []) {
    const id = String(r.company_id)
    const months = missing.get(id) ?? new Map<string, number>()
    months.set(String(r.month), Number(r.n))
    missing.set(id, months)
  }
  const settings = new Map((companyRows?.results ?? []).map((r) => [String(r.id), payrollSettingsOf(r.payroll_settings)]))
  const closedRuns = new Map<string, Map<string, string | null>>()
  for (const r of runRows?.results ?? []) {
    const id = String(r.company_id)
    closedRuns.set(id, (closedRuns.get(id) ?? new Map<string, string | null>()).set(String(r.period), typeof r.payday === 'string' ? r.payday : null))
  }
  const payroll = new Map<string, PayrollFact>()
  for (const r of employeeRows?.results ?? []) {
    const id = String(r.company_id)
    const last = String(r.last ?? '')
    payroll.set(id, { first: typeof r.first === 'string' ? r.first : null, last: last && last !== '9999-12-31' ? last : null, payday: settings.get(id)?.payday ?? null, closed: closedRuns.get(id) ?? new Map<string, string | null>() })
  }
  const closings = new Map<string, ClosingFact[]>()
  for (const r of closingRows?.results ?? [])
    push(closings, String(r.company_id), {
      year: Number(r.year),
      filed: r.filed_at !== null && r.filed_at !== undefined,
      extendedTo: typeof r.extended_to === 'string' ? r.extended_to : null,
      payCents: Number(r.pay_cents ?? 0),
      dueOn: typeof r.due_on === 'string' ? r.due_on : null,
      paid: Number(r.paid ?? 0),
    })
  const filings = new Map<string, Set<string>>()
  const summariesFiled = new Map<string, Map<string, SvFiled>>()
  for (const r of filingRows?.results ?? []) {
    const id = String(r.company_id)
    const set = filings.get(id) ?? new Set<string>()
    set.add(`${String(r.kind)}:${String(r.period)}`)
    filings.set(id, set)
    if (r.kind === SUMMARY_KIND) summariesFiled.set(id, (summariesFiled.get(id) ?? new Map<string, SvFiled>()).set(String(r.period), svFiledOf(r)))
  }

  // The documents of every VAT company's periods worked out, many companies in one batch; a person registered under
  // § 7a from the start of the first one's quarter, which its recapitulative statement covers.
  const windows = companies.map((company) => ({ company, periods: summaryWindow(company, today) })).filter((w) => w.periods.length > 0)
  const docs = new Map<string, Doc[]>()
  for (let i = 0; i < windows.length; i += DEADLINES.batch) {
    const chunk = windows.slice(i, i + DEADLINES.batch)
    const results = await db.batch<Row>(
      chunk.map((w) => docsAroundStatement(db, w.company.id, summaryLookbackFrom(w.periods[0] as string), quarterOf(w.periods[w.periods.length - 1] as string))),
    )
    chunk.forEach((w, j) => docs.set(w.company.id, (results[j]?.results ?? []).map(docOf)))
  }

  const dues: DueRow[] = []
  for (const company of companies) {
    const returns = filed.get(company.id) ?? []
    const held = docs.get(company.id) ?? []
    const window = vatWindow(company, today)
    const svFiled = summariesFiled.get(company.id) ?? new Map<string, SvFiled>()
    const facts = {
      views: window.map((period) => viewOf(company, period, held, returns, today)),
      summaries: summaryWindow(company, today).flatMap((period) => svViewsOf(company, period, held, svFiled, today).views),
      filed: returns,
      paid: paidByPeriod(returns, paid.get(company.id) ?? []),
      filings: filings.get(company.id) ?? new Set<string>(),
      closings: closings.get(company.id) ?? [],
      payroll: payroll.get(company.id),
      missing: missing.get(company.id) ?? new Map<string, number>(),
      handover: handover.get(company.id) ?? 0,
    }
    for (const due of deadlinesOf(company, facts, today)) dues.push({ ...due, company, companyName: company.name })
  }
  dues.sort(compareDues)
  return { companies, dues }
}

/** A filing made outside the app, marked as filed; once (the key is the company, the kind and the period). */
export function markFilingStatement(db: D1Database, company: string, kind: MarkedKind, period: string, by: string, today: string, at: number): D1PreparedStatement {
  return db
    .prepare('INSERT INTO filings (company_id, kind, period, filed_on, filed_at, filed_by) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (company_id, kind, period) DO NOTHING')
    .bind(company, kind, period, today, at, by)
}

/** A mark set by mistake, taken back. */
export function unmarkFilingStatement(db: D1Database, company: string, kind: MarkedKind, period: string): D1PreparedStatement {
  return db.prepare('DELETE FROM filings WHERE company_id = ? AND kind = ? AND period = ?').bind(company, kind, period)
}
