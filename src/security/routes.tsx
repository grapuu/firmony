import { Hono, type Context } from 'hono'
import { html } from 'hono/html'
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type RegistrationResponseJSON,
  type AuthenticationResponseJSON,
} from '@simplewebauthn/server'
import { BRAND } from '../config'
import { ensureSchema, now, sha256Hex, withinLimit } from '../db'
import { connection } from '../http'
import { currentWho, newToken } from '../app/session'
import { eventStatement, type Who } from '../app/store'
import type { AppBindings } from '../app/routes'
import { SecurityPage, GrantsPage } from '../views/security'
import { actionReturn, relyingParty, safeNext, SECURITY, verifiedRecently } from './policy'
import { consumeChallenge, decode, encode, grantFor, newChallenge, passkeysOf, rotatedSession, setVerifiedCookie, userHandle, type Grant } from './store'

type Env = { Bindings: AppBindings; Variables: { who: Who } }
type Ctx = Context<Env>
export const securityRoutes = new Hono<Env>()
const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const failure = (c: Ctx, message = 'Overenie sa nepodarilo. Skúste nový pokus.', status: 400 | 403 | 409 | 429 = 400) => c.json({ error: message }, status)

export async function securityGate(c: Context, who: Who, sensitive = false): Promise<Response | null> {
  const keys = await passkeysOf(c.env.DB, who.user.id)
  const requires = sensitive || Boolean(who.user.team) || keys.length > 0
  if (!requires || verifiedRecently(who, now(), sensitive ? SECURITY.sensitiveSeconds : SECURITY.teamSeconds)) return null
  const u = new URL(c.req.url)
  const reads = c.req.method === 'GET' || c.req.method === 'HEAD'
  const next = reads ? safeNext(`${u.pathname}${u.search}`) : actionReturn(u.pathname, c.req.header('referer'), u.origin)
  if (reads) return c.redirect(`/auth?next=${encodeURIComponent(next)}`, 303)
  return c.html(
    html`<!doctype html>${(
        <SecurityPage
          user={who.user}
          keys={keys}
          next={next}
          verified={false}
          error="Pred touto zmenou potvrďte prístup prihlasovacím kľúčom. Potom zopakujte pôvodnú akciu."
        />
      )}`,
    403,
  )
}
securityRoutes.use('*', async (c, next) => {
  await ensureSchema(c.env.DB)
  c.header('Cache-Control', 'private, no-store')
  const who = await currentWho(c, c.env.DB)
  if (!who) return c.req.method === 'GET' ? c.redirect('/app/prihlasenie', 303) : c.text('Forbidden', 403)
  c.set('who', who)
  await next()
})
securityRoutes.get('/', async (c) => {
  const who = c.get('who')
  return c.html(
    html`<!doctype html>${(
        <SecurityPage
          user={who.user}
          keys={await passkeysOf(c.env.DB, who.user.id)}
          next={safeNext(c.req.query('next') ?? (who.user.team ? '/ucto' : '/app'))}
          verified={verifiedRecently(who, now(), SECURITY.sensitiveSeconds)}
          currentKey={who.verifiedCredential}
        />
      )}`,
  )
})
securityRoutes.post('/options', async (c) => {
  const who = c.get('who'),
    db = c.env.DB
  if (
    !(await withinLimit(db, 'auth-options-user', who.user.id, SECURITY.requestsPerTenMinutes, 600)) ||
    !(await withinLimit(db, 'auth-options-ip', connection(c), SECURITY.requestsPerTenMinutes * 3, 600))
  )
    return failure(c, 'Príliš veľa pokusov. Skúste to neskôr.', 429)
  const rp = relyingParty(c.req.url, c.env)
  if (!rp) return failure(c, 'Prihlasovací kľúč použite na hlavnej adrese služby.', 403)
  const body = await c.req.json<Record<string, unknown>>().catch(() => null)
  if (!body) return failure(c)
  const keys = await passkeysOf(db, who.user.id),
    next = safeNext(body.next)
  if (body.action === 'authenticate') {
    if (!keys.length) return failure(c, 'Najprv nastavte prihlasovací kľúč.')
    const options = await generateAuthenticationOptions({ rpID: rp.rpID, allowCredentials: keys.map((k) => ({ id: k.id })), userVerification: 'required' })
    const id = await newChallenge(db, who, 'authenticate', options.challenge, next, null)
    return c.json({ id, options })
  }
  if (body.action !== 'register') return failure(c)
  let grant: Grant | null = null
  if (!verifiedRecently(who, now(), SECURITY.sensitiveSeconds)) {
    grant = await grantFor(db, c.env, who, text(body.code, 80))
    if (!grant && !who.user.team && keys.length === 0 && who.createdAt > now() - SECURITY.sensitiveSeconds) {
      // First customer enrollment only, following a fresh mailbox proof. Never an existing-key reset.
      const id = await sha256Hex(newToken())
      await db
        .prepare(
          `INSERT INTO auth_grants (id, user_id, kind, source, created_at, created_by, expires_at)
        VALUES (?, ?, 'enroll', 'client', ?, ?, ?)`,
        )
        .bind(id, who.user.id, now(), who.user.id, who.createdAt + SECURITY.sensitiveSeconds)
        .run()
      grant = await db.prepare('SELECT * FROM auth_grants WHERE id = ?').bind(id).first<Grant>()
    }
    if (!grant || (grant.kind === 'enroll' && keys.length))
      return failure(
        c,
        who.user.team
          ? 'Zadajte platný aktivačný kód od správcu. Existujúci kľúč možno obnoviť iba schváleným postupom.'
          : 'Znovu sa prihláste e-mailovým odkazom. Už nastavený kľúč možno nahradiť iba overeným postupom obnovy.',
        403,
      )
  }
  const options = await generateRegistrationOptions({
    rpName: BRAND.name,
    rpID: rp.rpID,
    userName: who.user.email,
    userDisplayName: who.user.name,
    userID: decode(await userHandle(db, who.user.id)),
    attestationType: 'none',
    supportedAlgorithmIDs: [-7, -257],
    excludeCredentials: keys.map((k) => ({ id: k.id })),
    authenticatorSelection: { residentKey: 'preferred', userVerification: 'required' },
  })
  const id = await newChallenge(db, who, 'register', options.challenge, next, grant?.id ?? null)
  return c.json({ id, options })
})

