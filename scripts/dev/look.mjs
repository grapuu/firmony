// Opens pages of the playground at three widths, says whether anything scrolls sideways (and which elements reach
// past the edge), and saves a full-page picture of each.
//
//   node --no-warnings scripts/playground.mjs        (in another shell)
//   node scripts/dev/look.mjs <folder for the pictures> [path ...]
import { execSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { chromium } = require(`${execSync('npm root -g').toString().trim()}/playwright`)
const out = process.argv[2] ?? 'shots'
mkdirSync(out, { recursive: true })
const BASE = process.env.BASE ?? 'http://127.0.0.1:8787'
const SIZES = [
  [1440, 900, 1, false],
  [390, 844, 2, true],
  [320, 640, 2, true],
]
const PAGES = process.argv.length > 3 ? process.argv.slice(3) : [
  '/',
  '/?mesacne=60&za-doklad=5,20&doklady=25&zavierka=160&dph=nie&ludia=0#kalkulacka',
  '/zacat?balik=rast',
  '/zacat?ico=57442452&balik=rast',
  '/zacat?ico=12345679',
  '/zacat?nova=1',
  '/zacat/hotovo',
  '/pravne-informacie',
  '/neexistuje',
]
const name = (path) => (path === '/' ? 'home' : path.replace(/^\//, '').replace(/[^a-z0-9]+/gi, '-').replace(/-+$/, '')).slice(0, 60)

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' in {} ? undefined : undefined })
for (const [w, h, dpr, mobile] of SIZES) {
  const context = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, isMobile: mobile, hasTouch: mobile, reducedMotion: 'reduce' })
  const page = await context.newPage()
  for (const path of PAGES) {
    const res = await page.goto(BASE + path, { waitUntil: 'networkidle' })
    await page.evaluate(() => document.fonts.ready)
    // Scroll down the page and back, so that pictures that load when they come near are there.
    await page.evaluate(async () => {
      for (let y = 0; y < document.documentElement.scrollHeight; y += 600) {
        window.scrollTo(0, y)
        await new Promise((resolve) => setTimeout(resolve, 60))
      }
      window.scrollTo(0, 0)
    })
    await page.waitForLoadState('networkidle')
    await page.evaluate(() => Promise.race([new Promise((resolve) => setTimeout(resolve, 4000)), Promise.all([...document.images].filter((img) => img.getClientRects().length > 0).map((img) => (img.complete ? null : new Promise((resolve) => { img.onload = img.onerror = resolve }))))]))
    const [scroll, client] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth])
    const wide = await page.evaluate(() =>
      [...document.querySelectorAll('body *')]
        .filter((e) => e.getBoundingClientRect().right > document.documentElement.clientWidth + 1)
        .slice(0, 4)
        .map((e) => `${e.tagName.toLowerCase()}.${e.className}`),
    )
    console.log(w, path, res?.status(), scroll > client ? 'OVERFLOW' : 'fits', wide.join(' '))
    await page.screenshot({ path: `${out}/${w}-${name(path)}.png`, fullPage: true })
  }
  await context.close()
}
await browser.close()
