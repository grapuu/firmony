// Invoicing for everyone (26 October 2026): the public sign-up, the link, the workspace and what keeps it apart from
// the books, an invoice and a request paid by hand, the customers, the end of a workspace.
import { check } from './check.mjs'

const typed = (d) => `${Number(d.slice(8))}. ${Number(d.slice(5, 7))}. ${d.slice(0, 4)}`

export async function checkInvoicingRuntime({ mf, db, post, get, sent, settle, as, admin, day }) {
  // The public page: indexable, with its sign-up, in the sitemap and in llms.txt.
  let res = await get('/fakturacia')
  let page = await res.text()
  check('invoicing: the public page answers, indexable, with its sign-up', res.status === 200 && !(res.headers.get('x-robots-tag') ?? '').includes('noindex') && page.includes('action="/fakturacia"') && page.includes('name="ico"') && page.includes('name="email"') && page.includes('FAQPage'))
  check('invoicing: the sitemap and llms.txt name it', (await (await get('/sitemap.xml')).text()).includes('/fakturacia</loc>') && (await (await get('/llms.txt')).text()).includes('/fakturacia'))
  res = await get('/fakturacia/podmienky')
  check('invoicing: its terms of use are a page of their own', res.status === 200 && (await res.text()).includes('bod-3-1'))

  // A sign-up of a company the register knows.
  let before = (await sent()).length
  res = await post('/fakturacia', { ico: '55012345', email: 'zeleny@example.test' }, { ip: '198.51.100.201' })
  page = await res.text()
  await settle()
  let mail = (await sent()).slice(before).find((m) => m.to === 'zeleny@example.test')
  const token = mail?.text.match(/\/fakturacia\/vstup\?t=([A-Za-z0-9_-]{43})/)?.[1] ?? ''
  check('invoicing: a sign-up answers that a link went out, and the link goes to the address typed', res.status === 200 && page.includes('Pozrite sa do e-mailu') && token.length === 43)
  check('invoicing: the sign-up keeps the register\'s name, never the email in an address', (await db.prepare("SELECT company FROM invoicing_signups WHERE email = 'zeleny@example.test'").first())?.company === 'Zelený dvor s. r. o.' && !page.includes('?e='))

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
  check('invoicing: the link opens a page with one button, not indexed', res.status === 200 && page.includes('Zelený dvor s. r. o.') && (res.headers.get('x-robots-tag') ?? '').includes('noindex') && (await db.prepare('SELECT used_at FROM invoicing_signups WHERE email = ?').bind('zeleny@example.test').first())?.used_at === null)
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
    ws?.invoicing_only === 1 && ws.accountant_id === null && ws.contract_at === null && ws.plan === 'faktury' && ws.name === 'Zelený dvor s. r. o.' && /58123\/V/.test(ws.register_line ?? ''),
  )
  check('invoicing: its person has the name given on the link\'s page', (await db.prepare("SELECT name FROM users WHERE email = 'zeleny@example.test'").first())?.name === 'TEST-ONLY Zuzana Zelená')

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
  const settings = { meno: 'Zelený dvor s. r. o.', adresa: 'Mlynská 12, 040 01 Košice', ico: '55012345', dic: '2121234567', icdph: '', register: 'Obchodný register Mestského súdu Košice, oddiel Sro, vložka č. 58123/V', iban: 'SK31 1200 0000 1987 4263 7542', splatnost: '14' }
  res = await me.post('/app/fakturacia', settings)
  check('invoicing: an IBAN with wrong check digits is refused', res.status === 422 && (await res.text()).includes('IBAN nie je správny'))
  res = await me.post('/app/fakturacia', { ...settings, platitel: '1' })
  check('invoicing: a VAT payer is asked for the IČ DPH', res.status === 422 && (await res.text()).includes('IČ DPH'))
  res = await me.post('/app/fakturacia', { ...settings, iban: 'SK31 1200 0000 1987 4263 7541' })
  check('invoicing: the settings are kept', res.status === 303 && (await db.prepare('SELECT invoice_iban, dic FROM companies WHERE id = ?').bind(ws.id).first())?.invoice_iban === 'SK3112000000198742637541')
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

  // The end of a workspace: everything of it goes, the person is signed out.
  res = await me.post('/app/fakturacia/zrusit', { potvrdenie: 'ano' })
  check('invoicing: ending it asks for the word', res.status === 422)
  res = await me.post('/app/fakturacia/zrusit', { potvrdenie: 'zrušiť' })
  check(
    'invoicing: ended, the workspace and its invoices are gone and the person is out',
    res.status === 303 &&
      res.headers.get('location') === '/fakturacia?zrusene=1' &&
      (await db.prepare('SELECT COUNT(*) AS n FROM companies WHERE id = ?').bind(ws.id).first())?.n === 0 &&
      (await db.prepare('SELECT COUNT(*) AS n FROM invoices WHERE company_id = ?').bind(ws.id).first())?.n === 0 &&
      (await db.prepare('SELECT COUNT(*) AS n FROM documents WHERE company_id = ?').bind(ws.id).first())?.n === 0 &&
      (await me.get('/app/faktury')).status === 303,
  )
}
