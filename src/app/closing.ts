// The annual closing of a micro company and its corporate income tax return, worked out from the books (ledger.ts).
// Pure: what is stored is in closing-store.ts, the files in closing-xml.ts, the pages in views/closing.tsx; every rule
// is checked in test/units.test.mjs, and both files against the official schemas (test/xsd).
//
// What each rule leans on (read on 14 October 2026):
// - The financial statements of a micro entity (účtovná závierka mikro účtovnej jednotky): the balance sheet Súvaha
//   Úč MUJ 1-01 (rows 01 to 45) and the profit and loss account Výkaz ziskov a strát Úč MUJ 2-01 (rows 01 to 38), in
//   whole euros, each row with the accounts the eForm UZMUJv14 names beside it (the Financial Administration's
//   form.301, measure MF/15464/2013-74 as amended by MF/18008/2014-74 and MF/14775/2017-74). A row the form names an
//   account in twice (a receivable or a liability by its side) takes the balance by its side.
// - The tax return DPPOv25 (form.622) and its poučenie MF/012187/2025-721: rows 100 to 1110 with their formulas, Table
//   A (expenses that are no tax expenses), Table D (the losses deducted), Table F (the double entry's revenues, costs
//   and result), Table K (the minimum tax credited). Act No. 595/2003 Z. z.: § 15 písm. b) the rate (from periods
//   beginning in 2025: 10 % up to 100 000 € of taxable revenues, 21 %, 24 % above 5 000 000 €; in 2024 15 % up to
//   60 000 €), § 30 the losses (five periods; half of the base, the whole base for a micro-taxpayer and losses from
//   periods beginning from 2021), § 2 písm. w) the micro-taxpayer (taxable revenues up to 60 000 € since 2024),
//   § 46b the minimum tax (340, 960, 1 920 and 3 840 €; 11 520 € above 5 000 000 € from 2026; half under § 46b(3), a
//   share of a shorter period under § 46b(6), none under § 46b(7), the difference credited in three periods under
//   § 46b(5)), § 42 the advances (quarterly above 5 000 € of row 1110, monthly above 16 600 €), § 47 amounts rounded
//   to cents, row 1100 not paid up to 5 €. The Financial Directorate's answers: interest on a current account taxed by
//   withholding goes to row 210 and stays in row 560; a company in its first period pays no minimum tax.
//
// Said plainly, what is left to the accountant: the rows the books cannot know (expenses that are no tax expenses but
// those of representation and gifts, unpaid costs under § 17(19), tax depreciation, exempt income, losses of years
// before us) are hers to type, each proposed where the books can; the notes (poznámky) are hers to write. Not built:
// the return of a company that is not a micro entity (Úč POD), deferred tax, the relief rows, the special tax bases.
import { balanceOf, synthetic, accountClass, type Books, type LedgerEntry } from './ledger'
import type { Company } from './store'
import { workingDayFrom } from './vat'

// ---------------------------------------------------------------------------------------------------------------
// The deadline
// ---------------------------------------------------------------------------------------------------------------

/** The last day to file the closing and the return of a year, and to pay the tax: 31 March, or the next working day (§ 49(1)). */
export const closingDeadline = (year: number): string => workingDayFrom(`${year + 1}-03-31`)

/**
 * The days a notice (oznámenie, § 49(3)) may move the deadline to: the end of a month, up to three months later, up to
 * six when the income includes income from abroad. The notice is filed by the deadline itself, and the tax is due then.
 */
export function extensionDays(year: number): { day: string; abroad: boolean }[] {
  return [4, 5, 6, 7, 8, 9].map((m) => ({ day: monthLast(year + 1, m), abroad: m > 6 }))
}

const monthLast = (year: number, month: number): string => `${year}-${String(month).padStart(2, '0')}-${String(new Date(Date.UTC(year, month, 0)).getUTCDate()).padStart(2, '0')}`

/** A year's deadline: the day a notice moved it to, else 31 March; a day off moves it to the next working day. */
export const closingDue = (year: number, extendedTo: string | null): string => (extendedTo ? workingDayFrom(extendedTo) : closingDeadline(year))

// ---------------------------------------------------------------------------------------------------------------
// The financial statements of a micro entity
// ---------------------------------------------------------------------------------------------------------------

/** The rows of Súvaha Úč MUJ 1-01, 01 to 45, as the eForm numbers them. */
export const BALANCE_ROWS = Array.from({ length: 45 }, (_, i) => `r${String(i + 1).padStart(2, '0')}`) as readonly string[]
/** The rows of Výkaz ziskov a strát Úč MUJ 2-01, 01 to 38. */
export const PROFIT_ROWS = Array.from({ length: 38 }, (_, i) => `r${String(i + 1).padStart(2, '0')}`) as readonly string[]

export type Lines = Record<string, number>

