// The one-stop shop (OSS), its EU scheme (únijná schéma): goods a company sells at a distance and services it supplies
// to consumers in other member states are taxed there, at their rates, and declared in one quarterly return in
// Slovakia, which pays each state its tax. Pure: oss-store.ts loads, views/oss.tsx shows.
//
// What it leans on (read on 17 October 2026):
// - The return: a calendar quarter, by the end of the month after it, that day even when it is a Saturday or a holiday;
//   filed also when nothing was supplied; the tax of each member state of consumption by rate; in euros, an amount in
//   another currency at the ECB's rate of the quarter's last day, or the next day's when none was declared on it;
//   a change of an earlier return made in a later one, within three years; the tax paid by the same deadline with the
//   return's reference (Forvis Mazars on the rules from 1 July 2021, Art. 366 of Directive 2006/112/EC).
// - The file: the Financial Administration's schema DPOSS_EUv01 (ekr.financnasprava.sk/Formulare/XSD/dposs_eu01.xsd,
//   kept as test/xsd/dposs_eu01.xsd byte for byte, SHA-256 4f0982aa...): the EU's common OSSVATReturnMSCON of the
//   namespace urn:ec.europa.eu:taxud:frsr:vatunion:v1.0, which the OSS portal loads ("Načítanie formulára zo súboru").
//   Supplies from Slovakia only (MSIDSupplies): each by its kind (GOODS, SERVICES), state, rate (STANDARD or REDUCED)
//   and positive amounts; corrections of earlier quarters by state; each state's balance; the total due.
// - The standard rates of the member states in 2026 (vatupdate.com's table of 2026, no change in 2026): a rate of a
//   state that is not its standard one is a reduced one. Northern Ireland (XI) takes the United Kingdom's, for goods.
import type { VatLine } from './vat'
import type { Rates, RateMicro } from './fx'

export const OSS_STANDARD: Readonly<Record<string, number>> = {
  AT: 20,
  BE: 21,
  BG: 20,
  CY: 19,
  CZ: 21,
  DE: 19,
  DK: 25,
  EE: 24,
  EL: 24,
  ES: 21,
  FI: 25.5,
  FR: 20,
  HR: 25,
  HU: 27,
  IE: 23,
  IT: 22,
  LT: 21,
  LU: 17,
  LV: 21,
  MT: 18,
  NL: 21,
  PL: 23,
  PT: 23,
  RO: 21,
  SE: 25,
  SI: 22,
  XI: 20,
}

/** A supply declared in the one-stop shop: an issued document booked with the mode `oss`. */
export interface OssSupply {
  id: string
  number: string | null
  /** The day of supply (the day of issue when it names none). */
  day: string
  country: string | null
  goods: boolean
  /** In euros, at the document's rate when it is in another currency. */
  lines: VatLine[]
  currency: string
  /** The rate its euros are at (millionths), for an amount in another currency. */
  fxRate: RateMicro | null
  /** The number of the invoice a credit note corrects: it belongs to that invoice's quarter. */
  corrects: string | null
}

export interface OssLine {
  country: string
  goods: boolean
  rate: number
  standard: boolean
  base: number
  vat: number
}

export interface OssCorrection {
  quarter: string
  country: string
  cents: number
}

/** A quarter's return as it was filed: its lines and the corrections it carried. */
export interface OssFiled {
  quarter: string
  lines: OssLine[]
  corrections: OssCorrection[]
  filedOn: string
}

export type OssIssue = { code: 'country' | 'rate' | 'negative' | 'xi' | 'unbooked'; ids: string[] }

export const isQuarterText = (q: string): boolean => /^\d{4}-Q[1-4]$/.test(q)
export const quarterOfDay = (day: string): string => `${day.slice(0, 4)}-Q${Math.ceil(Number(day.slice(5, 7)) / 3)}`
export function quarterRange(q: string): { from: string; to: string } {
  const year = Number(q.slice(0, 4))
  const n = Number(q.slice(6))
  const last = new Date(Date.UTC(year, n * 3, 0)).getUTCDate()
  return { from: `${year}-${String(n * 3 - 2).padStart(2, '0')}-01`, to: `${year}-${String(n * 3).padStart(2, '0')}-${last}` }
}
export const nextQuarter = (q: string): string => (q.endsWith('Q4') ? `${Number(q.slice(0, 4)) + 1}-Q1` : `${q.slice(0, 6)}${Number(q.slice(6)) + 1}`)
export const prevQuarter = (q: string): string => (q.endsWith('Q1') ? `${Number(q.slice(0, 4)) - 1}-Q4` : `${q.slice(0, 6)}${Number(q.slice(6)) - 1}`)

/** The deadline: the last day of the month after the quarter, as it is (not moved to a working day). */
export function ossDue(q: string): string {
  const year = Number(q.slice(0, 4))
  const n = Number(q.slice(6))
  const end = new Date(Date.UTC(year, n * 3 + 1, 0))
  return end.toISOString().slice(0, 10)
}

