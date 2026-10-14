// Fio banka, read by the client's own token (14 October 2026). Fio gives its clients a free API ("API Bankovníctvo
// pre všetkých klientov zdarma!", fio.sk): the owner creates a token in Fio's internet banking (Nastavenia, the tab
// API, "Sledovanie účtu": a token that only reads), valid for 180 days at most, and pastes it here once. The schedule
// then reads the movements every six hours, as it reads a consent of Enable Banking, from the same table (bank_links,
// kind 'fio'), and the payments pair with their documents the same way.
//
// Read in Fio's manual (API_Bankovnictvi.pdf, version 1.9 of 16 October 2025), which fio.sk links for Slovak
// accounts too: movements of a period at `/periods/{token}/{from}/{to}/transactions.json`, dates as YYYY-MM-DD; one
// token asked at most every 30 seconds (409 when sooner); the JSON names each value by a column (22 the movement's
// id, 0 the date, 1 the amount, 14 the currency, 2 the other account, 3 its bank code, 10 its name, 4 KS, 5 VS, 6 SS,
// 7 the user's identification, 16 the message, 8 the kind of movement, 25 a comment). Never seen against the real API.
import { BANK, FIO } from '../config'
import { now } from '../db'
import type { Read } from './bank'
import { accountFor, balanceStatement, eventStatement, importEntries, matchCompany } from './store'
import { fingerprint, symbols, toCents, type Entry } from './xml'

export interface FioEnv {
  DB: D1Database
}

/** What Fio's internet banking shows as a token: letters and digits, 64 of them; a little room either way. */
export function isFioToken(token: string): boolean {
  return /^[A-Za-z0-9]{32,128}$/.test(token)
}

/** The day in Bratislava of a moment, YYYY-MM-DD. */
const bratislavaDay = (seconds: number) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Bratislava' }).format(new Date(seconds * 1000))

/** A date of Fio's answer: milliseconds since 1970 (the manual's example) or "2026-10-12+0200". */
export function fioDay(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) return bratislavaDay(Math.floor(value / 1000))
  if (typeof value === 'string') return /^\d{4}-\d{2}-\d{2}/.exec(value)?.[0] ?? null
  return null
}

const column = (tx: Record<string, unknown>, id: number): unknown => {
  const cell = tx[`column${id}`] as { value?: unknown } | null | undefined
  return cell && typeof cell === 'object' ? cell.value : undefined
}

const textOf = (value: unknown, max: number): string | null => {
  if (typeof value === 'number') return String(value)
  return typeof value === 'string' && value.trim() !== '' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : null
}

/** The IBAN of a Czech or Slovak account given as "prefix-number" and a bank code (ISO 13616: mod 97). */
export function ibanOf(country: string, account: string, bankCode: string): string | null {
  const m = /^(?:(\d{1,6})-)?(\d{2,10})$/.exec(account.replace(/\s/g, ''))
  if (!m || !/^\d{4}$/.test(bankCode) || (country !== 'SK' && country !== 'CZ')) return null
  const bban = `${bankCode}${(m[1] ?? '').padStart(6, '0')}${(m[2] ?? '').padStart(10, '0')}`
  const digits = `${bban}${[...country].map((ch) => ch.charCodeAt(0) - 55).join('')}00`
  let rest = 0
  for (const ch of digits) rest = (rest * 10 + Number(ch)) % 97
  return `${country}${String(98 - rest).padStart(2, '0')}${bban}`
}

