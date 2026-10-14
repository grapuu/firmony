// The recapitulative statement (súhrnný výkaz) of a period, worked out from the issued invoices the VAT return counts.
// Pure: vat-xml.ts writes its file, vat-store.ts keeps what was filed, the VAT page shows it, the screen of deadlines
// lists it, and test/units.test.mjs checks every rule.
//
// The rules (§ 80 of Act No. 222/2004 Z. z. as in force from 1 January 2027, read on static.slov-lex.sk on
// 14 October 2026; the poučenie to SVDPHv20 under measure No. 405/2019 Z. z., and the eForm form.471 itself, read
// on pfseform.financnasprava.sk the same day):
// - Who and for what: a payer for its VAT period (monthly, or the calendar quarter of a quarterly payer: § 80(2) allows
//   the quarter only when goods stay within 50 000 € in it and in each of the previous four quarters), a person registered under § 7a
//   for the calendar quarter (§ 80(3)); within 25 days after the period (§ 80(9); vat.ts, `filingDeadline`). Nothing
//   is filed for a period without such supplies.
// - What: each customer's total, by its VAT number, for goods supplied free of tax to another member state (§ 43,
//   without a code) and for services whose place of supply is there (§ 15(1), code 2); in the period the tax fell due
//   (§ 80(6): the return's period, `periodOfDoc`), a correction of the base in the period it was made (§ 80(7)).
//   Each row in whole euros, half a euro up (§ 80(6)); the total on the first page is the sum of the rows (the eForm's
//   own check). Not built: triangular trade (code 1), goods moved to another member state of one's own (§ 43(4)),
//   call-off stock (part II).
// - Corrections (§ 80(8)): before the deadline a corrective statement (opravný) with every row again; after it a
//   supplementary one (dodatočný) with only the rows that change: the right value, nought for a row that was wrong;
//   a row cancelled because its code was wrong, or of triangular trade, carries the code 0 (poučenie, part IV and
//   its examples 10 to 14).
import { correctionKind, filingDeadline, isEuVatId, isIssued, isQuarter, periodOfDoc, periodRange, plainVatId, vatCountry, vatOf, type Issue, type VatCompany, type VatDoc } from './vat'

/** A row's code: goods without one, services 2; 0 cancels a row of a code (a supplementary statement alone). */
export type SvCode = '' | '1' | '2' | '0'

/** A customer's supplies of one kind in the period, in cents, with the documents that make it. */
export interface SvLine {
  country: string
  number: string
  code: '' | '2'
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
}

/** none: nothing to file; running: the period has not ended; blocked: something keeps it back; ready: its file can
 *  be made; filed: as the books stand; changed: filed, and the books now give other rows. */
export type SvState = 'none' | 'running' | 'blocked' | 'ready' | 'filed' | 'changed'

export interface SvView {
  /** The statement's period: the payer's VAT period, a calendar quarter under § 7a. */
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
}

/** The quarter a month falls in ('2027-Q1' of '2027-02'); a quarter stays itself. */
export const quarterOf = (period: string): string => (isQuarter(period) ? period : `${period.slice(0, 4)}-Q${Math.ceil(Number(period.slice(5, 7)) / 3)}`)

/** The statement's period of a VAT period: the same for a payer, the calendar quarter for a person registered under § 7a. */
export const summaryPeriodOf = (period: string, company: Pick<VatCompany, 'status'>): string => (company.status === 'reg7a' ? quarterOf(period) : period)

/** Whole euros, half a euro away from nought (§ 80(6)). */
export const wholeEuros = (cents: number): number => Math.sign(cents) * Math.round(Math.abs(cents) / 100)

/** What § 80(2) measures a quarter's goods against: 50 000 €, in cents. */
const GOODS_LIMIT = 5_000_000

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
  const goods = new Map<string, number>()
  // SV periodicity is independent of the VAT return. Check the full four-quarter lookback, not just today's rows.
  for (const doc of docs) {
    if (!isIssued(doc.kind)) continue
    const counted = vatOf(doc, company)
    if (counted?.data.mode !== 'eu_goods') continue
    const quarter = quarterOf(periodOfDoc(doc, counted.data, company))
    goods.set(quarter, (goods.get(quarter) ?? 0) + counted.data.lines.reduce((sum, line) => sum + line.base, 0))
  }
  for (const doc of docs) {
    // A document nobody has read yet may be an invoice of the period: it keeps the statement back until it is.
    if (doc.kind === null && !doc.booked) {
      const day = doc.issuedOn ?? doc.receivedOn
      if (day >= from && day <= to) issues.push({ level: 'block', code: 'unbooked', doc: doc.id })
      continue
    }
    if (!isIssued(doc.kind)) continue
    const counted = vatOf(doc, company)
    if (!counted || (counted.data.mode !== 'eu_goods' && counted.data.mode !== 'eu_service')) continue
    const { data, proposed } = counted
    if (summaryPeriodOf(periodOfDoc(doc, data, company), company) !== period) continue
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
    const code = data.mode === 'eu_service' ? '2' : ''
    const line = { country, number: vatId.slice(2), code } as const
    const held = lines.get(key(line)) ?? { ...line, cents: 0, docs: [] }
    held.cents += cents
    held.docs.push(doc.id)
    lines.set(key(line), held)
  }
  if (company.status === 'payer' && isQuarter(period)) {
    const index = Number(period.slice(0, 4)) * 4 + Number(period.slice(-1)) - 1
    const exceeds = [...goods].some(([quarter, cents]) => {
      const q = Number(quarter.slice(0, 4)) * 4 + Number(quarter.slice(-1)) - 1
      return q >= index - 4 && q <= index && cents > GOODS_LIMIT
    })
    // Until separate monthly SV periods are implemented, prevent an invalid quarterly filing altogether.
    if (exceeds) issues.push({ level: 'block', code: 'svMonthly', doc: null })
  }
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
export function summaryView(company: VatCompany, period: string, docs: VatDoc[], filed: SvFiled | null, companyBlocks: number, today: string): SvView {
  const { lines, issues, due } = summaryLines(company, period, docs)
  const rows = rowsOf(lines)
  const deadline = filingDeadline(period)
  const blocked = companyBlocks > 0 || issues.some((i) => i.level === 'block')
  const base = { period, lines, rows, issues, filed, deadline }
  if (filed) {
    if (filed.rows === null || sameRows(filed.rows, rows)) return { ...base, state: 'filed', plan: null }
    const kind = correctionKind(period, today)
    return { ...base, state: 'changed', plan: blocked ? null : { kind, rows: kind === 'O' ? rows : svDiff(filed.rows, rows) } }
  }
  // Supplies that came to nothing (an invoice and its credit note) leave nothing to file.
  if (!due || (!blocked && rows.length === 0)) return { ...base, state: 'none', plan: null }
  if (today <= periodRange(period).to) return { ...base, state: 'running', plan: null }
  if (blocked) return { ...base, state: 'blocked', plan: null }
  return { ...base, state: 'ready', plan: { kind: 'R', rows } }
}
