// The proportional deduction of VAT (pomerné odpočítanie dane), for a company whose supplies are partly exempt from
// VAT (rent, financial services, insurance...) and which buys goods and services for both kinds. Read in the original
// on static.slov-lex.sk through the browser pane on 18 October 2026, Act No. 222/2004 Z. z. in its version of
// 1 January 2026:
// - § 49(4): goods and services used for supplies with the right to deduct and at once for supplies without it (exempt
//   under § 28 to 42, § 49(3)) are deducted in proportion, by § 50.
// - § 50(1): the tax times the coefficient, rounded up to two decimal places.
// - § 50(2): the coefficient is the value without VAT of the calendar year's supplies with the right to deduct over the
//   value without VAT of all the year's supplies; neither counts the sale of the business or of a part of it, the sale
//   of property used for business other than stock, financial services exempt under § 39 provided occasionally, or an
//   occasional transfer or lease of real estate.
// - § 50(3): during the year the coefficient of the year before; when it cannot be used, one estimated with the tax
//   office's consent.
// - § 50(4): after the year, the coefficient from the year's own figures and the tax deductible by it; the difference
//   against what the year's periods deducted is settled in the year's last period, in favour of the state or against it.
// The return's instructions (DPHv25): rows 18, 18a and 19 hold the deduction as § 50 gives it, and the year's
// settlement goes into the same rows of the year's last period. The control statement's (KVDPH): B.1, B.2 and B.3 carry
// the tax deducted after the coefficient; the settlement is in no line of it.
//
// How it is kept here:
// - The coefficient of a year (`vat_ratios`), as the accountant gives it: the year before's, or an estimate the tax
//   office consented to; in hundredths (0,74 is 74).
// - A received document used for both kinds is booked "pomerne": each line's deduction is its VAT times the coefficient
//   of the year its deduction falls in, rounded to the cent (`withRatio`); the document keeps the coefficient
//   (`documents.vat_ratio`). The books put the rest of its VAT into the cost, as any VAT not deducted.
// - An issued document whose taxation does not say its right to deduct is marked (`documents.ratio_mode`): 'skip' what
//   § 50(2) leaves out (the sale of property used for business, and the like), 'none' a supply abroad that would be
//   exempt at home and so gives no right (§ 49(6): insurance or financial services to a customer in the Union), 'right'
//   an exempt insurance or financial service that gives it (§ 49(3): to a customer outside the Union, or tied to an
//   export). A received correction of a document of a year already settled is deducted by that year's coefficient and
//   marked 'final': no later year's settlement takes it again.
// - The figures of a year settled are checked again wherever its last period is worked out (vat-ratio-store.ts): a
//   document of the year booked or changed since keeps that period back until the accountant settles it again.
// - After the year (`ratioWork`) the coefficient of the year's supplies and, rate by rate, the VAT of the documents
//   deducted in proportion times it, less what they deducted; confirmed by the accountant, kept with the year, added to
//   rows 18 to 19 of the year's last period (vat.ts) and booked on 31 December against 548 (ledger.ts; practices differ,
//   some book a gain to 648).
// The adjustment of investment property over five or twenty years (§ 54 to § 54d) is vat-assets.ts. Not built: a fiscal year (§ 50(5)),
// the settlement of a payer whose registration ends during the year.
import { isIssued, isReceived, periodOf, periodOfDoc, taxDay, vatOf, type VatCompany, type VatDoc, type VatLine } from './vat'

export type RatioHow = 'previous' | 'estimate'
export const isRatioHow = (value: unknown): value is RatioHow => value === 'previous' || value === 'estimate'

/** A document's own mark for the coefficient (see above): issued 'right', 'none', 'skip'; received 'final'. */
export type RatioMode = 'right' | 'none' | 'skip' | 'final'
export const ISSUED_RATIO_MODES: readonly RatioMode[] = ['right', 'none', 'skip']
export const isRatioMode = (value: unknown): value is RatioMode => value === 'right' || value === 'none' || value === 'skip' || value === 'final'

/** One rate of the year's settlement, in cents: the VAT of the documents deducted in proportion, what they deducted, what the year's coefficient gives, and the difference. */
export interface RatioRate {
  rate: number
  vat: number
  deducted: number
  due: number
  settle: number
}

/** The settlement of a year as the accountant confirmed it. */
export interface RatioSettled {
  coef: number
  numerator: number
  denominator: number
  rates: RatioRate[]
  /** The documents deducted in proportion. */
  docs: number
}

/** A company's coefficient of a year and, once confirmed, the year's settlement. */
export interface RatioYear {
  year: number
  coef: number
  how: RatioHow
  settled: RatioSettled | null
  settledAt: number | null
  settledByName: string | null
  /** The year's figures now differ from the settlement confirmed (vat-ratio-store.ts sets it where it checks). */
  stale?: boolean
}

