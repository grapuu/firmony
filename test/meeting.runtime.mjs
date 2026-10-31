// A client won at a meeting in workerd (src/meeting/): the designated person starts it from the register on his phone,
// the director's phone joins by the link only his browser holds, the director fills in the declaration there, the
// designated person compares the identity document and photographs it, records the prepared checks and approves, both
// sign on paper, the client is made from it, and the director's phone goes into the app once. Both pages follow the
// same states. A misheard address that belongs to somebody signs nobody in.
import { check } from './check.mjs'

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new TextEncoder().encode('TEST-ONLY identity card, front, synthetic')])
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...new TextEncoder().encode('TEST-ONLY identity card, back, synthetic')])
const CONTRACT = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new TextEncoder().encode('TEST-ONLY photo of a signed paper contract, synthetic')])

const plain = (html) => html.replace(/[\u00a0\u202f]/g, ' ').replace(/&nbsp;/g, ' ')
const cookieOf = (res, name) => (res.headers.get('set-cookie') ?? '').split(/,(?=\s*[\w-]+=)/).map((c) => c.trim().split(';')[0]).find((c) => c.startsWith(`${name}=`)) ?? ''

/** The declaration as the director's phone sends it: the director alone owns the company, nothing abroad, no cash. */
const declaration = (name) => ({
  name, rc: '800303/0002', dob: '', address: 'Hlavná 20, 040 01 Košice', nationality: 'slovenská', citizenships: 'SK', residenceCountry: 'SK',
  idKind: 'op', idNumber: 'EB765432', pep: '0', kuv: 'self', activity: 'Vývoj softvéru', income: 'Tržby od zákazníkov', turnover: 'do-50',
  cash: '0', abroad: '0', abroadWhere: '', businessAtSeat: '1', businessCountries: 'SK', partnerCountries: 'SK', ownBehalf: '1', truthful: '1',
})

