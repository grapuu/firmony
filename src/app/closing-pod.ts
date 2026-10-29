// The financial statements of a company that is not a micro entity (17 October 2026): Súvaha Úč POD 1-01 and Výkaz
// ziskov a strát Úč POD 2-01, which a small and a large accounting entity file (§ 2(7) and (8) of Act No. 431/2002
// Z. z.; the eForm UZPODv14, form.302 of the Financial Administration; measure MF/23377/2014-74 as amended). Pure:
// closing.ts puts them in its Statements, closing-xml.ts writes the file, views/closing.tsx shows them, and
// test/units.test.mjs checks the rules and the file against the official schema (test/xsd/uzpod2014.xsd).
//
// Read from the eForm on 17 October 2026: the balance sheet's rows 001 to 145, each asset row (001 to 078) with its
// gross amount, its correction (accumulated depreciation and allowances) and its net, the net of the year before
// beside; each row of equity and liabilities (079 to 145) with the year and the one before; the profit and loss
// account's rows 01 to 61. Each account goes to the row the form names it beside. Where the form names an account in
// several rows by a part of it (an "A" account: a receivable by its maturity or its counterparty, a provision by its
// kind, interest by the related party), the books cannot know the part: it goes to the row of a company with no related
// party and no receivable due after a year (short-term, "other"), and the accountant moves an account, or an analytic
// account of it, to its own row in the closing's form (`Placement`). Row 01 of the profit and loss account, the net
// turnover, is the revenue from the sale of goods, products and services (§ 2(15) of the Act).
import { accountClass, synthetic } from './ledger'

export type Lines = Record<string, number>

const rowsOf = (from: number, to: number, width: number): string[] => Array.from({ length: to - from + 1 }, (_, i) => `r${String(from + i).padStart(width, '0')}`)

/** The rows of Súvaha Úč POD 1-01, 001 to 145: the assets are 001 to 078, the rest the liabilities. */
export const POD_ASSET_ROWS = rowsOf(1, 78, 3) as readonly string[]
export const POD_LIABILITY_ROWS = rowsOf(79, 145, 3) as readonly string[]
/** The rows of Výkaz ziskov a strát Úč POD 2-01, 01 to 61. */
export const POD_PROFIT_ROWS = rowsOf(1, 61, 2) as readonly string[]

/** The rows that are sums (the form's formulas), on each side; every other row is where accounts go. */
const ASSET_SUMS: Record<string, string[]> = {
  r003: rowsOf(4, 10, 3),
  r011: rowsOf(12, 20, 3),
  r021: rowsOf(22, 32, 3),
  r002: ['r003', 'r011', 'r021'],
  r034: rowsOf(35, 40, 3),
  r042: rowsOf(43, 45, 3),
  r041: ['r042', ...rowsOf(46, 52, 3)],
  r054: rowsOf(55, 57, 3),
  r053: ['r054', ...rowsOf(58, 65, 3)],
  r066: rowsOf(67, 70, 3),
  r071: ['r072', 'r073'],
  r033: ['r034', 'r041', 'r053', 'r066', 'r071'],
  r074: rowsOf(75, 78, 3),
  r001: ['r002', 'r033', 'r074'],
}
const LIABILITY_SUMS: Record<string, string[]> = {
  r081: rowsOf(82, 84, 3),
  r087: ['r088', 'r089'],
  r090: ['r091', 'r092'],
  r093: rowsOf(94, 96, 3),
  r097: ['r098', 'r099'],
  r103: rowsOf(104, 106, 3),
  r102: ['r103', ...rowsOf(107, 117, 3)],
  r118: ['r119', 'r120'],
  r123: rowsOf(124, 126, 3),
  r122: ['r123', ...rowsOf(127, 135, 3)],
  r136: ['r137', 'r138'],
  r101: ['r102', 'r118', 'r121', 'r122', 'r136', 'r139', 'r140'],
  r141: rowsOf(142, 145, 3),
}
/** Row 100, the result of the year, is what makes the balance sheet balance; row 080 and 079 add it in. */
const EQUITY_BEFORE_RESULT = ['r081', 'r085', 'r086', 'r087', 'r090', 'r093', 'r097']

export const POD_ASSET_LEAVES = POD_ASSET_ROWS.filter((r) => !(r in ASSET_SUMS))
export const POD_LIABILITY_LEAVES = POD_LIABILITY_ROWS.filter((r) => !(r in LIABILITY_SUMS) && r !== 'r079' && r !== 'r080' && r !== 'r100')

