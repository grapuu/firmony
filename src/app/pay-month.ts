// A month's pay of one person, from what the accountant types for it (the parts) and what the app knows (the terms of
// the employment, the sick leaves, the months closed before): the wage for the time worked, holiday pay and paid
// obstacles at the average earnings, overtime and the surcharges, a bonus, and sick pay. Pure; payroll.ts then works the
// insurances and the tax out of the result. Every rule is checked in test/units.test.mjs.
//
// What each rule leans on (read on 17 October 2026):
// - The Labour Code (Act No. 311/2001 Z. z.): a monthly wage is not lowered for a public holiday on a working day
//   (§ 122(3)), an hourly-paid employee gets the average earnings for it; holiday pay is the average earnings for each
//   hour of holiday (§ 118(2), § 144); the average earnings are the wage of the calendar quarter before divided by the
//   hours worked in it, or the probable earnings when fewer than 21 days were worked (§ 134); overtime at least 25 % of
//   the average earnings on top of the wage (§ 121(1)); night work 40 % of the minimum wage for an hour (§ 123(1));
//   Saturday 50 % (§ 122a), Sunday 100 % (§ 122b) of it; work on a public holiday 100 % of the average earnings
//   (§ 122(1)). These are the law's least; a higher rate agreed is typed as a bonus. An agreement outside employment
//   gets the surcharges for night, weekend and public holiday work (§ 223(2)), no holiday and no overtime; a director's
//   remuneration none of them.
// - Sick pay (Act No. 462/2003 Z. z. as of 1 January 2026, on slov-lex): § 7(2) calendar days from the first day to the
//   fourteenth (the tenth for an incapacity that began in 2025, by the rules then: employerSickDays), § 8(1) 25 % of
//   the daily assessment base for days 1 to 3 and 55 % for days 4 to 14, § 8(4) the decisive
//   period (with fewer than 90 days of insurance: from its start to the day before the incapacity, else that of the Act
//   on Social Insurance, § 54: the calendar year before, or from the start of the insurance to the end of that year or of
//   the month before), § 8(5) the base is the sickness insurance bases of the period divided by its days, § 8(7) at most
//   the day's share of twice the general assessment base of two years before, § 8(8) rounded down to four decimals,
//   § 10 the sum rounded up to the cent. From the fifteenth day the Agency pays sickness benefit and the state pays the
//   person's health insurance (the minimum advance counts those days out).
// - The days of the decisive period leave out the days of incapacity (the excluded period of § 55 of Act No. 461/2003).
// - The average earnings are kept to four decimals, rounded up; a month's amounts are rounded to the cent.
import { isWorkingDay } from './vat'
import { isAgreement, minimumHourly, monthDays, payrollYear, regularOf, socialRates, type ContractKind } from './payroll'

export type WageKind = 'monthly' | 'hourly'

/** What the accountant types for a person's month; hours and days in hundredths, money in cents, the average earnings in ten-thousandths of a euro. */
export interface MonthParts {
  /** The month's wage before absences (a monthly wage), or the reward (an agreement, a director); null: as agreed. An hourly rate is never typed here. */
  wage: number | null
  /** Hours worked (an hourly wage, an agreement); null: worked out from the working days. */
  hours: number | null
  holidayDays: number
  /** Obstacles at work paid at the average earnings (a doctor's visit and the like). */
  obstacleHours: number
  /** Unpaid leave and unexcused absence. */
  unpaidDays: number
  overtimeHours: number
  nightHours: number
  saturdayHours: number
  sundayHours: number
  holidayWorkHours: number
  bonus: number
  /** Any other income that is wage (assessment base and taxed). */
  other: number
  /** The average hourly earnings when the accountant sets them; null: proposed. */
  average: number | null
  /** The meals of the month (meals.ts) when the accountant sets them; null: proposed from the hours worked. */
  meals?: number | null
}

