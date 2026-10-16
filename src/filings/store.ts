import { now, sha256Hex } from '../db'
import { dayOfText } from '../app/booking'
import { sniffHandover } from '../app/papers'
import { fileHash } from '../app/read'
import { activePackageSql, canTransition, filingSourceSql, safeJson, type DeliveryState, type FilingEvent, type FilingFile, type FilingPackage, type FilingType } from './model'
import type { User } from '../app/store'

export async function filingFile(name: string, xml: string): Promise<FilingFile & { attemptId: string }> {
  return { name, xml, sha256: await sha256Hex(xml), attemptId: crypto.randomUUID() }
}
export function sourceGuard(kind: FilingType): string {
  return filingSourceSql('?1', '?2', kind, '?4')
}

/** Run after the source snapshot in the same D1 batch. A failed/stale source write cannot create a package. */
export function prepareFiling(db: D1Database, company: string, kind: FilingType, period: string, file: FilingFile & { attemptId: string }, by: string): D1PreparedStatement {
  return db.prepare(`INSERT INTO filing_packages (id, company_id, kind, period, name, xml, sha256, created_at, created_by, updated_at, updated_by)
    SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?8, ?9 WHERE EXISTS (${sourceGuard(kind)})`)
    .bind(file.attemptId, company, kind, period, file.name, file.xml, file.sha256, now(), by)
}
const LIST_COLUMNS = 'p.id, p.company_id, p.kind, p.period, p.name, p.sha256, p.created_at, p.created_by, p.status, p.revision, p.updated_at, p.updated_by, p.last_event'
export async function filingQueue(db: D1Database, user: User, page = 1): Promise<(Omit<FilingPackage, 'xml'> & { company_name: string })[]> {
  return (await db.prepare(`SELECT ${LIST_COLUMNS}, c.name AS company_name FROM filing_packages p JOIN companies c ON c.id = p.company_id
    WHERE c.closed_at IS NULL AND c.demo = 0 AND (?1 = 'admin' OR c.accountant_id = ?2)
      AND p.status <> 'accepted' AND (${activePackageSql()})
    ORDER BY CASE p.status WHEN 'rejected' THEN 0 WHEN 'review' THEN 0 WHEN 'submitted' THEN 1 ELSE 2 END, p.period, p.created_at, p.id LIMIT 51 OFFSET ?3`)
    .bind(user.team, user.id, (Math.min(10000, Math.max(1, Math.trunc(page))) - 1) * 50).all<Omit<FilingPackage, 'xml'> & { company_name: string }>()).results
}
export async function packagesOf(db: D1Database, company: string, period = '', page = 1): Promise<(Omit<FilingPackage, 'xml'> & { current: number })[]> {
  return (await db.prepare(`SELECT p.id, p.company_id, p.kind, p.period, p.name, p.sha256, p.created_at, p.created_by, p.status, p.revision, p.updated_at, p.updated_by, p.last_event,
    (${activePackageSql()}) AS current FROM filing_packages p
    WHERE p.company_id = ?1 AND (?2 = '' OR p.period = ?2 OR (p.kind = 'sv' AND EXISTS (SELECT 1 FROM filings f
      WHERE f.company_id = p.company_id AND f.kind = 'sv' AND f.period = ?2 AND ${safeJson('f.data', '$.file.attemptId')} = p.id)))
    ORDER BY p.period DESC, p.created_at DESC, p.rowid DESC LIMIT 51 OFFSET ?3`)
    .bind(company, period, (Math.min(10000, Math.max(1, Math.trunc(page))) - 1) * 50).all<Omit<FilingPackage, 'xml'> & { current: number }>()).results
}
export async function packageOf(db: D1Database, company: string, id: string): Promise<FilingPackage | null> {
  return db.prepare('SELECT * FROM filing_packages WHERE company_id = ? AND id = ?').bind(company, id).first<FilingPackage>()
}
export async function eventsOf(db: D1Database, company: string, id: string): Promise<FilingEvent[]> {
  return (await db.prepare('SELECT e.*, u.name AS by_name FROM filing_events e LEFT JOIN users u ON u.id = e.by_user WHERE e.company_id = ? AND e.package_id = ? ORDER BY e.revision DESC').bind(company, id).all<FilingEvent>()).results
}
export async function currentPackage(db: D1Database, pkg: FilingPackage): Promise<boolean> {
  return Boolean(await db.prepare(`SELECT 1 WHERE EXISTS (${sourceGuard(pkg.kind)})`).bind(pkg.id, pkg.company_id, pkg.kind, pkg.period).first())
}

