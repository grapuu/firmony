import { now } from '../db'
import type { User } from '../app/store'
export const PURGE_GRACE_SECONDS = 86400
export interface Incident {
  id: string
  company_id: string
  company_name: string
  owner_name: string | null
  backup_name: string | null
  version: number
  title: string
  severity: 'normal' | 'high' | 'critical'
  created_at: number
  created_by: string
  owner_id: string
  backup_id: string | null
  evidence: string
  review_on: string
  preservation: 'held' | 'records_only' | 'too_late'
  closed_at: number | null
  close_ref: string | null
  hold_id: string | null
  hold_review_on: string | null
  released_at: number | null
  release_requested_by: string | null
  release_ref: string | null
}
const SELECT = `SELECT i.*, c.name AS company_name, h.id AS hold_id, h.review_on AS hold_review_on, h.released_at, h.release_requested_by, h.release_ref, o.name AS owner_name, b.name AS backup_name
  FROM incidents i JOIN companies c ON c.id = i.company_id LEFT JOIN evidence_holds h ON h.incident_id = i.id LEFT JOIN users o ON o.id = i.owner_id LEFT JOIN users b ON b.id = i.backup_id`
export async function incidentsOf(db: D1Database, user: User): Promise<Incident[]> {
  const result = await db
    .prepare(
      `${SELECT} WHERE (?1 = 'admin' OR c.accountant_id = ?2 OR i.owner_id = ?2 OR i.backup_id = ?2)
    ORDER BY i.closed_at IS NOT NULL, CASE i.severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 ELSE 2 END, i.created_at LIMIT 200`,
    )
    .bind(user.team, user.id)
    .all<Incident>()
  return result.results
}
export const getIncident = (db: D1Database, user: User, id: string) =>
  db
    .prepare(`${SELECT} WHERE i.id = ?1 AND (?2 = 'admin' OR c.accountant_id = ?3 OR i.owner_id = ?3 OR i.backup_id = ?3)`)
    .bind(id, user.team, user.id)
    .first<Incident>()