export const EMPTY_PARTS: MonthParts = {
  wage: null,
  hours: null,
  holidayDays: 0,
  obstacleHours: 0,
  unpaidDays: 0,
  overtimeHours: 0,
  nightHours: 0,
  saturdayHours: 0,
  sundayHours: 0,
  holidayWorkHours: 0,
  bonus: 0,
  other: 0,
  average: null,
}

/** Parts read back from storage: anything missing or wrong is nought (or null where null means "as agreed"). */
export function partsOf(raw: unknown): MonthParts {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const whole = (v: unknown, max: number) => (Number.isSafeInteger(v) && (v as number) >= 0 && (v as number) <= max ? (v as number) : 0)
  const maybe = (v: unknown, max: number) => (v === null || v === undefined ? null : Number.isSafeInteger(v) && (v as number) >= 0 && (v as number) <= max ? (v as number) : null)
  return {
    wage: maybe(o.wage, 99_999_999_99),
    hours: maybe(o.hours, 744_00),
    holidayDays: whole(o.holidayDays, 31_00),
    obstacleHours: whole(o.obstacleHours, 744_00),
    unpaidDays: whole(o.unpaidDays, 31_00),
    overtimeHours: whole(o.overtimeHours, 744_00),
    nightHours: whole(o.nightHours, 744_00),
    saturdayHours: whole(o.saturdayHours, 744_00),
    sundayHours: whole(o.sundayHours, 744_00),
    holidayWorkHours: whole(o.holidayWorkHours, 744_00),
    bonus: whole(o.bonus, 99_999_999_99),
    other: whole(o.other, 99_999_999_99),
    average: maybe(o.average, 10_000_0000),
    meals: maybe(o.meals, 62),
  }
}

/** The terms of a person's work a month needs. */
export interface WorkTerms {
  contract: ContractKind
  regular: boolean
  wageKind: WageKind
  /** The monthly wage or reward, or the hourly rate, in cents. */
  wage: number
  /** The hours of a working day, in hundredths (a 40-hour week: 800). */
  dailyHours: number
  startedOn: string
  endedOn: string | null
}

/** A sick leave (dočasná pracovná neschopnosť): its first and last day (null: it lasts), and the daily base when the accountant typed it, in ten-thousandths of a euro. */
export interface SickLeave {
  id: string
  employeeId: string
  from: string
  to: string | null
  dvz: number | null
}

// ---------------------------------------------------------------------------------------------------------------
// Days
// ---------------------------------------------------------------------------------------------------------------

const DAY = 86_400_000
const ms = (day: string) => Date.parse(`${day}T12:00:00Z`)
const iso = (t: number) => new Date(t).toISOString().slice(0, 10)
export const addDay = (day: string, n: number): string => iso(ms(day) + n * DAY)
/** Days from one day to another, the first counted, the last not: 1 March to 3 March is 2. */
export const daysBetween = (from: string, to: string): number => Math.round((ms(to) - ms(from)) / DAY)
const isWeekday = (day: string) => {
  const w = new Date(ms(day)).getUTCDay()
  return w !== 0 && w !== 6
}
const monthStart = (period: string) => `${period}-01`
const monthEnd = (period: string) => `${period}-${String(monthDays(period)).padStart(2, '0')}`

/** The days of [from, to] that fall within a month and an employment; null when none do. */
function clip(period: string, from: string, to: string | null, startedOn: string, endedOn: string | null): { from: string; to: string } | null {
  const a = [from, monthStart(period), startedOn].reduce((m, d) => (d > m ? d : m))
  const b = [to ?? monthEnd(period), monthEnd(period), endedOn ?? monthEnd(period)].reduce((m, d) => (d < m ? d : m))
  return a <= b ? { from: a, to: b } : null
}

function eachDay(from: string, to: string, f: (day: string) => void) {
  for (let d = from; d <= to; d = addDay(d, 1)) f(d)
}

/** A month's calendar for a person: its weekdays, those of the employment, and of them the working days (not a public holiday). */
export interface MonthCalendar {
  weekdays: number
  employedWeekdays: number
  employedWorkdays: number
  /** The employment's days of the month, or null when it did not last any. */
  range: { from: string; to: string } | null
}

