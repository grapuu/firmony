// E-invoices through the Peppol network (26 October 2026), in workerd. Without a postman (the live Worker today) the
// invoice says whether its customer can receive and when sending starts; with the pretend postman (a second Worker of
// the same database) a company sends and receives only once the postman told us it chose Firmony (a workspace only
// after the administrator confirms it); then an invoice is sent by one click, once, its state follows the postman's
// signed notices (also one that came before our record), a busy postman is tried again by the schedule, a refusal can
// be sent again, a rejection is answered by a credit note, and what the network delivers becomes a client's document or
// a workspace's received invoice with the QR code that pays it. What no company can take is kept for the administrator.
import { check } from './check.mjs'
import { PEPPOL_TEST } from './pretend.mjs'
import { writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { migrationSteps } from '../.wrangler/dist/schema.js'

const plain = (text) => text.replace(/\u2060/g, '').replace(/\u00a0/g, ' ')

/** A received e-invoice as a supplier's postman delivers it: UBL 2.1, Peppol BIS 3.0, a Slovak supplier with its IBAN. */
function supplierInvoice({ number, total, customerDic, iban = 'SK8975000000000012345671', due, credit = false, typeCode = '380', supplierDic = '2023489446' }) {
  const root = credit ? 'CreditNote' : 'Invoice'
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
<cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
<cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
<cbc:ID>${number}</cbc:ID><cbc:IssueDate>2026-10-20</cbc:IssueDate><cbc:DueDate>${due}</cbc:DueDate><cbc:InvoiceTypeCode>${typeCode}</cbc:InvoiceTypeCode><cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode>
<cac:AccountingSupplierParty><cac:Party><cbc:EndpointID schemeID="0245">${supplierDic}</cbc:EndpointID><cac:PartyName><cbc:Name>TEST-ONLY Dodávateľ s. r. o.</cbc:Name></cac:PartyName><cac:PostalAddress><cac:Country><cbc:IdentificationCode>SK</cbc:IdentificationCode></cac:Country></cac:PostalAddress><cac:PartyLegalEntity><cbc:RegistrationName>TEST-ONLY Dodávateľ s. r. o.</cbc:RegistrationName><cbc:CompanyID schemeID="0158">52123456</cbc:CompanyID></cac:PartyLegalEntity></cac:Party></cac:AccountingSupplierParty>
<cac:AccountingCustomerParty><cac:Party><cbc:EndpointID schemeID="0245">${customerDic}</cbc:EndpointID><cac:PartyName><cbc:Name>TEST-ONLY Odberateľ</cbc:Name></cac:PartyName><cac:PostalAddress><cac:Country><cbc:IdentificationCode>SK</cbc:IdentificationCode></cac:Country></cac:PostalAddress><cac:PartyLegalEntity><cbc:RegistrationName>TEST-ONLY Odberateľ</cbc:RegistrationName></cac:PartyLegalEntity></cac:Party></cac:AccountingCustomerParty>
<cac:PaymentMeans><cbc:PaymentMeansCode>30</cbc:PaymentMeansCode><cbc:PaymentID>${number.replace(/\D/g, '')}</cbc:PaymentID><cac:PayeeFinancialAccount><cbc:ID>${iban}</cbc:ID></cac:PayeeFinancialAccount></cac:PaymentMeans>
<cac:TaxTotal><cbc:TaxAmount currencyID="EUR">0.00</cbc:TaxAmount></cac:TaxTotal>
<cac:LegalMonetaryTotal><cbc:LineExtensionAmount currencyID="EUR">${total}</cbc:LineExtensionAmount><cbc:TaxExclusiveAmount currencyID="EUR">${total}</cbc:TaxExclusiveAmount><cbc:TaxInclusiveAmount currencyID="EUR">${total}</cbc:TaxInclusiveAmount><cbc:PayableAmount currencyID="EUR">${total}</cbc:PayableAmount></cac:LegalMonetaryTotal>
<cac:InvoiceLine><cbc:ID>1</cbc:ID><cbc:InvoicedQuantity unitCode="C62">1</cbc:InvoicedQuantity><cbc:LineExtensionAmount currencyID="EUR">${total}</cbc:LineExtensionAmount><cac:Item><cbc:Name>Služba</cbc:Name><cac:ClassifiedTaxCategory><cbc:ID>O</cbc:ID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:ClassifiedTaxCategory></cac:Item><cac:Price><cbc:PriceAmount currencyID="EUR">${total}</cbc:PriceAmount></cac:Price></cac:InvoiceLine>
</Invoice>`
  return credit ? xml.replace(/Invoice-2"/, 'CreditNote-2"').replace('<Invoice ', '<CreditNote ').replace('</Invoice>', '</CreditNote>').replace('<cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>', '<cbc:CreditNoteTypeCode>381</cbc:CreditNoteTypeCode>').replace(/InvoiceLine>/g, 'CreditNoteLine>').replace(/InvoicedQuantity/g, 'CreditedQuantity') : xml
}

export async function checkPeppolNetwork({ mf, db, signIn, as, nowS, day, network, tick, adminCookie, capture }) {
  // The schema: the 83 steps live since 26 October 2026 unchanged, Peppol's the next.
  check('peppol: the 83 earlier schema steps are unchanged', createHash('sha256').update(JSON.stringify(migrationSteps.slice(0, 83))).digest('hex') === '4ff7f8a4e532c5b6346fb42b31c345d3306bb4cb0314132b3da23b5ecc186d62')
  check('peppol: its schema step is step 84', migrationSteps.length >= 84 && JSON.stringify(migrationSteps[83]).includes('CREATE TABLE IF NOT EXISTS einvoice_sends'))
  const company = 'co-peppol'
  const sk = (d) => `${Number(d.slice(8))}. ${Number(d.slice(5, 7))}. ${d.slice(0, 4)}`
  const idOf = (res) => res.headers.get('location')?.match(/\/app\/faktury\/([0-9a-f-]{36})/)?.[1] ?? ''
  await db.batch([
    db
      .prepare(
        "INSERT INTO companies (id, created_at, name, ico, dic, icdph, address, vat_payer, vat_since, plan, inbox, start_on) VALUES (?, ?, 'TEST-ONLY Peppol s. r. o.', '50888820', '2120888880', 'SK2120888880', 'Hlavná 15, 811 01 Bratislava', 1, '2026-01-01', 'firma', 'pepp0001', '2026-01-01')",
      )
      .bind(company, nowS),
    db.prepare("INSERT INTO users (id, created_at, email, name) VALUES ('u-peppol', ?, 'peppol@example.sk', 'TEST-ONLY Peppolová')").bind(nowS),
    db.prepare("INSERT INTO members (company_id, user_id, role, created_at) VALUES (?, 'u-peppol', 'owner', ?)").bind(company, nowS),
    db.prepare("INSERT INTO accounts (id, company_id, iban) VALUES ('acc-peppol', ?, 'SK3112000000198742637541')").bind(company),
  ])
  network.register('0245:2120888880', PEPPOL_TEST.smp)
  const cookie = (await signIn('peppol@example.sk')).cookie
  const owner = as(cookie)
  // The same person through the Worker that has the pretend postman (routed by its own host, same database).
  const worker = await mf.getWorker('firmony-peppol')
  const site = 'https://peppol.firmony.io'
  const client = (ip, cookie) => ({
    get: (path) => mf.dispatchFetch(`${site}${path}`, { redirect: 'manual', headers: { 'cf-connecting-ip': ip, cookie } }),
    post(path, fields) {
      const body = new URLSearchParams(fields).toString()
      return mf.dispatchFetch(`${site}${path}`, { method: 'POST', body, redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded', 'content-length': String(Buffer.byteLength(body)), 'cf-connecting-ip': ip, origin: site, cookie } })
    },
  })
  const live = client('203.0.113.31', cookie)
  const notify = (events, options) => {
    const { body, signature } = network.notice(events, options)
    return mf.dispatchFetch(`${site}/peppol/udalosti`, { method: 'POST', body, headers: { 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(body)), 'x-peppol-signature': signature } })
  }
  const today = day(0)
  const issue = async (icdph, client = owner) =>
    idOf(
      await client.post('/app/faktury', {
        akcia: 'vystavit',
        meno: `TEST-ONLY Odberateľ ${icdph}`,
        adresa: 'Námestie 1, 040 01 Košice',
        icdph,
        vystavena: sk(today),
        dodana: sk(today),
        splatna: sk(day(14)),
        ucet: 'SK31 1200 0000 1987 4263 7541',
        'r0-popis': 'Konzultácie',
        'r0-mnozstvo': '2',
        'r0-jednotka': 'hod',
        'r0-cena': '50,00',
        'r0-dph': '23',
      }),
    )

  // Without a postman: the customer's place in the network, and when sending starts.
  const first = await issue('SK2023489446')
  let page = plain(await (await owner.get(`/app/faktury/${first}`)).text())
  check('peppol: an invoice to a Slovak company says it receives e-invoices and when sending through Firmony starts', page.includes('id="efaktura"') && page.includes('prijíma e-faktúry') && page.includes('zapíname pred 1. 1. 2027') && !page.includes('Odoslať e-faktúru'), page.slice(page.indexOf('efaktura'), page.indexOf('efaktura') + 600))
  check('peppol: without a postman nothing can be sent', (await owner.post(`/app/faktury/${first}/einvoice`, {})).status === 404)
  check('peppol: nor does anybody take notices', (await notify([])).status === 200 && (await mf.dispatchFetch('https://firmony.io/peppol/udalosti', { method: 'POST', body: '{}', headers: { 'content-length': '2' } })).status === 404)
  page = plain(await (await owner.get('/app/firma')).text())
  check('peppol: the company sees it is in the network by its DIČ', page.includes('id="peppol"') && page.includes('0245:2120888880') && page.includes('je v sieti Peppol'))
  check('peppol: an escaped address of the notices is no address', (await mf.dispatchFetch(`${site}/%70eppol/udalosti`, { method: 'POST', body: '{}', headers: { 'content-length': '2' } })).status === 404)
  check('peppol: an unsigned notice is refused before anything is read', (await mf.dispatchFetch(`${site}/peppol/udalosti`, { method: 'POST', body: '{"events":[]}', headers: { 'content-length': '13' } })).status === 403)

  // With the postman, before the company chose Firmony: nothing goes in its name, it is told how to turn it on.
  page = plain(await (await live.get(`/app/faktury/${first}`)).text())
  check('peppol: before the postman tells us the company chose Firmony, the invoice offers no sending, only the way to turn it on', !page.includes('Odoslať e-faktúru') && page.includes('Ako zapnúť e-faktúry') && page.includes('href="/app/firma#peppol"'))
  let res = await live.post(`/app/faktury/${first}/einvoice`, {})
  check('peppol: and sending it is refused', res.status === 303 && !(await db.prepare('SELECT 1 FROM einvoice_sends WHERE invoice_id = ?').bind(first).first()) && network.sent.length === 0)
  page = plain(await (await live.get('/app/firma')).text())
  check('peppol: in the network with our postman but not bound, the account is told it is not on, without naming anybody', page.includes('pre tento účet sme e-faktúry nezapli') && !page.includes('Overujeme'))
  res = await notify([{ type: 'registered', id: 'reg-co', participant: '0245:2120888880' }])
  const coWaiting = await db.prepare("SELECT * FROM peppol_unrouted WHERE ref = 'reg-co'").first()
  check('peppol: the postman\'s notice alone binds nobody, not even a client; it waits for the administrator', res.status === 200 && coWaiting?.reason === 'unverified' && coWaiting.company_id === company && !(await db.prepare('SELECT 1 FROM peppol_bindings WHERE participant = ?').bind('0245:2120888880').first()))
  page = plain(await (await live.get('/app/firma')).text())
  check('peppol: and the company sees that it is being confirmed', page.includes('Overujeme') && page.includes('overíme, že ide naozaj o Vašu firmu'))
  const bossCookie = await adminCookie()
  const boss = client('203.0.113.30', bossCookie)
  page = plain(await (await boss.get('/ucto/fakturacne-ucty')).text())
  check('peppol: the administrator sees the registration with what to verify first', page.includes('E-faktúry v sieti Peppol') && page.includes('Pripojiť TEST-ONLY Peppol s. r. o. (klient, IČO 50888820') && page.includes('Pripojte firmu až po overení'))
  res = await boss.post(`/ucto/fakturacne-ucty/peppol/${coWaiting.id}/pripojit`, { firma: company })
  check('peppol: confirmed by the administrator, the client is bound', res.status === 303 && (await db.prepare('SELECT company_id FROM peppol_bindings WHERE participant = ?').bind('0245:2120888880').first())?.company_id === company)
  page = plain(await (await live.get('/app/firma')).text())
  check('peppol: and the company sees it is on', page.includes('Zapnuté. E-faktúry posielate aj prijímate priamo vo Firmony.'))

  // One click, once.
  page = plain(await (await live.get(`/app/faktury/${first}`)).text())
  check('peppol: with a postman, the invoice offers to send it as an e-invoice', page.includes(`action="/app/faktury/${first}/einvoice"`) && page.includes('Odoslať e-faktúru'))
  if (capture) writeFileSync(`${capture}/peppol-send.html`, await (await live.get(`/app/faktury/${first}`)).text())
  res = await live.post(`/app/faktury/${first}/einvoice`, {})
  let row = await db.prepare('SELECT * FROM einvoice_sends WHERE invoice_id = ?').bind(first).first()
  const delivered = network.sent[0]
  check(
    'peppol: sent, the postman took the e-invoice from us to the customer, of the BIS invoice type',
    res.status === 303 && (res.headers.get('location') ?? '').includes('ok=efaktura') && row?.state === 'sent' && row.ref === 'pp-1' && row.sent_at > 0 &&
      delivered?.sender === '0245:2120888880' && delivered.receiver === '0245:2023489446' && delivered.documentType.includes('Invoice-2::Invoice##') && delivered.xml.includes('<cbc:EndpointID schemeID="0245">2023489446</cbc:EndpointID>'),
    JSON.stringify(row),
  )
  res = await live.post(`/app/faktury/${first}/einvoice`, {})
  check('peppol: a second click sends nothing twice', res.status === 303 && network.sent.length === 1 && (await db.prepare('SELECT COUNT(*) AS n FROM einvoice_sends WHERE invoice_id = ?').bind(first).first()).n === 1)
  check('peppol: a notice without the postman\'s signature is refused', (await notify([{ type: 'status', id: 'pp-1', state: 'delivered' }], { secret: 'TEST-ONLY-a-wrong-secret-of-at-least-32-chars' })).status === 403)
  check('peppol: so is an old one', (await notify([{ type: 'status', id: 'pp-1', state: 'delivered' }], { at: Math.floor(Date.now() / 1000) - 900 })).status === 403)
  check('peppol: a notice of more than a hundred events is refused whole, so the postman sends it in parts', (await notify(Array.from({ length: 101 }, (_, i) => ({ type: 'status', id: `x${i}`, state: 'delivered' })))).status === 413)
  res = await notify([{ type: 'status', id: 'pp-1', state: 'delivered' }])
  row = await db.prepare('SELECT state FROM einvoice_sends WHERE invoice_id = ?').bind(first).first()
  page = plain(await (await live.get(`/app/faktury/${first}`)).text())
  check('peppol: the postman\'s word moves it to delivered, and the page says what that means', res.status === 200 && row?.state === 'delivered' && page.includes('Doručená') && page.includes('doručila do schránky odberateľa'))
  if (capture) writeFileSync(`${capture}/peppol-delivered.html`, await (await live.get(`/app/faktury/${first}`)).text())
  page = plain(await (await live.get('/app/faktury')).text())
  check('peppol: the list marks the invoice delivered', page.includes('E-faktúra doručená'))
  let immutable = false
  try {
    await db.prepare("UPDATE einvoice_sends SET state = 'sent' WHERE invoice_id = ?").bind(first).run()
  } catch {
    immutable = true
  }
  check('peppol: a delivered e-invoice never goes back', immutable)

  // A customer not in the network: nothing to send.
  const nowhere = await issue('SK2111111111')
  page = plain(await (await live.get(`/app/faktury/${nowhere}`)).text())
  res = await live.post(`/app/faktury/${nowhere}/einvoice`, {})
  check('peppol: a customer not in the network is said so and gets nothing', page.includes('zatiaľ nie je v sieti Peppol') && !page.includes('Odoslať e-faktúru') && res.status === 303 && !(await db.prepare('SELECT 1 FROM einvoice_sends WHERE invoice_id = ?').bind(nowhere).first()))

  // A busy postman: tried again by the schedule, which claims the sending first.
  network.register('0245:2122222222', PEPPOL_TEST.smp)
  const busy = await issue('SK2122222222')
  network.state.busy = 1
  res = await live.post(`/app/faktury/${busy}/einvoice`, {})
  row = await db.prepare('SELECT state, tries, next_at FROM einvoice_sends WHERE invoice_id = ?').bind(busy).first()
  page = plain(await (await live.get(`/app/faktury/${busy}`)).text())
  check('peppol: a busy postman leaves it waiting to be tried again', (res.headers.get('location') ?? '').includes('ok=efaktura-ide') && row?.state === 'queued' && row.tries === 1 && row.next_at > nowS && page.includes('skúšame znova'))
  await db.prepare('UPDATE einvoice_sends SET next_at = ? WHERE invoice_id = ?').bind(nowS - 1, busy).run()
  await worker.scheduled({ scheduledTime: new Date(), cron: '*/15 * * * *' })
  let state = null
  for (let i = 0; i < 40 && state !== 'sent'; i++) {
    state = (await db.prepare('SELECT state FROM einvoice_sends WHERE invoice_id = ?').bind(busy).first())?.state
    if (state !== 'sent') await new Promise((r) => setTimeout(r, 100))
  }
  check('peppol: the schedule sends it when its time comes', state === 'sent')

  // The postman's word before our record of its reference (its answer to us was lost): kept, and applied when it is.
  network.register('0245:2144444444', PEPPOL_TEST.smp)
  const early = await issue('SK2144444444')
  const nextRef = `pp-${network.sent.length + 1}`
  res = await notify([{ type: 'status', id: nextRef, state: 'delivered' }])
  check('peppol: a status of a reference we do not know yet is kept, not lost', res.status === 200 && Boolean(await db.prepare('SELECT 1 FROM einvoice_status_pending WHERE ref = ?').bind(nextRef).first()))
  await live.post(`/app/faktury/${early}/einvoice`, {})
  check('peppol: once the sending has that reference, the kept status counts', (await db.prepare('SELECT state FROM einvoice_sends WHERE invoice_id = ?').bind(early).first())?.state === 'delivered' && !(await db.prepare('SELECT 1 FROM einvoice_status_pending WHERE ref = ?').bind(nextRef).first()))

  // A refusal: said, and sent again once mended; a customer's rejection, also after delivery, is answered by a credit note.
  network.register('0245:2133333333', PEPPOL_TEST.smp)
  const refused = await issue('SK2133333333')
  network.state.refuse.add('0245:2133333333')
  res = await live.post(`/app/faktury/${refused}/einvoice`, {})
  row = await db.prepare('SELECT state, reason FROM einvoice_sends WHERE invoice_id = ?').bind(refused).first()
  page = plain(await (await live.get(`/app/faktury/${refused}`)).text())
  check('peppol: a refused e-invoice is said with the reason and may be sent again', row?.state === 'failed' && row.reason === 'Príjemca e-faktúry nie je platný.' && page.includes('Nedoručená') && page.includes('Odoslať znova'))
  network.state.refuse.clear()
  res = await live.post(`/app/faktury/${refused}/einvoice`, {})
  check('peppol: sent again, a new sending goes', (await db.prepare("SELECT COUNT(*) AS n FROM einvoice_sends WHERE invoice_id = ? AND state = 'sent'").bind(refused).first()).n === 1)
  const ref = (await db.prepare("SELECT ref FROM einvoice_sends WHERE invoice_id = ? AND state = 'sent'").bind(refused).first()).ref
  await notify([{ type: 'status', id: ref, state: 'delivered' }, { type: 'status', id: ref, state: 'rejected', reason: 'Nesprávna suma' }])
  page = plain(await (await live.get(`/app/faktury/${refused}`)).text())
  check('peppol: a customer\'s rejection after the delivery is recorded and said with its reason', page.includes('Odmietnutá') && page.includes('Nesprávna suma'))
  check('peppol: a rejected invoice is not offered again as it is, a credit note is', !page.includes('Odoslať znova') && page.includes('Vystaviť dobropis') && page.includes(`/app/faktury/nova?dobropis=${refused}`))
  const before = network.sent.length
  res = await live.post(`/app/faktury/${refused}/einvoice`, {})
  check('peppol: and a click does not send it again', network.sent.length === before && (await db.prepare('SELECT COUNT(*) AS n FROM einvoice_sends WHERE invoice_id = ?').bind(refused).first()).n === 2)

  // What the network delivers to a client: a document read by our code, once.
  const xml = supplierInvoice({ number: 'FA-777', total: '123.45', customerDic: '2120888880', due: day(10) })
  res = await notify([{ type: 'received', id: 'in-1', sender: '0245:2023489446', receiver: '0245:2120888880', document: Buffer.from(xml).toString('base64') }])
  const got = await db.prepare('SELECT * FROM einvoice_received WHERE ref = ?').bind('in-1').first()
  const doc = got?.document_id ? await db.prepare('SELECT source, kind, party, total_cents, number FROM documents WHERE id = ?').bind(got.document_id).first() : null
  check(
    'peppol: an e-invoice delivered to a client becomes its document, read without the AI',
    res.status === 200 && doc?.source === 'einvoice' && doc.kind === 'invoice_in' && doc.party === 'TEST-ONLY Dodávateľ s. r. o.' && doc.total_cents === 12345 && doc.number === 'FA-777',
    JSON.stringify([got, doc]),
  )
  await notify([{ type: 'received', id: 'in-1', sender: '0245:2023489446', receiver: '0245:2120888880', document: Buffer.from(xml).toString('base64') }])
  check('peppol: delivered twice, it is one', (await db.prepare("SELECT COUNT(*) AS n FROM einvoice_received WHERE ref = 'in-1'").first()).n === 1)
  res = await notify([{ type: 'received', id: 'in-x', receiver: '0245:9999999999', document: Buffer.from(xml).toString('base64') }])
  const lost = await db.prepare("SELECT * FROM peppol_unrouted WHERE ref = 'in-x'").first()
  check('peppol: one for nobody of ours is kept for the administrator with its e-invoice, never in a company', (await res.json()).unrouted === 1 && lost?.reason === 'unbound' && Boolean(lost.file_key) && !(await db.prepare("SELECT 1 FROM einvoice_received WHERE ref = 'in-x'").first()))
  res = await notify([{ type: 'received', id: 'in-big', receiver: '0245:2120888880', sender: '0245:2023489446', document: Buffer.from(supplierInvoice({ number: 'X'.repeat(5000), total: '1.00', customerDic: '2120888880', due: day(10) }).replace('TEST-ONLY Dodávateľ s. r. o.</cbc:Name>', `${'Z'.repeat(2_300_000)}</cbc:Name>`)).toString('base64') }, { type: 'status', id: 'pp-1', state: 'rejected', reason: 'Po doručení' }])
  check('peppol: an e-invoice with outsized fields neither stops the notice nor fills a row', res.status === 200 && (await db.prepare('SELECT state FROM einvoice_sends WHERE ref = ?').bind('pp-1').first())?.state === 'rejected')

  // A workspace of invoicing receives too, once the administrator confirmed that it is the company that chose us.
  await db.batch([
    db
      .prepare("INSERT INTO companies (id, created_at, name, ico, dic, address, vat_payer, plan, inbox, invoicing_only, terms_version) VALUES ('ws-peppol', ?, 'TEST-ONLY Živnosť Peppol', '53999990', '2120999990', 'Krátka 1, 040 01 Košice', 0, 'faktury', 'peppw001', 1, 'fakturacia-2026-10-26')")
      .bind(nowS),
    db.prepare("INSERT INTO users (id, created_at, email, name) VALUES ('u-ws-peppol', ?, 'ws-peppol@example.sk', 'TEST-ONLY Živnostník')").bind(nowS),
    db.prepare("INSERT INTO members (company_id, user_id, role, created_at) VALUES ('ws-peppol', 'u-ws-peppol', 'owner', ?)").bind(nowS),
  ])
  const wsCookie = (await signIn('ws-peppol@example.sk')).cookie
  const ws = client('203.0.113.32', wsCookie)
  page = plain(await (await ws.get('/app/prijate')).text())
  check('peppol: a workspace has its received invoices among its places, empty at first', page.includes('href="/app/prijate"') && page.includes('Zatiaľ Vám nikto e-faktúru neposlal'))
  const wsInvoice = supplierInvoice({ number: 'FA-888', total: '99.90', customerDic: '2120999990', due: day(7) })
  await notify([{ type: 'received', id: 'in-ws-early', sender: '0245:2023489446', receiver: '0245:2120999990', document: Buffer.from(supplierInvoice({ number: 'FA-887', total: '10.00', customerDic: '2120999990', due: day(7) })).toString('base64') }])
  check('peppol: before it is bound, what comes for its DIČ does not reach it', !(await db.prepare("SELECT 1 FROM einvoice_received WHERE company_id = 'ws-peppol'").first()) && (await db.prepare("SELECT reason FROM peppol_unrouted WHERE ref = 'in-ws-early'").first())?.reason === 'unbound')
  await notify([{ type: 'registered', id: 'reg-ws', participant: '0245:2120999990' }])
  const waiting = await db.prepare("SELECT * FROM peppol_unrouted WHERE ref = 'reg-ws'").first()
  page = plain(await (await ws.get('/app/fakturacia')).text())
  check('peppol: a workspace is not bound by the notice alone; it waits for the administrator and is told so', waiting?.reason === 'unverified' && waiting.company_id === 'ws-peppol' && !(await db.prepare("SELECT 1 FROM peppol_bindings WHERE company_id = 'ws-peppol'").first()) && page.includes('Overujeme'))
  page = plain(await (await boss.get('/ucto/fakturacne-ucty')).text())
  check('peppol: the administrator sees what waits, with the company to bind and the e-invoice no company took', page.includes('E-faktúry v sieti Peppol') && page.includes('Pripojiť TEST-ONLY Živnosť Peppol') && page.includes('Stiahnuť e-faktúru'))
  res = await boss.get(`/ucto/fakturacne-ucty/peppol/${lost.id}/subor.xml`)
  check('peppol: and downloads that e-invoice', res.status === 200 && (await res.text()).includes('<cbc:ID>FA-777</cbc:ID>'))
  await ws.post(`/ucto/fakturacne-ucty/peppol/${waiting.id}/pripojit`, { firma: 'ws-peppol' })
  check('peppol: nobody but the administrator binds a company', !(await db.prepare("SELECT 1 FROM peppol_bindings WHERE company_id = 'ws-peppol'").first()))
  res = await boss.post(`/ucto/fakturacne-ucty/peppol/${waiting.id}/pripojit`, { firma: company })
  check('peppol: nor binds the registration to a company of another DIČ', res.status === 404)
  res = await boss.post(`/ucto/fakturacne-ucty/peppol/${waiting.id}/pripojit`, { firma: 'ws-peppol' })
  check('peppol: confirmed by the administrator, the workspace is bound and the notice settled', res.status === 303 && (await db.prepare("SELECT company_id FROM peppol_bindings WHERE participant = '0245:2120999990'").first())?.company_id === 'ws-peppol' && (await db.prepare('SELECT resolved_at FROM peppol_unrouted WHERE id = ?').bind(waiting.id).first())?.resolved_at > 0)
  const earlyGot = await db.prepare("SELECT * FROM einvoice_received WHERE ref = 'in-ws-early'").first()
  check('peppol: what came for it before the binding is handed to it at once, and its kept copy goes', earlyGot?.company_id === 'ws-peppol' && Boolean(earlyGot.file_key) && (await db.prepare("SELECT resolved_at FROM peppol_unrouted WHERE ref = 'in-ws-early'").first())?.resolved_at > 0)
  res = await boss.post(`/ucto/fakturacne-ucty/peppol/${lost.id}/vybavene`, {})
  check('peppol: a notice handed on is marked settled', res.status === 303 && (await db.prepare('SELECT resolved_by FROM peppol_unrouted WHERE id = ?').bind(lost.id).first())?.resolved_by)

  await notify([{ type: 'received', id: 'in-ws', sender: '0245:2023489446', receiver: '0245:2120999990', document: Buffer.from(wsInvoice).toString('base64') }])
  const wsGot = await db.prepare("SELECT * FROM einvoice_received WHERE ref = 'in-ws'").first()
  page = plain(await (await ws.get('/app/prijate')).text())
  check(
    'peppol: what came is listed with its supplier, number and amount, and the place counts it to pay',
    wsGot?.company_id === 'ws-peppol' && wsGot.document_id === null && Boolean(wsGot.file_key) && page.includes('TEST-ONLY Dodávateľ s. r. o.') && page.includes('FA-888') && page.includes('99,90') && /class="count[^"]*">2</.test(page),
  )
  const detail = await (await ws.get(`/app/prijate/${wsGot.id}`)).text()
  if (capture) writeFileSync(`${capture}/peppol-received.html`, detail)
  check('peppol: its page pays it by the QR code a bank reads, and says who sent it', detail.includes('PAY by square') && detail.includes('<path fill="#000000"') && plain(detail).includes('SK89 7500 0000 0000 1234 5671') && plain(detail).includes('Odoslal v sieti Peppol: 0245:2023489446'))
  res = await ws.post(`/app/prijate/${wsGot.id}/zaplatena`, { den: sk(today) })
  check('peppol: marked paid, it is', res.status === 303 && (await db.prepare('SELECT paid_on FROM einvoice_received WHERE id = ?').bind(wsGot.id).first()).paid_on === today)
  res = await ws.get(`/app/prijate/${wsGot.id}/xml`)
  check('peppol: its e-invoice is downloaded as it came', res.status === 200 && (await res.text()).includes('<cbc:ID>FA-888</cbc:ID>'))
  check('peppol: a client has no such place, and nobody another company\'s', (await live.get('/app/prijate')).status === 404 && (await live.get(`/app/prijate/${wsGot.id}`)).status === 404)

  // A credit note and a prepayment invoice ask for nothing; a supplier the sender is not is said, without a QR code.
  await notify([
    { type: 'received', id: 'in-ws-credit', sender: '0245:2023489446', receiver: '0245:2120999990', document: Buffer.from(supplierInvoice({ number: 'DB-1', total: '20.00', customerDic: '2120999990', due: day(7), credit: true })).toString('base64') },
    { type: 'received', id: 'in-ws-386', sender: '0245:2023489446', receiver: '0245:2120999990', document: Buffer.from(supplierInvoice({ number: 'ZF-1', total: '30.00', customerDic: '2120999990', due: day(7), typeCode: '386' })).toString('base64') },
    { type: 'received', id: 'in-ws-fake', sender: '0245:2155555555', receiver: '0245:2120999990', document: Buffer.from(supplierInvoice({ number: 'FA-999', total: '500.00', customerDic: '2120999990', due: day(7), iban: 'SK3112000000198742637541' })).toString('base64') },
  ])
  const ids = Object.fromEntries((await db.prepare("SELECT ref, id FROM einvoice_received WHERE ref IN ('in-ws-credit', 'in-ws-386', 'in-ws-fake')").all()).results.map((r) => [r.ref, r.id]))
  const creditPage = plain(await (await ws.get(`/app/prijate/${ids['in-ws-credit']}`)).text())
  const prepaidPage = plain(await (await ws.get(`/app/prijate/${ids['in-ws-386']}`)).text())
  const fakePage = plain(await (await ws.get(`/app/prijate/${ids['in-ws-fake']}`)).text())
  check('peppol: a received credit note is said as one, without a QR code or a payment to mark', creditPage.includes('Dobropis') && creditPage.includes('nič neplatíte') && !creditPage.includes('PAY by square') && !creditPage.includes('Označiť ako zaplatenú'))
  check('peppol: an invoice of a paid advance asks for nothing', prepaidPage.includes('Zaplatená zálohou') && !prepaidPage.includes('PAY by square') && !prepaidPage.includes('Označiť ako zaplatenú'))
  // To pay now: FA-887 and the flagged FA-999 (FA-888 is paid); the credit note and the advance's invoice are not counted.
  check('peppol: neither counts among those to pay, nor can be marked paid', /class="count[^"]*">2</.test(plain(await (await ws.get('/app/prijate')).text())) && (await ws.post(`/app/prijate/${ids['in-ws-credit']}/zaplatena`, { den: sk(today) })).status === 303 && !(await db.prepare('SELECT paid_on FROM einvoice_received WHERE id = ?').bind(ids['in-ws-credit']).first()).paid_on)
  check('peppol: an e-invoice its supplier did not send is flagged and offers no QR code', fakePage.includes('Pozor: e-faktúru poslal účastník siete 0245:2155555555') && !fakePage.includes('PAY by square'))

  // An event that fails is kept for the administrator with its e-invoice, and the postman is asked to send it again.
  await db.prepare("CREATE TRIGGER test_peppol_fail BEFORE INSERT ON einvoice_received WHEN NEW.ref = 'in-fail' BEGIN SELECT RAISE(ABORT, 'TEST'); END").run()
  const failing = [{ type: 'received', id: 'in-fail', sender: '0245:2023489446', receiver: '0245:2120999990', document: Buffer.from(supplierInvoice({ number: 'FA-900', total: '5.00', customerDic: '2120999990', due: day(7) })).toString('base64') }]
  res = await notify(failing)
  const failed = await db.prepare("SELECT * FROM peppol_unrouted WHERE ref = 'in-fail'").first()
  check('peppol: a failed e-invoice is answered 503 and kept with its file', res.status === 503 && failed?.reason === 'error' && Boolean(failed.file_key))
  await db.prepare('DROP TRIGGER test_peppol_fail').run()
  res = await notify(failing)
  check('peppol: sent again, it is delivered and the failure settled', res.status === 200 && (await db.prepare("SELECT company_id FROM einvoice_received WHERE ref = 'in-fail'").first())?.company_id === 'ws-peppol' && (await db.prepare("SELECT COUNT(*) AS n FROM peppol_unrouted WHERE ref = 'in-fail' AND resolved_at IS NULL").first()).n === 0)
  check('peppol: a notice of more than ten e-invoices is refused whole', (await notify(Array.from({ length: 11 }, (_, i) => ({ ...failing[0], id: `in-many-${i}` })))).status === 413 && !(await db.prepare("SELECT 1 FROM einvoice_received WHERE ref LIKE 'in-many-%'").first()))

  // The year's archive of the workspace carries what it received, as it came.
  res = await ws.get(`/app/fakturacia/export?rok=${today.slice(0, 4)}`)
  const zip = res.status === 200 ? Buffer.from(await res.arrayBuffer()).toString('latin1') : ''
  check('peppol: the workspace\'s yearly archive holds its received e-invoices and their list', zip.includes('prijate.csv') && zip.includes('prijate/') && zip.includes('<cbc:ID>FA-888</cbc:ID>'), String(res.status))

  // The SML's answers are kept by their hash alone, three days at most.
  const keys = (await db.prepare('SELECT name FROM peppol_lookups').all()).results.map((r) => r.name)
  check('peppol: no DIČ is kept in clear among the answers', keys.length > 0 && keys.every((k) => /^[a-z2-7]{40,80}$/i.test(k)) && !keys.some((k) => k.includes('2120888880')))
  await db.prepare('UPDATE peppol_lookups SET checked_at = ?').bind(nowS - 4 * 86400).run()
  await worker.scheduled({ scheduledTime: new Date(), cron: '*/15 * * * *' })
  let left = 1
  for (let i = 0; i < 40 && left > 0; i++) {
    left = (await db.prepare('SELECT COUNT(*) AS n FROM peppol_lookups WHERE checked_at < ?').bind(nowS - 3 * 86400).first()).n
    if (left > 0) await new Promise((r) => setTimeout(r, 100))
  }
  check('peppol: answers older than three days are deleted by the schedule', left === 0)

  // A registration not confirmed yet is settled when the postman says the company left.
  await notify([{ type: 'registered', id: 'reg-x', participant: '0245:2120777770' }])
  await notify([{ type: 'unregistered', id: 'unreg-x', participant: '0245:2120777770' }])
  check('peppol: a registration the company withdrew before the confirmation waits no more', (await db.prepare("SELECT resolved_by FROM peppol_unrouted WHERE ref = 'reg-x'").first())?.resolved_by === 'postman')

  // A DIČ typed again after the binding is no address: what comes for the old participant goes to the administrator.
  await db.prepare("UPDATE companies SET dic = '2120999991' WHERE id = 'ws-peppol'").run()
  await notify([{ type: 'received', id: 'in-moved', sender: '0245:2023489446', receiver: '0245:2120999990', document: Buffer.from(supplierInvoice({ number: 'FA-901', total: '5.00', customerDic: '2120999990', due: day(7) })).toString('base64') }])
  check('peppol: after the company changed its DIČ, the old participant reaches nobody', (await db.prepare("SELECT reason FROM peppol_unrouted WHERE ref = 'in-moved'").first())?.reason === 'conflict' && !(await db.prepare("SELECT 1 FROM einvoice_received WHERE ref = 'in-moved'").first()))
  await db.prepare("UPDATE companies SET dic = '2120999990' WHERE id = 'ws-peppol'").run()

  // The postman says the company left Firmony: it sends nothing more in its name.
  res = await notify([{ type: 'unregistered', id: 'unreg-co', participant: '0245:2120888880' }])
  network.register('0245:2166666666', PEPPOL_TEST.smp)
  const after = await issue('SK2166666666')
  res = await live.post(`/app/faktury/${after}/einvoice`, {})
  check('peppol: once the company leaves, nothing more is sent in its name', !(await db.prepare('SELECT 1 FROM peppol_bindings WHERE company_id = ?').bind(company).first()) && !(await db.prepare('SELECT 1 FROM einvoice_sends WHERE invoice_id = ?').bind(after).first()))
}