/** The hold and the destructive claim compete in the same database. Losing that race is explicitly recorded. */
export async function openIncident(
  db: D1Database,
  user: User,
  input: {
    company: string
    title: string
    severity: string
    evidence: string
    reviewOn: string
    owner: string
    backup: string | null
  },
): Promise<string | null> {
  const id = crypto.randomUUID(),
    holdId = crypto.randomUUID(),
    ts = now()
  await db.batch([
    db
      .prepare(
        `INSERT INTO incidents (id, company_id, created_at, created_by, owner_id, backup_id, severity, title, evidence, review_on, preservation)
      SELECT ?1, c.id, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9,
        CASE WHEN c.records_delete_started_at IS NOT NULL OR (c.purged_at IS NULL AND c.purge_delete_started_at IS NOT NULL) THEN 'too_late'
          WHEN c.purged_at IS NOT NULL THEN 'records_only' ELSE 'held' END
      FROM companies c WHERE c.id = ?10 AND (EXISTS (SELECT 1 FROM users WHERE id = ?3 AND team = 'admin') OR c.accountant_id = ?3)
        AND EXISTS (SELECT 1 FROM users WHERE id = ?3 AND team IS NOT NULL)
        AND EXISTS (SELECT 1 FROM users WHERE id = ?4 AND team IS NOT NULL)
        AND (?5 IS NULL OR (?5 <> ?4 AND EXISTS (SELECT 1 FROM users WHERE id = ?5 AND team IS NOT NULL)))`,
      )
      .bind(id, ts, user.id, input.owner, input.backup, input.severity, input.title, input.evidence, input.reviewOn, input.company),
    db
      .prepare(
        `INSERT INTO evidence_holds (id, incident_id, company_id, created_at, created_by, review_on)
      SELECT ?1, id, company_id, ?2, ?3, review_on FROM incidents WHERE id = ?4 AND preservation IN ('held', 'records_only')`,
      )
      .bind(holdId, ts, user.id, id),
  ])
  return (await db.prepare('SELECT 1 AS x FROM incidents WHERE id = ?').bind(id).first()) ? id : null
}
export async function reviewHold(db: D1Database, user: User, id: string, reviewOn: string, reference: string): Promise<boolean> {
  const result = await db
    .prepare(
      `UPDATE evidence_holds SET review_on = ?1, reviewed_by = ?2, review_ref = ?3, release_requested_at = NULL, release_requested_by = NULL, release_ref = NULL
    WHERE incident_id = ?4 AND released_at IS NULL AND EXISTS (SELECT 1 FROM users WHERE id = ?2 AND team IS NOT NULL) AND EXISTS (SELECT 1 FROM companies c WHERE c.id = evidence_holds.company_id AND (EXISTS (SELECT 1 FROM users WHERE id = ?2 AND team = 'admin') OR c.accountant_id = ?2 OR EXISTS (SELECT 1 FROM incidents i WHERE i.id = evidence_holds.incident_id AND (i.owner_id = ?2 OR i.backup_id = ?2))))`,
    )
    .bind(reviewOn, user.id, reference, id)
    .run()
  return (result.meta.changes ?? 0) > 0
}
export async function requestRelease(db: D1Database, user: User, id: string, reference: string): Promise<boolean> {
  const result = await db
    .prepare(
      `UPDATE evidence_holds SET release_requested_at = ?1, release_requested_by = ?2, release_ref = ?3
    WHERE incident_id = ?4 AND released_at IS NULL AND release_requested_by IS NULL
      AND EXISTS (SELECT 1 FROM users WHERE id = ?2 AND team = 'admin')`,
    )
    .bind(now(), user.id, reference, id)
    .run()
  return (result.meta.changes ?? 0) > 0
}
export async function approveRelease(db: D1Database, user: User, id: string): Promise<boolean> {
  const result = await db
    .prepare(
      `UPDATE evidence_holds SET released_at = ?1, released_by = ?2
    WHERE incident_id = ?3 AND released_at IS NULL AND release_requested_by IS NOT NULL AND release_requested_by <> ?2
      AND EXISTS (SELECT 1 FROM users WHERE id = ?2 AND team = 'admin')
      AND EXISTS (SELECT 1 FROM users WHERE id = evidence_holds.release_requested_by AND team = 'admin')`,
    )
    .bind(now(), user.id, id)
    .run()
  return (result.meta.changes ?? 0) > 0
}
export async function closeIncident(db: D1Database, user: User, id: string, reference: string): Promise<boolean> {
  const result = await db
    .prepare(
      `UPDATE incidents SET closed_at = ?1, closed_by = ?2, close_ref = ?3
    WHERE id = ?4 AND created_by <> ?2 AND closed_at IS NULL AND NOT EXISTS (SELECT 1 FROM evidence_holds WHERE incident_id = incidents.id AND released_at IS NULL)
      AND EXISTS (SELECT 1 FROM users WHERE id = ?2 AND team = 'admin')`,
    )
    .bind(now(), user.id, reference, id)
    .run()
  return (result.meta.changes ?? 0) > 0
}

export const evidenceBlocked = (db: D1Database, company: string) =>
  db
    .prepare(
      `SELECT 1 AS x WHERE
  EXISTS (SELECT 1 FROM evidence_holds WHERE company_id = ?1 AND released_at IS NULL)
  OR EXISTS (SELECT 1 FROM incidents WHERE company_id = ?1 AND closed_at IS NULL)
  OR EXISTS (SELECT 1 FROM reports WHERE company_id = ?1 AND decided_at IS NULL)
  OR EXISTS (SELECT 1 FROM aml_prospect_reports r JOIN orders o ON o.id = r.order_id WHERE o.company_id = ?1 AND r.decided_at IS NULL)`,
    )
    .bind(company)
    .first()
    .then(Boolean)
export function isEvidenceHeld(error: unknown): boolean {
  const seen = new Set<unknown>()
  for (let value = error; value && typeof value === 'object' && !seen.has(value); value = (value as { cause?: unknown }).cause) {
    seen.add(value)
    const message = (value as { message?: unknown }).message
    if (typeof message === 'string' && /Evidence hold prevents|Retain incident evidence/.test(message)) return true
  }
  return false
}

export async function assignIncident(db: D1Database, user: User, id: string, owner: string, backup: string | null, version: number): Promise<boolean> {
  const result = await db
    .prepare(
      `UPDATE incidents SET owner_id = ?1, backup_id = ?2, updated_by = ?3, version = version + 1
    WHERE id = ?4 AND version = ?5 AND closed_at IS NULL
      AND EXISTS (SELECT 1 FROM users WHERE id = ?3 AND team = 'admin')
      AND EXISTS (SELECT 1 FROM users WHERE id = ?1 AND team IS NOT NULL)
      AND (?2 IS NULL OR (?2 <> ?1 AND EXISTS (SELECT 1 FROM users WHERE id = ?2 AND team IS NOT NULL)))`,
    )
    .bind(owner, backup, user.id, id, version)
    .run()
  return (result.meta.changes ?? 0) > 0
}
