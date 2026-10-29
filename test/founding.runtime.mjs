// The s. r. o. for 1 € end to end in workerd (src/founding/): the offer, the link by email, the application step by step
// (data, the identity document, the contract fixed and signed, the payment from europio's bank), the designated
// person's checks and decision, the formation's steps and calls, the company made from the register with its deposit,
// the deposit held until the commitment's last months, the company's approval, and an application that lapses and goes.
import { check } from './check.mjs'
import { writeFileSync } from 'node:fs'
import { leastLoadedAccountant } from '../.wrangler/dist/stores.js'

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new TextEncoder().encode('TEST-ONLY identity document photo, synthetic')])
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...new TextEncoder().encode('TEST-ONLY back side, synthetic')])
const SIGNED = new TextEncoder().encode('%PDF-1.7\nTEST_ONLY_SYNTHETIC_NO_REAL_SIGNATURE\n%%EOF\n')

/** A valid ten-digit birth number for a day. */
function birthNumber(yy, mm, dd) {
  const head = `${String(yy).padStart(2, '0')}${String(mm).padStart(2, '0')}${String(dd).padStart(2, '0')}`
  for (let tail = 100; tail < 1000; tail++) for (let last = 0; last < 10; last++) if (Number(`${head}${tail}${last}`) % 11 === 0) return `${head}${tail}${last}`
  return null
}