securityRoutes.post('/verify', async (c) => {
  const who = c.get('who'),
    db = c.env.DB
  if (!(await withinLimit(db, 'auth-verify', who.user.id, SECURITY.requestsPerTenMinutes, 600)))
    return failure(c, 'Príliš veľa pokusov. Skúste to neskôr.', 429)
  const rp = relyingParty(c.req.url, c.env)
  if (!rp) return failure(c, undefined, 403)
  const body = await c.req.json<Record<string, unknown>>().catch(() => null)
  if (!body || typeof body.id !== 'string') return failure(c)
  const challenge = await consumeChallenge(db, body.id, who)
  if (!challenge) return failure(c, 'Pokus už bol použitý alebo vypršal. Začnite znova.', 409)
  let stage = 'verify'
  try {
    const rotated = await rotatedSession(db, who),
      ts = now()
    const clientData = (body.response as { response?: { clientDataJSON?: unknown } })?.response?.clientDataJSON
    if (typeof clientData !== 'string') return failure(c)
    const envelope = JSON.parse(new TextDecoder().decode(decode(clientData)))
    if (envelope.crossOrigin === true || envelope.topOrigin) return failure(c)
    if (challenge.kind === 'register') {
      const verified = await verifyRegistrationResponse({
        response: body.response as RegistrationResponseJSON,
        expectedChallenge: challenge.challenge,
        expectedOrigin: rp.origin,
        expectedRPID: rp.rpID,
        requireUserPresence: true,
        requireUserVerification: true,
        supportedAlgorithmIDs: [-7, -257],
      })
      const info = verified.registrationInfo
      if (!verified.verified || !info?.userVerified) return failure(c)
      const key = info.credential,
        grantId = challenge.grant_id ?? ''
      const args = [who.user.id, who.session, rotated.hash, ts, challenge.id, grantId, key.id] as const
      const guard = `EXISTS (SELECT 1 FROM sessions WHERE id = ?2 AND user_id = ?1 AND expires_at > ?4) AND (
        (?6 <> '' AND EXISTS (SELECT 1 FROM auth_grants WHERE id = ?6 AND user_id = ?1 AND used_by = ?5 AND used_at = ?4)) OR
        (?6 = '' AND EXISTS (SELECT 1 FROM sessions s JOIN passkeys k ON k.id = s.credential_id AND k.user_id = s.user_id
          WHERE s.id = ?2 AND s.verified_at > ?4 - ${SECURITY.sensitiveSeconds})))`
      const inserted = `${guard} AND EXISTS (SELECT 1 FROM passkeys WHERE id = ?7 AND user_id = ?1)`
      const statements = [
        db
          .prepare(
            `UPDATE auth_grants SET used_at = ?4, used_by = ?5 WHERE id = ?6 AND user_id = ?1 AND used_at IS NULL AND revoked_at IS NULL AND expires_at > ?4
          AND EXISTS (SELECT 1 FROM sessions WHERE id = ?2 AND user_id = ?1 AND expires_at > ?4)
          AND ((kind = 'enroll' AND NOT EXISTS (SELECT 1 FROM passkeys WHERE user_id = ?1) AND (
            (source = 'bootstrap' AND NOT EXISTS (SELECT 1 FROM auth_bootstrap)) OR
            (source = 'client' AND EXISTS (SELECT 1 FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ?2 AND s.created_at > ?4 - ${SECURITY.sensitiveSeconds} AND u.team IS NULL)) OR
            (source = 'admin' AND created_by <> user_id AND EXISTS (SELECT 1 FROM users WHERE id = auth_grants.created_by AND team = 'admin'))))
          OR (kind = 'recover' AND approved_at IS NOT NULL AND length(approval_evidence) >= 12 AND approved_by <> created_by AND approved_by <> user_id AND created_by <> user_id
            AND EXISTS (SELECT 1 FROM users WHERE id = auth_grants.created_by AND team = 'admin')
            AND EXISTS (SELECT 1 FROM users WHERE id = auth_grants.approved_by AND team = 'admin')))`,
          )
          .bind(who.user.id, who.session, rotated.hash, ts, challenge.id, grantId),
        db
          .prepare(`DELETE FROM passkeys WHERE user_id = ?1 AND ${guard} AND EXISTS (SELECT 1 FROM auth_grants WHERE id = ?6 AND kind = 'recover')`)
          .bind(...args.slice(0, 6)),
        db
          .prepare(
            `INSERT INTO passkeys (user_id, id, public_key, counter, name, device_type, backed_up, transports, created_at)
          SELECT ?1, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?4 WHERE ${guard}`,
          )
          .bind(
            ...args,
            encode(key.publicKey),
            key.counter,
            text(body.name, 80) || 'Prihlasovací kľúč',
            info.credentialDeviceType,
            info.credentialBackedUp ? 1 : 0,
            JSON.stringify(key.transports ?? []),
          ),
        db
          .prepare(
            `INSERT INTO auth_bootstrap (id, user_id, used_at) SELECT 1, ?1, ?4 WHERE ${inserted} AND EXISTS (SELECT 1 FROM auth_grants WHERE id = ?6 AND source = 'bootstrap')`,
          )
          .bind(...args),
        db.prepare(`DELETE FROM sessions WHERE user_id = ?1 AND id <> ?2 AND ${inserted}`).bind(...args),
        db.prepare(`DELETE FROM login_links WHERE user_id = ?1 AND ${inserted}`).bind(...args),
        db
          .prepare(`INSERT INTO events (at, company_id, user_id, action, subject, detail) SELECT ?4, NULL, ?1, 'auth.key.registered', ?7, ?8 WHERE ${inserted}`)
          .bind(...args, JSON.stringify({ grant: grantId || null, uv: true })),
        db.prepare(`UPDATE sessions SET id = ?3, verified_at = ?4, credential_id = ?7 WHERE id = ?2 AND ${inserted}`).bind(...args),
      ]
      stage = 'registration-commit'
      await db.batch(statements)
    } else {
      const response = body.response as AuthenticationResponseJSON
      const key =
        typeof response?.id === 'string'
          ? await db.prepare('SELECT * FROM passkeys WHERE id = ? AND user_id = ?').bind(response.id, who.user.id).first<import('./store').Passkey>()
          : null
      if (!key) return failure(c)
      const handle = (await db.prepare('SELECT auth_handle FROM users WHERE id = ?').bind(who.user.id).first<{ auth_handle: string }>())?.auth_handle
      if (response.response?.userHandle && response.response.userHandle !== handle) return failure(c)
      const verified = await verifyAuthenticationResponse({
        response,
        expectedChallenge: challenge.challenge,
        expectedOrigin: rp.origin,
        expectedRPID: rp.rpID,
        requireUserVerification: true,
        credential: { id: key.id, publicKey: decode(key.public_key), counter: key.counter },
      })
      if (!verified.verified || !verified.authenticationInfo.userVerified) return failure(c)
      const counter = verified.authenticationInfo.newCounter
      await db.batch([
        db
          .prepare(
            `UPDATE passkeys SET counter = ?1, last_used_at = ?2, auth_nonce = ?3 WHERE id = ?4 AND user_id = ?5 AND counter = ?6
          AND EXISTS (SELECT 1 FROM sessions WHERE id = ?7 AND user_id = ?5 AND expires_at > ?2)`,
          )
          .bind(counter, ts, challenge.id, key.id, who.user.id, key.counter, who.session),
        db
          .prepare(
            `INSERT INTO events (at, company_id, user_id, action, subject) SELECT ?1, NULL, ?2, 'auth.verified', ?3
          WHERE EXISTS (SELECT 1 FROM passkeys WHERE id = ?3 AND user_id = ?2 AND auth_nonce = ?4)`,
          )
          .bind(ts, who.user.id, key.id, challenge.id),
        db
          .prepare(
            `UPDATE sessions SET id = ?1, verified_at = ?2, credential_id = ?3 WHERE id = ?4 AND user_id = ?5 AND expires_at > ?2
          AND EXISTS (SELECT 1 FROM passkeys WHERE id = ?3 AND user_id = ?5 AND auth_nonce = ?6)`,
          )
          .bind(rotated.hash, ts, key.id, who.session, who.user.id, challenge.id),
      ])
    }
    const completed = await db
      .prepare('SELECT 1 AS x FROM sessions WHERE id = ? AND user_id = ? AND verified_at = ?')
      .bind(rotated.hash, who.user.id, ts)
      .first()
    if (!completed) return failure(c, 'Podmienky overenia sa medzitým zmenili. Začnite znova.', 409)
    setVerifiedCookie(c, rotated.token, rotated.expiresAt)
    return c.json({ to: safeNext(challenge.next_path) })
  } catch {
    await db.batch([eventStatement(db, { company: null, user: who.user.id, action: 'auth.failed', subject: challenge.kind, detail: { stage } })])
    return failure(c)
  }
})

