import { closureCurrentSql, latestPayoutSql, socialPayrollStatusSql as payrollStatusSql, socialReportCurrentSql as reportCurrentSql, currentTargetActiveSql as targetActiveSql } from '../payroll-reporting/sql'
import { type PayrollReportFact } from '../payroll-reporting/model'
import { deliveryStatusSql, safeJson, type DeliveryStatus } from '../filings/model'
// What the team's screen of deadlines reads (src/team/deadlines.ts has the rules). Every company the user sees, in a
// fixed number of queries whatever their number: the companies, the returns filed, the VAT paid, the payments without a
// document, the filings marked, the closings with the income tax paid, the employees and the payroll months closed; and
// the documents of each VAT company's last periods, many companies in one batch.
import { DEADLINES } from '../config'
import { COMPANY_COLUMNS, MISSING, bratislavaDay, companyOf, docOf, type Company, type Doc, type User } from '../app/store'
import { FILED_SELECT, NOT_OTHER_TREASURY, SUMMARY_KIND, docsAroundStatement, filedReturnOf, paidByPeriod, svFiledOf, svViewsOf, viewOf, type FiledReturn } from '../app/vat-store'
import { quarterOf, summaryLookbackFrom, type SvFiled } from '../app/vat-summary'
import { payrollSettingsOf } from '../app/payroll-store'
import { compareDues, deadlinesOf, summaryWindow, vatWindow, type ClosingFact, type Due, type MarkedKind, type PayrollFact } from './deadlines'
import { handedOverSql, visible } from './store'
import { REGISTRATION_EVENTS, registrationDues, type RegistrationDue, type RegistrationEmployee } from './registrations'
import { healthInsured, isContract, isPension } from '../app/payroll'

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
  return deadlinesWhere(db, where.join(' '), binds, today)
}

/** One company's deadlines, for its own app: the same rules and facts as the team's screen, so the two never disagree. */
export async function companyDeadlines(db: D1Database, company: string, today: string): Promise<Due[]> {
  return (await deadlinesWhere(db, 'c.id = ?', [company], today)).dues
}

