// Firmony's own invoices to its clients, end to end in workerd: europio set up as the issuer, a client's month worked
// out from its contract, its documents and its people, the invoice issued once, its copy among the client's documents,
// the client told in the app, the payment paired from europio's bank, a reminder, and the schedule's part.
import { check } from './check.mjs'
import { writeFileSync } from 'node:fs'
import { billingScheduled, deliverBill, matchCompany, monthStart, operatorOf } from '../.wrangler/dist/stores.js'

const addMonths = (month, n) => {
  const i = Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1 + n
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`
}

export async function checkBilling({ db, files, admin, acc, client, companyId, today, sent, settle, get, capture }) {
  const plain = (html) => html.replace(/ /g, ' ')
  let res = await acc.get('/ucto/fakturacia')
  check('an accountant does not bill', res.status === 404)
  res = await client.get('/ucto/fakturacia')
  check('a client does not bill', res.status !== 200)
  res = await admin.get('/ucto/fakturacia')
  let page = await res.text()
  check('until europio is set up, the page asks for it and nothing else', res.status === 200 && page.includes('action="/ucto/fakturacia/europio"') && !page.includes('Na vystavenie'))
  const start = page.match(/<option value="(\d{4}-\d{2}-01)"/)?.[1] ?? ''
  res = await admin.post('/ucto/fakturacia/europio', { iban: 'SK00 1234 5678', start })
  check('an account that is no IBAN is refused', res.status === 422 && !(await operatorOf(db)))
  res = await admin.post('/ucto/fakturacia/europio', { iban: 'SK43 1100 0000 0029 3456 7890', start })
  const operator = await operatorOf(db)
  check(
    'europio is set up once, with its facts, its account and the administrator as its owner',
    res.status === 303 &&
      res.headers.get('location') === '/ucto/fakturacia?ok=europio' &&
      operator?.name === 'europio s. r. o.' &&
      operator.ico === '57442452' &&
      operator.invoiceIban === 'SK4311000000002934567890' &&
      !operator.vatPayer &&
      Boolean(await db.prepare("SELECT 1 AS x FROM members m JOIN users u ON u.id = m.user_id WHERE m.company_id = ? AND m.role = 'owner' AND u.team = 'admin'").bind(operator.id).first()),
    `${res.status} ${start}`,
  )
  res = await admin.post('/ucto/fakturacia/europio', { iban: 'SK43 1100 0000 0029 3456 7890', start })
  check('twice is once', res.status === 409 && (await db.prepare('SELECT COUNT(*) AS n FROM companies WHERE operator = 1').first())?.n === 1)

  // The client's last three months: its contract from two months ago, 64 documents that came last month (more than
  // Rast's 60), two people employed from last month; a duplicate, a discarded document and our own invoice count nothing.
  const month = today.slice(0, 7)
  const prev = addMonths(month, -1)
  const prev2 = addMonths(month, -2)
  const startedOn = (await db.prepare('SELECT start_on FROM companies WHERE id = ?').bind(companyId).first())?.start_on
  await db.prepare('UPDATE companies SET start_on = ? WHERE id = ?').bind(`${prev2}-01`, companyId).run()
  const inPrev = monthStart(prev) + 86400 * 3
  const docs = []
  for (let i = 0; i < 67; i++)
    docs.push(
      db
        .prepare('INSERT INTO documents (id, company_id, created_at, source, status, duplicate_of, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .bind(`bill-doc-${i}`, companyId, inPrev + i, i === 66 ? 'firmony' : 'upload', 'manual', i === 64 ? 'bill-doc-0' : null, i === 65 ? inPrev : null),
    )
  await db.batch(docs)
  await db
    .prepare("INSERT INTO employees (id, company_id, name, insurer, started_on, wage_cents, created_at) VALUES ('bill-e1', ?1, 'TEST Prvý', '25', ?2, 100000, ?3), ('bill-e2', ?1, 'TEST Druhý', '24', ?2, 100000, ?3)")
    .bind(companyId, `${prev}-01`, inPrev)
    .run()
  // A closing marked as prepared but not filed is not billed yet (the terms, 4.3: after it is filed).
  await db.prepare("INSERT INTO closings (company_id, year, inputs, filed_on, filed_at) VALUES (?, ?, '{}', ?, ?)").bind(companyId, Number(prev2.slice(0, 4)), today, inPrev).run()
  res = await admin.get('/ucto/fakturacia')
  page = plain(await res.text())
  if (capture) writeFileSync(`${capture}/billing.html`, page)
  check('a closing prepared and not filed is not billed', !page.includes('Účtovná závierka a daňové priznanie'))
  check(
    "the client's month is worked out: three months of the plan, last month as Firma, and two people",
    page.includes(`id="klient-${companyId}"`) && page.includes(`: 64, vyúčtované ako balík Firma`) && page.includes('Mzdy za') && page.includes('697,00 €'),
  )
  res = await admin.post('/ucto/fakturacia/vystavit', { klient: companyId })
  await settle()
  const invoice = await db.prepare('SELECT i.* FROM invoices i JOIN billing_invoices b ON b.invoice_id = i.id WHERE b.client_id = ?').bind(companyId).first()
  check(
    'the invoice is issued by europio in its own row of numbers, for 697 € without VAT, due in 14 days',
    res.status === 303 &&
      res.headers.get('location') === '/ucto/fakturacia?ok=vystavene&n=1#vystavene' &&
      invoice?.company_id === operator.id &&
      invoice.number === `${today.slice(0, 4)}0001` &&
      invoice.total_cents === 69700 &&
      invoice.vat_cents === 0 &&
      invoice.due_on > today,
    `${res.status} ${res.headers.get('location')} ${JSON.stringify(invoice)}`,
  )
  const keys = (await db.prepare('SELECT key FROM billing_items WHERE client_id = ? ORDER BY key').bind(companyId).all()).results.map((r) => r.key)
  check('what it billed is claimed by its keys', keys.join(' ') === [`extra:${prev}`, `payroll:${prev}`, `plan:${month}`, `plan:${prev}`, `plan:${prev2}`].sort().join(' '), keys.join(' '))
  let twice = false
  try {
    await db.prepare('INSERT INTO billing_items (client_id, key, invoice_id, cents) VALUES (?, ?, ?, 1)').bind(companyId, `plan:${month}`, 'x').run()
  } catch {
    twice = true
  }
  check('a key cannot be billed twice', twice)
  const copy = await db.prepare("SELECT * FROM documents WHERE company_id = ? AND source = 'firmony' AND id NOT LIKE 'bill-doc-%'").bind(companyId).first()
  const original = copy?.file_key ? await files.get(copy.file_key) : null
  check(
    "the client's copy is among its documents: a received invoice from europio, its e-invoice as the original",
    copy?.kind === 'invoice_in' &&
      copy.party === 'europio s. r. o.' &&
      copy.vs === invoice.number &&
      copy.total_cents === 69700 &&
      copy.category === 'services' &&
      Boolean(original) &&
      (await original.text()).includes(`<cbc:ID>${invoice.number}</cbc:ID>`),
  )
  check(
    "europio's own books hold it as an issued invoice",
    Boolean(await db.prepare("SELECT 1 AS x FROM documents WHERE company_id = ? AND source = 'issued' AND invoice_id = ?").bind(operator.id, invoice.id).first()),
  )
  const told = await db.prepare("SELECT body FROM messages WHERE company_id = ? AND side = 'firmony' AND body LIKE 'Vystavili sme faktúru%'").bind(companyId).first()
  check('the client is told in the app, with the number, the amount and the due day', Boolean(told) && told.body.includes(invoice.number) && plain(told.body).includes('697,00 €'))
  const bell = (await sent()).find((m) => m.to === 'tomas@zelenydvor.test' && m.subject === 'Firmony: nová faktúra od Firmony')
  check('and rung by email, with nothing of it in the email', Boolean(bell) && bell.text.includes('/app/firma#faktury-firmony') && !bell.text.includes('697') && !bell.text.includes(invoice.number))
  res = await admin.post('/ucto/fakturacia/vystavit', { klient: companyId })
  check('issued once, there is nothing more to issue for the month', res.status === 409 && (await db.prepare('SELECT COUNT(*) AS n FROM billing_invoices WHERE client_id = ?').bind(companyId).first())?.n === 1)

  res = await client.get('/app/firma')
  page = plain(await res.text())
  if (capture) writeFileSync(`${capture}/client-bills.html`, page)
  check("the client finds it on its company's page, to pay by its QR code", page.includes('Faktúry od Firmony') && page.includes(`Faktúra č. ${invoice.number}`) && page.includes(`href="/f/${invoice.token}"`))
  res = await client.get('/app')
  page = plain(await res.text())
  check('and among its deadlines until it is paid', page.includes(`Faktúra Firmony č. ${invoice.number}`) && page.includes('Zaplatiť 697,00 €'))
  res = await get(`/f/${invoice.token}`)
  page = await res.text()
  check("its page is europio's invoice with the QR code for the payment", res.status === 200 && page.includes('europio s. r. o.') && page.includes(invoice.number) && page.includes('<svg'))

  // Past its due day: a reminder in the app, once a week.
  await db.prepare('UPDATE invoices SET due_on = ? WHERE id = ?').bind(`${prev}-20`, invoice.id).run()
  res = await admin.get('/ucto/fakturacia')
  page = plain(await res.text())
  check('past its due day it leads the list, with a reminder to send', page.includes('Po splatnosti od') && page.includes(`/ucto/fakturacia/${invoice.id}/pripomenut`))
  const beforeRemind = (await sent()).length
  res = await admin.post(`/ucto/fakturacia/${invoice.id}/pripomenut`, {})
  await settle()
  const reminded = await db.prepare("SELECT body FROM messages WHERE company_id = ? AND body LIKE 'Faktúra č.%bola splatná%'").bind(companyId).all()
  check(
    'a reminder is a message in the app with the account and the symbol, and a doorbell',
    res.status === 303 &&
      reminded.results.length === 1 &&
      plain(reminded.results[0].body).includes('SK43 1100 0000 0029 3456 7890') &&
      (await sent()).slice(beforeRemind).some((m) => m.to === 'tomas@zelenydvor.test' && m.subject === 'Firmony: faktúra po splatnosti'),
  )
  res = await admin.post(`/ucto/fakturacia/${invoice.id}/pripomenut`, {})
  check('a second reminder within the week sends nothing', res.status === 409 && (await db.prepare("SELECT COUNT(*) AS n FROM messages WHERE company_id = ? AND body LIKE 'Faktúra č.%bola splatná%'").bind(companyId).first())?.n === 1)

  // Paid: europio's bank brings the payment with the invoice's number, and the invoice says so everywhere by itself.
  await db.prepare("INSERT INTO accounts (id, company_id, iban) VALUES ('acc-europio', ?, 'SK4311000000002934567890')").bind(operator.id).run()
  await db
    .prepare("INSERT INTO payments (id, company_id, account_id, created_at, booked_on, amount_cents, party, vs, ref) VALUES ('pay-bill-1', ?, 'acc-europio', ?, ?, 69700, 'Zelený dvor s. r. o.', ?, 'bill-1')")
    .bind(operator.id, Math.floor(Date.now() / 1000), today, invoice.number)
    .run()
  await matchCompany(db, operator.id)
  res = await admin.get('/ucto/fakturacia')
  page = plain(await res.text())
  check("paired from europio's statement, the invoice is paid", page.includes('Zaplatená') && !page.includes(`/ucto/fakturacia/${invoice.id}/pripomenut`))
  res = await client.get('/app')
  page = plain(await res.text())
  check('and leaves the client’s deadlines', !page.includes(`Faktúra Firmony č. ${invoice.number}`))

  // A copy that did not reach the client is delivered again by the schedule, once.
  await files.delete(copy.file_key)
  await db.batch([db.prepare('DELETE FROM documents WHERE id = ?').bind(copy.id), db.prepare('UPDATE billing_invoices SET delivered_at = NULL WHERE invoice_id = ?').bind(invoice.id)])
  await billingScheduled({ DB: db, FILES: files }, Date.now(), 'https://firmony.io')
  check(
    'the schedule delivers a copy that did not arrive',
    Boolean(await db.prepare("SELECT 1 AS x FROM documents WHERE id = ? AND source = 'firmony'").bind(copy.id).first()) &&
      Boolean((await db.prepare('SELECT delivered_at FROM billing_invoices WHERE invoice_id = ?').bind(invoice.id).first())?.delivered_at),
  )
  check('and delivering again changes nothing', (await deliverBill({ DB: db, FILES: files }, invoice.id, 'https://firmony.io')) === 'done')

  // In the first days of the next month the administrators are rung once that its invoices wait.
  const nextMonth = addMonths(month, 1)
  const ring = (monthStart(nextMonth) + 86400 + 9 * 3600 + 300) * 1000
  await billingScheduled({ DB: db, FILES: files }, ring, 'https://firmony.io')
  await billingScheduled({ DB: db, FILES: files }, ring + 3_600_000, 'https://firmony.io')
  const rung = await db.prepare('SELECT COUNT(*) AS n FROM outbox WHERE id LIKE ?').bind(`bell:billing:${nextMonth}:%`).first()
  const admins = await db.prepare("SELECT COUNT(*) AS n FROM users WHERE team = 'admin'").first()
  check('on the first days of a month the administrators are rung once', rung?.n === admins?.n && admins.n > 0, `${rung?.n} ${admins?.n}`)
  // The contract's first month as it was, for the checks that follow.
  await db.prepare('UPDATE companies SET start_on = ? WHERE id = ?').bind(startedOn, companyId).run()
  await db.prepare('DELETE FROM closings WHERE company_id = ?').bind(companyId).run()
}
