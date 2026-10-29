// Nudges for what a newcomer left unfinished (his word of 28 October 2026: Firmony runs by itself, nobody chases a
// newcomer by hand). Four places where somebody stops, each nudged on fixed days, at nine in Bratislava:
//  - the director who got the link for the declaration and did not send it: 2 and 5 days after the link (the declaration
//    can be sent while the order runs; the reviewed offer's seven days start again at the approval, renewReview);
//  - the director whose identification is done: told at once when the designated person approves it (tellAdmitted,
//    from aml/routes.tsx), else at the next morning a day later, and reminded 2 and 5 days after he was told, while
//    the contract may be concluded (contractGate);
//  - the founder of an s. r. o. for 1 € who did not hand the application over: 3 and 10 days after it opened (it lapses
//    after FORMATION.applyDays);
//  - a new client whose first steps are not done (the declaration, the power of attorney, the bank, the first document,
//    the founder's approval of the formation contract): 3 and 10 days after the contract, a doorbell to its owners.
// A step goes out within two days of its day, once (an event or the outbox key): a morning the schedule missed is made
// up the next day, and a run long after (a test's clock, a schedule that stood still) sends nothing stale. Somebody who
// is no client yet has no account, so the email carries the link (the two emails of the site, bell.ts): an order keeps
// one token, so a new link replaces the one before and the email says so; an application's links are added.
import { BRAND, FORMATION, ORDER } from '../config'
import { now, sha256Hex } from '../db'
import { flushOutbox, queueIfChangedStatement } from '../mail'
import { bell, ringStatement } from '../bell'
import { newToken } from '../app/session'
import { bratislava } from '../app/remind'
import { contractGate, latestOrderReview, orderOfferHash, type ContractBindings } from '../contracts'
import { textDay } from '../app/booking'
import { bratislavaDay } from '../time'
import { orderAdmissionSql } from '../aml/model'
import { orderOf, type Order } from '../order'
import { foundingOf } from '../founding/model'
import { nudgeFounder } from '../founding/store'
import type { Mailer } from '../mail'

const DAY = 86_400
/** How long after its day a step may still go out. */
const WINDOW = 2 * DAY

export const NUDGE = {
  /** Days after the link for the declaration was sent. */
  declaration: [2, 5],
  /** Days after the director was told that the contract may be concluded. */
  contract: [2, 5],
  /** Days after an application of the s. r. o. for 1 € opened. */
  founding: [3, 10],
  /** Days after the contract, for a client's first steps. */
  firstSteps: [3, 10],
} as const

/** The step whose window holds `ts`, and that has not gone out yet (`sent` steps went out since `base`); else null. */
export function dueStep(base: number, steps: readonly number[], sent: number, ts: number): number | null {
  for (let i = steps.length - 1; i >= sent; i--) {
    const day = base + (steps[i] ?? 0) * DAY
    if (ts >= day && ts < day + WINDOW) return i
  }
  return null
}

type Env = ContractBindings & { DB: D1Database; EMAIL?: Mailer }

const nudgedDetail = (stage: 'declaration' | 'contract', step: number) => JSON.stringify({ stage, step })

/** The last day a link works on, as an email says it: "28. 11. 2026". */
export const linkUntil = (expires: number) => textDay(bratislavaDay(expires - 1))

/**
 * A new link to an order and the email that carries it, written only from the token read (`token`), while the order
 * is open and runs, and only when this step of this stage has not gone out since `since`. One batch: the token, the
 * email (only when the token moved) and the event of the step.
 */
