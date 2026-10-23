// The SZČO (živnostník) tax-and-levy calculator (/szco-kalkulacka). A yearly estimate, "orientačný", for the standard
// self-employed person with the 60 % flat-rate expenses and no concurrence (súbeh), disability or mikroodvod — those
// are said on the page and left out. Figures verified 23 October 2026 against the primary sources and cross-checked
// with the payroll engine (app/payroll.ts): SP 33,15 % (18 + 6 + 4,75 + 4,4), ZP 16 %, coefficient 1,486, minimum SP
// base 60 % and maximum 11× of the average wage, minimum ZP base 50 % and no maximum, 60 % flat expenses capped at
// 20 000 €, 15 % small-business rate up to 100 000 € of revenue, above it progressive 19/25/30/35 %.
import { payrollYear, supportsPayrollPeriod } from './payroll'

export const SZCO_SP_RATE = 33.15
export const SZCO_ZP_RATE = 16
export const SZCO_COEFFICIENT = 1.486
export const SZCO_PAUSAL_PCT = 60
export const SZCO_PAUSAL_CAP = 2_000_000 // cents = 20 000 €
export const SZCO_SMALL_REVENUE = 10_000_000 // cents = 100 000 €

export interface SzcoQuery {
  year: number
  /** The yearly revenue (príjmy), in cents. */
  revenue: number
  /** pausal = 60 % flat-rate expenses; real = expenses typed in. */
  mode: 'pausal' | 'real'
  /** Yearly expenses in cents, only for mode 'real'. */
  expenses: number
}

export interface SzcoResult {
  query: SzcoQuery
  expenses: number
  czd: number
  spBase: number
  zpBase: number
  spMonthly: number
  zpMonthly: number
  odvody: number
  base: number
  nczd: number
  tax: number
  net: number
  averageWage: number
}

export const szcoYears = (): number[] => [2026, 2027].filter((y) => supportsPayrollPeriod(`${y}-06`))

export function szcoCalc(q: SzcoQuery): SzcoResult {
  const y = payrollYear(q.year)
  const avg = y.averageWage // monthly average wage, cents
  const sub = y.subsistence // monthly subsistence minimum, cents
  const expenses = q.mode === 'pausal' ? Math.min(Math.round((q.revenue * SZCO_PAUSAL_PCT) / 100), SZCO_PAUSAL_CAP) : q.expenses
  const czd = Math.max(0, q.revenue - expenses)
  // Yearly assessment base from the partly adjusted tax base through the statutory coefficient, then monthly.
  const vzMonthly = czd / SZCO_COEFFICIENT / 12
  const minSp = Math.round((avg * 60) / 100)
  const maxSp = avg * 11
  const spBase = Math.min(Math.max(vzMonthly, minSp), maxSp)
  const minZp = Math.round((avg * 50) / 100)
  const zpBase = Math.max(vzMonthly, minZp)
  const spMonthly = Math.round((spBase * SZCO_SP_RATE) / 100)
  const zpMonthly = Math.round((zpBase * SZCO_ZP_RATE) / 100)
  const odvody = (spMonthly + zpMonthly) * 12
  const base = czd - odvody
  // Non-taxable part: full up to 91,8× the subsistence minimum, above it 51,6× minus a third of the base, at least zero.
  const full = Math.round(sub * 21)
  const threshold = Math.round(sub * 91.8)
  const reducMax = Math.round(sub * 51.6)
  const nczd = base <= threshold ? full : Math.max(0, reducMax - Math.round(base / 3))
  const taxable = Math.max(0, base - nczd)
  const tax = q.revenue <= SZCO_SMALL_REVENUE ? Math.round((taxable * 15) / 100) : progressiveTax(taxable, sub)
  const net = q.revenue - expenses - odvody - tax
  return { query: q, expenses, czd, spBase, zpBase, spMonthly, zpMonthly, odvody, base, nczd, tax, net, averageWage: avg }
}

function progressiveTax(taxable: number, sub: number): number {
  const b1 = Math.round(sub * 154.8)
  const b2 = Math.round(sub * 212.4)
  const b3 = Math.round(sub * 264)
  const slice = (lo: number, hi: number, rate: number) => Math.round((Math.max(0, Math.min(taxable, hi) - lo) * rate) / 100)
  return slice(0, b1, 19) + slice(b1, b2, 25) + slice(b2, b3, 30) + slice(b3, Number.MAX_SAFE_INTEGER, 35)
}

/** "25 000", "25000,50" or "25 000 €" in cents; null when it is no amount from 1 € to 10 000 000 €. */
export function szcoRevenueOf(text: string | undefined): number | null {
  const plain = (text ?? '').replace(/[\s €]/g, '')
  const m = /^(\d{1,8})(?:[,.](\d{1,2}))?$/.exec(plain)
  if (!m) return null
  const cents = Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'))
  return cents >= 100 && cents <= 1_000_000_000 ? cents : null
}

export function szcoYearOf(rok: string | undefined, today: string): number {
  const years = szcoYears()
  const asked = Number(rok)
  const current = Number(today.slice(0, 4))
  return years.includes(asked) ? asked : years.includes(current) ? current : (years[years.length - 1] as number)
}

export function szcoQueryOf(q: Record<string, string | undefined>, today: string): { query: SzcoQuery | null; error: boolean } {
  const year = szcoYearOf(q.rok, today)
  if (q.prijem === undefined) return { query: null, error: false }
  const revenue = szcoRevenueOf(q.prijem)
  if (revenue === null) return { query: null, error: true }
  const mode = q.vydavky === 'real' ? 'real' : 'pausal'
  const expenses = mode === 'real' ? (szcoRevenueOf(q.vydavky_suma) ?? 0) : 0
  if (mode === 'real' && q.vydavky_suma !== undefined && szcoRevenueOf(q.vydavky_suma) === null) return { query: null, error: true }
  return { query: { year, revenue, mode, expenses }, error: false }
}