/**
 * Where a balance-sheet account's closing balance stands: one row for it whatever its side (`signed`, an asset row
 * takes the balance as it is, a liability row with its sign turned), or one row for a debit balance (an asset) and
 * another for a credit balance (a liability). Read by the longest prefix of the account that is listed.
 */
type Place = { signed: string; liability?: boolean } | { debit: string; credit: string }

const PLACES: readonly [string, Place][] = [
  // Assets that stand as they are (their contra accounts, the accumulated depreciation, subtract by their own sign).
  ...['01', '041', '051', '07', '091', '093'].map((a) => [a, { signed: 'r03' }] as [string, Place]),
  ...['021', '031', '081'].map((a) => [a, { signed: 'r05' }] as [string, Place]),
  ...['02', '042', '052', '08', '092', '094', '095'].map((a) => [a, { signed: 'r06' }] as [string, Place]),
  ...['025', '026', '029', '032', '085', '086', '089'].map((a) => [a, { signed: 'r07' }] as [string, Place]),
  ...['097', '098'].map((a) => [a, { signed: 'r08' }] as [string, Place]),
  ...['061', '062', '063'].map((a) => [a, { signed: 'r10' }] as [string, Place]),
  ...['06', '043', '053', '096'].map((a) => [a, { signed: 'r11' }] as [string, Place]),
  ['1', { signed: 'r15' }],
  ['391', { signed: 'r18' }],
  ['21', { signed: 'r22' }],
  ['26', { signed: 'r22' }],
  ['25', { signed: 'r23' }],
  ['29', { signed: 'r23' }],
  // Receivables and liabilities by their side.
  ['31', { debit: 'r18', credit: 'r39' }],
  ['32', { debit: 'r18', credit: 'r39' }],
  ['33', { debit: 'r20', credit: 'r40' }],
  ['336', { debit: 'r19', credit: 'r40' }],
  ['34', { debit: 'r19', credit: 'r41' }],
  ['35', { debit: 'r20', credit: 'r42' }],
  ['36', { debit: 'r20', credit: 'r42' }],
  ['37', { debit: 'r20', credit: 'r42' }],
  ['38', { debit: 'r20', credit: 'r42' }],
  ['39', { debit: 'r20', credit: 'r42' }],
  ['22', { debit: 'r22', credit: 'r44' }],
  // Equity and liabilities that stand as they are (a credit balance is the row's plus).
  ['323', { signed: 'r43', liability: true }],
  ['353', { signed: 'r28', liability: true }],
  ['23', { signed: 'r44', liability: true }],
  ['24', { signed: 'r45', liability: true }],
  ...['411', '419', '49'].map((a) => [a, { signed: 'r27', liability: true }] as [string, Place]),
  ...['412', '413', '417', '418'].map((a) => [a, { signed: 'r29', liability: true }] as [string, Place]),
  ['42', { signed: 'r30', liability: true }],
  ...['415', '416'].map((a) => [a, { signed: 'r31', liability: true }] as [string, Place]),
  // The result of the years before: 428 and 429, and 431 while it waits to be distributed.
  ...['428', '429', '43'].map((a) => [a, { signed: 'r32', liability: true }] as [string, Place]),
  ['45', { signed: 'r36', liability: true }],
  ['46', { signed: 'r37', liability: true }],
  ['47', { signed: 'r35', liability: true }],
  ['48', { signed: 'r35', liability: true }],
]

/** Where an account goes in the balance sheet, by the longest prefix listed; null for one the form has no row for. */
export function placeOf(account: string): Place | null {
  const plain = account.replace('.', '')
  let best: [string, Place] | null = null
  for (const entry of PLACES) if (plain.startsWith(entry[0]) && (!best || entry[0].length > best[0].length)) best = entry
  return best ? best[1] : null
}

/** Where a result account goes in the profit and loss account, by its synthetic account. */
export function profitRowOf(account: string): string {
  const s = synthetic(account)
  const two = s.slice(0, 2)
  if (s === '604' || s === '607') return 'r02'
  if (s === '601' || s === '602' || s === '606') return 'r03'
  if (two === '61') return 'r04'
  if (two === '62') return 'r05'
  if (s === '641' || s === '642') return 'r06'
  if (s === '661') return 'r21'
  if (s === '665') return 'r22'
  if (s === '666') return 'r23'
  if (s === '662') return 'r24'
  if (s === '663') return 'r25'
  if (two === '66') return 'r26'
  if (accountClass(s) === 6) return 'r07'
  if (s === '504' || s === '507') return 'r09'
  if (two === '50') return 'r10'
  if (two === '51') return 'r11'
  if (two === '52') return 'r12'
  if (two === '53') return 'r13'
  if (s === '551' || s === '553') return 'r14'
  if (s === '541' || s === '542') return 'r15'
  if (s === '547') return 'r16'
  if (two === '54' || two === '55') return 'r17'
  if (s === '561') return 'r28'
  if (s === '566') return 'r29'
  if (s === '565') return 'r30'
  if (s === '562') return 'r31'
  if (s === '563') return 'r32'
  if (two === '56') return 'r33'
  if (s === '596') return 'r37'
  if (two === '59') return 'r36'
  return 'r17'
}

