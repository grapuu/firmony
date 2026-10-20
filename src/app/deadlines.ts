// What is due and when, for the overview of the client's app. It is read from the same deadlines as the team's
// screen (team/deadlines.ts, `deadlinesOf`), so the client and the accountant never see two different truths: what we
// file and its state, the taxes the client pays, and only what falls within our contract (point 5.2 of the terms).
// The client's own part is added here: the documents of the month that runs and of the month before, which the team
// lists only once a payment of them has no document.
import { APP } from '../config'
import { formatEurExact } from '../format'
import { app as t, monthName } from './copy'
import { bratislavaDay, type Company } from './store'
import { DELIVERY_LABELS } from '../filings/model'
import { closingDue } from './closing'
import { intakeOpen } from './ending'
import { periodName } from './vat-store'
import { closingIsOurs, type Due } from '../team/deadlines'

export interface Deadline {
  day: string
  label: string
  state: string
  tone: 'ok' | 'amber' | 'blue'
  /** Where the client acts on it or reads more: a tax to pay, a filing. */
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
 * The client's list: the documents of a month by the 10th of the next (the month that runs, the month before until
 * the 10th, and any month of ours whose payments still miss documents); what we file (VAT, its corrections, the
 * closing) with its state; the taxes a filed return asks for, until paid; Firmony's own invoices not paid yet. What
 * was done stays until its day has passed.
 */
export function clientDeadlines(
  company: Pick<Company, 'vatStatus' | 'startOn' | 'createdAt' | 'endsOn' | 'noticeSide'>,
  dues: readonly Due[],
  day: string,
  missingByMonth: Map<string, number>,
  /** Firmony's own invoices to the company that are not paid yet: the client pays them, by their due day. */
  bills: readonly { number: string; totalCents: number; dueOn: string }[] = [],
): Deadline[] {
  const out: Deadline[] = []
  const month = day.slice(0, 7)
  const first = (company.startOn ?? bratislavaDay(company.createdAt)).slice(0, 7)
  const lastOurs = company.endsOn ? company.endsOn.slice(0, 7) : null
  const ours = (m: string) => m >= first && (!lastOurs || m <= lastOurs)

  // The documents: what the client brings. A month with payments still missing documents is listed whatever its age
  // (those are counted only within our books); the month before until the 10th; the month that runs.
  if (intakeOpen(company, day)) {
    const months = new Set([...missingByMonth].filter(([, n]) => n > 0).map(([m]) => m))
    const last = prevMonth(month)
    if (ours(last) && Number(day.slice(8, 10)) <= APP.docsByDay) months.add(last)
    if (ours(month)) months.add(month)
    for (const m of months) {
      const missing = missingByMonth.get(m) ?? 0
      out.push({ day: `${nextMonth(m)}-${String(APP.docsByDay).padStart(2, '0')}`, label: t.deadline.docs(monthName(`${m}-01`)), state: t.deadline.docsState(missing), tone: missing > 0 ? 'amber' : 'ok' })
    }
  }

  // What we file and what the client pays, as the team's screen has it; what was done until its day has passed.
  const shown = dues.filter((d) => d.state !== 'done' || d.day >= day)
  const filedState = (d: Due) => (d.deliveryStatus ? DELIVERY_LABELS[d.deliveryStatus] : t.deadline.ours)
  let closing = false
  for (const d of shown) {
    const period = d.period ?? ''
    if (d.kind === 'vat')
      out.push({ day: d.day, label: company.vatStatus === 'payer' ? t.deadline.vat(periodName(period)) : t.taxes.period(periodName(period)), state: filedState(d), tone: d.state === 'done' ? 'ok' : 'blue', ...(d.deliveryStatus ? { href: '/app/dane' } : {}) })
    else if (d.kind === 'vatFix') out.push({ day: d.day, label: t.deadline.vatFix(d.fix ?? 'O', periodName(period)), state: t.deadline.ours, tone: 'blue' })
    else if (d.kind === 'vatRegister' && d.vatRegister?.crossedOn && d.state !== 'done') out.push({ day: d.day, label: t.deadline.vatRegister, state: t.deadline.ours, tone: 'blue', href: '/app/spravy' })
    else if (d.kind === 'vatPay') out.push({ day: d.day, label: t.deadline.vatPay(periodName(period)), state: d.state === 'done' ? t.deadline.vatPaid : t.deadline.vatToPay(formatEurExact(d.cents)), tone: d.state === 'done' ? 'ok' : 'amber', href: '/app/dane' })
    else if (d.kind === 'closing') {
      closing = true
      out.push({ day: d.day, label: t.deadline.closing(period), state: filedState(d), tone: d.state === 'done' ? 'ok' : 'blue', ...(d.deliveryStatus ? { href: '/app/dane' } : {}) })
    } else if (d.kind === 'taxAdvance') out.push({ day: d.day, label: t.deadline.taxAdvance, state: t.deadline.vatToPay(formatEurExact(d.cents)), tone: 'amber', href: '/app/dane' })
    else if (d.kind === 'payrollPay') out.push({ day: d.day, label: t.deadline.payrollPay(monthName(`${period}-01`)), state: t.deadline.payrollPayState, tone: 'amber', href: '/app/spravy' })
    else if (d.kind === 'dividendTax' && d.state !== 'done') out.push({ day: d.day, label: t.deadline.dividendTax(period), state: t.deadline.vatToPay(formatEurExact(d.cents)), tone: 'amber', href: '/app/spravy' })
    else if (d.kind === 'taxPay') out.push({ day: d.day, label: t.deadline.taxPay(period), state: d.state === 'done' ? t.deadline.vatPaid : t.deadline.vatToPay(formatEurExact(d.cents)), tone: d.state === 'done' ? 'ok' : 'amber', href: '/app/dane' })
  }
  // The closing of the year that runs, when it is ours and the one before is not on the list.
  const year = Number(day.slice(0, 4))
  if (!closing && closingIsOurs(company, year)) out.push({ day: closingDue(year, null), label: t.deadline.closing(String(year)), state: t.deadline.ours, tone: 'blue' })

  for (const bill of bills)
    out.push({ day: bill.dueOn, label: t.bills.deadline(bill.number), state: t.bills.deadlineState(formatEurExact(bill.totalCents)), tone: 'amber', href: '/app/firma#faktury-firmony' })
  return out.sort((a, b) => a.day.localeCompare(b.day))
}
