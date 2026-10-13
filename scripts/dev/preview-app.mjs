// A static copy of the client's app for looking at it in a browser elsewhere (published as an artifact for the
// owner). Signs in to the sample company of the running playground, writes every page of it, then does in the
// playground what a client does (a receipt for the café payment, "no document needed" for the fuel, a receipt
// for the office supplies) and writes the pages that follow, so that the copy can be clicked through:
//
//   rm -rf .wrangler/playground-d1 .wrangler/playground-r2       (a fresh sample company)
//   node --no-warnings scripts/playground.mjs                    (in another shell)
//   node scripts/dev/preview-app.mjs <folder> <photo.jpg>
//
// The folder's index.html is the overview written as an artifact's page (a <title> and a <style> at its top, no
// document around it); the other pages are whole documents. Nothing is sent anywhere from the copy: a form says
// under itself what the live app does instead.
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { execFileSync } from 'node:child_process'

const out = process.argv[2]
const photo = process.argv[3]
const base = process.argv[4] ?? 'http://127.0.0.1:8787'
if (!out || !photo) throw new Error('usage: node scripts/dev/preview-app.mjs <folder> <photo.jpg> [base]')
const root = new URL('../..', import.meta.url).pathname

// Signed in to the sample company, as a browser would be.
let cookie = ''
async function call(path, init = {}) {
  const res = await fetch(base + path, { redirect: 'manual', ...init, headers: { origin: base, ...(init.headers ?? {}), cookie } })
  const set = res.headers.get('set-cookie')
  if (set) cookie = set.split(';')[0]
  return res
}
await call('/app/ukazka')
if (!cookie) throw new Error('not signed in: is the playground running with DEMO=1?')

const html = async (path) => {
  const res = await call(path)
  if (res.status !== 200) throw new Error(`${path}: ${res.status}`)
  return res.text()
}