/** The accounts that are the income tax itself: they are not part of the result before tax (row 100). */
export const TAX_ACCOUNTS = new Set(['591', '592', '595', '596'])

const empty = (rows: readonly string[]): Lines => Object.fromEntries(rows.map((r) => [r, 0])) as Lines

/** The sums of the balance sheet, the form's formulas, over its leaf rows; row 33, the result, is what makes it balance. */
function balanceSums(b: Lines): void {
  b.r04 = (b.r05 ?? 0) + (b.r06 ?? 0) + (b.r07 ?? 0) + (b.r08 ?? 0)
  b.r09 = (b.r10 ?? 0) + (b.r11 ?? 0) + (b.r12 ?? 0) + (b.r13 ?? 0)
  b.r02 = (b.r03 ?? 0) + b.r04 + b.r09
  b.r17 = (b.r18 ?? 0) + (b.r19 ?? 0) + (b.r20 ?? 0)
  b.r21 = (b.r22 ?? 0) + (b.r23 ?? 0)
  b.r14 = (b.r15 ?? 0) + (b.r16 ?? 0) + b.r17 + b.r21
  b.r01 = b.r02 + b.r14
  b.r26 = (b.r27 ?? 0) + (b.r28 ?? 0)
  b.r38 = (b.r39 ?? 0) + (b.r40 ?? 0) + (b.r41 ?? 0) + (b.r42 ?? 0)
  b.r34 = (b.r35 ?? 0) + (b.r36 ?? 0) + (b.r37 ?? 0) + b.r38 + (b.r43 ?? 0) + (b.r44 ?? 0) + (b.r45 ?? 0)
  b.r33 = b.r01 - (b.r26 + (b.r29 ?? 0) + (b.r30 ?? 0) + (b.r31 ?? 0) + (b.r32 ?? 0) + b.r34)
  b.r25 = b.r26 + (b.r29 ?? 0) + (b.r30 ?? 0) + (b.r31 ?? 0) + (b.r32 ?? 0) + b.r33
  b.r24 = b.r25 + b.r34
}

/** The sums of the profit and loss account, the form's formulas. */
function profitSums(p: Lines): void {
  const s = (...rows: string[]) => rows.reduce((sum, r) => sum + (p[r] ?? 0), 0)
  p.r01 = s('r02', 'r03', 'r04', 'r05', 'r06', 'r07')
  p.r08 = s('r09', 'r10', 'r11', 'r12', 'r13', 'r14', 'r15', 'r16', 'r17')
  p.r18 = p.r01 - p.r08
  p.r19 = s('r02') - s('r09') + s('r03', 'r04', 'r05') - s('r10', 'r11')
  p.r20 = s('r21', 'r22', 'r23', 'r24', 'r25', 'r26')
  p.r27 = s('r28', 'r29', 'r30', 'r31', 'r32', 'r33')
  p.r34 = p.r20 - p.r27
  p.r35 = p.r18 + p.r34
  p.r38 = p.r35 - s('r36', 'r37')
}

const BALANCE_LEAVES = ['r03', 'r05', 'r06', 'r07', 'r08', 'r10', 'r11', 'r12', 'r13', 'r15', 'r16', 'r18', 'r19', 'r20', 'r22', 'r23', 'r27', 'r28', 'r29', 'r30', 'r31', 'r32', 'r35', 'r36', 'r37', 'r39', 'r40', 'r41', 'r42', 'r43', 'r44', 'r45']
const PROFIT_LEAVES = ['r02', 'r03', 'r04', 'r05', 'r06', 'r07', 'r09', 'r10', 'r11', 'r12', 'r13', 'r14', 'r15', 'r16', 'r17', 'r21', 'r22', 'r23', 'r24', 'r25', 'r26', 'r28', 'r29', 'r30', 'r31', 'r32', 'r33', 'r36', 'r37']

/** Every account's closing balance of a year (debit plus, credit minus): the year's opening, the opening balances written in it, its entries. */
export function closingBalances(entries: readonly LedgerEntry[], year: number): Map<string, number> {
  const out = new Map<string, number>()
  const add = (account: string, cents: number) => out.set(account, (out.get(account) ?? 0) + cents)
  for (const e of entries) {
    if (e.on > `${year}-12-31`) break
    // Costs and revenues of years before belong to their results, which a year opens with on 431 (ledger.ts, yearOpening).
    const before = e.on < `${year}-01-01`
    for (const line of e.lines) {
      for (const [account, cents] of [
        [line.md, line.cents],
        [line.d, -line.cents],
      ] as const) {
        const cls = accountClass(account)
        if (cls === 7) continue
        if (before && (cls === 5 || cls === 6)) add('431', cents)
        else add(account, cents)
      }
    }
  }
  return out
}

