// Cost centres kept (18 October 2026, centers.ts): the company's list, and the centre of each document.
import { now } from '../db'
import type { CenterBudget, CostCenter } from './centers'
import { eventStatement } from './store'

type Row = Record<string, unknown>

/** The company's cost centres by their codes, archived ones too. */
export async function listCenters(db: D1Database, company: string): Promise<CostCenter[]> {
  const rows = await db.prepare('SELECT id, code, name, archived_at FROM cost_centers WHERE company_id = ? ORDER BY code').bind(company).all<Row>()
  return rows.results.map((r) => ({ id: String(r.id), code: String(r.code), name: String(r.name), archived: typeof r.archived_at === 'number' }))
}

/** The centre of each of the company's documents that has one. */
export async function documentCenters(db: D1Database, company: string): Promise<Map<string, string | null>> {
  const rows = await db.prepare('SELECT id, center_id FROM documents WHERE company_id = ? AND center_id IS NOT NULL AND deleted_at IS NULL').bind(company).all<Row>()
  return new Map(rows.results.map((r) => [String(r.id), typeof r.center_id === 'string' ? r.center_id : null]))
}

/** A new centre; its code is the company's once (a second of the same code fails whole). */
export function addCenterStatements(db: D1Database, a: { id: string; company: string; code: string; name: string; user: string }): D1PreparedStatement[] {
  return [
    db.prepare('INSERT INTO cost_centers (id, company_id, code, name, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?)').bind(a.id, a.company, a.code, a.name.slice(0, 80), now(), a.user),
    eventStatement(db, { company: a.company, user: a.user, action: 'center.added', subject: a.id, detail: { code: a.code } }),
  ]
}

/** A centre archived (it keeps its documents and takes no new ones) or back in use. */
export function archiveCenterStatement(db: D1Database, company: string, id: string, archived: boolean): D1PreparedStatement {
  return db.prepare('UPDATE cost_centers SET archived_at = ? WHERE id = ? AND company_id = ?').bind(archived ? now() : null, id, company)
}

/** A document given to a centre of its company in use, or to none. */
export function documentCenterStatement(db: D1Database, company: string, doc: string, center: string | null): D1PreparedStatement {
  return db
    .prepare(
      `UPDATE documents SET center_id = ?1 WHERE id = ?2 AND company_id = ?3 AND deleted_at IS NULL
         AND (?1 IS NULL OR EXISTS (SELECT 1 FROM cost_centers c WHERE c.id = ?1 AND c.company_id = ?3 AND c.archived_at IS NULL))`,
    )
    .bind(center, doc, company)
}

/** The budgets of the company's centres for a year, by centre. */
export async function centerBudgets(db: D1Database, company: string, year: number): Promise<Map<string, CenterBudget>> {
  const rows = await db.prepare('SELECT center_id, revenue, costs FROM cost_center_budgets WHERE company_id = ? AND year = ?').bind(company, year).all<Row>()
  return new Map(rows.results.map((r) => [String(r.center_id), { revenue: Number(r.revenue), costs: Number(r.costs) }]))
}

/** A centre's budget of a year written (only of a centre of the company); a budget of nothing removed. */
export function budgetStatement(db: D1Database, company: string, center: string, year: number, budget: CenterBudget, user: string): D1PreparedStatement {
  if (budget.revenue === 0 && budget.costs === 0) return db.prepare('DELETE FROM cost_center_budgets WHERE company_id = ? AND center_id = ? AND year = ?').bind(company, center, year)
  return db
    .prepare(
      `INSERT INTO cost_center_budgets (company_id, center_id, year, revenue, costs, updated_at, updated_by)
       SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7 WHERE EXISTS (SELECT 1 FROM cost_centers c WHERE c.id = ?2 AND c.company_id = ?1)
       ON CONFLICT (center_id, year) DO UPDATE SET revenue = excluded.revenue, costs = excluded.costs, updated_at = excluded.updated_at, updated_by = excluded.updated_by
       WHERE cost_center_budgets.company_id = ?1`,
    )
    .bind(company, center, year, budget.revenue, budget.costs, now(), user)
}
