// The SZČO (živnostník) tax-and-levy calculator (/szco-kalkulacka). A yearly estimate, "orientačný", for a
// self-employed person who trades the whole year and the year before, with the 60 % flat-rate expenses or the real
// ones, and no concurrence (súbeh) or disability: those are said on the page and left out. The tax figures were
// verified 23 October 2026 against the primary sources and cross-checked with the payroll engine (app/payroll.ts): ZP
// 16 %, coefficient 1,486, minimum ZP base 50 % of the average wage and no maximum, 60 % flat expenses capped at
// 20 000 €, 15 % small-business rate up to 100 000 € of revenue, above it progressive 19/25/30/35 %.
//
// Social insurance, read on 26 October 2026:
// - Sociálna poisťovňa, "Poistné SZČO od 1. júla 2026 (mikroodvod)",
//   https://www.socpoist.sk/socialne-poistenie/platenie-poistneho/poistne-szco-od-1-jula-2026-mikroodvod?ref=2496 :
//   from 1 July 2026 an SZČO whose business income of the year before (príjem z podnikania a z inej samostatnej
//   zárobkovej činnosti, not its tax base) does not exceed 10,5 times the subsistence minimum of one adult is not
//   insured ("V roku 2026 je hranica stanovená na 2 876,90 eura", for the income of 2025); with an income up to 9 144 €
//   it pays from a special base, 26 % of a twelfth of the general assessment base (396,24 €, 131,34 € a month from
//   1 July 2026); above 9 144 € from a twelfth of its tax base divided by 1,486, at least 914,40 € (303,11 €). Its
//   example for 2027 tests the income of 2026 against 2 983,37 €, "10,5-násobku sumy životného minima pre jednu
//   plnoletú fyzickú osobu platného k 1. januáru 2026", and against 9 720 €, with the special base 421,20 € and
//   139,61 € "platný pre rok 2027". The open point (2 876,90 € or 2 983,37 €) is so settled: the lower limit is
//   10,5 times the subsistence minimum valid on 1 January of the year whose income is tested (273,99 € on 1 January
//   2025 gives 2 876,90 €, 284,13 € on 1 January 2026 gives 2 983,37 €; both in garnish.ts), the test of 1 July 2026
//   uses the first, that of 1 July 2027 the second. A new SZČO is insured from the first day of the sixth calendar
//   month after the month its trade began.
// - Sociálna poisťovňa, "Najdôležitejšie zmeny v sociálnom poistení od 1. 1. 2026",
//   https://www.socpoist.sk/socialne-poistenie/zmeny-v-socialnom-poisteni/najdolezitejsie-zmeny-v-socialnom-poisteni-od-1-1?ref=2441 :
//   the higher income is compared with 50 % of the general assessment base ("pre rok 2026 je to príjem 9 144,01 eura a
//   viac"); the base so determined holds from 1 July to 30 June of the next year; from 1 January to 30 June 2026 an SZČO
//   of before 2026 kept the former rules (transition); the minimum base 914,40 € (60 %) and premium 303,11 €, the
//   maximum base 16 764 € and premium 5 557,26 €, the special base 396,24 € and premium 131,34 €.
// - podnikajte.sk, "Dôležité čísla v podnikaní 2026", https://www.podnikajte.sk/dane/dolezite-cisla-v-podnikani-2026 :
//   the same 2026 figures from the average wage of 2024, 1 524 € (special base 26 %, minimum 60 %, maximum 11 times),
//   the minimum health base 762 € and advance 121,92 €; and "Hranica príjmov pre (ne)platenie odvodov do Sociálnej
//   poisťovne v roku 2027" (17 August 2026),
//   https://www.podnikajte.sk/socialne-a-zdravotne-odvody/hranica-prijmov-pre-ne-platenie-odvodov-do-socialnej-poistovne-v-roku-2027 :
//   2 983,37 € for the income of 2026, the upper limit 9 720 € (12 times 50 % of the average wage of 2025, 1 620 €),
//   the special base 421,20 € (139,61 €), the minimum base 972 € (322,21 €).
// - financnykompas.sk, "SZČO: odvody do Sociálnej a zdravotnej poisťovne" (23 February 2026),
//   https://www.financnykompas.sk/clanok/szco-odvody-do-socialnej-a-zdravotnej-poistovne : the funds, sickness 4,4 %,
//   old age 18 %, disability 6 %, the reserve fund 4,75 %, together 33,15 %.
//   Each fund is rounded down to the cent on its own and the four are added: only so do the Agency's 303,11 €,
//   5 557,26 €, 131,34 € and 139,61 € come out (33,15 % of the whole base gives a cent or two more).
//
// How a year is modelled: the income of the year before is taken to equal this year's revenue. July to December follow
// the test of 1 July of the year, January to June that of 1 July of the year before; the amounts (special, minimum and
// maximum base) are those of the calendar year. 2026 is worked out whole by the rules from 1 July 2026: its first half
// kept the former rules for an SZČO of before 2026, which the calculator does not model, and the page says so.
import { payrollYear, supportsPayrollPeriod } from './payroll'
import { subsistenceOn } from './garnish'