export function monthCalendar(period: string, startedOn: string, endedOn: string | null): MonthCalendar {
  let weekdays = 0
  eachDay(monthStart(period), monthEnd(period), (d) => (weekdays += isWeekday(d) ? 1 : 0))
  const range = clip(period, monthStart(period), null, startedOn, endedOn)
  let employedWeekdays = 0
  let employedWorkdays = 0
  if (range)
    eachDay(range.from, range.to, (d) => {
      if (!isWeekday(d)) return
      employedWeekdays++
      if (isWorkingDay(d)) employedWorkdays++
    })
  return { weekdays, employedWeekdays, employedWorkdays, range }
}

// ---------------------------------------------------------------------------------------------------------------
// Sick pay
// ---------------------------------------------------------------------------------------------------------------

/**
 * The general assessment base (a month of it, in cents) of two years before, for an incapacity that began before the
 * years payroll.ts knows: 2023 1 430 € and 2022 1 304 € (the Agency's notices; the caps 94,0274 € and 85,5082 € a day).
 */
const EARLIER_BASES: Readonly<Record<number, number>> = { 2024: 130400, 2025: 143000 }

/** The most a daily base may be in the year the incapacity began: the day's share of twice the general assessment base of two years before, in ten-thousandths rounded up (null for a year nothing is known of; podnikajte.sk's tables of the maximum benefits of 2025 and 2027). */
export function dailyBaseCap(year: number): number | null {
  const base = Object.hasOwn(EARLIER_BASES, year) ? EARLIER_BASES[year]! : year >= 2026 ? payrollYear(year).averageWage : null
  if (base === null) return null
  const days = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 366 : 365
  // Up to four decimals, as the published caps are: 94,0274 € for 2025 (94,027397...), 100,2083 € for 2026 (100,208219...).
  return Math.ceil((2 * base * 12 * 100) / days)
}

/**
 * The days of an incapacity the employer pays (§ 7(2) of Act No. 462/2003): fourteen since 1 January 2026, ten for one
 * that began before it, by the rules then in force to its end (pravnenoviny.sk, 21 October 2025: "Ak ePN vznikne ešte v
 * roku 2025, platia pôvodné pravidlá"; a leave from 31 December 2025 is the employer's to 9 January 2026).
 */
export const employerSickDays = (from: string): number => (from < '2026-01-01' ? 10 : 14)

export interface SickPayPart {
  leaveId: string
  from: string
  to: string
  /** Days paid at 25 % and at 55 %, the daily base used, the sum. */
  days25: number
  days55: number
  dvz: number | null
  amount: number
}

export interface SickMonth {
  /** Calendar days of incapacity within the month and the employment; of them weekdays and working days. */
  days: number
  weekdays: number
  workdays: number
  /** Days from the fifteenth of a leave on: sickness benefit, paid by the Agency. */
  benefitDays: number
  parts: SickPayPart[]
  amount: number
  /** Leaves whose sick pay needs a daily base nobody has given and none could be proposed. */
  missing: string[]
}

/**
 * The sick leaves of a person in a month: the days, and the sick pay of each leave's first fourteen days at its daily
 * base (the one typed, else the one proposed by `dvzOf`), capped and rounded up to the cent.
 */
export function sickMonth(period: string, leaves: readonly SickLeave[], startedOn: string, endedOn: string | null, dvzOf: (leave: SickLeave) => number | null = (l) => l.dvz): SickMonth {
  const out: SickMonth = { days: 0, weekdays: 0, workdays: 0, benefitDays: 0, parts: [], amount: 0, missing: [] }
  for (const leave of [...leaves].sort((a, b) => (a.from < b.from ? -1 : 1))) {
    const range = clip(period, leave.from, leave.to, startedOn, endedOn)
    if (!range) continue
    let days25 = 0
    let days55 = 0
    eachDay(range.from, range.to, (d) => {
      out.days++
      if (isWeekday(d)) out.weekdays++
      if (isWorkingDay(d)) out.workdays++
      const index = daysBetween(leave.from, d) + 1
      if (index <= 3) days25++
      else if (index <= employerSickDays(leave.from)) days55++
      else out.benefitDays++
    })
    if (days25 + days55 === 0) continue
    const typed = dvzOf(leave)
    const cap = dailyBaseCap(Number(leave.from.slice(0, 4)))
    const dvz = typed === null || cap === null ? null : Math.min(typed, cap)
    const amount = dvz === null ? 0 : Math.ceil((dvz * (25 * days25 + 55 * days55)) / 10000)
    if (dvz === null) out.missing.push(leave.id)
    out.parts.push({ leaveId: leave.id, from: range.from, to: range.to, days25, days55, dvz, amount })
    out.amount += amount
  }
  return out
}

