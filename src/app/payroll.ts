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
// - Who is insured how (read on 17 October 2026; the Agency's pages "Tabuľky platenia poistného od 1. januára 2026" and
//   "Poistné pri dohodároch", DAUČ 10. 9. 2025 on a director's remuneration, podnikajte.sk "Odvody dohodárov v roku 2026"):
//   an employment or an agreement with a regular monthly income is insured as an employee; one with an irregular income
//   (an agreement to perform a task, an agreement of irregular work, a student's agreement) only for old age and
//   disability, the employer adding the guarantee, accident insurance and the reserve fund; a director's remuneration
//   (a commercial relationship, no labour law) carries no accident and no guarantee insurance, and its unemployment
//   insurance is the employer's 1 % whole (the support in short-time work is for labour relationships). A pensioner of old
//   age, an early old-age or a service pension after the age pays no disability and no unemployment insurance; one with a
//   disability pension above 70 % no unemployment insurance; a pensioner on an agreement neither sickness nor
//   unemployment insurance. A student on a student's agreement and a pensioner on an agreement with a regular income may
//   claim the deduction (odvodová odpočítateľná položka) for one agreement: 200 € a month in 2026 off the base of old
//   age, disability and the reserve fund (300 € from 2027), accident and guarantee insurance from the whole. A student
//   on a student's agreement and an old-age pensioner on an agreement are no employees for health insurance (the state
//   pays for them).
// - Sick pay (náhrada príjmu, Act No. 462/2003 Z. z. as of 1 January 2026, read on slov-lex): for calendar days from the
//   first day of the incapacity, at most to its fourteenth; 25 % of the daily assessment base for days 1 to 3, 55 % for
//   days 4 to 14; the base is the sickness insurance bases of the decisive period divided by its days, rounded down to four
//   decimals, at most the day's share of twice the general assessment base of two years before; the sum is rounded up to
//   the cent. It is taxed with the wage and no assessment base of the insurances (pay-month.ts works it out).
//
// Said plainly, what is not built: wage deductions (exekúcie), seasonal work (its 762 € deduction), a
// collective agreement's higher rates, contributions to the supplementary pension saving.

import type { MealMoney } from './meals'

/** The figures of a year, in cents; the rates are in hundredths of a per cent (basis points). */
export interface PayrollYear {
  year: number
  /** The subsistence minimum of one adult valid on 1 January (životné minimum). */
  subsistence: number
  /** The average monthly wage of the year two years before (Statistical Office). */
  averageWage: number
  /** The monthly minimum wage. */
  minimumWage: number
  /** The deduction a student or a pensioner may claim on one agreement (odvodová odpočítateľná položka). */
  exemption: number
}

/** Verified for 2026; for 2027 from the subsistence minimum of 1 July 2026 (295,22 €) and the average wage of 2025 (1 620 €). */
export const PAYROLL_YEARS: Readonly<Record<number, PayrollYear>> = {
  2026: { year: 2026, subsistence: 28413, averageWage: 152400, minimumWage: 91500, exemption: 20000 },
  2027: { year: 2027, subsistence: 29522, averageWage: 162000, minimumWage: 97200, exemption: 30000 },
}

/** The relationships a person is paid under. */
export const CONTRACTS = ['employment', 'dovp', 'dopc', 'dobps', 'director'] as const
export type ContractKind = (typeof CONTRACTS)[number]
export const isContract = (v: unknown): v is ContractKind => typeof v === 'string' && (CONTRACTS as readonly string[]).includes(v)
/** An agreement outside employment (dohoda). */
export const isAgreement = (k: ContractKind): boolean => k === 'dovp' || k === 'dopc' || k === 'dobps'

/**
 * A pension the person draws, as far as the insurance minds it (the Agency's tables of 2026, footnotes * and **): old
 * age or early old age; disability up to 70 %; disability above 70 %; a service pension after the retirement age.
 */
export const PENSIONS = ['none', 'old', 'invalid', 'invalid70', 'service'] as const
export type PensionKind = (typeof PENSIONS)[number]
export const isPension = (v: unknown): v is PensionKind => typeof v === 'string' && (PENSIONS as readonly string[]).includes(v)

