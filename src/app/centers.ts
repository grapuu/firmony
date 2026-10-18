// Cost centres (18 October 2026): a company's own division of its costs and revenues (strediská: a shop, a branch, a
// project, a contract), given to its documents, and what each centre earned in a period, worked out from the books.
//
// The rule, said plainly:
// - A centre is the company's: a short code (letters, digits, a dash, up to 12) and a name; archived, it keeps its
//   documents and takes no new ones.
// - A document belongs to one centre or to none. The client gives it on the document's page, the accountant on the
//   booking screen; it is the company's management information, not the books' (no period lock holds it).
// - A centre's costs are the class 5 accounts and its revenues the class 6 accounts of the entries of its documents
//   (the document's own entry and what follows it in the books, an exchange difference of its payment); everything
//   else (payroll, depreciation, a bank's fee, the accountant's internal documents) is the company's in common.
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
    const center = e.docId ? (centerOfDoc.get(e.docId) ?? null) : null
    const sum = sums.get(center) ?? { revenue: 0, costs: 0 }
    for (const l of e.lines) {
      if (classOf(l.md) === '5') sum.costs += l.cents
      if (classOf(l.d) === '5') sum.costs -= l.cents
      if (classOf(l.d) === '6') sum.revenue += l.cents
      if (classOf(l.md) === '6') sum.revenue -= l.cents
    }
    sums.set(center, sum)
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
  return [...centers.filter((c) => !c.archived || sums.has(c.id)).map((c) => row(c.id)), row(null)]
}
