// Approving suppliers' invoices before they are paid (18 October 2026, for larger companies): who may approve and up
// to what amount, and from what amount two people must. The rule, said plainly:
// - Approving is the company's choice (`companies.approvals`); a supplier's invoice then goes into a payment order only
//   once it is approved whole (`documents.approved_at`).
// - An owner approves any amount. A colleague approves only when an owner made him an approver (`members.approver`),
//   and only up to his limit when he has one (`members.approve_limit`, in cents of euros).
// - From the amount an owner set (`companies.approval_two_from`), two different people approve: the first approval is
//   kept (`documents.first_approved_at`, `first_approved_by`), and the second, by somebody else allowed that amount,
//   approves it whole. Below it, one approval is enough.
// - An invoice in another currency counts as above every limit: only an owner approves it, and two when two are asked.
// - An approval is of what was approved: a total changed afterwards, or an IBAN typed by anybody but an owner, takes it
//   back (routes.tsx, team/routes.tsx), and so does "Zrušiť schválenie".

export interface Approver {
  owner: boolean
  approver: boolean
  /** The most he approves, in cents; null for any amount. */
  limit: number | null
}

/** What an invoice is worth for approving: its euros, or above every limit in another currency. */
export const approvalCents = (doc: { totalCents: number | null; currency: string | null }): number => ((doc.currency ?? 'EUR') === 'EUR' ? Math.abs(doc.totalCents ?? 0) : Number.MAX_SAFE_INTEGER)

/** Whether a person may approve an amount. */
export const mayApprove = (a: Approver | null, cents: number): boolean => Boolean(a && (a.owner || (a.approver && (a.limit === null || cents <= a.limit))))

/** Whether an amount needs two approvals. */
export const needsTwo = (twoFrom: number | null, cents: number): boolean => twoFrom !== null && cents >= twoFrom

/**
 * What a person's approval does to an invoice: approves it whole ('final'), is its first of two ('first'), is refused
 * because the first was his own ('same'), or nothing, since it is approved already ('done').
 */
export function approvalStep(doc: { approvedAt: number | null; firstApprovedBy: string | null }, twoFrom: number | null, cents: number, user: string): 'final' | 'first' | 'same' | 'done' {
  if (doc.approvedAt !== null) return 'done'
  if (!needsTwo(twoFrom, cents)) return 'final'
  if (!doc.firstApprovedBy) return 'first'
  return doc.firstApprovedBy === user ? 'same' : 'final'
}
