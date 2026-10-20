// The registration for VAT that a company owes once its turnover crosses the thresholds (20 October 2026, his word: "poďme
// urobiť ešte nejaké povinnosti, čo určite existujú"). Read that day in Act No. 222/2004 Z. z. as in force from
// 1 January 2026 (zakonypreludi.sk, the version of 1 January to 31 December 2026):
// - § 4(1)(a): a taxable person with its seat in Slovakia whose turnover in a calendar year exceeded 50 000 € is a payer
//   from the first day of the next calendar year; § 4(1)(b): whose supply makes the turnover of the running calendar year
//   exceed 62 500 € is a payer by that supply.
// - § 4(2): it applies to the tax office for the registration within five working days of the day the turnover was
//   exceeded (under (b) only when no application was owed under (a) already).
// - § 4(15): the turnover is the value without tax of goods and services supplied in Slovakia, without supplies exempt
//   under § 28 to § 36 and § 40 to § 42, insurance and financial services supplied as ancillary to another supply, and
//   tangible (other than stock) or intangible property supplied occasionally.
// What the app knows of it is what the company issued with us: its invoices and its takings, credit notes taking back.
// Supplies whose place is not in Slovakia (a service to a business abroad, outside the Union, the one-stop shop, the
// middle of a triangular trade) are left out; goods sent abroad stay in (their place is in Slovakia, § 13(1)(a), and
// § 43 and § 47 are not among the exemptions left out). Turnover before our contract started is not known to us.
import { addDays } from './ending'
import { isWorkingDay } from './vat'

/** The thresholds of § 4(1), in cents, and where the screen starts to warn. */
export const VAT_REGISTRATION = { year: 5_000_000, now: 6_250_000, near: 4_000_000 } as const

/** The day five working days after `day` (the period of § 4(2) begins the day after, § 27 of the Tax Procedure Code). */
export function workingDaysAfter(day: string, n: number): string {
  let d = day
  for (let left = n; left > 0; ) {
    d = addDays(d, 1)
    if (isWorkingDay(d)) left--
  }
  return d
}

export interface Supply {
  day: string
  cents: number
}

export interface RegistrationWatch {
  year: number
  /** The year's turnover so far, in cents. */
  sum: number
  /** The day the turnover first exceeded 50 000 €, the last day to apply, and the day the company is a payer from. */
  crossed: { on: string; due: string; payerFrom: string } | null
  /** The supply that made it exceed 62 500 €: the company is a payer by it (§ 4(1)(b)). */
  now: string | null
}

/** A calendar year's turnover, day by day, and the days it crossed the thresholds. */
export function registrationWatch(supplies: readonly Supply[], year: number): RegistrationWatch {
  const days = new Map<string, number>()
  for (const s of supplies) if (s.day.startsWith(`${year}-`)) days.set(s.day, (days.get(s.day) ?? 0) + s.cents)
  let sum = 0
  let crossed: RegistrationWatch['crossed'] = null
  let now: string | null = null
  for (const day of [...days.keys()].sort()) {
    sum += days.get(day) ?? 0
    if (!crossed && sum > VAT_REGISTRATION.year) crossed = { on: day, due: workingDaysAfter(day, 5), payerFrom: `${year + 1}-01-01` }
    if (!now && sum > VAT_REGISTRATION.now) now = day
  }
  if (crossed && now) crossed = { ...crossed, payerFrom: now }
  return { year, sum, crossed, now }
}
