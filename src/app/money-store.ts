// What the money view loads: the issued invoices with something left to pay, the received ones with something left to
// pay, and the taxes and payroll the deadlines know. The view itself (money.ts) is pure; this file only reads.
import type { Due } from '../team/deadlines'
import { app, monthName } from './copy'
import { periodName } from './vat-store'
import type { MoneyItem } from './money'
import { REMAINING_SQL } from './store'

type Row = Record<string, unknown>
const str = (v: unknown) => (typeof v === 'string' ? v : null)

/** An issued invoice's remaining amount in its own currency, over the alias i: its total less its paid euros,
 *  converted at the invoice's booked rate when it is foreign. */
export const ISSUED_REMAINING = `COALESCE(i.total_cents, 0) - CASE
  WHEN COALESCE(i.currency, 'EUR') = 'EUR' THEN COALESCE((SELECT SUM(COALESCE(l.amount_cents, ABS(p.amount_cents)))
    FROM links l JOIN payments p ON p.id = l.payment_id WHERE l.document_id = i.document_id AND p.currency = 'EUR'), 0)
  ELSE ROUND(COALESCE((SELECT SUM(COALESCE(l.amount_cents, ABS(p.amount_cents)))
    FROM links l JOIN payments p ON p.id = l.payment_id WHERE l.document_id = i.document_id AND p.currency = 'EUR'), 0) * CAST(REPLACE(i.fx_rate, ',', '.') AS REAL)) END`

/** The company's issued invoices with something left to pay: the money the view expects to come in. */
export async function unpaidIssued(db: D1Database, company: string): Promise<MoneyItem[]> {
  const rows = await db
    .prepare(
      `SELECT i.due_on AS day, ${ISSUED_REMAINING} AS cents, i.number AS number, i.customer_name AS name FROM invoices i
        WHERE i.company_id = ? AND i.status = 'issued' AND i.kind = 'invoice' AND i.due_on IS NOT NULL AND i.total_cents > 0
          AND ${ISSUED_REMAINING} > 0
          AND NOT EXISTS (SELECT 1 FROM ledger_entries ce WHERE ce.document_id = i.document_id AND ce.kind = 'cash' AND ce.deleted_at IS NULL)
        ORDER BY i.due_on LIMIT 100`,
    )
    .bind(company)
    .all<Row>()
  return rows.results.map((r) => ({ day: String(r.day), cents: Number(r.cents), label: app.home.invoiceOut(str(r.number), str(r.name)) }))
}

/** The received invoices with something left to pay: a known outflow, by its due day. Firmony's own invoices are
 *  not among them; the billing holds those separately and the view adds them from the same list as the deadlines. */
export async function unpaidReceived(db: D1Database, company: string): Promise<MoneyItem[]> {
  const rows = await db
    .prepare(
      `SELECT d.due_on AS day, ${REMAINING_SQL} AS cents, d.number AS number, d.party AS name FROM documents d
        WHERE d.company_id = ? AND d.kind = 'invoice_in' AND d.source <> 'firmony' AND d.deleted_at IS NULL AND d.duplicate_of IS NULL
          AND d.due_on IS NOT NULL AND d.total_cents > 0
          AND ${REMAINING_SQL} > 0
          AND NOT EXISTS (SELECT 1 FROM ledger_entries ce WHERE ce.document_id = d.id AND ce.kind = 'cash' AND ce.deleted_at IS NULL)
        ORDER BY d.due_on LIMIT 100`,
    )
    .bind(company)
    .all<Row>()
  return rows.results.map((r) => ({ day: String(r.day), cents: Number(r.cents), label: app.home.invoiceIn(str(r.number), str(r.name)) }))
}

/**
 * The known outflows, from the same deadlines the client and the accountant see: the taxes a filed return asks for
 * and the payroll, with Firmony's own unpaid invoices and the received ones added. A done due pays nothing more.
 */
export function moneyOutgoings(
  dues: readonly Due[],
  bills: readonly { number: string; totalCents: number; dueOn: string }[],
  received: readonly MoneyItem[],
): MoneyItem[] {
  const out: MoneyItem[] = []
  for (const d of dues) {
    if (d.state === 'done' || d.cents <= 0) continue
    const period = d.period ?? ''
    if (d.kind === 'vatPay') out.push({ day: d.day, cents: d.cents, label: app.deadline.vatPay(periodName(period)) })
    else if (d.kind === 'taxPay') out.push({ day: d.day, cents: d.cents, label: app.deadline.taxPay(String(period)) })
    else if (d.kind === 'taxAdvance') out.push({ day: d.day, cents: d.cents, label: app.deadline.taxAdvance })
    else if (d.kind === 'transactionTax') out.push({ day: d.day, cents: d.cents, label: app.deadline.transactionTax(monthName(`${period}-01`)) })
    else if (d.kind === 'dividendTax') out.push({ day: d.day, cents: d.cents, label: app.deadline.dividendTax(String(period)) })
    else if (d.kind === 'payrollPay') out.push({ day: d.day, cents: d.cents, label: app.deadline.payrollPay(monthName(`${period}-01`)) })
  }
  for (const b of bills) out.push({ day: b.dueOn, cents: b.totalCents, label: app.home.ourBill(b.number) })
  out.push(...received)
  return out
}
