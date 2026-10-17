// Intrastat in the database (schema step 34): the documents of goods acquired from or supplied to other member states
// with what the accountant said of their goods (intrastat_goods), each filing as it was sent (intrastat_returns), and
// the company's settings (companies.intrastat). intrastat.ts works the reports out.
import { now } from '../db'
import { DOC_COLUMNS, DOC_FROM, docOf, vatCompanyOf, vatDocOf, type Company } from './store'
import { taxDay, vatOf } from './vat'
import { goodsOf, intrastatView, type Declaration, type DocGoods, type Flow, type IntrastatDoc, type IntrastatFiling, type IntrastatSettings, type IntrastatView } from './intrastat'

type Row = Record<string, unknown>

/**
 * Every document Intrastat may read: goods from or to another member state as booked, and what may become such once
 * booked (a document not booked yet from a foreign party, or with another member state's VAT number).
 */
export async function intrastatDocs(db: D1Database, company: Company, scope: { from?: string; only?: string } = {}): Promise<IntrastatDoc[]> {
  // A document dated from `from` (YYYY-MM-DD; a page asks from the threshold's window, a month from a little before it),
  // or one document alone.
  const rows = await db
    .prepare(
      `SELECT ${DOC_COLUMNS}, g.data AS intrastat_goods FROM ${DOC_FROM}
         LEFT JOIN intrastat_goods g ON g.company_id = d.company_id AND g.document_id = d.id
        WHERE d.company_id = ?1 AND d.deleted_at IS NULL AND d.kind IN ('receipt', 'invoice_in', 'invoice_out')
          AND (d.vat_mode IN ('acquisition', 'eu_goods')
               OR (d.vat_mode IS NULL AND (d.foreign_party = 1 OR (d.party_vat_id IS NOT NULL AND d.party_vat_id NOT LIKE 'SK%'))))
          AND (?2 IS NULL OR COALESCE(d.supplied_on, d.issued_on, date(d.created_at, 'unixepoch')) >= ?2 OR g.data IS NOT NULL)
          AND (?3 IS NULL OR d.id = ?3)
        ORDER BY COALESCE(d.supplied_on, d.issued_on), d.created_at`,
    )
    .bind(company.id, scope.from ?? null, scope.only ?? null)
    .all<Row>()
  const vc = vatCompanyOf(company)
  const out: IntrastatDoc[] = []
  for (const row of rows.results) {
    const doc = docOf(row)
    const vdoc = vatDocOf(doc)
    const vat = vatOf(vdoc, vc)
    if (!vat || (vat.data.mode !== 'acquisition' && vat.data.mode !== 'eu_goods')) continue
    out.push({
      id: doc.id,
      number: doc.number,
      party: doc.party,
      mode: vat.data.mode,
      month: taxDay(vdoc, vat.data).slice(0, 7),
      cents: vat.data.lines.reduce((s, l) => s + l.base, 0),
      vatId: vat.data.vatId ?? doc.partyVatId,
      booked: doc.bookedAt !== null && !vat.proposed,
      goods: goodsOf(row.intrastat_goods),
    })
  }
  return out
}

function filingOf(r: Row): IntrastatFiling | null {
  try {
    const data = JSON.parse(String(r.data)) as { declarations?: Declaration[] }
    return { seq: Number(r.seq), filedOn: String(r.filed_on), envelope: Number(r.envelope), declarations: data.declarations ?? [] }
  } catch {
    return null
  }
}

/** Every filing of a company, by month and flow (`${month}:${flow}`), the oldest first. */
export async function intrastatFilings(db: D1Database, company: string): Promise<Map<string, IntrastatFiling[]>> {
  const rows = await db.prepare('SELECT month, flow, seq, envelope, data, filed_on FROM intrastat_returns WHERE company_id = ? ORDER BY month, flow, seq').bind(company).all<Row>()
  const out = new Map<string, IntrastatFiling[]>()
  for (const r of rows.results) {
    const f = filingOf(r)
    if (!f) continue
    const key = `${String(r.month)}:${String(r.flow)}`
    out.set(key, [...(out.get(key) ?? []), f])
  }
  return out
}

/** The first day of the month `n` months before a month (YYYY-MM-DD). */
export function monthsBefore(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number) as [number, number]
  const total = y * 12 + (m - 1) - n
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}-01`
}

/** A month and flow worked out, with everything it needs loaded. */
export async function intrastatMonth(db: D1Database, company: Company, settings: IntrastatSettings, month: string, flow: Flow, today: string): Promise<{ view: IntrastatView; docs: IntrastatDoc[] }> {
  const [docs, filings] = await Promise.all([intrastatDocs(db, company, { from: monthsBefore(month, 3) }), intrastatFilings(db, company.id)])
  return { view: intrastatView(docs, month, flow, settings, filings.get(`${month}:${flow}`) ?? [], today), docs }
}

/** A filing marked as sent, with its reports and its file; refused (no row) when another was marked in between. */
export function fileIntrastatStatement(
  db: D1Database,
  company: string,
  month: string,
  flow: Flow,
  seq: number,
  envelope: number,
  declarations: Declaration[],
  xml: string,
  filedOn: string,
  by: string,
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO intrastat_returns (company_id, month, flow, seq, envelope, data, xml, filed_on, filed_at, filed_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (company_id, month, flow, seq) DO NOTHING`,
    )
    .bind(company, month, flow, seq, envelope, JSON.stringify({ declarations }), xml, filedOn, now(), by)
}

/** The mark of the last filing of a month and flow taken back. */
export function unfileIntrastatStatement(db: D1Database, company: string, month: string, flow: Flow): D1PreparedStatement {
  return db
    .prepare('DELETE FROM intrastat_returns WHERE company_id = ?1 AND month = ?2 AND flow = ?3 AND seq = (SELECT MAX(seq) FROM intrastat_returns WHERE company_id = ?1 AND month = ?2 AND flow = ?3)')
    .bind(company, month, flow)
}

/** A filing's file as it was sent. */
export async function filedIntrastatXml(db: D1Database, company: string, month: string, flow: Flow, seq: number): Promise<string | null> {
  const row = await db.prepare('SELECT xml FROM intrastat_returns WHERE company_id = ? AND month = ? AND flow = ? AND seq = ?').bind(company, month, flow, seq).first<Row>()
  return typeof row?.xml === 'string' ? row.xml : null
}

/** What the accountant said of a document's goods. */
export function saveGoodsStatement(db: D1Database, company: string, doc: string, goods: DocGoods, by: string): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO intrastat_goods (company_id, document_id, data, updated_at, updated_by) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (company_id, document_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
    )
    .bind(company, doc, JSON.stringify(goods), now(), by)
}

export function removeGoodsStatement(db: D1Database, company: string, doc: string): D1PreparedStatement {
  return db.prepare('DELETE FROM intrastat_goods WHERE company_id = ? AND document_id = ?').bind(company, doc)
}

export function saveSettingsStatement(db: D1Database, company: string, settings: IntrastatSettings): D1PreparedStatement {
  return db.prepare('UPDATE companies SET intrastat = ? WHERE id = ?').bind(JSON.stringify(settings), company)
}