const PROFIT_SUMS = new Set(['r01', 'r02', 'r10', 'r15', 'r21', 'r27', 'r28', 'r29', 'r31', 'r35', 'r39', 'r45', 'r49', 'r55', 'r56', 'r57', 'r61'])
export const POD_PROFIT_LEAVES = POD_PROFIT_ROWS.filter((r) => !PROFIT_SUMS.has(r))
/** The sum rows of each statement, which the page always shows. */
export const POD_BALANCE_SUMS: ReadonlySet<string> = new Set([...Object.keys(ASSET_SUMS), ...Object.keys(LIABILITY_SUMS), 'r079', 'r080', 'r100'])
export const POD_PROFIT_SUMS: ReadonlySet<string> = PROFIT_SUMS

/** Where a row of either statement belongs, for the accountant's placements: an asset, a liability, a cost or revenue row; null for a sum or no row. */
export function podLeafKind(row: string): 'asset' | 'liability' | 'profit' | null {
  if (POD_ASSET_LEAVES.includes(row)) return 'asset'
  if (POD_LIABILITY_LEAVES.includes(row)) return 'liability'
  if (POD_PROFIT_LEAVES.includes(row)) return 'profit'
  return null
}

/**
 * Where a balance-sheet account goes: `gross` an asset row (its balance as it is, so a credit one subtracts), `fix` an
 * asset row's correction (a credit balance as a plus), `owe` a row of equity or liabilities (a credit balance as a plus,
 * so a debit one subtracts), `side` by the side of its balance (a debit to an asset row, a credit to a liability row),
 * `equity` a result of years before by its side (a credit to the first row, a debit to the second, as a minus).
 */
type Place = { gross: string } | { fix: string } | { owe: string } | { side: [string, string] } | { equity: [string, string] }

