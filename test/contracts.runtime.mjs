// The race controls use the real D1 transaction, not a mock of the acceptance statements.
import { check } from './check.mjs'
import { acceptStatements, contractCatalogueHash, contractGate, orderOf, orderOfferHash, resolveContract } from '../.wrangler/dist/stores.js'

export async function checkContractTransactions(db) {
  const ts = Math.floor(Date.now() / 1000)
  await db
    .prepare("INSERT INTO users (id, created_at, email, name, team) VALUES ('contract-expert', ?, 'expert@contract.test', 'Test expert', 'accountant')")
    .bind(ts)
    .run()
  await db
    .prepare(
      `INSERT INTO orders (id, token, created_at, expires_at, ico, company, plan, person, email)
    VALUES ('contract-race', 'fixture-not-public-token', ?, ?, '90909090', 'Contract test s. r. o.', 'rast', 'Test Owner', 'owner@contract.test')`,
    )
    .bind(ts, ts + 3600)
    .run()
  const order = () => db.prepare("SELECT * FROM orders WHERE id = 'contract-race'").first().then(orderOf)
  const release = {
    CONTRACT_RELEASE: JSON.stringify({
      catalogueHash: await contractCatalogueHash(),
      legalReview: 'TEST-ONLY lawyer',
      insuranceReview: 'TEST-ONLY insurer',
      validUntil: ts + 3600,
    }),
  }
  const insertReview = async (decision = 'standard', expires = ts + 3600, hash) =>
    db
      .prepare(
        `INSERT INTO order_reviews
    (order_id, reviewed_at, reviewed_by, decision, offer_hash, plan, evidence, accountant_id, expires_at)
    VALUES ('contract-race', ?, 'test-admin', ?, ?, 'rast', 'TEST-ONLY report', 'contract-expert', ?)`,
      )
      .bind(ts, decision, hash ?? (await orderOfferHash(await order())), expires)
      .run()
  await insertReview('standard', ts - 1)
  check('an expired expert decision does not authorize signing', !(await contractGate(db, release, await order())).ready)
  await insertReview('standard', ts + 3600, '0'.repeat(64))
  check('a decision for different company facts cannot authorize signing', !(await contractGate(db, release, await order())).ready)
  await insertReview()
  await db.prepare("UPDATE users SET team = NULL WHERE id = 'contract-expert'").run()
  check('removing the responsible accountant blocks a new acceptance', !(await contractGate(db, release, await order())).ready)
  await db.prepare("UPDATE users SET team = 'accountant' WHERE id = 'contract-expert'").run()
  const build = async (suffix) => {
    const current = await order()
    const gate = await contractGate(db, release, current)
    return acceptStatements(
      db,
      current,
      { plan: 'rast', signedBy: 'Test Owner', startOn: '2027-01-01', ipHash: '0'.repeat(64), approval: gate.approval },
      { companyId: `contract-${suffix}`, userId: `owner-${suffix}`, existingUser: false, inbox: `test-${suffix}` },
    )
  }
  const revoked = await build('revoked')
  await insertReview('hold')
  await db.batch(revoked.statements)
  check(
    'revocation between validation and commit prevents the entire acceptance',
    !(await db.prepare("SELECT id FROM companies WHERE id = 'contract-revoked'").first()) &&
      !(await db.prepare("SELECT id FROM users WHERE id = 'owner-revoked'").first()) &&
      (await order()).status === 'open',
  )
  await insertReview()
  const expired = await build('expired')
  await db.prepare("UPDATE orders SET expires_at = 1 WHERE id = 'contract-race'").run()
  await db.batch(expired.statements)
  check(
    'order expiry before the batch creates neither company nor snapshot',
    !(await db.prepare("SELECT company_id FROM contract_snapshots WHERE order_id = 'contract-race'").first()) &&
      !(await db.prepare("SELECT id FROM companies WHERE id = 'contract-expired'").first()),
  )
  await db
    .prepare("UPDATE orders SET expires_at = ? WHERE id = 'contract-race'")
    .bind(ts + 3600)
    .run()
  const first = await build('first')
  const second = await build('second')
  await db.batch(first.statements)
  await db.batch(second.statements)
  check(
    'two prepared acceptances create exactly one company, owner and snapshot',
    (await order()).companyId === 'contract-first' &&
      !(await db.prepare("SELECT id FROM companies WHERE id = 'contract-second'").first()) &&
      !(await db.prepare("SELECT id FROM users WHERE id = 'owner-second'").first()) &&
      (await db.prepare("SELECT COUNT(*) AS n FROM contract_snapshots WHERE order_id = 'contract-race'").first()).n === 1,
  )
  const saved = await resolveContract(db, 'contract-first', null)
  await db.prepare("UPDATE companies SET name = 'Later name', plan = 'firma' WHERE id = 'contract-first'").run()
  const after = await resolveContract(db, 'contract-first', null)
  check(
    'later company and plan changes do not rewrite accepted facts or tariff',
    after.sha256 === saved.sha256 && after.snapshot.client.name === 'Contract test s. r. o.' && after.snapshot.plan.id === 'rast',
  )
  let orphan = false
  try {
    await db
      .prepare(
        "INSERT INTO contract_snapshots (company_id, order_id, accepted_at, terms_version, sha256, data) VALUES ('orphan', 'absent', ?, '2026-10-15', ?, '{}')",
      )
      .bind(ts, '0'.repeat(64))
      .run()
  } catch {
    orphan = true
  }
  check('a snapshot without a matching accepted order is rejected at the database', orphan)
}