export const SZCO_SP_RATE = 33.15
/** The funds of an SZČO's social insurance in basis points; each is rounded down on its own (szcoPremium). */
export const SZCO_SP_FUNDS: Readonly<Record<'sickness' | 'oldAge' | 'disability' | 'reserve', number>> = { sickness: 440, oldAge: 1800, disability: 600, reserve: 475 }
export const SZCO_ZP_RATE = 16
export const SZCO_COEFFICIENT = 1.486
export const SZCO_PAUSAL_PCT = 60
export const SZCO_PAUSAL_CAP = 2_000_000 // cents = 20 000 €
export const SZCO_SMALL_REVENUE = 10_000_000 // cents = 100 000 €
/** The year of the first income test (1 July 2026, the mikroodvod). */
export const SZCO_TEST_FROM = 2026
/** The special base is 26 % and the minimum base 60 % of the average monthly wage of two years before. */
export const SZCO_SPECIAL_PCT = 26
export const SZCO_MIN_PCT = 60

export interface SzcoQuery {
  year: number
  /** The yearly revenue (príjmy), in cents. */
  revenue: number
  /** pausal = 60 % flat-rate expenses; real = expenses typed in. */
  mode: 'pausal' | 'real'
  /** Yearly expenses in cents, only for mode 'real'. */
  expenses: number
}

/** The income test of 1 July of a year: what the income of the year before is compared with, in cents. */
export interface SzcoTest {
  /** The year of the 1 July test. */
  year: number
  /** Up to it (inclusive) no social insurance: 10,5 times the subsistence minimum of 1 January of the income's year. */
  lower: number
  /** Up to it (inclusive) the special base: six times the average monthly wage of two years before. */
  upper: number
}

export type SzcoBand = 'none' | 'special' | 'base'

/** Half a year of social insurance: which test it follows, its band, the monthly base and premium (cents). */
export interface SzcoHalf {
  test: SzcoTest
  band: SzcoBand
  base: number
  /** In the band 'base': whether the base from the tax base was lifted to the minimum or cut to the maximum. */
  limit: 'minimum' | 'maximum' | null
  monthly: number
}

export interface SzcoResult {
  query: SzcoQuery
  expenses: number
  czd: number
  /** January to June, July to December. */
  social: [SzcoHalf, SzcoHalf]
  spYear: number
  zpBase: number
  zpMonthly: number
  zpYear: number
  odvody: number
  base: number
  nczd: number
  tax: number
  /** What is left: in the flat-rate mode before the real business costs (revenue less levies and tax). */
  net: number
  averageWage: number
}

export const szcoYears = (): number[] => [2026, 2027].filter((y) => supportsPayrollPeriod(`${y}-06`))

/** The income test of 1 July of a year (from 2026). */
export function szcoTest(year: number): SzcoTest {
  const zm = subsistenceOn(`${year - 1}-01-01`)
  if (zm === null || year < SZCO_TEST_FROM) throw new RangeError(`No SZČO income test for ${year}`)
  return { year, lower: Math.round(zm * 10.5), upper: 6 * payrollYear(year).averageWage }
}