async function orderNudge(db: D1Database, order: Order, stage: 'declaration' | 'contract', step: number, since: number, until: number, origin: string, ts: number): Promise<boolean> {
  if (until - ts < DAY) return false
  const token = newToken()
  const hash = await sha256Hex(token)
  const link = `${origin}/objednavka/${token}`
  const word = `do ${linkUntil(until)}`
  const mail =
    stage === 'declaration'
      ? {
          subject: 'Firmony: dokončite podklady pre spoluprácu',
          body: `Dobrý deň,\n\naby sme mohli začať, chýbajú nám ešte podklady pre ${order.company}. Vyhlásenie vyplníte a podpísaný súbor nahráte na tomto odkaze:\n${link}\n\nZaberie to len pár minút. Odkaz platí ${word}, predchádzajúci odkaz už neplatí.\n\nFirmony`,
        }
      : step === 0
        ? {
            subject: 'Firmony: zmluva je pripravená',
            body: `Dobrý deň,\n\noverenie podkladov pre ${order.company} je hotové. Zmluvu uzavriete na tomto odkaze:\n${link}\n\nOdkaz platí ${word}, predchádzajúci odkaz už neplatí.\n\nFirmony`,
          }
        : {
            subject: 'Firmony: zmluva čaká na uzavretie',
            body: `Dobrý deň,\n\nzmluva pre ${order.company} je pripravená, chýba už len jej uzavretie. Urobíte to na tomto odkaze:\n${link}\n\nOdkaz platí ${word}, predchádzajúci odkaz už neplatí.\n\nFirmony`,
          }
  const detail = nudgedDetail(stage, step)
  const [moved] = await db.batch([
    db
      .prepare(
        `UPDATE orders SET token = ?1 WHERE id = ?2 AND token = ?3 AND status = 'open' AND expires_at > ?4 AND company_id IS NULL
           AND NOT EXISTS (SELECT 1 FROM events WHERE subject = ?2 AND action = 'order.nudged' AND detail = ?5 AND at >= ?6)`,
      )
      .bind(hash, order.id, order.tokenHash, ts, detail, since),
    queueIfChangedStatement(db, { key: `order-nudge:${order.id}:${hash.slice(0, 16)}`, to: order.email, ...mail }),
    db
      .prepare("INSERT INTO events (at, company_id, user_id, action, subject, detail) SELECT ?1, NULL, NULL, 'order.nudged', ?2, ?3 WHERE EXISTS (SELECT 1 FROM orders WHERE id = ?2 AND token = ?4)")
      .bind(ts, order.id, detail, hash),
  ])
  return (moved?.meta?.changes ?? 0) === 1
}

/**
 * When the designated person approved the order's current dossier, and who, and when its director was told of it
 * (null: not yet).
 */
async function admittedAt(db: D1Database, orderId: string): Promise<{ decided: number; decidedBy: string; told: number | null; reminded: number } | null> {
  const row = await db
    .prepare(
      `SELECT a.decided_at AS decided, a.decided_by AS decided_by FROM orders o JOIN aml_dossiers d ON d.order_id = o.id JOIN aml_decisions a ON a.dossier_id = d.id
        WHERE o.id = ?1 AND a.decision = 'approved' AND ${orderAdmissionSql('o')} ORDER BY a.decided_at DESC, a.id DESC LIMIT 1`,
    )
    .bind(orderId)
    .first<{ decided: number | null; decided_by: string | null }>()
  if (!row?.decided || !row.decided_by) return null
  const told = await db
    .prepare("SELECT MIN(at) AS at FROM events WHERE subject = ? AND action = 'order.nudged' AND detail = ? AND at >= ?")
    .bind(orderId, nudgedDetail('contract', 0), row.decided)
    .first<{ at: number | null }>()
  const reminded = told?.at
    ? await db
        .prepare("SELECT COUNT(*) AS n FROM events WHERE subject = ? AND action = 'order.nudged' AND detail IN (?, ?) AND at >= ?")
        .bind(orderId, nudgedDetail('contract', 1), nudgedDetail('contract', 2), told.at)
        .first<{ n: number }>()
    : null
  return { decided: row.decided, decidedBy: row.decided_by, told: told?.at ?? null, reminded: Number(reminded?.n ?? 0) }
}

/**
 * The reviewed offer's seven days start again once the identification is approved: the review that stands (standard,
 * for the offer as it is now, made before the approval) is appended again under the designated person who approved,
 * valid ORDER.reviewDays from now, never past the order. Once for each approval: a review made after it (this one, or
 * the team's own) is not renewed again, and its running out is for the team (the director asks for a new link). Without
 * this a director who took a week to sign the declaration, or a designated person who took a few days, would find the
 * contract closed and nobody told.
 */
