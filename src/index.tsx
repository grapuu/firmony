import { prepareBankEvidence } from './aml/enhanced'
import { accessOpenSql } from './aml/retention'
import { AmlIntakePage, type IntakeContract } from './views/aml-admission'
import { checkDeclaration, valuesFrom, valuesOfDeclaration, type DeclarationValues } from './app/aml'
import { app as appCopy } from './app/copy'
import { admissionForOrder, dossierOfOrder, prepareDossier, signatureFile } from './aml/store'
import { declarationPdf } from './aml/pdf'
import { GUIDES } from './content/guides'
import { BUILD_METADATA } from './generated/deployment'
import { article, breadcrumbs, faqPage, jsonLd, organization, plain, service, SITE_UPDATED, website } from './seo'
import { WAGE_PAGE, WAGE_PATH } from './content/wage-calc'
import { wageCalc, wageQueryOf, wageYearOf } from './app/wage-calc'
import { WageCalcPage } from './views/wage-calc'
import { SZCO_PAGE, SZCO_PATH } from './content/szco-calc'
import { szcoCalc, szcoQueryOf, szcoYearOf } from './app/szco-calc'
import { SzcoCalcPage } from './views/szco-calc'
import { SRO_PAGE, SRO_PATH } from './content/sro-calc'
import { sroCalc, sroQueryOf } from './app/sro-calc'
import { SroCalcPage } from './views/sro-calc'
import { FreeInvoicePage, FreeToolsPage } from './views/free-tools'
import { INVOICE_META, INVOICE_PATH, TOOLS_PATH } from './tools/invoice'
import { announceSite, llmsFullTxt, llmsTxt, robotsTxt, sitemapXml } from './robots'
import { GuidePage } from './views/guide'
import { Hono, type Context } from 'hono'
import { html } from 'hono/html'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { compare, readCount, readMoney } from './calc'
import { APP, BRAND, CUSTOM_PLAN, INDEXNOW_KEY, INVESTORS, INVOICING, LIMITS, OPERATOR, ORDER, PLANS, PRIVACY_VERSION, REPLY_WITHIN, TEAM, TERMS_VERSION, planById, type InvestorBroker, type InvestorWay } from './config'
import { copy } from './copy'
import { SCHEMA_VERSION, ensureSchema, insertRequestStatement, now, purge, sha256Hex, upsertInvestorStatement, withinLimit } from './db'
import { typeset } from './format'
import { connection, isLocal, later, siteOrigin } from './http'
import { providerOf } from './peppol/provider'
import { applyEvents, noteMalformed, purgePeppol, sendDue } from './peppol/store'

const PEPPOL_NOTICES = '/peppol/udalosti'
import { recordRequest } from './analytics/record'
import { formatIco, icoLooksValid, normalizeIco } from './ico'
import { flushOutbox, queueStatement, type Mailer } from './mail'
import { lookupCompany, lookupEntity, oneMayConclude, type Company } from './rpo'
import { appRoutes, appScheduled, logoResponse, pdfResponse, quickSignin, xmlResponse, type AppBindings } from './app/routes'
import { invoiceByToken, invoiceLines } from './app/invoices'
import { getCompany, userByEmail } from './app/store'
import { isPeriodLocked } from './app/periods'
import { newLink, newToken, startSession } from './app/session'
import { inboxCode } from './team/store'
import { acceptStatements, acceptedAs, isClient, newOrderStatement, orderByToken, type Order } from './order'
import { bell, ringStatement } from './bell'
import { startMonths } from './content/terms'
import { approvedRelease, contractCatalogueHash, contractGate, latestOrderReview, resolveContract } from './contracts'
import { OrderAsked, OrderDone, OrderGone, OrderPage, TermsPage, type OrderErrors, type OrderValues } from './views/order'
import { PublicInvoicePage } from './views/invoices'
import { receiveMail } from './app/inbox'
import { teamRoutes } from './team/routes'
import { securityRoutes } from './security/routes'
import { monyAnswer } from './assistant/mony-route'
import { isEvidenceHeld } from './incidents/store'
import { isFilingSent } from './filings/model'
import { payrollBlocked } from './payroll-reporting/model'
import { Home, type CalcState, type Carry } from './views/home'
import { Layout, type PageMeta } from './views/layout'
import { Legal } from './views/legal'
import { NotFound, StartDetails, StartIco, Thanks, type CompanyState, type DetailsErrors, type DetailsValues, type Situation } from './views/start'
import { InvestorsPage, InvestorsThanks, type InvestorValues } from './views/investors'
import { InvoicingPage, InvoicingTermsPage, SignupEnter, SignupExpired, SignupSent, type SignupErrors, type SignupFormValues } from './views/invoicing'
import { INVOICING_PATH, invoicingCopy } from './content/invoicing'
import { makeWorkspace, newSignupStatement, signupFor, useSignup } from './app/invoicing'

