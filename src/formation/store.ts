import { now } from '../db'
import { BRAND } from '../config'
import { bell } from '../bell'
import type { Company, User } from '../app/store'
import { FORMATION_CONSENT, FORMATION_CONSENT_VERSION, emptySteps, isFormationState, mayMove, type FormationRequestValues, type FormationState, type FormationSteps } from './model'
import { formationOpenSql } from './schema'
import { accessOpenSql, amlToday } from '../aml/retention'

export interface FormationCase {
  id: string; companyId: string; createdAt: number; requesterName: string; contactName: string; contactEmail: string
  idea: string; state: FormationState; revision: number; updatedAt: number
  responsibleId: string | null; responsibleName: string | null; dueOn: string | null
  consentText: string; consentVersion: string; authorityReference: string
  publicNote: string; clientAction: string; steps: FormationSteps; completionSource: string | null; reason: string
}
type Row = Record<string, unknown>
function fromRow(r: Row): FormationCase {
  let steps = emptySteps()
  try { steps = { ...steps, ...JSON.parse(String(r.steps)) } } catch { /* Kept defaults for old/incomplete evidence. */ }
  return { id: String(r.id), companyId: String(r.company_id), createdAt: Number(r.created_at), requesterName: String(r.requester_name),
    contactName: String(r.contact_name), contactEmail: String(r.contact_email), idea: String(r.idea),
    state: r.state as FormationState, revision: Number(r.revision), updatedAt: Number(r.updated_at),
    responsibleId: r.responsible_id as string | null, responsibleName: r.responsible_name as string | null, dueOn: r.due_on as string | null,
    consentText: String(r.consent_text), consentVersion: String(r.consent_version), authorityReference: String(r.authority_reference),
    publicNote: String(r.public_note), clientAction: String(r.client_action), steps, completionSource: r.completion_source as string | null, reason: String(r.reason) }
}
export async function formationCase(db: D1Database, company: string, id?: string): Promise<FormationCase | null> {
  const r = await db.prepare(`SELECT f.*,u.name AS responsible_name FROM formation_cases f LEFT JOIN users u ON u.id = f.responsible_id
    WHERE f.company_id = ?1 ${id ? 'AND f.id = ?2' : "ORDER BY (f.state <> 'cancelled') DESC,f.created_at DESC,f.rowid DESC LIMIT 1"}`).bind(...(id ? [company, id] : [company])).first<Row>()
  return r ? fromRow(r) : null
}
export interface FormationQueueItem { companyId: string; companyName: string; state: FormationState; dueOn: string | null; responsibleName: string | null }
export async function formationQueue(db: D1Database, user: User, demo: boolean): Promise<FormationQueueItem[]> {
  if (!user.team) return []
  const rows = await db.prepare(`SELECT c.id,c.name,f.state,f.due_on,u.name AS responsible_name
    FROM formation_cases f JOIN companies c ON c.id = f.company_id LEFT JOIN users u ON u.id = f.responsible_id
    WHERE f.state NOT IN ('completed','cancelled') AND ${accessOpenSql('c')} ${demo ? '' : 'AND c.demo = 0'}
      AND (c.ends_on IS NULL OR c.ends_on >= ?) ${user.team === 'admin' ? '' : 'AND c.accountant_id = ?'}
    ORDER BY (f.due_on IS NOT NULL),f.due_on,f.created_at,c.id`).bind(...(user.team === 'admin' ? [amlToday()] : [amlToday(), user.id])).all<Row>()
  return rows.results.map(r => ({ companyId: String(r.id), companyName: String(r.name), state: r.state as FormationState, dueOn: r.due_on as string | null, responsibleName: r.responsible_name as string | null }))
}
export async function requestFormation(db: D1Database, company: Company, user: User, v: FormationRequestValues, id: string): Promise<boolean> {
  const at = now()
  const r = await db.prepare(`INSERT INTO formation_cases(id,company_id,created_at,created_by,requester_name,company_snapshot,consent_version,consent_text,contact_name,contact_email,idea,updated_at,updated_by)
    SELECT ?1,?2,?3,?4,?5,json_object('name',c.name,'ico',c.ico),?6,?7,?8,?9,?10,?3,?4 FROM companies c
    WHERE c.id = ?2 AND ${formationOpenSql('?2')}
      AND EXISTS (SELECT 1 FROM members WHERE company_id = ?2 AND user_id = ?4 AND role = 'owner')
      AND NOT EXISTS (SELECT 1 FROM formation_cases WHERE id = ?1 OR company_id = ?2 AND state <> 'cancelled')`)
    .bind(id, company.id, at, user.id, user.name, FORMATION_CONSENT_VERSION, FORMATION_CONSENT, v.name.trim(), v.email.toLowerCase(), v.idea.trim()).run()
  return (r.meta.changes ?? 0) > 0
}

