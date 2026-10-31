// Payment orders (18 October 2026): the suppliers' invoices the company still owes, put in one file its bank imports
// as a batch of SEPA credit transfers (pain.001.001.03, ISO 20022), so a company with many invoices pays them in one
// signature instead of typing each.
//
// What it leans on:
// - The schema pain.001.001.03 (ISO 20022, 2009; kept as test/xsd/pain.001.001.03.xsd, from the Python package
//   sepaxml 2.7.0, which adds one comment naming iso20022.org as its source). Slovak banks import it as "SEPA XML".
// - The Slovak Banking Association's convention for payment symbols in SEPA (sbaonline.sk, "SEPA Slovakia payment
//   symbols"): the variable, specific and constant symbols go into the End-to-End Identification as
//   "/VS[N10]/SS[N10]/KS[N4]", an empty one as its bare prefix; with no reference at all, "NOTPROVIDED".
// - SEPA's character set is basic Latin: names and texts go without accents, other characters as spaces.
//
// The rule, said plainly:
// - Owed is a received invoice read or booked, in euros, more than nought, with no payment paired to it, not paid by the
//   owner himself or in cash (a cash document of the cash box), not deleted, not a suspected duplicate, not a prepayment invoice (386: money paid already) and not a
//   supplier's credit note (it corrects an invoice and its lines take back).
// - It goes into an order only with the supplier's IBAN (its check digits right); without one it is listed to pay by
//   hand. One in another currency is never in a SEPA order, nor a corrective invoice that adds (listed to pay by hand:
//   what it adds is seen on it, not in its total).
// - An order is kept with what it holds (payment_orders, payment_order_items), so the page says which invoices are in
//   an order already, and its file can be downloaded again. The bank's statement then pairs each payment with its
//   invoice by the symbol and the amount, as any payment.
import { now } from '../db'
import { isIban, plainIban } from './invoices'
import { normalizeVs } from './match'

type Row = Record<string, unknown>
const str = (v: unknown) => (typeof v === 'string' ? v : null)

export interface Payable {
  id: string
  party: string | null
  number: string | null
  vs: string | null
  iban: string | null
  issuedOn: string | null
  dueOn: string | null
  /** What is to be paid: the total, or what is left of it when a credit or a balance was set off (`documents.due_cents`). */
  totalCents: number
  currency: string
  /** The last order it is in, and that order's day of execution. */
  orderId: string | null
  orderedOn: string | null
  /** Why it cannot go into an order: no IBAN, an IBAN that is none, another currency, a corrective invoice, not approved yet. */
  blocked: 'iban' | 'currency' | 'correction' | 'approval' | null
}

/** The suppliers' invoices the company owes, the earliest due first. */
/**
 * A supplier's invoice that a payment order can pay, as SQL over `d`: something to pay, not paid by its prepayment
 * invoice (386) nor whole by a credit or a balance set off, not a credit note taking back (its lines minus). Approving asks
 * the same (`/app/schvalovanie`).
 */
export const PAYABLE_DOC = `d.total_cents > 0 AND d.prepaid = 0 AND COALESCE(d.due_cents, d.total_cents) > 0
         AND NOT (d.corrects IS NOT NULL AND COALESCE((SELECT SUM(COALESCE(json_extract(j.value, '$.base'), 0) + COALESCE(json_extract(j.value, '$.vat'), 0))
           FROM json_each(CASE WHEN json_valid(d.vat_lines) THEN d.vat_lines ELSE '[]' END) j), 0) < 0)`

