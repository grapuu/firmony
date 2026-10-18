// The recapitulative statement (súhrnný výkaz) of a period, worked out from the issued invoices the VAT return counts.
// Pure: vat-xml.ts writes its file, vat-store.ts keeps what was filed, the VAT page shows it, the screen of deadlines
// lists it, and test/units.test.mjs checks every rule.
//
// The rules (§ 80 of Act No. 222/2004 Z. z. as in force from 1 January 2027, read on static.slov-lex.sk on
// 14 October 2026; the poučenie to SVDPHv20 under measure No. 405/2019 Z. z., and the eForm form.471 itself, read
// on pfseform.financnasprava.sk the same day):
// - Who and for what: monthly SV for a monthly payer; for a quarterly payer, independent months when § 80(2) requires
//   them, otherwise a quarter within the goods limit in it and the previous four quarters. A person under § 7a
//   for the calendar quarter (§ 80(3)); within 25 days after the period (§ 80(9); vat.ts, `filingDeadline`). Nothing
//   is filed for a period without such supplies.
// - What: each customer's total, by its VAT number, for goods supplied free of tax to another member state (§ 43,
//   without a code) and for services whose place of supply is there (§ 15(1), code 2); in the period the tax fell due
//   (§ 80(6): `taxDay`, independently of a VAT period override), a correction of the base in the period it was made (§ 80(7)).
//   Each row in whole euros, half a euro up (§ 80(6)); the total on the first page is the sum of the rows (the eForm's
//   own check). The middle person's supplies of triangular trade with the code 1 (vat.ts `triangle`; FR SR's answer
//   478530), counted with the goods for the quarterly limit. Not built: goods moved to another member state of one's own
//   (§ 43(4)), call-off stock (part II).
// - Corrections (§ 80(8)): before the deadline a corrective statement (opravný) with every row again; after it a
//   supplementary one (dodatočný) with only the rows that change: the right value, nought for a row that was wrong;
//   a row cancelled because its code was wrong, or of triangular trade, carries the code 0 (poučenie, part IV and
//   its examples 10 to 14).
import { filingDeadline, isEuVatId, isIssued, isQuarter, periodOf, periodRange, plainVatId, taxDay, vatCountry, vatOf, type Issue, type VatCompany, type VatDoc } from './vat'

/** A row's code: goods without one, services 2; 0 cancels a row of a code (a supplementary statement alone). */
export type SvCode = '' | '1' | '2' | '0'

/** A customer's supplies of one kind in the period, in cents, with the documents that make it. */
export interface SvLine {
  country: string
  number: string
  code: '' | '1' | '2'
  cents: number
  docs: string[]
}

/** A row as the form takes it: the country, the VAT number without it, whole euros, the code. */
export interface SvRow {
  country: string
  number: string
  euros: number
  code: SvCode
}

/** A statement as the Financial Administration holds it: what was filed last, and the filing it replaced. */
export interface SvFiled {
  deliveryStatus?: import('../filings/model').DeliveryStatus
  kind: 'R' | 'O' | 'D'
  filedOn: string
  filedAt: number
  filedBy: string | null
  filedByName?: string | null
  /** Every row the books gave when it was filed, which the statements filed so far make together; null for a mark
   *  without them, taken as standing. */
  rows: SvRow[] | null
  /** The rows its file held (a supplementary statement's are only those that changed). */
  sent: SvRow[]
  prev: SvFiled | null
  /** The actual file marked as sent. A reclassified quarter retains its original file and source period. */
  file?: { name: string; xml: string; sha256: string; attemptId?: string }
  sourcePeriod?: string
}

/** none: nothing to file; running: the period has not ended; blocked: something keeps it back; ready: its file can
 *  be made; filed: as the books stand; changed: filed, and the books now give other rows. */
export type SvState = 'none' | 'running' | 'blocked' | 'ready' | 'filed' | 'changed'

export interface SvView {
  /** The independent statement period: a month or a calendar quarter under § 80. */
  period: string
  state: SvState
  lines: SvLine[]
  /** The rows as the books give them now. */
  rows: SvRow[]
  issues: Issue[]
  filed: SvFiled | null
  /** What to file now: a regular statement, or a correction of the one filed; null when nothing can be. */
  plan: { kind: 'R' | 'O' | 'D'; rows: SvRow[] } | null
  deadline: string
  /** A monthly statement can first be prepared after the month in which quarterly eligibility ended. */
  endsOn: string
}

export interface SvSchedule {
  quarter: string
  periods: string[]
  monthly: boolean
  /** First month whose cumulative goods exceeded the limit; null when monthly from the quarter's start. */
  crossedIn: string | null
}

/** The quarter a month falls in ('2027-Q1' of '2027-02'); a quarter stays itself. */
export const quarterOf = (period: string): string => (isQuarter(period) ? period : `${period.slice(0, 4)}-Q${Math.ceil(Number(period.slice(5, 7)) / 3)}`)

