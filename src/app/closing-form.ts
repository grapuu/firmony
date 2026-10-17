// The accountant's part of a year's closing: the rows of the return the books cannot know, the losses and minimum taxes
// of years before, the advances, the tax period, the company's activity. Pure: the route reads the closing page's form
// with `readClosing` and stores what comes back (closings.inputs, closing-store.ts); `closingValues` writes what is
// stored, or what the books propose, back into the form. A value equal to the books' proposal is not stored, so that it
// keeps following the books when they change; errors are codes, the page says them in words.
import { dayOfText, textDay } from './booking'
import { centsOf } from './invoices'
import { moneyText } from './vat-form'
import { naceParts } from './closing-xml'
import { canonicalAccount } from './ledger'
import { podLeafKind, podRowKinds, type Placement } from './closing-pod'
import type { NotesInputs } from './notes'
import {
  ENTITY_SIZES,
  EMPTY_INPUTS,
  LOSS_YEARS,
  MICRO_REVENUES,
  MINIMUM_CREDIT_YEARS,
  TABLE_A,
  TABLE_B,
  TYPED,
  type ClosingInputs,
  type EntitySize,
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
/** The rows of the form for accounts placed in a row of Úč POD of the accountant's own. */
export const PLACEMENT_ROWS = 8
/** The longest text she may add to the notes, each part. */
export const NOTE_TEXT = 3000

export type ClosingError = 'amount' | 'day' | 'year' | 'used' | 'nace' | 'employees' | 'account' | 'row'

/** What the books propose that the form shows beside what was stored: the advances paid, the size group, the employees, deferred tax. */
export interface ClosingFound {
  advances: number
  size: EntitySize
  employees: number
  /** Whether deferred tax is accounted as the law has it, and the deductible differences the books propose (the provisions). */
  deferred?: boolean
  deferredDeductible?: number
}

const isSize = (value: unknown): value is EntitySize => typeof value === 'string' && (ENTITY_SIZES as readonly string[]).includes(value)
const employeesOk = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1_000_000

/** A row of Úč POD as the accountant types it ("45", "045", "r045"): the balance sheet's for a balance account, the profit and loss account's for a cost or revenue. */
export function podRowOf(account: string, typed: string): string | null {
  const digits = typed.replace(/^r/i, '').trim()
  if (!/^\d{1,3}$/.test(digits)) return null
  const n = Number(digits)
  const profit = account.startsWith('5') || account.startsWith('6')
  const row = profit ? `r${String(n).padStart(2, '0')}` : `r${String(n).padStart(3, '0')}`
  const kind = podLeafKind(row)
  return kind && podRowKinds(account).includes(kind) ? row : null
}

const placementsOf = (value: unknown): Placement[] =>
  Array.isArray(value)
    ? value
        .filter((p): p is Placement => !!p && typeof p.account === 'string' && canonicalAccount(p.account) === p.account && typeof p.row === 'string' && podLeafKind(p.row) !== null && podRowKinds(p.account).includes(podLeafKind(p.row) as 'asset'))
        .slice(0, PLACEMENT_ROWS)
        .map((p) => ({ account: p.account, row: p.row }))
    : []
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
    size: isSize(raw.size) ? raw.size : null,
    employees: employeesOk(raw.employees) ? raw.employees : null,
    placements: placementsOf(raw.placements),
    deferred: bool(raw.deferred),
    deferredTaxable: amountOk(raw.deferredTaxable) ? raw.deferredTaxable : null,
    deferredDeductible: amountOk(raw.deferredDeductible) ? raw.deferredDeductible : null,
    deferredLosses: raw.deferredLosses === true,
    notes: notesOf(raw.notes, day),
  }
}

/** The notes' inputs as stored, each checked again. */
function notesOf(value: unknown, day: (v: unknown) => string | null): NotesInputs {
  const v = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  const text = (x: unknown) => (typeof x === 'string' ? x.slice(0, NOTE_TEXT) : '')
  return { priorApproved: day(v.priorApproved), events: text(v.events), profit: text(v.profit), other: text(v.other) }
}

/** The first day of a year's tax period, and the minimum tax's exemption the books propose for it (a first period). */
const fromOf = (year: number, inputs: Pick<ClosingInputs, 'from'>): string => inputs.from ?? `${year}-01-01`

/** Employees as the form writes them: "12", "12,5". */
const employeesText = (n: number): string => String(n).replace('.', ',')