const P: readonly [string, Place][] = [
  // A. Fixed assets: intangible, tangible, financial; each with its accumulated depreciation and allowances.
  ['01', { gross: 'r008' }],
  ['012', { gross: 'r004' }],
  ['013', { gross: 'r005' }],
  ['014', { gross: 'r006' }],
  ['015', { gross: 'r007' }],
  ['07', { fix: 'r008' }],
  ['072', { fix: 'r004' }],
  ['073', { fix: 'r005' }],
  ['074', { fix: 'r006' }],
  ['075', { fix: 'r007' }],
  ['041', { gross: 'r009' }],
  ['051', { gross: 'r010' }],
  ['091', { fix: 'r008' }],
  ['093', { fix: 'r009' }],
  ['02', { gross: 'r017' }],
  ['021', { gross: 'r013' }],
  ['022', { gross: 'r014' }],
  ['025', { gross: 'r015' }],
  ['026', { gross: 'r016' }],
  ['03', { gross: 'r017' }],
  ['031', { gross: 'r012' }],
  ['08', { fix: 'r017' }],
  ['081', { fix: 'r013' }],
  ['082', { fix: 'r014' }],
  ['085', { fix: 'r015' }],
  ['086', { fix: 'r016' }],
  ['04', { gross: 'r018' }],
  ['042', { gross: 'r018' }],
  ['05', { gross: 'r019' }],
  ['052', { gross: 'r019' }],
  ['09', { fix: 'r017' }],
  ['092', { fix: 'r017' }],
  ['094', { fix: 'r018' }],
  ['095', { fix: 'r019' }],
  ['097', { gross: 'r020' }],
  ['098', { gross: 'r020' }],
  ['06', { gross: 'r028' }],
  ['061', { gross: 'r022' }],
  ['062', { gross: 'r023' }],
  ['063', { gross: 'r024' }],
  ['066', { gross: 'r025' }],
  ['067', { gross: 'r027' }],
  ['043', { gross: 'r031' }],
  ['053', { gross: 'r032' }],
  ['096', { fix: 'r028' }],
  // B.I Inventories and their allowances.
  ['1', { gross: 'r035' }],
  ['12', { gross: 'r036' }],
  ['123', { gross: 'r037' }],
  ['124', { gross: 'r038' }],
  ['13', { gross: 'r039' }],
  ['19', { fix: 'r035' }],
  ['192', { fix: 'r036' }],
  ['193', { fix: 'r036' }],
  ['194', { fix: 'r037' }],
  ['195', { fix: 'r038' }],
  ['196', { fix: 'r039' }],
  // B.IV and B.V Short-term financial assets and money; the bank's overdraft is a current loan.
  ['21', { gross: 'r072' }],
  ['22', { side: ['r073', 'r139'] }],
  ['26', { gross: 'r073' }],
  ['23', { owe: 'r139' }],
  ['24', { owe: 'r140' }],
  ['25', { gross: 'r068' }],
  ['252', { gross: 'r069' }],
  ['255', { owe: 'r140' }],
  ['259', { gross: 'r070' }],
  ['29', { fix: 'r068' }],
  // Receivables and liabilities by their side, short-term and with parties that are not related.
  ['31', { side: ['r057', 'r126'] }],
  ['316', { side: ['r058', 'r127'] }],
  ['32', { side: ['r057', 'r126'] }],
  ['323', { owe: 'r138' }],
  ['33', { side: ['r065', 'r131'] }],
  ['336', { side: ['r062', 'r132'] }],
  ['34', { side: ['r063', 'r133'] }],
  ['35', { side: ['r061', 'r130'] }],
  ['351', { side: ['r059', 'r128'] }],
  ['353', { owe: 'r084' }],
  ['36', { side: ['r061', 'r130'] }],
  ['361', { side: ['r059', 'r128'] }],
  ['37', { side: ['r065', 'r135'] }],
  ['373', { side: ['r064', 'r134'] }],
  ['376', { side: ['r064', 'r134'] }],
  ['377', { side: ['r064', 'r134'] }],
  ['38', { side: ['r076', 'r143'] }],
  ['383', { owe: 'r143' }],
  ['384', { owe: 'r145' }],
  ['385', { gross: 'r078' }],
  ['39', { side: ['r065', 'r135'] }],
  ['391', { fix: 'r057' }],
  ['398', { side: ['r061', 'r130'] }],
  // A. Equity: the result of years before stands by its side, 431 too while it waits to be distributed.
  ['41', { owe: 'r086' }],
  ['411', { owe: 'r082' }],
  ['412', { owe: 'r085' }],
  ['413', { owe: 'r086' }],
  ['414', { owe: 'r094' }],
  ['415', { owe: 'r095' }],
  ['416', { owe: 'r096' }],
  ['417', { owe: 'r088' }],
  ['418', { owe: 'r088' }],
  ['419', { owe: 'r083' }],
  ['42', { owe: 'r092' }],
  ['421', { owe: 'r088' }],
  ['422', { owe: 'r088' }],
  ['423', { owe: 'r091' }],
  ['428', { owe: 'r098' }],
  ['429', { owe: 'r099' }],
  ['43', { equity: ['r098', 'r099'] }],
  ['49', { owe: 'r082' }],
  // B. Long-term liabilities, provisions and loans; deferred tax by its side.
  ['45', { owe: 'r120' }],
  ['451', { owe: 'r119' }],
  ['46', { owe: 'r121' }],
  ['47', { owe: 'r110' }],
  ['471', { owe: 'r108' }],
  ['472', { owe: 'r114' }],
  ['473', { owe: 'r113' }],
  ['474', { owe: 'r115' }],
  ['475', { owe: 'r111' }],
  ['476', { owe: 'r106' }],
  ['478', { owe: 'r112' }],
  ['48', { side: ['r052', 'r117'] }],
]

/** Where an account goes in the balance sheet by the form, by the longest prefix listed; null for one it has no row for. */
function placeOf(account: string): Place | null {
  const plain = account.replace('.', '')
  let best: [string, Place] | null = null
  for (const entry of P) if (plain.startsWith(entry[0]) && (!best || entry[0].length > best[0].length)) best = entry
  return best ? best[1] : null
}

/** The kinds of row an account may be placed in: a cost or revenue in the profit and loss account, an asset's in assets, a liability's in liabilities, one by its side in either. */
export function podRowKinds(account: string): ('asset' | 'liability' | 'profit')[] {
  const cls = accountClass(account)
  if (cls === 5 || cls === 6) return ['profit']
  if (cls === 7) return []
  const place = placeOf(account)
  if (!place) return []
  if ('gross' in place || 'fix' in place) return ['asset']
  if ('owe' in place || 'equity' in place) return ['liability']
  return ['asset', 'liability']
}

