// The accountant's part of a year's closing: the rows of the return the books cannot know, the losses and minimum taxes
// of years before, the advances, the tax period, the company's activity. Pure: the route reads the closing page's form
// with `readClosing` and stores what comes back (closings.inputs, closing-store.ts); `closingValues` writes what is
// stored, or what the books propose, back into the form. A value equal to the books' proposal is not stored, so that it
// keeps following the books when they change; errors are codes, the page says them in words.
import { dayOfText, textDay } from './booking'
import { centsOf } from './invoices'
import { moneyText } from './vat-form'
import { naceParts } from './closing-xml'
import {
  EMPTY_INPUTS,
  LOSS_YEARS,
  MICRO_REVENUES,
  MINIMUM_CREDIT_YEARS,
  TABLE_A,
  TABLE_B,
  TYPED,
  type ClosingInputs,
  type Loss,
  type MinimumCredit,
  type Proposal,
  type TableARow,
  type TableBRow,
  type TypedRow,
} from './closing'

/** The rows of the form for losses (Table D: five periods back) and for minimum taxes to credit (Table K: three). */
export const LOSS_ROWS = LOSS_YEARS
export const CREDIT_ROWS = MINIMUM_CREDIT_YEARS

export type ClosingError = 'amount' | 'day' | 'year' | 'used' | 'nace'
export type ClosingValues = Record<string, string>
export type ClosingErrors = Partial<Record<string, ClosingError>>

/** No amount of a small company's return comes near a billion euros: anything above is a slip of the keyboard. */
const MAX = 100_000_000_000

const amountOk = (cents: unknown): cents is number => typeof cents === 'number' && Number.isInteger(cents) && cents >= 0 && cents <= MAX
const money = (cents: number): string => (cents === 0 ? '' : moneyText(cents))

/** Stored inputs, each value checked again; what is not right is dropped, and follows the books. */
export function storedInputs(json: unknown): ClosingInputs {
  if (typeof json !== 'string' || json === '') return { ...EMPTY_INPUTS }
  let raw: Record<string, unknown>
  try {
    raw = JSON.parse(json) as Record<string, unknown>
  } catch {
    return { ...EMPTY_INPUTS }
  }
  if (!raw || typeof raw !== 'object') return { ...EMPTY_INPUTS }
  const pick = <K extends string>(value: unknown, keys: readonly K[]): Partial<Record<K, number>> => {
    const out: Partial<Record<K, number>> = {}
    if (value && typeof value === 'object') for (const k of keys) if (amountOk((value as Record<string, unknown>)[k])) out[k] = (value as Record<K, number>)[k]
    return out
  }
  const years = <T extends Loss | MinimumCredit>(value: unknown): T[] =>
    Array.isArray(value)
      ? value.filter((v): v is T => !!v && Number.isInteger(v.year) && amountOk(v.amount) && v.amount > 0 && amountOk(v.usedBefore) && v.usedBefore <= v.amount).map((v) => ({ year: v.year, amount: v.amount, usedBefore: v.usedBefore }) as T)
      : []
  const day = (value: unknown): string | null => (typeof value === 'string' && dayOfText(value) === value && value !== '' ? value : null)
  const bool = (value: unknown): boolean | null => (typeof value === 'boolean' ? value : null)
  return {
    tableA: pick(raw.tableA, TABLE_A),
    tableB: pick(raw.tableB, TABLE_B),
    typed: pick(raw.typed, TYPED),
    taxable: amountOk(raw.taxable) ? raw.taxable : null,
    micro: bool(raw.micro),
    losses: years<Loss>(raw.losses),
    lossDeduct: amountOk(raw.lossDeduct) ? raw.lossDeduct : null,
    from: day(raw.from),
    minimumExempt: bool(raw.minimumExempt),
    minimumHalf: raw.minimumHalf === true,
    minimumCredits: years<MinimumCredit>(raw.minimumCredits),
    advances: amountOk(raw.advances) ? raw.advances : null,
    withheld: amountOk(raw.withheld) ? raw.withheld : 0,
    nace: typeof raw.nace === 'string' && naceParts(raw.nace) ? raw.nace : '',
    activity: typeof raw.activity === 'string' ? raw.activity.slice(0, 120) : '',
    approvedOn: day(raw.approvedOn),
  }
}

/** The first day of a year's tax period, and the minimum tax's exemption the books propose for it (a first period). */
const fromOf = (year: number, inputs: Pick<ClosingInputs, 'from'>): string => inputs.from ?? `${year}-01-01`

/** The form's values: what is stored, else what the books propose. */
export function closingValues(year: number, inputs: ClosingInputs, proposal: Proposal, found: { advances: number }): ClosingValues {
  const v: ClosingValues = {}
  for (const row of TABLE_A) v[row] = money(inputs.tableA[row] ?? proposal.tableA[row] ?? 0)
  for (const row of TABLE_B) v[row] = money(inputs.tableB[row] ?? proposal.tableB[row] ?? 0)
  for (const row of TYPED) v[row] = money(inputs.typed[row] ?? (row === 'r210' ? proposal.r210 : 0))
  const taxable = inputs.taxable ?? proposal.taxable
  v.zdanitelne = moneyText(taxable)
  v.mikro = (inputs.micro ?? taxable <= MICRO_REVENUES) ? '1' : ''
  const from = fromOf(year, inputs)
  v.od = textDay(from)
  v.oslobodena = (inputs.minimumExempt ?? from > `${year}-01-01`) ? '1' : ''
  v.polovicna = inputs.minimumHalf ? '1' : ''
  for (let i = 0; i < LOSS_ROWS; i++) {
    const l = inputs.losses[i]
    v[`strata_rok_${i}`] = l ? String(l.year) : ''
    v[`strata_suma_${i}`] = l ? moneyText(l.amount) : ''
    v[`strata_pred_${i}`] = l ? money(l.usedBefore) : ''
  }
  v.odpocet = inputs.lossDeduct === null ? '' : moneyText(inputs.lossDeduct)
  for (let i = 0; i < CREDIT_ROWS; i++) {
    const c = inputs.minimumCredits[i]
    v[`kredit_rok_${i}`] = c ? String(c.year) : ''
    v[`kredit_suma_${i}`] = c ? moneyText(c.amount) : ''
    v[`kredit_pred_${i}`] = c ? money(c.usedBefore) : ''
  }
  v.preddavky = moneyText(inputs.advances ?? found.advances)
  v.zrazena = money(inputs.withheld)
  v.nace = inputs.nace
  v.cinnost = inputs.activity
  v.schvalena = inputs.approvedOn ? textDay(inputs.approvedOn) : ''
  return v
}

