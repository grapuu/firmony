// An e-mail left on the site to start (schema step 89, POST /zacat/email) whose request was never finished: one reminder,
// once, with the way back to where it stopped (his word of 29 October 2026: whoever starts must not be lost). Nothing
// in it was typed by anybody: the link carries only the row's id. Not sent to an address that sent a request, has an
// account, applied for the s. r. o. for 1 €, or left the e-mail within the last two hours (it may still be filling the
// form in); never to a row older than three days, and only between nine and eight in Bratislava.
import { BRAND, OPERATOR } from './config'
import { copy } from './copy'
import { queueIfChangedStatement } from './mail'
import { bratislava } from './app/remind'

// perDay: all reminders of the last 24 hours together. The form takes any address without proving it, so many typed in a
// row must not use up the day's sending (200 a day to start) that sign-ins and contracts need.
export const LEAD_REMIND = { afterSeconds: 2 * 3600, withinSeconds: 3 * 86400, perRun: 25, perDay: 40 }

/** How many reminders were queued. `origin` is the site's address the links lead to. */
export async function remindLeads(db: D1Database, ms: number, origin: string): Promise<number> {
  const b = bratislava(ms)
  if (b.hour < 9 || b.hour >= 20) return 0
  const ts = Math.floor(ms / 1000)
  const sent = await db.prepare('SELECT COUNT(*) AS n FROM leads WHERE reminded_at >= ?').bind(ts - 86400).first<{ n: number }>()
  const room = Math.min(LEAD_REMIND.perRun, LEAD_REMIND.perDay - Number(sent?.n ?? 0))
  if (room <= 0) return 0
  const rows = await db
    .prepare(
      `SELECT l.id, l.email FROM leads l
        WHERE l.reminded_at IS NULL AND l.last_at <= ?1 AND l.last_at >= ?2
          AND NOT EXISTS (SELECT 1 FROM requests r WHERE lower(r.email) = l.email)
          AND NOT EXISTS (SELECT 1 FROM users u WHERE lower(u.email) = l.email)
          AND NOT EXISTS (SELECT 1 FROM foundings f WHERE lower(f.email) = l.email)
        ORDER BY l.last_at LIMIT ?3`,
    )
    .bind(ts - LEAD_REMIND.afterSeconds, ts - LEAD_REMIND.withinSeconds, room)
    .all<{ id: string; email: string }>()
  let queued = 0
  for (const row of rows.results) {
    const m = copy.lead.mail
    const plain = (text: string) => text.replace(/ /g, ' ')
    const results = await db.batch([
      db.prepare('UPDATE leads SET reminded_at = ? WHERE id = ? AND reminded_at IS NULL').bind(ts, row.id),
      queueIfChangedStatement(db, {
        key: `lead:${row.id}`,
        to: row.email,
        subject: m.subject,
        body: [
          'Dobrý deň,',
          '',
          plain(m.lead),
          `${origin}/zacat?l=${row.id}`,
          '',
          plain(m.fresh),
          `${origin}/zalozenie`,
          '',
          plain(m.end),
          '',
          'Christian Juhás',
          BRAND.name,
          '',
          `${BRAND.name} je služba spoločnosti ${OPERATOR.name}, ${OPERATOR.street}, ${OPERATOR.postalCity}, IČO ${OPERATOR.companyId}, zapísanej ${OPERATOR.registeredIn}.`,
        ].join('\n'),
      }),
    ])
    if ((results[1]?.meta?.changes ?? 0) > 0) queued++
  }
  return queued
}
