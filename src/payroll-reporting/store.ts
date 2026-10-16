import { now, sha256Hex } from '../db'
import { dataRevision } from '../app/handover-store'
import { fileHash } from '../app/read'
import { sniffHandover } from '../app/papers'
import type { Company, User } from '../app/store'
import type { FilingEvent } from '../filings/model'
import { discardUncommitted, recordDelivery, type DeliveryChange } from '../filings/store'
import { payoutError, reportDue, requiredInsurers, type Closure, type Payout, type ReportItem, type ReportKind, type ReportPackage, type ReportTarget } from './model'
import { closureCurrentSql, coverageJsonSql, latestPayoutSql, payrollRunProtectedSql, reportCurrentSql, targetActiveSql } from './sql'

type Row = Record<string, unknown>
type ClosedRow = { company_id: string; period: string; payday: string; lines: string; closed_at: number; evidence_id: string | null }
export async function closureOf(db: D1Database, company: string, period: string): Promise<Closure | null> {
  return db.prepare(`SELECT pc.* FROM payroll_closures pc WHERE pc.company_id = ? AND pc.period = ? AND (${closureCurrentSql('pc')})`).bind(company, period).first<Closure>()
}
export async function payoutsOf(db: D1Database, company: string, closure: string): Promise<Payout[]> {
  return (await db.prepare('SELECT * FROM payroll_payouts WHERE company_id = ? AND closure_id = ? ORDER BY revision DESC').bind(company, closure).all<Payout>()).results
}
function targetStatement(db: D1Database, company: string, period: string, kind: ReportKind, payday: string, closure: string | null, by: string, payoutId?: string): D1PreparedStatement {
  const guard = closure ? `EXISTS (SELECT 1 FROM payroll_closures pc WHERE pc.id = ?7 AND (${closureCurrentSql('pc')})) AND ?9 IS NULL` : 'EXISTS (SELECT 1 FROM payroll_payouts WHERE id = ?9 AND company_id = ?2 AND substr(paid_on, 1, 7) = ?4)'
  return db.prepare(`INSERT INTO payroll_targets (id, company_id, kind, period, due_on, closure_id, created_at, updated_by)
    SELECT ?1, ?2, ?3, ?4, ?5, ?7, ?6, ?8 WHERE ${guard}
    ON CONFLICT(company_id, kind, period) DO UPDATE SET closure_id = excluded.closure_id, package_id = NULL,
      due_on = excluded.due_on, updated_by = excluded.updated_by, revision = payroll_targets.revision + 1
      WHERE payroll_targets.closure_id IS NOT excluded.closure_id`)
    .bind(crypto.randomUUID(), company, kind, period, reportDue(kind, payday), now(), closure, by, payoutId ?? null)
}
/** The source run and this snapshot must be written in one batch. No XML or authority acceptance is fabricated. */
export async function closureStatements(db: D1Database, company: Company, run: ClosedRow, id: string, by: string, expectedRevision?: number, attach = false): Promise<D1PreparedStatement[]> {
  let lines: unknown; try { lines = JSON.parse(run.lines) } catch { throw new Error('Invalid closed payroll snapshot') }
  const insurers = requiredInsurers(lines)
  if (!insurers) throw new Error('Invalid closed payroll snapshot')
  const source = JSON.stringify({ version: 1, company: { id: company.id, ico: company.ico, dic: company.dic }, period: run.period, payday: run.payday, closedAt: run.closed_at, lines })
  const hash = await sha256Hex(source)
  const guard = expectedRevision === undefined ? '' : ' AND COALESCE((SELECT revision FROM company_data_revisions WHERE company_id = ?2), 0) = ?11'
  const insert = db.prepare(`INSERT INTO payroll_closures (id, company_id, period, payday, lines, source_json, sha256, closed_at, created_at, created_by)
    SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10 WHERE EXISTS (SELECT 1 FROM payroll_runs r WHERE r.company_id = ?2 AND r.period = ?3
      AND r.closed_at = ?8 AND r.lines = ?5 AND r.payday = ?4 AND (r.evidence_id IS NULL OR r.evidence_id = ?1))${guard}`)
  const params: (string | number)[] = [id, company.id, run.period, run.payday, run.lines, source, hash, run.closed_at, now(), by]
  if (expectedRevision !== undefined) params.push(expectedRevision)
  const statements = [insert.bind(...params)]
  if (attach) statements.push(db.prepare(`UPDATE payroll_runs SET evidence_id = ?1 WHERE company_id = ?2 AND period = ?3 AND evidence_id IS NULL
    AND EXISTS (SELECT 1 FROM payroll_closures WHERE id = ?1 AND lines = payroll_runs.lines AND closed_at = payroll_runs.closed_at AND payday = payroll_runs.payday)`)
    .bind(id, company.id, run.period))
  statements.push(...(['sp', ...insurers.map((i) => `health${i}`)] as ReportKind[]).map((kind) => targetStatement(db, company.id, run.period, kind, run.payday, id, by)))
  return statements
}
export async function initializeClosedRun(db: D1Database, company: Company, period: string, user: User): Promise<{ ok: boolean; error?: string }> {
  const revision = await dataRevision(db, company.id)
  const run = await db.prepare('SELECT * FROM payroll_runs WHERE company_id = ? AND period = ? AND closed_at IS NOT NULL').bind(company.id, period).first<ClosedRow>()
  if (!run?.payday) return { ok: false, error: 'Najprv uzavrite mzdy s konkrétnym výplatným termínom.' }
  if (run.evidence_id) return await closureOf(db, company.id, period) ? { ok: true } : { ok: false, error: 'Evidencia uzávierky sa nezhoduje s podkladmi. Obráťte sa na správcu.' }
  try {
    const result = await db.batch(await closureStatements(db, company, run, crypto.randomUUID(), user.id, revision, true))
    return result[0]?.meta.changes ? { ok: true } : { ok: false, error: 'Uzávierka sa zmenila. Obnovte stránku.' }
  } catch (e) { return payrollError(e) }
}
export async function recordPayout(db: D1Database, closure: Closure, user: User, value: { paidOn: string; reference: string; reason: string; checked: boolean; revision: number }, today: string): Promise<{ ok: boolean; error?: string }> {
  const lines = JSON.parse(closure.lines)
  if (!requiredInsurers(lines) || !lines.some((l: { gross: number }) => l.gross > 0)) return { ok: false, error: 'Táto uzávierka neobsahuje príjem na potvrdenie výplaty. Iné príjmy musí posúdiť účtovník osobitne.' }
  const history = await payoutsOf(db, closure.company_id, closure.id), previous = history[0]
  const error = payoutError(value, previous?.revision ?? 0, user.team === 'admin', today, closure.period)
  if (error) return { ok: false, error }
  if (value.paidOn === previous?.paid_on && value.reference.trim() === previous.reference) return { ok: false, error: 'Tento dátum už evidujeme. Nový záznam nevznikol.' }
  const id = crypto.randomUUID()
  try {
    const result = await db.batch([
      db.prepare(`INSERT INTO payroll_payouts (id, closure_id, company_id, revision, paid_on, reference, reason, at, by_user)
        SELECT ?1, pc.id, pc.company_id, ?4 + 1, ?5, ?6, ?7, ?8, ?9 FROM payroll_closures pc WHERE pc.id = ?2 AND pc.company_id = ?3
          AND (${closureCurrentSql('pc')}) AND COALESCE((SELECT MAX(revision) FROM payroll_payouts WHERE closure_id = pc.id), 0) = ?4`)
        .bind(id, closure.id, closure.company_id, value.revision, value.paidOn, value.reference.trim(), value.reason.trim(), now(), user.id),
      targetStatement(db, closure.company_id, value.paidOn.slice(0, 7), 'tax', value.paidOn, null, user.id, id),
    ])
    return result[0]?.meta.changes ? { ok: true } : { ok: false, error: 'Výplata sa medzitým zmenila. Obnovte stránku.' }
  } catch (e) { return payrollError(e) }
}
export const PACKAGE_FIELDS = ['id', 'target_id', 'company_id', 'previous_id', 'reason', 'variant', 'name', 'file_key', 'file_type', 'file_bytes', 'sha256', 'source_json', 'source_hash', 'status', 'revision', 'created_at', 'created_by', 'updated_at', 'updated_by', 'last_event'] as const
const PACKAGE_SELECT = PACKAGE_FIELDS.map((k) => `p.${k} AS p_${k}`).join(', ')
const CURRENT_JSON = (t: string) => `CASE WHEN ${t}.kind = 'tax' THEN ${coverageJsonSql(t)} ELSE (SELECT source_json FROM payroll_closures WHERE id = ${t}.closure_id) END`
export async function reportItems(db: D1Database, company: string, period = '', page = 1): Promise<ReportItem[]> {
  const result = await db.prepare(`SELECT t.*, ${PACKAGE_SELECT}, (${targetActiveSql('t')}) AS active, (${reportCurrentSql('t', 'p')}) AS source_current
    FROM payroll_targets t LEFT JOIN payroll_packages p ON p.id = t.package_id AND p.company_id = t.company_id
    WHERE t.company_id = ?1 AND (?2 = '' OR t.period = ?2 OR t.closure_id IN (SELECT id FROM payroll_closures WHERE company_id = ?1 AND period = ?2)
      OR (t.kind = 'tax' AND EXISTS (SELECT 1 FROM payroll_payouts cp JOIN payroll_closures cc ON cc.id = cp.closure_id WHERE cc.company_id = ?1 AND cc.period = ?2 AND substr(cp.paid_on, 1, 7) = t.period AND (${latestPayoutSql('cp')}))))
    ORDER BY t.period DESC, t.kind, t.id LIMIT 51 OFFSET ?3`).bind(company, period, (Math.min(10000, Math.max(1, Math.trunc(page))) - 1) * 50).all<Row>()
  return result.results.map(itemFrom)
}
function itemFrom(r: Row): ReportItem {
  const pkg = r.p_id ? Object.fromEntries(PACKAGE_FIELDS.map((k) => [k, r[`p_${k}`]])) as unknown as ReportPackage : null
  const active = Boolean(r.active), sourceChanged = Boolean(pkg && active && !r.source_current)
  return { ...r, pkg, active, sourceChanged, status: sourceChanged ? 'unverified' : pkg?.status ?? 'unverified' } as unknown as ReportItem
}
export async function reportItem(db: D1Database, company: string, id: string): Promise<ReportItem | null> {
  const row = await db.prepare(`SELECT t.*, ${PACKAGE_SELECT}, (${targetActiveSql('t')}) AS active, (${reportCurrentSql('t', 'p')}) AS source_current
    FROM payroll_targets t LEFT JOIN payroll_packages p ON p.id = t.package_id AND p.company_id = t.company_id
    WHERE t.company_id = ? AND t.id = ?`).bind(company, id).first<Row>()
  return row ? itemFrom(row) : null
}
export async function targetOf(db: D1Database, company: string, id: string): Promise<ReportTarget | null> {
  return db.prepare('SELECT * FROM payroll_targets WHERE company_id = ? AND id = ?').bind(company, id).first<ReportTarget>()
}
export async function reportPackage(db: D1Database, company: string, id: string): Promise<ReportPackage | null> {
  return db.prepare('SELECT * FROM payroll_packages WHERE company_id = ? AND id = ?').bind(company, id).first<ReportPackage>()
}
export async function reportHistory(db: D1Database, company: string, target: string): Promise<ReportPackage[]> {
  return (await db.prepare('SELECT * FROM payroll_packages WHERE company_id = ? AND target_id = ? ORDER BY created_at DESC, rowid DESC').bind(company, target).all<ReportPackage>()).results
}
export async function reportEvents(db: D1Database, company: string, id: string): Promise<FilingEvent[]> {
  return (await db.prepare('SELECT e.*, u.name AS by_name FROM payroll_events e LEFT JOIN users u ON u.id = e.by_user WHERE e.company_id = ? AND e.package_id = ? ORDER BY e.revision DESC').bind(company, id).all<FilingEvent>()).results
}
export async function sourceOf(db: D1Database, target: ReportTarget): Promise<{ json: string; hash: string } | null> {
  const row = await db.prepare(`SELECT ${CURRENT_JSON('t')} AS source, (${targetActiveSql('t')}) AS active FROM payroll_targets t WHERE t.id = ? AND t.company_id = ?`).bind(target.id, target.company_id).first<{ source: string | null; active: number }>()
  if (!row?.active || row.source === null) return null
  return { json: row.source, hash: await sha256Hex(row.source) }
}
export interface ReportUpload { revision: number; variant: string; reason: string; checked: boolean; file: { name: string; bytes: Uint8Array } }
export async function saveReport(db: D1Database, files: R2Bucket | undefined, target: ReportTarget, user: User, value: ReportUpload): Promise<{ ok: boolean; error?: string; id?: string }> {
  if (!files) return { ok: false, error: 'Úložisko nie je dostupné. Výkaz sme neuložili.' }
  if (!value.checked || value.variant.trim().length < 2 || value.variant.length > 120) return { ok: false, error: 'Uveďte druh formulára a potvrďte odbornú kontrolu súboru, príjemcu a obdobia.' }
  if (value.revision !== target.revision) return { ok: false, error: 'Evidencia sa zmenila. Obnovte stránku.' }
  if (value.reason.length > 1200 || target.package_id && value.reason.trim().length < 12) return { ok: false, error: 'Pri ďalšej verzii uveďte dôvod, aspoň 12 znakov.' }
  const previous = target.package_id ? await reportPackage(db, target.company_id, target.package_id) : null
  if (previous && ['submitted', 'accepted', 'review'].includes(previous.status) && user.team !== 'admin') return { ok: false, error: 'Nadväzujúcu verziu už odoslaného výkazu musí posúdiť správca. Pôvodné podanie zostane zachované.' }
  if (!value.file.bytes.length || value.file.bytes.length > 10 * 1024 * 1024) return { ok: false, error: 'Súbor nesmie byť prázdny a môže mať najviac 10 MB.' }
  const format = sniffHandover(value.file.bytes, value.file.name)
  if (!format || !['xml', 'txt', 'pdf', 'asice', 'asics'].includes(format.ext)) return { ok: false, error: 'Nahrajte pôvodný súbor výkazu v XML, textovej dávke, PDF alebo ASiC.' }
  const revision = await dataRevision(db, target.company_id), source = await sourceOf(db, target)
  if (!source) return { ok: false, error: 'Tento výkaz nemá aktuálnu uzavretú mzdovú verziu. Najprv skontrolujte uzávierku.' }
  if (target.kind === 'tax' && source.json === '[]' && (user.team !== 'admin' || value.reason.trim().length < 12)) return { ok: false, error: 'V tomto mesiaci už neevidujeme výplaty. Opravu predchádzajúceho prehľadu musí posúdiť správca s uvedením dôvodu.' }
  const id = crypto.randomUUID(), key = `companies/${target.company_id}/filings/${id}.${format.ext}`, hash = await fileHash(value.file.bytes), at = now()
  await files.put(key, value.file.bytes, { httpMetadata: { contentType: format.type } })
  try {
    const result = await db.batch([
      db.prepare(`INSERT INTO payroll_packages (id, target_id, company_id, previous_id, reason, variant, name, file_key, file_type, file_bytes, sha256, source_json, source_hash, created_at, created_by, updated_at, updated_by)
        SELECT ?1, id, company_id, package_id, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?14, ?15 FROM payroll_targets
        WHERE id = ?2 AND company_id = ?3 AND revision = ?4 AND COALESCE((SELECT revision FROM company_data_revisions WHERE company_id = ?3), 0) = ?16`)
        .bind(id, target.id, target.company_id, value.revision, value.reason.trim(), value.variant.trim(), value.file.name.slice(0, 160), key, format.type, value.file.bytes.length, hash, source.json, source.hash, at, user.id, revision),
      db.prepare(`UPDATE payroll_targets SET package_id = ?1, revision = revision + 1, updated_by = ?2 WHERE id = ?3 AND company_id = ?4 AND revision = ?5
        AND EXISTS (SELECT 1 FROM payroll_packages WHERE id = ?1 AND target_id = ?3 AND previous_id IS payroll_targets.package_id)`)
        .bind(id, user.id, target.id, target.company_id, value.revision),
    ])
    if (!result[0]?.meta.changes || !result[1]?.meta.changes) { await discardUncommitted(db, files, key, 'payroll_packages'); return { ok: false, error: 'Podklady sa medzitým zmenili. Obnovte stránku; pôvodnú akciu sme nezopakovali.' } }
    return { ok: true, id }
  } catch (e) { await discardUncommitted(db, files, key, 'payroll_packages'); return payrollError(e) }
}
export const changeReportDelivery = (db: D1Database, files: R2Bucket | undefined, pkg: ReportPackage, user: User, input: DeliveryChange, today: string) => recordDelivery(db, files, pkg, user, input, today, { packages: 'payroll_packages', events: 'payroll_events' })
function payrollError(error: unknown): { ok: false; error: string } {
  const message = String(error)
  if (/Invalid closed payroll snapshot/.test(message)) return { ok: false, error: 'Uzávierka nemá úplné podklady alebo obsahuje neznámu poisťovňu. Najprv ju odborne skontrolujte.' }
  if (/FIRMONY_PAYROLL_AUTHORITY|FIRMONY_FILING_AUTHORITY/.test(message)) return { ok: false, error: 'Údaje alebo oprávnenia sa medzitým zmenili. Obnovte stránku.' }
  if (/UNIQUE constraint failed|FIRMONY_PAYROLL_FILE_REUSED/.test(message)) return { ok: false, error: 'Tento súbor alebo záznam už evidujeme. Skontrolujte príjemcu a aktuálnu verziu.' }
  if (/handover is being finalized/.test(message)) return { ok: false, error: 'Účtovníctvo je uzamknuté na odovzdanie. Nový záznam sme nepridali.' }
  throw error
}

