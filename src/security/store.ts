import type { Context } from 'hono'
import { setCookie } from 'hono/cookie'
import { now, sha256Hex } from '../db'
import { cookieName, newToken } from '../app/session'
import type { Who } from '../app/store'
import { AUTH_TOKEN, bootstrapReady, SECURITY, type SecurityBindings } from './policy'

export interface Passkey {
  id: string
  user_id: string
  public_key: string
  counter: number
  name: string
  transports: string
  device_type: string
  backed_up: number
  created_at: number
  last_used_at: number | null
}
export interface Challenge {
  id: string
  session_id: string
  user_id: string
  kind: 'register' | 'authenticate'
  challenge: string
  expires_at: number
  grant_id: string | null
  next_path: string
}
export interface Grant {
  id: string
  user_id: string
  kind: 'enroll' | 'recover'
  source: string
  created_by: string | null
  approved_by: string | null
  approved_at: number | null
  approval_evidence: string | null
  evidence: string | null
  expires_at: number
  used_at: number | null
  revoked_at: number | null
}
export const encode = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
export const decode = (s: string): Uint8Array<ArrayBuffer> => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))
export const passkeysOf = (db: D1Database, user: string) =>
  db
    .prepare('SELECT * FROM passkeys WHERE user_id = ? ORDER BY created_at, id')
    .bind(user)
    .all<Passkey>()
    .then((r) => r.results)

export async function userHandle(db: D1Database, user: string): Promise<string> {
  const row = await db
    .prepare('UPDATE users SET auth_handle = COALESCE(auth_handle, ?) WHERE id = ? RETURNING auth_handle')
    .bind(newToken(), user)
    .first<{ auth_handle: string }>()
  if (!row) throw new Error('Missing account')
  return row.auth_handle
}
export async function grantFor(db: D1Database, env: SecurityBindings, who: Who, code: string): Promise<Grant | null> {
  if (!AUTH_TOKEN.test(code)) return null
  const id = await sha256Hex(code)
  if (
    bootstrapReady(env, now()) &&
    who.user.team === 'admin' &&
    who.user.email.toLowerCase() === env.TEAM_BOOTSTRAP_EMAIL?.toLowerCase() &&
    id === (await sha256Hex(env.TEAM_BOOTSTRAP_TOKEN ?? ''))
  ) {
    await db
      .prepare(
        `INSERT OR IGNORE INTO auth_grants (id, user_id, kind, source, created_at, expires_at)
      SELECT ?1, ?2, 'enroll', 'bootstrap', ?3, ?4
      WHERE NOT EXISTS (SELECT 1 FROM auth_bootstrap) AND NOT EXISTS (SELECT 1 FROM passkeys WHERE user_id = ?2)`,
      )
      .bind(id, who.user.id, now(), Number(env.TEAM_BOOTSTRAP_EXPIRES_AT))
      .run()
  }
  return db
    .prepare(
      `SELECT * FROM auth_grants WHERE id = ? AND user_id = ? AND used_at IS NULL AND revoked_at IS NULL AND expires_at > ?
    AND (kind = 'enroll' OR (approved_by IS NOT NULL AND approved_at IS NOT NULL AND length(approval_evidence) >= 12 AND approved_by <> created_by AND approved_by <> user_id AND created_by <> user_id))`,
    )
    .bind(id, who.user.id, now())
    .first<Grant>()
}

/** Rotate the bearer cookie only after the same transaction has written the verified credential and timestamp. */
export async function rotatedSession(db: D1Database, who: Who) {
  const token = newToken()
  const hash = await sha256Hex(token)
  const row = await db
    .prepare('SELECT expires_at FROM sessions WHERE id = ? AND user_id = ? AND expires_at > ?')
    .bind(who.session, who.user.id, now())
    .first<{ expires_at: number }>()
  if (!row) throw new Error('Expired session')
  return { token, hash, expiresAt: row.expires_at }
}
export function setVerifiedCookie(c: Context, token: string, expiresAt: number): void {
  setCookie(c, cookieName(c), token, {
    path: '/',
    httpOnly: true,
    secure: new URL(c.req.url).protocol === 'https:',
    sameSite: 'Lax',
    maxAge: Math.max(0, expiresAt - now()),
  })
}
export async function consumeChallenge(db: D1Database, id: string, who: Who): Promise<Challenge | null> {
  if (!AUTH_TOKEN.test(id)) return null
  return db
    .prepare(
      `UPDATE auth_challenges SET consumed_at = ? WHERE id = ? AND session_id = ? AND user_id = ? AND consumed_at IS NULL AND expires_at > ? RETURNING *`,
    )
    .bind(now(), id, who.session, who.user.id, now())
    .first<Challenge>()
}
export async function newChallenge(db: D1Database, who: Who, kind: Challenge['kind'], challenge: string, next: string, grant: string | null) {
  const id = newToken()
  await db
    .prepare('INSERT INTO auth_challenges (id, session_id, user_id, kind, challenge, expires_at, grant_id, next_path) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, who.session, who.user.id, kind, challenge, now() + SECURITY.challengeSeconds, grant, next)
    .run()
  return id
}

/** A passkey sign-in's challenge, before anybody is known: its id handed out, its hash kept. */
export async function newSigninChallenge(db: D1Database, challenge: string): Promise<string> {
  const id = newToken()
  const ts = now()
  await db
    .prepare('INSERT INTO signin_challenges (id, challenge, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .bind(await sha256Hex(id), challenge, ts, ts + SECURITY.challengeSeconds)
    .run()
  return id
}

/** Uses a sign-in challenge once: its value, or null when it is unknown, used or too old. */
export async function consumeSigninChallenge(db: D1Database, id: string): Promise<string | null> {
  if (!AUTH_TOKEN.test(id)) return null
  const row = await db
    .prepare('UPDATE signin_challenges SET consumed_at = ?1 WHERE id = ?2 AND consumed_at IS NULL AND expires_at > ?1 RETURNING challenge')
    .bind(now(), await sha256Hex(id))
    .first<{ challenge: string }>()
  return row?.challenge ?? null
}
