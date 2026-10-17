// The one-stop shop in the database (schema step 33): the supplies (issued documents with the mode `oss`), each
// quarter's return as it was filed, and the rates of the currencies they are in. oss.ts works the returns out.
import { now } from '../db'
import { rateMicro } from './fx'
import { ratesFor } from './fx-store'
import { ossView, type OssCorrection, type OssFiled, type OssLine, type OssSupply, type OssView } from './oss'
import { bratislavaDay, vatLinesOf } from './store'

type Row = Record<string, unknown>

export async function ossData(db: D1Database, company: string): Promise<{ supplies: OssSupply[]; unbooked: { id: string; day: string }[]; filed: OssFiled[] }> {
  const [docs, returns] = await db.batch<Row>([
    db
      .prepare(
        `SELECT id, number, supplied_on, issued_on, created_at, vat_country, category, vat_lines, currency, fx_rate, corrects, booked_at
           FROM documents WHERE company_id = ? AND deleted_at IS NULL AND kind = 'invoice_out' AND vat_mode = 'oss'`,
      )
      .bind(company),
    db.prepare('SELECT quarter, data, filed_on FROM oss_returns WHERE company_id = ? ORDER BY quarter').bind(company),
  ])
  const supplies: OssSupply[] = []
  const unbooked: { id: string; day: string }[] = []
  for (const r of docs?.results ?? []) {
    const day = typeof r.supplied_on === 'string' ? r.supplied_on : typeof r.issued_on === 'string' ? r.issued_on : bratislavaDay(Number(r.created_at))
    if (!r.booked_at) {
      unbooked.push({ id: String(r.id), day })
      continue
    }
    supplies.push({
      id: String(r.id),
      number: typeof r.number === 'string' ? r.number : null,
      day,
      country: typeof r.vat_country === 'string' ? r.vat_country : null,
      goods: r.category === 'sales_goods',
      lines: vatLinesOf(r.vat_lines),
      currency: typeof r.currency === 'string' ? r.currency : 'EUR',
      fxRate: rateMicro(typeof r.fx_rate === 'string' ? r.fx_rate : null),
      corrects: typeof r.corrects === 'string' ? r.corrects : null,
    })
  }
  const filed: OssFiled[] = []
  for (const r of returns?.results ?? []) {
    try {
      const data = JSON.parse(String(r.data)) as { lines?: OssLine[]; corrections?: OssCorrection[] }
      filed.push({ quarter: String(r.quarter), lines: data.lines ?? [], corrections: data.corrections ?? [], filedOn: String(r.filed_on) })
    } catch {
      /* A row that cannot be read is left out; its quarter then reads as not filed. */
    }
  }
  return { supplies, unbooked, filed }
}

/** A quarter's return of a company that uses the scheme since `since`. */
export async function ossQuarter(db: D1Database, company: string, since: string, quarter: string, today: string): Promise<OssView> {
  const { supplies, unbooked, filed } = await ossData(db, company)
  const rates = await ratesFor(
    db,
    supplies.map((s) => s.currency),
  )
  const from = `${quarter.slice(0, 4)}-${String(Number(quarter.slice(6)) * 3 - 2).padStart(2, '0')}-01`
  const to = `${quarter.slice(0, 4)}-${String(Number(quarter.slice(6)) * 3).padStart(2, '0')}-31`
  return ossView(
    quarter,
    since,
    supplies,
    filed,
    rates,
    today,
    unbooked.filter((u) => u.day >= from && u.day <= to).map((u) => u.id),
  )
}

/** A quarter's return marked as filed, with what it declared and its file; once only. */
export function fileOssStatement(db: D1Database, company: string, view: OssView, xml: string, filedOn: string, by: string): D1PreparedStatement {
  return db
    .prepare('INSERT INTO oss_returns (company_id, quarter, data, xml, filed_on, filed_at, filed_by) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT (company_id, quarter) DO NOTHING')
    .bind(company, view.quarter, JSON.stringify({ lines: view.lines, corrections: view.corrections, balances: view.balances, total: view.total }), xml, filedOn, now(), by)
}

/** The mark taken back, of the last quarter filed only (a later return builds on it). */
export function unfileOssStatement(db: D1Database, company: string, quarter: string): D1PreparedStatement {
  return db.prepare('DELETE FROM oss_returns WHERE company_id = ?1 AND quarter = ?2 AND NOT EXISTS (SELECT 1 FROM oss_returns WHERE company_id = ?1 AND quarter > ?2)').bind(company, quarter)
}

/** The file as it was filed. */
export async function filedOssXml(db: D1Database, company: string, quarter: string): Promise<string | null> {
  const row = await db.prepare('SELECT xml FROM oss_returns WHERE company_id = ? AND quarter = ?').bind(company, quarter).first<Row>()
  return typeof row?.xml === 'string' ? row.xml : null
}
