// The cash box (18 October 2026): what goes into the company's cash and out of it besides the receipts it pays, each
// by a cash document numbered in the company's year (príjmový pokladničný doklad PPD2026-001, výdavkový VPD2026-001),
// booked at once against the cash box (211), and the cash book: account 211 day by day with its balance.
//
// What it leans on:
// - Act No. 431/2002 Z. z. on accounting: every movement of the cash box is an accounting case with its document
//   (§ 10), booked on 211 Pokladnica against the account of what it is (the chart the books keep: 261 money in transit
//   for cash taken from the bank or put in it, 365 the owner's loan, 353 the subscribed capital, 335 an advance to an
//   employee, 331 wages, 311 and 321 an invoice paid in cash, 333 a business trip's settlement).
// - Act No. 394/2012 Z. z. on limiting cash payments, as in force from 1 January 2026 (read on zakonypreludi.sk that
//   day): a cash payment above 5 000 € is forbidden (§ 4(1)); payments split within one legal relationship count
//   together (§ 6(2)); a fine up to 150 000 € for a legal person (§ 10(2)). Cash taken from or put into the company's
//   own bank account pays nobody, so it has no limit.
// - The cash box never goes below nothing: cash that is not there cannot be paid out.
import type { LedgerLine } from './ledger'

export type CashKind = 'withdrawal' | 'owner_in' | 'capital' | 'advance_back' | 'doc_in' | 'deposit' | 'owner_out' | 'advance' | 'wages' | 'doc_out'

export interface CashKindInfo {
  side: 'in' | 'out'
  /** The account against the cash box; 'doc' for an invoice paid in cash (its own open item's account). */
  contra: string
  /** Money between the cash box and the company's own bank account: no payment between two parties, no limit. */
  own: boolean
}

export const CASH_KINDS: Readonly<Record<CashKind, CashKindInfo>> = {
  withdrawal: { side: 'in', contra: '261', own: true },
  owner_in: { side: 'in', contra: '365', own: false },
  capital: { side: 'in', contra: '353', own: false },
  advance_back: { side: 'in', contra: '335', own: false },
  doc_in: { side: 'in', contra: 'doc', own: false },
  deposit: { side: 'out', contra: '261', own: true },
  owner_out: { side: 'out', contra: '365', own: false },
  advance: { side: 'out', contra: '335', own: false },
  wages: { side: 'out', contra: '331', own: false },
  doc_out: { side: 'out', contra: 'doc', own: false },
}

export const CASH_KIND_IDS = Object.keys(CASH_KINDS) as CashKind[]
export const isCashKind = (v: unknown): v is CashKind => typeof v === 'string' && Object.hasOwn(CASH_KINDS, v)

/** The most one cash payment may be (§ 4(1) of Act No. 394/2012 Z. z.), in cents. */
export const CASH_LIMIT = 500_000

/** The cash document's prefix: PPD for money in, VPD for money out. */
export const prefixOf = (kind: CashKind): 'PPD' | 'VPD' => (CASH_KINDS[kind].side === 'in' ? 'PPD' : 'VPD')

/** The entry of a cash document: the cash box against what it is (`docAccount` for an invoice paid in cash). */
export function cashLines(kind: CashKind, cents: number, docAccount: string | null = null): LedgerLine[] {
  const info = CASH_KINDS[kind]
  const contra = info.contra === 'doc' ? docAccount : info.contra
  if (!contra || cents <= 0) return []
  return info.side === 'in' ? [{ md: '211', d: contra, cents }] : [{ md: contra, d: '211', cents }]
}

export interface CashMove {
  on: string
  /** Plus into the cash box, minus out of it. */
  cents: number
}

/**
 * The lowest the cash box stands on any day from `from` on, the moves of each day taken together (money in on a day
 * pays out on the same day). Null when there is no day from then on.
 */
export function lowestFrom(moves: readonly CashMove[], from: string): number | null {
  const byDay = new Map<string, number>()
  for (const m of moves) byDay.set(m.on, (byDay.get(m.on) ?? 0) + m.cents)
  let balance = 0
  let lowest: number | null = null
  for (const day of [...byDay.keys()].sort()) {
    balance += byDay.get(day) ?? 0
    if (day >= from) lowest = lowest === null ? balance : Math.min(lowest, balance)
  }
  return lowest
}

export interface CashValues {
  kind: CashKind
  day: string
  amount: string
  party: string
  note: string
  document: string
  payment: string
}

export type CashErrors = Partial<Record<'kind' | 'day' | 'amount' | 'party' | 'document' | 'limit', string>>

export interface CashCopy {
  kind: string
  day: string
  future: string
  amount: string
  party: string
  document: string
  limit: string
}

/** What the cash form posted, checked; the amount of an invoice paid in cash is the invoice's, checked by the caller. */
export function readCash(
  field: (name: string) => unknown,
  copy: CashCopy,
  today: string,
  dayOf: (text: string) => string | null,
  centsOf: (text: string) => number | null,
): { values: CashValues; errors: CashErrors; input: { kind: CashKind; on: string; cents: number | null } | null } {
  const text = (name: string, max = 200) => {
    const v = field(name)
    return typeof v === 'string' ? v.trim().slice(0, max) : ''
  }
  const raw = text('druh', 20)
  const values: CashValues = {
    kind: isCashKind(raw) ? raw : 'withdrawal',
    day: text('den', 20),
    amount: text('suma', 20),
    party: text('kto', 120),
    note: text('poznamka', 300),
    document: text('doklad', 64),
    payment: text('platba', 64),
  }
  const errors: CashErrors = {}
  if (!isCashKind(raw)) errors.kind = copy.kind
  const on = dayOf(values.day)
  if (!on) errors.day = copy.day
  else if (on > today) errors.day = copy.future
  const forDoc = CASH_KINDS[values.kind].contra === 'doc'
  let cents: number | null = null
  if (forDoc) {
    if (!values.document) errors.document = copy.document
  } else {
    const c = centsOf(values.amount)
    if (c === null || !Number.isInteger(c) || c <= 0 || c > 100_000_000) errors.amount = copy.amount
    else cents = c
    if (!CASH_KINDS[values.kind].own && !values.party) errors.party = copy.party
  }
  if (cents !== null && !CASH_KINDS[values.kind].own && cents > CASH_LIMIT) errors.limit = copy.limit
  const input = Object.keys(errors).length === 0 && on ? { kind: values.kind, on, cents } : null
  return { values, errors, input }
}
