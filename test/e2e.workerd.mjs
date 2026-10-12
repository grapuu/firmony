// The bundle that gets deployed, run in the real Workers runtime (workerd) with a local database, the pretend
// email service and the pretend register of test/pretend.mjs. Nothing leaves the machine.
//
//   npx wrangler deploy --dry-run --outdir .wrangler/dist && node --no-warnings test/e2e.workerd.mjs
import { Miniflare, Response as MfResponse, convertV4MiniflareOptions } from 'miniflare'
import { check, done } from './check.mjs'
import { PRETEND_MAIL, registerAnswer } from './pretend.mjs'

const dist = new URL('../.wrangler/dist', import.meta.url).pathname
const lookups = []
const mf = new Miniflare(
  convertV4MiniflareOptions({
    workers: [
      {
        name: 'firmony',
        modulesRoot: dist,
        modules: [{ type: 'ESModule', path: `${dist}/index.js` }],
        compatibilityDate: '2026-10-01',
        d1Databases: { DB: 'firmony-e2e' },
        serviceBindings: { EMAIL: 'pretend-mail' },
        async outboundService(request) {
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
check('health says the schema', (await res.json()).schema === 1)
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

await mf.dispose()
done('runtime')
