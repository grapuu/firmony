// The deployable bundle in the Workers runtime on http://127.0.0.1:8787, with a local database and the stand-ins
// of test/pretend.mjs. Build it first:
//
//   npx wrangler deploy --dry-run --outdir .wrangler/dist && node --no-warnings scripts/playground.mjs
//
// IČO 57442452 is found in the register, 35757442 makes the register fail, anything else is unknown.
// What was "sent" is at /playground/mail.
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import { Miniflare, Response as MfResponse, convertV4MiniflareOptions } from 'miniflare'
import { PRETEND_MAIL, registerAnswer } from '../test/pretend.mjs'

const root = new URL('..', import.meta.url).pathname
const dist = join(root, '.wrangler/dist')
const publicDir = join(root, 'public')
const port = Number(process.env.PORT ?? 8787)

// Written in the long-standing option names and converted, so the script survives Miniflare's own renames.
const mf = new Miniflare(convertV4MiniflareOptions({
  d1Persist: join(root, '.wrangler/playground-d1'),
  workers: [
    {
      name: 'firmony',
      modulesRoot: dist,
      modules: [{ type: 'ESModule', path: join(dist, 'index.js') }],
      compatibilityDate: '2026-10-01',
      d1Databases: { DB: 'firmony-playground' },
      serviceBindings: { EMAIL: 'pretend-mail' },
      async outboundService(request) {
        const answer = registerAnswer(request.url)
        if (answer) return new MfResponse(await answer.text(), { status: answer.status, headers: { 'content-type': 'application/json' } })
        return new MfResponse('unexpected request', { status: 599 })
      },
    },
    { name: 'pretend-mail', modules: true, compatibilityDate: '2026-10-01', script: PRETEND_MAIL },
  ],
}))

const TYPES = { '.css': 'text/css; charset=utf-8', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml' }

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://127.0.0.1:${port}`)
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
