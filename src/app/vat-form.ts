// The part of the booking form where the accountant confirms how VAT falls on a document: the mode, the day of
// supply, the other side's VAT number, the invoice a corrective one corrects, the period when it is not the one the
// dates give, and the base and VAT of each rate. Pure: the route reads the form with `readVat` and stores what comes
// back; `vatValues` writes a document's VAT back into the form. Errors are codes; the page says them in words.
import { dayOfText, textDay } from './booking'
import { centsOf } from './invoices'
import type { DocKind } from './match'
import { ISSUED_MODES, RECEIVED_MODES, isA2Unit, isEuVatId, isIssued, isPeriod, isReceived, isReverseKind, isSkVatId, isTriangle, plainVatId, vatCountry, type ReverseGoods, type VatData, type VatLine, type VatMode } from './vat'

/** The rates of the form's rows, the basic one first; 0 % is the base of what is supplied without VAT. */
export const FORM_RATES = [23, 19, 5, 0] as const
export type FormRate = (typeof FORM_RATES)[number]

export interface VatValues {
  mode: string
  supplied: string
  vatId: string
  corrects: string
  period: string
  base: Record<FormRate, string>
  tax: Record<FormRate, string>
  /** The one-stop shop: the member state of consumption, its rate (per cent, 25,5), the base and its VAT. */
  country?: string
  ossRate?: string
  ossBase?: string
  ossTax?: string
  /** An issued supply with domestic reverse charge: the letter of § 69(12), the tariff's code, the quantity, its unit. */
  reverseKind?: string
  reverseCode?: string
  reverseQuantity?: string
  reverseUnit?: string
}

export type VatErrorCode = 'amount' | 'base' | 'negative' | 'lines' | 'id' | 'supplierId' | 'noTax' | 'zeroOnly' | 'mode' | 'date' | 'period' | 'country' | 'rate' | 'reverseKind' | 'reverseCode' | 'reverseQuantity' | 'customerId' | 'euId'
export type VatField = 'mode' | 'supplied' | 'vatId' | 'corrects' | 'period' | `base${FormRate}` | `tax${FormRate}` | 'country' | 'ossRate' | 'ossBase' | 'ossTax' | 'reverseKind' | 'reverseCode' | 'reverseQuantity'
export type VatErrors = Partial<Record<VatField, VatErrorCode>>

/** What VAT is reported by the mode: taxed (with VAT), or the base alone (supplied without VAT), or nothing. */
const TAXED: readonly VatMode[] = ['domestic', 'reverse', 'acquisition', 'triangle_in', 'import', 'import84a']
const BASE_ONLY: readonly VatMode[] = ['eu_goods', 'eu_service', 'triangle', 'export', 'exempt', 'outside']
/** The modes whose lines go into the return or the recapitulative statement, so that booking without them is a mistake. */
const NEEDS_LINES: readonly VatMode[] = ['domestic', 'reverse', 'acquisition', 'triangle_in', 'import', 'import84a', 'eu_goods', 'triangle', 'export', 'exempt']

/** Which modes a document of this kind can have: an issued invoice's or a received one's; none for anything else. */
export function modesFor(kind: DocKind | null): readonly VatMode[] {
  return isIssued(kind) ? ISSUED_MODES : isReceived(kind) ? RECEIVED_MODES : []
}

/** Issued or received: within one family the VAT a document was given still fits when its kind changes. */
export const familyOf = (kind: DocKind | null): 'issued' | 'received' | null => (isIssued(kind) ? 'issued' : isReceived(kind) ? 'received' : null)

/** "1234,56" or "-12,40": cents the way they are typed. */
export function moneyText(cents: number): string {
  const sign = cents < 0 ? '-' : ''
  const abs = Math.abs(cents)
  return `${sign}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, '0')}`
}

const emptyRates = (): Record<FormRate, string> => ({ 23: '', 19: '', 5: '', 0: '' })

/** A document's VAT as the form shows it. */
export function vatValues(data: VatData): VatValues {
  const base = emptyRates()
  const tax = emptyRates()
  for (const line of data.lines) {
    const rate = line.rate as FormRate
    if (!(FORM_RATES as readonly number[]).includes(rate)) continue
    base[rate] = moneyText(line.base)
    if (rate !== 0) tax[rate] = moneyText(line.vat)
  }
  const oss = data.mode === 'oss' ? data.lines[0] : undefined
  return {
    mode: data.mode,
    supplied: data.suppliedOn ? textDay(data.suppliedOn) : '',
    vatId: data.vatId ?? '',
    corrects: data.corrects ?? '',
    period: data.period ?? '',
    base: data.mode === 'oss' ? emptyRates() : base,
    tax: data.mode === 'oss' ? emptyRates() : tax,
    country: data.country ?? '',
    ossRate: oss ? String(oss.rate).replace('.', ',') : '',
    ossBase: oss ? moneyText(oss.base) : '',
    ossTax: oss ? moneyText(oss.vat) : '',
    reverseKind: data.reverse?.kind ?? '',
    reverseCode: data.reverse?.code ?? '',
    reverseQuantity: data.reverse?.quantity ? hundredthsText(data.reverse.quantity) : '',
    reverseUnit: data.reverse?.unit ?? '',
  }
}

