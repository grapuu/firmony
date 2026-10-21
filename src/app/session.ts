import { accessOpenSql } from '../aml/retention'
// Signing in without a password: a link to the address we know, valid for twenty minutes (a welcome link for a few
// days) and for one use, and then a cookie for thirty days. The database keeps only hashes of both, so neither can
// be read back out of it. A session is a user's, and is in one of their companies at a time; somebody of the team
// alone has a session in no company.
import type { Context } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { APP } from '../config'
import { now, sha256Hex } from '../db'
import { eventStatement, firstCompanyOf, userById, whoBySession, type Who } from './store'

/** On https the cookie's name binds it to this host and to https alone (the __Host- prefix). */
export function cookieName(c: Context): string {
  return new URL(c.req.url).protocol === 'https:' ? '__Host-firmony' : 'firmony'
}

/** A random token of 32 bytes, written for an address or a cookie. */
export function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const TOKEN = /^[A-Za-z0-9_-]{43}$/

export async function currentWho(c: Context, db: D1Database): Promise<Who | null> {
  const token = getCookie(c, cookieName(c))
  if (!token || !TOKEN.test(token)) return null
  return whoBySession(db, await sha256Hex(token))
}

/** A link for signing in: written down as a hash, handed back as the token for the email. */
export async function newLink(db: D1Database, user: string, minutes: number = APP.linkMinutes): Promise<{ token: string; statement: D1PreparedStatement }> {
  const token = newToken()
  const ts = now()
  return {
    token,
    statement: db.prepare('INSERT INTO login_links (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').bind(await sha256Hex(token), user, ts, ts + minutes * 60),
  }
}

/** Uses a link once: the user it was for, or null when it is unknown, used or too old. */
export async function useLink(db: D1Database, token: string): Promise<string | null> {
  if (!TOKEN.test(token)) return null
  const row = await db
    .prepare('UPDATE login_links SET used_at = ?1 WHERE id = ?2 AND used_at IS NULL AND expires_at > ?1 RETURNING user_id')
    .bind(now(), await sha256Hex(token))
    .first<{ user_id: string }>()
  return row?.user_id ?? null
}

/** Whether a link can still be used, without using it (the page that asks for the click). */
export async function linkUsable(db: D1Database, token: string): Promise<boolean> {
  if (!TOKEN.test(token)) return false
  const row = await db.prepare('SELECT 1 AS ok FROM login_links WHERE id = ? AND used_at IS NULL AND expires_at > ?').bind(await sha256Hex(token), now()).first()
  return Boolean(row)
}

/**
 * Signs a browser in and sets its cookie: in the company given, or the user's first one, or in none for somebody of
 * the team. Where it leads afterwards, or null when the user has nowhere to go (no company and no team).
 */
export async function startSession(c: Context, db: D1Database, userId: string, company?: string): Promise<string | null> {
  const user = await userById(db, userId)
  if (!user) return null
  const companyId = company ?? (await firstCompanyOf(db, userId))
  if (!companyId && !user.team) return null
  const token = newToken()
  const ts = now()
  await db.batch([
    db.prepare('INSERT INTO sessions (id, user_id, company_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?)').bind(await sha256Hex(token), userId, companyId, ts, ts + APP.sessionDays * 86400),
    eventStatement(db, { company: companyId, user: userId, action: 'signed.in' }),
  ])
  const secure = new URL(c.req.url).protocol === 'https:'
  setCookie(c, cookieName(c), token, { path: '/', httpOnly: true, secure, sameSite: 'Lax', maxAge: APP.sessionDays * 86400 })
  return companyId ? '/app' : '/ucto'
}

/** Moves a session to another company of the same user; nothing happens unless the user is its member. */
export function switchStatement(db: D1Database, session: string, user: string, company: string): D1PreparedStatement {
  return db
    .prepare(`UPDATE sessions SET company_id = ?1 WHERE id = ?2 AND user_id = ?3 AND EXISTS (SELECT 1 FROM members m JOIN companies c ON c.id = m.company_id AND ${accessOpenSql('c')} WHERE m.user_id = ?3 AND m.company_id = ?1)`)
    .bind(company, session, user)
}

export async function endSession(c: Context, db: D1Database): Promise<void> {
  const token = getCookie(c, cookieName(c))
  if (token && TOKEN.test(token)) await db.prepare('DELETE FROM sessions WHERE id = ?').bind(await sha256Hex(token)).run()
  deleteCookie(c, cookieName(c), { path: '/', secure: new URL(c.req.url).protocol === 'https:' })
}
