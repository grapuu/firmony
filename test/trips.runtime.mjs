// Business trips at home (18 October 2026), in workerd: a member enters a trip of a payroll employee by a private car
// with breakfast given free on the second day; the meals are asked day by day; the settlement is worked out to the
// cent, kept as the company's document owed to the employee (512 against 333) with the employee's IBAN, offered to
// pay, paired with the payment that came, booked by the accountant from its sheet; a trip with nothing owed makes no
// document; a trip is taken back only while nothing was done with its document.
import { check } from './check.mjs'
import { writeFileSync } from 'node:fs'

export async function checkTrips({ db, acc, lucia, nowS, signIn, as, day, capture }) {
  const company = 'co-trips'
  const plain = (text) => text.replace(/[\u00a0\u202f]/g, ' ')
  const sk = (d, time) => `${Number(d.slice(8))}. ${Number(d.slice(5, 7))}. ${d.slice(0, 4)} ${time}`
  await db.batch([
    db
      .prepare(
        "INSERT INTO companies (id, created_at, name, ico, dic, icdph, address, vat_payer, vat_since, plan, inbox, start_on, accountant_id) VALUES (?, ?, 'TEST-ONLY Cestovná s. r. o.', '50777830', '2120777830', 'SK2120777830', 'Hlavná 15, 811 01 Bratislava', 1, '2026-01-01', 'firma', 'cest0001', '2026-01-01', ?)",
      )
      .bind(company, nowS, lucia.id),
    db.prepare("INSERT INTO users (id, created_at, email, name) VALUES ('u-trips', ?, 'trips@example.sk', 'TEST-ONLY Konateľka')").bind(nowS),
    db.prepare("INSERT INTO members (company_id, user_id, role, created_at) VALUES (?, 'u-trips', 'owner', ?)").bind(company, nowS),
    db.prepare("INSERT INTO accounts (id, company_id, iban) VALUES ('acc-trips', ?, 'SK3112000000198742637541')").bind(company),
    db
      .prepare(
        "INSERT INTO employees (id, company_id, name, insurer, started_on, wage_cents, iban, created_at) VALUES ('emp-trips', ?, 'TEST-ONLY Ján Cestovateľ', '25', '2026-01-01', 150000, 'SK8975000000000012345671', ?)",
      )
      .bind(company, nowS),
  ])
  const client = as((await signIn('trips@example.sk')).cookie)
  let page = plain(await (await client.get('/app/doklady')).text())
  check('the documents lead to business trips', page.includes('href="/app/cesty"') && page.includes('Pracovné cesty'))
  const listRaw = await (await client.get('/app/cesty')).text()
  if (capture) writeFileSync(`${capture}/trips-empty.html`, listRaw)
  check('no trip yet, and the way to enter one', plain(listRaw).includes('Zatiaľ ste nezadali žiadnu pracovnú cestu') && listRaw.includes('href="/app/cesty/nova"'))

  // A trip of two days that ended two days ago: 16:00 to 20:00 the next day.
  const first = day(-3)
  const second = day(-2)
  const form = {
    zamestnanec: 'emp-trips',
    kto: '',
    ucel: 'Montáž u zákazníka',
    odkial: 'Bratislava',
    kam: 'Košice',
    odchod: sk(first, '16:00'),
    navrat: sk(second, '20:00'),
    doprava: 'car',
    km: '800',
    spotreba: '6,5',
    cena: '1,539',
    spz: 'BA123XY',
    jedlo: 'ano',
  }
  let res = await client.post('/app/cesty', { ...form, akcia: 'prepocitat' })
  const recountRaw = await res.text()
  if (capture) writeFileSync(`${capture}/trip-form.html`, recountRaw)
  page = plain(recountRaw)
  check(
    'a recount shows the days of the trip for the meals given free',
    res.status === 200 && page.includes(`name="r-${first}"`) && page.includes(`name="v-${second}"`) && page.includes(`name="dni" value="${first},${second}"`),
  )
  res = await client.post('/app/cesty', { ...form, akcia: 'ulozit' })
  check('saved before the days were shown, the form asks for the meals first', res.status === 422 && plain(await res.text()).includes('Skontrolujte jedlo zadarmo po dňoch'))
  res = await client.post('/app/cesty', { ...form, akcia: 'ulozit', navrat: sk(day(2), '20:00'), dni: '' })
  check('a return in the future is refused', res.status === 422 && plain(await res.text()).includes('návrat nemôže byť v budúcnosti'))

  // The employee is paid already: the payment pairs with the settlement once it is made.
  // 8 hours the first day (9,30 €), 20 hours the second (20,60 € less breakfast 5,15 €), the car 800 km × 0,313 € and
  // 800 × 6,5 / 100 × 1,539 € of fuel (80,03 €).
  const expected = 930 + (2060 - 515) + 25040 + 8003
  await db
    .prepare(
      "INSERT INTO payments (id, company_id, account_id, created_at, booked_on, amount_cents, party, party_iban, ref) VALUES ('pay-trip', ?, 'acc-trips', ?, ?, ?, 'TEST-ONLY JAN CESTOVATEL', 'SK8975000000000012345671', 'trip-1')",
    )
    .bind(company, nowS, day(0), -expected)
    .run()
  res = await client.post('/app/cesty', { ...form, akcia: 'ulozit', dni: `${first},${second}`, [`r-${second}`]: '1' })
  const tripId = (res.headers.get('location') ?? '').match(/\/app\/cesty\/([0-9a-f-]{36})/)?.[1] ?? ''
  const trip = await db.prepare('SELECT number, traveller, iban, total_cents, document_id, result FROM trips WHERE id = ?').bind(tripId).first()
  const doc = await db
    .prepare('SELECT kind, source, party, party_iban, number, total_cents, vat_cents, category, vat_mode, supplied_on, due_on FROM documents WHERE id = ?')
    .bind(trip?.document_id ?? '')
    .first()
  const year = first.slice(0, 4)
  check(
    "saved: numbered in the company's year, the employee's name and IBAN, worked out to the cent",
    res.status === 303 && trip?.number === `CP${year}-001` && trip.traveller === 'TEST-ONLY Ján Cestovateľ' && trip.iban === 'SK8975000000000012345671' && trip.total_cents === expected,
    JSON.stringify(trip),
  )
  check(
    'its document: owed to the employee, 512 travel compensation, outside VAT, of the day of the return, with the IBAN',
    doc?.kind === 'invoice_in' &&
      doc.source === 'trip' &&
      doc.party === 'TEST-ONLY Ján Cestovateľ' &&
      doc.party_iban === 'SK8975000000000012345671' &&
      doc.number === `CP${year}-001` &&
      doc.total_cents === expected &&
      doc.vat_cents === 0 &&
      doc.category === 'allowance' &&
      doc.vat_mode === 'none' &&
      doc.supplied_on === second &&
      doc.due_on > day(0),
    JSON.stringify(doc),
  )
  let linked = null
  for (let i = 0; i < 30 && !linked; i++) {
    linked = await db
      .prepare("SELECT how FROM links WHERE payment_id = 'pay-trip' AND document_id = ?")
      .bind(trip?.document_id ?? '')
      .first()
    if (!linked) await new Promise((r) => setTimeout(r, 100))
  }
  check('the payment to the employee pairs with it by itself', linked?.how === 'auto', JSON.stringify(linked))
  const sheetRaw = await (await client.get(`/app/cesty/${tripId}`)).text()
  if (capture) writeFileSync(`${capture}/trip.html`, sheetRaw)
  page = plain(sheetRaw)
  check(
    'its sheet: each day with its hours and what it is owed, the car, the total and the account',
    page.includes('Vyúčtovanie pracovnej cesty') &&
      page.includes(`č. CP${year}-001`) &&
      page.includes('8 h 00 min') &&
      page.includes('20 h 00 min') &&
      page.includes('zadarmo: raňajky') &&
      page.includes('15,45 €') &&
      page.includes('250,40 €') &&
      page.includes('80,03 €') &&
      page.includes(`${(expected / 100).toFixed(2).replace('.', ',')} €`) &&
      page.includes('SK89 7500 0000 0000 1234 5671') &&
      page.includes('Uhradené'),
  )
  res = await client.post(`/app/cesty/${tripId}/zrusit`, {})
  check('a trip whose document is paired is not taken back', res.status === 303 && (await db.prepare('SELECT removed_at FROM trips WHERE id = ?').bind(tripId).first())?.removed_at === null)
  res = await client.post(`/app/doklady/${trip?.document_id}/zmazat`, {})
  check(
    'nor is its document deleted alone',
    res.status === 303 &&
      (res.headers.get('location') ?? '').endsWith(`/app/cesty/${tripId}`) &&
      (
        await db
          .prepare('SELECT deleted_at FROM documents WHERE id = ?')
          .bind(trip?.document_id ?? '')
          .first()
      )?.deleted_at === null,
  )

  // The accountant books it from its sheet; the books hold it on 512 and 333.
  const bookRaw = await (await acc.get(`/ucto/doklady/${trip?.document_id}`)).text()
  if (capture) writeFileSync(`${capture}/trip-book.html`, bookRaw)
  page = plain(bookRaw)
  check(
    "the accountant's booking screen shows the settlement as its original and the entry 512 against 333",
    page.includes('Vyúčtovanie pracovnej cesty') && page.includes('Vyúčtovanie pracovnej cesty z Firmony') && page.includes('512') && page.includes('333'),
  )

  // A short trip by train: nothing owed, no document; taken back.
  res = await client.post('/app/cesty', {
    kto: 'TEST-ONLY Konateľka',
    ucel: 'Rokovanie',
    odkial: 'Bratislava',
    kam: 'Trnava',
    odchod: sk(day(-1), '8:00'),
    navrat: sk(day(-1), '11:30'),
    doprava: 'public',
    jedlo: 'nie',
    akcia: 'ulozit',
  })
  const shortId = (res.headers.get('location') ?? '').match(/\/app\/cesty\/([0-9a-f-]{36})/)?.[1] ?? ''
  const short = await db.prepare('SELECT number, total_cents, document_id FROM trips WHERE id = ?').bind(shortId).first()
  check(
    'a trip under five hours by train is owed nothing and makes no document',
    short?.number === `CP${day(-1).slice(0, 4)}-002` && short.total_cents === 0 && short.document_id === null,
    JSON.stringify(short),
  )
  res = await client.post(`/app/cesty/${shortId}/zrusit`, {})
  page = plain(await (await client.get('/app/cesty?ok=zrusena')).text())
  check(
    'it is taken back and the list keeps the other',
    res.status === 303 &&
      (await db.prepare('SELECT removed_at FROM trips WHERE id = ?').bind(shortId).first())?.removed_at !== null &&
      page.includes(`CP${year}-001`) &&
      !page.includes(`CP${year}-002`),
  )
  const listed = await (await client.get('/app/cesty')).text()
  if (capture) writeFileSync(`${capture}/trips.html`, listed)
  check("another company's trip is not found", (await client.get('/app/cesty/00000000-0000-4000-8000-000000000000')).status === 404)
}
