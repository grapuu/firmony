// Meals of employees (18 October 2026): what the Labour Code asks of an employer and what follows for the payslip and
// the books. Read in the original on static.slov-lex.sk (through the browser pane, 18 October 2026), the version of
// 1 January 2026:
// - Act No. 311/2001 Z. z. § 152: meals for every employee whose shift is longer than four hours (2); the employer
//   pays at least 55 % of the meal's price, at most 55 % of the meal allowance of a trip of 5 to 12 hours, the
//   contribution rounded up to the cent (3); a meal voucher is the meal's price and worth at least 75 % of that
//   allowance, electronic (4); the employee chooses between vouchers and the financial contribution for 12 months when
//   the employer has no canteen (7); the financial contribution is what the employer pays towards others' meals, at
//   least 55 % of the least voucher, and without vouchers at most 55 % of the allowance (8); the social fund adds its
//   own contribution (3, 8).
// - Act No. 595/2003 Z. z. § 5(7)(b): the value of meals provided under § 152 and the financial contribution are
//   exempt from tax, so they are in no assessment base either; § 19(2)(c)(5): the contributions are the employer's tax
//   expense under those conditions.
// The allowance of 5 to 12 hours is the trips' (trips.ts, `mealRatesOn`): 9,30 € from 1 December 2025, so a voucher
// is worth at least 6,98 €, the employer pays at least 55 % of it and at most 5,12 € a meal, and the financial
// contribution is at least 3,84 €.
//
// What follows, said plainly:
// - Vouchers: the employer's contribution (527) and the social fund's (472) of each meal, the rest of the voucher's
//   value the employee pays, taken off the net wage; the vouchers leave the company's stock of them (213).
// - The financial contribution: the employer's contribution (527) and the social fund's (472) paid with the wage (331).
// - A meal a day the employee worked more than four hours: proposed from the hours worked of an employment (the hours
//   of the working day above four), else typed by the accountant.
// - The employee's choice (§ 152(7)) is kept on him (`employees.meal_way`): vouchers, the financial contribution, none
//   (he eats elsewhere, or a canteen of the company), or the company's way. Vouchers are taken only when the company has
//   a voucher's value; otherwise the financial contribution.
// - Not built: a canteen of the company's own or a meal bought from another (booked as documents), the social fund's
//   own creation (Act No. 152/1994 Z. z.: at least 0,6 % of the gross wages, 527 against 472, an internal document for
//   now), meals of agreements (the employer may, the law asks it of employees), a day of a business trip that has its
//   meal allowance (the accountant types the count), vouchers bought (the supplier's invoice to 213 with the booking
//   form's own account, its fee to 518).
import { mealRatesOn } from './trips'

export type MealWay = 'voucher' | 'cash'
export const isMealWay = (v: unknown): v is MealWay => v === 'voucher' || v === 'cash'

/** How the company provides meals (none: it does not, or a canteen of its own, booked as documents). */
export interface MealSettings {
  /** The way of those who chose nothing. */
  way: MealWay | null
  /** A voucher's value, the employer's contribution and the social fund's of each meal, in cents. */
  voucher: number
  employer: number
  fund: number
}

export const NO_MEALS: MealSettings = { way: null, voucher: 0, employer: 0, fund: 0 }

/** The law's bounds on a day: the least voucher, the least financial contribution, the most the employer pays a meal. */
export function mealBounds(day: string): { voucherMin: number; cashMin: number; employerMax: number } | null {
  const allowance = mealRatesOn(day)?.[0]
  if (!allowance) return null
  const voucherMin = Math.ceil((allowance * 75) / 100)
  return { voucherMin, cashMin: Math.ceil((voucherMin * 55) / 100), employerMax: Math.ceil((allowance * 55) / 100) }
}

/** The least the employer pays towards a voucher of a value: 55 % of it, rounded up to the cent (§ 152(3)). */
export const employerMin = (voucher: number): number => Math.ceil((voucher * 55) / 100)

export type MealIssue = 'voucher' | 'employerLow' | 'employerHigh' | 'fund' | 'cashLow'

/**
 * What is wrong with a company's meal settings on a day (empty: as the law asks). The vouchers' rules hold when the
 * company gives vouchers or has a voucher's value for those who chose them; the financial contribution is the
 * employer's contribution (§ 152(8)), so the same figure is checked against its least.
 */
export function mealIssues(s: MealSettings, day: string): MealIssue[] {
  if (s.way === null) return []
  const b = mealBounds(day)
  if (!b) return []
  const issues: MealIssue[] = []
  if (s.way === 'voucher' || s.voucher > 0) {
    if (s.voucher < b.voucherMin) issues.push('voucher')
    if (s.employer < employerMin(s.voucher)) issues.push('employerLow')
    if (s.employer + s.fund > s.voucher) issues.push('fund')
  }
  if (s.way === 'cash' && s.employer < b.cashMin) issues.push('cashLow')
  if (s.employer > b.employerMax) issues.push('employerHigh')
  return issues
}

/** The way an employee takes meals: his own choice, else the company's; vouchers only when the company has a voucher's value. */
export function mealWayOf(own: MealWay | 'none' | null | undefined, s: MealSettings | null): MealWay | null {
  if (!s || s.way === null || own === 'none') return null
  const way = own ?? s.way
  return way === 'voucher' && s.voucher <= 0 ? 'cash' : way
}

/** The meals proposed for an employee's month: a meal a day of more than four hours worked (an employment only). */
export function mealsProposed(contract: string, dailyHours: number, workedHours: number): number {
  if (contract !== 'employment' || dailyHours <= 400 || workedHours <= 0) return 0
  return Math.floor(workedHours / dailyHours)
}

/** A month's meals in money: the employer's and the social fund's parts, what the employee pays, what is paid with the wage. */
export interface MealMoney {
  way: MealWay
  count: number
  employer: number
  fund: number
  /** Vouchers: the employee's part, taken off the net wage. */
  employee: number
  /** The financial contribution: paid with the wage. */
  cash: number
}

export function mealMoney(way: MealWay, count: number, s: MealSettings): MealMoney {
  const n = Math.max(0, Math.floor(count))
  const employer = n * s.employer
  const fund = n * s.fund
  if (way === 'cash') return { way, count: n, employer, fund, employee: 0, cash: employer + fund }
  return { way, count: n, employer, fund, employee: n * Math.max(0, s.voucher - s.employer - s.fund), cash: 0 }
}
