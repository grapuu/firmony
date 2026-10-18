// An asset's VAT for the adjustment of the deduction (vat-assets.ts) in the database: one row an asset, and each change
// of its use from a year, removed only by a mark. The schema's guards (period-schema.ts, step 68) refuse what reaches a
// locked period.
import { now } from '../db'
import type { AssetUse, AssetVatInput } from './vat-assets'

/** An asset's VAT written, or written again (only an asset of the company: the asset's own row is asked). */
export function assetVatStatement(db: D1Database, company: string, assetId: string, v: AssetVatInput, by: string): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO asset_vat (asset_id, company_id, lines, first_year, deducted, business, regime, sale, changed_at, changed_by)
       SELECT a.id, a.company_id, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10 FROM assets a WHERE a.id = ?1 AND a.company_id = ?2 AND a.deleted_at IS NULL
       ON CONFLICT (asset_id) DO UPDATE SET lines = excluded.lines, first_year = excluded.first_year, deducted = excluded.deducted, business = excluded.business,
         regime = excluded.regime, sale = excluded.sale, changed_at = excluded.changed_at, changed_by = excluded.changed_by
       WHERE asset_vat.company_id = excluded.company_id`,
    )
    .bind(assetId, company, JSON.stringify(v.lines), v.firstYear, v.deducted, v.business, v.regime, v.sale, now(), by)
}

/** An asset's VAT removed (written by mistake): its row, and its changes of use marked. */
export function removeAssetVatStatements(db: D1Database, company: string, assetId: string, by: string): D1PreparedStatement[] {
  return [
    db.prepare('UPDATE asset_vat_uses SET deleted_at = ?1, deleted_by = ?2 WHERE asset_id = ?3 AND company_id = ?4 AND deleted_at IS NULL').bind(now(), by, assetId, company),
    db.prepare('DELETE FROM asset_vat WHERE asset_id = ?1 AND company_id = ?2').bind(assetId, company),
  ]
}

/** A change of the use from a year, in place of one from the same year. */
export function assetUseStatements(db: D1Database, company: string, assetId: string, u: { from: number; use: AssetUse; share: number | null; business: number }, by: string): D1PreparedStatement[] {
  return [
    db
      .prepare('UPDATE asset_vat_uses SET deleted_at = ?1, deleted_by = ?2 WHERE asset_id = ?3 AND company_id = ?4 AND from_year = ?5 AND deleted_at IS NULL')
      .bind(now(), by, assetId, company, u.from),
    db
      .prepare(
        `INSERT INTO asset_vat_uses (id, company_id, asset_id, from_year, use, share, business, created_at, created_by)
         SELECT ?1, v.company_id, v.asset_id, ?4, ?5, ?6, ?7, ?8, ?9 FROM asset_vat v WHERE v.asset_id = ?3 AND v.company_id = ?2`,
      )
      .bind(crypto.randomUUID(), company, assetId, u.from, u.use, u.share, u.business, now(), by),
  ]
}

/** A change of the use removed, by a mark. */
export function removeAssetUseStatement(db: D1Database, company: string, assetId: string, id: string, by: string): D1PreparedStatement {
  return db.prepare('UPDATE asset_vat_uses SET deleted_at = ?1, deleted_by = ?2 WHERE id = ?3 AND asset_id = ?4 AND company_id = ?5 AND deleted_at IS NULL').bind(now(), by, id, assetId, company)
}
