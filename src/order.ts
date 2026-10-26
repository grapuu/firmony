import { orderAdmissionSql, quoteSql } from './aml/model'
// The order a request becomes when the register knows its company as an s. r. o., an a. s. or a j. s. a.: a link to it
// goes by email to the address that was typed (so whoever opens it can read that mailbox), and a member of the
// statutory body the register names, who may act for it alone, accepts the terms there. Accepting creates the company, the person's account and their membership in one batch, keeps who
// accepted which version when, and is done once: the UPDATE that closes the order is the first statement of the
// batch and the rest only happens when it found the order open. Since 26 October 2026 the order closes only on the
// offer the identified person accepted in the declaration signed with a qualified signature (the plan, the first month
// and the terms' version in its `contract`), so whoever holds the emailed link concludes nothing else in that name.
import { ORDER, TERMS_VERSION, planById, type PlanId } from './config'
import { now, sha256Hex } from './db'
import { isLegalForm, type Director, type LegalForm } from './rpo'
import { contractSnapshot, type ContractApproval } from './contracts'

export interface Order {
  id: string
  createdAt: number
  expiresAt: number
  requestId: string | null
  ico: string
  company: string
  address: string | null
  registerLine: string | null
  /** The directors the register named when the request came, or null when it could not be asked. */
  directors: Director[] | null
  /** The legal form (null for an order made before it was kept: an s. r. o.), and how the statutory body acts. */
  legalForm: LegalForm | null
  acting: string | null
  amlPaper?: boolean
  directorsJson?: string | null
  tokenHash?: string | null
  plan: string
  person: string
  email: string
  phone: string | null
  status: 'open' | 'accepted' | 'expired'
  acceptedAt: number | null
  signedBy: string | null
  signedRole: string | null
  startOn: string | null
  priceCents: number | null
  termsVersion: string | null
  companyId: string | null
}

type Row = Record<string, unknown>
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null)
const num = (v: unknown): number | null => (typeof v === 'number' ? v : null)

function directorsOf(value: unknown): Director[] | null {
  if (typeof value !== 'string') return null
  try {
    const list = JSON.parse(value)
    return Array.isArray(list) ? list.filter((d) => typeof d?.name === 'string').map((d) => ({ name: String(d.name), role: String(d.role ?? 'Konateľ') })) : null
  } catch {
    return null
  }
}

export function orderOf(row: Row): Order {
  const status = str(row.status)
  const expires = num(row.expires_at) ?? 0
  return {
    id: String(row.id),
    createdAt: num(row.created_at) ?? 0,
    expiresAt: expires,
    requestId: str(row.request_id),
    ico: String(row.ico),
    company: String(row.company),
    address: str(row.address),
    registerLine: str(row.register_line),
    directors: directorsOf(row.directors),
    legalForm: isLegalForm(row.legal_form) ? row.legal_form : null,
    acting: str(row.acting),
    amlPaper: row.aml_paper === 1,
    directorsJson: str(row.directors),
    tokenHash: str(row.token),
    plan: String(row.plan),
    person: String(row.person),
    email: String(row.email),
    phone: str(row.phone),
    status: status === 'accepted' ? 'accepted' : status === 'open' && expires > now() ? 'open' : 'expired',
    acceptedAt: num(row.accepted_at),
    signedBy: str(row.signed_by),
    signedRole: str(row.signed_role),
    startOn: str(row.start_on),
    priceCents: num(row.price_cents),
    termsVersion: str(row.terms_version),
    companyId: str(row.company_id),
  }
}

const TOKEN = /^[A-Za-z0-9_-]{43}$/

export async function orderByToken(db: D1Database, token: string): Promise<Order | null> {
  if (!TOKEN.test(token)) return null
  const row = await db.prepare('SELECT * FROM orders WHERE token = ?').bind(await sha256Hex(token)).first<Row>()
  return row ? orderOf(row) : null
}

export interface NewOrder {
  requestId: string
  ico: string
  company: string
  address: string | null
  registerLine: string | null
  directors: Director[] | null
  legalForm: LegalForm | null
  acting: string | null
  plan: string
  person: string
  email: string
  phone: string | null
}

