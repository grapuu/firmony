// Prehľad (his word of 29 October 2026): the administrator's one page of the whole firm, worked out afresh on every look.
// What is on fire, what came since, how much there is, every client against its plan, and what clients complain about.
// Nothing is stored here; the page asks again every minute and a half (public/inside.js, data-refresh). The check by
// Claude (overview-check.ts) reads a copy of it without names.
import type { Company, User } from '../app/store'
import { failedMail, teamClients, type ClientRow } from './store'
import { teamDeadlines } from './deadlines-store'
import { pressing } from './deadlines'
import { responseDueAt } from './support'
import { billRows, billingDrafts, issuable, PLAN_DOC_SQL, planUsages } from './billing-store'
import type { PlanUsage } from './plan-usage'
import { monthStart, type Tariff } from './billing'

export type Level = 'hori' | 'pozor' | 'info'

export interface Firm {
  id: string
  name: string
}

/** One thing that waits or burns: how many, of whom, and where it is done. */
export interface Alarm {
  key: AlarmKey
  level: Level
  n: number
  firms: Firm[]
  href: string
  /** A day or a time that says how old the oldest one is, in unix seconds. */
  since?: number | null
}

export type AlarmKey =
  | 'deadlinesLate'
  | 'deadlinesWeek'
  | 'messagesLate'
  | 'messages'
  | 'reports'
  | 'mail'
  | 'incidents'
  | 'amlDossiers'
  | 'ordersReview'
  | 'requests'
  | 'foundings'
  | 'billsOverdue'
  | 'billing'
  | 'plans'
  | 'oldDocs'
  | 'reading'
  | 'toCheck'
  | 'poa'
  | 'declaration'
  | 'peppol'
  | 'sanctions'
  | 'notices'
  | 'complaints'
  | 'release'

export type FreshKey = 'leads' | 'requests' | 'orders' | 'contracts' | 'foundings' | 'documents' | 'messages' | 'invoices' | 'workspaces' | 'mony' | 'investors'
export type VolumeKey = 'clients' | 'ending' | 'workspaces' | 'documents' | 'documentsMonth' | 'payments' | 'invoices' | 'messages' | 'employees' | 'people' | 'leads' | 'requests'

export interface UsageRow {
  company: Company
  usage: PlanUsage
  corrupt: boolean
  tariff: Tariff['source'] | 'corrupt'
}

export interface Complaint {
  firm: Firm
  n: number
  last: number
}

export interface Overview {
  at: number
  today: string
  /** The window "new" is counted in, in hours. */
  hours: number
  alarms: Alarm[]
  fresh: { key: FreshKey; n: number }[]
  volumes: { key: VolumeKey; n: number }[]
  plans: UsageRow[]
  complaints: Complaint[]
}

/** The windows the page offers for what is new. */
export const WINDOWS = [24, 72, 168] as const
export const windowOf = (asked: string | undefined): number => WINDOWS.find((h) => String(h) === asked) ?? 24

/** A document waiting this long to be booked is old (the month's VAT needs it before the 25th). */
export const OLD_DOC_DAYS = 14
/** Complaints are looked for in the clients' messages of this many days. */
export const COMPLAINT_DAYS = 30

/**
 * Words a client writes when something went wrong, without diacritics and in small letters: the beginnings of the
 * words, so that "sťažnosť", "sťažnosti" and "sťažujem" are one. Not "chýba", which without its accent is "chyba" and
 * says only that a document is missing, nor "problém", which is mostly "nie je problém". Read here and never sent anywhere.
 */
export const COMPLAINT_WORDS = [
  'staznost',
  'stazuj',
  'reklamac',
  'reklamuj',
  'nespokoj',
  'nefunguj',
  'nejde to',
  'chybn',
  'chyba je u vas',
  'vasa chyba',
  'chybu ste',
  'pokut',
  'penale',
  'sankci',
  'zrusit zmluv',
  'vypoved',
  'vypovedam',
  'sklaman',
  'podvod',
  'peniaze spat',
  'vratit peniaze',
  'hrozn',
  'katastrof',
  'neodpoved',
  'nikto mi',
  'omeskan',
  'zle zauct',
  'nespravn',
]

