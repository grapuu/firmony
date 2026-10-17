// The bank by open banking, as Pennylane and Dougs link it: the client picks the bank, signs in there and allows
// reading the company's accounts; from then on the payments arrive by themselves and pair with their documents.
// Enable Banking (Enable Banking Oy, Finland) is the account information service under PSD2 that reads them: its API
// is called with a token the application signs with its own key (RS256), the consent lasts up to 180 days and is
// renewed with one click, and while nobody is looking the accounts are read four times a day at most (RTS art. 36).
// This file is the only one that talks to Enable Banking.
import { BANK } from '../config'
import { now, sha256Hex } from '../db'
import { intakeFloor } from './ending'
import { readFioLink } from './fio'
import { newToken } from './session'
import { accountFor, balanceStatement, eventStatement, importEntries, matchCompany } from './store'
import { fingerprint, symbols, toCents, type Entry } from './xml'

export interface BankEnv {
  DB: D1Database
  ENABLE_BANKING_APP?: string
  ENABLE_BANKING_KEY?: string
}

/** Whether the bank can be linked at all: the application's id and its key are both there. */
export const bankReady = (env: BankEnv): boolean => Boolean(env.ENABLE_BANKING_APP?.trim() && env.ENABLE_BANKING_KEY?.trim())

/** What Enable Banking answered when it did not answer with what was asked; `code` is its own name for the error. */
export class BankError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | null,
  ) {
    super(`enable banking ${status}${code ? ` ${code}` : ''}`)
    this.name = 'BankError'
  }
}

// ---------------------------------------------------------------------------------------------------------------
// The token every call carries
// ---------------------------------------------------------------------------------------------------------------

const encoder = new TextEncoder()

