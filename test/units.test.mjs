import { existsSync, readFileSync } from 'node:fs'
import { appCopy, bank, booking, calc, config, copy, decodePayBySquare, deadlines, demo, format, ico, invoices, match, paybysquare, planRows, reader, rpo, teamStore, xml } from '../.wrangler/tmp/units-bundle.mjs'
import { check, done } from './check.mjs'
import { createVerify, generateKeyPairSync } from 'node:crypto'

const NB = ' '

// The company ID
check('IČO with spaces', ico.normalizeIco('57 442 452') === '57442452')
check('IČO with a label', ico.normalizeIco('IČO: 57442452') === '57442452')
check('an old six-digit IČO is padded', ico.normalizeIco('123456') === '00123456')
check('too short is no IČO', ico.normalizeIco('1234') === null)
check('letters are no IČO', ico.normalizeIco('5744245a') === null)
check('the check digit of a real IČO', ico.icoLooksValid('57442452'))
check('a wrong check digit', !ico.icoLooksValid('57442453'))
check('another valid check digit', ico.icoLooksValid('12345679') && !ico.icoLooksValid('12345678'))
check('IČO printed in groups', ico.formatIco('57442452') === `57${NB}442${NB}452`)

// Money and Slovak typesetting
check('whole euros', format.formatEur(6900) === `69${NB}€`, format.formatEur(6900))
check('thousands and cents', format.formatEur(185280) === `1${NB}852,80${NB}€`, format.formatEur(185280))
check('nothing', format.formatEur(0) === `0${NB}€`)
check('a negative amount', format.formatEur(-500) === `−5${NB}€`)
check('one-letter words stay with the next', format.typeset('a v meste') === `a${NB}v${NB}meste`)
check('a number stays with its unit', format.typeset('za 69 € a 30 dokladov') === `za 69${NB}€ a${NB}30${NB}dokladov`)
check('the legal form stays whole', format.typeset('europio s. r. o.') === `europio s.${NB}r.${NB}o.`)
check('a section stays with its number', format.typeset('podľa § 7a') === `podľa §${NB}7a`)
check('a date stays whole', format.typeset('od 1. januára 2027').includes(`1.${NB}januára`))
check('a date in figures stays whole', format.typeset('do 25. 11. 2026').includes(`25.${NB}11.${NB}2026`) && format.typeset('do 25. 11.').includes(`25.${NB}11.`))
check('the register link searches the company by its IČO', config.REGISTER_URL === 'https://www.orsr.sk/hladaj_ico.asp?ICO=57442452&SID=0', config.REGISTER_URL)

// The pictures: every file a page names is on disk, in both cuts, and the stylesheet's fonts are there too
const publicDir = new URL('../public', import.meta.url).pathname
const pictures = Object.values(config.ART).filter(Boolean).flatMap((art) => [art.src, art.small?.src].filter(Boolean))
check('every picture a page names exists', pictures.length >= 5 && pictures.every((src) => existsSync(publicDir + src)), pictures.filter((src) => !existsSync(publicDir + src)).join(' '))
const css = readFileSync(publicDir + '/app.css', 'utf8')
const fonts = [...css.matchAll(/url\((\/fonts\/[^)]+)\)/g)].map((m) => m[1])
check('every font the stylesheet names exists', fonts.length >= 6 && fonts.every((src) => existsSync(publicDir + src)), fonts.join(' '))
check('the icons the page links when the logo exists', ['/favicon.ico', '/art/icon-192.png', '/art/icon-180.png', '/art/share.png'].every((src) => existsSync(publicDir + src)))

// The comparison
check('money as typed', calc.readMoney('5,20') === 520 && calc.readMoney('60') === 6000 && calc.readMoney('1 200 €') === 120000 && calc.readMoney('') === 0)
check('not money', calc.readMoney('abc') === null && calc.readMoney('1,234') === null && calc.readMoney('-5') === null)
check('a count as typed', calc.readCount('25', 1000) === 25 && calc.readCount('', 1000) === 0 && calc.readCount('-1', 1000) === null && calc.readCount('2000', 1000) === null)
const plan = (docs, people, vat) => calc.planFor(docs, people, vat)?.id ?? null
check('a small company without VAT is Štart', plan(25, 0, false) === 'start')
check('a VAT payer starts at Rast', plan(25, 0, true) === 'rast')
check('more documents need a larger plan', plan(31, 0, false) === 'rast' && plan(81, 0, false) === 'firma')
check('people on the payroll need a larger plan', plan(10, 1, false) === 'rast' && plan(10, 3, false) === 'firma')
check('beyond the largest plan is made to measure', plan(201, 0, false) === null && plan(10, 6, true) === null)
const example = calc.compare(calc.EXAMPLE)
check('the worked example adds up', example.kind === 'compared' && example.todayYear === 244000 && example.usYear === 97700 && example.difference === 146300 && example.plan.id === 'start', JSON.stringify(example))
check('nothing typed is nothing to compare', calc.compare({ monthly: 0, perDoc: 0, docs: 0, closing: 0, vatPayer: false, people: 0 }).kind === 'empty')
const dearer = calc.compare({ monthly: 3000, perDoc: 0, docs: 10, closing: 0, vatPayer: false, people: 0 })
check('being dearer is said as it is', dearer.kind === 'compared' && dearer.difference === 36000 - 97700)
check('our year is twelve months and the closing', config.PLANS.every((p) => calc.compare({ monthly: 100, perDoc: 0, docs: p.docs, closing: 0, vatPayer: p.vatPayer, people: p.people }).usYear === p.price * 1200 + config.CLOSING_PRICE * 100))