export interface FormationUpdate {
  state: FormationState; due: string | null; authority: string; note: string; action: string
  steps: FormationSteps; reason: string
}
export async function updateFormation(db: D1Database, company: Company, user: User, h: FormationCase, v: FormationUpdate): Promise<string | null> {
  if (!isFormationState(v.state) || !mayMove(h.state, v.state)) return 'Tento prechod stavu nie je povolený. Obnovte stránku.'
  const at = now()
  const facts = { companyName: company.name, registeredOn: company.ico ?? null }
  const write = db.prepare(`UPDATE formation_cases SET state = ?1,updated_at = ?2,updated_by = ?3,responsible_id = ?4,due_on = ?5,
      authority_reference = ?6,public_note = ?7,client_action = ?8,steps = ?9,completion_source = ?10,reason = ?11
    WHERE id = ?12 AND company_id = ?13 AND revision = ?14 AND ${formationOpenSql('?13')}
      AND EXISTS (SELECT 1 FROM companies WHERE id = ?13 AND accountant_id = ?4)
      AND EXISTS (SELECT 1 FROM users WHERE id = ?4 AND team IN ('accountant','admin'))
      AND EXISTS (SELECT 1 FROM users u JOIN companies c ON c.id = ?13 WHERE u.id = ?3 AND (u.team = 'admin' OR u.team = 'accountant' AND c.accountant_id = u.id))`)
    .bind(v.state, at, user.id, company.accountantId, v.due, v.authority, v.note, v.action, JSON.stringify(v.steps), v.state === 'completed' ? JSON.stringify(facts) : null, v.reason, h.id, company.id, h.revision)
  const statements = [write]
  if (v.action && v.action !== h.clientAction && v.state !== 'cancelled' && v.state !== 'completed') {
    const notice = bell.managedTakeoverQuestion(`${BRAND.origin}/app/zalozenie`)
    statements.push(db.prepare(`INSERT OR IGNORE INTO outbox(id,recipient,reply_to,subject,body,created_at)
      SELECT ?1 || u.id,u.email,?2,?3,?4,?5 FROM members m JOIN users u ON u.id = m.user_id
      WHERE m.company_id = ?6 AND changes() > 0`)
      .bind(`bell:formation:${h.id}:${h.revision + 1}:`, BRAND.email, notice.subject, notice.body, at, company.id))
  }
  try {
    const [r] = await db.batch(statements)
    return (r?.meta.changes ?? 0) > 0 ? null : 'Žiadosť alebo podklady sa medzitým zmenili. Obnovte stránku; tento pokus nič neprepísal.'
  } catch { return 'Uloženie nemáme potvrdené. Obnovte stránku a skontrolujte aktuálny stav.' }
}
export async function cancelFormation(db: D1Database, company: string, user: string, id: string, revision: number): Promise<boolean> {
  const r = await db.prepare(`UPDATE formation_cases SET state = 'cancelled',revision = revision + 1,updated_at = ?,updated_by = ?,client_action = '',reason = 'Klient zrušil koordináciu založenia.'
    WHERE company_id = ? AND id = ? AND revision = ? AND state NOT IN ('cancelled','completed') AND ${formationOpenSql('company_id')}
      AND EXISTS (SELECT 1 FROM members m WHERE m.company_id = formation_cases.company_id AND m.user_id = ? AND m.role = 'owner')`).bind(now(), user, company, id, revision, user).run()
  return (r.meta.changes ?? 0) > 0
}