function base64url(bytes: Uint8Array): string {
  let text = ''
  for (const byte of bytes) text += String.fromCharCode(byte)
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function derLength(n: number): number[] {
  if (n < 0x80) return [n]
  const bytes: number[] = []
  for (let rest = n; rest > 0; rest = Math.floor(rest / 256)) bytes.unshift(rest % 256)
  return [0x80 | bytes.length, ...bytes]
}

/**
 * The private key as PKCS#8, which is what the platform imports. A key written as PKCS#1 ("BEGIN RSA PRIVATE KEY")
 * is wrapped into it; a key pasted into a dashboard on one line, with "\n" written out, is read as well.
 */
export function pkcs8Of(pem: string): Uint8Array {
  const text = pem.replace(/\\n/g, '\n')
  const body = text.replace(/-----(BEGIN|END)[A-Z ]+-----/g, '').replace(/\s+/g, '')
  const der = Uint8Array.from(atob(body), (ch) => ch.charCodeAt(0))
  if (!/BEGIN RSA PRIVATE KEY/.test(text)) return der
  // PrivateKeyInfo ::= SEQUENCE { version 0, AlgorithmIdentifier { rsaEncryption, NULL }, OCTET STRING { the key } }
  const algorithm = [0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00]
  const octets = [0x04, ...derLength(der.length), ...der]
  const inner = [0x02, 0x01, 0x00, ...algorithm, ...octets]
  return Uint8Array.from([0x30, ...derLength(inner.length), ...inner])
}

const keys = new Map<string, Promise<CryptoKey>>()
let held: { app: string; value: string; until: number } | null = null

/** A token for the API: signed with the application's key, an hour long (the API takes up to a day). */
export async function bearer(env: BankEnv, at = Math.floor(Date.now() / 1000)): Promise<string> {
  const app = (env.ENABLE_BANKING_APP ?? '').trim()
  if (held && held.app === app && held.until > at + 120) return held.value
  let key = keys.get(app)
  if (!key) {
    key = crypto.subtle.importKey('pkcs8', pkcs8Of(env.ENABLE_BANKING_KEY ?? ''), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'])
    keys.set(app, key)
    key.catch(() => keys.delete(app))
  }
  const header = base64url(encoder.encode(JSON.stringify({ typ: 'JWT', alg: 'RS256', kid: app })))
  const payload = base64url(encoder.encode(JSON.stringify({ iss: 'enablebanking.com', aud: 'api.enablebanking.com', iat: at, exp: at + 3600 })))
  const signature = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', await key, encoder.encode(`${header}.${payload}`)))
  const value = `${header}.${payload}.${base64url(signature)}`
  held = { app, value, until: at + 3600 }
  return value
}

/** Who is at the screen when a read is asked for by a person: the bank then does not count it among the four. */
export interface Present {
  ip: string
  agent: string
}

async function call<T>(env: BankEnv, method: string, path: string, body?: unknown, present?: Present | null): Promise<T> {
  const headers: Record<string, string> = { authorization: `Bearer ${await bearer(env)}`, accept: 'application/json' }
  if (body !== undefined) headers['content-type'] = 'application/json'
  if (present) {
    headers['psu-ip-address'] = present.ip
    headers['psu-user-agent'] = present.agent.slice(0, 300)
  }
  let res: Response
  try {
    res = await fetch(`${BANK.api}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(BANK.timeoutMs) })
  } catch (err) {
    throw new BankError(0, err instanceof Error ? err.name : 'fetch')
  }
  const text = await res.text()
  let data: unknown = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = null
  }
  if (!res.ok) {
    const answer = (data ?? {}) as Record<string, unknown>
    const code = typeof answer.error === 'string' ? answer.error : typeof answer.code === 'string' ? answer.code : null
    throw new BankError(res.status, code)
  }
  return data as T
}

// ---------------------------------------------------------------------------------------------------------------
// The banks, and linking one
// ---------------------------------------------------------------------------------------------------------------

export interface Aspsp {
  name: string
  country: string
  /** The longest consent the bank gives, in days. */
  maxDays: number
}

let banks: { at: number; list: Aspsp[] } | null = null

/** The banks of Slovakia that read a business's accounts, by name; asked again after six hours. */
export async function listBanks(env: BankEnv): Promise<Aspsp[]> {
  if (banks && Date.now() - banks.at < 6 * 3600 * 1000) return banks.list
  const data = await call<{ aspsps?: unknown[] }>(env, 'GET', `/aspsps?country=${BANK.country}&psu_type=business&service=AIS`)
  const list = (data.aspsps ?? [])
    .map((raw) => raw as Record<string, unknown>)
    .filter((a) => typeof a.name === 'string' && a.name.trim() !== '')
    .map((a) => ({
      name: String(a.name),
      country: typeof a.country === 'string' ? a.country : BANK.country,
      maxDays: typeof a.maximum_consent_validity === 'number' && a.maximum_consent_validity > 0 ? Math.floor(a.maximum_consent_validity / 86400) : BANK.consentDays,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'sk'))
  banks = { at: Date.now(), list }
  return list
}

/**
 * Starts linking a bank: the consent is written down as pending with a hash of its state, and the address of the
 * bank's own sign-in is handed back. The state comes back with the client and ties the answer to this person.
 */
export async function startLink(env: BankEnv, args: { company: string; user: string; bank: string; redirect: string }): Promise<string | null> {
  const db = env.DB
  const aspsp = (await listBanks(env)).find((b) => b.name === args.bank)
  if (!aspsp) return null
  const days = Math.max(1, Math.min(BANK.consentDays, aspsp.maxDays))
  const state = newToken()
  const id = crypto.randomUUID()
  await db.batch([
    db.prepare('DELETE FROM bank_links WHERE company_id = ? AND status = ? AND created_at < ?').bind(args.company, 'pending', now() - BANK.pendingSeconds),
    db
      .prepare("INSERT INTO bank_links (id, company_id, created_at, created_by, bank, country, state, status) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')")
      .bind(id, args.company, now(), args.user, aspsp.name, aspsp.country, await sha256Hex(state)),
  ])
  const answer = await call<{ url?: unknown }>(env, 'POST', '/auth', {
    access: { valid_until: new Date(Date.now() + days * 86400 * 1000).toISOString() },
    aspsp: { name: aspsp.name, country: aspsp.country },
    state,
    redirect_url: args.redirect,
    psu_type: 'business',
    language: 'sk',
  })
  const url = typeof answer.url === 'string' ? answer.url : ''
  // The bank's page is on https; only a developer's own machine, whose address is http, is sent to one on http.
  const local = /^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(args.redirect)
  if (!/^https:\/\//.test(url) && !(local && /^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url))) throw new BankError(502, 'NO_URL')
  return url
}

interface SessionAnswer {
  session_id?: unknown
  accounts?: unknown[]
  access?: { valid_until?: unknown }
}

/**
 * Finishes linking when the client comes back from the bank: the code is exchanged for a session, the company's
 * accounts are written down with the bank's id of each, and a consent this one takes over is closed at the bank.
 * Null when the state is no pending consent of this person in this company, or is older than an hour.
 */
export async function finishLink(env: BankEnv, args: { company: string; user: string; code: string; state: string }): Promise<{ link: string; accounts: number } | null> {
  const db = env.DB
  const pending = await db
    .prepare("SELECT id, bank, created_at FROM bank_links WHERE state = ? AND company_id = ? AND created_by = ? AND status = 'pending'")
    .bind(await sha256Hex(args.state), args.company, args.user)
    .first<{ id: string; bank: string; created_at: number }>()
  if (!pending || pending.created_at < now() - BANK.pendingSeconds) return null
  const session = await call<SessionAnswer>(env, 'POST', '/sessions', { code: args.code })
  const sessionId = typeof session.session_id === 'string' ? session.session_id : null
  if (!sessionId) throw new BankError(502, 'NO_SESSION')
  const until = typeof session.access?.valid_until === 'string' ? Math.floor(Date.parse(session.access.valid_until) / 1000) : null
  const taken = await db
    .prepare("UPDATE bank_links SET status = 'active', session_id = ?, valid_until = ?, error = NULL WHERE id = ? AND status = 'pending'")
    .bind(sessionId, until && Number.isFinite(until) ? until : null, pending.id)
    .run()
  if ((taken.meta?.changes ?? 0) === 0) return null
  let accounts = 0
  for (const raw of session.accounts ?? []) {
    const account = raw as { uid?: unknown; account_id?: { iban?: unknown } }
    const iban = typeof account.account_id?.iban === 'string' ? account.account_id.iban.replace(/\s/g, '').toUpperCase() : null
    if (!iban || !/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban) || typeof account.uid !== 'string') continue
    await accountFor(db, args.company, iban, { bank: pending.bank, link: pending.id, remote: account.uid })
    accounts++
  }
  // A consent whose accounts all went over to this one is replaced: closed at the bank, and read no more.
  const older = await db
    .prepare(
      `SELECT id, session_id FROM bank_links WHERE company_id = ? AND status = 'active' AND id <> ?
         AND id NOT IN (SELECT link_id FROM accounts WHERE company_id = ? AND link_id IS NOT NULL)`,
    )
    .bind(args.company, pending.id, args.company)
    .all<{ id: string; session_id: string | null }>()
  for (const old of older.results) {
    await db.prepare("UPDATE bank_links SET status = 'replaced' WHERE id = ? AND company_id = ?").bind(old.id, args.company).run()
    if (old.session_id) await call(env, 'DELETE', `/sessions/${encodeURIComponent(old.session_id)}`).catch(() => null)
  }
  await db.batch([eventStatement(db, { company: args.company, user: args.user, action: 'bank.linked', subject: pending.id, detail: { bank: pending.bank, accounts } })])
  return { link: pending.id, accounts }
}

/** Ends a consent: closed at the bank, and its accounts read no more. Their payments stay. */
export async function unlink(env: BankEnv, company: string, user: string, linkId: string): Promise<boolean> {
  const db = env.DB
  const link = await db
    .prepare("SELECT session_id, kind FROM bank_links WHERE id = ? AND company_id = ? AND status IN ('active', 'expired')")
    .bind(linkId, company)
    .first<{ session_id: string | null; kind: string }>()
  if (!link) return false
  if (link.kind === 'eb' && link.session_id && bankReady(env)) await call(env, 'DELETE', `/sessions/${encodeURIComponent(link.session_id)}`).catch(() => null)
  await db.batch([
    // A Fio token is forgotten with the link: nothing at Fio needs closing, the owner deletes it there if he wants.
    db.prepare("UPDATE bank_links SET status = 'revoked', token = NULL WHERE id = ? AND company_id = ?").bind(linkId, company),
    db.prepare('UPDATE accounts SET link_id = NULL, remote_id = NULL WHERE link_id = ? AND company_id = ?').bind(linkId, company),
    eventStatement(db, { company, user, action: 'bank.unlinked', subject: linkId }),
  ])
  return true
}

/** Ends a consent at the bank (when a company's data are deleted). */
export async function closeSession(env: BankEnv, sessionId: string): Promise<void> {
  await call(env, 'DELETE', `/sessions/${encodeURIComponent(sessionId)}`)
}

// ---------------------------------------------------------------------------------------------------------------
// Reading the accounts
// ---------------------------------------------------------------------------------------------------------------

/** The day in Bratislava of a moment, YYYY-MM-DD. */
function bratislavaDay(seconds: number): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Bratislava' }).format(new Date(seconds * 1000))
}

const clip = (value: unknown, max: number): string | null => (typeof value === 'string' && value.trim() !== '' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : null)

/**
 * One transaction as a payment of ours. Only what is booked: a payment waiting at the bank may still change or go
 * away. The amount carries the direction the bank names (CRDT in, DBIT out), whatever sign it was written with.
 */
export function entryOf(raw: unknown): Entry | null {
  const tx = (raw ?? {}) as Record<string, any>
  if (tx.status && tx.status !== 'BOOK') return null
  const cents = toCents(typeof tx.transaction_amount?.amount === 'number' ? String(tx.transaction_amount.amount) : tx.transaction_amount?.amount)
  if (cents === null || cents === 0) return null
  const amount = tx.credit_debit_indicator === 'DBIT' ? -Math.abs(cents) : tx.credit_debit_indicator === 'CRDT' ? Math.abs(cents) : cents
  const bookedOn = [tx.booking_date, tx.value_date, tx.transaction_date].map((d) => (typeof d === 'string' ? /^\d{4}-\d{2}-\d{2}/.exec(d)?.[0] : null)).find(Boolean)
  if (!bookedOn) return null
  const out = amount < 0
  const other = out ? tx.creditor : tx.debtor
  const otherAccount = out ? tx.creditor_account : tx.debtor_account
  const remittance = Array.isArray(tx.remittance_information) ? tx.remittance_information.filter((r: unknown) => typeof r === 'string').join(' ').replace(/\s+/g, ' ').trim() : ''
  const card = tx.bank_transaction_code?.code === 'CCRD' || Boolean(tx.merchant_category_code) || /kart|card|\bpos\b/i.test(remittance)
  const party = clip(other?.name, 200) ?? (card && remittance ? clip(remittance.replace(/^(platba kartou|nákup|nakup|pos)\s*/i, ''), 120) : null)
  const iban = typeof otherAccount?.iban === 'string' ? otherAccount.iban.replace(/\s/g, '').toUpperCase() : null
  const { vs, ss, ks } = symbols(clip(tx.reference_number, 140), remittance || null, clip(tx.note, 300))
  const note = clip(remittance, 500) ?? clip(tx.note, 500)
  const ref = clip(tx.entry_reference, 120) ?? clip(tx.transaction_id, 120) ?? `h:${fingerprint([bookedOn, amount, iban, vs, note, party].join('|'))}`
  return {
    ref,
    bookedOn,
    amountCents: amount,
    currency: clip(tx.transaction_amount?.currency, 3) ?? 'EUR',
    party,
    partyIban: iban,
    vs,
    ss,
    ks,
    note,
    card,
  }
}

/** The balance the bank calls closing, else the one it calls booked, else the first it gives. */
export function balanceOf(raw: unknown): { cents: number; on: string } | null {
  const list = Array.isArray((raw as { balances?: unknown })?.balances) ? ((raw as { balances: Record<string, any>[] }).balances) : []
  for (const type of ['CLBD', 'ITBD', 'XPCD', 'CLAV', 'ITAV', null]) {
    const balance = list.find((b) => type === null || b.balance_type === type)
    if (!balance) continue
    const cents = toCents(balance.balance_amount?.amount)
    if (cents === null) continue
    const on = typeof balance.reference_date === 'string' ? balance.reference_date.slice(0, 10) : typeof balance.last_change_date_time === 'string' ? balance.last_change_date_time.slice(0, 10) : bratislavaDay(now())
    return { cents, on }
  }
  return null
}

/** Codes of Enable Banking that mean the consent is over: the client renews it at the bank. */
const ENDED = new Set(['EXPIRED_SESSION', 'CLOSED_SESSION', 'REVOKED_SESSION', 'SESSION_DOES_NOT_EXIST', 'UNAUTHORIZED_ACCESS', 'ACCOUNT_DOES_NOT_EXIST'])

export type Read = { status: 'read'; added: number } | { status: 'ended' } | { status: 'failed'; why: string } | { status: 'none' }

/**
 * Reads the accounts of one consent since the last read (a few days back, for bookings that come late; the first
 * read goes back 90 days), adds what is new and pairs it. A consent the bank says is over is marked expired.
 */
export async function readLink(env: BankEnv, linkId: string, present: Present | null = null, fetcher: typeof fetch = fetch): Promise<Read> {
  const db = env.DB
  // A company whose contract ended more than ten days ago is read no more (point 10.4 of the terms).
  const link = await db
    .prepare(
      `SELECT l.id, l.company_id, l.valid_until, l.synced_at, l.kind, l.token FROM bank_links l JOIN companies c ON c.id = l.company_id
       WHERE l.id = ? AND l.status = 'active' AND c.closed_at IS NULL AND (c.ends_on IS NULL OR c.ends_on >= ?)`,
    )
    .bind(linkId, intakeFloor(bratislavaDay(now())))
    .first<{ id: string; company_id: string; valid_until: number | null; synced_at: number | null; kind: string; token: string | null }>()
  if (!link) return { status: 'none' }
  if (link.kind !== 'fio' && !bankReady(env)) return { status: 'none' }
  // Every try counts against the bank's four a day, so a failed one waits its six hours as well.
  await db.prepare('UPDATE bank_links SET tried_at = ? WHERE id = ?').bind(now(), link.id).run()
  if (link.valid_until !== null && link.valid_until < now()) {
    await db.prepare("UPDATE bank_links SET status = 'expired' WHERE id = ? AND status = 'active'").bind(link.id).run()
    return { status: 'ended' }
  }
  // Fio banka is read by the client's own token (fio.ts).
  if (link.kind === 'fio') return readFioLink(env, link, fetcher)
  const accounts = await db
    .prepare('SELECT id, remote_id FROM accounts WHERE link_id = ? AND company_id = ? AND remote_id IS NOT NULL')
    .bind(link.id, link.company_id)
    .all<{ id: string; remote_id: string }>()
  const since = bratislavaDay(link.synced_at ? link.synced_at - BANK.overlapDays * 86400 : now() - BANK.firstDays * 86400)
  let added = 0
  try {
    for (const account of accounts.results) {
      const entries: Entry[] = []
      const seen = new Map<string, number>()
      let key: string | null = null
      for (let page = 0; page < BANK.pages; page++) {
        const query = new URLSearchParams({ date_from: since })
        if (key) query.set('continuation_key', key)
        const data = await call<{ transactions?: unknown[]; continuation_key?: unknown }>(env, 'GET', `/accounts/${encodeURIComponent(account.remote_id)}/transactions?${query}`, undefined, present)
        for (const tx of data.transactions ?? []) {
          const entry = entryOf(tx)
          if (!entry) continue
          // The same reference twice in one answer is two payments, as in a statement.
          const count = seen.get(entry.ref) ?? 0
          seen.set(entry.ref, count + 1)
          if (count > 0) entry.ref = `${entry.ref}#${count + 1}`
          entries.push(entry)
        }
        key = typeof data.continuation_key === 'string' && data.continuation_key !== '' ? data.continuation_key : null
        if (!key) break
      }
      added += (await importEntries(db, link.company_id, account.id, entries, 'bank')).added
      const balance = balanceOf(await call(env, 'GET', `/accounts/${encodeURIComponent(account.remote_id)}/balances`, undefined, present).catch(() => null))
      if (balance) await balanceStatement(db, account.id, balance.cents, balance.on).run()
    }
  } catch (err) {
    const status = err instanceof BankError ? err.status : 0
    const code = err instanceof BankError ? err.code : err instanceof Error ? err.name : 'error'
    const ended = err instanceof BankError && (status === 401 || (code !== null && ENDED.has(code)))
    // A first read that failed is tried again within a quarter of an hour, not in six: the client waits for it.
    await db
      .prepare(`UPDATE bank_links SET ${ended ? "status = 'expired', " : ''}error = ?, tried_at = CASE WHEN synced_at IS NULL THEN ? ELSE tried_at END WHERE id = ?`)
      .bind(`${status} ${code ?? ''}`.trim().slice(0, 200), now() - BANK.syncEverySeconds + 900, link.id)
      .run()
    if (added > 0) await matchCompany(db, link.company_id)
    return ended ? { status: 'ended' } : { status: 'failed', why: `${status} ${code ?? ''}`.trim() }
  }
  await db.batch([
    db.prepare('UPDATE bank_links SET synced_at = ?, error = NULL WHERE id = ?').bind(now(), link.id),
    ...(added > 0 ? [eventStatement(db, { company: link.company_id, user: null, action: 'bank.read', subject: link.id, detail: { added } })] : []),
  ])
  if (added > 0) await matchCompany(db, link.company_id)
  return { status: 'read', added }
}

