// Signing in without a password: a link to the address the company gave us, valid for twenty minutes and for one
// use, and then a cookie for thirty days. The database keeps only hashes of both, so neither can be read back
// out of it.
import type { Context } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { APP } from '../config'
import { now, sha256Hex } from '../db'
import { eventStatement, firstCompanyOf, whoBySession, type Who } from './store'

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
export async function newLink(db: D1Database, user: string): Promise<{ token: string; statement: D1PreparedStatement }> {
  const token = newToken()
  const ts = now()
  return {
    token,
    statement: db.prepare('INSERT INTO login_links (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').bind(await sha256Hex(token), user, ts, ts + APP.linkMinutes * 60),
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

/** Signs a browser in to the user's company and sets its cookie. False when the user has no company. */
export async function startSession(c: Context, db: D1Database, user: string, company?: string): Promise<boolean> {
  const companyId = company ?? (await firstCompanyOf(db, user))
  if (!companyId) return false
  const token = newToken()
  const ts = now()
  await db.batch([
    db.prepare('INSERT INTO sessions (id, user_id, company_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?)').bind(await sha256Hex(token), user, companyId, ts, ts + APP.sessionDays * 86400),
    eventStatement(db, { company: companyId, user, action: 'signed.in' }),
  ])
  const secure = new URL(c.req.url).protocol === 'https:'
  setCookie(c, cookieName(c), token, { path: '/', httpOnly: true, secure, sameSite: 'Lax', maxAge: APP.sessionDays * 86400 })
  return true
}

export async function endSession(c: Context, db: D1Database): Promise<void> {
  const token = getCookie(c, cookieName(c))
  if (token && TOKEN.test(token)) await db.prepare('DELETE FROM sessions WHERE id = ?').bind(await sha256Hex(token)).run()
  deleteCookie(c, cookieName(c), { path: '/', secure: new URL(c.req.url).protocol === 'https:' })
}
