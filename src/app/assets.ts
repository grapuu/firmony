// Fixed assets and their depreciation (dlhodobý majetok a odpisy), his word of 17 October 2026: the software must
// manage every size of company, and with them the assets every larger company has. Pure functions: assets-store.ts
// reads and writes the register, the books take the entries it gives, the closing its tax depreciation.
//
// The tax depreciation follows Act No. 595/2003 Z. z. on income tax as it stands from 1 January 2026, read in the
// original on slov-lex on 17 October 2026:
// - § 22(2): tangible assets are things of an entry price over 1 700 € and a life over a year; § 22(7) intangible
//   ones over 2 400 €; § 22(8) intangible assets are depreciated for tax as the books depreciate them.
// - § 26(1): the groups 0 to 6 depreciate in 2, 4, 6, 8, 12, 20 and 40 years; § 26(3) groups 2 and 3 may be
//   depreciated in the accelerated way, chosen for each new asset and kept.
// - § 27: straight line, the entry price over the years of the group; in the first year only the share of the months
//   from the month the asset was put in use to the year's end, the rest in the year after the period ends.
// - § 28: accelerated, coefficients 6 and 7 (group 2), 8 and 9 (group 3); the first year the entry price over the first
//   coefficient for the months in use, then twice the residual value over (the further coefficient less the years
//   already depreciated), the residual value of the second year counted from the first year's full amount; the part of
//   the first year not claimed comes in the year after the period ends.
// - § 47: every amount to the cent, half up.
// - § 22(11): a year's depreciation is claimed for an asset recorded on the year's last day; an asset disposed of in a
//   year gets none that year (its residual value is the expense, § 19(3)(b)), except the share of § 22(12) for an
//   asset whose residual value counts only up to what its sale brought (a car of KP 29.10.2 sold), which is shown.
// - § 17(34): a car of KP 29.10.2 of an entry price of 48 000 € or more: the register shows its depreciation from
//   48 000 € beside the real one, for the closing to add back the difference when the law asks.
// The books depreciate either as the tax does (the year's amount spread over the months it covers) or in a number of
// months the accountant sets (straight line from the month of putting in use); intangible assets only so.

/** The asset accounts the register keeps, each with its kind, its accumulated depreciation and its acquisition account. */
export const ASSET_ACCOUNTS = {
  '013': { kind: 'intangible', contra: '073', acquisition: '041' },
  '014': { kind: 'intangible', contra: '074', acquisition: '041' },
  '019': { kind: 'intangible', contra: '079', acquisition: '041' },
  '021': { kind: 'tangible', contra: '081', acquisition: '042' },
  '022': { kind: 'tangible', contra: '082', acquisition: '042' },
  '029': { kind: 'tangible', contra: '089', acquisition: '042' },
} as const
export type AssetAccount = keyof typeof ASSET_ACCOUNTS
export const isAssetAccount = (value: unknown): value is AssetAccount => typeof value === 'string' && Object.hasOwn(ASSET_ACCOUNTS, value)
export const assetKind = (account: AssetAccount) => ASSET_ACCOUNTS[account].kind

/** § 26(1): years of each depreciation group. */
export const GROUP_YEARS: Readonly<Record<number, number>> = { 0: 2, 1: 4, 2: 6, 3: 8, 4: 12, 5: 20, 6: 40 }
/** § 28(1): the accelerated coefficients of groups 2 and 3, in the first year and in the further ones. */
export const ACCELERATED: Readonly<Record<number, { first: number; further: number }>> = { 2: { first: 6, further: 7 }, 3: { first: 8, further: 9 } }
/** § 17(34): the entry price above which a car's depreciation counts only from this. */
export const CAR_LIMIT_CENTS = 4_800_000

export type TaxMethod = 'straight' | 'accelerated'
export type Disposal = 'sale' | 'liquidation' | 'damage' | 'gift'
export const DISPOSALS: readonly Disposal[] = ['sale', 'liquidation', 'damage', 'gift']
/** What a disposal costs in the books: the residual value of a sold asset on 541, a liquidated one on 551, a damaged one on 549, a gift on 543. */
export const DISPOSAL_ACCOUNT: Readonly<Record<Disposal, string>> = { sale: '541', liquidation: '551', damage: '549', gift: '543' }

