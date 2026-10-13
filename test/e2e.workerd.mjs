// The bundle that gets deployed, run in the real Workers runtime (workerd) with a local database, the pretend
// email service and the pretend register of test/pretend.mjs. Nothing leaves the machine.
//
//   npx wrangler deploy --dry-run --outdir .wrangler/dist && node --no-warnings test/e2e.workerd.mjs
import { Miniflare, Response as MfResponse, convertV4MiniflareOptions } from 'miniflare'
import { check, done } from './check.mjs'
import { readFileSync } from 'node:fs'
import { PRETEND_MAIL, pretendBank, readerAnswer, registerAnswer } from './pretend.mjs'

const dist = new URL('../.wrangler/dist', import.meta.url).pathname
const lookups = []
const readings = []
// The bank of Firma A: what it holds is set by the part of the test that reads it.
const bankFeed = { transactions: [], balance: '0.00' }
const bank = pretendBank({ iban: 'SK3112000000198742637541', transactions: () => bankFeed.transactions, balance: () => bankFeed.balance, extraAccount: 'SK7311000000002934567890' })
const mf = new Miniflare(
  convertV4MiniflareOptions({
    unsafeTriggerHandlers: true,
    workers: [
      {
        name: 'firmony',
        modulesRoot: dist,
        modules: [{ type: 'ESModule', path: `${dist}/index.js` }],
        compatibilityDate: '2026-10-01',
        d1Databases: { DB: 'firmony-e2e' },
        r2Buckets: { FILES: 'firmony-e2e-files' },
        bindings: { ANTHROPIC_API_KEY: 'pretend', ENABLE_BANKING_APP: bank.app, ENABLE_BANKING_KEY: bank.privateKey },
        serviceBindings: { EMAIL: 'pretend-mail' },
        async outboundService(request) {
          const banked = await bank.answer(request)
          if (banked) return new MfResponse(await banked.text(), { status: banked.status, headers: { 'content-type': 'application/json' } })
          const read = await readerAnswer(request, readings)
          if (read) return new MfResponse(await read.text(), { status: read.status, headers: { 'content-type': 'application/json' } })
          const answer = registerAnswer(request.url, lookups)
          if (answer) return new MfResponse(await answer.text(), { status: answer.status, headers: { 'content-type': 'application/json' } })
          return new MfResponse('unexpected request', { status: 599 })
        },
      },
      { name: 'pretend-mail', modules: true, compatibilityDate: '2026-10-01', script: PRETEND_MAIL },
    ],
  }),
)

const site = 'https://firmony.ai'
const get = (path, init = {}) => mf.dispatchFetch(`${site}${path}`, { redirect: 'manual', headers: { 'cf-connecting-ip': '203.0.113.7', ...(init.headers ?? {}) } })
function post(path, fields, { ip = '203.0.113.7', origin = site } = {}) {
  const body = new URLSearchParams(fields).toString()
  const headers = { 'content-type': 'application/x-www-form-urlencoded', 'content-length': String(Buffer.byteLength(body)), 'cf-connecting-ip': ip }
  if (origin) headers.origin = origin
  return mf.dispatchFetch(`${site}${path}`, { method: 'POST', body, headers, redirect: 'manual' })
}
const db = await mf.getD1Database('DB')
const mailer = await mf.getWorker('pretend-mail')
const sent = async () => (await mailer.fetch('http://mail/')).json()
const settle = (ms = 300) => new Promise((resolve) => setTimeout(resolve, ms))
const NB = ' '

// The home page
let res = await get('/')
let page = await res.text()
check('the home page answers', res.status === 200)
check('it says the promise', page.includes('Postaráme sa o') && page.includes('Vy rastiete.'))
check('it names the prices of all three plans', [89, 169, 329].every((p) => page.includes(`${p}${NB}€`)))
check('it runs no script at all', !/<script/i.test(page))
check('it carries no inline style', !/ style=/i.test(page))
const csp = res.headers.get('content-security-policy') ?? ''
check('the policy allows nothing inline and nothing foreign', csp.includes("script-src 'none'") && csp.includes("style-src 'self'") && csp.includes("frame-ancestors 'none'"))
check('no framing, no sniffing, HSTS', res.headers.get('x-frame-options') === 'DENY' && res.headers.get('x-content-type-options') === 'nosniff' && /max-age=31536000/.test(res.headers.get('strict-transport-security') ?? ''))
check('the canonical address is the domain', page.includes('<link rel="canonical" href="https://firmony.ai/"'))
check('the real domain is for search engines', res.headers.get('x-robots-tag') === null)
check('the worked example is shown before anything is typed', page.includes(`2${NB}128${NB}€`) && page.includes(`1${NB}317${NB}€`) && page.includes(`811${NB}€`))

// The comparison
res = await get('/?mesacne=100&za-doklad=3&doklady=50&zavierka=200&dph=ano&ludia=1')
page = await res.text()
check('a comparison of typed numbers', page.includes(`3${NB}200${NB}€`) && page.includes('balík Rast') && page.includes(`2${NB}457${NB}€`) && page.includes(`743${NB}€`))
res = await get('/?mesacne=abc')
check('numbers that are none are said to be wrong', (await res.text()).includes('Skontrolujte čísla'))
res = await get('/?mesacne=500&doklady=400')
check('a company beyond the plans gets an offer of its own', (await res.text()).includes('ponuku na mieru'))
res = await get('/?utm_source=refresher&utm_campaign=start%3Cscript%3E&mesacne=60')
page = await res.text()
check('campaign tags travel with the forms, odd ones do not', page.includes('name="utm_source" value="refresher"') && !page.includes('utm_campaign'))

// The request: the IČO
res = await get('/zacat?balik=rast')
page = await res.text()
check('the first step asks for the IČO', res.status === 200 && page.includes('name="ico"') && page.includes('Rast'))
check('a form step is not for search engines', (res.headers.get('x-robots-tag') ?? '').includes('noindex'))
res = await get('/zacat?ico=1234')
check('a short IČO is refused in words', res.status === 422 && (await res.text()).includes('IČO má 8 číslic'))
res = await get('/zacat?ico=12345678')
check('an IČO the register does not know and that fails its check digit', res.status === 422 && (await res.text()).includes('nevyzerá správne'))
res = await get('/zacat?ico=57442452&balik=rast')
page = await res.text()
check('the register fills in the company', res.status === 200 && page.includes('europio s. r. o.') && page.includes('K lesu 2218/39A'))
check('the chosen plan is ticked', /value="rast" checked/.test(page))
check('the source of the data is named', page.includes('CC BY 4.0'))
res = await get('/zacat?ico=12345679')
page = await res.text()
check('an unknown company is typed in by hand', page.includes('nenašli') && page.includes('name="company"'))
res = await get('/zacat?ico=35757442')
page = await res.text()
check('a register that fails asks for the name by hand', page.includes('Register práve neodpovedá') && page.includes('name="company"'))
res = await get('/zacat?nova=1')
check('without a company the form asks how far they are', (await res.text()).includes('Zakladáte firmu'))

// The request: sending it
const good = { ico: '57442452', mode: 'company', plan: 'rast', situation: 'switch', name: 'Jana Nová', email: 'jana@example.sk', phone: '+421 900 123 456', note: 'Výpovedná lehota do konca novembra.', utm_source: 'startitup' }
res = await post('/zacat', good, { origin: 'https://evil.example' })
check('a form from another site is refused', res.status === 403)
res = await post('/zacat', { note: 'x'.repeat(9000) })
check('a form beyond its size is refused', res.status === 413)
res = await post('/zacat', { ...good, email: 'nie-je-email' })
page = await res.text()
check('a wrong email is said at the field', res.status === 422 && page.includes('Skontrolujte, prosím, e-mail.') && page.includes('value="Jana Nová"'))
res = await post('/zacat', { ...good, company: 'Spam s. r. o. www.spam.example', seen: 'Spam' })
check('a request for an s. r. o. the register knows lands on thanks with the contract on its way', res.status === 303 && res.headers.get('location') === '/zacat/hotovo?zmluva=1')
let row = await db.prepare('SELECT * FROM requests ORDER BY created_at DESC LIMIT 1').first()
check('it is kept with the register\'s name, not the typed one', row?.company === 'europio s. r. o.' && row?.company_source === 'register' && row?.plan === 'rast' && row?.ico === '57442452', JSON.stringify(row))
check('it keeps where the visitor came from', row?.source === '{"utm_source":"startitup"}')
await settle()
let mail = await sent()
const owner = mail.find((m) => m.to === 'ahoj@firmony.ai')
const client = mail.find((m) => m.to === 'jana@example.sk')
check('the owner is told everything', Boolean(owner) && owner.text.includes('Jana Nová') && owner.text.includes('+421 900 123 456') && owner.text.includes('Výpovedná lehota') && owner.text.includes('startitup') && !owner.replyTo)
check('the client gets a confirmation that replies to us', Boolean(client) && client.replyTo === 'ahoj@firmony.ai' && client.text.startsWith('Dobrý deň,') && client.text.includes('Firma: europio s. r. o.'))
check('the confirmation repeats nothing a stranger typed', Boolean(client) && !client.text.includes('Výpovedná') && !client.text.includes('spam') && !client.text.includes('Jana'))
check('both messages are marked sent', (await db.prepare('SELECT COUNT(*) AS n FROM outbox WHERE sent_at IS NOT NULL').first())?.n === 2)

res = await post('/zacat', { ...good, web: 'http://bot.example' })
const count = async () => (await db.prepare('SELECT COUNT(*) AS n FROM requests').first())?.n
check('a bot that fills the hidden field is thanked and forgotten', res.status === 303 && (await count()) === 1)

res = await post('/zacat', { mode: 'fresh', plan: 'start', situation: 'fresh', name: 'Peter', email: 'peter@example.sk', company: '' })
check('somebody without a company can ask', res.status === 303 && (await count()) === 2)
res = await post('/zacat', { ...good, ico: '12345679', company: '' })
check('an unknown company needs its name', res.status === 422)
res = await post('/zacat', { ...good, ico: '12345679', company: 'Moja firma s. r. o.' })
row = await db.prepare("SELECT * FROM requests WHERE ico = '12345679'").first()
check('a name typed by hand is kept as typed by hand', res.status === 303 && row?.company === 'Moja firma s. r. o.' && row?.company_source === 'manual')
res = await post('/zacat', { ...good, ico: '12345679', company: 'Moja firma s. r. o.' })
check('a third request from one address still goes through', res.status === 303)
await settle()
mail = await sent()
const third = mail.filter((m) => m.to === 'jana@example.sk')
check('a third request from one address sends no third confirmation', third.length === 2, String(third.length))

// The limits
for (let i = 0; i < 6; i++) await post('/zacat', { ...good, email: `n${i}@example.sk` }, { ip: '198.51.100.9' })
res = await post('/zacat', { ...good, email: 'n7@example.sk' }, { ip: '198.51.100.9' })
check('the seventh request in an hour from one connection waits', res.status === 429 && (await res.text()).includes('veľa žiadostí'))
res = await post('/zacat', { ...good, email: 'other@example.sk' }, { ip: '2001:db8:1:2:aaaa::1' })
check('another connection is not held', res.status === 303)

// The rest
res = await get('/pravne-informacie')
page = await res.text()
check('the legal page names the company and the data authority', res.status === 200 && page.includes('Mestského súdu Košice') && page.includes('Úrad na ochranu osobných údajov'))
res = await get('/robots.txt')
check('robots keeps the form out and names the sitemap', (await res.text()).includes('Disallow: /zacat'))
res = await get('/sitemap.xml')
check('the sitemap lists the pages', (await res.text()).includes('https://firmony.ai/pravne-informacie'))
res = await get('/healthz')
check('health says the schema', (await res.json()).schema === 2)
res = await get('/nic-take')
check('an unknown page is a 404 in words', res.status === 404 && (await res.text()).includes('Táto stránka neexistuje'))
res = await mf.dispatchFetch('http://firmony.ai/cennik?x=1', { redirect: 'manual' })
check('plain http goes to https', res.status === 301 && res.headers.get('location') === 'https://firmony.ai/cennik?x=1')
res = await mf.dispatchFetch('https://www.firmony.ai/', { redirect: 'manual' })
check('www goes to the domain', res.status === 301 && res.headers.get('location') === 'https://firmony.ai/')
res = await get('/pravne-informacie/')
check('a slash at the end goes to the page', res.status === 301 && res.headers.get('location') === 'https://firmony.ai/pravne-informacie')
res = await mf.dispatchFetch('https://firmony.example.workers.dev/', { redirect: 'manual' })
check('a preview address is not for search engines', (res.headers.get('x-robots-tag') ?? '').includes('noindex'))

// The schedule deletes what the privacy notice says is deleted
const old = Math.floor(Date.now() / 1000) - 400 * 86400
await db.prepare("INSERT INTO requests (id, created_at, plan, situation, name, email, privacy_version) VALUES ('old', ?, 'start', 'other', 'Starý', 'old@example.sk', '2026-10-12')").bind(old).run()
const worker = await mf.getWorker('firmony')
await worker.scheduled({ cron: '*/15 * * * *' })
await settle(500)
check('a request older than a year is deleted', (await db.prepare("SELECT COUNT(*) AS n FROM requests WHERE id = 'old'").first())?.n === 0)
check('newer requests stay', (await count()) >= 4)

