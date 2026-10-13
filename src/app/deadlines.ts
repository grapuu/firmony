// What is due and when, for the overview of the client's app.
import { APP } from '../config'
import { app as t, monthName } from './copy'
import type { Company } from './store'

export interface Deadline {
  day: string
  label: string
  state: string
  tone: 'ok' | 'amber' | 'blue'
}

export function nextMonth(month: string): string {
  const [y, m] = month.split('-').map(Number) as [number, number]
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
}

export function prevMonth(month: string): string {
  const [y, m] = month.split('-').map(Number) as [number, number]
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`
}

/**
 * What is due and when: the month's documents by the 10th of the next month (ours to ask for, so that the VAT
 * return can be filed by the 25th), the VAT return and the control statement by the 25th (a VAT payer), the annual
 * closing and the tax return by 31 March. Everything but the documents is filed by us.
 */
export function deadlinesFor(company: Pick<Company, 'vatPayer'>, day: string, missingByMonth: Map<string, number>): Deadline[] {
  const month = day.slice(0, 7)
  const date = Number(day.slice(8, 10))
  const out: Deadline[] = []
  const docs = (of: string) => {
    const missing = missingByMonth.get(of) ?? 0
    out.push({ day: `${nextMonth(of)}-${String(APP.docsByDay).padStart(2, '0')}`, label: t.deadline.docs(monthName(`${of}-01`)), state: t.deadline.docsState(missing), tone: missing > 0 ? 'amber' : 'ok' })
  }
  const last = prevMonth(month)
  if (date <= APP.docsByDay || (missingByMonth.get(last) ?? 0) > 0) docs(last)
  docs(month)
  if (company.vatPayer) {
    const of = date <= 25 ? last : month
    out.push({ day: `${nextMonth(of)}-25`, label: t.deadline.vat(monthName(`${of}-01`)), state: t.deadline.ours, tone: 'blue' })
  }
  const year = Number(day.slice(0, 4))
  const closingYear = day.slice(5) <= '03-31' ? year - 1 : year
  out.push({ day: `${closingYear + 1}-03-31`, label: t.deadline.closing(String(closingYear)), state: t.deadline.ours, tone: 'blue' })
  return out.sort((a, b) => a.day.localeCompare(b.day))
}

