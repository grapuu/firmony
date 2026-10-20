// The net wage calculator of the site (/mzdova-kalkulacka, 20 October 2026; the first of the next guides in the order
// of the handover: "mzdová kalkulačka", "čistá mzda 2027", "koľko stojí zamestnanec"). It is our payroll engine itself
// (payroll.ts, checked against the figures the authorities and others published), for an employment of a whole month
// with a monthly wage: what the employee gets and what the employer pays.
import { payrollYear, payslip, supportsPayrollPeriod, type Payslip } from './payroll'

export interface WageQuery {
  year: number
  /** The gross wage, in cents. */
  gross: number
  /** The signed declaration (the non-taxable part and the child bonus). */
  declaration: boolean
  /** Children under 15 and from 15 to 18, for the child bonus. */
  young: number
  teen: number
  disabled: boolean
}

export interface WageResult {
  query: WageQuery
  slip: Payslip
  /** What the employer pays in all: the gross wage and its levies. */
  cost: number
  minimumWage: number
}

/** The years the engine knows, the newest last. */
export function calcYears(): number[] {
  return [2026, 2027].filter((y) => supportsPayrollPeriod(`${y}-06`))
}

/** A month in the middle of the year: the children's age is reckoned for it. */
const MONTH = '06'

export function wageCalc(q: WageQuery): WageResult {
  const period = `${q.year}-${MONTH}`
  const children = [
    ...Array.from({ length: q.young }, (_, i) => ({ name: `Dieťa do 15 rokov ${i + 1}`, born: `${q.year - 5}-01-15` })),
    ...Array.from({ length: q.teen }, (_, i) => ({ name: `Dieťa od 15 do 18 rokov ${i + 1}`, born: `${q.year - 16}-01-15` })),
  ]
  const slip = payslip({ period, gross: q.gross, declaration: q.declaration, children, disabled: q.disabled, healthDeduction: false, healthMinimumExempt: false, days: 30 })
  return { query: q, slip, cost: slip.gross + slip.socialEmployer + slip.healthEmployer, minimumWage: payrollYear(q.year).minimumWage }
}

/** "1 500", "1500,50" or "1 500 €" in cents; null when it is no amount from 1 € to 100 000 €. */
export function grossOf(text: string | undefined): number | null {
  const plain = (text ?? '').replace(/[\s €]/g, '')
  const m = /^(\d{1,6})(?:[,.](\d{1,2}))?$/.exec(plain)
  if (!m) return null
  const cents = Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'))
  return cents >= 100 && cents <= 10_000_000 ? cents : null
}

/** The year asked, else this one, else the newest the engine knows. */
export function wageYearOf(rok: string | undefined, today: string): number {
  const years = calcYears()
  const asked = Number(rok)
  const current = Number(today.slice(0, 4))
  return years.includes(asked) ? asked : years.includes(current) ? current : (years[years.length - 1] as number)
}

/** The query from the address: the year, a wage, the declaration, children. */
export function wageQueryOf(q: Record<string, string | undefined>, today: string): { query: WageQuery | null; error: boolean } {
  const year = wageYearOf(q.rok, today)
  const count = (v: string | undefined) => Math.min(6, Math.max(0, Math.floor(Number(v ?? 0)) || 0))
  if (q.hruba === undefined) return { query: null, error: false }
  const gross = grossOf(q.hruba)
  if (gross === null) return { query: null, error: true }
  return { query: { year, gross, declaration: q.vyhlasenie === '1', young: count(q.deti), teen: count(q.deti15), disabled: q.zps === '1' }, error: false }
}
