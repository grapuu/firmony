// The social fund (18 October 2026): the mandatory allocation each employer makes from its employees' wages. Read on
// static.slov-lex.sk (by WebFetch, 18 October 2026), Act No. 152/1994 Z. z. in its version of 1 January 2025, the
// latest the register shows:
// - § 2(2): an employer is a legal or natural person in Slovakia that employs an employee in employment or a similar
//   relationship; § 3(1)(a): the fund is made of the mandatory allocation of 0,6 % to 1 % of the base of § 4(1);
//   § 3(2): an employer that made a profit as § 3(2) says may allocate up to 1 %, any other 0,6 %; § 3(1)(b): a further
//   allocation by a collective agreement or an internal rule (up to 0,5 %) and for travel to work, not built here.
// - § 4(1): the base is the sum of the gross wages (footnote 3: § 118(2) of the Labour Code) accounted to employees for
//   payment for the calendar year; § 6(1)(b): kept on an analytic account of the fund or on its own account; § 6(2):
//   created at the latest on the day agreed for paying the wages; § 6(3): settled for the year by 31 January.
// - What a wage is (podnikajte.sk, "Sociálny fond", 25 September 2023; Mzdové centrum, 16 September 2019): no wage
//   compensation (holiday, obstacles), no sick pay, no reward of an agreement, no remuneration of a statutory body.
//   So the base is a line's earned wage (`MonthPay.earned`: the wage for the time worked, overtime, surcharges, bonuses
//   and other wage) of an employment alone.
// Said plainly: each line of an employment gets its allocation, rounded to the cent; the books take the month's sum on
// 527 against 472 (the month's payroll entry); the fund pays meals (meals.ts) and whatever else the company's rules say,
// booked by the accountant. Not built: the further allocation, a profit's allocation (§ 4(3)), the transfer to an own
// account within five days of the payday when the company keeps one, the yearly settlement beyond the months' sums.

/** The least and the most of the mandatory allocation, in hundredths of a per cent. */
export const FUND_RATE_MIN = 60
export const FUND_RATE_MAX = 100

export const isFundRate = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= FUND_RATE_MIN && (v as number) <= FUND_RATE_MAX

/** A line's allocation: of an employment's earned wage at the rate, rounded to the cent; nothing for anything else. */
export function fundOf(contract: string, earned: number, rate: number): number {
  if (contract !== 'employment' || earned <= 0) return 0
  return Math.round((earned * (isFundRate(rate) ? rate : FUND_RATE_MIN)) / 10_000)
}
