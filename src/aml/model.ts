import type { BankEvidence } from './enhanced'
import { bankCurrentSql } from './enhanced'
import type { Order } from '../order'
import type { Company } from '../app/store'
import type { Declaration, Level } from '../app/aml'
import { COUNTRY_POLICY_VERSION } from './countries'
import { AML_CHECK_KINDS, CURRENT_OFFICER_SQL } from './constants'

export type CheckKind = typeof AML_CHECK_KINDS[number]
export type CheckResult = 'clear' | 'high' | 'match' | 'unresolved'
export const CHECK_LABELS: Record<CheckKind, string> = {
  identity: 'Overenie kvalifikovaného podpisu a totožnosti', kuv: 'KUV, vlastnícka štruktúra a oprávnenie konať',
  pep: 'Kontrola PEP vo verejných zdrojoch', 'eu-sanctions': 'Sankčné zoznamy EÚ', 'un-sanctions': 'Sankčné zoznamy OSN',
  countries: 'Krajiny, štátna príslušnosť, pobyt a obchodní partneri',
}
export const quoteSql = (s: string) => `'${s.replace(/'/g, "''")}'`
export const normalName = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('sk').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
export function orderFacts(o: Order) {
  return { ico: o.ico, name: o.company, address: o.address, register: o.registerLine,
    directorsJson: o.directorsJson ?? (o.directors ? JSON.stringify(o.directors) : null), legalForm: o.legalForm ?? 'sro', acting: o.acting }
}
export const companyFacts = (c: Company) => ({ ico: c.ico, name: c.name, address: c.address, legalForm: c.legalForm, register: c.registerLine })
export interface Dossier {
  id: string; sequence: number; order_id: string | null; company_id: string | null; declaration_id: string
  order_token_hash: string | null; created_at: number; created_by: string | null; declaration: string; company_facts: string; signer_name: string; facts_hash: string
  file_key: string; file_name: string; file_type: 'pdf' | 'asice'; file_sha256: string; file_bytes: number
  required_risk: Level; policy_version: string
}
export interface Verification {
  id: number; dossier_id: string; kind: CheckKind; result: CheckResult; checked_at: number; checked_by: string
  source: string; subject_name: string | null; facts_hash: string; by_name?: string | null
}
export interface AmlDecision {
  id: number; dossier_id: string; decided_at: number; decided_by: string; decision: 'approved' | 'hold'
  level: Level; note: string; enhanced_source: string | null; checks: string; facts_hash: string; policy_version: string
  by_name?: string | null
  bank_id?: string | null; bank_iban?: string | null; bank_country?: string | null; bank_owner?: string | null; bank_payment_ref?: string | null
}
export interface DossierView { dossier: Dossier; declaration: Declaration; checks: Verification[]; decision: AmlDecision | null; ready: boolean; declarationHash?: string; bankEvidence?: BankEvidence[] }
export interface Admission { dossierId: string; decisionId: number; factsHash: string; signerName: string; level: Level }

