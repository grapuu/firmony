import { Hono, type Context } from 'hono'
import { html } from 'hono/html'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { compare, readCount, readMoney } from './calc'
import { APP, BRAND, LIMITS, OPERATOR, PRIVACY_VERSION, REPLY_WITHIN, planById } from './config'
import { copy } from './copy'
import { SCHEMA_VERSION, ensureSchema, insertRequestStatement, now, purge, withinLimit } from './db'
import { typeset } from './format'
import { connection, isLocal, later } from './http'
import { formatIco, icoLooksValid, normalizeIco } from './ico'
import { flushOutbox, queueStatement, type Mailer } from './mail'
import { lookupCompany, type Company } from './rpo'
import { appRoutes, appScheduled, xmlResponse, type AppBindings } from './app/routes'
import { invoiceByToken, invoiceLines } from './app/invoices'
import { getCompany } from './app/store'
import { PublicInvoicePage } from './views/invoices'
import { receiveMail } from './app/inbox'
import { teamRoutes } from './team/routes'
import { Home, type CalcState, type Carry } from './views/home'
import { Layout, type PageMeta } from './views/layout'
import { Legal } from './views/legal'
import { NotFound, StartDetails, StartIco, Thanks, type CompanyState, type DetailsErrors, type DetailsValues, type Situation } from './views/start'

export interface Bindings extends AppBindings {
  DB: D1Database
  /** Cloudflare's email service. Without it requests are still kept, and their emails wait in the outbox. */
  EMAIL?: Mailer
}

type Ctx = Context<{ Bindings: Bindings }>

const app = new Hono<{ Bindings: Bindings }>()

// Nothing from other origins and nothing inline: the pages need no script at all.
const CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "style-src 'self'",
  "font-src 'self'",
  "img-src 'self' data:",
  "script-src 'none'",
  "connect-src 'none'",
  "form-action 'self'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
].join('; ')

// The client's app adds one script of its own (public/inside.js: a file is sent as soon as it is picked, a photo
// is made smaller first, a document being read is looked at again), and pictures of the documents it shows.
const APP_CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "style-src 'self'",
  "font-src 'self'",
  "img-src 'self' data: blob:",
  "script-src 'self'",
  "connect-src 'self'",
  "frame-src 'self'",
  "manifest-src 'self'",
  "form-action 'self'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
].join('; ')

/** Where a client's files arrive: a request there may carry up to APP.uploadBytes. */
const UPLOADS = /^\/app\/(doklady|platby\/[^/]+\/doklad|banka)$/

const PERMISSIONS_POLICY = ['accelerometer', 'camera', 'display-capture', 'geolocation', 'gyroscope', 'microphone', 'payment', 'usb', 'browsing-topics']
  .map((feature) => `${feature}=()`)
  .join(', ')

const CANONICAL_HOST = new URL(BRAND.origin).hostname

