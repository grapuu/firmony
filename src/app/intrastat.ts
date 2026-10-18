// Intrastat-SK: the monthly statistical reports of goods moved between Slovakia and other member states, one for
// arrivals (dovoz v rámci EÚ, flow A) and one for dispatches (vývoz v rámci EÚ, flow D), sent as XML through the
// Financial Administration's portal for the Statistical Office. Pure: intrastat-store.ts loads, views/intrastat.tsx shows.
//
// What it leans on (read on 17 October 2026 on intrastat.financnasprava.sk, the pages "Všeobecné informácie",
// "Vyplňovanie hlásení" and "Formát XML správy", which carry the Statistical Office's methodical handbook for 2026):
// - Who reports: a person registered for VAT whose arrivals or dispatches from 1 October two years before to
//   30 September of the year before, or from the start of the year, exceed the threshold of exemption: 1 000 000 €
//   for each flow in 2026; 200 000 € of arrivals and 400 000 € of dispatches for a main activity of SK NACE 01, 02, 03,
//   10, 11 or 12. Each flow is watched apart; once crossed during the year, from that month on. The Statistical Office
//   notifies the obligation; a month without anything is reported as nil.
// - When: by the fifteenth calendar day after the month, the next working day when it is a Saturday, Sunday or a holiday.
//   The month of a supply to or an acquisition from another member state is the month its VAT fell due (the same as in
//   the VAT return); otherwise the month the goods moved. A quarterly VAT payer reports monthly too.
// - What: each item's goods code (8 digits of the Combined Nomenclature), the member state of dispatch or destination
//   (Greece is GR here, EL in VAT numbers), the country of origin, the net mass in whole kilograms (under 1 kg up, else
//   rounded half up), the quantity in the supplementary unit where the code has one (whole units up, else 0), the
//   value (the VAT base in euros, up to the whole euro, at least 1 €), the nature of transaction (A and B), the mode
//   of transport, the region (optional), the delivery terms, and for dispatches the partner's VAT number (QV999999999999
//   when unknown, QN999999999999 for a private person). Items with every coded field the same may be summed; a program
//   that makes the reports from its records need not.
// - An invoice below 1 000 € may be reported simply: code 9950 00 00, its value, the member state and the partner.
// - Later: transactions found after filing go into another regular report of the month (its number one higher);
//   errors are corrected by a corrective report (functionCode M) of the report they were in, its own number a series
//   of that report's corrections, each item by its original number with its right values; an item is cancelled by its
//   number, its original code and the value 0. The Statistical Office recommends correcting every error found.
// - The file: instat62.xsd (kept as test/xsd/instat62.xsd byte for byte, SHA-256 03d5dd7c...), ISO-8859-2, no
//   namespace; envelopeId in the form AAxxxxx; declarationTypeCode 1 (full); at most 30 000 items a report.
import { workingDayFrom } from './vat'

export { splitAddress } from './address'

export type Flow = 'A' | 'D'
export const FLOWS: readonly Flow[] = ['A', 'D']
export const isFlow = (value: unknown): value is Flow => value === 'A' || value === 'D'
export const isMonthText = (text: unknown): text is string => typeof text === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(text)

/** The thresholds of exemption in cents, by year (the handbook of 2026); a later year keeps the last known until its own is published. */
const THRESHOLDS: Record<number, { general: number; agriA: number; agriD: number }> = {
  2026: { general: 100_000_000, agriA: 20_000_000, agriD: 40_000_000 },
}
export function thresholdOf(year: number, flow: Flow, agri: boolean): number {
  const known = Object.keys(THRESHOLDS)
    .map(Number)
    .filter((y) => y <= year)
    .sort((a, b) => b - a)[0]
  const t = THRESHOLDS[known ?? 2026] as { general: number; agriA: number; agriD: number }
  return agri ? (flow === 'A' ? t.agriA : t.agriD) : t.general
}

/** The main activities (SK NACE divisions) of the lower thresholds. */
export const AGRI_NACE = ['01', '02', '03', '10', '11', '12'] as const

