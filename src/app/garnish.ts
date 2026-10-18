// Deductions from wages for an execution (zrážky zo mzdy pri exekúcii, 18 October 2026). Read in the original on
// static.slov-lex.sk through the browser pane on 18 October 2026:
// - Act No. 233/1995 Z. z. (Exekučný poriadok), version of 27 December 2025: § 66 the order to start an execution by
//   deductions binds the payer of wages from the day it is delivered, the employee loses his right to the deducted part;
//   § 67(3) the deducted sums are paid to the executor from the day the execution order is delivered; § 67(4), (5) the
//   payer tells the executor of a sick leave over ten days and of maternity or parental leave; § 68 no more than the claim
//   with its accessories; § 69 deductions are made from the net wage: the wage less the tax (advance) and the health and
//   social insurance; net rewards of side work and benefits in kind count, compensation of costs (business trips) does
//   not; § 70 the basic amount that may not be deducted (the government's regulation), for the maintenance of a minor
//   child 70 % of it; § 71(1) the net wage less that amount, rounded down to cents divisible by three: one third for any
//   claim, two thirds for the priority claims of § 71(2) (maintenance, damages to health, taxes, fees and customs,
//   insurance, overpaid benefits and others), which take the second third first and then share the first one; § 71(3)
//   above the regulation's amount the rest is deducted without limit; § 72(1) several claims share the first third by
//   their order whatever their kind; § 72(2) the second third goes to maintenance first (the current maintenance of all
//   creditors before arrears, in proportion to the current maintenance), then to the other priority claims by order;
//   § 72(3) the order is the day the order to start was delivered, claims of one day sharing in proportion; § 74 the
//   payer stops once the claim is satisfied; § 81 the deducted sum is paid to the executor; § 85(2) the payer tells the
//   executor within a week that the employee left, with the account of the deductions; § 89 a reward of an agreement and
//   sick pay are deducted from as a wage.
// - Government regulation No. 268/2006 Z. z., version of 1 January 2022 (the latest): § 1(1) the basic amount is 140 %
//   of the subsistence minimum of an adult valid in the month the deductions are for, (2) and 25 % of it for each person
//   the employee maintains (a spouse with his own income too); § 2(1) for the maintenance of a minor child the basic
//   amount (of which § 70(2) takes 70 %) is 60 % of the subsistence minimum, (2) for another priority claim 100 %, (3)
//   and 25 % of the 100 % for each person maintained, (5) never for the person the maintenance is executed for; § 3(1)
//   the rest is deducted without limit above three times the amount of § 1(1); § 4 every amount rounded down to cents.
// - Act No. 311/2001 Z. z. (Zákonník práce), version of 1 September 2026: § 118(2) the tax bonus, the financial
//   contribution to meals, travel compensation and contributions of the social fund are no wage; § 131(1), (2)(b) the
//   insurance and the tax come first, then sums of an execution.
// - The subsistence minimum of an adult: 273,99 € from 1 July 2024, 284,13 € from 1 July 2025, 295,22 € from 1 July 2026
//   (the figures payroll.ts reads for the non-taxable part; dobry-uctovnik.sk, 7 July 2026, for the last).
//
// Said plainly, how a month is worked out (`garnishMonth`):
// - The net wage for deductions: the gross wage and sick pay less the employee's insurance, the tax advance (the tax
//   bonus is no wage) and an annual settlement's tax underpayment; meals, travel and the bonus are left out.
// - Each kind of claim has its protected amount: ordinary 140 %, priority 100 %, a minor child's maintenance 70 % of
//   60 % of the subsistence minimum, each with its persons maintained (for a maintenance claim not the persons it is
//   for); the cap is three times the ordinary basic amount. A claim may take at most its kind's share: an ordinary claim
//   one third of its remainder and what is above the cap, a priority claim two thirds and what is above the cap.
// - The second third (from the lowest priority remainder) goes to maintenance (current maintenance first, then arrears)
//   and then the other priority claims by order; the first third and what is above the cap go to every claim by order,
//   claims of one day in proportion, each kind within its share. Where the law gives no rule for claims of different
//   protected amounts at once, each kind keeps to its own share: nobody is left less than his kind protects.
// - A deduction before the execution order is delivered is kept by the employer (`held`), not paid to the executor.

export type GarnishKind = 'ordinary' | 'priority' | 'maintenance'

export const isGarnishKind = (v: unknown): v is GarnishKind => v === 'ordinary' || v === 'priority' || v === 'maintenance'

