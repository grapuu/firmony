// What the assistant Mony knows (27 October 2026, the owner's word: an assistant that knows the company, how Firmony
// works and how its code works). Built on every deploy from what the repository already holds, so it grows with it:
// the working notes (CLAUDE.md) and docs/, the guides written for Mony (docs/mony), the texts the site and the app
// show, the guides and terms, and a map of the code from each file's own opening comment. Each section is marked for
// whom it is: a client sees how to use the app and the public facts, an accountant also the professional workflow,
// the administrator everything. Writes src/generated/knowledge.ts and src/generated/mony-routes.ts (not in git).
import { build } from 'esbuild'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { join, relative } from 'node:path'

const CLIENT = 1, ACCOUNTANT = 2, ADMIN = 4, ALL = CLIENT | ACCOUNTANT | ADMIN, TEAM = ACCOUNTANT | ADMIN
const MAX = 2800

const plain = (text) => text.replace(/[ ]/g, ' ').replace(/⁠/g, '')
const short = (text, n = 110) => {
  const t = plain(text).replace(/[*`#>_]/g, '').replace(/\s+/g, ' ').trim()
  return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t
}

const chunks = []
function add(audience, title, text) {
  const body = plain(text).trim()
  if (body) chunks.push([`s${chunks.length + 1}`, audience, short(title, 120), body])
}

/** Paragraphs (blank-line separated) gathered up to MAX; a longer one is cut at line ends. */
function pieces(text) {
  const out = []
  let buf = ''
  const push = () => {
    if (buf.trim()) out.push(buf.trim())
    buf = ''
  }
  for (const para of text.split(/\n\s*\n/)) {
    if (para.length > MAX) {
      push()
      let part = ''
      for (const line of para.split('\n')) {
        if (part && part.length + line.length + 1 > MAX) {
          out.push(part.trim())
          part = ''
        }
        part += `${line}\n`
      }
      if (part.trim()) out.push(part.trim())
      continue
    }
    if (buf && buf.length + para.length + 2 > MAX) push()
    buf += `${para}\n\n`
  }
  push()
  return out
}

/** A Markdown file split by its headings; `audienceOf` gets the heading path and says for whom each part is. */
function addMarkdown(name, source, audienceOf) {
  const sections = []
  let path = [],
    lines = []
  const flush = () => {
    if (lines.join('').trim()) sections.push({ path: [...path], text: lines.join('\n') })
    lines = []
  }
  for (const line of source.split('\n')) {
    const h = /^(#{1,3})\s+(.*)$/.exec(line)
    if (h) {
      flush()
      path = [...path.slice(0, h[1].length - 1), short(h[2], 60)]
      continue
    }
    lines.push(line)
  }
  flush()
  for (const s of sections) {
    const audience = audienceOf(s.path)
    if (!audience) continue
    const where = [name, ...s.path.filter((p) => p !== name)].join(' › ')
    pieces(s.text).forEach((piece, i) => add(audience, `${where}${i ? ' (pokr.)' : ''}: ${short(piece, 70)}`, `[${where}]\n${piece}`))
  }
}

/** A list of "path: text" lines in parts, each titled by the paths it holds. */
function addLines(audience, name, lines) {
  let part = []
  let size = 0
  const flush = () => {
    if (!part.length) return
    const keys = [...new Set(part.map((l) => l.split(':')[0].split('.').slice(0, 2).join('.')))]
    add(audience, `${name}: ${keys.join(', ')}`, `[${name}]\n${part.join('\n')}`)
    part = []
    size = 0
  }
  for (const line of lines) {
    if (size + line.length > MAX) flush()
    part.push(line)
    size += line.length + 1
  }
  flush()
}

/** The section of a curated guide that every answer for its audience carries. */
const section = (source, heading) => {
  const m = new RegExp(`^## ${heading}\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, 'm').exec(source)
  return m ? plain(m[1]).trim() : ''
}
const without = (source, headings) => headings.reduce((s, h) => s.replace(new RegExp(`^## ${h}\\n[\\s\\S]*?(?=^## |(?![\\s\\S]))`, 'm'), ''), source)

async function files(dir, test) {
  const out = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...(await files(p, test)))
    else if (test(p)) out.push(p)
  }
  return out.sort()
}