/** The member states and Northern Ireland, as Intrastat codes them. */
export const MEMBER_STATES = ['AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR', 'HU', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PL', 'PT', 'RO', 'SE', 'SI', 'XI'] as const
const STATES = new Set<string>(MEMBER_STATES)

/** A VAT number's member state as Intrastat names it (EL is GR), or null when it is no other member state's. */
export function stateOfVatId(vatId: string | null | undefined): string | null {
  const plain = (vatId ?? '').replace(/[\s.-]/g, '').toUpperCase()
  const prefix = /^([A-Z]{2})[A-Z0-9]{2,13}$/.exec(plain)?.[1] ?? null
  const state = prefix === 'EL' ? 'GR' : prefix
  return state && STATES.has(state) ? state : null
}

/** The nature of transaction (druh obchodu), A and B together; code 8 has no B. */
export const NATURES = ['11', '12', '21', '22', '23', '31', '32', '33', '34', '41', '42', '51', '52', '71', '72', '8', '91', '99'] as const
/** The mode of transport (druh dopravy). */
export const TRANSPORTS = ['2', '3', '4', '5', '7', '8', '9'] as const
/** The delivery terms (dodacie podmienky): Incoterms 2000, 2010 and 2020, XXX for other terms. */
export const TERMS = ['EXW', 'FCA', 'FAS', 'FOB', 'CFR', 'CIF', 'CPT', 'CIP', 'DAF', 'DES', 'DEQ', 'DDU', 'DAP', 'DAT', 'DPU', 'DDP', 'XXX'] as const
/** The Slovak regions (kraje), 1 Bratislavský to 8 Košický. */
export const REGIONS = ['1', '2', '3', '4', '5', '6', '7', '8'] as const

export const SIMPLIFIED_CN = '99500000'
/** An invoice below this value (cents) may be reported simply. */
export const SIMPLIFIED_LIMIT = 100_000
export const MAX_ITEMS = 30_000
/** The partner's placeholder when its VAT number is not known. */
export const UNKNOWN_PARTNER = 'QV999999999999'

const includes = <T extends string>(list: readonly T[], value: unknown): value is T => typeof value === 'string' && (list as readonly string[]).includes(value)
export const isNature = (v: unknown): v is string => includes(NATURES, v)
export const isTransport = (v: unknown): v is string => includes(TRANSPORTS, v)
export const isTerms = (v: unknown): v is string => includes(TERMS, v)
export const isRegion = (v: unknown): v is string => includes(REGIONS, v)
/** A country of origin: two capitals of the nomenclature of countries (EU itself is not one here). */
export const isOrigin = (v: unknown): v is string => typeof v === 'string' && /^[A-Z]{2}$/.test(v) && v !== 'EU' && v !== 'EL'
export const isCn = (v: unknown): v is string => typeof v === 'string' && /^\d{8}$/.test(v)
/** A partner's VAT number as the report takes it: a prefix and up to 13 more letters or digits. */
export const isPartnerId = (v: unknown): v is string => typeof v === 'string' && /^[A-Z]{2}[A-Z0-9]{2,13}$/.test(v)

// ---------------------------------------------------------------------------------------------------------------
// The company's settings and a document's goods
// ---------------------------------------------------------------------------------------------------------------

/** A company's Intrastat (companies.intrastat): the months each flow is reported from, and the usual values. */
export interface IntrastatSettings {
  arrivals: string | null
  dispatches: string | null
  /** A main activity of the lower thresholds (AGRI_NACE). */
  agri: boolean
  nature: string
  transport: string
  terms: string
  region: string | null
  /** The usual country of origin of what the company dispatches. */
  origin: string | null
  contact: string | null
  phone: string | null
  email: string | null
}

export const DEFAULT_SETTINGS: IntrastatSettings = {
  arrivals: null,
  dispatches: null,
  agri: false,
  nature: '11',
  transport: '3',
  terms: 'DAP',
  region: null,
  origin: null,
  contact: null,
  phone: null,
  email: null,
}

const text = (v: unknown, max: number): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim().slice(0, max) : null)

