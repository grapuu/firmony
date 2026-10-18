// The day's takings of an eKasa till kept (takings.ts): a document of the company of its own, booked at once, and taken
// back by a mark only at the data revision its cash was checked at.
import { now } from '../db'
import type { Takings, TakingsCategory } from './takings'
import { eventStatement, vatLinesOf } from './store'
import type { VatLine } from './vat'

type Row = Record<string, unknown>

/** What a day's takings is called among the documents and in the books. */
export const TAKINGS_PARTY = 'Tržba z eKasy'

export interface StoredTakings {
  id: string
  on: string
  number: string | null
  total: number
  vat: number
  cash: number
  lines: VatLine[]
  category: TakingsCategory
  centerId: string | null
}

/** The company's takings of a year, the newest day first. */
export async function listTakings(db: D1Database, company: string, year: number): Promise<StoredTakings[]> {
  const rows = await db
    .prepare(
      `SELECT id, issued_on, number, total_cents, vat_cents, takings_cash, vat_lines, category, center_id FROM documents
        WHERE company_id = ? AND source = 'takings' AND deleted_at IS NULL AND issued_on >= ? AND issued_on <= ? ORDER BY issued_on DESC, created_at DESC`,
    )
    .bind(company, `${year}-01-01`, `${year}-12-31`)
    .all<Row>()
  return rows.results.map((r) => ({
    id: String(r.id),
    on: String(r.issued_on),
    number: typeof r.number === 'string' ? r.number : null,
    total: Number(r.total_cents ?? 0),
    vat: Number(r.vat_cents ?? 0),
    cash: Number(r.takings_cash ?? 0),
    lines: vatLinesOf(r.vat_lines),
    category: r.category === 'sales' ? 'sales' : 'sales_goods',
    centerId: typeof r.center_id === 'string' ? r.center_id : null,
  }))
}

/** The years the company has takings in. */
export async function takingsYears(db: D1Database, company: string): Promise<number[]> {
  const rows = await db.prepare("SELECT DISTINCT substr(issued_on, 1, 4) AS y FROM documents WHERE company_id = ? AND source = 'takings' AND deleted_at IS NULL").bind(company).all<{ y: string }>()
  return rows.results.map((r) => Number(r.y)).filter(Number.isInteger)
}

/**
 * A day's takings as the company's document: issued, of its day, its VAT confirmed (a VAT payer's by rate, anybody
 * else's none) and booked at once by who wrote it; a cost centre only of the company and in use.
 */
export function takingsStatements(db: D1Database, a: { id: string; company: string; user: string; takings: Takings; payer: boolean }): D1PreparedStatement[] {
  const t = a.takings
  return [
    db
      .prepare(
        `INSERT INTO documents (id, company_id, created_at, source, added_by, status, read_by, kind, party, number, issued_on, due_on, supplied_on,
           total_cents, vat_cents, currency, category, vat_mode, vat_lines, booked_at, booked_by, takings_cash, center_id)
         SELECT ?1, ?2, ?3, 'takings', ?4, 'read', 'takings', 'invoice_out', ?5, ?6, ?7, ?7, ?7, ?8, ?9, 'EUR', ?10, ?11, ?12, ?3, ?4, ?13, ?14
          WHERE ?14 IS NULL OR EXISTS (SELECT 1 FROM cost_centers c WHERE c.id = ?14 AND c.company_id = ?2 AND c.archived_at IS NULL)`,
      )
      .bind(a.id, a.company, now(), a.user, TAKINGS_PARTY, t.number, t.on, t.total, t.vat, t.category, a.payer ? 'domestic' : 'none', JSON.stringify(t.lines), t.cash, t.center),
    eventStatement(db, { company: a.company, user: a.user, action: 'takings.added', subject: a.id, detail: { on: t.on, total: t.total, cash: t.cash } }),
  ]
}

/** A day's takings taken back by a mark, at the revision of the company's data its cash box was checked at. */
export function removeTakingsStatements(db: D1Database, company: string, id: string, user: string, revision: number): D1PreparedStatement[] {
  return [
    db
      .prepare(
        `UPDATE documents SET deleted_at = ?1 WHERE id = ?2 AND company_id = ?3 AND source = 'takings' AND deleted_at IS NULL
           AND COALESCE((SELECT revision FROM company_data_revisions WHERE company_id = ?3), 0) = ?4`,
      )
      .bind(now(), id, company, revision),
    db.prepare("INSERT INTO events (at, company_id, user_id, action, subject) SELECT ?, ?, ?, 'takings.removed', ? WHERE changes() > 0").bind(now(), company, user, id),
  ]
}