/**
 * The schedule's part: consents past their end are marked expired, pending ones that never came back are
 * forgotten, and the consents not read for six hours are read, the longest waiting first.
 */
export async function readDue(env: BankEnv): Promise<number> {
  const db = env.DB
  const ts = now()
  // One statement for every company: a company whose handover is being finalized refuses every write to its rows, so
  // it is left out here, or its one consent would abort the batch and stop every other client's bank as well.
  await db.batch([
    db
      .prepare(
        `UPDATE bank_links SET status = 'expired' WHERE status = 'active' AND valid_until IS NOT NULL AND valid_until < ?
         AND company_id IN (SELECT id FROM companies WHERE purge_started_at IS NULL)`,
      )
      .bind(ts),
    db
      .prepare("DELETE FROM bank_links WHERE status = 'pending' AND created_at < ? AND company_id IN (SELECT id FROM companies WHERE purge_started_at IS NULL)")
      .bind(ts - BANK.pendingSeconds),
  ])
  // Enable Banking's consents only while its application is set up; Fio's tokens always (fio.ts).
  const due = await db
    .prepare(
      `SELECT l.id FROM bank_links l JOIN companies c ON c.id = l.company_id
       WHERE l.status = 'active' AND (l.kind = 'fio' OR ?) AND (l.tried_at IS NULL OR l.tried_at < ?) AND c.closed_at IS NULL AND (c.ends_on IS NULL OR c.ends_on >= ?)
       ORDER BY COALESCE(l.tried_at, 0) LIMIT ?`,
    )
    .bind(bankReady(env) ? 1 : 0, ts - BANK.syncEverySeconds, intakeFloor(bratislavaDay(ts)), BANK.linksPerRun)
    .all<{ id: string }>()
  let read = 0
  for (const row of due.results) {
    try {
      const result = await readLink(env, row.id)
      if (result.status === 'read') read++
    } catch (err) {
      console.error('a bank read failed', err instanceof Error ? err.name : 'error')
    }
  }
  return read
}

