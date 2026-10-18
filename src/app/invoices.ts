// Invoices a client issues, as SuperFaktúra, Fakturoid and Pennylane issue them: a form, a number of its own in
// an unbroken row per year, a page the customer opens from an email, an e-invoice (UBL 2.1, Peppol BIS Billing
// 3.0) to download, and the invoice is a document of the company at once, so that the payment that pays it is
// paired with it by its variable symbol and the invoice says "zaplatená" by itself.
import { now } from '../db'
import type { Company } from './store'
import { splitAddress } from './address'
import { isA2Unit, isEuVatId, isReverseKind, reverseOf, type ReverseGoods } from './vat'
import { eurOf, isCurrency, rateMicro } from './fx'

export const VAT_RATES = [23, 19, 5, 0] as const

/**
 * How an invoice of a VAT payer is taxed (invoices.vat_mode): Slovak VAT at its rates, or a supply without it: goods
 * to a VAT payer of another member state (§ 43 of the VAT Act), a service whose customer in another member state pays
 * the VAT (§ 15(1)), an export (§ 47), a supply whose place is outside Slovakia.
 */
export type InvoiceMode = 'domestic' | 'reverse' | 'eu_goods' | 'eu_service' | 'export' | 'outside'
export const INVOICE_MODES: readonly InvoiceMode[] = ['domestic', 'reverse', 'eu_goods', 'eu_service', 'export', 'outside']
export const isInvoiceMode = (value: unknown): value is InvoiceMode => typeof value === 'string' && (INVOICE_MODES as readonly string[]).includes(value)

/**
 * What an invoice without Slovak VAT says, as § 74(1) of the VAT Act asks (that the supply is exempt, or "prenesenie
 * daňovej povinnosti" when the customer pays the tax), and its category and exemption code in EN 16931 (VATEX).
 */
export const MODE_TERMS: Record<Exclude<InvoiceMode, 'domestic'>, { text: string; category: 'K' | 'AE' | 'G' | 'O'; code: string }> = {
  reverse: { text: 'Prenesenie daňovej povinnosti', category: 'AE', code: 'VATEX-EU-AE' },
  eu_goods: { text: 'Dodanie je oslobodené od dane podľa § 43 zákona o DPH (dodanie tovaru do iného členského štátu).', category: 'K', code: 'VATEX-EU-IC' },
  eu_service: { text: 'Prenesenie daňovej povinnosti', category: 'AE', code: 'VATEX-EU-AE' },
  export: { text: 'Dodanie je oslobodené od dane podľa § 47 zákona o DPH (vývoz tovaru).', category: 'G', code: 'VATEX-EU-G' },
  outside: { text: 'Miesto dodania nie je v tuzemsku: dodanie nie je predmetom slovenskej dane.', category: 'O', code: 'VATEX-EU-O' },
}
export const UNITS = ['ks', 'hod', 'deň', 'mes', 'kg', 't', 'm', 'km', 'm²', 'bal'] as const

/** UN/ECE Recommendation 20 codes for the units an invoice line may have. */
const UNIT_CODES: Record<string, string> = { ks: 'C62', hod: 'HUR', deň: 'DAY', mes: 'MON', kg: 'KGM', t: 'TNE', m: 'MTR', km: 'KMT', 'm²': 'MTK', bal: 'XPK' }

export interface LineInput {
  description: string
  quantity: string
  unit: string
  price: string
  vat: string
}

export interface InvoiceValues {
  customerName: string
  customerAddress: string
  customerIco: string
  customerDic: string
  customerIcdph: string
  customerEmail: string
  issued: string
  delivered: string
  due: string
  iban: string
  note: string
  lines: LineInput[]
  /** A credit note: the issued invoice it corrects (its id), and why. */
  corrects?: string
  reason?: string
  /** How a VAT payer's invoice is taxed; Slovak VAT when not said. */
  mode?: InvoiceMode
  /** Domestic reverse charge: the letter of § 69(12) and, for crops and metals, the tariff's code. */
  reverseKind?: string
  reverseCode?: string
  /** A request for an advance (zálohová faktúra). */
  proforma?: boolean
  /** A final invoice: the request for an advance whose advances it deducts. */
  relates?: string
  /** The currency it is issued in (euros when not said), and the rate typed for it ("1,0845"; else the ECB's). */
  currency?: string
  rate?: string
}

/**
 * The currencies an invoice may be issued in: the euro and every currency the ECB declares a reference rate of (its
 * list of 2026; the lev went with Bulgaria's euro on 1 January 2026).
 */
export const INVOICE_CURRENCIES = [
  'EUR', 'CZK', 'USD', 'GBP', 'CHF', 'PLN', 'HUF', 'SEK', 'DKK', 'NOK', 'RON', 'JPY', 'CAD', 'AUD', 'CNY', 'TRY', 'ISK', 'BRL', 'HKD', 'IDR', 'ILS', 'INR',
  'KRW', 'MXN', 'MYR', 'NZD', 'PHP', 'SGD', 'THB', 'ZAR',
] as const
export const isInvoiceCurrency = (v: unknown): v is string => typeof v === 'string' && (INVOICE_CURRENCIES as readonly string[]).includes(v)

export interface Line {
  position: number
  description: string
  quantityMilli: number
  unit: string | null
  unitCents: number
  vatRate: number
  baseCents: number
  /**
   * The VAT a line carries of its own instead of a share of its rate's: the tax in an advance received (the payment
   * less its base) and that tax deducted again on the final invoice. Never typed; null on every other line.
   */
  vatCents?: number | null
}

export interface Totals {
  base: number
  vat: number
  total: number
  /** Base and VAT for each rate, the highest rate first. */
  rates: { rate: number; base: number; vat: number }[]
}

/** "12,40", "1 200" or "-5" in cents; null when empty, NaN when it is no amount. */
export function centsOf(text: string): number | null {
  const plain = text.replace(/[\s €]/g, '')
  if (plain === '') return null
  const m = /^(-?)(\d{1,9})(?:[,.](\d{1,2}))?$/.exec(plain)
  if (!m) return Number.NaN
  const cents = Number(m[2]) * 100 + Number((m[3] ?? '').padEnd(2, '0'))
  return m[1] === '-' ? -cents : cents
}

