// The adjustment of the VAT deducted on investment property (úprava odpočítanej dane pri investičnom majetku, § 54 to
// § 54d of Act No. 222/2004 Z. z.), for a company whose building, machine or car is used later otherwise than when it was
// first used: rented free of VAT, used for a share of exempt supplies by the coefficient, or more or less privately.
// Read on 18 October 2026, through WebFetch (the browser pane was not connected):
// - Act No. 354/2024 Z. z. (static.slov-lex.sk, its text as published; zakonypreludi.sk's copy of its version of
//   1 January 2025): § 52a(1)(a) first use is the first real use for supplies with the right to deduct; § 52a(2) the
//   adjustment period is 5 calendar years for investment property of § 54(2)(a) and (d), 20 for (b) and (c), the year of
//   first use included; § 52a(3) a fiscal year counts as the calendar year. § 54(1) a payer who changes the purpose of
//   investment property's use in a period after its first use must adjust the deduction down when more was deducted at
//   first use than could be deducted in the year of the change, and may adjust it up when less was. § 54(2) investment
//   property: movables above 1 700 € without VAT, buildings, building plots, flats and non-residential premises,
//   extensions and alterations that needed a building permit, intangible property above 2 400 €. § 54a (real estate)
//   and § 54d (movables and intangibles deducted only for their business share, or not at all) the same for a change of
//   the share used for business, in the year's last period, by annex 1. Annex 1: DD = DV × (A − B) × R / 5 (or / 20);
//   DD below nought is tax deductible in addition, above nought tax no longer deductible; DV the tax of the acquisition
//   price or own costs; A the share deducted at first use, B the share deductible in the year the grounds arise, both
//   rounded up to two decimal places; R the calendar years left of the period, the year of the change included, when the
//   property is supplied before the period ends, otherwise 1. § 85kp(2): property whose period began under the former
//   rules by 31 December 2024 keeps the former § 54, § 54a, § 54d and annex 1.
// - The former rules, as Finančné riaditeľstvo's methodical guideline to § 54 of 6 June 2019 explains them: the
//   adjustment once, in the year's last period of the change, for every year left (R the years left, the year of the
//   change included), and A the share last deducted; § 54(6) no adjustment when A and B differ by 0,10 or less; § 54(7)
//   property supplied in the period with VAT, or exempt with the right to deduct, counts as used for supplies with the
//   right until the period ends, exempt without it as used for supplies without it. The 2024 amendment changed neither
//   paragraph (podnikajte.sk, "Zmena úpravy odpočítanej DPH pri investičnom majetku od roku 2025", 19 May 2025, with
//   its worked examples: a car deducted with nothing, used for business alone from 2027, one fifth of 18 400 € = 3 680 €
//   deducted in addition each year of the period).
// - The return's instructions (DPH, poučenie of 2021 kept by the form of 2025, point 36): the adjustment is in rows 18
//   and 19 of the return of the year's last period only, with the sign of what it does (more deductible plus, less
//   minus); rows 32 and 33 then take row 19 as it is. The control statement has no line of it.
//
// How it is kept here, from the register of fixed assets (assets.ts):
// - The accountant gives an asset what its VAT was (`asset_vat`): DV by rate, the year of first use (for property whose
//   period began by 2024 the year it began), the share deducted then (A), the share used for business then (§ 49(5),
//   § 49a), whether its use is fixed (taxable or exempt) or by the year's coefficient (§ 50), and for a sale or a gift in
//   the period whether it was taxed (or exempt with the right to deduct) or exempt without the right.
// - Each change of its use from a year on (`asset_vat_uses`): for taxable supplies, for exempt supplies, by the year's
//   coefficient, or a share typed; and the share used for business. A use stays until the next change.
// - `assetYears` works out each year of the period after the year of first use (a change within it is a correction of
//   § 53, not of § 54): B from the use of the year (the year's coefficient settled by § 50(4) for a use by coefficient;
//   none settled keeps the year's last period back), the threshold of § 54(6) when the business share is as at first use
//   (§ 54a and § 54d, as read, name none), R as annex 1 or the former rules say, every amount to the cent per rate. The
//   year of a sale or a gift takes the kind of the supply and the years left; after a sale, a gift, a liquidation or a
//   damage nothing more is adjusted.
// - vat.ts adds a year's adjustments to rows 18 to 19 of its last period by rate; the books (ledger.ts) take them on
//   31 December against 548, as the coefficient's settlement (practices differ).
// Not built: the transitional period of ten years for real estate of 2004 to 2010 (§ 85j), the cash accounting scheme
// (§ 54c), a legal successor's continuation (§ 54b: the successor types what the predecessor told it), a fiscal year,
// DV at the rates before 2025 (20 % and 10 %: the row of the return they go into was not read), building plots (not in
// the register), the correction at first use itself (§ 53(1)(c), booked by the accountant).