export interface RunEvidence {
  period: string; payday: string | null; closureId: string | null; payouts: Payout[]; needsPayout: boolean
}
export async function runEvidence(db: D1Database, company: string, period = ''): Promise<RunEvidence[]> {
  const [runs, payouts] = await db.batch<Row>([
    db.prepare(`SELECT r.period, r.payday, pc.id AS closure_id, COALESCE((SELECT SUM(json_extract(value, '$.gross')) FROM json_each(CASE WHEN json_valid(r.lines) THEN r.lines ELSE '[]' END)), 0) > 0 AS needs_payout FROM payroll_runs r LEFT JOIN payroll_closures pc ON pc.id = r.evidence_id AND pc.company_id = r.company_id AND pc.period = r.period AND (${closureCurrentSql('pc')})
      WHERE r.company_id = ?1 AND r.closed_at IS NOT NULL AND (?2 = '' OR r.period = ?2) ORDER BY r.period DESC LIMIT 20`).bind(company, period),
    db.prepare('SELECT p.*, u.name AS by_name FROM payroll_payouts p LEFT JOIN users u ON u.id = p.by_user WHERE p.company_id = ? ORDER BY p.revision DESC').bind(company),
  ])
  return (runs?.results ?? []).map((r) => ({ period: String(r.period), payday: typeof r.payday === 'string' ? r.payday : null, needsPayout: Boolean(r.needs_payout), closureId: typeof r.closure_id === 'string' ? r.closure_id : null, payouts: (payouts?.results ?? []).filter((p) => p.closure_id === r.closure_id) as unknown as Payout[] }))
}
export async function runReopenBlocked(db: D1Database, company: string, period: string): Promise<boolean> {
  return Boolean(await db.prepare(`SELECT 1 FROM payroll_runs r WHERE r.company_id = ? AND r.period = ? AND (${payrollRunProtectedSql('r.evidence_id')})`).bind(company, period).first())
}
