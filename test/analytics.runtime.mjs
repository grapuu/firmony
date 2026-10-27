// Analytics (26 October 2026), in workerd: the site's visits and the app's requests are counted after the answer,
// the dashboard is the administrator's alone, its downloads need a fresh confirmation and name no person, and a
// counter that cannot be written never breaks a page.
import { check } from './check.mjs'
import { createHash } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { migrationSteps } from '../.wrangler/dist/schema.js'
import { costUsd, dashboardOf, hasInvoicing } from '../.wrangler/dist/stores.js'

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1'
const DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'
const GOOGLEBOT = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'
const today = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Bratislava' }).format(new Date())
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const plainText = (html) => html.replace(/[\u00a0\u202f]/g, ' ')

/** The counters are written after the answer: wait until what a check needs is there (or give up after 4 s). */
async function until(read, ok) {
  let value = await read()
  for (let i = 0; i < 80 && !ok(value); i++) {
    await pause(50)
    value = await read()
  }
  return value
}

export async function checkAnalyticsRuntime({ db, get, as, signIn, nowS, tick, capture }) {
  // The schema: every step before this one unchanged (the 80 of claude/week; once steps 81 and 82 are merged, the pin
  // becomes `slice(0, 82)` with their hash), and this step the last.
  check('analytics: the 80 earlier schema steps are unchanged', createHash('sha256').update(JSON.stringify(migrationSteps.slice(0, 80))).digest('hex') === '2e54ad4468c880713a84b65366c6e0bd7a278e2214fe4858d27bf6b9648b04ed')
  check('analytics: its schema step is step 83', JSON.stringify(migrationSteps[82]).includes('CREATE TABLE IF NOT EXISTS analytics_site') && migrationSteps.filter((s) => JSON.stringify(s).includes('CREATE TABLE IF NOT EXISTS analytics_site')).length === 1)
  check('analytics: the database is at the last step', (await db.prepare("SELECT value FROM meta WHERE key = 'schema'").first()).value === String(migrationSteps.length))

  const d = today()
  const site = (kind, key) => db.prepare('SELECT COALESCE(SUM(n), 0) AS n FROM analytics_site WHERE day = ? AND kind = ? AND key = ?').bind(d, kind, key).first().then((r) => r.n)

  // A visit from a phone, found by Google, from a campaign.
  const before = { page: await site('path', '/cena-uctovnictva'), phone: await site('device', 'phone'), google: await site('referrer', 'google.sk'), campaign: await site('campaign', 'utm_source=test-fb&utm_campaign=jesen') }
  let res = await get('/cena-uctovnictva?utm_source=TEST-fb&utm_campaign=jesen&ico=12345678', { headers: { 'user-agent': IPHONE, referer: 'https://www.google.sk/search?q=uctovnictvo+firmony' } })
  check('analytics: the page answers as before', res.status === 200 && (await res.text()).includes('</html>') && !res.headers.has('set-cookie'))
  const page = await until(() => site('path', '/cena-uctovnictva'), (n) => n === before.page + 1)
  check(
    'analytics: a visit counts its page, device, referring domain and campaign once each',
    page === before.page + 1 && (await site('device', 'phone')) === before.phone + 1 && (await site('referrer', 'google.sk')) === before.google + 1 && (await site('campaign', 'utm_source=test-fb&utm_campaign=jesen')) === before.campaign + 1,
  )
  // A robot, a page not found by its key and a signed-in browser are counted apart, never as a visit.
  const home = await site('path', '/')
  const bot = await site('bot', 'google')
  await get('/', { headers: { 'user-agent': GOOGLEBOT } })
  check('analytics: a robot is counted apart, never as a visit', (await until(() => site('bot', 'google'), (n) => n === bot + 1)) === bot + 1 && (await site('path', '/')) === home)
  const token = 'TESTtoken_' + 'Q'.repeat(33)
  const missing = await site('path', '(404)')
  res = await get(`/objednavka/${token}`, { headers: { 'user-agent': DESKTOP } })
  check('analytics: a link by an unknown key is a page not found, its key kept nowhere', res.status === 404 && (await until(() => site('path', '(404)'), (n) => n === missing + 1)) === missing + 1)
  const stored = (await db.prepare('SELECT kind, key FROM analytics_site').all()).results
  check(
    'analytics: no counter holds a key, an address of a connection, a user agent or a whole referring address',
    stored.length > 0 && !stored.some((r) => /TESTtoken|203\.0\.113|Mozilla|Googlebot|search\?q|12345678/.test(r.key)),
    JSON.stringify(stored.filter((r) => /TESTtoken|203\.0\.113|Mozilla|search/.test(r.key))),
  )

  // A client of its own, and its owner in the app.
  const company = 'co-analytics'
  const owner = 'analytics-owner'
  const email = 'analytics-owner@example.test'
  await db.batch([
    db.prepare("INSERT INTO companies (id, created_at, name, ico, plan, inbox, start_on, contract_at) VALUES (?, ?, 'TEST-ONLY Analytika s. r. o.', '50888876', 'rast', 'analytics', '2027-01-01', ?)").bind(company, nowS, nowS),
    db.prepare("INSERT INTO users (id, created_at, name, email) VALUES (?, ?, 'TEST-ONLY Majiteľ Analytiky', ?)").bind(owner, nowS, email),
    db.prepare("INSERT INTO members (company_id, user_id, role, created_at) VALUES (?, ?, 'owner', ?)").bind(company, owner, nowS),
  ])
  const client = as((await signIn(email)).cookie)
  const route = (method, path) => db.prepare("SELECT * FROM analytics_routes WHERE day = ? AND side = 'client' AND method = ? AND route = ?").bind(d, method, path).first()
  const routeBefore = (await route('GET', '/app/faktury'))?.n ?? 0
  res = await client.get('/app/faktury')
  check('analytics: the client app answers as before', res.status === 200)
  const row = await until(() => route('GET', '/app/faktury'), (r) => (r?.n ?? 0) === routeBefore + 1)
  const hist = row ? Array.from({ length: 9 }, (_, i) => row[`h${i}`]) : []
  check(
    "analytics: an app request counts its route as Hono matched it, its status class and its time",
    Boolean(row) && row.n === routeBefore + 1 && row.s2 >= 1 && row.ms >= 0 && hist.reduce((s, n) => s + n, 0) === row.n && row.s2 + row.s3 + row.s4 + row.s5 === row.n,
    JSON.stringify(row),
  )
  await client.get('/app/faktury/neexistuje')
  const notFound = await until(() => route('GET', '/app/faktury/:id'), (r) => (r?.s4 ?? 0) >= 1)
  check('analytics: a route with a parameter is kept as its pattern, a refusal as 4xx', Boolean(notFound) && notFound.s4 >= 1 && !(await route('GET', '/app/faktury/neexistuje')))
  const usage = await until(
    () => db.prepare("SELECT * FROM analytics_usage WHERE day = ? AND user_id = ? AND company_id = ? AND side = 'client' AND feature = 'faktury'").bind(d, owner, company).first(),
    (r) => (r?.n ?? 0) >= 2,
  )
  check('analytics: the person, the company and the feature used that day are one row', Boolean(usage) && usage.n >= 2 && usage.last_at >= nowS)
  check('analytics: the sign-in pages count as no feature', !(await db.prepare("SELECT 1 FROM analytics_usage WHERE feature IN ('prihlasenie', 'vstup')").first()))

  // The dashboard: the administrator's alone.
  res = await get('/ucto/analytika')
  check('analytics: without a session the dashboard sends to sign in', res.status === 303 && res.headers.get('location') === '/app/prihlasenie')
  res = await client.get('/ucto/analytika')
  check('analytics: a client gets the same "not found" as anywhere on the team side', res.status === 404 && !(await res.text()).includes('Návštevy webu'))
  // People of the team of its own: a sign-in link per address is limited to five an hour, and the suite's
  // administrator and accountant use theirs elsewhere.
  await db.batch([
    db.prepare("INSERT INTO users (id, created_at, name, email, team) VALUES ('analytics-accountant', ?, 'TEST-ONLY Účtovníčka Analytiky', 'analytics-accountant@firmony.test', 'accountant')").bind(nowS),
    db.prepare("INSERT INTO users (id, created_at, name, email, team) VALUES ('analytics-admin', ?, 'TEST-ONLY Správca Analytiky', 'analytics-admin@firmony.test', 'admin')").bind(nowS),
  ])
  const accountant = as((await signIn('analytics-accountant@firmony.test')).cookie)
  res = await accountant.get('/ucto/analytika')
  const accountantPage = await res.text()
  check('analytics: an accountant gets "not found"', res.status === 404 && !accountantPage.includes('Návštevy webu'))
  res = await accountant.get('/ucto/analytika/export.json')
  check('analytics: nor can an accountant download it', res.status === 404 && !(res.headers.get('content-type') ?? '').includes('json'))
  check("analytics: the accountant's menu does not lead there", !(await (await accountant.get('/ucto')).text()).includes('/ucto/analytika'))

  const bossId = 'analytics-admin'
  const boss = as((await signIn('analytics-admin@firmony.test')).cookie)
  res = await boss.get('/ucto/analytika')
  const html = await res.text()
  if (capture) writeFileSync(`${capture}/analytics.html`, html)
  check(
    'analytics: the administrator sees the dashboard with its sections',
    res.status === 200 && ['Návštevy webu', 'Cesta k zmluve', 'Odkiaľ prichádzajú', 'Čo klienti používajú', 'Rýchlosť a chyby', 'Klienti', 'AI tento mesiac', 'Bezplatné nástroje'].every((s) => html.includes(s)),
  )
  check(
    'analytics: it shows what was counted: the page, the referrer, the campaign, the feature and the client with its link',
    html.includes('/cena-uctovnictva') && html.includes('google.sk') && html.includes('test-fb / jesen') && html.includes('Faktúry') && html.includes('TEST-ONLY Analytika s. r. o.') && html.includes(`href="/ucto/klienti/${company}"`) && html.includes('/app/faktury'),
  )
  check('analytics: its lines are server-drawn SVG, nothing inline runs or is styled', html.includes('class="spark"') && !/<script>/.test(html) && !/ style=/i.test(html) && !html.includes(email))
  check('analytics: the administrator\'s menu leads there', html.includes('href="/ucto/analytika"'))
  res = await boss.get('/ucto/analytika?obdobie=7&zoradit=aktivita')
  check('analytics: another period and order answer too', res.status === 200 && (await res.text()).includes('aria-current="page">7 dní'))

  // The downloads: a fresh confirmation by a passkey first.
  await db.prepare('UPDATE sessions SET verified_at = ? WHERE user_id = ?').bind(Math.floor(Date.now() / 1000) - 301, bossId).run()
  res = await boss.get('/ucto/analytika/export.json?obdobie=30')
  check('analytics: the JSON download asks for a fresh confirmation first', res.status === 303 && res.headers.get('location') === `/auth?next=${encodeURIComponent('/ucto/analytika/export.json?obdobie=30')}`)
  res = await boss.get('/ucto/analytika/export.csv')
  check('analytics: so does the CSV', res.status === 303 && (res.headers.get('location') ?? '').startsWith('/auth?next='))
  check('analytics: the page itself stays open with the team\'s confirmation', (await boss.get('/ucto/analytika')).status === 200)
  // Confirmed afresh by the passkey (the confirmation itself is the security suite's): within five minutes again.
  await db.prepare('UPDATE sessions SET verified_at = ? WHERE user_id = ?').bind(Math.floor(Date.now() / 1000), bossId).run()
  res = await boss.get('/ucto/analytika/export.json?obdobie=90')
  const text = await res.text()
  let data = null
  try {
    data = JSON.parse(text)
  } catch {}
  check(
    'analytics: confirmed, the JSON holds the period\'s sums, routes, usage and clients',
    res.status === 200 && (res.headers.get('content-disposition') ?? '').includes('attachment') && data?.format === 'firmony-analytics/1' && data.period.days === 90 &&
      data.site.some((r) => r.key === '/cena-uctovnictva') && data.routes.some((r) => r.route === '/app/faktury' && r.histogram.length === 9) &&
      data.clients.some((c) => c.id === company && c.ico === '50888876' && c.name === 'TEST-ONLY Analytika s. r. o.'),
  )
  const ownerHash = createHash('sha256').update(`firmony-analytics:${owner}`).digest('hex').slice(0, 16)
  check('analytics: people are one-way fingerprints in it, never their id', Boolean(data?.usage.some((u) => u.user === ownerHash && u.company === company)) && !text.includes(owner) && !text.includes(bossId))
  const people = (await db.prepare('SELECT name, email FROM users WHERE team IS NOT NULL OR id = ?').bind(owner).all()).results
  check(
    'analytics: the download names no e-mail, no person and no birth number',
    !text.includes('@') && !people.some((p) => text.includes(p.email) || (p.name && p.name.length > 3 && text.includes(p.name))) && !/\b\d{6}\/\d{3,4}\b/.test(text),
  )
  res = await boss.get('/ucto/analytika/export.csv?obdobie=7')
  const raw = new Uint8Array(await res.arrayBuffer())
  const csv = new TextDecoder().decode(raw)
  check(
    'analytics: the CSV is one long table for Slovak Excel, with no e-mail either',
    res.status === 200 && (res.headers.get('content-type') ?? '').startsWith('text/csv') && raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf &&
      csv.startsWith('section;day;dimension;key;metric;value\r\n') && csv.includes('TEST-ONLY Analytika s. r. o.') && !csv.includes('@'),
    csv.slice(0, 80),
  )
  check('analytics: each download is on record', (await db.prepare("SELECT COUNT(*) AS n FROM events WHERE action = 'analytics.exported' AND user_id = ?").bind(bossId).first()).n === 2)

  // The privacy notice says what is measured and for how long.
  const legal = (await (await get('/pravne-informacie')).text()).replace(/[\u00a0\u202f]/g, ' ')
  check(
    'analytics: the privacy notice says what is measured, that it is first-party and without cookies, and keeps a person\'s rows 13 months',
    legal.includes('id="meranie"') && legal.includes('meriame sami, bez cookies, bez cudzích skriptov') && legal.includes('po 13 mesiacoch') && legal.includes('Platné od 27. októbra 2026'),
  )

  // Invoicing for everyone (claude/week): read tolerantly before its schema is merged, counted only after.
  const ask = () => dashboardOf(db, { period: 30, today: d, admin: { id: bossId } })
  if (!(await hasInvoicing(db))) {
    check('analytics: before invoicing for everyone is deployed, the page says it is not measured yet', (await ask()).invoicing === null && plainText(await (await boss.get('/ucto/analytika')).text()).includes('fakturácia pre všetkých ešte nemeria'))
    // Its column and table as claude/week makes them (schema step 81 there), for this database alone.
    await db.batch([
      db.prepare('ALTER TABLE companies ADD COLUMN invoicing_only INTEGER NOT NULL DEFAULT 0'),
      db.prepare('CREATE TABLE invoicing_signups (id TEXT PRIMARY KEY, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, used_at INTEGER, email TEXT NOT NULL, name TEXT, ico TEXT, company TEXT NOT NULL, address TEXT, register_line TEXT, legal_form TEXT, source TEXT, terms_version TEXT NOT NULL, privacy_version TEXT NOT NULL)'),
    ])
  }
  const was = (await ask()).invoicing
  const at = Math.floor(Date.now() / 1000)
  await db.batch([
    db.prepare("INSERT INTO companies (id, created_at, name, ico, plan, inbox, invoicing_only) VALUES ('ws-analytics', ?, 'TEST-ONLY Priestor faktúr s. r. o.', '50888877', 'start', 'wsanalytics', 1)").bind(at - 100),
    db.prepare("INSERT INTO events (at, company_id, user_id, action, detail) VALUES (?, 'ws-analytics', NULL, 'invoicing.started', ?)").bind(at - 100, JSON.stringify({ terms: 'TEST', source: JSON.stringify({ utm_source: 'TikTok', utm_campaign: 'jesen' }) })),
    db.prepare("INSERT INTO events (at, company_id, action, subject) VALUES (?1, 'ws-analytics', 'invoice.issued', 'i1'), (?1, 'ws-analytics', 'invoice.issued', 'i2'), (?1, ?2, 'invoice.issued', 'i3'), (?1, 'ws-analytics', 'invoice.paid.hand', 'i1')").bind(at - 50, company),
    db.prepare("INSERT INTO events (at, company_id, action, detail) VALUES (?1, 'ws-analytics', 'invoice.ai', '{\"ok\":true,\"in\":1500,\"out\":400}'), (?1, 'ws-analytics', 'invoice.ai', '{\"ok\":false,\"in\":600,\"out\":0}')").bind(at - 40),
    db.prepare("INSERT INTO invoicing_signups (id, created_at, expires_at, email, company, terms_version, privacy_version) VALUES ('signup-analytics', ?, ?, 'test-only-signup@example.test', 'TEST-ONLY Rozpísaná s. r. o.', 'TEST', 'TEST')").bind(at, at + 86400),
    db.prepare("INSERT INTO requests (id, created_at, ico, plan, situation, name, email, privacy_version) VALUES ('req-analytics', ?, '50888877', 'start', 'switch', 'TEST-ONLY Žiadateľ', 'test-only-request@example.test', 'TEST')").bind(at - 10),
  ])
  const now = (await ask()).invoicing
  check(
    'analytics: invoicing for everyone counts workspaces, their activity, unfinished sign-ups and who asked for accounting',
    Boolean(was && now) && now.started.total === was.started.total + 1 && now.active30 === was.active30 + 1 && now.open === was.open + 1 && now.unfinished === was.unfinished + 1 &&
      now.withIco === was.withIco + 1 && now.converted === was.converted + 1 && (now.campaigns.find((c) => c.key === 'utm_source=tiktok&utm_campaign=jesen')?.n ?? 0) === (was.campaigns.find((c) => c.key === 'utm_source=tiktok&utm_campaign=jesen')?.n ?? 0) + 1,
    JSON.stringify({ was, now }),
  )
  check(
    'analytics: invoices of workspaces and of clients apart, paid by hand, and the AI drafts with their tokens and price',
    now.issuedWorkspaces === was.issuedWorkspaces + 2 && now.issuedClients === was.issuedClients + 1 && now.paidByHand === was.paidByHand + 1 &&
      now.ai.uses === was.ai.uses + 2 && now.ai.ok === was.ai.ok + 1 && now.ai.input === was.ai.input + 2100 && now.ai.output === was.ai.output + 400 && Math.abs(now.ai.usd - costUsd(now.ai.input, now.ai.output)) < 1e-12,
  )
  check("analytics: a workspace is no accounting client in the clients' table", !(await ask()).clients.some((c) => c.id === 'ws-analytics'))
  const invoicingRaw = await (await boss.get('/ucto/analytika')).text()
  // The picture for the visual check is this page, with every section holding something.
  if (capture) writeFileSync(`${capture}/analytics.html`, invoicingRaw)
  const invoicingPage = plainText(invoicingRaw)
  check(
    'analytics: the page shows it in sums, with the price list and the day it was read, never a sign-up, a request or an e-mail',
    invoicingPage.includes('Fakturácia pre všetkých') && invoicingPage.includes('Nové pracovné priestory') && invoicingPage.includes('tiktok / jesen') && invoicingPage.includes('prečítaného 26. októbra 2026') &&
      !/test-only-signup|test-only-request|Rozpísaná|Žiadateľ/.test(invoicingPage),
  )

  // A counter that cannot be written breaks no page.
  const tables = ['analytics_site', 'analytics_routes', 'analytics_usage']
  const schema = (await db.prepare(`SELECT type, sql FROM sqlite_master WHERE tbl_name IN (${tables.map(() => '?').join(',')}) AND sql IS NOT NULL ORDER BY type DESC`).bind(...tables).all()).results
  await db.batch(tables.map((t) => db.prepare(`DROP TABLE ${t}`)))
  res = await get('/cena-uctovnictva', { headers: { 'user-agent': IPHONE } })
  const without = await res.text()
  const app = await client.get('/app/faktury')
  await pause(300)
  check('analytics: without its tables the site and the app answer as before', res.status === 200 && without.includes('</html>') && app.status === 200 && (await get('/', { headers: { 'user-agent': DESKTOP } })).status === 200)
  await db.batch(schema.map((s) => db.prepare(s.sql)))
  await get('/cena-uctovnictva', { headers: { 'user-agent': DESKTOP } })
  check('analytics: put back, it counts again', (await until(() => site('path', '/cena-uctovnictva'), (n) => n === 1)) === 1)

  // A person's rows go after 13 months; the daily sums stay two years.
  const sumsDay = new Date(Date.now() - 500 * 86400 * 1000).toISOString().slice(0, 10)
  await db.batch([
    db.prepare("INSERT INTO analytics_usage (day, user_id, company_id, side, feature, n, last_at) VALUES ('2024-01-01', 'old-user', ?, 'client', 'faktury', 3, 1704100000)").bind(company),
    db.prepare("INSERT INTO analytics_usage (day, user_id, company_id, side, feature, n, last_at) VALUES (?, 'recent-user', ?, 'client', 'faktury', 1, ?)").bind(d, company, nowS),
    db.prepare("INSERT INTO analytics_site (day, kind, key, n) VALUES (?, 'path', '/', 5)").bind(sumsDay),
    db.prepare("INSERT INTO analytics_site (day, kind, key, n) VALUES ('2023-01-01', 'path', '/', 7)"),
    db.prepare("INSERT INTO analytics_routes (day, side, method, route, n) VALUES ('2023-01-01', 'client', 'GET', '/app', 7)"),
  ])
  await tick(Date.now())
  const old = await until(() => db.prepare("SELECT COUNT(*) AS n FROM analytics_usage WHERE user_id = 'old-user'").first().then((r) => r.n), (n) => n === 0)
  check(
    "analytics: the schedule deletes a person's rows older than 13 months and keeps the sums and today's rows",
    old === 0 && (await db.prepare("SELECT n FROM analytics_site WHERE day = ? AND kind = 'path' AND key = '/'").bind(sumsDay).first())?.n === 5 && Boolean(await db.prepare("SELECT 1 FROM analytics_usage WHERE user_id = 'recent-user'").first()),
  )
  check(
    'analytics: sums older than two years go',
    !(await db.prepare("SELECT 1 FROM analytics_site WHERE day = '2023-01-01'").first()) && !(await db.prepare("SELECT 1 FROM analytics_routes WHERE day = '2023-01-01'").first()),
  )

  // Anybody may send any referrer or campaign tag: past the day's cap a new one is counted together, and a long one fits.
  const capDay = d
  await db.batch(Array.from({ length: 300 }, (_, i) => db.prepare("INSERT OR IGNORE INTO analytics_site (day, kind, key, n) VALUES (?, 'referrer', ?, 1)").bind(capDay, `cap-${i}.example`)))
  await get('/cena-uctovnictva', { headers: { 'user-agent': DESKTOP, referer: 'https://one-more-new.example/x' } })
  await until(() => site('referrer', '(iné)'), (n) => n === 1)
  check(
    "analytics: a referrer past the day's cap is counted as other, not as a new row",
    (await site('referrer', '(iné)')) === 1 && !(await db.prepare("SELECT 1 FROM analytics_site WHERE kind = 'referrer' AND key = 'one-more-new.example'").first()),
  )
  const long = 'x'.repeat(60)
  await get(`/cena-uctovnictva?utm_source=${long}&utm_medium=${long}&utm_campaign=${long}&ref=${long}`, { headers: { 'user-agent': DESKTOP } })
  check('analytics: four long campaign tags still count the visit', (await until(() => site('path', '/cena-uctovnictva'), (n) => n === 3)) === 3)
}