// ---------------------------------------------------------------------------------------------------------------
// The client's app
// ---------------------------------------------------------------------------------------------------------------

const day = (shift) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Bratislava' }).format(new Date(Date.now() + shift * 86400000))
const nowS = Math.floor(Date.now() / 1000)
await db.batch([
  db.prepare("INSERT INTO companies (id, created_at, name, ico, vat_payer, plan, inbox) VALUES ('co-a', ?, 'Firma A s. r. o.', '57442452', 0, 'start', 'aaaa11'), ('co-b', ?, 'Firma B s. r. o.', '11111111', 0, 'start', 'bbbb22')").bind(nowS, nowS),
  db.prepare("INSERT INTO users (id, created_at, email, name) VALUES ('u-a', ?, 'anna@firma-a.test', 'Anna Malá'), ('u-b', ?, 'boris@firma-b.test', 'Boris Veľký')").bind(nowS, nowS),
  db.prepare("INSERT INTO members (company_id, user_id, role, created_at) VALUES ('co-a', 'u-a', 'owner', ?), ('co-b', 'u-b', 'owner', ?)").bind(nowS, nowS),
  db.prepare("INSERT INTO accounts (id, company_id, iban) VALUES ('acc-a', 'co-a', 'SK3112000000198742637541'), ('acc-b', 'co-b', 'SK0809000000000123123123')"),
  db.prepare("INSERT INTO payments (id, company_id, account_id, created_at, booked_on, amount_cents, party, card, ref) VALUES ('pa-cafe', 'co-a', 'acc-a', ?, ?, -1240, 'KAVIAREN NA ROHU KOSICE', 1, 'a1')").bind(nowS, day(-1)),
  db.prepare("INSERT INTO payments (id, company_id, account_id, created_at, booked_on, amount_cents, party, party_iban, vs, ref) VALUES ('pa-host', 'co-a', 'acc-a', ?, '2026-10-10', -5990, 'Hostingový dom s. r. o.', 'SK8975000000000012345671', '2026118', 'a2')").bind(nowS),
  db.prepare("INSERT INTO payments (id, company_id, account_id, created_at, booked_on, amount_cents, party, ref) VALUES ('pa-fuel', 'co-a', 'acc-a', ?, ?, -6418, 'CERPACIA STANICA', 'a3')").bind(nowS, day(-2)),
  db.prepare("INSERT INTO payments (id, company_id, account_id, created_at, booked_on, amount_cents, party, ref) VALUES ('pb-1', 'co-b', 'acc-b', ?, ?, -1000, 'Obchod', 'b1')").bind(nowS, day(-1)),
  db.prepare("INSERT INTO documents (id, company_id, created_at, source, file_key, file_type, status, kind, party, total_cents) VALUES ('db-1', 'co-b', ?, 'upload', 'companies/co-b/documents/db-1.jpg', 'image/jpeg', 'read', 'receipt', 'Obchod', 1000)").bind(nowS),
])
const files = await mf.getR2Bucket('FILES')
await files.put('companies/co-b/documents/db-1.jpg', new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]))

/** A request of a signed-in browser: its cookie, and a form posted from our own pages. */
let jar = ''
const appGet = (path) => mf.dispatchFetch(`${site}${path}`, { redirect: 'manual', headers: { 'cf-connecting-ip': '203.0.113.20', cookie: jar } })
async function appPost(path, fields, { files: attach, origin = site } = {}) {
  let body
  let type
  if (attach) {
    const form = new FormData()
    for (const [name, value] of Object.entries(fields)) form.append(name, value)
    for (const file of attach) form.append('file', new Blob([file.bytes], { type: file.type ?? 'application/octet-stream' }), file.name)
    const encoded = new Request('https://x/', { method: 'POST', body: form })
    body = new Uint8Array(await encoded.arrayBuffer())
    type = encoded.headers.get('content-type')
  } else {
    body = new URLSearchParams(fields).toString()
    type = 'application/x-www-form-urlencoded'
  }
  const headers = { 'content-type': type, 'content-length': String(body.length ?? Buffer.byteLength(body)), 'cf-connecting-ip': '203.0.113.20', cookie: jar }
  if (origin) headers.origin = origin
  return mf.dispatchFetch(`${site}${path}`, { method: 'POST', body, headers, redirect: 'manual' })
}

res = await appGet('/app')
check('the app sends a stranger to sign in', res.status === 303 && res.headers.get('location') === '/app/prihlasenie')
res = await appGet('/app/ukazka')
check('the sample company does not exist on the live Worker', res.status === 404)
res = await appGet('/app/prihlasenie')
page = await res.text()
check('signing in asks only for an email', res.status === 200 && page.includes('name="email"') && !page.includes('type="password"'))
check('the app is not for search engines and may run its own script', (res.headers.get('x-robots-tag') ?? '').includes('noindex') && (res.headers.get('content-security-policy') ?? '').includes("script-src 'self'"))

