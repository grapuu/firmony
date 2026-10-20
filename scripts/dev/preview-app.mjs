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
  ['/app/firma', 'firma.html'],
  ['/app/banka', 'banka.html'],
  ['/app/plna-moc', 'plna-moc.html'],
  ['/app/prechod', 'prechod.html'],
  ['/app/vyhlasenie', 'vyhlasenie.html'],
  ['/app/vyhlasenie?zmenit=1', 'vyhlasenie-zmenit.html'],
  ['/app/zmluva', 'zmluva.html'],
  ['/app/dane', 'dane.html'],
  ['/app/faktury', 'faktury.html'],
  ['/app/faktury/nova', 'faktura-nova.html'],
  ['/app/faktury/demo-inv-1', 'faktura-1.html'],
  ['/app/faktury/demo-inv-2', 'faktura-2.html'],
  ['/app/faktury/demo-inv-3', 'faktura-3.html'],
  ['/app/faktury/nova?podla=demo-inv-1', 'faktura-podobna-1.html'],
  ['/app/faktury/nova?podla=demo-inv-2', 'faktura-podobna-2.html'],
  ['/app/prihlasenie', 'prihlasenie.html'],
  ['/app/prihlasenie/poslane', 'prihlasenie-poslane.html'],
])
// The steps for every bank of the list (the sample company's bank sends its statements by itself).
for (const id of ['slsp', 'tatra', 'vub', 'csob', 'fio', '365', 'mbank', 'unicredit', 'prima', 'revolut', 'wise', 'ina']) files.set(`/app/banka?banka=${id}`, `banka-${id}.html`)
const all = await html('/app/platby?filter=vsetky')
const payments = [...all.matchAll(/href="(\/app\/platby\/[0-9a-f-]{36})"[\s\S]*?row__title">([^<]+)</g)].map((m) => ({ path: m[1], name: m[2] }))
payments.forEach((p, i) => files.set(p.path, `platba-${i + 1}.html`))
const docsPage = await html('/app/doklady')
const docs = [...new Set([...docsPage.matchAll(/href="(\/app\/doklady\/[A-Za-z0-9-]+)"/g)].map((m) => m[1]))]
docs.forEach((path, i) => files.set(path, `doklad-${i + 1}.html`))

// A new invoice offers the customers of earlier ones; each leads to the form with that customer.
const newInvoice = await html('/app/faktury/nova')
;[...new Set([...newInvoice.matchAll(/href="(\/app\/faktury\/nova\?odberatel=[A-Za-z0-9-]+)"/g)].map((m) => m[1]))].forEach((path, i) => files.set(path, `faktura-nova-${i + 1}.html`))
// The page a customer opens from the email, and the e-invoices to download.
const tokens = { 'demo-inv-1': 'demodemoinv1'.padEnd(43, 'x'), 'demo-inv-2': 'demodemoinv2'.padEnd(43, 'x') }
files.set(`/f/${tokens['demo-inv-2']}`, 'faktura-odberatel.html')
files.set(`/f/${tokens['demo-inv-1']}`, 'faktura-odberatel-zaplatena.html')
const xmls = [
  ['/app/faktury/demo-inv-1/xml', 'faktura-20260006.xml'],
  ['/app/faktury/demo-inv-2/xml', 'faktura-20260007.xml'],
]
for (const [path, file] of xmls) files.set(path, file)
files.set(`/f/${tokens['demo-inv-2']}/xml`, 'faktura-20260007.xml')
files.set(`/f/${tokens['demo-inv-1']}/xml`, 'faktura-20260006.xml')

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
    banka: 'Toto je náhľad. V aplikácii sa z výpisu doplnia platby a samy sa spárujú s dokladmi.',
    message: 'Toto je náhľad: správa sa neposiela. V aplikácii príde účtovníčke, ktorá odpovie do jedného pracovného dňa.',
    other: 'Toto je náhľad: nič sa neukladá. V aplikácii sa to hneď uloží.',
    book: 'Toto je náhľad: nič sa neukladá. V aplikácii sa doklad zaúčtuje a hneď sa otvorí ďalší.',
    export: 'Toto je náhľad. V aplikácii sa stiahne súbor CSV pre účtovný program.',
    invoice: 'Toto je náhľad: nič sa neukladá. V aplikácii faktúra dostane číslo, odberateľ ju dostane e-mailom s QR kódom na platbu a keď ju zaplatí, sama sa označí ako zaplatená.',
    invoiceMail: 'Toto je náhľad: nič sa neposiela. V aplikácii odberateľ dostane e-mail s odkazom na faktúru.',
    bank: 'Toto je náhľad. V aplikácii sa to hneď vykoná: platby sa načítajú z banky alebo sa banka či účet odpojí.',
    setup: 'Toto je náhľad: nič sa neukladá. V aplikácii stránka odteraz čaká na prvý výpis z tejto banky a povie Vám, keď príde.',
    account: 'Toto je náhľad: nič sa neukladá. V aplikácii sa podľa Vašej odpovede výpis zaúčtuje, alebo sa nezaúčtuje nič z neho.',
    team: 'Toto je náhľad: nič sa neukladá ani neposiela. V aplikácii sa to hneď vykoná.',
    vat: 'Toto je náhľad: nič sa nesťahuje. V aplikácii sa stiahne súbor XML, ktorý účtovníčka načíta v eDane, skontroluje a podpíše.',
    books: 'Toto je náhľad: nič sa neukladá. V aplikácii sa to hneď zapíše do knihy a predvaha, denník aj saldokonto sa prepočítajú.',
    range: 'Toto je náhľad s jedným obdobím. V aplikácii sa ukáže vybraný rok a mesiac.',
    poa: 'Toto je náhľad: nič sa neposiela. V aplikácii sa podpísaná plná moc nahrá a účtovníčka ju overí a podá na úrady.',
    decl: 'Toto je náhľad: nič sa neposiela. V aplikácii sa údaje uložia a účtovníčka ich porovná s obchodným registrom a s plnou mocou.',
    notice: 'Toto je náhľad: nič sa nevypovedá. V aplikácii sa výpoveď uloží, objaví sa v správach a do konca lehoty ju môžete vziať späť.',
    prechod: 'Toto je náhľad. V aplikácii sa to, čo napíšete, hneď doplní do listu.',
    download: 'Toto je náhľad: nič sa nesťahuje. V aplikácii sa stiahne súbor ZIP: originály dokladov, prehľady pre Excel, faktúry ako e-faktúry, správy a zmluva.'
  };
  function note(form, text) {
    var p = form.querySelector('.preview-note');
    if (!p) { p = document.createElement('p'); p.className = 'preview-note'; p.setAttribute('role', 'status'); form.appendChild(p); }
    p.textContent = text;
  }
  function kind(form) {
    var a = form.getAttribute('data-action') || '';
    if (a === '/app/plna-moc') return 'poa';
    if (a === '/app/prechod') return 'prechod';
    if (a === '/app/vyhlasenie') return 'decl';
    if (/^\\/app\\/firma\\/vypoved/.test(a)) return 'notice';
    if (/^\\/app\\/banka\\/.+\\/(nacitat|odpojit|odobrat)$/.test(a)) return 'bank';
    if (a === '/app/banka/nastavene') return 'setup';
    if (/^\\/app\\/vypisy\\//.test(a)) return 'account';
    if (/^\\/app\\/faktury\\/[^/]+\\/(poslat|pripomenut)$/.test(a)) return 'invoiceMail';
    if (/^\\/app\\/faktury/.test(a)) return 'invoice';
    if (/^\\/ucto\\/doklady\\//.test(a)) return 'book';
    if (/\\/dph\\//.test(a)) return 'vat';
    if (/\\/kniha(\\/dennik|\\/platby|\\/ucet\\/[0-9.]+)?$/.test(a) && (form.getAttribute('method') || 'get').toLowerCase() === 'get') return 'range';
    if (/\\/kniha\\//.test(a)) return 'books';
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
    var form = event.target, which = event.submitter && (event.submitter.value || event.submitter.getAttribute('formaction'));
    var lead = leads[form.getAttribute('data-action') + '|' + which] || leads[form.getAttribute('data-action')];
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
  document.querySelectorAll('a[download]').forEach(function (link) {
    link.addEventListener('click', function (event) {
      event.preventDefault();
      var box = link.closest('li') || link.parentNode, p = box.querySelector('.preview-note');
      if (!p) { p = document.createElement('p'); p.className = 'preview-note'; p.setAttribute('role', 'status'); box.appendChild(p); }
      p.textContent = says.download;
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

const BAR = `<div class="preview-bar" role="note"><span>Náhľad s ukážkovými údajmi.</span><a href="index.html">Klient</a><a href="ucto.html">Účtovníčka</a><a href="ucto-dph.html">DPH</a><a href="ucto-kniha.html">Účtovná kniha</a><a href="vsetko-mame.html">Keď nič nechýba</a><a href="atelier.html">Nová firma</a><a href="banka.html">Banka</a><a href="vypis-novy-ucet.html">Nový účet</a><a href="faktura-odberatel.html">Faktúra u odberateľa</a><a href="koniec.html">Koniec zmluvy</a></div>`

function rewrite(page, extra) {
  return page
    .replaceAll(`href="${base}/`, 'href="/')
    .replaceAll(base, 'https://firmony.io')
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
  '/app/firma/prepnut': 'atelier.html',
  '/app/faktury/demo-inv-3|vystavit': 'faktura-vystavena.html',
  '/app/banka/fio': 'banka-fio-pripojena.html',
}

// The first state: three payments without a document.
for (const [path, file] of files) {
  if (path.startsWith('/app/prihlasenie') || file.endsWith('.xml')) continue
  await write(file, await html(path), leads)
}
for (const [path, file] of xmls) await writeFile(join(out, file), await html(path))

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

// A statement that does not follow the last one comes by email: it waits for Lucia on the team's side.
{
  const sent = await call('/playground/vypis?typ=medzera')
  if (sent.status !== 303) throw new Error(`a statement by email: ${sent.status}`)
}

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
  ['/ucto/klienti/demo-company/aml', 'ucto-aml-1.html'],
  ['/ucto/klienti/demo-company-2/aml', 'ucto-aml-2.html'],
  ['/ucto/doklady/demo-doc-3', 'ucto-doklad-zauctovany.html'],
  ['/ucto/klienti/demo-company/dph', 'ucto-dph.html'],
])
// The VAT page of the sample company: the month that ended is ready to be filed, the running one runs.
const month = (shift) => {
  const d = new Date()
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + shift, 15)).toISOString().slice(0, 7)
}
teamFiles.set(`/ucto/klienti/demo-company/dph?obdobie=${month(-1)}`, 'ucto-dph.html')
teamFiles.set(`/ucto/klienti/demo-company/dph?obdobie=${month(0)}`, 'ucto-dph-bezi.html')
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
for (const [path, file] of teamFiles) await write(file, await html(path), { [`/ucto/klienti/demo-company/dph/priznanie.xml|/ucto/klienti/demo-company/dph/podane`]: 'ucto-dph-podane.html' })
// Filed: the client is told in the app what to pay; the page of the month says so.
{
  const body = new URLSearchParams({ obdobie: month(-1) })
  const filed = await call('/ucto/klienti/demo-company/dph/podane', { method: 'POST', body, headers: { 'content-type': 'application/x-www-form-urlencoded' } })
  if (filed.status !== 303) throw new Error(`filing the VAT return: ${filed.status}`)
  await write('ucto-dph-podane.html', await html(`/ucto/klienti/demo-company/dph?obdobie=${month(-1)}&ok=dph-podane`))
  files.set('/ucto/klienti/demo-company/dph?ok=dph-podane', 'ucto-dph-podane.html')
}
// The books of the sample company, once its return was filed (the VAT settled on 343.300): the trial balance, the
// journal, the open items, the payments without a document, the internal documents, the opening balances, and every
// account of the trial balance with its movements.
{
  const books = new Map([
    ['/ucto/klienti/demo-company/kniha', 'ucto-kniha.html'],
    ['/ucto/klienti/demo-company/kniha/dennik', 'ucto-kniha-dennik.html'],
    ['/ucto/klienti/demo-company/kniha/saldokonto', 'ucto-kniha-saldokonto.html'],
    ['/ucto/klienti/demo-company/kniha/platby', 'ucto-kniha-platby.html'],
    ['/ucto/klienti/demo-company/kniha/interne', 'ucto-kniha-interne.html'],
    ['/ucto/klienti/demo-company/kniha/pociatocne', 'ucto-kniha-pociatocne.html'],
  ])
  const trial = await html('/ucto/klienti/demo-company/kniha')
  for (const m of trial.matchAll(/href="(\/ucto\/klienti\/demo-company\/kniha\/ucet\/[0-9.]+)\?/g)) books.set(m[1], `ucto-kniha-ucet-${m[1].split('/').pop()}.html`)
  for (const [path, file] of books) files.set(path, file)
  for (const [path, file] of books) await write(file, await html(path))
}
cookie = clientCookie
await write('dane.html', await html('/app/dane'))
await write('spravy.html', await html('/app/spravy'))
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

// The second company of the same person: a new one, which is shown its first steps.
{
  const body = new URLSearchParams({ firma: 'demo-company-2' })
  await call('/app/firma/prepnut', { method: 'POST', body, headers: { 'content-type': 'application/x-www-form-urlencoded' } })
  const atelier = new Map([
    ['/app/plna-moc', 'plna-moc-atelier.html'],
    ['/app/vyhlasenie', 'vyhlasenie-atelier.html'],
  ])
  await write('atelier.html', await html('/app'), { '/app/firma/prepnut': 'index.html' }, atelier)
  await write('plna-moc-atelier.html', await html('/app/plna-moc'), {}, atelier)
  const back = new URLSearchParams({ firma: 'demo-company' })
  await call('/app/firma/prepnut', { method: 'POST', body: back, headers: { 'content-type': 'application/x-www-form-urlencoded' } })
  // Eva, who owns Ateliér Nova, has not said yet who stands behind it: her empty declaration.
  const martin = cookie
  cookie = ''
  await call('/app/ukazka?ako=eva')
  await write('vyhlasenie-atelier.html', await html('/app/vyhlasenie'), {}, atelier)
  cookie = martin
}

// The draft invoice issued as it stands: it takes the next number and is a document of the company at once.
{
  const draft = await html('/app/faktury/demo-inv-3')
  const unescape = (text) =>
    text
      .replace(/&quot;/g, '"')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, '&')
  const form = new URLSearchParams()
  for (const m of draft.matchAll(/<input[^>]*name="([^"]+)"[^>]*value="([^"]*)"/g)) form.set(m[1], unescape(m[2]))
  for (const m of draft.matchAll(/<select[^>]*name="([^"]+)"[^>]*>([\s\S]*?)<\/select>/g)) {
    const chosen = m[2].match(/<option value="([^"]*)" selected/) ?? m[2].match(/<option value="([^"]*)"/)
    if (chosen) form.set(m[1], unescape(chosen[1]))
  }
  for (const m of draft.matchAll(/<textarea[^>]*name="([^"]+)"[^>]*>([\s\S]*?)<\/textarea>/g)) form.set(m[1], unescape(m[2]))
  form.set('akcia', 'vystavit')
  const issued = await call('/app/faktury/demo-inv-3', { method: 'POST', body: form, headers: { 'content-type': 'application/x-www-form-urlencoded' } })
  if (issued.status !== 303) throw new Error(`issuing the draft: ${issued.status}`)
  const page = await html('/app/faktury/demo-inv-3?ok=vystavena')
  const token = page.match(/\/f\/([A-Za-z0-9_-]{43})/)?.[1]
  if (!token) throw new Error('the issued draft has no link for its customer')
  files.set(`/f/${token}`, 'faktura-odberatel-3.html')
  files.set(`/f/${token}/xml`, 'faktura-20260008.xml')
  files.set('/app/faktury/demo-inv-3/xml', 'faktura-20260008.xml')
  await writeFile(join(out, 'faktura-20260008.xml'), await html('/app/faktury/demo-inv-3/xml'))
  await write('faktura-odberatel-3.html', await html(`/f/${token}`))
  await write('faktura-vystavena.html', page)
}

// The bank as it comes from January 2027, last of what the client does: the next statement arrives by email (and its
// money pays invoice 20260007 by itself), a statement of an account the company does not have asks Martin, and Fio
// banka is linked by its token.
{
  const next = await call('/playground/vypis?typ=dalsi')
  if (next.status !== 303) throw new Error(`the next statement: ${next.status}`)
  await new Promise((resolve) => setTimeout(resolve, 1000))
  await write('banka-vypis.html', await html('/app/banka'))
  await write('faktura-2-zaplatena.html', await html('/app/faktury/demo-inv-2'))
  const fresh = await call('/playground/vypis?typ=novy')
  if (fresh.status !== 303) throw new Error(`a statement of a new account: ${fresh.status}`)
  await new Promise((resolve) => setTimeout(resolve, 1000))
  const overview = await html('/app')
  const action = overview.match(/action="(\/app\/vypisy\/[0-9a-f-]{36}\/ucet)"/)?.[1]
  if (!action) throw new Error('no statement waits for the owner')
  const answered = { [`${action}|1`]: 'banka-ucet-pridany.html' }
  await write('vypis-novy-ucet.html', overview, answered)
  // Martin's yes: the account is the company's and its statement is taken.
  const yes = await call(action, { method: 'POST', body: new URLSearchParams({ ano: '1' }), headers: { 'content-type': 'application/x-www-form-urlencoded' } })
  if (yes.status !== 303) throw new Error(`the owner's yes: ${yes.status}`)
  await write('banka-ucet-pridany.html', await html(yes.headers.get('location')?.replace(/^https?:\/\/[^/]+/, '') ?? '/app/banka'))
  const token = 'Fio' + 'a1B2c3D4e5'.repeat(6) + 'f'
  const linked = await call('/app/banka/fio', { method: 'POST', body: new URLSearchParams({ token }), headers: { 'content-type': 'application/x-www-form-urlencoded' } })
  if (linked.status !== 303) throw new Error(`Fio by its token: ${linked.status}`)
  const fioPage = linked.headers.get('location')?.replace(/^https?:\/\/[^/]+/, '') ?? '/app/banka'
  await write('banka-fio-pripojena.html', await html(`${fioPage.split('#')[0]}&banka=fio#postup-banka`))
}

// The end of a contract, as the client sees it twenty days after its last day (only the download is left), and the
// team's page of that client with the handover. Then the contract runs on, for what follows.
{
  await call('/playground/koniec?dni=20')
  const ending = new Map([
    ['/app', 'koniec.html'],
    ['/app/firma', 'koniec-firma.html'],
    ['/app/doklady', 'koniec-doklady.html'],
    ['/app/faktury', 'koniec-faktury.html'],
  ])
  for (const [path, file] of ending) await write(file, await html(path), {}, ending)
  const martin = cookie
  cookie = ''
  await call('/ucto/ukazka')
  await write('ucto-klient-koniec.html', await html('/ucto/klienti/demo-company'), {}, new Map([['/ucto/klienti/demo-company', 'ucto-klient-koniec.html']]))
  cookie = martin
  await call('/playground/koniec?zrusit=1')
}

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
const written = [
  ...new Set([...files.values()].filter((f) => f.endsWith('.html') || f.endsWith('.xml'))),
  'platba-kava-hotovo.html',
  'platba-tankovanie-netreba.html',
  'platba-potreby-hotovo.html',
  'vsetko-mame.html',
  'atelier.html',
  'plna-moc-atelier.html',
  'vyhlasenie-atelier.html',
  'faktura-vystavena.html',
  'faktura-odberatel-3.html',
  'faktura-20260008.xml',
  'banka-vypis.html',
  'vypis-novy-ucet.html',
  'banka-ucet-pridany.html',
  'banka-fio-pripojena.html',
  'faktura-2-zaplatena.html',
  'koniec.html',
  'koniec-firma.html',
  'koniec-doklady.html',
  'koniec-faktury.html',
  'ucto-klient-koniec.html',
  'ucto-dph-podane.html',
  ...originals,
]
console.log(JSON.stringify(Object.fromEntries([...written.filter((f) => f !== 'index.html').map((f) => [f, join(out, f)]), ...[...assets].sort().map((a) => [a, join(out, a)])])))