export type AssetUse = 'taxable' | 'exempt' | 'ratio' | 'share'
export const ASSET_USES: readonly AssetUse[] = ['taxable', 'exempt', 'ratio', 'share']
export const isAssetUse = (value: unknown): value is AssetUse => typeof value === 'string' && (ASSET_USES as readonly string[]).includes(value)

/** How an asset's use is read in a year without a change of its own: as at first use, or by the year's coefficient. */
export type AssetRegime = 'fixed' | 'ratio'
/** A sale or a gift in the period: taxed or exempt with the right to deduct ('taxed'), exempt without it ('exempt'). */
export type AssetSale = 'taxed' | 'exempt'

/** The rates the return's deduction rows hold (vat.ts DEDUCT_ROWS). */
export const ASSET_VAT_RATES = [23, 19, 5] as const

export interface AssetVatLine {
  rate: number
  vat: number
}

export interface AssetVatUse {
  id: string
  /** The year the use holds from, until the next change. */
  from: number
  use: AssetUse
  /** A share typed, in hundredths (the use 'share' only). */
  share: number | null
  /** The share used for business, in hundredths. */
  business: number
}

export interface AssetVat {
  assetId: string
  number: string
  name: string
  account: string
  inUseOn: string
  disposedOn: string | null
  disposal: string | null
  /** DV: the tax of the acquisition price or own costs, by rate. */
  lines: AssetVatLine[]
  /** The year of first use; for property under the former rules the year its period began. */
  firstYear: number
  /** A: the share deducted at first use, in hundredths. */
  deducted: number
  /** The share used for business at first use, in hundredths. */
  business: number
  regime: AssetRegime
  sale: AssetSale | null
  uses: AssetVatUse[]
}

/** § 52a(2): five years for movables and intangibles, twenty for buildings (the register's 021). */
export const periodLength = (account: string): 5 | 20 => (account === '021' ? 20 : 5)
export const lastYearOf = (v: Pick<AssetVat, 'firstYear' | 'account'>): number => v.firstYear + periodLength(v.account) - 1
/** § 85kp(2): a period that began by 2024 keeps the former rules. */
export const isFormer = (v: Pick<AssetVat, 'firstYear'>): boolean => v.firstYear <= 2024

/** One year's adjustment: positive `deduct` is tax deductible in addition (DD below nought), negative tax no longer deductible. */
export interface AssetAdjustment {
  assetId: string
  number: string
  name: string
  year: number
  a: number
  b: number
  r: number
  n: number
  /** Why: the year's use, or a supply in the period (§ 54(7)). */
  reason: 'use' | 'sale'
  lines: { rate: number; deduct: number }[]
  deduct: number
}

/** A year the adjustment cannot be worked out yet: its coefficient not settled, or a supply without its kind. */
export interface AssetMissing {
  assetId: string
  number: string
  year: number
  code: 'ratio' | 'sale'
}