async function renewReview(db: D1Database, order: Order, state: { decided: number; decidedBy: string }, ts: number): Promise<boolean> {
  const review = await latestOrderReview(db, order.id)
  const until = Math.min(order.expiresAt, ts + ORDER.reviewDays * DAY)
  if (!review || review.decision !== 'standard' || review.reviewed_at >= state.decided || review.expires_at >= until || until - ts < DAY) return false
  if (review.offer_hash !== (await orderOfferHash(order))) return false
  const [renewed] = await db.batch([
    db
      .prepare(
        `INSERT INTO order_reviews (order_id, reviewed_at, reviewed_by, decision, offer_hash, plan, evidence, accountant_id, expires_at)
         SELECT order_id, ?2, ?3, decision, offer_hash, plan, evidence, accountant_id, ?4 FROM order_reviews
          WHERE id = ?5 AND id = (SELECT MAX(id) FROM order_reviews WHERE order_id = ?1)
            AND EXISTS (SELECT 1 FROM orders WHERE id = ?1 AND status = 'open' AND company_id IS NULL)`,
      )
      .bind(order.id, ts, state.decidedBy, until, review.id),
    db
      .prepare("INSERT INTO events (at, company_id, user_id, action, subject, detail) SELECT ?1, NULL, ?2, 'order.review.renewed', ?3, ?4 WHERE changes() = 1")
      .bind(ts, state.decidedBy, order.id, JSON.stringify({ from: review.id, until })),
  ])
  return (renewed?.meta?.changes ?? 0) === 1
}

/**
 * The director whose link ran out after the identification asks for a new one: when the approval has not renewed the
 * review yet, it does now, and the contract opens at once without the team. False leaves it to the team.
 */
export async function renewAfterAdmission(db: D1Database, order: Order, ts: number = now()): Promise<boolean> {
  if (order.status !== 'open' || order.amlPaper) return false
  const state = await admittedAt(db, order.id)
  return state ? renewReview(db, order, state, ts) : false
}

/** How long the contract may be concluded through the link: the order and its reviewed offer. */
const contractUntil = (order: Order, reviewExpires: number) => Math.min(order.expiresAt, reviewExpires)

/**
 * The director of an online order is told that the contract may be concluded, once its identification is approved and
 * nothing else keeps it (the terms released, the reviewed offer running). From aml/routes.tsx right after the approval,
 * and from the schedule for an approval nobody was told of a day later (the terms released after it).
 */
export async function tellAdmitted(env: Env, orderId: string, origin: string = BRAND.origin, ts: number = now()): Promise<boolean> {
  const db = env.DB
  const row = await db.prepare("SELECT * FROM orders WHERE id = ? AND status = 'open' AND aml_paper = 0 AND company_id IS NULL AND aml_ended_at IS NULL").bind(orderId).first()
  if (!row) return false
  const order = orderOf(row)
  const state = await admittedAt(db, order.id)
  if (!state || state.told !== null) return false
  // The one renewal is spent only when the review is all that stands in the way: while the release or the AML gate is
  // closed, it would run out before they open, and the director would never be told (the scheduler tries again daily).
  const before = await contractGate(db, env, order)
  if (!before.ready && before.reason !== 'review') return false
  await renewReview(db, order, state, ts)
  const gate = await contractGate(db, env, order)
  if (!gate.ready || !gate.approval) return false
  const sent = await orderNudge(db, order, 'contract', 0, state.decided, contractUntil(order, gate.approval.review.expires_at), origin, ts)
  if (sent) await flushOutbox(db, env.EMAIL)
  return sent
}

