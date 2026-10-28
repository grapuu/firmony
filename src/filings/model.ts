// External delivery is independent of accounting calculations and the internal preparation of their files.
export const FILING_KINDS = {
  vat: 'Priznanie k DPH',
  kv: 'Kontrolný výkaz DPH',
  sv: 'Súhrnný výkaz',
  dppo: 'Daňové priznanie právnickej osoby',
  uz: 'Účtovná závierka',
} as const
export type FilingType = keyof typeof FILING_KINDS
export type DeliveryState = 'prepared' | 'submitted' | 'accepted' | 'rejected' | 'review'
export type DeliveryStatus = DeliveryState | 'unverified'
export const DELIVERY_LABELS: Record<DeliveryStatus, string> = {
  unverified: 'Prijatie nedoložené',
  prepared: 'Podklady pripravené',
  submitted: 'Odoslanie evidované, čaká potvrdenie',
  accepted: 'Prijatie podateľňou doložené',
  rejected: 'Podateľňa podanie odmietla',
  review: 'Potvrdenie treba preveriť',
}
/** The same states in a client's words: what is happening with the filing, without the register's terms. */
export const CLIENT_DELIVERY_LABELS: Record<DeliveryStatus, string> = {
  unverified: 'Podané',
  prepared: 'Pripravujeme podanie',
  submitted: 'Podané, čakáme na potvrdenie',
  accepted: 'Podané a prijaté',
  rejected: 'Vrátené úradom, riešime to',
  review: 'Overujeme potvrdenie',
}
export const DELIVERY_TONE: Record<DeliveryStatus, string> = { unverified: 'amber', prepared: 'blue', submitted: 'blue', accepted: 'ok', rejected: 'red', review: 'red' }
export const TRANSITIONS: Record<DeliveryState, readonly DeliveryState[]> = {
  prepared: ['submitted', 'accepted', 'rejected'], submitted: ['accepted', 'rejected'], accepted: ['review'], rejected: ['submitted', 'accepted'], review: ['accepted', 'rejected'],
}
export interface FilingFile { name: string; xml: string; sha256: string; attemptId?: string }
export interface FilingPackage {
  id: string; company_id: string; kind: FilingType; period: string; name: string; xml: string; sha256: string
  created_at: number; created_by: string; status: DeliveryState; revision: number; updated_at: number; updated_by: string; last_event: string | null
}
export interface FilingEvent {
  id: string; package_id: string; company_id: string; revision: number; at: number; by_user: string
  from_state: DeliveryState; to_state: DeliveryState; external_on: string; reference: string; reason: string; channel: string
  file_key: string | null; file_name: string | null; file_type: string | null; file_bytes: number | null; file_sha256: string | null
  by_name?: string
}
export function isFilingType(value: unknown): value is FilingType { return typeof value === 'string' && Object.hasOwn(FILING_KINDS, value) }
export function isDeliveryState(value: unknown): value is DeliveryState { return typeof value === 'string' && Object.hasOwn(TRANSITIONS, value) }
export function canTransition(from: DeliveryState, to: DeliveryState, admin: boolean): boolean {
  return TRANSITIONS[from].includes(to) && ((from !== 'accepted' && from !== 'review') || admin)
}
export function deliveryIds(value: unknown): Partial<Record<FilingType, string>> {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return Object.fromEntries(Object.entries(parsed).filter(([k, v]) => isFilingType(k) && typeof v === 'string' && /^[A-Za-z0-9-]{1,64}$/.test(v)))
  } catch { return {} }
}
export const safeJson = (expression: string, path: string) => `json_extract(CASE WHEN json_valid(${expression}) THEN ${expression} ELSE '{}' END, '${path}')`
export const quarterLastSql = (period: string) => `substr(${period}, 1, 4) || printf('-%02d', CAST(substr(${period}, 7, 1) AS INTEGER) * 3)`

