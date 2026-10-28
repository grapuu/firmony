// The sanctions lists kept by the app (aml/sanctions.ts): read once a day by the schedule from their publishers, kept in
// R2 as the subjects the screening needs, with a row in sanction_lists saying when, which day's list, how many subjects
// and the SHA-256 of what was kept. A list that could not be read is said with its error; a list older than a day and a
// half is never used for a proposal, so a check is never prepared from a stale list. The proposals are prepared texts
// for the designated person's own check (the AML dossier, the s. r. o. for 1 €): he reads them and records them.
import { now, sha256Hex } from '../db'
import { textDay } from '../app/booking'
import { bratislavaClock, bratislavaDay } from '../time'
import { formatCount } from '../format'
import { birthYear, parseList, screen, SANCTION_SOURCES, type Hit, type SanctionEntry, type SanctionList, type Subject } from './sanctions'
import type { Declaration } from '../app/aml'

export const SANCTIONS = {
  /** A list is read again a day after it was read; the publishers change them once a day at most. */
  everySeconds: 20 * 3600,
  /** A list that could not be read is tried again after an hour. */
  retrySeconds: 3600,
  /** A list older than this is not used for a proposal. */
  freshSeconds: 36 * 3600,
} as const

export const LISTS: readonly SanctionList[] = ['eu', 'un']
const KEY = (list: SanctionList) => `aml/sanctions/${list}.json`

export interface ListState {
  list: SanctionList
  fetchedAt: number | null
  generated: string | null
  entries: number | null
  sha256: string | null
  triedAt: number
  error: string | null
}

export async function listStates(db: D1Database): Promise<Partial<Record<SanctionList, ListState>>> {
  const rows = await db.prepare('SELECT * FROM sanction_lists').all<Record<string, unknown>>()
  const out: Partial<Record<SanctionList, ListState>> = {}
  for (const r of rows.results) {
    const list = r.list === 'un' ? 'un' : 'eu'
    out[list] = {
      list,
      fetchedAt: typeof r.fetched_at === 'number' ? r.fetched_at : null,
      generated: typeof r.generated === 'string' ? r.generated : null,
      entries: typeof r.entries === 'number' ? r.entries : null,
      sha256: typeof r.sha256 === 'string' ? r.sha256 : null,
      triedAt: Number(r.tried_at ?? 0),
      error: typeof r.error === 'string' ? r.error : null,
    }
  }
  return out
}

