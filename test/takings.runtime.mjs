// The day's takings of an eKasa till (18 October 2026), in workerd: written from the cash box by rate, with the card
// part; booked at once as the company's document (cash into the cash box, cards on their way); in the VAT return's rows
// and the control statement's D.1; never paired with a bank payment or among the documents without a payment; taken back
// unless its cash was paid out since; refused in a period the accountant locked; kept an issued document on the booking
// screen.
import { check } from './check.mjs'
import { writeFileSync } from 'node:fs'

export async function checkTakings({ db, acc, lucia, nowS, signIn, as, day, capture }) {
  const company = 'co-takings'
  const plain = (text) => text.replace(/[  ]/g, ' ')
  const sk = (d) => `${Number(d.slice(8))}. ${Number(d.slice(5, 7))}. ${d.slice(0, 4)}`
  // The month before this one is the first VAT period; the books start with the year.
  const now = new Date(`${day(0)}T12:00:00Z`)
  const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)).toISOString().slice(0, 10)
  const second = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 2)).toISOString().slice(0, 10)
  const period = first.slice(0, 7)
  const lockedDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 10)).toISOString().slice(0, 10)
  const lockedEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 0)).toISOString().slice(0, 10)
  await db.batch([
    db
      .prepare(
        "INSERT INTO companies (id, created_at, name, ico, dic, icdph, address, vat_payer, vat_since, plan, inbox, start_on, accountant_id) VALUES (?, ?, 'TEST-ONLY Obchodík s. r. o.', '50777870', '2120777870', 'SK2120777870', 'Hlavná 19, 811 01 Bratislava', 1, ?, 'firma', 'trzb0001', ?, ?)",
      )
      .bind(company, nowS, first, `${lockedDay.slice(0, 4)}-01-01`, lucia.id),
    db.prepare("INSERT INTO users (id, created_at, email, name) VALUES ('u-takings', ?, 'takings@example.sk', 'TEST-ONLY Predavačka')").bind(nowS),
    db.prepare("INSERT INTO members (company_id, user_id, role, created_at) VALUES (?, 'u-takings', 'owner', ?)").bind(company, nowS),
    db.prepare("INSERT INTO accounts (id, company_id, iban) VALUES ('acc-takings', ?, 'SK3112000000198742637541')").bind(company),
  ])
  const client = as((await signIn('takings@example.sk')).cookie)
  let page = plain(await (await client.get('/app/pokladna')).text())
  check('the cash box leads to the takings', page.includes('href="/app/trzby"') && page.includes('Tržby z eKasy'))
  const raw = await (await client.get('/app/trzby')).text()
  if (capture) writeFileSync(`${capture}/takings.html`, raw)
  page = plain(raw)
  check(
    'the form asks the takings by rate, their VAT and the card part',
    ['name="trzba_23"', 'name="trzba_19"', 'name="trzba_5"', 'name="trzba_0"', 'name="dph_23"', 'name="karta"'].every((s) => page.includes(s)) && page.includes('V tomto roku ste zatiaľ nezapísali'),
  )
  let res = await client.post('/app/trzby', { den: sk(first) })
  check('nothing written is refused', res.status === 422 && plain(await res.text()).includes('Zapíšte aspoň jednu tržbu'))
  res = await client.post('/app/trzby', { den: sk(first), trzba_23: '10,00', karta: '20,00' })
  check('more by card than the takings is refused', res.status === 422 && plain(await res.text()).includes('Kartou nemohlo prísť viac'))
  res = await client.post('/app/trzby', { den: sk(day(1)), trzba_23: '10,00' })
  check('a day ahead is refused', res.status === 422)

  res = await client.post('/app/trzby', { den: sk(first), cislo: 'Z 245', trzba_23: '123,00', trzba_19: '11,90', trzba_0: '5,00', karta: '50,00', druh: 'sales_goods' })
  const one = await db
    .prepare("SELECT id, kind, total_cents, vat_cents, takings_cash, booked_at, vat_mode, vat_lines, number, category FROM documents WHERE company_id = ? AND source = 'takings' AND issued_on = ?")
    .bind(company, first)
    .first()
  check(
    'a day written: an issued document of its own, booked at once, its VAT by rate worked out, the cash part kept',
    res.status === 303 &&
      one?.kind === 'invoice_out' &&
      one.total_cents === 13990 &&
      one.vat_cents === 2490 &&
      one.takings_cash === 8990 &&
      typeof one.booked_at === 'number' &&
      one.vat_mode === 'domestic' &&
      one.number === 'Z 245' &&
      one.category === 'sales_goods' &&
      JSON.parse(one.vat_lines).some((l) => l.rate === 23 && l.base === 10000 && l.vat === 2300) &&
      JSON.parse(one.vat_lines).some((l) => l.rate === 0 && l.base === 500),
    JSON.stringify(one),
  )
  res = await client.post('/app/trzby', { den: sk(second), trzba_23: '246,00', dph_23: '45,99', karta: '246,00', druh: 'sales' })
  const two = await db.prepare("SELECT id, vat_lines, takings_cash FROM documents WHERE company_id = ? AND source = 'takings' AND issued_on = ?").bind(company, second).first()
  check('the VAT as the closing says it, all by card', res.status === 303 && JSON.parse(two?.vat_lines ?? '[]')[0]?.vat === 4599 && two.takings_cash === 0, JSON.stringify(two))
  page = plain(await (await client.get(`/app/trzby?rok=${first.slice(0, 4)}`)).text())
  check('the list of the year with its total', page.includes('Z 245') && page.includes('139,90 €') && page.includes('385,90 €'))
  page = plain(await (await client.get(`/app/pokladna?rok=${first.slice(0, 4)}`)).text())
  check('the cash part is in the cash box', page.includes('89,90 €') && page.includes('Tržba z eKasy'))
  page = plain(await (await client.get('/app/doklady?filter=bez-platby')).text())
  const all = plain(await (await client.get('/app/doklady')).text())
  check('among the documents, but never one waiting for a bank payment', all.includes('Tržba z eKasy') && !page.includes('Tržba z eKasy'))

  // The accountant: the VAT page has the rows and D.1, the books 211, 261, 604, 602 and 343.200.
  page = plain(await (await acc.get(`/ucto/klienti/${company}/dph?obdobie=${period}`)).text())
  check('the VAT page has D.1 of the control statement and the takings in the return', page.includes('D.1 Tržby z eKasy') && page.includes('300,01'), page.match(/D\.[12][^<]{0,60}/g)?.join(' '))
  res = await acc.post(`/ucto/doklady/${one.id}`, { akcia: 'ulozit', kind: 'invoice_in', party: 'Tržba z eKasy', total: '139,90', vat: '24,90', category: 'sales_goods', issued: sk(first), due: '' })
  check('the booking screen keeps it an issued document', res.status === 422 && plain(await res.text()).includes('Je to denná tržba z eKasy'))

  // Taken back: not while its cash was paid out since; then it goes.
  res = await client.post('/app/pokladna', { strana: 'vydaj', druh: 'deposit', den: sk(second), suma: '89,90' })
  check('its cash put into the bank', res.status === 303)
  res = await client.post(`/app/trzby/${one.id}/zrusit`, {})
  check('takings whose cash was paid out since are not taken back', res.status === 409 && plain(await res.text()).includes('pokladňa by klesla pod nulu'))
  res = await client.post(`/app/trzby/${two.id}/zrusit`, {})
  const gone = await db.prepare('SELECT deleted_at FROM documents WHERE id = ?').bind(two.id).first()
  check('takings all by card are taken back', res.status === 303 && typeof gone?.deleted_at === 'number')
  res = await client.post(`/app/doklady/${one.id}/zmazat`, {})
  check("the documents' delete leads to the takings", res.status === 303 && (res.headers.get('location') ?? '').startsWith('/app/trzby'))

  // A period the accountant locked takes no takings.
  await db
    .prepare("INSERT INTO period_locks (company_id, through_on, version, change_id, changed_at, changed_by, reason) VALUES (?, ?, 1, 'lock-co-takings', ?, ?, 'TEST-ONLY uzávierka')")
    .bind(company, lockedEnd, nowS, lucia.id)
    .run()
  res = await client.post('/app/trzby', { den: sk(lockedDay), trzba_23: '12,30' })
  check('a locked period takes no takings', res.status === 409 && plain(await res.text()).includes('účtovníčka uzavreté'))
}
