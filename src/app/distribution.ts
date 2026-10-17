// A year's result distributed once the general meeting has approved the statements: the reserve fund the Commercial
// Code asks for, old losses covered, dividends, the rest kept; a loss carried as unpaid. Pure: closing-store.ts keeps
// it, views/closing.tsx shows it, and the books get it as one internal document on the day of the approval.
//
// What it leans on (read in the original on slov-lex on 17 October 2026):
// - Act No. 513/1991 Zb. (Commercial Code) as in force from 17 August 2026: § 67(2) and (3), the reserve fund of an
//   s. r. o. and an a. s. made from the net profit of the approved statements, and no share of the profit before it is
//   topped up; § 124(1), an s. r. o. at least 5 % of the net profit a year until it is 10 % of the registered capital
//   (or what the memorandum says); § 217(1), an a. s. 10 % of the registered capital at its founding and at least 10 %
//   of the net profit a year until 20 % (or what the articles say); § 220h(3) and (4), a j. s. a. as an a. s. (§ 217 is
//   not among the provisions it leaves out); § 123 and § 179(3), no profit is paid out that would leave the equity
//   below the capital and the funds that may not be paid out.
// - Act No. 595/2003 Z. z. (Income Tax Act) as in force in 2026: § 43(1)(a) with (3)(r), a dividend paid to a natural
//   person is taxed by withholding at 7 %; the version of 1 January 2024 taxed the profits of periods from 2024 at 10 %
//   (§ 52zzz(4)), the version of 1 January 2025 those from 2025 at 7 % again (§ 52zzzb); § 43(11), the tax withheld is paid by the fifteenth day of the month after the payout, with the notice of
//   it (oznámenie o zrazení a odvedení dane) by the same day.
// Booked (the Slovak chart of accounts): 431 against 421 (the legal reserve fund), 429 (old losses covered), 364
// (owed to the shareholders) and 428 (retained); a loss 429 against 431; the tax withheld 364 against 342 on the
// day of the payout.
import { workingDayFrom } from './vat'

export type LegalFormKind = 'sro' | 'as' | 'jsa' | null

/** What the year-end balances say of the equity (cents, each as a plus). */
export interface Equity {
  /** The year's result after tax: a profit plus, a loss minus. */
  result: number
  capital: number
  reserve: number
  retained: number
  losses: number
}

/** The equity of a year from its closing balances (account to cents, a debit plus): the year's costs and revenues, 411, 421, 428, 429. */
export function equityOf(balances: ReadonlyMap<string, number>): Equity {
  let result = 0
  let capital = 0
  let reserve = 0
  let retained = 0
  let losses = 0
  for (const [account, cents] of balances) {
    const cls = account.charAt(0)
    if (cls === '5' || cls === '6') result -= cents
    else if (account === '411' || account.startsWith('411.')) capital -= cents
    else if (account === '421' || account.startsWith('421.')) reserve -= cents
    else if (account === '428' || account.startsWith('428.')) retained -= cents
    else if (account === '429' || account.startsWith('429.')) losses += cents
  }
  return { result, capital, reserve, retained, losses }
}

/** The least that goes to the reserve fund out of a profit, and the cap the fund grows to (Commercial Code § 124, § 217). */
export function reserveMinimum(form: LegalFormKind, equity: Equity): { cents: number; rate: number; cap: number } {
  const stock = form === 'as' || form === 'jsa'
  const rate = stock ? 10 : 5
  const cap = Math.round((equity.capital * (stock ? 20 : 10)) / 100)
  if (equity.result <= 0) return { cents: 0, rate, cap }
  return { cents: Math.max(0, Math.min(Math.ceil((equity.result * rate) / 100), cap - equity.reserve)), rate, cap }
}

/** The rate of the tax withheld on a dividend paid to a natural person, by the year whose profit it is. */
export const dividendTaxRate = (year: number): number => (year === 2024 ? 10 : 7)