/** Reads every list whose day has come, one after the other; one that fails is said in its row and tried in an hour. */
export async function refreshSanctionLists(env: { DB: D1Database; FILES?: R2Bucket }, at: number = Date.now(), fetcher: typeof fetch = fetch): Promise<void> {
  if (!env.FILES) return
  const ts = Math.floor(at / 1000)
  const states = await listStates(env.DB)
  for (const list of LISTS) {
    const s = states[list]
    if (s?.fetchedAt && s.fetchedAt > ts - SANCTIONS.everySeconds) continue
    if (s && s.triedAt > ts - SANCTIONS.retrySeconds) continue
    try {
      const res = await fetcher(SANCTION_SOURCES[list].url, { redirect: 'follow', headers: { accept: 'application/xml, text/xml', 'user-agent': 'Firmony AML screening (ahoj@firmony.io)' } })
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`)
      const parsed = await parseList(list, res.body)
      if (parsed.entries.length < SANCTION_SOURCES[list].min) throw new Error(`neúplný súbor: ${parsed.entries.length} subjektov`)
      const json = JSON.stringify({ list, fetchedAt: ts, generated: parsed.generated, entries: parsed.entries })
      const sha = await sha256Hex(json)
      await env.FILES.put(KEY(list), json, { httpMetadata: { contentType: 'application/json' } })
      await env.DB.prepare(
        `INSERT INTO sanction_lists (list, fetched_at, generated, entries, sha256, tried_at, error) VALUES (?1, ?2, ?3, ?4, ?5, ?2, NULL)
         ON CONFLICT(list) DO UPDATE SET fetched_at = excluded.fetched_at, generated = excluded.generated, entries = excluded.entries, sha256 = excluded.sha256, tried_at = excluded.tried_at, error = NULL`,
      )
        .bind(list, ts, parsed.generated, parsed.entries.length, sha)
        .run()
      cache.set(list, { sha, entries: parsed.entries })
    } catch (err) {
      const message = (err instanceof Error ? err.message : 'chyba').slice(0, 300)
      await env.DB.prepare('INSERT INTO sanction_lists (list, tried_at, error) VALUES (?1, ?2, ?3) ON CONFLICT(list) DO UPDATE SET tried_at = excluded.tried_at, error = excluded.error')
        .bind(list, ts, message)
        .run()
    }
  }
}

/** The kept subjects of a list, read from R2 once an isolate and only while their hash is the row's. */
const cache = new Map<SanctionList, { sha: string; entries: SanctionEntry[] }>()
async function entriesOf(files: R2Bucket, state: ListState): Promise<SanctionEntry[] | null> {
  if (!state.sha256) return null
  const kept = cache.get(state.list)
  if (kept?.sha === state.sha256) return kept.entries
  const object = await files.get(KEY(state.list))
  if (!object) return null
  const text = await object.text()
  if ((await sha256Hex(text)) !== state.sha256) return null
  const entries = (JSON.parse(text) as { entries: SanctionEntry[] }).entries
  cache.set(state.list, { sha: state.sha256, entries })
  return entries
}

export interface Proposal {
  /** The result to preselect: 'clear' only when nothing on the list is that subject, 'high' for a country of high
   *  risk; '' leaves it to the person. */
  result: 'clear' | 'high' | ''
  /** The text of the check, its source and what was compared, to record as it stands or edited. */
  source: string
}
/** A list's proposal, or why there is none (never read, read with an error, too old). */
export type ListProposal = { proposal: Proposal } | { missing: string }

const when = (seconds: number) => `${textDay(bratislavaDay(seconds))} ${bratislavaClock(seconds)}`
const who = (s: Subject) => `${s.role} ${s.name}${s.year ? ` (nar. ${s.year})` : ''}`
const listed = (h: Hit) => `${h.ref} ‚${h.name}‘${h.years.length ? ` (nar. ${h.years.slice(0, 3).join(', ')})` : ''}`

/** Screens the subjects against each list and writes the check as the designated person would record it. */
export async function sanctionProposals(env: { DB: D1Database; FILES?: R2Bucket }, subjects: Subject[], at: number = Date.now()): Promise<Record<SanctionList, ListProposal>> {
  const out = {} as Record<SanctionList, ListProposal>
  const states = await listStates(env.DB)
  const ts = Math.floor(at / 1000)
  for (const list of LISTS) {
    const s = states[list]
    if (!env.FILES || !s?.fetchedAt) {
      out[list] = { missing: s?.error ? `Zoznam sa zatiaľ nepodarilo načítať (${s.error}). Kontrolu urobte ručne.` : 'Zoznam ešte nebol načítaný. Kontrolu urobte ručne.' }
      continue
    }
    if (s.fetchedAt < ts - SANCTIONS.freshSeconds) {
      out[list] = { missing: `Posledný načítaný zoznam je z ${when(s.fetchedAt)}, teda starší ako deň a pol${s.error ? ` (posledný pokus: ${s.error})` : ''}. Kontrolu urobte ručne.` }
      continue
    }
    const entries = await entriesOf(env.FILES, s)
    if (!entries) {
      out[list] = { missing: 'Uložený zoznam sa nezhoduje so záznamom o jeho načítaní. Kontrolu urobte ručne.' }
      continue
    }
    const hits = screen(subjects, entries)
    const real = hits.filter((h) => !h.otherYear)
    const apart = hits.filter((h) => h.otherYear)
    const parts = [
      `Automatické porovnanie vo Firmony ${when(ts)} so zoznamom: ${SANCTION_SOURCES[list].title}${s.generated ? `, vydaný ${textDay(s.generated)}` : ''}, načítaný ${when(s.fetchedAt)}, ${formatCount(s.entries ?? entries.length).replace(/ /g, ' ')} subjektov, SHA-256 ${s.sha256!.slice(0, 16)}, zdroj ${SANCTION_SOURCES[list].url.split('?')[0]}.`,
      `Porovnané mená bez diakritiky a veľkosti písmen: ${subjects.map(who).join('; ')}.`,
      real.length ? `MOŽNÁ ZHODA, posúďte podľa ďalších údajov v zozname: ${real.slice(0, 6).map((h) => `${listed(h)} (podobné meno: ${who(h.subject)})`).join('; ')}.` : 'Výsledok: bez zhody.',
      apart.length ? `Zhoda mena vylúčená iným rokom narodenia: ${apart.slice(0, 6).map((h) => `${listed(h)} (podobné meno: ${who(h.subject)})`).join('; ')}.` : '',
    ]
    out[list] = { proposal: { result: real.length ? '' : 'clear', source: parts.filter(Boolean).join(' ').slice(0, 2000) } }
  }
  return out
}

/** The people and the company of a declaration, as the screening compares them. */
export function declarationSubjects(d: Declaration, company: string | null): Subject[] {
  const people: Subject[] = [{ role: 'konateľ', name: d.director.name, kind: 'p', year: birthYear(d.director.birthDate, d.director.birthNumber) }]
  for (const o of d.owners) if (o.name.trim()) people.push({ role: 'konečný užívateľ výhod', name: o.name, kind: 'p', year: birthYear(o.birthDate, o.birthNumber) })
  if (d.ownBehalf === false && d.principal?.name)
    people.push(d.principal.kind === 'company' ? { role: 'zastúpený', name: d.principal.name, kind: 'e' } : { role: 'zastúpený', name: d.principal.name, kind: 'p', year: birthYear(d.principal.birthDate, d.principal.birthNumber) })
  if (company) people.push({ role: 'firma', name: company, kind: 'e' })
  return people
}

/** What /healthz says of the lists: the day of the list each one holds, or null; nothing of any client. */
export async function listsHealth(db: D1Database): Promise<Record<SanctionList, string | null>> {
  const states = await listStates(db)
  const ts = now()
  const day = (s: ListState | undefined) => (s?.fetchedAt && s.fetchedAt > ts - SANCTIONS.freshSeconds ? (s.generated ?? bratislavaDay(s.fetchedAt)) : null)
  return { eu: day(states.eu), un: day(states.un) }
}
