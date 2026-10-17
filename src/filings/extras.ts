// The one-stop shop's returns and Intrastat's reports in the filing bundle (18 October 2026, after his word that the
// accountant files everything as one package in a click): every one of her companies' returns and reports that is
// ready goes into the ZIP as its file, and a tick in the same form marks it as sent, as its own page does
// (team/marks.ts). A tick marks only what she downloaded: the form carries the fingerprint of what went, and a return
// or report that changed in between is left for her to download again. The windows are the deadlines' own
// (team/deadlines.ts): the last five quarters of OSS and the last four months of each Intrastat flow, once ended.
import { COMPANY_COLUMNS, companyOf, type Company, type User } from '../app/store'
import { ossXml, quarterRange } from '../app/oss'
import { ossQuarterViews } from '../app/oss-store'
import { declarationsToSend, intrastatView, latin2, monthEnd, settingsOf, type Declaration, type Flow } from '../app/intrastat'
import { intrastatDocs, intrastatFilings, monthsBefore } from '../app/intrastat-store'
import { intrastatDeadlines, ossDeadlines } from '../team/deadlines'
import { fingerprint, intrastatFileOf, markIntrastatFiled, markOssFiled, psiOf, type MarkResult } from '../team/marks'

export interface BundleExtra {
  /** The row's key in the form: `o:<company>:<quarter>` or `i:<company>:<month>:<flow>`. */
  key: string
  kind: 'oss' | 'intrastat'
  company: Company
  period: string
  flow: Flow | null
  label: string
  /** More of a month already reported: new items, corrections. */
  followUp: boolean
  /** The fingerprint of what goes, carried by the form. */
  sig: string
  href: string
  /** What goes: the return's file, or the reports with their number among the month's filings. */
  what: { xml: string } | { declarations: Declaration[]; seq: number }
}

/** At most this many companies are looked at, and this many rows listed: one page of work. */
const EXTRA_COMPANIES = 200
export const EXTRA_ROWS = 40

const OSS_KEY = /^o:([A-Za-z0-9-]{1,64}):(\d{4}-Q[1-4])$/
const INTRASTAT_KEY = /^i:([A-Za-z0-9-]{1,64}):(\d{4}-\d{2}):([AD])$/
export const isExtraKey = (key: string): boolean => OSS_KEY.test(key) || INTRASTAT_KEY.test(key)

const FLOW_LABELS: Record<Flow, string> = { A: 'Intrastat, dovoz v rámci EÚ', D: 'Intrastat, vývoz v rámci EÚ' }

/** Every return of OSS and report of Intrastat of her companies that is ready to be sent. */
export async function bundleExtras(db: D1Database, user: User, today: string): Promise<BundleExtra[]> {
  const rows = await db
    .prepare(
      `SELECT ${COMPANY_COLUMNS} FROM companies c LEFT JOIN users acc ON acc.id = c.accountant_id
        WHERE c.closed_at IS NULL AND c.demo = 0 AND c.purge_started_at IS NULL AND (?1 = 'admin' OR c.accountant_id = ?2)
          AND c.icdph IS NOT NULL AND (c.oss_since IS NOT NULL OR c.intrastat IS NOT NULL)
        ORDER BY c.name, c.id LIMIT ${EXTRA_COMPANIES}`,
    )
    .bind(user.team, user.id)
    .all<Record<string, unknown>>()
  const out: BundleExtra[] = []
  for (const company of rows.results.map(companyOf)) {
    out.push(...(await ossExtras(db, company, today)), ...(await intrastatExtras(db, company, today)))
    if (out.length >= EXTRA_ROWS) break
  }
  return out.slice(0, EXTRA_ROWS)
}

async function ossExtras(db: D1Database, company: Company, today: string): Promise<BundleExtra[]> {
  if (!company.ossSince || !company.icdph) return []
  const quarters = ossDeadlines(company, new Set(), today)
    .map((d) => d.period)
    .filter((q): q is string => q !== null && today > quarterRange(q).to)
  if (quarters.length === 0) return []
  const out: BundleExtra[] = []
  for (const view of await ossQuarterViews(db, company.id, company.ossSince, quarters, today)) {
    if (view.state !== 'ready' || view.filed) continue
    const xml = ossXml(company.icdph, view.quarter, view.lines, view.corrections)
    out.push({
      key: `o:${company.id}:${view.quarter}`,
      kind: 'oss',
      company,
      period: view.quarter,
      flow: null,
      label: 'Priznanie OSS',
      followUp: false,
      sig: await fingerprint(xml),
      href: `/ucto/klienti/${company.id}/dph/oss?stvrtrok=${view.quarter}`,
      what: { xml },
    })
  }
  return out
}

