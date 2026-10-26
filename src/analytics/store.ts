// The dashboard's reads (26 October 2026): the counters of analytics/schema.ts and what the app records anyway
// (requests, orders, AML decisions, contracts, events, documents, invoices, the assistant's uses), for a period of
// 7, 30 or 90 days that ends today in Bratislava. One D1 batch of reads; every sum is made once here, so the page's
// numbers and the export's agree.
import { DECLARATION_STATE_SQL } from '../app/aml'
import { addDays } from '../app/ending'
import { localDaySql } from '../app/period-schema'
import { accessOpenSql } from '../aml/retention'
import { SRO_PATH } from '../content/sro-calc'
import { SZCO_PATH } from '../content/szco-calc'
import { WAGE_PATH } from '../content/wage-calc'
import { csvCell } from '../team/store'
import { sha256Hex } from '../db'
import { bratislavaDay } from '../time'
import { accuracyOf, comparedOf } from '../team/ai-accuracy'
import { dayStart, monthRange } from '../team/work-pay'
import { INVOICE_PATH, TOOLS_PATH } from '../tools/invoice'
import { BUCKET_COUNT, HAIKU_PRICE, campaignFromSource, costUsd, daysFrom, percentile, type Device, type Period, type Side } from './model'
import { KEY_PAGES } from './record'

type Row = Record<string, unknown>
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0)

export interface Figure {
  total: number
  today: number
  /** One value a day of the period, oldest first. */
  series: number[]
}

export interface Counted {
  key: string
  n: number
}

export interface RouteStat {
  side: Side
  method: string
  route: string
  n: number
  s2: number
  s3: number
  s4: number
  s5: number
  ms: number
  hist: number[]
  p50: number | null
  p95: number | null
}

export interface FeatureStat {
  side: Side
  feature: string
  companies: number
  users: number
  n: number
  series: number[]
}

export type AmlState = 'checked' | 'waiting' | 'missing'

export interface ClientStat {
  id: string
  name: string
  ico: string | null
  plan: string
  accountantId: string | null
  accountant: string | null
  contractAt: number | null
  /** The last request of somebody of the company in its app (seconds), within the 13 months kept. */
  lastActive: number | null
  /** People of the company who used the app in the last 30 days. */
  active30: number
  documents: number
  invoices: number
  assistant: number
  aml: AmlState
}

export const CLIENT_SORTS = ['nazov', 'aktivita', 'pouzivatelia', 'doklady', 'faktury', 'asistent', 'aml'] as const
export type ClientSort = (typeof CLIENT_SORTS)[number]
export function clientSortOf(value: string | undefined): ClientSort {
  return (CLIENT_SORTS as readonly string[]).includes(value ?? '') ? (value as ClientSort) : 'nazov'
}

/** The business events the dashboard counts, by their action in the events table. */
export const EVENT_ACTIONS = [
  'document.booked',
  'document.autobooked',
  'invoice.issued',
  'invoice.pdf',
  'invoice.shared',
  'message.sent',
  'bank.linked',
  'statement.imported',
  'export.downloaded',
] as const
/** Events the invoicing of 26 October 2026 adds; until one is recorded, the page says they are not measured yet. */
export const NEW_EVENTS = ['invoice.pdf', 'invoice.shared'] as const

export const FREE_TOOLS = [
  { path: TOOLS_PATH, label: 'Bezplatné nástroje' },
  { path: INVOICE_PATH, label: 'Faktúra zadarmo' },
  { path: WAGE_PATH, label: 'Mzdová kalkulačka' },
  { path: SZCO_PATH, label: 'Kalkulačka SZČO' },
  { path: SRO_PATH, label: 'Kalkulačka s. r. o.' },
] as const

export interface Dashboard {
  period: Period
  today: string
  from: string
  days: string[]
  month: string
  figures: { visits: Figure; requests: Figure; orders: Figure; contracts: Figure; activeClients: Figure; errors: Figure }
  funnel: { key: 'visits' | 'start' | 'requests' | 'orders' | 'aml' | 'contracts'; n: number }[]
  tools: { path: string; label: string; n: number; series: number[] }[]
  site: {
    visits: number
    pages: Counted[]
    referrers: Counted[]
    referred: number
    campaigns: Counted[]
    devices: { key: Device; n: number }[]
    bots: Counted[]
    botTotal: number
    internal: number
    notFound: number
    keyPages: Counted[]
    errors: Counted[]
  }
  usage: {
    active: Record<Side, { dau: number; wau: number; mau: number }>
    features: FeatureStat[]
  }
  events: Counted[]
  /** Which of NEW_EVENTS has ever been recorded. */
  measured: string[]
  sources: Counted[]
  assistant: { n: number; failed: number }
  routes: RouteStat[]
  clients: ClientStat[]
  ai: {
    month: string
    read: number
    xml: number
    failed: number
    pending: number
    booked: number
    unchanged: number
    autobooked: number
    assistant: number
    assistantFailed: number
    tokens: number
    /** The assistant's tokens on claude-haiku-5-5 at its price (model.ts HAIKU_PRICE), in US dollars. */
    assistantUsd: number
  }
  /** Invoicing for everyone (claude/week, 26 October 2026); null where its schema is not there yet. */
  invoicing: Invoicing | null
}