/** The rates a deduction has rows for (vat.ts DEDUCT_ROWS). */
export const RATIO_RATES = [23, 19, 5] as const

/** The coefficient of a share in hundredths, rounded up to two decimal places (§ 50(1)); nought without supplies with the right. */
export function coefOfShare(numerator: number, denominator: number): number {
  if (denominator <= 0 || numerator <= 0) return 0
  if (numerator >= denominator) return 100
  return Math.floor((numerator * 100 + denominator - 1) / denominator)
}

/** The part of an amount the coefficient gives, rounded to the cent (a minus amount the same way as its plus one). */
export const ratioCents = (cents: number, coef: number): number => Math.sign(cents) * Math.round((Math.abs(cents) * coef) / 100)

/** A document's lines deducted in proportion: each line that deducts, its VAT times the coefficient. */
export const withRatio = (lines: readonly VatLine[], coef: number): VatLine[] => lines.map((line) => (line.deduct === 0 ? { ...line } : { ...line, deduct: ratioCents(line.vat, coef) }))

/** "0,74" of 74. */
export const coefText = (coef: number): string => `${Math.floor(coef / 100)},${String(coef % 100).padStart(2, '0')}`

/** A coefficient typed as the law writes it ("0,74", "1,00") or as a share ("74 %"); null when it is none. */
export function coefOf(text: string): number | null {
  const plain = text.replace(/\s/g, '').replace('.', ',')
  const decimal = /^([01])(?:,(\d{1,2}))?$/.exec(plain)
  if (decimal) {
    const value = Number(decimal[1]) * 100 + Number((decimal[2] ?? '').padEnd(2, '0'))
    return value <= 100 ? value : null
  }
  const share = /^(\d{1,3})%$/.exec(plain)
  if (share) {
    const value = Number(share[1])
    return value <= 100 ? value : null
  }
  return null
}

/** The last period of a year, where its settlement goes. */
export const lastPeriodOfYear = (year: number, quarterly: boolean): string => (quarterly ? `${year}-Q4` : `${year}-12`)

/** Whether a period is a year's last. */
export const isLastOfYear = (period: string): boolean => period.endsWith('-12') || period.endsWith('-Q4')

/** The year's figures for its settlement (pure): what goes into the coefficient and what is settled by it. */
export interface RatioWork {
  year: number
  /** The supplies with the right to deduct, and all supplies, without VAT, in cents. */
  numerator: number
  denominator: number
  coef: number
  /** The issued documents in the coefficient: with the right to deduct (at least one line), exempt alone, and left out by § 50(2). */
  deductible: string[]
  exempt: string[]
  skipped: string[]
  /** The received documents deducted in proportion. */
  proportional: string[]
  rates: RatioRate[]
  /** Documents of the year not booked yet: the coefficient is not the year's until they are. */
  unbooked: string[]
}

/**
 * Lines of an issued supply: which go into the numerator too (the right to deduct) and which into the denominator alone;
 * the document's own mark decides over its taxation.
 */
function supplyParts(mode: string, lines: readonly VatLine[], mark: RatioMode | null | undefined): { right: number; exempt: number } {
  let right = 0
  let exempt = 0
  if (mark === 'right' || mark === 'none') {
    const all = lines.reduce((sum, line) => sum + line.base, 0)
    return mark === 'right' ? { right: all, exempt: 0 } : { right: 0, exempt: all }
  }
  for (const line of lines) {
    if (mode === 'domestic') {
      if (line.rate > 0) right += line.base
      else exempt += line.base
    } else if (mode === 'exempt') exempt += line.base
    // A supply abroad, to another member state, exported, taxed in the one-stop shop or by the customer: the right to
    // deduct stays (§ 49(2) and (6), § 43, § 47).
    else if (mode === 'reverse' || mode === 'eu_goods' || mode === 'eu_service' || mode === 'triangle' || mode === 'export' || mode === 'outside' || mode === 'oss') right += line.base
  }
  return { right, exempt }
}

/**
 * The year's coefficient and settlement from its documents: the issued ones of the year's periods (booked; late
 * interest is no supply, and what § 50(2) leaves out is marked so), and the received ones deducted in proportion whose
 * deduction falls in the year. Documents before the registration took effect are not the return's, nor its.
 */
