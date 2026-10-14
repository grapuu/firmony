import { existsSync, readFileSync } from 'node:fs'
import {
  aml,
  appCopy,
  bank,
  bells,
  booking,
  calc,
  config,
  copy,
  decodePayBySquare,
  deadlines,
  demo,
  ending,
  fio,
  format,
  ico,
  invoices,
  ledger,
  ledgerStore,
  match,
  orderLinkMail,
  papers,
  paybysquare,
  planRows,
  reader,
  rpo,
  statements as stmts,
  teamStore,
  terms,
  vat,
  vatForm,
  vatStore,
  vatXml,
  xml,
  zip,
} from '../.wrangler/tmp/units-bundle.mjs'
import { validateXML } from 'xmllint-wasm'
import { crc32 as nodeCrc32 } from 'node:zlib'
import { check, done } from './check.mjs'
import { camtXml } from './pretend.mjs'
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
const pictures = Object.values(config.ART)
  .filter(Boolean)
  .flatMap((art) => [art.src, art.small?.src].filter(Boolean))
check('every picture a page names exists', pictures.length >= 5 && pictures.every((src) => existsSync(publicDir + src)), pictures.filter((src) => !existsSync(publicDir + src)).join(' '))
const css = readFileSync(publicDir + '/app.css', 'utf8')
const fonts = [...css.matchAll(/url\((\/fonts\/[^)]+)\)/g)].map((m) => m[1])
check('every font the stylesheet names exists', fonts.length >= 6 && fonts.every((src) => existsSync(publicDir + src)), fonts.join(' '))
check(
  'the icons the page links when the logo exists',
  ['/favicon.ico', '/art/icon-192.png', '/art/icon-180.png', '/art/share.png'].every((src) => existsSync(publicDir + src)),
)

// The comparison
check('money as typed', calc.readMoney('5,20') === 520 && calc.readMoney('60') === 6000 && calc.readMoney('1 200 €') === 120000 && calc.readMoney('') === 0)
check('not money', calc.readMoney('abc') === null && calc.readMoney('1,234') === null && calc.readMoney('-5') === null)
check('a count as typed', calc.readCount('25', 1000) === 25 && calc.readCount('', 1000) === 0 && calc.readCount('-1', 1000) === null && calc.readCount('2000', 1000) === null)
const plan = (docs, vat) => calc.planFor(docs, vat)?.id ?? null
const [first, second, third] = config.PLANS
check('a small company without VAT is Štart', plan(first.docs, false) === 'start')
check('a VAT payer starts at Rast', plan(10, true) === 'rast')
check('more documents need a larger plan', plan(first.docs + 1, false) === 'rast' && plan(second.docs + 1, false) === 'firma' && plan(second.docs + 1, true) === 'firma')
const withPeople = calc.compare({ monthly: 10000, perDoc: 0, docs: 10, closing: 0, vatPayer: false, people: 2 })
check(
  'payroll is added for each person',
  withPeople.kind === 'compared' && withPeople.usYear === (first.price + 2 * config.PAYROLL_PRICE) * 1200 + config.CLOSING_PRICE * 100,
  JSON.stringify(withPeople),
)
check('beyond the largest plan is made to measure', plan(third.docs + 1, false) === null && plan(third.docs + 1, true) === null)
const example = calc.compare(calc.EXAMPLE)
check(
  'the worked example adds up',
  example.kind === 'compared' &&
    example.todayYear === 212800 &&
    example.usYear === first.price * 1200 + config.CLOSING_PRICE * 100 &&
    example.difference === 212800 - example.usYear &&
    example.plan.id === 'start',
  JSON.stringify(example),
)
check('nothing typed is nothing to compare', calc.compare({ monthly: 0, perDoc: 0, docs: 0, closing: 0, vatPayer: false, people: 0 }).kind === 'empty')
const dearer = calc.compare({ monthly: 3000, perDoc: 0, docs: 10, closing: 0, vatPayer: false, people: 0 })
check('being dearer is said as it is', dearer.kind === 'compared' && dearer.difference === 36000 - (first.price * 1200 + config.CLOSING_PRICE * 100))
check(
  'our year is twelve months and the closing',
  config.PLANS.every((p) => calc.compare({ monthly: 100, perDoc: 0, docs: p.docs, closing: 0, vatPayer: p.vatPayer, people: 0 }).usYear === p.price * 1200 + config.CLOSING_PRICE * 100),
)
// His word of 13 October 2026: at least 60 % margin. What a client costs besides the accountant (the bank, the
// digital postman, the reading, the servers: estimates until the quotes come) and a reserve of 2 % for our errors.
const TECH = { start: 4.25, rast: 4.33, firma: 6.52 }
const margin = (price, cost) => (price - cost - 0.02 * price) / price
check(
  'every plan leaves at least 60 % after the accountant and the rest',
  config.PLANS.every((p) => margin(p.price, config.ACCOUNTANT_PAY[p.id] + TECH[p.id]) >= 0.6),
  config.PLANS.map((p) => margin(p.price, config.ACCOUNTANT_PAY[p.id] + TECH[p.id]).toFixed(3)).join(' '),
)
check('payroll and the closing leave at least 60 % too', margin(config.PAYROLL_PRICE, config.ACCOUNTANT_PAY.payroll + 0.3) >= 0.6 && margin(config.CLOSING_PRICE, config.ACCOUNTANT_PAY.closing) >= 0.6)

// The register
const answer = JSON.parse(readFileSync(new URL('./fixtures/rpo-europio.json', import.meta.url), 'utf8'))
const europio = rpo.readCompany('57442452', answer)
check('the register names the company', europio?.name === 'europio s. r. o.', JSON.stringify(europio))
check('the register gives the address', europio?.address === 'K lesu 2218/39A, 040 18 Košice - mestská časť Krásna', europio?.address)
check('an s. r. o. is known as one', europio?.isSro === true && europio?.terminated === null)
check('no result is no company', rpo.readCompany('12345679', { results: [] }) === null && rpo.readCompany('1', null) === null)
const renamed = rpo.readCompany('11111111', {
  results: [
    {
      identifiers: [{ value: '11111111' }],
      fullNames: [
        { value: 'Stará s. r. o.', validFrom: '2020-01-01', validTo: '2024-05-01' },
        { value: 'Nová s. r. o.', validFrom: '2024-05-02' },
      ],
      addresses: [],
    },
  ],
})
check('the name in force is the one without an end', renamed?.name === 'Nová s. r. o.', renamed?.name)
check('an address without a street', rpo.formatAddress({ regNumber: 123, postalCodes: ['90001'], municipality: { value: 'Lozorno' } }) === 'Lozorno 123, 900 01')
const ended = rpo.readCompany('22222222', {
  results: [{ identifiers: [{ value: '22222222' }], fullNames: [{ value: 'Koniec, a. s.' }], termination: '2025-01-01', legalForms: [{ value: { code: '121', value: 'Akciová spoločnosť' } }] }],
})
check('a company that ended says so, and an a. s. is no s. r. o.', ended?.terminated === '2025-01-01' && ended?.isSro === false)

// The register's directors and the line of the register, for the contract
check(
  'the register line is written as a contract writes it',
  europio?.registerLine === 'Obchodný register Mestského súdu Košice, oddiel Sro, vložka č. 64897/V' && europio?.rpoId === '19031841',
  JSON.stringify(europio),
)
check(
  'a district court is in the genitive too',
  rpo.registerLineOf({ registrationOffices: [{ value: 'Okresný súd Žilina' }], registrationNumbers: [{ value: 'Sro/1234/L' }] }) ===
    'Obchodný register Okresného súdu Žilina, oddiel Sro, vložka č. 1234/L',
)
check('without a court or a number there is no line', rpo.registerLineOf({ registrationOffices: [], registrationNumbers: [{ value: 'Sro/1/V' }] }) === null)
const directors = rpo.readDirectors(
  {
    statutoryBodies: [
      { stakeholderType: { value: 'Konateľ' }, personName: { formatedName: 'Christian Juhás' }, validFrom: '2026-01-31' },
      { stakeholderType: { value: 'Konateľ' }, personName: { givenNames: ['Tomáš'], familyNames: ['Dvorský'] } },
      { stakeholderType: { value: 'Konateľ' }, personName: { formatedName: 'Peter Starý' }, validTo: '2026-02-28' },
      { stakeholderType: { value: 'Konateľ' }, personName: { formatedName: 'Christian Juhás' } },
    ],
  },
  '2026-10-13',
)
check(
  'the directors in office, each once, named as the register writes them',
  directors.map((d) => d.name).join('|') === 'Christian Juhás|Tomáš Dvorský' && directors[0].role === 'Konateľ',
  JSON.stringify(directors),
)
check('an answer without directors gives none', rpo.readDirectors({}).length === 0 && rpo.readDirectors(null).length === 0)

// The terms of the contract
check('every point the terms refer to exists', terms.termsReferences().length >= 5 && terms.termsReferences().every((r) => r.exists), JSON.stringify(terms.termsReferences()))
check('the terms name the company as the register has it', terms.termsText().includes(config.OPERATOR.registeredIn) && terms.termsText().includes(config.OPERATOR.companyId))
check(
  'the terms say a month above the limit is the next plan',
  terms.termsText().includes('vyúčtujeme ako najbližší vyšší balík') && terms.termsText().includes(`viac ako ${config.PLANS[config.PLANS.length - 1].docs} za mesiac`),
)
check('the terms keep the cap on damages to what can be foreseen (§ 379)', terms.termsText().includes('§ 379 Obchodného zákonníka') && terms.termsText().includes('dvanásťnásobku'))
check('the months to start in begin with the launch', terms.startMonths('2026-10-13').join(' ') === '2027-01-01 2027-02-01 2027-03-01 2027-04-01 2027-05-01 2027-06-01')
check('after the launch they begin with the next month, over a new year', terms.startMonths('2027-11-20').slice(0, 3).join(' ') === '2027-12-01 2028-01-01 2028-02-01')
check('a date is written in words', terms.longDate('2027-01-01') === '1. januára 2027')
const linkMail = orderLinkMail('Zelený dvor s. r. o.', 'rast', 'https://firmony.ai/objednavka/abc', 30)
check(
  'the order email names the company, the plan and how long the link works',
  linkMail.body.includes('Firma: Zelený dvor s. r. o.') &&
    linkMail.body.includes('Balík: Rast, 169 € mesačne bez DPH') &&
    linkMail.body.includes('Odkaz platí 30 dní') &&
    !/\u00a0/.test(linkMail.body),
)
// His word of 13 October 2026: everything in the app. The terms say every notice is given there, and none by email.
const termsPlain = terms.termsText()
check(
  'the terms give every notice in the app',
  termsPlain.includes('Komunikujeme správami v aplikácii') && termsPlain.includes('Vy v aplikácii v časti Firma a nastavenia') && termsPlain.includes('nájdete v aplikácii'),
)
check(
  'and none of them by email',
  !/e-mailom (najmenej|vopred)|a to e-mailom|Potvrdenie s ich znením|alebo e-mailom|informujeme e-mailom/.test(termsPlain),
  termsPlain.match(/[^.]*e-mail[^.]*\./g)?.join(' | '),
)
check('a notice given in the app can be taken back, with our consent given in advance', termsPlain.includes('môžete do konca výpovednej lehoty vziať späť; s takým späťvzatím vopred súhlasíme'))

// Every email to a client or the team is a doorbell: its link and its fixed words, and nothing that was typed.
const sample = 'https://firmony.ai/app/x'
const rung = Object.entries(bells.bell).map(([kind, make]) => [
  kind,
  make.length === 4 ? make('október 2026', '10. 11.', sample, sample) : make.length === 3 ? make('október 2026', sample, sample) : make(sample, sample),
])
check(
  'every doorbell links into the app and says to answer there',
  rung.length >= 12 && rung.every(([, b]) => b.subject.startsWith('Firmony: ') && b.body.includes(sample) && b.body.includes('Na tento e-mail neodpovedajte')),
  rung.map(([k]) => k).join(' '),
)
check(
  'a doorbell is short and plain',
  rung.every(([, b]) => b.body.split('\n').length <= 10 && !/ |undefined|null/.test(b.body + b.subject)),
  rung.find(([, b]) => b.body.split('\n').length > 10 || / |undefined|null/.test(b.body + b.subject))?.[0],
)

// What the law against money laundering asks of a client (aml.ts)
check(
  'a birth number with its check digit, with or without the slash',
  aml.birthNumberValid('780123/0008') && aml.birthNumberValid('7801230008') && aml.birthNumberValid('9053120010') && aml.birthNumberValid('0407150007'),
)
check(
  'a wrong check digit, month or day is no birth number',
  !aml.birthNumberValid('7801230009') && !aml.birthNumberValid('7813230008') && !aml.birthNumberValid('8552300009') && !aml.birthNumberValid('78012300') && !aml.birthNumberValid('abc'),
)
check('nine digits only before 1954', aml.birthNumberValid('530101123') && !aml.birthNumberValid('600101123'))
check('a birth number is shown by its last four digits', aml.maskBirthNumber('780123/0008') === '******/0008' && aml.maskBirthNumber('12') === '')
check(
  'a date of birth typed the Slovak way',
  aml.birthDateOf('7. 3. 1994', '2026-10-13') === '1994-03-07' && aml.birthDateOf('17.4.1991', '2026-10-13') === '1991-04-17' && aml.birthDateOf('', '2026-10-13') === '',
)
check(
  'a day that does not exist, a child or nobody alive is no date of birth',
  aml.birthDateOf('31. 2. 1990', '2026-10-13') === null &&
    aml.birthDateOf('1. 1. 2020', '2026-10-13') === null &&
    aml.birthDateOf('1. 1. 1890', '2026-10-13') === null &&
    aml.birthDateOf('1990', '2026-10-13') === null,
)
check(
  'a notice ends on the last day of the month after it',
  aml.noticeEndsOn('2026-10-13') === '2026-11-30' &&
    aml.noticeEndsOn('2026-10-31') === '2026-11-30' &&
    aml.noticeEndsOn('2026-12-05') === '2027-01-31' &&
    aml.noticeEndsOn('2027-12-31') === '2028-01-31' &&
    aml.noticeEndsOn('2028-01-10') === '2028-02-29',
)
const words = appCopy.app.declaration.errors
const full = {
  name: 'Martin Novák',
  rc: '780123/0008',
  dob: '',
  address: 'Moyzesova 12, 040 01 Košice',
  nationality: 'slovenská',
  idKind: 'op',
  idNumber: 'hk 123456',
  pep: '0',
  kuv: 'self',
  activity: 'Weby pre malé firmy',
  income: 'Platby od zákazníkov',
  turnover: '50-200',
  cash: '0',
  abroad: '0',
  abroadWhere: '',
  truthful: '1',
}
const given = aml.checkDeclaration(full, '2026-10-13', words)
check(
  'a whole declaration is taken as it was given',
  given.declaration !== null &&
    Object.keys(given.errors).length === 0 &&
    given.declaration.director.birthNumber === '780123/0008' &&
    given.declaration.director.idNumber === 'HK123456' &&
    given.declaration.owners.length === 0,
  JSON.stringify(given.errors),
)
const wrongs = (over) =>
  Object.keys(aml.checkDeclaration({ ...full, ...over }, '2026-10-13', words).errors)
    .sort()
    .join(' ')
check('without the statement nothing is taken', wrongs({ truthful: '' }) === 'truthful' && aml.checkDeclaration({ ...full, truthful: '' }, '2026-10-13', words).declaration === null)
check(
  'a birth number or a date of birth, one of them valid',
  wrongs({ rc: '7801230009' }) === 'rc' && wrongs({ rc: '' }) === 'dob' && wrongs({ rc: '', dob: '17. 4. 1991' }) === '' && wrongs({ rc: '', dob: '30. 2. 1991' }) === 'dob',
)
check(
  'every question is answered, not presumed',
  wrongs({ pep: '', cash: '', abroad: '', kuv: '', turnover: 'vela' }) === 'abroad cash kuv pep turnover' && wrongs({ idKind: 'x' }) === 'idNumber' && wrongs({ idNumber: '12' }) === 'idNumber',
)
check('partners outside the EU are named', wrongs({ abroad: '1' }) === 'abroadWhere' && wrongs({ abroad: '1', abroadWhere: 'USA' }) === '')
const owner = { o1Name: 'Jana Nováková', o1Rc: '', o1Dob: '2. 5. 1990', o1Address: 'Hlavná 5, 040 01 Košice', o1Nationality: 'slovenská', o1Share: '50 %' }
check(
  'other owners are asked for when the director is not the only one',
  wrongs({ kuv: 'with' }) === 'owners' &&
    wrongs({ kuv: 'others', ...owner }) === '' &&
    wrongs({ kuv: 'with', ...owner, o1Share: '' }) === 'o1share' &&
    wrongs({ kuv: 'with', ...owner, o1Dob: '' }) === 'o1dob',
)
check(
  'an owner given while the director is the only one is not kept',
  aml.checkDeclaration({ ...full, ...owner }, '2026-10-13', words).declaration?.owners.length === 0 &&
    aml.checkDeclaration({ ...full, kuv: 'with', ...owner, o1Pep: '1' }, '2026-10-13', words).declaration?.owners[0]?.pep === true,
)
const asGiven = aml.valuesOfDeclaration(given.declaration)
check(
  'a declaration opens again in the form as it was given, without the statement',
  aml.checkDeclaration({ ...asGiven, truthful: '1' }, '2026-10-13', words).declaration?.director.name === 'Martin Novák' && asGiven.truthful === '',
)
const plain = given.declaration
check(
  'the risk the declaration points to',
  aml.suggestedLevel(plain) === 'low' &&
    aml.suggestedLevel({ ...plain, cash: true }) === 'standard' &&
    aml.suggestedLevel({ ...plain, cash: true, abroad: true }) === 'high' &&
    aml.suggestedLevel({ ...plain, director: { ...plain.director, pep: true } }) === 'high' &&
    aml.suggestedLevel({ ...plain, owners: [{ pep: true }] }) === 'high',
)

