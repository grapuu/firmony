// A passive public probe. It never deploys, signs in, reads credentials or changes client data.
import { setTimeout as pause } from 'node:timers/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { revisionOf } from './build-metadata.mjs'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'

const escape = (text) => text.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
class ProbeError extends Error {}

export async function verifyDeployment({ origin, revision, schema, guides, publicPages = [], assets = [], fetcher = fetch, timeoutMs = 20 * 60_000, pollMs = 15_000, log = console.log }) {
  const expected = revisionOf(revision)
  if (!expected) throw new Error('Overenie vyžaduje celý 40-znakový identifikátor commitu.')
  const base = new URL(origin)
  if (base.protocol !== 'https:' && !['127.0.0.1', 'localhost'].includes(base.hostname)) throw new Error('Overenie vyžaduje HTTPS.')
  if (!Number.isInteger(schema) || schema < 1 || !guides?.length) throw new Error('Chýba očakávaná schéma alebo zoznam stránok.')
  const deadline = Date.now() + timeoutMs
  let last = ''
  const read = async (path) => {
    const remaining = deadline - Date.now()
    if (remaining <= 0) throw new ProbeError('Čas overenia uplynul.')
    const response = await fetcher(new URL(path, base), { redirect: 'error', headers: { accept: path === '/healthz' ? 'application/json' : 'text/html,text/plain,application/xml' }, signal: AbortSignal.timeout(Math.max(1, Math.min(5000, remaining))) })
    if (response.status !== 200) throw new ProbeError(`${path}: HTTP ${response.status}`)
    return response.text()
  }
  const health = async () => {
    let body
    try { body = JSON.parse(await read('/healthz')) } catch (error) {
      if (error instanceof SyntaxError) throw new ProbeError('/healthz: neplatná odpoveď JSON.')
      throw error
    }
    if (body?.ok !== true || body.schema !== schema) throw new ProbeError('/healthz: služba alebo schéma ešte nie je pripravená.')
    if (revisionOf(body.build?.revision) !== expected) throw new ProbeError('/healthz: očakávaný commit ešte nie je aktívny.')
  }
  while (Date.now() < deadline) {
    try {
      await health()
      const sitemap = await read('/sitemap.xml')
      const llms = await read('/llms.txt')
      for (const guide of guides) {
        const url = new URL(guide.path, base).href
        const page = await read(guide.path)
        const block = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(page)
        let graph
        try { graph = block ? JSON.parse(block[1])['@graph'] : null } catch { graph = null }
        const article = Array.isArray(graph) ? graph.find((item) => item?.['@type'] === 'Article') : null
        const types = Array.isArray(graph) ? graph.map((item) => item?.['@type']) : []
        if (!page.includes(`<link rel="canonical" href="${escape(url)}"`) || !article || article.dateModified !== guide.modified || !types.includes('BreadcrumbList') || (guide.faq.length > 0 && !types.includes('FAQPage'))) throw new ProbeError(`${guide.path}: nesúhlasí kanonická adresa alebo štruktúrované údaje.`)
        if (!guide.sources.every((source) => page.includes(`href="${escape(source.url)}"`))) throw new ProbeError(`${guide.path}: chýba zdroj.`)
        if (!sitemap.includes(`<loc>${escape(url)}</loc><lastmod>${guide.modified}</lastmod>`) || !llms.includes(url)) throw new ProbeError(`${guide.path}: chýba aktuálny záznam v sitemap alebo llms.txt.`)
      }
      for (const item of publicPages) {
        const url = new URL(item.path, base).href
        const body = await read(item.path)
        if (!body.includes(`<link rel="canonical" href="${escape(url)}"`) || !item.markers.every((marker) => body.includes(marker))) throw new ProbeError(`${item.path}: chýba očakávaný verejný nástroj.`)
        if (!sitemap.includes(`<loc>${escape(url)}</loc><lastmod>${item.modified}</lastmod>`) || !llms.includes(url)) throw new ProbeError(`${item.path}: chýba aktuálny záznam v sitemap alebo llms.txt.`)
      }
      for (const asset of assets) {
        const actual = createHash('sha256').update(await read(asset.path)).digest('hex')
        if (actual !== asset.sha256) throw new ProbeError(`${asset.path}: verejný súbor nezodpovedá zostaveniu.`)
      }
      // Check again after the page probes: one response during a gradual change must not establish readiness.
      await health()
      log(`Nasadenie potvrdené: ${expected}, schéma ${schema}, návody ${guides.length}${publicPages.length ? `, nástroje ${publicPages.length}, súbory ${assets.length}` : ''}.`)
      return { revision: expected, schema, guides: guides.length, ...(publicPages.length ? { tools: publicPages.length, assets: assets.length } : {}) }
    } catch (error) {
      // A retry may exhaust the remaining budget between reads. Keep the last actual finding instead of
      // replacing it with a generic deadline/transport message from that unfinished attempt.
      if (last && Date.now() >= deadline) break
      // Error messages are ours or generic transport names; never log response bodies or arbitrary server text.
      const message = error instanceof ProbeError ? error.message : 'Verejný web zatiaľ neodpovedá.'
      if (message !== last) log(message)
      last = message
    }
    const remaining = deadline - Date.now()
    if (remaining > 0) await pause(Math.min(pollMs, remaining))
  }
  throw new Error(`Nasadenie sa v stanovenom čase nepotvrdilo. ${last}`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { BRAND, GUIDES, SCHEMA_VERSION, TOOL_DEPLOYMENT_PAGES } = await import('../.wrangler/tmp/deployment-probe.mjs')
  try {
    const assets = await Promise.all(['/free-invoice.js', '/app.css', '/inside.css', '/inside.js'].map(async (path) => ({ path, sha256: createHash('sha256').update(await readFile(new URL(`../public${path}`, import.meta.url))).digest('hex') })))
    await verifyDeployment({ origin: BRAND.origin, revision: process.argv[2], schema: SCHEMA_VERSION, guides: GUIDES, publicPages: TOOL_DEPLOYMENT_PAGES, assets })
  }
  catch (error) { console.error(error.message); process.exitCode = 1 }
}
