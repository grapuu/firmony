// A receipt from an eKasa till (Act No. 384/2025 Z. z. on recording takings) carries two codes of its own, printed
// on it in letters and, the first or both, in its QR code (the Financial Administration's "Popis integračného
// rozhrania systému eKASA", 4 November 2022, chapters 2.2, 2.7, 2.9 and 2.10):
// - the identifier (UID) the eKasa system gave the receipt when the till sent it: a letter for the kind of till, "-",
//   then 32 hexadecimal characters (O-7DBCDA8A56EE426DBCDA8A56EE426D1A); a receipt the till could not send at once
//   (off-line) has none;
// - the seller's verification code (OKP), a hash the till makes of its signature of the receipt: five blocks of
//   eight hexadecimal characters joined by "-", on every receipt.
// Both are unique to one receipt, so they tell one receipt from another better than its number, which every till
// starts again at 1 each calendar month. Whether a receipt is what the eKasa system holds can be checked by anyone
// at the Financial Administration's "Over doklad"; asked by a program at scale, only by a verifier under § 18(11)
// of the Act (PROGRESS.md), which Firmony is not.

/** The receipt's identifier as the reader wrote it, or null when it is not one: spaces dropped, a nought for the letter O put right. */
export function ekasaUid(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const plain = value.replace(/\s/g, '').toUpperCase().replace(/^0-/, 'O-')
  return /^[A-Z]-[0-9A-F]{32}$/.test(plain) ? plain : null
}

/** The seller's verification code as the reader wrote it, or null when it is not one; written in its five blocks. */
export function ekasaOkp(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const hex = value.replace(/[\s-]/g, '').toUpperCase()
  return /^[0-9A-F]{40}$/.test(hex) ? (hex.match(/.{8}/g) ?? []).join('-') : null
}

/** A code read twice off a thermal slip may differ in a character or two; two receipts' codes differ in nearly all. */
const MISREAD = 4

/** Whether two codes of one kind (each of its fixed length) agree but for what a reading may get wrong; null when one is missing. */
function near(a: string | null | undefined, b: string | null | undefined): boolean | null {
  if (!a || !b) return null
  let differ = 0
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) differ++
  return differ <= MISREAD
}

export interface EkasaCodes {
  ekasaUid?: string | null
  ekasaOkp?: string | null
}

/**
 * Whether two documents are one eKasa receipt, by their codes: yes when either code agrees, no when the codes both
 * have disagree, and null when there is nothing to compare (then the document's number, amount and day decide).
 */
export function sameReceipt(a: EkasaCodes, b: EkasaCodes): boolean | null {
  const byUid = near(a.ekasaUid, b.ekasaUid)
  const byOkp = near(a.ekasaOkp, b.ekasaOkp)
  if (byUid === true || byOkp === true) return true
  if (byUid === false || byOkp === false) return false
  return null
}
