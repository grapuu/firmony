// "Skontrolovať" on the overview (his word of 29 October 2026): Claude reads the overview and says, in a few points, what
// burns, what to manage this week, what is new and what goes well. It is given a copy without names: firms are K1, K2...,
// no person, no e-mail, no text of a message, only counts, plans and states (snapshotOf). Its answer comes through a
// forced tool, and a point is shown only when every number in it is one of the copy's and every firm it names is one of
// the copy's (guarded); a point that fails is left out and counted. Names are put back here, on our side.
import { MONY } from '../assistant/mony'
import { costUsd } from '../analytics/model'
import { bratislava } from '../app/remind'
import { ALARM_LABELS, FRESH_LABELS, VOLUME_LABELS, type AlarmKey, type Overview } from './overview'
import type { UsageState } from './plan-usage'

export const CHECK = {
  model: 'claude-haiku-5-5',
  tool: 'firmony_prehlad',
  maxTokens: 3000,
  ms: 45_000,
  points: 8,
  /** Checks a day for one administrator, and the seconds between two. */
  perDay: 20,
  gapSeconds: 30,
  /** How long a check is kept. */
  keepDays: 180,
} as const

export type CheckLevel = 'hori' | 'pozor' | 'dobre' | 'info'
export const CHECK_LEVELS: readonly CheckLevel[] = ['hori', 'pozor', 'dobre', 'info']

/** Where a point leads: an alarm's own place, or a section of the overview. */
export type CheckWhere = AlarmKey | 'baliky' | 'nove' | 'objem' | 'staznosti'
const SECTIONS = ['baliky', 'nove', 'objem', 'staznosti'] as const

export interface CheckPoint {
  level: CheckLevel
  title: string
  detail: string
  where: CheckWhere
}

export interface CheckResult {
  summary: string | null
  points: CheckPoint[]
  /** Points left out because a number or a firm in them was not in the data. */
  dropped: number
  model: string
  input: number
  output: number
}

const STATE_WORDS: Record<UsageState, string> = { ok: 'v limite', near: 'blízko limitu', over: 'nad balíkom', agree: 'nad najvyšším balíkom' }

/** The copy Claude reads: what the overview says, with each firm as a key and nothing that names a person. */
export function snapshotOf(o: Overview): { data: Record<string, unknown>; names: Map<string, string> } {
  const keys = new Map<string, string>()
  const names = new Map<string, string>()
  const key = (firm: { id: string; name: string }) => {
    let k = keys.get(firm.id)
    if (!k) {
      k = `K${keys.size + 1}`
      keys.set(firm.id, k)
      names.set(k, firm.name)
    }
    return k
  }
  const clock = bratislava(o.at * 1000)
  const days = (since: number | null | undefined) => (since ? Math.max(0, Math.floor((o.at - since) / 86400)) : null)
  const alarm = (a: Overview['alarms'][number]) => ({
    kluc: a.key,
    popis: ALARM_LABELS[a.key],
    pocet: a.n,
    ...(a.firms.length ? { firmy: a.firms.slice(0, 12).map(key) } : {}),
    ...(days(a.since) !== null ? { najstarsie_pred_dnami: days(a.since) } : {}),
  })
  const plans = o.plans.map(({ company, usage, tariff }) => ({
    firma: key(company),
    balik: usage.plan.name,
    limit_dokladov: usage.limit,
    doklady_tento_mesiac: usage.docs,
    stav: STATE_WORDS[usage.state],
    vyuctujeme_ako: usage.billedAs.name,
    priplatok_eur: usage.extraCents / 100,
    odhad_dokladov_na_mesiac: usage.projected,
    ...(usage.free ? { prvy_mesiac_zdarma: true } : {}),
    ...(tariff === 'pricelist' || tariff === 'corrupt' ? { ceny_treba_overit: true } : {}),
    predosle_mesiace: usage.history.map((h) => ({ mesiac: h.month, doklady: h.docs, nad_balikom: h.over })),
    ponuknut_balik: usage.offer?.name ?? null,
  }))
  const level = (l: string) => o.alarms.filter((a) => a.level === l)
  const data = {
    dnes: o.today,
    cas: `${String(clock.hour).padStart(2, '0')}:${String(clock.minute).padStart(2, '0')}`,
    nove_za_hodin: o.hours,
    hori: level('hori').map(alarm),
    pozor: level('pozor').map(alarm),
    na_vedomie: level('info').map(alarm),
    nove: o.fresh.map((f) => ({ kluc: f.key, popis: FRESH_LABELS[f.key], pocet: f.n })),
    objem: o.volumes.map((v) => ({ kluc: v.key, popis: VOLUME_LABELS[v.key], pocet: v.n })),
    baliky: plans,
    staznosti: o.complaints.map((c) => ({ firma: key(c.firm), sprav: c.n, pred_dnami: days(c.last) })),
    sucty: {
      veci_hori: level('hori').length,
      veci_pozor: level('pozor').length,
      klientov_nad_balikom: o.plans.filter((p) => p.usage.state === 'over' || p.usage.state === 'agree').length,
      klientov_blizko_limitu: o.plans.filter((p) => p.usage.state === 'near').length,
      klientov_s_balikom: o.plans.length,
      priplatky_eur_spolu: o.plans.reduce((s, p) => s + p.usage.extraCents, 0) / 100,
    },
  }
  return { data, names }
}

