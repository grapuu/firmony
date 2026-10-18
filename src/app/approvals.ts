// Approving suppliers' invoices before they are paid (18 October 2026, for larger companies): who may approve and up
// to what amount, and from what amount two people must. The rule, said plainly:
// - Approving is the company's choice (`companies.approvals`); a supplier's invoice then goes into a payment order only
//   once it is approved whole (`documents.approved_at`).
// - An owner approves any amount. A colleague approves only when an owner made him an approver (`members.approver`),
//   and only up to his limit when he has one (`members.approve_limit`, in cents of euros).
// - From the amount an owner set (`companies.approval_two_from`), two different people approve: the first approval is
//   kept (`documents.first_approved_at`, `first_approved_by`), and the second, by somebody else allowed that amount,
//   approves it whole. Below it, one approval is enough.
// - An invoice in another currency counts as above every limit: an owner or an approver without a limit approves it,
//   and two when two are asked (payment orders take only euros, so it is paid by hand).
// - An approval is of what was approved: a total, currency, kind, supplier or variable symbol changed afterwards, or an
//   IBAN typed by anybody but an owner, takes it back (routes.tsx, team/routes.tsx), and so does "Zrušiť schválenie".
//   The approval itself is written only while the invoice is as the page showed it (its total, currency and IBAN).
// - A colleague who typed the supplier's IBAN never approves that invoice himself (`documents.iban_by`), so somebody
//   else always sees whom it pays.
// - A first approval counts only while its approver may still approve the amount (still a member, an approver, within
//   his limit); otherwise the next approval takes its place as the first. When the owners raise or clear the amount of
//   two approvals, one approval is enough again, also of the person who gave the first.

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
 * What a person's approval does to an invoice: approves it whole ('final'), is its first of two ('first'), takes the
 * place of a first approval whose approver may approve it no more ('again'), is refused because the first was his own
 * ('same') or because he typed its IBAN ('iban'), or nothing, since it is approved already ('done').
 */
export function approvalStep(
  doc: { approvedAt: number | null; firstApprovedBy: string | null; ibanBy?: string | null },
  twoFrom: number | null,
  cents: number,
  user: string,
  opts: { owner?: boolean; firstMay?: boolean } = {},
): 'final' | 'first' | 'again' | 'same' | 'iban' | 'done' {
  if (doc.approvedAt !== null) return 'done'
  if (!opts.owner && doc.ibanBy && doc.ibanBy === user) return 'iban'
  if (!needsTwo(twoFrom, cents)) return 'final'
  if (!doc.firstApprovedBy) return 'first'
  if (doc.firstApprovedBy === user) return 'same'
  return opts.firstMay === false ? 'again' : 'final'
}

/** What a document's page says of approving it, for the person who opened it. */
export interface DocApproval {
  /** He may approve its amount. */
  may: boolean
  /** From what amount it needs two approvals, when its amount does; null when one is enough. */
  twoFrom: number | null
  userId: string
  /** What his approval would do. */
  step: ReturnType<typeof approvalStep>
  /** A first approval whose approver may approve it no more. */
  firstVoid: boolean
  /** What the page shows of the invoice (`approvalSeen`), sent back with the approval. */
  seen: string
}

/** What the page showed of an invoice for approving: its total, currency and IBAN, so the approval is of that. */
export const approvalSeen = (doc: { totalCents: number | null; currency: string | null; partyIban: string | null }): string => `${doc.totalCents ?? ''}|${doc.currency ?? 'EUR'}|${doc.partyIban ?? ''}`
