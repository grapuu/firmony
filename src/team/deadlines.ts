// Every client's deadlines on one screen, for the accountants' side (/ucto/terminy): what we file and by when, and what
// the client has to bring or pay, worked out every time from what the app holds (a VAT period by the same rules as the
// VAT page, the returns filed, the payments, the contract), so it cannot disagree with it. Pure: deadlines-store.ts
// loads what it needs, views/deadlines.tsx shows it, test/units.test.mjs checks every rule.
//
// What is listed, and what each rule leans on (read on 14 October 2026):
// - The VAT return and the control statement of a period (a payer, monthly or quarterly; a person registered under
//   § 7a only for a month in which it owes tax): by the 25th after the period, or the next working day (§ 78(1) and
//   § 78a(7) of Act No. 222/2004 Z. z.; vat.ts, `filingDeadline`). Its state is the VAT page's (vat-store.ts, `viewOf`).
//   A payer's period of ours older than the ones worked out, never filed, is listed as overdue as it is.
// - A period filed and changed since: a corrective return before its deadline, a supplementary one after it, by the end
//   of the month after the one in which the reason was found (§ 16 of Act No. 563/2009 Z. z.); until the accountant
//   names that day, today counts.
// - The recapitulative statement (súhrnný výkaz, § 80 of the VAT Act) of a period with goods or services supplied to
//   another member state: within 25 days after the period (§ 80(9)), the payer's VAT period, or the calendar quarter
//   of a person registered under § 7a (it supplies services). Firmony does not prepare it yet (the VAT page says so):
//   it is filed in eDane and marked here as filed (`filings`).
// - The VAT a filed return asks the client to pay, until the bank shows it paid with the period's symbol (the client's).
// - The documents of a month, by the 10th of the next (APP.docsByDay), while payments of it have none (the client's);
//   not once the contract's intake has closed.
// - The annual closing and the corporate income tax return of a year: by the end of the third month after it, 31 March
//   (§ 49(1) of Act No. 595/2003 Z. z.), or the end of the month a notice moved it to (§ 49(3)), moved to the next
//   working day (app/closing.ts, `closingDue`); not for a year before our contract started (point 5.2 of the terms: the
//   former accountant's) nor for the year it ended in (point 10.4: only by agreement). Done once the closing page marks
//   it filed (`closings`).
// - The income tax that filed return asks the client to pay, by the same day, until the bank shows it paid with the
//   year's symbol (the client's).
// - The handover of the books at the end of a contract: within 30 days of its last day (point 10.4, ENDING.handoverDays).
import { APP, DEADLINES } from '../config'
import { addDays, endingOf, intakeOpen } from '../app/ending'
import { bratislavaDay, type Company } from '../app/store'
import { closingDue } from '../app/closing'
import { correctionKind, filingDeadline, isQuarter, nextPeriod, periodOf, periodRange, prevPeriod } from '../app/vat'
import { firstPeriod, leftToPay, payable, supplementaryDeadline, type FiledReturn, type PeriodView, type TaxPaid } from '../app/vat-store'

export type DueKind = 'vat' | 'vatFix' | 'summary' | 'vatPay' | 'docs' | 'closing' | 'taxPay' | 'handover'

/** Whose a deadline is: ours to file, or the client's to bring or to pay. */
export type DueSide = 'ours' | 'client'

export const DUE_SIDE: Record<DueKind, DueSide> = { vat: 'ours', vatFix: 'ours', summary: 'ours', closing: 'ours', handover: 'ours', vatPay: 'client', docs: 'client', taxPay: 'client' }

/** Filings the app does not make yet, marked as filed by hand (`filings.kind`): the recapitulative statement. */
export const MARKED_KINDS = { summary: 'sv' } as const
export type MarkedKind = (typeof MARKED_KINDS)[keyof typeof MARKED_KINDS]

/**
 * ready: it can be filed now; blocked: something keeps it from being filed (`count` things); open: to be done; running:
 * its period, its month or the contract still runs; done: filed, paid or handed over.
 */
export type DueState = 'ready' | 'blocked' | 'open' | 'running' | 'done'

export interface Due {
  companyId: string
  kind: DueKind
  /** What it is of: a VAT period, a month of documents (YYYY-MM), the year of a closing; null for the handover. */
  period: string | null
  /** The last day. */
  day: string
  state: DueState
  /** The day has passed and it is not done. */
  late: boolean
  /** The things that keep a filing from being made, or the payments without a document. */
  count: number
  /** The tax left to pay, in cents. */
  cents: number
  /** A correction: corrective (O) before the period's deadline, supplementary (D) after it. */
  fix: 'O' | 'D' | null
}

/** A year's closing as the deadlines read it (closing-store.ts): filed or not, the deadline a notice moved it to, the tax it asked for and what was paid of it. */
export interface ClosingFact {
  year: number
  filed: boolean
  extendedTo: string | null
  payCents: number
  dueOn: string | null
  paid: number
}

