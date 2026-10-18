// The cash box (18 October 2026), in workerd: cash taken from the bank written as PPD with the bank's payment marked
// as money between the company's own accounts, a supplier's invoice paid in cash by VPD (then paid everywhere: the
// document, the payment orders, pairing), more than there is or more than 5 000 € refused, the cash book with its
// balance day by day, the accountant's books holding it on 211, and documents taken back only while the box stays at
// nought or above.
import { check } from './check.mjs'
import { writeFileSync } from 'node:fs'

export async function checkCash({ db, acc, lucia, nowS, signIn, as, day, capture }) {
  const company = 'co-cash'
  const plain = (text) => text.replace(/[  ]/g, ' ')
  const sk = (d) => `${Number(d.slice(8))}. ${Number(d.slice(5, 7))}. ${d.slice(0, 4)}`
  await db.batch([
    db
      .prepare(
        "INSERT INTO companies (id, created_at, name, ico, dic, icdph, address, vat_payer, vat_since, plan, inbox, start_on, accountant_id) VALUES (?, ?, 'TEST-ONLY Hotovosť s. r. o.', '50777840', '2120777840', 'SK2120777840', 'Hlavná 16, 811 01 Bratislava', 1, '2026-01-01', 'firma', 'hoto0001', '2026-01-01', ?)",
      )
      .bind(company, nowS, lucia.id),
    db.prepare("INSERT INTO users (id, created_at, email, name) VALUES ('u-cash', ?, 'cash@example.sk', 'TEST-ONLY Pokladníčka')").bind(nowS),
    db.prepare("INSERT INTO members (company_id, user_id, role, created_at) VALUES (?, 'u-cash', 'owner', ?)").bind(company, nowS),
    db.prepare("INSERT INTO accounts (id, company_id, iban) VALUES ('acc-cash', ?, 'SK3112000000198742637541')").bind(company),
    db
      .prepare(
        "INSERT INTO payments (id, company_id, account_id, created_at, booked_on, amount_cents, party, note, card, ref) VALUES ('pay-atm', ?, 'acc-cash', ?, ?, -30000, NULL, 'VYBER Z BANKOMATU', 1, 'atm-1')",
      )
      .bind(company, nowS, day(-5)),
    db
      .prepare(
        `INSERT INTO documents (id, company_id, created_at, source, status, kind, party, number, vs, party_iban, issued_on, due_on, total_cents, vat_cents, currency, category, vat_mode, vat_lines)
         VALUES ('doc-cash', ?, ?, 'upload', 'read', 'invoice_in', 'TEST-ONLY Opravár s. r. o.', 'F-77', '77', 'SK8975000000000012345671', ?, ?, 12300, 2300, 'EUR', 'repairs', 'domestic', '[{"rate":23,"base":10000,"vat":2300,"deduct":2300}]')`,
      )
      .bind(company, nowS, day(-4), day(10)),
  ])
  const client = as((await signIn('cash@example.sk')).cookie)
  let page = plain(await (await client.get('/app/platby')).text())
  check('the payments lead to the cash box', page.includes('href="/app/pokladna"') && page.includes('Pokladňa'))
  page = plain(await (await client.get('/app/pokladna')).text())
  check('an empty cash box', page.includes('V pokladni teraz') && page.includes('0,00 €') && page.includes('V tomto roku sa v pokladni nič nepohlo'))

  let res = await client.post('/app/pokladna', { strana: 'vydaj', druh: 'wages', den: sk(day(-3)), suma: '100', kto: 'TEST-ONLY Zamestnanec' })
  check('cash that is not there is not paid out', res.status === 422 && plain(await res.text()).includes('V pokladni by chýbalo 100,00 €'))
  res = await client.post('/app/pokladna', { strana: 'prijem', druh: 'owner_in', den: sk(day(-3)), suma: '6 000', kto: 'TEST-ONLY Spoločník' })
  check('more than 5 000 € is never paid in cash', res.status === 422 && plain(await res.text()).includes('nesmie zaplatiť viac ako 5 000 €'))
  const formRaw = await (await client.get('/app/pokladna/nova?strana=prijem')).text()
  if (capture) writeFileSync(`${capture}/cash-form.html`, formRaw)
  check('the form offers the bank payment that took the cash out', formRaw.includes('value="pay-atm"') && plain(formRaw).includes('Výber z banky do pokladne'))
  res = await client.post('/app/pokladna', { strana: 'prijem', druh: 'withdrawal', den: sk(day(-5)), suma: '', platba: 'pay-atm' })
  const ppd = await db.prepare("SELECT id, number, lines, payment_id FROM ledger_entries WHERE company_id = ? AND kind = 'cash' AND cash_kind = 'withdrawal'").bind(company).first()
  const atm = await db.prepare("SELECT exempt, exempt_note FROM payments WHERE id = 'pay-atm'").first()
  const year = day(-5).slice(0, 4)
  check(
    "cash from the bank: PPD numbered in its year, 211 against 261, the bank's payment marked as between own accounts",
    res.status === 303 && ppd?.number === `PPD${year}-001` && ppd.lines === '[{"md":"211","d":"261","cents":30000}]' && atm?.exempt === 'own' && atm.exempt_note === `PPD${year}-001`,
    JSON.stringify([ppd, atm]),
  )

  page = plain(await (await client.get('/app/doklady/doc-cash')).text())
  check(
    'an unpaid invoice offers to be paid in cash',
    page.includes('/app/pokladna/nova?strana=vydaj&amp;druh=doc_out&amp;doklad=doc-cash') || page.includes('/app/pokladna/nova?strana=vydaj&druh=doc_out&doklad=doc-cash'),
  )
  res = await client.post('/app/pokladna', { strana: 'vydaj', druh: 'doc_out', den: sk(day(-2)), doklad: 'doc-cash' })
  const vpd = await db.prepare("SELECT number, lines, document_id, party FROM ledger_entries WHERE company_id = ? AND kind = 'cash' AND cash_kind = 'doc_out'").bind(company).first()
  check(
    "the supplier's invoice paid in cash: VPD, 321 against 211, the invoice's amount and supplier",
    res.status === 303 && vpd?.number === `VPD${year}-001` && vpd.lines === '[{"md":"321","d":"211","cents":12300}]' && vpd.document_id === 'doc-cash' && vpd.party === 'TEST-ONLY Opravár s. r. o.',
    JSON.stringify(vpd),
  )
  res = await client.post('/app/pokladna', { strana: 'vydaj', druh: 'doc_out', den: sk(day(-2)), doklad: 'doc-cash' })
  check('an invoice is paid in cash once', res.status === 422 && plain(await res.text()).includes('Vyberte faktúru'))
  page = plain(await (await client.get('/app/doklady/doc-cash')).text())
  const owed = plain(await (await client.get('/app/uhrady')).text())
  check('then it is paid: its page says so, and it is not offered to pay again', page.includes(`pokladničný doklad VPD${year}-001`) && !owed.includes('TEST-ONLY Opravár'))

  const bookRaw = await (await client.get(`/app/pokladna?rok=${year}`)).text()
  if (capture) writeFileSync(`${capture}/cash.html`, bookRaw)
  page = plain(bookRaw)
  check(
    'the cash book: each document with the balance after it',
    page.includes(`PPD${year}-001`) && page.includes(`VPD${year}-001`) && page.includes('300,00 €') && page.includes('123,00 €') && page.includes('177,00 €'),
  )
  const ledgerPage = plain(await (await acc.get(`/ucto/klienti/${company}/kniha/ucet/211?rok=${year}`)).text())
  check("the accountant's books hold the cash box on 211 with both documents", ledgerPage.includes(`PPD${year}-001`) && ledgerPage.includes(`VPD${year}-001`) && ledgerPage.includes('177,00'))

  res = await client.post(`/app/pokladna/${ppd?.id}/zrusit`, {})
  check('money in that paid what followed is not taken back', res.status === 409 && plain(await res.text()).includes('V pokladni by chýbalo 123,00 €'))
  const vpdId = (await db.prepare('SELECT id FROM ledger_entries WHERE company_id = ? AND number = ?').bind(company, `VPD${year}-001`).first())?.id
  res = await client.post(`/app/pokladna/${vpdId}/zrusit`, {})
  check('a VPD taken back makes its invoice unpaid again', res.status === 303 && plain(await (await client.get('/app/uhrady')).text()).includes('TEST-ONLY Opravár'))
  res = await client.post(`/app/pokladna/${ppd?.id}/zrusit`, {})
  const freed = await db.prepare("SELECT exempt FROM payments WHERE id = 'pay-atm'").first()
  check('then the PPD too, and the bank payment is free again', res.status === 303 && freed?.exempt === null, JSON.stringify(freed))
  res = await client.post('/app/pokladna', { strana: 'prijem', druh: 'owner_in', den: sk(day(-1)), suma: '50', kto: 'TEST-ONLY Spoločník' })
  check(
    "the next PPD of the year takes the next number, a removed one's stays taken",
    (await db.prepare("SELECT number FROM ledger_entries WHERE company_id = ? AND cash_kind = 'owner_in'").bind(company).first())?.number === `PPD${year}-002`,
  )
  check("another company's cash document is not found", (await client.post('/app/pokladna/00000000-0000-4000-8000-000000000000/zrusit', {})).status === 404)
}
