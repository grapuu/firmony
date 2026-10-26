// E-invoices through the Peppol network (26 October 2026), in workerd. Without a postman (the live Worker today) the
// invoice says whether its customer can receive and when sending starts; with the pretend postman (a second Worker of
// the same database) an invoice is sent by one click, once, its state follows the postman's signed notices, a busy
// postman is tried again by the schedule, a refusal can be sent again, and what the network delivers becomes a
// client's document or a workspace's received invoice with the QR code that pays it.
import { check } from './check.mjs'
import { PEPPOL_TEST } from './pretend.mjs'
import { writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { migrationSteps } from '../.wrangler/dist/schema.js'

const plain = (text) => text.replace(/\u2060/g, '').replace(/\u00a0/g, ' ')

/** A received e-invoice as a supplier's postman delivers it: UBL 2.1, Peppol BIS 3.0, a Slovak supplier with its IBAN. */
function supplierInvoice({ number, total, customerDic, iban = 'SK8975000000000012345671', due }) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
<cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
<cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
<cbc:ID>${number}</cbc:ID><cbc:IssueDate>2026-10-20</cbc:IssueDate><cbc:DueDate>${due}</cbc:DueDate><cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode><cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode>
<cac:AccountingSupplierParty><cac:Party><cbc:EndpointID schemeID="0245">2023489446</cbc:EndpointID><cac:PartyName><cbc:Name>TEST-ONLY Dodávateľ s. r. o.</cbc:Name></cac:PartyName><cac:PostalAddress><cac:Country><cbc:IdentificationCode>SK</cbc:IdentificationCode></cac:Country></cac:PostalAddress><cac:PartyLegalEntity><cbc:RegistrationName>TEST-ONLY Dodávateľ s. r. o.</cbc:RegistrationName><cbc:CompanyID schemeID="0158">52123456</cbc:CompanyID></cac:PartyLegalEntity></cac:Party></cac:AccountingSupplierParty>
<cac:AccountingCustomerParty><cac:Party><cbc:EndpointID schemeID="0245">${customerDic}</cbc:EndpointID><cac:PartyName><cbc:Name>TEST-ONLY Odberateľ</cbc:Name></cac:PartyName><cac:PostalAddress><cac:Country><cbc:IdentificationCode>SK</cbc:IdentificationCode></cac:Country></cac:PostalAddress><cac:PartyLegalEntity><cbc:RegistrationName>TEST-ONLY Odberateľ</cbc:RegistrationName></cac:PartyLegalEntity></cac:Party></cac:AccountingCustomerParty>
<cac:PaymentMeans><cbc:PaymentMeansCode>30</cbc:PaymentMeansCode><cbc:PaymentID>${number.replace(/\D/g, '')}</cbc:PaymentID><cac:PayeeFinancialAccount><cbc:ID>${iban}</cbc:ID></cac:PayeeFinancialAccount></cac:PaymentMeans>
<cac:TaxTotal><cbc:TaxAmount currencyID="EUR">0.00</cbc:TaxAmount></cac:TaxTotal>
<cac:LegalMonetaryTotal><cbc:LineExtensionAmount currencyID="EUR">${total}</cbc:LineExtensionAmount><cbc:TaxExclusiveAmount currencyID="EUR">${total}</cbc:TaxExclusiveAmount><cbc:TaxInclusiveAmount currencyID="EUR">${total}</cbc:TaxInclusiveAmount><cbc:PayableAmount currencyID="EUR">${total}</cbc:PayableAmount></cac:LegalMonetaryTotal>
<cac:InvoiceLine><cbc:ID>1</cbc:ID><cbc:InvoicedQuantity unitCode="C62">1</cbc:InvoicedQuantity><cbc:LineExtensionAmount currencyID="EUR">${total}</cbc:LineExtensionAmount><cac:Item><cbc:Name>Služba</cbc:Name><cac:ClassifiedTaxCategory><cbc:ID>O</cbc:ID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:ClassifiedTaxCategory></cac:Item><cac:Price><cbc:PriceAmount currencyID="EUR">${total}</cbc:PriceAmount></cac:Price></cac:InvoiceLine>
</Invoice>`
}

export async function checkPeppolNetwork({ mf, db, signIn, as, nowS, day, network, tick, capture }) {
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

  // With the postman: one click, once.
  page = plain(await (await live.get(`/app/faktury/${first}`)).text())
  check('peppol: with a postman, the invoice offers to send it as an e-invoice', page.includes(`action="/app/faktury/${first}/einvoice"`) && page.includes('Odoslať e-faktúru'))
  if (capture) writeFileSync(`${capture}/peppol-send.html`, await (await live.get(`/app/faktury/${first}`)).text())
  let res = await live.post(`/app/faktury/${first}/einvoice`, {})
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
  res = await notify([{ type: 'status', id: 'pp-1', state: 'delivered' }])
  row = await db.prepare('SELECT state FROM einvoice_sends WHERE invoice_id = ?').bind(first).first()
  page = plain(await (await live.get(`/app/faktury/${first}`)).text())
  check('peppol: the postman\'s word moves it to delivered, and the page says so', res.status === 200 && row?.state === 'delivered' && page.includes('Doručená') && page.includes('dostal do svojho účtovníctva'))
  if (capture) writeFileSync(`${capture}/peppol-delivered.html`, await (await live.get(`/app/faktury/${first}`)).text())
  page = plain(await (await live.get('/app/faktury')).text())
  check('peppol: the list marks the invoice delivered', page.includes('E-faktúra doručená'))
  let immutable = false
  try {
    await db.prepare("UPDATE einvoice_sends SET state = 'sent' WHERE invoice_id = ?").bind(first).run()
  } catch {
    immutable = true
  }
  check('peppol: a delivered e-invoice stays so', immutable)

  // A customer not in the network: nothing to send.
  const nowhere = await issue('SK2111111111')
  page = plain(await (await live.get(`/app/faktury/${nowhere}`)).text())
  res = await live.post(`/app/faktury/${nowhere}/einvoice`, {})
  check('peppol: a customer not in the network is said so and gets nothing', page.includes('zatiaľ nie je v sieti Peppol') && !page.includes('Odoslať e-faktúru') && res.status === 303 && !(await db.prepare('SELECT 1 FROM einvoice_sends WHERE invoice_id = ?').bind(nowhere).first()))

  // A busy postman: tried again by the schedule.
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

  // A refusal: said, and sent again once mended.
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
  await notify([{ type: 'status', id: ref, state: 'rejected', reason: 'Nesprávna suma' }])
  page = plain(await (await live.get(`/app/faktury/${refused}`)).text())
  check('peppol: a customer\'s rejection is said with its reason', page.includes('Odmietnutá') && page.includes('Nesprávna suma'))

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
  check('peppol: one for nobody of ours is counted and kept nowhere', (await res.json()).unknown === 1 && !(await db.prepare("SELECT 1 FROM einvoice_received WHERE ref = 'in-x'").first()))

  // A workspace of invoicing receives too: a list to read, a QR code to pay, its own mark of the payment.
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
  await notify([{ type: 'received', id: 'in-ws', sender: '0245:2023489446', receiver: '0245:2120999990', document: Buffer.from(supplierInvoice({ number: 'FA-888', total: '99.90', customerDic: '2120999990', due: day(7) })).toString('base64') }])
  const wsGot = await db.prepare("SELECT * FROM einvoice_received WHERE ref = 'in-ws'").first()
  page = plain(await (await ws.get('/app/prijate')).text())
  check(
    'peppol: what came is listed with its supplier, number and amount, and the place counts it to pay',
    wsGot?.company_id === 'ws-peppol' && wsGot.document_id === null && Boolean(wsGot.file_key) && page.includes('TEST-ONLY Dodávateľ s. r. o.') && page.includes('FA-888') && page.includes('99,90') && /class="count[^"]*">1</.test(page),
  )
  const detail = await (await ws.get(`/app/prijate/${wsGot.id}`)).text()
  if (capture) writeFileSync(`${capture}/peppol-received.html`, detail)
  check('peppol: its page pays it by the QR code a bank reads', detail.includes('PAY by square') && detail.includes('<path fill="#000000"') && plain(detail).includes('SK89 7500 0000 0000 1234 5671'))
  res = await ws.post(`/app/prijate/${wsGot.id}/zaplatena`, { den: sk(today) })
  check('peppol: marked paid, it is', res.status === 303 && (await db.prepare('SELECT paid_on FROM einvoice_received WHERE id = ?').bind(wsGot.id).first()).paid_on === today)
  res = await ws.get(`/app/prijate/${wsGot.id}/xml`)
  check('peppol: its e-invoice is downloaded as it came', res.status === 200 && (await res.text()).includes('<cbc:ID>FA-888</cbc:ID>'))
  check('peppol: a client has no such place, and nobody another company\'s', (await live.get('/app/prijate')).status === 404 && (await live.get(`/app/prijate/${wsGot.id}`)).status === 404)
}