/** What a company's deadlines are worked out from. */
export interface DueFacts {
  /** The VAT periods of `vatWindow`, worked out (viewOf), the oldest first. */
  views: PeriodView[]
  /** Every return filed, the newest first. */
  filed: FiledReturn[]
  paid: Map<string, TaxPaid>
  /** What was marked as filed outside the app, as `${kind}:${period}` ('sv:2027-01'). */
  filings: Set<string>
  closings: ClosingFact[]
  /** The payments without a document, by the month they were booked in (YYYY-MM). */
  missing: Map<string, number>
  /** Files handed over at the end of the contract. */
  handover: number
}

const pad = (n: number) => String(n).padStart(2, '0')

function nextMonth(month: string): string {
  const [y, m] = month.split('-').map(Number) as [number, number]
  return m === 12 ? `${y + 1}-01` : `${y}-${pad(m + 1)}`
}

/** The calendar quarter of a month's period: "2027-02" is "2027-Q1". */
export const quarterOf = (period: string): string => (isQuarter(period) ? period : `${period.slice(0, 4)}-Q${Math.ceil(Number(period.slice(5, 7)) / 3)}`)

/** The year of a closing ours to do: we kept the books at its end (point 5.2 of the terms), and the contract did not end in it (point 10.4). */
export function closingIsOurs(company: Pick<Company, 'startOn' | 'createdAt' | 'endsOn'>, year: number): boolean {
  const end = `${year}-12-31`
  const start = company.startOn ?? bratislavaDay(company.createdAt)
  return start <= end && (!company.endsOn || company.endsOn > end)
}

/**
 * The VAT periods worked out in full: those that ended in the last four months (a quarterly payer's last two
 * quarters), none before our first period. Older ones are a payer's to file only if never filed, which needs no
 * documents to tell.
 */
export function vatWindow(company: Pick<Company, 'vatStatus' | 'vatQuarterly' | 'vatSince' | 'startOn' | 'endsOn'>, today: string): string[] {
  if (company.vatStatus === 'none') return []
  const quarterly = company.vatQuarterly
  const first = firstPeriod(company)
  // Nothing after the contract's last period is ours.
  const lastOurs = company.endsOn ? periodOf(company.endsOn, quarterly) : null
  const out: string[] = []
  let p = prevPeriod(periodOf(today, quarterly))
  for (let i = 0; i < (quarterly ? Math.ceil(DEADLINES.vatMonths / 3) : DEADLINES.vatMonths); i++, p = prevPeriod(p)) {
    if (first && p < first) break
    if (!lastOurs || p <= lastOurs) out.unshift(p)
  }
  return out
}