export interface Bindings extends AppBindings {
  DB: D1Database
  /** Cloudflare's email service. Without it requests are still kept, and their emails wait in the outbox. */
  EMAIL?: Mailer
  /** "1" on the live Worker (wrangler.jsonc): the schedule tells IndexNow of new or changed public pages. */
  ANNOUNCE?: string
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

// The home page runs one script of its own (public/flow.js: the month played by scrolling where the browser has no
// scroll timelines, Safari before 26). The public invoice tool also permits its own script, and forbids form posts.
const HOME_CONTENT_SECURITY_POLICY = CONTENT_SECURITY_POLICY.replace("script-src 'none'", "script-src 'self'")

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
const UPLOADS = /^\/(?:app\/(?:doklady|platby\/[^/]+\/doklad|banka|plna-moc|prechod\/podklady)|ucto\/klienti\/[^/]+\/(?:odovzdanie|prevzatie\/prechod\/podklady))$/

const PERMISSIONS_POLICY = ['accelerometer', 'camera', 'display-capture', 'geolocation', 'gyroscope', 'microphone', 'payment', 'usb', 'browsing-topics']
  .map((feature) => `${feature}=()`)
  .join(', ')

const CANONICAL_HOST = new URL(BRAND.origin).hostname

app.use('*', async (c, next) => {
  const started = Date.now()
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
  // The app's and the team's addresses never hold an escaped character: one would reach a route by its decoded path past
  // the checks that read the address as written (the review of 26 October 2026: /app/expor%74).
  // Hono routes by the decoded path, so the first segment escaped (/%75cto/...) is the same address too (the review of
  // the evening): any escaped path that decodes into those parts, or does not decode, is no address.
  if (url.pathname.includes('%')) {
    let decoded: string | null
    try {
      decoded = decodeURIComponent(url.pathname)
    } catch {
      decoded = null
    }
    if (decoded === null || /^\/+(?:app|ucto|auth|f|peppol)(?:\/|$)/i.test(decoded)) return c.text('Not found', 404)
  }
  if (reads && url.pathname.length > 1 && (url.pathname.endsWith('/') || url.pathname.includes('//'))) {
    url.pathname = url.pathname.replace(/\/{2,}/g, '/').replace(/(.)\/$/, '$1')
    return c.redirect(url.toString(), 301)
  }
  // The postman's notices come from its servers, signed (peppol/provider.ts): no page of ours sends them, so no origin
  // is asked; their length is, and the route checks the signature before reading anything.
  const notice = !reads && url.pathname === PEPPOL_NOTICES
  if (notice) {
    const length = Number(c.req.header('content-length'))
    if (!Number.isInteger(length) || length < 0) return c.text('Length required', 411)
    if (length > 15 * 1024 * 1024) return c.text('Too large', 413)
  }
  if (!reads && !notice) {
    // A form may only be posted from our own pages, and says how long it is.
    const origin = c.req.header('origin')
    const sameOrigin = origin ? origin === url.origin : c.req.header('sec-fetch-site') === 'same-origin'
    if (!sameOrigin) return c.text('Forbidden', 403)
    const declared = c.req.header('content-length')
    if (declared === undefined) return c.text('Length required', 411)
    const length = Number(declared)
    if (!Number.isInteger(length) || length < 0) return c.text('Bad request', 400)
    const allowed = (/^\/objednavka\/[^/]+\/banka$/.test(url.pathname) || /^\/ucto\/aml\/spisy\/[^/]+\/banka$/.test(url.pathname)) ? 52 * 1024 * 1024 : (/^\/objednavka\/[^/]+\/(?:overenie|vyhlasenie\.pdf)$/.test(url.pathname) || /^\/app\/vyhlasenie(?:\/pdf)?$/.test(url.pathname) || /^\/ucto\/aml\/objednavky\/[^/]+\/uchovanie$/.test(url.pathname)) ? 26 * 1024 * 1024 : UPLOADS.test(url.pathname) ? APP.uploadBytes : /^\/ucto\//.test(url.pathname) ? LIMITS.teamFormBytes : /^\/app\//.test(url.pathname) ? LIMITS.appFormBytes : LIMITS.formBytes
    if (length > allowed) return c.text('Too large', 413)
  }
  await next()
  const inside = /^\/(app|ucto|auth|f)(\/|$)/.test(url.pathname)
  if (!c.res.headers.has('Content-Security-Policy'))
    c.header('Content-Security-Policy', inside ? APP_CONTENT_SECURITY_POLICY : url.pathname === INVOICE_PATH ? HOME_CONTENT_SECURITY_POLICY.replace("form-action 'self'", "form-action 'none'") : url.pathname === '/' ? HOME_CONTENT_SECURITY_POLICY : CONTENT_SECURITY_POLICY)
  c.header('X-Content-Type-Options', 'nosniff')
  // Only a document's own PDF may be shown inside our pages (beside the booking form); nothing else is framed.
  if (!c.res.headers.has('X-Frame-Options')) c.header('X-Frame-Options', 'DENY')
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin')
  c.header('Cross-Origin-Opener-Policy', 'same-origin')
  c.header('Cross-Origin-Resource-Policy', 'same-origin')
  c.header('Permissions-Policy', PERMISSIONS_POLICY)
  c.header('Content-Language', 'sk')
  // Only the real domain is for search engines: not a preview address, not a form step.
  if ((url.hostname !== CANONICAL_HOST && !local) || url.pathname.startsWith('/zacat') || url.pathname.startsWith('/objednavka') || url.pathname.startsWith(`${INVOICING_PATH}/vstup`) || inside) c.header('X-Robots-Tag', 'noindex, nofollow')
  if (!c.res.headers.has('Cache-Control')) c.header('Cache-Control', 'no-store')
  if (url.protocol === 'https:') c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  // First-party analytics in daily sums (analytics/record.ts): written after the answer, never in its way.
  recordRequest(c, c.env.DB, started)
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

const homeMeta: PageMeta = {
  title: copy.meta.title,
  description: copy.meta.description,
  path: '/',
  ctaHref: '#zacat',
  jsonLd: jsonLd([organization(), website(), service(), faqPage(copy.faq.items, '/')]),
}

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

const emptyValues = (plan: string, situation: Situation): DetailsValues => ({ company: '', plan, situation, name: '', email: '', directorEmail: '', phone: '', note: '' })

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
  const asked = c.req.query('balik')
  const plan = asked === CUSTOM_PLAN ? CUSTOM_PLAN : (planById(asked)?.id ?? '')
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

const planName = (id: string) => (id === CUSTOM_PLAN ? copy.start.planCustom : (planById(id)?.name ?? copy.start.planUnsure))

app.post('/zacat', async (c) => {
  const body = await c.req.parseBody()
  const carry = carryFrom((name) => body[name])
  // A field nobody sees, which only a machine fills in: answered as if it had worked, and kept nowhere.
  if (field(body.web, 200) !== '') return c.redirect('/zacat/hotovo', 303)

  const fresh = body.mode === 'fresh'
  const ico = fresh ? null : normalizeIco(field(body.ico, 20))
  const planRaw = field(body.plan, 10)
  const plan = planRaw === CUSTOM_PLAN ? CUSTOM_PLAN : (planById(planRaw)?.id ?? 'neviem')
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
    directorEmail: field(body.directorEmail, 200),
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
  if (values.directorEmail !== '' && !EMAIL.test(values.directorEmail)) errors.directorEmail = copy.start.errors.directorEmail
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
  // A confirmation goes to the address that was typed, at most twice a day, and carries nothing a stranger could
  // have typed into the form: the company only as the register names it. A company the register knows as an
  // s. r. o., a. s. or j. s. a. in business, and not yet a client, gets an order: once we have looked at what it needs (the review on
  // /ucto/ziadosti), its director gets the link to the contract, to the director's own address when it was given.
  // A company that asks for a scope agreed one by one makes no order: the team goes through its books first.
  const confirm = await withinLimit(db, 'confirm', values.email.toLowerCase(), LIMITS.confirmationsPerDay, 86400)
  let orderStatement: D1PreparedStatement | null = null
  const entity = plan !== CUSTOM_PLAN && ico && company && company.form && !company.terminated && company.rpoId ? await lookupEntity(company.rpoId) : null
  // The detail's legal form decides over the name's; another form than the three is no order.
  const form = entity?.formCode ? entity.form : (company?.form ?? null)
  if (plan !== CUSTOM_PLAN && ico && company && form && !company.terminated && !(await isClient(db, ico))) {
    // The token of this statement is sent to nobody: the review makes the one the director gets.
    orderStatement = await newOrderStatement(db, newToken(), {
      requestId: id,
      ico,
      company: company.name,
      address: company.address || null,
      registerLine: company.registerLine,
      directors: entity?.directors ?? null,
      legalForm: form,
      acting: entity?.acting ?? null,
      plan: planById(plan)?.id ?? 'start',
      person: values.name,
      email: values.directorEmail || values.email,
      phone: values.phone || null,
    })
  }
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
    // To us a doorbell only: who asked and what is in /ucto/ziadosti, behind the sign-in.
    ringStatement(db, 'request', id, BRAND.email, bell.teamRequest(`${siteOrigin(c)}/ucto/ziadosti`)),
  ]
  if (orderStatement) statements.push(orderStatement)
  if (confirm) {
    statements.push(
      queueStatement(db, {
        key: `client:${id}`,
        to: values.email,
        subject: `${BRAND.name}: Vašu žiadosť máme`,
        body: [
          'Dobrý deň,',
          '',
          orderStatement
            ? `ďakujeme za záujem o ${BRAND.name}. Vašu žiadosť sme dostali. ${REPLY_WITHIN.charAt(0).toUpperCase()}${REPLY_WITHIN.slice(1)} posúdime, či Vašej firme sedí štandardný balík, a odkaz na zmluvu, ktorú uzavrie online, pošleme tomu, kto za firmu koná.`
            : `ďakujeme za záujem o ${BRAND.name}. Vašu žiadosť sme dostali a ozveme sa ${REPLY_WITHIN}.`,
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
  const next = new URLSearchParams()
  if (orderStatement) next.set('zmluva', '1')
  if (!confirm) next.set('potvrdenie', '0')
  if (situation === 'switch') next.set('zmena', '1')
  if (plan === CUSTOM_PLAN) next.set('mieru', '1')
  const query = next.toString()
  return c.redirect(`/zacat/hotovo${query ? `?${query}` : ''}`, 303)
})

// ---------------------------------------------------------------------------
// Invoicing for everyone (26 October 2026, app/invoicing.ts): the page, its sign-up, the link that finishes it
// ---------------------------------------------------------------------------

const invoicingMeta: PageMeta = {
  title: invoicingCopy.meta.title,
  description: invoicingCopy.meta.description,
  path: INVOICING_PATH,
  ctaHref: '#zacat',
  ctaText: invoicingCopy.form.submit,
  jsonLd: jsonLd([organization(), website(), faqPage(invoicingCopy.faq.items, INVOICING_PATH)]),
}
const signupMeta: PageMeta = { title: `${invoicingCopy.enter.title} | ${BRAND.name}`, description: invoicingCopy.meta.description, path: `${INVOICING_PATH}/vstup` }
const emptySignup: SignupFormValues = { email: '', ico: '', company: '', address: '' }

app.get(INVOICING_PATH, (c) => page(c, invoicingMeta, <InvoicingPage carry={carryFrom((name) => c.req.query(name))} values={emptySignup} errors={{}} manual={false} />))

app.get(`${INVOICING_PATH}/podmienky`, (c) => page(c, { title: `${invoicingCopy.terms.title} | ${BRAND.name}`, description: invoicingCopy.terms.lead, path: `${INVOICING_PATH}/podmienky` }, <InvoicingTermsPage />))

/**
 * A sign-up: the address, the person and the IČO; the company as the register names it, or as typed when the register
 * does not know it or does not answer. The link that finishes it goes to the address typed, at most a few times a day,
 * and carries nothing a stranger typed but the link itself; the page answers the same whatever the address.
 */
app.post(INVOICING_PATH, async (c) => {
  const body = await c.req.parseBody()
  const carry = carryFrom((name) => body[name])
  const f = invoicingCopy.form
  const values: SignupFormValues = { email: field(body.email, 200), ico: field(body.ico, 20), company: field(body.firma, 160), address: field(body.adresa, 240) }
  // A field nobody sees, which only a machine fills in: answered as if it had worked, and kept nowhere.
  if (field(body.web, 200) !== '') return page(c, signupMeta, <SignupSent email={values.email.slice(0, 200)} />)
  const manual = body.rucne === '1'
  const again = (errors: SignupErrors, asManual: boolean, status: ContentfulStatusCode) =>
    page(c, invoicingMeta, <InvoicingPage carry={carry} values={values} errors={Object.keys(errors).length > 0 && !errors.form ? { ...errors, form: f.errors.summary } : errors} manual={asManual} />, status)
  const errors: SignupErrors = {}
  const ico = normalizeIco(values.ico)
  if (!EMAIL.test(values.email)) errors.email = f.errors.email
  if (!ico) errors.ico = f.errors.ico
  if (manual && values.company.length < 2) errors.company = f.errors.company
  if (manual && values.address.length < 5) errors.address = f.errors.address
  if (Object.keys(errors).length > 0) return again(errors, manual, 422)
  const db = c.env.DB
  await ensureSchema(db)
  // A connection, and its neighbourhood (an IPv4 address by its /24; IPv6 counts by its /64 already).
  const net = connection(c).includes(':') ? connection(c) : connection(c).split('.').slice(0, 3).join('.')
  if (!(await withinLimit(db, 'invoicing-signup', connection(c), INVOICING.signupsPerHour, 3600)) || !(await withinLimit(db, 'invoicing-signup-net', net, INVOICING.signupsPerHour * 3, 3600)))
    return again({ form: f.errors.throttle }, manual, 429)
  // The register's word decides whenever it answers: a name and address typed count only for a company it does not
  // know (a trade registered these days) or while it does not answer, whatever the form said.
  const state = await companyState(c, ico ?? '')
  if (state.kind === 'found' && state.company.terminated) return again({ ico: f.errors.ended }, false, 422)
  if (state.kind === 'missing' && !icoLooksValid(ico ?? '')) return again({ ico: f.errors.icoWrong }, false, 422)
  let company: { name: string; address: string | null; registerLine: string | null; legalForm: string | null }
  if (state.kind === 'found') company = { name: state.company.name, address: state.company.address || null, registerLine: state.company.registerLine, legalForm: state.company.form }
  else if (manual) company = { name: values.company, address: values.address, registerLine: null, legalForm: null }
  else return again({}, true, 200)
  if (!(await withinLimit(db, 'invoicing-signups', 'all', INVOICING.signupsPerDay, 86400))) return again({ form: f.errors.busy }, manual, 429)
  // One mailbox however it is written: "+tags" and capitals count as the same address.
  const mailbox = values.email.toLowerCase().replace(/\+[^@]*@/, '@')
  if (await withinLimit(db, 'invoicing-mail', mailbox, INVOICING.signupsPerEmailDay, 86400)) {
    const token = newToken()
    const source = carry.length > 0 ? JSON.stringify(Object.fromEntries(carry)) : null
    await db.batch([
      await newSignupStatement(db, token, { email: values.email, ico, company: company.name, address: company.address, registerLine: company.registerLine, legalForm: company.legalForm, registerFound: state.kind === 'found', source }),
      queueStatement(db, {
        key: `invoicing-signup:${(await sha256Hex(token)).slice(0, 24)}`,
        to: values.email,
        subject: invoicingCopy.mail.subject,
        body: invoicingCopy.mail.body(`${siteOrigin(c)}${INVOICING_PATH}/vstup?t=${token}`),
      }),
    ])
    later(c, flushOutbox(db, c.env.EMAIL))
  }
  return page(c, signupMeta, <SignupSent email={values.email} />)
})

// The link from the email asks for one click: a mail scanner that opens links by itself must not use it up.
app.get(`${INVOICING_PATH}/vstup`, async (c) => {
  await ensureSchema(c.env.DB)
  const token = c.req.query('t') ?? ''
  const signup = await signupFor(c.env.DB, token)
  if (!signup) return page(c, signupMeta, <SignupExpired />, 410)
  return page(c, signupMeta, <SignupEnter token={token} company={signup.company} ico={signup.ico} email={signup.email} />)
})

app.post(`${INVOICING_PATH}/vstup`, async (c) => {
  const body = await c.req.parseBody()
  const token = typeof body.t === 'string' ? body.t : ''
  const name = field(body.meno, 120).replace(/\s+/g, ' ')
  const db = c.env.DB
  await ensureSchema(db)
  const errors: { name?: string; agree?: string } = {}
  if (name.length < 2) errors.name = invoicingCopy.form.errors.name
  if (body.suhlas !== '1') errors.agree = invoicingCopy.enter.agreeError
  if (errors.name || errors.agree) {
    const signup = await signupFor(db, token)
    if (!signup) return page(c, signupMeta, <SignupExpired />, 410)
    return page(c, signupMeta, <SignupEnter token={token} company={signup.company} ico={signup.ico} email={signup.email} name={name} errors={errors} />, 422)
  }
  const signup = await useSignup(db, token, name)
  if (!signup) return page(c, signupMeta, <SignupExpired />, 410)
  const made = await makeWorkspace(db, signup)
  if ('refused' in made) return page(c, signupMeta, <SignupExpired refused={made.refused} />, 409)
  await startSession(c, db, made.user, made.company)
  // A new account is offered the passkey at once: from then on it signs in with one touch, without email.
  return c.redirect(quickSignin(made.existing ? '/app/faktury' : '/app/faktury?vitajte=1'), 303)
})

// ---------------------------------------------------------------------------
// Firmony for investors: what it will be, and who wants it (one row an address)
// ---------------------------------------------------------------------------

const investorsMeta: PageMeta = { title: copy.investors.meta.title, description: copy.investors.meta.description, path: '/investori', ctaHref: '#zapis', ctaText: copy.investors.cta }

app.get('/investori', (c) => {
  const carry = carryFrom((name) => c.req.query(name))
  return page(c, investorsMeta, <InvestorsPage carry={carry} values={{ email: '', brokers: [], way: null }} />)
})

app.post('/investori', async (c) => {
  const body = await c.req.parseBody({ all: true })
  const one = (name: string) => {
    const value = body[name]
    return Array.isArray(value) ? value[0] : value
  }
  const carry = carryFrom(one)
  if (field(one('web'), 200) !== '') return c.redirect('/investori/hotovo', 303)
  const picked = ([] as unknown[]).concat(body.broker ?? [])
  const brokers = INVESTORS.brokers.map((b) => b.id).filter((id) => picked.includes(id)) as InvestorBroker[]
  const way = (INVESTORS.ways as readonly string[]).includes(field(one('cesta'), 10)) ? (field(one('cesta'), 10) as InvestorWay) : null
  const values: InvestorValues = { email: field(one('email'), 200), brokers, way }
  // Which form it came from, so that a mistake is said at the form it was made in.
  const at = one('forma') === 'zapis' ? 'final' : 'hero'
  const meta = { ...investorsMeta, path: '/investori' }
  if (!EMAIL.test(values.email)) return page(c, meta, <InvestorsPage carry={carry} values={values} error={copy.investors.errors.email} at={at} />, 422)
  const db = c.env.DB
  await ensureSchema(db)
  if (!(await withinLimit(db, 'investor', connection(c), LIMITS.requestsPerHour, 3600))) {
    return page(c, meta, <InvestorsPage carry={carry} values={values} error={copy.investors.errors.throttle} at={at} />, 429)
  }
  const source = carry.length > 0 ? JSON.stringify(Object.fromEntries(carry)) : null
  const statements = [upsertInvestorStatement(db, { email: values.email, brokers, way, source, privacyVersion: PRIVACY_VERSION })]
  // A confirmation to the address that was typed, at most twice a day, with nothing in it a stranger could have typed.
  if (await withinLimit(db, 'confirm', values.email.toLowerCase(), LIMITS.confirmationsPerDay, 86400)) {
    statements.push(
      queueStatement(db, {
        key: `investor:${values.email.toLowerCase()}:${now()}`,
        to: values.email,
        subject: copy.investors.mail.subject,
        body: [
          'Dobrý deň,',
          '',
          copy.investors.mail.lead.replace(/\u00a0/g, ' '),
          '',
          copy.investors.mail.remove.replace(/\u00a0/g, ' '),
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
  return c.redirect('/investori/hotovo', 303)
})

// Signed up: the header's button is the site's own again (the form it led to is behind them).
app.get('/investori/hotovo', (c) =>
  page(c, { title: `${copy.investors.thanks.title} | ${BRAND.name}`, description: copy.investors.meta.description, path: '/investori/hotovo', noindex: true }, <InvestorsThanks />),
)

app.get('/zacat/hotovo', (c) => {
  const order = c.req.query('zmluva') === '1'
  return page(
    c,
    { ...startMeta, title: `${copy.thanks.title} | ${BRAND.name}`, path: '/zacat/hotovo' },
    <Thanks order={order} confirmed={c.req.query('potvrdenie') !== '0'} switching={c.req.query('zmena') === '1'} custom={c.req.query('mieru') === '1'} />,
  )
})

// ---------------------------------------------------------------------------
// The order: the contract concluded online by a director the register names
// ---------------------------------------------------------------------------

const orderMeta = (title: string): PageMeta => ({ title: `${title} | ${BRAND.name}`, description: copy.meta.description, path: '/objednavka', noindex: true })

/** Today in Bratislava, YYYY-MM-DD. */
const bratislavaToday = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Bratislava' }).format(new Date())

/** The page an order that cannot be concluded any more shows instead of its form, or null when it can be. */
const orderMissing = (c: Ctx) => page(c, { title: `${copy.notFound.title} | ${BRAND.name}`, description: copy.meta.description, path: '/objednavka', noindex: true }, <NotFound />, 404)

async function orderClosed(c: Ctx, order: Order) {
  if (order.status === 'accepted') {
    // The old bearer link obeys the same ninety-day access limit as the signed-in client.
    const accessible = order.companyId && await c.env.DB.prepare(`SELECT 1 FROM companies c WHERE c.id = ? AND ${accessOpenSql('c')}`).bind(order.companyId).first()
    if (!accessible) return orderMissing(c)
    return page(c, orderMeta(copy.order.doneTitle), <OrderDone order={order} contract={await resolveContract(c.env.DB, order.companyId!, order.termsVersion)} />)
  }
  if (order.status === 'expired')
    return page(c, orderMeta(copy.order.expiredTitle), <OrderGone kind="expired" again={`/zacat?ico=${encodeURIComponent(order.ico)}&balik=${encodeURIComponent(order.plan)}`} />, 410)
  if (await isClient(c.env.DB, order.ico)) return page(c, orderMeta(copy.order.clientTitle), <OrderGone kind="client" />, 409)
  return null
}

/** What an online order's declaration offers to accept (none on paper: the paper contract is signed apart). */
const intakeContract = (order: Order, months: string[]): IntakeContract | null =>
  order.amlPaper ? null : { plans: PLANS.map((p) => ({ id: p.id, name: p.name, price: p.price })), months, terms: TERMS_VERSION }

/**
 * Why the offer the identified person signed no longer allows the contract, or null: the terms changed, the first month
 * passed, or the reviewed plan is another. Then the declaration has to be signed again with the offer as it is now.
 */
function signedOfferStale(signed: { plan: string; startOn: string; terms: string } | undefined, months: string[], reviewedPlan: string | null): string | null {
  if (!signed) return 'Vyhlásenie, ktoré ste podpísali, ešte neobsahovalo prijatie ponuky. Vyplňte a podpíšte ho, prosím, znova.'
  if (signed.terms !== TERMS_VERSION) return 'Obchodné podmienky sa od podpisu vyhlásenia zmenili. Vyplňte a podpíšte vyhlásenie, prosím, znova.'
  if (!months.includes(signed.startOn)) return 'Prvý mesiac služby z podpísaného vyhlásenia už nemožno zvoliť. Vyplňte a podpíšte vyhlásenie, prosím, znova.'
  if (reviewedPlan && signed.plan !== reviewedPlan) return 'Potvrdený balík je iný ako v podpísanom vyhlásení. Vyplňte a podpíšte vyhlásenie, prosím, znova.'
  return null
}

app.get('/objednavka/:token', async (c) => {
  await ensureSchema(c.env.DB)
  const token = c.req.param('token')
  const order = await orderByToken(c.env.DB, token)
  if (!order) return orderMissing(c)
  const closed = await orderClosed(c, order)
  if (closed) return closed
  const intake = await dossierOfOrder(c.env.DB, order.id)
  const months = startMonths(bratislavaToday())
  const admitted = await admissionForOrder(c.env.DB, order)
  const editing = c.req.query('upravit') === '1'
  const gate = admitted && !editing ? await contractGate(c.env.DB, c.env, order) : null
  const stale = gate && !order.amlPaper ? signedOfferStale(intake?.declaration.contract, months, gate.approval?.review.plan ?? null) : null
  if (!admitted || editing || stale) {
    // Anybody holding the emailed link opens this page: birth numbers and the document's number are typed again, never shown.
    const review = await latestOrderReview(c.env.DB, order.id)
    const values: DeclarationValues = intake ? valuesOfDeclaration(intake.declaration, { secrets: false }) : { name: order.directors?.length === 1 ? order.directors[0]?.name ?? '' : '', businessCountries: 'SK',businessAtSeat:'',ownBehalf:'' }
    if (!values.contractPlan) values.contractPlan = planById(review?.plan ?? order.plan)?.id ?? ''
    if (values.contractStart && !months.includes(values.contractStart)) values.contractStart = ''
    const form = editing || Boolean(stale) || !intake
    return page(c, orderMeta('Overenie pred začatím spolupráce'), <AmlIntakePage order={order} token={token} view={intake} values={values} editing={editing || Boolean(stale)} error={stale ?? undefined} contract={intakeContract(order, months)} retype={Boolean(intake) && form} />)
  }
  const directors = order.directors ?? []
  const contractGateNow = gate ?? await contractGate(c.env.DB, c.env, order)
  const signed = intake?.declaration.contract
  const values: OrderValues = {
    plan: planById(signed?.plan ?? contractGateNow.approval?.review.plan ?? order.plan)?.id ?? 'start',
    start: signed && months.includes(signed.startOn) ? signed.startOn : months[0] ?? '',
    director: directors.length === 1 ? (directors[0]?.name ?? '') : '',
    directorName: '',
    agree: false,
  }
  return page(c, orderMeta(copy.order.title), <OrderPage order={order} token={token} months={months} values={values} errors={{}} gate={contractGateNow} stale={await staleReview(c.env.DB, order)} signed={signed ?? null} />)
})

// Identification is completed before the contract. A signature upload remains pending professional validation.
async function intakeSubmission(c: Ctx, pdfOnly: boolean) {
  const db = c.env.DB
  await ensureSchema(db)
  const token = c.req.param('token') ?? ''
  const order = await orderByToken(db, token)
  if (!order) return orderMissing(c)
  const closed = await orderClosed(c, order)
  if (closed) return closed
  if (!await withinLimit(db, pdfOnly ? 'aml-pdf' : 'aml-intake', order.id, pdfOnly ? 12 : 6, 3600)) return c.text('Skúste to, prosím, neskôr.', 429)
  const body = await c.req.parseBody()
  const values = valuesFrom(body)
  if (pdfOnly) values.truthful = '1' // A draft to sign is not a declaration submitted to us.
  const checked = checkDeclaration(values, bratislavaToday(), appCopy.declaration.errors)
  const months = startMonths(bratislavaToday())
  const contract = intakeContract(order, months)
  const show = (error?: string, status: 409 | 422 = 422) => page(c, orderMeta('Overenie pred začatím spolupráce'), <AmlIntakePage order={order} token={token} view={null} values={values} errors={checked.errors} error={error} editing contract={contract} />, status)
  // An online order: the declaration the person signs also accepts the offer, so the contract can later be concluded
  // only as that person signed it (order.ts, acceptStatements). Without it the signed file would bind nobody to it.
  if (contract) {
    const plan = PLANS.find((p) => p.id === values.contractPlan)
    if (!plan) checked.errors.contractPlan = 'Vyberte balík.'
    if (!months.includes(values.contractStart ?? '')) checked.errors.contractStart = 'Vyberte prvý mesiac služby.'
    if (values.contractAgree !== '1') checked.errors.contractAgree = 'Bez prijatia ponuky nemožno zmluvu po overení uzavrieť.'
    if (checked.declaration && plan && !checked.errors.contractStart && !checked.errors.contractAgree) checked.declaration.contract = { plan: plan.id, startOn: values.contractStart ?? '', terms: TERMS_VERSION }
  }
  if (!checked.declaration || (contract && !checked.declaration.contract)) return show('Doplňte, prosím, označené údaje.')
  if (pdfOnly) return new Response(await declarationPdf(order, checked.declaration), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="Firmony-vyhlasenie.pdf"', 'Cache-Control': 'private, no-store' } })
  const file = await signatureFile(body.podpis)
  if (!file) { checked.errors.podpis = 'Nahrajte pôvodný podpísaný PDF alebo ASiC-E súbor, najviac 25 MB.'; return show() }
  if (!c.env.FILES) return show('Podklady teraz nevieme bezpečne uložiť. Skúste to, prosím, neskôr.', 409)
  try {
    const made = await prepareDossier(db, c.env.FILES, { order }, checked.declaration, file, null)
    await db.batch([made.statement, db.prepare("INSERT INTO events (at, action, subject) VALUES (?, 'aml.intake.submitted', ?)").bind(now(), made.dossier.id)])
  } catch {
    // Preserve an original after an uncertain write. Retention reconciles unlinked files; never delete a possible original here.
    return show('Údaje alebo stav objednávky sa zmenili. Skontrolujte ich a skúste odoslanie znova.', 409)
  }
  return c.redirect(`/objednavka/${token}`, 303)
}
app.post('/objednavka/:token/vyhlasenie.pdf', (c) => intakeSubmission(c, true))
app.post('/objednavka/:token/overenie', (c) => intakeSubmission(c, false))
app.post('/objednavka/:token/banka',async(c)=>{
  await ensureSchema(c.env.DB)
  const order=await orderByToken(c.env.DB,c.req.param('token'))
  if (!order || order.status !== 'open' || order.expiresAt <= now() || !c.env.FILES) return c.notFound()
  if (!await withinLimit(c.env.DB,'aml-bank',order.id,8,3600)) return c.text('Skúste to, prosím, neskôr.',429)
  const view=await dossierOfOrder(c.env.DB,order.id)
  if(!view) return c.notFound()
  const body=await c.req.parseBody(),account=await signatureFile(body.ucet),payment=await signatureFile(body.platba)
  if(!account || !payment) return c.text('Nahrajte oba pôvodné doklady ako PDF alebo ASiC-E, každý najviac 25 MB.',422)
  const statement=await prepareBankEvidence(c.env.DB,c.env.FILES,view.dossier,account,payment,null,order.tokenHash ?? null)
  await statement.run()
  return c.redirect(`/objednavka/${c.req.param('token')}`,303)
})


/** A standard review whose seven days have passed: the director may ask for a new link. */
async function staleReview(db: D1Database, order: Order): Promise<boolean> {
  const review = await latestOrderReview(db, order.id)
  return Boolean(review && review.decision === 'standard' && review.expires_at <= now())
}

// The director asks for a new link to an order whose review ran out: the request is open again and we are rung.
app.post('/objednavka/:token/novy', async (c) => {
  const db = c.env.DB
  await ensureSchema(db)
  const token = c.req.param('token')
  const order = await orderByToken(db, token)
  if (!order) return orderMissing(c)
  const closed = await orderClosed(c, order)
  if (closed) return closed
  if (!(await staleReview(db, order))) return c.redirect(`/objednavka/${token}`, 303)
  if (await withinLimit(db, 'order-renew', order.id, 3, 86400)) {
    await db.batch([
      db.prepare("UPDATE requests SET status = 'new' WHERE id = ? AND status <> 'client'").bind(order.requestId ?? ''),
      db.prepare("INSERT INTO events (at, company_id, user_id, action, subject) VALUES (?, NULL, NULL, 'contract.link.requested', ?)").bind(now(), order.id),
      ringStatement(db, 'order-renew', `${order.id}:${now()}`, BRAND.email, bell.teamRenew(`${siteOrigin(c)}/ucto/ziadosti/${order.requestId}/posudenie`)),
    ])
    later(c, flushOutbox(db, c.env.EMAIL))
  }
  return page(c, orderMeta(copy.order.askedTitle), <OrderAsked />)
})

app.post('/objednavka/:token', async (c) => {
  const db = c.env.DB
  await ensureSchema(db)
  const token = c.req.param('token')
  const order = await orderByToken(db, token)
  if (!order) return orderMissing(c)
  const closed = await orderClosed(c, order)
  if (closed) return closed
  const body = await c.req.parseBody()
  const months = startMonths(bratislavaToday())
  const values: OrderValues = {
    plan: field(body.plan, 10),
    start: field(body.start, 10),
    director: field(body.director, 160),
    directorName: field(body.directorName, 160).replace(/\s+/g, ' '),
    agree: body.agree === '1',
  }
  const errors: OrderErrors = {}
  const gate = await contractGate(db, c.env, order)
  const plan = planById(values.plan)
  if (!plan) errors.plan = copy.order.errors.plan
  if (!months.includes(values.start)) errors.start = copy.order.errors.start
  const directors = order.directors ?? []
  let signedBy = ''
  let signedRole: string | null = null
  if (directors.length > 0) {
    // Only a director the register named in office: the name is taken as the register writes it.
    const chosen = directors.find((d) => d.name === values.director)
    if (chosen) {
      signedBy = chosen.name
      signedRole = chosen.role
    } else errors.director = copy.order.errors.director
  } else if (values.directorName.length >= 5 && values.directorName.includes(' ')) signedBy = values.directorName
  else errors.directorName = copy.order.errors.directorName
  if (!values.agree) errors.agree = copy.order.errors.agree
  const form = (status: 409 | 422 | 429 | 500, extra: OrderErrors = {}) =>
    page(c, orderMeta(copy.order.title), <OrderPage order={order} token={token} months={months} values={values} errors={{ ...errors, ...extra }} gate={gate} />, status)
  // Members who act only together do not conclude it online one by one (the register's manner of acting).
  if (!oneMayConclude(order.legalForm ?? 'sro', order.directors, order.acting)) return form(409, { form: copy.order.errors.joint })
  if (Object.keys(errors).length > 0 || !plan) return form(422, { form: copy.order.errors.summary })
  if (!gate.ready || !gate.approval) return form(409, { form: 'Ponuku ešte preverujeme. Zmluvu môžete uzavrieť až po potvrdení rozsahu služby.' })
  if (body.proposal !== gate.offerHash) {
    values.agree = false
    return form(409, { form: 'Ponuka sa zmenila. Prečítajte si aktuálne podmienky a potvrďte ich znova.' })
  }
  if (signedBy !== gate.approval.aml?.signerName) return form(409, { form: 'Zmluvu môže uzavrieť iba osoba, ktorej totožnosť sme overili. Pri zmene zastupujúcej osoby potrebujeme nové overenie.' })
  if (plan.id !== gate.approval.review.plan) return form(409, { form: 'Vybraný balík potrebuje nové potvrdenie rozsahu služby. Napíšte nám, prosím.' })
  // Only the offer the identified person accepted in the declaration signed with a qualified signature (finding of the
  // review of 26 October 2026): whoever holds the emailed link concludes nothing else in that person's name.
  const signedOffer = (await dossierOfOrder(db, order.id))?.declaration.contract
  if (!signedOffer || signedOffer.plan !== plan.id || signedOffer.startOn !== values.start || signedOffer.terms !== TERMS_VERSION)
    return form(409, { form: 'Zmluvu možno uzavrieť iba v znení, ktoré osoba konajúca za firmu prijala v podpísanom vyhlásení: ten istý balík, prvý mesiac a obchodné podmienky. Pri zmene treba vyhlásenie podpísať znova.' })
  if (!(await withinLimit(db, 'order', connection(c), ORDER.acceptsPerHour, 3600))) return form(429, { form: copy.order.errors.throttle })

  const existing = await userByEmail(db, order.email)
  const companyId = crypto.randomUUID()
  const userId = existing?.id ?? crypto.randomUUID()
  let inbox = inboxCode()
  for (let i = 0; i < 5 && (await db.prepare('SELECT 1 AS x FROM companies WHERE inbox = ?').bind(inbox).first()); i++) inbox = inboxCode()
  const accepted = await acceptStatements(db, order, { plan: plan.id, startOn: values.start, signedBy, signedRole, ipHash: await sha256Hex(`order:${connection(c)}`), approval: gate.approval }, { companyId, userId, existingUser: Boolean(existing), inbox })
  await db.batch(accepted.statements)
  if (!(await acceptedAs(db, order.id, companyId))) {
    // Another acceptance, expiry or a newer scope decision may have won the race with this batch.
    const again = await orderByToken(db, token)
    const closedAgain = again && await orderClosed(c, again)
    if (closedAgain) return closedAgain
    values.agree = false
    return page(c, orderMeta(copy.order.title), <OrderPage order={again ?? order} token={token} months={months} values={values}
      errors={{ form: 'Stav ponuky sa medzitým zmenil. Pred podpisom potrebujeme opäť potvrdiť rozsah služby.' }}
      gate={await contractGate(db, c.env, again ?? order)} />, 409)
  }

  // The client gets a doorbell with the sign-in link: the contract and its terms are read in the app (/app/zmluva).
  const login = await newLink(db, userId, TEAM.welcomeDays * 24 * 60)
  await db.batch([
    login.statement,
    ringStatement(db, 'contract', order.id, order.email, bell.contract(`${siteOrigin(c)}/app/vstup?t=${login.token}`)),
    ringStatement(db, 'contract-team', order.id, BRAND.email, bell.teamContract(`${siteOrigin(c)}/ucto/klienti/${companyId}`)),
  ])
  later(c, flushOutbox(db, c.env.EMAIL))
  const where = await startSession(c, db, userId, companyId)
  return c.redirect(where ? quickSignin('/app?ok=zmluva') : '/app/prihlasenie', 303)
})

app.get('/podmienky', async (c) =>
  page(c, { title: `Obchodné podmienky | ${BRAND.name}`, description: typeset(`Obchodné podmienky služby ${BRAND.name}: zmluva o vedení účtovníctva a o spracúvaní osobných údajov.`), path: '/podmienky' }, <TermsPage released={Boolean(approvedRelease(c.env.CONTRACT_RELEASE, await contractCatalogueHash()))} />),
)

// ---------------------------------------------------------------------------
// The rest
// ---------------------------------------------------------------------------

app.get('/pravne-informacie', (c) =>
  page(c, { title: `Právne informácie | ${BRAND.name}`, description: typeset(`Kto stojí za ${BRAND.name} a ako chránime osobné údaje.`), path: '/pravne-informacie' }, <Legal />),
)

// The page of an issued invoice that its customer opens from the link the client sent, its PDF and its e-invoice: no
// sign-in, the token of 32 random bytes is the key, and nothing of it is for search engines.
app.get('/f/:token', async (c) => {
  await ensureSchema(c.env.DB)
  const found = await invoiceByToken(c.env.DB, c.req.param('token'))
  const seller = found ? await getCompany(c.env.DB, found.company) : null
  if (!found || !seller) return c.notFound()
  const lines = await invoiceLines(c.env.DB, found.invoice.id)
  return c.html(html`<!doctype html>${(<PublicInvoicePage invoice={found.invoice} lines={lines} seller={seller} token={c.req.param('token')} />)}`)
})

app.get('/f/:token/logo', async (c) => {
  await ensureSchema(c.env.DB)
  const found = await invoiceByToken(c.env.DB, c.req.param('token'))
  const seller = found ? await getCompany(c.env.DB, found.company) : null
  if (!found || !seller) return c.notFound()
  return logoResponse(c.env.FILES, seller)
})

// The invoice's PDF for its customer (invoice-pdf.ts): the same rules as the page, a draft's token opens nothing.
app.get('/f/:token/pdf', async (c) => {
  await ensureSchema(c.env.DB)
  const found = await invoiceByToken(c.env.DB, c.req.param('token'))
  const seller = found ? await getCompany(c.env.DB, found.company) : null
  if (!found || !seller || !found.invoice.number) return c.notFound()
  return pdfResponse(found.invoice, await invoiceLines(c.env.DB, found.invoice.id), seller, c.env.FILES, c.req.query('nahlad') === '1', bratislavaToday())
})

app.get('/f/:token/xml', async (c) => {
  await ensureSchema(c.env.DB)
  const found = await invoiceByToken(c.env.DB, c.req.param('token'))
  const seller = found ? await getCompany(c.env.DB, found.company) : null
  // A request for an advance is no invoice: it has no e-invoice.
  if (!found || !seller || found.invoice.kind === 'proforma') return c.notFound()
  return xmlResponse(found.invoice, await invoiceLines(c.env.DB, found.invoice.id), seller)
})

app.route('/auth', securityRoutes)
// The postman tells of a sending's state and delivers e-invoices to our companies (peppol/store.ts).
app.post(PEPPOL_NOTICES, async (c) => {
  const provider = providerOf(c.env)
  if (!provider) return c.text('Not found', 404)
  // The signature covers the bytes as they came; nothing of the notice is read before it is checked.
  const body = new Uint8Array(await c.req.arrayBuffer())
  const notice = await provider.events(c.req.raw, body)
  if (!notice) return c.text('Forbidden', 403)
  // Too many events at once: refused whole, so the postman sends them again in parts and none is lost.
  if (notice.tooMany) return c.text('Too many events', 413)
  await noteMalformed(c.env.DB, provider.name, notice.malformed)
  const outcome = await applyEvents(c.env, provider, notice.events, (work) => later(c, work))
  // An event that failed is kept for the administrator, and the postman is asked to send the notice again: every step
  // repeats safely (a reference is taken once, a status moves only forward).
  return c.json({ ok: outcome.failed === 0, ...outcome, malformed: notice.malformed }, outcome.failed > 0 ? 503 : 200)
})

// Mony answers before the app's own routes, which ask for a company: somebody of the team alone asks it too.
app.post('/app/mony', (c) => monyAnswer(c as never))
app.route('/app', appRoutes)
app.route('/ucto', teamRoutes)

app.get('/robots.txt', (c) => c.text(robotsTxt()))
app.get('/llms.txt', (c) => c.text(llmsTxt()))
app.get('/llms-full.txt', (c) => c.text(llmsFullTxt()))
app.get(`/${INDEXNOW_KEY}.txt`, (c) => c.text(INDEXNOW_KEY))

// The guides (content/guides.ts): one page a question people search, with its own data for search engines.
for (const guide of GUIDES) {
  app.get(guide.path, (c) =>
    page(
      c,
      {
        title: typeset(guide.title),
        description: typeset(guide.description),
        path: guide.path,
        jsonLd: jsonLd([
          organization(),
          article({ title: guide.title, description: guide.description, path: guide.path, published: guide.published, modified: guide.modified }),
          breadcrumbs(`${guide.first} ${guide.second}`, guide.path),
          ...(guide.faq.length > 0 ? [faqPage(guide.faq, guide.path)] : []),
        ]),
      },
      <GuidePage guide={guide} />,
    ),
  )
}

// The net wage calculator: a GET form computed by the payroll engine (app/wage-calc.ts), for search engines too.
app.get(WAGE_PATH, (c) => {
  const asked = wageQueryOf(c.req.query(), bratislavaToday())
  const year = wageYearOf(c.req.query('rok'), bratislavaToday())
  const result = asked.query ? wageCalc(asked.query) : null
  // A computed page is one of many addresses: only the empty form is the page search engines keep.
  const computed = c.req.query('hruba') !== undefined
  return page(
    c,
    {
      title: typeset(WAGE_PAGE.title),
      description: typeset(WAGE_PAGE.description),
      path: WAGE_PATH,
      noindex: computed,
      jsonLd: jsonLd([
        organization(),
        {
          '@type': 'WebApplication',
          '@id': `${BRAND.origin}${WAGE_PATH}#kalkulacka`,
          name: plain(`${WAGE_PAGE.first} ${WAGE_PAGE.second}`),
          description: plain(WAGE_PAGE.description),
          url: `${BRAND.origin}${WAGE_PATH}`,
          applicationCategory: 'FinanceApplication',
          operatingSystem: 'Any',
          inLanguage: 'sk',
          offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
          provider: { '@id': `${BRAND.origin}/#organizacia` },
        },
        breadcrumbs(WAGE_PAGE.nav, WAGE_PATH),
        faqPage(WAGE_PAGE.faq, WAGE_PATH),
      ]),
    },
    <WageCalcPage query={asked.query} result={result} error={asked.error} year={year} />,
  )
})

// The SZČO tax-and-levy calculator: a GET form computed by the engine (app/szco-calc.ts), for search engines too.
app.get(SZCO_PATH, (c) => {
  const asked = szcoQueryOf(c.req.query(), bratislavaToday())
  const year = szcoYearOf(c.req.query('rok'), bratislavaToday())
  const result = asked.query ? szcoCalc(asked.query) : null
  const computed = c.req.query('prijem') !== undefined
  return page(
    c,
    {
      title: typeset(SZCO_PAGE.title),
      description: typeset(SZCO_PAGE.description),
      path: SZCO_PATH,
      noindex: computed,
      jsonLd: jsonLd([
        organization(),
        {
          '@type': 'WebApplication',
          '@id': `${BRAND.origin}${SZCO_PATH}#kalkulacka`,
          name: plain(`${SZCO_PAGE.first} ${SZCO_PAGE.second}`),
          description: plain(SZCO_PAGE.description),
          url: `${BRAND.origin}${SZCO_PATH}`,
          applicationCategory: 'FinanceApplication',
          operatingSystem: 'Any',
          inLanguage: 'sk',
          offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
          provider: { '@id': `${BRAND.origin}/#organizacia` },
        },
        breadcrumbs(SZCO_PAGE.nav, SZCO_PATH),
        faqPage(SZCO_PAGE.faq, SZCO_PATH),
      ]),
    },
    <SzcoCalcPage query={asked.query} result={result} error={asked.error} year={year} />,
  )
})

// The SRO corporate-tax and dividend calculator: a GET form computed by the engine (app/sro-calc.ts).
app.get(SRO_PATH, (c) => {
  const { query, error, asked } = sroQueryOf(c.req.query())
  const result = query ? sroCalc(query) : null
  return page(
    c,
    {
      title: typeset(SRO_PAGE.title),
      description: typeset(SRO_PAGE.description),
      path: SRO_PATH,
      noindex: asked,
      jsonLd: jsonLd([
        organization(),
        {
          '@type': 'WebApplication',
          '@id': `${BRAND.origin}${SRO_PATH}#kalkulacka`,
          name: plain(`${SRO_PAGE.first} ${SRO_PAGE.second}`),
          description: plain(SRO_PAGE.description),
          url: `${BRAND.origin}${SRO_PATH}`,
          applicationCategory: 'FinanceApplication',
          operatingSystem: 'Any',
          inLanguage: 'sk',
          offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
          provider: { '@id': `${BRAND.origin}/#organizacia` },
        },
        breadcrumbs(SRO_PAGE.nav, SRO_PATH),
        faqPage(SRO_PAGE.faq, SRO_PATH),
      ]),
    },
    <SroCalcPage query={query} result={result} error={error} />,
  )
})

app.get(TOOLS_PATH, (c) => page(c, {
  title: 'Bezplatné nástroje pre podnikateľov | Firmony',
  description: 'Faktúra v PDF, mzdová kalkulačka a porovnanie nákladov na účtovníctvo. Bez registrácie a objednania účtovnej služby.',
  path: TOOLS_PATH,
}, <FreeToolsPage />))

app.get(INVOICE_PATH, (c) => page(c, {
  ...INVOICE_META, path: INVOICE_PATH,
  jsonLd: jsonLd([organization(), breadcrumbs('Faktúra zadarmo', INVOICE_PATH), {
    '@type': 'WebApplication', name: 'Firmony: faktúra zadarmo', url: `${BRAND.origin}${INVOICE_PATH}`,
    description: INVOICE_META.description, applicationCategory: 'FinanceApplication', operatingSystem: 'Any', inLanguage: 'sk',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' }, provider: { '@id': `${BRAND.origin}/#organizacia` },
  }]),
}, <FreeInvoicePage today={bratislavaToday()} />))

app.get('/sitemap.xml', (c) => {
  c.header('Content-Type', 'application/xml; charset=utf-8')
  return c.body(sitemapXml())
})

app.get('/healthz', async (c) => {
  try {
    await ensureSchema(c.env.DB)
    return c.json({ ok: true, schema: SCHEMA_VERSION, build: BUILD_METADATA })
  } catch {
    return c.json({ ok: false, build: BUILD_METADATA }, 503)
  }
})

app.notFound((c) => page(c, { title: `${copy.notFound.title} | ${BRAND.name}`, description: copy.meta.description, path: new URL(c.req.url).pathname, noindex: true }, <NotFound />, 404))

app.onError((err, c) => {
  if (payrollBlocked(err)) return c.text('Uzávierku sme neotvorili. Už má evidované odoslanie výkazu alebo skutočné vyplatenie príjmov. Originály zostávajú zachované; opravu musí posúdiť odborný správca v evidencii mzdových podaní.', 409)
  if (isFilingSent(err)) return page(c, { title: 'Podanie má evidované doručenie', description: '', path: c.req.path, noindex: true }, <main class="section"><h1>Podanie sme nezrušili</h1><p>Máme k nemu evidované odoslanie alebo potvrdenie. Históriu zachováme. Opravu vyriešte cez evidenciu podaní alebo s odborným správcom.</p><a href="/ucto/terminy">Späť na termíny</a></main>, 409)
  if (isEvidenceHeld(err)) return c.text('Tento záznam musíme uchovať. Vymazanie sme nevykonali. Obráťte sa na zodpovedného správcu.', 409)
  if (isPeriodLocked(err)) return page(c, { title: 'Uzamknuté účtovné obdobie', description: '', path: c.req.path, noindex: true },
    <section class="section"><h1>Účtovné obdobie je uzamknuté.</h1><p>Zmenu sme neuložili. Účtovníčka musí najprv otvoriť príslušné obdobie v Účtovnej knihe, v časti Uzamknutie období, a uviesť dôvod.</p>
      <a class="btn btn--line" href={c.req.path.startsWith('/ucto') ? '/ucto' : '/app'}>Späť do aplikácie</a></section>, 409)
  console.error('request failed', err instanceof Error ? err.name : 'error')
  return c.text('Niečo sa pokazilo. Skúste to znova o chvíľu.', 500)
})

export default {
  fetch: app.fetch,
  /** Email to a company's address for documents (src/app/inbox.ts). */
  async email(message: ForwardableEmailMessage, env: Bindings, ctx: ExecutionContext) {
    try {
      await ensureSchema(env.DB)
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
        try {
          await purge(env.DB)
        } catch (err) {
          console.error('purge failed', err instanceof Error ? err.name : 'error')
        }
        try {
          await appScheduled(env, event.scheduledTime)
        } catch (err) {
          console.error('app schedule failed', err instanceof Error ? err.name : 'error')
        }
        try {
          // E-invoices whose next try has come (the postman did not take them at once).
          const provider = providerOf(env)
          if (provider) await sendDue(env.DB, provider)
          // The SML's answers past three days, and what the postman's part keeps no longer.
          await purgePeppol(env.DB, env.FILES)
        } catch (err) {
          console.error('peppol schedule failed', err instanceof Error ? err.name : 'error')
        }
        try {
          await announceSite(env.DB, env.ANNOUNCE === '1')
        } catch (err) {
          console.error('announcing the site failed', err instanceof Error ? err.name : 'error')
        }
      })(),
    )
  },
}
