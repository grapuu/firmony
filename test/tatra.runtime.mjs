// Tatra banka's XML of movements taken in workerd's D1 as a member adds it on the bank page (statements.ts): its account
// made, its payments in, the transaction tax needing no document, the same file again adding nothing, and the month it
// covers not asked for again although it carries no balance. The file is test/fixtures/tatra-pohyby.xml, values invented.
import { readFileSync } from 'node:fs'
import { check } from './check.mjs'
import { takeStatementFile, statementDue, getCompany } from '../.wrangler/dist/stores.js'

export async function checkTatraRuntime({ db, files }) {
  const ts = Math.floor(Date.now() / 1000)
  await db.batch([
    db.prepare("INSERT INTO companies (id, created_at, name, ico, plan, inbox, contract_at, start_on) VALUES ('tatra-co', ?, 'TEST ONLY Tatra s. r. o.', '99887766', 'start', 'tatra001', ?, '2026-08-01')").bind(ts, ts),
    db.prepare("INSERT INTO users (id, created_at, email, name) VALUES ('tatra-owner', ?, 'owner@tatra.test', 'TEST ONLY Majiteľ')").bind(ts),
    db.prepare("INSERT INTO members (company_id, user_id, role, created_at) VALUES ('tatra-co', 'tatra-owner', 'owner', ?)").bind(ts),
  ])
  const company = await getCompany(db, 'tatra-co')
  const bytes = new Uint8Array(readFileSync(new URL('./fixtures/tatra-pohyby.xml', import.meta.url)))
  const env = { DB: db, FILES: files }
  let taken = await takeStatementFile(env, company, { user: 'tatra-owner', source: 'upload' }, { name: 'pohyby.xml', bytes })
  const payments = async () => (await db.prepare("SELECT ref, amount_cents, party, exempt FROM payments WHERE company_id = 'tatra-co' ORDER BY booked_on, amount_cents").all()).results
  let rows = await payments()
  check('tatra: the export a member adds is taken, its account made, every movement a payment', taken?.statements === 1 && taken.added === 9 && rows.length === 9 &&
    Boolean(await db.prepare("SELECT 1 AS x FROM accounts WHERE company_id = 'tatra-co' AND iban = 'SK2411000000002612345678'").first()), JSON.stringify(taken))
  check('tatra: the transaction tax and the taxes paid to the state need no document', rows.filter((r) => r.exempt === 'state').length === 3, JSON.stringify(rows))
  taken = await takeStatementFile(env, company, { user: 'tatra-owner', source: 'upload' }, { name: 'pohyby.xml', bytes })
  check('tatra: the same file again adds nothing', taken?.added === 0 && (await payments()).length === 9)
  const later = new TextDecoder().decode(bytes).replace('<DTEND>20261001</DTEND>', '<DTEND>20261002</DTEND>')
  taken = await takeStatementFile(env, company, { user: 'tatra-owner', source: 'upload' }, { name: 'pohyby2.xml', bytes: new TextEncoder().encode(later) })
  check('tatra: a later export holding the same movements adds none of them twice', taken?.added === 0 && taken.known === 9 && (await payments()).length === 9, JSON.stringify(taken))
  check('tatra: the month the export covers is not asked for, though it carries no balance', (await statementDue(db, 'tatra-co', '2026-10-05')) === null && (await statementDue(db, 'tatra-co', '2026-11-05')) === '2026-10')
}
