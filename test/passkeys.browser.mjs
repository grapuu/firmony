// Chrome's virtual CTAP2 authenticator exercises the shipped client bundle and the real Worker together.
import { chromium } from 'playwright'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { createServer } from 'node:http'
import { readFile, mkdir } from 'node:fs/promises'
import { resolve, extname, sep } from 'node:path'
import { randomBytes, createHash } from 'node:crypto'
import { check, done } from './check.mjs'

const assets = resolve('public'),
  dist = resolve('.wrangler/dist')
const bootstrap = randomBytes(32).toString('base64url'),
  now = Math.floor(Date.now() / 1000)
let mf, browser
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, origin)
    if (/\.(?:js|css|woff2|webp|png|svg|ico)$/.test(url.pathname)) {
      const file = resolve(assets, `.${url.pathname}`)
      if (!file.startsWith(`${assets}${sep}`)) {
        res.writeHead(403).end()
        return
      }
      const body = await readFile(file),
        types = {
          '.js': 'text/javascript',
          '.css': 'text/css',
          '.woff2': 'font/woff2',
          '.png': 'image/png',
          '.webp': 'image/webp',
          '.svg': 'image/svg+xml',
        }
      res
        .writeHead(200, {
          'content-type': types[extname(file)] ?? 'application/octet-stream',
        })
        .end(body)
      return
    }
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    const headers = new Headers()
    for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v)
    headers.set('cf-connecting-ip', '127.0.0.1')
    const reply = await mf.dispatchFetch(url.toString(), {
      method: req.method,
      headers,
      body: chunks.length ? Buffer.concat(chunks) : undefined,
      redirect: 'manual',
    })
    const out = {}
    reply.headers.forEach((v, k) => {
      out[k] = v
    })
    res.writeHead(reply.status, out).end(Buffer.from(await reply.arrayBuffer()))
  } catch {
    res.writeHead(500).end('local browser test error')
  }
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const origin = `http://localhost:${server.address().port}`
try {
  mf = new Miniflare(
    convertV4MiniflareOptions({
      cf: false,
      workers: [
        {
          name: 'passkey-browser',
          modulesRoot: dist,
          modules: [{ type: 'ESModule', path: `${dist}/index.js` }],
          compatibilityDate: '2026-10-01',
          d1Databases: { DB: 'passkey-browser' },
          r2Buckets: { FILES: 'passkey-browser' },
          bindings: {
            DEMO: '1',
            TEAM_BOOTSTRAP_EMAIL: 'browser-admin@example.test',
            TEAM_BOOTSTRAP_TOKEN: bootstrap,
            TEAM_BOOTSTRAP_EXPIRES_AT: String(now + 3600),
          },
          outboundService: () => new Response('offline', { status: 599 }),
        },
      ],
    }),
  )
  await mf.dispatchFetch(`${origin}/healthz`)
  const db = await mf.getD1Database('DB')
  await db
    .prepare("INSERT INTO users (id, created_at, email, name, team) VALUES ('browser-admin', ?, 'browser-admin@example.test', 'Prehliadač test', 'admin')")
    .bind(now)
    .run()
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.FIRMONY_CHROME,
    args: ['--no-sandbox'],
  })
  const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
    }),
    page = await context.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.route('**/*', (route) => (new URL(route.request().url()).origin === origin ? route.continue() : route.abort()))
  const cdp = await context.newCDPSession(page)
  await cdp.send('WebAuthn.enable')
  const key = await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  })
  const emailLogin = async () => {
    const token = randomBytes(32).toString('base64url'),
      hash = createHash('sha256').update(token).digest('hex')
    await db
      .prepare("INSERT INTO login_links (id, user_id, created_at, expires_at) VALUES (?, 'browser-admin', ?, ?)")
      .bind(hash, now, now + 600)
      .run()
    await page.goto(`${origin}/app/vstup?t=${token}`)
    await Promise.all([page.waitForURL(/\/auth\?/), page.locator('form[action="/app/vstup"] button[type=submit]').click()])
  }
  await emailLogin()
  check('the browser enters restricted security setup after mailbox proof', new URL(page.url()).pathname === '/auth')
  await page.locator('#key-name').fill('Prvý skúšobný kľúč')
  await page.locator('#key-code').fill(bootstrap)
  await Promise.all([page.waitForURL(`${origin}/ucto`), page.locator('form[data-passkey="register"] button').click()])
  check(
    'the shipped browser bundle enrolls a UV passkey through real WebAuthn',
    (await db.prepare("SELECT COUNT(*) AS n FROM passkeys WHERE user_id = 'browser-admin'").first()).n === 1,
  )
  await page.goto(`${origin}/auth?next=%2Fucto`)
  await page.locator('details.security__setup').evaluate((e) => {
    e.open = true
  })
  await page.locator('#key-name').fill('Záložný skúšobný kľúč')
  // A separate virtual authenticator models a second device.
  await cdp.send('WebAuthn.removeVirtualAuthenticator', {
    authenticatorId: key.authenticatorId,
  })
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  })
  await Promise.all([page.waitForURL(`${origin}/ucto`), page.locator('form[data-passkey="register"] button').click()])
  check(
    'a fresh verified browser can enroll a backup without another activation code',
    (await db.prepare("SELECT COUNT(*) AS n FROM passkeys WHERE user_id = 'browser-admin'").first()).n === 2,
  )
  await page.goto(`${origin}/auth`)
  await page.locator('form[action="/app/odhlasit"] button').click()
  await emailLogin()
  await Promise.all([page.waitForURL(`${origin}/ucto`), page.locator('form[data-passkey="authenticate"] button').click()])
  check(
    'a new browser mailbox session authenticates using the registered backup key',
    (await db.prepare("SELECT COUNT(*) AS n FROM events WHERE user_id = 'browser-admin' AND action = 'auth.verified'").first()).n === 1,
  )
  await db
    .prepare("UPDATE sessions SET verified_at = ? WHERE user_id = 'browser-admin'")
    .bind(now - 301)
    .run()
  await page.goto(`${origin}/ucto/tim`)
  await page.locator('input[name=name]').fill('Dodatočný člen')
  await page.locator('input[name=email]').fill('unverified-change@example.test')
  await page.locator('form[action="/ucto/tim"] button[type=submit]').click()
  check(
    'an expired sensitive confirmation does not replay a posted role change',
    Boolean(await page.locator('[data-auth-error]').count()) &&
      !(await db.prepare("SELECT id FROM users WHERE email = 'unverified-change@example.test'").first()),
  )
  // The rejected POST already has the target URL. Wait for the signed response and the actual work form,
  // so that a URL-only wait cannot succeed before re-verification or cancel the in-flight request.
  const verification = page.waitForResponse((r) => new URL(r.url()).pathname === '/auth/verify' && r.request().method() === 'POST')
  await page.locator('form[data-passkey="authenticate"] button').click()
  const verifiedResponse = await verification
  await page.locator('form[action="/ucto/tim"]').waitFor({ state: 'visible' })
  const fresh = await db.prepare("SELECT COUNT(*) AS n FROM sessions WHERE user_id = 'browser-admin' AND verified_at > ?").bind(Math.floor(Date.now() / 1000) - 30).first()
  check(
    'successful re-verification returns to the safe work page',
    verifiedResponse.status() === 200 && fresh.n === 1 && new URL(page.url()).pathname === '/ucto/tim' && !(await db.prepare("SELECT id FROM users WHERE email = 'unverified-change@example.test'").first()),
  )
  // A real POST-only action used to resume with GET /.../odstranit and strand the user on a 404.
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Bratislava' }).format(new Date())
  await db.batch([
    db.prepare("INSERT INTO companies (id, created_at, name, ico, plan, inbox, accountant_id, start_on, ends_on, notice_side) VALUES ('browser-co', ?, 'Plynulý prechod s. r. o.', '63333333', 'start', 'browserhandover', 'browser-admin', ?, ?, 'firmony')").bind(now, `${today.slice(0, 4)}-01-01`, today),
    db.prepare("INSERT INTO company_files (id, company_id, kind, created_at, created_by, file_name, file_type, file_size, r2_key) VALUES ('browser-paper', 'browser-co', 'handover', ?, 'browser-admin', 'Odovzdanie.pdf', 'application/pdf', 26, 'companies/browser-co/papers/handover.pdf')").bind(now),
  ])
  const bucket = await mf.getR2Bucket('FILES')
  await bucket.put('companies/browser-co/papers/handover.pdf', '%PDF-1.4 browser test only')
  await db.prepare("UPDATE sessions SET verified_at = ? WHERE user_id = 'browser-admin'").bind(Math.floor(Date.now() / 1000) - 301).run()
  const companyPage = `${origin}/ucto/klienti/browser-co`, action = '/ucto/klienti/browser-co/odovzdanie/browser-paper/odstranit'
  await page.goto(`${companyPage}#odovzdanie`)
  await page.locator(`form[action="${action}"] button`).click()
  check('the browser pauses a POST-only attachment action before mutation', Boolean(await page.locator('[data-auth-error]').count()) && (await db.prepare("SELECT deleted_at FROM company_files WHERE id = 'browser-paper'").first()).deleted_at === null)
  const signed = page.waitForResponse((r) => new URL(r.url()).pathname === '/auth/verify' && r.request().method() === 'POST')
  await page.locator('form[data-passkey="authenticate"] button').click()
  await signed
  await page.locator(`form[action="${action}"] button`).waitFor({ state: 'visible' })
  check('a POST-only action resumes on its working company section without replay or 404', page.url() === `${companyPage}#odovzdanie` && (await db.prepare("SELECT deleted_at FROM company_files WHERE id = 'browser-paper'").first()).deleted_at === null)
  await Promise.all([page.waitForURL(`${companyPage}?ok=odstranene#odovzdanie`), page.locator(`form[action="${action}"] button`).click()])
  await page.getByText('Odobratie vyradí prílohu z bežného prehľadu.', { exact: false }).waitFor({ state: 'visible' })
  check('the confirmed repeat retires the attachment once and preserves its original', Boolean((await db.prepare("SELECT deleted_at FROM company_files WHERE id = 'browser-paper'").first()).deleted_at) && Boolean(await bucket.head('companies/browser-co/papers/handover.pdf')) && (await db.prepare("SELECT COUNT(*) AS n FROM events WHERE action = 'handover.removed' AND subject = 'browser-paper'").first()).n === 1)
  check('the passkey client has no uncaught browser errors', errors.length === 0)
  await mkdir('.wrangler/screens', { recursive: true })
  await page.goto(`${origin}/auth?next=%2Fucto`)
  await page.screenshot({
    path: '.wrangler/screens/390-security-browser.png',
    fullPage: true,
  })
  await context.close()
} finally {
  await browser?.close()
  await mf?.dispose()
  await new Promise((r) => server.close(r))
}
done('browser passkeys')