export interface Asset {
  id: string
  /** The inventory number (M-2027-001). */
  number: string
  name: string
  account: AssetAccount
  /** The day it was put in use (zaradenie do užívania). */
  inUseOn: string
  costCents: number
  /** 0 to 6 for a tangible asset; null for an intangible one. */
  taxGroup: number | null
  taxMethod: TaxMethod
  /** A passenger car of KP 29.10.2 (§ 17(34), § 19(3)(b)). */
  car: boolean
  /** The books' own months of depreciation; null: as the tax depreciates (a tangible asset only). */
  bookMonths: number | null
  /** 'purchase': put in use from 041 or 042 in these books; 'opening': in the opening balances already. */
  source: 'purchase' | 'opening'
  /** For an asset from before the books: what the books and the tax depreciated of it before, and in how many years. */
  priorBookCents: number
  priorTaxCents: number
  priorTaxYears: number
  disposedOn: string | null
  disposal: Disposal | null
  /** The company's cost centre the asset serves (centers.ts): its depreciation and disposal count there. */
  centerId?: string | null
}

/** § 47: to the cent, half up (amounts are cents, so a fraction of a cent rounds; halves go up). */
const round = (cents: number): number => Math.floor(cents + 0.5 + 1e-9)
const yearOf = (day: string) => Number(day.slice(0, 4))
const monthOf = (day: string) => Number(day.slice(5, 7))

/** What the asset's tax depreciation is in each year, and what is left after it. */
export interface TaxYear {
  year: number
  /** The year's depreciation claimed (0 in the year it is disposed of, but for the share of § 22(12) shown apart). */
  cents: number
  /** § 22(12): the share of a year for a car sold, its residual value counting only up to the price. */
  saleShare: number
  /** The residual value for tax at the year's end (after its depreciation). */
  residual: number
  /** § 17(34): the depreciation from 48 000 € for a car above it, null otherwise. */
  limited: number | null
}

/** The tax depreciation of a tangible asset, year by year from the year it was put in use until it is depreciated or disposed of. */
export function taxSchedule(a: Asset): TaxYear[] {
  if (assetKind(a.account) === 'intangible') return bookYearsAsTax(a)
  const group = a.taxGroup ?? 2
  const years = GROUP_YEARS[group] ?? 6
  const start = yearOf(a.inUseOn)
  const months = 13 - monthOf(a.inUseOn)
  const out: TaxYear[] = []
  const end = a.disposedOn ? yearOf(a.disposedOn) : Infinity
  const limitedAnnual = a.car && a.costCents >= CAR_LIMIT_CENTS ? round(CAR_LIMIT_CENTS / years) : null
  let residual = a.costCents - (a.source === 'opening' ? a.priorTaxCents : 0)
  // The year to start from: the first year, or for an asset from before the books the year after its last depreciated one.
  let year = a.source === 'opening' ? start + a.priorTaxYears : start
  let n = a.source === 'opening' ? a.priorTaxYears + 1 : 1
  const accelerated = a.taxMethod === 'accelerated' && ACCELERATED[group]
  const annual = round(a.costCents / years)
  const firstFull = accelerated ? round(a.costCents / accelerated.first) : annual
  const firstClaimed = round((firstFull * months) / 12)
  // § 28(2)(b)(1): the second year's residual value, counted from the first year's full amount.
  let acceleratedResidual = a.costCents - firstFull
  if (a.source === 'opening' && accelerated) acceleratedResidual = a.costCents - a.priorTaxCents
  for (let guard = 0; residual > 0 && guard < 60; guard++, year++, n++) {
    if (year > end) break
    let cents: number
    if (n === 1) cents = firstClaimed
    // Straight: the full year's amount; the period's last year takes what is left when nothing was deferred (a first
    // year of twelve months), else the year after the period takes the deferred part (§ 27(2)(a)).
    else if (!accelerated) cents = n < years ? annual : n === years && firstClaimed === firstFull ? residual : n === years ? annual : residual
    else if (n <= years) {
      const divisor = accelerated.further - (n - 1)
      cents = divisor <= 1 ? acceleratedResidual : round((2 * acceleratedResidual) / divisor)
      acceleratedResidual -= Math.min(cents, acceleratedResidual)
    } else cents = residual
    cents = Math.min(cents, residual)
    const limited = limitedAnnual === null ? null : n === 1 ? round((limitedAnnual * months) / 12) : limitedAnnual
    if (year === end) {
      // Disposed of this year: no year's depreciation; a car sold may take the share of its full months (§ 22(12)).
      const share = a.disposal === 'sale' && a.car && n > 1 ? Math.min(residual, round((cents * (monthOf(a.disposedOn as string) - 1)) / 12)) : 0
      out.push({ year, cents: 0, saleShare: share, residual: residual - share, limited })
      break
    }
    residual -= cents
    out.push({ year, cents, saleShare: 0, residual, limited })
  }
  return out
}