export interface Invoicing {
  /** Workspaces started (event invoicing.started), by day. */
  started: Figure
  /** The same by the campaign they came from. */
  campaigns: Counted[]
  /** Workspaces open now. */
  open: number
  /** Workspaces that issued an invoice in the last 30 days. */
  active30: number
  /** Sign-ups whose link was not used (kept 8 days at most): a count, never an address. */
  unfinished: number
  /** Workspaces with an IČO, and of them those whose IČO sent a request for accounting after the workspace began. */
  withIco: number
  converted: number
  /** Invoices issued in the period by workspaces and by accounting clients. */
  issuedWorkspaces: number
  issuedClients: number
  paidByHand: number
  pdf: number
  /** Drafts of an invoice from one sentence (event invoice.ai): uses, successful ones, tokens and their price. */
  ai: { uses: number; ok: number; input: number; output: number; usd: number }
}

/** Usage rows (alias u) of the team and of companies that are no sample and not Firmony's own; with `workspaces` false,
 *  of accounting clients alone (an invoicing workspace is no client). */
const usageScope = (invoicing: boolean, workspaces: boolean) =>
  `(u.side = 'team' OR u.company_id NOT IN (SELECT id FROM companies WHERE operator = 1 OR demo = 1${invoicing && !workspaces ? ' OR invoicing_only = 1' : ''}))`

/** Whether invoicing for everyone is in this database (its column and its table): read tolerantly, before the merge. */
export async function hasInvoicing(db: D1Database): Promise<boolean> {
  try {
    await db.batch([db.prepare('SELECT invoicing_only FROM companies LIMIT 0'), db.prepare('SELECT used_at FROM invoicing_signups LIMIT 0')])
    return true
  } catch {
    return false
  }
}
const top = (map: Map<string, number>, limit: number): Counted[] =>
  [...map]
    .map(([key, n]) => ({ key, n }))
    .sort((a, b) => b.n - a.n || a.key.localeCompare(b.key))
    .slice(0, limit)

function figureOf(byDay: Map<string, number>, days: readonly string[], today: string, total?: number): Figure {
  const series = days.map((d) => byDay.get(d) ?? 0)
  return { total: total ?? series.reduce((s, n) => s + n, 0), today: byDay.get(today) ?? 0, series }
}

function routeStatOf(r: Row): RouteStat {
  const hist = Array.from({ length: BUCKET_COUNT }, (_, i) => num(r[`h${i}`]))
  return {
    side: r.side === 'team' ? 'team' : 'client',
    method: String(r.method),
    route: String(r.route),
    n: num(r.n),
    s2: num(r.s2),
    s3: num(r.s3),
    s4: num(r.s4),
    s5: num(r.s5),
    ms: num(r.ms),
    hist,
    p50: percentile(hist, 0.5),
    p95: percentile(hist, 0.95),
  }
}