app.use('*', async (c, next) => {
  const url = new URL(c.req.url)
  const reads = c.req.method === 'GET' || c.req.method === 'HEAD'
  const local = isLocal(url.hostname)
  if (url.protocol === 'http:' && !local) {
    if (!reads) return c.text('Forbidden', 403)
    url.protocol = 'https:'
    url.port = ''
    if (url.hostname === `www.${CANONICAL_HOST}`) url.hostname = CANONICAL_HOST
    return c.redirect(url.toString(), 301)
  }
  if (url.hostname === `www.${CANONICAL_HOST}`) {
    url.hostname = CANONICAL_HOST
    return c.redirect(url.toString(), 301)
  }
  if (reads && url.pathname.length > 1 && (url.pathname.endsWith('/') || url.pathname.includes('//'))) {
    url.pathname = url.pathname.replace(/\/{2,}/g, '/').replace(/(.)\/$/, '$1')
    return c.redirect(url.toString(), 301)
  }
  if (!reads) {
    // A form may only be posted from our own pages, and says how long it is.
    const origin = c.req.header('origin')
    const sameOrigin = origin ? origin === url.origin : c.req.header('sec-fetch-site') === 'same-origin'
    if (!sameOrigin) return c.text('Forbidden', 403)
    const declared = c.req.header('content-length')
    if (declared === undefined) return c.text('Length required', 411)
    const length = Number(declared)
    if (!Number.isInteger(length) || length < 0) return c.text('Bad request', 400)
    if (length > (UPLOADS.test(url.pathname) ? APP.uploadBytes : LIMITS.formBytes)) return c.text('Too large', 413)
  }
  await next()
  const inside = /^\/(app|ucto|f)(\/|$)/.test(url.pathname)
  if (!c.res.headers.has('Content-Security-Policy')) c.header('Content-Security-Policy', inside ? APP_CONTENT_SECURITY_POLICY : CONTENT_SECURITY_POLICY)
  c.header('X-Content-Type-Options', 'nosniff')
  // Only a document's own PDF may be shown inside our pages (beside the booking form); nothing else is framed.
  if (!c.res.headers.has('X-Frame-Options')) c.header('X-Frame-Options', 'DENY')
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin')
  c.header('Cross-Origin-Opener-Policy', 'same-origin')
  c.header('Cross-Origin-Resource-Policy', 'same-origin')
  c.header('Permissions-Policy', PERMISSIONS_POLICY)
  c.header('Content-Language', 'sk')
  // Only the real domain is for search engines: not a preview address, not a form step.
  if ((url.hostname !== CANONICAL_HOST && !local) || url.pathname.startsWith('/zacat') || inside) c.header('X-Robots-Tag', 'noindex, nofollow')
  if (!c.res.headers.has('Cache-Control')) c.header('Cache-Control', 'no-store')
  if (url.protocol === 'https:') c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
})

function page(c: Ctx, meta: PageMeta, node: unknown, status: ContentfulStatusCode = 200) {
  return c.html(html`<!doctype html>${(<Layout meta={meta}>{node as never}</Layout>)}`, status)
}

/** Where a visitor came from: the campaign tags of the address, kept with a request. Nothing else is read. */
const CARRIED = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'ref'] as const
const CARRY_VALUE = /^[\p{L}\p{N}_.\-+]{1,60}$/u

function carryFrom(read: (name: string) => unknown): Carry {
  const out: [string, string][] = []
  for (const name of CARRIED) {
    const value = read(name)
    if (typeof value === 'string' && CARRY_VALUE.test(value)) out.push([name, value])
  }
  return out
}


// ---------------------------------------------------------------------------
// The home page, with the comparison when its form was sent
// ---------------------------------------------------------------------------

const homeMeta: PageMeta = { title: copy.meta.title, description: copy.meta.description, path: '/', ctaHref: '#zacat' }

function calcFrom(c: Ctx): CalcState {
  const q = (name: string) => (c.req.query(name) ?? '').slice(0, 20)
  const values: CalcState['values'] = {
    monthly: q('mesacne'),
    perDoc: q('za-doklad'),
    docs: q('doklady'),
    closing: q('zavierka'),
    vat: c.req.query('dph') === 'ano' ? 'ano' : 'nie',
    people: q('ludia'),
  }
  const sent = ['mesacne', 'za-doklad', 'doklady', 'zavierka', 'ludia'].some((name) => c.req.query(name) !== undefined)
  if (!sent) return { values, result: null, invalid: false }
  const monthly = readMoney(values.monthly)
  const perDoc = readMoney(values.perDoc)
  const docs = readCount(values.docs, 100_000)
  const closing = readMoney(values.closing)
  const people = readCount(values.people, 10_000)
  if (monthly === null || perDoc === null || docs === null || closing === null || people === null) return { values, result: null, invalid: true }
  return { values, result: compare({ monthly, perDoc, docs, closing, vatPayer: values.vat === 'ano', people }), invalid: false }
}

app.get('/', (c) => {
  const carry = carryFrom((name) => c.req.query(name))
  return page(c, homeMeta, <Home carry={carry} calc={calcFrom(c)} />)
})

// ---------------------------------------------------------------------------
// The request: the IČO first, then who they are
// ---------------------------------------------------------------------------

const startMeta: PageMeta = { title: `${copy.start.title} | ${BRAND.name}`, description: copy.meta.description, path: '/zacat', noindex: true }

