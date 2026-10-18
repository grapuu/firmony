// Advances (18 October 2026), in workerd: a VAT payer issues a request for an advance (zálohová faktúra, numbered ZF…
// with its own variable symbol, no document and no e-invoice), the money comes on that symbol, the request's page
// issues the tax document of the advance received (§ 73) for each payment once, linked to it, and the final invoice
// deducts every advance rate by rate, leaving the rest to pay; the books get the advance's base from 324.
import { check } from './check.mjs'
import { writeFileSync } from 'node:fs'

export async function checkAdvances({ db, nowS, signIn, as, day, capture }) {
  const company = 'co-advance'
  const plain = (text) => text.replace(/[  ]/g, ' ')
  const sk = (d) => `${Number(d.slice(8))}. ${Number(d.slice(5, 7))}. ${d.slice(0, 4)}`
  const idOf = (res) => res.headers.get('location')?.match(/\/app\/faktury\/([0-9a-f-]{36})/)?.[1] ?? ''
  await db.batch([
    db
      .prepare(
        "INSERT INTO companies (id, created_at, name, ico, dic, icdph, address, vat_payer, vat_since, plan, inbox, start_on) VALUES (?, ?, 'TEST-ONLY Záloha s. r. o.', '50777771', '2120777771', 'SK2120777771', 'Hlavná 7, 811 01 Bratislava', 1, '2026-01-01', 'firma', 'zalo0001', '2026-01-01')",
      )
      .bind(company, nowS),
    db.prepare("INSERT INTO users (id, created_at, email, name) VALUES ('u-advance', ?, 'advance@example.sk', 'TEST-ONLY Zálohová')").bind(nowS),
    db.prepare("INSERT INTO members (company_id, user_id, role, created_at) VALUES (?, 'u-advance', 'owner', ?)").bind(company, nowS),
    db.prepare("INSERT INTO accounts (id, company_id, iban) VALUES ('acc-advance', ?, 'SK3112000000198742637541')").bind(company),
  ])
  const client = as((await signIn('advance@example.sk')).cookie)
  const today = day(0)
  const year = today.slice(0, 4)
  const form = (extra) => ({
    akcia: 'vystavit',
    ico: '50123456',
    meno: 'TEST-ONLY Objednávateľ s. r. o.',
    adresa: 'Námestie 2, 040 01 Košice',
    dic: '2120000000',
    icdph: 'SK2120000000',
    email: 'objednavatel@example.sk',
    vystavena: sk(today),
    dodana: sk(today),
    splatna: sk(day(7)),
    iban: 'SK31 1200 0000 1987 4263 7541',
    riadky: '2',
    'r0-popis': 'Kuchynská linka',
    'r0-mnozstvo': '1',
    'r0-jednotka': 'ks',
    'r0-cena': '1000,00',
    'r0-dph': '23',
    'r1-popis': 'Návod',
    'r1-mnozstvo': '1',
    'r1-jednotka': 'ks',
    'r1-cena': '200,00',
    'r1-dph': '5',
    ...extra,
  })

  let page = plain(await (await client.get('/app/faktury')).text())
  check('the invoices offer a request for an advance', page.includes('href="/app/faktury/nova?zalohova=1"') && page.includes('Nová zálohová faktúra'))
  page = plain(await (await client.get('/app/faktury/nova?zalohova=1')).text())
  check('its form says what it is and what follows', page.includes('Zálohová faktúra je výzva na zaplatenie zálohy, nie daňový doklad') && page.includes('name="druh" value="zalohova"'))
  let res = await client.post('/app/faktury', form({ druh: 'zalohova', rezim: 'export', icdph: 'CHE123456789' }))
  check('a request is made for a supply with Slovak VAT only', res.status === 422 && plain(await res.text()).includes('Zálohovú faktúru zatiaľ vystavíte len na dodanie so slovenskou DPH'))
  res = await client.post('/app/faktury', form({ druh: 'zalohova' }))
  const requestId = idOf(res)
  const request = await db.prepare('SELECT kind, number, vs, total_cents, document_id, token FROM invoices WHERE id = ?').bind(requestId).first()
  check(
    'a request is numbered in its own row with its own variable symbol, and is no document of the company',
    res.status === 303 && request?.kind === 'proforma' && request.number === `ZF${year}0001` && request.vs === `${year}90001` && request.total_cents === 144000 && request.document_id === null,
    JSON.stringify(request),
  )
  check('nothing waits to be booked of it', (await db.prepare('SELECT COUNT(*) AS n FROM documents WHERE company_id = ?').bind(company).first())?.n === 0)
  const requestRaw = await (await client.get(`/app/faktury/${requestId}`)).text()
  if (capture) writeFileSync(`${capture}/advance-request.html`, requestRaw)
  page = plain(requestRaw)
  check(
    'its page: no tax document, the symbol to pay with, no advance yet',
    page.includes(`Zálohová faktúra ZF${year}0001`) && page.includes('Zálohová faktúra nie je daňovým dokladom') && page.includes(`${year}90001`) && page.includes('Záloha zatiaľ neprišla'),
  )
  check('a request has no e-invoice, here or at its customer', (await client.get(`/app/faktury/${requestId}/xml`)).status === 404 && (await client.get(`/f/${request?.token}/xml`)).status === 404)
  res = await client.post(`/app/faktury/${requestId}/zaloha`, {})
  check(
    'without money on its symbol no advance is made',
    res.status === 303 && (await db.prepare("SELECT COUNT(*) AS n FROM invoices WHERE company_id = ? AND kind = 'advance'").bind(company).first())?.n === 0,
  )

  // The money comes: 600 € on the request's symbol.
  const received = day(-2)
  await db
    .prepare(
      "INSERT INTO payments (id, company_id, account_id, created_at, booked_on, amount_cents, party, vs, ref) VALUES ('pay-adv-1', ?, 'acc-advance', ?, ?, 60000, 'TEST-ONLY Objednávateľ s. r. o.', ?, 'adv-1')",
    )
    .bind(company, nowS, received, `${year}90001`)
    .run()
  page = plain(await (await client.get(`/app/faktury/${requestId}`)).text())
  check(
    'the payment shows on the request with the tax document due within 15 days',
    page.includes('600,00') && page.includes('Daňový doklad k prijatej platbe treba vystaviť do') && page.includes(`action="/app/faktury/${requestId}/zaloha"`),
  )
  res = await client.post(`/app/faktury/${requestId}/zaloha`, {})
  const advance = await db
    .prepare("SELECT id, kind, number, relates, payment_id, total_cents, vat_cents, delivered_on, document_id FROM invoices WHERE company_id = ? AND kind = 'advance'")
    .bind(company)
    .first()
  const advanceLines = (
    await db
      .prepare('SELECT vat_rate, base_cents, vat_cents FROM invoice_lines WHERE invoice_id = ? ORDER BY position')
      .bind(advance?.id ?? '')
      .all()
  ).results
  check(
    "the advance's tax document: numbered in the invoices' row, the payment's day, the payment split by the request's rates to the cent",
    res.status === 303 &&
      (res.headers.get('location') ?? '').includes('ok=zaloha') &&
      advance?.number === `${year}0001` &&
      advance.relates === requestId &&
      advance.payment_id === 'pay-adv-1' &&
      advance.total_cents === 60000 &&
      advance.delivered_on === received &&
      advanceLines.length === 2 &&
      advanceLines[0].vat_rate === 23 &&
      advanceLines[1].vat_rate === 5 &&
      advanceLines.every((l) => typeof l.vat_cents === 'number' && l.vat_cents > 0) &&
      advanceLines.reduce((sum, l) => sum + l.base_cents + l.vat_cents, 0) === 60000,
    JSON.stringify([advance, advanceLines]),
  )
  const advanceDoc = await db
    .prepare('SELECT d.category, d.total_cents, d.vat_lines, d.supplied_on, l.payment_id FROM documents d LEFT JOIN links l ON l.document_id = d.id WHERE d.id = ?')
    .bind(advance?.document_id ?? '')
    .first()
  check(
    'it is a document owed on 324 (a received advance), its VAT as the document says, linked to the payment',
    advanceDoc?.category === 'advance' &&
      advanceDoc.total_cents === 60000 &&
      advanceDoc.supplied_on === received &&
      advanceDoc.payment_id === 'pay-adv-1' &&
      JSON.parse(advanceDoc.vat_lines).reduce((s, l) => s + l.vat, 0) === advance?.vat_cents,
    JSON.stringify(advanceDoc),
  )
  res = await client.post(`/app/faktury/${requestId}/zaloha`, {})
  check('asked again, nothing more is made for that payment', (await db.prepare("SELECT COUNT(*) AS n FROM invoices WHERE company_id = ? AND kind = 'advance'").bind(company).first())?.n === 1)
  // A second payment, and two clicks at once: one document.
  await db
    .prepare(
      "INSERT INTO payments (id, company_id, account_id, created_at, booked_on, amount_cents, party, vs, ref) VALUES ('pay-adv-2', ?, 'acc-advance', ?, ?, 30001, 'TEST-ONLY Objednávateľ s. r. o.', ?, 'adv-2')",
    )
    .bind(company, nowS, day(-1), `${year}90001`)
    .run()
  await Promise.all([client.post(`/app/faktury/${requestId}/zaloha`, {}), client.post(`/app/faktury/${requestId}/zaloha`, {})])
  const advances = (await db.prepare("SELECT id, number, payment_id, total_cents FROM invoices WHERE company_id = ? AND kind = 'advance' ORDER BY seq").bind(company).all()).results
  check('two clicks at once make one document for the second payment', advances.length === 2 && advances[1].payment_id === 'pay-adv-2' && advances[1].total_cents === 30001, JSON.stringify(advances))

  const advanceRaw = await (await client.get(`/app/faktury/${advance?.id}`)).text()
  if (capture) writeFileSync(`${capture}/advance-document.html`, advanceRaw)
  page = plain(advanceRaw)
  check(
    'its page: the tax document of a payment received, the request it belongs to, the day it came, nothing to pay',
    page.includes(`Daňový doklad k prijatej platbe ${year}0001`) &&
      page.includes(`K zálohovej faktúre č. ZF${year}0001`) &&
      page.includes('Dátum prijatia platby') &&
      page.includes('Prijatá platba') &&
      !page.includes('sheet__qr') &&
      !page.includes('Dátum splatnosti') &&
      !page.includes('Spôsob úhrady'),
  )
  res = await client.get(`/app/faktury/${advance?.id}/xml`)
  const advanceXml = await res.text()
  check(
    'its e-invoice is a prepayment invoice (386) with nothing left to pay',
    (res.headers.get('content-disposition') ?? '').includes('zaloha-') &&
      advanceXml.includes('<cbc:InvoiceTypeCode>386</cbc:InvoiceTypeCode>') &&
      advanceXml.includes('<cbc:PrepaidAmount currencyID="EUR">600.00</cbc:PrepaidAmount>') &&
      advanceXml.includes('<cbc:PayableAmount currencyID="EUR">0.00</cbc:PayableAmount>'),
  )
  res = await client.post(`/app/faktury/${advance?.id}/poslat`, {})
  const advanceMail = await db.prepare("SELECT subject, body FROM outbox WHERE recipient = 'objednavatel@example.sk' AND subject LIKE 'Daňový doklad%'").first()
  check(
    'sent to the customer as the document of the advance received, nothing to pay',
    res.status === 303 &&
      advanceMail?.subject === `Daňový doklad k prijatej platbe ${year}0001 od TEST-ONLY Záloha s. r. o.` &&
      plain(advanceMail.body).includes(`ďakujeme za zálohu 600,00 € prijatú`) &&
      advanceMail.body.includes(`k zálohovej faktúre č. ZF${year}0001`) &&
      !advanceMail.body.includes('splatnosťou'),
    JSON.stringify(advanceMail),
  )
  page = plain(await (await client.get(`/app/faktury/${requestId}`)).text())
  check(
    'the request lists its documents and leads to the final invoice',
    page.includes(`/app/faktury/${advance?.id}`) && page.includes('Doklady k prijatým platbám') && page.includes(`/app/faktury/nova?vyuctovanie=${requestId}`) && !page.includes('treba vystaviť do'),
  )

  // The final invoice: the whole supply, every advance deducted rate by rate.
  const finalRaw = await (await client.get(`/app/faktury/nova?vyuctovanie=${requestId}`)).text()
  if (capture) writeFileSync(`${capture}/advance-final-form.html`, finalRaw)
  page = plain(finalRaw)
  check(
    'the final invoice starts from the request: its customer and lines, the advances it will deduct',
    page.includes(`Vyúčtovacia faktúra k zálohovej faktúre ZF${year}0001`) &&
      page.includes('value="Kuchynská linka"') &&
      page.includes(`name="vyuctovanie" value="${requestId}"`) &&
      page.includes(`${year}0001`) &&
      page.includes(`${year}0002`),
  )
  res = await client.post('/app/faktury', form({ vyuctovanie: requestId }))
  const finalId = idOf(res)
  const final = await db.prepare('SELECT kind, number, relates, base_cents, vat_cents, total_cents, document_id FROM invoices WHERE id = ?').bind(finalId).first()
  const finalLines = (await db.prepare('SELECT vat_rate, base_cents, vat_cents, description FROM invoice_lines WHERE invoice_id = ? ORDER BY position').bind(finalId).all()).results
  const advVat = (
    await db
      .prepare(
        "SELECT l.vat_rate, SUM(l.base_cents) AS base, SUM(l.vat_cents) AS vat FROM invoice_lines l JOIN invoices i ON i.id = l.invoice_id WHERE i.company_id = ? AND i.kind = 'advance' GROUP BY l.vat_rate",
      )
      .bind(company)
      .all()
  ).results
  const advBase = advVat.reduce((s, r) => s + r.base, 0)
  const advTax = advVat.reduce((s, r) => s + r.vat, 0)
  check(
    "issued with the next number, the advances deducted: what is left is the supply less what came, its VAT the supply's less the advances'",
    res.status === 303 &&
      final?.kind === 'invoice' &&
      final.number === `${year}0003` &&
      final.relates === requestId &&
      finalLines.length === 6 &&
      finalLines.slice(2).every((l) => l.base_cents < 0 && l.vat_cents < 0 && l.description.startsWith('Odpočet zálohy, doklad č.')) &&
      final.total_cents === 144000 - 60000 - 30001 &&
      final.base_cents === 120000 - advBase &&
      final.vat_cents === 23000 + 1000 - advTax,
    JSON.stringify([final, finalLines]),
  )
  const finalDoc = await db
    .prepare('SELECT category, total_cents, advance_cents FROM documents WHERE id = ?')
    .bind(final?.document_id ?? '')
    .first()
  check(
    "its document keeps the advances' base, which the books move from 324 to the revenue",
    finalDoc?.category === 'sales' && finalDoc.total_cents === 53999 && finalDoc.advance_cents === advBase,
    JSON.stringify(finalDoc),
  )
  const sheetRaw = await (await client.get(`/app/faktury/${finalId}`)).text()
  if (capture) writeFileSync(`${capture}/advance-final.html`, sheetRaw)
  page = plain(sheetRaw)
  check(
    'its page names the request and shows each deduction',
    page.includes(`K zálohovej faktúre č. ZF${year}0001`) && page.includes(`Odpočet zálohy, doklad č. ${year}0001`) && page.includes('539,99'),
  )
  const finalXml = await (await client.get(`/app/faktury/${finalId}/xml`)).text()
  check(
    'its e-invoice is an invoice of what is left',
    finalXml.includes('<cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>') && finalXml.includes('<cbc:PayableAmount currencyID="EUR">539.99</cbc:PayableAmount>'),
  )
  res = await client.post('/app/faktury', form({ vyuctovanie: requestId }))
  check('a second final invoice is refused: it would deduct the same advances again', res.status === 409 && plain(await res.text()).includes('je už vystavená vyúčtovacia faktúra'))
  res = await client.get(`/app/faktury/nova?vyuctovanie=${requestId}`)
  check('and the request leads to the one there is', res.status === 303 && (res.headers.get('location') ?? '').endsWith(`/app/faktury/${finalId}`))
  // Money that comes on the request's symbol after the final invoice is no advance.
  await db
    .prepare(
      "INSERT INTO payments (id, company_id, account_id, created_at, booked_on, amount_cents, party, vs, ref) VALUES ('pay-adv-3', ?, 'acc-advance', ?, ?, 53999, 'TEST-ONLY Objednávateľ s. r. o.', ?, 'adv-3')",
    )
    .bind(company, nowS, today, `${year}90001`)
    .run()
  page = plain(await (await client.get(`/app/faktury/${requestId}`)).text())
  await client.post(`/app/faktury/${requestId}/zaloha`, {})
  check(
    'after the final invoice the request leads to it and makes no advance',
    page.includes(`/app/faktury/${finalId}`) &&
      !page.includes(`action="/app/faktury/${requestId}/zaloha"`) &&
      (await db.prepare("SELECT COUNT(*) AS n FROM invoices WHERE company_id = ? AND kind = 'advance'").bind(company).first())?.n === 2,
  )
  // A credit note of the final invoice may lower the whole supply, not only what was left to pay.
  page = plain(await (await client.get(`/app/faktury/nova?dobropis=${finalId}`)).text())
  check(
    'a final invoice takes a credit note, starting from its supply without the deductions',
    page.includes(`Dobropis k faktúre ${year}0003`) && page.includes('value="Kuchynská linka"') && !page.includes('Odpočet zálohy'),
  )
  page = plain(await (await client.get('/app/faktury')).text())
  check('the list names each kind', page.includes(`ZF${year}0001`) && page.includes('Zálohová faktúra') && page.includes('Daňový doklad k prijatej platbe'))

  // A company that is no VAT payer: the document of the money received, no VAT.
  await db.batch([
    db
      .prepare(
        "INSERT INTO companies (id, created_at, name, ico, address, vat_payer, plan, inbox, start_on) VALUES ('co-advance-0', ?, 'TEST-ONLY Bez DPH s. r. o.', '50777780', 'Hlavná 8, 811 01 Bratislava', 0, 'start', 'zalo0002', '2026-01-01')",
      )
      .bind(nowS),
    db.prepare("INSERT INTO members (company_id, user_id, role, created_at) VALUES ('co-advance-0', 'u-advance', 'owner', ?)").bind(nowS),
    db.prepare("INSERT INTO accounts (id, company_id, iban) VALUES ('acc-advance-0', 'co-advance-0', 'SK3112000000198742637541')"),
  ])
  await client.post('/app/firma/prepnut', { firma: 'co-advance-0' })
  res = await client.post('/app/faktury', form({ druh: 'zalohova', icdph: '', 'r0-dph': '0', 'r1-dph': '0' }))
  const plainRequest = await db.prepare("SELECT id, vs FROM invoices WHERE company_id = 'co-advance-0' AND kind = 'proforma'").first()
  if (plainRequest) {
    await db
      .prepare(
        "INSERT INTO payments (id, company_id, account_id, created_at, booked_on, amount_cents, party, vs, ref) VALUES ('pay-adv-0', 'co-advance-0', 'acc-advance-0', ?, ?, 50000, 'TEST-ONLY Objednávateľ s. r. o.', ?, 'adv-0')",
      )
      .bind(nowS, day(-1), plainRequest.vs)
      .run()
    page = plain(await (await client.get(`/app/faktury/${plainRequest.id}`)).text())
    await client.post(`/app/faktury/${plainRequest.id}/zaloha`, {})
  }
  const plainAdvance = await db.prepare("SELECT id, vat_cents, total_cents FROM invoices WHERE company_id = 'co-advance-0' AND kind = 'advance'").first()
  const plainLines = (
    await db
      .prepare('SELECT vat_rate, vat_cents FROM invoice_lines WHERE invoice_id = ?')
      .bind(plainAdvance?.id ?? '')
      .all()
  ).results
  check(
    'a company that is no VAT payer gets the document of the money received, without VAT',
    page.includes('Vystaviť doklad k prijatej platbe') &&
      !page.includes('treba vystaviť do') &&
      plainAdvance?.vat_cents === 0 &&
      plainAdvance.total_cents === 50000 &&
      plainLines.length === 1 &&
      plainLines[0].vat_cents === null,
    JSON.stringify([plainAdvance, plainLines]),
  )
}