/** An intangible asset's tax depreciation is its books' (§ 22(8)): the books' year sums. */
function bookYearsAsTax(a: Asset): TaxYear[] {
  const byYear = new Map<number, number>()
  for (const m of bookMonths(a)) byYear.set(yearOf(m.month), (byYear.get(yearOf(m.month)) ?? 0) + m.cents)
  let residual = a.costCents - (a.source === 'opening' ? a.priorTaxCents : 0)
  return [...byYear.entries()].map(([year, cents]) => {
    residual -= cents
    return { year, cents, saleShare: 0, residual, limited: null }
  })
}

/** One month's depreciation in the books. */
export interface BookMonth {
  /** YYYY-MM. */
  month: string
  cents: number
}

const nextMonth = (month: string): string => {
  const y = Number(month.slice(0, 4))
  const m = Number(month.slice(5, 7))
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
}

/**
 * The books' depreciation, month by month: in a number of months the accountant set (straight line from the month
 * of putting in use, the last month taking what rounding left), or as the tax depreciates (each year's amount over
 * the months of that year it covers). Nothing in the month of disposal or after it.
 */
export function bookMonths(a: Asset): BookMonth[] {
  const stop = a.disposedOn ? a.disposedOn.slice(0, 7) : null
  const out: BookMonth[] = []
  if (a.bookMonths !== null || assetKind(a.account) === 'intangible') {
    const months = Math.max(1, a.bookMonths ?? 36)
    const monthly = round(a.costCents / months)
    let left = a.costCents - (a.source === 'opening' ? a.priorBookCents : 0)
    let month = a.inUseOn.slice(0, 7)
    // An asset from before the books: its months already depreciated are behind it.
    if (a.source === 'opening') for (let i = 0; i < Math.round(a.priorBookCents / Math.max(1, monthly)); i++) month = nextMonth(month)
    for (let guard = 0; left > 0 && guard < 1200; guard++, month = nextMonth(month)) {
      if (stop && month >= stop) break
      const cents = Math.min(left, monthly)
      out.push({ month, cents })
      left -= cents
    }
    return out
  }
  for (const y of taxSchedule(a)) {
    if (y.cents === 0) continue
    const first = y.year === yearOf(a.inUseOn) ? monthOf(a.inUseOn) : 1
    const months = 13 - first
    const each = Math.floor(y.cents / months)
    for (let m = first; m <= 12; m++) {
      const month = `${y.year}-${String(m).padStart(2, '0')}`
      if (stop && month >= stop) break
      out.push({ month, cents: m === 12 ? y.cents - each * (months - 1) : each })
    }
  }
  return out
}

/** The books' accumulated depreciation and residual value at the end of a month (or before the asset's first one). */
export function bookState(a: Asset, through: string): { accumulated: number; residual: number } {
  const depreciated = bookMonths(a).filter((m) => m.month <= through).reduce((sum, m) => sum + m.cents, 0)
  const accumulated = (a.source === 'opening' ? a.priorBookCents : 0) + depreciated
  return { accumulated, residual: a.costCents - accumulated }
}

/** A line of an entry the register gives the books. */
export interface AssetLine {
  md: string
  d: string
  cents: number
}

export interface AssetEntry {
  key: string
  on: string
  number: string
  text: string
  lines: AssetLine[]
  asset: string | null
  /** Each cost centre's part of the entry's costs (class 5), for the centres' report (centers.ts); the books' lines stay as they are. */
  centerCosts?: { center: string; cents: number }[]
}

const monthEndDay = (month: string): string => {
  const y = Number(month.slice(0, 4))
  const m = Number(month.slice(5, 7))
  return `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`
}

/**
 * The entries the register gives the books up to a day: putting in use (from 041 or 042), every month's depreciation
 * in one entry on its last day (551 against each accumulated account), and each disposal (the accumulated depreciation
 * against the asset, the residual value as its cost). A month's entry comes once the month has ended.
 */