// ---------------------------------------------------------------------------------------------------------------
// What the pages show
// ---------------------------------------------------------------------------------------------------------------

export interface BankAccountView {
  id: string
  iban: string
  balanceCents: number | null
  balanceOn: string | null
}

export interface BankLinkView {
  id: string
  /** 'eb': a consent of Enable Banking; 'fio': Fio banka read by the client's own token. */
  kind: 'eb' | 'fio'
  bank: string
  status: 'active' | 'expired' | 'revoked' | 'replaced'
  createdAt: number
  validUntil: number | null
  syncedAt: number | null
  error: string | null
  accounts: BankAccountView[]
}

/** The company's consents that matter to the client: the active ones, and the ones that ended and were not renewed. */
export async function linksOf(db: D1Database, company: string): Promise<BankLinkView[]> {
  const rows = await db
    .prepare(
      `SELECT l.id, l.kind, l.bank, l.status, l.created_at, l.valid_until, l.synced_at, l.error FROM bank_links l
       WHERE l.company_id = ? AND (l.status = 'active' OR (l.status = 'expired' AND NOT EXISTS (
         SELECT 1 FROM bank_links n WHERE n.company_id = l.company_id AND n.bank = l.bank AND n.status = 'active' AND n.created_at > l.created_at)))
       ORDER BY l.created_at DESC LIMIT 20`,
    )
    .bind(company)
    .all<Record<string, unknown>>()
  const accounts = await db
    .prepare('SELECT id, iban, balance_cents, balance_on, link_id FROM accounts WHERE company_id = ? AND link_id IS NOT NULL ORDER BY iban')
    .bind(company)
    .all<{ id: string; iban: string; balance_cents: number | null; balance_on: string | null; link_id: string }>()
  return rows.results.map((row) => ({
    id: String(row.id),
    kind: row.kind === 'fio' ? 'fio' : 'eb',
    bank: String(row.bank),
    status: String(row.status) as BankLinkView['status'],
    createdAt: Number(row.created_at),
    validUntil: typeof row.valid_until === 'number' ? row.valid_until : null,
    syncedAt: typeof row.synced_at === 'number' ? row.synced_at : null,
    error: typeof row.error === 'string' ? row.error : null,
    accounts: accounts.results.filter((a) => a.link_id === row.id).map((a) => ({ id: a.id, iban: a.iban, balanceCents: a.balance_cents, balanceOn: a.balance_on })),
  }))
}