export function settingsOf(raw: unknown): IntrastatSettings {
  let o: Record<string, unknown> = {}
  try {
    o = typeof raw === 'string' ? (JSON.parse(raw) as Record<string, unknown>) : {}
  } catch {
    o = {}
  }
  return {
    arrivals: isMonthText(o.arrivals) ? o.arrivals : null,
    dispatches: isMonthText(o.dispatches) ? o.dispatches : null,
    agri: o.agri === true,
    nature: isNature(o.nature) ? o.nature : DEFAULT_SETTINGS.nature,
    transport: isTransport(o.transport) ? o.transport : DEFAULT_SETTINGS.transport,
    terms: isTerms(o.terms) ? o.terms : DEFAULT_SETTINGS.terms,
    region: isRegion(o.region) ? o.region : null,
    origin: isOrigin(o.origin) ? o.origin : null,
    contact: text(o.contact, 80),
    phone: text(o.phone, 30),
    email: text(o.email, 120),
  }
}

export const sinceOf = (s: IntrastatSettings, flow: Flow): string | null => (flow === 'A' ? s.arrivals : s.dispatches)

/** One kind of goods of a document, as the accountant gave it. */
export interface GoodsLine {
  cn: string
  description: string | null
  origin: string | null
  grams: number | null
  su: string | null
  /** The quantity in the supplementary unit, in thousandths (2,5 l is 2500). */
  quantity: number | null
  /** Its part of the document's value; null for the one line that takes what is left. */
  cents: number | null
}

/** What the accountant said of a document's goods (intrastat_goods.data). */
export interface DocGoods {
  lines: GoodsLine[]
  /** Reported simply (code 9950 00 00): null to follow the value (below 1 000 €). */
  simplified: boolean | null
  nature: string | null
  transport: string | null
  terms: string | null
  region: string | null
  /** The member state of dispatch or destination when it is not the partner's. */
  country: string | null
  /** The partner's VAT number (dispatches) when it is not the one on the document. */
  partner: string | null
  /** The month it is reported in when it is not the month its VAT fell due (goods moved more than two months apart). */
  month: string | null
  /** A credit note whose goods came back: reported in the other flow as a return (2/1). */
  returned: boolean
  /** Not reported: the goods did not move across the border (a chain supply, a service mistaken for goods). */
  skip: boolean
}

export const EMPTY_GOODS: DocGoods = { lines: [], simplified: null, nature: null, transport: null, terms: null, region: null, country: null, partner: null, month: null, returned: false, skip: false }

const int = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 1e13 ? v : null)

export function goodsOf(raw: unknown): DocGoods | null {
  if (typeof raw !== 'string') return null
  let o: Record<string, unknown>
  try {
    o = JSON.parse(raw) as Record<string, unknown>
  } catch {
    return null
  }
  const lines = (Array.isArray(o.lines) ? o.lines : [])
    .filter((l): l is Record<string, unknown> => typeof l === 'object' && l !== null)
    .map((l) => ({
      cn: typeof l.cn === 'string' ? l.cn : '',
      description: text(l.description, 240),
      origin: isOrigin(l.origin) ? l.origin : null,
      grams: int(l.grams),
      su: text(l.su, 12),
      quantity: int(l.quantity),
      cents: int(l.cents),
    }))
  return {
    lines,
    simplified: typeof o.simplified === 'boolean' ? o.simplified : null,
    nature: isNature(o.nature) ? o.nature : null,
    transport: isTransport(o.transport) ? o.transport : null,
    terms: isTerms(o.terms) ? o.terms : null,
    region: isRegion(o.region) ? o.region : null,
    country: typeof o.country === 'string' && STATES.has(o.country) ? o.country : null,
    partner: isPartnerId(o.partner) ? o.partner : null,
    month: isMonthText(o.month) ? o.month : null,
    returned: o.returned === true,
    skip: o.skip === true,
  }
}

// ---------------------------------------------------------------------------------------------------------------
// The items of a month
// ---------------------------------------------------------------------------------------------------------------

/** A document Intrastat reads: goods acquired from or supplied to another member state. */
export interface IntrastatDoc {
  id: string
  number: string | null
  party: string | null
  /** Goods acquired, supplied, or (triangular trade) bought by the last customer and sent here from a third state. */
  mode: 'acquisition' | 'eu_goods' | 'triangle_in'
  /** The month its VAT fell due (taxDay). */
  month: string
  /** The VAT base in euro cents, the sum of its lines; minus for a credit note. */
  cents: number
  vatId: string | null
  booked: boolean
  goods: DocGoods | null
}