/** Where a cost or a revenue goes in the profit and loss account, by its synthetic account. */
export function podProfitRowOf(account: string): string {
  const s = synthetic(account)
  const two = s.slice(0, 2)
  if (s === '604' || s === '607') return 'r03'
  if (s === '601') return 'r04'
  if (s === '602' || s === '606') return 'r05'
  if (two === '61') return 'r06'
  if (two === '62') return 'r07'
  if (s === '641' || s === '642') return 'r08'
  if (s === '661') return 'r30'
  if (s === '665') return 'r34'
  if (s === '666') return 'r38'
  if (s === '662') return 'r41'
  if (s === '663') return 'r42'
  if (s === '664' || s === '667') return 'r43'
  if (two === '66') return 'r44'
  if (accountClass(s) === 6) return 'r09'
  if (s === '504' || s === '507') return 'r11'
  if (s === '505') return 'r13'
  if (two === '50') return 'r12'
  if (two === '51') return 'r14'
  if (s === '523') return 'r17'
  if (s === '524' || s === '525' || s === '526') return 'r18'
  if (s === '527' || s === '528') return 'r19'
  if (two === '52') return 'r16'
  if (two === '53') return 'r20'
  if (s === '551') return 'r22'
  if (s === '553') return 'r23'
  if (s === '541' || s === '542') return 'r24'
  if (s === '547') return 'r25'
  if (s === '561') return 'r46'
  if (s === '566') return 'r47'
  if (s === '565') return 'r48'
  if (s === '562') return 'r51'
  if (s === '563') return 'r52'
  if (s === '564' || s === '567') return 'r53'
  if (two === '56') return 'r54'
  if (s === '592') return 'r59'
  if (s === '596') return 'r60'
  if (two === '59') return 'r58'
  return 'r26'
}

const sum = (lines: Lines, rows: readonly string[]): number => rows.reduce((s, r) => s + (lines[r] ?? 0), 0)

/** The sums of the assets, in each of their columns. */
function assetSums(lines: Lines): void {
  for (const [row, parts] of Object.entries(ASSET_SUMS)) lines[row] = sum(lines, parts)
}

/** The sums of equity and liabilities; row 100, the result, is what is left of the assets. */
function liabilitySums(lines: Lines, assets: number): void {
  for (const [row, parts] of Object.entries(LIABILITY_SUMS)) lines[row] = sum(lines, parts)
  lines.r100 = assets - (sum(lines, EQUITY_BEFORE_RESULT) + (lines.r101 ?? 0) + (lines.r141 ?? 0))
  lines.r080 = sum(lines, EQUITY_BEFORE_RESULT) + lines.r100
  lines.r079 = lines.r080 + (lines.r101 ?? 0) + (lines.r141 ?? 0)
}

/** The sums of the profit and loss account, the form's formulas; row 01, the net turnover, of the sales. */
function profitSums(p: Lines): void {
  const s = (...rows: string[]) => sum(p, rows)
  p.r01 = s('r03', 'r04', 'r05')
  p.r02 = s('r03', 'r04', 'r05', 'r06', 'r07', 'r08', 'r09')
  p.r15 = s('r16', 'r17', 'r18', 'r19')
  p.r21 = s('r22', 'r23')
  p.r10 = s('r11', 'r12', 'r13', 'r14', 'r15', 'r20', 'r21', 'r24', 'r25', 'r26')
  p.r27 = p.r02 - p.r10
  p.r28 = s('r03', 'r04', 'r05', 'r06', 'r07') - s('r11', 'r12', 'r13', 'r14')
  p.r31 = s('r32', 'r33', 'r34')
  p.r35 = s('r36', 'r37', 'r38')
  p.r39 = s('r40', 'r41')
  p.r29 = s('r30', 'r31', 'r35', 'r39', 'r42', 'r43', 'r44')
  p.r49 = s('r50', 'r51')
  p.r45 = s('r46', 'r47', 'r48', 'r49', 'r52', 'r53', 'r54')
  p.r55 = p.r29 - p.r45
  p.r56 = p.r27 + p.r55
  p.r57 = s('r58', 'r59')
  p.r61 = p.r56 - p.r57 - s('r60')
}

/** An account the accountant put in a row of her own (an analytic account wins over its synthetic one). */
export interface Placement {
  account: string
  row: string
}

/** The accountant's row for an account by its kind of row, the analytic account's own before its synthetic one's. */
function placed(placements: readonly Placement[], account: string, kind: 'asset' | 'liability' | 'profit'): string | null {
  let best: Placement | null = null
  for (const p of placements) {
    if (podLeafKind(p.row) !== kind) continue
    if (p.account === account || (p.account === synthetic(account) && !best)) best = p
  }
  return best ? best.row : null
}

export interface PodStatements {
  /** The net of each asset row, and each row of equity and liabilities, in cents as the books hold them. */
  balance: Lines
  /** Each asset row's gross amount and correction (the net is `balance`). */
  gross: Lines
  fix: Lines
  profit: Lines
  /** In whole euros, as the statements are filed. */
  balanceEur: Lines
  grossEur: Lines
  fixEur: Lines
  profitEur: Lines
  /** The rounding put in row 073 when the result would not agree with the profit and loss account's. */
  rounding: number
  unplaced: string[]
}