/** The accountant's distribution of a year's result, as the general meeting decided it (closings.distribution). */
export interface Distribution {
  /** The day the general meeting approved the statements and the distribution. */
  approvedOn: string
  reserve: number
  /** Old losses (429) covered out of the profit. */
  cover: number
  dividends: number
  /** The part of the dividends paid to natural persons, which bears the tax withheld. */
  people: number
  /** The day the dividends are paid out, when it is known. */
  payoutOn: string | null
  /** When the notice of the tax withheld was marked as filed, and by whom. */
  taxFiledOn?: string | null
}

export type DistributionIssue = 'reserve' | 'tooMuch' | 'people' | 'cover' | 'day' | 'payout' | 'loss'

/** What keeps a distribution from being booked. */
export function distributionIssues(form: LegalFormKind, year: number, equity: Equity, d: Distribution): DistributionIssue[] {
  const out: DistributionIssue[] = []
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.approvedOn) || d.approvedOn <= `${year}-12-31`) out.push('day')
  if (equity.result <= 0) {
    if (d.reserve + d.cover + d.dividends > 0) out.push('loss')
    return out
  }
  if (d.dividends > 0 && d.reserve < reserveMinimum(form, equity).cents) out.push('reserve')
  if (d.cover > equity.losses) out.push('cover')
  // What may be paid out: the profit less the fund and the losses covered, and what was kept from years before, less the losses left.
  const free = equity.result - d.reserve - d.cover + equity.retained - (equity.losses - d.cover)
  if (d.reserve + d.cover > equity.result || d.dividends > Math.max(0, free)) out.push('tooMuch')
  if (d.people > d.dividends) out.push('people')
  if (d.payoutOn !== null && (!/^\d{4}-\d{2}-\d{2}$/.test(d.payoutOn) || d.payoutOn < d.approvedOn)) out.push('payout')
  return out
}

export interface EntryLine {
  md: string
  d: string
  cents: number
}

/**
 * The internal document of the approval day: the fund, the losses covered, the dividends, the rest kept (a dividend
 * beyond this year's profit comes out of what was kept before); a loss carried to 429.
 */
export function distributionLines(equity: Equity, d: Distribution): EntryLine[] {
  if (equity.result <= 0) return equity.result < 0 ? [{ md: '429', d: '431', cents: -equity.result }] : []
  const fromProfit = Math.min(d.dividends, equity.result - d.reserve - d.cover)
  const fromRetained = d.dividends - fromProfit
  const kept = equity.result - d.reserve - d.cover - fromProfit
  return [
    { md: '431', d: '421', cents: d.reserve },
    { md: '431', d: '429', cents: d.cover },
    { md: '431', d: '364', cents: fromProfit },
    { md: '428', d: '364', cents: fromRetained },
    { md: '431', d: '428', cents: kept },
  ].filter((l) => l.cents > 0)
}

/** The tax withheld on the dividends paid to natural persons (cents, rounded to the cent). */
export const withheldOf = (year: number, d: Pick<Distribution, 'people'>): number => Math.round((d.people * dividendTaxRate(year)) / 100)

/** The day the tax withheld is paid and its notice filed: the fifteenth of the month after the payout, a working day. */
export function dividendTaxDue(payoutOn: string): string {
  const [y, m] = payoutOn.split('-').map(Number) as [number, number]
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
  return workingDayFrom(`${next}-15`)
}

export function distributionOf(raw: unknown): Distribution | null {
  if (typeof raw !== 'string') return null
  try {
    const o = JSON.parse(raw) as Record<string, unknown>
    const cents = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : 0)
    const day = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null)
    const approvedOn = day(o.approvedOn)
    if (!approvedOn) return null
    return { approvedOn, reserve: cents(o.reserve), cover: cents(o.cover), dividends: cents(o.dividends), people: cents(o.people), payoutOn: day(o.payoutOn), taxFiledOn: day(o.taxFiledOn) }
  } catch {
    return null
  }
}