export async function payables(db: D1Database, company: string, approvals = false): Promise<Payable[]> {
  const rows = await db
    .prepare(
      `SELECT d.id, d.party, d.number, d.vs, d.party_iban, d.issued_on, d.due_on, COALESCE(d.due_cents, d.total_cents) AS total_cents, COALESCE(d.currency, 'EUR') AS currency, d.approved_at, d.corrects,
         (SELECT o.id FROM payment_order_items oi JOIN payment_orders o ON o.id = oi.order_id WHERE oi.document_id = d.id ORDER BY o.created_at DESC LIMIT 1) AS order_id,
         (SELECT o.execute_on FROM payment_order_items oi JOIN payment_orders o ON o.id = oi.order_id WHERE oi.document_id = d.id ORDER BY o.created_at DESC LIMIT 1) AS ordered_on
       FROM documents d
       WHERE d.company_id = ? AND d.kind = 'invoice_in' AND d.deleted_at IS NULL AND d.paid_privately = 0 AND d.duplicate_of IS NULL
         AND (d.status = 'read' OR d.booked_at IS NOT NULL) AND ${PAYABLE_DOC}
         AND COALESCE(d.due_cents, d.total_cents) > COALESCE((SELECT SUM(ABS(p.amount_cents)) FROM links l JOIN payments p ON p.id = l.payment_id
             WHERE l.document_id = d.id AND p.currency = 'EUR' AND (SELECT COUNT(*) FROM links k WHERE k.payment_id = p.id) = 1), 0)
         AND NOT EXISTS (SELECT 1 FROM ledger_entries ce WHERE ce.document_id = d.id AND ce.kind = 'cash' AND ce.deleted_at IS NULL)
       ORDER BY COALESCE(d.due_on, d.issued_on, '9999-12-31'), d.created_at
       LIMIT 1000`,
    )
    .bind(company)
    .all<Row>()
  return rows.results.map((r) => {
    const iban = str(r.party_iban) ? plainIban(String(r.party_iban)) : null
    const currency = String(r.currency)
    return {
      id: String(r.id),
      party: str(r.party),
      number: str(r.number),
      vs: str(r.vs),
      iban,
      issuedOn: str(r.issued_on),
      dueOn: str(r.due_on),
      totalCents: Number(r.total_cents),
      currency,
      orderId: str(r.order_id),
      orderedOn: str(r.ordered_on),
      blocked: currency !== 'EUR' ? 'currency' : str(r.corrects) ? 'correction' : !iban || !isIban(iban) ? 'iban' : approvals && typeof r.approved_at !== 'number' ? 'approval' : null,
    }
  })
}

export interface PaymentOrder {
  id: string
  accountIban: string
  executeOn: string
  createdAt: number
  count: number
  totalCents: number
}

/** The company's orders, the newest first. */
export async function paymentOrders(db: D1Database, company: string, limit = 20): Promise<PaymentOrder[]> {
  const rows = await db
    .prepare('SELECT o.id, o.account_iban, o.execute_on, o.created_at, o.count, o.total_cents FROM payment_orders o WHERE o.company_id = ? ORDER BY o.created_at DESC LIMIT ?')
    .bind(company, limit)
    .all<Row>()
  return rows.results.map((r) => ({
    id: String(r.id),
    accountIban: String(r.account_iban),
    executeOn: String(r.execute_on),
    createdAt: Number(r.created_at),
    count: Number(r.count),
    totalCents: Number(r.total_cents),
  }))
}

