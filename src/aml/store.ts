import { bankEvidence, EU_COUNTRIES, type BankVerification } from './enhanced'
import { isIban } from '../app/invoices'
// Professional checks are attested records, not automated proof of a valid QES, a clear sanctions result or a KUV.
// The original signature container stays unchanged. § 8(2), § 10(1),(2), § 12 and § 19 of Act 297/2008:
// https://static.slov-lex.sk/static/SK/ZZ/2008/297/20260817.html (read 21 October 2026).
import { now, sha256Hex } from '../db'
import { suggestedLevel, type Declaration, type Level } from '../app/aml'
import type { User } from '../app/store'
import type { Order } from '../order'
import { COUNTRY_POLICY_VERSION } from './countries'
import { AML_CHECK_KINDS, CURRENT_OFFICER_SQL, officerSql } from './schema'
import { checksCurrentSql, companyDossierSql, decisionCurrentSql, normalName, orderAdmissionSql, orderFacts, riskFloorSql,
  type Admission, type AmlDecision, type CheckKind, type CheckResult, type Dossier, type DossierView, type Verification } from './model'

export async function isOfficer(db: D1Database, user: Pick<User, 'id' | 'team'>): Promise<boolean> {
  return user.team === 'admin' && Boolean(await db.prepare(`SELECT 1 AS x WHERE ${officerSql('?')}`).bind(user.id).first())
}
export async function officer(db: D1Database): Promise<{ id: string; email: string; name: string | null } | null> {
  return db.prepare(`SELECT id, email, name FROM users WHERE id = ${CURRENT_OFFICER_SQL}`).first()
}
export function bootstrapOfficerStatement(db: D1Database, user: string): D1PreparedStatement {
  return db.prepare(`INSERT INTO aml_officers (user_id, appointed_at, appointed_by, reason)
    SELECT ?1, ?2, ?1, 'Prvý správca podľa programu vlastnej činnosti' WHERE NOT EXISTS (SELECT 1 FROM aml_officers)
    AND EXISTS (SELECT 1 FROM events WHERE user_id = ?1 AND action = 'team.bootstrap')`).bind(user, now())
}
export async function dossierView(db: D1Database, dossier: Dossier | null, currentOfficer = true): Promise<DossierView | null> {
  if (!dossier) return null
  const [checks, decision, ready] = await Promise.all([
    db.prepare(`SELECT k.*, u.name AS by_name FROM aml_checks k LEFT JOIN users u ON u.id = k.checked_by
      WHERE k.dossier_id = ? ORDER BY k.id DESC`).bind(dossier.id).all<Verification>(),
    db.prepare(`SELECT a.*, u.name AS by_name FROM aml_decisions a LEFT JOIN users u ON u.id = a.decided_by
      WHERE a.dossier_id = ? ORDER BY a.id DESC LIMIT 1`).bind(dossier.id).first<AmlDecision>(),
    db.prepare(`SELECT 1 AS x FROM aml_dossiers d JOIN aml_decisions a ON a.dossier_id = d.id WHERE d.id = ? AND ${decisionCurrentSql('d','a',currentOfficer)}`).bind(dossier.id).first(),
  ])
  return { dossier, declaration: JSON.parse(dossier.declaration) as Declaration, checks: checks.results, decision, ready: Boolean(ready), declarationHash: await sha256Hex(JSON.stringify({company:JSON.parse(dossier.company_facts),declaration:JSON.parse(dossier.declaration)})), bankEvidence: await bankEvidence(db,dossier.id) }
}
export async function dossierOfOrder(db: D1Database, orderId: string): Promise<DossierView | null> {
  return dossierView(db, await db.prepare('SELECT * FROM aml_dossiers WHERE order_id = ? ORDER BY sequence DESC LIMIT 1').bind(orderId).first<Dossier>())
}
export async function dossierOfCompany(db: D1Database, company: string): Promise<DossierView | null> {
  return dossierView(db, await db.prepare(`SELECT d.* FROM aml_dossiers d JOIN companies c ON c.id = ? WHERE d.id = (${companyDossierSql()})`).bind(company).first<Dossier>(), false)
}
export async function admissionForOrder(db: D1Database, order: Order): Promise<Admission | null> {
  const row = await db.prepare(`SELECT d.id, d.facts_hash, d.signer_name, a.id AS decision_id, a.level
    FROM orders o JOIN aml_dossiers d ON d.order_id = o.id JOIN aml_decisions a ON a.dossier_id = d.id
    WHERE o.id = ? AND ${orderAdmissionSql('o', 'd.id', 'a.id')}`).bind(order.id)
    .first<{ id: string; facts_hash: string; signer_name: string; decision_id: number; level: Level }>()
  return row ? { dossierId: row.id, decisionId: row.decision_id, factsHash: row.facts_hash, signerName: row.signer_name, level: row.level } : null
}
export async function bytesHash(bytes: Uint8Array): Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((b) => b.toString(16).padStart(2, '0')).join('')
}
export const SIGNATURE_BYTES = 25 * 1024 * 1024
export async function signatureFile(file: unknown): Promise<{ bytes: Uint8Array; type: 'pdf' | 'asice'; name: string; sha256: string } | null> {
  if (!(file instanceof File) || file.size < 8 || file.size > SIGNATURE_BYTES) return null
  const bytes = new Uint8Array(await file.arrayBuffer())
  const name = file.name.replace(/[\x00-\x1f\x7f/\\]/g, '_').slice(0, 160)
  const pdf = /\.pdf$/i.test(name) && new TextDecoder().decode(bytes.slice(0, 5)) === '%PDF-'
  const asice = /\.asice$/i.test(name) && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 3 && bytes[3] === 4
  return pdf || asice ? { bytes, type: pdf ? 'pdf' : 'asice', name, sha256: await bytesHash(bytes) } : null
}
export async function sourceIntact(files: R2Bucket | undefined, d: Dossier): Promise<boolean> {
  if (!files) return false
  const original = await files.get(d.file_key)
  if (!original || original.size !== d.file_bytes) return false
  return await bytesHash(new Uint8Array(await original.arrayBuffer())) === d.file_sha256
}
export async function prepareDossier(db: D1Database, files: R2Bucket, target: { order: Order } | { company: string; declarationId: string; facts: unknown },
  data: Declaration, file: NonNullable<Awaited<ReturnType<typeof signatureFile>>>, user: string | null): Promise<{ dossier: Dossier; statement: D1PreparedStatement }> {
  if (data.version !== 2) throw new Error('A complete current declaration is required')
  const order = 'order' in target ? target.order : null
  const canonical = order?.directors?.find((p) => normalName(p.name) === normalName(data.director.name))?.name
  if (order && !order.amlPaper && (!canonical || !order.directors?.length)) throw new Error('The identified person must be a registered director')
  const id = crypto.randomUUID()
  const declarationId = 'declarationId' in target ? target.declarationId : crypto.randomUUID()
  const companyId = 'company' in target ? target.company : null
  const key = companyId ? `companies/${companyId}/aml/${id}.${file.type}` : `onboarding/${order?.id}/${id}.${file.type}`
  const declaration = JSON.stringify(data)
  const companyFacts = JSON.stringify(order ? orderFacts(order) : 'facts' in target ? target.facts : {})
  const signerName = canonical ?? data.director.name
  const factsHash = await sha256Hex(JSON.stringify({ declaration, companyFacts, signerName, sha256: file.sha256, key }))
  const sequence = 0 // Allocated atomically by SQLite on insertion.
  const dossier: Dossier = { id, sequence, order_id: order?.id ?? null, company_id: companyId, declaration_id: declarationId,
    order_token_hash: order?.tokenHash ?? null, created_at: now(), created_by: user, declaration, company_facts: companyFacts, signer_name: signerName, facts_hash: factsHash,
    file_key: key, file_name: file.name, file_type: file.type, file_sha256: file.sha256, file_bytes: file.bytes.length,
    required_risk: suggestedLevel(data), policy_version: COUNTRY_POLICY_VERSION }
  await files.put(key, file.bytes, { httpMetadata: { contentType: file.type === 'pdf' ? 'application/pdf' : 'application/vnd.etsi.asic-e+zip' } })
  const statement = db.prepare(`INSERT INTO aml_dossiers (id,order_id,company_id,declaration_id,order_token_hash,created_at,created_by,declaration,company_facts,signer_name,facts_hash,file_key,file_name,file_type,file_sha256,file_bytes,required_risk,policy_version)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(...Object.entries(dossier).filter(([key]) => key !== 'sequence').map(([, value]) => value))
  return { dossier, statement }
}
export async function recordCheck(db: D1Database, user: User, view: DossierView, input: { kind: string; result: string; source: string; subject: string; hash: string; qualified: boolean }): Promise<boolean> {
  const d = view.dossier
  if (!(AML_CHECK_KINDS as readonly string[]).includes(input.kind) || !['clear', 'high', 'match', 'unresolved'].includes(input.result)
    || input.source.trim().length < 12 || input.source.length > 2000 || input.hash !== d.facts_hash) return false
  if (input.kind === 'identity' && input.result === 'clear' && (!input.qualified || normalName(input.subject) !== normalName(d.signer_name))) return false
  if (input.result === 'high' && input.kind !== 'pep' && input.kind !== 'countries') return false
  const result = await db.prepare(`INSERT INTO aml_checks (dossier_id,kind,result,checked_at,checked_by,source,subject_name,facts_hash)
    SELECT ?1,?2,?3,?4,?5,?6,?7,?8 WHERE EXISTS (SELECT 1 FROM aml_dossiers d WHERE d.id = ?1 AND d.facts_hash = ?8
      AND (d.order_id IS NOT NULL AND d.sequence = (SELECT MAX(sequence) FROM aml_dossiers WHERE order_id = d.order_id)
        OR d.company_id IS NOT NULL AND d.declaration_id = (SELECT id FROM declarations WHERE company_id = d.company_id ORDER BY created_at DESC,rowid DESC LIMIT 1)))`)
    .bind(d.id, input.kind as CheckKind, input.result as CheckResult, now(), user.id, input.source.trim(), input.kind === 'identity' ? d.signer_name : null, d.facts_hash).run()
  return (result.meta.changes ?? 0) > 0
}
export async function decideDossier(db: D1Database, user: User, view: DossierView, input: { level: string; decision: string; note: string; enhanced: string; hash: string; bank?: BankVerification }): Promise<boolean> {
  const d = view.dossier
  if (!['low','standard','high'].includes(input.level) || !['approved','hold'].includes(input.decision) || input.note.trim().length < 12
    || input.note.length > 2000 || input.enhanced.length > 2000 || input.hash !== d.facts_hash || !await isOfficer(db, user)) return false
  if (input.decision === 'approved' && input.level === 'high' && input.enhanced.trim().length < 12) return false
  const bank=input.bank
  if (input.decision === 'approved' && input.level === 'high' && (!bank || !isIban(bank.iban) || !EU_COUNTRIES.includes(bank.country) || normalName(bank.owner) !== normalName(String(JSON.parse(d.company_facts).name ?? '')) || bank.reference.trim().length < 12 || !(await bankEvidence(db,d.id)).some((b)=>b.id === bank.id))) return false
  const ids: Record<string,number> = {}
  for (const k of view.checks) if (!(k.kind in ids)) ids[k.kind] = k.id
  const checks = JSON.stringify(ids)
  const nonce = crypto.randomUUID()
  const decisionStatement = db.prepare(`INSERT INTO aml_decisions (dossier_id,decided_at,decided_by,decision,level,note,enhanced_source,nonce,checks,facts_hash,policy_version,bank_id,bank_iban,bank_country,bank_owner,bank_payment_ref)
    SELECT ?1,?2,?3,?4,?5,?6,?7,?11,?8,?9,?10,?12,?13,?14,?15,?16 FROM aml_dossiers d WHERE d.id = ?1 AND d.facts_hash = ?9
      AND (?4 = 'hold' OR (${checksCurrentSql('d.id','?8','d.facts_hash')} AND ${riskFloorSql('d','?5')}))
      AND (d.order_id IS NOT NULL AND d.sequence = (SELECT MAX(sequence) FROM aml_dossiers WHERE order_id = d.order_id)
        OR d.company_id IS NOT NULL AND d.declaration_id = (SELECT id FROM declarations WHERE company_id = d.company_id ORDER BY created_at DESC,rowid DESC LIMIT 1))`)
    .bind(d.id, now(), user.id, input.decision, input.level, input.note.trim(), input.enhanced.trim() || null, checks, d.facts_hash, d.policy_version, nonce, bank?.id ?? null, bank?.iban ?? null, bank?.country ?? null, bank?.owner ?? null, bank?.reference ?? null)
  const results = await db.batch([
    decisionStatement,
    db.prepare(`UPDATE declarations SET checked_at = ?1, checked_by = ?2 WHERE id = ?3 AND checked_at IS NULL
      AND EXISTS (SELECT 1 FROM aml_decisions WHERE nonce = ?4 AND decision = 'approved')`).bind(now(), user.id, d.declaration_id, nonce),
    db.prepare(`INSERT INTO risks (id,company_id,created_at,created_by,level,note)
      SELECT ?1,c.id,?2,?3,?4,?5 FROM companies c WHERE (c.id = ?6 OR c.aml_dossier_id = ?7)
      AND EXISTS (SELECT 1 FROM aml_decisions WHERE nonce = ?8 AND decision = 'approved')`)
      .bind(crypto.randomUUID(), now(), user.id, input.level, input.note.trim(), d.company_id, d.id, nonce),
  ])
  return (results[0]?.meta.changes ?? 0) > 0
}

export async function bankOriginalsIntact(db:D1Database,files:R2Bucket|undefined,d:Dossier,id:string):Promise<boolean> {
  const proof=(await bankEvidence(db,d.id)).find((b)=>b.id === id)
  if (!proof || !files) return false
  for (const [key,hash,bytes] of [[proof.account_key,proof.account_sha256,proof.account_bytes],[proof.payment_key,proof.payment_sha256,proof.payment_bytes]] as const) {
    const file=await files.get(key)
    if (!file || file.size !== bytes || await bytesHash(new Uint8Array(await file.arrayBuffer())) !== hash) return false
  }
  return true
}
