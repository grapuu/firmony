// The company ID (IČO) as people type it: with spaces, with "IČO:" in front, and the oldest ones with six or
// seven digits, which the register keeps padded to eight with zeros in front.

/** The eight digits of an IČO, or null when the text cannot be one. Shorter IDs are padded with zeros in front. */
export function normalizeIco(text: unknown): string | null {
  if (typeof text !== 'string') return null
  const digits = text.replace(/^\s*I[ČC]O\s*:?\s*/i, '').replace(/[\s. -]/g, '')
  if (!/^\d{6,8}$/.test(digits)) return null
  return digits.padStart(8, '0')
}

/**
 * The check digit every Slovak and Czech IČO carries: weights 8 to 2 over the first seven digits, modulo 11.
 * A number that fails it is still looked up in the register (a wrong answer here must not turn a real company
 * away); it only lets the page say "this does not look like an IČO" when the register knows nothing either.
 */
export function icoLooksValid(ico: string): boolean {
  if (!/^\d{8}$/.test(ico)) return false
  let sum = 0
  for (let i = 0; i < 7; i++) sum += Number(ico[i]) * (8 - i)
  const rest = sum % 11
  const check = rest === 0 ? 1 : rest === 1 ? 0 : 11 - rest
  return check === Number(ico[7])
}

/** "57442452" as it is printed: "57 442 452". */
export function formatIco(ico: string): string {
  return `${ico.slice(0, 2)} ${ico.slice(2, 5)} ${ico.slice(5)}`
}
