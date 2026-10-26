// E-invoices through the Peppol network (26 October 2026): the participant's name in the SML as the network computes
// it, the postman's notices and their signature, which adapter runs, and what keeps an invoice from travelling.
import { check } from './check.mjs'

export async function checkPeppolNetworkUnits({ peppolParticipant: pp, peppolProvider: pv, peppolStore: ps, xml: x }) {
  // The example of OpenPeppol's own "CNAME to NAPTR Migration Process" v1.0.0 (17 April 2025), and the name the live
  // SML answered for a Slovak company of the Peppol Directory on 26 October 2026.
  check(
    "a participant's name in the SML is base32 of SHA-256 of its lowercased value, without padding",
    (await pp.smlName('0088:123abc', 'edelivery.tech.ec.europa.eu')) === 'Y7DZFXAF3D4CJZ4KCGRXTEC6TWVCGA4KY7ZWA5BOIF6MSWD4TDRQ.iso6523-actorid-upis.edelivery.tech.ec.europa.eu' &&
      (await pp.smlName('0245:2023489446')) === 'W65WJHWSJKGSUIB2DKN4BPSCVPO4NWV4U6LSNZTPUWSDJBUEW7VQ.iso6523-actorid-upis.participant.sml.prod.tech.peppol.org' &&
      (await pp.smlName('0088:123ABC', 'x')) === (await pp.smlName('0088:123abc', 'x')),
  )
  check('base32 of nothing, of one byte and of five', pp.base32(new Uint8Array([])) === '' && pp.base32(new Uint8Array([0xff])) === '74' && pp.base32(new Uint8Array([1, 2, 3, 4, 5])) === 'AEBAGBAF')
  check(
    'a Slovak company is 0245 and its DIČ, or the digits of its IČ DPH; nothing else is guessed',
    pp.slovakParticipant('2120000000') === '0245:2120000000' &&
      pp.slovakParticipant(' 2120 000 000 ') === '0245:2120000000' &&
      pp.slovakParticipant(null, 'sk2120000000') === '0245:2120000000' &&
      pp.slovakParticipant('123', 'CZ12345678') === null &&
      pp.slovakParticipant(null, null) === null,
  )
  check('the SMP host is read from the record a resolver gives', pp.smpHostOf('100 10 "U" "Meta:SMP" "!.*!https://SML.peppol-smp.sk!" .') === 'sml.peppol-smp.sk' && pp.smpHostOf('nothing') === null)
  const doh = (answer, status = 200) => async () => new Response(typeof answer === 'string' ? answer : JSON.stringify(answer), { status })
  check(
    'a lookup: a record is yes with its SMP, NXDOMAIN is no, anything else unknown and never no',
    JSON.stringify(await pp.lookupParticipant('0245:2023489446', doh({ Status: 0, Answer: [{ type: 35, data: '100 10 "U" "Meta:SMP" "!.*!https://sml.peppol-smp.sk!" .' }] }))) === '{"state":"found","smp":"sml.peppol-smp.sk"}' &&
      (await pp.lookupParticipant('0245:1', doh({ Status: 3 }))).state === 'missing' &&
      (await pp.lookupParticipant('0245:1', doh({ Status: 2 }))).state === 'unknown' &&
      (await pp.lookupParticipant('0245:1', doh('x', 502))).state === 'unknown' &&
      (await pp.lookupParticipant('0245:1', doh('not json'))).state === 'unknown' &&
      (await pp.lookupParticipant('0245:1', async () => { throw new Error('offline') })).state === 'unknown',
  )

  // The postman's notices.
  const secret = 'TEST-ONLY-a-secret-of-at-least-32-chars'
  const body = '{"events":[]}'
  const at = 1_800_000_000
  const header = await pv.signatureOf(body, secret, at)
  check(
    'a notice is taken only with its signature, of this body, at most five minutes old',
    (await pv.signatureValid(header, body, secret, at + 60)) &&
      !(await pv.signatureValid(header, body + ' ', secret, at)) &&
      !(await pv.signatureValid(header, body, `${secret}x`, at)) &&
      !(await pv.signatureValid(header, body, secret, at + 301)) &&
      !(await pv.signatureValid(null, body, secret, at)) &&
      !(await pv.signatureValid('t=1,v1=zz', body, secret, at)),
  )
  const xml = '<Invoice/>'
  const notice = pv.eventsOf({
    events: [
      { type: 'status', id: 'pp-1', state: 'delivered' },
      { type: 'status', id: 'pp-2', state: 'rejected', reason: 'Zlá\nsuma' },
      { type: 'status', id: 'pp-3', state: 'lost' },
      { type: 'received', id: 'in-1', sender: '0245:2023489446', receiver: '0245:2120000000', document: Buffer.from(xml).toString('base64') },
      { type: 'received', id: 'in-2', receiver: 'not one', document: 'eA==' },
      { type: 'received', id: 'bad id with spaces', receiver: '0245:2120000000', document: 'eA==' },
      { type: 'registered', id: 'reg-1', participant: '0245:2120000000' },
      { type: 'unregistered', id: 'reg-2', participant: 'nobody' },
      'nothing',
    ],
  })
  const events = notice.events
  check(
    'what a notice says is checked event by event; anything malformed is counted, never applied',
    events.length === 4 && events[1].reason === 'Zlá suma' && events[2].type === 'received' && events[2].xml === xml && events[2].sender === '0245:2023489446' &&
      events[3].type === 'registered' && events[3].participant === '0245:2120000000' && notice.malformed === 5 && !notice.tooMany,
    JSON.stringify(notice),
  )
  const many = pv.eventsOf({ events: Array.from({ length: 101 }, (_, i) => ({ type: 'status', id: `x${i}`, state: 'delivered' })) })
  check('a notice of more than a hundred events is refused whole, none of it applied', many.tooMany && many.events.length === 0 && pv.eventsOf({ events: Array.from({ length: 100 }, (_, i) => ({ type: 'status', id: `x${i}`, state: 'delivered' })) }).events.length === 100)
  check('a notice that is no list of events is counted as malformed', pv.eventsOf({}).malformed === 1 && pv.eventsOf(null).events.length === 0)
  const bytes = new TextEncoder().encode(body)
  check('the signature covers the bytes as they came', await pv.signatureValid(header, bytes, secret, at + 60))

  // Which postman runs.
  const env = { PEPPOL_PROVIDER: 'pretend', PEPPOL_API_URL: 'https://peppol.pretend.test/', PEPPOL_API_KEY: 'k', PEPPOL_WEBHOOK_SECRET: secret }
  check(
    'no postman without the whole configuration, and the reference adapter only toward a pretend one of the tests',
    pv.providerOf({}) === null &&
      pv.providerOf({ ...env, PEPPOL_WEBHOOK_SECRET: 'short' }) === null &&
      pv.providerOf({ ...env, PEPPOL_API_URL: 'http://peppol.pretend.test' }) === null &&
      pv.providerOf({ ...env, PEPPOL_API_URL: 'https://api.example.com' }) === null &&
      pv.providerOf({ ...env, PEPPOL_PROVIDER: 'flowis' }) === null &&
      pv.providerOf(env)?.name === 'pretend',
  )
  let asked = null
  const reference = pv.providerOf(env, async (url, init) => {
    asked = { url: String(url), init }
    return Response.json({ id: 'pp-9' }, { status: 201 })
  })
  const sent = await reference.send({ id: 'send-1', sender: '0245:2120000000', receiver: '0245:2023489446', kind: 'credit', xml: '<CreditNote>ľ</CreditNote>' })
  const posted = JSON.parse(asked.init.body)
  check(
    'a sending names the BIS document type of its kind, the process, both parties, its own key, and the e-invoice in base64',
    sent.ok && sent.ref === 'pp-9' && asked.url === 'https://peppol.pretend.test/v1/documents' && asked.init.headers['idempotency-key'] === 'send-1' &&
      posted.documentType.startsWith('urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2::CreditNote##') && posted.process === 'urn:fdc:peppol.eu:2017:poacc:billing:01:1.0' &&
      Buffer.from(posted.document, 'base64').toString('utf8') === '<CreditNote>ľ</CreditNote>',
  )
  const outcome = async (status, json) => pv.providerOf(env, async () => Response.json(json, { status })).send({ id: 'x', sender: 'a', receiver: 'b', kind: 'invoice', xml: '' })
  check(
    'a refusal of the document is final, a busy postman or a lost answer is tried again',
    JSON.stringify(await outcome(422, { error: 'Zlý príjemca' })) === '{"ok":false,"retry":false,"reason":"Zlý príjemca"}' &&
      (await outcome(503, {})).retry === true &&
      (await outcome(429, {})).retry === true &&
      (await outcome(200, {})).retry === true &&
      (await pv.providerOf(env, async () => { throw new Error('reset') }).send({ id: 'x', sender: 'a', receiver: 'b', kind: 'invoice', xml: '' })).retry === true,
  )

  // What keeps an invoice from travelling.
  const company = { dic: '2120000000', icdph: null, endsOn: null }
  const bound = '0245:2120000000'
  const invoice = { status: 'issued', number: '20260001', kind: 'invoice', customerDic: '2023489446', customerIcdph: null, customerCountry: null }
  check(
    'an invoice travels when issued, no request for an advance, both sides Slovak companies, the contract open, the company bound',
    ps.blockedOf(company, invoice, '2026-10-26', bound) === null &&
      ps.blockedOf(company, { ...invoice, status: 'draft' }, '2026-10-26', bound) === 'draft' &&
      ps.blockedOf(company, { ...invoice, kind: 'proforma' }, '2026-10-26', bound) === 'proforma' &&
      ps.blockedOf({ ...company, dic: null }, invoice, '2026-10-26', bound) === 'sellerId' &&
      ps.blockedOf(company, { ...invoice, customerDic: null }, '2026-10-26', bound) === 'customerId' &&
      ps.blockedOf(company, { ...invoice, customerDic: null, customerIcdph: 'SK2023489446' }, '2026-10-26', bound) === null &&
      ps.blockedOf(company, { ...invoice, customerCountry: 'CZ' }, '2026-10-26', bound) === 'customerId' &&
      ps.blockedOf({ ...company, endsOn: '2026-01-31' }, invoice, '2026-10-26', bound) === 'ended' &&
      // The day the contract ends is its last: the ten days the last documents still come in send nothing.
      ps.blockedOf({ ...company, endsOn: '2026-10-25' }, invoice, '2026-10-26', bound) === 'ended' &&
      ps.blockedOf(company, invoice, '2026-10-26', null) === 'unbound' &&
      ps.blockedOf(company, invoice, '2026-10-26', '0245:2120000001') === 'unbound',
  )
  const ubl = (supplierEndpoint) => `<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cac="c" xmlns:cbc="b"><cbc:ID>1</cbc:ID><cac:AccountingSupplierParty><cac:Party>${supplierEndpoint}<cac:PartyName><cbc:Name>S</cbc:Name></cac:PartyName></cac:Party></cac:AccountingSupplierParty><cac:AccountingCustomerParty><cac:Party><cbc:EndpointID schemeID="0245">1111111111</cbc:EndpointID></cac:Party></cac:AccountingCustomerParty><cac:LegalMonetaryTotal><cbc:PayableAmount currencyID="EUR">1.00</cbc:PayableAmount></cac:LegalMonetaryTotal></Invoice>`
  check(
    'the supplier\'s address is read from the parsed supplier\'s party, never the customer\'s, quoted either way',
    x.readInvoice(ubl('<cbc:EndpointID schemeID="0245">2023489446</cbc:EndpointID>'), null)?.supplierEndpoint === '0245:2023489446' &&
      x.readInvoice(ubl("<cbc:EndpointID schemeID='0245'>2023489446</cbc:EndpointID>"), null)?.supplierEndpoint === '0245:2023489446' &&
      x.readInvoice(ubl(''), null)?.supplierEndpoint === null,
  )
  check(
    'an e-invoice its supplier did not send is told: another address, none, or a Slovak sender whose DIČ is not the supplier\'s VAT number',
    !ps.senderMismatch('0245:2023489446', '0245:2023489446', 'SK2023489446') &&
      !ps.senderMismatch('9930:de123456789', '9930:DE123456789', 'DE123456789') &&
      ps.senderMismatch('0245:2155555555', '0245:2023489446', null) &&
      ps.senderMismatch(null, '0245:2023489446', null) &&
      ps.senderMismatch('0245:2023489446', null, null) &&
      ps.senderMismatch('0245:2155555555', '0245:2155555555', 'SK2023489446'),
  )
  const tenDocuments = pv.eventsOf({ events: Array.from({ length: 11 }, (_, i) => ({ type: 'received', id: `d${i}`, receiver: '0245:2120000000', document: 'eA==' })) })
  check('a notice of more than ten e-invoices is refused whole', tenDocuments.tooMany && tenDocuments.events.length === 0)
}