/** The orders: the declaration not sent, and the contract not concluded once it may be. */
async function nudgeOrders(env: Env, ts: number, origin: string): Promise<number> {
  const db = env.DB
  const rows = await db
    .prepare(
      `SELECT o.*,
         (SELECT MAX(e.at) FROM events e WHERE e.subject = o.id AND e.action IN ('contract.link.sent', 'aml.paper.intake.created')) AS link_sent,
         EXISTS (SELECT 1 FROM aml_dossiers d WHERE d.order_id = o.id) AS declared
         FROM orders o
        WHERE o.status = 'open' AND o.expires_at > ?1 AND o.company_id IS NULL AND o.aml_ended_at IS NULL AND o.aml_delete_started_at IS NULL
          AND o.created_at > ?2
          AND NOT EXISTS (SELECT 1 FROM companies c WHERE c.ico = o.ico AND c.closed_at IS NULL AND c.demo = 0 AND c.operator = 0 AND c.invoicing_only = 0)
        ORDER BY o.created_at LIMIT 300`,
    )
    .bind(ts, ts - 120 * DAY)
    .all<Record<string, unknown> & { link_sent: number | null; declared: number }>()
  let count = 0
  for (const row of rows.results) {
    const order = orderOf(row)
    try {
      if (!row.declared) {
        // The declaration: from the link the team sent last (a new link starts the days again).
        const base = row.link_sent
        if (!base) continue
        const sent = await db
          .prepare("SELECT COUNT(*) AS n FROM events WHERE subject = ? AND action = 'order.nudged' AND detail IN (?, ?) AND at >= ?")
          .bind(order.id, nudgedDetail('declaration', 0), nudgedDetail('declaration', 1), base)
          .first<{ n: number }>()
        const step = dueStep(base, NUDGE.declaration, Number(sent?.n ?? 0), ts)
        if (step === null) continue
        const review = order.amlPaper ? null : await latestOrderReview(db, order.id)
        // An online order the team put on hold or meant for an offer of its own is not the director's to finish. One
        // whose seven days ran out is: the approval of the identification starts them again (renewReview).
        if (!order.amlPaper && review?.decision !== 'standard') continue
        if (await orderNudge(db, order, 'declaration', step, base, order.expiresAt, origin, ts)) count++
        continue
      }
      if (order.amlPaper) continue
      const state = await admittedAt(db, order.id)
      if (!state) continue
      if (state.told === null) {
        // Approved, and nobody told the director: the terms were released only later, or the moment after the approval
        // failed. A day after the approval, so that the approval's own notice goes first.
        if (state.decided <= ts - DAY && state.decided > ts - 30 * DAY && (await tellAdmitted(env, order.id, origin, ts))) count++
        continue
      }
      const step = dueStep(state.told, NUDGE.contract, state.reminded, ts)
      if (step === null) continue
      const gate = await contractGate(db, env, order)
      if (!gate.ready || !gate.approval) continue
      if (await orderNudge(db, order, 'contract', step + 1, state.told, contractUntil(order, gate.approval.review.expires_at), origin, ts)) count++
    } catch (err) {
      console.error('an order nudge failed', err instanceof Error ? err.name : 'error')
    }
  }
  return count
}

/** The applications of the s. r. o. for 1 € still open. */
async function nudgeFoundings(db: D1Database, ts: number, origin: string): Promise<number> {
  const rows = await db
    .prepare(
      `SELECT f.*, (SELECT COUNT(*) FROM founding_events e WHERE e.founding_id = f.id AND e.action = 'nudged' AND e.at >= f.expires_at - ?3) AS nudged
         FROM foundings f WHERE f.status = 'open' AND f.expires_at > ?1 AND f.purge_started_at IS NULL AND f.updated_at <= ?2
        ORDER BY f.created_at LIMIT 300`,
    )
    .bind(ts, ts - DAY, FORMATION.applyDays * DAY)
    .all<Record<string, unknown> & { nudged: number }>()
  let count = 0
  for (const row of rows.results) {
    const f = foundingOf(row)
    // The days count from the day the application opened, or was returned to the founder (its expiry moved then).
    const since = f.expiresAt - FORMATION.applyDays * DAY
    const step = dueStep(since, NUDGE.founding, Number(row.nudged ?? 0), ts)
    if (step === null) continue
    try {
      if (await nudgeFounder(db, f, step, since, origin, ts)) count++
    } catch (err) {
      console.error('a founding nudge failed', err instanceof Error ? err.name : 'error')
    }
  }
  return count
}

