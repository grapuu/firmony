import { localDaySql } from '../app/period-schema'
import { now } from '../db'
import { ENDING, RETENTION } from '../config'
import { PURGE_GRACE_SECONDS } from '../incidents/store'
import { AML_TODAY_SQL } from './retention'

const expiredSql = (o: string, day: string) => `${o}.aml_ended_at IS NOT NULL AND ${o}.expires_at <= unixepoch() AND date(${localDaySql(`${o}.aml_ended_at`)},'+5 years','floor') < ${day}
  AND NOT EXISTS (SELECT 1 FROM companies c WHERE c.ico = ${o}.ico AND c.demo = 0 AND c.invoicing_only = 0 AND (c.ends_on IS NULL OR date(c.ends_on,'+5 years','floor') >= ${day}))`
const clearSql = (o: string, day: string) => `NOT EXISTS (SELECT 1 FROM aml_prospect_reports r WHERE r.order_id = ${o}.id AND r.decided_at IS NULL)
  AND NOT EXISTS (SELECT 1 FROM aml_prospect_holds h WHERE h.order_id = ${o}.id AND h.until_on >= ${day})`

/**
 * A request from the site that never reached the identification of § 7 of Act 297/2008: no order of it has a dossier,
 * an internal finding or a written FSJ request, none is open, accepted or a client's. Nothing of § 19(2) was obtained, so
 * it is kept a year from when it was sent (RETENTION.requestDays), with its orders and their reviews, as the privacy
 * notice says. A request whose order reached the identification keeps the five years from the end of negotiations below.
 */
const UNIDENTIFIED = `SELECT r.id FROM requests r WHERE r.created_at < ?1 AND r.status <> 'client'
  AND NOT EXISTS (SELECT 1 FROM companies c WHERE c.request_id = r.id)
  AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.request_id = r.id AND (o.company_id IS NOT NULL OR o.status = 'accepted' OR o.expires_at > unixepoch()
    OR EXISTS (SELECT 1 FROM aml_dossiers d WHERE d.order_id = o.id) OR EXISTS (SELECT 1 FROM aml_prospect_reports p WHERE p.order_id = o.id)
    OR EXISTS (SELECT 1 FROM aml_prospect_holds h WHERE h.order_id = o.id)))`
export async function forgetUnidentified(env: { DB: D1Database; FILES?: R2Bucket }, at = now()): Promise<number> {
  const db = env.DB
  const cutoff = at - RETENTION.requestDays * 86400
  const due = await db.prepare(`${UNIDENTIFIED} ORDER BY r.created_at LIMIT ?2`).bind(cutoff, ENDING.perRun * 10).all<{ id: string }>()
  let deleted = 0
  for (const { id } of due.results) {
    const orders = await db.prepare('SELECT id FROM orders WHERE request_id = ?').bind(id).all<{ id: string }>()
    if (env.FILES) for (const order of orders.results) {
      // No dossier was ever written; a file of an upload that failed half way is the only thing that could be there.
      const page = await env.FILES.list({ prefix: `onboarding/${order.id}/`, limit: 1000 })
      if (page.objects.length) await env.FILES.delete(page.objects.map((f) => f.key))
    }
    const still = `EXISTS (${UNIDENTIFIED} AND r.id = ?2)`
    const results = await db.batch([
      db.prepare(`DELETE FROM events WHERE company_id IS NULL AND (subject = ?2 OR subject IN (SELECT id FROM orders WHERE request_id = ?2)) AND ${still}`).bind(cutoff, id),
      db.prepare(`DELETE FROM order_reviews WHERE order_id IN (SELECT id FROM orders WHERE request_id = ?2) AND ${still}`).bind(cutoff, id),
      db.prepare(`DELETE FROM orders WHERE request_id = ?2 AND ${still}`).bind(cutoff, id),
      db.prepare(`DELETE FROM requests WHERE id = ?2 AND ${still}`).bind(cutoff, id),
    ])
    if ((results[3]?.meta.changes ?? 0) > 0) deleted++
  }
  return deleted
}