/** Every recorded result must still be the latest result of its kind, including within the same second. */
export function checksCurrentSql(subject: string, checks: string, facts: string): string {
  return AML_CHECK_KINDS.map((kind) => {
    const allowed = kind === 'pep' || kind === 'countries' ? "('clear','high')" : "('clear')"
    return `EXISTS (SELECT 1 FROM aml_checks k WHERE k.dossier_id = ${subject} AND k.kind = '${kind}'
      AND k.id = json_extract(${checks}, '$."${kind}"') AND k.id = (SELECT MAX(n.id) FROM aml_checks n WHERE n.dossier_id = ${subject} AND n.kind = '${kind}')
      AND k.facts_hash = ${facts} AND k.result IN ${allowed}${kind === 'identity' ? ` AND k.subject_name = (SELECT signer_name FROM aml_dossiers WHERE id = ${subject})` : ''})`
  }).join(' AND ')
}
export function riskFloorSql(dossier: string, level: string): string {
  return `(${level} = 'high' OR (${dossier}.required_risk <> 'high' AND NOT EXISTS
    (SELECT 1 FROM aml_checks k WHERE k.dossier_id = ${dossier}.id AND k.kind IN ('pep','countries') AND k.result = 'high'
      AND k.id = (SELECT MAX(n.id) FROM aml_checks n WHERE n.dossier_id = k.dossier_id AND n.kind = k.kind))
    AND (${dossier}.required_risk <> 'standard' OR ${level} <> 'low')))`
}
export function decisionCurrentSql(d = 'd', a = 'a', currentOfficer = true): string {
  return `${a}.decision = 'approved' AND ${a}.facts_hash = ${d}.facts_hash
    AND ${d}.policy_version = '${COUNTRY_POLICY_VERSION}' AND ${a}.policy_version = ${d}.policy_version
    ${currentOfficer ? `AND ${a}.decided_by = ${CURRENT_OFFICER_SQL}` : ''} AND ${a}.id = (SELECT MAX(z.id) FROM aml_decisions z WHERE z.dossier_id = ${d}.id)
    AND ${bankCurrentSql(d,a)} AND ${riskFloorSql(d, `${a}.level`)} AND ${checksCurrentSql(`${d}.id`, `${a}.checks`, `${d}.facts_hash`)}`
}
export function orderAdmissionSql(o = 'orders', dossier?: string, decision?: string): string {
  return `EXISTS (SELECT 1 FROM aml_dossiers ad JOIN aml_decisions aa ON aa.dossier_id = ad.id WHERE ad.order_id = ${o}.id
    AND NOT EXISTS (SELECT 1 FROM aml_prospect_reports pr WHERE pr.order_id = ${o}.id AND (pr.decided_at IS NULL OR pr.decision = 'reported'))
    AND ad.sequence = (SELECT MAX(n.sequence) FROM aml_dossiers n WHERE n.order_id = ${o}.id)
    ${dossier ? `AND ad.id = ${dossier}` : ''} ${decision ? `AND aa.id = ${decision}` : ''}
    AND json_extract(ad.company_facts, '$.ico') IS ${o}.ico AND json_extract(ad.company_facts, '$.name') IS ${o}.company
    AND json_extract(ad.company_facts, '$.address') IS ${o}.address AND json_extract(ad.company_facts, '$.register') IS ${o}.register_line
    AND json_extract(ad.company_facts, '$.directorsJson') IS ${o}.directors AND json_extract(ad.company_facts, '$.legalForm') IS COALESCE(${o}.legal_form,'sro')
    AND json_extract(ad.company_facts, '$.acting') IS ${o}.acting AND ${decisionCurrentSql('ad','aa')})`
}
export function companyDossierSql(c = 'c'): string {
  return `SELECT d.id FROM aml_dossiers d WHERE (d.company_id = ${c}.id OR d.id = ${c}.aml_dossier_id)
    AND json_extract(d.company_facts,'$.ico') IS ${c}.ico AND json_extract(d.company_facts,'$.name') IS ${c}.name
    AND json_extract(d.company_facts,'$.address') IS ${c}.address AND json_extract(d.company_facts,'$.legalForm') IS COALESCE(${c}.legal_form,'sro')
    AND d.declaration_id = (SELECT q.id FROM declarations q WHERE q.company_id = ${c}.id ORDER BY q.created_at DESC, q.rowid DESC LIMIT 1)
    ORDER BY d.sequence DESC LIMIT 1`
}
export function companyVerifiedSql(c = 'c'): string {
  return `EXISTS (SELECT 1 FROM aml_dossiers d JOIN aml_decisions a ON a.dossier_id = d.id WHERE d.id = (${companyDossierSql(c)}) AND ${decisionCurrentSql('d','a',false)})`
}

/** Calendar months, clamped at month end; the programme's annual or six-month review is not a fixed day count. */
export function reviewDueOn(day: string, level: Level): string {
  const [year, month, date] = day.split('-').map(Number) as [number, number, number]
  const moved = new Date(Date.UTC(year, month - 1 + (level === 'high' ? 6 : 12), 1))
  const last = new Date(Date.UTC(moved.getUTCFullYear(), moved.getUTCMonth() + 1, 0)).getUTCDate()
  moved.setUTCDate(Math.min(date, last))
  return moved.toISOString().slice(0, 10)
}

/** Historical completion supplies the review clock even while a new declaration or check is unresolved. */
export const companyDossiersSql = (c = 'c') => `SELECT ad.id FROM aml_dossiers ad LEFT JOIN orders ao ON ao.id = ad.order_id WHERE COALESCE(ad.company_id,ao.company_id) = ${c}.id`
export const lastCompanyReviewSql = (c = 'c') => `SELECT ar.id FROM aml_decisions ar WHERE ar.decision = 'approved' AND ar.dossier_id IN (${companyDossiersSql(c)}) ORDER BY ar.id DESC LIMIT 1`