/** The ECB's rate of the quarter's last day, or of the first day after it with one (Art. 366). */
function endRate(rates: Rates, currency: string, day: string): RateMicro | null {
  const list = rates.get(currency) ?? []
  const found = list.find(([d]) => d >= day)
  if (!found || Date.parse(`${found[0]}T00:00:00Z`) - Date.parse(`${day}T00:00:00Z`) > 10 * 86_400_000) return null
  return found[1]
}

/** The quarter a supply is declared in: its own, or a credit note's corrected invoice's. */
export function supplyQuarter(s: OssSupply, all: readonly OssSupply[]): string {
  if (s.corrects) {
    const original = all.find((x) => x.number === s.corrects && x.id !== s.id)
    if (original) return quarterOfDay(original.day)
  }
  return quarterOfDay(s.day)
}

/** A quarter's lines: each state's tax by kind and rate, in euros at the quarter's end; and what keeps them from being declared. */
export function ossLines(supplies: readonly OssSupply[], quarter: string, rates: Rates): { lines: OssLine[]; issues: OssIssue[] } {
  const end = quarterRange(quarter).to
  const groups = new Map<string, OssLine>()
  const bad: Record<OssIssue['code'], string[]> = { country: [], rate: [], negative: [], xi: [], unbooked: [] }
  for (const s of supplies) {
    if (supplyQuarter(s, supplies) !== quarter) continue
    if (!s.country || !(s.country in OSS_STANDARD)) {
      bad.country.push(s.id)
      continue
    }
    if (s.country === 'XI' && !s.goods) {
      bad.xi.push(s.id)
      continue
    }
    let scale: [bigint, bigint] | null = null
    if (s.currency !== 'EUR') {
      const at = endRate(rates, s.currency, end)
      if (!s.fxRate || !at) {
        bad.rate.push(s.id)
        continue
      }
      scale = [BigInt(s.fxRate), BigInt(at)]
    }
    const conv = (cents: number) => {
      if (!scale) return cents
      const n = BigInt(Math.abs(cents)) * scale[0]
      const q = n / scale[1]
      const r = Number(n % scale[1] >= (scale[1] + 1n) / 2n ? q + 1n : q)
      return cents < 0 ? -r : r
    }
    for (const line of s.lines) {
      const key = `${s.country}|${s.goods ? 'G' : 'S'}|${line.rate}`
      const g = groups.get(key) ?? { country: s.country, goods: s.goods, rate: line.rate, standard: line.rate === OSS_STANDARD[s.country], base: 0, vat: 0 }
      g.base += conv(line.base)
      g.vat += conv(line.vat)
      groups.set(key, g)
    }
  }
  const lines = [...groups.values()].filter((l) => l.base !== 0 || l.vat !== 0).sort((a, b) => a.country.localeCompare(b.country) || Number(a.goods) - Number(b.goods) || a.rate - b.rate)
  for (const l of lines) if (l.base < 0 || l.vat < 0) bad.negative.push(`${l.country} ${l.rate} %`)
  const issues = (Object.entries(bad) as [OssIssue['code'], string[]][]).filter(([, ids]) => ids.length > 0).map(([code, ids]) => ({ code, ids }))
  return { lines, issues }
}

/** Each state's tax of some lines. */
export function byCountry(lines: readonly OssLine[]): Map<string, number> {
  const out = new Map<string, number>()
  for (const l of lines) out.set(l.country, (out.get(l.country) ?? 0) + l.vat)
  return out
}

/**
 * The corrections a return of `quarter` carries: for each quarter filed before it, each state's tax as it stands now
 * less what was filed for it and what later returns already corrected.
 */
export function ossCorrections(quarter: string, filed: readonly OssFiled[], now: (q: string) => readonly OssLine[]): OssCorrection[] {
  const out: OssCorrection[] = []
  for (const f of [...filed].filter((x) => x.quarter < quarter).sort((a, b) => a.quarter.localeCompare(b.quarter))) {
    const was = byCountry(f.lines)
    const is = byCountry(now(f.quarter))
    const already = new Map<string, number>()
    for (const later of filed) for (const c of later.corrections) if (c.quarter === f.quarter) already.set(c.country, (already.get(c.country) ?? 0) + c.cents)
    for (const country of [...new Set([...was.keys(), ...is.keys(), ...already.keys()])].sort()) {
      const cents = (is.get(country) ?? 0) - (was.get(country) ?? 0) - (already.get(country) ?? 0)
      if (cents !== 0) out.push({ quarter: f.quarter, country, cents })
    }
  }
  return out
}

/** Each state's balance (the quarter's tax and its corrections) and the total due; a refund is minus. */
export function ossBalances(lines: readonly OssLine[], corrections: readonly OssCorrection[]): { balances: { country: string; cents: number }[]; total: number } {
  const map = byCountry(lines)
  for (const c of corrections) map.set(c.country, (map.get(c.country) ?? 0) + c.cents)
  const balances = [...map.entries()]
    .filter(([, cents]) => cents !== 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([country, cents]) => ({ country, cents }))
  return { balances, total: balances.reduce((s, b) => s + b.cents, 0) }
}