export function assetEntries(assets: readonly Asset[], asOf: string): AssetEntry[] {
  const entries: AssetEntry[] = []
  const months = new Map<string, Map<string, number>>()
  // Each month's depreciation of the assets of each cost centre.
  const centres = new Map<string, Map<string, number>>()
  for (const a of assets) {
    const acc = ASSET_ACCOUNTS[a.account]
    if (a.source === 'purchase' && a.inUseOn <= asOf)
      entries.push({ key: `a:${a.id}:in`, on: a.inUseOn, number: a.number, text: `Zaradenie do užívania: ${a.name}`, lines: [{ md: a.account, d: acc.acquisition, cents: a.costCents }], asset: a.id })
    for (const m of bookMonths(a)) {
      if (monthEndDay(m.month) > asOf) break
      const byAccount = months.get(m.month) ?? new Map<string, number>()
      byAccount.set(acc.contra, (byAccount.get(acc.contra) ?? 0) + m.cents)
      months.set(m.month, byAccount)
      if (a.centerId && m.cents > 0) {
        const byCentre = centres.get(m.month) ?? new Map<string, number>()
        byCentre.set(a.centerId, (byCentre.get(a.centerId) ?? 0) + m.cents)
        centres.set(m.month, byCentre)
      }
    }
    if (a.disposedOn && a.disposal && a.disposedOn <= asOf) {
      const before = a.disposedOn.slice(0, 7)
      const prior = bookMonths(a).filter((m) => m.month < before).reduce((s, m) => s + m.cents, 0) + (a.source === 'opening' ? a.priorBookCents : 0)
      const lines: AssetLine[] = [
        { md: acc.contra, d: a.account, cents: prior },
        { md: DISPOSAL_ACCOUNT[a.disposal], d: a.account, cents: a.costCents - prior },
      ].filter((l) => l.cents > 0)
      // The residual value written off (a cost of class 5) is the asset's centre's.
      const residual = lines.filter((l) => l.md.startsWith('5')).reduce((s, l) => s + l.cents, 0)
      if (lines.length)
        entries.push({
          key: `a:${a.id}:out`,
          on: a.disposedOn,
          number: a.number,
          text: `Vyradenie: ${a.name}`,
          lines,
          asset: a.id,
          ...(a.centerId && residual > 0 ? { centerCosts: [{ center: a.centerId, cents: residual }] } : {}),
        })
    }
  }
  for (const [month, byAccount] of [...months.entries()].sort(([x], [y]) => x.localeCompare(y))) {
    const lines = [...byAccount.entries()].sort(([x], [y]) => x.localeCompare(y)).map(([contra, cents]) => ({ md: '551', d: contra, cents })).filter((l) => l.cents > 0)
    const byCentre = [...(centres.get(month) ?? new Map<string, number>()).entries()].sort(([x], [y]) => x.localeCompare(y)).map(([center, cents]) => ({ center, cents }))
    if (lines.length)
      entries.push({
        key: `a:odpisy:${month}`,
        on: monthEndDay(month),
        number: `ODP ${month.slice(5, 7)}/${month.slice(0, 4)}`,
        text: `Odpisy majetku za ${Number(month.slice(5, 7))}/${month.slice(0, 4)}`,
        lines,
        asset: null,
        ...(byCentre.length > 0 ? { centerCosts: byCentre } : {}),
      })
  }
  return entries
}

/** What the register says for a year's closing: the books' and the tax depreciation of tangible assets, and the shares on sale. */
export interface AssetYear {
  /** The books' depreciation of tangible assets in the year (Table B row 1). */
  bookTangible: number
  /** The books' depreciation of intangible assets in the year (in 551, not in Table B). */
  bookIntangible: number
  /** The tax depreciation of tangible assets in the year (Table B row 2). */
  taxTangible: number
  /** § 22(12) shares on sale (Table B row 5). */
  saleShares: number
  /** § 17(34): what the tax depreciation of cars above 48 000 € exceeds their depreciation from 48 000 €. */
  carExcess: number
  /** Assets disposed of in the year: the tax and the books' residual values, for the return. */
  disposedTax: number
  disposedBook: number
  /** The books' residual values of assets liquidated in the year, which the register books on 551. */
  liquidated: number
}

