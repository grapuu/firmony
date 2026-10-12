// The database: requests from the site, the outbox of email, and the counters that limit the forms.
// The schema applies itself on the first request (MIGRATIONS); never edit a step that has reached the live database.
import { RETENTION } from './config'

export const now = (): number => Math.floor(Date.now() / 1000)

const MIGRATIONS: readonly string[][] = [
  [
    `CREATE TABLE IF NOT EXISTS requests (
      id TEXT PRIMARY KEY,
      created_at INTEGER NOT NULL,
      ico TEXT,
      company TEXT,
      address TEXT,
      company_source TEXT,
      plan TEXT NOT NULL,
      situation TEXT NOT NULL,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT,
      note TEXT,
      source TEXT,
      privacy_version TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'new'
    )`,
    'CREATE INDEX IF NOT EXISTS requests_created ON requests (created_at)',
    `CREATE TABLE IF NOT EXISTS outbox (
      id TEXT PRIMARY KEY,
      recipient TEXT NOT NULL,
      reply_to TEXT,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      tried_at INTEGER,
      sent_at INTEGER,
      message_id TEXT,
      error TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS throttle (
      key TEXT NOT NULL,
      bucket INTEGER NOT NULL,
      hits INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      PRIMARY KEY (key, bucket)
    )`,
    'CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)',
  ],
]

export const SCHEMA_VERSION = MIGRATIONS.length

let ready: Promise<void> | null = null

/** Brings the database up to date, once per isolate. A failure is tried again on the next request. */
export function ensureSchema(db: D1Database): Promise<void> {
  if (!ready) {
    ready = migrate(db).catch((err) => {
      ready = null
      throw err
    })
  }
  return ready
}

async function migrate(db: D1Database): Promise<void> {
  await db.prepare('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)').run()
  const row = await db.prepare("SELECT value FROM meta WHERE key = 'schema'").first<{ value: string }>()
  const at = Number(row?.value ?? 0)
  for (let step = at; step < MIGRATIONS.length; step++) {
    const statements = (MIGRATIONS[step] ?? []).map((sql) => db.prepare(sql))
    statements.push(db.prepare("INSERT INTO meta (key, value) VALUES ('schema', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(String(step + 1)))
    await db.batch(statements)
  }
}

/** A SHA-256 of a text, as hex. Counters hold only hashes, never an address or an email. */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

/**
 * Counts one more use of something within a window and says whether it is still within the limit. The count and
 * the answer are one statement, so requests that arrive at the same moment cannot all slip through.
 */
export async function withinLimit(db: D1Database, kind: string, who: string, limit: number, windowSeconds: number): Promise<boolean> {
  const key = await sha256Hex(`${kind}:${who}`)
  const ts = now()
  const bucket = Math.floor(ts / windowSeconds)
  const row = await db
    .prepare(
      `INSERT INTO throttle (key, bucket, hits, expires_at) VALUES (?1, ?2, 1, ?3)
       ON CONFLICT(key, bucket) DO UPDATE SET hits = hits + 1
       RETURNING hits`,
    )
    .bind(key, bucket, (bucket + 1) * windowSeconds + RETENTION.throttleHours * 3600)
    .first<{ hits: number }>()
  return (row?.hits ?? limit + 1) <= limit
}

export interface NewRequest {
  id: string
  ico: string | null
  company: string | null
  address: string | null
  companySource: 'register' | 'manual' | null
  plan: string
  situation: string
  name: string
  email: string
  phone: string | null
  note: string | null
  source: string | null
  privacyVersion: string
}

export function insertRequestStatement(db: D1Database, r: NewRequest): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO requests (id, created_at, ico, company, address, company_source, plan, situation, name, email, phone, note, source, privacy_version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(r.id, now(), r.ico, r.company, r.address, r.companySource, r.plan, r.situation, r.name, r.email, r.phone, r.note, r.source, r.privacyVersion)
}

/** What the privacy notice promises: requests a year, sent email ninety days, counters two days. */
export async function purge(db: D1Database): Promise<void> {
  const ts = now()
  await db.batch([
    db.prepare('DELETE FROM requests WHERE created_at < ?').bind(ts - RETENTION.requestDays * 86400),
    db.prepare('DELETE FROM outbox WHERE created_at < ?').bind(ts - RETENTION.outboxDays * 86400),
    db.prepare('DELETE FROM throttle WHERE expires_at < ?').bind(ts),
  ])
}