/** The flow a document is reported in, or null when it is not (a credit note whose goods did not come back, or one skipped). */
export function flowOf(doc: IntrastatDoc): Flow | null {
  if (doc.goods?.skip) return null
  const own: Flow = doc.mode === 'eu_goods' ? 'D' : 'A'
  if (doc.cents < 0) return doc.goods?.returned ? (own === 'A' ? 'D' : 'A') : null
  return doc.cents === 0 ? null : own
}

export const reportMonth = (doc: IntrastatDoc): string => doc.goods?.month ?? doc.month

/** One item of a report. A simple one (code 9950 00 00) has only its value, state and partner. */
export interface Item {
  /** What it stands for, kept with a filed item: `${document}:${line}`, `${document}:s` for a simple one. */
  key: string
  docId: string
  cn: string
  description: string | null
  country: string
  origin: string | null
  kg: number | null
  su: string | null
  quantity: number | null
  euros: number
  nature: string | null
  transport: string | null
  region: string | null
  terms: string | null
  partner: string | null
}

export type IntrastatIssueCode = 'unbooked' | 'goods' | 'cn' | 'mass' | 'quantity' | 'origin' | 'values' | 'country'
export interface IntrastatIssue {
  code: IntrastatIssueCode
  ids: string[]
}

/** The value as reported: up to the whole euro, at least 1 € (cents). */
export const reportEuros = (cents: number): number => Math.max(1, Math.ceil(Math.abs(cents) / 100))
/** The net mass as reported: whole kilograms, below 1 kg up to 1, otherwise half up. */
export const reportKg = (grams: number): number => (grams <= 0 ? 0 : grams < 1000 ? 1 : Math.floor((grams + 500) / 1000))

/** Whether a document goes simply: as the accountant chose, else when its value is below 1 000 € and no goods were given. */
export function isSimple(doc: IntrastatDoc): boolean {
  const g = doc.goods
  if (g?.simplified === false) return false
  if (Math.abs(doc.cents) >= SIMPLIFIED_LIMIT) return false
  return g?.simplified === true || !g || g.lines.length === 0
}

/**
 * A month's items of one flow, one for each kind of goods of each document (none summed: they come from the books),
 * and what keeps them from being reported.
 */
export function monthItems(docs: readonly IntrastatDoc[], month: string, flow: Flow, settings: IntrastatSettings): { items: Item[]; issues: IntrastatIssue[]; docs: IntrastatDoc[] } {
  const items: Item[] = []
  const bad: Record<IntrastatIssueCode, string[]> = { unbooked: [], goods: [], cn: [], mass: [], quantity: [], origin: [], values: [], country: [] }
  const used: IntrastatDoc[] = []
  for (const doc of docs) {
    if (reportMonth(doc) !== month || flowOf(doc) !== flow) continue
    used.push(doc)
    if (!doc.booked) {
      bad.unbooked.push(doc.id)
      continue
    }
    const g = doc.goods ?? EMPTY_GOODS
    // Triangular trade: the goods came from the first supplier's state, not the seller's, so the state is typed.
    const country = g.country ?? (doc.mode === 'triangle_in' ? null : stateOfVatId(doc.vatId))
    if (!country) {
      bad.country.push(doc.id)
      continue
    }
    const partner = flow === 'D' ? (g.partner ?? (stateOfVatId(doc.vatId) ? (doc.vatId ?? '').replace(/[\s.-]/g, '').toUpperCase() : UNKNOWN_PARTNER)) : null
    const total = Math.abs(doc.cents)
    if (isSimple(doc)) {
      items.push({
        key: `${doc.id}:s`,
        docId: doc.id,
        cn: SIMPLIFIED_CN,
        description: null,
        country,
        origin: null,
        kg: null,
        su: null,
        quantity: null,
        euros: reportEuros(total),
        nature: null,
        transport: null,
        region: null,
        terms: null,
        partner,
      })
      continue
    }
    if (g.lines.length === 0) {
      bad.goods.push(doc.id)
      continue
    }
    // The lines' values: each given, or one left to take the rest; together the document's base.
    const given = g.lines.reduce((s, l) => s + (l.cents ?? 0), 0)
    const open = g.lines.filter((l) => l.cents === null).length
    const rest = total - given
    if (open > 1 || (open === 0 && rest !== 0) || (open === 1 && rest <= 0)) {
      bad.values.push(doc.id)
      continue
    }
    const returned = doc.cents < 0
    let ok = true
    const made: Item[] = []
    g.lines.forEach((l, n) => {
      // Where the goods came from: the supplier's state for what was acquired (also when it goes back), ours for what we dispatched.
      const origin = l.origin ?? (doc.mode === 'eu_goods' ? settings.origin : country)
      if (!isCn(l.cn) || l.cn === SIMPLIFIED_CN) bad.cn.push(doc.id)
      else if (l.su && l.quantity === null) bad.quantity.push(doc.id)
      else if ((l.grams === null || l.grams <= 0) && !l.su) bad.mass.push(doc.id)
      else if (!origin) bad.origin.push(doc.id)
      else {
        made.push({
          key: `${doc.id}:${n}`,
          docId: doc.id,
          cn: l.cn,
          description: l.description,
          country,
          origin,
          kg: l.grams === null ? null : reportKg(l.grams),
          su: l.su,
          quantity: l.su ? Math.ceil((l.quantity ?? 0) / 1000) : 0,
          euros: reportEuros(l.cents ?? rest),
          nature: g.nature ?? (returned ? '21' : settings.nature),
          transport: g.transport ?? settings.transport,
          region: g.region ?? settings.region,
          terms: g.terms ?? settings.terms,
          partner,
        })
        return
      }
      ok = false
    })
    if (ok) items.push(...made)
  }
  const issues = (Object.entries(bad) as [IntrastatIssueCode, string[]][]).filter(([, ids]) => ids.length > 0).map(([code, ids]) => ({ code, ids: [...new Set(ids)] }))
  return { items, issues, docs: used }
}

