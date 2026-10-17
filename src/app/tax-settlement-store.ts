// The annual settlements in the database (schema step 30): one row an employee's year, what the accountant gave for it
// and the result worked out when it was saved, and the payroll month it is settled in. tax-settlement.ts works it out;
// a month closed with a settlement keeps it on its slips, so a settlement is changed only while that month is open.
import { taxableOf } from './payroll'
import type { PayrollRun } from './payroll-store'
import { settlementInputsOf, type SettlementInputs, type SettlementResult, type YearIncome } from './tax-settlement'

type Row = Record<string, unknown>

export interface Settlement {
  employeeId: string
  year: number
  inputs: SettlementInputs
  result: SettlementResult | null
  savedAt: number | null
}

export async function settlementsOf(db: D1Database, company: string): Promise<Settlement[]> {
  const rows = await db.prepare('SELECT * FROM tax_settlements WHERE company_id = ? ORDER BY year, employee_id').bind(company).all<Row>()
  return rows.results.map((r) => {
    let inputs: unknown = null
    let result: unknown = null
    try {
      inputs = JSON.parse(String(r.inputs))
      result = r.result ? JSON.parse(String(r.result)) : null
    } catch {
      /* A row that cannot be read counts as empty. */
    }
    return { employeeId: String(r.employee_id), year: Number(r.year), inputs: settlementInputsOf(inputs), result: result && typeof result === 'object' ? (result as SettlementResult) : null, savedAt: typeof r.saved_at === 'number' ? r.saved_at : null }
  })
}

export function settlementStatement(db: D1Database, company: string, employeeId: string, year: number, inputs: SettlementInputs, result: SettlementResult, by: string, at: number): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO tax_settlements (company_id, employee_id, year, inputs, result, settle_in, saved_at, saved_by)
       SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8 WHERE EXISTS (SELECT 1 FROM employees WHERE id = ?2 AND company_id = ?1)
       ON CONFLICT (company_id, employee_id, year) DO UPDATE SET inputs = excluded.inputs, result = excluded.result, settle_in = excluded.settle_in, saved_at = excluded.saved_at, saved_by = excluded.saved_by`,
    )
    .bind(company, employeeId, year, JSON.stringify(inputs), JSON.stringify(result), inputs.settleIn, at, by)
}

/** What a year holds of an employee at this employer: the months closed, their taxable income, insurance, advances and bonuses (never a settlement of a year before). */
export function yearIncome(employeeId: string, runs: readonly PayrollRun[], year: number): YearIncome {
  const out: YearIncome = { taxable: 0, insurance: 0, advance: 0, bonus: 0, months: [] }
  for (const run of runs) {
    if (!run.closedOn || !run.period.startsWith(`${year}-`)) continue
    const l = run.lines.find((x) => x.employeeId === employeeId)
    if (!l?.slip) continue
    const s = l.slip
    out.taxable += taxableOf(s)
    out.insurance += s.socialEmployee + s.healthEmployee
    out.advance += s.advance
    out.bonus += s.bonus
    if (taxableOf(s) > 0) out.months.push(run.period)
  }
  out.months.sort()
  return out
}

/** Whether a closed month already carries a settlement of the employee (then it is changed only by opening that month). */
export const settledInClosed = (s: Settlement | undefined, runs: readonly PayrollRun[]): boolean =>
  Boolean(s?.inputs.settleIn && runs.some((r) => r.closedOn && r.period === s.inputs.settleIn && r.lines.some((l) => l.employeeId === s.employeeId && l.slip?.settlementTax !== undefined)))