/** A year of the plan as the asset's page shows it: what B is, and what came of it. */
export interface AssetPlanYear {
  year: number
  a: number
  b: number | null
  r: number
  /** 'same' as A, 'below' the threshold of § 54(6), 'missing', 'adjust', 'sale', 'after' a disposal, 'first' the year of first use. */
  state: 'first' | 'same' | 'below' | 'missing' | 'adjust' | 'sale' | 'after'
  deduct: number
  /** What a 'missing' year lacks. */
  missing?: AssetMissing['code']
}

const up = (hundredths: number): number => Math.ceil(hundredths - 1e-9)
/** Half up to the cent, a minus amount the same way as its plus one. */
const cents = (value: number): number => Math.sign(value) * Math.floor(Math.abs(value) + 0.5 + 1e-9)

/** The use that holds in a year: the latest change from that year or before. */
export function useOf(v: AssetVat, year: number): AssetVatUse | null {
  let found: AssetVatUse | null = null
  for (const u of v.uses) if (u.from <= year && (!found || u.from > found.from)) found = u
  return found
}

/** The year of a disposal in the period, and whether it was a supply (a sale or a gift). */
function disposalOf(v: AssetVat): { year: number; supply: boolean } | null {
  if (!v.disposedOn || !v.disposal) return null
  return { year: Number(v.disposedOn.slice(0, 4)), supply: v.disposal === 'sale' || v.disposal === 'gift' }
}

/**
 * Every year of an asset's period: its B, R and the adjustment, by the rules its period began under. `coefOf` gives a
 * year's coefficient settled by § 50(4) (hundredths), null when it is not.
 */
export function assetPlan(v: AssetVat, coefOf: (year: number) => number | null): { years: AssetPlanYear[]; adjustments: AssetAdjustment[]; missing: AssetMissing[] } {
  const n = periodLength(v.account)
  const last = lastYearOf(v)
  const former = isFormer(v)
  const out = disposalOf(v)
  // A sale or a gift in the year of first use still changes the purpose after it: every year of the period at once.
  const soldFirst = out?.supply === true && out.year === v.firstYear
  const years: AssetPlanYear[] = soldFirst ? [] : [{ year: v.firstYear, a: v.deducted, b: null, r: 0, state: 'first', deduct: 0 }]
  const adjustments: AssetAdjustment[] = []
  const missing: AssetMissing[] = []
  let a = v.deducted
  // The business share A stands for: at first use, and under the former rules the one last adjusted to (§ 54a, § 54d).
  let aBusiness = v.business
  // Under the former rules a year that cannot be worked out leaves A unknown for every later year.
  let unknown: AssetMissing['code'] | null = null
  for (let year = soldFirst ? v.firstYear : v.firstYear + 1; year <= last; year++) {
    const left = last - year + 1
    if (out && year > out.year) {
      years.push({ year, a, b: null, r: 0, state: 'after', deduct: 0 })
      continue
    }
    const supply = out?.supply && year === out.year
    const lack = (code: AssetMissing['code'], r: number) => {
      missing.push({ assetId: v.assetId, number: v.number, year, code })
      years.push({ year, a, b: null, r, state: 'missing', deduct: 0, missing: code })
      if (former) unknown = code
    }
    if (unknown) {
      lack(unknown, left)
      continue
    }
    let b: number | null
    let business: number
    if (supply) {
      business = 100
      b = v.sale === 'taxed' ? 100 : v.sale === 'exempt' ? 0 : null
      if (b === null) {
        lack('sale', left)
        continue
      }
    } else {
      const use = useOf(v, year)
      business = use ? use.business : v.business
      const purpose = use ? (use.use === 'taxable' ? 100 : use.use === 'exempt' ? 0 : use.use === 'share' ? (use.share ?? 0) : coefOf(year)) : v.regime === 'ratio' ? coefOf(year) : undefined
      if (purpose === undefined) {
        years.push({ year, a, b: a, r: former ? left : 1, state: 'same', deduct: 0 })
        continue
      }
      if (purpose === null) {
        lack('ratio', former ? left : 1)
        continue
      }
      b = up((purpose * business) / 100)
    }
    const r = supply || former ? left : 1
    if (b === a || (business === aBusiness && Math.abs(a - b) <= 10)) {
      years.push({ year, a, b, r, state: b === a ? 'same' : 'below', deduct: 0 })
      if (supply) a = b
      continue
    }
    // DD = DV × (A − B) × R / N; what is deducted in addition is −DD.
    const lines = v.lines.map((l) => ({ rate: l.rate, deduct: -cents((l.vat * (a - b) * r) / (100 * n)) })).filter((l) => l.deduct !== 0)
    const deduct = lines.reduce((sum, l) => sum + l.deduct, 0)
    years.push({ year, a, b, r, state: supply ? 'sale' : 'adjust', deduct })
    if (lines.length > 0) adjustments.push({ assetId: v.assetId, number: v.number, name: v.name, year, a, b, r, n, reason: supply ? 'sale' : 'use', lines, deduct })
    // The former rules adjust every year left at once: the next year compares with what was adjusted to.
    if (former || supply) {
      a = b
      aBusiness = business
    }
  }
  return { years, adjustments, missing }
}