/** Every payment and document of the sample company, with the file each becomes. */
const files = new Map([
  ['/app', 'index.html'],
  ['/app/platby', 'platby.html'],
  ['/app/platby?filter=hotove', 'platby-hotove.html'],
  ['/app/platby?filter=vsetky', 'platby-vsetky.html'],
  ['/app/doklady', 'doklady.html'],
  ['/app/doklady?filter=bez-platby', 'doklady-bez-platby.html'],
  ['/app/spravy', 'spravy.html'],
  ['/app/prihlasenie', 'prihlasenie.html'],
  ['/app/prihlasenie/poslane', 'prihlasenie-poslane.html'],
])
const all = await html('/app/platby?filter=vsetky')
const payments = [...all.matchAll(/href="(\/app\/platby\/[0-9a-f-]{36})"[\s\S]*?row__title">([^<]+)</g)].map((m) => ({ path: m[1], name: m[2] }))
payments.forEach((p, i) => files.set(p.path, `platba-${i + 1}.html`))
const docsPage = await html('/app/doklady')
const docs = [...new Set([...docsPage.matchAll(/href="(\/app\/doklady\/[A-Za-z0-9-]+)"/g)].map((m) => m[1]))]
docs.forEach((path, i) => files.set(path, `doklad-${i + 1}.html`))

const find = (name) => payments.find((p) => p.name.toLowerCase().includes(name))
const cafe = find('kaviaren')
const fuel = find('cerpacia')
const office = find('kancelarske')
if (!cafe || !fuel || !office) throw new Error('the sample company is not fresh: remove .wrangler/playground-d1 and -r2 and start again')

/** Where an address of the app leads in the copy. */
function local(href, extra) {
  const [pathAndQuery, hash] = href.split('#')
  const anchor = hash ? `#${hash}` : ''
  const file = extra.get(pathAndQuery) ?? files.get(pathAndQuery) ?? files.get(pathAndQuery.split('?')[0])
  if (file) return file + anchor
  if (pathAndQuery.startsWith('/art/') || pathAndQuery.startsWith('/fonts/')) return pathAndQuery.slice(1)
  if (pathAndQuery === '/' || pathAndQuery === '/zacat') return 'https://claude.ai/artifact/VduagLaZtybJ7nDi66ZW3U'
  return '#'
}

const css = [await readFile(join(root, 'public/app.css'), 'utf8'), await readFile(join(root, 'public/inside.css'), 'utf8')].join('\n').replace(/url\(\/(fonts|art)\//g, 'url($1/')
const assets = new Set()
for (const m of css.matchAll(/url\(((?:fonts|art)\/[^)'"\s]+)\)/g)) assets.add(m[1])

const EXTRA_CSS = `
.preview-note { flex-basis: 100%; margin: 12px 0 0; color: var(--soft); font-size: 0.9375rem; line-height: 1.5; }
.preview-bar { position: fixed; right: 16px; bottom: 16px; z-index: 60; display: flex; flex-wrap: wrap; align-items: center; gap: 6px 12px; max-width: calc(100% - 32px); padding: 10px 14px; border: 1px solid var(--line); border-radius: 14px; background: rgb(255 255 255 / 0.94); box-shadow: var(--shadow); color: var(--soft); font-size: 0.8125rem; }
.preview-bar a { color: var(--blue); font-weight: 600; }
@media (max-width: 900px) { .preview-bar { bottom: calc(var(--tabs-h) + 12px + env(safe-area-inset-bottom, 0px)); } }
`

/** What a form does on the live app, said under it in the copy; some forms lead to the page that follows. */
function script(leads) {
  return `<script>
(function () {
  document.documentElement.classList.add('js');
  var leads = ${JSON.stringify(leads)};
  var says = {
    upload: 'Toto je náhľad: nič sa neposiela. V aplikácii sa doklad hneď nahrá, prečíta a priradí k platbe.',
    banka: 'Toto je náhľad. V aplikácii sa z výpisu doplnia platby a sami sa spárujú s dokladmi.',
    message: 'Toto je náhľad: správa sa neposiela. V aplikácii príde účtovníčke a odpovie do jedného pracovného dňa.',
    other: 'Toto je náhľad: nič sa neukladá. V aplikácii sa to hneď uloží.',
    book: 'Toto je náhľad: nič sa neukladá. V aplikácii sa doklad zaúčtuje a hneď sa otvorí ďalší.',
    export: 'Toto je náhľad. V aplikácii sa stiahne súbor CSV pre účtovný program.',
    team: 'Toto je náhľad: nič sa neukladá ani neposiela. V aplikácii sa to hneď vykoná.'
  };
  function note(form, text) {
    var p = form.querySelector('.preview-note');
    if (!p) { p = document.createElement('p'); p.className = 'preview-note'; p.setAttribute('role', 'status'); form.appendChild(p); }
    p.textContent = text;
  }
  function kind(form) {
    var a = form.getAttribute('data-action') || '';
    if (/^\\/ucto\\/doklady\\//.test(a)) return 'book';
    if (/\\/export$/.test(a)) return 'export';
    if (/^\\/ucto\\//.test(a)) return 'team';
    if (/\\/banka$/.test(a)) return 'banka';
    if (form.querySelector('input[type=file]')) return 'upload';
    if (/\\/spravy$/.test(a)) return 'message';
    return 'other';
  }
  document.addEventListener('change', function (event) {
    var input = event.target;
    if (!input.matches || !input.matches('input[type=file]')) return;
    var form = input.form, lead = leads[form.getAttribute('data-action')];
    if (lead) location.href = lead; else note(form, says[kind(form)]);
  });
  document.addEventListener('submit', function (event) {
    event.preventDefault();
    var form = event.target, lead = leads[form.getAttribute('data-action') + (form.dovod ? '' : '')];
    if (lead) { location.href = lead; return; }
    note(form, says[kind(form)]);
  });
  document.querySelectorAll('[data-pick]').forEach(function (link) {
    link.addEventListener('click', function (event) {
      var input = document.querySelector('.add input[type=file]') || document.getElementById('pick-file');
      if (!input) return;
      event.preventDefault();
      input.click();
    });
  });
  document.querySelectorAll('[data-copy]').forEach(function (button) {
    button.hidden = false;
    button.addEventListener('click', function () {
      var label = button.textContent;
      var done = function () { button.textContent = button.getAttribute('data-done'); setTimeout(function () { button.textContent = label; }, 2000); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(button.getAttribute('data-copy')).then(done, function () {});
    });
  });
})();
</script>`
}

const BAR = `<div class="preview-bar" role="note"><span>Náhľad s ukážkovými údajmi.</span><a href="index.html">Klient</a><a href="ucto.html">Účtovníčka</a><a href="vsetko-mame.html">Keď nič nechýba</a></div>`

function rewrite(page, extra) {
  return page
    .replace(/<script src="\/inside\.js" defer><\/script>/, '')
    .replace(/<iframe class="book__pdf" src="([^"]+)"[^>]*><\/iframe>/g, '<div class="book__img book__img--preview"><img src="$1" alt=""></div>')
    .replace(/<form([^>]*?) action="([^"]*)"/g, (_, attrs, action) => `<form${attrs} data-action="${action}" action="#"`)
    .replace(/(href|src)="(\/[^"]*)"/g, (_, attr, href) => `${attr}="${local(href.replace(/&amp;/g, '&'), extra)}"`)
    .replace(/srcset="([^"]*)"/g, (_, set) => `srcset="${set.replace(/(^|,\s*)\/(art\/)/g, '$1$2')}"`)
}

async function write(file, page, leads = {}, extra = new Map()) {
  const title = page.match(/<title>([^<]*)<\/title>/)?.[1] ?? 'Firmony'
  const [, bodyAttrs, bodyHtml] = page.match(/<body([^>]*)>([\s\S]*)<\/body>/)
  const body = rewrite(bodyHtml, extra)
  for (const m of body.matchAll(/(?:src|href)="((?:art|fonts)\/[^"]+)"/g)) assets.add(m[1])
  for (const m of body.matchAll(/srcset="([^"]*)"/g)) for (const part of m[1].split(',')) assets.add(part.trim().split(/\s+/)[0])
  const style = `<style>\n${css}\n${EXTRA_CSS}</style>`
  const bodyClass = bodyAttrs.match(/class="([^"]*)"/)?.[1] ?? ''
  const text =
    file === 'index.html'
      ? `<title>Firmony aplikácia</title>\n${style}\n<script>document.body.className = ${JSON.stringify(bodyClass)}</script>\n${body}\n${BAR}\n${script(leads)}\n`
      : `<!doctype html>\n<html lang="sk">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n<title>${title}</title>\n${style}\n</head>\n<body${bodyAttrs}>\n${body}\n${bodyClass.includes('door') ? '' : BAR}\n${script(leads)}\n</body>\n</html>\n`
  await writeFile(join(out, file), text)
}

await mkdir(out, { recursive: true })

// What the forms of the first state lead to: the pages written after the client did it in the playground.
const leads = {
  [`${cafe.path}/doklad`]: 'platba-kava-hotovo.html',
  [`${office.path}/doklad`]: 'platba-potreby-hotovo.html',
  [`${fuel.path}/bez-dokladu`]: 'platba-tankovanie-netreba.html',
  '/app/prihlasenie': 'prihlasenie-poslane.html',
}

// The first state: three payments without a document.
for (const [path, file] of files) {
  if (path.startsWith('/app/prihlasenie')) continue
  await write(file, await html(path), leads)
}

// Then what a client does, and the pages that follow.
async function upload(paymentPath) {
  const form = new FormData()
  form.append('file', new Blob([await readFile(photo)], { type: 'image/jpeg' }), 'blocek.jpg')
  const res = await call(`${paymentPath}/doklad`, { method: 'POST', body: form })
  if (res.status !== 303) throw new Error(`upload to ${paymentPath}: ${res.status}`)
  await new Promise((resolve) => setTimeout(resolve, 1500))
}
await upload(cafe.path)
await write('platba-kava-hotovo.html', await html(`${cafe.path}?ok=priradene`))
const body = new URLSearchParams({ dovod: 'other', poznamka: 'Tankovanie služobného auta, bloček sa stratil' })
const res = await call(`${fuel.path}/bez-dokladu`, { method: 'POST', body, headers: { 'content-type': 'application/x-www-form-urlencoded' } })
if (res.status !== 303) throw new Error(`no document: ${res.status}`)
await write('platba-tankovanie-netreba.html', await html(`${fuel.path}?ok=netreba`))

// The accountants' side, signed in as the sample administrator, as the client left things: the café receipt waits
// to be booked with its photo, and the fuel waits to be checked.
const clientCookie = cookie
cookie = ''
await call('/ucto/ukazka')
const teamFiles = new Map([
  ['/ucto', 'ucto.html'],
  ['/ucto/doklady', 'ucto-doklady.html'],
  ['/ucto/spravy', 'ucto-spravy.html'],
  ['/ucto/ziadosti', 'ucto-ziadosti.html'],
  ['/ucto/tim', 'ucto-tim.html'],
  ['/ucto/klienti/novy', 'ucto-novy-klient.html'],
  ['/ucto/klienti/novy?ziadost=demo-req-1', 'ucto-novy-klient-1.html'],
  ['/ucto/klienti/novy?ziadost=demo-req-2', 'ucto-novy-klient-2.html'],
  ['/ucto/klienti/demo-company', 'ucto-klient-1.html'],
  ['/ucto/klienti/demo-company-2', 'ucto-klient-2.html'],
  ['/ucto/doklady/demo-doc-3', 'ucto-doklad-zauctovany.html'],
])
const queuePage = await html('/ucto/doklady')
;[...new Set([...queuePage.matchAll(/href="(\/ucto\/doklady\/[A-Za-z0-9-]+)"/g)].map((m) => m[1]))].forEach((path, i) => teamFiles.set(path, `ucto-doklad-${i + 1}.html`))
for (const [path, file] of teamFiles) files.set(path, file)
// The originals: a photo as it is, a PDF as a picture of its page.
const originals = []
for (const [path] of teamFiles) {
  if (!path.startsWith('/ucto/doklady/')) continue
  const page = await html(path)
  for (const m of page.matchAll(/(?:src|href)="\/ucto\/subory\/([A-Za-z0-9-]+)"/g)) {
    if (files.has(`/ucto/subory/${m[1]}`)) continue
    const res = await call(`/ucto/subory/${m[1]}`)
    const bytes = Buffer.from(await res.arrayBuffer())
    await mkdir(join(out, 'subory'), { recursive: true })
    if ((res.headers.get('content-type') ?? '').includes('pdf')) {
      await writeFile(join(out, 'subory', `${m[1]}.pdf`), bytes)
      execFileSync('pdftoppm', ['-png', '-r', '144', '-singlefile', join(out, 'subory', `${m[1]}.pdf`), join(out, 'subory', m[1])])
      files.set(`/ucto/subory/${m[1]}`, `subory/${m[1]}.png`)
    } else {
      await writeFile(join(out, 'subory', `${m[1]}.jpg`), bytes)
      files.set(`/ucto/subory/${m[1]}`, `subory/${m[1]}.jpg`)
    }
    originals.push(files.get(`/ucto/subory/${m[1]}`))
  }
}
for (const [path, file] of teamFiles) await write(file, await html(path))
cookie = clientCookie
// A second photo for the office supplies: a different file, so that it is not taken for the first one again.
const second = Buffer.concat([await readFile(photo), Buffer.from([0])])
{
  const form = new FormData()
  form.append('file', new Blob([second], { type: 'image/jpeg' }), 'potreby.jpg')
  const up = await call(`${office.path}/doklad`, { method: 'POST', body: form })
  if (up.status !== 303) throw new Error(`upload to ${office.path}: ${up.status}`)
  await new Promise((resolve) => setTimeout(resolve, 1500))
}
await write('platba-potreby-hotovo.html', await html(`${office.path}?ok=priradene`))
await write('vsetko-mame.html', await html('/app'))

// Signing in, last: signing out ends the session.
await call('/app/odhlasit', { method: 'POST', headers: { 'content-length': '0' } })
cookie = ''
await write('prihlasenie.html', await html('/app/prihlasenie'), leads)
await write('prihlasenie-poslane.html', await html('/app/prihlasenie/poslane'))

for (const asset of assets) {
  if (!/^(art|fonts)\//.test(asset)) continue
  await mkdir(dirname(join(out, asset)), { recursive: true })
  await copyFile(join(root, 'public', asset), join(out, asset))
}
const written = [...new Set([...files.values()].filter((f) => f.endsWith('.html'))), 'platba-kava-hotovo.html', 'platba-tankovanie-netreba.html', 'platba-potreby-hotovo.html', 'vsetko-mame.html', ...originals]
console.log(JSON.stringify(Object.fromEntries([...written.filter((f) => f !== 'index.html').map((f) => [f, join(out, f)]), ...[...assets].sort().map((a) => [a, join(out, a)])])))