/** "1", "2,5" or "0,25" in thousandths; null when empty, NaN when it is no quantity. */
export function milliOf(text: string): number | null {
  const plain = text.replace(/\s/g, '')
  if (plain === '') return null
  const m = /^(\d{1,6})(?:[,.](\d{1,3}))?$/.exec(plain)
  return m ? Number(m[1]) * 1000 + Number((m[2] ?? '').padEnd(3, '0')) : Number.NaN
}

/** A line's base: quantity times the unit price, to the cent. */
export function lineBase(quantityMilli: number, unitCents: number): number {
  return Math.round((quantityMilli * unitCents) / 1000)
}

/** The sums of an invoice. VAT is counted per rate from the sum of its lines, as the VAT Act counts it. */
export function totalsOf(lines: Pick<Line, 'baseCents' | 'vatRate' | 'vatCents'>[], vatPayer: boolean): Totals {
  const byRate = new Map<number, { base: number; free: number; own: number }>()
  for (const line of lines) {
    const rate = vatPayer ? line.vatRate : 0
    const r = byRate.get(rate) ?? { base: 0, free: 0, own: 0 }
    r.base += line.baseCents
    // A line with VAT of its own (an advance's tax, its deduction) adds that; the rest of the rate is counted on its base.
    if (rate > 0 && typeof line.vatCents === 'number') r.own += line.vatCents
    else r.free += line.baseCents
    byRate.set(rate, r)
  }
  // A credit note's VAT mirrors the invoice's: rounded on the amount, then given its sign.
  const rates = [...byRate]
    .map(([rate, r]) => ({ rate, base: r.base, vat: Math.sign(r.free) * Math.round((Math.abs(r.free) * rate) / 100) + r.own }))
    .sort((a, b) => b.rate - a.rate)
  const base = rates.reduce((sum, r) => sum + r.base, 0)
  const vat = rates.reduce((sum, r) => sum + r.vat, 0)
  return { base, vat, total: base + vat, rates }
}

/**
 * What A.2 asks of a reverse-charged invoice, from its form and lines: the letter, the code (crops, metals) and, for
 * goods, the quantity of its lines when they share a unit A.2 takes (kg, t, m, ks); without one the accountant adds it.
 */
export function reverseGoodsOf(values: InvoiceValues, lines: Pick<Line, 'quantityMilli' | 'unit'>[]): ReverseGoods | null {
  if (values.mode !== 'reverse' || !isReverseKind(values.reverseKind)) return null
  const kind = values.reverseKind
  const goods = kind !== 'j' && kind !== 'other'
  const units = new Set(lines.map((l) => l.unit))
  const unit = goods && units.size === 1 ? [...units][0] : null
  return {
    kind,
    code: kind === 'f' || kind === 'g' ? (values.reverseCode ?? '').replace(/\s/g, '') || null : null,
    quantity: goods && isA2Unit(unit) ? Math.round(lines.reduce((sum, l) => sum + l.quantityMilli, 0) / 10) : null,
    unit: goods && isA2Unit(unit) ? unit : null,
  }
}

/**
 * The tax document of an advance received (§ 73): the payment split by the request's rates in proportion to what each
 * rate asks with its VAT, the last rate taking what rounding leaves. Each part is the base and the VAT in it: the base
 * the part divided by one and the rate, to the cent, the VAT what is left, so the document makes exactly the payment
 * (the tax base of a payment received is the payment less the tax, § 22; POHODA's worked examples of § 19(4) count it
 * so: 1 000 € at 20 % is 833,33 € and 166,67 €).
 */
export function advanceLines(request: Pick<Line, 'baseCents' | 'vatRate' | 'vatCents'>[], paidCents: number, vatPayer: boolean, label: (rate: number) => string): Line[] {
  const rates = totalsOf(request, vatPayer).rates.filter((r) => r.base + r.vat > 0)
  const asked = rates.reduce((sum, r) => sum + r.base + r.vat, 0)
  if (rates.length === 0 || asked <= 0 || paidCents <= 0) return []
  let left = paidCents
  const out: Line[] = []
  rates.forEach((r, i) => {
    const gross = i === rates.length - 1 ? left : Math.min(left, Math.round((paidCents * (r.base + r.vat)) / asked))
    left -= gross
    if (gross <= 0) return
    const base = r.rate > 0 ? Math.round((gross * 100) / (100 + r.rate)) : gross
    out.push({
      position: out.length + 1,
      description: label(r.rate),
      quantityMilli: 1000,
      unit: null,
      unitCents: base,
      vatRate: r.rate,
      baseCents: base,
      vatCents: r.rate > 0 ? gross - base : null,
    })
  })
  return out
}

/**
 * A final invoice's deductions: each advance's tax document, rate by rate, as a minus line naming it, with the base and
 * the VAT of that document, so the final invoice's VAT is the whole supply's less what the advances declared, and the
 * advances and the final invoice together make exactly the supply's total.
 */
export function deductionLines(advances: { number: string | null; lines: Pick<Line, 'baseCents' | 'vatRate' | 'vatCents'>[] }[], from: number, label: (number: string) => string): Line[] {
  const out: Line[] = []
  for (const a of advances) {
    for (const r of totalsOf(a.lines, true).rates) {
      out.push({
        position: from + out.length,
        description: label(a.number ?? ''),
        quantityMilli: 1000,
        unit: null,
        unitCents: -r.base,
        vatRate: r.rate,
        baseCents: -r.base,
        vatCents: r.rate > 0 ? -r.vat : null,
      })
    }
  }
  return out
}

/** The final invoice issued to a request for an advance, if any (one at most: a unique index keeps it so). */
export async function finalOf(db: D1Database, company: string, request: string): Promise<{ id: string; number: string | null; totalCents: number } | null> {
  const row = await db
    .prepare("SELECT id, number, total_cents FROM invoices WHERE company_id = ? AND relates = ? AND kind = 'invoice' AND status = 'issued'")
    .bind(company, request)
    .first<Row>()
  return row ? { id: String(row.id), number: str(row.number), totalCents: Number(row.total_cents) } : null
}

