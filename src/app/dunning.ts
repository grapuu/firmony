// Reminders and late-payment interest (18 October 2026): an invoice not paid by its due day is reminded to the customer
// by itself (a company's choice), and the interest the law gives on a commercial debt paid late is worked out and
// invoiced with the flat compensation in one click.
//
// What it leans on (read on 18 October 2026):
// - Nariadenie vlády č. 21/2013 Z. z. in its version from 1 January 2015 (static.slov-lex.sk), under § 369 of the
//   Commercial Code: § 1(1) the late interest is the ECB's main refinancing rate valid on the first day of each calendar
//   half-year of the delay, increased by eight percentage points, for that half-year (§ 1(2): or the rate of the first
//   day of the delay plus nine points for all of it, the creditor's choice; the first is worked out here); § 2 the
//   flat compensation for the costs of claiming the debt is 40 € once, whatever the length of the delay (§ 369c).
// - The ECB's main refinancing rate as its decisions set it (ecb.europa.eu, the press release of 10 September 2026:
//   2,65 % from 16 September 2026; euribor-rates.info's table of the changes since 2024). A new decision is one line.
// - The delay begins the day after the due day; interest runs for each day of it to the day of payment (or today),
//   on a year of 365 days, rounded once to the cent.
// - Late interest and the compensation are no supply: not subject to VAT.
// Not worked out here: a consumer's debt (the Civil Code's rate, nariadenie vlády č. 87/1995 Z. z.), interest on part of
// a debt paid in parts, the rate of § 1(2), the income tax's rule that unpaid late interest is taxed when paid.

/** The ECB's main refinancing rate in thousandths of a percent (2 650 is 2,65 %), from the day each decision applied. */
export const MRO_RATES: readonly { from: string; milli: number }[] = [
  { from: '2023-09-20', milli: 4500 },
  { from: '2024-06-12', milli: 4250 },
  { from: '2024-09-18', milli: 3650 },
  { from: '2024-10-23', milli: 3400 },
  { from: '2024-12-18', milli: 3150 },
  { from: '2025-02-05', milli: 2900 },
  { from: '2025-03-12', milli: 2650 },
  { from: '2025-04-23', milli: 2400 },
  { from: '2025-06-11', milli: 2150 },
  { from: '2026-06-17', milli: 2400 },
  { from: '2026-09-16', milli: 2650 },
]

/** Eight percentage points over the ECB's rate (§ 1(1)), in thousandths of a percent. */
export const LATE_MARGIN = 8000

/** The flat compensation for the costs of claiming a debt (§ 2 of NV 21/2013, § 369c of the Commercial Code), in cents. */
export const FLAT_COMPENSATION = 4000

/** When the reminders go, in days after the due day: three at most. */
export const REMIND_AFTER = [3, 14, 30] as const

/** The ECB's rate on a day (the newest decision applied by then), in thousandths of a percent; null before the table. */
export function mroOn(day: string): number | null {
  let found: number | null = null
  for (const r of MRO_RATES) if (r.from <= day) found = r.milli
  return found
}

const DAY = 86_400_000
const at = (day: string) => Date.parse(`${day}T00:00:00Z`)
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10)
const halfStart = (day: string) => `${day.slice(0, 4)}-${Number(day.slice(5, 7)) <= 6 ? '01' : '07'}-01`
const halfEnd = (day: string) => `${day.slice(0, 4)}-${Number(day.slice(5, 7)) <= 6 ? '06-30' : '12-31'}`

export interface LateSegment {
  from: string
  to: string
  days: number
  /** The rate of the half-year with the eight points, in thousandths of a percent. */
  rate: number
}

export interface LateInterest {
  /** The first day of the delay and the last day counted. */
  from: string
  to: string
  days: number
  segments: LateSegment[]
  cents: number
}

/**
 * The late interest on `cents` due on `dueOn` and paid on `until` (or still unpaid then): each calendar half-year of
 * the delay at its own rate; null when there was no delay or a half-year has no rate.
 */
export function lateInterest(cents: number, dueOn: string, until: string): LateInterest | null {
  const from = iso(at(dueOn) + DAY)
  if (until < from || cents <= 0) return null
  const segments: LateSegment[] = []
  let exact = 0
  for (let start = from, i = 0; start <= until && i < 200; i++) {
    const end = halfEnd(start) < until ? halfEnd(start) : until
    const mro = mroOn(halfStart(start))
    if (mro === null) return null
    const rate = mro + LATE_MARGIN
    const days = Math.round((at(end) - at(start)) / DAY) + 1
    segments.push({ from: start, to: end, days, rate })
    exact += (cents * rate * days) / (100_000 * 365)
    start = iso(at(end) + DAY)
  }
  const days = segments.reduce((sum, s) => sum + s.days, 0)
  return { from, to: until, days, segments, cents: Math.round(exact) }
}

/** The reminder due on `today` for an invoice that is overdue: its step (0, 1, 2), or null when none is due yet. */
export function reminderDue(dueOn: string, sent: number, today: string, lastRemindedOn: string | null): number | null {
  if (sent >= REMIND_AFTER.length) return null
  const after = REMIND_AFTER[sent] ?? 0
  if (iso(at(dueOn) + after * DAY) > today) return null
  // A reminder of the last five days (one sent by hand too) is enough for now.
  if (lastRemindedOn && iso(at(lastRemindedOn) + 5 * DAY) > today) return null
  return sent
}

/** A rate as Slovak writes it: 10,65 %. */
export const ratePercent = (milli: number): string => `${(milli / 1000).toFixed(2).replace('.', ',')} %`