const emptyValues = (plan: string, situation: Situation): DetailsValues => ({ company: '', plan, situation, name: '', email: '', phone: '', note: '' })

/** Looks the company up, within the limit for one connection. */
async function companyState(c: Ctx, ico: string): Promise<CompanyState> {
  let allowed = true
  try {
    await ensureSchema(c.env.DB)
    allowed = await withinLimit(c.env.DB, 'lookup', connection(c), LIMITS.lookupsPerHour, 3600)
  } catch (err) {
    console.error('lookup limit not read', err instanceof Error ? err.name : 'error')
  }
  if (!allowed) return { kind: 'busy', ico }
  const answer = await lookupCompany(ico)
  if ('failed' in answer) return { kind: 'failed', ico }
  return answer.found ? { kind: 'found', company: answer.found } : { kind: 'missing', ico }
}

app.get('/zacat', async (c) => {
  const carry = carryFrom((name) => c.req.query(name))
  const plan = planById(c.req.query('balik'))?.id ?? ''
  if (c.req.query('nova') === '1') {
    return page(c, startMeta, <StartDetails carry={carry} state={{ kind: 'fresh' }} ico="" values={emptyValues(plan, 'fresh')} errors={{}} />)
  }
  const typed = c.req.query('ico')
  if (typed === undefined || typed.trim() === '') return page(c, startMeta, <StartIco carry={carry} plan={plan} />)
  const ico = normalizeIco(typed)
  if (!ico) return page(c, startMeta, <StartIco carry={carry} plan={plan} value={typed.slice(0, 20)} error={copy.start.badIco} />, 422)
  const state = await companyState(c, ico)
  if (state.kind === 'missing' && !icoLooksValid(ico)) {
    return page(c, startMeta, <StartIco carry={carry} plan={plan} value={formatIco(ico)} error={copy.start.wrongIco} />, 422)
  }
  return page(c, startMeta, <StartDetails carry={carry} state={state} ico={ico} values={emptyValues(plan, 'switch')} errors={{}} />)
})

const EMAIL = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)*\.[A-Za-z]{2,}$/
const PHONE = /^\+?[0-9 ()/.-]{6,24}$/
const SITUATIONS: readonly Situation[] = ['switch', 'fresh', 'other']

const field = (value: unknown, max: number): string => (typeof value === 'string' ? value.replace(/\r\n?/g, '\n').trim().slice(0, max) : '')

const planName = (id: string) => planById(id)?.name ?? copy.start.planUnsure
const situationName = (id: Situation) => copy.start.situations[id]

function slovakTime(seconds: number): string {
  return new Intl.DateTimeFormat('sk-SK', { timeZone: 'Europe/Bratislava', dateStyle: 'long', timeStyle: 'short' }).format(new Date(seconds * 1000))
}