/** The accounting snapshot chooses the current version; history alone cannot make an obsolete draft current. */
export function filingSourceSql(id: string, company: string, kind: FilingType, period: string): string {
  if (kind === 'vat' || kind === 'kv') return `SELECT 1 FROM vat_returns WHERE company_id = ${company} AND period = ${period} AND ${safeJson('delivery', `$.${kind}`)} = ${id}`
  if (kind === 'sv') return `SELECT 1 FROM filings WHERE company_id = ${company} AND kind = 'sv' AND ${safeJson('data', '$.file.attemptId')} = ${id}
    AND (period = ${period} OR (${period} GLOB '[12][0-9][0-9][0-9]-Q[1-4]' AND ${safeJson('data', '$.sourcePeriod')} = ${period} AND period = ${quarterLastSql(period)}))`
  return `SELECT 1 FROM closings WHERE company_id = ${company} AND CAST(year AS TEXT) = ${period} AND ${safeJson('filed', kind === 'dppo' ? '$.files.return.attemptId' : '$.files.statements.attemptId')} = ${id}`
}
export function activePackageSql(alias = 'p'): string {
  return `CASE ${alias}.kind ${Object.keys(FILING_KINDS).map((kind) => `WHEN '${kind}' THEN EXISTS (${filingSourceSql(`${alias}.id`, `${alias}.company_id`, kind as FilingType, `${alias}.period`)})`).join(' ')} ELSE 0 END`
}
export const pendingFilingsSql = (company: string) => `EXISTS (SELECT 1 FROM filing_packages fp WHERE fp.company_id = ${company} AND fp.status <> 'accepted' AND (${activePackageSql('fp')}))`

export function isFilingSent(error: unknown): boolean {
  const seen = new Set<unknown>()
  let e = error
  while (e && !seen.has(e)) {
    seen.add(e)
    if (String(e).includes('FIRMONY_FILING_SENT')) return true
    e = typeof e === 'object' && 'cause' in e ? e.cause : null
  }
  return false
}

/** Require all applicable forms, scoped to the same company; a missing receipt never counts as acceptance. */
export function deliveryStatusSql(company: string, ids: string[], required: string[] = ids.map(() => '1')): string {
  const sources = ids.map((id, i) => `SELECT ${id} AS id, ${required[i] ?? '1'} AS needed`).join(' UNION ALL ')
  return `(SELECT CASE WHEN SUM(CASE WHEN q.needed AND p.status = 'review' THEN 1 ELSE 0 END) > 0 THEN 'review'
    WHEN SUM(CASE WHEN q.needed AND p.status = 'rejected' THEN 1 ELSE 0 END) > 0 THEN 'rejected'
    WHEN SUM(CASE WHEN q.needed AND p.id IS NULL THEN 1 ELSE 0 END) > 0 THEN 'unverified'
    WHEN SUM(CASE WHEN q.needed AND p.status <> 'accepted' THEN 1 ELSE 0 END) = 0 THEN 'accepted'
    WHEN SUM(CASE WHEN q.needed AND p.status = 'submitted' THEN 1 ELSE 0 END) > 0 THEN 'submitted' ELSE 'prepared' END
    FROM (${sources}) q LEFT JOIN filing_packages p ON p.id = q.id AND p.company_id = ${company})`
}
export function revisableSql(company: string, ids: string[], required: string[] = ids.map(() => '1')): string {
  const sources = ids.map((id, i) => `SELECT ${id} AS id, ${required[i] ?? '1'} AS needed`).join(' UNION ALL ')
  return `(SELECT SUM(CASE WHEN q.needed AND (p.id IS NULL OR p.status NOT IN ('prepared', 'rejected')) THEN 1 ELSE 0 END) = 0
    FROM (${sources}) q LEFT JOIN filing_packages p ON p.id = q.id AND p.company_id = ${company})`
}

export interface FilingWorkItem {
  id: string; company_id: string; company_name: string; period: string; status: DeliveryStatus; created_at: number
  kind: FilingType | null; label: string | null; href: string | null
}