// The texts say the figures of the plans
const start = config.PLANS[0]
check('the hero names the lowest price', copy.hero.price.includes(format.formatEur(start.price * 100)))
check('the first figure is the lowest price', copy.stats[0].value === format.formatEur(start.price * 100))
check('the closing price is the config one', copy.pricing.closing.includes(format.formatEur(config.CLOSING_PRICE * 100)))
check(
  'every plan row is filled',
  config.PLANS.every((p) => Object.values(planRows(p)).every((v) => typeof v === 'string' && v.length > 0)),
)
const texts = []
const walk = (value) => (typeof value === 'string' ? texts.push(value) : Array.isArray(value) ? value.forEach(walk) : value && typeof value === 'object' ? Object.values(value).forEach(walk) : null)
walk(copy)
check(
  'no dash in any text',
  texts.every((t) => !/[–—]/.test(t) && !/ - /.test(t)),
  texts.find((t) => /[–—]/.test(t) || / - /.test(t)),
)
check(
  'no one-letter word ends a line',
  texts.every((t) => !/(^|\s)[vszkouaiVSZKOUAI] /.test(t)),
  texts.find((t) => /(^|\s)[vszkouaiVSZKOUAI] /.test(t)),
)
check(
  'no straight quotes',
  texts.every((t) => !/"/.test(t)),
)

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
check(
  'a receipt is settled a day before to five days after',
  match.score(pay({ bookedOn: '2026-10-17' }), doc()) > 0 &&
    match.score(pay({ bookedOn: '2026-10-18' }), doc()) === 0 &&
    match.score(pay({ bookedOn: '2026-10-11' }), doc()) > 0 &&
    match.score(pay({ bookedOn: '2026-10-10' }), doc()) === 0,
)
const invoice = doc({ kind: 'invoice_in', issuedOn: '2026-09-01', dueOn: '2026-09-15', party: 'Hostingový dom s. r. o.', vs: '2026118', partyIban: 'SK8975000000000012345671' })
check(
  'an invoice paid long after its date, by its symbol and account',
  match.score(pay({ bookedOn: '2026-11-10', party: 'Hostingový dom', vs: '2026118', partyIban: 'SK89 7500 0000 0000 1234 5671' }), { ...invoice, totalCents: 1240 }) === 140,
)
check(
  'an invoice is paid up to sixty days after it was due',
  match.score(pay({ bookedOn: '2026-11-14' }), { ...invoice, totalCents: 1240 }) > 0 && match.score(pay({ bookedOn: '2026-11-15' }), { ...invoice, totalCents: 1240 }) === 0,
)
check(
  'an invoice is not paid more than fifteen days before it was issued',
  match.score(pay({ bookedOn: '2026-08-17' }), { ...invoice, totalCents: 1240 }) > 0 && match.score(pay({ bookedOn: '2026-08-16' }), { ...invoice, totalCents: 1240 }) === 0,
)
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
decided = match.decide(
  [pay({ id: 'p1', amountCents: 50000, bookedOn: '2026-10-12', vs: '20260002' }), pay({ id: 'p2', amountCents: 50000, bookedOn: '2026-10-13', vs: '0020260002' })],
  [monthly('d1', '20260001'), monthly('d2', '20260002')],
)
check('two payments with the same number: neither is chosen', decided.auto.length === 0)

check(
  'a payment between two accounts of the company needs no document',
  match.autoExempt({ amountCents: -100000, party: 'Firma', partyIban: 'SK31 1200 0000 1987 4263 7541', note: null }, ['SK3112000000198742637541']) === 'own',
)
check(
  'a payment to the State Treasury needs none',
  match.autoExempt({ amountCents: -3300, party: 'Finančná správa SR', partyIban: 'SK3681800000007000123456', note: null }, []) === 'state' && match.isStateIban('SK36 8180 0000 0070 0012 3456'),
)
check('a fee of the bank needs none', match.autoExempt({ amountCents: -450, party: null, partyIban: null, note: 'Poplatok za vedenie účtu' }, []) === 'bank')
check('a supplier is never taken for the bank', match.autoExempt({ amountCents: -450, party: 'Poplatky s. r. o.', partyIban: 'SK8975000000000012345671', note: 'poplatok' }, []) === null)
check('an ordinary payment is for a person to decide', match.autoExempt({ amountCents: -1240, party: 'KAVIAREN', partyIban: null, note: 'Platba kartou' }, []) === null)

// The bank's statement and an e-invoice
check(
  'amounts in cents, exactly',
  xml.toCents('12.40') === 1240 && xml.toCents('1 200,5') === 120050 && xml.toCents('-3.1') === -310 && xml.toCents('0.07') === 7 && xml.toCents('abc') === null && xml.toCents('') === null,
)
check(
  'the payment symbols wherever a bank puts them',
  JSON.stringify(xml.symbols('/VS2026118/SS/KS0308')) === JSON.stringify({ vs: '2026118', ss: null, ks: '0308' }) && xml.symbols(null, 'VS: 123').vs === '123',
)
const camt = readFileSync(new URL('./fixtures/camt053.xml', import.meta.url), 'utf8')
const statements = xml.readStatement(camt)
const entries = statements?.[0]?.entries ?? []
check(
  'a camt.053 statement is read',
  statements?.length === 1 && statements[0].iban === 'SK3112000000198742637541' && statements[0].closing?.cents === 486163 && statements[0].closing?.on === '2026-10-12',
)
check(
  'a pending entry is left out, a batch is two payments',
  entries.length === 7 &&
    !entries.some((e) => e.ref === 'REF006') &&
    entries
      .filter((e) => e.ref.startsWith('REF007/'))
      .map((e) => e.amountCents)
      .join() === '-1000,-1500',
  entries.map((e) => e.ref).join(),
)
const card = entries.find((e) => e.ref === 'REF001')
check('a card payment, its merchant and its sign', card?.card === true && card.amountCents === -1240 && card.party === 'KAVIAREN NA ROHU KOSICE' && card.bookedOn === '2026-10-12')
const transfer = entries.find((e) => e.ref === 'REF002')
check('a transfer with its account and symbols', transfer?.partyIban === 'SK8975000000000012345671' && transfer.vs === '2026118' && transfer.ks === '0308' && transfer.note === 'Faktúra 2026118')
const incoming = entries.find((e) => e.ref === 'REF003')
check(
  'money in, the payer, a symbol in the structured reference and an entity',
  incoming?.amountCents === 120000 && incoming.party === 'Ján & syn s. r. o.' && incoming.vs === '20260005' && incoming.bookedOn === '2026-10-07',
)
const fee = entries.find((e) => e.amountCents === -450)
check(
  'an entry without a reference from the bank gets one that stays the same',
  fee !== undefined && fee.ref.startsWith('h:') && xml.readStatement(camt)?.[0]?.entries.find((e) => e.amountCents === -450)?.ref === fee.ref,
)
check(
  'a file that declares entities is refused, however good the rest',
  xml.readStatement(camt.replace('<Document', '<!DOCTYPE Document [<!ENTITY a "b">]>\n<Document')) === null && xml.readStatement(camt) !== null,
)
check('a file that is no statement is said to be none', xml.readStatement('<Invoice/>') === null && xml.readStatement('not xml at all') === null)
check(
  'a statement says its opening balance, its number and the days it covers',
  statements?.[0]?.opening?.cents === 512345 && statements[0].opening.on === '2026-10-01' && statements[0].number === '2026-10-12-001' && statements[0].from === null,
)

// Bank statements as records (statements.ts): what an emailed statement has to show before it touches the books
{
  const iban = 'SK4009000000005198123456'
  const daily = (day, opening, entries, extra = {}) =>
    xml.readStatement(camtXml({ iban, from: day, to: day, opening, entries: entries.map((e, i) => ({ ref: `${day}-${i}`, day, ...e })), ...extra }))?.[0]
  const first = daily('2026-10-12', 100000, [
    { cents: -1240, party: 'KAVIAREN', card: true },
    { cents: 50000, party: 'Odberateľ s. r. o.', iban: 'SK4111000000002987654321', vs: '20260007' },
  ])
  check(
    'a daily statement as a bank sends it: the day, the number, both balances',
    first?.from === '2026-10-12' && first.to === '2026-10-12' && first.number === '1' && first.opening?.cents === 100000 && first.closing?.cents === 148760 && first.entries.length === 2,
    JSON.stringify(first && { from: first.from, to: first.to, number: first.number, opening: first.opening, closing: first.closing }),
  )
  check('its figures add up', stmts.sumsUp(first) && !stmts.sumsUp({ ...first, closing: { cents: 148761, on: '2026-10-12' } }) && !stmts.sumsUp({ ...first, opening: null }))
  const none = new Set()
  const at = (cents, on) => ({ balanceCents: cents, balanceOn: on })
  check(
    'an account the company does not have waits for the owner; a member who adds it on a page is trusted',
    stmts.verdictOf(first, null, none, false).status === 'confirm' && stmts.verdictOf(first, null, none, true).status === 'taken',
  )
  check('a statement that opens with the last closing balance, a later day, is taken', stmts.verdictOf(first, at(100000, '2026-10-11'), none, false).status === 'taken')
  const gap = stmts.verdictOf(first, at(99000, '2026-10-09'), none, false)
  check(
    'one that opens with another balance waits for the accountant, with both figures',
    gap.status === 'held' && gap.reason.kind === 'gap' && gap.reason.opening === 100000 && gap.reason.last?.cents === 99000 && gap.reason.last?.on === '2026-10-09',
  )
  const overlap = stmts.verdictOf(first, at(100000, '2026-10-13'), none, false)
  check('one of days the books already have, with movements they do not know, waits too', overlap.status === 'held' && overlap.reason.kind === 'overlap')
  check('the same movements again are nothing new', stmts.verdictOf(first, at(148760, '2026-10-12'), new Set(first.entries.map((e) => e.ref)), false).status === 'known')
  const forged = { ...first, closing: { cents: 999999, on: '2026-10-12' } }
  const sum = stmts.verdictOf(forged, at(100000, '2026-10-11'), none, false)
  check('figures that do not add up wait, whatever the balance', sum.status === 'held' && sum.reason.kind === 'sum' && sum.reason.sum === 148760 && sum.reason.closing === 999999)
  check('without its balances it cannot be checked', stmts.verdictOf({ ...first, opening: null }, at(100000, '2026-10-11'), none, false).reason?.kind === 'opening')
  check('an account whose balance we do not know yet waits', stmts.verdictOf(first, at(null, null), none, false).reason?.kind === 'unknown')
  check('a member on a page is taken for an account the company has, whatever its balance', stmts.verdictOf(forged, at(1, '2026-10-30'), none, true).status === 'taken')
  check(
    'the month before a day',
    stmts.lastDayBefore('2026-11-14') === '2026-10-31' &&
      stmts.lastDayBefore('2027-03-01') === '2027-02-28' &&
      stmts.lastDayBefore('2028-03-05') === '2028-02-29' &&
      stmts.lastDayBefore('2027-01-10') === '2026-12-31',
  )
}

// Fio banka by the client's token (fio.ts)
check(
  'a token of Fio is letters and digits',
  fio.isFioToken('a'.repeat(64)) && fio.isFioToken('Ab12'.repeat(16)) && !fio.isFioToken('short') && !fio.isFioToken(`${'a'.repeat(63)}-`) && !fio.isFioToken(''),
)
check(
  'an IBAN from an account number and a bank code',
  fio.ibanOf('SK', '2801234567', '8330') === 'SK2283300000002801234567' && fio.ibanOf('CZ', '19-2000145399', '0800') === 'CZ6508000000192000145399' && fio.ibanOf('SK', 'abc', '8330') === null,
)
check('Fio dates, written or in milliseconds', fio.fioDay('2026-10-12+0200') === '2026-10-12' && fio.fioDay(Date.parse('2026-10-11T22:30:00Z')) === '2026-10-12' && fio.fioDay(null) === null)
{
  const col = (id, value) => ({ value, name: `c${id}`, id })
  const tx = (cols) => Object.fromEntries(Object.entries(cols).map(([id, value]) => [`column${id}`, col(Number(id), value)]))
  const card = fio.fioEntry(tx({ 22: 26101401, 0: '2026-10-12+0200', 1: -12.4, 14: 'EUR', 7: 'Nákup: KAVIAREN NA ROHU, KOSICE', 8: 'Platba kartou' }), 'SK')
  check(
    'a card payment of Fio, its merchant from what the bank wrote',
    card?.ref === 'fio:26101401' && card.amountCents === -1240 && card.card === true && card.party === 'KAVIAREN NA ROHU, KOSICE' && card.bookedOn === '2026-10-12',
  )
  const paid = fio.fioEntry(
    tx({ 22: 26101402, 0: '2026-10-12+0200', 1: 621.15, 2: '2987654321', 3: '1100', 10: 'Kníhkupectvo Na korze s. r. o.', 5: '20260007', 4: '0308', 16: 'Faktúra 20260007' }),
    'SK',
  )
  check(
    'a transfer of Fio: the account as an IBAN, the symbols from their columns',
    paid?.partyIban === 'SK9811000000002987654321' && paid.vs === '20260007' && paid.ks === '0308' && paid.party === 'Kníhkupectvo Na korze s. r. o.' && paid.note === 'Faktúra 20260007' && !paid.card,
    JSON.stringify(paid),
  )
  check('nothing booked, nothing taken', fio.fioEntry(tx({ 22: 1, 0: '2026-10-12+0200', 1: 0 }), 'SK') === null && fio.fioEntry({}, 'SK') === null)
  const read = fio.readFio({
    accountStatement: {
      info: { accountId: '2801234567', iban: 'SK22 8330 0000 0028 0123 4567', closingBalance: 1840.5, dateEnd: '2026-10-13+0200' },
      transactionList: { transaction: [tx({ 22: 7, 0: '2026-10-13+0200', 1: -160 })] },
    },
  })
  check(
    'an answer of Fio: its account, its balance at the end, its movements',
    read?.iban === 'SK2283300000002801234567' && read.closing?.cents === 184050 && read.closing.on === '2026-10-13' && read.entries.length === 1 && read.accountId === '2801234567',
  )
  check('an answer that is none', fio.readFio(null) === null && fio.readFio({ nothing: 1 }) === null)
  const answering =
    (status, body = '') =>
    async () =>
      new Response(body, { status })
  const kindOf = async (status) => {
    try {
      await fio.fetchFio('t'.repeat(64), '2026-10-01', '2026-10-13', answering(status))
      return 'read'
    } catch (err) {
      return err instanceof fio.FioError ? err.kind : 'other'
    }
  }
  check(
    "what Fio's answers mean: too soon, a token that does not work, a fault to try later",
    (await kindOf(409)) === 'soon' && (await kindOf(401)) === 'token' && (await kindOf(404)) === 'token' && (await kindOf(500)) === 'down' && (await kindOf(200)) === 'down',
  )
  const fine = await fio.fetchFio(
    't'.repeat(64),
    '2026-10-01',
    '2026-10-13',
    answering(200, JSON.stringify({ accountStatement: { info: { iban: 'SK2283300000002801234567', closingBalance: 1, dateEnd: '2026-10-13+0200' }, transactionList: { transaction: [] } } })),
  )
  check('and one it reads', fine.iban === 'SK2283300000002801234567' && fine.closing?.cents === 100)
}
const ubl = readFileSync(new URL('./fixtures/ubl-invoice.xml', import.meta.url), 'utf8')
const received = xml.readInvoice(ubl, '57442452')
check(
  'an e-invoice we received',
  received?.kind === 'invoice_in' && received.party === 'Hostingový dom s. r. o.' && received.partyIco === '36123456' && received.number === '2026118' && received.vs === '2026118',
)
check(
  'its dates, amount, tax and account',
  received?.issuedOn === '2026-09-30' &&
    received.dueOn === '2026-10-14' &&
    received.totalCents === 5990 &&
    received.vatCents === 998 &&
    received.currency === 'EUR' &&
    received.partyIban === 'SK8975000000000012345671',
)
const issued = xml.readInvoice(ubl, '36123456')
check('an e-invoice we issued names the customer', issued?.kind === 'invoice_out' && issued.party === 'Ukážková firma s. r. o.' && issued.partyIco === '57442452' && issued.partyIban === null)
check(
  'an e-invoice pays the way its documents pair',
  match.score(pay({ bookedOn: '2026-10-10', amountCents: -5990, party: 'Hostingový dom s. r. o.', partyIban: 'SK8975000000000012345671', vs: '2026118' }), { id: 'x', ...received }) === 140,
)

// What a file is, and what the reader may write
const bytes = (...b) => new Uint8Array([...b, ...new Array(64).fill(0)])
const ascii = (text) => new TextEncoder().encode(text)
check(
  'a photo, a PDF and XML are told by their bytes',
  reader.sniff(bytes(0xff, 0xd8, 0xff, 0xe0)) === 'jpeg' &&
    reader.sniff(bytes(0x89, 0x50, 0x4e, 0x47)) === 'png' &&
    reader.sniff(ascii('%PDF-1.7 ...')) === 'pdf' &&
    reader.sniff(ascii('<?xml version="1.0"?><Invoice>')) === 'xml',
)
check('an iPhone photo and a WebP', reader.sniff(ascii('\0\0\0\x18ftypheic....')) === 'heic' && reader.sniff(ascii('RIFF\0\0\0\0WEBPVP8 ')) === 'webp')
check('anything else is refused, whatever its name', reader.sniff(ascii('<html><script>')) === null && reader.sniff(ascii('MZ\x90')) === null && reader.sniff(new Uint8Array(0)) === null)
const read = reader.readingFrom({
  je_doklad: true,
  typ: 'blocek',
  druha_strana: ' Kaviareň ',
  ico_druhej_strany: '123 456',
  datum_vystavenia: '2026-10-12',
  suma_celkom: '12,40',
  dph_celkom: '2.07',
  mena: 'eur',
})
check(
  'what the reader wrote, checked field by field',
  read?.kind === 'receipt' && read.party === 'Kaviareň' && read.partyIco === '00123456' && read.totalCents === 1240 && read.vatCents === 207 && read.currency === 'EUR',
)
check('a picture that is no document is none', reader.readingFrom({ je_doklad: false, suma_celkom: '10' }) === null)
const odd = reader.readingFrom({ je_doklad: true, typ: 'neviem', datum_vystavenia: '12. 10. 2026', suma_celkom: '-5', iban_druhej_strany: 'xx', mena: 'eura' })
check('what is not what it should be is left out', odd?.kind === 'other' && odd.issuedOn === null && odd.totalCents === null && odd.partyIban === null && odd.currency === null)

// The app's words
check(
  'Slovak counting',
  appCopy.plural(1, 'doklad', 'doklady', 'dokladov') === 'doklad' &&
    appCopy.plural(3, 'doklad', 'doklady', 'dokladov') === 'doklady' &&
    appCopy.plural(5, 'doklad', 'doklady', 'dokladov') === 'dokladov' &&
    appCopy.plural(0, 'a', 'b', 'c') === 'c',
)
check(
  'missing documents said right',
  appCopy.app.deadline.docsState(1) === `Chýba 1${NB}doklad` &&
    appCopy.app.deadline.docsState(3) === `Chýbajú 3${NB}doklady` &&
    appCopy.app.deadline.docsState(5) === `Chýba 5${NB}dokladov` &&
    appCopy.app.deadline.docsState(0) === 'Máme všetko',
  [1, 3, 5].map(appCopy.app.deadline.docsState).join(' | '),
)
check(
  'a merchant in capitals reads as a name',
  appCopy.readableName('KAVIAREN NA ROHU KOSICE') === 'Kaviaren Na Rohu Kosice' && appCopy.readableName('Hostingový dom s. r. o.') === 'Hostingový dom s. r. o.' && appCopy.readableName('D1') === 'D1',
)
check(
  'days and months in Slovak',
  appCopy.dayName('2026-10-12', '2026-10-13') === `12.${NB}októbra` && appCopy.dayName('2027-03-31') === `31.${NB}marca 2027` && appCopy.monthName('2026-09-01', true) === 'September 2026',
)
check('amounts with their sign', appCopy.signed(120000) === `+1${NB}200${NB}€` && appCopy.signed(-1240) === `−12,40${NB}€`)

// What is due
const payerMonthly = { vatStatus: 'payer', vatQuarterly: false }
const notRegistered = { vatStatus: 'none', vatQuarterly: false }
let due = deadlines.deadlinesFor(payerMonthly, '2026-10-13', new Map([['2026-10', 3]]))
check(
  'a VAT payer in the middle of a month: 25 October 2026 is a Sunday, so the 26th',
  due.map((d) => d.day).join() === '2026-10-26,2026-11-10,2027-03-31' && due[1].tone === 'amber' && due[0].tone === 'blue',
  due.map((d) => `${d.day} ${d.label}`).join(' | '),
)
due = deadlines.deadlinesFor(notRegistered, '2026-11-05', new Map([['2026-10', 2]]))
check('before the 10th the month before is still due', due.map((d) => d.day).join() === '2026-11-10,2026-12-10,2027-03-31' && due[0].state.includes('2'), due.map((d) => d.day).join())
due = deadlines.deadlinesFor(notRegistered, '2026-11-20', new Map([['2026-10', 1]]))
check('a month whose documents are late stays on the list', due[0].day === '2026-11-10' && due[0].tone === 'amber')
due = deadlines.deadlinesFor(payerMonthly, '2027-01-05', new Map())
check('over the turn of a year', due.map((d) => d.day).join() === '2027-01-10,2027-01-25,2027-02-10,2027-03-31' && due.some((d) => d.label.includes('rok 2026')), due.map((d) => d.day).join())
due = deadlines.deadlinesFor(payerMonthly, '2026-10-28', new Map())
check(
  'after the deadline the next VAT return is due',
  due.some((d) => d.day === '2026-11-25' && d.label.includes('október')),
)
due = deadlines.deadlinesFor({ vatStatus: 'payer', vatQuarterly: true }, '2027-04-10', new Map())
check(
  'a quarterly payer: the first quarter by 26 April 2027 (the 25th is a Sunday)',
  due.some((d) => d.day === '2027-04-26' && d.label.includes('štvrťrok')),
  due.map((d) => `${d.day} ${d.label}`).join(' | '),
)
const filedSep = { period: '2026-09', filedAt: 0, filedOn: '2026-10-20', filedBy: null, filedByName: null, rows: {}, kvRows: 2, payCents: 123456, refundCents: 0, dueOn: '2026-10-26' }
due = deadlines.deadlinesFor(payerMonthly, '2026-10-21', new Map(), { filed: [filedSep], paid: new Map() })
const payDue = due.find((d) => d.href === '/app/dane')
check(
  'a filed return asks to be paid, and leads to where',
  payDue?.day === '2026-10-26' && payDue.tone === 'amber' && payDue.state.includes('1') && payDue.label.includes('Zaplatiť'),
  JSON.stringify(payDue),
)
due = deadlines.deadlinesFor(payerMonthly, '2026-10-21', new Map(), { filed: [filedSep], paid: new Map([['2026-09', { cents: 123456, last: '2026-10-22' }]]) })
check('a paid one says so', due.find((d) => d.href)?.tone === 'ok')
due = deadlines.deadlinesFor(payerMonthly, '2026-10-21', new Map(), { filed: [filedSep], paid: new Map([['2026-09', { cents: 23456, last: '2026-10-22' }]]) })
check('a part paid asks for the rest', due.find((d) => d.href)?.state === `Zaplaťte 1${NB}000,00${NB}€`, due.find((d) => d.href)?.state)
due = deadlines.deadlinesFor(payerMonthly, '2026-11-03', new Map(), { filed: [filedSep], paid: new Map() })
check('an unpaid one stays on the list past its deadline', due.some((d) => d.day === '2026-10-26' && d.tone === 'amber') && due.some((d) => d.day === '2026-11-25'))
due = deadlines.deadlinesFor({ vatStatus: 'reg7a', vatQuarterly: false }, '2026-10-21', new Map(), { filed: [{ ...filedSep, payCents: 460 }], paid: new Map() })
check(
  '§ 7a: no return of its own to wait for, and 4,60 € is not paid',
  !due.some((d) => d.state === 'Zaplaťte 4,60 €') && !due.some((d) => d.label.includes('kontrolný')),
  due.map((d) => `${d.label} ${d.state}`).join(' | '),
)

const appTexts = []
const walkApp = (value) =>
  typeof value === 'string' ? appTexts.push(value) : Array.isArray(value) ? value.forEach(walkApp) : value && typeof value === 'object' ? Object.values(value).forEach(walkApp) : null
walkApp(appCopy.app)
walkApp(appCopy.EXEMPT_NAMES)
check(
  'the app has no dash and no straight quote',
  appTexts.every((t) => !/[–—]/.test(t) && !/ - /.test(t) && !/"/.test(t)),
  appTexts.find((t) => /[–—"]/.test(t) || / - /.test(t)),
)
check(
  'in the app no one-letter word ends a line',
  appTexts.every((t) => !/(^|\s)[vszkouaiVSZKOUAI] /.test(t)),
  appTexts.find((t) => /(^|\s)[vszkouaiVSZKOUAI] /.test(t)),
)

// Booking: the entry a document is booked with
const entry = (args) => JSON.stringify(booking.entryFor({ vatCents: null, vatPayer: false, vatDeduct: false, paidBy: 'bank', ...args }).map((l) => [l.md, l.d, l.cents, l.what]))
check(
  'a received invoice of a VAT payer: the cost and the VAT against the supplier',
  entry({ kind: 'invoice_in', category: 'services', totalCents: 8640, vatCents: 1616, vatPayer: true, vatDeduct: true }) ===
    JSON.stringify([
      ['518', '321', 7024, 'cost'],
      ['343', '321', 1616, 'vat'],
    ]),
)
check(
  'a company that is no VAT payer books the whole amount',
  entry({ kind: 'invoice_in', category: 'services', totalCents: 8640, vatCents: 1616, vatPayer: false, vatDeduct: true }) === JSON.stringify([['518', '321', 8640, 'cost']]),
)
check(
  'VAT that is not deducted stays in the cost',
  entry({ kind: 'receipt', category: 'representation', totalCents: 1240, vatCents: 207, vatPayer: true, vatDeduct: false }) === JSON.stringify([['513', '221', 1240, 'cost']]),
)
check(
  "a receipt paid from the owner's own money is owed to him",
  entry({ kind: 'receipt', category: 'material', totalCents: 890, paidBy: 'private' }) === JSON.stringify([['501', '365', 890, 'cost']]),
)
check('a receipt paid in cash comes from the cash box', entry({ kind: 'receipt', category: 'fuel', totalCents: 6418, paidBy: 'cash' }) === JSON.stringify([['501', '211', 6418, 'cost']]))
check(
  'an issued invoice of a VAT payer: revenue and the VAT owed',
  entry({ kind: 'invoice_out', category: 'sales', totalCents: 123000, vatCents: 23000, vatPayer: true }) ===
    JSON.stringify([
      ['311', '602', 100000, 'revenue'],
      ['311', '343', 23000, 'vat'],
    ]),
)
check(
  'an account the accountant chose wins over the category',
  entry({ kind: 'invoice_in', category: 'services', totalCents: 1000, account: '501' }) === JSON.stringify([['501', '321', 1000, 'cost']]),
)
check('an account that is no account is ignored', entry({ kind: 'invoice_in', category: 'services', totalCents: 1000, account: 'abc' }) === JSON.stringify([['518', '321', 1000, 'cost']]))
check(
  'nothing is proposed without an amount, a category, or for revenue on a cost',
  entry({ kind: 'invoice_in', category: null, totalCents: 1000 }) === '[]' &&
    entry({ kind: 'invoice_in', category: 'services', totalCents: null }) === '[]' &&
    entry({ kind: 'invoice_in', category: 'sales', totalCents: 1000 }) === '[]' &&
    entry({ kind: 'other', category: 'services', totalCents: 1000 }) === '[]',
)
check(
  'VAT larger than the amount is held to the amount',
  entry({ kind: 'invoice_in', category: 'services', totalCents: 1000, vatCents: 5000, vatPayer: true, vatDeduct: true }) ===
    JSON.stringify([
      ['518', '321', 0, 'cost'],
      ['343', '321', 1000, 'vat'],
    ]),
)
check(
  'an issued invoice is offered revenue only',
  JSON.stringify(booking.categoriesFor('invoice_out')) === JSON.stringify(['sales', 'sales_goods']) && !booking.categoriesFor('receipt').includes('sales'),
)
check('a supplier is known by its IČO', booking.supplierKey('36 123 456', 'Hostingový dom s. r. o.') === 'ico:36123456')
check(
  'or by the words of its name, whatever their order',
  booking.supplierKey(null, 'Papiernictvo Pero') !== null && booking.supplierKey(null, 'Papiernictvo Pero') === booking.supplierKey('', 'PERO papiernictvo'),
  booking.supplierKey(null, 'Papiernictvo Pero'),
)
check('or by nothing', booking.supplierKey(null, null) === null)
const docA = { kind: 'receipt', totalCents: 1240, number: null, party: 'Kaviareň Na rohu', partyIco: '50123456', issuedOn: '2026-10-12' }
check('the same receipt twice is a suspected duplicate', booking.sameDocument(docA, { ...docA }))
check('the same number and amount is one', booking.sameDocument({ ...docA, number: '2026/118', partyIco: null, party: 'A' }, { ...docA, number: '2026118', partyIco: null, party: 'B' }))
check(
  'another amount, another day, or another number is not',
  !booking.sameDocument(docA, { ...docA, totalCents: 1250 }) &&
    !booking.sameDocument(docA, { ...docA, issuedOn: '2026-10-11' }) &&
    !booking.sameDocument({ ...docA, number: '1' }, { ...docA, number: '2' }),
)
check('a day typed the Slovak way', booking.dayOfText('11. 10. 2026') === '2026-10-11' && booking.dayOfText('1.2.2027') === '2027-02-01' && booking.dayOfText('2026-10-11') === '2026-10-11')
check('a day that does not exist is none', booking.dayOfText('31. 2. 2026') === null && booking.dayOfText('zajtra') === null && booking.dayOfText('11. 10. 1999') === null)
check('an empty day is empty', booking.dayOfText('  ') === '')
check('a day written back the Slovak way', booking.textDay('2026-10-01') === '1. 10. 2026')

// The export for the accountant's program
check('a cell that Excel would run is made text', teamStore.csvCell('=HYPERLINK("x")') === `"'=HYPERLINK(""x"")"` && teamStore.csvCell('+421') === "'+421" && teamStore.csvCell('@a') === "'@a")
check('a negative amount stays a number', teamStore.csvCell('-12,40') === '-12,40')
check('a cell never splits the row', teamStore.csvCell('a;b\nc') === 'a,b c')
check('cents as Slovak Excel reads them', teamStore.csvMoney(1240) === '12,40' && teamStore.csvMoney(-5) === '-0,05' && teamStore.csvMoney(100000) === '1000,00' && teamStore.csvMoney(null) === '')
check(
  'a client who did not pay is told apart from a receipt paid in cash',
  teamStore.paidByOf({ paidPrivately: false, kind: 'invoice_in' }, false) === 'unpaid' &&
    teamStore.paidByOf({ paidPrivately: false, kind: 'receipt' }, false) === 'cash' &&
    teamStore.paidByOf({ paidPrivately: true, kind: 'receipt' }, false) === 'private' &&
    teamStore.paidByOf({ paidPrivately: true, kind: 'receipt' }, true) === 'bank',
)
check('an inbox code is eight letters and digits that cannot be mistaken', /^[a-hjkmnp-z2-9]{8}$/.test(teamStore.inboxCode()))

// Invoices the client issues
check(
  'an amount typed the Slovak way',
  invoices.centsOf('12,40') === 1240 && invoices.centsOf('1 200') === 120000 && invoices.centsOf('1 200,5 €') === 120050 && invoices.centsOf('12.5') === 1250 && invoices.centsOf('-5') === -500,
)
check('an empty amount is none, a wrong one is no amount', invoices.centsOf(' ') === null && Number.isNaN(invoices.centsOf('12,345')) && Number.isNaN(invoices.centsOf('dvanásť')))
check(
  'a quantity in thousandths',
  invoices.milliOf('2,5') === 2500 && invoices.milliOf('0,25') === 250 && invoices.milliOf('3') === 3000 && invoices.milliOf('') === null && Number.isNaN(invoices.milliOf('-1')),
)
check('a line is quantity times price, to the cent', invoices.lineBase(2500, 3333) === 8333 && invoices.lineBase(1000, 4500) === 4500)
const sums = invoices.totalsOf(
  [
    { baseCents: 40000, vatRate: 23 },
    { baseCents: 10500, vatRate: 23 },
    { baseCents: 1000, vatRate: 5 },
  ],
  true,
)
check(
  'VAT is counted per rate, the highest rate first',
  JSON.stringify(sums.rates) ===
    JSON.stringify([
      { rate: 23, base: 50500, vat: 11615 },
      { rate: 5, base: 1000, vat: 50 },
    ]) &&
    sums.base === 51500 &&
    sums.vat === 11665 &&
    sums.total === 63165,
  JSON.stringify(sums),
)
check(
  'VAT is rounded once per rate, not per line',
  invoices.totalsOf(
    [
      { baseCents: 3, vatRate: 23 },
      { baseCents: 3, vatRate: 23 },
    ],
    true,
  ).vat === 1,
)
check(
  'a company that is no VAT payer adds no VAT',
  JSON.stringify(invoices.totalsOf([{ baseCents: 40000, vatRate: 23 }], false)) === JSON.stringify({ base: 40000, vat: 0, total: 40000, rates: [{ rate: 0, base: 40000, vat: 0 }] }),
)
check(
  'an invoice number is the year and its order, and its variable symbol',
  invoices.invoiceNumber(2026, 1) === '20260001' && invoices.invoiceNumber(2026, 123) === '20260123' && invoices.invoiceNumber(2026, 10000) === '202610000',
)
check(
  'an IBAN is known with or without spaces',
  invoices.isIban('SK31 1200 0000 1987 4263 7541') &&
    invoices.isIban('sk3112000000198742637541') &&
    !invoices.isIban('1234/0900') &&
    invoices.plainIban('sk31 1200 0000 1987 4263 7541') === 'SK3112000000198742637541',
)
check(
  'an IBAN with a typo is caught by its check digits',
  !invoices.isIban('SK31 1200 0000 1987 4263 7542') &&
    !invoices.isIban('SK13 1200 0000 1987 4263 7541') &&
    invoices.isIban('CZ65 0800 0000 1920 0014 5399') &&
    invoices.isIban('DE89 3704 0044 0532 0130 00'),
)
const lineMessages = { line: (n) => `riadok ${n}`, none: 'žiadny riadok' }
const form = (lines) => ({
  customerName: 'Agentúra Smer s. r. o.',
  customerAddress: '',
  customerIco: '',
  customerDic: '',
  customerIcdph: '',
  customerEmail: '',
  issued: '1. 10. 2026',
  delivered: '1. 10. 2026',
  due: '15. 10. 2026',
  iban: '',
  note: '',
  lines,
})
const blank = { description: '', quantity: '', unit: 'ks', price: '', vat: '23' }
const readLines = invoices.linesOf(
  form([{ description: 'Návrh loga', quantity: '', unit: 'ks', price: '400', vat: '23' }, blank, { description: 'Konzultácia', quantity: '2,5', unit: 'hod', price: '35', vat: '5' }]),
  true,
  lineMessages,
)
check(
  'empty lines are left out and the rest numbered again',
  readLines.error === null && readLines.lines.length === 2 && readLines.lines[1].position === 2 && readLines.lines[0].quantityMilli === 1000 && readLines.lines[1].baseCents === 8750,
)
check(
  'a line without a description, a price or with a rate that is none names its number',
  invoices.linesOf(
    form([
      { ...blank, description: 'A', price: '10' },
      { ...blank, description: 'B', price: 'x' },
    ]),
    true,
    lineMessages,
  ).error === 'riadok 2' &&
    invoices.linesOf(form([{ ...blank, description: 'A', price: '10', vat: '7' }]), true, lineMessages).error === 'riadok 1' &&
    invoices.linesOf(form([{ ...blank, price: '10' }]), true, lineMessages).error === 'riadok 1',
)
check('an invoice without a line is refused', invoices.linesOf(form([blank, blank]), true, lineMessages).error === 'žiadny riadok')
check(
  'a company that is no VAT payer writes no rate, and a unit that is none is dropped',
  JSON.stringify(invoices.linesOf(form([{ ...blank, description: 'A', price: '10', vat: '7', unit: 'sud' }]), false, lineMessages).lines.map((l) => [l.vatRate, l.unit])) ===
    JSON.stringify([[0, null]]),
)
const valueMessages = { customerName: 'name', customerEmail: 'email', customerIco: 'ico', issued: 'issued', delivered: 'delivered', due: 'due', iban: 'iban', lines: 'lines', form: 'form' }
const errorsOf = (changes) => Object.keys(invoices.checkValues({ ...form([]), ...changes }, booking.dayOfText, valueMessages)).join(',')
check('a correct invoice has no error', errorsOf({}) === '')
check('a due day before the day of issue is refused', errorsOf({ due: '30. 9. 2026' }) === 'due')
check(
  'a customer, an email, an IČO, an IBAN and the days are checked',
  errorsOf({ customerName: 'A', customerEmail: 'x@', customerIco: '123', iban: 'SK12', issued: 'zajtra', delivered: '' }) === 'customerName,customerEmail,customerIco,issued,delivered,iban',
)
check(
  'an invoice is a draft, paid, overdue or waiting',
  invoices.stateOf({ status: 'draft', paidOn: null, dueOn: '2026-10-01' }, '2026-10-13') === 'draft' &&
    invoices.stateOf({ status: 'issued', paidOn: '2026-10-12', dueOn: '2026-10-01' }, '2026-10-13') === 'paid' &&
    invoices.stateOf({ status: 'issued', paidOn: null, dueOn: '2026-10-12' }, '2026-10-13') === 'overdue' &&
    invoices.stateOf({ status: 'issued', paidOn: null, dueOn: '2026-10-13' }, '2026-10-13') === 'unpaid',
)

// The e-invoice is read back as the invoice it is, by us and by the customer
const seller = {
  id: 'c',
  createdAt: 0,
  name: 'Ukážková firma s. r. o.',
  ico: '57442452',
  dic: '2122222222',
  icdph: 'SK2122222222',
  address: 'Hlavná 1, 811 01 Bratislava',
  registerLine: null,
  vatPayer: true,
  plan: 'rast',
  inbox: 'abc',
  accountantId: null,
  accountantName: null,
  accountantEmail: null,
  note: null,
  demo: false,
  invoiceIban: null,
  invoiceDueDays: 14,
  invoiceFooter: null,
}
const stored = {
  id: 'i',
  number: '20260006',
  status: 'issued',
  customerName: 'Smer & <Syn> s. r. o.',
  customerIco: '50123456',
  customerDic: '2120000000',
  customerIcdph: 'SK2120000000',
  customerAddress: 'Námestie 2, Košice',
  customerEmail: null,
  issuedOn: '2026-10-01',
  deliveredOn: '2026-10-01',
  dueOn: '2026-10-15',
  note: 'Ďakujeme.',
  baseCents: 0,
  vatCents: 0,
  totalCents: 0,
  token: 't',
  documentId: null,
  iban: 'SK31 1200 0000 1987 4263 7541',
  sentAt: null,
  remindedAt: null,
  createdAt: 0,
  createdByName: null,
  paidOn: null,
}
const ublLines = readLines.lines.concat([{ position: 3, description: 'Zľava', quantityMilli: 1000, unit: 'ks', unitCents: -1000, vatRate: 23, baseCents: -1000 }])
const issuedUbl = invoices.ublOf(stored, ublLines, seller)
const ours = xml.readInvoice(issuedUbl, seller.ico)
const theirs = xml.readInvoice(issuedUbl, stored.customerIco)
check(
  'our e-invoice reads back as issued by us, to its customer',
  ours?.kind === 'invoice_out' && ours.party === stored.customerName && ours.partyIco === '50123456' && ours.number === '20260006' && ours.vs === '20260006',
  JSON.stringify(ours),
)
check(
  'with its sums and days',
  ours?.totalCents === 39000 + 8750 + Math.round(39000 * 0.23) + Math.round(8750 * 0.05) &&
    ours.vatCents === Math.round(39000 * 0.23) + Math.round(8750 * 0.05) &&
    ours.issuedOn === '2026-10-01' &&
    ours.dueOn === '2026-10-15',
  JSON.stringify(ours),
)
check(
  'the customer reads it as received, from us, with our account',
  theirs?.kind === 'invoice_in' && theirs.party === seller.name && theirs.partyIco === seller.ico && theirs.partyIban === 'SK3112000000198742637541',
  JSON.stringify(theirs),
)
check(
  'a discount keeps its price positive and its quantity negative',
  issuedUbl.includes('<cbc:InvoicedQuantity unitCode="C62">-1</cbc:InvoicedQuantity><cbc:LineExtensionAmount currencyID="EUR">-10.00</cbc:LineExtensionAmount>') &&
    issuedUbl.includes('<cbc:PriceAmount currencyID="EUR">10.00</cbc:PriceAmount>'),
)
check(
  'a Slovak company is addressed by its DIČ in Peppol',
  issuedUbl.includes('<cbc:EndpointID schemeID="0245">2122222222</cbc:EndpointID>') && issuedUbl.includes('<cbc:EndpointID schemeID="0245">2120000000</cbc:EndpointID>'),
)
check(
  'rates above nought are standard, VAT identifiers of both sides are there',
  issuedUbl.includes('<cbc:ID>S</cbc:ID><cbc:Percent>23</cbc:Percent>') && issuedUbl.includes('SK2122222222') && issuedUbl.includes('SK2120000000'),
)
const noVat = invoices.ublOf({ ...stored, customerName: 'Kníhkupectvo' }, invoices.linesOf(form([{ ...blank, description: 'Kniha', price: '20' }]), false, lineMessages).lines, {
  ...seller,
  vatPayer: false,
})
check(
  'a seller who is no VAT payer writes O with its reason, no rate and no VAT identifier',
  noVat.includes('<cbc:ID>O</cbc:ID><cbc:TaxExemptionReason>') &&
    !noVat.includes('<cbc:Percent>') &&
    !noVat.includes('SK2122222222') &&
    !noVat.includes('SK2120000000') &&
    xml.readInvoice(noVat, seller.ico)?.totalCents === 2000,
)
const exempt = invoices.ublOf(stored, [{ position: 1, description: 'Školenie', quantityMilli: 1000, unit: null, unitCents: 5000, vatRate: 0, baseCents: 5000 }], seller)
check("a VAT payer's supply at nought is exempt, with its reason", exempt.includes('<cbc:ID>E</cbc:ID><cbc:Percent>0</cbc:Percent><cbc:TaxExemptionReason>Oslobodené od DPH</cbc:TaxExemptionReason>'))

// PAY by square: what a bank's app reads from the QR code on an invoice
const square = paybysquare.payBySquare({ iban: 'SK31 1200 0000 1987 4263 7541', amountCents: 118080, vs: '20260006', due: '2026-10-15', name: 'Ukážková firma s. r. o.', note: 'Faktúra 20260006' })
const paid = square ? decodePayBySquare(square).payments[0] : null
check(
  'a bank reads the account, the amount, the symbol and the due day',
  paid?.bankAccounts[0].iban === 'SK3112000000198742637541' && paid.amount === 1180.8 && paid.currencyCode === 'EUR' && paid.variableSymbol === '20260006' && paid.paymentDueDate === '20261015',
  JSON.stringify(paid),
)
check(
  'and whom it pays, without accents that some banks cannot show',
  paid?.beneficiary?.name === 'Ukazkova firma s. r. o.' && paid.paymentNote === 'Faktura 20260006',
  JSON.stringify(paid?.beneficiary),
)
check(
  'no QR code without something to pay or with an account that is no IBAN',
  paybysquare.payBySquare({ iban: 'SK3112000000198742637541', amountCents: 0, vs: '1', due: null, name: 'A', note: '' }) === null &&
    paybysquare.payBySquare({ iban: 'SK3112000000198742637542', amountCents: 100, vs: '1', due: null, name: 'A', note: '' }) === null,
)
const picture = paybysquare.qrPicture(square ?? 'x')
check(
  'the QR code is one path inside a quiet zone of four modules',
  picture.size >= 29 && (picture.size - 8 - 21) % 4 === 0 && /^(M\d+ \d+h\d+v1h-\d+z)+$/.test(picture.path) && picture.path.startsWith('M4 4h7'),
  picture.path.slice(0, 40),
)

// The bank by open banking: what a transaction of Enable Banking becomes, and the token its API is called with
const tx = (extra) =>
  bank.entryOf({ entry_reference: 'r1', transaction_amount: { currency: 'EUR', amount: '12.40' }, credit_debit_indicator: 'DBIT', status: 'BOOK', booking_date: '2026-10-12', ...extra })
check(
  'money out is negative, money in positive, whatever sign the bank wrote',
  tx({}).amountCents === -1240 &&
    tx({ credit_debit_indicator: 'CRDT' }).amountCents === 1240 &&
    tx({ transaction_amount: { currency: 'EUR', amount: '-12.40' }, credit_debit_indicator: undefined }).amountCents === -1240,
)
check('only what is booked is a payment', tx({ status: 'PDNG' }) === null && tx({ status: 'RJCT' }) === null && tx({ transaction_amount: { amount: '0.00' } }) === null)
const paidIn = tx({
  credit_debit_indicator: 'CRDT',
  debtor: { name: 'europio s. r. o.' },
  debtor_account: { iban: 'sk52 0200 0000 0047 1234 5670' },
  creditor: { name: 'Ukážková firma' },
  remittance_information: ['/VS20260007/SS/KS0308', 'Faktura 20260007'],
})
check(
  'money in names who sent it, and the Slovak symbols are read',
  paidIn.party === 'europio s. r. o.' && paidIn.partyIban === 'SK5202000000004712345670' && paidIn.vs === '20260007' && paidIn.ks === '0308',
  JSON.stringify(paidIn),
)
const byCard = tx({ remittance_information: ['Platba kartou BILLA KOSICE'], bank_transaction_code: { code: 'CCRD' } })
check('a card payment is named by its merchant', byCard.card && byCard.party === 'BILLA KOSICE', JSON.stringify(byCard))
check(
  'a transaction without a reference gets a steady one',
  tx({ entry_reference: undefined }).ref === tx({ entry_reference: undefined }).ref && tx({ entry_reference: undefined }).ref.startsWith('h:'),
)
check('the day is the booking day, else the value day', tx({ booking_date: undefined, value_date: '2026-10-11' }).bookedOn === '2026-10-11' && tx({ booking_date: undefined }) === null)
check(
  'the balance is the closing one, else the booked one',
  JSON.stringify(
    bank.balanceOf({
      balances: [
        { balance_type: 'ITAV', balance_amount: { amount: '9.00' } },
        { balance_type: 'CLBD', balance_amount: { amount: '1234.56' }, reference_date: '2026-10-13' },
      ],
    }),
  ) === JSON.stringify({ cents: 123456, on: '2026-10-13' }) && bank.balanceOf({ balances: [] }) === null,
)
const soonLink = { id: 'l', bank: 'Tatra banka', status: 'active', createdAt: 0, validUntil: 1_000_000 + 5 * 86400, syncedAt: null, error: null, accounts: [] }
check(
  'the overview asks to renew ten days before a consent ends, and says when it ended',
  bank.noticeOf([soonLink], 1_000_000)?.kind === 'renew' &&
    bank.noticeOf([{ ...soonLink, validUntil: 1_000_000 + 30 * 86400 }], 1_000_000) === null &&
    bank.noticeOf([{ ...soonLink, status: 'expired' }], 1_000_000)?.kind === 'ended',
)
for (const type of ['pkcs8', 'pkcs1']) {
  const pair = generateKeyPairSync('rsa', { modulusLength: 2048, publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type, format: 'pem' } })
  const pasted = type === 'pkcs1' ? pair.privateKey.replace(/\n/g, '\\n') : pair.privateKey
  const token = await bank.bearer({ ENABLE_BANKING_APP: `app-${type}`, ENABLE_BANKING_KEY: pasted }, 1_800_000_000)
  const [h, p, sig] = token.split('.')
  const header = JSON.parse(Buffer.from(h, 'base64url').toString())
  const payload = JSON.parse(Buffer.from(p, 'base64url').toString())
  const valid = createVerify('RSA-SHA256').update(`${h}.${p}`).verify(pair.publicKey, Buffer.from(sig, 'base64url'))
  check(
    `the token for Enable Banking is signed with the application's key (${type === 'pkcs1' ? 'PKCS#1 pasted on one line' : 'PKCS#8'})`,
    valid && header.alg === 'RS256' && header.kid === `app-${type}` && payload.iss === 'enablebanking.com' && payload.aud === 'api.enablebanking.com' && payload.exp - payload.iat === 3600,
  )
}

// The originals of the sample documents are real PDFs
const pdf = new TextDecoder().decode(demo.demoPdf(226, 360, [{ text: 'Papiernictvo Pero (Košice)', bold: true }, { text: 'SPOLU 8,90 EUR' }]))
const xrefAt = Number(pdf.match(/startxref\n(\d+)/)?.[1])
check(
  'a sample original is a PDF whose table of contents is where it says',
  pdf.startsWith('%PDF-1.4') && pdf.slice(xrefAt, xrefAt + 4) === 'xref' && pdf.includes('(Papiernictvo Pero \\(Kosice\\)) Tj'),
)

// The power of attorney is what its bytes say: a signature container, a PDF or a photo, never what it is called
/** The start of a ZIP whose first entry is "mimetype" holding a type, with an extra field of some length. */
function zipWith(type, extra = 0) {
  const head = new Uint8Array(30)
  head.set([0x50, 0x4b, 0x03, 0x04, 0x0a, 0x00])
  const view = new DataView(head.buffer)
  view.setUint32(18, type.length, true)
  view.setUint32(22, type.length, true)
  view.setUint16(26, 8, true)
  view.setUint16(28, extra, true)
  return new Uint8Array([...head, ...new TextEncoder().encode('mimetype'), ...new Uint8Array(extra), ...new TextEncoder().encode(type), 0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0])
}
check(
  'a container from the eID signer is an ASiC-E, downloaded and not shown',
  papers.sniffPaper(zipWith('application/vnd.etsi.asic-e+zip'))?.ext === 'asice' && papers.sniffPaper(zipWith('application/vnd.etsi.asic-e+zip')).inline === false,
)
check(
  'so is an ASiC-S, and one whose entry has an extra field',
  papers.sniffPaper(zipWith('application/vnd.etsi.asic-s+zip'))?.ext === 'asics' && papers.sniffPaper(zipWith('application/vnd.etsi.asic-e+zip', 4))?.ext === 'asice',
)
const docx = zipWith('application/vnd.etsi.asic-e+zip')
docx.set(new TextEncoder().encode('[Content'), 30)
check('another ZIP (a Word file, a folder) is no paper', papers.sniffPaper(docx) === null && papers.sniffPaper(zipWith('application/zip-whatever-else-xx')) === null)
check(
  'a PDF, a photo and a PNG are papers; a text is not',
  papers.sniffPaper(demo.demoPdf(100, 100, [{ text: 'x' }]))?.type === 'application/pdf' &&
    papers.sniffPaper(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1]))?.ext === 'jpg' &&
    papers.sniffPaper(new TextEncoder().encode('Plnomocenstvo podpisane')) === null,
)
check(
  'where the power of attorney stands',
  papers.poaStateOf([]) === 'missing' && papers.poaStateOf([{ checkedAt: null }]) === 'waiting' && papers.poaStateOf([{ checkedAt: null }, { checkedAt: 5 }]) === 'checked',
)

// The archive a client downloads: a ZIP every unzipper reads, its names plain, its sums right
/** The files of a ZIP, read from its central directory as an unzipper reads them, each checked against its local header. */
function unzip(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const end = bytes.length - 22
  if (view.getUint32(end, true) !== 0x06054b50) return null
  const count = view.getUint16(end + 10, true)
  let at = view.getUint32(end + 16, true)
  const files = []
  for (let i = 0; i < count; i++) {
    if (view.getUint32(at, true) !== 0x02014b50) return null
    const crc = view.getUint32(at + 16, true)
    const size = view.getUint32(at + 24, true)
    const nameLength = view.getUint16(at + 28, true)
    const offset = view.getUint32(at + 42, true)
    const name = new TextDecoder().decode(bytes.subarray(at + 46, at + 46 + nameLength))
    if (view.getUint32(offset, true) !== 0x04034b50 || view.getUint16(offset + 8, true) !== 0 || view.getUint32(offset + 14, true) !== crc) return null
    const start = offset + 30 + view.getUint16(offset + 26, true) + view.getUint16(offset + 28, true)
    const data = bytes.subarray(start, start + size)
    files.push({ name, data, crc, time: view.getUint16(at + 12, true), date: view.getUint16(at + 14, true), sumOk: nodeCrc32(data) === crc })
    at += 46 + nameLength
  }
  return files
}
async function zipped(entries, note) {
  return new Uint8Array(await new Response(zip.zipStream(entries, note)).arrayBuffer())
}
{
  const enc = new TextEncoder()
  const at = Date.UTC(2026, 9, 13, 21, 4, 10) / 1000
  const bytes = await zipped([
    { name: 'citajte.txt', when: at, data: async () => enc.encode('Ahoj') },
    { name: 'doklady/2026-10-11 Kaviareň Mlyn/č. 12.jpg', when: at, data: async () => new Uint8Array([1, 2, 3, 4, 5]) },
    { name: 'doklady/2026-10-11 Kaviareň Mlyn/č. 12.jpg', when: at, data: async () => new Uint8Array([9]) },
    { name: 'doklady/zmazany.pdf', when: at, data: async () => null },
    { name: 'prazdny.txt', when: at, data: async () => new Uint8Array(0) },
  ])
  const files = unzip(bytes)
  check('the archive is a ZIP an unzipper reads, every sum right', files !== null && files.length === 4 && files.every((f) => f.sumOk), files?.map((f) => f.name).join(' | '))
  check(
    'names in the archive are plain ASCII, without accents',
    files?.[1]?.name === 'doklady/2026-10-11 Kaviaren Mlyn/c. 12.jpg' && files.every((f) => /^[\x20-\x7e]+$/.test(f.name)),
    files?.[1]?.name,
  )
  check(
    'a second file of the same name is "(2)", and a file that is gone is left out',
    files?.[2]?.name === 'doklady/2026-10-11 Kaviaren Mlyn/c. 12 (2).jpg' && !files.some((f) => f.name.includes('zmazany')),
  )
  check('what a file holds is what was put in, an empty one too', new TextDecoder().decode(files?.[0]?.data) === 'Ahoj' && files?.[2]?.data.length === 1 && files?.[3]?.data.length === 0)
  // 21:04:10 UTC on 13 October is 23:04:10 in Bratislava (summer time)
  check('a file is dated by the wall time in Bratislava', files?.[0]?.time === ((23 << 11) | (4 << 5) | 5) && files?.[0]?.date === (((2026 - 1980) << 9) | (10 << 5) | 13))
  check('a name cannot climb out of the archive', zip.zipName('../../etc/passwd') === '_/_/etc/passwd' && zip.zipName('a//b') === 'a/b' && zip.zipName('.htaccess') === '_htaccess')
}

// The end of a contract: the last day, ten days for the last month's documents, thirty for the handover, ninety to download
{
  const c = { endsOn: '2026-12-31', noticeSide: 'client' }
  const e = (day) => ending.endingOf(c, day)
  check(
    'a contract with a last day runs until it, then takes the last documents for ten days, then only gives',
    e('2026-12-31')?.phase === 'ending' && e('2027-01-01')?.phase === 'closing' && e('2027-01-10')?.phase === 'closing' && e('2027-01-11')?.phase === 'ended',
  )
  check(
    'the handover is due thirty days after the end, and access lasts ninety',
    e('2027-01-01')?.handoverBy === '2027-01-30' && e('2027-01-01')?.accessUntil === '2027-03-31' && e('2027-01-01')?.intakeUntil === '2027-01-10',
  )
  check(
    'a contract without a last day has no end',
    ending.endingOf({ endsOn: null, noticeSide: null }, '2027-01-01') === null && ending.serviceOpen({ endsOn: null }, '2030-01-01') && ending.intakeOpen({ endsOn: null }, '2030-01-01'),
  )
  check(
    'invoices and a new bank end with the last day, documents ten days later',
    ending.serviceOpen(c, '2026-12-31') && !ending.serviceOpen(c, '2027-01-01') && ending.intakeOpen(c, '2027-01-10') && !ending.intakeOpen(c, '2027-01-11'),
  )
  check(
    'the days the schedule compares with: ten days for intake, ninety to delete, five years to forget',
    ending.intakeFloor('2027-01-10') === '2026-12-31' &&
      ending.purgeFloor('2027-04-01') === '2027-01-01' &&
      ending.purgeFloor('2027-03-31') === '2026-12-31' &&
      ending.recordsFloor('2032-01-01') === '2027-01-01',
  )
  check('the side that ended it is kept', ending.endingOf({ endsOn: '2026-12-31', noticeSide: 'firmony' }, '2026-11-01')?.side === 'firmony' && e('2026-11-01')?.side === 'client')
  check(
    'a day moves over months and leap years',
    ending.addDays('2028-02-28', 1) === '2028-02-29' && ending.addDays('2027-02-28', 1) === '2027-03-01' && ending.addDays('2026-12-31', 90) === '2027-03-31',
  )
}

// What the accountant hands over: an export of the accounting program, ledgers, a spreadsheet; always downloaded
{
  const enc = new TextEncoder()
  const pdf = papers.sniffHandover(demo.demoPdf(100, 100, [{ text: 'Hlavna kniha' }]), 'hlavna-kniha.pdf')
  check('a PDF of the ledger is handed over and downloaded, not shown', pdf?.ext === 'pdf' && pdf.inline === false)
  const xlsx = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 20, 0, 0, 0, 8, 0, 0, 0, 0, 0, 0, 0])
  check(
    'a spreadsheet and a ZIP keep their ending; another ending of a ZIP is a ZIP',
    papers.sniffHandover(xlsx, 'Súvaha.xlsx')?.ext === 'xlsx' && papers.sniffHandover(xlsx, 'export.zip')?.ext === 'zip' && papers.sniffHandover(xlsx, 'virus.exe')?.ext === 'zip',
  )
  check(
    'a CSV and a text are text; XML is XML',
    papers.sniffHandover(enc.encode('Dátum;Suma\r\n2026-12-31;12,40\r\n'), 'dennik.csv')?.ext === 'csv' &&
      papers.sniffHandover(enc.encode('<?xml version="1.0"?><dataPack/>'), 'pohoda.xml')?.ext === 'xml' &&
      papers.sniffHandover(enc.encode('Poznámky'), 'readme')?.ext === 'txt',
  )
  check(
    'a program or anything with NUL bytes is refused, whatever it is called',
    papers.sniffHandover(new Uint8Array([0x4d, 0x5a, 0x90, 0, 3, 0, 0, 0]), 'kniha.pdf') === null && papers.sniffHandover(new Uint8Array([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1, 0]), 'x.csv') === null,
  )
  check('an old Excel file is one', papers.sniffHandover(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0]), 'kniha.xls')?.ext === 'xls')
}

