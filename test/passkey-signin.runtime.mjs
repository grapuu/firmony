// Signing in with a passkey alone (27 October 2026, the owner's word: no email at every sign-in). A client signs in
// by email once and is offered a passkey at once; from then on one touch opens the app, with no email. A signature is
// taken once, only for the passkey's own account, only from Firmony's origin and with the person verified; a team member
// who signs in so is verified from the first moment. The email link stays the way in on a new device.
import { check } from './check.mjs'
import { authenticator, jsonClient } from './passkeys.fixture.mjs'
import { createHash } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { migrationSteps } from '../.wrangler/dist/schema.js'

export async function checkPasskeySignin({ mf, db, post, sent, settle, as, nowS }) {
  const site = 'https://firmony.io'
  const sha = (v) => createHash('sha256').update(v).digest('hex')
  check('passkey sign-in: the 84 steps live since 27 October 2026 are unchanged, its own the next', migrationSteps.length >= 85 && JSON.stringify(migrationSteps[84]).includes('CREATE TABLE IF NOT EXISTS signin_challenges'))
  await db.batch([
    db.prepare("INSERT INTO companies (id, created_at, name, ico, address, vat_payer, plan, inbox, start_on) VALUES ('co-key', ?, 'TEST-ONLY Kľúč s. r. o.', '50777770', 'Hlavná 1, 040 01 Košice', 0, 'start', 'keyy0001', '2026-01-01')").bind(nowS),
    db.prepare("INSERT INTO users (id, created_at, email, name) VALUES ('u-key', ?, 'kluc@example.sk', 'TEST-ONLY Kľúčová')").bind(nowS),
    db.prepare("INSERT INTO members (company_id, user_id, role, created_at) VALUES ('co-key', 'u-key', 'owner', ?)").bind(nowS),
  ])
  const page = async (res) => (await res.text()).replace(/ /g, ' ')
  const keep = (name, html) => { if (process.env.FIRMONY_CAPTURE_DIR) writeFileSync(`${process.env.FIRMONY_CAPTURE_DIR}/${name}.html`, html) }

  // The sign-in page: one touch first, the email below it.
  let res = await mf.dispatchFetch(`${site}/app/prihlasenie`, { headers: { 'cf-connecting-ip': '203.0.113.60' } })
  let html = await page(res)
  keep('signin', html)
  check('passkey sign-in: the sign-in page offers one touch first, the saved sign-in in the email field, and the email link for a first time', res.status === 200 && html.includes('data-passkey="signin"') && html.includes('src="/security.js"') && html.indexOf('data-passkey="signin"') < html.indexOf('name="email"') && /name="email"[^>]*autocomplete="username webauthn"|autocomplete="username webauthn"[^>]*name="email"/.test(html))

  // By email once: the link leads to the offer of a passkey.
  const before = (await sent()).length
  await post('/app/prihlasenie', { email: 'kluc@example.sk' }, { ip: '192.0.2.250' })
  await settle()
  const mail = (await sent()).slice(before).filter((m) => m.to === 'kluc@example.sk').pop()
  const t = mail?.text.match(/\/app\/vstup\?t=([A-Za-z0-9_-]{43})/)?.[1] ?? ''
  res = await post('/app/vstup', { t }, { ip: '203.0.113.61' })
  const cookie = (res.headers.get('set-cookie') ?? '').split(';')[0]
  check('passkey sign-in: after the email link a client without a passkey is offered one', res.status === 303 && res.headers.get('location') === '/app/rychle-prihlasenie?next=%2Fapp')
  const client = as(cookie)
  html = await page(await client.get('/app/rychle-prihlasenie?next=%2Fapp'))
  keep('signin-quick', html)
  check('passkey sign-in: the offer saves the sign-in with one touch, or lets the person go on', html.includes('data-passkey="register"') && html.includes('Uložiť prihlásenie') && html.includes('href="/app"'))
  const key = await authenticator()
  const api = jsonClient(mf, site, cookie, '203.0.113.62')
  res = await api('/auth/options', { action: 'register', next: '/app' })
  const options = await res.json()
  res = await api('/auth/verify', { id: options.id, response: await key.register(options.options), name: 'TEST-ONLY telefón' })
  const registered = await res.json()
  check('passkey sign-in: the fresh email proof is enough to save the first passkey', res.status === 200 && registered.to === '/app' && (await db.prepare("SELECT COUNT(*) AS n FROM passkeys WHERE user_id = 'u-key'").first()).n === 1)
  const keyed = as((res.headers.get('set-cookie') ?? '').split(';')[0])
  res = await keyed.get('/app/rychle-prihlasenie?next=%2Fapp')
  check('passkey sign-in: with a passkey the offer is never shown again', res.status === 303 && res.headers.get('location') === '/app')

  // One touch, no email.
  const anon = jsonClient(mf, site, '', '203.0.113.63')
  const mailsBefore = (await sent()).length
  res = await anon('/app/prihlasenie/kluc/moznosti', {})
  let signin = await res.json()
  check('passkey sign-in: the options name no account and ask for the person to be verified', res.status === 200 && !signin.options.allowCredentials?.length && signin.options.userVerification === 'required' && signin.options.rpId === 'firmony.io')
  let response = await key.authenticate(signin.options)
  res = await anon('/app/prihlasenie/kluc/overit', { id: signin.id, response })
  const opened = await res.json()
  const touched = as((res.headers.get('set-cookie') ?? '').split(';')[0])
  const appPage = await page(await touched.get('/app'))
  check('passkey sign-in: one touch signs in, with no email sent', res.status === 200 && opened.to === '/app' && appPage.includes('TEST-ONLY Kľúč s. r. o.') && (await sent()).length === mailsBefore)
  const session = await db.prepare("SELECT verified_at, credential_id FROM sessions WHERE user_id = 'u-key' ORDER BY created_at DESC, rowid DESC LIMIT 1").first()
  check('passkey sign-in: the session is verified by the passkey from its first moment', session?.verified_at > 0 && session.credential_id === key.id)
  res = await anon('/app/prihlasenie/kluc/overit', { id: signin.id, response })
  check('passkey sign-in: a challenge is used once', res.status === 409)
  res = await anon('/app/prihlasenie/kluc/moznosti', {})
  signin = await res.json()
  res = await anon('/app/prihlasenie/kluc/overit', { id: signin.id, response: await key.authenticate(signin.options, { signCount: 1 }) })
  check('passkey sign-in: a signature whose counter does not move on opens nothing', res.status === 400)

  // What opens nothing.
  const tries = [
    ['another site', { origin: 'https://evil.example' }],
    ['the person not verified', { uv: false }],
    ['a wrong signature', { wrongSignature: true }],
    ['an embedded frame', { crossOrigin: true }],
  ]
  for (const [what, opts] of tries) {
    res = await anon('/app/prihlasenie/kluc/moznosti', {})
    signin = await res.json()
    res = await anon('/app/prihlasenie/kluc/overit', { id: signin.id, response: await key.authenticate(signin.options, opts) })
    check(`passkey sign-in: ${what} opens nothing`, res.status === 400 && !(res.headers.get('set-cookie') ?? '').includes('__Host-firmony='))
  }
  res = await anon('/app/prihlasenie/kluc/moznosti', {})
  signin = await res.json()
  const stranger = await authenticator()
  res = await anon('/app/prihlasenie/kluc/overit', { id: signin.id, response: await stranger.authenticate(signin.options) })
  check('passkey sign-in: a passkey we do not know opens nothing and says to use the email', res.status === 400 && (await res.json()).error.replace(/\u2060/g, '').includes('odkaz na e-mail'))
  res = await anon('/app/prihlasenie/kluc/moznosti', {})
  signin = await res.json()
  response = await key.authenticate(signin.options)
  res = await anon('/app/prihlasenie/kluc/overit', { id: signin.id, response: { ...response, response: { ...response.response, userHandle: 'B'.repeat(43) } } })
  check('passkey sign-in: a signature that names another account opens nothing', res.status === 400)
  res = await mf.dispatchFetch(`${site}/app/prihlasenie/kluc/moznosti`, { method: 'POST', body: '{}', headers: { 'content-type': 'application/json', 'content-length': '2', origin: 'https://evil.example', 'cf-connecting-ip': '203.0.113.64' } })
  check('passkey sign-in: another site cannot ask for a challenge', res.status === 403)
  const kept = await db.prepare('SELECT id FROM signin_challenges LIMIT 1').first()
  check('passkey sign-in: a challenge is kept only by its hash', /^[0-9a-f]{64}$/.test(kept?.id ?? '') && kept.id !== signin.id && kept.id.length === sha('x').length)

  // A client stays signed in as in any app; the email stays the root of the account, so a lost phone locks nobody out.
  await db.prepare("UPDATE sessions SET created_at = created_at - 46800, verified_at = verified_at - 46800 WHERE user_id = 'u-key'").run()
  res = await touched.get('/app')
  check('passkey sign-in: a client with a passkey is not asked to touch it again after twelve hours', res.status === 200)
  const exportPath = `/app/export?rok=${new Date(nowS * 1000).getUTCFullYear()}`
  res = await touched.get(exportPath)
  check('passkey sign-in: a sensitive step of an old sign-in asks for the passkey', res.status === 303 && res.headers.get('location') === `/auth?next=${encodeURIComponent(exportPath)}`)
  html = await page(await touched.get(`/auth?next=${encodeURIComponent(exportPath)}`))
  keep('signin-confirm', html)
  check('passkey sign-in: without the key at hand the client may confirm by email, and is never asked for a code', html.includes(`/app/potvrdit?next=${encodeURIComponent(exportPath)}`) && !html.includes('name="code"'))
  const again = (await sent()).length
  await post('/app/prihlasenie', { email: 'kluc@example.sk' }, { ip: '192.0.2.251' })
  await settle()
  const link = (await sent()).slice(again).filter((m) => m.to === 'kluc@example.sk').pop()?.text.match(/\/app\/vstup\?t=([A-Za-z0-9_-]{43})/)?.[1] ?? ''
  res = await post('/app/vstup', { t: link }, { ip: '203.0.113.65' })
  const lost = (res.headers.get('set-cookie') ?? '').split(';')[0]
  check('passkey sign-in: by email on a device without the key, the client is offered to save it there too', res.status === 303 && res.headers.get('location') === '/app/rychle-prihlasenie?next=%2Fapp')
  html = await page(await as(lost).get('/app/rychle-prihlasenie?next=%2Fapp'))
  check('passkey sign-in: the offer is shown beside a key kept elsewhere', html.includes('data-passkey="register"'))
  const phone = await authenticator()
  const lostApi = jsonClient(mf, site, lost, '203.0.113.66')
  res = await lostApi('/auth/options', { action: 'register', next: '/app' })
  const second = await res.json()
  res = await lostApi('/auth/verify', { id: second.id, response: await phone.register(second.options), name: 'TEST-ONLY nový telefón' })
  check('passkey sign-in: a fresh email lets the client add a key for a new phone, with no code, and removes none', res.status === 200 && (await db.prepare("SELECT COUNT(*) AS n FROM passkeys WHERE user_id = 'u-key'").first()).n === 2)
  const renewed = as((res.headers.get('set-cookie') ?? '').split(';')[0])
  res = await renewed.get(exportPath)
  check('passkey sign-in: a sign-in of the last quarter of an hour confirms a sensitive step', res.status === 200 && (res.headers.get('content-type') ?? '').includes('zip'), res.status)
  await res.arrayBuffer()
}
