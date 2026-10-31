// The annual settlement of the advances on the income tax from employment (ročné zúčtovanie, § 38 of Act No. 595/2003
// Z. z.): what the year's income from employment comes to for an employee who asked for it, against the advances and the
// child bonuses withheld and paid during the year, by this employer and the ones before it in the year. Pure; the
// store and the page are in tax-settlement-store.ts and views/settlement.tsx.
//
// What each rule leans on (read on 17 October 2026; the Financial Directorate's pages "Daňový bonus na vyživované
// dieťa v roku 2026", "Vrátenie preplatku a zrazenie nedoplatku z vykonaného ročného zúčtovania", "Termín na
// požiadanie o vykonanie ročného zúčtovania"; podnikajte.sk "Nezdaniteľné časti základu dane v roku 2026"):
// - The employee asks by 15 February, the employer settles by 31 March and pays the overpayment, or withholds the
//   underpayment, at the latest with the April wage; an overpayment lowers the advances the employer remits (row 02 of
//   the month's overview), and what they cannot bear it pays of its own and asks the tax office for (§ 40(8)).
// - The partial base is the year's taxable income from employment less the employee's insurance. The non-taxable part
//   for the taxpayer (§ 11(2)) is 21 times the subsistence minimum (5 966,73 € in 2026) up to a base of 91,8 times it
//   (26 083,13 €), above it 51,6 times it less a third of the base (14 661,11 € - base / 3), never below nought; a
//   pension paid in the year comes off it (§ 11(6)). For the spouse (§ 11(3)): 19,2 times the subsistence minimum
//   (5 455,30 €) less the spouse's own income up to a base of 154,8 times it (43 983,32 €), above it 70,8 times it
//   (20 116,40 €) less a third of the base and the spouse's income; a twelfth for each month the conditions were met.
//   Supplementary pension saving (§ 11(8)): what the employee paid, at most 180 €.
// - The tax: 19 % to 154,8 times the subsistence minimum, 25 % to 212,4 times, 30 % to 264 times, 35 % above (from
//   2026), rounded to the cent (§ 47).
// - The child bonus (§ 33): 100 € a month for a child to the month it turns 15, 50 € to the month it turns 18; each
//   child's lowered by a tenth of the partial base above 18 times 1,5 times the average wage of two years before (27 432 €
//   in 2026), a twelfth of it a month; each month at most 29 % (one child) to 64 % (six or more) of a twelfth of the
//   partial base; the year's bonus is the sum of the months, each rounded to the cent as its payslip rounds it.
import { childBonus, nonTaxableYear, payrollYear, BONUS_CAP, type Child, type PayrollYear } from './payroll'

/** What the year holds of an employee at this employer, from the months closed (cents). */
export interface YearIncome {
  taxable: number
  insurance: number
  advance: number
  bonus: number
  /** The months of the year with income (YYYY-MM). */
  months: string[]
}

/** What the accountant gives for the settlement (cents; months as numbers 1 to 12). */
export interface SettlementInputs {
  /** The employee asked for it in writing, by 15 February. */
  requested: boolean
  /** The employers before this one in the year, from their statements (potvrdenie o zdaniteľných príjmoch). */
  other: { taxable: number; insurance: number; advance: number; bonus: number; months: number }
  /** The spouse's non-taxable part: the months the conditions were met, the spouse's own income. */
  spouseMonths: number
  spouseIncome: number
  /** Supplementary pension saving the employee paid. */
  dds: number
  /** A pension paid to the employee in the year (lowers the taxpayer's non-taxable part). */
  pension: number
  /** The month of the payroll the difference is settled in (YYYY-MM). */
  settleIn: string | null
}

export const EMPTY_SETTLEMENT: SettlementInputs = { requested: false, other: { taxable: 0, insurance: 0, advance: 0, bonus: 0, months: 0 }, spouseMonths: 0, spouseIncome: 0, dds: 0, pension: 0, settleIn: null }

export interface SettlementResult {
  year: number
  taxable: number
  insurance: number
  partialBase: number
  nonTaxable: { taxpayer: number; spouse: number; dds: number }
  taxBase: number
  tax: number
  /** The year's bonus, and by month. */
  bonus: number
  bonusMonths: { month: number; amount: number }[]
  advances: number
  bonusPaid: number
  /** Positive: the employee owes it (withheld); negative: the employee gets it back. */
  taxDifference: number
  /** Positive: the employer pays it to the employee; negative: the employee returns it. */
  bonusDifference: number
}

const round = (v: number) => Math.round(v)
const times = (y: PayrollYear, n: number) => round(n * y.subsistence)

/** The year's tax of a base by the bands (§ 15 from 2026), rounded once. */
export function yearTax(base: number, y: PayrollYear): number {
  const b1 = times(y, 154.8)
  const b2 = times(y, 212.4)
  const b3 = times(y, 264)
  const part = (from: number, to: number) => Math.max(0, Math.min(base, to) - from)
  return round((part(0, b1) * 19 + part(b1, b2) * 25 + part(b2, b3) * 30 + part(b3, Number.POSITIVE_INFINITY) * 35) / 100)
}

