// The VAT return (daňové priznanie k DPH) and the control statement (kontrolný výkaz) of one period, worked out
// from the company's booked documents. Pure functions: what is stored and shown is in store.ts and the team's
// pages, the files the Financial Administration takes are written by vat-xml.ts, and every rule here is checked in
// test/units.test.mjs against the official schemas (test/xsd).
//
// The rules follow the forms as they stand (read on 14 October 2026 in the Financial Administration's eForm
// packages): DPHv25, the return for periods from 1 July 2025 (vzor MF/007833/2025-731, with its poučenie), and
// KVDPHv25, the control statement for periods from 1 January 2025 (the control statement ends on 1 July 2030, when
// e-invoices report themselves). Rates since 1 January 2025: 23 % basic (§ 27(1)), 19 % (§ 27(2)) and 5 %
// (§ 27(3)) reduced; the form's rows take them in that order: 19 % first, then 5 %, then 23 %.
//
// What is built, said plainly, and what is left to the accountant (the page lists it as such, never silently):
// - Supplies at home with Slovak VAT (rows 01 to 04; A.1 to a business, D.2 to a consumer), received invoices and
//   receipts with VAT deducted (rows 18 to 21; B.2, B.3.1 or B.3.2), services and goods from abroad on which the
//   company pays the VAT itself (rows 05 to 10b with the deduction; B.1), supplies of goods to the EU, exports and
//   exempt supplies (rows 13 to 15), corrective invoices (rows 24, 25 and 28; C.1, C.2), the result (rows 17, 32,
//   33, 35), supplies with domestic reverse charge issued (§ 69(12), A.2 alone, no row: KVDPH's instructions of
//   2021 on part A.2 and podnikajte.sk, 18 October 2026). A company registered only under § 7a files the return
//   alone, with no deduction (rows 05 to 10b, 17, 32, 35) and no control statement.
// - Imports of goods (18 October 2026, read in the poučenie to DPHv25, MF/007833/2025-731, points 30a, 30b, 38, 38a,
//   and FR SR's information 8/DPH/2025/IM on § 84a): VAT paid to the customs office is deducted in rows 18 to 19 and,
//   of them, rows 22, 22a and 23 (19, 5 and 23 %), by the document the customs office confirmed (`import`); an
//   importer with the status of an authorised economic operator declares the VAT itself in the return (§ 84a(3), from
//   1 July 2025, in the period the customs declaration was accepted): rows 11c to 11e and 12c to 12e, row 13 for an
//   exempt import, corrections in rows 24 and 25, the deduction in rows 18 to 19 and, of them, 23a to 23c
//   (`import84a`). Neither is reported in the control statement (§ 78a asks for none), and a return whose only content
//   is VAT deducted on imports needs no control statement (KVDPH's instructions of 2021).
// - Takings of an eKasa till (18 October 2026; takings.ts): the day's takings by rate, in rows 01 to 04 (row 13 for
//   what is exempt) and, as one total of the period, in D.1 of the control statement (the turnover of all tills, the
//   base and VAT at the basic rate and at the reduced ones), not in A.1 or D.2.
// - The proportional deduction (§ 50, 18 October 2026; vat-ratio.ts): a document deducted in proportion carries the
//   coefficient's deduction in its lines; the year's settlement goes into rows 18 to 19 of its last period.
// - Not built: triangular trade (rows 11 to 12b), bad debts (§ 25a, § 53b), documents in another currency without their
//   euro amounts.
import { CATEGORIES, type Category } from './booking'
import type { DocKind } from './match'
import { eurOf } from './fx'

/**
 * How VAT falls on a document. Received: `domestic` (a Slovak payer charged VAT), `reverse` (a service, or goods
 * with the place of supply at home, from a foreign person: the company pays the VAT, § 69(2) and (3)),
 * `acquisition` (goods from another member state, § 11). Issued: `domestic` (Slovak VAT charged), `eu_goods`
 * (§ 43), `eu_service` (the place of supply is in another member state and the customer pays the VAT, § 15(1)),
 * `export` (§ 47), `exempt` (§ 28 to 42), `outside` (the place of supply is outside the EU), `oss` (goods sold at a
 * distance or services to consumers in another member state, its VAT declared in the one-stop shop, oss.ts). `none`:
 * no VAT to report at all (a supplier who is no payer, an exempt purchase, or a company not registered).
 */
export type VatMode = 'domestic' | 'reverse' | 'acquisition' | 'import' | 'import84a' | 'eu_goods' | 'eu_service' | 'export' | 'exempt' | 'outside' | 'oss' | 'none'

/**
 * Received, besides: `import` (goods imported, the VAT paid to the customs office and deducted by its confirmed
 * document), `import84a` (goods imported by an authorised economic operator, its VAT declared in the return, § 84a(3)).
 */
export const RECEIVED_MODES: readonly VatMode[] = ['domestic', 'reverse', 'acquisition', 'import', 'import84a', 'none']
export const ISSUED_MODES: readonly VatMode[] = ['domestic', 'reverse', 'eu_goods', 'eu_service', 'export', 'exempt', 'outside', 'oss', 'none']

/**
 * An issued supply with domestic reverse charge (§ 69(12): the customer, a Slovak payer, pays the VAT), as the control
 * statement's A.2 asks of it (KVDPH's instructions, part A.2): the letter of § 69(12) it falls under, f crops and g
 * metals with the four digits of their code in the customs tariff, h mobile phones (MT) and i integrated circuits (IO)
 * from a base of 5 000 €, each of them with its quantity and unit, j construction work alone; the letters a to e
 * (scrap, emission allowances, buildings, collateral) are reported by the customer alone.
 */
export type ReverseKind = 'f' | 'g' | 'h' | 'i' | 'j' | 'other'
export const REVERSE_KINDS: readonly ReverseKind[] = ['j', 'g', 'f', 'h', 'i', 'other']
export const A2_UNITS = ['kg', 't', 'm', 'ks'] as const
export type A2Unit = (typeof A2_UNITS)[number]
export interface ReverseGoods {
  kind: ReverseKind
  /** The four digits of the customs tariff (f, g). */
  code: string | null
  /** The quantity in hundredths of its unit (f to i). */
  quantity: number | null
  unit: A2Unit | null
}
/** From 5 000 € of an invoice's base the supplies of h and i are reverse charged (§ 69(12)(h), (i)). */
export const REVERSE_THRESHOLD = 500_000
export const isReverseKind = (value: unknown): value is ReverseKind => typeof value === 'string' && (REVERSE_KINDS as readonly string[]).includes(value)
export const isA2Unit = (value: unknown): value is A2Unit => typeof value === 'string' && (A2_UNITS as readonly string[]).includes(value)

/** A reverse-charged supply's details as stored (documents.vat_reverse, invoices.vat_reverse); null when none. */
export function reverseOf(raw: unknown): ReverseGoods | null {
  if (typeof raw !== 'string') return null
  try {
    const o = JSON.parse(raw) as Record<string, unknown>
    if (!isReverseKind(o.kind)) return null
    return {
      kind: o.kind,
      code: typeof o.code === 'string' && /^\d{4}$/.test(o.code) ? o.code : null,
      quantity: typeof o.quantity === 'number' && Number.isInteger(o.quantity) && o.quantity > 0 ? o.quantity : null,
      unit: isA2Unit(o.unit) ? o.unit : null,
    }
  } catch {
    return null
  }
}
export const RATES = [23, 19, 5] as const