app.post('/zacat', async (c) => {
  const body = await c.req.parseBody()
  const carry = carryFrom((name) => body[name])
  // A field nobody sees, which only a machine fills in: answered as if it had worked, and kept nowhere.
  if (field(body.web, 200) !== '') return c.redirect('/zacat/hotovo', 303)

  const fresh = body.mode === 'fresh'
  const ico = fresh ? null : normalizeIco(field(body.ico, 20))
  const plan = planById(field(body.plan, 10))?.id ?? 'neviem'
  const situationRaw = field(body.situation, 10) as Situation
  const situation: Situation = SITUATIONS.includes(situationRaw) ? situationRaw : fresh ? 'fresh' : 'switch'
  const values: DetailsValues = {
    // The company as typed, or, when the register does not answer now, as it named it on the page before (kept
    // as typed: it never goes into an email).
    company: field(body.company, 160) || field(body.seen, 160),
    plan,
    situation,
    name: field(body.name, 120),
    email: field(body.email, 200),
    phone: field(body.phone, 30),
    note: field(body.note, 2000),
  }

  // What the register says counts, not what the page carried: a name shown on the next page or in an email is
  // always the register's.
  let state: CompanyState = { kind: 'fresh' }
  if (!fresh) state = ico ? await companyState(c, ico) : { kind: 'missing', ico: '' }
  const company: Company | null = state.kind === 'found' ? state.company : null

  const errors: DetailsErrors = {}
  if (values.name.length < 2) errors.name = copy.start.errors.name
  if (!EMAIL.test(values.email)) errors.email = copy.start.errors.email
  if (values.phone !== '' && !PHONE.test(values.phone)) errors.phone = copy.start.errors.phone
  if (field(body.note, 5000).length > 1500) errors.note = copy.start.errors.note
  if (!fresh && !company && values.company.length < 2) errors.company = copy.start.errors.company
  if (Object.keys(errors).length > 0) {
    return page(c, startMeta, <StartDetails carry={carry} state={state} ico={ico ?? ''} values={values} errors={{ ...errors, form: copy.start.errors.summary }} />, 422)
  }

  const db = c.env.DB
  await ensureSchema(db)
  if (!(await withinLimit(db, 'request', connection(c), LIMITS.requestsPerHour, 3600))) {
    return page(c, startMeta, <StartDetails carry={carry} state={state} ico={ico ?? ''} values={values} errors={{ form: copy.start.errors.throttle }} />, 429)
  }

  const id = crypto.randomUUID()
  const companyName = company?.name ?? (values.company || null)
  const source = carry.length > 0 ? JSON.stringify(Object.fromEntries(carry)) : null
  const statements = [
    insertRequestStatement(db, {
      id,
      ico,
      company: companyName,
      address: company?.address ?? null,
      companySource: company ? 'register' : companyName ? 'manual' : null,
      plan,
      situation,
      name: values.name,
      email: values.email,
      phone: values.phone || null,
      note: values.note || null,
      source,
      privacyVersion: PRIVACY_VERSION,
    }),
    queueStatement(db, {
      key: `owner:${id}`,
      to: BRAND.email,
      subject: `Nová žiadosť: ${companyName ?? values.name}`,
      body: [
        `Nová žiadosť z webu ${BRAND.name}`,
        '',
        `Firma: ${companyName ?? 'zatiaľ žiadna'}${company ? ' (z registra)' : companyName ? ' (napísaná ručne)' : ''}`,
        `IČO: ${ico ? formatIco(ico).replace(/ /g, ' ') : '-'}`,
        `Sídlo: ${company?.address ?? '-'}`,
        `Balík: ${planName(plan)}`,
        `Čo potrebuje: ${situationName(situation)}`,
        `Meno: ${values.name}`,
        `E-mail: ${values.email}`,
        `Telefón: ${values.phone || '-'}`,
        `Poznámka: ${values.note || '-'}`,
        `Zdroj: ${source ?? '-'}`,
        '',
        `Odoslané ${slovakTime(now())}.`,
      ].join('\n'),
    }),
  ]
  // A confirmation goes to the address that was typed, at most twice a day, and carries nothing a stranger could
  // have typed into the form: the company only as the register names it.
  if (await withinLimit(db, 'confirm', values.email.toLowerCase(), LIMITS.confirmationsPerDay, 86400)) {
    statements.push(
      queueStatement(db, {
        key: `client:${id}`,
        to: values.email,
        subject: `${BRAND.name}: Vašu žiadosť máme`,
        body: [
          'Dobrý deň,',
          '',
          `ďakujeme za záujem o ${BRAND.name}. Vašu žiadosť sme dostali a ozveme sa ${REPLY_WITHIN}.`,
          '',
          ...(company ? [`Firma: ${company.name}`] : []),
          `Balík: ${planName(plan)}`,
          '',
          'Ak Vám medzitým niečo napadne, stačí odpovedať na tento e-mail.',
          '',
          'Christian Juhás',
          BRAND.name,
          '',
          `${BRAND.name} je služba spoločnosti ${OPERATOR.name}, ${OPERATOR.street}, ${OPERATOR.postalCity}, IČO ${OPERATOR.companyId}, zapísanej ${OPERATOR.registeredIn}.`,
        ].join('\n'),
      }),
    )
  }
  await db.batch(statements)
  later(c, flushOutbox(db, c.env.EMAIL))
  return c.redirect('/zacat/hotovo', 303)
})

