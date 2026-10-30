// What the money view loads: the issued invoices nobody has paid yet, the received ones the company has not paid,
// and the taxes and payroll the deadlines know. The view itself (money.ts) is pure; this file only reads.
import type { Due } from '../team/deadlines'
import { app, monthName } from './copy'
import { periodName } from './vat-store'
import type { MoneyItem } from './money'

type Row = Record<string, unknown>
const str = (v: unknown) => (typeof v === 'string' ? v : null)

/** The company's issued invoices nobody has paid yet: the money the view expects to come in. */
export async function unpaidIssued(db: D1Database, company: string): Promise<MoneyItem[]> {
  const rows = await db
    .prepare(
      `SELECT i.due_on AS day, i.total_cents AS cents, i.number AS number, i.customer_name AS name FROM invoices i
        WHERE i.company_id = ? AND i.status = 'issued' AND i.kind = 'invoice' AND i.due_on IS NOT NULL AND i.total_cents > 0
          AND NOT EXISTS (SELECT 1 FROM links l WHERE l.document_id = i.document_id)
        ORDER BY i.due_on LIMIT 100`,
    )
    .bind(company)
    .all<Row>()
  return rows.results.map((r) => ({ day: String(r.day), cents: Number(r.cents), label: app.home.invoiceOut(str(r.number), str(r.name)) }))
}

/** The received invoices the company has not paid yet: a known outflow, by its due day. Firmony's own invoices are
 *  not among them; the billing holds those separately and the view adds them from the same list as the deadlines. */
export async function unpaidReceived(db: D1Database, company: string): Promise<MoneyItem[]> {
  const rows = await db
    .prepare(
      `SELECT d.due_on AS day, d.total_cents AS cents, d.number AS number, d.party AS name FROM documents d
        WHERE d.company_id = ? AND d.kind = 'invoice_in' AND d.source <> 'firmony' AND d.deleted_at IS NULL AND d.duplicate_of IS NULL
          AND d.due_on IS NOT NULL AND d.total_cents > 0
          AND NOT EXISTS (SELECT 1 FROM links l WHERE l.document_id = d.id)
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