securityRoutes.post('/keys/:id/remove', async (c) => {
  const who = c.get('who'),
    db = c.env.DB
  const renderKeyError = async (message: string, status: 403 | 409) => c.html(
    html`<!doctype html>${(
      <SecurityPage
        user={who.user}
        keys={await passkeysOf(db, who.user.id)}
        next="/auth"
        verified={verifiedRecently(who, now(), SECURITY.sensitiveSeconds)}
        currentKey={who.verifiedCredential}
        error={message}
      />
    )}`,
    status,
  )
  if (!verifiedRecently(who, now(), SECURITY.sensitiveSeconds)) return renderKeyError('Najprv potvrďte prístup kľúčom. Potom Vás vrátime k správe kľúčov.', 403)
  const id = c.req.param('id')
  if (id === who.verifiedCredential) return renderKeyError('Aktuálne použitý kľúč nemožno odstrániť. Overte sa druhým kľúčom.', 409)
  const removed = await db
    .prepare(
      `DELETE FROM passkeys WHERE id = ? AND user_id = ? AND id <> ?
    AND EXISTS (SELECT 1 FROM passkeys WHERE user_id = ? AND id <> ?) RETURNING id`,
    )
    .bind(id, who.user.id, who.verifiedCredential, who.user.id, id)
    .first()
  if (removed) await db.batch([eventStatement(db, { company: null, user: who.user.id, action: 'auth.key.removed', subject: id })])
  return c.redirect('/auth', 303)
})

