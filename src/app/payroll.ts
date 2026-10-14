// Payroll of an employee in an employment relationship with a regular monthly wage (pracovný pomer): what the
// insurances and the income tax take from the wage the employer accounts for a month, what the employer pays on top,
// and what the employee gets. Pure: what is stored is in payroll-store.ts, the pages in views/payroll.tsx; every rule is
// checked in test/units.test.mjs against figures the authorities and the profession published.
//
// What each rule leans on (read on 14 October 2026):
// - Social insurance (Act No. 461/2003 Z. z.; Sociálna poisťovňa, "Tabuľky platenia poistného od 1. januára 2026"):
//   the employee 1,4 % sickness, 4 % old-age, 3 % disability, 1 % unemployment; the employer 1,4 %, 14 %, 3 %, 0,5 %
//   unemployment and 0,5 % for the support in short-time work, 0,25 % guarantee, 0,8 % accident, 4,75 % the reserve
//   fund; each from the assessment base capped at 11 times the average monthly wage of two years before (16 764 € in
//   2026, 17 820 € in 2027 from the average of 2025, 1 620 €, as the Agency published it), but accident insurance, which
//   has no cap. The base and each amount are rounded down to the cent, each kind of insurance on its own.
// - Health insurance (Act No. 580/2004 Z. z.; VšZP, Dôvera): the employee 5 % (2,5 % with a disability) in 2026 and 2027,
//   the employer 11 % (5,5 %), no cap; rounded down. A low income may claim the deductible item (odpočítateľná položka,
//   § 16(16): up to 380 € off the employee's base below 570 €, rounded up), and the employee pays at least the minimum
//   advance (§ 16a: the employee's and the employer's rate of the subsistence minimum of 1 January, by the days of the
//   month he was employed), unless an exception applies (another insurer pays for him, or he declared another job).
// - The tax advance (Act No. 595/2003 Z. z., § 35, § 11, § 15, § 33; the Financial Directorate's pages "Výpočet preddavkov
//   na daň - sadzba dane", "Daňový bonus na dieťa v roku 2026", "Zaokrúhľovanie - postup platný od roku 2020"): the wage
//   less the employee's insurance is the partial base; with the signed declaration, a twelfth of the non-taxable part
//   (21 times the subsistence minimum of 1 January: 5 966,73 € in 2026, 6 199,62 € in 2027) comes off it; the rest is
//   taxed 19 % up to a twelfth of 154,8 times the subsistence minimum, 25 % to 212,4 times, 30 % to 264 times, 35 %
//   above (from 2026). The child bonus: 100 € a month for a child up to the month it turns 15, 50 € to the month it turns
//   18; together at most 29 % of the partial base for one child, 7 points more for each next up to 64 %; each child's
//   lowered by a tenth of the partial base above 1,5 times the average monthly wage of two years before. Since 2020 the
//   amounts of the income tax are rounded mathematically to the cent (§ 47).
//
// Said plainly, what is not built: agreements outside employment (dohody), a director's remuneration, pensioners and
// students (their insurance differs), sick pay and holiday pay worked out by the app (the accountant types the month's
// income), the annual reconciliation (ročné zúčtovanie), wage deductions (exekúcie), meal allowances.

/** The figures of a year, in cents; the rates are in hundredths of a per cent (basis points). */
export interface PayrollYear {
  year: number
  /** The subsistence minimum of one adult valid on 1 January (životné minimum). */
  subsistence: number
  /** The average monthly wage of the year two years before (Statistical Office). */
  averageWage: number
  /** The monthly minimum wage. */
  minimumWage: number
}

/** Verified for 2026; for 2027 from the subsistence minimum of 1 July 2026 (295,22 €) and the average wage of 2025 (1 620 €). */
export const PAYROLL_YEARS: Readonly<Record<number, PayrollYear>> = {
  2026: { year: 2026, subsistence: 28413, averageWage: 152400, minimumWage: 91500 },
  2027: { year: 2027, subsistence: 29522, averageWage: 162000, minimumWage: 97200 },
}

/** The year's figures, or the nearest year known (a later year until its figures are added). */
export function payrollYear(year: number): PayrollYear {
  const known = Object.keys(PAYROLL_YEARS).map(Number).sort((a, b) => a - b)
  const pick = known.filter((y) => y <= year).pop() ?? (known[0] as number)
  return PAYROLL_YEARS[pick] as PayrollYear
}

export type SocialKind = 'sickness' | 'oldAge' | 'disability' | 'unemployment' | 'support' | 'guarantee' | 'accident' | 'reserve'

/** The employee's and the employer's rates of social insurance, in basis points. */
export const SOCIAL_EMPLOYEE: Readonly<Partial<Record<SocialKind, number>>> = { sickness: 140, oldAge: 400, disability: 300, unemployment: 100 }
export const SOCIAL_EMPLOYER: Readonly<Partial<Record<SocialKind, number>>> = {
  sickness: 140,
  oldAge: 1400,
  disability: 300,
  unemployment: 50,
  support: 50,
  guarantee: 25,
  accident: 80,
  reserve: 475,
}
/** Health insurance in basis points: the employee and the employer, halved for a person with a disability. */
export const HEALTH = { employee: 500, employer: 1100 } as const

