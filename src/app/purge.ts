import { forgetProspects } from '../aml/prospects'
import { archiveDueSql, retentionExpiredSql } from '../aml/retention'
// All business records remain for at least five years after the end (§ 19(2), Act 297/2008).
// The client's download access ends after ninety days. Only the designated person can read the archive.
// Holds and other statutory obligations extend retention. Original law, read 21 October 2026:
// https://static.slov-lex.sk/static/SK/ZZ/2008/297/20260817.html
import { ENDING } from '../config'
import { now } from '../db'
import { bankReady, closeSession, type BankEnv } from './bank'
import { purgeFloor, recordsFloor, unconfirmedFloor } from './ending'
import { eventStatement } from './store'
import { exportYears } from './export'
import { confirmedRevision, dataRevision } from './handover-store'
import { bratislava } from './remind'
import { evidenceBlocked, PURGE_GRACE_SECONDS } from '../incidents/store'
import { pendingFilingsSql } from '../filings/model'
import { socialPendingPayrollSql as pendingPayrollSql } from '../payroll-reporting/sql'

export interface PurgeEnv extends BankEnv {
  FILES?: R2Bucket
}

/** Deletes every object under a prefix but those kept; returns how many went. */
async function deletePrefix(files: R2Bucket, prefix: string, keep: Set<string> = new Set(), canDelete: () => Promise<boolean> = async () => true): Promise<number> {
  let deleted = 0
  let cursor: string | undefined
  do {
    if (!await canDelete()) throw new Error('Evidence hold prevents file deletion')
    const page = await files.list({ prefix, cursor, limit: 1000 })
    const keys = page.objects.map((o) => o.key).filter((key) => !keep.has(key))
    if (keys.length > 0) {
      if (!await canDelete()) throw new Error('Evidence hold prevents file deletion')
      await files.delete(keys)
      deleted += keys.length
    }
    cursor = page.truncated ? page.cursor : undefined
  } while (cursor)
  return deleted
}

/** The people of a company who belong to nothing else once it is gone: no other company and no team. */
const LONELY = `SELECT m.user_id FROM members m JOIN users u ON u.id = m.user_id
  WHERE m.company_id = ?1 AND u.team IS NULL AND NOT EXISTS (SELECT 1 FROM members o WHERE o.user_id = m.user_id AND o.company_id <> ?1)`

/**
 * A freeze whose reason is gone is lifted, while nothing has been deleted yet: the data changed since the client
 * confirmed the archive (a draft thrown away during the day of grace) or a filing is pending again. Writes then work
 * again, and the next run freezes it anew once the client has confirmed the current archive; before, such a company
 * stayed frozen for good and every write to it failed. A hold or an open incident keeps the freeze as it is. Once the
 * deletion has started, it is finished instead.
 */
async function thaw(db: D1Database, companyId: string): Promise<{ files: number; rows: number }> {
  await db
    .prepare('UPDATE companies SET purge_started_at = NULL WHERE id = ? AND purge_started_at IS NOT NULL AND purge_delete_started_at IS NULL AND purged_at IS NULL AND aml_archived_at IS NULL')
    .bind(companyId)
    .run()
  return { files: 0, rows: 0 }
}

