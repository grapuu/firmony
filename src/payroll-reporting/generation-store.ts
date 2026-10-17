import { now, sha256Hex } from '../db'
import { LEGAL_FORM_CODES } from '../rpo'
import { dataRevision } from '../app/handover-store'
import { companyOf, type Company, type User } from '../app/store'
import { fileHash } from '../app/read'
import { sniffHandover } from '../app/papers'
import { discardUncommitted } from '../filings/store'
import { currentCoverageJsonSql, currentTargetActiveSql, closureCurrentSql, latestPayoutSql, targetReviewScopeSql, unknownLegacyPeriodSql } from './sql'
import { prehladInputError, prehladTotals, prehladXml, PREHLAD_FORMAT, PREHLAD_XSD_SHA256, type PrehladInput, type PrehladSource, type PrehladTotals } from './prehlad'
import { saveReport } from './store'
import type { Closure, ReportTarget } from './model'

export interface GenerationPlan {
  company: Company; target: ReportTarget; revision: number; sourceJson: string; sourceHash: string; token: string
  sources: (Closure & PrehladSource)[]; totals: PrehladTotals; hasPoa: boolean; frozen: boolean
}
export async function generationPlan(db: D1Database, companyId: string, targetId: string, today: string): Promise<GenerationPlan | null> {
  const revision = await dataRevision(db, companyId)
  const result = await db.batch<Record<string, unknown>>([
    db.prepare('SELECT * FROM companies WHERE id = ?').bind(companyId),
    db.prepare(`SELECT t.*, ${currentCoverageJsonSql('t')} AS coverage, (${currentTargetActiveSql('t')}) AS active FROM payroll_targets t WHERE t.id = ? AND t.company_id = ? AND t.kind = 'tax'`).bind(targetId, companyId),
    db.prepare(`SELECT pc.*, pp.paid_on, pp.report_period FROM payroll_targets t JOIN payroll_closures pc ON pc.company_id = t.company_id JOIN payroll_payouts pp ON pp.closure_id = pc.id AND pp.company_id = pc.company_id
      WHERE t.id = ? AND t.company_id = ? AND pp.report_period = t.period AND (${closureCurrentSql('pc')}) AND (${latestPayoutSql('pp')}) ORDER BY pc.id`).bind(targetId, companyId),
    db.prepare(`SELECT pc.period FROM payroll_closures pc JOIN payroll_targets t ON t.company_id = pc.company_id WHERE t.id = ? AND t.company_id = ? AND pc.period <= t.period AND (${closureCurrentSql('pc')})
      AND (SELECT COALESCE(SUM(json_extract(value, '$.gross')), 0) FROM json_each(pc.lines)) > 0
      AND NOT EXISTS (SELECT 1 FROM payroll_payouts pp WHERE pp.closure_id = pc.id AND pp.report_period IS NOT NULL AND (${latestPayoutSql('pp')})) ORDER BY pc.period`).bind(targetId, companyId),
    db.prepare("SELECT id FROM company_files WHERE company_id = ? AND kind = 'poa' AND checked_at IS NOT NULL AND deleted_at IS NULL LIMIT 1").bind(companyId),
  ])
  const rawCompany = result[0]?.results[0], target = result[1]?.results[0]
  if (!rawCompany || !target) return null
  const company = companyOf(rawCompany), sources = (result[2]?.results ?? []) as unknown as GenerationPlan['sources']
  const totals = prehladTotals(String(target.period), sources, today), hasPoa = Boolean(result[4]?.results.length), frozen = rawCompany.purge_started_at !== null
  if (!target.active) totals.issues.push('Táto povinnosť bola po odbornom preverení vyradená.')
  if (frozen) totals.issues.push('Účtovníctvo je uzamknuté na odovzdanie.')
  for (const r of result[3]?.results ?? []) totals.issues.push(`Mzdy za ${r.period} nemajú overenú výplatu a vykazované obdobie. Najprv ich preverte.`)
  for (const s of sources) {
    let snapshot: { period?: string; lines?: unknown } | null = null
    try { snapshot = JSON.parse(s.source_json) } catch { /* Report the integrity issue below. */ }
    if (await sha256Hex(s.source_json) !== s.sha256 || snapshot?.period !== s.period || JSON.stringify(snapshot?.lines) !== JSON.stringify(JSON.parse(s.lines))) totals.issues.push('Zdrojová mzdová uzávierka sa nezhoduje s uloženým kontrolným odtlačkom.')
  }
  const sourceJson = String(target.coverage), sourceHash = await sha256Hex(sourceJson)
  const token = await sha256Hex(JSON.stringify({ version: 1, format: PREHLAD_FORMAT, xsd: PREHLAD_XSD_SHA256, revision, target, company: { id: company.id, name: company.name, dic: company.dic, address: company.address }, sourceHash, totals, hasPoa, frozen }))
  return { company, target: target as unknown as ReportTarget, revision, sources, sourceJson, sourceHash, totals, token, hasPoa, frozen }
}
export async function generatePrehlad(db: D1Database, files: R2Bucket | undefined, plan: GenerationPlan, user: User, token: string, values: PrehladInput, today: string) {
  if (token !== plan.token) return { ok: false, error: 'Podklady sa od otvorenia stránky zmenili. Skontrolujte nové úhrny a potvrďte kontrolu znova.' }
  if (plan.totals.issues.length) return { ok: false, error: plan.totals.issues[0] }
  const error = prehladInputError(values, plan.target.period, today, plan.company, plan.hasPoa, Boolean(plan.target.package_id))
  if (error) return { ok: false, error }
  const xml = prehladXml(plan.target.period, plan.totals, values, LEGAL_FORM_CODES[plan.company.legalForm ?? 'sro']), bytes = new TextEncoder().encode(xml)
  const details = JSON.stringify({ version: 1, format: PREHLAD_FORMAT, xsdSha256: PREHLAD_XSD_SHA256, sourceHash: plan.sourceHash, fileSha256: await fileHash(bytes), reviewedDataRevision: plan.revision, input: values, totals: plan.totals, company: { id: plan.company.id, ico: plan.company.ico, dic: plan.company.dic }, sourceClosures: plan.sources.map((s) => s.id) })
  return saveReport(db, files, plan.target, user, { revision: plan.target.revision, variant: `${PREHLAD_FORMAT} · ${values.kind === 'R' ? 'riadny' : 'opravný'}`, reason: values.reason, checked: true,
    file: { name: `${PREHLAD_FORMAT}-${plan.target.period}-${values.kind}.xml`, bytes }, expectedDataRevision: plan.revision, expectedSourceHash: plan.sourceHash,
    generation: { format: PREHLAD_FORMAT, details, sha256: await sha256Hex(details) } })
}
export interface GenerationEvidence { package_id: string; company_id: string; format: string; details: string; sha256: string; at: number; by_user: string; by_name?: string | null }
export async function generationOf(db: D1Database, company: string, packageId: string): Promise<GenerationEvidence | null> {
  return db.prepare(`SELECT g.package_id, g.company_id, g.format, g.details, g.sha256, g.at, g.by_user, u.name AS by_name FROM payroll_generations g LEFT JOIN users u ON u.id = g.by_user WHERE g.company_id = ?1 AND g.package_id = ?2
    UNION ALL SELECT g.package_id, g.company_id, g.format, g.details, g.sha256, g.at, g.by_user, u.name AS by_name FROM payroll_health_generations g LEFT JOIN users u ON u.id = g.by_user WHERE g.company_id = ?1 AND g.package_id = ?2
    UNION ALL SELECT g.package_id, g.company_id, g.format, g.details, g.sha256, g.at, g.by_user, u.name AS by_name FROM payroll_social_generations g LEFT JOIN users u ON u.id = g.by_user WHERE g.company_id = ?1 AND g.package_id = ?2`).bind(company, packageId).first<GenerationEvidence>()
}
export interface TargetReview {
  id: string; company_id: string; target_id: string; data_revision: number; source_json: string; scope_json: string; reason: string; reference: string; at: number; by_user: string; by_name: string | null
  file_key: string | null; file_name: string | null; file_type: string | null; file_bytes: number | null; file_sha256: string | null
}
export async function targetReviews(db: D1Database, company: string, targetId: string): Promise<TargetReview[]> {
  return (await db.prepare('SELECT r.*, u.name AS by_name FROM payroll_target_reviews r LEFT JOIN users u ON u.id = r.by_user WHERE r.company_id = ? AND r.target_id = ? ORDER BY r.at DESC, r.rowid DESC').bind(company, targetId).all<TargetReview>()).results
}
export async function reviewScope(db: D1Database, company: string, targetId: string) {
  const revision = await dataRevision(db, company)
  const row = await db.prepare(`SELECT t.id, ${currentCoverageJsonSql('t')} AS coverage, ${targetReviewScopeSql('t')} AS scopeJson, (${unknownLegacyPeriodSql('t')}) AS unknown, (${currentTargetActiveSql('t')}) AS active,
    EXISTS (SELECT 1 FROM payroll_packages p WHERE p.target_id = t.id AND p.status <> 'prepared') AS sent FROM payroll_targets t WHERE t.id = ? AND t.company_id = ? AND t.kind = 'tax'`).bind(targetId, company).first<{ id: string; coverage: string; scopeJson: string; unknown: number; active: number; sent: number }>()
  return row ? { ...row, revision, canRetire: row.active && row.coverage === '[]' && !row.unknown } : null
}
export async function retireTarget(db: D1Database, files: R2Bucket | undefined, company: string, targetId: string, user: User, input: { revision: number; reference: string; reason: string; checked: boolean; file?: { name: string; bytes: Uint8Array } }): Promise<{ ok: boolean; error?: string }> {
  if (user.team !== 'admin' || !input.checked || input.reason.trim().length < 24 || input.reason.length > 1200 || input.reference.trim().length < 12 || input.reference.length > 240) return { ok: false, error: 'Správca musí potvrdiť odborné vyriešenie, uviesť dôvod aspoň 24 znakov a referenciu kontroly.' }
  const scope = await reviewScope(db, company, targetId)
  if (!scope?.canRetire || scope.revision !== input.revision) return { ok: false, error: 'Obdobie alebo podklady sa zmenili. Najprv dokončite priradenie príjmov a obnovte stránku.' }
  if (scope.sent && !input.file) return { ok: false, error: 'Pri už evidovanom odoslaní priložte originál odborného alebo úradného podkladu k vyriešeniu skutočných podaní.' }
  let format: ReturnType<typeof sniffHandover> = null
  if (input.file) {
    if (!files || !input.file.bytes.length || input.file.bytes.length > 10 * 1024 * 1024) return { ok: false, error: 'Priložte dostupný originál najviac 10 MB.' }
    format = sniffHandover(input.file.bytes, input.file.name)
    if (!format || !['xml','txt','pdf','asice','asics'].includes(format.ext)) return { ok: false, error: 'Podklad má byť XML, text, PDF alebo ASiC.' }
  }
  const id = crypto.randomUUID(), key = format ? `companies/${company}/filings/review-${id}.${format.ext}` : null
  if (key && files && input.file) await files.put(key, input.file.bytes, { httpMetadata: { contentType: format!.type } })
  try {
    const r = await db.prepare(`INSERT INTO payroll_target_reviews (id, company_id, target_id, source_json, scope_json, data_revision, reason, reference, at, by_user, file_key, file_name, file_type, file_bytes, file_sha256)
      SELECT ?, ?, ?, '[]', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE COALESCE((SELECT revision FROM company_data_revisions WHERE company_id = ?), 0) = ?`)
      .bind(id, company, targetId, scope.scopeJson, input.revision, input.reason.trim(), input.reference.trim(), now(), user.id, key, input.file?.name.slice(0,160) ?? null, format?.type ?? null, input.file?.bytes.length ?? null, input.file ? await fileHash(input.file.bytes) : null, company, input.revision).run()
    if (r.meta.changes) return { ok: true }
    if (key && files) await discardUncommitted(db, files, key, 'payroll_target_reviews')
    return { ok: false, error: 'Podklady sa medzitým zmenili. Obnovte stránku.' }
  } catch (e) {
    if (key && files) await discardUncommitted(db, files, key, 'payroll_target_reviews')
    if (/FIRMONY_PAYROLL_AUTHORITY|UNIQUE constraint|handover is being finalized/.test(String(e))) return { ok: false, error: 'Údaje alebo oprávnenia sa zmenili. Preverenie sme nezapísali; obnovte stránku.' }
    throw e
  }
}