async function intrastatExtras(db: D1Database, company: Company, today: string): Promise<BundleExtra[]> {
  const settings = company.intrastat ?? settingsOf(null)
  if (!psiOf(company, settings)) return []
  const periods = intrastatDeadlines(company, new Set(), today)
    .map((d) => (d.period ?? '').split(':') as [string, Flow])
    .filter(([month]) => today > monthEnd(month))
  if (periods.length === 0) return []
  const oldest = periods.map(([m]) => m).sort()[0] as string
  const [docs, filings] = await Promise.all([intrastatDocs(db, company, { from: monthsBefore(oldest, 3) }), intrastatFilings(db, company.id)])
  const out: BundleExtra[] = []
  for (const [month, flow] of periods.sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]))) {
    const own = filings.get(`${month}:${flow}`) ?? []
    const view = intrastatView(docs, month, flow, settings, own, today)
    const declarations = declarationsToSend(view)
    if (!declarations) continue
    out.push({
      key: `i:${company.id}:${month}:${flow}`,
      kind: 'intrastat',
      company,
      period: month,
      flow,
      label: `${FLOW_LABELS[flow]}${own.length > 0 ? ', doplnenie' : ''}`,
      followUp: own.length > 0,
      sig: await fingerprint(JSON.stringify(declarations)),
      href: `/ucto/klienti/${company.id}/intrastat?mesiac=${month}&tok=${flow}`,
      what: { declarations, seq: own.length + 1 },
    })
  }
  return out
}

const periodWords = (e: BundleExtra) => (e.kind === 'oss' ? `${e.period.slice(6)}. štvrťrok ${e.period.slice(0, 4)}` : `${e.period.slice(5)}/${e.period.slice(0, 4)}`)

/** A file of the ZIP beside the documents of the offices: its folder, name, bytes and its line in the overview. */
export interface ExtraFile {
  name: string
  bytes: Uint8Array
  line: string
}

/** The ZIP's files of the extras: the OSS returns as the portal reads them, Intrastat's reports in ISO-8859-2 and dated now. */
export function extraFiles(extras: readonly BundleExtra[], today: string, at = new Date()): ExtraFile[] {
  return extras.flatMap((e): ExtraFile[] => {
    const folder = `${e.kind === 'oss' ? 'OSS' : 'Intrastat'}/${e.company.name}${e.company.ico ? ` (ICO ${e.company.ico})` : ''}`
    const who = `${e.company.name}${e.company.ico ? `, IČO ${e.company.ico}` : ''}`
    if ('xml' in e.what) {
      return [
        {
          name: `${folder}/${e.period} Priznanie OSS.xml`,
          bytes: new TextEncoder().encode(e.what.xml),
          line: `${who} · ${e.label} · ${periodWords(e)} · podať: portál OSS (One Stop Shop), Načítať zo súboru · potom vo Firmony zaškrtnite Odoslané`,
        },
      ]
    }
    const psi = psiOf(e.company, e.company.intrastat ?? settingsOf(null))
    if (!psi || !e.flow) return []
    const xml = intrastatFileOf(psi, e.period, e.flow, e.what.declarations, e.what.seq, today, at)
    return [
      {
        name: `${folder}/${e.period} Intrastat ${e.flow === 'A' ? 'dovoz' : 'vyvoz'}${e.followUp ? ` doplnenie ${e.what.seq - 1}` : ''}.xml`,
        bytes: latin2(xml),
        line: `${who} · ${e.label} · ${periodWords(e)} · odoslať: intrastat.financnasprava.sk, prihlasovacie údaje firmy od Štatistického úradu, Služby, Poslať hlásenie · potom vo Firmony zaškrtnite Odoslané`,
      },
    ]
  })
}

/** One tick of the form: the row and the fingerprint the page showed. */
export interface ExtraTick {
  key: string
  sig: string
}

/**
 * The ticked returns and reports marked as sent, each looked up among what this user may send now (the form's keys
 * only find rows there) and only when what goes is still what she downloaded. By key: what kept a tick from counting.
 */
export async function recordExtras(
  db: D1Database,
  user: User,
  ticks: readonly ExtraTick[],
  typed: string | null,
  today: string,
  origin: string,
): Promise<{ recorded: number; errors: Record<string, string> }> {
  const outcome = { recorded: 0, errors: {} as Record<string, string> }
  if (ticks.length === 0) return outcome
  const known = new Map((await bundleExtras(db, user, today)).map((e) => [e.key, e]))
  for (const tick of ticks) {
    const e = known.get(tick.key)
    if (!e) continue
    let result: MarkResult
    if (e.kind === 'oss') result = await markOssFiled(db, e.company, e.period, typed, today, user.id, origin, tick.sig)
    else result = await markIntrastatFiled(db, e.company, e.period, e.flow as Flow, typed, today, user.id, tick.sig)
    if (result === 'filed') outcome.recorded++
    else if (result === 'stale') outcome.errors[tick.key] = 'Od stiahnutia balíka sa doklady zmenili. Stiahnite balík znova a odošlite nový súbor.'
    else if (result === 'notReady') outcome.errors[tick.key] = 'Už nie je pripravené na odoslanie. Otvorte stránku firmy.'
    else if (result === 'company') outcome.errors[tick.key] = 'Doplňte firme IČ DPH a adresu.'
  }
  return outcome
}