export interface Statements {
  year: number
  /** In cents, as the books hold them. */
  balance: Lines
  profit: Lines
  /** In whole euros, as the statements are filed; the rounding put in row 22 when the result would not otherwise agree. */
  balanceEur: Lines
  profitEur: Lines
  rounding: number
  /** Accounts with a balance the form has no row for (they would be lost from it). */
  unplaced: string[]
  /** Each cost and revenue account of the year (synthetic), a cost or a revenue as a plus: what the return's proposals read. */
  accounts: Record<string, number>
}

/** The financial statements of a micro entity for a year from its books: the balance sheet and the profit and loss account. */
export function statementsOf(books: Pick<Books, 'entries'>, year: number): Statements {
  const balances = closingBalances(books.entries, year)
  const balance = empty(BALANCE_ROWS)
  const profit = empty(PROFIT_ROWS)
  const unplaced: string[] = []
  const accounts: Record<string, number> = {}
  // A bank's accounts each by its own side (an overdraft is a loan, not less money); every other account by its synthetic one.
  const bySynthetic = new Map<string, number>()
  for (const [account, cents] of balances) {
    if (cents === 0) continue
    const cls = accountClass(account)
    if (cls === 5 || cls === 6) {
      const row = profitRowOf(account)
      const plus = cls === 6 ? -cents : cents
      profit[row] = (profit[row] ?? 0) + plus
      accounts[synthetic(account)] = (accounts[synthetic(account)] ?? 0) + plus
      continue
    }
    const key = synthetic(account) === '221' ? account : synthetic(account)
    bySynthetic.set(key, (bySynthetic.get(key) ?? 0) + cents)
  }
  for (const [account, cents] of bySynthetic) {
    if (cents === 0) continue
    const place = placeOf(account)
    if (!place) {
      unplaced.push(account)
      continue
    }
    if ('signed' in place) balance[place.signed] = (balance[place.signed] ?? 0) + (place.liability ? -cents : cents)
    else if (cents > 0) balance[place.debit] = (balance[place.debit] ?? 0) + cents
    else balance[place.credit] = (balance[place.credit] ?? 0) - cents
  }
  balanceSums(balance)
  profitSums(profit)
  // In whole euros: each row rounded, the sums made again of them; the result must be the same on both statements.
  const eur = (cents: number) => Math.round(cents / 100)
  const balanceEur = empty(BALANCE_ROWS)
  const profitEur = empty(PROFIT_ROWS)
  for (const r of BALANCE_LEAVES) balanceEur[r] = eur(balance[r] ?? 0)
  for (const r of PROFIT_LEAVES) profitEur[r] = eur(profit[r] ?? 0)
  profitSums(profitEur)
  balanceSums(balanceEur)
  const rounding = (profitEur.r38 ?? 0) - (balanceEur.r33 ?? 0)
  if (rounding !== 0) {
    balanceEur.r22 = (balanceEur.r22 ?? 0) + rounding
    balanceSums(balanceEur)
  }
  return { year, balance, profit, balanceEur, profitEur, rounding, unplaced: unplaced.sort(), accounts }
}

// ---------------------------------------------------------------------------------------------------------------
// The corporate income tax return
// ---------------------------------------------------------------------------------------------------------------

/** The rows of Table A (expenses that are no tax expenses), 1 to 16; row 17 is their sum, row 130 of the return. */
export const TABLE_A = ['a01', 'a02', 'a03', 'a04', 'a05', 'a06', 'a07', 'a08', 'a09', 'a10', 'a11', 'a12', 'a13', 'a14', 'a15', 'a16'] as const
export type TableARow = (typeof TABLE_A)[number]

/**
 * The rows of Table B (the depreciation of tangible assets) the accountant types, 1 to 5: the depreciation in the books,
 * the tax depreciation, what of it is not claimed (§ 19(3)(a), § 22(9)) and the share of a year's on a sale (§ 22(12)).
 * Row 6 is their formula, and rows 150 and 250 of the return its difference from row 1, as the eForm computes them.
 */
export const TABLE_B = ['b01', 'b02', 'b03', 'b04', 'b05'] as const
export type TableBRow = (typeof TABLE_B)[number]

/**
 * The rows of the return the accountant types (Tables A and B apart): what the books cannot know. Not rows 220 (a
 * taxpayer not founded for business, which a company is) nor 240 (the patent box, whose annex is not built).
 */
export const TYPED = ['r110', 'r140', 'r170', 'r180', 'r210', 'r230', 'r260', 'r270', 'r280', 'r290'] as const
export type TypedRow = (typeof TYPED)[number]