/** The credit notes of a month that are not reported because their goods did not come back (said, not blocking). */
export function creditNotes(docs: readonly IntrastatDoc[], month: string): IntrastatDoc[] {
  return docs.filter((d) => d.cents < 0 && !d.goods?.returned && !d.goods?.skip && reportMonth(d) === month)
}

// ---------------------------------------------------------------------------------------------------------------
// Reports filed, and what follows them
// ---------------------------------------------------------------------------------------------------------------

export type FunctionCode = 'O' | 'N' | 'M'

/** An item as it went into a report: its report's number and its own. */
export interface FiledItem extends Item {
  no: number
}

export interface Declaration {
  /** The report's number in the month (poradové číslo hlásenia); for a correction, the report it corrects. */
  id: number
  fn: FunctionCode
  /** A correction's own number in the series of corrections of its report. */
  correction: number | null
  items: FiledItem[]
}

/** What was sent at once (one file, one mark): its reports. */
export interface IntrastatFiling {
  seq: number
  filedOn: string
  envelope: number
  declarations: Declaration[]
}

/** Each item as the Statistical Office has it after every filing: the corrections applied, the cancelled gone. */
export function filedItems(filings: readonly IntrastatFiling[]): Map<string, FiledItem & { declaration: number }> {
  const out = new Map<string, FiledItem & { declaration: number }>()
  for (const f of [...filings].sort((a, b) => a.seq - b.seq))
    for (const d of f.declarations)
      for (const item of d.items) {
        if (d.fn === 'M' && item.euros === 0) out.delete(item.key)
        else out.set(item.key, { ...item, declaration: d.id })
      }
  return out
}

/** Whether two items say the same in what is reported (the description is no coded field and is left aside). */
const sameItem = (a: Item, b: Item): boolean =>
  a.cn === b.cn &&
  a.country === b.country &&
  a.origin === b.origin &&
  a.kg === b.kg &&
  (a.su ?? null) === (b.su ?? null) &&
  (a.quantity ?? null) === (b.quantity ?? null) &&
  a.euros === b.euros &&
  a.nature === b.nature &&
  a.transport === b.transport &&
  a.region === b.region &&
  a.terms === b.terms &&
  a.partner === b.partner

export interface FollowUp {
  added: Item[]
  changed: Item[]
  removed: (FiledItem & { declaration: number })[]
}

/** What changed since the month was filed: items to add, to correct and to cancel. */
export function followUpOf(filings: readonly IntrastatFiling[], items: readonly Item[]): FollowUp {
  const was = filedItems(filings)
  const now = new Map(items.map((i) => [i.key, i]))
  return {
    added: items.filter((i) => !was.has(i.key)),
    changed: items.filter((i) => {
      const w = was.get(i.key)
      return w !== undefined && !sameItem(w, i)
    }),
    removed: [...was.values()].filter((w) => !now.has(w.key)),
  }
}

