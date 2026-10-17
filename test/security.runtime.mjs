import { check } from './check.mjs'
import { authenticator, jsonClient, TEST_BOOTSTRAP } from './passkeys.fixture.mjs'
import { createHash, randomBytes } from 'node:crypto'
import { writeFileSync } from 'node:fs'

export async function checkSecurity({ db, mf, site, admin, anna, acc, as, signIn, emailOnly, capture }) {
  const before = (await db.prepare('SELECT COUNT(*) AS n FROM users').first()).n
  let res = await anna.get('/auth/grants')
  check('a customer cannot list enrollment or recovery grants', res.status === 404)
  res = await acc.get('/auth/grants')
  check('an accountant cannot administer recovery grants', res.status === 404)
  res = await admin.post('/ucto/tim', {
    name: 'Backup administrator',
    email: 'backup-admin@security.test',
    rola: 'admin',
  })
  check('a verified administrator can provision a backup administrator', res.status === 303)
  const second = await signIn('backup-admin@security.test'),
    admin2 = as(second.cookie)
  const secondUser = await db.prepare("SELECT id FROM users WHERE email = 'backup-admin@security.test'").first()
  const adminUser = await db.prepare("SELECT id FROM users WHERE email = 'ahoj@firmony.ai'").first()
  res = await admin.post('/ucto/tim', {
    name: 'Christian Juhás',
    email: 'ahoj@firmony.ai',
    rola: 'accountant',
  })
  check(
    'the owner cannot accidentally demote the active administrator account',
    res.status === 422 && (await db.prepare('SELECT team FROM users WHERE id = ?').bind(adminUser.id).first()).team === 'admin',
  )

  await admin.post('/ucto/tim', {
    name: 'Security test accountant',
    email: 'key-owner@security.test',
    rola: 'accountant',
  })
  const target = await db.prepare("SELECT id FROM users WHERE email = 'key-owner@security.test'").first()
  const pending = await emailOnly('key-owner@security.test')
  let cookie = pending.cookie
  res = await as(cookie).get('/ucto')
  check('a team mailbox proof alone cannot read client accounting', res.status === 303 && res.headers.get('location').startsWith('/auth?'))
  res = await as(cookie).post('/ucto/klienti/co-a/spravy', {
    sprava: 'not verified',
  })
  check(
    'a team mailbox proof cannot execute a business mutation',
    res.status === 403 && !(await db.prepare("SELECT 1 FROM messages WHERE body = 'not verified'").first()),
  )
  res = await as(cookie).get('/auth')
  const setupHtml = await res.text()
  check(
    'the setup page runs a local script with no inline script or style',
    setupHtml.includes('/security.js') && !/<script>/.test(setupHtml) && !/ style=/.test(setupHtml),
  )
  if (capture) writeFileSync(`${capture}/security-setup.html`, setupHtml)
  let api = jsonClient(mf, site, cookie, '203.0.113.211')
  res = await api('/auth/options', { action: 'register', next: '/ucto' })
  check('new team keys require an independent activation code', res.status === 403)
  res = await api('/auth/options', {
    action: 'register',
    code: 'x'.repeat(43),
  })
  check('an invented enrollment code is refused', res.status === 403)

  const issue = async (kind, email = 'key-owner@security.test') => {
    const r = await admin.post('/auth/grants', {
      email,
      kind,
      evidence: 'TEST-ONLY identity and authorization report',
    })
    const html = await r.text(),
      token = html.match(/<code class="security__code">([A-Za-z0-9_-]{43})<\/code>/)?.[1]
    if (!token) throw new Error(`grant fixture: ${r.status} ${html.slice(0, 100)}`)
    return { token, id: createHash('sha256').update(token).digest('hex') }
  }
  const grant = await issue('enroll')
  check(
    'activation codes are stored as hashes and never in audit detail',
    !(await db.prepare('SELECT id FROM auth_grants WHERE id = ?').bind(grant.token).first()) &&
      !(await db.prepare('SELECT id FROM events WHERE detail LIKE ?').bind(`%${grant.token}%`).first()),
  )
  res = await admin.get('/auth/grants')
  const grantListHtml = await res.text()
  check('an issued code is not displayed again when the grant page is reopened', !grantListHtml.includes(grant.token))
  if (capture) writeFileSync(`${capture}/security-grants.html`, grantListHtml)
  const key = await authenticator()
  const registrationAttempt = async (patch, optionsPatch) => {
    const r = await api('/auth/options', {
      action: 'register',
      code: grant.token,
      next: '/ucto',
    })
    const o = await r.json()
    if (r.status !== 200) throw new Error(`registration fixture options ${JSON.stringify(o)}`)
    const response = await key.register(optionsPatch ? optionsPatch(o.options) : o.options, patch)
    return api('/auth/verify', {
      id: o.id,
      response,
      name: 'Synthetic security key',
    })
  }
  for (const [label, patch, optionsPatch] of [
    ['missing user verification', { uv: false }],
    ['missing user presence', { up: false }],
    ['foreign origin', { origin: 'https://evil.example' }],
    ['wrong challenge', { challenge: randomBytes(32).toString('base64url') }],
    ['cross-origin frame', { crossOrigin: true }],
    ['wrong relying party', {}, (o) => ({ ...o, rp: { ...o.rp, id: 'evil.example' } })],
  ]) {
    res = await registrationAttempt(patch, optionsPatch)
    check(
      `passkey registration rejects ${label}`,
      res.status === 400 && (await db.prepare('SELECT COUNT(*) AS n FROM passkeys WHERE user_id = ?').bind(target.id).first()).n === 0,
    )
  }
  const optionsRes = await api('/auth/options', {
    action: 'register',
    code: grant.token,
    next: '//evil.example/steal',
  })
  const options = await optionsRes.json(),
    registration = await key.register(options.options)
  const alien = await jsonClient(
    mf,
    site,
    pending.cookie,
    '203.0.113.212',
  )('/auth/verify', { id: options.id, response: registration }, { headers: { origin: 'https://evil.example' } })
  check('a foreign HTTP origin cannot submit a signed registration', alien.status === 403)
  res = await api('/auth/verify', {
    id: options.id,
    response: registration,
    name: 'Synthetic security key',
  })
  const result = await res.json(),
    newCookie = (res.headers.get('set-cookie') ?? '').split(';')[0]
  check(
    'a valid UV registration rotates the session and rejects an external return address',
    res.status === 200 && result.to === '/app' && newCookie && newCookie !== cookie,
  )
  check('the old pre-verification cookie is immediately invalid', (await as(cookie).get('/ucto')).headers.get('location') === '/app/prihlasenie')
  cookie = newCookie
  api = jsonClient(mf, site, cookie, '203.0.113.211')
  res = await api('/auth/verify', { id: options.id, response: registration })
  check('a consumed registration cannot be replayed under the rotated cookie', res.status === 409)
  const keyId = key.id
  check(
    'a successful enrollment consumes its one-time grant',
    Boolean((await db.prepare('SELECT used_at FROM auth_grants WHERE id = ?').bind(grant.id).first()).used_at),
  )
  res = await as(cookie).post(`/auth/keys/${keyId}/remove`, {})
  check(
    'the currently verified and only key cannot be removed',
    res.status === 409 && Boolean(await db.prepare('SELECT id FROM passkeys WHERE id = ?').bind(keyId).first()),
  )
  res = await as(cookie).get('/auth')
  if (capture) writeFileSync(`${capture}/security-ready.html`, await res.text())

  // Use a fresh mailbox session for adversarial authentication; the established session remains unaffected.
  const fresh = await emailOnly('key-owner@security.test')
  let limited = fresh.cookie,
    challengeApi = jsonClient(mf, site, limited, '203.0.113.213')
  res = await challengeApi('/auth/options', {
    action: 'register',
    code: grant.token,
  })
  check('a new email link and used grant cannot replace an existing key', res.status === 403)
  const authenticate = async (patch = {}, mutate) => {
    const r = await challengeApi('/auth/options', {
      action: 'authenticate',
      next: '/ucto',
    })
    const o = await r.json()
    if (r.status !== 200) throw new Error(JSON.stringify(o))
    const response = await key.authenticate(o.options, patch)
    return {
      response: await challengeApi('/auth/verify', {
        id: o.id,
        response: mutate ? mutate(response) : response,
      }),
      options: o,
      signed: response,
    }
  }
  for (const [label, patch, mutate] of [
    ['an invalid signature', { wrongSignature: true }],
    ['a missing UV flag', { uv: false }],
    ['a foreign origin', { origin: 'https://evil.example' }],
    ['a framed response', { crossOrigin: true }],
    [
      'another user handle',
      {},
      (r) => ({
        ...r,
        response: { ...r.response, userHandle: 'not-this-user' },
      }),
    ],
  ]) {
    const trial = await authenticate(patch, mutate)
    check(`passkey authentication rejects ${label}`, trial.response.status === 400)
  }
  // Reset only this fixture user's rate buckets between two independent attack scenarios.
  for (const kind of ['auth-options-user', 'auth-verify'])
    await db
      .prepare('DELETE FROM throttle WHERE key = ?')
      .bind(createHash('sha256').update(`${kind}:${target.id}`).digest('hex'))
      .run()
  const o = await (
    await challengeApi('/auth/options', {
      action: 'authenticate',
      next: '/ucto',
    })
  ).json()
  await db.prepare('UPDATE auth_challenges SET expires_at = 1 WHERE id = ?').bind(o.id).run()
  res = await challengeApi('/auth/verify', {
    id: o.id,
    response: await key.authenticate(o.options),
  })
  check('an expired cryptographic challenge is refused', res.status === 409)
  const good = await authenticate()
  check('a real signature with UV completes authentication', good.response.status === 200)
  const verifiedCookie = (good.response.headers.get('set-cookie') ?? '').split(';')[0]
  res = await jsonClient(mf, site, verifiedCookie, '203.0.113.214')('/auth/verify', { id: good.options.id, response: good.signed })
  check('the signed assertion is single-use even after session rotation', res.status === 409)

  const unverifiedRoot = await emailOnly('ahoj@firmony.ai')
  res = await jsonClient(mf, site, unverifiedRoot.cookie, '203.0.113.215')('/auth/options', { action: 'register', code: TEST_BOOTSTRAP })
  check('the initial bootstrap token never becomes an existing-key recovery bypass', res.status === 403)
  const recovery = await issue('recover')
  res = await challengeApi('/auth/options', {
    action: 'register',
    code: recovery.token,
  })
  check('recovery cannot be used before a second administrator approves', res.status === 403)
  res = await admin.post(`/auth/grants/${recovery.id}/approve`, { reference: 'TEST-ONLY independent recovery identity check' })
  check('the recovery initiator cannot approve their own request', res.status === 409)
  res = await admin2.post(`/auth/grants/${recovery.id}/approve`, { reference: 'TEST-ONLY independent recovery identity check' })
  check('a different verified administrator can approve recovery', res.status === 303)
  // The previously authenticated limited cookie was rotated. Obtain another fresh mailbox proof.
  limited = (await emailOnly('key-owner@security.test')).cookie
  challengeApi = jsonClient(mf, site, limited, '203.0.113.213')
  const recoveryOptions = await (
    await challengeApi('/auth/options', {
      action: 'register',
      code: recovery.token,
      next: '/ucto',
    })
  ).json()
  const replacement = await authenticator(),
    recoveryResponse = await replacement.register(recoveryOptions.options)
  await admin.post(`/auth/grants/${recovery.id}/revoke`, {})
  res = await challengeApi('/auth/verify', {
    id: recoveryOptions.id,
    response: recoveryResponse,
  })
  check(
    'revoking recovery between options and commit preserves the existing key',
    res.status === 409 && Boolean(await db.prepare('SELECT id FROM passkeys WHERE id = ?').bind(key.id).first()),
  )
  const approved = await issue('recover')
  await admin2.post(`/auth/grants/${approved.id}/approve`, { reference: 'TEST-ONLY independent recovery identity check' })
  const rOpts = await (
    await challengeApi('/auth/options', {
      action: 'register',
      code: approved.token,
      next: '/ucto',
    })
  ).json()
  res = await challengeApi('/auth/verify', {
    id: rOpts.id,
    response: await replacement.register(rOpts.options),
  })
  const recoveredCookie = (res.headers.get('set-cookie') ?? '').split(';')[0]
  check(
    'approved recovery replaces old keys and establishes one verified session',
    res.status === 200 &&
      !(await db.prepare('SELECT id FROM passkeys WHERE id = ?').bind(key.id).first()) &&
      (await db.prepare('SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?').bind(target.id).first()).n === 1,
  )
  check('recovery invalidates old authenticated browser sessions', (await as(verifiedCookie).get('/ucto')).headers.get('location') === '/app/prihlasenie')
  check(
    'recovery removes outstanding mailbox links',
    (await db.prepare('SELECT COUNT(*) AS n FROM login_links WHERE user_id = ?').bind(target.id).first()).n === 0,
  )
  await db
    .prepare('UPDATE sessions SET verified_at = ? WHERE user_id = ?')
    .bind(Math.floor(Date.now() / 1000) - 301, target.id)
    .run()
  res = await as(recoveredCookie).get('/ucto/klienti/co-a/export')
  check(
    'sensitive downloads demand recent verification rather than an old verified cookie',
    res.status === 303 && res.headers.get('location').startsWith('/auth?'),
  )
  res = await as(recoveredCookie).post('/ucto/klienti/co-a/odovzdanie/no-file/odstranit', {})
  const blocked = await res.text()
  check('blocked POST-only actions return to the company handover page after verification', res.status === 403 && blocked.includes('name="next" value="/ucto/klienti/co-a#odovzdanie"'))
  if (capture) writeFileSync(`${capture}/security-action-blocked.html`, blocked)
  res = await as(recoveredCookie).post(`/auth/keys/${replacement.id}/remove`, {})
  const keyError = await res.text()
  check('an expired key-management confirmation offers the working verification form instead of raw JSON', res.status === 403 && res.headers.get('content-type').includes('text/html') && keyError.includes('data-passkey="authenticate"'))
  if (capture) writeFileSync(`${capture}/security-key-error.html`, keyError)
  await db
    .prepare('UPDATE sessions SET verified_at = ? WHERE user_id = ?')
    .bind(Math.floor(Date.now() / 1000) - 43201, target.id)
    .run()
  res = await as(recoveredCookie).get('/ucto')
  check('team assurance expires independently of the longer mailbox session', res.status === 303 && res.headers.get('location').startsWith('/auth?'))
  const keyHash = createHash('sha256').update(`auth-options-user:${target.id}`).digest('hex'),
    bucket = Math.floor(Date.now() / 1000 / 600)
  await db
    .prepare('INSERT INTO throttle (key,bucket,hits,expires_at) VALUES (?,?,20,?) ON CONFLICT(key,bucket) DO UPDATE SET hits=20')
    .bind(keyHash, bucket, (bucket + 1) * 600 + 172800)
    .run()
  res = await jsonClient(mf, site, recoveredCookie, '203.0.113.213')('/auth/options', { action: 'authenticate' })
  check('cryptographic option requests are rate limited per account', res.status === 429)
  check('the security fixtures do not remove existing user accounts', (await db.prepare('SELECT COUNT(*) AS n FROM users').first()).n >= before)
  return { admin2, secondUser, adminUser }
}
