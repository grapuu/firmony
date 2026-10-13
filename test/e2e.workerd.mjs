// The bundle that gets deployed, run in the real Workers runtime (workerd) with a local database, the pretend
// email service and the pretend register of test/pretend.mjs. Nothing leaves the machine.
//
//   npx wrangler deploy --dry-run --outdir .wrangler/dist && node --no-warnings test/e2e.workerd.mjs
import { Miniflare, Response as MfResponse, convertV4MiniflareOptions } from 'miniflare'
import { check, done } from './check.mjs'
import { readFileSync } from 'node:fs'
import { PRETEND_MAIL, readerAnswer, registerAnswer } from './pretend.mjs'

const dist = new URL('../.wrangler/dist', import.meta.url).pathname
const lookups = []
const readings = []
const mf = new Miniflare(
  convertV4MiniflareOptions({
    workers: [
      {
        name: 'firmony',
        modulesRoot: dist,
        modules: [{ type: 'ESModule', path: `${dist}/index.js` }],
        compatibilityDate: '2026-10-01',
        d1Databases: { DB: 'firmony-e2e' },
        r2Buckets: { FILES: 'firmony-e2e-files' },
        bindings: { ANTHROPIC_API_KEY: 'pretend' },
        serviceBindings: { EMAIL: 'pretend-mail' },
        async outboundService(request) {
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
check('it says the promise', page.includes('Postaráme sa o') && page.includes('Vy rastite.'))
check('it names the prices of all three plans', [69, 129, 249].every((p) => page.includes(`${p}${NB}€`)))
check('it runs no script at all', !/<script/i.test(page))
check('it carries no inline style', !/ style=/i.test(page))
const csp = res.headers.get('content-security-policy') ?? ''
check('the policy allows nothing inline and nothing foreign', csp.includes("script-src 'none'") && csp.includes("style-src 'self'") && csp.includes("frame-ancestors 'none'"))
check('no framing, no sniffing, HSTS', res.headers.get('x-frame-options') === 'DENY' && res.headers.get('x-content-type-options') === 'nosniff' && /max-age=31536000/.test(res.headers.get('strict-transport-security') ?? ''))
check('the canonical address is the domain', page.includes('<link rel="canonical" href="https://firmony.ai/"'))
check('the real domain is for search engines', res.headers.get('x-robots-tag') === null)
check('the worked example is shown before anything is typed', page.includes(`2${NB}440${NB}€`) && page.includes(`977${NB}€`) && page.includes(`1${NB}463${NB}€`))

// The comparison
res = await get('/?mesacne=100&za-doklad=3&doklady=50&zavierka=200&dph=ano&ludia=1')
page = await res.text()
check('a comparison of typed numbers', page.includes(`3${NB}200${NB}€`) && page.includes('balík Rast') && page.includes(`1${NB}697${NB}€`) && page.includes(`1${NB}503${NB}€`))
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
check('a request goes through and lands on thanks', res.status === 303 && res.headers.get('location') === '/zacat/hotovo')
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
check('the overview says what is missing', res.status === 200 && page.includes('3 platbám chýba doklad') && page.includes('Firma A s. r. o.'), page.match(/ptitle__sans">[^<]*/)?.[0])
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
check('belongs to it, and a different amount is pointed out', page.includes('Doklad k tejto platbe máme') && page.includes('Na doklade je 12,40'), page.match(/need__title">[^<]*/)?.[0])
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
check('and we are told, with the payment it is about', Boolean(toUs) && toUs.text.includes('čo s touto platbou?') && toUs.text.includes('-64.18'))
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

await mf.dispose()
done('runtime')