/** A closed month of a person, as far as the decisive periods ask: its sickness insurance base, its hours worked, what it earned, and its days of incapacity. */
export interface ClosedMonth {
  period: string
  sicknessBase: number
  earned: number
  worked: number
  sickDays: number
}

export type DvzProposal = { dvz: number; from: string; to: string; days: number; sum: number } | { dvz: null; reason: 'short' | 'missing' | 'none'; month?: string }

/**
 * The daily base proposed for a sick leave from the months closed in the app: the decisive period of § 8(4) of Act No.
 * 462/2003 (with fewer than 90 days of insurance the days before the incapacity, which reach into a month still open, so
 * the accountant gives it), else of § 54 of Act No. 461/2003; every month of it must be closed here (a month before us
 * is the accountant's to give), its days less the days of incapacity.
 */
export function proposeDvz(leave: Pick<SickLeave, 'from'>, startedOn: string, closed: readonly ClosedMonth[]): DvzProposal {
  if (leave.from <= startedOn) return { dvz: null, reason: 'none' }
  if (daysBetween(startedOn, leave.from) < 90) return { dvz: null, reason: 'short' }
  const year = Number(leave.from.slice(0, 4))
  const prevStart = `${year - 1}-01-01`
  const prevEnd = `${year - 1}-12-31`
  let from: string
  let to: string
  if (startedOn <= prevStart) [from, to] = [prevStart, prevEnd]
  else if (startedOn <= prevEnd) [from, to] = [startedOn, prevEnd]
  else {
    from = startedOn
    to = addDay(monthStart(leave.from.slice(0, 7)), -1)
    if (to < from) return { dvz: null, reason: 'short' }
  }
  const byPeriod = new Map(closed.map((m) => [m.period, m]))
  let sum = 0
  let excluded = 0
  for (let m = from.slice(0, 7); m <= to.slice(0, 7); m = nextPeriod(m)) {
    const month = byPeriod.get(m)
    if (!month) return { dvz: null, reason: 'missing', month: m }
    sum += month.sicknessBase
    excluded += month.sickDays
  }
  const days = daysBetween(from, to) + 1 - excluded
  if (days <= 0 || sum <= 0) return { dvz: null, reason: 'none' }
  const cap = dailyBaseCap(year)
  if (cap === null) return { dvz: null, reason: 'none' }
  return { dvz: Math.min(Math.floor((sum * 100) / days), cap), from, to, days, sum }
}

const nextPeriod = (p: string) => (p.slice(5) === '12' ? `${Number(p.slice(0, 4)) + 1}-01` : `${p.slice(0, 4)}-${String(Number(p.slice(5)) + 1).padStart(2, '0')}`)
const prevPeriod = (p: string) => (p.slice(5) === '01' ? `${Number(p.slice(0, 4)) - 1}-12` : `${p.slice(0, 4)}-${String(Number(p.slice(5)) - 1).padStart(2, '0')}`)

// ---------------------------------------------------------------------------------------------------------------
// Average earnings
// ---------------------------------------------------------------------------------------------------------------

export interface AverageProposal {
  /** In ten-thousandths of a euro an hour. */
  average: number
  /** From the quarter before (its months), or the probable earnings. */
  source: 'quarter' | 'probable'
  months: string[]
}