/** Refusal and an unrenewed offer's expiry start a recorded calendar retention period; an active client protects its earlier files. */
export async function forgetProspects(env: { DB: D1Database; FILES?: R2Bucket }, today: string): Promise<number> {
  const db = env.DB
  await forgetUnidentified(env)
  await db.batch([
    db.prepare(`UPDATE orders SET aml_ended_at = COALESCE((SELECT r.aml_ended_at FROM requests r WHERE r.id = orders.request_id),expires_at)
      WHERE company_id IS NULL AND status <> 'accepted' AND aml_ended_at IS NULL AND expires_at <= unixepoch()`),
    db.prepare(`UPDATE requests SET aml_ended_at = (SELECT MAX(o.aml_ended_at) FROM orders o WHERE o.request_id = requests.id)
      WHERE status <> 'client' AND aml_ended_at IS NULL AND EXISTS (SELECT 1 FROM orders o WHERE o.request_id = requests.id)
      AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.request_id = requests.id AND (o.company_id IS NOT NULL OR o.status = 'accepted' OR o.expires_at > unixepoch()))`),
  ])
  const candidates = await db.prepare(`SELECT o.id FROM orders o WHERE o.company_id IS NULL AND o.status <> 'accepted'
    AND o.aml_ended_at IS NOT NULL AND date(${localDaySql('o.aml_ended_at')},'+5 years','floor') < ?1
    AND ${clearSql('o','?1')} AND NOT EXISTS (SELECT 1 FROM companies c WHERE c.ico = o.ico AND c.demo = 0 AND c.invoicing_only = 0
      AND (c.ends_on IS NULL OR date(c.ends_on,'+5 years','floor') >= ?1)) ORDER BY o.aml_ended_at LIMIT ?2`)
    .bind(today,ENDING.perRun).all<{id:string}>()
  let deleted=0
  for (const {id} of candidates.results) {
    const claim=await db.prepare(`UPDATE orders AS o SET aml_purge_started_at = COALESCE(aml_purge_started_at,?1)
      WHERE o.id = ?2 AND o.company_id IS NULL AND o.status <> 'accepted' AND ${expiredSql('o','?3')} AND ${clearSql('o','?3')}`)
      .bind(now(),id,today).run()
    if (!claim.meta.changes) continue
    const destructive=await db.prepare(`UPDATE orders AS o SET aml_delete_started_at = COALESCE(aml_delete_started_at,?1)
      WHERE o.id = ?2 AND o.aml_purge_started_at <= ?3 AND o.company_id IS NULL AND o.status <> 'accepted' AND ${expiredSql('o','?4')} AND ${clearSql('o','?4')}`)
      .bind(now(),id,now()-PURGE_GRACE_SECONDS,today).run()
    if (!destructive.meta.changes) continue
    if (env.FILES) {
      let cursor: string | undefined
      do {
        const page=await env.FILES.list({prefix:`onboarding/${id}/`,cursor,limit:1000})
        if (!await db.prepare(`SELECT 1 AS x FROM orders o WHERE o.id = ?1 AND o.aml_delete_started_at IS NOT NULL AND ${expiredSql('o','?2')} AND ${clearSql('o','?2')}`).bind(id,today).first()) throw new Error('Prospect retention changed')
        if (page.objects.length) await env.FILES.delete(page.objects.map((f)=>f.key))
        cursor=page.truncated?page.cursor:undefined
      } while(cursor)
    }
    const dossierIds=`SELECT id FROM aml_dossiers WHERE order_id = ?1`
    await db.batch([
      db.prepare(`DELETE FROM events WHERE company_id IS NULL AND (subject = ?1 OR subject IN (${dossierIds}))`).bind(id),
      db.prepare(`DELETE FROM aml_checks WHERE dossier_id IN (${dossierIds})`).bind(id),
      db.prepare(`DELETE FROM aml_decisions WHERE dossier_id IN (${dossierIds})`).bind(id),
      db.prepare(`DELETE FROM aml_place_checks WHERE dossier_id IN (${dossierIds})`).bind(id),
      db.prepare(`DELETE FROM aml_policy_reviews WHERE dossier_id IN (${dossierIds})`).bind(id),
      db.prepare('DELETE FROM aml_bank_evidence WHERE dossier_id IN (SELECT id FROM aml_dossiers WHERE order_id = ?)').bind(id),
      db.prepare('DELETE FROM aml_dossiers WHERE order_id = ?').bind(id),
      db.prepare('DELETE FROM aml_prospect_reports WHERE order_id = ?').bind(id),
      db.prepare('DELETE FROM aml_prospect_holds WHERE order_id = ?').bind(id),
      db.prepare('DELETE FROM order_reviews WHERE order_id = ?').bind(id),
      db.prepare('DELETE FROM orders WHERE id = ? AND aml_delete_started_at IS NOT NULL').bind(id),
    ])
    deleted++
  }
  // A request remains while any order or client still refers to it.
  await db.batch([
    db.prepare(`UPDATE requests SET aml_delete_started_at = ?1 WHERE aml_ended_at IS NOT NULL
      AND date(${localDaySql('requests.aml_ended_at')},'+5 years','floor') < ?2 AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.request_id = requests.id)
      AND NOT EXISTS (SELECT 1 FROM companies c WHERE c.request_id = requests.id)`).bind(now(),today),
    db.prepare('DELETE FROM events WHERE company_id IS NULL AND subject IN (SELECT id FROM requests WHERE aml_delete_started_at IS NOT NULL)'),
    db.prepare('DELETE FROM requests WHERE aml_delete_started_at IS NOT NULL'),
  ])
  return deleted
}