/** A month's social insurance from a base: each fund rounded down to the cent on its own, then added. */
export function szcoPremium(base: number): number {
  return Object.values(SZCO_SP_FUNDS).reduce((sum, bp) => sum + Math.floor((base * bp) / 10_000 + 1e-9), 0)
}

/** The special (26 %), minimum (60 %) and maximum (11 times) monthly bases of social insurance of a calendar year, and the
 * minimum base of health insurance (50 %, no maximum). */
export function szcoBases(year: number): { special: number; minimum: number; maximum: number; health: number } {
  const avg = payrollYear(year).averageWage
  return {
    special: Math.round((avg * SZCO_SPECIAL_PCT) / 100),
    minimum: Math.round((avg * SZCO_MIN_PCT) / 100),
    maximum: avg * 11,
    health: Math.round((avg * 50) / 100),
  }
}

/** A month's health insurance advance from a base (16 %). */
export const szcoHealthPremium = (base: number): number => Math.round((base * SZCO_ZP_RATE) / 100)

function socialHalf(year: number, testYear: number, income: number, fromTaxBase: number): SzcoHalf {
  const test = szcoTest(testYear)
  const bases = szcoBases(year)
  if (income <= test.lower) return { test, band: 'none', base: 0, limit: null, monthly: 0 }
  if (income <= test.upper) return { test, band: 'special', base: bases.special, limit: null, monthly: szcoPremium(bases.special) }
  const limit = fromTaxBase < bases.minimum ? 'minimum' : fromTaxBase > bases.maximum ? 'maximum' : null
  const base = limit === 'minimum' ? bases.minimum : limit === 'maximum' ? bases.maximum : fromTaxBase
  return { test, band: 'base', base, limit, monthly: szcoPremium(base) }
}

export function szcoCalc(q: SzcoQuery): SzcoResult {
  const y = payrollYear(q.year)
  const avg = y.averageWage // monthly average wage, cents
  const sub = y.subsistence // monthly subsistence minimum, cents
  const expenses = q.mode === 'pausal' ? Math.min(Math.round((q.revenue * SZCO_PAUSAL_PCT) / 100), SZCO_PAUSAL_CAP) : q.expenses
  const czd = Math.max(0, q.revenue - expenses)
  // The monthly assessment base from the partly adjusted tax base through the statutory coefficient.
  const vzMonthly = czd / SZCO_COEFFICIENT / 12
  // Social insurance by halves: the income tested is the business income (the revenue), taken as the year before's.
  const social: [SzcoHalf, SzcoHalf] = [
    socialHalf(q.year, Math.max(SZCO_TEST_FROM, q.year - 1), q.revenue, vzMonthly),
    socialHalf(q.year, q.year, q.revenue, vzMonthly),
  ]
  const spYear = (social[0].monthly + social[1].monthly) * 6
  const zpBase = Math.max(vzMonthly, szcoBases(q.year).health)
  const zpMonthly = szcoHealthPremium(zpBase)
  const zpYear = zpMonthly * 12
  const odvody = spYear + zpYear
  const base = czd - odvody
  // Non-taxable part: full up to 91,8× the subsistence minimum, above it 51,6× minus a third of the base, at least zero.
  const full = Math.round(sub * 21)
  const threshold = Math.round(sub * 91.8)
  const reducMax = Math.round(sub * 51.6)
  const nczd = base <= threshold ? full : Math.max(0, reducMax - Math.round(base / 3))
  const taxable = Math.max(0, base - nczd)
  const tax = q.revenue <= SZCO_SMALL_REVENUE ? Math.round((taxable * 15) / 100) : progressiveTax(taxable, sub)
  // The flat-rate expenses are no money spent: what is left is before the real costs of the business.
  const net = q.mode === 'pausal' ? q.revenue - odvody - tax : q.revenue - expenses - odvody - tax
  return { query: q, expenses, czd, social, spYear, zpBase, zpMonthly, zpYear, odvody, base, nczd, tax, net, averageWage: avg }
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
