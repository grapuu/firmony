// What the client sends with an invoice (26 October 2026). Firmony emails no invoice to a customer: the client
// downloads its PDF, shares it from the phone, or opens his own email program with the text written here (a mailto:
// link), or copies the customer's link. The texts are the client's own, signed by the company, and say what the old
// emails said: what the document is, its number, the amount, the due day, the account and the variable symbol when there
// is something to pay, and the link where the customer finds the PDF and the QR code.
import { formatMoney, groupIban } from '../format'
import { app, dayName } from './copy'
import { kindName, vsOf } from './invoice-sheet'
import type { StoredInvoice } from './invoices'
import type { Company } from './store'

const tx = app.invoices.send

export interface InvoiceMessage {
  subject: string
  body: string
  /** The few words that go with the PDF from a phone's share sheet. */
  short: string
}

/** Plain text for a mail program or a chat: spaces where the page keeps words together. */
const plain = (text: string) => text.replace(/[   ]/g, ' ')

/** The longest mailto: link written; a mail program may refuse a longer one. */
export const MAILTO_MAX = 1800

/**
 * The message that goes with an invoice, or, with `reminder`, with an invoice not paid by its due day. `asked` is what
 * it still asks for (after its credit notes); `payable` whether the customer is to pay it now (not paid, an account to
 * pay to), and `qr` whether its PDF carries the QR code.
 */
export function invoiceMessage(
  invoice: StoredInvoice,
  seller: Pick<Company, 'name' | 'vatPayer'>,
  link: string,
  options: { asked: number; payable: boolean; qr: boolean; reminder?: boolean; limit?: { reason: number; company: number } },
): InvoiceMessage {
  const number = invoice.number ?? ''
  const company = options.limit && seller.name.length > options.limit.company ? `${seller.name.slice(0, options.limit.company).trim()}…` : seller.name
  const reason = options.limit?.reason === 0 ? null : invoice.reason && options.limit && invoice.reason.length > options.limit.reason ? `${invoice.reason.slice(0, options.limit.reason).trim()}…` : invoice.reason
  const money = (cents: number) => plain(formatMoney(cents, invoice.currency))
  const day = (d: string) => plain(dayName(d))
  const proforma = invoice.kind === 'proforma'
  const vs = vsOf(invoice)
  const pay = options.payable && invoice.iban && vs ? [tx.pay(groupIban(invoice.iban), vs), ...(options.qr ? [tx.qr] : [])].join(' ') : null
  const kind = kindName(invoice, seller.vatPayer)
  if (options.reminder) {
    const total = money(options.asked)
    const body = [
      tx.hello,
      '',
      tx.reminder(number, total, day(invoice.dueOn), proforma, options.asked !== invoice.totalCents),
      ...(pay ? ['', pay] : []),
      '',
      tx.reminderLink,
      link,
      '',
      tx.paid,
      '',
      tx.regards,
      company,
    ]
    return {
      subject: plain(tx.reminderSubject(number, company, proforma)),
      body: plain(body.join('\n')),
      short: plain(`${tx.shortReminder(number, total, day(invoice.dueOn))} ${tx.shortLink(link)}`),
    }
  }
  const total = money(invoice.kind === 'credit' ? Math.abs(invoice.totalCents) : invoice.totalCents)
  const lead =
    invoice.kind === 'credit'
      ? tx.credit(number, invoice.correctsNumber ?? '', total)
      : invoice.kind === 'advance'
        ? tx.advance(number, invoice.relatesNumber ?? '', total, day(invoice.deliveredOn), seller.vatPayer)
        : proforma
          ? tx.proforma(number, total, day(invoice.dueOn))
          : tx.invoice(number, total, day(invoice.dueOn))
  const body = [
    tx.hello,
    '',
    lead,
    ...(invoice.kind === 'credit' && reason ? ['', tx.reason(reason)] : []),
    ...(pay ? ['', pay] : []),
    '',
    tx.openLine(tx.open[invoice.kind] ?? tx.open.invoice ?? ''),
    link,
    '',
    tx.regards,
    company,
  ]
  const due = invoice.kind === 'invoice' || proforma ? ` ${tx.shortDue(day(invoice.dueOn))}` : ''
  return {
    subject: plain(tx.subject(kind, number, company)),
    body: plain(body.join('\n')),
    short: plain(`${tx.short(kind, number, company, total)}${options.payable ? due : ''} ${options.qr ? tx.shortLink(link) : tx.shortLinkPlain(link)}`),
  }
}

/** A mailto: link to the customer's address (or none, for the person to type), with the subject and the text. */
export function mailtoOf(to: string | null, message: Pick<InvoiceMessage, 'subject' | 'body'>): string {
  // RFC 6068: every character but the address's @ percent-encoded, lines broken by CRLF.
  const address = to ? encodeURIComponent(to).replace(/%40/g, '@') : ''
  return `mailto:${address}?subject=${encodeURIComponent(message.subject)}&body=${encodeURIComponent(message.body.replace(/\n/g, '\r\n'))}`
}

/** The mailto: link of an invoice's message, shortened (a long reason, a long company name) to stay within MAILTO_MAX. */
export function invoiceMailto(
  invoice: StoredInvoice,
  seller: Pick<Company, 'name' | 'vatPayer'>,
  link: string,
  options: { asked: number; payable: boolean; qr: boolean; reminder?: boolean },
): string {
  for (const limit of [undefined, { reason: 160, company: 200 }, { reason: 60, company: 60 }, { reason: 0, company: 30 }]) {
    const href = mailtoOf(invoice.customerEmail, invoiceMessage(invoice, seller, link, { ...options, limit }))
    if (href.length <= MAILTO_MAX) return href
  }
  return mailtoOf(null, invoiceMessage(invoice, seller, link, { ...options, limit: { reason: 0, company: 30 } }))
}
