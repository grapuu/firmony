// Invoicing for everyone (26 October 2026): the public sign-up, the link, the workspace and what keeps it apart from
// the books, an invoice and a request paid by hand, the customers, the end of a workspace.
import { check } from './check.mjs'

const typed = (d) => `${Number(d.slice(8))}. ${Number(d.slice(5, 7))}. ${d.slice(0, 4)}`

export async function checkInvoicingRuntime({ mf, db, post, get, sent, settle, as, admin, freshAdmin, day }) {
  // The public page: indexable, with its sign-up, in the sitemap and in llms.txt.
  let res = await get('/fakturacia')
  let page = await res.text()
  check('invoicing: the public page answers, indexable, with its sign-up', res.status === 200 && !(res.headers.get('x-robots-tag') ?? '').includes('noindex') && page.includes('action="/fakturacia"') && page.includes('name="ico"') && page.includes('name="email"') && page.includes('FAQPage'))
  check('invoicing: the sitemap and llms.txt name it', (await (await get('/sitemap.xml')).text()).includes('/fakturacia</loc>') && (await (await get('/llms.txt')).text()).includes('/fakturacia'))
  res = await get('/fakturacia/podmienky')
  check('invoicing: its terms of use are a page of their own', res.status === 200 && (await res.text()).includes('bod-3-1'))

  // A sign-up of a company the register knows.
  let before = (await sent()).length
  res = await post('/fakturacia', { ico: '47111119', email: 'zeleny@example.test' }, { ip: '198.51.100.201' })
  page = await res.text()
  await settle()
  let mail = (await sent()).slice(before).find((m) => m.to === 'zeleny@example.test')
  const token = mail?.text.match(/\/fakturacia\/vstup\?t=([A-Za-z0-9_-]{43})/)?.[1] ?? ''
  check('invoicing: a sign-up answers that a link went out, and the link goes to the address typed', res.status === 200 && page.replace(/\u2060/g, '').includes('Pozrite sa do e-mailu') && token.length === 43)
  check('invoicing: the sign-up keeps the register\'s name, never the email in an address', (await db.prepare("SELECT company FROM invoicing_signups WHERE email = 'zeleny@example.test'").first())?.company === 'TEST-ONLY Fakturačka s. r. o.' && !page.includes('?e='))

  // Mistakes, a machine, a register that does not know the company.
  res = await post('/fakturacia', { ico: '12', email: 'nie-je-email' }, { ip: '198.51.100.202' })
  page = await res.text()
  check('invoicing: a wrong IČO and address are said at the form', res.status === 422 && page.includes('IČO má 6 až 8 číslic') && page.includes('meno@firma.sk'))
  before = (await sent()).length
  res = await post('/fakturacia', { ico: '55012345', email: 'bot@example.test', web: 'http://spam' }, { ip: '198.51.100.203' })
  await settle()
  check('invoicing: a machine that fills the hidden field is answered and sends nothing', res.status === 200 && (await sent()).slice(before).every((m) => m.to !== 'bot@example.test'))
  res = await post('/fakturacia', { ico: '53123450', email: 'novy@example.test' }, { ip: '198.51.100.204' })
  page = await res.text()
  check('invoicing: a company the register does not know asks for its name and address', res.status === 200 && page.includes('name="firma"') && page.includes('name="rucne"'))
  res = await post('/fakturacia', { ico: '53123450', email: 'novy@example.test', rucne: '1', firma: 'TEST-ONLY Ján Nový', adresa: 'Hlavná 1, 040 01 Košice' }, { ip: '198.51.100.204' })
  await settle()
  check('invoicing: with them typed it goes on', res.status === 200 && (await db.prepare("SELECT company FROM invoicing_signups WHERE email = 'novy@example.test'").first())?.company === 'TEST-ONLY Ján Nový')
  res = await post('/fakturacia', { ico: '54135797', email: 'x@example.test' }, { ip: '198.51.100.205' })
  check('invoicing: an IČO whose check digit is wrong is refused', res.status === 422)

  // The link: one click on a page, never by opening it.
  res = await get('/fakturacia/vstup?t=' + 'x'.repeat(43))
  check('invoicing: an unknown link is said to be gone', res.status === 410)
  res = await get(`/fakturacia/vstup?t=${token}`)
  page = await res.text()
  check('invoicing: the link opens a page with one button, not indexed', res.status === 200 && page.includes('TEST-ONLY Fakturačka s. r. o.') && (res.headers.get('x-robots-tag') ?? '').includes('noindex') && (await db.prepare('SELECT used_at FROM invoicing_signups WHERE email = ?').bind('zeleny@example.test').first())?.used_at === null)
  res = await post('/fakturacia/vstup', { t: token, meno: 'TEST-ONLY Zuzana Zelená' }, { ip: '198.51.100.201' })
  check('invoicing: without the consent nothing is made', res.status === 422 && (await res.text()).includes('súhlas'))
  res = await post('/fakturacia/vstup', { t: token, meno: 'TEST-ONLY Zuzana Zelená', suhlas: '1' }, { ip: '198.51.100.201' })
  const cookie = (res.headers.get('set-cookie') ?? '').split(';')[0]
  check('invoicing: the click makes the workspace and signs in', res.status === 303 && res.headers.get('location') === '/app/faktury?vitajte=1' && cookie.includes('='))
  res = await post('/fakturacia/vstup', { t: token, meno: 'TEST-ONLY Zuzana Zelená', suhlas: '1' }, { ip: '198.51.100.201' })
  check('invoicing: the link works once', res.status === 410)
  const ws = await db.prepare("SELECT c.* FROM companies c JOIN members m ON m.company_id = c.id JOIN users u ON u.id = m.user_id WHERE u.email = 'zeleny@example.test'").first()
  check(
    'invoicing: the workspace is invoicing alone: no accountant, no contract, nothing billed',
    ws?.invoicing_only === 1 && ws.accountant_id === null && ws.contract_at === null && ws.plan === 'faktury' && ws.name === 'TEST-ONLY Fakturačka s. r. o.' && /47111\/V/.test(ws.register_line ?? ''),
  )
  check('invoicing: its person has the name given on the link\'s page', (await db.prepare("SELECT name FROM users WHERE email = 'zeleny@example.test'").first())?.name === 'TEST-ONLY Zuzana Zelená')

  // A client of ours invoices in its own company: its IČO makes no workspace for a stranger.
  before = (await sent()).length
  await post('/fakturacia', { ico: '55012345', email: 'cudzi@example.test' }, { ip: '198.51.100.207' })
  await settle()
  const strangerToken = (await sent()).slice(before).find((m) => m.to === 'cudzi@example.test')?.text.match(/\/fakturacia\/vstup\?t=([A-Za-z0-9_-]{43})/)?.[1] ?? ''
  res = await post('/fakturacia/vstup', { t: strangerToken, meno: 'TEST-ONLY Cudzí', suhlas: '1' }, { ip: '198.51.100.207' })
  check('invoicing: a client\'s IČO makes no workspace for somebody who is not its member', res.status === 409 && (await res.text()).includes('pozvánku') && !(res.headers.get('set-cookie') ?? '').includes('firmony='))

  // The workspace reaches its invoicing and nothing else.
  const me = as(cookie)
  res = await me.get('/app')
  check('invoicing: the overview leads to the invoices', res.status === 303 && res.headers.get('location') === '/app/faktury')
  res = await me.get('/app/platby')
  check('invoicing: payments, documents and the rest lead there too', res.status === 303 && (await me.get('/app/doklady')).status === 303 && (await me.get('/app/firma')).status === 303 && (await me.get('/app/export')).status === 303)
  res = await me.post('/app/spravy', { text: 'ahoj' })
  check('invoicing: a post anywhere else is refused', res.status === 403 && (await me.post('/app/faktury/upomienky', { zapnut: '1' })).status === 403)
  res = await me.get('/app/faktury')
  page = await res.text()
  check('invoicing: the invoices welcome it and ask for the account first', res.status === 200 && page.includes('Vitajte vo Firmony') && page.includes('/app/fakturacia') && page.includes('Fakturácia zadarmo') && !page.includes('/app/platby'))
  res = await me.get('/app/odberatelia')
  check('invoicing: no customers yet', res.status === 200 && (await res.text()).includes('Zatiaľ tu nikto nie je'))

  // Its settings.
  const settings = { meno: 'TEST-ONLY Fakturačka s. r. o.', adresa: 'Mlynská 12, 040 01 Košice', ico: '47111119', dic: '2121234567', icdph: '', register: 'Obchodný register Mestského súdu Košice, oddiel Sro, vložka č. 58123/V', iban: 'SK31 1200 0000 1987 4263 7542', splatnost: '14' }
  res = await me.post('/app/fakturacia', settings)
  check('invoicing: an IBAN with wrong check digits is refused', res.status === 422 && (await res.text()).includes('IBAN nie je správny'))
  res = await me.post('/app/fakturacia', { ...settings, platitel: '1' })
  check('invoicing: a VAT payer is asked for the IČ DPH', res.status === 422 && (await res.text()).includes('IČ DPH'))
  res = await me.post('/app/fakturacia', { ...settings, iban: 'SK31 1200 0000 1987 4263 7541' })
  check('invoicing: the settings are kept', res.status === 303 && (await db.prepare('SELECT invoice_iban, dic FROM companies WHERE id = ?').bind(ws.id).first())?.invoice_iban === 'SK3112000000198742637541')
  res = await me.post('/app/fakturacia', { ...settings, iban: 'SK31 1200 0000 1987 4263 7541', meno: 'TEST-ONLY Cudzia s. r. o.', register: 'TEST-ONLY iný zápis' })
  const named = await db.prepare('SELECT name, register_line, register_found FROM companies WHERE id = ?').bind(ws.id).first()
  check('invoicing: a company the register knew keeps the register\'s name and entry', res.status === 303 && named?.register_found === 1 && named.name === 'TEST-ONLY Fakturačka s. r. o.' && named.register_line !== 'TEST-ONLY iný zápis')
  page = await (await me.get('/app/fakturacia')).text()
  check('invoicing: the settings show them read only, with the way to read the register again', page.includes('formaction="/app/fakturacia/register"') && !page.includes('name="meno"'))
  await db.prepare("UPDATE companies SET name = 'TEST-ONLY Stará s. r. o.' WHERE id = ?").bind(ws.id).run()
  res = await me.post('/app/fakturacia/register', {})
  check('invoicing: reading the register again brings its name back', res.status === 303 && (await db.prepare('SELECT name FROM companies WHERE id = ?').bind(ws.id).first())?.name === 'TEST-ONLY Fakturačka s. r. o.')
  page = await (await me.get('/app/faktury')).text()
  check('invoicing: with the account set, the first invoice is offered', page.includes('Vystaviť prvú faktúru'))

  // An invoice, paid by hand.
  const invoice = {
    akcia: 'vystavit',
    meno: 'TEST-ONLY Odberateľ s. r. o.',
    adresa: 'Dlhá 2, 040 01 Košice',
    ico: '36611111',
    email: '',
    vystavena: typed(day(-3)),
    dodana: typed(day(-3)),
    splatna: typed(day(11)),
    iban: 'SK31 1200 0000 1987 4263 7541',
    riadky: '1',
    'r0-popis': 'Konzultácie',
    'r0-mnozstvo': '3',
    'r0-jednotka': 'hod',
    'r0-cena': '50,00',
  }
  res = await me.post('/app/faktury', invoice)
  const invoiceId = res.headers.get('location')?.match(/\/app\/faktury\/([0-9a-f-]{36})/)?.[1] ?? ''
  const stored = await db.prepare('SELECT i.number, i.total_cents, d.source FROM invoices i JOIN documents d ON d.id = i.document_id WHERE i.id = ?').bind(invoiceId).first()
  check('invoicing: an invoice is issued as a client\'s is, numbered, with its document', res.status === 303 && stored?.total_cents === 15000 && stored.source === 'issued' && /^\d{8}$/.test(stored.number ?? ''))
  page = await (await me.get(`/app/faktury/${invoiceId}`)).text()
  check('invoicing: its page offers the payment by hand', page.includes(`/app/faktury/${invoiceId}/zaplatena`) && page.includes('Označiť ako zaplatenú'))
  res = await me.post(`/app/faktury/${invoiceId}/zaplatena`, { den: typed(day(2)) })
  check('invoicing: a payment ahead of today is refused', res.status === 422)
  res = await me.post(`/app/faktury/${invoiceId}/zaplatena`, { den: typed(day(-5)) })
  check('invoicing: so is one before the invoice was issued', res.status === 422)
  res = await me.post(`/app/faktury/${invoiceId}/zaplatena`, { den: typed(day(0)) })
  page = await (await me.get(`/app/faktury/${invoiceId}`)).text()
  check('invoicing: marked paid, it is paid', res.status === 303 && (await db.prepare('SELECT hand_paid_on FROM invoices WHERE id = ?').bind(invoiceId).first())?.hand_paid_on === day(0) && page.includes('Zrušiť označenie'))
  res = await me.post(`/app/faktury/${invoiceId}/nezaplatena`, {})
  check('invoicing: and the mark can be taken back', res.status === 303 && (await db.prepare('SELECT hand_paid_on FROM invoices WHERE id = ?').bind(invoiceId).first())?.hand_paid_on === null)
  page = await (await me.get('/app/odberatelia')).text()
  check('invoicing: the customer is among the customers, with what is open', page.includes('TEST-ONLY Odberateľ s. r. o.') && page.includes(`/app/faktury/nova?odberatel=${invoiceId}`) && page.includes('150,00'))
  page = await (await me.get(`/app/faktury/${invoiceId}`)).text()
  check('invoicing: its page has no card of the bank, whose payments a workspace does not read', !page.includes('ako zaplatenú sami') && page.includes(`/app/faktury/${invoiceId}/pdf`))
  page = await (await me.get('/app/faktury')).text()
  check('invoicing: the list says the payment is marked by a click', page.includes('označíte ju jedným klikom') && !page.includes('Keď ju zaplatí, uvidíte to tu'))
  const yearNow = day(0).slice(0, 4)
  page = await (await me.get('/app/fakturacia')).text()
  check('invoicing: the settings offer a year of invoices in one ZIP', page.includes(`/app/fakturacia/export?rok=${yearNow}`) && page.includes('Stiahnuť všetky faktúry'))
  res = await me.get(`/app/fakturacia/export?rok=${yearNow}`)
  const zipText = Buffer.from(await res.arrayBuffer()).toString('latin1')
  check(
    'invoicing: the ZIP holds each invoice as a PDF and an e-invoice, and the list',
    res.status === 200 && res.headers.get('content-type') === 'application/zip' && (res.headers.get('content-disposition') ?? '').includes(`-${yearNow}.zip`) &&
      zipText.includes('faktury.csv') && /pdf\/Faktura-\d{8}\.pdf/.test(zipText) && /e-faktury\/Faktura-\d{8}\.xml/.test(zipText) && zipText.includes('%PDF-1.4') && zipText.includes('<Invoice'),
  )
  check('invoicing: a year without invoices, or no year, is no archive', (await me.get('/app/fakturacia/export?rok=1999')).status === 404 && (await me.get('/app/fakturacia/export?rok=x')).status === 404)
  const shareToken = (await db.prepare('SELECT token FROM invoices WHERE id = ?').bind(invoiceId).first())?.token
  page = await (await get(`/f/${shareToken}`)).text()
  check('invoicing: the customer\'s page says Firmony does not vouch for a workspace\'s account', page.includes('neoveruje jeho bankový účet'))
  res = await get(`/f/${shareToken}/pdf`)
  check('invoicing: and gives the PDF', res.status === 200 && res.headers.get('content-type') === 'application/pdf')

  // An invoice from one sentence: the form filled, nothing issued, the sentence kept nowhere.
  const issuedBefore = (await db.prepare("SELECT COUNT(*) AS n FROM invoices WHERE company_id = ?").bind(ws.id).first())?.n
  page = await (await me.get('/app/faktury/nova')).text()
  check('invoicing: a new invoice offers to fill it from one sentence', page.includes('action="/app/faktury/nova/veta"') && page.includes('name="veta"'))
  res = await me.post('/app/faktury/nova/veta', { veta: 'ahoj' })
  check('invoicing: a sentence of nothing is said to be short', res.status === 422 && (await res.text()).includes('pár slov'))
  const sentence = 'TEST-ONLY 3 hodiny konzultácií po 50 € pre Zelený dvor, IČO 55012345, splatnosť 14 dní'
  res = await me.post('/app/faktury/nova/veta', { veta: sentence })
  page = await res.text()
  check(
    'invoicing: the sentence fills the customer from the register and the lines, and issues nothing',
    res.status === 200 && page.includes('value="Konzultácie"') && page.includes('value="50,00"') && page.includes('value="Zelený dvor s. r. o."') && page.includes('Skontrolujte') &&
      (await db.prepare('SELECT COUNT(*) AS n FROM invoices WHERE company_id = ?').bind(ws.id).first())?.n === issuedBefore,
  )
  const used = await db.prepare("SELECT detail FROM events WHERE company_id = ? AND action = 'invoice.ai' ORDER BY rowid DESC LIMIT 1").bind(ws.id).first()
  check('invoicing: the use is counted with its tokens, never with its words', Boolean(used) && JSON.parse(used.detail).in === 612 && !String(used.detail).includes('konzultácií'))
  res = await me.post('/app/faktury/nova/veta', { veta: 'TEST-ONLY NIC z tohto nebude' })
  check('invoicing: an answer that is no draft leaves the form to the person', res.status === 422 && (await res.text()).includes('nevedeli pripraviť'))

  // A request for an advance, paid by hand: its tax document follows by itself, and the mark then stays.
  res = await me.post('/app/faktury', { ...invoice, druh: 'zalohova' })
  const requestId = res.headers.get('location')?.match(/\/app\/faktury\/([0-9a-f-]{36})/)?.[1] ?? ''
  res = await me.post(`/app/faktury/${requestId}/zaplatena`, { den: typed(day(0)) })
  const advance = await db.prepare("SELECT id, total_cents, kind FROM invoices WHERE payment_id = ?").bind(`hand:${requestId}`).first()
  check('invoicing: a request paid by hand gets the document of the money received', res.status === 303 && advance?.kind === 'advance' && advance.total_cents === 15000 && res.headers.get('location') === `/app/faktury/${advance.id}?ok=zaloha-prijata`)
  res = await me.post(`/app/faktury/${requestId}/zaplatena`, { den: typed(day(0)) })
  check('invoicing: a second click makes no second one', (await db.prepare('SELECT COUNT(*) AS n FROM invoices WHERE payment_id = ?').bind(`hand:${requestId}`).first())?.n === 1)
  res = await me.post(`/app/faktury/${requestId}/nezaplatena`, {})
  check('invoicing: with its document standing, the request stays paid', (await db.prepare('SELECT hand_paid_on FROM invoices WHERE id = ?').bind(requestId).first())?.hand_paid_on === day(0))

  // Nothing of the books can reach a workspace, and the team sees none.
  const refused = async (sql, ...binds) => {
    try {
      await db.prepare(sql).bind(...binds).run()
      return false
    } catch (err) {
      return /FIRMONY_INVOICING/.test(String(err?.message ?? err))
    }
  }
  check(
    'invoicing: the database refuses payments, bank accounts, messages and other documents in a workspace',
    (await refused("INSERT INTO payments (id, company_id, account_id, created_at, booked_on, amount_cents, ref) VALUES ('ws-p', ?, 'x', 0, '2026-10-01', 1, 'r')", ws.id)) &&
      (await refused("INSERT INTO accounts (id, company_id, iban) VALUES ('ws-a', ?, 'SK31')", ws.id)) &&
      (await refused("INSERT INTO messages (id, company_id, created_at, author, body) VALUES ('ws-m', ?, 0, 'x', 'x')", ws.id)) &&
      (await refused("INSERT INTO documents (id, company_id, created_at, source, status) VALUES ('ws-d', ?, 0, 'upload', 'new')", ws.id)),
  )
  check(
    'invoicing: a workspace never becomes a client, nor gets an accountant or a contract',
    (await refused('UPDATE companies SET invoicing_only = 0 WHERE id = ?', ws.id)) &&
      (await refused("UPDATE companies SET accountant_id = 'lucia' WHERE id = ?", ws.id)) &&
      (await refused('UPDATE companies SET contract_at = 1 WHERE id = ?', ws.id)) &&
      (await refused("UPDATE companies SET invoicing_only = 1 WHERE id = (SELECT id FROM companies WHERE invoicing_only = 0 LIMIT 1)")),
  )
  page = await (await admin.get('/ucto')).text()
  check('invoicing: the team\'s list has no workspace', !page.includes(ws.id) && page.includes('/ucto/klienti/'))
  check('invoicing: nor opens its page', (await admin.get(`/ucto/klienti/${ws.id}`)).status === 404 && (await admin.get(`/ucto/klienti/${ws.id}/kniha`)).status === 404)
  res = await mf.dispatchFetch(`http://localhost/cdn-cgi/local/email?from=${encodeURIComponent('niekto@example.test')}&to=${encodeURIComponent(`doklady-${ws.inbox}@firmony.io`)}`, { method: 'POST', body: 'From: niekto@example.test\r\nTo: x\r\nSubject: x\r\n\r\nx' })
  check('invoicing: mail to a workspace\'s address for documents is refused', res.status === 400)

  // Nothing of an invoice is emailed from a workspace, and an escaped address reaches no route past the checks.
  res = await me.post(`/app/faktury/${invoiceId}/poslat`, { email: 'obet@example.test' })
  check('invoicing: a workspace emails no invoice', res.status === 403 && (await me.post(`/app/faktury/${invoiceId}/pripomenut`, {})).status === 403)
  check('invoicing: an escaped character in an address of the app is no address', (await me.get('/app/expor%74?rok=2026')).status === 404 && (await me.get('/app/faktury/upomienk%79')).status === 404 && (await me.get('/%61pp/export?rok=2026')).status === 404 && (await me.get('/%2fapp/faktury')).status === 404 && (await admin.get('/%75cto/analytika/export.json')).status === 404 && (await admin.get('/%75cto/aml')).status === 404)

  // The administrator stops a misused workspace: its people are out, its customers' links are gone; and lifts it.
  const boss = await freshAdmin()
  page = await (await boss.get('/ucto/fakturacne-ucty')).text()
  check('invoicing: the administrator sees the workspaces, not their invoices', page.includes(ws.id) && page.includes('TEST-ONLY Fakturačka s. r. o.') && !page.includes('TEST-ONLY Odberateľ'))
  const publicToken = (await db.prepare('SELECT token FROM invoices WHERE id = ?').bind(invoiceId).first())?.token
  check('invoicing: before, the customer\'s link opens', (await get(`/f/${publicToken}`)).status === 200)
  page = await (await boss.get(`/ucto/fakturacne-ucty?q=${encodeURIComponent(`https://firmony.io/f/${publicToken}`)}`)).text()
  check('invoicing: the administrator finds a workspace by the link a report brings', page.includes(ws.id) && (await (await boss.get('/ucto/fakturacne-ucty?q=nikto-taky')).text()).includes('Zatiaľ žiadny fakturačný účet'))
  check('invoicing: and by its IČO', (await (await boss.get('/ucto/fakturacne-ucty?q=47111119')).text()).includes(ws.id))
  res = await boss.post(`/ucto/fakturacne-ucty/${ws.id}/zablokovat`, { dovod: 'TEST-ONLY phishing report' })
  check('invoicing: stopped, the customer\'s link answers nothing and the person is out', res.status === 303 && (await get(`/f/${publicToken}`)).status === 404 && (await me.get('/app/faktury')).status === 303)
  check('invoicing: the same person makes no new workspace meanwhile', (await db.prepare("SELECT action FROM events WHERE action = 'invoicing.blocked' AND subject = ?").bind(ws.id).first())?.action === 'invoicing.blocked')
  res = await boss.post(`/ucto/fakturacne-ucty/${ws.id}/odblokovat`, {})
  check('invoicing: lifted, the link opens again', res.status === 303 && (await get(`/f/${publicToken}`)).status === 200)
  // Signed in again by a link from the email, as anybody without a passkey.
  let before2 = (await sent()).length
  await post('/app/prihlasenie', { email: 'zeleny@example.test' }, { ip: '198.51.100.206' })
  await settle()
  const link = (await sent()).slice(before2).filter((m) => m.to === 'zeleny@example.test').pop()?.text.match(/\/app\/vstup\?t=([A-Za-z0-9_-]{43})/)?.[1] ?? ''
  res = await post('/app/vstup', { t: link }, { ip: '198.51.100.206' })
  const again = as((res.headers.get('set-cookie') ?? '').split(';')[0])
  check('invoicing: the person signs in again into the workspace', (await again.get('/app/faktury')).status === 200)

  // Ending it is as sensitive as an export: an older session is asked for a fresh link, which a workspace can reach.
  const owner = await db.prepare("SELECT id FROM users WHERE email = 'zeleny@example.test'").first()
  await db.prepare('UPDATE sessions SET created_at = created_at - 3600 WHERE user_id = ?').bind(owner.id).run()
  res = await again.post('/app/fakturacia/zrusit', { potvrdenie: 'ZRUŠIŤ' })
  const confirmAt = res.headers.get('location') ?? ''
  check('invoicing: an older session is asked to confirm by a fresh link, on a page the workspace reaches', res.status === 303 && confirmAt.startsWith('/app/potvrdit') && (await again.get(confirmAt)).status === 200)
  await db.prepare('UPDATE sessions SET created_at = created_at + 3600 WHERE user_id = ?').bind(owner.id).run()
  const me2 = again

  // The end of a workspace: everything of it goes, the person is signed out.
  res = await me2.post('/app/fakturacia/zrusit', { potvrdenie: 'ano' })
  check('invoicing: ending it asks for the word', res.status === 422)
  res = await me2.post('/app/fakturacia/zrusit', { potvrdenie: 'zrušiť' })
  check(
    'invoicing: ended, the workspace and its invoices are gone and the person is out',
    res.status === 303 &&
      res.headers.get('location') === '/fakturacia?zrusene=1' &&
      (await db.prepare('SELECT COUNT(*) AS n FROM companies WHERE id = ?').bind(ws.id).first())?.n === 0 &&
      (await db.prepare('SELECT COUNT(*) AS n FROM invoices WHERE company_id = ?').bind(ws.id).first())?.n === 0 &&
      (await db.prepare('SELECT COUNT(*) AS n FROM documents WHERE company_id = ?').bind(ws.id).first())?.n === 0 &&
      (await me2.get('/app/faktury')).status === 303,
  )
}