/**
 * Whether a relationship has a regular monthly income: an employment always does; an agreement, a student's too (§ 4(2)
 * of Act 461/2003), as agreed. A student's agreement is insured the same either way; the income decides its report.
 */
export const regularOf = (kind: ContractKind, regular: boolean): boolean => (kind === 'employment' ? true : regular)

/**
 * Who may claim the deduction: a student on a student's agreement, a pensioner on another agreement, a regular or an
 * irregular income alike (the Agency's table of agreements, section 7). The monthly report has no type for a
 * pensioner's irregular income with it (ZECD1V and ZECD2V are regular): that row is prepared outside (social.ts).
 */
export const exemptionAllowed = (kind: ContractKind, pension: PensionKind, _regular?: boolean): boolean => kind === 'dobps' || ((kind === 'dovp' || kind === 'dopc') && pension !== 'none')

/** The monthly minimum wage for an hour (a 40-hour week: 174 hours), in thousandths of a euro: 5,259 € in 2026. */
export const minimumHourly = (y: PayrollYear): number => Math.round((y.minimumWage * 10) / 174)

/** Whether a period has its own rules. Never substitute another year's legislation. */
export function supportsPayrollPeriod(period: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(period) && Object.hasOwn(PAYROLL_YEARS, Number(period.slice(0, 4)))
}

/** The year's figures; an unsupported year must be added and verified before it is calculated. */
export function payrollYear(year: number): PayrollYear {
  const rules = Object.hasOwn(PAYROLL_YEARS, year) ? PAYROLL_YEARS[year] : undefined
  if (!rules) throw new RangeError(`Unsupported payroll year: ${year}`)
  return rules
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

/** The kinds of social insurance whose base the deduction lowers (pension insurance and the reserve fund). */
const PENSION_KINDS: readonly SocialKind[] = ['oldAge', 'disability', 'reserve']

/**
 * The rates of social insurance of a relationship and a pension (the Agency's tables of 2026 and its table of
 * agreements; its notice of 27 April 2022 on the support in short-time work):
 * - a regular income is insured whole; an irregular one and a student's agreement for old age, disability, accident,
 *   guarantee and the reserve fund;
 * - the support in short-time work (0,5 % of the employer's unemployment insurance) is an employment's alone: an
 *   agreement and a director pay the employer's unemployment insurance whole, 1 %, and a director no accident or
 *   guarantee insurance;
 * - old age, early old age and a service pension after the retirement age: no disability insurance; old age, early
 *   old age and a disability above 70 %: no unemployment insurance, while the support stays for an employment;
 * - a pensioner on an agreement is insured for pensions only: no sickness, no unemployment.
 */
export function socialRates(kind: ContractKind, regular: boolean, pension: PensionKind): { employee: Partial<Record<SocialKind, number>>; employer: Partial<Record<SocialKind, number>> } {
  const full = kind !== 'dobps' && regularOf(kind, regular)
  const employee: Partial<Record<SocialKind, number>> = full ? { ...SOCIAL_EMPLOYEE } : { oldAge: 400, disability: 300 }
  const employer: Partial<Record<SocialKind, number>> = full ? { ...SOCIAL_EMPLOYER } : { oldAge: 1400, disability: 300, guarantee: 25, accident: 80, reserve: 475 }
  if (full && kind !== 'employment') {
    delete employer.support
    employer.unemployment = 100
  }
  if (kind === 'director') {
    delete employer.guarantee
    delete employer.accident
  }
  if (pension === 'old' || pension === 'service') for (const side of [employee, employer]) delete side.disability
  if (pension === 'old' || pension === 'invalid70') for (const side of [employee, employer]) delete side.unemployment
  if (isAgreement(kind) && pension !== 'none') for (const side of [employee, employer]) for (const k of ['sickness', 'unemployment', 'support'] as const) delete side[k]
  return { employee, employer }
}

/**
 * Whether the person is an employee for health insurance: not a student on a student's agreement, nor anybody drawing
 * a pension of old age, early old age, disability, or service after the retirement age on another agreement (VšZP).
 */
export const healthInsured = (kind: ContractKind, pension: PensionKind): boolean => !(kind === 'dobps' || ((kind === 'dovp' || kind === 'dopc') && pension !== 'none'))

/** A pensioner is insured by the state as well (§ 11(7) of Act 580/2004), so the minimum advance does not reach the month (VšZP: lowered by the days of the state's insurance). */
export const stateInsured = (pension: PensionKind | undefined): boolean => isPension(pension) && pension !== 'none'

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
  /** Sick pay of the month (náhrada príjmu): taxed, no assessment base. */
  sickPay?: number
  /** The relationship (an employment when left out), whether its income is regular, the pension drawn, the deduction claimed. */
  contract?: ContractKind
  regular?: boolean
  pension?: PensionKind
  exemption?: boolean
  /** The days the minimum health advance counts (the days employed less those of sickness benefit, when the state pays). */
  minimumDays?: number
  /** The annual settlement settled with this month's wage (tax-settlement.ts): the tax owed (minus: refunded), the bonus paid (minus: returned). */
  settlement?: { tax: number; bonus: number }
  /** The month's meals (meals.ts): exempt from tax and insurance; a voucher's part the employee pays off the net, a financial contribution with it. */
  meals?: MealMoney | null
}