export function isVatMode(value: unknown): value is VatMode {
  return typeof value === 'string' && (RECEIVED_MODES.includes(value as VatMode) || ISSUED_MODES.includes(value as VatMode))
}

/** One rate of a document, in cents: the base, its VAT and, on a received document, the VAT deducted from it. */
export interface VatLine {
  rate: number
  base: number
  vat: number
  deduct: number
}

/** What the accountant confirmed about a document's VAT (stored with it), or what is proposed until she does. */
export interface VatData {
  mode: VatMode
  lines: VatLine[]
  /** The day of supply (dátum dodania), YYYY-MM-DD; the day of issue when the document names none. */
  suppliedOn: string | null
  /** The other side's VAT number (IČ DPH) as the document gives it: SK2020000000, IE6388047V. */
  vatId: string | null
  /** The number of the invoice this one corrects (opravná faktúra): its lines are then differences, a credit note's negative. */
  corrects: string | null
  /** The period the accountant put it in, when it is not the one the dates give. */
  period: string | null
  /** An issued supply with domestic reverse charge (`reverse`): what A.2 asks of it. */
  reverse?: ReverseGoods | null
  /** The member state of consumption of a supply in the one-stop shop (`oss`): AT, DE, EL, XI. */
  country?: string | null
}

export type VatStatus = 'payer' | 'reg7a' | 'none'

export interface VatCompany {
  status: VatStatus
  /** A payer may file for a calendar quarter; a person registered under § 7a always files for a month. */
  quarterly: boolean
  /** The day the registration took effect; documents before it are not the return's. */
  since: string | null
  /**
   * The proportional deduction (§ 50, vat-ratio.ts): each year the company deducts in proportion, its coefficient and,
   * once the accountant confirmed it, the year's settlement by rate, which goes into the year's last period.
   */
  ratios?: ReadonlyMap<number, { coef: number; settle: readonly { rate: number; settle: number }[] | null }>
}

export interface VatDoc {
  id: string
  kind: DocKind | null
  number: string | null
  party: string | null
  partyIco: string | null
  /** What the reader or the e-invoice gave, for a proposal: the other side's VAT number, the day of supply, the
   *  invoice a corrective one corrects and the base and VAT of each rate. */
  partyVatId?: string | null
  suppliedOn?: string | null
  corrects?: string | null
  lines?: { rate: number; base: number; vat: number }[]
  /** An invoice of ours: the mode its issuer declared (a supply to another member state, an export...). */
  modeHint?: VatMode | null
  /** An invoice of ours with domestic reverse charge: what its issuer said of the goods. */
  reverseHint?: ReverseGoods | null
  issuedOn: string | null
  /** The day the document reached us (Bratislava): a deduction cannot be claimed before it. */
  receivedOn: string
  totalCents: number | null
  vatCents: number | null
  currency: string | null
  /** The rate of a document in another currency, as confirmed (millionths of the currency for a euro). */
  rate?: number | null
  category: Category | null
  vatDeduct: boolean | null
  /** The reader's word that the supplier is based abroad. */
  foreign?: boolean | null
  booked: boolean
  /** What is stored; null until the accountant confirms a proposal. */
  vat: VatData | null
  /** The day's takings of an eKasa till (takings.ts): D.1 of the control statement, not A.1 or D.2. */
  takings?: boolean
  /** A received document deducted in proportion (§ 50, vat-ratio.ts): the coefficient its deduction was worked out by. */
  ratio?: number | null
  /** An issued document § 50(2) leaves out of the coefficient (the sale of property used for business, and the like). */
  ratioSkip?: boolean
}

// ---------------------------------------------------------------------------------------------------------------
// Periods
// ---------------------------------------------------------------------------------------------------------------

/** The period a day falls in: "2027-01" for a month, "2027-Q1" for a quarter. */
export function periodOf(day: string, quarterly: boolean): string {
  const year = day.slice(0, 4)
  const month = Number(day.slice(5, 7))
  return quarterly ? `${year}-Q${Math.ceil(month / 3)}` : `${year}-${String(month).padStart(2, '0')}`
}

export function isPeriod(text: string | null | undefined): text is string {
  return typeof text === 'string' && /^\d{4}-(0[1-9]|1[0-2]|Q[1-4])$/.test(text)
}

export const isQuarter = (period: string): boolean => period.includes('Q')

/** The first and the last day of a period. */
export function periodRange(period: string): { from: string; to: string } {
  const year = Number(period.slice(0, 4))
  const first = isQuarter(period) ? (Number(period.slice(6)) - 1) * 3 + 1 : Number(period.slice(5, 7))
  const last = isQuarter(period) ? first + 2 : first
  const lastDay = new Date(Date.UTC(year, last, 0)).getUTCDate()
  return { from: `${year}-${String(first).padStart(2, '0')}-01`, to: `${year}-${String(last).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}` }
}

export function nextPeriod(period: string): string {
  const year = Number(period.slice(0, 4))
  if (isQuarter(period)) {
    const q = Number(period.slice(6))
    return q === 4 ? `${year + 1}-Q1` : `${year}-Q${q + 1}`
  }
  const m = Number(period.slice(5, 7))
  return m === 12 ? `${year + 1}-01` : `${year}-${String(m + 1).padStart(2, '0')}`
}

export function prevPeriod(period: string): string {
  const year = Number(period.slice(0, 4))
  if (isQuarter(period)) {
    const q = Number(period.slice(6))
    return q === 1 ? `${year - 1}-Q4` : `${year}-Q${q - 1}`
  }
  const m = Number(period.slice(5, 7))
  return m === 1 ? `${year - 1}-12` : `${year}-${String(m - 1).padStart(2, '0')}`
}

