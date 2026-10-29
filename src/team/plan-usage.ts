// How a client's documents stand against its plan (his word of 29 October 2026: exact counting and exact warnings when a
// cheaper plan is outgrown, for us and never for the client, so that the month is billed right and a larger plan can be
// offered). The documents are counted by the same rule billing counts them (billing-store.ts, PLAN_DOC_SQL), so what this
// says is what the bill will say. Pure: the database is billing-store.ts (planUsages).
import { addMonths, monthStart, planForMonth, type Tariff, type TariffPlan } from './billing'

/** From this share of the plan's documents a month is near its limit. */
export const NEAR_SHARE = 0.8
/** A month is projected from this share of it on: earlier the pace says too little. */
export const PROJECT_FROM = 0.2
/** The months looked back on for a larger plan, and how many of them above the plan make it worth offering. */
export const HISTORY_MONTHS = 3
export const OFFER_WHEN = 2

export type UsageState = 'ok' | 'near' | 'over' | 'agree'

export interface MonthUse {
  month: string
  docs: number
  /** The plan the month is (or was) billed as, the client's own when it fits. */
  billedAs: TariffPlan
  over: boolean
  /** More than the highest plan is for: a price is to be agreed (the terms, 4.2). */
  agree: boolean
}

export interface PlanUsage {
  month: string
  plan: TariffPlan
  docs: number
  limit: number
  /** docs / limit, 1 at the limit. */
  share: number
  state: UsageState
  billedAs: TariffPlan
  /** What the month adds to the plan's price when it ends as it stands. */
  extraCents: number
  /** The month's documents at today's pace, once a fifth of it has passed; null before. */
  projected: number | null
  projectedAs: TariffPlan | null
  /** The contract's first month, offered free: counted, never billed. */
  free: boolean
  /** The months before, the latest first. */
  history: MonthUse[]
  /** A larger plan to offer: the months before outgrew the plan at least OFFER_WHEN times of HISTORY_MONTHS. */
  offer: TariffPlan | null
}

export interface UsageFacts {
  /** The month that runs (YYYY-MM) and the moment, in unix seconds. */
  month: string
  at: number
  plan: string
  tariff: Tariff
  startOn: string | null
  /** Documents by month as the plan counts them (billing-store.ts, planDocs). */
  docs: ReadonlyMap<string, number>
}

function useOf(own: TariffPlan, plans: readonly TariffPlan[], month: string, docs: number): MonthUse {
  const { plan, agree } = planForMonth(own, plans, docs)
  return { month, docs, billedAs: plan, over: plan.id !== own.id || agree, agree }
}

export function stateOf(docs: number, limit: number, agree: boolean): UsageState {
  if (agree) return 'agree'
  if (docs > limit) return 'over'
  return limit > 0 && docs >= Math.ceil(limit * NEAR_SHARE) ? 'near' : 'ok'
}

/** How far the month has run, from 0 to 1. */
export function monthShare(month: string, at: number): number {
  const from = monthStart(month)
  const to = monthStart(addMonths(month, 1))
  return Math.min(1, Math.max(0, (at - from) / (to - from)))
}

/** A client's usage, or null when its plan is not among its prices (billing flags that apart). */
export function usageOf(f: UsageFacts): PlanUsage | null {
  const own = f.tariff.plans.find((p) => p.id === f.plan)
  if (!own) return null
  const docs = f.docs.get(f.month) ?? 0
  const now = useOf(own, f.tariff.plans, f.month, docs)
  const share = monthShare(f.month, f.at)
  const projected = share >= PROJECT_FROM ? Math.round(docs / share) : null
  const first = f.startOn ? f.startOn.slice(0, 7) : null
  // Only the months of the contract: before it nothing was billed and nothing is to be offered from it.
  const history = [1, 2, 3]
    .slice(0, HISTORY_MONTHS)
    .map((n) => addMonths(f.month, -n))
    .filter((m) => first !== null && m >= first)
    .map((m) => useOf(own, f.tariff.plans, m, f.docs.get(m) ?? 0))
  const outgrown = history.filter((h) => h.over)
  const most = outgrown.reduce((max, h) => Math.max(max, h.docs), 0)
  const offer = outgrown.length >= OFFER_WHEN ? planForMonth(own, f.tariff.plans, most).plan : null
  // The first month free is billed for nothing whatever its documents (billing.ts, draftOf): no surcharge, nothing to
  // agree and no doorbell, only how near the plan it is.
  const free = f.tariff.firstMonthFree && first === f.month
  const state = free ? (stateOf(docs, own.docs, false) === 'ok' ? 'ok' : 'near') : stateOf(docs, own.docs, now.agree)
  return {
    month: f.month,
    plan: own,
    docs,
    limit: own.docs,
    share: own.docs > 0 ? docs / own.docs : 0,
    state,
    billedAs: free ? own : now.billedAs,
    extraCents: free ? 0 : now.billedAs.monthlyCents - own.monthlyCents,
    projected,
    projectedAs: projected === null ? null : planForMonth(own, f.tariff.plans, projected).plan,
    free,
    history,
    offer: offer && offer.id !== own.id ? offer : null,
  }
}

/** Most pressing first: a price to agree, a plan outgrown, near its limit, then by how full the plan is. */
export const STATE_ORDER: Record<UsageState, number> = { agree: 0, over: 1, near: 2, ok: 3 }
export function byPressure<T extends { usage: PlanUsage }>(a: T, b: T): number {
  return STATE_ORDER[a.usage.state] - STATE_ORDER[b.usage.state] || b.usage.share - a.usage.share
}