/** Hundredths as typed: "12,5" for 1250. */
const hundredthsText = (n: number): string => `${Math.floor(n / 100)}${n % 100 ? `,${String(n % 100).padStart(2, '0').replace(/0$/, '')}` : ''}`

/** "12,5" or "1 250" in hundredths, a third decimal mathematically rounded to two (the control statement's
 *  MnozstvoType: test/xsd/kv_dph_2025.xsd, "presnosťou na 2 desatinné miesta"); null when empty, NaN when it is
 *  no quantity. */
function hundredthsOf(text: string): number | null {
  const plain = text.replace(/\s/g, '')
  if (plain === '') return null
  const m = /^(\d{1,9})(?:[,.](\d{1,3}))?$/.exec(plain)
  if (!m) return Number.NaN
  const frac = (m[2] ?? '').padEnd(3, '0')
  return Number(m[1]) * 100 + Math.floor(Number(frac) / 10) + (Number(frac[2]) >= 5 ? 1 : 0)
}

/** The member states of the one-stop shop (oss.ts): the EU's but Slovakia, Greece as EL, Northern Ireland as XI for goods. */
export const OSS_STATES = ['AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'EL', 'ES', 'FI', 'FR', 'HR', 'HU', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PL', 'PT', 'RO', 'SE', 'SI', 'XI'] as const

export interface VatContext {
  kind: DocKind | null
  /** A payer deducts VAT on what it receives (the form's "Odpočítať DPH"); a person under § 7a never does. */
  payer: boolean
  deduct: boolean
  /** Booking asks for everything the return needs; saving takes what is there. */
  booking: boolean
  /** The periods the form offers; another one is refused. */
  periods: readonly string[]
}

/**
 * The VAT of a document from the form. `data` is null when the kind has no VAT (a document that is neither issued nor
 * received) or when anything is wrong; `errors` names each field that is.
 */
