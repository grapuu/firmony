// What is due and when, for the overview of the client's app.
import { APP } from '../config'
import { formatEurExact } from '../format'
import { app as t, monthName } from './copy'
import type { Company } from './store'
import { DELIVERY_LABELS } from '../filings/model'
import { filingDeadline, periodOf, prevPeriod } from './vat'
import { leftToPay, payable, periodName, type FiledReturn, type TaxPaid } from './vat-store'

export interface Deadline {
  day: string
  label: string
  state: string
  tone: 'ok' | 'amber' | 'blue'
  /** Where the client acts on it: a tax to pay. */
  href?: string
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
 * return can be filed by the 25th), the VAT return and the control statement (a VAT payer; by the 25th after the
 * period, or the next working day), and the tax to pay once a return is filed, until it is paid; the annual closing
 * and the tax return by 31 March. Everything but the documents and paying is done by us.
 */
export function deadlinesFor(
  company: Pick<Company, 'vatStatus' | 'vatQuarterly'>,
  day: string,
  missingByMonth: Map<string, number>,
  vat: { filed: FiledReturn[]; paid: Map<string, TaxPaid> } = { filed: [], paid: new Map() },
  /** Firmony's own invoices to the company that are not paid yet: the client pays them, by their due day. */
  bills: readonly { number: string; totalCents: number; dueOn: string }[] = [],
): Deadline[] {
  const month = day.slice(0, 7)
  const date = Number(day.slice(8, 10))
  const out: Deadline[] = []
  const docs = (of: string) => {
    const missing = missingByMonth.get(of) ?? 0
    out.push({
      day: `${nextMonth(of)}-${String(APP.docsByDay).padStart(2, '0')}`,
      label: t.deadline.docs(monthName(`${of}-01`)),
      state: t.deadline.docsState(missing),
      tone: missing > 0 ? 'amber' : 'ok',
    })
  }
  const last = prevMonth(month)
  if (date <= APP.docsByDay || (missingByMonth.get(last) ?? 0) > 0) docs(last)
  docs(month)
  if (company.vatStatus !== 'none') {
    const current = periodOf(day, company.vatQuarterly)
    const ended = prevPeriod(current)
    const of = day <= filingDeadline(ended) ? ended : current
    const toPay = (f: FiledReturn) => payable({ vatStatus: company.vatStatus }, f)
    const left = (f: FiledReturn) => leftToPay({ vatStatus: company.vatStatus }, f, vat.paid.get(f.period))
    const pay = (f: FiledReturn): Deadline => {
      const rest = left(f)
      return {
        day: f.dueOn,
        label: t.deadline.vatPay(periodName(f.period)),
        state: rest === 0 ? t.deadline.vatPaid : t.deadline.vatToPay(formatEurExact(rest)),
        tone: rest === 0 ? 'ok' : 'amber',
        href: '/app/dane',
      }
    }
    const filed = vat.filed.find((f) => f.period === of)
    if (filed && toPay(filed) > 0) out.push(pay(filed))
    else if (filed)
      out.push({ day: filed.dueOn, label: company.vatStatus === 'payer' ? t.deadline.vat(periodName(of)) : t.taxes.period(periodName(of)), state: DELIVERY_LABELS[filed.deliveryStatus ?? 'unverified'], tone: filed.deliveryStatus === 'accepted' ? 'ok' : 'amber', href: '/app/podania' })
    else if (company.vatStatus === 'payer') out.push({ day: filingDeadline(of), label: t.deadline.vat(periodName(of)), state: t.deadline.ours, tone: 'blue' })
    // A tax filed earlier and not paid yet, or the difference of a supplementary return, stays on the list until it is paid.
    for (const f of vat.filed) if (f.period !== of && left(f) > 0) out.push(pay(f))
  }
  const year = Number(day.slice(0, 4))
  const closingYear = day.slice(5) <= '03-31' ? year - 1 : year
  out.push({ day: `${closingYear + 1}-03-31`, label: t.deadline.closing(String(closingYear)), state: t.deadline.ours, tone: 'blue' })
  for (const bill of bills)
    out.push({ day: bill.dueOn, label: t.bills.deadline(bill.number), state: t.bills.deadlineState(formatEurExact(bill.totalCents)), tone: 'amber', href: '/app/firma#faktury-firmony' })
  return out.sort((a, b) => a.day.localeCompare(b.day))
}