/** The form's values: what is stored, else what the books propose. */
export function closingValues(year: number, inputs: ClosingInputs, proposal: Proposal, found: ClosingFound): ClosingValues {
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
  v.velkost = inputs.size ?? found.size
  v.zamestnanci = employeesText(inputs.employees ?? found.employees)
  for (let i = 0; i < PLACEMENT_ROWS; i++) {
    const p = inputs.placements[i]
    v[`ucet_${i}`] = p ? p.account : ''
    v[`riadok_${i}`] = p ? p.row.slice(1) : ''
  }
  v.odlozena = (inputs.deferred ?? found.deferred ?? false) ? '1' : ''
  v.od_zdanitelne = money(inputs.deferredTaxable ?? 0)
  v.od_odpocitatelne = money(inputs.deferredDeductible ?? found.deferredDeductible ?? 0)
  v.od_straty = inputs.deferredLosses ? '1' : ''
  v.poz_schvalena = inputs.notes.priorApproved ? textDay(inputs.notes.priorApproved) : ''
  v.poz_udalosti = inputs.notes.events
  v.poz_zisk = inputs.notes.profit
  v.poz_ine = inputs.notes.other
  return v
}

/** The form read: the inputs to store (a value equal to the books' proposal left out), or what is wrong, field by field. */
export function readClosing(get: (name: string) => unknown, year: number, proposal: Proposal, found: ClosingFound): { inputs: ClosingInputs; values: ClosingValues; errors: ClosingErrors } {
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
  const inputs: ClosingInputs = { ...EMPTY_INPUTS, tableA: {}, tableB: {}, typed: {}, losses: [], minimumCredits: [], placements: [] }
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
  // The size group: one of the three, stored when it is not the books' proposal.
  const size = text('velkost', 8)
  inputs.size = isSize(size) && size !== found.size ? size : null
  if (!isSize(size)) values.velkost = found.size
  const staff = text('zamestnanci', 10)
  if (staff !== '') {
    const n = Number(staff.replace(/\s/g, '').replace(',', '.'))
    if (!employeesOk(n) || !/^\d+([.,]\d)?$/.test(staff.replace(/\s/g, ''))) errors.zamestnanci = 'employees'
    else inputs.employees = n === found.employees ? null : n
  }
  // Accounts placed in a row of their own: a valid account, and a row of the side its balance goes to.
  for (let i = 0; i < PLACEMENT_ROWS; i++) {
    const typedAccount = text(`ucet_${i}`, 10)
    const typedRow = text(`riadok_${i}`, 5)
    if (typedAccount === '' && typedRow === '') continue
    const account = canonicalAccount(typedAccount)
    if (!account || podRowKinds(account).length === 0) {
      errors[`ucet_${i}`] = 'account'
      continue
    }
    values[`ucet_${i}`] = account
    const row = podRowOf(account, typedRow)
    if (!row) {
      errors[`riadok_${i}`] = 'row'
      continue
    }
    if (!inputs.placements.some((p) => p.account === account && podLeafKind(p.row) === podLeafKind(row))) inputs.placements.push({ account, row })
  }
  // Deferred tax: the tick against the law's default, the differences against the books' proposal.
  const deferred = yes('odlozena')
  inputs.deferred = deferred === (found.deferred ?? false) ? null : deferred
  const taxableDiff = amount('od_zdanitelne')
  inputs.deferredTaxable = taxableDiff === null || taxableDiff === 0 ? null : taxableDiff
  const deductibleDiff = amount('od_odpocitatelne') ?? 0
  inputs.deferredDeductible = deductibleDiff === (found.deferredDeductible ?? 0) ? null : deductibleDiff
  inputs.deferredLosses = yes('od_straty')
  // The notes: the day the statements before were approved, and her own texts.
  const prior = dayOfText(text('poz_schvalena'))
  if (prior === null || (prior !== '' && prior > `${year + 1}-12-31`)) errors.poz_schvalena = 'day'
  const long = (name: string) => {
    const raw = get(name)
    const value = typeof raw === 'string' ? raw.replace(/\r\n/g, '\n').trim().slice(0, NOTE_TEXT) : ''
    values[name] = value
    return value
  }
  inputs.notes = { priorApproved: prior || null, events: long('poz_udalosti'), profit: long('poz_zisk'), other: long('poz_ine') }
  return { inputs, values, errors }
}