// The terms say what the code does after the end
{
  const text = terms.termsText().replace(/ /g, ' ')
  check(
    'the terms promise ten days for the last month, thirty for the handover, ninety to download, then deleting',
    /10\.4 .*10 dní po jej skončení.*Do 30 dní.*90 dní po skončení zmluvy.*bodu 8\.8/.test(text) && /8\.8 .*po uplynutí 90 dní od skončenia ich vymažeme.*päť rokov/.test(text),
  )
  check("the figures of the terms are the config's", config.ENDING.intakeDays === 10 && config.ENDING.handoverDays === 30 && config.ENDING.keepDays === 90 && config.ENDING.recordsYears === 5)
}

// ---------------------------------------------------------------------------------------------------------------
// VAT: the return and the control statement, checked against the Financial Administration's own schemas
// ---------------------------------------------------------------------------------------------------------------
{
  const xsd = (name) => readFileSync(new URL(`./xsd/${name}`, import.meta.url), 'utf8')
  const DPH_XSD = xsd('dph2025.xsd')
  const KV_XSD = xsd('kv_dph_2025.xsd')
  const valid = async (xml, schema, name) => {
    const result = await validateXML({ xml: [{ fileName: `${name}.xml`, contents: xml }], schema: [{ fileName: `${name}.xsd`, contents: schema }] })
    return { ok: result.valid, why: result.errors.map((e) => e.message).join(' | ') }
  }

  // Periods and the deadline
  check('a month and a quarter of a day', vat.periodOf('2027-01-15', false) === '2027-01' && vat.periodOf('2027-05-31', true) === '2027-Q2' && vat.periodOf('2027-12-01', true) === '2027-Q4')
  check(
    'the days of a period',
    JSON.stringify(vat.periodRange('2027-Q1')) === JSON.stringify({ from: '2027-01-01', to: '2027-03-31' }) &&
      vat.periodRange('2028-02').to === '2028-02-29' &&
      vat.periodRange('2027-02').to === '2027-02-28',
  )
  check(
    'the next and the previous period',
    vat.nextPeriod('2027-12') === '2028-01' && vat.prevPeriod('2027-01') === '2026-12' && vat.nextPeriod('2027-Q4') === '2028-Q1' && vat.prevPeriod('2027-Q1') === '2026-Q4',
  )
  check('Easter of known years', vat.easter(2025) === '2025-04-20' && vat.easter(2026) === '2026-04-05' && vat.easter(2027) === '2027-03-28' && vat.easter(2030) === '2030-04-21')
  check(
    'Good Friday and Easter Monday are no working days, nor a weekend or Christmas',
    !vat.isWorkingDay('2027-03-26') &&
      !vat.isWorkingDay('2027-03-29') &&
      !vat.isWorkingDay('2027-09-25') &&
      !vat.isWorkingDay('2027-12-25') &&
      vat.isWorkingDay('2027-12-27') &&
      vat.isWorkingDay('2027-02-25'),
  )
  check(
    "the return is due on the 25th of the next month, a quarter's on the 25th after it",
    vat.filingDeadline('2027-01') === '2027-02-25' && vat.filingDeadline('2027-Q1') === '2027-04-26',
    vat.filingDeadline('2027-Q1'),
  )
  check('a deadline on a Saturday moves to Monday', vat.filingDeadline('2027-08') === '2027-09-27', vat.filingDeadline('2027-08'))
  check(
    'a deadline on Christmas moves past both days of it and the weekend',
    vat.filingDeadline('2027-11') === '2027-12-27' && vat.filingDeadline('2026-11') === '2026-12-28',
    `${vat.filingDeadline('2027-11')} ${vat.filingDeadline('2026-11')}`,
  )

  // The rate of a document from its total and VAT
  check('the rate of a receipt', vat.rateOf(1240, 232) === 23 && vat.rateOf(1190, 190) === 19 && vat.rateOf(1050, 50) === 5)
  check('a receipt of many lines rounded one by one still finds its rate', vat.rateOf(123_456, 23_084) === 23)
  check('two rates on one receipt are left to the accountant', vat.rateOf(2280, 280) === null && vat.rateOf(1000, 0) === null)
  check(
    'VAT numbers',
    vat.vatCountry('IE 6388047V') === 'IE' &&
      vat.isEuVatId('EL123456789') &&
      !vat.isEuVatId('GB123456789') &&
      vat.isSkVatId('SK2020000000') &&
      !vat.isSkVatId('SK202000000') &&
      vat.plainVatId(' sk 2020-000-000 ') === 'SK2020000000',
  )
  check('an invoice number for the control statement', vat.kvNumber('1 - A/2021') === '1-A/2021' && vat.kvNumber('') === '0' && vat.kvNumber(null) === '0')

  const payer = { status: 'payer', quarterly: false, since: null }
  const reg7a = { status: 'reg7a', quarterly: false, since: null }
  let n = 0
  const doc = (fields) => ({
    id: `d${++n}`,
    kind: 'invoice_in',
    number: `F${n}`,
    party: 'Dodávateľ s. r. o.',
    partyIco: '12345679',
    issuedOn: '2027-01-15',
    receivedOn: '2027-01-16',
    totalCents: null,
    vatCents: null,
    currency: 'EUR',
    category: 'services',
    vatDeduct: null,
    booked: true,
    vat: null,
    ...fields,
  })
  const v = (mode, lines, extra = {}) => ({
    mode,
    lines: lines.map(([rate, base, tax, deduct = 0]) => ({ rate, base, vat: tax, deduct })),
    suppliedOn: '2027-01-15',
    vatId: null,
    corrects: null,
    period: null,
    ...extra,
  })

  // Proposals
  const receipt = vat.proposeVat(doc({ kind: 'receipt', totalCents: 1240, vatCents: 232, category: 'material' }), payer)
  check(
    'a receipt is proposed with its rate and the VAT deducted',
    receipt?.mode === 'domestic' && receipt.lines.length === 1 && receipt.lines[0].rate === 23 && receipt.lines[0].base === 1008 && receipt.lines[0].deduct === 232,
  )
  const lunch = vat.proposeVat(doc({ kind: 'receipt', totalCents: 1240, vatCents: 232, category: 'representation' }), payer)
  check('representation is proposed without a deduction', lunch?.lines[0]?.deduct === 0)
  const google = vat.proposeVat(doc({ party: 'Google Ireland Limited', partyVatId: 'IE6388047V', totalCents: 20000, vatCents: 0 }), payer)
  check(
    'a service from abroad is proposed as reverse charge at 23 % with the deduction',
    google?.mode === 'reverse' && google.lines[0].rate === 23 && google.lines[0].base === 20000 && google.lines[0].vat === 4600 && google.lines[0].deduct === 4600,
  )
  const google7a = vat.proposeVat(doc({ partyVatId: 'IE6388047V', totalCents: 20000, vatCents: 0 }), reg7a)
  check('a person registered under § 7a pays it and deducts nothing', google7a?.mode === 'reverse' && google7a.lines[0].vat === 4600 && google7a.lines[0].deduct === 0)
  check('a § 7a person reports nothing of what it buys at home', vat.proposeVat(doc({ totalCents: 12300, vatCents: 2300 }), reg7a)?.mode === 'none')
  check('a company that is not registered reports nothing', vat.proposeVat(doc({ totalCents: 12300, vatCents: 2300 }), { status: 'none', quarterly: false, since: null })?.mode === 'none')
  check(
    'a bill in dollars waits for its euro amounts',
    (() => {
      const p = vat.proposeVat(doc({ currency: 'USD', totalCents: 2000, vatCents: 0 }), payer)
      return p?.mode === 'reverse' && p.lines.length === 0
    })(),
  )
  const einvoice = vat.proposeVat(
    doc({
      totalCents: 13780,
      vatCents: 2780,
      lines: [
        { rate: 23, base: 10000, vat: 2300 },
        { rate: 5, base: 1000, vat: 50 },
        { rate: 19, base: 0, vat: 0 },
      ],
    }),
    payer,
  )
  check('an e-invoice brings its own lines by rate', einvoice?.lines.length === 2 && einvoice.lines[1].rate === 5 && einvoice.lines[1].deduct === 50)
  const sold = vat.proposeVat(doc({ kind: 'invoice_out', partyVatId: 'CZ12345678', totalCents: 50000, vatCents: 0 }), payer)
  check('an invoice without VAT to a business in the EU is proposed as a service there', sold?.mode === 'eu_service' && sold.lines[0].rate === 0 && sold.lines[0].base === 50000)
  check('an invoice without VAT at home is proposed as exempt', vat.proposeVat(doc({ kind: 'invoice_out', totalCents: 50000, vatCents: 0 }), payer)?.mode === 'exempt')
  check('documents of the kind "other" are no VAT', vat.proposeVat(doc({ kind: 'other', totalCents: 100, vatCents: 0 }), payer) === null)

  // When a document is reported
  const acq = (issuedOn) => vat.taxDay(doc({ issuedOn }), v('acquisition', [[23, 100, 23]], { suppliedOn: '2027-01-10' }))
  check(
    'goods from the EU fall due on the invoice when it came before the 15th of the next month, else on the 15th',
    acq('2027-01-12') === '2027-01-12' && acq('2027-02-20') === '2027-02-15' && acq('2027-02-14') === '2027-02-14' && acq('2027-01-05') === '2027-01-10',
  )
  const late = doc({ issuedOn: '2027-01-20', receivedOn: '2027-02-27' })
  const lateData = v('domestic', [[23, 1000, 230, 230]], { suppliedOn: '2027-01-20' })
  check('a deduction belongs to the month of supply when the invoice came by its deadline', vat.periodOfDoc(doc({ issuedOn: '2027-01-20', receivedOn: '2027-02-25' }), lateData, payer) === '2027-01')
  check('an invoice that came after the deadline is deducted in the month it came', vat.periodOfDoc(late, lateData, payer) === '2027-02')
  check(
    'an invoice that came after its month was filed goes into the next open one',
    vat.periodOfDoc(doc({ issuedOn: '2027-01-20', receivedOn: '2027-02-20' }), lateData, payer, new Map([['2027-01', '2027-02-18']])) === '2027-02',
  )
  check(
    'what was sold stays in its month, filed or not',
    vat.periodOfDoc(
      doc({ kind: 'invoice_out', issuedOn: '2027-01-20', receivedOn: '2027-02-20' }),
      v('domestic', [[23, 1000, 230]], { suppliedOn: '2027-01-20' }),
      payer,
      new Map([['2027-01', '2027-02-18']]),
    ) === '2027-01',
  )
  check('the accountant may name the period', vat.periodOfDoc(late, { ...lateData, period: '2027-03' }, payer) === '2027-03')
  check('a quarterly payer reports a quarter', vat.periodOfDoc(late, lateData, { ...payer, quarterly: true }) === '2027-Q1')

  // A month of a payer with everything that is built
  const filer = { name: 'Ukážková firma s. r. o.', icdph: 'SK2120000000', address: 'Hlavná 12, 811 01 Bratislava', taxOffice: 'Bratislava', status: 'payer' }
  const month = [
    doc({ kind: 'invoice_out', number: '20270001', partyVatId: 'SK2020000000', vat: v('domestic', [[23, 100000, 23000]], { vatId: 'SK2020000000' }) }),
    doc({
      kind: 'invoice_out',
      number: '20270002',
      partyIco: null,
      vat: v('domestic', [
        [19, 10000, 1900],
        [5, 20000, 1000],
      ]),
    }),
    doc({ kind: 'invoice_in', number: 'FA 2027/15', vat: v('domestic', [[23, 50000, 11500, 11500]], { vatId: 'SK2121212121' }) }),
    doc({ kind: 'receipt', number: null, vat: v('domestic', [[23, 1008, 232, 232]]) }),
    doc({ kind: 'invoice_in', number: '5123456789', party: 'Google Ireland Limited', vat: v('reverse', [[23, 20000, 4600, 4600]], { vatId: 'IE6388047V' }) }),
    doc({ kind: 'invoice_in', number: 'R-77', issuedOn: '2027-01-12', vat: v('acquisition', [[23, 30000, 6900, 6900]], { vatId: 'DE123456789', suppliedOn: '2027-01-10' }) }),
    doc({ kind: 'invoice_out', number: '20270003', vat: v('eu_service', [[0, 50000, 0]], { vatId: 'CZ12345678' }) }),
    doc({ kind: 'invoice_out', number: '20270004', vat: v('eu_goods', [[0, 40000, 0]], { vatId: 'AT U12345678'.replace(' ', '') }) }),
    doc({ kind: 'invoice_out', number: '20270005', vat: v('domestic', [[23, -10000, -2300]], { vatId: 'SK2020000000', corrects: '20261231' }) }),
    doc({ kind: 'invoice_in', number: 'D-9', vat: v('domestic', [[23, -5000, -1150, -1150]], { vatId: 'SK2121212121', corrects: 'FA 2026/99' }) }),
    doc({ kind: 'invoice_in', number: 'X', issuedOn: '2027-02-02', vat: v('domestic', [[23, 1000, 230, 230]], { vatId: 'SK2121212121', suppliedOn: '2027-02-02' }) }),
  ]
  const jan = vat.workOut(payer, '2027-01', month)
  const r = jan.rows
  check(
    'sales at home by rate: 19 % in 01 and 02, 5 % in 01a and 02a, 23 % in 03 and 04',
    r.r01 === 10000 && r.r02 === 1900 && r.r01a === 20000 && r.r02a === 1000 && r.r03 === 100000 && r.r04 === 23000,
    JSON.stringify(r),
  )
  check('goods from the EU in 07 and 08, a service from abroad in 09b and 10b', r.r07 === 30000 && r.r08 === 6900 && r.r09b === 20000 && r.r10b === 4600)
  check('supplies of goods to the EU in 13 and 14; a service sold to the EU is not in the return', r.r13 === 40000 && r.r14 === 40000 && r.r15 === 0)
  check('the tax in 17 is the sum of the tax rows', r.r17 === 1900 + 1000 + 23000 + 6900 + 4600)
  check('deductions in 19, of which from Slovak suppliers in 21', r.r19 === 11500 + 232 + 4600 + 6900 && r.r21 === 11500 + 232 && r.r18 === 0 && r.r20 === 0)
  check('a credit note issued in 24 and 25, one received in 28', r.r24 === -10000 && r.r25 === -2300 && r.r28 === 1150)
  const result = r.r17 - r.r19 + r.r25 + r.r28
  check("the result is the payer's own liability, in 32 and 35", result > 0 && r.r32 === result && r.r35 === result && r.r33 === 0)
  check("a document of February is not January's", !jan.docs.some((d) => d.doc.number === 'X'))
  check(
    'A.1 to a business, D.2 to consumers',
    jan.kv.a1.length === 1 && jan.kv.a1[0].odb === 'SK2020000000' && jan.kv.a1[0].den === '2027-01-15' && jan.kv.d2?.zzn === 30000 && jan.kv.d2.dzn === 2900 && jan.kv.d2.z === 0,
  )
  check(
    'B.1 for both purchases from abroad, B.2 for the Slovak invoice, B.3.1 for the receipt',
    jan.kv.b1.length === 2 && jan.kv.b2.length === 1 && jan.kv.b2[0].f === 'FA2027/15' && jan.kv.b31?.o === 232,
  )
  check('C.1 and C.2 name the invoices they correct', jan.kv.c1[0]?.fp === '20261231' && jan.kv.c2[0]?.fp === 'FA2026/99' && jan.kv.c2[0].or === -1150)
  check(
    'a sale to the EU asks for the recapitulative statement',
    jan.issues.some((i) => i.code === 'summary'),
  )
  check('the month is ready to file', !jan.issues.some((i) => i.level === 'block'), JSON.stringify(jan.issues))
  check('the rows the documents make are known', jan.sources.get('r19')?.size === 4 && jan.sources.get('A1')?.size === 1)

  const returnXml = vatXml.returnXml(filer, '2027-01', r, { declaredOn: '2027-02-10', nothing: jan.nothing })
  const returned = await valid(returnXml, DPH_XSD, 'dph')
  check('the return is valid against dph2025.xsd', returned.ok, returned.why)
  check(
    'the return reads as the eForm writes it',
    returnXml.includes('<r03>1000.00</r03>') &&
      returnXml.includes('<r24>-100.00</r24>') &&
      returnXml.includes('<r33></r33>') &&
      returnXml.includes('<mesiac>1</mesiac><stvrtrok></stvrtrok><rok>2027</rok>') &&
      returnXml.includes('<platitel>1</platitel><registrovana>0</registrovana>') &&
      returnXml.includes('<datumVyhlasenia>10.02.2027</datumVyhlasenia>') &&
      returnXml.includes('<psc>81101</psc><obec>Bratislava</obec>'),
  )
  check("the rows come in the schema's order, the refund condition after row 32", /<r32>[\d.]+<\/r32>\n<splneniePodmienok>0<\/splneniePodmienok>\n<r33><\/r33>/.test(returnXml))
  const kvXml = vatXml.statementXml(filer, '2027-01', jan.kv)
  const kvValid = await valid(kvXml, KV_XSD, 'kv')
  check('the control statement is valid against kv_dph_2025.xsd', kvValid.ok, kvValid.why)
  check(
    'the control statement is in its namespace with ISO dates',
    kvXml.includes('<KVDPH_2025 xmlns="https://ekr.financnasprava.sk/Formulare/XSD/kv_dph_2025.xsd">') &&
      kvXml.includes('Den="2027-01-15"') &&
      kvXml.includes('<Mesiac>1</Mesiac>') &&
      kvXml.includes('<B31 Z="10.08" D="2.32" O="2.32"/>'),
  )
  check(
    "the sections come in the schema's order",
    ['<A1', '<B1', '<B2', '<B31', '<C1', '<C2', '<D2'].map((tag) => kvXml.indexOf(tag)).every((at, i, all) => at > 0 && (i === 0 || at > all[i - 1])),
  )

  // The excess deduction of the period before, and the box of § 79(2)
  const carriedRows = vat.workOut(payer, '2027-01', [doc({ kind: 'invoice_out', number: 'C1', vat: v('domestic', [[23, 10000, 2300]], { vatId: 'SK2020000000' }) })], new Map(), 5000).rows
  check(
    'an excess deduction carried in is deducted up to the own liability (row 34), the rest is refunded',
    carriedRows.r32 === 2300 && carriedRows.r34 === 2300 && carriedRows.r35 === 0,
    JSON.stringify(carriedRows),
  )
  const smallCarry = vat.workOut(payer, '2027-01', [doc({ kind: 'invoice_out', number: 'C1', vat: v('domestic', [[23, 10000, 2300]], { vatId: 'SK2020000000' }) })], new Map(), 500).rows
  check('and only that much', smallCarry.r34 === 500 && smallCarry.r35 === 1800)
  check(
    'a monthly payer registered 12 months before the month ends may have it refunded at once',
    vat.fastRefundAllowed({ ...payer, since: '2026-01-15' }, '2027-01') &&
      !vat.fastRefundAllowed({ ...payer, since: '2026-02-15' }, '2027-01') &&
      !vat.fastRefundAllowed({ ...payer, since: '2025-01-01', quarterly: true }, '2027-Q1') &&
      !vat.fastRefundAllowed({ ...payer, since: null }, '2027-01'),
  )
  const excessRows = vat.workOut(payer, '2027-01', [doc({ vat: v('domestic', [[23, 100000, 23000, 23000]], { vatId: 'SK2121212121' }) })]).rows
  const fastXml = vatXml.returnXml(filer, '2027-01', excessRows, { declaredOn: '2027-02-10', nothing: false, fastRefund: true })
  check('the box is marked in the return, before row 33', fastXml.includes('<splneniePodmienok>1</splneniePodmienok>\n<r33>230.00</r33>') && (await valid(fastXml, DPH_XSD, 'fast')).ok)

  // Corrections: rows 36 and 37 as the poučenie has them (its example: -60 becomes 760 with a forgotten invoice of 820)
  const rowsOf = (fields) => ({ ...vat.emptyRows(), ...fields })
  const minus60 = { rows: rowsOf({ r33: 6000 }), pay: 0, refund: 6000 }
  let st = vat.settle(minus60, rowsOf({ r32: 76000 }), false)
  check('an excess deduction not yet refunded gives way: row 36 +820, row 37 +760', st.r36 === 82000 && st.r37 === 76000 && st.pay === 76000 && st.refund === 0, JSON.stringify(st))
  st = vat.settle(minus60, rowsOf({ r32: 76000 }), true)
  check('one already refunded is paid back with the rest: row 37 +820', st.r37 === 82000 && st.pay === 82000 && st.refund === 6000, JSON.stringify(st))
  st = vat.settle(minus60, rowsOf({ r33: 10000 }), false)
  check('an excess deduction that only grows settles nothing (row 37 empty)', st.r36 === -4000 && st.r37 === null && st.pay === 0 && st.refund === 10000, JSON.stringify(st))
  const paid100 = { rows: rowsOf({ r32: 10000, r35: 10000 }), pay: 10000, refund: 0 }
  st = vat.settle(paid100, rowsOf({ r32: 15000 }), false)
  check('a liability that grows: the difference to pay', st.r36 === 5000 && st.r37 === 5000 && st.pay === 15000)
  st = vat.settle(paid100, rowsOf({ r32: 4000 }), false)
  check('one that shrinks: less to pay in all', st.r37 === -6000 && st.pay === 4000 && st.refund === 0)
  st = vat.settle(paid100, rowsOf({ r33: 5000 }), false)
  check('one that turns into an excess deduction: nothing to pay, the rest back', st.r36 === -15000 && st.pay === 0 && st.refund === 5000, JSON.stringify(st))
  check('nothing changed in the result: rows 36 and 37 empty', vat.settle(paid100, rowsOf({ r32: 10000 }), false).r37 === null)

  // The control statement's correction codes
  const kvBefore = vat.kvFileOf(jan.kv)
  const kvNow = { ...kvBefore, a1: [{ ...kvBefore.a1[0], z: 110000, d: 25300 }], b31: [{ ...kvBefore.b31[0], z: 2016, d: 464, o: 464 }] }
  const diff = vat.kvDiff(kvBefore, kvNow)
  check(
    'a line that changed is taken back with 1 and given again with 2; what stayed is not repeated',
    diff.a1.length === 2 &&
      diff.a1[0].k === 1 &&
      diff.a1[0].z === 100000 &&
      diff.a1[1].k === 2 &&
      diff.a1[1].z === 110000 &&
      diff.b2.length === 0 &&
      diff.b31.length === 2 &&
      vat.kvFileLines(diff) === 4,
    JSON.stringify(diff),
  )
  check(
    'a line gone is only taken back, a new one only given',
    vat
      .kvDiff(kvBefore, { ...kvBefore, b2: [] })
      .b2.map((l) => l.k)
      .join() === '1' &&
      vat
        .kvDiff({ ...kvBefore, b2: [] }, kvBefore)
        .b2.map((l) => l.k)
        .join() === '2' &&
      vat.kvFileLines(vat.kvDiff(kvBefore, kvBefore)) === 0,
  )
  const dKv = vatXml.statementXml(filer, '2027-01', diff, 'D')
  const dKvValid = await valid(dKv, KV_XSD, 'kvD')
  check(
    'a supplementary control statement is valid, of kind D, with its codes',
    dKvValid.ok && dKv.includes('<Druh>D</Druh>') && dKv.includes('KOpr="1"') && dKv.includes('KOpr="2"') && !dKv.includes('<B2'),
    dKvValid.why,
  )
  const oKv = vatXml.statementXml(filer, '2027-01', kvNow, 'O')
  check(
    'a corrective one is the whole statement again, of kind O, without codes',
    oKv.includes('<Druh>O</Druh>') && !oKv.includes('KOpr') && oKv.includes('<B2') && (await valid(oKv, KV_XSD, 'kvO')).ok,
  )
  const dRows = { ...r, r03: r.r03 + 10000, r04: r.r04 + 2300, r36: 2300, r37: 2300 }
  const dXml = vatXml.returnXml(filer, '2027-01', dRows, { declaredOn: '2027-04-02', nothing: false, kind: 'D', foundOn: '2027-04-01' })
  const dValid = await valid(dXml, DPH_XSD, 'dphD')
  check(
    'a supplementary return is valid, marked so, with the day of finding and rows 36 and 37',
    dValid.ok && dXml.includes('<rdp>0</rdp><odp>0</odp><ddp>1</ddp><datumZisteniaDdp>01.04.2027</datumZisteniaDdp>') && dXml.includes('<r36>23.00</r36>') && dXml.includes('<r37>23.00</r37>'),
    dValid.why,
  )
  const oXml = vatXml.returnXml(filer, '2027-01', r, { declaredOn: '2027-02-20', nothing: false, kind: 'O' })
  check('a corrective return is marked so', oXml.includes('<rdp>0</rdp><odp>1</odp><ddp>0</ddp><datumZisteniaDdp></datumZisteniaDdp>') && (await valid(oXml, DPH_XSD, 'dphO')).ok)

  // A person registered under § 7a: the return alone, with what it pays on services from abroad
  const europio = { ...filer, name: 'europio s. r. o.', icdph: 'SK2122734449', address: 'K lesu 2218/39A, 040 18 Košice', taxOffice: 'Košice', status: 'reg7a' }
  const ads = [
    doc({ number: '5200000001', vat: v('reverse', [[23, 10000, 2300, 2300]], { vatId: 'IE6388047V' }) }),
    doc({ number: 'AN-1', vat: v('reverse', [[23, 4000, 920]], { vatId: null }) }),
    doc({ kind: 'receipt', totalCents: 1240, vatCents: 232 }),
  ]
  const oct = vat.workOut(reg7a, '2027-01', ads)
  check(
    '§ 7a: the base and the tax in 09b and 10b, the tax to pay in 17, 32 and 35, no deduction',
    oct.rows.r09b === 14000 && oct.rows.r10b === 3220 && oct.rows.r17 === 3220 && oct.rows.r19 === 0 && oct.rows.r32 === 3220 && oct.rows.r35 === 3220,
    JSON.stringify(oct.rows),
  )
  check(
    '§ 7a: a deduction entered by mistake is said and left out',
    oct.issues.some((i) => i.code === 'deduct7a'),
  )
  check('§ 7a: no control statement', !oct.statement && oct.kv.b1.length === 0)
  const xml7a = vatXml.returnXml(europio, '2027-01', oct.rows, { declaredOn: '2027-02-10', nothing: false })
  const valid7a = await valid(xml7a, DPH_XSD, 'dph7a')
  check(
    '§ 7a: the return is valid and says "iná osoba registrovaná pre daň", without a DIČ',
    valid7a.ok &&
      xml7a.includes('<platitel>0</platitel><registrovana>1</registrovana>') &&
      xml7a.includes('<dic></dic>') &&
      xml7a.includes('<cislo>2122734449</cislo>') &&
      xml7a.includes('<ulica>K lesu</ulica><cislo>2218/39A</cislo><psc>04018</psc><obec>Košice</obec>'),
    valid7a.why,
  )
  check(
    '§ 7a: a credit note from abroad can make row 32 negative',
    vat.workOut(reg7a, '2027-01', [doc({ number: 'CN1', vat: v('reverse', [[23, -1000, -230]], { corrects: '5200000001' }) })]).rows.r32 === -230,
  )

  // Nothing in a month, a refund, a quarter
  const empty = vat.workOut(payer, '2027-03', [])
  const emptyXml = vatXml.returnXml(filer, '2027-03', empty.rows, { declaredOn: '2027-04-10', nothing: empty.nothing })
  const emptyValid = await valid(emptyXml, DPH_XSD, 'empty')
  check('a month without anything says so, and is valid', empty.nothing && emptyXml.includes('<nevzniklaPov>1</nevzniklaPov>') && emptyValid.ok, emptyValid.why)
  const refund = vat.workOut(payer, '2027-01', [doc({ vat: v('domestic', [[23, 100000, 23000, 23000]], { vatId: 'SK2121212121' }) })])
  check('more deducted than due is an excess deduction in 33, nothing in 32 or 35', refund.rows.r33 === 23000 && refund.rows.r32 === 0 && refund.rows.r35 === 0)
  const refundXml = vatXml.returnXml(filer, '2027-01', refund.rows, { declaredOn: '2027-02-10', nothing: false })
  check('an excess deduction is written as a positive amount in 33', refundXml.includes('<r32></r32>') && refundXml.includes('<r33>230.00</r33>') && (await valid(refundXml, DPH_XSD, 'refund')).ok)
  const quarterly = { ...payer, quarterly: true }
  const q1 = vat.workOut(quarterly, '2027-Q1', [doc({ kind: 'invoice_out', number: 'Q', issuedOn: '2027-03-31', vat: v('domestic', [[23, 1000, 230]], { suppliedOn: '2027-03-31' }) })])
  const q1Xml = vatXml.returnXml(filer, '2027-Q1', q1.rows, { declaredOn: '2027-04-10', nothing: false })
  const q1Kv = vatXml.statementXml(filer, '2027-Q1', q1.kv)
  check(
    'a quarter: I in the return, 1 in the control statement, both valid',
    q1.rows.r04 === 230 &&
      q1Xml.includes('<mesiac></mesiac><stvrtrok>I</stvrtrok>') &&
      q1Kv.includes('<Stvrtrok>1</Stvrtrok>') &&
      (await valid(q1Xml, DPH_XSD, 'q1')).ok &&
      (await valid(q1Kv, KV_XSD, 'q1kv')).ok,
  )

  // What keeps a period from being filed
  const blocked = vat.workOut(payer, '2027-01', [
    doc({ booked: false, vat: v('domestic', [[23, 1000, 230, 230]], { vatId: 'SK2121212121' }) }),
    doc({ vat: v('domestic', [[23, 1000, 230, 230]]) }),
    doc({ vat: v('domestic', [[21, 1000, 210, 210]], { vatId: 'SK2121212121' }) }),
    doc({ vat: v('exempt', [[23, 1000, 230]]), kind: 'invoice_out' }),
    doc({ vat: v('reverse', [], { vatId: 'US123' }), currency: 'USD' }),
    doc({ kind: null, booked: false, issuedOn: '2027-01-03' }),
  ])
  const codes = blocked.issues
    .filter((i) => i.level === 'block')
    .map((i) => i.code)
    .sort()
    .join(' ')
  check(
    "an unbooked document, a Slovak invoice without the supplier's VAT number, a rate that is none, VAT on an exempt supply, dollars without euros, an unread document",
    codes === 'currency lines mismatch rate supplierVatId unbooked unbooked',
    codes,
  )
  const big = vat.workOut(payer, '2027-01', [
    doc({ kind: 'receipt', vat: v('domestic', [[23, 1_000_000, 230_000, 230_000]], { vatId: 'SK2020202020' }) }),
    doc({ kind: 'receipt', vat: v('domestic', [[23, 400_000, 92_000, 92_000]], { vatId: 'SK2020202020' }) }),
    doc({ kind: 'receipt', vat: v('domestic', [[23, 10_000, 2_300, 2_300]], { vatId: '' }) }),
  ])
  check(
    'from 3 000 € deducted from receipts, B.3.2 by supplier; one without a VAT number stops it',
    big.kv.b31 === null && big.kv.b32.length === 1 && big.kv.b32[0].o === 322_000 && big.issues.some((i) => i.code === 'simplifiedVatId'),
  )
  check(
    'a company registered later reports nothing from before',
    vat.workOut({ ...payer, since: '2027-01-20' }, '2027-01', [doc({ kind: 'invoice_out', issuedOn: '2027-01-10', vat: v('domestic', [[23, 1000, 230]], { suppliedOn: '2027-01-10' }) })]).rows.r04 ===
      0,
  )
  check(
    'a company that is not registered and buys a service from abroad is told it must register',
    vat.workOut({ status: 'none', quarterly: false, since: null }, '2027-01', [doc({ partyVatId: 'IE6388047V', totalCents: 10000, vatCents: 0 })]).issues.some((i) => i.code === 'needs7a'),
  )

  // The address and the name as the forms take them
  check('an address in its parts', JSON.stringify(vatXml.addressParts('K lesu 2218/39A, 040 18 Košice')) === JSON.stringify({ street: 'K lesu', number: '2218/39A', postal: '04018', city: 'Košice' }))
  check('a village without streets', JSON.stringify(vatXml.addressParts('Lehota 123, 951 36')) === JSON.stringify({ street: '', number: '123', postal: '95136', city: 'Lehota' }))
  check('amounts as the forms write them', vatXml.amount(123456) === '1234.56' && vatXml.amount(-5) === '-0.05' && vatXml.amount(0) === '0.00')
  check('a long name in lines of the form', vatXml.nameLines('A '.repeat(80).trim()).length === 2 && vatXml.nameLines('europio s. r. o.').length === 1)
  check("the tax offices are the eForm's nine", vatXml.TAX_OFFICES.length === 9 && vatXml.isTaxOffice('Košice') && !vatXml.isTaxOffice('Kosice'))
  check(
    'a name with an ampersand is escaped and still valid',
    await (async () => {
      const x = vatXml.statementXml({ ...filer, name: 'A & B s. r. o.' }, '2027-01', jan.kv)
      return x.includes('A &amp; B') && (await valid(x, KV_XSD, 'amp')).ok
    })(),
  )

  // When the control statement is filed (§ 78a(1), as the Financial Administration explains it): with every return
  // of a payer, also with nothing in its parts, but not with a nil return or one of goods to the EU and exports alone.
  check('a nil return: no control statement', !empty.statement && empty.nothing)
  const goods = vat.workOut(payer, '2027-01', [
    doc({ kind: 'invoice_out', vatId: null, vat: v('eu_goods', [[0, 50000, 0]], { vatId: 'DE123456789' }) }),
    doc({ kind: 'invoice_out', vat: v('export', [[0, 20000, 0]]) }),
  ])
  check(
    'goods to the EU and an export without a deduction: no control statement',
    !goods.statement && goods.rows.r13 === 70000 && goods.rows.r14 === 50000 && goods.rows.r15 === 20000,
    JSON.stringify({ s: goods.statement, r13: goods.rows.r13 }),
  )
  const rent = vat.workOut(payer, '2027-01', [doc({ kind: 'invoice_out', vat: v('exempt', [[0, 80000, 0]]) })])
  check("an exempt rent alone: the control statement with the company's details only", rent.statement && vat.kvRows(rent.kv) === 0 && rent.rows.r13 === 80000)
  const goodsAndCost = vat.workOut(payer, '2027-01', [
    doc({ kind: 'invoice_out', vat: v('eu_goods', [[0, 50000, 0]], { vatId: 'DE123456789' }) }),
    doc({ vat: v('domestic', [[23, 1000, 230, 230]], { vatId: 'SK2121212121' }) }),
  ])
  check('goods to the EU with a deduction: the control statement is filed', goodsAndCost.statement && goodsAndCost.kv.b2.length === 1)
  check(
    'a company that is not registered is warned before the invoice is booked',
    vat
      .workOut({ status: 'none', quarterly: false, since: null }, '2027-01', [doc({ booked: false, partyVatId: 'IE6388047V', totalCents: 3000, vatCents: 0 })])
      .issues.map((i) => i.code)
      .join() === 'needs7a',
  )

  // How VAT is paid: the variable symbol, the account and the IBAN of the State Treasury
  check(
    'the variable symbol of a month and of a quarter (podnikajte.sk, 2026)',
    vatStore.vatSymbol('2026-09') === '1100092026' && vatStore.vatSymbol('2026-Q1') === '1100412026' && vatStore.vatSymbol('2026-06') === '1100062026',
  )
  const iban = vatStore.taxIban('7000123456')
  const mod97 = (text) =>
    [...(text.slice(4) + text.slice(0, 4))]
      .map((ch) => (ch >= 'A' ? String(ch.charCodeAt(0) - 55) : ch))
      .join('')
      .split('')
      .reduce((rest, digit) => (rest * 10 + Number(digit)) % 97, 0)
  check(
    'the VAT account: 8180, the prefix 500240 and the personal account, with valid check digits',
    iban === 'SK2281805002407000123456' &&
      mod97(iban) === 1 &&
      vatStore.taxIban('123456') === `SK${vatStore.taxIban('123456').slice(2, 4)}81805002400000123456` &&
      mod97(vatStore.taxIban('123456')) === 1,
    iban,
  )
  check(
    'a personal account typed any way',
    vatStore.taxAccountOf('7000123456') === '7000123456' &&
      vatStore.taxAccountOf('500224-7000123456/8180') === '7000123456' &&
      vatStore.taxAccountOf('SK22 8180 5002 4070 0012 3456') === '7000123456' &&
      vatStore.taxAccountOf('0000123456') === '123456',
  )
  check(
    'and refused when it is none',
    vatStore.taxAccountOf('SK23 8180 5002 4070 0012 3456') === null &&
      vatStore.taxAccountOf('abc') === null &&
      vatStore.taxAccountOf('') === null &&
      vatStore.taxAccountOf('12345678901') === null &&
      vatStore.taxAccountOf('12-34') === null &&
      vatStore.taxAccountOf('500240-1234567890/0900') === null,
  )
  check('a period as it is said', vatStore.periodName('2026-09') === 'september 2026' && vatStore.periodName('2026-Q3').includes('štvrťrok 2026'))
  check(
    '§ 7a: tax of 5 € or less is not paid; a payer pays every cent',
    vatStore.payable({ vatStatus: 'reg7a' }, { payCents: 500 }) === 0 &&
      vatStore.payable({ vatStatus: 'reg7a' }, { payCents: 501 }) === 501 &&
      vatStore.payable({ vatStatus: 'payer' }, { payCents: 460 }) === 460,
  )

  // Where a period stands, and which periods are shown
  const company = (fields = {}) => ({
    id: 'c1',
    name: 'Firma s. r. o.',
    icdph: 'SK2120000007',
    address: 'Hlavná 1, 040 01 Košice',
    taxOffice: 'Košice',
    vatStatus: 'payer',
    vatQuarterly: false,
    vatSince: null,
    startOn: null,
    taxAccount: null,
    vatCarry: 0,
    ...fields,
  })
  check(
    "what the forms' header lacks",
    vatStore.companyIssues(company({ icdph: null, taxOffice: null, address: null })).join() === 'icdph,office,address' &&
      vatStore.companyIssues(company({ vatStatus: 'none', icdph: null })).length === 0 &&
      vatStore.companyIssues(company()).length === 0,
  )
  check('six periods up to the running one', vatStore.stripOf(company(), '2026-09', '2026-10-14').join() === '2026-05,2026-06,2026-07,2026-08,2026-09,2026-10')
  check(
    'none before our contract or the registration',
    vatStore.stripOf(company({ startOn: '2026-09-01' }), '2026-09', '2026-10-14').join() === '2026-09,2026-10' &&
      vatStore.stripOf(company({ vatSince: '2026-08-15' }), '2026-09', '2026-10-14').join() === '2026-08,2026-09,2026-10',
  )
  check('an older period asked for is shown among its neighbours', vatStore.stripOf(company(), '2025-12', '2026-10-14').join() === '2025-10,2025-11,2025-12,2026-01,2026-02,2026-03')
  check('quarters for a quarterly payer', vatStore.stripOf(company({ vatQuarterly: true }), '2026-Q3', '2026-10-14').join() === '2025-Q3,2025-Q4,2026-Q1,2026-Q2,2026-Q3,2026-Q4')
  const sample = (fields) => ({
    id: 's1',
    companyId: 'c1',
    createdAt: Date.parse('2026-09-20T10:00:00Z') / 1000,
    kind: 'invoice_out',
    number: '20260001',
    party: 'Zákazník s. r. o.',
    partyIco: '12345679',
    issuedOn: '2026-09-18',
    dueOn: null,
    totalCents: 12300,
    vatCents: 2300,
    currency: 'EUR',
    category: 'sales',
    vatDeduct: null,
    bookedAt: 1,
    vat: { mode: 'domestic', lines: [{ rate: 23, base: 10000, vat: 2300, deduct: 0 }], suppliedOn: null, vatId: null, corrects: null, period: null },
    partyVatId: null,
    suppliedOn: null,
    foreign: null,
    correctsHint: null,
    linesHint: [],
    ...fields,
  })
  const sepKv = { ...vat.kvFileOf({ a1: [], b1: [], b2: [], b31: null, b32: [], c1: [], c2: [], d2: null }), a1: [{ odb: null, f: '20260001', den: '2026-09-18', z: 10000, d: 2300, s: 23 }] }
  const filedSep = {
    period: '2026-09',
    filedAt: 0,
    filedOn: '2026-10-20',
    filedBy: null,
    filedByName: null,
    rows: { ...vat.emptyRows(), r03: 10000, r04: 2300, r17: 2300, r32: 2300, r35: 2300 },
    kvRows: 1,
    payCents: 2300,
    refundCents: 0,
    dueOn: '2026-10-26',
    kind: 'R',
    fast: false,
    carried: 0,
    kv: { kind: 'R', full: sepKv, sent: sepKv },
    foundOn: null,
    prev: null,
    raw: '{}',
  }
  check('a period that has not ended runs', vatStore.viewOf(company(), '2026-10', [], [], '2026-10-14').state === 'running')
  check('a period with everything in order is ready', vatStore.viewOf(company(), '2026-09', [sample()], [], '2026-10-14').state === 'ready')
  check("the forms' header lacking blocks it", vatStore.viewOf(company({ taxOffice: null }), '2026-09', [sample()], [], '2026-10-14').state === 'blocked')
  check('filed as it stands', vatStore.viewOf(company(), '2026-09', [sample()], [filedSep], '2026-10-21').state === 'filed')
  const later = vatStore.viewOf(company(), '2026-09', [sample(), sample({ id: 's2', number: '20260002', issuedOn: '2026-09-28' })], [filedSep], '2026-10-21')
  check('a document added after filing changes it, row by row', later.state === 'changed' && later.changed.join() === 'r03,r04,r17,r32,r35', later.changed.join())

  // What is filed, and how a period filed is corrected
  const readyPlan = vatStore.planFiling(company(), vatStore.viewOf(company(), '2026-09', [sample()], [], '2026-10-14'), [], '2026-10-14')
  check(
    'a period ready: the regular return and its control statement',
    readyPlan?.kind === 'R' && readyPlan.returnNeeded && readyPlan.kv?.kind === 'R' && readyPlan.kv.sent.a1.length === 1 && readyPlan.pay === 2300 && readyPlan.dueOn === '2026-10-26',
    JSON.stringify(readyPlan && { kind: readyPlan.kind, pay: readyPlan.pay, due: readyPlan.dueOn }),
  )
  const corrective = vatStore.planFiling(company(), later, [filedSep], '2026-10-21')
  check(
    'changed before the deadline: a corrective return and control statement in their place',
    corrective?.kind === 'O' && corrective.kv?.kind === 'O' && corrective.kv.sent.a1.length === 2 && corrective.pay === 4600 && corrective.replaces === filedSep && corrective.dueOn === '2026-10-26',
    JSON.stringify(corrective && { kind: corrective.kind, pay: corrective.pay }),
  )
  const laterAfter = vatStore.viewOf(company(), '2026-09', [sample(), sample({ id: 's2', number: '20260002', issuedOn: '2026-09-28' })], [filedSep], '2026-11-03')
  const supplementary = vatStore.planFiling(company(), laterAfter, [filedSep], '2026-11-03', { foundOn: '2026-11-02' })
  check(
    'after the deadline: a supplementary return with rows 36 and 37, due at the end of the month after the finding',
    supplementary?.kind === 'D' &&
      supplementary.rows.r36 === 2300 &&
      supplementary.rows.r37 === 2300 &&
      supplementary.pay === 4600 &&
      supplementary.foundOn === '2026-11-02' &&
      supplementary.dueOn === '2026-12-31',
    JSON.stringify(supplementary && { kind: supplementary.kind, r36: supplementary.rows.r36, due: supplementary.dueOn }),
  )
  check(
    'and a supplementary control statement of the new line alone',
    supplementary?.kv?.kind === 'D' && supplementary.kv.sent.a1.length === 1 && supplementary.kv.sent.a1[0].k === 2 && supplementary.kv.full.a1.length === 2,
  )
  check(
    'a day of finding before the filing, or ahead, is today',
    vatStore.planFiling(company(), laterAfter, [filedSep], '2026-11-03', { foundOn: '2026-10-01' })?.foundOn === '2026-11-03' &&
      vatStore.planFiling(company(), laterAfter, [filedSep], '2026-11-03', { foundOn: '2026-12-01' })?.foundOn === '2026-11-03',
  )
  const typo = vatStore.viewOf(company(), '2026-09', [sample({ number: '2026-0001' })], [filedSep], '2026-11-03')
  const typoPlan = vatStore.planFiling(company(), typo, [filedSep], '2026-11-03')
  check(
    'a correction of the control statement alone files no return',
    typo.state === 'changed' &&
      typo.changed.length === 0 &&
      typoPlan?.returnNeeded === false &&
      typoPlan.kv?.kind === 'D' &&
      typoPlan.kv.sent.a1.map((l) => l.k).join() === '1,2' &&
      typoPlan.pay === 2300,
    JSON.stringify(typoPlan && { needed: typoPlan.returnNeeded, kv: typoPlan.kv }),
  )
  // A month filed with an excess deduction, corrected after the deadline: settled once the next month was filed
  const excessSepFiled = { ...filedSep, rows: { ...vat.emptyRows(), r19: 5000, r21: 5000, r33: 5000 }, payCents: 0, refundCents: 5000 }
  const pendingPlan = vatStore.planFiling(company(), vatStore.viewOf(company(), '2026-09', [sample()], [excessSepFiled], '2026-11-03'), [excessSepFiled], '2026-11-03')
  const octFiled = { ...filedSep, period: '2026-10', rows: vat.emptyRows(), payCents: 0, kv: null }
  const settledPlan = vatStore.planFiling(company(), vatStore.viewOf(company(), '2026-09', [sample()], [excessSepFiled, octFiled], '2026-11-03'), [excessSepFiled, octFiled], '2026-11-03')
  check(
    'an excess deduction not yet settled is asked about, and replaced; settled once the next month was filed',
    pendingPlan?.askSettled && !pendingPlan.settled && pendingPlan.rows.r37 === 2300 && settledPlan?.settled && settledPlan.rows.r37 === 7300,
    JSON.stringify([pendingPlan?.rows.r37, settledPlan?.rows.r37]),
  )
  check(
    'a period filed gives its files again as filed',
    vatStore.planFiling(company(), vatStore.viewOf(company(), '2026-09', [sample()], [filedSep], '2026-11-03'), [filedSep], '2026-11-03')?.kv === filedSep.kv,
  )

  // The excess deduction carried from the month before, and the month before first
  const excessAug = { ...filedSep, period: '2026-08', rows: { ...vat.emptyRows(), r33: 5000 }, payCents: 0, refundCents: 5000, kv: null }
  check(
    'the excess deduction of the month before is carried into this one',
    vatStore.carriedInto(company(), '2026-09', [excessAug]) === 5000 &&
      vatStore.carriedInto(company(), '2026-09', [{ ...excessAug, fast: true }]) === 0 &&
      vatStore.viewOf(company(), '2026-09', [sample()], [excessAug], '2026-10-14').result.rows.r34 === 2300,
  )
  check('a month filed keeps what it carried', vatStore.carriedInto(company(), '2026-09', [excessAug, { ...filedSep, carried: 1000 }]) === 1000)
  check(
    'our first month carries what the company brought from before us',
    vatStore.carriedInto(company({ startOn: '2026-09-01', vatCarry: 1200 }), '2026-09', []) === 1200 && vatStore.carriedInto(company({ startOn: '2026-09-01', vatCarry: 1200 }), '2026-10', []) === 0,
  )
  const second = vatStore.viewOf(company({ startOn: '2026-08-01' }), '2026-09', [sample()], [], '2026-10-14')
  check(
    'a month of ours whose month before is not filed waits for it',
    second.state === 'blocked' && second.previous === '2026-08' && vatStore.viewOf(company({ startOn: '2026-09-01' }), '2026-09', [sample()], [], '2026-10-14').previous === null,
  )
  check('a supplementary deadline off a weekend', vatStore.supplementaryDeadline('2027-01-10') === '2027-03-01' && vatStore.supplementaryDeadline('2026-11-02') === '2026-12-31')
  check(
    'what is left to pay, and what was paid over',
    vatStore.leftToPay({ vatStatus: 'payer' }, { payCents: 5750 }, { cents: 1150, last: '2026-10-20' }) === 4600 &&
      vatStore.overpaid({ vatStatus: 'payer' }, { payCents: 4000 }, { cents: 10000, last: '' }) === 6000 &&
      vatStore.leftToPay({ vatStatus: 'reg7a' }, { payCents: 400 }, undefined) === 0,
  )
  check('§ 7a with nothing to report files nothing', vatStore.viewOf(company({ vatStatus: 'reg7a' }), '2026-09', [], [], '2026-10-14').state === 'none')

  // Where one document goes, as the booking form says it
  const adsDoc = sample({
    id: 'g1',
    kind: 'invoice_in',
    number: '5432109876',
    party: 'Google Ireland Limited',
    partyIco: null,
    issuedOn: '2026-09-04',
    totalCents: 4900,
    vatCents: 0,
    category: 'services',
    vat: { mode: 'reverse', lines: [{ rate: 23, base: 4900, vat: 1127, deduct: 1127 }], suppliedOn: null, vatId: 'IE6388047V', corrects: null, period: null },
  })
  const preview = vatStore.docPreview(company(), adsDoc, adsDoc.vat, [])
  check(
    'a service from abroad goes to 09b, 10b, 19 and B.1 of its month',
    preview.period === '2026-09' && preview.natural === '2026-09' && preview.goes.join() === 'r09b,r10b,r19,B1' && preview.issues.length === 0,
    JSON.stringify(preview),
  )
  const moved = vatStore.docPreview(company(), adsDoc, { ...adsDoc.vat, period: '2026-10' }, [])
  check('one the accountant put in another period goes there', moved.period === '2026-10' && moved.natural === '2026-09')
  check(
    'its entry: the VAT the company owes and deducts (343 against 343)',
    JSON.stringify(
      booking
        .entryFor({ kind: 'invoice_in', category: 'services', totalCents: 4900, vatCents: 0, vatPayer: true, vatDeduct: true, paidBy: 'bank', selfVat: vatStore.selfVatOf(adsDoc.vat) })
        .map((l) => [l.md, l.d, l.cents]),
    ) ===
      JSON.stringify([
        ['518', '321', 4900],
        ['343', '343', 1127],
      ]),
  )
  check(
    'not deducted (§ 7a), the VAT is part of the cost',
    JSON.stringify(
      booking
        .entryFor({ kind: 'invoice_in', category: 'services', totalCents: 4900, vatCents: 0, vatPayer: false, vatDeduct: false, paidBy: 'bank', selfVat: { cents: 1127, deduct: false } })
        .map((l) => [l.md, l.d, l.cents]),
    ) ===
      JSON.stringify([
        ['518', '321', 4900],
        ['518', '343', 1127],
      ]),
  )
  check('a domestic invoice pays no VAT of its own', vatStore.selfVatOf(sample().vat) === null && vatStore.selfVatOf(null) === null)

  // The booking form's VAT
  const form = (fields) => ({ dph_rezim: 'domestic', dph_dodanie: '', dph_icdph: 'SK2121212121', dph_opravuje: '', dph_obdobie: '', ...fields })
  const ctx = (fields = {}) => ({ kind: 'invoice_in', payer: true, deduct: true, booking: true, periods: ['2026-08', '2026-09', '2026-10'], ...fields })
  let read = vatForm.readVat(form({ dph_zaklad_23: '100,00' }), ctx())
  check(
    'only the base typed: the VAT of its rate, deducted',
    JSON.stringify(read.data?.lines) === JSON.stringify([{ rate: 23, base: 10000, vat: 2300, deduct: 2300 }]) && Object.keys(read.errors).length === 0,
    JSON.stringify(read),
  )
  read = vatForm.readVat(form({ dph_zaklad_23: '100,00', dph_dan_23: '22,99', dph_zaklad_0: '5' }), ctx({ deduct: false }))
  check(
    'the VAT as the invoice gives it, an exempt part, nothing deducted',
    JSON.stringify(read.data?.lines) ===
      JSON.stringify([
        { rate: 23, base: 10000, vat: 2299, deduct: 0 },
        { rate: 0, base: 500, vat: 0, deduct: 0 },
      ]),
  )
  check('VAT without its base is refused', vatForm.readVat(form({ dph_dan_19: '19,00' }), ctx()).errors.base19 === 'base')
  check('a word is no amount', vatForm.readVat(form({ dph_zaklad_5: 'päť' }), ctx()).errors.base5 === 'amount')
  check(
    'minus without the invoice it corrects is refused, and taken with it',
    vatForm.readVat(form({ dph_zaklad_23: '-10,00' }), ctx()).errors.corrects === 'negative' &&
      vatForm.readVat(form({ dph_zaklad_23: '-10,00', dph_opravuje: '2026118' }), ctx()).data?.lines[0].vat === -230,
  )
  check('a mode of the other kind is refused', vatForm.readVat(form({ dph_rezim: 'eu_goods', dph_zaklad_0: '10' }), ctx()).errors.mode === 'mode')
  check(
    "booking a deduction from a Slovak invoice asks for the supplier's VAT number",
    vatForm.readVat(form({ dph_icdph: '', dph_zaklad_23: '100' }), ctx()).errors.vatId === 'supplierId' &&
      vatForm.readVat(form({ dph_icdph: '', dph_zaklad_23: '100' }), ctx({ booking: false })).data !== null,
  )
  check('a VAT number without its country is refused', vatForm.readVat(form({ dph_icdph: '2121212121', dph_zaklad_23: '100' }), ctx()).errors.vatId === 'id')
  check(
    'a supply without VAT takes its base at 0 %',
    vatForm.readVat(form({ dph_rezim: 'eu_goods', dph_zaklad_23: '100' }), ctx({ kind: 'invoice_out' })).errors.base23 === 'zeroOnly' &&
      vatForm.readVat(form({ dph_rezim: 'eu_goods', dph_icdph: 'DE123456789', dph_zaklad_0: '100' }), ctx({ kind: 'invoice_out' })).data?.lines[0].base === 10000,
  )
  check(
    'booking a taxed document without any base is refused; "none" needs none',
    vatForm.readVat(form({}), ctx()).errors.base23 === 'lines' && vatForm.readVat(form({ dph_rezim: 'none', dph_icdph: '' }), ctx()).data?.mode === 'none',
  )
  check(
    'a period outside the offered ones is refused',
    vatForm.readVat(form({ dph_zaklad_23: '100', dph_obdobie: '2025-01' }), ctx()).errors.period === 'period' &&
      vatForm.readVat(form({ dph_zaklad_23: '100', dph_obdobie: '2026-10' }), ctx()).data?.period === '2026-10',
  )
  check(
    'a day of supply typed the Slovak way, or refused',
    vatForm.readVat(form({ dph_zaklad_23: '100', dph_dodanie: '30. 9. 2026' }), ctx()).data?.suppliedOn === '2026-09-30' &&
      vatForm.readVat(form({ dph_zaklad_23: '100', dph_dodanie: '31. 9. 2026' }), ctx()).errors.supplied === 'date',
  )
  check(
    'a receipt or a kind without VAT',
    vatForm.readVat(form({ dph_icdph: '', dph_zaklad_23: '20' }), ctx({ kind: 'receipt' })).data?.lines[0].deduct === 460 && vatForm.readVat(form({}), ctx({ kind: 'other' })).data === null,
  )
  check('§ 7a deducts nothing, whatever the box', vatForm.readVat(form({ dph_rezim: 'reverse', dph_icdph: 'IE6388047V', dph_zaklad_23: '49' }), ctx({ payer: false })).data?.lines[0].deduct === 0)
  const roundTrip = {
    mode: 'domestic',
    lines: [
      { rate: 23, base: 10000, vat: 2300, deduct: 2300 },
      { rate: 5, base: -2000, vat: -100, deduct: -100 },
    ],
    suppliedOn: '2026-09-30',
    vatId: 'SK2121212121',
    corrects: '2026118',
    period: '2026-09',
  }
  const shown = vatForm.vatValues(roundTrip)
  const back = vatForm.readVat(
    {
      dph_rezim: shown.mode,
      dph_dodanie: shown.supplied,
      dph_icdph: shown.vatId,
      dph_opravuje: shown.corrects,
      dph_obdobie: shown.period,
      ...Object.fromEntries(
        vatForm.FORM_RATES.flatMap((r) => [
          [`dph_zaklad_${r}`, shown.base[r]],
          [`dph_dan_${r}`, shown.tax[r]],
        ]),
      ),
    },
    ctx(),
  )
  check('what the form shows reads back as it was', JSON.stringify(back.data) === JSON.stringify(roundTrip), JSON.stringify(back))
  check(
    "the periods offered around a document's own",
    vatForm.periodsAround('2026-09', null, vat.nextPeriod, vat.prevPeriod).join() === '2026-06,2026-07,2026-08,2026-09,2026-10,2026-11,2026-12' &&
      vatForm.periodsAround('2026-09', '2025-01', vat.nextPeriod, vat.prevPeriod)[0] === '2025-01',
  )
}

