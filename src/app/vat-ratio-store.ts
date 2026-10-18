// The proportional deduction's years against the documents (vat-ratio.ts): a year's settlement is confirmed by the
// accountant, but a document of the year may be booked or changed after it (a December invoice that comes in January),
// so wherever the year's last period is worked out its figures are read again and a settlement that no longer holds
// keeps that period back ('ratioChanged') instead of going into the return as it was.
import { docsAround, filedMap, filedReturns, type FiledReturn } from './vat-store'
import { vatCompanyOf, vatDocOf, type Company } from './store'
import { isLastOfYear, ratioWork, sameSettlement, settledOf } from './vat-ratio'

/** The years whose last period is among these periods. */
export const lastYearsOf = (periods: readonly string[]): number[] => [...new Set(periods.filter(isLastOfYear).map((p) => Number(p.slice(0, 4))))]

/**
 * The company with each settled year of these whose figures changed since, or that has a document not booked, marked
 * stale; the company itself when none is (most companies, which have no settlement, cost no query).
 */
export async function withFreshRatios(db: D1Database, company: Company, years: readonly number[], filed?: FiledReturn[]): Promise<Company> {
  const settled = (company.vatRatios ?? []).filter((r) => r.settled && years.includes(r.year))
  if (company.vatStatus !== 'payer' || settled.length === 0) return company
  const returns = filed ?? (await filedReturns(db, company.id))
  const stale = new Set<number>()
  for (const r of settled) {
    const docs = await docsAround(db, company.id, `${r.year}-01`, `${r.year}-12`)
    const work = ratioWork(vatCompanyOf(company), r.year, docs.map(vatDocOf), filedMap(returns))
    // A document of the year not booked yet may change it as much as one changed since.
    if (r.settled && (work.unbooked.length > 0 || !sameSettlement(r.settled, settledOf(work)))) stale.add(r.year)
  }
  if (stale.size === 0) return company
  return { ...company, vatRatios: (company.vatRatios ?? []).map((r) => (stale.has(r.year) ? { ...r, stale: true } : r)) }
}
