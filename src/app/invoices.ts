// Invoices a client issues, as SuperFaktúra, Fakturoid and Pennylane issue them: a form, a number of its own in
// an unbroken row per year, a page the customer opens from an email, an e-invoice (UBL 2.1, Peppol BIS Billing
// 3.0) to download, and the invoice is a document of the company at once, so that the payment that pays it is
// paired with it by its variable symbol and the invoice says "zaplatená" by itself.
import { now } from '../db'
import type { Company } from './store'
import { splitAddress } from './address'
import { isEuVatId } from './vat'

export const VAT_RATES = [23, 19, 5, 0] as const

/**
 * How an invoice of a VAT payer is taxed (invoices.vat_mode): Slovak VAT at its rates, or a supply without it: goods
 * to a VAT payer of another member state (§ 43 of the VAT Act), a service whose customer in another member state pays
 * the VAT (§ 15(1)), an export (§ 47), a supply whose place is outside Slovakia.
 */
export type InvoiceMode = 'domestic' | 'eu_goods' | 'eu_service' | 'export' | 'outside'
export const INVOICE_MODES: readonly InvoiceMode[] = ['domestic', 'eu_goods', 'eu_service', 'export', 'outside']
export const isInvoiceMode = (value: unknown): value is InvoiceMode => typeof value === 'string' && (INVOICE_MODES as readonly string[]).includes(value)

/**
 * What an invoice without Slovak VAT says, as § 74(1) of the VAT Act asks (that the supply is exempt, or "prenesenie
 * daňovej povinnosti" when the customer pays the tax), and its category and exemption code in EN 16931 (VATEX).
 */
export const MODE_TERMS: Record<Exclude<InvoiceMode, 'domestic'>, { text: string; category: 'K' | 'AE' | 'G' | 'O'; code: string }> = {
  eu_goods: { text: 'Dodanie je oslobodené od dane podľa § 43 zákona o DPH (dodanie tovaru do iného členského štátu).', category: 'K', code: 'VATEX-EU-IC' },
  eu_service: { text: 'Prenesenie daňovej povinnosti', category: 'AE', code: 'VATEX-EU-AE' },
  export: { text: 'Dodanie je oslobodené od dane podľa § 47 zákona o DPH (vývoz tovaru).', category: 'G', code: 'VATEX-EU-G' },
  outside: { text: 'Miesto dodania nie je v tuzemsku: dodanie nie je predmetom slovenskej dane.', category: 'O', code: 'VATEX-EU-O' },
}
export const UNITS = ['ks', 'hod', 'deň', 'mes', 'kg', 'km', 'm²', 'bal'] as const

/** UN/ECE Recommendation 20 codes for the units an invoice line may have. */
const UNIT_CODES: Record<string, string> = { ks: 'C62', hod: 'HUR', deň: 'DAY', mes: 'MON', kg: 'KGM', km: 'KMT', 'm²': 'MTK', bal: 'XPK' }

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
}

