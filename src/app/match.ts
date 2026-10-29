// Which document belongs to which payment, and which payments need no document. Pure functions: the database
// work is in store.ts, and every rule here is checked in test/units.test.mjs.
//
// The rule, said plainly:
// - A document and a payment can belong together only when the amounts are the same to the cent, the money went
//   the right way (a receipt or a received invoice is paid out, an issued invoice is paid in), and the dates fit
//   (a card receipt is settled at most a day before and five days after it was printed; an invoice is paid from
//   fifteen days before it was issued to sixty days after it was due).
// - Each sign that they belong together adds to a score: the same amount 50, the same variable symbol 40, the
//   same account 30, a similar name 20, dates at most three days apart 10.
// - They are paired without asking only when neither has any other candidate (two coffees at 2,50 € on one day
//   are never guessed) and the score is at least 70. Otherwise a candidate of at least 50 is offered to the
//   client, who confirms it with one tap.
// - One exception: a variable symbol that names exactly one of the candidates, which no other candidate payment
//   carries, decides (an invoice issued every month for the same amount is paid by the payment with its number).
//   A payment without a symbol carries the document's when its number, of at least six digits, stands alone in the
//   payer's name or the message (`carriesVs`).
// - Amounts are compared in one currency. A document in another currency paid into an account in euros belongs to
//   the payment only by its variable symbol and euros within 5 % of the document's at its own rate (the bank converts
//   at its rate of the day and may take a fee): then the euros count as the same amount.

export type DocKind = 'receipt' | 'invoice_in' | 'invoice_out' | 'other'

export interface MatchPayment {
  id: string
  bookedOn: string
  amountCents: number
  party: string | null
  partyIban: string | null
  vs: string | null
  /** The message for the payee, as the bank gave it. */
  note?: string | null
  /** The account's currency; euros when not said. */
  currency?: string | null
}

export interface MatchDocument {
  id: string
  kind: DocKind | null
  issuedOn: string | null
  dueOn: string | null
  totalCents: number | null
  party: string | null
  partyIban: string | null
  vs: string | null
  /** The document's currency (euros when not said) and, for another one, its total in euros at its rate. */
  currency?: string | null
  eurCents?: number | null
}

/** How far the euros a bank paid may be from a document's in another currency at its rate (5 %). */
export const FX_SLACK = 0.05

export const AUTO_SCORE = 70
export const SUGGEST_SCORE = 50

/** Days from a to b, both YYYY-MM-DD. */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)
}

/** A variable symbol as a number would read it: digits only, no leading zeros. */
export function normalizeVs(vs: string | null | undefined): string {
  return (vs ?? '').replace(/\D/g, '').replace(/^0+/, '')
}

/**
 * Whether a payment carries a document's variable symbol: as its own symbol, or, when it has none, as a number of at
 * least six digits standing alone in its message or in the payer's name. A payer who types the invoice's number where
 * the name or the message goes does so (europio's own statement of September 2026: a payment from a Revolut account
 * with the invoice's number as the payer's name and no symbol). A payment with a symbol of its own is judged by that alone.
 */
export function carriesVs(payment: Pick<MatchPayment, 'vs' | 'party' | 'note'>, docVs: string | null | undefined): boolean {
  const vs = normalizeVs(docVs)
  if (vs === '') return false
  const own = normalizeVs(payment.vs)
  if (own !== '') return own === vs
  if (vs.length < 6) return false
  return (`${payment.party ?? ''} ${payment.note ?? ''}`.match(/\d+/g) ?? []).some((number) => number.replace(/^0+/, '') === vs)
}

export function normalizeIban(iban: string | null | undefined): string {
  return (iban ?? '').replace(/\s/g, '').toUpperCase()
}

const LEGAL_FORMS = /\b(s\s*r\s*o|spol|j\s*s\s*a|a\s*s|k\s*s|v\s*o\s*s|sro|as|jsa|ltd|gmbh|inc|llc|se|ag|plc)\b/g
const STOP = new Set(['slovakia', 'slovensko', 'bratislava', 'kosice', 'zilina', 'presov', 'nitra', 'trnava', 'banska', 'bystrica', 'platba', 'kartou', 'nakup', 'pos'])

/** The words of a name that tell it apart: no accents, no legal form, no city, nothing shorter than four letters. */
export function nameWords(name: string | null | undefined): string[] {
  const plain = (name ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[.,]/g, ' ')
    .replace(LEGAL_FORMS, ' ')
  return [...new Set(plain.split(/[^a-z0-9]+/).filter((word) => word.length >= 4 && !STOP.has(word)))]
}

export function namesSimilar(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = nameWords(a)
  const right = nameWords(b)
  if (left.length === 0 || right.length === 0) return false
  return left.some((word) => right.some((other) => word === other || (word.length >= 5 && other.length >= 5 && (word.startsWith(other) || other.startsWith(word)))))
}

/** Which way the money of a document goes: an issued invoice is paid in, everything else is paid out. */
export function direction(kind: DocKind | null): 1 | -1 {
  return kind === 'invoice_out' ? 1 : -1
}

/** Whether the dates of a document and a payment fit together. A document without a date fits any day. */
export function datesFit(payment: MatchPayment, doc: MatchDocument): boolean {
  if (!doc.issuedOn) return true
  const days = daysBetween(doc.issuedOn, payment.bookedOn)
  if (doc.kind === 'receipt') return days >= -1 && days <= 5
  const dueDays = doc.dueOn ? Math.max(0, daysBetween(doc.issuedOn, doc.dueOn)) : 30
  return days >= -15 && days <= Math.min(dueDays + 60, 180)
}

