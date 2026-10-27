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

  // The site's questions and its close send whoever does not know something to Mony, and the word opens her.
  await clientPage.goto(`${origin}/`)
  await clientPage.locator('#otazky [data-mony-call]').click()
  check('mony browser: the questions of the site open Mony from her name', await clientPage.locator('#mony-panel').isVisible())
  await clientPage.getByRole('button', { name: 'Skryť Mony', exact: true }).click()
  await clientPage.locator('#zacat [data-mony-call]').click()
  check('mony browser: the close of the site opens Mony too', await clientPage.locator('#mony-panel').isVisible())
  await clientPage.getByRole('button', { name: 'Skryť Mony', exact: true }).click()

  // A phone has the site's menu behind a button, the free tools and the investors first; a link followed closes it.
  await clientPage.setViewportSize({ width: 390, height: 844 })
  await clientPage.goto(`${origin}/`)
  check('site menu: on a phone the header menu is folded into a button', (await clientPage.locator('.top__nav').isHidden()) && (await clientPage.locator('.top__sheet').isHidden()))
  await clientPage.locator('.top__burger').click()
  const sheet = clientPage.locator('.top__sheet')
  check('site menu: it opens with the free tools and the investors first', (await sheet.isVisible()) && (await sheet.locator('a').first().textContent()) === 'Nástroje zadarmo')
  const box = await sheet.boundingBox()
  check('site menu: it fits the phone', Boolean(box) && box.x >= 0 && box.x + box.width <= 390)
  await clientPage.screenshot({ path: '.wrangler/screens/390-site-menu.png' })
  await sheet.getByRole('link', { name: 'Cenník', exact: true }).click()
  await clientPage.waitForFunction(() => location.hash === '#cennik')
  check('site menu: a link followed to a part of the page closes it', await sheet.isHidden())

  // On a phone Mony opens over the whole screen and holds the page still; folded, the page is where it was, and a
  // cloud left open does not open again by itself on the next page.
  await clientPage.evaluate(() => window.scrollTo({ top: 1500, behavior: 'instant' }))
  const before = await clientPage.evaluate(() => Math.round(scrollY))
  await clientPage.getByRole('button', { name: 'Otvoriť Mony', exact: true }).click()
  await clientPage.waitForTimeout(450)
  const whole = await clientPage.locator('#mony-panel').boundingBox()
  check(
    'mony phone: it covers the screen and holds the page still',
    Boolean(whole) && Math.round(whole.x) === 0 && Math.round(whole.y) === 0 && Math.round(whole.width) === 390 && Math.round(whole.height) === 844 &&
      (await clientPage.evaluate(() => document.documentElement.classList.contains('mony-held') && getComputedStyle(document.body).position === 'fixed')),
    JSON.stringify({ whole, held: await clientPage.evaluate(() => [document.documentElement.className, getComputedStyle(document.body).position, innerWidth, innerHeight]) }),
  )
  await clientPage.mouse.move(195, 400)
  await clientPage.mouse.wheel(0, 900)
  await clientPage.screenshot({ path: '.wrangler/screens/390-mony-phone.png' })
  await clientPage.getByRole('button', { name: 'Skryť Mony', exact: true }).click()
  check('mony phone: folded, the page is exactly where it was', before > 0 && (await clientPage.evaluate(() => Math.round(scrollY))) === before && !(await clientPage.evaluate(() => document.documentElement.classList.contains('mony-held'))))
  await clientPage.evaluate(() => {
    try {
      localStorage.setItem('mony:open', '1')
    } catch {}
  })
  await clientPage.reload()
  await clientPage.getByRole('button', { name: 'Otvoriť Mony', exact: true }).waitFor({ state: 'visible' })
  check('mony phone: left open, it waits folded on the next page', await clientPage.locator('#mony-panel').isHidden())
  await clientPage.setViewportSize({ width: 1440, height: 900 })
}