/** A loss of a period before, for Table D: the period, the loss as it was reported, what was deducted of it before. */
export interface Loss {
  year: number
  amount: number
  usedBefore: number
}

/** A minimum tax paid over the tax of a period before, for Table K: the period, the difference, what was credited of it before. */
export interface MinimumCredit {
  year: number
  amount: number
  usedBefore: number
}

export interface TaxInput {
  year: number
  /** Row 100: the result before tax, from the books (costs and revenues but the income tax itself). */
  result: number
  /** Table F: the revenues and the costs of the year (operating and financial), the income tax apart. */
  revenues: number
  costs: number
  tableA: Partial<Record<TableARow, number>>
  tableB: Partial<Record<TableBRow, number>>
  typed: Partial<Record<TypedRow, number>>
  /** Row 560: the taxable revenues (zdaniteľné príjmy). */
  taxable: number
  losses: Loss[]
  /** How much of the losses to deduct now; null deducts all it may (the accountant may deduct less, § 30). */
  lossDeduct: number | null
  /** The micro-taxpayer under § 2 písm. w). */
  micro: boolean
  /** § 46b(7): the minimum tax is not paid (a company's first period); § 46b(3): it is halved. */
  minimumExempt: boolean
  minimumHalf: boolean
  /** The months of the tax period (12, or fewer for a shorter one, § 46b(6)). */
  months: number
  minimumCredits: MinimumCredit[]
  /** Row 1010: the advances paid for the period; row 1030: tax withheld that counts as an advance. */
  advances: number
  withheld: number
}

export type TaxRows = Record<string, number>

export interface TaxResult {
  rows: TaxRows
  /** Table A as filed (rows 1 to 17). */
  tableA: Record<string, number>
  /** Table B as filed (rows 1 to 6), and whether it is filled at all. */
  tableB: Record<string, number>
  tableBUsed: boolean
  /** Table D, the losses: each with what it is deducted now and what is left. */
  losses: (Loss & { now: number; left: number })[]
  minimumCredits: (MinimumCredit & { now: number; left: number })[]
  rate: number
  /** The minimum tax as the law sets it for the period (row 810), and whether it is what is paid. */
  minimum: number
  minimumPaid: boolean
  /** Row 1110 and the advances it brings for the next period: none, 4 a year, or 12. */
  advancesNext: { kind: 'none' | 'quarterly' | 'monthly'; each: number }
}

/** Euros as cents. */
const E = (euros: number) => Math.round(euros * 100)

/** § 47: an amount rounded to cents, half up. */
const roundCents = (value: number): number => Math.round(value)

/** The rate of a period (row 550, per cent) by its taxable revenues (row 560). */
export function taxRate(year: number, taxable: number): number {
  if (year >= 2025) return taxable <= E(100_000) ? 10 : taxable > E(5_000_000) ? 24 : 21
  return taxable <= E(60_000) ? 15 : 21
}

/** The minimum tax of a whole period by its taxable revenues (§ 46b(2)), in cents; from 2026 a band above 5 000 000 €. */
export function minimumTax(year: number, taxable: number): number {
  if (year < 2024) return 0
  if (taxable <= E(50_000)) return E(340)
  if (taxable <= E(250_000)) return E(960)
  if (taxable <= E(500_000)) return E(1_920)
  if (year >= 2026 && taxable > E(5_000_000)) return E(11_520)
  return E(3_840)
}

/** The micro-taxpayer's ceiling of taxable revenues (§ 2 písm. w), since 2024). */
export const MICRO_REVENUES = E(60_000)

/** Losses are deducted in the five periods after the one that reported them (§ 30(1)). */
export const LOSS_YEARS = 5
/** The difference between the minimum tax and the tax is credited in the three periods after (§ 46b(5)). */
export const MINIMUM_CREDIT_YEARS = 3

