// What came before our contract is the former accountant's (point 5.2 of the terms): a payment booked before the books
// start asks the client for no document, is in no count, no reminder and no deadline, and no statement of a month
// before them is due. The client sees why on the payment's page. In workerd, through the client's own pages.
import { check } from './check.mjs'
import { writeFileSync } from 'node:fs'

export async function checkBeforeStart({ db, client, companyId, today, capture }) {
  const company = await db.prepare('SELECT start_on FROM companies WHERE id = ?').bind(companyId).first()
  const start = String(company?.start_on ?? '')
  check('the contract starts after today, as a new client\'s does', start > today, `${start} ${today}`)
  const nowS = Math.floor(Date.now() / 1000)
  await db.batch([
    db.prepare("INSERT INTO accounts (id, company_id, iban) VALUES ('acc-start', ?, 'SK2111000000002612345678')").bind(companyId),
    db.prepare("INSERT INTO payments (id, company_id, account_id, created_at, booked_on, amount_cents, party, ref) VALUES ('pa-before', ?, 'acc-start', ?, ?, -4200, 'STARY DODAVATEL', 'start-1')").bind(companyId, nowS, today),
    db.prepare("INSERT INTO payments (id, company_id, account_id, created_at, booked_on, amount_cents, party, ref) VALUES ('pa-ours', ?, 'acc-start', ?, ?, -1500, 'NOVY DODAVATEL', 'start-2')").bind(companyId, nowS, start),
  ])
  try {
    let res = await client.get('/app/platby/pa-before')
    const html = await res.text()
    if (capture) writeFileSync(`${capture}/payment-before.html`, html)
    let page = html.replace(/\u00a0/g, ' ')
    check(
      'a payment before the books start asks for no document, and says why',
      res.status === 200 && page.includes('Táto platba je spred začiatku našej zmluvy.') && !page.includes('K tejto platbe ešte nemáme doklad.'),
      page.slice(page.indexOf('phero'), page.indexOf('phero') + 1500),
    )
    res = await client.get('/app/platby/pa-ours')
    page = (await res.text()).replace(/\u00a0/g, ' ')
    check('one within our books still needs its document', res.status === 200 && page.includes('K tejto platbe ešte nemáme doklad.'))
    res = await client.get('/app/platby')
    page = await res.text()
    check('only ours is among what is missing', page.includes('/app/platby/pa-ours') && !page.includes('/app/platby/pa-before'))
    res = await client.get('/app/platby?filter=vsetky')
    page = await res.text()
    check('both are among all payments, the one before the books said so', page.includes('/app/platby/pa-ours') && page.includes('/app/platby/pa-before') && page.replace(/\u00a0/g, ' ').includes('Pred začiatkom zmluvy'))
    res = await client.get('/app')
    page = (await res.text()).replace(/\u00a0/g, ' ')
    check(
      'the overview counts only ours and asks for no statement of a month before the contract',
      res.status === 200 && !page.includes('Výpis z banky za') && page.includes('K jednej platbe chýba doklad.'),
    )
  } finally {
    await db.batch([
      db.prepare("DELETE FROM payments WHERE id IN ('pa-before', 'pa-ours')"),
      db.prepare("DELETE FROM accounts WHERE id = 'acc-start'"),
    ])
  }
}