export function ratioWork(company: VatCompany, year: number, docs: readonly VatDoc[], filed: ReadonlyMap<string, string> = new Map()): RatioWork {
  const quarterly = company.status === 'payer' && company.quarterly
  const out: RatioWork = { year, numerator: 0, denominator: 0, coef: 0, deductible: [], exempt: [], skipped: [], proportional: [], rates: [], unbooked: [] }
  const vat = new Map<number, number>()
  const deducted = new Map<number, number>()
  const inYear = (period: string) => period.slice(0, 4) === String(year)
  for (const doc of docs) {
    if (doc.kind === null && !doc.booked) {
      if (inYear(periodOf(doc.issuedOn ?? doc.receivedOn, quarterly))) out.unbooked.push(doc.id)
      continue
    }
    const counted = vatOf(doc, company)
    if (!counted) continue
    const { data } = counted
    if (!inYear(periodOfDoc(doc, data, company, filed))) continue
    if (company.since && taxDay(doc, data) < company.since) continue
    if (!doc.booked) {
      if (isIssued(doc.kind) || isReceived(doc.kind)) out.unbooked.push(doc.id)
      continue
    }
    if (isIssued(doc.kind)) {
      if (doc.category === 'interest') continue
      if (doc.ratioMode === 'skip') {
        out.skipped.push(doc.id)
        continue
      }
      const parts = supplyParts(data.mode, data.lines, doc.ratioMode)
      if (parts.right === 0 && parts.exempt === 0) continue
      out.numerator += parts.right
      out.denominator += parts.right + parts.exempt
      ;(parts.right !== 0 ? out.deductible : out.exempt).push(doc.id)
      continue
    }
    // A correction deducted by an earlier year's settled coefficient is that year's, not this one's to settle.
    if (!isReceived(doc.kind) || doc.ratio === null || doc.ratio === undefined || doc.ratioMode === 'final') continue
    out.proportional.push(doc.id)
    for (const line of data.lines) {
      if (line.vat === 0 && line.deduct === 0) continue
      vat.set(line.rate, (vat.get(line.rate) ?? 0) + line.vat)
      deducted.set(line.rate, (deducted.get(line.rate) ?? 0) + line.deduct)
    }
  }
  out.coef = coefOfShare(out.numerator, out.denominator)
  for (const rate of RATIO_RATES) {
    const v = vat.get(rate) ?? 0
    const d = deducted.get(rate) ?? 0
    if (v === 0 && d === 0) continue
    const due = ratioCents(v, out.coef)
    out.rates.push({ rate, vat: v, deducted: d, due, settle: due - d })
  }
  return out
}

/** What a confirmed settlement keeps of the year's work. */
export const settledOf = (work: RatioWork): RatioSettled => ({ coef: work.coef, numerator: work.numerator, denominator: work.denominator, rates: work.rates, docs: work.proportional.length })

/** Whether the year's figures now are the ones confirmed. */
export function sameSettlement(a: RatioSettled, b: RatioSettled): boolean {
  return a.coef === b.coef && a.numerator === b.numerator && a.denominator === b.denominator && JSON.stringify(a.rates) === JSON.stringify(b.rates)
}

/** The year's settlement as one amount: plus, more deducted; minus, given back. */
export const settleTotal = (settled: RatioSettled): number => settled.rates.reduce((sum, r) => sum + r.settle, 0)

const int = (value: unknown): number | null => (typeof value === 'number' && Number.isInteger(value) ? value : null)

/** A stored settlement read back; null when it is none. */
export function settledFrom(value: unknown): RatioSettled | null {
  if (!value || typeof value !== 'object') return null
  const v = value as Record<string, unknown>
  const coef = int(v.coef)
  const numerator = int(v.numerator)
  const denominator = int(v.denominator)
  if (coef === null || coef < 0 || coef > 100 || numerator === null || denominator === null || !Array.isArray(v.rates)) return null
  const rates: RatioRate[] = []
  for (const r of v.rates as unknown[]) {
    if (!r || typeof r !== 'object') return null
    const x = r as Record<string, unknown>
    const rate = int(x.rate)
    const fields = [int(x.vat), int(x.deducted), int(x.due), int(x.settle)]
    if (rate === null || !(RATIO_RATES as readonly number[]).includes(rate) || fields.some((f) => f === null)) return null
    rates.push({ rate, vat: fields[0] as number, deducted: fields[1] as number, due: fields[2] as number, settle: fields[3] as number })
  }
  return { coef, numerator, denominator, rates, docs: int(v.docs) ?? 0 }
}

/** The company's years as stored (the JSON array COMPANY_COLUMNS makes of `vat_ratios`); what is not one is left out. */
export function ratiosOf(json: unknown): RatioYear[] {
  if (typeof json !== 'string') return []
  try {
    const value = JSON.parse(json) as unknown
    if (!Array.isArray(value)) return []
    const out: RatioYear[] = []
    for (const item of value as unknown[]) {
      if (!item || typeof item !== 'object') continue
      const r = item as Record<string, unknown>
      const year = int(r.year)
      const coef = int(r.coef)
      if (year === null || coef === null || coef < 0 || coef > 100 || !isRatioHow(r.how)) continue
      out.push({ year, coef, how: r.how, settled: settledFrom(r.settled), settledAt: int(r.settledAt), settledByName: typeof r.settledBy === 'string' ? r.settledBy : null })
    }
    return out.sort((a, b) => a.year - b.year)
  } catch {
    return []
  }
}