// ---------------------------------------------------------------------------------------------------------------
// The texts of the site and the app, run from their own modules.
const bundled = await build({ entryPoints: ['scripts/mony-texts.entry.ts'], bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'warning' })
const { monyTexts } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`)
const t = monyTexts()

// The guides written for Mony.
const klient = await readFile('docs/mony/klient.md', 'utf8')
const uctovnicka = await readFile('docs/mony/uctovnicka.md', 'utf8')
const spravca = await readFile('docs/mony/spravca.md', 'utf8')
const core = {
  client: [t.core, '## Orientácia v aplikácii', section(klient, 'Orientácia')].join('\n\n'),
  accountant: [t.core, '## Orientácia pre účtovníčku', section(uctovnicka, 'Orientácia'), '## Aplikácia klienta', section(klient, 'Orientácia')].join('\n\n'),
  admin: [t.core, '## Orientácia pre správcu', section(spravca, 'Orientácia'), section(spravca, 'Audit softvéru \\(27\\. 10\\. 2026\\)')].join('\n\n'),
}
addMarkdown('Návod pre klientov', without(klient, ['Orientácia']), () => ALL)
addMarkdown('Návod pre účtovníčky', without(uctovnicka, ['Orientácia']), () => TEAM)
addMarkdown('Podklady pre správcu', without(spravca, ['Orientácia', 'Audit softvéru \\(27\\. 10\\. 2026\\)']), () => ADMIN)

// What the site and the app say.
addMarkdown('Články na webe', t.site, () => ALL)
addMarkdown('Obchodné podmienky', t.terms.replace(/^(\d+)\. (.*)$/gm, '## $1. $2'), () => ALL)
addLines(ALL, 'Texty aplikácie klienta', t.appTexts)
addLines(ALL, 'Bezplatná fakturácia', t.invoicingTexts)
addLines(ALL, 'Texty webu', t.siteTexts)
addLines(TEAM, 'Texty časti pre tím', t.teamTexts)

// The working notes: the parts that describe how the product works are the team's, the rest the administrator's.
const TEAM_NOTES = /^(The client's app|What the client's app got|Everything in the app|The end of a contract|Invoices the client issues|Business trips|Cost centres|The cash box|The takings of an eKasa till|The bank without an aggregator|The bank by open banking|eKasa receipts|The order and the contract online|The power of attorney and the notice|The accountants' side|VAT: the return|The books|Every client's deadlines|The closing|Payroll|The law it leans on)/
addMarkdown('Pracovné poznámky', await readFile('CLAUDE.md', 'utf8'), (path) => (path[0]?.startsWith('Firmony: working notes') && path.slice(1).some((p) => TEAM_NOTES.test(p)) ? TEAM : ADMIN))
const TEAM_DOCS = new Set(['docs/client-delivery.md', 'docs/client-overview.md', 'docs/managed-takeover.md', 'docs/peppol.md', 'docs/invoicing.md', 'docs/autobook-consistency.md', 'docs/security/filing-evidence.md', 'docs/security/payroll-evidence.md', 'docs/security/payroll-generation.md', 'docs/security/health-reporting.md', 'docs/security/social-reporting.md'])
for (const file of await files('docs', (p) => p.endsWith('.md') && !p.startsWith('docs/mony/'))) {
  addMarkdown(file, await readFile(file, 'utf8'), () => (TEAM_DOCS.has(file) ? TEAM : ADMIN))
}

// A map of the code: each file with its opening comment and what it exports.
const code = await files('src', (p) => /\.tsx?$/.test(p) && !p.startsWith('src/generated/'))
const byDir = new Map()
for (const file of code) {
  const source = await readFile(file, 'utf8')
  const head = source.split('\n').slice(0, 60)
  let comment = []
  for (const line of head) {
    const c = /^\s*(?:\/\/|\/\*\*?|\*)\s?(.*?)(?:\*\/)?\s*$/.exec(line)
    if (c && !/^\s*\*\//.test(line)) comment.push(c[1])
    else if (comment.length) break
  }
  const exports = [...source.matchAll(/^export (?:async )?(?:function|const|class|interface|type) (\w+)/gm)].map((m) => m[1]).slice(0, 12)
  const about = short(comment.join(' '), 420)
  const dir = file.split('/').slice(0, -1).join('/')
  if (!byDir.has(dir)) byDir.set(dir, [])
  byDir.get(dir).push(`${file} (${source.split('\n').length} riadkov): ${about || 'bez úvodného komentára'}${exports.length ? ` Exportuje: ${exports.join(', ')}.` : ''}`)
}
for (const [dir, entries] of byDir) {
  let part = []
  let size = 0
  const flush = () => {
    if (!part.length) return
    add(ADMIN, `Mapa kódu ${dir}: ${part.map((e) => e.split(' ')[0].split('/').pop()).join(', ')}`, `[Mapa kódu ${dir}]\n${part.join('\n')}`)
    part = []
    size = 0
  }
  for (const entry of entries) {
    if (size + entry.length > MAX) flush()
    part.push(entry)
    size += entry.length + 1
  }
  flush()
}

// ---------------------------------------------------------------------------------------------------------------
// The pages a link in an answer may lead to: every GET route of the app, the team side and the site, as patterns.
const MOUNTS = {
  'src/index.tsx': { app: '' },
  'src/app/routes.tsx': { appRoutes: '/app' },
  'src/team/routes.tsx': { teamRoutes: '/ucto' },
  'src/security/routes.tsx': { securityRoutes: '/auth' },
  'src/incidents/routes.tsx': { incidentRoutes: '/ucto/incidenty' },
  'src/filings/routes.tsx': { filingQueueRoutes: '/ucto/podania', routes: ['/ucto/klienti/:id/podania', '/app/podania'] },
  'src/payroll-reporting/routes.tsx': { routes: ['/ucto/klienti/:id/mzdove-podania', '/app/mzdove-podania'] },
  'src/aml/routes.tsx': { app: '/ucto' },
  'src/aml/archive.tsx': { app: '/ucto' },
  'src/team/workspaces.tsx': { routes: '/ucto' },
}
const NOT_A_PAGE = /\.(xml|csv|json|zip|pdf|txt|webmanifest|png|ico|js|css)$|\/(subor|subory|xml|pdf|vstup|ukazka|prvy-spravca|pripojit|navrat|rychle-prihlasenie|potvrdit|export|odhlasit|logo|healthz|playground)(\/|$)|\*/
const routes = new Set([...t.pages, ...t.guides])
for (const [file, vars] of Object.entries(MOUNTS)) {
  const source = await readFile(file, 'utf8')
  let current = Object.keys(vars)[0]
  for (const m of source.matchAll(/(?:\b(\w+)\s*)?\.get\(\s*['"`](\/[^'"`]*)['"`]/g)) {
    if (m[1] && m[1] in vars) current = m[1]
    else if (m[1]) continue
    for (const prefix of [vars[current]].flat()) {
      const full = `${prefix}${m[2] === '/' && prefix ? '' : m[2]}`.replace(/:\w+/g, ':id') || '/'
      if (!NOT_A_PAGE.test(full)) routes.add(full)
    }
  }
}

await mkdir('src/generated', { recursive: true })
const header = '// Generated by scripts/build-knowledge.mjs on every build. Do not edit.\n'
await writeFile(
  'src/generated/knowledge.ts',
  `${header}export const MONY_CORE: Readonly<Record<'client' | 'accountant' | 'admin', string>> = ${JSON.stringify(core)}\n` +
    `/** [id, audience (1 client, 2 accountant, 4 administrator), title, text] */\n` +
    `export const MONY_CHUNKS: readonly (readonly [string, number, string, string])[] = ${JSON.stringify(chunks)}\n`,
)
await writeFile('src/generated/mony-routes.ts', `${header}export const MONY_ROUTES: readonly string[] = ${JSON.stringify([...routes].sort())}\n`)
const size = (mask) => chunks.filter((c) => c[1] & mask).reduce((n, c) => n + c[3].length, 0)
console.log(`mony: ${chunks.length} sections (client ${Math.round(size(CLIENT) / 1000)} kB, accountant ${Math.round(size(ACCOUNTANT) / 1000)} kB, admin ${Math.round(size(ADMIN) / 1000)} kB), ${routes.size} pages`)
void relative
