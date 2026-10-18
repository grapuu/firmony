// The supplier's side of a claim not paid (§ 25a of the VAT Act): a payer that supplied in Slovakia with its own VAT
// (§ 69(1)) and was not paid may lower the base and the VAT once the claim is uncollectible, by a corrective document to
// the customer, and raises them again with what it is paid later. Read on 18 October 2026: § 25a as inserted by Act
// No. 344/2020 Z. z. (Čl. I bod 18, in force from 1 January 2021) and as changed by Act No. 516/2022 Z. z. (Čl. I body 4
// to 8, from 1 January 2023, § 85km: the new ods. 2 písm. a) for claims whose 150 days ended after 31 December 2022), both
// on static.slov-lex.sk through WebFetch (the consolidated text of 2026 lists the same sixteen paragraphs); the Financial
// Administration's answers 131288 (only a supply in Slovakia taxed under § 69(1); a right, not a duty; eKasa receipts
// never) and 029104 (C.1 of the control statement: the corrective document's number, the invoice's, base and VAT with a
// minus, the rate and "x" in the column of § 25a; after a payment the same with a plus).
//
// - When (§ 25a(2)): (a) 150 days after the due day, in the extent not paid, and a claim up to 1 000 € with VAT for which
//   the payer took a step to recover it, or above 1 000 € claimed in a court (not an arbitration court) or enforced in an
//   execution; (b) bankruptcy stopped or cancelled for lack of assets (the day its finality is published in the Obchodný
//   vestník), or the claim ascertained in it; (c) a debt discharge: bankruptcy cancelled for lack of assets, the claim
//   ascertained, or a repayment schedule set (in its extent); (d) a legal person ended without a successor; (e) the
//   customer died: the inheritance stopped for no assets, or the claim filed in the estate's liquidation; (f) a
//   restructuring ended with the claim not filed in it. The 150 days are counted as § 53b's 100: the claim is uncollectible
//   on the 151st day after the due day (or the later day the step, the action or the execution came).
// - Not at all (§ 25a(4)): a customer close to the payer (§ 22(9) of the Income Tax Act), a supply after the customer's
//   bankruptcy was declared, a payer that knew or could have known by the supply that it would not be paid.
// - Within three years after the deadline of the return of the supply's period, the time of the proceedings of § 25a(5)
//   not counted: only said here, since those times are the accountant's to know.
// - In the period it became uncollectible (§ 25a(3)), no more than was not paid: rows 26 and 27 of the return with a minus.
// - A corrective document (§ 25a(7), (9)) when the customer was a taxable person, none after (d) and (e) (§ 25a(8)): its
//   number and day, the amounts corrected, "oprava základu dane podľa § 25a" and the invoice's particulars of § 74(1)(a)
//   to (c); issued and sent by the deadline of that return (§ 25a(11)), else the correction is not recognised (§ 25a(13)).
// - Paid later (§ 25a(6)): the base raised by what is paid, in the period of the payment, by a corrective document with the
//   first one's number and day, the amount received with its VAT and the day (§ 25a(10)); assigning the claim counts as paid.
// - Not built: assigning the claim, the lowered base raised again after an action withdrawn or lost (§ 25a(15), (16)), a
//   claim paid in parts by several payments, the special schemes (§ 25a(14)), the customer's side of a corrective document
//   received (§ 53b for it), a claim in another currency.

/** The cases of § 25a(2), as the form names them. */
export const BAD_DEBT_GROUNDS = ['a1', 'a2', 'a3', 'b1', 'b2', 'b3', 'c1', 'c2', 'c3', 'd', 'e1', 'e2', 'f'] as const
export type BadDebtGround = (typeof BAD_DEBT_GROUNDS)[number]
export const isBadDebtGround = (value: unknown): value is BadDebtGround => typeof value === 'string' && (BAD_DEBT_GROUNDS as readonly string[]).includes(value)

/** After these no corrective document is issued (§ 25a(8)): the customer ended without a successor, or died. */
export const NO_DOCUMENT_GROUNDS: readonly BadDebtGround[] = ['d', 'e1', 'e2']
/** The cases of § 25a(2)(a): 150 days after the due day, the claim's amount deciding which. */
export const AFTER_150_GROUNDS: readonly BadDebtGround[] = ['a1', 'a2', 'a3']
/** 1 000 € with VAT: up to it a step to recover the claim is enough (§ 25a(2)(a)(1)). */
export const BAD_DEBT_SMALL = 100_000

