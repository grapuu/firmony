// Payroll in the database (schema step 8): a company's employees, each month's run (the income the accountant
// typed for each employee while it is open; the payslips as they were once it is closed), and the company's payroll
// settings (the payday, and where the contributions go: the Social Insurance Agency's account and the employer's
// number there, each health insurer's account and the payer's number). payroll.ts works the months out.
import { dayOfText } from './booking'
import { isIban, plainIban } from './invoices'
import type { LedgerPayroll } from './ledger'
import {
  EMPTY_PARTS,
  monthCalendar,
  monthPay,
  partsOf,
  proposeAverage,
  proposeDvz,
  sickMonth,
  sicknessInsured,
  type AverageProposal,
  type ClosedMonth,
  type DvzProposal,
  type MonthParts,
  type MonthPay,
  type SickLeave,
  type SickMonth,
  type WageKind,
  type WorkTerms,
} from './pay-month'
import {
  exemptionAllowed,
  isContract,
  isPension,
  monthDays,
  payrollTotals,
  payslip,
  regularOf,
  taxableOf,
  type Child,
  type ContractKind,
  type PensionKind,
  type Payslip,
  type PayrollTotals,
} from './payroll'

type Row = Record<string, unknown>
const str = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null)

/** The health insurers an employee may be with, by their codes. */
export const INSURERS = { '24': 'Dôvera', '25': 'VšZP', '27': 'Union' } as const
export type Insurer = keyof typeof INSURERS
export const isInsurer = (value: unknown): value is Insurer => typeof value === 'string' && Object.hasOwn(INSURERS, value)

export interface Employee {
  id: string
  name: string
  bornOn: string | null
  insurer: Insurer
  startedOn: string
  endedOn: string | null
  /** The agreed monthly wage, offered as the month's income. */
  wage: number
  declaration: boolean
  disabled: boolean
  healthDeduction: boolean
  healthExempt: boolean
  children: Child[]
  iban: string | null
  /** The relationship (schema step 28; an employment before it), a regular monthly income, the pension drawn, the deduction claimed. */
  contract: ContractKind
  regular: boolean
  pension: PensionKind
  exemption: boolean
  /** A monthly wage (or reward) or an hourly rate; the hours of a week, in hundredths; the days of holiday a year when agreed above the law's (hundredths). */
  wageKind: WageKind
  weeklyHours: number
  leaveDays: number | null
}

/** The terms a month of an employee is worked out by. */
export const termsOf = (e: Employee): WorkTerms => ({
  contract: e.contract,
  regular: regularOf(e.contract, e.regular),
  wageKind: e.wageKind,
  wage: e.wage,
  dailyHours: Math.round(e.weeklyHours / 5),
  startedOn: e.startedOn,
  endedOn: e.endedOn,
})

function childrenOf(json: unknown): Child[] {
  if (typeof json !== 'string') return []
  try {
    const list = JSON.parse(json) as unknown
    return Array.isArray(list)
      ? list.flatMap((c: Record<string, unknown>) => (typeof c?.name === 'string' && typeof c?.born === 'string' && dayOfText(c.born, 1990) === c.born ? [{ name: c.name.slice(0, 80), born: c.born }] : []))
      : []
  } catch {
    return []
  }
}

function employeeOf(r: Row): Employee {
  return {
    id: String(r.id),
    name: String(r.name ?? ''),
    bornOn: str(r.born_on),
    insurer: isInsurer(r.insurer) ? r.insurer : '25',
    startedOn: String(r.started_on),
    endedOn: str(r.ended_on),
    wage: Number(r.wage_cents ?? 0),
    declaration: r.declaration === 1,
    disabled: r.disabled === 1,
    healthDeduction: r.health_deduction === 1,
    healthExempt: r.health_exempt === 1,
    children: childrenOf(r.children),
    iban: str(r.iban),
    contract: isContract(r.contract) ? r.contract : 'employment',
    regular: r.regular !== 0,
    pension: isPension(r.pension) ? r.pension : 'none',
    exemption: r.exemption === 1,
    wageKind: r.wage_kind === 'hourly' ? 'hourly' : 'monthly',
    weeklyHours: Number.isInteger(r.weekly_hours) && (r.weekly_hours as number) > 0 ? (r.weekly_hours as number) : 4000,
    leaveDays: Number.isInteger(r.leave_days) ? (r.leave_days as number) : null,
  }
}

