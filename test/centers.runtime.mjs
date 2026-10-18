// Cost centres (18 October 2026), in workerd: an owner makes the company's centres (a colleague cannot), a code is
// checked and once; documents are given to centres by the client and on the accountant's booking screen; the report
// says each centre's revenues, costs and result from the books, and what is in common; an archived centre takes no new
// documents.
import { check } from './check.mjs'
import { writeFileSync } from 'node:fs'

export async function checkCenters({ db, acc, lucia, nowS, signIn, as, day, capture }) {
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
  res = await owner.post('/app/doklady/st-r3/stredisko', { stredisko: 'other-company-center' })
  check("another company's centre is not given", res.status === 404)

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
  page = plain(await (await owner.get(`/app/strediska?rok=${year}&od=${month}&do=${month}`)).text())
  check('it stays in the report with its documents', page.includes('SKLAD') && page.includes('archivované'))
}
