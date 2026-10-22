import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { buildMetadata, generateBuildMetadata } from '../scripts/build-metadata.mjs'
import { verifyDeployment } from '../scripts/verify-deployment.mjs'
import { createHash } from 'node:crypto'

const current = '1234567890abcdef1234567890abcdef12345678'
const previous = 'abcdef1234567890abcdef1234567890abcdef12'
const origin = 'https://example.test'
const guide = { path: '/navod', modified: '2026-10-21', faq: [{ q: 'Otázka', a: 'Odpoveď' }], sources: [{ url: 'https://example.test/zdroj?a=1&b=2' }] }
const page = `<link rel="canonical" href="${origin}/navod"><script type="application/ld+json">${JSON.stringify({ '@graph': [{ '@type': 'Article', dateModified: guide.modified }, { '@type': 'BreadcrumbList' }, { '@type': 'FAQPage' }] })}</script><a href="https://example.test/zdroj?a=1&amp;b=2">Zdroj</a>`
const healthy = { ok: true, schema: 77, build: { revision: current } }
function fixture({ health = () => healthy, status = 200, html = page, sitemap = true, llms = true } = {}) {
  return async (url) => {
    const path = new URL(url).pathname
    if (path === '/healthz') return Response.json(health(), { status })
    if (path === '/sitemap.xml') return new Response(sitemap ? `<loc>${origin}/navod</loc><lastmod>${guide.modified}</lastmod>` : '')
    if (path === '/llms.txt') return new Response(llms ? `${origin}/navod` : '')
    return new Response(html)
  }
}
const probe = (fetcher, extra = {}) => verifyDeployment({ origin, revision: current, schema: 77, guides: [guide], fetcher, timeoutMs: 250, pollMs: 2, log: () => {}, ...extra })

test('build uses the full platform revision before a different local checkout', () => {
  assert.deepEqual(buildMetadata(current.toUpperCase(), previous), { revision: current, source: 'cloudflare' })
  assert.deepEqual(buildMetadata(undefined, previous), { revision: previous, source: 'git' })
  assert.deepEqual(buildMetadata(undefined, undefined), { revision: null, source: 'unknown' })
})

test('invalid platform metadata cannot silently fall back or echo an arbitrary value', () => {
  for (const value of ['', current.slice(0, 7), 'TEST-ONLY-private-value', `${current}\n`, 123]) {
    assert.throws(() => buildMetadata(value, current), (error) => error.message === 'Neplatný identifikátor commitu v prostredí zostavenia.')
  }
})