/** A company's deadlines: everything that can be done now, what still runs once it is `aheadDays` near, and what was done in the last weeks. */
export function deadlinesOf(company: Company, facts: DueFacts, today: string): Due[] {
  const out: Due[] = []
  const add = (due: Pick<Due, 'kind' | 'period' | 'day' | 'state'> & Partial<Pick<Due, 'count' | 'cents' | 'fix'>>) =>
    out.push({ companyId: company.id, count: 0, cents: 0, fix: null, ...due, late: (due.state === 'open' || due.state === 'ready' || due.state === 'blocked') && today > due.day })

  if (company.vatStatus !== 'none') {
    const quarterly = company.vatQuarterly
    const filed = new Set(facts.filed.map((f) => f.period))
    const first = firstPeriod(company)
    const lastOurs = company.endsOn ? periodOf(company.endsOn, quarterly) : null
    const oldest = facts.views[0]?.period ?? null
    if (company.vatStatus === 'payer' && first && oldest) {
      // A payer's periods of ours before the ones worked out that were never filed: overdue, whatever they hold.
      let listed = 0
      for (let p = first, guard = 0; p < oldest && listed < DEADLINES.olderPeriods && guard < 600; p = nextPeriod(p), guard++) {
        if (filed.has(p)) continue
        add({ kind: 'vat', period: p, day: filingDeadline(p), state: 'open' })
        listed++
      }
    }
    const summaries = new Set<string>()
    for (const view of facts.views) {
      const period = view.period
      const blocks = view.companyIssues.length + (view.previous ? 1 : 0) + view.result.issues.filter((i) => i.level === 'block').length
      if (view.state === 'ready') add({ kind: 'vat', period, day: view.deadline, state: 'ready' })
      else if (view.state === 'blocked') add({ kind: 'vat', period, day: view.deadline, state: 'blocked', count: blocks })
      else if (view.state === 'filed') add({ kind: 'vat', period, day: view.deadline, state: 'done' })
      else if (view.state === 'changed') {
        const fix = correctionKind(period, today)
        add({ kind: 'vatFix', period, day: fix === 'O' ? view.deadline : supplementaryDeadline(today), state: blocks > 0 ? 'blocked' : 'ready', count: blocks, fix })
      }
      // A period with supplies to another member state has its recapitulative statement too (a person registered
      // under § 7a files it for the calendar quarter).
      if (view.result.issues.some((i) => i.code === 'summary')) {
        const sv = company.vatStatus === 'reg7a' ? quarterOf(period) : period
        if (summaries.has(sv)) continue
        summaries.add(sv)
        const done = facts.filings.has(`${MARKED_KINDS.summary}:${sv}`)
        add({ kind: 'summary', period: sv, day: filingDeadline(sv), state: done ? 'done' : today <= periodRange(sv).to ? 'running' : 'open' })
      }
    }
    // The period that runs today: its return is ahead (a person registered under § 7a files only once it owes tax).
    const current = periodOf(today, quarterly)
    if (company.vatStatus === 'payer' && (!first || current >= first) && (!lastOurs || current <= lastOurs)) add({ kind: 'vat', period: current, day: filingDeadline(current), state: 'running' })
    // The tax a filed return asks for, until it is paid.
    for (const f of facts.filed) {
      if (payable(company, f) === 0) continue
      const rest = leftToPay(company, f, facts.paid.get(f.period))
      add({ kind: 'vatPay', period: f.period, day: f.dueOn, state: rest > 0 ? 'open' : 'done', cents: rest })
    }
  }

  // The documents of a month, while payments of it have none, and while the client can still bring them.
  if (intakeOpen(company, today)) {
    for (const [month, n] of facts.missing) {
      if (n <= 0) continue
      const running = today <= periodRange(month).to
      add({ kind: 'docs', period: month, day: `${nextMonth(month)}-${pad(APP.docsByDay)}`, state: running ? 'running' : 'open', count: n })
    }
  }

  // The closing of the year that ended last, while it is ours and not filed; the income tax each filed one asks for, until paid.
  const year = Number(today.slice(0, 4)) - 1
  const last = facts.closings.find((k) => k.year === year)
  if (closingIsOurs(company, year)) add({ kind: 'closing', period: String(year), day: closingDue(year, last?.extendedTo ?? null), state: last?.filed ? 'done' : 'open' })
  for (const k of facts.closings) {
    if (!k.filed || k.payCents <= 0) continue
    const rest = Math.max(0, k.payCents - k.paid)
    add({ kind: 'taxPay', period: String(k.year), day: k.dueOn ?? closingDue(k.year, k.extendedTo), state: rest > 0 ? 'open' : 'done', cents: rest })
  }

  // The books handed over at the end of the contract.
  const ending = endingOf(company, today)
  if (ending) add({ kind: 'handover', period: null, day: ending.handoverBy, state: facts.handover > 0 ? 'done' : ending.phase === 'ending' ? 'running' : 'open' })

  // What still runs is shown once it comes near; what can be done now always (a supplementary return may be due in two
  // months, the closing in three); what was done for a few weeks.
  const ahead = addDays(today, DEADLINES.aheadDays)
  const back = addDays(today, -DEADLINES.doneDays)
  return out.filter((d) => (d.state === 'done' ? d.day >= back : d.state !== 'running' || d.day <= ahead))
}

/** Where a deadline stands on the screen: overdue, within a week, within a month, later, or done. */
export type DueGroup = 'late' | 'week' | 'month' | 'later' | 'done'
export const DUE_GROUPS: readonly DueGroup[] = ['late', 'week', 'month', 'later', 'done']

export function groupOf(due: Pick<Due, 'state' | 'late' | 'day'>, today: string): DueGroup {
  if (due.state === 'done') return 'done'
  if (due.late) return 'late'
  if (due.day <= addDays(today, 7)) return 'week'
  if (due.day <= addDays(today, 31)) return 'month'
  return 'later'
}

const KIND_ORDER: Record<DueKind, number> = { vat: 0, vatFix: 1, summary: 2, vatPay: 3, docs: 4, closing: 5, taxPay: 6, handover: 7 }

/** The order of the screen: by day, then by company, then by kind. Done ones the newest first. */
export function compareDues<T extends Due & { companyName: string }>(a: T, b: T): number {
  if (a.state === 'done' && b.state === 'done' && a.day !== b.day) return b.day.localeCompare(a.day)
  return a.day.localeCompare(b.day) || a.companyName.localeCompare(b.companyName, 'sk') || KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || (a.period ?? '').localeCompare(b.period ?? '')
}

/** The figures above the list: overdue, due within a week, VAT ready to be filed, and what waits for the client. */
export function dueFigures(dues: readonly Due[], today: string): { late: number; week: number; ready: number; client: number } {
  const open = dues.filter((d) => d.state !== 'done')
  return {
    late: open.filter((d) => d.late).length,
    week: open.filter((d) => !d.late && d.state !== 'running' && d.day <= addDays(today, 7)).length,
    ready: open.filter((d) => d.state === 'ready').length,
    client: open.filter((d) => DUE_SIDE[d.kind] === 'client').length,
  }
}