/** A company's employees, the earliest start first. */
export async function employeesOf(db: D1Database, company: string): Promise<Employee[]> {
  const rows = await db.prepare('SELECT * FROM employees WHERE company_id = ? ORDER BY started_on, name COLLATE NOCASE, id').bind(company).all<Row>()
  return rows.results.map(employeeOf)
}

export function employeeStatement(db: D1Database, company: string, e: Employee, by: string, at: number): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO employees (id, company_id, name, born_on, insurer, started_on, ended_on, wage_cents, declaration, disabled, health_deduction, health_exempt, children, iban, created_at, created_by, updated_at,
         contract, regular, pension, exemption, wage_kind, weekly_hours, leave_days)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?15, ?17, ?18, ?19, ?20, ?21, ?22, ?23)
       ON CONFLICT (id) DO UPDATE SET name = excluded.name, born_on = excluded.born_on, insurer = excluded.insurer, started_on = excluded.started_on, ended_on = excluded.ended_on,
         wage_cents = excluded.wage_cents, declaration = excluded.declaration, disabled = excluded.disabled, health_deduction = excluded.health_deduction,
         health_exempt = excluded.health_exempt, children = excluded.children, iban = excluded.iban, updated_at = excluded.updated_at,
         contract = excluded.contract, regular = excluded.regular, pension = excluded.pension, exemption = excluded.exemption, wage_kind = excluded.wage_kind,
         weekly_hours = excluded.weekly_hours, leave_days = excluded.leave_days WHERE employees.company_id = ?2`,
    )
    .bind(
      e.id,
      company,
      e.name,
      e.bornOn,
      e.insurer,
      e.startedOn,
      e.endedOn,
      e.wage,
      e.declaration ? 1 : 0,
      e.disabled ? 1 : 0,
      e.healthDeduction ? 1 : 0,
      e.healthExempt ? 1 : 0,
      JSON.stringify(e.children),
      e.iban,
      at,
      by,
      e.contract,
      regularOf(e.contract, e.regular) ? 1 : 0,
      e.pension,
      e.exemption && exemptionAllowed(e.contract, e.pension, regularOf(e.contract, e.regular)) ? 1 : 0,
      e.wageKind,
      e.weeklyHours,
      e.leaveDays,
    )
}

/** The first and the last day of a month. */
export const monthRange = (period: string): { from: string; to: string } => ({ from: `${period}-01`, to: `${period}-${String(monthDays(period)).padStart(2, '0')}` })

/** Whether an employee was employed in a month, and for how many of its days. */
export function daysEmployed(e: Pick<Employee, 'startedOn' | 'endedOn'>, period: string): number {
  const { from, to } = monthRange(period)
  const start = e.startedOn > from ? e.startedOn : from
  const end = e.endedOn && e.endedOn < to ? e.endedOn : to
  if (start > end) return 0
  return Math.round((Date.parse(`${end}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`)) / 86_400_000) + 1
}

/** The terms a closed month was worked out by, kept with it. */
export interface LineTerms {
  contract: ContractKind
  regular: boolean
  pension: PensionKind
  exemption: boolean
  wageKind: WageKind
  dailyHours: number
}

/** A month's line: the employee, what was typed for the month, and once closed the payslip as it was. */
export interface RunLine {
  employeeId: string
  name: string
  insurer: Insurer
  /** The assessment base of the month (older open months: the income typed). */
  gross: number
  /** What the accountant typed for the month (schema step 28; an older line has its gross only). */
  parts?: MonthParts
  /** Once closed: the days of the month employed, and the payslip as it was. */
  days?: number
  slip?: Payslip
  /** Immutable insurance regime used to compute this closed slip; never inferred from today's employee record. */
  health?: { disabled: boolean; minimumExempt: boolean; deductionClaimed: boolean }
  /** The month's pay, sick leave and terms as they were worked out. */
  pay?: MonthPay
  sick?: SickMonth
  terms?: LineTerms
}

/** What an open month offers beside its lines: the average earnings and each sick leave's daily base, as proposed. */
export interface LineProposals {
  average: AverageProposal
  dvz: Record<string, DvzProposal>
}

export interface PayrollRun {
  period: string
  payday: string | null
  lines: RunLine[]
  closedOn: string | null
  closedByName: string | null
}

function linesOf(json: unknown): RunLine[] {
  if (typeof json !== 'string') return []
  try {
    const list = JSON.parse(json) as unknown
    if (!Array.isArray(list)) return []
    return list.flatMap((l: Record<string, unknown>) =>
      typeof l?.employeeId === 'string' && Number.isInteger(l.gross) && (l.gross as number) >= 0
        ? [
            {
              employeeId: l.employeeId,
              name: String(l.name ?? ''),
              insurer: isInsurer(l.insurer) ? l.insurer : '25',
              gross: l.gross as number,
              ...(l.parts && typeof l.parts === 'object' ? { parts: partsOf(l.parts) } : {}),
              ...(Number.isInteger(l.days) ? { days: l.days as number } : {}),
              ...(l.slip && typeof l.slip === 'object' ? { slip: l.slip as Payslip } : {}),
              ...(l.health && typeof l.health === 'object' ? { health: l.health as RunLine['health'] } : {}),
              ...(l.pay && typeof l.pay === 'object' ? { pay: l.pay as MonthPay } : {}),
              ...(l.sick && typeof l.sick === 'object' ? { sick: l.sick as SickMonth } : {}),
              ...(l.terms && typeof l.terms === 'object' ? { terms: l.terms as LineTerms } : {}),
            },
          ]
        : [],
    )
  } catch {
    return []
  }
}

function runOf(r: Row): PayrollRun {
  return { period: String(r.period), payday: str(r.payday), lines: linesOf(r.lines), closedOn: typeof r.closed_at === 'number' ? str(r.closed_on) : null, closedByName: str(r.closed_by_name) }
}

/** Every month of a company that has a run, the newest first. */
export async function runsOf(db: D1Database, company: string): Promise<PayrollRun[]> {
  const rows = await db
    .prepare('SELECT r.*, u.name AS closed_by_name FROM payroll_runs r LEFT JOIN users u ON u.id = r.closed_by WHERE r.company_id = ? ORDER BY r.period DESC')
    .bind(company)
    .all<Row>()
  return rows.results.map(runOf)
}

/** A line as it is stored: what was typed and, once closed, what was worked out (never the proposals beside it). */
export function storedLine(l: RunLine): RunLine {
  const { employeeId, name, insurer, gross, parts, days, slip, health, pay, sick, terms } = l
  return { employeeId, name, insurer, gross, ...(parts ? { parts } : {}), ...(days !== undefined ? { days } : {}), ...(slip ? { slip } : {}), ...(health ? { health } : {}), ...(pay ? { pay } : {}), ...(sick ? { sick } : {}), ...(terms ? { terms } : {}) }
}

/** The parts typed for a month and its payday, kept while it is open. */
export function saveRunStatement(db: D1Database, company: string, period: string, payday: string | null, lines: RunLine[], by: string, at: number): D1PreparedStatement {
  const plain = JSON.stringify(lines.map(({ employeeId, name, insurer, gross, parts }) => ({ employeeId, name, insurer, gross, ...(parts ? { parts } : {}) })))
  return db
    .prepare(
      `INSERT INTO payroll_runs (company_id, period, payday, lines, saved_at, saved_by) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (company_id, period) DO UPDATE SET payday = excluded.payday, lines = excluded.lines, saved_at = excluded.saved_at, saved_by = excluded.saved_by WHERE payroll_runs.closed_at IS NULL`,
    )
    .bind(company, period, payday, plain, at, by)
}

/** A month closed: its payslips as they were worked out, once. */
export function closeRunStatement(db: D1Database, company: string, period: string, payday: string, lines: RunLine[], by: string, today: string, at: number, evidenceId?: string, revision?: number): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO payroll_runs (company_id, period, payday, lines, saved_at, saved_by, closed_at, closed_on, closed_by, evidence_id) SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?5, ?7, ?6, ?8
       WHERE ?9 IS NULL OR COALESCE((SELECT revision FROM company_data_revisions WHERE company_id = ?1), 0) = ?9
       ON CONFLICT (company_id, period) DO UPDATE SET payday = excluded.payday, lines = excluded.lines, closed_at = excluded.closed_at, closed_on = excluded.closed_on, closed_by = excluded.closed_by, evidence_id = excluded.evidence_id
       WHERE payroll_runs.closed_at IS NULL AND (?9 IS NULL OR COALESCE((SELECT revision FROM company_data_revisions WHERE company_id = ?1), 0) = ?9)`,
    )
    .bind(company, period, payday, JSON.stringify(lines.map(storedLine)), at, by, today, evidenceId ?? null, revision ?? null)
}