/** The issued advances' tax documents of a request for an advance, with their lines. */
export async function advancesOf(db: D1Database, company: string, request: string): Promise<{ id: string; number: string | null; totalCents: number; deliveredOn: string; lines: Line[] }[]> {
  const rows = await db
    .prepare("SELECT id, number, total_cents, delivered_on FROM invoices WHERE company_id = ? AND relates = ? AND kind = 'advance' AND status = 'issued' ORDER BY seq")
    .bind(company, request)
    .all<Row>()
  return Promise.all(rows.results.map(async (r) => ({ id: String(r.id), number: str(r.number), totalCents: Number(r.total_cents), deliveredOn: String(r.delivered_on), lines: await invoiceLines(db, String(r.id)) })))
}

/** The payments that came on a request's variable symbol, and whether each has its advance's tax document yet. */
export async function advancePayments(db: D1Database, company: string, vs: string): Promise<{ id: string; bookedOn: string; amountCents: number; documented: boolean }[]> {
  const rows = await db
    .prepare(
      `SELECT p.id, p.booked_on, p.amount_cents,
         EXISTS (SELECT 1 FROM invoices i WHERE i.payment_id = p.id AND i.kind = 'advance' AND i.company_id = p.company_id) AS documented
       FROM payments p WHERE p.company_id = ? AND p.vs = ? AND p.amount_cents > 0 ORDER BY p.booked_on, p.id`,
    )
    .bind(company, vs)
    .all<Row>()
  return rows.results.map((r) => ({ id: String(r.id), bookedOn: String(r.booked_on), amountCents: Number(r.amount_cents), documented: Number(r.documented) === 1 }))
}

/** A credit note's lines as kept: what the form says the invoice is lowered by, with the minus sign. */
export const creditLines = (lines: Line[]): Line[] => lines.map((l) => ({ ...l, unitCents: -l.unitCents, baseCents: -l.baseCents }))

/**
 * What an invoice may still be lowered by, rate by rate (cents of base, each a plus): its own base less what the
 * credit notes issued to it took. A credit note that takes more at some rate says by how much at most. A final
 * invoice may be lowered by the whole supply it bills: the advances it deducts (lines with VAT of their own) were
 * part of it.
 */
export function creditLeft(original: Pick<Line, 'baseCents' | 'vatRate' | 'vatCents'>[], credited: Pick<Line, 'baseCents' | 'vatRate'>[], vatPayer: boolean): Map<number, number> {
  const left = new Map<number, number>()
  const supply = original.filter((l) => typeof l.vatCents !== 'number')
  for (const r of totalsOf(supply, vatPayer).rates) left.set(r.rate, r.base)
  for (const r of totalsOf(credited, vatPayer).rates) left.set(r.rate, (left.get(r.rate) ?? 0) + r.base)
  return left
}

/** The first rate a credit note takes more at than the invoice has left, with what is left there; null when it fits. */
export function creditTooMuch(left: Map<number, number>, credit: Pick<Line, 'baseCents' | 'vatRate'>[], vatPayer: boolean): { rate: number; left: number } | null {
  for (const r of totalsOf(credit, vatPayer).rates) {
    const room = left.get(r.rate) ?? 0
    if (-r.base > room) return { rate: r.rate, left: Math.max(0, room) }
  }
  return null
}

/** The number of an invoice: the year and its order in it, which is also its variable symbol (20260001). */
export function invoiceNumber(year: number, seq: number): string {
  return `${year}${String(seq).padStart(4, '0')}`
}

export const plainIban = (text: string) => text.replace(/\s/g, '').toUpperCase()

/** An IBAN: two letters, two check digits and the account, whose remainder by 97 is 1 (ISO 13616), so a typo is caught. */
export function isIban(text: string): boolean {
  const iban = plainIban(text)
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban)) return false
  let rest = 0
  for (const ch of iban.slice(4) + iban.slice(0, 4)) {
    const value = ch >= 'A' ? String(ch.charCodeAt(0) - 55) : ch
    for (const digit of value) rest = (rest * 10 + Number(digit)) % 97
  }
  return rest === 1
}

export interface Errors {
  customerName?: string
  customerIcdph?: string
  reverse?: string
  reverseCustomer?: string
  reverseKind?: string
  reverseCode?: string
  customerEmail?: string
  customerIco?: string
  issued?: string
  delivered?: string
  due?: string
  iban?: string
  lines?: string
  reason?: string
  rate?: string
  form?: string
}

const EMAIL = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)*\.[A-Za-z]{2,}$/

/** Reads the form's lines, leaving out the empty ones; an error names what is wrong with the first bad line. */
export function linesOf(values: InvoiceValues, vatPayer: boolean, messages: { line: (n: number) => string; none: string }): { lines: Line[]; error: string | null } {
  const lines: Line[] = []
  let error: string | null = null
  values.lines.forEach((input, i) => {
    const empty = input.description.trim() === '' && input.price.trim() === ''
    if (empty) return
    const quantity = milliOf(input.quantity === '' ? '1' : input.quantity)
    const price = centsOf(input.price)
    // A supply without Slovak VAT has no rate, whatever a line's select says.
    const rate = vatPayer && (values.mode ?? 'domestic') === 'domestic' ? Number(input.vat) : 0
    if (input.description.trim() === '' || quantity === null || Number.isNaN(quantity) || quantity <= 0 || price === null || Number.isNaN(price) || !VAT_RATES.includes(rate as (typeof VAT_RATES)[number])) {
      error ??= messages.line(i + 1)
      return
    }
    lines.push({
      position: lines.length + 1,
      description: input.description.trim().slice(0, 300),
      quantityMilli: quantity,
      unit: (UNITS as readonly string[]).includes(input.unit) ? input.unit : null,
      unitCents: price,
      vatRate: rate,
      baseCents: lineBase(quantity, price),
    })
  })
  if (!error && lines.length === 0) error = messages.none
  return { lines, error }
}

