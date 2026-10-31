// Instalments (Task 2, 31 October 2026): the pairing is idempotent, a repeated pairing is no error.
import { check } from './check.mjs'
import { createHash, randomBytes } from 'node:crypto'
import { linkStatement, booksOf, listPayments, statementsFrom, companyOf } from '../.wrangler/dist/stores.js'

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

  // One payment for several documents: the first pair caps at the document's remaining amount, the rest of the
  // payment stays for the next document, filled in the order the accountant pairs them.
  const allocOf = async (doc, pay) => {
    try {
      return (await db.prepare('SELECT amount_cents FROM links WHERE document_id = ? AND payment_id = ?').bind(doc, pay).first())?.amount_cents ?? null
    } catch {
      return null
    }
  }
  const mk = async (id, total, due, fields = {}) =>
    db
      .prepare(
        `INSERT INTO documents (id, company_id, created_at, source, status, kind, issued_on, due_on, total_cents, currency, category, party, number, fx_rate) VALUES (?, ?, ?, 'upload', 'read', 'invoice_in', ?, ?, ?, ?, 'services', 'TEST-ONLY Dodávateľ', ?, ?)`,
      )
      .bind(id, co, nowS, today, due, total, fields.currency ?? 'EUR', fields.number ?? id, fields.fxRate ?? null)
      .run()
  await mk('do-split-a', 4000, '2026-10-05')
  await mk('do-split-b', 8000, '2026-10-10')
  await db
    .prepare("INSERT INTO payments (id, company_id, account_id, created_at, booked_on, amount_cents, party, ref) VALUES ('pa-split', ?, 'acc-inst', ?, ?, -10000, 'TEST-ONLY Dodávateľ', 'i2')")
    .bind(co, nowS, today)
    .run()
  await linkStatement(db, co, 'pa-split', 'do-split-a', 'client', 'u-inst').run()
  await linkStatement(db, co, 'pa-split', 'do-split-b', 'client', 'u-inst').run()
  const splitA = await allocOf('do-split-a', 'pa-split')
  const splitB = await allocOf('do-split-b', 'pa-split')
  check('one payment for several documents fills each document at its remaining amount, in pairing order', splitA === 4000 && splitB === 6000, JSON.stringify([splitA, splitB]))

  // A foreign invoice paid in euros: the cap is at its booked rate, the difference is the exchange difference.
  await mk('do-fx', 100000, '2026-10-12', { currency: 'USD', fxRate: '1,08' })
  await db
    .prepare("INSERT INTO payments (id, company_id, account_id, created_at, booked_on, amount_cents, party, ref) VALUES ('pa-fx-1', ?, 'acc-inst', ?, ?, -50000, 'TEST-ONLY Dodávateľ', 'i3'), ('pa-fx-2', ?, 'acc-inst', ?, ?, -50000, 'TEST-ONLY Dodávateľ', 'i4')")
    .bind(co, nowS, today, co, nowS, today)
    .run()
  await linkStatement(db, co, 'pa-fx-1', 'do-fx', 'client', 'u-inst').run()
  await linkStatement(db, co, 'pa-fx-2', 'do-fx', 'client', 'u-inst').run()
  const fx1 = await allocOf('do-fx', 'pa-fx-1')
  const fx2 = await allocOf('do-fx', 'pa-fx-2')
  check('a USD invoice paid in euros pairs at its booked rate, the excess stays on the second payment', fx1 === 50000 && fx2 === 42593, JSON.stringify([fx1, fx2]))

  // The refund of an issued credit note: a negative payment against a negative remaining amount.
  await db
    .prepare(
      "INSERT INTO documents (id, company_id, created_at, source, status, kind, issued_on, total_cents, currency, category, party, number) VALUES ('do-credit', ?, ?, 'upload', 'read', 'invoice_out', ?, -4200, 'EUR', 'sales', 'TEST-ONLY Odberateľ', 'C-1')",
    )
    .bind(co, nowS, today)
    .run()
  await db
    .prepare("INSERT INTO payments (id, company_id, account_id, created_at, booked_on, amount_cents, party, ref) VALUES ('pa-refund', ?, 'acc-inst', ?, ?, -2000, 'TEST-ONLY Odberateľ', 'i5')")
    .bind(co, nowS, today)
    .run()
  await linkStatement(db, co, 'pa-refund', 'do-credit', 'client', 'u-inst').run()
  const refund = await allocOf('do-credit', 'pa-refund')
  check('the refund of an issued credit note pairs with its whole amount', refund === 2000, JSON.stringify(refund))

  // The overpaid remainder must not disappear (review of 31 October 2026): what a payment does not cover of its
  // documents is listed for the accountant at its rest, the books propose the partner's open item for it, and the
  // accountant may change the proposal.
  await db
    .prepare(
      "INSERT INTO documents (id, company_id, created_at, source, status, kind, issued_on, due_on, total_cents, currency, category, party, number) VALUES ('do-rest-in', ?, ?, 'upload', 'read', 'invoice_out', ?, ?, 1000, 'EUR', 'sales', 'TEST-ONLY Odberateľ', 'F-1')",
    )
    .bind(co, nowS, today, '2026-10-20')
    .run()
  await db
    .prepare("INSERT INTO payments (id, company_id, account_id, created_at, booked_on, amount_cents, party, ref) VALUES ('pa-rest-in', ?, 'acc-inst', ?, ?, 3000, 'TEST-ONLY Odberateľ', 'i6')")
    .bind(co, nowS, today)
    .run()
  await linkStatement(db, co, 'pa-rest-in', 'do-rest-in', 'accountant', 'u-inst').run()
  await db.prepare("UPDATE documents SET booked_at = ? WHERE id = 'do-rest-in'").bind(nowS).run()
  const restIn = (await listPayments(db, co, 'unpaired')).find((p) => p.id === 'pa-rest-in')
  check('a payment over its document keeps its rest, listed at its rest for a document or an account', restIn?.remainderCents === 2000, JSON.stringify(restIn?.remainderCents))
  const company = await companyOf(await db.prepare('SELECT * FROM companies WHERE id = ?').bind(co).first())
  let books = await booksOf(db, company)
  const inEntry = books.entries.find((e) => e.paymentId === 'pa-rest-in' && e.kind === 'payment')
  check(
    'the books propose the partner\'s open item 311 for the rest of money in',
    inEntry?.lines.some((l) => l.md === '221.001' && l.d === '311' && l.cents === 2000 && l.proposalId === 'pa-rest-in') === true,
    JSON.stringify(inEntry?.lines),
  )
  // The closing places a credit balance of 311 on r126 (the right side) and a debit balance of 321 on r057 (its
  // receivables row); both rows take the balance by its side (closing-pod).
  const st = statementsFrom(new Map([['311', -2000], ['321', 3000]]), 2026, 'pod')
  check(
    'the closing places a credit balance of 311 and a debit balance of 321, each on its side',
    (st.balance.r126 ?? 0) >= 2000 && (st.balance.r057 ?? 0) >= 3000,
    JSON.stringify([st.balance.r057, st.balance.r126]),
  )
  await mk('do-rest-out', 1000, '2026-10-21')
  await db
    .prepare("INSERT INTO payments (id, company_id, account_id, created_at, booked_on, amount_cents, party, ref) VALUES ('pa-rest-out', ?, 'acc-inst', ?, ?, -3000, 'TEST-ONLY Dodávateľ', 'i7')")
    .bind(co, nowS, today)
    .run()
  await linkStatement(db, co, 'pa-rest-out', 'do-rest-out', 'accountant', 'u-inst').run()
  await db.prepare("UPDATE documents SET booked_at = ? WHERE id = 'do-rest-out'").bind(nowS).run()
  books = await booksOf(db, company)
  const outEntry = books.entries.find((e) => e.paymentId === 'pa-rest-out' && e.kind === 'payment')
  check(
    'the books propose the partner\'s open item 321 for the rest of money out',
    outEntry?.lines.some((l) => l.md === '321' && l.d === '221.001' && l.cents === 2000 && l.proposalId === 'pa-rest-out') === true,
    JSON.stringify(outEntry?.lines),
  )
  await db.prepare("UPDATE payments SET proposal_account = '379' WHERE id = 'pa-rest-out'").run()
  books = await booksOf(db, company)
  const changed = books.entries.find((e) => e.paymentId === 'pa-rest-out' && e.kind === 'payment')
  check(
    'the accountant changes the proposal of the rest',
    changed?.lines.some((l) => l.md === '379' && l.d === '221.001' && l.cents === 2000) === true,
    JSON.stringify(changed?.lines),
  )
  const page = await mf.dispatchFetch(`${site}/app/platby/pa-rest-in`, { headers: { cookie } })
  const html = await page.text()
  check('the payment page shows the unallocated rest', html.includes('Zostáva priradiť') && html.includes('+20'), html.match(/Zostáva priradiť[^<]*/)?.[0] ?? '')
}