/** Everything the page shows for a period ending today. `admin` is the administrator asking (for the AI's accuracy). */
export async function dashboardOf(db: D1Database, a: { period: Period; today: string; admin: { id: string } }): Promise<Dashboard> {
  const { period, today } = a
  const from = addDays(today, -(period - 1))
  const days = daysFrom(from, today)
  const fromS = dayStart(from)
  const toS = dayStart(addDays(today, 1))
  const month = today.slice(0, 7)
  const { from: monthS, to: monthE } = monthRange(month)
  const d7 = addDays(today, -6)
  const d30 = addDays(today, -29)
  const actions = EVENT_ACTIONS.map((x) => `'${x}'`).join(', ')
  const histSums = Array.from({ length: BUCKET_COUNT }, (_, i) => `SUM(h${i}) AS h${i}`).join(', ')
  const invoicing = await hasInvoicing(db)
  const OURS = usageScope(invoicing, false)
  const clientCompanies = `c.demo = 0 AND c.operator = 0${invoicing ? ' AND c.invoicing_only = 0' : ''}`
  const notOurs = `c.demo = 0 AND c.operator = 0`
  const results = await db.batch([
    db.prepare('SELECT day, kind, key, n FROM analytics_site WHERE day BETWEEN ?1 AND ?2').bind(from, today),
    db.prepare('SELECT day, SUM(n) AS n, SUM(s5) AS e FROM analytics_routes WHERE day BETWEEN ?1 AND ?2 GROUP BY day').bind(from, today),
    db
      .prepare(`SELECT side, method, route, SUM(n) AS n, SUM(s2) AS s2, SUM(s3) AS s3, SUM(s4) AS s4, SUM(s5) AS s5, SUM(ms) AS ms, ${histSums}
        FROM analytics_routes WHERE day BETWEEN ?1 AND ?2 GROUP BY side, method, route`)
      .bind(from, today),
    db
      .prepare(`SELECT side, feature, COUNT(DISTINCT CASE WHEN company_id <> '' THEN company_id END) AS companies, COUNT(DISTINCT user_id) AS users, SUM(n) AS n
        FROM analytics_usage u WHERE day BETWEEN ?1 AND ?2 AND ${OURS} GROUP BY side, feature`)
      .bind(from, today),
    db.prepare(`SELECT side, feature, day, SUM(n) AS n FROM analytics_usage u WHERE day BETWEEN ?1 AND ?2 AND ${OURS} GROUP BY side, feature, day`).bind(from, today),
    db
      .prepare(`SELECT side, COUNT(DISTINCT CASE WHEN day = ?1 THEN user_id END) AS dau, COUNT(DISTINCT CASE WHEN day >= ?2 THEN user_id END) AS wau,
        COUNT(DISTINCT user_id) AS mau FROM analytics_usage u WHERE day BETWEEN ?3 AND ?1 AND ${OURS} GROUP BY side`)
      .bind(today, d7, d30),
    db.prepare(`SELECT day, COUNT(DISTINCT company_id) AS n FROM analytics_usage u WHERE side = 'client' AND day BETWEEN ?1 AND ?2 AND ${OURS} GROUP BY day`).bind(from, today),
    db.prepare(`SELECT COUNT(DISTINCT company_id) AS n FROM analytics_usage u WHERE side = 'client' AND day BETWEEN ?1 AND ?2 AND ${OURS}`).bind(from, today),
    db.prepare(`SELECT ${localDaySql('created_at')} AS day, COUNT(*) AS n FROM requests WHERE created_at >= ?1 AND created_at < ?2 GROUP BY 1`).bind(fromS, toS),
    db.prepare(`SELECT ${localDaySql('created_at')} AS day, COUNT(*) AS n FROM orders WHERE created_at >= ?1 AND created_at < ?2 GROUP BY 1`).bind(fromS, toS),
    db
      .prepare(`SELECT ${localDaySql('c.contract_at')} AS day, COUNT(*) AS n FROM companies c WHERE c.contract_at >= ?1 AND c.contract_at < ?2 AND ${clientCompanies} GROUP BY 1`)
      .bind(fromS, toS),
    db
      .prepare(`SELECT e.action, COUNT(*) AS n FROM events e LEFT JOIN companies c ON c.id = e.company_id
        WHERE e.action IN (${actions}) AND e.at >= ?1 AND e.at < ?2 AND (e.company_id IS NULL OR (${notOurs})) GROUP BY e.action`)
      .bind(fromS, toS),
    db.prepare(`SELECT ${NEW_EVENTS.map((x) => `EXISTS (SELECT 1 FROM events WHERE action = '${x}') AS "${x}"`).join(', ')}`),
    db
      .prepare(`SELECT d.source AS key, COUNT(*) AS n FROM documents d JOIN companies c ON c.id = d.company_id
        WHERE ${clientCompanies} AND d.created_at >= ?1 AND d.created_at < ?2 GROUP BY d.source`)
      .bind(fromS, toS),
    db
      .prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(a.state = 'failed'), 0) AS failed FROM assistant_uses a JOIN companies c ON c.id = a.company_id
        WHERE c.demo = 0 AND a.created_at >= ?1 AND a.created_at < ?2`)
      .bind(fromS, toS),
    db
      .prepare(`SELECT COALESCE(SUM(d.read_by IS NOT NULL AND d.read_by <> 'xml' AND d.read_by <> 'demo' AND d.read_by NOT LIKE 'person%'), 0) AS read,
          COALESCE(SUM(d.read_by = 'xml'), 0) AS xml, COALESCE(SUM(d.read_by LIKE 'person%'), 0) AS failed, COALESCE(SUM(d.status = 'reading'), 0) AS pending
        FROM documents d JOIN companies c ON c.id = d.company_id WHERE ${clientCompanies} AND d.created_at >= ?1 AND d.created_at < ?2`)
      .bind(monthS, monthE),
    db
      .prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(a.state = 'failed'), 0) AS failed, COALESCE(SUM(a.input_tokens), 0) + COALESCE(SUM(a.output_tokens), 0) AS tokens,
          COALESCE(SUM(CASE WHEN a.model = ?3 THEN a.input_tokens END), 0) AS haiku_in, COALESCE(SUM(CASE WHEN a.model = ?3 THEN a.output_tokens END), 0) AS haiku_out
        FROM assistant_uses a JOIN companies c ON c.id = a.company_id WHERE c.demo = 0 AND a.created_at >= ?1 AND a.created_at < ?2`)
      .bind(monthS, monthE, HAIKU_PRICE.model),
    db.prepare("SELECT COUNT(*) AS n FROM events WHERE action = 'document.autobooked' AND at >= ?1 AND at < ?2").bind(monthS, monthE),
    db
      .prepare(`SELECT c.id, c.name, c.ico, c.plan, c.accountant_id, acc.name AS accountant, c.contract_at,
          (SELECT MAX(u.last_at) FROM analytics_usage u WHERE u.company_id = c.id AND u.side = 'client') AS last_active,
          (SELECT COUNT(DISTINCT u.user_id) FROM analytics_usage u WHERE u.company_id = c.id AND u.side = 'client' AND u.day >= ?1) AS active30,
          (SELECT COUNT(*) FROM documents d WHERE d.company_id = c.id AND d.deleted_at IS NULL AND d.created_at >= ?2 AND d.created_at < ?3
             AND d.source NOT IN ('issued', 'takings', 'trip', 'takeover')) AS documents,
          (SELECT COUNT(*) FROM invoices i WHERE i.company_id = c.id AND i.number IS NOT NULL AND i.issued_on BETWEEN ?4 AND ?5) AS invoices,
          (SELECT COUNT(*) FROM assistant_uses s WHERE s.company_id = c.id AND s.created_at >= ?2 AND s.created_at < ?3) AS assistant,
          ${DECLARATION_STATE_SQL} AS aml
        FROM companies c LEFT JOIN users acc ON acc.id = c.accountant_id
        WHERE ${accessOpenSql('c', today)} AND ${clientCompanies}
        ORDER BY c.name COLLATE NOCASE LIMIT 2000`)
      .bind(d30, monthS, monthE, `${month}-01`, `${month}-31`),
  ])
  const rows = (i: number) => (results[i]?.results ?? []) as Row[]

  // The site: a visit is a page of the site seen by a person's browser, not signed in, found, and no key page.
  const site = rows(0)
  const visitsByDay = new Map<string, number>()
  const pages = new Map<string, number>()
  const keyPages = new Map<string, number>()
  const referrers = new Map<string, number>()
  const campaigns = new Map<string, number>()
  const devices = new Map<string, number>()
  const bots = new Map<string, number>()
  const errors = new Map<string, number>()
  const errorsByDay = new Map<string, number>()
  const pathByDay = new Map<string, Map<string, number>>()
  let internal = 0
  let notFound = 0
  const add = (map: Map<string, number>, key: string, n: number) => map.set(key, (map.get(key) ?? 0) + n)
  for (const r of site) {
    const day = String(r.day)
    const key = String(r.key)
    const n = num(r.n)
    switch (r.kind) {
      case 'path':
        if (key === '(404)') notFound += n
        else if (KEY_PAGES.test(key)) add(keyPages, key, n)
        else {
          add(pages, key, n)
          let byDay = pathByDay.get(key)
          if (!byDay) pathByDay.set(key, (byDay = new Map()))
          add(byDay, day, n)
        }
        break
      case 'device':
        add(devices, key, n)
        add(visitsByDay, day, n)
        break
      case 'referrer':
        add(referrers, key, n)
        break
      case 'campaign':
        add(campaigns, key, n)
        break
      case 'bot':
        add(bots, key, n)
        break
      case 'internal':
        internal += n
        break
      case 'error':
        add(errors, key, n)
        add(errorsByDay, day, n)
        break
    }
  }
  const visits = [...devices.values()].reduce((s, n) => s + n, 0)

  // The app's failures: the routes' 5xx and the site's own.
  for (const r of rows(1)) add(errorsByDay, String(r.day), num(r.e))

  const byDay = (i: number) => new Map(rows(i).map((r) => [String(r.day), num(r.n)]))
  const requests = figureOf(byDay(8), days, today)
  const orders = figureOf(byDay(9), days, today)
  const contracts = figureOf(byDay(10), days, today)
  const activeClients = figureOf(byDay(6), days, today, num(rows(7)[0]?.n))

  let aml = 0
  try {
    // AML admission (schema 73): an order whose dossier the designated person approved within the period.
    const row = await db
      .prepare(`SELECT COUNT(DISTINCT d.order_id) AS n FROM aml_decisions x JOIN aml_dossiers d ON d.id = x.dossier_id
        WHERE x.decision = 'approved' AND d.order_id IS NOT NULL AND x.decided_at >= ?1 AND x.decided_at < ?2`)
      .bind(fromS, toS)
      .first<{ n: number }>()
    aml = num(row?.n)
  } catch (err) {
    console.error('aml admissions not read', err instanceof Error ? err.name : 'error')
  }

  const features = new Map<string, FeatureStat>()
  for (const r of rows(3)) {
    const side: Side = r.side === 'team' ? 'team' : 'client'
    features.set(`${side}:${String(r.feature)}`, { side, feature: String(r.feature), companies: num(r.companies), users: num(r.users), n: num(r.n), series: days.map(() => 0) })
  }
  const dayIndex = new Map(days.map((d, i) => [d, i]))
  for (const r of rows(4)) {
    const f = features.get(`${r.side === 'team' ? 'team' : 'client'}:${String(r.feature)}`)
    const i = dayIndex.get(String(r.day))
    if (f && i !== undefined) f.series[i] = num(r.n)
  }
  const active: Record<Side, { dau: number; wau: number; mau: number }> = { client: { dau: 0, wau: 0, mau: 0 }, team: { dau: 0, wau: 0, mau: 0 } }
  for (const r of rows(5)) active[r.side === 'team' ? 'team' : 'client'] = { dau: num(r.dau), wau: num(r.wau), mau: num(r.mau) }

  const eventCounts = new Map(rows(11).map((r) => [String(r.action), num(r.n)]))
  const measuredRow = rows(12)[0] ?? {}
  const assistant = rows(14)[0] ?? {}
  const ai = rows(15)[0] ?? {}
  const aiAssistant = rows(16)[0] ?? {}

  let booked = 0
  let unchanged = 0
  try {
    const accuracy = accuracyOf(await comparedOf(db, { id: a.admin.id, team: 'admin' }, month, false))
    const read = accuracy.bySource.find((s) => s.source === 'ai')
    booked = read?.documents ?? 0
    unchanged = read?.unchanged ?? 0
  } catch (err) {
    console.error('ai accuracy not read', err instanceof Error ? err.name : 'error')
  }

  return {
    period,
    today,
    from,
    days,
    month,
    figures: {
      visits: figureOf(visitsByDay, days, today),
      requests,
      orders,
      contracts,
      activeClients,
      errors: figureOf(errorsByDay, days, today),
    },
    funnel: [
      { key: 'visits', n: visits },
      { key: 'start', n: pages.get('/zacat') ?? 0 },
      { key: 'requests', n: requests.total },
      { key: 'orders', n: orders.total },
      { key: 'aml', n: aml },
      { key: 'contracts', n: contracts.total },
    ],
    tools: FREE_TOOLS.map((t) => ({ ...t, n: pages.get(t.path) ?? 0, series: days.map((d) => pathByDay.get(t.path)?.get(d) ?? 0) })),
    site: {
      visits,
      pages: top(pages, 15),
      referrers: top(referrers, 10),
      referred: [...referrers.values()].reduce((s, n) => s + n, 0),
      campaigns: top(campaigns, 10),
      devices: (['computer', 'phone', 'tablet'] as const).map((key) => ({ key, n: devices.get(key) ?? 0 })),
      bots: top(bots, 20),
      botTotal: [...bots.values()].reduce((s, n) => s + n, 0),
      internal,
      notFound,
      keyPages: top(keyPages, 5),
      errors: top(errors, 10),
    },
    usage: {
      active,
      features: [...features.values()].sort((x, y) => (x.side === y.side ? y.companies - x.companies || y.users - x.users || y.n - x.n : x.side === 'client' ? -1 : 1)),
    },
    events: EVENT_ACTIONS.map((key) => ({ key, n: eventCounts.get(key) ?? 0 })),
    measured: NEW_EVENTS.filter((x) => num(measuredRow[x]) === 1),
    sources: rows(13)
      .map((r) => ({ key: String(r.key ?? ''), n: num(r.n) }))
      .sort((x, y) => y.n - x.n),
    assistant: { n: num(assistant.n), failed: num(assistant.failed) },
    routes: rows(2).map(routeStatOf),
    clients: rows(18).map((r) => ({
      id: String(r.id),
      name: String(r.name ?? ''),
      ico: r.ico ? String(r.ico) : null,
      plan: String(r.plan ?? ''),
      accountantId: r.accountant_id ? String(r.accountant_id) : null,
      accountant: r.accountant ? String(r.accountant) : null,
      contractAt: typeof r.contract_at === 'number' ? r.contract_at : null,
      lastActive: typeof r.last_active === 'number' ? r.last_active : null,
      active30: num(r.active30),
      documents: num(r.documents),
      invoices: num(r.invoices),
      assistant: num(r.assistant),
      aml: r.aml === 'checked' ? 'checked' : r.aml === 'waiting' ? 'waiting' : 'missing',
    })),
    ai: {
      month,
      read: num(ai.read),
      xml: num(ai.xml),
      failed: num(ai.failed),
      pending: num(ai.pending),
      booked,
      unchanged,
      autobooked: num(rows(17)[0]?.n),
      assistant: num(aiAssistant.n),
      assistantFailed: num(aiAssistant.failed),
      tokens: num(aiAssistant.tokens),
      assistantUsd: costUsd(num(aiAssistant.haiku_in), num(aiAssistant.haiku_out)),
    },
    invoicing: invoicing ? await invoicingOf(db, { days, today, fromS, toS }) : null,
  }
}

