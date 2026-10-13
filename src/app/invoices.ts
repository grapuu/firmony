// Invoices a client issues, as SuperFaktúra, Fakturoid and Pennylane issue them: a form, a number of its own in
// an unbroken row per year, a page the customer opens from an email, an e-invoice (UBL 2.1, Peppol BIS Billing
// 3.0) to download, and the invoice is a document of the company at once, so that the payment that pays it is
// paired with it by its variable symbol and the invoice says "zaplatená" by itself.
import { now } from '../db'
import type { Company } from './store'

export const VAT_RATES = [23, 19, 5, 0] as const
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
  const rates = [...byRate].map(([rate, base]) => ({ rate, base, vat: Math.round((base * rate) / 100) })).sort((a, b) => b.rate - a.rate)
  const base = rates.reduce((sum, r) => sum + r.base, 0)
  const vat = rates.reduce((sum, r) => sum + r.vat, 0)
  return { base, vat, total: base + vat, rates }
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
  customerEmail?: string
  customerIco?: string
  issued?: string
  delivered?: string
  due?: string
  iban?: string
  lines?: string
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
    const rate = vatPayer ? Number(input.vat) : 0
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
}

/**
 * The invoice as UBL 2.1 in the profile Peppol BIS Billing 3.0 (EN 16931), which the digital postmen carry from
 * 2027. A Slovak company is addressed by its DIČ (EAS 0245); without one the file has no endpoint and is still a
 * valid UBL invoice for import, not for the Peppol network.
 */