/** The base period before resolving monthly SV: the same for a payer, the calendar quarter under § 7a. */
export const summaryPeriodOf = (period: string, company: Pick<VatCompany, 'status'>): string => (company.status === 'reg7a' ? quarterOf(period) : period)

/** Whole euros, half a euro away from nought (§ 80(6)). */
export const wholeEuros = (cents: number): number => Math.sign(cents) * Math.round(Math.abs(cents) / 100)

/** What § 80(2) measures a quarter's goods against: 50 000 €, in cents. */
const GOODS_LIMIT = 5_000_000

/** The reporting month follows the tax day, independently of the VAT return's monthly/quarterly period override. */
export const summaryMonthOf = (doc: VatDoc, data: NonNullable<VatDoc['vat']>): string => periodOf(taxDay(doc, data), false)

export const quarterMonths = (period: string): string[] => {
  const quarter = quarterOf(period)
  const first = (Number(quarter.slice(-1)) - 1) * 3 + 1
  return [first, first + 1, first + 2].map((m) => `${quarter.slice(0, 4)}-${String(m).padStart(2, '0')}`)
}

/** Start of the four preceding quarters, including year boundaries; loaders must fetch this history too. */
export function summaryLookbackFrom(period: string): string {
  const quarter = quarterOf(period)
  return `${Number(quarter.slice(0, 4)) - 1}${quarter.slice(4)}`
}

/** § 80(2), FR SR methodology examples 7/8: monthly VAT is unchanged; quarterly VAT can require three monthly SVs. */
export function summarySchedule(company: VatCompany, period: string, docs: VatDoc[], filedPeriods: readonly string[] = []): SvSchedule {
  const quarter = quarterOf(period)
  if (company.status === 'reg7a') return { quarter, periods: [quarter], monthly: false, crossedIn: null }
  if (!company.quarterly) return { quarter, periods: isQuarter(period) ? quarterMonths(period) : [period], monthly: true, crossedIn: null }
  const byMonth = new Map<string, number>()
  for (const doc of docs) {
    if (!isIssued(doc.kind)) continue
    const counted = vatOf(doc, company)
    if (counted?.data.mode !== 'eu_goods' && counted?.data.mode !== 'triangle') continue
    const month = summaryMonthOf(doc, counted.data)
    byMonth.set(month, (byMonth.get(month) ?? 0) + counted.data.lines.reduce((sum, line) => sum + line.base, 0))
  }
  const months = quarterMonths(quarter)
  const previous = [...new Set([...byMonth.keys()].map(quarterOf))].filter((q) => q >= summaryLookbackFrom(quarter) && q < quarter)
  const crossed = (q: string): string | null => {
    let total = 0
    for (const month of quarterMonths(q)) {
      total += byMonth.get(month) ?? 0
      if (total > GOODS_LIMIT) return month
    }
    return null
  }
  const fromStart = previous.some((q) => crossed(q) !== null)
  const crossedIn = fromStart ? null : crossed(quarter)
  const monthly = fromStart || crossedIn !== null || filedPeriods.some((p) => months.includes(p))
  return { quarter, periods: monthly ? months : [quarter], monthly, crossedIn }
}

const key = (r: { country: string; number: string; code: string }) => `${r.country}:${r.number}:${r.code}`

/**
 * The customers' rows of a statement's period, from every issued invoice with goods or services supplied to another
 * member state, and what keeps them back: an invoice not booked, one without its amounts in euros, one whose
 * customer has no VAT number of another member state. `due`: the period has such an invoice, so a statement is due.
 */
export function summaryLines(company: VatCompany, period: string, docs: VatDoc[]): { lines: SvLine[]; issues: Issue[]; due: boolean } {
  const issues: Issue[] = []
  let due = false
  const lines = new Map<string, SvLine>()
  const { from, to } = periodRange(period)
  for (const doc of docs) {
    // A document nobody has read yet may be an invoice of the period: it keeps the statement back until it is.
    if (doc.kind === null && !doc.booked) {
      const day = doc.issuedOn ?? doc.receivedOn
      if (day >= from && day <= to) issues.push({ level: 'block', code: 'unbooked', doc: doc.id })
      continue
    }
    if (!isIssued(doc.kind)) continue
    const counted = vatOf(doc, company)
    if (!counted || (counted.data.mode !== 'eu_goods' && counted.data.mode !== 'eu_service' && counted.data.mode !== 'triangle')) continue
    const { data, proposed } = counted
    const month = summaryMonthOf(doc, data)
    if ((isQuarter(period) ? quarterOf(month) : month) !== period) continue
    due = true
    if (!doc.booked) {
      issues.push({ level: 'block', code: 'unbooked', doc: doc.id })
      continue
    }
    if (proposed) issues.push({ level: 'warn', code: 'proposed', doc: doc.id })
    const vatId = plainVatId(data.vatId)
    const country = vatCountry(vatId)
    if (!vatId || !country || country === 'SK' || !isEuVatId(vatId)) {
      issues.push({ level: 'block', code: 'svVatId', doc: doc.id })
      continue
    }
    if (data.lines.length === 0) {
      issues.push({ level: 'block', code: (doc.currency ?? 'EUR') !== 'EUR' ? 'currency' : 'lines', doc: doc.id })
      continue
    }
    const cents = data.lines.reduce((sum, line) => sum + line.base, 0)
    const code = data.mode === 'eu_service' ? '2' : data.mode === 'triangle' ? '1' : ''
    const line = { country, number: vatId.slice(2), code } as const
    const held = lines.get(key(line)) ?? { ...line, cents: 0, docs: [] }
    held.cents += cents
    held.docs.push(doc.id)
    lines.set(key(line), held)
  }
  if (company.status === 'payer' && isQuarter(period) && summarySchedule(company, period, docs).monthly) issues.push({ level: 'block', code: 'svMonthly', doc: null })
  return { lines: [...lines.values()].sort((a, b) => key(a).localeCompare(key(b))), issues, due }
}