/** Invoicing for everyone in the period: workspaces, their invoices, the AI's drafts, and who asked for accounting.
 *  Counts only: no invoice, customer, sentence or address is read. */
async function invoicingOf(db: D1Database, p: { days: string[]; today: string; fromS: number; toS: number }): Promise<Invoicing | null> {
  try {
    const since30 = dayStart(addDays(p.today, -29))
    const notOurs = 'c.demo = 0 AND c.operator = 0'
    const [started, sources, totals, active, unfinished, issued, actions, ai] = await db.batch([
      db.prepare(`SELECT ${localDaySql('at')} AS day, COUNT(*) AS n FROM events WHERE action = 'invoicing.started' AND at >= ?1 AND at < ?2 GROUP BY 1`).bind(p.fromS, p.toS),
      db.prepare("SELECT detail FROM events WHERE action = 'invoicing.started' AND at >= ?1 AND at < ?2 LIMIT 5000").bind(p.fromS, p.toS),
      db.prepare(`SELECT COALESCE(SUM(c.closed_at IS NULL), 0) AS open, COALESCE(SUM(c.ico IS NOT NULL AND c.ico <> ''), 0) AS with_ico,
          COALESCE(SUM(c.ico IS NOT NULL AND c.ico <> '' AND EXISTS (SELECT 1 FROM requests r WHERE r.ico = c.ico AND r.created_at > c.created_at)), 0) AS converted
        FROM companies c WHERE c.invoicing_only = 1`),
      db
        .prepare(`SELECT COUNT(DISTINCT e.company_id) AS n FROM events e JOIN companies c ON c.id = e.company_id
          WHERE e.action = 'invoice.issued' AND e.at >= ?1 AND c.invoicing_only = 1`)
        .bind(since30),
      db.prepare('SELECT COUNT(*) AS n FROM invoicing_signups WHERE used_at IS NULL'),
      db
        .prepare(`SELECT c.invoicing_only AS workspace, COUNT(*) AS n FROM events e JOIN companies c ON c.id = e.company_id
          WHERE e.action = 'invoice.issued' AND e.at >= ?1 AND e.at < ?2 AND ${notOurs} GROUP BY 1`)
        .bind(p.fromS, p.toS),
      db
        .prepare(`SELECT e.action, COUNT(*) AS n FROM events e LEFT JOIN companies c ON c.id = e.company_id
          WHERE e.action IN ('invoice.paid.hand', 'invoice.pdf') AND e.at >= ?1 AND e.at < ?2 AND (e.company_id IS NULL OR (${notOurs})) GROUP BY e.action`)
        .bind(p.fromS, p.toS),
      db
        .prepare(`SELECT COUNT(*) AS uses,
            COALESCE(SUM(CASE WHEN json_valid(detail) AND json_extract(detail, '$.ok') IN (1, 'true') THEN 1 ELSE 0 END), 0) AS ok,
            COALESCE(SUM(CASE WHEN json_valid(detail) THEN json_extract(detail, '$.in') END), 0) AS input,
            COALESCE(SUM(CASE WHEN json_valid(detail) THEN json_extract(detail, '$.out') END), 0) AS output
          FROM events WHERE action = 'invoice.ai' AND at >= ?1 AND at < ?2`)
        .bind(p.fromS, p.toS),
    ])
    const rowsOf = (r: D1Result | undefined) => (r?.results ?? []) as Row[]
    const campaigns = new Map<string, number>()
    for (const r of rowsOf(sources)) {
      let detail: unknown = null
      try {
        detail = JSON.parse(String(r.detail ?? 'null'))
      } catch {}
      const key = campaignFromSource(detail && typeof detail === 'object' ? (detail as Record<string, unknown>).source : null) ?? '(bez kampane)'
      campaigns.set(key, (campaigns.get(key) ?? 0) + 1)
    }
    const t = rowsOf(totals)[0] ?? {}
    const byKind = new Map(rowsOf(issued).map((r) => [num(r.workspace) === 1 ? 'workspace' : 'client', num(r.n)]))
    const byAction = new Map(rowsOf(actions).map((r) => [String(r.action), num(r.n)]))
    const a = rowsOf(ai)[0] ?? {}
    return {
      started: figureOf(new Map(rowsOf(started).map((r) => [String(r.day), num(r.n)])), p.days, p.today),
      campaigns: top(campaigns, 10),
      open: num(t.open),
      active30: num(rowsOf(active)[0]?.n),
      unfinished: num(rowsOf(unfinished)[0]?.n),
      withIco: num(t.with_ico),
      converted: num(t.converted),
      issuedWorkspaces: byKind.get('workspace') ?? 0,
      issuedClients: byKind.get('client') ?? 0,
      paidByHand: byAction.get('invoice.paid.hand') ?? 0,
      pdf: byAction.get('invoice.pdf') ?? 0,
      ai: { uses: num(a.uses), ok: num(a.ok), input: num(a.input), output: num(a.output), usd: costUsd(num(a.input), num(a.output)) },
    }
  } catch (err) {
    console.error('invoicing not read', err instanceof Error ? err.name : 'error')
    return null
  }
}

