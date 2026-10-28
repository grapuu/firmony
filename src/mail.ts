// The only file that sends email. A message is written into the outbox in the same step as the request it
// reports, and sent from there: at once, and again on the schedule until it has gone out. Logs carry the error's
// short code only, never an address or a subject.
import { BRAND, MAIL } from './config'
import { now } from './db'

/** The one call Cloudflare's email binding offers. */
export interface Mailer {
  send(message: { to: string; from: { email: string; name: string }; replyTo?: string; subject: string; text: string }): Promise<{ messageId?: string }>
}

export interface Message {
  /** What the message is about, once ("owner:<request>", "client:<request>"): the same key is never written twice. */
  key: string
  to: string
  subject: string
  body: string
  /** Where a reply goes: our public mailbox unless said otherwise (an invoice is answered to the company that issued it). */
  replyTo?: string | null
}

const replyOf = (message: Message) => (message.replyTo !== undefined ? message.replyTo : message.to.toLowerCase() === BRAND.email.toLowerCase() ? null : BRAND.email)

export function queueStatement(db: D1Database, message: Message): D1PreparedStatement {
  return db
    .prepare('INSERT OR IGNORE INTO outbox (id, recipient, reply_to, subject, body, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(message.key, message.to, replyOf(message), message.subject, message.body, now())
}

/**
 * A message queued only when the statement before it in the same batch changed a row: an email that tells of a move
 * (a new link written, a reminder recorded) never goes out for a move that another run made first.
 */
export function queueIfChangedStatement(db: D1Database, message: Message): D1PreparedStatement {
  return db
    .prepare('INSERT OR IGNORE INTO outbox (id, recipient, reply_to, subject, body, created_at) SELECT ?, ?, ?, ?, ?, ? WHERE changes() = 1')
    .bind(message.key, message.to, replyOf(message), message.subject, message.body, now())
}

interface Row {
  id: string
  recipient: string
  reply_to: string | null
  subject: string
  body: string
  attempts: number
}

/** Sends what is due. A message is claimed before it is sent, so two runs cannot send it twice. */
export async function flushOutbox(db: D1Database, mailer: Mailer | undefined, limit = 10): Promise<void> {
  if (!mailer) return
  const ts = now()
  const due = await db
    .prepare(
      `SELECT id, recipient, reply_to, subject, body, attempts FROM outbox
       WHERE sent_at IS NULL AND attempts < ?1 AND (tried_at IS NULL OR tried_at + MIN(21600, 60 * (1 << MAX(0, attempts - 1))) <= ?2)
       ORDER BY created_at LIMIT ?3`,
    )
    .bind(MAIL.maxAttempts, ts, limit)
    .all<Row>()
  for (const row of due.results) {
    const claimed = await db
      .prepare('UPDATE outbox SET attempts = attempts + 1, tried_at = ?1 WHERE id = ?2 AND sent_at IS NULL AND attempts = ?3 RETURNING id')
      .bind(ts, row.id, row.attempts)
      .first<{ id: string }>()
    if (!claimed) continue
    try {
      const result = await mailer.send({
        to: row.recipient,
        from: { email: MAIL.from, name: MAIL.name },
        ...(row.reply_to ? { replyTo: row.reply_to } : {}),
        subject: row.subject,
        text: row.body,
      })
      await db.prepare('UPDATE outbox SET sent_at = ?, message_id = ?, error = NULL WHERE id = ?').bind(now(), result?.messageId ?? null, row.id).run()
    } catch (err) {
      const code = (err as { code?: unknown } | null)?.code
      const short = typeof code === 'string' ? code.slice(0, 80) : err instanceof Error ? err.name : 'error'
      await db.prepare('UPDATE outbox SET error = ? WHERE id = ?').bind(short, row.id).run()
      console.error('email not sent', short)
    }
  }
}
