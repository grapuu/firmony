// PAY by square: the QR code that every Slovak bank's app reads (SuperFaktúra and every other Slovak invoice prints
// it). The customer scans it and the bank fills in the account, the amount and the variable symbol, so the payment
// arrives with the invoice's number and pairs itself with the invoice. The format is the Slovak Banking Association's
// (version 1.2, which carries the beneficiary's name for the check of the payee); the library `bysquare` writes it.
import { encode, PaymentOptions } from 'bysquare/pay'
import { encode as qrEncode } from 'uqr'

export interface PayOrder {
  iban: string
  amountCents: number
  /** The variable symbol: digits, ten at most. */
  vs: string | null
  /** The due day, YYYY-MM-DD. */
  due: string | null
  /** Who is paid, as the bank shows it. */
  name: string
  note: string
}

/** The text of the QR code, or null when there is nothing a bank could pay (no account, nothing to pay). */
export function payBySquare(order: PayOrder): string | null {
  const vs = order.vs?.replace(/\D/g, '').slice(0, 10) || undefined
  if (order.amountCents <= 0 || order.amountCents > 99_999_999_99) return null
  try {
    return encode({
      invoiceId: vs,
      payments: [
        {
          type: PaymentOptions.PaymentOrder,
          amount: order.amountCents / 100,
          currencyCode: 'EUR',
          variableSymbol: vs,
          paymentDueDate: order.due && /^\d{4}-\d{2}-\d{2}$/.test(order.due) ? order.due.replace(/-/g, '') : undefined,
          paymentNote: order.note.slice(0, 140),
          bankAccounts: [{ iban: order.iban.replace(/\s/g, '').toUpperCase() }],
          beneficiary: { name: order.name.slice(0, 70) },
        },
      ],
    })
  } catch {
    // An account the library does not take as an IBAN: no QR rather than a QR that a bank refuses.
    return null
  }
}

export interface QrPicture {
  /** The side in modules, the quiet zone of four modules on each side included. */
  size: number
  /** One SVG path of the dark modules, a run of them per subpath. */
  path: string
}

/** A QR code drawn as one path, so that the page carries a few kilobytes and no picture file. */
export function qrPicture(text: string): QrPicture {
  const qr = qrEncode(text, { ecc: 'M', border: 0 })
  const quiet = 4
  let path = ''
  for (let y = 0; y < qr.size; y++) {
    const row = qr.data[y] ?? []
    for (let x = 0; x < qr.size; ) {
      if (!row[x]) {
        x++
        continue
      }
      let run = 1
      while (x + run < qr.size && row[x + run]) run++
      path += `M${x + quiet} ${y + quiet}h${run}v1h-${run}z`
      x += run
    }
  }
  return { size: qr.size + quiet * 2, path }
}
