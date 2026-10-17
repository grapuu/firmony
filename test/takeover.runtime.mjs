// Taking a client over (17 October 2026), in workerd through the accountant's pages: the trial balance read into the
// opening balances' form (a large one too, past the old 8 kB limit of a form), the open items from a CSV and from
// Pohoda's XML (all or none, an item after the start and a number twice refused), a list removed whole and one that
// was used kept, the assets and the employees, the statements filed before shown as the closing's year before, and
// the payment that settles an open item taken over.
import { check } from './check.mjs'
import { writeFileSync } from 'node:fs'

export async function checkTakeover({ db, acc, lucia, nowS, day, capture }) {
  const plain = (text) => text.replace(/[\u00a0\u202f]/g, ' ')
  const company = 'co-prevzatie'
  const Y = Number(day(0).slice(0, 4))
  await db
    .prepare(
      "INSERT INTO companies (id, created_at, name, ico, dic, plan, inbox, accountant_id, start_on) VALUES (?, ?, 'TEST-ONLY Prevzatá s. r. o.', '63339999', '2126333999', 'firma', 'prevz001', ?, ?)",
    )
    .bind(company, nowS, lucia.id, `${Y}-01-01`)
    .run()
  const base = `/ucto/klienti/${company}/prevzatie`
  let res = await acc.get(base)
  let raw = await res.text()
  let page = plain(raw)
  check(
    'the takeover page: the trial balance, the open items, the assets, the employees, the statements filed before, and the day the books begin',
    res.status === 200 &&
      page.includes('Počiatočné stavy z obratovej predvahy') &&
      page.includes('Otvorené faktúry zo saldokonta') &&
      page.includes('Dlhodobý majetok') &&
      page.includes('Zamestnanci') &&
      page.includes('Závierky predchádzajúceho účtovníka') &&
      page.includes(`Kniha u nás začína 1. januára ${Y}`),
  )
  check(
    'the client page and the opening balances lead to it',
    (await (await acc.get(`/ucto/klienti/${company}`)).text()).includes(`href="${base}"`) && (await (await acc.get(`/ucto/klienti/${company}/kniha/pociatocne`)).text()).includes(`href="${base}"`),
  )

  // A large trial balance: 300 suppliers' analytic accounts. Its opening form is far beyond 8 kB.
  const big = ['Účet;KS MD;KS D', `221.001;3 000,00;`, ...Array.from({ length: 300 }, (_, i) => `321.${String(i + 1).padStart(3, '0')};;10,00`)].join('\n')
  res = await acc.form(`${base}/predvaha`, [
    ['datum', ''],
    ['riadky', big],
  ])
  page = plain(await res.text())
  check(
    'a large trial balance is read into the opening balances to check, nothing saved yet',
    res.status === 200 &&
      page.includes('Načítali sme 301 účtov z obratovej predvahy') &&
      page.includes('value="321.300"') &&
      (await db.prepare("SELECT COUNT(*) AS n FROM ledger_entries WHERE company_id = ? AND kind = 'opening'").bind(company).first())?.n === 0,
  )
  const fields = { datum: `1. 1. ${Y}`, ucet_0: '221.001', md_0: '3 000,00', d_0: '' }
  for (let i = 1; i <= 300; i++) Object.assign(fields, { [`ucet_${i}`]: `321.${String(i).padStart(3, '0')}`, [`md_${i}`]: '', [`d_${i}`]: '10,00' })
  check('the form it makes is beyond the 8 kB of a public form', new URLSearchParams(fields).toString().length > 8000)
  res = await acc.post(`/ucto/klienti/${company}/kniha/pociatocne`, fields)
  const saved = await db.prepare("SELECT lines FROM ledger_entries WHERE company_id = ? AND kind = 'opening' AND deleted_at IS NULL").bind(company).first()
  check('the team saves it: a form of a large company is no longer refused for its size', res.status === 303 && JSON.parse(saved?.lines ?? '[]').length === 301, String(res.status))

  // The real trial balance: it replaces the large one when saved.
  const trial = [
    'Obratová predvaha',
    'Účet\tNázov účtu\tPočiatočný stav\tObraty MD\tObraty D\tKonečný stav',
    '022 Samostatné hnuteľné veci\t\t\t\t\t4 800,00',
    '082 Oprávky\t\t\t\t\t-2 000,00',
    '211 Pokladnica\t\t\t\t\t120,50',
    '221001 Tatra banka\t\t\t\t\t6 000,00',
    '311 Odberatelia\t\t\t\t\t2 460,00',
    '321 Dodávatelia\t\t\t\t\t-300,00',
    '411 Základné imanie\t\t\t\t\t-5 000,00',
    '428 Nerozdelený zisk\t\t\t\t\t-700,00',
    '518 Ostatné služby\t\t\t\t\t6 619,50',
    '602 Tržby\t\t\t\t\t-12 000,00',
  ].join('\n')
  res = await acc.form(`${base}/predvaha`, [
    ['datum', ''],
    ['riadky', trial],
  ])
  raw = await res.text()
  page = plain(raw)
  check(
    'the trial balance with one signed balance: the accounts, the result on 431',
    res.status === 200 &&
      page.includes('Načítali sme 9 účtov') &&
      page.includes('výsledok 5 380,50 € je na účte 431') &&
      page.includes('value="221.001"') &&
      page.includes('name="d_8" value="5380,50"'),
  )
  const rows = [...raw.matchAll(/name="(ucet|md|d)_(\d+)" value="([^"]*)"/g)]
  const opening = { datum: `1. 1. ${Y}` }
  for (const [, field, i, value] of rows) opening[`${field}_${i}`] = value.replace(/&nbsp;|\u00a0/g, ' ')
  res = await acc.post(`/ucto/klienti/${company}/kniha/pociatocne`, opening)
  check(
    'saved as the opening balances, both sides equal',
    res.status === 303 &&
      JSON.parse((await db.prepare("SELECT lines FROM ledger_entries WHERE company_id = ? AND kind = 'opening' AND deleted_at IS NULL").bind(company).first())?.lines ?? '[]').length === 9,
  )
  res = await acc.form(`${base}/predvaha`, [['riadky', 'Názov;Suma\nPokladnica;12']])
  check('a table without an account and a balance is said', res.status === 422 && plain(await res.text()).includes('Nenašli sme hlavičku so stĺpcami: účet a konečný stav'))
  res = await acc.form(`${base}/predvaha`, [['subor', { name: 'predvaha.xls', type: 'application/vnd.ms-excel', bytes: new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0, 0]) }]])
  check('an old .xls is said: saved as .xlsx or CSV', res.status === 422 && plain(await res.text()).includes('Starý formát .xls nečítame'))

  // The open items from a file of the program before.
  const csv = (text) => ({ name: 'saldokonto.csv', type: 'text/csv', bytes: new TextEncoder().encode(text) })
  const head = 'Druh;Číslo dokladu;VS;Partner;IČO;Dátum vystavenia;Dátum splatnosti;Suma celkom;Zostáva uhradiť'
  const items = [
    `FV;${Y - 1}0101;${Y - 1}0101;TEST-ONLY Odberateľ a. s.;12345678;15.12.${Y - 1};14.01.${Y};1 230,00;1 230,00`,
    `FV;${Y - 1}0102;${Y - 1}0102;TEST-ONLY Odberateľ a. s.;12345678;20.12.${Y - 1};19.01.${Y};1 230,00;1 230,00`,
    `FP;D-77;;TEST-ONLY Dodávateľ s. r. o.;87654321;20.12.${Y - 1};03.01.${Y};615,00;300,00`,
  ]
  res = await acc.form(`${base}/saldokonto`, [
    ['strana', ''],
    ['subor', csv([head, ...items, `FV;${Y}0001;;Neskorý;;05.01.${Y};;10,00;10,00`].join('\n'))],
  ])
  page = plain(await res.text())
  check(
    'an item from the time the books run here refuses the whole list, said with its line',
    res.status === 422 &&
      page.includes(`riadok 5: ${Y}0001: je z obdobia, keď už kniha beží u nás`) &&
      (await db.prepare("SELECT COUNT(*) AS n FROM documents WHERE company_id = ? AND source = 'takeover'").bind(company).first())?.n === 0,
  )
  res = await acc.form(`${base}/saldokonto`, [
    ['strana', ''],
    ['subor', csv([head, ...items].join('\n'))],
  ])
  const docs = (
    await db.prepare("SELECT number, kind, total_cents, issued_on, booked_at, takeover, vat_mode FROM documents WHERE company_id = ? AND source = 'takeover' ORDER BY number").bind(company).all()
  ).results
  check(
    'the open items become documents before the books start: booked, with what is left, no VAT of ours, one import',
    res.status === 303 &&
      docs.length === 3 &&
      docs.every((d) => d.booked_at && d.vat_mode === 'none' && d.takeover === docs[0].takeover && d.issued_on < `${Y}-01-01`) &&
      docs.find((d) => d.number === 'D-77')?.total_cents === 30000 &&
      docs.find((d) => d.number === 'D-77')?.kind === 'invoice_in',
    JSON.stringify(docs),
  )
  res = await acc.form(`${base}/saldokonto`, [
    ['strana', ''],
    ['subor', csv([head, items[2]].join('\n'))],
  ])
  check('the same invoice again is refused: it is among the documents', res.status === 422 && plain(await res.text()).includes('D-77: tento doklad už medzi dokladmi je'))
  const saldo = plain(await (await acc.get(`/ucto/klienti/${company}/kniha/saldokonto`)).text())
  check('the saldokonto lists them, and 311 and 321 of the opening balances agree with them', saldo.includes('D-77') && saldo.includes(`${Y - 1}0102`) && !saldo.includes('zo zápisov bez faktúry'))

  // Pohoda's XML of invoices: a second import, removed whole while nothing of it was used.
  const pohoda = `<?xml version="1.0" encoding="UTF-8"?>
<dat:dataPack xmlns:dat="http://www.stormware.cz/schema/version_2/data.xsd" xmlns:inv="http://www.stormware.cz/schema/version_2/invoice.xsd" xmlns:typ="http://www.stormware.cz/schema/version_2/type.xsd" id="e" ico="63339999" application="POHODA" version="2.0">
<dat:dataPackItem id="1" version="2.0"><inv:invoice version="2.0"><inv:invoiceHeader><inv:invoiceType>receivedInvoice</inv:invoiceType><inv:number><typ:numberRequested>P-1</typ:numberRequested></inv:number><inv:date>${Y - 1}-12-28</inv:date><inv:partnerIdentity><typ:address><typ:company>TEST-ONLY Pohoda dodávateľ</typ:company></typ:address></inv:partnerIdentity></inv:invoiceHeader><inv:invoiceSummary><inv:homeCurrency><typ:priceNone>50</typ:priceNone></inv:homeCurrency></inv:invoiceSummary></inv:invoice></dat:dataPackItem>
</dat:dataPack>`
  res = await acc.form(`${base}/saldokonto`, [
    ['strana', ''],
    ['subor', { name: 'faktury.xml', type: 'application/xml', bytes: new TextEncoder().encode(pohoda) }],
  ])
  check(
    "Pohoda's XML of invoices is read as open items",
    res.status === 303 && (await db.prepare("SELECT total_cents FROM documents WHERE company_id = ? AND number = 'P-1' AND deleted_at IS NULL").bind(company).first())?.total_cents === 5000,
  )
  const pBatch = (await db.prepare("SELECT takeover FROM documents WHERE company_id = ? AND number = 'P-1'").bind(company).first())?.takeover
  page = plain(await (await acc.get(base)).text())
  check(
    'the lists read are on the page, each with its removal',
    page.includes('Načítané zoznamy') && page.includes('3 otvorené faktúry') && page.includes('1 otvorená faktúra') && page.includes(`${base}/zoznam/${pBatch}/odstranit`),
  )
  res = await acc.post(`${base}/zoznam/${pBatch}/odstranit`, {})
  check(
    'a list read by mistake is removed whole',
    res.status === 303 && (await db.prepare("SELECT deleted_at FROM documents WHERE company_id = ? AND number = 'P-1'").bind(company).first())?.deleted_at !== null,
  )

  // The payment that comes settles an open item taken over; that list is then used and stays.
  await db.batch([
    db.prepare("INSERT INTO accounts (id, company_id, iban, ledger) VALUES ('acc-prevz', ?, 'SK6809000000000999966666', '221.001')").bind(company),
    db
      .prepare(
        "INSERT INTO payments (id, company_id, account_id, created_at, booked_on, amount_cents, party, ref) VALUES ('pay-prevz', ?, 'acc-prevz', ?, ?, -30000, 'TEST-ONLY Dodávateľ s. r. o.', 'prevz-1')",
      )
      .bind(company, nowS, `${Y}-01-03`),
  ])
  const d77 = await db.prepare("SELECT id, takeover FROM documents WHERE company_id = ? AND number = 'D-77'").bind(company).first()
  await db.prepare("INSERT INTO links (document_id, payment_id, company_id, how, created_at) VALUES (?, 'pay-prevz', ?, 'accountant', ?)").bind(d77.id, company, nowS).run()
  const after = plain(await (await acc.get(`/ucto/klienti/${company}/kniha/saldokonto`)).text())
  const journal = plain(await (await acc.get(`/ucto/klienti/${company}/kniha/dennik?rok=${Y}&mesiac=1`)).text())
  check(
    'the payment settles the invoice taken over: gone from the saldokonto, booked 321 against the bank',
    !after.includes('D-77') && after.includes(`${Y - 1}0101`) && journal.includes('Úhrada: TEST-ONLY Dodávateľ s. r. o. (D-77)'),
  )
  res = await acc.post(`${base}/zoznam/${d77.takeover}/odstranit`, {})
  check('a list of which something was used is not removed', res.status === 404 || res.status === 409)
  check('its documents stay', (await db.prepare('SELECT COUNT(*) AS n FROM documents WHERE company_id = ? AND takeover = ? AND deleted_at IS NULL').bind(company, d77.takeover).first())?.n === 3)

  // The assets.
  const assets = [
    'Inventárne číslo;Názov;Dátum zaradenia;Vstupná cena;Odpisová skupina;Spôsob odpisovania;Daňové oprávky;Účtovné oprávky;Počet rokov odpisovania',
    `HM-1;TEST-ONLY Server;15.03.${Y - 2};4 800,00;2;zrýchlené;2 742,86;2 000,00;2`,
  ]
  res = await acc.form(`${base}/majetok`, [['riadky', [...assets, `HM-2;Neskorý;10.01.${Y};1 800,00;1;;;;`].join('\n')]])
  check('an asset put in use after the books start refuses the list', res.status === 422 && plain(await res.text()).includes('Neskorý: je zaradený, keď už kniha beží u nás'))
  res = await acc.form(`${base}/majetok`, [['riadky', assets.join('\n')]])
  const asset = await db.prepare('SELECT number, source, tax_method, prior_tax_cents, prior_book_cents, prior_tax_years, takeover FROM assets WHERE company_id = ?').bind(company).first()
  check(
    'the asset becomes one of the opening balances with what was depreciated before, numbered by its year',
    res.status === 303 &&
      asset?.number === `M-${Y - 2}-001` &&
      asset.source === 'opening' &&
      asset.tax_method === 'accelerated' &&
      asset.prior_tax_cents === 274286 &&
      asset.prior_book_cents === 200000 &&
      asset.prior_tax_years === 2 &&
      asset.takeover,
    JSON.stringify(asset),
  )
  check('the register shows it', plain(await (await acc.get(`/ucto/klienti/${company}/kniha/majetok`)).text()).includes('TEST-ONLY Server'))

  // The employees.
  const people = [
    'Meno a priezvisko;Zdravotná poisťovňa;Dátum nástupu;Mesačná mzda;Druh pomeru',
    `TEST-ONLY Jana Prevzatá;25;01.03.${Y - 2};1 800,00;pracovný pomer`,
    `TEST-ONLY Peter Brigádnik;Dôvera;01.06.${Y - 1};400;DoBPŠ`,
  ].join('\n')
  res = await acc.form(`${base}/zamestnanci`, [['riadky', people]])
  const staff = (await db.prepare('SELECT name, insurer, contract, regular, wage_cents FROM employees WHERE company_id = ? ORDER BY name').bind(company).all()).results
  check(
    'the employees are added for payroll',
    res.status === 303 &&
      res.headers.get('location')?.endsWith('/mzdy?ok=mzdy-prevzati#zamestnanci') &&
      staff.length === 2 &&
      staff[0].contract === 'employment' &&
      staff[0].wage_cents === 180000 &&
      staff[1].contract === 'dobps' &&
      staff[1].regular === 0,
    JSON.stringify(staff),
  )
  res = await acc.form(`${base}/zamestnanci`, [['riadky', people]])
  check('the same list again adds nobody twice', res.status === 422 && (await db.prepare('SELECT COUNT(*) AS n FROM employees WHERE company_id = ?').bind(company).first())?.n === 2)

  // The statements filed before, from eDane's XML: the closing shows the year before from them.
  const uz = (ico) =>
    new TextEncoder().encode(
      `<?xml version="1.0" encoding="UTF-8"?><dokument><hlavicka><datumK><den>31</den><mesiac>12</mesiac><rok>${Y - 1}</rok></datumK><dic>2126333999</dic><ico>${ico}</ico></hlavicka><telo><ucMuj1Suvaha><r01><s1>13381</s1><s2>9000</s2></r01><r02><s1>2800</s1><s2></s2></r02><r30><s1>5000</s1><s2>5000</s2></r30></ucMuj1Suvaha><ucMuj2VykazZS><r01><s1>12000</s1><s2>8000</s2></r01></ucMuj2VykazZS></telo></dokument>`,
    )
  res = await acc.form(`${base}/zavierka`, [['subor', { name: 'UZMUJ.xml', type: 'application/xml', bytes: uz('12345678') }]])
  check("another company's statements are refused", res.status === 422 && plain(await res.text()).includes('Závierka patrí inej firme (IČO 12345678)'))
  res = await acc.form(`${base}/zavierka`, [['subor', { name: 'UZMUJ_63339999.xml', type: 'application/xml', bytes: uz('63339999') }]])
  const years = (await db.prepare('SELECT year FROM prior_statements WHERE company_id = ? ORDER BY year').bind(company).all()).results.map((r) => r.year)
  check('the statements filed before: the year and the year before it from its column', res.status === 303 && years.join() === `${Y - 2},${Y - 1}`, years.join())
  page = plain(await (await acc.get(base)).text())
  check('they are listed with their form and total assets', page.includes(`Rok ${Y - 1}: mikro (Úč MUJ)`) && page.includes('majetok spolu 13 381,00 €'))
  const closingPage = plain(await (await acc.get(`/ucto/klienti/${company}/zavierka?rok=${Y}`)).text())
  check(
    'the closing shows the year before as the accountant before filed it',
    closingPage.includes('Predchádzajúce obdobie je zo závierky predchádzajúceho účtovníka') && closingPage.includes('13 381'),
  )
  res = await acc.post(`${base}/zavierka/${Y - 2}/odstranit`, {})
  check('a year of them is removed', res.status === 303 && (await db.prepare('SELECT COUNT(*) AS n FROM prior_statements WHERE company_id = ?').bind(company).first())?.n === 1)

  raw = await (await acc.get(base)).text()
  if (capture) writeFileSync(`${capture}/takeover.html`, raw)
  check('every import is in the events', (await db.prepare("SELECT COUNT(*) AS n FROM events WHERE company_id = ? AND action LIKE 'takeover.%'").bind(company).first())?.n >= 6)
}
