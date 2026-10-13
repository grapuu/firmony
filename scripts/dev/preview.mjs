// A static copy of the site for looking at it in a browser elsewhere (published as an artifact for the owner).
// Takes the pages from the running playground, makes every address relative, inlines the stylesheet and writes
// the pages with the pictures and fonts they use into one folder:
//
//   node scripts/dev/preview.mjs <folder> [base]        base: http://127.0.0.1:8787 by default
//
// The folder's index.html is the home page written as an artifact's page (a <title> and a <style> at its top,
// no document around it); the other pages are whole documents. Forms do not go anywhere: a few lines of script
// stop them and say under the form what the live site does instead.
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

const out = process.argv[2]
const base = process.argv[3] ?? 'http://127.0.0.1:8787'
if (!out) throw new Error('usage: node scripts/dev/preview.mjs <folder> [base]')
const root = new URL('../..', import.meta.url).pathname

/** The pages of the copy: the address in the playground, the file it becomes, and its title in the copy. */
const PAGES = [
  { path: '/', file: 'index.html' },
  { path: '/zacat', file: 'zacat.html' },
  { path: '/zacat?nova=1', file: 'nova-firma.html' },
  { path: '/pravne-informacie', file: 'pravne-informacie.html' },
]

/** Where an address of the live site leads in the copy, seen from the page `from`. */
function local(href, from) {
  const [pathAndQuery, hash] = href.split('#')
  const [path, query] = pathAndQuery.split('?')
  const anchor = hash ? `#${hash}` : ''
  if (path === '' || path === '/') return from === 'index.html' ? anchor || 'index.html' : `index.html${anchor}`
  if (path === '/zacat') return (query ?? '').includes('nova=1') ? `nova-firma.html${anchor}` : `zacat.html${anchor}`
  if (path === '/pravne-informacie') return `pravne-informacie.html${anchor}`
  if (path.startsWith('/art/') || path.startsWith('/fonts/')) return path.slice(1)
  return href
}

function rewrite(html, from) {
  return html
    .replace(/(href|src|action)="(\/[^"]*)"/g, (_, attr, href) => `${attr}="${local(href, from)}"`)
    .replace(/srcset="([^"]*)"/g, (_, set) => `srcset="${set.replace(/(^|,\s*)\/(art\/)/g, '$1$2')}"`)
}

const SAYS = {
  ico: 'Toto je náhľad: IČO sa tu nevyhľadáva. Na živom webe sa načíta názov a sídlo firmy z registra a pokračuje sa na údaje.',
  calc__form: 'Toto je náhľad: kalkulačka tu nepočíta. Na živom webe hneď ukáže porovnanie s vašimi číslami.',
  details: 'Toto je náhľad: nič sa neodosiela. Na živom webe príde potvrdenie e-mailom a ozveme sa do jedného pracovného dňa.',
}

const SCRIPT = `<script>
document.documentElement.lang = 'sk';
document.addEventListener('submit', function (event) {
  event.preventDefault();
  var form = event.target, says = ${JSON.stringify(SAYS)}, text = says.details;
  for (var name in says) if (form.classList.contains(name)) text = says[name];
  var note = form.querySelector('.preview-note');
  if (!note) { note = document.createElement('p'); note.className = 'preview-note'; note.setAttribute('role', 'status'); form.appendChild(note); }
  note.textContent = text;
});
</script>`

/** What the artifact's frame needs on top of the site's own stylesheet. */
const EXTRA = `
.top { top: env(safe-area-inset-top, 0px); }
.preview-note { flex-basis: 100%; margin: 14px 0 0; color: var(--soft); font-size: 0.9375rem; line-height: 1.5; }
`

const css = (await readFile(join(root, 'public/app.css'), 'utf8')).replace(/url\(\/(fonts|art)\//g, 'url($1/')
const assets = new Set()
for (const m of css.matchAll(/url\(((?:fonts|art)\/[^)'"\s]+)\)/g)) assets.add(m[1])

await mkdir(out, { recursive: true })
for (const page of PAGES) {
  const answer = await fetch(base + page.path)
  if (!answer.ok) throw new Error(`${page.path}: ${answer.status}`)
  const html = await answer.text()
  const title = html.match(/<title>([^<]*)<\/title>/)?.[1] ?? 'Firmony'
  const [, bodyAttrs, bodyHtml] = html.match(/<body([^>]*)>([\s\S]*)<\/body>/)
  const bodyClass = bodyAttrs.match(/class="([^"]*)"/)?.[1] ?? ''
  const body = rewrite(bodyHtml, page.file)
  for (const m of body.matchAll(/(?:src|href)="((?:art|fonts)\/[^"]+)"/g)) assets.add(m[1])
  for (const m of body.matchAll(/srcset="([^"]*)"/g)) for (const part of m[1].split(',')) assets.add(part.trim().split(/\s+/)[0])
  const style = `<style>\n${css}\n${EXTRA}</style>`
  const text =
    page.file === 'index.html'
      ? `<title>Firmony</title>\n${style}\n<script>document.body.className = ${JSON.stringify(bodyClass)}</script>\n${body}\n${SCRIPT}\n`
      : `<!doctype html>\n<html lang="sk">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n<title>${title}</title>\n${style}\n</head>\n<body${bodyAttrs}>\n${body}\n${SCRIPT}\n</body>\n</html>\n`
  await writeFile(join(out, page.file), text)
}
for (const asset of assets) {
  if (!/^(art|fonts)\//.test(asset)) continue
  await mkdir(dirname(join(out, asset)), { recursive: true })
  await copyFile(join(root, 'public', asset), join(out, asset))
}
console.log(JSON.stringify(Object.fromEntries([...PAGES.filter((p) => p.file !== 'index.html').map((p) => [p.file, join(out, p.file)]), ...[...assets].sort().map((a) => [a, join(out, a)])])))