/** A text in small letters without diacritics, its spaces made one. */
export const plain = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')

export const complains = (body: string): boolean => {
  const text = plain(body)
  return COMPLAINT_WORDS.some((word) => text.includes(word))
}

/** The order an alarm stands in: what burns first, then what to watch, then the rest; within a level the larger. */
export const LEVEL_ORDER: Record<Level, number> = { hori: 0, pozor: 1, info: 2 }
export const byLevel = (a: Alarm, b: Alarm) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] || b.n - a.n

type Row = Record<string, unknown>
const num = (v: unknown) => Number(v ?? 0)

/** Firms by id, each once, in the order met. */
function firmsOf(companies: readonly Pick<Company, 'id' | 'name'>[]): Firm[] {
  const seen = new Set<string>()
  const out: Firm[] = []
  for (const c of companies) if (!seen.has(c.id)) seen.add(c.id), out.push({ id: c.id, name: c.name })
  return out
}

/** The alarms the clients' rows say: messages, open reports, things to check, the power of attorney and the declaration. */
export function clientAlarms(rows: readonly ClientRow[], at: number): Alarm[] {
  const waiting = rows.filter((r) => r.waiting !== null)
  const late = waiting.filter((r) => responseDueAt(r.waiting!) < at)
  const fresh = waiting.filter((r) => !late.includes(r))
  const oldest = (list: readonly ClientRow[]) => list.reduce<number | null>((min, r) => (r.waiting !== null && (min === null || r.waiting < min) ? r.waiting : min), null)
  const of = (list: readonly ClientRow[]) => firmsOf(list.map((r) => r.company))
  const out: Alarm[] = [
    { key: 'messagesLate', level: 'hori', n: late.length, firms: of(late), href: '/ucto/spravy', since: oldest(late) },
    { key: 'messages', level: 'pozor', n: fresh.length, firms: of(fresh), href: '/ucto/spravy', since: oldest(fresh) },
  ]
  const reports = rows.filter((r) => r.openReports > 0)
  out.push({ key: 'reports', level: 'hori', n: reports.reduce((s, r) => s + r.openReports, 0), firms: of(reports), href: '/ucto' })
  const check = rows.filter((r) => r.toCheck > 0)
  out.push({ key: 'toCheck', level: 'pozor', n: check.reduce((s, r) => s + r.toCheck, 0), firms: of(check), href: '/ucto' })
  const poa = rows.filter((r) => r.poa === 'waiting')
  out.push({ key: 'poa', level: 'pozor', n: poa.length, firms: of(poa), href: '/ucto' })
  const declaration = rows.filter((r) => r.declaration === 'waiting')
  out.push({ key: 'declaration', level: 'pozor', n: declaration.length, firms: of(declaration), href: '/ucto' })
  return out
}

/** The usage rows' alarm: every client over its plan this month, or past the highest one. */
export function planAlarm(plans: readonly UsageRow[]): Alarm {
  const over = plans.filter((p) => p.usage.state === 'over' || p.usage.state === 'agree')
  return { key: 'plans', level: over.some((p) => p.usage.state === 'agree') ? 'hori' : 'pozor', n: over.length, firms: firmsOf(over.map((p) => p.company)), href: '/ucto/prehlad#baliky' }
}

export interface OverviewInput {
  user: User
  demo: boolean
  at: number
  today: string
  hours: number
  /** Whether contracts may be concluded online (CONTRACT_RELEASE). */
  released: boolean
  /** Whether the user is the designated person, who alone sees the applications for the s. r. o. for 1 €. */
  officer: boolean
}