/** One company's data, deleted: the files first, then the rows in one batch, which either all go or none. */
export async function purgeCompany(env: PurgeEnv, companyId: string, today = bratislava(Date.now()).day): Promise<{ files: number; rows: number }> {
  const db = env.DB
  // A hold keeps everything as it is, the freeze included: evidence is not changed while a case is open.
  if (await evidenceBlocked(db, companyId)) return { files: 0, rows: 0 }
  // The client confirms that the archive of every year arrived before anything is deleted. One who never does is not
  // kept forever: after the five-year legal minimum, an unconfirmed export cannot prevent eventual erasure.
  // A company with nothing to take along has nothing to confirm.
  const years = await exportYears(db, companyId)
  let revision = years.length === 0 ? await dataRevision(db, companyId) : await confirmedRevision(db, companyId, years)
  if (revision === null) {
    const ended = await db.prepare('SELECT ends_on FROM companies WHERE id = ?').bind(companyId).first<{ ends_on: string | null }>()
    if (ended?.ends_on && ended.ends_on < unconfirmedFloor(today)) revision = await dataRevision(db, companyId)
  }
  if (revision === null) return thaw(db, companyId)
  // Freeze new writes before any external file deletion. A change since the handover check cancels this claim.
  const claim = await db.prepare(`UPDATE companies SET purge_started_at = COALESCE(purge_started_at, ?) WHERE id = ? AND purged_at IS NULL AND demo = 0 AND ${retentionExpiredSql('companies','?')}
    AND COALESCE((SELECT revision FROM company_data_revisions WHERE company_id = companies.id), 0) = ?
    AND NOT (${pendingFilingsSql('companies.id')})
    AND NOT (${pendingPayrollSql('companies.id')})
    AND NOT EXISTS (SELECT 1 FROM evidence_holds WHERE company_id = companies.id AND released_at IS NULL)
    AND NOT EXISTS (SELECT 1 FROM incidents WHERE company_id = companies.id AND closed_at IS NULL)`).bind(now(), companyId, today, revision).run()
  if ((claim.meta?.changes ?? 0) === 0) return thaw(db, companyId)
  // A full day between freezing writes and the irreversible phase gives operations a real intervention window.
  const destructive = await db.prepare(`UPDATE companies SET purge_delete_started_at = COALESCE(purge_delete_started_at, ?1)
    WHERE id = ?2 AND purged_at IS NULL AND purge_started_at <= ?3 AND ${retentionExpiredSql('companies','?4')}
      AND NOT EXISTS (SELECT 1 FROM evidence_holds WHERE company_id = companies.id AND released_at IS NULL)
      AND NOT EXISTS (SELECT 1 FROM incidents WHERE company_id = companies.id AND closed_at IS NULL)`)
    .bind(now(), companyId, now() - PURGE_GRACE_SECONDS, today).run()
  if ((destructive.meta.changes ?? 0) === 0) return { files: 0, rows: 0 }
  const canDelete = async () => !await evidenceBlocked(db, companyId)

  if (bankReady(env)) {
    const sessions = await db
      .prepare("SELECT session_id FROM bank_links WHERE company_id = ? AND kind = 'eb' AND status = 'active' AND session_id IS NOT NULL")
      .bind(companyId)
      .all<{ session_id: string }>()
    for (const row of sessions.results) await closeSession(env, row.session_id).catch(() => null)
  }
  let files = 0
  if (env.FILES) {
    const kept = await db.prepare("SELECT r2_key FROM company_files WHERE company_id = ? AND kind = 'poa'").bind(companyId).all<{ r2_key: string }>()
    files += await deletePrefix(env.FILES, `companies/${companyId}/documents/`, new Set(), canDelete)
    files += await deletePrefix(env.FILES, `companies/${companyId}/statements/`, new Set(), canDelete)
    files += await deletePrefix(env.FILES, `companies/${companyId}/filings/`, new Set(), canDelete)
    files += await deletePrefix(env.FILES, `companies/${companyId}/papers/`, new Set(kept.results.map((r) => r.r2_key)), canDelete)
    files += await deletePrefix(env.FILES, `companies/${companyId}/brand/`, new Set(), canDelete)
  }
  const lonely = await db.prepare(LONELY).bind(companyId).all<{ user_id: string }>()
  const people = lonely.results.map((r) => r.user_id)
  const statements: D1PreparedStatement[] = [
    db.prepare('DELETE FROM links WHERE company_id = ?').bind(companyId),
    db.prepare('DELETE FROM aml_auto_reviews WHERE company_id = ?').bind(companyId),
    db.prepare('DELETE FROM documents WHERE company_id = ?').bind(companyId),
    db.prepare('DELETE FROM payments WHERE company_id = ?').bind(companyId),
    db.prepare('DELETE FROM accounts WHERE company_id = ?').bind(companyId),
    db.prepare('DELETE FROM bank_links WHERE company_id = ?').bind(companyId),
    db.prepare('DELETE FROM statements WHERE company_id = ?').bind(companyId),
    db.prepare('DELETE FROM invoice_lines WHERE invoice_id IN (SELECT id FROM invoices WHERE company_id = ?)').bind(companyId),
    db.prepare('DELETE FROM invoice_repeats WHERE company_id = ?').bind(companyId),
    db.prepare('DELETE FROM payment_order_items WHERE company_id = ?').bind(companyId),
    db.prepare('DELETE FROM payment_orders WHERE company_id = ?').bind(companyId),
    db.prepare('DELETE FROM trips WHERE company_id = ?').bind(companyId),
    db.prepare('DELETE FROM cost_center_budgets WHERE company_id = ?').bind(companyId),
    db.prepare('DELETE FROM wage_garnishments WHERE company_id = ?').bind(companyId),
    db.prepare('DELETE FROM vat_ratios WHERE company_id = ?').bind(companyId),
    db.prepare('DELETE FROM bad_debts WHERE company_id = ?').bind(companyId),
    db.prepare('DELETE FROM asset_vat_uses WHERE company_id = ?').bind(companyId),
    db.prepare('DELETE FROM asset_vat WHERE company_id = ?').bind(companyId),
    db.prepare('DELETE FROM cost_centers WHERE company_id = ?').bind(companyId),
    db.prepare('DELETE FROM invoices WHERE company_id = ?').bind(companyId),
    db.prepare('DELETE FROM messages WHERE company_id = ?').bind(companyId),
    db.prepare('DELETE FROM inbound_mail WHERE company_id = ?').bind(companyId),
    db.prepare('DELETE FROM supplier_rules WHERE company_id = ?').bind(companyId),
    db.prepare('DELETE FROM vat_returns WHERE company_id = ?').bind(companyId),
    db.prepare('DELETE FROM filings WHERE company_id = ?').bind(companyId),
    db.prepare('DELETE FROM filing_history WHERE company_id = ?').bind(companyId),
    db.prepare('DELETE FROM filing_events WHERE company_id = ?').bind(companyId),
    db.prepare('DELETE FROM filing_packages WHERE company_id = ?').bind(companyId),
    db.prepare('DELETE FROM closings WHERE company_id = ?').bind(companyId),
    db.prepare('DELETE FROM assets WHERE company_id = ?').bind(companyId),
    db.prepare('DELETE FROM stock_moves WHERE company_id = ?').bind(companyId),
    db.prepare('DELETE FROM stock_items WHERE company_id = ?').bind(companyId),
    db.prepare('DELETE FROM stock_settings WHERE company_id = ?').bind(companyId),
    db.prepare('DELETE FROM sick_leaves WHERE company_id = ?').bind(companyId),
    db.prepare('DELETE FROM tax_settlements WHERE company_id = ?').bind(companyId),
    db.prepare('DELETE FROM prior_statements WHERE company_id = ?').bind(companyId),
    db.prepare('DELETE FROM oss_returns WHERE company_id = ?').bind(companyId),
    db.prepare('DELETE FROM intrastat_returns WHERE company_id = ?').bind(companyId),
    db.prepare('DELETE FROM intrastat_goods WHERE company_id = ?').bind(companyId),
    db.prepare('DELETE FROM employees WHERE company_id = ?').bind(companyId),
    db.prepare('DELETE FROM payroll_runs WHERE company_id = ?').bind(companyId),
    db.prepare('DELETE FROM payroll_health_generations WHERE company_id = ?').bind(companyId),
    db.prepare('DELETE FROM payroll_social_generations WHERE company_id = ?').bind(companyId),
    db.prepare('DELETE FROM payroll_social_inputs WHERE company_id = ?').bind(companyId),
    db.prepare('DELETE FROM payroll_social_relations WHERE company_id = ?').bind(companyId),
    db.prepare('DELETE FROM payroll_health_ids WHERE company_id = ?').bind(companyId),
    db.prepare('DELETE FROM payroll_generations WHERE company_id = ?').bind(companyId),
    db.prepare('DELETE FROM payroll_target_reviews WHERE company_id = ?').bind(companyId),
    db.prepare('DELETE FROM payroll_events WHERE company_id = ?').bind(companyId),
    db.prepare('DELETE FROM payroll_packages WHERE company_id = ?').bind(companyId),
    db.prepare('DELETE FROM payroll_targets WHERE company_id = ?').bind(companyId),
    db.prepare('DELETE FROM payroll_payouts WHERE company_id = ?').bind(companyId),
    db.prepare('DELETE FROM payroll_closures WHERE company_id = ?').bind(companyId),
    db.prepare('DELETE FROM payroll_history WHERE company_id = ?').bind(companyId),
    db.prepare('DELETE FROM closing_history WHERE company_id = ?').bind(companyId),
    db.prepare('DELETE FROM ledger_entries WHERE company_id = ?').bind(companyId),
    db.prepare('DELETE FROM period_locks WHERE company_id = ?').bind(companyId),
    db.prepare('DELETE FROM period_lock_history WHERE company_id = ?').bind(companyId),
    db.prepare("DELETE FROM company_files WHERE company_id = ? AND kind <> 'poa'").bind(companyId),
    db.prepare('DELETE FROM sessions WHERE company_id = ?').bind(companyId),
    ...people.flatMap((id) => [
      db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(id),
      db.prepare('DELETE FROM login_links WHERE user_id = ?').bind(id),
      db.prepare('DELETE FROM users WHERE id = ? AND team IS NULL').bind(id),
    ]),
    db.prepare('DELETE FROM members WHERE company_id = ?').bind(companyId),
    db
      .prepare('UPDATE companies SET purged_at = ?, closed_at = COALESCE(closed_at, ?), note = NULL, invoice_iban = NULL, invoice_footer = NULL, tax_account = NULL, payroll = NULL WHERE id = ? AND purged_at IS NULL')
      .bind(now(), now(), companyId),
    eventStatement(db, { company: companyId, user: null, action: 'company.purged', detail: { files, people: people.length } }),
  ]
  statements.push(db.prepare('DELETE FROM export_receipts WHERE company_id = ?').bind(companyId), db.prepare('DELETE FROM company_data_revisions WHERE company_id = ?').bind(companyId))
  const results = await db.batch(statements)
  return { files, rows: results.reduce((sum, r) => sum + (r.meta?.changes ?? 0), 0) }
}