/** The statement that writes an order down, and the token for its link (only its hash is kept). */
export async function newOrderStatement(db: D1Database, token: string, o: NewOrder): Promise<D1PreparedStatement> {
  const ts = now()
  return db
    .prepare(
      `INSERT INTO orders (id, token, created_at, expires_at, request_id, ico, company, address, register_line, directors, plan, person, email, phone, legal_form, acting)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(crypto.randomUUID(), await sha256Hex(token), ts, ts + ORDER.days * 86400, o.requestId, o.ico, o.company, o.address, o.registerLine, o.directors ? JSON.stringify(o.directors) : null, o.plan, o.person, o.email, o.phone, o.legalForm, o.acting)
}

/** The newest order made from a request from the site, or null. */
export async function latestOrderOfRequest(db: D1Database, requestId: string): Promise<Order | null> {
  const row = await db.prepare('SELECT * FROM orders WHERE request_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1').bind(requestId).first<Row>()
  return row ? orderOf(row) : null
}

/**
 * An order that lapsed before its review was done gets another ORDER.days, for the same company and director; the
 * review and the link to the contract are made again (a new token, so a link sent before opens nothing). Not one that
 * was accepted, nor for a company that is a client.
 */
export function renewOrderStatement(db: D1Database, orderId: string, ts: number, tokenHash: string): D1PreparedStatement {
  return db
    .prepare(
      `UPDATE orders SET expires_at = ?2 + ?3, token = ?4 WHERE id = ?1 AND status = 'open' AND expires_at <= ?2 AND aml_delete_started_at IS NULL
         AND NOT EXISTS (SELECT 1 FROM companies c WHERE c.ico = orders.ico AND c.closed_at IS NULL AND c.demo = 0 AND c.operator = 0 AND c.invoicing_only = 0)`,
    )
    .bind(orderId, ts, ORDER.days * 86400, tokenHash)
}

/** Whether a company with this IČO is already a client (a second contract for it is not taken online). */
export async function isClient(db: D1Database, ico: string): Promise<boolean> {
  // europio, which issues Firmony's invoices, keeps its own books in the app, and is no client of itself; a workspace of
  // invoicing alone (app/invoicing.ts) is nobody's contract.
  return Boolean(await db.prepare('SELECT 1 AS x FROM companies WHERE ico = ? AND closed_at IS NULL AND demo = 0 AND operator = 0 AND invoicing_only = 0').bind(ico).first())
}

export interface Acceptance {
  plan: PlanId
  startOn: string
  /** The director who accepted, as the register names them (or as typed when the register named nobody), and their role. */
  signedBy: string
  signedRole: string | null
  ipHash: string
  approval: ContractApproval
}

export interface Accepted {
  companyId: string
  userId: string
  inbox: string
  /** The statements to run in one batch; the first closes the order and the others depend on it. */
  statements: D1PreparedStatement[]
}

/**
 * Everything that accepting an order writes. Each statement after the first runs only while the order is
 * accepted by this very acceptance (its id, its company and its time), so a second acceptance at the same moment,
 * or one of an order that is no longer open, writes nothing.
 */
export async function acceptStatements(db: D1Database, order: Order, a: Acceptance, ids: { companyId: string; userId: string; existingUser: boolean; inbox: string }): Promise<Accepted> {
  const ts = now()
  const aml = a.approval.aml
  if (!aml || a.signedBy !== aml.signerName) throw new Error('Verified AML admission for the signer is required')
  const plan = planById(a.plan)
  const priceCents = Math.round((plan?.price ?? 0) * 100)
  const frozen = await contractSnapshot(order, a, ids.companyId, ts, a.approval)
  // ?1 the order, ?2 the company this acceptance creates, ?3 its time: only the acceptance that closed the order
  // finds all three on it.
  const mine = 'EXISTS (SELECT 1 FROM orders WHERE id = ?1 AND company_id = ?2 AND accepted_at = ?3)'
  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `UPDATE orders SET status = 'accepted', accepted_at = ?3, company_id = ?2, signed_by = ?4, start_on = ?5, price_cents = ?6, terms_version = ?7, ip_hash = ?8, plan = ?9, signed_role = ?12
         WHERE id = ?1 AND status = 'open' AND expires_at > ?3
           AND ${orderAdmissionSql('orders', quoteSql(aml.dossierId), String(aml.decisionId))}
           AND EXISTS (SELECT 1 FROM aml_dossiers sd WHERE sd.id = ${quoteSql(aml.dossierId)} AND json_extract(sd.declaration, '$.contract.plan') IS ?9
             AND json_extract(sd.declaration, '$.contract.startOn') IS ?5 AND json_extract(sd.declaration, '$.contract.terms') IS ?7)
           AND EXISTS (SELECT 1 FROM order_reviews r JOIN users u ON u.id = r.accountant_id
             WHERE r.order_id = ?1 AND r.id = ?10 AND r.id = (SELECT MAX(id) FROM order_reviews WHERE order_id = ?1)
               AND r.decision = 'standard' AND r.offer_hash = ?11 AND r.expires_at > ?3 AND r.plan = ?9
               AND u.team IN ('admin', 'accountant'))`,
      )
      .bind(order.id, ids.companyId, ts, a.signedBy, a.startOn, priceCents, TERMS_VERSION, a.ipHash, a.plan, a.approval.review.id, a.approval.offerHash, a.signedRole ?? null),
    db
      .prepare(
        `INSERT INTO companies (id, created_at, name, ico, address, register_line, vat_payer, plan, inbox, request_id, order_id, contract_at, terms_version, signed_by, start_on, accountant_id, legal_form, signed_role, aml_dossier_id)
         SELECT ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?1, ?3, ?12, ?13, ?14, ?15, ?16, ?17, ?18 WHERE ${mine}`,
      )
      .bind(order.id, ids.companyId, ts, order.company, order.ico, order.address, order.registerLine, plan?.vatPayer ? 1 : 0, a.plan, ids.inbox, order.requestId, TERMS_VERSION, a.signedBy, a.startOn, a.approval.review.accountant_id, order.legalForm ?? 'sro', a.signedRole ?? null, aml.dossierId),
    ...(ids.existingUser ? [] : [db.prepare(`INSERT OR IGNORE INTO users (id, created_at, email, name) SELECT ?4, ?3, ?5, ?6 WHERE ${mine}`).bind(order.id, ids.companyId, ts, ids.userId, order.email, a.signedBy)]),
    db.prepare(`INSERT INTO declarations (id, company_id, created_at, created_by, data, checked_at, checked_by)
      SELECT d.declaration_id, ?2, d.created_at, ?4, d.declaration, a.decided_at, a.decided_by FROM aml_dossiers d JOIN aml_decisions a ON a.dossier_id = d.id
      WHERE d.id = ?5 AND a.id = ?6 AND ${mine}`).bind(order.id, ids.companyId, ts, ids.userId, aml.dossierId, aml.decisionId),
    db.prepare(`INSERT INTO risks (id, company_id, created_at, created_by, level, note)
      SELECT ?4, ?2, a.decided_at, a.decided_by, a.level, a.note FROM aml_decisions a WHERE a.id = ?5 AND ${mine}`).bind(order.id, ids.companyId, ts, crypto.randomUUID(), aml.decisionId),
    db.prepare(`INSERT INTO contract_snapshots (company_id, order_id, accepted_at, terms_version, sha256, data)
      SELECT ?2, ?1, ?3, ?4, ?5, ?6 WHERE ${mine}`)
      .bind(order.id, ids.companyId, ts, TERMS_VERSION, frozen.sha256, frozen.data),

    db.prepare(`INSERT OR IGNORE INTO members (company_id, user_id, role, created_at) SELECT ?2, ?4, 'owner', ?3 WHERE ${mine}`).bind(order.id, ids.companyId, ts, ids.userId),
    db
      .prepare(`INSERT INTO events (at, company_id, user_id, action, subject, detail) SELECT ?3, ?2, ?4, 'contract.accepted', ?1, ?5 WHERE ${mine}`)
      .bind(order.id, ids.companyId, ts, ids.userId, JSON.stringify({ terms: TERMS_VERSION, signedBy: a.signedBy, signedRole: a.signedRole, plan: a.plan, startOn: a.startOn, sha256: frozen.sha256, review: a.approval.review.id, catalogueHash: a.approval.release.catalogueHash, release: a.approval.release })),
  ]
  if (order.requestId) statements.push(db.prepare(`UPDATE requests SET status = 'client' WHERE id = ?4 AND ${mine}`).bind(order.id, ids.companyId, ts, order.requestId))
  return { companyId: ids.companyId, userId: ids.userId, inbox: ids.inbox, statements }
}

/** Whether the order was accepted by the acceptance that wrote this company (read after the batch). */
export async function acceptedAs(db: D1Database, orderId: string, companyId: string): Promise<boolean> {
  return Boolean(await db.prepare("SELECT 1 AS x FROM orders WHERE id = ? AND company_id = ? AND status = 'accepted'").bind(orderId, companyId).first())
}
