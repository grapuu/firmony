// What every part of the Worker asks of a request: where it runs, who a limit counts, and work that goes on after
// the answer.
import type { Context } from 'hono'
import { BRAND } from './config'

/** A developer's own machine, where http and any host are fine. */
export function isLocal(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]' || hostname.endsWith('.localhost') || hostname.endsWith('.test')
}

/** Where links in an email lead: the domain, or the developer's own machine when that is where the request came. */
export function siteOrigin(c: Context): string {
  const url = new URL(c.req.url)
  return isLocal(url.hostname) ? url.origin : BRAND.origin
}

/** Who a limit counts: an IPv6 address by its /64, anything else as it is. */
export function connection(c: Context): string {
  const ip = c.req.header('cf-connecting-ip') ?? 'unknown'
  if (!ip.includes(':')) return ip
  return ip.toLowerCase().split(':').slice(0, 4).join(':')
}

/** Work that goes on after the answer; a failure is logged by its name only. */
export function later(c: Context, work: Promise<unknown>): void {
  const safe = work.catch((err) => console.error('a step after the answer failed', err instanceof Error ? err.name : 'error'))
  try {
    c.executionCtx.waitUntil(safe)
  } catch {
    // No execution context (a test): the work runs on by itself.
  }
}