export const isEmptyFollowUp = (f: FollowUp): boolean => f.added.length + f.changed.length + f.removed.length === 0

const chunks = <T>(list: readonly T[], size: number): T[][] => {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

/** The first reports of a month: as many regular ones as 30 000 items a report need, or one nil report. */
export function firstDeclarations(items: readonly Item[]): Declaration[] {
  if (items.length === 0) return [{ id: 1, fn: 'N', correction: null, items: [] }]
  return chunks(items, MAX_ITEMS).map((part, i) => ({ id: i + 1, fn: 'O', correction: null, items: part.map((item, n) => ({ ...item, no: n + 1 })) }))
}

/**
 * The reports that bring a filed month up to date: new items in further regular reports (numbered after the last), and
 * a corrective report of each report whose items changed or went (the changed with their right values, the gone with
 * their code and the value 0), numbered in the series of that report's corrections.
 */
export function followUpDeclarations(filings: readonly IntrastatFiling[], f: FollowUp): Declaration[] {
  const all = filings.flatMap((x) => x.declarations)
  const lastRegular = Math.max(0, ...all.filter((d) => d.fn !== 'M').map((d) => d.id))
  const out: Declaration[] = chunks(f.added, MAX_ITEMS).map((part, i) => ({ id: lastRegular + i + 1, fn: 'O', correction: null, items: part.map((item, n) => ({ ...item, no: n + 1 })) }))
  const was = filedItems(filings)
  const byDeclaration = new Map<number, FiledItem[]>()
  for (const item of f.changed) {
    const w = was.get(item.key)
    if (!w) continue
    byDeclaration.set(w.declaration, [...(byDeclaration.get(w.declaration) ?? []), { ...item, no: w.no }])
  }
  for (const w of f.removed) {
    const { declaration, ...item } = w
    byDeclaration.set(declaration, [...(byDeclaration.get(declaration) ?? []), { ...item, euros: 0 }])
  }
  for (const [id, items] of [...byDeclaration.entries()].sort(([a], [b]) => a - b)) {
    const before = all.filter((d) => d.fn === 'M' && d.id === id).length
    out.push({ id, fn: 'M', correction: before + 1, items: items.sort((a, b) => a.no - b.no) })
  }
  return out
}

// ---------------------------------------------------------------------------------------------------------------
// A month's state
// ---------------------------------------------------------------------------------------------------------------

export type IntrastatState = 'none' | 'running' | 'blocked' | 'ready' | 'filed' | 'changed'

const nextMonthOf = (month: string): string => {
  const [y, m] = month.split('-').map(Number) as [number, number]
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
}
export const monthEnd = (month: string): string => {
  const [y, m] = month.split('-').map(Number) as [number, number]
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
}

/** The deadline: the fifteenth calendar day after the month, the next working day when it is none. */
export const intrastatDue = (month: string): string => workingDayFrom(`${nextMonthOf(month)}-15`)

/** Whether a flow is reported in a month (the Statistical Office's notice, as the company's settings say it). */
export const obliged = (settings: IntrastatSettings, flow: Flow, month: string): boolean => {
  const since = sinceOf(settings, flow)
  return since !== null && month >= since
}

export interface IntrastatView {
  month: string
  flow: Flow
  state: IntrastatState
  due: string
  items: Item[]
  issues: IntrastatIssue[]
  /** The documents of the month and flow. */
  docs: IntrastatDoc[]
  credits: IntrastatDoc[]
  filings: IntrastatFiling[]
  followUp: FollowUp | null
}

/**
 * A month of one flow: not reported (the company is not obliged), running until the month ends, blocked by what keeps
 * an item from being reported, ready; filed, or changed since (then a supplementary and a corrective report follow).
 */
export function intrastatView(docs: readonly IntrastatDoc[], month: string, flow: Flow, settings: IntrastatSettings, filings: readonly IntrastatFiling[], today: string): IntrastatView {
  const { items, issues, docs: used } = monthItems(docs, month, flow, settings)
  const own = [...filings].sort((a, b) => a.seq - b.seq)
  const followUp = own.length > 0 ? followUpOf(own, items) : null
  const state: IntrastatState =
    own.length > 0
      ? followUp && !isEmptyFollowUp(followUp)
        ? 'changed'
        : 'filed'
      : !obliged(settings, flow, month)
        ? 'none'
        : today <= monthEnd(month)
          ? 'running'
          : issues.length > 0
            ? 'blocked'
            : 'ready'
  return {
    month,
    flow,
    state,
    due: intrastatDue(month),
    items,
    issues,
    docs: used,
    credits: creditNotes(docs, month).filter((d) => (d.mode === 'eu_goods' ? 'D' : 'A') === flow),
    filings: own,
    followUp,
  }
}

/** The reports a file would carry now: the first ones of a ready month, or what follows a changed one; null when there is nothing to send. */
export function declarationsToSend(view: IntrastatView): Declaration[] | null {
  if (view.issues.length > 0) return null
  if (view.state === 'ready') return firstDeclarations(view.items)
  if (view.state === 'changed' && view.followUp) return followUpDeclarations(view.filings, view.followUp)
  return null
}

// ---------------------------------------------------------------------------------------------------------------
// The threshold
// ---------------------------------------------------------------------------------------------------------------

export interface ThresholdWatch {
  flow: Flow
  limit: number
  /** From 1 October two years before to 30 September of the year before (cents). */
  window: number
  /** From the start of the year to the month asked (cents). */
  year: number
  /** The month the obligation starts by these figures (January when the window was above), or null. */
  from: string | null
}

/** What the books say of a flow's threshold in a year, up to a month: the window before the year and the year so far. */
export function thresholdWatch(docs: readonly IntrastatDoc[], flow: Flow, month: string, agri: boolean): ThresholdWatch {
  const y = Number(month.slice(0, 4))
  const limit = thresholdOf(y, flow, agri)
  const byMonth = new Map<string, number>()
  for (const d of docs) if (d.booked && flowOf(d) === flow) byMonth.set(reportMonth(d), (byMonth.get(reportMonth(d)) ?? 0) + Math.abs(d.cents))
  let window = 0
  for (const [m, cents] of byMonth) if (m >= `${y - 2}-10` && m <= `${y - 1}-09`) window += cents
  let year = 0
  let from: string | null = window > limit ? `${y}-01` : null
  for (let m = `${y}-01`; m <= month; m = nextMonthOf(m)) {
    year += byMonth.get(m) ?? 0
    if (!from && year > limit) from = m
  }
  return { flow, limit, window, year, from }
}

// ---------------------------------------------------------------------------------------------------------------
// The file
// ---------------------------------------------------------------------------------------------------------------

/** The reporting unit (spravodajská jednotka) as the file names it. */
export interface Psi {
  vatId: string
  name: string
  street: string
  postal: string | null
  city: string | null
  /** The whole address, for the contact person's. */
  address: string
  contact: string | null
  phone: string | null
  email: string | null
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
const el = (tag: string, value: string | number | null | undefined) => (value === null || value === undefined || value === '' ? '' : `<${tag}>${esc(String(value))}</${tag}>`)

function itemXml(item: FiledItem, flow: Flow, fn: FunctionCode): string {
  const simple = item.cn === SIMPLIFIED_CN
  const cancelled = fn === 'M' && item.euros === 0
  const lines = [`<itemNumber>${item.no}</itemNumber>`]
  lines.push(`<CN8><CN8Code>${item.cn}</CN8Code>${!simple && !cancelled && item.su ? el('SUCode', item.su) : ''}</CN8>`)
  if (!simple && !cancelled) lines.push(el('goodsDescription', item.description))
  lines.push(el('MSConsDestCode', item.country))
  if (!simple && !cancelled) {
    lines.push(el('countryOfOriginCode', item.origin), el('netMass', item.kg), `<quantityInSU>${item.quantity ?? 0}</quantityInSU>`)
  }
  lines.push(`<invoicedAmount>${item.euros}</invoicedAmount>`)
  if (!simple && !cancelled) {
    const nature = item.nature ?? ''
    lines.push(nature ? `<NatureOfTransaction>${el('natureOfTransactionACode', nature.slice(0, 1))}${el('natureOfTransactionBCode', nature.slice(1))}</NatureOfTransaction>` : '')
    lines.push(el('modeOfTransportCode', item.transport), el('regionCode', item.region), item.terms ? `<DeliveryTerms>${el('TODCode', item.terms)}</DeliveryTerms>` : '')
  }
  if (flow === 'D' && !cancelled) lines.push(el('partnerId', item.partner))
  return `<Item>${lines.join('')}</Item>`
}

/** The file for the portal: one envelope with the reports of a month and flow. Text; `latin2` makes its bytes. */
export function instatXml(psi: Psi, month: string, flow: Flow, declarations: readonly Declaration[], envelope: number, created: { date: string; time: string }): string {
  const party = (type: 'sender' | 'PSI', contact: boolean) =>
    `<Party partyType="PSI" partyRole="${type}"><partyId>${esc(psi.vatId)}</partyId><partyName>${esc(psi.name)}</partyName><Address><streetName>${esc(psi.street)}</streetName>${el('postalCode', psi.postal)}${el('cityName', psi.city)}</Address>${
      contact && psi.contact
        ? `<ContactPerson><contactPersonName>${esc(psi.contact)}</contactPersonName><Address><streetName>${esc(psi.address)}</streetName>${el('phoneNumber', psi.phone)}${el('e-mail', psi.email)}</Address></ContactPerson>`
        : ''
    }</Party>`
  const decl = declarations.map((d) =>
    [
      '<Declaration>',
      `<declarationId>${d.id}</declarationId>`,
      `<referencePeriod>${month}</referencePeriod>`,
      `<PSIId>${esc(psi.vatId)}</PSIId>`,
      party('PSI', true),
      `<Function><functionCode>${d.fn}</functionCode>${d.fn === 'M' ? `<previousDeclarationId>${d.correction ?? 1}</previousDeclarationId>` : ''}</Function>`,
      '<declarationTypeCode>1</declarationTypeCode>',
      `<flowCode>${flow}</flowCode>`,
      '<currencyCode>EUR</currencyCode>',
      ...d.items.map((i) => itemXml(i, flow, d.fn)),
      d.fn === 'N' ? '' : `<totalNumberLines>${d.items.length}</totalNumberLines><totalNumberDetailedLines>${d.items.length}</totalNumberDetailedLines>`,
      '</Declaration>',
    ].join(''),
  )
  return [
    '<?xml version="1.0" encoding="ISO-8859-2"?>',
    '<INSTAT xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="instat62.xsd">',
    '<Envelope>',
    `<envelopeId>AA${String(envelope).padStart(5, '0')}</envelopeId>`,
    `<DateTime><date>${created.date}</date><time>${created.time}</time></DateTime>`,
    party('sender', false),
    '<softwareUsed>Firmony</softwareUsed>',
    ...decl,
    `<numberOfDeclarations>${declarations.length}</numberOfDeclarations>`,
    '</Envelope>',
    '</INSTAT>',
    '',
  ].join('\n')
}

/** ISO-8859-2 from 0xA0 to 0xFF, as Unicode. */
const LATIN2_HIGH = ' Ą˘Ł¤ĽŚ§¨ŠŞŤŹ­ŽŻ°ą˛ł´ľśˇ¸šşťź˝žż' + 'ŔÁÂĂÄĹĆÇČÉĘËĚÍÎĎĐŃŇÓÔŐÖ×ŘŮÚŰÜÝŢß' + 'ŕáâăäĺćçčéęëěíîďđńňóôőö÷řůúűüýţ˙'
const LATIN2 = new Map<string, number>([...LATIN2_HIGH].map((ch, i) => [ch, 0xa0 + i]))

/** A text as ISO-8859-2 bytes: a letter it lacks loses its accent, anything else becomes "?". */
export function latin2(textIn: string): Uint8Array {
  const out: number[] = []
  for (const ch of textIn) {
    const code = ch.codePointAt(0) ?? 63
    if (code < 0x80) out.push(code)
    else if (LATIN2.has(ch)) out.push(LATIN2.get(ch) as number)
    else {
      const plain = ch.normalize('NFD').replace(/[̀-ͯ]/g, '')
      const p = plain.codePointAt(0) ?? 63
      out.push(plain.length === 1 && p < 0x80 ? p : (LATIN2.get(plain) ?? 63))
    }
  }
  return new Uint8Array(out)
}