export function assetYear(assets: readonly Asset[], year: number): AssetYear {
  const out: AssetYear = { bookTangible: 0, bookIntangible: 0, taxTangible: 0, saleShares: 0, carExcess: 0, disposedTax: 0, disposedBook: 0, liquidated: 0 }
  for (const a of assets) {
    const book = bookMonths(a).filter((m) => yearOf(m.month) === year).reduce((s, m) => s + m.cents, 0)
    if (assetKind(a.account) === 'intangible') out.bookIntangible += book
    else {
      out.bookTangible += book
      const y = taxSchedule(a).find((t) => t.year === year)
      if (y) {
        out.taxTangible += y.cents
        out.saleShares += y.saleShare
        if (y.limited !== null) out.carExcess += Math.max(0, y.cents - y.limited)
      }
    }
    if (a.disposedOn && yearOf(a.disposedOn) === year) {
      const tax = taxSchedule(a).find((t) => t.year === year)
      out.disposedTax += tax ? tax.residual : 0
      const book = bookState(a, `${year - 1}-12`).residual - bookMonths(a).filter((m) => yearOf(m.month) === year).reduce((s, m) => s + m.cents, 0)
      out.disposedBook += book
      if (a.disposal === 'liquidation') out.liquidated += book
    }
  }
  return out
}

/**
 * The temporary differences of the register at a year's end, for deferred tax (§ 10(5) of the measure on accounting
 * procedures): each asset in use and not disposed of, its residual value in the books against its tax base (the cost
 * less the tax depreciation claimed). A book value above the tax base will be taxed later (taxable), one below it
 * will lower the tax later (deductible). An intangible asset depreciates for tax as in the books, so it has none.
 */
export function temporaryDifferences(assets: readonly Asset[], year: number): { taxable: number; deductible: number } {
  let taxable = 0
  let deductible = 0
  for (const a of assets) {
    if (yearOf(a.inUseOn) > year || (a.disposedOn && yearOf(a.disposedOn) <= year)) continue
    const book = bookState(a, `${year}-12`).residual
    const claimed = taxSchedule(a).filter((t) => t.year <= year)
    const tax = claimed.length > 0 ? (claimed[claimed.length - 1] as TaxYear).residual : a.costCents - (a.source === 'opening' ? a.priorTaxCents : 0)
    if (book > tax) taxable += book - tax
    else deductible += tax - book
  }
  return { taxable, deductible }
}

/** What a new or changed asset must be, said as the form says it; empty when it is fine. */
export function assetErrors(a: Omit<Asset, 'id' | 'number'>): Partial<Record<'name' | 'account' | 'inUseOn' | 'cost' | 'group' | 'method' | 'months' | 'prior' | 'disposal', string>> {
  const e: ReturnType<typeof assetErrors> = {}
  const kind = isAssetAccount(a.account) ? assetKind(a.account) : null
  if (a.name.trim().length < 2) e.name = 'Napíšte názov majetku.'
  if (!kind) e.account = 'Vyberte účet majetku.'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a.inUseOn)) e.inUseOn = 'Zadajte deň zaradenia do užívania.'
  if (!Number.isSafeInteger(a.costCents) || a.costCents <= 0) e.cost = 'Zadajte vstupnú cenu.'
  else if (kind === 'tangible' && a.account !== '021' && a.costCents <= 170_000) e.cost = 'Hmotný majetok do 1 700 € nie je dlhodobý majetok na daňové odpisovanie (§ 22 ods. 2). Účtuje sa do nákladov.'
  else if (kind === 'intangible' && a.costCents <= 240_000) e.cost = 'Nehmotný majetok do 2 400 € nie je dlhodobý majetok na daňové odpisovanie (§ 22 ods. 7).'
  if (kind === 'tangible' && (a.taxGroup === null || !(a.taxGroup in GROUP_YEARS))) e.group = 'Vyberte odpisovú skupinu.'
  if (a.taxMethod === 'accelerated' && !(a.taxGroup !== null && a.taxGroup in ACCELERATED)) e.method = 'Zrýchlene sa odpisuje len majetok skupiny 2 a 3 (§ 26 ods. 3).'
  if ((kind === 'intangible' && a.bookMonths === null) || (a.bookMonths !== null && (!Number.isInteger(a.bookMonths) || a.bookMonths < 1 || a.bookMonths > 1200)))
    e.months = 'Zadajte počet mesiacov účtovného odpisovania.'
  if (a.source === 'opening' && (a.priorBookCents < 0 || a.priorTaxCents < 0 || a.priorBookCents > a.costCents || a.priorTaxCents > a.costCents || a.priorTaxYears < 0 || a.priorTaxYears > 40))
    e.prior = 'Skontrolujte doterajšie oprávky a daňové odpisy.'
  if (a.disposedOn !== null && (!/^\d{4}-\d{2}-\d{2}$/.test(a.disposedOn) || a.disposedOn < a.inUseOn || !a.disposal)) e.disposal = 'Zadajte deň a spôsob vyradenia, nie pred zaradením.'
  return e
}