// The books: the journal, the trial balance, the open items and the bank, worked out from documents and payments
{
  const NB = ' '
  const plain = (text) => String(text).replace(/ /g, ' ')
  const company = (fields = {}) => ({
    id: 'c1',
    name: 'Firma s. r. o.',
    icdph: 'SK2120000007',
    vatStatus: 'payer',
    vatQuarterly: false,
    vatSince: null,
    startOn: '2026-09-01',
    vatCarry: 0,
    ...fields,
  })
  const vatData = (mode, lines, extra = {}) => ({ mode, lines, suppliedOn: null, vatId: null, corrects: null, period: null, ...extra })
  const doc = (id, fields) => ({
    id,
    companyId: 'c1',
    createdAt: Date.parse('2026-09-20T10:00:00Z') / 1000,
    kind: 'invoice_in',
    number: null,
    party: null,
    partyIco: null,
    issuedOn: '2026-09-05',
    dueOn: null,
    totalCents: 0,
    vatCents: null,
    currency: 'EUR',
    category: 'services',
    vatDeduct: null,
    account: null,
    bookedAt: 1,
    paidPrivately: false,
    paymentId: null,
    vat: null,
    partyVatId: null,
    suppliedOn: null,
    foreign: null,
    correctsHint: null,
    linesHint: [],
    ...fields,
  })
  const pay = (id, bookedOn, amountCents, fields = {}) => ({
    id,
    bookedOn,
    amountCents,
    currency: 'EUR',
    party: null,
    vs: null,
    note: null,
    exempt: null,
    exemptNote: null,
    contra: null,
    bankId: 'b1',
    bank: '221.001',
    ...fields,
  })
  const docs = [
    doc('hosting', {
      number: 'F2026118',
      party: 'Hostingový dom s. r. o.',
      totalCents: 12300,
      dueOn: '2026-09-19',
      paymentId: 'p1',
      vat: vatData('domestic', [{ rate: 23, base: 10000, vat: 2300, deduct: 2300 }], { vatId: 'SK2020000000' }),
    }),
    doc('sale', {
      kind: 'invoice_out',
      number: '20260001',
      party: 'Zákazník s. r. o.',
      issuedOn: '2026-09-10',
      dueOn: '2026-09-24',
      totalCents: 24600,
      category: 'sales',
      vat: vatData('domestic', [{ rate: 23, base: 20000, vat: 4600, deduct: 0 }]),
    }),
    doc('cafe', {
      kind: 'receipt',
      party: 'Kaviareň',
      issuedOn: '2026-09-12',
      totalCents: 1240,
      category: 'representation',
      paymentId: 'p2',
      vat: vatData('domestic', [{ rate: 23, base: 1008, vat: 232, deduct: 0 }]),
    }),
    doc('fuel', {
      kind: 'receipt',
      party: 'Čerpacia stanica',
      issuedOn: '2026-09-30',
      totalCents: 6150,
      category: 'fuel',
      paymentId: 'p3',
      vat: vatData('domestic', [{ rate: 23, base: 5000, vat: 1150, deduct: 1150 }]),
    }),
    doc('cash', { kind: 'receipt', party: 'Papiernictvo', issuedOn: '2026-09-20', totalCents: 300, category: 'material', vat: vatData('none', []) }),
    doc('private', { kind: 'receipt', party: 'Kníhkupectvo', issuedOn: '2026-09-21', totalCents: 990, category: 'services', paidPrivately: true, vat: vatData('none', []) }),
    doc('abroad', {
      number: 'IE-77',
      party: 'Cloud Ltd',
      issuedOn: '2026-09-08',
      totalCents: 10000,
      vat: vatData('reverse', [{ rate: 23, base: 10000, vat: 2300, deduct: 2300 }], { vatId: 'IE6388047V' }),
    }),
    doc('waiting', { bookedAt: null, kind: null, totalCents: 500, category: null }),
    doc('credit', {
      number: 'D-1',
      party: 'Hostingový dom s. r. o.',
      issuedOn: '2026-09-25',
      totalCents: 1230,
      vat: vatData('domestic', [{ rate: 23, base: -1000, vat: -230, deduct: -230 }], { corrects: 'F2026118', vatId: 'SK2020000000' }),
    }),
  ]
  const payments = [
    pay('p1', '2026-09-15', -12300, { party: 'Hostingový dom s. r. o.' }),
    pay('p2', '2026-09-13', -1240, { party: 'KAVIAREN NA ROHU' }),
    pay('p3', '2026-10-01', -6150, { party: 'CERPACIA STANICA' }),
    pay('fee', '2026-09-30', -450, { exempt: 'bank', note: 'Poplatok za vedenie účtu' }),
    pay('capital', '2026-09-02', 500000, { exempt: 'capital', note: 'Splatenie základného imania', party: 'Martin Novák' }),
    pay('state', '2026-09-20', -3300, { exempt: 'state', vs: '1700000000' }),
    pay('missing', '2026-09-25', -2000, { party: 'Niekto' }),
    pay('vat', '2026-10-20', -2300, { exempt: 'state', vs: '1100092026' }),
    pay('old', '2026-08-20', -999),
  ]
  const rows = (fields) => ({ ...vat.emptyRows(), ...fields })
  const filedSep = { period: '2026-09', filedAt: 1, filedOn: '2026-10-20', rows: rows({ r17: 6900, r19: 5750, r28: 230 }), kind: 'R', prev: null }
  const manual = [
    {
      id: 'ps',
      kind: 'opening',
      number: 'PS',
      on: '2026-09-01',
      text: 'Počiatočné stavy',
      lines: [
        { md: '353', d: '701', cents: 500000 },
        { md: '701', d: '411', cents: 500000 },
      ],
      createdAt: 1,
      createdByName: null,
    },
    { id: 'id1', kind: 'internal', number: 'ID-2026-001', on: '2026-09-30', text: 'Nevyfakturované služby', lines: [{ md: '548', d: '325', cents: 100 }], createdAt: 1, createdByName: null },
  ]
  const banks = [{ id: 'b1', iban: 'SK3112000000198742637541', ledger: '221.001', balanceCents: 480710, balanceOn: '2026-09-30' }]
  const books = ledger.buildBooks({ company: company(), docs, payments, banks, filed: [filedSep], manual })
  const entry = (key) => books.entries.find((e) => e.key === key)
  const lines = (key) => (entry(key)?.lines ?? []).map((l) => `${l.md}/${l.d}:${l.cents}`).join(' ')

  check(
    'an account as the books write it',
    ledger.canonicalAccount('518') === '518' && ledger.canonicalAccount('518001') === '518.001' && ledger.canonicalAccount('343.1') === '343.1' && ledger.canonicalAccount(' 221 001 ') === '221.001',
  )
  check(
    'no account outside classes 0 to 7, nor a short one',
    ledger.canonicalAccount('912') === null && ledger.canonicalAccount('52') === null && ledger.canonicalAccount('5181234') === null && ledger.canonicalAccount('') === null,
  )
  check(
    'accounts named as the chart names them',
    ledger.accountName('321') === 'Dodávatelia' &&
      ledger.accountName('343.100').startsWith('DPH na vstupe') &&
      ledger.accountName('518.001') === 'Ostatné služby' &&
      ledger.accountName('221.001', banks).startsWith('Bankový účet SK31'),
  )
  check(
    'the books start on the opening balances day',
    books.start === '2026-09-01' && ledger.booksStart({ startOn: '2026-10-01' }, []) === '2026-10-01' && ledger.booksStart({ startOn: null }, []) === null,
  )
  check(
    'a received invoice: the cost and the VAT deducted against the supplier',
    lines('d:hosting') === '518/321:10000 343.100/321:2300' && entry('d:hosting')?.on === '2026-09-05',
    lines('d:hosting'),
  )
  check('paid: the supplier against the bank, on the bank day', lines('p:p1') === '321/221.001:12300' && entry('p:p1')?.on === '2026-09-15', lines('p:p1'))
  check('an issued invoice: the customer against revenue and the VAT owed', lines('d:sale') === '311/602:20000 311/343.200:4600', lines('d:sale'))
  check(
    'a receipt paid by card in its own month goes against the bank itself, on the bank day',
    lines('d:cafe') === '513/221.001:1240' && entry('d:cafe')?.on === '2026-09-13' && !entry('p:p2'),
    lines('d:cafe'),
  )
  check(
    'a receipt paid in the next month goes through money in transit',
    lines('d:fuel') === '501/261:5000 343.100/261:1150' && entry('d:fuel')?.on === '2026-09-30' && lines('p:p3') === '261/221.001:6150' && entry('p:p3')?.on === '2026-10-01',
    `${lines('d:fuel')} | ${lines('p:p3')}`,
  )
  check('a receipt with no payment is paid from the cash box', lines('d:cash') === '501/211:300')
  check('a receipt the owner paid is owed to him', lines('d:private') === '518/365:990')
  check('a service from abroad: the VAT the company pays itself, deducted', lines('d:abroad') === '518/321:10000 343.100/343.200:2300', lines('d:abroad'))
  check('a credit note books the other way', lines('d:credit') === '321/518:1000 321/343.100:230', lines('d:credit'))
  check('a bank fee and the capital paid in, by their reasons', lines('p:fee') === '568/221.001:450' && lines('p:capital') === '221.001/353:500000')
  check('VAT paid to the tax office clears the settlement', lines('p:vat') === '343.300/221.001:2300')
  check(
    'a filed return settles the period on its last day',
    lines('v:2026-09') === '343.200/343.300:6900 343.300/343.100:5520' && entry('v:2026-09')?.on === '2026-09-30' && entry('v:2026-09')?.number === 'DPH 09/2026',
    lines('v:2026-09'),
  )
  check('the opening balances and an internal document as written', lines('m:ps') === '353/701:500000 701/411:500000' && lines('m:id1') === '548/325:100' && entry('m:ps')?.on === '2026-09-01')
  check(
    'what the books cannot book is said, not guessed',
    books.issues.unbooked.join() === 'waiting' &&
      books.issues.classify.join() === 'state' &&
      books.issues.missing.join() === 'missing' &&
      books.issues.beforeStart.payments === 1 &&
      books.unposted.get('state') === -3300 &&
      books.unposted.get('missing') === -2000 &&
      !books.unposted.has('old'),
    JSON.stringify(books.issues),
  )
  check('the entries in the order of their days', books.entries.every((e, i, all) => i === 0 || all[i - 1].on <= e.on) && books.entries[0]?.key === 'm:ps')
  const at = (account, day) => ledger.balanceOf(books.entries, account, day)
  check(
    "VAT on its three accounts: what the return settled leaves nothing behind, the tax office's account holds the rest",
    at('343.100', '2026-09-30') === 0 && at('343.200', '2026-09-30') === 0 && at('343.300', '2026-09-30') === -1380 && at('343.300', '2026-10-31') === 920 && at('343', '2026-09-30') === -1380,
    JSON.stringify([at('343.100', '2026-09-30'), at('343.200', '2026-09-30'), at('343.300', '2026-09-30')]),
  )
  check('money in transit until the bank books it', at('261', '2026-09-30') === -6150 && at('261', '2026-10-01') === 0)
  check('the bank account in the books', at('221.001', '2026-09-30') === 486010 && at('221', '2026-09-30') === 486010, String(at('221.001', '2026-09-30')))
  const [bank] = ledger.bankChecks(books, '2026-10-14')
  check('the bank against the books: what is not booked explains the difference', bank.ledger === 486010 && bank.unposted === -5300 && bank.rest === 0, JSON.stringify(bank))
  const tb = ledger.trialBalance(books, 2026, 9)
  check('the trial balance balances', tb.md === tb.d && tb.ps === 0 && tb.ks === 0 && tb.md > 0, JSON.stringify([tb.md, tb.d, tb.ps, tb.ks]))
  check('the result: revenues less costs', tb.revenues === 20000 && tb.costs === 27080 && tb.result === -7080, JSON.stringify([tb.revenues, tb.costs, tb.result]))
  const row = (account) => tb.classes.flatMap((c) => c.rows).find((r) => r.account === account)
  check('opening balances stand as the opening, not as turnover', row('411')?.ps === -500000 && row('411')?.d === 0 && row('353')?.ps === 500000 && row('353')?.d === 500000 && row('353')?.ks === 0)
  check(
    'a synthetic account with its analytic ones under it',
    row('343')?.analytic === false && row('343.100')?.analytic === true && row('343')?.ks === row('343.100').ks + row('343.200').ks + row('343.300').ks && !row('701'),
    JSON.stringify(row('343')),
  )
  check('the classes in order', tb.classes.map((c) => c.cls).join() === '2,3,4,5,6', tb.classes.map((c) => c.cls).join())
  const oct = ledger.trialBalance(books, 2026, 10)
  check('a later month adds its turnover', oct.md - tb.md === 6150 + 2300 && row('221')?.ks === 486010, String(oct.md - tb.md))
  const next = ledger.yearOpening(books.entries, 2027)
  check(
    'the next year opens with the balance sheet and the result on 431',
    next.get('431') === 7080 && ![...next.keys()].some((a) => a.startsWith('5') || a.startsWith('6') || a.startsWith('7')) && next.get('221.001') === 486010 - 6150 - 2300,
    JSON.stringify([...next]),
  )
  const moves = ledger.accountMoves(books, '321', 2026, 12)
  check(
    'an account and its lines, with the balance after each',
    moves.ps === 0 && moves.ks === -8770 && moves.moves.length === 6 && moves.moves[moves.moves.length - 1].balance === -8770,
    JSON.stringify(moves.moves.map((m) => m.balance)),
  )
  const items = new Map(books.items.map((i) => [i.docId, i]))
  check(
    'open items: paid, unpaid, overdue, and a credit note against its supplier',
    ledger.leftOf(items.get('hosting')) === 0 &&
      ledger.leftOf(items.get('sale')) === 24600 &&
      ledger.daysOverdue(items.get('sale'), '2026-10-14') === 20 &&
      ledger.leftOf(items.get('abroad')) === 10000 &&
      ledger.leftOf(items.get('credit')) === -1230 &&
      ledger.daysOverdue(items.get('credit'), '2026-10-14') === 0,
  )
  check('the open items on 321 make the balance of 321', [...items.values()].filter((i) => i.account === '321').reduce((sum, i) => sum + ledger.leftOf(i), 0) === -moves.ks)

  // A supplementary return settles its difference on the day it was filed
  const corrected = {
    ...filedSep,
    filedOn: '2026-11-05',
    kind: 'D',
    rows: rows({ r17: 7000, r19: 5750, r28: 230 }),
    prev: JSON.stringify({ kind: 'R', filed_on: '2026-10-20', rows: JSON.stringify(filedSep.rows), prev: null }),
  }
  const later = ledger.buildBooks({ company: company(), docs, payments, banks, filed: [corrected], manual })
  check(
    'a supplementary return: the regular one at the period end, the difference on its own day',
    later.entries
      .find((e) => e.key === 'v:2026-09')
      ?.lines.map((l) => l.cents)
      .join() === '6900,5520' &&
      later.entries.find((e) => e.key === 'v:2026-09:1')?.on === '2026-11-05' &&
      later.entries
        .find((e) => e.key === 'v:2026-09:1')
        ?.lines.map((l) => `${l.md}/${l.d}:${l.cents}`)
        .join() === '343.200/343.300:100',
  )
  // A corrective return before the deadline replaces the regular one in the settlement; it is no difference of its own
  const replaced = {
    ...filedSep,
    kind: 'O',
    rows: rows({ r17: 7000, r19: 5750, r28: 230 }),
    prev: JSON.stringify({ kind: 'R', filed_on: '2026-10-10', rows: JSON.stringify(filedSep.rows), prev: null }),
  }
  const withO = ledger.buildBooks({ company: company(), docs, payments, banks, filed: [replaced], manual })
  check(
    'a corrective return settles as the regular one did, with its own figures',
    withO.entries
      .find((e) => e.key === 'v:2026-09')
      ?.lines.map((l) => l.cents)
      .join() === '7000,5520' && !withO.entries.some((e) => e.key === 'v:2026-09:1'),
  )
  check('what a return owes and deducts, corrections included', ledger.vatOwed(rows({ r17: 100, r25: -10 })) === 90 && ledger.vatDeducted(rows({ r18: 5, r18a: 6, r19: 40, r28: 7 })) === 44)
  const closing = ledger.buildBooks({
    company: company(),
    docs: [],
    payments: [],
    banks,
    filed: [],
    manual: [
      {
        id: 'z',
        kind: 'internal',
        number: 'ID-2026-009',
        on: '2026-12-31',
        text: 'Uzávierka',
        lines: [
          { md: '710', d: '702', cents: 100 },
          { md: '518', d: '325', cents: 300 },
        ],
        createdAt: 1,
        createdByName: null,
      },
    ],
  })
  check(
    'the closing accounts do not carry into the next year',
    !ledger.yearOpening(closing.entries, 2027).has('710') && !ledger.yearOpening(closing.entries, 2027).has('702') && ledger.yearOpening(closing.entries, 2027).get('325') === -300,
  )
  check('a paid invoice is never overdue', ledger.daysOverdue(items.get('hosting'), '2026-12-31') === 0)
  const twoBanks = ledger.buildBooks({
    company: company(),
    docs: [],
    payments: [pay('a', '2026-09-10', -500), pay('b', '2026-09-10', -700, { bankId: 'b2', bank: '221.002' })],
    banks: [banks[0], { id: 'b2', iban: 'SK0000000000000000000002', ledger: '221.002', balanceCents: -700, balanceOn: '2026-09-30' }],
    filed: [],
    manual: [],
  })
  check(
    'each bank account explains its own difference',
    ledger
      .bankChecks(twoBanks, '2026-10-14')
      .map((c) => c.unposted)
      .join() === '-500,-700',
  )
  const owner = ledger.buildBooks({
    company: company({ vatStatus: 'none' }),
    docs: [doc('own', { totalCents: 4900, paidPrivately: true, vat: vatData('none', []) })],
    payments: [],
    banks,
    filed: [],
    manual: [],
  })
  check(
    'an invoice the owner paid himself is owed to him, and settled with the supplier',
    owner.entries
      .find((e) => e.key === 'd:own:owner')
      ?.lines.map((l) => `${l.md}/${l.d}:${l.cents}`)
      .join() === '321/365:4900' && ledger.leftOf(owner.items[0]) === 0,
  )
  check(
    'a company not registered for VAT books no VAT',
    ledger
      .buildBooks({ company: company({ vatStatus: 'none' }), docs: [docs[0]], payments: [], banks, filed: [], manual: [] })
      .entries[0].lines.map((l) => `${l.md}/${l.d}:${l.cents}`)
      .join() === '518/321:12300',
  )
  const reg7a = ledger.buildBooks({ company: company({ vatStatus: 'reg7a' }), docs: [docs[6]], payments: [], banks, filed: [], manual: [] })
  check(
    '§ 7a: the VAT on a service from abroad is owed and is part of the cost',
    reg7a.entries[0].lines.map((l) => `${l.md}/${l.d}:${l.cents}`).join() === '518/321:10000 518/343.200:2300'.replace(' ', ','),
  )
  check(
    'documents before the books start are left to the accountant before us',
    ledger.buildBooks({ company: company({ startOn: '2026-09-10' }), docs: [docs[0]], payments: [], banks, filed: [], manual: [] }).issues.beforeStart.docs === 1,
  )

  // Several documents on one payment, and a payment whose documents are not all booked
  const two = ledger.buildBooks({
    company: company(),
    docs: [
      doc('a', { totalCents: 1000, paymentId: 'pp', vat: vatData('none', []), issuedOn: '2026-09-02' }),
      doc('b', { totalCents: 2000, paymentId: 'pp', vat: vatData('none', []), issuedOn: '2026-09-03' }),
      doc('c', { totalCents: 700, paymentId: 'pq', bookedAt: null, vat: vatData('none', []) }),
    ],
    payments: [pay('pp', '2026-09-10', -3100), pay('pq', '2026-09-11', -700)],
    banks,
    filed: [],
    manual: [],
  })
  const twoItems = new Map(two.items.map((i) => [i.docId, i]))
  check(
    'one payment for two invoices: each its own, the last what is left',
    two.entries
      .find((e) => e.key === 'p:pp')
      ?.lines.map((l) => l.cents)
      .join() === '1000,2100' &&
      ledger.leftOf(twoItems.get('b')) === -100 &&
      !two.unposted.has('pp'),
  )
  check('a payment waits for its document to be booked', two.issues.waiting.join() === 'pq' && two.unposted.get('pq') === -700 && !two.entries.some((e) => e.key === 'p:pq'))

  // A payment without a document
  check(
    "a payment's reason gives its account, the accountant's own wins",
    ledger.reasonAccount({ amountCents: -450, exempt: 'bank' }) === '568' &&
      ledger.reasonAccount({ amountCents: 12, exempt: 'bank' }) === '662' &&
      ledger.reasonAccount({ amountCents: -100, exempt: 'own' }) === '261' &&
      ledger.reasonAccount({ amountCents: 500000, exempt: 'capital', note: 'Vklad do základného imania' }) === '353' &&
      ledger.reasonAccount({ amountCents: 300000, exempt: 'capital', note: 'pôžička' }) === '365' &&
      ledger.reasonAccount({ amountCents: -2300, exempt: 'state', vs: '1100092026' }) === '343.300' &&
      ledger.reasonAccount({ amountCents: -3300, exempt: 'state', vs: '1700000000' }) === null &&
      ledger.reasonAccount({ amountCents: -120000, exempt: 'payroll' }) === '331' &&
      ledger.reasonAccount({ amountCents: -100, exempt: 'other' }) === null &&
      ledger.paymentContra(pay('x', '2026-09-01', -3300, { exempt: 'state', contra: '538' })) === '538' &&
      ledger.paymentContra(pay('x', '2026-09-01', -450, { exempt: 'bank', contra: '221.002' })) === '568',
  )
  check(
    'a receipt paid directly only when it is the payment alone, to the cent, in its month',
    ledger.receiptContra({ on: '2026-09-12', expected: -1240 }, { bookedOn: '2026-09-13', amountCents: -1240, bank: '221.001' }, 1).contra === '221.001' &&
      ledger.receiptContra({ on: '2026-09-12', expected: -1240 }, { bookedOn: '2026-09-13', amountCents: -1250, bank: '221.001' }, 1).contra === '261' &&
      ledger.receiptContra({ on: '2026-09-12', expected: -1240 }, { bookedOn: '2026-09-13', amountCents: -1240, bank: '221.001' }, 2).contra === '261',
  )

  // What the accountant types
  const typed = ledger.readEntryRows([
    { md: '548', d: '325', amount: '1 200,50' },
    { md: '', d: '', amount: '' },
    { md: '518', d: '518', amount: '10' },
    { md: '9', d: '325', amount: '10' },
    { md: '518', d: '325', amount: '-5' },
  ])
  check(
    'an internal document: good lines kept, empty ones left out, each mistake named',
    typed.lines.length === 1 && typed.lines[0].cents === 120050 && typed.errors[2] === 'same' && typed.errors[3] === 'md' && typed.errors[4] === 'amount' && !(1 in typed.errors),
  )
  const opening = ledger.readOpeningRows([
    { account: '221.001', md: '4 861,63', d: '' },
    { account: '411', md: '', d: '5000' },
    { account: '431', md: '138,37', d: '' },
    { account: '701', md: '1', d: '' },
    { account: '311', md: '1', d: '1' },
  ])
  check(
    'opening balances against 701, the closing accounts refused, one side only',
    opening.md === 500000 &&
      opening.d === 500000 &&
      opening.lines[0].md === '221.001' &&
      opening.lines[0].d === '701' &&
      opening.lines[1].md === '701' &&
      opening.errors[3] === 'closing' &&
      opening.errors[4] === 'both',
    JSON.stringify(opening),
  )
  check(
    'the form shows the opening balances again',
    ledger
      .openingRows(opening.lines)
      .map((r) => `${r.account}:${r.md ?? ''}:${r.d ?? ''}`)
      .join() === '221.001:486163:,411::500000,431:13837:',
  )
  check(
    'lines stored are read back checked',
    ledgerStore.storedLines(
      JSON.stringify([
        { md: '518', d: '325', cents: 10 },
        { md: '518', d: '518', cents: 5 },
        { md: 'x', d: '325', cents: 5 },
        { md: '518', d: '325', cents: 1.5 },
      ]),
    ).length === 1,
  )

  // The files
  const journal = plain(ledger.journalCsv(books, 2026))
  check(
    'the journal as a file',
    journal.startsWith('﻿Dátum;Doklad;Text;MD;D;Suma;Zdroj') && journal.includes('2026-09-05;F2026118;Hostingový dom s. r. o.: Služby;518;321;100,00;doklad') && journal.includes('VBÚ 221.001'),
    journal.slice(0, 400),
  )
  const trial = plain(ledger.trialCsv(tb))
  check('the trial balance as a file', trial.includes('321;Dodávatelia;') && trial.includes('Strata;;;;;70,80'), trial.slice(-200))
  const general = plain(ledger.generalLedgerCsv(books, 2026))
  check(
    'the general ledger as a file, account by account',
    general.includes('343.100;DPH na vstupe (odpočet);2026-01-01;;Počiatočný stav') && !general.includes('\r\n343;Daň z pridanej hodnoty;'),
    general.slice(0, 300),
  )
  check('the open items as a file', plain(ledger.saldoCsv(books, '2026-10-14')).includes('311;20260001;Zákazník s. r. o.;2026-09-10;2026-09-24;246,00;0,00;246,00;20'))
}

done('units')