const SYSTEM = `Si prevádzkový analytik spoločnosti Firmony (online účtovníctvo pre slovenské s. r. o., prevádzkuje europio s. r. o.). Dostaneš JSON so stavom firmy práve teraz. Napíš majiteľovi krátky prehľad: čo horí, čo treba stihnúť tento týždeň, čo je nové a čo ide dobre.
Pravidlá:
1. Píš len to, čo je v údajoch. Nič nedomýšľaj a neodhaduj.
2. Každé číslo opíš presne tak, ako je v údajoch. Nepočítaj nové súčty, rozdiely ani percentá; súčty nájdeš v poli "sucty".
3. Firmy označuj presne ich kľúčom (K1, K2 …) tak, ako sú v údajoch. Iné mená nepíš.
4. Najviac ${CHECK.points} bodov, od najdôležitejšieho. Úroveň: hori = treba konať dnes, pozor = tento týždeň, dobre = niečo ide dobre, info = na vedomie.
5. Klient nad balíkom: povedz, ako mu mesiac vyúčtujeme (vyuctujeme_ako) a vyšší balík odporuč len vtedy, keď je v poli ponuknut_balik.
6. Pole "kde" je kľúč (kluc) položky, o ktorej bod hovorí, alebo sekcia: baliky, nove, objem, staznosti.
7. Spisovná slovenčina, krátke vety, bez pomlčiek. Ak nič nehorí, povedz to v zhrnutí jednou vetou.`

/** Every number a text says, as a value: "1 234", "12,50", "80 %" are 1234, 12.5 and 80. Firm keys are not numbers. */
export function numbersIn(text: string): number[] {
  const out: number[] = []
  for (const m of text.replace(/\bK\d+\b/g, ' ').matchAll(/\d+(?:[   ]\d{3})*(?:[.,]\d+)?/g)) {
    const value = Number(m[0].replace(/[   ]/g, '').replace(',', '.'))
    if (Number.isFinite(value)) out.push(value)
  }
  return out
}

/** Whether every number and every firm key of a text is one of the data's. */
export function grounded(text: string, allowed: readonly number[], names: ReadonlyMap<string, string>): boolean {
  for (const k of text.match(/\bK\d+\b/g) ?? []) if (!names.has(k)) return false
  return numbersIn(text).every((n) => allowed.some((a) => Math.abs(a - n) < 0.005))
}

/** The numbers a check may say: every number of the copy, and the parts of today's date and time. */
export function allowedNumbers(data: Record<string, unknown>): number[] {
  return [...new Set(numbersIn(JSON.stringify(data).replace(/"[a-z_ěščřžýáíéúůäôňťľĺŕ]+":/gi, ' ')))]
}

const named = (text: string, names: ReadonlyMap<string, string>) => text.replace(/\bK\d+\b/g, (k) => names.get(k) ?? k)
const clip = (value: unknown, max: number) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '')

/** Reads the forced tool's answer, keeps what is grounded and puts the firms' names back. */
export function readAnswer(input: unknown, data: Record<string, unknown>, names: ReadonlyMap<string, string>, alarmKeys: readonly AlarmKey[]): { summary: string | null; points: CheckPoint[]; dropped: number } {
  const allowed = allowedNumbers(data)
  const body = (input ?? {}) as { zhrnutie?: unknown; body?: unknown }
  const wheres = new Set<string>([...alarmKeys, ...SECTIONS])
  let dropped = 0
  const points: CheckPoint[] = []
  for (const raw of Array.isArray(body.body) ? body.body.slice(0, CHECK.points) : []) {
    const p = (raw ?? {}) as { uroven?: unknown; nazov?: unknown; detail?: unknown; kde?: unknown }
    const level = CHECK_LEVELS.find((l) => l === p.uroven)
    const title = clip(p.nazov, 120)
    const detail = clip(p.detail, 500)
    if (!level || !title || !grounded(`${title} ${detail}`, allowed, names)) {
      dropped++
      continue
    }
    const where = (typeof p.kde === 'string' && wheres.has(p.kde) ? p.kde : 'objem') as CheckWhere
    points.push({ level, title: named(title, names), detail: named(detail, names), where })
  }
  const summary = clip(body.zhrnutie, 500)
  const ok = summary && grounded(summary, allowed, names)
  if (summary && !ok) dropped++
  return { summary: ok ? named(summary, names) : null, points, dropped }
}