const empty = (rows: readonly string[]): Lines => Object.fromEntries(rows.map((r) => [r, 0])) as Lines

/**
 * The statements of a small or a large entity from every account's closing balance (debit plus, credit minus): each
 * cost and revenue by its synthetic account, each balance account by its own (a bank's accounts each by its side, an
 * overdraft is a loan), the accountant's placements over the form's.
 */
export function podStatements(balances: ReadonlyMap<string, number>, placements: readonly Placement[] = []): PodStatements {
  const gross = empty(POD_ASSET_ROWS)
  const fix = empty(POD_ASSET_ROWS)
  const owe = empty(POD_LIABILITY_ROWS)
  const profit = empty(POD_PROFIT_ROWS)
  const unplaced: string[] = []
  const add = (lines: Lines, row: string, cents: number) => (lines[row] = (lines[row] ?? 0) + cents)
  // A synthetic account's analytic ones together, unless the accountant placed one of them.
  const byAccount = new Map<string, number>()
  for (const [account, cents] of balances) {
    if (cents === 0) continue
    const cls = accountClass(account)
    if (cls === 7) continue
    if (cls === 5 || cls === 6) {
      const row = placed(placements, account, 'profit') ?? podProfitRowOf(account)
      add(profit, row, cls === 6 ? -cents : cents)
      continue
    }
    // A bank's accounts each by its side, and deferred tax's asset and liability apart (§ 10(16) of the measure on accounting procedures).
    const own = synthetic(account) === '221' || synthetic(account) === '481' || placements.some((p) => p.account === account)
    const key = own ? account : synthetic(account)
    byAccount.set(key, (byAccount.get(key) ?? 0) + cents)
  }
  for (const [account, cents] of byAccount) {
    if (cents === 0) continue
    const place = placeOf(account)
    if (!place) {
      unplaced.push(account)
      continue
    }
    const asset = placed(placements, account, 'asset')
    const liability = placed(placements, account, 'liability')
    if ('gross' in place) add(gross, asset ?? place.gross, cents)
    else if ('fix' in place) add(fix, asset ?? place.fix, -cents)
    else if ('owe' in place) add(owe, liability ?? place.owe, -cents)
    else if ('side' in place) {
      if (cents > 0) add(gross, asset ?? place.side[0], cents)
      else add(owe, liability ?? place.side[1], -cents)
    } else if (cents < 0) add(owe, liability ?? place.equity[0], -cents)
    else add(owe, place.equity[1], -cents)
  }
  const assemble = (g: Lines, f: Lines, o: Lines): Lines => {
    assetSums(g)
    assetSums(f)
    const balance: Lines = {}
    for (const r of POD_ASSET_ROWS) balance[r] = (g[r] ?? 0) - (f[r] ?? 0)
    for (const r of POD_LIABILITY_ROWS) balance[r] = o[r] ?? 0
    liabilitySums(balance, balance.r001 ?? 0)
    return balance
  }
  profitSums(profit)
  const balance = assemble(gross, fix, owe)
  // In whole euros: each row rounded, the sums made again of them; the result must be the same on both statements.
  const eur = (cents: number) => Math.round(cents / 100)
  const grossEur = empty(POD_ASSET_ROWS)
  const fixEur = empty(POD_ASSET_ROWS)
  const oweEur = empty(POD_LIABILITY_ROWS)
  const profitEur = empty(POD_PROFIT_ROWS)
  for (const r of POD_ASSET_LEAVES) {
    grossEur[r] = eur(gross[r] ?? 0)
    fixEur[r] = eur(fix[r] ?? 0)
  }
  for (const r of POD_LIABILITY_LEAVES) oweEur[r] = eur(owe[r] ?? 0)
  for (const r of POD_PROFIT_LEAVES) profitEur[r] = eur(profit[r] ?? 0)
  profitSums(profitEur)
  let balanceEur = assemble(grossEur, fixEur, oweEur)
  const rounding = (profitEur.r61 ?? 0) - (balanceEur.r100 ?? 0)
  if (rounding !== 0) {
    grossEur.r073 = (grossEur.r073 ?? 0) + rounding
    balanceEur = assemble(grossEur, fixEur, oweEur)
  }
  return { balance, gross, fix, profit, balanceEur, grossEur, fixEur, profitEur, rounding, unplaced: unplaced.sort() }
}