export async function overviewOf(db: D1Database, input: OverviewInput): Promise<Overview> {
  const { user, demo, at, today, hours } = input
  const since = at - hours * 3600
  const month = today.slice(0, 7)
  const monthFrom = monthStart(month)
  const firms = `c.operator = 0 AND c.invoicing_only = 0${demo ? '' : ' AND c.demo = 0'}`
  const companies = `(SELECT id FROM companies c WHERE ${firms})`
  const q = (sql: string, ...binds: unknown[]) => db.prepare(sql).bind(...binds)
  const [rows, { dues }, mail, plans, bills, counts] = await Promise.all([
    teamClients(db, user, demo),
    teamDeadlines(db, user, demo, today),
    failedMail(db),
    planUsages(db, at, null, demo),
    billRows(db, today, null, 2000).catch(() => []),
    db.batch<Row>([
      // 0: what is new since the window began
      q(`SELECT
          (SELECT COUNT(*) FROM leads WHERE created_at >= ?1) AS leads,
          (SELECT COUNT(*) FROM requests WHERE created_at >= ?1) AS requests,
          (SELECT COUNT(*) FROM orders WHERE created_at >= ?1) AS orders,
          (SELECT COUNT(*) FROM companies c WHERE ${firms} AND c.contract_at >= ?1) AS contracts,
          (SELECT COUNT(*) FROM foundings WHERE created_at >= ?1) AS foundings,
          (SELECT COUNT(*) FROM documents d WHERE d.company_id IN ${companies} AND d.created_at >= ?1 AND d.source <> 'firmony') AS documents,
          (SELECT COUNT(*) FROM messages m WHERE m.company_id IN ${companies} AND m.side = 'client' AND m.created_at >= ?1) AS messages,
          (SELECT COUNT(*) FROM invoices i WHERE i.company_id IN ${companies} AND i.status = 'issued' AND i.created_at >= ?1) AS invoices,
          (SELECT COUNT(*) FROM companies c WHERE c.invoicing_only = 1 AND c.created_at >= ?1${demo ? '' : ' AND c.demo = 0'}) AS workspaces,
          (SELECT COUNT(*) FROM events WHERE action = 'mony.answered' AND at >= ?1) AS mony,
          (SELECT COUNT(*) FROM investor_requests WHERE created_at >= ?1) AS investors`, since),
      // 1: how much there is
      q(`SELECT
          (SELECT COUNT(*) FROM companies c WHERE ${firms} AND c.contract_at IS NOT NULL AND c.purge_started_at IS NULL AND c.purged_at IS NULL AND (c.ends_on IS NULL OR c.ends_on >= ?1)) AS clients,
          (SELECT COUNT(*) FROM companies c WHERE ${firms} AND c.contract_at IS NOT NULL AND c.ends_on >= ?1) AS ending,
          (SELECT COUNT(*) FROM companies c WHERE c.invoicing_only = 1 AND c.closed_at IS NULL AND c.purged_at IS NULL${demo ? '' : ' AND c.demo = 0'}) AS workspaces,
          (SELECT COUNT(*) FROM documents d WHERE d.company_id IN ${companies} AND d.deleted_at IS NULL AND d.source <> 'firmony') AS documents,
          (SELECT COUNT(*) FROM documents d WHERE d.company_id IN ${companies} AND d.created_at >= ?2 AND ${PLAN_DOC_SQL}) AS documentsMonth,
          (SELECT COUNT(*) FROM payments p WHERE p.company_id IN ${companies}) AS payments,
          (SELECT COUNT(*) FROM invoices i WHERE i.company_id IN ${companies} AND i.status = 'issued') AS invoices,
          (SELECT COUNT(*) FROM messages m WHERE m.company_id IN ${companies}) AS messages,
          (SELECT COUNT(*) FROM employees e WHERE e.company_id IN ${companies} AND (e.ended_on IS NULL OR e.ended_on >= ?1)) AS employees,
          (SELECT COUNT(*) FROM users WHERE team IS NULL) AS people,
          (SELECT COUNT(*) FROM leads) AS leads,
          (SELECT COUNT(*) FROM requests) AS requests`, today, monthFrom),
      // 2: what waits outside the clients' rows
      q(`SELECT
          (SELECT COUNT(*) FROM incidents WHERE closed_at IS NULL) AS incidents,
          (SELECT COUNT(*) FROM incidents WHERE closed_at IS NULL AND severity IN ('high', 'critical')) AS incidentsHigh,
          (SELECT COUNT(*) FROM aml_dossiers x WHERE x.created_at > ?1 - 60 * 86400 AND NOT EXISTS (SELECT 1 FROM aml_decisions y WHERE y.dossier_id = x.id)) AS amlDossiers,
          (SELECT MIN(x.created_at) FROM aml_dossiers x WHERE x.created_at > ?1 - 60 * 86400 AND NOT EXISTS (SELECT 1 FROM aml_decisions y WHERE y.dossier_id = x.id)) AS amlSince,
          (SELECT COUNT(*) FROM orders o WHERE o.status = 'open' AND o.expires_at > ?1 AND NOT EXISTS (SELECT 1 FROM order_reviews r WHERE r.order_id = o.id)) AS ordersReview,
          (SELECT MIN(o.created_at) FROM orders o WHERE o.status = 'open' AND o.expires_at > ?1 AND NOT EXISTS (SELECT 1 FROM order_reviews r WHERE r.order_id = o.id)) AS ordersSince,
          (SELECT COUNT(*) FROM requests WHERE status = 'new') AS requests,
          (SELECT MIN(created_at) FROM requests WHERE status = 'new') AS requestsSince,
          (SELECT COUNT(*) FROM foundings WHERE status = 'verifying' AND purge_started_at IS NULL) AS foundings,
          (SELECT COUNT(*) FROM documents d WHERE d.company_id IN ${companies} AND d.deleted_at IS NULL AND d.booked_at IS NULL AND d.status IN ('read', 'manual') AND d.created_at < ?1 - ${OLD_DOC_DAYS} * 86400) AS oldDocs,
          (SELECT MIN(d.created_at) FROM documents d WHERE d.company_id IN ${companies} AND d.deleted_at IS NULL AND d.booked_at IS NULL AND d.status IN ('read', 'manual')) AS oldDocsSince,
          (SELECT COUNT(*) FROM documents d WHERE d.company_id IN ${companies} AND d.deleted_at IS NULL AND d.status = 'reading' AND d.created_at < ?1 - 3600) AS reading,
          (SELECT COUNT(*) FROM peppol_unrouted WHERE resolved_at IS NULL) AS peppol,
          (SELECT COUNT(*) FROM sanction_lists WHERE fetched_at > ?1 - 36 * 3600) AS sanctionsFresh`, at),
      // 3: whose old documents, whose stuck ones, who gave notice
      q(`SELECT DISTINCT c.id, c.name, 'old' AS what FROM documents d JOIN companies c ON c.id = d.company_id WHERE ${firms} AND d.deleted_at IS NULL AND d.booked_at IS NULL AND d.status IN ('read', 'manual') AND d.created_at < ?1 - ${OLD_DOC_DAYS} * 86400
         UNION SELECT DISTINCT c.id, c.name, 'reading' FROM documents d JOIN companies c ON c.id = d.company_id WHERE ${firms} AND d.deleted_at IS NULL AND d.status = 'reading' AND d.created_at < ?1 - 3600
         UNION SELECT c.id, c.name, 'notice' FROM companies c WHERE ${firms} AND c.contract_at IS NOT NULL AND c.ends_on IS NOT NULL AND c.ends_on >= ?2 AND c.purge_started_at IS NULL`, at, today),
      // 4: the clients' messages of the last days, read here for complaints; never shown or sent on as text
      q(`SELECT m.company_id, c.name, m.body, m.created_at FROM messages m JOIN companies c ON c.id = m.company_id WHERE ${firms} AND m.side = 'client' AND m.created_at >= ? ORDER BY m.created_at DESC LIMIT 3000`, at - COMPLAINT_DAYS * 86400),
    ]),
  ])
  const [fresh = [], volume = [], wait = [], who = [], said = []] = counts.map((r) => r?.results ?? [])
  const f = fresh[0] ?? {}
  const v = volume[0] ?? {}
  const w = wait[0] ?? {}
  const whose = (what: string) => who.filter((r) => r.what === what).map((r) => ({ id: String(r.id), name: String(r.name) }))

  const complaints = new Map<string, Complaint>()
  for (const r of said) {
    if (!complains(String(r.body ?? ''))) continue
    const id = String(r.company_id)
    const known = complaints.get(id)
    if (known) known.n++
    else complaints.set(id, { firm: { id, name: String(r.name) }, n: 1, last: num(r.created_at) })
  }

  const ours = dues.filter((d) => d.state !== 'done')
  const late = ours.filter((d) => d.late && pressing([d], today).length > 0)
  const week = pressing(dues, today).filter((d) => !d.late)
  const overdueBills = bills.filter((b) => b.state === 'overdue')
  const longOverdue = overdueBills.filter((b) => Date.parse(`${today}T12:00:00Z`) - Date.parse(`${b.dueOn}T12:00:00Z`) >= 30 * 86_400_000)
  // The month's bills are issued in its first days; until the tenth a bill still waiting is worth a look.
  const waitingBills = Number(today.slice(8, 10)) <= 10 ? (await billingDrafts(db, month).catch(() => [])).filter((b) => issuable(b) || b.draft.flags.length > 0) : []

  const alarms: Alarm[] = [
    { key: 'deadlinesLate', level: 'hori', n: late.length, firms: firmsOf(late.map((d) => d.company)), href: '/ucto/terminy?kto=my' },
    { key: 'deadlinesWeek', level: 'pozor', n: week.length, firms: firmsOf(week.map((d) => d.company)), href: '/ucto/terminy?kto=my' },
    ...clientAlarms(rows, at),
    { key: 'mail', level: 'hori', n: mail.n, firms: [], href: '/ucto' },
    { key: 'incidents', level: num(w.incidentsHigh) > 0 ? 'hori' : 'pozor', n: num(w.incidents), firms: [], href: '/ucto/incidenty' },
    { key: 'amlDossiers', level: 'pozor', n: num(w.amlDossiers), firms: [], href: '/ucto/ziadosti', since: w.amlSince === null || w.amlSince === undefined ? null : num(w.amlSince) },
    { key: 'ordersReview', level: 'pozor', n: num(w.ordersReview), firms: [], href: '/ucto/ziadosti', since: w.ordersSince === null || w.ordersSince === undefined ? null : num(w.ordersSince) },
    { key: 'requests', level: 'pozor', n: num(w.requests), firms: [], href: '/ucto/ziadosti', since: w.requestsSince === null || w.requestsSince === undefined ? null : num(w.requestsSince) },
    { key: 'foundings', level: 'pozor', n: input.officer ? num(w.foundings) : 0, firms: [], href: '/ucto/zalozenia' },
    { key: 'billsOverdue', level: longOverdue.length > 0 ? 'hori' : 'pozor', n: overdueBills.length, firms: firmsOf(overdueBills.map((b) => ({ id: b.clientId, name: b.clientName }))), href: '/ucto/fakturacia#vystavene' },
    { key: 'billing', level: 'pozor', n: waitingBills.length, firms: firmsOf(waitingBills.map((b) => b.company)), href: '/ucto/fakturacia' },
    planAlarm(plans),
    { key: 'oldDocs', level: 'pozor', n: num(w.oldDocs), firms: whose('old'), href: '/ucto/doklady', since: w.oldDocsSince === null || w.oldDocsSince === undefined ? null : num(w.oldDocsSince) },
    { key: 'reading', level: 'pozor', n: num(w.reading), firms: whose('reading'), href: '/ucto/doklady' },
    { key: 'peppol', level: 'pozor', n: num(w.peppol), firms: [], href: '/ucto/fakturacne-ucty#peppol' },
    // Both lists of sanctions are read every day (aml/sanctions-store.ts); one older than a day and a half is not used.
    { key: 'sanctions', level: 'pozor', n: Math.max(0, 2 - num(w.sanctionsFresh)), firms: [], href: '/healthz' },
    { key: 'notices', level: 'pozor', n: whose('notice').length, firms: whose('notice'), href: '/ucto' },
    { key: 'complaints', level: 'pozor', n: [...complaints.values()].reduce((s, c) => s + c.n, 0), firms: [...complaints.values()].map((c) => c.firm), href: '/ucto/prehlad#staznosti' },
    { key: 'release', level: 'info', n: input.released ? 0 : 1, firms: [], href: '/ucto/ziadosti/schvalenie' },
  ]

  const FRESH: FreshKey[] = ['leads', 'requests', 'orders', 'contracts', 'foundings', 'documents', 'messages', 'invoices', 'workspaces', 'mony', 'investors']
  const VOLUMES: VolumeKey[] = ['clients', 'ending', 'workspaces', 'documents', 'documentsMonth', 'payments', 'invoices', 'messages', 'employees', 'people', 'leads', 'requests']
  return {
    at,
    today,
    hours,
    alarms: alarms.filter((a) => a.n > 0).sort(byLevel),
    fresh: FRESH.map((key) => ({ key, n: num(f[key]) })),
    volumes: VOLUMES.map((key) => ({ key, n: num(v[key]) })),
    plans,
    complaints: [...complaints.values()].sort((a, b) => b.n - a.n || b.last - a.last),
  }
}

