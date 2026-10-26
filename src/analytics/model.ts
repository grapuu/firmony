// Analytics (26 October 2026, his word: he wants to see his clients, what they use and how, which features people use,
// where improvement is needed and how long things take; "nádherný admin panel, úplne jednoduchý a prehľadný").
// Measured here, first-party, in daily sums: a page of the site by its path (tokens and ids taken out), the referring
// site by its domain alone, the campaign tags, the kind of device; for the app, the route, its status class and its
// time; for a signed-in person, which part of the app they used that day. Never an address, a whole user agent, a whole
// referring address or a query beyond the campaign tags. Pure functions only; writes in record.ts, reads in store.ts.

export type Device = 'phone' | 'tablet' | 'computer'
export type Side = 'client' | 'team'

/** The dashboard's periods, in days ending today. */
export const PERIODS = [7, 30, 90] as const
export type Period = (typeof PERIODS)[number]

export function periodOf(value: string | undefined): Period {
  const n = Number(value)
  return (PERIODS as readonly number[]).includes(n) ? (n as Period) : 30
}

/** How long the rows of a person's use of the app are kept; the daily sums without a person stay. */
export const USAGE_MONTHS = 13

/** The first day still kept: the same day of the month 13 months back (the month's last day when it is shorter). */
export function usageCutoff(today: string): string {
  const y = Number(today.slice(0, 4))
  const m = Number(today.slice(5, 7)) - 1 - USAGE_MONTHS
  const year = y + Math.floor(m / 12)
  const month = ((m % 12) + 12) % 12
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  const day = Math.min(Number(today.slice(8, 10)), last)
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

// ---------------------------------------------------------------------------------------------------------------
// Durations: a small histogram per route and day, enough for p50 and p95
// ---------------------------------------------------------------------------------------------------------------

/** Upper bounds of the time buckets in ms; a ninth bucket holds everything from the last bound up. */
export const BUCKETS = [25, 50, 100, 200, 400, 800, 1600, 3200] as const
export const BUCKET_COUNT = BUCKETS.length + 1

export function bucketOf(ms: number): number {
  const value = Number.isFinite(ms) && ms > 0 ? ms : 0
  const i = BUCKETS.findIndex((bound) => value < bound)
  return i === -1 ? BUCKETS.length : i
}

/**
 * The p-th percentile (0 to 1) of a histogram, by linear interpolation inside the bucket it falls in. The first bucket
 * starts at 0 ms; the last is open, so a percentile that falls in it is its lower bound (at least 3 200 ms). Null for
 * an empty histogram.
 */
export function percentile(hist: readonly number[], p: number): number | null {
  const counts = hist.map((n) => (Number.isFinite(n) && n > 0 ? n : 0))
  const total = counts.reduce((s, n) => s + n, 0)
  if (total === 0) return null
  const target = Math.min(Math.max(p, 0), 1) * total
  let before = 0
  for (let i = 0; i < counts.length; i++) {
    const n = counts[i] ?? 0
    if (n === 0) continue
    if (before + n >= target) {
      const lower = i === 0 ? 0 : (BUCKETS[i - 1] ?? 0)
      const upper = BUCKETS[i]
      if (upper === undefined) return lower
      return lower + ((target - before) / n) * (upper - lower)
    }
    before += n
  }
  return BUCKETS[BUCKETS.length - 1] ?? null
}

// ---------------------------------------------------------------------------------------------------------------
// The public site: what a page view keeps
// ---------------------------------------------------------------------------------------------------------------

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** Pages whose second segment is always a key: the contract's link and the customer's invoice. */
const TOKEN_PAGES = new Set(['objednavka', 'f'])

function segmentOf(raw: string): string {
  let text = raw
  try {
    text = decodeURIComponent(raw)
  } catch {
    return ':x'
  }
  if (text === '') return ''
  if (UUID.test(text)) return ':id'
  if (text.includes('@')) return ':email'
  if (/^\d{4,}$/.test(text)) return ':n'
  if (/^[0-9a-f]{16,}$/i.test(text)) return ':id'
  // A random key (base64url, 43 characters) has capitals or an underscore; our own addresses are lowercase words.
  if (text.length >= 16 && /^[A-Za-z0-9_-]+$/.test(text) && /[A-Z_]/.test(text)) return ':token'
  if (!/^[a-z0-9][a-z0-9._-]{0,79}$/.test(text)) return ':x'
  return text
}

/**
 * A path as the site's counters keep it: no query or fragment, no trailing slash, tokens, ids, e-mails and long
 * numbers replaced, at most six segments and 120 characters.
 */
export function normalisePath(pathname: string): string {
  let path = (pathname.split(/[?#]/)[0] ?? '').replace(/\/{2,}/g, '/')
  if (!path.startsWith('/')) path = `/${path}`
  if (path.length > 1) path = path.replace(/\/+$/, '')
  if (path === '' || path === '/') return '/'
  const parts = path.slice(1).split('/').slice(0, 6).map(segmentOf)
  if (parts.length > 1 && TOKEN_PAGES.has(parts[0] ?? '')) parts[1] = ':token'
  const out = `/${parts.join('/')}`
  return out.length > 120 ? out.slice(0, 120) : out
}

/** Robots by family: a known crawler is counted apart, never as a visit. Checked in this order. */
const BOTS: readonly (readonly [RegExp, string])[] = [
  [/googlebot|google-inspectiontool|googleother|google-extended|adsbot-google|mediapartners-google|apis-google|feedfetcher-google|storebot-google/i, 'google'],
  [/bingbot|bingpreview|msnbot|adidxbot/i, 'bing'],
  [/applebot/i, 'apple'],
  [/gptbot|chatgpt-user|oai-searchbot/i, 'openai'],
  [/claudebot|claude-web|claude-user|claude-searchbot|anthropic-ai/i, 'anthropic'],
  [/perplexitybot|perplexity-user/i, 'perplexity'],
  [/yandex/i, 'yandex'],
  [/seznambot/i, 'seznam'],
  [/duckduckbot|duckassistbot/i, 'duckduckgo'],
  [/baiduspider/i, 'baidu'],
  [/ahrefsbot|semrushbot|mj12bot|dotbot|petalbot|bytespider|amazonbot|ccbot|dataforseobot|blexbot|serpstatbot|barkrowler/i, 'seo'],
  [/facebookexternalhit|facebookcatalog|meta-externalagent|twitterbot|linkedinbot|slackbot|discordbot|telegrambot|whatsapp|skypeuripreview|pinterest|embedly|redditbot/i, 'preview'],
  [/bot\b|bot\/|crawler|spider|crawl|slurp|headlesschrome|lighthouse|pagespeed|python-requests|python-urllib|curl\/|wget|go-http-client|axios|node-fetch|undici|okhttp|java\/|libwww|httpclient|scrapy|uptime|pingdom|statuscake/i, 'other'],
]

export const BOT_NAMES: Record<string, string> = {
  google: 'Google',
  bing: 'Bing',
  apple: 'Apple',
  openai: 'OpenAI (ChatGPT)',
  anthropic: 'Anthropic (Claude)',
  perplexity: 'Perplexity',
  yandex: 'Yandex',
  seznam: 'Seznam',
  duckduckgo: 'DuckDuckGo',
  baidu: 'Baidu',
  seo: 'SEO nástroje',
  preview: 'Náhľady odkazov',
  other: 'Iné automaty',
}

/** The family of a robot, or null for a person's browser. An empty user agent is a robot. */
export function botOf(userAgent: string | undefined | null): string | null {
  const ua = (userAgent ?? '').slice(0, 512)
  if (ua.trim() === '') return 'other'
  for (const [pattern, family] of BOTS) if (pattern.test(ua)) return family
  return null
}

/** Phone, tablet or computer, from the user agent alone (an iPad that says it is a Mac is a computer). */
export function deviceOf(userAgent: string | undefined | null): Device {
  const ua = (userAgent ?? '').slice(0, 512)
  if (/ipad|tablet|kindle|silk\/|playbook|sm-t\d|lenovo tab|android(?!.*mobi)/i.test(ua)) return 'tablet'
  if (/mobi|iphone|ipod|android|windows phone|blackberry|opera mini|iemobile/i.test(ua)) return 'phone'
  return 'computer'
}

export const DEVICE_NAMES: Record<Device, string> = { phone: 'Mobil', tablet: 'Tablet', computer: 'Počítač' }

/** The referring site by its domain alone (www., m. and link shims taken off), or null for none or our own site. */
export function referrerOf(header: string | undefined | null, ownHost: string): string | null {
  if (!header) return null
  let url: URL
  try {
    url = new URL(header)
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:' && url.protocol !== 'android-app:') return null
  const strip = (host: string) => host.toLowerCase().replace(/^(?:www|m|l|lm|mobile|out)\./, '')
  const host = strip(url.hostname)
  if (host === '' || host === strip(ownHost)) return null
  if (!/^[a-z0-9.-]{1,80}$/.test(host) || !host.includes('.')) return null
  return host
}

const CAMPAIGN_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'ref'] as const
const CAMPAIGN_VALUE = /^[\p{L}\p{N}_.\-+]{1,60}$/u

/** The campaign tags of an address, as one key ("utm_source=facebook&utm_campaign=jesen"), or null. */
export function campaignOf(search: URLSearchParams): string | null {
  const parts: string[] = []
  for (const key of CAMPAIGN_KEYS) {
    const value = search.get(key)
    if (value && CAMPAIGN_VALUE.test(value)) parts.push(`${key}=${value.toLowerCase()}`)
  }
  return parts.length > 0 ? parts.join('&') : null
}

/**
 * The campaign of a sign-up as it was kept (a request's or a workspace's `source`: the tags as JSON, or already an
 * object), as the same key as campaignOf; null for none.
 */
export function campaignFromSource(source: unknown): string | null {
  let tags: unknown = source
  if (typeof source === 'string') {
    try {
      tags = JSON.parse(source)
    } catch {
      return null
    }
  }
  if (!tags || typeof tags !== 'object' || Array.isArray(tags)) return null
  const search = new URLSearchParams()
  for (const key of CAMPAIGN_KEYS) {
    const value = (tags as Record<string, unknown>)[key]
    if (typeof value === 'string') search.set(key, value)
  }
  return campaignOf(search)
}

/**
 * The price of claude-haiku-5-5 per million tokens, prompts up to 100 000 tokens, without caching or batches, read on
 * 26 October 2026 in Anthropic's price list: https://platform.claude.com/docs/en/about-claude/pricing (input $0.10,
 * output $0.50). Change it here when the list changes; the page says the day it was read.
 */
export const HAIKU_PRICE = { model: 'claude-haiku-5-5', inputPerMTok: 0.1, outputPerMTok: 0.5, read: '2026-10-26', source: 'https://platform.claude.com/docs/en/about-claude/pricing' } as const

/** What tokens cost at that price, in US dollars. */
export function costUsd(input: number, output: number): number {
  const safe = (n: number) => (Number.isFinite(n) && n > 0 ? n : 0)
  return (safe(input) * HAIKU_PRICE.inputPerMTok + safe(output) * HAIKU_PRICE.outputPerMTok) / 1_000_000
}

/** Dollars as Slovak writes them, four decimal places below a dollar: "0,0004 USD", "1,25 USD". */
export function usdText(usd: number): string {
  const value = Number.isFinite(usd) && usd > 0 ? usd : 0
  return `${value.toFixed(value < 1 ? 4 : 2).replace('.', ',')} USD`
}

/** A campaign key as the dashboard says it: "facebook / cpc / jesen". */
export function campaignName(key: string): string {
  const values = new URLSearchParams(key)
  const utm = ['utm_source', 'utm_medium', 'utm_campaign'].map((k) => values.get(k)).filter((v): v is string => Boolean(v))
  const ref = values.get('ref')
  return [utm.join(' / '), ref ? `ref ${ref}` : ''].filter(Boolean).join(', ') || key
}

// ---------------------------------------------------------------------------------------------------------------
// The app: which side, which route, which feature
// ---------------------------------------------------------------------------------------------------------------

/** The client's app (/app) or the team's (/ucto); null for anything else. */
export function sideOf(pathname: string): Side | null {
  if (pathname === '/app' || pathname.startsWith('/app/')) return 'client'
  if (pathname === '/ucto' || pathname.startsWith('/ucto/')) return 'team'
  return null
}

/** A route as Hono matched it ("/app/faktury/:id"); anything that is no such pattern is "(iné)". */
export function routeKey(route: string | undefined | null): string {
  if (!route || !/^\/[A-Za-z0-9/:_.*-]{0,149}$/.test(route)) return '(iné)'
  return route
}

export const CLIENT_FEATURES: Record<string, string> = {
  prehlad: 'Prehľad',
  faktury: 'Faktúry',
  doklady: 'Doklady',
  platby: 'Platby',
  banka: 'Banka a výpisy',
  spravy: 'Správy',
  asistent: 'Asistent',
  pokladna: 'Pokladňa a tržby',
  cesty: 'Pracovné cesty',
  dane: 'Dane a podania',
  mzdy: 'Mzdové podania',
  uhrady: 'Úhrady a schvaľovanie',
  strediska: 'Strediská',
  firma: 'Firma a zmluva',
  prechod: 'Prechod od účtovníčky',
  export: 'Export a odovzdanie',
  ine: 'Ostatné',
}

const CLIENT_SEGMENTS: Record<string, string> = {
  '': 'prehlad',
  faktury: 'faktury',
  logo: 'faktury',
  doklady: 'doklady',
  subory: 'doklady',
  platby: 'platby',
  banka: 'banka',
  vypisy: 'banka',
  spravy: 'spravy',
  asistent: 'asistent',
  pokladna: 'pokladna',
  trzby: 'pokladna',
  cesty: 'cesty',
  dane: 'dane',
  podania: 'dane',
  'mzdove-podania': 'mzdy',
  uhrady: 'uhrady',
  schvalovanie: 'uhrady',
  strediska: 'strediska',
  firma: 'firma',
  zmluva: 'firma',
  vyhlasenie: 'firma',
  'plna-moc': 'firma',
  prechod: 'prechod',
  export: 'export',
  odovzdanie: 'export',
}

export const TEAM_FEATURES: Record<string, string> = {
  klienti: 'Zoznam klientov',
  klient: 'Karta klienta',
  terminy: 'Termíny',
  doklady: 'Účtovanie dokladov',
  spravy: 'Správy',
  ziadosti: 'Žiadosti z webu',
  fakturacia: 'Fakturácia',
  tim: 'Tím',
  vykaz: 'Výkaz práce',
  ai: 'AI a asistent',
  analytika: 'Analytika',
  podania: 'Podania',
  incidenty: 'Incidenty',
  archiv: 'Archív',
  aml: 'Identifikácia (AML)',
  kniha: 'Účtovná kniha',
  dph: 'DPH',
  mzdy: 'Mzdy',
  zavierka: 'Závierka',
  prevzatie: 'Prevzatie',
  ine: 'Ostatné',
}

/** Pages before a session (sign-in and its kin): no feature anybody uses. */
const NO_FEATURE = new Set(['prihlasenie', 'vstup', 'odhlasit', 'potvrdit', 'prvy-spravca', 'ukazka'])

/** The part of the app a route belongs to, for the usage rows; null for the sign-in pages. */
export function featureOf(side: Side, route: string): string | null {
  const parts = route.split('/').slice(2)
  if (side === 'client') {
    const first = parts[0] ?? ''
    if (NO_FEATURE.has(first)) return null
    return CLIENT_SEGMENTS[first] ?? 'ine'
  }
  let segment = parts[0] ?? 'klienti'
  if (segment === '') segment = 'klienti'
  if (segment === 'klienti' && parts[1]?.startsWith(':')) segment = parts[2] ?? 'klient'
  if (segment === 'mzdove-podania') segment = 'mzdy'
  if (NO_FEATURE.has(segment)) return null
  if (!/^[a-z][a-z-]{0,39}$/.test(segment)) return 'ine'
  return segment
}

export function featureName(side: Side, feature: string): string {
  return (side === 'client' ? CLIENT_FEATURES[feature] : TEAM_FEATURES[feature]) ?? feature
}

// ---------------------------------------------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------------------------------------------

/** The days from one to another, both included (YYYY-MM-DD). */
export function daysFrom(from: string, to: string): string[] {
  const out: string[] = []
  const d = new Date(`${from}T00:00:00Z`)
  const end = new Date(`${to}T00:00:00Z`)
  while (d <= end && out.length < 400) {
    out.push(d.toISOString().slice(0, 10))
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return out
}

/**
 * A sparkline as an SVG path over a box of `width` by `height`: the line and the area under it. A series of noughts
 * lies on the bottom; one value is a level line.
 */
export function sparkPath(values: readonly number[], width = 100, height = 28): { line: string; area: string } {
  const series = values.length === 0 ? [0] : values.map((v) => (Number.isFinite(v) && v > 0 ? v : 0))
  const max = Math.max(...series)
  const pad = 2
  const y = (v: number) => (max === 0 ? height - pad : height - pad - (v / max) * (height - 2 * pad))
  const points = (series.length === 1 ? [series[0] ?? 0, series[0] ?? 0] : series).map((v, i, all) => [(i / (all.length - 1)) * width, y(v)] as const)
  const fmt = (n: number) => String(Math.round(n * 10) / 10)
  const line = points.map(([x, py], i) => `${i === 0 ? 'M' : 'L'}${fmt(x)},${fmt(py)}`).join(' ')
  return { line, area: `${line} L${fmt(width)},${height} L0,${height} Z` }
}

/** A share as Slovak writes it, rounded to one decimal place: "12,5 %"; empty when there is nothing to share. */
export function shareOf(part: number, of: number): string {
  if (!(of > 0)) return ''
  return `${(Math.round((part / of) * 1000) / 10).toFixed(1).replace('.', ',')} %`
}

/** Milliseconds as the dashboard says them: "85 ms", "1,2 s", "3,2 s a viac". */
export function msText(ms: number | null): string {
  if (ms === null) return ''
  if (ms >= BUCKETS[BUCKETS.length - 1]!) return `${(BUCKETS[BUCKETS.length - 1]! / 1000).toFixed(1).replace('.', ',')} s a viac`
  if (ms >= 1000) return `${(Math.round(ms / 100) / 10).toFixed(1).replace('.', ',')} s`
  return `${Math.round(ms)} ms`
}
