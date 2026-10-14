// Payroll in the database (schema step 8): a company's employees, each month's run (the income the accountant
// typed for each employee while it is open; the payslips as they were once it is closed), and the company's payroll
// settings (the payday, and where the contributions go: the Social Insurance Agency's account and the employer's
// number there, each health insurer's account and the payer's number). payroll.ts works the months out.
import { dayOfText } from './booking'
import { isIban, plainIban } from './invoices'
import type { LedgerPayroll } from './ledger'
import { monthDays, payrollTotals, payslip, type Child, type Payslip, type PayrollTotals } from './payroll'

type Row = Record<string, unknown>
const str = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null)

/** The health insurers an employee may be with, by their codes. */
export const INSURERS = { '24': 'Dôvera', '25': 'VšZP', '27': 'Union' } as const
export type Insurer = keyof typeof INSURERS
export const isInsurer = (value: unknown): value is Insurer => typeof value === 'string' && value in INSURERS

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
}

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
      `INSERT INTO employees (id, company_id, name, born_on, insurer, started_on, ended_on, wage_cents, declaration, disabled, health_deduction, health_exempt, children, iban, created_at, created_by, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?15)
       ON CONFLICT (id) DO UPDATE SET name = excluded.name, born_on = excluded.born_on, insurer = excluded.insurer, started_on = excluded.started_on, ended_on = excluded.ended_on,
         wage_cents = excluded.wage_cents, declaration = excluded.declaration, disabled = excluded.disabled, health_deduction = excluded.health_deduction,
         health_exempt = excluded.health_exempt, children = excluded.children, iban = excluded.iban, updated_at = excluded.updated_at WHERE employees.company_id = ?2`,
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

/** A month's line: the employee, the income typed for the month, and once closed the payslip as it was. */
export interface RunLine {
  employeeId: string
  name: string
  insurer: Insurer
  gross: number
  /** Once closed: the days of the month employed, and the payslip as it was. */
  days?: number
  slip?: Payslip
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
              ...(Number.isInteger(l.days) ? { days: l.days as number } : {}),
              ...(l.slip && typeof l.slip === 'object' ? { slip: l.slip as Payslip } : {}),
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

/** The incomes typed for a month and its payday, kept while it is open. */
export function saveRunStatement(db: D1Database, company: string, period: string, payday: string | null, lines: RunLine[], by: string, at: number): D1PreparedStatement {
  const plain = JSON.stringify(lines.map(({ employeeId, name, insurer, gross }) => ({ employeeId, name, insurer, gross })))
  return db
    .prepare(
      `INSERT INTO payroll_runs (company_id, period, payday, lines, saved_at, saved_by) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (company_id, period) DO UPDATE SET payday = excluded.payday, lines = excluded.lines, saved_at = excluded.saved_at, saved_by = excluded.saved_by WHERE payroll_runs.closed_at IS NULL`,
    )
    .bind(company, period, payday, plain, at, by)
}

/** A month closed: its payslips as they were worked out, once. */
export function closeRunStatement(db: D1Database, company: string, period: string, payday: string, lines: RunLine[], by: string, today: string, at: number): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO payroll_runs (company_id, period, payday, lines, saved_at, saved_by, closed_at, closed_on, closed_by) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?5, ?7, ?6)
       ON CONFLICT (company_id, period) DO UPDATE SET payday = excluded.payday, lines = excluded.lines, closed_at = excluded.closed_at, closed_on = excluded.closed_on, closed_by = excluded.closed_by
       WHERE payroll_runs.closed_at IS NULL`,
    )
    .bind(company, period, payday, JSON.stringify(lines), at, by, today)
}

/** A month closed by mistake opened again: its incomes stay. */
export function reopenRunStatement(db: D1Database, company: string, period: string): D1PreparedStatement {
  return db.prepare('UPDATE payroll_runs SET closed_at = NULL, closed_on = NULL, closed_by = NULL WHERE company_id = ? AND period = ? AND closed_at IS NOT NULL').bind(company, period)
}

/** A month's payslips: the closed ones as they were, an open month's worked out from the incomes typed (else each employee's wage). */
export function monthSlips(period: string, employees: readonly Employee[], run: PayrollRun | null): (RunLine & { slip: Payslip; days: number })[] {
  if (run?.closedOn) return run.lines.filter((l): l is RunLine & { slip: Payslip } => Boolean(l.slip)).map((l) => ({ ...l, days: l.days ?? monthDays(period) }))
  const typed = new Map((run?.lines ?? []).map((l) => [l.employeeId, l.gross]))
  return employees
    .map((e) => ({ e, days: daysEmployed(e, period) }))
    .filter(({ days }) => days > 0)
    .map(({ e, days }) => {
      const gross = typed.get(e.id) ?? (days === monthDays(period) ? e.wage : Math.round((e.wage * days) / monthDays(period)))
      return {
        employeeId: e.id,
        name: e.name,
        insurer: e.insurer,
        gross,
        days,
        slip: payslip({ period, gross, declaration: e.declaration, children: e.children, disabled: e.disabled, healthDeduction: e.healthDeduction, healthMinimumExempt: e.healthExempt, days }),
      }
    })
}

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
  return {
    period: run.period,
    gross: sum((s) => s.gross),
    socialEmployee: sum((s) => s.socialEmployee),
    socialEmployer: sum((s) => s.socialEmployer),
    healthEmployee: sum((s) => s.healthEmployee),
    healthEmployer: sum((s) => s.healthEmployer),
    tax: totals.tax,
    pays: { social: totals.social, health: Object.values(totals.health), tax: totals.tax > 0 ? totals.tax : -1 },
  }
}