/** What each alarm is, as the page and the check by Claude say it; the count stands beside it. */
export const ALARM_LABELS: Record<AlarmKey, string> = {
  deadlinesLate: 'Naše termíny po termíne',
  deadlinesWeek: 'Naše termíny do 7 dní',
  messagesLate: 'Správy klientov bez odpovede dlhšie ako pracovný deň',
  messages: 'Správy klientov čakajú na odpoveď',
  reports: 'Otvorené interné oznámenia (AML)',
  mail: 'E-maily, ktoré sa nepodarilo odoslať',
  incidents: 'Otvorené bezpečnostné incidenty',
  amlDossiers: 'AML spisy čakajú na rozhodnutie',
  ordersReview: 'Objednávky čakajú na posúdenie',
  requests: 'Nové žiadosti z webu',
  foundings: 'Prihlášky s. r. o. za 1 € čakajú na overenie',
  billsOverdue: 'Faktúry Firmony klientom po splatnosti',
  billing: 'Faktúry klientom za tento mesiac čakajú',
  plans: 'Klienti nad svojím balíkom tento mesiac',
  oldDocs: `Doklady nezaúčtované dlhšie ako ${OLD_DOC_DAYS} dní`,
  reading: 'Doklady sa nedajú prečítať dlhšie ako hodinu',
  toCheck: 'Platby a výpisy na kontrolu',
  poa: 'Plné moci na overenie',
  declaration: 'Údaje klientov (AML) na overenie',
  peppol: 'E-faktúry bez príjemcu',
  sanctions: 'Zoznamy sankcií nie sú čerstvé',
  notices: 'Klienti, ktorí dali výpoveď',
  complaints: `Správy klientov so sťažnosťou za ${COMPLAINT_DAYS} dní`,
  release: 'Zmluvy online sú zatvorené (CONTRACT_RELEASE)',
}

export const FRESH_LABELS: Record<FreshKey, string> = {
  leads: 'E-maily z webu',
  requests: 'Žiadosti z webu',
  orders: 'Objednávky',
  contracts: 'Nové zmluvy',
  foundings: 'Prihlášky s. r. o. za 1 €',
  documents: 'Doklady od klientov',
  messages: 'Správy od klientov',
  invoices: 'Faktúry vystavené klientmi',
  workspaces: 'Nové fakturačné účty',
  mony: 'Otázky pre Mony',
  investors: 'Investori',
}

export const VOLUME_LABELS: Record<VolumeKey, string> = {
  clients: 'Klienti so zmluvou',
  ending: 'Z nich s výpoveďou',
  workspaces: 'Fakturačné účty zadarmo',
  documents: 'Doklady spolu',
  documentsMonth: 'Doklady tento mesiac (rátané do balíkov)',
  payments: 'Platby z bánk',
  invoices: 'Faktúry vystavené klientmi',
  messages: 'Správy',
  employees: 'Zamestnanci klientov',
  people: 'Ľudia s účtom',
  leads: 'E-maily z webu spolu',
  requests: 'Žiadosti z webu spolu',
}
