// Payment orders (18 October 2026), in workerd: the suppliers' invoices the company owes are listed on "Na úhradu",
// those with an IBAN in euros ticked, the others to pay by hand with the reason; the order is kept and its file is
// pain.001.001.03 the schema takes, with the symbols as Slovak banks read them; what is in an order is said and not
// ticked again; nothing of another company gets in.
import { readFileSync, writeFileSync } from 'node:fs'
import { validateXML } from 'xmllint-wasm'
import { check } from './check.mjs'

export async function checkPayOrders({ db, nowS, signIn, as, day, capture }) {
  const company = 'co-payorder'
  const plain = (text) => text.replace(/[  ]/g, ' ')
  const sk = (d) => `${Number(d.slice(8))}. ${Number(d.slice(5, 7))}. ${d.slice(0, 4)}`
  const doc = (id, owner, fields) =>
    db
      .prepare(
        `INSERT INTO documents (id, company_id, created_at, source, status, kind, party, number, vs, party_iban, issued_on, due_on, total_cents, vat_cents, currency, category, paid_privately)
         VALUES (?, ?, ?, 'upload', 'read', 'invoice_in', ?, ?, ?, ?, ?, ?, ?, 0, ?, 'services', ?)`,
      )
      .bind(id, owner, nowS, fields.party, fields.number, fields.vs ?? null, fields.iban ?? null, day(-20), fields.due, fields.cents, fields.currency ?? 'EUR', fields.privately ? 1 : 0)
  await db.batch([
    db
      .prepare(
        "INSERT INTO companies (id, created_at, name, ico, dic, icdph, address, vat_payer, vat_since, plan, inbox, start_on) VALUES (?, ?, 'TEST-ONLY Platiteľ faktúr s. r. o.', '50777811', '2120777811', 'SK2120777811', 'Hlavná 12, 811 01 Bratislava', 1, '2026-01-01', 'firma', 'plat0001', '2026-01-01')",
      )
      .bind(company, nowS),
    db.prepare("INSERT INTO users (id, created_at, email, name) VALUES ('u-payorder', ?, 'payorder@example.sk', 'TEST-ONLY Platiteľka')").bind(nowS),
    db.prepare("INSERT INTO members (company_id, user_id, role, created_at) VALUES (?, 'u-payorder', 'owner', ?)").bind(company, nowS),
    db.prepare("INSERT INTO accounts (id, company_id, iban) VALUES ('acc-payorder', ?, 'SK3112000000198742637541')").bind(company),
    doc('po-1', company, { party: 'TEST-ONLY Hostingový dom s. r. o.', number: 'F2026118', vs: '2026118', iban: 'SK89 7500 0000 0000 1234 5671', due: day(-2), cents: 12300 }),
    doc('po-2', company, { party: 'TEST-ONLY Kancelária a.s.', number: '77', iban: 'SK3112000000198742637541', due: day(10), cents: 5990 }),
    doc('po-3', company, { party: 'TEST-ONLY Bez účtu s. r. o.', number: 'B-1', vs: '1', due: day(5), cents: 1000 }),
    doc('po-4', company, { party: 'TEST-ONLY Cloud Inc.', number: 'US-9', iban: 'SK8975000000000012345671', due: day(5), cents: 10000, currency: 'USD' }),
    doc('po-5', company, { party: 'TEST-ONLY Súkromne s. r. o.', number: 'S-1', iban: 'SK8975000000000012345671', due: day(5), cents: 700, privately: true }),
    doc('po-6', company, { party: 'TEST-ONLY Zaplatené s. r. o.', number: 'Z-1', iban: 'SK8975000000000012345671', due: day(5), cents: 800 }),
    db
      .prepare("INSERT INTO payments (id, company_id, account_id, created_at, booked_on, amount_cents, party, ref) VALUES ('pay-po-6', ?, 'acc-payorder', ?, ?, -800, 'ZAPLATENE', 'po-6')")
      .bind(company, nowS, day(-1)),
    db.prepare("INSERT INTO links (document_id, payment_id, company_id, how, created_at) VALUES ('po-6', 'pay-po-6', ?, 'client', ?)").bind(company, nowS),
  ])
  const client = as((await signIn('payorder@example.sk')).cookie)
  let page = plain(await (await client.get('/app/doklady')).text())
  check('the documents lead to what is owed', page.includes('href="/app/uhrady"') && page.includes('Na úhradu'))
  const raw = await (await client.get('/app/uhrady')).text()
  if (capture) writeFileSync(`${capture}/payorders.html`, raw)
  page = plain(raw)
  check(
    "owed: the suppliers' invoices not paid, those with an IBAN in euros ticked, the others to pay by hand with why",
    page.includes('value="po-1"') &&
      page.includes('value="po-2"') &&
      !page.includes('value="po-3"') &&
      !page.includes('value="po-4"') &&
      !page.includes('TEST-ONLY Súkromne') &&
      !page.includes('TEST-ONLY Zaplatené') &&
      page.includes('Na doklade nie je IBAN dodávateľa') &&
      page.includes('v inej mene ako euro') &&
      page.includes('po splatnosti od') &&
      page.includes('192,90 €'),
  )
  // A browser sends each ticked box as its own field.
  const order = (extra) => {
    const fields = { ucet: 'acc-payorder', den: sk(day(1)), doklad: ['po-1', 'po-2', 'po-3', 'other-company-doc'], ...extra }
    return client.form(
      '/app/uhrady',
      Object.entries(fields).flatMap(([key, value]) => (Array.isArray(value) ? value.map((v) => [key, v]) : [[key, value]])),
    )
  }
  let res = await order({ doklad: [] })
  check('an order needs an invoice', res.status === 422 && plain(await res.text()).includes('Označte aspoň jednu faktúru'))
  res = await order({ den: sk(day(-1)) })
  check('and a day not in the past', res.status === 422 && plain(await res.text()).includes('nie skôr ako dnes'))
  res = await order({ ucet: 'acc-other' })
  check("and the company's own account", res.status === 422 && plain(await res.text()).includes('Vyberte účet'))
  res = await order({})
  const orderId = (res.headers.get('location') ?? '').match(/prikaz=([0-9a-f-]{36})/)?.[1] ?? ''
  const kept = await db.prepare('SELECT account_iban, execute_on, count, total_cents FROM payment_orders WHERE id = ?').bind(orderId).first()
  const items = (await db.prepare('SELECT document_id FROM payment_order_items WHERE order_id = ? ORDER BY document_id').bind(orderId).all()).results.map((r) => r.document_id)
  check(
    'the order is kept with the payable invoices only, whatever was posted',
    res.status === 303 && kept?.execute_on === day(1) && kept.count === 2 && kept.total_cents === 18290 && JSON.stringify(items) === '["po-1","po-2"]',
    JSON.stringify([kept, items]),
  )
  page = plain(await (await client.get(`/app/uhrady?ok=prikaz&prikaz=${orderId}`)).text())
  check(
    'the page offers its file, says what is in an order and does not tick it again',
    page.includes('Príkaz je pripravený') &&
      page.includes(`/app/uhrady/${orderId}/xml`) &&
      page.includes('v príkaze na') &&
      !/value="po-1"[^>]*checked/.test(page) &&
      page.includes('Pripravené príkazy'),
  )
  res = await client.get(`/app/uhrady/${orderId}/xml`)
  const xml = await res.text()
  const schema = readFileSync(new URL('./xsd/pain.001.001.03.xsd', import.meta.url), 'utf8')
  const valid = await validateXML({ xml: [{ fileName: 'prikaz.xml', contents: xml }], schema: [{ fileName: 'pain.001.001.03.xsd', contents: schema }] })
  check(
    'its file: pain.001.001.03 the schema takes, from the account, with each symbol as Slovak banks read it',
    (res.headers.get('content-disposition') ?? '').includes(`prikaz-${day(1)}.xml`) &&
      valid.valid &&
      xml.includes('<CtrlSum>182.90</CtrlSum>') &&
      xml.includes('<IBAN>SK3112000000198742637541</IBAN>') &&
      xml.includes('<EndToEndId>/VS2026118/SS/KS</EndToEndId>') &&
      xml.includes('<IBAN>SK8975000000000012345671</IBAN>'),
    valid.errors?.map((e) => e.message).join(' | '),
  )
  check("another company's order is not found", (await client.get('/app/uhrady/00000000-0000-4000-8000-000000000000/xml')).status === 404)

  // Approving before paying: an owner turns it on; an invoice goes into an order only once an owner approved it.
  await db.batch([
    db.prepare("INSERT INTO users (id, created_at, email, name) VALUES ('u-payorder-2', ?, 'payorder2@example.sk', 'TEST-ONLY Kolegyňa')").bind(nowS),
    db.prepare("INSERT INTO members (company_id, user_id, role, created_at) VALUES (?, 'u-payorder-2', 'member', ?)").bind(company, nowS),
  ])
  const colleague = as((await signIn('payorder2@example.sk')).cookie)
  check('only an owner turns approving on', (await colleague.post('/app/firma/schvalovanie', { zapnut: '1' })).status === 403)
  res = await client.post('/app/firma/schvalovanie', { zapnut: '1' })
  check('an owner turns it on', res.status === 303 && (await db.prepare('SELECT approvals FROM companies WHERE id = ?').bind(company).first())?.approvals === 1)
  page = plain(await (await client.get('/app/uhrady')).text())
  check('then nothing unapproved can be ticked: it waits for approval', !page.includes('value="po-1"') && !page.includes('value="po-2"') && page.includes('Čaká na schválenie'))
  page = plain(await (await colleague.get('/app/doklady/po-1')).text())
  check(
    'a colleague sees that it waits and cannot approve it',
    page.includes('Faktúra čaká na schválenie') && !page.includes('/app/doklady/po-1/schvalit') && (await colleague.post('/app/doklady/po-1/schvalit', {})).status === 403,
  )
  res = await client.post('/app/doklady/po-1/schvalit', {})
  const approved = await db.prepare('SELECT approved_at, approved_by FROM documents WHERE id = ?').bind('po-1').first()
  page = plain(await (await client.get('/app/doklady/po-1')).text())
  check(
    'an owner approves it, and the document says who did',
    res.status === 303 && approved?.approved_by === 'u-payorder' && page.includes('Schválil(a) TEST-ONLY Platiteľka') && page.includes('/app/doklady/po-1/neschvalit'),
  )
  page = plain(await (await client.get('/app/uhrady')).text())
  check('the approved one can go into an order, the other still waits', page.includes('value="po-1"') && !page.includes('value="po-2"'))
  res = await order({ doklad: ['po-1', 'po-2'] })
  const second = (res.headers.get('location') ?? '').match(/prikaz=([0-9a-f-]{36})/)?.[1] ?? ''
  const secondItems = (await db.prepare('SELECT document_id FROM payment_order_items WHERE order_id = ?').bind(second).all()).results.map((r) => r.document_id)
  check('and only it gets in, whatever was posted', res.status === 303 && JSON.stringify(secondItems) === '["po-1"]', JSON.stringify(secondItems))
  await client.post('/app/doklady/po-1/neschvalit', {})
  check('an approval taken back', (await db.prepare('SELECT approved_at FROM documents WHERE id = ?').bind('po-1').first())?.approved_at === null)
}
