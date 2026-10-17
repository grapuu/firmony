// The ECB's reference rates in the database (schema step 32), fetched by the schedule once a day after the ECB declares
// them (about 16:00 in Frankfurt), and read for the currencies a company's documents and payments are in. fx.ts reads.
import { now, withinLimit } from '../db'
import { ECB_RATES, parseEcb, ratesOf, type Rate, type Rates } from './fx'

type Row = Record<string, unknown>

/** The rates kept for some currencies, each by its day. */
export async function ratesFor(db: D1Database, currencies: readonly string[]): Promise<Rates> {
  const wanted = [...new Set(currencies.filter((c) => /^[A-Z]{3}$/.test(c) && c !== 'EUR'))]
  if (wanted.length === 0) return new Map()
  const rows = await db.prepare('SELECT currency, day, rate FROM fx_rates WHERE currency IN (SELECT value FROM json_each(?1))').bind(JSON.stringify(wanted)).all<Row>()
  return ratesOf(rows.results.map((r) => ({ currency: String(r.currency), day: String(r.day), rate: String(r.rate) })))
}

/** The currencies the ECB declares (those it declared in the last month), for the booking form. */
export async function knownCurrencies(db: D1Database): Promise<string[]> {
  const rows = await db.prepare("SELECT DISTINCT currency FROM fx_rates WHERE day >= date('now', '-31 days') ORDER BY currency").all<Row>()
  return rows.results.map((r) => String(r.currency))
}

/** Rates kept, a statement a thousand of them (one JSON parameter); a day kept once is never changed. */
export function rateStatements(db: D1Database, rates: readonly Rate[]): D1PreparedStatement[] {
  const at = now()
  const out: D1PreparedStatement[] = []
  for (let i = 0; i < rates.length; i += 1000) {
    out.push(
      db
        .prepare(
          `INSERT OR IGNORE INTO fx_rates (currency, day, rate, fetched_at)
           SELECT json_extract(j.value, '$.currency'), json_extract(j.value, '$.day'), json_extract(j.value, '$.rate'), ?1 FROM json_each(?2) j`,
        )
        .bind(at, JSON.stringify(rates.slice(i, i + 1000))),
    )
  }
  return out
}

/**
 * From the schedule: the rates of the last ninety days when the newest kept is older than the last day the ECB has
 * declared by now (a working day after 16:30 in Bratislava, else the day before), at most once an hour.
 */
export async function refreshRates(db: D1Database, fetcher: typeof fetch, today: string, afterHours: boolean): Promise<number> {
  const newest = (await db.prepare('SELECT MAX(day) AS day FROM fx_rates').first<Row>())?.day
  const expected = lastDeclared(today, afterHours)
  if (typeof newest === 'string' && newest >= expected) return 0
  if (!(await withinLimit(db, 'fx', 'ecb', 1, 3600))) return 0
  const res = await fetcher(ECB_RATES, { headers: { accept: 'application/xml' }, signal: AbortSignal.timeout(15_000) })
  if (!res.ok) throw new Error(`ECB answered ${res.status}`)
  const rates = parseEcb(await res.text())
  if (rates.length === 0) throw new Error('ECB file without rates')
  await db.batch(rateStatements(db, rates))
  return rates.length
}

/** The last day the ECB has declared rates for by now: today after its hour on a weekday, else the weekday before. */
export function lastDeclared(today: string, afterHours: boolean): string {
  let t = Date.parse(`${today}T00:00:00Z`)
  if (!afterHours) t -= 86_400_000
  for (;;) {
    const weekday = new Date(t).getUTCDay()
    if (weekday !== 0 && weekday !== 6) break
    t -= 86_400_000
  }
  return new Date(t).toISOString().slice(0, 10)
}