app.get('/zacat/hotovo', (c) => page(c, { ...startMeta, title: `${copy.thanks.title} | ${BRAND.name}`, path: '/zacat/hotovo' }, <Thanks />))

// ---------------------------------------------------------------------------
// The rest
// ---------------------------------------------------------------------------

app.get('/pravne-informacie', (c) =>
  page(c, { title: `Právne informácie | ${BRAND.name}`, description: typeset(`Kto stojí za ${BRAND.name} a ako chránime osobné údaje.`), path: '/pravne-informacie' }, <Legal />),
)

// The page of an issued invoice that its customer opens from the email, and its e-invoice: no sign-in, the token
// of 32 random bytes is the key, and nothing of it is for search engines.
app.get('/f/:token', async (c) => {
  await ensureSchema(c.env.DB)
  const found = await invoiceByToken(c.env.DB, c.req.param('token'))
  const seller = found ? await getCompany(c.env.DB, found.company) : null
  if (!found || !seller) return c.notFound()
  const lines = await invoiceLines(c.env.DB, found.invoice.id)
  return c.html(html`<!doctype html>${(<PublicInvoicePage invoice={found.invoice} lines={lines} seller={seller} token={c.req.param('token')} />)}`)
})

app.get('/f/:token/xml', async (c) => {
  await ensureSchema(c.env.DB)
  const found = await invoiceByToken(c.env.DB, c.req.param('token'))
  const seller = found ? await getCompany(c.env.DB, found.company) : null
  if (!found || !seller) return c.notFound()
  return xmlResponse(found.invoice, await invoiceLines(c.env.DB, found.invoice.id), seller)
})

app.route('/app', appRoutes)
app.route('/ucto', teamRoutes)

app.get('/robots.txt', (c) => c.text(['User-agent: *', 'Disallow: /zacat', 'Disallow: /app', 'Disallow: /ucto', 'Disallow: /f/', `Sitemap: ${BRAND.origin}/sitemap.xml`, ''].join('\n')))

app.get('/sitemap.xml', (c) => {
  const urls = ['/', '/pravne-informacie'].map((path) => `  <url><loc>${BRAND.origin}${path}</loc></url>`)
  c.header('Content-Type', 'application/xml; charset=utf-8')
  return c.body(['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">', ...urls, '</urlset>', ''].join('\n'))
})

app.get('/healthz', async (c) => {
  try {
    await ensureSchema(c.env.DB)
    return c.json({ ok: true, schema: SCHEMA_VERSION })
  } catch {
    return c.json({ ok: false }, 503)
  }
})

app.notFound((c) => page(c, { title: `${copy.notFound.title} | ${BRAND.name}`, description: copy.meta.description, path: new URL(c.req.url).pathname, noindex: true }, <NotFound />, 404))

app.onError((err, c) => {
  console.error('request failed', err instanceof Error ? err.name : 'error')
  return c.text('Niečo sa pokazilo. Skúste to znova o chvíľu.', 500)
})

export default {
  fetch: app.fetch,
  /** Email to a company's address for documents (src/app/inbox.ts). */
  async email(message: ForwardableEmailMessage, env: Bindings, ctx: ExecutionContext) {
    await ensureSchema(env.DB)
    try {
      await receiveMail(env, message, (work) => ctx.waitUntil(work.catch((err) => console.error('reading an email failed', err instanceof Error ? err.name : 'error'))))
    } catch (err) {
      console.error('an email failed', err instanceof Error ? err.name : 'error')
      message.setReject('Doklady sa nepodarilo prijať. Skúste to znova o chvíľu.')
    }
  },
  async scheduled(event: ScheduledController, env: Bindings, ctx: ExecutionContext) {
    ctx.waitUntil(
      (async () => {
        await ensureSchema(env.DB)
        try {
          await flushOutbox(env.DB, env.EMAIL, 25)
        } catch (err) {
          console.error('outbox failed', err instanceof Error ? err.name : 'error')
        }
        await purge(env.DB)
        try {
          await appScheduled(env, event.scheduledTime)
        } catch (err) {
          console.error('app schedule failed', err instanceof Error ? err.name : 'error')
        }
      })(),
    )
  },
}
