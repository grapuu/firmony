// Cost centres (18 October 2026), in workerd: an owner makes the company's centres (a colleague cannot), a code is
// checked and once; documents are given to centres by the client and on the accountant's booking screen; the report
// says each centre's revenues, costs and result from the books, and what is in common; an archived centre takes no new
// documents and stays while it has any. After the review: the booking screen keeps a centre the client gave while it
// was open, a refused deletion shows the document's centre, a credit note takes its invoice's centre.
import { check } from './check.mjs'
import { writeFileSync } from 'node:fs'

export async function checkCenters({ db, acc, lucia, nowS, signIn, as, day, tick, capture }) {
  const company = 'co-centers'
  const plain = (text) => text.replace(/[  ]/g, ' ')
  const doc = (id, kind, category, cents, party) =>
    db
      .prepare(
        `INSERT INTO documents (id, company_id, created_at, source, status, kind, party, number, issued_on, total_cents, vat_cents, currency, category, booked_at)
         VALUES (?, ?, ?, 'upload', 'read', ?, ?, ?, ?, ?, 0, 'EUR', ?, ?)`,
      )
      .bind(id, company, nowS, kind, party, id.toUpperCase(), day(-3), cents, category, nowS)
  await db.batch([
    db
      .prepare(
        "INSERT INTO companies (id, created_at, name, ico, address, vat_payer, plan, inbox, start_on, accountant_id) VALUES (?, ?, 'TEST-ONLY Strediská s. r. o.', '50777860', 'Hlavná 18, 811 01 Bratislava', 0, 'firma', 'stre0001', '2026-01-01', ?)",
      )
      .bind(company, nowS, lucia.id),
    db
      .prepare("INSERT INTO users (id, created_at, email, name) VALUES ('u-centers', ?, 'centers@example.sk', 'TEST-ONLY Riaditeľka'), ('u-centers-2', ?, 'centers2@example.sk', 'TEST-ONLY Kolega')")
      .bind(nowS, nowS),
    db.prepare("INSERT INTO members (company_id, user_id, role, created_at) VALUES (?, 'u-centers', 'owner', ?), (?, 'u-centers-2', 'member', ?)").bind(company, nowS, company, nowS),
    doc('st-inv', 'invoice_out', 'sales', 30000, 'TEST-ONLY Zákazník'),
    doc('st-r1', 'receipt', 'services', 10000, 'TEST-ONLY Upratovanie'),
    doc('st-r2', 'receipt', 'material', 5000, 'TEST-ONLY Papiernictvo'),
    doc('st-r3', 'receipt', 'repairs', 2000, 'TEST-ONLY Opravár'),
  ])
  const owner = as((await signIn('centers@example.sk')).cookie)
  const colleague = as((await signIn('centers2@example.sk')).cookie)
  let page = plain(await (await owner.get('/app/doklady')).text())
  check('the documents lead to the cost centres', page.includes('href="/app/strediska"') && page.includes('Strediská'))
  page = plain(await (await owner.get('/app/strediska')).text())
  check('no centre yet, and the way to make one', page.includes('Firma zatiaľ nemá strediská') && page.includes('name="kod"'))
  check('only an owner makes one', (await colleague.post('/app/strediska', { kod: 'X', nazov: 'X' })).status === 403)
  let res = await owner.post('/app/strediska', { kod: 'Predajňa', nazov: 'Predajňa' })
  check('a code with an accent is refused', res.status === 422 && plain(await res.text()).includes('Kód môže mať len písmená bez diakritiky'))
  res = await owner.post('/app/strediska', { kod: 'PROJEKT-2026-B', nazov: 'Projekt' })
  check(
    'a code too long is refused, not cut',
    res.status === 422 && (await db.prepare("SELECT COUNT(*) AS n FROM cost_centers WHERE company_id = ? AND code LIKE 'PROJEKT%'").bind(company).first())?.n === 0,
  )
  res = await owner.post('/app/strediska', { kod: 'predajna', nazov: 'Predajňa na Hlavnej' })
  await owner.post('/app/strediska', { kod: 'SKLAD', nazov: 'Sklad' })
  const again = await owner.post('/app/strediska', { kod: 'PREDAJNA', nazov: 'Iná' })
  const list = (await db.prepare('SELECT id, code FROM cost_centers WHERE company_id = ? ORDER BY code').bind(company).all()).results
  check('made in capitals, a code once', res.status === 303 && again.status === 409 && JSON.stringify(list.map((c) => c.code)) === '["PREDAJNA","SKLAD"]', JSON.stringify(list))
  const shop = list.find((c) => c.code === 'PREDAJNA')?.id
  const store = list.find((c) => c.code === 'SKLAD')?.id

  page = plain(await (await colleague.get('/app/doklady/st-inv')).text())
  check("a document's page offers the centres", page.includes('name="stredisko"') && page.includes('PREDAJNA Predajňa na Hlavnej'))
  res = await colleague.post('/app/doklady/st-inv/stredisko', { stredisko: shop })
  await colleague.post('/app/doklady/st-r1/stredisko', { stredisko: shop })
  check('any member gives a document its centre', res.status === 303 && (await db.prepare("SELECT center_id FROM documents WHERE id = 'st-inv'").first())?.center_id === shop)
  const bookRaw = await (await acc.get('/ucto/doklady/st-r2')).text()
  check('the booking screen has the centre too', bookRaw.includes('name="stredisko"'))
  res = await acc.post('/ucto/doklady/st-r2', {
    akcia: 'ulozit',
    kind: 'receipt',
    party: 'TEST-ONLY Papiernictvo',
    total: '50,00',
    vat: '',
    category: 'material',
    issued: `${Number(day(-3).slice(8))}. ${Number(day(-3).slice(5, 7))}. ${day(-3).slice(0, 4)}`,
    due: '',
    stredisko: store,
  })
  check('the accountant gives it on booking', res.status === 303 && (await db.prepare("SELECT center_id FROM documents WHERE id = 'st-r2'").first())?.center_id === store)
  await db.batch([
    db.prepare("INSERT INTO companies (id, created_at, name, plan, inbox) VALUES ('co-centers-x', ?, 'TEST-ONLY Iná s. r. o.', 'firma', 'strx0001')").bind(nowS),
    db.prepare("INSERT INTO cost_centers (id, company_id, code, name, created_at) VALUES ('center-of-x', 'co-centers-x', 'CUDZIE', 'Cudzie', ?)").bind(nowS),
  ])
  res = await owner.post('/app/doklady/st-r3/stredisko', { stredisko: 'center-of-x' })
  check("another company's centre is not given", res.status === 404 && (await db.prepare("SELECT center_id FROM documents WHERE id = 'st-r3'").first())?.center_id === null)
  // A booked document cannot be deleted: the page that says so still shows its centre, picked.
  res = await owner.post('/app/doklady/st-r2/zmazat', {})
  check('a refused deletion shows the centre the document has', res.status === 409 && (await res.text()).includes(`<option value="${store}" selected`))

  const year = day(-3).slice(0, 4)
  const month = Number(day(-3).slice(5, 7))
  const raw = await (await owner.get(`/app/strediska?rok=${year}&od=${month}&do=${month}`)).text()
  if (capture) writeFileSync(`${capture}/centers.html`, raw)
  page = plain(raw)
  check(
    "the report: each centre's revenues, costs and result from the books, what is in common, the total",
    page.includes('PREDAJNA') &&
      page.includes('300,00 €') &&
      page.includes('100,00 €') &&
      page.includes('200,00 €') &&
      page.includes('SKLAD') &&
      page.includes('50,00 €') &&
      page.includes('Spoločné') &&
      page.includes('20,00 €') &&
      page.includes('130,00 €'),
  )
  res = await owner.post(`/app/strediska/${store}/archivovat`, {})
  res = await owner.post('/app/doklady/st-r3/stredisko', { stredisko: store })
  check('an archived centre takes no new document', res.status === 404 && (await db.prepare("SELECT center_id FROM documents WHERE id = 'st-r3'").first())?.center_id === null)
  res = await owner.post('/app/doklady/st-r2/stredisko', { stredisko: store })
  check('its document saved again with it changes nothing and is no error', res.status === 303 && (await db.prepare("SELECT center_id FROM documents WHERE id = 'st-r2'").first())?.center_id === store)
  const other = month === 1 ? 12 : month - 1
  const otherYear = month === 1 ? Number(year) - 1 : Number(year)
  const raw2 = await (await owner.get(`/app/strediska?rok=${otherYear}&od=${other}&do=${other}`)).text()
  check('it stays in the report with its documents, also in a month without them', raw2.includes('<th scope="row"><strong>SKLAD</strong>'))

  // The booking screen opened before the client gave a centre: booked, the client's centre stays; changed there, it goes.
  await doc('st-r4', 'receipt', 'material', 1500, 'TEST-ONLY Drogéria').run()
  const before = await (await acc.get('/ucto/doklady/st-r4')).text()
  check('the booking screen carries the centre it showed', before.includes('name="stredisko_bolo" value=""'))
  await colleague.post('/app/doklady/st-r4/stredisko', { stredisko: shop })
  const booking = (extra) => ({
    akcia: 'ulozit',
    kind: 'receipt',
    party: 'TEST-ONLY Drogéria',
    total: '15,00',
    vat: '',
    category: 'material',
    issued: `${Number(day(-3).slice(8))}. ${Number(day(-3).slice(5, 7))}. ${day(-3).slice(0, 4)}`,
    due: '',
    ...extra,
  })
  res = await acc.post('/ucto/doklady/st-r4', booking({ stredisko: '', stredisko_bolo: '' }))
  check(
    'a centre the client gave meanwhile stays when the accountant saves',
    res.status === 303 && (await db.prepare("SELECT center_id FROM documents WHERE id = 'st-r4'").first())?.center_id === shop,
  )
  res = await acc.post('/ucto/doklady/st-r4', booking({ stredisko: '', stredisko_bolo: shop }))
  check('taken off on the booking screen, it goes', res.status === 303 && (await db.prepare("SELECT center_id FROM documents WHERE id = 'st-r4'").first())?.center_id === null)

  // An invoice of a centre: its credit note takes the centre.
  res = await owner.post('/app/faktury', {
    akcia: 'vystavit',
    meno: 'TEST-ONLY Odberateľ',
    adresa: 'Dlhá 2, 040 01 Košice',
    email: '',
    vystavena: `${Number(day(-1).slice(8))}. ${Number(day(-1).slice(5, 7))}. ${day(-1).slice(0, 4)}`,
    dodana: `${Number(day(-1).slice(8))}. ${Number(day(-1).slice(5, 7))}. ${day(-1).slice(0, 4)}`,
    splatna: `${Number(day(13).slice(8))}. ${Number(day(13).slice(5, 7))}. ${day(13).slice(0, 4)}`,
    iban: 'SK31 1200 0000 1987 4263 7541',
    riadky: '1',
    'r0-popis': 'Tovar',
    'r0-mnozstvo': '1',
    'r0-jednotka': 'ks',
    'r0-cena': '100,00',
  })
  const invoiceId = res.headers.get('location')?.match(/\/app\/faktury\/([0-9a-f-]{36})/)?.[1] ?? ''
  const invoiceDoc = (await db.prepare('SELECT document_id FROM invoices WHERE id = ?').bind(invoiceId).first())?.document_id
  await owner.post(`/app/doklady/${invoiceDoc}/stredisko`, { stredisko: shop })
  res = await owner.post('/app/faktury', {
    akcia: 'vystavit',
    dobropis: invoiceId,
    meno: 'x',
    vystavena: `${Number(day(0).slice(8))}. ${Number(day(0).slice(5, 7))}. ${day(0).slice(0, 4)}`,
    dodana: `${Number(day(0).slice(8))}. ${Number(day(0).slice(5, 7))}. ${day(0).slice(0, 4)}`,
    splatna: `${Number(day(14).slice(8))}. ${Number(day(14).slice(5, 7))}. ${day(14).slice(0, 4)}`,
    riadky: '1',
    'r0-popis': 'Vrátený tovar',
    'r0-mnozstvo': '1',
    'r0-jednotka': 'ks',
    'r0-cena': '40,00',
    dovod: 'Vrátený tovar',
  })
  const creditId = res.headers.get('location')?.match(/\/app\/faktury\/([0-9a-f-]{36})/)?.[1] ?? ''
  const creditDoc = await db.prepare('SELECT d.center_id FROM invoices i JOIN documents d ON d.id = i.document_id WHERE i.id = ?').bind(creditId).first()
  check("a credit note takes its invoice's centre", res.status === 303 && creditDoc?.center_id === shop, JSON.stringify(creditDoc))

  // An invoice issued for a centre picked on its form: its document takes it; the form offers the centres.
  page = plain(await (await owner.get('/app/faktury/nova')).text())
  check('the invoice form offers the centres', page.includes('name="stredisko"') && page.includes('Výnos faktúry sa v prehľade stredísk započíta'))
  res = await owner.post('/app/faktury', {
    akcia: 'vystavit',
    meno: 'TEST-ONLY Odberateľ strediska',
    adresa: 'Dlhá 2, 040 01 Košice',
    email: '',
    vystavena: `${Number(day(-1).slice(8))}. ${Number(day(-1).slice(5, 7))}. ${day(-1).slice(0, 4)}`,
    dodana: `${Number(day(-1).slice(8))}. ${Number(day(-1).slice(5, 7))}. ${day(-1).slice(0, 4)}`,
    splatna: `${Number(day(13).slice(8))}. ${Number(day(13).slice(5, 7))}. ${day(13).slice(0, 4)}`,
    iban: 'SK31 1200 0000 1987 4263 7541',
    riadky: '1',
    'r0-popis': 'Služba',
    'r0-mnozstvo': '1',
    'r0-jednotka': 'ks',
    'r0-cena': '50,00',
    stredisko: shop,
  })
  const centred = res.headers.get('location')?.match(/\/app\/faktury\/([0-9a-f-]{36})/)?.[1] ?? ''
  const centredDoc = await db.prepare('SELECT i.center_id AS invoice_center, d.center_id FROM invoices i JOIN documents d ON d.id = i.document_id WHERE i.id = ?').bind(centred).first()
  check('an invoice issued for a centre: kept with it, and its document takes it', centredDoc?.invoice_center === shop && centredDoc.center_id === shop, JSON.stringify(centredDoc))
  page = plain(await (await owner.get(`/app/faktury/nova?podla=${centred}`)).text())
  check('a similar invoice starts from its centre', page.includes(`<option value="${shop}" selected`))

  // An issued invoice's centre is its document's: given another there, a similar invoice starts from that one; an
  // archived centre is no start for a new invoice and is refused on the form, said, not dropped.
  await owner.post(`/app/strediska/${store}/obnovit`, {})
  const centredDocId = (await db.prepare('SELECT document_id FROM invoices WHERE id = ?').bind(centred).first())?.document_id
  await owner.post(`/app/doklady/${centredDocId}/stredisko`, { stredisko: store })
  page = plain(await (await owner.get(`/app/faktury/nova?podla=${centred}`)).text())
  check('a similar invoice starts from the centre its document has now', page.includes(`<option value="${store}" selected`))
  await owner.post(`/app/strediska/${store}/archivovat`, {})
  page = plain(await (await owner.get(`/app/faktury/nova?podla=${centred}`)).text())
  check('a similar invoice of an archived centre starts with none', !page.includes(`<option value="${store}" selected`) && page.includes('name="stredisko"'))
  res = await owner.post('/app/faktury', {
    akcia: 'koncept',
    meno: 'TEST-ONLY Odberateľ strediska',
    adresa: 'Dlhá 2, 040 01 Košice',
    riadky: '1',
    'r0-popis': 'Služba',
    'r0-mnozstvo': '1',
    'r0-jednotka': 'ks',
    'r0-cena': '50,00',
    stredisko: store,
  })
  check('an archived centre on the form is refused with why, nothing kept', res.status === 422 && plain(await res.text()).includes('Toto stredisko je archivované a nové faktúry neberie'))
  await owner.post(`/app/strediska/${store}/obnovit`, {})

  // A repeat follows its invoice's document: given another centre there, the next invoice is issued for that one.
  await owner.post(`/app/doklady/${centredDocId}/stredisko`, { stredisko: store })
  const skDay = (d) => `${Number(d.slice(8))}. ${Number(d.slice(5, 7))}. ${d.slice(0, 4)}`
  res = await owner.post(`/app/faktury/${centred}/opakovat`, { kazdych: '1', od: skDay(day(0)), do: '', poslat: '' })
  await tick(Date.now())
  let repeated = null
  for (let i = 0; i < 30 && !repeated; i++) {
    repeated = await db
      .prepare('SELECT i.center_id AS invoice_center, d.center_id FROM invoices i JOIN documents d ON d.id = i.document_id WHERE i.company_id = ? AND i.repeat_id IS NOT NULL')
      .bind(company)
      .first()
    if (!repeated) await new Promise((r) => setTimeout(r, 100))
  }
  check("a repeat's next invoice is issued for the centre its invoice's document has now", res.status === 303 && repeated?.center_id === store && repeated.invoice_center === store, JSON.stringify(repeated))
  await owner.post(`/app/doklady/${centredDocId}/stredisko`, { stredisko: shop })

  // A supplier's rule remembers the centre: the supplier's next document waiting gets it.
  await db.batch(
    ['st-c1', 'st-c2'].map((id) =>
      db
        .prepare(
          `INSERT INTO documents (id, company_id, created_at, source, status, kind, party, party_ico, number, issued_on, total_cents, vat_cents, currency, category)
           VALUES (?, ?, ?, 'upload', 'read', 'receipt', 'TEST-ONLY Čistiareň s. r. o.', '50777861', ?, ?, 3000, 0, 'EUR', 'services')`,
        )
        .bind(id, company, nowS, id.toUpperCase(), day(-2)),
    ),
  )
  res = await acc.post('/ucto/doklady/st-c1', {
    akcia: 'zauctovat',
    kind: 'receipt',
    party: 'TEST-ONLY Čistiareň s. r. o.',
    ico: '50777861',
    total: '30,00',
    vat: '',
    category: 'services',
    issued: `${Number(day(-2).slice(8))}. ${Number(day(-2).slice(5, 7))}. ${day(-2).slice(0, 4)}`,
    due: '',
    remember: '1',
    stredisko: store,
    stredisko_bolo: '',
  })
  const rule = await db.prepare('SELECT center_id FROM supplier_rules WHERE company_id = ? AND key LIKE ?').bind(company, '%50777861%').first()
  const next = await db.prepare("SELECT center_id, proposal FROM documents WHERE id = 'st-c2'").first()
  check(
    "the rule keeps the centre and gives it to the supplier's next document",
    res.status === 303 && rule?.center_id === store && next?.center_id === store && next.proposal === 'rule',
    JSON.stringify([rule, next]),
  )
  page = plain(await (await acc.get(`/ucto/klienti/${company}`)).text())
  check("the client's page names the rule's centre", page.includes('stredisko SKLAD'))
  res = await owner.post('/app/faktury', {
    akcia: 'vystavit',
    meno: 'TEST-ONLY Čistiareň s. r. o.',
    ico: '50777861',
    adresa: 'Dlhá 2, 040 01 Košice',
    email: '',
    vystavena: `${Number(day(-1).slice(8))}. ${Number(day(-1).slice(5, 7))}. ${day(-1).slice(0, 4)}`,
    dodana: `${Number(day(-1).slice(8))}. ${Number(day(-1).slice(5, 7))}. ${day(-1).slice(0, 4)}`,
    splatna: `${Number(day(13).slice(8))}. ${Number(day(13).slice(5, 7))}. ${day(13).slice(0, 4)}`,
    iban: 'SK31 1200 0000 1987 4263 7541',
    riadky: '1',
    'r0-popis': 'Prenájom',
    'r0-mnozstvo': '1',
    'r0-jednotka': 'ks',
    'r0-cena': '80,00',
  })
  const toSupplier = await db
    .prepare('SELECT d.category, d.center_id, d.proposal FROM invoices i JOIN documents d ON d.id = i.document_id WHERE i.id = ?')
    .bind(res.headers.get('location')?.match(/\/app\/faktury\/([0-9a-f-]{36})/)?.[1] ?? '')
    .first()
  check(
    'an invoice issued to a supplier with a rule keeps its revenue and no centre of the rule',
    toSupplier?.category === 'sales' && toSupplier.center_id === null && toSupplier.proposal !== 'rule',
    JSON.stringify(toSupplier),
  )

  // Budgets of a year (owners): the report compares the months with their share of the year's.
  page = plain(await (await owner.get(`/app/strediska?rok=${year}`)).text())
  check('the budgets of the year, a field for each centre in use', page.includes(`name="prijmy_${shop}"`) && page.includes(`name="naklady_${store}"`) && page.includes(`Rozpočet na rok ${year}`))
  check('only an owner sets them', (await colleague.post('/app/strediska/rozpocet', { rok: year, [`naklady_${shop}`]: '1200' })).status === 403)
  res = await owner.post('/app/strediska/rozpocet', { rok: year, [`prijmy_${shop}`]: 'veľa', [`naklady_${shop}`]: '1 200' })
  const budgets = async () => (await db.prepare('SELECT center_id, year, revenue, costs FROM cost_center_budgets WHERE company_id = ? ORDER BY center_id').bind(company).all()).results
  check('an amount that is none is refused and nothing kept', res.status === 422 && plain(await res.text()).includes('Sumu napíšte v eurách') && (await budgets()).length === 0)
  res = await owner.post('/app/strediska/rozpocet', { rok: year, [`prijmy_${shop}`]: '3 600', [`naklady_${shop}`]: '1 200', [`prijmy_${store}`]: '', [`naklady_${store}`]: '' })
  const kept = await budgets()
  check(
    'kept for the centre that has one, none for a centre left empty',
    res.status === 303 && kept.length === 1 && kept[0].center_id === shop && kept[0].revenue === 360000 && kept[0].costs === 120000 && kept[0].year === Number(year),
    JSON.stringify(kept),
  )
  page = plain(await (await owner.get(`/app/strediska?rok=${year}&od=${month}&do=${month}`)).text())
  check("a month's figures against a twelfth of the year's budget", page.includes('z rozpočtu 300,00 €:') && page.includes('z rozpočtu 100,00 €:'))
  page = plain(await (await colleague.get(`/app/strediska?rok=${year}`)).text())
  check('a colleague reads the budgets', page.includes('výnosy 3 600,00 €, náklady 1 200,00 €') && !page.includes(`name="prijmy_${shop}"`))
  await owner.post('/app/strediska/rozpocet', { rok: year, [`prijmy_${shop}`]: '3 600', [`naklady_${shop}`]: '1 200', [`prijmy_${store}`]: '100', [`naklady_${store}`]: '50' })
  res = await owner.post('/app/strediska/rozpocet', { rok: year, [`prijmy_${shop}`]: '3 600', [`naklady_${shop}`]: '1 300' })
  const after = await budgets()
  check(
    'a centre the form did not show keeps its budget',
    res.status === 303 && after.find((b) => b.center_id === store)?.revenue === 10000 && after.find((b) => b.center_id === shop)?.costs === 130000,
    JSON.stringify(after),
  )

  // Depreciation by cost centre: an asset of the shop, its month's depreciation in the shop's costs.
  res = await acc.post(`/ucto/klienti/${company}/kniha/majetok`, {
    nazov: 'TEST-ONLY Pokladničný pult',
    ucet: '022',
    zaradenie: '2026-01-01',
    cena: '2 400,00',
    skupina: '1',
    metoda: 'straight',
    uctovne: 'tax',
    mesiace: '',
    povod: 'purchase',
    opravky: '',
    danove: '',
    roky: '',
    poznamka: '',
    stredisko: shop,
  })
  const asset = await db.prepare('SELECT id, center_id FROM assets WHERE company_id = ?').bind(company).first()
  check('an asset given to a centre on the register', res.status === 303 && asset?.center_id === shop, JSON.stringify(asset))
  page = plain(await (await acc.get(`/ucto/klienti/${company}/kniha/majetok/${asset.id}`)).text())
  check("the asset's page names its centre and offers it", page.includes('Stredisko PREDAJNA') && page.includes('name="stredisko"'))
  res = await acc.post(`/ucto/klienti/${company}/kniha/majetok/${asset.id}`, {
    nazov: 'TEST-ONLY Pokladničný pult',
    ucet: '022',
    zaradenie: '2026-01-01',
    cena: '2 400,00',
    skupina: '1',
    metoda: 'straight',
    uctovne: 'tax',
    povod: 'purchase',
    stredisko: 'f'.repeat(8) + '-0000-4000-8000-' + '0'.repeat(12),
  })
  check('a centre that is none is refused with why', res.status === 422 && plain(await res.text()).includes('Toto stredisko neexistuje alebo je archivované'))
  const januaryCosts = async () => {
    const raw = await (await owner.get('/app/strediska?rok=2026&od=1&do=1')).text()
    // The cells hold the budget's share after the amount (a span): the costs are the second cell's text before it.
    const m = raw.match(/<strong>PREDAJNA<\/strong>[^<]*<\/th><td class="num">.*?<\/td><td class="num">([^<]*)/)
    return plain(m?.[1] ?? '')
  }
  const january = await januaryCosts()
  check("the centres' report: January's depreciation (2 400 € in four years, 50 € a month) in the shop's costs", january === '50,00 €', january)
}
