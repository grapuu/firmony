// The deployable bundle in the Workers runtime on http://127.0.0.1:8787, with a local database and the stand-ins
// of test/pretend.mjs. Build it first:
//
//   npx wrangler deploy --dry-run --outdir .wrangler/dist && node --no-warnings scripts/playground.mjs
//
// IČO 57442452 is found in the register, 35757442 makes the register fail, anything else is unknown.
// What was "sent" is at /playground/mail. /playground/koniec?dni=20 puts the sample company twenty days past the
// last day of its contract (&zrusit=1 takes it back). /app/ukazka signs in to the sample company of the client's app; a
// document added there is "read" by a pretend reader as yesterday's café receipt.
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import { Miniflare, Response as MfResponse, convertV4MiniflareOptions } from 'miniflare'
import { PRETEND_MAIL, pretendBank, readerAnswer, registerAnswer } from '../test/pretend.mjs'

const root = new URL('..', import.meta.url).pathname
const dist = join(root, '.wrangler/dist')
const publicDir = join(root, 'public')
const port = Number(process.env.PORT ?? 8787)

// The bank of the sample company, by open banking: what it holds besides what the sample statement brought. The
// café of yesterday is in both and arrives once; the money for invoice 20260007 pays it; a new card payment and a
// fee arrive. Its sign-in is /playground/banka, which asks once and comes back.
const bratislavaDay = (shift = 0) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Bratislava' }).format(new Date(Date.now() + shift * 86400000))
const bank = pretendBank({
  iban: 'SK3112000000198742637541',
  balance: () => '5454.43',
  approve: (back) => `http://127.0.0.1:${port}/playground/banka?spat=${encodeURIComponent(back)}`,
  transactions: () => [
    { entry_reference: 'pg-1', transaction_amount: { currency: 'EUR', amount: '12.40' }, credit_debit_indicator: 'DBIT', status: 'BOOK', booking_date: bratislavaDay(-1), remittance_information: ['Platba kartou KAVIAREN NA ROHU KOSICE'], bank_transaction_code: { code: 'CCRD' } },
    { entry_reference: 'pg-2', transaction_amount: { currency: 'EUR', amount: '621.15' }, credit_debit_indicator: 'CRDT', status: 'BOOK', booking_date: bratislavaDay(0), debtor: { name: 'Kníhkupectvo Na korze s. r. o.' }, debtor_account: { iban: 'SK4111000000002987654321' }, remittance_information: ['/VS20260007/SS/KS0308'] },
    { entry_reference: 'pg-3', transaction_amount: { currency: 'EUR', amount: '23.85' }, credit_debit_indicator: 'DBIT', status: 'BOOK', booking_date: bratislavaDay(0), remittance_information: ['Platba kartou BILLA KOSICE'], bank_transaction_code: { code: 'CCRD' } },
    { entry_reference: 'pg-4', transaction_amount: { currency: 'EUR', amount: '4.50' }, credit_debit_indicator: 'DBIT', status: 'BOOK', booking_date: bratislavaDay(0), remittance_information: ['Poplatok za vedenie účtu'] },
  ],
})

// Written in the long-standing option names and converted, so the script survives Miniflare's own renames.
const mf = new Miniflare(convertV4MiniflareOptions({
  d1Persist: join(root, '.wrangler/playground-d1'),
  r2Persist: join(root, '.wrangler/playground-r2'),
  workers: [
    {
      name: 'firmony',
      modulesRoot: dist,
      modules: [{ type: 'ESModule', path: join(dist, 'index.js') }],
      compatibilityDate: '2026-10-01',
      d1Databases: { DB: 'firmony-playground' },
      r2Buckets: { FILES: 'firmony-files' },
      bindings: { DEMO: '1', ANTHROPIC_API_KEY: 'pretend', ENABLE_BANKING_APP: bank.app, ENABLE_BANKING_KEY: bank.privateKey },
      serviceBindings: { EMAIL: 'pretend-mail' },
      async outboundService(request) {
        const banked = await bank.answer(request)
        if (banked) return new MfResponse(await banked.text(), { status: banked.status, headers: { 'content-type': 'application/json' } })
        const read = await readerAnswer(request)
        if (read) return new MfResponse(await read.text(), { status: read.status, headers: { 'content-type': 'application/json' } })
        const answer = registerAnswer(request.url)
        if (answer) return new MfResponse(await answer.text(), { status: answer.status, headers: { 'content-type': 'application/json' } })
        return new MfResponse('unexpected request', { status: 599 })
      },
    },
    { name: 'pretend-mail', modules: true, compatibilityDate: '2026-10-01', script: PRETEND_MAIL },
  ],
}))

