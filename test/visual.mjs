// HTML is captured from the real workerd requests in e2e.workerd.mjs. Only local fixture pages and local assets load.
import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { readFile, mkdir } from 'node:fs/promises'
import { resolve, extname, sep } from 'node:path'

const fixtures = resolve(process.env.FIRMONY_CAPTURE_DIR ?? '.wrangler/ui')
const assets = resolve('public')
const out = resolve('.wrangler/screens')
await mkdir(out, { recursive: true })
const pages = ['monthly-sv.html', 'monthly-sv-transition.html', 'period-open.html', 'period-locked.html', 'home.html', 'support-inbox.html', 'support-empty.html', 'contract-review.html', 'contract-blocked.html', 'contract-ready.html', 'contract-accepted.html', 'security-setup.html', 'security-ready.html', 'security-grants.html', 'security-action-blocked.html', 'security-key-error.html', 'automation-review.html', 'incidents.html', 'incident.html', 'incident-active.html', 'incident-late.html', 'handover-retirement.html', 'filings-prepared.html', 'filing-rejected.html', 'filing-accepted.html', 'filing-client.html', 'filing-queue.html', 'payroll-reports.html', 'payroll-report-upload.html', 'payroll-report-rejected.html', 'payroll-report-client.html', 'payroll-report-changed.html', 'prehlad-ready.html', 'prehlad-error.html', 'prehlad-generated-client.html', 'prehlad-blocked.html', 'prehlad-retired.html']
for (const name of pages) await readFile(resolve(fixtures, name))
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.ico': 'image/x-icon' }
const server = createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname)
    const file = pages.includes(path.slice(1)) ? resolve(fixtures, path.slice(1)) : resolve(assets, `.${path}`)
    if (!file.startsWith(`${fixtures}${sep}`) && !file.startsWith(`${assets}${sep}`)) { res.writeHead(403).end(); return }
    const bytes = await readFile(file)
    res.writeHead(200, { 'content-type': mime[extname(file)] ?? 'application/octet-stream' }).end(bytes)
  } catch { res.writeHead(404).end() }
})
await new Promise((done) => server.listen(0, '127.0.0.1', done))
const base = `http://127.0.0.1:${server.address().port}`
let browser
try {
  browser = await chromium.launch({ headless: true, executablePath: process.env.FIRMONY_CHROME, args: ['--no-sandbox'] })
  for (const width of [1440, 390, 320]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' })
    await page.route('**/*', (route) => new URL(route.request().url()).origin === base ? route.continue() : route.abort())
    for (const name of pages) {
      await page.goto(`${base}/${name}`, { waitUntil: 'networkidle' })
      await page.evaluate(() => document.fonts.ready)
      const layout = await page.evaluate(() => {
        const ids = [...document.querySelectorAll('[id]')].map((e) => e.id)
        return { prehladForms: document.querySelectorAll('.prehlad-form').length, prehladOrigin: document.querySelectorAll('.prehlad-origin').length, prehladLabels: [...document.querySelectorAll('.prehlad-form input:not([type=hidden]), .prehlad-form select, .prehlad-form textarea, .payroll-scope input:not([type=hidden]), .payroll-scope textarea')].every((e) => e.labels?.length > 0), payrollCards: document.querySelectorAll('.payroll-report-card').length, payrollUploads: document.querySelectorAll('.payroll-report-upload').length, payoutForms: document.querySelectorAll('.payroll-payout form').length, payrollLabels: [...document.querySelectorAll('.payroll-report-upload input:not([type=hidden]), .payroll-report-upload textarea, .payroll-payout input:not([type=hidden]), .payroll-payout textarea')].every((e) => e.labels?.length > 0), filingCards: document.querySelectorAll('.filing-card').length, filingEvents: document.querySelectorAll('.filing-event').length, filingForms: document.querySelectorAll('.filing-form').length, filingLabels: [...document.querySelectorAll('.filing-form input:not([type=hidden]), .filing-form select, .filing-form textarea')].every((e) => e.labels?.length > 0), booking: Boolean(document.querySelector('form.book__form select[name="kind"]')) && Boolean(document.querySelector('form.book__form input[name="issued"]')), handoverFiles: document.querySelectorAll('.handover__list li').length, passkeys: document.querySelectorAll('form[data-passkey]').length, grants: document.querySelectorAll('form[action="/auth/grants"]').length, incidentCards: document.querySelectorAll('.incident-card').length, incidentHistory: document.querySelectorAll('.incident-history li').length, securityLabels: [...document.querySelectorAll('.security input:not([type=hidden]), .security select, .incident-new input, .incident-new select')].every((e) => e.labels?.length > 0), overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1, unique: new Set(ids).size === ids.length, cards: document.querySelectorAll('section.info[id^="suhrnny-"]').length, forms: document.querySelectorAll('.period-form').length, labelled: [...document.querySelectorAll('.period-form input[type=month], .period-form textarea')].every((e) => e.labels?.length > 0), support: document.querySelectorAll('.support-row').length, times: document.querySelectorAll('.support-row time[datetime]').length, hero: document.querySelectorAll('h1.hero__title').length, proposal: document.querySelectorAll('input[name=proposal]').length, submitDisabled: Boolean(document.querySelector('form.order button[type=submit]')?.disabled), reviewChecks: document.querySelectorAll('input[name=category], input[name=scope], input[name=cover], input[name=authority]').length, contract: document.querySelectorAll('article.contract').length }
      })
      await page.screenshot({ path: `${out}/${width}-${name.replace('.html', '.png')}`, fullPage: true })
      const wrongControls = ['prehlad-ready.html','prehlad-error.html'].includes(name) ? layout.prehladForms !== 1 || !layout.prehladLabels : name === 'prehlad-blocked.html' ? layout.prehladForms !== 0 : name === 'prehlad-generated-client.html' ? layout.prehladOrigin !== 1 || layout.filingForms !== 0 : name === 'prehlad-retired.html' ? layout.filingEvents < 3 || !layout.prehladLabels : name === 'payroll-reports.html' ? layout.payrollCards !== 3 || layout.payoutForms !== 1 || !layout.payrollLabels : name === 'payroll-report-upload.html' ? layout.payrollUploads !== 1 || !layout.payrollLabels : name === 'payroll-report-rejected.html' ? layout.payrollUploads !== 1 || layout.filingForms !== 1 || !layout.filingLabels || !layout.payrollLabels : name === 'payroll-report-changed.html' ? layout.payrollUploads !== 1 || layout.filingForms !== 1 || !layout.filingLabels || !layout.payrollLabels : name === 'payroll-report-client.html' ? layout.payrollUploads !== 0 || layout.filingForms !== 0 || layout.filingEvents < 1 : name === 'filings-prepared.html' ? layout.filingCards !== 5 : name === 'filing-queue.html' ? layout.filingCards < 1 : name.startsWith('filing-') ? !layout.filingLabels || layout.filingEvents < 1 || layout.filingForms !== (name === 'filing-rejected.html' ? 1 : 0) : name === 'automation-review.html' ? !layout.booking : name === 'handover-retirement.html' ? layout.handoverFiles !== 1 : name.startsWith('security-') ? !layout.securityLabels || (name === 'security-grants.html' ? layout.grants !== 1 : layout.passkeys < 1) : name === 'incidents.html' ? !layout.securityLabels || layout.incidentCards < 1 : name.startsWith('incident') ? layout.incidentHistory < (name === 'incident-late.html' ? 1 : 2) : name === 'contract-review.html' ? layout.reviewChecks !== 4 || layout.proposal !== 1 : name === 'contract-blocked.html' ? !layout.submitDisabled || layout.proposal !== 1 : name === 'contract-ready.html' ? layout.submitDisabled || layout.proposal !== 1 : name === 'contract-accepted.html' ? layout.contract !== 1 : name.startsWith('monthly-') ? layout.cards !== 3 : name.startsWith('period-') ? !layout.labelled || layout.forms !== (name === 'period-locked.html' ? 2 : 1) : name === 'home.html' ? layout.hero !== 1 : name === 'support-inbox.html' ? layout.support < 2 || layout.times !== layout.support : layout.support !== 0
      if (layout.overflow || !layout.unique || wrongControls) throw new Error(`${width} ${name}: ${JSON.stringify(layout)}`)
      console.log(`${width} ${name}: fits; unique headings and expected controls`)
    }
    await page.close()
  }
} finally {
  await browser?.close()
  await new Promise((done) => server.close(done))
}
