// The register of fixed assets in the database (assets.ts has the rules). An asset gets the next inventory number of
// its year in the statement that writes it (M-2027-001), so that two at once never share one; a removed asset is
// marked, never deleted, and keeps its number. The schema's triggers guard what reaches a locked period.
import { now } from '../db'
import { isAssetAccount, type Asset, type Disposal, type TaxMethod } from './assets'

type Row = Record<string, unknown>
const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null)

export function assetOf(r: Row): Asset {
  const account = String(r.account)
  return {
    id: String(r.id),
    number: String(r.number),
    name: String(r.name),
    account: isAssetAccount(account) ? account : '022',
    inUseOn: String(r.in_use_on),
    costCents: Number(r.cost_cents),
    taxGroup: r.tax_group === null || r.tax_group === undefined ? null : Number(r.tax_group),
    taxMethod: r.tax_method === 'accelerated' ? 'accelerated' : 'straight',
    car: Number(r.car) === 1,
    bookMonths: r.book_months === null || r.book_months === undefined ? null : Number(r.book_months),
    source: r.source === 'opening' ? 'opening' : 'purchase',
    priorBookCents: Number(r.prior_book_cents ?? 0),
    priorTaxCents: Number(r.prior_tax_cents ?? 0),
    priorTaxYears: Number(r.prior_tax_years ?? 0),
    disposedOn: str(r.disposed_on),
    disposal: (str(r.disposal) as Disposal | null) ?? null,
  }
}

/** The company's assets in its register, removed ones left out, in the order they were put in use. */
export async function assetsOf(db: D1Database, company: string): Promise<(Asset & { note: string | null; documentId: string | null })[]> {
  const rows = await db.prepare('SELECT * FROM assets WHERE company_id = ? AND deleted_at IS NULL ORDER BY in_use_on, number').bind(company).all<Row>()
  return rows.results.map((r) => ({ ...assetOf(r), note: str(r.note), documentId: str(r.document_id) }))
}

export interface AssetInput {
  name: string
  account: string
  documentId: string | null
  costCents: number
  inUseOn: string
  taxGroup: number | null
  taxMethod: TaxMethod
  car: boolean
  bookMonths: number | null
  source: 'purchase' | 'opening'
  priorBookCents: number
  priorTaxCents: number
  priorTaxYears: number
  note: string | null
}

/** A new asset, with the next inventory number of the year it was put in use. */
export function insertAssetStatement(db: D1Database, company: string, id: string, a: AssetInput, by: string): D1PreparedStatement {
  // The year as text: a number is bound as a real, which would never match 'M-2027-%'.
  const year = a.inUseOn.slice(0, 4)
  return db
    .prepare(
      `INSERT INTO assets (id, company_id, number, name, account, document_id, cost_cents, in_use_on, tax_group, tax_method, car, book_months, source,
         prior_book_cents, prior_tax_cents, prior_tax_years, note, created_at, created_by)
       SELECT ?1, ?2, printf('M-%s-%03d', ?3, COALESCE(MAX(CAST(substr(number, 8) AS INTEGER)), 0) + 1), ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19
         FROM assets WHERE company_id = ?2 AND number LIKE 'M-' || ?3 || '-%'`,
    )
    .bind(id, company, year, a.name, a.account, a.documentId, a.costCents, a.inUseOn, a.taxGroup, a.taxMethod, a.car ? 1 : 0, a.bookMonths, a.source, a.priorBookCents, a.priorTaxCents, a.priorTaxYears, a.note, now(), by)
}

/** An asset changed: everything but its number; refused by the schema when it reaches a locked period. */
export function updateAssetStatement(db: D1Database, company: string, id: string, a: AssetInput, by: string): D1PreparedStatement {
  return db
    .prepare(
      `UPDATE assets SET name = ?1, account = ?2, document_id = ?3, cost_cents = ?4, in_use_on = ?5, tax_group = ?6, tax_method = ?7, car = ?8, book_months = ?9,
         source = ?10, prior_book_cents = ?11, prior_tax_cents = ?12, prior_tax_years = ?13, note = ?14, updated_at = ?15, updated_by = ?16
       WHERE id = ?17 AND company_id = ?18 AND deleted_at IS NULL`,
    )
    .bind(a.name, a.account, a.documentId, a.costCents, a.inUseOn, a.taxGroup, a.taxMethod, a.car ? 1 : 0, a.bookMonths, a.source, a.priorBookCents, a.priorTaxCents, a.priorTaxYears, a.note, now(), by, id, company)
}

/** An asset disposed of (sold, liquidated, damaged or given away), or that taken back (null). */
export function disposeAssetStatement(db: D1Database, company: string, id: string, on: string | null, how: Disposal | null, by: string): D1PreparedStatement {
  return db
    .prepare('UPDATE assets SET disposed_on = ?1, disposal = ?2, updated_at = ?3, updated_by = ?4 WHERE id = ?5 AND company_id = ?6 AND deleted_at IS NULL')
    .bind(on, how, now(), by, id, company)
}

/** An asset entered by mistake, removed: marked, never deleted; its number stays taken. */
export function removeAssetStatement(db: D1Database, company: string, id: string, by: string): D1PreparedStatement {
  return db.prepare('UPDATE assets SET deleted_at = ?1, updated_at = ?1, updated_by = ?2 WHERE id = ?3 AND company_id = ?4 AND deleted_at IS NULL').bind(now(), by, id, company)
}