/** The tax return's rows from the books and what the accountant typed: every formula of the form, in its order. */
export function taxOf(input: TaxInput): TaxResult {
  const r: TaxRows = {}
  const typed = (row: TypedRow) => Math.max(0, roundCents(input.typed[row] ?? 0))
  const tableA: Record<string, number> = {}
  let a17 = 0
  for (const [i, key] of TABLE_A.entries()) {
    const value = Math.max(0, roundCents(input.tableA[key] ?? 0))
    tableA[`r${String(i + 1).padStart(2, '0')}`] = value
    a17 += value
  }
  tableA.r17 = a17
  // Table B: row 6 the tax depreciation that goes into the base; row 150 adds what the books depreciated over it, row 250 takes off what they did under it.
  const b = (row: TableBRow) => Math.max(0, roundCents(input.tableB[row] ?? 0))
  const tableB: Record<string, number> = { r01: b('b01'), r02: b('b02'), r03: b('b03'), r04: b('b04'), r05: b('b05') }
  tableB.r06 = (tableB.r02 ?? 0) - (tableB.r03 ?? 0) - (tableB.r04 ?? 0) + (tableB.r05 ?? 0)
  const tableBUsed = TABLE_B.some((row) => b(row) !== 0)
  r.r100 = input.result
  r.r110 = typed('r110')
  r.r130 = a17
  r.r140 = typed('r140')
  r.r150 = Math.max(0, (tableB.r01 ?? 0) - (tableB.r06 ?? 0))
  r.r170 = typed('r170')
  r.r180 = typed('r180')
  r.r200 = r.r110 + r.r130 + r.r140 + r.r150 + r.r170 + r.r180
  r.r210 = typed('r210')
  r.r220 = 0
  r.r230 = typed('r230')
  r.r240 = 0
  r.r250 = Math.max(0, (tableB.r06 ?? 0) - (tableB.r01 ?? 0))
  for (const row of ['r260', 'r270', 'r280', 'r290'] as const) r[row] = typed(row)
  r.r300 = ['r210', 'r220', 'r230', 'r240', 'r250', 'r260', 'r270', 'r280', 'r290'].reduce((sum, row) => sum + (r[row] ?? 0), 0)
  r.r301 = r.r100 + r.r200 - r.r300
  for (const row of ['r302', 'r303', 'r304', 'r305', 'r306', 'r307', 'r308']) r[row] = 0
  r.r310 = r.r301
  r.r320 = 0
  r.r330 = 0
  r.r400 = r.r310 - r.r320 - r.r330
  // Table D: the losses of the five periods before, the oldest first, each up to half of row 400 (the whole of it for a
  // micro-taxpayer and a loss of a period beginning from 2021), as much as the accountant deducts in all.
  const base = Math.max(0, r.r400)
  const half = roundCents(base / 2)
  let used = 0
  const wanted = input.lossDeduct === null ? Number.POSITIVE_INFINITY : Math.max(0, roundCents(input.lossDeduct))
  const losses = [...input.losses]
    .filter((l) => l.year < input.year && input.year - l.year <= LOSS_YEARS)
    .sort((a, b) => a.year - b.year)
    .map((l) => {
      const remaining = Math.max(0, l.amount - l.usedBefore)
      const cap = input.micro && l.year >= 2021 ? base : half
      const now = Math.max(0, Math.min(remaining, cap - used, wanted - used))
      used += now
      return { ...l, now, left: remaining - now }
    })
  r.r410 = used
  r.r500 = Math.max(0, r.r400 - r.r410)
  r.r501 = 0
  r.r502 = 0
  r.r503 = 0
  r.r510 = r.r500 - r.r501 - r.r502 - r.r503
  r.r560 = Math.max(0, roundCents(input.taxable))
  const rate = taxRate(input.year, r.r560)
  r.r550 = rate
  r.r600 = roundCents((r.r510 * rate) / 100)
  r.r610 = 0
  r.r700 = r.r600 - r.r610
  r.r710 = 0
  r.r800 = r.r700 - r.r710
  // The minimum tax (§ 46b): of the whole period, halved, a share of a shorter one; none when the law says so.
  const whole = minimumTax(input.year, r.r560)
  const months = Math.min(12, Math.max(1, Math.round(input.months)))
  const minimum = input.minimumExempt ? 0 : roundCents(((input.minimumHalf ? whole / 2 : whole) * months) / 12)
  r.r810 = minimum
  const minimumPaid = minimum > r.r800
  r.r820 = minimumPaid ? minimum : 0
  r.r830 = minimumPaid ? minimum - r.r800 : 0
  r.r840 = 0
  r.r900 = r.r820 + r.r840
  // Table K: what the minimum tax of the three periods before paid over their tax, credited on the tax above the minimum.
  r.r910 = minimumPaid ? 0 : Math.max(0, r.r800 - minimum)
  let credited = 0
  const minimumCredits = [...input.minimumCredits]
    .filter((c) => c.year < input.year && input.year - c.year <= MINIMUM_CREDIT_YEARS)
    .sort((a, b) => a.year - b.year)
    .map((c) => {
      const remaining = Math.max(0, c.amount - c.usedBefore)
      const now = Math.max(0, Math.min(remaining, (r.r910 ?? 0) - credited))
      credited += now
      return { ...c, now, left: remaining - now }
    })
  r.r920 = credited
  r.r1000 = credited > 0 ? r.r800 - credited : 0
  r.r1010 = Math.max(0, roundCents(input.advances))
  r.r1020 = 0
  r.r1030 = Math.max(0, roundCents(input.withheld))
  r.r1040 = r.r1010 + r.r1020 + r.r1030
  r.r1050 = r.r900 > 0 ? r.r900 : r.r1000 > 0 ? r.r1000 : r.r800
  // The special tax bases (§ 17f, § 51e, § 51ea) and their instalments are not built: nought.
  for (const row of ['r1060', 'r1061', 'r1062', 'r1070', 'r1071', 'r1090']) r[row] = 0
  r.r1080 = r.r1050
  const due = r.r1080 - r.r1040
  // A tax to pay of 5 € or less is not paid, and the row says nought.
  r.r1100 = due > E(5) ? due : 0
  r.r1101 = due < 0 ? due : 0
  r.r1110 = roundCents((r.r500 * rate) / 100) - r.r610
  const advancesNext: TaxResult['advancesNext'] =
    r.r1110 > E(16_600) ? { kind: 'monthly', each: roundCents(r.r1110 / 12) } : r.r1110 > E(5_000) ? { kind: 'quarterly', each: roundCents(r.r1110 / 4) } : { kind: 'none', each: 0 }
  return { rows: r, tableA, tableB, tableBUsed, losses, minimumCredits, rate, minimum, minimumPaid, advancesNext }
}