/** One movement of Fio's answer as a payment of ours. */
export function fioEntry(raw: unknown, country: string): Entry | null {
  const tx = (raw ?? {}) as Record<string, unknown>
  const id = textOf(column(tx, 22), 40)
  const bookedOn = fioDay(column(tx, 0))
  const amountValue = column(tx, 1)
  const cents = toCents(typeof amountValue === 'number' ? String(amountValue) : typeof amountValue === 'string' ? amountValue : null)
  if (!bookedOn || cents === null || cents === 0) return null
  const kind = textOf(column(tx, 8), 120) ?? ''
  const card = /kart/i.test(kind)
  const other = textOf(column(tx, 2), 40)
  const code = textOf(column(tx, 3), 10)
  const iban = other && /^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(other.replace(/\s/g, '').toUpperCase()) ? other.replace(/\s/g, '').toUpperCase() : other && code ? ibanOf(country, other, code) : null
  const identification = textOf(column(tx, 7), 200)
  const message = textOf(column(tx, 16), 300)
  const comment = textOf(column(tx, 25), 300)
  const named = textOf(column(tx, 10), 200)
  const party = named ?? (card && identification ? identification.replace(/^(nákup|nakup|platba kartou)[:\s]*/i, '').slice(0, 120) : null)
  const fromSymbols = symbols(message, identification)
  const vs = textOf(column(tx, 5), 10) ?? fromSymbols.vs
  const ss = textOf(column(tx, 6), 10) ?? fromSymbols.ss
  const ks = textOf(column(tx, 4), 10) ?? fromSymbols.ks
  const note = message ?? comment ?? identification
  return {
    ref: id ? `fio:${id}` : `h:${fingerprint([bookedOn, cents, iban, vs, note, party].join('|'))}`,
    bookedOn,
    amountCents: cents,
    currency: textOf(column(tx, 14), 3) ?? 'EUR',
    party,
    partyIban: iban,
    vs: vs?.replace(/\D/g, '') || null,
    ss: ss?.replace(/\D/g, '') || null,
    ks: ks?.replace(/\D/g, '') || null,
    note,
    card,
  }
}

export interface FioStatement {
  iban: string | null
  accountId: string | null
  closing: { cents: number; on: string } | null
  entries: Entry[]
}

/** Fio's answer for a period, read. */
export function readFio(json: unknown): FioStatement | null {
  const statement = (json as { accountStatement?: { info?: Record<string, unknown>; transactionList?: { transaction?: unknown } } } | null)?.accountStatement
  if (!statement || typeof statement !== 'object') return null
  const info = statement.info ?? {}
  const iban = typeof info.iban === 'string' ? info.iban.replace(/\s/g, '').toUpperCase() : null
  const country = iban?.slice(0, 2) ?? 'SK'
  const list = statement.transactionList?.transaction
  const entries = (Array.isArray(list) ? list : []).map((tx) => fioEntry(tx, country)).filter((e): e is Entry => e !== null)
  const closingCents = toCents(typeof info.closingBalance === 'number' ? String(info.closingBalance) : typeof info.closingBalance === 'string' ? info.closingBalance : null)
  const closingOn = fioDay(info.dateEnd)
  return {
    iban: iban && /^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban) ? iban : null,
    accountId: typeof info.accountId === 'string' ? info.accountId : typeof info.accountId === 'number' ? String(info.accountId) : null,
    closing: closingCents !== null && closingOn ? { cents: closingCents, on: closingOn } : null,
    entries,
  }
}

export class FioError extends Error {
  constructor(
    readonly status: number,
    readonly kind: 'soon' | 'token' | 'down',
  ) {
    super(`fio ${status} ${kind}`)
  }
}

/** Movements of a period. 409: asked too soon; 401, 403 and 404: the token does not work (any more); else: try later. */
export async function fetchFio(token: string, from: string, to: string, fetcher: typeof fetch = fetch): Promise<FioStatement> {
  const res = await fetcher(`${FIO.api}/periods/${encodeURIComponent(token)}/${from}/${to}/transactions.json`, { signal: AbortSignal.timeout(FIO.timeoutMs) })
  if (res.status === 409) throw new FioError(409, 'soon')
  if (res.status === 401 || res.status === 403 || res.status === 404) throw new FioError(res.status, 'token')
  if (!res.ok) throw new FioError(res.status, 'down')
  const read = readFio(await res.json().catch(() => null))
  if (!read) throw new FioError(res.status, 'down')
  return read
}

