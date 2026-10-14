// The part of the booking form where the accountant confirms how VAT falls on a document: the mode, the day of
// supply, the other side's VAT number, the invoice a corrective one corrects, the period when it is not the one the
// dates give, and the base and VAT of each rate. Pure: the route reads the form with `readVat` and stores what comes
// back; `vatValues` writes a document's VAT back into the form. Errors are codes; the page says them in words.
import { dayOfText, textDay } from './booking'
import { centsOf } from './invoices'
import type { DocKind } from './match'
import { ISSUED_MODES, RECEIVED_MODES, isIssued, isPeriod, isReceived, isSkVatId, plainVatId, vatCountry, type VatData, type VatLine, type VatMode } from './vat'

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
}

export type VatErrorCode = 'amount' | 'base' | 'negative' | 'lines' | 'id' | 'supplierId' | 'noTax' | 'zeroOnly' | 'mode' | 'date' | 'period'
export type VatField = 'mode' | 'supplied' | 'vatId' | 'corrects' | 'period' | `base${FormRate}` | `tax${FormRate}`
export type VatErrors = Partial<Record<VatField, VatErrorCode>>

/** What VAT is reported by the mode: taxed (with VAT), or the base alone (supplied without VAT), or nothing. */
const TAXED: readonly VatMode[] = ['domestic', 'reverse', 'acquisition']
const BASE_ONLY: readonly VatMode[] = ['eu_goods', 'eu_service', 'export', 'exempt', 'outside']
/** The modes whose lines go into the return, so that booking without them is a mistake. */
const NEEDS_LINES: readonly VatMode[] = ['domestic', 'reverse', 'acquisition', 'eu_goods', 'export', 'exempt']

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
  return {
    mode: data.mode,
    supplied: data.suppliedOn ? textDay(data.suppliedOn) : '',
    vatId: data.vatId ?? '',
    corrects: data.corrects ?? '',
    period: data.period ?? '',
    base,
    tax,
  }
}

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

  const lines: VatLine[] = []
  const taxed = mode !== null && TAXED.includes(mode)
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
    if (rate !== 0 && mode !== null && BASE_ONLY.includes(mode)) {
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
  // A deduction from a Slovak supplier's invoice goes into the control statement by the supplier's VAT number (B.2).
  if (ctx.booking && mode === 'domestic' && ctx.kind === 'invoice_in' && lines.some((line) => line.deduct !== 0) && !isSkVatId(vatId)) errors.vatId = errors.vatId ?? 'supplierId'
  if (Object.keys(errors).length > 0 || !mode) return { values, data: null, errors }
  return { values, data: { mode, lines, suppliedOn: supplied || null, vatId, corrects: corrects || null, period: values.period || null }, errors }
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