/** A month closed by mistake opened again: its incomes stay. */
export function reopenRunStatement(db: D1Database, company: string, period: string): D1PreparedStatement {
  return db.prepare('UPDATE payroll_runs SET closed_at = NULL, closed_on = NULL, closed_by = NULL, evidence_id = NULL WHERE company_id = ? AND period = ? AND closed_at IS NOT NULL').bind(company, period)
}

/** The months of an employee closed before a month, as the decisive periods of sick pay and average earnings read them. */
export function closedMonthsOf(e: Employee, runs: readonly PayrollRun[], before: string): ClosedMonth[] {
  const out: ClosedMonth[] = []
  for (const run of runs) {
    if (!run.closedOn || run.period >= before) continue
    const l = run.lines.find((x) => x.employeeId === e.id)
    if (!l?.slip) continue
    const worked = l.pay?.worked ?? monthCalendar(run.period, e.startedOn, e.endedOn).employedWorkdays * Math.round(e.weeklyHours / 5)
    out.push({
      period: run.period,
      sicknessBase: l.slip.social?.employee?.sickness !== undefined ? l.slip.socialBase : 0,
      earned: l.pay?.earned ?? l.slip.gross,
      worked,
      sickDays: l.sick?.days ?? 0,
    })
  }
  return out
}