/** Writes an order of the given payables from the given account (each must be owed and payable: checked here again). */
export function orderStatements(db: D1Database, args: { id: string; company: string; user: string; accountIban: string; executeOn: string; items: Payable[] }): D1PreparedStatement[] {
  const total = args.items.reduce((sum, p) => sum + p.totalCents, 0)
  return [
    db
      .prepare('INSERT INTO payment_orders (id, company_id, account_iban, execute_on, created_at, created_by, count, total_cents) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(args.id, args.company, args.accountIban, args.executeOn, now(), args.user, args.items.length, total),
    ...args.items.map((p) =>
      db
        .prepare('INSERT INTO payment_order_items (order_id, document_id, company_id, cents, iban, vs, party, number) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(args.id, p.id, args.company, p.totalCents, p.iban, p.vs, p.party, p.number),
    ),
  ]
}

export interface OrderItem {
  documentId: string
  cents: number
  iban: string
  vs: string | null
  party: string | null
  number: string | null
}

/** An order's items as it was made (the file is made again from them, the same each time). */
export async function orderItems(db: D1Database, company: string, order: string): Promise<{ order: PaymentOrder; items: OrderItem[] } | null> {
  const head = (await paymentOrders(db, company, 200)).find((o) => o.id === order)
  if (!head) return null
  const rows = await db.prepare('SELECT document_id, cents, iban, vs, party, number FROM payment_order_items WHERE order_id = ? AND company_id = ? ORDER BY rowid').bind(order, company).all<Row>()
  return {
    order: head,
    items: rows.results.map((r) => ({ documentId: String(r.document_id), cents: Number(r.cents), iban: String(r.iban), vs: str(r.vs), party: str(r.party), number: str(r.number) })),
  }
}

const esc = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** A text in SEPA's basic Latin set: accents off, anything else a space, cut to its length. */
export function sepaText(text: string, max: number): string {
  const plain = text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9/\-?:().,'+ ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return plain.slice(0, max).trim() || 'NOTPROVIDED'
}

/** The End-to-End Identification of a Slovak payment: its variable symbol, "/VS123/SS/KS", or NOTPROVIDED. */
export function endToEnd(vs: string | null): string {
  const digits = normalizeVs(vs)
  return digits && digits.length <= 10 ? `/VS${digits}/SS/KS` : 'NOTPROVIDED'
}

const amount = (cents: number) => `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`

/** The order as pain.001.001.03: one payment information block from the account, a credit transfer for each item. */
export function painXml(args: { id: string; company: string; accountIban: string; executeOn: string; createdAt: number; items: OrderItem[] }): string {
  const ref = args.id.replace(/-/g, '').slice(0, 35)
  const total = args.items.reduce((sum, i) => sum + i.cents, 0)
  const created = new Date(args.createdAt * 1000).toISOString().slice(0, 19)
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">',
    '<CstmrCdtTrfInitn>',
    `<GrpHdr><MsgId>${ref}</MsgId><CreDtTm>${created}</CreDtTm><NbOfTxs>${args.items.length}</NbOfTxs><CtrlSum>${amount(total)}</CtrlSum><InitgPty><Nm>${esc(sepaText(args.company, 70))}</Nm></InitgPty></GrpHdr>`,
    '<PmtInf>',
    `<PmtInfId>${ref}</PmtInfId><PmtMtd>TRF</PmtMtd><NbOfTxs>${args.items.length}</NbOfTxs><CtrlSum>${amount(total)}</CtrlSum>`,
    '<PmtTpInf><SvcLvl><Cd>SEPA</Cd></SvcLvl></PmtTpInf>',
    `<ReqdExctnDt>${args.executeOn}</ReqdExctnDt>`,
    `<Dbtr><Nm>${esc(sepaText(args.company, 70))}</Nm></Dbtr>`,
    `<DbtrAcct><Id><IBAN>${plainIban(args.accountIban)}</IBAN></Id></DbtrAcct>`,
    // Without the bank's BIC, which a SEPA payment in the EEA does not need (EPC: "NOTPROVIDED").
    '<DbtrAgt><FinInstnId><Othr><Id>NOTPROVIDED</Id></Othr></FinInstnId></DbtrAgt>',
    '<ChrgBr>SLEV</ChrgBr>',
    ...args.items.map(
      (i) =>
        `<CdtTrfTxInf><PmtId><EndToEndId>${endToEnd(i.vs)}</EndToEndId></PmtId><Amt><InstdAmt Ccy="EUR">${amount(i.cents)}</InstdAmt></Amt><Cdtr><Nm>${esc(sepaText(i.party ?? '', 70))}</Nm></Cdtr><CdtrAcct><Id><IBAN>${plainIban(i.iban)}</IBAN></Id></CdtrAcct><RmtInf><Ustrd>${esc(sepaText(`Faktura ${i.number ?? ''}`, 140))}</Ustrd></RmtInf></CdtTrfTxInf>`,
    ),
    '</PmtInf>',
    '</CstmrCdtTrfInitn>',
    '</Document>',
    '',
  ].join('\n')
}