/** The months of the calendar quarter before a month's. */
export function quarterBefore(period: string): string[] {
  const m = Number(period.slice(5))
  const firstOfQuarter = `${period.slice(0, 4)}-${String(m - ((m - 1) % 3)).padStart(2, '0')}`
  const last = prevPeriod(firstOfQuarter)
  return [prevPeriod(prevPeriod(last)), prevPeriod(last), last]
}

/** The average hourly earnings of § 134 of the Labour Code: the quarter before when 21 days were worked in it, else the probable earnings; never below the minimum wage for an hour. */
export function proposeAverage(period: string, terms: WorkTerms, closed: readonly ClosedMonth[]): AverageProposal {
  const y = payrollYear(Number(period.slice(0, 4)))
  const floor = minimumHourly(y) * 10
  const months = quarterBefore(period)
  const quarter = closed.filter((m) => months.includes(m.period))
  const earned = quarter.reduce((s, m) => s + m.earned, 0)
  const worked = quarter.reduce((s, m) => s + m.worked, 0)
  const daily = Math.max(1, terms.dailyHours)
  if (worked >= 21 * daily && earned > 0) return { average: Math.max(floor, Math.ceil((earned * 10000) / worked)), source: 'quarter', months: quarter.map((m) => m.period) }
  const cal = monthCalendar(period, `${period}-01`, null)
  const probable = terms.wageKind === 'hourly' ? terms.wage * 100 : Math.ceil((terms.wage * 10000) / Math.max(1, cal.weekdays * daily))
  return { average: Math.max(floor, probable), source: 'probable', months: [] }
}

// ---------------------------------------------------------------------------------------------------------------
// The month's pay
// ---------------------------------------------------------------------------------------------------------------

export interface MonthPay {
  /** The wage for the time worked (or the reward). */
  wage: number
  /** Holiday pay, and an hourly-paid person's public holidays, at the average earnings. */
  holiday: number
  publicHolidays: number
  obstacle: number
  /** Overtime: its wage and its surcharge. */
  overtime: number
  /** Night, Saturday, Sunday and public holiday work. */
  surcharges: number
  bonus: number
  other: number
  /** Sick pay (not part of the assessment base). */
  sick: number
  /** The assessment base: everything but the sick pay. */
  gross: number
  /** What counts towards the next average earnings: the wage, overtime, surcharges, bonus and other wage. */
  earned: number
  /** Hours worked, in hundredths. */
  worked: number
  /** Hours paid, worked or not (holiday, obstacles, public holidays), as the Agency's monthly report counts them; hundredths. */
  paid: number
  /** The average hourly earnings used, in ten-thousandths. */
  average: number
  /** The working days of the month, of the employment, absent (hundredths of days). */
  weekdays: number
  employedWeekdays: number
  absentDays: number
  /** What keeps the month back: absences longer than the working time; a sick leave without a daily base. */
  issues: ('absence' | 'sickBase')[]
}

const money = (v: number) => Math.round(v)

/**
 * A person's month: the parts typed, the calendar, the sick leaves of the month, the average earnings. A monthly wage is
 * paid for the weekdays of the employment less the absences, in the share of all the month's weekdays (a public holiday
 * lowers nothing); an hourly wage for the hours worked; an agreement's reward or a director's remuneration as typed.
 */
