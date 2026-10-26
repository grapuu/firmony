// The SRO corporate-tax and dividend calculator (/sro-kalkulacka). A yearly estimate, "orientačný". Figures verified
// 23 October 2026: corporate income tax 10 % up to 100 000 € of revenue, 21 % to 5 000 000 €, 24 % above; the rate is
// chosen by revenue and applied to the profit. Dividend withholding tax 7 % on profit from 2025 onwards.
// The minimum tax (§ 46b of Act No. 595/2003 Z. z.), added 26 October 2026: the tax is at least the band of the taxable
// revenues, 340 € up to 50 000 €, 960 € to 250 000 €, 1 920 € to 500 000 €, 3 840 € to 5 000 000 € and 11 520 € above
// (periods from 2026); a company's first tax period pays none (§ 46b(7)), which the page says. The bands and the rate
// are those of the real closing (closing.ts, `minimumTax` and `taxRate`, read on 14 October 2026), and agree with the
// guide /danove-priznanie-pravnickej-osoby (src/content/guides.ts, read on Slov-Lex on 21 October 2026).
import { minimumTax, taxRate } from './closing'

export interface SroQuery { year: number; revenue: number; expenses: number }
export interface SroResult {
  query: SroQuery
  profit: number
  rate: number
  /** The tax by the rate, before the minimum tax. */
  computed: number
  /** The minimum tax of the revenue's band (§ 46b). */
  minimum: number
  /** The tax: the computed one, at least the minimum tax. */
  corporate: number
  minimumApplied: boolean
  /** The profit after tax; below nought when the minimum tax is more than the profit. */
  netProfit: number
  dividend: number
  net: number
}
export const SRO_DIVIDEND_RATE = 7
export const SRO_YEAR = 2026
/** The upper edges of the minimum tax's bands (§ 46b(2)) in cents: 50 000, 250 000, 500 000 and 5 000 000 €. */
export const SRO_MINIMUM_EDGES = [5_000_000, 25_000_000, 50_000_000, 500_000_000] as const

/** The minimum tax's bands of a year as `minimumTax` gives them: each band's upper edge (null above the last) and tax. */
export function sroMinimumBands(year: number): { upTo: number | null; tax: number }[] {
  return [...SRO_MINIMUM_EDGES.map((edge) => ({ upTo: edge as number | null, tax: minimumTax(year, edge) })), { upTo: null, tax: minimumTax(year, SRO_MINIMUM_EDGES[3] + 1) }]
}

export function sroCalc(q: SroQuery): SroResult {
  const profit = Math.max(0, q.revenue - q.expenses)
  const rate = taxRate(q.year, q.revenue)
  const computed = Math.round((profit * rate) / 100)
  const minimum = minimumTax(q.year, q.revenue)
  const corporate = Math.max(computed, minimum)
  const netProfit = profit - corporate
  // Only a profit after tax can be paid out as a dividend.
  const payable = Math.max(0, netProfit)
  const dividend = Math.round((payable * SRO_DIVIDEND_RATE) / 100)
  const net = payable - dividend
  return { query: q, profit, rate, computed, minimum, corporate, minimumApplied: minimum > computed, netProfit, dividend, net }
}

export function sroRevenueOf(text: string | undefined): number | null {
  const plain = (text ?? '').replace(/[\s €]/g, '')
  const m = /^(\d{1,8})(?:[,.](\d{1,2}))?$/.exec(plain)
  if (!m) return null
  const cents = Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'))
  return cents >= 100 && cents <= 1_000_000_000 ? cents : null
}

/** Expenses: empty is nought, "0" too; otherwise an amount as `sroRevenueOf` reads it; null when it is none. */
export function sroExpensesOf(text: string | undefined): number | null {
  const plain = (text ?? '').replace(/[\s €]/g, '')
  if (plain === '' || /^0+(?:[,.]0{1,2})?$/.test(plain)) return 0
  return sroRevenueOf(plain)
}

/** The address read: the revenue and the expenses; a wrong amount in either is said, never taken as nought. */
export function sroQueryOf(q: Record<string, string | undefined>): { query: SroQuery | null; error: boolean; asked: boolean } {
  if (q.prijem === undefined) return { query: null, error: false, asked: false }
  const revenue = sroRevenueOf(q.prijem)
  const expenses = sroExpensesOf(q.vydavky)
  if (revenue === null || expenses === null) return { query: null, error: true, asked: true }
  return { query: { year: SRO_YEAR, revenue, expenses }, error: false, asked: true }
}