export interface Garnishment {
  id: string
  employeeId: string
  kind: GarnishKind
  /** Maintenance of a minor child (§ 70(2)): its own protected amount. */
  minor: boolean
  /** The persons a maintenance claim is for (not counted among those maintained, § 2(5)). */
  persons: number
  /** The executor and his file's number. */
  creditor: string
  reference: string
  iban: string | null
  vs: string | null
  /** The day the order to start the execution was delivered: from it deductions are made, and it gives the order. */
  startedOn: string
  /** The day the execution order was delivered: from it the deductions are paid to the executor; null: kept. */
  orderOn: string | null
  /** The claim with its accessories (cents); for maintenance its arrears; null: until the executor says it is satisfied. */
  total: number | null
  /** Maintenance: the current maintenance of a month (cents). */
  monthly: number | null
  /** The day the executor said the claim is satisfied or the execution ended; no deduction after it. */
  endedOn: string | null
}

/** A month's deduction for a claim: of the current maintenance, of the claim (or arrears), and whether it is kept. */
export interface GarnishDeduction {
  id: string
  current: number
  arrears: number
  held: boolean
}

export const deductionOf = (d: GarnishDeduction): number => d.current + d.arrears

/** The subsistence minimum of an adult, in cents, with the day each holds from. */
export const SUBSISTENCE: readonly { from: string; cents: number }[] = [
  { from: '2024-07-01', cents: 27399 },
  { from: '2025-07-01', cents: 28413 },
  { from: '2026-07-01', cents: 29522 },
]

export function subsistenceOn(day: string): number | null {
  let found: number | null = null
  for (const s of SUBSISTENCE) if (s.from <= day) found = s.cents
  return found
}

const down = (v: number) => Math.floor(v + 1e-9)

/** The protected amounts of a month for a number of persons maintained, and the cap (all rounded down to cents). */
export function protectedAmounts(month: string, persons: number): { ordinary: number; priority: number; minor: number; cap: number } | null {
  const zm = subsistenceOn(`${month}-01`)
  if (zm === null) return null
  const n = Math.max(0, Math.floor(persons))
  const base140 = down((zm * 140) / 100)
  const dep140 = down((base140 * 25) / 100)
  const base100 = zm
  const dep100 = down((base100 * 25) / 100)
  const base60 = down((zm * 60) / 100)
  return {
    ordinary: base140 + n * dep140,
    priority: base100 + n * dep100,
    minor: down((base60 * 70) / 100) + n * down((dep100 * 70) / 100),
    cap: 3 * base140,
  }
}

/** The thirds of a net wage over a protected amount: a third (of what is under the cap) and what is above the cap. */
export function thirdsOf(net: number, protect: number, cap: number): { third: number; above: number } {
  const rest = Math.max(0, net - protect)
  const three = rest - (rest % 3)
  return { third: Math.min(three, cap) / 3, above: Math.max(0, three - cap) }
}

/** The net wage deductions are made from (§ 69), from a payslip's figures. */
export const garnishNet = (s: { gross: number; sickPay?: number; socialEmployee: number; healthEmployee: number; advance: number; settlementTax?: number }): number =>
  s.gross + (s.sickPay ?? 0) - s.socialEmployee - s.healthEmployee - s.advance - Math.max(0, s.settlementTax ?? 0)

/**
 * Splits an amount among needs in proportion to weights (the needs themselves when none), rounded down, never above a
 * need; what one need leaves goes to the others in the same proportion, the last cents to the first that can take them.
 */
export function share(amount: number, needs: readonly number[], weights: readonly number[] = needs): number[] {
  const parts = needs.map(() => 0)
  let left = Math.min(
    amount,
    needs.reduce((t, n) => t + Math.max(0, n), 0),
  )
  for (let round = 0; left > 0 && round < needs.length + 1; round++) {
    const open = needs.map((n, i) => (parts[i]! < n ? i : -1)).filter((i) => i >= 0)
    const weight = open.reduce((t, i) => t + Math.max(0, weights[i] ?? 0), 0)
    if (open.length === 0) break
    const pool = left
    for (const i of open) {
      const v = Math.min(needs[i]! - parts[i]!, weight > 0 ? Math.floor((pool * Math.max(0, weights[i] ?? 0)) / weight) : Math.floor(pool / open.length))
      parts[i]! += v
      left -= v
    }
    if (left === pool) {
      for (const i of open) {
        if (left <= 0) break
        const v = Math.min(needs[i]! - parts[i]!, left)
        parts[i]! += v
        left -= v
      }
    }
  }
  return parts
}

/**
 * A month's deductions of an employee: the net wage for deductions, his persons maintained, the claims of the month
 * (in force on the day the wage is paid), what each still asks (the arrears or claim left after the months closed), the
 * day the wage is paid (it decides what is kept until the execution order).
 */
