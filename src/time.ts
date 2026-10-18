// Bratislava's calendar day and clock without Intl in the hot paths (18 October 2026: a large company's pages spent
// a tenth of their time formatting dates). Slovakia keeps Central European Time, and summer time as the EU has it:
// from 01:00 UTC on the last Sunday of March to 01:00 UTC on the last Sunday of October (Directive 2000/84/EC), the
// same rule as `localDaySql` in app/period-schema.ts. Unit checks compare it with Intl across years and changes.

const summers = new Map<number, readonly [number, number]>()

/** The seconds (UTC) summer time begins and ends in a year. */
function summerOf(year: number): readonly [number, number] {
  let range = summers.get(year)
  if (!range) {
    const lastSunday = (month: number) => {
      const last = new Date(Date.UTC(year, month + 1, 0))
      return Date.UTC(year, month, last.getUTCDate() - last.getUTCDay(), 1) / 1000
    }
    range = [lastSunday(2), lastSunday(9)] as const
    summers.set(year, range)
  }
  return range
}

/** Bratislava's offset from UTC at a moment, in seconds: 7 200 in summer, else 3 600. */
export function bratislavaOffset(seconds: number): number {
  const [from, to] = summerOf(new Date(seconds * 1000).getUTCFullYear())
  return seconds >= from && seconds < to ? 7200 : 3600
}

const days = new Map<number, string>()

/** The calendar day in Bratislava of a moment (seconds since 1970), YYYY-MM-DD. */
export function bratislavaDay(seconds: number): string {
  const n = Math.floor((seconds + bratislavaOffset(seconds)) / 86400)
  let day = days.get(n)
  if (day === undefined) {
    day = new Date(n * 86400000).toISOString().slice(0, 10)
    if (days.size > 20000) days.clear()
    days.set(n, day)
  }
  return day
}

/** The time of day in Bratislava, as Slovak writes it: "9:40", "14:05". */
export function bratislavaClock(seconds: number): string {
  const s = (((Math.floor(seconds) + bratislavaOffset(seconds)) % 86400) + 86400) % 86400
  return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}`
}