export interface DeliveryChange {
  to: DeliveryState; revision: number; externalOn: string; reference: string; reason: string; channel: string
  checked: boolean; receipt?: { name: string; bytes: Uint8Array }
}
export function validateChange(pkg: FilingPackage, user: User, input: DeliveryChange, today: string): string | null {
  if (input.revision !== pkg.revision) return 'Stav sa medzitým zmenil. Obnovte stránku.'
  if (!canTransition(pkg.status, input.to, user.team === 'admin')) return 'Táto zmena stavu nie je povolená.'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.externalOn) || input.externalOn !== dayOfText(input.externalOn) || input.externalOn > today) return 'Zadajte skutočný dátum, ktorý nie je v budúcnosti.'
  if (input.reference.replace(/\s/g, '').length < 4 || input.reference.length > 160 || input.channel.trim().length < 2 || input.channel.length > 120) return 'Doplňte konkrétne číslo podania alebo potvrdenky a spôsob doručenia.'
  if (input.reason.length > 1200 || ((input.to === 'rejected' || input.to === 'review' || pkg.status === 'rejected') && input.reason.trim().length < 12)) return 'Doplňte dôvod alebo ďalší postup, aspoň 12 znakov.'
  if ((input.to === 'accepted' || input.to === 'rejected') && (!input.checked || !input.receipt)) return 'Priložte potvrdenku a potvrďte kontrolu firmy, obdobia, typu dokumentu a čísla podania.'
  if (input.receipt && (input.receipt.bytes.length === 0 || input.receipt.bytes.length > 10 * 1024 * 1024)) return 'Potvrdenka môže mať najviac 10 MB a nesmie byť prázdna.'
  return null
}
async function discardUncommitted(db: D1Database, files: R2Bucket, key: string) {
  // An interrupted response may hide a successful commit. Keep evidence whenever its database outcome is uncertain.
  const used = await db.prepare('SELECT 1 FROM filing_events WHERE file_key = ?').bind(key).first().catch(() => true)
  if (!used) await files.delete(key)
}
export async function changeDelivery(db: D1Database, files: R2Bucket | undefined, pkg: FilingPackage, user: User, input: DeliveryChange, today: string): Promise<{ ok: boolean; error?: string }> {
  const error = validateChange(pkg, user, input, today)
  if (error) return { ok: false, error }
  const id = crypto.randomUUID(), at = now()
  let key: string | null = null, type: string | null = null, hash: string | null = null, size: number | null = null
  if (input.receipt) {
    if (!files) return { ok: false, error: 'Úložisko potvrdeniek nie je dostupné. Stav sme nezmenili.' }
    const format = sniffHandover(input.receipt.bytes, input.receipt.name)
    if (!format || !['pdf', 'xml', 'jpg', 'png', 'webp', 'asice', 'asics'].includes(format.ext)) return { ok: false, error: 'Priložte potvrdenku vo formáte PDF, XML, JPG, PNG alebo ASiC.' }
    key = `companies/${pkg.company_id}/filings/${id}.${format.ext}`
    type = format.type; hash = await fileHash(input.receipt.bytes); size = input.receipt.bytes.length
    await files.put(key, input.receipt.bytes, { httpMetadata: { contentType: type } })
  }
  try {
    const result = await db.batch([
      db.prepare(`INSERT INTO filing_events (id, package_id, company_id, revision, at, by_user, from_state, to_state, external_on, reference, reason, channel,
          file_key, file_name, file_type, file_bytes, file_sha256)
        SELECT ?1, id, company_id, revision + 1, ?4, ?5, status, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15
        FROM filing_packages WHERE id = ?2 AND company_id = ?3 AND revision = ?16 AND status = ?17`)
        .bind(id, pkg.id, pkg.company_id, at, user.id, input.to, input.externalOn, input.reference.replace(/\s/g, '').toUpperCase(), input.reason.trim(), input.channel.trim(), key, input.receipt?.name.slice(0, 160) ?? null, type, size, hash, input.revision, pkg.status),
      db.prepare(`UPDATE filing_packages SET status = ?1, revision = revision + 1, updated_at = ?2, updated_by = ?3, last_event = ?4
        WHERE id = ?5 AND company_id = ?6 AND revision = ?7 AND EXISTS (SELECT 1 FROM filing_events WHERE id = ?4 AND package_id = ?5 AND revision = ?7 + 1)`)
        .bind(input.to, at, user.id, id, pkg.id, pkg.company_id, input.revision),
    ])
    if (!result[0]?.meta.changes || !result[1]?.meta.changes) {
      if (key && files) await discardUncommitted(db, files, key)
      return { ok: false, error: 'Stav sa medzitým zmenil. Obnovte stránku; pôvodnú akciu sme nezopakovali.' }
    }
    return { ok: true }
  } catch (cause) {
    if (key && files) await discardUncommitted(db, files, key)
    const message = String(cause)
    if (/UNIQUE constraint failed|FIRMONY_FILING_RECEIPT_REUSED/.test(message)) return { ok: false, error: 'Toto číslo alebo súbor potvrdenia už evidujeme. Skontrolujte správny dokument a firmu.' }
    if (/FIRMONY_FILING_AUTHORITY/.test(message)) return { ok: false, error: 'Oprávnenia sa medzitým zmenili. Obnovte stránku.' }
    if (/handover is being finalized/.test(message)) return { ok: false, error: 'Účtovníctvo je uzamknuté na odovzdanie. Stav sme nezmenili.' }
    throw cause
  }
}