/** The rows of the lines, in whole euros; a customer whose supplies came to nothing is left out. */
export function rowsOf(lines: SvLine[]): SvRow[] {
  return lines.map((line) => ({ country: line.country, number: line.number, euros: wholeEuros(line.cents), code: line.code as SvCode })).filter((row) => row.euros !== 0)
}

/** The total on the first page: the sum of the rows. */
export const totalOf = (rows: SvRow[]): number => rows.reduce((sum, row) => sum + row.euros, 0)

/**
 * The rows of a supplementary statement: a row whose value changed with its right value, a new row, and a row that is
 * no more with nought, first; a cancelled row carries the code 0 when its code was 1, or 2 while the same customer
 * stays under another code (a wrong code), and keeps its code otherwise (a wrong VAT number).
 */
export function svDiff(filed: SvRow[], now: SvRow[]): SvRow[] {
  const before = new Map(filed.map((row) => [key(row), row]))
  const after = new Map(now.map((row) => [key(row), row]))
  const cancelled: SvRow[] = []
  for (const row of filed) {
    if (after.has(key(row))) continue
    const stays = now.some((other) => other.country === row.country && other.number === row.number)
    cancelled.push({ ...row, euros: 0, code: row.code === '1' || (row.code === '2' && stays) ? '0' : row.code })
  }
  const changed = now.filter((row) => before.get(key(row))?.euros !== row.euros)
  return [...cancelled, ...changed]
}

const sameRows = (a: SvRow[], b: SvRow[]): boolean => {
  const sorted = (rows: SvRow[]) => JSON.stringify([...rows].sort((x, y) => key(x).localeCompare(key(y))))
  return sorted(a) === sorted(b)
}

/**
 * The statement of a period as it stands: its rows, what keeps it back (`companyBlocks`: the company's VAT number or
 * address missing), whether it was filed and changed since, and what to file now. What a statement filed holds is
 * always every row the books gave when it was filed, a supplementary one too.
 */
export function summaryView(company: VatCompany, period: string, docs: VatDoc[], filed: SvFiled | null, companyBlocks: number, today: string, schedule = summarySchedule(company, period, docs, filed && !isQuarter(period) ? [period] : [])): SvView {
  const { lines, issues, due } = summaryLines(company, period, docs)
  const rows = rowsOf(lines)
  const endsOn = schedule.crossedIn && !isQuarter(period) && period < schedule.crossedIn ? periodRange(schedule.crossedIn).to : periodRange(period).to
  const deadline = filingDeadline(schedule.crossedIn && !isQuarter(period) && period < schedule.crossedIn ? schedule.crossedIn : period)
  if (!schedule.periods.includes(period) && !isQuarter(period)) issues.push({ level: 'block', code: 'svQuarterly', doc: null })
  const blocked = companyBlocks > 0 || issues.some((i) => i.level === 'block')
  const base = { period, lines, rows, issues, filed, deadline, endsOn }
  if (filed) {
    if (filed.rows === null || sameRows(filed.rows, rows)) return { ...base, state: 'filed', plan: null }
    const kind = today <= deadline ? 'O' : 'D'
    return { ...base, state: 'changed', plan: blocked ? null : { kind, rows: kind === 'O' ? rows : svDiff(filed.rows, rows) } }
  }
  // Supplies that came to nothing (an invoice and its credit note) leave nothing to file.
  if (!due || (!blocked && rows.length === 0)) return { ...base, state: 'none', plan: null }
  if (today <= endsOn) return { ...base, state: 'running', plan: null }
  if (blocked) return { ...base, state: 'blocked', plan: null }
  return { ...base, state: 'ready', plan: { kind: 'R', rows } }
}
