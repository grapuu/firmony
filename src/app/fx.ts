// Foreign currencies: the reference rates of the European Central Bank (the National Bank of Slovakia declares the
// same), and an amount in another currency in euros. Pure; fx-store.ts keeps the rates and fetches them.
//
// What it leans on (read on 17 October 2026):
// - Act No. 431/2002 Z. z. on accounting, § 24: assets and liabilities in a foreign currency are converted into euros at
//   the reference rate the ECB or NBS declared on the day before the accounting case (the Financial Directorate's
//   931674 and 812673: a liability settled on 12.4. at the rate of 11.4.; a payment received on 7.7.2026 at the rate of
//   6.7.2026), and on the day of the financial statements at the rate declared on that day; the differences on 563
//   (Kurzové straty) and 663 (Kurzové zisky).
// - Act No. 222/2004 Z. z. on VAT, § 23 and § 26: the base in a foreign currency at the reference rate of the day
//   before the tax liability arises; a day without a rate takes the last one before it (FR SR 297846: an invoice of
//   Monday 11.3.2024 at Friday's rate of 8.3.2024; 550 000 CZK at 25,308 is 21 732,26 €, rounded to the cent).
// - The ECB's daily file (eurofxref-hist-90d.xml): a Cube per day with a Cube per currency, the rate as units of the
//   currency for one euro.

/** The ECB's reference rates of the last ninety days. */
export const ECB_RATES = 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist-90d.xml'

/** A rate as units of the currency for one euro, in millionths (25,308 CZK is 25 308 000): exact for every rate the ECB declares. */
export type RateMicro = number

export interface Rate {
  currency: string
  day: string
  /** As the ECB writes it ("25.308"). */
  rate: string
}

/** A currency's code, as the ECB and the banks write it. */
export const isCurrency = (v: unknown): v is string => typeof v === 'string' && /^[A-Z]{3}$/.test(v)

/** "25.308" or "25,308" in millionths; null when it is no rate. */
export function rateMicro(text: string | null | undefined): RateMicro | null {
  const m = /^(\d{1,7})(?:[.,](\d{1,6}))?$/.exec((text ?? '').trim().replace(/\s/g, ''))
  if (!m) return null
  const micro = Number(m[1]) * 1_000_000 + Number((m[2] ?? '').padEnd(6, '0'))
  return micro > 0 ? micro : null
}

/** Millionths as the rate is written in Slovak ("25,308"). */
export function rateText(micro: RateMicro): string {
  const whole = Math.floor(micro / 1_000_000)
  const part = String(micro % 1_000_000)
    .padStart(6, '0')
    .replace(/0+$/, '')
  return part ? `${whole},${part}` : String(whole)
}

/** An amount in the currency (its cents) in euro cents, rounded half away from nought. */
export function eurOf(cents: number, rate: RateMicro): number {
  const n = BigInt(Math.abs(Math.round(cents))) * 1_000_000n
  const d = BigInt(rate)
  const q = n / d
  const out = Number(n % d >= (d + 1n) / 2n ? q + 1n : q)
  return cents < 0 ? -out : out
}

/** The ECB's file read: every day's rate of every currency in it. */
export function parseEcb(xml: string): Rate[] {
  const out: Rate[] = []
  for (const day of xml.matchAll(/<Cube\s+time=["'](\d{4}-\d{2}-\d{2})["']\s*>([\s\S]*?)<\/Cube>/g)) {
    for (const r of (day[2] ?? '').matchAll(/<Cube\s+currency=["']([A-Z]{3})["']\s+rate=["']([0-9.]+)["']\s*\/>/g)) {
      if (rateMicro(r[2]) !== null) out.push({ currency: r[1]!, day: day[1]!, rate: r[2]! })
    }
  }
  return out
}

/** The rates of each currency, each list by its day. */
export type Rates = ReadonlyMap<string, readonly (readonly [string, RateMicro])[]>

export function ratesOf(rows: readonly Rate[]): Map<string, [string, RateMicro][]> {
  const out = new Map<string, [string, RateMicro][]>()
  for (const r of rows) {
    const micro = rateMicro(r.rate)
    if (micro === null) continue
    const list = out.get(r.currency) ?? []
    list.push([r.day, micro])
    out.set(r.currency, list)
  }
  for (const list of out.values()) list.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return out
}

/** The last rate of a currency declared before a day (`before`) or on it at the latest (`onOrBefore`); null when none is kept. */
export function rateFor(rates: Rates, currency: string, day: string, when: 'before' | 'onOrBefore' = 'before'): { day: string; rate: RateMicro } | null {
  const list = rates.get(currency)
  if (!list || list.length === 0) return null
  let lo = 0
  let hi = list.length - 1
  let found = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const d = list[mid]![0]
    if (d < day || (when === 'onOrBefore' && d === day)) {
      found = mid
      lo = mid + 1
    } else hi = mid - 1
  }
  if (found < 0) return null
  // A rate more than a fortnight older than the day was not declared for it: the ECB's file did not reach that far.
  const [d, rate] = list[found]!
  if (Date.parse(`${day}T00:00:00Z`) - Date.parse(`${d}T00:00:00Z`) > 15 * 86_400_000) return null
  return { day: d, rate }
}