const AML_ORDER: Record<AmlState, number> = { missing: 0, waiting: 1, checked: 2 }

/** The clients' table in the order asked: by name, else the largest first (the name breaks ties). */
export function sortClients(clients: readonly ClientStat[], sort: ClientSort): ClientStat[] {
  const byName = (x: ClientStat, y: ClientStat) => x.name.localeCompare(y.name, 'sk')
  const key: Record<ClientSort, (c: ClientStat) => number> = {
    nazov: () => 0,
    aktivita: (c) => c.lastActive ?? -1,
    pouzivatelia: (c) => c.active30,
    doklady: (c) => c.documents,
    faktury: (c) => c.invoices,
    asistent: (c) => c.assistant,
    // The ones that need a look first.
    aml: (c) => -AML_ORDER[c.aml],
  }
  return [...clients].sort((x, y) => key[sort](y) - key[sort](x) || byName(x, y))
}

/** The slowest routes by p95 (at least `min` requests), then the routes that failed, most failures first. */
export function speedOf(routes: readonly RouteStat[], min = 3): { slow: RouteStat[]; failing: RouteStat[] } {
  const slow = routes
    .filter((r) => r.n >= min && r.p95 !== null)
    .sort((x, y) => (y.p95 ?? 0) - (x.p95 ?? 0) || y.n - x.n)
    .slice(0, 12)
  const failing = routes
    .filter((r) => r.s5 > 0 || r.s4 > 0)
    .sort((x, y) => y.s5 - x.s5 || y.s4 - x.s4 || y.n - x.n)
    .slice(0, 12)
  return { slow, failing }
}