const money = (cents: number) => `${cents < 0 ? '-' : ''}${Math.floor(Math.abs(cents) / 100)}.${String(Math.abs(cents) % 100).padStart(2, '0')}`
const eur = (tag: string, cents: number) => `<${tag} currency="EUR">${money(cents)}</${tag}>`

/** The return's file (DPOSS_EUv01), for the OSS portal. `vatId` is the company's IČ DPH (SK and ten digits). */
export function ossXml(vatId: string, quarter: string, lines: readonly OssLine[], corrections: readonly OssCorrection[]): string {
  const { balances, total } = ossBalances(lines, corrections)
  const supplies = lines.map(
    (l) =>
      `<MSIDSupplies><SupplyType>${l.goods ? 'GOODS' : 'SERVICES'}</SupplyType><MSCONCountrycode>${l.country}</MSCONCountrycode><VATRate type="${l.standard ? 'STANDARD' : 'REDUCED'}">${l.rate.toFixed(2)}</VATRate>${eur('TaxableAmount', l.base)}${eur('VATAmount', l.vat)}</MSIDSupplies>`,
  )
  const fixes = corrections.map(
    (c) =>
      `<Correction><Period><Year>${c.quarter.slice(0, 4)}</Year><Quarter>${c.quarter.slice(6)}</Quarter></Period><MSCONCountryCode>${c.country}</MSCONCountryCode>${eur('TotalVATAmountCorrection', c.cents)}</Correction>`,
  )
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<OSSVATReturnMSCON xmlns="urn:ec.europa.eu:taxud:frsr:vatunion:v1.0">',
    `<TraderID><VATNumber issuedBy="SK">${vatId.replace(/^SK/, '')}</VATNumber></TraderID>`,
    `<Period><Year>${quarter.slice(0, 4)}</Year><Quarter>${quarter.slice(6)}</Quarter></Period>`,
    supplies.length > 0 ? `<Supplies>${supplies.join('')}</Supplies>` : '',
    fixes.length > 0 ? `<Corrections>${fixes.join('')}</Corrections>` : '',
    balances.length > 0 ? `<Balances>${balances.map((b) => `<Balance><MSCONCountryCode>${b.country}</MSCONCountryCode>${eur('BalanceOfVATDue', b.cents)}</Balance>`).join('')}</Balances>` : '',
    eur('TotalVATAmountDue', total),
    '</OSSVATReturnMSCON>',
    '',
  ]
    .filter((l) => l !== '')
    .join('\n')
}

export type OssState = 'running' | 'blocked' | 'ready' | 'filed' | 'changed' | 'waiting'

export interface OssView {
  quarter: string
  state: OssState
  due: string
  lines: OssLine[]
  corrections: OssCorrection[]
  balances: { country: string; cents: number }[]
  total: number
  issues: OssIssue[]
  filed: OssFiled | null
}

/**
 * A quarter's return: running until the quarter ends; waiting while a quarter before it (since the company uses the
 * scheme) is not filed, since corrections go into the next return; blocked by what keeps a line from being declared;
 * ready; filed, or changed since it was filed (the change goes into the next quarter's return).
 */
export function ossView(quarter: string, since: string, supplies: readonly OssSupply[], filed: readonly OssFiled[], rates: Rates, today: string, unbooked: readonly string[] = []): OssView {
  const now = (q: string) => ossLines(supplies, q, rates).lines
  const own = ossLines(supplies, quarter, rates)
  const done = filed.find((f) => f.quarter === quarter) ?? null
  const corrections = done ? done.corrections : ossCorrections(quarter, filed, now)
  const shown = done ? done.lines : own.lines
  const { balances, total } = ossBalances(shown, corrections)
  const issues = [...own.issues, ...(unbooked.length > 0 ? [{ code: 'unbooked' as const, ids: [...unbooked] }] : [])]
  const first = quarterOfDay(since)
  let earlierOpen = false
  for (let q = first; q < quarter; q = nextQuarter(q)) if (!filed.some((f) => f.quarter === q)) earlierOpen = true
  const state: OssState = done
    ? JSON.stringify(byCountryObject(own.lines)) !== JSON.stringify(byCountryObject(done.lines))
      ? 'changed'
      : 'filed'
    : today <= quarterRange(quarter).to
      ? 'running'
      : earlierOpen
        ? 'waiting'
        : issues.length > 0
          ? 'blocked'
          : 'ready'
  return { quarter, state, due: ossDue(quarter), lines: shown, corrections, balances, total, issues, filed: done }
}

const byCountryObject = (lines: readonly OssLine[]) => Object.fromEntries([...byCountry(lines).entries()].sort(([a], [b]) => a.localeCompare(b)))
