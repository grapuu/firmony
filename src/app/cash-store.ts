// The cash box kept (18 October 2026, cash.ts): cash documents as ledger entries of the kind 'cash', numbered by year
// and side (PPD2026-001, VPD2026-001) in the statement that writes them, removed only by a mark; the bank payment that
// took cash out of the bank (or put it in) marked as money between the company's own accounts with it; and what the
// cash book and the form need.
import { now } from '../db'
import { CASH_KINDS, isCashKind, prefixOf, type CashKind } from './cash'
import type { LedgerLine } from './ledger'
import { eventStatement } from './store'

type Row = Record<string, unknown>
const str = (v: unknown) => (typeof v === 'string' ? v : null)

export interface CashEntry {
  id: string
  number: string
  kind: CashKind
  on: string
  /** Plus into the cash box, minus out of it. */
  cents: number
  party: string | null
  text: string
  documentId: string | null
  paymentId: string | null
  createdByName: string | null
}

/** A received document a company may pay in cash, or an issued one paid to it in cash: not paired, not paid otherwise. */
const PAYABLE_IN_CASH = `d.deleted_at IS NULL AND d.paid_privately = 0 AND d.duplicate_of IS NULL AND COALESCE(d.currency, 'EUR') = 'EUR' AND d.total_cents > 0
  AND (d.status = 'read' OR d.booked_at IS NOT NULL)
  AND NOT EXISTS (SELECT 1 FROM links l WHERE l.document_id = d.id)
  AND NOT EXISTS (SELECT 1 FROM ledger_entries ce WHERE ce.document_id = d.id AND ce.kind = 'cash' AND ce.deleted_at IS NULL)`

/** The cash documents of a company's year, in the order of their days. */
export async function cashEntries(db: D1Database, company: string, year: number): Promise<CashEntry[]> {
  const rows = await db
    .prepare(
      `SELECT e.id, e.number, e.cash_kind, e.on_date, e.lines, e.party, e.text, e.document_id, e.payment_id, u.name AS by_name
         FROM ledger_entries e LEFT JOIN users u ON u.id = e.created_by
        WHERE e.company_id = ? AND e.kind = 'cash' AND e.deleted_at IS NULL AND e.year = ? ORDER BY e.on_date, e.created_at`,
    )
    .bind(company, year)
    .all<Row>()
  return rows.results.flatMap((r) => {
    const kind = r.cash_kind
    if (!isCashKind(kind)) return []
    let cents = 0
    try {
      for (const l of JSON.parse(String(r.lines)) as LedgerLine[]) cents += (l.md === '211' ? 1 : l.d === '211' ? -1 : 0) * Number(l.cents)
    } catch {
      return []
    }
    return [
      {
        id: String(r.id),
        number: String(r.number),
        kind,
        on: String(r.on_date),
        cents,
        party: str(r.party),
        text: String(r.text),
        documentId: str(r.document_id),
        paymentId: str(r.payment_id),
        createdByName: str(r.by_name),
      },
    ]
  })
}

/** Receipts paid from the cash box that the accountant has not booked yet: in the cash book only once she does. */
export async function pendingCashReceipts(db: D1Database, company: string): Promise<{ id: string; on: string; party: string | null; cents: number }[]> {
  const rows = await db
    .prepare(
      `SELECT d.id, COALESCE(d.supplied_on, d.issued_on, date(d.created_at, 'unixepoch')) AS day, d.party, d.total_cents FROM documents d
        WHERE d.company_id = ? AND d.kind = 'receipt' AND d.booked_at IS NULL AND d.status = 'read' AND ${PAYABLE_IN_CASH}
        ORDER BY day LIMIT 500`,
    )
    .bind(company)
    .all<Row>()
  return rows.results.map((r) => ({ id: String(r.id), on: String(r.day), party: str(r.party), cents: Number(r.total_cents) }))
}

/** The invoices a cash document may pay: received ones (a supplier's, a trip's settlement) for money out, issued ones for money in. */
export async function cashDocuments(
  db: D1Database,
  company: string,
  side: 'in' | 'out',
): Promise<{ id: string; party: string | null; number: string | null; cents: number; category: string | null; on: string | null }[]> {
  const rows = await db
    .prepare(
      `SELECT d.id, d.party, d.number, d.total_cents, d.category, COALESCE(d.issued_on, d.supplied_on) AS day FROM documents d
        WHERE d.company_id = ? AND d.kind = ? AND d.corrects IS NULL AND d.prepaid = 0 AND ${PAYABLE_IN_CASH}
        ORDER BY COALESCE(d.due_on, d.issued_on, '9999-12-31'), d.created_at LIMIT 200`,
    )
    .bind(company, side === 'out' ? 'invoice_in' : 'invoice_out')
    .all<Row>()
  return rows.results.map((r) => ({ id: String(r.id), party: str(r.party), number: str(r.number), cents: Number(r.total_cents), category: str(r.category), on: str(r.day) }))
}