export function ublOf(invoice: StoredInvoice, lines: Line[], seller: Company): string {
  const totals = totalsOf(lines, seller.vatPayer)
  // EN 16931: S is a rate above nought, E a supply exempt from VAT (Slovakia has no zero rate at home), O a seller
  // who is no VAT payer; E and O carry the reason, O carries no rate and no VAT identifier of either side (BR-O-02).
  const category = (rate: number) => (seller.vatPayer ? (rate > 0 ? 'S' : 'E') : 'O')
  const reason = (rate: number) => (category(rate) === 'O' ? 'Dodávateľ nie je platiteľom DPH' : category(rate) === 'E' ? 'Oslobodené od DPH' : null)
  const taxCategory = (rate: number) =>
    `<cac:TaxCategory><cbc:ID>${category(rate)}</cbc:ID>${seller.vatPayer ? `<cbc:Percent>${rate}</cbc:Percent>` : ''}${reason(rate) ? `<cbc:TaxExemptionReason>${reason(rate)}</cbc:TaxExemptionReason>` : ''}<cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory>`
  const vatId = (icdph: string | null) => (seller.vatPayer ? icdph : null)
  const party = (p: { name: string; ico: string | null; dic: string | null; icdph: string | null; address: string | null }) =>
    [
      '<cac:Party>',
      p.dic ? `<cbc:EndpointID schemeID="0245">${esc(p.dic)}</cbc:EndpointID>` : '',
      `<cac:PartyName><cbc:Name>${esc(p.name)}</cbc:Name></cac:PartyName>`,
      `<cac:PostalAddress>${p.address ? `<cbc:StreetName>${esc(p.address)}</cbc:StreetName>` : ''}<cac:Country><cbc:IdentificationCode>SK</cbc:IdentificationCode></cac:Country></cac:PostalAddress>`,
      p.icdph ? `<cac:PartyTaxScheme><cbc:CompanyID>${esc(p.icdph)}</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>` : '',
      `<cac:PartyLegalEntity><cbc:RegistrationName>${esc(p.name)}</cbc:RegistrationName>${p.ico ? `<cbc:CompanyID>${esc(p.ico)}</cbc:CompanyID>` : ''}</cac:PartyLegalEntity>`,
      '</cac:Party>',
    ].join('')
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">',
    '<cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>',
    '<cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>',
    `<cbc:ID>${esc(invoice.number ?? '')}</cbc:ID>`,
    `<cbc:IssueDate>${invoice.issuedOn}</cbc:IssueDate>`,
    `<cbc:DueDate>${invoice.dueOn}</cbc:DueDate>`,
    '<cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>',
    invoice.note ? `<cbc:Note>${esc(invoice.note)}</cbc:Note>` : '',
    '<cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode>',
    `<cbc:BuyerReference>${esc(invoice.number ?? '')}</cbc:BuyerReference>`,
    `<cac:AccountingSupplierParty>${party({ name: seller.name, ico: seller.ico, dic: seller.dic, icdph: vatId(seller.icdph), address: seller.address })}</cac:AccountingSupplierParty>`,
    `<cac:AccountingCustomerParty>${party({ name: invoice.customerName, ico: invoice.customerIco, dic: invoice.customerDic, icdph: vatId(invoice.customerIcdph), address: invoice.customerAddress })}</cac:AccountingCustomerParty>`,
    `<cac:Delivery><cbc:ActualDeliveryDate>${invoice.deliveredOn}</cbc:ActualDeliveryDate></cac:Delivery>`,
    `<cac:PaymentMeans><cbc:PaymentMeansCode>30</cbc:PaymentMeansCode><cbc:PaymentID>${esc(invoice.number ?? '')}</cbc:PaymentID>${invoice.iban ? `<cac:PayeeFinancialAccount><cbc:ID>${esc(plainIban(invoice.iban))}</cbc:ID></cac:PayeeFinancialAccount>` : ''}</cac:PaymentMeans>`,
    `<cac:TaxTotal><cbc:TaxAmount currencyID="EUR">${amount(totals.vat)}</cbc:TaxAmount>${totals.rates
      .map((r) => `<cac:TaxSubtotal><cbc:TaxableAmount currencyID="EUR">${amount(r.base)}</cbc:TaxableAmount><cbc:TaxAmount currencyID="EUR">${amount(r.vat)}</cbc:TaxAmount>${taxCategory(r.rate)}</cac:TaxSubtotal>`)
      .join('')}</cac:TaxTotal>`,
    `<cac:LegalMonetaryTotal><cbc:LineExtensionAmount currencyID="EUR">${amount(totals.base)}</cbc:LineExtensionAmount><cbc:TaxExclusiveAmount currencyID="EUR">${amount(totals.base)}</cbc:TaxExclusiveAmount><cbc:TaxInclusiveAmount currencyID="EUR">${amount(totals.total)}</cbc:TaxInclusiveAmount><cbc:PayableAmount currencyID="EUR">${amount(totals.total)}</cbc:PayableAmount></cac:LegalMonetaryTotal>`,
    ...lines.map(
      (line) =>
        `<cac:InvoiceLine><cbc:ID>${line.position}</cbc:ID><cbc:InvoicedQuantity unitCode="${UNIT_CODES[line.unit ?? 'ks'] ?? 'C62'}">${(line.unitCents < 0 ? -line.quantityMilli : line.quantityMilli) / 1000}</cbc:InvoicedQuantity><cbc:LineExtensionAmount currencyID="EUR">${amount(line.baseCents)}</cbc:LineExtensionAmount><cac:Item><cbc:Name>${esc(line.description)}</cbc:Name><cac:ClassifiedTaxCategory><cbc:ID>${category(line.vatRate)}</cbc:ID>${seller.vatPayer ? `<cbc:Percent>${line.vatRate}</cbc:Percent>` : ''}<cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:ClassifiedTaxCategory></cac:Item><cac:Price><cbc:PriceAmount currencyID="EUR">${amount(Math.abs(line.unitCents))}</cbc:PriceAmount></cac:Price></cac:InvoiceLine>`,
    ),
    '</Invoice>',
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
  (SELECT p.booked_on FROM links l JOIN payments p ON p.id = l.payment_id WHERE l.document_id = i.document_id ORDER BY p.booked_on LIMIT 1) AS paid_on`

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
  }
}

export type InvoiceState = 'draft' | 'unpaid' | 'overdue' | 'paid'

export function stateOf(invoice: Pick<StoredInvoice, 'status' | 'paidOn' | 'dueOn'>, today: string): InvoiceState {
  if (invoice.status === 'draft') return 'draft'
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
    .prepare(`SELECT ${INVOICE_COLUMNS} FROM invoices i LEFT JOIN users u ON u.id = i.created_by WHERE i.company_id = ? AND i.status = 'issued' AND substr(i.issued_on, 1, 4) = ? ORDER BY i.seq, i.created_at LIMIT 20000`)
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

/** Writes an invoice and its lines: a draft has no number; an issued one takes the next of its year in the same step. */
export function saveInvoiceStatements(
  db: D1Database,
  args: { id: string; company: string; user: string; issue: boolean; values: InvoiceValues; lines: Line[]; totals: Totals; issued: string; delivered: string; due: string; token: string; iban: string | null; documentId: string },
): D1PreparedStatement[] {
  const v = args.values
  const year = Number(args.issued.slice(0, 4))
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
           issued_on, delivered_on, due_on, note, base_cents, vat_cents, total_cents, iban, token)
         SELECT ?1, ?2, ?3, ?4, ?5,
           CASE WHEN ?5 = 'issued' THEN CAST(?6 AS INTEGER) END,
           CASE WHEN ?5 = 'issued' THEN next.seq END,
           CASE WHEN ?5 = 'issued' THEN printf('%d%04d', ?6, next.seq) END,
           ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21
         FROM (SELECT COALESCE(MAX(seq), 0) + 1 AS seq FROM invoices WHERE company_id = ?2 AND year = ?6) AS next`,
      )
      .bind(args.id, args.company, now(), args.user, args.issue ? 'issued' : 'draft', year, ...fields, args.token),
    // An issued invoice is a document of the company at once: the accountant books it, and the payment that pays it
    // is paired with it by its number, which is its variable symbol.
    ...(args.issue
      ? [
          db
            .prepare(
              `INSERT INTO documents (id, company_id, created_at, source, added_by, status, read_by, kind, party, party_ico, number, vs,
                 issued_on, due_on, total_cents, vat_cents, currency, category, invoice_id)
               SELECT ?, company_id, created_at, 'issued', created_by, 'read', 'issued', 'invoice_out', customer_name, customer_ico, number, number,
                 issued_on, due_on, total_cents, vat_cents, 'EUR', 'sales', id
               FROM invoices WHERE id = ? AND company_id = ? AND status = 'issued'`,
            )
            .bind(args.documentId, args.id, args.company),
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