export interface Line {
  position: number
  description: string
  quantityMilli: number
  unit: string | null
  unitCents: number
  vatRate: number
  baseCents: number
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
export function totalsOf(lines: Pick<Line, 'baseCents' | 'vatRate'>[], vatPayer: boolean): Totals {
  const byRate = new Map<number, number>()
  for (const line of lines) {
    const rate = vatPayer ? line.vatRate : 0
    byRate.set(rate, (byRate.get(rate) ?? 0) + line.baseCents)
  }
  // A credit note's VAT mirrors the invoice's: rounded on the amount, then given its sign.
  const rates = [...byRate].map(([rate, base]) => ({ rate, base, vat: Math.sign(base) * Math.round((Math.abs(base) * rate) / 100) })).sort((a, b) => b.rate - a.rate)
  const base = rates.reduce((sum, r) => sum + r.base, 0)
  const vat = rates.reduce((sum, r) => sum + r.vat, 0)
  return { base, vat, total: base + vat, rates }
}

/** A credit note's lines as kept: what the form says the invoice is lowered by, with the minus sign. */
export const creditLines = (lines: Line[]): Line[] => lines.map((l) => ({ ...l, unitCents: -l.unitCents, baseCents: -l.baseCents }))

/**
 * What an invoice may still be lowered by, rate by rate (cents of base, each a plus): its own base less what the
 * credit notes issued to it took. A credit note that takes more at some rate says by how much at most.
 */
export function creditLeft(original: Pick<Line, 'baseCents' | 'vatRate'>[], credited: Pick<Line, 'baseCents' | 'vatRate'>[], vatPayer: boolean): Map<number, number> {
  const left = new Map<number, number>()
  for (const r of totalsOf(original, vatPayer).rates) left.set(r.rate, r.base)
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
  customerEmail?: string
  customerIco?: string
  issued?: string
  delivered?: string
  due?: string
  iban?: string
  lines?: string
  reason?: string
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
  paidOn: string | null
  /** An invoice, or a credit note (dobropis) of an invoice issued before. */
  kind: 'invoice' | 'credit'
  /** How it is taxed (a company that is no VAT payer: always as `domestic`, without VAT). */
  mode: InvoiceMode
  /** A credit note: the invoice it corrects (its id, number and day of issue), and why. */
  corrects: string | null
  correctsNumber: string | null
  correctsIssuedOn: string | null
  reason: string | null
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
    const endpoint = country === 'SK' && p.dic ? `<cbc:EndpointID schemeID="0245">${esc(p.dic)}</cbc:EndpointID>` : scheme ? `<cbc:EndpointID schemeID="${scheme}">${esc(vatNumber)}</cbc:EndpointID>` : ''
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
    credit ? '<cbc:CreditNoteTypeCode>381</cbc:CreditNoteTypeCode>' : '<cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>',
    note ? `<cbc:Note>${esc(note)}</cbc:Note>` : '',
    '<cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode>',
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
    `<cac:TaxTotal><cbc:TaxAmount currencyID="EUR">${amount(totals.vat)}</cbc:TaxAmount>${totals.rates
      .map((r) => `<cac:TaxSubtotal><cbc:TaxableAmount currencyID="EUR">${amount(r.base)}</cbc:TaxableAmount><cbc:TaxAmount currencyID="EUR">${amount(r.vat)}</cbc:TaxAmount>${taxCategory(r.rate)}</cac:TaxSubtotal>`)
      .join('')}</cac:TaxTotal>`,
    `<cac:LegalMonetaryTotal><cbc:LineExtensionAmount currencyID="EUR">${amount(totals.base)}</cbc:LineExtensionAmount><cbc:TaxExclusiveAmount currencyID="EUR">${amount(totals.base)}</cbc:TaxExclusiveAmount><cbc:TaxInclusiveAmount currencyID="EUR">${amount(totals.total)}</cbc:TaxInclusiveAmount><cbc:PayableAmount currencyID="EUR">${amount(totals.total)}</cbc:PayableAmount></cac:LegalMonetaryTotal>`,
    ...lines.map(
      (line) =>
        `<cac:${root}Line><cbc:ID>${line.position}</cbc:ID><cbc:${credit ? 'Credited' : 'Invoiced'}Quantity unitCode="${UNIT_CODES[line.unit ?? 'ks'] ?? 'C62'}">${(line.unitCents < 0 ? -line.quantityMilli : line.quantityMilli) / 1000}</cbc:${credit ? 'Credited' : 'Invoiced'}Quantity><cbc:LineExtensionAmount currencyID="EUR">${amount(line.baseCents)}</cbc:LineExtensionAmount><cac:Item><cbc:Name>${esc(line.description)}</cbc:Name><cac:ClassifiedTaxCategory><cbc:ID>${category(line.vatRate)}</cbc:ID>${percent(line.vatRate)}<cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:ClassifiedTaxCategory></cac:Item><cac:Price><cbc:PriceAmount currencyID="EUR">${amount(Math.abs(line.unitCents))}</cbc:PriceAmount></cac:Price></cac:${root}Line>`,
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
  (SELECT p.booked_on FROM links l JOIN payments p ON p.id = l.payment_id WHERE l.document_id = i.document_id ORDER BY p.booked_on LIMIT 1) AS paid_on,
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
    paidOn: str(row.paid_on),
    kind: row.kind === 'credit' ? 'credit' : 'invoice',
    mode: isInvoiceMode(row.vat_mode) ? row.vat_mode : 'domestic',
    corrects: str(row.corrects),
    correctsNumber: str(row.corrects_number),
    correctsIssuedOn: str(row.corrects_issued_on),
    reason: str(row.reason),
  }
}

export type InvoiceState = 'draft' | 'unpaid' | 'overdue' | 'paid' | 'credit'

export function stateOf(invoice: Pick<StoredInvoice, 'status' | 'paidOn' | 'dueOn'> & { kind?: StoredInvoice['kind'] }, today: string): InvoiceState {
  if (invoice.status === 'draft') return 'draft'
  // A credit note lowers what the invoice asks; it is not collected, so it is neither paid nor overdue.
  if (invoice.kind === 'credit') return 'credit'
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
  },
): D1PreparedStatement[] {
  const v = args.values
  const year = Number(args.issued.slice(0, 4))
  const mode = v.mode ?? 'domestic'
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
           issued_on, delivered_on, due_on, note, base_cents, vat_cents, total_cents, iban, token, kind, corrects, reason, vat_mode)
         SELECT ?1, ?2, ?3, ?4, ?5,
           CASE WHEN ?5 = 'issued' THEN CAST(?6 AS INTEGER) END,
           CASE WHEN ?5 = 'issued' THEN next.seq END,
           CASE WHEN ?5 = 'issued' THEN printf('%d%04d', ?6, next.seq) END,
           ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25
         FROM (SELECT COALESCE(MAX(seq), 0) + 1 AS seq FROM invoices WHERE company_id = ?2 AND year = ?6) AS next`,
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
        args.credit ? 'credit' : 'invoice',
        args.credit?.corrects ?? null,
        args.credit?.reason.slice(0, 500) || null,
        mode === 'domestic' ? null : mode,
      ),
    // An issued invoice is a document of the company at once: the accountant books it, and the payment that pays it
    // is paired with it by its number, which is its variable symbol.
    ...(args.issue
      ? [
          db
            .prepare(
              `INSERT INTO documents (id, company_id, created_at, source, added_by, status, read_by, kind, party, party_ico, number, vs,
                 issued_on, due_on, total_cents, vat_cents, currency, category, invoice_id, party_vat_id, supplied_on, vat_lines, corrects, vat_hint)
               SELECT ?, company_id, created_at, 'issued', created_by, 'read', 'issued', 'invoice_out', customer_name, customer_ico, number, number,
                 issued_on, due_on, total_cents, vat_cents, 'EUR', ?, id, customer_icdph, delivered_on, ?, ?, ?
               FROM invoices WHERE id = ? AND company_id = ? AND status = 'issued'`,
            )
            // Its VAT by rate, exactly as the invoice sums it, and how it is taxed: what the return proposes until the
            // accountant confirms it. A credit note's are minus, and it names the invoice it corrects (C.1 reads it).
            .bind(
              args.documentId,
              mode === 'eu_goods' || mode === 'export' ? 'sales_goods' : 'sales',
              JSON.stringify(args.totals.rates.map((r) => ({ rate: r.rate, base: r.base, vat: r.vat, deduct: 0 }))),
              args.credit?.number ?? null,
              mode === 'domestic' ? null : mode,
              args.id,
              args.company,
            ),
          db.prepare("UPDATE invoices SET document_id = ? WHERE id = ? AND company_id = ? AND status = 'issued'").bind(args.documentId, args.id, args.company),
        ]
      : []),
    ...args.lines.map((line) =>
      db
        .prepare('INSERT INTO invoice_lines (invoice_id, position, description, quantity_milli, unit, unit_cents, vat_rate, base_cents) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(args.id, line.position, line.description, line.quantityMilli, line.unit, line.unitCents, line.vatRate, line.baseCents),
    ),
  ]
}