export function checkValues(values: InvoiceValues, dayOf: (text: string) => string | null, messages: Record<keyof Errors, string>): Errors {
  const errors: Errors = {}
  if (values.customerName.trim().length < 2) errors.customerName = messages.customerName
  if (values.customerEmail !== '' && !EMAIL.test(values.customerEmail)) errors.customerEmail = messages.customerEmail
  if (values.customerIco !== '' && !/^\d{8}$/.test(values.customerIco.replace(/\s/g, ''))) errors.customerIco = messages.customerIco
  const issued = dayOf(values.issued)
  const delivered = dayOf(values.delivered)
  const due = dayOf(values.due)
  if (!issued) errors.issued = messages.issued
  if (!delivered) errors.delivered = messages.delivered
  if (!due || (issued && due < issued)) errors.due = messages.due
  if (values.iban !== '' && !isIban(values.iban)) errors.iban = messages.iban
  // Goods or a service to another member state go to a VAT payer there: its VAT number is on the invoice (§ 74(1)(b)).
  const vatId = values.customerIcdph.replace(/[\s.-]/g, '').toUpperCase()
  if ((values.mode === 'eu_goods' || values.mode === 'eu_service') && (!isEuVatId(vatId) || vatId.startsWith('SK'))) errors.customerIcdph = messages.customerIcdph
  // Domestic reverse charge goes to a Slovak payer only, and says what is supplied (the control statement's A.2).
  if (values.mode === 'reverse') {
    if (!/^SK\d{10}$/.test(vatId)) errors.customerIcdph = messages.reverseCustomer
    const kind = values.reverseKind ?? ''
    if (!isReverseKind(kind)) errors.reverse = messages.reverseKind
    else if ((kind === 'f' || kind === 'g') && !/^\d{4}$/.test((values.reverseCode ?? '').replace(/\s/g, ''))) errors.reverse = messages.reverseCode
  }
  return errors
}

// ---------------------------------------------------------------------------------------------------------------
// The e-invoice
// ---------------------------------------------------------------------------------------------------------------

const esc = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const amount = (cents: number) => `${cents < 0 ? '-' : ''}${Math.floor(Math.abs(cents) / 100)}.${String(Math.abs(cents) % 100).padStart(2, '0')}`

export interface StoredInvoice {
  id: string
  number: string | null
  status: string
  customerName: string
  customerIco: string | null
  customerDic: string | null
  customerIcdph: string | null
  customerAddress: string | null
  customerEmail: string | null
  issuedOn: string
  deliveredOn: string
  dueOn: string
  note: string | null
  baseCents: number
  vatCents: number
  totalCents: number
  token: string
  documentId: string | null
  iban: string | null
  sentAt: number | null
  remindedAt: number | null
  createdAt: number
  createdByName: string | null
  /** Who issued it (a user's id). */
  createdBy: string | null
  paidOn: string | null
  /**
   * An invoice; a credit note (dobropis) of an invoice issued before; a request for an advance (zálohová faktúra,
   * no tax document, numbered ZF… with its own variable symbol); the tax document of an advance received (§ 73).
   */
  kind: InvoiceKind
  /** A request for an advance: its variable symbol (the year, 9 and its order: 202690001). */
  vs: string | null
  /** An advance's tax document or a final invoice: the request it belongs to (id and number). */
  relates: string | null
  relatesNumber: string | null
  /** A request for an advance: what came on its variable symbol (cents). */
  paidCents: number
  /** How it is taxed (a company that is no VAT payer: always as `domestic`, without VAT). */
  mode: InvoiceMode
  /** Domestic reverse charge: what the control statement's A.2 asks of the supply. */
  reverse: ReverseGoods | null
  /** A credit note: the invoice it corrects (its id, number and day of issue), and why. */
  corrects: string | null
  correctsNumber: string | null
  correctsIssuedOn: string | null
  reason: string | null
  /** Issued by a repeat (repeat.ts), which one. */
  repeatId: string | null
  /** The currency it is issued in ('EUR' for most), the rate it is converted to euros at and the ECB's day of it. */
  currency: string
  fxRate: string | null
  fxDay: string | null
}

/**
 * The VAT of an invoice in another currency in euros, rate by rate, at the rate of the day before the supply (§ 26 of
 * the VAT Act), each amount rounded to the cent as the VAT return takes it (vat.ts converts a document's lines alike).
 * The Directive's art. 230: the VAT to pay is stated in the national currency, whatever currency the invoice is in.
 */
export function eurVat(totals: Totals, rate: number): { rates: { rate: number; base: number; vat: number }[]; vat: number } {
  const rates = totals.rates.map((r) => ({ rate: r.rate, base: eurOf(r.base, rate), vat: eurOf(r.vat, rate) }))
  return { rates, vat: rates.reduce((sum, r) => sum + r.vat, 0) }
}

/**
 * The electronic address scheme (EAS) of a VAT number of another state, as Peppol's code list names it, for a customer
 * abroad who has no Slovak DIČ (cross-border e-invoices are not compulsory before 2030; where the customer receives on
 * Peppol under another identifier, the postman's lookup says so).
 */
const VAT_SCHEMES: Record<string, string> = {
  AT: '9914', BE: '9925', BG: '9926', CY: '9928', CZ: '9929', DE: '9930', EE: '9931', EL: '9933', ES: '9920', FR: '9957', HR: '9934',
  HU: '9910', IE: '9935', LT: '9937', LU: '9938', LV: '9939', MT: '9943', NL: '9944', PL: '9945', PT: '9946', RO: '9947', SI: '9949',
  // Beyond the Union, where Peppol names a VAT number's scheme: a customer of an export.
  AD: '9922', AL: '9923', BA: '9924', CH: '9927', GB: '9932', LI: '9936', MC: '9940', ME: '9941', MK: '9942', RS: '9948', SM: '9951', TR: '9952', VA: '9953',
}

/** The state of a VAT number (ISO 3166: Greece's EL is GR), Slovakia when there is none. */
const countryOf = (icdph: string | null): string => {
  const prefix = /^([A-Z]{2})/.exec((icdph ?? '').replace(/\s/g, '').toUpperCase())?.[1]
  return !prefix ? 'SK' : prefix === 'EL' ? 'GR' : prefix
}

/**
 * The invoice as UBL 2.1 in the profile Peppol BIS Billing 3.0 (EN 16931), which the digital postmen carry from
 * 2027 (each kind checked against the rules of CEN and Peppol in `npm run test:peppol`). A Slovak company is addressed
 * by its DIČ (EAS 0245), a customer abroad by its VAT number; without either the file has no endpoint and is still a
 * valid UBL invoice for import, not for the Peppol network.
 */