/** Bank payments that may have taken cash out of the bank (out) or put it in (in): no document, no reason yet, the last 90 days. */
export async function cashPayments(
  db: D1Database,
  company: string,
  side: 'in' | 'out',
  today: string,
): Promise<{ id: string; on: string; cents: number; party: string | null; note: string | null }[]> {
  const rows = await db
    .prepare(
      `SELECT p.id, p.booked_on, p.amount_cents, p.party, p.note FROM payments p
        WHERE p.company_id = ? AND p.exempt IS NULL AND COALESCE(p.currency, 'EUR') = 'EUR' AND ${side === 'out' ? 'p.amount_cents < 0' : 'p.amount_cents > 0'}
          AND p.booked_on >= date(?, '-90 days') AND NOT EXISTS (SELECT 1 FROM links l WHERE l.payment_id = p.id)
        ORDER BY p.booked_on DESC LIMIT 50`,
    )
    .bind(company, today)
    .all<Row>()
  return rows.results.map((r) => ({ id: String(r.id), on: String(r.booked_on), cents: Number(r.amount_cents), party: str(r.party), note: str(r.note) }))
}

/**
 * A cash document: numbered the next of its side in its year, booked at once; an invoice it pays must still be payable
 * in cash (else nothing is written), and the bank payment that brought the cash is marked as money between the
 * company's own accounts with the document's number (taken back with it).
 */
export function cashStatements(
  db: D1Database,
  a: { id: string; company: string; user: string; kind: CashKind; on: string; text: string; party: string | null; lines: LedgerLine[]; documentId: string | null; paymentId: string | null },
): D1PreparedStatement[] {
  const year = Number(a.on.slice(0, 4))
  const prefix = prefixOf(a.kind)
  const out: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT INTO ledger_entries (id, company_id, kind, year, seq, number, on_date, text, lines, created_at, created_by, cash_kind, party, document_id, payment_id)
         SELECT ?1, ?2, 'cash', ?3, s, ?4 || CAST(?3 AS INTEGER) || '-' || printf('%03d', s), ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13
           FROM (SELECT COALESCE(MAX(seq), 0) + 1 AS s FROM ledger_entries WHERE company_id = ?2 AND kind = 'cash' AND year = ?3 AND substr(number, 1, 3) = ?4)
          WHERE ?12 IS NULL OR EXISTS (SELECT 1 FROM documents d WHERE d.id = ?12 AND d.company_id = ?2 AND ${PAYABLE_IN_CASH})`,
      )
      .bind(a.id, a.company, year, prefix, a.on, a.text.slice(0, 300), JSON.stringify(a.lines), now(), a.user, a.kind, a.party, a.documentId, a.paymentId),
  ]
  if (a.paymentId && CASH_KINDS[a.kind].own)
    out.push(
      db
        .prepare(
          `UPDATE payments SET exempt = 'own', exempt_note = (SELECT number FROM ledger_entries WHERE id = ?1), exempt_by = ?2
            WHERE id = ?3 AND company_id = ?4 AND exempt IS NULL AND NOT EXISTS (SELECT 1 FROM links l WHERE l.payment_id = payments.id)
              AND EXISTS (SELECT 1 FROM ledger_entries WHERE id = ?1 AND company_id = ?4)`,
        )
        .bind(a.id, a.user, a.paymentId, a.company),
    )
  out.push(eventStatement(db, { company: a.company, user: a.user, action: 'cash.added', subject: a.id, detail: { kind: a.kind, cents: a.lines.reduce((s, l) => s + l.cents, 0) } }))
  return out
}

/** A cash document taken back by a mark (its number stays taken); the bank payment it marked is free again. */
export function removeCashStatements(db: D1Database, company: string, id: string, user: string): D1PreparedStatement[] {
  return [
    db
      .prepare(
        `UPDATE payments SET exempt = NULL, exempt_note = NULL, exempt_by = NULL
          WHERE company_id = ?2 AND exempt = 'own'
            AND id = (SELECT payment_id FROM ledger_entries WHERE id = ?1 AND company_id = ?2 AND kind = 'cash' AND deleted_at IS NULL)
            AND exempt_note = (SELECT number FROM ledger_entries WHERE id = ?1 AND company_id = ?2)`,
      )
      .bind(id, company),
    db.prepare("UPDATE ledger_entries SET deleted_at = ?, deleted_by = ? WHERE id = ? AND company_id = ? AND kind = 'cash' AND deleted_at IS NULL").bind(now(), user, id, company),
    eventStatement(db, { company, user, action: 'cash.removed', subject: id }),
  ]
}