/** Revoke customer access at ninety days while retaining every business record and original. */
export async function archiveEnded(env: PurgeEnv, today: string): Promise<number> {
  const db = env.DB
  const rows = await db.prepare(`SELECT id FROM companies WHERE demo = 0 AND operator = 0 AND aml_archived_at IS NULL
    AND ${archiveDueSql('companies','?')} ORDER BY ends_on LIMIT ?`).bind(today, ENDING.perRun).all<{id: string}>()
  let count = 0
  for (const {id} of rows.results) {
    if (bankReady(env)) {
      const links = await db.prepare("SELECT session_id FROM bank_links WHERE company_id = ? AND kind = 'eb' AND status = 'active' AND session_id IS NOT NULL").bind(id).all<{session_id:string}>()
      for (const link of links.results) await closeSession(env,link.session_id).catch(() => null)
    }
    const results = await db.batch([
      db.prepare(`UPDATE companies SET aml_archived_at = ?1, closed_at = COALESCE(closed_at,?1), purge_started_at = COALESCE(purge_started_at,?1)
        WHERE id = ?2 AND aml_archived_at IS NULL AND ${archiveDueSql('companies','?3')}`).bind(now(),id,today),
      db.prepare('DELETE FROM sessions WHERE company_id = ? AND EXISTS (SELECT 1 FROM companies WHERE id = ? AND aml_archived_at IS NOT NULL)').bind(id,id),
      db.prepare("INSERT INTO events (at,company_id,action) SELECT ?1,?2,'company.aml.archived' WHERE EXISTS (SELECT 1 FROM companies WHERE id = ?2 AND aml_archived_at = ?1)").bind(now(),id),
    ])
    if ((results[0]?.meta.changes ?? 0) > 0) count++
  }
  return count
}