/** The share of the partial base the child bonus may reach, by the number of children (§ 33(6)). */
export const BONUS_CAP = [0, 2900, 3600, 4300, 5000, 5700, 6400] as const

export interface Child {
  name: string
  born: string
}

export interface PayInput {
  /** The month, YYYY-MM. */
  period: string
  /** What the employer accounts for the month: the wage and everything that is the assessment base and taxable. */
  gross: number
  /** The signed declaration (vyhlásenie): the non-taxable part and the child bonus. */
  declaration: boolean
  children: Child[]
  disabled: boolean
  /** The deductible item of health insurance claimed (a low income). */
  healthDeduction: boolean
  /** An exception from the minimum health advance (another insurer pays, another job declared). */
  healthMinimumExempt: boolean
  /** The days of the month the employment lasted (the minimum health advance is shared by them). */
  days: number
}

export interface Payslip {
  period: string
  gross: number
  /** The social assessment base (capped) and each kind of insurance, the employee's and the employer's. */
  socialBase: number
  social: { employee: Partial<Record<SocialKind, number>>; employer: Partial<Record<SocialKind, number>> }
  socialEmployee: number
  socialEmployer: number
  /** The deductible item, the minimum topped up, the employee's and the employer's health advances. */
  healthDeduction: number
  healthTopUp: number
  healthEmployee: number
  healthEmployer: number
  /** The partial base (gross less the employee's insurance), the non-taxable part, the taxed base. */
  partialBase: number
  nonTaxable: number
  taxBase: number
  /** The advance before the bonus, the bonus, and what is withheld (minus: paid out with the wage). */
  advance: number
  bonus: number
  bonusByChild: { name: string; amount: number }[]
  withheld: number
  net: number
  employerCost: number
}

const floorCents = (value: number): number => Math.floor(value + 1e-9)
/** Mathematical rounding to the cent (§ 47 since 2020). */
const roundCents = (value: number): number => Math.round(value)