export function readVat(body: Record<string, unknown>, ctx: VatContext): { values: VatValues; data: VatData | null; errors: VatErrors } {
  const text = (name: string, max: number) => (typeof body[name] === 'string' ? (body[name] as string).trim().slice(0, max) : '')
  const values: VatValues = {
    mode: text('dph_rezim', 20),
    supplied: text('dph_dodanie', 20),
    vatId: text('dph_icdph', 20),
    corrects: text('dph_opravuje', 40),
    period: text('dph_obdobie', 10),
    base: emptyRates(),
    tax: emptyRates(),
    country: text('dph_stat', 2).toUpperCase(),
    ossRate: text('dph_oss_sadzba', 6),
    ossBase: text('dph_oss_zaklad', 20),
    ossTax: text('dph_oss_dan', 20),
    reverseKind: text('dph_ptp_druh', 8),
    reverseCode: text('dph_ptp_kod', 8),
    reverseQuantity: text('dph_ptp_mnozstvo', 16),
    reverseUnit: text('dph_ptp_jednotka', 4),
  }
  for (const rate of FORM_RATES) {
    values.base[rate] = text(`dph_zaklad_${rate}`, 20)
    if (rate !== 0) values.tax[rate] = text(`dph_dan_${rate}`, 20)
  }
  const errors: VatErrors = {}
  const modes = modesFor(ctx.kind)
  if (modes.length === 0) return { values, data: null, errors }
  const mode = modes.find((m) => m === values.mode) ?? null
  if (!mode) errors.mode = 'mode'
  const supplied = dayOfText(values.supplied)
  if (supplied === null) errors.supplied = 'date'
  const vatId = plainVatId(values.vatId)
  if (vatId && vatCountry(vatId) === null) errors.vatId = 'id'
  const corrects = values.corrects.replace(/\s+/g, ' ')
  if (values.period !== '' && !(isPeriod(values.period) && ctx.periods.includes(values.period))) errors.period = 'period'

  // The one-stop shop: one line at the member state's rate; the rows of the Slovak rates are not its.
  if (mode === 'oss') {
    const country = (OSS_STATES as readonly string[]).includes(values.country ?? '') ? (values.country as string) : null
    if (!country) errors.country = 'country'
    const rateText = (values.ossRate ?? '').replace(',', '.').replace(/\s|%/g, '')
    const rate = /^\d{1,2}(\.\d{1,2})?$/.test(rateText) ? Number(rateText) : null
    if (rate === null || rate <= 0 || rate >= 100) errors.ossRate = 'rate'
    const base = centsOf(values.ossBase ?? '')
    const given = centsOf(values.ossTax ?? '')
    if (Number.isNaN(base) || (base === null && ctx.booking)) errors.ossBase = Number.isNaN(base) ? 'amount' : 'lines'
    if (Number.isNaN(given)) errors.ossTax = 'amount'
    const ossLines = base !== null && !Number.isNaN(base) && rate !== null ? [{ rate, base, vat: given !== null && !Number.isNaN(given) ? given : Math.round((base * rate) / 100), deduct: 0 }] : []
    if (ossLines.some((line) => line.base < 0 || line.vat < 0) && corrects === '') errors.corrects = 'negative'
    if (Object.keys(errors).length > 0) return { values, data: null, errors }
    return { values, data: { mode, lines: ossLines, suppliedOn: supplied || null, vatId, corrects: corrects || null, period: values.period || null, country }, errors }
  }
  // An issued supply with domestic reverse charge: no VAT of the supplier's; what A.2 asks of it.
  const reverseOut = mode === 'reverse' && isIssued(ctx.kind)
  let reverse: ReverseGoods | null = null
  if (reverseOut) {
    const kind = isReverseKind(values.reverseKind) ? values.reverseKind : null
    if (!kind) errors.reverseKind = 'reverseKind'
    const code = (values.reverseCode ?? '').replace(/\s/g, '')
    const quantity = hundredthsOf(values.reverseQuantity ?? '')
    const unit = isA2Unit(values.reverseUnit) ? values.reverseUnit : null
    const goods = kind !== null && kind !== 'j' && kind !== 'other'
    if ((kind === 'f' || kind === 'g') && !/^\d{4}$/.test(code)) errors.reverseCode = 'reverseCode'
    if (goods && (quantity === null || Number.isNaN(quantity) || quantity <= 0 || unit === null)) errors.reverseQuantity = 'reverseQuantity'
    if (ctx.booking && !isSkVatId(vatId)) errors.vatId = errors.vatId ?? 'customerId'
    if (kind) reverse = { kind, code: kind === 'f' || kind === 'g' ? code || null : null, quantity: goods && quantity !== null && !Number.isNaN(quantity) ? quantity : null, unit: goods ? unit : null }
  }
  const lines: VatLine[] = []
  const taxed = mode !== null && TAXED.includes(mode) && !reverseOut
  const deducting = ctx.payer && ctx.deduct && isReceived(ctx.kind)
  for (const rate of FORM_RATES) {
    const base = centsOf(values.base[rate])
    const given = rate === 0 ? null : centsOf(values.tax[rate])
    if (Number.isNaN(base)) errors[`base${rate}`] = 'amount'
    if (Number.isNaN(given)) errors[`tax${rate}`] = 'amount'
    if (Number.isNaN(base) || Number.isNaN(given)) continue
    if (base === null && given === null) continue
    if (base === null) {
      errors[`base${rate}`] = 'base'
      continue
    }
    if (rate !== 0 && mode !== null && (BASE_ONLY.includes(mode) || reverseOut)) {
      errors[`base${rate}`] = 'zeroOnly'
      continue
    }
    // Only the base typed: the VAT of that rate, as the law counts it from the base.
    const vat = rate === 0 ? 0 : (given ?? (taxed ? Math.round((base * rate) / 100) : 0))
    if (base === 0 && vat === 0) continue
    lines.push({ rate, base, vat, deduct: deducting && taxed ? vat : 0 })
  }
  if (lines.some((line) => line.base < 0 || line.vat < 0) && corrects === '') errors.corrects = 'negative'
  if (ctx.booking && mode !== null && NEEDS_LINES.includes(mode) && !lines.some((line) => line.base !== 0)) errors.base23 = errors.base23 ?? 'lines'
  // The last customer of triangular trade pays the VAT itself: a base at 0 % alone would report nothing.
  if (ctx.booking && mode === 'triangle_in' && lines.length > 0 && !lines.some((line) => line.rate > 0)) errors.base23 = errors.base23 ?? 'lines'
  // Triangular trade is between VAT numbers of three member states: the other side's is of another one than Slovakia.
  if (ctx.booking && mode !== null && isTriangle(mode) && (!vatId || vatId.startsWith('SK') || !isEuVatId(vatId))) errors.vatId = errors.vatId ?? 'euId'
  // A deduction from a Slovak supplier's invoice goes into the control statement by the supplier's VAT number (B.2).
  if (ctx.booking && mode === 'domestic' && ctx.kind === 'invoice_in' && lines.some((line) => line.deduct !== 0) && !isSkVatId(vatId)) errors.vatId = errors.vatId ?? 'supplierId'
  if (Object.keys(errors).length > 0 || !mode) return { values, data: null, errors }
  return { values, data: { mode, lines, suppliedOn: supplied || null, vatId, corrects: corrects || null, period: values.period || null, ...(reverseOut ? { reverse } : {}) }, errors }
}

/** The periods offered for a document: three before and three after the one its dates give, and the one it has. */
export function periodsAround(natural: string, current: string | null, next: (p: string) => string, prev: (p: string) => string): string[] {
  const out: string[] = []
  let p = natural
  for (let i = 0; i < 3; i++) p = prev(p)
  for (let i = 0; i < 7; i++) {
    out.push(p)
    p = next(p)
  }
  if (current && !out.includes(current)) out.push(current)
  return out.sort()
}