/** What a correction lowers or raises at a rate, both plus. */
export interface BadDebtLine {
  rate: number
  base: number
  vat: number
}

/** A correction as stored (`bad_debts`): the lowering of § 25a(3), or the raising of § 25a(6) after a payment. */
export interface BadDebt {
  id: string
  kind: 'reduce' | 'restore'
  ground: BadDebtGround | null
  /** The day the claim became uncollectible, or the day of the payment. */
  eventOn: string
  /** The corrective document's number and day; none when none is issued (§ 25a(8), a customer that is no taxable person). */
  number: string | null
  issuedOn: string | null
  /** The day the corrective document was sent to the customer. */
  sentOn: string | null
  lines: BadDebtLine[]
  /** The claim with VAT the correction is of. */
  cents: number
  evidence: string | null
  paymentId: string | null
}

const addDays = (day: string, days: number): string => new Date(Date.parse(`${day}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)

/** The day a claim is uncollectible under § 25a(2)(a) at the earliest: the 151st after its due day. */
export const after150 = (dueOn: string): string => addDays(dueOn, 151)

/** The total with VAT of lines. */
export const grossOf = (lines: readonly { base: number; vat: number }[]): number => lines.reduce((sum, l) => sum + l.base + l.vat, 0)

/**
 * The base and VAT of a part of an invoice not paid (`unpaid`, with VAT), rate by rate: each taxed line's share of it by
 * its own total, its VAT the share times the rate over one hundred and the rate, the base the rest; the whole invoice its
 * lines as they are. Lines without VAT are no part of § 25a.
 */
export function badDebtLines(lines: readonly { rate: number; base: number; vat: number }[], unpaid: number): BadDebtLine[] {
  const gross = grossOf(lines)
  const taxed = lines.filter((l) => l.rate > 0 && l.vat > 0)
  if (gross <= 0 || unpaid <= 0 || taxed.length === 0) return []
  if (unpaid >= gross) return taxed.map((l) => ({ rate: l.rate, base: l.base, vat: l.vat }))
  const taxedPart = Math.round((unpaid * grossOf(taxed)) / gross)
  let left = taxedPart
  return taxed.map((l, i) => {
    const part = i === taxed.length - 1 ? left : Math.round((unpaid * (l.base + l.vat)) / gross)
    left -= part
    const vat = Math.round((part * l.rate) / (100 + l.rate))
    return { rate: l.rate, base: part - vat, vat }
  })
}

/** The share of a correction's lines that `part` of its `whole` claim makes: what a payment pays raises the base by. */
export function shareOf(lines: readonly BadDebtLine[], part: number, whole: number): BadDebtLine[] {
  if (part >= whole) return lines.map((l) => ({ ...l }))
  return lines.map((l) => ({ rate: l.rate, base: Math.round((l.base * part) / whole), vat: Math.round((l.vat * part) / whole) }))
}

const int = (value: unknown): number | null => (typeof value === 'number' && Number.isInteger(value) ? value : null)
const text = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null)

/** A document's corrections as the column of store.ts lists them; what is not one is left out. */
export function badDebtsOf(value: unknown): BadDebt[] {
  if (typeof value !== 'string') return []
  try {
    const list = JSON.parse(value) as unknown
    if (!Array.isArray(list)) return []
    const out: BadDebt[] = []
    for (const item of list) {
      if (!item || typeof item !== 'object') continue
      const b = item as Record<string, unknown>
      const kind = b.kind === 'reduce' || b.kind === 'restore' ? b.kind : null
      const eventOn = text(b.event_on)
      const cents = int(b.cents)
      if (!kind || !eventOn || cents === null || typeof b.id !== 'string') continue
      let lines: BadDebtLine[] = []
      try {
        const parsed = JSON.parse(String(b.lines)) as unknown
        if (Array.isArray(parsed))
          lines = parsed
            .map((l) => ({ rate: Number((l as Record<string, unknown>).rate), base: Number((l as Record<string, unknown>).base), vat: Number((l as Record<string, unknown>).vat) }))
            .filter((l) => [l.rate, l.base, l.vat].every(Number.isInteger))
      } catch {
        lines = []
      }
      out.push({
        id: b.id,
        kind,
        ground: isBadDebtGround(b.ground) ? b.ground : null,
        eventOn,
        number: text(b.number),
        issuedOn: text(b.issued_on),
        sentOn: text(b.sent_on),
        lines,
        cents,
        evidence: text(b.evidence),
        paymentId: text(b.payment_id),
      })
    }
    return out
  } catch {
    return []
  }
}

export interface BadDebtForm {
  ground: string
  day: string
  amount: string
  evidence: string
  confirm: boolean
}

export interface BadDebtInput {
  ground: BadDebtGround
  eventOn: string
  cents: number
  evidence: string
}

export type BadDebtErrors = Partial<Record<'ground' | 'day' | 'amount' | 'evidence' | 'confirm', string>>

/** What the form asks to check against: the invoice's due day and supply day, what it left owed on a day, and today. */
export interface BadDebtContext {
  dueOn: string | null
  suppliedOn: string
  /** The claim on a day: the invoice after its credit notes up to it, less what was paid by it. */
  owedAt: (day: string) => number
  today: string
}

/**
 * The form read: the case, the day (the event's; for § 25a(2)(a) the day of the step, the action or the execution, the
 * claim then uncollectible on the later of it and the 151st day after the due day), the claim not paid on that day (at
 * most what was owed then, which also decides between a step and an action at 1 000 €), what proves it, and the word that
 * § 25a(4) keeps none of it out. `dayOf` reads a Slovak date, `moneyOf` an amount.
 */
export function readBadDebt(
  form: BadDebtForm,
  ctx: BadDebtContext,
  dayOf: (text: string) => string | null,
  moneyOf: (text: string) => number | null,
  copy: Record<keyof BadDebtErrors | 'due' | 'small' | 'large' | 'early' | 'future' | 'owed', string>,
): { input: BadDebtInput | null; errors: BadDebtErrors } {
  const errors: BadDebtErrors = {}
  const ground = isBadDebtGround(form.ground) ? form.ground : null
  if (!ground) errors.ground = copy.ground
  const day = form.day.trim() === '' ? null : dayOf(form.day)
  if (form.day.trim() !== '' && !day) errors.day = copy.day
  const evidence = form.evidence.trim().slice(0, 1000)
  if (evidence.length < 5) errors.evidence = copy.evidence
  if (!form.confirm) errors.confirm = copy.confirm
  let eventOn: string | null = null
  const after = ground !== null && AFTER_150_GROUNDS.includes(ground)
  if (after) {
    if (!ctx.dueOn) errors.day = copy.due
    else if (!day) errors.day = errors.day ?? copy.day
    else eventOn = day > after150(ctx.dueOn) ? day : after150(ctx.dueOn)
  } else if (ground) {
    if (!day) errors.day = errors.day ?? copy.day
    else eventOn = day
  }
  if (eventOn && eventOn > ctx.today) {
    errors.day = after && day && day <= ctx.today ? copy.early : copy.future
    eventOn = null
  }
  if (eventOn && eventOn < ctx.suppliedOn) {
    errors.day = copy.day
    eventOn = null
  }
  // The claim on the day it became uncollectible: what may be lowered at most, and what the 1 000 € are of.
  const claim = eventOn ? ctx.owedAt(eventOn) : null
  const typed = form.amount.trim() === '' ? claim : moneyOf(form.amount)
  const cents = typed === null || Number.isNaN(typed) || typed <= 0 ? null : typed
  if (form.amount.trim() !== '' && cents === null) errors.amount = copy.amount
  else if (claim !== null && claim <= 0) errors.amount = copy.owed
  else if (cents !== null && claim !== null && cents > claim) errors.amount = copy.owed
  if (claim !== null && claim > 0 && after) {
    if (ground === 'a1' && claim > BAD_DEBT_SMALL) errors.ground = copy.small
    if (ground !== 'a1' && claim <= BAD_DEBT_SMALL) errors.ground = copy.large
  }
  if (Object.keys(errors).length > 0 || !ground || !eventOn || cents === null) return { input: null, errors }
  return { input: { ground, eventOn, cents, evidence }, errors }
}

/** The last day of the three years of § 25a(5): three years after the deadline of the return of the supply's period. */
export const threeYearsFrom = (deadline: string): string => `${Number(deadline.slice(0, 4)) + 3}${deadline.slice(4)}`
