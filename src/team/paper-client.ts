// A client made with a contract signed on paper (17 October 2026; at a meeting since 29 October 2026, meeting/): only
// after the designated person approved the identification of its order (§ 8 ods. 2 of Act 297/2008, programme 4.3). One
// batch writes the company, the director's account as its owner, the declaration and the risk that were approved, the
// price list of the day and what happened; every statement after the first runs only when the first closed the order
// with this company at this moment, so a second click, an expired order or a newer identification writes nothing.
import { OFFLINE_TERMS } from '../config'
import { now } from '../db'
import { orderAdmissionSql, quoteSql, type Admission } from '../aml/model'
import type { Order } from '../order'
import { inboxCode } from './store'
import { paperTariffStatement } from './billing-store'

export interface PaperClient {
  order: Order
  admission: Admission
  name: string
  ico: string | null
  address: string | null
  person: string
  email: string
  plan: string
  vat: boolean
  accountant: string | null
  request: string | null
  start: string
  legalForm: string | null
  role: string | null
  registerLine: string | null
  /** The photo of the contract both signed at a meeting, already stored under the order. */
  paper?: { key: string; type: string; sha256: string; bytes: number } | null
}

export async function paperClientBatch(db: D1Database, by: string, client: PaperClient, existingUser: string | null): Promise<{ companyId: string; userId: string; statements: D1PreparedStatement[] }> {
  const { order, admission } = client
  const companyId = crypto.randomUUID()
  const userId = existingUser ?? crypto.randomUUID()
  const ts = now()
  let inbox = inboxCode()
  for (let i = 0; i < 5 && (await db.prepare('SELECT 1 AS x FROM companies WHERE inbox = ?').bind(inbox).first()); i++) inbox = inboxCode()
  const mine = `EXISTS (SELECT 1 FROM orders WHERE id = ${quoteSql(order.id)} AND company_id = ${quoteSql(companyId)} AND accepted_at = ${ts})`
  const paper = client.paper ?? null
  const statements: D1PreparedStatement[] = [
    db.prepare(`UPDATE orders SET status = 'accepted', company_id = ?1, accepted_at = ?2, signed_by = ?3, terms_version = '${OFFLINE_TERMS}', start_on = ?4,
        paper_key = COALESCE(?7, paper_key), paper_type = COALESCE(?8, paper_type), paper_sha256 = COALESCE(?9, paper_sha256), paper_bytes = COALESCE(?10, paper_bytes)
      WHERE id = ?5 AND status = 'open' AND expires_at > ?2 AND ${orderAdmissionSql('orders', quoteSql(admission.dossierId), String(admission.decisionId))}
      AND EXISTS (SELECT 1 FROM users WHERE id = ?6 AND team = 'admin')`)
      .bind(companyId, ts, admission.signerName, client.start, order.id, by, paper?.key ?? null, paper?.type ?? null, paper?.sha256 ?? null, paper?.bytes ?? null),
    db.prepare(`INSERT INTO companies (id, created_at, name, ico, address, vat_payer, plan, inbox, accountant_id, request_id, contract_at, terms_version, signed_by, start_on, legal_form, signed_role, register_line, aml_dossier_id)
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '${OFFLINE_TERMS}', ?, ?, ?, ?, ?, ? WHERE ${mine}`)
      .bind(companyId, ts, client.name, client.ico, client.address || null, client.vat ? 1 : 0, client.plan, inbox, client.accountant || null, client.request || null, ts, client.person, client.start, client.legalForm || null, client.role || null, client.registerLine, admission.dossierId),
    ...(existingUser ? [] : [db.prepare(`INSERT INTO users (id, created_at, email, name) SELECT ?, ?, ?, ? WHERE ${mine}`).bind(userId, ts, client.email, client.person)]),
    db.prepare(`INSERT OR IGNORE INTO members (company_id, user_id, role, created_at, invited_by) SELECT ?, ?, 'owner', ?, ? WHERE ${mine}`).bind(companyId, userId, ts, by),
    db.prepare(`INSERT INTO events (at, company_id, user_id, action, subject, detail) SELECT ?, ?, ?, 'company.created', NULL, ? WHERE ${mine}`)
      .bind(ts, companyId, by, JSON.stringify({ request: client.request || null, ...(order.meetingBy ? { meeting: order.id, paper: paper?.sha256 ?? null } : {}) })),
    db.prepare(`INSERT INTO declarations (id, company_id, created_at, created_by, data, checked_at, checked_by)
      SELECT d.declaration_id, ?1, d.created_at, ?2, d.declaration, a.decided_at, a.decided_by FROM aml_dossiers d JOIN aml_decisions a ON a.dossier_id = d.id
      WHERE d.id = ?3 AND a.id = ?4 AND ${mine}`).bind(companyId, userId, admission.dossierId, admission.decisionId),
    db.prepare(`INSERT INTO risks (id, company_id, created_at, created_by, level, note) SELECT ?1, ?2, a.decided_at, a.decided_by, a.level, a.note FROM aml_decisions a WHERE a.id = ?3 AND ${mine}`)
      .bind(crypto.randomUUID(), companyId, admission.decisionId),
    // The price list of the day the paper contract was signed: what the client is billed by (billing-store.ts).
    paperTariffStatement(db, companyId, by, mine),
  ]
  if (client.request) statements.push(db.prepare(`UPDATE requests SET status = 'client' WHERE id = ? AND ${mine}`).bind(client.request))
  return { companyId, userId, statements }
}
