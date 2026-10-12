// Takes pictures of one page of the playground as a visitor sees it while scrolling: one screen at a time,
// at the scroll positions given (in screen heights, or as an element's selector), so that what is tied to
// scrolling (the steps of "Ako to funguje") is seen as it really is.
//
//   node scripts/dev/scroll.mjs <folder> <width> <height> <path> <position ...>
//   node scripts/dev/scroll.mjs shots 1440 900 / 0 '#ako-to-funguje' 1.5 2.2
import { execSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { chromium } = require(`${execSync('npm root -g').toString().trim()}/playwright`)
const [out, width, height, path, ...positions] = process.argv.slice(2)
mkdirSync(out, { recursive: true })
const BASE = process.env.BASE ?? 'http://127.0.0.1:8787'
const mobile = Number(width) < 600
const browser = await chromium.launch()
// Still pictures by default (nothing half-way through its animation); MOTION=on shows the page as it moves.
const context = await browser.newContext({ viewport: { width: Number(width), height: Number(height) }, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile, reducedMotion: process.env.MOTION === 'on' ? 'no-preference' : 'reduce' })
const page = await context.newPage()
await page.goto(BASE + path, { waitUntil: 'networkidle' })
await page.evaluate(() => document.fonts.ready)
let n = 0
for (const position of positions) {
  const y = await page.evaluate((p) => {
    const number = Number(p)
    if (!Number.isNaN(number)) return number * window.innerHeight
    const el = document.querySelector(p)
    return el ? el.getBoundingClientRect().top + window.scrollY : 0
  }, position)
  await page.evaluate((top) => window.scrollTo({ top, behavior: 'instant' }), y)
  await page.waitForTimeout(700)
  await page.evaluate(() => Promise.race([new Promise((resolve) => setTimeout(resolve, 4000)), Promise.all([...document.images].filter((img) => img.getClientRects().length > 0 && img.getBoundingClientRect().top < window.innerHeight * 2).map((img) => (img.complete ? null : new Promise((resolve) => { img.onload = img.onerror = resolve }))))]))
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${out}/${width}-${String(n++).padStart(2, '0')}.png` })
  console.log(position, Math.round(y))
}
await browser.close()
