// Instalments (Task 2, 31 October 2026): the pairing is idempotent, a repeated pairing is no error.
import { check } from './check.mjs'
import { createHash, randomBytes } from 'node:crypto'
import { linkStatement } from '../.wrangler/dist/stores.js'

export async function checkInstalments({ mf, db, site, nowS, today }) {
  const sha = (v) => createHash('sha256').update(v).digest('hex')
  const co = 'co-inst'
  await db
    .batch([
      db
        .prepare("INSERT INTO users (id, created_at, email, name) VALUES ('u-inst', ?, 'inst-klient@example.sk', 'TEST-ONLY Klient')")
        .bind(nowS),
      db
        .prepare("INSERT INTO companies (id, created_at, name, ico, plan, inbox, start_on) VALUES (?, ?, 'TEST-ONLY Splátky s. r. o.', '50777772', 'start', 'inst0001', '2026-01-01')")
        .bind(co, nowS),
      db.prepare("INSERT INTO members (company_id, user_id, role, created_at) VALUES (?, 'u-inst', 'owner', ?)").bind(co, nowS),
      db.prepare("INSERT INTO accounts (id, company_id, iban, ledger) VALUES ('acc-inst', ?, 'SK3112000000198742637522', '221.001')").bind(co),
      db
        .prepare("INSERT INTO payments (id, company_id, account_id, created_at, booked_on, amount_cents, party, ref) VALUES ('pa-inst', ?, 'acc-inst', ?, ?, -4200, 'TEST-ONLY Dodávateľ', 'i1')")
        .bind(co, nowS, today),
      db
        .prepare(
          "INSERT INTO documents (id, company_id, created_at, source, status, kind, issued_on, total_cents, currency, category, party, number) VALUES ('do-inst', ?, ?, 'upload', 'read', 'invoice_in', ?, 4200, 'EUR', 'services', 'TEST-ONLY Dodávateľ', 'I-1')",
        )
        .bind(co, nowS, today),
      db
        .prepare(
          "INSERT INTO documents (id, company_id, created_at, source, status, kind, issued_on, total_cents, currency, category, party, number) VALUES ('do-read', ?, ?, 'upload', 'reading', 'invoice_in', ?, NULL, 'EUR', 'services', 'TEST-ONLY Dodávateľ', 'I-2')",
        )
        .bind(co, nowS, today),
    ])
  const token = randomBytes(32).toString('base64url')
  await db
    .prepare('INSERT INTO sessions (id, user_id, company_id, created_at, expires_at, verified_at, credential_id) VALUES (?, ?, ?, ?, ?, NULL, NULL)')
    .bind(sha(token), 'u-inst', co, nowS, nowS + 86400)
    .run()
  const cookie = `__Host-firmony=${token}`

  // A document still being read (no amount yet): the amount guard passes, so only the idempotency guard stops the pair.
  const first = await linkStatement(db, co, 'pa-inst', 'do-read', 'client', 'u-inst').run()
  let threw = false
  let second = null
  try {
    second = await linkStatement(db, co, 'pa-inst', 'do-read', 'client', 'u-inst').run()
  } catch {
    threw = true
  }
  const n = await db.prepare("SELECT COUNT(*) AS n FROM links WHERE document_id = 'do-read' AND payment_id = 'pa-inst'").first()
  check('a repeated pairing returns changes 0 and one row, never an error', !threw && second?.meta?.changes === 0 && n.n === 1, JSON.stringify([first.meta, threw, second?.meta, n]))

  await db.prepare("DELETE FROM links WHERE document_id = 'do-read' AND payment_id = 'pa-inst'").run()
  const post = () =>
    mf.dispatchFetch(`${site}/app/platby/pa-inst/priradit`, {
      method: 'POST',
      body: new URLSearchParams({ doklad: 'do-read' }).toString(),
      redirect: 'manual',
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded', origin: site },
    })
  const one = await post()
  const two = await post()
  const n2 = await db.prepare("SELECT COUNT(*) AS n FROM links WHERE document_id = 'do-read'").first()
  check('a double-submitted pairing redirects once and answers the second with a page, never a crash', one.status === 303 && two.status !== 500 && n2.n === 1, JSON.stringify([one.status, two.status]))
}