// ---------------------------------------------------------------------------------------------------------------
// The export for an analysis: aggregates of the period and the clients' table, nobody's e-mail or name
// ---------------------------------------------------------------------------------------------------------------

/** A person's id as the export gives it: a one-way fingerprint, the same in every export, never the id itself. */
export async function personHash(id: string): Promise<string> {
  return (await sha256Hex(`firmony-analytics:${id}`)).slice(0, 16)
}

export interface Export {
  format: 'firmony-analytics/1'
  generatedAt: string
  period: { days: Period; from: string; to: string }
  notes: string[]
  summary: Record<string, number>
  funnel: { step: string; n: number }[]
  site: { day: string; kind: string; key: string; n: number }[]
  routes: { day: string; side: string; method: string; route: string; n: number; s2: number; s3: number; s4: number; s5: number; msSum: number; histogram: number[]; p50: number | null; p95: number | null }[]
  usage: { day: string; side: string; kind: string; company: string | null; user: string; feature: string; n: number }[]
  events: { day: string; action: string; n: number }[]
  clients: {
    id: string
    name: string
    ico: string | null
    plan: string
    accountant: string | null
    contractDay: string | null
    lastActiveDay: string | null
    activeUsers30: number
    documentsThisMonth: number
    invoicesThisMonth: number
    assistantThisMonth: number
    aml: AmlState
  }[]
  ai: Dashboard['ai']
  invoicing: Omit<Invoicing, 'started'> & { started: number; startedByDay: { day: string; n: number }[] } | null
}