// The register
const answer = JSON.parse(readFileSync(new URL('./fixtures/rpo-europio.json', import.meta.url), 'utf8'))
const europio = rpo.readCompany('57442452', answer)
check('the register names the company', europio?.name === 'europio s. r. o.', JSON.stringify(europio))
check('the register gives the address', europio?.address === 'K lesu 2218/39A, 040 18 Košice - mestská časť Krásna', europio?.address)
check('an s. r. o. is known as one', europio?.isSro === true && europio?.terminated === null)
check('no result is no company', rpo.readCompany('12345679', { results: [] }) === null && rpo.readCompany('1', null) === null)
const renamed = rpo.readCompany('11111111', {
  results: [{ identifiers: [{ value: '11111111' }], fullNames: [{ value: 'Stará s. r. o.', validFrom: '2020-01-01', validTo: '2024-05-01' }, { value: 'Nová s. r. o.', validFrom: '2024-05-02' }], addresses: [] }],
})
check('the name in force is the one without an end', renamed?.name === 'Nová s. r. o.', renamed?.name)
check('an address without a street', rpo.formatAddress({ regNumber: 123, postalCodes: ['90001'], municipality: { value: 'Lozorno' } }) === 'Lozorno 123, 900 01')
const ended = rpo.readCompany('22222222', { results: [{ identifiers: [{ value: '22222222' }], fullNames: [{ value: 'Koniec, a. s.' }], termination: '2025-01-01', legalForms: [{ value: { code: '121', value: 'Akciová spoločnosť' } }] }] })
check('a company that ended says so, and an a. s. is no s. r. o.', ended?.terminated === '2025-01-01' && ended?.isSro === false)