/** A year's adjustments of all the company's assets, for its last period: the deduction by rate, the assets, and what keeps it back. */
export interface AssetYear {
  lines: { rate: number; deduct: number }[]
  items: AssetAdjustment[]
  missing: AssetMissing[]
}

export function assetYearsOf(list: readonly AssetVat[], coefOf: (year: number) => number | null): Map<number, AssetYear> {
  const byYear = new Map<number, AssetYear>()
  const of = (year: number): AssetYear => {
    const found = byYear.get(year)
    if (found) return found
    const made: AssetYear = { lines: [], items: [], missing: [] }
    byYear.set(year, made)
    return made
  }
  for (const v of list) {
    const plan = assetPlan(v, coefOf)
    for (const adj of plan.adjustments) {
      const y = of(adj.year)
      y.items.push(adj)
      for (const l of adj.lines) {
        const line = y.lines.find((x) => x.rate === l.rate)
        if (line) line.deduct += l.deduct
        else y.lines.push({ ...l })
      }
    }
    for (const m of plan.missing) of(m.year).missing.push(m)
  }
  return byYear
}

/** "0,74" of 74 hundredths; "1,00" of 100. */
export const shareText = (hundredths: number): string => `${Math.floor(hundredths / 100)},${String(hundredths % 100).padStart(2, '0')}`

/**
 * A share typed as the law writes it ("0,80", "1", "0,745") or in per cent ("80 %", "74,5 %", "80"); hundredths rounded
 * up to two decimal places as annex 1 asks, or null when it is none.
 */
export function shareOf(text: string): number | null {
  const plain = text.replace(/\s/g, '').replace('.', ',')
  // Hundredths from a whole part and the digits after the comma, rounded up: any digit beyond the second adds one.
  const of = (whole: string, digits: string, scale: 1 | 100): number => {
    const hundredths = scale === 100 ? Number(whole) * 100 + Number(digits.slice(0, 2).padEnd(2, '0')) : Number(whole)
    const rest = scale === 100 ? digits.slice(2) : digits
    return hundredths + (/[1-9]/.test(rest) ? 1 : 0)
  }
  const decimal = /^([01])(?:,(\d+))?$/.exec(plain)
  if (decimal) {
    const value = of(decimal[1] ?? '0', decimal[2] ?? '', 100)
    return value <= 100 ? value : null
  }
  const percent = /^(\d{1,3})(?:,(\d+))?(%?)$/.exec(plain)
  if (percent && (percent[3] === '%' || (percent[1] ?? '').length >= 2)) {
    const value = of(percent[1] ?? '0', percent[2] ?? '', 1)
    return value <= 100 ? value : null
  }
  return null
}

const toInt = (value: unknown): number | null => (typeof value === 'number' && Number.isInteger(value) ? value : null)