async function grantAccess(c: Ctx) {
  const who = c.get('who')
  if (who.user.team !== 'admin') return c.text('Not found', 404)
  if (!verifiedRecently(who, now(), SECURITY.sensitiveSeconds)) return c.redirect('/auth?next=%2Fucto%2Ftim', 303)
  return null
}
securityRoutes.get('/grants', async (c) => {
  const denied = await grantAccess(c)
  if (denied) return denied
  const rows = await c.env.DB.prepare(
    `SELECT g.*, u.email, creator.name AS creator_name, approver.name AS approver_name FROM auth_grants g JOIN users u ON u.id = g.user_id LEFT JOIN users creator ON creator.id = g.created_by LEFT JOIN users approver ON approver.id = g.approved_by
    WHERE g.source = 'admin' AND g.used_at IS NULL AND g.revoked_at IS NULL AND g.expires_at > ? ORDER BY g.created_at DESC LIMIT 100`,
  )
    .bind(now())
    .all<Grant & { email: string; creator_name: string | null; approver_name: string | null }>()
  return c.html(html`<!doctype html>${(<GrantsPage grants={rows.results} actor={c.get('who').user.id} />)}`)
})
securityRoutes.post('/grants', async (c) => {
  const denied = await grantAccess(c)
  if (denied) return denied
  const who = c.get('who'),
    db = c.env.DB,
    body = await c.req.parseBody()
  const email = text(body.email, 200),
    kind = body.kind === 'recover' ? 'recover' : 'enroll',
    evidence = text(body.evidence, 240)
  const target = await db.prepare('SELECT id FROM users WHERE email = ?').bind(email).first<{ id: string }>()
  if (!target || target.id === who.user.id || evidence.length < 12)
    return c.text('Skontrolujte príjemcu a referenciu overenia identity. Vlastný prístup nemožno obnoviť týmto formulárom.', 422)
  if (kind === 'enroll' && (await passkeysOf(db, target.id)).length) return c.text('Účet už má kľúč. Použite schvaľovaný postup obnovy.', 409)
  const token = newToken(),
    id = await sha256Hex(token)
  const inserted = await db
    .prepare(
      `INSERT INTO auth_grants (id, user_id, kind, created_at, created_by, evidence, expires_at)
    SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7 WHERE EXISTS (SELECT 1 FROM users WHERE id = ?5 AND team = 'admin')`,
    )
    .bind(id, target.id, kind, now(), who.user.id, evidence, now() + SECURITY.grantSeconds)
    .run()
  if (!inserted.meta.changes) return c.text('Oprávnenia sa zmenili. Obnovte stránku.', 409)
  await db.batch([
    eventStatement(db, { company: null, user: who.user.id, action: 'auth.grant.created', subject: id, detail: { target: target.id, kind, evidence } }),
  ])
  return c.html(html`<!doctype html>${(<GrantsPage grants={[]} issued={{ token, email, recovery: kind === 'recover' }} />)}`)
})
securityRoutes.post('/grants/:id/approve', async (c) => {
  const denied = await grantAccess(c)
  if (denied) return denied
  const who = c.get('who'),
    id = c.req.param('id'),
    db = c.env.DB
  if (!/^[a-f0-9]{64}$/.test(id)) return c.text('Not found', 404)
  const body = await c.req.parseBody(),
    evidence = text(body.reference, 240)
  if (evidence.length < 12) return c.text('Uveďte vlastnú referenciu nezávislého overenia identity a oprávnenia.', 422)
  const row = await db
    .prepare(
      `UPDATE auth_grants SET approved_by = ?1, approved_at = ?2, approval_evidence = ?3
    WHERE id = ?4 AND kind = 'recover' AND source = 'admin' AND approved_by IS NULL AND created_by <> ?1 AND user_id <> ?1
      AND used_at IS NULL AND revoked_at IS NULL AND expires_at > ?2
      AND EXISTS (SELECT 1 FROM users WHERE id = ?1 AND team = 'admin') RETURNING id`,
    )
    .bind(who.user.id, now(), evidence, id)
    .first()
  if (!row) return c.text('Obnovu musí schváliť iný správca než žiadateľ a príjemca.', 409)
  await db.batch([eventStatement(db, { company: null, user: who.user.id, action: 'auth.grant.approved', subject: id })])
  return c.redirect('/auth/grants', 303)
})
securityRoutes.post('/grants/:id/revoke', async (c) => {
  const denied = await grantAccess(c)
  if (denied) return denied
  const id = c.req.param('id')
  if (/^[a-f0-9]{64}$/.test(id)) {
    const row = await c.env.DB.prepare(
      "UPDATE auth_grants SET revoked_at = ?1 WHERE id = ?2 AND used_at IS NULL AND revoked_at IS NULL AND EXISTS (SELECT 1 FROM users WHERE id = ?3 AND team = 'admin') RETURNING id",
    )
      .bind(now(), id, c.get('who').user.id)
      .first()
    if (row) await c.env.DB.batch([eventStatement(c.env.DB, { company: null, user: c.get('who').user.id, action: 'auth.grant.revoked', subject: id })])
  }
  return c.redirect('/auth/grants', 303)
})
