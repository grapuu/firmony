import { now } from '../db'
import type { LockChange, PeriodLock } from './periods'

type Row = { through_on: string | null; version: number; changed_at: number; changed_by: string; reason: string }
const lockOf = (row: Row): PeriodLock => ({ through: row.through_on, version: row.version, at: row.changed_at, by: row.changed_by, reason: row.reason })
export async function periodLock(db: D1Database, company: string): Promise<PeriodLock | null> {
  const row = await db.prepare('SELECT * FROM period_locks WHERE company_id = ?').bind(company).first<Row>()
  return row ? lockOf(row) : null
}
export async function lockHistory(db: D1Database, company: string): Promise<LockChange[]> {
  const rows = await db
    .prepare(
      `SELECT h.*, u.name AS by_name FROM period_lock_history h LEFT JOIN users u ON u.id = h.changed_by
    WHERE h.company_id = ? ORDER BY h.version DESC LIMIT 100`,
    )
    .bind(company)
    .all<Row & { before_on: string | null; by_name: string | null }>()
  return rows.results.map((r) => ({ ...lockOf(r), before: r.before_on, byName: r.by_name }))
}

/** The read revision covers readiness and every ledger dependency. A stale request changes neither lock nor history. */
export function changeLockStatement(
  db: D1Database,
  company: string,
  through: string | null,
  reason: string,
  by: string,
  version: number,
  revision: number,
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO period_locks (company_id, through_on, version, change_id, changed_at, changed_by, reason)
    SELECT ?1, ?2, ?3 + 1, ?4, ?5, ?6, ?7 WHERE
      COALESCE((SELECT version FROM period_locks WHERE company_id = ?1), 0) = ?3 AND
      COALESCE((SELECT revision FROM company_data_revisions WHERE company_id = ?1), 0) = ?8
    ON CONFLICT (company_id) DO UPDATE SET through_on = excluded.through_on, version = excluded.version,
      change_id = excluded.change_id, changed_at = excluded.changed_at, changed_by = excluded.changed_by, reason = excluded.reason`,
    )
    .bind(company, through, version, crypto.randomUUID(), now(), by, reason, revision)
}