const addDays = (day: string, days: number): string => new Date(Date.parse(`${day}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)

/** Easter Sunday of a year (the Gregorian computus, Meeus/Jones/Butcher). */
export function easter(year: number): string {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/**
 * Days off in Slovakia that a deadline can meet (dni pracovného pokoja), besides weekends and Easter: Act No. 241/1993
 * Z. z. as amended by Act No. 261/2025 Z. z. (in force from 1 November 2025, read on 14 October 2026 in its consolidated
 * text on slov-lex.sk). 1 September has not been a day off since 2024, nor has 17 November since 1 November 2025 (§ 2(3));
 * 8 May and 15 September are not days off in 2026 alone (the transitional § 4b), and are again from 2027 unless a later
 * act says otherwise.
 */
const FIXED_DAYS_OFF = ['01-01', '01-06', '05-01', '07-05', '08-29', '11-01', '12-24', '12-25', '12-26']

function isDayOff(day: string): boolean {
  const date = day.slice(5)
  const year = Number(day.slice(0, 4))
  if (FIXED_DAYS_OFF.includes(date)) return true
  if (date === '05-08' || date === '09-15') return year !== 2026
  if (date === '09-01') return year < 2024
  if (date === '11-17') return year < 2025
  return false
}

// Good Friday and Easter Monday of a year, and each day's answer, kept once worked out: a large company's pages ask
// for the same few days thousands of times.
const easterDays = new Map<number, readonly [string, string]>()
const workingDays = new Map<string, string>()

export function isWorkingDay(day: string): boolean {
  const weekday = new Date(`${day}T12:00:00Z`).getUTCDay()
  if (weekday === 0 || weekday === 6) return false
  if (isDayOff(day)) return false
  const year = Number(day.slice(0, 4))
  let holidays = easterDays.get(year)
  if (!holidays) {
    const sunday = easter(year)
    holidays = [addDays(sunday, -2), addDays(sunday, 1)] as const
    easterDays.set(year, holidays)
  }
  return day !== holidays[0] && day !== holidays[1]
}

/** The day itself when it is a working day, else the next working day (§ 27(2) of the Tax Procedure Code). */
export function workingDayFrom(day: string): string {
  const kept = workingDays.get(day)
  if (kept !== undefined) return kept
  let d = day
  while (!isWorkingDay(d)) d = addDays(d, 1)
  if (workingDays.size > 20000) workingDays.clear()
  workingDays.set(day, d)
  return d
}

/**
 * The last day to file the return and the control statement and to pay: 25 days after the period (§ 78(1),
 * § 78a(7)), moved to the next working day when it falls on a weekend or a day off (§ 27(2) of the Tax Procedure Code).
 */
export function filingDeadline(period: string): string {
  return workingDayFrom(addDays(periodRange(period).to, 25))
}

// ---------------------------------------------------------------------------------------------------------------
// What a document is, for VAT
// ---------------------------------------------------------------------------------------------------------------

export const isIssued = (kind: DocKind | null): boolean => kind === 'invoice_out'
export const isReceived = (kind: DocKind | null): boolean => kind === 'receipt' || kind === 'invoice_in'

/** A VAT number's country: "SK" of SK2020000000, "EL" of EL123456789; null when it is no VAT number. */
export function vatCountry(vatId: string | null | undefined): string | null {
  const plain = (vatId ?? '').replace(/[\s.-]/g, '').toUpperCase()
  const m = /^([A-Z]{2})[A-Z0-9]{2,13}$/.exec(plain)
  return m ? (m[1] ?? null) : null
}

/** A VAT number written the way the forms take it: no spaces, capitals. */
export const plainVatId = (vatId: string | null | undefined): string | null => {
  const plain = (vatId ?? '').replace(/[\s.-]/g, '').toUpperCase()
  return plain === '' ? null : plain
}

/** A Slovak VAT number: SK and ten digits. */
export const isSkVatId = (vatId: string | null | undefined): boolean => /^SK\d{10}$/.test(plainVatId(vatId) ?? '')

/** The member states' prefixes (Greece's is EL); a VAT number with another prefix is from a third country. */
const EU = new Set(['AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'EL', 'ES', 'FI', 'FR', 'HR', 'HU', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK', 'XI'])
export const isEuVatId = (vatId: string | null | undefined): boolean => {
  const country = vatCountry(vatId)
  return country !== null && EU.has(country)
}

/**
 * The rate a document's VAT was charged at, from its total and its VAT: 23, 19 or 5 when one of them gives that VAT
 * (to a cent, or half a per cent of a receipt's many lines rounded one by one); null when it is none of them, which
 * is a document with more rates for the accountant to split.
 */
export function rateOf(totalCents: number, vatCents: number): number | null {
  const base = totalCents - vatCents
  if (base <= 0 || vatCents <= 0) return null
  let best: { rate: number; off: number } | null = null
  for (const rate of RATES) {
    const off = Math.abs(vatCents - Math.round((base * rate) / 100))
    if (off <= Math.max(1, Math.round(vatCents * 0.005)) && (!best || off < best.off)) best = { rate, off }
  }
  return best?.rate ?? null
}

const vatAt = (base: number, rate: number): number => Math.round((base * rate) / 100)

/** Whether VAT on a received document is deducted, when the accountant has not said: the category's default. */
function deducts(doc: VatDoc): boolean {
  if (doc.vatDeduct !== null) return doc.vatDeduct
  return doc.category ? (CATEGORIES[doc.category]?.deduct ?? true) : true
}

/** A document's amounts in euros at its rate, each rounded to the cent. */
function inEuros(doc: VatDoc, rate: number): VatDoc {
  const eur = (cents: number) => eurOf(cents, rate)
  return {
    ...doc,
    currency: 'EUR',
    totalCents: doc.totalCents === null ? null : eur(doc.totalCents),
    vatCents: doc.vatCents === null ? null : eur(doc.vatCents),
    lines: (doc.lines ?? []).map((line) => ({ ...line, base: eur(line.base), vat: eur(line.vat) })),
  }
}

/**
 * What is proposed for a document until the accountant confirms it: the mode from who issued it and to whom, and
 * its lines from what the document breaks down by rate (an e-invoice always does), or else from its total and VAT.
 * A company that is not registered reports nothing; a person registered under § 7a reports only what it buys from
 * abroad, without a deduction. A corrective invoice keeps the signs it was read with (a credit note's are minus).
 */
export function proposeVat(given: VatDoc, company: VatCompany): VatData | null {
  if (!isIssued(given.kind) && !isReceived(given.kind)) return null
  // A document in another currency with its rate: proposed in euros (§ 26, the rate of the day before the liability).
  const doc = (given.currency ?? 'EUR') !== 'EUR' && given.rate ? inEuros(given, given.rate) : given
  const vatId = plainVatId(doc.partyVatId)
  const base: VatData = { mode: 'none', lines: [], suppliedOn: doc.suppliedOn ?? doc.issuedOn, vatId, corrects: doc.corrects ?? null, period: null }
  const total = doc.totalCents ?? 0
  const vat = doc.vatCents ?? 0
  const euro = (doc.currency ?? 'EUR') === 'EUR'
  const abroad = vatCountry(vatId) !== null && vatCountry(vatId) !== 'SK'
  const hinted = (doc.lines ?? []).filter((line) => line.base !== 0 || line.vat !== 0)
  if (company.status === 'none') return (abroad || Boolean(doc.foreign)) && isReceived(doc.kind) ? { ...base, mode: 'reverse' } : base
  if (isIssued(doc.kind)) {
    if (company.status !== 'payer') return base
    // A final invoice its advances paid whole: each rate's supply less the advances' comes to nought, its VAT was
    // declared on the advances' own tax documents, and it adds nothing to the return or the control statement.
    if (total === 0 && vat === 0 && hinted.length === 0 && (doc.lines ?? []).some((line) => line.rate > 0)) return base
    const lines = hinted.length > 0 ? hinted.map((line) => ({ ...line, deduct: 0 })) : linesOf(total, vat).map((line) => ({ ...line, deduct: 0 }))
    if (lines.some((line) => line.rate > 0)) return { ...base, mode: 'domestic', lines: lines.filter((line) => line.rate > 0 || line.base !== 0) }
    // An invoice issued here says how it is taxed; anything else is guessed from the customer's VAT number.
    const declared = given.modeHint && given.modeHint !== 'domestic' && ISSUED_MODES.includes(given.modeHint) ? given.modeHint : null
    const mode: VatMode = declared ?? (abroad && isEuVatId(vatId) ? 'eu_service' : abroad ? 'outside' : 'exempt')
    const untaxed = lines.reduce((sum, line) => sum + line.base, 0) || total
    return { ...base, mode, lines: untaxed !== 0 ? [{ rate: 0, base: untaxed, vat: 0, deduct: 0 }] : [], ...(mode === 'reverse' ? { reverse: given.reverseHint ?? null } : {}) }
  }
  const deduct = company.status === 'payer' && deducts(doc)
  if (Boolean(doc.foreign) || abroad || !euro) {
    // The supplier charged no Slovak VAT: the company pays it on the whole base, at the basic rate unless the accountant says otherwise.
    const amount = hinted.length > 0 ? hinted.reduce((sum, line) => sum + line.base, 0) : total
    if (!euro || amount === 0) return { ...base, mode: 'reverse' }
    const tax = vatAt(amount, 23)
    return { ...base, mode: 'reverse', lines: [{ rate: 23, base: amount, vat: tax, deduct: deduct ? tax : 0 }] }
  }
  if (company.status !== 'payer') return base
  const lines = (hinted.length > 0 ? hinted : linesOf(total, vat)).filter((line) => line.rate > 0)
  if (lines.length === 0) return vat > 0 ? { ...base, mode: 'domestic' } : base
  return { ...base, mode: 'domestic', lines: lines.map((line) => ({ rate: line.rate, base: line.base, vat: line.vat, deduct: deduct ? line.vat : 0 })) }
}

/** One line from a document's total and VAT when one rate gives that VAT; none when it takes more rates (or none at all). */
function linesOf(total: number, vat: number): { rate: number; base: number; vat: number }[] {
  if (vat === 0) return total !== 0 ? [{ rate: 0, base: total, vat: 0 }] : []
  const rate = rateOf(total, vat)
  return rate ? [{ rate, base: total - vat, vat }] : []
}

/** A document's VAT as it counts: what the accountant confirmed, or the proposal (said as such). */
export function vatOf(doc: VatDoc, company: VatCompany): { data: VatData; proposed: boolean } | null {
  if (doc.vat) return { data: doc.vat, proposed: false }
  const proposal = proposeVat(doc, company)
  return proposal ? { data: proposal, proposed: true } : null
}

/**
 * The day a document's VAT falls due (vznik daňovej povinnosti, or the right to deduct): the day of supply, or of
 * issue when it names none. Goods acquired from another member state, and goods supplied to one free of tax, fall
 * due on the 15th of the month after the acquisition or the supply, or on the day of the invoice when it was issued
 * before then (§ 20(1), § 19(8)).
 */
export function taxDay(doc: VatDoc, data: VatData): string {
  const supplied = data.suppliedOn ?? doc.issuedOn ?? doc.receivedOn
  if (data.mode !== 'acquisition' && data.mode !== 'eu_goods') return supplied
  const fifteenth = `${periodOf(addDays(`${supplied.slice(0, 7)}-28`, 7), false)}-15`
  if (!doc.issuedOn || doc.issuedOn >= fifteenth) return fifteenth
  // An invoice issued before the goods were acquired or supplied does not bring the tax before that.
  return doc.issuedOn > supplied ? doc.issuedOn : supplied
}

/**
 * The period a document is reported in. What is supplied, or bought from abroad, belongs to the period of its tax
 * day. A deduction from a Slovak supplier belongs there too when the document had reached us by that period's
 * deadline (§ 51(1)(a)); otherwise it moves to the period the document came in, and past a period already filed
 * when it came. The accountant may name another period.
 */
export function periodOfDoc(doc: VatDoc, data: VatData, company: VatCompany, filed: ReadonlyMap<string, string> = new Map()): string {
  if (data.period) return data.period
  const quarterly = company.status === 'payer' && company.quarterly
  const natural = periodOf(taxDay(doc, data), quarterly)
  // VAT paid to the customs office is deducted by the document the customs office confirmed, as an invoice (§ 51(1)(c)).
  if (!isReceived(doc.kind) || (data.mode !== 'domestic' && data.mode !== 'import')) return natural
  let period = doc.receivedOn > filingDeadline(natural) ? periodOf(doc.receivedOn, quarterly) : natural
  // A period filed before the document came is closed to it: the deduction goes into the next open one.
  for (let guard = 0; guard < 24; guard++) {
    const filedOn = filed.get(period)
    if (!filedOn || filedOn > doc.receivedOn) break
    period = nextPeriod(period)
  }
  return period
}

// ---------------------------------------------------------------------------------------------------------------
// The return
// ---------------------------------------------------------------------------------------------------------------

/** The rows of the return as the schema names them, in its order. */
export const ROWS = [
  'r01',
  'r01a',
  'r02',
  'r02a',
  'r03',
  'r04',
  'r05',
  'r05a',
  'r06',
  'r06a',
  'r07',
  'r08',
  'r09',
  'r09a',
  'r09b',
  'r10',
  'r10a',
  'r10b',
  'r11',
  'r11a',
  'r11b',
  'r11c',
  'r11d',
  'r11e',
  'r12',
  'r12a',
  'r12b',
  'r12c',
  'r12d',
  'r12e',
  'r13',
  'r14',
  'r15',
  'r16',
  'r17',
  'r18',
  'r18a',
  'r19',
  'r20',
  'r20a',
  'r21',
  'r22',
  'r22a',
  'r23',
  'r23a',
  'r23b',
  'r23c',
  'r24',
  'r25',
  'r26',
  'r27',
  'r28',
  'r29',
  'r30',
  'r31',
  'r32',
  'r33',
  'r34',
  'r35',
  'r36',
  'r37',
] as const
export type Row = (typeof ROWS)[number]
export type Rows = Record<Row, number>

/** The base and tax rows of each kind of supply, by rate. */
const SUPPLY_ROWS: Record<number, { base: Row; tax: Row }> = { 19: { base: 'r01', tax: 'r02' }, 5: { base: 'r01a', tax: 'r02a' }, 23: { base: 'r03', tax: 'r04' } }
const ACQUISITION_ROWS: Record<number, { base: Row; tax: Row }> = { 19: { base: 'r05', tax: 'r06' }, 5: { base: 'r05a', tax: 'r06a' }, 23: { base: 'r07', tax: 'r08' } }
const REVERSE_ROWS: Record<number, { base: Row; tax: Row }> = { 19: { base: 'r09', tax: 'r10' }, 5: { base: 'r09a', tax: 'r10a' }, 23: { base: 'r09b', tax: 'r10b' } }
const DEDUCT_ROWS: Record<number, Row> = { 19: 'r18', 5: 'r18a', 23: 'r19' }
const DOMESTIC_DEDUCT_ROWS: Record<number, Row> = { 19: 'r20', 5: 'r20a', 23: 'r21' }
/** Imports: the base and VAT an importer declares itself (§ 84a(3)), and what is deducted of VAT paid to customs and of VAT declared so. */
const IMPORT84A_ROWS: Record<number, { base: Row; tax: Row }> = { 19: { base: 'r11c', tax: 'r12c' }, 5: { base: 'r11d', tax: 'r12d' }, 23: { base: 'r11e', tax: 'r12e' } }
const IMPORT_DEDUCT_ROWS: Record<number, Row> = { 19: 'r22', 5: 'r22a', 23: 'r23' }
const IMPORT84A_DEDUCT_ROWS: Record<number, Row> = { 19: 'r23a', 5: 'r23b', 23: 'r23c' }
const TAX_ROWS: readonly Row[] = ['r02', 'r02a', 'r04', 'r06', 'r06a', 'r08', 'r10', 'r10a', 'r10b', 'r12', 'r12a', 'r12b', 'r12c', 'r12d', 'r12e', 'r16']

// ---------------------------------------------------------------------------------------------------------------
// The control statement
// ---------------------------------------------------------------------------------------------------------------

export interface KvA1 {
  odb: string | null
  f: string
  den: string
  z: number
  d: number
  s: number
  doc: string
}
export interface KvA2 {
  odb: string
  f: string
  den: string
  z: number
  tk: string | null
  td: 'MT' | 'IO' | null
  mn: number | null
  mj: A2Unit | null
  doc: string
}
export interface KvB1 {
  dod: string | null
  f: string
  den: string
  z: number
  d: number
  s: number
  o: number
  doc: string
}
export interface KvB2 {
  dod: string
  f: string
  den: string
  z: number
  d: number
  s: number
  o: number
  doc: string
}
export interface KvB3 {
  z: number
  d: number
  o: number
}
export interface KvB32 extends KvB3 {
  dod: string
}
export interface KvC1 {
  odb: string | null
  fo: string
  fp: string
  zr: number
  /** The VAT and the rate; none for a correction of a reverse-charged supply (the customer pays the VAT). */
  dr: number | null
  s: number | null
  /** A correction of a reverse-charged supply of goods: what A.2 says of them (only then present). */
  tk?: string | null
  td?: 'MT' | 'IO' | null
  mn?: number | null
  mj?: A2Unit | null
  doc: string
}
export interface KvC2 {
  dod: string | null
  fo: string
  fp: string
  zr: number
  dr: number
  s: number
  or: number
  doc: string
}
export interface KvD2 {
  z: number
  d: number
  zzn: number
  dzn: number
}
/** D.1: the takings of all the company's eKasa tills in the period, the turnover (with VAT) and the bases and VAT by rate. */
export interface KvD1 extends KvD2 {
  obrat: number
}

export interface Kv {
  a1: KvA1[]
  a2: KvA2[]
  b1: KvB1[]
  b2: KvB2[]
  b31: KvB3 | null
  b32: KvB32[]
  c1: KvC1[]
  c2: KvC2[]
  d1?: KvD1 | null
  d2: KvD2 | null
}

/** B.3.1 holds the simplified invoices' totals while the VAT deducted from them is under 3 000 €; from 3 000 € B.3.2, by supplier. */
export const B3_LIMIT = 300_000

// ---------------------------------------------------------------------------------------------------------------
// The period's result
// ---------------------------------------------------------------------------------------------------------------

export type IssueCode =
  | 'unbooked'
  | 'proposed'
  | 'mode'
  | 'lines'
  | 'rate'
  | 'currency'
  | 'supplierVatId'
  | 'simplifiedVatId'
  | 'number'
  | 'corrects'
  | 'needs7a'
  | 'summary'
  | 'deduct7a'
  | 'domestic7a'
  | 'mismatch'
  | 'before'
  | 'svVatId'
  | 'svMonthly'
  | 'svQuarterly'
  | 'svPeriodChange'
  | 'reverseCustomer'
  | 'reverseKind'
  | 'reverseGoods'
  | 'reverseThreshold'
  | 'reverseCorrection'
  | 'ratioSettle'

export interface Issue {
  /** A blocking issue keeps the files from being made; a warning is for the accountant to look at. */
  level: 'block' | 'warn'
  code: IssueCode
  doc: string | null
}

export interface PeriodResult {
  period: string
  rows: Rows
  kv: Kv
  /** Which documents make each row and each part of the control statement. */
  sources: Map<string, Set<string>>
  /** The documents the period holds, with the VAT they count with. */
  docs: { doc: VatDoc; data: VatData; proposed: boolean }[]
  issues: Issue[]
  /** Nothing to report: a payer files the return with "nevznikla daňová povinnosť". */
  nothing: boolean
  /**
   * Whether the control statement is filed (§ 78a(1)): by a payer for every return, also when none of its parts has
   * a line, except a nil return, one that holds only goods supplied to the EU (§ 43) or exported (§ 47) with no
   * deduction, and one of VAT deducted on imports alone; never when one of its parts has a line (a supply with domestic
   * reverse charge is in A.2 and in no row). A person registered under § 7a never files one.
   */
  statement: boolean
  /** Why a payer files no control statement: a nil return, goods to the EU or exports alone, imports' VAT deducted alone, or both. */
  skip?: 'nothing' | 'goods' | 'import' | 'goodsImport' | null
  /** The year's settlement of the proportional deduction in its last period (§ 50(4)), by rate, as it went into rows 18 to 19. */
  ratio?: { year: number; rates: { rate: number; settle: number }[] } | null
}

export const emptyRows = (): Rows => Object.fromEntries(ROWS.map((row) => [row, 0])) as Rows

/** An invoice's number as the control statement takes it: as printed, without spaces; "0" when there is none. */
export function kvNumber(number: string | null | undefined): string {
  const plain = (number ?? '').replace(/\s+/g, '')
  return plain === '' ? '0' : plain
}

/**
 * Works out a period: the documents it holds, the rows of the return, the parts of the control statement and what
 * keeps them from being filed. `docs` are all the company's documents that may fall in it (booked or not);
 * `filed` names the periods already filed, with the day each was filed; `carriedIn` is the excess deduction of the
 * period before that was not refunded under § 79(2), which a payer deducts from this period's own liability (row 34,
 * § 79(1); what it cannot deduct, the tax office refunds).
 */
/**
 * The documents each period's work-out looks at, by the same rules `workOut` applies to every document: one not
 * read yet by the period of its date, every other by the period its VAT falls in. Working out several periods of
 * one set of documents, each then reads only its own: the result is the same, but the documents are not all gone
 * through again for every period (the load test of 17 October 2026: a large company has thousands a month).
 */
export function vatDocsByPeriod(company: VatCompany, docs: VatDoc[], filed: ReadonlyMap<string, string> = new Map()): Map<string, VatDoc[]> {
  const payer = company.status === 'payer'
  const out = new Map<string, VatDoc[]>()
  const put = (period: string, doc: VatDoc) => {
    const list = out.get(period)
    if (list) list.push(doc)
    else out.set(period, [doc])
  }
  for (const doc of docs) {
    if (doc.kind === null && !doc.booked) {
      if (company.status !== 'none') put(periodOf(doc.issuedOn ?? doc.receivedOn, payer && company.quarterly), doc)
      continue
    }
    const counted = vatOf(doc, company)
    if (counted) put(periodOfDoc(doc, counted.data, company, filed), doc)
  }
  return out
}

export function workOut(company: VatCompany, period: string, docs: VatDoc[], filed: ReadonlyMap<string, string> = new Map(), carriedIn = 0): PeriodResult {
  const rows = emptyRows()
  const kv: Kv = { a1: [], a2: [], b1: [], b2: [], b31: null, b32: [], c1: [], c2: [], d1: null, d2: null }
  const sources = new Map<string, Set<string>>()
  const issues: Issue[] = []
  const held: PeriodResult['docs'] = []
  const payer = company.status === 'payer'
  const add = (row: Row, cents: number, doc: string) => {
    if (cents === 0) return
    rows[row] += cents
    const set = sources.get(row) ?? new Set<string>()
    set.add(doc)
    sources.set(row, set)
  }
  const note = (part: string, doc: string) => {
    const set = sources.get(part) ?? new Set<string>()
    set.add(doc)
    sources.set(part, set)
  }
  // Each issue once a document, found by its key (a list scanned for each would grow with the square of the documents).
  const issued = new Set<string>()
  const issue = (level: Issue['level'], code: IssueCode, doc: string | null) => {
    const key = `${code}\u0000${doc ?? ''}`
    if (issued.has(key)) return
    issued.add(key)
    issues.push({ level, code, doc })
  }
  const simplified: { doc: VatDoc; line: VatLine; vatId: string | null }[] = []
  const d2: KvD2 = { z: 0, d: 0, zzn: 0, dzn: 0 }
  const d1: KvD1 = { obrat: 0, z: 0, d: 0, zzn: 0, dzn: 0 }
  let consumers = false
  let tills = false

  for (const doc of docs) {
    // A document nobody has read yet may well be the period's: it keeps the period from being filed until it is.
    if (doc.kind === null && !doc.booked) {
      if (company.status !== 'none' && periodOf(doc.issuedOn ?? doc.receivedOn, payer && company.quarterly) === period) issue('block', 'unbooked', doc.id)
      continue
    }
    const counted = vatOf(doc, company)
    if (!counted) continue
    const { data, proposed } = counted
    if (periodOfDoc(doc, data, company, filed) !== period) continue
    if (company.since && taxDay(doc, data) < company.since) {
      issue('warn', 'before', doc.id)
      continue
    }
    held.push({ doc, data, proposed })
    if (company.status === 'none') {
      // Nothing is filed; a service from abroad needs a registration under § 7a before it is received, booked or not
      // (goods from the EU come under § 7, from 14 000 € a year).
      if (isReceived(doc.kind) && data.mode === 'reverse') issue('warn', 'needs7a', doc.id)
      continue
    }
    if (!doc.booked) {
      issue('block', 'unbooked', doc.id)
      continue
    }
    if (proposed && data.mode !== 'none') issue('warn', 'proposed', doc.id)
    const issued = isIssued(doc.kind)
    const correction = data.corrects !== null && data.corrects !== ''
    const vatId = plainVatId(data.vatId)
    const number = kvNumber(doc.number)
    const den = taxDay(doc, data)
    if ((doc.currency ?? 'EUR') !== 'EUR' && data.mode !== 'none' && data.lines.length === 0) issue('block', 'currency', doc.id)
    // The one-stop shop's supplies are taxed in the member state of consumption: its own return (oss.ts), not this one.
    if (data.mode === 'none' || data.mode === 'outside' || data.mode === 'oss') continue
    if (data.mode === 'eu_service') {
      issue('warn', 'summary', doc.id)
      continue
    }
    if (company.status === 'reg7a' && !(isReceived(doc.kind) && (data.mode === 'reverse' || data.mode === 'acquisition'))) {
      issue('warn', 'domestic7a', doc.id)
      continue
    }
    if (issued && data.mode === 'reverse') {
      // § 69(12): the customer pays the VAT; the supplier reports the supply in A.2 alone, in no row of the return.
      if (data.lines.length === 0) {
        issue('block', 'lines', doc.id)
        continue
      }
      if (data.lines.some((line) => line.vat !== 0)) {
        issue('block', 'mismatch', doc.id)
        continue
      }
      if (!vatId || !isSkVatId(vatId)) {
        issue('block', 'reverseCustomer', doc.id)
        continue
      }
      const r = data.reverse ?? null
      if (!r) {
        issue('block', 'reverseKind', doc.id)
        continue
      }
      if (r.kind === 'other') continue
      const z = data.lines.reduce((sum, line) => sum + line.base, 0)
      const goods = r.kind !== 'j'
      if (goods && (r.quantity === null || r.unit === null || ((r.kind === 'f' || r.kind === 'g') && r.code === null))) {
        issue('block', 'reverseGoods', doc.id)
        continue
      }
      if (correction) {
        // A corrective invoice of it: C.1 with the difference of the base, no VAT and no rate ("rozdiel sumy dane" and
        // "sadzba" are not filled for corrections of A.2), and for goods what A.2 says of them, the quantity as a
        // difference ("so znamienkom mínus", the control statement's instructions). The 5 000 € of phones and circuits
        // is the supply's, not the correction's. The accountant is asked to look at the quantity (a credit note for a
        // price alone changes none, while its lines carry one).
        const sign = z < 0 ? -1 : 1
        kv.c1.push({
          odb: vatId,
          fo: number,
          fp: kvNumber(data.corrects),
          zr: z,
          dr: null,
          s: null,
          tk: r.kind === 'f' || r.kind === 'g' ? r.code : null,
          td: r.kind === 'h' ? 'MT' : r.kind === 'i' ? 'IO' : null,
          mn: goods && r.quantity !== null ? sign * Math.abs(r.quantity) : null,
          mj: goods ? r.unit : null,
          doc: doc.id,
        })
        note('C1', doc.id)
        if (goods) issue('warn', 'reverseCorrection', doc.id)
        continue
      }
      if ((r.kind === 'h' || r.kind === 'i') && z < REVERSE_THRESHOLD) {
        issue('block', 'reverseThreshold', doc.id)
        continue
      }
      kv.a2.push({
        odb: vatId,
        f: number,
        den,
        z,
        tk: r.kind === 'f' || r.kind === 'g' ? r.code : null,
        td: r.kind === 'h' ? 'MT' : r.kind === 'i' ? 'IO' : null,
        mn: goods ? r.quantity : null,
        mj: goods ? r.unit : null,
        doc: doc.id,
      })
      note('A2', doc.id)
      continue
    }
    const taxed = data.mode === 'domestic' || data.mode === 'reverse' || data.mode === 'acquisition' || data.mode === 'import' || data.mode === 'import84a'
    const imported = !issued && (data.mode === 'import' || data.mode === 'import84a')
    if (data.lines.length === 0) {
      issue('block', 'lines', doc.id)
      continue
    }
    // A rate that is no Slovak one, or VAT on a supply that has none, is a mistake to put right first.
    if (data.lines.some((line) => line.rate !== 0 && !RATES.includes(line.rate as (typeof RATES)[number]))) {
      issue('block', 'rate', doc.id)
      continue
    }
    if (!taxed && data.lines.some((line) => line.vat !== 0)) {
      issue('block', 'mismatch', doc.id)
      continue
    }
    if (correction && number === '0') issue('block', 'number', doc.id)
    if (number.length > 32 && !doc.takings) issue('block', 'number', doc.id)
    if (data.mode === 'eu_goods' && issued) issue('warn', 'summary', doc.id)
    const business = Boolean(vatId || doc.partyIco)

    for (const line of data.lines) {
      const deduct = payer ? line.deduct : 0
      if (!payer && line.deduct !== 0) issue('warn', 'deduct7a', doc.id)
      if (taxed && line.rate === 0) {
        // The exempt part of a supply goes to row 13, and an exempt import an importer declares itself (§ 84a(3)); an
        // exempt purchase, or one from abroad, is not reported.
        if ((issued && data.mode === 'domestic') || data.mode === 'import84a') add('r13', line.base, doc.id)
        if (issued && doc.takings) {
          d1.obrat += line.base
          tills = true
          note('D1', doc.id)
        }
        continue
      }
      if (issued) {
        if (data.mode === 'domestic') {
          if (correction) {
            add('r24', line.base, doc.id)
            add('r25', line.vat, doc.id)
          } else {
            const target = SUPPLY_ROWS[line.rate]
            if (target) {
              add(target.base, line.base, doc.id)
              add(target.tax, line.vat, doc.id)
            }
          }
          if (doc.takings) {
            // The day's takings of a till: one total of the period in D.1, whoever bought.
            tills = true
            d1.obrat += line.base + line.vat
            if (line.rate === 23) {
              d1.z += line.base
              d1.d += line.vat
            } else {
              d1.zzn += line.base
              d1.dzn += line.vat
            }
            note('D1', doc.id)
          } else if (!business) {
            consumers = true
            if (line.rate === 23) {
              d2.z += line.base
              d2.d += line.vat
            } else {
              d2.zzn += line.base
              d2.dzn += line.vat
            }
            note('D2', doc.id)
          } else if (correction) {
            kv.c1.push({ odb: vatId, fo: number, fp: kvNumber(data.corrects), zr: line.base, dr: line.vat, s: line.rate, doc: doc.id })
            note('C1', doc.id)
          } else {
            kv.a1.push({ odb: vatId, f: number, den, z: line.base, d: line.vat, s: line.rate, doc: doc.id })
            note('A1', doc.id)
          }
        } else {
          // Supplies without Slovak VAT: their bases (and the corrections of them) in rows 13 to 15.
          add('r13', line.base, doc.id)
          if (data.mode === 'eu_goods') add('r14', line.base, doc.id)
          if (data.mode === 'export') add('r15', line.base, doc.id)
        }
        continue
      }
      // Received.
      if (imported) {
        // Imports: no line of the control statement (§ 78a asks for none).
        const self = data.mode === 'import84a'
        if (self) {
          if (correction) {
            add('r24', line.base, doc.id)
            add('r25', line.vat, doc.id)
          } else {
            const target = IMPORT84A_ROWS[line.rate]
            if (target) {
              add(target.base, line.base, doc.id)
              add(target.tax, line.vat, doc.id)
            }
          }
        }
        if (!payer) continue
        if (correction) {
          add('r28', -deduct, doc.id)
          continue
        }
        if (deduct === 0) continue
        add(DEDUCT_ROWS[line.rate] as Row, deduct, doc.id)
        add((self ? IMPORT84A_DEDUCT_ROWS : IMPORT_DEDUCT_ROWS)[line.rate] as Row, deduct, doc.id)
        continue
      }
      if (data.mode === 'domestic') {
        if (!payer) continue
        if (correction) {
          add('r28', -deduct, doc.id)
          kv.c2.push({ dod: vatId, fo: number, fp: kvNumber(data.corrects), zr: line.base, dr: line.vat, s: line.rate, or: deduct, doc: doc.id })
          note('C2', doc.id)
          continue
        }
        if (deduct === 0) continue
        add(DEDUCT_ROWS[line.rate] as Row, deduct, doc.id)
        add(DOMESTIC_DEDUCT_ROWS[line.rate] as Row, deduct, doc.id)
        if (doc.kind === 'receipt') {
          simplified.push({ doc, line: { ...line, deduct }, vatId })
          note('B3', doc.id)
        } else if (vatId && isSkVatId(vatId)) {
          kv.b2.push({ dod: vatId, f: number, den, z: line.base, d: line.vat, s: line.rate, o: deduct, doc: doc.id })
          note('B2', doc.id)
        } else {
          issue('block', 'supplierVatId', doc.id)
        }
        continue
      }
      // Reverse charge and acquisitions: the company pays the VAT, and (a payer) deducts it.
      if (correction) {
        add('r24', line.base, doc.id)
        add('r25', line.vat, doc.id)
        if (payer) {
          add('r28', -deduct, doc.id)
          kv.c2.push({ dod: vatId, fo: number, fp: kvNumber(data.corrects), zr: line.base, dr: line.vat, s: line.rate, or: deduct, doc: doc.id })
          note('C2', doc.id)
        }
        continue
      }
      const target = (data.mode === 'acquisition' ? ACQUISITION_ROWS : REVERSE_ROWS)[line.rate]
      if (target) {
        add(target.base, line.base, doc.id)
        add(target.tax, line.vat, doc.id)
      }
      if (payer) {
        add(DEDUCT_ROWS[line.rate] as Row, deduct, doc.id)
        kv.b1.push({ dod: vatId, f: number, den, z: line.base, d: line.vat, s: line.rate, o: deduct, doc: doc.id })
        note('B1', doc.id)
      }
    }
  }

  // B.3: simplified invoices as one total, or by supplier once the VAT deducted from them reaches 3 000 €.
  if (simplified.length > 0) {
    const total = simplified.reduce((sum, s) => ({ z: sum.z + s.line.base, d: sum.d + s.line.vat, o: sum.o + s.line.deduct }), { z: 0, d: 0, o: 0 })
    if (total.o < B3_LIMIT) kv.b31 = total
    else {
      const bySupplier = new Map<string, KvB32>()
      for (const s of simplified) {
        const dod = s.vatId && isSkVatId(s.vatId) ? s.vatId : null
        if (!dod) {
          issue('block', 'simplifiedVatId', s.doc.id)
          continue
        }
        const row = bySupplier.get(dod) ?? { dod, z: 0, d: 0, o: 0 }
        row.z += s.line.base
        row.d += s.line.vat
        row.o += s.line.deduct
        bySupplier.set(dod, row)
      }
      kv.b32 = [...bySupplier.values()]
    }
  }
  if (consumers) kv.d2 = d2
  if (tills) kv.d1 = d1

  // The year's last period settles its proportional deduction (§ 50(4)) in rows 18 to 19, by rate, once the accountant
  // confirmed it; until then it keeps the period back. The control statement has no line of it.
  let ratio: PeriodResult['ratio'] = null
  const year = Number(period.slice(0, 4))
  const yearRatio = payer && (period.endsWith('-12') || period.endsWith('-Q4')) ? company.ratios?.get(year) : undefined
  if (yearRatio) {
    if (!yearRatio.settle) issue('block', 'ratioSettle', null)
    else {
      ratio = { year, rates: yearRatio.settle.filter((r) => r.settle !== 0 && DEDUCT_ROWS[r.rate]).map((r) => ({ rate: r.rate, settle: r.settle })) }
      for (const r of ratio.rates) rows[DEDUCT_ROWS[r.rate] as Row] += r.settle
    }
  }

  // The result: row 17 is the tax, rows 32 to 35 what it comes to.
  rows.r17 = TAX_ROWS.reduce((sum, row) => sum + rows[row], 0)
  const result = rows.r17 - rows.r18 - rows.r18a - rows.r19 + rows.r25 + rows.r27 + rows.r28 + rows.r29 - rows.r30 - rows.r31
  if (payer) {
    if (result > 0) rows.r32 = result
    if (result < 0) rows.r33 = -result
    // Row 34 may not be higher than row 32 (poučenie, point 49).
    rows.r34 = Math.min(Math.max(0, carriedIn), rows.r32)
    rows.r35 = Math.max(0, rows.r32 - rows.r34)
  } else if (company.status === 'reg7a') {
    rows.r32 = result
    rows.r35 = Math.max(0, rows.r32 - rows.r34)
  }
  const nothing = ROWS.every((row) => rows[row] === 0)
  // § 78a(1)(b), read in the original on slov-lex (the version of 1 January 2026) on 18 October 2026: no control
  // statement for a return that holds only goods supplied free of tax under § 43 or § 47 (the return's rows 14 and 15
  // are all of row 13) with no deduction, or with VAT deducted on imports alone (§ 49(2)(d): rows 18 to 19 are all of
  // rows 22 to 23); the rest of the rows is the result it comes to. VAT deducted on imports alone is in the same case
  // (KVDPH's instructions of 2021).
  const RESULT_ROWS: readonly Row[] = ['r17', 'r32', 'r33', 'r34', 'r35', 'r36', 'r37']
  const QUIET: readonly Row[] = ['r13', 'r14', 'r15', 'r18', 'r18a', 'r19', 'r22', 'r22a', 'r23', ...RESULT_ROWS]
  const quiet =
    rows.r13 === rows.r14 + rows.r15 && rows.r18 === rows.r22 && rows.r18a === rows.r22a && rows.r19 === rows.r23 && ROWS.every((row) => rows[row] === 0 || QUIET.includes(row))
  const imported = rows.r18 + rows.r18a + rows.r19 > 0
  // A part of the control statement with a line is filed, whatever the rows (A.2 is in none).
  const skip: PeriodResult['skip'] = kvRows(kv) > 0 ? null : nothing ? 'nothing' : !quiet ? null : rows.r13 !== 0 && imported ? 'goodsImport' : imported ? 'import' : 'goods'
  return {
    period,
    rows,
    kv,
    sources,
    docs: held,
    issues: issues.sort((a, b) => (a.level === b.level ? 0 : a.level === 'block' ? -1 : 1)),
    nothing,
    statement: payer && skip === null,
    skip: payer ? skip : null,
    ratio,
  }
}

/** The amount to pay for a period (row 35) and the excess deduction to be refunded (row 33), in cents. */
export function outcome(rows: Rows): { pay: number; refund: number } {
  return { pay: Math.max(0, rows.r35), refund: Math.max(0, rows.r33) }
}

/** Whether the control statement has anything in it beyond the company's own details. */
export function kvRows(kv: Kv): number {
  return kv.a1.length + kv.a2.length + kv.b1.length + kv.b2.length + (kv.b31 ? 1 : 0) + kv.b32.length + kv.c1.length + kv.c2.length + (kv.d1 ? 1 : 0) + (kv.d2 ? 1 : 0)
}

// ---------------------------------------------------------------------------------------------------------------
// The refund of an excess deduction, and corrections of a period already filed
// ---------------------------------------------------------------------------------------------------------------

/**
 * Whether an excess deduction of the period can be refunded at once (§ 79(2)): the payer files for a month and has
 * been registered at least 12 calendar months before the end of that month. The third condition (no arrears of taxes,
 * customs and insurance over 1 000 € in the six months before) is the accountant's to confirm.
 */
export function fastRefundAllowed(company: VatCompany, period: string): boolean {
  if (company.status !== 'payer' || isQuarter(period) || !company.since) return false
  const end = periodRange(period).to
  const yearBefore = `${Number(end.slice(0, 4)) - 1}${end.slice(4)}`
  return company.since <= yearBefore
}

/** R: the regular return; O: a corrective one, filed before the deadline in its place (§ 16(3) of the Tax Procedure
 *  Code); D: a supplementary one, after the deadline (§ 16(1)). The control statement has the same three kinds. */
export type FilingKind = 'R' | 'O' | 'D'

/** The correction a filed period takes on a day: corrective while its deadline has not passed, supplementary after. */
export const correctionKind = (period: string, day: string): 'O' | 'D' => (day <= filingDeadline(period) ? 'O' : 'D')

/** A period's result as one figure: the own liability plus, an excess deduction minus (rows 32 and 33). */
export const signedResult = (rows: Rows): number => rows.r32 - rows.r33

export interface Settlement {
  /** Row 36: the difference against the last result filed. */
  r36: number
  /** Row 37: what is to be settled with the state budget; null when nothing is (the row stays empty). */
  r37: number | null
  /** What the period comes to after the correction: in all to pay, and in all to be refunded. */
  pay: number
  refund: number
}

/**
 * Rows 36 and 37 of a supplementary return, as the poučenie has them (points 51 and 52, read on 14 October 2026 in
 * its 2021 text, which the 2025 form keeps): row 36 is the difference against the last result filed, plus when the own
 * liability grows or an excess deduction shrinks, minus the other way; row 37 is what is to be settled with the state,
 * the same as row 36 unless the excess deduction filed has been neither refunded nor deducted yet: then a liability
 * that replaces it is paid in full (the poučenie's example: −60 becomes 760, row 36 +820, row 37 +760), and an excess
 * deduction that only changes settles nothing.
 */
export function settle(prev: { rows: Rows; pay: number; refund: number }, rows: Rows, excessSettled: boolean): Settlement {
  const before = signedResult(prev.rows)
  const after = signedResult(rows)
  const r36 = after - before
  let refund = prev.refund
  let r37: number | null
  if (before < 0 && !excessSettled) {
    // The excess deduction filed is still pending: it gives way to the new result rather than being settled.
    refund = Math.max(0, refund + before)
    r37 = after > 0 ? after : null
    if (after < 0) refund -= after
  } else r37 = r36 === 0 ? null : r36
  let pay = prev.pay + (r37 ?? 0)
  if (pay < 0) {
    refund -= pay
    pay = 0
  }
  return { r36, r37, pay, refund }
}

/** A correction code of the control statement: 1 takes back a line filed before, 2 brings a new or a right one. */
export type KvCode = 1 | 2
type Coded<T> = Omit<T, 'doc'> & { k?: KvCode }

/** The control statement as it is filed: every part a list, each line with its correction code in a supplementary one. */
export interface KvFile {
  a1: Coded<KvA1>[]
  a2: Coded<KvA2>[]
  b1: Coded<KvB1>[]
  b2: Coded<KvB2>[]
  b31: Coded<KvB3>[]
  b32: Coded<KvB32>[]
  c1: Coded<KvC1>[]
  c2: Coded<KvC2>[]
  d1: Coded<KvD1>[]
  d2: Coded<KvD2>[]
}

const KV_PARTS = ['a1', 'a2', 'b1', 'b2', 'b31', 'b32', 'c1', 'c2', 'd1', 'd2'] as const

/** A period's control statement as a file: the lines without the documents they come from. */
export function kvFileOf(kv: Kv): KvFile {
  const plain = <T extends { doc: string }>(lines: T[]) => lines.map(({ doc: _doc, ...line }) => line)
  return {
    a1: plain(kv.a1),
    // A statement worked out before A.2 was built has none.
    a2: plain(kv.a2 ?? []),
    b1: plain(kv.b1),
    b2: plain(kv.b2),
    b31: kv.b31 ? [{ ...kv.b31 }] : [],
    b32: kv.b32.map((line) => ({ ...line })),
    c1: plain(kv.c1),
    c2: plain(kv.c2),
    // A statement worked out before D.1 was built has none.
    d1: kv.d1 ? [{ ...kv.d1 }] : [],
    d2: kv.d2 ? [{ ...kv.d2 }] : [],
  }
}

export const kvFileLines = (file: KvFile): number => KV_PARTS.reduce((sum, part) => sum + file[part].length, 0)

/**
 * A supplementary control statement: the lines filed before that are no longer right, with code 1 (repeated as they
 * were filed), and the lines that are new or right now, with code 2; a line that stays as it was is not repeated
 * (the schema's KodOpravyType). A total of B.3.1 or D.2 that changed is two lines, the old one and the new one.
 */
export function kvDiff(before: KvFile, now: KvFile): KvFile {
  const out = { a1: [], a2: [], b1: [], b2: [], b31: [], b32: [], c1: [], c2: [], d1: [], d2: [] } as unknown as Record<(typeof KV_PARTS)[number], { k?: KvCode }[]>
  for (const part of KV_PARTS) {
    const key = (line: object) =>
      JSON.stringify(
        Object.entries(line)
          .filter(([name]) => name !== 'k')
          .sort(([a], [b]) => a.localeCompare(b)),
      )
    const left = new Map<string, number>()
    // A file kept before a part was built (A.2, D.1) has none of it.
    const was = (before[part] ?? []) as object[]
    const is = (now[part] ?? []) as object[]
    for (const line of is) left.set(key(line), (left.get(key(line)) ?? 0) + 1)
    const kept = new Map<string, number>()
    for (const line of was) {
      const k = key(line)
      if ((left.get(k) ?? 0) > (kept.get(k) ?? 0)) kept.set(k, (kept.get(k) ?? 0) + 1)
      else out[part].push({ ...line, k: 1 })
    }
    for (const line of is) {
      const k = key(line)
      if ((kept.get(k) ?? 0) > 0) kept.set(k, (kept.get(k) ?? 0) - 1)
      else out[part].push({ ...line, k: 2 })
    }
  }
  return out as unknown as KvFile
}