/** What a client's first steps miss: the same steps the overview shows first (app/overview.ts). */
export const FIRST_STEPS_SQL = `(
  NOT EXISTS (SELECT 1 FROM declarations q WHERE q.company_id = c.id)
  OR NOT EXISTS (SELECT 1 FROM company_files f WHERE f.company_id = c.id AND f.kind = 'poa' AND f.deleted_at IS NULL)
  OR NOT (EXISTS (SELECT 1 FROM payments p WHERE p.company_id = c.id)
    OR EXISTS (SELECT 1 FROM bank_links l WHERE l.company_id = c.id AND l.status = 'active' AND (l.valid_until IS NULL OR l.valid_until > ?1))
    OR EXISTS (SELECT 1 FROM statements s WHERE s.company_id = c.id AND s.status IN ('taken', 'known')))
  OR NOT EXISTS (SELECT 1 FROM documents d WHERE d.company_id = c.id AND d.deleted_at IS NULL AND d.duplicate_of IS NULL AND d.source <> 'firmony')
  OR EXISTS (SELECT 1 FROM foundings g WHERE g.id = c.founding_id AND g.status = 'registered' AND g.approved_at IS NULL)
)`

/** New clients whose first steps are not done: a doorbell to each owner who keeps reminders on. */
async function nudgeFirstSteps(env: Env, ts: number, day: string, origin: string): Promise<number> {
  const db = env.DB
  const rows = await db
    .prepare(
      `SELECT c.id, c.contract_at FROM companies c
        WHERE c.closed_at IS NULL AND c.demo = 0 AND c.operator = 0 AND c.invoicing_only = 0 AND c.contract_at IS NOT NULL
          AND c.contract_at BETWEEN ?2 AND ?3 AND (c.ends_on IS NULL OR c.ends_on >= ?4) AND ${FIRST_STEPS_SQL}
        ORDER BY c.contract_at LIMIT 500`,
    )
    .bind(ts, ts - (Math.max(...NUDGE.firstSteps) * DAY + WINDOW), ts - Math.min(...NUDGE.firstSteps) * DAY, day)
    .all<{ id: string; contract_at: number }>()
  const statements: D1PreparedStatement[] = []
  for (const row of rows.results) {
    const step = dueStep(row.contract_at, NUDGE.firstSteps, 0, ts)
    if (step === null) continue
    const owners = await db
      .prepare("SELECT u.email FROM members m JOIN users u ON u.id = m.user_id WHERE m.company_id = ? AND m.role = 'owner' AND u.reminders = 1 ORDER BY m.created_at")
      .bind(row.id)
      .all<{ email: string }>()
    // The outbox key names the company and the step: each owner gets each step once.
    for (const o of owners.results) statements.push(ringStatement(db, 'first-steps', `${row.id}:${step}`, o.email, bell.firstSteps(`${origin}/app`)))
  }
  for (let i = 0; i < statements.length; i += 50) await db.batch(statements.slice(i, i + 50))
  return statements.length
}

/** Every nudge of this moment, at nine in Bratislava; says how many went out. */
export async function nudgeScheduled(env: Env, at: number = Date.now(), origin: string = BRAND.origin): Promise<number> {
  const b = bratislava(at)
  if (b.hour !== 9 || b.minute >= 15) return 0
  const ts = Math.floor(at / 1000)
  let count = 0
  for (const [name, run] of [
    ['orders', () => nudgeOrders(env, ts, origin)],
    ['foundings', () => nudgeFoundings(env.DB, ts, origin)],
    ['first steps', () => nudgeFirstSteps(env, ts, b.day, origin)],
  ] as const) {
    try {
      count += await run()
    } catch (err) {
      console.error(`nudges (${name}) failed`, err instanceof Error ? err.name : 'error')
    }
  }
  if (count > 0) await flushOutbox(env.DB, env.EMAIL, 50)
  return count
}
