// The day's takings of an eKasa till (18 October 2026): a shop, a café or a hairdresser records its sales in a till
// (Act No. 384/2025 Z. z. on recording takings), and the till's daily closing (denná uzávierka) says what was taken by
// rate of VAT. The client writes the day's closing here; it becomes the company's document of its own (source
// 'takings', an issued document of the day, booked at once), so the books, the VAT return and the control statement
// take it as they take everything else:
// - the books: the cash part into the cash box (211), the rest paid by card, money on its way (261) until the bank
//   brings it, against the revenues (604 goods, 602 services) and the VAT owed (343.200); no customer owes it, so it is
//   no open item and no bank payment is paired with it (ledger.ts, store.ts `CASH_PAID`);
// - the VAT return: rows 01 to 04 by rate, row 13 for what is exempt (vat.ts);
// - the control statement: D.1 as one total of the period, the turnover of all tills with VAT and the bases and VAT at
//   the basic rate and at the reduced ones (KVDPH's instructions of 2021, part D.1; what is exempt may be left out of
//   the turnover, and is counted here), never A.1 or D.2.
// The VAT of a rate is what the closing says; typed nothing, it is worked out from the takings with VAT (the VAT in a
// price, rate / (100 + rate)), which may differ by a cent from a till that rounds every receipt.
import type { VatLine } from './vat'

export const TAKINGS_RATES = [23, 19, 5, 0] as const
export type TakingsRate = (typeof TAKINGS_RATES)[number]
export type TakingsCategory = 'sales_goods' | 'sales'

export interface TakingsValues {
  day: string
  number: string
  /** The takings with VAT of each rate (0: exempt, or all of it for a company that is no VAT payer), as typed. */
  gross: Record<TakingsRate, string>
  /** The VAT of each rate as the closing says it; empty to work it out. */
  vat: Record<TakingsRate, string>
  card: string
  category: TakingsCategory
  center: string
}

export type TakingsErrors = Partial<Record<'day' | 'amount' | 'vat' | 'card' | 'center', string>>

export interface Takings {
  on: string
  number: string | null
  lines: VatLine[]
  total: number
  vat: number
  /** The part paid in cash; the rest by card. */
  cash: number
  category: TakingsCategory
  center: string | null
}

/** The VAT inside a price with VAT at a rate, to the cent. */
export const vatInGross = (gross: number, rate: number): number => (rate === 0 ? 0 : Math.round((gross * rate) / (100 + rate)))

export const emptyTakings = (day: string): TakingsValues => ({
  day,
  number: '',
  gross: { 23: '', 19: '', 5: '', 0: '' },
  vat: { 23: '', 19: '', 5: '', 0: '' },
  card: '',
  category: 'sales_goods',
  center: '',
})

/**
 * The day's takings from the form: the day (not ahead), each rate's takings with VAT and its VAT, how much came by
 * card. A company that is no VAT payer has one amount without VAT. Each amount at or above nought; at least one.
 */
export function readTakings(
  field: (name: string) => unknown,
  payer: boolean,
  today: string,
  dayOf: (text: string) => string | null,
  centsOf: (text: string) => number | null,
  errorText: { day: string; amount: string; none: string; vat: string; card: string },
): { values: TakingsValues; input: Takings | null; errors: TakingsErrors } {
  const text = (name: string, max = 20) => {
    const v = field(name)
    return typeof v === 'string' ? v.trim().slice(0, max) : ''
  }
  const values = emptyTakings(text('den'))
  values.number = text('cislo', 40)
  values.card = text('karta')
  values.category = text('druh') === 'sales' ? 'sales' : 'sales_goods'
  values.center = text('stredisko', 64)
  const rates: readonly TakingsRate[] = payer ? TAKINGS_RATES : [0]
  for (const rate of rates) {
    values.gross[rate] = text(`trzba_${rate}`)
    if (rate !== 0) values.vat[rate] = text(`dph_${rate}`)
  }
  const errors: TakingsErrors = {}
  const on = dayOf(values.day)
  if (!on || on > today) errors.day = errorText.day
  const lines: VatLine[] = []
  for (const rate of rates) {
    const gross = values.gross[rate] === '' ? null : centsOf(values.gross[rate])
    const typedVat = rate === 0 || values.vat[rate] === '' ? null : centsOf(values.vat[rate])
    if ((values.gross[rate] !== '' && (gross === null || Number.isNaN(gross) || gross < 0)) || (values.vat[rate] !== '' && (typedVat === null || Number.isNaN(typedVat) || typedVat < 0))) {
      errors.amount = errorText.amount
      continue
    }
    if (gross === null || gross === 0) {
      if (typedVat) errors.vat = errorText.vat
      continue
    }
    const vat = typedVat ?? vatInGross(gross, rate)
    if (vat > gross) {
      errors.vat = errorText.vat
      continue
    }
    lines.push({ rate, base: gross - vat, vat, deduct: 0 })
  }
  if (lines.length === 0 && !errors.amount && !errors.vat) errors.amount = errorText.none
  const total = lines.reduce((s, l) => s + l.base + l.vat, 0)
  const card = values.card === '' ? 0 : centsOf(values.card)
  if (card === null || Number.isNaN(card) || card < 0 || card > total) errors.card = errorText.card
  if (Object.keys(errors).length > 0 || !on || card === null || Number.isNaN(card)) return { values, input: null, errors }
  return {
    values,
    input: {
      on,
      number: values.number || null,
      lines,
      total,
      vat: lines.reduce((s, l) => s + l.vat, 0),
      cash: total - card,
      category: values.category,
      center: values.center || null,
    },
    errors,
  }
}