export type SlipLine = RunLine & { slip: Payslip; days: number; proposals?: LineProposals }

/**
 * A month's payslips: the closed ones as they were; an open month's worked out from the parts typed (an older line's
 * gross as other income), the employee's terms, the sick leaves (each daily base as typed, else proposed from the months
 * closed before) and the average earnings (as typed, else proposed).
 */
export function monthSlips(period: string, employees: readonly Employee[], run: PayrollRun | null, context: { leaves?: readonly SickLeave[]; runs?: readonly PayrollRun[] } = {}): SlipLine[] {
  if (run?.closedOn) return run.lines.filter((l): l is RunLine & { slip: Payslip } => Boolean(l.slip)).map((l) => ({ ...l, days: l.days ?? monthDays(period) }))
  const typed = new Map((run?.lines ?? []).map((l) => [l.employeeId, l]))
  return employees
    .map((e) => ({ e, days: daysEmployed(e, period) }))
    .filter(({ days }) => days > 0)
    .map(({ e, days }) => {
      const line = typed.get(e.id)
      const parts: MonthParts = line?.parts ?? (line ? { ...EMPTY_PARTS, wage: 0, other: line.gross } : EMPTY_PARTS)
      const terms = termsOf(e)
      const closed = closedMonthsOf(e, context.runs ?? [], period)
      // Sick pay is for those insured for sickness (an employment, a regular income, a regular director); another's leave lowers nothing.
      const leaves = sicknessInsured(e.contract, e.regular, e.pension) ? (context.leaves ?? []).filter((l) => l.employeeId === e.id) : []
      const dvz: Record<string, DvzProposal> = {}
      const sick = sickMonth(period, leaves, e.startedOn, e.endedOn, (leave) => {
        if (leave.dvz !== null) return leave.dvz
        dvz[leave.id] = proposeDvz(leave, e.startedOn, closed)
        return dvz[leave.id]?.dvz ?? null
      })
      const average = proposeAverage(period, terms, closed)
      const pay = monthPay(period, terms, parts, sick, parts.average ?? average.average)
      const exemption = e.exemption && exemptionAllowed(e.contract, e.pension, terms.regular)
      return {
        employeeId: e.id,
        name: e.name,
        insurer: e.insurer,
        gross: pay.gross,
        parts,
        days,
        health: { disabled: e.disabled, minimumExempt: e.healthExempt, deductionClaimed: e.healthDeduction },
        pay,
        sick,
        terms: { contract: e.contract, regular: terms.regular, pension: e.pension, exemption, wageKind: e.wageKind, dailyHours: terms.dailyHours },
        proposals: { average, dvz },
        slip: payslip({
          period,
          gross: pay.gross,
          sickPay: pay.sick,
          declaration: e.declaration,
          children: e.children,
          disabled: e.disabled,
          healthDeduction: e.healthDeduction,
          healthMinimumExempt: e.healthExempt,
          days,
          minimumDays: Math.max(0, days - sick.benefitDays),
          contract: e.contract,
          regular: terms.regular,
          pension: e.pension,
          exemption,
        }),
      }
    })
}

