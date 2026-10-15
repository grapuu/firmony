// The order a request becomes when the register knows its company as an s. r. o.: a link to it goes by email to the
// address that was typed (so whoever opens it can read that mailbox), and a director the register names accepts the
// terms there. Accepting creates the company, the person's account and their membership in one batch, keeps who
// accepted which version when, and is done once: the UPDATE that closes the order is the first statement of the
// batch and the rest only happens when it found the order open.
import { ORDER, TERMS_VERSION, planById, type PlanId } from './config'
import { now, sha256Hex } from './db'
import type { Director } from './rpo'
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
  plan: string
  person: string
  email: string
  phone: string | null
  status: 'open' | 'accepted' | 'expired'
  acceptedAt: number | null
  signedBy: string | null
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
    plan: String(row.plan),
    person: String(row.person),
    email: String(row.email),
    phone: str(row.phone),
    status: status === 'accepted' ? 'accepted' : status === 'open' && expires > now() ? 'open' : 'expired',
    acceptedAt: num(row.accepted_at),
    signedBy: str(row.signed_by),
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
      `INSERT INTO orders (id, token, created_at, expires_at, request_id, ico, company, address, register_line, directors, plan, person, email, phone)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(crypto.randomUUID(), await sha256Hex(token), ts, ts + ORDER.days * 86400, o.requestId, o.ico, o.company, o.address, o.registerLine, o.directors ? JSON.stringify(o.directors) : null, o.plan, o.person, o.email, o.phone)
}

/** Whether a company with this IČO is already a client (a second contract for it is not taken online). */
export async function isClient(db: D1Database, ico: string): Promise<boolean> {
  return Boolean(await db.prepare('SELECT 1 AS x FROM companies WHERE ico = ? AND closed_at IS NULL AND demo = 0').bind(ico).first())
}

export interface Acceptance {
  plan: PlanId
  startOn: string
  /** The director who accepted, as the register names them (or as typed when the register named nobody). */
  signedBy: string
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
  const plan = planById(a.plan)
  const priceCents = Math.round((plan?.price ?? 0) * 100)
  const frozen = await contractSnapshot(order, a, ids.companyId, ts, a.approval)
  // ?1 the order, ?2 the company this acceptance creates, ?3 its time: only the acceptance that closed the order
  // finds all three on it.
  const mine = 'EXISTS (SELECT 1 FROM orders WHERE id = ?1 AND company_id = ?2 AND accepted_at = ?3)'
  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `UPDATE orders SET status = 'accepted', accepted_at = ?3, company_id = ?2, signed_by = ?4, start_on = ?5, price_cents = ?6, terms_version = ?7, ip_hash = ?8, plan = ?9
         WHERE id = ?1 AND status = 'open' AND expires_at > ?3
           AND EXISTS (SELECT 1 FROM order_reviews r JOIN users u ON u.id = r.accountant_id
             WHERE r.order_id = ?1 AND r.id = ?10 AND r.id = (SELECT MAX(id) FROM order_reviews WHERE order_id = ?1)
               AND r.decision = 'standard' AND r.offer_hash = ?11 AND r.expires_at > ?3 AND r.plan = ?9
               AND u.team IN ('admin', 'accountant'))`,
      )
      .bind(order.id, ids.companyId, ts, a.signedBy, a.startOn, priceCents, TERMS_VERSION, a.ipHash, a.plan, a.approval.review.id, a.approval.offerHash),
    db
      .prepare(
        `INSERT INTO companies (id, created_at, name, ico, address, register_line, vat_payer, plan, inbox, request_id, order_id, contract_at, terms_version, signed_by, start_on, accountant_id)
         SELECT ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?1, ?3, ?12, ?13, ?14, ?15 WHERE ${mine}`,
      )
      .bind(order.id, ids.companyId, ts, order.company, order.ico, order.address, order.registerLine, plan?.vatPayer ? 1 : 0, a.plan, ids.inbox, order.requestId, TERMS_VERSION, a.signedBy, a.startOn, a.approval.review.accountant_id),
    db.prepare(`INSERT INTO contract_snapshots (company_id, order_id, accepted_at, terms_version, sha256, data)
      SELECT ?2, ?1, ?3, ?4, ?5, ?6 WHERE ${mine}`)
      .bind(order.id, ids.companyId, ts, TERMS_VERSION, frozen.sha256, frozen.data),
    ...(ids.existingUser ? [] : [db.prepare(`INSERT OR IGNORE INTO users (id, created_at, email, name) SELECT ?4, ?3, ?5, ?6 WHERE ${mine}`).bind(order.id, ids.companyId, ts, ids.userId, order.email, a.signedBy)]),
    db.prepare(`INSERT OR IGNORE INTO members (company_id, user_id, role, created_at) SELECT ?2, ?4, 'owner', ?3 WHERE ${mine}`).bind(order.id, ids.companyId, ts, ids.userId),
    db
      .prepare(`INSERT INTO events (at, company_id, user_id, action, subject, detail) SELECT ?3, ?2, ?4, 'contract.accepted', ?1, ?5 WHERE ${mine}`)
      .bind(order.id, ids.companyId, ts, ids.userId, JSON.stringify({ terms: TERMS_VERSION, signedBy: a.signedBy, plan: a.plan, startOn: a.startOn, sha256: frozen.sha256, review: a.approval.review.id, catalogueHash: a.approval.release.catalogueHash, release: a.approval.release })),
  ]
  if (order.requestId) statements.push(db.prepare(`UPDATE requests SET status = 'client' WHERE id = ?4 AND ${mine}`).bind(order.id, ids.companyId, ts, order.requestId))
  return { companyId: ids.companyId, userId: ids.userId, inbox: ids.inbox, statements }
}

/** Whether the order was accepted by the acceptance that wrote this company (read after the batch). */
export async function acceptedAs(db: D1Database, orderId: string, companyId: string): Promise<boolean> {
  return Boolean(await db.prepare("SELECT 1 AS x FROM orders WHERE id = ? AND company_id = ? AND status = 'accepted'").bind(orderId, companyId).first())
}
