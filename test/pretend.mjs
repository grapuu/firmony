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

/** The register's answer for a request the Worker sends, or null when the request is not for the register. */
export function registerAnswer(url, calls = []) {
  if (!url.startsWith('https://api.statistics.sk/rpo/v1/search')) return null
  const ico = new URL(url).searchParams.get('identifier')
  calls.push(ico)
  if (ico === '57442452') return new Response(europio, { headers: { 'content-type': 'application/json' } })
  if (ico === '35757442') return new Response('busy', { status: 503 })
  return Response.json({ results: [], license: 'CC BY 4.0' })
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
        input: { je_doklad: true, typ: 'blocek', druha_strana: 'Kaviareň Na rohu s. r. o.', ico_druhej_strany: '50123456', datum_vystavenia: bratislavaDay(-1), suma_celkom: '12.40', dph_celkom: '2.07', mena: 'EUR', kategoria: 'representation' },
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