/** What keeps an open month from being closed: a person's absences longer than the working time, a sick leave without a daily base. */
export const monthIssues = (slips: readonly SlipLine[]): { employeeId: string; name: string; issue: 'absence' | 'sickBase' }[] =>
  slips.flatMap((l) => (l.pay?.issues ?? []).map((issue) => ({ employeeId: l.employeeId, name: l.name, issue })))

/** A month's sums, from its payslips. */
export const runTotals = (slips: readonly (RunLine & { slip: Payslip })[]): PayrollTotals => payrollTotals(slips.map((l) => ({ ...l.slip, insurer: l.insurer })))

/** Where the contributions go: the Social Insurance Agency and each health insurer, an account and the payer's number; the payday. */
export interface PayrollSettings {
  /** The day of the month the wages of the month before are paid (1 to 31); null: none agreed. */
  payday: number | null
  social: { iban: string | null; vs: string | null }
  health: Partial<Record<Insurer, { iban: string | null; vs: string | null }>>
}

export function payrollSettingsOf(json: unknown): PayrollSettings {
  const empty: PayrollSettings = { payday: null, social: { iban: null, vs: null }, health: {} }
  if (typeof json !== 'string') return empty
  try {
    const v = JSON.parse(json) as Record<string, unknown>
    const pair = (o: unknown) => {
      const p = (o ?? {}) as Record<string, unknown>
      return { iban: typeof p.iban === 'string' && isIban(p.iban) ? plainIban(p.iban) : null, vs: typeof p.vs === 'string' && /^\d{1,10}$/.test(p.vs) ? p.vs : null }
    }
    const health: PayrollSettings['health'] = {}
    for (const code of Object.keys(INSURERS) as Insurer[]) if (v.health && typeof v.health === 'object' && code in (v.health as object)) health[code] = pair((v.health as Record<string, unknown>)[code])
    const day = Number(v.payday)
    return { payday: Number.isInteger(day) && day >= 1 && day <= 31 ? day : null, social: pair(v.social), health }
  } catch {
    return empty
  }
}

export function settingsStatement(db: D1Database, company: string, settings: PayrollSettings): D1PreparedStatement {
  return db.prepare('UPDATE companies SET payroll = ? WHERE id = ?').bind(JSON.stringify(settings), company)
}

/** The day a month's wages are paid: its payday in the next month (the last day of a shorter month), else the last day of the next month (§ 143(2) of Act No. 461/2003 Z. z.). */
export function paydayOf(period: string, settings: Pick<PayrollSettings, 'payday'>): string {
  const [y, m] = period.split('-').map(Number) as [number, number]
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
  const last = monthDays(next)
  const day = settings.payday ? Math.min(settings.payday, last) : last
  return `${next}-${String(day).padStart(2, '0')}`
}