/** Table F: the revenues and costs of the year, and the result before tax (row 100). */
export function tableF(statements: Statements): { r01: number; r02: number; r03: number } {
  const p = statements.profit
  const r01 = (p.r01 ?? 0) + (p.r20 ?? 0)
  const r02 = (p.r08 ?? 0) + (p.r27 ?? 0)
  return { r01, r02, r03: r01 - r02 }
}

/** What the books propose for a year's return; the accountant's inputs (closing-form.ts) override any of it. */
export interface Proposal {
  result: number
  revenues: number
  costs: number
  taxable: number
  r210: number
  tableA: Partial<Record<TableARow, number>>
  tableB: Partial<Record<TableBRow, number>>
}

/**
 * What the books propose for the return: the result before tax (row 100, the profit and loss account's row 35), the
 * taxable revenues (row 560: every revenue of class 6, which the accountant lowers by what is not subject to tax or
 * exempt), the interest on the company's accounts taxed by withholding (row 210, account 662), representation (Table A
 * row 6, account 513) and gifts (row 8, account 543), and the depreciation of account 551 in Table B, the tax
 * depreciation proposed the same until the accountant says otherwise (so that nothing is added back unasked).
 */
export function proposeTax(statements: Statements): Proposal {
  const p = statements.profit
  const f = tableF(statements)
  const depreciation = Math.max(0, statements.accounts['551'] ?? 0)
  return {
    result: p.r35 ?? 0,
    revenues: f.r01,
    costs: f.r02,
    taxable: Math.max(0, f.r01),
    r210: Math.max(0, statements.accounts['662'] ?? 0),
    tableA: { a06: Math.max(0, statements.accounts['513'] ?? 0), a08: Math.max(0, statements.accounts['543'] ?? 0) },
    tableB: { b01: depreciation, b02: depreciation },
  }
}

/** The months of a tax period from its first day to the end of the year, for the share of the minimum tax (§ 46b(6)). */
export const periodMonths = (from: string): number => 13 - Number(from.slice(5, 7))

/** What the accountant set for a year (closing-form.ts reads and stores it); null and absent follow the books. */
export interface ClosingInputs {
  tableA: Partial<Record<TableARow, number>>
  tableB: Partial<Record<TableBRow, number>>
  typed: Partial<Record<TypedRow, number>>
  taxable: number | null
  micro: boolean | null
  losses: Loss[]
  lossDeduct: number | null
  /** The first day of the tax period: the founding of a company in its first one. */
  from: string | null
  minimumExempt: boolean | null
  minimumHalf: boolean
  minimumCredits: MinimumCredit[]
  advances: number | null
  withheld: number
  /** SK NACE of the main activity, "62.01.0", and the activity in words. */
  nace: string
  activity: string
  /** The day the statements were approved, when they were before they are filed. */
  approvedOn: string | null
}

export const EMPTY_INPUTS: ClosingInputs = {
  tableA: {},
  tableB: {},
  typed: {},
  taxable: null,
  micro: null,
  losses: [],
  lossDeduct: null,
  from: null,
  minimumExempt: null,
  minimumHalf: false,
  minimumCredits: [],
  advances: null,
  withheld: 0,
  nace: '',
  activity: '',
  approvedOn: null,
}

/**
 * The return's input: the books' proposal with the accountant's inputs over it. A period that begins after 1 January
 * is a company's first one, which pays no minimum tax (§ 46b(7)) unless she says otherwise; the micro-taxpayer follows
 * the taxable revenues as they end up; the advances, what the bank shows paid to the income tax's account.
 */