export const EXPORT_NOTES = [
  'Daily sums measured by Firmony itself (first-party), days in Europe/Bratislava.',
  'site: page views of the public site by kind: path (tokens and ids replaced), device, referrer (domain only), campaign (utm tags and ref), bot (family), internal (signed-in browsers), error (5xx by path). A visit is a device row.',
  'routes: requests of the client app (/app) and the team side (/ucto) by matched route; s2 to s5 are status classes, msSum the sum of server time in ms as the Worker clock sees it (waiting for D1 included, pure computation between waits not); histogram buckets end at 25, 50, 100, 200, 400, 800, 1600, 3200 ms and above.',
  'usage: which part of the app a person used on a day; user is a one-way fingerprint, company the company id (empty for the team side), kind client, workspace (invoicing for everyone, no accounting) or team.',
  'invoicing: workspaces of invoicing for everyone started, open, active (an invoice issued in the last 30 days), unfinished sign-ups (count only), invoices issued by workspaces and by clients, paid by hand, PDF downloads, AI drafts from one sentence with tokens and their estimated price at claude-haiku-5-5 ($0.10 input and $0.50 output per million tokens, read 2026-10-26 at https://platform.claude.com/docs/en/about-claude/pricing), and workspaces whose IČO later asked for accounting. Null where the invoicing schema is not deployed.',
  'clients: client companies (not demo, not Firmony itself); accountant is a fingerprint, no e-mail, birth number, document number or natural person is named.',
]