/** How surely a document belongs to a payment: 0 when it cannot. */
export function score(payment: MatchPayment, doc: MatchDocument): number {
  if (doc.totalCents === null || doc.totalCents <= 0) return 0
  const sameVs = carriesVs(payment, doc.vs)
  if ((doc.currency ?? 'EUR') === (payment.currency ?? 'EUR')) {
    if (payment.amountCents !== direction(doc.kind) * doc.totalCents) return 0
  } else {
    // Another currency, paid in euros: its own number and the euros near the document's at its rate.
    const euros = direction(doc.kind) * payment.amountCents
    if ((payment.currency ?? 'EUR') !== 'EUR' || !doc.eurCents || doc.eurCents <= 0 || !sameVs || euros <= 0) return 0
    if (Math.abs(euros - doc.eurCents) > doc.eurCents * FX_SLACK) return 0
  }
  if (!datesFit(payment, doc)) return 0
  let points = 50
  if (sameVs) points += 40
  const iban = normalizeIban(doc.partyIban)
  if (iban !== '' && iban === normalizeIban(payment.partyIban)) points += 30
  if (namesSimilar(doc.party, payment.party)) points += 20
  if (doc.issuedOn && Math.abs(daysBetween(doc.issuedOn, payment.bookedOn)) <= 3) points += 10
  return points
}

export interface Decision {
  /** Pairs made without asking: [payment, document]. */
  auto: [string, string][]
  /** For a payment, the documents offered to the client, best first. */
  suggest: Map<string, string[]>
}

/**
 * Decides over payments that still need a document and documents that still need a payment. A pair is made only
 * when it is each other's only candidate and sure enough; nothing else is guessed.
 */
export function decide(payments: readonly MatchPayment[], documents: readonly MatchDocument[]): Decision {
  const byPayment = new Map<string, { doc: string; points: number }[]>()
  const byDocument = new Map<string, string[]>()
  for (const payment of payments) {
    for (const doc of documents) {
      const points = score(payment, doc)
      if (points < SUGGEST_SCORE) continue
      byPayment.set(payment.id, [...(byPayment.get(payment.id) ?? []), { doc: doc.id, points }])
      byDocument.set(doc.id, [...(byDocument.get(doc.id) ?? []), payment.id])
    }
  }
  const auto: [string, string][] = []
  const suggest = new Map<string, string[]>()
  const paymentOf = new Map(payments.map((p) => [p.id, p]))
  const documentOf = new Map(documents.map((d) => [d.id, d]))
  const sameVs = (paymentId: string, docId: string) => {
    const payment = paymentOf.get(paymentId)
    return Boolean(payment) && carriesVs(payment!, documentOf.get(docId)?.vs)
  }
  for (const [paymentId, candidates] of byPayment) {
    const only = candidates.length === 1 ? candidates[0] : undefined
    if (only && only.points >= AUTO_SCORE && (byDocument.get(only.doc) ?? []).length === 1) {
      auto.push([paymentId, only.doc])
      continue
    }
    const named = candidates.filter((candidate) => candidate.points >= AUTO_SCORE && sameVs(paymentId, candidate.doc))
    const theOne = named.length === 1 ? named[0] : undefined
    if (theOne && (byDocument.get(theOne.doc) ?? []).filter((other) => sameVs(other, theOne.doc)).length === 1) {
      auto.push([paymentId, theOne.doc])
      continue
    }
    suggest.set(
      paymentId,
      [...candidates].sort((a, b) => b.points - a.points).map((candidate) => candidate.doc),
    )
  }
  return { auto, suggest }
}

// ---------------------------------------------------------------------------------------------------------------
// Payments that need no document
// ---------------------------------------------------------------------------------------------------------------

/**
 * Why a payment needs no document from the client: a bank's own fee or interest, money moved between the
 * company's own accounts, wages and what goes with them (the accountant makes their papers), a tax or another
 * payment to the state, money put into the company or lent to it, or something else the client explains.
 */
export type Exempt = 'bank' | 'own' | 'payroll' | 'state' | 'capital' | 'other'
export const EXEMPTS: readonly Exempt[] = ['bank', 'own', 'payroll', 'state', 'capital', 'other']

export interface ExemptPayment {
  amountCents: number
  party: string | null
  partyIban: string | null
  note: string | null
}

/** The state's accounts are at the State Treasury, bank code 8180: taxes, social insurance, fees. */
export function isStateIban(iban: string | null | undefined): boolean {
  const normal = normalizeIban(iban)
  return normal.startsWith('SK') && normal.slice(4, 8) === '8180'
}

const BANK_WORDS = /(poplatok|poplatky|vedenie (uctu|účtu)|úrok|urok|bankov[aá] poplatok|fee|charge|interest|kapitaliz)/i
/** The transaction tax a Slovak bank withholds on the account itself ("Transakcna dan 06.08.2026" in Tatra banka's
 *  export of 1 October 2026; Act No. 279/2024 Z. z., § 10): a tax, which no document stands behind. */
export const TRANSACTION_TAX_WORDS = /transak[cč]n[aá]\s+da[nň]|da[nň]\s+z\s+finan[cč]n/i

/** A payment that plainly needs no document, recognised without asking anybody; null when a person decides. */
export function autoExempt(payment: ExemptPayment, ownIbans: readonly string[]): Exempt | null {
  const iban = normalizeIban(payment.partyIban)
  if (iban !== '' && ownIbans.some((own) => normalizeIban(own) === iban)) return 'own'
  if (isStateIban(iban)) return 'state'
  if (iban === '' && TRANSACTION_TAX_WORDS.test(`${payment.party ?? ''} ${payment.note ?? ''}`)) return 'state'
  if (iban === '' && BANK_WORDS.test(`${payment.party ?? ''} ${payment.note ?? ''}`)) return 'bank'
  return null
}