const before = (await sent()).length
res = await appPost('/app/prihlasenie', { email: 'nikto@nikde.test' })
check('an address we do not know gets the same answer', res.status === 303 && res.headers.get('location') === '/app/prihlasenie/poslane')
await settle()
check('and no email', (await sent()).length === before)
res = await appPost('/app/prihlasenie', { email: 'nie je email' })
check('what is no email is said so', res.status === 422)
res = await appPost('/app/prihlasenie', { email: 'Anna@Firma-A.test' })
check('a client asks for a link', res.status === 303)
await settle()
const linkMail = (await sent()).filter((m) => m.to === 'anna@firma-a.test').pop()
const link = linkMail?.text.match(/https:\/\/firmony\.ai\/app\/vstup\?t=[A-Za-z0-9_-]{43}/)?.[0]
check('the link goes to the address of the account, on the domain', Boolean(link) && linkMail.replyTo === 'ahoj@firmony.ai')
const token = link ? new URL(link).searchParams.get('t') : ''
check('the database keeps no token in plain', (await db.prepare('SELECT COUNT(*) AS n FROM login_links WHERE id = ?').bind(token).first())?.n === 0)
res = await appGet(`/app/vstup?t=${token}`)
page = await res.text()
check('opening the link asks for one click and uses nothing up', res.status === 200 && page.includes('name="t"') && (await appGet(`/app/vstup?t=${token}`)).status === 200)
res = await appPost('/app/vstup', { t: token })
const cookie = res.headers.get('set-cookie') ?? ''
check('the click signs in', res.status === 303 && res.headers.get('location') === '/app')
check('the cookie is bound to the host, https, unreadable by scripts', /^__Host-firmony=[A-Za-z0-9_-]{43};/.test(cookie) && /HttpOnly/i.test(cookie) && /Secure/i.test(cookie) && /SameSite=Lax/i.test(cookie) && /Path=\//.test(cookie), cookie)
jar = cookie.split(';')[0]
res = await appPost('/app/vstup', { t: token })
check('a link works once', res.status === 410)

res = await appGet('/app')
page = await res.text()
check('the overview says what is missing', res.status === 200 && page.includes('3 platbám chýbajú doklady') && page.includes('Firma A s. r. o.'), page.match(/ptitle__sans">[^<]*/)?.[0])
check('it names the address for forwarding', page.includes('doklady-aaaa11@firmony.ai'))
check('it runs its own script and nothing inline', /<script src="\/inside\.js" defer(="")?><\/script>/.test(page) && !/<script>/.test(page) && !/ style=/i.test(page), page.match(/<script[^>]*>/g)?.join(' '))

// Nobody reaches another company
res = await appGet('/app/platby/pb-1')
check('a payment of another company is not found', res.status === 404)
res = await appGet('/app/doklady/db-1')
check('a document of another company is not found', res.status === 404)
res = await appGet('/app/subory/db-1')
check('a file of another company is not given', res.status === 404)
res = await appPost('/app/platby/pa-cafe/priradit', { doklad: 'db-1' })
check('a document of another company cannot be given to a payment', res.status === 409 && (await db.prepare("SELECT COUNT(*) AS n FROM links WHERE document_id = 'db-1'").first())?.n === 0)
res = await appPost('/app/platby/pb-1/priradit', { doklad: 'db-1' })
check('nor between two things of another company', res.status === 404 || res.status === 409)
check('which leaves them apart', (await db.prepare("SELECT COUNT(*) AS n FROM links WHERE document_id = 'db-1'").first())?.n === 0)
res = await appPost('/app/platby/pb-1/bez-dokladu', { dovod: 'bank' })
check('a payment of another company cannot be changed', (await db.prepare("SELECT exempt FROM payments WHERE id = 'pb-1'").first())?.exempt === null)
res = await appPost('/app/spravy', { sprava: 'ahoj' }, { origin: 'https://evil.example' })
check('a form from another site is refused in the app too', res.status === 403)

// A photo of a receipt, on the documents page: read, and paired with the café by itself
const photo = { name: 'blocek.jpg', type: 'image/jpeg', bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new Array(200).fill(7)]) }
res = await appPost('/app/doklady', {}, { files: [photo] })
check('a photo is taken', res.status === 303 && res.headers.get('location') === '/app/doklady?ok=pridane&n=1')
await settle(600)
let cafeDoc = await db.prepare("SELECT d.*, l.payment_id, l.how FROM documents d LEFT JOIN links l ON l.document_id = d.id WHERE d.company_id = 'co-a' AND d.file_name = 'blocek.jpg'").first()
check('the reader read it', cafeDoc?.status === 'read' && cafeDoc.total_cents === 1240 && cafeDoc.party === 'Kaviareň Na rohu s. r. o.' && cafeDoc.read_by === 'claude-haiku-5-5', JSON.stringify(cafeDoc))
check('and it was paired with the café payment without asking', cafeDoc?.payment_id === 'pa-cafe' && cafeDoc.how === 'auto')
check('the reader was asked with the key, the picture and our tool', readings.length === 1 && readings[0].model === 'claude-haiku-5-5' && readings[0].messages[0].content[0].type === 'image' && readings[0].tool_choice?.name === 'zapis_doklad')
check('the file is kept in the company folder', Boolean(await files.head(cafeDoc?.file_key ?? 'none')) && String(cafeDoc?.file_key).startsWith('companies/co-a/documents/'))
res = await appGet(`/app/subory/${cafeDoc?.id}`)
check('its file is given to its company, as a picture and nothing else', res.status === 200 && res.headers.get('content-type') === 'image/jpeg' && (res.headers.get('content-security-policy') ?? '').includes('sandbox') && res.headers.get('cache-control') === 'private, no-store')
await res.arrayBuffer()
res = await appPost('/app/doklady', {}, { files: [photo] })
page = await res.text()
check('the same file sent again is not kept twice', res.status === 200 && page.includes('už máme') && (await db.prepare("SELECT COUNT(*) AS n FROM documents WHERE company_id = 'co-a' AND file_name = 'blocek.jpg'").first())?.n === 1)
res = await appPost('/app/doklady', {}, { files: [{ name: 'faktura.jpg', type: 'image/jpeg', bytes: new TextEncoder().encode('<html><script>alert(1)</script></html>') }] })
check('a file that only calls itself a photo is refused', res.status === 422 && (await res.text()).includes('nie je fotka'))

// An e-invoice: read by our own code, paired by its symbol and account
res = await appPost('/app/doklady', {}, { files: [{ name: 'faktura.xml', type: 'application/xml', bytes: readFileSync(new URL('./fixtures/ubl-invoice.xml', import.meta.url)) }] })
await settle(400)
const einvoice = await db.prepare("SELECT d.*, l.payment_id FROM documents d LEFT JOIN links l ON l.document_id = d.id WHERE d.file_name = 'faktura.xml'").first()
check('an e-invoice is read without the reader', res.status === 303 && einvoice?.status === 'read' && einvoice.read_by === 'xml' && einvoice.kind === 'invoice_in' && readings.length === 1)
check('and paired with the payment it was paid by', einvoice?.payment_id === 'pa-host')
res = await appGet(`/app/subory/${einvoice?.id}`)
check('an XML file is shown as text, never as a page', res.headers.get('content-type') === 'text/plain; charset=utf-8')
await res.arrayBuffer()

// A photo on a payment's own page belongs to that payment
res = await appPost('/app/platby/pa-fuel/doklad', {}, { files: [{ ...photo, name: 'tankovanie.jpg', bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 9, 9, 9]) }] })
check('a document sent on a payment page', res.status === 303 && res.headers.get('location') === '/app/platby/pa-fuel?ok=priradene')
await settle(600)
res = await appGet('/app/platby/pa-fuel')
page = await res.text()
check('belongs to it, and a different amount is pointed out', page.includes('Doklad k tejto platbe máme') && page.includes('Suma na doklade (12,40'), page.match(/need__title">[^<]*/)?.[0])
res = await appPost(`/app/doklady/${(await db.prepare("SELECT id FROM documents WHERE file_name = 'tankovanie.jpg'").first())?.id}/odpojit`, { spat: '/app/platby/pa-fuel' })
check('a wrong document is taken off again', res.status === 303 && res.headers.get('location') === '/app/platby/pa-fuel?ok=odpojene' && (await db.prepare("SELECT COUNT(*) AS n FROM links WHERE payment_id = 'pa-fuel'").first())?.n === 0)
const tankovanie = (await db.prepare("SELECT id FROM documents WHERE file_name = 'tankovanie.jpg'").first())?.id
res = await appPost('/app/platby/pa-host/priradit', { doklad: cafeDoc?.id ?? '' })
check('a document that belongs to a payment is given to no other', res.status === 409 && (await db.prepare('SELECT payment_id FROM links WHERE document_id = ?').bind(cafeDoc?.id ?? '').first())?.payment_id === 'pa-cafe')
res = await appPost('/app/doklady/x/odpojit', { spat: 'https://evil.example/' })
check('going back never leaves the app', res.headers.get('location') === '/app/doklady/x?ok=odpojene')

// No document needed
res = await appPost('/app/platby/pa-fuel/bez-dokladu', { dovod: 'other', poznamka: '' })
check('"something else" needs a few words', res.status === 422 && (await res.text()).includes('pár slov'))
res = await appPost('/app/platby/pa-fuel/bez-dokladu', { dovod: 'neviem' })
check('a reason that is none is refused', res.status === 422)
res = await appPost('/app/platby/pa-fuel/bez-dokladu', { dovod: 'other', poznamka: 'Bloček sa stratil' })
const fuelRow = await db.prepare("SELECT exempt, exempt_note, exempt_by FROM payments WHERE id = 'pa-fuel'").first()
check('a payment that needs no document', res.status === 303 && fuelRow?.exempt === 'other' && fuelRow.exempt_note === 'Bloček sa stratil' && fuelRow.exempt_by === 'u-a')
res = await appPost('/app/platby/pa-fuel/priradit', { doklad: tankovanie ?? '' })
check('a payment that needs no document takes none', res.status === 409 && (await db.prepare('SELECT COUNT(*) AS n FROM links WHERE document_id = ?').bind(tankovanie ?? '').first())?.n === 0)
res = await appGet('/app')
page = await res.text()
check('with every payment in order the overview says so', page.includes('Všetko máme.') && page.includes('Nemusíte nič robiť.'), page.match(/ptitle__sans">[^<]*/)?.[0])
res = await appPost('/app/platby/pa-fuel/zrusit', {})
check('and it can be undone', (await db.prepare("SELECT exempt FROM payments WHERE id = 'pa-fuel'").first())?.exempt === null)

// The bank's statement
const camtBytes = readFileSync(new URL('./fixtures/camt053.xml', import.meta.url))
res = await appPost('/app/banka', {}, { files: [{ name: 'vypis.xml', type: 'application/xml', bytes: camtBytes }] })
check('a statement adds its payments', res.status === 303 && res.headers.get('location') === '/app/platby?filter=vsetky&ok=vypis&n=7&k=0', res.headers.get('location'))
res = await appPost('/app/banka', {}, { files: [{ name: 'vypis.xml', type: 'application/xml', bytes: camtBytes }] })
check('the same statement again adds nothing', res.headers.get('location') === '/app/platby?filter=vsetky&ok=vypis&n=0&k=7', res.headers.get('location'))
const exempts = (await db.prepare("SELECT exempt, COUNT(*) AS n FROM payments WHERE company_id = 'co-a' AND exempt_by = 'auto' GROUP BY exempt ORDER BY exempt").all()).results
check('the fee of the bank and the tax need no document, by themselves', JSON.stringify(exempts) === JSON.stringify([{ exempt: 'bank', n: 1 }, { exempt: 'state', n: 1 }]), JSON.stringify(exempts))
check('the balance of the account is kept', (await db.prepare("SELECT balance_cents FROM accounts WHERE id = 'acc-a'").first())?.balance_cents === 486163)
res = await appPost('/app/banka', {}, { files: [{ name: 'vypis.xml', type: 'application/xml', bytes: readFileSync(new URL('./fixtures/ubl-invoice.xml', import.meta.url)) }] })
check('a file that is no statement is said to be none', res.status === 422 && (await res.text()).includes('camt.053'))

// A message to the accountant
res = await appPost('/app/spravy', { sprava: '  ' })
check('an empty message is not sent', res.status === 422)
res = await appPost('/app/spravy', { sprava: 'Dobrý deň,\nčo s touto platbou?', platba: 'pa-fuel' })
check('a message is sent', res.status === 303 && res.headers.get('location') === '/app/spravy?ok=poslane#posledna')
await settle()
const toUs = (await sent()).filter((m) => m.to === 'ahoj@firmony.ai' && m.subject.includes('Firma A')).pop()
check('and we are told, with the payment it is about', Boolean(toUs) && toUs.text.includes('čo s touto platbou?') && toUs.text.includes('-64,18'))
res = await appPost('/app/spravy', { sprava: 'Cudzia platba', platba: 'pb-1' })
check('a message cannot point at another company\'s payment', (await db.prepare("SELECT payment_id FROM messages WHERE body = 'Cudzia platba'").first())?.payment_id === null)
res = await appGet('/app/spravy')
page = await res.text()
check('the messages show, with the payment they are about', page.includes('čo s touto platbou?') && /K.platbe: Cerpacia Stanica/.test(page))

// A session that has expired opens nothing
const { createHash } = await import('node:crypto')
const oldToken = 'A'.repeat(43)
await db.prepare("INSERT INTO sessions (id, user_id, company_id, created_at, expires_at) VALUES (?, 'u-a', 'co-a', ?, ?)").bind(createHash('sha256').update(oldToken).digest('hex'), nowS - 40 * 86400, nowS - 10 * 86400).run()
const current = jar
jar = `__Host-firmony=${oldToken}`
res = await appGet('/app')
check('an expired session opens nothing', res.status === 303 && res.headers.get('location') === '/app/prihlasenie')
jar = current

// Signing out ends the session for good
const signedIn = jar
res = await appPost('/app/odhlasit', {})
check('signing out', res.status === 303 && /__Host-firmony=;/.test(res.headers.get('set-cookie') ?? ''))
jar = signedIn
res = await appGet('/app')
check('the old cookie opens nothing', res.status === 303 && res.headers.get('location') === '/app/prihlasenie')
check('every change is on record', (await db.prepare("SELECT COUNT(*) AS n FROM events WHERE company_id = 'co-a'").first())?.n >= 10)


// ---------------------------------------------------------------------------------------------------------------
// The accountants' side
// ---------------------------------------------------------------------------------------------------------------

/** Signs a browser in by the link in its email, from a connection of its own. */
async function signIn(email) {
  const n = (await sent()).length
  await post('/app/prihlasenie', { email }, { ip: '203.0.113.30' })
  await settle()
  const mail = (await sent()).slice(n).filter((m) => m.to.toLowerCase() === email.toLowerCase()).pop()
  const t = mail?.text.match(/\/app\/vstup\?t=([A-Za-z0-9_-]{43})/)?.[1] ?? ''
  const r = await post('/app/vstup', { t }, { ip: '203.0.113.30' })
  return { cookie: (r.headers.get('set-cookie') ?? '').split(';')[0], location: r.headers.get('location'), mail }
}
const as = (cookie) => ({
  get: (path) => mf.dispatchFetch(`${site}${path}`, { redirect: 'manual', headers: { 'cf-connecting-ip': '203.0.113.30', cookie } }),
  async upload(path, file) {
    const form = new FormData()
    form.append('file', new Blob([file.bytes], { type: file.type ?? 'application/octet-stream' }), file.name)
    const encoded = new Request('https://x/', { method: 'POST', body: form })
    const body = new Uint8Array(await encoded.arrayBuffer())
    return mf.dispatchFetch(`${site}${path}`, {
      method: 'POST',
      body,
      redirect: 'manual',
      headers: { 'content-type': encoded.headers.get('content-type'), 'content-length': String(body.length), 'cf-connecting-ip': '203.0.113.30', origin: site, cookie },
    })
  },
  post(path, fields) {
    const body = new URLSearchParams(fields).toString()
    return mf.dispatchFetch(`${site}${path}`, {
      method: 'POST',
      body,
      redirect: 'manual',
      headers: { 'content-type': 'application/x-www-form-urlencoded', 'content-length': String(Buffer.byteLength(body)), 'cf-connecting-ip': '203.0.113.30', origin: site, cookie },
    })
  },
})
const skDay = (d) => `${Number(d.slice(8, 10))}. ${Number(d.slice(5, 7))}. ${d.slice(0, 4)}`

res = await get('/ucto')
check('the team side sends a stranger to sign in', res.status === 303 && res.headers.get('location') === '/app/prihlasenie')
res = await get('/ucto/ukazka')
check('the sample team does not exist on the live Worker', res.status === 404)

// The first administrator: whoever reads the public mailbox, while the team is empty
const boss = await signIn('ahoj@firmony.ai')
const bossRow = await db.prepare("SELECT id, team, name FROM users WHERE email = 'ahoj@firmony.ai'").first()
check('the public mailbox becomes the first administrator', bossRow?.team === 'admin' && bossRow.name === 'Christian Juhás' && boss.location === '/ucto')
const admin = as(boss.cookie)
res = await admin.get('/ucto')
page = await res.text()
check('the administrator sees every client', res.status === 200 && page.includes('Firma A s. r. o.') && page.includes('Firma B s. r. o.'))
check('the team side runs no inline script either', !/<script>/.test(page) && !/ style=/i.test(page) && (res.headers.get('x-robots-tag') ?? '').includes('noindex'))
res = await admin.get('/app')
check('somebody of the team without a company of their own is sent to the team side', res.status === 303 && res.headers.get('location') === '/ucto')

// A client is no one there
const annaCookie = (await signIn('anna@firma-a.test')).cookie
const anna = as(annaCookie)
for (const path of ['/ucto', '/ucto/doklady', '/ucto/klienti/co-a', '/ucto/ziadosti', `/ucto/subory/${cafeDoc?.id}`]) {
  res = await anna.get(path)
  check(`a client gets nothing at ${path.replace(/\/[0-9a-f-]{36}$/, '/…')}`, res.status === 404)
}
res = await anna.post('/ucto/klienti/co-a/spravy', { sprava: 'ja som účtovníčka' })
check('nor can a client answer as the team', res.status === 404 && (await db.prepare("SELECT COUNT(*) AS n FROM messages WHERE body = 'ja som účtovníčka'").first())?.n === 0)

// The administrator adds an accountant and gives her Firma A
res = await admin.post('/ucto/tim', { name: 'Lucia Horváthová', email: 'lucia@firmony.test', rola: 'accountant' })
await settle()
const lucia = await db.prepare("SELECT id, team FROM users WHERE email = 'lucia@firmony.test'").first()
check('an accountant is added and told how to sign in', res.status === 303 && lucia?.team === 'accountant' && (await sent()).some((m) => m.to === 'lucia@firmony.test' && m.text.includes('/app/prihlasenie')))
res = await admin.post('/ucto/klienti/co-a/udaje', { dic: '2121234567', icdph: '', poznamka: 'Chce prehľad do 20.', plan: 'rast', uctovnicka: lucia?.id ?? '' })
const coA = await db.prepare("SELECT accountant_id, dic, plan, note FROM companies WHERE id = 'co-a'").first()
check('a client is given to her', res.status === 303 && coA?.accountant_id === lucia?.id && coA.dic === '2121234567' && coA.plan === 'rast' && coA.note === 'Chce prehľad do 20.')

// The accountant sees her own clients and nothing else
const luc = await signIn('lucia@firmony.test')
const acc = as(luc.cookie)
check('an accountant signs in to the team side', luc.location === '/ucto')
res = await acc.get('/ucto')
page = await res.text()
check('she sees her client and not the others', page.includes('Firma A s. r. o.') && !page.includes('Firma B s. r. o.'))
for (const path of ['/ucto/klienti/co-b', '/ucto/doklady/db-1', '/ucto/subory/db-1', '/ucto/ziadosti', '/ucto/tim', '/ucto/klienti/novy']) {
  res = await acc.get(path)
  check(`an accountant gets nothing at ${path}`, res.status === 404)
}
res = await acc.post('/ucto/platby/pb-1/kontrola', { ok: '1' })
check('nor can she touch a payment of another accountant', res.status === 404)

// Booking: the reader's proposal, an entry, a rule for the supplier
res = await acc.get(`/ucto/doklady/${cafeDoc?.id}`)
page = await res.text()
check('a document waits with the reader\'s proposal and the entry it makes', res.status === 200 && page.includes('Návrh od AI') && page.includes('513') && page.includes('221'), page.match(/entry__table[\s\S]{0,300}/)?.[0])
res = await acc.post(`/ucto/doklady/${cafeDoc?.id}`, { akcia: 'dalsi', kind: 'receipt', category: 'representation', party: 'Kaviareň Na rohu s. r. o.', ico: '50123456', number: '', vs: '', issued: skDay(day(-1)), due: '', total: '12,40', vat: '2,07', account: '', remember: '1' })
const booked = await db.prepare('SELECT booked_at, booked_by, category, vat_deduct, issued_on FROM documents WHERE id = ?').bind(cafeDoc?.id ?? '').first()
check('booked by her, with what she chose', res.status === 303 && Boolean(booked?.booked_at) && booked.booked_by === lucia?.id && booked.category === 'representation' && booked.vat_deduct === 0 && booked.issued_on === day(-1), JSON.stringify(booked))
check('and the supplier is remembered', (await db.prepare("SELECT category FROM supplier_rules WHERE company_id = 'co-a' AND key = 'ico:50123456'").first())?.category === 'representation')
res = await acc.post(`/ucto/doklady/${cafeDoc?.id}`, { akcia: 'ulozit', kind: 'receipt', category: 'representation', party: 'x', total: '12,40', vat: '99,00', issued: '31. 2. 2026' })
page = await res.text()
check('a wrong date or VAT is said, and nothing changes', res.status === 422 && page.includes(`Dátum napíšte v${NB}tvare`) && page.includes('DPH musí byť') && (await db.prepare('SELECT party FROM documents WHERE id = ?').bind(cafeDoc?.id ?? '').first())?.party === 'Kaviareň Na rohu s. r. o.')
res = await anna.post(`/app/doklady/${cafeDoc?.id}/zmazat`, {})
check('a client cannot delete a booked document', (await db.prepare('SELECT deleted_at FROM documents WHERE id = ?').bind(cafeDoc?.id ?? '').first())?.deleted_at === null)

// The same receipt sent again: a suspected duplicate, proposed by the rule, and thrown away
jar = annaCookie
res = await appPost('/app/doklady', {}, { files: [{ name: 'znova.jpg', type: 'image/jpeg', bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 5, 5, 5, 5, 5]) }] })
await settle(600)
const twin = await db.prepare("SELECT d.id, d.duplicate_of, d.proposal, d.category, l.payment_id FROM documents d LEFT JOIN links l ON l.document_id = d.id WHERE d.file_name = 'znova.jpg'").first()
check('the same receipt again is a suspected duplicate, proposed by the rule, and paired with nothing', twin?.duplicate_of === cafeDoc?.id && twin.proposal === 'rule' && twin.category === 'representation' && twin.payment_id === null, JSON.stringify(twin))
res = await acc.get(`/ucto/doklady/${twin?.id}`)
page = await res.text()
check('the accountant is told so, and can open the other one', /Možno ide o.duplikát/.test(page) && page.includes(`/ucto/doklady/${cafeDoc?.id}`) && page.includes('Podľa pravidla'))
res = await acc.post(`/ucto/doklady/${twin?.id}`, { akcia: 'zahodit' })
check('a duplicate is thrown away', res.status === 303 && Boolean((await db.prepare('SELECT deleted_at FROM documents WHERE id = ?').bind(twin?.id ?? '').first())?.deleted_at))
res = await acc.post(`/ucto/doklady/${cafeDoc?.id}`, { akcia: 'zahodit' })
check('a booked document is not thrown away', (await db.prepare('SELECT deleted_at FROM documents WHERE id = ?').bind(cafeDoc?.id ?? '').first())?.deleted_at === null)

// The export for her accounting program
res = await acc.get(`/ucto/klienti/co-a/export?mesiac=${day(-1).slice(0, 7)}`)
const csvBytes = new Uint8Array(await res.arrayBuffer())
const csv = new TextDecoder().decode(csvBytes)
check('booked documents of a month as CSV for Slovak Excel', res.status === 200 && (res.headers.get('content-type') ?? '').startsWith('text/csv') && csvBytes[0] === 0xef && csvBytes[1] === 0xbb && csvBytes[2] === 0xbf && csv.includes('Kaviareň Na rohu s. r. o.;50123456;12,40;2,07;10,33;Reprezentácia;513;221'), csv.split('\r\n')[1])
res = await acc.get('/ucto/klienti/co-b/export')
check('never of a client that is not hers', res.status === 404)

// A payment the client says needs no document: checked, or handed back with a message
await db.prepare("UPDATE payments SET exempt = 'other', exempt_note = 'Bloček sa stratil', exempt_by = 'u-a' WHERE id = 'pa-fuel'").run()
res = await acc.get('/ucto/klienti/co-a')
page = await res.text()
check('she sees what the client marked', page.includes('Bloček sa stratil') && page.includes('Vrátiť klientovi'))
const before2 = (await sent()).length
res = await acc.post('/ucto/platby/pa-fuel/kontrola', { ok: '0' })
await settle()
const back = await db.prepare("SELECT exempt FROM payments WHERE id = 'pa-fuel'").first()
const backMsg = await db.prepare("SELECT body, author, side FROM messages WHERE payment_id = 'pa-fuel' ORDER BY created_at DESC, rowid DESC LIMIT 1").first()
check('handed back, it needs a document again, with a message from her', back?.exempt === null && backMsg?.side === 'firmony' && backMsg.author === lucia?.id && backMsg.body.includes('64,18'))
check('and the client is told by email', (await sent()).slice(before2).some((m) => m.to === 'anna@firma-a.test' && m.subject === 'Firmony: máte novú správu'))

// Messages: what waits for an answer, and the answer
res = await acc.get('/ucto/spravy')
page = await res.text()
check('a client\'s message waits for her', page.includes('Firma A s. r. o.') || page.includes('Všetkým klientom ste odpovedali'))
jar = annaCookie
res = await appPost('/app/spravy', { sprava: 'Bloček naozaj nemám.' })
await settle()
check('a client\'s message now goes to her own accountant', (await sent()).some((m) => m.to === 'lucia@firmony.test' && m.text.includes('Bloček naozaj nemám.') && m.text.includes('/ucto/klienti/co-a#spravy')))
res = await acc.get('/ucto/spravy')
check('and waits in her inbox', (await res.text()).includes('Bloček naozaj nemám.'))
res = await acc.post('/ucto/klienti/co-a/spravy', { sprava: 'Rozumiem, zaúčtujeme ho podľa výpisu.' })
await settle()
res = await acc.get('/ucto/spravy')
check('answered, nothing waits', (await res.text()).includes('Všetkým klientom ste odpovedali'))
jar = annaCookie
res = await appGet('/app/spravy')
check('the client reads the answer under her name', (await res.text()).includes('Lucia Horváthová'))

// A request from the site becomes a client in one form, with a welcome email that signs in
await db.prepare("INSERT INTO requests (id, created_at, ico, company, plan, situation, name, email, privacy_version) VALUES ('req-x', ?, NULL, 'Nová firma s. r. o.', 'rast', 'fresh', 'Peter Nový', 'peter@nova-firma.test', 'v1')").bind(nowS).run()
res = await admin.get('/ucto/ziadosti')
check('the administrator sees the request', (await res.text()).includes('Nová firma s. r. o.'))
res = await admin.get('/ucto/klienti/novy?ziadost=req-x')
page = await res.text()
check('the form starts from the request', page.includes('value="Nová firma s. r. o."') && page.includes('value="peter@nova-firma.test"') && page.includes('value="Peter Nový"'))
res = await acc.post('/ucto/klienti', { name: 'Iná s. r. o.', person: 'Ina', email: 'ina@ina.test', plan: 'start' })
check('an accountant cannot make a client', res.status === 404 && (await db.prepare("SELECT COUNT(*) AS n FROM companies WHERE name = 'Iná s. r. o.'").first())?.n === 0)
res = await admin.post('/ucto/klienti', { ico: '57442452', name: 'Duplicitná', person: 'X Y', email: 'x@y.test', plan: 'start' })
check('a company that is already ours is not made twice', res.status === 422 && /už.u.nás je/.test(await res.text()))
const before3 = (await sent()).length
res = await admin.post('/ucto/klienti', { ico: '', name: 'Nová firma s. r. o.', address: '', person: 'Peter Nový', email: 'peter@nova-firma.test', plan: 'rast', uctovnicka: lucia?.id ?? '', uvitat: '1', ziadost: 'req-x', akcia: 'zalozit' })
await settle()
const made = await db.prepare("SELECT c.id, c.accountant_id, c.plan, c.inbox, m.role FROM companies c JOIN members m ON m.company_id = c.id JOIN users u ON u.id = m.user_id WHERE c.name = 'Nová firma s. r. o.' AND u.email = 'peter@nova-firma.test'").first()
check('the client, the person and the membership are made at once', res.status === 303 && made?.accountant_id === lucia?.id && made.plan === 'rast' && made.role === 'owner' && /^[a-z2-9]{8}$/.test(made.inbox))
check('the request is marked as a client', (await db.prepare("SELECT status FROM requests WHERE id = 'req-x'").first())?.status === 'client')
const welcome = (await sent()).slice(before3).find((m) => m.to === 'peter@nova-firma.test')
const welcomeToken = welcome?.text.match(/\/app\/vstup\?t=([A-Za-z0-9_-]{43})/)?.[1] ?? ''
check('a welcome email with the address for documents', Boolean(welcome) && welcome.subject === 'Vitajte vo Firmony' && welcome.text.includes(`doklady-${made?.inbox}@firmony.ai`))
res = await post('/app/vstup', { t: welcomeToken }, { ip: '203.0.113.31' })
const peter = as((res.headers.get('set-cookie') ?? '').split(';')[0])
check('its link signs the new client in', res.status === 303 && res.headers.get('location') === '/app')
res = await peter.get('/app')
check('into his new company', (await res.text()).includes('Nová firma s. r. o.'))

// A person in two companies switches between them, and only between his own
await db.prepare("INSERT INTO members (company_id, user_id, role, created_at) VALUES ('co-b', 'u-a', 'member', ?)").bind(nowS).run()
res = await anna.get('/app')
page = await res.text()
check('a person in two companies is offered the switch', page.includes('action="/app/firma/prepnut"') && page.includes('Firma B s. r. o.'))
res = await anna.post('/app/firma/prepnut', { firma: 'co-b' })
res = await anna.get('/app')
check('and is in the other one', (await res.text()).includes('Firma B s. r. o.'))
res = await anna.post('/app/firma/prepnut', { firma: made?.id ?? '' })
res = await anna.get('/app/platby')
page = await res.text()
check('never in a company she is no member of: she stays where she was', res.status === 200 && page.includes('Firma B s. r. o.') && !page.includes('Nová firma s. r. o.'))

// The public mailbox makes an administrator only while the team is empty
await db.prepare("UPDATE users SET email = 'christian@europio.test' WHERE id = ?").bind(bossRow?.id ?? '').run()
await post('/app/prihlasenie', { email: 'ahoj@firmony.ai' }, { ip: '203.0.113.32' })
await settle()
check('once a team exists, the public mailbox makes nobody an administrator', (await db.prepare("SELECT COUNT(*) AS n FROM users WHERE email = 'ahoj@firmony.ai'").first())?.n === 0)
await db.prepare("UPDATE users SET email = 'ahoj@firmony.ai' WHERE id = ?").bind(bossRow?.id ?? '').run()
check('the team\'s work is on record', (await db.prepare("SELECT COUNT(*) AS n FROM events WHERE action IN ('document.booked', 'document.discarded', 'exempt.returned', 'message.answered', 'company.created', 'team.added', 'team.bootstrap')").first())?.n >= 7)

// Documents by email: the company's own address
function rawMail({ to, subject = 'Faktúra 2026117', attachments = [] }) {
  const b = 'hranica-1'
  const parts = [`--${b}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nDobrý deň, v prílohe posielame faktúru.\r\n`]
  for (const a of attachments) {
    parts.push(`--${b}\r\nContent-Type: ${a.type}; name="${a.name}"\r\nContent-Disposition: ${a.inline ? 'inline' : 'attachment'}; filename="${a.name}"\r\n${a.inline ? 'Content-ID: <logo@dodavatel>\r\n' : ''}Content-Transfer-Encoding: base64\r\n\r\n${Buffer.from(a.bytes).toString('base64').replace(/.{76}/g, '$&\r\n')}\r\n`)
  }
  return [
    'From: Kvetinárstvo Lúka <faktury@kvety.test>',
    `To: ${to}`,
    `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
    `Message-ID: <${crypto.randomUUID()}@kvety.test>`,
    'Date: Tue, 13 Oct 2026 18:00:00 +0200',
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${b}"`,
    '',
    ...parts,
    `--${b}--`,
    '',
  ].join('\r\n')
}
const sendMail = (to, raw) => mf.dispatchFetch(`http://localhost/cdn-cgi/local/email?from=${encodeURIComponent('faktury@kvety.test')}&to=${encodeURIComponent(to)}`, { method: 'POST', body: raw })
const pdfBytes = new TextEncoder().encode('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n')
const logo = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...new Array(300).fill(3)])
const mailBefore = (await db.prepare("SELECT COUNT(*) AS n FROM documents WHERE company_id = 'co-a'").first())?.n
const readsBefore = readings.length
res = await sendMail('doklady-aaaa11@firmony.ai', rawMail({ to: 'doklady-aaaa11@firmony.ai', attachments: [{ name: 'faktura-2026117.pdf', type: 'application/pdf', bytes: pdfBytes }, { name: 'logo.png', type: 'image/png', bytes: logo, inline: true }] }))
await res.arrayBuffer()
await settle(800)
const mailed = await db.prepare("SELECT source, file_name, file_type, status, added_by FROM documents WHERE company_id = 'co-a' AND source = 'email'").all()
check('an email to the company\'s address brings its PDF in, and not the logo of the signature', res.status === 200 && mailed.results.length === 1 && mailed.results[0].file_name === 'faktura-2026117.pdf' && mailed.results[0].file_type === 'application/pdf' && mailed.results[0].added_by === null, JSON.stringify(mailed.results))
check('and the reader reads it', readings.length === readsBefore + 1 && readings.at(-1)?.messages?.[0]?.content?.[0]?.type === 'document' && mailed.results[0]?.status !== 'reading')
check('the email is on record without its text', (await db.prepare("SELECT sender, subject, files, status FROM inbound_mail WHERE company_id = 'co-a' ORDER BY received_at DESC LIMIT 1").first())?.subject === 'Faktúra 2026117')
res = await sendMail('doklady-aaaa11@firmony.ai', rawMail({ to: 'doklady-aaaa11@firmony.ai', attachments: [{ name: 'faktura-2026117.pdf', type: 'application/pdf', bytes: pdfBytes }] }))
await res.arrayBuffer()
check('the same document by email again is not kept twice', (await db.prepare("SELECT COUNT(*) AS n FROM documents WHERE company_id = 'co-a'").first())?.n === mailBefore + 1)
res = await sendMail('doklady-aaaa11@firmony.ai', rawMail({ to: 'doklady-aaaa11@firmony.ai', subject: 'Odkaz na faktúru' }))
await res.arrayBuffer()
const note = await db.prepare("SELECT body, side, author FROM messages WHERE company_id = 'co-a' ORDER BY created_at DESC, rowid DESC LIMIT 1").first()
check('an email without a document leaves the client a note', note?.side === 'firmony' && note.author === null && note.body.includes('Odkaz na faktúru') && note.body.includes('faktury@kvety.test'))
// A newsletter with a large picture inside its text: no document
{
  const big = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...new Array(20000).fill(5)])
  const raw = [
    'From: Novinky <novinky@kvety.test>',
    'To: doklady-aaaa11@firmony.ai',
    'Subject: Jesenna ponuka',
    `Message-ID: <${crypto.randomUUID()}@kvety.test>`,
    'MIME-Version: 1.0',
    'Content-Type: multipart/related; boundary="rel"',
    '',
    '--rel',
    'Content-Type: text/html; charset=utf-8',
    '',
    '<p>Ponuka <img src="cid:banner@kvety"></p>',
    '--rel',
    'Content-Type: image/png',
    'Content-ID: <banner@kvety>',
    'Content-Disposition: inline; filename="banner.png"',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(big).toString('base64').replace(/.{76}/g, '$&\r\n'),
    '--rel--',
    '',
  ].join('\r\n')
  res = await sendMail('doklady-aaaa11@firmony.ai', raw)
  await res.arrayBuffer()
  check('a picture inside the text of an email is no document', (await db.prepare("SELECT COUNT(*) AS n FROM documents WHERE file_name = 'banner.png'").first())?.n === 0)
}
res = await sendMail('doklady-zzzzzz@firmony.ai', rawMail({ to: 'doklady-zzzzzz@firmony.ai', attachments: [{ name: 'f.pdf', type: 'application/pdf', bytes: pdfBytes }] }))
check('an address nobody has is refused', res.status === 400 && (await res.text()).includes('neexistuje'))
res = await sendMail('doklady-aaaa11@elsewhere.test', rawMail({ to: 'doklady-aaaa11@elsewhere.test', attachments: [{ name: 'f.pdf', type: 'application/pdf', bytes: pdfBytes }] }))
check('so is the right code at another domain', res.status === 400)

