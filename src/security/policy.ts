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
  /** A client without a passkey confirms a sensitive action by signing in afresh with a link from the email. */
  freshLinkSeconds: 900,
  grantSeconds: 86400,
  requestsPerTenMinutes: 20,
} as const
export const AUTH_TOKEN = /^[A-Za-z0-9_-]{43}$/

export function safeNext(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.length > 1200) return '/app'
  try {
    const u = new URL(value, BRAND.origin)
    if (u.origin !== new URL(BRAND.origin).origin) return '/app'
    if (u.pathname === '/auth') return '/auth'
    if (!/^\/(?:app|ucto)(?:\/|$)/.test(u.pathname)) return '/app'
    return `${u.pathname}${u.search}${u.hash}`
  } catch {
    return '/app'
  }
}

/** A blocked mutation must resume on a GET work page, never replay the POST or navigate to its action URL. */
export function actionReturn(value: unknown, referrer?: string, origin: string = BRAND.origin): string {
  const target = new URL(workPage(new URL(safeNext(value), BRAND.origin).pathname), BRAND.origin)
  // Preserve the selected accounting period only from this action's own work page on the same origin.
  // A referrer cannot select a different page, another company, a download or an action URL.
  if (referrer && referrer.length <= 1200) {
    try {
      const previous = new URL(referrer)
      if (previous.origin === new URL(origin).origin && previous.pathname === target.pathname) return `${target.pathname}${previous.search}${target.hash}`
    } catch {
      // A missing or malformed referrer is optional navigation context.
    }
  }
  return `${target.pathname}${target.hash}`
}
function workPage(path: string): string {
  if (path === '/app/export/potvrdit') return '/app/firma#stiahnut'
  if (path === '/app/faktury') return '/app/faktury/nova'
  if (/^\/app\/mzdove-podania(?:\/|$)/.test(path)) return '/app/mzdove-podania'
  const clientItem = /^\/app\/(doklady|platby|faktury)\/([^/]+)/.exec(path)
  if (clientItem) return `/app/${clientItem[1]}/${clientItem[2]}`
  const clientPage = /^\/app\/(banka|firma|doklady|spravy|plna-moc|vyhlasenie|prechod)(?:\/|$)/.exec(path)
  if (clientPage) return `/app/${clientPage[1]}`
  const company = /^\/ucto\/klienti\/([^/]+)(?:\/(.*))?$/.exec(path)
  if (company) {
    const base = `/ucto/klienti/${company[1]}`, section = company[2] ?? ''
    const payroll = /^mzdove-podania(?:\/([^/]+))?(?:\/verzie\/([^/]+))?/.exec(section)
    if (payroll?.[1] && /^mzdove-podania\/[^/]+\/(?:pripravit|generovat|poistenec|udaje-sp)$/.test(section)) return `${base}/mzdove-podania/${payroll[1]}/pripravit`
    if (payroll) return `${base}/mzdove-podania${payroll[1] && !['vyplata', 'zalozit'].includes(payroll[1]) ? `/${payroll[1]}${payroll[2] ? `/verzie/${payroll[2]}` : ''}` : ''}`
    const filing = /^podania\/([^/]+)(?:\/|$)/.exec(section)
    if (filing) return `${base}/podania/${filing[1]}`
    const books = /^kniha\/(obdobia|platby|interne|pociatocne)(?:\/|$)/.exec(section)
    if (books) return `${base}/kniha/${books[1]}`
    const page = /^(dph|mzdy|zavierka|aml|prevzatie)(?:\/|$)/.exec(section)
    if (page) return `${base}/${page[1]}`
    if (/^odovzdanie(?:\/|$)/.test(section)) return `${base}#odovzdanie`
    return base
  }
  if (path === '/ucto/klienti') return '/ucto/klienti/novy'
  const document = /^\/ucto\/doklady\/([^/]+)/.exec(path)
  if (document) return `/ucto/doklady/${document[1]}`
  const incident = /^\/ucto\/incidenty\/([^/]+)/.exec(path)
  if (incident) return `/ucto/incidenty/${incident[1]}`
  if (/^\/ucto\/ziadosti\/[^/]+\/posudenie$/.test(path)) return path
  const founding = /^\/ucto\/zalozenia\/([^/]+)/.exec(path)
  if (founding) return `/ucto/zalozenia/${founding[1]}`
  const meeting = /^\/ucto\/stretnutie(?:\/([^/]+))?/.exec(path)
  if (meeting) return meeting[1] ? `/ucto/stretnutie/${meeting[1]}` : '/ucto/stretnutie'
  const teamPage = /^\/ucto\/(tim|ziadosti|incidenty|zalozenia)(?:\/|$)/.exec(path)
  if (teamPage) return `/ucto/${teamPage[1]}`
  return path === '/ucto' || path.startsWith('/ucto/') ? '/ucto' : '/app'
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
  if(path==='/ucto/ai/asistent'&&method!=='GET'&&method!=='HEAD')return true
  if (method !== 'GET' && method !== 'HEAD' && (/^\/app\/prechod\/(?:poverit|odvolat)$/.test(path) || /^\/ucto\/klienti\/[^/]+\/prevzatie\/prechod(?:\/|$)/.test(path))) return true
  if (/^\/ucto\/(?:aml|archiv)(?:\/|$)/.test(path)) return true
  // The founders' identification for the s. r. o. for 1 € (src/founding/): as the AML pages, read and worked on after a
  // fresh confirmation only.
  if (/^\/ucto\/zalozenia(?:\/|$)/.test(path)) return true
  // A meeting identifies a person in person (src/meeting/): as the AML pages. Only the state both phones ask for every few
  // seconds is not, so that a confirmation running out does not stop the page following the other phone.
  if (/^\/ucto\/stretnutie(?:\/|$)/.test(path) && !((method === 'GET' || method === 'HEAD') && /^\/ucto\/stretnutie\/[^/]+\/stav$/.test(path))) return true
  if (/^\/ucto\/klienti\/[^/]+\/aml(?:\/|$)/.test(path) && method !== 'GET' && method !== 'HEAD') return true
  if (/^\/ucto\/klienti\/[^/]+\/mzdove-podania\/[^/]+\/pripravit$/.test(path)) return true
  if (/^\/(?:app|ucto\/klienti\/[^/]+)\/mzdove-podania(?:\/|$)/.test(path) && (method !== 'GET' && method !== 'HEAD' || /\/(?:dokument|potvrdenka\/[^/]+)$/.test(path))) return true
  if (/^\/(?:app|ucto\/klienti\/[^/]+)\/podania\/[^/]+\/(?:stav|dokument\.xml|potvrdenka\/[^/]+)$/.test(path)) return true
  if (/^\/app\/export(?:\/potvrdit)?$/.test(path)) return true
  // Ending a workspace of invoicing deletes every invoice of it: as fresh a proof as an export.
  if (path === '/app/fakturacia/zrusit' && method !== 'GET' && method !== 'HEAD') return true
  if (/^\/ucto\/fakturacne-ucty\/[^/]+\/(?:zablokovat|odblokovat)$/.test(path) && method !== 'GET' && method !== 'HEAD') return true
  // Binding a company to its Peppol participant lets it send in its name; a notice's e-invoice is a company's document.
  if (/^\/ucto\/fakturacne-ucty\/peppol\//.test(path)) return true
  // The administrator's analytics leave the app only after a fresh confirmation (26 October 2026).
  if (/^\/ucto\/analytika\/export\.(?:json|csv)$/.test(path)) return true
  if (/^\/ucto\/podania\/(?:balik\.zip|naraz)$/.test(path)) return true
  if (
    path.startsWith('/ucto/') &&
    (method === 'GET' || method === 'HEAD') &&
    (/\/paska$/.test(path) || /\.(?:csv|xml|pdf)$/.test(path) || /\/(?:plna-moc|odovzdanie|prevzatie)\/[^/]+$/.test(path))
  )
    return true
  if (method !== 'GET' && method !== 'HEAD' && (path === '/ucto/tim' || /\/odovzdanie\/[^/]+\/odstranit$/.test(path) || /\/(?:posudenie|uvolnit|schvalit-uvolnenie|uzavriet)$/.test(path) || /^\/ucto\/fakturacia\/(?:europio|vystavit)$/.test(path))) return true
  return false
}
