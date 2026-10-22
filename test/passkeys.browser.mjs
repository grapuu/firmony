// Chrome's virtual CTAP2 authenticator exercises the shipped client bundle and the real Worker together.
import { chromium } from 'playwright'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { createServer } from 'node:http'
import { readFile, mkdir } from 'node:fs/promises'
import { resolve, extname, sep } from 'node:path'
import { randomBytes, createHash } from 'node:crypto'
import { check, done } from './check.mjs'
import { readHealthText } from './health-text.mjs'
import { readSocialXml } from './social-xml.mjs'
import { checkDeliveryBrowser } from './delivery.browser.mjs'
import { checkCustomerValueBrowser } from './customer-value.browser.mjs'
import { checkFreeInvoiceBrowser } from './free-invoice.browser.mjs'
import { checkManagedTakeoverBrowser } from './managed-takeover.browser.mjs'
import { checkAssistantBrowser } from './assistant.browser.mjs'
import { assistantProviderFixture } from './assistant.fixture.mjs'
import { payslip } from '../.wrangler/dist/stores.js'

const assets = resolve('public'),
  dist = resolve('.wrangler/dist')
const bootstrap = randomBytes(32).toString('base64url'),
  now = Math.floor(Date.now() / 1000)
let mf, browser
const assistantProvider=assistantProviderFixture()
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
            ANTHROPIC_API_KEY: 'TEST-ONLY local assistant fixture',
            TEAM_BOOTSTRAP_EMAIL: 'browser-admin@example.test',
            TEAM_BOOTSTRAP_TOKEN: bootstrap,
            TEAM_BOOTSTRAP_EXPIRES_AT: String(now + 3600),
          },
          outboundService: async request => await assistantProvider.answer(request) ?? new Response('offline', { status: 599 }),
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
  await checkCustomerValueBrowser({ browser, origin })
  await checkFreeInvoiceBrowser({ browser, origin })
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
  // Use the actual rendered filing form after real passkey authentication; every file here is TEST_ONLY.
  const filingId = 'browser-filing', period = `${Number(today.slice(0, 4)) - 1}-09`
  const filingXml = '<TEST_ONLY company="63333333" form="sv"/>', filingHash = createHash('sha256').update(filingXml).digest('hex')
  const dossier = `${origin}/ucto/klienti/browser-co/podania/${filingId}`
  await db.batch([
    db.prepare("INSERT INTO filings (company_id, kind, period, filed_at, filed_on, filed_by, data) VALUES ('browser-co', 'sv', ?, ?, ?, 'browser-admin', ?)").bind(period, now, today, JSON.stringify({ kind: 'R', rows: [], sent: [], prev: null, file: { name: 'TEST_ONLY.xml', xml: filingXml, sha256: filingHash, attemptId: filingId } })),
    db.prepare("INSERT INTO filing_packages (id, company_id, kind, period, name, xml, sha256, created_at, created_by, updated_at, updated_by) VALUES (?, 'browser-co', 'sv', ?, 'TEST_ONLY.xml', ?, ?, ?, 'browser-admin', ?, 'browser-admin')").bind(filingId, period, filingXml, filingHash, now, now),
  ])
  await page.goto(dossier)
  await page.locator('#filing-state').selectOption('accepted')
  await page.locator('#filing-reference').fill('TEST-BROWSER-RECEIPT')
  await page.locator('input[name=checked]').check()
  const rejectedSubmission = page.waitForResponse((r) => new URL(r.url()).pathname.endsWith(`/${filingId}/stav`) && r.request().method() === 'POST')
  await page.locator('.filing-form button[type=submit]').click()
  const missingReceipt = await rejectedSubmission
  await page.locator('[role=alert]').waitFor({ state: 'visible' })
  check('the actual browser form preserves inputs and refuses acceptance without a receipt', missingReceipt.status() === 409 && await page.locator('#filing-reference').inputValue() === 'TEST-BROWSER-RECEIPT' && (await db.prepare('SELECT status FROM filing_packages WHERE id = ?').bind(filingId).first()).status === 'prepared')
  const proofBytes = Buffer.from('<TEST_ONLY company="63333333" form="sv" reference="TEST-BROWSER-RECEIPT" result="accepted"/>')
  await page.locator('#filing-file').setInputFiles({ name: 'TEST_ONLY-receipt.xml', mimeType: 'application/xml', buffer: proofBytes })
  const acceptedSubmission = page.waitForResponse((r) => new URL(r.url()).pathname.endsWith(`/${filingId}/stav`) && r.request().method() === 'POST')
  await page.locator('.filing-form button[type=submit]').click()
  const receiptResponse = await acceptedSubmission
  await page.locator('.filing-history .filing-event').waitFor({ state: 'visible' })
  check('the browser completes delivery with a checked original and visible history', receiptResponse.status() === 303 && (await db.prepare('SELECT status FROM filing_packages WHERE id = ?').bind(filingId).first()).status === 'accepted' && await page.locator('.filing-history .filing-event').count() === 1)
  const downloaded = page.waitForEvent('download')
  await page.getByRole('link', { name: 'Stiahnuť potvrdenku', exact: true }).click()
  const proofDownload = await downloaded
  check('the real browser downloads the original receipt byte for byte', (await readFile(await proofDownload.path())).equals(proofBytes))
  await mkdir('.wrangler/screens', { recursive: true })
  await page.screenshot({ path: '.wrangler/screens/390-filing-browser.png', fullPage: true })

  // Regular monthly payroll: exercise the actual payout, file upload and recipient receipt forms.
  const wageMonth = new Date(`${today.slice(0,7)}-15T12:00:00Z`); wageMonth.setUTCMonth(wageMonth.getUTCMonth()-1)
  const wagePeriod = wageMonth.toISOString().slice(0,7), payrollBase = `${origin}/ucto/klienti/browser-co/mzdove-podania`
  const slip = payslip({period:wagePeriod,gross:100000,days:30,declaration:true,children:[],disabled:false,healthDeduction:false,healthMinimumExempt:false})
  await db.prepare("INSERT INTO employees(id,company_id,name,insurer,started_on,wage_cents,created_at) VALUES('browser-employee','browser-co','TEST Employee','25',?,100000,?)").bind(`${wagePeriod}-01`,now).run()
  await db.prepare("INSERT INTO payroll_runs (company_id,period,payday,lines,closed_at,closed_on,closed_by) VALUES ('browser-co',?,?,?, ?,?,'browser-admin')").bind(wagePeriod,today,JSON.stringify([{employeeId:'browser-employee',name:'TEST Employee',insurer:'25',gross:100000,days:30,health:{disabled:false,minimumExempt:false,deductionClaimed:false},slip}]),now,today).run()
  await page.goto(`${payrollBase}?obdobie=${wagePeriod}`)
  await page.locator('.payroll-init button').click()
  await page.locator('.payroll-payout form').waitFor({state:'visible'})
  check('the browser initializes separate payroll recipients without copying the planned payout date',await page.locator('.payroll-report-card').count()===2 && await page.locator('input[name=paidOn]').inputValue()==='')
  await page.locator('input[name=paidOn]').fill(today)
  await page.locator('input[name=reportPeriod]').fill(wagePeriod)
  await page.locator('input[name=reference]').fill('TEST browser settled bank statement')
  await page.locator('.payroll-payout input[name=checked]').check()
  const cashResponse = page.waitForResponse((r)=>new URL(r.url()).pathname.endsWith('/mzdove-podania/vyplata') && r.request().method()==='POST')
  await page.locator('.payroll-payout button[type=submit]').click()
  check('the browser confirms actual payout and creates its FS recipient', (await cashResponse).status()===303 && (await db.prepare("SELECT COUNT(*) AS n FROM payroll_targets WHERE company_id='browser-co' AND kind='tax'").first()).n===1)
  const payrollTarget = await db.prepare("SELECT * FROM payroll_targets WHERE company_id='browser-co' AND kind='sp'").first()
  await page.goto(`${payrollBase}/${payrollTarget.id}`)
  const payrollBytes=Buffer.from('<TEST_ONLY company="63333333" kind="sp"/>')
  await page.locator('#report-variant').fill('TEST ONLY riadny mesačný výkaz')
  await page.locator('#report-file').setInputFiles({name:'TEST_ONLY-payroll.xml',mimeType:'application/xml',buffer:payrollBytes})
  await page.locator('.payroll-report-upload input[name=checked]').check()
  const payrollSaved=page.waitForResponse((r)=>new URL(r.url()).pathname.endsWith(`/${payrollTarget.id}/subor`) && r.request().method()==='POST')
  await page.locator('.payroll-report-upload button[type=submit]').click()
  await page.locator('.filing-form').waitFor({state:'visible'})
  check('the real payroll upload stores an exact prepared report', (await payrollSaved).status()===303 && (await db.prepare('SELECT status FROM payroll_packages WHERE target_id=?').bind(payrollTarget.id).first()).status==='prepared')
  await page.locator('#filing-state').selectOption('accepted')
  await page.locator('#filing-reference').fill('TEST-BROWSER-PAYROLL-RECEIPT')
  await page.locator('.filing-form input[name=checked]').check()
  await page.locator('#filing-file').setInputFiles({name:'TEST_ONLY-payroll-receipt.xml',mimeType:'application/xml',buffer:Buffer.from('<TEST_ONLY kind="sp" reference="TEST-BROWSER-PAYROLL-RECEIPT"/>')})
  const payrollAccepted=page.waitForResponse((r)=>new URL(r.url()).pathname.endsWith('/stav') && r.request().method()==='POST')
  await page.locator('.filing-form button[type=submit]').click()
  await page.getByRole('link',{name:'Stiahnuť potvrdenku',exact:true}).waitFor({state:'visible'})
  check('the real browser records SP acceptance without marking health insurance accepted',(await payrollAccepted).status()===303 && (await db.prepare("SELECT p.status FROM payroll_packages p JOIN payroll_targets t ON t.package_id=p.id WHERE t.company_id='browser-co' AND t.kind='sp'").first()).status==='accepted' && !(await db.prepare("SELECT package_id FROM payroll_targets WHERE company_id='browser-co' AND kind='health25'").first()).package_id)
  const originalDownload=page.waitForEvent('download')
  await page.getByRole('link',{name:'Stiahnuť pôvodný výkaz',exact:true}).click()
  check('the browser downloads exact payroll source bytes',(await readFile(await (await originalDownload).path())).equals(payrollBytes))
  await page.screenshot({path:'.wrangler/screens/390-payroll-browser.png',fullPage:true})
  const overviewTarget=await db.prepare("SELECT * FROM payroll_targets WHERE company_id='browser-co' AND kind='tax'").first()
  await page.goto(`${payrollBase}/${overviewTarget.id}/pripravit`)
  await page.locator('input[name=dic]').fill('2126333333')
  await page.locator('input[name=street]').fill('Testová')
  await page.locator('input[name=number]').fill('12')
  await page.locator('input[name=postal]').fill('04001')
  await page.locator('input[name=city]').fill('Košice')
  await page.locator('#overview-kind').selectOption('R')
  await page.locator('#overview-representation').selectOption('company')
  await page.locator('input[name=reference]').fill('TEST browser complete monthly review')
  await page.locator('.prehlad-form input[name=checked]').check()
  const generatedResponse=page.waitForResponse((r)=>new URL(r.url()).pathname.endsWith('/generovat') && r.request().method()==='POST')
  await page.locator('.prehlad-form button[type=submit]').click()
  await page.getByRole('heading',{name:'Vytvorené vo Firmony',exact:true}).waitFor({state:'visible'})
  const generated=await db.prepare('SELECT p.id,p.status,g.format FROM payroll_packages p JOIN payroll_generations g ON g.package_id=p.id WHERE p.target_id=?').bind(overviewTarget.id).first()
  check('the actual browser prepares a provenance-bound PREHLAD file after reviewing scope',(await generatedResponse).status()===303 && generated.status==='prepared' && generated.format==='PREHLADv26')
  const overviewDownload=page.waitForEvent('download')
  await page.getByRole('link',{name:'Stiahnuť pôvodný výkaz',exact:true}).click()
  const overviewXml=await readFile(await (await overviewDownload).path(),'utf8')
  check('the browser-generated overview preserves report month independently of payout month',overviewXml.includes(`<mesiac>${wagePeriod.slice(5)}</mesiac>`) && overviewXml.includes(`<datum>${today.slice(8,10)}.${today.slice(5,7)}.${today.slice(0,4)}</datum>`))
  await page.screenshot({path:'.wrangler/screens/390-prehlad-browser.png',fullPage:true})
  const healthTarget=await db.prepare("SELECT * FROM payroll_targets WHERE company_id='browser-co' AND kind='health25'").first()
  await page.goto(`${payrollBase}/${healthTarget.id}/pripravit`)
  await page.locator('.health-id-form input[name=identifier]').fill('0010101234')
  await page.locator('.health-id-form input[name=reference]').fill('TEST browser independently verified employee document')
  await page.locator('.health-id-form input[name=checked]').check()
  const identityResponse=page.waitForResponse((r)=>new URL(r.url()).pathname.endsWith('/poistenec')&&r.request().method()==='POST')
  await page.locator('.health-id-form button[type=submit]').click()
  await page.locator('.health-report-form').waitFor({state:'visible'})
  check('the actual browser stores verified insured identity and shows a masked reusable record',(await identityResponse).status()===303&&await page.getByText('TEST Employee · overené, končí 1234',{exact:true}).count()===1)
  await page.locator('.health-report-form input[name=payer]').fill('6333333300')
  await page.locator('.health-report-form input[name=branch]').fill('2500')
  await page.locator('.health-report-form input[name=iban]').fill('SK3112000000198742637541')
  await page.locator('#health-kind').selectOption('N')
  await page.locator('.health-report-form input[name=batch]').fill('1')
  await page.locator('.health-report-form input[name=reference]').fill('TEST browser complete health payroll review')
  await page.locator('.health-report-form input[name=checked]').check()
  const healthResponse=page.waitForResponse((r)=>new URL(r.url()).pathname.endsWith('/generovat')&&r.request().method()==='POST')
  await page.locator('.health-report-form button[type=submit]').click()
  await page.getByRole('heading',{name:'Vytvorené vo Firmony',exact:true}).waitFor({state:'visible'})
  check('the actual browser prepares a source-bound 514 batch without recording submission',(await healthResponse).status()===303&&(await db.prepare('SELECT p.status FROM payroll_packages p JOIN payroll_health_generations g ON g.package_id=p.id WHERE p.target_id=?').bind(healthTarget.id).first()).status==='prepared')
  const healthDownload=page.waitForEvent('download')
  await page.getByRole('link',{name:'Stiahnuť pôvodný výkaz',exact:true}).click()
  const imported=await healthDownload,healthText=await readFile(await imported.path(),'utf8'),batch=readHealthText(healthText)
  check('the browser downloads independent valid 514 text under its required import filename',imported.suggestedFilename()===`N514${wagePeriod.slice(2,4)}${wagePeriod.slice(5)}.001`&&batch.rows.length===1&&batch.rows[0][1]==='0010101234'&&batch.id[4]==='2500')
  await page.screenshot({path:'.wrangler/screens/390-health-browser.png',fullPage:true})

  const acceptedPayrollId=(await db.prepare('SELECT package_id FROM payroll_targets WHERE id=?').bind(payrollTarget.id).first()).package_id
  await page.goto(`${payrollBase}/${payrollTarget.id}/pripravit`)
  check('the browser SP workflow reuses a masked health identity and asks for the missing relationship and hours',await page.getByText('Overené, končí 1234',{exact:false}).count()===1&&await page.locator('.social-fact-form[data-section=relation]').count()===1&&await page.locator('.social-fact-form[data-section=hours]').count()===1&&await page.locator('.social-fact-form[data-section=identity] input[name=value]').inputValue()==='')
  const relationship=page.locator('.social-fact-form[data-section=relation]')
  await relationship.locator('input[name=value]').fill('000000000001')
  await relationship.locator('input[name=reference]').fill('TEST browser original SP registration')
  await relationship.locator('input[name=checked]').check()
  await relationship.locator('button[type=submit]').click()
  const analytic=page.locator('.social-fact-form[data-section=hours]')
  await analytic.locator('select[name=mode]').selectOption('known')
  await analytic.locator('input[name=value]').fill('176,25')
  await analytic.locator('input[name=reference]').fill('TEST browser verified analytical hours')
  await analytic.locator('input[name=checked]').check()
  await analytic.locator('button[type=submit]').click()
  const socialForm=page.locator('.social-report-form')
  await socialForm.waitFor({state:'visible'})
  await socialForm.locator('input[name=payer]').fill('0000000012')
  await socialForm.locator('input[name=iban]').fill('SK3112000000198742637541')
  await socialForm.locator('input[name=firstName]').fill('TEST')
  await socialForm.locator('input[name=lastName]').fill('Reviewer')
  await socialForm.locator('input[name=phone]').fill('00421900000000')
  await socialForm.locator('input[name=email]').fill('test@example.test')
  await socialForm.locator('input[name=preparedBy]').fill('TEST Browser reviewer')
  await socialForm.locator('select[name=kind]').selectOption('O')
  await socialForm.locator('textarea[name=reason]').fill('TEST complete replacement of the earlier external browser report')
  await socialForm.locator('input[name=reference]').fill('TEST browser complete ordinary social scope')
  await socialForm.locator('input[name=checked]').check()
  const socialResponse=page.waitForResponse((r)=>new URL(r.url()).pathname.endsWith('/generovat')&&r.request().method()==='POST')
  await socialForm.locator('button[type=submit]').click()
  await page.getByRole('heading',{name:'Vytvorené vo Firmony',exact:true}).waitFor({state:'visible'})
  check('the actual browser saves a complete SP replacement as prepared while retaining the old accepted file',(await socialResponse).status()===303&&(await db.prepare('SELECT status FROM payroll_packages WHERE id=?').bind(acceptedPayrollId).first()).status==='accepted'&&(await db.prepare('SELECT p.status FROM payroll_packages p JOIN payroll_social_generations g ON g.package_id=p.id WHERE p.target_id=?').bind(payrollTarget.id).first()).status==='prepared')
  const socialDownload=page.waitForEvent('download')
  await page.getByRole('link',{name:'Stiahnuť pôvodný výkaz',exact:true}).click()
  const socialXml=await readFile(await (await socialDownload).path(),'utf8'),socialRead=readSocialXml(socialXml)
  check('the real browser downloads independently checked complete MVPP XML',socialRead.rows.length===1&&socialRead.root.typVykazu==='O'&&socialRead.rows[0]['@_rc']==='0010101234'&&socialRead.rows[0]['@_icpv']==='000000000001'&&socialRead.rows[0]['@_pocetHodin']==='176.25')
  await page.screenshot({path:'.wrangler/screens/390-social-browser.png',fullPage:true})

  await db.batch([
    db.prepare("INSERT INTO users (id, created_at, email, name) VALUES ('browser-client', ?, 'browser-client@example.test', 'Klient prehliadača')").bind(now),
    db.prepare("INSERT INTO members (company_id, user_id, role, created_at) VALUES ('browser-co', 'browser-client', 'owner', ?)").bind(now),
  ])
  const clientContext = await browser.newContext({ viewport: { width: 390, height: 844 } }), clientPage = await clientContext.newPage()
  clientPage.on('pageerror', (e) => errors.push(e.message))
  await clientPage.route('**/*', (route) => new URL(route.request().url()).origin === origin ? route.continue() : route.abort())
  const clientToken = randomBytes(32).toString('base64url')
  await db.prepare("INSERT INTO login_links (id, user_id, created_at, expires_at) VALUES (?, 'browser-client', ?, ?)").bind(createHash('sha256').update(clientToken).digest('hex'), now, now + 600).run()
  await clientPage.goto(`${origin}/app/vstup?t=${clientToken}`)
  await Promise.all([clientPage.waitForURL(`${origin}/app`), clientPage.locator('form[action="/app/vstup"] button[type=submit]').click()])
  // Isolate the overview task from the payroll deadlines used by the evidence scenarios below.
  await db.batch([
    db.prepare("INSERT INTO companies(id,created_at,name,ico,plan,inbox,start_on) VALUES('browser-overview-co',?,'TEST-BROWSER Prehľad','50888874','rast','browser-overview','2026-01-01')").bind(now),
    db.prepare("INSERT INTO members(company_id,user_id,role,created_at) VALUES('browser-overview-co','browser-client','owner',?)").bind(now),
    db.prepare("UPDATE sessions SET company_id='browser-overview-co' WHERE user_id='browser-client'"),
    db.prepare("INSERT INTO messages(id,company_id,created_at,side,body) VALUES('browser-overview-message','browser-overview-co',?,'firmony','TEST-BROWSER-OVERVIEW správa pre klienta')").bind(now),
  ])
  await clientPage.reload()
  check('the mobile customer overview exposes its unread message as the primary usable action', await clientPage.locator('[data-overview-action]').first().getAttribute('data-overview-action') === 'message' && await clientPage.locator('[data-overview-action="message"]').first().getAttribute('href') === '/app/spravy' && await clientPage.locator('[data-overview-state="action"]').count() === 1)
  await Promise.all([clientPage.waitForURL(`${origin}/app/spravy`), clientPage.locator('[data-overview-action="message"]').first().click()])
  check('the mobile primary action reaches the actual message without manufacturing a reply', await clientPage.getByText('TEST-BROWSER-OVERVIEW správa pre klienta', { exact: true }).count() === 1 && (await db.prepare("SELECT seen_at FROM messages WHERE id='browser-overview-message'").first()).seen_at !== null && (await db.prepare("SELECT COUNT(*) AS n FROM events WHERE company_id='browser-overview-co' AND action='message.sent'").first()).n === 0)
  await checkDeliveryBrowser({ page: clientPage, db, origin })
  await checkManagedTakeoverBrowser({page,clientPage,db,origin})
  await checkAssistantBrowser({page,clientPage,db,origin,provider:assistantProvider})
  await db.prepare("UPDATE sessions SET company_id='browser-co' WHERE user_id='browser-client'").run()
  await clientPage.goto(`${origin}/app/podania/${filingId}`)
  check('a customer browser sees the same accepted document and proof without accountant controls', await clientPage.getByText('TEST-BROWSER-RECEIPT', { exact: false }).count() > 0 && await clientPage.locator('.filing-form').count() === 0 && await clientPage.getByRole('link', { name: 'Stiahnuť potvrdenku', exact: true }).count() === 1)
  await clientPage.goto(`${origin}/app/mzdove-podania/${payrollTarget.id}/verzie/${acceptedPayrollId}`)
  check('the customer browser sees payroll evidence without payout or accounting forms',await clientPage.getByText('TEST-BROWSER-PAYROLL-RECEIPT',{exact:false}).count()>0 && await clientPage.locator('.filing-form,.payroll-report-upload,.payroll-payout form').count()===0)
  await clientPage.goto(`${origin}/app/mzdove-podania/${overviewTarget.id}`)
  check('the customer browser sees generated overview provenance with no preparation controls',await clientPage.getByRole('heading',{name:'Vytvorené vo Firmony',exact:true}).count()===1 && await clientPage.locator('.prehlad-form,.payroll-report-upload,.filing-form').count()===0)
  await clientPage.goto(`${origin}/app/mzdove-podania/${healthTarget.id}`)
  check('the customer browser sees health origin with no identity collection or accounting form',await clientPage.getByText('ZP514-TXT-2026',{exact:false}).count()===1&&await clientPage.locator('.health-id-form,.health-report-form,.payroll-report-upload,.filing-form').count()===0)
  await clientPage.goto(`${origin}/app/mzdove-podania/${payrollTarget.id}`)
  check('the customer browser sees the current SP origin without registration or analytical-hour work',await clientPage.getByText('MVPP-v2026',{exact:false}).count()>0&&await clientPage.locator('.social-fact-form,.social-report-form,.payroll-report-upload,.filing-form').count()===0)
  await clientContext.close()
  check('the authenticated work and filing forms have no uncaught browser errors', errors.length === 0)
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
