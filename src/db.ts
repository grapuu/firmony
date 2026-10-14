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
  // The client's app and the accountants' side (13 October 2026). Nothing of this step has reached a live database
  // yet (no Worker exists), so it was rewritten in place that evening; once deployed, it is never edited again.
  // Whether a payment still needs a document is never stored: it is read from `links` and `exempt` every time
  // (src/app/store.ts), so it cannot disagree with them.
  [
    `CREATE TABLE IF NOT EXISTS companies (
      id TEXT PRIMARY KEY,
      created_at INTEGER NOT NULL,
      name TEXT NOT NULL,
      ico TEXT,
      dic TEXT,
      icdph TEXT,
      address TEXT,
      register_line TEXT,
      vat_payer INTEGER NOT NULL DEFAULT 0,
      plan TEXT NOT NULL,
      inbox TEXT NOT NULL UNIQUE,
      accountant_id TEXT,
      request_id TEXT,
      note TEXT,
      demo INTEGER NOT NULL DEFAULT 0,
      closed_at INTEGER,
      invoice_iban TEXT,
      invoice_due_days INTEGER NOT NULL DEFAULT 14,
      invoice_footer TEXT,
      order_id TEXT,
      contract_at INTEGER,
      terms_version TEXT,
      signed_by TEXT,
      start_on TEXT,
      notice_at INTEGER,
      notice_by TEXT,
      notice_side TEXT,
      ends_on TEXT,
      purged_at INTEGER
    )`,
    `CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      token TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      request_id TEXT,
      ico TEXT NOT NULL,
      company TEXT NOT NULL,
      address TEXT,
      register_line TEXT,
      directors TEXT,
      plan TEXT NOT NULL,
      person TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      accepted_at INTEGER,
      signed_by TEXT,
      start_on TEXT,
      price_cents INTEGER,
      terms_version TEXT,
      ip_hash TEXT,
      company_id TEXT
    )`,
    'CREATE INDEX IF NOT EXISTS orders_ico ON orders (ico)',
    `CREATE TABLE IF NOT EXISTS company_files (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      created_by TEXT,
      file_name TEXT NOT NULL,
      file_type TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      r2_key TEXT NOT NULL,
      checked_at INTEGER,
      checked_by TEXT
    )`,
    'CREATE INDEX IF NOT EXISTS company_files_company ON company_files (company_id, kind)',
    `CREATE TABLE IF NOT EXISTS declarations (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      created_by TEXT NOT NULL,
      data TEXT NOT NULL,
      checked_at INTEGER,
      checked_by TEXT
    )`,
    'CREATE INDEX IF NOT EXISTS declarations_company ON declarations (company_id, created_at)',
    `CREATE TABLE IF NOT EXISTS risks (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      created_by TEXT NOT NULL,
      level TEXT NOT NULL,
      note TEXT
    )`,
    'CREATE INDEX IF NOT EXISTS risks_company ON risks (company_id, created_at)',
    `CREATE TABLE IF NOT EXISTS reports (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      created_by TEXT NOT NULL,
      body TEXT NOT NULL,
      decided_at INTEGER,
      decided_by TEXT,
      decision TEXT,
      decision_note TEXT
    )`,
    'CREATE INDEX IF NOT EXISTS reports_company ON reports (company_id, created_at)',
    `CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      created_at INTEGER NOT NULL,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      name TEXT NOT NULL,
      team TEXT,
      reminders INTEGER NOT NULL DEFAULT 1
    )`,
    `CREATE TABLE IF NOT EXISTS members (
      company_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      invited_by TEXT,
      PRIMARY KEY (company_id, user_id)
    )`,
    'CREATE INDEX IF NOT EXISTS members_user ON members (user_id)',
    `CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      company_id TEXT,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    )`,
    'CREATE INDEX IF NOT EXISTS sessions_user ON sessions (user_id)',
    `CREATE TABLE IF NOT EXISTS login_links (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      used_at INTEGER
    )`,
    `CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      iban TEXT NOT NULL,
      bank TEXT,
      balance_cents INTEGER,
      balance_on TEXT,
      link_id TEXT,
      remote_id TEXT,
      UNIQUE (company_id, iban)
    )`,
    `CREATE TABLE IF NOT EXISTS bank_links (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      created_by TEXT,
      bank TEXT NOT NULL,
      country TEXT NOT NULL,
      state TEXT NOT NULL UNIQUE,
      session_id TEXT,
      valid_until INTEGER,
      status TEXT NOT NULL,
      synced_at INTEGER,
      tried_at INTEGER,
      error TEXT
    )`,
    'CREATE INDEX IF NOT EXISTS bank_links_company ON bank_links (company_id, status)',
    `CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      account_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      booked_on TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      currency TEXT NOT NULL DEFAULT 'EUR',
      party TEXT,
      party_iban TEXT,
      vs TEXT,
      ss TEXT,
      ks TEXT,
      note TEXT,
      card INTEGER NOT NULL DEFAULT 0,
      ref TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'statement',
      exempt TEXT,
      exempt_note TEXT,
      exempt_by TEXT,
      checked_at INTEGER,
      checked_by TEXT,
      UNIQUE (account_id, ref)
    )`,
    'CREATE INDEX IF NOT EXISTS payments_company ON payments (company_id, booked_on)',
    `CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      source TEXT NOT NULL,
      added_by TEXT,
      file_key TEXT,
      file_type TEXT,
      file_name TEXT,
      file_bytes INTEGER,
      file_hash TEXT,
      status TEXT NOT NULL,
      read_by TEXT,
      read_tries INTEGER NOT NULL DEFAULT 0,
      kind TEXT,
      party TEXT,
      party_ico TEXT,
      party_iban TEXT,
      number TEXT,
      vs TEXT,
      issued_on TEXT,
      due_on TEXT,
      total_cents INTEGER,
      vat_cents INTEGER,
      currency TEXT,
      category TEXT,
      proposal TEXT,
      vat_deduct INTEGER,
      account TEXT,
      booked_at INTEGER,
      booked_by TEXT,
      duplicate_of TEXT,
      invoice_id TEXT,
      paid_privately INTEGER NOT NULL DEFAULT 0,
      deleted_at INTEGER
    )`,
    'CREATE INDEX IF NOT EXISTS documents_company ON documents (company_id, created_at)',
    'CREATE INDEX IF NOT EXISTS documents_hash ON documents (company_id, file_hash)',
    `CREATE TABLE IF NOT EXISTS links (
      document_id TEXT PRIMARY KEY,
      payment_id TEXT NOT NULL,
      company_id TEXT NOT NULL,
      how TEXT NOT NULL,
      by TEXT,
      created_at INTEGER NOT NULL
    )`,
    'CREATE INDEX IF NOT EXISTS links_payment ON links (payment_id)',
    `CREATE TABLE IF NOT EXISTS supplier_rules (
      company_id TEXT NOT NULL,
      key TEXT NOT NULL,
      name TEXT,
      category TEXT NOT NULL,
      vat_deduct INTEGER NOT NULL,
      uses INTEGER NOT NULL DEFAULT 1,
      updated_at INTEGER NOT NULL,
      updated_by TEXT,
      PRIMARY KEY (company_id, key)
    )`,
    `CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      author TEXT,
      side TEXT NOT NULL,
      body TEXT NOT NULL,
      payment_id TEXT,
      seen_at INTEGER
    )`,
    'CREATE INDEX IF NOT EXISTS messages_company ON messages (company_id, created_at)',
    `CREATE TABLE IF NOT EXISTS invoices (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      created_by TEXT,
      status TEXT NOT NULL,
      year INTEGER,
      seq INTEGER,
      number TEXT,
      customer_name TEXT NOT NULL,
      customer_ico TEXT,
      customer_dic TEXT,
      customer_icdph TEXT,
      customer_address TEXT,
      customer_email TEXT,
      issued_on TEXT NOT NULL,
      delivered_on TEXT NOT NULL,
      due_on TEXT NOT NULL,
      note TEXT,
      base_cents INTEGER NOT NULL,
      vat_cents INTEGER NOT NULL,
      total_cents INTEGER NOT NULL,
      iban TEXT,
      token TEXT NOT NULL UNIQUE,
      document_id TEXT,
      sent_at INTEGER,
      reminded_at INTEGER,
      UNIQUE (company_id, number)
    )`,
    'CREATE INDEX IF NOT EXISTS invoices_company ON invoices (company_id, created_at)',
    `CREATE TABLE IF NOT EXISTS invoice_lines (
      invoice_id TEXT NOT NULL,
      position INTEGER NOT NULL,
      description TEXT NOT NULL,
      quantity_milli INTEGER NOT NULL,
      unit TEXT,
      unit_cents INTEGER NOT NULL,
      vat_rate INTEGER NOT NULL,
      base_cents INTEGER NOT NULL,
      PRIMARY KEY (invoice_id, position)
    )`,
    `CREATE TABLE IF NOT EXISTS inbound_mail (
      id TEXT PRIMARY KEY,
      company_id TEXT,
      received_at INTEGER NOT NULL,
      sender TEXT,
      subject TEXT,
      files INTEGER NOT NULL,
      status TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      at INTEGER NOT NULL,
      company_id TEXT,
      user_id TEXT,
      action TEXT NOT NULL,
      subject TEXT,
      detail TEXT
    )`,
    'CREATE INDEX IF NOT EXISTS events_company ON events (company_id, at)',
  ],
  // VAT (14 October 2026): what a document's VAT is for the return and the control statement (src/app/vat.ts),
  // how the company is registered and files, and the returns marked as filed. A period's row is what the
  // Financial Administration knows of it now: the regular return (kind R), or the corrective (O) or supplementary
  // (D) one filed after it, with the control statement's lines as filed (kv, for the next supplementary one) and
  // the filing it replaced (prev, JSON, so that a mark set by mistake can be taken back to it).
  [
    'ALTER TABLE documents ADD COLUMN supplied_on TEXT',
    'ALTER TABLE documents ADD COLUMN vat_mode TEXT',
    'ALTER TABLE documents ADD COLUMN vat_lines TEXT',
    'ALTER TABLE documents ADD COLUMN party_vat_id TEXT',
    'ALTER TABLE documents ADD COLUMN corrects TEXT',
    'ALTER TABLE documents ADD COLUMN vat_period TEXT',
    'ALTER TABLE documents ADD COLUMN foreign_party INTEGER',
    'ALTER TABLE companies ADD COLUMN vat_7a INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE companies ADD COLUMN vat_quarterly INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE companies ADD COLUMN vat_since TEXT',
    'ALTER TABLE companies ADD COLUMN tax_office TEXT',
    'ALTER TABLE companies ADD COLUMN tax_account TEXT',
    // The excess deduction of the last period before ours that was not refunded: the first period of ours deducts it (row 34).
    'ALTER TABLE companies ADD COLUMN vat_carry INTEGER NOT NULL DEFAULT 0',
    `CREATE TABLE IF NOT EXISTS vat_returns (
      company_id TEXT NOT NULL,
      period TEXT NOT NULL,
      filed_at INTEGER NOT NULL,
      filed_on TEXT NOT NULL,
      filed_by TEXT,
      rows TEXT NOT NULL,
      kv_rows INTEGER NOT NULL DEFAULT 0,
      pay_cents INTEGER NOT NULL DEFAULT 0,
      refund_cents INTEGER NOT NULL DEFAULT 0,
      due_on TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'R',
      fast INTEGER NOT NULL DEFAULT 0,
      carried INTEGER NOT NULL DEFAULT 0,
      kv TEXT,
      found_on TEXT,
      prev TEXT,
      PRIMARY KEY (company_id, period)
    )`,
  ],
  // The books (14 October 2026, src/app/ledger.ts). They are worked out from the documents, the payments and the
  // returns every time; stored are only what nothing else holds: the accountant's internal documents and the
  // opening balances (ledger_entries, removed by a mark and never deleted), the account she gave a payment that has no
  // document (payments.contra), and each bank account's analytic account, given once and never renumbered.
  [
    `CREATE TABLE IF NOT EXISTS ledger_entries (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      year INTEGER NOT NULL,
      seq INTEGER,
      number TEXT,
      on_date TEXT NOT NULL,
      text TEXT NOT NULL,
      lines TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      created_by TEXT,
      deleted_at INTEGER,
      deleted_by TEXT
    )`,
    'CREATE INDEX IF NOT EXISTS ledger_entries_company ON ledger_entries (company_id, on_date)',
    'ALTER TABLE payments ADD COLUMN contra TEXT',
    'ALTER TABLE accounts ADD COLUMN ledger TEXT',
    `UPDATE accounts SET ledger = printf('221.%03d', (SELECT COUNT(*) FROM accounts b WHERE b.company_id = accounts.company_id AND b.rowid <= accounts.rowid)) WHERE ledger IS NULL`,
  ],
]

/** The next bank account's analytic account of a company (221.001, 221.002 ...), as SQL over ?1, the company. */
export const NEXT_BANK_LEDGER = `(SELECT printf('221.%03d', COALESCE(MAX(CAST(substr(ledger, 5) AS INTEGER)), 0) + 1) FROM accounts WHERE company_id = ?1)`

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

/** What the privacy notice promises: requests a year, sent and received email ninety days, counters two days. */
export async function purge(db: D1Database): Promise<void> {
  const ts = now()
  await db.batch([
    db.prepare('DELETE FROM requests WHERE created_at < ?').bind(ts - RETENTION.requestDays * 86400),
    db.prepare('DELETE FROM outbox WHERE created_at < ?').bind(ts - RETENTION.outboxDays * 86400),
    db.prepare('DELETE FROM inbound_mail WHERE received_at < ?').bind(ts - RETENTION.outboxDays * 86400),
    db.prepare('DELETE FROM throttle WHERE expires_at < ?').bind(ts),
  ])
}