// The texts say the figures of the plans
const start = config.PLANS[0]
check('the hero names the lowest price', copy.hero.price.includes(format.formatEur(start.price * 100)))
check('the first figure is the lowest price', copy.stats[0].value === format.formatEur(start.price * 100))
check('the closing price is the config one', copy.pricing.closing.includes(format.formatEur(config.CLOSING_PRICE * 100)))
check('every plan row is filled', config.PLANS.every((p) => Object.values(planRows(p)).every((v) => typeof v === 'string' && v.length > 0)))
const texts = []
const walk = (value) => (typeof value === 'string' ? texts.push(value) : Array.isArray(value) ? value.forEach(walk) : value && typeof value === 'object' ? Object.values(value).forEach(walk) : null)
walk(copy)
check('no dash in any text', texts.every((t) => !/[–—]/.test(t) && !/ - /.test(t)), texts.find((t) => /[–—]/.test(t) || / - /.test(t)))
check('no one-letter word ends a line', texts.every((t) => !/(^|\s)[vszkouaiVSZKOUAI] /.test(t)), texts.find((t) => /(^|\s)[vszkouaiVSZKOUAI] /.test(t)))
check('no straight quotes', texts.every((t) => !/"/.test(t)))

// ---------------------------------------------------------------------------------------------------------------
// The client's app: which document belongs to which payment
// ---------------------------------------------------------------------------------------------------------------

const pay = (over = {}) => ({ id: 'p', bookedOn: '2026-10-12', amountCents: -1240, party: 'KAVIAREN NA ROHU KOSICE', partyIban: null, vs: null, ...over })
const doc = (over = {}) => ({ id: 'd', kind: 'receipt', issuedOn: '2026-10-12', dueOn: null, totalCents: 1240, party: 'Kaviareň Na rohu s. r. o.', partyIban: null, vs: null, ...over })

check('days between two dates', match.daysBetween('2026-10-01', '2026-10-12') === 11 && match.daysBetween('2026-10-12', '2026-10-01') === -11 && match.daysBetween('2026-12-31', '2027-01-01') === 1)
check('a variable symbol without its leading zeros', match.normalizeVs('0002026118') === '2026118' && match.normalizeVs('VS 12') === '12' && match.normalizeVs(null) === '')
check('a card merchant and the company on its receipt are one name', match.namesSimilar('KAVIAREN NA ROHU KOSICE', 'Kaviareň Na rohu s. r. o.'))
check('two different names are not', !match.namesSimilar('Hostingový dom s. r. o.', 'Kaviareň Na rohu') && !match.namesSimilar('ALZA.CZ', null))
check('a legal form or a city alone makes no likeness', !match.namesSimilar('Prvá s. r. o. Bratislava', 'Druhá s.r.o., Bratislava'))
check('a receipt of the same day, amount and name: sure', match.score(pay(), doc()) === 80, match.score(pay(), doc()))
check('another amount: never', match.score(pay({ amountCents: -1241 }), doc()) === 0)
check('money the other way: never', match.score(pay({ amountCents: 1240 }), doc()) === 0)
check('an issued invoice is paid in, not out', match.score(pay({ amountCents: 1240 }), doc({ kind: 'invoice_out', party: 'Klient' })) > 0 && match.score(pay(), doc({ kind: 'invoice_out' })) === 0)
check('a receipt is settled a day before to five days after', match.score(pay({ bookedOn: '2026-10-17' }), doc()) > 0 && match.score(pay({ bookedOn: '2026-10-18' }), doc()) === 0 && match.score(pay({ bookedOn: '2026-10-11' }), doc()) > 0 && match.score(pay({ bookedOn: '2026-10-10' }), doc()) === 0)
const invoice = doc({ kind: 'invoice_in', issuedOn: '2026-09-01', dueOn: '2026-09-15', party: 'Hostingový dom s. r. o.', vs: '2026118', partyIban: 'SK8975000000000012345671' })
check('an invoice paid long after its date, by its symbol and account', match.score(pay({ bookedOn: '2026-11-10', party: 'Hostingový dom', vs: '2026118', partyIban: 'SK89 7500 0000 0000 1234 5671' }), { ...invoice, totalCents: 1240 }) === 140)
check('an invoice is paid up to sixty days after it was due', match.score(pay({ bookedOn: '2026-11-14' }), { ...invoice, totalCents: 1240 }) > 0 && match.score(pay({ bookedOn: '2026-11-15' }), { ...invoice, totalCents: 1240 }) === 0)
check('an invoice is not paid more than fifteen days before it was issued', match.score(pay({ bookedOn: '2026-08-17' }), { ...invoice, totalCents: 1240 }) > 0 && match.score(pay({ bookedOn: '2026-08-16' }), { ...invoice, totalCents: 1240 }) === 0)
check('a document without an amount pairs with nothing', match.score(pay(), doc({ totalCents: null })) === 0)
let decided = match.decide([pay()], [doc()])
check('one payment and its one document are paired without asking', decided.auto.length === 1 && decided.auto[0][0] === 'p' && decided.auto[0][1] === 'd')
decided = match.decide([pay({ id: 'p1' }), pay({ id: 'p2' })], [doc({ id: 'd1' }), doc({ id: 'd2' })])
check('two coffees of the same price on one day are never guessed', decided.auto.length === 0 && decided.suggest.get('p1')?.length === 2 && decided.suggest.get('p2')?.length === 2)
decided = match.decide([pay({ id: 'p1' }), pay({ id: 'p2', party: null })], [doc()])
check('one receipt and two payments it could be: offered, not chosen', decided.auto.length === 0 && decided.suggest.get('p1')?.[0] === 'd' && decided.suggest.get('p2')?.[0] === 'd')
decided = match.decide([pay()], [doc({ id: 'd1' }), doc({ id: 'd2', party: 'Iná kaviareň' })])
check('two documents for one payment: offered, not chosen', decided.auto.length === 0 && decided.suggest.get('p')?.[0] === 'd1')
decided = match.decide([pay({ party: 'POS 4410' })], [doc()])
check('a likely document that is not sure enough is offered', decided.auto.length === 0 && decided.suggest.get('p')?.[0] === 'd')
check('nothing is offered when nothing fits', match.decide([pay()], [doc({ totalCents: 999 })]).suggest.size === 0)
const monthly = (id, vs) => doc({ id, kind: 'invoice_out', issuedOn: '2026-10-01', dueOn: '2026-10-15', party: 'Agentúra Smer s. r. o.', vs, totalCents: 50000 })
decided = match.decide([pay({ id: 'p1', amountCents: 50000, bookedOn: '2026-10-12', party: 'Agentura Smer', vs: '20260002' })], [monthly('d1', '20260001'), monthly('d2', '20260002')])
check('of two invoices for the same amount, the payment with the number of one pays that one', decided.auto.length === 1 && decided.auto[0][1] === 'd2', JSON.stringify(decided))
decided = match.decide([pay({ id: 'p1', amountCents: 50000, bookedOn: '2026-10-12', party: 'Agentura Smer', vs: null })], [monthly('d1', '20260001'), monthly('d2', '20260002')])
check('without a number it is offered, not chosen', decided.auto.length === 0 && decided.suggest.get('p1')?.length === 2)
decided = match.decide([pay({ id: 'p1', amountCents: 50000, bookedOn: '2026-10-12', vs: '20260002' }), pay({ id: 'p2', amountCents: 50000, bookedOn: '2026-10-13', vs: '0020260002' })], [monthly('d1', '20260001'), monthly('d2', '20260002')])
check('two payments with the same number: neither is chosen', decided.auto.length === 0)

check('a payment between two accounts of the company needs no document', match.autoExempt({ amountCents: -100000, party: 'Firma', partyIban: 'SK31 1200 0000 1987 4263 7541', note: null }, ['SK3112000000198742637541']) === 'own')
check('a payment to the State Treasury needs none', match.autoExempt({ amountCents: -3300, party: 'Finančná správa SR', partyIban: 'SK3681800000007000123456', note: null }, []) === 'state' && match.isStateIban('SK36 8180 0000 0070 0012 3456'))
check('a fee of the bank needs none', match.autoExempt({ amountCents: -450, party: null, partyIban: null, note: 'Poplatok za vedenie účtu' }, []) === 'bank')
check('a supplier is never taken for the bank', match.autoExempt({ amountCents: -450, party: 'Poplatky s. r. o.', partyIban: 'SK8975000000000012345671', note: 'poplatok' }, []) === null)
check('an ordinary payment is for a person to decide', match.autoExempt({ amountCents: -1240, party: 'KAVIAREN', partyIban: null, note: 'Platba kartou' }, []) === null)

// The bank's statement and an e-invoice
check('amounts in cents, exactly', xml.toCents('12.40') === 1240 && xml.toCents('1 200,5') === 120050 && xml.toCents('-3.1') === -310 && xml.toCents('0.07') === 7 && xml.toCents('abc') === null && xml.toCents('') === null)
check('the payment symbols wherever a bank puts them', JSON.stringify(xml.symbols('/VS2026118/SS/KS0308')) === JSON.stringify({ vs: '2026118', ss: null, ks: '0308' }) && xml.symbols(null, 'VS: 123').vs === '123')
const camt = readFileSync(new URL('./fixtures/camt053.xml', import.meta.url), 'utf8')
const statements = xml.readStatement(camt)
const entries = statements?.[0]?.entries ?? []
check('a camt.053 statement is read', statements?.length === 1 && statements[0].iban === 'SK3112000000198742637541' && statements[0].closing?.cents === 486163 && statements[0].closing?.on === '2026-10-12')
check('a pending entry is left out, a batch is two payments', entries.length === 7 && !entries.some((e) => e.ref === 'REF006') && entries.filter((e) => e.ref.startsWith('REF007/')).map((e) => e.amountCents).join() === '-1000,-1500', entries.map((e) => e.ref).join())
const card = entries.find((e) => e.ref === 'REF001')
check('a card payment, its merchant and its sign', card?.card === true && card.amountCents === -1240 && card.party === 'KAVIAREN NA ROHU KOSICE' && card.bookedOn === '2026-10-12')
const transfer = entries.find((e) => e.ref === 'REF002')
check('a transfer with its account and symbols', transfer?.partyIban === 'SK8975000000000012345671' && transfer.vs === '2026118' && transfer.ks === '0308' && transfer.note === 'Faktúra 2026118')
const incoming = entries.find((e) => e.ref === 'REF003')
check('money in, the payer, a symbol in the structured reference and an entity', incoming?.amountCents === 120000 && incoming.party === 'Ján & syn s. r. o.' && incoming.vs === '20260005' && incoming.bookedOn === '2026-10-07')
const fee = entries.find((e) => e.amountCents === -450)
check('an entry without a reference from the bank gets one that stays the same', fee !== undefined && fee.ref.startsWith('h:') && xml.readStatement(camt)?.[0]?.entries.find((e) => e.amountCents === -450)?.ref === fee.ref)
check('a file that declares entities is refused, however good the rest', xml.readStatement(camt.replace('<Document', '<!DOCTYPE Document [<!ENTITY a "b">]>\n<Document')) === null && xml.readStatement(camt) !== null)
check('a file that is no statement is said to be none', xml.readStatement('<Invoice/>') === null && xml.readStatement('not xml at all') === null)
const ubl = readFileSync(new URL('./fixtures/ubl-invoice.xml', import.meta.url), 'utf8')
const received = xml.readInvoice(ubl, '57442452')
check('an e-invoice we received', received?.kind === 'invoice_in' && received.party === 'Hostingový dom s. r. o.' && received.partyIco === '36123456' && received.number === '2026118' && received.vs === '2026118')
check('its dates, amount, tax and account', received?.issuedOn === '2026-09-30' && received.dueOn === '2026-10-14' && received.totalCents === 5990 && received.vatCents === 998 && received.currency === 'EUR' && received.partyIban === 'SK8975000000000012345671')
const issued = xml.readInvoice(ubl, '36123456')
check('an e-invoice we issued names the customer', issued?.kind === 'invoice_out' && issued.party === 'Ukážková firma s. r. o.' && issued.partyIco === '57442452' && issued.partyIban === null)
check('an e-invoice pays the way its documents pair', match.score(pay({ bookedOn: '2026-10-10', amountCents: -5990, party: 'Hostingový dom s. r. o.', partyIban: 'SK8975000000000012345671', vs: '2026118' }), { id: 'x', ...received }) === 140)

// What a file is, and what the reader may write
const bytes = (...b) => new Uint8Array([...b, ...new Array(64).fill(0)])
const ascii = (text) => new TextEncoder().encode(text)
check('a photo, a PDF and XML are told by their bytes', reader.sniff(bytes(0xff, 0xd8, 0xff, 0xe0)) === 'jpeg' && reader.sniff(bytes(0x89, 0x50, 0x4e, 0x47)) === 'png' && reader.sniff(ascii('%PDF-1.7 ...')) === 'pdf' && reader.sniff(ascii('<?xml version="1.0"?><Invoice>')) === 'xml')
check('an iPhone photo and a WebP', reader.sniff(ascii('\0\0\0\x18ftypheic....')) === 'heic' && reader.sniff(ascii('RIFF\0\0\0\0WEBPVP8 ')) === 'webp')
check('anything else is refused, whatever its name', reader.sniff(ascii('<html><script>')) === null && reader.sniff(ascii('MZ\x90')) === null && reader.sniff(new Uint8Array(0)) === null)
const read = reader.readingFrom({ je_doklad: true, typ: 'blocek', druha_strana: ' Kaviareň ', ico_druhej_strany: '123 456', datum_vystavenia: '2026-10-12', suma_celkom: '12,40', dph_celkom: '2.07', mena: 'eur' })
check('what the reader wrote, checked field by field', read?.kind === 'receipt' && read.party === 'Kaviareň' && read.partyIco === '00123456' && read.totalCents === 1240 && read.vatCents === 207 && read.currency === 'EUR')
check('a picture that is no document is none', reader.readingFrom({ je_doklad: false, suma_celkom: '10' }) === null)
const odd = reader.readingFrom({ je_doklad: true, typ: 'neviem', datum_vystavenia: '12. 10. 2026', suma_celkom: '-5', iban_druhej_strany: 'xx', mena: 'eura' })
check('what is not what it should be is left out', odd?.kind === 'other' && odd.issuedOn === null && odd.totalCents === null && odd.partyIban === null && odd.currency === null)

// The app's words
check('Slovak counting', appCopy.plural(1, 'doklad', 'doklady', 'dokladov') === 'doklad' && appCopy.plural(3, 'doklad', 'doklady', 'dokladov') === 'doklady' && appCopy.plural(5, 'doklad', 'doklady', 'dokladov') === 'dokladov' && appCopy.plural(0, 'a', 'b', 'c') === 'c')
check('missing documents said right', appCopy.app.deadline.docsState(1) === `Chýba 1${NB}doklad` && appCopy.app.deadline.docsState(3) === `Chýbajú 3${NB}doklady` && appCopy.app.deadline.docsState(5) === `Chýba 5${NB}dokladov` && appCopy.app.deadline.docsState(0) === 'Máme všetko', [1, 3, 5].map(appCopy.app.deadline.docsState).join(' | '))
check('a merchant in capitals reads as a name', appCopy.readableName('KAVIAREN NA ROHU KOSICE') === 'Kaviaren Na Rohu Kosice' && appCopy.readableName('Hostingový dom s. r. o.') === 'Hostingový dom s. r. o.' && appCopy.readableName('D1') === 'D1')
check('days and months in Slovak', appCopy.dayName('2026-10-12', '2026-10-13') === `12.${NB}októbra` && appCopy.dayName('2027-03-31') === `31.${NB}marca 2027` && appCopy.monthName('2026-09-01', true) === 'September 2026')
check('amounts with their sign', appCopy.signed(120000) === `+1${NB}200${NB}€` && appCopy.signed(-1240) === `−12,40${NB}€`)

// What is due
let due = deadlines.deadlinesFor({ vatPayer: true }, '2026-10-13', new Map([['2026-10', 3]]))
check('a VAT payer in the middle of a month', due.map((d) => d.day).join() === '2026-10-25,2026-11-10,2027-03-31' && due[1].tone === 'amber' && due[0].tone === 'blue', due.map((d) => `${d.day} ${d.label}`).join(' | '))
due = deadlines.deadlinesFor({ vatPayer: false }, '2026-11-05', new Map([['2026-10', 2]]))
check('before the 10th the month before is still due', due.map((d) => d.day).join() === '2026-11-10,2026-12-10,2027-03-31' && due[0].state.includes('2'), due.map((d) => d.day).join())
due = deadlines.deadlinesFor({ vatPayer: false }, '2026-11-20', new Map([['2026-10', 1]]))
check('a month whose documents are late stays on the list', due[0].day === '2026-11-10' && due[0].tone === 'amber')
due = deadlines.deadlinesFor({ vatPayer: true }, '2027-01-05', new Map())
check('over the turn of a year', due.map((d) => d.day).join() === '2027-01-10,2027-01-25,2027-02-10,2027-03-31' && due.some((d) => d.label.includes('rok 2026')), due.map((d) => d.day).join())
due = deadlines.deadlinesFor({ vatPayer: true }, '2026-10-28', new Map())
check('after the 25th the next VAT return is due', due.some((d) => d.day === '2026-11-25' && d.label.includes('október')))

const appTexts = []
const walkApp = (value) => (typeof value === 'string' ? appTexts.push(value) : Array.isArray(value) ? value.forEach(walkApp) : value && typeof value === 'object' ? Object.values(value).forEach(walkApp) : null)
walkApp(appCopy.app)
walkApp(appCopy.EXEMPT_NAMES)
check('the app has no dash and no straight quote', appTexts.every((t) => !/[–—]/.test(t) && !/ - /.test(t) && !/"/.test(t)), appTexts.find((t) => /[–—"]/.test(t) || / - /.test(t)))
check('in the app no one-letter word ends a line', appTexts.every((t) => !/(^|\s)[vszkouaiVSZKOUAI] /.test(t)), appTexts.find((t) => /(^|\s)[vszkouaiVSZKOUAI] /.test(t)))


// Booking: the entry a document is booked with
const entry = (args) => JSON.stringify(booking.entryFor({ vatCents: null, vatPayer: false, vatDeduct: false, paidBy: 'bank', ...args }).map((l) => [l.md, l.d, l.cents, l.what]))
check('a received invoice of a VAT payer: the cost and the VAT against the supplier', entry({ kind: 'invoice_in', category: 'services', totalCents: 8640, vatCents: 1616, vatPayer: true, vatDeduct: true }) === JSON.stringify([['518', '321', 7024, 'cost'], ['343', '321', 1616, 'vat']]))
check('a company that is no VAT payer books the whole amount', entry({ kind: 'invoice_in', category: 'services', totalCents: 8640, vatCents: 1616, vatPayer: false, vatDeduct: true }) === JSON.stringify([['518', '321', 8640, 'cost']]))
check('VAT that is not deducted stays in the cost', entry({ kind: 'receipt', category: 'representation', totalCents: 1240, vatCents: 207, vatPayer: true, vatDeduct: false }) === JSON.stringify([['513', '221', 1240, 'cost']]))
check('a receipt paid from the owner\'s own money is owed to him', entry({ kind: 'receipt', category: 'material', totalCents: 890, paidBy: 'private' }) === JSON.stringify([['501', '365', 890, 'cost']]))
check('a receipt paid in cash comes from the cash box', entry({ kind: 'receipt', category: 'fuel', totalCents: 6418, paidBy: 'cash' }) === JSON.stringify([['501', '211', 6418, 'cost']]))
check('an issued invoice of a VAT payer: revenue and the VAT owed', entry({ kind: 'invoice_out', category: 'sales', totalCents: 123000, vatCents: 23000, vatPayer: true }) === JSON.stringify([['311', '602', 100000, 'revenue'], ['311', '343', 23000, 'vat']]))
check('an account the accountant chose wins over the category', entry({ kind: 'invoice_in', category: 'services', totalCents: 1000, account: '501' }) === JSON.stringify([['501', '321', 1000, 'cost']]))
check('an account that is no account is ignored', entry({ kind: 'invoice_in', category: 'services', totalCents: 1000, account: 'abc' }) === JSON.stringify([['518', '321', 1000, 'cost']]))
check('nothing is proposed without an amount, a category, or for revenue on a cost', entry({ kind: 'invoice_in', category: null, totalCents: 1000 }) === '[]' && entry({ kind: 'invoice_in', category: 'services', totalCents: null }) === '[]' && entry({ kind: 'invoice_in', category: 'sales', totalCents: 1000 }) === '[]' && entry({ kind: 'other', category: 'services', totalCents: 1000 }) === '[]')
check('VAT larger than the amount is held to the amount', entry({ kind: 'invoice_in', category: 'services', totalCents: 1000, vatCents: 5000, vatPayer: true, vatDeduct: true }) === JSON.stringify([['518', '321', 0, 'cost'], ['343', '321', 1000, 'vat']]))
check('an issued invoice is offered revenue only', JSON.stringify(booking.categoriesFor('invoice_out')) === JSON.stringify(['sales', 'sales_goods']) && !booking.categoriesFor('receipt').includes('sales'))
check('a supplier is known by its IČO', booking.supplierKey('36 123 456', 'Hostingový dom s. r. o.') === 'ico:36123456')
check('or by the words of its name, whatever their order', booking.supplierKey(null, 'Papiernictvo Pero') !== null && booking.supplierKey(null, 'Papiernictvo Pero') === booking.supplierKey('', 'PERO papiernictvo'), booking.supplierKey(null, 'Papiernictvo Pero'))
check('or by nothing', booking.supplierKey(null, null) === null)
const docA = { kind: 'receipt', totalCents: 1240, number: null, party: 'Kaviareň Na rohu', partyIco: '50123456', issuedOn: '2026-10-12' }
check('the same receipt twice is a suspected duplicate', booking.sameDocument(docA, { ...docA }))
check('the same number and amount is one', booking.sameDocument({ ...docA, number: '2026/118', partyIco: null, party: 'A' }, { ...docA, number: '2026118', partyIco: null, party: 'B' }))
check('another amount, another day, or another number is not', !booking.sameDocument(docA, { ...docA, totalCents: 1250 }) && !booking.sameDocument(docA, { ...docA, issuedOn: '2026-10-11' }) && !booking.sameDocument({ ...docA, number: '1' }, { ...docA, number: '2' }))
check('a day typed the Slovak way', booking.dayOfText('11. 10. 2026') === '2026-10-11' && booking.dayOfText('1.2.2027') === '2027-02-01' && booking.dayOfText('2026-10-11') === '2026-10-11')
check('a day that does not exist is none', booking.dayOfText('31. 2. 2026') === null && booking.dayOfText('zajtra') === null && booking.dayOfText('11. 10. 1999') === null)
check('an empty day is empty', booking.dayOfText('  ') === '')
check('a day written back the Slovak way', booking.textDay('2026-10-01') === '1. 10. 2026')

// The export for the accountant's program
check('a cell that Excel would run is made text', teamStore.csvCell('=HYPERLINK("x")') === `"'=HYPERLINK(""x"")"` && teamStore.csvCell('+421') === "'+421" && teamStore.csvCell('@a') === "'@a")
check('a negative amount stays a number', teamStore.csvCell('-12,40') === '-12,40')
check('a cell never splits the row', teamStore.csvCell('a;b\nc') === 'a,b c')
check('cents as Slovak Excel reads them', teamStore.csvMoney(1240) === '12,40' && teamStore.csvMoney(-5) === '-0,05' && teamStore.csvMoney(100000) === '1000,00' && teamStore.csvMoney(null) === '')
check('a client who did not pay is told apart from a receipt paid in cash', teamStore.paidByOf({ paidPrivately: false, kind: 'invoice_in' }, false) === 'unpaid' && teamStore.paidByOf({ paidPrivately: false, kind: 'receipt' }, false) === 'cash' && teamStore.paidByOf({ paidPrivately: true, kind: 'receipt' }, false) === 'private' && teamStore.paidByOf({ paidPrivately: true, kind: 'receipt' }, true) === 'bank')
check('an inbox code is eight letters and digits that cannot be mistaken', /^[a-hjkmnp-z2-9]{8}$/.test(teamStore.inboxCode()))

// Invoices the client issues
check('an amount typed the Slovak way', invoices.centsOf('12,40') === 1240 && invoices.centsOf('1 200') === 120000 && invoices.centsOf('1 200,5 €') === 120050 && invoices.centsOf('12.5') === 1250 && invoices.centsOf('-5') === -500)
check('an empty amount is none, a wrong one is no amount', invoices.centsOf(' ') === null && Number.isNaN(invoices.centsOf('12,345')) && Number.isNaN(invoices.centsOf('dvanásť')))
check('a quantity in thousandths', invoices.milliOf('2,5') === 2500 && invoices.milliOf('0,25') === 250 && invoices.milliOf('3') === 3000 && invoices.milliOf('') === null && Number.isNaN(invoices.milliOf('-1')))
check('a line is quantity times price, to the cent', invoices.lineBase(2500, 3333) === 8333 && invoices.lineBase(1000, 4500) === 4500)
const sums = invoices.totalsOf([{ baseCents: 40000, vatRate: 23 }, { baseCents: 10500, vatRate: 23 }, { baseCents: 1000, vatRate: 5 }], true)
check('VAT is counted per rate, the highest rate first', JSON.stringify(sums.rates) === JSON.stringify([{ rate: 23, base: 50500, vat: 11615 }, { rate: 5, base: 1000, vat: 50 }]) && sums.base === 51500 && sums.vat === 11665 && sums.total === 63165, JSON.stringify(sums))
check('VAT is rounded once per rate, not per line', invoices.totalsOf([{ baseCents: 3, vatRate: 23 }, { baseCents: 3, vatRate: 23 }], true).vat === 1)
check('a company that is no VAT payer adds no VAT', JSON.stringify(invoices.totalsOf([{ baseCents: 40000, vatRate: 23 }], false)) === JSON.stringify({ base: 40000, vat: 0, total: 40000, rates: [{ rate: 0, base: 40000, vat: 0 }] }))
check('an invoice number is the year and its order, and its variable symbol', invoices.invoiceNumber(2026, 1) === '20260001' && invoices.invoiceNumber(2026, 123) === '20260123' && invoices.invoiceNumber(2026, 10000) === '202610000')
check('an IBAN is known with or without spaces', invoices.isIban('SK31 1200 0000 1987 4263 7541') && invoices.isIban('sk3112000000198742637541') && !invoices.isIban('1234/0900') && invoices.plainIban('sk31 1200 0000 1987 4263 7541') === 'SK3112000000198742637541')
check('an IBAN with a typo is caught by its check digits', !invoices.isIban('SK31 1200 0000 1987 4263 7542') && !invoices.isIban('SK13 1200 0000 1987 4263 7541') && invoices.isIban('CZ65 0800 0000 1920 0014 5399') && invoices.isIban('DE89 3704 0044 0532 0130 00'))
const lineMessages = { line: (n) => `riadok ${n}`, none: 'žiadny riadok' }
const form = (lines) => ({ customerName: 'Agentúra Smer s. r. o.', customerAddress: '', customerIco: '', customerDic: '', customerIcdph: '', customerEmail: '', issued: '1. 10. 2026', delivered: '1. 10. 2026', due: '15. 10. 2026', iban: '', note: '', lines })
const blank = { description: '', quantity: '', unit: 'ks', price: '', vat: '23' }
const readLines = invoices.linesOf(form([{ description: 'Návrh loga', quantity: '', unit: 'ks', price: '400', vat: '23' }, blank, { description: 'Konzultácia', quantity: '2,5', unit: 'hod', price: '35', vat: '5' }]), true, lineMessages)
check("empty lines are left out and the rest numbered again", readLines.error === null && readLines.lines.length === 2 && readLines.lines[1].position === 2 && readLines.lines[0].quantityMilli === 1000 && readLines.lines[1].baseCents === 8750)
check('a line without a description, a price or with a rate that is none names its number', invoices.linesOf(form([{ ...blank, description: 'A', price: '10' }, { ...blank, description: 'B', price: 'x' }]), true, lineMessages).error === 'riadok 2' && invoices.linesOf(form([{ ...blank, description: 'A', price: '10', vat: '7' }]), true, lineMessages).error === 'riadok 1' && invoices.linesOf(form([{ ...blank, price: '10' }]), true, lineMessages).error === 'riadok 1')
check('an invoice without a line is refused', invoices.linesOf(form([blank, blank]), true, lineMessages).error === 'žiadny riadok')
check('a company that is no VAT payer writes no rate, and a unit that is none is dropped', JSON.stringify(invoices.linesOf(form([{ ...blank, description: 'A', price: '10', vat: '7', unit: 'sud' }]), false, lineMessages).lines.map((l) => [l.vatRate, l.unit])) === JSON.stringify([[0, null]]))
const valueMessages = { customerName: 'name', customerEmail: 'email', customerIco: 'ico', issued: 'issued', delivered: 'delivered', due: 'due', iban: 'iban', lines: 'lines', form: 'form' }
const errorsOf = (changes) => Object.keys(invoices.checkValues({ ...form([]), ...changes }, booking.dayOfText, valueMessages)).join(',')
check('a correct invoice has no error', errorsOf({}) === '')
check('a due day before the day of issue is refused', errorsOf({ due: '30. 9. 2026' }) === 'due')
check('a customer, an email, an IČO, an IBAN and the days are checked', errorsOf({ customerName: 'A', customerEmail: 'x@', customerIco: '123', iban: 'SK12', issued: 'zajtra', delivered: '' }) === 'customerName,customerEmail,customerIco,issued,delivered,iban')
check('an invoice is a draft, paid, overdue or waiting', invoices.stateOf({ status: 'draft', paidOn: null, dueOn: '2026-10-01' }, '2026-10-13') === 'draft' && invoices.stateOf({ status: 'issued', paidOn: '2026-10-12', dueOn: '2026-10-01' }, '2026-10-13') === 'paid' && invoices.stateOf({ status: 'issued', paidOn: null, dueOn: '2026-10-12' }, '2026-10-13') === 'overdue' && invoices.stateOf({ status: 'issued', paidOn: null, dueOn: '2026-10-13' }, '2026-10-13') === 'unpaid')

// The e-invoice is read back as the invoice it is, by us and by the customer
const seller = { id: 'c', createdAt: 0, name: 'Ukážková firma s. r. o.', ico: '57442452', dic: '2122222222', icdph: 'SK2122222222', address: 'Hlavná 1, 811 01 Bratislava', registerLine: null, vatPayer: true, plan: 'rast', inbox: 'abc', accountantId: null, accountantName: null, accountantEmail: null, note: null, demo: false, invoiceIban: null, invoiceDueDays: 14, invoiceFooter: null }
const stored = { id: 'i', number: '20260006', status: 'issued', customerName: 'Smer & <Syn> s. r. o.', customerIco: '50123456', customerDic: '2120000000', customerIcdph: 'SK2120000000', customerAddress: 'Námestie 2, Košice', customerEmail: null, issuedOn: '2026-10-01', deliveredOn: '2026-10-01', dueOn: '2026-10-15', note: 'Ďakujeme.', baseCents: 0, vatCents: 0, totalCents: 0, token: 't', documentId: null, iban: 'SK31 1200 0000 1987 4263 7541', sentAt: null, remindedAt: null, createdAt: 0, createdByName: null, paidOn: null }
const ublLines = readLines.lines.concat([{ position: 3, description: 'Zľava', quantityMilli: 1000, unit: 'ks', unitCents: -1000, vatRate: 23, baseCents: -1000 }])
const issuedUbl = invoices.ublOf(stored, ublLines, seller)
const ours = xml.readInvoice(issuedUbl, seller.ico)
const theirs = xml.readInvoice(issuedUbl, stored.customerIco)
check('our e-invoice reads back as issued by us, to its customer', ours?.kind === 'invoice_out' && ours.party === stored.customerName && ours.partyIco === '50123456' && ours.number === '20260006' && ours.vs === '20260006', JSON.stringify(ours))
check('with its sums and days', ours?.totalCents === 39000 + 8750 + Math.round(39000 * 0.23) + Math.round(8750 * 0.05) && ours.vatCents === Math.round(39000 * 0.23) + Math.round(8750 * 0.05) && ours.issuedOn === '2026-10-01' && ours.dueOn === '2026-10-15', JSON.stringify(ours))
check('the customer reads it as received, from us, with our account', theirs?.kind === 'invoice_in' && theirs.party === seller.name && theirs.partyIco === seller.ico && theirs.partyIban === 'SK3112000000198742637541', JSON.stringify(theirs))
check('a discount keeps its price positive and its quantity negative', issuedUbl.includes('<cbc:InvoicedQuantity unitCode="C62">-1</cbc:InvoicedQuantity><cbc:LineExtensionAmount currencyID="EUR">-10.00</cbc:LineExtensionAmount>') && issuedUbl.includes('<cbc:PriceAmount currencyID="EUR">10.00</cbc:PriceAmount>'))
check('a Slovak company is addressed by its DIČ in Peppol', issuedUbl.includes('<cbc:EndpointID schemeID="0245">2122222222</cbc:EndpointID>') && issuedUbl.includes('<cbc:EndpointID schemeID="0245">2120000000</cbc:EndpointID>'))
check('rates above nought are standard, VAT identifiers of both sides are there', issuedUbl.includes('<cbc:ID>S</cbc:ID><cbc:Percent>23</cbc:Percent>') && issuedUbl.includes('SK2122222222') && issuedUbl.includes('SK2120000000'))
const noVat = invoices.ublOf({ ...stored, customerName: 'Kníhkupectvo' }, invoices.linesOf(form([{ ...blank, description: 'Kniha', price: '20' }]), false, lineMessages).lines, { ...seller, vatPayer: false })
check('a seller who is no VAT payer writes O with its reason, no rate and no VAT identifier', noVat.includes('<cbc:ID>O</cbc:ID><cbc:TaxExemptionReason>') && !noVat.includes('<cbc:Percent>') && !noVat.includes('SK2122222222') && !noVat.includes('SK2120000000') && xml.readInvoice(noVat, seller.ico)?.totalCents === 2000)
const exempt = invoices.ublOf(stored, [{ position: 1, description: 'Školenie', quantityMilli: 1000, unit: null, unitCents: 5000, vatRate: 0, baseCents: 5000 }], seller)
check('a VAT payer\'s supply at nought is exempt, with its reason', exempt.includes('<cbc:ID>E</cbc:ID><cbc:Percent>0</cbc:Percent><cbc:TaxExemptionReason>Oslobodené od DPH</cbc:TaxExemptionReason>'))

// PAY by square: what a bank's app reads from the QR code on an invoice
const square = paybysquare.payBySquare({ iban: 'SK31 1200 0000 1987 4263 7541', amountCents: 118080, vs: '20260006', due: '2026-10-15', name: 'Ukážková firma s. r. o.', note: 'Faktúra 20260006' })
const paid = square ? decodePayBySquare(square).payments[0] : null
check('a bank reads the account, the amount, the symbol and the due day', paid?.bankAccounts[0].iban === 'SK3112000000198742637541' && paid.amount === 1180.8 && paid.currencyCode === 'EUR' && paid.variableSymbol === '20260006' && paid.paymentDueDate === '20261015', JSON.stringify(paid))
check('and whom it pays, without accents that some banks cannot show', paid?.beneficiary?.name === 'Ukazkova firma s. r. o.' && paid.paymentNote === 'Faktura 20260006', JSON.stringify(paid?.beneficiary))
check('no QR code without something to pay or with an account that is no IBAN', paybysquare.payBySquare({ iban: 'SK3112000000198742637541', amountCents: 0, vs: '1', due: null, name: 'A', note: '' }) === null && paybysquare.payBySquare({ iban: 'SK3112000000198742637542', amountCents: 100, vs: '1', due: null, name: 'A', note: '' }) === null)
const picture = paybysquare.qrPicture(square ?? 'x')
check('the QR code is one path inside a quiet zone of four modules', picture.size >= 29 && (picture.size - 8 - 21) % 4 === 0 && /^(M\d+ \d+h\d+v1h-\d+z)+$/.test(picture.path) && picture.path.startsWith('M4 4h7'), picture.path.slice(0, 40))

// The bank by open banking: what a transaction of Enable Banking becomes, and the token its API is called with
const tx = (extra) => bank.entryOf({ entry_reference: 'r1', transaction_amount: { currency: 'EUR', amount: '12.40' }, credit_debit_indicator: 'DBIT', status: 'BOOK', booking_date: '2026-10-12', ...extra })
check('money out is negative, money in positive, whatever sign the bank wrote', tx({}).amountCents === -1240 && tx({ credit_debit_indicator: 'CRDT' }).amountCents === 1240 && tx({ transaction_amount: { currency: 'EUR', amount: '-12.40' }, credit_debit_indicator: undefined }).amountCents === -1240)
check('only what is booked is a payment', tx({ status: 'PDNG' }) === null && tx({ status: 'RJCT' }) === null && tx({ transaction_amount: { amount: '0.00' } }) === null)
const paidIn = tx({ credit_debit_indicator: 'CRDT', debtor: { name: 'europio s. r. o.' }, debtor_account: { iban: 'sk52 0200 0000 0047 1234 5670' }, creditor: { name: 'Ukážková firma' }, remittance_information: ['/VS20260007/SS/KS0308', 'Faktura 20260007'] })
check('money in names who sent it, and the Slovak symbols are read', paidIn.party === 'europio s. r. o.' && paidIn.partyIban === 'SK5202000000004712345670' && paidIn.vs === '20260007' && paidIn.ks === '0308', JSON.stringify(paidIn))
const byCard = tx({ remittance_information: ['Platba kartou BILLA KOSICE'], bank_transaction_code: { code: 'CCRD' } })
check('a card payment is named by its merchant', byCard.card && byCard.party === 'BILLA KOSICE', JSON.stringify(byCard))
check('a transaction without a reference gets a steady one', tx({ entry_reference: undefined }).ref === tx({ entry_reference: undefined }).ref && tx({ entry_reference: undefined }).ref.startsWith('h:'))
check('the day is the booking day, else the value day', tx({ booking_date: undefined, value_date: '2026-10-11' }).bookedOn === '2026-10-11' && tx({ booking_date: undefined }) === null)
check('the balance is the closing one, else the booked one', JSON.stringify(bank.balanceOf({ balances: [{ balance_type: 'ITAV', balance_amount: { amount: '9.00' } }, { balance_type: 'CLBD', balance_amount: { amount: '1234.56' }, reference_date: '2026-10-13' }] })) === JSON.stringify({ cents: 123456, on: '2026-10-13' }) && bank.balanceOf({ balances: [] }) === null)
const soonLink = { id: 'l', bank: 'Tatra banka', status: 'active', createdAt: 0, validUntil: 1_000_000 + 5 * 86400, syncedAt: null, error: null, accounts: [] }
check('the overview asks to renew ten days before a consent ends, and says when it ended', bank.noticeOf([soonLink], 1_000_000)?.kind === 'renew' && bank.noticeOf([{ ...soonLink, validUntil: 1_000_000 + 30 * 86400 }], 1_000_000) === null && bank.noticeOf([{ ...soonLink, status: 'expired' }], 1_000_000)?.kind === 'ended')
for (const type of ['pkcs8', 'pkcs1']) {
  const pair = generateKeyPairSync('rsa', { modulusLength: 2048, publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type, format: 'pem' } })
  const pasted = type === 'pkcs1' ? pair.privateKey.replace(/\n/g, '\\n') : pair.privateKey
  const token = await bank.bearer({ ENABLE_BANKING_APP: `app-${type}`, ENABLE_BANKING_KEY: pasted }, 1_800_000_000)
  const [h, p, sig] = token.split('.')
  const header = JSON.parse(Buffer.from(h, 'base64url').toString())
  const payload = JSON.parse(Buffer.from(p, 'base64url').toString())
  const valid = createVerify('RSA-SHA256').update(`${h}.${p}`).verify(pair.publicKey, Buffer.from(sig, 'base64url'))
  check(`the token for Enable Banking is signed with the application's key (${type === 'pkcs1' ? 'PKCS#1 pasted on one line' : 'PKCS#8'})`, valid && header.alg === 'RS256' && header.kid === `app-${type}` && payload.iss === 'enablebanking.com' && payload.aud === 'api.enablebanking.com' && payload.exp - payload.iat === 3600)
}

// The originals of the sample documents are real PDFs
const pdf = new TextDecoder().decode(demo.demoPdf(226, 360, [{ text: 'Papiernictvo Pero (Košice)', bold: true }, { text: 'SPOLU 8,90 EUR' }]))
const xrefAt = Number(pdf.match(/startxref\n(\d+)/)?.[1])
check('a sample original is a PDF whose table of contents is where it says', pdf.startsWith('%PDF-1.4') && pdf.slice(xrefAt, xrefAt + 4) === 'xref' && pdf.includes('(Papiernictvo Pero \\(Kosice\\)) Tj'))

done('units')
