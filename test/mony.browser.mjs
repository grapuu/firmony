import { check } from './check.mjs'

/** Mony in a real browser: opens from its icon, answers as it streams, writes nothing as HTML, folds and stays folded. */
export async function checkMonyBrowser({ clientPage, origin, mony }) {
  await clientPage.setViewportSize({ width: 1440, height: 900 })
  await clientPage.goto(`${origin}/app/platby`)
  await clientPage.evaluate(() => {
    try {
      localStorage.removeItem('mony:open')
    } catch {}
  })
  await clientPage.reload()
  const launcher = clientPage.getByRole('button', { name: 'Otvoriť Mony', exact: true })
  await launcher.waitFor({ state: 'visible' })
  check('mony browser: Mony waits folded as its icon at the right', await clientPage.locator('#mony-panel').isHidden())
  await launcher.click()
  const input = clientPage.getByLabel('Otázka pre Mony', { exact: true })
  check('mony browser: the icon opens the cloud with its question ready', (await clientPage.locator('#mony-panel').isVisible()) && (await input.evaluate((el) => el === document.activeElement)))
  const asked = mony.answers.length
  const response = clientPage.waitForResponse((r) => new URL(r.url()).pathname === '/app/mony' && r.request().method() === 'POST')
  await clientPage.getByRole('button', { name: 'Ako nastavím banku?', exact: true }).click()
  await response
  const reply = clientPage.locator('.mony__msg--mony').last()
  await reply.getByText('Výpisy potom chodia samé.', { exact: false }).waitFor({ state: 'visible' })
  check(
    'mony browser: the answer is written with its bold, its list and a link only to a page that exists',
    mony.answers.length === asked + 1 &&
      (await reply.locator('strong').first().textContent()) === 'Áno.' &&
      (await reply.locator('li').count()) === 2 &&
      (await reply.locator('a').count()) === 1 &&
      (await reply.locator('a').getAttribute('href')) === '/app/banka',
  )
  check(
    'mony browser: markup in an answer stays text',
    (await reply.locator('img').count()) === 0 && (await reply.textContent()).includes('<img src=x onerror=alert(1)>') && (await clientPage.evaluate(() => document.querySelectorAll('.mony img:not(.mony__avatar):not(.mony__face)').length)) === 0,
  )
  check('mony browser: the question the page sent is the person\'s page', mony.answers.at(-1).system[0].text.includes('stránke /app/platby'))
  for (const width of [320, 390, 1440]) {
    await clientPage.setViewportSize({ width, height: 800 })
    const box = await clientPage.locator('#mony-panel').boundingBox()
    check(`mony browser: the open cloud fits ${width}px`, Boolean(box) && box.x >= 0 && box.x + box.width <= width && box.y >= 0 && (await clientPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth)))
    await clientPage.screenshot({ path: `.wrangler/screens/${width}-mony-open.png` })
  }
  await clientPage.setViewportSize({ width: 1440, height: 900 })
  // Another page keeps the conversation and the open cloud; the arrow folds it, and it stays folded.
  await clientPage.goto(`${origin}/app/doklady`)
  await clientPage.locator('#mony-panel').waitFor({ state: 'visible' })
  check('mony browser: the conversation goes along to the next page', (await clientPage.locator('.mony__msg--user').count()) === 1 && (await clientPage.locator('.mony__msg--mony a[href="/app/banka"]').count()) === 1)
  await clientPage.getByRole('button', { name: 'Skryť Mony', exact: true }).click()
  check('mony browser: the arrow folds it to the icon', (await clientPage.locator('#mony-panel').isHidden()) && (await launcher.isVisible()))
  await clientPage.reload()
  await launcher.waitFor({ state: 'visible' })
  check('mony browser: folded, it stays folded on the next page', await clientPage.locator('#mony-panel').isHidden())
  await clientPage.setViewportSize({ width: 390, height: 844 })
  await clientPage.screenshot({ path: '.wrangler/screens/390-mony-folded.png' })
  await clientPage.setViewportSize({ width: 1440, height: 900 })
  await launcher.click()
  await clientPage.getByRole('button', { name: 'Nová konverzácia', exact: true }).click()
  check('mony browser: a new conversation starts afresh, with its suggestions', (await clientPage.locator('.mony__msg--user').count()) === 0 && (await clientPage.getByRole('button', { name: 'Ako pridám doklad?', exact: true }).isVisible()))
  await clientPage.getByRole('button', { name: 'Skryť Mony', exact: true }).click()

  // A page of an older build loads the current one when it comes back into view; what was typed is never lost.
  await clientPage.route('**/verzia', (route) => route.fulfill({ status: 200, contentType: 'text/plain', body: 'TEST-ONLY-newer-build' }))
  await clientPage.goto(`${origin}/app/doklady`)
  await launcher.click()
  await input.fill('TEST-ONLY rozpísaná otázka')
  await clientPage.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })))
  await clientPage.locator('.fresh').waitFor({ state: 'visible' })
  check('fresh: a page with something typed offers the new version instead of reloading', (await input.inputValue()) === 'TEST-ONLY rozpísaná otázka' && (await clientPage.getByRole('button', { name: 'Obnoviť stránku', exact: true }).isVisible()))
  await input.fill('')
  const loaded = clientPage.waitForEvent('load')
  await clientPage.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })))
  await loaded
  check('fresh: a page with nothing typed loads the current version by itself', (await clientPage.locator('.fresh').count()) === 0 && new URL(clientPage.url()).pathname === '/app/doklady')
  await clientPage.unroute('**/verzia')
  await clientPage.getByRole('button', { name: 'Skryť Mony', exact: true }).click()
}
