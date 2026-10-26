// What one request adds to the counters (26 October 2026). Called once by the Worker's first middleware after the
// answer is made: the work is a single D1 batch put after the answer (`later`, waitUntil), so a page never waits for
// it, and nothing here may throw into the page. A failure is logged by its name and the request is simply not counted.
import type { Context } from 'hono'
import { routePath } from 'hono/route'
import { ensureSchema, now } from '../db'
import { later } from '../http'
import { bratislavaDay } from '../time'
import { BUCKET_COUNT, botOf, bucketOf, campaignOf, deviceOf, featureOf, normalisePath, referrerOf, routeKey, sideOf, type Side } from './model'

/** Who the app's middleware found (app/routes.tsx and team/routes.tsx set it), as far as the counters need it. */
interface Signed {
  user?: { id?: unknown; team?: unknown }
  company?: { id?: unknown; demo?: unknown } | null
}

/** The session cookie of the app: a visit of the site with it is ours or a client's, not a prospect's. */
const SESSION_COOKIE = /(?:^|;\s*)__Host-firmony=/

/** Pages reached by a key in their address (model.ts `normalisePath`): counted by their path alone. */
export const KEY_PAGES = /^\/(?:f|objednavka)\/:token(?:\/|$)/

const ROUTE_UPSERT = `INSERT INTO analytics_routes (day, side, method, route, n, s2, s3, s4, s5, ms, ${Array.from({ length: BUCKET_COUNT }, (_, i) => `h${i}`).join(', ')})
  VALUES (?1, ?2, ?3, ?4, 1, ?5, ?6, ?7, ?8, ?9, ${Array.from({ length: BUCKET_COUNT }, (_, i) => `?${10 + i}`).join(', ')})
  ON CONFLICT (day, side, method, route) DO UPDATE SET n = n + 1, s2 = s2 + excluded.s2, s3 = s3 + excluded.s3, s4 = s4 + excluded.s4,
    s5 = s5 + excluded.s5, ms = ms + excluded.ms, ${Array.from({ length: BUCKET_COUNT }, (_, i) => `h${i} = h${i} + excluded.h${i}`).join(', ')}`

const USAGE_UPSERT = `INSERT INTO analytics_usage (day, user_id, company_id, side, feature, n, last_at) VALUES (?1, ?2, ?3, ?4, ?5, 1, ?6)
  ON CONFLICT (day, user_id, company_id, side, feature) DO UPDATE SET n = n + 1, last_at = MAX(last_at, excluded.last_at)`

/** One statement for any number of the site's counters of a day. */
function siteUpsert(db: D1Database, day: string, counters: readonly (readonly [string, string])[]): D1PreparedStatement {
  const values = counters.map((_, i) => `(?1, ?${2 + i * 2}, ?${3 + i * 2}, 1)`).join(', ')
  return db
    .prepare(`INSERT INTO analytics_site (day, kind, key, n) VALUES ${values} ON CONFLICT (day, kind, key) DO UPDATE SET n = n + 1`)
    .bind(day, ...counters.flatMap(([kind, key]) => [kind, key]))
}

async function write(db: D1Database, make: () => D1PreparedStatement[]): Promise<void> {
  await ensureSchema(db)
  const statements = make()
  if (statements.length > 0) await db.batch(statements)
}

/** The statements a request of the app makes: its route's counters and, for a signed-in person, the feature used. */
export function appStatements(
  db: D1Database,
  r: { day: string; side: Side; method: string; route: string; status: number; ms: number; at: number; who: Signed | undefined },
): D1PreparedStatement[] {
  const hist = Array.from({ length: BUCKET_COUNT }, () => 0)
  hist[bucketOf(r.ms)] = 1
  const cls = Math.floor(r.status / 100)
  const out = [
    db
      .prepare(ROUTE_UPSERT)
      .bind(r.day, r.side, r.method, r.route, cls <= 2 ? 1 : 0, cls === 3 ? 1 : 0, cls === 4 ? 1 : 0, cls >= 5 ? 1 : 0, Math.max(0, Math.round(r.ms)), ...hist),
  ]
  const user = typeof r.who?.user?.id === 'string' ? r.who.user.id : null
  const company = r.side === 'client' && typeof r.who?.company?.id === 'string' ? r.who.company.id : ''
  const demo = Boolean(r.who?.company?.demo)
  const feature = featureOf(r.side, r.route)
  // A person counts on the client's side only within a company of theirs, on the team's only as a member of the team.
  const counts = user && feature && !demo && (r.side === 'client' ? company !== '' : typeof r.who?.user?.team === 'string')
  if (counts) out.push(db.prepare(USAGE_UPSERT).bind(r.day, user, company, r.side, feature, r.at))
  return out
}

/** The counters a request of the public site adds: a page view, a robot, a signed-in person, a page not found or a
 * failure; empty when it is none of them (a form sent well, a file, a redirect). */
export function siteCounters(r: { method: string; status: number; contentType: string; url: URL; userAgent: string; referer: string | undefined; cookie: string; purpose: string }): [string, string][] {
  // A failure of the site's own (a form that could not be taken, a page that broke) is counted whoever asked.
  if (r.status >= 500) return [['error', normalisePath(r.url.pathname)]]
  if (r.method !== 'GET' || !/^text\/html/i.test(r.contentType) || (r.status !== 200 && r.status !== 404)) return []
  if (/prefetch|prerender/i.test(r.purpose)) return []
  const bot = botOf(r.userAgent)
  if (bot) return [['bot', bot]]
  if (SESSION_COOKIE.test(r.cookie)) return [['internal', 'signed-in']]
  if (r.status === 404) return [['path', '(404)']]
  const path = normalisePath(r.url.pathname)
  // A customer opening an invoice and a director opening the link to a contract are no visits of the site.
  if (KEY_PAGES.test(path)) return [['path', path]]
  const counters: [string, string][] = [
    ['path', path],
    ['device', deviceOf(r.userAgent)],
  ]
  const referrer = referrerOf(r.referer, r.url.hostname)
  if (referrer) counters.push(['referrer', referrer])
  const campaign = campaignOf(r.url.searchParams)
  if (campaign) counters.push(['campaign', campaign])
  return counters
}

/** Counts the request that just got its answer. Never throws; the writes go after the answer. */
export function recordRequest(c: Context, db: D1Database | undefined, startedMs: number): void {
  try {
    if (!db) return
    const method = c.req.method
    if (method !== 'GET' && method !== 'POST') return
    const url = new URL(c.req.url)
    const status = c.res.status
    const at = now()
    const day = bratislavaDay(at)
    const side = sideOf(url.pathname)
    if (side) {
      const route = routeKey(routePath(c))
      const ms = Date.now() - startedMs
      const who = (c as unknown as { get(key: string): unknown }).get('who') as Signed | undefined
      later(c, write(db, () => appStatements(db, { day, side, method, route, status, ms, at, who })))
      return
    }
    const counters = siteCounters({
      method,
      status,
      contentType: c.res.headers.get('content-type') ?? '',
      url,
      userAgent: c.req.header('user-agent') ?? '',
      referer: c.req.header('referer'),
      cookie: c.req.header('cookie') ?? '',
      purpose: `${c.req.header('sec-purpose') ?? ''} ${c.req.header('purpose') ?? ''}`,
    })
    if (counters.length > 0) later(c, write(db, () => [siteUpsert(db, day, counters)]))
  } catch (err) {
    console.error('analytics not recorded', err instanceof Error ? err.name : 'error')
  }
}
