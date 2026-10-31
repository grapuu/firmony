// Documents the app books by itself (20 October 2026, app/autobook.ts), in workerd: the accountant turns it on for a
// client, and what her rule, the reading and the bank agree on is booked at once, as 'auto', with its VAT; a document
// above the threshold of an asset stays in her queue; nothing of it is her paid work; she sees the list on the client.
import { check } from './check.mjs'
import { writeFileSync } from 'node:fs'

export async function checkAutobook({ db, acc, lucia, nowS, day, capture }) {
  const company = 'co-auto'
  const on = day(-1)
  const doc = (id, total, vat, number) =>
    db
      .prepare(
        `INSERT INTO documents (id, company_id, created_at, source, status, read_by, kind, party, party_ico, party_vat_id, number, vs, issued_on, due_on,
           total_cents, vat_cents, currency, category, proposal, vat_deduct)
         VALUES (?, ?, ?, 'upload', 'read', 'claude-haiku-5-5', 'invoice_in', 'TEST-ONLY Hosting s. r. o.', '36000001', 'SK2020000001', ?, ?, ?, ?, ?, ?, 'EUR', 'services', 'rule', 1)`,
      )
      .bind(id, company, nowS, number, number, on, on, total, vat)
  const payment = (id, cents) =>
    db
      .prepare("INSERT INTO payments (id, company_id, account_id, created_at, booked_on, amount_cents, party, vs, ref) VALUES (?, ?, 'acc-auto', ?, ?, ?, 'TEST-ONLY Hosting s. r. o.', NULL, ?)")
      .bind(id, company, nowS, on, cents, id)
  const link = (docId, payId) => db.prepare("INSERT INTO links (document_id, payment_id, company_id, how, by, created_at) VALUES (?, ?, ?, 'auto', NULL, ?)").bind(docId, payId, company, nowS)
  await db.batch([
    db
      .prepare(
        "INSERT INTO companies (id, created_at, name, ico, dic, icdph, address, vat_payer, vat_since, plan, inbox, start_on, accountant_id) VALUES (?, ?, 'TEST-ONLY Samo s. r. o.', '50888881', '2120888881', 'SK2120888881', 'Hlavná 8, 811 01 Bratislava', 1, '2026-01-01', 'rast', 'samo0001', '2026-01-01', ?)",
      )
      .bind(company, nowS, lucia.id),
    db.prepare("INSERT INTO accounts (id, company_id, iban) VALUES ('acc-auto', ?, 'SK3112000000198742637599')").bind(company),
    db.prepare("INSERT INTO supplier_rules (company_id, key, name, category, vat_deduct, uses, updated_at, updated_by) VALUES (?, 'ico:36000001', 'TEST-ONLY Hosting s. r. o.', 'services', 1, 2, ?, ?)").bind(company, nowS, lucia.id),
    doc('auto-1', 12300, 2300, 'H-1'),
    doc('auto-2', 246000, 46000, 'H-2'),
    payment('pay-auto-1', -12300),
    payment('pay-auto-2', -246000),
    link('auto-1', 'pay-auto-1'),
    link('auto-2', 'pay-auto-2'),
  ])
  const before = await db.prepare("SELECT booked_at FROM documents WHERE id = 'auto-1'").first()
  check('off by default: nothing is booked by itself before the accountant says so', before.booked_at === null)
  const res = await acc.post(`/ucto/klienti/${company}/samo`, { zapnut: '1' })
  check('the accountant turns it on', res.status === 303 && (res.headers.get('location') ?? '').includes('ok=samo-zapnute'))
  const one = await db.prepare("SELECT booked_at, booked_by, vat_mode, vat_lines FROM documents WHERE id = 'auto-1'").first()
  const lines = JSON.parse(one.vat_lines ?? '[]')
  check(
    'the hosting invoice its rule, reading and payment agree on is booked at once, by the app, with its VAT',
    one.booked_at !== null && one.booked_by === 'auto' && one.vat_mode === 'domestic' && lines.length === 1 && lines[0].rate === 23 && lines[0].deduct === 2300,
    JSON.stringify(one),
  )
  const two = await db.prepare("SELECT booked_at FROM documents WHERE id = 'auto-2'").first()
  check('one above 1 700 € stays for the accountant', two.booked_at === null)
  const events = await db.prepare("SELECT action, user_id FROM events WHERE subject = 'auto-1'").all()
  check(
    'it is on record as the app\'s, and is no work of hers',
    events.results.some((e) => e.action === 'document.autobooked' && e.user_id === null) && !events.results.some((e) => e.action === 'document.booked'),
    JSON.stringify(events.results),
  )
  const page = await (await acc.get(`/ucto/klienti/${company}`)).text()
  if (capture) writeFileSync(`${capture}/client-auto.html`, page)
  const card = /id="samo"[\s\S]*?<\/section>/.exec(page)?.[0] ?? ''
  const queued = /id="zauctovat"[\s\S]*?<\/section>/.exec(page)?.[0] ?? page
  check(
    'the client page says it is on, lists what was booked so, and the rest waits in her queue',
    card.includes('Účtuje samo: Zapnuté') && card.includes('href="/ucto/doklady/auto-1"') && !card.includes('auto-2') && queued.includes('href="/ucto/doklady/auto-2"'),
  )
  const booking = await (await acc.get('/ucto/doklady/auto-1')).text()
  check('its booking screen names the app as who booked it', booking.includes('Firmony (samo)'))
  const queue = await (await acc.get('/ucto/doklady')).text()
  if (capture) writeFileSync(`${capture}/queue-auto.html`, queue)
  check('the queue page lists what the app booked by itself, waiting for her check', queue.includes('Samo zaúčtované') && queue.includes('TEST-ONLY Samo s. r. o.'))
  const ledger = await acc.get(`/ucto/klienti/${company}/kniha`)
  check('the books take it', ledger.status === 200)
  await db.batch([doc('auto-3', 6150, 1150, 'H-3'), payment('pay-auto-3', -6150), link('auto-3', 'pay-auto-3')])
  const off = await acc.post(`/ucto/klienti/${company}/samo`, { zapnut: '0' })
  const row = await db.prepare(`SELECT autobook FROM companies WHERE id = '${company}'`).first()
  const three = await db.prepare("SELECT booked_at FROM documents WHERE id = 'auto-3'").first()
  check('turned off, the next one waits for her', off.status === 303 && row.autobook === 0 && three.booked_at === null)
}