export async function checkFoundingRuntime({ db, files, get, post, sent, settle, as, freshAdmin, acc, signIn, nowS, purgeFoundings, capture }) {
  const keep = (name, html) => { if (capture) writeFileSync(`${capture}/${name}`, html) }
  const plain = (html) => html.replace(/ /g, ' ').replace(/&nbsp;/g, ' ')
  const anon = as('')
  let res = await get('/zalozenie')
  let page = await res.text()
  keep('founding-landing.html', page)
  page = plain(page)
  check('founding: the offer page sells it: the deal, three steps, what is paid with the deposit, the places of the month and the form', res.status === 200 && page.includes('za 1 €') && page.includes('Tri kroky') && page.includes('Kaucia') && page.includes('550 €') && page.includes('action="/zalozenie"') && page.includes('ešte 20 miest') && page.includes('Podmienky ponuky') && !page.includes('5 000 €') && (res.headers.get('x-robots-tag') ?? '').includes('noindex'))
  res = await get('/zalozenie/zmluva')
  page = plain(await res.text())
  check('founding: the whole contract can be read before applying', res.status === 200 && page.includes('Zmluva o zabezpečení založenia spoločnosti a o vedení účtovníctva') && page.includes('Ručenie zakladateľa'))
  check('founding: the guide about forming an s. r. o. is still its own page', (await get('/zalozenie-sro')).status === 200)

  res = await post('/zalozenie', { email: 'nie-je-email', plan: 'start' }, { ip: '198.51.100.90' })
  check('founding: a wrong address is said at the form', res.status === 422)
  const before = (await sent()).length
  res = await post('/zalozenie', { email: 'Zakladatel@Founding.test', plan: 'start', utm_source: 'tiktok', ref: 'kreator1' }, { ip: '198.51.100.90' })
  check('founding: applying sends a link and says so', res.status === 303 && res.headers.get('location') === '/zalozenie/odoslane')
  await settle()
  let row = await db.prepare("SELECT * FROM foundings WHERE email = 'zakladatel@founding.test'").first()
  const year = new Date().getUTCFullYear()
  check('founding: the application is kept with its symbol and where the founder came from', row?.status === 'open' && /^7\d{9}$/.test(row.vs) && row.vs.startsWith(`7${year}`) && JSON.parse(row.source).ref === 'kreator1')
  let mail = (await sent()).slice(before).filter((m) => m.to.toLowerCase() === 'zakladatel@founding.test')
  const token = mail[0]?.text.match(/\/zalozenie\/([A-Za-z0-9_-]{43})/)?.[1]
  check('founding: the email is a doorbell with the link and nothing else', mail.length === 1 && Boolean(token) && !mail[0].text.includes(row.vs))
  res = await post('/zalozenie', { email: 'zakladatel@founding.test', plan: 'start' }, { ip: '198.51.100.90' })
  await settle()
  const again = (await sent()).slice(before).filter((m) => m.to.toLowerCase() === 'zakladatel@founding.test')
  check('founding: asking again with the same address gives a new link to the same application', res.status === 303 && again.length === 2 && (await db.prepare("SELECT COUNT(*) AS n FROM foundings WHERE email = 'zakladatel@founding.test'").first()).n === 1)
  const base = `/zalozenie/${token}`
  check('founding: an unknown link opens nothing', (await get(`/zalozenie/${'x'.repeat(43)}`)).status === 404)
  res = await get(base)
  page = plain(await res.text())
  check('founding: the link opens the application at its first step, unsaved', res.status === 200 && page.includes('Vaše údaje a údaje firmy') && page.includes(`${base}/udaje`) && (res.headers.get('referrer-policy') ?? '') === 'no-referrer')

  const rc = birthNumber(94, 3, 7)
  const data = {
    meno: 'Ján Novák', rc, narodeny: '7. 3. 1994', adresa: 'Hlavná 12, 040 01 Košice', obcianstvo: 'slovenské', doklad: 'op', cislo: 'EA123456', platnost: '12. 5. 2031',
    pep: 'nie', zdroj: 'úspory zo zamestnania', obrat: 'do-50', hotovost: 'nie', zahranicie: '', vlastne: 'ano',
    firma: 'TEST-ONLY Founded Nova s. r. o.', firma2: '', sidlo: 'Hlavná 12, 040 01 Košice', sidlo_typ: 'rent', cinnosti: 'Poskytovanie softvéru', imanie: '5000', telefon: '',
  }
  res = await anon.post(`${base}/udaje`, { ...data, imanie: '1000' })
  page = plain(await res.text())
  check('founding: wrong data are said and nothing is kept', res.status === 422 && page.includes('Základné imanie je najmenej 5 000 €') && !(await db.prepare("SELECT founder FROM foundings WHERE email = 'zakladatel@founding.test'").first()).founder)
  res = await anon.post(`${base}/udaje`, data)
  row = await db.prepare("SELECT * FROM foundings WHERE email = 'zakladatel@founding.test'").first()
  check('founding: the data are saved', res.status === 303 && JSON.parse(row.founder).name === 'Ján Novák' && JSON.parse(row.company).capitalCents === 500_000)
  page = await (await get(base)).text()
  keep('founding-data.html', page)
  page = plain(page)
  check('founding: the founder’s page never shows the birth number or the document number back', !page.includes(rc) && !page.includes('EA123456') && page.includes('Upraviť údaje'))

  res = await anon.form(`${base}/doklad`, [['predna', { name: 'op.txt', bytes: new TextEncoder().encode('not a photo at all'), type: 'text/plain' }]])
  check('founding: a file that is no photo or PDF is refused', res.status === 422)
  res = await anon.form(`${base}/doklad`, [['predna', { name: 'predna.jpg', bytes: JPEG, type: 'image/jpeg' }], ['zadna', { name: 'zadna.png', bytes: PNG, type: 'image/png' }]])
  row = await db.prepare("SELECT * FROM foundings WHERE email = 'zakladatel@founding.test'").first()
  check('founding: both sides of the document are kept in R2 under the application', res.status === 303 && row.id_front_key?.startsWith(`foundings/${row.id}/id/front-`) && Boolean(await files.head(row.id_front_key)) && Boolean(await files.head(row.id_back_key)))

  res = await anon.form(`${base}/podpis`, [['druh', 'qes'], ['subor', { name: 'zmluva.pdf', bytes: SIGNED, type: 'application/pdf' }]])
  check('founding: a signature before the contract was taken to sign is refused', res.status === 422)
  res = await get(`${base}/zmluva.pdf`)
  const pdf = await res.text()
  row = await db.prepare("SELECT * FROM foundings WHERE email = 'zakladatel@founding.test'").first()
  check('founding: the contract to sign is fixed with its fingerprint, printed in the PDF', res.status === 200 && res.headers.get('content-type') === 'application/pdf' && /^[a-f0-9]{64}$/.test(row.contract_hash) && pdf.includes(row.contract_hash) && row.contract_text.includes('Príloha: Vyhlásenie zakladateľa'))
  res = await anon.form(`${base}/podpis`, [['druh', 'qes'], ['subor', { name: 'zmluva.pdf', bytes: SIGNED, type: 'application/pdf' }]])
  row = await db.prepare("SELECT * FROM foundings WHERE email = 'zakladatel@founding.test'").first()
  check('founding: the signed contract is kept for the text it was given on', res.status === 303 && row.signed_contract_hash === row.contract_hash && row.signed_kind === 'qes')
  page = await (await get(base)).text()
  keep('founding-pay.html', page)
  page = plain(page)
  check('founding: once signed, the page asks for 550 € to europio’s account with the symbol and a QR code', page.includes('550,00 €') && page.includes(row.vs) && page.includes('PAY by square'))

  // A change of the data takes the signature back: the founder signs the contract as it is.
  res = await anon.post(`${base}/udaje`, { ...data, firma2: 'TEST-ONLY Founded Nova Two s. r. o.' })
  row = await db.prepare("SELECT * FROM foundings WHERE email = 'zakladatel@founding.test'").first()
  check('founding: changed data leave no contract and no valid signature', res.status === 303 && row.contract_hash === null && row.signed_contract_hash !== null)
  res = await anon.post(`${base}/odoslat`, {})
  check('founding: it cannot be handed over with a signature on another text', res.status === 409 && (await db.prepare('SELECT status FROM foundings WHERE id = ?').bind(row.id).first()).status === 'open')
  await get(`${base}/zmluva.pdf`)
  await anon.form(`${base}/podpis`, [['druh', 'qes'], ['subor', { name: 'zmluva.pdf', bytes: SIGNED, type: 'application/pdf' }]])
  const teamBefore = (await sent()).length
  res = await anon.post(`${base}/odoslat`, {})
  await settle()
  row = await db.prepare('SELECT * FROM foundings WHERE id = ?').bind(row.id).first()
  check('founding: handed over, it waits for the designated person, who is rung at our address', res.status === 303 && row.status === 'verifying' && (await sent()).slice(teamBefore).some((m) => m.to === 'ahoj@firmony.io' && m.text.includes(`/ucto/zalozenia/${row.id}`)))
  res = await anon.post(`${base}/udaje`, data)
  check('founding: handed over, the data no longer change', res.status === 409)

  // The designated person alone, after a fresh confirmation.
  check('founding: an accountant sees no application', (await acc.get('/ucto/zalozenia')).status === 404 && (await acc.get(`/ucto/zalozenia/${row.id}`)).status === 404)
  let officer = await freshAdmin()
  res = await officer.get('/ucto/zalozenia')
  page = plain(await res.text())
  check('founding: the designated person lists the application to verify', res.status === 200 && page.includes('Na overenie') && page.includes('TEST-ONLY Founded Nova s. r. o.'))
  res = await officer.get(`/ucto/zalozenia/${row.id}`)
  page = await res.text()
  keep('founding-team.html', page)
  page = plain(page)
  check('founding: the application shows the identification, the files, the source and what is missing', res.status === 200 && page.includes(rc) && page.includes('EA123456') && page.includes('ref=kreator1') && page.includes('Platba 550 € ešte neprišla') && page.includes('/subor/predna'))
  res = await officer.get(`/ucto/zalozenia/${row.id}/subor/predna`)
  check('founding: the document is downloaded, never shown in a page', res.status === 200 && (res.headers.get('content-disposition') ?? '').startsWith('attachment') && (res.headers.get('content-security-policy') ?? '').includes('sandbox'))
  res = await officer.post(`/ucto/zalozenia/${row.id}/rozhodnutie`, { verdikt: 'verified', poznamka: '', riziko: 'low' })
  check('founding: it cannot be verified while anything is missing', res.status === 409 && (await db.prepare('SELECT status FROM foundings WHERE id = ?').bind(row.id).first()).status === 'verifying')

  // The money comes to europio's account, from the founder's own.
  const operator = await db.prepare('SELECT id FROM companies WHERE operator = 1').first()
  await db.prepare("INSERT INTO payments (id, company_id, account_id, created_at, booked_on, amount_cents, currency, party, party_iban, vs, ref, source) VALUES ('founding-pay-1', ?, 'founding-test-account', ?, date('now'), 55000, 'EUR', 'NOVAK JAN', 'SK3112000000198742637541', ?, 'founding-test-ref-1', 'statement')").bind(operator.id, nowS, row.vs).run()
  page = plain(await (await officer.get(`/ucto/zalozenia/${row.id}`)).text())
  row = await db.prepare('SELECT * FROM foundings WHERE id = ?').bind(row.id).first()
  check('founding: the payment is found by its symbol, and the payer’s name is compared', row.paid_cents === 55_000 && row.payer_iban === 'SK3112000000198742637541' && page.includes('meno sa zhoduje'))
  res = await officer.post(`/ucto/zalozenia/${row.id}/kontrola`, { druh: 'identity', vysledok: 'clear', poznamka: 'krátko' })
  check('founding: a check without its source is refused', res.status === 422)
  // The app prepares the founder on both sanctions lists and the payment it paired: one click each (aml/proposals.ts).
  const raw = await (await officer.get(`/ucto/zalozenia/${row.id}`)).text()
  const prepared = (kind) => (new RegExp(`<textarea[^>]*id="kp-${kind}-zdroj"[^>]*>([^<]*)</textarea>`).exec(raw)?.[1] ?? '').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
  check(
    'founding: the founder on the EU and UN lists and the payment are prepared for one click each, the rest left to the person',
    raw.includes('data-found-proposal="sanctions"') && prepared('sanctions').includes('Výsledok: bez zhody') && prepared('sanctions').includes('Bezpečnostnej rady OSN') && prepared('sanctions').includes('zakladateľ') &&
      raw.includes('data-found-proposal="payment"') && prepared('payment').includes('Meno platiteľa sa zhoduje') && prepared('payment').includes(row.vs) && !raw.includes('data-found-proposal="identity"'),
  )
  for (const kind of ['sanctions', 'payment']) res = await officer.post(`/ucto/zalozenia/${row.id}/kontrola`, { druh: kind, vysledok: 'clear', poznamka: prepared(kind) })
  check('founding: a prepared check is recorded as it stands', res.status === 303 && (await db.prepare("SELECT note FROM founding_checks WHERE founding_id = ? AND kind = 'payment'").bind(row.id).first())?.note.startsWith('Automatické spárovanie'))
  // Identity has its own form and is clear only with the way it was verified (AML program 4.2a b), 29 October 2026).
  check('founding: identity is recorded on its own form, with the ways the signature allows', raw.includes('data-found-identity') && raw.includes('name="sposob" value="qes"') && raw.includes('name="sposob" value="person"') && !/<option value="identity">/.test(raw))
  res = await officer.post(`/ucto/zalozenia/${row.id}/kontrola`, { druh: 'identity', vysledok: 'clear', poznamka: 'TEST-ONLY meno v certifikáte sedí s prihláškou' })
  check('founding: a clear identity without the way it was verified is refused', res.status === 422 && plain(await res.text()).includes('vyberte, ako ste ju overili'))
  res = await officer.post(`/ucto/zalozenia/${row.id}/kontrola`, { druh: 'identity', vysledok: 'clear', sposob: 'video', poznamka: 'TEST-ONLY meno v certifikáte sedí s prihláškou' })
  check('founding: no other way of verifying identity is taken', res.status === 422)
  res = await officer.post(`/ucto/zalozenia/${row.id}/kontrola`, { druh: 'identity', vysledok: 'clear', sposob: 'qes', poznamka: 'TEST-ONLY meno v certifikáte sedí s prihláškou' })
  check(
    'founding: identity verified by the qualified signature says so with its provision first',
    res.status === 303 && (await db.prepare("SELECT note FROM founding_checks WHERE founding_id = ? AND kind = 'identity'").bind(row.id).first())?.note.startsWith('Overené kvalifikovaným elektronickým podpisom zakladateľa na zmluve (§ 8 ods. 1 písm. f)'),
  )
  for (const kind of ['pep', 'debts', 'signature']) {
    res = await officer.post(`/ucto/zalozenia/${row.id}/kontrola`, { druh: kind, vysledok: 'clear', poznamka: `TEST-ONLY overené z primárneho zdroja: ${kind}` })
  }
  check('founding: every check needed is recorded, kept as written', res.status === 303 && (await db.prepare('SELECT COUNT(*) AS n FROM founding_checks WHERE founding_id = ?').bind(row.id).first()).n === 6)
  let refused = false
  try {
    await db.prepare('DELETE FROM founding_checks WHERE founding_id = ?').bind(row.id).run()
  } catch {
    refused = true
  }
  check('founding: a check cannot be deleted while the application lives', refused)
  // The founder's risk group is set when it is verified (AML program 4.2a e)), proposed from the application.
  res = await officer.post(`/ucto/zalozenia/${row.id}/rozhodnutie`, { verdikt: 'verified', poznamka: '' })
  check('founding: it is not verified without the founder’s risk group', res.status === 422 && plain(await res.text()).includes('rizikovú skupinu') && (await db.prepare('SELECT status FROM foundings WHERE id = ?').bind(row.id).first()).status === 'verifying')
  const decisionPage = await (await officer.get(`/ucto/zalozenia/${row.id}`)).text()
  check('founding: the decision proposes the risk group from the application', /<option value="low" selected[^>]*>nízke \(navrhnuté podľa prihlášky\)/.test(decisionPage.replace(/<!-- -->/g, '')))
  const founderBefore = (await sent()).length
  res = await officer.post(`/ucto/zalozenia/${row.id}/rozhodnutie`, { verdikt: 'verified', poznamka: '', riziko: 'standard' })
  await settle()
  check(
    'founding: the risk group chosen is kept as an event, beside the one proposed',
    (await db.prepare("SELECT note FROM founding_events WHERE founding_id = ? AND action = 'risk'").bind(row.id).first())?.note === 'Riziková skupina: štandardné. Podľa prihlášky navrhnutá: nízke.',
  )
  row = await db.prepare('SELECT * FROM foundings WHERE id = ?').bind(row.id).first()
  mail = (await sent()).slice(founderBefore).filter((m) => m.to.toLowerCase() === 'zakladatel@founding.test')
  const token2 = mail[0]?.text.match(/\/zalozenie\/([A-Za-z0-9_-]{43})/)?.[1]
  check('founding: verified, it is planned in a month and the founder gets a new link', res.status === 303 && row.status === 'verified' && /^\d{4}-\d{2}$/.test(row.month) && Boolean(token2) && token2 !== token)
  page = await (await get(`/zalozenie/${token2}`)).text()
  keep('founding-progress.html', page)
  page = plain(page)
  check('founding: both links open it, and the founder reads where it stands and our message', page.includes('Priebeh založenia') && page.includes('zmluva vznikla') && (await get(base)).status === 200)
  check('founding: the founder never sees the risk group', !page.includes('Riziková skupina') && !page.includes('štandardné'))

  officer = await freshAdmin()
  for (const to of ['ordered', 'signing', 'filed']) {
    res = await officer.post(`/ucto/zalozenia/${row.id}/stav`, { na: to, poznamka: '' })
  }
  row = await db.prepare('SELECT * FROM foundings WHERE id = ?').bind(row.id).first()
  check('founding: the formation moves on step by step to the filing', res.status === 303 && row.status === 'filed')
  await officer.post(`/ucto/zalozenia/${row.id}/vyzva`, { text: 'TEST-ONLY prosíme o súhlas vlastníka so sídlom' })
  await officer.post(`/ucto/zalozenia/${row.id}/vyzva`, { text: 'TEST-ONLY druhá výzva' })
  res = await officer.post(`/ucto/zalozenia/${row.id}/odstupit`, { poznamka: 'TEST-ONLY bez súčinnosti' })
  row = await db.prepare('SELECT * FROM foundings WHERE id = ?').bind(row.id).first()
  check('founding: two calls are counted, and withdrawing waits the contract’s 30 days', row.calls === 2 && res.status === 409 && row.status === 'filed')
  res = await officer.post(`/ucto/zalozenia/${row.id}/registracia`, { ico: '55012345', vznik: '' })
  check('founding: a company of another name in the register is not taken for it', res.status === 422 && (await db.prepare('SELECT status FROM foundings WHERE id = ?').bind(row.id).first()).status === 'filed')
  const welcomeBefore = (await sent()).length
  const leastLoaded = await leastLoadedAccountant(db)
  res = await officer.post(`/ucto/zalozenia/${row.id}/registracia`, { ico: '56677774', vznik: '' })
  await settle()
  row = await db.prepare('SELECT * FROM foundings WHERE id = ?').bind(row.id).first()
  const company = await db.prepare('SELECT * FROM companies WHERE id = ?').bind(row.company_id).first()
  const tariff = JSON.parse((await db.prepare('SELECT data FROM billing_tariffs WHERE company_id = ?').bind(row.company_id).first()).data)
  check(
    'founding: written in the register, the company is made from the register with the founder as owner, the deposit and no free month',
    res.status === 303 && row.status === 'registered' && company?.name === 'TEST-ONLY Founded Nova s. r. o.' && company.founding_id === row.id && company.prepaid_cents === 54_900 && tariff.firstMonthFree === false &&
      Boolean(await db.prepare("SELECT 1 AS x FROM members m JOIN users u ON u.id = m.user_id WHERE m.company_id = ? AND m.role = 'owner' AND u.email = 'zakladatel@founding.test'").bind(company.id).first()) &&
      (await sent()).slice(welcomeBefore).some((m) => m.to.toLowerCase() === 'zakladatel@founding.test' && m.text.includes('/app/vstup?t=')),
  )
  check('founding: the new company goes to the accountant with the fewest clients, with nobody asked', Boolean(leastLoaded) && company?.accountant_id === leastLoaded, `${leastLoaded} ${company?.accountant_id}`)

  // The company in the app: it approves the contract (§ 64), and its deposit waits for the commitment's last months.
  await checkFoundingCompany({ db, files, get, post, settle, sent, client: as((await signIn('zakladatel@founding.test')).cookie), companyId: company.id, foundingId: row.id, nowS, freshAdmin, purgeFoundings, keep })
}

