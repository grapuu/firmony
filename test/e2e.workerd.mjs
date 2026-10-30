import {aml,archiveEnded,purgeCompany,forgetRecords,GUIDES,BUILD_METADATA,SCHEMA_VERSION,startMonths,TERMS_VERSION,purgeFoundings} from '../.wrangler/dist/stores.js'
import {checkAmlAdmission,ensureAmlOfficer,seedAmlDossier,testDeclaration} from './aml.runtime.mjs'
import { checkAmlFixes } from './aml-fixes.runtime.mjs'
// The bundle that gets deployed, run in the real Workers runtime (workerd) with a local database, the pretend
// email service and the pretend register of test/pretend.mjs. Nothing leaves the machine.
//
//   npm run test:runtime
import { Miniflare, Response as MfResponse, convertV4MiniflareOptions } from 'miniflare'
import { check, done } from './check.mjs'
import { checkPeriodLocks } from './periods.runtime.mjs'
import { checkSupportQueue } from './support.runtime.mjs'
import { checkContractTransactions } from './contracts.runtime.mjs'
import { checkSecurity } from './security.runtime.mjs'
import { checkIncidents } from './incidents.runtime.mjs'
import { checkRestore } from './restore.runtime.mjs'
import { checkAmlMigration } from './aml-migration.runtime.mjs'
import { checkBilling } from './billing.runtime.mjs'
import { checkBeforeStart } from './start.runtime.mjs'
import { checkAutomation } from './automation.runtime.mjs'
import { checkFilings } from './filings.runtime.mjs'
import { checkBundle } from './bundle.runtime.mjs'
import { checkAssets } from './assets.runtime.mjs'
import { checkPayrollReports } from './payroll-reporting.runtime.mjs'
import { checkPrehlad } from './prehlad.runtime.mjs'
import { checkPayrollMigration } from './payroll-migration.runtime.mjs'
import { checkHealthReports } from './health.runtime.mjs'
import { checkHealthMigration } from './health-migration.runtime.mjs'
import { checkSocialReports } from './social.runtime.mjs'
import { checkSocialMigration } from './social-migration.runtime.mjs'
import { checkClosingPod } from './closing-pod.runtime.mjs'
import { checkStock } from './stock.runtime.mjs'
import { checkPayrollFull } from './payroll-full.runtime.mjs'
import { checkTakeover } from './takeover.runtime.mjs'
import { checkCurrency } from './currency.runtime.mjs'
import { checkOss } from './oss.runtime.mjs'
import { checkIntrastat } from './intrastat.runtime.mjs'
import { checkBundleExtras } from './bundle-extras.runtime.mjs'
import { checkCreditNotes } from './credit-notes.runtime.mjs'
import { checkAdvances } from './advances.runtime.mjs'
import { checkInvoiceCurrency } from './invoice-currency.runtime.mjs'
import { checkRepeats } from './repeat.runtime.mjs'
import { checkPayOrders } from './payorders.runtime.mjs'
import { checkNumbering } from './numbering.runtime.mjs'
import { checkTrips } from './trips.runtime.mjs'
import { checkCash } from './cash.runtime.mjs'
import { checkDunning } from './dunning.runtime.mjs'
import { checkTakings } from './takings.runtime.mjs'
import { checkApprovals } from './approvals.runtime.mjs'
import { checkMeals } from './meals.runtime.mjs'
import { checkGarnish } from './garnish.runtime.mjs'
import { checkVatRatio } from './vat-ratio.runtime.mjs'
import { checkUnpaid53b } from './vat-53b.runtime.mjs'
import { checkBadDebt } from './bad-debt.runtime.mjs'
import { checkTriangle } from './triangle.runtime.mjs'
import { checkAssetVat } from './asset-vat.runtime.mjs'
import { checkWorkPay } from './work-pay.runtime.mjs'
import { checkUsers } from './users.runtime.mjs'
import { checkAiAccuracy } from './ai-accuracy.runtime.mjs'
import { checkAutobook } from './autobook.runtime.mjs'
import { checkAutobookAtomic } from './autobook-atomic.runtime.mjs'
import { checkOverviewRuntime } from './overview.runtime.mjs'
import { checkDeliveryRuntime } from './delivery.runtime.mjs'
import { checkManagedTakeover } from './managed-takeover.runtime.mjs'
import { checkAssistantRuntime } from './assistant.runtime.mjs'
import { checkFormationRuntime } from './formation.runtime.mjs'
import { checkInvoicingRuntime } from './invoicing.runtime.mjs'
import { checkAnalyticsRuntime } from './analytics.runtime.mjs'
import { assistantProviderFixture } from './assistant.fixture.mjs'
import { monyProviderFixture } from './mony.fixture.mjs'
import { checkMony } from './mony.runtime.mjs'
import { checkVatRegistration } from './vat-registration.runtime.mjs'
import { checkTransactionTax } from './transaction-tax.runtime.mjs'
import { checkCenters } from './centers.runtime.mjs'
import { checkJointStock } from './joint-stock.runtime.mjs'
import { checkLists } from './lists.runtime.mjs'
import { socialReporting } from '../.wrangler/dist/stores.js'
import { authenticator, jsonClient, TEST_BOOTSTRAP } from './passkeys.fixture.mjs'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { crc32 } from 'node:zlib'
import { createHash } from 'node:crypto'
import { validateXML } from 'xmllint-wasm'
import { PEPPOL_TEST, PRETEND_MAIL, camtXml, pretendBank, pretendFio, pretendPeppol, readerAnswer, ecbAnswer, registerAnswer, statementMail } from './pretend.mjs'
import { checkPeppolNetwork } from './peppol-network.runtime.mjs'
import { checkPasskeySignin } from './passkey-signin.runtime.mjs'
import { checkFoundingRuntime } from './founding.runtime.mjs'
import { sanctionsAnswer } from './sanctions-fixtures.mjs'
import { checkSanctionsRuntime } from './sanctions.runtime.mjs'
import { checkNudgeRuntime } from './nudge.runtime.mjs'
import { checkTatraRuntime } from './tatra.runtime.mjs'
import { checkAdminOverview } from './admin-overview.runtime.mjs'
import { checkDueRuntime } from './due.runtime.mjs'
import { ruzAnswer, RUZ_LAST } from './ruz-fixtures.mjs'
import { bookTaxStatements, closingsOf, fileClosingStatement, payslip, exportYears, exportYear, beginExport, completeExport, confirmExport, dataRevision, confirmedRevision, fileSummaryStatement, svViewsOf, summariesFiled, docsAround, companyOf, summaryXml, teamDeadlines, approvedRelease, contractCatalogueHash, resolveContract, currentPackage, payrollReporting, payrollGeneration, healthReporting } from '../.wrangler/dist/stores.js'

const dist = new URL('../.wrangler/dist', import.meta.url).pathname
if (process.env.FIRMONY_CAPTURE_DIR) mkdirSync(process.env.FIRMONY_CAPTURE_DIR, { recursive: true })
const lookups = []
const readings = []
const notices = []
const assistantProvider=assistantProviderFixture()
const mony = monyProviderFixture()
let indexNowAnswer = null
// The bank of Firma A: what it holds is set by the part of the test that reads it.
const bankFeed = { transactions: [], balance: '0.00' }
const bank = pretendBank({ iban: 'SK3112000000198742637541', transactions: () => bankFeed.transactions, balance: () => bankFeed.balance, extraAccount: 'SK7311000000002934567890' })
// Fio banka of Firma S, read by one token.
const FIO_TOKEN = 'Fio2026tokenAbCdEfGh0123456789IjKlMnOpQrStUvWxYz0123456789abcdef'.slice(0, 64)
const fioFeed = { transactions: [], closing: 0 }
const fio = pretendFio({ iban: 'SK2283300000002801234567', tokens: [FIO_TOKEN], transactions: () => fioFeed.transactions, closing: () => fioFeed.closing })
// The Peppol network: the SML over DNS over HTTPS for every Worker, and the pretend postman for the one that has it.
const network = pretendPeppol({ registered: ['0245:2023489446'] })
const mf = new Miniflare(
  convertV4MiniflareOptions({
    // Miniflare otherwise fetches https://workers.cloudflare.com/cf.json for Request.cf metadata.
    // Fixtures and all services are local; explicitly disable that independent metadata fetch as well.
    cf: false,
    unsafeTriggerHandlers: true,
    workers: [
      {
        name: 'firmony',
        modulesRoot: dist,
        modules: [{ type: 'ESModule', path: `${dist}/index.js` }],
        compatibilityDate: '2026-10-01',
        d1Databases: { DB: 'firmony-e2e' },
        r2Buckets: { FILES: 'firmony-e2e-files' },
        bindings: { TEAM_BOOTSTRAP_EMAIL: 'ahoj@firmony.io', TEAM_BOOTSTRAP_TOKEN: TEST_BOOTSTRAP, TEAM_BOOTSTRAP_EXPIRES_AT: String(Math.floor(Date.now() / 1000) + 3600), CONTRACT_RELEASE: JSON.stringify({ catalogueHash: await contractCatalogueHash(), legalReview: 'TEST-ONLY lawyer fixture', insuranceReview: 'TEST-ONLY insurer fixture', validUntil: Math.floor(Date.now() / 1000) + 3600 }), ANTHROPIC_API_KEY: 'pretend', ENABLE_BANKING_APP: bank.app, ENABLE_BANKING_KEY: bank.privateKey, ANNOUNCE: '1' },
        serviceBindings: { EMAIL: 'pretend-mail' },
        async outboundService(request) {
          const networked = await network.answer(request.clone())
          if (networked) return new MfResponse(await networked.text(), { status: networked.status, headers: { 'content-type': 'application/json' } })
          const assistant=await assistantProvider.answer(request)
          if(assistant)return new MfResponse(await assistant.text(),{status:assistant.status,headers:assistant.headers})
          if (['api.indexnow.org', 'www.bing.com'].includes(new URL(request.url).hostname)) {
            notices.push({ ...JSON.parse(await request.text()), agent: request.headers.get('user-agent'), sentTo: new URL(request.url).hostname })
            return new MfResponse('', { status: indexNowAnswer ?? (notices.length === 1 ? 202 : 200) })
          }
          const banked = await bank.answer(request)
          if (banked) return new MfResponse(await banked.text(), { status: banked.status, headers: { 'content-type': 'application/json' } })
          const fromFio = await fio.answer(request)
          if (fromFio) return new MfResponse(await fromFio.text(), { status: fromFio.status, headers: { 'content-type': 'application/json' } })
          const monyAnswered = await mony.answer(request)
          if (monyAnswered) return new MfResponse(await monyAnswered.text(), { status: monyAnswered.status, headers: monyAnswered.headers })
          const read = await readerAnswer(request, readings)
          if (read) return new MfResponse(await read.text(), { status: read.status, headers: { 'content-type': 'application/json' } })
          const answer = registerAnswer(request.url, lookups)
          if (answer) return new MfResponse(await answer.text(), { status: answer.status, headers: { 'content-type': 'application/json' } })
          const ecb = ecbAnswer(request.url)
          if (ecb) return new MfResponse(await ecb.text(), { status: ecb.status, headers: { 'content-type': 'text/xml' } })
          const listed = sanctionsAnswer(request.url)
          if (listed) return new MfResponse(listed.status === 302 ? null : await listed.text(), { status: listed.status, headers: Object.fromEntries(listed.headers) })
          const statements = ruzAnswer(request.url)
          if (statements) return new MfResponse(await statements.text(), { status: statements.status, headers: { 'content-type': 'application/json' } })
          return new MfResponse('unexpected request', { status: 599 })
        },
      },
      {
        // The same app with the pretend postman connected (peppol/provider.ts), on the same database and files.
        name: 'firmony-peppol',
        routes: ['peppol.firmony.io/*'],
        modulesRoot: dist,
        modules: [{ type: 'ESModule', path: `${dist}/index.js` }],
        compatibilityDate: '2026-10-01',
        d1Databases: { DB: 'firmony-e2e' },
        r2Buckets: { FILES: 'firmony-e2e-files' },
        bindings: { ANTHROPIC_API_KEY: 'pretend', PEPPOL_PROVIDER: 'pretend', PEPPOL_API_URL: PEPPOL_TEST.url, PEPPOL_API_KEY: PEPPOL_TEST.key, PEPPOL_WEBHOOK_SECRET: PEPPOL_TEST.secret, PEPPOL_SMP_HOST: PEPPOL_TEST.smp },
        serviceBindings: { EMAIL: 'pretend-mail' },
        async outboundService(request) {
          const networked = await network.answer(request.clone())
          if (networked) return new MfResponse(await networked.text(), { status: networked.status, headers: { 'content-type': 'application/json' } })
          const read = await readerAnswer(request)
          if (read) return new MfResponse(await read.text(), { status: read.status, headers: { 'content-type': 'application/json' } })
          return new MfResponse('unexpected request', { status: 599 })
        },
      },
      { name: 'firmony-unreleased', modulesRoot: dist, modules: [{ type: 'ESModule', path: `${dist}/index.js` }], compatibilityDate: '2026-10-01', d1Databases: { DB: 'firmony-e2e' } },
      { name: 'pretend-mail', modules: true, compatibilityDate: '2026-10-01', script: PRETEND_MAIL },
    ],
  }),
)

const site = 'https://firmony.io'
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
check(
  'it says at once what Firmony is and why: an accounting firm for a fixed price, three reasons and a plain comparison',
  page.includes('Účtovníctvo pre Vašu s.') && page.includes('Vy pošlete doklad, my urobíme zvyšok.') && !page.includes('bez DPH') && page.replace(/\u00a0/g, ' ').includes('Menej ako 3 € denne') && page.includes('class="ticket"') && !page.includes('Novinka') && page.replace(/\u00a0/g, ' ').includes('Bude mi viesť účtovníctvo softvér?') && page.includes('action="/zacat/email"') && page.includes('Online účtovná firma za pevnú cenu') && page.includes('dohodnuté priznania') &&
    (page.match(/class="card why__card"/g) ?? []).length === 3 && page.includes('čom sme iní.') && (page.match(/<span class="tick"/g) ?? []).length >= 5 && (page.match(/class="faq__item"/g) ?? []).length === 6 && page.includes('href="/bezplatne-nastroje"'),
)
check(
  'the founder speaks to people in his own words, and whoever does not know something is sent to Mony in the corner',
  page.includes('pocit, že som na to všetko sám') && page.includes('my Vám poradíme') && !page.includes('Vaša účtovníčka Vám poradí') &&
    page.replace(/\u00a0/g, ' ').includes('našej pomocníčky vpravo dole') && (page.match(/data-mony-call/g) ?? []).length === 2,
)
check(
  'the free tools and the investors\' free tax return stand out: in the menu, the phone\'s menu, a section of their own and the footer',
  (page.match(/class="top__hot"/g) ?? []).length === 4 && page.includes('class="top__menu"') && page.includes('Ešte viac od Firmony.') && page.includes('Daňové priznanie z investícií') &&
    (page.match(/extras__tag--free/g) ?? []).length === 2 && !page.includes('extras__tag--extra') && ['/faktura-zadarmo', '/mzdova-kalkulacka', '/szco-kalkulacka', '/sro-kalkulacka'].every((h) => page.includes(`href="${h}"`)) &&
    (page.match(/class="foot__hot"/g) ?? []).length === 3,
)
check(
  'the s. r. o. for 1 € is right under the opening, with its chip, its way in and every condition said',
  page.indexOf('id="sro-za-euro"') > page.indexOf('id="hero-title"') && page.indexOf('id="sro-za-euro"') < page.indexOf('id="ako-to-funguje"') &&
    page.includes('href="#sro-za-euro"') && page.replace(/\u00a0/g, ' ').includes('Chcem s. r. o. za 1 €') && page.includes('href="/zalozenie"') &&
    ['aspoň 36 mesiacov', 'potom zmluva pokračuje bez viazanosti', 'kauciu 549 €', 'z posledných faktúr', 'platíte ho mesačne od vzniku firmy', 'osobne ručí', 'najviac 12', 'prvých 20 firiem'].every((t) => page.replace(/\u00a0/g, ' ').includes(t)) &&
    !page.replace(/\u00a0/g, ' ').includes('nespája s prvým mesiacom zadarmo') && !page.includes('Základné imanie') &&
    !page.includes('platí zakladateľ') && page.replace(/\u00a0/g, ' ').includes('Výnimkou je ponuka s. r. o. za 1 €'),
)
{
  const guide = (await (await get('/zalozenie-sro')).text()).replace(/\u00a0/g, ' ')
  check('the guide to founding an s. r. o. offers it for 1 € at once', guide.includes('class="guide__deal"') && guide.includes('Chcem s. r. o. za 1 €') && guide.includes('href="/zalozenie"') && guide.includes('href="/#sro-za-euro"'))
}
if (process.env.FIRMONY_CAPTURE_DIR) writeFileSync(`${process.env.FIRMONY_CAPTURE_DIR}/home.html`, page)
check(
  'it names the prices of all three plans',
  [89, 169, 329].every((p) => page.includes(`${p}${NB}€`)),
)
const runs = (html) => (html.match(/<script(?![^>]*type="application\/ld\+json")[^>]*>/gi) ?? [])
// Only our own scripts, each from its file with the build in its address, and nothing inline (27 October 2026: the
// version check, client/fresh.ts, and Mony on every page; the month played by scrolling on the home page).
const ownScripts = (html, names) => runs(html).every((tag) => new RegExp(`^<script src="/(?:${names.join('|')})\\.js\\?v=[a-f0-9]{8}" defer(?:="")?>$`).test(tag))
check(
  'it runs only its own scripts: the month played where scroll timelines are missing, the version check and Mony, nothing inline',
  ownScripts(page, ['flow', 'fresh', 'mony']) && /<script src="\/flow\.js\?v=[a-f0-9]{8}" defer(="")?><\/script>/.test(page) && /src="\/fresh\.js\?v=/.test(page),
  runs(page).join(' '),
)
{
  // What search engines read beside the page (src/seo.ts): one JSON-LD graph that parses, with the brand.
  const data = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(page)
  const graph = data ? JSON.parse(data[1])['@graph'] : []
  const types = graph.map((n) => n['@type'])
  check(
    'the home page tells search engines who it is: the organisation, the site, the service with its prices, the questions',
    ['Organization', 'WebSite', 'AccountingService', 'FAQPage'].every((t) => types.includes(t)) &&
      graph.find((n) => n['@type'] === 'Organization').legalName === 'europio s. r. o.' &&
      graph.find((n) => n['@type'] === 'AccountingService').hasOfferCatalog.itemListElement.some((o) => o.price === '89.00'),
    JSON.stringify(types),
  )
  check('its title and description name the service and the price', /<title>Firmony: online účtovníctvo pre Vašu firmu od 89/.test(page.replace(/[\u00a0\u202f]/g, ' ')) && page.includes('href="/e-faktura-2027"'))
}
check('it carries no inline style', !/ style=/i.test(page))
const csp = res.headers.get('content-security-policy') ?? ''
check('the policy allows nothing inline and nothing foreign', csp.includes("script-src 'self'") && !csp.includes('unsafe') && csp.includes("style-src 'self'") && csp.includes("frame-ancestors 'none'"))
{
  const legal = await get('/pravne-informacie')
  const legalHtml = await legal.text()
  check(
    'every other page of the site runs only our own scripts from files, nothing inline: the version check and Mony',
    (legal.headers.get('content-security-policy') ?? '').includes("script-src 'self'") && !(legal.headers.get('content-security-policy') ?? '').includes('unsafe') &&
      [...legalHtml.matchAll(/<script\b[^>]*>/gi)].every((m) => /\ssrc="\/(?:fresh|mony)\.js\?v=[0-9a-f]{8}"/.test(m[0]) || /type="application\/ld\+json"/.test(m[0])) && legalHtml.includes('src="/fresh.js?v='),
  )
  // Static files are the Worker's assets, which this suite does not serve: the file itself is read.
  const flow = readFileSync(new URL('../public/flow.js', import.meta.url), 'utf8')
  check('the script is our own file, and does nothing where scroll timelines run', flow.includes("CSS.supports('animation-timeline: view()')) return") && !/fetch|XMLHttpRequest|innerHTML|eval\(/.test(flow))
}
check(
  'no framing, no sniffing, HSTS',
  res.headers.get('x-frame-options') === 'DENY' && res.headers.get('x-content-type-options') === 'nosniff' && /max-age=31536000/.test(res.headers.get('strict-transport-security') ?? ''),
)
check('the canonical address is the domain', page.includes('<link rel="canonical" href="https://firmony.io/"'))
check('the real domain is for search engines', res.headers.get('x-robots-tag') === null)
const calcResultPart = (html) => html.slice(html.indexOf('class="calc__result"'), html.indexOf('</section>', html.indexOf('class="calc__result"')))
check('the comparison waits for visitor inputs instead of advertising an invented saving', calcResultPart(page).includes('Zadajte svoje náklady') && !calcResultPart(page).includes('calc__line') && !page.includes(`811${NB}€`))
check('every plan shows twelve monthly scopes plus the real annual closing before its choice', ['start','rast','firma'].every((id, i) => {
  const part = page.match(new RegExp(`data-plan-year="${id}"[^>]*>(.*?)</p>`))?.[1] ?? ''
  return part.includes([`1${NB}317${NB}€`, `2${NB}277${NB}€`, `4${NB}197${NB}€`][i])
}) && page.includes('Ročný súčet počíta') && page.replace(/[\u00a0\u202f]/g, ' ').includes('Mzdy a individuálne dohodnuté práce'))
check('the sales page explains its nonbinding first step and links terms and privacy beside pricing', page.includes('Zatiaľ nič neobjednávate') && page.includes('pred uzavretím zmluvy') && page.replace(/[\u00a0\u202f]/g, ' ').includes('Rozsah a zodpovednosť v podmienkach') && page.includes('href="/pravne-informacie#ochrana-udajov"'))

// Public e-invoice claims distinguish an enacted duty from a live delivery integration and its recipient scope.
{
  const response = await get('/e-faktura-2027'), html = (await response.text()).replace(/[\u00a0\u202f]/g, ' ')
  check('e-invoice guide: receipt duties and five-day reporting are not applied to every non-VAT recipient', response.status === 200 && html.includes('pri ktorom má dodávateľ povinnosť vyhotoviť e-faktúru') && html.includes('nevzťahuje automaticky na každého neplatiteľa') && html.includes('Nie sú automatickou pokutou každému príjemcovi'))
  check('e-invoice guide: original law, current modification and pending postman integration are visible without an invented supplier price', html.includes('2026-10-22') && html.includes('https://static.slov-lex.sk/static/SK/ZZ/2004/222/20270101.html') && html.includes('Napojenie na digitálneho poštára pripravujeme') && !html.includes('5 až 12 €'))
}

// The comparison
res = await get('/?mesacne=100&za-doklad=3&doklady=50&zavierka=200&dph=ano&ludia=1')
page = await res.text()
check('a comparison of typed numbers', page.includes(`3${NB}200${NB}€`) && page.includes('balík Rast') && page.includes(`2${NB}457${NB}€`) && page.includes(`743${NB}€`))
res = await get('/?mesacne=30&doklady=10')
page = await res.text()
check('a more expensive Firmony result is displayed plainly with the same total style as a saving', calcResultPart(page).includes('platili viac') && calcResultPart(page).includes(`957${NB}€`) && !calcResultPart(page).includes('calc__line--save'))
res = await get('/?mesacne=89&doklady=10&zavierka=249')
page = await res.text()
check('equal annual costs are stated as equal, not zero savings', calcResultPart(page).includes('ročná cena rovnaká') && !calcResultPart(page).includes('Ušetríte ročne'))
res = await get('/?mesacne=0&za-doklad=0&doklady=0&zavierka=0&ludia=0')
check('zero or empty inputs do not restore the old promotional example', !calcResultPart(await res.text()).includes('calc__line'))
res = await get('/?mesacne=abc')
check('numbers that are none are said to be wrong', (await res.text()).includes('Skontrolujte čísla'))
res = await get('/?mesacne=500&doklady=400')
check('a company beyond the plans gets an offer of its own', (await res.text()).includes('ponuku na mieru'))
res = await get('/?utm_source=refresher&utm_campaign=start%3Cscript%3E&mesacne=60')
page = await res.text()
check('campaign tags travel with the forms, odd ones do not', page.includes('name="utm_source" value="refresher"') && !page.includes('utm_campaign'))

// The request: the e-mail first (29 October 2026), kept at once, then the IČO
res = await get('/zacat?balik=rast')
page = await res.text()
check('the first step asks for the e-mail', res.status === 200 && page.includes('name="email"') && page.includes('action="/zacat/email"') && page.includes('Rast') && page.includes('name="balik" value="rast"') && !page.includes('name="ico"'))
check('a form step is not for search engines', (res.headers.get('x-robots-tag') ?? '').includes('noindex'))
res = await post('/zacat/email', { email: 'nie-je-email', miesto: 'hero' }, { ip: '198.51.100.81' })
check('a wrong e-mail is said and nothing is kept', res.status === 422 && (await res.text()).includes('Skontrolujte, prosím, e-mail') && !(await db.prepare("SELECT 1 AS x FROM leads WHERE email = 'nie-je-email'").first()))
res = await post('/zacat/email', { email: 'robot@example.sk', web: 'http://spam', miesto: 'hero' }, { ip: '198.51.100.81' })
check('a machine that fills the hidden field keeps nothing', res.status === 303 && !(await db.prepare("SELECT 1 AS x FROM leads WHERE email = 'robot@example.sk'").first()))
res = await post('/zacat/email', { email: 'Zaujemca@Example.sk', miesto: 'hero', balik: 'rast', utm_source: 'instagram' }, { ip: '198.51.100.81' })
const leadRow = await db.prepare("SELECT id, email, times, place, source, privacy_version FROM leads WHERE email = 'zaujemca@example.sk'").first()
const leadAt = res.headers.get('location') ?? ''
check(
  'the e-mail is kept at once, with where and from which campaign, and the next step carries only its row',
  res.status === 303 && leadRow?.times === 1 && leadRow.place === 'hero' && JSON.parse(leadRow.source).utm_source === 'instagram' && leadAt.includes(`l=${leadRow.id}`) && leadAt.includes('balik=rast') && !leadAt.includes('example'),
  JSON.stringify({ leadRow, leadAt }),
)
res = await post('/zacat/email', { email: 'zaujemca@example.sk', miesto: 'final' }, { ip: '198.51.100.81' })
const leadAgain = await db.prepare("SELECT id, times, place FROM leads WHERE email = 'zaujemca@example.sk'").first()
check('the same address again is the same row, counted, its last place kept', leadAgain?.id === leadRow?.id && leadAgain.times === 2 && leadAgain.place === 'final')
res = await get(leadAt.replace(site, ''))
page = await res.text()
check('then the IČO is asked, the row carried to the next step', res.status === 200 && page.includes('name="ico"') && page.includes(`name="l" value="${leadRow?.id}"`) && page.includes(`l=${leadRow?.id}`))
res = await get(`/zacat?ico=57442452&l=${leadRow?.id}`)
page = await res.text()
check('and the details have the e-mail filled in', res.status === 200 && page.includes('value="zaujemca@example.sk"'))
res = await get('/zacat?l=00000000-0000-4000-8000-000000000000')
check('a row that is none asks for the e-mail again', res.status === 200 && (await res.text()).includes('action="/zacat/email"'))
res = await get('/zacat?ico=1234')
check('a short IČO is refused in words', res.status === 422 && (await res.text()).includes('IČO má 8 číslic'))
res = await get('/zacat?ico=12345678')
check('an IČO the register does not know and that fails its check digit', res.status === 422 && (await res.text()).includes('nevyzerá správne'))
res = await get('/zacat?ico=57442452&balik=rast')
page = await res.text()
check('the register fills in the company', res.status === 200 && page.includes('europio s. r. o.') && page.includes('K lesu 2218/39A'))
check('the chosen plan is ticked', /value="rast" checked/.test(page))
check('the source of the data is named', page.includes('CC BY 4.0'))
check(
  'a company that exists is asked whether it looks for an accounting firm (ticked) or changes its accountant, never whether it is being founded',
  /value="first" checked/.test(page) && page.includes('Hľadám účtovnú firmu') && page.includes('value="switch"') && !page.includes('value="fresh"'),
)
res = await get('/zacat?ico=12345679')
page = await res.text()
check('an unknown company is typed in by hand', page.includes('nenašli') && page.includes('name="company"'))
res = await get('/zacat?ico=35757442')
page = await res.text()
check('a register that fails asks for the name by hand', page.includes('Register práve neodpovedá') && page.includes('name="company"'))
res = await get('/zacat?nova=1')
page = await res.text()
check('without a company the form asks how far they are', page.includes('Zakladáte firmu') && /value="fresh" checked/.test(page) && !page.includes('value="switch"'))

// The request: sending it
const good = {
  ico: '57442452',
  mode: 'company',
  plan: 'rast',
  situation: 'switch',
  name: 'Jana Nová',
  email: 'jana@example.sk',
  phone: '+421 900 123 456',
  note: 'Výpovedná lehota do konca novembra.',
  utm_source: 'startitup',
}
res = await post('/zacat', good, { origin: 'https://evil.example' })
check('a form from another site is refused', res.status === 403)
res = await post('/zacat', { note: 'x'.repeat(9000) })
check('a form beyond its size is refused', res.status === 413)
res = await post('/zacat', { ...good, email: 'nie-je-email' })
page = await res.text()
check('a wrong email is said at the field', res.status === 422 && page.includes('Skontrolujte, prosím, e-mail.') && page.includes('value="Jana Nová"'))
res = await post('/zacat', { ...good, company: 'Spam s. r. o. www.spam.example', seen: 'Spam' })
check('a request for an s. r. o. the register knows lands on thanks that say what comes next', res.status === 303 && res.headers.get('location') === '/zacat/hotovo?zmluva=1&zmena=1')
page = (await (await get('/zacat/hotovo?zmluva=1&zmena=1')).text()).replace(/\u00a0/g, ' ')
if (process.env.FIRMONY_CAPTURE_DIR) writeFileSync(`${process.env.FIRMONY_CAPTURE_DIR}/thanks.html`, page)
check('the thanks promise a review and then the link, the confirmation sent, and the notice period for a switch', page.includes('posúdime') && page.includes('odkaz na zmluvu pošleme tomu, kto za firmu koná') && page.includes('Potvrdenie sme Vám poslali') && page.includes('výpovedná lehota'))
page = (await (await get('/zacat/hotovo?potvrdenie=0')).text()).replace(/\u00a0/g, ' ')
check('without a confirmation sent, the thanks do not claim one, nor speak of a former accountant', !page.includes('Potvrdenie sme Vám poslali') && !page.includes('výpovedná lehota'))
let row = await db.prepare('SELECT * FROM requests ORDER BY created_at DESC LIMIT 1').first()
check(
  "it is kept with the register's name, not the typed one",
  row?.company === 'europio s. r. o.' && row?.company_source === 'register' && row?.plan === 'rast' && row?.ico === '57442452',
  JSON.stringify(row),
)
check('it keeps where the visitor came from', row?.source === '{"utm_source":"startitup"}')
await settle()
let mail = await sent()
const owner = mail.find((m) => m.to === 'ahoj@firmony.io')
const client = mail.find((m) => m.to === 'jana@example.sk')
check(
  'we are rung, and the request waits behind the sign-in',
  Boolean(owner) &&
    owner.subject === 'Firmony: nová žiadosť z webu' &&
    owner.text.includes('/ucto/ziadosti') &&
    !owner.text.includes('Jana') &&
    !owner.text.includes('+421') &&
    !owner.text.includes('Výpovedná') &&
    !owner.replyTo,
)
check(
  'the client gets a confirmation that replies to us',
  Boolean(client) && client.replyTo === 'ahoj@firmony.io' && client.text.startsWith('Dobrý deň,') && client.text.includes('Firma: europio s. r. o.'),
)
check('the confirmation repeats nothing a stranger typed', Boolean(client) && !client.text.includes('Výpovedná') && !client.text.includes('spam') && !client.text.includes('Jana'))
check('it says what comes next and carries no link to a contract before we have looked at the company', Boolean(client) && client.text.includes('pošleme tomu, kto za firmu koná') && !client.text.includes('/objednavka/'))
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
// Somebody who is not the director sends the request: the link to the contract will go to the director.
res = await post('/zacat', { ...good, name: 'Asistentka Firmy', email: 'asistentka@example.sk', directorEmail: 'konatel@example.sk' }, { ip: '198.51.100.40' })
const assistantOrder = await db.prepare("SELECT o.email, r.email AS asked FROM orders o JOIN requests r ON r.id = o.request_id WHERE r.email = 'asistentka@example.sk'").first()
check("the order is for the director's address, the request keeps who asked", res.status === 303 && assistantOrder?.email === 'konatel@example.sk' && assistantOrder?.asked === 'asistentka@example.sk')
res = await post('/zacat', { ...good, name: 'Asistentka Firmy', email: 'asistentka2@example.sk', directorEmail: 'nie-je-email' }, { ip: '198.51.100.40' })
check("a director's address that is no address is said at its field", res.status === 422 && (await res.text()).includes('Skontrolujte, prosím, e-mail toho, kto za firmu koná.'))

// A larger company asks for a scope of its own (his word of 17 October 2026: every size of company). The way in
// is on the home page twice, the choice is kept, and no online order is made: the team goes through its books first.
res = await get('/')
page = (await res.text()).replace(/ /g, ' ')
check(
  'the home page speaks to companies of every size and leads a larger one to an offer of its own',
  !page.includes('hero__tag') && page.includes('Pre stredné a veľké firmy.') && (page.match(/href="\/zacat\?balik=mieru"/g) ?? []).length === 1 && !page.includes('mladé'),
)
res = await get('/zacat?balik=mieru')
page = (await res.text()).replace(/ /g, ' ')
check('the first step names the offer of its own', res.status === 200 && page.includes('Na mieru, podmienky dohodneme osobne') && !page.includes('cena podľa rozsahu') && page.includes('name="balik" value="mieru"'))
res = await get('/zacat?ico=57442452&balik=mieru')
page = await res.text()
check('the offer of its own is ticked among the plans', /value="mieru" checked/.test(page) && !/value="neviem" checked/.test(page))
res = await post('/zacat', { ...good, plan: 'mieru', email: 'financie@example.sk' }, { ip: '198.51.100.60' })
const large = await db.prepare("SELECT r.plan, (SELECT COUNT(*) FROM orders o WHERE o.request_id = r.id) AS orders FROM requests r WHERE r.email = 'financie@example.sk'").first()
check('a request for a scope of its own is kept as such and makes no online order', res.status === 303 && res.headers.get('location') === '/zacat/hotovo?zmena=1&mieru=1' && large?.plan === 'mieru' && large?.orders === 0, JSON.stringify(large))
page = (await (await get('/zacat/hotovo?zmena=1&mieru=1')).text()).replace(/ /g, ' ')
check('its thanks promise a talk about the books, then the offer', page.includes('prejdeme Vašu agendu') && page.includes('ponuku na mieru') && !page.includes('konateľovi pošleme odkaz'))

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
check(
  'the privacy notice names who reads documents and accounts, and how long a contract is kept',
  page.includes('Anthropic, PBC') && page.includes('Enable Banking Oy') && page.replace(/\u00a0/g, ' ').includes('päť rokov od skončenia zmluvy') && page.includes('href="/podmienky#clanok-8"'),
)
res = await get('/robots.txt')
{
  const text = await res.text()
  check('robots keeps the form and the team out, not a guide that begins like the team', text.includes('Disallow: /zacat') && text.includes('Disallow: /ucto/') && !/^Disallow: \/ucto$/m.test(text) && text.includes('Sitemap: https://firmony.io/sitemap.xml'))
}
res = await get('/llms.txt')
{
  const text = await res.text()
  check('llms.txt answers in plain text with the prices and the guides', res.status === 200 && (res.headers.get('content-type') ?? '').startsWith('text/plain') && text.startsWith('# Firmony') && text.includes('Štart: 89 € mesačne') && text.includes('https://firmony.io/uctovnictvo-pre-sro'))
}
res = await get('/llms-full.txt')
check('llms-full.txt carries the guides', res.status === 200 && (await res.text()).includes('## Časté otázky'))
res = await get('/bacfe8b9cdfff70dd1e00785593ea3f8.txt')
check('the IndexNow key is served as itself', res.status === 200 && (await res.text()) === 'bacfe8b9cdfff70dd1e00785593ea3f8')
res = await get('/sitemap.xml')
{
  const map = await res.text()
  check('the sitemap lists the pages and every guide with its actual modification day', map.includes('https://firmony.io/pravne-informacie') && GUIDES.every((g) => map.includes(`<loc>https://firmony.io${g.path}</loc><lastmod>${g.modified}</lastmod>`)))
  for (const guide of GUIDES) {
    const path = guide.path
    const r = await get(path)
    const html = await r.text()
    if (process.env.FIRMONY_CAPTURE_DIR) writeFileSync(`${process.env.FIRMONY_CAPTURE_DIR}/guide${path.replace(/\//g, '-')}.html`, html)
    const ld = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)
    const types = ld ? JSON.parse(ld[1])['@graph'].map((n) => n['@type']) : []
    check(
      `the guide ${path} answers with its heading, its canonical address and its data, runs only our own scripts`,
      r.status === 200 && /<h1 /.test(html) && html.includes(`<link rel="canonical" href="https://firmony.io${path}"`) && types.includes('Article') && types.includes('BreadcrumbList') && (guide.faq.length === 0 || types.includes('FAQPage')) && guide.sources.every((source) => html.includes(`href="${source.url.replace(/&/g, '&amp;')}"`)) && ownScripts(html, ['fresh', 'mony']) && (r.headers.get('content-security-policy') ?? '').includes("script-src 'self'") && !/ style=/i.test(html),
      JSON.stringify(types),
    )
  }
}
// The net wage calculator: the empty form for search engines, a computed one for the person who asked.
res = await get('/mzdova-kalkulacka')
{
  const html = await res.text()
  if (process.env.FIRMONY_CAPTURE_DIR) writeFileSync(`${process.env.FIRMONY_CAPTURE_DIR}/wage-calc.html`, html)
  const ld = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)
  const types = ld ? JSON.parse(ld[1])['@graph'].map((n) => n['@type']) : []
  check(
    'the wage calculator is a page of its own, for search engines, with its data and only our own scripts',
    res.status === 200 && /<h1 /.test(html) && !html.includes('noindex') && types.includes('WebApplication') && types.includes('FAQPage') && ownScripts(html, ['fresh', 'mony']) && !/ style=/i.test(html),
    JSON.stringify(types),
  )
  const computed = await get('/mzdova-kalkulacka?hruba=1500&rok=2026&deti=1&deti15=0&vyhlasenie=1')
  const out = (await computed.text()).replace(/[\u00a0\u202f]/g, ' ')
  if (process.env.FIRMONY_CAPTURE_DIR) writeFileSync(`${process.env.FIRMONY_CAPTURE_DIR}/wage-calc-result.html`, out)
  check('1 500 € in 2026 with a child: 1 234,51 € net, and a computed page is no page for search engines', computed.status === 200 && out.includes('1 234,51 €') && out.includes('Cena práce pre firmu') && out.includes('<meta name="robots" content="noindex"'))
  const wrong = (await (await get('/mzdova-kalkulacka?hruba=abc')).text()).replace(/[\u00a0\u202f]/g, ' ')
  check('a wage that is none is said', wrong.includes('Hrubú mzdu napíšte v eurách'))
  check('the sitemap and llms.txt name it', (await (await get('/sitemap.xml')).text()).includes('<loc>https://firmony.io/mzdova-kalkulacka</loc>') && (await (await get('/llms.txt')).text()).includes('https://firmony.io/mzdova-kalkulacka'))
}
// The SZČO and s. r. o. calculators: what is left before the real business costs, the minimum tax, a wrong amount said.
{
  const plain = async (path) => (await (await get(path)).text()).replace(/[\u00a0\u202f]/g, ' ')
  const szco = await plain('/szco-kalkulacka?prijem=25000&rok=2026&vydavky=pausal')
  check('the SZČO calculator: 25 000 € with the flat rate leaves 19 899,64 € before the real business costs, social insurance 303,11 € a month', szco.includes('19 899,64 €') && szco.includes('pred skutočnými nákladmi na podnikanie') && szco.includes('303,11 € mesačne') && !szco.includes('ročné zúčtovanie za Vás'))
  const low = await plain('/szco-kalkulacka?prijem=2000&rok=2026&vydavky=pausal')
  check('the SZČO calculator: 2 000 € pays no social insurance', low.includes('sociálne poistenie sa neplatí'))
  const sro = await plain('/sro-kalkulacka?prijem=30000&vydavky=28000')
  check('the s. r. o. calculator: 30 000 € and 28 000 € pay the minimum tax 340 €, not 200 €', sro.includes('(minimálna daň)') && sro.includes('−340,00 €') && sro.includes('by bola 200,00 €'))
  const wrongSro = await plain('/sro-kalkulacka?prijem=30000&vydavky=abc')
  check('the s. r. o. calculator: expenses that are no amount are said, never taken as nought', wrongSro.includes('Sumy píšte v eurách') && !wrongSro.includes('calc__line--total'))
}
// Public tools do not require a session and must never accept invoice data at a write endpoint.
for (const [path, name] of [['/bezplatne-nastroje','free-tools'],['/faktura-zadarmo','free-invoice']]) {
  const response = await get(path), html = await response.text()
  check(`public tool ${path}: discoverable without an account and linked to the unchanged service`, response.status === 200 && html.includes(`rel="canonical" href="https://firmony.io${path}"`) && html.includes('href="/zacat"') && !html.includes('name="email"') && !html.includes('noindex'))
  if (process.env.FIRMONY_CAPTURE_DIR) writeFileSync(`${process.env.FIRMONY_CAPTURE_DIR}/${name}.html`,html)
  if (path === '/faktura-zadarmo') {
    const csp = response.headers.get('content-security-policy') ?? ''
    check('public invoice: scripts are local but native form submissions and network connections are blocked', csp.includes("script-src 'self'") && csp.includes("connect-src 'none'") && csp.includes("form-action 'none'") && html.includes('src="/free-invoice.js"') && /<button[^>]*disabled[^>]*data-download/.test(html))
    check('public invoice: scope, no storage, no registry verification and original legal sources are explicit', (html.includes('neplatiteľa') || html.includes('nie sú platiteľmi DPH')) && html.includes('archív faktúr') && html.includes('údaje v registri neoverujeme') && html.includes('https://static.slov-lex.sk/static/SK/ZZ/2002/431/20260601.html#paragraf-10'))
    const denied = await post(path, { number:'TEST-SECRET-INVOICE' })
    check('public invoice: a direct POST cannot create, email or store an invoice', denied.status === 404 && !(await denied.text()).includes('TEST-SECRET-INVOICE'))
    const query = await get(`${path}?number=TEST-SECRET-INVOICE`)
    check('public invoice: query parameters cannot prefill or echo invoice data', !(await query.text()).includes('TEST-SECRET-INVOICE'))
  }
}
{
  const map = await (await get('/sitemap.xml')).text(), llms = await (await get('/llms.txt')).text(), home = await (await get('/')).text()
  check('public tools: sitemap, assistant text and home page all expose the actual free tools', ['/faktura-zadarmo','/bezplatne-nastroje'].every(path=>map.includes(`https://firmony.io${path}`)&&llms.includes(`https://firmony.io${path}`)) && home.includes('href="/faktura-zadarmo"') && home.includes('href="/bezplatne-nastroje"'))
}
res = await get('/healthz')
{
  const health = await res.json()
  check('health says the ready database schema', res.status === 200 && health.ok === true && health.schema === SCHEMA_VERSION)
  check('health identifies the compiled commit with only allowlisted build metadata',
    JSON.stringify(health.build) === JSON.stringify(BUILD_METADATA) &&
    Object.keys(health.build).sort().join(',') === 'revision,source' &&
    (health.build.revision === null ? health.build.source === 'unknown' : /^[a-f0-9]{40}$/.test(health.build.revision) && ['git', 'cloudflare'].includes(health.build.source)))
}
res = await get('/nic-take')
check('an unknown page is a 404 in words', res.status === 404 && (await res.text()).includes('Táto stránka neexistuje'))
res = await mf.dispatchFetch('http://firmony.io/cennik?x=1', { redirect: 'manual' })
check('plain http goes to https', res.status === 301 && res.headers.get('location') === 'https://firmony.io/cennik?x=1')
res = await mf.dispatchFetch('https://www.firmony.io/', { redirect: 'manual' })
check('www goes to the domain', res.status === 301 && res.headers.get('location') === 'https://firmony.io/')
res = await get('/pravne-informacie/')
check('a slash at the end goes to the page', res.status === 301 && res.headers.get('location') === 'https://firmony.io/pravne-informacie')
res = await mf.dispatchFetch('https://firmony.example.workers.dev/', { redirect: 'manual' })
check('a preview address is not for search engines', (res.headers.get('x-robots-tag') ?? '').includes('noindex'))

// Firmony for investors: the page, and the people who want it
res = await get('/investori?utm_source=xtb-komunita')
page = await res.text()
const plain = (html) => html.replace(/\u00a0/g, ' ')
check('the investors page answers, with only our own scripts and nothing inline', res.status === 200 && ownScripts(page, ['fresh', 'mony']) && !/ style=/i.test(page))
check(
  'it names the brokers and both ways, both free',
  ['XTB', 'Trading 212', 'Interactive Brokers', 'Revolut'].every((b) => page.includes(b)) && (plain(page).match(/<span class="iway__amount">0 €<\/span>/g) ?? []).length === 2 && !plain(page).includes('29 €') && !plain(page).includes('DPH sa k nim'),
)
check('it is for search engines and its forms carry the campaign', res.headers.get('x-robots-tag') === null && page.includes('name="utm_source" value="xtb-komunita"'))
check('the header leads to the form on the page, and the menu marks the page', page.includes('href="#zapis"') && page.includes('href="/investori" aria-current="page"'))
check('the dividend rate is said as it is for 2026', plain(page).includes('spravidla sadzbou 7 %') && plain(page).includes('sadzbou 19 až 35 %'))
res = await get('/')
const homeForLinks = await res.text()
check('the home page leads to it', homeForLinks.includes('href="/investori"'))
check('a client finds the way in from the site, in its header, the phone\'s menu and its footer', (homeForLinks.match(/href="\/app\/prihlasenie"/g) ?? []).length === 3)
const investorPairs = [
  ['email', 'Investor@Example.sk'],
  ['broker', 'xtb'],
  ['broker', 'ibkr'],
  ['broker', 'nieco-ine'],
  ['cesta', 'sam'],
  ['forma', 'zapis'],
  ['utm_source', 'xtb-komunita'],
]
res = await post('/investori', investorPairs, { origin: 'https://evil.example', ip: '198.51.100.40' })
check('a sign-up from another site is refused', res.status === 403)
res = await post(
  '/investori',
  investorPairs.map(([k, v]) => [k, k === 'email' ? 'nie-je-email' : v]),
  { ip: '198.51.100.40' },
)
page = await res.text()
check(
  'a wrong email is said once, at the form it was typed in, which keeps what was ticked',
  res.status === 422 && page.split('takto nevyzerá správne').length === 2 && /value="xtb" checked/.test(page) && /value="ibkr" checked/.test(page) && /value="sam" checked/.test(page),
)
check('it is not kept', (await db.prepare('SELECT COUNT(*) AS n FROM investor_requests').first())?.n === 0)
res = await post('/investori', investorPairs, { ip: '198.51.100.40' })
check('a sign-up lands on thanks', res.status === 303 && res.headers.get('location') === '/investori/hotovo')
let investor = await db.prepare('SELECT * FROM investor_requests').all()
check(
  'it is kept under the address in small letters, with the brokers we know, the way and the campaign',
  investor.results.length === 1 &&
    investor.results[0].email === 'investor@example.sk' &&
    investor.results[0].brokers === 'xtb,ibkr' &&
    investor.results[0].way === 'sam' &&
    investor.results[0].source === '{"utm_source":"xtb-komunita"}',
  JSON.stringify(investor.results),
)
// A confirmation is keyed by the second it was asked in (a double click is one email), so the next sign-ups wait a second.
await settle(1100)
res = await post('/investori', { email: 'investor@example.sk', cesta: 'za-mna' }, { ip: '198.51.100.40' })
investor = await db.prepare('SELECT * FROM investor_requests').all()
check(
  'the same address again is the same row: its last way counts, the brokers stay',
  res.status === 303 && investor.results.length === 1 && investor.results[0].way === 'za-mna' && investor.results[0].brokers === 'xtb,ibkr',
)
await settle(1100)
res = await post('/investori', { email: 'INVESTOR@example.sk' }, { ip: '198.51.100.40' })
check('a third time in a day is still taken', res.status === 303 && (await db.prepare('SELECT COUNT(*) AS n FROM investor_requests').first())?.n === 1)
await settle()
const investorMail = (await sent()).filter((m) => m.to.toLowerCase() === 'investor@example.sk')
check(
  'a confirmation goes out, twice a day at most, and repeats nothing that was typed',
  investorMail.length === 2 &&
    investorMail[0].subject === 'Firmony: zapísali sme Vás' &&
    investorMail[0].replyTo === 'ahoj@firmony.io' &&
    investorMail[0].text.startsWith('Dobrý deň,') &&
    investorMail[0].text.includes('odpíšte na tento e-mail a adresu vymažeme') &&
    !/xtb|ibkr|Interactive/i.test(investorMail[0].text),
  String(investorMail.length),
)
check('nobody of the team is rung for it', !(await sent()).some((m) => m.to === 'ahoj@firmony.io' && /investor/i.test(m.subject + m.text)))
check(
  'the email goes with an HTML part: the logo of the site on top and the same words, nothing typed in it',
  typeof investorMail[0].html === 'string' && investorMail[0].html.includes('src="https://firmony.io/art/mail-logo.png"') && investorMail[0].html.includes('<title>Firmony: zapísali sme Vás</title>') && investorMail[0].html.replace(/[\u00a0\u202f]/g, ' ').includes('odpíšte na tento e-mail a adresu vymažeme') && !/xtb|ibkr|Interactive/i.test(investorMail[0].html),
)
// Static files are the Worker's assets, which this suite does not serve: the file itself is read.
const mailLogo = readFileSync(new URL('../public/art/mail-logo.png', import.meta.url))
check('the logo an email loads is among the site\'s files, as a PNG', mailLogo.subarray(1, 4).toString() === 'PNG' && mailLogo.length < 40_000)
res = await post('/investori', { email: 'bot@example.sk', web: 'http://bot.example' }, { ip: '198.51.100.40' })
check(
  'a bot that fills the hidden field is thanked and forgotten',
  res.status === 303 && (await db.prepare("SELECT COUNT(*) AS n FROM investor_requests WHERE email = 'bot@example.sk'").first())?.n === 0,
)
for (let i = 0; i < 6; i++) await post('/investori', { email: `i${i}@example.sk` }, { ip: '198.51.100.41' })
res = await post('/investori', { email: 'i7@example.sk' }, { ip: '198.51.100.41' })
check('the seventh sign-up in an hour from one connection waits', res.status === 429 && (await res.text()).includes('priveľa zápisov'))
res = await get('/investori/hotovo')
page = await res.text()
check('thanks says when we write, and is not for search engines', res.status === 200 && page.includes('Zapísali sme Vás') && page.includes('<meta name="robots" content="noindex"'))
check('its header leads to no form it does not have', !page.includes('href="#zapis"') && page.includes('href="/zacat"'))
res = await get('/sitemap.xml')
check('the sitemap lists the investors page', (await res.text()).includes('https://firmony.io/investori</loc>'))
res = await get('/pravne-informacie')
check('the privacy notice names the sign-up and how long it is kept', plain(await res.text()).includes('Keď sa zapíšete na daňové priznanie z investícií'))

// The schedule deletes what the privacy notice says is deleted
const old = Math.floor(Date.now() / 1000) - 400 * 86400
await db.prepare("INSERT INTO requests (id, created_at, plan, situation, name, email, privacy_version) VALUES ('old', ?, 'start', 'other', 'Starý', 'old@example.sk', '2026-10-12')").bind(old).run()
await db
  .prepare(
    "INSERT INTO investor_requests (id, created_at, updated_at, email, privacy_version) VALUES ('inv-old', ?, ?, 'stary-investor@example.sk', '2026-10-14'), ('inv-renewed', ?, ?, 'znova@example.sk', '2026-10-14')",
  )
  .bind(old, old, old, old)
  .run()
res = await post('/investori', { email: 'znova@example.sk' }, { ip: '198.51.100.42' })
check('signing up again renews the year', res.status === 303)
const worker = await mf.getWorker('firmony')
await worker.scheduled({ cron: '*/15 * * * *' })
await settle(500)
{
  for (let i = 0; i < 50 && notices.length === 0; i++) await settle(100)
  const map = await (await get('/sitemap.xml')).text()
  const listed = [...map.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])
  const first = notices[0]
  check(
    'the schedule tells IndexNow of every page of the sitemap, with the key and where it is',
    notices.length === 1 && first.agent === 'Firmony (+https://firmony.io)' && first.host === 'firmony.io' && first.key === 'bacfe8b9cdfff70dd1e00785593ea3f8' && first.keyLocation === 'https://firmony.io/bacfe8b9cdfff70dd1e00785593ea3f8.txt' && listed.length > 5 && listed.every((u) => first.urlList.includes(u)) && first.urlList.length === listed.length,
    JSON.stringify(notices),
  )
  await worker.scheduled({ cron: '*/15 * * * *' })
  await settle(300)
  check('nothing changed, nothing told again', notices.length === 1)
  const told = JSON.parse((await db.prepare("SELECT value FROM site_state WHERE key = 'indexnow'").first()).value)
  told['/cena-uctovnictva'] = '2026-01-01'
  await db.prepare("UPDATE site_state SET value = ? WHERE key = 'indexnow'").bind(JSON.stringify(told)).run()
  await worker.scheduled({ cron: '*/15 * * * *' })
  await settle(300)
  for (let i = 0; i < 50 && notices.length < 2; i++) await settle(100)
  check('a guide whose day moved is told alone', notices.length === 2 && notices[1].urlList.join() === 'https://firmony.io/cena-uctovnictva', JSON.stringify(notices[1]))
  // Refused at both addresses: the next try waits a day.
  indexNowAnswer = 429
  told['/online-uctovnik'] = '2026-01-01'
  await db.prepare("UPDATE site_state SET value = ? WHERE key = 'indexnow'").bind(JSON.stringify(told)).run()
  await worker.scheduled({ cron: '*/15 * * * *' })
  for (let i = 0; i < 50 && notices.length < 4; i++) await settle(100)
  await settle(200)
  const wait = await db.prepare("SELECT value FROM site_state WHERE key = 'indexnow-wait'").first()
  check('refused by IndexNow, Bing is asked, and the next try waits a day', notices.length === 4 && notices[2].sentTo === 'api.indexnow.org' && notices[3].sentTo === 'www.bing.com' && Number(wait?.value ?? 0) > Date.now() / 1000 + 86000, JSON.stringify(notices.slice(2)))
  await worker.scheduled({ cron: '*/15 * * * *' })
  await settle(500)
  check('meanwhile nothing is sent', notices.length === 4)
  indexNowAnswer = null
  await db.prepare("DELETE FROM site_state WHERE key = 'indexnow-wait'").run()
}
// A request that never reached the identification (no order, no dossier) ends a year after it was sent, as the
// privacy notice says (finding of the review of 26 October 2026: before, it was kept for ever).
check('a request that never reached the identification is erased a year after it was sent', (await db.prepare("SELECT COUNT(*) AS n FROM requests WHERE id = 'old'").first())?.n === 0)
check('newer requests stay', (await count()) >= 4)
check(
  'a sign-up not renewed for a year is deleted, newer ones stay',
  (await db.prepare("SELECT COUNT(*) AS n FROM investor_requests WHERE id = 'inv-old'").first())?.n === 0 &&
    (await db.prepare("SELECT COUNT(*) AS n FROM investor_requests WHERE email = 'investor@example.sk'").first())?.n === 1,
)
check('a sign-up renewed within the year stays', (await db.prepare("SELECT COUNT(*) AS n FROM investor_requests WHERE id = 'inv-renewed'").first())?.n === 1)

// ---------------------------------------------------------------------------------------------------------------
// The client's app
// ---------------------------------------------------------------------------------------------------------------

// A day by the calendar of Bratislava, today and shifted by whole days. Not today's moment minus 24-hour steps: after
// summer time ends, 23:00 to 24:00 of a winter evening minus 40 times 24 hours is already the next day of summer.
const day = (shift) => {
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Bratislava' }).format(new Date())
  const d = new Date(`${today}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + shift)
  return d.toISOString().slice(0, 10)
}
const nowS = Math.floor(Date.now() / 1000)
await db.batch([
  db
    .prepare(
      "INSERT INTO companies (id, created_at, name, ico, vat_payer, plan, inbox) VALUES ('co-a', ?, 'Firma A s. r. o.', '57442452', 0, 'start', 'aaaa11'), ('co-b', ?, 'Firma B s. r. o.', '11111111', 0, 'start', 'bbbb22')",
    )
    .bind(nowS, nowS),
  db.prepare("INSERT INTO users (id, created_at, email, name) VALUES ('u-a', ?, 'anna@firma-a.test', 'Anna Malá'), ('u-b', ?, 'boris@firma-b.test', 'Boris Veľký')").bind(nowS, nowS),
  db.prepare("INSERT INTO members (company_id, user_id, role, created_at) VALUES ('co-a', 'u-a', 'owner', ?), ('co-b', 'u-b', 'owner', ?)").bind(nowS, nowS),
  db.prepare("INSERT INTO accounts (id, company_id, iban) VALUES ('acc-a', 'co-a', 'SK3112000000198742637541'), ('acc-b', 'co-b', 'SK0809000000000123123123')"),
  db
    .prepare(
      "INSERT INTO payments (id, company_id, account_id, created_at, booked_on, amount_cents, party, card, ref) VALUES ('pa-cafe', 'co-a', 'acc-a', ?, ?, -1240, 'KAVIAREN NA ROHU KOSICE', 1, 'a1')",
    )
    .bind(nowS, day(-1)),
  db
    .prepare(
      "INSERT INTO payments (id, company_id, account_id, created_at, booked_on, amount_cents, party, party_iban, vs, ref) VALUES ('pa-host', 'co-a', 'acc-a', ?, '2026-10-10', -5990, 'Hostingový dom s. r. o.', 'SK8975000000000012345671', '2026118', 'a2')",
    )
    .bind(nowS),
  db
    .prepare("INSERT INTO payments (id, company_id, account_id, created_at, booked_on, amount_cents, party, ref) VALUES ('pa-fuel', 'co-a', 'acc-a', ?, ?, -6418, 'CERPACIA STANICA', 'a3')")
    .bind(nowS, day(-2)),
  db.prepare("INSERT INTO payments (id, company_id, account_id, created_at, booked_on, amount_cents, party, ref) VALUES ('pb-1', 'co-b', 'acc-b', ?, ?, -1000, 'Obchod', 'b1')").bind(nowS, day(-1)),
  db
    .prepare(
      "INSERT INTO documents (id, company_id, created_at, source, file_key, file_type, status, kind, party, total_cents) VALUES ('db-1', 'co-b', ?, 'upload', 'companies/co-b/documents/db-1.jpg', 'image/jpeg', 'read', 'receipt', 'Obchod', 1000)",
    )
    .bind(nowS),
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
check(
  'the app is not for search engines and may run its own script',
  (res.headers.get('x-robots-tag') ?? '').includes('noindex') && (res.headers.get('content-security-policy') ?? '').includes("script-src 'self'"),
)

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
const link = linkMail?.text.match(/https:\/\/firmony\.io\/app\/vstup\?t=[A-Za-z0-9_-]{43}/)?.[0]
check('the link goes to the address of the account, on the domain', Boolean(link) && linkMail.replyTo === 'ahoj@firmony.io')
const token = link ? new URL(link).searchParams.get('t') : ''
check('the database keeps no token in plain', (await db.prepare('SELECT COUNT(*) AS n FROM login_links WHERE id = ?').bind(token).first())?.n === 0)
res = await appGet(`/app/vstup?t=${token}`)
page = await res.text()
check('opening the link asks for one click and uses nothing up', res.status === 200 && page.includes('name="t"') && (await appGet(`/app/vstup?t=${token}`)).status === 200)
res = await appPost('/app/vstup', { t: token })
const cookie = res.headers.get('set-cookie') ?? ''
check('the click signs in, and offers to sign in with one touch from then on', res.status === 303 && res.headers.get('location') === '/app/rychle-prihlasenie?next=%2Fapp')
check(
  'the cookie is bound to the host, https, unreadable by scripts',
  /^__Host-firmony=[A-Za-z0-9_-]{43};/.test(cookie) && /HttpOnly/i.test(cookie) && /Secure/i.test(cookie) && /SameSite=Lax/i.test(cookie) && /Path=\//.test(cookie),
  cookie,
)
jar = cookie.split(';')[0]
res = await appPost('/app/vstup', { t: token })
check('a link works once', res.status === 410)

res = await appGet('/app')
page = await res.text()
check('the overview says what is missing', res.status === 200 && page.includes('3 platbám chýbajú doklady') && page.includes('Firma A s. r. o.'), page.match(/ptitle__sans">[^<]*/)?.[0])
check('it names the address for forwarding', page.includes('doklady-aaaa11@firmony.io'))
check(
  'it runs its own script and nothing inline',
  /<script src="\/inside\.js\?v=[a-f0-9]{8}" defer(="")?><\/script>/.test(page) && ownScripts(page, ['fresh', 'inside', 'mony']) && !/ style=/i.test(page),
  page.match(/<script[^>]*>/g)?.join(' '),
)

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
check(
  'the reader read it',
  cafeDoc?.status === 'read' && cafeDoc.total_cents === 1240 && cafeDoc.party === 'Kaviareň Na rohu s. r. o.' && cafeDoc.read_by === 'claude-haiku-5-5',
  JSON.stringify(cafeDoc),
)
check('and it was paired with the café payment without asking', cafeDoc?.payment_id === 'pa-cafe' && cafeDoc.how === 'auto')
check(
  'the reader was asked with the key, the picture and our tool',
  readings.length === 1 && readings[0].model === 'claude-haiku-5-5' && readings[0].messages[0].content[0].type === 'image' && readings[0].tool_choice?.name === 'zapis_doklad',
)
check('the file is kept in the company folder', Boolean(await files.head(cafeDoc?.file_key ?? 'none')) && String(cafeDoc?.file_key).startsWith('companies/co-a/documents/'))
res = await appGet(`/app/subory/${cafeDoc?.id}`)
check(
  'its file is given to its company, as a picture and nothing else',
  res.status === 200 &&
    res.headers.get('content-type') === 'image/jpeg' &&
    (res.headers.get('content-security-policy') ?? '').includes('sandbox') &&
    res.headers.get('cache-control') === 'private, no-store',
)
await res.arrayBuffer()
res = await appPost('/app/doklady', {}, { files: [photo] })
page = await res.text()
check(
  'the same file sent again is not kept twice',
  res.status === 200 && page.includes('už máme') && (await db.prepare("SELECT COUNT(*) AS n FROM documents WHERE company_id = 'co-a' AND file_name = 'blocek.jpg'").first())?.n === 1,
)
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
check(
  'a wrong document is taken off again',
  res.status === 303 && res.headers.get('location') === '/app/platby/pa-fuel?ok=odpojene' && (await db.prepare("SELECT COUNT(*) AS n FROM links WHERE payment_id = 'pa-fuel'").first())?.n === 0,
)
const tankovanie = (await db.prepare("SELECT id FROM documents WHERE file_name = 'tankovanie.jpg'").first())?.id
res = await appPost('/app/platby/pa-host/priradit', { doklad: cafeDoc?.id ?? '' })
check(
  'a document that belongs to a payment is given to no other',
  res.status === 409 &&
    (
      await db
        .prepare('SELECT payment_id FROM links WHERE document_id = ?')
        .bind(cafeDoc?.id ?? '')
        .first()
    )?.payment_id === 'pa-cafe',
)
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
check(
  'a payment that needs no document takes none',
  res.status === 409 &&
    (
      await db
        .prepare('SELECT COUNT(*) AS n FROM links WHERE document_id = ?')
        .bind(tankovanie ?? '')
        .first()
    )?.n === 0,
)
res = await appGet('/app')
page = await res.text()
check('with every payment in order the overview does not invent missing documents or promise all work is complete', !page.includes('data-overview-action="documents"') && !page.includes('Nemusíte nič robiť.'), page.match(/ptitle__sans">[^<]*/)?.[0])
res = await appPost('/app/platby/pa-fuel/zrusit', {})
check('and it can be undone', (await db.prepare("SELECT exempt FROM payments WHERE id = 'pa-fuel'").first())?.exempt === null)

// The bank's statement
const camtBytes = readFileSync(new URL('./fixtures/camt053.xml', import.meta.url))
res = await appPost('/app/banka', {}, { files: [{ name: 'vypis.xml', type: 'application/xml', bytes: camtBytes }] })
check('a statement adds its payments', res.status === 303 && res.headers.get('location') === '/app/platby?filter=vsetky&ok=vypis&n=7&k=0', res.headers.get('location'))
res = await appPost('/app/banka', {}, { files: [{ name: 'vypis.xml', type: 'application/xml', bytes: camtBytes }] })
check('the same statement again adds nothing', res.headers.get('location') === '/app/platby?filter=vsetky&ok=vypis&n=0&k=7', res.headers.get('location'))
const exempts = (await db.prepare("SELECT exempt, COUNT(*) AS n FROM payments WHERE company_id = 'co-a' AND exempt_by = 'auto' GROUP BY exempt ORDER BY exempt").all()).results
check(
  'the fee of the bank and the tax need no document, by themselves',
  JSON.stringify(exempts) ===
    JSON.stringify([
      { exempt: 'bank', n: 1 },
      { exempt: 'state', n: 1 },
    ]),
  JSON.stringify(exempts),
)
check('the balance of the account is kept', (await db.prepare("SELECT balance_cents FROM accounts WHERE id = 'acc-a'").first())?.balance_cents === 486163)
res = await appPost('/app/banka', {}, { files: [{ name: 'vypis.xml', type: 'application/xml', bytes: readFileSync(new URL('./fixtures/ubl-invoice.xml', import.meta.url)) }] })
check('a file that is no statement is said to be none', res.status === 422 && (await res.text()).includes('camt.053'))

// A message to the accountant
res = await appPost('/app/spravy', { sprava: '  ' })
check('an empty message is not sent', res.status === 422)
res = await appPost('/app/spravy', { sprava: 'Dobrý deň,\nčo s touto platbou?', platba: 'pa-fuel' })
check('a message is sent', res.status === 303 && res.headers.get('location') === '/app/spravy?ok=poslane#posledna')
await settle()
const toUs = (await sent()).filter((m) => m.to === 'ahoj@firmony.io' && m.subject === 'Firmony: nová správa od klienta').pop()
check(
  'and we are rung, with nothing of the message in the email',
  Boolean(toUs) && toUs.text.includes('/ucto/klienti/co-a#spravy') && !toUs.text.includes('platbou') && !toUs.text.includes('64,18') && !toUs.text.includes('Firma A'),
)
res = await appPost('/app/spravy', { sprava: 'Cudzia platba', platba: 'pb-1' })
check("a message cannot point at another company's payment", (await db.prepare("SELECT payment_id FROM messages WHERE body = 'Cudzia platba'").first())?.payment_id === null)
res = await appGet('/app/spravy')
page = await res.text()
check('the messages show, with the payment they are about', page.includes('čo s touto platbou?') && /K.platbe: Cerpacia Stanica/.test(page))

// A session that has expired opens nothing
const oldToken = 'A'.repeat(43)
await db
  .prepare("INSERT INTO sessions (id, user_id, company_id, created_at, expires_at) VALUES (?, 'u-a', 'co-a', ?, ?)")
  .bind(createHash('sha256').update(oldToken).digest('hex'), nowS - 40 * 86400, nowS - 10 * 86400)
  .run()
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
const authenticators = new Map()
async function verifyBrowser(email, browserCookie) {
  const user = await db.prepare('SELECT id, team FROM users WHERE email = ?').bind(email).first()
  let key = authenticators.get(email)
  const registering = !key
  if (!key) { key = await authenticator(); authenticators.set(email, key) }
  let code = email === 'ahoj@firmony.io' ? TEST_BOOTSTRAP : ''
  if (registering && user.team && !code) {
    code = 'G'.repeat(42) + String(authenticators.size % 10)
    const grant = createHash('sha256').update(code).digest('hex')
    const adminId = (await db.prepare("SELECT id FROM users WHERE team = 'admin' LIMIT 1").first()).id
    await db.prepare("INSERT INTO auth_grants (id, user_id, kind, source, created_at, created_by, evidence, expires_at) VALUES (?, ?, 'enroll', 'admin', ?, ?, 'TEST-ONLY fixture identity', ?)")
      .bind(grant, user.id, Math.floor(Date.now() / 1000), adminId, Math.floor(Date.now() / 1000) + 3600).run()
  }
  // A connection of its own for each person (documentation ranges; past 155 people the next range, 198.51.100.x).
  const n = authenticators.size
  const api = jsonClient(mf, site, browserCookie, n < 155 ? `203.0.113.${100 + n}` : `198.51.100.${n - 154}`)
  const r = await api('/auth/options', { action: registering ? 'register' : 'authenticate', code, next: user.team ? '/ucto' : '/app' })
  if (r.status !== 200) throw new Error(`fixture options ${email}: ${r.status} ${await r.text()}`)
  const options = await r.json()
  const response = registering ? await key.register(options.options) : await key.authenticate(options.options)
  const confirmed = await api('/auth/verify', { id: options.id, response, name: 'TEST-ONLY passkey' })
  if (confirmed.status !== 200) throw new Error(`fixture confirmation ${email}: ${confirmed.status} ${JSON.stringify(await confirmed.json())}; ${JSON.stringify(await db.prepare("SELECT detail FROM events WHERE action = 'auth.failed' ORDER BY rowid DESC LIMIT 1").first())}`)
  return { cookie: (confirmed.headers.get('set-cookie') ?? '').split(';')[0], location: (await confirmed.json()).to }
}
// Each person's sign-in from a connection of its own (TEST-NET-1), so the suite's many people stay under the limit
// of sign-ins a connection may ask for in an hour (APP.signInsPerHour), which its own checks test.
let signIns = 0
async function emailOnly(email) {
  const n = (await sent()).length
  signIns += 1
  await post('/app/prihlasenie', { email }, { ip: `192.0.2.${(signIns % 250) + 1}` })
  await settle()
  const mail = (await sent())
    .slice(n)
    .filter((m) => m.to.toLowerCase() === email.toLowerCase())
    .pop()
  const t = mail?.text.match(/\/app\/vstup\?t=([A-Za-z0-9_-]{43})/)?.[1] ?? ''
  const r = await post('/app/vstup', { t }, { ip: '203.0.113.30' })
  return { cookie: (r.headers.get('set-cookie') ?? '').split(';')[0], location: r.headers.get('location'), mail }
}
async function signIn(email) {
  const pending = await emailOnly(email)
  return { ...await verifyBrowser(email, pending.cookie), mail: pending.mail }
}
const as = (cookie) => ({
  get: (path) => mf.dispatchFetch(`${site}${path}`, { redirect: 'manual', headers: { 'cf-connecting-ip': '203.0.113.30', cookie } }),
  async upload(path, file, fields = {}, fieldName = 'file') {
    const form = new FormData()
    for (const [key, value] of Object.entries(fields)) form.append(key, String(value))
    form.append(fieldName, new Blob([file.bytes], { type: file.type ?? 'application/octet-stream' }), file.name)
    const encoded = new Request('https://x/', { method: 'POST', body: form })
    const body = new Uint8Array(await encoded.arrayBuffer())
    return mf.dispatchFetch(`${site}${path}`, {
      method: 'POST',
      body,
      redirect: 'manual',
      headers: { 'content-type': encoded.headers.get('content-type'), 'content-length': String(body.length), 'cf-connecting-ip': '203.0.113.30', origin: site, cookie },
    })
  },
  /** Several files in one form, as a browser sends a picker with `multiple`. */
  async uploads(path, files, fieldName = 'file') {
    const form = new FormData()
    for (const file of files) form.append(fieldName, new Blob([file.bytes], { type: file.type ?? 'application/octet-stream' }), file.name)
    const encoded = new Request('https://x/', { method: 'POST', body: form })
    const body = new Uint8Array(await encoded.arrayBuffer())
    return mf.dispatchFetch(`${site}${path}`, {
      method: 'POST',
      body,
      redirect: 'manual',
      headers: { 'content-type': encoded.headers.get('content-type'), 'content-length': String(body.length), 'cf-connecting-ip': '203.0.113.30', origin: site, cookie },
    })
  },
  /** A multipart form of fields and files in the given order: [name, string] or [name, { name, bytes, type }]. */
  async form(path, entries) {
    const form = new FormData()
    for (const [key, value] of entries) {
      if (typeof value === 'string') form.append(key, value)
      else form.append(key, new Blob([value.bytes], { type: value.type ?? 'application/octet-stream' }), value.name)
    }
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
res = await get('/app/prvy-spravca')
page = await res.text()
const firstCode = page.match(/<code>([A-Za-z0-9_-]{43})<\/code>/)?.[1]
if (process.env.FIRMONY_CAPTURE_DIR) writeFileSync(`${process.env.FIRMONY_CAPTURE_DIR}/first-admin.html`, page)
check(
  'while the team is empty, a page gives the three settings with a code made now and kept nowhere',
  res.status === 200 && Boolean(firstCode) && page.includes('TEAM_BOOTSTRAP_EXPIRES_AT') && (res.headers.get('cache-control') ?? '').includes('no-store') && !(await db.prepare('SELECT 1 AS x FROM users WHERE team IS NOT NULL').first()),
)
check('each visit makes another code', (await (await get('/app/prvy-spravca')).text()).match(/<code>([A-Za-z0-9_-]{43})<\/code>/)?.[1] !== firstCode)
const boss = await signIn('ahoj@firmony.io')
const bossRow = await db.prepare("SELECT id, team, name FROM users WHERE email = 'ahoj@firmony.io'").first()
check('the explicitly configured bootstrap account becomes the first verified administrator', bossRow?.team === 'admin' && bossRow.name === 'Christian Juhás' && boss.location === '/ucto')
check('once somebody of the team exists, the page is gone', (await get('/app/prvy-spravca')).status === 404)
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
check(
  'an accountant is added and told how to sign in',
  res.status === 303 && lucia?.team === 'accountant' && (await sent()).some((m) => m.to === 'lucia@firmony.test' && m.text.includes('/app/prihlasenie') && m.text.includes('Jednorazový kód')),
)
{
  // Without a passkey she cannot work: the team's page says so and leads to the activation code.
  const people = await (await admin.get('/ucto/tim')).text()
  if (process.env.FIRMONY_CAPTURE_DIR) writeFileSync(`${process.env.FIRMONY_CAPTURE_DIR}/team-people.html`, people)
  const row = people.split('<li class="row">').find((li) => li.includes('lucia@firmony.test')) ?? ''
  check('a new member without a passkey is marked, with the way to her activation code', row.includes('Bez kľúča') && row.includes('href="/auth/grants"'))
}
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

const security = await checkSecurity({ db, mf, site, admin, anna, acc, as, signIn, emailOnly, capture: process.env.FIRMONY_CAPTURE_DIR })
await checkIncidents({ db, files, admin, anna, acc, lucia, security, nowS, today: day(0), day, unzip, capture: process.env.FIRMONY_CAPTURE_DIR })

// Booking: the reader's proposal, an entry, a rule for the supplier
res = await acc.get(`/ucto/doklady/${cafeDoc?.id}`)
page = await res.text()
check(
  "a document waits with the reader's proposal and the entry it makes",
  res.status === 200 && page.includes('Návrh od softvéru') && page.includes('513') && page.includes('221'),
  page.match(/entry__table[\s\S]{0,300}/)?.[0],
)
res = await acc.post(`/ucto/doklady/${cafeDoc?.id}`, {
  akcia: 'dalsi',
  kind: 'receipt',
  category: 'representation',
  party: 'Kaviareň Na rohu s. r. o.',
  ico: '50123456',
  number: '',
  vs: '',
  issued: skDay(day(-1)),
  due: '',
  total: '12,40',
  vat: '2,07',
  account: '',
  remember: '1',
})
const booked = await db
  .prepare('SELECT booked_at, booked_by, category, vat_deduct, issued_on FROM documents WHERE id = ?')
  .bind(cafeDoc?.id ?? '')
  .first()
check(
  'booked by her, with what she chose',
  res.status === 303 && Boolean(booked?.booked_at) && booked.booked_by === lucia?.id && booked.category === 'representation' && booked.vat_deduct === 0 && booked.issued_on === day(-1),
  JSON.stringify(booked),
)
check('and the supplier is remembered', (await db.prepare("SELECT category FROM supplier_rules WHERE company_id = 'co-a' AND key = 'ico:50123456'").first())?.category === 'representation')
res = await acc.post(`/ucto/doklady/${cafeDoc?.id}`, { akcia: 'ulozit', kind: 'receipt', category: 'representation', party: 'x', total: '12,40', vat: '99,00', issued: '31. 2. 2026' })
page = await res.text()
check(
  'a wrong date or VAT is said, and nothing changes',
  res.status === 422 &&
    page.includes(`Dátum napíšte v${NB}tvare`) &&
    page.includes('DPH musí byť') &&
    (
      await db
        .prepare('SELECT party FROM documents WHERE id = ?')
        .bind(cafeDoc?.id ?? '')
        .first()
    )?.party === 'Kaviareň Na rohu s. r. o.',
)
res = await acc.post(`/ucto/doklady/${cafeDoc?.id}`, { akcia: 'ulozit', kind: 'receipt', category: 'representation', party: 'Kaviareň Na rohu s. r. o.', total: '12,40', vat: '2,07', payable: '20,00', issued: skDay(day(-1)) })
page = await res.text()
check(
  'what is left to pay is asked apart, and more than the total is said and changes nothing',
  res.status === 422 && page.includes('Na úhradu, ak menej') && page.includes('Na úhradu napíšte') &&
    (await db.prepare('SELECT due_cents FROM documents WHERE id = ?').bind(cafeDoc?.id ?? '').first())?.due_cents === null,
)
res = await anna.post(`/app/doklady/${cafeDoc?.id}/zmazat`, {})
check(
  'a client cannot delete a booked document',
  (
    await db
      .prepare('SELECT deleted_at FROM documents WHERE id = ?')
      .bind(cafeDoc?.id ?? '')
      .first()
  )?.deleted_at === null,
)

// The same receipt sent again: a suspected duplicate, proposed by the rule, and thrown away
jar = annaCookie
res = await appPost('/app/doklady', {}, { files: [{ name: 'znova.jpg', type: 'image/jpeg', bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 5, 5, 5, 5, 5]) }] })
await settle(600)
const twin = await db.prepare("SELECT d.id, d.duplicate_of, d.proposal, d.category, l.payment_id FROM documents d LEFT JOIN links l ON l.document_id = d.id WHERE d.file_name = 'znova.jpg'").first()
check(
  'the same receipt again is a suspected duplicate, proposed by the rule, and paired with nothing',
  twin?.duplicate_of === cafeDoc?.id && twin.proposal === 'rule' && twin.category === 'representation' && twin.payment_id === null,
  JSON.stringify(twin),
)
res = await acc.get(`/ucto/doklady/${twin?.id}`)
page = await res.text()
check('the accountant is told so, and can open the other one', /Možno ide o.duplikát/.test(page) && page.includes(`/ucto/doklady/${cafeDoc?.id}`) && page.includes('Podľa pravidla'))
res = await acc.post(`/ucto/doklady/${twin?.id}`, { akcia: 'zahodit' })
check(
  'a duplicate is thrown away',
  res.status === 303 &&
    Boolean(
      (
        await db
          .prepare('SELECT deleted_at FROM documents WHERE id = ?')
          .bind(twin?.id ?? '')
          .first()
      )?.deleted_at,
    ),
)
res = await acc.post(`/ucto/doklady/${cafeDoc?.id}`, { akcia: 'zahodit' })
check(
  'a booked document is not thrown away',
  (
    await db
      .prepare('SELECT deleted_at FROM documents WHERE id = ?')
      .bind(cafeDoc?.id ?? '')
      .first()
  )?.deleted_at === null,
)

// eKasa receipts are known by their own codes: one receipt photographed twice is one even when its amount was read
// wrong the second time, and two receipts of one number and amount (a till starts again at 1 each month) are two.
const pretendPhoto = (name, fields) => ({ name, type: 'image/jpeg', bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new TextEncoder().encode(`PRETEND${JSON.stringify(fields)}`)]) })
const ekasaDocs = async (names) =>
  (await db.prepare(`SELECT id, file_name, duplicate_of, ekasa_uid, ekasa_okp, total_cents FROM documents WHERE file_name IN (${names.map(() => '?').join(', ')}) ORDER BY created_at, rowid`).bind(...names).all()).results
const coffee = { druha_strana: 'Kaviareň Pod hradom', datum_vystavenia: day(-2), cislo_dokladu: '118', suma_celkom: '3.80', dph_celkom: '0.71' }
res = await appPost('/app/doklady', {}, { files: [pretendPhoto('kava.jpg', { ...coffee, ekasa_uid: 'O-7DBCDA8A56EE426DBCDA8A56EE426D1A', ekasa_okp: 'c44b3977 0e415cc6 ee663aa1 776c973a a143b660' })] })
await settle(600)
res = await appPost('/app/doklady', {}, { files: [pretendPhoto('kava-znova.jpg', { ...coffee, suma_celkom: '3.30', ekasa_uid: '0-7dbcda8a56ee426dbcda8a56ee426d1b' })] })
await settle(600)
const [coffee1, coffee2] = await ekasaDocs(['kava.jpg', 'kava-znova.jpg'])
check(
  "the receipt's eKasa codes are kept as the Financial Administration writes them",
  coffee1?.ekasa_uid === 'O-7DBCDA8A56EE426DBCDA8A56EE426D1A' && coffee1.ekasa_okp === 'C44B3977-0E415CC6-EE663AA1-776C973A-A143B660' && coffee1.duplicate_of === null,
  JSON.stringify(coffee1),
)
check(
  'one eKasa receipt photographed twice is one, though its amount and a character of its code were read wrong',
  coffee2?.duplicate_of === coffee1?.id && coffee2.total_cents === 330 && coffee2.ekasa_uid === 'O-7DBCDA8A56EE426DBCDA8A56EE426D1B',
  JSON.stringify(coffee2),
)
res = await appPost('/app/doklady', {}, { files: [pretendPhoto('kava-tretia.jpg', { ...coffee, suma_celkom: '3.30', datum_vystavenia: day(-7), ekasa_uid: 'O-7DBCDA8A56EE426DBCDA8A56EE426D1A' })] })
await settle(600)
res = await appPost('/app/doklady', {}, { files: [pretendPhoto('kava-stvrta.jpg', { ...coffee, suma_celkom: '', ekasa_okp: 'C44B3977-0E415CC6-EE663AA1-776C973A-A143B660' })] })
await settle(600)
const [coffee3, coffee4] = await ekasaDocs(['kava-tretia.jpg', 'kava-stvrta.jpg'])
check(
  'a third photo with its amount and day read wrong is known by its code, as the first one, never as a duplicate',
  coffee3?.duplicate_of === coffee1?.id && coffee3.total_cents === 330,
  JSON.stringify(coffee3),
)
check('and one whose amount could not be read at all', coffee4?.duplicate_of === coffee1?.id && coffee4.total_cents === null, JSON.stringify(coffee4))
res = await acc.get(`/ucto/doklady/${coffee1?.id}`)
page = await res.text()
check(
  'the accountant sees the code and where to check it',
  /eKasa UID<\/span><span class="book__codevalue">O-7DBCDA8A56EE426DBCDA8A56EE426D1A</.test(page) && page.includes('href="https://opd.financnasprava.sk/"'),
)
const parking = { druha_strana: 'Parkovisko Centrum s. r. o.', ico_druhej_strany: '50999888', cislo_dokladu: '1', suma_celkom: '2.00', dph_celkom: '0.37', kategoria: 'travel' }
res = await appPost('/app/doklady', {}, { files: [pretendPhoto('parkovanie-1.jpg', { ...parking, datum_vystavenia: day(-35), ekasa_uid: 'O-0F3A6C1E9B2D4E58A7C3F1B0D9E2A4C6' })] })
await settle(600)
res = await appPost('/app/doklady', {}, { files: [pretendPhoto('parkovanie-2.jpg', { ...parking, datum_vystavenia: day(-5), ekasa_uid: 'O-B84E21D7C5A9F3E0D6B2A8C4E1F7D3B9' })] })
await settle(600)
res = await appPost('/app/doklady', {}, { files: [pretendPhoto('parkovanie-3.jpg', { ...parking, datum_vystavenia: day(-5) })] })
await settle(600)
const [parking1, parking2, parking3] = await ekasaDocs(['parkovanie-1.jpg', 'parkovanie-2.jpg', 'parkovanie-3.jpg'])
check('two receipts of one number and amount are two when their codes differ', parking1?.duplicate_of === null && parking2?.duplicate_of === null, JSON.stringify([parking1, parking2]))
check('without a code, the number and the amount still tell a duplicate', parking3?.duplicate_of === parking2?.id, JSON.stringify(parking3))
for (const d of [coffee1, coffee2, coffee3, coffee4, parking1, parking2, parking3]) await anna.post(`/app/doklady/${d?.id}/zmazat`, {})
check(
  'and the client can delete them all',
  (await db.prepare("SELECT COUNT(*) AS n FROM documents WHERE (file_name LIKE 'kava%' OR file_name LIKE 'parkovanie-%') AND deleted_at IS NULL").first())?.n === 0,
)
await checkAutomation({ db, acc, anna, nowS, day, appPost, pretendPhoto, settle, capture: process.env.FIRMONY_CAPTURE_DIR })

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
check(
  'and the client is rung, with nothing of it in the email',
  (await sent())
    .slice(before2)
    .some((m) => m.to === 'anna@firma-a.test' && m.subject === 'Firmony: máte novú správu' && m.text.includes('/app/spravy') && !m.text.includes('64,18') && !m.text.includes('Lucia')),
)

// Messages: what waits for an answer, and the answer
res = await acc.get('/ucto/spravy')
page = await res.text()
check("a client's message waits for her", page.includes('Firma A s. r. o.') || page.includes('Všetkým klientom ste odpovedali'))
jar = annaCookie
const before2b = (await sent()).length
res = await appPost('/app/spravy', { sprava: 'Bloček naozaj nemám.' })
await settle()
check(
  "a client's message now rings her own accountant, and says nothing of it",
  (await sent()).slice(before2b).some((m) => m.to === 'lucia@firmony.test' && m.text.includes('/ucto/klienti/co-a#spravy') && !m.text.includes('Bloček')),
)
res = await appPost('/app/spravy', { sprava: 'A ešte jedna vec.' })
await settle()
check('a second message before anybody looked rings nothing more', (await sent()).slice(before2b).filter((m) => m.to === 'lucia@firmony.test').length === 1)
res = await acc.get('/ucto/spravy')
check('and the original unanswered question still waits in her inbox', (await res.text()).includes('čo s touto platbou?'))
res = await acc.post('/ucto/klienti/co-a/spravy', { sprava: 'Rozumiem, zaúčtujeme ho podľa výpisu.' })
await settle()
check(
  'an answer while the client has not read the last message rings her no more',
  (await sent()).slice(before2).filter((m) => m.to === 'anna@firma-a.test' && m.subject === 'Firmony: máte novú správu').length === 1,
)
res = await acc.get('/ucto/spravy')
check('answered, nothing waits', (await res.text()).includes('Všetkým klientom ste odpovedali'))
jar = annaCookie
res = await appGet('/app/spravy')
check('the client reads the answer under her name', (await res.text()).includes('Lucia Horváthová'))

await checkSupportQueue({ db, acc, admin, anna, nowS, lucia, boss: bossRow })

// A request from the site becomes a client in one form, with a welcome email that signs in
await db
  .prepare(
    "INSERT INTO requests (id, created_at, ico, company, plan, situation, name, email, privacy_version) VALUES ('req-x', ?, NULL, 'Nová firma s. r. o.', 'rast', 'fresh', 'Peter Nový', 'peter@nova-firma.test', 'v1')",
  )
  .bind(nowS)
  .run()
res = await admin.get('/ucto/ziadosti')
page = await res.text()
check('the administrator sees the request', page.includes('Nová firma s. r. o.'))
check("and who wants the investors' tax return, with the brokers and the way", page.includes('investor@example.sk') && page.includes('XTB, Interactive Brokers') && page.includes('Za neho'))
check('with signing released, the requests page says nothing of the approval', !page.includes('Ako povoliť podpisovanie'))
res = await admin.get('/ucto/ziadosti/schvalenie')
page = await res.text()
check(
  'the approval page says that signing holds, until when, and for which wording and prices',
  res.status === 200 && page.includes('Podpisovanie je povolené do') && page.includes(await contractCatalogueHash()) && !page.includes('id="hodnota"'),
)
res = await admin.get('/ucto/ziadosti/schvalenie?pravne=JUD&poistne=Poistovna%20Test%2C%20123&do=1.%201.%202020')
page = plain(await res.text())
check('it prepares nothing from a reference too short or a day gone', res.status === 422 && page.includes('Napíšte aspoň 5 znakov') && page.includes('Deň musí byť v budúcnosti') && !page.includes('id="hodnota"'))
res = await admin.get('/ucto/ziadosti/schvalenie?pravne=JUDr.%20Test%2C%203.%2011.%202026&poistne=Poistovna%20Test%2C%20123&do=31.%2012.%202099')
page = await res.text()
{
  const raw = page.match(/<code class="release__value">([^<]*)<\/code>/)?.[1] ?? ''
  const value = raw.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
  const made = approvedRelease(value, await contractCatalogueHash(), Math.floor(Date.now() / 1000))
  check('it prepares the value the gate takes, with the references as typed', res.status === 200 && made?.legalReview === 'JUDr. Test, 3. 11. 2026' && made?.insuranceReview === 'Poistovna Test, 123', value)
  if (process.env.FIRMONY_CAPTURE_DIR) writeFileSync(`${process.env.FIRMONY_CAPTURE_DIR}/contract-release.html`, page)
}
res = await acc.get('/ucto/ziadosti/schvalenie')
check('an accountant gets nothing at the approval page', res.status === 404)
res = await admin.get('/ucto/klienti/novy?ziadost=req-x')
page = await res.text()
check('the form starts from the request', page.includes('value="Nová firma s. r. o."') && page.includes('value="peter@nova-firma.test"') && page.includes('value="Peter Nový"'))
const firstMonth = page.match(/<option value="(\d{4}-\d{2}-01)"/)?.[1] ?? ''
check('it asks for the first month of the service, November 2026 at the earliest', firstMonth >= '2026-11-01', firstMonth)
if (process.env.FIRMONY_CAPTURE_DIR) writeFileSync(`${process.env.FIRMONY_CAPTURE_DIR}/new-client.html`, page)
res = await acc.post('/ucto/klienti', { name: 'Iná s. r. o.', person: 'Ina', email: 'ina@ina.test', plan: 'start' })
check('an accountant cannot make a client', res.status === 404 && (await db.prepare("SELECT COUNT(*) AS n FROM companies WHERE name = 'Iná s. r. o.'").first())?.n === 0)
res = await admin.post('/ucto/klienti', { ico: '57442452', name: 'Duplicitná', person: 'X Y', email: 'x@y.test', plan: 'start' })
check('a company that is already ours is not made twice', res.status === 422 && /už.u.nás je/.test(await res.text()))
const manualClient = {
  ico: '55118888',
  name: 'Nová firma s. r. o.',
  address: 'Testovacia 12, Košice',
  person: 'Peter Nový',
  email: 'peter@nova-firma.test',
  plan: 'rast',
  uctovnicka: lucia?.id ?? '',
  uvitat: '1',
  ziadost: 'req-x',
  start: firstMonth,
  akcia: 'zalozit',
}
res = await admin.post('/ucto/klienti', manualClient)
check(
  'a client is not made by hand without a contract signed on paper',
  res.status === 422 && (await res.text()).includes('Bez podpísanej zmluvy') && (await db.prepare("SELECT COUNT(*) AS n FROM companies WHERE name = 'Nová firma s. r. o.'").first())?.n === 0,
)
res = await admin.post('/ucto/klienti', { ...manualClient, mimo: '1' })
check('a paper signature alone cannot bypass pre-contract AML verification',res.status === 422 && !(await db.prepare("SELECT id FROM companies WHERE name = 'Nová firma s. r. o.'").first()))
await db.prepare(`INSERT INTO orders (id,token,created_at,expires_at,request_id,ico,company,address,directors,plan,person,email,legal_form,aml_paper) VALUES ('aml-manual','TEST ONLY token',?,?, 'req-x',?,?,?,?,'rast',?,?,'sro',1)`)
  .bind(nowS,nowS+86400,manualClient.ico,manualClient.name,manualClient.address,JSON.stringify([{name:manualClient.person,role:'Konateľ'}]),manualClient.person,manualClient.email).run()
const amlOfficer = await ensureAmlOfficer(db)
const manualDossier = await seedAmlDossier(db,files,'aml-manual',amlOfficer)
manualClient.aml = 'aml-manual'
const manualOriginal = await (await files.get(manualDossier.dossier.file_key)).arrayBuffer()
await files.put(manualDossier.dossier.file_key,'TEST ONLY altered identity original')
res = await admin.post('/ucto/klienti', { ...manualClient, mimo: '1' })
check('a paper client cannot be created with a corrupted identity original',res.status === 422 && !(await db.prepare("SELECT id FROM companies WHERE name='Nová firma s. r. o.'").first()))
await files.put(manualDossier.dossier.file_key,manualOriginal)
const before3 = (await sent()).length
res = await admin.post('/ucto/klienti', { ...manualClient, mimo: '1' })
await settle()
const made = await db
  .prepare(
    "SELECT c.id, c.accountant_id, c.plan, c.inbox, m.role FROM companies c JOIN members m ON m.company_id = c.id JOIN users u ON u.id = m.user_id WHERE c.name = 'Nová firma s. r. o.' AND u.email = 'peter@nova-firma.test'",
  )
  .first()
check(
  'the client, the person and the membership are made at once',
  res.status === 303 && made?.accountant_id === lucia?.id && made.plan === 'rast' && made.role === 'owner' && /^[a-z2-9]{8}$/.test(made.inbox),
)
const madeContract = await db.prepare('SELECT terms_version, start_on, signed_by FROM companies WHERE id = ?').bind(made?.id ?? '').first()
check('the price list of that day is kept as what it is billed by', Boolean(await db.prepare('SELECT 1 AS x FROM billing_tariffs WHERE company_id = ?').bind(made?.id ?? '').first()))
check(
  'with its paper contract, who signed it and its first month on it',
  madeContract?.start_on === firstMonth && madeContract?.terms_version === 'offline' && madeContract?.signed_by === 'Peter Nový',
)
check('the request is marked as a client', (await db.prepare("SELECT status FROM requests WHERE id = 'req-x'").first())?.status === 'client')
const welcome = (await sent()).slice(before3).find((m) => m.to === 'peter@nova-firma.test')
const welcomeToken = welcome?.text.match(/\/app\/vstup\?t=([A-Za-z0-9_-]{43})/)?.[1] ?? ''
check(
  'a welcome doorbell with the sign-in link and nothing else',
  Boolean(welcome) && welcome.subject === 'Firmony: vitajte' && Boolean(welcomeToken) && !welcome.text.includes(`doklady-${made?.inbox}`) && !welcome.text.includes('Nová firma'),
)
res = await post('/app/vstup', { t: welcomeToken }, { ip: '203.0.113.31' })
const peter = as((res.headers.get('set-cookie') ?? '').split(';')[0])
check('its link signs the new client in', res.status === 303 && res.headers.get('location') === '/app/rychle-prihlasenie?next=%2Fapp')
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
await db
  .prepare("UPDATE users SET email = 'christian@europio.test' WHERE id = ?")
  .bind(bossRow?.id ?? '')
  .run()
await post('/app/prihlasenie', { email: 'ahoj@firmony.io' }, { ip: '203.0.113.32' })
await settle()
check('once a team exists, the public mailbox makes nobody an administrator', (await db.prepare("SELECT COUNT(*) AS n FROM users WHERE email = 'ahoj@firmony.io'").first())?.n === 0)
await db
  .prepare("UPDATE users SET email = 'ahoj@firmony.io' WHERE id = ?")
  .bind(bossRow?.id ?? '')
  .run()
check(
  "the team's work is on record",
  (
    await db
      .prepare("SELECT COUNT(*) AS n FROM events WHERE action IN ('document.booked', 'document.discarded', 'exempt.returned', 'message.answered', 'company.created', 'team.added', 'team.bootstrap')")
      .first()
  )?.n >= 7,
)

// Documents by email: the company's own address
function rawMail({ to, subject = 'Faktúra 2026117', attachments = [] }) {
  const b = 'hranica-1'
  const parts = [`--${b}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nDobrý deň, v prílohe posielame faktúru.\r\n`]
  for (const a of attachments) {
    parts.push(
      `--${b}\r\nContent-Type: ${a.type}; name="${a.name}"\r\nContent-Disposition: ${a.inline ? 'inline' : 'attachment'}; filename="${a.name}"\r\n${a.inline ? 'Content-ID: <logo@dodavatel>\r\n' : ''}Content-Transfer-Encoding: base64\r\n\r\n${Buffer.from(a.bytes).toString('base64').replace(/.{76}/g, '$&\r\n')}\r\n`,
    )
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
res = await sendMail(
  'doklady-aaaa11@firmony.io',
  rawMail({
    to: 'doklady-aaaa11@firmony.io',
    attachments: [
      { name: 'faktura-2026117.pdf', type: 'application/pdf', bytes: pdfBytes },
      { name: 'logo.png', type: 'image/png', bytes: logo, inline: true },
    ],
  }),
)
await res.arrayBuffer()
await settle(800)
const mailed = await db.prepare("SELECT source, file_name, file_type, status, added_by FROM documents WHERE company_id = 'co-a' AND source = 'email'").all()
check(
  "an email to the company's address brings its PDF in, and not the logo of the signature",
  res.status === 200 &&
    mailed.results.length === 1 &&
    mailed.results[0].file_name === 'faktura-2026117.pdf' &&
    mailed.results[0].file_type === 'application/pdf' &&
    mailed.results[0].added_by === null,
  JSON.stringify(mailed.results),
)
check('and the reader reads it', readings.length === readsBefore + 1 && readings.at(-1)?.messages?.[0]?.content?.[0]?.type === 'document' && mailed.results[0]?.status !== 'reading')
check(
  'the email is on record without its text',
  (await db.prepare("SELECT sender, subject, files, status FROM inbound_mail WHERE company_id = 'co-a' ORDER BY received_at DESC LIMIT 1").first())?.subject === 'Faktúra 2026117',
)
res = await sendMail('doklady-aaaa11@firmony.io', rawMail({ to: 'doklady-aaaa11@firmony.io', attachments: [{ name: 'faktura-2026117.pdf', type: 'application/pdf', bytes: pdfBytes }] }))
await res.arrayBuffer()
check('the same document by email again is not kept twice', (await db.prepare("SELECT COUNT(*) AS n FROM documents WHERE company_id = 'co-a'").first())?.n === mailBefore + 1)
res = await sendMail('doklady-aaaa11@firmony.io', rawMail({ to: 'doklady-aaaa11@firmony.io', subject: 'Odkaz na faktúru' }))
await res.arrayBuffer()
const note = await db.prepare("SELECT body, side, author FROM messages WHERE company_id = 'co-a' ORDER BY created_at DESC, rowid DESC LIMIT 1").first()
check('an email without a document leaves the client a note', note?.side === 'firmony' && note.author === null && note.body.includes('Odkaz na faktúru') && note.body.includes('faktury@kvety.test'))
// A newsletter with a large picture inside its text: no document
{
  const big = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...new Array(20000).fill(5)])
  const raw = [
    'From: Novinky <novinky@kvety.test>',
    'To: doklady-aaaa11@firmony.io',
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
  res = await sendMail('doklady-aaaa11@firmony.io', raw)
  await res.arrayBuffer()
  check('a picture inside the text of an email is no document', (await db.prepare("SELECT COUNT(*) AS n FROM documents WHERE file_name = 'banner.png'").first())?.n === 0)
}
res = await sendMail('doklady-zzzzzz@firmony.io', rawMail({ to: 'doklady-zzzzzz@firmony.io', attachments: [{ name: 'f.pdf', type: 'application/pdf', bytes: pdfBytes }] }))
check('an address nobody has is refused', res.status === 400 && (await res.text()).includes('neexistuje'))
res = await sendMail('doklady-aaaa11@elsewhere.test', rawMail({ to: 'doklady-aaaa11@elsewhere.test', attachments: [{ name: 'f.pdf', type: 'application/pdf', bytes: pdfBytes }] }))
check('so is the right code at another domain', res.status === 400)

// The company and its settings: people, an invitation, reminders
res = await anna.post('/app/firma/prepnut', { firma: 'co-a' })
res = await anna.get('/app/firma')
page = await res.text()
check(
  'the company page shows its details, its address for documents and its people',
  res.status === 200 && page.includes('doklady-aaaa11@firmony.io') && page.includes('Anna Malá') && page.includes('action="/app/firma/pozvat"'),
)
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
res = await janSession.get(`/app/export?rok=${day(0).slice(0, 4)}`)
check('an ordinary member cannot download employee personal data in the complete archive', res.status === 403)
// An owner without a passkey downloads the archive right after signing in by a link; later a new link is asked for,
// and it leads back to the download. No page about keys the client never set up.
await db.prepare("UPDATE members SET role = 'owner' WHERE company_id = 'co-a' AND user_id = ?").bind(jan?.id ?? '').run()
await db.prepare('UPDATE sessions SET created_at = created_at - 1000 WHERE user_id = ?').bind(jan?.id ?? '').run()
const exportPath = `/app/export?rok=${day(0).slice(0, 4)}`
res = await janSession.get(exportPath)
check('an owner without a key and an old sign-in is asked for a fresh link, not for a key', res.status === 303 && res.headers.get('location') === `/app/potvrdit?next=${encodeURIComponent(exportPath)}`)
const beforeConfirm = (await sent()).length
res = await janSession.post('/app/potvrdit', { next: exportPath })
await settle()
const confirmMail = (await sent()).slice(beforeConfirm).find((m) => m.to === 'jan@firma-a.test')
const confirmLink = confirmMail?.text.match(/\/app\/vstup\?t=([A-Za-z0-9_-]{43})&n=([^\s]+)/)
check('the link goes to the owner and carries the way back', res.status === 303 && Boolean(confirmLink) && decodeURIComponent(confirmLink?.[2] ?? '') === exportPath)
res = await post('/app/vstup', { t: confirmLink?.[1] ?? '', n: decodeURIComponent(confirmLink?.[2] ?? '') }, { ip: '203.0.113.33' })
const freshJan = as((res.headers.get('set-cookie') ?? '').split(';')[0])
check('the fresh sign-in leads straight back to the download', res.status === 303 && res.headers.get('location') === exportPath)
res = await freshJan.get(exportPath)
check('and the download starts', res.status === 200 && (res.headers.get('content-type') ?? '').includes('zip'))
await res.arrayBuffer()
res = await post('/app/vstup', { t: 'x'.repeat(43), n: 'https://evil.example/' }, { ip: '203.0.113.33' })
check('a used or forged link leads nowhere else', res.status === 410)
await db.prepare("UPDATE members SET role = 'member' WHERE company_id = 'co-a' AND user_id = ?").bind(jan?.id ?? '').run()
res = await anna.post('/app/firma/pozvat', { meno: 'Ján Spoločník', email: 'JAN@firma-a.test' })
check('somebody who is in already is not invited twice', res.status === 409)
res = await janSession.post('/app/firma/pozvat', { meno: 'Cudzí', email: 'cudzi@x.test' })
check('a member who is no owner invites nobody', res.status === 403 && (await db.prepare("SELECT COUNT(*) AS n FROM users WHERE email = 'cudzi@x.test'").first())?.n === 0)
res = await janSession.post('/app/firma/ludia/u-a/odobrat', {})
check('nor removes anybody', res.status === 403 && (await db.prepare("SELECT COUNT(*) AS n FROM members WHERE company_id = 'co-a' AND user_id = 'u-a'").first())?.n === 1)
res = await anna.post('/app/firma/ludia/u-a/odobrat', {})
check('an owner does not remove herself', (await db.prepare("SELECT COUNT(*) AS n FROM members WHERE company_id = 'co-a' AND user_id = 'u-a'").first())?.n === 1)
res = await anna.post(`/app/firma/ludia/${jan?.id}/odobrat`, {})
check(
  'an owner removes a member',
  res.status === 303 &&
    (
      await db
        .prepare("SELECT COUNT(*) AS n FROM members WHERE company_id = 'co-a' AND user_id = ?")
        .bind(jan?.id ?? '')
        .first()
    )?.n === 0,
)
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
  'a verified new company starts with its completed declaration and the remaining first steps',
  page.includes('Začíname') &&
    page.includes('Hotovo') && !page.includes('href="/app/vyhlasenie"') &&
    page.indexOf('href="/app/plna-moc"') < page.indexOf('href="/app/banka#prepojit"') &&
    page.includes('href="/app/firma#doklady-emailom"'),
)
check('a company that is founded is not offered the notice to a former accountant', !page.includes('href="/app/prechod"'))
res = await anna.get('/app')
page = await res.text()
check('a company with payments and documents but no power of attorney is still shown its first steps', page.includes('Začíname') && page.includes('href="/app/plna-moc"'))

// The power of attorney: a paper of the company's own to sign, the signed file back, the accountant's check
res = await anna.get('/app/plna-moc')
page = await res.text()
check(
  "the power of attorney is the company's own paper, ready to sign",
  res.status === 200 &&
    page.includes('Plnomocenstvo') &&
    page.includes('Firma A s. r. o.') &&
    page.replace(/\u00a0/g, ' ').includes('IČO 57 442 452') &&
    page.includes('europio s. r. o.') &&
    page.includes('Čakáme na podpis') &&
    page.includes('action="/app/plna-moc"'),
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
check(
  'and the accountant is rung to check it',
  (await sent())
    .slice(beforePoa)
    .some(
      (m) =>
        m.to === 'lucia@firmony.test' &&
        m.subject === 'Firmony: plná moc na overenie' &&
        m.text.includes('/ucto/klienti/co-a#zmluva') &&
        !m.text.includes('Firma A') &&
        !m.text.includes('plnomocenstvo.asice'),
    ),
)
const poaRow = await db.prepare("SELECT id, file_type, file_name, r2_key, checked_at FROM company_files WHERE company_id = 'co-a' AND kind = 'poa'").first()
check(
  'it is kept as what it is, under the company',
  poaRow?.file_type === 'application/vnd.etsi.asic-e+zip' && poaRow.file_name === 'plnomocenstvo.asice' && poaRow.r2_key.startsWith('companies/co-a/papers/') && poaRow.checked_at === null,
)
res = await anna.get(`/app/plna-moc/${poaRow?.id}`)
check(
  'the client downloads it back, never shown as a page',
  res.status === 200 && (res.headers.get('content-disposition') ?? '').startsWith('attachment') && res.headers.get('content-type') === 'application/octet-stream',
)
res = await peter.get(`/app/plna-moc/${poaRow?.id}`)
check('another company does not get it', res.status === 404)
res = await anna.get('/app/plna-moc?ok=plna-moc')
check('the page then says that we check it', (await res.text()).includes('Overujeme ju'))
const signedPdf = new Uint8Array([...new TextEncoder().encode('%PDF-1.7\n'), ...new Uint8Array(40_000).fill(32)])
res = await anna.upload('/app/plna-moc', { name: 'plna moc podpisana.pdf', type: 'application/pdf', bytes: signedPdf })
check(
  'a signed PDF of real size arrives too, under a name of ours',
  res.status === 303 &&
    (await db.prepare("SELECT COUNT(*) AS n FROM company_files WHERE company_id = 'co-a' AND file_name = 'plna moc podpisana.pdf' AND file_type = 'application/pdf'").first())?.n === 1,
  res.status,
)
res = await anna.get('/app')
check('with its power of attorney but no declaration, the first steps stay', (await res.text()).includes('href="/app/vyhlasenie"'))

// Kto stojí za firmou: the declaration for the law against money laundering, given in the app by the owner
res = await anna.get('/app/vyhlasenie')
page = await res.text()
check(
  'the declaration asks who runs, owns and pays the company, starting from what we know',
  res.status === 200 &&
    page.includes('Kto stojí za firmou') &&
    page.includes('name="rc"') &&
    page.includes('name="kuv"') &&
    page.includes('name="o1Share"') &&
    page.includes('Čakáme na údaje') &&
    page.includes('value="Anna Malá"') &&
    page.includes('value="slovenská"'),
)
const decl = {
  businessAtSeat:'1',businessCountries:'SK',ownBehalf:'1',residenceCountry:'SK',citizenships:'SK',partnerCountries:'SK',o1ResidenceCountry:'SK',o1Citizenships:'SK',
  name: 'Anna Malá',
  rc: '905312/0010',
  dob: '',
  address: 'Hlavná 5, 040 01 Košice',
  nationality: 'slovenská',
  idKind: 'op',
  idNumber: 'EA123456',
  pep: '0',
  kuv: 'with',
  o1Name: 'Ján Spoločník',
  o1Rc: '',
  o1Dob: '2. 5. 1988',
  o1Address: 'Mlynská 3, 040 01 Košice',
  o1Nationality: 'slovenská',
  o1Share: '40 %',
  activity: 'Predaj kvetov',
  income: 'Tržby od zákazníkov',
  turnover: 'do-50',
  cash: '1',
  abroad: '0',
  abroadWhere: '',
  truthful: '1',
}
res = await anna.post('/app/vyhlasenie', { ...decl, truthful: '' })
page = (await res.text()).replace(/ /g, ' ')
check(
  'without the statement it is not taken, and what was typed stays',
  res.status === 422 &&
    page.includes('Bez tohto vyhlásenia') &&
    page.includes('value="Predaj kvetov"') &&
    (await db.prepare("SELECT COUNT(*) AS n FROM declarations WHERE company_id = 'co-a'").first())?.n === 0,
)
res = await anna.post('/app/vyhlasenie', { ...decl, rc: '905312/0011' })
check('a birth number that cannot be one is said at its field', res.status === 422 && (await res.text()).includes('Toto rodné číslo nie je platné'))
const beforeDecl = (await sent()).length
res = await anna.upload('/app/vyhlasenie', {name:'TEST_ONLY-signed.pdf',type:'application/pdf',bytes:signedPdf}, decl, 'podpis')
check('the owner gives it', res.status === 303 && res.headers.get('location') === '/app/vyhlasenie?ok=vyhlasenie', res.status)
await settle()
const declRow = await db.prepare("SELECT id, data, created_by, checked_at FROM declarations WHERE company_id = 'co-a'").first()
const declData = JSON.parse(declRow?.data ?? '{}')
check(
  'it is kept as given, with who gave it',
  declRow?.created_by === 'u-a' &&
    declData.director?.birthNumber === '905312/0010' &&
    declData.owners?.[0]?.name === 'Ján Spoločník' &&
    declData.owners?.[0]?.birthDate === '1988-05-02' &&
    declData.cash === true &&
    declRow.checked_at === null,
  declRow?.data,
)
const declBell = (await sent()).slice(beforeDecl).find((m) => m.to === 'lucia@firmony.test')
check(
  'the accountant is rung, and the doorbell carries nothing of it',
  Boolean(declBell) && declBell.subject === 'Firmony: údaje klienta na overenie' && declBell.text.includes('/ucto/klienti/co-a/aml') && !/Anna|905312|Ján|Firma A|kvet/.test(declBell.text),
)
res = await anna.get('/app/vyhlasenie?ok=vyhlasenie')
page = await res.text()
check(
  'the owner reads it back with the birth number cut short',
  page.includes('******/0010') && !page.includes('905312') && page.includes('Overujeme ich') && page.includes('href="/app/vyhlasenie?zmenit=1"'),
)
res = await anna.get('/app/vyhlasenie?zmenit=1')
check('and can change it, starting from what was given', (await res.text()).includes('value="Predaj kvetov"'))
// A member who is no owner is told where it stands and nothing more, and gives nothing: no declaration, no notice
const peterUserId = (await db.prepare("SELECT id FROM users WHERE email = 'peter@nova-firma.test'").first())?.id ?? ''
await db.prepare("INSERT INTO members (company_id, user_id, role, created_at) VALUES ('co-a', ?, 'member', ?)").bind(peterUserId, nowS).run()
await peter.post('/app/firma/prepnut', { firma: 'co-a' })
res = await peter.get('/app/vyhlasenie')
page = (await res.text()).replace(/\u00a0/g, ' ')
check('a member who is no owner sees nothing of the declaration', res.status === 200 && page.includes('vypĺňa a vidí len majiteľ firmy') && !page.includes('Predaj kvetov') && !page.includes('/0010'))
res = await peter.post('/app/vyhlasenie', decl)
check('nor gives one', res.status === 403 && (await db.prepare("SELECT COUNT(*) AS n FROM declarations WHERE company_id = 'co-a'").first())?.n === 1)
res = await peter.post('/app/firma/vypoved', { potvrdit: '1' })
check('nor gives notice', res.status === 403 && (await db.prepare("SELECT notice_at FROM companies WHERE id = 'co-a'").first())?.notice_at === null)
await peter.post('/app/firma/prepnut', { firma: made?.id ?? '' })
await db.prepare("DELETE FROM members WHERE company_id = 'co-a' AND user_id = ?").bind(peterUserId).run()

// A change is a new version; the old one is kept, and only the newest can be checked
res = await anna.upload('/app/vyhlasenie', {name:'TEST_ONLY-signed-v2.pdf',type:'application/pdf',bytes:signedPdf}, { ...decl, address: 'Hlavná 6, 040 01 Košice' }, 'podpis')
const versions = (await db.prepare("SELECT id, data FROM declarations WHERE company_id = 'co-a' ORDER BY created_at, rowid").all()).results
const newest = versions.at(-1)
check('a change is kept as a new version beside the old one', res.status === 303 && versions.length === 2 && JSON.parse(newest?.data ?? '{}').director?.address === 'Hlavná 6, 040 01 Košice')

// The team checks it, puts the client in a risk, and reports what is unusual to the designated person
res = await acc.get('/ucto')
check("the accountant's list says the client's data wait for her", (await res.text()).includes('Údaje na overenie'))
res = await acc.get('/ucto/klienti/co-a/aml')
page = (await res.text()).replace(/ /g, ' ')
if(process.env.FIRMONY_CAPTURE_DIR) writeFileSync(`${process.env.FIRMONY_CAPTURE_DIR}/aml-review.html`,page)
// His word of 27 October 2026: the people's personal data are seen and checked by the designated person alone.
check(
  'the accountant sees the identification only as its state, never the personal data',
  res.status === 200 && page.includes('vidí a overuje len určená osoba') && !page.includes('905312/0010') && !page.includes('EA123456') && !page.includes('Doklady a vykonané kontroly'),
)
check('with the risk it points to', page.includes('navrhujeme: štandardné'))
res = await admin.get('/ucto/klienti/co-a/aml')
page = (await res.text()).replace(/ /g, ' ')
check(
  'the designated person reads the declaration in full',
  res.status === 200 &&
    page.includes('905312/0010') &&
    page.includes('Ján Spoločník, 40 %') &&
    page.includes('Predaj kvetov') &&
    page.includes('EA123456') &&
    page.includes('Doklady a vykonané kontroly'),
)
res = await anna.get('/ucto/klienti/co-a/aml')
check("a client gets nothing of the team's page", res.status === 404)
check('she reads the newest version', page.includes('Hlavná 6, 040 01 Košice'))
res = await acc.post('/ucto/klienti/co-a/aml/overit', { vyhlasenie: declRow?.id ?? '' })
check(
  'the old checked button is gone, and an older version is never checked in place of the newest',
  res.status === 404 &&
  (
    await db
      .prepare('SELECT checked_at FROM declarations WHERE id = ?')
      .bind(declRow?.id ?? '')
      .first()
  )?.checked_at === null && (await db.prepare("SELECT COUNT(*) AS n FROM events WHERE action = 'declaration.checked'").first())?.n === 0,
)
res = await acc.post('/ucto/klienti/co-a/aml/overit', { vyhlasenie: newest?.id ?? '' })
check('the legacy checked button cannot bypass signature, KUV or sanctions evidence',res.status === 404 && (await db.prepare('SELECT checked_at FROM declarations WHERE id = ?').bind(newest.id).first()).checked_at === null)
let companyAml = await aml.dossierOfCompany(db,'co-a')
const companyCheckFields = (kind) => ({druh:kind,vysledok:'clear',zdroj:`TEST ONLY current independent ${kind} source`,podpisujuci:'Anna Malá',kvalifikovany:'1',hash:companyAml.dossier.facts_hash})
for (const kind of ['identity','kuv','pep','eu-sanctions','un-sanctions','countries']) {
  res=await acc.post(`/ucto/aml/spisy/${companyAml.dossier.id}/kontrola`,companyCheckFields(kind))
  check(`an accountant can no longer record the ${kind} check`,res.status===404)
  res=await admin.post(`/ucto/aml/spisy/${companyAml.dossier.id}/kontrola`,companyCheckFields(kind))
  check(`the designated person records the ${kind} check through the protected route`,res.status===303)
}
res=await acc.post(`/ucto/aml/spisy/${companyAml.dossier.id}/rozhodnutie`,{rozhodnutie:'approved',riziko:'standard',dovod:'TEST ONLY independent complete review',hash:companyAml.dossier.facts_hash})
check('an assigned accountant cannot substitute for the designated person',res.status===404)
res=await admin.post(`/ucto/aml/spisy/${companyAml.dossier.id}/rozhodnutie`,{rozhodnutie:'approved',riziko:'standard',dovod:'TEST ONLY independent complete review',hash:companyAml.dossier.facts_hash})
check('the designated person confirms all current evidence in one decision',res.status===303 && (await db.prepare('SELECT checked_by FROM declarations WHERE id = ?').bind(newest.id).first()).checked_by===amlOfficer.id)
res=await anna.get('/app/vyhlasenie')
check('the client sees the completed verification',(await res.text()).includes('Overené'))
res = await acc.post('/ucto/klienti/co-a/aml/riziko', { uroven: 'low', poznamka:'TEST ONLY unsupported downgrade' })
const riskRow=await db.prepare("SELECT level,created_by FROM risks WHERE company_id='co-a' ORDER BY created_at DESC,rowid DESC LIMIT 1").first()
check('the old risk endpoint is gone and cannot overwrite the designated decision',res.status===404 && riskRow.level==='standard' && riskRow.created_by===amlOfficer.id)
res = await acc.post('/ucto/klienti/co-a/aml/oznamenie', { text: '  ' })
check('an empty report is not taken', res.status === 422)
const beforeRep = (await sent()).length
res = await acc.post('/ucto/klienti/co-a/aml/oznamenie', { text: 'Tri vklady hotovosti po 9 900 € za týždeň.' })
await settle()
const rep = await db.prepare("SELECT id, created_by, decided_at FROM reports WHERE company_id = 'co-a'").first()
check('a report is kept and waits for the designated person', res.status === 303 && rep?.created_by === lucia?.id && rep.decided_at === null)
const repMail = (await sent()).slice(beforeRep)
check(
  'the administrator is rung, the client is not, and the email says nothing of it',
  repMail.some((m) => m.to === 'ahoj@firmony.io' && m.subject === 'Firmony: interné oznámenie' && !m.text.includes('9 900') && !m.text.includes('Firma A')) &&
    !repMail.some((m) => m.to === 'anna@firma-a.test'),
)
res = await anna.get('/app/spravy')
check('the client is never told of a report', !(await res.text()).includes('9 900'))
res = await admin.post('/ucto/klienti/co-a/aml/oznamenie', { text: 'Poznámka správcu k tomu istému.' })
check('an unresolved AML finding independently blocks destructive cleanup',await (await import('../.wrangler/dist/stores.js')).evidenceBlocked(db,'co-a'))
res=await security.admin2.get('/ucto/klienti/co-a/aml')
check('another administrator sees neither the report nor its decision controls',!(await res.text()).includes('Tri vklady hotovosti'))
res = await acc.get('/ucto/klienti/co-a/aml')
page = await res.text()
check("an accountant reads her own reports, not the others'", page.includes('Tri vklady hotovosti') && !page.includes('Poznámka správcu'))
res = await acc.post(`/ucto/klienti/co-a/aml/oznamenie/${rep?.id}`, { rozhodnutie: 'not', poznamka: 'Nič.' })
check(
  'only the designated person decides',
  res.status === 404 &&
    (
      await db
        .prepare('SELECT decided_at FROM reports WHERE id = ?')
        .bind(rep?.id ?? '')
        .first()
    )?.decided_at === null,
)
res = await admin.get('/ucto')
check("the administrator's list says reports wait", /oznámen\S* čak\S* na.posúdenie/.test((await res.text()).replace(/\u00a0/g, ' ')))
res = await admin.post(`/ucto/klienti/co-a/aml/oznamenie/${rep?.id}`, { rozhodnutie: 'not', poznamka: '' })
check('a decision needs its reasons', res.status === 422)
res = await admin.post(`/ucto/klienti/co-a/aml/oznamenie/${rep?.id}`, { rozhodnutie: 'not', poznamka: 'Tržby z jarmoku, doložené pokladničnými dokladmi.' })
check(
  'the designated person decides, on record',
  res.status === 303 &&
    (
      await db
        .prepare('SELECT decision, decided_by FROM reports WHERE id = ?')
        .bind(rep?.id ?? '')
        .first()
    )?.decision === 'not' &&
    (await db.prepare("SELECT COUNT(*) AS n FROM events WHERE action = 'report.decided'").first())?.n === 1,
)
res = await admin.post(`/ucto/klienti/co-a/aml/oznamenie/${rep?.id}`, { rozhodnutie: 'reported', poznamka: 'Predsa.' })
check(
  'and decides once',
  (
    await db
      .prepare('SELECT decision FROM reports WHERE id = ?')
      .bind(rep?.id ?? '')
      .first()
  )?.decision === 'not',
)

// The notice: given in the app by the owner, taken back while the contract runs
const otherPendingReports = (await db.prepare("SELECT id FROM reports WHERE company_id='co-a' AND decided_at IS NULL").all()).results
for (const pending of otherPendingReports) await admin.post(`/ucto/klienti/co-a/aml/oznamenie/${pending.id}`, { rozhodnutie: 'not', poznamka: 'TEST ONLY complete independent source review resolved this finding.' })
const [ny, nm] = day(0).slice(0, 7).split('-').map(Number)
const endsOn = new Date(Date.UTC(ny, nm + 1, 0)).toISOString().slice(0, 10)
res = await anna.get('/app/firma')
page = await res.text()
check(
  'the company page has the notice, folded away',
  page.includes('action="/app/firma/vypoved"') && page.includes('Výpoveď zmluvy') && page.includes('href="/app/zmluva"') && page.includes('href="/app/vyhlasenie"'),
)
res = await anna.post('/app/firma/vypoved', {})
check('without the tick nothing is given', res.status === 422 && (await db.prepare("SELECT notice_at FROM companies WHERE id = 'co-a'").first())?.notice_at === null)
const beforeNotice = (await sent()).length
res = await anna.post('/app/firma/vypoved', { potvrdit: '1' })
await settle()
const noticed = await db.prepare("SELECT notice_at, notice_by, ends_on FROM companies WHERE id = 'co-a'").first()
check('the owner gives notice, and the contract ends on the last day of the next month', res.status === 303 && noticed?.notice_by === 'u-a' && noticed.ends_on === endsOn, JSON.stringify(noticed))
const noticeMsg = await db.prepare("SELECT body, side, author FROM messages WHERE company_id = 'co-a' ORDER BY created_at DESC, rowid DESC LIMIT 1").first()
check(
  'it stands in the messages, and the team is rung',
  noticeMsg?.side === 'client' &&
    noticeMsg.author === 'u-a' &&
    noticeMsg.body.startsWith('Vypovedám zmluvu') &&
    (await sent()).slice(beforeNotice).some((m) => m.to === 'ahoj@firmony.io' && m.subject === 'Firmony: výpoveď zmluvy') &&
    (await sent()).slice(beforeNotice).some((m) => m.to === 'lucia@firmony.test' && m.subject === 'Firmony: výpoveď zmluvy'),
)
res = await anna.post('/app/firma/vypoved', { potvrdit: '1' })
check('notice is given once', (await db.prepare("SELECT COUNT(*) AS n FROM events WHERE action = 'contract.notice' AND company_id = 'co-a'").first())?.n === 1)
res = await anna.get('/app/firma')
page = (await res.text()).replace(/ /g, ' ')
check('the company page says when it ends, and offers to take it back', page.includes('Zmluvu ste vypovedali') && page.includes('action="/app/firma/vypoved/spat"'))
res = await acc.get('/ucto')
check("the accountant's list says the client is leaving", /Končí/.test(await res.text()))
res = await anna.post('/app/firma/vypoved/spat', {})
const back2 = await db.prepare("SELECT notice_at, ends_on FROM companies WHERE id = 'co-a'").first()
check(
  'taken back, the contract runs on, and it stands in the messages',
  res.status === 303 &&
    back2?.notice_at === null &&
    back2.ends_on === null &&
    (await db.prepare("SELECT body FROM messages WHERE company_id = 'co-a' ORDER BY created_at DESC, rowid DESC LIMIT 1").first())?.body.includes('beriem späť'),
)

// A legacy version number is not proof of the accepted wording.
await db.prepare("UPDATE companies SET terms_version = '2026-10-13' WHERE id = 'co-a'").run()
// The contract inside the app: the archived release is clearly labelled.
res = await anna.get('/app/zmluva')
page = await res.text()
check(
  'the contract and its terms are in the app',
  res.status === 200 && page.includes('Obchodné podmienky služby Firmony') && page.includes('id="bod-11-1"') && page.includes('Firma A s. r. o.') && page.includes('data-print') && page.includes('Archívne znenie'),
)

res = await anna.get('/app')
check('a company with its declaration, its power of attorney, its payments and documents is no longer shown its first steps', !(await res.text()).includes('Začíname'))
res = await acc.get('/ucto')
check("the accountant's list says it waits for her", (await res.text()).includes('Plná moc na overenie'))
res = await acc.get('/ucto/klienti/co-a')
page = await res.text()
check("her client's page has it with the button to mark it", page.includes(`/ucto/klienti/co-a/plna-moc/${poaRow?.id}/overit`) && page.includes('plnomocenstvo.asice'))
if (process.env.FIRMONY_CAPTURE_DIR) writeFileSync(`${process.env.FIRMONY_CAPTURE_DIR}/client-poa.html`, page)
res = await acc.get(`/ucto/klienti/co-a/plna-moc/${poaRow?.id}`)
check('and she opens it', res.status === 200)
{
  // A paper that is not the power of attorney goes back to the client, with why; never one that was checked.
  const wrong = await db.prepare("SELECT id FROM company_files WHERE company_id = 'co-a' AND kind = 'poa' AND file_name = 'plna moc podpisana.pdf'").first()
  res = await acc.post(`/ucto/klienti/co-a/plna-moc/${wrong?.id}/vratit`, { dovod: 'x' })
  check('returning needs a reason', res.status === 303 && (await db.prepare('SELECT deleted_at FROM company_files WHERE id = ?').bind(wrong?.id ?? '').first())?.deleted_at === null)
  res = await anna.post(`/ucto/klienti/co-a/plna-moc/${wrong?.id}/vratit`, { dovod: 'Je to iná firma' })
  check('a client returns nothing', res.status === 404)
  res = await acc.post(`/ucto/klienti/co-a/plna-moc/${wrong?.id}/vratit`, { dovod: 'Je to iná firma' })
  const back = await db.prepare("SELECT body FROM messages WHERE company_id = 'co-a' ORDER BY created_at DESC, rowid DESC LIMIT 1").first()
  check(
    'returned: out of the list, on record with why, and the client is told in the app what to upload',
    res.status === 303 && Boolean((await db.prepare('SELECT deleted_at FROM company_files WHERE id = ?').bind(wrong?.id ?? '').first())?.deleted_at) &&
      Boolean(await db.prepare("SELECT id FROM events WHERE action = 'poa.returned' AND subject = ?").bind(wrong?.id ?? '').first()) &&
      back?.body.replace(/\u00a0/g, ' ').includes('Plnú moc „plna moc podpisana.pdf“ sme Vám vrátili: Je to iná firma. Nahrajte') &&
      !(await (await anna.get('/app/plna-moc')).text()).includes('plna moc podpisana.pdf'),
  )
}
res = await admin.post(`/ucto/klienti/co-b/plna-moc/${poaRow?.id}/overit`, {})
check(
  'a paper is checked only under its own company',
  res.status === 404 &&
    (
      await db
        .prepare('SELECT checked_at FROM company_files WHERE id = ?')
        .bind(poaRow?.id ?? '')
        .first()
    )?.checked_at === null,
)
res = await acc.post(`/ucto/klienti/co-a/plna-moc/${poaRow?.id}/overit`, {})
const poaChecked = await db
  .prepare('SELECT checked_at, checked_by FROM company_files WHERE id = ?')
  .bind(poaRow?.id ?? '')
  .first()
check(
  'the accountant marks it checked and filed, on record',
  res.status === 303 && poaChecked?.checked_by === lucia?.id && (await db.prepare("SELECT COUNT(*) AS n FROM events WHERE action = 'poa.checked'").first())?.n === 1,
)
res = await acc.post(`/ucto/klienti/co-a/plna-moc/${poaRow?.id}/overit`, {})
check('twice is once', (await db.prepare("SELECT COUNT(*) AS n FROM events WHERE action = 'poa.checked'").first())?.n === 1)
res = await acc.post(`/ucto/klienti/co-a/plna-moc/${poaRow?.id}/vratit`, { dovod: 'Omylom vrátená' })
check('a checked power of attorney is never returned', (await db.prepare('SELECT deleted_at FROM company_files WHERE id = ?').bind(poaRow?.id ?? '').first())?.deleted_at === null)
res = await anna.get('/app/firma')
page = await res.text()
check("the client sees it on the company's page, with the notice for the former accountant", page.includes('Máme ju') && page.includes('href="/app/prechod"'))

// The notice to the former accountant, filled in from what was typed
res = await anna.get(`/app/prechod?komu=${encodeURIComponent('Účtovníctvo Nová s. r. o.')}&od=${encodeURIComponent('1. 3. 2025')}&do=${encodeURIComponent('31. 12. 2026')}`)
page = (await res.text()).replace(/\u00a0/g, ' ')
check(
  "the notice is the company's, to whom it was typed, with the days in words",
  res.status === 200 &&
    page.includes('Firma A s. r. o.') &&
    page.includes('Účtovníctvo Nová s. r. o.') &&
    page.includes('zo dňa 1. marca 2025') &&
    page.includes('ku dňu 31. decembra 2026') &&
    page.includes('odvolávame plnomocenstvo'),
)
res = await anna.get(`/app/prechod?od=${encodeURIComponent('32. 1. 2025')}`)
check('a day that does not exist is said so', res.status === 422 && (await res.text()).includes(`v${NB}tvare`))

// The letter goes out, and what the former accountant hands over comes in here, all of an upload or none of it
res = await anna.post('/app/prechod/odoslane', {})
await anna.post('/app/prechod/odoslane', {})
check(
  'the client says the letter went out, once',
  res.status === 303 && res.headers.get('location') === '/app/prechod?ok=odoslane' &&
    (await db.prepare("SELECT COUNT(*) AS n FROM events WHERE action = 'switching.sent' AND company_id = 'co-a'").first())?.n === 1,
)
const takeoverCsv = { name: 'saldokonto 2026.csv', type: 'text/csv', bytes: new TextEncoder().encode('Doklad;Suma\nFA-1;120,00\n') }
const takeoverPdf = { name: 'súvaha.pdf', type: 'application/pdf', bytes: new TextEncoder().encode('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n') }
const notBooks = { name: 'program.exe', type: 'application/octet-stream', bytes: new Uint8Array([0x4d, 0x5a, 0, 0, 0x90, 0, 3, 0]) }
res = await anna.uploads('/app/prechod/podklady', [takeoverCsv, notBooks])
check(
  'one file that cannot be taken keeps the whole upload back',
  res.status === 422 && (await db.prepare("SELECT COUNT(*) AS n FROM company_files WHERE company_id = 'co-a' AND kind = 'takeover'").first())?.n === 0,
)
const beforeTakeover = (await sent()).length
res = await anna.uploads('/app/prechod/podklady', [takeoverCsv, takeoverPdf])
await settle()
const takeoverRows = (await db.prepare("SELECT id, file_name FROM company_files WHERE company_id = 'co-a' AND kind = 'takeover' ORDER BY file_name").all()).results
const takeoverBells = (await sent()).slice(beforeTakeover).filter((m) => m.subject === 'Firmony: podklady od doterajšej účtovníčky')
check(
  'the books handed over come in together, and the accountant is rung once, with nothing of them in the email',
  res.status === 303 && res.headers.get('location') === '/app/prechod?ok=podklady#podklady' && takeoverRows.length === 2 &&
    takeoverBells.length === 1 && takeoverBells[0].to === 'lucia@firmony.test' && takeoverBells[0].text.includes('/ucto/klienti/co-a#prevzatie') && !takeoverBells[0].text.includes('saldokonto'),
  JSON.stringify(takeoverRows),
)
res = await anna.get('/app/prechod')
page = await res.text()
check('the client sees what it sent', takeoverRows.every((r) => page.includes(`/app/prechod/podklady/${r.id}`)))
if (process.env.FIRMONY_CAPTURE_DIR) writeFileSync(`${process.env.FIRMONY_CAPTURE_DIR}/switch.html`, page)
res = await anna.get(`/app/prechod/podklady/${takeoverRows[0]?.id}`)
check('and can download it again', res.status === 200 && (res.headers.get('content-disposition') ?? '').startsWith('attachment'))
res = await acc.get(`/ucto/klienti/co-a/prevzatie/${takeoverRows[0]?.id}`)
check('the accountant takes it over on the client page', res.status === 200 && (await res.text()).includes('FA-1;120,00'))
res = await acc.get('/ucto/klienti/co-a')
check('where it stands under its own heading', (await res.text()).includes('id="prevzatie"'))

// Reminders: on Monday at nine, and on the 5th before the deadline; never to somebody who turned them off
/** The moment in Bratislava of a day at 9:05, in milliseconds. */
function nineFive(day) {
  for (const utc of [6, 7, 8, 9]) {
    const ms = Date.parse(`${day}T${String(utc).padStart(2, '0')}:05:00Z`)
    const hour = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Bratislava', hour: '2-digit', hourCycle: 'h23' }).format(new Date(ms))
    if (hour === '09') return ms
  }
  throw new Error("no nine o'clock")
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
check(
  'on Monday at nine the people of a company with missing documents are rung',
  weekly.some((m) => m.to === 'anna@firma-a.test' && m.text.includes('/app/platby') && m.text.includes('/app/firma#pripomienky') && !m.text.includes('Cerpacia') && !m.text.includes('64,18')) &&
    weekly.some((m) => m.to === 'boris@firma-b.test'),
  weekly.map((m) => m.to).join(' '),
)
check('once for a person, whatever number of companies of hers miss documents', weekly.filter((m) => m.to === 'anna@firma-a.test').length === 1)
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
check(
  "on the 5th the deadline for a month's documents is reminded",
  monthly.some((m) => m.to === 'boris@firma-b.test' && m.subject.includes('do 10.')),
  monthly.map((m) => `${m.to}: ${m.subject}`).join(' | '),
)
check('never to somebody who turned reminders off', !monthly.some((m) => m.to === 'anna@firma-a.test'))

// Invoices: issued in a minute, numbered in a row, sent, paid by themselves
const year = day(0).slice(0, 4)
res = await anna.get('/app/faktury')
check('a company without invoices is shown how to start', res.status === 200 && (await res.text()).includes('Zatiaľ ste nevystavili žiadnu faktúru'))
res = await anna.get('/app/faktury/nova')
page = await res.text()
check("a new invoice starts from today and the company's account", page.includes(`value="${skDay(day(0))}"`) && page.includes('SK31 1200 0000 1987 4263 7541'))
res = await anna.post('/app/faktury', { akcia: 'register', ico: '57442452', meno: '', riadky: '3' })
page = await res.text()
check('the customer is filled in from the register', page.includes('value="europio s. r. o."') || page.includes('europio s.'), page.match(/name="meno"[^>]*/)?.[0])
res = await anna.post('/app/faktury', { akcia: 'vystavit', meno: 'europio s. r. o.', riadky: '3', vystavena: skDay(day(0)), dodana: skDay(day(0)), splatna: skDay(day(14)) })
check('an invoice without a line is not issued', res.status === 422 && (await res.text()).includes('aspoň jednu položku'))
const invoiceForm = (extra) => ({
  akcia: 'vystavit',
  ico: '57442452',
  meno: 'europio s. r. o.',
  adresa: 'Hlavná 1, 040 01 Košice',
  email: 'fakturacia@europio.test',
  vystavena: skDay(day(0)),
  dodana: skDay(day(0)),
  splatna: skDay(day(14)),
  iban: 'SK31 1200 0000 1987 4263 7541',
  riadky: '3',
  'r0-popis': 'Konzultácie',
  'r0-mnozstvo': '2',
  'r0-jednotka': 'hod',
  'r0-cena': '60,00',
  ...extra,
})
res = await anna.post('/app/faktury', invoiceForm({ 'r1-popis': 'Zlá', 'r1-cena': 'veľa' }))
check('a line that cannot be read is pointed at', res.status === 422 && /Riadok 2/.test(await res.text()))
res = await anna.post('/app/faktury', invoiceForm({}))
const firstId = res.headers.get('location')?.match(/\/app\/faktury\/([0-9a-f-]{36})/)?.[1]
const first = await db
  .prepare('SELECT number, seq, status, total_cents, vat_cents, document_id, token FROM invoices WHERE id = ?')
  .bind(firstId ?? '')
  .first()
check(
  'an invoice is issued with the first number of the year',
  res.status === 303 && first?.number === `${year}0001` && first.status === 'issued' && first.total_cents === 12000 && first.vat_cents === 0,
  JSON.stringify(first),
)
const invDoc = await db
  .prepare('SELECT kind, source, vs, total_cents, invoice_id FROM documents WHERE id = ?')
  .bind(first?.document_id ?? '')
  .first()
check(
  'and is a document of the company at once',
  invDoc?.kind === 'invoice_out' && invDoc.source === 'issued' && invDoc.vs === `${year}0001` && invDoc.total_cents === 12000 && invDoc.invoice_id === firstId,
)
res = await anna.get(`/app/faktury/${firstId}`)
page = await res.text()
check('its page is the invoice as paper', page.includes(`${year}0001`) && page.includes('europio s. r. o.') && /nie je platiteľom DPH/.test(page) && page.includes('120,00'))
res = await anna.get(`/app/faktury/${firstId}/xml`)
const ubl = await res.text()
check(
  'its e-invoice is UBL for Peppol',
  (res.headers.get('content-type') ?? '').startsWith('application/xml') &&
    ubl.includes(`<cbc:ID>${year}0001</cbc:ID>`) &&
    ubl.includes('<cbc:PayableAmount currencyID="EUR">120.00</cbc:PayableAmount>') &&
    ubl.includes('<cbc:ID>O</cbc:ID>') &&
    ubl.includes('billing:3.0'),
)
res = await get(`/f/${first?.token}`)
page = await res.text()
check('the customer opens it without signing in, and no search engine does', res.status === 200 && page.includes(`${year}0001`) && (res.headers.get('x-robots-tag') ?? '').includes('noindex'))
res = await get(`/f/${first?.token}/xml`)
check('and downloads its e-invoice', res.status === 200 && (await res.text()).includes(`<cbc:ID>${year}0001</cbc:ID>`))
res = await get(`/f/${'x'.repeat(43)}`)
check('a link nobody was given opens nothing', res.status === 404)
// Sent by the client himself (26 October 2026): Firmony emails no customer. The PDF to download or share, an email of
// his own written for him, the customer's link to copy.
const before7 = (await sent()).length
res = await anna.post(`/app/faktury/${firstId}/poslat`, {})
await settle()
check('nothing is mailed to a customer: the old address answers nothing', res.status === 404 && !(await sent()).slice(before7).some((m) => m.to === 'fakturacia@europio.test'))
const invoiceRaw = await (await anna.get(`/app/faktury/${firstId}`)).text()
const invMailto = decodeURIComponent(/href="(mailto:[^"]+)"/.exec(invoiceRaw)?.[1]?.replace(/&amp;/g, '&') ?? '')
check(
  "the invoice offers its PDF first, sharing it from a phone, an email of the client's own and the customer's link to copy",
  invoiceRaw.indexOf(`href="/app/faktury/${firstId}/pdf"`) > 0 &&
    invoiceRaw.indexOf(`href="/app/faktury/${firstId}/pdf"`) < invoiceRaw.indexOf('mailto:') &&
    invoiceRaw.includes(`data-share="/app/faktury/${firstId}/pdf?zdielat=1"`) &&
    invoiceRaw.includes(`value="https://firmony.io/f/${first?.token}"`) &&
    invoiceRaw.includes(`data-copy="https://firmony.io/f/${first?.token}"`) &&
    !invoiceRaw.includes(`/app/faktury/${firstId}/poslat`) &&
    invMailto.startsWith('mailto:fakturacia@europio.test?subject=') &&
    invMailto.includes(`Faktúra ${year}0001 od `) &&
    invMailto.includes(`posielame Vám faktúru č. ${year}0001 na sumu 120,00 €`) &&
    invMailto.includes(`/f/${first?.token}`),
  invMailto,
)
res = await anna.get(`/app/faktury/${firstId}/pdf`)
let invPdf = Buffer.from(await res.arrayBuffer())
check(
  'its PDF downloads for a member: a valid file named by its number, kept by no cache, for no search engine',
  res.status === 200 &&
    res.headers.get('content-type') === 'application/pdf' &&
    res.headers.get('content-disposition') === `attachment; filename="Faktura-${year}0001.pdf"; filename*=UTF-8''Faktura-${year}0001.pdf` &&
    (res.headers.get('cache-control') ?? '').includes('no-store') &&
    (res.headers.get('x-robots-tag') ?? '').includes('noindex') &&
    res.headers.get('x-content-type-options') === 'nosniff' &&
    invPdf.subarray(0, 9).toString('latin1') === '%PDF-1.4\n' &&
    invPdf.subarray(-6).toString('latin1') === '%%EOF\n' &&
    invPdf.toString('latin1').includes(`(${year}0001)`) &&
    invPdf.toString('latin1').includes('/PayBySquare BMC'),
  JSON.stringify([res.status, res.headers.get('content-disposition'), res.headers.get('cache-control'), res.headers.get('x-robots-tag')]),
)
res = await anna.get(`/app/faktury/${firstId}/pdf?nahlad=1`)
check('and opens in the browser to look at', res.status === 200 && (res.headers.get('content-disposition') ?? '').startsWith('inline;'))
await anna.get(`/app/faktury/${firstId}/pdf`)
await anna.get(`/app/faktury/${firstId}/pdf?zdielat=1`)
check(
  'a download is recorded once a minute at most, looking at it and the phone fetching it ahead not at all',
  (await db.prepare("SELECT COUNT(*) AS n FROM events WHERE action = 'invoice.pdf' AND subject = ?").bind(firstId ?? '').first())?.n === 1,
)
res = await get(`/f/${first?.token}/pdf`)
invPdf = Buffer.from(await res.arrayBuffer())
check(
  'the customer downloads the same PDF from the link, without signing in and for no search engine',
  res.status === 200 && res.headers.get('content-type') === 'application/pdf' && (res.headers.get('x-robots-tag') ?? '').includes('noindex') && invPdf.toString('latin1').includes(`(${year}0001)`),
)
res = await get(`/f/${first?.token}`)
page = await res.text()
check("the customer's page offers the PDF first", page.includes(`href="/f/${first?.token}/pdf"`) && page.indexOf(`/f/${first?.token}/pdf`) < page.indexOf(`/f/${first?.token}/xml`))
check('a stranger gets no PDF of the app, and a link nobody was given none', (await get(`/app/faktury/${firstId}/pdf`)).status === 303 && (await get(`/f/${'x'.repeat(43)}/pdf`)).status === 404)
res = await peter.get(`/app/faktury/${firstId}`)
check('another company never sees it, nor its PDF', res.status === 404 && (await peter.get(`/app/faktury/${firstId}/pdf`)).status === 404)
// Paid by itself: the money is on the account with the invoice's number as its symbol
await db
  .prepare("INSERT INTO payments (id, company_id, account_id, created_at, booked_on, amount_cents, party, vs, ref) VALUES ('pa-inv', 'co-a', 'acc-a', ?, ?, 5000, 'europio s. r. o.', ?, 'inv-2')")
  .bind(nowS, day(0), `${year}0002`)
  .run()
res = await anna.post('/app/faktury', invoiceForm({ 'r0-popis': 'Zálohová konzultácia', 'r0-mnozstvo': '1', 'r0-cena': '50' }))
const secondId = res.headers.get('location')?.match(/\/app\/faktury\/([0-9a-f-]{36})/)?.[1]
await settle(500)
check(
  'the next invoice takes the next number',
  (
    await db
      .prepare('SELECT number FROM invoices WHERE id = ?')
      .bind(secondId ?? '')
      .first()
  )?.number === `${year}0002`,
)
res = await anna.get(`/app/faktury/${secondId}`)
check(
  'and is paid by itself when its money is on the account',
  /Zaplatená/.test(await res.text()) && (await db.prepare("SELECT COUNT(*) AS n FROM links WHERE payment_id = 'pa-inv'").first())?.n === 1,
)
// A draft: no number, changed, thrown away
res = await anna.post('/app/faktury', { akcia: 'koncept', meno: 'Budúci odberateľ', riadky: '3' })
const draftId = res.headers.get('location')?.match(/\/app\/faktury\/([0-9a-f-]{36})/)?.[1]
check(
  'a draft has no number',
  res.status === 303 &&
    (
      await db
        .prepare('SELECT number, status FROM invoices WHERE id = ?')
        .bind(draftId ?? '')
        .first()
    )?.status === 'draft',
)
res = await anna.get('/app/faktury')
page = await res.text()
check('the list shows what is paid, what waits and the draft', page.includes('Koncept') && /Zaplatená/.test(page) && page.includes('Budúci odberateľ'))
res = await anna.post(`/app/faktury/${draftId}`, { akcia: 'zahodit' })
check(
  'a draft is thrown away',
  res.status === 303 &&
    (
      await db
        .prepare('SELECT COUNT(*) AS n FROM invoices WHERE id = ?')
        .bind(draftId ?? '')
        .first()
    )?.n === 0,
)
res = await anna.post(`/app/faktury/${firstId}`, { akcia: 'zahodit' })
check(
  'an issued invoice never is',
  (
    await db
      .prepare('SELECT COUNT(*) AS n FROM invoices WHERE id = ?')
      .bind(firstId ?? '')
      .first()
  )?.n === 1,
)
res = await acc.get(`/ucto/doklady/${first?.document_id}`)
check('the accountant books it with the invoice beside the form', res.status === 200 && (await res.text()).includes('sheet__kind'))
// A draft is issued under its own id, takes the next number, and is never changed after; its link opens nothing before
res = await anna.post('/app/faktury', invoiceForm({ akcia: 'koncept' }))
const laterId = res.headers.get('location')?.match(/\/app\/faktury\/([0-9a-f-]{36})/)?.[1]
const draftToken = (
  await db
    .prepare('SELECT token FROM invoices WHERE id = ?')
    .bind(laterId ?? '')
    .first()
)?.token
res = await get(`/f/${draftToken}`)
check("a draft's link opens nothing, nor its PDF, and a draft has no PDF in the app", res.status === 404 && (await get(`/f/${draftToken}/pdf`)).status === 404 && (await anna.get(`/app/faktury/${laterId}/pdf`)).status === 404)
res = await anna.post(`/app/faktury/${laterId}`, invoiceForm({}))
const issuedDraft = await db
  .prepare('SELECT number, status, customer_name FROM invoices WHERE id = ?')
  .bind(laterId ?? '')
  .first()
check('a draft is issued under its own id with the next number', res.status === 303 && issuedDraft?.status === 'issued' && issuedDraft.number === `${year}0003`, JSON.stringify(issuedDraft))
res = await anna.post(`/app/faktury/${laterId}`, invoiceForm({ meno: 'Iný odberateľ' }))
check(
  'and is never changed after',
  res.status === 303 &&
    (
      await db
        .prepare('SELECT customer_name FROM invoices WHERE id = ?')
        .bind(laterId ?? '')
        .first()
    )?.customer_name === 'europio s. r. o.',
)
// The QR code a bank pays from: on an invoice that waits, not on one that is paid
check("the client's email says the invoice carries a QR code for the bank", invMailto.includes('QR kód'))
res = await get(`/f/${first?.token}`)
page = await res.text()
check("the customer's page carries the QR code a bank pays from", page.includes('class="sheet__qr"') && /<path fill="#000000" d="M4 4h7/.test(page))
const paidToken = (
  await db
    .prepare('SELECT token FROM invoices WHERE id = ?')
    .bind(secondId ?? '')
    .first()
)?.token
res = await get(`/f/${paidToken}`)
page = await res.text()
check('a paid invoice says so to its customer, without a QR code to pay it twice', page.includes('Faktúra je zaplatená') && !page.includes('sheet__qr'))
const paidRaw = await (await anna.get(`/app/faktury/${secondId}`)).text()
check(
  'a paid invoice is never reminded, and its email asks for no payment',
  !paidRaw.includes('Pripomenúť platbu') && !decodeURIComponent(/href="(mailto:[^"]+)"/.exec(paidRaw)?.[1]?.replace(/&amp;/g, '&') ?? '').includes('Úhrada prevodom'),
)
// Another invoice like an earlier one, and the customers of earlier invoices
res = await anna.get(`/app/faktury/nova?podla=${firstId}`)
page = await res.text()
check(
  '"Vystaviť podobnú" starts from the customer and the lines of an earlier invoice, dated today',
  page.includes('value="Konzultácie"') && page.includes('value="fakturacia@europio.test"') && page.includes(`value="${skDay(day(0))}"`),
)
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
check(
  'every company numbers its own invoices from one',
  res.status === 303 &&
    (
      await db
        .prepare('SELECT number FROM invoices WHERE id = ?')
        .bind(peterId ?? '')
        .first()
    )?.number === `${year}0001`,
)
// Issued without the customer's email: the email is written for the address the client types in his own program.
res = await peter.get(`/app/faktury/${peterId}`)
page = await res.text()
check("an invoice without the customer's email asks for none: its email opens without an address", !page.includes('name="email"') && page.includes('href="mailto:?subject='))
const before9 = (await sent()).length
res = await peter.post(`/app/faktury/${peterId}/poslat`, { email: 'uctaren@europio.test' })
await settle()
check(
  'a typed email gets nothing and is not kept',
  res.status === 404 &&
    !(await sent()).slice(before9).some((m) => m.to === 'uctaren@europio.test') &&
    (
      await db
        .prepare('SELECT customer_email FROM invoices WHERE id = ?')
        .bind(peterId ?? '')
        .first()
    )?.customer_email === null,
)

// The bank by open banking: linked at the bank itself, read by itself, renewed, ended
await anna.post('/app/firma/prepnut', { firma: 'co-a' })
bankFeed.balance = '1234.56'
bankFeed.transactions = [
  // What the statement already brought (the café of yesterday): not brought twice.
  {
    entry_reference: 'eb-1',
    transaction_amount: { currency: 'EUR', amount: '12.40' },
    credit_debit_indicator: 'DBIT',
    status: 'BOOK',
    booking_date: day(-1),
    remittance_information: ['Platba kartou KAVIAREN NA ROHU KOSICE'],
    bank_transaction_code: { code: 'CCRD' },
  },
  // The money for the first invoice, with its number as the symbol.
  {
    entry_reference: 'eb-2',
    transaction_amount: { currency: 'EUR', amount: '120.00' },
    credit_debit_indicator: 'CRDT',
    status: 'BOOK',
    booking_date: day(0),
    debtor: { name: 'europio s. r. o.' },
    debtor_account: { iban: 'SK5202000000004712345670' },
    remittance_information: [`/VS${year}0001/SS/KS0308`],
  },
  {
    entry_reference: 'eb-3',
    transaction_amount: { currency: 'EUR', amount: '23.85' },
    credit_debit_indicator: 'DBIT',
    status: 'BOOK',
    booking_date: day(0),
    remittance_information: ['Nakup BILLA KOSICE'],
    merchant_category_code: '5411',
  },
  // Waiting at the bank: not ours yet.
  { entry_reference: 'eb-4', transaction_amount: { currency: 'EUR', amount: '80.00' }, credit_debit_indicator: 'DBIT', status: 'PDNG', booking_date: day(0), remittance_information: ['Rezervacia'] },
  // Two coffees of one price on one day stay two.
  {
    entry_reference: 'eb-5',
    transaction_amount: { currency: 'EUR', amount: '2.50' },
    credit_debit_indicator: 'DBIT',
    status: 'BOOK',
    booking_date: day(0),
    remittance_information: ['Platba kartou AUTOMAT KAVA'],
    bank_transaction_code: { code: 'CCRD' },
  },
  {
    entry_reference: 'eb-6',
    transaction_amount: { currency: 'EUR', amount: '2.50' },
    credit_debit_indicator: 'DBIT',
    status: 'BOOK',
    booking_date: day(0),
    remittance_information: ['Platba kartou AUTOMAT KAVA'],
    bank_transaction_code: { code: 'CCRD' },
  },
]
// One of the two coffees of today came with a statement before the bank was linked.
await db
  .prepare("INSERT INTO payments (id, company_id, account_id, created_at, booked_on, amount_cents, party, card, ref) VALUES ('pa-kava', 'co-a', 'acc-a', ?, ?, -250, 'AUTOMAT KAVA', 1, 'a-kava')")
  .bind(nowS, day(0))
  .run()
res = await anna.get('/app/banka')
page = await res.text()
check('the bank page offers the banks of Slovakia', res.status === 200 && page.includes('Tatra banka') && page.includes('href="/app/banka/pripojit?banka=Tatra%20banka"'))
res = await mf.dispatchFetch(`${site}/app/banka/pripojit?banka=Tatra%20banka`, {
  redirect: 'manual',
  headers: { cookie: annaCookie, 'cf-connecting-ip': '203.0.113.30', 'sec-fetch-site': 'cross-site' },
})
check('another site cannot send a client off to the bank', res.status === 303 && res.headers.get('location') === '/app/banka')
res = await anna.get('/app/banka/pripojit?banka=Neexistujúca%20banka')
check('a bank that is none leads nowhere', res.status === 303 && res.headers.get('location') === '/app/banka')
// Cancelled at the bank
res = await anna.get('/app/banka/pripojit?banka=Tatra%20banka')
let toBank = new URL(res.headers.get('location') ?? 'https://x.test')
let fromBankPage = new URL(toBank.searchParams.get('spat') ?? 'https://x.test')
res = await anna.get(`/app/banka/navrat?error=access_denied&state=${fromBankPage.searchParams.get('state')}`)
check(
  'cancelled at the bank, nothing is linked and nothing waits',
  res.headers.get('location') === '/app/banka?chyba=zrusene' && (await db.prepare("SELECT COUNT(*) AS n FROM bank_links WHERE company_id = 'co-a'").first())?.n === 0,
)
// Linked
res = await anna.get('/app/banka/pripojit?banka=Tatra%20banka')
toBank = new URL(res.headers.get('location') ?? 'https://x.test')
fromBankPage = new URL(toBank.searchParams.get('spat') ?? 'https://x.test')
check(
  'a bank is linked at the bank itself, and comes back to us',
  res.status === 302 &&
    toBank.origin === 'https://pretend-bank.test' &&
    fromBankPage.origin === site &&
    fromBankPage.pathname === '/app/banka/navrat' &&
    /^[A-Za-z0-9_-]{43}$/.test(fromBankPage.searchParams.get('state') ?? ''),
)
check(
  'Enable Banking was asked with a token signed by our key',
  bank.calls.some((c) => c.method === 'POST' && c.path === '/auth'),
)
res = await peter.get(`${fromBankPage.pathname}${fromBankPage.search}`)
check("nobody else can finish another person's link", res.headers.get('location') === '/app/banka?chyba=neplatne')
res = await anna.get(`${fromBankPage.pathname}${fromBankPage.search}`)
await settle(1200)
check(
  "back from the bank, its accounts are the company's, the card without an IBAN is not",
  res.status === 303 && res.headers.get('location') === '/app/banka?ok=banka-pripojena&n=2',
  res.headers.get('location'),
)
const bankLink = await db.prepare("SELECT id, status, valid_until, synced_at FROM bank_links WHERE company_id = 'co-a' AND status = 'active'").first()
check('the consent holds for 180 days', Boolean(bankLink) && bankLink.valid_until > nowS + 179 * 86400 && bankLink.valid_until < nowS + 181 * 86400)
res = await anna.get(`${fromBankPage.pathname}${fromBankPage.search}`)
check(
  'the same answer from the bank links nothing twice',
  res.headers.get('location') === '/app/banka?chyba=neplatne' && (await db.prepare("SELECT COUNT(*) AS n FROM bank_links WHERE company_id = 'co-a'").first())?.n === 1,
)
const fromBank = (await db.prepare("SELECT ref FROM payments WHERE company_id = 'co-a' AND source = 'bank' ORDER BY ref").all()).results.map((r) => r.ref)
check(
  'the payments are read at once: what is booked, and nothing a statement already brought',
  JSON.stringify(fromBank) === JSON.stringify(['eb-2', 'eb-3', 'eb-6', 'personal-1']),
  JSON.stringify(fromBank),
)
const paidFirst = await db
  .prepare('SELECT p.vs FROM links l JOIN payments p ON p.id = l.payment_id JOIN invoices i ON i.document_id = l.document_id WHERE i.id = ?')
  .bind(firstId ?? '')
  .first()
check('the money for an invoice marks it paid by itself', paidFirst?.vs === `${year}0001`)
check("the balance is the bank's", (await db.prepare("SELECT balance_cents FROM accounts WHERE id = 'acc-a'").first())?.balance_cents === 123456)
res = await anna.get('/app/platby')
page = await res.text()
check('the payments page says the bank is linked', page.includes('Tatra banka je prepojená') && page.includes('Naposledy načítané'))
res = await acc.get('/ucto/klienti/co-a')
check("the accountant sees that the client's bank is linked and read", /Tatra banka prepojená, načítané dnes/.test(await res.text()))
// Read now, while the client is there: nothing twice, whatever order the bank gives them in, and the bank is told
// a person is present
bankFeed.transactions.reverse()
const callsBefore = bank.calls.length
res = await anna.post(`/app/banka/${bankLink?.id}/nacitat`, {})
check('read now: nothing twice', res.headers.get('location') === '/app/banka?ok=banka-nic', res.headers.get('location'))
check(
  'and the bank is told who is at the screen, so it does not count among its four',
  bank.calls
    .slice(callsBefore)
    .filter((c) => c.path.startsWith('/accounts/'))
    .every((c) => c.present === '203.0.113.30'),
)
const afterRead = bank.calls.length
res = await peter.post(`/app/banka/${bankLink?.id}/nacitat`, {})
check('another company cannot read it', res.headers.get('location') === '/app/banka' && bank.calls.length === afterRead)
// An account that is not the company's
const personal = await db.prepare("SELECT id FROM accounts WHERE company_id = 'co-a' AND iban = 'SK7311000000002934567890'").first()
res = await anna.post(`/app/banka/ucet/${personal?.id}/odobrat`, {})
check(
  "an account that is not the company's goes, with what the bank brought for it",
  res.headers.get('location') === '/app/banka?ok=ucet-odobraty' &&
    (await db.prepare("SELECT COUNT(*) AS n FROM payments WHERE ref = 'personal-1'").first())?.n === 0 &&
    (
      await db
        .prepare('SELECT COUNT(*) AS n FROM accounts WHERE id = ?')
        .bind(personal?.id ?? '')
        .first()
    )?.n === 0,
)
// One whose payments the accountant has already worked on stays in the books: it is read no more, and she is told.
await db.batch([
  db.prepare("INSERT INTO accounts (id, company_id, iban, link_id, remote_id) VALUES ('acc-worked', 'co-a', 'SK5911000000002912345678', ?, 'remote-worked')").bind(bankLink?.id),
  db.prepare("INSERT INTO payments (id, company_id, account_id, created_at, booked_on, amount_cents, ref, source, contra) VALUES ('pay-worked', 'co-a', 'acc-worked', ?, ?, -1500, 'worked-1', 'bank', '548')").bind(nowS, day(-2)),
])
const messagesBefore = (await db.prepare("SELECT COUNT(*) AS n FROM messages WHERE company_id = 'co-a' AND side = 'client'").first())?.n
res = await anna.post('/app/banka/ucet/acc-worked/odobrat', {})
check(
  'an account whose payments the books already hold is read no more, its payments stay and the accountant is asked',
  res.headers.get('location') === '/app/banka?ok=ucet-ponechany' &&
    (await db.prepare("SELECT COUNT(*) AS n FROM payments WHERE id = 'pay-worked'").first())?.n === 1 &&
    (await db.prepare("SELECT link_id FROM accounts WHERE id = 'acc-worked'").first())?.link_id === null &&
    (await db.prepare("SELECT COUNT(*) AS n FROM messages WHERE company_id = 'co-a' AND side = 'client'").first())?.n === messagesBefore + 1,
)
await db.batch([db.prepare("DELETE FROM payments WHERE id = 'pay-worked'"), db.prepare("DELETE FROM accounts WHERE id = 'acc-worked'")])
// The schedule reads a consent every six hours, never more often
let callsNow = bank.calls.length
await tick(Date.now())
await settle(500)
check('the schedule does not read a consent read a moment ago', bank.calls.length === callsNow)
await db
  .prepare('UPDATE bank_links SET tried_at = ? WHERE id = ?')
  .bind(nowS - 7 * 3600, bankLink?.id ?? '')
  .run()
bankFeed.transactions.push({
  entry_reference: 'eb-7',
  transaction_amount: { currency: 'EUR', amount: '15.00' },
  credit_debit_indicator: 'DBIT',
  status: 'BOOK',
  booking_date: day(0),
  creditor: { name: 'Papiernictvo Pero' },
  remittance_information: ['Kancelarske potreby'],
})
await tick(Date.now())
await settle(800)
check('six hours later it reads it, and what is new arrives', bank.calls.length > callsNow && (await db.prepare("SELECT COUNT(*) AS n FROM payments WHERE ref = 'eb-7'").first())?.n === 1)
// The renewal is asked for ten days before the consent ends
await db
  .prepare('UPDATE bank_links SET valid_until = ? WHERE id = ?')
  .bind(nowS + 5 * 86400, bankLink?.id ?? '')
  .run()
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
await db
  .prepare('UPDATE bank_links SET tried_at = ? WHERE id = ?')
  .bind(nowS - 7 * 3600, bankLink?.id ?? '')
  .run()
await tick(Date.now())
await settle(500)
check(
  'a consent the bank says is over is marked so',
  (
    await db
      .prepare('SELECT status FROM bank_links WHERE id = ?')
      .bind(bankLink?.id ?? '')
      .first()
  )?.status === 'expired',
)
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
check(
  'a first read that failed is tried again within a quarter of an hour',
  renewed?.error?.startsWith('503') && renewed.synced_at === null && renewed.tried_at <= Math.floor(Date.now() / 1000) - 6 * 3600 + 900 && renewed.tried_at > Math.floor(Date.now() / 1000) - 6 * 3600,
  JSON.stringify(renewed),
)
check(
  'renewed, the account is read under the new consent',
  Boolean(renewed) && renewed.id !== bankLink?.id && (await db.prepare("SELECT link_id FROM accounts WHERE id = 'acc-a'").first())?.link_id === renewed.id,
)
res = await anna.get('/app/banka')
check('and the ended one is not shown any more', !(await res.text()).includes('Prístup vypršal'))
// Unlinked: closed at the bank, the payments stay
const paymentsBefore = (await db.prepare("SELECT COUNT(*) AS n FROM payments WHERE company_id = 'co-a'").first())?.n
res = await anna.post(`/app/banka/${renewed?.id}/odpojit`, {})
check(
  'unlinked, the consent is closed at the bank and its payments stay',
  res.headers.get('location') === '/app/banka?ok=banka-odpojena' &&
    (
      await db
        .prepare('SELECT status FROM bank_links WHERE id = ?')
        .bind(renewed?.id ?? '')
        .first()
    )?.status === 'revoked' &&
    bank.calls.at(-1)?.method === 'DELETE' &&
    (await db.prepare("SELECT COUNT(*) AS n FROM payments WHERE company_id = 'co-a'").first())?.n === paymentsBefore &&
    (await db.prepare("SELECT link_id FROM accounts WHERE id = 'acc-a'").first())?.link_id === null,
)

// ---------------------------------------------------------------------------------------------------------------
// The bank without an aggregator (14 October 2026): the steps for each bank, statements the bank sends by email
// (taken when they follow the last one, held for the accountant when they do not, an account the company does not
// have waiting for the owner's yes), a statement added on a page, the month whose statement is due, Fio's token
// ---------------------------------------------------------------------------------------------------------------
{
  await db.batch([
    db
      .prepare("INSERT INTO companies (id, created_at, name, ico, vat_payer, plan, inbox, accountant_id) VALUES ('co-s', ?, 'Firma S s. r. o.', '22222222', 0, 'start', 'ssss33', ?)")
      .bind(nowS, lucia?.id ?? null),
    db.prepare("INSERT INTO users (id, created_at, email, name) VALUES ('u-s', ?, 'simona@firma-s.test', 'Simona Sivá'), ('u-s2', ?, 'stano@firma-s.test', 'Stano Sivý')").bind(nowS, nowS),
    db.prepare("INSERT INTO members (company_id, user_id, role, created_at) VALUES ('co-s', 'u-s', 'owner', ?), ('co-s', 'u-s2', 'member', ?)").bind(nowS, nowS),
  ])
  const simonaCookie = (await signIn('simona@firma-s.test')).cookie
  const simona = as(simonaCookie)
  const stano = as((await signIn('stano@firma-s.test')).cookie)
  const inboxS = 'doklady-ssss33@firmony.io'
  const ibanS = 'SK4009000000005198123456'
  const bankMail = async (xml, from = 'vypisy@banka.test') => {
    const r = await mf.dispatchFetch(`http://localhost/cdn-cgi/local/email?from=${encodeURIComponent(from)}&to=${encodeURIComponent(inboxS)}`, {
      method: 'POST',
      body: statementMail({ to: inboxS, from, xml }),
    })
    await r.arrayBuffer()
    await settle(500)
    return r
  }
  const statementsS = async () =>
    (await db.prepare("SELECT id, iban, source, status, entries, added, known, reason, file_key, account_id FROM statements WHERE company_id = 'co-s' ORDER BY created_at, rowid").all()).results
  // A day of the month before last: older than the statement every account has to have by now.
  const monthEarlier = (() => {
    const d = new Date(`${day(0).slice(0, 7)}-10T12:00:00Z`)
    d.setUTCMonth(d.getUTCMonth() - 2)
    return d.toISOString().slice(0, 10)
  })()
  const paymentsS = async () => (await db.prepare("SELECT COUNT(*) AS n FROM payments WHERE company_id = 'co-s'").first())?.n
  const dayS = (n) => day(n)

  // The steps for each bank
  res = await simona.get('/app/banka')
  page = await res.text()
  check(
    'without a bank the page lists the banks, each with the way its payments come',
    res.status === 200 && page.includes('href="/app/banka?banka=slsp#postup-banka"') && page.includes('href="/app/banka?banka=fio#postup-banka"') && page.includes('Raz za mesiac'),
  )
  res = await simona.get('/app/banka?banka=slsp')
  page = await res.text()
  check(
    "a bank that sends statements by itself: its steps, the company's address, and the one click that finishes it",
    page.includes('id="postup-banka"') && page.includes('SEPA XML') && page.includes(inboxS) && page.includes('action="/app/banka/nastavene"') && page.includes('name="banka" value="slsp"'),
  )
  res = await simona.get('/app/banka?banka=tatra')
  page = await res.text()
  check(
    'a bank that sends none: once a month, with the upload that remembers the bank',
    page.includes('Výpis do účtovníctva') && page.includes('id="pridat"') && page.includes('name="banka" value="tatra"') && !page.includes('action="/app/banka/nastavene"'),
  )
  res = await simona.get('/app/banka?banka=fio')
  page = await res.text()
  check('Fio: the steps to its token and the form for it', page.includes('Sledovanie účtu') && page.includes('action="/app/banka/fio"') && page.includes('name="token"'))
  res = await simona.post('/app/banka/nastavene', { banka: 'tatra' })
  check('a bank that sends nothing by itself cannot be set as sending', res.headers.get('location') === '/app/banka#postup')
  res = await simona.post('/app/banka/nastavene', { banka: 'slsp' })
  check(
    'the owner says it is set at the bank',
    res.headers.get('location') === '/app/banka?banka=slsp&ok=nastavene#postup-banka' &&
      JSON.parse((await db.prepare("SELECT bank_setup FROM companies WHERE id = 'co-s'").first())?.bank_setup ?? '{}').bank === 'slsp',
  )
  res = await simona.get('/app/banka')
  page = await res.text()
  check('the page opens on that bank, waiting for its first statement', page.includes('id="postup-banka"') && page.includes('Čakáme na prvý výpis') && page.includes('Iná banka'))

  // The first statement by email: an account the company does not have yet waits for the owner
  const first = camtXml({
    iban: ibanS,
    from: dayS(-3),
    to: dayS(-3),
    opening: 100000,
    entries: [
      { ref: 'S1', day: dayS(-3), cents: -1890, party: 'PAPIERNICTVO PERO', card: true },
      { ref: 'S2', day: dayS(-3), cents: 50000, party: 'Odberateľ s. r. o.', iban: 'SK9811000000002987654321', vs: '77001' },
    ],
  })
  const ringsBefore = (await sent()).length
  res = await bankMail(first)
  let rows = await statementsS()
  check(
    'a statement of an account the company does not have is kept, and nothing of it touches the books',
    res.status === 200 && rows.length === 1 && rows[0].status === 'confirm' && rows[0].source === 'email' && rows[0].account_id === null && (await paymentsS()) === 0,
    JSON.stringify(rows),
  )
  check('the inbox record says a statement came', (await db.prepare("SELECT status FROM inbound_mail WHERE company_id = 'co-s' ORDER BY received_at DESC LIMIT 1").first())?.status === 'statement')
  let rung = (await sent()).slice(ringsBefore)
  check(
    'the owner is rung at once, with nothing of the statement in the email',
    rung.some(
      (m) => m.to === 'simona@firma-s.test' && m.subject === 'Firmony: potvrďte účet z výpisu' && m.text.includes('/app/banka#vypisy') && !m.text.includes('0900') && !m.text.includes('5198'),
    ) && !rung.some((m) => m.to === 'stano@firma-s.test'),
    rung.map((m) => `${m.to}: ${m.subject}`).join(' | '),
  )
  res = await simona.get('/app')
  page = (await res.text()).replace(/\u00a0/g, ' ')
  check(
    'the overview asks the owner whether it is the account of the company',
    page.includes('Prišiel výpis z nového účtu') && page.includes('SK40 0900 0000 0051 9812 3456') && page.includes(`action="/app/vypisy/${rows[0].id}/ucet"`),
  )
  res = await stano.get('/app')
  page = (await res.text()).replace(/\u00a0/g, ' ')
  check('a member who is no owner sees it, without the answers', page.includes('Prišiel výpis z nového účtu') && !page.includes(`action="/app/vypisy/${rows[0].id}/ucet"`))
  res = await stano.post(`/app/vypisy/${rows[0].id}/ucet`, { ano: '1' })
  check('and cannot answer', res.status === 403 && (await statementsS())[0].status === 'confirm')
  res = await anna.post(`/app/vypisy/${rows[0].id}/ucet`, { ano: '1' })
  check('nobody of another company can answer for it', res.headers.get('location') === '/app/banka#vypisy' && (await statementsS())[0].status === 'confirm')
  res = await simona.post(`/app/vypisy/${rows[0].id}/ucet`, { ano: '1' })
  rows = await statementsS()
  const accountS = await db.prepare("SELECT id, balance_cents, balance_on FROM accounts WHERE company_id = 'co-s' AND iban = ?").bind(ibanS).first()
  check(
    "the owner's yes: the account is the company's, the statement is taken and its payments are there",
    res.headers.get('location') === '/app/banka?ok=ucet-pridany&n=1#vypisy' &&
      rows[0].status === 'taken' &&
      rows[0].added === 2 &&
      accountS?.balance_cents === 148110 &&
      accountS.balance_on === dayS(-3) &&
      (await paymentsS()) === 2,
    JSON.stringify({ rows, accountS }),
  )
  check('on record', (await db.prepare("SELECT COUNT(*) AS n FROM events WHERE company_id = 'co-s' AND action = 'statement.account.confirmed' AND user_id = 'u-s'").first())?.n === 1)

  // The next ones: one that follows is taken by itself; the same file again, or the same movements, are nothing new
  const second = camtXml({
    iban: ibanS,
    from: dayS(-2),
    to: dayS(-2),
    opening: 148110,
    number: '2',
    entries: [{ ref: 'S3', day: dayS(-2), cents: -12500, party: 'Nájom s. r. o.', iban: 'SK2283300000002801234567', vs: '1026' }],
  })
  res = await bankMail(second)
  rows = await statementsS()
  check(
    'a statement that opens with the last closing balance is taken without a question',
    rows.length === 2 &&
      rows[1].status === 'taken' &&
      rows[1].added === 1 &&
      (await paymentsS()) === 3 &&
      (await db.prepare('SELECT balance_cents FROM accounts WHERE id = ?').bind(accountS?.id).first())?.balance_cents === 135610,
    JSON.stringify(rows[1]),
  )
  res = await bankMail(second)
  check('the same file again is nothing', (await statementsS()).length === 2 && (await paymentsS()) === 3)
  const resent = camtXml({
    iban: ibanS,
    from: dayS(-2),
    to: dayS(-2),
    opening: 148110,
    number: '2b',
    entries: [{ ref: 'S3', day: dayS(-2), cents: -12500, party: 'Nájom s. r. o.', iban: 'SK2283300000002801234567', vs: '1026' }],
  })
  res = await bankMail(resent)
  rows = await statementsS()
  check('the same movements in another file are known, and nobody is asked', rows.length === 3 && rows[2].status === 'known' && (await paymentsS()) === 3)

  // One that does not follow waits for the accountant, and so does one whose figures do not add up
  const luciaRingsBefore = (await sent()).length
  const gapStatement = camtXml({
    iban: ibanS,
    from: dayS(-1),
    to: dayS(-1),
    opening: 120000,
    number: '4',
    entries: [{ ref: 'S5', day: dayS(-1), cents: -4500, party: 'ORANGE SLOVENSKO', card: true }],
  })
  res = await bankMail(gapStatement)
  const forgedStatement = camtXml({
    iban: ibanS,
    from: dayS(-1),
    to: dayS(-1),
    opening: 135610,
    closing: 999999,
    number: '5',
    entries: [{ ref: 'S6', day: dayS(-1), cents: -100, party: 'NIEKTO' }],
  })
  res = await bankMail(forgedStatement)
  rows = await statementsS()
  const gapRow = rows.find((r) => r.status === 'held' && JSON.parse(r.reason ?? '{}').kind === 'gap')
  const sumRow = rows.find((r) => r.status === 'held' && JSON.parse(r.reason ?? '{}').kind === 'sum')
  check('a statement that does not follow the last one is held, and nothing of it is booked', Boolean(gapRow) && Boolean(sumRow) && (await paymentsS()) === 3, JSON.stringify(rows))
  rung = (await sent()).slice(luciaRingsBefore)
  check(
    'the accountant is rung, with nothing of it in the email',
    rung.filter((m) => m.to === 'lucia@firmony.test' && m.subject === 'Firmony: výpis na kontrolu' && m.text.includes('/ucto/klienti/co-s#vypisy') && !/\d{3},\d{2}/.test(m.text)).length === 2,
    rung.map((m) => `${m.to}: ${m.subject}`).join(' | '),
  )
  res = await simona.get('/app/banka')
  page = await res.text()
  check('the client sees that it waits for the accountant', page.includes('Čaká na účtovníčku') && page.includes('Výpisy chodia samy'))
  res = await acc.get('/ucto/klienti/co-s')
  page = (await res.text()).replace(/ /g, ' ')
  check(
    'the accountant sees why each waits, in figures',
    page.includes('id="vypisy"') &&
      page.includes('Začína zostatkom 1 200,00 €, posledný výpis skončil zostatkom 1 356,10 €') &&
      page.includes('výpis uvádza konečný zostatok 9 999,99 €') &&
      page.includes(`action="/ucto/klienti/co-s/vypisy/${gapRow?.id}"`),
  )
  res = await anna.post(`/ucto/klienti/co-s/vypisy/${gapRow?.id}`, { akcia: 'prijat' })
  check('a client cannot decide it', res.status === 404 && (await db.prepare('SELECT status FROM statements WHERE id = ?').bind(gapRow?.id).first())?.status === 'held')
  res = await acc.post(`/ucto/klienti/co-s/vypisy/${sumRow?.id}`, { akcia: 'odmietnut' })
  check(
    'the accountant refuses the one whose figures do not add up: nothing of it is booked',
    res.status === 303 && (await db.prepare('SELECT status, decided_by FROM statements WHERE id = ?').bind(sumRow?.id).first())?.status === 'refused' && (await paymentsS()) === 3,
  )
  res = await acc.post(`/ucto/klienti/co-s/vypisy/${gapRow?.id}`, { akcia: 'prijat' })
  check(
    'and takes the other one: its payments are there',
    res.status === 303 && (await db.prepare('SELECT status, decided_by FROM statements WHERE id = ?').bind(gapRow?.id).first())?.decided_by === lucia?.id && (await paymentsS()) === 4,
  )
  check('both on record', (await db.prepare("SELECT COUNT(*) AS n FROM events WHERE company_id = 'co-s' AND action IN ('statement.accepted', 'statement.refused')").first())?.n === 2)

  // The owner's no for an account that is not the company's: nothing of it is kept in the books
  res = await bankMail(camtXml({ iban: 'SK0509000000005100223344', from: dayS(-1), to: dayS(-1), opening: 5000, entries: [{ ref: 'P1', day: dayS(-1), cents: -2000, party: 'LEKAREN' }] }))
  const personal = (await statementsS()).find((r) => r.iban === 'SK0509000000005100223344')
  res = await simona.post(`/app/vypisy/${personal?.id}/ucet`, { ano: '0' })
  check(
    "the owner's no: the statement is refused, no account, no payment",
    res.headers.get('location') === '/app/banka?ok=vypis-nezauctovany#vypisy' &&
      (await db.prepare('SELECT status FROM statements WHERE id = ?').bind(personal?.id).first())?.status === 'refused' &&
      (await db.prepare("SELECT COUNT(*) AS n FROM accounts WHERE iban = 'SK0509000000005100223344'").first())?.n === 0 &&
      (await paymentsS()) === 4,
  )

  // Its file, as it came, for the company's people and nobody else
  res = await simona.get(`/app/vypisy/${rows[0].id}/subor`)
  check('a statement downloads as it came', res.status === 200 && (res.headers.get('content-disposition') ?? '').startsWith('attachment') && (await res.text()) === first)
  res = await anna.get(`/app/vypisy/${rows[0].id}/subor`)
  check('not for another company', res.status === 404)

  // An account whose statements the bank sends is never asked for: a bank sends nothing on a day without a movement
  await db.prepare('UPDATE accounts SET balance_on = ? WHERE id = ?').bind(monthEarlier, accountS?.id).run()
  res = await simona.get('/app')
  check('statements the bank sends are not asked for, however long since the last', !(await res.text()).includes('class="stmtdue"'))

  // Added on a page by a member: trusted, a new account included
  const monthly = camtXml({ iban: 'SK2283300000002801234567', from: monthEarlier, to: monthEarlier, opening: 0, entries: [{ ref: 'M1', day: monthEarlier, cents: 30000, party: 'Vklad' }] })
  res = await stano.upload('/app/banka', { name: 'vypis.xml', type: 'application/xml', bytes: new TextEncoder().encode(monthly) })
  const uploaded = (await statementsS()).find((r) => r.iban === 'SK2283300000002801234567')
  check('a statement a member adds on the page is taken, a new account included', res.status === 303 && uploaded?.status === 'taken' && uploaded.source === 'upload' && (await paymentsS()) === 5)
  check('the bank the page was set to stays as it was', JSON.parse((await db.prepare("SELECT bank_setup FROM companies WHERE id = 'co-s'").first())?.bank_setup ?? '{}').bank === 'slsp')

  // The month whose statement is still to come: on the overview from the 1st, and a doorbell on the 3rd
  res = await simona.get('/app')
  page = await res.text()
  check('an account whose statement of last month is missing is asked for on the overview', page.includes('class="stmtdue"') && page.includes('href="/app/banka#pridat"'))
  const third = (() => {
    const d = new Date(`${day(0).slice(0, 7)}-03T12:00:00Z`)
    do d.setUTCMonth(d.getUTCMonth() + 1)
    while (d.getUTCDay() === 1)
    return d.toISOString().slice(0, 10)
  })()
  const dueBefore = (await sent()).length
  await tick(nineFive(`${third.slice(0, 8)}04`))
  await settle(300)
  check('nothing is asked for on another day', (await sent()).slice(dueBefore).filter((m) => m.subject.startsWith('Firmony: výpis z banky za')).length === 0)
  await tick(nineFive(third))
  await settle(500)
  const dueRings = (await sent()).slice(dueBefore).filter((m) => m.subject.startsWith('Firmony: výpis z banky za'))
  check(
    'on the 3rd at nine the people of the company are rung, once each',
    dueRings.filter((m) => m.to === 'simona@firma-s.test').length === 1 &&
      dueRings.filter((m) => m.to === 'stano@firma-s.test').length === 1 &&
      dueRings.every((m) => m.text.includes('/app/banka#pridat')),
    dueRings.map((m) => `${m.to}: ${m.subject}`).join(' | '),
  )
  await tick(nineFive(third) + 5 * 60 * 1000)
  await settle(300)
  check('and not twice', (await sent()).slice(dueBefore).filter((m) => m.subject.startsWith('Firmony: výpis z banky za')).length === dueRings.length)

  // Fio banka by the owner's token
  res = await simona.post('/app/banka/fio', { token: 'krátky' })
  check('what is no token of Fio is said so', res.status === 422 && (await res.text()).replace(/\u00a0/g, ' ').includes('Toto nevyzerá ako token z Fio banky'))
  res = await simona.post('/app/banka/fio', { token: 'x'.repeat(64) })
  check(
    'a token Fio does not take is said so, and not kept',
    res.status === 422 && (await res.text()).includes('Fio banka tento token neprijala') && (await db.prepare("SELECT COUNT(*) AS n FROM bank_links WHERE company_id = 'co-s'").first())?.n === 0,
  )
  // Fio not answering is said as that, not as "too soon"; the token stays and the schedule reads it.
  fio.fail(503)
  res = await simona.post('/app/banka/fio', { token: FIO_TOKEN })
  check(
    'Fio down: the owner is told it does not answer, and the token is kept',
    res.headers.get('location') === '/app/banka?ok=fio-neodpoveda' && (await db.prepare("SELECT COUNT(*) AS n FROM bank_links WHERE company_id = 'co-s' AND kind = 'fio' AND status = 'active'").first())?.n === 1 &&
      (await (await simona.get('/app/banka?ok=fio-neodpoveda')).text()).replace(/\u00a0/g, ' ').includes('Fio banka teraz neodpovedá'),
  )
  fio.fail(null)
  await db.batch([db.prepare("DELETE FROM bank_links WHERE company_id = 'co-s' AND kind = 'fio'"), db.prepare("DELETE FROM events WHERE company_id = 'co-s' AND action = 'bank.linked' AND json_extract(detail, '$.kind') = 'fio'")])
  fio.wait()
  fioFeed.transactions = [
    { id: 9001, date: dayS(-2), amount: -160, party: 'Slovak Telekom, a.s.', account: '2612345678', bankCode: '1100', vs: '7781202611', message: 'Internet' },
    { id: 9002, date: dayS(-1), amount: 245.5, party: 'Odberateľ s. r. o.', account: 'SK9811000000002987654321', vs: '77002' },
  ]
  fioFeed.closing = 2085.5
  const fioCalls = fio.calls.length
  res = await simona.post('/app/banka/fio', { token: FIO_TOKEN })
  const fioLink = await db.prepare("SELECT id, kind, status, token, bank FROM bank_links WHERE company_id = 'co-s' AND kind = 'fio'").first()
  const fioAccount = await db.prepare("SELECT id, bank, link_id, balance_cents FROM accounts WHERE company_id = 'co-s' AND iban = 'SK2283300000002801234567'").first()
  check(
    "the owner's token: Fio is linked and read at once",
    res.headers.get('location') === '/app/banka?ok=fio&n=2' && fioLink?.status === 'active' && fioLink.bank === 'Fio banka' && fio.calls.length === fioCalls + 1,
    res.headers.get('location'),
  )
  check(
    'its payments are there, its account is the one the page added before, now read by the token',
    fioAccount?.link_id === fioLink?.id &&
      fioAccount.balance_cents === 208550 &&
      (await db.prepare("SELECT COUNT(*) AS n FROM payments WHERE account_id = ? AND ref LIKE 'fio:%'").bind(fioAccount.id).first())?.n === 2,
    JSON.stringify(fioAccount),
  )
  check(
    'a transfer of Fio carries its IBAN and symbols',
    (await db.prepare("SELECT party_iban, vs FROM payments WHERE ref = 'fio:9001' AND company_id = 'co-s'").first())?.party_iban === 'SK2411000000002612345678',
  )
  res = await simona.get('/app/banka')
  page = await res.text()
  check('the page shows Fio linked, and never its token', page.includes('Fio banka') && page.includes('SK22 8330 0000 0028 0123 4567') && !page.includes(FIO_TOKEN))
  res = await simona.post(`/app/banka/${fioLink?.id}/nacitat`, {})
  check('read again at once: Fio wants 30 seconds, and is not asked', res.headers.get('location') === '/app/banka?ok=fio-skoro' && fio.calls.length === fioCalls + 1)
  await db.prepare('UPDATE bank_links SET tried_at = tried_at - 60 WHERE id = ?').bind(fioLink?.id).run()
  fio.wait()
  fioFeed.transactions.push({ id: 9003, date: dayS(0), amount: -9.9, party: 'Apple', identification: 'Nákup: APPLE.COM/BILL', kind: 'Platba kartou' })
  res = await simona.post(`/app/banka/${fioLink?.id}/nacitat`, {})
  check('a minute later it is read: what is new, and nothing twice', res.headers.get('location') === '/app/banka?ok=banka-nacitane&n=1', res.headers.get('location'))
  // The schedule reads it every six hours, also while Enable Banking is not set up
  await db.prepare('UPDATE bank_links SET tried_at = tried_at - 7 * 3600 WHERE id = ?').bind(fioLink?.id).run()
  fio.wait()
  const scheduledCalls = fio.calls.length
  await tick(Date.now())
  await settle(800)
  check('the schedule reads Fio by itself', fio.calls.length === scheduledCalls + 1)
  // An account a link reads is never asked for either; once the link ends, it is
  await db.prepare('UPDATE accounts SET balance_on = ? WHERE id = ?').bind(monthEarlier, fioAccount?.id).run()
  res = await simona.get('/app')
  check('an account a link reads is not asked for', !(await res.text()).includes('class="stmtdue"'))
  // A token that was taken back at Fio
  fio.revoke()
  await db.prepare('UPDATE bank_links SET tried_at = tried_at - 60 WHERE id = ?').bind(fioLink?.id).run()
  fio.wait()
  res = await simona.post(`/app/banka/${fioLink?.id}/nacitat`, {})
  check(
    'a token Fio no longer takes ends the link',
    res.headers.get('location') === '/app/banka?chyba=vyprsalo' && (await db.prepare('SELECT status FROM bank_links WHERE id = ?').bind(fioLink?.id).first())?.status === 'expired',
  )
  res = await simona.get('/app')
  page = await res.text()
  check('and the overview says so, with the way to a new token', page.includes('href="/app/banka?banka=fio#postup-banka"'))
  check('and asks for the statement the link no longer brings', page.includes('class="stmtdue"'))
  res = await simona.post(`/app/banka/${fioLink?.id}/odpojit`, {})
  check(
    'unlinked: the token is forgotten, the payments stay',
    (await db.prepare('SELECT token FROM bank_links WHERE id = ?').bind(fioLink?.id).first())?.token === null &&
      (await db.prepare("SELECT COUNT(*) AS n FROM payments WHERE ref LIKE 'fio:%' AND company_id = 'co-s'").first())?.n === 3,
  )

  // A bank whose statements are added once a month: the steps the statement was added from are remembered
  {
    const form = new FormData()
    form.append('banka', 'tatra')
    form.append(
      'file',
      new Blob(
        [camtXml({ iban: 'SK2283300000002801234567', from: monthEarlier, to: monthEarlier, opening: 30000, number: '7', entries: [{ ref: 'M2', day: monthEarlier, cents: -500, party: 'Poplatok' }] })],
        { type: 'application/xml' },
      ),
      'vypis-tatra.xml',
    )
    const encoded = new Request('https://x/', { method: 'POST', body: form })
    const body = new Uint8Array(await encoded.arrayBuffer())
    res = await mf.dispatchFetch(`${site}/app/banka`, {
      method: 'POST',
      body,
      redirect: 'manual',
      headers: { 'content-type': encoded.headers.get('content-type'), 'content-length': String(body.length), 'cf-connecting-ip': '203.0.113.30', origin: site, cookie: simonaCookie },
    })
    check(
      'a statement added from the steps of a bank of once a month: the page opens on that bank next time',
      res.status === 303 && JSON.parse((await db.prepare("SELECT bank_setup FROM companies WHERE id = 'co-s'").first())?.bank_setup ?? '{}').bank === 'tatra',
    )
    res = await simona.get('/app/banka')
    page = await res.text()
    check('with its steps and the other banks folded away', page.includes('Výpis do účtovníctva') && page.includes('Iná banka') && page.includes('name="banka" value="tatra"'))
  }

  // Two statements of an account the company does not have, the second not following the first: after the owner's yes
  // the first is taken and the second waits for the accountant
  {
    const iban = 'SK6702000000001234567890'
    await bankMail(camtXml({ iban, from: dayS(-5), to: dayS(-5), opening: 70000, entries: [{ ref: 'V1', day: dayS(-5), cents: -1000, party: 'PRVÝ' }] }))
    await bankMail(camtXml({ iban, from: dayS(-4), to: dayS(-4), opening: 10000, number: '2', entries: [{ ref: 'V2', day: dayS(-4), cents: -2000, party: 'DRUHÝ' }] }))
    const waiting = (await statementsS()).filter((r) => r.iban === iban)
    const ringsYes = (await sent()).length
    res = await simona.post(`/app/vypisy/${waiting[1]?.id}/ucet`, { ano: '1' })
    await settle(500)
    const after = (await statementsS()).filter((r) => r.iban === iban)
    check(
      "the owner's yes takes the first; the next one has to follow it, as if it came now",
      waiting.length === 2 && waiting.every((r) => r.status === 'confirm') && after[0]?.status === 'taken' && after[1]?.status === 'held' && JSON.parse(after[1].reason ?? '{}').kind === 'gap',
      JSON.stringify(after.map((r) => [r.status, r.reason])),
    )
    check(
      'the accountant is told of the one that waits',
      (await sent()).slice(ringsYes).some((m) => m.to === 'lucia@firmony.test' && m.subject === 'Firmony: výpis na kontrolu'),
    )
  }
}

// ---------------------------------------------------------------------------------------------------------------
// VAT: the registration in the company's details, the booking form's VAT, a period's return and control statement
// with their files, the mark that they were filed, and what the client then reads and pays
// ---------------------------------------------------------------------------------------------------------------
{
  const plain = (text) => text.replace(/ /g, ' ')
  const validXml = async (xml, schema) =>
    (await validateXML({ xml: [{ fileName: 'x.xml', contents: xml }], schema: [{ fileName: schema, contents: readFileSync(new URL(`./xsd/${schema}`, import.meta.url), 'utf8') }] })).valid
  // A period that has ended and holds nothing else of this test: the month before the last.
  const monthBack = (n) => {
    const d = new Date(`${day(0).slice(0, 7)}-15T12:00:00Z`)
    d.setUTCMonth(d.getUTCMonth() - n)
    return d.toISOString().slice(0, 7)
  }
  const old = monthBack(2)
  const vs = `1100${old.slice(5, 7)}${old.slice(0, 4)}`
  const details = (extra) => ({
    dic: '2121234567',
    icdph: 'SK2121234567',
    dph_stav: 'payer',
    dph_obdobie: 'month',
    dph_od: '',
    danovy_urad: 'Bratislava',
    oud: '500240-1234567890/8180',
    poznamka: 'Chce prehľad do 20.',
    ...extra,
  })

  res = await acc.post('/ucto/klienti/co-a/udaje', details({ icdph: 'SK123' }))
  page = plain(await res.text())
  check(
    'a VAT number that is none is said, and nothing is saved',
    res.status === 422 &&
      page.includes('IČ DPH píšte ako SK a 10 číslic.') &&
      page.includes('value="SK123"') &&
      (await db.prepare("SELECT vat_payer FROM companies WHERE id = 'co-a'").first())?.vat_payer === 0,
  )
  res = await acc.post('/ucto/klienti/co-a/udaje', details({ oud: '12-34' }))
  check('so is a personal account that is none', res.status === 422 && plain(await res.text()).includes('Toto číslo osobného účtu nepoznáme'))
  res = await acc.post('/ucto/klienti/co-a/udaje', details({ dph_prenos: 'veľa' }))
  check('and an excess deduction from before that is no amount', res.status === 422 && plain(await res.text()).includes('Sumu napíšte v eurách'))
  res = await acc.post('/ucto/klienti/co-a/udaje', details({}))
  const coVat = await db.prepare("SELECT vat_payer, vat_7a, vat_quarterly, icdph, tax_office, tax_account, plan, accountant_id FROM companies WHERE id = 'co-a'").first()
  check(
    'the registration, the tax office and the personal account are saved, the account however it was typed',
    res.status === 303 &&
      coVat?.vat_payer === 1 &&
      coVat.vat_7a === 0 &&
      coVat.vat_quarterly === 0 &&
      coVat.icdph === 'SK2121234567' &&
      coVat.tax_office === 'Bratislava' &&
      coVat.tax_account === '1234567890' &&
      coVat.plan === 'rast' &&
      coVat.accountant_id === lucia?.id,
    JSON.stringify(coVat),
  )

  // Two documents of that month: an invoice issued and booked, and one received that waits.
  const at = Math.floor(Date.parse(`${old}-20T10:00:00Z`) / 1000)
  await db.batch([
    db
      .prepare(
        "INSERT INTO documents (id, company_id, created_at, source, status, read_by, kind, party, party_ico, number, vs, issued_on, total_cents, vat_cents, currency, category, booked_at, booked_by) VALUES ('vat-out', 'co-a', ?, 'upload', 'read', 'test', 'invoice_out', 'Odberateľ s. r. o.', '12345679', '2026901', '2026901', ?, 12300, 2300, 'EUR', 'sales', ?, ?)",
      )
      .bind(at, `${old}-12`, at, lucia?.id ?? ''),
    db
      .prepare(
        "INSERT INTO documents (id, company_id, created_at, source, status, read_by, kind, party, party_ico, party_vat_id, number, issued_on, total_cents, vat_cents, currency, category, vat_deduct) VALUES ('vat-in', 'co-a', ?, 'email', 'read', 'test', 'invoice_in', 'Dodávateľ s. r. o.', '36123456', 'SK2020123456', 'FA-77', ?, 6150, 1150, 'EUR', 'services', 1)",
      )
      .bind(at, `${old}-15`),
  ])
  res = await acc.get(`/ucto/klienti/co-a/dph?obdobie=${old}`)
  page = plain(await res.text())
  check(
    'the period says what keeps it from being filed: the seat, and a document not booked',
    res.status === 200 && page.includes('Doplňte sídlo firmy.') && page.includes('Doklad z obdobia nie je zaúčtovaný.') && page.includes('Treba vyriešiť') && page.includes('/ucto/doklady/vat-in'),
  )
  res = await acc.get(`/ucto/klienti/co-a/dph/priznanie.xml?obdobie=${old}`)
  check('and no file is made while it does', res.status === 303 && (res.headers.get('location') ?? '').includes('ok=dph-blokovane'))
  await db.prepare("UPDATE companies SET address = 'Hlavná 1, 811 01 Bratislava' WHERE id = 'co-a'").run()

  // Booking the received invoice: its VAT proposed, said wrong, then confirmed.
  res = await acc.get('/ucto/doklady/vat-in')
  page = plain(await res.text())
  check(
    'the booking form proposes the VAT and says where it goes',
    page.includes('DPH v priznaní') &&
      page.includes('Navrhnuté z dokladu.') &&
      page.includes('name="dph_zaklad_23" value="50,00"') &&
      page.includes('value="SK2020123456"') &&
      page.includes('r. 19, r. 21, B.2'),
  )
  const bookIn = (extra) =>
    acc.post('/ucto/doklady/vat-in', {
      akcia: 'zauctovat',
      kind: 'invoice_in',
      category: 'services',
      party: 'Dodávateľ s. r. o.',
      ico: '36123456',
      number: 'FA-77',
      vs: '',
      issued: skDay(`${old}-15`),
      due: '',
      total: '61,50',
      vat: '11,50',
      account: '',
      deduct: '1',
      dph: '1',
      dph_rezim: 'domestic',
      dph_dodanie: '',
      dph_icdph: 'SK2020123456',
      dph_opravuje: '',
      dph_obdobie: '',
      dph_zaklad_23: '50,00',
      dph_dan_23: '11,50',
      ...extra,
    })
  res = await bookIn({ dph_zaklad_23: '' })
  page = plain(await res.text())
  check(
    'VAT without its base is said, and nothing is booked',
    res.status === 422 && page.includes('K DPH doplňte aj základ.') && (await db.prepare("SELECT booked_at FROM documents WHERE id = 'vat-in'").first())?.booked_at === null,
  )
  res = await bookIn({ dph_icdph: '' })
  check("nor a deduction without the supplier's VAT number", res.status === 422 && plain(await res.text()).includes('Faktúra s odpočtom DPH potrebuje IČ DPH dodávateľa'))
  res = await bookIn({})
  const inVat = await db.prepare("SELECT booked_at, vat_mode, vat_lines, party_vat_id FROM documents WHERE id = 'vat-in'").first()
  check(
    'booked with its VAT confirmed, the deduction in its line',
    res.status === 303 &&
      Boolean(inVat?.booked_at) &&
      inVat.vat_mode === 'domestic' &&
      inVat.vat_lines === JSON.stringify([{ rate: 23, base: 5000, vat: 1150, deduct: 1150 }]) &&
      inVat.party_vat_id === 'SK2020123456',
    JSON.stringify(inVat),
  )

  res = await acc.get(`/ucto/klienti/co-a/dph?obdobie=${old}`)
  page = plain(await res.text())
  check(
    'then the period is ready: 23 € on 100 € supplied, 11,50 € deducted, 11,50 € to pay',
    page.includes('Pripravené') && page.includes('100,00 €') && page.includes('23,00 €') && page.includes('Na úhradu 11,50 €') && page.includes('DPH je len navrhnutá'),
    page.slice(page.indexOf('Priznanie'), page.indexOf('Priznanie') + 400),
  )
  res = await acc.get(`/ucto/klienti/co-a/dph/priznanie.xml?obdobie=${old}`)
  check('no file before the podklady are saved: what is loaded in eDane is what the evidence holds', res.status === 303 && (res.headers.get('location') ?? '').includes('ok=dph-ulozit'))
  const readyHtml = await (await acc.get(`/ucto/klienti/co-a/dph?obdobie=${old}`)).text()
  page = plain(readyHtml)
  check('the page offers saving the podklady first, and no file yet', page.includes('Uložiť podklady a otvoriť podania') && !page.includes('Stiahnuť priznanie (XML)'))
  if (process.env.FIRMONY_CAPTURE_DIR) writeFileSync(`${process.env.FIRMONY_CAPTURE_DIR}/vat-ready.html`, readyHtml)
  res = await acc.get('/ucto')
  const homeHtml = await res.text()
  page = plain(homeHtml)
  check(
    "the team's home says what of ours presses today, and a client with it is not done",
    res.status === 200 && page.includes('Dnes na rade') && homeHtml.includes(`/ucto/klienti/co-a/dph?obdobie=${old}`) && !/tbl__row--done[^>]*href="\/ucto\/klienti\/co-a"/.test(homeHtml),
  )
  if (process.env.FIRMONY_CAPTURE_DIR) writeFileSync(`${process.env.FIRMONY_CAPTURE_DIR}/team-home.html`, homeHtml)
  // Email that every attempt failed to send is the administrator's to see: clients would not know of their messages.
  await db
    .prepare("INSERT INTO outbox (id, recipient, subject, body, created_at, attempts, error) VALUES ('failed-mail-test', 'x@x.test', 'S', 'B', ?, 10, 'TestRefused')")
    .bind(nowS)
    .run()
  const flagged = plain(await (await admin.get('/ucto')).text())
  const unflagged = plain(await (await acc.get('/ucto')).text())
  check(
    'the administrator is told of email that could not be sent, with why, and an accountant is not',
    flagged.includes('1 e-mail sme ani po opakovaných pokusoch neodoslali (TestRefused)') && !unflagged.includes('neodoslali'),
  )
  await db.prepare("DELETE FROM outbox WHERE id = 'failed-mail-test'").run()
  res = await acc.get('/ucto/klienti/co-b/dph')
  check('never of a client that is not hers', res.status === 404)

  // Filed: once, with what was filed; the client is told in the app what to pay, where and with which symbol.
  await db.prepare("UPDATE messages SET seen_at = ? WHERE company_id = 'co-a' AND seen_at IS NULL").bind(nowS).run()
  const beforeFile = (await sent()).length
  res = await acc.post('/ucto/klienti/co-a/dph/podane', { obdobie: old })
  await settle()
  const filedRow = await db.prepare("SELECT pay_cents, refund_cents, kv_rows, filed_by FROM vat_returns WHERE company_id = 'co-a' AND period = ?").bind(old).first()
  check(
    'marked as filed, with what was filed',
    res.status === 303 && filedRow?.pay_cents === 1150 && filedRow.refund_cents === 0 && filedRow.kv_rows === 2 && filedRow.filed_by === lucia?.id,
    JSON.stringify(filedRow),
  )
  res = await acc.get(`/ucto/klienti/co-a/dph/priznanie.xml?obdobie=${old}`)
  const returnFile = await res.text()
  check(
    'the return as a file the portal takes, valid against its schema',
    res.status === 200 &&
      (res.headers.get('content-disposition') ?? '').includes(`DPH_SK2121234567_${old}.xml`) &&
      returnFile.includes('<r04>23.00</r04>') &&
      returnFile.includes('<r21>11.50</r21>') &&
      returnFile.includes('<r35>11.50</r35>') &&
      returnFile.includes('<danovyUrad>Bratislava</danovyUrad>') &&
      (await validXml(returnFile, 'dph2025.xsd')),
    returnFile.slice(0, 300),
  )
  res = await acc.get(`/ucto/klienti/co-a/dph/kontrolny-vykaz.xml?obdobie=${old}`)
  const kvFile = await res.text()
  check(
    'the control statement too: A.1 and B.2, valid',
    res.status === 200 && kvFile.includes('<A1 F="2026901"') && kvFile.includes('<B2 Dod="SK2020123456" F="FA-77"') && (await validXml(kvFile, 'kv_dph_2025.xsd')),
    kvFile,
  )
  const filedMsg = plain((await db.prepare("SELECT body FROM messages WHERE company_id = 'co-a' AND side = 'firmony' ORDER BY created_at DESC, rowid DESC LIMIT 1").first())?.body ?? '')
  check(
    'the client is told what to pay, to which account and with which symbol',
    filedMsg.includes('Na úhradu je 11,50 €') && filedMsg.includes(vs) && filedMsg.includes('8180 5002 4012 3456 7890'),
    filedMsg,
  )
  check(
    'and rung, with nothing of it in the email',
    (await sent()).slice(beforeFile).some((m) => m.to === 'anna@firma-a.test' && m.text.includes('/app/spravy') && !m.text.includes('11,50')),
  )
  res = await acc.post('/ucto/klienti/co-a/dph/podane', { obdobie: old })
  check(
    'filed again, it stays one',
    (res.headers.get('location') ?? '').includes('ok=dph-uz') && (await db.prepare("SELECT COUNT(*) AS n FROM vat_returns WHERE company_id = 'co-a'").first())?.n === 1,
  )
  res = await acc.post('/ucto/klienti/co-a/dph/podane', { obdobie: day(0).slice(0, 7) })
  check('a period that has not ended is not filed', (res.headers.get('location') ?? '').includes('ok=dph-bezi'))

  // What the client reads and pays.
  res = await anna.get('/app/dane')
  page = plain(await res.text())
  check(
    'the client finds the tax with the account, the symbol and a QR code for the bank',
    res.status === 200 && page.includes('11,50 €') && page.includes(vs) && page.includes('8180 5002 4012 3456 7890') && page.includes('PAY by square') && page.includes('<svg'),
  )
  res = await anna.get('/app')
  check('the overview asks for it until it is paid', plain(await res.text()).includes('Zaplatiť DPH za'))
  await db
    .prepare(
      "INSERT INTO payments (id, company_id, account_id, created_at, booked_on, amount_cents, party, vs, ref) VALUES ('pa-vat', 'co-a', 'acc-a', ?, ?, -1150, 'Finančné riaditeľstvo SR', ?, 'vat-1')",
    )
    .bind(nowS, day(0), `000${vs}`)
    .run()
  res = await anna.get('/app/dane')
  check('paid with its symbol, zeros in front or not, it says so', plain(await res.text()).includes('Zaplatené'))
  res = await anna.get('/app')
  check('and the overview no longer asks', !plain(await res.text()).includes('Zaplaťte 11,50 €'))

  // Compatibility fixture: an imported pre-registry manual filing, with no delivery IDs.
  // New prepared/accepted workflows and proof guards are exercised separately in filings.runtime.mjs.
  await db.prepare("UPDATE vat_returns SET delivery = NULL WHERE company_id = 'co-a' AND period = ?").bind(old).run()

  // A document booked after filing changes the figures. The deadline has passed: a supplementary return with rows 36
  // and 37, and a supplementary control statement with the new line alone.
  await db
    .prepare(
      "INSERT INTO documents (id, company_id, created_at, source, status, read_by, kind, party, party_ico, number, vs, issued_on, total_cents, vat_cents, currency, category, booked_at, booked_by) VALUES ('vat-late', 'co-a', ?, 'upload', 'read', 'test', 'invoice_out', 'Odberateľ s. r. o.', '12345679', '2026902', '2026902', ?, 24600, 4600, 'EUR', 'sales', ?, ?)",
    )
    .bind(at, `${old}-25`, nowS, lucia?.id ?? '')
    .run()
  res = await acc.get(`/ucto/klienti/co-a/dph?obdobie=${old}`)
  page = plain(await res.text())
  check(
    'a document booked after filing: the page says which rows changed, that a supplementary return is due, and its rows 36 and 37',
    page.includes('Zmenené po uložení') &&
      page.includes('Zmenené riadky: 03, 04, 17, 32, 35.') &&
      page.includes('treba dodatočné priznanie') &&
      page.includes('Uložiť opravené podklady') &&
      !page.includes('Stiahnuť dodatočné priznanie') &&
      page.includes('Riadok 36: +46,00 €. Riadok 37: +46,00 €.'),
    page.match(/Zmenené riadky[^.]*\./)?.[0],
  )
  // A correction is made only from books that could be filed: a document of the month not yet read keeps it back.
  await db
    .prepare("INSERT INTO documents (id, company_id, created_at, source, status, read_by, kind, issued_on) VALUES ('vat-unread', 'co-a', ?, 'upload', 'read', 'test', NULL, ?)")
    .bind(at, `${old}-26`)
    .run()
  res = await acc.get(`/ucto/klienti/co-a/dph?obdobie=${old}`)
  page = plain(await res.text())
  const heldBack = page.includes('Opravu pripravíme, keď bude všetko vyriešené.') && !page.includes('Uložiť opravené podklady')
  res = await acc.get(`/ucto/klienti/co-a/dph/priznanie.xml?obdobie=${old}`)
  check('a correction waits while a document of the month is not booked', heldBack && (res.headers.get('location') ?? '').includes('ok=dph-blokovane'))
  await db.prepare("DELETE FROM documents WHERE id = 'vat-unread'").run()
  // Filed ten days ago, found yesterday: a day of finding before the filing would not be taken.
  await db.prepare("UPDATE vat_returns SET filed_on = ? WHERE company_id = 'co-a'").bind(day(-10)).run()
  const found = day(-1)
  const dotted = `${found.slice(8, 10)}.${found.slice(5, 7)}.${found.slice(0, 4)}`
  res = await acc.get(`/ucto/klienti/co-a/dph/priznanie.xml?obdobie=${old}&zistene=${encodeURIComponent(skDay(found))}`)
  check('the correction has no file before its podklady are saved either', res.status === 303 && (res.headers.get('location') ?? '').includes('ok=dph-ulozit'))
  await db.prepare("UPDATE messages SET seen_at = ? WHERE company_id = 'co-a' AND seen_at IS NULL").bind(nowS).run()
  res = await acc.post('/ucto/klienti/co-a/dph/podane', { obdobie: old, zistene: skDay(found) })
  await settle()
  const dRow = await db.prepare("SELECT kind, pay_cents, found_on, due_on, prev FROM vat_returns WHERE company_id = 'co-a'").first()
  const monthAfter = new Date(`${found.slice(0, 7)}-15T12:00:00Z`)
  monthAfter.setUTCMonth(monthAfter.getUTCMonth() + 1)
  check(
    'marked as filed: the period now comes to 57,50 €, due by the end of the month after the finding',
    res.status === 303 &&
      (res.headers.get('location') ?? '').includes('/podania?obdobie=') &&
      dRow?.kind === 'D' &&
      dRow.pay_cents === 1150 + 4600 &&
      dRow.found_on === found &&
      dRow.due_on >= `${monthAfter.toISOString().slice(0, 7)}-28` &&
      Boolean(dRow.prev),
    JSON.stringify(dRow && { ...dRow, prev: Boolean(dRow.prev) }),
  )
  res = await acc.get(`/ucto/klienti/co-a/dph/priznanie.xml?obdobie=${old}`)
  const dFile = await res.text()
  check(
    'the supplementary return: marked so, with the day of finding, the whole figures and rows 36 and 37, valid',
    res.status === 200 &&
      (res.headers.get('content-disposition') ?? '').includes(`DPH_D_SK2121234567_${old}.xml`) &&
      dFile.includes('<ddp>1</ddp>') &&
      dFile.includes(`<datumZisteniaDdp>${dotted}</datumZisteniaDdp>`) &&
      dFile.includes('<r04>69.00</r04>') &&
      dFile.includes('<r36>46.00</r36>') &&
      dFile.includes('<r37>46.00</r37>') &&
      (await validXml(dFile, 'dph2025.xsd')),
    dFile.slice(0, 400),
  )
  res = await acc.get(`/ucto/klienti/co-a/dph/kontrolny-vykaz.xml?obdobie=${old}`)
  const dKvFile = await res.text()
  check(
    'the supplementary control statement: the new line alone, with code 2, valid',
    res.status === 200 &&
      dKvFile.includes('<Druh>D</Druh>') &&
      dKvFile.includes('F="2026902"') &&
      dKvFile.includes('KOpr="2"') &&
      !dKvFile.includes('F="2026901"') &&
      !dKvFile.includes('<B2') &&
      (await validXml(dKvFile, 'kv_dph_2025.xsd')),
    dKvFile,
  )
  const dMsg = plain((await db.prepare("SELECT body FROM messages WHERE company_id = 'co-a' AND side = 'firmony' ORDER BY created_at DESC, rowid DESC LIMIT 1").first())?.body ?? '')
  check(
    'the client reads that a supplementary return was filed, and only the difference is asked for',
    dMsg.includes('dodatočné priznanie') && dMsg.includes('Na úhradu je 46,00 €') && dMsg.includes('Zaplatených 11,50 €'),
    dMsg,
  )
  res = await anna.get('/app/dane')
  page = plain(await res.text())
  check('the client sees what is left of it, with the QR code', page.includes('Dodatočné priznanie pripravené') && page.includes('Zaplatili ste už 11,50 € z 57,50 €') && page.includes('PAY by square'))
  res = await acc.get(`/ucto/klienti/co-a/dph?obdobie=${old}`)
  page = plain(await res.text())
  check('and the period stands filed again', page.includes('Podklady uložené') && !page.includes('Zmenené po uložení'))
  res = await acc.get(`/ucto/klienti/co-a/dph/kontrolny-vykaz.xml?obdobie=${old}`)
  check('its files are the ones filed', (await res.text()).includes('KOpr="2"'))

  // Taken back: the supplementary return gives way to the return filed before it, then that goes too.
  res = await acc.post('/ucto/klienti/co-a/dph/zrusit', { obdobie: old })
  const restored = await db.prepare("SELECT kind, pay_cents, prev FROM vat_returns WHERE company_id = 'co-a'").first()
  const undoneCorrection = plain((await db.prepare("SELECT body FROM messages WHERE company_id = 'co-a' AND side = 'firmony' ORDER BY created_at DESC, rowid DESC LIMIT 1").first())?.body ?? '')
  check(
    'the correction taken back: the return filed before it stands again, and the client is told',
    res.status === 303 && restored?.kind === 'R' && restored.pay_cents === 1150 && restored.prev === null && undoneCorrection.includes('oprave') && undoneCorrection.includes('rušíme'),
    JSON.stringify(restored) + undoneCorrection,
  )
  res = await acc.post('/ucto/klienti/co-a/dph/zrusit', { obdobie: old })
  const undone = plain((await db.prepare("SELECT body FROM messages WHERE company_id = 'co-a' AND side = 'firmony' ORDER BY created_at DESC, rowid DESC LIMIT 1").first())?.body ?? '')
  check(
    'the first mark taken back too, and the client told it does not stand',
    res.status === 303 && (await db.prepare("SELECT COUNT(*) AS n FROM vat_returns WHERE company_id = 'co-a'").first())?.n === 0 && undone.includes('rušíme'),
    undone,
  )
  res = await acc.post('/ucto/klienti/co-a/dph/podane', { obdobie: old })
  check('and set again with the new figures', (await db.prepare("SELECT pay_cents FROM vat_returns WHERE company_id = 'co-a'").first())?.pay_cents === 1150 + 4600)

  // A client that is not registered and pays for advertising abroad owes a registration under § 7a.
  await db
    .prepare(
      "INSERT INTO documents (id, company_id, created_at, source, status, read_by, kind, party, party_vat_id, foreign_party, number, issued_on, total_cents, vat_cents, currency, category) VALUES ('vat-meta', 'co-b', ?, 'email', 'read', 'test', 'invoice_in', 'Meta Platforms Ireland Limited', 'IE9692928F', 1, 'FB-1', ?, 3000, 0, 'EUR', 'services')",
    )
    .bind(nowS, day(-1))
    .run()
  res = await admin.get('/ucto/klienti/co-b')
  page = plain(await res.text())
  check('a client that is not registered and buys a service from abroad is flagged for § 7a, before anybody books it', page.includes('Nákupy zo zahraničia') && page.includes('registrovať podľa § 7a'))
  res = await admin.get('/ucto/doklady/vat-meta')
  check('and so is the document itself', plain(await res.text()).includes('registrovať podľa § 7a'))

  // What this part wrote to the client is read, and the advertising goes, so that what follows finds things as before.
  await db.prepare("UPDATE messages SET seen_at = ? WHERE company_id = 'co-a' AND side = 'firmony' AND seen_at IS NULL").bind(nowS).run()
  await db.prepare("DELETE FROM documents WHERE id = 'vat-meta'").run()
}

// ---------------------------------------------------------------------------------------------------------------
// The books: the trial balance with what keeps it from being whole, the journal, an account, the open items, the
// account of a payment without a document, internal documents numbered for good, the opening balances, the files
// ---------------------------------------------------------------------------------------------------------------
{
  const plain = (text) => text.replace(/ /g, ' ')
  const today = day(0)
  const y = today.slice(0, 4)
  const m = Number(today.slice(5, 7))
  await db.batch([
    db
      .prepare(
        "INSERT INTO companies (id, created_at, name, ico, address, vat_payer, plan, inbox, accountant_id, start_on, icdph) VALUES ('co-l', ?, 'Kniha s. r. o.', '50999991', 'Hlavná 9, 040 01 Košice', 1, 'rast', 'kniha001', ?, ?, 'SK2120999991')",
      )
      .bind(nowS, lucia?.id ?? '', `${y}-01-01`),
    db
      .prepare("INSERT INTO accounts (id, company_id, iban, ledger, balance_cents, balance_on) VALUES ('acc-l', 'co-l', 'SK6809000000000999999991', '221.001', ?, ?)")
      .bind(-12300 - 450 - 3300 - 2000, today),
    db
      .prepare(
        "INSERT INTO payments (id, company_id, account_id, created_at, booked_on, amount_cents, party, vs, ref) VALUES ('pl-1', 'co-l', 'acc-l', ?, ?, -12300, 'Dodávateľ s. r. o.', '7001', 'l1'), ('pl-fee', 'co-l', 'acc-l', ?, ?, -450, NULL, NULL, 'l2'), ('pl-state', 'co-l', 'acc-l', ?, ?, -3300, 'Finančná správa SR', '1700000000', 'l3'), ('pl-miss', 'co-l', 'acc-l', ?, ?, -2000, 'Niekto', NULL, 'l4')",
      )
      .bind(nowS, today, nowS, today, nowS, today, nowS, today),
    db.prepare("UPDATE payments SET exempt = 'bank', note = 'Poplatok za vedenie účtu' WHERE id = 'pl-fee'"),
    db.prepare("UPDATE payments SET exempt = 'state', exempt_note = 'správny poplatok' WHERE id = 'pl-state'"),
    db
      .prepare(
        "INSERT INTO documents (id, company_id, created_at, source, status, read_by, kind, party, party_ico, party_vat_id, number, vs, issued_on, due_on, total_cents, vat_cents, currency, category, vat_deduct, booked_at, booked_by) VALUES ('dl-in', 'co-l', ?, 'email', 'read', 'test', 'invoice_in', 'Dodávateľ s. r. o.', '36123456', 'SK2020123456', 'FA-L1', '7001', ?, ?, 12300, 2300, 'EUR', 'services', 1, ?, ?)",
      )
      .bind(nowS, today, today, nowS, lucia?.id ?? ''),
    db
      .prepare(
        "INSERT INTO documents (id, company_id, created_at, source, status, read_by, kind, party, party_ico, number, vs, issued_on, due_on, total_cents, vat_cents, currency, category, booked_at, booked_by) VALUES ('dl-out', 'co-l', ?, 'issued', 'read', 'test', 'invoice_out', 'Odberateľ s. r. o.', '12345679', '2026L01', '2026L01', ?, ?, 36900, 6900, 'EUR', 'sales', ?, ?)",
      )
      .bind(nowS, today, today, nowS, lucia?.id ?? ''),
    db.prepare("INSERT INTO documents (id, company_id, created_at, source, status, read_by, kind, total_cents) VALUES ('dl-wait', 'co-l', ?, 'upload', 'read', 'test', 'receipt', 990)").bind(nowS),
    db.prepare("INSERT INTO links (document_id, payment_id, company_id, how, created_at) VALUES ('dl-in', 'pl-1', 'co-l', 'auto', ?)").bind(nowS),
  ])

  res = await anna.get('/ucto/klienti/co-l/kniha')
  check('a client gets nothing of the books', res.status === 404)
  res = await acc.get('/ucto/klienti/co-l/kniha')
  page = plain(await res.text())
  check(
    'the trial balance: the accounts by class, VAT on its analytic accounts, the result',
    res.status === 200 &&
      page.includes('Obratová predvaha') &&
      page.includes('Trieda 3: Zúčtovacie vzťahy') &&
      page.includes('343.100') &&
      page.includes('343.200') &&
      page.includes('221.001') &&
      page.includes('Zisk') &&
      page.includes('Obraty MD a D sa zhodujú'),
  )
  check(
    'and what keeps the books from being whole, each with the way to it',
    page.includes('1 doklad čaká na zaúčtovanie.') &&
      page.includes('1 platbe bez dokladu treba dať účet.') &&
      page.includes('Klient ešte neposlal doklad k 1 platbe.') &&
      page.includes('/ucto/klienti/co-l/kniha/platby'),
  )
  check(
    'the bank against the books: what is not booked yet explains the difference',
    page.includes('Banka a kniha') && page.includes('Platby, ktoré ešte nie sú v knihe') && page.includes('−53,00 €') && page.includes('Kniha sa s bankou zhoduje.'),
    page.match(/Banka a kniha[\s\S]{0,600}/)?.[0],
  )
  res = await acc.get(`/ucto/klienti/co-l/kniha/dennik?rok=${y}&mesiac=${m}`)
  page = plain(await res.text())
  check(
    'the journal of the month: the invoice with its VAT, its payment against the bank, the bank fee',
    res.status === 200 &&
      page.includes('FA-L1') &&
      page.includes('Úhrada: Dodávateľ s. r. o. (FA-L1)') &&
      page.includes('Banka: Poplatok za vedenie účtu') &&
      page.includes('568') &&
      page.includes('VBÚ 221.001'),
  )
  res = await acc.get(`/ucto/klienti/co-l/kniha/ucet/321?rok=${y}&mesiac=${m}`)
  page = plain(await res.text())
  check('an account and its movements', res.status === 200 && page.includes('Účet 321') && page.includes('Dodávatelia') && page.includes('Počiatočný stav') && page.includes('123,00'))
  res = await acc.get('/ucto/klienti/co-l/kniha/ucet/912')
  check('no account outside the chart', res.status === 404)
  res = await acc.get('/ucto/klienti/co-l/kniha/saldokonto')
  page = plain(await res.text())
  check('the open items: the issued invoice waits, the received one is paid', res.status === 200 && page.includes('2026L01') && page.includes('369,00') && !page.includes('FA-L1'))

  // The account of a payment without a document: refused when it is no account, or the bank's own; given, it books
  res = await acc.post('/ucto/klienti/co-l/kniha/platby/pl-state', { ucet: '221.001' })
  page = plain(await res.text())
  check('the bank account cannot be the other side of a bank payment', res.status === 422 && page.includes('Bankový účet 221 tu byť nemôže.') && page.includes('value="221.001"'))
  res = await acc.post('/ucto/klienti/co-l/kniha/platby/pl-state', { ucet: 'x1' })
  check('nor what is no account', res.status === 422)
  res = await acc.post('/ucto/klienti/co-l/kniha/platby/pl-state', { ucet: '538' })
  check(
    'an account given: saved, on record, and the payment is in the books',
    res.status === 303 &&
      (await db.prepare("SELECT contra FROM payments WHERE id = 'pl-state'").first())?.contra === '538' &&
      (await db.prepare("SELECT COUNT(*) AS n FROM events WHERE action = 'ledger.contra' AND subject = 'pl-state'").first())?.n === 1,
  )
  res = await acc.get('/ucto/klienti/co-l/kniha')
  page = plain(await res.text())
  check('and nothing waits for an account any more', !page.includes('treba dať účet') && page.includes('538'))
  res = await acc.get(`/ucto/klienti/co-l/kniha/platby?rok=${y}`)
  page = plain(await res.text())
  check('the payments without a document, with their accounts', res.status === 200 && page.includes('Váš 538') && page.includes('568, podľa dôvodu') && !page.includes('Niekto'))
  res = await acc.post('/ucto/klienti/co-b/kniha/platby/pb-1', { ucet: '518' })
  check("an accountant cannot touch another accountant's client", res.status === 404)
  res = await acc.post('/ucto/klienti/co-l/kniha/platby/pb-1', { ucet: '518' })
  check("nor give an account to another company's payment through her own", res.status === 404 && (await db.prepare("SELECT contra FROM payments WHERE id = 'pb-1'").first())?.contra === null)

  // Internal documents: numbered in the company's year, the number never given twice
  const internal = (extra) => acc.post('/ucto/klienti/co-l/kniha/interne', { datum: skDay(today), text: 'Časové rozlíšenie nájmu', md_0: '381', d_0: '518', suma_0: '40', ...extra })
  res = await internal({ text: '', md_0: '518' })
  page = plain(await res.text())
  check('an internal document with mistakes says each', res.status === 422 && page.includes('Napíšte, čo zápis je.') && page.includes('MD a D sú ten istý účet.'))
  res = await internal({ datum: '31. 2. 2026' })
  check('and a day that is none', res.status === 422 && plain(await res.text()).includes('Zadajte dátum'))
  await internal({})
  await internal({ text: 'Druhý zápis', md_0: '548', d_0: '325', suma_0: '1 200,50' })
  const numbers = (await db.prepare("SELECT id, number FROM ledger_entries WHERE company_id = 'co-l' AND kind = 'internal' ORDER BY seq").all()).results
  check('numbered in a row', numbers.map((r) => r.number).join() === `ID-${y}-001,ID-${y}-002`, numbers.map((r) => r.number).join())
  // The newest one removed: the next still takes a number of its own, never the one removed.
  res = await acc.post(`/ucto/klienti/co-l/kniha/interne/${numbers[1]?.id}/odstranit`, {})
  await internal({ text: 'Tretí zápis' })
  const after = (await db.prepare("SELECT number, deleted_at FROM ledger_entries WHERE company_id = 'co-l' AND kind = 'internal' ORDER BY seq").all()).results
  check(
    'one removed keeps its number, and the next takes a new one',
    after.length === 3 && after[1].deleted_at !== null && after[2].number === `ID-${y}-003` && (await db.prepare("SELECT COUNT(*) AS n FROM events WHERE action = 'ledger.removed'").first())?.n === 1,
    JSON.stringify(after),
  )
  res = await acc.get('/ucto/klienti/co-l/kniha/interne')
  page = plain(await res.text())
  check(
    'the internal documents that stand, with who wrote them',
    page.includes(`ID-${y}-001`) && page.includes(`ID-${y}-003`) && !page.includes(`ID-${y}-002`) && page.includes('zapísala Lucia Horváthová'),
  )
  res = await acc.post(`/ucto/klienti/co-a/kniha/interne/${numbers[0]?.id}/odstranit`, {})
  check(
    "an internal document is removed only from its own company's books",
    res.status === 404 &&
      (
        await db
          .prepare('SELECT deleted_at FROM ledger_entries WHERE id = ?')
          .bind(numbers[0]?.id ?? '')
          .first()
      )?.deleted_at === null,
  )
  res = await acc.get(`/ucto/klienti/co-l/kniha/ucet/381?rok=${y}&mesiac=${m}`)
  page = plain(await res.text())
  check('internal documents are in the books', page.includes('Tretí zápis') && page.includes('Časové rozlíšenie nájmu'))
  res = await acc.get(`/ucto/klienti/co-l/kniha/ucet/325?rok=${y}&mesiac=${m}`)
  check('and one removed is not', !plain(await res.text()).includes('Druhý zápis'))

  // The opening balances: against 701, both sides the same, written anew as a whole
  const opening = (extra) =>
    acc.post('/ucto/klienti/co-l/kniha/pociatocne', {
      datum: `1. 1. ${y}`,
      ucet_0: '221.001',
      md_0: '100',
      d_0: '',
      ucet_1: '411',
      md_1: '',
      d_1: '5 000',
      ucet_2: '353',
      md_2: '4 900',
      d_2: '',
      ...extra,
    })
  res = await opening({ md_2: '4 800' })
  page = plain(await res.text())
  check('opening balances whose sides differ are refused', res.status === 422 && page.includes('Strany nesedia: MD 4 900,00 €, D 5 000,00 €.'))
  res = await opening({ ucet_2: '701' })
  check('and the closing accounts are not among them', res.status === 422 && plain(await res.text()).includes('Účty triedy 7 sem nepatria.'))
  res = await opening({})
  const stand = async () => (await db.prepare("SELECT lines FROM ledger_entries WHERE company_id = 'co-l' AND kind = 'opening' AND deleted_at IS NULL").all()).results
  check('saved, each line against 701', res.status === 303 && (await stand()).length === 1 && JSON.parse((await stand())[0].lines).every((l) => l.md === '701' || l.d === '701'))
  res = await opening({ md_0: '200', md_2: '4 800' })
  check('written again, the new ones stand alone', res.status === 303 && (await stand()).length === 1 && (await stand())[0].lines.includes('"cents":20000'))
  const openingId = (await db.prepare("SELECT id FROM ledger_entries WHERE company_id = 'co-l' AND kind = 'opening' AND deleted_at IS NULL").first())?.id
  res = await acc.post(`/ucto/klienti/co-l/kniha/interne/${openingId}/odstranit`, {})
  check('the opening balances are not removed as an internal document', res.status === 404 && (await stand()).length === 1)
  res = await acc.get('/ucto/klienti/co-l/kniha/pociatocne')
  page = plain(await res.text())
  check('and the form shows them as they stand', page.includes('value="221.001"') && page.includes('value="200,00"') && page.includes('MD spolu 5 000,00 €, D spolu 5 000,00 €'))
  res = await acc.get(`/ucto/klienti/co-l/kniha?rok=${y}&mesiac=${m}`)
  page = plain(await res.text())
  check(
    'the opening balances stand as the opening of the year',
    page.includes('Počiatočný stav') && page.includes('5 000,00<span class="lside">D</span>') && page.includes('4 800,00<span class="lside">MD</span>'),
  )

  // The files
  res = await acc.get(`/ucto/klienti/co-l/kniha/dennik.csv?rok=${y}`)
  const bytes = new Uint8Array(await res.arrayBuffer())
  let csv = new TextDecoder().decode(bytes)
  check(
    'the journal as a file for Slovak Excel',
    res.status === 200 &&
      (res.headers.get('content-type') ?? '').startsWith('text/csv') &&
      bytes[0] === 0xef &&
      bytes[1] === 0xbb &&
      bytes[2] === 0xbf &&
      csv.startsWith('Dátum;Doklad;Text;MD;D;Suma;Zdroj') &&
      csv.includes(';FA-L1;') &&
      csv.includes(';221.001;'),
    csv.slice(0, 200),
  )
  res = await acc.get(`/ucto/klienti/co-l/kniha/predvaha.csv?rok=${y}&mesiac=${m}`)
  csv = plain(await res.text())
  check('the trial balance as a file', res.status === 200 && csv.includes('Účet;Názov účtu;Počiatočný stav') && csv.includes('343.100;DPH na vstupe (odpočet)'))
  res = await acc.get(`/ucto/klienti/co-l/kniha/hlavna-kniha.csv?rok=${y}`)
  check('the general ledger as a file', res.status === 200 && plain(await res.text()).includes('Spolu a konečný stav'))
  res = await acc.get('/ucto/klienti/co-l/kniha/saldokonto.csv')
  check('the open items as a file', res.status === 200 && plain(await res.text()).includes('311;2026L01;Odberateľ s. r. o.'))
  res = await acc.get('/ucto/klienti/co-l/kniha/ine.csv')
  check('and no other file', res.status === 404)

  // The client page says where the books stand; the booking form shows the entry as the books hold it
  res = await acc.get('/ucto/klienti/co-l')
  page = plain(await res.text())
  check('the client page has the books in short', page.includes('Účtovná kniha') && page.includes(`za rok ${y} doteraz`) && page.includes('/ucto/klienti/co-l/kniha'))
  res = await acc.get('/ucto/doklady/dl-in')
  page = plain(await res.text())
  check('the booking form shows the entry with the VAT account the books use', page.includes('343.100') && page.includes('321'), page.match(/entry__table[\s\S]{0,500}/)?.[0])

  // Firma A gets an internal document of this year, so that its download below holds the books.
  res = await acc.post('/ucto/klienti/co-a/kniha/interne', { datum: skDay(today), text: 'Zápis do knihy', md_0: '548', d_0: '325', suma_0: '1' })
  check("Firma A's books take an internal document", res.status === 303)
}

// ---------------------------------------------------------------------------------------------------------------
// Every client's deadlines on one screen: the VAT periods as the VAT page has them, one never filed, the
// recapitulative statement filed from the VAT page, corrected and taken back, the client's documents, the closing of
// last year, a mark of what the app does not file itself
// ---------------------------------------------------------------------------------------------------------------
{
  const plain = (text) => text.replace(/\u00a0/g, ' ')
  const MONTHS = ['január', 'február', 'marec', 'apríl', 'máj', 'jún', 'júl', 'august', 'september', 'október', 'november', 'december']
  const monthBack = (n) => {
    const d = new Date(`${day(0).slice(0, 7)}-15T12:00:00Z`)
    d.setUTCMonth(d.getUTCMonth() - n)
    return d.toISOString().slice(0, 7)
  }
  const nameOf = (month) => `${MONTHS[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`
  /** The rows of the screen, each as its text, with the client's name in it. */
  const rowsOf = (html) => [...html.matchAll(/<li class="due[^"]*">([\s\S]*?)<\/li>/g)].map((m) => plain(m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')))
  const rowOf = (html, ...words) => rowsOf(html).find((r) => words.every((w) => r.includes(w)))
  const last = monthBack(1)
  const year = Number(day(0).slice(0, 4))
  const at = Math.floor(Date.parse(`${last}-12T10:00:00Z`) / 1000)
  await db.batch([
    db
      .prepare(
        "INSERT INTO companies (id, created_at, name, ico, address, vat_payer, plan, inbox, accountant_id, start_on, icdph, tax_office) VALUES ('co-t', ?, 'Termíny s. r. o.', '50999992', 'Hlavná 10, 040 01 Košice', 1, 'rast', 'terminy1', ?, ?, 'SK2120999992', 'Košice')",
      )
      .bind(nowS, lucia?.id ?? '', `${monthBack(6)}-01`),
    db
      .prepare("INSERT INTO companies (id, created_at, name, ico, vat_payer, plan, inbox, accountant_id, start_on) VALUES ('co-t2', ?, 'Závierka s. r. o.', '50999993', 0, 'start', 'terminy2', ?, ?)")
      .bind(nowS, lucia?.id ?? '', `${year - 1}-01-01`),
    // Every month of ours filed but the fifth one back, which the screen works out no more: it is overdue as it is.
    ...[6, 4, 3, 2].map((n) =>
      db
        .prepare("INSERT INTO vat_returns (company_id, period, filed_at, filed_on, filed_by, rows, kv_rows, pay_cents, refund_cents, due_on, kind) VALUES ('co-t', ?, ?, ?, ?, '{}', 0, 0, 0, ?, 'R')")
        .bind(monthBack(n), nowS, day(-1), lucia?.id ?? '', day(-1)),
    ),
    // Last month: an invoice issued at home and a service supplied to Germany, both booked, and a payment without a document.
    db
      .prepare(
        "INSERT INTO documents (id, company_id, created_at, source, status, read_by, kind, party, party_ico, number, vs, issued_on, total_cents, vat_cents, currency, category, booked_at, booked_by) VALUES ('t-out', 'co-t', ?, 'upload', 'read', 'test', 'invoice_out', 'Odberateľ s. r. o.', '12345679', '2026T01', '2026T01', ?, 12300, 2300, 'EUR', 'sales', ?, ?)",
      )
      .bind(at, `${last}-12`, at, lucia?.id ?? ''),
    db
      .prepare(
        `INSERT INTO documents (id, company_id, created_at, source, status, read_by, kind, party, party_vat_id, number, issued_on, total_cents, vat_cents, currency, category, booked_at, booked_by, vat_mode, vat_lines)
         VALUES ('t-eu', 'co-t', ?, 'upload', 'read', 'test', 'invoice_out', 'Kunde GmbH', 'DE123456789', '2026T02', ?, 100000, 0, 'EUR', 'sales', ?, ?, 'eu_service', '[{"rate":0,"base":100000,"vat":0,"deduct":0}]')`,
      )
      .bind(at, `${last}-14`, at, lucia?.id ?? ''),
    db.prepare("INSERT INTO accounts (id, company_id, iban, ledger) VALUES ('acc-t', 'co-t', 'SK6809000000000999999992', '221.001')"),
    db
      .prepare("INSERT INTO payments (id, company_id, account_id, created_at, booked_on, amount_cents, party, ref) VALUES ('pt-1', 'co-t', 'acc-t', ?, ?, -4500, 'Papiernictvo', 't1')")
      .bind(nowS, `${last}-20`),
  ])

  res = await acc.get('/ucto')
  page = await res.text()
  check('the team finds its deadlines in the column', page.includes('href="/ucto/terminy"') && page.includes('Termíny'))
  res = await acc.get('/ucto/terminy')
  page = plain(await res.text())
  check('the screen of deadlines answers, without a script or a style of its own', res.status === 200 && !/<script>/.test(page) && !/ style=/i.test(page) && page.includes('Čo kedy podať.'))
  check(
    'last month is ready to be filed, as its VAT page says',
    Boolean(rowOf(page, 'Termíny s. r. o.', `DPH a kontrolný výkaz za ${nameOf(last)}`, 'Pripravené na podanie')),
    rowsOf(page).filter((r) => r.includes('Termíny s. r. o.')).join(' | '),
  )
  check('a month of ours never filed, older than the ones worked out, is overdue', Boolean(rowOf(page, 'Termíny s. r. o.', `DPH a kontrolný výkaz za ${nameOf(monthBack(5))}`, 'Nepodané', 'po termíne')))
  check('internal marks without receipts remain on the work queue', Boolean(rowOf(page, 'Termíny s. r. o.', `za ${nameOf(monthBack(3))}`, 'Prijatie nedoložené')))
  const sv = rowOf(page, 'Termíny s. r. o.', `Súhrnný výkaz za ${nameOf(last)}`)
  check('the service supplied to Germany asks for the recapitulative statement, ready, its file on the VAT page', Boolean(sv) && sv.includes('Pripravené na podanie') && !sv.includes('Označiť ako podané'), sv)
  check("the client's documents of last month, the client's to bring", Boolean(rowOf(page, 'Termíny s. r. o.', `Doklady za ${nameOf(last)}`, 'Chýba 1 doklad', 'Úloha klienta')))
  check(`the closing of ${year - 1} is ours: the books were ours at its end`, Boolean(rowOf(page, 'Závierka s. r. o.', `Účtovná závierka a daňové priznanie za rok ${year - 1}`, 'Pripraviť a podať')))
  check("the accountant sees her own clients' deadlines and nobody else's", !page.includes('Firma B s. r. o.'))
  check('each leads to where it is done', page.includes(`/ucto/klienti/co-t/dph?obdobie=${last}`) && page.includes(`/ucto/klienti/co-t/dph?obdobie=${last}#suhrnny`) && page.includes('/ucto/klienti/co-t#chyba'))
  res = await acc.get('/ucto/klienti/co-t')
  page = plain(await res.text())
  check("the client's page has its own deadlines", page.includes('id="terminy"') && Boolean(rowOf(page, `DPH a kontrolný výkaz za ${nameOf(last)}`, 'Pripravené na podanie')))

  res = await acc.get('/ucto/terminy?kto=my')
  page = plain(await res.text())
  check('ours alone: no documents of the client', !rowOf(page, 'Doklady za') && Boolean(rowOf(page, 'Termíny s. r. o.', 'DPH a kontrolný výkaz')))
  res = await acc.get('/ucto/terminy?kto=klient')
  page = plain(await res.text())
  check("the client's alone: no filing of ours", Boolean(rowOf(page, 'Doklady za')) && !rowOf(page, 'DPH a kontrolný výkaz'))

  // The recapitulative statement: its file from the VAT page, against the eForm's own schema, marked as filed
  const validXml = async (xml, schema) =>
    (await validateXML({ xml: [{ fileName: 'x.xml', contents: xml }], schema: [{ fileName: schema, contents: readFileSync(new URL(`./xsd/${schema}`, import.meta.url), 'utf8') }] })).valid
  const svPage = async () => plain(await (await acc.get(`/ucto/klienti/co-t/dph?obdobie=${last}`)).text())
  page = await svPage()
  check(
    "the VAT page has the period's recapitulative statement: the customer, the services' code, the value in whole euros",
    page.includes(`Súhrnný výkaz za ${nameOf(last)}`) && page.includes('DE 123456789') && page.includes('Služby (kód 2)') && page.includes('1 000 €') && page.includes('Uložiť podklady a otvoriť podania') && !page.includes('Stiahnuť súhrnný výkaz (XML)'),
  )
  res = await acc.get(`/ucto/klienti/co-t/dph/suhrnny-vykaz.xml?obdobie=${last}`)
  check('no file before its podklady are saved', res.status === 303 && (res.headers.get('location') ?? '').includes('ok=sv-ulozit'))
  res = await acc.post('/ucto/klienti/co-t/dph/suhrnny-vykaz/podane', { obdobie: last })
  const svFiled = await db.prepare("SELECT filed_on, data FROM filings WHERE company_id = 'co-t' AND kind = 'sv' AND period = ?").bind(last).first()
  check(
    'marked as filed with what its file held',
    res.status === 303 && (res.headers.get('location') ?? '').includes('/podania?obdobie=') && JSON.parse(svFiled?.data ?? '{}').rows?.[0]?.euros === 1000 && JSON.parse(svFiled?.data ?? '{}').kind === 'R',
    JSON.stringify(svFiled),
  )
  res = await acc.get(`/ucto/klienti/co-t/dph/suhrnny-vykaz.xml?obdobie=${last}`)
  let svXml = await res.text()
  check(
    "its file, as the eForm writes it and valid against the eForm's schema",
    res.status === 200 &&
      (res.headers.get('content-disposition') ?? '').includes(`SVDPH_SK2120999992_${last}.xml`) &&
      svXml.includes('<zaznam><kodStatu>DE</kodStatu><idCislo>123456789</idCislo><hodnota>1000</hodnota><kod>2</kod></zaznam>') &&
      svXml.includes('<celkovaHodnota>1000</celkovaHodnota>') &&
      (await validXml(svXml, 'svdph2020.xsd')),
  )
  res = await acc.post('/ucto/klienti/co-t/dph/suhrnny-vykaz/podane', { obdobie: last })
  check('marked again, it stays one', (res.headers.get('location') ?? '').includes('ok=sv-uz') && (await db.prepare("SELECT COUNT(*) AS n FROM events WHERE company_id = 'co-t' AND action = 'vat.summary.filed'").first())?.n === 1)
  res = await acc.get(`/ucto/klienti/co-t/dph/suhrnny-vykaz.xml?obdobie=${last}`)
  check('the file of a statement filed is the one that was filed', res.status === 200 && (await res.text()).includes('<riadny>1</riadny>'))
  check('a period without supplies to the EU shows no statement', !plain(await (await acc.get(`/ucto/klienti/co-t/dph?obdobie=${monthBack(2)}`)).text()).includes('Súhrnný výkaz za'))
  res = await acc.get('/ucto/terminy')
  page = plain(await res.text())
  check('a prepared summary remains open until its receipt is recorded', Boolean(rowOf(page, 'Súhrnný výkaz za', 'Podklady pripravené')))
  res = await acc.get('/ucto/terminy?hotove=1')
  page = plain(await res.text())
  check('a prepared summary is never shown as accepted', !rowOf(page, 'Termíny s. r. o.', `Súhrnný výkaz za ${nameOf(last)}`)?.includes('Prijatie podateľňou doložené'))

  // Compatibility fixture: the old manually recorded statement predates receipt IDs.
  await db.prepare("UPDATE filings SET data = json_remove(data, '$.file.attemptId') WHERE company_id = 'co-t' AND kind = 'sv' AND period = ?").bind(last).run()

  // The invoice changed after the filing: a corrective statement before the deadline, a supplementary one after it
  await db.prepare(`UPDATE documents SET vat_lines = '[{"rate":0,"base":120000,"vat":0,"deduct":0}]' WHERE id = 't-eu'`).run()
  page = await svPage()
  const fix = page.includes('opravný súhrnný výkaz so všetkými riadkami') ? 'O' : page.includes('dodatočný súhrnný výkaz obsahuje len riadky') ? 'D' : null
  check('changed after it was filed, the page says so and offers the correction', page.includes('Zmenené po uložení') && fix !== null && page.includes('Uložiť opravené podklady'))
  res = await acc.get('/ucto/terminy')
  page = plain(await res.text())
  check('so does the screen of deadlines', Boolean(rowOf(page, 'Termíny s. r. o.', `${fix === 'O' ? 'Opravný' : 'Dodatočný'} súhrnný výkaz za ${nameOf(last)}`)))
  res = await acc.get(`/ucto/klienti/co-t/dph/suhrnny-vykaz.xml?obdobie=${last}`)
  check('nor before the correction\'s', res.status === 303 && (res.headers.get('location') ?? '').includes('ok=sv-ulozit'))
  res = await acc.post('/ucto/klienti/co-t/dph/suhrnny-vykaz/podane', { obdobie: last })
  const corrected = JSON.parse((await db.prepare("SELECT data FROM filings WHERE company_id = 'co-t' AND kind = 'sv' AND period = ?").bind(last).first())?.data ?? '{}')
  check('the correction marked, over the statement it corrects', (res.headers.get('location') ?? '').includes('/podania?obdobie=') && corrected.kind === fix && corrected.rows?.[0]?.euros === 1200 && corrected.prev?.rows?.[0]?.euros === 1000)
  res = await acc.get(`/ucto/klienti/co-t/dph/suhrnny-vykaz.xml?obdobie=${last}`)
  svXml = await res.text()
  check(
    'the correction: its kind, the row with its right value, valid',
    (res.headers.get('content-disposition') ?? '').includes(`SVDPH_${fix}_SK2120999992_${last}.xml`) &&
      svXml.includes(fix === 'O' ? '<opravny>1</opravny>' : '<dodatocny>1</dodatocny>') &&
      svXml.includes('<hodnota>1200</hodnota>') &&
      (await validXml(svXml, 'svdph2020.xsd')),
  )
  page = await svPage()
  check('prepared again as the books stand, with a safe reopen action', page.includes(fix === 'O' ? 'Opravné podklady uložené' : 'Dodatočné podklady uložené') && page.includes('Znovu otvoriť neodoslané alebo odmietnuté podklady'))
  res = await acc.post('/ucto/klienti/co-t/dph/suhrnny-vykaz/zrusit', { obdobie: last })
  const back = JSON.parse((await db.prepare("SELECT data FROM filings WHERE company_id = 'co-t' AND kind = 'sv' AND period = ?").bind(last).first())?.data ?? '{}')
  check('the correction taken back gives way to the statement it corrected', back.kind === 'R' && back.rows?.[0]?.euros === 1000 && back.prev === null && (await svPage()).includes('Zmenené po uložení'))
  res = await acc.post('/ucto/klienti/co-t/dph/suhrnny-vykaz/zrusit', { obdobie: last })
  check('and that taken back, nothing is filed', (await db.prepare("SELECT COUNT(*) AS n FROM filings WHERE company_id = 'co-t' AND kind = 'sv'").first())?.n === 0 && (await svPage()).includes('Pripravený'))
  await db.prepare(`UPDATE documents SET vat_lines = '[{"rate":0,"base":100000,"vat":0,"deduct":0}]' WHERE id = 't-eu'`).run()
  res = await acc.post('/ucto/klienti/co-t/dph/suhrnny-vykaz/podane', { obdobie: day(0).slice(0, 7) })
  check('a period without supplies to the EU has no statement to mark', (res.headers.get('location') ?? '').includes('ok=sv-netreba') && (await db.prepare("SELECT COUNT(*) AS n FROM filings WHERE company_id = 'co-t'").first())?.n === 0)
  res = await acc.post('/ucto/klienti/co-b/dph/suhrnny-vykaz/podane', { obdobie: last })
  check("nor a statement of a client that is not hers", res.status === 404)

  // A month's payroll reports marked by hand before they were filed recipient by recipient: no new mark, an old one taken back
  res = await acc.post('/ucto/klienti/co-t/podane', { druh: 'mz', obdobie: last, spat: '/ucto/terminy?kto=my' })
  check('no new manual mark is made: one mark never proved all of a month\'s reports', res.status === 400 && (await db.prepare("SELECT COUNT(*) AS n FROM filings WHERE company_id = 'co-t' AND kind = 'mz'").first())?.n === 0)
  await db.prepare("INSERT INTO filings (company_id, kind, period, filed_on, filed_at, filed_by) VALUES ('co-t', 'mz', ?, ?, ?, ?)").bind(last, day(0), nowS, lucia.id).run()
  res = await acc.post('/ucto/klienti/co-t/podane', { druh: 'mz', obdobie: last, zrusit: '1', spat: 'https://evil.example/' })
  check(
    'an old mark is taken back, on record; a way back to elsewhere is not followed',
    res.headers.get('location') === '/ucto/terminy?ok=neoznacene' &&
      (await db.prepare("SELECT COUNT(*) AS n FROM filings WHERE company_id = 'co-t'").first())?.n === 0 &&
      (await db.prepare("SELECT COUNT(*) AS n FROM events WHERE company_id = 'co-t' AND action = 'filing.unmarked'").first())?.n === 1,
  )
  res = await acc.post('/ucto/klienti/co-t/podane', { druh: 'mz', obdobie: day(0).slice(0, 7) })
  check('a month that has not ended cannot be marked', res.status === 400)
  res = await acc.post('/ucto/klienti/co-t/podane', { druh: 'priznanie', obdobie: last })
  check('nor anything but what the app does not file itself', res.status === 400)
  res = await acc.post('/ucto/klienti/co-t/podane', { druh: 'sv', obdobie: last })
  check('nor the recapitulative statement, which the VAT page marks with what was filed', res.status === 400)
  res = await acc.post('/ucto/klienti/co-t/podane', { druh: 'closing', obdobie: String(year - 1) })
  check('nor the closing, which its own page marks', res.status === 400)
  res = await acc.post('/ucto/klienti/co-b/podane', { druh: 'mz', obdobie: last })
  check("nor anything of a client that is not hers", res.status === 404)
  res = await mf.dispatchFetch(`${site}/ucto/klienti/co-t/podane`, {
    method: 'POST',
    body: `druh=mz&obdobie=${last}`,
    redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded', origin: 'https://evil.example', cookie: luc.cookie, 'cf-connecting-ip': '203.0.113.30' },
  })
  check('nor from another site', res.status === 403 && (await db.prepare("SELECT COUNT(*) AS n FROM filings WHERE company_id = 'co-t'").first())?.n === 0)
  res = await acc.get('/ucto/terminy')
  check('the closing leads to its page', plain(await res.text()).includes(`/ucto/klienti/co-t2/zavierka?rok=${year - 1}`))
  await db.prepare('INSERT INTO closings (company_id, year, filed_on, filed_at, filed_by, pay_cents, due_on) VALUES (?, ?, ?, ?, ?, 0, ?)').bind('co-t2', year - 1, day(0), nowS, lucia?.id ?? '', day(0)).run()
  res = await acc.get('/ucto/terminy')
  page = plain(await res.text())
  check('an old closing without receipt remains open', res.status === 200 && Boolean(rowOf(page, 'Závierka s. r. o.', 'Prijatie nedoložené')))

  // The administrator sees everybody's, and chooses an accountant's.
  res = await admin.get('/ucto/terminy')
  page = plain(await res.text())
  check('the administrator sees every client, with its accountant', Boolean(rowOf(page, 'Termíny s. r. o.', 'Lucia Horváthová')))
  check("on a phone, the place that does not fit the administrator's five tabs is in the bar's menu", page.includes('<a class="barmenu__item" href="/ucto/tim"'))
  res = await admin.get(`/ucto/terminy?uctovnicka=${lucia?.id}`)
  check("one accountant's clients", Boolean(rowOf(plain(await res.text()), 'Termíny s. r. o.')))
  res = await admin.get('/ucto/terminy?uctovnicka=none')
  check('the clients of nobody', res.status === 200 && !rowOf(plain(await res.text()), 'Termíny s. r. o.'))
  res = await acc.get('/ucto/terminy?uctovnicka=none')
  check('an accountant sees her own whatever the address says', Boolean(rowOf(plain(await res.text()), 'Termíny s. r. o.')))
  res = await anna.get('/ucto/terminy')
  check('a client gets nothing there', res.status === 404)

  // What this part made goes, so that what follows finds things as before.
  await db.batch([
    db.prepare("DELETE FROM documents WHERE company_id IN ('co-t', 'co-t2')"),
    db.prepare("DELETE FROM payments WHERE company_id IN ('co-t', 'co-t2')"),
    db.prepare("DELETE FROM accounts WHERE company_id IN ('co-t', 'co-t2')"),
    db.prepare("DELETE FROM vat_returns WHERE company_id IN ('co-t', 'co-t2')"),
    db.prepare("DELETE FROM filings WHERE company_id IN ('co-t', 'co-t2')"),
    db.prepare("DELETE FROM closings WHERE company_id IN ('co-t', 'co-t2')"),
    // Isolated fixture disposal follows the controlled retention boundary after its prepared sources were removed.
    db.prepare("UPDATE companies SET purge_started_at = ? WHERE id IN ('co-t', 'co-t2')").bind(nowS),
    db.prepare("DELETE FROM filing_events WHERE company_id IN ('co-t', 'co-t2')"),
    db.prepare("DELETE FROM filing_packages WHERE company_id IN ('co-t', 'co-t2')"),
    db.prepare("DELETE FROM companies WHERE id IN ('co-t', 'co-t2')"),
  ])
}

// ---------------------------------------------------------------------------------------------------------------
// Monthly recapitulative statements of a quarterly VAT payer, including late reclassification of a filed quarter.
{
  const date = new Date(`${day(0)}T12:00:00Z`)
  const first = new Date(Date.UTC(date.getUTCFullYear(), Math.floor(date.getUTCMonth() / 3) * 3 - 6, 1))
  const y = first.getUTCFullYear()
  const months = [0, 1, 2].map((i) => `${y}-${String(first.getUTCMonth() + i + 1).padStart(2, '0')}`)
  const quarter = `${y}-Q${Math.floor(first.getUTCMonth() / 3) + 1}`
  const base = '/ucto/klienti/co-sv/dph'
  const plain = (s) => s.replace(/\u00a0/g, ' ')
  await db.prepare("INSERT INTO companies (id, created_at, name, ico, dic, icdph, address, vat_payer, vat_quarterly, vat_since, tax_office, plan, inbox, accountant_id, start_on) VALUES ('co-sv', ?, 'Mesačné výkazy s. r. o.', '50999993', '2120999993', 'SK2120999993', 'Hlavná 10, 040 01 Košice', 1, 1, ?, 'Košice', 'rast', 'suhrnny1', ?, ?)").bind(nowS, `${months[0]}-01`, lucia.id, `${months[0]}-01`).run()
  const amounts = [3000000, 2500000, 100000]
  for (let i = 0; i < 3; i++) await db.prepare(`INSERT INTO documents (id, company_id, created_at, source, status, kind, party, number, issued_on, supplied_on, total_cents, vat_cents, currency, category, booked_at, vat_mode, vat_lines, party_vat_id, vat_period)
    VALUES (?, 'co-sv', ?, 'web', 'read', 'invoice_out', 'EU Kunde', ?, ?, ?, ?, 0, 'EUR', 'sales', ?, ?, ?, 'CZ12345678', ?)`)
    .bind(`sv-${i}`, nowS, `SV-${i}`, `${months[i]}-15`, `${months[i]}-15`, amounts[i], nowS, i < 2 ? 'eu_goods' : 'eu_service', JSON.stringify([{ rate: 0, base: amounts[i], vat: 0, deduct: 0 }]), quarter).run()
  res = await acc.get(`${base}?obdobie=${quarter}`)
  let html = await res.text()
  check('a quarterly VAT page shows three monthly SV cards and submits each actual month', res.status === 200 && months.every((m) => html.includes(`id="suhrnny-${m}"`) && html.includes(`name="obdobie" value="${m}"`)) && plain(html).includes('Priznanie DPH zostáva štvrťročné'))
  if (process.env.FIRMONY_CAPTURE_DIR) writeFileSync(`${process.env.FIRMONY_CAPTURE_DIR}/monthly-sv.html`, html)
  const valid = async (xml) => (await validateXML({ xml: [{ fileName: 'sv.xml', contents: xml }], schema: [{ fileName: 'sv.xsd', contents: readFileSync(new URL('./xsd/svdph2020.xsd', import.meta.url), 'utf8') }] })).valid
  res = await acc.get(`${base}/suhrnny-vykaz.xml?obdobie=${months[0]}`)
  check('a monthly SV has no file before its podklady are saved', res.status === 303 && res.headers.get('location').includes('sv-ulozit'))
  res = await acc.post(`${base}/suhrnny-vykaz/podane`, { obdobie: quarter })
  check('posting the old quarterly SV period cannot create an invalid filing', res.headers.get('location').includes('sv-blokovane') && (await db.prepare("SELECT COUNT(*) AS n FROM filings WHERE company_id = 'co-sv'").first()).n === 0)
  res = await acc.get(`${base}/priznanie.xml?obdobie=${quarter}`)
  check('the VAT return itself stays one for the whole quarter, waiting for its podklady', res.status === 303 && res.headers.get('location')?.includes(`obdobie=${quarter}`) && res.headers.get('location')?.includes('dph-ulozit'), JSON.stringify({ status: res.status, location: res.headers.get('location') }))
  res = await acc.get('/ucto/terminy')
  html = await res.text()
  check('deadlines point a monthly SV to its card inside the quarterly VAT page', html.includes(`obdobie=${quarter}#suhrnny-${months[0]}`))
  for (const month of months) await acc.post(`${base}/suhrnny-vykaz/podane`, { obdobie: month })
  const originals = []
  for (let i = 0; i < 3; i++) {
    res = await acc.get(`${base}/suhrnny-vykaz.xml?obdobie=${months[i]}`)
    const xml = await res.text(); originals.push(xml)
    check(`monthly XML ${months[i]} contains only its month, with the schema and monthly filename`, res.status === 200 && res.headers.get('content-disposition').includes(months[i]) && xml.includes(`<mesiac>${Number(months[i].slice(-2))}</mesiac><stvrtrok></stvrtrok>`) && xml.includes(`<hodnota>${amounts[i] / 100}</hodnota>`) && await valid(xml))
  }
  let rows = await db.prepare("SELECT * FROM filings WHERE company_id = 'co-sv' AND kind = 'sv' ORDER BY period").all()
  check('three months are filed separately, and each file downloaded is its exact XML snapshot with its SHA-256', rows.results.length === 3 && rows.results.every((r, i) => { const f = JSON.parse(r.data).file; return r.period === months[i] && f.xml === originals[i] && f.sha256 === createHash('sha256').update(f.xml).digest('hex') }))
  await db.prepare("UPDATE companies SET name = 'Nový názov firmy' WHERE id = 'co-sv'").run()
  res = await acc.get(`${base}/suhrnny-vykaz.xml?obdobie=${months[0]}&povodne=1`)
  check('a filed monthly SV replays its original bytes even after filer details change', res.status === 200 && await res.text() === originals[0])
  // The following arithmetic cases model imported legacy filings. These prepared fixtures have not been sent:
  // preserve their immutable package history, but make the legacy source explicit instead of inventing receipts.
  await db.prepare("UPDATE filings SET data = json_remove(data, '$.file.attemptId') WHERE company_id = 'co-sv'").run()
  await db.prepare("UPDATE documents SET vat_lines = ? WHERE id = 'sv-0'").bind(JSON.stringify([{ rate: 0, base: 3100000, vat: 0, deduct: 0 }])).run()
  await acc.post(`${base}/suhrnny-vykaz/podane`, { obdobie: months[0] })
  res = await acc.get(`${base}/suhrnny-vykaz.xml?obdobie=${months[0]}`)
  const correctedXml = await res.text()
  check('a changed monthly SV prepares a valid supplementary file for only the changed month', res.status === 200 && correctedXml.includes('<dodatocny>1</dodatocny>') && correctedXml.includes('<hodnota>31000</hodnota>') && await valid(correctedXml))
  let latest = await db.prepare("SELECT * FROM filings WHERE company_id = 'co-sv' AND period = ?").bind(months[0]).first()
  check('monthly correction preserves the prior original snapshot', JSON.parse(latest.data).prev.file.xml === originals[0])
  await db.prepare("UPDATE filings SET data = json_remove(data, '$.file.attemptId') WHERE company_id = 'co-sv' AND period = ?").bind(months[0]).run()
  // Two corrections prepared from the very same data revision, even within one second.
  await db.prepare("UPDATE documents SET vat_lines = ? WHERE id = 'sv-0'").bind(JSON.stringify([{ rate: 0, base: 3200000, vat: 0, deduct: 0 }])).run()
  const company = companyOf(await db.prepare("SELECT * FROM companies WHERE id = 'co-sv'").first())
  const documents = await docsAround(db, 'co-sv', `${y - 1}-Q${quarter.slice(-1)}`, quarter)
  const revision = await dataRevision(db, 'co-sv')
  const view = svViewsOf(company, quarter, documents, await summariesFiled(db, 'co-sv'), day(0)).views[0]
  const xml = summaryXml({ name: company.name, icdph: company.icdph, address: company.address }, months[0], view.plan.rows, view.plan.kind, day(0))
  const file = { name: `SVDPH_D_SK2120999993_${months[0]}.xml`, xml, sha256: createHash('sha256').update(xml).digest('hex') }
  const competing = await Promise.all([0, 1].map(() => db.batch([fileSummaryStatement(db, 'co-sv', view, view.plan, lucia.id, day(0), file, revision)])))
  check('same-revision monthly corrections accept exactly one write without losing the prior chain', competing.filter((r) => r[0].meta.changes > 0).length === 1 && JSON.parse((await db.prepare("SELECT data FROM filings WHERE company_id = 'co-sv' AND period = ?").bind(months[0]).first()).data).prev.prev.file.xml === originals[0])
  res = await anna.get(`${base}?obdobie=${quarter}`)
  check('a client cannot access the monthly SV workflow', res.status === 404)
  res = await acc.post(`${base}/suhrnny-vykaz/podane`, { obdobie: '2026-99' })
  check('an invalid SV month is refused instead of silently filing another period', res.status === 400)
  // A quarter was already filed before omitted goods were discovered: reclassify it, do not duplicate its last month.
  await db.prepare("DELETE FROM filings WHERE company_id = 'co-sv'").run()
  await db.prepare("UPDATE documents SET vat_lines = ? WHERE id = 'sv-0'").bind(JSON.stringify([{ rate: 0, base: 3000000, vat: 0, deduct: 0 }])).run()
  await db.prepare("UPDATE documents SET vat_lines = ? WHERE id = 'sv-1'").bind(JSON.stringify([{ rate: 0, base: 1500000, vat: 0, deduct: 0 }])).run()
  await acc.post(`${base}/suhrnny-vykaz/podane`, { obdobie: quarter })
  const quarterFiled = JSON.parse((await db.prepare("SELECT data FROM filings WHERE company_id = 'co-sv' AND period = ?").bind(quarter).first()).data)
  await db.prepare("UPDATE filings SET data = json_remove(data, '$.file.attemptId') WHERE company_id = 'co-sv' AND period = ?").bind(quarter).run()
  await db.prepare("UPDATE documents SET vat_lines = ? WHERE id = 'sv-1'").bind(JSON.stringify([{ rate: 0, base: 2500000, vat: 0, deduct: 0 }])).run()
  res = await acc.get(`${base}?obdobie=${quarter}`); html = await res.text()
  check('a newly required monthly sequence explains how to reclassify the already filed quarter', plain(html).includes('Zaradiť podaný výkaz k poslednému mesiacu'))
  if (process.env.FIRMONY_CAPTURE_DIR) writeFileSync(`${process.env.FIRMONY_CAPTURE_DIR}/monthly-sv-transition.html`, html)
  await acc.post(`${base}/suhrnny-vykaz/podane`, { obdobie: months[2] })
  check('a regular last-month filing is blocked while a filed quarter already represents it', (await db.prepare("SELECT COUNT(*) AS n FROM filings WHERE company_id = 'co-sv' AND period = ?").bind(months[2]).first()).n === 0)
  await acc.post(`${base}/suhrnny-vykaz/obdobie`, { obdobie: quarter })
  latest = await db.prepare("SELECT * FROM filings WHERE company_id = 'co-sv' AND period = ?").bind(months[2]).first()
  check('reclassification keeps the original quarter XML, source period and filing history', latest && JSON.parse(latest.data).sourcePeriod === quarter && JSON.parse(latest.data).file.xml === quarterFiled.file.xml && (await db.prepare("SELECT COUNT(*) AS n FROM filing_history WHERE company_id = 'co-sv' AND period = ?").bind(quarter).first()).n > 0 && (await db.prepare("SELECT COUNT(*) AS n FROM filings WHERE company_id = 'co-sv' AND period = ?").bind(quarter).first()).n === 0)
  await acc.post(`${base}/suhrnny-vykaz/podane`, { obdobie: months[2] })
  res = await acc.get(`${base}/suhrnny-vykaz.xml?obdobie=${months[2]}`)
  const lastCorrection = await res.text()
  check('the last-month supplementary file cancels supplies belonging to earlier months', res.status === 200 && lastCorrection.includes('<dodatocny>1</dodatocny>') && lastCorrection.includes('<hodnota>0</hodnota>') && await valid(lastCorrection))
  latest = await db.prepare("SELECT * FROM filings WHERE company_id = 'co-sv' AND period = ?").bind(months[2]).first()
  check('the last-month correction retains the reclassified original in its chain', JSON.parse(latest.data).prev.file.xml === quarterFiled.file.xml && JSON.parse(latest.data).prev.sourcePeriod === quarter)
  const exported = await exportYear({ DB: db, FILES: files }, company, String(y), null, day(0))
  const contents = unzip(new Uint8Array(await new Response(exported.body).arrayBuffer()))
  check('the annual handover includes current SV XML and the original filed quarter from history', contents.some((f) => f.name.startsWith('podania/sv/') && new TextDecoder().decode(f.data) === quarterFiled.file.xml) && contents.some((f) => f.name === 'data/historia-podani.json'))
  const currentFirst = Math.floor(date.getUTCMonth() / 3) * 3 + 1
  const activeMonth = `${date.getUTCFullYear()}-${String(currentFirst).padStart(2, '0')}`
  const inQuarter = `${date.getUTCFullYear()}-Q${Math.ceil(currentFirst / 3)}`
  const nextMonth = `${date.getUTCFullYear()}-${String(currentFirst + 1).padStart(2, '0')}-15`
  await db.prepare(`INSERT INTO documents (id, company_id, created_at, source, status, kind, number, issued_on, supplied_on, total_cents, vat_cents, currency, category, booked_at, vat_mode, vat_lines, party_vat_id, vat_period)
    VALUES ('sv-current', 'co-sv', ?, 'web', 'read', 'invoice_out', 'SV-CURRENT', ?, ?, 10000, 0, 'EUR', 'sales', ?, 'eu_service', '[{"rate":0,"base":10000,"vat":0,"deduct":0}]', 'CZ12345678', ?)`).bind(nowS, `${activeMonth}-10`, `${activeMonth}-10`, nowS, inQuarter).run()
  const due = await teamDeadlines(db, { ...lucia, team: 'accountant' }, false, nextMonth, { company: 'co-sv' })
  check('the real deadline loader includes a completed monthly SV inside the VAT quarter still running', due.dues.some((d) => d.kind === 'summary' && d.period === activeMonth && d.state === 'ready'), JSON.stringify(due.dues.map((d) => ({ kind: d.kind, period: d.period, state: d.state }))))
  await db.batch([
    db.prepare("DELETE FROM filings WHERE company_id = 'co-sv'"), db.prepare("DELETE FROM filing_history WHERE company_id = 'co-sv'"),
    db.prepare("UPDATE companies SET purge_started_at = ? WHERE id = 'co-sv'").bind(nowS),
    db.prepare("DELETE FROM filing_events WHERE company_id = 'co-sv'"), db.prepare("DELETE FROM filing_packages WHERE company_id = 'co-sv'"),
    db.prepare("DELETE FROM documents WHERE company_id = 'co-sv'"), db.prepare("DELETE FROM companies WHERE id = 'co-sv'"), db.prepare("DELETE FROM company_data_revisions WHERE company_id = 'co-sv'"),
  ])
}

// The closing of last year: the statements and the return from the books, what keeps them back, the accountant's
// adjustments, the tax booked, the files against the official schemas, a deadline moved by a notice, the mark that
// they were filed with what the client reads and pays, and the mark taken back
// ---------------------------------------------------------------------------------------------------------------
{
  const plain = (text) => text.replace(/\u00a0/g, ' ')
  const validXml = async (xml, schema) =>
    (await validateXML({ xml: [{ fileName: 'x.xml', contents: xml }], schema: [{ fileName: schema, contents: readFileSync(new URL(`./xsd/${schema}`, import.meta.url), 'utf8') }] })).valid
  const Y = Number(day(0).slice(0, 4)) - 1
  const base = '/ucto/klienti/co-k/zavierka'
  let seq = 0
  const entry = (on, md, d, cents) =>
    db
      .prepare("INSERT INTO ledger_entries (id, company_id, kind, year, seq, number, on_date, text, lines, created_at, created_by) VALUES (?, 'co-k', 'internal', ?, ?, ?, ?, 'Test', ?, ?, ?)")
      .bind(`k-e${++seq}`, Y, seq, `ID-${Y}-9${String(seq).padStart(2, '0')}`, on, JSON.stringify([{ md, d, cents }]), nowS, lucia?.id ?? '')
  // A year of a young company: capital paid in, a sale paid, services paid, representation, and an advance on the income tax paid to its account.
  await db.batch([
    db
      .prepare(
        "INSERT INTO companies (id, created_at, name, ico, dic, address, register_line, vat_payer, plan, inbox, accountant_id, start_on, tax_account) VALUES ('co-k', ?, 'Závierková s. r. o.', '50999994', '2120999994', 'Hlavná 12, 040 01 Košice', 'Obchodný register Okresného súdu Košice I, oddiel Sro, vložka č. 99999/V', 0, 'start', 'zavierka1', ?, ?, '1234567890')",
      )
      .bind(nowS, lucia?.id ?? '', `${Y}-01-01`),
    db.prepare("INSERT INTO accounts (id, company_id, iban, ledger) VALUES ('acc-k', 'co-k', 'SK6809000000000999999994', '221.001')"),
    db.prepare("INSERT INTO users (id, created_at, email, name) VALUES ('u-k', ?, 'jana@zavierkova.test', 'Jana Závierková')").bind(nowS),
    db.prepare("INSERT INTO members (company_id, user_id, role, created_at) VALUES ('co-k', 'u-k', 'owner', ?)").bind(nowS),
    entry(`${Y}-01-02`, '353', '411', 500000),
    entry(`${Y}-01-05`, '221.001', '353', 500000),
    entry(`${Y}-03-10`, '311', '602', 4000000),
    entry(`${Y}-03-20`, '221.001', '311', 4000000),
    entry(`${Y}-04-05`, '518', '321', 1500000),
    entry(`${Y}-04-20`, '321', '221.001', 1500000),
    entry(`${Y}-05-01`, '513', '221.001', 20000),
    db
      .prepare(
        "INSERT INTO payments (id, company_id, account_id, created_at, booked_on, amount_cents, party, party_iban, vs, exempt, ref) VALUES ('pk-1', 'co-k', 'acc-k', ?, ?, -50000, 'Daňový úrad', 'SK1281805002240123456789', ?, 'state', 'k1')",
      )
      .bind(nowS, `${Y}-06-15`, `110006${Y}`),
    // VAT shares an advance's symbol, not its account: it is no advance.
    db
      .prepare(
        "INSERT INTO payments (id, company_id, account_id, created_at, booked_on, amount_cents, party, party_iban, vs, exempt, ref) VALUES ('pk-0', 'co-k', 'acc-k', ?, ?, -30000, 'Daňový úrad', 'SK2581805002400123456789', ?, 'state', 'k0')",
      )
      .bind(nowS, `${Y}-04-25`, `110003${Y}`),
  ])

  res = await acc.get('/ucto/klienti/co-k')
  check("the client's page leads to the closing", (await res.text()).includes(`href="${base}"`))
  res = await acc.get(base)
  page = plain(await res.text())
  check('the closing page answers with last year, without a script or a style of its own', res.status === 200 && !/<script>/.test(page) && !/ style=/i.test(page) && page.includes(`za rok ${Y}`))
  check(
    'the return from the books: the result, representation, the advance the bank shows, 10 %',
    page.includes('24 800,00 €') && page.includes('200,00 €') && page.includes('Zaplatené preddavky') && page.includes('500,00 €') && page.includes('10 %'),
  )
  check(
    'the statements in whole euros: the bank, the advance and the VAT paid as receivables, the capital',
    page.includes('<td class="num">29 000</td>') && page.includes('<td class="num">800</td>') && page.includes('<td class="num">29 800</td>') && page.includes('<td class="num">5 000</td>') && page.includes('Výkaz ziskov a strát'),
  )
  check('what keeps it back: the activity, the tax not booked', page.includes('Doplňte SK NACE hlavnej činnosti') && page.includes('nie je zaúčtovaná ako vyšla') && page.includes('Treba vyriešiť'))
  res = await acc.get(`${base}/priznanie.xml?rok=${Y}`)
  check('no file while something keeps it back', res.status === 303 && res.headers.get('location') === `${base}?rok=${Y}&ok=zavierka-blokovane`)
  res = await acc.post(`${base}/podane`, { rok: String(Y) })
  check('nor can it be marked as filed', res.headers.get('location') === `${base}?rok=${Y}&ok=zavierka-blokovane` && !(await db.prepare("SELECT 1 AS x FROM closings WHERE company_id = 'co-k'").first()))

  // The adjustments
  const form = { rok: String(Y), a06: '200,00', a16: '100', zdanitelne: '40000,00', mikro: '1', od: `1. 1. ${Y}`, preddavky: '500,00', nace: '62.01', cinnost: 'Počítačové programovanie' }
  res = await acc.post(base, form)
  page = plain(await res.text())
  check('a code that is no SK NACE is said, and nothing is kept', res.status === 422 && page.includes('SK NACE napíšte ako 62.01.0.') && !(await db.prepare("SELECT 1 AS x FROM closings WHERE company_id = 'co-k'").first()))
  res = await acc.post(base, { ...form, nace: '62.01.0' })
  let row = await db.prepare("SELECT * FROM closings WHERE company_id = 'co-k' AND year = ?").bind(Y).first()
  let inputs = JSON.parse(row?.inputs ?? '{}')
  check(
    "kept: what differs from the books' proposal, not what equals it",
    res.status === 303 && res.headers.get('location') === `${base}?rok=${Y}&ok=zavierka-ulozene#dan` && inputs.tableA?.a16 === 10000 && inputs.tableA?.a06 === undefined && inputs.nace === '62.01.0' && inputs.advances === null,
    row?.inputs,
  )
  res = await acc.get(`${base}?rok=${Y}`)
  page = plain(await res.text())
  check('recomputed: 300 € that are no tax expenses, a base of 25 100 €, a tax of 2 510 €, 2 010 € to pay', page.includes('300,00 €') && page.includes('25 100,00 €') && page.includes('2 510,00 €') && page.includes('2 010,00 €'))

  // The tax booked
  res = await acc.post(`${base}/dan`, { rok: String(Y) })
  const taxEntry = await db.prepare("SELECT * FROM ledger_entries WHERE company_id = 'co-k' AND text LIKE 'Daň z príjmov%' AND deleted_at IS NULL").first()
  row = await db.prepare("SELECT * FROM closings WHERE company_id = 'co-k' AND year = ?").bind(Y).first()
  check(
    'the tax booked by an internal document on the last day of the year: 591 against 341',
    res.status === 303 && taxEntry?.on_date === `${Y}-12-31` && JSON.parse(taxEntry?.lines ?? '[]')[0]?.md === '591' && JSON.parse(taxEntry?.lines ?? '[]')[0]?.cents === 251000 && row?.tax_entry === taxEntry?.id,
  )
  res = await acc.post(`${base}/dan`, { rok: String(Y) })
  check(
    'booked again, it replaces the one before',
    (await db.prepare("SELECT COUNT(*) AS n FROM ledger_entries WHERE company_id = 'co-k' AND text LIKE 'Daň z príjmov%' AND deleted_at IS NULL").first())?.n === 1,
  )
  const staleClosing = (await closingsOf(db, 'co-k')).find((k) => k.year === Y)
  const competing = await Promise.all([
    db.batch(bookTaxStatements(db, 'co-k', Y, 251000, staleClosing.taxEntry, lucia.id, staleClosing.revision)),
    db.batch(bookTaxStatements(db, 'co-k', Y, 251000, staleClosing.taxEntry, lucia.id, staleClosing.revision)),
  ])
  check('two tax bookings from the same revision accept exactly one and leave one active 591/341 entry', competing.filter((r) => r[1].meta.changes > 0).length === 1 && (await db.prepare("SELECT COUNT(*) AS n FROM ledger_entries WHERE company_id = 'co-k' AND text LIKE 'Daň z príjmov%' AND deleted_at IS NULL").first()).n === 1, JSON.stringify(competing.map((r) => r[1].meta)))
  const [staleFiled] = await db.batch([fileClosingStatement(db, 'co-k', Y, { rows: {}, balance: {}, profit: {}, advancesNext: { kind: 'none', each: 0 } }, 0, `${Y + 1}-03-31`, lucia.id, day(0), staleClosing.revision)])
  check('a filing prepared before the tax booking cannot claim the new closing revision', staleFiled.meta.changes === 0 && (await db.prepare("SELECT filed_at FROM closings WHERE company_id = 'co-k' AND year = ?").bind(Y).first()).filed_at === null)
  res = await acc.get(`${base}?rok=${Y}`)
  page = plain(await res.text())
  check('ready now, the tax in the statements and in the books', page.includes('Pripravené') && page.includes('je zaúčtovaná interným dokladom') && page.includes('22 290') && !page.includes('Čo treba vyriešiť'))

  res = await acc.get(`${base}/priznanie.xml?rok=${Y}`)
  check('ready, it has no file before its podklady are saved', res.status === 303 && res.headers.get('location') === `${base}?rok=${Y}&ok=zavierka-ulozit`)
  check('the page offers saving them, and no file yet', page.includes('Uložiť podklady a otvoriť podania') && !page.includes('Stiahnuť daňové priznanie (XML)'))

  // A deadline moved by a notice
  res = await acc.post(`${base}/lehota`, { rok: String(Y), lehota: `${Y + 1}-06-15` })
  check('a day that is no end of a month a notice may move to is refused', res.status === 400)
  res = await acc.post(`${base}/lehota`, { rok: String(Y), lehota: `${Y + 1}-06-30` })
  row = await db.prepare("SELECT extended_to FROM closings WHERE company_id = 'co-k' AND year = ?").bind(Y).first()
  check('the end of June is kept', res.status === 303 && row?.extended_to === `${Y + 1}-06-30`)
  res = await acc.get(`${base}?rok=${Y}`)
  page = plain(await res.text())
  // Late once it has passed (a day off around it may move it a few days on).
  const lateSaid = page.includes('Lehota uplynula')
  check('and said on the page, late only once it has passed', page.includes('Lehota predĺžená oznámením do 30. júna') && (day(0) > `${Y + 1}-07-05` ? lateSaid : day(0) < `${Y + 1}-06-28` ? !lateSaid : true))

  // Filed
  res = await acc.post(`${base}/podane`, { rok: String(Y) })
  row = await db.prepare("SELECT * FROM closings WHERE company_id = 'co-k' AND year = ?").bind(Y).first()
  const told = await db.prepare("SELECT body FROM messages WHERE company_id = 'co-k' ORDER BY created_at DESC, rowid DESC").first()
  check(
    'marked as filed: once, with what was filed, the tax to pay by the moved deadline',
    res.status === 303 && res.headers.get('location') === `/ucto/klienti/co-k/podania?obdobie=${Y}` && row?.filed_at && row.pay_cents === 201000 && row.due_on === `${Y + 1}-06-30` && JSON.parse(row.filed).rows.r1050 === 251000,
  )
  check(
    'the client reads what to pay, by when, to the income tax account, with the symbol of the year',
    Boolean(told) && plain(told.body).includes('2 010,00 €') && plain(told.body).includes('8180 5002 2412 3456 7890') && told.body.includes(`170099${Y}`) && plain(told.body).includes('do 30. júna'),
    told?.body,
  )
  check('on record', (await db.prepare("SELECT COUNT(*) AS n FROM events WHERE company_id = 'co-k' AND action = 'closing.filed'").first())?.n === 1)
  // The files saved with the podklady, against the Financial Administration's own schemas
  res = await acc.get(`${base}/priznanie.xml?rok=${Y}`)
  let xml = await res.text()
  check(
    'the tax return as a file of DPPOv25, valid against its schema',
    res.status === 200 && (res.headers.get('content-disposition') ?? '').includes(`DPPO_2120999994_${Y}.xml`) && (await validXml(xml, 'dppo2025.xsd')),
    xml.slice(0, 300),
  )
  check(
    'with the computation, the micro-taxpayer, the advance and the activity',
    xml.includes('<r100>24800.00</r100>') && xml.includes('<r130>300.00</r130>') && xml.includes('<r1010>500.00</r1010>') && xml.includes('<r1100>2010.00</r1100>') && xml.includes('<mikrodanovnikPar2w>1</mikrodanovnikPar2w>') && xml.includes('<k1>62</k1><k2>01</k2><k3>0</k3><cinnost>Počítačové programovanie</cinnost>'),
  )
  res = await acc.get(`${base}/zavierka.xml?rok=${Y}`)
  xml = await res.text()
  check(
    'the financial statements as a file of UZMUJv14, valid, the tax in them',
    res.status === 200 && (await validXml(xml, 'uzmuj2014.xsd')) && xml.includes('<r36><s1>2510</s1>') && xml.includes('<r38><s1>22290</s1>') && xml.includes('<r22><s1>29000</s1>') && xml.includes('<r19><s1>300</s1>') && xml.includes('<r41><s1>2010</s1>'),
    xml.slice(xml.indexOf('<telo>'), xml.indexOf('<telo>') + 300),
  )

  const frozen = JSON.parse(row.filed)
  const saleBefore = await db.prepare("SELECT lines FROM ledger_entries WHERE id = 'k-e3'").first()
  await db.prepare("UPDATE ledger_entries SET lines = ? WHERE id = 'k-e3'").bind(JSON.stringify([{ md: '311', d: '602', cents: 9000000 }])).run()
  await db.prepare("UPDATE companies SET name = 'Zmenená firma', address = 'Iná 1, 811 01 Bratislava' WHERE id = 'co-k'").run()
  res = await acc.get(`${base}/priznanie.xml?rok=${Y}`)
  const frozenReturn = await res.text()
  check('after books and filer details change, the filed return remains byte-for-byte identical', res.status === 200 && frozenReturn === frozen.files.return.xml && frozenReturn.includes('<r1050>2510.00</r1050>') && !frozenReturn.includes('Zmenená firma'))
  res = await acc.get(`${base}/zavierka.xml?rok=${Y}`)
  check('the filed statements also replay their exact saved XML and filename', res.status === 200 && await res.text() === frozen.files.statements.xml && res.headers.get('content-disposition').includes(frozen.files.statements.name))
  res = await acc.get(`${base}?rok=${Y}`)
  const changedDraft = plain(await res.text())
  check('a changed unsent annual draft asks to reopen rather than implying submission', res.status === 200 && changedDraft.includes('Po uložení podkladov sa výpočet zmenil') && !changedDraft.includes('Od podania sa zmenil výpočet') && !changedDraft.includes('tick--green'))
  const lateTax = await db.batch(bookTaxStatements(db, 'co-k', Y, 999999, row.tax_entry, lucia.id, row.revision))
  check('even a direct stale booking cannot touch tax entries after filing', lateTax[1].meta.changes === 0 && (await db.prepare("SELECT COUNT(*) AS n FROM ledger_entries WHERE company_id = 'co-k' AND text LIKE 'Daň z príjmov%' AND deleted_at IS NULL").first()).n === 1)
  await db.prepare("UPDATE ledger_entries SET lines = ? WHERE id = 'k-e3'").bind(saleBefore.lines).run()
  await db.prepare("UPDATE companies SET name = 'Závierková s. r. o.', address = 'Hlavná 12, 040 01 Košice' WHERE id = 'co-k'").run()
  const legacy = { ...frozen }; delete legacy.files
  await db.prepare("UPDATE closings SET filed = ? WHERE company_id = 'co-k' AND year = ?").bind(JSON.stringify(legacy), Y).run()
  res = await acc.get(`${base}/priznanie.xml?rok=${Y}`)
  check('a legacy filing without saved XML does not silently regenerate an original from today\'s books', res.status === 409 && plain(await res.text()).includes('pôvodné XML neuložilo'))
  await db.prepare("UPDATE closings SET filed = ? WHERE company_id = 'co-k' AND year = ?").bind(JSON.stringify(frozen), Y).run()
  const jana = as((await signIn('jana@zavierkova.test')).cookie)
  res = await jana.get('/app/dane')
  page = plain(await res.text())
  check(
    "in the client's taxes: the income tax of the year, to its account, with its symbol and a QR code for the bank",
    res.status === 200 && page.includes(`Daň z príjmov za rok ${Y}`) && page.includes('2 010,00 €') && page.includes('8180 5002 2412 3456 7890') && page.includes(`170099${Y}`) && page.includes('PAY by square'),
  )
  res = await acc.post(`${base}/podane`, { rok: String(Y) })
  check('marked again, nothing more happens', res.headers.get('location') === `${base}?rok=${Y}&ok=zavierka-uz` && (await db.prepare("SELECT COUNT(*) AS n FROM messages WHERE company_id = 'co-k'").first())?.n === 1)
  res = await acc.get(`${base}?rok=${Y}`)
  page = plain(await res.text())
  check('prepared, its adjustments are closed and its tax is not booked again', page.includes('Podklady uložené') && page.includes('<fieldset class="cform__section" disabled') && !page.includes('Zaúčtovať daň') && page.includes('Znovu otvoriť neodoslané alebo odmietnuté podklady'))
  res = await acc.post(base, { ...form, nace: '62.01.0', a16: '999' })
  check('nor are its adjustments kept', res.headers.get('location') === `${base}?rok=${Y}&ok=zavierka-uz` && JSON.parse((await db.prepare("SELECT inputs FROM closings WHERE company_id = 'co-k'").first())?.inputs ?? '{}').tableA?.a16 === 10000)

  // The deadlines: the closing done, the income tax the client's to pay until the bank shows it paid
  res = await acc.get('/ucto/terminy?hotove=1')
  page = plain(await res.text())
  check('on the screen of deadlines the tax is the client\'s to pay', page.includes(`Úhrada dane z príjmov za rok ${Y}`) && page.includes('Na úhradu 2 010,00 €'))
  await db.prepare("INSERT INTO payments (id, company_id, account_id, created_at, booked_on, amount_cents, party, vs, ref) VALUES ('pk-3', 'co-k', 'acc-k', ?, ?, -201000, 'Daňový úrad', ?, 'k3')").bind(nowS, day(0), `170099${Y - 1}`).run()
  res = await acc.get('/ucto/terminy')
  check("the tax of another year is not this year's", plain(await res.text()).includes(`Úhrada dane z príjmov za rok ${Y}`))
  await db.prepare("INSERT INTO payments (id, company_id, account_id, created_at, booked_on, amount_cents, party, vs, ref) VALUES ('pk-2', 'co-k', 'acc-k', ?, ?, -201000, 'Daňový úrad', ?, 'k2')").bind(nowS, day(0), `170099${Y}`).run()
  res = await acc.get('/ucto/terminy')
  check('paid with the symbol of the year, it is no longer open', !plain(await res.text()).includes(`Úhrada dane z príjmov za rok ${Y}`))

  // Who may, and from where
  res = await anna.get(base)
  check('a client gets nothing there', res.status === 404)
  res = await acc.get('/ucto/klienti/co-b/zavierka')
  check("nor does an accountant at a client that is not hers", res.status === 404)
  res = await mf.dispatchFetch(`${site}${base}/zrusit`, {
    method: 'POST',
    body: `rok=${Y}`,
    redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded', origin: 'https://evil.example', cookie: luc.cookie, 'cf-connecting-ip': '203.0.113.30' },
  })
  check('nor does anything come from another site', res.status === 403 && (await db.prepare("SELECT filed_at FROM closings WHERE company_id = 'co-k'").first())?.filed_at)

  // The year that runs: worked out, not filed
  res = await acc.get(`${base}?rok=${Y + 1}`)
  page = plain(await res.text())
  check('the year that runs is worked out ahead, nothing filed of it', res.status === 200 && page.includes('Rok ešte beží') && !page.includes('Označiť ako podané'))
  res = await acc.post(`${base}/podane`, { rok: String(Y + 1) })
  check('nor can it be marked', res.headers.get('location') === `${base}?rok=${Y + 1}&ok=zavierka-bezi`)
  res = await acc.post(`${base}/podane`, { rok: '1999' })
  check('a year the books do not have is no year', res.status === 400)

  // The mark taken back
  res = await acc.post(`${base}/zrusit`, { rok: String(Y) })
  row = await db.prepare("SELECT * FROM closings WHERE company_id = 'co-k' AND year = ?").bind(Y).first()
  const undone = await db.prepare("SELECT body FROM messages WHERE company_id = 'co-k' ORDER BY created_at DESC, rowid DESC").first()
  check(
    'taken back: not filed, what was set stays, the client told',
    res.status === 303 && row?.filed_at === null && row.pay_cents === null && JSON.parse(row.inputs).nace === '62.01.0' && undone?.body.includes('rušíme'),
  )
  const archived = await db.prepare("SELECT data FROM closing_history WHERE company_id = 'co-k' AND year = ? ORDER BY id DESC LIMIT 1").bind(Y).first()
  check('reopening a filed closing preserves the complete previous filing in history', JSON.parse(JSON.parse(archived.data).filed).files.return.xml === frozenReturn)

  await db.batch([
    db.prepare("DELETE FROM payments WHERE company_id = 'co-k'"),
    db.prepare("DELETE FROM accounts WHERE company_id = 'co-k'"),
    db.prepare("DELETE FROM ledger_entries WHERE company_id = 'co-k'"),
    db.prepare("DELETE FROM closings WHERE company_id = 'co-k'"),
    db.prepare("UPDATE companies SET purge_started_at = ? WHERE id = 'co-k'").bind(nowS),
    db.prepare("DELETE FROM filing_events WHERE company_id = 'co-k'"),
    db.prepare("DELETE FROM filing_packages WHERE company_id = 'co-k'"),
    db.prepare("DELETE FROM messages WHERE company_id = 'co-k'"),
    db.prepare("DELETE FROM members WHERE company_id = 'co-k'"),
    db.prepare("DELETE FROM sessions WHERE user_id = 'u-k'"),
    db.prepare("DELETE FROM users WHERE id = 'u-k'"),
    db.prepare("DELETE FROM companies WHERE id = 'co-k'"),
  ])
}

// ---------------------------------------------------------------------------------------------------------------
// Payroll: an employee, last month's payslip worked out, the month closed (booked, the client told what to pay and
// where), its deadlines and reports, a payroll payment's account, the month opened again
// ---------------------------------------------------------------------------------------------------------------
{
  const plain = (text) => text.replace(/\u00a0/g, ' ')
  const monthBack = (n) => {
    const d = new Date(`${day(0).slice(0, 7)}-15T12:00:00Z`)
    d.setUTCMonth(d.getUTCMonth() - n)
    return d.toISOString().slice(0, 7)
  }
  const last = monthBack(1)
  const current = day(0).slice(0, 7)
  const base = '/ucto/klienti/co-w/mzdy'
  await db
    .prepare(
      "INSERT INTO companies (id, created_at, name, ico, dic, address, vat_payer, plan, inbox, accountant_id, start_on, tax_account) VALUES ('co-w', ?, 'Mzdová s. r. o.', '50999995', '2120999995', 'Hlavná 14, 040 01 Košice', 0, 'rast', 'mzdy1', ?, ?, '1234567890')",
    )
    .bind(nowS, lucia?.id ?? '', `${monthBack(3)}-01`)
    .run()

  res = await acc.get(base)
  page = plain(await res.text())
  check('the payroll page answers, without a script or a style of its own, and asks for the first employee', res.status === 200 && !/<script>/.test(page) && !/ style=/i.test(page) && page.includes('Firma zatiaľ nemá zamestnancov'))
  const employee = {
    meno: 'Ján Mzdový',
    narodeny: '1. 1. 1990',
    poistovna: '25',
    nastup: skDay(`${monthBack(3)}-01`),
    skoncenie: '',
    mzda: '1500',
    iban: 'SK31 1200 0000 1987 4263 7541',
    vyhlasenie: '1',
    dieta_0: 'Andrea',
    narodene_0: '2. 4. 2016',
  }
  res = await acc.post(`${base}/zamestnanec`, { ...employee, meno: 'J', iban: 'SK00 1234' })
  page = plain(await res.text())
  check('an employee without a name or with an IBAN that is none is refused, field by field', res.status === 422 && page.includes('Napíšte meno a priezvisko.') && page.includes('Toto číslo účtu nie je platný IBAN.'))
  res = await acc.post(`${base}/zamestnanec`, employee)
  const kept = await db.prepare("SELECT * FROM employees WHERE company_id = 'co-w'").first()
  check(
    'an employee kept: the wage, the insurer, the declaration, the child',
    res.status === 303 && kept?.wage_cents === 150000 && kept.insurer === '25' && kept.declaration === 1 && JSON.parse(kept.children)[0]?.born === '2016-04-02' && kept.iban === 'SK3112000000198742637541',
  )

  // Her registrations: the company employs for the first time while the contract is ours. Filed in the portals of
  // the Social Insurance Agency and VšZP, recorded here; the newest record counts.
  {
    const regPage = plain(await (await acc.get(base)).text())
    const terms = await (await acc.get('/ucto/terminy')).text()
    check(
      'a new employee brings her registrations and the employer\'s, late here, to the payroll page and the deadlines',
      regPage.includes('Prihlásenia a odhlásenia') && regPage.includes('Prihlásenie do Sociálnej poisťovne: Ján Mzdový') && regPage.includes('Oznámenie nástupu v zdravotnej poisťovni VšZP: Ján Mzdový') &&
        regPage.includes('Registrácia zamestnávateľa v Sociálnej poisťovni') && regPage.includes('po termíne') &&
        terms.includes('/ucto/klienti/co-w/mzdy#prihlasenia'),
    )
    const recorded = () => db.prepare("SELECT action FROM events WHERE company_id = 'co-w' AND subject = ? ORDER BY id").bind(`${kept?.id}:in:social`).all().then((r) => r.results.map((e) => e.action))
    res = await acc.post(`${base}/prihlasenia`, { kluc: `${kept?.id}:in:social` })
    const afterHtml = await (await acc.get(base)).text()
    const after = plain(afterHtml)
    if (process.env.FIRMONY_CAPTURE_DIR) writeFileSync(`${process.env.FIRMONY_CAPTURE_DIR}/payroll-registrations.html`, afterHtml)
    check('recorded as filed: once, with who, and the page says so', res.status === 303 && JSON.stringify(await recorded()) === '["registration.done"]' && after.includes('Podané'))
    await acc.post(`${base}/prihlasenia`, { kluc: `${kept?.id}:in:social` })
    await acc.post(`${base}/prihlasenia`, { kluc: 'nic:in:social' })
    check('the same twice is one record, and what is not owed records nothing', JSON.stringify(await recorded()) === '["registration.done"]' && (await db.prepare("SELECT COUNT(*) AS n FROM events WHERE subject = 'nic:in:social'").first())?.n === 0)
    await acc.post(`${base}/prihlasenia`, { kluc: `${kept?.id}:in:social`, spat: '1' })
    const reopened = plain(await (await acc.get('/ucto/terminy')).text())
    check(
      'taken back by mistake, it is open again',
      JSON.stringify(await recorded()) === '["registration.done","registration.undone"]' && reopened.includes('Prihlásenie do Sociálnej poisťovne: Ján Mzdový'),
      `${JSON.stringify(await recorded())} ${reopened.slice(reopened.indexOf('Mzdov') - 300, reopened.indexOf('Mzdov') + 100)}`,
    )
    res = await acc.post('/ucto/klienti/co-b/mzdy/prihlasenia', { kluc: 'employer:social' })
    check("nobody records one of a client that is not hers", res.status === 404)
    for (const key of [`${kept?.id}:in:social`, `${kept?.id}:in:health`, 'employer:social', 'employer:health:25']) await acc.post(`${base}/prihlasenia`, { kluc: key })
    check(
      'all four recorded: nothing of them is late any more, and the deadlines have them as done',
      !plain(await (await acc.get(base)).text()).includes('po termíne') && !plain(await (await acc.get('/ucto/terminy')).text()).includes('Ján Mzdový'),
    )
  }

  // Last month, worked out and kept
  res = await acc.get(base)
  page = plain(await res.text())
  const net = last < '2027' ? '1 234,51 €' : '1 238,20 €'
  check(`last month is offered with the wage and its payslip: ${net} to pay out`, res.status === 200 && page.includes(`name="mzda_${kept?.id}"`) && page.includes(net) && page.includes('Čo zaplatiť'), page.slice(page.indexOf('Na výplatu'), page.indexOf('Na výplatu') + 300))
  const payday = `${current}-10`
  res = await acc.post(base, { obdobie: last, [`mzda_${kept?.id}`]: 'veľa', vyplata: skDay(payday), akcia: 'ulozit' })
  check('an income that is no amount is said', res.status === 422 && plain(await res.text()).includes('Sumu napíšte v eurách'))
  res = await acc.post(base, { obdobie: last, [`mzda_${kept?.id}`]: '1500', vyplata: skDay(payday), akcia: 'ulozit' })
  let run = await db.prepare("SELECT * FROM payroll_runs WHERE company_id = 'co-w' AND period = ?").bind(last).first()
  check('kept while open: the income and the payday', res.status === 303 && run?.payday === payday && JSON.parse(run.lines)[0]?.gross === 150000 && run.closed_at === null)

  // Closed: booked, and the client told what to pay
  res = await acc.post(base, { obdobie: current, [`mzda_${kept?.id}`]: '1500', vyplata: skDay(`${current}-28`), akcia: 'uzavriet' })
  check('the month that runs cannot be closed', res.headers.get('location') === `${base}?obdobie=${current}&ok=mzdy-bezi`)
  res = await acc.post(base, { obdobie: last, [`mzda_${kept?.id}`]: '1500', vyplata: skDay(payday), akcia: 'uzavriet' })
  run = await db.prepare("SELECT * FROM payroll_runs WHERE company_id = 'co-w' AND period = ?").bind(last).first()
  const slip = JSON.parse(run?.lines ?? '[]')[0]?.slip
  check('closed once, with the payslip as it was worked out', res.status === 303 && run?.closed_at && slip?.gross === 150000 && slip.bonus === 10000 && slip.net === (last < '2027' ? 123451 : 123820), JSON.stringify(slip))
  const told = await db.prepare("SELECT body FROM messages WHERE company_id = 'co-w' ORDER BY created_at DESC, rowid DESC").first()
  check(
    'the client reads what to pay and where: the net wage to the employee\'s account, the insurers, the tax office with the month\'s symbol',
    Boolean(told) && plain(told.body).includes(`Ján Mzdový: ${net} na SK31 1200 0000 1987 4263 7541`) && told.body.includes('Sociálna poisťovňa') && told.body.includes('VšZP') && told.body.includes(`VS 1100${last.slice(5, 7)}${last.slice(0, 4)}`) && plain(told.body).includes('8180 5002 5912 3456 7890'),
    told?.body,
  )
  res = await acc.post(base, { obdobie: last, [`mzda_${kept?.id}`]: '1800', vyplata: skDay(payday), akcia: 'uzavriet' })
  check('closed, it is not closed again nor changed', res.headers.get('location') === `${base}?obdobie=${last}&ok=mzdy-uz` && JSON.parse((await db.prepare("SELECT lines FROM payroll_runs WHERE company_id = 'co-w' AND period = ?").bind(last).first())?.lines ?? '[]')[0]?.gross === 150000)
  res = await acc.get(`/ucto/klienti/co-w/kniha/dennik?rok=${last.slice(0, 4)}&mesiac=${Number(last.slice(5, 7))}`)
  page = plain(await res.text())
  check('in the books: the month\'s payroll on its last day', page.includes('Mzdy za') && page.includes('521') && page.includes('336.100') && page.includes('524'))
  res = await acc.get(`${base}/paska?obdobie=${last}&zamestnanec=${kept?.id}`)
  check('the payslip to print', res.status === 200 && plain(await res.text()).includes('Výplatná páska'))

  // A payroll payment: the Social Insurance Agency's sum goes to 336.100
  await db.prepare("INSERT INTO accounts (id, company_id, iban, ledger) VALUES ('acc-w', 'co-w', 'SK6809000000000999999995', '221.001')").run()
  await db
    .prepare("INSERT INTO payments (id, company_id, account_id, created_at, booked_on, amount_cents, party, exempt, ref) VALUES ('pw-1', 'co-w', 'acc-w', ?, ?, ?, 'Sociálna poisťovňa', 'payroll', 'w1')")
    .bind(nowS, payday <= day(0) ? payday : day(0), -(slip.socialEmployee + slip.socialEmployer))
    .run()
  res = await acc.get(`/ucto/klienti/co-w/kniha/platby?rok=${day(0).slice(0, 4)}`)
  page = plain(await res.text())
  check("a payroll payment of the Social Insurance Agency's sum is booked to 336.100", page.includes('336.100'))

  // The deadlines
  res = await acc.get('/ucto/terminy?hotove=1')
  page = plain(await res.text())
  check('closed payroll has separate insurer deadlines and an actual-payment review', page.includes('Mzdy za') && page.includes('Uzavreté') && page.includes('Sociálnu poisťovňu') && page.includes('VšZP') && page.includes('Výplatu treba overiť'))
  res = await acc.post('/ucto/klienti/co-w/podane', { druh: 'mz', obdobie: last })
  check('the reports are not marked as filed by hand', res.status === 400 && (await db.prepare("SELECT COUNT(*) AS n FROM filings WHERE company_id = 'co-w' AND kind = 'mz'").first())?.n === 0)

  // The settings
  res = await acc.post(`${base}/nastavenie`, { den: '40', sp_iban: 'SK00', sp_vs: 'abc' })
  check('settings that are none are said', res.status === 422)
  res = await acc.post(`${base}/nastavenie`, { den: '10', sp_iban: 'SK31 1200 0000 1987 4263 7541', sp_vs: '1234567890', zp_iban_25: '', zp_vs_25: '4567' })
  const settings = JSON.parse((await db.prepare("SELECT payroll FROM companies WHERE id = 'co-w'").first())?.payroll ?? '{}')
  check('kept: the payday, the Social Insurance Agency, the insurer', res.status === 303 && settings.payday === 10 && settings.social?.vs === '1234567890' && settings.health?.['25']?.vs === '4567')

  // Who may
  res = await anna.get(base)
  check('a client gets nothing there', res.status === 404)
  res = await acc.get('/ucto/klienti/co-b/mzdy')
  check('nor does an accountant at a client that is not hers', res.status === 404)

  // Opened again
  res = await acc.post(`${base}/otvorit`, { obdobie: last })
  run = await db.prepare("SELECT * FROM payroll_runs WHERE company_id = 'co-w' AND period = ?").bind(last).first()
  const undone = await db.prepare("SELECT body FROM messages WHERE company_id = 'co-w' ORDER BY created_at DESC, rowid DESC").first()
  check('opened again: not closed, its incomes kept, the client told', res.status === 303 && run?.closed_at === null && JSON.parse(run.lines)[0]?.gross === 150000 && undone?.body.includes('rušíme'))
  const payrollArchive = await db.prepare("SELECT data FROM payroll_history WHERE company_id = 'co-w' AND period = ? ORDER BY id DESC LIMIT 1").bind(last).first()
  check('reopening payroll preserves the previously closed payslip before any recalculation', JSON.parse(JSON.parse(payrollArchive.data).lines)[0].slip.net === slip.net)

  // A closed snapshot is retained even beyond the navigation window and the years supported for new calculations.
  const historical = '2025-01'
  const historicalLines = JSON.parse(run.lines).map((line) => ({ ...line, slip: { ...line.slip, period: historical, net: 112233 } }))
  await db.prepare("INSERT INTO payroll_runs (company_id, period, payday, lines, closed_at, closed_on, closed_by) VALUES ('co-w', ?, '2025-02-10', ?, ?, '2025-02-10', ?)").bind(historical, JSON.stringify(historicalLines), nowS, lucia.id).run()
  res = await acc.get(`${base}?obdobie=${historical}`)
  page = plain(await res.text())
  check('a historical closed payroll remains in navigation with its stored net, without recalculation', res.status === 200 && page.includes(`obdobie=${historical}`) && page.includes('1 122,33 €'))
  res = await acc.get(`${base}/paska?obdobie=${historical}&zamestnanec=${kept.id}`)
  check('a historical payslip is downloadable outside the recent six months and supported years', res.status === 200 && plain(await res.text()).includes('1 122,33 €'))
  res = await acc.post(`${base}/otvorit`, { obdobie: historical })
  check('a closed historical payroll cannot be reopened into unsupported calculation rules', res.headers.get('location')?.includes('mzdy-nepodporovane') && (await db.prepare("SELECT closed_at FROM payroll_runs WHERE company_id = 'co-w' AND period = ?").bind(historical).first())?.closed_at === nowS)
  await db.prepare("INSERT INTO payroll_runs (company_id, period, payday, lines) VALUES ('co-w', '2030-01', '2030-02-10', '[]')").run()
  res = await acc.get(`${base}?obdobie=2030-01`)
  check('an unsupported open year explains the missing rules instead of inventing a payslip', res.status === 200 && plain(await res.text()).includes('Pravidlá chýbajú'))
  res = await acc.post(base, { obdobie: '2030-01', akcia: 'uzavriet' })
  check('an unsupported year cannot be computed or closed by posting directly', res.headers.get('location')?.includes('mzdy-nepodporovane') && (await db.prepare("SELECT closed_at FROM payroll_runs WHERE company_id = 'co-w' AND period = '2030-01'").first())?.closed_at === null)

  // Synthetic fixture: reopen the unsent source, then use the controlled retention state for cleanup.
  await db.prepare("UPDATE companies SET purge_started_at = ? WHERE id = 'co-w'").bind(nowS).run()
  await db.batch([
    db.prepare("DELETE FROM payments WHERE company_id = 'co-w'"),
    db.prepare("DELETE FROM accounts WHERE company_id = 'co-w'"),
    db.prepare("DELETE FROM employees WHERE company_id = 'co-w'"),
    db.prepare("DELETE FROM payroll_runs WHERE company_id = 'co-w'"),
    db.prepare("DELETE FROM payroll_generations WHERE company_id = 'co-w'"),
    db.prepare("DELETE FROM payroll_health_generations WHERE company_id = 'co-w'"),
    db.prepare("DELETE FROM payroll_social_generations WHERE company_id = 'co-w'"),
    db.prepare("DELETE FROM payroll_social_inputs WHERE company_id = 'co-w'"),
    db.prepare("DELETE FROM payroll_social_relations WHERE company_id = 'co-w'"),
    db.prepare("DELETE FROM payroll_health_ids WHERE company_id = 'co-w'"),
    db.prepare("DELETE FROM payroll_target_reviews WHERE company_id = 'co-w'"),
    db.prepare("DELETE FROM payroll_events WHERE company_id = 'co-w'"),
    db.prepare("DELETE FROM payroll_packages WHERE company_id = 'co-w'"),
    db.prepare("DELETE FROM payroll_targets WHERE company_id = 'co-w'"),
    db.prepare("DELETE FROM payroll_payouts WHERE company_id = 'co-w'"),
    db.prepare("DELETE FROM payroll_closures WHERE company_id = 'co-w'"),
    db.prepare("DELETE FROM filings WHERE company_id = 'co-w'"),
    db.prepare("DELETE FROM messages WHERE company_id = 'co-w'"),
    db.prepare("DELETE FROM companies WHERE id = 'co-w'"),
  ])
}

// ---------------------------------------------------------------------------------------------------------------
// The order: a request for a company the register knows as an s. r. o. becomes a contract concluded online by a
// director the register names (Zelený dvor s. r. o.: two directors in office, one whose office ended).
// ---------------------------------------------------------------------------------------------------------------

await checkContractTransactions(db,files)
await checkAmlAdmission(db,files)

const zeleny = { ico: '55012345', mode: 'company', plan: 'rast', situation: 'switch', name: 'Tomáš Dvorský', email: 'tomas@zelenydvor.test', phone: '', note: '' }
res = await post('/zacat', zeleny, { ip: '198.51.100.20' })
check('a request for an s. r. o. leads to a review before any contract', res.status === 303 && res.headers.get('location') === '/zacat/hotovo?zmluva=1&zmena=1')
await settle()
const linkMails = async () => (await sent()).filter((m) => m.to === 'tomas@zelenydvor.test' && /\/objednavka\/[A-Za-z0-9_-]{43}/.test(m.text))
check('nobody gets a link to a contract before we have looked at the company', (await linkMails()).length === 0)
const orderRow = await db.prepare("SELECT * FROM orders WHERE ico = '55012345'").first()
check(
  'the order keeps a hash of a link and the directors in office',
  Boolean(orderRow) &&
    /^[0-9a-f]{64}$/.test(orderRow.token) &&
    JSON.parse(orderRow.directors)
      .map((d) => d.name)
      .join('|') === 'Mgr. Lucia Zelená|Tomáš Dvorský',
  orderRow?.directors,
)
const reviewPath = `/ucto/ziadosti/${orderRow.request_id}/posudenie`
res = await admin.get('/ucto/ziadosti')
page = (await res.text()).replace(/\u00a0/g, ' ')
check('the request leads the administrator to the review, and says by when to answer', page.includes(`href="${reviewPath}"`) && page.includes('Posúdiť a poslať zmluvu') && /Odpovedať do|Odpoveď mešká/.test(page))
if (process.env.FIRMONY_CAPTURE_DIR) writeFileSync(`${process.env.FIRMONY_CAPTURE_DIR}/requests.html`, page)
res = await acc.get(reviewPath)
check('an accountant cannot approve a contract intake', res.status === 404)
res = await anna.get(reviewPath)
check('a client cannot approve a contract intake', res.status === 404)
res = await admin.get(reviewPath)
const reviewHtml = await res.text()
check('an administrator sees scope, capacity, authority and insurance checks', res.status === 200 && ['category', 'scope', 'cover', 'authority'].every((k) => reviewHtml.includes(`name="${k}"`)))
check(
  'the review comes prepared from the registers: who acts, a micro entity by its last statements, the scope and the approved catalogue, all ticked',
  reviewHtml.includes('data-review-proposal="standard"') && ['category', 'scope', 'cover', 'authority'].every((k) => reviewHtml.includes(`data-review-check="${k}" data-ok="1"`)) &&
    ['category', 'scope', 'cover', 'authority'].every((k) => new RegExp(`name="${k}" value="1" checked`).test(reviewHtml)) && /<option value="standard" selected/.test(reviewHtml) &&
    reviewHtml.includes('na šablóne Úč MUJ') && new RegExp(`name="evidence"[^>]*value="Firmony [^"]*RÚZ závierka do 12/${RUZ_LAST} na Úč MUJ`).test(reviewHtml),
  reviewHtml.match(/data-review-proposal[\s\S]{0,3000}/)?.[0],
)
if (process.env.FIRMONY_CAPTURE_DIR) writeFileSync(`${process.env.FIRMONY_CAPTURE_DIR}/contract-review.html`, reviewHtml)
const proposal = reviewHtml.match(/name="proposal" value="([a-f0-9]{64})"/)?.[1]
const reviewFields = { proposal, decision: 'standard', plan: 'rast', evidence: 'TEST-ONLY qualification report', accountant: lucia.id, category: '1', scope: '1', cover: '1', authority: '1' }
res = await admin.post(reviewPath, { ...reviewFields, category: '0' })
check('standard approval without all controls is refused', res.status === 422 && !(await db.prepare('SELECT id FROM order_reviews WHERE order_id = ?').bind(orderRow.id).first()))
res = await admin.post(reviewPath, { ...reviewFields, accountant: 'u-a' })
check('a client cannot be named responsible accountant', res.status === 422)
res = await admin.post(reviewPath, { ...reviewFields, proposal: 'b'.repeat(64) })
check('an expert cannot approve stale company facts or tariffs', res.status === 409)
res = await admin.post(reviewPath, { ...reviewFields, decision: 'bespoke' })
await settle()
check('a bespoke prospect has a recorded decision, and no link to a standard contract', res.status === 303 && (await linkMails()).length === 0)
check(
  'a bespoke scope leads to a client made on a paper contract',
  (await (await admin.get(reviewPath)).text()).replace(/\u00a0/g, ' ').includes('Individuálnu službu uzavriete zmluvou na papieri') &&
    (await (await admin.get(reviewPath)).text()).includes(`href="/ucto/klienti/novy?ziadost=${orderRow.request_id}"`),
)
{
  // An online order that lapsed while its request waited is no dead end: thirty more days with a new token, or a
  // client on paper. Not for a company that is a client already.
  const tsNow = Math.floor(Date.now() / 1000)
  await db.batch([
    db.prepare("INSERT INTO requests (id, created_at, ico, company, plan, situation, name, email, privacy_version) VALUES ('req-lapsed', ?, '55099999', 'Stará objednávka s. r. o.', 'start', 'fresh', 'Eva Neskorá', 'eva@neskoro.test', 'v1')").bind(tsNow - 40 * 86400),
    db.prepare("INSERT INTO orders (id, token, created_at, expires_at, request_id, ico, company, plan, person, email) VALUES ('ord-lapsed', ?, ?, ?, 'req-lapsed', '55099999', 'Stará objednávka s. r. o.', 'start', 'Eva Neskorá', 'eva@neskoro.test')").bind('f'.repeat(64), tsNow - 40 * 86400, tsNow - 10 * 86400),
  ])
  const lapsedPath = '/ucto/ziadosti/req-lapsed/posudenie'
  const lapsedHtml = await (await admin.get(lapsedPath)).text()
  if (process.env.FIRMONY_CAPTURE_DIR) writeFileSync(`${process.env.FIRMONY_CAPTURE_DIR}/contract-lapsed.html`, lapsedHtml)
  const lapsed = lapsedHtml.replace(/\u00a0/g, ' ')
  check('a lapsed order says so and offers both ways on', lapsed.includes('Objednávka vypršala') && lapsed.includes('action="/ucto/ziadosti/req-lapsed/obnovit"') && lapsed.includes('href="/ucto/klienti/novy?ziadost=req-lapsed"'))
  res = await acc.post('/ucto/ziadosti/req-lapsed/obnovit', {})
  check('an accountant renews nothing', res.status === 404)
  res = await admin.post('/ucto/ziadosti/req-lapsed/obnovit', {})
  const renewed = await db.prepare("SELECT token, expires_at FROM orders WHERE id = 'ord-lapsed'").first()
  check(
    'renewed: thirty more days, a new token, on record, and the review form is back',
    res.status === 303 && renewed.expires_at > tsNow + 29 * 86400 && renewed.token !== 'f'.repeat(64) &&
      Boolean(await db.prepare("SELECT id FROM events WHERE action = 'order.renewed' AND subject = 'ord-lapsed'").first()) &&
      (await (await admin.get(lapsedPath)).text()).includes('name="proposal"'),
  )
  res = await admin.post('/ucto/ziadosti/req-lapsed/obnovit', {})
  check('an order that runs is not renewed again', res.status === 409)
  await db.prepare("UPDATE orders SET expires_at = ? WHERE id = 'ord-lapsed'").bind(tsNow - 1).run()
  await db.prepare("INSERT INTO companies (id, created_at, name, ico, plan, inbox) VALUES ('co-lapsed', ?, 'Stará objednávka s. r. o.', '55099999', 'start', 'lapsed01')").bind(tsNow).run()
  res = await admin.post('/ucto/ziadosti/req-lapsed/obnovit', {})
  check('nor one of a company that has become a client', res.status === 409 && (await db.prepare("SELECT expires_at FROM orders WHERE id = 'ord-lapsed'").first())?.expires_at === tsNow - 1)
  await db.batch([db.prepare("DELETE FROM companies WHERE id = 'co-lapsed'"), db.prepare("DELETE FROM orders WHERE id = 'ord-lapsed'"), db.prepare("DELETE FROM requests WHERE id = 'req-lapsed'")])
}
res = await admin.post(reviewPath, reviewFields)
await settle()
check('an approved standard scope sends the director the link at once', res.status === 303 && res.headers.get('location') === `${reviewPath}?ok=odkaz` && (await linkMails()).length === 1)
const latestLink = async () => (await linkMails()).pop()?.text.match(/https:\/\/firmony\.io(\/objednavka\/[A-Za-z0-9_-]{43})/)?.[1] ?? ''
let orderLink = await latestLink()
const orderMail = (await linkMails()).pop()
check(
  "the email carries the link to the contract, the register's name and the last day the link works",
  Boolean(orderLink) && orderMail.subject === 'Firmony: podklady pred začatím spolupráce' && orderMail.text.includes('Zelený dvor s. r. o.') && /Odkaz platí do \d{1,2}\. \d{1,2}\. \d{4}\./.test(orderMail.text),
  orderMail?.text,
)
check('the request counts as answered', (await db.prepare('SELECT status FROM requests WHERE id = ?').bind(orderRow.request_id).first())?.status === 'contacted')
res = await admin.get(reviewPath)
check('the review says when the link went out and offers a new one', (await res.text()).includes('Poslať nový odkaz'))
res = await get(orderLink)
page=await res.text()
check('before AML admission the public link collects evidence and cannot conclude a contract',page.includes('Overenie pred začatím spolupráce') && !page.includes('name="agree"'))
if(process.env.FIRMONY_CAPTURE_DIR) writeFileSync(`${process.env.FIRMONY_CAPTURE_DIR}/aml-intake.html`,page)
// The signed declaration accepts the offer the contract is concluded on later: the second month offered, as below.
await seedAmlDossier(db,files,orderRow.id,await ensureAmlOfficer(db),{...testDeclaration(),director:{...testDeclaration().director,name:'Tomáš Dvorský'},contract:{plan:'rast',startOn:startMonths(day(0))[1],terms:TERMS_VERSION}})
res = await get(orderLink)
page = await res.text()
check(
  'the order page shows the main points and the directors in office',
  res.status === 200 &&
    page.includes('Hlavné body zmluvy') &&
    page.includes('Mgr. Lucia Zelená') &&
    page.includes('Tomáš Dvorský') &&
    !page.includes('Peter Starý') &&
    page.includes(`169${NB}€`) &&
    page.includes('vložka č.'),
)
check('the order page is not for search engines', (res.headers.get('x-robots-tag') ?? '').includes('noindex'))
const months = [...page.matchAll(/name="start" id="start-\d" value="(\d{4}-\d{2}-01)"/g)].map((m) => m[1])
check('six months are offered, November 2026 the first of them at the earliest', months.length === 6 && months[0] >= '2026-11-01', months.join(' '))
check('the page carries the reviewed proposal', page.includes(`name="proposal" value="${proposal}"`))
check('the page says the contract is concluded as the identified person signed it, the other months closed', page.includes('data-signed-offer') && /value="[^"]+"[^>]*disabled/.test(page.match(/name="start" id="start-0"[^>]*>/)?.[0] ?? ''))
const validContract = { plan: 'rast', start: months[1], director: 'Tomáš Dvorský', agree: '1', proposal }
res = await admin.post(reviewPath, { ...reviewFields, decision: 'hold' })
res = await get(orderLink)
page = await res.text()
check('the newest decision closes the form and says where it stands', res.status === 200 && page.includes('Potrebujeme ešte pár údajov') && !page.includes('name="agree"'))
if (process.env.FIRMONY_CAPTURE_DIR) writeFileSync(`${process.env.FIRMONY_CAPTURE_DIR}/contract-blocked.html`, page)
res = await post(orderLink, validContract, { ip: '198.51.100.21' })
check('and posting it directly signs nothing', res.status === 409 && (await db.prepare("SELECT status FROM orders WHERE id = ?").bind(orderRow.id).first())?.status === 'open')
res = await admin.post(reviewPath, reviewFields)
await settle()
const previousLink = orderLink
orderLink = await latestLink()
check('a new approval sends a new link, and the one before opens nothing', orderLink !== previousLink && (await get(previousLink)).status === 404)
// Seven days pass: the director asks for a new link with one click, and we are rung.
await db
  .prepare("INSERT INTO order_reviews (order_id, reviewed_at, reviewed_by, decision, offer_hash, plan, evidence, accountant_id, expires_at) SELECT order_id, reviewed_at, reviewed_by, decision, offer_hash, plan, evidence, accountant_id, ? FROM order_reviews WHERE order_id = ? ORDER BY id DESC LIMIT 1")
  .bind(nowS - 60, orderRow.id)
  .run()
res = await get(orderLink)
page = await res.text()
check('a link whose review ran out says so and offers a new one', res.status === 200 && page.includes('Odkaz na podpis vypršal') && page.includes(`action="${orderLink}/novy"`))
if (process.env.FIRMONY_CAPTURE_DIR) writeFileSync(`${process.env.FIRMONY_CAPTURE_DIR}/contract-stale.html`, page)
const beforeRenew = (await sent()).length
res = await post(`${orderLink}/novy`, {}, { ip: '198.51.100.21' })
await settle()
check(
  'asking for it opens the request again and rings us, with nothing of the company in the email',
  res.status === 200 &&
    (await res.text()).includes('Dali sme vedieť') &&
    (await db.prepare('SELECT status FROM requests WHERE id = ?').bind(orderRow.request_id).first())?.status === 'new' &&
    (await sent()).slice(beforeRenew).some((m) => m.to === 'ahoj@firmony.io' && m.subject === 'Firmony: nový odkaz na zmluvu' && !m.text.includes('Zelený')),
)
res = await admin.post(reviewPath, reviewFields)
await settle()
orderLink = await latestLink()
const noRelease = await mf.getWorker('firmony-unreleased')
const unsignedBody = new URLSearchParams(validContract).toString()
res = await noRelease.fetch(`${site}${orderLink}`, { method: 'POST', headers: { 'sec-fetch-site': 'same-origin', 'content-type': 'application/x-www-form-urlencoded', 'content-length': String(Buffer.byteLength(unsignedBody)) }, body: unsignedBody })
check('a worker without legal and insurance release stays closed despite an approved order', res.status === 409, `${res.status}: ${await res.text()}`)
res = await get(orderLink)
page = await res.text()
check('only the specifically reviewed plan is offered for signing', !/type="submit" disabled/.test(page) && /value="firma"[^>]*disabled/.test(page))
if (process.env.FIRMONY_CAPTURE_DIR) writeFileSync(`${process.env.FIRMONY_CAPTURE_DIR}/contract-ready.html`, page)
res = await post(orderLink, { ...validContract, proposal: 'a'.repeat(64) }, { ip: '198.51.100.21' })
check('a stale proposal is refused before creating a company', res.status === 409 && (await db.prepare("SELECT COUNT(*) AS n FROM companies WHERE ico = '55012345'").first())?.n === 0)
res = await post(orderLink, { ...validContract, proposal: '' }, { ip: '198.51.100.21' })
check('a missing proposal digest cannot be bypassed by a direct post', res.status === 409)
res = await post(orderLink, { ...validContract, plan: 'firma' }, { ip: '198.51.100.21' })
check('changing the package requires a fresh scope decision', res.status === 409)
res = await post(orderLink, { ...validContract, start: months[2] }, { ip: '198.51.100.21' })
check('whoever holds the link cannot conclude it for another first month than the identified person signed', res.status === 409 && (await res.text()).includes('prijala v podpísanom vyhlásení') && (await db.prepare("SELECT COUNT(*) AS n FROM companies WHERE ico = '55012345'").first())?.n === 0)

res = await post(orderLink, { plan: 'rast', start: months[0], director: 'Peter Starý', agree: '1' }, { ip: '198.51.100.21' })
check('a director whose office ended cannot conclude it', res.status === 422 && (await res.text()).includes('Vyberte, prosím, kto zmluvu uzatvára'))
res = await post(orderLink, { plan: 'rast', start: months[0], director: 'Tomáš Dvorský' }, { ip: '198.51.100.21' })
check('without agreeing to the terms nothing is concluded', res.status === 422 && (await res.text()).includes('Bez súhlasu'))
res = await post(orderLink, { plan: 'rast', start: '2026-10-01', director: 'Tomáš Dvorský', agree: '1' }, { ip: '198.51.100.21' })
check('a month before the first month we take is refused', res.status === 422)
res = await post(orderLink, { plan: 'nieco', start: months[0], director: 'Tomáš Dvorský', agree: '1' }, { ip: '198.51.100.21' })
check('a plan that does not exist is refused', res.status === 422)
check('nothing is created before the contract', (await db.prepare("SELECT COUNT(*) AS n FROM companies WHERE ico = '55012345'").first())?.n === 0)
res = await post(orderLink, { plan: 'rast', start: months[1], director: 'Tomáš Dvorský', agree: '1' }, { origin: 'https://evil.example', ip: '198.51.100.21' })
check('a contract posted from another site is refused', res.status === 403)
res = await post(orderLink, validContract, { ip: '198.51.100.21' })
let contractCookie = (res.headers.get('set-cookie') ?? '').split(';')[0]
check(
  'the contract is concluded and the browser is signed in',
  res.status === 303 && res.headers.get('location') === `/app/rychle-prihlasenie?next=${encodeURIComponent('/app?ok=zmluva')}` && contractCookie.startsWith('__Host-firmony='),
  res.headers.get('location'),
)
const madeCompany = await db.prepare("SELECT * FROM companies WHERE ico = '55012345'").first()
check(
  'the company is created with the contract on it',
  madeCompany?.name === 'Zelený dvor s. r. o.' &&
    madeCompany?.plan === 'rast' && madeCompany?.accountant_id === lucia.id &&
    madeCompany?.vat_payer === 1 &&
    madeCompany?.signed_by === 'Tomáš Dvorský' &&
    madeCompany?.start_on === months[1] &&
    Boolean(madeCompany?.terms_version) &&
    Boolean(madeCompany?.contract_at) &&
    madeCompany?.register_line === 'Obchodný register Mestského súdu Košice, oddiel Sro, vložka č. 58123/V',
  JSON.stringify(madeCompany),
)
const madeOwner = await db
  .prepare('SELECT u.email, u.name, m.role FROM members m JOIN users u ON u.id = m.user_id WHERE m.company_id = ?')
  .bind(madeCompany?.id ?? '')
  .all()
check(
  'the person is its only owner, under the email the link went to',
  madeOwner.results.length === 1 && madeOwner.results[0].email === 'tomas@zelenydvor.test' && madeOwner.results[0].role === 'owner' && madeOwner.results[0].name === 'Tomáš Dvorský',
)
const acceptedRow = await db.prepare("SELECT status, price_cents, signed_by, ip_hash, plan FROM orders WHERE ico = '55012345'").first()
check(
  'the order keeps who accepted what at which price, and no address',
  acceptedRow?.status === 'accepted' &&
    acceptedRow?.price_cents === 16900 &&
    acceptedRow?.plan === 'rast' &&
    /^[0-9a-f]{64}$/.test(acceptedRow?.ip_hash ?? '') &&
    !String(acceptedRow?.ip_hash).includes('198.51'),
)
check('the request is marked as a client', (await db.prepare("SELECT status FROM requests WHERE ico = '55012345'").first())?.status === 'client')
check(
  'the contract is on record',
  (
    await db
      .prepare("SELECT COUNT(*) AS n FROM events WHERE action = 'contract.accepted' AND company_id = ?")
      .bind(madeCompany?.id ?? '')
      .first()
  )?.n === 1,
)
await settle()
const contractConfirmation = (await sent()).find((m) => m.to === 'tomas@zelenydvor.test' && m.subject === 'Firmony: zmluva je uzavretá')
check(
  'the confirmation is a doorbell with a sign-in link: the contract and its terms wait in the app',
  Boolean(contractConfirmation) &&
    /\/app\/vstup\?t=[A-Za-z0-9_-]{43}/.test(contractConfirmation.text) &&
    !contractConfirmation.text.includes('Obchodné podmienky služby') &&
    !contractConfirmation.text.includes('Tomáš') &&
    !contractConfirmation.text.includes('169'),
)
check(
  'we are rung of the contract',
  (await sent()).some((m) => m.to === 'ahoj@firmony.io' && m.subject === 'Firmony: nová zmluva' && m.text.includes(`/ucto/klienti/${madeCompany?.id}`) && !m.text.includes('Zelený')),
)
res = await get('/app?ok=zmluva', { headers: { cookie: contractCookie } })
page = await res.text()
check('the new client lands in the app, welcomed', res.status === 200 && page.includes('Zmluva je uzavretá') && page.includes('Zelený dvor'))
if (process.env.FIRMONY_CAPTURE_DIR) writeFileSync(`${process.env.FIRMONY_CAPTURE_DIR}/welcome.html`, page)
check(
  'with who stands behind it first, the power of attorney, and the notice for the former accountant, which the request said',
  page.includes('Začíname') && page.includes('Hotovo') && !page.includes('href="/app/vyhlasenie"') && page.includes('href="/app/plna-moc"') && page.includes('href="/app/prechod"'),
)
res = await get('/app/zmluva', { headers: { cookie: contractCookie } })
page = (await res.text()).replace(/\u00a0/g, ' ')
check(
  'the contract in the app names who concluded it and the price of that day',
  res.status === 200 && page.includes('Tomáš Dvorský, konateľ') && page.includes('169 € mesačne bez DPH') && page.includes('Obchodné podmienky služby Firmony'),
)

if (process.env.FIRMONY_CAPTURE_DIR) writeFileSync(`${process.env.FIRMONY_CAPTURE_DIR}/contract-accepted.html`, page)
const exactContract = await resolveContract(db, madeCompany.id, '2099-01-01')
check('the saved contract takes precedence over a newer live version label', exactContract.status === 'snapshot' && exactContract.snapshot.plan.monthlyCents === 16900 && exactContract.snapshot.catalogue.terms.version === '2026-10-30')
check('the acceptance digest covers the exact stored UTF-8 bytes', exactContract.sha256 === createHash('sha256').update(exactContract.data).digest('hex'))
check('approval and exact tariff evidence are retained with the contract', exactContract.snapshot.catalogue.payrollCents === 1500 && exactContract.snapshot.catalogue.closingCents === 24900 && exactContract.snapshot.approval.accountantId === lucia.id)
let immutableContract = false
try { await db.prepare("UPDATE contract_snapshots SET data = '{}' WHERE company_id = ?").bind(madeCompany.id).run() } catch { immutableContract = true }
check('ordinary SQL cannot overwrite an accepted contract', immutableContract)
let retainedContract = false
try { await db.prepare('DELETE FROM contract_snapshots WHERE company_id = ?').bind(madeCompany.id).run() } catch { retainedContract = true }
check('an active client contract cannot be deleted', retainedContract)
let immutableReview = false
try { await db.prepare("UPDATE order_reviews SET decision = 'hold' WHERE order_id = ?").bind(orderRow.id).run() } catch { immutableReview = true }
check('review history cannot be overwritten', immutableReview)
const missingContract = await resolveContract(db, 'co-b', 'unknown-release')
check('an unknown old version never falls back to current terms', missingContract.status === 'missing' && missingContract.terms === null)
const oldContract = await resolveContract(db, 'co-a', '2026-10-13')
check('the legacy archive keeps the actual old liability cap and its uncertainty warning', oldContract.status === 'archive' && oldContract.terms.text.includes('dvanásťnásobku') && oldContract.notice.includes('nie je dôkaz'))
contractCookie = (await verifyBrowser('tomas@zelenydvor.test', contractCookie)).cookie
const acceptedExport = await get(`/app/export?rok=${months[1].slice(0, 4)}`, { headers: { cookie: contractCookie } })
const acceptedZip = unzip(new Uint8Array(await acceptedExport.arrayBuffer()))
const exactJson = acceptedZip?.find((f) => f.name === 'zmluva.json')
check('a client can export the exact accepted snapshot with a matching checksum', acceptedExport.status === 200 && exactJson && createHash('sha256').update(exactJson.data).digest('hex') === exactContract.sha256 && acceptedZip.some((f) => f.name === 'zmluva.sha256'))
await checkBeforeStart({ db, client: as(contractCookie), companyId: madeCompany.id, today: day(0), capture: process.env.FIRMONY_CAPTURE_DIR })
await checkBilling({ db, files, admin, acc, client: as(contractCookie), companyId: madeCompany.id, today: day(0), sent, settle, get, capture: process.env.FIRMONY_CAPTURE_DIR })
const triggerSql = (await db.prepare("SELECT sql FROM sqlite_master WHERE type = 'trigger' AND name = 'contract_snapshots_immutable'").first()).sql
await db.exec('DROP TRIGGER contract_snapshots_immutable')
await db.prepare("UPDATE contract_snapshots SET data = '{}' WHERE company_id = ?").bind(madeCompany.id).run()
res = await get('/app/zmluva', { headers: { cookie: contractCookie } })
check('corruption shows an explicit failure instead of substituting new terms', res.status === 200 && (await res.text()).includes('Uloženú zmluvu sa nepodarilo overiť'))
res = await get(`/app/export?rok=${months[1].slice(0, 4)}`, { headers: { cookie: contractCookie } })
check('a corrupt contract blocks a purportedly complete export', res.status === 409, `${res.status} ${res.headers.get('location')}`)
await db.prepare('UPDATE contract_snapshots SET data = ? WHERE company_id = ?').bind(exactContract.data, madeCompany.id).run()
await db.prepare(triggerSql).run()
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
check(
  'the same contract cannot be concluded twice',
  res.status === 200 &&
    page.includes('Zmluva je uzavretá') &&
    (await db.prepare("SELECT COUNT(*) AS n FROM companies WHERE ico = '55012345'").first())?.n === 1 &&
    (await db.prepare("SELECT plan FROM orders WHERE ico = '55012345'").first())?.plan === 'rast',
)
await db.prepare('UPDATE companies SET ends_on=? WHERE id=?').bind(day(-91),madeCompany.id).run()
res = await get(orderLink)
check('the original accepted public link also stops exposing the contract after ninety days',res.status === 404 && !(await res.text()).includes('data-contract'))
await db.prepare('UPDATE companies SET ends_on=NULL WHERE id=?').bind(madeCompany.id).run()
res = await post('/zacat', { ...zeleny, email: 'iny@zelenydvor.test' }, { ip: '198.51.100.22' })
check('a company that is already a client gets no second contract by email', res.status === 303 && res.headers.get('location') === '/zacat/hotovo?zmena=1')
res = await get('/objednavka/' + 'x'.repeat(43))
check('a link nobody was sent is not found', res.status === 404)
// A link that ran out
const europioOrderToken = 'e'.repeat(43)
await db
  .prepare("UPDATE orders SET token = ?, expires_at = 1 WHERE id = (SELECT id FROM orders WHERE ico = '57442452' ORDER BY created_at DESC, rowid DESC LIMIT 1)")
  .bind(createHash('sha256').update(europioOrderToken).digest('hex'))
  .run()
res = await get(`/objednavka/${europioOrderToken}`)
page = await res.text()
check('a link that ran out says so, and leads to a new request', res.status === 410 && page.includes('Tento odkaz už neplatí') && page.includes('href="/zacat?ico=57442452'))
res = await get('/podmienky')
page = await res.text()
check(
  'the terms are public, numbered and for search engines',
  res.status === 200 && page.includes('Obchodné podmienky služby Firmony') && page.includes('id="bod-10-4"') && !(res.headers.get('x-robots-tag') ?? '').includes('noindex'),
)
res = await get('/sitemap.xml')
check('the sitemap names the terms', (await res.text()).includes('/podmienky'))

// ---------------------------------------------------------------------------------------------------------------
// The end of a contract (point 10.4 of the terms): ended from our side, the last month's documents for ten days, the
// books handed over in the app, everything to download, and the company's data deleted ninety days after the end
// ---------------------------------------------------------------------------------------------------------------

await anna.post('/app/firma/prepnut', { firma: 'co-a' })
const shiftDay = (from, n) => {
  const d = new Date(`${from}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
res = await acc.post('/ucto/klienti/co-a/koniec', { den: skDay(endsOn), dovod: 'Neposiela doklady.' })
check('only the administrator ends a contract from our side', res.status === 404 && (await db.prepare("SELECT ends_on FROM companies WHERE id = 'co-a'").first())?.ends_on === null)
res = await admin.get('/ucto/klienti/co-a')
page = (await res.text()).replace(/ /g, ' ')
check(
  "the administrator finds it on the client's page, the earliest day of our notice named",
  page.includes('action="/ucto/klienti/co-a/koniec"') && page.includes(`najskôr ${skDay(endsOn).split('. ')[0]}.`),
)
res = await admin.post('/ucto/klienti/co-a/koniec', { den: skDay(day(-1)), dovod: 'Neposiela doklady.' })
check('a day already past is refused', res.status === 422)
res = await admin.post('/ucto/klienti/co-a/koniec', { den: skDay(endsOn), dovod: '' })
check('so is an end without its reason', res.status === 422 && (await res.text()).includes('Napíšte, prečo zmluvu ukončujeme.'))
const beforeEnd = (await sent()).length
res = await admin.post('/ucto/klienti/co-a/koniec', { den: skDay(endsOn), dovod: 'Klient opakovane neposiela doklady.' })
await settle()
const endedRow = await db.prepare("SELECT notice_side, notice_by, ends_on FROM companies WHERE id = 'co-a'").first()
check(
  'the administrator ends it, from our side, on the day given',
  res.status === 303 && endedRow?.notice_side === 'firmony' && endedRow.notice_by === bossRow?.id && endedRow.ends_on === endsOn,
  JSON.stringify(endedRow),
)
const endMsg = await db.prepare("SELECT body, side FROM messages WHERE company_id = 'co-a' ORDER BY created_at DESC, rowid DESC LIMIT 1").first()
check(
  'the client is told in the app what follows, never why',
  endMsg?.side === 'firmony' && endMsg.body.includes('ukončujeme') && endMsg.body.includes('stiahnete') && !endMsg.body.includes('neposiela'),
)
check(
  'the reason stays with the team, on record',
  JSON.parse((await db.prepare("SELECT detail FROM events WHERE action = 'contract.ended' AND company_id = 'co-a'").first())?.detail ?? '{}').reason === 'Klient opakovane neposiela doklady.',
)
const endBells = (await sent()).slice(beforeEnd).filter((m) => m.to === 'anna@firma-a.test' || m.to === 'jan@firma-a.test')
check('the client is rung, and the bell says nothing of it', endBells.length > 0 && endBells.every((m) => !m.text.includes('ukončujeme') && !m.text.includes('Firma A')))
res = await anna.get('/app/firma')
page = (await res.text()).replace(/ /g, ' ')
check(
  'the client reads that we ended it, what follows, and finds the download',
  page.includes('Zmluvu sme ukončili') &&
    page.includes('Posledný deň zmluvy') &&
    page.includes('Stiahnuť doklady a údaje') &&
    page.includes('/app/export?rok=') &&
    !page.includes('action="/app/firma/vypoved/spat"'),
)
res = await anna.get('/app')
check('a line above every page says when the contract ends', (await res.text()).replace(/ /g, ' ').includes('Zmluva skončí'))
res = await anna.post('/app/firma/vypoved/spat', {})
check('the client cannot take our end back', (await db.prepare("SELECT ends_on FROM companies WHERE id = 'co-a'").first())?.ends_on === endsOn)
res = await anna.post('/app/firma/vypoved', { potvrdit: '1' })
check('nor give a notice of its own over it', (await db.prepare("SELECT notice_side FROM companies WHERE id = 'co-a'").first())?.notice_side === 'firmony')
res = await admin.post('/ucto/klienti/co-a/koniec/zrusit', {})
const cancelled = await db.prepare("SELECT notice_side, ends_on FROM companies WHERE id = 'co-a'").first()
check(
  'the administrator takes it back while it runs, and the client reads it',
  res.status === 303 &&
    cancelled?.ends_on === null &&
    cancelled.notice_side === null &&
    (await db.prepare("SELECT body FROM messages WHERE company_id = 'co-a' ORDER BY created_at DESC, rowid DESC LIMIT 1").first())?.body.includes('rušíme'),
)

// The last month: ten days past the last day documents are still taken, but nothing new is issued and no bank linked
const setEnd = (onDay) =>
  db
    .prepare("UPDATE companies SET notice_at = ?, notice_by = ?, notice_side = 'firmony', ends_on = ? WHERE id = 'co-a'")
    .bind(nowS, bossRow?.id ?? '', onDay)
    .run()
await setEnd(day(-3))
res = await anna.get('/app')
page = (await res.text()).replace(/ /g, ' ')
check("after the last day the line says until when the last month's documents are taken", page.includes('Zmluva skončila') && page.includes('berieme do'))
const invoicesBefore = (await db.prepare("SELECT COUNT(*) AS n FROM invoices WHERE company_id = 'co-a'").first())?.n
res = await anna.post('/app/faktury', invoiceForm({}))
check('no invoice is issued after the last day', res.status === 409 && (await db.prepare("SELECT COUNT(*) AS n FROM invoices WHERE company_id = 'co-a'").first())?.n === invoicesBefore)
res = await anna.get('/app/faktury')
page = (await res.text()).replace(/ /g, ' ')
check('the invoices say so, and offer no new one', page.includes('nové faktúry tu už nevystavíte') && !page.includes('href="/app/faktury/nova"'))
res = await anna.get('/app/banka/pripojit?banka=Tatra%20banka')
check('no bank is linked after the last day', res.status === 303 && res.headers.get('location') === '/app/banka?chyba=koniec')
const docsBefore = (await db.prepare("SELECT COUNT(*) AS n FROM documents WHERE company_id = 'co-a'").first())?.n
res = await appPost('/app/doklady', {}, { files: [{ name: 'posledny.jpg', type: 'image/jpeg', bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 9, 8, 7, 6, 5]) }] })
check("the last month's documents are still taken", res.status === 303 && (await db.prepare("SELECT COUNT(*) AS n FROM documents WHERE company_id = 'co-a'").first())?.n === docsBefore + 1)

// Past the ten days: only the download is left; the data are not deleted before their ninety days
await setEnd(day(-20))
await tick(Date.now())
await settle(300)
check(
  'twenty days past the end nothing is deleted yet',
  (await db.prepare("SELECT purged_at FROM companies WHERE id = 'co-a'").first())?.purged_at === null &&
    (await db.prepare("SELECT COUNT(*) AS n FROM documents WHERE company_id = 'co-a'").first())?.n === docsBefore + 1,
)
res = await appPost('/app/doklady', {}, { files: [{ name: 'neskoro.jpg', type: 'image/jpeg', bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 1, 1, 1, 1]) }] })
page = (await res.text()).replace(/ /g, ' ')
check(
  'ten days past the last day no document is taken, and the page says why',
  res.status === 409 && page.includes('Doklady už neprijímame') && (await db.prepare("SELECT COUNT(*) AS n FROM documents WHERE company_id = 'co-a'").first())?.n === docsBefore + 1,
)
res = await anna.get('/app/doklady')
page = await res.text()
check('the page for documents offers no upload, only the download', !page.includes('method="post" action="/app/doklady"') && !page.includes('data-pick') && page.includes('href="/app/firma#stiahnut"'))
res = await sendMail(
  'doklady-aaaa11@firmony.io',
  rawMail({ to: 'doklady-aaaa11@firmony.io', attachments: [{ name: 'neskoro.pdf', type: 'application/pdf', bytes: new TextEncoder().encode('%PDF-1.4\n% neskoro\n%%EOF\n') }] }),
)
check('nor by email: the sender is told the contract ended', res.status === 400 && (await res.text()).includes('skončila'))
res = await anna.get('/app/platby')
check('nor a statement', !(await res.text()).includes('action="/app/banka"'))
res = await anna.get('/app')
page = (await res.text()).replace(/ /g, ' ')
check('the line separates download access and five-year legal retention', page.includes('si stiahnite do') && page.includes('päť rokov od skončenia zmluvy') && page.includes('href="/app/firma#stiahnut"'))

// Everything of the company, a year at a time
/** The files of a ZIP as an unzipper reads them, each checked against its local header and its sum. */
function unzip(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const end = bytes.length - 22
  if (end < 0 || view.getUint32(end, true) !== 0x06054b50) return null
  const files = []
  let at = view.getUint32(end + 16, true)
  for (let i = 0; i < view.getUint16(end + 10, true); i++) {
    const crcAt = view.getUint32(at + 16, true)
    const size = view.getUint32(at + 24, true)
    const nameLength = view.getUint16(at + 28, true)
    const offset = view.getUint32(at + 42, true)
    const name = new TextDecoder().decode(bytes.subarray(at + 46, at + 46 + nameLength))
    const start = offset + 30 + view.getUint16(offset + 26, true) + view.getUint16(offset + 28, true)
    const data = bytes.subarray(start, start + size)
    files.push({ name, data, ok: view.getUint32(offset, true) === 0x04034b50 && crc32(data) === crcAt })
    at += 46 + nameLength
  }
  return files
}
res = await anna.get(`/app/export?rok=${year}`)
const archive = res.status === 200 ? unzip(new Uint8Array(await res.arrayBuffer())) : null
check(
  "a year's archive downloads as a ZIP, under the company's IČO",
  res.status === 200 &&
    res.headers.get('content-type') === 'application/zip' &&
    (res.headers.get('content-disposition') ?? '').includes(`firmony-57442452-${year}.zip`) &&
    res.headers.get('cache-control') === 'private, no-store',
)
check('every file in it reads, every sum right', archive !== null && archive.length > 6 && archive.every((f) => f.ok), archive?.map((f) => f.name).join(' | '))
const named = (name) => archive?.find((f) => f.name === name)
const text = (f) => new TextDecoder().decode(f?.data ?? new Uint8Array())
await checkPeriodLocks({ db, acc, admin, anna, nowS, lucia, today: day(0), files, unzip, text })

const validManifest = (contents) => {
  const m = JSON.parse(text(contents.find((f) => f.name === 'manifest.json')))
  return m.files.length === contents.length - 1 && m.files.every((record) => { const file = contents.find((f) => f.name === record.name); return file && file.data.length === record.bytes && createHash('sha256').update(file.data).digest('hex') === record.sha256 })
}
check('the handover manifest verifies every file by name, byte length and SHA-256', validManifest(archive))
check('lossless payroll, employee, filing and history data are included even in a year with no payroll', ['data/zamestnanci.json', 'data/mzdy.json', 'data/historia-miezd.json', 'data/zavierky.json', 'data/historia-zavierok.json', 'data/podania.json', 'data/dph.json', 'data/interne-doklady.json'].every((name) => named(name)))
check(
  'it holds what it says: the lists, the messages, the contract',
  ['citajte.txt', 'doklady.csv', 'platby.csv', 'faktury.csv', 'spravy.txt', 'zmluva.txt'].every((n) => named(n)),
)
const bom = (f) => f?.data[0] === 0xef && f.data[1] === 0xbb && f.data[2] === 0xbf
check(
  'the lists open in Slovak Excel',
  bom(named('platby.csv')) && bom(named('doklady.csv')) && text(named('platby.csv')).startsWith('Dátum;') && text(named('platby.csv')).includes('KAVIAREN NA ROHU KOSICE'),
)
const ublFile = archive?.find((f) => /^faktury\/\d{8}\.xml$/.test(f.name))
check('the issued invoices are e-invoices', Boolean(ublFile) && text(ublFile).includes('urn:oasis:names:specification:ubl:schema:xsd:Invoice-2'))
const docFile = archive?.find((f) => f.name.startsWith('doklady/') && f.name.endsWith('.pdf'))
check(
  'the documents are the originals as they came, named in plain letters',
  Boolean(docFile) && text(docFile).startsWith('%PDF') && archive.filter((f) => f.name.startsWith('doklady/')).every((f) => /^[\x20-\x7e]+$/.test(f.name)),
)
check(
  'the list of documents names each file as it stands in the archive',
  archive.filter((f) => f.name.startsWith('doklady/')).every((f) => text(named('doklady.csv')).includes(f.name)),
)
check('the contract is in it with its terms', text(named('zmluva.txt')).includes('Firma A s. r. o.') && text(named('zmluva.txt')).includes('10.4 '))
const statementFile = archive?.find((f) => f.name.startsWith('vypisy/'))
check(
  'and the bank statements as they came, each named in the list of them',
  Boolean(statementFile) && text(statementFile) === new TextDecoder().decode(camtBytes) && text(named('vypisy.csv')).includes(statementFile.name) && text(named('citajte.txt')).includes('vypisy.csv'),
  archive
    ?.filter((f) => f.name.startsWith('vypisy'))
    .map((f) => f.name)
    .join(' | '),
)
check(
  'and the books of the year: the journal, the general ledger, the trial balance, the open items',
  ['uctovnictvo/dennik.csv', 'uctovnictvo/hlavna-kniha.csv', 'uctovnictvo/predvaha.csv', 'uctovnictvo/saldokonto.csv'].every((n) => bom(named(n))) &&
    text(named('uctovnictvo/dennik.csv')).includes('Zápis do knihy') &&
    text(named('citajte.txt')).includes('uctovnictvo/dennik.csv'),
  archive?.map((f) => f.name).join(' | '),
)
const ownFiles = await db
  .prepare("SELECT COUNT(*) AS n FROM documents WHERE company_id = 'co-a' AND deleted_at IS NULL AND file_key IS NOT NULL AND substr(COALESCE(issued_on, date(created_at, 'unixepoch')), 1, 4) = ?")
  .bind(year)
  .first()
check(
  "the company's own documents, every one, and no other company's",
  archive?.filter((f) => f.name.startsWith('doklady/')).length === ownFiles?.n && !archive.some((f) => text(f).includes('Firma B s. r. o.')),
  `${archive?.filter((f) => f.name.startsWith('doklady/')).length} of ${ownFiles?.n}`,
)
res = await anna.get('/app/export?rok=1999')
check('a year without anything is not found', res.status === 404)
check('the download is on record', (await db.prepare("SELECT COUNT(*) AS n FROM events WHERE action = 'export.downloaded' AND company_id = 'co-a' AND user_id = 'u-a'").first())?.n === 1)

// The books handed over: by the accountant, in the app (the client has read what was written before)
await anna.get('/app/spravy')
const ledger = new TextEncoder().encode('%PDF-1.4\n% Hlavna kniha 2026\n%%EOF\n')
const beforeHand = (await sent()).length
res = await acc.upload('/ucto/klienti/co-a/odovzdanie', { name: 'Hlavná kniha 2026.pdf', type: 'application/pdf', bytes: ledger })
await settle()
const handed = await db.prepare("SELECT id, file_name, r2_key FROM company_files WHERE company_id = 'co-a' AND kind = 'handover'").first()
check('the accountant hands the books over in the app', res.status === 303 && handed?.file_name === 'Hlavná kniha 2026.pdf')
check(
  'the client reads where they are, and is rung without a word of it',
  (await db.prepare("SELECT body FROM messages WHERE company_id = 'co-a' ORDER BY created_at DESC, rowid DESC LIMIT 1").first())?.body.includes('Hlavná kniha 2026.pdf') &&
    (await sent()).slice(beforeHand).some((m) => m.to === 'anna@firma-a.test' && !m.text.includes('Hlavná')),
)
res = await acc.upload('/ucto/klienti/co-a/odovzdanie', { name: 'kniha.pdf', type: 'application/pdf', bytes: new Uint8Array([0x4d, 0x5a, 0x90, 0, 3, 0, 0, 0, 4, 0]) })
check('a program is not handed over, whatever it is called', res.status === 422)
res = await anna.get('/app/firma')
check('the client finds the books under the download', (await res.text()).includes(`/app/odovzdanie/${handed?.id}`))
res = await anna.get(`/app/odovzdanie/${handed?.id}`)
check(
  'and downloads them, never shown in the browser',
  res.status === 200 && (res.headers.get('content-disposition') ?? '').startsWith('attachment') && new Uint8Array(await res.arrayBuffer()).length === ledger.length,
)
const handoverForeign = as((await signIn('boris@firma-b.test')).cookie)
res = await handoverForeign.get(`/app/odovzdanie/${handed?.id}`)
check('nobody of another company gets them', res.status === 404)
// Point 10.4: the books handed over and the power of attorney given up. Files alone do not finish it.
const handoverRow = async () => (await (await admin.get('/ucto')).text()).match(/<a class="tbl__row[^>]*href="\/ucto\/klienti\/co-a"[\s\S]*?<\/a>/)?.[0] ?? ''
check('files alone leave the handover owed: the power of attorney is still ours to give up', (await handoverRow()).includes('Odovzdanie mešká') || (await handoverRow()).includes('Odovzdať do'))
{
  const handoverHtml = await (await acc.get('/ucto/klienti/co-a')).text()
  check('the client page asks for the power of attorney to be given up', handoverHtml.includes('action="/ucto/klienti/co-a/odovzdanie/plna-moc"'))
  if (process.env.FIRMONY_CAPTURE_DIR) writeFileSync(`${process.env.FIRMONY_CAPTURE_DIR}/handover-resign.html`, handoverHtml)
}
res = await acc.post('/ucto/klienti/co-a/odovzdanie/plna-moc', {})
await acc.post('/ucto/klienti/co-a/odovzdanie/plna-moc', {})
check(
  'given up: recorded once, with who, and the page says so',
  res.status === 303 && (await db.prepare("SELECT COUNT(*) AS n FROM events WHERE company_id = 'co-a' AND action = 'poa.resigned'").first())?.n === 1 &&
    (await (await acc.get('/ucto/klienti/co-a')).text()).replace(/\u00a0/g, ' ').includes('Vzdanie plnej moci zaznamenané'),
)
res = await acc.post('/ucto/klienti/co-b/odovzdanie/plna-moc', {})
check('never for a client that is not hers', res.status === 404)
const handedClientRow = await handoverRow()
check('the client row no longer asks for its handover once it was made', Boolean(handedClientRow) && !handedClientRow.includes('Odovzdanie mešká'))

await checkFilings({ db, files, acc, admin, lucia, nowS, day, signIn, as, unzip, capture: process.env.FIRMONY_CAPTURE_DIR })
await checkBundle({ db, acc, lucia, nowS, day, unzip, capture: process.env.FIRMONY_CAPTURE_DIR })
await checkAssets({ db, acc, lucia, nowS, day, capture: process.env.FIRMONY_CAPTURE_DIR })
await checkClosingPod({ db, acc, lucia, nowS, day, unzip, capture: process.env.FIRMONY_CAPTURE_DIR })
await checkStock({ db, acc, lucia, nowS, day, capture: process.env.FIRMONY_CAPTURE_DIR })
await checkPayrollFull({ db, acc, lucia, nowS, day, capture: process.env.FIRMONY_CAPTURE_DIR })
await checkTakeover({ db, acc, lucia, nowS, day, capture: process.env.FIRMONY_CAPTURE_DIR })
await checkCurrency({ db, acc, lucia, nowS, day })
await checkOss({ db, acc, lucia, nowS, day, capture: process.env.FIRMONY_CAPTURE_DIR })
await checkIntrastat({ db, acc, lucia, nowS, day, capture: process.env.FIRMONY_CAPTURE_DIR })
await checkBundleExtras({ db, acc, lucia, nowS, day, unzip, capture: process.env.FIRMONY_CAPTURE_DIR })
await checkJointStock({ db, admin, acc, lucia, nowS, day, post, capture: process.env.FIRMONY_CAPTURE_DIR })
await checkLists({ db, nowS, signIn, as })
await checkCreditNotes({ db, nowS, signIn, as, day, capture: process.env.FIRMONY_CAPTURE_DIR })
await checkAdvances({ db, nowS, signIn, as, day, capture: process.env.FIRMONY_CAPTURE_DIR })
await checkInvoiceCurrency({ db, nowS, signIn, as, day, capture: process.env.FIRMONY_CAPTURE_DIR })
await checkRepeats({ db, nowS, signIn, as, day, tick, capture: process.env.FIRMONY_CAPTURE_DIR })
await checkPayOrders({ db, nowS, signIn, as, day, capture: process.env.FIRMONY_CAPTURE_DIR })
await checkNumbering({ db, files, nowS, signIn, as, day, capture: process.env.FIRMONY_CAPTURE_DIR })
await checkTrips({ db, acc, lucia, nowS, signIn, as, day, capture: process.env.FIRMONY_CAPTURE_DIR })
await checkCash({ db, acc, lucia, nowS, signIn, as, day, capture: process.env.FIRMONY_CAPTURE_DIR })
await checkDunning({ db, nowS, lucia, signIn, as, day, tick, capture: process.env.FIRMONY_CAPTURE_DIR })
await checkCenters({ db, acc, lucia, nowS, signIn, as, day, tick, capture: process.env.FIRMONY_CAPTURE_DIR })
await checkTakings({ db, acc, lucia, nowS, signIn, as, day, capture: process.env.FIRMONY_CAPTURE_DIR })
await checkApprovals({ db, acc, lucia, nowS, signIn, as, day, capture: process.env.FIRMONY_CAPTURE_DIR, tick, sent, settle, nineFive })
await checkMeals({ db, acc, lucia, nowS, day, capture: process.env.FIRMONY_CAPTURE_DIR, signIn, as })
await checkGarnish({ db, acc, lucia, nowS, day, capture: process.env.FIRMONY_CAPTURE_DIR })
await checkVatRatio({ db, acc, lucia, nowS, day, capture: process.env.FIRMONY_CAPTURE_DIR })
await checkUnpaid53b({ db, acc, lucia, nowS, day })
await checkBadDebt({ db, acc, lucia, nowS, day, capture: process.env.FIRMONY_CAPTURE_DIR })
await checkTriangle({ db, acc, lucia, nowS, day })
await checkAssetVat({ db, acc, lucia, nowS, day, capture: process.env.FIRMONY_CAPTURE_DIR })
await checkWorkPay({ db, acc, admin, lucia, nowS, day, capture: process.env.FIRMONY_CAPTURE_DIR })
await checkUsers({ db, admin, acc, lucia, nowS, capture: process.env.FIRMONY_CAPTURE_DIR })
await checkAiAccuracy({ db, acc, admin, lucia, nowS, capture: process.env.FIRMONY_CAPTURE_DIR })
await checkAutobook({ db, acc, lucia, nowS, day, capture: process.env.FIRMONY_CAPTURE_DIR })
await checkAutobookAtomic({ db, nowS, day })
await checkVatRegistration({ db, acc, lucia, nowS, day })
await checkTransactionTax({ db, acc, lucia, nowS, day })
await checkPayrollReports({ db, files, acc, admin, lucia, nowS, day, signIn, as, unzip, capture: process.env.FIRMONY_CAPTURE_DIR })
await checkPrehlad({ db, files, acc, admin, lucia, nowS, day, signIn, as, unzip, capture: process.env.FIRMONY_CAPTURE_DIR })
await checkHealthReports({ db, files, acc, admin, lucia, nowS, day, signIn, as, unzip, capture: process.env.FIRMONY_CAPTURE_DIR, foreign:handoverForeign })
await checkSocialReports({ db, files, acc, admin, lucia, nowS, day, signIn, as, unzip, capture: process.env.FIRMONY_CAPTURE_DIR, foreign:handoverForeign })
await checkPayrollMigration({ db, nowS, day })
await checkHealthMigration({ db, nowS, day })
await checkSocialMigration({ db, nowS, day })
await checkAmlMigration()
await checkRestore({ db, files, annaCookie, site, today: day(0), nowS })

// Ninety days past the last day the company's data are deleted; the identification stays five years
await setEnd(day(-80))
const poaKept = await db.prepare("SELECT r2_key FROM company_files WHERE company_id = 'co-a' AND kind = 'poa'").all()
// A recapitulative statement marked as filed while the contract ran, and a closing.
await db.prepare("INSERT INTO filings (company_id, kind, period, filed_on, filed_at, filed_by) VALUES ('co-a', 'sv', '2026-01', ?, ?, NULL)").bind(day(-120), nowS).run()
await db.prepare("INSERT INTO closings (company_id, year, inputs, filed_on, filed_at) VALUES ('co-a', 2025, '{}', ?, ?)").bind(day(-120), nowS).run()
await db.prepare("INSERT INTO employees (id, company_id, name, insurer, started_on, wage_cents, created_at) VALUES ('emp-a', 'co-a', 'Zamestnanec A', '25', '2026-01-01', 100000, ?)").bind(nowS).run()
await db.prepare("INSERT INTO payroll_runs (company_id, period, lines) VALUES ('co-a', '2026-01', '[]')").run()
const exportedSlip = payslip({ period: '2026-01', gross: 100000, days: 31, declaration: true, children: [], disabled: false, healthDeduction: false, healthMinimumExempt: false })
const exportedLine = { employeeId: 'emp-a', name: 'Zamestnanec A', insurer: '25', gross: 100000, days: 31, iban: null, health: { disabled:false, minimumExempt:false, deductionClaimed:false }, slip: exportedSlip }
await db.prepare("UPDATE payroll_runs SET payday = '2026-02-10', lines = ?, closed_at = ?, closed_on = ?, closed_by = ? WHERE company_id = 'co-a' AND period = '2026-01'").bind(JSON.stringify([exportedLine]), nowS, day(0), lucia.id).run()
const handoverPayrollCompany = companyOf(await db.prepare("SELECT * FROM companies WHERE id = 'co-a'").first())
const handoverPayrollUser = await db.prepare('SELECT * FROM users WHERE id = ?').bind(lucia.id).first()
await payrollReporting.initializeClosedRun(db, handoverPayrollCompany, '2026-01', handoverPayrollUser)
await payrollReporting.recordPayout(db, await payrollReporting.closureOf(db, 'co-a', '2026-01'), handoverPayrollUser, { paidOn: '2026-02-10', reportPeriod: '2026-02', reference: 'TEST ONLY final settled payroll', reason: '', checked: true, revision: 0 }, day(0))
const handoverPayrollAdmin = await db.prepare("SELECT * FROM users WHERE team = 'admin' ORDER BY id LIMIT 1").first()
await payrollReporting.recordPayout(db, await payrollReporting.closureOf(db, 'co-a', '2026-01'), handoverPayrollAdmin, { paidOn: '2026-02-10', reportPeriod: '2026-01', reference: 'TEST ONLY final settled payroll', reason: 'TEST expert corrected synthetic reporting period', checked: true, revision: 1 }, day(0))
const extraHandoverTarget = (await payrollReporting.reportItems(db, 'co-a')).find((r) => r.kind === 'tax' && r.period === '2026-02')
const extraHandoverScope = await payrollGeneration.reviewScope(db, 'co-a', extraHandoverTarget.id)
const extraHandoverReview = await payrollGeneration.retireTarget(db, files, 'co-a', extraHandoverTarget.id, handoverPayrollAdmin, { revision: extraHandoverScope.revision, reason: 'TEST no actual report was sent and all income belongs to the independently reviewed January period', reference: 'TEST final expert scope resolution', checked: true })
check('a synthetic unsent incorrect period has retained expert resolution before final handover', extraHandoverReview.ok)
const originalXml = '<?xml version="1.0" encoding="UTF-8"?><fixture>original archived filing</fixture>'
const originalSnapshot = JSON.stringify({ rows: { r1050: 0 }, balance: {}, profit: {}, advancesNext: { kind: 'none', each: 0 }, files: { version: 1, declaredOn: day(0), return: { name: 'DPPO_A.xml', xml: originalXml, sha256: createHash('sha256').update(originalXml).digest('hex') }, statements: { name: 'UZ_A.xml', xml: originalXml, sha256: createHash('sha256').update(originalXml).digest('hex') } } })
await db.prepare("UPDATE closings SET filed = ? WHERE company_id = 'co-a' AND year = 2025").bind(originalSnapshot).run()
await tick(Date.now())
await settle(500)
check('ninety days and an uploaded handover PDF cannot delete unacknowledged accounting data', (await db.prepare("SELECT purged_at FROM companies WHERE id = 'co-a'").first()).purged_at === null && (await db.prepare("SELECT COUNT(*) AS n FROM employees WHERE company_id = 'co-a'").first()).n === 1)
// Complete the current fixture's external delivery before acknowledging its final handover. These originals are
// TEST_ONLY evidence, never responses from an authority. Old, inactive prepared packages remain in the archive.
const pendingHandover = (await db.prepare("SELECT * FROM filing_packages WHERE company_id = 'co-a' AND status <> 'accepted'").all()).results
for (const pkg of pendingHandover) if (await currentPackage(db, pkg)) {
  res = await acc.upload(`/ucto/klienti/co-a/podania/${pkg.id}/stav`, { name: 'TEST-ONLY-final-receipt.xml', type: 'application/xml', bytes: new TextEncoder().encode(`<TEST_ONLY form="${pkg.kind}" reference="TEST-FINAL-${pkg.id}"/>`) }, { to: 'accepted', revision: String(pkg.revision), externalOn: day(0), reference: `TEST-FINAL-${pkg.id}`, channel: 'TEST-ONLY', checked: '1', reason: 'TEST-ONLY final handover proof' }, 'receipt')
  check(`current ${pkg.kind} delivery is completed before its final acknowledged archive`, res.status === 303)
}
for (const target of (await payrollReporting.reportItems(db, 'co-a')).filter((r) => r.active)) {
  const finalGenerationPlan = target.kind === 'tax' ? await payrollGeneration.generationPlan(db, 'co-a', target.id, day(0)) : null
  let saved
  if (target.kind === 'sp') {
    let review=await socialReporting.socialPlan(db,'co-a',target.id,day(0))
    if (!review.identities.length) {
      await socialReporting.recordSocialFact(db,review,handoverPayrollUser,review.token,{employee:'emp-a',section:'identity',revision:0,value:'9010101234',mode:'',reference:'TEST final verified original identity',reason:'',checked:true})
      review=await socialReporting.socialPlan(db,'co-a',target.id,day(0))
    }
    await socialReporting.recordSocialFact(db,review,handoverPayrollUser,review.token,{employee:'emp-a',section:'relation',revision:0,value:'000000009999',mode:'',reference:'TEST final registered legal relationship',reason:'',checked:true})
    review=await socialReporting.socialPlan(db,'co-a',target.id,day(0))
    await socialReporting.recordSocialFact(db,review,handoverPayrollUser,review.token,{employee:'emp-a',section:'hours',revision:0,value:'160',mode:'known',reference:'TEST final verified analytical hours',reason:'',checked:true})
    review=await socialReporting.socialPlan(db,'co-a',target.id,day(0))
    saved=await socialReporting.generateSocial(db,files,review,handoverPayrollUser,review.token,{name:handoverPayrollCompany.name,payer:'6333333300',iban:'SK3112000000198742637541',firstName:'TEST',lastName:'Reviewer',phone:'00421900000000',email:'test@example.test',preparedBy:'TEST final social reviewer',declaredOn:day(0),kind:'R',reason:'',reference:'TEST final complete ordinary social scope',checked:true},day(0))
  } else if (target.kind === 'health25') {
    await healthReporting.recordHealthIdentity(db,'co-a',target.id,'emp-a',handoverPayrollUser,{revision:0,identifier:'9010101234',reference:'TEST final verified employee identity',reason:'',checked:true})
    const review=await healthReporting.healthPlan(db,'co-a',target.id,day(0))
    saved=await healthReporting.generateHealth(db,files,review,handoverPayrollUser,review.token,{name:handoverPayrollCompany.name,dic:handoverPayrollCompany.dic,payer:'6333333300',branch:'2500',iban:'SK3112000000198742637541',phone:'',email:'',sendOn:day(0),batch:'1',kind:'N',reason:'',reference:'TEST final complete health source review',checked:true},day(0))
  } else saved = finalGenerationPlan ? await payrollGeneration.generatePrehlad(db, files, finalGenerationPlan, handoverPayrollUser, finalGenerationPlan.token, { dic: handoverPayrollCompany.dic, name: handoverPayrollCompany.name, street: 'TEST street', number: '12', postal: '04001', city: 'Košice', preparedBy: 'TEST final handover reviewer', phone: '', email: '', declaredOn: day(0), kind: 'R', foundOn: '', representation: 'company', reason: '', reference: 'TEST final complete monthly scope review', checked: true }, day(0)) : await payrollReporting.saveReport(db, files, target, handoverPayrollUser, { revision: target.revision, variant: 'TEST ONLY final report', checked: true, reason: '', file: { name: 'TEST_ONLY-final-payroll.xml', bytes: new TextEncoder().encode(`<TEST_ONLY recipient="${target.kind}"/>`) } })
  const result = saved.ok && await payrollReporting.changeReportDelivery(db, files, await payrollReporting.reportPackage(db, 'co-a', saved.id), handoverPayrollUser, { to: 'accepted', revision: 0, externalOn: day(0), reference: `TEST-PAYROLL-FINAL-${target.kind}`, channel: 'TEST ONLY', checked: true, reason: '', receipt: { name: 'TEST_ONLY-final-receipt.xml', bytes: new TextEncoder().encode(`<TEST_ONLY receipt="${target.kind}"/>`) } }, day(0))
  check(`current payroll ${target.kind} evidence completes before final acknowledged handover`, result?.ok)
}
const handoverYears = await exportYears(db, 'co-a')
check('a closing-only year is offered for export', handoverYears.includes('2025'))
const interrupted = await beginExport(db, 'co-a', '2026', 'u-a')
const refusedIncomplete = await confirmExport(db, 'co-a', interrupted.id)
check('an incomplete stream cannot be acknowledged even by calling the storage function directly', refusedIncomplete.meta.changes === 0)
await db.prepare("UPDATE employees SET wage_cents = 100001 WHERE id = 'emp-a'").run()
const refusedChanged = await completeExport(db, interrupted.id)
check('a dataset changing during export cannot be marked complete', refusedChanged.meta.changes === 0)
await db.prepare("UPDATE employees SET wage_cents = 100000 WHERE id = 'emp-a'").run()
let received = []
for (const y of handoverYears) {
  res = await anna.get(`/app/export?rok=${y}`)
  const contents = unzip(new Uint8Array(await res.arrayBuffer()))
  check(`the complete archive of ${y} verifies before acknowledgement`, res.status === 200 && validManifest(contents))
  const m = JSON.parse(text(contents.find((f) => f.name === 'manifest.json')))
  received.push(m.receipt)
  if (y === '2026') check('closed payslips are exported from the stored snapshot with every employee', JSON.parse(text(contents.find((f) => f.name === 'mzdy/2026-01/uzavrete-pasky.json')))[0].slip.net === exportedSlip.net && JSON.parse(text(contents.find((f) => f.name === 'data/zamestnanci.json')))[0].name === 'Zamestnanec A')
  if (y === '2025') check('the archive contains the original filed XML without recalculation', text(contents.find((f) => f.name === 'podania/2025/priznanie.xml')) === originalXml && JSON.parse(text(contents.find((f) => f.name === 'data/historia-zavierok.json'))).length > 0)
}
res = await anna.post('/app/export/potvrdit', { export: received[0] })
check('acknowledgement requires the explicit received-content checkbox', res.status === 422)
const borisExporter = as((await signIn('boris@firma-b.test')).cookie)
res = await borisExporter.post('/app/export/potvrdit', { export: received[0], potvrdit: '1' })
check('one company cannot acknowledge another company\'s archive', res.status === 409)
res = await anna.post('/app/export/potvrdit', { export: received[0], potvrdit: '1' })
check('the owner can acknowledge a fully completed current archive', res.status === 303)
await tick(Date.now()); await settle(100)
check('acknowledging only one of several years still blocks deletion', (await db.prepare("SELECT purged_at FROM companies WHERE id = 'co-a'").first()).purged_at === null)
for (const id of received.slice(1)) await anna.post('/app/export/potvrdit', { export: id, potvrdit: '1' })
await db.prepare("UPDATE employees SET wage_cents = 110000 WHERE id = 'emp-a'").run()
await tick(Date.now()); await settle(100)
check('a change after acknowledged exports invalidates handover and prevents deletion', (await db.prepare("SELECT purged_at FROM companies WHERE id = 'co-a'").first()).purged_at === null && await confirmedRevision(db, 'co-a', handoverYears) === null)
res = await anna.post('/app/export/potvrdit', { export: received[0], potvrdit: '1' })
check('a stale acknowledgement is refused', res.status === 409)
for (const y of handoverYears) {
  res = await anna.get(`/app/export?rok=${y}`)
  const contents = unzip(new Uint8Array(await res.arrayBuffer()))
  const m = JSON.parse(text(contents.find((f) => f.name === 'manifest.json')))
  await anna.post('/app/export/potvrdit', { export: m.receipt, potvrdit: '1' })
}
await tick(Date.now()); await settle(500)
check('even a fully acknowledged export cannot shorten five-year retention',(await db.prepare("SELECT purge_started_at,purged_at FROM companies WHERE id='co-a'").first()).purge_started_at === null)
await setEnd(day(-91))
const recordsBeforeArchive=await db.prepare("SELECT (SELECT COUNT(*) FROM documents WHERE company_id='co-a') AS docs,(SELECT COUNT(*) FROM messages WHERE company_id='co-a') AS messages,(SELECT COUNT(*) FROM payments WHERE company_id='co-a') AS payments").first()
res=await anna.get(`/app/export?rok=${handoverYears[0]}`)
check('client export access ends by the calendar even before the archive scheduler runs',res.status!==200)
res=await acc.get('/ucto/klienti/co-a/aml')
check('the assigned accountant loses archived AML access before the scheduler runs',res.status===404)
await archiveEnded({DB:db,FILES:files},day(0))
const recordsAfterArchive=await db.prepare("SELECT (SELECT COUNT(*) FROM documents WHERE company_id='co-a') AS docs,(SELECT COUNT(*) FROM messages WHERE company_id='co-a') AS messages,(SELECT COUNT(*) FROM payments WHERE company_id='co-a') AS payments").first()
check('archiving after ninety days preserves every document, message and payment',JSON.stringify(recordsBeforeArchive)===JSON.stringify(recordsAfterArchive) && (await files.list({prefix:'companies/co-a/'})).objects.length>0)
const amlArchiveAdmin=as((await signIn('ahoj@firmony.io')).cookie)
res=await amlArchiveAdmin.get('/ucto/archiv/co-a')
page=await res.text()
check('only the designated person gets a read-only archive with complete yearly exports',res.status===200 && page.includes('data-aml-archive') && page.includes('/ucto/archiv/co-a/uctovnictvo.zip') && !(/<section[^>]*data-aml-archive[\s\S]*?<\/section>/.exec(page)?.[0] ?? '').includes('method="post"'))
if(process.env.FIRMONY_CAPTURE_DIR) writeFileSync(`${process.env.FIRMONY_CAPTURE_DIR}/aml-archive.html`,page)
res=await amlArchiveAdmin.get('/ucto/archiv/co-a/aml.json')
const archivedAml=await res.json()
check('the archive preserves all declaration versions, sources, decisions, reports and events',res.status===200 && archivedAml.declarations.length===2 && archivedAml.dossiers.length===2 && archivedAml.history.some((h)=>h.checks.length>=6 && h.decisions.length>0) && archivedAml.reports.length>=2 && archivedAml.events.length>0)
res=await security.admin2.get('/ucto/archiv/co-a/aml.json')
check('an unrelated administrator cannot fetch another officer’s legal archive',res.status===404)
res=await acc.get('/ucto/archiv/co-a/aml.json')
check('the ordinary accountant cannot fetch the archive JSON directly',res.status===404)
res=await amlArchiveAdmin.post(`/ucto/aml/spisy/${companyAml.dossier.id}/kontrola`,companyCheckFields('pep'))
check('even the designated person cannot rewrite archived verification',res.status===404)
const retainedUntil=new Date(`${day(-91)}T12:00:00Z`);retainedUntil.setUTCFullYear(retainedUntil.getUTCFullYear()+5);retainedUntil.setUTCDate(retainedUntil.getUTCDate()+1)
const afterFiveYears=retainedUntil.toISOString().slice(0,10)
const beforeFiveYears=await purgeCompany({DB:db,FILES:files},'co-a',day(0))
check('an archived company still cannot be erased before the legal period',beforeFiveYears.rows===0 && beforeFiveYears.files===0)
const stagedPurge=await purgeCompany({DB:db,FILES:files},'co-a',afterFiveYears)
check('the destructive phase still waits for the intervention window after legal expiry',stagedPurge.rows===0 && (await db.prepare("SELECT purge_delete_started_at FROM companies WHERE id='co-a'").first()).purge_delete_started_at===null)
await db.prepare("UPDATE companies SET purge_started_at=? WHERE id='co-a'").bind(nowS-86401).run()
const lawfulPurge=await purgeCompany({DB:db,FILES:files},'co-a',afterFiveYears)
check('after five calendar years the controlled financial purge completes',lawfulPurge.rows>0)
let frozenWrite=false
try{await db.prepare("INSERT INTO payroll_runs(company_id,period,lines) VALUES('co-a','2026-02','[]')").run()}catch{frozenWrite=true}
check('a completed purge cannot receive fresh accounting writes',frozenWrite)
const leftover = await db
  .prepare(
    `SELECT (SELECT COUNT(*) FROM documents WHERE company_id = 'co-a') + (SELECT COUNT(*) FROM payments WHERE company_id = 'co-a') + (SELECT COUNT(*) FROM messages WHERE company_id = 'co-a')
       + (SELECT COUNT(*) FROM invoices WHERE company_id = 'co-a') + (SELECT COUNT(*) FROM accounts WHERE company_id = 'co-a') + (SELECT COUNT(*) FROM members WHERE company_id = 'co-a')
       + (SELECT COUNT(*) FROM links WHERE company_id = 'co-a') + (SELECT COUNT(*) FROM bank_links WHERE company_id = 'co-a') + (SELECT COUNT(*) FROM company_files WHERE company_id = 'co-a' AND kind <> 'poa')
       + (SELECT COUNT(*) FROM vat_returns WHERE company_id = 'co-a') + (SELECT COUNT(*) FROM ledger_entries WHERE company_id = 'co-a') + (SELECT COUNT(*) FROM companies WHERE id = 'co-a' AND tax_account IS NOT NULL)
       + (SELECT COUNT(*) FROM statements WHERE company_id = 'co-a') + (SELECT COUNT(*) FROM filings WHERE company_id = 'co-a') + (SELECT COUNT(*) FROM closings WHERE company_id = 'co-a')
       + (SELECT COUNT(*) FROM employees WHERE company_id = 'co-a') + (SELECT COUNT(*) FROM payroll_runs WHERE company_id = 'co-a')
       + (SELECT COUNT(*) FROM closing_history WHERE company_id = 'co-a') + (SELECT COUNT(*) FROM payroll_history WHERE company_id = 'co-a')
       + (SELECT COUNT(*) FROM filing_history WHERE company_id = 'co-a')
       + (SELECT COUNT(*) FROM filing_packages WHERE company_id = 'co-a') + (SELECT COUNT(*) FROM filing_events WHERE company_id = 'co-a')
       + (SELECT COUNT(*) FROM payroll_generations WHERE company_id = 'co-a') + (SELECT COUNT(*) FROM payroll_target_reviews WHERE company_id = 'co-a')
       + (SELECT COUNT(*) FROM payroll_health_generations WHERE company_id = 'co-a') + (SELECT COUNT(*) FROM payroll_health_ids WHERE company_id = 'co-a')
       + (SELECT COUNT(*) FROM payroll_social_generations WHERE company_id = 'co-a') + (SELECT COUNT(*) FROM payroll_social_inputs WHERE company_id = 'co-a') + (SELECT COUNT(*) FROM payroll_social_relations WHERE company_id = 'co-a')
       + (SELECT COUNT(*) FROM payroll_closures WHERE company_id = 'co-a') + (SELECT COUNT(*) FROM payroll_payouts WHERE company_id = 'co-a')
       + (SELECT COUNT(*) FROM payroll_targets WHERE company_id = 'co-a') + (SELECT COUNT(*) FROM payroll_packages WHERE company_id = 'co-a') + (SELECT COUNT(*) FROM payroll_events WHERE company_id = 'co-a')
       + (SELECT COUNT(*) FROM export_receipts WHERE company_id = 'co-a') + (SELECT COUNT(*) FROM company_data_revisions WHERE company_id = 'co-a') AS n`,
  )
  .first()
check('documents, payments, messages, invoices, accounts, people, the handover, the VAT filed, the filings marked, the closings, the employees and their payroll, the books and the statements are gone', leftover?.n === 0, JSON.stringify(leftover))
const objects = await files.list({ prefix: 'companies/co-a/' })
check(
  'and so are their files, all but the power of attorney',
  objects.objects.every((o) => o.key.startsWith('companies/co-a/aml/') || poaKept.results.some((p) => p.r2_key === o.key)) && poaKept.results.every((p) => objects.objects.some((o) => o.key === p.r2_key)),
  objects.objects.map((o) => o.key).join(' '),
)
check(
  'the declaration, the risk and the reports stay, as the law wants',
  (await db.prepare("SELECT COUNT(*) AS n FROM declarations WHERE company_id = 'co-a'").first())?.n > 0 &&
    (await db.prepare("SELECT COUNT(*) AS n FROM company_files WHERE company_id = 'co-a' AND kind = 'poa'").first())?.n === poaKept.results.length,
)
check(
  'a person who belonged to the company alone is gone; one in another company stays',
  (await db.prepare("SELECT COUNT(*) AS n FROM users WHERE email = 'jan@firma-a.test'").first())?.n === 0 && (await db.prepare("SELECT COUNT(*) AS n FROM users WHERE id = 'u-a'").first())?.n === 1,
)
res = await anna.get('/app')
check('the client is no longer in it', !(await res.text()).includes('Firma A s. r. o.'))
res = await sendMail(
  'doklady-aaaa11@firmony.io',
  rawMail({ to: 'doklady-aaaa11@firmony.io', attachments: [{ name: 'po.pdf', type: 'application/pdf', bytes: new TextEncoder().encode('%PDF-1.4\n%%EOF\n') }] }),
)
check('its address for documents no longer exists', res.status === 400)
res = await admin.get('/ucto')
page = await res.text()
check('the administrator finds it among the clients that ended, with what the law keeps', page.includes('Skončení klienti') && page.includes('href="/ucto/archiv/co-a"'))
res = await admin.get('/ucto/klienti/co-a/aml')
check('and opens its identification', res.status === 200 && (await res.text()).replace(/\u00a0/g, ' ').includes('Identifikácia a riziko'))
res = await acc.get('/ucto/klienti/co-a/aml')
check('an accountant does not', res.status === 404)
res = await admin.get('/ucto/klienti/co-a')
check('nor does anybody open its page of work', res.status === 404)
await forgetRecords({DB:db,FILES:files},afterFiveYears)
check(
  'five years past the end the rest goes too',
  (await db.prepare("SELECT COUNT(*) AS n FROM companies WHERE id = 'co-a'").first())?.n === 0 &&
    (await db.prepare("SELECT COUNT(*) AS n FROM declarations WHERE company_id = 'co-a'").first())?.n === 0 &&
    (await files.list({ prefix: 'companies/co-a/' })).objects.length === 0,
)

await checkOverviewRuntime({ db, nowS, day, signIn, as, capture: process.env.FIRMONY_CAPTURE_DIR })
await checkDeliveryRuntime({ mf, db, signIn, nowS, day })
await checkManagedTakeover({db,files,as,signIn,lucia,nowS,day,capture:process.env.FIRMONY_CAPTURE_DIR})
await checkAssistantRuntime({db,files,as,signIn,lucia,nowS,day,provider:assistantProvider,capture:process.env.FIRMONY_CAPTURE_DIR})
await checkFormationRuntime({db,as,signIn,nowS})
// The designated person's pages are sensitive (five minutes): each step there confirms the key afresh. A confirmation
// replaces the session, so the next one starts from the cookie the last one gave.
let bossFresh = boss.cookie
const freshAdmin = async () => { bossFresh = (await verifyBrowser('ahoj@firmony.io', bossFresh)).cookie; return as(bossFresh) }
await checkInvoicingRuntime({ mf, db, post, get, sent, settle, as, admin, freshAdmin, day })
await checkAmlFixes({ db, files, get, post, admin, acc, lucia, signIn, as, nowS, day, freshAdmin })
await checkAnalyticsRuntime({ db, get, as, signIn, nowS, tick, capture: process.env.FIRMONY_CAPTURE_DIR })
await checkPeppolNetwork({ mf, db, signIn, as, nowS, day, network, tick, adminCookie: async () => { bossFresh = (await verifyBrowser('ahoj@firmony.io', bossFresh)).cookie; return bossFresh }, capture: process.env.FIRMONY_CAPTURE_DIR })
await checkPasskeySignin({ mf, db, post, sent, settle, as, nowS })
await checkMony({ mf, db, site, mony, provider: assistantProvider, nowS })
await checkFoundingRuntime({ db, files, get, post, sent, settle, as, freshAdmin, acc, signIn, nowS, purgeFoundings, capture: process.env.FIRMONY_CAPTURE_DIR })
await checkSanctionsRuntime({ db, files, get, freshAdmin, worker, settle, nowS })
await checkNudgeRuntime({ db, files })
await checkTatraRuntime({ db, files })
await checkAdminOverview({ db, admin: await freshAdmin(), acc, nowS, readings, capture: process.env.FIRMONY_CAPTURE_DIR })
await checkDueRuntime({ db })
await mf.dispose()
done('runtime')
