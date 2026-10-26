// The invoice as paper, as data (26 October 2026): every text the sheet prints, in its order, worked out once. The
// page's sheet (views/invoices.tsx, InvoiceSheet) and the PDF (invoice-pdf.ts) both draw this model, so the two can
// never say different things: the same fields, the same legal sentences, the same amounts and the same QR code.
import { formatEurExact, formatMoney, groupIban } from '../format'
import { app, dayName } from './copy'
import { rateMicro } from './fx'
import { COUNTRIES, INTEREST_NOTE, MODE_TERMS, customerCountryOf, eurVat, totalsOf, type Line, type StoredInvoice } from './invoices'
import { payBySquare, qrPicture, type QrPicture } from './paybysquare'
import type { Company } from './store'

const t = app.invoices
const s = t.sheet

/** What a document is called: a credit note is a "Dobropis", an invoice a "Faktúra". */
export const kindName = (i: Pick<StoredInvoice, 'kind'>, vatPayer = true): string => (i.kind === 'advance' && !vatPayer ? s.advanceNoVat : (s.kinds[i.kind] ?? s.title))

/** The variable symbol the customer pays by: a request for an advance has its own, an advance's tax document none (it is paid), an invoice its number. */
export const vsOf = (i: Pick<StoredInvoice, 'kind' | 'vs' | 'number'>): string | null => (i.kind === 'proforma' ? i.vs : i.kind === 'advance' ? null : (i.vs ?? i.number))

/** A quantity as the sheet writes it: "2", "2,5", "0,125". */
export const qty = (milli: number): string => (milli % 1000 === 0 ? String(milli / 1000) : (milli / 1000).toFixed(3).replace(/0+$/, '').replace('.', ','))

/** The QR code a bank's app pays from, for an issued invoice with an account and something to pay. */
function payQr(invoice: StoredInvoice, total: number, seller: Company): QrPicture | null {
  const vs = vsOf(invoice)
  if (!invoice.number || !invoice.iban || !vs) return null
  const text = payBySquare({ iban: invoice.iban, amountCents: total, vs, due: invoice.dueOn, name: seller.name, note: `${kindName(invoice)} ${invoice.number}` })
  return text ? qrPicture(text) : null
}

export interface SheetPair {
  label: string
  value: string
}

export interface SheetParty {
  name: string
  /** The address and, abroad, the state: one line each. */
  lines: string[]
  /** IČO, DIČ, IČ DPH, those it has. */
  ids: SheetPair[]
}

export interface SheetRow {
  description: string
  /** The quantity and its unit ("2 hod"). */
  quantity: string
  /** What a narrow screen shows under the description: quantity, unit, price and rate. */
  info: string
  unitPrice: string
  /** The rate ("23 %"), for a VAT payer only. */
  vat: string | null
  amount: string
}

export interface InvoiceSheetModel {
  /** The document's name (Faktúra, Dobropis, Zálohová faktúra, ...) and whether it is a long one. */
  kind: string
  long: boolean
  /** "č. 20260001" (a draft: its name). */
  number: string
  /** The request it belongs to, the invoice it corrects. */
  refs: string[]
  supplierLabel: string
  customerLabel: string
  seller: SheetParty
  customer: SheetParty
  dates: SheetPair[]
  /** The table's head; `vat` only for a VAT payer. */
  head: { description: string; quantity: string; unitPrice: string; vat: string | null; amount: string }
  rows: SheetRow[]
  /** A credit note's reason. */
  reason: SheetPair | null
  /** What the law asks an invoice without Slovak VAT to say, or why late interest has none. */
  mode: string | null
  /** A request for an advance is no tax document. */
  proforma: string | null
  qr: QrPicture | null
  qrCaption: { text: string; brand: string; label: string }
  /** How to pay (none for a credit note or an advance's tax document). */
  pay: SheetPair[] | null
  /** Base and VAT rate by rate (a VAT payer). */
  totals: SheetPair[]
  total: SheetPair
  /** Another currency: the VAT also in euros. */
  eur: SheetPair[]
  /** Another currency: its rate. */
  fx: string | null
  note: string | null
  /** The legal lines at the foot: no VAT payer, the register entry. */
  legal: string[]
  /** Who issued it. */
  by: string | null
  /** The legal lines and who issued it, as the sheet's foot prints them. */
  foot: string[]
}

/**
 * The sheet of an issued invoice (or a draft's preview): `pay` false leaves out the QR code (a paid invoice is not paid
 * twice). A credit note and the tax document of money received carry no QR code and no way to pay; Slovak banks pay a
 * QR code in euros only.
 */
