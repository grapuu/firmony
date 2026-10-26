// Stand-ins for the outside world, shared by the runtime test and the playground: Cloudflare's email service as a
// Worker of its own (it keeps every message and hands the list back over fetch), and the Register of Legal
// Entities, which knows europio s. r. o. (the answer seen on 12 October 2026), knows nobody else, and fails for
// one number so that a failure can be looked at.
import { createVerify, generateKeyPairSync, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'

export const PRETEND_MAIL = `
import { WorkerEntrypoint } from 'cloudflare:workers'
const sent = []
export default class extends WorkerEntrypoint {
  async send(message) {
    if (typeof message.to !== 'string' || !message.subject || !message.text) throw Object.assign(new Error('not a message'), { code: 'E_VALIDATION_ERROR' })
    sent.push({ to: message.to, from: message.from, replyTo: message.replyTo, subject: message.subject, text: message.text })
    return { messageId: 'pretend-' + sent.length }
  }
  async fetch() {
    return Response.json(sent)
  }
}
`

const europio = readFileSync(new URL('./fixtures/rpo-europio.json', import.meta.url), 'utf8')

// A second company, made up, with two directors in office and one whose office ended: the order's page lets only
// those in office conclude the contract.
const ZELENY = {
  id: 19099999,
  identifiers: [{ value: '55012345', validFrom: '2025-03-01' }],
  fullNames: [{ value: 'Zelený dvor s. r. o.', validFrom: '2025-03-01' }],
  addresses: [{ validFrom: '2025-03-01', street: 'Mlynská', regNumber: 0, buildingNumber: '12', postalCodes: ['04001'], municipality: { value: 'Košice - mestská časť Staré Mesto' }, country: { value: 'Slovenská republika' } }],
  establishment: '2025-03-01',
  sourceRegister: { value: { value: 'Obchodný register' }, registrationOffices: [{ value: 'Mestský súd Košice', validFrom: '2025-03-01' }], registrationNumbers: [{ value: 'Sro/58123/V', validFrom: '2025-03-01' }] },
}

/** The register's detail of an entity (GET .../rpo/v1/entity/<id>), with its directors, as seen on 13 October 2026. */
const ENTITIES = {
  19031841: {
    id: 19031841,
    legalForms: [{ value: { value: 'Spoločnosť s ručením obmedzeným', code: '112', codelistCode: 'CL000056' }, validFrom: '2026-01-31' }],
    statutoryBodies: [{ stakeholderType: { value: 'Konateľ', code: '3', codelistCode: 'CL010113' }, personName: { formatedName: 'Christian Juhás', familyNames: ['Juhás'], givenNames: ['Christian'] }, validFrom: '2026-01-31' }],
    authorizations: [{ value: 'Konateľ koná v mene spoločnosti samostatne.', validFrom: '2026-01-31' }],
  },
  19099999: {
    id: 19099999,
    legalForms: [{ value: { value: 'Spoločnosť s ručením obmedzeným', code: '112' }, validFrom: '2025-03-01' }],
    authorizations: [{ value: 'Každý konateľ koná v mene spoločnosti samostatne.', validFrom: '2025-03-01' }, { value: 'Prokurista koná spolu s konateľom.', validFrom: '2025-03-01' }],
    statutoryBodies: [
      { stakeholderType: { value: 'Konateľ', code: '3' }, personName: { formatedName: 'Mgr. Lucia Zelená', familyNames: ['Zelená'], givenNames: ['Lucia'] }, validFrom: '2025-03-01' },
      { stakeholderType: { value: 'Konateľ', code: '3' }, personName: { familyNames: ['Dvorský'], givenNames: ['Tomáš'] }, validFrom: '2025-03-01' },
      { stakeholderType: { value: 'Konateľ', code: '3' }, personName: { formatedName: 'Peter Starý' }, validFrom: '2025-03-01', validTo: '2026-02-28' },
    ],
  },
}

// Two joint-stock companies, made up: the board of one acts by two members together, the other's chairman alone.
const STROJAREN = {
  id: 19088888,
  identifiers: [{ value: '36611111', validFrom: '2001-05-01' }],
  fullNames: [{ value: 'TEST-ONLY Strojáreň a. s.', validFrom: '2001-05-01' }],
  addresses: [{ validFrom: '2001-05-01', street: 'Priemyselná', regNumber: 0, buildingNumber: '3', postalCodes: ['04011'], municipality: { value: 'Košice' }, country: { value: 'Slovenská republika' } }],
  sourceRegister: { value: { value: 'Obchodný register' }, registrationOffices: [{ value: 'Mestský súd Košice', validFrom: '2001-05-01' }], registrationNumbers: [{ value: 'Sa/1234/V', validFrom: '2001-05-01' }] },
}
/** A company for free invoicing (26 October 2026): known to the register, a client of nobody. */
const FAKTURACKA = {
  id: 19066666,
  identifiers: [{ value: '47111119', validFrom: '2019-06-01' }],
  fullNames: [{ value: 'TEST-ONLY Fakturačka s. r. o.', validFrom: '2019-06-01' }],
  addresses: [{ validFrom: '2019-06-01', street: 'Mlynská', regNumber: 0, buildingNumber: '12', postalCodes: ['04001'], municipality: { value: 'Košice' }, country: { value: 'Slovenská republika' } }],
  establishment: '2019-06-01',
  sourceRegister: { value: { value: 'Obchodný register' }, registrationOffices: [{ value: 'Mestský súd Košice', validFrom: '2019-06-01' }], registrationNumbers: [{ value: 'Sro/47111/V', validFrom: '2019-06-01' }] },
}

const INOVA = {
  id: 19077777,
  identifiers: [{ value: '56622222', validFrom: '2024-02-01' }],
  fullNames: [{ value: 'TEST-ONLY Inova, j. s. a.', validFrom: '2024-02-01' }],
  addresses: [{ validFrom: '2024-02-01', street: 'Hlavná', regNumber: 0, buildingNumber: '8', postalCodes: ['04001'], municipality: { value: 'Košice' }, country: { value: 'Slovenská republika' } }],
  sourceRegister: { value: { value: 'Obchodný register' }, registrationOffices: [{ value: 'Mestský súd Košice', validFrom: '2024-02-01' }], registrationNumbers: [{ value: 'Sja/77/V', validFrom: '2024-02-01' }] },
}
ENTITIES[19088888] = {
  id: 19088888,
  legalForms: [{ value: { value: 'Akciová spoločnosť', code: '121', codelistCode: 'CL000056' }, validFrom: '2001-05-01' }],
  statutoryBodies: [
    { stakeholderType: { value: 'Predstavenstvo', code: '99' }, statutoryBodyMember: { value: 'Predseda predstavenstva', code: '1' }, personName: { formatedName: 'Ing. Ján Kováč' }, validFrom: '2020-01-01' },
    { stakeholderType: { value: 'Predstavenstvo', code: '99' }, statutoryBodyMember: { value: 'Člen predstavenstva', code: '3' }, personName: { formatedName: 'Eva Horná' }, validFrom: '2020-01-01' },
    { stakeholderType: { value: 'Dozorná rada', code: '50' }, personName: { formatedName: 'Igor Dozorný' }, validFrom: '2020-01-01' },
  ],
  authorizations: [{ value: 'V mene spoločnosti konajú spoločne dvaja členovia predstavenstva.', validFrom: '2020-01-01' }],
}
ENTITIES[19077777] = {
  id: 19077777,
  legalForms: [{ value: { value: 'Jednoduchá spoločnosť na akcie', code: '125', codelistCode: 'CL000056' }, validFrom: '2024-02-01' }],
  statutoryBodies: [
    { stakeholderType: { value: 'Predstavenstvo', code: '99' }, statutoryBodyMember: { value: 'Predseda predstavenstva', code: '1' }, personName: { formatedName: 'Mária Nová' }, validFrom: '2024-02-01' },
    { stakeholderType: { value: 'Predstavenstvo', code: '99' }, statutoryBodyMember: { value: 'Člen predstavenstva', code: '3' }, personName: { formatedName: 'Pavol Malý' }, validFrom: '2024-02-01' },
  ],
  authorizations: [{ value: 'Členovia predstavenstva konajú v mene spoločnosti samostatne.', validFrom: '2024-02-01' }],
}

/** The register's answer for a request the Worker sends, or null when the request is not for the register. */
export function registerAnswer(url, calls = []) {
  if (url.startsWith('https://api.statistics.sk/rpo/v1/entity/')) {
    const id = new URL(url).pathname.split('/').pop()
    calls.push(`entity:${id}`)
    return ENTITIES[id] ? Response.json(ENTITIES[id]) : new Response('not found', { status: 404 })
  }
  if (!url.startsWith('https://api.statistics.sk/rpo/v1/search')) return null
  const ico = new URL(url).searchParams.get('identifier')
  calls.push(ico)
  if (ico === '57442452') return new Response(europio, { headers: { 'content-type': 'application/json' } })
  if (ico === '55012345') return Response.json({ results: [ZELENY], license: 'CC BY 4.0' })
  if (ico === '36611111') return Response.json({ results: [STROJAREN], license: 'CC BY 4.0' })
  if (ico === '56622222') return Response.json({ results: [INOVA], license: 'CC BY 4.0' })
  if (ico === '47111119') return Response.json({ results: [FAKTURACKA], license: 'CC BY 4.0' })
  if (ico === '35757442') return new Response('busy', { status: 503 })
  return Response.json({ results: [], license: 'CC BY 4.0' })
}

/**
 * The ECB's file of the last ninety days, made for the test: every weekday's rates, USD 1,08 and CZK 25,3 moving a
 * little each day. `ecbAnswer` counts the calls.
 */
export const ECB_CALLS = []
export function ecbRate(currency, day) {
  const n = Math.round(Date.parse(`${day}T00:00:00Z`) / 86_400_000) % 7
  return currency === 'USD' ? (1.08 + n / 1000).toFixed(4) : (25.3 + n / 100).toFixed(3)
}
export function ecbAnswer(url) {
  if (url !== 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist-90d.xml') return null
  ECB_CALLS.push(url)
  const days = []
  for (let i = 0; i < 95; i++) {
    const d = new Date(Date.now() - i * 86_400_000)
    if (d.getUTCDay() === 0 || d.getUTCDay() === 6) continue
    days.push(d.toISOString().slice(0, 10))
  }
  const cubes = days.map((day) => `<Cube time="${day}"><Cube currency="USD" rate="${ecbRate('USD', day)}"/><Cube currency="CZK" rate="${ecbRate('CZK', day)}"/></Cube>`).join('')
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><gesmes:Envelope xmlns:gesmes="http://www.gesmes.org/xml/2002-08-01" xmlns="http://www.ecb.int/vocabulary/2002-08-01/eurofxref"><gesmes:subject>Reference rates</gesmes:subject><Cube>${cubes}</Cube></gesmes:Envelope>`, { headers: { 'content-type': 'text/xml' } })
}

/** Today in Bratislava, moved by a number of days, as YYYY-MM-DD. */
function bratislavaDay(shift = 0) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Bratislava' }).format(new Date(Date.now() + shift * 86400000))
}

/**
 * Anthropic's API as the reader of documents: whatever picture it is shown, it reads yesterday's receipt from a
 * café for 12,40 €, which is what the sample company paid by card yesterday. A request without the key's header
 * or for another model's tool is refused as the real API would.
 */
export async function readerAnswer(request, calls = []) {
  if (!request.url.startsWith('https://api.anthropic.com/')) return null
  const body = await request.json().catch(() => null)
  calls.push(body)
  if (!request.headers.get('x-api-key')) return Response.json({ type: 'error', error: { type: 'authentication_error' } }, { status: 401 })
  const tool = body?.tools?.[0]?.name
  // An invoice from one sentence (invoice-ai.ts): a draft of what the sentence says, or none when it asks for none.
  if (tool === 'invoice_draft') {
    const sentence = String(body?.messages?.[0]?.content ?? '')
    if (sentence.includes('NIC')) return Response.json({ id: 'msg_pretend', type: 'message', role: 'assistant', content: [{ type: 'text', text: 'Nie.' }], usage: { input_tokens: 300, output_tokens: 4 } })
    return Response.json({
      id: 'msg_pretend',
      type: 'message',
      role: 'assistant',
      model: body?.model,
      content: [{ type: 'tool_use', id: 'toolu_pretend', name: tool, input: { customer_name: 'Zelený dvor', customer_ico: '55012345', lines: [{ description: 'Konzultácie', quantity: 3, unit: 'hod', unit_price: 50 }], due_days: 14 } }],
      stop_reason: 'tool_use',
      usage: { input_tokens: 612, output_tokens: 88 },
    })
  }
  // A test's photo may say what is written on it: the bytes PRETEND and a JSON object of the tool's fields.
  const data = body?.messages?.[0]?.content?.find((part) => part.source)?.source?.data
  const said = data ? /PRETEND(\{.*\})/s.exec(Buffer.from(data, 'base64').toString('utf8')) : null
  return Response.json({
    id: 'msg_pretend',
    type: 'message',
    role: 'assistant',
    model: body?.model,
    content: [
      {
        type: 'tool_use',
        id: 'toolu_pretend',
        name: tool,
        input: {
          je_doklad: true,
          typ: 'blocek',
          druha_strana: 'Kaviareň Na rohu s. r. o.',
          ico_druhej_strany: '50123456',
          datum_vystavenia: bratislavaDay(-1),
          suma_celkom: '12.40',
          dph_celkom: '2.07',
          mena: 'EUR',
          kategoria: 'representation',
          ...(said ? JSON.parse(said[1]) : {}),
        },
      },
    ],
    stop_reason: 'tool_use',
  })
}

// ---------------------------------------------------------------------------------------------------------------
// Enable Banking
// ---------------------------------------------------------------------------------------------------------------


const SK_BANKS = ['Slovenská sporiteľňa', 'Tatra banka', 'VÚB banka', 'ČSOB', 'Poštová banka', '365.bank', 'Prima banka', 'UniCredit Bank', 'Fio banka', 'mBank'].map((name) => ({
  name,
  country: 'SK',
  psu_types: ['business', 'personal'],
  maximum_consent_validity: 180 * 86400,
  sandbox: false,
  beta: false,
}))

const fromBase64url = (text) => Buffer.from(text.replace(/-/g, '+').replace(/_/g, '/'), 'base64')

/**
 * Enable Banking's API as far as Firmony uses it. It checks the token as the real API does (RS256, the
 * application's id as kid, its issuer and audience, at most a day long, signed with the application's key), knows
 * the banks of Slovakia, sends the client to a pretend bank that approves at once, and reads one business account
 * whose transactions and balance the caller gives. `refuse(code)` makes every read of an account answer 401 with
 * that code, as a consent that ended does; `fail(status)` makes it answer that status, as a bank that is down does.
 */
export function pretendBank({ iban, transactions = () => [], balance = () => '0.00', approve = (back) => `https://pretend-bank.test/schvalit?spat=${encodeURIComponent(back)}`, extraAccount = null }) {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048, publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } })
  const app = 'pretend-app-0001'
  const codes = new Map()
  const sessions = new Map()
  const calls = []
  let refusing = null
  let failing = null
  const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
  function tokenOk(request) {
    const [kind, token] = (request.headers.get('authorization') ?? '').split(' ')
    if (kind !== 'Bearer' || !token) return false
    const [h, p, sig] = token.split('.')
    if (!h || !p || !sig) return false
    try {
      const header = JSON.parse(fromBase64url(h).toString())
      const payload = JSON.parse(fromBase64url(p).toString())
      if (header.alg !== 'RS256' || header.typ !== 'JWT' || header.kid !== app) return false
      if (payload.iss !== 'enablebanking.com' || payload.aud !== 'api.enablebanking.com') return false
      const t = Math.floor(Date.now() / 1000)
      if (!(payload.iat <= t + 60 && payload.exp > t && payload.exp - payload.iat <= 86400)) return false
      return createVerify('RSA-SHA256').update(`${h}.${p}`).verify(publicKey, fromBase64url(sig))
    } catch {
      return false
    }
  }
  async function answer(request) {
    if (!request.url.startsWith('https://api.enablebanking.com/')) return null
    const url = new URL(request.url)
    calls.push({ method: request.method, path: `${url.pathname}${url.search}`, present: request.headers.get('psu-ip-address') })
    if (!tokenOk(request)) return json(401, { message: 'Invalid token', error: 'UNAUTHORIZED_ACCESS' })
    const path = url.pathname
    if (request.method === 'GET' && path === '/aspsps') return json(200, { aspsps: SK_BANKS.filter((b) => !url.searchParams.get('country') || b.country === url.searchParams.get('country')) })
    if (request.method === 'POST' && path === '/auth') {
      const body = await request.json().catch(() => ({}))
      const bank = SK_BANKS.find((b) => b.name === body?.aspsp?.name && b.country === body?.aspsp?.country)
      const until = Date.parse(body?.access?.valid_until ?? '')
      if (!bank || typeof body.state !== 'string' || body.state.length < 20 || typeof body.redirect_url !== 'string' || body.psu_type !== 'business') return json(422, { error: 'WRONG_REQUEST_PARAMETERS' })
      if (!(until > Date.now()) || until > Date.now() + bank.maximum_consent_validity * 1000 + 60_000) return json(422, { error: 'WRONG_ACCESS_VALID_UNTIL' })
      const code = `code-${randomUUID()}`
      codes.set(code, { aspsp: { name: bank.name, country: bank.country }, validUntil: body.access.valid_until })
      const back = `${body.redirect_url}${body.redirect_url.includes('?') ? '&' : '?'}code=${encodeURIComponent(code)}&state=${encodeURIComponent(body.state)}`
      return json(200, { url: approve(back), authorization_id: randomUUID(), psu_id_hash: 'pretend' })
    }
    if (request.method === 'POST' && path === '/sessions') {
      const body = await request.json().catch(() => ({}))
      const given = codes.get(body?.code)
      if (!given) return json(422, { error: 'WRONG_AUTHORIZATION_CODE' })
      codes.delete(body.code)
      const session = randomUUID()
      const accounts = [{ uid: `uid-${session}`, account_id: { iban }, name: 'Podnikateľský účet', currency: 'EUR', cash_account_type: 'CACC' }]
      if (extraAccount) accounts.push({ uid: `uid2-${session}`, account_id: { iban: extraAccount }, name: 'Osobný účet', currency: 'EUR', cash_account_type: 'CACC' })
      accounts.push({ uid: `card-${session}`, account_id: { other: { identification: '4405 77** **** 1234', scheme_name: 'CPAN' } }, name: 'Karta', currency: 'EUR', cash_account_type: 'CARD' })
      sessions.set(session, { status: 'AUTHORIZED', uids: accounts.map((a) => a.uid) })
      return json(200, { session_id: session, accounts, aspsp: given.aspsp, psu_type: 'business', access: { valid_until: given.validUntil } })
    }
    const read = /^\/accounts\/([^/]+)\/(transactions|balances)$/.exec(path)
    if (request.method === 'GET' && read) {
      const uid = decodeURIComponent(read[1])
      const session = [...sessions.values()].find((s) => s.uids.includes(uid))
      if (!session || session.status !== 'AUTHORIZED') return json(404, { error: 'ACCOUNT_DOES_NOT_EXIST' })
      if (refusing) return json(401, { error: refusing })
      if (failing) return json(failing, { error: 'ASPSP_ERROR' })
      if (read[2] === 'balances') return json(200, { balances: [{ name: 'Účtovný zostatok', balance_amount: { currency: 'EUR', amount: balance() }, balance_type: 'CLBD', reference_date: new Date().toISOString().slice(0, 10) }] })
      const from = url.searchParams.get('date_from') ?? '0000-00-00'
      const own = uid.startsWith('uid2-') ? [{ entry_reference: 'personal-1', transaction_amount: { currency: 'EUR', amount: '35.00' }, credit_debit_indicator: 'DBIT', status: 'BOOK', booking_date: from, remittance_information: ['Potraviny'] }] : transactions()
      const all = own.filter((tx) => (tx.booking_date ?? tx.value_date ?? '') >= from)
      const at = Number(url.searchParams.get('continuation_key') ?? '0')
      const page = all.slice(at, at + 2)
      return json(200, { transactions: page, continuation_key: at + 2 < all.length ? String(at + 2) : null })
    }
    const ending = /^\/sessions\/([^/]+)$/.exec(path)
    if (request.method === 'DELETE' && ending) {
      const session = sessions.get(decodeURIComponent(ending[1]))
      if (!session) return json(404, { error: 'SESSION_DOES_NOT_EXIST' })
      session.status = 'CLOSED'
      return json(200, { message: 'OK' })
    }
    return json(404, { error: 'NOT_FOUND' })
  }
  return { app, privateKey, publicKey, answer, calls, sessions, refuse: (code) => (refusing = code), fail: (status) => (failing = status) }
}

// ---------------------------------------------------------------------------------------------------------------
// Fio banka, and statements a bank sends by email
// ---------------------------------------------------------------------------------------------------------------

/**
 * Fio's API as fio.ts uses it (its manual, version 1.9): the movements of a period for a token, every value in a
 * column of its own. It takes the tokens it is given (with `anyToken`, any token of 64 letters and digits, for the
 * playground), answers 409 when a token asks again within `minSeconds` (as Fio does within 30 seconds), and 401 to
 * a token it does not know or once `revoke()` was called. `wait()` forgets when each token asked.
 *
 * A movement is given as { id, date, amount, party, account, bankCode, vs, ks, ss, message, kind }.
 */
export function pretendFio({ iban, accountId = '2801234567', transactions = () => [], closing = () => 0, tokens = [], anyToken = false, minSeconds = 30 }) {
  const calls = []
  const asked = new Map()
  let revoked = false
  let failing = null
  const column = (id, value) => (value === null || value === undefined ? null : { value, name: `column${id}`, id })
  async function answer(request) {
    if (!request.url.startsWith('https://fioapi.fio.cz/')) return null
    const url = new URL(request.url)
    const m = /^\/v1\/rest\/periods\/([^/]+)\/(\d{4}-\d{2}-\d{2})\/(\d{4}-\d{2}-\d{2})\/transactions\.json$/.exec(url.pathname)
    calls.push({ method: request.method, from: m?.[2] ?? null, to: m?.[3] ?? null })
    if (!m || request.method !== 'GET') return new Response('', { status: 404 })
    const token = decodeURIComponent(m[1])
    if (revoked || !(anyToken ? /^[A-Za-z0-9]{64}$/.test(token) : tokens.includes(token))) return new Response('', { status: 401 })
    if (failing) return new Response('', { status: failing })
    const t = Date.now()
    if (asked.has(token) && t - asked.get(token) < minSeconds * 1000) return new Response('', { status: 409 })
    asked.set(token, t)
    const list = transactions().filter((tx) => tx.date >= m[2] && tx.date <= m[3])
    const info = { accountId, bankId: '8330', currency: 'EUR', iban, bic: 'FIOZSKBAXXX', openingBalance: null, closingBalance: closing(), dateStart: `${m[2]}+0200`, dateEnd: `${m[3]}+0200` }
    const transaction = list.map((tx) => ({
      column22: column(22, tx.id),
      column0: column(0, `${tx.date}+0200`),
      column1: column(1, tx.amount),
      column14: column(14, 'EUR'),
      column2: column(2, tx.account ?? null),
      column3: column(3, tx.bankCode ?? null),
      column10: column(10, tx.party ?? null),
      column4: column(4, tx.ks ?? null),
      column5: column(5, tx.vs ?? null),
      column6: column(6, tx.ss ?? null),
      column7: column(7, tx.identification ?? null),
      column16: column(16, tx.message ?? null),
      column8: column(8, tx.kind ?? 'Bezhotovostná platba'),
    }))
    return new Response(JSON.stringify({ accountStatement: { info, transactionList: { transaction } } }), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  return { answer, calls, revoke: () => (revoked = true), fail: (status) => (failing = status), wait: () => asked.clear() }
}

const xmlText = (text) => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const money = (cents) => (Math.abs(cents) / 100).toFixed(2)

/**
 * A bank's statement (camt.053.001.02) of one account: its opening balance, its movements, and a closing balance
 * that follows from them unless `closing` says otherwise. A movement is { ref, day, cents, party, iban, vs, note, card }.
 */
export function camtXml({ iban, from, to, opening, entries, closing = null, number = '1' }) {
  const end = closing ?? opening + entries.reduce((sum, e) => sum + e.cents, 0)
  const bal = (code, cents, day) =>
    `<Bal><Tp><CdOrPrtry><Cd>${code}</Cd></CdOrPrtry></Tp><Amt Ccy="EUR">${money(cents)}</Amt><CdtDbtInd>${cents < 0 ? 'DBIT' : 'CRDT'}</CdtDbtInd><Dt><Dt>${day}</Dt></Dt></Bal>`
  const ntry = (e) => {
    const side = e.cents < 0 ? 'Cdtr' : 'Dbtr'
    const parts = [
      e.vs ? `<Refs><EndToEndId>/VS${xmlText(e.vs)}/SS/KS</EndToEndId></Refs>` : '',
      e.party || e.iban ? `<RltdPties>${e.party ? `<${side}><Nm>${xmlText(e.party)}</Nm></${side}>` : ''}${e.iban ? `<${side}Acct><Id><IBAN>${e.iban}</IBAN></Id></${side}Acct>` : ''}</RltdPties>` : '',
      e.note ? `<RmtInf><Ustrd>${xmlText(e.note)}</Ustrd></RmtInf>` : '',
    ].join('')
    return [
      '<Ntry>',
      `<Amt Ccy="EUR">${money(e.cents)}</Amt><CdtDbtInd>${e.cents < 0 ? 'DBIT' : 'CRDT'}</CdtDbtInd><Sts>BOOK</Sts>`,
      `<BookgDt><Dt>${e.day}</Dt></BookgDt><ValDt><Dt>${e.day}</Dt></ValDt>`,
      `<AcctSvcrRef>${xmlText(e.ref)}</AcctSvcrRef>`,
      e.card ? '<BkTxCd><Domn><Cd>PMNT</Cd><Fmly><Cd>CCRD</Cd><SubFmlyCd>POSD</SubFmlyCd></Fmly></Domn></BkTxCd>' : '',
      parts ? `<NtryDtls><TxDtls>${parts}</TxDtls></NtryDtls>` : '',
      e.card && e.party ? `<AddtlNtryInf>Platba kartou ${xmlText(e.party)}</AddtlNtryInf>` : '',
      '</Ntry>',
    ].join('')
  }
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02">',
    `<BkToCstmrStmt><GrpHdr><MsgId>STMT-${to}-${xmlText(number)}</MsgId><CreDtTm>${to}T22:00:00</CreDtTm></GrpHdr>`,
    `<Stmt><Id>${to}-${xmlText(number)}</Id><ElctrncSeqNb>${xmlText(number)}</ElctrncSeqNb><CreDtTm>${to}T22:00:00</CreDtTm>`,
    `<FrToDt><FrDtTm>${from}T00:00:00</FrDtTm><ToDtTm>${to}T23:59:59</ToDtTm></FrToDt>`,
    `<Acct><Id><IBAN>${iban}</IBAN></Id><Ccy>EUR</Ccy></Acct>`,
    bal('OPBD', opening, from),
    bal('CLBD', end, to),
    ...entries.map(ntry),
    '</Stmt></BkToCstmrStmt></Document>',
    '',
  ].join('\n')
}

/** An email with a statement attached, as a bank sends it to the company's address for documents. */
export function statementMail({ to, from = 'vypisy@banka.test', xml, name = 'vypis.xml', subject = 'Výpis z účtu' }) {
  const b = `stmt-${randomUUID()}`
  return [
    `From: Banka <${from}>`,
    `To: ${to}`,
    `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
    `Message-ID: <${randomUUID()}@banka.test>`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${b}"`,
    '',
    `--${b}`,
    'Content-Type: text/plain; charset=utf-8',
    '',
    'V prílohe je výpis z účtu.',
    `--${b}`,
    `Content-Type: application/xml; name="${name}"`,
    `Content-Disposition: attachment; filename="${name}"`,
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(xml).toString('base64').replace(/.{76}/g, '$&\r\n'),
    `--${b}--`,
    '',
  ].join('\r\n')
}
