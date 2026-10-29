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
  { path: '/zacat/hotovo?zmluva=1', file: 'hotovo.html' },
  { path: '/pravne-informacie', file: 'pravne-informacie.html' },
  { path: '/podmienky', file: 'podmienky.html' },
  { path: '/investori', file: 'investori.html' },
  { path: '/investori/hotovo', file: 'investori-hotovo.html' },
]

// The contract online: a request for an s. r. o. the pretend register knows (europio, with its director) becomes an
// order in the playground, and its page, reached by the link in the email, is copied as it stands.
{
  const body = new URLSearchParams({ ico: '57442452', mode: 'company', plan: 'rast', situation: 'switch', name: 'Christian Juhás', email: `nahlad-${Date.now()}@firmony.test`, phone: '', note: '' }).toString()
  const sent = await fetch(`${base}/zacat`, { method: 'POST', body, redirect: 'manual', headers: { origin: base, 'content-type': 'application/x-www-form-urlencoded', 'content-length': String(Buffer.byteLength(body)) } })
  if (sent.status !== 303) throw new Error(`/zacat: ${sent.status}`)
  const mails = await (await fetch(`${base}/playground/mail`)).json()
  const link = JSON.stringify(mails).match(/\/objednavka\/[A-Za-z0-9_-]{43}/g)?.pop()
  if (!link) throw new Error('no order link in the playground mail')
  PAGES.push({ path: link, file: 'zmluva.html' })
}

/** Where an address of the live site leads in the copy, seen from the page `from`. */
function local(href, from) {
  const [pathAndQuery, hash] = href.split('#')
  const [path, query] = pathAndQuery.split('?')
  const anchor = hash ? `#${hash}` : ''
  if (path === '' || path === '/') return from === 'index.html' ? anchor || 'index.html' : `index.html${anchor}`
  if (path === '/zacat') return (query ?? '').includes('nova=1') ? `nova-firma.html${anchor}` : `zacat.html${anchor}`
  if (path === '/pravne-informacie') return `pravne-informacie.html${anchor}`
  if (path === '/podmienky') return `podmienky.html${anchor}`
  if (path === '/zacat/hotovo') return `hotovo.html${anchor}`
  if (path === '/investori') return `investori.html${anchor}`
  if (path === '/investori/hotovo') return `investori-hotovo.html${anchor}`
  if (path.startsWith('/objednavka/')) return `zmluva.html${anchor}`
  if (path === '/app/prihlasenie') return 'https://claude.ai/artifact/RiaH2Z4AzYHCM2EQw7EPhc'
  if (path.startsWith('/art/') || path.startsWith('/fonts/')) return path.slice(1)
  return href
}

function rewrite(html, from) {
  return html
    .replace(/(href|src|action)="(\/[^"]*)"/g, (_, attr, href) => `${attr}="${local(href, from)}"`)
    .replace(/srcset="([^"]*)"/g, (_, set) => `srcset="${set.replace(/(^|,\s*)\/(art\/)/g, '$1$2')}"`)
}

const SAYS = {
  ico: 'Toto je náhľad: IČO sa tu nevyhľadáva. Na živom webe sa z registra načíta názov a sídlo firmy a pokračuje sa vyplnením údajov; s. r. o. potom príde e-mailom odkaz na zmluvu online.',
  calc__form: 'Toto je náhľad: kalkulačka tu nepočíta. Na živom webe hneď ukáže porovnanie s Vašimi číslami.',
  details: 'Toto je náhľad: nič sa neodosiela. Na živom webe príde e-mail: firme, ktorú register pozná ako s. r. o., odkaz na zmluvu online, inak potvrdenie, a ozveme sa do jedného pracovného dňa.',
  order: 'Toto je náhľad: zmluva sa tu neuzatvára. Na živom webe ju konateľ uzavrie týmto tlačidlom, príde mu e-mail s podmienkami a hneď sa otvorí aplikácia.',
  invest: 'Toto je náhľad: nič sa neodosiela. Na živom webe Vás zapíšeme, príde potvrdenie e-mailom a po skončení roka správa, že môžete začať.',
}

const SCRIPT = `<script>
document.documentElement.lang = 'sk';
document.addEventListener('submit', function (event) {
  event.preventDefault();
  var form = event.target, says = ${JSON.stringify(SAYS)}, text = says.details;
  var invest = form.getAttribute('action') === 'investori.html';
  for (var name in says) if (form.classList.contains(name)) text = says[name];
  if (invest) text = says.invest;
  var note = form.querySelector('.preview-note');
  if (!note) { note = document.createElement('p'); note.className = 'preview-note'; note.setAttribute('role', 'status'); form.appendChild(note); }
  note.textContent = text;
  if (invest) {
    var thanks = document.createElement('a');
    thanks.href = 'investori-hotovo.html';
    thanks.textContent = ' Pozrieť, čo príde po zápise.';
    note.appendChild(thanks);
  } else if (form.classList.contains('ico')) {
    var more = document.createElement('a');
    more.href = 'zmluva.html';
    more.textContent = ' Pozrieť, ako vyzerá zmluva online.';
    note.appendChild(more);
  }
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
  let body = rewrite(bodyHtml, page.file)
  // The thanks after a request leads, in the copy, to the contract the email would carry.
  if (page.file === 'hotovo.html') body = body.replace(/(<p class="lead">[\s\S]*?<\/p>)/, '$1<p class="page__text"><a class="link" href="zmluva.html">V náhľade: takto vyzerá zmluva online, na ktorú vedie odkaz v e-maile.</a></p>')
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