test('generated build module contains only allowlisted metadata and is idempotent', async () => {
  const base = new URL('../.wrangler/tmp/', import.meta.url)
  await mkdir(base, { recursive: true })
  const root = await mkdtemp(new URL('build-info-', base))
  try {
    await generateBuildMetadata({ root, env: { WORKERS_CI_COMMIT_SHA: current, TEST_ONLY_PRIVATE: 'TEST-ONLY-not-for-the-bundle' } })
    const path = `${root}/src/generated/deployment.ts`
    const contents = await readFile(path, 'utf8')
    const before = (await stat(path)).mtimeMs
    assert.ok(contents.includes(current) && contents.includes('cloudflare'))
    assert.ok(!contents.includes('TEST_ONLY') && !contents.includes('not-for-the-bundle'))
    await generateBuildMetadata({ root, env: { WORKERS_CI_COMMIT_SHA: current } })
    assert.equal((await stat(path)).mtimeMs, before)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('HTTP 200 without the full expected revision never establishes readiness', async () => {
  for (const build of [undefined, { revision: previous }, { revision: current.slice(0, 7) }]) {
    await assert.rejects(probe(fixture({ health: () => ({ ok: true, schema: 77, build }) })), /očakávaný commit/)
  }
})

test('a failed database or wrong schema cannot pass even at the expected revision', async () => {
  await assert.rejects(probe(fixture({ status: 503 })), /HTTP 503/)
  await assert.rejects(probe(fixture({ health: () => ({ ...healthy, ok: false }) })), /nie je pripravená/)
  await assert.rejects(probe(fixture({ health: () => ({ ...healthy, schema: 76 }) })), /nie je pripravená/)
})

test('a matching deployment must also serve actual metadata, sources and discovery files', async () => {
  assert.deepEqual(await probe(fixture(), { timeoutMs: 1000 }), { revision: current, schema: 77, guides: 1 })
  for (const html of [page.replace('/navod"', '/ina-stranka"'), page.replace('FAQPage', 'Other'), page.replace('a=1&amp;b=2', 'a=2&amp;b=3')]) {
    await assert.rejects(probe(fixture({ html })), /Nasadenie sa/)
  }
  await assert.rejects(probe(fixture({ sitemap: false })), /sitemap/)
  await assert.rejects(probe(fixture({ llms: false })), /llms/)
})

test('probe waits for the revision and rechecks it after the public pages', async () => {
  let calls = 0
  const fetcher = fixture({ health: () => ({ ...healthy, build: { revision: ++calls === 1 ? previous : current } }) })
  assert.equal((await probe(fetcher, { timeoutMs: 1000 })).revision, current)
  assert.ok(calls >= 3)
  calls = 0
  await assert.rejects(probe(fixture({ health: () => ({ ...healthy, build: { revision: ++calls === 1 ? current : previous } }) })), /očakávaný commit/)
})

test('transport failures and invalid responses do not publish response bodies or private details', async () => {
  const logs = []
  await assert.rejects(probe(async () => { throw new Error('TEST-ONLY-private-transport-detail') }, { log: (line) => logs.push(line) }), /neodpovedá/)
  assert.ok(!logs.join('\n').includes('TEST-ONLY'))
  await assert.rejects(probe(async () => new Response('TEST-ONLY-private-response')), /neplatná odpoveď JSON/)
})

test('no abbreviated revision or empty page list can produce a successful empty probe', async () => {
  await assert.rejects(probe(fixture(), { revision: current.slice(0, 7) }), /40-znakový/)
  await assert.rejects(probe(fixture(), { guides: [] }), /zoznam stránok/)
})

test('an unfinished retry at the deadline preserves the last concrete deployment failure', async () => {
  const originalNow = Date.now
  let clock = originalNow()
  let healthCalls = 0
  const fetcher = fixture({ llms: false })
  try {
    Date.now = () => clock
    await assert.rejects(probe(async (url) => {
      if (new URL(url).pathname === '/healthz' && ++healthCalls === 2) clock += 1000
      return fetcher(url)
    }, { timeoutMs: 100, pollMs: 0 }), /llms/)
    assert.equal(healthCalls, 2)
  } finally { Date.now = originalNow }
})

test('a public tool needs its canonical page, content and current discovery records', async () => {
  const tool = { path:'/nastroj', modified:'2026-10-22', markers:['data-tool'] }
  const fallback = fixture()
  const body = `<link rel="canonical" href="${origin}/nastroj"><div data-tool></div>`
  const response = (broken = '') => async (url) => {
    const path = new URL(url).pathname
    if (path === '/nastroj') return new Response(broken === 'body' ? '<h1>Other</h1>' : body)
    const answer = await fallback(url)
    if (path === '/sitemap.xml') return new Response((await answer.text()) + (broken === 'map' ? '' : `<loc>${origin}/nastroj</loc><lastmod>${tool.modified}</lastmod>`))
    if (path === '/llms.txt') return new Response((await answer.text()) + (broken === 'llms' ? '' : `${origin}/nastroj`))
    return answer
  }
  assert.deepEqual(await probe(response(), { publicPages:[tool] }), {revision:current,schema:77,guides:1,tools:1,assets:0})
  for (const broken of ['body','map','llms']) await assert.rejects(probe(response(broken), {publicPages:[tool]}), /nastroj/)
})

test('a stale or missing browser bundle cannot pass deployment verification at the correct Worker revision', async () => {
  const bytes = 'TEST-ONLY-browser-bundle'
  const assets = [{path:'/tool.js',sha256:createHash('sha256').update(bytes).digest('hex')}]
  const fallback = fixture()
  const fetcher = (body, status=200) => async (url) => new URL(url).pathname === '/tool.js' ? new Response(body,{status}) : fallback(url)
  assert.equal((await probe(fetcher(bytes),{assets})).revision,current)
  await assert.rejects(probe(fetcher('OLD-BUNDLE'),{assets}), /nezodpovedá zostaveniu/)
  await assert.rejects(probe(fetcher('',404),{assets}), /HTTP 404/)
})
