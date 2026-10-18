// Credit notes (18 October 2026), in workerd: a VAT payer issues an invoice, then a credit note to it from its page
// (its customer and lines to start from, a reason asked, no more than the invoice has left at each rate), kept with
// the minus as a document that names the invoice; its e-invoice is UBL's CreditNote naming the invoice; the invoice
// lists it and what is left to collect is lowered.
import { check } from './check.mjs'
import { writeFileSync } from 'node:fs'

export async function checkCreditNotes({ db, nowS, signIn, as, day, capture }) {
  const company = 'co-credit'
  const plain = (text) => text.replace(/[  ]/g, ' ')
  const sk = (d) => `${Number(d.slice(8))}. ${Number(d.slice(5, 7))}. ${d.slice(0, 4)}`
  await db.batch([
    db
      .prepare(
        "INSERT INTO companies (id, created_at, name, ico, dic, icdph, address, vat_payer, vat_since, plan, inbox, start_on) VALUES (?, ?, 'TEST-ONLY Dobropis s. r. o.', '50888885', '2120888885', 'SK2120888885', 'Hlavná 5, 811 01 Bratislava', 1, '2026-01-01', 'firma', 'dobr0001', '2026-01-01')",
      )
      .bind(company, nowS),
    db.prepare("INSERT INTO users (id, created_at, email, name) VALUES ('u-credit', ?, 'credit@example.sk', 'TEST-ONLY Dobropisová')").bind(nowS),
    db.prepare("INSERT INTO members (company_id, user_id, role, created_at) VALUES (?, 'u-credit', 'owner', ?)").bind(company, nowS),
    db.prepare("INSERT INTO accounts (id, company_id, iban) VALUES ('acc-credit', ?, 'SK3112000000198742637541')").bind(company),
  ])
  const client = as((await signIn('credit@example.sk')).cookie)
  const today = day(0)
  let res = await client.post('/app/faktury', {
    akcia: 'vystavit',
    ico: '50123456',
    meno: 'TEST-ONLY Odberateľ s. r. o.',
    adresa: 'Námestie 2, 040 01 Košice',
    dic: '2120000000',
    icdph: 'SK2120000000',
    email: 'odberatel@example.sk',
    vystavena: sk(today),
    dodana: sk(today),
    splatna: sk(day(14)),
    iban: 'SK31 1200 0000 1987 4263 7541',
    riadky: '3',
    'r0-popis': 'Stolička',
    'r0-mnozstvo': '4',
    'r0-jednotka': 'ks',
    'r0-cena': '50,00',
    'r0-dph': '23',
    'r1-popis': 'Kniha',
    'r1-mnozstvo': '1',
    'r1-jednotka': 'ks',
    'r1-cena': '20,00',
    'r1-dph': '5',
  })
  const invoiceId = res.headers.get('location')?.match(/\/app\/faktury\/([0-9a-f-]{36})/)?.[1] ?? ''
  const invoice = await db.prepare('SELECT number, total_cents FROM invoices WHERE id = ?').bind(invoiceId).first()
  check('a VAT payer issues an invoice at two rates', res.status === 303 && invoice?.total_cents === 20000 + 4600 + 2000 + 100, JSON.stringify(invoice))

  let page = plain(await (await client.get(`/app/faktury/${invoiceId}`)).text())
  check('the invoice offers a credit note', page.includes(`/app/faktury/nova?dobropis=${invoiceId}`) && page.includes('Vystaviť dobropis'))
  const formRaw = await (await client.get(`/app/faktury/nova?dobropis=${invoiceId}`)).text()
  if (capture) writeFileSync(`${capture}/credit-form.html`, formRaw)
  page = plain(formRaw)
  check(
    'a credit note starts from the invoice: its customer, its lines, a reason to give',
    page.includes(`Dobropis k faktúre ${invoice?.number}`) &&
      page.includes('TEST-ONLY Odberateľ s. r. o.') &&
      page.includes('value="Stolička"') &&
      page.includes('name="dovod"') &&
      page.includes(`name="dobropis" value="${invoiceId}"`),
  )
  const form = (extra) => ({
    akcia: 'vystavit',
    dobropis: invoiceId,
    meno: 'Niekto iný',
    email: 'odberatel@example.sk',
    vystavena: sk(today),
    dodana: sk(today),
    splatna: sk(day(14)),
    riadky: '1',
    'r0-popis': 'Vrátená stolička',
    'r0-mnozstvo': '1',
    'r0-jednotka': 'ks',
    'r0-cena': '50,00',
    'r0-dph': '23',
    dovod: 'Vrátený tovar',
    ...extra,
  })
  res = await client.post('/app/faktury', form({ dovod: '' }))
  check('a credit note says why', res.status === 422 && plain(await res.text()).includes('Napíšte, prečo sa faktúra znižuje'))
  res = await client.post('/app/faktury', form({ 'r0-mnozstvo': '5' }))
  check('a credit note takes no more than the invoice has at a rate', res.status === 422 && plain(await res.text()).includes('pri sadzbe 23 % najviac 200,00 €'))
  res = await client.post('/app/faktury', form({}))
  const creditId = res.headers.get('location')?.match(/\/app\/faktury\/([0-9a-f-]{36})/)?.[1] ?? ''
  const credit = await db.prepare('SELECT kind, corrects, reason, number, customer_name, total_cents, vat_cents, document_id, iban FROM invoices WHERE id = ?').bind(creditId).first()
  const doc = await db
    .prepare('SELECT kind, total_cents, vat_cents, corrects, vat_lines FROM documents WHERE id = ?')
    .bind(credit?.document_id ?? '')
    .first()
  check(
    "issued with the next number, the invoice's customer whatever was posted, kept with the minus",
    res.status === 303 &&
      credit?.kind === 'credit' &&
      credit.corrects === invoiceId &&
      credit.reason === 'Vrátený tovar' &&
      credit.number === String(Number(invoice?.number) + 1) &&
      credit.customer_name === 'TEST-ONLY Odberateľ s. r. o.' &&
      credit.total_cents === -6150 &&
      credit.vat_cents === -1150 &&
      credit.iban === null,
    JSON.stringify(credit),
  )
  check(
    'its document names the invoice it corrects, its VAT a minus',
    doc?.kind === 'invoice_out' && doc.total_cents === -6150 && doc.corrects === invoice?.number && JSON.parse(doc.vat_lines)[0].vat === -1150,
    JSON.stringify(doc),
  )
  const sheetRaw = await (await client.get(`/app/faktury/${creditId}`)).text()
  if (capture) writeFileSync(`${capture}/credit-note.html`, sheetRaw)
  page = plain(sheetRaw)
  check(
    'its page is a credit note: the invoice it corrects, the reason, to be paid back, no QR code and no way to pay',
    page.includes('Dobropis') &&
      page.includes(`Opravná faktúra k faktúre č. ${invoice?.number}`) &&
      page.includes('Vrátený tovar') &&
      page.includes('Spolu na vrátenie') &&
      page.includes('\u221261,50') &&
      !page.includes('sheet__qr') &&
      !page.includes('Prevodom na účet'),
  )
  res = await client.get(`/app/faktury/${creditId}/xml`)
  const xml = await res.text()
  check(
    "its e-invoice is UBL's CreditNote naming the invoice, its amounts plus",
    (res.headers.get('content-disposition') ?? '').includes('dobropis-') &&
      xml.includes('<CreditNote xmlns="urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2"') &&
      xml.includes('<cbc:CreditNoteTypeCode>381</cbc:CreditNoteTypeCode>') &&
      xml.includes(`<cac:BillingReference><cac:InvoiceDocumentReference><cbc:ID>${invoice?.number}</cbc:ID>`) &&
      xml.includes('<cbc:PayableAmount currencyID="EUR">61.50</cbc:PayableAmount>') &&
      xml.includes('<cbc:CreditedQuantity unitCode="C62">1</cbc:CreditedQuantity>'),
  )
  page = plain(await (await client.get(`/app/faktury/${invoiceId}`)).text())
  check('the invoice lists its credit note', page.includes('Dobropisy k tejto faktúre') && page.includes(`/app/faktury/${creditId}`))
  page = plain(await (await client.get('/app/faktury')).text())
  check('what is left to collect is the invoice less its credit note', page.includes('205,50') && page.includes(`Dobropis k faktúre ${invoice?.number}`))
  res = await client.post('/app/faktury', form({ 'r0-mnozstvo': '4' }))
  check('a second credit note takes only what the first left', res.status === 422 && plain(await res.text()).includes('najviac 150,00 €'))
  res = await client.get(`/app/faktury/nova?dobropis=${creditId}`)
  check('a credit note has no credit note of its own', res.status === 200 && !plain(await res.text()).includes('Dobropis k faktúre'))
}
