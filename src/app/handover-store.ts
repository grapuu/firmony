// An HTTP download alone cannot prove that the client has kept its files. Track completion separately from acknowledgement.
import { now } from '../db'

export interface ExportReceipt { id: string; year: string; confirmed: boolean }

export async function dataRevision(db: D1Database, company: string): Promise<number> {
  const row = await db.prepare('SELECT revision FROM company_data_revisions WHERE company_id = ?').bind(company).first<{ revision: number }>()
  return row?.revision ?? 0
}

export async function exportReceipts(db: D1Database, company: string): Promise<ExportReceipt[]> {
  const revision = await dataRevision(db, company)
  const rows = await db.prepare('SELECT id, year, confirmed_at FROM export_receipts WHERE company_id = ? AND revision = ? AND completed_at IS NOT NULL ORDER BY created_at DESC, id DESC').bind(company, revision).all<{ id: string; year: string; confirmed_at: number | null }>()
  const byYear = new Map<string, ExportReceipt>()
  for (const r of rows.results) if (!byYear.has(r.year) || r.confirmed_at !== null) byYear.set(r.year, { id: r.id, year: r.year, confirmed: r.confirmed_at !== null })
  return [...byYear.values()]
}

/** Register before reading any export data. A changing dataset cannot produce an acknowledgeable receipt. */
export async function beginExport(db: D1Database, company: string, year: string, user: string): Promise<{ id: string; revision: number }> {
  const id = crypto.randomUUID()
  const revision = await dataRevision(db, company)
  await db.prepare('INSERT INTO export_receipts (id, company_id, year, revision, user_id, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(id, company, year, revision, user, now()).run()
  return { id, revision }
}

export function completeExport(db: D1Database, id: string): Promise<D1Result> {
  return db.prepare(`UPDATE export_receipts SET completed_at = ? WHERE id = ? AND completed_at IS NULL
    AND revision = COALESCE((SELECT revision FROM company_data_revisions WHERE company_id = export_receipts.company_id), 0)`)
    .bind(now(), id).run()
}

export function confirmExport(db: D1Database, company: string, id: string): Promise<D1Result> {
  return db.prepare(`UPDATE export_receipts SET confirmed_at = ? WHERE id = ? AND company_id = ? AND completed_at IS NOT NULL AND confirmed_at IS NULL
    AND revision = COALESCE((SELECT revision FROM company_data_revisions WHERE company_id = export_receipts.company_id), 0)`)
    .bind(now(), id, company).run()
}

/** Every year must have a completed, acknowledged archive of the current dataset. Uploading a random handover file cannot satisfy this. */
export async function confirmedRevision(db: D1Database, company: string, years: string[]): Promise<number | null> {
  if (!years.length) return null
  const revision = await dataRevision(db, company)
  const rows = await db.prepare('SELECT DISTINCT year FROM export_receipts WHERE company_id = ? AND revision = ? AND completed_at IS NOT NULL AND confirmed_at IS NOT NULL').bind(company, revision).all<{ year: string }>()
  const received = new Set(rows.results.map((r) => r.year))
  return years.every((year) => received.has(year)) ? revision : null
}
