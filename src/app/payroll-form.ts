// The payroll page's forms read and written back: a person's month parts (hours and days in hundredths, money in
// cents, the average earnings in ten-thousandths of a euro), and the figures as they are typed ("7,5", "1500,00",
// "9,1234"). Nothing here computes pay; pay-month.ts does.
import { centsOf } from './invoices'
import { isAgreement, type ContractKind } from './payroll'
import { EMPTY_PARTS, type MonthParts, type WageKind } from './pay-month'
import { moneyText } from './vat-form'

/** 750 as "7,5", 800 as "8", 25 as "0,25". */
export function hundredthsText(n: number): string {
  const whole = Math.floor(n / 100)
  const part = n % 100
  return part === 0 ? String(whole) : `${whole},${String(part).padStart(2, '0').replace(/0$/, '')}`
}

/** "7,5", "8" or "0.25" in hundredths; null when empty, NaN when it is no number of hours or days. */
export function hundredthsOf(text: string): number | null {
  const plain = text.replace(/\s/g, '')
  if (plain === '') return null
  const m = /^(\d{1,3})(?:[,.](\d{1,2}))?$/.exec(plain)
  return m ? Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0')) : Number.NaN
}

/** 91234 as "9,1234": ten-thousandths of a euro (average earnings, a daily base). */
export const tenThousandthsText = (n: number): string => `${Math.floor(n / 10000)},${String(n % 10000).padStart(4, '0')}`

/** "9,1234", "45" or "45,5 €" in ten-thousandths; null when empty, NaN when it is no amount. */
export function tenThousandthsOf(text: string): number | null {
  const plain = text.replace(/[\s €]/g, '')
  if (plain === '') return null
  const m = /^(\d{1,6})(?:[,.](\d{1,4}))?$/.exec(plain)
  return m ? Number(m[1]) * 10000 + Number((m[2] ?? '').padEnd(4, '0')) : Number.NaN
}

/** The field of each part, followed by the employee's id: mzda_<id>, dovolenka_<id> ... */
export const PART_FIELDS: Record<keyof MonthParts, string> = {
  wage: 'mzda',
  hours: 'hodiny',
  holidayDays: 'dovolenka',
  obstacleHours: 'prekazky',
  unpaidDays: 'volno',
  overtimeHours: 'nadcas',
  nightHours: 'noc',
  saturdayHours: 'sobota',
  sundayHours: 'nedela',
  holidayWorkHours: 'sviatok',
  bonus: 'odmena',
  other: 'ine',
  average: 'pz',
  meals: 'jedla',
}

const HOURS = new Set<keyof MonthParts>(['hours', 'obstacleHours', 'overtimeHours', 'nightHours', 'saturdayHours', 'sundayHours', 'holidayWorkHours'])
const DAYS = new Set<keyof MonthParts>(['holidayDays', 'unpaidDays'])

/** The parts a relationship has: an employment all of them, an agreement no holiday, obstacles or overtime, a director a bonus and other income only. */
export function partsFor(kind: ContractKind, wageKind: WageKind): (keyof MonthParts)[] {
  const head: (keyof MonthParts)[] = wageKind === 'hourly' && kind !== 'director' ? ['hours'] : ['wage']
  if (kind === 'employment') return [...head, 'holidayDays', 'obstacleHours', 'unpaidDays', 'overtimeHours', 'nightHours', 'saturdayHours', 'sundayHours', 'holidayWorkHours', 'bonus', 'other', 'average', 'meals']
  if (isAgreement(kind)) return [...head, ...(wageKind === 'hourly' ? [] : (['hours'] as const)), 'nightHours', 'saturdayHours', 'sundayHours', 'holidayWorkHours', 'bonus', 'other', 'average']
  return ['wage', 'bonus', 'other']
}

/** A person's parts as the form shows them. */
export function partsValues(parts: MonthParts, id: string, kind: ContractKind, wageKind: WageKind): Record<string, string> {
  const v: Record<string, string> = {}
  for (const key of partsFor(kind, wageKind)) {
    const value = parts[key]
    if (key === 'meals' || value === undefined) {
      v[`${PART_FIELDS[key]}_${id}`] = value === null || value === undefined ? '' : String(value)
      continue
    }
    v[`${PART_FIELDS[key]}_${id}`] = value === null ? '' : key === 'average' ? tenThousandthsText(value) : HOURS.has(key) || DAYS.has(key) ? (value === 0 ? '' : hundredthsText(value)) : key === 'wage' ? moneyText(value) : value === 0 ? '' : moneyText(value)
  }
  return v
}

/**
 * A person's parts read from the form: each field of the relationship, empty as nought (or as "as agreed" for the
 * wage, the hours and the average earnings), a wrong one as an error under its field. The wage of a monthly-paid person
 * typed equal to the agreed one is kept as "as agreed", so it follows a later change of the contract.
 */
export function readParts(body: Record<string, unknown>, id: string, kind: ContractKind, wageKind: WageKind, agreed: number): { parts: MonthParts; values: Record<string, string>; errors: Record<string, 'amount' | 'hours' | 'days' | 'average' | 'meals'> } {
  const parts: MonthParts = { ...EMPTY_PARTS }
  const values: Record<string, string> = {}
  const errors: Record<string, 'amount' | 'hours' | 'days' | 'average' | 'meals'> = {}
  for (const key of partsFor(kind, wageKind)) {
    const name = `${PART_FIELDS[key]}_${id}`
    const text = typeof body[name] === 'string' ? (body[name] as string).trim().slice(0, 16) : ''
    values[name] = text
    if (key === 'meals') {
      // The meals of the month, a whole number; empty: proposed from the hours worked.
      const n = text === '' ? null : /^\d{1,2}$/.test(text) ? Number(text) : Number.NaN
      if (n !== null && (Number.isNaN(n) || n > 62)) errors[name] = 'meals'
      else parts.meals = n
    } else if (key === 'average') {
      const n = tenThousandthsOf(text)
      if (n !== null && (Number.isNaN(n) || n <= 0)) errors[name] = 'average'
      else parts.average = n
    } else if (HOURS.has(key) || DAYS.has(key)) {
      const n = hundredthsOf(text)
      const max = DAYS.has(key) ? 3100 : 74400
      if (n !== null && (Number.isNaN(n) || n > max)) errors[name] = DAYS.has(key) ? 'days' : 'hours'
      else if (key === 'hours') parts.hours = n
      else (parts[key] as number) = n ?? 0
    } else {
      const n = centsOf(text)
      if (n !== null && (Number.isNaN(n) || n < 0)) errors[name] = 'amount'
      else if (key === 'wage') parts.wage = n === null || n === agreed ? null : n
      else (parts[key] as number) = n ?? 0
    }
  }
  return { parts, values, errors }
}
