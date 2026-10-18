// Invoices in another currency (18 October 2026), in workerd: a VAT payer issues an invoice in US dollars at the ECB's
// rate of the day before the supply (or one typed), its sheet prints the dollars, the rate and the VAT in euros and no
// QR code, its e-invoice is in dollars with the VAT also in euros, its document carries the currency and the rate, the
// payment in euros with its number pairs with it, a credit note keeps its currency and rate, and a request for an
// advance is in euros only.
import { check } from './check.mjs'
import { writeFileSync } from 'node:fs'

export async function checkInvoiceCurrency({ db, nowS, signIn, as, day, capture }) {
  const company = 'co-dollar'
  const plain = (text) => text.replace(/[  ]/g, ' ')
  const sk = (d) => `${Number(d.slice(8))}. ${Number(d.slice(5, 7))}. ${d.slice(0, 4)}`
  const idOf = (res) => res.headers.get('location')?.match(/\/app\/faktury\/([0-9a-f-]{36})/)?.[1] ?? ''
  const micro = (text) => Math.round(Number(String(text).replace(',', '.')) * 1_000_000)
  const eurOf = (cents, rate) => Math.round((cents * 1_000_000) / rate)
  await db.batch([
    db
      .prepare(
        "INSERT INTO companies (id, created_at, name, ico, dic, icdph, address, vat_payer, vat_since, plan, inbox, start_on) VALUES (?, ?, 'TEST-ONLY Dolár s. r. o.', '50777799', '2120777799', 'SK2120777799', 'Hlavná 9, 811 01 Bratislava', 1, '2026-01-01', 'firma', 'dola0001', '2026-01-01')",
      )
      .bind(company, nowS),
    db.prepare("INSERT INTO users (id, created_at, email, name) VALUES ('u-dollar', ?, 'dollar@example.sk', 'TEST-ONLY Dolárová')").bind(nowS),
    db.prepare("INSERT INTO members (company_id, user_id, role, created_at) VALUES (?, 'u-dollar', 'owner', ?)").bind(company, nowS),
    db.prepare("INSERT INTO accounts (id, company_id, iban) VALUES ('acc-dollar', ?, 'SK3112000000198742637541')").bind(company),
    // A rate the ECB declared (the schedule keeps them; this one in case it has not run here).
    db.prepare("INSERT OR IGNORE INTO fx_rates (currency, day, rate, fetched_at) VALUES ('USD', ?, '1.0823', ?)").bind(day(-6), nowS),
  ])
  const client = as((await signIn('dollar@example.sk')).cookie)
  const today = day(0)
  const year = today.slice(0, 4)
  const supplied = day(-1)
  const ecb = await db.prepare("SELECT day, rate FROM fx_rates WHERE currency = 'USD' AND day < ? ORDER BY day DESC LIMIT 1").bind(supplied).first()
  const rate = micro(ecb?.rate)
  const form = (extra) => ({
    akcia: 'vystavit',
    meno: 'TEST-ONLY Buyer Inc.',
    adresa: 'Main Street 1, 10001 New York',
    icdph: 'SK2120000000',
    email: 'buyer@example.com',
    vystavena: sk(today),
    dodana: sk(supplied),
    splatna: sk(day(14)),
    iban: 'SK31 1200 0000 1987 4263 7541',
    mena: 'USD',
    kurz: '',
    riadky: '2',
    'r0-popis': 'Consulting',
    'r0-mnozstvo': '10',
    'r0-jednotka': 'hod',
    'r0-cena': '120,00',
    'r0-dph': '23',
    'r1-popis': 'Book',
    'r1-mnozstvo': '1',
    'r1-jednotka': 'ks',
    'r1-cena': '50,00',
    'r1-dph': '5',
    ...extra,
  })

  let page = plain(await (await client.get('/app/faktury/nova')).text())
  check('a new invoice offers a currency and a rate', page.includes('name="mena"') && page.includes('<option value="USD">USD</option>') && page.includes('name="kurz"'))
  // The payment of it, in euros with its number, before it is issued: issuing pairs it.
  const euros = eurOf(152850, rate)
  await db
    .prepare("INSERT INTO payments (id, company_id, account_id, created_at, booked_on, amount_cents, party, vs, ref) VALUES ('pay-usd-1', ?, 'acc-dollar', ?, ?, ?, 'TEST-ONLY BUYER INC', ?, 'usd-1')")
    .bind(company, nowS, today, Math.round(euros * 0.99), `${year}0001`)
    .run()
  let res = await client.post('/app/faktury', form({}))
  const invoiceId = idOf(res)
  const invoice = await db.prepare('SELECT number, currency, fx_rate, fx_day, total_cents, vat_cents, document_id, token FROM invoices WHERE id = ?').bind(invoiceId).first()
  check(
    "issued in dollars at the ECB's rate of the day before the supply",
    res.status === 303 && invoice?.currency === 'USD' && micro(invoice.fx_rate) === rate && invoice.fx_day === ecb?.day && invoice.total_cents === 152850 && invoice.vat_cents === 27850,
    JSON.stringify([invoice, ecb]),
  )
  const doc = await db
    .prepare('SELECT currency, fx_rate, total_cents, vat_lines FROM documents WHERE id = ?')
    .bind(invoice?.document_id ?? '')
    .first()
  check(
    'its document carries the currency and the rate, for the books and the VAT return',
    doc?.currency === 'USD' && micro(doc.fx_rate) === rate && doc.total_cents === 152850 && JSON.parse(doc.vat_lines)[0].vat === 27600,
    JSON.stringify(doc),
  )
  let linked = null
  for (let i = 0; i < 20 && !linked; i++) {
    linked = await db
      .prepare("SELECT payment_id FROM links WHERE document_id = ? AND payment_id = 'pay-usd-1'")
      .bind(invoice?.document_id ?? '')
      .first()
    if (!linked) await new Promise((r) => setTimeout(r, 100))
  }
  const why = linked
    ? ''
    : JSON.stringify([
        await db.prepare("SELECT * FROM payments WHERE id = 'pay-usd-1'").first(),
        await db
          .prepare('SELECT id, status, kind, number, vs, issued_on, due_on, total_cents, currency, fx_rate, duplicate_of, paid_privately, deleted_at FROM documents WHERE id = ?')
          .bind(invoice?.document_id ?? '')
          .first(),
        await db
          .prepare("SELECT * FROM links WHERE payment_id = 'pay-usd-1' OR document_id = ?")
          .bind(invoice?.document_id ?? '')
          .all(),
      ])
  // Another company's locked period stops nobody else's pairing (the lock was asked of every payment there was).
  const lockedElsewhere = (await db.prepare('SELECT COUNT(*) AS n FROM period_locks WHERE company_id != ? AND through_on IS NOT NULL').bind(company).first())?.n ?? 0
  check(
    'the payment in euros with its number pairs with it, near its euros at its rate, while another company has a period locked',
    Boolean(linked) && lockedElsewhere > 0,
    why || String(lockedElsewhere),
  )
  const sheetRaw = await (await client.get(`/app/faktury/${invoiceId}`)).text()
  if (capture) writeFileSync(`${capture}/invoice-dollars.html`, sheetRaw)
  page = plain(sheetRaw)
  const vatEur = eurOf(27600, rate) + eurOf(250, rate)
  const eurText = `${Math.floor(vatEur / 100)},${String(vatEur % 100).padStart(2, '0')} €`
  check(
    'its sheet: the dollars, the rate of its day, the VAT in euros, no QR code',
    page.includes('1 528,50 USD') &&
      page.includes('DPH spolu v eurách') &&
      page.includes(eurText) &&
      page.includes('Kurz ECB z') &&
      page.includes(`1 € = ${String(ecb?.rate).replace('.', ',').replace(/0+$/, '').replace(/,$/, '')} USD`) &&
      !page.includes('sheet__qr'),
    eurText,
  )
  res = await client.get(`/app/faktury/${invoiceId}/xml`)
  const xml = await res.text()
  check(
    'its e-invoice is in dollars with the VAT also in euros',
    xml.includes('<cbc:DocumentCurrencyCode>USD</cbc:DocumentCurrencyCode>') &&
      xml.includes('<cbc:TaxCurrencyCode>EUR</cbc:TaxCurrencyCode>') &&
      xml.includes(`<cac:TaxTotal><cbc:TaxAmount currencyID="EUR">${(vatEur / 100).toFixed(2)}</cbc:TaxAmount></cac:TaxTotal>`) &&
      xml.includes('<cbc:PayableAmount currencyID="USD">1528.50</cbc:PayableAmount>'),
  )
  page = plain(await (await client.get('/app/faktury')).text())
  check('the list prints it in dollars', page.includes('1 528,50 USD'))

  // A rate typed, and one that is no rate.
  res = await client.post('/app/faktury', form({ kurz: 'jeden' }))
  check('a rate that is no number is said at its field', res.status === 422 && plain(await res.text()).includes('Kurz napíšte ako číslo'))
  res = await client.post('/app/faktury', form({ kurz: '1,1', mena: 'GBP' }))
  const typed = await db.prepare('SELECT currency, fx_rate, fx_day FROM invoices WHERE id = ?').bind(idOf(res)).first()
  check('a typed rate is kept as typed, without an ECB day', res.status === 303 && typed?.currency === 'GBP' && typed.fx_rate === '1,1' && typed.fx_day === null, JSON.stringify(typed))
  res = await client.post('/app/faktury', form({ mena: 'ISK', dodana: sk('2026-01-02') }))
  check(
    'without a rate of the ECB and none typed, the invoice asks for one',
    (await db.prepare("SELECT COUNT(*) AS n FROM fx_rates WHERE currency = 'ISK'").first())?.n > 0 ||
      (res.status === 422 && plain(await res.text()).includes('Kurz ECB zo dňa pred dodaním zatiaľ nepoznáme')),
  )
  // An export to a private person abroad: the state chosen, on the sheet and in the e-invoice.
  res = await client.post('/app/faktury', form({ rezim: 'export', icdph: '', stat: 'US', meno: 'TEST-ONLY John Smith' }))
  const exportId = (res.headers.get('location') ?? '').match(/\/app\/faktury\/([0-9a-f-]{36})/)?.[1] ?? ''
  const exported = await db.prepare('SELECT customer_country, vat_mode FROM invoices WHERE id = ?').bind(exportId).first()
  const exportXml = await (await client.get(`/app/faktury/${exportId}/xml`)).text()
  check(
    "an export to a private person keeps the customer's state, prints it and names it in the e-invoice",
    res.status === 303 &&
      exported?.customer_country === 'US' &&
      plain(await (await client.get(`/app/faktury/${exportId}`)).text()).includes('Spojené štáty') &&
      (exportXml.match(/<cac:AccountingCustomerParty>[\s\S]*?<\/cac:AccountingCustomerParty>/)?.[0] ?? '').includes('<cbc:IdentificationCode>US</cbc:IdentificationCode>'),
    JSON.stringify(exported),
  )
  res = await client.post('/app/faktury', form({ stat: 'CZ', icdph: 'DE123456789', rezim: 'eu_service' }))
  check('a state against the VAT number is said', res.status === 422 && plain(await res.text()).includes('Štát odberateľa nesedí s jeho IČ DPH'))
  res = await client.post('/app/faktury', form({ druh: 'zalohova' }))
  check('a request for an advance is in euros only', res.status === 422 && plain(await res.text()).includes('len v eurách'))

  // A credit note keeps the invoice's currency and rate.
  page = plain(await (await client.get(`/app/faktury/nova?dobropis=${invoiceId}`)).text())
  check('a credit note of it starts in its currency', page.includes('name="mena" value="USD"'))
  res = await client.post('/app/faktury', {
    akcia: 'vystavit',
    dobropis: invoiceId,
    meno: 'x',
    email: 'buyer@example.com',
    vystavena: sk(today),
    dodana: sk(supplied),
    splatna: sk(day(14)),
    mena: 'EUR',
    kurz: '9,99',
    riadky: '1',
    'r0-popis': 'Consulting back',
    'r0-mnozstvo': '1',
    'r0-jednotka': 'hod',
    'r0-cena': '120,00',
    'r0-dph': '23',
    dovod: 'Hodina navyše',
  })
  const credit = await db.prepare('SELECT kind, currency, fx_rate, fx_day, total_cents FROM invoices WHERE id = ?').bind(idOf(res)).first()
  check(
    "issued in the invoice's currency at its rate, whatever was posted",
    res.status === 303 && credit?.kind === 'credit' && credit.currency === 'USD' && credit.fx_rate === invoice?.fx_rate && credit.fx_day === invoice?.fx_day && credit.total_cents === -14760,
    JSON.stringify(credit),
  )
}
