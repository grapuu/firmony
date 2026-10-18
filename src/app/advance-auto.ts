// The tax document of an advance received, issued by itself (18 October 2026). § 73 of the VAT Act asks for it within
// 15 days of the payment; it is wholly given by the request and the payment (the amount split by the request's rates,
// the day received), so nobody needs to click it: when money comes on a request's variable symbol, pairing issues its
// document (`autoAdvances`, called by `matchCompany`), links it to the payment and, when the request was sent to the
// customer by email, sends the document too. The request's page still has the button for one that waits (a payment
// read before this was built).
//
// The rule, said plainly:
// - A payment in, on the symbol of an issued request, that has no tax document and no document paired to it.
// - Not after the request's final invoice (money then pays that invoice), not for a VAT payer's request without
//   Slovak VAT (none can be made), not after the contract's service ended.
// - One document a payment: the unique index on invoices.payment_id makes a second try fail whole.
import { BRAND } from '../config'
import { formatMoney } from '../format'
import { queueStatement } from '../mail'
import { bratislavaDay } from '../time'
import { app, dayName } from './copy'
import { serviceOpen } from './ending'
import { advanceLines, advancePayments, finalOf, getInvoice, invoiceLines, saveInvoiceStatements, totalsOf, type InvoiceValues, type StoredInvoice } from './invoices'
import { newToken } from './session'
import { eventStatement, getCompany, linkStatement, type Company } from './store'

const ti = app.invoices

/** Issues the tax document of each payment on a request's symbol that has none; returns the documents made. */
export async function issueAdvances(db: D1Database, company: Company, request: StoredInvoice, user: string | null, how: 'client' | 'auto'): Promise<{ invoiceId: string; documentId: string }[]> {
  if (!request.vs || request.kind !== 'proforma' || request.status !== 'issued') return []
  const today = bratislavaDay(Math.floor(Date.now() / 1000))
  if (!serviceOpen(company, today)) return []
  if ((company.vatPayer && request.mode !== 'domestic') || (await finalOf(db, company.id, request.id))) return []
  const pending = (await advancePayments(db, company.id, request.vs)).filter((p) => !p.documented)
  if (pending.length === 0) return []
  const requestLines = await invoiceLines(db, request.id)
  const out: { invoiceId: string; documentId: string }[] = []
  for (const payment of pending) {
    // A payment the client gave another document is not an advance.
    if (how === 'auto' && (await db.prepare('SELECT 1 AS x FROM links WHERE payment_id = ?').bind(payment.id).first())) continue
    const lines = advanceLines(requestLines, payment.amountCents, company.vatPayer, (rate) =>
      company.vatPayer ? ti.form.advanceLine(request.number ?? '', rate) : ti.form.advanceLineNoVat(request.number ?? ''),
    )
    if (lines.length === 0) continue
    const values: InvoiceValues = {
      customerName: request.customerName,
      customerAddress: request.customerAddress ?? '',
      customerIco: request.customerIco ?? '',
      customerDic: request.customerDic ?? '',
      customerIcdph: request.customerIcdph ?? '',
      customerCountry: request.customerCountry ?? '',
      customerEmail: request.customerEmail ?? '',
      issued: today,
      delivered: payment.bookedOn,
      due: payment.bookedOn,
      iban: '',
      note: '',
      lines: [],
      mode: request.mode,
      reverseKind: request.reverse?.kind ?? '',
      reverseCode: request.reverse?.code ?? '',
    }
    const invoiceId = crypto.randomUUID()
    const documentId = crypto.randomUUID()
    const by = user ?? request.createdBy ?? ''
    try {
      await db.batch([
        ...saveInvoiceStatements(db, {
          id: invoiceId,
          company: company.id,
          user: by,
          issue: true,
          values,
          lines,
          totals: totalsOf(lines, company.vatPayer),
          issued: today,
          delivered: payment.bookedOn,
          due: payment.bookedOn,
          token: newToken(),
          iban: null,
          documentId,
          kind: 'advance',
          relates: request.id,
          payment: payment.id,
        }),
        linkStatement(db, company.id, payment.id, documentId, how === 'auto' ? 'auto' : 'client', user),
        eventStatement(db, { company: company.id, user, action: 'invoice.advance', subject: invoiceId, detail: { request: request.id, payment: payment.id, total: payment.amountCents, how } }),
      ])
    } catch (err) {
      // The payment got its document meanwhile (a second click, a second run): nothing more is made for it.
      console.error('an advance failed', err instanceof Error ? err.name : 'error')
      continue
    }
    out.push({ invoiceId, documentId })
    await mailAdvance(db, company, request, invoiceId)
  }
  return out
}

/** Sends an advance's document to the customer when the request went to the customer by email. */
async function mailAdvance(db: D1Database, company: Company, request: StoredInvoice, invoiceId: string): Promise<void> {
  if (!request.sentAt || !request.customerEmail) return
  const invoice = await getInvoice(db, company.id, invoiceId)
  if (!invoice?.number) return
  const from = request.createdBy ? await db.prepare('SELECT email FROM users WHERE id = ?').bind(request.createdBy).first<{ email: string }>() : null
  await db.batch([
    queueStatement(db, {
      key: `invoice:send:${invoice.id}:advance`,
      to: request.customerEmail,
      replyTo: from?.email ?? null,
      subject: ti.mail.advanceSubject(invoice.number, company.name, company.vatPayer),
      body: ti.mail.advanceBody(
        company.name,
        invoice.number,
        request.number ?? '',
        formatMoney(invoice.totalCents, invoice.currency).replace(/ /g, ' '),
        dayName(invoice.deliveredOn).replace(/ /g, ' '),
        `${BRAND.origin}/f/${invoice.token}`,
        company.vatPayer,
      ),
    }),
    db.prepare('UPDATE invoices SET sent_at = ? WHERE id = ? AND company_id = ?').bind(Math.floor(Date.now() / 1000), invoice.id, company.id),
  ])
}

/** The requests of a company with money on their symbol that has no document yet: their documents, made. */
export async function autoAdvances(db: D1Database, companyId: string): Promise<number> {
  // A bank may write the symbol with noughts in front; a request is in euros, so money in another currency is no
  // advance on it; a request with its final invoice takes no more (money on its symbol then pays the invoice), and so
  // holds no place among the twenty.
  const rows = await db
    .prepare(
      `SELECT i.id FROM invoices i JOIN payments p ON p.company_id = i.company_id AND ltrim(p.vs, '0') = ltrim(i.vs, '0')
        WHERE i.company_id = ? AND i.kind = 'proforma' AND i.status = 'issued' AND i.vs IS NOT NULL AND p.amount_cents > 0
          AND COALESCE(p.currency, 'EUR') = 'EUR'
          AND NOT EXISTS (SELECT 1 FROM invoices a WHERE a.payment_id = p.id)
          AND NOT EXISTS (SELECT 1 FROM links l WHERE l.payment_id = p.id)
          AND NOT EXISTS (SELECT 1 FROM invoices f WHERE f.company_id = i.company_id AND f.relates = i.id AND f.kind = 'invoice' AND f.status = 'issued')
        GROUP BY i.id ORDER BY MIN(p.booked_on), i.id
        LIMIT 20`,
    )
    .bind(companyId)
    .all<{ id: string }>()
  if (rows.results.length === 0) return 0
  const company = await getCompany(db, companyId)
  if (!company) return 0
  let made = 0
  for (const row of rows.results) {
    const request = await getInvoice(db, companyId, row.id)
    if (request) made += (await issueAdvances(db, company, request, null, 'auto')).length
  }
  return made
}