/** A closed month as the books take it: the sums of its payslips, and what each payment of it comes to. */
export function ledgerPayroll(run: PayrollRun): LedgerPayroll | null {
  if (!run.closedOn) return null
  const slips = run.lines.filter((l): l is RunLine & { slip: Payslip } => Boolean(l.slip))
  const sum = (pick: (s: Payslip) => number) => slips.reduce((t, l) => t + pick(l.slip), 0)
  const totals = runTotals(slips)
  // The wages of employments and agreements on 521, a director's remuneration on 523 (odmeny členom orgánov
  // spoločnosti), sick pay on 527 (zákonné sociálne náklady).
  const contractOf = (l: RunLine & { slip: Payslip }) => l.terms?.contract ?? l.slip.contract ?? 'employment'
  const costs = [
    { account: '521', cents: slips.filter((l) => contractOf(l) !== 'director').reduce((t, l) => t + l.slip.gross, 0) },
    { account: '523', cents: slips.filter((l) => contractOf(l) === 'director').reduce((t, l) => t + l.slip.gross, 0) },
    { account: '527', cents: sum((s) => s.sickPay ?? 0) },
  ].filter((c) => c.cents > 0)
  return {
    period: run.period,
    gross: sum(taxableOf),
    costs,
    socialEmployee: sum((s) => s.socialEmployee),
    socialEmployer: sum((s) => s.socialEmployer),
    healthEmployee: sum((s) => s.healthEmployee),
    healthEmployer: sum((s) => s.healthEmployer),
    tax: totals.tax,
    pays: { social: totals.social, health: Object.values(totals.health), tax: totals.tax > 0 ? totals.tax : -1 },
  }
}

/** A company's sick leaves that stand (schema step 28), each employee's by its first day. */
export async function sickLeavesOf(db: D1Database, company: string): Promise<SickLeave[]> {
  const rows = await db.prepare('SELECT * FROM sick_leaves WHERE company_id = ? AND deleted_at IS NULL ORDER BY employee_id, from_on, id').bind(company).all<Row>()
  return rows.results.map((r) => ({
    id: String(r.id),
    employeeId: String(r.employee_id),
    from: String(r.from_on),
    to: str(r.to_on),
    dvz: Number.isSafeInteger(r.dvz) ? (r.dvz as number) : null,
  }))
}

/** A sick leave written, new or changed (only of the company's own employee). */
export function sickLeaveStatement(db: D1Database, company: string, leave: SickLeave, by: string, at: number): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO sick_leaves (id, company_id, employee_id, from_on, to_on, dvz, created_at, created_by)
       SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8 WHERE EXISTS (SELECT 1 FROM employees WHERE id = ?3 AND company_id = ?2)
       ON CONFLICT (id) DO UPDATE SET from_on = excluded.from_on, to_on = excluded.to_on, dvz = excluded.dvz, updated_at = ?7
       WHERE sick_leaves.company_id = ?2 AND sick_leaves.employee_id = ?3 AND sick_leaves.deleted_at IS NULL`,
    )
    .bind(leave.id, company, leave.employeeId, leave.from, leave.to, leave.dvz, at, by)
}

/** A sick leave entered by mistake, removed: marked, never deleted. */
export function removeSickLeaveStatement(db: D1Database, company: string, id: string, by: string, at: number): D1PreparedStatement {
  return db.prepare('UPDATE sick_leaves SET deleted_at = ?1, deleted_by = ?2 WHERE id = ?3 AND company_id = ?4 AND deleted_at IS NULL').bind(at, by, id, company)
}

/**
 * Whether a change of a sick leave would reach a closed month: the leave's days within each closed month, and its daily
 * base where that month paid sick pay by it, must stay as they were (open the month first).
 */
export function leaveTouchesClosed(before: SickLeave | null, after: SickLeave | null, runs: readonly PayrollRun[], employee: Pick<Employee, 'startedOn' | 'endedOn'>): boolean {
  for (const run of runs) {
    if (!run.closedOn) continue
    const days = (l: SickLeave | null) => (l ? sickMonth(run.period, [l], employee.startedOn, employee.endedOn, (x) => x.dvz) : null)
    const a = days(before)
    const b = days(after)
    if ((a?.days ?? 0) !== (b?.days ?? 0)) return true
    if ((a?.parts.length ?? 0) > 0 && before?.from !== after?.from) return true
    if ((a?.parts.length ?? 0) > 0 && before?.dvz !== after?.dvz) return true
  }
  return false
}