const TYPES = { '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' }

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://127.0.0.1:${port}`)
    if (url.pathname === '/playground/banka') {
      // The bank's own sign-in, as a client meets it: one question, and back to Firmony.
      const back = url.searchParams.get('spat') ?? '/'
      const cancel = `${back.split('?')[0]}?error=access_denied&state=${encodeURIComponent(new URL(back, url).searchParams.get('state') ?? '')}`
      const esc = (text) => text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      return res.end(`<!doctype html><html lang="sk"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Banka (ukážka)</title>
<body style="margin:0;font-family:system-ui,sans-serif;background:#f3f4f6;color:#111">
<main style="max-width:420px;margin:48px auto;padding:28px;background:#fff;border-radius:16px;box-shadow:0 10px 30px rgba(0,0,0,.08)">
<p style="margin:0 0 6px;color:#666;font-size:14px">Ukážka prihlásenia v banke</p>
<h1 style="margin:0 0 16px;font-size:22px">Povoliť prístup k účtom?</h1>
<p style="line-height:1.5">Firmony (cez Enable Banking) chce čítať pohyby a zostatok na Vašom podnikateľskom účte SK31 1200 0000 1987 4263 7541 počas 180 dní. Platiť ani nič meniť nemôže.</p>
<p style="display:flex;gap:10px;margin-top:24px"><a href="${esc(back)}" style="padding:12px 18px;border-radius:10px;background:#1c2ef0;color:#fff;text-decoration:none;font-weight:600">Povoliť prístup</a>
<a href="${esc(cancel)}" style="padding:12px 18px;border-radius:10px;border:1px solid #ccc;color:#111;text-decoration:none">Zrušiť</a></p>
</main></body></html>`)
    }
    if (url.pathname === '/playground/koniec') {
      // The end of a contract as a client sees it some days after (the team's form takes no day in the past):
      // ?firma=<id>&dni=<days since the last day>, or &zrusit=1 to run on as before.
      const db = await mf.getD1Database('DB')
      const company = url.searchParams.get('firma') ?? 'demo-company'
      if (url.searchParams.get('zrusit') === '1') {
        await db.prepare('UPDATE companies SET notice_at = NULL, notice_by = NULL, notice_side = NULL, ends_on = NULL WHERE id = ?').bind(company).run()
      } else {
        const days = Number(url.searchParams.get('dni') ?? '0') || 0
        await db
          .prepare("UPDATE companies SET notice_at = ?, notice_by = 'demo-admin', notice_side = 'firmony', ends_on = ? WHERE id = ?")
          .bind(Math.floor(Date.now() / 1000), bratislavaDay(-days), company)
          .run()
      }
      res.writeHead(303, { location: '/app' })
      return res.end()
    }
    if (url.pathname === '/playground/mail') {
      const mailer = await mf.getWorker('pretend-mail')
      const sent = await (await mailer.fetch('http://mail/')).json()
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
      return res.end(JSON.stringify(sent, null, 2))
    }
    const type = TYPES[extname(url.pathname)]
    if (type && req.method === 'GET') {
      const path = normalize(url.pathname).replace(/^(\.\.[/\\])+/, '')
      try {
        const body = await readFile(join(publicDir, path))
        res.writeHead(200, { 'content-type': type })
        return res.end(body)
      } catch {
        // Not a file: the Worker answers.
      }
    }
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    const headers = new Headers()
    for (const [name, value] of Object.entries(req.headers)) if (typeof value === 'string') headers.set(name, value)
    headers.set('cf-connecting-ip', '127.0.0.1')
    const answer = await mf.dispatchFetch(url.toString(), { method: req.method, headers, body: chunks.length ? Buffer.concat(chunks) : undefined, redirect: 'manual' })
    const out = {}
    answer.headers.forEach((value, name) => (out[name] = value))
    res.writeHead(answer.status, out)
    res.end(Buffer.from(await answer.arrayBuffer()))
  } catch (err) {
    res.writeHead(500)
    res.end(String(err))
  }
}).listen(port, '127.0.0.1', () => console.log(`playground on http://127.0.0.1:${port}`))
