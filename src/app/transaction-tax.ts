// The transaction tax (daň z finančných transakcií) a company works out and pays itself on its accounts at payment
// service providers outside Slovakia (20 October 2026, his word: "poďme urobiť ešte nejaké povinnosti, čo určite
// existujú"; a young company's Revolut or Wise account is the usual case). Read that day: Act No. 279/2024 Z. z. as in
// force from 1 January 2026 (zakonypreludi.sk) and the Financial Administration's "Základné informácie" (725188):
// - § 3(3)(c): a taxpayer that uses a payment service provider seated outside Slovakia is the payer of the tax itself;
//   § 10(4): it works the tax out and pays it for the period; FS: it files the notice of the tax (oznámenie o výške dane,
//   taken as a tax return) electronically, by the end of the month after the period (§ 10(1)), moved to a working day
//   (§ 27(2) of the Tax Procedure Code).
// - § 9(1): the period is the calendar month; § 6(a): 0,4 % of each debit of the account, at most 40 € a transaction;
//   § 6(b): 0,8 % of a cash withdrawal, without a cap; § 8: rounded to the cent, at least one cent.
// - § 4(2)(u): a payment by card is no transaction of § 4(1)(a); a card is taxed 2 € for each calendar year it was used
//   (§ 6(c), § 9(2)): said, not worked out (the app does not know the cards).
// - § 4(2)(p): a transfer between the taxpayer's own accounts at the same provider is exempt; § 4(2)(a): taxes, levies and
//   insurance paid to the state are exempt.
import { workingDayFrom } from './vat'

export const TRANSACTION_TAX = { rateMilli: 4, cashMilli: 8, capCents: 4000 } as const

/** An account at a provider outside Slovakia: its IBAN is not Slovak. */
export function foreignAccount(iban: string | null | undefined): boolean {
  const plain = (iban ?? '').replace(/\s/g, '').toUpperCase()
  return /^[A-Z]{2}\d{2}/.test(plain) && !plain.startsWith('SK')
}

/** The provider an IBAN is at: its country and the first four characters of its bank code. */
export function providerOf(iban: string): string {
  const plain = iban.replace(/\s/g, '').toUpperCase()
  return `${plain.slice(0, 2)}${plain.slice(4, 8)}`
}

export interface Debit {
  day: string
  /** The amount taken from the account, in cents (above nought). */
  cents: number
  card: boolean
  /** A withdrawal of cash, by card or at the counter. */
  cash: boolean
  /** To another account of the company at the same provider, or a tax or levy to the state. */
  exempt: boolean
}

/** The tax of one debit, in cents. */
export function debitTax(d: Debit): number {
  if (d.cents <= 0 || d.exempt || (d.card && !d.cash)) return 0
  const tax = Math.round((d.cents * (d.cash ? TRANSACTION_TAX.cashMilli : TRANSACTION_TAX.rateMilli)) / 1000)
  return Math.max(1, d.cash ? tax : Math.min(tax, TRANSACTION_TAX.capCents))
}

/** A cash withdrawal, as banks name it in a statement. */
export function isCashWithdrawal(text: string | null | undefined): boolean {
  return /\b(atm|bankomat|v[ýy]ber hotovosti|v[ýy]ber z bankomatu|cash withdrawal|withdrawal)\b/i.test(text ?? '')
}

/** A month's tax: each debit of the month, the sum, how many were taxed, and the last day to file and pay. */
export function monthTax(debits: readonly Debit[], month: string): { cents: number; taxed: number; due: string } {
  let cents = 0
  let taxed = 0
  for (const d of debits) {
    if (!d.day.startsWith(`${month}-`)) continue
    const tax = debitTax(d)
    if (tax > 0) {
      cents += tax
      taxed++
    }
  }
  const [y, m] = month.split('-').map(Number) as [number, number]
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
  const last = new Date(Date.UTC(Number(next.slice(0, 4)), Number(next.slice(5, 7)), 0)).toISOString().slice(0, 10)
  return { cents, taxed, due: workingDayFrom(last) }
}
