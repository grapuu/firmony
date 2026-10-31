// The guards around `links` and the documents' update guard, as they stood after step 91 and step 93 restores them
// (31 October 2026): the revision bump, the handover and the evidence hold, the locked period over the columns that
// steps 32 to 91 added, and the unique pair.
import { check } from './check.mjs'
import { linkStatement } from '../.wrangler/dist/stores.js'

export async function checkLinksGuards({ db, nowS, today, lucia }) {
  const co = 'co-guards'
  await db
    .batch([
      db.prepare("INSERT INTO users (id, created_at, email, name, team) VALUES ('u-guards-admin', ?, 'guards-admin@example.sk', 'TEST-ONLY Správca', 'admin')").bind(nowS),
      db
        .prepare("INSERT INTO companies (id, created_at, name, ico, plan, inbox, accountant_id, start_on) VALUES (?, ?, 'TEST-ONLY Guardy s. r. o.', '50666661', 'rast', 'guards01', ?, '2026-01-01')")
        .bind(co, nowS, lucia.id),
      db.prepare("INSERT INTO accounts (id, company_id, iban, ledger) VALUES ('acc-guards', ?, 'SK3112000000198742637511', '221.001')").bind(co),
      db
        .prepare("INSERT INTO payments (id, company_id, account_id, created_at, booked_on, amount_cents, party, ref) VALUES ('pa-guards', ?, 'acc-guards', ?, ?, -4200, 'TEST-ONLY Dodávateľ', 'g1')")
        .bind(co, nowS, today),
      db
        .prepare(
          "INSERT INTO documents (id, company_id, created_at, source, status, kind, issued_on, supplied_on, total_cents, currency, category, party, number, booked_at, booked_by) VALUES ('do-guards', ?, ?, 'upload', 'read', 'invoice_in', ?, ?, 4200, 'EUR', 'services', 'TEST-ONLY Dodávateľ', 'G-1', ?, ?)",
        )
        .bind(co, nowS, '2026-09-15', '2026-09-15', nowS, lucia.id),
    ])

  const revision = async () => (await db.prepare('SELECT revision FROM company_data_revisions WHERE company_id = ?').bind(co).first())?.revision ?? 0
  const before = await revision()
  await linkStatement(db, co, 'pa-guards', 'do-guards', 'client', null).run()
  check('pairing bumps the company data revision again', (await revision()) === before + 1, JSON.stringify([before, await revision()]))

  // The same pair again: the index refuses the row itself, whatever guard would let the statement through.
  let rawTwiceRefused = false
  try {
    await db
      .prepare("INSERT INTO links (document_id, payment_id, company_id, how, by, created_at) VALUES ('do-guards', 'pa-guards', ?, 'client', NULL, ?)")
      .bind(co, nowS)
      .run()
  } catch {
    rawTwiceRefused = true
  }
  const count = await db.prepare("SELECT COUNT(*) AS n FROM links WHERE document_id = 'do-guards'").first()
  check('the same pair twice is refused: one row, no second entry', rawTwiceRefused && count?.n === 1, JSON.stringify([rawTwiceRefused, count]))

  await db.prepare("DELETE FROM links WHERE document_id = 'do-guards' AND payment_id = 'pa-guards'").run()
  await db.prepare('UPDATE companies SET purge_started_at = ? WHERE id = ?').bind(nowS, co).run()
  let duringRefused = false
  try {
    await linkStatement(db, co, 'pa-guards', 'do-guards', 'client', null).run()
  } catch {
    duringRefused = true
  }
  await db.prepare('UPDATE companies SET purge_started_at = NULL WHERE id = ?').bind(co).run()
  check('inserting a link is refused during handover finalisation', duringRefused, JSON.stringify(duringRefused))

  await db
    .batch([
      db
        .prepare("INSERT INTO incidents (id, company_id, created_at, created_by, owner_id, severity, title, evidence, review_on, preservation) VALUES ('in-guards', ?, ?, 'u-guards-admin', 'u-guards-admin', 'normal', 'TEST-ONLY', 'TEST-ONLY', ?, 'held')")
        .bind(co, nowS, today),
      db.prepare("INSERT INTO evidence_holds (id, incident_id, company_id, created_at, created_by, review_on) VALUES ('eh-guards', 'in-guards', ?, ?, 'u-guards-admin', ?)").bind(co, nowS, today),
    ])
  await linkStatement(db, co, 'pa-guards', 'do-guards', 'client', null).run()
  let heldDelete = false
  try {
    await db.prepare("DELETE FROM links WHERE document_id = 'do-guards' AND payment_id = 'pa-guards'").run()
  } catch {
    heldDelete = true
  }
  check('deleting a link is refused under an open evidence hold', heldDelete, JSON.stringify(heldDelete))

  // A posted document in a locked period: the columns steps 32 to 91 added are guarded too.
  await db
    .prepare("INSERT INTO period_locks (company_id, through_on, version, change_id, changed_at, changed_by, reason) VALUES (?, '2026-09-30', 1, 'lg-1', ?, 'u-guards-admin', 'TEST-ONLY uzavretý rok')")
    .bind(co, nowS)
    .run()
  let fxRefused = false
  let ratioRefused = false
  try {
    await db.prepare("UPDATE documents SET fx_rate = '1,25' WHERE id = 'do-guards' AND company_id = ?").bind(co).run()
  } catch {
    fxRefused = true
  }
  try {
    await db.prepare('UPDATE documents SET vat_ratio = 50 WHERE id = ? AND company_id = ?').bind('do-guards', co).run()
  } catch {
    ratioRefused = true
  }
  check('changing fx_rate or vat_ratio of a posted document in a locked period is refused', fxRefused && ratioRefused, JSON.stringify([fxRefused, ratioRefused]))
}
