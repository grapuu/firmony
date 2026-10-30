// The money view (30 October 2026): what the company is known to hold, to receive and to pay in the next month,
// worked out from the same data as the deadlines, so the two can never disagree. It is a view of cash, never of
// profit: the balance on the accounts is not earnings, and a payout fits when the known obligations stay covered,
// not when it is sensible or allowed. Pure: money-store.ts loads what it needs, inside-pages.tsx shows it,
// test/money.units.mjs checks every rule.
import { addDays } from './ending'

/** One known movement of money: its day, how much, and what it is. */
export interface MoneyItem {
  day: string
  label: string
  cents: number
}

export interface MoneyFacts {
  /** The day the view is made for (YYYY-MM-DD). */
  today: string
  /** The newest balance the accounts hold; null while none is known. */
  balanceCents: number | null
  balanceOn: string | null
  /** What is expected to come in: the company's issued invoices nobody has paid yet. */
  incoming: readonly MoneyItem[]
  /** What is known to go out: taxes a filed return asks for, the payroll, unpaid received invoices and Firmony's own. */
  outgoing: readonly MoneyItem[]
}

/** How far ahead the view looks: the rest of this month and the next one. */
export const MONEY_DAYS = 30

export interface MoneyWindow {
  days: number
  inCents: number
  outCents: number
  /** Balance + what comes in − what goes out; null while the balance is unknown. */
  reserveCents: number | null
  /**
   * unknown: no balance is known yet; short: the known outflows exceed what is known to be there; tight: the known
   * outflows are covered only thanks to the money expected to come in; fine: the balance alone covers them.
   */
  mood: 'unknown' | 'fine' | 'tight' | 'short'
}

/** The next `days` days from today, the day itself and the expected movements counted. */
export function moneyWindow(facts: MoneyFacts, days: number): MoneyWindow {
  const until = addDays(facts.today, days)
  const inCents = facts.incoming.filter((i) => i.day >= facts.today && i.day < until).reduce((sum, i) => sum + i.cents, 0)
  const outCents = facts.outgoing.filter((o) => o.day >= facts.today && o.day < until).reduce((sum, o) => sum + o.cents, 0)
  const reserveCents = facts.balanceCents === null ? null : facts.balanceCents + inCents - outCents
  const mood: MoneyWindow['mood'] =
    reserveCents === null ? 'unknown' : reserveCents < 0 ? 'short' : (facts.balanceCents ?? 0) < outCents ? 'tight' : 'fine'
  return { days, inCents, outCents, reserveCents, mood }
}

export type PayoutVerdict =
  | { ok: true; reserveCents: number }
  | { ok: false; known: false; reserveCents: null }
  | {
      ok: false
      known: true
      /** What is left at the end of the window after the payout. */
      reserveCents: number
      /** The deepest the money would dip below nothing; 0 when the payout alone is the shortfall. */
      shortCents: number
      /** The payout itself fits the balance on the accounts today. */
      immediate: boolean
      /** The first known outflow that would not be covered on its day. */
      uncovered: MoneyItem[]
    }

/** Everything the home page's money section shows, worked out once in the route. */
export interface MoneyView {
  facts: MoneyFacts
  window: MoneyWindow
  /** The answer to the payout the user asked about, or null when none was asked. */
  ask: PayoutVerdict | null
  /** The payout the user asked about, in cents; null when none was asked. */
  asked: number | null
  /** The user typed an amount that is no amount. */
  invalid: boolean
}

export function moneyView(facts: MoneyFacts, asked: number | null, invalid: boolean): MoneyView {
  return { facts, window: moneyWindow(facts, MONEY_DAYS), ask: asked === null ? null : payoutVerdict(facts, asked), asked, invalid }
}

/**
 * Whether a payout of this size leaves the known next-month obligations covered. Every obligation is checked on
 * its own day, so an inflow that comes after an outflow does not cover it. When it does not fit, the first known
 * outflow that would go uncovered is named.
 */
export function payoutVerdict(facts: MoneyFacts, amountCents: number): PayoutVerdict {
  if (facts.balanceCents === null) return { ok: false, known: false, reserveCents: null }
  const until = addDays(facts.today, MONEY_DAYS)
  const events: { day: string; delta: number; item: MoneyItem | null }[] = [
    { day: facts.today, delta: -amountCents, item: null },
    ...facts.incoming.filter((i) => i.day >= facts.today && i.day < until).map((i) => ({ day: i.day, delta: i.cents, item: null })),
    ...facts.outgoing.filter((o) => o.day >= facts.today && o.day < until).map((o) => ({ day: o.day, delta: -o.cents, item: o })),
  ]
  events.sort((a, b) => a.day.localeCompare(b.day))
  const immediate = facts.balanceCents >= amountCents
  let cash = facts.balanceCents
  let shortCents = 0
  const uncovered: MoneyItem[] = []
  for (const event of events) {
    cash += event.delta
    if (cash < 0 && -cash > shortCents) shortCents = -cash
    if (event.item && cash < 0 && uncovered.length === 0) uncovered.push(event.item)
  }
  const ok = immediate && shortCents === 0
  return ok ? { ok: true, reserveCents: cash } : { ok: false, known: true, reserveCents: cash, shortCents, immediate, uncovered }
}
