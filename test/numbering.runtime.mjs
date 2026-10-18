// A company's own invoice numbers (18 October 2026), in workerd: an owner sets a prefix, a mark, the order's digits and
// the next order of the year (a company that came in the middle of a year goes on with its row); invoices, credit
// notes and advances' documents take the next number of that row, the variable symbol stays the year and the order (on
// the sheet, in the e-invoice, in pairing), requests for advances keep their own row, and only an owner changes it.
import { check } from './check.mjs'
import { writeFileSync } from 'node:fs'

export async function checkNumbering({ db, nowS, signIn, as, day, capture }) {
  const company = 'co-numbers'
  const plain = (text) => text.replace(/[  ]/g, ' ')
  const sk = (d) => `${Number(d.slice(8))}. ${Number(d.slice(5, 7))}. ${d.slice(0, 4)}`
  const idOf = (res) => res.headers.get('location')?.match(/\/app\/faktury\/([0-9a-f-]{36})/)?.[1] ?? ''
  await db.batch([
    db
      .prepare(
        "INSERT INTO companies (id, created_at, name, ico, dic, icdph, address, vat_payer, vat_since, plan, inbox, start_on) VALUES (?, ?, 'TEST-ONLY Rad faktúr s. r. o.', '50777820', '2120777820', 'SK2120777820', 'Hlavná 14, 811 01 Bratislava', 1, '2026-01-01', 'firma', 'rado0001', '2026-01-01')",
      )
      .bind(company, nowS),
    db
      .prepare("INSERT INTO users (id, created_at, email, name) VALUES ('u-numbers', ?, 'numbers@example.sk', 'TEST-ONLY Radová'), ('u-numbers-2', ?, 'numbers2@example.sk', 'TEST-ONLY Kolega')")
      .bind(nowS, nowS),
    db.prepare("INSERT INTO members (company_id, user_id, role, created_at) VALUES (?, 'u-numbers', 'owner', ?), (?, 'u-numbers-2', 'member', ?)").bind(company, nowS, company, nowS),
    db.prepare("INSERT INTO accounts (id, company_id, iban) VALUES ('acc-numbers', ?, 'SK3112000000198742637541')").bind(company),
  ])
  const owner = as((await signIn('numbers@example.sk')).cookie)
  const colleague = as((await signIn('numbers2@example.sk')).cookie)
  const today = day(0)
  const year = today.slice(0, 4)
  let page = plain(await (await owner.get('/app/faktury')).text())
  check('the invoices lead to their numbering', page.includes('href="/app/faktury/cislovanie"'))
  const raw = await (await owner.get('/app/faktury/cislovanie')).text()
  if (capture) writeFileSync(`${capture}/invoice-numbering.html`, raw)
  page = plain(raw)
  check('the numbering says the next number as it is now', page.includes(`Ďalšia faktúra: ${year}0001, variabilný symbol ${year}0001`) && page.includes('name="predpona"'))
  let res = await owner.post('/app/faktury/cislovanie', { predpona: 'F A', oddelovac: '-', cislice: '4', od: '143' })
  check('a prefix of other characters is refused', res.status === 422 && plain(await res.text()).includes('Predpona môže mať len písmená'))
  res = await owner.post('/app/faktury/cislovanie', { predpona: 'fa', oddelovac: '-', cislice: '4', od: '10000' })
  check('an order that does not fit its digits is refused', res.status === 422 && plain(await res.text()).includes('Poradie napíšte ako celé číslo'))
  check('only an owner changes it', (await colleague.post('/app/faktury/cislovanie', { predpona: 'X', oddelovac: '', cislice: '4', od: '1' })).status === 403)
  res = await owner.post('/app/faktury/cislovanie', { predpona: 'fa', oddelovac: '-', cislice: '4', od: '143' })
  page = plain(await (await owner.get('/app/faktury/cislovanie?ok=cislovanie')).text())
  check(
    'kept: the next invoice FA2026-0143, its symbol the year and the order',
    res.status === 303 && page.includes(`Ďalšia faktúra: FA${year}-0143, variabilný symbol ${year}0143`) && page.includes('Číslovanie sme uložili'),
  )

  // The payment comes before the invoice is issued: issuing pairs it by the symbol.
  await db
    .prepare(
      "INSERT INTO payments (id, company_id, account_id, created_at, booked_on, amount_cents, party, vs, ref) VALUES ('pay-numbers', ?, 'acc-numbers', ?, ?, 12300, 'TEST-ONLY ODBERATEL', ?, 'num-1')",
    )
    .bind(company, nowS, today, `${year}0143`)
    .run()
  const form = (extra) => ({
    akcia: 'vystavit',
    meno: 'TEST-ONLY Odberateľ s. r. o.',
    adresa: 'Námestie 1, 040 01 Košice',
    icdph: 'SK2120000000',
    vystavena: sk(today),
    dodana: sk(today),
    splatna: sk(day(14)),
    iban: 'SK31 1200 0000 1987 4263 7541',
    riadky: '1',
    'r0-popis': 'Služba',
    'r0-mnozstvo': '1',
    'r0-jednotka': 'ks',
    'r0-cena': '100,00',
    'r0-dph': '23',
    ...extra,
  })
  res = await owner.post('/app/faktury', form({}))
  const invoiceId = idOf(res)
  const invoice = await db.prepare('SELECT number, vs, seq, document_id FROM invoices WHERE id = ?').bind(invoiceId).first()
  const doc = await db
    .prepare('SELECT number, vs FROM documents WHERE id = ?')
    .bind(invoice?.document_id ?? '')
    .first()
  check(
    "issued in the company's row: FA2026-0143, the symbol 20260143 on it and on its document",
    invoice?.number === `FA${year}-0143` && invoice.vs === `${year}0143` && invoice.seq === 143 && doc?.number === `FA${year}-0143` && doc.vs === `${year}0143`,
    JSON.stringify([invoice, doc]),
  )
  let linked = null
  for (let i = 0; i < 30 && !linked; i++) {
    linked = await db
      .prepare("SELECT 1 AS x FROM links WHERE payment_id = 'pay-numbers' AND document_id = ?")
      .bind(invoice?.document_id ?? '')
      .first()
    if (!linked) await new Promise((r) => setTimeout(r, 100))
  }
  check('the payment with the symbol pairs with it', Boolean(linked))
  page = plain(await (await owner.get(`/app/faktury/${invoiceId}`)).text())
  const xml = await (await owner.get(`/app/faktury/${invoiceId}/xml`)).text()
  check(
    'the sheet and the e-invoice carry the number and pay by the symbol',
    page.includes(`Faktúra FA${year}-0143`) && page.includes(`${year}0143`) && xml.includes(`<cbc:ID>FA${year}-0143</cbc:ID>`) && xml.includes(`<cbc:PaymentID>${year}0143</cbc:PaymentID>`),
  )
  res = await owner.post('/app/faktury', form({ dobropis: invoiceId, dovod: 'Zľava', 'r0-cena': '10,00' }))
  const credit = await db.prepare('SELECT number, vs FROM invoices WHERE id = ?').bind(idOf(res)).first()
  check('a credit note takes the next number of the row', credit?.number === `FA${year}-0144` && credit.vs === `${year}0144`, JSON.stringify(credit))
  res = await owner.post('/app/faktury', form({ druh: 'zalohova' }))
  const request = await db.prepare('SELECT number, vs FROM invoices WHERE id = ?').bind(idOf(res)).first()
  check('a request for an advance keeps its own row', request?.number === `ZF${year}0001` && request.vs === `9${year}00001`, JSON.stringify(request))
  // The logo: a picture for the head of the invoices, nothing else; on the sheet in the app and at the customer.
  const png = {
    name: 'logo.png',
    type: 'image/png',
    bytes: Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='), (ch) => ch.charCodeAt(0)),
  }
  res = await owner.upload(
    '/app/faktury/logo',
    { name: 'logo.svg', type: 'image/svg+xml', bytes: new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>') },
    {},
    'logo',
  )
  check('a logo that is no PNG, JPEG or WebP is refused (an SVG could carry a script)', res.status === 422 && plain(await res.text()).includes('Logo musí byť obrázok'))
  check('only an owner sets the logo', (await colleague.upload('/app/faktury/logo', png, {}, 'logo')).status === 403)
  res = await owner.upload('/app/faktury/logo', png, {}, 'logo')
  const kept = await db.prepare('SELECT logo_key, logo_type FROM companies WHERE id = ?').bind(company).first()
  const served = await owner.get('/app/logo')
  check(
    'a PNG is kept as the logo and served as a picture that runs nothing',
    res.status === 303 &&
      kept?.logo_type === 'image/png' &&
      String(kept.logo_key).startsWith(`companies/${company}/brand/logo-`) &&
      served.status === 200 &&
      served.headers.get('content-type') === 'image/png' &&
      (served.headers.get('content-security-policy') ?? '').includes('sandbox'),
    JSON.stringify(kept),
  )
  const token = (await db.prepare('SELECT token FROM invoices WHERE id = ?').bind(invoiceId).first())?.token
  const sheet = await (await owner.get(`/app/faktury/${invoiceId}`)).text()
  const outside = await (await owner.get(`/f/${token}`)).text()
  check(
    "the invoice carries it, in the app and on the customer's page",
    sheet.includes('<img class="sheet__logo" src="/app/logo?v=') && outside.includes(`src="/f/${token}/logo?v=`) && (await owner.get(`/f/${token}/logo`)).status === 200,
  )
  if (capture) writeFileSync(`${capture}/invoice-logo.html`, sheet)
  res = await owner.post('/app/faktury/logo/odstranit', {})
  check(
    'removed, the invoices have none',
    res.status === 303 && (await db.prepare('SELECT logo_key FROM companies WHERE id = ?').bind(company).first())?.logo_key === null && (await owner.get('/app/logo')).status === 404,
  )
  res = await owner.post('/app/faktury/cislovanie', { predpona: '', oddelovac: '/', cislice: '6', od: '1' })
  res = await owner.post('/app/faktury', form({}))
  const later = await db.prepare('SELECT number, vs FROM invoices WHERE id = ?').bind(idOf(res)).first()
  check('changed again, the row goes on: an order lower than what is issued is not used', later?.number === `${year}/000145` && later.vs === `${year}000145`, JSON.stringify(later))
}