/** The form read: the inputs to store (a value equal to the books' proposal left out), or what is wrong, field by field. */
export function readClosing(get: (name: string) => unknown, year: number, proposal: Proposal, found: { advances: number }): { inputs: ClosingInputs; values: ClosingValues; errors: ClosingErrors } {
  const values: ClosingValues = {}
  const errors: ClosingErrors = {}
  const text = (name: string, max = 20): string => {
    const raw = get(name)
    const value = typeof raw === 'string' ? raw.trim().slice(0, max) : ''
    values[name] = value
    return value
  }
  /** An amount of at least nought; null when empty. */
  const amount = (name: string): number | null => {
    const cents = centsOf(text(name))
    if (cents === null) return null
    if (!amountOk(cents)) {
      errors[name] = 'amount'
      return null
    }
    return cents
  }
  const yes = (name: string): boolean => {
    const on = get(name) === '1'
    values[name] = on ? '1' : ''
    return on
  }
  const inputs: ClosingInputs = { ...EMPTY_INPUTS, tableA: {}, tableB: {}, typed: {}, losses: [], minimumCredits: [] }
  for (const row of TABLE_A) {
    const cents = amount(row) ?? 0
    if (cents !== (proposal.tableA[row] ?? 0)) inputs.tableA[row as TableARow] = cents
  }
  for (const row of TABLE_B) {
    const cents = amount(row) ?? 0
    if (cents !== (proposal.tableB[row] ?? 0)) inputs.tableB[row as TableBRow] = cents
  }
  for (const row of TYPED) {
    const cents = amount(row) ?? 0
    if (cents !== (row === 'r210' ? proposal.r210 : 0)) inputs.typed[row as TypedRow] = cents
  }
  const taxable = amount('zdanitelne')
  inputs.taxable = taxable === null || taxable === proposal.taxable ? null : taxable
  const micro = yes('mikro')
  inputs.micro = micro === (taxable ?? proposal.taxable) <= MICRO_REVENUES ? null : micro
  const fromText = text('od')
  const from = dayOfText(fromText)
  if (from === null || (from !== '' && !from.startsWith(`${year}-`))) errors.od = 'day'
  inputs.from = from && from !== `${year}-01-01` && from.startsWith(`${year}-`) ? from : null
  const exempt = yes('oslobodena')
  inputs.minimumExempt = exempt === fromOf(year, inputs) > `${year}-01-01` ? null : exempt
  inputs.minimumHalf = yes('polovicna')
  /** Rows of years before (losses, minimum taxes): a year among the last `back`, an amount, what was used of it before. */
  const pastRows = (prefix: string, rows: number, back: number): Loss[] => {
    const out: Loss[] = []
    for (let i = 0; i < rows; i++) {
      const y = text(`${prefix}_rok_${i}`, 4)
      const sum = amount(`${prefix}_suma_${i}`)
      const used = amount(`${prefix}_pred_${i}`)
      if (y === '' && sum === null && used === null && !errors[`${prefix}_suma_${i}`] && !errors[`${prefix}_pred_${i}`]) continue
      const n = Number(y)
      if (!/^\d{4}$/.test(y) || n < year - back || n >= year) errors[`${prefix}_rok_${i}`] = 'year'
      if (sum === null || sum === 0) errors[`${prefix}_suma_${i}`] ??= 'amount'
      else if ((used ?? 0) > sum) errors[`${prefix}_pred_${i}`] = 'used'
      if (!errors[`${prefix}_rok_${i}`] && !errors[`${prefix}_suma_${i}`] && !errors[`${prefix}_pred_${i}`]) out.push({ year: n, amount: sum ?? 0, usedBefore: used ?? 0 })
    }
    return out.sort((a, b) => a.year - b.year)
  }
  inputs.losses = pastRows('strata', LOSS_ROWS, LOSS_YEARS)
  inputs.lossDeduct = amount('odpocet')
  inputs.minimumCredits = pastRows('kredit', CREDIT_ROWS, MINIMUM_CREDIT_YEARS)
  const advances = amount('preddavky')
  inputs.advances = advances === null || advances === found.advances ? null : advances
  inputs.withheld = amount('zrazena') ?? 0
  const nace = text('nace', 12)
  const parts = naceParts(nace)
  if (nace !== '' && !parts) errors.nace = 'nace'
  inputs.nace = parts ? `${parts.k1}.${parts.k2}.${parts.k3}` : ''
  inputs.activity = text('cinnost', 120)
  const approved = dayOfText(text('schvalena'))
  if (approved === null || (approved !== '' && approved <= `${year}-12-31`)) errors.schvalena = 'day'
  inputs.approvedOn = approved && approved > `${year}-12-31` ? approved : null
  return { inputs, values, errors }
}
