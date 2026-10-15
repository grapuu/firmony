import { BRAND } from '../config'
import { isLocal } from '../http'
import type { Who } from '../app/store'

export interface SecurityBindings {
  /** Explicit, one-time initial provisioning. No public mailbox is promoted without all three settings. */
  TEAM_BOOTSTRAP_EMAIL?: string
  TEAM_BOOTSTRAP_TOKEN?: string
  TEAM_BOOTSTRAP_EXPIRES_AT?: string
  DEMO?: string
}
export const SECURITY = {
  challengeSeconds: 300,
  teamSeconds: 12 * 3600,
  sensitiveSeconds: 300,
  grantSeconds: 86400,
  requestsPerTenMinutes: 20,
} as const
export const AUTH_TOKEN = /^[A-Za-z0-9_-]{43}$/

export function safeNext(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.length > 1200) return '/app'
  try {
    const u = new URL(value, BRAND.origin)
    if (u.origin !== new URL(BRAND.origin).origin || !/^\/(?:app|ucto)(?:\/|$)/.test(u.pathname)) return '/app'
    return `${u.pathname}${u.search}${u.hash}`
  } catch {
    return '/app'
  }
}
export function relyingParty(url: string, env: SecurityBindings): { origin: string; rpID: string } | null {
  const u = new URL(url)
  const canonical = new URL(BRAND.origin)
  if (u.origin === canonical.origin && u.protocol === 'https:') return { origin: canonical.origin, rpID: canonical.hostname }
  if (env.DEMO === '1' && isLocal(u.hostname)) return { origin: u.origin, rpID: u.hostname }
  return null
}
export function bootstrapReady(env: SecurityBindings, at: number): boolean {
  return (
    typeof env.TEAM_BOOTSTRAP_EMAIL === 'string' &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env.TEAM_BOOTSTRAP_EMAIL) &&
    AUTH_TOKEN.test(env.TEAM_BOOTSTRAP_TOKEN ?? '') &&
    Number.isSafeInteger(Number(env.TEAM_BOOTSTRAP_EXPIRES_AT)) &&
    Number(env.TEAM_BOOTSTRAP_EXPIRES_AT) > at
  )
}
export function verifiedRecently(who: Who, at: number, seconds = SECURITY.teamSeconds): boolean {
  return Boolean(who.verifiedCredential && who.verifiedAt !== null && who.verifiedAt <= at && who.verifiedAt > at - seconds)
}
/** Authentication freshness, separate from the route's company/role authorization. */
export function sensitivePath(path: string, method: string): boolean {
  if (/^\/app\/export(?:\/potvrdit)?$/.test(path)) return true
  if (
    path.startsWith('/ucto/') &&
    (method === 'GET' || method === 'HEAD') &&
    (/\/(?:export|paska)$/.test(path) || /\.(?:csv|xml)$/.test(path) || /\/(?:plna-moc|odovzdanie)\/[^/]+$/.test(path))
  )
    return true
  if (method !== 'GET' && method !== 'HEAD' && (path === '/ucto/tim' || /\/(?:posudenie|uvolnit|schvalit-uvolnenie|uzavriet)$/.test(path))) return true
  return false
}