/** The assets' VAT as the company row carries it (store.ts), each part checked again. */
export function assetVatsOf(json: unknown): AssetVat[] {
  if (typeof json !== 'string') return []
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []
  const out: AssetVat[] = []
  for (const raw of parsed) {
    if (!raw || typeof raw !== 'object') continue
    const r = raw as Record<string, unknown>
    const firstYear = toInt(r.firstYear)
    const deducted = toInt(r.deducted)
    const business = toInt(r.business)
    if (typeof r.assetId !== 'string' || firstYear === null || deducted === null || business === null) continue
    const lines = (Array.isArray(r.lines) ? r.lines : [])
      .map((l) => (l && typeof l === 'object' ? (l as Record<string, unknown>) : {}))
      .filter((l) => (ASSET_VAT_RATES as readonly number[]).includes(Number(l.rate)) && toInt(l.vat) !== null && Number(l.vat) > 0)
      .map((l) => ({ rate: Number(l.rate), vat: Number(l.vat) }))
    const uses = (Array.isArray(r.uses) ? r.uses : [])
      .map((u) => (u && typeof u === 'object' ? (u as Record<string, unknown>) : {}))
      .filter((u) => typeof u.id === 'string' && toInt(u.from) !== null && isAssetUse(u.use) && toInt(u.business) !== null)
      .map((u) => ({ id: String(u.id), from: Number(u.from), use: u.use as AssetUse, share: toInt(u.share), business: Number(u.business) }))
      .sort((x, y) => x.from - y.from)
    out.push({
      assetId: r.assetId,
      number: typeof r.number === 'string' ? r.number : '',
      name: typeof r.name === 'string' ? r.name : '',
      account: typeof r.account === 'string' ? r.account : '022',
      inUseOn: typeof r.inUseOn === 'string' ? r.inUseOn : '',
      disposedOn: typeof r.disposedOn === 'string' ? r.disposedOn : null,
      disposal: typeof r.disposal === 'string' ? r.disposal : null,
      lines,
      firstYear,
      deducted,
      business,
      regime: r.regime === 'ratio' ? 'ratio' : 'fixed',
      sale: r.sale === 'taxed' || r.sale === 'exempt' ? r.sale : null,
      uses,
    })
  }
  return out
}

/** What the form of an asset's VAT sent, as typed. */
export interface AssetVatValues {
  rate: string
  dv: string
  firstYear: string
  deducted: string
  business: string
  regime: AssetRegime
  sale: '' | AssetSale
}

export interface AssetVatInput {
  lines: AssetVatLine[]
  firstYear: number
  deducted: number
  business: number
  regime: AssetRegime
  sale: AssetSale | null
}

export type AssetVatErrors = Partial<Record<'rate' | 'dv' | 'firstYear' | 'deducted' | 'business' | 'form', string>>

/** The values of an asset's VAT to show in its form: as kept, or what a new one starts from (first used the year it was put in use, deducted in full). */
export function assetVatValues(v: AssetVat | null, inUseOn: string): AssetVatValues {
  if (!v) return { rate: '23', dv: '', firstYear: inUseOn.slice(0, 4), deducted: '1,00', business: '1,00', regime: 'fixed', sale: '' }
  const line = v.lines[0]
  return {
    rate: String(line?.rate ?? 23),
    dv: line ? `${Math.floor(line.vat / 100)},${String(line.vat % 100).padStart(2, '0')}` : '',
    firstYear: String(v.firstYear),
    deducted: shareText(v.deducted),
    business: shareText(v.business),
    regime: v.regime,
    sale: v.sale ?? '',
  }
}

/**
 * The form of an asset's VAT read: the rate and DV, the year of first use (from the year before it was put in use, for
 * property whose period began with its acquisition under the former rules, to the year after this one), the shares.
 */