export function sheetOf(invoice: StoredInvoice, lines: Line[], seller: Company, pay = true): InvoiceSheetModel {
  const credit = invoice.kind === 'credit'
  const money = (cents: number) => formatMoney(cents, invoice.currency)
  const fx = invoice.currency !== 'EUR' ? rateMicro(invoice.fxRate) : null
  const totals = totalsOf(lines, seller.vatPayer)
  const qr = pay && !credit && invoice.kind !== 'advance' && invoice.currency === 'EUR' ? payQr(invoice, totals.total, seller) : null
  const ids = (ico: string | null, dic: string | null, icdph: string | null): SheetPair[] => [
    ...(ico ? [{ label: s.ico, value: ico }] : []),
    ...(dic ? [{ label: s.dic, value: dic }] : []),
    ...(icdph ? [{ label: s.icdph, value: icdph }] : []),
  ]
  const country = customerCountryOf(invoice)
  const vs = vsOf(invoice)
  const euro = fx && seller.vatPayer ? eurVat(totals, fx) : null
  const legal = [...(seller.vatPayer ? [] : [s.noVat]), ...(seller.registerLine ? [seller.registerLine] : [])]
  const by = invoice.createdByName ? s.by(invoice.createdByName) : null
  return {
    kind: kindName(invoice, seller.vatPayer),
    long: invoice.kind === 'advance',
    number: invoice.number ? s.number(invoice.number) : t.draftName,
    refs: [
      ...(invoice.relatesNumber ? [s.relates(invoice.relatesNumber)] : []),
      ...(credit && invoice.correctsNumber && invoice.correctsIssuedOn ? [s.corrects(invoice.correctsNumber, dayName(invoice.correctsIssuedOn))] : []),
    ],
    supplierLabel: s.supplier,
    customerLabel: s.customer,
    seller: { name: seller.name, lines: seller.address ? [seller.address] : [], ids: ids(seller.ico, seller.dic, seller.icdph) },
    customer: {
      name: invoice.customerName,
      lines: [...(invoice.customerAddress ? [invoice.customerAddress] : []), ...(country !== 'SK' ? [COUNTRIES[country] ?? country] : [])],
      ids: ids(invoice.customerIco, invoice.customerDic, invoice.customerIcdph),
    },
    dates: [
      { label: s.issued, value: dayName(invoice.issuedOn) },
      { label: invoice.kind === 'advance' ? s.received : s.delivered, value: dayName(invoice.deliveredOn) },
      ...(invoice.kind === 'advance' ? [] : [{ label: s.due, value: dayName(invoice.dueOn) }]),
      ...(vs ? [{ label: s.vs, value: vs }] : []),
    ],
    head: { description: s.description, quantity: s.quantity, unitPrice: s.unitPrice, vat: seller.vatPayer ? s.vat : null, amount: s.amount },
    rows: lines.map((line) => ({
      description: line.description,
      quantity: `${qty(line.quantityMilli)} ${line.unit ?? ''}`,
      info: `${qty(line.quantityMilli)} ${line.unit ?? ''} × ${money(line.unitCents)}${seller.vatPayer ? `, ${s.vat} ${line.vatRate} %` : ''}`,
      unitPrice: money(line.unitCents),
      vat: seller.vatPayer ? `${line.vatRate} %` : null,
      amount: money(line.baseCents),
    })),
    reason: credit && invoice.reason ? { label: s.reason, value: invoice.reason } : null,
    mode: invoice.interestOf ? INTEREST_NOTE : seller.vatPayer && invoice.mode !== 'domestic' ? MODE_TERMS[invoice.mode].text : null,
    proforma: invoice.kind === 'proforma' ? s.proformaNote : null,
    qr,
    qrCaption: { text: s.qr, brand: 'PAY by square', label: s.qrLabel },
    pay:
      credit || invoice.kind === 'advance'
        ? null
        : [{ label: s.method, value: s.transfer }, ...(invoice.iban ? [{ label: s.iban, value: groupIban(invoice.iban) }] : []), ...(vs ? [{ label: s.vs, value: vs }] : [])],
    totals: seller.vatPayer
      ? totals.rates.flatMap((r) => [
          { label: s.base(r.rate), value: money(r.base) },
          { label: s.vatOf(r.rate), value: money(r.vat) },
        ])
      : [],
    total: { label: credit ? s.creditTotal : invoice.kind === 'advance' ? s.advanceTotal : s.total, value: money(totals.total) },
    eur: euro
      ? [...euro.rates.filter((r) => r.rate > 0).map((r) => ({ label: s.vatEur(r.rate), value: formatEurExact(r.vat) })), { label: s.vatEurTotal, value: formatEurExact(euro.vat) }]
      : [],
    fx: fx && invoice.fxRate ? (invoice.fxDay ? s.fx(invoice.currency, invoice.fxRate, dayName(invoice.fxDay)) : s.fxTyped(invoice.currency, invoice.fxRate)) : null,
    note: invoice.note,
    legal,
    by,
    foot: [...legal, ...(by ? [by] : [])],
  }
}