export interface Payslip {
  period: string
  /** Present on newly calculated slips; older closed snapshots remain readable without it. */
  rulesYear?: number
  gross: number
  /** Sick pay (taxed, no assessment base); the relationship and its insurance as worked out. Older closed slips have none. */
  sickPay?: number
  contract?: ContractKind
  regular?: boolean
  pension?: PensionKind
  /** The deduction taken off the base of pension insurance and the reserve fund, and that base. */
  exemption?: number
  pensionBase?: number
  healthInsured?: boolean
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
  /** The annual settlement settled with the month (older slips have none): the tax withheld for it (minus: refunded), the bonus paid for it (minus: returned). */
  settlementTax?: number
  settlementBonus?: number
  /** The month's meals (older slips have none). */
  meals?: MealMoney
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

/** The deductible item (§ 16(16)–(18)): prorated for days employed, rounded up to the cent. Defaults to a whole month. */
export function healthDeductible(income: number, days = 1, daysInMonth = 1): number {
  if (income >= 57000) return 0
  const whole = income <= 38000 ? Math.max(0, income) : Math.max(0, 38000 - (income - 38000) * 2)
  return Math.ceil((whole * Math.min(daysInMonth, Math.max(0, days))) / daysInMonth)
}

/** One employee's month. */
export function payslip(input: PayInput): Payslip {
  if (!supportsPayrollPeriod(input.period)) throw new RangeError(`Unsupported payroll period: ${input.period}`)
  const y = payrollYear(Number(input.period.slice(0, 4)))
  const gross = Math.max(0, Math.round(input.gross))
  const sickPay = Math.max(0, Math.round(input.sickPay ?? 0))
  const contract = input.contract ?? 'employment'
  const pension = input.pension ?? 'none'
  const regular = regularOf(contract, input.regular ?? true)
  const rates = socialRates(contract, regular, pension)
  const socialBase = Math.min(gross, socialCap(y))
  const exemption = input.exemption && exemptionAllowed(contract, pension, regular) ? Math.min(socialBase, y.exemption) : 0
  const pensionBase = socialBase - exemption
  const baseOf = (kind: SocialKind) => (kind === 'accident' ? gross : PENSION_KINDS.includes(kind) ? pensionBase : socialBase)
  const employee: Partial<Record<SocialKind, number>> = {}
  const employer: Partial<Record<SocialKind, number>> = {}
  for (const [kind, bp] of Object.entries(rates.employee) as [SocialKind, number][]) employee[kind] = floorCents((baseOf(kind) * bp) / 10000)
  for (const [kind, bp] of Object.entries(rates.employer) as [SocialKind, number][]) employer[kind] = floorCents((baseOf(kind) * bp) / 10000)
  const socialEmployee = Object.values(employee).reduce((s, v) => s + (v ?? 0), 0)
  const socialEmployer = Object.values(employer).reduce((s, v) => s + (v ?? 0), 0)

  const insured = healthInsured(contract, pension)
  const half = input.disabled ? 2 : 1
  const healthDeduction = insured && input.healthDeduction ? healthDeductible(gross, input.days, monthDays(input.period)) : 0
  let healthEmployee = insured ? floorCents(((gross - healthDeduction) * HEALTH.employee) / half / 10000) : 0
  const healthEmployer = insured ? floorCents((gross * HEALTH.employer) / half / 10000) : 0
  // The minimum advance: the employee's and the employer's rate of the subsistence minimum, each rounded down (VšZP:
  // 45,45 € in 2026), by the days employed; what the two fall short of it the employee pays (§ 16a).
  let healthTopUp = 0
  if (insured && !input.healthMinimumExempt && !input.disabled && !stateInsured(pension)) {
    const days = Math.min(monthDays(input.period), Math.max(0, input.minimumDays ?? input.days))
    const whole = floorCents((y.subsistence * HEALTH.employee) / half / 10000) + floorCents((y.subsistence * HEALTH.employer) / half / 10000)
    const minimum = floorCents((whole * days) / monthDays(input.period))
    healthTopUp = Math.max(0, minimum - healthEmployee - healthEmployer)
    healthEmployee += healthTopUp
  }

  const partialBase = gross + sickPay - socialEmployee - healthEmployee
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
  const bonus = roundCents(Math.min(whole, cap))
  // Each child's share rounded, the rounding left over given to the last, so that the children make the bonus.
  const bonusByChild = reduced.map((c) => ({ name: c.name, amount: roundCents(c.amount * scale) }))
  const last = bonusByChild[bonusByChild.length - 1]
  if (last) last.amount += bonus - bonusByChild.reduce((s, c) => s + c.amount, 0)
  const withheld = advance - bonus
  const settlementTax = Math.round(input.settlement?.tax ?? 0)
  const settlementBonus = Math.round(input.settlement?.bonus ?? 0)
  // Meals are no income that is taxed or insured (§ 5(7)(b)): a voucher's part the employee pays comes off the net, a
  // financial contribution is paid with it.
  const meals = input.meals && input.meals.count > 0 ? input.meals : null
  const net = gross + sickPay - socialEmployee - healthEmployee - withheld - settlementTax + settlementBonus - (meals?.employee ?? 0) + (meals?.cash ?? 0)
  return {
    period: input.period,
    rulesYear: y.year,
    gross,
    sickPay,
    contract,
    regular,
    pension,
    exemption,
    pensionBase,
    healthInsured: insured,
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
    ...(input.settlement ? { settlementTax, settlementBonus } : {}),
    ...(meals ? { meals } : {}),
    net,
    employerCost: gross + sickPay + socialEmployer + healthEmployer + (meals?.employer ?? 0),
  }
}

/** What a slip makes taxable: the assessment base and the sick pay (older slips have no sick pay). */
export const taxableOf = (s: Pick<Payslip, 'gross' | 'sickPay'>): number => s.gross + (s.sickPay ?? 0)

/** The sums of a month's payslips: what goes to the Social Insurance Agency, to each health insurer, to the tax office, and to the employees. */
export interface PayrollTotals {
  gross: number
  /** Sick pay of the month, paid by the employer (taxed, no assessment base). */
  sickPay: number
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
    sickPay: slips.reduce((t, s) => t + (s.sickPay ?? 0), 0),
    net: slips.reduce((t, s) => t + s.net, 0),
    social: slips.reduce((t, s) => t + s.socialEmployee + s.socialEmployer, 0),
    health,
    tax: slips.reduce((t, s) => t + s.withheld + (s.settlementTax ?? 0) - (s.settlementBonus ?? 0), 0),
    employerCost: slips.reduce((t, s) => t + s.employerCost, 0),
  }
}