export async function exportOf(db: D1Database, dash: Dashboard, generatedAt: number): Promise<Export> {
  const fromS = dayStart(dash.from)
  const toS = dayStart(addDays(dash.today, 1))
  const actions = EVENT_ACTIONS.map((x) => `'${x}'`).join(', ')
  const invoicing = await hasInvoicing(db)
  const kind = invoicing
    ? "CASE WHEN u.side = 'team' THEN 'team' WHEN EXISTS (SELECT 1 FROM companies w WHERE w.id = u.company_id AND w.invoicing_only = 1) THEN 'workspace' ELSE 'client' END"
    : "CASE WHEN u.side = 'team' THEN 'team' ELSE 'client' END"
  const [site, routes, usage, events] = await db.batch([
    db.prepare('SELECT day, kind, key, n FROM analytics_site WHERE day BETWEEN ?1 AND ?2 ORDER BY day, kind, key').bind(dash.from, dash.today),
    db.prepare('SELECT * FROM analytics_routes WHERE day BETWEEN ?1 AND ?2 ORDER BY day, side, method, route').bind(dash.from, dash.today),
    db
      .prepare(`SELECT day, side, ${kind} AS kind, company_id, user_id, feature, n FROM analytics_usage u WHERE day BETWEEN ?1 AND ?2 AND ${usageScope(invoicing, true)}
        ORDER BY day, side, company_id, user_id, feature`)
      .bind(dash.from, dash.today),
    db
      .prepare(`SELECT ${localDaySql('at')} AS day, action, COUNT(*) AS n FROM events WHERE action IN (${actions}) AND at >= ?1 AND at < ?2 GROUP BY 1, 2 ORDER BY 1, 2`)
      .bind(fromS, toS),
  ])
  const hashes = new Map<string, string>()
  const hashOf = async (id: string) => {
    let h = hashes.get(id)
    if (!h) hashes.set(id, (h = await personHash(id)))
    return h
  }
  const usageRows: Export['usage'] = []
  for (const r of (usage?.results ?? []) as Row[]) {
    usageRows.push({ day: String(r.day), side: String(r.side), kind: String(r.kind), company: r.company_id ? String(r.company_id) : null, user: await hashOf(String(r.user_id)), feature: String(r.feature), n: num(r.n) })
  }
  const clients: Export['clients'] = []
  for (const c of dash.clients) {
    clients.push({
      id: c.id,
      name: c.name,
      ico: c.ico,
      plan: c.plan,
      accountant: c.accountantId ? await hashOf(c.accountantId) : null,
      contractDay: c.contractAt === null ? null : bratislavaDay(c.contractAt),
      lastActiveDay: c.lastActive === null ? null : bratislavaDay(c.lastActive),
      activeUsers30: c.active30,
      documentsThisMonth: c.documents,
      invoicesThisMonth: c.invoices,
      assistantThisMonth: c.assistant,
      aml: c.aml,
    })
  }
  const f = dash.figures
  return {
    format: 'firmony-analytics/1',
    generatedAt: new Date(generatedAt * 1000).toISOString(),
    period: { days: dash.period, from: dash.from, to: dash.today },
    notes: EXPORT_NOTES,
    summary: {
      visits: f.visits.total,
      requests: f.requests.total,
      orders: f.orders.total,
      contracts: f.contracts.total,
      activeClientCompanies: f.activeClients.total,
      serverErrors: f.errors.total,
      bots: dash.site.botTotal,
      signedInSiteViews: dash.site.internal,
      notFound: dash.site.notFound,
      assistantQuestions: dash.assistant.n,
      assistantFailed: dash.assistant.failed,
    },
    funnel: dash.funnel.map((s) => ({ step: s.key, n: s.n })),
    site: ((site?.results ?? []) as Row[]).map((r) => ({ day: String(r.day), kind: String(r.kind), key: String(r.key), n: num(r.n) })),
    routes: ((routes?.results ?? []) as Row[]).map((r) => {
      const s = routeStatOf(r)
      return { day: String(r.day), side: s.side, method: s.method, route: s.route, n: s.n, s2: s.s2, s3: s.s3, s4: s.s4, s5: s.s5, msSum: s.ms, histogram: s.hist, p50: s.p50 === null ? null : Math.round(s.p50), p95: s.p95 === null ? null : Math.round(s.p95) }
    }),
    usage: usageRows,
    events: ((events?.results ?? []) as Row[]).map((r) => ({ day: String(r.day), action: String(r.action), n: num(r.n) })),
    clients,
    ai: dash.ai,
    invoicing: dash.invoicing
      ? { ...dash.invoicing, started: dash.invoicing.started.total, startedByDay: dash.days.map((day, i) => ({ day, n: dash.invoicing?.started.series[i] ?? 0 })) }
      : null,
  }
}

/** The same in one long table for Slovak Excel (and any tool): section, day, dimension, key, metric, value. */
export function exportCsv(e: Export): string {
  const rows: (string | number | null)[][] = [['section', 'day', 'dimension', 'key', 'metric', 'value']]
  rows.push(['period', '', '', '', 'days', e.period.days], ['period', '', '', '', 'from', e.period.from], ['period', '', '', '', 'to', e.period.to])
  for (const [metric, value] of Object.entries(e.summary)) rows.push(['summary', '', '', '', metric, value])
  for (const s of e.funnel) rows.push(['funnel', '', '', s.step, 'n', s.n])
  for (const s of e.site) rows.push(['site', s.day, s.kind, s.key, 'views', s.n])
  for (const r of e.routes) {
    const dim = `${r.side} ${r.method}`
    rows.push(['routes', r.day, dim, r.route, 'requests', r.n], ['routes', r.day, dim, r.route, 's2', r.s2], ['routes', r.day, dim, r.route, 's3', r.s3])
    rows.push(['routes', r.day, dim, r.route, 's4', r.s4], ['routes', r.day, dim, r.route, 's5', r.s5], ['routes', r.day, dim, r.route, 'ms_sum', r.msSum])
    if (r.p50 !== null) rows.push(['routes', r.day, dim, r.route, 'p50_ms', r.p50])
    if (r.p95 !== null) rows.push(['routes', r.day, dim, r.route, 'p95_ms', r.p95])
  }
  for (const u of e.usage) rows.push(['usage', u.day, `${u.kind} ${u.company ?? ''} ${u.user}`.replace(/\s+/g, ' ').trim(), u.feature, 'requests', u.n])
  for (const v of e.events) rows.push(['events', v.day, '', v.action, 'n', v.n])
  for (const c of e.clients) {
    for (const [metric, value] of Object.entries(c)) if (metric !== 'id') rows.push(['clients', '', c.id, '', metric, value as string | number | null])
  }
  for (const [metric, value] of Object.entries(e.ai)) rows.push(['ai', '', '', '', metric, value as string | number])
  if (e.invoicing) {
    const { campaigns, startedByDay, ai, ...counts } = e.invoicing
    for (const [metric, value] of Object.entries(counts)) rows.push(['invoicing', '', '', '', metric, value])
    for (const [metric, value] of Object.entries(ai)) rows.push(['invoicing', '', 'ai', '', metric, value])
    for (const c of campaigns) rows.push(['invoicing', '', 'campaign', c.key, 'started', c.n])
    for (const d of startedByDay) rows.push(['invoicing', d.day, '', '', 'started', d.n])
  }
  return `\uFEFF${rows.map((r) => r.map((cell) => csvCell(cell)).join(';')).join('\r\n')}\r\n`
}