// The company and its settings: people, an invitation, reminders
res = await anna.post('/app/firma/prepnut', { firma: 'co-a' })
res = await anna.get('/app/firma')
page = await res.text()
check('the company page shows its details, its address for documents and its people', res.status === 200 && page.includes('doklady-aaaa11@firmony.ai') && page.includes('Anna Malá') && page.includes('action="/app/firma/pozvat"'))
check('and the app can go on the home screen', page.includes('rel="manifest" href="/manifest.webmanifest"') && (res.headers.get('content-security-policy') ?? '').includes("manifest-src 'self'"))
const before4 = (await sent()).length
res = await anna.post('/app/firma/pozvat', { meno: 'Ján Spoločník', email: 'jan@firma-a.test' })
await settle()
const jan = await db.prepare("SELECT u.id, m.role, m.invited_by FROM users u JOIN members m ON m.user_id = u.id AND m.company_id = 'co-a' WHERE u.email = 'jan@firma-a.test'").first()
check('an owner invites a partner', res.status === 303 && jan?.role === 'member' && jan.invited_by === 'u-a')
const invitation = (await sent()).slice(before4).find((m) => m.to === 'jan@firma-a.test')
const invToken = invitation?.text.match(/\/app\/vstup\?t=([A-Za-z0-9_-]{43})/)?.[1] ?? ''
check('who gets an email with a link that lasts days', Boolean(invitation) && invitation.subject.includes('Firma A s. r. o.') && invitation.text.includes('Anna Malá'))
res = await post('/app/vstup', { t: invToken }, { ip: '203.0.113.33' })
const janSession = as((res.headers.get('set-cookie') ?? '').split(';')[0])
check('and is in the company with it', res.status === 303 && (await (await janSession.get('/app')).text()).includes('Firma A s. r. o.'))
res = await anna.post('/app/firma/pozvat', { meno: 'Ján Spoločník', email: 'JAN@firma-a.test' })
check('somebody who is in already is not invited twice', res.status === 409)
res = await janSession.post('/app/firma/pozvat', { meno: 'Cudzí', email: 'cudzi@x.test' })
check('a member who is no owner invites nobody', res.status === 403 && (await db.prepare("SELECT COUNT(*) AS n FROM users WHERE email = 'cudzi@x.test'").first())?.n === 0)
res = await janSession.post('/app/firma/ludia/u-a/odobrat', {})
check('nor removes anybody', res.status === 403 && (await db.prepare("SELECT COUNT(*) AS n FROM members WHERE company_id = 'co-a' AND user_id = 'u-a'").first())?.n === 1)
res = await anna.post('/app/firma/ludia/u-a/odobrat', {})
check('an owner does not remove herself', (await db.prepare("SELECT COUNT(*) AS n FROM members WHERE company_id = 'co-a' AND user_id = 'u-a'").first())?.n === 1)
res = await anna.post(`/app/firma/ludia/${jan?.id}/odobrat`, {})
check('an owner removes a member', res.status === 303 && (await db.prepare("SELECT COUNT(*) AS n FROM members WHERE company_id = 'co-a' AND user_id = ?").bind(jan?.id ?? '').first())?.n === 0)
res = await janSession.get('/app')
check('whose session then opens nothing', res.status === 303 && res.headers.get('location') === '/app/prihlasenie')