export function monthPay(period: string, terms: WorkTerms, parts: MonthParts, sick: SickMonth, average: number): MonthPay {
  const y = payrollYear(Number(period.slice(0, 4)))
  const minH = minimumHourly(y) / 1000 // euros an hour
  const pz = average / 10000 // euros an hour
  const cal = monthCalendar(period, terms.startedOn, terms.endedOn)
  const daily = Math.max(1, terms.dailyHours) / 100 // hours a day
  const kind = terms.contract
  const employment = kind === 'employment'
  const agreement = isAgreement(kind)
  const issues: MonthPay['issues'] = []
  if (sick.missing.length > 0) issues.push('sickBase')

  const holidayDays = employment ? parts.holidayDays / 100 : 0
  const unpaidDays = employment ? parts.unpaidDays / 100 : 0
  const obstacleHours = employment ? parts.obstacleHours / 100 : 0
  const overtimeHours = employment ? parts.overtimeHours / 100 : 0
  const absentHours = (holidayDays + unpaidDays + sick.weekdays) * daily + obstacleHours
  const workdayAbsence = (holidayDays + unpaidDays + sick.workdays) * daily + obstacleHours
  if (employment && workdayAbsence > cal.employedWorkdays * daily + 1e-9) issues.push('absence')

  let wage = 0
  let worked = 0
  let paid = 0
  let publicHolidays = 0
  let hourlyBase = 0
  if (employment && terms.wageKind === 'monthly') {
    const base = parts.wage ?? terms.wage
    const fund = cal.weekdays * daily
    wage = money((base * Math.max(0, cal.employedWeekdays * daily - absentHours)) / fund)
    hourlyBase = base / 100 / fund
    worked = Math.max(0, cal.employedWorkdays * daily - workdayAbsence)
    paid = Math.max(0, (cal.employedWeekdays - unpaidDays - sick.weekdays) * daily)
  } else if (employment) {
    const rate = terms.wage / 100
    const hours = parts.hours === null ? Math.max(0, cal.employedWorkdays * daily - workdayAbsence) : parts.hours / 100
    wage = money(rate * hours * 100)
    hourlyBase = rate
    worked = hours
    const holidaysOff = cal.employedWeekdays - cal.employedWorkdays - (sick.weekdays - sick.workdays)
    publicHolidays = money(Math.max(0, holidaysOff) * daily * pz * 100)
    paid = hours + holidayDays * daily + obstacleHours + Math.max(0, holidaysOff) * daily
  } else if (agreement && terms.wageKind === 'hourly') {
    const hours = (parts.hours ?? 0) / 100
    wage = money((terms.wage / 100) * hours * 100)
    worked = hours
    paid = hours
  } else {
    wage = cal.range ? (parts.wage ?? terms.wage) : 0
    worked = agreement ? (parts.hours ?? 0) / 100 : 0
    paid = worked
  }

  const holiday = money(holidayDays * daily * pz * 100)
  const obstacle = money(obstacleHours * pz * 100)
  const overtime = employment ? money(overtimeHours * hourlyBase * 100 + overtimeHours * pz * 0.25 * 100) : 0
  const surchargeable = employment || agreement
  const surcharges = surchargeable
    ? money(((parts.nightHours / 100) * minH * 0.4 + (parts.saturdayHours / 100) * minH * 0.5 + (parts.sundayHours / 100) * minH + (parts.holidayWorkHours / 100) * pz) * 100)
    : 0
  const bonus = parts.bonus
  const other = parts.other
  const gross = wage + holiday + publicHolidays + obstacle + overtime + surcharges + bonus + other
  return {
    wage,
    holiday,
    publicHolidays,
    obstacle,
    overtime,
    surcharges,
    bonus,
    other,
    sick: sick.amount,
    gross,
    earned: wage + overtime + surcharges + bonus + other,
    worked: Math.round((worked + overtimeHours) * 100),
    paid: Math.round((paid + overtimeHours) * 100),
    average,
    weekdays: cal.weekdays,
    employedWeekdays: cal.employedWeekdays,
    absentDays: Math.round((holidayDays + unpaidDays + sick.weekdays) * 100),
    issues,
  }
}

/** Whether a person's month counts towards sickness insurance (the base the daily base of sick pay is made of). */
export const sicknessInsured = (kind: ContractKind, regular: boolean, pension: Parameters<typeof socialRates>[2]): boolean =>
  socialRates(kind, regularOf(kind, regular), pension).employee.sickness !== undefined

/** The days of holiday a year by the Labour Code's least (§ 103(1)): 20, or 25 from the year the person turns 33. */
export function leaveEntitlement(bornOn: string | null, year: number): number {
  if (!bornOn) return 2000
  return year - Number(bornOn.slice(0, 4)) >= 33 ? 2500 : 2000
}