async function deadlinesWhere(db: D1Database, sql: string, binds: unknown[], today: string): Promise<{ companies: Company[]; dues: DueRow[] }> {
  const [companyRows, filedRows, paidRows, missingRows, filingRows, closingRows, employeeRows, runRows, payrollReportRows, peopleRows, registeredRows] = await db.batch<Row>([
    db
      .prepare(
        `SELECT ${COMPANY_COLUMNS}, c.payroll AS payroll_settings, ${handedOverSql('c')} AS handover
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
    db.prepare(`SELECT f.company_id, f.kind, f.period, f.filed_on, f.filed_at, f.filed_by, f.data, ${deliveryStatusSql('f.company_id', [safeJson('f.data', '$.file.attemptId')])} AS delivery_status FROM filings f JOIN companies c ON c.id = f.company_id WHERE ${sql}`).bind(...binds),
    // The income tax of a year is paid with its own symbol, 170099 and the year (closing-store.ts).
    db
      .prepare(
        `SELECT k.company_id, k.year, k.extended_to, k.filed_at, k.pay_cents, k.due_on, ${safeJson('k.filed', '$.advancesNext.kind')} AS advances_kind, ${safeJson('k.filed', '$.advancesNext.each')} AS advances_each, ${deliveryStatusSql('k.company_id', [safeJson('k.filed', '$.files.return.attemptId'), safeJson('k.filed', '$.files.statements.attemptId')])} AS delivery_status,
                (SELECT COALESCE(-SUM(p.amount_cents), 0) FROM payments p WHERE p.company_id = k.company_id AND p.amount_cents < 0 AND ltrim(p.vs, '0') = '170099' || k.year) AS paid
           FROM closings k JOIN companies c ON c.id = k.company_id WHERE ${sql}`,
      )
      .bind(...binds),
    db
      .prepare(
        `SELECT e.company_id, MIN(e.started_on) AS first, MAX(COALESCE(e.ended_on, '9999-12-31')) AS last FROM employees e JOIN companies c ON c.id = e.company_id WHERE ${sql} GROUP BY e.company_id`,
      )
      .bind(...binds),
    db.prepare(`SELECT r.company_id, r.period, r.payday, pc.id AS evidence_id,
      (SELECT COALESCE(SUM(json_extract(value, '$.gross')), 0) FROM json_each(CASE WHEN json_valid(r.lines) THEN r.lines ELSE '[]' END)) > 0 AS needs_payout,
      EXISTS (SELECT 1 FROM payroll_payouts cp WHERE cp.closure_id = pc.id AND cp.report_period IS NOT NULL AND (${latestPayoutSql('cp')})) AS has_payout
      FROM payroll_runs r JOIN companies c ON c.id = r.company_id LEFT JOIN payroll_closures pc ON pc.id = r.evidence_id AND pc.company_id = r.company_id AND pc.period = r.period AND (${closureCurrentSql('pc')})
      WHERE ${sql} AND r.closed_at IS NOT NULL`).bind(...binds),
    db.prepare(`SELECT t.id, t.company_id, t.kind, t.period, t.due_on, ${payrollStatusSql('t', 'p')} AS delivery_status,
      (p.id IS NOT NULL AND NOT (${reportCurrentSql('t', 'p')})) AS source_changed FROM payroll_targets t JOIN companies c ON c.id = t.company_id
      LEFT JOIN payroll_packages p ON p.id = t.package_id AND p.company_id = t.company_id WHERE ${sql} AND (${targetActiveSql('t')})`).bind(...binds),
    // Each employee for the registrations with the Social Insurance Agency and the insurers, and what was recorded as
    // filed: the newest record of a registration counts (taken back by mistake, it is open again).
    db.prepare(`SELECT e.company_id, e.id, e.name, e.insurer, e.started_on, e.ended_on, e.contract, e.pension FROM employees e JOIN companies c ON c.id = e.company_id WHERE ${sql}`).bind(...binds),
    db
      .prepare(
        `SELECT ev.company_id, ev.subject, ev.action, ev.at FROM events ev JOIN companies c ON c.id = ev.company_id
          WHERE ${sql} AND ev.action IN ('${REGISTRATION_EVENTS.done}', '${REGISTRATION_EVENTS.undone}') ORDER BY ev.id`,
      )
      .bind(...binds),
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
    payroll.set(id, { first: typeof r.first === 'string' ? r.first : null, last: last && last !== '9999-12-31' ? last : null, payday: settings.get(id)?.payday ?? null, closed: closedRuns.get(id) ?? new Map<string, string | null>(), initialized: new Set((runRows?.results ?? []).filter((r) => r.company_id === id && r.evidence_id).map((r) => String(r.period))), payoutPending: new Set((runRows?.results ?? []).filter((r) => r.company_id === id && r.evidence_id && r.needs_payout && !r.has_payout).map((r) => String(r.period))) })
  }
  const closings = new Map<string, ClosingFact[]>()
  for (const r of closingRows?.results ?? [])
    push(closings, String(r.company_id), {
      year: Number(r.year),
      deliveryStatus: String(r.delivery_status ?? 'unverified') as DeliveryStatus,
      filed: r.filed_at !== null && r.filed_at !== undefined,
      extendedTo: typeof r.extended_to === 'string' ? r.extended_to : null,
      payCents: Number(r.pay_cents ?? 0),
      dueOn: typeof r.due_on === 'string' ? r.due_on : null,
      paid: Number(r.paid ?? 0),
      advances: { kind: r.advances_kind === 'monthly' || r.advances_kind === 'quarterly' ? r.advances_kind : 'none', each: Number(r.advances_each ?? 0) || 0 },
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

  const payrollReports = new Map<string, PayrollReportFact[]>()
  for (const r of payrollReportRows?.results ?? []) push(payrollReports, String(r.company_id), { id: String(r.id), kind: r.kind as PayrollReportFact['kind'], period: String(r.period), due: String(r.due_on), status: r.delivery_status as DeliveryStatus, sourceChanged: Boolean(r.source_changed) })

  const people = new Map<string, RegistrationEmployee[]>()
  for (const r of peopleRows?.results ?? [])
    push(people, String(r.company_id), registrationPerson(r))
  const registered = new Map<string, Map<string, string>>()
  for (const r of registeredRows?.results ?? []) {
    const id = String(r.company_id)
    const marks = registered.get(id) ?? new Map<string, string>()
    if (r.action === REGISTRATION_EVENTS.done) marks.set(String(r.subject), bratislavaDay(Number(r.at)))
    else marks.delete(String(r.subject))
    registered.set(id, marks)
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
      payrollReports: payrollReports.get(company.id) ?? [],
      missing: missing.get(company.id) ?? new Map<string, number>(),
      handover: handover.get(company.id) ?? 0,
      employees: people.get(company.id) ?? [],
      registered: registered.get(company.id) ?? new Map<string, string>(),
    }
    for (const due of deadlinesOf(company, facts, today)) dues.push({ ...due, company, companyName: company.name })
  }
  dues.sort(compareDues)
  return { companies, dues }
}

/** A mark set by mistake, taken back. */
export function unmarkFilingStatement(db: D1Database, company: string, kind: MarkedKind, period: string): D1PreparedStatement {
  return db.prepare('DELETE FROM filings WHERE company_id = ? AND kind = ? AND period = ?').bind(company, kind, period)
}

/** A person as the registrations read them: a student on a student's agreement or an old-age pensioner on an agreement is no employee for health insurance. */
const registrationPerson = (r: Row): RegistrationEmployee => ({
  id: String(r.id),
  name: String(r.name),
  insurer: String(r.insurer),
  startedOn: String(r.started_on),
  endedOn: typeof r.ended_on === 'string' ? r.ended_on : null,
  health: healthInsured(isContract(r.contract) ? r.contract : 'employment', isPension(r.pension) ? r.pension : 'none'),
})

/** One company's registrations with the Social Insurance Agency and the health insurers, for its payroll page. */
export async function companyRegistrations(db: D1Database, company: Company, today: string): Promise<RegistrationDue[]> {
  const [people, marks] = await db.batch<Row>([
    db.prepare('SELECT id, name, insurer, started_on, ended_on, contract, pension FROM employees WHERE company_id = ?').bind(company.id),
    db
      .prepare(`SELECT subject, action, at FROM events WHERE company_id = ? AND action IN ('${REGISTRATION_EVENTS.done}', '${REGISTRATION_EVENTS.undone}') ORDER BY id`)
      .bind(company.id),
  ])
  const done = new Map<string, string>()
  for (const r of marks?.results ?? []) {
    if (r.action === REGISTRATION_EVENTS.done) done.set(String(r.subject), bratislavaDay(Number(r.at)))
    else done.delete(String(r.subject))
  }
  const employees = (people?.results ?? []).map(registrationPerson)
  return registrationDues(employees, company.startOn ?? bratislavaDay(company.createdAt), company.endsOn, done, today)
}