// Searching
res = await anna.get(`/app/platby?hladat=${encodeURIComponent('Finančná')}`)
page = await res.text()
check('a search finds a payment by its party, whatever tab was open', page.includes('Finančná správa SR') && !page.includes('Cerpacia Stanica'), page.match(/row__title">[^<]*/g)?.join(' '))
res = await anna.get('/app/platby?hladat=64,18')
check('and by its amount', (await res.text()).includes('Cerpacia Stanica'))
res = await anna.get('/app/doklady?hladat=neexistuje')
check('a search that finds nothing says so', /nič nenašli/.test(await res.text()))

// A new company is shown its first steps
res = await peter.get('/app')
page = await res.text()
check(
  'a new company is shown its first steps, the power of attorney and the bank first',
  page.includes('Začíname') && page.indexOf('href="/app/plna-moc"') > 0 && page.indexOf('href="/app/plna-moc"') < page.indexOf('href="/app/banka#prepojit"') && page.includes('href="/app/firma#doklady-emailom"'),
)
check('a company that is founded is not offered the notice to a former accountant', !page.includes('href="/app/prechod"'))
res = await anna.get('/app')
page = await res.text()
check('a company with payments and documents but no power of attorney is still shown its first steps', page.includes('Začíname') && page.includes('href="/app/plna-moc"'))

// The power of attorney: a paper of the company's own to sign, the signed file back, the accountant's check
res = await anna.get('/app/plna-moc')
page = await res.text()
check(
  'the power of attorney is the company\'s own paper, ready to sign',
  res.status === 200 && page.includes('Plnomocenstvo') && page.includes('Firma A s. r. o.') && page.replace(/\u00a0/g, ' ').includes('IČO 57 442 452') && page.includes('europio s. r. o.') && page.includes('Čakáme na podpis') && page.includes('action="/app/plna-moc"'),
)
res = await anna.upload('/app/plna-moc', { name: 'plna-moc.pdf', type: 'application/pdf', bytes: new TextEncoder().encode('podpisane perom') })
check('a file is taken by what it is, not by its name', res.status === 422 && (await res.text()).includes('nevieme otvoriť'))
const asice = (() => {
  const type = 'application/vnd.etsi.asic-e+zip'
  const head = new Uint8Array(30)
  head.set([0x50, 0x4b, 0x03, 0x04, 0x0a, 0x00])
  const view = new DataView(head.buffer)
  view.setUint32(18, type.length, true)
  view.setUint32(22, type.length, true)
  view.setUint16(26, 8, true)
  return new Uint8Array([...head, ...new TextEncoder().encode(`mimetype${type}`), 0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0])
})()
const beforePoa = (await sent()).length
res = await anna.upload('/app/plna-moc', { name: 'plnomocenstvo.asice', bytes: asice })
check('the container from the eID signer is taken', res.status === 303 && res.headers.get('location') === '/app/plna-moc?ok=plna-moc', res.status)
await settle()
check('and the accountant is told to check it', (await sent()).slice(beforePoa).some((m) => m.to === 'lucia@firmony.test' && m.subject === 'Plná moc od klienta: Firma A s. r. o.' && m.text.includes('/ucto/klienti/co-a#zmluva')))
const poaRow = await db.prepare("SELECT id, file_type, file_name, r2_key, checked_at FROM company_files WHERE company_id = 'co-a' AND kind = 'poa'").first()
check('it is kept as what it is, under the company', poaRow?.file_type === 'application/vnd.etsi.asic-e+zip' && poaRow.file_name === 'plnomocenstvo.asice' && poaRow.r2_key.startsWith('companies/co-a/papers/') && poaRow.checked_at === null)
res = await anna.get(`/app/plna-moc/${poaRow?.id}`)
check('the client downloads it back, never shown as a page', res.status === 200 && (res.headers.get('content-disposition') ?? '').startsWith('attachment') && res.headers.get('content-type') === 'application/octet-stream')
res = await peter.get(`/app/plna-moc/${poaRow?.id}`)
check('another company does not get it', res.status === 404)
res = await anna.get('/app/plna-moc?ok=plna-moc')
check('the page then says that we check it', (await res.text()).includes('Overujeme ju'))
const signedPdf = new Uint8Array([...new TextEncoder().encode('%PDF-1.7\n'), ...new Uint8Array(40_000).fill(32)])
res = await anna.upload('/app/plna-moc', { name: 'plna moc podpisana.pdf', type: 'application/pdf', bytes: signedPdf })
check('a signed PDF of real size arrives too, under a name of ours', res.status === 303 && (await db.prepare("SELECT COUNT(*) AS n FROM company_files WHERE company_id = 'co-a' AND file_name = 'plna moc podpisana.pdf' AND file_type = 'application/pdf'").first())?.n === 1, res.status)
res = await anna.get('/app')
check('a company with its power of attorney, its payments and documents is no longer shown its first steps', !(await res.text()).includes('Začíname'))
res = await acc.get('/ucto')
check('the accountant\'s list says it waits for her', (await res.text()).includes('Plná moc na overenie'))
res = await acc.get('/ucto/klienti/co-a')
page = await res.text()
check('her client\'s page has it with the button to mark it', page.includes(`/ucto/klienti/co-a/plna-moc/${poaRow?.id}/overit`) && page.includes('plnomocenstvo.asice'))
res = await acc.get(`/ucto/klienti/co-a/plna-moc/${poaRow?.id}`)
check('and she opens it', res.status === 200)
res = await admin.post(`/ucto/klienti/co-b/plna-moc/${poaRow?.id}/overit`, {})
check('a paper is checked only under its own company', res.status === 404 && (await db.prepare('SELECT checked_at FROM company_files WHERE id = ?').bind(poaRow?.id ?? '').first())?.checked_at === null)
res = await acc.post(`/ucto/klienti/co-a/plna-moc/${poaRow?.id}/overit`, {})
const poaChecked = await db.prepare('SELECT checked_at, checked_by FROM company_files WHERE id = ?').bind(poaRow?.id ?? '').first()
check('the accountant marks it checked and filed, on record', res.status === 303 && poaChecked?.checked_by === lucia?.id && (await db.prepare("SELECT COUNT(*) AS n FROM events WHERE action = 'poa.checked'").first())?.n === 1)
res = await acc.post(`/ucto/klienti/co-a/plna-moc/${poaRow?.id}/overit`, {})
check('twice is once', (await db.prepare("SELECT COUNT(*) AS n FROM events WHERE action = 'poa.checked'").first())?.n === 1)
res = await anna.get('/app/firma')
page = await res.text()
check('the client sees it on the company\'s page, with the notice for the former accountant', page.includes('Máme ju') && page.includes('href="/app/prechod"'))

// The notice to the former accountant, filled in from what was typed
res = await anna.get(`/app/prechod?komu=${encodeURIComponent('Účtovníctvo Nová s. r. o.')}&od=${encodeURIComponent('1. 3. 2025')}&do=${encodeURIComponent('31. 12. 2026')}`)
page = (await res.text()).replace(/\u00a0/g, ' ')
check('the notice is the company\'s, to whom it was typed, with the days in words', res.status === 200 && page.includes('Firma A s. r. o.') && page.includes('Účtovníctvo Nová s. r. o.') && page.includes('zo dňa 1. marca 2025') && page.includes('ku dňu 31. decembra 2026') && page.includes('odvolávame plnomocenstvo'))
res = await anna.get(`/app/prechod?od=${encodeURIComponent('32. 1. 2025')}`)
check('a day that does not exist is said so', res.status === 422 && (await res.text()).includes(`v${NB}tvare`))

// Reminders: on Monday at nine, and on the 5th before the deadline; never to somebody who turned them off
/** The moment in Bratislava of a day at 9:05, in milliseconds. */
function nineFive(day) {
  for (const utc of [6, 7, 8, 9]) {
    const ms = Date.parse(`${day}T${String(utc).padStart(2, '0')}:05:00Z`)
    const hour = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Bratislava', hour: '2-digit', hourCycle: 'h23' }).format(new Date(ms))
    if (hour === '09') return ms
  }
  throw new Error('no nine o\'clock')
}
const nextWeekday = (from, weekday) => {
  const d = new Date(`${from}T12:00:00Z`)
  do d.setUTCDate(d.getUTCDate() + 1)
  while (d.getUTCDay() !== weekday || d.getUTCDate() === 5)
  return d.toISOString().slice(0, 10)
}
const tick = async (ms) => (await mf.dispatchFetch(`http://localhost/cdn-cgi/local/scheduled?time=${ms}`)).text()
const monday = nextWeekday(day(0), 1)
const before5 = (await sent()).length
await tick(nineFive(monday) + 3 * 3600 * 1000)
await settle(300)
check('nothing is reminded at noon', (await sent()).slice(before5).filter((m) => /chýba doklad|chýbajú doklady/.test(m.subject)).length === 0)
await tick(nineFive(monday))
await settle(500)
const weekly = (await sent()).slice(before5).filter((m) => /chýba doklad|chýbajú doklady/.test(m.subject))
check('on Monday at nine the people of a company with missing documents are reminded', weekly.some((m) => m.to === 'anna@firma-a.test' && m.text.includes('Cerpacia Stanica') && m.text.includes('/app/firma#pripomienky')) && weekly.some((m) => m.to === 'boris@firma-b.test'), weekly.map((m) => m.to).join(' '))
check('a company with nothing missing is not', !weekly.some((m) => m.to === 'peter@nova-firma.test'))
await tick(nineFive(monday))
await settle(300)
check('and only once', (await sent()).slice(before5).filter((m) => /chýba doklad|chýbajú doklady/.test(m.subject)).length === weekly.length)
res = await anna.post('/app/firma/pripomienky', { poslane: '1' })
check('a person turns reminders off', res.status === 303 && (await db.prepare("SELECT reminders FROM users WHERE id = 'u-a'").first())?.reminders === 0)
const [y5, m5] = day(0).slice(0, 7).split('-').map(Number)
const fifth = m5 === 12 ? `${y5 + 1}-01-05` : `${y5}-${String(m5 + 1).padStart(2, '0')}-05`
const before6 = (await sent()).length
await tick(nineFive(fifth))
await settle(500)
const monthly = (await sent()).slice(before6)
check('on the 5th the deadline for a month\'s documents is reminded', monthly.some((m) => m.to === 'boris@firma-b.test' && m.subject.includes('do 10.')), monthly.map((m) => `${m.to}: ${m.subject}`).join(' | '))
check('never to somebody who turned reminders off', !monthly.some((m) => m.to === 'anna@firma-a.test'))

// Invoices: issued in a minute, numbered in a row, sent, paid by themselves
const year = day(0).slice(0, 4)
res = await anna.get('/app/faktury')
check('a company without invoices is shown how to start', res.status === 200 && (await res.text()).includes('Zatiaľ ste nevystavili žiadnu faktúru'))
res = await anna.get('/app/faktury/nova')
page = await res.text()
check('a new invoice starts from today and the company\'s account', page.includes(`value="${skDay(day(0))}"`) && page.includes('SK31 1200 0000 1987 4263 7541'))
res = await anna.post('/app/faktury', { akcia: 'register', ico: '57442452', meno: '', riadky: '3' })
page = await res.text()
check('the customer is filled in from the register', page.includes('value="europio s. r. o."') || page.includes('europio s.'), page.match(/name="meno"[^>]*/)?.[0])
res = await anna.post('/app/faktury', { akcia: 'vystavit', meno: 'europio s. r. o.', riadky: '3', vystavena: skDay(day(0)), dodana: skDay(day(0)), splatna: skDay(day(14)) })
check('an invoice without a line is not issued', res.status === 422 && (await res.text()).includes('aspoň jednu položku'))
const invoiceForm = (extra) => ({ akcia: 'vystavit', ico: '57442452', meno: 'europio s. r. o.', adresa: 'Hlavná 1, 040 01 Košice', email: 'fakturacia@europio.test', vystavena: skDay(day(0)), dodana: skDay(day(0)), splatna: skDay(day(14)), iban: 'SK31 1200 0000 1987 4263 7541', riadky: '3', 'r0-popis': 'Konzultácie', 'r0-mnozstvo': '2', 'r0-jednotka': 'hod', 'r0-cena': '60,00', ...extra })
res = await anna.post('/app/faktury', invoiceForm({ 'r1-popis': 'Zlá', 'r1-cena': 'veľa' }))
check('a line that cannot be read is pointed at', res.status === 422 && /Riadok 2/.test(await res.text()))
res = await anna.post('/app/faktury', invoiceForm({}))
const firstId = res.headers.get('location')?.match(/\/app\/faktury\/([0-9a-f-]{36})/)?.[1]
const first = await db.prepare('SELECT number, seq, status, total_cents, vat_cents, document_id, token FROM invoices WHERE id = ?').bind(firstId ?? '').first()
check('an invoice is issued with the first number of the year', res.status === 303 && first?.number === `${year}0001` && first.status === 'issued' && first.total_cents === 12000 && first.vat_cents === 0, JSON.stringify(first))
const invDoc = await db.prepare('SELECT kind, source, vs, total_cents, invoice_id FROM documents WHERE id = ?').bind(first?.document_id ?? '').first()
check('and is a document of the company at once', invDoc?.kind === 'invoice_out' && invDoc.source === 'issued' && invDoc.vs === `${year}0001` && invDoc.total_cents === 12000 && invDoc.invoice_id === firstId)
res = await anna.get(`/app/faktury/${firstId}`)
page = await res.text()
check('its page is the invoice as paper', page.includes(`${year}0001`) && page.includes('europio s. r. o.') && /nie je platiteľom DPH/.test(page) && page.includes('120,00'))
res = await anna.get(`/app/faktury/${firstId}/xml`)
const ubl = await res.text()
check('its e-invoice is UBL for Peppol', (res.headers.get('content-type') ?? '').startsWith('application/xml') && ubl.includes(`<cbc:ID>${year}0001</cbc:ID>`) && ubl.includes('<cbc:PayableAmount currencyID="EUR">120.00</cbc:PayableAmount>') && ubl.includes('<cbc:ID>O</cbc:ID>') && ubl.includes('billing:3.0'))
res = await get(`/f/${first?.token}`)
page = await res.text()
check('the customer opens it without signing in, and no search engine does', res.status === 200 && page.includes(`${year}0001`) && (res.headers.get('x-robots-tag') ?? '').includes('noindex'))
res = await get(`/f/${first?.token}/xml`)
check('and downloads its e-invoice', res.status === 200 && (await res.text()).includes(`<cbc:ID>${year}0001</cbc:ID>`))
res = await get(`/f/${'x'.repeat(43)}`)
check('a link nobody was given opens nothing', res.status === 404)
const before7 = (await sent()).length
res = await anna.post(`/app/faktury/${firstId}/poslat`, {})
await settle()
const invMail = (await sent()).slice(before7).find((m) => m.to === 'fakturacia@europio.test')
check('sent to the customer, a reply goes to the person who sent it', res.status === 303 && Boolean(invMail) && invMail.replyTo === 'anna@firma-a.test' && invMail.text.includes(`/f/${first?.token}`) && invMail.subject.includes(`${year}0001`))
res = await peter.get(`/app/faktury/${firstId}`)
check('another company never sees it', res.status === 404)
// Paid by itself: the money is on the account with the invoice's number as its symbol
await db.prepare("INSERT INTO payments (id, company_id, account_id, created_at, booked_on, amount_cents, party, vs, ref) VALUES ('pa-inv', 'co-a', 'acc-a', ?, ?, 5000, 'europio s. r. o.', ?, 'inv-2')").bind(nowS, day(0), `${year}0002`).run()
res = await anna.post('/app/faktury', invoiceForm({ 'r0-popis': 'Zálohová konzultácia', 'r0-mnozstvo': '1', 'r0-cena': '50' }))
const secondId = res.headers.get('location')?.match(/\/app\/faktury\/([0-9a-f-]{36})/)?.[1]
await settle(500)
check('the next invoice takes the next number', (await db.prepare('SELECT number FROM invoices WHERE id = ?').bind(secondId ?? '').first())?.number === `${year}0002`)
res = await anna.get(`/app/faktury/${secondId}`)
check('and is paid by itself when its money is on the account', /Zaplatená/.test(await res.text()) && (await db.prepare("SELECT COUNT(*) AS n FROM links WHERE payment_id = 'pa-inv'").first())?.n === 1)
// A draft: no number, changed, thrown away
res = await anna.post('/app/faktury', { akcia: 'koncept', meno: 'Budúci odberateľ', riadky: '3' })
const draftId = res.headers.get('location')?.match(/\/app\/faktury\/([0-9a-f-]{36})/)?.[1]
check('a draft has no number', res.status === 303 && (await db.prepare('SELECT number, status FROM invoices WHERE id = ?').bind(draftId ?? '').first())?.status === 'draft')
res = await anna.get('/app/faktury')
page = await res.text()
check('the list shows what is paid, what waits and the draft', page.includes('Koncept') && /Zaplatená/.test(page) && page.includes('Budúci odberateľ'))
res = await anna.post(`/app/faktury/${draftId}`, { akcia: 'zahodit' })
check('a draft is thrown away', res.status === 303 && (await db.prepare('SELECT COUNT(*) AS n FROM invoices WHERE id = ?').bind(draftId ?? '').first())?.n === 0)
res = await anna.post(`/app/faktury/${firstId}`, { akcia: 'zahodit' })
check('an issued invoice never is', (await db.prepare('SELECT COUNT(*) AS n FROM invoices WHERE id = ?').bind(firstId ?? '').first())?.n === 1)
res = await acc.get(`/ucto/doklady/${first?.document_id}`)
check('the accountant books it with the invoice beside the form', res.status === 200 && (await res.text()).includes('sheet__kind'))
// A draft is issued under its own id, takes the next number, and is never changed after; its link opens nothing before
res = await anna.post('/app/faktury', invoiceForm({ akcia: 'koncept' }))
const laterId = res.headers.get('location')?.match(/\/app\/faktury\/([0-9a-f-]{36})/)?.[1]
const draftToken = (await db.prepare('SELECT token FROM invoices WHERE id = ?').bind(laterId ?? '').first())?.token
res = await get(`/f/${draftToken}`)
check('a draft\'s link opens nothing', res.status === 404)
res = await anna.post(`/app/faktury/${laterId}`, invoiceForm({}))
const issuedDraft = await db.prepare('SELECT number, status, customer_name FROM invoices WHERE id = ?').bind(laterId ?? '').first()
check('a draft is issued under its own id with the next number', res.status === 303 && issuedDraft?.status === 'issued' && issuedDraft.number === `${year}0003`, JSON.stringify(issuedDraft))
res = await anna.post(`/app/faktury/${laterId}`, invoiceForm({ meno: 'Iný odberateľ' }))
check('and is never changed after', res.status === 303 && (await db.prepare('SELECT customer_name FROM invoices WHERE id = ?').bind(laterId ?? '').first())?.customer_name === 'europio s. r. o.')
// The QR code a bank pays from: on an invoice that waits, not on one that is paid
check('the email says the invoice carries a QR code for the bank', invMail.text.includes('QR kód'))
res = await get(`/f/${first?.token}`)
page = await res.text()
check('the customer\'s page carries the QR code a bank pays from', page.includes('class="sheet__qr"') && /<path fill="#000000" d="M4 4h7/.test(page))
const paidToken = (await db.prepare('SELECT token FROM invoices WHERE id = ?').bind(secondId ?? '').first())?.token
res = await get(`/f/${paidToken}`)
page = await res.text()
check('a paid invoice says so to its customer, without a QR code to pay it twice', page.includes('Faktúra je zaplatená') && !page.includes('sheet__qr'))
const before8 = (await sent()).length
res = await anna.post(`/app/faktury/${secondId}/pripomenut`, {})
await settle()
check('a paid invoice is never reminded', res.status === 303 && !(await sent()).slice(before8).some((m) => m.subject.startsWith('Pripomienka')))
// Another invoice like an earlier one, and the customers of earlier invoices
res = await anna.get(`/app/faktury/nova?podla=${firstId}`)
page = await res.text()
check('"Vystaviť podobnú" starts from the customer and the lines of an earlier invoice, dated today', page.includes('value="Konzultácie"') && page.includes('value="fakturacia@europio.test"') && page.includes(`value="${skDay(day(0))}"`))
res = await anna.get('/app/faktury/nova')
page = await res.text()
check('a new invoice offers the customers of earlier ones, each once', (page.match(/class="recent__item"/g) ?? []).length === 1 && page.includes('/app/faktury/nova?odberatel='))
res = await anna.get(`/app/faktury/nova?odberatel=${firstId}`)
page = await res.text()
check('a customer of an earlier invoice comes without its lines', page.includes('value="fakturacia@europio.test"') && !page.includes('value="Konzultácie"'))
res = await peter.get(`/app/faktury/nova?podla=${firstId}`)
check('an invoice of another company starts nothing', res.status === 200 && !(await res.text()).includes('Konzultácie'))
res = await peter.post('/app/faktury', invoiceForm({ email: '' }))
const peterId = res.headers.get('location')?.match(/\/app\/faktury\/([0-9a-f-]{36})/)?.[1]
check('every company numbers its own invoices from one', res.status === 303 && (await db.prepare('SELECT number FROM invoices WHERE id = ?').bind(peterId ?? '').first())?.number === `${year}0001`)
// Issued without the customer's email: sent to one typed beside it, which is kept with it
res = await peter.get(`/app/faktury/${peterId}`)
check('an invoice without the customer\'s email asks for one beside it', (await res.text()).includes('name="email"'))
res = await peter.post(`/app/faktury/${peterId}/poslat`, { email: 'nie-je-email' })
check('an email that is none is refused', res.status === 422 && (await db.prepare('SELECT customer_email FROM invoices WHERE id = ?').bind(peterId ?? '').first())?.customer_email === null)
const before9 = (await sent()).length
res = await peter.post(`/app/faktury/${peterId}/poslat`, { email: 'uctaren@europio.test' })
await settle()
check('a typed email gets the invoice and stays with it', res.status === 303 && (await sent()).slice(before9).some((m) => m.to === 'uctaren@europio.test') && (await db.prepare('SELECT customer_email FROM invoices WHERE id = ?').bind(peterId ?? '').first())?.customer_email === 'uctaren@europio.test')

// The bank by open banking: linked at the bank itself, read by itself, renewed, ended
await anna.post('/app/firma/prepnut', { firma: 'co-a' })
bankFeed.balance = '1234.56'
bankFeed.transactions = [
  // What the statement already brought (the café of yesterday): not brought twice.
  { entry_reference: 'eb-1', transaction_amount: { currency: 'EUR', amount: '12.40' }, credit_debit_indicator: 'DBIT', status: 'BOOK', booking_date: day(-1), remittance_information: ['Platba kartou KAVIAREN NA ROHU KOSICE'], bank_transaction_code: { code: 'CCRD' } },
  // The money for the first invoice, with its number as the symbol.
  { entry_reference: 'eb-2', transaction_amount: { currency: 'EUR', amount: '120.00' }, credit_debit_indicator: 'CRDT', status: 'BOOK', booking_date: day(0), debtor: { name: 'europio s. r. o.' }, debtor_account: { iban: 'SK5202000000004712345670' }, remittance_information: [`/VS${year}0001/SS/KS0308`] },
  { entry_reference: 'eb-3', transaction_amount: { currency: 'EUR', amount: '23.85' }, credit_debit_indicator: 'DBIT', status: 'BOOK', booking_date: day(0), remittance_information: ['Nakup BILLA KOSICE'], merchant_category_code: '5411' },
  // Waiting at the bank: not ours yet.
  { entry_reference: 'eb-4', transaction_amount: { currency: 'EUR', amount: '80.00' }, credit_debit_indicator: 'DBIT', status: 'PDNG', booking_date: day(0), remittance_information: ['Rezervacia'] },
  // Two coffees of one price on one day stay two.
  { entry_reference: 'eb-5', transaction_amount: { currency: 'EUR', amount: '2.50' }, credit_debit_indicator: 'DBIT', status: 'BOOK', booking_date: day(0), remittance_information: ['Platba kartou AUTOMAT KAVA'], bank_transaction_code: { code: 'CCRD' } },
  { entry_reference: 'eb-6', transaction_amount: { currency: 'EUR', amount: '2.50' }, credit_debit_indicator: 'DBIT', status: 'BOOK', booking_date: day(0), remittance_information: ['Platba kartou AUTOMAT KAVA'], bank_transaction_code: { code: 'CCRD' } },
]
// One of the two coffees of today came with a statement before the bank was linked.
await db.prepare("INSERT INTO payments (id, company_id, account_id, created_at, booked_on, amount_cents, party, card, ref) VALUES ('pa-kava', 'co-a', 'acc-a', ?, ?, -250, 'AUTOMAT KAVA', 1, 'a-kava')").bind(nowS, day(0)).run()
res = await anna.get('/app/banka')
page = await res.text()
check('the bank page offers the banks of Slovakia', res.status === 200 && page.includes('Tatra banka') && page.includes('href="/app/banka/pripojit?banka=Tatra%20banka"'))
res = await mf.dispatchFetch(`${site}/app/banka/pripojit?banka=Tatra%20banka`, { redirect: 'manual', headers: { cookie: annaCookie, 'cf-connecting-ip': '203.0.113.30', 'sec-fetch-site': 'cross-site' } })
check('another site cannot send a client off to the bank', res.status === 303 && res.headers.get('location') === '/app/banka')
res = await anna.get('/app/banka/pripojit?banka=Neexistujúca%20banka')
check('a bank that is none leads nowhere', res.status === 303 && res.headers.get('location') === '/app/banka')
// Cancelled at the bank
res = await anna.get('/app/banka/pripojit?banka=Tatra%20banka')
let toBank = new URL(res.headers.get('location') ?? 'https://x.test')
let fromBankPage = new URL(toBank.searchParams.get('spat') ?? 'https://x.test')
res = await anna.get(`/app/banka/navrat?error=access_denied&state=${fromBankPage.searchParams.get('state')}`)
check('cancelled at the bank, nothing is linked and nothing waits', res.headers.get('location') === '/app/banka?chyba=zrusene' && (await db.prepare("SELECT COUNT(*) AS n FROM bank_links WHERE company_id = 'co-a'").first())?.n === 0)
// Linked
res = await anna.get('/app/banka/pripojit?banka=Tatra%20banka')
toBank = new URL(res.headers.get('location') ?? 'https://x.test')
fromBankPage = new URL(toBank.searchParams.get('spat') ?? 'https://x.test')
check('a bank is linked at the bank itself, and comes back to us', res.status === 302 && toBank.origin === 'https://pretend-bank.test' && fromBankPage.origin === site && fromBankPage.pathname === '/app/banka/navrat' && /^[A-Za-z0-9_-]{43}$/.test(fromBankPage.searchParams.get('state') ?? ''))
check('Enable Banking was asked with a token signed by our key', bank.calls.some((c) => c.method === 'POST' && c.path === '/auth'))
res = await peter.get(`${fromBankPage.pathname}${fromBankPage.search}`)
check('nobody else can finish another person\'s link', res.headers.get('location') === '/app/banka?chyba=neplatne')
res = await anna.get(`${fromBankPage.pathname}${fromBankPage.search}`)
await settle(1200)
check('back from the bank, its accounts are the company\'s, the card without an IBAN is not', res.status === 303 && res.headers.get('location') === '/app/banka?ok=banka-pripojena&n=2', res.headers.get('location'))
const bankLink = await db.prepare("SELECT id, status, valid_until, synced_at FROM bank_links WHERE company_id = 'co-a' AND status = 'active'").first()
check('the consent holds for 180 days', Boolean(bankLink) && bankLink.valid_until > nowS + 179 * 86400 && bankLink.valid_until < nowS + 181 * 86400)
res = await anna.get(`${fromBankPage.pathname}${fromBankPage.search}`)
check('the same answer from the bank links nothing twice', res.headers.get('location') === '/app/banka?chyba=neplatne' && (await db.prepare("SELECT COUNT(*) AS n FROM bank_links WHERE company_id = 'co-a'").first())?.n === 1)
const fromBank = (await db.prepare("SELECT ref FROM payments WHERE company_id = 'co-a' AND source = 'bank' ORDER BY ref").all()).results.map((r) => r.ref)
check('the payments are read at once: what is booked, and nothing a statement already brought', JSON.stringify(fromBank) === JSON.stringify(['eb-2', 'eb-3', 'eb-6', 'personal-1']), JSON.stringify(fromBank))
const paidFirst = await db.prepare("SELECT p.vs FROM links l JOIN payments p ON p.id = l.payment_id JOIN invoices i ON i.document_id = l.document_id WHERE i.id = ?").bind(firstId ?? '').first()
check('the money for an invoice marks it paid by itself', paidFirst?.vs === `${year}0001`)
check('the balance is the bank\'s', (await db.prepare("SELECT balance_cents FROM accounts WHERE id = 'acc-a'").first())?.balance_cents === 123456)
res = await anna.get('/app/platby')
page = await res.text()
check('the payments page says the bank is linked', page.includes('Tatra banka je prepojená') && page.includes('Naposledy načítané'))
res = await acc.get('/ucto/klienti/co-a')
check('the accountant sees that the client\'s bank is linked and read', /Tatra banka prepojená, načítané dnes/.test(await res.text()))
// Read now, while the client is there: nothing twice, whatever order the bank gives them in, and the bank is told
// a person is present
bankFeed.transactions.reverse()
const callsBefore = bank.calls.length
res = await anna.post(`/app/banka/${bankLink?.id}/nacitat`, {})
check('read now: nothing twice', res.headers.get('location') === '/app/banka?ok=banka-nic', res.headers.get('location'))
check('and the bank is told who is at the screen, so it does not count among its four', bank.calls.slice(callsBefore).filter((c) => c.path.startsWith('/accounts/')).every((c) => c.present === '203.0.113.30'))
const afterRead = bank.calls.length
res = await peter.post(`/app/banka/${bankLink?.id}/nacitat`, {})
check('another company cannot read it', res.headers.get('location') === '/app/banka' && bank.calls.length === afterRead)
// An account that is not the company's
const personal = await db.prepare("SELECT id FROM accounts WHERE company_id = 'co-a' AND iban = 'SK7311000000002934567890'").first()
res = await anna.post(`/app/banka/ucet/${personal?.id}/odobrat`, {})
check('an account that is not the company\'s goes, with what the bank brought for it', res.headers.get('location') === '/app/banka?ok=ucet-odobraty' && (await db.prepare("SELECT COUNT(*) AS n FROM payments WHERE ref = 'personal-1'").first())?.n === 0 && (await db.prepare("SELECT COUNT(*) AS n FROM accounts WHERE id = ?").bind(personal?.id ?? '').first())?.n === 0)
// The schedule reads a consent every six hours, never more often
let callsNow = bank.calls.length
await tick(Date.now())
await settle(500)
check('the schedule does not read a consent read a moment ago', bank.calls.length === callsNow)
await db.prepare('UPDATE bank_links SET tried_at = ? WHERE id = ?').bind(nowS - 7 * 3600, bankLink?.id ?? '').run()
bankFeed.transactions.push({ entry_reference: 'eb-7', transaction_amount: { currency: 'EUR', amount: '15.00' }, credit_debit_indicator: 'DBIT', status: 'BOOK', booking_date: day(0), creditor: { name: 'Papiernictvo Pero' }, remittance_information: ['Kancelarske potreby'] })
await tick(Date.now())
await settle(800)
check('six hours later it reads it, and what is new arrives', bank.calls.length > callsNow && (await db.prepare("SELECT COUNT(*) AS n FROM payments WHERE ref = 'eb-7'").first())?.n === 1)
// The renewal is asked for ten days before the consent ends
await db.prepare('UPDATE bank_links SET valid_until = ? WHERE id = ?').bind(nowS + 5 * 86400, bankLink?.id ?? '').run()
const before10 = (await sent()).length
await tick(nineFive(day(1)))
await settle(500)
const renewMail = (await sent()).slice(before10).find((m) => m.subject.includes('obnovte prístup k banke'))
check('ten days before it ends, the owner is asked to renew the consent, once', renewMail?.to === 'anna@firma-a.test' && renewMail.text.includes('/app/banka'))
await tick(nineFive(day(2)))
await settle(300)
check('and only once', (await sent()).slice(before10).filter((m) => m.subject.includes('obnovte prístup k banke')).length === 1)
res = await anna.get('/app')
check('the overview says it too', (await res.text()).includes('Obnoviť prístup'))
// A consent the bank says is over
bank.refuse('EXPIRED_SESSION')
await db.prepare('UPDATE bank_links SET tried_at = ? WHERE id = ?').bind(nowS - 7 * 3600, bankLink?.id ?? '').run()
await tick(Date.now())
await settle(500)
check('a consent the bank says is over is marked so', (await db.prepare('SELECT status FROM bank_links WHERE id = ?').bind(bankLink?.id ?? '').first())?.status === 'expired')
res = await anna.get('/app')
page = await res.text()
check('and the overview says the payments stopped, with the way to renew', page.includes('vypršal') && page.includes('href="/app/banka/pripojit?banka=Tatra%20banka"'))
bank.refuse(null)
// Renewed: a new consent takes the accounts over, and the one that ended is no longer shown. Its first read fails
// (the bank is down): it is tried again within a quarter of an hour, not in six.
bank.fail(503)
res = await anna.get('/app/banka/pripojit?banka=Tatra%20banka')
fromBankPage = new URL(new URL(res.headers.get('location') ?? 'https://x.test').searchParams.get('spat') ?? 'https://x.test')
res = await anna.get(`${fromBankPage.pathname}${fromBankPage.search}`)
await settle(800)
bank.fail(null)
const renewed = await db.prepare("SELECT id, error, tried_at, synced_at FROM bank_links WHERE company_id = 'co-a' AND status = 'active'").first()
check('a first read that failed is tried again within a quarter of an hour', renewed?.error?.startsWith('503') && renewed.synced_at === null && renewed.tried_at <= Math.floor(Date.now() / 1000) - 6 * 3600 + 900 && renewed.tried_at > Math.floor(Date.now() / 1000) - 6 * 3600, JSON.stringify(renewed))
check('renewed, the account is read under the new consent', Boolean(renewed) && renewed.id !== bankLink?.id && (await db.prepare("SELECT link_id FROM accounts WHERE id = 'acc-a'").first())?.link_id === renewed.id)
res = await anna.get('/app/banka')
check('and the ended one is not shown any more', !(await res.text()).includes('Prístup vypršal'))
// Unlinked: closed at the bank, the payments stay
const paymentsBefore = (await db.prepare("SELECT COUNT(*) AS n FROM payments WHERE company_id = 'co-a'").first())?.n
res = await anna.post(`/app/banka/${renewed?.id}/odpojit`, {})
check('unlinked, the consent is closed at the bank and its payments stay', res.headers.get('location') === '/app/banka?ok=banka-odpojena' && (await db.prepare('SELECT status FROM bank_links WHERE id = ?').bind(renewed?.id ?? '').first())?.status === 'revoked' && bank.calls.at(-1)?.method === 'DELETE' && (await db.prepare("SELECT COUNT(*) AS n FROM payments WHERE company_id = 'co-a'").first())?.n === paymentsBefore && (await db.prepare("SELECT link_id FROM accounts WHERE id = 'acc-a'").first())?.link_id === null)

// ---------------------------------------------------------------------------------------------------------------
// The order: a request for a company the register knows as an s. r. o. becomes a contract concluded online by a
// director the register names (Zelený dvor s. r. o.: two directors in office, one whose office ended).
// ---------------------------------------------------------------------------------------------------------------

const zeleny = { ico: '55012345', mode: 'company', plan: 'rast', situation: 'switch', name: 'Tomáš Dvorský', email: 'tomas@zelenydvor.test', phone: '', note: '' }
res = await post('/zacat', zeleny, { ip: '198.51.100.20' })
check('a request for an s. r. o. leads to the contract', res.status === 303 && res.headers.get('location') === '/zacat/hotovo?zmluva=1')
res = await get('/zacat/hotovo?zmluva=1')
check('the thanks says the link is in the mailbox', (await res.text()).includes('Pozrite sa do e-mailu'))
await settle()
const orderMail = (await sent()).find((m) => m.to === 'tomas@zelenydvor.test')
const orderLink = orderMail?.text.match(/https:\/\/firmony\.ai(\/objednavka\/[A-Za-z0-9_-]{43})/)?.[1] ?? ''
check('the email carries the link to the contract and the register\'s name', Boolean(orderLink) && orderMail.subject === 'Firmony: zmluva pre Zelený dvor s. r. o.' && orderMail.text.includes('Firma: Zelený dvor s. r. o.'), orderMail?.text)
const orderRow = await db.prepare("SELECT * FROM orders WHERE ico = '55012345'").first()
check('the order keeps a hash of the link and the directors in office', Boolean(orderRow) && !orderLink.includes(orderRow.token) && JSON.parse(orderRow.directors).map((d) => d.name).join('|') === 'Mgr. Lucia Zelená|Tomáš Dvorský', orderRow?.directors)
res = await get(orderLink)
page = await res.text()
check('the order page shows the main points and the directors in office', res.status === 200 && page.includes('Hlavné body zmluvy') && page.includes('Mgr. Lucia Zelená') && page.includes('Tomáš Dvorský') && !page.includes('Peter Starý') && page.includes(`169${NB}€`) && page.includes('vložka č.'))
check('the order page is not for search engines', (res.headers.get('x-robots-tag') ?? '').includes('noindex'))
const months = [...page.matchAll(/name="start" id="start-\d" value="(\d{4}-\d{2}-01)"/g)].map((m) => m[1])
check('six months are offered, the launch the first of them at the earliest', months.length === 6 && months[0] >= '2027-01-01', months.join(' '))
res = await post(orderLink, { plan: 'rast', start: months[0], director: 'Peter Starý', agree: '1' }, { ip: '198.51.100.21' })
check('a director whose office ended cannot conclude it', res.status === 422 && (await res.text()).includes('Vyberte, prosím, konateľa'))
res = await post(orderLink, { plan: 'rast', start: months[0], director: 'Tomáš Dvorský' }, { ip: '198.51.100.21' })
check('without agreeing to the terms nothing is concluded', res.status === 422 && (await res.text()).includes('Bez súhlasu'))
res = await post(orderLink, { plan: 'rast', start: '2026-11-01', director: 'Tomáš Dvorský', agree: '1' }, { ip: '198.51.100.21' })
check('a month before the launch is refused', res.status === 422)
res = await post(orderLink, { plan: 'nieco', start: months[0], director: 'Tomáš Dvorský', agree: '1' }, { ip: '198.51.100.21' })
check('a plan that does not exist is refused', res.status === 422)
check('nothing is created before the contract', (await db.prepare("SELECT COUNT(*) AS n FROM companies WHERE ico = '55012345'").first())?.n === 0)
res = await post(orderLink, { plan: 'rast', start: months[1], director: 'Tomáš Dvorský', agree: '1' }, { origin: 'https://evil.example', ip: '198.51.100.21' })
check('a contract posted from another site is refused', res.status === 403)
res = await post(orderLink, { plan: 'rast', start: months[1], director: 'Tomáš Dvorský', agree: '1' }, { ip: '198.51.100.21' })
const contractCookie = (res.headers.get('set-cookie') ?? '').split(';')[0]
check('the contract is concluded and the browser is signed in', res.status === 303 && res.headers.get('location') === '/app?ok=zmluva' && contractCookie.startsWith('__Host-firmony='), res.headers.get('location'))
const madeCompany = await db.prepare("SELECT * FROM companies WHERE ico = '55012345'").first()
check('the company is created with the contract on it', madeCompany?.name === 'Zelený dvor s. r. o.' && madeCompany?.plan === 'rast' && madeCompany?.vat_payer === 1 && madeCompany?.signed_by === 'Tomáš Dvorský' && madeCompany?.start_on === months[1] && Boolean(madeCompany?.terms_version) && Boolean(madeCompany?.contract_at) && madeCompany?.register_line === 'Obchodný register Mestského súdu Košice, oddiel Sro, vložka č. 58123/V', JSON.stringify(madeCompany))
const madeOwner = await db.prepare('SELECT u.email, u.name, m.role FROM members m JOIN users u ON u.id = m.user_id WHERE m.company_id = ?').bind(madeCompany?.id ?? '').all()
check('the person is its only owner, under the email the link went to', madeOwner.results.length === 1 && madeOwner.results[0].email === 'tomas@zelenydvor.test' && madeOwner.results[0].role === 'owner' && madeOwner.results[0].name === 'Tomáš Dvorský')
const acceptedRow = await db.prepare("SELECT status, price_cents, signed_by, ip_hash, plan FROM orders WHERE ico = '55012345'").first()
check('the order keeps who accepted what at which price, and no address', acceptedRow?.status === 'accepted' && acceptedRow?.price_cents === 16900 && acceptedRow?.plan === 'rast' && /^[0-9a-f]{64}$/.test(acceptedRow?.ip_hash ?? '') && !String(acceptedRow?.ip_hash).includes('198.51'))
check('the request is marked as a client', (await db.prepare("SELECT status FROM requests WHERE ico = '55012345'").first())?.status === 'client')
check('the contract is on record', (await db.prepare("SELECT COUNT(*) AS n FROM events WHERE action = 'contract.accepted' AND company_id = ?").bind(madeCompany?.id ?? '').first())?.n === 1)
await settle()
const contractConfirmation = (await sent()).find((m) => m.to === 'tomas@zelenydvor.test' && m.subject === 'Firmony: zmluva je uzavretá')
check('the confirmation carries the terms in full and a sign-in link', Boolean(contractConfirmation) && contractConfirmation.text.includes('Obchodné podmienky služby Firmony') && contractConfirmation.text.includes('11.4 ') && /\/app\/vstup\?t=[A-Za-z0-9_-]{43}/.test(contractConfirmation.text) && contractConfirmation.text.includes('Uzavrel(a): Tomáš Dvorský'))
check('we are told of the contract', (await sent()).some((m) => m.to === 'ahoj@firmony.ai' && m.subject === 'Nová zmluva: Zelený dvor s. r. o.'))
res = await get('/app?ok=zmluva', { headers: { cookie: contractCookie } })
page = await res.text()
check('the new client lands in the app, welcomed', res.status === 200 && page.includes('Zmluva je uzavretá') && page.includes('Zelený dvor'))
check('with the power of attorney first, and the notice for the former accountant, which the request said', page.includes('Začíname') && page.includes('href="/app/plna-moc"') && page.includes('href="/app/prechod"'))
res = await get('/app/plna-moc', { headers: { cookie: contractCookie } })
page = (await res.text()).replace(/\u00a0/g, ' ')
check(
  'the power of attorney names the director who concluded the contract, and the register',
  page.includes('v mene ktorej koná Tomáš Dvorský, konateľ') && page.includes('zapísaná v Obchodnom registri Mestského súdu Košice, oddiel Sro, vložka č. 58123/V') && page.includes('IČO 55 012 345'),
)
res = await get('/app/firma', { headers: { cookie: contractCookie } })
page = (await res.text()).replace(/\u00a0/g, ' ')
check('the company page says when and by whom the contract was concluded', page.includes('Uzavretá online') && page.includes('Uzavrel(a) Tomáš Dvorský, konateľ') && page.includes('Čakáme na podpis'))
res = await post(orderLink, { plan: 'firma', start: months[2], director: 'Mgr. Lucia Zelená', agree: '1' }, { ip: '198.51.100.21' })
page = await res.text()
check('the same contract cannot be concluded twice', res.status === 200 && page.includes('Zmluva je uzavretá') && (await db.prepare("SELECT COUNT(*) AS n FROM companies WHERE ico = '55012345'").first())?.n === 1 && (await db.prepare("SELECT plan FROM orders WHERE ico = '55012345'").first())?.plan === 'rast')
res = await post('/zacat', { ...zeleny, email: 'iny@zelenydvor.test' }, { ip: '198.51.100.22' })
check('a company that is already a client gets no second contract by email', res.status === 303 && res.headers.get('location') === '/zacat/hotovo')
res = await get('/objednavka/' + 'x'.repeat(43))
check('a link nobody was sent is not found', res.status === 404)
// A link that ran out
await db.prepare("UPDATE orders SET expires_at = 1 WHERE ico = '57442452'").run()
const europioOrderToken = (await sent()).find((m) => m.to === 'jana@example.sk')?.text.match(/\/objednavka\/([A-Za-z0-9_-]{43})/)?.[1] ?? ''
res = await get(`/objednavka/${europioOrderToken}`)
check('a link that ran out says so', res.status === 410 && (await res.text()).includes('Tento odkaz už neplatí'))
res = await get('/podmienky')
page = await res.text()
check('the terms are public, numbered and for search engines', res.status === 200 && page.includes('Obchodné podmienky služby Firmony') && page.includes('id="bod-10-4"') && !(res.headers.get('x-robots-tag') ?? '').includes('noindex'))
res = await get('/sitemap.xml')
check('the sitemap names the terms', (await res.text()).includes('/podmienky'))

await mf.dispose()
done('runtime')