/** The schedule's part: companies past their ninety days lose their data; past five years, the rest. */
export async function purgeEnded(env: PurgeEnv, today: string): Promise<number> {
  const db = env.DB
  await archiveEnded(env, today)
  const due = await db
    .prepare(`SELECT id FROM companies WHERE ${retentionExpiredSql('companies','?')} AND purged_at IS NULL AND demo = 0
      AND NOT EXISTS (SELECT 1 FROM evidence_holds WHERE company_id = companies.id AND released_at IS NULL)
      AND NOT EXISTS (SELECT 1 FROM incidents WHERE company_id = companies.id AND closed_at IS NULL) ORDER BY COALESCE(purge_checked_at, 0), ends_on LIMIT ?`)
    .bind(today, ENDING.perRun)
    .all<{ id: string }>()
  let purged = 0
  for (const row of due.results) {
    try {
      await db.prepare('UPDATE companies SET purge_checked_at = ? WHERE id = ?').bind(now(), row.id).run()
      const result = await purgeCompany(env, row.id, today)
      if (result.rows > 0) purged++
    } catch (err) {
      console.error('deleting a company failed', err instanceof Error ? err.name : 'error')
    }
  }
  await forgetRecords(env, today)
  await forgetProspects(env, today)
  await forgetLonely(db)
  return purged
}

/**
 * A person who belongs to no company and to no team any more (an owner removed them, their company was deleted) has
 * an account for nothing: it goes, with its sessions and links. Nobody is ever without a company in between: an
 * account is made in the same step as its membership.
 */
