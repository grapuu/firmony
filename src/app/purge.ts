// What happens to a company's data after its contract (point 8.8 and 10.4 of the terms). Ninety days past the last
// day, the schedule deletes the files and everything the company had in the app: documents, payments, accounts,
// the bank's consents (closed at the bank too) and statements, invoices, messages, the email that came in, the suppliers' rules,
// the returns, the closings and the other filings marked as filed, the employees and their payroll, and the accountant's own entries of the books (the client took the books along in its
// download), the handover, its people's access, and the accounts of people who belong to no company and to no team
// any more.
// What stays is what the law against money laundering keeps for five years after the end (s. 19 of Act No.
// 297/2008 Z. z.): the company's row with the contract, the order it was concluded by, the power of attorney, the
// declarations, the risk, the internal reports and the record of events. After those five years they go as well.
import { ENDING } from '../config'
import { now } from '../db'
import { bankReady, closeSession, type BankEnv } from './bank'
import { purgeFloor, recordsFloor } from './ending'
import { eventStatement } from './store'
import { exportYears } from './export'
import { confirmedRevision } from './handover-store'
import { bratislava } from './remind'

export interface PurgeEnv extends BankEnv {
  FILES?: R2Bucket
}

/** Deletes every object under a prefix but those kept; returns how many went. */
async function deletePrefix(files: R2Bucket, prefix: string, keep: Set<string> = new Set()): Promise<number> {
  let deleted = 0
  let cursor: string | undefined
  do {
    const page = await files.list({ prefix, cursor, limit: 1000 })
    const keys = page.objects.map((o) => o.key).filter((key) => !keep.has(key))
    if (keys.length > 0) {
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

/** One company's data, deleted: the files first, then the rows in one batch, which either all go or none. */
export async function purgeCompany(env: PurgeEnv, companyId: string, today = bratislava(Date.now()).day): Promise<{ files: number; rows: number }> {
  const db = env.DB
  const revision = await confirmedRevision(db, companyId, await exportYears(db, companyId))
  if (revision === null) return { files: 0, rows: 0 }
  // Freeze new writes before any external file deletion. A change since the handover check cancels this claim.
  const claim = await db.prepare(`UPDATE companies SET purge_started_at = COALESCE(purge_started_at, ?) WHERE id = ? AND purged_at IS NULL AND demo = 0 AND ends_on < ?
    AND COALESCE((SELECT revision FROM company_data_revisions WHERE company_id = companies.id), 0) = ?`).bind(now(), companyId, purgeFloor(today), revision).run()
  if ((claim.meta?.changes ?? 0) === 0) return { files: 0, rows: 0 }
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
    files += await deletePrefix(env.FILES, `companies/${companyId}/documents/`)
    files += await deletePrefix(env.FILES, `companies/${companyId}/statements/`)
    files += await deletePrefix(env.FILES, `companies/${companyId}/papers/`, new Set(kept.results.map((r) => r.r2_key)))
  }
  const lonely = await db.prepare(LONELY).bind(companyId).all<{ user_id: string }>()
  const people = lonely.results.map((r) => r.user_id)
  const statements: D1PreparedStatement[] = [
    db.prepare('DELETE FROM links WHERE company_id = ?').bind(companyId),
    db.prepare('DELETE FROM documents WHERE company_id = ?').bind(companyId),
    db.prepare('DELETE FROM payments WHERE company_id = ?').bind(companyId),
    db.prepare('DELETE FROM accounts WHERE company_id = ?').bind(companyId),
    db.prepare('DELETE FROM bank_links WHERE company_id = ?').bind(companyId),
    db.prepare('DELETE FROM statements WHERE company_id = ?').bind(companyId),
    db.prepare('DELETE FROM invoice_lines WHERE invoice_id IN (SELECT id FROM invoices WHERE company_id = ?)').bind(companyId),
    db.prepare('DELETE FROM invoices WHERE company_id = ?').bind(companyId),
    db.prepare('DELETE FROM messages WHERE company_id = ?').bind(companyId),
    db.prepare('DELETE FROM inbound_mail WHERE company_id = ?').bind(companyId),
    db.prepare('DELETE FROM supplier_rules WHERE company_id = ?').bind(companyId),
    db.prepare('DELETE FROM vat_returns WHERE company_id = ?').bind(companyId),
    db.prepare('DELETE FROM filings WHERE company_id = ?').bind(companyId),
    db.prepare('DELETE FROM filing_history WHERE company_id = ?').bind(companyId),
    db.prepare('DELETE FROM closings WHERE company_id = ?').bind(companyId),
    db.prepare('DELETE FROM employees WHERE company_id = ?').bind(companyId),
    db.prepare('DELETE FROM payroll_runs WHERE company_id = ?').bind(companyId),
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

/** The schedule's part: companies past their ninety days lose their data; past five years, the rest. */
export async function purgeEnded(env: PurgeEnv, today: string): Promise<number> {
  const db = env.DB
  const due = await db
    .prepare('SELECT id FROM companies WHERE ends_on IS NOT NULL AND ends_on < ? AND purged_at IS NULL AND demo = 0 ORDER BY COALESCE(purge_checked_at, 0), ends_on LIMIT ?')
    .bind(purgeFloor(today), ENDING.perRun)
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
    .prepare('SELECT id FROM companies WHERE purged_at IS NOT NULL AND ends_on IS NOT NULL AND ends_on < ? AND demo = 0 ORDER BY ends_on LIMIT ?')
    .bind(recordsFloor(today), ENDING.perRun)
    .all<{ id: string }>()
  for (const { id } of due.results) {
    if (env.FILES) await deletePrefix(env.FILES, `companies/${id}/`)
    await db.batch([
      db.prepare('DELETE FROM company_files WHERE company_id = ?').bind(id),
      db.prepare('DELETE FROM declarations WHERE company_id = ?').bind(id),
      db.prepare('DELETE FROM risks WHERE company_id = ?').bind(id),
      db.prepare('DELETE FROM reports WHERE company_id = ?').bind(id),
      db.prepare('DELETE FROM contract_snapshots WHERE company_id = ?').bind(id),
      db.prepare('DELETE FROM order_reviews WHERE order_id IN (SELECT id FROM orders WHERE company_id = ?)').bind(id),
      db.prepare('DELETE FROM orders WHERE company_id = ?').bind(id),
      db.prepare('DELETE FROM events WHERE company_id = ?').bind(id),
      db.prepare('DELETE FROM companies WHERE id = ?').bind(id),
    ])
  }
  return due.results.length
}