export function taxInputOf(year: number, proposal: Proposal, inputs: ClosingInputs, found: { advances: number }): TaxInput {
  const from = inputs.from ?? `${year}-01-01`
  const taxable = inputs.taxable ?? proposal.taxable
  return {
    year,
    result: proposal.result,
    revenues: proposal.revenues,
    costs: proposal.costs,
    tableA: { ...proposal.tableA, ...inputs.tableA },
    tableB: { ...proposal.tableB, ...inputs.tableB },
    typed: { r210: proposal.r210, ...inputs.typed },
    taxable,
    losses: inputs.losses,
    lossDeduct: inputs.lossDeduct,
    micro: inputs.micro ?? taxable <= MICRO_REVENUES,
    minimumExempt: inputs.minimumExempt ?? from > `${year}-01-01`,
    minimumHalf: inputs.minimumHalf,
    months: periodMonths(from),
    minimumCredits: inputs.minimumCredits,
    advances: inputs.advances ?? found.advances,
    withheld: inputs.withheld,
  }
}

// ---------------------------------------------------------------------------------------------------------------
// What keeps a closing from being filed
// ---------------------------------------------------------------------------------------------------------------

export type ClosingIssueCode = 'start' | 'unbooked' | 'payments' | 'foreign' | 'cash' | 'unplaced' | 'dic' | 'address' | 'nace' | 'tax' | 'transit' | 'rounding'

/** block: the closing is not filed until it is resolved; warn: to look at. `count` things, `accounts` the ones meant. */
export interface ClosingIssue {
  code: ClosingIssueCode
  level: 'block' | 'warn'
  count: number
  accounts?: string[]
}

/**
 * What keeps a year's closing from being filed, from the books as they stand: documents of the year (or of no day yet)
 * not booked or making no entry; payments of the year not in the books (without a document, waiting for one, to be
 * classified: the bank's balance in the balance sheet would not be the statement's); payments in another currency; cash
 * below nought; an account the statements have no row for; the company's tax number, seat and activity, which both forms
 * ask for; the tax of the year not booked as computed (once the year has ended). To look at: money in transit (261) at
 * the year's end, and the rounding put in row 22 of the balance sheet.
 */
export function closingIssues(args: {
  books: Pick<Books, 'start' | 'entries' | 'issues' | 'docDays' | 'payments'>
  year: number
  company: Pick<Company, 'dic' | 'address'>
  nace: string
  statements: Pick<Statements, 'unplaced' | 'rounding'>
  /** The tax of the year as computed (row 1050) and as booked (591); null while the year runs. */
  tax: { computed: number; booked: number } | null
}): ClosingIssue[] {
  const { books, year } = args
  const end = `${year}-12-31`
  const out: ClosingIssue[] = []
  const block = (code: ClosingIssueCode, count = 1, accounts?: string[]) => out.push({ code, level: 'block', count, ...(accounts ? { accounts } : {}) })
  const i = books.issues
  if (!books.start) block('start')
  const docs = [...i.unbooked, ...i.noEntry].filter((id) => (books.docDays.get(id) ?? null) === null || (books.docDays.get(id) as string) <= end)
  if (docs.length > 0) block('unbooked', docs.length)
  const ofYear = (ids: string[]) => ids.filter((id) => (books.payments.get(id)?.bookedOn ?? '') <= end)
  const payments = new Set([...ofYear(i.missing), ...ofYear(i.waiting), ...ofYear(i.classify)])
  if (payments.size > 0) block('payments', payments.size)
  const foreign = ofYear(i.foreign)
  if (foreign.length > 0) block('foreign', foreign.length)
  if (balanceOf(books.entries, '211', end) < 0) block('cash')
  if (args.statements.unplaced.length > 0) block('unplaced', args.statements.unplaced.length, args.statements.unplaced)
  if (!args.company.dic) block('dic')
  if (!args.company.address) block('address')
  if (!args.nace) block('nace')
  if (args.tax && args.tax.computed !== args.tax.booked) block('tax')
  if (balanceOf(books.entries, '261', end) !== 0) out.push({ code: 'transit', level: 'warn', count: 1 })
  if (args.statements.rounding !== 0) out.push({ code: 'rounding', level: 'warn', count: Math.abs(args.statements.rounding) })
  return out
}

/** The rows of the return, and whether the statements, that differ from what was filed: a correction to consider. */
export function changedSinceFiled(filed: { rows: TaxRows; balance: Lines; profit: Lines }, tax: TaxResult, statements: Pick<Statements, 'balanceEur' | 'profitEur'>): { rows: string[]; statements: boolean } {
  const rows = Object.keys({ ...filed.rows, ...tax.rows }).filter((row) => (filed.rows[row] ?? 0) !== (tax.rows[row] ?? 0))
  const differs = (a: Lines, b: Lines) => Object.keys({ ...a, ...b }).some((row) => (a[row] ?? 0) !== (b[row] ?? 0))
  return { rows: rows.sort((a, b) => Number(a.slice(1)) - Number(b.slice(1))), statements: differs(filed.balance, statements.balanceEur) || differs(filed.profit, statements.profitEur) }
}
