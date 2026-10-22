import { now } from '../db'
import { BRAND, OPERATOR } from '../config'
import { dataRevision } from '../app/handover-store'
import type { Company, User } from '../app/store'
import { HANDOVER_CONSENT, HANDOVER_CONSENT_VERSION, AREA_KEYS, emptyChecks, handoverDay, handoverText, isHandoverState, mayMove, type HandoverChecks, type HandoverRequestValues, type HandoverState } from './model'
import { handoverOpenSql } from './schema'
import { accessOpenSql, amlToday } from '../aml/retention'

export interface ManagedHandover {
  id: string; companyId: string; createdAt: number; requesterName: string; contactName: string; contactEmail: string; requestedOn: string | null
  state: HandoverState; revision: number; updatedAt: number; responsibleId: string | null; responsibleName: string | null; dueOn: string | null
  consentText: string; consentVersion: string; authorityReference: string; contactReference: string; contactOn: string | null
  publicNote: string; clientAction: string; checks: HandoverChecks; completionSource: string | null; reason: string
}
type Row = Record<string, unknown>
function fromRow(r: Row): ManagedHandover {
  let checks = emptyChecks()
  try { checks = { ...checks, ...JSON.parse(String(r.checks)) } } catch { /* Kept defaults for old/incomplete evidence. */ }
  return { id: String(r.id), companyId: String(r.company_id), createdAt: Number(r.created_at), requesterName: String(r.requester_name), contactName: String(r.contact_name), contactEmail: String(r.contact_email), requestedOn: r.requested_on as string | null,
    state: r.state as HandoverState, revision: Number(r.revision), updatedAt: Number(r.updated_at), responsibleId: r.responsible_id as string | null, responsibleName: r.responsible_name as string | null, dueOn: r.due_on as string | null,
    consentText: String(r.consent_text), consentVersion: String(r.consent_version), authorityReference: String(r.authority_reference), contactReference: String(r.contact_reference), contactOn: r.contact_on as string | null,
    publicNote: String(r.public_note), clientAction: String(r.client_action), checks, completionSource: r.completion_source as string | null, reason: String(r.reason) }
}
export async function managedHandover(db: D1Database, company: string, id?: string): Promise<ManagedHandover | null> {
  const r = await db.prepare(`SELECT h.*,u.name AS responsible_name FROM managed_handovers h LEFT JOIN users u ON u.id = h.responsible_id
    WHERE h.company_id = ?1 ${id ? 'AND h.id = ?2' : "ORDER BY (h.state <> 'cancelled') DESC,h.created_at DESC,h.rowid DESC LIMIT 1"}`).bind(...(id ? [company,id] : [company])).first<Row>()
  return r ? fromRow(r) : null
}
export interface HandoverQueueItem { companyId:string; companyName:string; state:HandoverState; dueOn:string|null; responsibleName:string|null }
export async function managedHandoverQueue(db: D1Database, user: User, demo: boolean): Promise<HandoverQueueItem[]> {
  if (!user.team) return []
  const rows = await db.prepare(`SELECT c.id,c.name,h.state,h.due_on,u.name AS responsible_name
    FROM managed_handovers h JOIN companies c ON c.id = h.company_id LEFT JOIN users u ON u.id = h.responsible_id
    WHERE h.state NOT IN ('completed','cancelled') AND ${accessOpenSql('c')} ${demo ? '' : 'AND c.demo = 0'}
      AND (c.ends_on IS NULL OR c.ends_on >= ?) ${user.team === 'admin' ? '' : 'AND c.accountant_id = ?'}
    ORDER BY (h.due_on IS NOT NULL),h.due_on,h.created_at,c.id`).bind(...(user.team === 'admin' ? [amlToday()] : [amlToday(),user.id])).all<Row>()
  return rows.results.map(r => ({companyId:String(r.id),companyName:String(r.name),state:r.state as HandoverState,dueOn:r.due_on as string|null,responsibleName:r.responsible_name as string|null}))
}
export async function handoverHistory(db: D1Database, company: string, id: string) {
  const r = await db.prepare('SELECT revision,at,by_name,data FROM managed_handover_history WHERE company_id = ? AND case_id = ? ORDER BY revision DESC').bind(company,id).all<{revision:number;at:number;by_name:string;data:string}>()
  return r.results
}
export async function requestHandover(db: D1Database, company: Company, user: User, id: string, v: HandoverRequestValues): Promise<boolean> {
  const at = now()
  // A durable submission id plus the partial unique index protect retries, including concurrent requests.
  const r = await db.prepare(`INSERT INTO managed_handovers(id,company_id,created_at,created_by,requester_name,company_snapshot,consent_version,consent_text,contact_name,contact_email,requested_on,updated_at,updated_by,checks)
    SELECT ?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?3,?4,?12
    WHERE ${handoverOpenSql('?2')} AND EXISTS (SELECT 1 FROM members WHERE company_id = ?2 AND user_id = ?4 AND role = 'owner')
      AND NOT EXISTS (SELECT 1 FROM managed_handovers WHERE id = ?1 OR company_id = ?2 AND state <> 'cancelled')`)
    .bind(id,company.id,at,user.id,user.name,JSON.stringify({name:company.name,ico:company.ico,address:company.address,startOn:company.startOn}),HANDOVER_CONSENT_VERSION,HANDOVER_CONSENT,v.name.trim(),v.email.toLowerCase(),v.day || null,JSON.stringify(emptyChecks())).run()
  return (r.meta.changes ?? 0) > 0
}
export interface HandoverUpdate { state: string; due: string; authority: string; contact: string; contactOn: string; note: string; action: string; reason: string; checks: HandoverChecks; sourceRevision: number }
export async function completionFacts(db: D1Database, company: string) {
  const [files, opening] = await Promise.all([
    db.prepare("SELECT id,file_name,r2_key,file_size FROM company_files WHERE company_id = ? AND kind = 'takeover' AND deleted_at IS NULL ORDER BY id").bind(company).all<{id:string;file_name:string;r2_key:string;file_size:number}>(),
    db.prepare("SELECT id,on_date,lines,created_at,created_by FROM ledger_entries WHERE company_id = ? AND kind = 'opening' AND deleted_at IS NULL ORDER BY id").bind(company).all<Row>(),
  ])
  return { files: files.results, opening: opening.results }
}
export async function updateHandover(db: D1Database, company: Company, user: User, h: ManagedHandover, v: HandoverUpdate, today: string): Promise<string | null> {
  const state = v.state
  if (!isHandoverState(state) || !mayMove(h.state,state)) return 'Tento prechod stavu nie je možný. Obnovte stránku a pokračujte od aktuálneho kroku.'
  if (!v.reason || !handoverText(v.reason,1000) || v.reason.length < 10) return 'Zapíšte dôvod alebo výsledok zmeny aspoň desiatimi znakmi.'
  if (handoverText(v.note,1000) === null || handoverText(v.action,1000) === null) return 'Text pre klienta obsahuje nepodporované znaky alebo je príliš dlhý.'
  if (!company.accountantId || !company.accountantName) return 'Najprv firme priraďte účtovníčku. Tá bude zodpovedať za prevzatie.'
  if (!handoverDay(v.due)) return 'Vyberte platný termín ďalšieho kroku Firmony.'
  if (state !== 'requested' && state !== 'cancelled' && (!handoverText(v.authority,1000) || v.authority.length < 10)) return 'Zapíšte overené oprávnenie, jeho rozsah a príslušný podklad. Samotná žiadosť nenahrádza plnomocenstvo.'
  if (['waiting','reviewing','completed'].includes(state) && (!handoverText(v.contact,1000) || v.contact.length < 10 || !handoverDay(v.contactOn) || v.contactOn > today)) return 'Zapíšte dátum skutočného kontaktovania a dôkaz, napríklad identifikátor odoslaného e-mailu. Pripravený text nie je odoslanie.'
  const sourceRevision = await dataRevision(db,company.id)
  const facts = await completionFacts(db,company.id)
  if (['reviewing','completed'].includes(state) && facts.files.length === 0) return 'Najprv prijmite a uložte podklady od doterajšej účtovníčky.'
  if (state === 'completed') {
    if (v.sourceRevision !== sourceRevision) return 'Podklady sa od otvorenia stránky zmenili. Obnovte stránku a skontrolujte ich aktuálnu verziu.'
    if (v.action) return 'Najprv vybavte a vymažte zostávajúcu požiadavku na klienta.'
    for (const k of AREA_KEYS) {
      const c = v.checks[k]
      if (c.result === 'pending' || c.note.length < 10) return 'Každá oblasť potrebuje výsledok a konkrétny záznam kontroly; pri nepoužitej oblasti vysvetlite dôvod.'
      if (k === 'books' && c.result !== 'received') return 'Účtovné knihy a obratovú predvahu treba prevziať a skontrolovať.'
      if (c.result === 'received' && !facts.files.some(f => f.id === c.file)) return 'Ku každej prevzatej oblasti vyberte jej uložený podklad patriaci tejto firme.'
      if (k === 'opening' && c.result === 'received' && facts.opening.length === 0) return 'Počiatočné stavy najprv uložte a overte v účtovnej knihe.'
    }
  }
  const at = now()
  const r = await db.prepare(`UPDATE managed_handovers SET state = ?1,revision = revision + 1,updated_at = ?2,updated_by = ?3,responsible_id = ?4,due_on = ?5,
    authority_reference = ?6,contact_reference = ?7,contact_on = ?8,public_note = ?9,client_action = ?10,checks = ?11,completion_source = ?12,reason = ?13
    WHERE id = ?14 AND company_id = ?15 AND revision = ?16 AND ${handoverOpenSql('?15')}
      AND EXISTS (SELECT 1 FROM companies WHERE id = ?15 AND accountant_id = ?4)
      AND EXISTS (SELECT 1 FROM users WHERE id = ?4 AND team IN ('accountant','admin'))
      AND EXISTS (SELECT 1 FROM users u JOIN companies c ON c.id = ?15 WHERE u.id = ?3 AND (u.team = 'admin' OR u.team = 'accountant' AND c.accountant_id = u.id))
      AND COALESCE((SELECT revision FROM company_data_revisions WHERE company_id = ?15),0) = ?17`)
    .bind(state,at,user.id,company.accountantId,v.due,v.authority,v.contact,v.contactOn || null,v.note,v.action,JSON.stringify(v.checks),state === 'completed' ? JSON.stringify(facts) : null,v.reason,h.id,company.id,h.revision,sourceRevision).run()
  return (r.meta.changes ?? 0) > 0 ? null : 'Žiadosť alebo podklady sa medzitým zmenili. Obnovte stránku; tento pokus nič neprepísal.'
}
export async function cancelHandover(db: D1Database, company: string, user: string, id: string, revision: number): Promise<boolean> {
  const r = await db.prepare(`UPDATE managed_handovers SET state = 'cancelled',revision = revision + 1,updated_at = ?,updated_by = ?,client_action = '',reason = 'Klient odvolal koordináciu prevzatia.'
    WHERE company_id = ? AND id = ? AND revision = ? AND state NOT IN ('cancelled','completed') AND ${handoverOpenSql('company_id')}
      AND EXISTS (SELECT 1 FROM members m WHERE m.company_id = managed_handovers.company_id AND m.user_id = ? AND m.role = 'owner')`).bind(now(),user,company,id,revision,user).run()
  return (r.meta.changes ?? 0) > 0
}
/** A preview for a human to send only after checking authority. This function sends nothing. */
export function handoverContactText(company: Company, h: ManagedHandover): string {
  return [`Dobrý deň, ${h.contactName},`,'',`spoločnosť ${company.name}, IČO ${company.ico ?? 'neuvedené'}, nás požiadala o koordináciu prevzatia svojho účtovníctva. Službu Firmony poskytuje ${OPERATOR.name}.`,
    `Prosíme o dohodnutie rozsahu podkladov a bezpečného spôsobu ich odovzdania${h.requestedOn ? `; požadovaný deň prevzatia je ${h.requestedOn}` : ''}. Zoznam zahŕňa účtovné knihy a predvahu, otvorené pohľadávky a záväzky, bankové a pokladničné zostatky, podľa situácie majetok, zásoby, mzdy a podania s potvrdeniami.`,
    '','Táto správa nie je výpoveďou Vašej zmluvy. Pred odovzdaním overte oprávnenie na prevzatie a rozsah dokumentácie. Citlivé podklady neposielajte bežnou odpoveďou; najprv dohodnime bezpečné odovzdanie.','',`Kontakt Firmony: ${BRAND.email}`,'Firmony'].join('\n')
}