/** The taxpayer's non-taxable part of a year by the partial base, less a pension paid. */
export function taxpayerPart(partial: number, y: PayrollYear, pension = 0): number {
  const full = nonTaxableYear(y)
  const part = partial <= times(y, 91.8) ? full : Math.max(0, round(times(y, 51.6) - partial / 3))
  return Math.max(0, part - Math.max(0, pension))
}

/** The spouse's non-taxable part: the year's amount by the partial base, less the spouse's income, a twelfth a month. */
export function spousePart(partial: number, y: PayrollYear, months: number, income: number): number {
  if (months <= 0) return 0
  const year = partial <= times(y, 154.8) ? times(y, 19.2) - income : round(times(y, 70.8) - partial / 3) - income
  return Math.max(0, round((Math.max(0, year) * Math.min(12, months)) / 12))
}

/** The year's child bonus: each month with income, each child by its age, lowered above the threshold, capped by the share of the base. */
export function yearBonus(partial: number, y: PayrollYear, children: readonly Child[], months: readonly number[]): { total: number; months: { month: number; amount: number }[] } {
  const threshold = round(18 * y.averageWage)
  const cut = partial > threshold ? (partial - threshold) / 10 / 12 : 0
  const out: { month: number; amount: number }[] = []
  for (const m of [...new Set(months)].sort((a, b) => a - b)) {
    const period = `${y.year}-${String(m).padStart(2, '0')}`
    const each = children.map((c) => childBonus(c, period)).filter((a) => a > 0)
    if (each.length === 0) continue
    const whole = each.reduce((s, a) => s + Math.max(0, a - cut), 0)
    const cap = ((BONUS_CAP[Math.min(each.length, 6)] ?? 0) * Math.max(0, partial)) / 12 / 10000
    // Each month to the cent, as the month's payslip rounds it, so a year whose months were paid right settles to nought.
    out.push({ month: m, amount: round(Math.min(whole, cap)) })
  }
  return { total: out.reduce((s, x) => s + x.amount, 0), months: out }
}

/** The settlement of a year: here and before, the parts, the tax, the bonus, and what is settled. */
export function settle(year: number, here: YearIncome, children: readonly Child[], inputs: SettlementInputs): SettlementResult {
  const y = payrollYear(year)
  const taxable = here.taxable + inputs.other.taxable
  const insurance = here.insurance + inputs.other.insurance
  const partialBase = Math.max(0, taxable - insurance)
  const taxpayer = taxpayerPart(partialBase, y, inputs.pension)
  const spouse = spousePart(partialBase, y, inputs.spouseMonths, inputs.spouseIncome)
  const dds = Math.min(18000, Math.max(0, inputs.dds))
  const taxBase = Math.max(0, partialBase - taxpayer - spouse - dds)
  const tax = yearTax(taxBase, y)
  // The months of income: those here, and as many before as the statements say, counted from January.
  const hereMonths = here.months.filter((m) => m.startsWith(`${year}-`)).map((m) => Number(m.slice(5)))
  const before = Array.from({ length: Math.min(12, inputs.other.months) }, (_, i) => i + 1).filter((m) => !hereMonths.includes(m))
  const bonus = yearBonus(partialBase, y, children, [...hereMonths, ...before])
  const advances = here.advance + inputs.other.advance
  const bonusPaid = here.bonus + inputs.other.bonus
  return {
    year,
    taxable,
    insurance,
    partialBase,
    nonTaxable: { taxpayer, spouse, dds },
    taxBase,
    tax,
    bonus: bonus.total,
    bonusMonths: bonus.months,
    advances,
    bonusPaid,
    taxDifference: tax - advances,
    bonusDifference: bonus.total - bonusPaid,
  }
}

/** The settlement read back from storage: anything wrong is nought. */
export function settlementInputsOf(raw: unknown): SettlementInputs {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const cents = (v: unknown) => (Number.isSafeInteger(v) && (v as number) >= 0 && (v as number) <= 99_999_999_99 ? (v as number) : 0)
  const other = o.other && typeof o.other === 'object' ? (o.other as Record<string, unknown>) : {}
  const month = (v: unknown, max: number) => (Number.isInteger(v) && (v as number) >= 0 && (v as number) <= max ? (v as number) : 0)
  return {
    requested: o.requested === true,
    other: { taxable: cents(other.taxable), insurance: cents(other.insurance), advance: cents(other.advance), bonus: cents(other.bonus), months: month(other.months, 12) },
    spouseMonths: month(o.spouseMonths, 12),
    spouseIncome: cents(o.spouseIncome),
    dds: cents(o.dds),
    pension: cents(o.pension),
    settleIn: typeof o.settleIn === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(o.settleIn) ? o.settleIn : null,
  }
}