/** What the overview says about the bank: nothing, a consent that ends soon, or one that ended. */
export type BankNotice = { kind: 'renew'; bank: string; until: number; fio: boolean } | { kind: 'ended'; bank: string; fio: boolean } | null

export function noticeOf(links: BankLinkView[], at: number = now()): BankNotice {
  const ended = links.find((l) => l.status === 'expired')
  if (ended) return { kind: 'ended', bank: ended.bank, fio: ended.kind === 'fio' }
  const soon = links.find((l) => l.status === 'active' && l.validUntil !== null && l.validUntil - at < BANK.renewDays * 86400)
  return soon && soon.validUntil !== null ? { kind: 'renew', bank: soon.bank, until: soon.validUntil, fio: soon.kind === 'fio' } : null
}

/**
 * Takes an account that is not the company's (a person's own account chosen at the bank by mistake) out: it is read
 * no more at once. Its payments from the bank go with it only while the books have not touched any of them: none is
 * paired with a document, given an account or checked by the accountant, and no month is locked. Otherwise they stay
 * where they are, and the accountant is told, because taking them out would change books she has already worked on.
 * A statement's payments are kept either way.
 */
export async function dropAccount(db: D1Database, company: string, user: string, accountId: string): Promise<'dropped' | 'kept' | false> {
  const account = await db.prepare('SELECT id FROM accounts WHERE id = ? AND company_id = ? AND link_id IS NOT NULL').bind(accountId, company).first<{ id: string }>()
  if (!account) return false
  const touched = await db
    .prepare(
      `SELECT EXISTS (SELECT 1 FROM payments p WHERE p.account_id = ?1 AND p.company_id = ?2
           AND (p.contra IS NOT NULL OR p.checked_at IS NOT NULL OR EXISTS (SELECT 1 FROM links l WHERE l.payment_id = p.id)))
         OR EXISTS (SELECT 1 FROM period_locks WHERE company_id = ?2 AND through_on IS NOT NULL) AS touched`,
    )
    .bind(accountId, company)
    .first<{ touched: number }>()
  const keep = Boolean(touched?.touched)
  await db.batch([
    ...(keep ? [] : [db.prepare("DELETE FROM payments WHERE account_id = ? AND company_id = ? AND source = 'bank'").bind(accountId, company)]),
    db.prepare('UPDATE accounts SET link_id = NULL, remote_id = NULL WHERE id = ? AND company_id = ?').bind(accountId, company),
    ...(keep ? [] : [db.prepare('DELETE FROM accounts WHERE id = ? AND company_id = ? AND NOT EXISTS (SELECT 1 FROM payments WHERE account_id = ?)').bind(accountId, company, accountId)]),
    eventStatement(db, { company, user, action: 'bank.account.dropped', subject: accountId, detail: { payments: keep ? 'kept' : 'removed' } }),
  ])
  return keep ? 'kept' : 'dropped'
}
