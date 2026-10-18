// Cost centres (18 October 2026): a company's own division of its costs and revenues (strediská: a shop, a branch, a
// project, a contract), given to its documents, and what each centre earned in a period, worked out from the books.
//
// The rule, said plainly:
// - A centre is the company's: a short code (letters, digits, a dash, up to 12) and a name; archived, it keeps its
//   documents and takes no new ones.
// - A document belongs to one centre or to none. The client gives it on the document's page, the accountant on the
//   booking screen; it is the company's management information, not the books' (no period lock holds it).
// - A centre's costs are the class 5 accounts and its revenues the class 6 accounts of the entries of its documents
//   (the document's own entry and the exchange difference its payment settles it with); everything else is the
//   company's in common: payroll, depreciation, the cost of goods sold out of stock (stock.ts books it by months, not
//   by document), the year's revaluation of what is open in another currency, a bank's fee, the accountant's internal
//   documents, the income tax, and documents without a centre.
// - A credit note, an invoice of late interest and an invoice issued by a repeat take the centre of the invoice they
//   come from (invoices.ts, `centerFrom`).
// - A centre's budget (owners, `cost_center_budgets`) is its revenues and costs planned for a calendar year; a period of
//   months is compared with its months' share of the year's (`budgetShare`), and the report says how much of it was
//   spent or earned.
// - A supplier's rule (store.ts, `ruleStatement`) remembers the centre the accountant booked its document with and gives
//   it to the supplier's next documents that have none.
import type { LedgerEntry } from './ledger'

export interface CostCenter {
  id: string
  code: string
  name: string
  archived: boolean
}

export interface CenterTotals {
  /** The centre's id, or null for what is the company's in common. */
  id: string | null
  revenue: number
  costs: number
  result: number
}

/** A centre's code as typed: letters, digits and dashes, in capitals, up to 12; null when it is none. */
export function centerCode(text: string): string | null {
  const code = text.trim().toUpperCase()
  return /^[A-Z0-9][A-Z0-9-]{0,11}$/.test(code) ? code : null
}

const classOf = (account: string) => account.charAt(0)

/**
 * The revenues and costs of each centre in a period (days from and to, both included), from the books' entries and
 * the centre of each document; the centres in the order given, the common part last.
 */
export function centerTotals(entries: readonly LedgerEntry[], centerOfDoc: ReadonlyMap<string, string | null>, centers: readonly CostCenter[], from: string, to: string): CenterTotals[] {
  const sums = new Map<string | null, { revenue: number; costs: number }>()
  for (const e of entries) {
    if (e.on < from || e.on > to) continue
    for (const l of e.lines) {
      // A line of one document of an entry of several (a payment's exchange difference) is that document's.
      const doc = l.docId ?? e.docId
      const center = doc ? (centerOfDoc.get(doc) ?? null) : null
      const sum = sums.get(center) ?? { revenue: 0, costs: 0 }
      if (classOf(l.md) === '5') sum.costs += l.cents
      if (classOf(l.d) === '5') sum.costs -= l.cents
      if (classOf(l.d) === '6') sum.revenue += l.cents
      if (classOf(l.md) === '6') sum.revenue -= l.cents
      sums.set(center, sum)
    }
  }
  const known = new Set(centers.map((c) => c.id))
  // A document of a centre since removed from the list counts in common.
  for (const [id, sum] of [...sums]) {
    if (id !== null && !known.has(id)) {
      const common = sums.get(null) ?? { revenue: 0, costs: 0 }
      sums.set(null, { revenue: common.revenue + sum.revenue, costs: common.costs + sum.costs })
      sums.delete(id)
    }
  }
  const row = (id: string | null): CenterTotals => {
    const s = sums.get(id) ?? { revenue: 0, costs: 0 }
    return { id, revenue: s.revenue, costs: s.costs, result: s.revenue - s.costs }
  }
  // An archived centre stays while it has documents (in any period) or entries in this one.
  const withDocs = new Set(centerOfDoc.values())
  return [...centers.filter((c) => !c.archived || sums.has(c.id) || withDocs.has(c.id)).map((c) => row(c.id)), row(null)]
}

/** A centre's budget of a year, in cents. */
export interface CenterBudget {
  revenue: number
  costs: number
}

/** The share of a year's budget for the months from and to (both included, 1 to 12), rounded to the cent. */
export const budgetShare = (yearly: number, from: number, to: number): number => Math.round((yearly * Math.max(0, to - from + 1)) / 12)

/** How much of a budget an amount is, in whole per cent; null without a budget. */
export const budgetUse = (amount: number, budget: number): number | null => (budget > 0 ? Math.round((amount * 100) / budget) : null)