export function readAssetVat(
  body: Record<string, unknown>,
  inUseOn: string,
  thisYear: number,
  moneyOf: (text: string) => number | null,
): { values: AssetVatValues; input: AssetVatInput | null; errors: AssetVatErrors } {
  const text = (key: string, max = 20) => (typeof body[key] === 'string' ? (body[key] as string).trim().slice(0, max) : '')
  const values: AssetVatValues = {
    rate: text('dph_sadzba', 3),
    dv: text('dph_dv'),
    firstYear: text('dph_rok', 4),
    deducted: text('dph_odpocet', 10),
    business: text('dph_podnikanie', 10) || '1,00',
    regime: text('dph_pouzitie', 6) === 'ratio' ? 'ratio' : 'fixed',
    sale: text('dph_predaj', 6) === 'taxed' ? 'taxed' : text('dph_predaj', 6) === 'exempt' ? 'exempt' : '',
  }
  const errors: AssetVatErrors = {}
  const rate = Number(values.rate)
  if (!(ASSET_VAT_RATES as readonly number[]).includes(rate)) errors.rate = 'Vyberte sadzbu dane: 23, 19 alebo 5 %.'
  const dv = moneyOf(values.dv)
  if (dv === null || Number.isNaN(dv) || dv <= 0) errors.dv = 'Zadajte daň z obstarávacej ceny alebo vlastných nákladov majetku (DV).'
  const inUse = Number(inUseOn.slice(0, 4))
  const firstYear = /^\d{4}$/.test(values.firstYear) ? Number(values.firstYear) : Number.NaN
  const earliest = Math.max(1990, inUse - 1)
  if (!Number.isInteger(firstYear) || firstYear < earliest || firstYear > thisYear + 1) errors.firstYear = `Zadajte rok prvotného použitia, od ${earliest} do ${thisYear + 1}.`
  const deducted = shareOf(values.deducted)
  if (deducted === null) errors.deducted = 'Zadajte podiel odpočítanej dane ako 1, 0 alebo napríklad 0,74.'
  const business = shareOf(values.business)
  if (business === null) errors.business = 'Zadajte podiel použitia na podnikanie ako 1 alebo napríklad 0,80.'
  else if (deducted !== null && deducted > business) errors.deducted = 'Odpočítaný podiel nemôže byť vyšší ako podiel použitia na podnikanie.'
  if (Object.keys(errors).length > 0 || dv === null || deducted === null || business === null) return { values, input: null, errors }
  return { values, input: { lines: [{ rate, vat: dv }], firstYear, deducted, business, regime: values.regime, sale: values.sale === '' ? null : values.sale }, errors }
}

export interface AssetUseValues {
  from: string
  use: AssetUse
  share: string
  business: string
}

export type AssetUseErrors = Partial<Record<'from' | 'share' | 'business', string>>

/** The form of a change of an asset's use read: a year of its period after first use, the use, a share for 'share', the business share. */
export function readAssetUse(
  body: Record<string, unknown>,
  v: Pick<AssetVat, 'firstYear' | 'account'>,
): { values: AssetUseValues; input: { from: number; use: AssetUse; share: number | null; business: number } | null; errors: AssetUseErrors } {
  const text = (key: string, max = 10) => (typeof body[key] === 'string' ? (body[key] as string).trim().slice(0, max) : '')
  const use = text('pouzitie')
  const values: AssetUseValues = { from: text('od', 4), use: isAssetUse(use) ? use : 'taxable', share: text('podiel'), business: text('podnikanie') || '1,00' }
  const errors: AssetUseErrors = {}
  const last = lastYearOf(v)
  const from = /^\d{4}$/.test(values.from) ? Number(values.from) : Number.NaN
  if (!Number.isInteger(from) || from <= v.firstYear || from > last) errors.from = `Zadajte rok obdobia na úpravu po roku prvotného použitia, od ${v.firstYear + 1} do ${last}.`
  const share = values.use === 'share' ? shareOf(values.share) : null
  if (values.use === 'share' && share === null) errors.share = 'Zadajte podiel dane, ktorú možno v tom roku odpočítať, napríklad 0,40.'
  const business = shareOf(values.business)
  if (business === null) errors.business = 'Zadajte podiel použitia na podnikanie ako 1 alebo napríklad 0,80.'
  if (Object.keys(errors).length > 0 || business === null) return { values, input: null, errors }
  return { values, input: { from, use: values.use, share, business }, errors }
}
