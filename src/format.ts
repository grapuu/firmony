// How numbers and Slovak text are printed.

const NBSP = ' '

/** Euro from cents, the Slovak way: "69 €", "1 852,80 €". Whole euros are printed without decimals. */
export function formatEur(cents: number, exact = false): string {
  const negative = cents < 0
  const abs = Math.abs(Math.round(cents))
  const euros = Math.floor(abs / 100)
  const rest = abs % 100
  const whole = String(euros).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP)
  const text = rest === 0 && !exact ? whole : `${whole},${String(rest).padStart(2, '0')}`
  return `${negative ? '−' : ''}${text}${NBSP}€`
}

/** An amount as an invoice writes it: always with its cents, "120,00 €". */
export const formatEurExact = (cents: number): string => formatEur(cents, true)

/** An amount in its currency as an invoice writes it: "120,00 €", another currency by its code, "120,00 USD". */
export const formatMoney = (cents: number, currency = 'EUR'): string => (currency === 'EUR' ? formatEurExact(cents) : formatEurExact(cents).replace(/€$/, currency))

/** An IBAN in groups of four, as banks print it. */
export function groupIban(iban: string): string {
  return iban.replace(/\s/g, '').replace(/(.{4})(?=.)/g, '$1 ')
}

/** A whole number with a space between thousands: "1 300". */
export function formatCount(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP)
}

/**
 * Slovak typesetting: a one-letter word never ends a line, a number stays with its unit, and abbreviations
 * stay whole ("s. r. o.", "§ 7a", "č. 385/2025 Z. z.", "1. januára"). Applied once to every text of the site.
 */
export function typeset(text: string): string {
  return (
    text
      // One-letter prepositions and conjunctions: v, s, z, k, o, u, a, i (twice, for "a v" in a row).
      .replace(/(^|[\s(„"' ])([vszkouaiVSZKOUAI]) /g, `$1$2${NBSP}`)
      .replace(/(^|[\s(„"' ])([vszkouaiVSZKOUAI]) /g, `$1$2${NBSP}`)
      // A number and what it counts: "69 €", "30 dokladov", "20 %".
      .replace(/(\d) (€|%|Kč|dokladov|dokladmi|doklady|doklad|ľudí|ľudia|osôb|mesiacov|mesiace|mesiac|dní|dni|hodín|minút|minúty|rokov|roky)/g, `$1${NBSP}$2`)
      // Thousands written with a space.
      .replace(/(\d) (\d{3})(?!\d)/g, `$1${NBSP}$2`)
      // Abbreviations and dates that must not break.
      .replace(/s\. r\. o\./g, `s.${NBSP}r.${NBSP}o.`)
      .replace(/§ /g, `§${NBSP}`)
      .replace(/č\. (\d)/g, `č.${NBSP}$1`)
      .replace(/Z\. z\./g, `Z.${NBSP}z.`)
      .replace(/(\d)\. (januára|februára|marca|apríla|mája|júna|júla|augusta|septembra|októbra|novembra|decembra)/g, `$1.${NBSP}$2`)
      // A date in figures: "25. 11." and "24. 11. 2026".
      .replace(/(\d{1,2})\. (\d{1,2})\.( \d{4})?/g, (_m, day: string, month: string, year?: string) => `${day}.${NBSP}${month}.${year ? NBSP + year.trim() : ''}`)
      // "IČO 57 442 452": the number stays with its name.
      .replace(/IČO (\d)/g, `IČO${NBSP}$1`)
  )
}

/** typeset over every string of a nested object of texts. */
export function typesetAll<T>(value: T): T {
  if (typeof value === 'string') return typeset(value) as T
  if (Array.isArray(value)) return value.map((item) => typesetAll(item)) as T
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value)) out[key] = typeof item === 'function' ? item : typesetAll(item)
    return out as T
  }
  return value
}
