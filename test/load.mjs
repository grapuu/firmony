// A load test (his word of 17 October 2026: the software must manage large companies too, "aj kvantum"). One large
// fictional company is put into a local database, a year of it: thousands of documents a month, as many payments
// from three bank accounts, and a hundred employees. Then every heavy page of the accountant and of the client is
// opened in the real Workers runtime (workerd), and the time, the size and the answer of each are written down.
// Nothing leaves the machine; the data are invented and marked TEST-ONLY.
//
//   npm run test:load                    3 000 documents a month
//   FIRMONY_LOAD_DOCS=6000 npm run test:load
//
// The times are of this machine and of SQLite on its disk, not of Cloudflare's network: they show how the work grows
// with the volume and where it breaks, not the seconds a client will wait.
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { PRETEND_MAIL } from './pretend.mjs'
import { authenticator, jsonClient, TEST_BOOTSTRAP } from './passkeys.fixture.mjs'

const DOCS = Number(process.env.FIRMONY_LOAD_DOCS ?? 3000)
const PEOPLE = Number(process.env.FIRMONY_LOAD_PEOPLE ?? 100)
const MONTHS = 12
const out = process.env.FIRMONY_LOAD_OUT ?? '.wrangler/load'
mkdirSync(out, { recursive: true })

const dist = new URL('../.wrangler/dist', import.meta.url).pathname
const mf = new Miniflare(
  convertV4MiniflareOptions({
    cf: false,
    unsafeTriggerHandlers: true,
    workers: [
      {
        name: 'firmony',
        modulesRoot: dist,
        modules: [{ type: 'ESModule', path: `${dist}/index.js` }],
        compatibilityDate: '2026-10-01',
        d1Databases: { DB: 'firmony-load' },
        r2Buckets: { FILES: 'firmony-load-files' },
        bindings: { TEAM_BOOTSTRAP_EMAIL: 'ahoj@firmony.ai', TEAM_BOOTSTRAP_TOKEN: TEST_BOOTSTRAP, TEAM_BOOTSTRAP_EXPIRES_AT: String(Math.floor(Date.now() / 1000) + 3600) },
        serviceBindings: { EMAIL: 'pretend-mail' },
      },
      { name: 'pretend-mail', modules: true, compatibilityDate: '2026-10-01', script: PRETEND_MAIL },
    ],
  }),
)
const site = 'https://firmony.ai'
let db = await mf.getD1Database('DB')
const mailer = await mf.getWorker('pretend-mail')
const sent = async () => (await mailer.fetch('http://mail/')).json()
const settle = (ms = 300) => new Promise((resolve) => setTimeout(resolve, ms))
const post = (path, fields, cookie = '') =>
  mf.dispatchFetch(`${site}${path}`, { method: 'POST', body: new URLSearchParams(fields).toString(), redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded', 'cf-connecting-ip': '203.0.113.30', origin: site, cookie } })
const nowS = Math.floor(Date.now() / 1000)
// Miniflare's local proxy now and then drops a kept-alive connection ("other side closed"); the seed is written with
// INSERT OR IGNORE, so a batch is simply sent again.
// After such a drop the runtime may be a new one, so the database is asked for again before the next try.
async function retried(work, tries = 6) {
  for (let n = 1; ; n++) {
    try {
      return await work()
    } catch (err) {
      if (n >= tries || !/other side closed|fetch failed|EPIPE|ECONNRESET|poisoned stub/.test(`${err} ${err?.cause ?? ''}`)) throw err
      await settle(500)
      db = await mf.getD1Database('DB')
    }
  }
}
const dayOf = (offsetDays) => new Date(Date.now() + offsetDays * 86400_000).toISOString().slice(0, 10)

// Signing in: the first administrator by the bootstrap code and a passkey; the client by the email link.
async function emailOnly(email) {
  const n = (await sent()).length
  await post('/app/prihlasenie', { email })
  await settle()
  const mail = (await sent()).slice(n).filter((m) => m.to.toLowerCase() === email.toLowerCase()).pop()
  const t = mail?.text.match(/\/app\/vstup\?t=([A-Za-z0-9_-]{43})/)?.[1] ?? ''
  const r = await post('/app/vstup', { t })
  return (r.headers.get('set-cookie') ?? '').split(';')[0]
}
async function bootstrapAdmin() {
  const cookie = await emailOnly('ahoj@firmony.ai')
  const key = await authenticator()
  const api = jsonClient(mf, site, cookie, '203.0.113.101')
  const options = await (await api('/auth/options', { action: 'register', code: TEST_BOOTSTRAP, next: '/ucto' })).json()
  const confirmed = await api('/auth/verify', { id: options.id, response: await key.register(options.options), name: 'TEST-ONLY passkey' })
  if (confirmed.status !== 200) throw new Error(`admin passkey: ${confirmed.status}`)
  return (confirmed.headers.get('set-cookie') ?? '').split(';')[0]
}

// ---------------------------------------------------------------------------------------------------------------
// The company: a VAT payer with three bank accounts, a year of documents and payments, a hundred employees
// ---------------------------------------------------------------------------------------------------------------
await mf.dispatchFetch(`${site}/healthz`)
const adminCookie = await bootstrapAdmin()
const admin = (await db.prepare("SELECT id FROM users WHERE email = 'ahoj@firmony.ai'").first()).id
const company = 'co-load'
const firstMonth = (() => {
  const d = new Date()
  d.setUTCDate(1)
  d.setUTCMonth(d.getUTCMonth() - (MONTHS - 1))
  return d.toISOString().slice(0, 7)
})()
const months = Array.from({ length: MONTHS }, (_, i) => {
  const d = new Date(`${firstMonth}-01T00:00:00Z`)
  d.setUTCMonth(d.getUTCMonth() + i)
  return d.toISOString().slice(0, 7)
})
await db.batch([
  db.prepare("INSERT INTO users (id, created_at, name, email) VALUES ('load-owner', ?, 'TEST-ONLY Konateľ', 'konatel@velka-firma.test')").bind(nowS),
  db.prepare("INSERT INTO companies (id, created_at, name, ico, dic, icdph, vat_payer, plan, inbox, accountant_id, start_on) VALUES (?, ?, 'TEST-ONLY Veľká firma a. s.', '36123456', '2020123456', 'SK2020123456', 1, 'firma', 'velka001', ?, ?)").bind(company, nowS, admin, `${firstMonth}-01`),
  db.prepare("INSERT INTO members (company_id, user_id, role, created_at) VALUES (?, 'load-owner', 'owner', ?)").bind(company, nowS),
  ...[1, 2, 3].map((n) => db.prepare("INSERT INTO accounts (id, company_id, iban, bank, ledger) VALUES (?, ?, ?, 'TEST-ONLY banka', ?)").bind(`acc-load-${n}`, company, `SK31120000001987426375${40 + n}`, `221.00${n}`)),
])

const COSTS = ['material', 'services', 'services', 'services', 'energy', 'goods', 'goods', 'repairs', 'travel', 'fuel', 'insurance', 'fees']
let seed = 7
const random = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648)
const pick = (list) => list[Math.floor(random() * list.length)]
const pad = (n, w = 2) => String(n).padStart(w, '0')
// Each row of the seed as its SQL and values, prepared only when its batch is sent (a statement belongs to one runtime).
const statements = []
const row = (sql, ...values) => statements.push([sql, values])
let docs = 0, payments = 0
const seedStart = performance.now()
for (const month of months) {
  const days = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate()
  for (let i = 0; i < DOCS; i++) {
    const kind = i % 4 === 0 ? 'invoice_out' : i % 7 === 0 ? 'receipt' : 'invoice_in'
    const category = kind === 'invoice_out' ? (i % 3 === 0 ? 'sales_goods' : 'sales') : kind === 'receipt' ? pick(['fuel', 'material', 'representation']) : pick(COSTS)
    const base = Math.round((kind === 'receipt' ? 5 + random() * 120 : 80 + random() * 6000) * 100)
    const vat = category === 'insurance' || category === 'fees' ? 0 : Math.round(base * 0.23)
    const total = base + vat
    const issued = `${month}-${pad(1 + Math.floor(random() * Math.min(days, 26)))}`
    const paidDay = Math.min(days, Number(issued.slice(8)) + 1 + Math.floor(random() * 3))
    const number = `${month.replace('-', '')}${pad(i, 5)}`
    const party = kind === 'invoice_out' ? `TEST-ONLY Odberateľ ${i % 400}` : `TEST-ONLY Dodávateľ ${i % 900}`
    const id = `ld-${month}-${i}`
    const pay = `lp-${month}-${i}`
    row(
      `INSERT OR IGNORE INTO documents (id, company_id, created_at, source, status, read_by, kind, party, party_ico, number, vs, issued_on, due_on, supplied_on, total_cents, vat_cents, currency, category, vat_deduct, booked_at, booked_by)
        VALUES (?, ?, ?, 'upload', 'read', 'TEST-ONLY', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'EUR', ?, ?, ?, ?)`,
      id, company, nowS - (MONTHS * 31 - months.indexOf(month) * 31) * 86400 + i, kind, party, String(30000000 + (i % 900)), number, number, issued, `${month}-${pad(days)}`, issued, total, vat, category, kind === 'invoice_out' || vat === 0 ? 0 : 1, nowS, admin,
    )
    row(
      `INSERT OR IGNORE INTO payments (id, company_id, account_id, created_at, booked_on, amount_cents, party, vs, ref, card) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      pay, company, `acc-load-${1 + (i % 3)}`, nowS, `${month}-${pad(paidDay)}`, kind === 'invoice_out' ? total : -total, party, kind === 'receipt' ? null : number, `TEST-ONLY-${pay}`, kind === 'receipt' ? 1 : 0,
    )
    row("INSERT OR IGNORE INTO links (document_id, payment_id, company_id, how, by, created_at) VALUES (?, ?, ?, 'auto', NULL, ?)", id, pay, company, nowS)
    docs++
    payments++
  }
}
for (let p = 0; p < PEOPLE; p++) {
  row(
    `INSERT OR IGNORE INTO employees (id, company_id, name, born_on, insurer, started_on, wage_cents, declaration, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
    `le-${p}`, company, `TEST-ONLY Zamestnanec ${p + 1}`, `19${70 + (p % 30)}-0${1 + (p % 9)}-1${p % 10}`, pick(['24', '25', '27']), `${firstMonth}-01`, 120000 + (p % 30) * 10000, nowS,
  )
}
for (let i = 0; i < statements.length; i += 100) await retried(() => db.batch(statements.slice(i, i + 100).map(([sql, values]) => db.prepare(sql).bind(...values))))
const seedSeconds = (performance.now() - seedStart) / 1000

// ---------------------------------------------------------------------------------------------------------------
// The pages, each opened three times: the first answer, and the slowest and fastest of the three
// ---------------------------------------------------------------------------------------------------------------
const clientCookie = await emailOnly('konatel@velka-firma.test')
const lastMonth = months[months.length - 2]
const year = months[months.length - 1].slice(0, 4)
const pages = [
  ['team', 'Úvod účtovníčky (Dnes na rade)', '/ucto'],
  ['team', 'Termíny všetkých klientov', '/ucto/terminy'],
  ['team', 'Doklady na zaúčtovanie', '/ucto/doklady'],
  ['team', 'Stránka klienta', `/ucto/klienti/${company}`],
  ['team', 'Obratová predvaha (rok)', `/ucto/klienti/${company}/kniha?rok=${year}`],
  ['team', 'Účtovný denník (mesiac)', `/ucto/klienti/${company}/kniha/dennik?rok=${year}&mesiac=${Number(lastMonth.slice(5))}`],
  ['team', 'Hlavná kniha, účet 518', `/ucto/klienti/${company}/kniha/ucet/518?rok=${year}`],
  ['team', 'Saldokonto', `/ucto/klienti/${company}/kniha/saldokonto?rok=${year}`],
  ['team', 'Banka proti knihám', `/ucto/klienti/${company}/kniha/platby?rok=${year}`],
  ['team', 'DPH za mesiac', `/ucto/klienti/${company}/dph?obdobie=${lastMonth}`],
  ['team', 'Mzdy za mesiac (100 ľudí)', `/ucto/klienti/${company}/mzdy?obdobie=${lastMonth}`],
  ['team', 'Závierka a daň z príjmov (rok)', `/ucto/klienti/${company}/zavierka?rok=${year}`],
  ['team', 'Podania na dokončenie', '/ucto/podania'],
  ['client', 'Prehľad klienta', '/app'],
  ['client', 'Platby klienta', '/app/platby?filter=vsetky'],
  ['client', 'Doklady klienta', '/app/doklady'],
  ['client', 'Dane klienta', '/app/dane'],
]
const results = []
for (const [side, name, path] of pages) {
  const cookie = side === 'team' ? adminCookie : clientCookie
  const runs = []
  let status = 0, bytes = 0, body = ''
  for (let n = 0; n < 3; n++) {
    const start = performance.now()
    const res = await retried(() => mf.dispatchFetch(`${site}${path}`, { redirect: 'manual', headers: { 'cf-connecting-ip': '203.0.113.30', cookie } }))
    body = await res.text()
    runs.push(performance.now() - start)
    status = res.status
    bytes = Buffer.byteLength(body)
  }
  if (status === 200) writeFileSync(`${out}/${path.replace(/^\//, '').replace(/[^a-z0-9]+/gi, '-') || 'root'}.html`, body)
  results.push({ side, name, path, status, ms: Math.round(Math.min(...runs)), worst: Math.round(Math.max(...runs)), kb: Math.round(bytes / 1024) })
  console.log(`${status === 200 ? 'ok  ' : 'FAIL'} ${String(Math.round(Math.min(...runs))).padStart(6)} ms  ${String(Math.round(bytes / 1024)).padStart(6)} kB  ${name}  ${path}`)
}
// The runtime may have been restarted under the load; its database is asked through a fresh handle.
const size = await (await mf.getD1Database('DB')).prepare("SELECT (SELECT COUNT(*) FROM documents) AS docs, (SELECT COUNT(*) FROM payments) AS payments, (SELECT COUNT(*) FROM employees) AS people").first()
const report = { at: new Date().toISOString(), docsPerMonth: DOCS, months: MONTHS, people: PEOPLE, rows: size, seedSeconds: Math.round(seedSeconds), results }
writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 2))
console.log(`\n${size.docs} documents, ${size.payments} payments, ${size.people} employees; seeded in ${Math.round(seedSeconds)} s. Report: ${out}/report.json`)
await mf.dispose()
if (results.some((r) => r.status !== 200)) process.exitCode = 1