export function garnishMonth(month: string, net: number, persons: number, claims: readonly { g: Garnishment; left: number | null }[], payday: string): GarnishDeduction[] {
  const active = claims.filter(({ g }) => g.startedOn <= payday && (g.endedOn === null || g.endedOn > payday))
  if (active.length === 0) return []
  const forMaintenance = active.filter(({ g }) => g.kind === 'maintenance').reduce((t, { g }) => t + Math.max(0, g.persons), 0)
  const p = protectedAmounts(month, persons)
  const pm = protectedAmounts(month, Math.max(0, persons - forMaintenance))
  if (!p || !pm) return []
  // Each kind's protected amount, its remainder's thirds and the most it may take.
  const kindOf = (g: Garnishment): 'ordinary' | 'priority' | 'minor' => (g.kind === 'ordinary' ? 'ordinary' : g.kind === 'maintenance' && g.minor ? 'minor' : 'priority')
  const protect = { ordinary: p.ordinary, priority: active.some(({ g }) => g.kind === 'maintenance') ? pm.priority : p.priority, minor: pm.minor }
  const thirds = {
    ordinary: thirdsOf(net, protect.ordinary, p.cap),
    priority: thirdsOf(net, protect.priority, p.cap),
    minor: thirdsOf(net, protect.minor, p.cap),
  }
  const present = new Set(active.map(({ g }) => kindOf(g)))
  const most = {
    ordinary: thirds.ordinary.third + thirds.ordinary.above,
    priority: 2 * thirds.priority.third + thirds.priority.above,
    minor: 2 * thirds.minor.third + thirds.minor.above,
  }
  const taken = { ordinary: 0, priority: 0, minor: 0 }
  // What each claim still asks this month: current maintenance and the rest (arrears or the claim).
  const rows = active.map(({ g, left }) => ({
    g,
    kind: kindOf(g),
    current: g.kind === 'maintenance' ? Math.max(0, g.monthly ?? 0) : 0,
    rest: left === null ? Number.MAX_SAFE_INTEGER : Math.max(0, left),
    paidCurrent: 0,
    paidRest: 0,
  }))
  const room = (k: 'ordinary' | 'priority' | 'minor') => Math.max(0, most[k] - taken[k])
  // Gives a pool to rows in groups (each group shares in proportion), each within its kind's room.
  // Gives a pool to rows in groups, each group sharing in proportion to what its claims ask (or to the current
  // maintenance), each kind of claim within its share: what a kind cannot take goes to the others of the group.
  const give = (pool: number, groups: (typeof rows)[], part: 'current' | 'rest', byCurrent = false): number => {
    const askOf = (r: (typeof rows)[number]) => (part === 'current' ? r.current - r.paidCurrent : r.rest - r.paidRest)
    for (const group of groups) {
      for (let round = 0; pool > 0 && round < 4; round++) {
        const open = group.filter((r) => askOf(r) > 0 && room(r.kind) > 0)
        if (open.length === 0) break
        const parts = share(pool, open.map(askOf), byCurrent ? open.map((r) => r.current) : open.map(askOf))
        // A kind above its share keeps to it, its claims in the same proportion.
        for (const k of ['ordinary', 'priority', 'minor'] as const) {
          const idx = open.map((r, i) => (r.kind === k ? i : -1)).filter((i) => i >= 0)
          const sum = idx.reduce((t, i) => t + (parts[i] ?? 0), 0)
          if (sum > room(k)) {
            const cut = share(
              room(k),
              idx.map((i) => parts[i] ?? 0),
            )
            idx.forEach((i, j) => (parts[i] = cut[j] ?? 0))
          }
        }
        let given = 0
        open.forEach((r, i) => {
          const v = parts[i] ?? 0
          if (part === 'current') r.paidCurrent += v
          else r.paidRest += v
          taken[r.kind] += v
          given += v
        })
        pool -= given
        if (given === 0) break
      }
    }
    return pool
  }
  const byOrder = (list: typeof rows) => {
    const days = [...new Set(list.map((r) => r.g.startedOn))].sort()
    return days.map((d) => list.filter((r) => r.g.startedOn === d))
  }
  const maintenance = rows.filter((r) => r.g.kind === 'maintenance')
  const otherPriority = rows.filter((r) => r.g.kind === 'priority')
  // The second third: of the lowest priority remainder, for priority claims only.
  const priorityKinds = (['minor', 'priority'] as const).filter((k) => present.has(k))
  if (priorityKinds.length > 0) {
    let second = Math.max(...priorityKinds.map((k) => thirds[k].third))
    // Current maintenance of all creditors first (in proportion), then arrears (in proportion to the current), then the
    // other priority claims by their order.
    second = give(second, [maintenance], 'current')
    second = give(second, [maintenance], 'rest', true)
    give(second, byOrder(otherPriority), 'rest')
  }
  // The first third and what is above the cap: every claim by its order, each within its kind's share.
  const kinds = [...present]
  let first = Math.max(...kinds.map((k) => thirds[k].third + thirds[k].above))
  for (const group of byOrder(rows)) {
    first = give(first, [group.filter((r) => r.g.kind === 'maintenance')], 'current')
    first = give(first, [group], 'rest')
    if (first <= 0) break
  }
  return rows.filter((r) => r.paidCurrent + r.paidRest > 0).map((r) => ({ id: r.g.id, current: r.paidCurrent, arrears: r.paidRest, held: r.g.orderOn === null || r.g.orderOn > payday }))
}
