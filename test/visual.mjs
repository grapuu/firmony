// HTML is captured from the real workerd requests in e2e.workerd.mjs. Only local fixture pages and local assets load.
import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { readFile, mkdir } from 'node:fs/promises'
import { resolve, extname, sep } from 'node:path'

const fixtures = resolve(process.env.FIRMONY_CAPTURE_DIR ?? '.wrangler/ui')
const assets = resolve('public')
const out = resolve('.wrangler/screens')
await mkdir(out, { recursive: true })
const pages = ['monthly-sv.html', 'monthly-sv-transition.html']
for (const name of pages) await readFile(resolve(fixtures, name))
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.ico': 'image/x-icon' }
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
        const ids = [...document.querySelectorAll('[id^="suhrnny"]')].map((e) => e.id)
        return { overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1, unique: new Set(ids).size === ids.length, cards: document.querySelectorAll('section.info[id^="suhrnny-"]').length }
      })
      await page.screenshot({ path: `${out}/${width}-${name.replace('.html', '.png')}`, fullPage: true })
      if (layout.overflow || !layout.unique || layout.cards !== 3) throw new Error(`${width} ${name}: ${JSON.stringify(layout)}`)
      console.log(`${width} ${name}: fits; three cards with unique accessible headings`)
    }
    await page.close()
  }
} finally {
  await browser?.close()
  await new Promise((done) => server.close(done))
}
