// The public price decision works on a phone with the real server, without a sign-in or promotional defaults.
import { check } from './check.mjs'

export async function checkCustomerValueBrowser({ browser, origin }) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const page = await context.newPage()
  try {
    await page.route('**/*', (route) => new URL(route.request().url()).origin === origin ? route.continue() : route.abort())
    await page.goto(origin)
    check('value browser: initial comparison has no invented annual saving', await page.locator('.calc__result .calc__line').count() === 0 && (await page.locator('.calc__result').textContent()).includes('Zadajte svoje náklady'))
    const annual = await page.locator('[data-plan-year]').allTextContents()
    check('value browser: every plan discloses its annual closing-inclusive base cost', annual.length === 3 && ['1 317 €', '2 277 €', '4 197 €'].every((price, i) => annual[i].replace(/[\u00a0\u202f]/g, ' ').includes(price)))
    check('value browser: the first choice remains nonbinding and its terms and privacy are accessible', await page.locator('.pricing__links a[href="/podmienky"]').count() === 1 && await page.locator('.pricing__links a[href="/pravne-informacie#ochrana-udajov"]').count() === 1 && (await page.locator('.hero__card').textContent()).includes('Zatiaľ nič neobjednávate'))
    const compare = async (monthly, closing, people) => {
      await page.locator('.calc__form [name=mesacne]').fill(monthly)
      await page.locator('.calc__form [name=za-doklad]').fill('0')
      await page.locator('.calc__form [name=doklady]').fill('10')
      await page.locator('.calc__form [name=zavierka]').fill(closing)
      await page.locator('.calc__form [name=ludia]').fill(people)
      await Promise.all([page.waitForURL((url) => url.searchParams.get('mesacne') === monthly && url.searchParams.get('ludia') === people), page.locator('.calc__form button[type=submit]').click()])
      return (await page.locator('.calc__result').textContent()).replace(/[\u00a0\u202f]/g, ' ')
    }
    let result = await compare('30', '0', '0')
    check('value browser: the real form states the higher Firmony cost instead of forcing a positive saving', result.includes('platili viac') && result.includes('957 €') && await page.locator('.calc__line--save').count() === 0)
    result = await compare('89', '249', '0')
    check('value browser: the real form states equal costs plainly', result.includes('ročná cena rovnaká') && !result.includes('Ušetríte ročne'))
    result = await compare('150', '249', '2')
    check('value browser: customer inputs and both payroll positions are included in the annual comparison', result.includes('2 049 €') && result.includes('1 677 €') && result.includes('372 €') && result.includes('Vašich vstupov'))
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 })
      check(`value browser: the annual costs and comparison fit a ${width}px phone`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      await page.screenshot({ path: `.wrangler/screens/${width}-customer-value-browser.png`, fullPage: true })
    }
  } finally { await context.close() }
}