export function ublOf(invoice: StoredInvoice, kept: Line[], seller: Company): string {
  // A credit note goes as UBL's CreditNote (type 381, which Peppol takes for one), its amounts as plus, naming the
  // invoice it corrects (BG-3); the amounts it is kept with are minus.
  const credit = invoice.kind === 'credit'
  const lines = credit ? creditLines(kept) : kept
  const root = credit ? 'CreditNote' : 'Invoice'
  // One note a document (PEPPOL-EN16931-R002): a credit note's reason first.
  const note = [credit && invoice.reason ? `Dôvod opravy: ${invoice.reason}` : '', invoice.note ?? ''].filter(Boolean).join(' | ')
  const totals = totalsOf(lines, seller.vatPayer)
  // An invoice in another currency: every amount in it, and the VAT also in euros (BT-6, BT-111, BR-53).
  const cur = invoice.currency ?? 'EUR'
  const fx = cur !== 'EUR' ? rateMicro(invoice.fxRate) : null
  // EN 16931: S is a rate above nought, E a supply exempt from VAT (Slovakia has no zero rate at home), O a seller
  // who is no VAT payer or a supply outside Slovakia; K goods to another member state, AE a service whose customer
  // pays the VAT, G an export, each at 0 % with its exemption code. E and O carry the reason, O carries no rate and no
  // VAT identifier of either side (BR-O-02 to BR-O-04).
  const mode = seller.vatPayer ? invoice.mode : 'domestic'
  const terms = mode === 'domestic' ? null : MODE_TERMS[mode]
  const category = (rate: number) => terms?.category ?? (seller.vatPayer ? (rate > 0 ? 'S' : 'E') : 'O')
  const reason = (rate: number) => terms?.text ?? (category(rate) === 'O' ? 'Dodávateľ nie je platiteľom DPH' : category(rate) === 'E' ? 'Dodanie je oslobodené od dane' : null)
  const percent = (rate: number) => (category(rate) === 'O' ? '' : `<cbc:Percent>${rate}</cbc:Percent>`)
  const taxCategory = (rate: number) =>
    `<cac:TaxCategory><cbc:ID>${category(rate)}</cbc:ID>${percent(rate)}${terms ? `<cbc:TaxExemptionReasonCode>${terms.code}</cbc:TaxExemptionReasonCode>` : ''}${reason(rate) ? `<cbc:TaxExemptionReason>${esc(reason(rate) ?? '')}</cbc:TaxExemptionReason>` : ''}<cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory>`
  const vatId = (icdph: string | null) => (seller.vatPayer && terms?.category !== 'O' ? icdph : null)
  const party = (p: { name: string; ico: string | null; dic: string | null; icdph: string | null; address: string | null; vatNumber: string | null }) => {
    const country = countryOf(p.vatNumber)
    const vatNumber = (p.vatNumber ?? '').replace(/\s/g, '').toUpperCase()
    const scheme = country === 'SK' ? null : VAT_SCHEMES[vatNumber.slice(0, 2)]
    // A Slovak company's DIČ, or the digits of its IČ DPH, which are its DIČ.
    const dic = p.dic ?? (/^SK\d{10}$/.test(vatNumber) ? vatNumber.slice(2) : null)
    const endpoint = country === 'SK' && dic ? `<cbc:EndpointID schemeID="0245">${esc(dic)}</cbc:EndpointID>` : scheme ? `<cbc:EndpointID schemeID="${scheme}">${esc(vatNumber)}</cbc:EndpointID>` : ''
    const a = p.address ? splitAddress(p.address) : null
    return [
      '<cac:Party>',
      endpoint,
      `<cac:PartyName><cbc:Name>${esc(p.name)}</cbc:Name></cac:PartyName>`,
      `<cac:PostalAddress>${a ? `<cbc:StreetName>${esc(a.street)}</cbc:StreetName>${a.city ? `<cbc:CityName>${esc(a.city)}</cbc:CityName>` : ''}${a.postal ? `<cbc:PostalZone>${esc(a.postal)}</cbc:PostalZone>` : ''}` : ''}<cac:Country><cbc:IdentificationCode>${country}</cbc:IdentificationCode></cac:Country></cac:PostalAddress>`,
      p.icdph ? `<cac:PartyTaxScheme><cbc:CompanyID>${esc(p.icdph)}</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>` : '',
      `<cac:PartyLegalEntity><cbc:RegistrationName>${esc(p.name)}</cbc:RegistrationName>${p.ico ? `<cbc:CompanyID>${esc(p.ico)}</cbc:CompanyID>` : ''}</cac:PartyLegalEntity>`,
      '</cac:Party>',
    ].join('')
  }
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<${root} xmlns="urn:oasis:names:specification:ubl:schema:xsd:${root}-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">`,
    '<cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>',
    '<cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>',
    `<cbc:ID>${esc(invoice.number ?? '')}</cbc:ID>`,
    `<cbc:IssueDate>${invoice.issuedOn}</cbc:IssueDate>`,
    credit ? '' : `<cbc:DueDate>${invoice.dueOn}</cbc:DueDate>`,
    // A credit note 381; the tax document of an advance received a prepayment invoice, 386; an invoice 380.
    credit ? '<cbc:CreditNoteTypeCode>381</cbc:CreditNoteTypeCode>' : `<cbc:InvoiceTypeCode>${invoice.kind === 'advance' ? 386 : 380}</cbc:InvoiceTypeCode>`,
    note ? `<cbc:Note>${esc(note)}</cbc:Note>` : '',
    `<cbc:DocumentCurrencyCode>${cur}</cbc:DocumentCurrencyCode>`,
    fx ? '<cbc:TaxCurrencyCode>EUR</cbc:TaxCurrencyCode>' : '',
    `<cbc:BuyerReference>${esc(invoice.number ?? '')}</cbc:BuyerReference>`,
    credit && invoice.correctsNumber
      ? `<cac:BillingReference><cac:InvoiceDocumentReference><cbc:ID>${esc(invoice.correctsNumber)}</cbc:ID>${invoice.correctsIssuedOn ? `<cbc:IssueDate>${invoice.correctsIssuedOn}</cbc:IssueDate>` : ''}</cac:InvoiceDocumentReference></cac:BillingReference>`
      : '',
    `<cac:AccountingSupplierParty>${party({ name: seller.name, ico: seller.ico, dic: seller.dic, icdph: vatId(seller.icdph), address: seller.address, vatNumber: seller.icdph })}</cac:AccountingSupplierParty>`,
    `<cac:AccountingCustomerParty>${party({ name: invoice.customerName, ico: invoice.customerIco, dic: invoice.customerDic, icdph: vatId(invoice.customerIcdph), address: invoice.customerAddress, vatNumber: invoice.customerIcdph })}</cac:AccountingCustomerParty>`,
    // Goods to another member state name the state they went to (BR-IC-12).
    `<cac:Delivery><cbc:ActualDeliveryDate>${invoice.deliveredOn}</cbc:ActualDeliveryDate>${terms?.category === 'K' ? `<cac:DeliveryLocation><cac:Address><cac:Country><cbc:IdentificationCode>${countryOf(invoice.customerIcdph)}</cbc:IdentificationCode></cac:Country></cac:Address></cac:DeliveryLocation>` : ''}</cac:Delivery>`,
    // A credit transfer to the account (30) names the account (BR-61); without one, the means is not defined (1). A
    // credit note is paid back to the customer's account, which the company has and the file need not name.
    credit
      ? ''
      : `<cac:PaymentMeans><cbc:PaymentMeansCode>${invoice.iban ? 30 : 1}</cbc:PaymentMeansCode><cbc:PaymentID>${esc(invoice.number ?? '')}</cbc:PaymentID>${invoice.iban ? `<cac:PayeeFinancialAccount><cbc:ID>${esc(plainIban(invoice.iban))}</cbc:ID></cac:PayeeFinancialAccount>` : ''}</cac:PaymentMeans>`,
    `<cac:TaxTotal><cbc:TaxAmount currencyID="${cur}">${amount(totals.vat)}</cbc:TaxAmount>${totals.rates
      .map((r) => `<cac:TaxSubtotal><cbc:TaxableAmount currencyID="${cur}">${amount(r.base)}</cbc:TaxableAmount><cbc:TaxAmount currencyID="${cur}">${amount(r.vat)}</cbc:TaxAmount>${taxCategory(r.rate)}</cac:TaxSubtotal>`)
      .join('')}</cac:TaxTotal>`,
    fx ? `<cac:TaxTotal><cbc:TaxAmount currencyID="EUR">${amount(eurVat(totals, fx).vat)}</cbc:TaxAmount></cac:TaxTotal>` : '',
    `<cac:LegalMonetaryTotal><cbc:LineExtensionAmount currencyID="${cur}">${amount(totals.base)}</cbc:LineExtensionAmount><cbc:TaxExclusiveAmount currencyID="${cur}">${amount(totals.base)}</cbc:TaxExclusiveAmount><cbc:TaxInclusiveAmount currencyID="${cur}">${amount(totals.total)}</cbc:TaxInclusiveAmount>${
      // An advance's tax document is made for money received: all of it paid, nothing due (BR-CO-16).
      invoice.kind === 'advance'
        ? `<cbc:PrepaidAmount currencyID="${cur}">${amount(totals.total)}</cbc:PrepaidAmount><cbc:PayableAmount currencyID="${cur}">0.00</cbc:PayableAmount>`
        : `<cbc:PayableAmount currencyID="${cur}">${amount(totals.total)}</cbc:PayableAmount>`
    }</cac:LegalMonetaryTotal>`,
    ...lines.map(
      (line) =>
        `<cac:${root}Line><cbc:ID>${line.position}</cbc:ID><cbc:${credit ? 'Credited' : 'Invoiced'}Quantity unitCode="${UNIT_CODES[line.unit ?? 'ks'] ?? 'C62'}">${(line.unitCents < 0 ? -line.quantityMilli : line.quantityMilli) / 1000}</cbc:${credit ? 'Credited' : 'Invoiced'}Quantity><cbc:LineExtensionAmount currencyID="${cur}">${amount(line.baseCents)}</cbc:LineExtensionAmount><cac:Item><cbc:Name>${esc(line.description)}</cbc:Name><cac:ClassifiedTaxCategory><cbc:ID>${category(line.vatRate)}</cbc:ID>${percent(line.vatRate)}<cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:ClassifiedTaxCategory></cac:Item><cac:Price><cbc:PriceAmount currencyID="${cur}">${amount(Math.abs(line.unitCents))}</cbc:PriceAmount></cac:Price></cac:${root}Line>`,
    ),
    `</${root}>`,
    '',
  ]
    .filter((part) => part !== '')
    .join('\n')
}

// ---------------------------------------------------------------------------------------------------------------
// In the database
// ---------------------------------------------------------------------------------------------------------------

type Row = Record<string, unknown>
const str = (v: unknown) => (typeof v === 'string' ? v : null)

const INVOICE_COLUMNS = `i.*, u.name AS created_by_name,
  CASE WHEN i.kind = 'proforma'
    THEN (SELECT p.booked_on FROM payments p WHERE p.company_id = i.company_id AND p.vs = i.vs AND i.vs IS NOT NULL AND p.amount_cents > 0 ORDER BY p.booked_on LIMIT 1)
    ELSE (SELECT p.booked_on FROM links l JOIN payments p ON p.id = l.payment_id WHERE l.document_id = i.document_id ORDER BY p.booked_on LIMIT 1) END AS paid_on,
  CASE WHEN i.kind = 'proforma' THEN (SELECT COALESCE(SUM(p.amount_cents), 0) FROM payments p WHERE p.company_id = i.company_id AND p.vs = i.vs AND i.vs IS NOT NULL AND p.amount_cents > 0) ELSE 0 END AS paid_cents,
  (SELECT o.number FROM invoices o WHERE o.id = i.relates AND o.company_id = i.company_id) AS relates_number,
  (SELECT o.number FROM invoices o WHERE o.id = i.corrects AND o.company_id = i.company_id) AS corrects_number,
  (SELECT o.issued_on FROM invoices o WHERE o.id = i.corrects AND o.company_id = i.company_id) AS corrects_issued_on`

function invoiceOf(row: Row): StoredInvoice {
  return {
    id: String(row.id),
    number: str(row.number),
    status: String(row.status),
    customerName: String(row.customer_name),
    customerIco: str(row.customer_ico),
    customerDic: str(row.customer_dic),
    customerIcdph: str(row.customer_icdph),
    customerAddress: str(row.customer_address),
    customerEmail: str(row.customer_email),
    issuedOn: String(row.issued_on),
    deliveredOn: String(row.delivered_on),
    dueOn: String(row.due_on),
    note: str(row.note),
    baseCents: Number(row.base_cents),
    vatCents: Number(row.vat_cents),
    totalCents: Number(row.total_cents),
    token: String(row.token),
    documentId: str(row.document_id),
    iban: str(row.iban),
    sentAt: typeof row.sent_at === 'number' ? row.sent_at : null,
    remindedAt: typeof row.reminded_at === 'number' ? row.reminded_at : null,
    createdAt: Number(row.created_at),
    createdByName: str(row.created_by_name),
    createdBy: str(row.created_by),
    paidOn: str(row.paid_on),
    kind: row.kind === 'credit' || row.kind === 'proforma' || row.kind === 'advance' ? row.kind : 'invoice',
    vs: str(row.vs),
    relates: str(row.relates),
    relatesNumber: str(row.relates_number),
    paidCents: Number(row.paid_cents ?? 0),
    mode: isInvoiceMode(row.vat_mode) ? row.vat_mode : 'domestic',
    reverse: reverseOf(row.vat_reverse),
    repeatId: str(row.repeat_id),
    currency: isCurrency(row.currency) ? row.currency : 'EUR',
    fxRate: str(row.fx_rate),
    fxDay: str(row.fx_day),
    corrects: str(row.corrects),
    correctsNumber: str(row.corrects_number),
    correctsIssuedOn: str(row.corrects_issued_on),
    reason: str(row.reason),
  }
}

export type InvoiceKind = 'invoice' | 'credit' | 'proforma' | 'advance'
export type InvoiceState = 'draft' | 'unpaid' | 'overdue' | 'paid' | 'credit'

export function stateOf(invoice: Pick<StoredInvoice, 'status' | 'paidOn' | 'dueOn'> & { kind?: StoredInvoice['kind'] }, today: string): InvoiceState {
  if (invoice.status === 'draft') return 'draft'
  // A credit note lowers what the invoice asks; it is not collected, so it is neither paid nor overdue. The tax
  // document of an advance documents money received.
  if (invoice.kind === 'credit') return 'credit'
  if (invoice.kind === 'advance') return 'paid'
  if (invoice.paidOn) return 'paid'
  return invoice.dueOn < today ? 'overdue' : 'unpaid'
}

export async function listInvoices(db: D1Database, company: string, limit = 300): Promise<StoredInvoice[]> {
  const rows = await db
    .prepare(`SELECT ${INVOICE_COLUMNS} FROM invoices i LEFT JOIN users u ON u.id = i.created_by WHERE i.company_id = ? ORDER BY CASE i.status WHEN 'draft' THEN 0 ELSE 1 END, i.issued_on DESC, i.seq DESC, i.created_at DESC LIMIT ?`)
    .bind(company, limit)
    .all<Row>()
  return rows.results.map(invoiceOf)
}

export async function getInvoice(db: D1Database, company: string, id: string): Promise<StoredInvoice | null> {
  const row = await db.prepare(`SELECT ${INVOICE_COLUMNS} FROM invoices i LEFT JOIN users u ON u.id = i.created_by WHERE i.company_id = ? AND i.id = ?`).bind(company, id).first<Row>()
  return row ? invoiceOf(row) : null
}

/** The invoices a company issued in a year, by their number (drafts are no invoices). */
export async function issuedInYear(db: D1Database, company: string, year: string): Promise<StoredInvoice[]> {
  const rows = await db
    .prepare(`SELECT ${INVOICE_COLUMNS} FROM invoices i LEFT JOIN users u ON u.id = i.created_by WHERE i.company_id = ? AND i.status = 'issued' AND substr(i.issued_on, 1, 4) = ? ORDER BY i.seq, i.created_at`)
    .bind(company, year)
    .all<Row>()
  return rows.results.map(invoiceOf)
}

/** An issued invoice by the token of its public page, with its company's id. */
export async function invoiceByToken(db: D1Database, token: string): Promise<{ invoice: StoredInvoice; company: string } | null> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null
  const row = await db.prepare(`SELECT ${INVOICE_COLUMNS} FROM invoices i LEFT JOIN users u ON u.id = i.created_by WHERE i.token = ? AND i.status = 'issued'`).bind(token).first<Row>()
  return row ? { invoice: invoiceOf(row), company: String(row.company_id) } : null
}

export async function invoiceLines(db: D1Database, invoice: string): Promise<Line[]> {
  const rows = await db.prepare('SELECT * FROM invoice_lines WHERE invoice_id = ? ORDER BY position').bind(invoice).all<Row>()
  return rows.results.map((row) => ({
    position: Number(row.position),
    description: String(row.description),
    quantityMilli: Number(row.quantity_milli),
    unit: str(row.unit),
    unitCents: Number(row.unit_cents),
    vatRate: Number(row.vat_rate),
    baseCents: Number(row.base_cents),
    vatCents: typeof row.vat_cents === 'number' ? row.vat_cents : null,
  }))
}

/** The lines of the credit notes issued to an invoice (each a minus), leaving out one (a draft being issued). */
export async function creditedLines(db: D1Database, company: string, invoice: string, except: string | null): Promise<Line[]> {
  const rows = await db
    .prepare(
      `SELECT l.* FROM invoice_lines l JOIN invoices i ON i.id = l.invoice_id
        WHERE i.company_id = ? AND i.corrects = ? AND i.kind = 'credit' AND i.status = 'issued' AND i.id IS NOT ?`,
    )
    .bind(company, invoice, except)
    .all<Row>()
  return rows.results.map((row) => ({
    position: Number(row.position),
    description: String(row.description),
    quantityMilli: Number(row.quantity_milli),
    unit: str(row.unit),
    unitCents: Number(row.unit_cents),
    vatRate: Number(row.vat_rate),
    baseCents: Number(row.base_cents),
    vatCents: typeof row.vat_cents === 'number' ? row.vat_cents : null,
  }))
}

/** Writes an invoice and its lines: a draft has no number; an issued one takes the next of its year in the same step. */
export function saveInvoiceStatements(
  db: D1Database,
  args: {
    id: string
    company: string
    user: string
    issue: boolean
    values: InvoiceValues
    lines: Line[]
    totals: Totals
    issued: string
    delivered: string
    due: string
    token: string
    iban: string | null
    documentId: string
    /** A credit note: the invoice it corrects, by id and number. */
    credit?: { corrects: string; number: string | null; reason: string } | null
    /** A request for an advance, or an advance's tax document; an invoice when not said. */
    kind?: 'proforma' | 'advance' | null
    /** The request for an advance an advance's tax document or a final invoice belongs to. */
    relates?: string | null
    /** A final invoice: the base of the advances it deducts (documents.advance_cents). */
    advanceCents?: number
    /** An advance's tax document: the payment it is made for (one document a payment, kept by a unique index). */
    payment?: string | null
    /** An invoice in another currency: the currency, the rate it is converted at ("1,0845") and the ECB's day of it. */
    fx?: { currency: string; rate: string | null; day: string | null } | null
    /** An invoice issued by a repeat (repeat.ts): its repeat (one a day, kept by a unique index). */
    repeat?: string | null
  },
): D1PreparedStatement[] {
  const v = args.values
  const year = Number(args.issued.slice(0, 4))
  const mode = v.mode ?? 'domestic'
  const reverse = reverseGoodsOf(v, args.lines)
  const fields = [
    v.customerName.trim().slice(0, 200),
    v.customerIco.replace(/\s/g, '') || null,
    v.customerDic.replace(/\s/g, '') || null,
    v.customerIcdph.replace(/\s/g, '').toUpperCase() || null,
    v.customerAddress.trim().slice(0, 300) || null,
    v.customerEmail.trim().slice(0, 200) || null,
    args.issued,
    args.delivered,
    args.due,
    v.note.trim().slice(0, 1000) || null,
    args.totals.base,
    args.totals.vat,
    args.totals.total,
    args.iban,
  ]
  return [
    // A draft that is saved again keeps its id: what it had is replaced.
    db.prepare("DELETE FROM invoice_lines WHERE invoice_id = ? AND EXISTS (SELECT 1 FROM invoices WHERE id = ? AND company_id = ? AND status = 'draft')").bind(args.id, args.id, args.company),
    db.prepare("DELETE FROM invoices WHERE id = ? AND company_id = ? AND status = 'draft'").bind(args.id, args.company),
    db
      .prepare(
        `INSERT INTO invoices (id, company_id, created_at, created_by, status, year, seq, number,
           customer_name, customer_ico, customer_dic, customer_icdph, customer_address, customer_email,
           issued_on, delivered_on, due_on, note, base_cents, vat_cents, total_cents, iban, token, kind, corrects, reason, vat_mode, vat_reverse, relates, vs, payment_id,
           currency, fx_rate, fx_day, repeat_id)
         SELECT ?1, ?2, ?3, ?4, ?5,
           CASE WHEN ?5 = 'issued' THEN CAST(?6 AS INTEGER) END,
           CASE WHEN ?5 = 'issued' THEN next.seq END,
           CASE WHEN ?5 = 'issued' THEN (CASE WHEN ?22 = 'proforma' THEN printf('ZF%d%04d', ?6, next.seq) ELSE printf('%d%04d', ?6, next.seq) END) END,
           ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25, ?26, ?27,
           CASE WHEN ?5 = 'issued' AND ?22 = 'proforma' THEN printf('%d9%04d', ?6, next.seq) END, ?28, ?29, ?30, ?31, ?32
         -- Requests for advances have a row of their own; invoices, credit notes and advances' tax documents share one.
         FROM (SELECT COALESCE(MAX(seq), 0) + 1 AS seq FROM invoices WHERE company_id = ?2 AND year = ?6 AND (kind = 'proforma') = (?22 = 'proforma')) AS next`,
      )
      .bind(
        args.id,
        args.company,
        now(),
        args.user,
        args.issue ? 'issued' : 'draft',
        year,
        ...fields,
        args.token,
        args.credit ? 'credit' : (args.kind ?? 'invoice'),
        args.credit?.corrects ?? null,
        args.credit?.reason.slice(0, 500) || null,
        mode === 'domestic' ? null : mode,
        reverse ? JSON.stringify(reverse) : null,
        args.relates ?? null,
        args.kind === 'advance' ? (args.payment ?? null) : null,
        args.fx && args.fx.currency !== 'EUR' ? args.fx.currency : null,
        args.fx && args.fx.currency !== 'EUR' ? args.fx.rate : null,
        args.fx && args.fx.currency !== 'EUR' ? args.fx.day : null,
        args.repeat ?? null,
      ),
    // An issued invoice is a document of the company at once: the accountant books it, and the payment that pays it
    // is paired with it by its number, which is its variable symbol. A request for an advance is no document.
    ...(args.issue && args.kind !== 'proforma'
      ? [
          db
            .prepare(
              `INSERT INTO documents (id, company_id, created_at, source, added_by, status, read_by, kind, party, party_ico, number, vs,
                 issued_on, due_on, total_cents, vat_cents, currency, category, invoice_id, party_vat_id, supplied_on, vat_lines, corrects, vat_hint, vat_reverse, advance_cents, fx_rate)
               SELECT ?, company_id, created_at, 'issued', created_by, 'read', 'issued', 'invoice_out', customer_name, customer_ico, number, number,
                 issued_on, due_on, total_cents, vat_cents, COALESCE(currency, 'EUR'), ?, id, customer_icdph, delivered_on, ?, ?, ?, vat_reverse, ?, fx_rate
               FROM invoices WHERE id = ? AND company_id = ? AND status = 'issued'`,
            )
            // Its VAT by rate, exactly as the invoice sums it, and how it is taxed: what the return proposes until the
            // accountant confirms it. A credit note's are minus, and it names the invoice it corrects (C.1 reads it).
            .bind(
              args.documentId,
              args.kind === 'advance' ? 'advance' : mode === 'eu_goods' || mode === 'export' ? 'sales_goods' : 'sales',
              JSON.stringify(args.totals.rates.map((r) => ({ rate: r.rate, base: r.base, vat: r.vat, deduct: 0 }))),
              args.credit?.number ?? null,
              mode === 'domestic' ? null : mode,
              args.advanceCents && args.advanceCents > 0 ? args.advanceCents : null,
              args.id,
              args.company,
            ),
          db.prepare("UPDATE invoices SET document_id = ? WHERE id = ? AND company_id = ? AND status = 'issued'").bind(args.documentId, args.id, args.company),
        ]
      : []),
    ...args.lines.map((line) =>
      db
        .prepare('INSERT INTO invoice_lines (invoice_id, position, description, quantity_milli, unit, unit_cents, vat_rate, base_cents, vat_cents) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(args.id, line.position, line.description, line.quantityMilli, line.unit, line.unitCents, line.vatRate, line.baseCents, line.vatCents ?? null),
    ),
  ]
}
