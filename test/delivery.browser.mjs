// Real customer forms on a phone, with deliberate loss of an already-committed server response.
import { check } from './check.mjs'

export async function checkDeliveryBrowser({ page, db, origin }) {
  const company = 'browser-overview-co'
  await page.goto(`${origin}/app/doklady`)
  const requests = [], path = '**/app/doklady'
  let lose = true
  await page.route(path, async (route) => {
    if (route.request().method() !== 'POST') return route.continue()
    requests.push(route.request().postDataBuffer())
    if (lose) { lose = false; await route.fetch(); return route.abort('failed') }
    return route.continue()
  })
  await page.locator('#pridat-file').setInputFiles([
    { name: 'TEST-BROWSER j2-one.jpg', mimeType: 'image/jpeg', buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 81, 72, 1]) },
    { name: 'TEST-BROWSER j2-<bad>.exe', mimeType: 'application/octet-stream', buffer: Buffer.from('TEST-ONLY rejected') },
    { name: 'TEST-BROWSER j2-two.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.7\nTEST-ONLY j2-two') },
  ])
  await page.getByRole('button', { name: 'Skúsiť nepotvrdené znova' }).waitFor()
  check('delivery browser: losing the first committed answer stops the queue and retains all three files', requests.length === 1 && (await db.prepare('SELECT COUNT(*) AS n FROM documents WHERE company_id=?').bind(company).first()).n === 1 && await page.locator('.upload-status li').count() === 3)
  // Another tab switched the same signed-in user's company. The original form must not follow it.
  await db.prepare("UPDATE sessions SET company_id='browser-co' WHERE user_id='browser-client'").run()
  await page.getByRole('button', { name: 'Skúsiť nepotvrdené znova' }).click()
  await page.locator('.upload-status').getByText(/Prihlásený účet alebo firma sa zmenili/).waitFor()
  check('delivery browser: retrying a stale company tab is blocked without sending the rest to another company', requests.length === 2 && (await db.prepare("SELECT COUNT(*) AS n FROM documents WHERE company_id='browser-co' AND file_name LIKE 'TEST-BROWSER j2-%'").first()).n === 0)
  await db.prepare("UPDATE sessions SET company_id='browser-overview-co' WHERE user_id='browser-client'").run()
  await page.getByRole('button', { name: 'Skúsiť nepotvrdené znova' }).click()
  await page.locator('.upload-status').getByText('Potvrdené súbory: 2 z 3.', { exact: true }).waitFor()
  check('delivery browser: retry confirms the original, rejects one bad file, and still accepts the following file', requests.length === 5 && (await db.prepare('SELECT COUNT(*) AS n FROM documents WHERE company_id=?').bind(company).first()).n === 2 && (await db.prepare("SELECT COUNT(*) AS n FROM events WHERE company_id=? AND action='document.added'").bind(company).first()).n === 2 && await page.locator('.upload-status').getByText(/Už ho máme/).count() === 1)
  check('delivery browser: rejected file names are text and no retry repeats confirmed uploads', await page.locator('.upload-status li').filter({ hasText: 'j2-<bad>.exe' }).count() === 1 && await page.getByRole('button', { name: 'Skúsiť nepotvrdené znova' }).count() === 0)
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 })
    check(`delivery browser: the partial receipt and controls fit a ${width}px phone`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    await page.screenshot({ path: `.wrangler/screens/${width}-delivery-partial-browser.png`, fullPage: true })
  }
  await page.unroute(path)
  page.once('dialog', (dialog) => dialog.accept())
  await page.goto(`${origin}/app/spravy`)
  const text = 'TEST-BROWSER J2 odpoveď, ktorá sa nesmie uložiť dvakrát.'
  let messagePosts = 0, dropMessage = true
  await page.route('**/app/spravy', async (route) => {
    if (route.request().method() !== 'POST') return route.continue()
    messagePosts++
    if (dropMessage) { dropMessage = false; await route.fetch(); return route.abort('failed') }
    return route.continue()
  })
  await page.locator('#sprava').fill(text)
  await page.locator('form[data-message] button[type=submit]').click()
  await page.locator('[data-send-status]').getByText(/Odoslanie zatiaľ nemáme potvrdené/).waitFor()
  check('delivery browser: after a lost message receipt its text stays readable in the same form', await page.locator('#sprava').inputValue() === text && await page.locator('#sprava').getAttribute('readonly') !== null && (await db.prepare('SELECT COUNT(*) AS n FROM messages WHERE company_id=? AND body=?').bind(company, text).first()).n === 1)
  await Promise.all([page.waitForURL(/ok=poslane/), page.locator('form[data-message] button[type=submit]').click()])
  check('delivery browser: deliberate message retry confirms one message and one audit event', messagePosts === 2 && (await db.prepare('SELECT COUNT(*) AS n FROM messages WHERE company_id=? AND body=?').bind(company, text).first()).n === 1 && (await db.prepare("SELECT COUNT(*) AS n FROM events e JOIN messages m ON m.id=e.subject WHERE m.company_id=? AND m.body=? AND e.action='message.sent'").bind(company, text).first()).n === 1)
  await page.unroute('**/app/spravy')
  // Empty/invalid server response keeps the composer editable rather than replacing the whole page.
  await page.locator('form[data-message] button[type=submit]').click()
  await page.locator('[data-send-status]').getByText(/Napíšte/).waitFor()
  check('delivery browser: validation leaves the customer in an editable composer', await page.locator('#sprava').getAttribute('readonly') === null && await page.locator('.talk').count() === 1)
  // The older bank/power-of-attorney forms share data-upload, but have their own native response contract.
  await page.goto(`${origin}/app/plna-moc`)
  const poaRequest = page.waitForRequest((request) => new URL(request.url()).pathname === '/app/plna-moc' && request.method() === 'POST')
  await Promise.all([
    page.waitForURL(`${origin}/app/plna-moc?ok=plna-moc`),
    page.locator('#plna-moc-file').setInputFiles({ name: 'TEST-BROWSER j2-power.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.7\nTEST-ONLY power of attorney awaiting professional verification') }),
  ])
  const postedPoa = await poaRequest
  check('delivery browser: the existing power-of-attorney picker follows its native upload and success redirect', postedPoa.headers()['accept'].includes('text/html') && !postedPoa.headers()['x-firmony-context'] && await page.locator('.upload-status').count() === 0)
  const poa = await db.prepare('SELECT COUNT(*) AS n, MAX(checked_at) AS checked FROM company_files WHERE company_id=? AND file_name=?').bind(company, 'TEST-BROWSER j2-power.pdf').first()
  check('delivery browser: a power-of-attorney upload is stored once for review and never accepted as a checked document', poa.n === 1 && poa.checked === null && (await db.prepare('SELECT COUNT(*) AS n FROM documents WHERE company_id=?').bind(company).first()).n === 2)

}