/** Asks Claude, once; null when it does not answer as asked (no key, a refusal, a timeout, something else than the tool). */
export async function checkOverview(key: string, overview: Overview, send: typeof fetch = fetch): Promise<CheckResult | null> {
  const { data, names } = snapshotOf(overview)
  const alarmKeys = overview.alarms.map((a) => a.key)
  try {
    const response = await send('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': MONY.version, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: CHECK.model,
        max_tokens: CHECK.maxTokens,
        system: SYSTEM,
        tools: [
          {
            name: CHECK.tool,
            description: 'Vráti prehľad stavu firmy pre majiteľa.',
            input_schema: {
              type: 'object',
              properties: {
                zhrnutie: { type: 'string', description: 'Jedna až dve vety o tom, ako firma stojí.' },
                body: {
                  type: 'array',
                  maxItems: CHECK.points,
                  items: {
                    type: 'object',
                    properties: {
                      uroven: { type: 'string', enum: [...CHECK_LEVELS] },
                      nazov: { type: 'string', description: 'Krátky nadpis bodu.' },
                      detail: { type: 'string', description: 'Jedna až dve vety: čo to je a čo urobiť.' },
                      kde: { type: 'string', enum: [...new Set([...alarmKeys, ...SECTIONS])] },
                    },
                    required: ['uroven', 'nazov', 'detail', 'kde'],
                    additionalProperties: false,
                  },
                },
              },
              required: ['zhrnutie', 'body'],
              additionalProperties: false,
            },
          },
        ],
        tool_choice: { type: 'tool', name: CHECK.tool },
        messages: [{ role: 'user', content: `Stav firmy (JSON):\n${JSON.stringify(data)}` }],
      }),
      signal: AbortSignal.timeout(CHECK.ms),
    })
    if (!response.ok) {
      await response.body?.cancel()
      return null
    }
    const text = await response.text()
    if (text.length > 200_000) return null
    const body = JSON.parse(text) as { content?: { type?: string; name?: string; input?: unknown }[]; usage?: Record<string, number> }
    const tool = body.content?.find((part) => part.type === 'tool_use' && part.name === CHECK.tool)
    if (!tool) return null
    const answer = readAnswer(tool.input, data, names, alarmKeys)
    const n = (v: unknown) => (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : 0)
    return { ...answer, model: CHECK.model, input: n(body.usage?.input_tokens), output: n(body.usage?.output_tokens) }
  } catch {
    return null
  }
}

export interface StoredCheck extends CheckResult {
  id: string
  at: number
  userId: string
}

export function saveCheckStatements(db: D1Database, check: StoredCheck): D1PreparedStatement[] {
  return [
    db.prepare('DELETE FROM admin_checks WHERE at < ?').bind(check.at - CHECK.keepDays * 86400),
    db
      .prepare('INSERT INTO admin_checks (id, at, user_id, model, input_tokens, output_tokens, result) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(check.id, check.at, check.userId, check.model, check.input, check.output, JSON.stringify({ summary: check.summary, points: check.points, dropped: check.dropped })),
  ]
}

export async function lastCheck(db: D1Database): Promise<StoredCheck | null> {
  const row = await db.prepare('SELECT id, at, user_id, model, input_tokens, output_tokens, result FROM admin_checks ORDER BY at DESC LIMIT 1').first<Record<string, unknown>>()
  if (!row) return null
  try {
    const r = JSON.parse(String(row.result)) as { summary: string | null; points: CheckPoint[]; dropped: number }
    return {
      id: String(row.id),
      at: Number(row.at),
      userId: String(row.user_id),
      model: String(row.model),
      input: Number(row.input_tokens ?? 0),
      output: Number(row.output_tokens ?? 0),
      summary: typeof r.summary === 'string' ? r.summary : null,
      points: Array.isArray(r.points) ? r.points.filter((p) => CHECK_LEVELS.includes(p.level) && typeof p.title === 'string') : [],
      dropped: Number(r.dropped ?? 0),
    }
  } catch {
    return null
  }
}

/** What a check cost, in US dollars. */
export const checkUsd = (c: Pick<CheckResult, 'input' | 'output'>) => costUsd(c.input, c.output)