/** The last day of a month and the number of its days. */
export function monthDays(period: string): number {
  const [y, m] = period.split('-').map(Number) as [number, number]
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

/** The social insurance cap of a year: 11 times the average monthly wage of two years before. */
export const socialCap = (y: PayrollYear): number => 11 * y.averageWage

/** The non-taxable part of a year (21 times the subsistence minimum) and its twelfth for a month. */
export const nonTaxableYear = (y: PayrollYear): number => roundCents(21 * y.subsistence)
export const nonTaxableMonth = (y: PayrollYear): number => roundCents(nonTaxableYear(y) / 12)

/** The monthly limits of the tax bands: a twelfth of 154,8, 212,4 and 264 times the subsistence minimum. */
export function monthlyBands(y: PayrollYear): [number, number, number] {
  const band = (times: number) => roundCents(roundCents(times * y.subsistence) / 12)
  return [band(154.8), band(212.4), band(264)]
}

/** The tax of a month's base by the bands, rounded once at the end. */
export function bandTax(base: number, y: PayrollYear): number {
  const [b1, b2, b3] = monthlyBands(y)
  const part = (from: number, to: number) => Math.max(0, Math.min(base, to) - from)
  return roundCents((part(0, b1) * 19 + part(b1, b2) * 25 + part(b2, b3) * 30 + part(b3, Number.POSITIVE_INFINITY) * 35) / 100)
}

/** Whole years of a person on the last day of a month. */
function ageAt(born: string, period: string): { years: number; birthdayMonth: boolean } {
  const [by, bm] = born.split('-').map(Number) as [number, number]
  const [py, pm] = period.split('-').map(Number) as [number, number]
  const years = py - by - (pm < bm ? 1 : 0)
  return { years, birthdayMonth: pm === bm }
}

/** A child's bonus for a month by its age: 100 € to the month it turns 15, 50 € to the month it turns 18; none before its birth's month. */
export function childBonus(child: Child, period: string): number {
  if (child.born.slice(0, 7) > period) return 0
  const { years, birthdayMonth } = ageAt(child.born, period)
  if (years < 15 || (years === 15 && birthdayMonth)) return 10000
  if (years < 18 || (years === 18 && birthdayMonth)) return 5000
  return 0
}

/** The deductible item of health insurance for a month's income (§ 16(16)): 380 € off below 380 €, less above it, none from 570 €. */
export function healthDeductible(income: number): number {
  if (income >= 57000) return 0
  if (income <= 38000) return income
  return Math.max(0, Math.ceil(38000 - (income - 38000) * 2))
}

/** One employee's month. */
export function payslip(input: PayInput): Payslip {
  const y = payrollYear(Number(input.period.slice(0, 4)))
  const gross = Math.max(0, Math.round(input.gross))
  const socialBase = Math.min(gross, socialCap(y))
  const employee: Partial<Record<SocialKind, number>> = {}
  const employer: Partial<Record<SocialKind, number>> = {}
  for (const [kind, bp] of Object.entries(SOCIAL_EMPLOYEE) as [SocialKind, number][]) employee[kind] = floorCents((socialBase * bp) / 10000)
  for (const [kind, bp] of Object.entries(SOCIAL_EMPLOYER) as [SocialKind, number][]) employer[kind] = floorCents(((kind === 'accident' ? gross : socialBase) * bp) / 10000)
  const socialEmployee = Object.values(employee).reduce((s, v) => s + (v ?? 0), 0)
  const socialEmployer = Object.values(employer).reduce((s, v) => s + (v ?? 0), 0)

  const half = input.disabled ? 2 : 1
  const healthDeduction = input.healthDeduction ? healthDeductible(gross) : 0
  let healthEmployee = floorCents(((gross - healthDeduction) * HEALTH.employee) / half / 10000)
  const healthEmployer = floorCents((gross * HEALTH.employer) / half / 10000)
  // The minimum advance: the employee's and the employer's rate of the subsistence minimum, each rounded down (VšZP:
  // 45,45 € in 2026), by the days employed; what the two fall short of it the employee pays (§ 16a).
  let healthTopUp = 0
  if (!input.healthMinimumExempt) {
    const days = Math.min(monthDays(input.period), Math.max(0, input.days))
    const whole = floorCents((y.subsistence * HEALTH.employee) / half / 10000) + floorCents((y.subsistence * HEALTH.employer) / half / 10000)
    const minimum = floorCents((whole * days) / monthDays(input.period))
    healthTopUp = Math.max(0, minimum - healthEmployee - healthEmployer)
    healthEmployee += healthTopUp
  }

  const partialBase = gross - socialEmployee - healthEmployee
  const nonTaxable = input.declaration ? Math.min(Math.max(0, partialBase), nonTaxableMonth(y)) : 0
  const taxBase = Math.max(0, partialBase - nonTaxable)
  const advance = bandTax(taxBase, y)

  // The child bonus, with the declaration: each child by its age, lowered above 1,5 times the average wage, the whole
  // at most a share of the partial base.
  const eligible = input.declaration ? input.children.map((c) => ({ name: c.name, amount: childBonus(c, input.period) })).filter((c) => c.amount > 0) : []
  const threshold = Math.round(1.5 * y.averageWage)
  const cut = partialBase > threshold ? (partialBase - threshold) / 10 : 0
  const reduced = eligible.map((c) => ({ name: c.name, amount: Math.max(0, c.amount - cut) }))
  const cap = ((BONUS_CAP[Math.min(reduced.length, 6)] ?? 0) * Math.max(0, partialBase)) / 10000
  const whole = reduced.reduce((s, c) => s + c.amount, 0)
  const scale = whole > cap ? cap / whole : 1
  const bonusByChild = reduced.map((c) => ({ name: c.name, amount: roundCents(c.amount * scale) }))
  const bonus = roundCents(Math.min(whole, cap))
  const withheld = advance - bonus
  const net = gross - socialEmployee - healthEmployee - withheld
  return {
    period: input.period,
    gross,
    socialBase,
    social: { employee, employer },
    socialEmployee,
    socialEmployer,
    healthDeduction,
    healthTopUp,
    healthEmployee,
    healthEmployer,
    partialBase,
    nonTaxable,
    taxBase,
    advance,
    bonus,
    bonusByChild,
    withheld,
    net,
    employerCost: gross + socialEmployer + healthEmployer,
  }
}

/** The sums of a month's payslips: what goes to the Social Insurance Agency, to each health insurer, to the tax office, and to the employees. */
export interface PayrollTotals {
  gross: number
  net: number
  social: number
  /** By the health insurer's code (24 Dôvera, 25 VšZP, 27 Union). */
  health: Record<string, number>
  /** The advances withheld less the bonuses: what the employer remits (minus: what it pays out of its own and claims back). */
  tax: number
  employerCost: number
}

export function payrollTotals(slips: readonly (Payslip & { insurer: string })[]): PayrollTotals {
  const health: Record<string, number> = {}
  for (const s of slips) health[s.insurer] = (health[s.insurer] ?? 0) + s.healthEmployee + s.healthEmployer
  return {
    gross: slips.reduce((t, s) => t + s.gross, 0),
    net: slips.reduce((t, s) => t + s.net, 0),
    social: slips.reduce((t, s) => t + s.socialEmployee + s.socialEmployer, 0),
    health,
    tax: slips.reduce((t, s) => t + s.withheld, 0),
    employerCost: slips.reduce((t, s) => t + s.employerCost, 0),
  }
}
