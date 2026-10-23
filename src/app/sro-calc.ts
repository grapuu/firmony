// The SRO corporate-tax and dividend calculator (/sro-kalkulacka). A yearly estimate, "orientačný". Figures verified
// 23 October 2026: corporate income tax 10 % up to 100 000 € of revenue, 21 % to 5 000 000 €, 24 % above; the rate is
// chosen by revenue and applied to the profit. Dividend withholding tax 7 % on profit from 2025 onwards.
export interface SroQuery { year: number; revenue: number; expenses: number }
export interface SroResult {
  query: SroQuery
  profit: number
  rate: number
  corporate: number
  netProfit: number
  dividend: number
  net: number
}
export const SRO_DIVIDEND_RATE = 7

export function sroCalc(q: SroQuery): SroResult {
  const profit = Math.max(0, q.revenue - q.expenses)
  const rate = q.revenue <= 10_000_000 ? 10 : q.revenue <= 500_000_000 ? 21 : 24
  const corporate = Math.round((profit * rate) / 100)
  const netProfit = profit - corporate
  const dividend = Math.round((netProfit * SRO_DIVIDEND_RATE) / 100)
  const net = netProfit - dividend
  return { query: q, profit, rate, corporate, netProfit, dividend, net }
}

export function sroRevenueOf(text: string | undefined): number | null {
  const plain = (text ?? '').replace(/[\s €]/g, '')
  const m = /^(\d{1,8})(?:[,.](\d{1,2}))?$/.exec(plain)
  if (!m) return null
  const cents = Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'))
  return cents >= 100 && cents <= 1_000_000_000 ? cents : null
}
