import { existsSync, readFileSync } from 'node:fs'
import { appCopy, calc, config, copy, deadlines, format, ico, match, planRows, reader, rpo, xml } from '../.wrangler/tmp/units-bundle.mjs'
import { check, done } from './check.mjs'

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

done('units')