/** The company's own side, signed in by the caller: the approval, and an application that lapses and is forgotten. */
async function checkFoundingCompany({ db, files, get, post, settle, sent, client, companyId, foundingId, nowS, freshAdmin, purgeFoundings, keep }) {
  const plain = (html) => html.replace(/ /g, ' ')
  let res = await client.get('/app')
  let page = plain(await res.text())
  check('founding: the company’s owner is asked first to approve the contract', res.status === 200 && page.includes('Schváľte zmluvu za firmu') && page.includes('href="/app/zalozenie"'))
  res = await client.get('/app/zalozenie')
  page = await res.text()
  keep('founding-approve.html', page)
  page = plain(page)
  check('founding: the approval page shows the contract as signed and the deposit kept for the last bills', res.status === 200 && page.includes('Kaucia na posledné faktúry') && page.includes('549,00 €') && page.includes('Zmluva o zabezpečení založenia'))
  res = await client.post('/app/zalozenie/schvalit', {})
  check('founding: approving needs the tick', res.status === 303 && !(await db.prepare('SELECT approved_at FROM foundings WHERE id = ?').bind(foundingId).first()).approved_at)
  res = await client.post('/app/zalozenie/schvalit', { suhlas: '1' })
  check('founding: the owner approves it once, for the company', res.status === 303 && Boolean((await db.prepare('SELECT approved_at FROM foundings WHERE id = ?').bind(foundingId).first()).approved_at))
  page = plain(await (await client.get('/app')).text())
  check('founding: approved, it is no longer asked', !page.includes('Schváľte zmluvu za firmu'))
  page = plain(await (await client.get('/app/firma')).text())
  check('founding: before notice is given, the exit fee and the deposit are said', page.includes('odstupné') && page.includes('zvyšok kaucie'))

  // The deposit is held: this month's bill is the plan in full; an early end bills the exit fee and takes the deposit.
  let admin = await freshAdmin()
  page = plain(await (await admin.get('/ucto/fakturacia')).text())
  const section = (html) => html.slice(html.indexOf(`id="klient-${companyId}"`), html.indexOf('</li>', html.indexOf('bill__lines', html.indexOf(`id="klient-${companyId}"`))) + 400)
  check('deposit: held while the commitment runs, the plan billed from the first month', page.includes(`id="klient-${companyId}"`) && section(page).includes('Balík Štart') && !section(page).includes('Započítaná zábezpeka'))
  await db.prepare("UPDATE companies SET notice_at = ?, notice_by = NULL, ends_on = date('now', 'start of month', '+1 month', '-1 day') WHERE id = ?").bind(nowS, companyId).run()
  page = plain(await (await admin.get('/ucto/fakturacia')).text())
  check('exit fee: the company leaving early is billed twelve months and the deposit is taken off', section(page).includes('Odstupné podľa zmluvy o založení spoločnosti: 12 mesiacov') && section(page).includes('Započítaná zábezpeka') && section(page).includes('−549,00 €'), section(page).slice(0, 1500))
  await db.prepare('UPDATE companies SET notice_at = NULL, ends_on = NULL WHERE id = ?').bind(companyId).run()

  // An application nobody finished lapses when its link is next opened, and is forgotten a month later.
  await post('/zalozenie', { email: 'neskoro@founding.test', plan: 'start' }, { ip: '198.51.100.91' })
  await settle()
  const late = (await sent()).filter((m) => m.to === 'neskoro@founding.test').pop()
  const token = late?.text.match(/\/zalozenie\/([A-Za-z0-9_-]{43})/)?.[1]
  const lateRow = await db.prepare("SELECT id FROM foundings WHERE email = 'neskoro@founding.test'").first()
  await db.prepare('UPDATE foundings SET expires_at = ? WHERE id = ?').bind(nowS - 10, lateRow.id).run()
  const page2 = plain(await (await get(`/zalozenie/${token}`)).text())
  check('founding: an unfinished application lapses and says that nothing was paid', (await db.prepare('SELECT status FROM foundings WHERE id = ?').bind(lateRow.id).first()).status === 'lapsed' && page2.includes('nič neplatíte'))
  await db.prepare('UPDATE foundings SET updated_at = ? WHERE id = ?').bind(nowS - 31 * 86_400, lateRow.id).run()
  const forgotten = await purgeFoundings({ DB: db, FILES: files })
  check('founding: a lapsed application nobody checked is forgotten a month later, links and history too', forgotten >= 1 && !(await db.prepare('SELECT 1 AS x FROM foundings WHERE id = ?').bind(lateRow.id).first()) && !(await db.prepare('SELECT 1 AS x FROM founding_events WHERE founding_id = ?').bind(lateRow.id).first()) && !(await db.prepare('SELECT 1 AS x FROM founding_links WHERE founding_id = ?').bind(lateRow.id).first()))
  check('founding: the registered application stays with its company', Boolean(await db.prepare('SELECT 1 AS x FROM foundings WHERE id = ?').bind(foundingId).first()))
}