export async function checkMeetingRuntime({ db, files, get, as, freshAdminCookie, acc, sent, settle, nowS }) {
  const boss = await freshAdminCookie()
  const officer = as(boss)

  // ----------------------------------------------------------------------------------------------- the start
  check('meeting: nobody but the designated person starts one', (await acc.get('/ucto/stretnutie')).status === 404 && (await get('/ucto/stretnutie')).status === 303)
  let res = await officer.get('/ucto/stretnutie?ico=56633333')
  let page = plain(await res.text())
  check('meeting: the company and who acts for it come from the register', res.status === 200 && page.includes('TEST-ONLY Vlastná s. r. o.') && page.includes('value="Ing. Ján Vlastník"') && page.includes('Začať stretnutie') && page.includes('/ucto/zmluva-na-papier'))
  res = await officer.post('/ucto/stretnutie', { ico: '56633333', konatel: 'Niekto Iný', email: 'vlastnik@meeting.test', balik: 'start' })
  check('meeting: only a director the register names', res.status === 422)
  res = await officer.post('/ucto/stretnutie', { ico: '56633333', konatel: 'Ing. Ján Vlastník', email: 'lucia@firmony.test', balik: 'start' })
  check('meeting: started with an address of the team, refused', res.status === 422 && plain(await res.text()).includes('patrí Firmony alebo členovi tímu'))
  res = await officer.post('/ucto/stretnutie', { ico: '56633333', konatel: 'Ing. Ján Vlastník', email: 'Vlastnik@Meeting.test', balik: 'start' })
  const desk = res.headers.get('location') ?? ''
  const id = /^\/ucto\/stretnutie\/([0-9a-f-]{36})$/.exec(desk)?.[1] ?? ''
  const kept = cookieOf(res, '__Secure-firmony-meeting')
  const token = kept.split('=')[1] ?? ''
  let order = await db.prepare('SELECT * FROM orders WHERE id = ?').bind(id).first()
  check('meeting: started, the order kept as a paper one by its starter, the director\'s link only in his own browser', res.status === 303 && Boolean(id) && order?.meeting_by && order.aml_paper === 1 && order.person === 'Ing. Ján Vlastník' && order.email === 'vlastnik@meeting.test' && /^[A-Za-z0-9_-]{43}$/.test(token) && (res.headers.get('set-cookie') ?? '').includes(`Path=/ucto/stretnutie/${id}`))
  const deskAs = as(`${boss}; ${kept}`)
  page = plain(await (await deskAs.get(desk)).text())
  check('meeting: the desk shows the QR code of the director\'s link', page.includes('meet__qrcode') && page.includes('Nech si Ján naskenuje tento kód') && page.includes(`data-live="/ucto/stretnutie/${id}/stav"`) && page.includes('/live.js'))
  page = plain(await (await officer.get(desk)).text())
  check('meeting: another browser of his holds no link and offers a new one', !page.includes('meet__qrcode') && page.includes('Vytvoriť nový QR kód'))
  const state0 = await (await officer.get(`${desk}/stav`)).text()
  check('meeting: the state both phones ask for says nothing of a person', /^open:0::0:0:::0$/.test(state0) && !state0.includes('Ján'), state0)

  // ----------------------------------------------------------------------------------------------- the director's phone
  const phone = as('')
  res = await phone.get(`/objednavka/${token}`)
  page = plain(await res.text())
  check('meeting: the director\'s phone greets him and shows the declaration with the address he will sign in with', res.status === 200 && page.includes('Dobrý deň, Ján.') && page.includes(`action="/objednavka/${token}/stretnutie"`) && page.includes('vlastnik@meeting.test') && page.includes('value="Ing. Ján Vlastník"') && !page.includes('data-live='))
  const state1 = await (await officer.get(`${desk}/stav`)).text()
  check('meeting: the desk sees the phone has joined', state1 !== state0 && state1.startsWith('open:1:'))
  check('meeting: nothing of it is concluded online', (await phone.post(`/objednavka/${token}`, { plan: 'start', agree: '1' })).headers.get('location') === `/objednavka/${token}` && (await db.prepare('SELECT status FROM orders WHERE id = ?').bind(id).first()).status === 'open')
  res = await phone.post(`/objednavka/${token}/stretnutie`, { ...declaration('Ján Vlastník') })
  page = plain(await res.text())
  check('meeting: the declaration is of the person met, as the register writes the name', res.status === 422 && page.includes('Napíšte meno tak, ako ho uvádza obchodný register: Ing. Ján Vlastník.'))
  res = await phone.post(`/objednavka/${token}/stretnutie`, { ...declaration('Ing. Ján Vlastník'), truthful: '' })
  check('meeting: what is missing is said on the phone', res.status === 422)
  res = await phone.post(`/objednavka/${token}/stretnutie`, declaration('Ing. Ján Vlastník'))
  let dossier = await db.prepare('SELECT * FROM aml_dossiers WHERE order_id = ? ORDER BY sequence DESC').bind(id).first()
  const file = dossier ? await files.get(dossier.file_key) : null
  const text = file ? new TextDecoder().decode(await file.arrayBuffer()) : ''
  check('meeting: the declaration is kept as a file that says it was filled in at a meeting, without a qualified signature', res.status === 303 && dossier?.file_name === 'vyhlasenie-na-stretnuti.pdf' && dossier.file_type === 'pdf' && text.startsWith('%PDF-') && dossier.signer_name === 'Ing. Ján Vlastník')
  page = plain(await (await phone.get(`/objednavka/${token}`)).text())
  check('meeting: the phone now waits for the document, following the meeting', page.includes('Ukážte, prosím, občiansky preukaz') && page.includes(`data-live="/objednavka/${token}/stav"`) && page.includes('Opraviť údaje'))

  // ----------------------------------------------------------------------------------------------- the document
  page = plain(await (await deskAs.get(desk)).text())
  check('meeting: the desk shows the director\'s data in full to compare with the document', page.includes('800303/0002') && page.includes('EB765432') && page.includes('Totožnosť overená') && page.includes(`name="hash" value="${dossier.facts_hash}"`))
  res = await deskAs.form(`${desk}/doklad`, [['hash', dossier.facts_hash], ['predna', { name: 'predna.jpg', bytes: JPEG, type: 'image/jpeg' }], ['zadna', { name: 'zadna.png', bytes: PNG, type: 'image/png' }]])
  check('meeting: the comparison has to be confirmed', res.headers.get('location') === `${desk}?chyba=compared`)
  res = await deskAs.form(`${desk}/doklad`, [['hash', dossier.facts_hash], ['porovnane', '1'], ['predna', { name: 'predna.jpg', bytes: JPEG, type: 'image/jpeg' }]])
  check('meeting: an identity card has two sides', res.headers.get('location') === `${desk}?chyba=back`)
  res = await deskAs.form(`${desk}/doklad`, [['hash', dossier.facts_hash], ['porovnane', '1'], ['predna', { name: 'predna.jpg', bytes: JPEG, type: 'image/jpeg' }], ['zadna', { name: 'zadna.png', bytes: PNG, type: 'image/png' }]])
  const inPerson = await db.prepare('SELECT * FROM aml_in_person WHERE dossier_id = ?').bind(dossier.id).first()
  const identity = await db.prepare("SELECT * FROM aml_checks WHERE dossier_id = ? AND kind = 'identity'").bind(dossier.id).first()
  check('meeting: identified in person, the copies kept and the identity check recorded with the law it stands on', res.headers.get('location') === `${desk}?ok=overene` && inPerson?.facts_hash === dossier.facts_hash && Boolean(await files.head(inPerson.front_key)) && Boolean(await files.head(inPerson.back_key)) && identity?.result === 'clear' && identity.source.includes('§ 8 ods. 1 písm. a)') && identity.source.includes('***432'))
  res = await phone.post(`/objednavka/${token}/stretnutie`, declaration('Ing. Ján Vlastník'))
  check('meeting: after the comparison the phone changes the declaration no more', res.status === 303 && (await db.prepare('SELECT COUNT(*) AS n FROM aml_dossiers WHERE order_id = ?').bind(id).first()).n === 1)
  res = await officer.get(`/ucto/aml/spisy/${dossier.id}/doklad/predna`)
  check('meeting: the copy of the document opens for the designated person, as it was taken', res.status === 200 && res.headers.get('content-type') === 'image/jpeg' && (await res.arrayBuffer()).byteLength === JPEG.length)
  check('meeting: and for nobody else', (await acc.get(`/ucto/aml/spisy/${dossier.id}/doklad/predna`)).status === 404 && (await phone.get(`/ucto/aml/spisy/${dossier.id}/doklad/zadna`)).status !== 200)

  // ----------------------------------------------------------------------------------------------- the checks and the approval
  page = plain(await (await deskAs.get(desk)).text())
  check('meeting: the prepared checks are shown, nothing left to judge', page.includes('Zapísať kontroly a schváliť') && (page.match(/meet__check--(?:ready|recorded)/g) ?? []).length === 5 && !page.includes('Dokončiť v spise'), JSON.stringify((page.match(/meet__check meet__check--\w+[\s\S]*?meet__sub">[^<]*/g) ?? []).map((m) => m.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '))))
  res = await deskAs.post(`${desk}/schvalit`, { hash: dossier.facts_hash })
  check('meeting: PEP is his own word', res.headers.get('location') === `${desk}?chyba=pep`)
  res = await deskAs.post(`${desk}/schvalit`, { hash: dossier.facts_hash, pep: '1' })
  const decision = await db.prepare('SELECT * FROM aml_decisions WHERE dossier_id = ?').bind(dossier.id).first()
  const kinds = (await db.prepare('SELECT kind FROM aml_checks WHERE dossier_id = ? ORDER BY kind').bind(dossier.id).all()).results.map((r) => r.kind).join(',')
  check('meeting: one tap records every check and approves', res.headers.get('location') === `${desk}?ok=schvalene` && decision?.decision === 'approved' && decision.note.startsWith('Osobné stretnutie') && kinds === 'countries,eu-sanctions,identity,kuv,pep,un-sanctions', kinds)

  // ----------------------------------------------------------------------------------------------- the paper
  page = plain(await (await deskAs.get(desk)).text())
  check('meeting: the desk asks for the signed paper, with the address read back', page.includes('Fotka podpísanej zmluvy') && page.includes('value="vlastnik@meeting.test"') && page.includes('Ján je náš klient'))
  page = plain(await (await officer.get(`${desk}/zmluva`)).text())
  check('meeting: the contract to print carries the company and its terms', page.includes('Zmluva o vedení účtovníctva') && page.includes('TEST-ONLY Vlastná s. r. o.') && page.includes('Ing. Ján Vlastník') && page.includes('§ 8 ods. 1 písm. a)') && page.includes('cpaper--terms'))
  check('meeting: and blank for the drawer', (await officer.get('/ucto/zmluva-na-papier')).status === 200 && (await acc.get('/ucto/zmluva-na-papier')).status === 404)
  const start = /name="start"><option value="(\d{4}-\d{2})"/.exec(plain(await (await deskAs.get(desk)).text()))?.[1] ?? ''
  const contract = (extra) => [['zmluva', { name: 'zmluva.jpg', bytes: CONTRACT, type: 'image/jpeg' }], ['balik', 'start'], ['start', start], ['uctovnicka', ''], ['email', 'vlastnik@meeting.test'], ...extra]
  res = await deskAs.form(`${desk}/zmluva`, contract([]))
  check('meeting: both have to have signed', res.headers.get('location') === `${desk}?chyba=signed`)
  res = await deskAs.form(`${desk}/zmluva`, contract([['podpisana', '1']]).map(([k, v]) => (k === 'email' ? [k, 'ahoj@firmony.io'] : [k, v])))
  const ours = res.headers.get('location')
  res = await deskAs.form(`${desk}/zmluva`, contract([['podpisana', '1']]).map(([k, v]) => (k === 'email' ? [k, 'lucia@firmony.test'] : [k, v])))
  check('meeting: an address of the service or of the team is never the client\'s', ours === `${desk}?chyba=team` && res.headers.get('location') === `${desk}?chyba=team` && (await db.prepare('SELECT status FROM orders WHERE id = ?').bind(id).first()).status === 'open', `${ours} ${res.headers.get('location')}`)
  const before = (await sent()).length
  res = await deskAs.form(`${desk}/zmluva`, contract([['podpisana', '1']]).map(([k, v]) => (k === 'email' ? [k, 'Jan.Vlastnik@Meeting.test'] : [k, v])))
  await settle()
  order = await db.prepare('SELECT * FROM orders WHERE id = ?').bind(id).first()
  const company = order?.company_id ? await db.prepare('SELECT * FROM companies WHERE id = ?').bind(order.company_id).first() : null
  const owner = company ? await db.prepare("SELECT u.* FROM members m JOIN users u ON u.id = m.user_id WHERE m.company_id = ? AND m.role = 'owner'").bind(company.id).first() : null
  const mail = (await sent()).slice(before).filter((m) => m.to.toLowerCase() === 'jan.vlastnik@meeting.test')
  check('meeting: the client is made from the paper, its photo kept, the corrected address its owner\'s, the link by email', res.headers.get('location') === desk && order.status === 'accepted' && company?.terms_version === 'offline' && company.ico === '56633333' && owner?.email === 'jan.vlastnik@meeting.test' && owner.created_at === order.accepted_at && Boolean(order.paper_sha256) && Boolean(await files.head(order.paper_key)) && mail.length === 1)
  check('meeting: the declaration and the risk go with the company', Boolean(await db.prepare('SELECT 1 FROM declarations WHERE company_id = ?').bind(company.id).first()) && Boolean(await db.prepare('SELECT 1 FROM risks WHERE company_id = ?').bind(company.id).first()))
  res = await deskAs.form(`${desk}/zmluva`, contract([['podpisana', '1']]))
  check('meeting: a second tap makes nothing', res.status === 404 && (await db.prepare("SELECT COUNT(*) AS n FROM companies WHERE ico = '56633333'").first()).n === 1)

  // ----------------------------------------------------------------------------------------------- into the app
  page = plain(await (await phone.get(`/objednavka/${token}`)).text())
  check('meeting: the director\'s phone now offers the way in', page.includes('Ste naším klientom.') && page.includes(`action="/objednavka/${token}/vstup"`))
  res = await phone.post(`/objednavka/${token}/vstup`, {})
  const session = cookieOf(res, '__Host-firmony')
  check('meeting: one tap signs the phone in and offers to save a passkey', res.status === 303 && (res.headers.get('location') ?? '').startsWith('/app/rychle-prihlasenie') && Boolean(session))
  res = await phone.post(`/objednavka/${token}/vstup`, {})
  check('meeting: and only once', res.headers.get('location') === '/app/prihlasenie' && !cookieOf(res, '__Host-firmony'))
  const client = as(session)
  page = plain(await (await client.get('/app/zmluva')).text())
  res = await client.get('/app/zmluva/foto')
  check('meeting: the client finds the photo of the signed contract at the contract', page.includes('Fotka podpísanej zmluvy') && res.status === 200 && (await res.arrayBuffer()).byteLength === CONTRACT.length)
  const finalState = await (await officer.get(`${desk}/stav`)).text()
  page = plain(await (await officer.get(desk)).text())
  check('meeting: the desk sees him inside', finalState.endsWith(':1') && page.includes('Ján je vo Firmony.'))

  // ----------------------------------------------------------------------------------------------- a misheard address
  // A second meeting, whose address already belongs to somebody: the paper makes the client, the phone signs nobody in.
  await db.prepare("INSERT INTO users (id, created_at, email, name) VALUES ('meeting-other', ?, 'eva@meeting.test', 'TEST ONLY somebody else')").bind(nowS - 86400).run()
  res = await officer.post('/ucto/stretnutie', { ico: '56644444', konatel: 'Eva Druhá', email: 'eva@meeting.test', balik: 'start' })
  const desk2 = res.headers.get('location') ?? ''
  const id2 = desk2.split('/').pop()
  const kept2 = cookieOf(res, '__Secure-firmony-meeting')
  const token2 = kept2.split('=')[1] ?? ''
  const desk2As = as(`${boss}; ${kept2}`)
  await phone.get(`/objednavka/${token2}`)
  await phone.post(`/objednavka/${token2}/stretnutie`, { ...declaration('Eva Druhá'), rc: '855505/0009', idNumber: 'EC111222', kuv: 'self' })
  const d2 = await db.prepare('SELECT * FROM aml_dossiers WHERE order_id = ?').bind(id2).first()
  await desk2As.form(`${desk2}/doklad`, [['hash', d2?.facts_hash ?? ''], ['porovnane', '1'], ['predna', { name: 'p.jpg', bytes: JPEG, type: 'image/jpeg' }], ['zadna', { name: 'z.png', bytes: PNG, type: 'image/png' }]])
  page = plain(await (await desk2As.get(desk2)).text())
  check('meeting: beneficial owners the register cannot confirm are his own words', page.includes('Ako ste overili konečných užívateľov výhod'))
  res = await desk2As.post(`${desk2}/schvalit`, { hash: d2?.facts_hash ?? '', pep: '1', kuv: 'krátko' })
  check('meeting: in a sentence', res.headers.get('location') === `${desk2}?chyba=kuv`)
  res = await desk2As.post(`${desk2}/schvalit`, { hash: d2?.facts_hash ?? '', pep: '1', kuv: 'TEST ONLY: zápis v obchodnom registri, spoločníčka Eva Druhá; holding overený z jeho výpisu' })
  check('meeting: and approved with them', res.headers.get('location') === `${desk2}?ok=schvalene`)
  await desk2As.form(`${desk2}/zmluva`, [['zmluva', { name: 'zmluva.jpg', bytes: CONTRACT, type: 'image/jpeg' }], ['balik', 'start'], ['start', start], ['uctovnicka', ''], ['email', 'eva@meeting.test'], ['podpisana', '1']])
  const o2 = await db.prepare('SELECT * FROM orders WHERE id = ?').bind(id2).first()
  res = await phone.post(`/objednavka/${token2}/vstup`, {})
  check('meeting: an address that belonged to somebody before the meeting signs no phone into it', o2?.status === 'accepted' && res.headers.get('location') === '/app/prihlasenie' && !cookieOf(res, '__Host-firmony'))
  check('meeting: neither link opens any more once it was replaced', (await phone.get(`/objednavka/${'A'.repeat(43)}/stav`)).status === 404)
}