export async function forgetLonely(db: D1Database): Promise<number> {
  const lonely = 'SELECT u.id FROM users u WHERE u.team IS NULL AND NOT EXISTS (SELECT 1 FROM members m WHERE m.user_id = u.id)'
  const results = await db.batch([
    db.prepare(`DELETE FROM sessions WHERE user_id IN (${lonely})`),
    db.prepare(`DELETE FROM login_links WHERE user_id IN (${lonely})`),
    db.prepare(`DELETE FROM users WHERE id IN (${lonely})`),
  ])
  return results[2]?.meta?.changes ?? 0
}

/** Five years past the end, what the law kept goes too: the power of attorney, the identification, the contract. */
export async function forgetRecords(env: PurgeEnv, today: string): Promise<number> {
  const db = env.DB
  const due = await db
    .prepare(`SELECT id FROM companies WHERE purged_at IS NOT NULL AND ${retentionExpiredSql('companies','?')} AND demo = 0
      AND NOT EXISTS (SELECT 1 FROM evidence_holds WHERE company_id = companies.id AND released_at IS NULL)
      AND NOT EXISTS (SELECT 1 FROM incidents WHERE company_id = companies.id AND closed_at IS NULL) ORDER BY ends_on LIMIT ?`)
    .bind(today, ENDING.perRun)
    .all<{ id: string }>()
  let deleted = 0
  for (const { id } of due.results) {
    const claim = await db.prepare(`UPDATE companies SET records_delete_started_at = COALESCE(records_delete_started_at, ?1)
      WHERE id = ?2 AND purged_at IS NOT NULL AND ${retentionExpiredSql('companies','?3')}
        AND NOT EXISTS (SELECT 1 FROM evidence_holds WHERE company_id = companies.id AND released_at IS NULL)
        AND NOT EXISTS (SELECT 1 FROM incidents WHERE company_id = companies.id AND closed_at IS NULL)`)
      .bind(now(), id, today).run()
    if (!claim.meta.changes) continue
    const canDelete = async () => !await evidenceBlocked(db, id)
    await db.prepare(`UPDATE requests SET aml_ended_at = (SELECT unixepoch(ends_on || 'T12:00:00Z') FROM companies WHERE id = ?1) WHERE id IN (SELECT request_id FROM orders WHERE company_id = ?1)`).bind(id).run()
    const orders = await db.prepare('SELECT id FROM orders WHERE company_id = ?').bind(id).all<{id:string}>()
    if (env.FILES) {
      await deletePrefix(env.FILES, `companies/${id}/`, new Set(), canDelete)
      for (const order of orders.results) await deletePrefix(env.FILES, `onboarding/${order.id}/`, new Set(), canDelete)
    }
    await db.batch([
      ...['aml_checks','aml_decisions'].map((table) => db.prepare(`DELETE FROM ${table} WHERE dossier_id IN (SELECT id FROM aml_dossiers WHERE company_id = ?1 OR order_id IN (SELECT id FROM orders WHERE company_id = ?1))`).bind(id)),
      db.prepare('DELETE FROM aml_bank_evidence WHERE dossier_id IN (SELECT id FROM aml_dossiers WHERE company_id = ?1 OR order_id IN (SELECT id FROM orders WHERE company_id = ?1))').bind(id),
      db.prepare('DELETE FROM aml_dossiers WHERE company_id = ?1 OR order_id IN (SELECT id FROM orders WHERE company_id = ?1)').bind(id),
      db.prepare('DELETE FROM company_files WHERE company_id = ?').bind(id),
      db.prepare('DELETE FROM declarations WHERE company_id = ?').bind(id),
      db.prepare('DELETE FROM risks WHERE company_id = ?').bind(id),
      db.prepare('DELETE FROM reports WHERE company_id = ?').bind(id),
      db.prepare('DELETE FROM contract_snapshots WHERE company_id = ?').bind(id),
      db.prepare('DELETE FROM billing_tariffs WHERE company_id = ?').bind(id),
      ...['aml_prospect_reports','aml_prospect_holds'].map((table) => db.prepare(`DELETE FROM ${table} WHERE order_id IN (SELECT id FROM orders WHERE company_id = ?)`).bind(id)),
      db.prepare('DELETE FROM order_reviews WHERE order_id IN (SELECT id FROM orders WHERE company_id = ?)').bind(id),
      db.prepare('DELETE FROM orders WHERE company_id = ?').bind(id),
      db.prepare('DELETE FROM events WHERE company_id = ?').bind(id),
      db.prepare('DELETE FROM companies WHERE id = ?').bind(id),
    ])
    deleted++
  }
  return deleted
}