/** Reads one Fio link: the movements since the last read (a few days back; the first read 90 days), and its balance. */
export async function readFioLink(env: FioEnv, link: { id: string; company_id: string; token: string | null; synced_at: number | null }, fetcher: typeof fetch = fetch): Promise<Read> {
  const db = env.DB
  if (!link.token) return { status: 'ended' }
  const since = bratislavaDay(link.synced_at ? link.synced_at - BANK.overlapDays * 86400 : now() - BANK.firstDays * 86400)
  const today = bratislavaDay(now())
  try {
    const statement = await fetchFio(link.token, since, today, fetcher)
    if (!statement.iban) throw new FioError(200, 'down')
    const account = await accountFor(db, link.company_id, statement.iban, { bank: 'Fio banka', link: link.id, remote: statement.accountId })
    if (!account) throw new FioError(200, 'down')
    const added = (await importEntries(db, link.company_id, account, statement.entries, 'bank')).added
    if (statement.closing) await balanceStatement(db, account, statement.closing.cents, statement.closing.on).run()
    await db.batch([
      db.prepare('UPDATE bank_links SET synced_at = ?, error = NULL WHERE id = ?').bind(now(), link.id),
      // A token that reads nothing any more (its account went over to this one) ends, and is forgotten.
      db
        .prepare(
          `UPDATE bank_links SET status = 'replaced', token = NULL WHERE company_id = ? AND kind = 'fio' AND status IN ('active', 'expired') AND id <> ?
             AND id NOT IN (SELECT link_id FROM accounts WHERE company_id = ? AND link_id IS NOT NULL)`,
        )
        .bind(link.company_id, link.id, link.company_id),
      ...(added > 0 ? [eventStatement(db, { company: link.company_id, user: null, action: 'bank.read', subject: link.id, detail: { added, bank: 'fio' } })] : []),
    ])
    if (added > 0) await matchCompany(db, link.company_id)
    return { status: 'read', added }
  } catch (err) {
    const fio = err instanceof FioError ? err : null
    const ended = fio?.kind === 'token'
    await db
      .prepare(`UPDATE bank_links SET ${ended ? "status = 'expired', " : ''}error = ?, tried_at = CASE WHEN synced_at IS NULL THEN ? ELSE tried_at END WHERE id = ?`)
      .bind(fio ? `${fio.status} ${fio.kind}` : err instanceof Error ? err.name : 'error', now() - BANK.syncEverySeconds + 900, link.id)
      .run()
    return ended ? { status: 'ended' } : { status: 'failed', why: fio ? `${fio.status} ${fio.kind}` : 'error' }
  }
}

/**
 * The owner's token becomes a link of the company, read at once. A token Fio does not take is forgotten again and
 * the owner is told; a token that is right but asked too soon stays and is read by the schedule. A new token for an
 * account another token read takes its place: the old one is read no more and forgotten.
 */
export async function linkFio(
  env: FioEnv,
  args: { company: string; user: string; token: string },
  fetcher: typeof fetch = fetch,
): Promise<{ status: 'linked'; added: number } | { status: 'soon' } | { status: 'refused' }> {
  const db = env.DB
  const id = crypto.randomUUID()
  await db
    .prepare(
      "INSERT INTO bank_links (id, company_id, created_at, created_by, bank, country, state, status, valid_until, kind, token, tried_at) VALUES (?, ?, ?, ?, 'Fio banka', 'SK', ?, 'active', ?, 'fio', ?, ?)",
    )
    .bind(id, args.company, now(), args.user, crypto.randomUUID(), now() + FIO.tokenDays * 86400, args.token, now())
    .run()
  const read = await readFioLink(env, { id, company_id: args.company, token: args.token, synced_at: null }, fetcher)
  if (read.status === 'ended') {
    await db.prepare('DELETE FROM bank_links WHERE id = ?').bind(id).run()
    return { status: 'refused' }
  }
  await db.batch([eventStatement(db, { company: args.company, user: args.user, action: 'bank.linked', subject: id, detail: { bank: 'Fio banka', kind: 'fio' } })])
  return read.status === 'read' ? { status: 'linked', added: read.added } : { status: 'soon' }
}
