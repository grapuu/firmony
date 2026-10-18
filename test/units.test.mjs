import { existsSync, readFileSync } from 'node:fs'
import { checkPrehlad } from './prehlad.units.mjs'
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
  ekasa,
  ending,
  fio,
  format,
  ico,
  invoices,
  repeat,
  payorders,
  ledger,
  ledgerStore,
  dues,
  registrations,
  dueViews,
  ledgerViews,
  assets,
  closing,
  closingXml,
  closingForm,
  closingPod,
  notes,
  pdf as pdfWriter,
  stock,
  payroll,
  payrollStore,
  payMonth,
  payrollForm,
  taxSettlement,
  tableRead,
  fx,
  oss,
  intrastat,
  distribution,
  time,
  lastDeclared,
  takeover,
  takeoverStore,
  prehlad as prehladUnit,
  payrollReporting as reports,
  periods,
  support,
  security,
  isEvidenceHeld,
  filings,
  validateChange,
  contracts,
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
  vatSummary,
  vatXml,
  xml,
  zip,
} from '../.wrangler/tmp/units-bundle.mjs'
import { validateXML } from 'xmllint-wasm'
import { crc32 as nodeCrc32, deflateRawSync } from 'node:zlib'
import { check, done } from './check.mjs'
import { camtXml } from './pretend.mjs'
import { createVerify, generateKeyPairSync } from 'node:crypto'

const NB = ' '

// Recorded submission, a checked receipt and statutory corrections are separate decisions.
{
  const user = { id: 'accountant', team: 'accountant' }, pkg = { status: 'prepared', revision: 0 }
  const input = { to: 'accepted', revision: 0, externalOn: '2026-10-16', reference: 'TEST-ONLY-1234', reason: '', channel: 'TEST-ONLY', checked: true, receipt: { name: 'TEST_ONLY.xml', bytes: new TextEncoder().encode('<TEST_ONLY/>') } }
  const invalid = (extra) => validateChange(pkg, user, { ...input, ...extra }, '2026-10-16') !== null
  check('filing enums reject prototype keys and unknown delivery states', ['constructor', '__proto__', 'toString', 'done'].every((s) => !filings.isDeliveryState(s)) && ['constructor', '__proto__', 'all'].every((s) => !filings.isFilingType(s)))
  check('a receipt may establish acceptance directly from preparation', validateChange(pkg, user, input, '2026-10-16') === null)
  check('an unconfirmed attachment cannot establish acceptance', invalid({ checked: false }) && invalid({ receipt: undefined }) && invalid({ receipt: { ...input.receipt, bytes: new Uint8Array() } }))
  check('filing dates reject impossible, empty, noncanonical and future days', ['', '2026-02-30', '2026-13-01', '2026-1-01', '2026-10-17'].every((externalOn) => invalid({ externalOn })))
  check('a stale receipt revision is rejected before storage', invalid({ revision: 1 }))
  check('receipt references need meaningful identifiers and a delivery channel', invalid({ reference: '    ' }) && invalid({ reference: ' abc ' }) && invalid({ reference: 'x'.repeat(161) }) && invalid({ channel: ' ' }))
  check('a refusal needs a reason and original proof', invalid({ to: 'rejected' }) && invalid({ to: 'rejected', reason: 'TEST-ONLY reason', receipt: undefined }) && validateChange(pkg, user, { ...input, to: 'rejected', reason: 'TEST-ONLY signing failure' }, '2026-10-16') === null)
  check('reviewing accepted evidence is restricted to an administrator', !filings.canTransition('accepted', 'review', false) && filings.canTransition('accepted', 'review', true) && !filings.canTransition('accepted', 'prepared', true) && !filings.canTransition('review', 'accepted', false))
  check('resending after refusal needs a documented next step', validateChange({ status: 'rejected', revision: 0 }, user, { ...input, to: 'submitted', reason: '' }, '2026-10-16') !== null)
  check('legacy delivery references tolerate malformed JSON and reject unknown kinds', JSON.stringify(filings.deliveryIds('{broken')) === '{}' && JSON.stringify(filings.deliveryIds({ vat: 'id-1', mystery: 'id-2', kv: '../outside' })) === '{"vat":"id-1"}')
  const wrapped = { cause: { cause: new Error('D1_ERROR: FIRMONY_FILING_SENT') } }, cyclic = {}; cyclic.cause = cyclic
  check('delivery guards recognize wrapped database errors and tolerate cycles', filings.isFilingSent(wrapped) && !filings.isFilingSent(cyclic))
}

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
check('proposed liability does not disguise twelve fees as foreseeable loss', !terms.termsText().includes('dvanásťnásobku') && terms.termsText().includes('§ 373') && terms.termsText().includes('príčinná súvislosť'))
check('insurer decisions do not erase the provider obligation', terms.termsText().includes('Rozhodnutie poisťovne ani jej limit nemenia našu'))
check('late input is assessed causally, with a duty to warn', terms.termsText().includes('nie automatickým vylúčením našej zodpovednosti') && !terms.termsText().includes('výlučne našou'))
check('lawfully due tax is distinct from irreversible loss of a lawful deduction', terms.termsText().includes('nezvratnej straty zákonného nároku') && terms.termsText().includes('sám osebe nie je škodou'))
const catalogueHash = await contracts.contractCatalogueHash()
const release = { catalogueHash, legalReview: 'fixture-lawyer-report', insuranceReview: 'fixture-underwriter-report', validUntil: 2000000000 }
check('a release approval is bound to the full catalogue', contracts.approvedRelease(JSON.stringify(release), catalogueHash, 1900000000)?.catalogueHash === catalogueHash)
for (const [name, value] of [
  ['absent', undefined], ['malformed', '{'], ['too long', 'x'.repeat(2049)],
  ['wrong catalogue', JSON.stringify({ ...release, catalogueHash: 'a'.repeat(64) })],
  ['no lawyer reference', JSON.stringify({ ...release, legalReview: '' })],
  ['no insurance reference', JSON.stringify({ ...release, insuranceReview: ' ' })],
  ['expired', JSON.stringify({ ...release, validUntil: 1900000000 })],
  ['timestamp as string', JSON.stringify({ ...release, validUntil: '2000000000' })],
  ['null', 'null'],
]) check(`contract signing stays closed: ${name}`, contracts.approvedRelease(value, catalogueHash, 1900000000) === null)
{
  // The page that prepares the approval: what it makes is what the gate takes, and it says why one does not hold.
  const made = contracts.releaseValue(catalogueHash, 'JUDr. Test, 3. 11. 2026', 'Poisťovňa Test, 12345', '2027-12-31')
  const parsed = JSON.parse(made)
  check(
    'the prepared approval is one the gate takes, through the whole day in Bratislava',
    contracts.approvedRelease(made, catalogueHash, 1800000000)?.legalReview === 'JUDr. Test, 3. 11. 2026' &&
      new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Bratislava' }).format(new Date((parsed.validUntil - 1) * 1000)) === '2027-12-31' &&
      new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Bratislava' }).format(new Date(parsed.validUntil * 1000)) === '2028-01-01' &&
      JSON.parse(contracts.releaseValue(catalogueHash, 'x'.repeat(5), 'y'.repeat(5), '2027-07-31')).validUntil === Date.UTC(2027, 6, 31, 22) / 1000,
    made,
  )
  const states = [
    [undefined, 'missing'], ['', 'missing'], ['{', 'unreadable'], ['null', 'unreadable'],
    [JSON.stringify({ ...release, catalogueHash: 'a'.repeat(64) }), 'other'],
    [JSON.stringify({ ...release, validUntil: 1900000000 }), 'expired'],
    [JSON.stringify({ ...release, legalReview: '' }), 'unreadable'],
    [JSON.stringify(release), 'valid'],
  ].map(([raw, want]) => [want, contracts.releaseState(raw, catalogueHash, 1900000000).state])
  check('the page says why an approval does not hold', states.every(([want, got]) => want === got), JSON.stringify(states))
}
const originalPrice = config.PLANS[0].price
config.PLANS[0].price += 1
check('a price edit invalidates the approved catalogue without a version change', await contracts.contractCatalogueHash() !== catalogueHash)
config.PLANS[0].price = originalPrice
const originalPoint = terms.TERMS[0].points[0]
terms.TERMS[0].points[0] += ' changed'
check('a wording edit invalidates approval even with an unchanged version label', await contracts.contractCatalogueHash() !== catalogueHash)
terms.TERMS[0].points[0] = originalPoint

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
for (const value of ['2026-02-29', '2026-02-31', '2026-04-31', '2026-13-01']) {
  const invalid = reader.readingFrom({ je_doklad: true, datum_vystavenia: value, datum_splatnosti: value, datum_dodania: value })
  check(`an AI calendar date must exist: ${value}`, invalid.issuedOn === null && invalid.dueOn === null && invalid.suppliedOn === null)
}
check('valid leap days survive AI validation', reader.readingFrom({ je_doklad: true, datum_vystavenia: '2028-02-29' }).issuedOn === '2028-02-29')
check('AI categories and kinds reject inherited object names', ['__proto__', 'constructor', 'toString'].every((value) => {
  const invalid = reader.readingFrom({ je_doklad: true, typ: value, kategoria: value })
  return !booking.isCategory(value) && invalid.kind === 'other' && invalid.category === null
}))
{
  const fetchBefore = globalThis.fetch
  try {
    for (const content of [{ invalid: true }, [null], [{ type: 'tool_use', name: 'zapis_doklad', input: [] }]]) {
      globalThis.fetch = async () => Response.json({ content })
      const result = await reader.readDocument('test-only', { kind: 'jpeg', bytes: bytes(0xff, 0xd8, 0xff) }, { name: 'Test', ico: null })
      check('a malformed AI response goes to a person without an exception', result.manual === 'not an answer')
    }
  } finally { globalThis.fetch = fetchBefore }
}

// eKasa receipts (src/app/ekasa.ts): the codes as the Financial Administration's description of the eKasa interface
// writes them (2.7 the identifier, 2.2 the verification code), and one receipt told from another by them
const UID = 'O-7DBCDA8A56EE426DBCDA8A56EE426D1A'
const OKP = 'C44B3977-0E415CC6-EE663AA1-776C973A-A143B660'
const misread = (code, n) => code.slice(0, code.length - n) + [...code.slice(code.length - n)].map((ch) => (ch === 'F' ? 'E' : 'F')).join('')
const ekasaRead = reader.readingFrom({ je_doklad: true, typ: 'blocek', suma_celkom: '3.80', ekasa_uid: ' o-7dbcda8a56ee426dbcda8a56ee426d1a', ekasa_okp: 'C44B3977-0E415CC6' })
check("the reader's eKasa codes are kept when they are codes", ekasaRead?.ekasaUid === UID && ekasaRead.ekasaOkp === null, JSON.stringify(ekasaRead))
check(
  'an identifier is a letter, a dash and 32 hexadecimal characters, a nought for the letter O put right',
  ekasa.ekasaUid(UID.toLowerCase()) === UID && ekasa.ekasaUid(`0${UID.slice(1)}`) === UID && ekasa.ekasaUid(`O - ${UID.slice(2, 18)} ${UID.slice(18)}`) === UID,
)
check(
  'anything else is no identifier',
  ekasa.ekasaUid(UID.slice(0, -1)) === null && ekasa.ekasaUid(`${UID.slice(0, -1)}G`) === null && ekasa.ekasaUid(UID.slice(2)) === null && ekasa.ekasaUid(`${UID}0`) === null && ekasa.ekasaUid(42) === null,
)
check(
  'a verification code is five blocks of eight, however it was written',
  ekasa.ekasaOkp(OKP.replace(/-/g, '').toLowerCase()) === OKP && ekasa.ekasaOkp(OKP.replace(/-/g, ' ')) === OKP && ekasa.ekasaOkp(OKP) === OKP,
)
check('or it is none', ekasa.ekasaOkp(OKP.slice(0, 35)) === null && ekasa.ekasaOkp(`X${OKP.slice(1)}`) === null && ekasa.ekasaOkp(UID) === null && ekasa.ekasaOkp(null) === null)
check('one receipt read twice with up to four characters wrong is one', ekasa.sameReceipt({ ekasaUid: UID }, { ekasaUid: misread(UID, 4) }) === true && ekasa.sameReceipt({ ekasaOkp: OKP }, { ekasaOkp: misread(OKP, 4) }) === true)
check('five wrong is another receipt', ekasa.sameReceipt({ ekasaUid: UID }, { ekasaUid: misread(UID, 5) }) === false && ekasa.sameReceipt({ ekasaOkp: OKP }, { ekasaOkp: misread(OKP, 5) }) === false)
check('either code agreeing is enough', ekasa.sameReceipt({ ekasaUid: UID, ekasaOkp: OKP }, { ekasaUid: misread(UID, 9), ekasaOkp: OKP }) === true)
check('nothing to compare says nothing', ekasa.sameReceipt({ ekasaUid: UID }, { ekasaOkp: OKP }) === null && ekasa.sameReceipt({}, { ekasaUid: UID }) === null)

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
{
  // Every text of the product, whatever file it lives in: no long dash (he asked for none), comments aside.
  const { readdirSync } = await import('node:fs')
  const walk = (dir) => readdirSync(new URL(`../${dir}`, import.meta.url), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${dir}/${e.name}`) : /\.tsx?$/.test(e.name) ? [`${dir}/${e.name}`] : []))
  const dashed = walk('src').flatMap((file) =>
    readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
      .split('\n')
      .map((line, i) => ({ file, n: i + 1, line: line.trim() }))
      .filter(({ line }) => !line.startsWith('//') && !line.startsWith('*') && !line.startsWith('/*') && /[–—]/.test(line.replace(/\/\/.*$/, ''))),
  )
  check('no text anywhere in the product has a long dash', dashed.length === 0, dashed.slice(0, 3).map((d) => `${d.file}:${d.n}`).join(' '))
}
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
  JSON.stringify(booking.categoriesFor('invoice_out')) === JSON.stringify(['sales', 'sales_goods', 'advance']) && !booking.categoriesFor('receipt').includes('sales'),
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
check('the same supplier, number and amount identifies a suspected duplicate', booking.sameDocument({ ...docA, number: '2026/118' }, { ...docA, number: '2026118' }))
check('two different suppliers can issue the same invoice number and amount', !booking.sameDocument({ ...docA, number: '1' }, { ...docA, number: '1', partyIco: '50999888' }))
check('different names with no IČO do not share an invoice sequence', !booking.sameDocument({ ...docA, number: '1', partyIco: null, party: 'Dodávateľ Alfa' }, { ...docA, number: '1', partyIco: null, party: 'Dodávateľ Beta' }))
check('missing supplier identity cannot establish a duplicate from number alone', !booking.sameDocument({ ...docA, number: '1', partyIco: null, party: null }, { ...docA, number: '1', partyIco: null, party: null }))
check('one missing IČO can fall back to the matching supplier name', booking.sameDocument({ ...docA, number: '1' }, { ...docA, number: '1', partyIco: null }))
check('reused receipt numbers on different dates stay separate', !booking.sameDocument({ ...docA, number: '1' }, { ...docA, number: '1', issuedOn: '2026-10-11' }))
check(
  'another amount, another day, or another number is not',
  !booking.sameDocument(docA, { ...docA, totalCents: 1250 }) &&
    !booking.sameDocument(docA, { ...docA, issuedOn: '2026-10-11' }) &&
    !booking.sameDocument({ ...docA, number: '1' }, { ...docA, number: '2' }),
)
check('an eKasa receipt is known by its code, whatever amount was read', booking.sameDocument({ ...docA, ekasaUid: UID }, { ...docA, totalCents: 1210, ekasaUid: misread(UID, 1) }))
check(
  'two receipts of one number and amount are two when their codes differ (a till starts again at 1 each month)',
  !booking.sameDocument({ ...docA, number: '1', ekasaUid: UID }, { ...docA, number: '1', ekasaUid: misread(UID, 12) }),
)
check('a receipt without a code is judged as before', booking.sameDocument({ ...docA, number: '1', ekasaUid: UID }, { ...docA, number: '1' }))
const sampleCodes = ['demo-doc-6', 'demo-doc-12'].map((id) => demo.sampleCodes(id))
check(
  'the sample receipts carry codes of the right form, each its own, the same on every run',
  sampleCodes.every((c) => ekasa.ekasaUid(c.uid) === c.uid && ekasa.ekasaOkp(c.okp) === c.okp) &&
    ekasa.sameReceipt({ ekasaUid: sampleCodes[0].uid, ekasaOkp: sampleCodes[0].okp }, { ekasaUid: sampleCodes[1].uid, ekasaOkp: sampleCodes[1].okp }) === false &&
    demo.sampleCodes('demo-doc-6').uid === sampleCodes[0].uid,
  JSON.stringify(sampleCodes),
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
const valueMessages = { customerName: 'name', customerIcdph: 'customerIcdph', customerEmail: 'email', customerIco: 'ico', issued: 'issued', delivered: 'delivered', due: 'due', iban: 'iban', lines: 'lines', form: 'form' }
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
check("a VAT payer's supply at nought is exempt, with its reason", exempt.includes('<cbc:ID>E</cbc:ID><cbc:Percent>0</cbc:Percent><cbc:TaxExemptionReason>Dodanie je oslobodené od dane</cbc:TaxExemptionReason>'))
// How an invoice is taxed (18 October 2026): goods to another member state, a service whose customer pays the VAT, an
// export, a supply outside Slovakia, each with the words § 74(1) asks for and its category and code in EN 16931.
const abroad = { ...stored, customerIcdph: 'DE123456789', customerDic: null }
const zero = [{ position: 1, description: 'Tovar', quantityMilli: 1000, unit: 'ks', unitCents: 10000, vatRate: 0, baseCents: 10000 }]
const euGoods = invoices.ublOf({ ...abroad, mode: 'eu_goods' }, zero, seller)
const euService = invoices.ublOf({ ...abroad, mode: 'eu_service' }, zero, seller)
const outside = invoices.ublOf({ ...abroad, mode: 'outside' }, zero, seller)
check(
  'goods to another member state are K at 0 % with VATEX-EU-IC, § 43 and the state they went to; a service AE, "prenesenie daňovej povinnosti"; outside Slovakia O, without a rate or a VAT number',
  euGoods.includes('<cbc:ID>K</cbc:ID><cbc:Percent>0</cbc:Percent><cbc:TaxExemptionReasonCode>VATEX-EU-IC</cbc:TaxExemptionReasonCode><cbc:TaxExemptionReason>Dodanie je oslobodené od dane podľa § 43') &&
    euGoods.includes('<cac:DeliveryLocation><cac:Address><cac:Country><cbc:IdentificationCode>DE</cbc:IdentificationCode>') &&
    euService.includes('<cbc:ID>AE</cbc:ID><cbc:Percent>0</cbc:Percent><cbc:TaxExemptionReasonCode>VATEX-EU-AE</cbc:TaxExemptionReasonCode><cbc:TaxExemptionReason>Prenesenie daňovej povinnosti</cbc:TaxExemptionReason>') &&
    euService.includes('<cbc:CompanyID>DE123456789</cbc:CompanyID>') &&
    outside.includes('<cbc:ID>O</cbc:ID><cbc:TaxExemptionReasonCode>VATEX-EU-O</cbc:TaxExemptionReasonCode>') &&
    !outside.includes('<cbc:Percent>') &&
    !outside.includes('SK2122222222'),
)
check(
  "a line's rate does not count for a supply without Slovak VAT, and its customer's VAT number of another member state is asked",
  invoices.linesOf({ ...form([{ ...blank, description: 'A', price: '10', vat: '23' }]), mode: 'eu_goods' }, true, lineMessages).lines[0].vatRate === 0 &&
    invoices.checkValues({ ...form([]), mode: 'eu_goods', customerIcdph: 'SK2120000000' }, booking.dayOfText, valueMessages).customerIcdph === 'customerIcdph' &&
    invoices.checkValues({ ...form([]), mode: 'eu_service', customerIcdph: 'CZ12345678' }, booking.dayOfText, valueMessages).customerIcdph === undefined,
)
check(
  "the VAT proposal of an invoice issued here follows the mode its issuer declared",
  vat.proposeVat({ id: 'x', kind: 'invoice_out', number: '1', party: 'A', partyIco: null, partyVatId: 'DE123456789', modeHint: 'eu_goods', lines: [{ rate: 0, base: 10000, vat: 0 }], issuedOn: '2026-10-01', receivedOn: '2026-10-01', totalCents: 10000, vatCents: 0, currency: 'EUR', category: 'sales_goods', vatDeduct: null, booked: true, vat: null }, { status: 'payer', quarterly: false, since: '2020-01-01' })?.mode === 'eu_goods',
)

// Credit notes (18 October 2026)
const sold = [
  { position: 1, description: 'Stolička', quantityMilli: 4000, unit: 'ks', unitCents: 5000, vatRate: 23, baseCents: 20000 },
  { position: 2, description: 'Kniha', quantityMilli: 1000, unit: 'ks', unitCents: 2050, vatRate: 5, baseCents: 2050 },
]
const back = invoices.creditLines([{ ...sold[1], quantityMilli: 1000, baseCents: 2050 }])
check(
  "a credit note's VAT mirrors the invoice's: rounded on the amount, then the minus",
  invoices.totalsOf(sold, true).rates.find((r) => r.rate === 5)?.vat === 103 && invoices.totalsOf(back, true).rates[0].vat === -103 && invoices.totalsOf(back, true).total === -2153,
)
const leftAfter = invoices.creditLeft(sold, invoices.creditLines([{ ...sold[0], quantityMilli: 1000, baseCents: 5000 }]), true)
check(
  'what an invoice may still be lowered by, rate by rate, and the first rate a credit note takes too much at',
  leftAfter.get(23) === 15000 &&
    leftAfter.get(5) === 2050 &&
    invoices.creditTooMuch(leftAfter, invoices.creditLines([{ ...sold[0], quantityMilli: 4000, baseCents: 20000 }]), true)?.left === 15000 &&
    invoices.creditTooMuch(leftAfter, invoices.creditLines([{ ...sold[0], quantityMilli: 3000, baseCents: 15000 }]), true) === null &&
    invoices.creditTooMuch(leftAfter, invoices.creditLines([{ ...sold[0], vatRate: 19 }]), true)?.rate === 19,
)
const creditUbl = invoices.ublOf({ ...stored, number: '20260007', kind: 'credit', corrects: 'i', correctsNumber: '20260006', correctsIssuedOn: '2026-10-01', reason: 'Vrátený tovar', note: null }, back, seller)
check(
  "a credit note's e-invoice: UBL's CreditNote of type 381 naming the invoice, the reason as its one note, the amounts plus, no due day or account",
  creditUbl.includes('<CreditNote xmlns="urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2"') &&
    creditUbl.includes('<cbc:CreditNoteTypeCode>381</cbc:CreditNoteTypeCode>') &&
    creditUbl.includes('<cbc:Note>Dôvod opravy: Vrátený tovar</cbc:Note>') &&
    creditUbl.includes('<cac:BillingReference><cac:InvoiceDocumentReference><cbc:ID>20260006</cbc:ID><cbc:IssueDate>2026-10-01</cbc:IssueDate>') &&
    creditUbl.includes('<cbc:PayableAmount currencyID="EUR">21.53</cbc:PayableAmount>') &&
    creditUbl.includes('<cac:CreditNoteLine>') &&
    !creditUbl.includes('<cbc:DueDate>') &&
    !creditUbl.includes('PaymentMeans') &&
    creditUbl.trim().endsWith('</CreditNote>'),
)
check(
  'the postal address in its parts, a customer abroad in its own state with its VAT number as the address on Peppol',
  issuedUbl.includes('<cbc:StreetName>Námestie 2</cbc:StreetName>') === false &&
    invoices.ublOf({ ...stored, customerAddress: 'Námestie 2, 040 01 Košice' }, ublLines, seller).includes('<cbc:StreetName>Námestie 2</cbc:StreetName><cbc:CityName>Košice</cbc:CityName><cbc:PostalZone>04001</cbc:PostalZone>') &&
    invoices.ublOf({ ...stored, customerIcdph: 'CZ12345678', customerDic: null }, ublLines, seller).includes('<cbc:EndpointID schemeID="9929">CZ12345678</cbc:EndpointID>') &&
    invoices.ublOf({ ...stored, customerIcdph: 'EL123456789', customerDic: null }, ublLines, seller).includes('<cbc:IdentificationCode>GR</cbc:IdentificationCode>') &&
    invoices.ublOf({ ...stored, iban: null }, ublLines, seller).includes('<cbc:PaymentMeansCode>1</cbc:PaymentMeansCode>'),
)

// Advances (18 October 2026): the payment split by the request's rates, each part exactly what came; deducted on the final invoice.
{
  const request = [
    { position: 1, description: 'Stoličky', quantityMilli: 1000, unit: 'ks', unitCents: 100000, vatRate: 23, baseCents: 100000 },
    { position: 2, description: 'Knihy', quantityMilli: 1000, unit: 'ks', unitCents: 20000, vatRate: 5, baseCents: 20000 },
  ]
  const parts = invoices.advanceLines(request, 60000, true, (rate) => `Záloha ${rate} %`)
  const sums = invoices.totalsOf(parts, true)
  check(
    "an advance's tax document: the payment split by the request's rates as each asks with its VAT, to the cent",
    parts.length === 2 && parts[0].vatRate === 23 && parts[1].vatRate === 5 && sums.total === 60000 && sums.rates.every((r) => r.base > 0) && Math.abs(sums.rates[0].base + sums.rates[0].vat - Math.round((60000 * 123000) / 144000)) <= 1,
    JSON.stringify(sums),
  )
  check(
    'odd amounts still make exactly what came, and no part of nothing',
    [1, 2, 3, 99, 12345, 77777, 100001].every((paid) => {
      const lines = invoices.advanceLines(request, paid, true, () => 'z')
      return invoices.totalsOf(lines, true).total === paid && lines.every((l) => l.baseCents + (l.vatCents ?? 0) > 0)
    }),
  )
  const one = invoices.advanceLines([{ baseCents: 100000, vatRate: 23 }], 60000, true, () => 'z')
  check(
    'the VAT in a payment is what is left of it after its base, the payment divided by one and the rate',
    one.length === 1 && one[0].baseCents === 48780 && one[0].vatCents === 11220 && invoices.totalsOf(one, true).vat === 11220,
    JSON.stringify(one),
  )
  check(
    'so a payment no base would make with its VAT counted from the base is still the tax document of it',
    [3, 10003, 20001].every((paid) => invoices.totalsOf(invoices.advanceLines([{ baseCents: 100000, vatRate: 23 }], paid, true, () => 'z'), true).total === paid),
  )
  const noVat = invoices.advanceLines(request.map((l) => ({ ...l, vatRate: 0 })), 50000, false, () => 'Záloha')
  check('a company that is no VAT payer: one part, all of it', noVat.length === 1 && noVat[0].baseCents === 50000)
  const off = invoices.deductionLines([{ number: '20260003', lines: parts }], 3, (n) => `Odpočet zálohy, doklad č. ${n}`)
  const final = invoices.totalsOf([...request, ...off], true)
  check(
    "a final invoice deducts each advance's document rate by rate; what remains to pay is the whole less what came",
    off.length === 2 && off.every((l) => l.baseCents < 0 && l.description.includes('20260003')) && final.total === invoices.totalsOf(request, true).total - 60000,
    JSON.stringify(final),
  )
  const advanceUbl = invoices.ublOf({ ...stored, number: '20260008', kind: 'advance', iban: null }, parts, seller)
  const advanceRead = xml.readInvoice(advanceUbl, stored.customerIco)
  check(
    "an advance's e-invoice is a prepayment invoice with nothing due, and its customer reads what was paid",
    advanceUbl.includes('<cbc:InvoiceTypeCode>386</cbc:InvoiceTypeCode>') && advanceUbl.includes('<cbc:PayableAmount currencyID="EUR">0.00</cbc:PayableAmount>') && advanceRead?.totalCents === 60000,
    JSON.stringify(advanceRead?.totalCents),
  )
  check(
    "and its VAT is the whole supply's less what the advance declared, rate by rate",
    final.rates.every((r) => r.vat === invoices.totalsOf(request, true).rates.find((x) => x.rate === r.rate).vat - sums.rates.find((x) => x.rate === r.rate).vat),
    JSON.stringify(final.rates),
  )
}

// Invoices in another currency (18 October 2026): amounts in the currency, the VAT also in euros at the rate of the
// day before the supply, the e-invoice in the currency with the VAT in euros, paid in euros by its number.
{
  const usd = [
    { position: 1, description: 'Consulting', quantityMilli: 10000, unit: 'hod', unitCents: 12000, vatRate: 23, baseCents: 120000 },
    { position: 2, description: 'Book', quantityMilli: 1000, unit: 'ks', unitCents: 5000, vatRate: 5, baseCents: 5000 },
  ]
  const totals = invoices.totalsOf(usd, true)
  const inEur = invoices.eurVat(totals, 1082300)
  check(
    "an invoice in dollars: its VAT in euros rate by rate at the day's rate, each to the cent as the return takes it",
    totals.vat === 27600 + 250 && inEur.rates[0].vat === fx.eurOf(27600, 1082300) && inEur.rates[1].vat === fx.eurOf(250, 1082300) && inEur.vat === inEur.rates[0].vat + inEur.rates[1].vat,
    JSON.stringify(inEur),
  )
  check('an amount in its currency', format.formatMoney(123450, 'USD') === `1${NB}234,50${NB}USD` && format.formatMoney(123450) === format.formatEurExact(123450))
  const usdUbl = invoices.ublOf({ ...stored, currency: 'USD', fxRate: '1,0823', fxDay: '2026-09-30' }, usd, seller)
  check(
    'its e-invoice is in dollars throughout, with the VAT also in euros (BT-6, BT-111)',
    usdUbl.includes('<cbc:DocumentCurrencyCode>USD</cbc:DocumentCurrencyCode>\n<cbc:TaxCurrencyCode>EUR</cbc:TaxCurrencyCode>') &&
      !usdUbl.includes('currencyID="EUR">1') &&
      usdUbl.includes(`<cac:TaxTotal><cbc:TaxAmount currencyID="EUR">${(inEur.vat / 100).toFixed(2)}</cbc:TaxAmount></cac:TaxTotal>`) &&
      usdUbl.includes('<cbc:PayableAmount currencyID="USD">1528.50</cbc:PayableAmount>'),
  )
  const doc = { id: 'd', kind: 'invoice_out', issuedOn: '2026-10-01', dueOn: '2026-10-15', totalCents: 152850, party: 'Buyer Inc', partyIban: null, vs: '20260011', currency: 'USD', eurCents: fx.eurOf(152850, 1082300) }
  const pay = (amountCents, vs, currency = 'EUR') => ({ id: 'p', bookedOn: '2026-10-10', amountCents, party: 'BUYER INC', partyIban: null, vs, currency })
  check(
    'paid in euros by its number, near its euros at its rate: the same; without its number, too far, or the dollars as euros: not',
    match.score(pay(140000, '20260011'), doc) >= match.AUTO_SCORE &&
      match.score(pay(140000, null), doc) === 0 &&
      match.score(pay(120000, '20260011'), doc) === 0 &&
      match.score(pay(152850, '20260011'), doc) === 0 &&
      match.score(pay(152850, '20260011', 'USD'), doc) >= match.AUTO_SCORE,
    JSON.stringify([match.score(pay(140000, '20260011'), doc), doc.eurCents]),
  )
  check(
    'amounts are compared in one currency: crowns are never taken for euros',
    match.score(pay(124000, null), { ...doc, kind: 'invoice_out', totalCents: 124000, currency: 'CZK', eurCents: null, vs: null }) === 0,
  )
}

// Invoices issued again by themselves (18 October 2026): the day of the month kept, the next day after today.
check(
  'a repeat keeps its day of the month: the 31st is the last day of a shorter month and the 31st again after it',
  repeat.anchoredDay('2026-01-31', 1, 31) === '2026-02-28' &&
    repeat.anchoredDay('2026-02-28', 1, 31) === '2026-03-31' &&
    repeat.anchoredDay('2028-01-31', 1, 31) === '2028-02-29' &&
    repeat.anchoredDay('2026-11-15', 3, 15) === '2027-02-15' &&
    repeat.anchoredDay('2026-10-18', 12, 18) === '2027-10-18',
)
check(
  'after a schedule that did not run, the next day is the first one after today, not every one missed',
  repeat.nextAfter('2026-07-05', 1, 5, '2026-10-18') === '2026-11-05' && repeat.nextAfter('2026-10-18', 1, 18, '2026-10-18') === '2026-11-18' && repeat.nextAfter('2026-12-01', 1, 1, '2026-10-18') === '2026-12-01',
)
check('every month, quarter or year, nothing else', repeat.isRepeatEvery('1') && repeat.isRepeatEvery(3) && repeat.isRepeatEvery('12') && !repeat.isRepeatEvery('2') && !repeat.isRepeatEvery('x'))

// The customer's state (18 October 2026): chosen, else its VAT number's, else Slovakia; never against its VAT number.
{
  const abroad = invoices.ublOf({ ...stored, customerIcdph: null, customerDic: null, customerIco: null, customerCountry: 'US', mode: 'export' }, [{ position: 1, description: 'Tovar', quantityMilli: 1000, unit: 'ks', unitCents: 10000, vatRate: 0, baseCents: 10000 }], seller)
  const customer = abroad.match(/<cac:AccountingCustomerParty>[\s\S]*?<\/cac:AccountingCustomerParty>/)?.[0] ?? ''
  check("an export to a private person names the customer's state, which no VAT number gives", customer.includes('<cbc:IdentificationCode>US</cbc:IdentificationCode>'))
  check(
    'the state of a VAT number, Slovakia without one, and the chosen state first',
    invoices.customerCountryOf({ customerCountry: null, customerIcdph: 'EL123456789' }) === 'GR' &&
      invoices.customerCountryOf({ customerCountry: null, customerIcdph: null }) === 'SK' &&
      invoices.customerCountryOf({ customerCountry: 'AT', customerIcdph: null }) === 'AT',
  )
  const values = { customerName: 'Kunde', customerAddress: '', customerIco: '', customerDic: '', customerIcdph: 'DE123456789', customerEmail: '', issued: '1. 10. 2026', delivered: '1. 10. 2026', due: '1. 10. 2026', iban: '', note: '', lines: [] }
  const messages = new Proxy({}, { get: (_, key) => String(key) })
  check(
    'a state chosen against the VAT number is said',
    invoices.checkValues({ ...values, customerCountry: 'CZ' }, (t) => (t ? '2026-10-01' : null), messages).customerCountry === 'customerCountry' &&
      !invoices.checkValues({ ...values, customerCountry: 'DE' }, (t) => (t ? '2026-10-01' : null), messages).customerCountry,
  )
}

// Payment orders (18 October 2026): the suppliers' invoices owed as one SEPA file the bank imports (pain.001.001.03).
{
  const xml = payorders.painXml({
    id: '0b6f3c2e-1d4a-4f7b-9a1e-5c2d8e7f6a90',
    company: 'TEST-ONLY Ukážková firma s. r. o.',
    accountIban: 'SK31 1200 0000 1987 4263 7541',
    executeOn: '2026-10-20',
    createdAt: Date.parse('2026-10-18T08:30:00Z') / 1000,
    items: [
      { documentId: 'a', cents: 12300, iban: 'SK8975000000000012345671', vs: '2026118', party: 'Hostingový dom s. r. o.', number: 'F2026118' },
      { documentId: 'b', cents: 5990, iban: 'CZ6508000000192000145399', vs: null, party: 'Účtovný & <softvér> a.s.', number: '77' },
    ],
  })
  const schema = readFileSync(new URL('./xsd/pain.001.001.03.xsd', import.meta.url), 'utf8')
  const result = await validateXML({ xml: [{ fileName: 'prikaz.xml', contents: xml }], schema: [{ fileName: 'pain.001.001.03.xsd', contents: schema }] })
  check('a payment order is valid pain.001.001.03', result.valid, result.errors.map((e) => e.message).join(' | '))
  const broken = await validateXML({ xml: [{ fileName: 'prikaz.xml', contents: xml.replace('<ReqdExctnDt>2026-10-20</ReqdExctnDt>', '') }], schema: [{ fileName: 'pain.001.001.03.xsd', contents: schema }] })
  check('and the schema sees a payment order without its day as none', !broken.valid)
  check(
    'its sums, the account, the day, and each payment with its symbols as Slovak banks read them',
    xml.includes('<NbOfTxs>2</NbOfTxs><CtrlSum>182.90</CtrlSum>') &&
      xml.includes('<ReqdExctnDt>2026-10-20</ReqdExctnDt>') &&
      xml.includes('<DbtrAcct><Id><IBAN>SK3112000000198742637541</IBAN></Id></DbtrAcct>') &&
      xml.includes('<EndToEndId>/VS2026118/SS/KS</EndToEndId>') &&
      xml.includes('<EndToEndId>NOTPROVIDED</EndToEndId>') &&
      xml.includes('<InstdAmt Ccy="EUR">123.00</InstdAmt>'),
  )
  check(
    'names in basic Latin, without accents or characters a bank refuses',
    xml.includes('<Nm>Hostingovy dom s. r. o.</Nm>') && xml.includes('<Nm>Uctovny softver a.s.</Nm>') && xml.includes('<Nm>TEST-ONLY Ukazkova firma s. r. o.</Nm>'),
  )
  check('a variable symbol of more than ten digits is no symbol', payorders.endToEnd('12345678901') === 'NOTPROVIDED' && payorders.endToEnd('VS 0042') === '/VS42/SS/KS')
}

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
  let completed = false
  const strict = (source) => zip.zipStream(source, undefined, { strict: true, onComplete: async () => { completed = true } })
  let missingFailed = false
  try { await new Response(strict([{ name: 'missing.pdf', when: at, data: async () => null }])).arrayBuffer() } catch { missingFailed = true }
  check('a strict handover archive fails on a missing source and never records completion', missingFailed && !completed)
  const strictBytes = new Uint8Array(await new Response(strict([{ name: 'present.txt', when: at, data: async () => enc.encode('kept') }])).arrayBuffer())
  check('completion is recorded only after the complete, readable ZIP has been emitted', completed && unzip(strictBytes)?.[0]?.sumOk)
  completed = false
  const cancelled = strict([{ name: 'cancelled.txt', when: at, data: async () => enc.encode('kept') }]).getReader()
  await cancelled.read(); await cancelled.cancel()
  check('a cancelled archive does not count as a completed handover', !completed)
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
    'the terms promise ten days for the last month, thirty for the handover, access until deleting, ninety days once confirmed or a year without it',
    /10\.4 .*10 dní po jej skončení.*Do 30 dní.*potvrdíte.*kým údaje nevymažeme podľa bodu 8\.8/.test(text) && /8\.8 .*po uplynutí 90 dní od skončenia, keď potvrdíte.*inak rok po skončení zmluvy.*päť rokov/.test(text),
  )
  check("the figures of the terms are the config's", config.ENDING.intakeDays === 10 && config.ENDING.handoverDays === 30 && config.ENDING.keepDays === 90 && config.ENDING.unconfirmedDays === 365 && config.ENDING.recordsYears === 5)
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
  const toEu = (issuedOn) => vat.taxDay(doc({ kind: 'invoice_out', issuedOn }), v('eu_goods', [[0, 100, 0]], { suppliedOn: '2027-01-10' }))
  check('goods supplied to the EU the same way (§ 19(8)): an invoice issued late falls in the month of the 15th', toEu('2027-01-12') === '2027-01-12' && toEu('2027-02-20') === '2027-02-15')
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
  {
    // The documents sorted by period once (the load test of 17 October 2026) give every period the same result as all
    // of them gone through for each, including one not read yet and one of another month.
    const unread = doc({ kind: null, booked: false, number: 'U-1', issuedOn: '2027-01-05' })
    const all = [...month, unread]
    const buckets = vat.vatDocsByPeriod(payer, all, new Map([['2026-12', '2027-01-20']]))
    const same = ['2026-12', '2027-01', '2027-02', '2027-03'].every(
      (p) => JSON.stringify(vat.workOut(payer, p, all, new Map([['2026-12', '2027-01-20']]))) === JSON.stringify(vat.workOut(payer, p, buckets.get(p) ?? [], new Map([['2026-12', '2027-01-20']]))),
    )
    check('working out each period from its own documents gives what all of them give', same && (buckets.get('2027-01') ?? []).includes(unread) && (buckets.get('2027-02') ?? []).length === 1)
  }
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

  // Domestic reverse charge issued (§ 69(12), 18 October 2026): A.2 alone, no row of the return.
  {
    const rv = (reverse, lines = [[0, 600000, 0]], extra = {}) => doc({ kind: 'invoice_out', number: `R${n + 1}`, vat: v('reverse', lines, { vatId: 'SK2020000000', reverse, ...extra }) })
    const ptp = vat.workOut(payer, '2027-01', [
      rv({ kind: 'j', code: null, quantity: null, unit: null }),
      rv({ kind: 'g', code: '7204', quantity: 125050, unit: 't' }, [[0, 250000, 0]]),
      rv({ kind: 'h', code: null, quantity: 1000, unit: 'ks' }, [[0, 499999, 0]]),
      rv({ kind: 'f', code: null, quantity: 1000, unit: 'kg' }),
      rv({ kind: 'j', code: null, quantity: null, unit: null }, undefined, { vatId: null }),
      rv({ kind: 'other', code: null, quantity: null, unit: null }),
      rv(null),
    ])
    check(
      'reverse charge issued: construction and metals in A.2 (the code, the quantity, its unit), none in the rows of the return',
      ptp.kv.a2.length === 2 &&
        ptp.kv.a2[0].odb === 'SK2020000000' &&
        ptp.kv.a2[0].z === 600000 &&
        ptp.kv.a2[0].tk === null &&
        ptp.kv.a2[0].mn === null &&
        ptp.kv.a2[1].tk === '7204' &&
        ptp.kv.a2[1].mn === 125050 &&
        ptp.kv.a2[1].mj === 't' &&
        ptp.rows.r13 === 0 &&
        ptp.rows.r01 === 0 &&
        ptp.rows.r17 === 0,
      JSON.stringify(ptp.kv.a2),
    )
    check(
      'what keeps one back: phones under 5 000 €, crops without their code, a customer without a Slovak VAT number, no kind; the letters a to e are the customer\'s alone',
      ['reverseThreshold', 'reverseGoods', 'reverseCustomer', 'reverseKind'].every((code) => ptp.issues.some((i) => i.code === code && i.level === 'block')) && ptp.issues.filter((i) => i.level === 'block').length === 4,
      JSON.stringify(ptp.issues),
    )
    const a2Xml = vatXml.statementXml(filer, '2027-01', ptp.kv)
    const a2Valid = await valid(a2Xml, KV_XSD, 'kv-a2')
    check(
      'A.2 in the control statement file, valid against kv_dph_2025.xsd',
      a2Valid.ok && /<A2 Odb="SK2020000000" F="R\d+" Den="2027-01-15" Z="6000.00"\/>/.test(a2Xml) && a2Xml.includes('TK="7204"') && a2Xml.includes('Mn="1250.50" MJ="t"'),
      `${a2Valid.why} ${a2Xml.match(/<A2[^>]*>/g)?.join(' ')}`,
    )
    // A corrective invoice of a reverse-charged supply (18 October 2026): C.1 with the base's difference, no VAT or rate,
    // and for goods what A.2 says of them, the quantity a difference too.
    const fixes = vat.workOut(payer, '2027-01', [
      rv({ kind: 'g', code: '7204', quantity: 10000, unit: 't' }, [[0, -20000, 0]], { corrects: 'R7' }),
      rv({ kind: 'j', code: null, quantity: null, unit: null }, [[0, -50000, 0]], { corrects: 'R8' }),
    ])
    check(
      'a correction of a reverse-charged supply goes into C.1 without VAT, goods with their code and the quantity as a minus',
      fixes.kv.c1.length === 2 &&
        fixes.kv.c1[0].zr === -20000 &&
        fixes.kv.c1[0].dr === null &&
        fixes.kv.c1[0].s === null &&
        fixes.kv.c1[0].tk === '7204' &&
        fixes.kv.c1[0].mn === -10000 &&
        fixes.kv.c1[0].mj === 't' &&
        fixes.kv.c1[1].fp === 'R8' &&
        fixes.kv.c1[1].mn === null &&
        fixes.kv.a2.length === 0 &&
        !fixes.issues.some((i) => i.level === 'block') &&
        fixes.issues.some((i) => i.code === 'reverseCorrection' && i.level === 'warn'),
      JSON.stringify([fixes.kv.c1, fixes.issues]),
    )
    const c1Xml = vatXml.statementXml(filer, '2027-01', fixes.kv)
    const c1Valid = await valid(c1Xml, KV_XSD, 'kv-c1')
    check(
      'and the file takes it, valid against kv_dph_2025.xsd',
      c1Valid.ok && c1Xml.includes('ZR="-200.00" TK="7204" Mn="-100.00" MJ="t"') && !/<C1[^>]*DR=/.test(c1Xml),
      `${c1Valid.why} ${c1Xml.match(/<C1[^>]*>/g)?.join(' ')}`,
    )
  }

  {
    const ctx = { kind: 'invoice_out', payer: true, deduct: false, booking: true, periods: ['2027-01'] }
    const body = (extra) => ({ dph_rezim: 'reverse', dph_dodanie: '15. 1. 2027', dph_icdph: 'SK2020000000', dph_zaklad_0: '6000', ...extra })
    const ok = vatForm.readVat(body({ dph_ptp_druh: 'g', dph_ptp_kod: '7204', dph_ptp_mnozstvo: '1 250,5', dph_ptp_jednotka: 't' }), ctx)
    const missing = vatForm.readVat(body({ dph_ptp_druh: 'g', dph_ptp_kod: '72', dph_ptp_mnozstvo: '', dph_ptp_jednotka: '' }), ctx)
    const taxed = vatForm.readVat(body({ dph_ptp_druh: 'j', dph_zaklad_23: '100', dph_zaklad_0: '' }), ctx)
    check(
      "the booking form takes an issued reverse charge with what A.2 asks, and no VAT of the supplier's",
      ok.data?.mode === 'reverse' &&
        ok.data.reverse?.kind === 'g' &&
        ok.data.reverse.code === '7204' &&
        ok.data.reverse.quantity === 125050 &&
        ok.data.reverse.unit === 't' &&
        ok.data.lines[0].vat === 0 &&
        missing.errors.reverseCode === 'reverseCode' &&
        missing.errors.reverseQuantity === 'reverseQuantity' &&
        taxed.errors.base23 === 'zeroOnly' &&
        vatForm.vatValues(ok.data).reverseQuantity === '1250,5',
      JSON.stringify([ok, missing.errors, taxed.errors]),
    )
  }

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
  const sepKv = { ...vat.kvFileOf({ a1: [], a2: [], b1: [], b2: [], b31: null, b32: [], c1: [], c2: [], d2: null }), a1: [{ odb: null, f: '20260001', den: '2026-09-18', z: 10000, d: 2300, s: 23 }] }
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

// The recapitulative statement (súhrnný výkaz, § 80 of the VAT Act; the poučenie to SVDPHv20), and its file against the
// eForm's own schema
{
  const SV_XSD = readFileSync(new URL('./xsd/svdph2020.xsd', import.meta.url), 'utf8')
  const valid = async (xml) => {
    const result = await validateXML({ xml: [{ fileName: 'sv.xml', contents: xml }], schema: [{ fileName: 'sv.xsd', contents: SV_XSD }] })
    return { ok: result.valid, why: result.errors.map((e) => e.message).join(' | ') }
  }
  const payer = { status: 'payer', quarterly: false, since: null }
  let n = 0
  const sale = (vatId, base, mode = 'eu_service', fields = {}) => ({
    id: `s${++n}`,
    kind: 'invoice_out',
    number: `2027000${n}`,
    party: 'Kunde',
    partyIco: null,
    issuedOn: '2027-01-15',
    receivedOn: '2027-01-15',
    totalCents: base,
    vatCents: 0,
    currency: 'EUR',
    category: 'sales',
    vatDeduct: null,
    booked: true,
    vat: { mode, lines: [{ rate: 0, base, vat: 0, deduct: 0 }], suppliedOn: '2027-01-15', vatId, corrects: null, period: null },
    ...fields,
  })
  const docs = [sale('DE123456789', 80000), sale('de 123 456 789', 20049), sale('CZ12345678', 1_000_050, 'eu_goods'), sale('EL094259216', 150)]
  const { lines, issues } = vatSummary.summaryLines(payer, '2027-01', docs)
  const rows = vatSummary.rowsOf(lines)
  check(
    "each customer's total by its VAT number, goods without a code and services with 2, in whole euros half up",
    JSON.stringify(rows) ===
      JSON.stringify([
        { country: 'CZ', number: '12345678', euros: 10001, code: '' },
        { country: 'DE', number: '123456789', euros: 1000, code: '2' },
        { country: 'EL', number: '094259216', euros: 2, code: '2' },
      ]) && issues.length === 0,
    JSON.stringify(rows),
  )
  check('the total of the first page is the sum of the rows', vatSummary.totalOf(rows) === 11003)
  check(
    'a credit note lowers the customer in its own period, and nothing left is no row',
    vatSummary.rowsOf(vatSummary.summaryLines(payer, '2027-01', [sale('DE123456789', 80000), sale('DE123456789', -80000, 'eu_service', { vat: { ...sale('x', 0).vat, vatId: 'DE123456789', lines: [{ rate: 0, base: -80000, vat: 0, deduct: 0 }], corrects: '20270001' } })]).lines).length === 0 &&
      vatSummary.rowsOf(vatSummary.summaryLines(payer, '2027-01', [sale('DE123456789', -12350)]).lines)[0]?.euros === -124,
  )
  check(
    'a customer without a VAT number of another member state keeps it back, and so does an invoice not booked',
    vatSummary.summaryLines(payer, '2027-01', [sale(null, 1000), sale('SK2020000000', 1000), sale('US123456789', 1000)]).issues.filter((i) => i.code === 'svVatId').length === 3 &&
      vatSummary.summaryLines(payer, '2027-01', [sale('DE123456789', 1000, 'eu_service', { booked: false })]).issues[0]?.code === 'unbooked',
  )
  check('what is not the period is not in it', vatSummary.summaryLines(payer, '2027-02', docs).lines.length === 0 && !vatSummary.summaryLines(payer, '2027-02', docs).due)
  check(
    '§ 7a: the calendar quarter; a quarterly payer the quarter only within the goods limit',
    vatSummary.summaryPeriodOf('2027-02', { status: 'reg7a' }) === '2027-Q1' &&
      vatSummary.summaryPeriodOf('2027-02', payer) === '2027-02' &&
      vatSummary.summaryLines({ ...payer, quarterly: true }, '2027-Q1', [sale('CZ12345678', 5_000_100, 'eu_goods')]).issues.some((i) => i.code === 'svMonthly') &&
      !vatSummary.summaryLines({ ...payer, quarterly: true }, '2027-Q1', [sale('CZ12345678', 5_000_000, 'eu_goods'), sale('DE123456789', 9_000_000)]).issues.some((i) => i.code === 'svMonthly'),
  )

  const quarterly = { ...payer, quarterly: true }
  const goodsOn = (on, cents) => {
    const d = sale('CZ12345678', cents, 'eu_goods')
    return { ...d, issuedOn: on, receivedOn: on, vat: { ...d.vat, suppliedOn: on } }
  }
  const quarterlyView = (d) => vatSummary.summaryView(quarterly, '2027-Q1', d, null, 0, '2027-04-02')
  check('exceeding the current-quarter goods limit blocks the plan rather than merely warning', quarterlyView([goodsOn('2027-01-15', 5_000_001)]).state === 'blocked' && quarterlyView([goodsOn('2027-01-15', 5_000_001)]).plan === null)
  check('any of the previous four quarters can require monthly SV, including across a year boundary', ['2026-01-15', '2026-04-15', '2026-07-15', '2026-10-15'].every((on) => quarterlyView([goodsOn(on, 5_000_001), goodsOn('2027-01-15', 10000)]).plan === null))
  check('exactly 50 000 € stays eligible and the fifth previous quarter has expired', quarterlyView([goodsOn('2026-01-15', 5_000_000), goodsOn('2027-01-15', 10000)]).state === 'ready' && quarterlyView([goodsOn('2025-12-15', 5_000_001), goodsOn('2027-01-15', 10000)]).state === 'ready')
  const monthlyGoods = [goodsOn('2027-01-15', 3_000_000), goodsOn('2027-02-15', 2_500_000)]
  const monthlySchedule = vatSummary.summarySchedule(quarterly, '2027-Q1', monthlyGoods)
  check('quarterly VAT produces three independent monthly SV periods when the second month crosses the limit', monthlySchedule.monthly && monthlySchedule.crossedIn === '2027-02' && monthlySchedule.periods.join() === '2027-01,2027-02,2027-03')
  const janView = (today, filed = null, d = monthlyGoods) => vatSummary.summaryView(quarterly, '2027-01', d, filed, 0, today)
  check('a prior month waits for the end of the crossing month, with the crossing month\'s deadline', janView('2027-02-20').state === 'running' && janView('2027-03-01').state === 'ready' && janView('2027-03-01').endsOn === '2027-02-28' && janView('2027-03-01').deadline === '2027-03-25')
  check('monthly SV assigns only its own tax-day supplies, independently of the VAT quarter override', janView('2027-03-01', null, monthlyGoods.map((d) => ({ ...d, vat: { ...d.vat, period: '2027-Q2' } }))).rows[0]?.euros === 30000)
  const filedJan = { kind: 'R', filedOn: '2027-03-01', filedAt: 1, filedBy: null, rows: [{ country: 'CZ', number: '12345678', euros: 29000, code: '' }], sent: [], prev: null }
  check('the transition deadline controls corrective versus supplementary monthly SV too', janView('2027-03-02', filedJan).plan?.kind === 'O' && janView('2027-03-26', filedJan).plan?.kind === 'D')
  check('filing the first monthly SV does not remove the delayed deadline of the transition', vatSummary.summarySchedule(quarterly, '2027-Q1', monthlyGoods, ['2027-01']).crossedIn === '2027-02')
  check('FR SR example: October and November 2023 share 27 December after the holiday adjustment', vatSummary.summaryView(quarterly, '2023-10', [goodsOn('2023-10-15', 4_000_000), goodsOn('2023-11-15', 2_000_000)], null, 0, '2023-12-01').deadline === '2023-12-27')
  check('goods history is loaded from the first of the four preceding quarters', vatSummary.summaryLookbackFrom('2027-02') === '2026-Q1' && vatSummary.summaryLookbackFrom('2027-Q4') === '2026-Q4')
  check('service values alone never force monthly SV for a quarterly payer', !vatSummary.summarySchedule(quarterly, '2027-Q1', [sale('DE123456789', 9_000_000)]).monthly)
  check('an existing monthly filing sequence stays monthly even after later invoice edits remove the threshold', vatSummary.summarySchedule(quarterly, '2027-Q1', [], ['2027-01']).monthly)
  check('the first month of a new quarter can already have monthly SV deadlines while its VAT quarter runs', dues.summaryWindow({ vatStatus: 'payer', vatQuarterly: true, vatSince: '2026-01-01', startOn: '2026-01-01', endsOn: null }, '2027-02-05').includes('2027-Q1'))

  // States, and the corrections a change after filing asks for
  const view = (filed, today, d = docs) => vatSummary.summaryView(payer, '2027-01', d, filed, 0, today)
  check('the period running, then ready by the 25th', view(null, '2027-01-20').state === 'running' && view(null, '2027-02-03').state === 'ready' && view(null, '2027-02-03').plan?.kind === 'R' && view(null, '2027-02-03').deadline === '2027-02-25')
  check('nothing supplied, nothing to file', view(null, '2027-02-03', []).state === 'none' && view(null, '2027-02-03', [sale('DE123456789', 1000, 'domestic')]).state === 'none')
  check('supplies that came to nothing (an invoice and its credit note) leave nothing to file', view(null, '2027-02-03', [sale('DE123456789', 80000), sale('DE123456789', -80000)]).state === 'none')
  check('the company without its VAT number keeps it back', vatSummary.summaryView(payer, '2027-01', docs, null, 1, '2027-02-03').state === 'blocked')
  const filed = (fileRows) => ({ kind: 'R', filedOn: '2027-02-10', filedAt: 1, filedBy: null, rows: fileRows, sent: fileRows, prev: null })
  check('filed as it stands', view(filed(rows), '2027-02-11').state === 'filed' && view(filed(null), '2027-02-11').state === 'filed')
  const before = [rows[0], { ...rows[1], euros: 900 }, { country: 'AT', number: 'U12345678', euros: 300, code: '2' }]
  check('changed before the deadline: a corrective statement with every row', view(filed(before), '2027-02-20').state === 'changed' && JSON.stringify(view(filed(before), '2027-02-20').plan) === JSON.stringify({ kind: 'O', rows }))
  const late = view(filed(before), '2027-03-02').plan
  check(
    'after it: a supplementary one with the rows that change, a row that is no more at nought first',
    late?.kind === 'D' &&
      JSON.stringify(late.rows) ===
        JSON.stringify([
          { country: 'AT', number: 'U12345678', euros: 0, code: '2' },
          { country: 'DE', number: '123456789', euros: 1000, code: '2' },
          { country: 'EL', number: '094259216', euros: 2, code: '2' },
        ]),
    JSON.stringify(late),
  )
  check(
    "a code put right is cancelled with the code 0 (the poučenie's example 13), a wrong VAT number keeps its code (example 10)",
    JSON.stringify(vatSummary.svDiff([{ country: 'DK', number: '33333333', euros: 180000, code: '1' }], [{ country: 'DK', number: '33333333', euros: 180000, code: '' }])) ===
      JSON.stringify([
        { country: 'DK', number: '33333333', euros: 0, code: '0' },
        { country: 'DK', number: '33333333', euros: 180000, code: '' },
      ]) &&
      JSON.stringify(vatSummary.svDiff([{ country: 'CZ', number: '222222222', euros: 80000, code: '2' }], [{ country: 'CZ', number: '122222222', euros: 80000, code: '2' }])) ===
        JSON.stringify([
          { country: 'CZ', number: '222222222', euros: 0, code: '2' },
          { country: 'CZ', number: '122222222', euros: 80000, code: '2' },
        ]) &&
      JSON.stringify(vatSummary.svDiff([{ country: 'CZ', number: '102030405', euros: 40000, code: '' }], [{ country: 'CZ', number: '102030405', euros: 30000, code: '' }, { country: 'CZ', number: '102030405', euros: 10000, code: '2' }])) ===
        JSON.stringify([
          { country: 'CZ', number: '102030405', euros: 30000, code: '' },
          { country: 'CZ', number: '102030405', euros: 10000, code: '2' },
        ]),
  )
  check('changed while something keeps it back: no file until it is resolved', vatSummary.summaryView(payer, '2027-01', docs, filed(before), 1, '2027-03-02').plan === null)

  // The file
  const filer = { name: 'Termíny & spol. s. r. o.', icdph: 'SK2120999992', address: 'Hlavná 10, 040 01 Košice' }
  const xml = vatXml.summaryXml(filer, '2027-01', rows, 'R', '2027-02-03')
  let result = await valid(xml)
  check('the regular statement is valid against the eForm form.471 schema', result.ok, result.why)
  check(
    'written as the eForm writes it: SK and ten digits, 1 and 0, the month without its nought, the rows, the total, the day in three numbers',
    xml.includes('<identifikacneCislo><kodStatu>SK</kodStatu><dic>2120999992</dic></identifikacneCislo>') &&
      xml.includes('<druhSV><riadny>1</riadny><opravny>0</opravny><dodatocny>0</dodatocny></druhSV>') &&
      xml.includes('<obdobie><mesiac>1</mesiac><stvrtrok></stvrtrok><rok>2027</rok></obdobie>') &&
      xml.includes('<zaznam><kodStatu>DE</kodStatu><idCislo>123456789</idCislo><hodnota>1000</hodnota><kod>2</kod></zaznam>') &&
      xml.includes('<celkovaHodnota>11003</celkovaHodnota>') &&
      xml.includes('<riadok>Termíny &amp; spol. s. r. o.</riadok>') &&
      xml.includes('<datumVyhlasenia><den>3</den><mesiac>2</mesiac><rok>2027</rok></datumVyhlasenia>') &&
      (xml.match(/<zaznam>/g) ?? []).length === 12 &&
      (xml.match(/<zaznamCast2>/g) ?? []).length === 12,
  )
  const many = Array.from({ length: 13 }, (_, i) => ({ country: 'DE', number: String(100000000 + i), euros: 10, code: '2' }))
  const two = vatXml.summaryXml(filer, '2027-Q1', many, 'D', '2027-05-03')
  result = await valid(two)
  check(
    'a quarter as I to IV, a supplementary one, and thirteen rows on two pages',
    result.ok && two.includes('<stvrtrok>I</stvrtrok>') && two.includes('<mesiac></mesiac>') && two.includes('<dodatocny>1</dodatocny>') && (two.match(/<strana>/g) ?? []).length === 2,
    result.why,
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
  // Stock (17 October 2026): a company keeping its goods continuously buys them to 131, the stock's entries reach the books
  {
    const goods = doc('tovar', { category: 'goods', totalCents: 12300, vatCents: 2300, vatDeduct: true, issuedOn: '2026-09-10' })
    const a = ledger.buildBooks({ company: company({ stockMethod: 'A' }), docs: [goods], payments: [], banks: [], filed: [], manual: [], stock: [{ key: 's:in:2026-09', on: '2026-09-12', number: 'SKL 09/2026', text: 'Príjem na sklad za 09/2026', lines: [{ md: '132', d: '131', cents: 10000 }] }] })
    const b = ledger.buildBooks({ company: company({ stockMethod: 'B' }), docs: [goods], payments: [], banks: [], filed: [], manual: [] })
    check(
      'method A buys goods to their acquisition (131) and the receipt moves them to the stock (132); method B buys them to costs (504)',
      a.entries.find((e) => e.key === 'd:tovar')?.lines.some((l) => l.md === '131' && l.cents === 10000) &&
        ledger.balanceOf(a.entries, '131', '2026-09-30') === 0 && ledger.balanceOf(a.entries, '132', '2026-09-30') === 10000 && a.entries.find((e) => e.key === 's:in:2026-09')?.kind === 'stock' &&
        b.entries.find((e) => e.key === 'd:tovar')?.lines.some((l) => l.md === '504' && l.cents === 10000),
      JSON.stringify(a.entries.map((e) => [e.key, e.lines])),
    )
  }
  // Advances (18 October 2026): the tax document of an advance received owes it on 324; the final invoice deducting it
  // takes its base from 324 to the revenue, so the revenue is the whole supply and 324 is left with nothing.
  {
    const advance = doc('advance', {
      kind: 'invoice_out',
      number: '20260002',
      party: 'Zákazník s. r. o.',
      issuedOn: '2026-09-11',
      dueOn: '2026-09-10',
      totalCents: 12300,
      category: 'advance',
      paymentId: 'pa',
      vat: vatData('domestic', [{ rate: 23, base: 10000, vat: 2300, deduct: 0 }]),
    })
    const final = doc('final', {
      kind: 'invoice_out',
      number: '20260003',
      party: 'Zákazník s. r. o.',
      issuedOn: '2026-09-25',
      dueOn: '2026-10-09',
      totalCents: 12300,
      category: 'sales',
      advanceCents: 10000,
      vat: vatData('domestic', [{ rate: 23, base: 10000, vat: 2300, deduct: 0 }]),
    })
    const b = ledger.buildBooks({ company: company(), docs: [advance, final], payments: [pay('pa', '2026-09-10', 12300, { party: 'Zákazník s. r. o.' })], banks, filed: [], manual: [] })
    const on = (account) => ledger.balanceOf(b.entries, account, '2026-09-30')
    // A credit note issued here keeps its minus in the total and its lines (credit notes of 18 October 2026).
    const issuedCredit = doc('issued-credit', {
      kind: 'invoice_out',
      number: '20260004',
      party: 'Zákazník s. r. o.',
      issuedOn: '2026-09-26',
      totalCents: -2460,
      category: 'sales',
      vat: vatData('domestic', [{ rate: 23, base: -2000, vat: -460, deduct: 0 }], { corrects: '20260003' }),
    })
    const c = ledger.buildBooks({ company: company(), docs: [final, issuedCredit], payments: [], banks, filed: [], manual: [] })
    check(
      'a credit note issued here books the invoice back: the revenue and the VAT lowered, the customer owes less',
      ledger.balanceOf(c.entries, '602', '2026-09-30') === -18000 && ledger.balanceOf(c.entries, '343.200', '2026-09-30') === -1840 && ledger.balanceOf(c.entries, '311', '2026-09-30') === 9840,
      JSON.stringify(c.entries.find((e) => e.key === 'd:issued-credit')?.lines),
    )
    check(
      'an advance received is owed on 324 until the final invoice, which moves its base to the revenue: 324 nothing, the revenue the whole supply',
      on('324') === 0 && on('602') === -20000 && on('343.200') === -4600 && on('311') === 12300 && b.entries.find((e) => e.key === 'd:advance')?.lines.some((l) => l.d === '324' && l.cents === 10000),
      JSON.stringify([on('324'), on('602'), on('343.200'), on('311')]),
    )
    // Paid whole in advance (found by the review of 18 October 2026): the final invoice comes to nought, proposes no VAT
    // and still moves the advance's base from 324 to the revenue.
    const zero = doc('zero', { kind: 'invoice_out', number: '20260005', party: 'Zákazník s. r. o.', issuedOn: '2026-09-25', dueOn: '2026-10-09', totalCents: 0, vatCents: 0, category: 'sales', advanceCents: 10000, vat: null, linesHint: [{ rate: 23, base: 0, vat: 0, deduct: 0 }] })
    const z = ledger.buildBooks({ company: company(), docs: [advance, zero], payments: [pay('pa', '2026-09-10', 12300, { party: 'Zákazník s. r. o.' })], banks, filed: [], manual: [] })
    const proposed = vat.proposeVat({ id: 'zero', kind: 'invoice_out', number: '20260005', party: 'A', partyIco: null, partyVatId: 'SK2120000000', lines: [{ rate: 23, base: 0, vat: 0 }], issuedOn: '2026-09-25', receivedOn: '2026-09-25', totalCents: 0, vatCents: 0, currency: 'EUR', category: 'sales', vatDeduct: null, booked: true, vat: null }, { status: 'payer', quarterly: false, since: '2020-01-01' })
    check(
      'a final invoice its advances paid whole: no VAT proposed, booked, 324 nothing and the revenue the whole supply',
      proposed?.mode === 'none' &&
        !z.issues.noEntry.includes('zero') &&
        ledger.balanceOf(z.entries, '324', '2026-09-30') === 0 &&
        ledger.balanceOf(z.entries, '602', '2026-09-30') === -10000 &&
        ledger.balanceOf(z.entries, '311', '2026-09-30') === 0 &&
        invoices.stateOf({ status: 'issued', paidOn: null, dueOn: '2026-01-01', kind: 'invoice', totalCents: 0 }, '2026-10-18') === 'paid',
      JSON.stringify([proposed, z.issues.noEntry, z.entries.find((e) => e.key === 'd:zero')?.lines]),
    )
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Every client's deadlines on one screen (the team's /ucto/terminy)
// ---------------------------------------------------------------------------------------------------------------
{
  const plain = (text) => text.replace(/\u00a0/g, ' ')
  const co = (fields = {}) => ({
    id: 'c1',
    name: 'Firma s. r. o.',
    createdAt: Date.parse('2026-01-05T10:00:00Z') / 1000,
    icdph: 'SK2120000007',
    address: 'Hlavná 1, 040 01 Košice',
    taxOffice: 'Košice',
    vatStatus: 'payer',
    vatQuarterly: false,
    vatSince: null,
    startOn: '2026-09-01',
    endsOn: null,
    noticeSide: null,
    taxAccount: null,
    vatCarry: 0,
    ...fields,
  })
  const doc = (fields = {}) => ({
    id: 'd1',
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
  const euService = (fields = {}) =>
    doc({
      id: 'eu1',
      party: 'Kunde GmbH',
      partyIco: null,
      partyVatId: 'DE123456789',
      totalCents: 100000,
      vatCents: 0,
      vat: { mode: 'eu_service', lines: [{ rate: 0, base: 100000, vat: 0, deduct: 0 }], suppliedOn: null, vatId: 'DE123456789', corrects: null, period: null },
      ...fields,
    })
  const filedOf = (period, fields = {}) => ({
    period,
    filedAt: 0,
    filedOn: vat.filingDeadline(period),
    filedBy: null,
    filedByName: null,
    rows: { ...vat.emptyRows(), r03: 10000, r04: 2300, r17: 2300, r32: 2300, r35: 2300 },
    kvRows: 1,
    payCents: 2300,
    refundCents: 0,
    dueOn: vat.filingDeadline(period),
    kind: 'R',
    fast: false,
    carried: 0,
    kv: null,
    foundOn: null,
    prev: null,
    raw: '{}',
    ...fields,
  })
  /** A period filed as its documents stand: the rows and the control statement are the period's now. */
  const filedFrom = (company, period, docs, fields = {}) => {
    const r = vatStore.viewOf(company, period, docs, [], vat.filingDeadline(period)).result
    const kv = vat.kvFileOf(r.kv)
    return filedOf(period, { deliveryStatus: 'accepted', rows: r.rows, payCents: r.rows.r35, kv: r.statement ? { kind: 'R', full: kv, sent: kv } : null, ...fields })
  }
  /** The deadlines of a company on a day, from its documents and returns, as the store hands them over. */
  const run = (company, today, { docs = [], filed = [], paid = new Map(), filings = new Set(), svFiled = new Map(), closings = [], missing = new Map(), handover = 0 } = {}) => {
    const window = dues.vatWindow(company, today)
    const svPeriods = [...new Set(window.map((p) => vatSummary.summaryPeriodOf(p, { status: company.vatStatus })))]
    return dues.deadlinesOf(
      company,
      {
        views: window.map((p) => vatStore.viewOf(company, p, docs, filed, today)),
        summaries: svPeriods.map((p) => vatStore.svViewOf(company, p, docs, svFiled.get(p) ?? null, today)),
        filed,
        paid,
        filings,
        closings,
        missing,
        handover,
      },
      today,
    )
  }
  const find = (list, kind, period) => list.find((d) => d.kind === kind && (period === undefined || d.period === period))

  // The holidays a deadline moves past (Act No. 241/1993 Z. z. as amended by Act No. 261/2025 Z. z.)
  check(
    '17 November is a working day from 2025, 8 May and 15 September in 2026 alone, 1 September since 2024',
    vat.isWorkingDay('2026-11-17') &&
      vat.isWorkingDay('2025-11-17') &&
      !vat.isWorkingDay('2023-11-17') &&
      vat.isWorkingDay('2026-05-08') &&
      vat.isWorkingDay('2026-09-15') &&
      !vat.isWorkingDay('2027-09-15') &&
      !vat.isWorkingDay('2028-05-08') &&
      vat.isWorkingDay('2026-09-01') &&
      !vat.isWorkingDay('2026-12-24') &&
      !vat.isWorkingDay('2027-01-06'),
  )
  check('the next working day of a weekend and of Easter', vat.workingDayFrom('2026-10-25') === '2026-10-26' && vat.workingDayFrom('2029-03-31') === '2029-04-03' && vat.workingDayFrom('2026-10-14') === '2026-10-14')
  check('the closing is due on 31 March, or the next working day', closing.closingDeadline(2026) === '2027-03-31' && closing.closingDeadline(2028) === '2029-04-03' && closing.closingDeadline(2029) === '2030-04-01')
  check(
    'a notice moves it to the end of a month, three months on or six with income from abroad, a day off to the next working day',
    closing.extensionDays(2026).map((d) => `${d.day}${d.abroad ? '*' : ''}`).join() === '2027-04-30,2027-05-31,2027-06-30,2027-07-31*,2027-08-31*,2027-09-30*' &&
      closing.closingDue(2026, '2027-07-31') === '2027-08-02' &&
      closing.closingDue(2026, '2027-06-30') === '2027-06-30' &&
      closing.closingDue(2026, null) === '2027-03-31',
  )

  // Which VAT periods are worked out
  check('the periods that ended in the last four months, not before our first', dues.vatWindow(co({ startOn: '2026-01-01' }), '2026-10-14').join() === '2026-06,2026-07,2026-08,2026-09')
  check('none before the contract started, nor before the registration', dues.vatWindow(co({ startOn: '2026-09-01' }), '2026-10-14').join() === '2026-09' && dues.vatWindow(co({ startOn: null, vatSince: '2026-08-10' }), '2026-10-14').join() === '2026-08,2026-09')
  check('a quarterly payer: the last two quarters', dues.vatWindow(co({ startOn: '2026-01-01', vatQuarterly: true }), '2026-10-14').join() === '2026-Q2,2026-Q3')
  check(
    'nothing for a company not registered, nor for one whose contract starts later, nor after its last month',
    dues.vatWindow(co({ vatStatus: 'none' }), '2026-10-14').length === 0 &&
      dues.vatWindow(co({ startOn: '2027-01-01' }), '2026-10-14').length === 0 &&
      dues.vatWindow(co({ startOn: '2026-01-01', endsOn: '2026-07-31' }), '2026-10-14').join() === '2026-06,2026-07',
  )

  // The VAT return of a period, as the VAT page has it
  let list = run(co(), '2026-10-14', { docs: [doc()] })
  let item = find(list, 'vat', '2026-09')
  check('a period ready to be filed, by the 26th (the 25th is a Sunday)', item?.state === 'ready' && item.day === '2026-10-26' && !item.late, JSON.stringify(item))
  check('the period that runs is ahead of it, its return by the 25th of the next month', find(list, 'vat', '2026-10')?.state === 'running' && find(list, 'vat', '2026-10')?.day === '2026-11-25')
  item = find(run(co({ taxOffice: null }), '2026-10-14', { docs: [doc(), doc({ id: 'd2', bookedAt: null })] }), 'vat', '2026-09')
  check('blocked, with how many things keep it back', item?.state === 'blocked' && item.count === 2, JSON.stringify(item))
  item = find(run(co(), '2026-10-27', { docs: [doc()] }), 'vat', '2026-09')
  check('past its deadline and not filed it is late', item?.state === 'ready' && item.late)
  list = run(co(), '2026-10-27', { docs: [doc()], filed: [filedFrom(co(), '2026-09', [doc()])] })
  check('filed, it is done, and its tax is the client\'s to pay', find(list, 'vat', '2026-09')?.state === 'done' && find(list, 'vatPay', '2026-09')?.state === 'open' && find(list, 'vatPay', '2026-09')?.cents === 2300 && find(list, 'vatPay', '2026-09')?.late)
  list = run(co(), '2026-10-27', { docs: [doc()], filed: [filedFrom(co(), '2026-09', [doc()])], paid: new Map([['2026-09', { cents: 2300, last: '2026-10-20' }]]) })
  check('paid, the tax is done too', find(list, 'vatPay', '2026-09')?.state === 'done')
  {
    const as = (deliveryStatus) => find(run(co(), '2026-10-27', { docs: [doc()], filed: [{ ...filedFrom(co(), '2026-09', [doc()]), deliveryStatus }] }), 'vat', '2026-09')
    check(
      'sent and waiting for its receipt is never late; only saved and not sent is',
      as('submitted')?.state === 'open' && as('submitted')?.late === false && as('prepared')?.late === true && as('accepted')?.late === false,
      JSON.stringify([as('submitted'), as('prepared')]),
    )
  }
  check(
    '§ 7a: 5 € or less is not paid, and nothing is filed for a month without tax',
    !find(run(co({ vatStatus: 'reg7a' }), '2026-10-14', { filed: [filedOf('2026-09', { payCents: 450 })] }), 'vatPay') && !find(run(co({ vatStatus: 'reg7a' }), '2026-10-14'), 'vat'),
  )
  check(
    '§ 7a: a month with a document not booked is not "nothing to file" until it is booked',
    vatStore.viewOf(co({ vatStatus: 'reg7a' }), '2026-09', [doc({ kind: 'invoice_in', bookedAt: null, vat: null })], [], '2026-10-14').state === 'blocked' &&
      vatStore.viewOf(co({ vatStatus: 'reg7a' }), '2026-09', [doc({ kind: 'invoice_in', vat: { mode: 'none', lines: [], suppliedOn: null, vatId: null, corrects: null, period: null } })], [], '2026-10-14').state === 'none',
  )
  // Changed after filing: corrective before the deadline, supplementary after it
  const twice = [doc(), doc({ id: 'd2', number: '20260002', issuedOn: '2026-09-28' })]
  for (const deliveryStatus of ['prepared', 'rejected', 'review']) {
    const filed = { ...filedFrom(co(), '2026-09', [doc()]), deliveryStatus }
    const changed = vatStore.viewOf(co(), '2026-09', twice, [filed], '2026-11-03')
    const pending = run(co(), '2026-11-03', { docs: twice, filed: [filed] })
    check(`changed ${deliveryStatus} documents require review or reopening before statutory corrections`, vatStore.planFiling(co(), changed, [filed], '2026-11-03') === null && !find(pending, 'vatFix', '2026-09') && find(pending, 'vat', '2026-09')?.state === 'blocked')
  }
  item = find(run(co(), '2026-10-21', { docs: twice, filed: [filedFrom(co(), '2026-09', [doc()])] }), 'vatFix', '2026-09')
  check('changed before the deadline: a corrective return by it', item?.fix === 'O' && item.day === '2026-10-26' && item.state === 'ready', JSON.stringify(item))
  item = find(run(co(), '2026-11-03', { docs: twice, filed: [filedFrom(co(), '2026-09', [doc()])] }), 'vatFix', '2026-09')
  check('after it: a supplementary return by the end of the month after today', item?.fix === 'D' && item.day === '2026-12-31' && !item.late, JSON.stringify(item))
  // A payer's older periods never filed
  list = run(co({ startOn: '2026-03-01' }), '2026-10-14', { docs: [doc()], filed: [filedOf('2026-03'), filedOf('2026-05')] })
  check(
    'periods of ours older than the ones worked out and never filed are overdue',
    list.filter((d) => d.kind === 'vat' && d.state === 'open').map((d) => d.period).join() === '2026-04' && find(list, 'vat', '2026-04')?.late,
    list.map((d) => `${d.kind}:${d.period}:${d.state}`).join(' '),
  )

  // The recapitulative statement
  list = run(co(), '2026-10-14', { docs: [doc(), euService()] })
  item = find(list, 'summary')
  check('a service to another member state: the recapitulative statement of the period, ready by its deadline', item?.period === '2026-09' && item.day === '2026-10-26' && item.state === 'ready', JSON.stringify(item))
  const svFiledOf = (rows, fields = {}) => ({ deliveryStatus: 'accepted', kind: 'R', filedOn: '2026-10-20', filedAt: 1, filedBy: null, rows, sent: rows ?? [], prev: null, ...fields })
  const deRow = { country: 'DE', number: '123456789', euros: 1000, code: '2' }
  check('filed as the books stand, it is done', find(run(co(), '2026-10-21', { docs: [doc(), euService()], svFiled: new Map([['2026-09', svFiledOf([deRow])]]) }), 'summary')?.state === 'done')
  item = find(run(co(), '2026-10-21', { docs: [doc(), euService()], svFiled: new Map([['2026-09', svFiledOf([{ ...deRow, euros: 900 }])]]) }), 'summary')
  check('changed after it was filed: a corrective statement by the deadline', item?.fix === 'O' && item.state === 'ready' && item.day === '2026-10-26', JSON.stringify(item))
  item = find(run(co(), '2026-11-03', { docs: [doc(), euService()], svFiled: new Map([['2026-09', svFiledOf([{ ...deRow, euros: 900 }])]]) }), 'summary')
  check('after it a supplementary one: no deadline in § 80(8), so today, never late', item?.fix === 'D' && item.day === '2026-11-03' && !item.late, JSON.stringify(item))
  item = find(run(co(), '2026-10-14', { docs: [doc(), euService({ partyVatId: null, vat: { ...euService().vat, vatId: 'SK2020000000' } })] }), 'summary')
  check('a customer without a VAT number of another member state keeps it back', item?.state === 'blocked' && item.count === 1, JSON.stringify(item))
  check('so does the company without its own VAT number, but not without a tax office (the statement names none)', find(run(co({ icdph: null }), '2026-10-14', { docs: [doc(), euService()] }), 'summary')?.state === 'blocked' && find(run(co({ taxOffice: null }), '2026-10-14', { docs: [doc(), euService()] }), 'summary')?.state === 'ready')
  item = find(run(co({ vatStatus: 'reg7a', startOn: '2026-01-01' }), '2026-10-14', { docs: [euService({ issuedOn: '2026-08-10', createdAt: Date.parse('2026-08-11T10:00:00Z') / 1000 })] }), 'summary')
  check('§ 7a: for the calendar quarter', item?.period === '2026-Q3' && item.day === '2026-10-26' && item.state === 'ready', JSON.stringify(item))
  item = find(run(co({ vatStatus: 'reg7a', startOn: '2026-01-01' }), '2026-12-15', { docs: [euService({ issuedOn: '2026-10-10', createdAt: Date.parse('2026-10-11T10:00:00Z') / 1000 })] }), 'summary')
  check('while its quarter runs, it runs', item?.period === '2026-Q4' && item.state === 'running' && item.day === '2027-01-25', JSON.stringify(item))

  // The client's documents
  list = run(co({ vatStatus: 'none' }), '2026-10-14', { missing: new Map([['2026-09', 3], ['2026-10', 2]]) })
  check('documents of a month by the 10th of the next, late past it', find(list, 'docs', '2026-09')?.day === '2026-10-10' && find(list, 'docs', '2026-09')?.late && find(list, 'docs', '2026-09')?.count === 3)
  check('the month that runs is not late', find(list, 'docs', '2026-10')?.state === 'running' && !find(list, 'docs', '2026-10')?.late)
  check('nothing is asked once the contract stopped taking documents', !find(run(co({ vatStatus: 'none', endsOn: '2026-08-31' }), '2026-10-14', { missing: new Map([['2026-08', 3]]) }), 'docs'))

  // The closing
  check(
    'the closing of last year by 31 March: ours when we kept the books at its end',
    find(run(co({ vatStatus: 'none', startOn: '2026-06-01' }), '2027-01-05'), 'closing', '2026')?.day === '2027-03-31' &&
      !find(run(co({ vatStatus: 'none', startOn: '2027-01-01' }), '2027-01-05'), 'closing') &&
      !find(run(co({ vatStatus: 'none', startOn: '2026-06-01', endsOn: '2026-12-31' }), '2027-01-05'), 'closing') &&
      Boolean(find(run(co({ vatStatus: 'none', startOn: '2026-06-01', endsOn: '2027-01-31' }), '2027-01-05'), 'closing')),
  )
  check('a company made by the team counts from the day it was made', Boolean(find(run(co({ vatStatus: 'none', startOn: null }), '2027-02-01'), 'closing', '2026')))
  const kFact = (fields = {}) => ({ deliveryStatus: 'accepted', year: 2026, filed: false, extendedTo: null, payCents: 0, dueOn: null, paid: 0, ...fields })
  check(
    'late past its day, done once its page marks it filed',
    find(run(co({ vatStatus: 'none' }), '2027-04-02'), 'closing')?.late && find(run(co({ vatStatus: 'none' }), '2027-04-02', { closings: [kFact({ filed: true })] }), 'closing')?.state === 'done',
  )
  check(
    'a notice moves its day, and it is not late before it',
    find(run(co({ vatStatus: 'none' }), '2027-04-02', { closings: [kFact({ extendedTo: '2027-06-30' })] }), 'closing')?.day === '2027-06-30' &&
      find(run(co({ vatStatus: 'none' }), '2027-04-02', { closings: [kFact({ extendedTo: '2027-06-30' })] }), 'closing')?.late === false,
  )
  item = find(run(co({ vatStatus: 'none' }), '2027-03-20', { closings: [kFact({ filed: true, payCents: 120000, dueOn: '2027-03-31', paid: 20000 })] }), 'taxPay', '2026')
  check('a filed closing asks the client for its income tax by the deadline, less what was paid', item?.state === 'open' && item.cents === 100000 && item.day === '2027-03-31' && !item.late, JSON.stringify(item))
  check(
    'paid, it is done; nothing to pay asks for nothing',
    find(run(co({ vatStatus: 'none' }), '2027-03-20', { closings: [kFact({ filed: true, payCents: 120000, dueOn: '2027-03-31', paid: 120000 })] }), 'taxPay')?.state === 'done' &&
      !find(run(co({ vatStatus: 'none' }), '2027-03-20', { closings: [kFact({ filed: true, payCents: 0, dueOn: '2027-03-31' })] }), 'taxPay'),
  )
  check(
    'what is done is never late, whatever its day',
    find(run(co({ vatStatus: 'none' }), '2027-04-02', { closings: [kFact({ filed: true })] }), 'closing')?.late === false &&
      find(run(co(), '2026-10-27', { docs: [doc()], filed: [filedFrom(co(), '2026-09', [doc()])] }), 'vat', '2026-09')?.late === false,
  )

  // The handover at the end
  check(
    'the books handed over within thirty days of the end',
    find(run(co({ vatStatus: 'none', endsOn: '2026-09-30' }), '2026-10-14'), 'handover')?.day === '2026-10-30' &&
      find(run(co({ vatStatus: 'none', endsOn: '2026-10-20' }), '2026-10-14'), 'handover')?.state === 'running' &&
      find(run(co({ vatStatus: 'none', endsOn: '2026-09-30' }), '2026-10-14', { handover: 2 }), 'handover')?.state === 'done',
  )

  // What is shown, and in which group
  check(
    'what still runs is shown once it is 45 days near, what can be done now always',
    !find(run(co({ vatStatus: 'none', endsOn: '2027-01-31' }), '2026-10-14'), 'handover') && find(run(co({ vatStatus: 'none', startOn: '2026-01-01' }), '2027-01-02'), 'closing')?.day === '2027-03-31',
  )
  check(
    'what was done stays 45 days',
    Boolean(find(run(co(), '2026-11-14', { docs: [doc()], filed: [filedFrom(co(), '2026-09', [doc()])], paid: new Map([['2026-09', { cents: 2300, last: '2026-10-20' }]]) }), 'vatPay', '2026-09')) &&
      !find(run(co(), '2026-12-14', { docs: [doc()], filed: [filedFrom(co(), '2026-09', [doc()])], paid: new Map([['2026-09', { cents: 2300, last: '2026-10-20' }]]) }), 'vatPay', '2026-09'),
  )
  check(
    'the groups',
    dues.groupOf({ state: 'open', late: true, day: '2026-10-10' }, '2026-10-14') === 'late' &&
      dues.groupOf({ state: 'ready', late: false, day: '2026-10-21' }, '2026-10-14') === 'week' &&
      dues.groupOf({ state: 'ready', late: false, day: '2026-11-10' }, '2026-10-14') === 'month' &&
      dues.groupOf({ state: 'running', late: false, day: '2026-11-25' }, '2026-10-14') === 'later' &&
      dues.groupOf({ state: 'done', late: false, day: '2026-10-10' }, '2026-10-14') === 'done',
  )
  const figs = dues.dueFigures(run(co(), '2026-10-21', { docs: [doc()], missing: new Map([['2026-09', 1]]) }), '2026-10-21')
  check('the figures: late, within a week, ready, the client\'s', figs.late === 1 && figs.week === 1 && figs.ready === 1 && figs.client === 1, JSON.stringify(figs))

  // In words, and where each is done
  const row = (fields) => ({ companyId: 'c1', period: '2026-09', day: '2026-10-26', state: 'open', late: false, count: 0, cents: 0, fix: null, company: { id: 'c1', vatStatus: 'payer' }, ...fields })
  check(
    'what it is, in words',
    plain(dueViews.dueWhat(row({ kind: 'vat' }))) === 'DPH a kontrolný výkaz za september 2026' &&
      plain(dueViews.dueWhat(row({ kind: 'vat', company: { id: 'c1', vatStatus: 'reg7a' } }))) === 'Priznanie k DPH za september 2026' &&
      plain(dueViews.dueWhat(row({ kind: 'vatFix', fix: 'D' }))) === 'Dodatočné priznanie k DPH za september 2026' &&
      plain(dueViews.dueWhat(row({ kind: 'summary', period: '2026-Q3' }))) === 'Súhrnný výkaz za 3. štvrťrok 2026' &&
      plain(dueViews.dueWhat(row({ kind: 'closing', period: '2026' }))) === 'Účtovná závierka a daňové priznanie za rok 2026' &&
      plain(dueViews.dueWhat(row({ kind: 'taxPay', period: '2026' }))) === 'Úhrada dane z príjmov za rok 2026',
  )
  check(
    'where it stands, in words',
    plain(dueViews.dueState(row({ kind: 'docs', count: 3 }))) === 'Chýbajú 3 doklady' &&
      plain(dueViews.dueState(row({ kind: 'vatPay', cents: 123456 }))) === 'Na úhradu 1 234,56 €' &&
      plain(dueViews.dueState(row({ kind: 'vat', state: 'blocked', count: 2 }))) === 'Treba vyriešiť: 2' &&
      plain(dueViews.dueState(row({ kind: 'summary', state: 'done' }))) === 'Podaný' &&
      plain(dueViews.dueState(row({ kind: 'taxPay', cents: 100000 }))) === 'Na úhradu 1 000,00 €' &&
      plain(dueViews.dueState(row({ kind: 'taxPay', state: 'done' }))) === 'Zaplatené',
  )
  check(
    "where it is done: the period on the VAT page, a quarter of § 7a by its first month, a quarterly payer's quarter as it is",
    dueViews.dueHref(row({ kind: 'vat' })) === '/ucto/klienti/c1/dph?obdobie=2026-09' &&
      dueViews.dueHref(row({ kind: 'summary', period: '2026-Q3', company: { id: 'c1', vatStatus: 'reg7a' } })) === '/ucto/klienti/c1/dph?obdobie=2026-07#suhrnny' &&
      dueViews.dueHref(row({ kind: 'summary', period: '2026-Q3', company: { id: 'c1', vatStatus: 'payer' } })) === '/ucto/klienti/c1/dph?obdobie=2026-Q3#suhrnny' &&
      dueViews.dueHref(row({ kind: 'docs' })) === '/ucto/klienti/c1#chyba' &&
      dueViews.dueHref(row({ kind: 'closing', period: '2026' })) === '/ucto/klienti/c1/zavierka?rok=2026' &&
      dueViews.dueHref(row({ kind: 'taxPay', period: '2026' })) === '/ucto/klienti/c1/zavierka?rok=2026',
  )
  check('the filters in the address', dueViews.deadlinesHref({ side: 'ours', done: true, accountant: '' }) === '/ucto/terminy?kto=my&hotove=1' && dueViews.deadlinesHref({ side: 'all', done: false, accountant: '' }) === '/ucto/terminy')

  {
    const list = run(co(), '2026-10-21', { docs: [doc()], missing: new Map([['2026-09', 1]]) })
    const press = dues.pressing(list, '2026-10-21')
    check(
      "what presses on the team's home: ours late or within a week, never the client's part nor what still runs",
      press.length === 1 && press[0].kind === 'vat' && press[0].period === '2026-09' && !press.some((d) => d.kind === 'docs') && dues.pressing(list, '2026-10-10').length === 0,
      JSON.stringify(press.map((d) => `${d.kind}:${d.period}:${d.state}`)),
    )
  }
  {
    const row = { company: co(), missing: 0, toBook: 0, reading: 0, toCheck: 0, waiting: null, poa: 'checked', declaration: 'checked', openReports: 0, handover: 0 }
    check(
      'a client is done only with nothing waiting, the handover not owed and nothing of ours pressing',
      teamStore.clientDone(row, false, 0) && !teamStore.clientDone(row, false, 1) && !teamStore.clientDone(row, true, 0) && !teamStore.clientDone({ ...row, toBook: 1 }, false, 0) && !teamStore.clientDone({ ...row, poa: 'waiting' }, false, 0),
    )
  }
  // The client's own list (app/deadlines.ts) is read from the same dues, so the client and the team never disagree.
  const mine = (company, today, facts = {}, missing = new Map(), bills = []) => deadlines.clientDeadlines(company, run(company, today, { ...facts, missing }), today, missing, bills)
  let mineList = mine(co(), '2026-10-13', { docs: [doc()] }, new Map([['2026-10', 3]]))
  check(
    "the client's list: the period that ended, the month's documents, the period that runs, the year's closing",
    mineList.map((d) => d.day).join() === '2026-10-26,2026-11-10,2026-11-25,2027-03-31' && mineList[1].tone === 'amber' && mineList[0].tone === 'blue' && plain(mineList[0].label) === 'DPH a kontrolný výkaz za september 2026',
    mineList.map((d) => `${d.day} ${plain(d.label)} ${d.state}`).join(' | '),
  )
  check('before the contract starts, nothing of the months before is the client\'s or ours', mine(co({ startOn: '2027-01-01' }), '2026-11-05').length === 0, JSON.stringify(mine(co({ startOn: '2027-01-01' }), '2026-11-05')))
  mineList = mine(co({ startOn: '2027-01-01' }), '2027-01-15')
  check(
    'its first month: its documents, its VAT ahead, and the closing of its first year, not of the year before',
    mineList.map((d) => d.day).join() === '2027-02-10,2027-02-25,2028-03-31' && !mineList.some((d) => d.label.includes('2026')),
    mineList.map((d) => `${d.day} ${plain(d.label)}`).join(' | '),
  )
  mineList = mine(co({ vatStatus: 'none' }), '2026-11-05', {}, new Map([['2026-10', 2], ['2026-08', 1]]))
  check(
    'a month whose documents are late stays on the list, and before the 10th the month before is still due',
    mineList.some((d) => d.day === '2026-09-10' && d.tone === 'amber') && mineList.some((d) => d.day === '2026-11-10' && plain(d.state) === 'Chýbajú 2 doklady') && mineList.some((d) => d.day === '2026-12-10'),
    mineList.map((d) => `${d.day} ${plain(d.state)}`).join(' | '),
  )
  const filedSep = filedFrom(co(), '2026-09', [doc()])
  let taxRow = mine(co(), '2026-10-21', { docs: [doc()], filed: [filedSep] }).find((d) => d.href === '/app/dane' && d.tone === 'amber')
  check('a filed return asks to be paid, and leads to where', taxRow?.day === '2026-10-26' && plain(taxRow.state) === 'Zaplaťte 23,00 €' && plain(taxRow.label) === 'Zaplatiť DPH za september 2026', JSON.stringify(taxRow))
  mineList = mine(co(), '2026-10-21', { docs: [doc()], filed: [filedSep], paid: new Map([['2026-09', { cents: 2300, last: '2026-10-22' }]]) })
  check('a paid one says so until its day', mineList.some((d) => d.label.includes('Zaplatiť') && d.tone === 'ok') && !mine(co(), '2026-10-27', { docs: [doc()], filed: [filedSep], paid: new Map([['2026-09', { cents: 2300, last: '2026-10-22' }]]) }).some((d) => d.label.includes('Zaplatiť')))
  check('an unpaid one stays past its day', mine(co(), '2026-11-03', { docs: [doc()], filed: [filedSep] }).some((d) => d.day === '2026-10-26' && d.tone === 'amber'))
  const sent = mine(co(), '2026-10-21', { docs: [doc()], filed: [{ ...filedSep, deliveryStatus: 'submitted' }] }).find((d) => d.label.includes('kontrolný výkaz za september'))
  check('our filing says where it stands and leads to the taxes', sent?.tone === 'blue' && sent.href === '/app/dane' && plain(sent.state) !== 'Podáme za Vás', JSON.stringify(sent))
  check(
    '§ 7a: no return of its own to wait for, and 4,50 € is not paid',
    !mine(co({ vatStatus: 'reg7a' }), '2026-10-14', { filed: [filedOf('2026-09', { payCents: 450 })] }).some((d) => d.label.includes('Zaplatiť') || d.label.includes('kontrolný')),
  )
  taxRow = mine(co({ vatStatus: 'none', startOn: '2025-01-01' }), '2027-03-20', { closings: [kFact({ filed: true, payCents: 120000, dueOn: '2027-03-31', paid: 20000 })] }).find((d) => plain(d.label).includes('daň z príjmov'))
  check('the income tax a closing asks for is the client\'s to pay', taxRow?.tone === 'amber' && plain(taxRow.state) === 'Zaplaťte 1 000,00 €' && taxRow.href === '/app/dane', JSON.stringify(taxRow))
  check('a bill of ours waits among them', mine(co(), '2026-10-13', { docs: [doc()] }, new Map(), [{ number: '20260003', totalCents: 8900, dueOn: '2026-10-20' }]).some((d) => d.day === '2026-10-20' && d.href === '/app/firma#faktury-firmony'))
}

// ---------------------------------------------------------------------------------------------------------------
// The closing of a micro company: the financial statements and the corporate income tax return
// ---------------------------------------------------------------------------------------------------------------
{
  const xsd = (name) => readFileSync(new URL(`./xsd/${name}`, import.meta.url), 'utf8')
  const valid = async (xml, schema, name) => {
    const result = await validateXML({ xml: [{ fileName: `${name}.xml`, contents: xml }], schema: [{ fileName: `${name}.xsd`, contents: schema }] })
    return { ok: result.valid, why: result.errors.map((e) => e.message).join(' | ') }
  }
  let n = 0
  const entry = (on, ...lines) => ({ key: `e${n++}`, on, kind: 'internal', number: '', text: '', docId: null, paymentId: null, manualId: null, lines: lines.map(([md, d, cents]) => ({ md, d, cents })) })
  // A year of a young company: capital subscribed and paid in, a sale, services, representation, a gift, the bank.
  const year = [
    { ...entry('2026-01-01', ['353', '701', 500000], ['701', '411', 500000]), kind: 'opening' },
    entry('2026-02-01', ['221.001', '353', 500000]),
    entry('2026-03-10', ['311', '602', 1230000]),
    entry('2026-03-20', ['221.001', '311', 1230000]),
    entry('2026-04-05', ['518', '321', 100000]),
    entry('2026-04-20', ['321', '221.001', 100000]),
    entry('2026-05-01', ['513', '221.001', 12050]),
    entry('2026-06-01', ['543', '221.001', 5000]),
    entry('2026-07-01', ['568', '221.001', 1234]),
    entry('2026-08-01', ['221.001', '662', 123]),
    entry('2026-12-31', ['518', '321', 50000]),
  ]
  const st = closing.statementsOf({ entries: year }, 2026)
  check(
    'the profit and loss account: sales, services with representation, other costs, interest and the bank, the result before tax',
    st.profit.r03 === 1230000 && st.profit.r11 === 162050 && st.profit.r17 === 5000 && st.profit.r24 === 123 && st.profit.r33 === 1234 && st.profit.r35 === 1061839 && st.profit.r38 === 1061839,
    JSON.stringify(st.profit),
  )
  check(
    'the balance sheet: the bank, the capital paid in, a supplier unpaid, and the result that makes it balance',
    st.balance.r22 === 1611839 && st.balance.r27 === 500000 && st.balance.r28 === 0 && st.balance.r39 === 50000 && st.balance.r33 === 1061839 && st.balance.r01 === st.balance.r24,
    JSON.stringify({ r22: st.balance.r22, r27: st.balance.r27, r39: st.balance.r39, r33: st.balance.r33 }),
  )
  check(
    'in whole euros, the result the same on both statements',
    st.balanceEur.r22 === 16118 && st.profitEur.r11 === 1621 && st.profitEur.r38 === 10618 && st.balanceEur.r33 === 10618 && st.rounding === 0 && st.unplaced.length === 0,
    JSON.stringify({ r22: st.balanceEur.r22, r38: st.profitEur.r38, r33: st.balanceEur.r33 }),
  )
  check('the accounts the return reads', st.accounts['513'] === 12050 && st.accounts['543'] === 5000 && st.accounts['662'] === 123 && st.accounts['602'] === 1230000)
  const odd = closing.statementsOf({ entries: [entry('2027-01-10', ['221.001', '602', 10000]), entry('2027-01-11', ['518', '221.001', 50]), entry('2027-01-12', ['501', '221.001', 50])] }, 2027)
  check(
    'rounding that would part the results is put in row 22, and said',
    odd.profitEur.r38 === 98 && odd.balanceEur.r33 === 98 && odd.balanceEur.r22 === 98 && odd.rounding === -1 && odd.balanceEur.r01 === odd.balanceEur.r24,
    JSON.stringify({ r38: odd.profitEur.r38, r33: odd.balanceEur.r33, r22: odd.balanceEur.r22, rounding: odd.rounding }),
  )
  const lastYear = closing.statementsOf({ entries: [...year, entry('2027-02-01', ['221.001', '602', 10000])] }, 2027)
  check('the next year opens with last year\'s result on 431, which stands with the results of the years before', lastYear.balance.r32 === 1061839 && lastYear.balance.r33 === 10000 && lastYear.profit.r03 === 10000)
  check(
    'an overdraft is a loan, a customer who paid ahead a liability, the VAT the tax office owes a receivable',
    (() => {
      const s = closing.statementsOf(
        { entries: [entry('2026-03-01', ['221.001', '411', 100000]), entry('2026-03-01', ['518', '221.002', 30000]), entry('2026-03-02', ['221.001', '311', 1000]), entry('2026-03-03', ['343.100', '221.001', 2300])] },
        2026,
      )
      return s.balance.r44 === 30000 && s.balance.r39 === 1000 && s.balance.r19 === 2300 && s.balance.r22 === 98700
    })(),
  )
  check('an account the form has no row for is said', closing.statementsOf({ entries: [entry('2026-03-01', ['221.001', '414', 1000])] }, 2026).unplaced.join() === '414')

  // The tax
  const input = (fields = {}) => ({
    year: 2026,
    result: 0,
    revenues: 0,
    costs: 0,
    tableA: {},
    tableB: {},
    typed: {},
    taxable: 0,
    losses: [],
    lossDeduct: null,
    micro: false,
    minimumExempt: false,
    minimumHalf: false,
    months: 12,
    minimumCredits: [],
    advances: 0,
    withheld: 0,
    ...fields,
  })
  const E = (euros) => Math.round(euros * 100)
  check('the rate by the taxable revenues: 10 % up to 100 000 €, 21 %, 24 % above 5 000 000 €; 15 % up to 60 000 € in 2024', closing.taxRate(2026, E(92000)) === 10 && closing.taxRate(2026, E(100000)) === 10 && closing.taxRate(2026, E(520000)) === 21 && closing.taxRate(2026, E(5000001)) === 24 && closing.taxRate(2024, E(60000)) === 15 && closing.taxRate(2024, E(60001)) === 21)
  check(
    'the minimum tax by the taxable revenues, with the band above 5 000 000 € from 2026',
    closing.minimumTax(2026, E(50000)) === E(340) && closing.minimumTax(2026, E(62000)) === E(960) && closing.minimumTax(2026, E(250001)) === E(1920) && closing.minimumTax(2026, E(500001)) === E(3840) && closing.minimumTax(2026, E(6000000)) === E(11520) && closing.minimumTax(2025, E(6000000)) === E(3840),
  )
  let t = closing.taxOf(input({ result: -E(1200), taxable: E(62000) }))
  check('a loss with 62 000 € of taxable revenues pays the minimum tax of 960 € (the Financial Directorate\'s example)', t.rows.r810 === E(960) && t.rows.r820 === E(960) && t.rows.r900 === E(960) && t.rows.r1050 === E(960) && t.rows.r1100 === E(960) && t.minimumPaid, JSON.stringify(t.rows))
  t = closing.taxOf(input({ result: E(3000), taxable: E(50000) }))
  check('a tax of 300 € under the minimum of 340 €: 340 € is paid, 40 € may be credited later', t.rows.r600 === E(300) && t.rows.r1050 === E(340) && t.rows.r830 === E(40), JSON.stringify(t.rows))
  t = closing.taxOf(input({ result: E(30000), taxable: E(92000), tableA: { a06: E(500) }, typed: { r210: E(2000) } }))
  check(
    'representation added, interest taxed by withholding taken out, 10 %: row 400 28 500 €, tax 2 850 €',
    t.rows.r130 === E(500) && t.rows.r200 === E(500) && t.rows.r300 === E(2000) && t.rows.r400 === E(28500) && t.rows.r550 === 10 && t.rows.r600 === E(2850) && t.rows.r1050 === E(2850) && t.tableA.r06 === E(500) && t.tableA.r17 === E(500),
    JSON.stringify(t.rows),
  )
  t = closing.taxOf(input({ result: E(30000), taxable: E(92000), advances: E(2000) }))
  check('the advances paid lower what is to pay', t.rows.r1040 === E(2000) && t.rows.r1100 === E(1000) && t.rows.r1101 === 0)
  t = closing.taxOf(input({ result: E(30000), taxable: E(92000), advances: E(4000) }))
  check('more advances than tax: an overpayment', t.rows.r1100 === 0 && t.rows.r1101 === -E(1000))
  t = closing.taxOf(input({ result: E(3449.9), taxable: E(40000), advances: E(340) }))
  check('a tax to pay of 5 € or less is not paid', t.rows.r1050 === E(344.99) && t.rows.r1100 === 0 && t.rows.r1101 === 0, JSON.stringify(t.rows))
  t = closing.taxOf(input({ result: E(12000), taxable: E(55000), micro: true, losses: [{ year: 2023, amount: E(5000), usedBefore: 0 }, { year: 2024, amount: E(16000), usedBefore: 0 }] }))
  check(
    'a micro-taxpayer deducts losses up to the whole base, the oldest first (KROS\'s example): 5 000 and 7 000, 9 000 left',
    t.rows.r410 === E(12000) && t.losses[0].now === E(5000) && t.losses[1].now === E(7000) && t.losses[1].left === E(9000) && t.rows.r500 === 0,
    JSON.stringify(t.losses),
  )
  t = closing.taxOf(input({ result: E(80000), taxable: E(400000), losses: [{ year: 2022, amount: E(100000), usedBefore: E(10000) }] }))
  check('any other taxpayer up to half of the base: 40 000 of the 90 000 left', t.rows.r410 === E(40000) && t.losses[0].left === E(50000) && t.rows.r500 === E(40000) && t.rows.r600 === E(8400))
  t = closing.taxOf(input({ year: 2025, result: E(3000), taxable: E(40000), micro: true, losses: [{ year: 2020, amount: E(1000), usedBefore: 0 }, { year: 2021, amount: E(4000), usedBefore: 0 }] }))
  check('a loss of 2020 only up to half even for a micro-taxpayer, a loss of 2021 up to the rest (the Directorate\'s example)', t.losses[0].now === E(1000) && t.losses[1].now === E(2000) && t.rows.r410 === E(3000))
  t = closing.taxOf(input({ result: E(3000), taxable: E(40000), losses: [{ year: 2020, amount: E(1000), usedBefore: 0 }] }))
  check('a loss older than five periods is not deducted', t.rows.r410 === 0 && t.losses.length === 0)
  t = closing.taxOf(input({ result: E(12000), taxable: E(55000), micro: true, losses: [{ year: 2024, amount: E(16000), usedBefore: 0 }], lossDeduct: E(9000) }))
  check('the accountant may deduct less of a loss', t.rows.r410 === E(9000) && t.losses[0].left === E(7000))
  t = closing.taxOf(input({ result: -E(500), taxable: E(10000), minimumExempt: true }))
  check('a company in its first period pays no minimum tax', t.rows.r810 === 0 && t.rows.r1050 === 0 && t.rows.r1100 === 0 && !t.minimumPaid)
  check(
    'a shorter period pays its share of the minimum tax, a company employing the disabled half (§ 46b(3), (6))',
    closing.taxOf(input({ taxable: E(10000), months: 3 })).rows.r810 === E(85) && closing.taxOf(input({ taxable: E(62000), months: 7 })).rows.r810 === E(560) && closing.taxOf(input({ taxable: E(62000), minimumHalf: true })).rows.r810 === E(480),
  )
  t = closing.taxOf(input({ result: E(8000), taxable: E(40000), minimumCredits: [{ year: 2024, amount: E(340), usedBefore: 0 }, { year: 2025, amount: E(200), usedBefore: 0 }] }))
  check(
    'the minimum tax paid over earlier tax is credited on the tax above the minimum, the oldest first',
    t.rows.r800 === E(800) && t.rows.r910 === E(460) && t.rows.r920 === E(460) && t.rows.r1000 === E(340) && t.rows.r1050 === E(340) && t.minimumCredits[0].now === E(340) && t.minimumCredits[1].now === E(120) && t.minimumCredits[1].left === E(80),
    JSON.stringify(t.rows),
  )
  check(
    'the advances the next period brings: monthly above 16 600 €, quarterly above 5 000 € (the Directorate\'s figures)',
    (() => {
      const monthly = closing.taxOf(input({ result: E(178500), taxable: E(500000) }))
      const quarterly = closing.taxOf(input({ result: E(75835.33), taxable: E(500000) }))
      const none = closing.taxOf(input({ result: E(26791.8), taxable: E(90000) }))
      return monthly.rows.r1110 === E(37485) && monthly.advancesNext.kind === 'monthly' && monthly.advancesNext.each === E(3123.75) && quarterly.rows.r1110 === E(15925.42) && quarterly.advancesNext.each === E(3981.36) && none.rows.r1110 === E(2679.18) && none.advancesNext.kind === 'none'
    })(),
  )
  t = closing.taxOf(input({ result: E(30000), taxable: E(92000), tableB: { b01: E(1200), b02: E(1000) } }))
  check('the books depreciated more than the tax allows: Table B row 6, the difference added in row 150', t.tableBUsed && t.tableB.r06 === E(1000) && t.rows.r150 === E(200) && t.rows.r250 === 0 && t.rows.r400 === E(30200))
  t = closing.taxOf(input({ result: E(30000), taxable: E(92000), tableB: { b01: E(1200), b02: E(1500), b04: E(100) } }))
  check('less: the difference taken off in row 250, what is not claimed lowering row 6', t.tableB.r06 === E(1400) && t.rows.r150 === 0 && t.rows.r250 === E(200) && t.rows.r400 === E(29800))
  check('no depreciation, no Table B', !closing.taxOf(input({ result: E(100), taxable: E(100) })).tableBUsed)
  const proposal = closing.proposeTax(st)
  check(
    'the books propose the result, the taxable revenues, the interest, representation and gifts',
    proposal.result === 1061839 && proposal.taxable === 1230123 && proposal.r210 === 123 && proposal.tableA.a06 === 12050 && proposal.tableA.a08 === 5000 && proposal.tableB.b01 === 0,
    JSON.stringify(proposal),
  )
  check(
    'depreciation in the books is proposed as the tax depreciation too: nothing is added back unasked',
    (() => {
      const dep = closing.proposeTax(closing.statementsOf({ entries: [entry('2026-12-31', ['551', '082', 40000])] }, 2026))
      return dep.tableB.b01 === 40000 && dep.tableB.b02 === 40000 && closing.taxOf(closing.taxInputOf(2026, dep, closing.EMPTY_INPUTS, { advances: 0 })).rows.r150 === 0
    })(),
  )
  let ti = closing.taxInputOf(2026, proposal, closing.EMPTY_INPUTS, { advances: 30000 })
  check(
    "the return's input: the books' proposal, a micro-taxpayer by the taxable revenues, the advances the bank shows, a whole year that pays the minimum tax",
    ti.result === 1061839 && ti.tableA.a06 === 12050 && ti.typed.r210 === 123 && ti.micro && ti.advances === 30000 && ti.months === 12 && !ti.minimumExempt,
    JSON.stringify(ti),
  )
  ti = closing.taxInputOf(2026, proposal, { ...closing.EMPTY_INPUTS, tableA: { a06: 0, a16: 5000 }, taxable: E(70000), from: '2026-05-04', advances: 0 }, { advances: 30000 })
  check(
    "what the accountant set goes over it: a first period from its founding pays no minimum tax and counts its months, revenues over 60 000 € are no micro-taxpayer's",
    ti.tableA.a06 === 0 && ti.tableA.a16 === 5000 && ti.tableA.a08 === 5000 && !ti.micro && ti.minimumExempt && ti.months === 8 && ti.advances === 0,
    JSON.stringify(ti),
  )
  check('she may say otherwise of both', (() => {
    const own = closing.taxInputOf(2026, proposal, { ...closing.EMPTY_INPUTS, micro: false, from: '2026-05-04', minimumExempt: false }, { advances: 0 })
    return !own.micro && !own.minimumExempt
  })())
  check('Table F: the revenues, the costs, the result before tax', JSON.stringify(closing.tableF(st)) === JSON.stringify({ r01: 1230123, r02: 168284, r03: 1061839 }))

  // The files, against the Financial Administration's own schemas
  const filer = { name: 'Ukážková firma s. r. o.', ico: '12345679', dic: '2120000007', address: 'Hlavná 1, 040 01 Košice', registerLine: 'Obchodný register Okresného súdu Košice I, oddiel Sro, vložka č. 12345/V', nace: '62.01.0', activity: 'Počítačové programovanie' }
  check('an SK NACE code in its parts', JSON.stringify(closingXml.naceParts('62.01.0')) === JSON.stringify({ k1: '62', k2: '01', k3: '0' }) && closingXml.naceParts('620100') === null && JSON.stringify(closingXml.naceParts('62010')) === JSON.stringify({ k1: '62', k2: '01', k3: '0' }))
  t = closing.taxOf(input({ result: proposal.result, taxable: proposal.taxable, tableA: proposal.tableA, typed: { r210: proposal.r210 }, micro: true, losses: [{ year: 2025, amount: E(800), usedBefore: 0 }], minimumCredits: [{ year: 2025, amount: E(340), usedBefore: 0 }], advances: E(100) }))
  const dppo = closingXml.dppoXml(filer, t, { year: 2026, from: '2026-01-01', to: '2026-12-31', declaredOn: '2027-03-20', kind: 'R', micro: true, minimumHalf: false, minimumExempt: false, tableF: closing.tableF(st) })
  let v = await valid(dppo, xsd('dppo2025.xsd'), 'dppo')
  check('the tax return is valid against DPPOv25', v.ok, v.why)
  const dppoAs = closingXml.dppoXml({ ...filer, name: 'Ukážková a. s.', legalForm: '121' }, t, { year: 2026, from: '2026-01-01', to: '2026-12-31', declaredOn: '2027-03-20', kind: 'R', micro: true, minimumHalf: false, minimumExempt: false, tableF: closing.tableF(st) })
  check("an a. s.'s return names its legal form, 121; an s. r. o.'s 112", dppoAs.includes('<pravnaForma>121</pravnaForma>') && dppo.includes('<pravnaForma>112</pravnaForma>') && (await valid(dppoAs, xsd('dppo2025.xsd'), 'dppo-as')).ok)
  check(
    'it holds the computation, Tables A, D, F and K, and who files it',
    dppo.includes(`<r100>${(1061839 / 100).toFixed(2)}</r100>`) &&
      dppo.includes('<r550>10</r550>') &&
      dppo.includes('<mikrodanovnikPar2w>1</mikrodanovnikPar2w>') &&
      dppo.includes('<tabA><r01></r01>') &&
      dppo.includes('<r06>120.50</r06>') &&
      dppo.includes('<tabDs04><datumOd>01.01.2025</datumOd><datumDo>31.12.2025</datumDo><r01>800.00</r01>') &&
      dppo.includes('<tabF><r01>12301.23</r01><r02>1682.84</r02><r03>10618.39</r03></tabF>') &&
      dppo.includes('<vyskaKladnehoRozdielu>340.00</vyskaKladnehoRozdielu>') &&
      dppo.includes('<priezvisko>Juhás</priezvisko><meno>Christian</meno>') &&
      dppo.includes('<k1>62</k1><k2>01</k2><k3>0</k3>'),
    dppo.slice(dppo.indexOf('<telo>'), dppo.indexOf('<telo>') + 400),
  )
  t = closing.taxOf(input({ result: E(30000), taxable: E(92000), advances: E(4000) }))
  v = await valid(closingXml.dppoXml(filer, t, { year: 2026, from: '2026-03-01', to: '2026-12-31', declaredOn: '2027-03-20', kind: 'D', foundOn: '2027-05-02', micro: false, minimumHalf: false, minimumExempt: true, tableF: { r01: 0, r02: 0, r03: 0 } }), xsd('dppo2025.xsd'), 'dppo-d')
  check('so is a supplementary one with an overpayment, of a first period', v.ok, v.why)
  const uz = closingXml.statementsXml(filer, st, lastYear, { year: 2026, from: '2026-01-01', preparedOn: '2027-03-15' })
  v = await valid(uz, xsd('uzmuj2014.xsd'), 'uzmuj')
  check('the financial statements are valid against UZMUJv14', v.ok, v.why)
  check(
    'in whole euros, this year and the year before, the register named',
    uz.includes('<r22><s1>16118</s1>') && uz.includes('<r38><s1>10618</s1>') && uz.includes('<datumK><den>31</den><mesiac>12</mesiac><rok>2026</rok></datumK>') && uz.includes('oddiel Sro'),
    uz.slice(0, 600),
  )
  v = await valid(closingXml.statementsXml(filer, st, null, { year: 2026, from: '2026-05-01', preparedOn: '2027-03-15', approvedOn: '2027-06-10' }), xsd('uzmuj2014.xsd'), 'uzmuj-first')
  check('so are those of a first year, without a year before', v.ok, v.why)
  t = closing.taxOf(input({ result: E(30000), taxable: E(92000), tableB: { b01: E(1200), b02: E(1000) } }))
  const withB = closingXml.dppoXml(filer, t, { year: 2026, from: '2026-01-01', to: '2026-12-31', declaredOn: '2027-03-20', kind: 'R', micro: false, minimumHalf: false, minimumExempt: false, tableF: { r01: 0, r02: 0, r03: 0 } })
  v = await valid(withB, xsd('dppo2025.xsd'), 'dppo-b')
  check('Table B goes with row 150, valid', v.ok && withB.includes('<tabB><r01>1200.00</r01><r02>1000.00</r02><r03>0.00</r03><r04>0.00</r04><r05>0.00</r05><r06>1000.00</r06></tabB>') && withB.includes('<r150>200.00</r150>'), v.why)

  // What keeps a closing from being filed
  const books = (fields = {}) => ({
    start: '2026-01-01',
    entries: [],
    issues: { unbooked: [], noEntry: [], classify: [], waiting: [], missing: [], foreign: [], beforeStart: { docs: 0, payments: 0 } },
    docDays: new Map(),
    payments: new Map(),
    ...fields,
  })
  const issues = (fields = {}, args = {}) =>
    closing.closingIssues({ books: books(fields), year: 2026, company: { dic: '2120000007', address: 'Hlavná 1, Košice' }, nace: '62.01.0', statements: { unplaced: [], rounding: 0 }, tax: { computed: 0, booked: 0 }, ...args })
  check('books that are whole, with everything the forms ask for, keep nothing back', issues().length === 0)
  const pay = (id, bookedOn) => [id, { id, bookedOn }]
  let found = issues({
    issues: { unbooked: ['d1', 'd2', 'd3'], noEntry: ['d4'], classify: ['p1'], waiting: ['p2'], missing: ['p3', 'p4'], foreign: ['p5'], beforeStart: { docs: 0, payments: 0 } },
    docDays: new Map([['d1', '2026-12-30'], ['d2', '2027-01-05'], ['d3', null], ['d4', '2026-03-01']]),
    payments: new Map([pay('p1', '2026-06-01'), pay('p2', '2026-12-31'), pay('p3', '2026-11-11'), pay('p4', '2027-01-02'), pay('p5', '2026-02-02')]),
  })
  check(
    "documents of the year or of no day yet, and the year's payments not in the books, keep it back; the next year's do not",
    found.find((x) => x.code === 'unbooked')?.count === 3 && found.find((x) => x.code === 'payments')?.count === 3 && found.find((x) => x.code === 'foreign')?.count === 1 && found.every((x) => x.level === 'block'),
    JSON.stringify(found),
  )
  found = issues({ start: null, entries: [entry('2026-05-01', ['501', '211', 500]), entry('2026-05-02', ['261', '221.001', 100])] }, { company: { dic: null, address: null }, nace: '', statements: { unplaced: ['414'], rounding: -1 }, tax: { computed: 34000, booked: 0 } })
  check(
    'no start, cash below nought, an account without a row, no tax number, seat or activity, the tax not booked; money in transit and the rounding to look at',
    ['start', 'cash', 'unplaced', 'dic', 'address', 'nace', 'tax'].every((code) => found.some((x) => x.code === code && x.level === 'block')) &&
      found.find((x) => x.code === 'unplaced')?.accounts?.join() === '414' &&
      found.some((x) => x.code === 'transit' && x.level === 'warn') &&
      found.find((x) => x.code === 'rounding')?.count === 1,
    JSON.stringify(found),
  )
  check('while the year runs the tax is not asked to be booked', !issues({}, { tax: null }).some((x) => x.code === 'tax'))
  t = closing.taxOf(input({ result: E(30000), taxable: E(92000) }))
  const ch = closing.changedSinceFiled({ rows: { ...t.rows, r100: E(29000), r1050: E(2900) }, balance: { ...st.balanceEur }, profit: { ...st.profitEur } }, t, st)
  check(
    'what changed since the filing: the rows of the return, and whether either statement',
    ch.rows.join() === 'r100,r1050' &&
      !ch.statements &&
      closing.changedSinceFiled({ rows: t.rows, balance: { ...st.balanceEur, r01: 1 }, profit: { ...st.profitEur } }, t, st).statements &&
      closing.changedSinceFiled({ rows: t.rows, balance: { ...st.balanceEur }, profit: { ...st.profitEur, r38: 1 } }, t, st).statements,
  )

  // The accountant's adjustments, read and stored
  const prop = { result: E(30000), revenues: E(92000), costs: E(62000), taxable: E(92000), r210: 123, tableA: { a06: 12050, a08: 0 }, tableB: { b01: 0, b02: 0 } }
  const form = (fields) => (name) => fields[name]
  let read = closingForm.readClosing(form({ a06: '120,50', a16: '300', r210: '1,23', zdanitelne: '92 000', preddavky: '250', nace: '62010', cinnost: 'Počítačové programovanie', od: '1. 1. 2026' }), 2026, prop, { advances: 25000, size: 'micro', employees: 0 })
  check(
    "what equals the books' proposal is not stored, so it follows the books; what differs is",
    Object.keys(read.errors).length === 0 &&
      read.inputs.tableA.a06 === undefined &&
      read.inputs.tableA.a16 === 30000 &&
      read.inputs.typed.r210 === undefined &&
      read.inputs.taxable === null &&
      read.inputs.micro === null &&
      read.inputs.minimumExempt === null &&
      read.inputs.advances === null &&
      read.inputs.from === null &&
      read.inputs.nace === '62.01.0',
    JSON.stringify(read),
  )
  check('an emptied proposal is a nought she set', closingForm.readClosing(form({ a06: '', zdanitelne: '92000' }), 2026, prop, { advances: 0, size: 'micro', employees: 0 }).inputs.tableA.a06 === 0)
  read = closingForm.readClosing(form({ mikro: '1', zdanitelne: '70000', oslobodena: '1', od: '4. 5. 2026', strata_rok_0: '2024', strata_suma_0: '800', kredit_rok_0: '2025', kredit_suma_0: '340', kredit_pred_0: '100', odpocet: '500', schvalena: '20. 6. 2027' }), 2026, prop, { advances: 0, size: 'micro', employees: 0 })
  check(
    'the ticks stored only against the proposal, the losses and the credits, the founding, the approval',
    read.inputs.micro === true &&
      read.inputs.minimumExempt === null &&
      read.inputs.from === '2026-05-04' &&
      read.inputs.taxable === 7000000 &&
      read.inputs.losses[0]?.year === 2024 &&
      read.inputs.losses[0]?.amount === 80000 &&
      read.inputs.minimumCredits[0]?.usedBefore === 10000 &&
      read.inputs.lossDeduct === 50000 &&
      read.inputs.approvedOn === '2027-06-20',
    JSON.stringify(read.inputs),
  )
  read = closingForm.readClosing(form({ a01: 'veľa', od: '1. 1. 2025', strata_rok_0: '2019', strata_suma_0: '100', kredit_rok_0: '2025', kredit_suma_0: '100', kredit_pred_0: '200', nace: '62', schvalena: '31. 12. 2026' }), 2026, prop, { advances: 0, size: 'micro', employees: 0 })
  check(
    'what is wrong is said field by field: no amount, a day out of the year, a loss too old, more used than there was, a code that is none, an approval before the end',
    read.errors.a01 === 'amount' && read.errors.od === 'day' && read.errors.strata_rok_0 === 'year' && read.errors.kredit_pred_0 === 'used' && read.errors.nace === 'nace' && read.errors.schvalena === 'day' && read.values.a01 === 'veľa',
    JSON.stringify(read.errors),
  )
  const stored = closingForm.storedInputs(JSON.stringify({ tableA: { a06: 100, a07: -5, a99: 3 }, taxable: 'x', micro: true, losses: [{ year: 2024, amount: 500, usedBefore: 900 }, { year: 2023, amount: 500, usedBefore: 0 }], nace: 'abc', from: '2026-02-30' }))
  check(
    'what is stored is checked again: a wrong value follows the books',
    stored.tableA.a06 === 100 && stored.tableA.a07 === undefined && stored.taxable === null && stored.micro === true && stored.losses.length === 1 && stored.nace === '' && stored.from === null && closingForm.storedInputs('{').losses.length === 0,
    JSON.stringify(stored),
  )
  const values = closingForm.closingValues(2026, { ...closing.EMPTY_INPUTS, losses: [{ year: 2024, amount: 80000, usedBefore: 0 }] }, prop, { advances: 25000, size: 'micro', employees: 0 })
  check(
    "the form's values: what is stored, else what the books propose",
    values.a06 === '120,50' && values.a01 === '' && values.r210 === '1,23' && values.zdanitelne === '92000,00' && values.mikro === '' && values.od === '1. 1. 2026' && values.preddavky === '250,00' && values.strata_rok_0 === '2024' && values.strata_suma_0 === '800,00',
    JSON.stringify(values),
  )

  // The income tax paid to the State Treasury, in the books
  check(
    "the income tax by its account's prefix, or by its own symbol when the bank does not say where the money went",
    ledger.reasonAccount({ amountCents: -34000, vs: '1700992026', note: null, exempt: 'state', exemptNote: null, partyIban: null }) === '341' &&
      ledger.reasonAccount({ amountCents: -34000, vs: '1100032026', note: null, exempt: 'state', exemptNote: null, partyIban: null }) === '343.300',
  )

  // The closing of a small or a large company (17 October 2026): Úč POD, the size group, the audit
  const pod = closing.statementsOf({ entries: year }, 2026, 'pod')
  check(
    "Úč POD's profit and loss account: services sold, services bought with representation, other costs, interest, the result before and after tax, the net turnover",
    pod.form === 'pod' && pod.profit.r05 === 1230000 && pod.profit.r14 === 162050 && pod.profit.r26 === 5000 && pod.profit.r41 === 123 && pod.profit.r54 === 1234 && pod.profit.r56 === 1061839 && pod.profit.r61 === 1061839 && pod.profit.r01 === 1230000 && pod.profit.r28 === 1067950,
    JSON.stringify(pod.profit),
  )
  check(
    "its balance sheet: the bank, the capital paid in, a supplier unpaid, the result that balances it",
    pod.balance.r073 === 1611839 && pod.gross.r073 === 1611839 && pod.fix.r073 === 0 && pod.balance.r082 === 500000 && pod.balance.r084 === 0 && pod.balance.r126 === 50000 && pod.balance.r100 === 1061839 && pod.balance.r001 === pod.balance.r079,
    JSON.stringify({ r073: pod.balance.r073, r082: pod.balance.r082, r126: pod.balance.r126, r100: pod.balance.r100, r001: pod.balance.r001, r079: pod.balance.r079 }),
  )
  check(
    'the same books give the same result, revenues and costs on either form, and the same proposal for the return',
    pod.result === st.result && pod.revenues === st.revenues && pod.costs === st.costs && JSON.stringify(closing.tableF(pod)) === JSON.stringify(closing.tableF(st)) && JSON.stringify(closing.proposeTax(pod)) === JSON.stringify(proposal) && pod.turnover === 1230000 && st.turnover === 1230000 && pod.assetsNet === st.assetsNet,
  )
  const fixed = closing.statementsOf(
    {
      entries: [
        { ...entry('2026-01-01', ['022', '701', 1000000], ['013', '701', 360000], ['112', '701', 50000], ['311', '701', 300000], ['701', '411', 1710000]), kind: 'opening' },
        entry('2026-06-30', ['551', '082', 200000], ['551', '073', 120000]),
        entry('2026-12-31', ['505', '191', 10000], ['547', '391', 30000], ['221.002', '461', 400000], ['221.001', '221.002', 450000]),
      ],
    },
    2026,
    'pod',
  )
  check(
    'each asset with its gross amount, its correction and its net: a machine and software depreciated, material and receivables with their allowances, an overdraft a current loan',
    fixed.gross.r014 === 1000000 && fixed.fix.r014 === 200000 && fixed.balance.r014 === 800000 && fixed.gross.r005 === 360000 && fixed.fix.r005 === 120000 && fixed.balance.r003 === 240000 && fixed.balance.r011 === 800000 && fixed.balance.r002 === 1040000 &&
      fixed.fix.r035 === 10000 && fixed.balance.r035 === 40000 && fixed.fix.r057 === 30000 && fixed.balance.r057 === 270000 && fixed.balance.r121 === 400000 && fixed.balance.r139 === 50000 && fixed.balance.r073 === 450000 &&
      fixed.gross.r001 === 1000000 + 360000 + 50000 + 300000 + 450000 && fixed.assetsGross === fixed.gross.r001 && fixed.balance.r001 === fixed.balance.r079,
    JSON.stringify({ g: fixed.gross, f: fixed.fix, n: fixed.balance }).slice(0, 900),
  )
  check(
    'in whole euros the gross, the correction and the net of each row, and the result agrees',
    fixed.grossEur.r014 === 10000 && fixed.fixEur.r014 === 2000 && fixed.balanceEur.r014 === 8000 && fixed.balanceEur.r100 === fixed.profitEur.r61 && fixed.profitEur.r22 === 3200 && fixed.profitEur.r13 === 100 && fixed.profitEur.r25 === 300,
    JSON.stringify({ r100: fixed.balanceEur.r100, r61: fixed.profitEur.r61, r22: fixed.profitEur.r22 }),
  )
  const placed = closing.statementsOf(
    {
      entries: [
        { ...entry('2026-01-01', ['311.002', '701', 200000], ['311', '701', 100000], ['701', '411', 300000]), kind: 'opening' },
        entry('2026-05-01', ['221.001', '662.001', 1000], ['221.001', '662', 500]),
      ],
    },
    2026,
    'pod',
    [
      { account: '311.002', row: 'r045' },
      { account: '662.001', row: 'r40' },
    ],
  )
  check(
    "the accountant's placements: a receivable due after a year among the long-term ones, interest from a related party in its row; the rest stays where the form puts it",
    placed.balance.r045 === 200000 && placed.balance.r057 === 100000 && placed.balance.r041 === 200000 && placed.profit.r40 === 1000 && placed.profit.r41 === 500 && placed.profit.r39 === 1500,
    JSON.stringify({ r045: placed.balance.r045, r057: placed.balance.r057, r40: placed.profit.r40 }),
  )
  const loss = closing.statementsOf({ entries: [...year.slice(0, 2), entry('2026-05-01', ['518', '221.001', 80000]), entry('2027-02-01', ['221.001', '602', 10000])] }, 2027, 'pod')
  check('a loss of the year before waits on 431, a minus among the losses of years before (row 099)', loss.balance.r099 === -80000 && loss.balance.r098 === 0 && loss.balance.r100 === 10000 && loss.balance.r001 === loss.balance.r079, JSON.stringify({ r098: loss.balance.r098, r099: loss.balance.r099 }))
  const oddPod = closing.statementsOf({ entries: [entry('2027-01-10', ['221.001', '602', 10000]), entry('2027-01-11', ['518', '221.001', 50]), entry('2027-01-12', ['501', '221.001', 50])] }, 2027, 'pod')
  check('rounding that would part the results goes to row 073 of Úč POD, and is said', oddPod.profitEur.r61 === 98 && oddPod.balanceEur.r100 === 98 && oddPod.grossEur.r073 === 98 && oddPod.rounding === -1 && oddPod.balanceEur.r001 === oddPod.balanceEur.r079)
  check(
    'every account of the chart has a row on Úč POD',
    Object.keys(ledger.CHART).every((a) => ['7'].includes(a[0]) || closingPod.podRowKinds(a).length > 0),
    Object.keys(ledger.CHART).filter((a) => a[0] !== '7' && closingPod.podRowKinds(a).length === 0).join(),
  )
  check(
    'rows the accountant may place an account in: a leaf of its side, never a sum',
    closingPod.podLeafKind('r045') === 'asset' && closingPod.podLeafKind('r041') === null && closingPod.podLeafKind('r138') === 'liability' && closingPod.podLeafKind('r100') === null && closingPod.podLeafKind('r40') === 'profit' && closingPod.podLeafKind('r39') === null &&
      closingForm.podRowOf('311.002', '45') === 'r045' && closingForm.podRowOf('311', '126') === 'r126' && closingForm.podRowOf('022', '126') === null && closingForm.podRowOf('662', '40') === 'r40' && closingForm.podRowOf('662', '045') === null && closingForm.podRowOf('411', 'r41') === null,
  )
  // One pass over the books gives each year what closingBalances gives it.
  const many = [...year, entry('2027-02-01', ['221.001', '602', 10000]), entry('2028-03-01', ['518', '221.001', 700])]
  const byYear = closing.closingBalancesByYear(many, [2025, 2026, 2027, 2028])
  const same = (a, b) => JSON.stringify([...a].filter(([, c]) => c !== 0).sort()) === JSON.stringify([...b].filter(([, c]) => c !== 0).sort())
  check('the balances of every year in one pass, as each year alone', [2025, 2026, 2027, 2028].every((y) => same(byYear.get(y), closing.closingBalances(many, y))) && byYear.get(2025).size === 0)

  // The size group (§ 2(6) to (11) of the Act on Accounting) and the audit (§ 19)
  const fig = (year, assetsNet, turnover, employees, assetsGross = assetsNet) => ({ year, assetsNet: E(assetsNet), assetsGross: E(assetsGross), turnover: E(turnover), employees })
  check(
    'a period\'s group by two of three conditions; one that fits none is small',
    closing.sizeGroup(fig(0, 400000, 1000000, 5)) === 'micro' &&
      closing.sizeGroup(fig(0, 450000, 900000, 40)) === 'micro' &&
      closing.sizeGroup(fig(0, 450001, 900001, 5)) === 'small' &&
      closing.sizeGroup(fig(0, 6000000, 11000000, 20)) === 'large' &&
      closing.sizeGroup(fig(0, 5000000, 10000000, 51)) === 'small' &&
      closing.sizeGroup(fig(0, 6000000, 500000, 30)) === 'small',
  )
  const figs = new Map([
    [2023, fig(2023, 300000, 800000, 4)],
    [2024, fig(2024, 900000, 2000000, 12)],
    [2025, fig(2025, 1200000, 2500000, 15)],
    [2026, fig(2026, 7000000, 12000000, 60)],
  ])
  check(
    'the group a year is put in: micro where the books begin, kept until two years in a row are of another, then theirs',
    closing.proposeSize(2023, figs, new Map(), 2023).size === 'micro' && closing.proposeSize(2023, figs, new Map(), 2023).reason === 'first' &&
      closing.proposeSize(2024, figs, new Map(), 2023).reason === 'kept' && closing.proposeSize(2025, figs, new Map(), 2023).size === 'micro' &&
      closing.proposeSize(2026, figs, new Map(), 2023).size === 'small' && closing.proposeSize(2026, figs, new Map(), 2023).reason === 'two' &&
      closing.proposeSize(2027, figs, new Map(), 2023).size === 'small' && closing.proposeSize(2027, figs, new Map(), 2023).reason === 'kept',
  )
  check(
    "a group the accountant chose is the one kept: a new company's choice in its second period",
    closing.proposeSize(2024, new Map(), new Map([[2023, 'large']]), 2023).size === 'large' && closing.proposeSize(2027, figs, new Map([[2026, 'large']]), 2023).size === 'large',
  )
  check(
    'the average employees by the days in employment',
    closing.averageEmployees([{ startedOn: '2020-01-01', endedOn: null }], 2026) === 1 &&
      closing.averageEmployees([{ startedOn: '2026-07-01', endedOn: null }, { startedOn: '2025-01-01', endedOn: '2026-03-31' }], 2026) === 0.8 &&
      closing.averageEmployees([{ startedOn: '2027-01-01', endedOn: null }], 2026) === 0,
  )
  check(
    'the audit: two of gross assets above 4 000 000 €, turnover above 8 000 000 €, more than 50 employees, this year and the one before',
    closing.auditOf(fig(2026, 3000000, 9000000, 10, 4500000), fig(2025, 3000000, 8500000, 10, 4100000)) === 'yes' &&
      closing.auditOf(fig(2026, 3000000, 9000000, 10, 4500000), null) === 'maybe' &&
      closing.auditOf(fig(2026, 3000000, 9000000, 10, 4500000), fig(2025, 3000000, 7000000, 10, 4100000)) === 'no' &&
      closing.auditOf(fig(2026, 3000000, 7000000, 51, 3900000), fig(2025, 3000000, 9000000, 60, 4100000)) === 'no',
  )
  check(
    'the count of inventories: method B keeps the closing back without the count of the year\'s last day, method A warns without a count in the year; not while the year runs',
    issues({}, { stock: { method: 'B', items: true, inYear: true, yearEnd: false } }).some((x) => x.code === 'stockCount' && x.level === 'block') &&
      !issues({}, { stock: { method: 'B', items: true, inYear: true, yearEnd: true } }).some((x) => x.code === 'stockCount') &&
      issues({}, { stock: { method: 'A', items: true, inYear: false, yearEnd: false } }).some((x) => x.code === 'stockCount' && x.level === 'warn') &&
      !issues({}, { tax: null, stock: { method: 'B', items: true, inYear: false, yearEnd: false } }).some((x) => x.code === 'stockCount') &&
      !issues({}, { stock: { method: 'B', items: false, inYear: false, yearEnd: false } }).some((x) => x.code === 'stockCount'),
  )
  check(
    'an audit is said on the closing, to look at',
    issues({}, { audit: 'yes' }).some((x) => x.code === 'audit' && x.level === 'warn') && issues({}, { audit: 'maybe' }).some((x) => x.code === 'auditMaybe') && !issues({}, { audit: 'no' }).some((x) => x.code.startsWith('audit')),
  )

  // The file of Úč POD, against the Financial Administration's schema
  const podBefore = closing.statementsOf({ entries: [...year, entry('2027-02-01', ['221.001', '602', 10000])] }, 2027, 'pod')
  const uzpod = closingXml.statementsXml(filer, fixed, pod, { year: 2026, from: '2026-01-01', preparedOn: '2027-03-15', size: 'small' })
  v = await valid(uzpod, xsd('uzpod2014.xsd'), 'uzpod')
  check('the statements of a small entity are valid against UZPODv14', v.ok, v.why)
  check(
    'they say a small entity, and hold each asset row\'s gross, correction, net and the net before; equity and liabilities and the profit and loss account with the year before',
    uzpod.includes('<typUzavierky><riadna>1</riadna><mimoriadna>0</mimoriadna><priebezna>0</priebezna><mala>1</mala><velka>0</velka></typUzavierky>') &&
      uzpod.includes('<r014><s1>10000</s1><s2>2000</s2><s3>8000</s3><s4>0</s4></r014>') &&
      uzpod.includes('<r073><s1>4500</s1><s2>0</s2><s3>4500</s3><s4>16118</s4></r073>') &&
      uzpod.includes('<r121><s5>4000</s5><s6>0</s6></r121>') &&
      uzpod.includes('<r05><s1>0</s1><s2>12300</s2></r05>'),
    uzpod.slice(uzpod.indexOf('<telo>'), uzpod.indexOf('<telo>') + 500),
  )
  const large = closingXml.statementsXml(filer, podBefore, null, { year: 2027, from: '2027-01-01', preparedOn: '2028-03-15', approvedOn: '2028-06-10', size: 'large' })
  v = await valid(large, xsd('uzpod2014.xsd'), 'uzpod-large')
  check('so are those of a large entity without a year before', v.ok && large.includes('<mala>0</mala><velka>1</velka>') && large.includes('<datSchvalenia>10.06.2028</datSchvalenia>'), v.why)

  // The accountant's size group, employees and placements, read and stored
  const found3 = { advances: 0, size: 'micro', employees: 3.5 }
  read = closingForm.readClosing(form({ velkost: 'small', zamestnanci: '12,5', ucet_0: '311002', riadok_0: '45', ucet_1: '662.001', riadok_1: 'r40', ucet_2: '311.002', riadok_2: '045' }), 2026, prop, found3)
  check(
    'a size group other than the books\', the employees typed, accounts placed (an analytic one written as the books write it; the same placement once)',
    Object.keys(read.errors).length === 0 && read.inputs.size === 'small' && read.inputs.employees === 12.5 && JSON.stringify(read.inputs.placements) === JSON.stringify([{ account: '311.002', row: 'r045' }, { account: '662.001', row: 'r40' }]),
    JSON.stringify(read),
  )
  read = closingForm.readClosing(form({ velkost: 'micro', zamestnanci: '3,5' }), 2026, prop, found3)
  check("what equals the books' proposal is not stored", read.inputs.size === null && read.inputs.employees === null && read.inputs.placements.length === 0)
  read = closingForm.readClosing(form({ velkost: 'huge', zamestnanci: 'veľa', ucet_0: '999', riadok_0: '45', ucet_1: '311', riadok_1: '41', ucet_2: '022', riadok_2: '126' }), 2026, prop, found3)
  check(
    'a group that is none follows the books; employees that are no number, an account that is none, a sum row and a row of the other side are said',
    read.inputs.size === null && read.values.velkost === 'micro' && read.errors.zamestnanci === 'employees' && read.errors.ucet_0 === 'account' && read.errors.riadok_1 === 'row' && read.errors.riadok_2 === 'row',
    JSON.stringify(read.errors),
  )
  const storedPod = closingForm.storedInputs(JSON.stringify({ size: 'large', employees: 61.5, placements: [{ account: '311.002', row: 'r045' }, { account: '311', row: 'r100' }, { account: 'x', row: 'r045' }, { account: '022', row: 'r126' }] }))
  check('stored ones are checked again', storedPod.size === 'large' && storedPod.employees === 61.5 && storedPod.placements.length === 1 && closingForm.storedInputs(JSON.stringify({ size: 'giant', employees: -1 })).size === null)
  const valuesPod = closingForm.closingValues(2026, { ...closing.EMPTY_INPUTS, placements: [{ account: '311.002', row: 'r045' }] }, prop, found3)
  check("the form's values: the proposed group and employees, a placement's row as its number", valuesPod.velkost === 'micro' && valuesPod.zamestnanci === '3,5' && valuesPod.ucet_0 === '311.002' && valuesPod.riadok_0 === '045' && valuesPod.ucet_1 === '')
  // Deferred tax (§ 10 of the measure on accounting procedures, as in force on 1 January 2026)
  const machine = { id: 'm1', number: 'M-2026-001', name: 'Stroj', account: '022', costCents: 1_000_000, inUseOn: '2026-03-15', taxGroup: 1, taxMethod: 'straight', car: false, bookMonths: 60, source: 'purchase', priorBookCents: 0, priorTaxCents: 0, priorTaxYears: 0, disposedOn: null, disposal: null }
  check(
    'the register\'s temporary differences: a book value above the tax base taxable, below it deductible; nothing of an asset disposed of or not yet in use',
    JSON.stringify(assets.temporaryDifferences([machine], 2026)) === JSON.stringify({ taxable: 41663, deductible: 0 }) &&
      JSON.stringify(assets.temporaryDifferences([{ ...machine, bookMonths: 12 }], 2026)) === JSON.stringify({ taxable: 0, deductible: 624997 }) &&
      JSON.stringify(assets.temporaryDifferences([{ ...machine, disposedOn: '2026-11-30', disposal: 'sale' }, { ...machine, inUseOn: '2027-02-01' }], 2026)) === JSON.stringify({ taxable: 0, deductible: 0 }),
    JSON.stringify([assets.temporaryDifferences([machine], 2026), assets.temporaryDifferences([{ ...machine, bookMonths: 12 }], 2026)]),
  )
  const dIn = { on: true, rate: 21, assets: { taxable: 41663, deductible: 0 }, otherTaxable: 0, otherDeductible: 100000, losses: 500000, useLosses: false, assetBefore: 0, liabilityBefore: 0 }
  let dt = closing.deferredTaxOf(dIn)
  check(
    'the asset and the liability at the rate, booked apart against 592; a deferred income when the asset is the larger',
    dt.asset === 21000 && dt.liability === 8749 && JSON.stringify(dt.lines) === JSON.stringify([{ md: '481.100', d: '592', cents: 21000 }, { md: '592', d: '481.200', cents: 8749 }]) && dt.expense === -12251,
    JSON.stringify(dt),
  )
  dt = closing.deferredTaxOf({ ...dIn, assetBefore: 30000, liabilityBefore: -5000 })
  check('a later year books only the change against what 481 holds', JSON.stringify(dt.lines) === JSON.stringify([{ md: '592', d: '481.100', cents: 9000 }, { md: '592', d: '481.200', cents: 3749 }]) && dt.expense === 12749)
  check(
    'tax losses count only when she says so; nothing when deferred tax is not accounted',
    closing.deferredTaxOf({ ...dIn, useLosses: true }).asset === 126000 && closing.deferredTaxOf({ ...dIn, on: false }).lines.length === 0 && closing.deferredTaxOf({ ...dIn, on: false }).expense === 0,
  )
  const apart = closing.statementsOf({ entries: [entry('2026-12-31', ['481.100', '592', 21000], ['592', '481.200', 8749])] }, 2026, 'pod')
  check('the deferred tax asset and liability stand apart in the balance sheet (rows 052 and 117), its cost in row 59', apart.balance.r052 === 21000 && apart.balance.r117 === 8749 && apart.profit.r59 === -12251 && apart.balance.r001 === apart.balance.r079)
  check(
    'deferred tax booked otherwise than computed keeps the closing back',
    issues({}, { tax: { computed: 0, booked: 0, deferred: { computed: 8749, booked: 0 } } }).some((x) => x.code === 'deferred' && x.level === 'block') && !issues({}, { tax: { computed: 0, booked: 0, deferred: { computed: 5, booked: 5 } } }).some((x) => x.code === 'deferred'),
  )
  const foundD = { advances: 0, size: 'small', employees: 0, deferred: false, deferredDeductible: 100000 }
  read = closingForm.readClosing(form({ odlozena: '1', od_zdanitelne: '500', od_odpocitatelne: '1000', od_straty: '1' }), 2026, prop, foundD)
  check('deferred tax set against the law\'s default, the differences against the books\' proposal', read.inputs.deferred === true && read.inputs.deferredTaxable === 50000 && read.inputs.deferredDeductible === null && read.inputs.deferredLosses === true, JSON.stringify(read.inputs))
  const valuesD = closingForm.closingValues(2026, { ...closing.EMPTY_INPUTS }, prop, { ...foundD, deferred: true })
  check("the form's values: deferred tax on when the law has it, the provisions proposed", valuesD.odlozena === '1' && valuesD.od_odpocitatelne === '1000,00' && valuesD.od_zdanitelne === '' && valuesD.od_straty === '')
  check('stored deferred inputs are checked again', (() => {
    const st2 = closingForm.storedInputs(JSON.stringify({ deferred: true, deferredTaxable: 500, deferredDeductible: -1, deferredLosses: 'yes' }))
    return st2.deferred === true && st2.deferredTaxable === 500 && st2.deferredDeductible === null && st2.deferredLosses === false
  })())
  // The notes to the statements (17 October 2026): the draft, and the PDF it is written in
  const pdfDoc = { title: 'Skúška', header: { left: 'Poznámky Úč POD 3-01', right: 'IČO 12345679' }, blocks: [{ kind: 'title', text: 'Poznámky (zátvorky) \\ ľťď' }, { kind: 'table', columns: [{ label: 'A', width: 70 }, { label: 'B', width: 30, align: 'right' }], rows: Array.from({ length: 100 }, (_, i) => ({ cells: [`Riadok ${i}`, '−5 €'] })) }] }
  const pdfSource = pdfWriter.pdfText(pdfDoc)
  const offsetsOk = (() => {
    const xref = Number(/startxref\n(\d+)/.exec(pdfSource)?.[1])
    const table = pdfSource.slice(xref).split('\n').slice(2).filter((l) => / 00000 n $/.test(l)).map((l) => Number(l.slice(0, 10)))
    return pdfSource.slice(xref).startsWith('xref') && table.length > 6 && table.every((o, i) => pdfSource.slice(o).startsWith(`${i + 1} 0 obj`))
  })()
  check(
    'a PDF of plain ASCII whose cross-reference points at each object, pages broken with the table\'s head again, the Slovak letters by the font\'s own codes',
    pdfSource.startsWith('%PDF-1.4\n') && /^[\x00-\x7f]*$/.test(pdfSource) && offsetsOk && /\/Count 3 /.test(pdfSource) && pdfSource.includes('157 /lcaron') && pdfSource.includes('(Pozn\\341mky \\(z\\341tvorky\\) \\\\ \\235\\252\\217)') && pdfSource.includes('(\\2265 \\200)') && pdfWriter.pdfOf(pdfDoc).length === pdfSource.length,
    pdfSource.slice(0, 300),
  )
  check('widths as Helvetica has them, the wide caron letters wider', pdfWriter.textWidth('ľ', 10) > pdfWriter.textWidth('l', 10) && pdfWriter.textWidth('Aa 1', 1000) === 667 + 556 + 278 + 556 && pdfWriter.wrap('jedno dve tri štyri', pdfWriter.textWidth('jedno dve', 10), 10).length === 2)
  const noteSrc = (size, fields = {}) => ({
    company: { name: 'Ukážková firma s. r. o.', ico: '12345679', dic: '2120000007', address: 'Hlavná 1, 040 01 Košice', registerLine: 'Obchodný register Okresného súdu Košice I, oddiel Sro, vložka č. 12345/V' },
    year: 2026, from: '2026-01-01', size, statements: size === 'micro' ? st : pod, previous: null, employees: 3.5, nace: '62.01.0', activity: 'Počítačové programovanie', priorApproved: null,
    assets: [], tax: { rate: 21, current: 0 }, deferred: { on: false, asset: 0, liability: 0, rate: 21 }, audit: 'no', notes: { priorApproved: null, events: '', profit: '', other: '' }, ...fields,
  })
  const text = (doc) => doc.blocks.map((b) => (b.kind === 'table' ? b.rows.map((r) => r.cells.join(' | ')).join('\n') : b.text)).join('\n')
  let notesDoc = notes.notesDocument(noteSrc('micro'))
  check(
    "a micro entity's notes: Úč MUJ 3-01 with IČO and DIČ on each page, its three articles, the employees, no events unless she wrote them",
    notesDoc.header.left === 'Poznámky Úč MUJ 3-01' && notesDoc.header.right.includes('IČO 12345679') && notesDoc.header.right.includes('DIČ 2120000007') && ['Čl. I ', 'Čl. II ', 'Čl. III '].every((h) => text(notesDoc).includes(h)) && !text(notesDoc).includes('Čl. IV') && text(notesDoc).includes('zamestnancov počas účtovného obdobia: 3,5') && !text(notesDoc).includes('Udalosti po dni'),
    text(notesDoc).slice(0, 400),
  )
  notesDoc = notes.notesDocument(noteSrc('small', { notes: { priorApproved: '2026-06-20', events: 'Firma kúpila budovu.', profit: 'Zisk sa prevedie na účet 428.', other: '' } }))
  check(
    "a small entity's: Úč POD 3-01, seven articles, the approval before, her events and her proposal for the profit",
    notesDoc.header.left === 'Poznámky Úč POD 3-01' && ['Čl. I ', 'Čl. II ', 'Čl. III ', 'Čl. IV ', 'Čl. V ', 'Čl. VI ', 'Čl. VII '].every((h) => text(notesDoc).includes(h)) && !text(notesDoc).includes('Čl. VIII') && text(notesDoc).includes('schválená 20. 6. 2026') && text(notesDoc).includes('Firma kúpila budovu.') && text(notesDoc).includes('Zisk sa prevedie na účet 428.'),
  )
  const podPrev = closing.statementsOf({ entries: year }, 2026, 'pod')
  const podNext = closing.statementsOf({ entries: [...year, entry('2027-02-01', ['221.001', '602', 10000]), entry('2027-03-01', ['022', '321', 500000]), entry('2027-12-31', ['551', '082', 50000]), entry('2027-06-01', ['221.001', '461', 300000])] }, 2027, 'pod')
  const cf = notes.cashFlowOf(podNext, podPrev)
  check(
    'the cash flows from the two balance sheets: operations, investments and financing make the change of money exactly',
    cf.operating + cf.investing + cf.financing === cf.end - cf.start && cf.investing === -5000 && cf.lines.find(([l]) => l.startsWith('Zmena stavu úverov'))?.[1] === 3000 && cf.lines[1][1] === 500,
    JSON.stringify(cf),
  )
  notesDoc = notes.notesDocument(noteSrc('large', { year: 2027, statements: podNext, previous: podPrev, audit: 'yes', deferred: { on: true, asset: 21000, liability: 8749, rate: 21 } }))
  check(
    "a large entity's: the articles and the tables of its figures, the fixed assets, equity, the income tax and the cash flows",
    text(notesDoc).includes('Čl. VIII') && text(notesDoc).includes('Samostatné hnuteľné veci a súbory | 0 € | 5 000 € | 0 € | 500 € | 0 € | 4 500 €') && text(notesDoc).includes('Prehľad peňažných tokov') && text(notesDoc).includes('Odložený daňový záväzok | 87 €') && text(notesDoc).includes('podlieha overeniu audítorom'),
    text(notesDoc).slice(text(notesDoc).indexOf('Čl. VIII'), text(notesDoc).indexOf('Čl. VIII') + 500),
  )
  check(
    'what the draft states that only she can confirm: the group, the bodies, what is off the balance sheet; the loans, the events and the approval before when they are in question',
    notes.noteChecks(noteSrc('large', { statements: podNext, previous: podPrev })).join() === 'group,bodies,offBalance,longLiabilities,events,priorApproved' && notes.noteChecks(noteSrc('micro', { notes: { priorApproved: null, events: 'Nič.', profit: '', other: '' } })).join() === 'group,bodies,offBalance',
  )
  read = closingForm.readClosing(form({ poz_schvalena: '20. 6. 2026', poz_udalosti: ' Firma kúpila budovu.\r\n ', poz_zisk: 'Na 428.', poz_ine: '' }), 2026, prop, found3)
  check("the notes' inputs read and stored", read.inputs.notes.priorApproved === '2026-06-20' && read.inputs.notes.events === 'Firma kúpila budovu.' && read.inputs.notes.profit === 'Na 428.' && closingForm.storedInputs(JSON.stringify({ notes: { priorApproved: '2026-02-30', events: 5, profit: 'x' } })).notes.profit === 'x')
  check(
    "a change of the statements' gross amounts since the filing is a change too",
    closing.changedSinceFiled({ rows: t.rows, balance: { ...fixed.balanceEur }, profit: { ...fixed.profitEur }, gross: { ...fixed.grossEur, r014: 1 } }, t, fixed).statements && !closing.changedSinceFiled({ rows: t.rows, balance: { ...fixed.balanceEur }, profit: { ...fixed.profitEur }, gross: { ...fixed.grossEur } }, t, fixed).statements,
  )
}

// ---------------------------------------------------------------------------------------------------------------
// Payroll: an employee's month, against figures the authorities and the profession published
// ---------------------------------------------------------------------------------------------------------------
{
  const y26 = payroll.payrollYear(2026)
  const y27 = payroll.payrollYear(2027)
  check(
    "the non-taxable part's twelfth and the monthly bands, as the Financial Directorate gives them for 2026; 2027 from the subsistence minimum of July 2026",
    payroll.nonTaxableMonth(y26) === 49723 &&
      payroll.nonTaxableYear(y27) === 619962 &&
      payroll.nonTaxableMonth(y27) === 51664 &&
      payroll.monthlyBands(y26).join() === '366528,502910,625086' &&
      Math.round(154.8 * y27.subsistence) === 4570006,
  )
  check('the social insurance cap: 16 764 € in 2026, 17 820 € in 2027', payroll.socialCap(y26) === 1676400 && payroll.socialCap(y27) === 1782000)
  let unsupported = false
  try { payroll.payrollYear(2030) } catch (e) { unsupported = e instanceof RangeError }
  check('an unsupported payroll year cannot silently borrow another year\'s rules', unsupported && payroll.supportsPayrollPeriod('2026-09') && !payroll.supportsPayrollPeriod('2025-09') && !payroll.supportsPayrollPeriod('2026-13'))
  const pay = (fields) => payroll.payslip({ period: '2026-10', gross: 0, declaration: true, children: [], disabled: false, healthDeduction: false, healthMinimumExempt: false, days: 31, ...fields })
  let p = pay({ gross: 150000, children: [{ name: 'Andrea', born: '2016-04-02' }] })
  check(
    "SuperFaktúra's 1 500 € with a daughter: insurance 216 €, an advance of 149,49 €, the bonus of 100 €, 1 234,51 € paid",
    p.socialEmployee === 14100 && p.healthEmployee === 7500 && p.partialBase === 128400 && p.advance === 14949 && p.bonus === 10000 && p.withheld === 4949 && p.net === 123451,
    JSON.stringify(p),
  )
  p = pay({ period: '2027-01', gross: 97200 })
  check(
    "the minimum wage of 2027: each social amount rounded down (91,36 €), 48,60 € to health, 59,93 € of tax, 772,11 € paid, 1 323,85 € the employer's cost (Bezúčto)",
    p.socialEmployee === 9136 && p.social.employee.sickness === 1360 && p.healthEmployee === 4860 && p.advance === 5993 && p.net === 77211 && p.employerCost === 132385 && p.socialEmployer === 24493,
    JSON.stringify(p),
  )
  p = pay({ gross: 2000000, declaration: false })
  check(
    'above the cap: social insurance from 16 764 € (the Agency\'s 234,69 € and 2 346,96 €), accident insurance and health from the whole',
    p.socialBase === 1676400 && p.social.employee.sickness === 23469 && p.social.employer.oldAge === 234696 && p.social.employer.accident === 16000 && p.healthEmployer === 220000,
  )
  check('the bands: 10 000 € without the declaration, 19 %, 25 %, 30 % and 35 % of their parts, rounded once', pay({ gross: 1000000, declaration: false }).advance === 221209)
  p = pay({ gross: 20000 })
  check('the minimum health advance of 2026 is 45,45 €: what 200 € falls short of it the employee pays', p.healthEmployee + p.healthEmployer === 4545 && p.healthTopUp === 1345)
  check(
    'shared by the days employed, and not paid by one with an exception',
    pay({ period: '2026-09', gross: 10000, days: 15 }).healthTopUp === 2272 - 1600 && pay({ gross: 20000, healthMinimumExempt: true }).healthTopUp === 0,
  )
  check(
    'the deductible item below 570 €: 550 € leaves 510 € to the employee\'s health; 300 € leaves nothing (but the minimum)',
    payroll.healthDeductible(55000) === 4000 && pay({ gross: 55000, healthDeduction: true }).healthEmployee === 2550 && payroll.healthDeductible(30000) === 30000 && payroll.healthDeductible(57000) === 0,
  )
  check('a person with a disability: 2,5 % and 5,5 %', pay({ gross: 150000, disabled: true }).healthEmployee === 3750 && pay({ gross: 150000, disabled: true }).healthEmployer === 8250)
  p = pay({ period: '2026-09', gross: 50000, days: 15, healthDeduction: true })
  check('the deductible item follows days employed: 500 € for half of September leaves 70 € deducted and 21,50 € employee insurance', p.healthDeduction === 7000 && p.healthEmployee === 2150, JSON.stringify(p))
  check('a partial-month deductible is rounded up to a cent, including income below 380 €', payroll.healthDeductible(50000, 1, 31) === 452 && payroll.healthDeductible(30000, 15, 30) === 15000 && payroll.healthDeductible(50000, 0, 30) === 0)
  p = pay({ gross: 10000, disabled: true })
  check('disability itself exempts a low wage from the minimum health advance', p.healthEmployee === 250 && p.healthEmployer === 550 && p.healthTopUp === 0, JSON.stringify(p))
  check(
    "the child bonus by age: 100 € to the month the child turns 15, 50 € to the month it turns 18, from the month it is born",
    payroll.childBonus({ name: 'a', born: '2012-05-10' }, '2027-05') === 10000 &&
      payroll.childBonus({ name: 'a', born: '2012-05-10' }, '2027-06') === 5000 &&
      payroll.childBonus({ name: 'b', born: '2009-03-01' }, '2027-03') === 5000 &&
      payroll.childBonus({ name: 'b', born: '2009-03-01' }, '2027-04') === 0 &&
      payroll.childBonus({ name: 'c', born: '2026-10-20' }, '2026-10') === 10000 &&
      payroll.childBonus({ name: 'c', born: '2026-10-20' }, '2026-09') === 0,
  )
  p = pay({ gross: 46000, children: [{ name: 'a', born: '2020-01-01' }, { name: 'b', born: '2022-01-01' }] })
  check('a low wage: two children\'s bonus at most 36 % of the partial base, 141,75 € of 460 € (Peniaze.sk)', p.partialBase === 39376 && p.bonus === 14175 && p.withheld < 0 && p.net === 46000 - 4324 - 2300 + 14175, JSON.stringify(p))
  p = pay({ gross: 300000, children: [{ name: 'a', born: '2016-01-01' }, { name: 'b', born: '2010-01-01' }] })
  check('a high one: each child\'s bonus lowered by a tenth of the base above 2 286 € (KROS\'s 3 000 €: 71,80 € and 21,80 €)', p.partialBase === 256800 && p.bonus === 9360 && p.bonusByChild.map((c) => c.amount).join() === '7180,2180', JSON.stringify(p.bonusByChild))
  check('no declaration, no non-taxable part and no bonus', pay({ gross: 150000, declaration: false, children: [{ name: 'a', born: '2016-01-01' }] }).bonus === 0 && pay({ gross: 150000, declaration: false }).nonTaxable === 0)
  const t = payroll.payrollTotals([
    { ...pay({ gross: 150000 }), insurer: '25' },
    { ...pay({ gross: 200000 }), insurer: '24' },
    { ...pay({ gross: 100000 }), insurer: '25' },
  ])
  check('the month\'s sums: the Social Insurance Agency, each health insurer, the tax office, the employees', t.gross === 450000 && t.health['25'] === 7500 + 16500 + 5000 + 11000 && t.health['24'] === 10000 + 22000 && t.social === 51900 + 69200 + 34600 && t.tax === 14949 + 23081 + 6817 && t.net === 340353, JSON.stringify(t))
}

// ---------------------------------------------------------------------------------------------------------------
// Payroll: the months, the payday, the books, the deadlines
// ---------------------------------------------------------------------------------------------------------------
{
  check(
    "the payday: the agreed day of the next month (the last of a shorter one), else the next month's last day",
    payrollStore.paydayOf('2026-10', { payday: 10 }) === '2026-11-10' &&
      payrollStore.paydayOf('2026-10', { payday: 31 }) === '2026-11-30' &&
      payrollStore.paydayOf('2026-10', { payday: null }) === '2026-11-30' &&
      payrollStore.paydayOf('2026-12', { payday: 5 }) === '2027-01-05',
  )
  check(
    'the days of a month employed',
    payrollStore.daysEmployed({ startedOn: '2026-10-15', endedOn: null }, '2026-10') === 17 &&
      payrollStore.daysEmployed({ startedOn: '2026-01-01', endedOn: '2026-10-10' }, '2026-10') === 10 &&
      payrollStore.daysEmployed({ startedOn: '2026-11-01', endedOn: null }, '2026-10') === 0 &&
      payrollStore.daysEmployed({ startedOn: '2026-12-15', endedOn: null }, '2026-10') === 0 &&
      payrollStore.daysEmployed({ startedOn: '2026-01-01', endedOn: '2026-08-31' }, '2026-10') === 0,
  )
  const employee = (fields = {}) => ({ id: 'e1', name: 'Ján', bornOn: null, insurer: '25', startedOn: '2026-01-01', endedOn: null, wage: 150000, declaration: true, disabled: false, healthDeduction: false, healthExempt: false, children: [], iban: null, contract: 'employment', regular: true, pension: 'none', exemption: false, wageKind: 'monthly', weeklyHours: 4000, leaveDays: null, ...fields })
  let slips = payrollStore.monthSlips('2026-10', [employee({ startedOn: '2026-10-16' }), employee({ id: 'e2', startedOn: '2026-12-01' })], null)
  // October 2026 has 22 weekdays, 11 of them from the 16th: half the wage.
  check('an open month proposes the wage, a share of it by the working days of part of the month; nobody who was not employed', slips.length === 1 && slips[0].gross === 75000 && slips[0].days === 16)
  slips = payrollStore.monthSlips('2026-10', [employee()], { period: '2026-10', payday: '2026-11-10', lines: [{ employeeId: 'e1', name: 'Ján', insurer: '25', gross: 160000 }], closedOn: null, closedByName: null })
  check('the income typed for the month counts', slips[0].gross === 160000 && slips[0].slip.gross === 160000)
  const closed = { period: '2026-09', payday: '2026-10-10', lines: slips.map((l) => ({ ...l })), closedOn: '2026-10-05', closedByName: 'Lucia' }
  const lp = payrollStore.ledgerPayroll(closed)
  const s1 = slips[0].slip
  check(
    'a closed month as the books take it: the sums, and what each payment of it comes to',
    lp.gross === 160000 && lp.socialEmployee === s1.socialEmployee && lp.tax === s1.withheld && lp.pays.social === s1.socialEmployee + s1.socialEmployer && lp.pays.health.join() === String(s1.healthEmployee + s1.healthEmployer) && payrollStore.ledgerPayroll({ ...closed, closedOn: null }) === null,
  )
  const pay = (amountCents, fields = {}) => ({ amountCents, vs: null, note: null, exempt: 'payroll', exemptNote: null, partyIban: null, ...fields })
  check(
    "a payroll payment's account: the Social Insurance Agency's sum, a health insurer's, the tax office's (also by its prefix), else wages",
    ledger.reasonAccount(pay(-lp.pays.social), [lp]) === '336.100' &&
      ledger.reasonAccount(pay(-lp.pays.health[0]), [lp]) === '336.200' &&
      ledger.reasonAccount(pay(-lp.tax), [lp]) === '342' &&
      ledger.reasonAccount(pay(-123, { partyIban: 'SK1981805002590123456789' }), [lp]) === '342' &&
      ledger.reasonAccount(pay(-s1.net), [lp]) === '331' &&
      ledger.reasonAccount(pay(-lp.pays.social), []) === '331' &&
      ledger.reasonAccount(pay(-lp.pays.social, { exempt: 'state', partyIban: 'SK7381800000007000155733' }), [lp]) === '336.100' &&
      ledger.reasonAccount(pay(-777, { exempt: 'state', partyIban: 'SK7381800000007000155733' }), [lp]) === null,
  )
  check('a birth day may be in the 1900s, a document\'s not', booking.dayOfText('1. 1. 1990', 1900) === '1990-01-01' && booking.dayOfText('1. 1. 1990') === null)
  const books = ledger.buildBooks({ company: { id: 'c', startOn: '2026-01-01', vatStatus: 'none' }, docs: [], payments: [], banks: [], filed: [], manual: [], payroll: [lp] })
  const entry = books.entries.find((e) => e.key === 'w:2026-09')
  check(
    "the month's entry on its last day: 521 against 331, the employee's insurance and tax from 331, the employer's 524",
    entry?.on === '2026-09-30' &&
      entry.kind === 'payroll' &&
      entry.lines.some((l) => l.md === '521' && l.d === '331' && l.cents === 160000) &&
      entry.lines.some((l) => l.md === '331' && l.d === '336.100' && l.cents === s1.socialEmployee) &&
      entry.lines.some((l) => l.md === '331' && l.d === '342' && l.cents === s1.withheld) &&
      entry.lines.some((l) => l.md === '524' && l.d === '336.100' && l.cents === s1.socialEmployer) &&
      entry.lines.some((l) => l.md === '524' && l.d === '336.200' && l.cents === s1.healthEmployer),
    JSON.stringify(entry),
  )

  // The deadlines
  const co = (fields = {}) => ({ id: 'c1', name: 'Firma', vatStatus: 'none', vatQuarterly: false, vatSince: null, startOn: '2026-01-01', createdAt: 0, endsOn: null, taxOffice: null, icdph: null, address: 'x', ...fields })
  const facts = (payroll) => ({ views: [], filed: [], paid: new Map(), filings: new Set(), closings: [], missing: new Map(), handover: 0, payroll })
  const run = (payroll, today, filings = new Set()) => dues.deadlinesOf(co(), { ...facts(payroll), filings }, today)
  const pf = (fields = {}) => ({ first: '2026-08-01', last: null, payday: 10, closed: new Map(), ...fields })
  let list = run(pf(), '2026-10-14')
  const find = (kind, period) => list.find((d) => d.kind === kind && d.period === period)
  check(
    'each month with employees closed by its payday, the next working day (10 October 2026 is a Saturday); the month that runs runs',
    find('payroll', '2026-09')?.day === '2026-10-12' && find('payroll', '2026-09')?.late && find('payroll', '2026-10')?.state === 'running' && find('payroll', '2026-08')?.state === 'open' && !find('payroll', '2026-07'),
    JSON.stringify(list),
  )
  list = run(pf({ closed: new Map([['2026-09', '2026-10-09']]) }), '2026-10-14')
  check('closed: done, by its own payday; its reports then to file', find('payroll', '2026-09')?.state === 'done' && find('payrollReports', '2026-09')?.state === 'open' && find('payrollReports', '2026-09')?.day === '2026-10-09')
  list = run(pf({ closed: new Map([['2026-09', '2026-10-09']]) }), '2026-10-14', new Set(['mz:2026-09']))
  check('a manual payroll marker never proves acceptance', find('payrollReports', '2026-09')?.state === 'open' && find('payrollReports', '2026-09')?.deliveryStatus === 'unverified')
  list = run(pf({ last: '2026-08-31' }), '2026-10-14')
  check('nothing after the last employee left', !find('payroll', '2026-09') && Boolean(find('payroll', '2026-08')))
  check('a company without employees has no payroll', !dues.deadlinesOf(co(), facts(undefined), '2026-10-14').some((d) => d.kind === 'payroll'))
  list = run(pf({ closed: new Map([['2026-09', '2026-10-09']]) }), '2026-10-05')
  check(
    "a closed month's wages and levies are the client's to pay by its payday, and the app leads to the message with the sums",
    find('payrollPay', '2026-09')?.day === '2026-10-09' && dues.DUE_SIDE.payrollPay === 'client' &&
      deadlines.clientDeadlines(co(), list, '2026-10-05', new Map()).some((d) => d.href === '/app/spravy' && d.label.replace(/\s/g, ' ') === 'Zaplatiť výplaty a odvody za september 2026'),
  )
  list = run(pf({ closed: new Map([['2026-09', '2026-10-09']]) }), '2026-10-14')
  check('once its payday has passed it is no longer listed (the bank is not read for it)', !find('payrollPay', '2026-09'))
}

// Full payroll (17 October 2026): every relationship's insurance, sick pay, the month's parts, the average earnings.
{
  const slip = (fields) => payroll.payslip({ period: '2026-10', gross: 100000, declaration: false, children: [], disabled: false, healthDeduction: false, healthMinimumExempt: false, days: 31, ...fields })
  const sum = (o) => Object.values(o).reduce((s, v) => s + v, 0)
  let s = slip({ gross: 50000, contract: 'dovp', regular: false })
  check(
    'an agreement with an irregular income: 7 % and 22,8 %, old age and disability, the employer adding guarantee, accident and the reserve fund; health 5 % and 11 %',
    s.socialEmployee === 3500 && s.socialEmployer === 11400 && s.social.employer.guarantee === 125 && s.social.employer.accident === 400 && s.social.employee.sickness === undefined && s.healthEmployee === 2500 && s.healthEmployer === 5500,
    JSON.stringify(s.social),
  )
  s = slip({ contract: 'director', regular: false })
  check("a director's irregular remuneration: 7 % and 21,75 %, no accident and no guarantee insurance", s.socialEmployee === 7000 && s.socialEmployer === 21750 && s.social.employer.accident === undefined && s.social.employer.guarantee === undefined)
  s = slip({ contract: 'director', regular: true })
  check("a director's regular remuneration: 9,4 % and 24,15 %, the employer's unemployment insurance 1 % whole, no support in short-time work", s.socialEmployee === 9400 && s.socialEmployer === 24150 && s.social.employer.unemployment === 1000 && s.social.employer.support === undefined)
  s = slip({ gross: 30000, contract: 'dobps', exemption: true })
  check(
    "a student's agreement with the deduction (200 € in 2026): pension insurance and the reserve fund from 100 €, accident and guarantee from 300 €; no health insurance",
    s.exemption === 20000 && s.pensionBase === 10000 && s.socialEmployee === 700 && s.socialEmployer === 1400 + 300 + 475 + 240 + 75 && s.healthEmployee === 0 && s.healthEmployer === 0 && s.healthInsured === false,
    JSON.stringify(s.social),
  )
  s = slip({ gross: 15000, contract: 'dobps', exemption: true })
  check('below the deduction only accident and guarantee insurance, rounded down each', s.socialEmployee === 0 && s.socialEmployer === 120 + 37)
  s = slip({ period: '2027-01', gross: 30000, contract: 'dobps', exemption: true })
  check('the deduction is 300 € from 2027', s.exemption === 30000 && s.socialEmployee === 0)
  check('a pensioner on an agreement claims the deduction with an irregular income too (the table of agreements, section 7)', slip({ gross: 40000, contract: 'dovp', regular: false, pension: 'old', exemption: true }).exemption === 20000 && slip({ gross: 40000, contract: 'dovp', regular: false, pension: 'old', exemption: true }).socialEmployee === 800)
  s = slip({ gross: 40000, contract: 'dovp', regular: true, pension: 'old', exemption: true })
  check(
    'an old-age pensioner on an agreement with a regular income: neither sickness, unemployment nor disability insurance, the deduction off the base, no health insurance',
    s.social.employee.disability === undefined && s.socialEmployee === 800 && s.socialEmployer === 2800 + 950 + 320 + 100 && s.healthEmployee === 0,
    JSON.stringify(s.social),
  )
  s = slip({ contract: 'employment', pension: 'old' })
  check(
    'an old-age pensioner in employment: no disability and no unemployment insurance, the support in short-time work kept (the Agency, 27 April 2022), health as anybody',
    s.socialEmployee === 1400 + 4000 && s.socialEmployer === 1400 + 14000 + 500 + 250 + 800 + 4750 && s.social.employer.unemployment === undefined && s.healthEmployee === 5000,
    JSON.stringify(s.social),
  )
  s = slip({ contract: 'employment', pension: 'invalid70' })
  check('a disability pension above 70 %: no unemployment insurance, disability insurance and the support kept', s.social.employee.unemployment === undefined && s.social.employer.unemployment === undefined && s.social.employer.support === 500 && s.social.employee.disability === 3000)
  s = slip({ contract: 'employment', pension: 'service' })
  check('a service pension after the retirement age: no disability insurance, unemployment insurance kept', s.social.employee.disability === undefined && s.social.employer.disability === undefined && s.social.employee.unemployment === 1000 && s.social.employer.unemployment === 500 && s.social.employer.support === 500)
  s = slip({ contract: 'dovp', regular: true })
  check('a regular agreement: the employer\'s unemployment insurance whole, 1 %, no support in short-time work', s.social.employer.unemployment === 1000 && s.social.employer.support === undefined && s.socialEmployer === 1400 + 14000 + 3000 + 1000 + 250 + 800 + 4750)
  s = slip({ gross: 40000, contract: 'dobps', regular: true })
  check("a student's agreement with a regular income: insured as an irregular one, only its report differs", s.regular === true && s.social.employee.sickness === undefined && s.socialEmployee === 1600 + 1200 && s.healthInsured === false)
  s = slip({ contract: 'employment', exemption: true })
  check('the deduction is no employment\'s', s.exemption === 0 && s.socialEmployee === 9400)
  s = slip({ contract: 'dopc', regular: true, pension: 'invalid', exemption: true, gross: 30000 })
  check('a disability pensioner on an agreement keeps disability insurance; no sickness and no health insurance (VšZP: any pension of old age, disability or service)', s.healthInsured === false && s.healthEmployee === 0 && s.socialEmployee === 400 + 300 && s.social.employee.sickness === undefined, JSON.stringify(s.social))
  check('a pensioner pays no minimum health advance: the state insures him too', slip({ gross: 20000, contract: 'employment', pension: 'old' }).healthTopUp === 0 && slip({ gross: 20000, contract: 'employment' }).healthTopUp > 0)
  {
    const three = slip({ gross: 60000, declaration: true, children: [{ name: 'A', born: '2016-01-01' }, { name: 'B', born: '2018-01-01' }, { name: 'C', born: '2020-01-01' }] })
    check('each child\'s bonus makes the whole bonus to the cent', three.bonusByChild.reduce((sum, c) => sum + c.amount, 0) === three.bonus && three.bonus > 0, JSON.stringify({ bonus: three.bonus, by: three.bonusByChild }))
  }
  s = slip({ gross: 150000, sickPay: 34000, declaration: true })
  check(
    'sick pay is taxed with the wage and is no assessment base',
    s.socialBase === 150000 && s.partialBase === 150000 + 34000 - 14100 - 7500 && s.net === 150000 + 34000 - 14100 - 7500 - s.withheld && s.employerCost === 150000 + 34000 + s.socialEmployer + s.healthEmployer,
  )
  check('the minimum health advance counts only the days the state does not pay for', slip({ gross: 5000, minimumDays: 15 }).healthTopUp === 2199 - 800 && slip({ gross: 5000 }).healthTopUp === 4545 - 800)

  check('the most a daily base may be: twice the general assessment base of two years before, a day of 365, four decimals down', payMonth.dailyBaseCap(2026) === 1002082 && payMonth.dailyBaseCap(2027) === 1065205)
  const leave = (from, to, dvz, id = 'l1') => ({ id, employeeId: 'e1', from, to, dvz })
  let m = payMonth.sickMonth('2026-10', [leave('2026-10-05', '2026-10-20', 500000)], '2026-01-01', null)
  check(
    'sick pay of a leave: days 1 to 3 at 25 %, 4 to 14 at 55 %, from the 15th the Agency pays; its weekdays lower the wage',
    m.days === 16 && m.parts[0].days25 === 3 && m.parts[0].days55 === 11 && m.benefitDays === 2 && m.amount === 34000 && m.weekdays === 12 && m.workdays === 12,
    JSON.stringify(m),
  )
  m = payMonth.sickMonth('2026-10', [leave('2026-09-28', '2026-10-03', 400000)], '2026-01-01', null)
  check('a leave over the month\'s start counts its days from its first day', m.days === 3 && m.parts[0].days55 === 3 && m.amount === 6600)
  m = payMonth.sickMonth('2026-10', [leave('2026-10-01', '2026-10-01', 333333)], '2026-01-01', null)
  check('the sum is rounded up to the cent', m.amount === 834)
  m = payMonth.sickMonth('2026-10', [leave('2026-10-01', '2026-10-01', 2000000)], '2026-01-01', null)
  check('a daily base above the most is capped', m.parts[0].dvz === 1002082)
  m = payMonth.sickMonth('2026-10', [leave('2026-10-10', null, null)], '2026-01-01', null)
  check('a leave that lasts runs to the month\'s end; without a daily base it waits', m.days === 22 && m.missing.join() === 'l1' && m.amount === 0)
  m = payMonth.sickMonth('2026-10', [leave('2026-10-10', null, 500000)], '2026-01-01', '2026-10-15')
  check('only the days of the employment count', m.days === 6)

  const closed = (period, sicknessBase, fields = {}) => ({ period, sicknessBase, earned: sicknessBase, worked: 16800, sickDays: 0, ...fields })
  const jan_may = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05'].map((p) => closed(p, 150000))
  let d = payMonth.proposeDvz({ from: '2026-06-10' }, '2026-01-01', jan_may)
  check('the daily base proposed: from the start of the insurance in the year to the end of the month before, its days', d.dvz === 496688 && d.from === '2026-01-01' && d.to === '2026-05-31' && d.days === 151, JSON.stringify(d))
  d = payMonth.proposeDvz({ from: '2026-06-10' }, '2026-01-01', jan_may.filter((x) => x.period !== '2026-03'))
  check('a month of it not closed here: the accountant gives it', d.dvz === null && d.reason === 'missing' && d.month === '2026-03')
  d = payMonth.proposeDvz({ from: '2026-06-10' }, '2026-05-01', jan_may)
  check('fewer than 90 days of insurance: the period reaches the open month, so the accountant gives it', d.dvz === null && d.reason === 'short')
  const y2026 = Array.from({ length: 10 }, (_, i) => closed(`2026-${String(i + 3).padStart(2, '0')}`, 200000, i === 4 ? { sickDays: 5 } : {}))
  d = payMonth.proposeDvz({ from: '2027-02-01' }, '2026-03-01', y2026)
  check('insured since the year before: from its start to that year\'s end, less the days of incapacity', d.dvz === 664451 && d.from === '2026-03-01' && d.to === '2026-12-31' && d.days === 301, JSON.stringify(d))

  const terms = (fields = {}) => ({ contract: 'employment', regular: true, wageKind: 'monthly', wage: 150000, dailyHours: 800, startedOn: '2026-01-01', endedOn: null, ...fields })
  check('the quarter before a month', payMonth.quarterBefore('2026-01').join() === '2025-10,2025-11,2025-12' && payMonth.quarterBefore('2026-05').join() === '2026-01,2026-02,2026-03' && payMonth.quarterBefore('2026-07').join() === '2026-04,2026-05,2026-06')
  let a = payMonth.proposeAverage('2026-07', terms(), ['2026-04', '2026-05', '2026-06'].map((p) => closed(p, 160000)))
  check('the average earnings: the quarter\'s wage by its hours, four decimals up', a.source === 'quarter' && a.average === 95239)
  a = payMonth.proposeAverage('2026-10', terms(), [])
  check('without 21 days worked in the quarter: the probable earnings, the monthly wage by the month\'s working hours', a.source === 'probable' && a.average === 85228)
  check(
    'an hourly wage is its own probable earnings; never below the minimum wage for an hour (5,259 € in 2026)',
    payMonth.proposeAverage('2026-10', terms({ wageKind: 'hourly', wage: 800 }), []).average === 80000 && payMonth.proposeAverage('2026-10', terms({ wage: 50000 }), []).average === 52590 && payroll.minimumHourly(payroll.payrollYear(2026)) === 5259,
  )

  const none = payMonth.sickMonth('2026-10', [], '2026-01-01', null)
  const parts = (fields = {}) => ({ ...payMonth.EMPTY_PARTS, ...fields })
  let p = payMonth.monthPay('2026-10', terms(), parts(), none, 95239)
  check('a whole month: the wage, its working hours', p.wage === 150000 && p.gross === 150000 && p.worked === 17600 && p.weekdays === 22 && p.issues.length === 0)
  const sick = payMonth.sickMonth('2026-10', [leave('2026-10-05', '2026-10-20', 500000)], '2026-01-01', null)
  p = payMonth.monthPay('2026-10', terms(), parts({ holidayDays: 200 }), sick, 95239)
  check(
    'two days of holiday and a sick leave: the wage lowered by their weekdays, holiday pay at the average earnings, the sick pay beside the base',
    p.wage === 54545 && p.holiday === 15238 && p.sick === 34000 && p.gross === 54545 + 15238 && p.earned === 54545 && p.worked === (22 - 14) * 800,
    JSON.stringify(p),
  )
  p = payMonth.monthPay('2026-10', terms(), parts({ overtimeHours: 1000, nightHours: 800, saturdayHours: 800, sundayHours: 400, holidayWorkHours: 800 }), none, 95239)
  check(
    'overtime: its wage and 25 % of the average earnings; night 40 %, Saturday 50 %, Sunday 100 % of the minimum wage for an hour; a public holiday 100 % of the average',
    p.overtime === 10904 && p.surcharges === 13509 && p.worked === 17600 + 1000,
    JSON.stringify(p),
  )
  p = payMonth.monthPay('2026-12', terms({ wageKind: 'hourly', wage: 800 }), parts(), payMonth.sickMonth('2026-12', [], '2026-01-01', null), 80000)
  check('an hourly wage: the working days\' hours, and its public holidays at the average earnings (24 and 25 December 2026)', p.wage === 134400 && p.publicHolidays === 12800 && p.worked === 16800, JSON.stringify(p))
  p = payMonth.monthPay('2026-10', terms({ contract: 'dovp', regular: false, wage: 0 }), parts({ wage: 50000, hours: 2000, holidayDays: 200, overtimeHours: 500 }), none, 52590)
  check('an agreement: the reward typed and its hours; no holiday, no overtime', p.wage === 50000 && p.worked === 2000 && p.holiday === 0 && p.overtime === 0 && p.gross === 50000)
  p = payMonth.monthPay('2026-10', terms({ contract: 'director', regular: false, wage: 100000 }), parts({ bonus: 20000, nightHours: 800 }), none, 52590)
  check("a director's remuneration as agreed, a bonus, no surcharge", p.wage === 100000 && p.gross === 120000 && p.surcharges === 0)
  p = payMonth.monthPay('2026-10', terms(), parts({ holidayDays: 2500 }), none, 95239)
  check('absences longer than the working time keep the month back', p.issues.includes('absence'))
  p = payMonth.monthPay('2026-10', terms(), parts(), payMonth.sickMonth('2026-10', [leave('2026-10-10', null, null)], '2026-01-01', null), 95239)
  check('so does a sick leave without a daily base', p.issues.includes('sickBase'))
  check(
    'the holiday a year: 20 days, 25 from the year the person turns 33',
    payMonth.leaveEntitlement('1995-03-01', 2026) === 2000 && payMonth.leaveEntitlement('1993-12-31', 2026) === 2500 && payMonth.leaveEntitlement(null, 2026) === 2000,
  )

  check(
    'hours, days and average earnings as typed and written',
    payrollForm.hundredthsOf('7,5') === 750 && payrollForm.hundredthsOf('0.25') === 25 && payrollForm.hundredthsOf('') === null && Number.isNaN(payrollForm.hundredthsOf('x')) &&
      payrollForm.hundredthsText(750) === '7,5' && payrollForm.hundredthsText(800) === '8' && payrollForm.hundredthsText(5) === '0,05' &&
      payrollForm.tenThousandthsOf('9,1234') === 91234 && payrollForm.tenThousandthsOf('45 €') === 450000 && payrollForm.tenThousandthsText(91234) === '9,1234',
  )
  const read = payrollForm.readParts({ mzda_e1: '1500,00', dovolenka_e1: '1,5', nadcas_e1: 'veľa', odmena_e1: '200' }, 'e1', 'employment', 'monthly', 150000)
  check('the parts read: the agreed wage kept as agreed, days in hundredths, a wrong figure said under its field', read.parts.wage === null && read.parts.holidayDays === 150 && read.parts.bonus === 20000 && read.errors.nadcas_e1 === 'hours')
  check(
    'the parts each relationship has',
    payrollForm.partsFor('director', 'monthly').join() === 'wage,bonus,other' && payrollForm.partsFor('dovp', 'hourly')[0] === 'hours' && !payrollForm.partsFor('dopc', 'monthly').includes('holidayDays') && payrollForm.partsFor('employment', 'monthly').includes('overtimeHours'),
  )

  const employee = (fields = {}) => ({ id: 'e1', name: 'Ján', bornOn: null, insurer: '25', startedOn: '2026-01-01', endedOn: null, wage: 150000, declaration: true, disabled: false, healthDeduction: false, healthExempt: false, children: [], iban: null, contract: 'employment', regular: true, pension: 'none', exemption: false, wageKind: 'monthly', weeklyHours: 4000, leaveDays: null, ...fields })
  const runs = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05'].map((period) => ({ period, payday: null, closedOn: `${period}-28`, closedByName: null, lines: payrollStore.monthSlips(period, [employee()], null).map(payrollStore.storedLine) }))
  const june = payrollStore.monthSlips('2026-06', [employee(), employee({ id: 'e2', name: 'Eva', contract: 'director', regular: false, wage: 80000 })], null, { leaves: [leave('2026-06-10', '2026-06-12', null)], runs })
  const jan = june.find((l) => l.employeeId === 'e1')
  check(
    "an open month with a sick leave: the daily base proposed from the closed months, sick pay on the slip, the proposals beside it",
    jan.proposals.dvz.l1.dvz === 496688 && jan.sick.amount === Math.ceil((496688 * 75) / 10000) && jan.slip.sickPay === jan.sick.amount && jan.pay.wage < 150000,
    JSON.stringify(jan.sick),
  )
  const lpJune = payrollStore.ledgerPayroll({ period: '2026-06', payday: null, closedOn: '2026-07-01', closedByName: null, lines: june.map(payrollStore.storedLine) })
  check(
    "the month's costs by account: wages 521, a director's remuneration 523, sick pay 527",
    lpJune.costs.find((x) => x.account === '523')?.cents === 80000 && lpJune.costs.find((x) => x.account === '527')?.cents === jan.sick.amount && lpJune.gross === lpJune.costs.reduce((t, x) => t + x.cents, 0),
    JSON.stringify(lpJune.costs),
  )
  check('a stored line keeps no proposal', !('proposals' in payrollStore.storedLine(jan)))
  const regs = registrations.registrationDues([{ id: 's', name: 'Študent', insurer: '25', startedOn: '2026-10-01', endedOn: '2026-10-31', health: false }], '2026-01-01', null, new Map(), '2026-10-01')
  check('a person the state insures: registered with the Social Insurance Agency only', regs.length === 3 && regs.every((r) => r.agency === 'social'), JSON.stringify(regs))
  check(
    "a change of a sick leave never reaches a closed month",
    payrollStore.leaveTouchesClosed(null, leave('2026-05-10', '2026-05-12', 500000), runs, employee()) &&
      !payrollStore.leaveTouchesClosed(null, leave('2026-06-10', '2026-06-12', 500000), runs, employee()) &&
      !payrollStore.leaveTouchesClosed(leave('2026-05-28', null, 500000), leave('2026-05-28', '2026-06-03', 500000), runs, employee()) &&
      payrollStore.leaveTouchesClosed(leave('2026-05-28', null, 500000), leave('2026-05-28', '2026-05-30', 500000), runs, employee()),
  )
}

// The annual settlement (17 October 2026): the year's tax, its non-taxable parts, the bonus, what is settled.
{
  const y = payroll.payrollYear(2026)
  check('the year\'s tax by the bands of 2026: 19 % to 43 983,32 €, 25 % above', taxSettlement.yearTax(3000000, y) === 570000 && taxSettlement.yearTax(5000000, y) === 986100)
  check(
    "the taxpayer's part: whole to 26 083,13 €, then 14 661,11 € less a third of the base, nought from 43 983,32 €; a pension comes off it",
    taxSettlement.taxpayerPart(2000000, y) === 596673 && taxSettlement.taxpayerPart(3000000, y) === 466111 && taxSettlement.taxpayerPart(4400000, y) === 0 && taxSettlement.taxpayerPart(2000000, y, 100000) === 496673,
  )
  check(
    "the spouse's part: 5 455,30 € less the spouse's income, a twelfth a month; above 43 983,32 € 20 116,40 € less a third of the base",
    taxSettlement.spousePart(2000000, y, 12, 100000) === 445530 && taxSettlement.spousePart(2000000, y, 6, 100000) === 222765 && taxSettlement.spousePart(5000000, y, 12, 0) === 344973 && taxSettlement.spousePart(2000000, y, 0, 0) === 0,
  )
  const child = [{ name: 'TEST', born: '2020-05-01' }]
  const all = Array.from({ length: 12 }, (_, i) => i + 1)
  check(
    "the year's bonus: each month 100 € at most 29 % of a twelfth of the base, lowered by a tenth of the base above 27 432 €",
    taxSettlement.yearBonus(2000000, y, child, all).total === 120000 && taxSettlement.yearBonus(300000, y, child, all).total === 87000 && taxSettlement.yearBonus(3000000, y, child, all).total === 94320 && taxSettlement.yearBonus(4000000, y, child, all).total === 0 && taxSettlement.yearBonus(2000000, y, child, [3, 4]).total === 20000,
  )
  const here = { taxable: 1800000, insurance: 259200, advance: 179388, bonus: 120000, months: all.map((m) => `2026-${String(m).padStart(2, '0')}`) }
  let r = taxSettlement.settle(2026, here, child, { ...taxSettlement.EMPTY_SETTLEMENT, requested: true })
  check(
    'a whole year here: the base, the tax, the advances, the bonus as paid; a few cents back',
    r.partialBase === 1540800 && r.nonTaxable.taxpayer === 596673 && r.taxBase === 944127 && r.tax === 179384 && r.taxDifference === -4 && r.bonus === 120000 && r.bonusDifference === 0,
    JSON.stringify(r),
  )
  r = taxSettlement.settle(2026, { ...here, months: here.months.slice(6) }, child, { ...taxSettlement.EMPTY_SETTLEMENT, requested: true, other: { taxable: 600000, insurance: 86400, advance: 40000, bonus: 0, months: 6 }, spouseMonths: 12, spouseIncome: 0, dds: 30000 })
  check(
    'with an employer before, the spouse and supplementary pension saving: the bonus for the months before too, a refund, the bonus owed paid',
    r.taxable === 2400000 && r.nonTaxable.spouse === 545530 && r.nonTaxable.dds === 18000 && r.taxDifference < 0 && r.bonus === 120000 && r.bonusDifference === 0,
    JSON.stringify(r),
  )
  check('stored inputs read back: wrong figures are nought', JSON.stringify(taxSettlement.settlementInputsOf({ requested: true, dds: -5, other: { months: 13 }, settleIn: '2027-3' })) === JSON.stringify({ ...taxSettlement.EMPTY_SETTLEMENT, requested: true }))
  const employee = { id: 'e1', name: 'Ján', bornOn: null, insurer: '25', startedOn: '2026-01-01', endedOn: null, wage: 150000, declaration: true, disabled: false, healthDeduction: false, healthExempt: false, children: [], iban: null, contract: 'employment', regular: true, pension: 'none', exemption: false, wageKind: 'monthly', weeklyHours: 4000, leaveDays: null }
  const march = payrollStore.monthSlips('2027-03', [employee], null, { settlements: [{ employeeId: 'e1', year: 2026, inputs: { requested: true, settleIn: '2027-03' }, result: { taxDifference: -12000, bonusDifference: 5000 } }] })[0]
  check(
    'a settlement settled with a month: the refund and the bonus paid out with the wage, the remittance lowered by them',
    march.slip.settlementTax === -12000 && march.slip.settlementBonus === 5000 && march.slip.net === march.slip.gross - march.slip.socialEmployee - march.slip.healthEmployee - march.slip.withheld + 12000 + 5000 && payrollStore.runTotals([march]).tax === march.slip.withheld - 12000 - 5000,
  )
  const lines = JSON.stringify([{ employeeId: 'e1', gross: march.gross, slip: march.slip }])
  const totals = prehladUnit.prehladTotals('2027-03', [{ id: 'c', period: '2027-03', report_period: '2027-03', paid_on: '2027-04-10', lines }], '2027-04-20')
  check('the overview: row 02 the refund, the bonus of the settlement with the month\'s in row 05', totals.issues.length === 0 && totals.settlement === -12000 && totals.bonus === 5000 && totals.bonusFromTax === totals.advance - 12000 && totals.bonusOwn === 5000 - (totals.advance - 12000), JSON.stringify(totals))
  const big = JSON.stringify([{ employeeId: 'e1', gross: march.gross, slip: payroll.payslip({ period: '2027-03', gross: 150000, declaration: true, children: [], disabled: false, healthDeduction: false, healthMinimumExempt: false, days: 31, settlement: { tax: -50000, bonus: 0 } }) }])
  const capped = prehladUnit.prehladTotals('2027-03', [{ id: 'c', period: '2027-03', report_period: '2027-03', paid_on: '2027-04-10', lines: big }], '2027-04-20')
  check('a refund above the advances: row 02 down to them, the rest the employer pays and asks the tax office for', capped.settlement === -capped.advance && capped.settlementOwn === 50000 - capped.advance)
}

// Income tax advances (Act 595/2003 s. 42(1), (2), (7)): from the month after the return's filing deadline, by the end
// of each month or calendar quarter, moved to the next working day; the client's to pay, shown before its day.
{
  const k = (kind, each = 150000, fields = {}) => ({ year: 2026, filed: true, extendedTo: null, payCents: 0, dueOn: null, paid: 0, advances: { kind, each }, ...fields })
  check('quarterly: the end of the next calendar quarter after the deadline', dues.nextTaxAdvance([k('quarterly')], '2027-04-10')?.day === '2027-06-30')
  check('monthly: the end of this month', dues.nextTaxAdvance([k('monthly')], '2027-04-10')?.day === '2027-04-30')
  check('before the filing deadline, the first is the month after it', dues.nextTaxAdvance([k('monthly')], '2027-03-10')?.day === '2027-04-30')
  check('a month that ends on a Saturday moves to Monday', dues.nextTaxAdvance([k('monthly')], '2027-07-15')?.day === '2027-08-02')
  check('a deadline moved by a notice moves the first advance (31 July 2027 is a Saturday)', dues.nextTaxAdvance([k('monthly', 150000, { extendedTo: '2027-06-30' })], '2027-04-10')?.day === '2027-08-02')
  check('none past the next filing deadline, none for a return that asks for none, none before it is filed', dues.nextTaxAdvance([k('monthly')], '2028-04-15') === null && dues.nextTaxAdvance([k('none', 0)], '2027-04-10') === null && dues.nextTaxAdvance([k('monthly', 150000, { filed: false })], '2027-04-10') === null)
  const company = { id: 'c1', name: 'Firma', vatStatus: 'none', vatQuarterly: false, vatSince: null, startOn: '2026-01-01', createdAt: 0, endsOn: null, taxOffice: null, icdph: null, address: 'x' }
  const list = dues.deadlinesOf(company, { views: [], filed: [], paid: new Map(), filings: new Set(), closings: [k('quarterly')], missing: new Map(), handover: 0 }, '2027-04-10')
  const advance = list.find((d) => d.kind === 'taxAdvance')
  check(
    "it is the client's to pay, with its amount, and the client's app says so",
    advance?.day === '2027-06-30' && advance.cents === 150000 && dues.DUE_SIDE.taxAdvance === 'client' && !dues.pressing(list, '2027-06-28').some((d) => d.kind === 'taxAdvance') &&
      deadlines.clientDeadlines(company, list, '2027-04-10', new Map()).some((d) => d.label.replace(/\s/g, ' ') === 'Zaplatiť preddavok na daň z príjmov' && d.href === '/app/dane' && d.state.replace(/\s/g, ' ').includes('1 500,00')),
    JSON.stringify(advance),
  )
}

// Registrations with the Social Insurance Agency and the health insurers (Act 461/2003 s. 231(1)(a), (b); Act 580/2004
// s. 24(1)(c), (k)): the day before the first one starts, before an employee starts, eight days or eight working days.
{
  const ana = { id: 'e1', name: 'Ana Nová', insurer: '25', startedOn: '2027-02-01', endedOn: null }
  const ben = { id: 'e2', name: 'Ben Starý', insurer: '24', startedOn: '2026-05-01', endedOn: '2027-03-15' }
  const all = registrations.registrationDues([ana, ben], '2027-01-01', null, new Map(), '2027-01-20')
  const at = (key) => all.find((r) => r.key === key)?.day
  check(
    'an employee who starts while the contract is ours: registered the day before, the insurer told within eight working days',
    at('e1:in:social') === '2027-01-31' && at('e1:in:health') === '2027-02-11' && at('employer:health:25') === '2027-02-11',
    JSON.stringify(all),
  )
  check(
    'one who started before the contract was the former accountant\'s; leaving under us is ours: eight days, eight working days',
    !at('e2:in:social') && !at('e2:in:health') && !at('employer:health:24') && !at('employer:social') && at('e2:out:social') === '2027-03-23' && at('e2:out:health') === '2027-03-25',
  )
  const first = registrations.registrationDues([ana], '2027-01-01', null, new Map(), '2027-01-20')
  check('the company that employs for the first time registers as an employer the day before', first.find((r) => r.key === 'employer:social')?.day === '2027-01-31')
  check('nothing after the contract has ended is ours', registrations.registrationDues([ana], '2026-01-01', '2027-01-31', new Map(), '2027-01-20').length === 0)
  check('working days skip weekends and Slovak days off', registrations.workingDaysAfter('2026-12-30', 2) === '2027-01-04')
  const marked = registrations.registrationDues([ana], '2027-01-01', null, new Map([['e1:in:social', '2027-01-20']]), '2027-01-20')
  check('a registration recorded as filed is done', marked.find((r) => r.key === 'e1:in:social')?.done === true && marked.find((r) => r.key === 'e1:in:health')?.done === false)
  check(
    'done ones leave a month after their day, or after they were recorded when that was later',
    !registrations.registrationDues([ana], '2027-01-01', null, new Map([['e1:in:social', '2027-01-30']]), '2027-03-15').some((r) => r.key === 'e1:in:social') &&
      registrations.registrationDues([ana], '2027-01-01', null, new Map([['e1:in:social', '2027-03-10']]), '2027-03-15').some((r) => r.key === 'e1:in:social' && r.done),
  )
  const company = { id: 'c1', name: 'Firma', vatStatus: 'none', vatQuarterly: false, vatSince: null, startOn: '2027-01-01', createdAt: 0, endsOn: null, taxOffice: null, icdph: null, address: 'x' }
  const facts = { views: [], filed: [], paid: new Map(), filings: new Set(), closings: [], missing: new Map(), handover: 0, employees: [ana], registered: new Map() }
  const list = dues.deadlinesOf(company, facts, '2027-01-28')
  const reg = list.filter((d) => d.kind === 'registration')
  check(
    'they are deadlines of ours, pressing within a week, and lead to the payroll page',
    reg.length === 4 && dues.pressing(list, '2027-01-28').some((d) => d.registration?.key === 'e1:in:social') &&
      dueViews.dueHref({ kind: 'registration', period: null, company: { id: 'c1', vatStatus: 'none' } }) === '/ucto/klienti/c1/mzdy#prihlasenia' &&
      dueViews.dueWhat({ kind: 'registration', period: null, fix: null, registration: reg.find((d) => d.registration?.key === 'e1:in:health')?.registration, company: { vatStatus: 'none' } }).includes('VšZP: Ana Nová'),
    JSON.stringify(reg.map((d) => `${d.registration?.key}:${d.day}:${d.state}`)),
  )
}

// Continuous locks: strict month parsing, completed periods, direction, reason and full/partial reopening.
{
  const pick = (action, month, reason = '') => periods.lockTarget({ action, month, reason }, '2026-09-30', '2026-10-15', '2026-01-01')
  check('the current month cannot be locked', 'error' in pick('lock', '2026-10'))
  check('a completed later year can be locked through December', periods.lockTarget({ action: 'lock', month: '2025-12', reason: '' }, null, '2026-10-15').through === '2025-12-31')
  check('an already locked month does not hide a stale intent', 'error' in pick('lock', '2026-09'))
  check('reopening needs a meaningful reason', 'error' in pick('open', '2026-09', 'oprava'))
  check('partial reopening keeps earlier months locked', pick('open', '2026-09', 'Oprava nesprávneho účtu').through === '2026-08-31')
  check('reopening from the start removes the whole lock', pick('open', '2026-01', 'Oprava počiatočných stavov').through === null)
  check('reopening across New Year keeps the previous December', periods.lockTarget({ action: 'open', month: '2026-01', reason: 'Oprava účtovania januára' }, '2026-02-28', '2026-10-15', '2025-01-01').through === '2025-12-31')
  check('invalid and out-of-range months are rejected', ['2026-00', '2026-13', '2026-9', '2026-Q3', '2026-09extra', '0000-01'].every((month) => 'error' in pick('lock', month)))
  check('unknown actions are rejected', 'error' in pick('erase', '2026-09'))
  check('an open future month cannot be reopened', 'error' in pick('open', '2026-10', 'Oprava budúceho mesiaca'))
  check('the lock cannot precede the books', 'error' in periods.lockTarget({ action: 'lock', month: '2025-12', reason: '' }, null, '2026-10-15', '2026-01-01'))
  check('wrapped D1 lock errors are recognized without exposing SQL', periods.isPeriodLocked({ cause: new Error('D1_ERROR: FIRMONY_PERIOD_LOCKED: SQLITE_CONSTRAINT') }) && !periods.isPeriodLocked(new Error('other error')))
  const issues = { unbooked: ['old', 'future', 'undated'], noEntry: ['old'], classify: ['p1'], waiting: ['p1'], missing: ['p2'], foreign: [] }
  const b = { start: '2026-01-01', issues, docDays: new Map([['old', '2026-09-01'], ['future', '2026-10-01']]), payments: new Map([['p1', { bookedOn: '2026-09-30' }], ['p2', { bookedOn: '2026-10-01' }]]) }
  const blocked = periods.lockBlockers(b, '2026-09-30')
  check('readiness counts only protected dates, deduplicates and includes undated documents', blocked.documents === 2 && blocked.payments === 1)
  const pay = { amountCents: -12345, vs: null, note: null, exempt: 'payroll', exemptNote: null, contra: null, bookedOn: '2026-09-30' }
  const run = { period: '2026-10', pays: { social: 12345, health: [], tax: 0 } }
  check('a later closed payroll cannot reclassify an earlier payment', ledger.paymentContra(pay, [run]) === '331' && ledger.paymentContra({ ...pay, bookedOn: '2026-10-31' }, [run]) === '336.100')
}

// Response clocks preserve local time across weekends, holidays and both daylight-saving changes.
{
  const cases = [
    ['2026-10-15T08:20:30Z', '2026-10-16T08:20:30Z', 'ordinary next working day'],
    ['2026-10-16T08:20:30Z', '2026-10-19T08:20:30Z', 'Friday to Monday'],
    ['2026-10-17T20:15:00Z', '2026-10-19T20:15:00Z', 'weekend arrival'],
    ['2026-10-18T22:30:00Z', '2026-10-19T22:30:00Z', 'UTC Sunday is already Monday in Bratislava'],
    ['2026-10-23T08:00:00Z', '2026-10-26T09:00:00Z', 'autumn DST keeps 10:00 local'],
    ['2026-03-27T09:00:00Z', '2026-03-30T08:00:00Z', 'spring DST keeps 10:00 local'],
    ['2026-04-02T08:00:00Z', '2026-04-07T08:00:00Z', 'Good Friday and Easter Monday'],
    ['2026-05-07T08:00:00Z', '2026-05-08T08:00:00Z', '8 May is a working day in 2026'],
    ['2027-05-07T08:00:00Z', '2027-05-10T08:00:00Z', 'May 2027 weekend'],
    ['2026-09-14T08:00:00Z', '2026-09-15T08:00:00Z', '15 September exception in 2026'],
    ['2027-09-14T08:00:00Z', '2027-09-16T08:00:00Z', '15 September off in 2027'],
    ['2026-12-23T09:00:00Z', '2026-12-28T09:00:00Z', 'Christmas holidays and weekend'],
    ['2026-12-31T22:59:59Z', '2027-01-04T22:59:59Z', 'year end at local 23:59:59'],
    ['2026-11-16T09:00:00Z', '2026-11-17T09:00:00Z', '17 November is a working day'],
  ]
  for (const [from, expected, name] of cases) check(`support: ${name}`, new Date(support.responseDueAt(Date.parse(from) / 1000) * 1000).toISOString() === expected.replace('Z', '.000Z'))
  let refused = false
  try { support.responseDueAt(Number.NaN) } catch { refused = true }
  check('support: an invalid clock is refused', refused)
}

// Authentication boundaries are independent of the route's tenant authorization.
{
  check('return addresses reject external, normalized external and non-application destinations', ['//evil.example/ucto', '/\\\\evil.example/ucto', 'https://firmony.ai/app', '/auth/grants', '/application', '/ucto-other'].every((s) => security.safeNext(s) === '/app'))
  check('return addresses preserve valid internal paths and queries', security.safeNext('/ucto/klienti/x?rok=2026#doklady') === '/ucto/klienti/x?rok=2026#doklady')
  check('key management can resume on its own page without copying nested return addresses', security.safeNext('/auth?next=https://evil.example') === '/auth')
  for (const [action, page] of [
    ['/app/export/potvrdit', '/app/firma#stiahnut'],
    ['/app/faktury', '/app/faktury/nova'],
    ['/app/platby/x/bez-dokladu', '/app/platby/x'],
    ['/app/doklady/x/odpojit', '/app/doklady/x'],
    ['/app/faktury/x/poslat', '/app/faktury/x'],
    ['/app/firma/ludia/x/odobrat', '/app/firma'],
    ['/app/banka/x/nacitat', '/app/banka'],
    ['/ucto/klienti/x/odovzdanie/y/odstranit', '/ucto/klienti/x#odovzdanie'],
    ['/ucto/klienti/x/dph/suhrnny-vykaz/podane', '/ucto/klienti/x/dph'],
    ['/ucto/klienti/x/zavierka/podane', '/ucto/klienti/x/zavierka'],
    ['/ucto/klienti/x/podania/y/stav', '/ucto/klienti/x/podania/y'],
    ['/ucto/klienti/x/mzdy/otvorit', '/ucto/klienti/x/mzdy'],
    ['/ucto/klienti/x/kniha/interne/y/odstranit', '/ucto/klienti/x/kniha/interne'],
    ['/ucto/incidenty/x/schvalit-uvolnenie', '/ucto/incidenty/x'],
    ['/ucto/doklady/x/platba', '/ucto/doklady/x'],
    ['/ucto/ziadosti/x/posudenie', '/ucto/ziadosti/x/posudenie'],
    ['/ucto/tim', '/ucto/tim'],
    ['//evil.example/app/firma', '/app'],
    ['/ucto/unknown/action', '/ucto'],
  ]) check(`blocked action resumes on a work page: ${action}`, security.actionReturn(action) === page)
  check('re-verification keeps the selected accounting period on the same work page', security.actionReturn('/ucto/klienti/x/dph/podane', 'https://firmony.ai/ucto/klienti/x/dph?mesiac=2026-08') === '/ucto/klienti/x/dph?mesiac=2026-08')
  check('handover return keeps its section while copying safe work-page filters', security.actionReturn('/ucto/klienti/x/odovzdanie/y/odstranit', 'https://firmony.ai/ucto/klienti/x?rok=2025') === '/ucto/klienti/x?rok=2025#odovzdanie')
  for (const referrer of ['https://evil.example/ucto/klienti/x/dph?mesiac=2020-01', 'https://firmony.ai/ucto/klienti/other/dph?mesiac=2020-01', 'https://firmony.ai/ucto/klienti/x/export?rok=2025', 'not a URL']) {
    check('a referrer cannot replace the safe work destination', security.actionReturn('/ucto/klienti/x/dph/podane', referrer) === '/ucto/klienti/x/dph')
  }
  check('passkeys are bound to the canonical HTTPS production origin', security.relyingParty('https://firmony.ai/auth/options', {})?.rpID === 'firmony.ai' && security.relyingParty('http://firmony.ai/auth/options', {}) === null && security.relyingParty('https://preview.example/auth/options', { DEMO: '1' }) === null)
  check('local passkeys require an explicit demo flag', security.relyingParty('http://localhost:8787/auth', {}) === null && security.relyingParty('http://localhost:8787/auth', { DEMO: '1' })?.rpID === 'localhost')
  const bootstrap = { TEAM_BOOTSTRAP_EMAIL: 'owner@example.test', TEAM_BOOTSTRAP_TOKEN: 'x'.repeat(43), TEAM_BOOTSTRAP_EXPIRES_AT: '1100' }
  check('bootstrap never defaults to a public mailbox or an unlimited deadline', security.bootstrapReady(bootstrap, 1000) && !security.bootstrapReady({}, 1000) && !security.bootstrapReady({ ...bootstrap, TEAM_BOOTSTRAP_EXPIRES_AT: '' }, 1000) && !security.bootstrapReady(bootstrap, 1100))
  const who = { verifiedAt: 1000, verifiedCredential: 'key' }
  check('freshness needs the credential, rejects future timestamps and expires at the boundary', security.verifiedRecently(who, 1100, 300) && !security.verifiedRecently(who, 1300, 300) && !security.verifiedRecently(who, 999, 300) && !security.verifiedRecently({ ...who, verifiedCredential: null }, 1100, 300))
  check('exports, payroll downloads, role changes and retention release require recent verification', [['/app/export','GET'], ['/app/export/potvrdit','POST'], ['/ucto/klienti/co/kniha/dennik.csv','HEAD'], ['/ucto/klienti/co/kniha/dennik.csv','GET'], ['/ucto/klienti/co/paska','GET'], ['/ucto/tim','POST'], ['/ucto/incidenty/x/schvalit-uvolnenie','POST']].every(([p,m]) => security.sensitivePath(p,m)))
  check('ordinary work does not receive an accidental repeated-verification requirement', !security.sensitivePath('/ucto/doklady','GET') && !security.sensitivePath('/ucto/klienti/x/spravy','POST'))
  const e = { cause: { cause: new Error('D1_ERROR: Evidence hold prevents deletion') } }
  check('retention errors are recognized through nested causes and tolerate cycles', isEvidenceHeld(e) && !isEvidenceHeld(new Error('other')) && (() => { const x = {}; x.cause = x; return !isEvidenceHeld(x) })())
}

// Monthly reports use each recipient's period, never a planned payday as evidence of cash payment.
{
  check('report kinds reject inherited object names', reports.isReportKind('sp') && !reports.isReportKind('constructor') && !reports.isReportKind('__proto__') && !payrollStore.isInsurer('constructor'))
  check('payroll periods reject quarters and impossible months', reports.isMonth('2026-09') && ['2026-9','2026-00','2026-13','2026-Q3'].every((p) => !reports.isMonth(p)))
  check('the FS deadline follows the independently reviewed reporting period across New Year', reports.taxReportDue('2026-12') === '2027-02-01' && reports.taxReportDue('2026-10') === '2026-11-30')
  check('insurer operational dates do not borrow tax weekend extensions', reports.reportDue('sp','2026-10-10') === '2026-10-10' && reports.reportDue('health25','2026-10-10') === '2026-10-13')
  const line = (insurer, gross = 0) => ({ insurer, gross, slip: {} })
  check('every represented insurer needs evidence even with zero contribution', reports.requiredInsurers([line('25'),line('24',100),line('25')]).join() === '24,25')
  check('incomplete and unknown payroll snapshots fail closed', [[],null,[line('constructor')],[line('25',-1)],[{insurer:'25',gross:100}]].every((v) => reports.requiredInsurers(v) === null))
  const input = { revision:0, paidOn:'2026-10-12', reportPeriod:'2026-09', reference:'TEST bank statement 123', reason:'', checked:true }
  const valid = (v = {}, current = 0, admin = false) => reports.payoutError({...input,...v},current,admin,'2026-10-16','2026-09')
  check('an accountant can attest a past complete actual payout', valid() === null)
  check('payout rejects future, impossible and pre-source dates', ['2026-10-17','2026-02-30','2026-08-31',''].every((paidOn) => Boolean(valid({paidOn}))))
  check('payout confirmation needs explicit verification and a usable reference', Boolean(valid({checked:false})) && Boolean(valid({reference:'plan'})))
  check('payout corrections require current revision, admin and a reason', Boolean(valid({},1,true)) && Boolean(valid({revision:1},1,false)) && Boolean(valid({revision:1},1,true)) && valid({revision:1,reason:'TEST correction after bank review'},1,true) === null)
  const base = { views:[],filed:[],paid:new Map(),filings:new Set(),closings:[],missing:new Map(),handover:0 }
  const company = {id:'co',vatStatus:'none',startOn:'2026-01-01',createdAt:0,endsOn:null}
  const payrollReports = [
    {id:'sp',kind:'sp',period:'2026-09',due:'2026-10-10',status:'accepted',sourceChanged:false},
    {id:'zp',kind:'health25',period:'2026-09',due:'2026-10-13',status:'prepared',sourceChanged:false},
    {id:'tax',kind:'tax',period:'2026-10',due:'2026-11-30',status:'accepted',sourceChanged:true},
  ]
  const list = dues.deadlinesOf(company,{...base,payrollReports},'2026-10-16').filter((d) => d.kind === 'payrollReport')
  check('acceptance closes only the matching current recipient deadline', list.find((d) => d.reportId === 'sp')?.state === 'done' && list.find((d) => d.reportId === 'zp')?.state === 'open' && list.find((d) => d.reportId === 'tax')?.state === 'blocked')
  check('recipient deadlines link directly to their own evidence', dueViews.dueHref({...list[1],company}) === '/ucto/klienti/co/mzdove-podania/zp')
  check('payroll evidence mutations resume on GET work pages after verification', security.actionReturn('/ucto/klienti/co/mzdove-podania/vyplata','https://firmony.ai/ucto/klienti/co/mzdove-podania?obdobie=2026-09') === '/ucto/klienti/co/mzdove-podania?obdobie=2026-09' && security.actionReturn('/ucto/klienti/co/mzdove-podania/t/verzie/p/stav') === '/ucto/klienti/co/mzdove-podania/t/verzie/p')
  check('payroll originals and all evidence mutations require fresh verification', [['/ucto/klienti/co/mzdove-podania/zalozit','POST'],['/ucto/klienti/co/mzdove-podania/vyplata','POST'],['/ucto/klienti/co/mzdove-podania/t/subor','POST'],['/ucto/klienti/co/mzdove-podania/t/verzie/p/stav','POST'],['/app/mzdove-podania/t/verzie/p/dokument','GET'],['/app/mzdove-podania/t/verzie/p/potvrdenka/e','GET']].every(([p,m]) => security.sensitivePath(p,m)))
  const cyclic = {}; cyclic.cause = cyclic
  check('payroll source guards recognize nested errors without looping', reports.payrollBlocked({cause:new Error('FIRMONY_PAYROLL_REPORTED')}) && !reports.payrollBlocked(cyclic))
}

{
  // A long list of the books shown in parts (the load test of 17 October 2026): every entry once, in order, and a
  // page asked beyond the list shows its last part.
  const all = Array.from({ length: 1234 }, (_, i) => i)
  const parts = [1, 2, 3].map((n) => ledgerViews.pageSlice(all, n))
  check(
    'the books in parts of 500: every line once and in order, the third part the last 234',
    parts.flatMap((p) => p.items).join() === all.join() && parts[0].pages === 3 && parts[2].from === 1001 && parts[2].to === 1234 &&
      ledgerViews.pageSlice(all, 9).page === 3 && ledgerViews.pageSlice(all, -1).page === 1 && ledgerViews.pageSlice([], 1).from === 0 && ledgerViews.pageSlice([], 1).pages === 1,
  )
}
{
  // Fixed assets and depreciation (17 October 2026), by Act No. 595/2003 Z. z. as it stands from 1 January 2026.
  const base = { id: 'a1', number: 'M-2026-001', name: 'Stroj', account: '022', taxMethod: 'straight', car: false, bookMonths: null, source: 'purchase', priorBookCents: 0, priorTaxCents: 0, priorTaxYears: 0, disposedOn: null, disposal: null }
  const sum = (ys) => ys.reduce((s, y) => s + y.cents + y.saleShare, 0)
  // § 27: group 1, 10 000 € put in use in March: 10/12 of 2 500 € the first year, the rest in the year after the four.
  const straight = assets.taxSchedule({ ...base, costCents: 1_000_000, inUseOn: '2026-03-15', taxGroup: 1 })
  check(
    'straight line: the months share the first year, full years after, the deferred part in the year after the period (§ 27)',
    JSON.stringify(straight.map((y) => [y.year, y.cents])) === JSON.stringify([[2026, 208333], [2027, 250000], [2028, 250000], [2029, 250000], [2030, 41667]]) && sum(straight) === 1_000_000,
    JSON.stringify(straight),
  )
  const january = assets.taxSchedule({ ...base, costCents: 1_000_000, inUseOn: '2026-01-05', taxGroup: 2 })
  check('put in use in January: six years and nothing after, the last taking the rounding', january.length === 6 && sum(january) === 1_000_000 && january[0].cents === 166667, JSON.stringify(january))
  // § 28: group 2, 12 000 € from January: 12 000/6, then twice the residual over 6, 5, 4, 3 and 2.
  const fast = assets.taxSchedule({ ...base, costCents: 1_200_000, inUseOn: '2026-01-10', taxGroup: 2, taxMethod: 'accelerated' })
  check(
    'accelerated: the first coefficient, then twice the residual value over the further coefficient less the years (§ 28)',
    JSON.stringify(fast.map((y) => y.cents)) === JSON.stringify([200000, 333333, 266667, 200000, 133333, 66667]) && sum(fast) === 1_200_000,
    JSON.stringify(fast.map((y) => y.cents)),
  )
  const fastJuly = assets.taxSchedule({ ...base, costCents: 1_200_000, inUseOn: '2026-07-01', taxGroup: 2, taxMethod: 'accelerated' })
  check(
    'accelerated from July: half the first year, the second year counted from the full first year, the half deferred to the seventh',
    fastJuly[0].cents === 100000 && fastJuly[1].cents === 333333 && fastJuly[6]?.cents === 100000 && sum(fastJuly) === 1_200_000,
    JSON.stringify(fastJuly.map((y) => y.cents)),
  )
  const car = assets.taxSchedule({ ...base, costCents: 6_000_000, inUseOn: '2026-01-01', taxGroup: 1, car: true })
  check('a car of 60 000 €: its depreciation beside the one from 48 000 € (§ 17(34))', car[1].cents === 1_500_000 && car[1].limited === 1_200_000 && assets.assetYear([{ ...base, costCents: 6_000_000, inUseOn: '2026-01-01', taxGroup: 1, car: true }], 2027).carExcess === 300_000)
  const sold = { ...base, costCents: 1_000_000, inUseOn: '2026-03-15', taxGroup: 1, disposedOn: '2028-05-20', disposal: 'sale' }
  const soldTax = assets.taxSchedule(sold)
  check('sold in its third year: no depreciation that year, its residual value the expense (§ 22(11), § 19(3)(b))', soldTax.length === 3 && soldTax[2].cents === 0 && soldTax[2].residual === 541667, JSON.stringify(soldTax))
  const soldCar = assets.taxSchedule({ ...sold, car: true })
  check('a car sold may take the share of its full months (§ 22(12))', soldCar[2].saleShare === Math.floor((250000 * 4) / 12 + 0.5), JSON.stringify(soldCar[2]))
  // The books: as the tax, spread over the months; or in months set by the accountant.
  const months = assets.bookMonths({ ...base, costCents: 1_000_000, inUseOn: '2026-03-15', taxGroup: 1 })
  check('the books as the tax: each year over its months, the same total', months[0].month === '2026-03' && months.filter((m) => m.month.startsWith('2026')).length === 10 && months.reduce((s, m) => s + m.cents, 0) === 1_000_000)
  const software = { ...base, account: '013', taxGroup: null, bookMonths: 36, costCents: 360_000, inUseOn: '2026-02-01' }
  check('software over 36 months: 100 € a month, and its tax the same (§ 22(8))', assets.bookMonths(software).length === 36 && assets.bookMonths(software)[0].cents === 10000 && sum(assets.taxSchedule(software)) === 360_000)
  // The entries: putting in use from 042, a month's depreciation on its last day, a disposal.
  const entries = assets.assetEntries([{ ...sold }, software], '2028-06-30')
  const put = entries.find((e) => e.key === 'a:a1:in')
  const march = entries.find((e) => e.key === 'a:odpisy:2026-03')
  const out = entries.find((e) => e.key === 'a:a1:out')
  check(
    'the register gives the books: 022 from 042, 551 against each accumulated account each month, the disposal writing the asset off',
    put?.lines[0].md === '022' && put?.lines[0].d === '042' && march?.on === '2026-03-31' && march?.lines.some((l) => l.md === '551' && l.d === '082') &&
      out?.lines.reduce((s, l) => s + l.cents, 0) === 1_000_000 && out?.lines.some((l) => l.md === '541') && entries.some((e) => e.key === 'a:odpisy:2028-06') && !entries.some((e) => e.key === 'a:odpisy:2028-07'),
    JSON.stringify(out),
  )
  check(
    'a tangible asset under 1 700 € and an intangible one without months are refused, accelerated only for groups 2 and 3',
    Boolean(assets.assetErrors({ ...base, costCents: 150_000, inUseOn: '2026-01-01', taxGroup: 1 }).cost) &&
      Boolean(assets.assetErrors({ ...base, account: '013', taxGroup: null, costCents: 500_000, inUseOn: '2026-01-01' }).months) &&
      Boolean(assets.assetErrors({ ...base, costCents: 500_000, inUseOn: '2026-01-01', taxGroup: 1, taxMethod: 'accelerated' }).method),
  )
  // The closing: Table B takes the register's tangible assets, and 551 outside it as before.
  const proposal = closing.proposeTax({ profit: {}, accounts: { '551': 500_000 }, balance: {} }, { bookTangible: 300_000, bookIntangible: 100_000, taxTangible: 250_000, saleShares: 0, carExcess: 0, disposedTax: 0, disposedBook: 0, liquidated: 0 })
  check('the closing takes the register into Table B, intangible assets out', proposal.tableB.b01 === 400_000 && proposal.tableB.b02 === 350_000, JSON.stringify(proposal.tableB))
}
await checkPrehlad()
await (await import('./billing.units.mjs')).checkBillingRules()
await (await import('./health.units.mjs')).checkHealth()
await (await import('./social.units.mjs')).checkSocial()

// ---------------------------------------------------------------------------------------------------------------
// Stock (17 October 2026): valuation, the books' entries, what the accountant types and pastes
// ---------------------------------------------------------------------------------------------------------------
{
  let k = 0
  const mv = (kind, on, quantity, value = null, itemId = 'i1') => ({ id: `m${++k}`, itemId, number: `X-${k}`, kind, on, quantity: quantity * 1000, value, documentId: null, note: null, createdAt: k })
  const A = { method: 'A', valuation: 'average' }
  const F = { method: 'A', valuation: 'fifo' }
  const moves = [mv('in', '2026-03-01', 10, 10000), mv('in', '2026-03-05', 10, 12000), mv('out', '2026-03-10', 5), mv('out', '2026-03-20', 15)]
  let v = stock.valueItem(moves, A)
  check(
    'the weighted average: 10 at 10 € and 10 at 12 € make 11 €; 5 out cost 55 €, the last 15 the rest, the stock nought to the cent',
    v[2].cost === 5500 && v[2].after.value === 16500 && v[3].cost === 16500 && v[3].after.quantity === 0 && v[3].after.value === 0,
    JSON.stringify(v.map((m) => [m.cost, m.after])),
  )
  v = stock.valueItem(moves, F)
  check('FIFO: 15 out take the first 10 at 10 € and 5 at 12 €; 5 at 12 € are left', v[2].cost === 5000 && v[2].after.value === 17000 && v[3].cost === 17000)
  v = stock.valueItem([mv('in', '2026-03-01', 3, 1000), mv('out', '2026-03-02', 1), mv('out', '2026-03-03', 1), mv('out', '2026-03-04', 1)], A)
  check('a third of 10 € three times: 3,33, 3,34 and 3,33 €, nothing lost or made by rounding', v[1].cost === 333 && v[2].cost === 334 && v[3].cost === 333 && v[3].after.value === 0)
  v = stock.valueItem([mv('out', '2026-04-02', 2), mv('in', '2026-04-02', 5, 5000)], A)
  check('in a day what comes in goes before what goes out', v[0].kind === 'in' && v[1].cost === 2000 && !stock.shortOf(v))
  check('more out than there is is said', stock.shortOf(stock.valueItem([mv('in', '2026-04-01', 1, 100), mv('out', '2026-04-02', 2)], A))?.kind === 'out')
  v = stock.valueItem([mv('in', '2026-05-01', 10, 11000), mv('count', '2026-05-31', 8), mv('count', '2026-06-30', 9)], A)
  check(
    'a count under method A: 2 short cost 22 € (a shortage), one found back at the average (a surplus)',
    v[1].difference === -2000 && v[1].cost === -2200 && v[1].after.value === 8800 && v[2].difference === 1000 && v[2].cost === 1100 && v[2].after.value === 9900,
  )
  v = stock.valueItem([mv('count', '2026-12-31', 40, 52000), mv('count', '2027-12-31', 10, 15000)], { method: 'B', valuation: 'average' })
  check('a count under method B is the stock, at its value', v[0].after.value === 52000 && v[1].after.quantity === 10000 && v[1].after.value === 15000)

  const items = [
    { id: 'g', code: 'T-1', name: 'Tovar', unit: 'ks', kind: 'goods' },
    { id: 'm', code: 'M-1', name: 'Materiál', unit: 'kg', kind: 'material' },
    { id: 'p', code: 'V-1', name: 'Výrobok', unit: 'ks', kind: 'products' },
  ]
  const all = [
    mv('in', '2026-03-02', 10, 10000, 'g'),
    mv('in', '2026-03-15', 5, 6000, 'g'),
    mv('out', '2026-03-20', 6, null, 'g'),
    mv('in', '2026-03-03', 100, 25000, 'm'),
    mv('out', '2026-03-28', 40, null, 'm'),
    mv('in', '2026-03-10', 4, 8000, 'p'),
    mv('out', '2026-04-05', 1, null, 'p'),
    mv('count', '2026-04-30', 8, null, 'g'),
  ]
  const entries = stock.stockEntries(A, items, all)
  const of = (key) => entries.find((e) => e.key === key)
  check(
    "method A's entries: a month's receipts in one entry, its issues in another, each kind its line; a count's shortage of its own",
    JSON.stringify(of('s:in:2026-03')?.lines) === JSON.stringify([{ md: '132', d: '131', cents: 16000 }, { md: '112', d: '111', cents: 25000 }, { md: '123', d: '613', cents: 8000 }]) &&
      of('s:in:2026-03').on === '2026-03-15' && of('s:in:2026-03').number === 'SKL 03/2026' &&
      JSON.stringify(of('s:out:2026-03')?.lines) === JSON.stringify([{ md: '504', d: '132', cents: 6400 }, { md: '501', d: '112', cents: 10000 }]) &&
      JSON.stringify(of('s:out:2026-04')?.lines) === JSON.stringify([{ md: '613', d: '123', cents: 2000 }]) &&
      JSON.stringify(entries.find((e) => e.key.startsWith('s:i:'))?.lines) === JSON.stringify([{ md: '549', d: '132', cents: 1067 }]),
    JSON.stringify(entries),
  )
  const bEntries = stock.stockEntries({ method: 'B', valuation: 'average' }, items, [mv('count', '2026-12-31', 40, 52000, 'g'), mv('count', '2026-12-31', 10, 2000, 'm')])
  check(
    "method B's: the count puts the stock on its accounts on its day and takes it back the next",
    bEntries.length === 2 && bEntries[0].on === '2026-12-31' && JSON.stringify(bEntries[0].lines) === JSON.stringify([{ md: '132', d: '504', cents: 52000 }, { md: '112', d: '501', cents: 2000 }]) &&
      bEntries[1].on === '2027-01-01' && JSON.stringify(bEntries[1].lines) === JSON.stringify([{ md: '504', d: '132', cents: 52000 }, { md: '501', d: '112', cents: 2000 }]),
  )
  check('no way of keeping stock, no entries', stock.stockEntries(null, items, all).length === 0)
  const summary = stock.stockSummary(A, items, all, '2026-03-31')
  check('the stock of each item and kind at a day', summary.kinds.goods === 9600 && summary.kinds.material === 15000 && summary.kinds.products === 8000 && summary.items.find((r) => r.item.id === 'g')?.quantity === 9000)
  check('quantities as typed and written', stock.quantityOf('1 250,125') === 1250125 && stock.quantityOf('0,5') === 500 && stock.quantityOf('-1') === null && stock.quantityOf('1,2345') === null && stock.quantityText(1250125) === '1 250,125' && stock.quantityText(500) === '0,5' && stock.quantityText(-2000) === '−2')

  const form = (fields) => (name) => fields[name]
  let item = stock.readItem(form({ kod: 'T-2', nazov: 'Skrutky', jednotka: 'bal', druh: 'material' }), new Set(['t-1']))
  check('an item read', item.item?.code === 'T-2' && item.item.kind === 'material' && item.item.unit === 'bal')
  item = stock.readItem(form({ kod: 't-1', nazov: '', jednotka: '12', druh: 'iné' }), new Set(['t-1']))
  check('a code taken, no name, a unit that is no word, a kind that is none: each said', Boolean(item.errors.code && item.errors.name && item.errors.unit && item.errors.kind) && item.item === null)
  let move = stock.readMove(form({ pohyb: 'in', polozka: 'g', den: '2026-03-02', mnozstvo: '10', hodnota: '100,00', doklad: 'd1', poznamka: 'Dodávka' }), A, items, new Set(['d1']))
  check('a receipt read: its quantity in thousandths, its value in cents, its document', move.move?.quantity === 10000 && move.move.value === 10000 && move.move.documentId === 'd1')
  move = stock.readMove(form({ pohyb: 'in', polozka: 'g', den: '2026-02-30', mnozstvo: '0', hodnota: '', doklad: 'cudzi' }), A, items, new Set())
  check('a day that is none, no quantity, a receipt without value, a document not of the company: each said', Boolean(move.errors.on && move.errors.quantity && move.errors.value && move.errors.document))
  move = stock.readMove(form({ pohyb: 'out', polozka: 'g', den: '2026-03-02', mnozstvo: '1' }), { method: 'B', valuation: 'average' }, items, new Set())
  check('method B keeps counts only, each with its value', Boolean(move.errors.kind) && Boolean(stock.readMove(form({ pohyb: 'count', polozka: 'g', den: '2026-12-31', mnozstvo: '0' }), { method: 'B', valuation: 'average' }, items, new Set()).errors.value))
  check('an issue keeps no value of its own: the valuation gives it', stock.readMove(form({ pohyb: 'out', polozka: 'g', den: '2026-03-02', mnozstvo: '1', hodnota: '5' }), A, items, new Set()).move?.value === null)
  let pasted = stock.parseMovesCsv('Deň;Kód;Druh;Množstvo;Hodnota;Poznámka\n2.3.2026;T-1;príjem;10;100,00;Dodávka\n2026-03-20;t-1;Výdaj;6;;\n2026-04-30\tM-1\tinventúra\t8,5\t\t', A, items)
  check('pasted moves: a heading skipped, days in either form, codes in any case, tabs or semicolons', pasted.errors.length === 0 && pasted.moves.length === 3 && pasted.moves[0].on === '2026-03-02' && pasted.moves[1].kind === 'out' && pasted.moves[2].quantity === 8500 && pasted.moves[2].itemId === 'm')
  pasted = stock.parseMovesCsv('2026-03-02;T-1;príjem;10;\n2026-13-01;X-9;predaj;veľa;1', A, items)
  check('a wrong line keeps all back, each said by its line', pasted.moves.length === 0 && pasted.errors.length === 2 && pasted.errors[0].startsWith('Riadok 1:') && pasted.errors[1].includes('neznámy kód X-9'), JSON.stringify(pasted.errors))
  const pastedItems = stock.parseItemsCsv('kód;názov;jednotka;druh\nA-1;Jablká;kg;tovar\nB-2;Lepidlo;ks;materiál\nA-1;Znova;ks;tovar', new Set())
  check('pasted items: a code twice is said', pastedItems.items.length === 0 && pastedItems.errors.length === 1 && pastedItems.errors[0].startsWith('Riadok 4:') && stock.parseItemsCsv('A-1;Jablká;kg;tovar\nB-2;Lepidlo;ks;112', new Set()).items.length === 2)
}

// Taking a client over (17 October 2026): files of the program before read into the opening balances, the open
// items, the assets, the employees and the statements she filed.
{
  // Text and tables
  const cp1250 = new Uint8Array([0xda, 0xe8, 0x65, 0x74, 0x3b, 0x8a, 0x74, 0x61, 0x76])
  check('text in Windows-1250 (Účet;Štav) and in UTF-8 with its mark', tableRead.decodeText(cp1250) === 'Účet;Štav' && tableRead.decodeText(new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('Účet')])) === 'Účet')
  const utf16 = new Uint8Array([0xff, 0xfe, ...[...'Účet\tSuma'].flatMap((ch) => [ch.charCodeAt(0) & 0xff, ch.charCodeAt(0) >> 8])])
  check("Excel's Unicode text (UTF-16 with its mark) is read, not refused for its noughts", tableRead.decodeText(utf16) === 'Účet\tSuma')
  check(
    'a CSV with semicolons and quotes, rows pasted from Excel with tabs, and commas',
    JSON.stringify(tableRead.parseDelimited('Účet;Názov\n311;"Odberatelia; tuzemsko"\n321;"Dodávatelia ""A"""\n')) === JSON.stringify([['Účet', 'Názov'], ['311', 'Odberatelia; tuzemsko'], ['321', 'Dodávatelia "A"']]) &&
      JSON.stringify(tableRead.parseDelimited('Účet\tKS\r\n211\t120,50\r\n')) === JSON.stringify([['Účet', 'KS'], ['211', '120,50']]) &&
      JSON.stringify(tableRead.parseDelimited('a,b\n1,2')) === JSON.stringify([['a', 'b'], ['1', '2']]),
  )
  check(
    'amounts as the programs write them, in cents',
    tableRead.amountOf('1 234,56') === 123456 && tableRead.amountOf('1234.56') === 123456 && tableRead.amountOf('-1.234,56') === -123456 && tableRead.amountOf('(12,40)') === -1240 && tableRead.amountOf('12,40 €') === 1240 && tableRead.amountOf('500-') === -50000 && tableRead.amountOf('') === null && Number.isNaN(tableRead.amountOf('abc')),
  )
  check(
    'days as the programs write them, an Excel day number too (45658 is 1 January 2025)',
    tableRead.dayOf('31.12.2026') === '2026-12-31' && tableRead.dayOf('1. 3. 2026') === '2026-03-01' && tableRead.dayOf('2026-12-31') === '2026-12-31' && tableRead.dayOf('45658') === '2025-01-01' && tableRead.dayOf('31.2.2026') === null && tableRead.dayOf('') === null,
  )
  check('a heading "KS MD" is found before the plain "KS"', JSON.stringify(tableRead.findColumns([['Účet', 'KS', 'KS MD']], { a: ['účet'], ksMd: ['ks md'], ks: ['ks'] }, ['a'])?.cols) === JSON.stringify({ a: 0, ksMd: 2, ks: 1 }))

  // An Excel workbook made here: a ZIP of its parts, deflated, with shared and inline strings and a skipped column.
  const zipOf = (files) => {
    const local = []
    const central = []
    let offset = 0
    for (const [name, text] of Object.entries(files)) {
      const raw = Buffer.from(text, 'utf8')
      const data = deflateRawSync(raw)
      const nameBytes = Buffer.from(name, 'utf8')
      const head = Buffer.alloc(30)
      head.writeUInt32LE(0x04034b50, 0)
      head.writeUInt16LE(20, 4)
      head.writeUInt16LE(8, 8)
      head.writeUInt32LE(nodeCrc32(raw), 14)
      head.writeUInt32LE(data.length, 18)
      head.writeUInt32LE(raw.length, 22)
      head.writeUInt16LE(nameBytes.length, 26)
      local.push(head, nameBytes, data)
      const dir = Buffer.alloc(46)
      dir.writeUInt32LE(0x02014b50, 0)
      dir.writeUInt16LE(20, 4)
      dir.writeUInt16LE(20, 6)
      dir.writeUInt16LE(8, 10)
      dir.writeUInt32LE(nodeCrc32(raw), 16)
      dir.writeUInt32LE(data.length, 20)
      dir.writeUInt32LE(raw.length, 24)
      dir.writeUInt16LE(nameBytes.length, 28)
      dir.writeUInt32LE(offset, 42)
      central.push(dir, nameBytes)
      offset += 30 + nameBytes.length + data.length
    }
    const dirBytes = Buffer.concat(central)
    const end = Buffer.alloc(22)
    end.writeUInt32LE(0x06054b50, 0)
    end.writeUInt16LE(Object.keys(files).length, 8)
    end.writeUInt16LE(Object.keys(files).length, 10)
    end.writeUInt32LE(dirBytes.length, 12)
    end.writeUInt32LE(offset, 16)
    return new Uint8Array(Buffer.concat([...local, dirBytes, end]))
  }
  const xlsx = zipOf({
    'xl/workbook.xml': '<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Predvaha" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="rId1" Type="worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    'xl/sharedStrings.xml': '<sst><si><t>Účet</t></si><si><r><t>Konečný </t></r><r><t>stav</t></r></si><si><t>Pokladnica &amp; ceniny</t></si></sst>',
    'xl/worksheets/sheet1.xml':
      '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c></row><row r="2"><c r="A2"><v>211</v></c><c r="B2" t="s"><v>2</v></c><c r="C2"><v>120.5</v></c></row><row r="3"><c r="A3" t="inlineStr"><is><t>221.001</t></is></c><c r="C3"><v>-30</v></c></row></sheetData></worksheet>',
  })
  const table = await tableRead.readTable(xlsx)
  check('an Excel workbook: its first sheet, shared, rich and inline strings, a column left empty', table.format === 'xlsx' && JSON.stringify(table.rows) === JSON.stringify([['Účet', '', 'Konečný stav'], ['211', 'Pokladnica & ceniny', '120.5'], ['221.001', '', '-30']]), JSON.stringify(table))
  check(
    'an old .xls is said, a binary file is refused, an empty one is empty',
    (await tableRead.readTable(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 1, 2]))).error === 'xls' && (await tableRead.readTable(new Uint8Array([65, 0, 66]))).error === 'unreadable' && (await tableRead.readTable(new Uint8Array([]))).error === 'empty',
  )

  // The trial balance
  const expected = '211:12050/0 221.001:600000/0 221.002:400000/0 311:246000/0 321:0/123000 411:0/500000 428:0/70000 431:0/565050'
  const linesOf = (tb) => tb.lines.map((l) => `${l.account}:${l.md}/${l.d}`).join(' ')
  const omega = takeover.trialBalance(
    tableRead.parseDelimited(
      [
        'Obratová predvaha k 31.12.2026',
        'Účet;Názov;PS MD;PS D;Obrat MD;Obrat D;KS MD;KS D',
        '211;Pokladnica;100,00;;20,50;;120,50;',
        '221;Bankové účty;;;;;10 000,00;',
        '221001;Tatra banka;;;;;6 000,00;',
        '221002;SLSP;;;;;4 000,00;',
        '311;Odberatelia;;;;;2 460,00;',
        '321;Dodávatelia;;;;;;1 230,00',
        '411;Základné imanie;;;;;;5 000,00',
        '428;Nerozdelený zisk;;;;;;700,00',
        '518;Ostatné služby;;;;;6 349,50;',
        '602;Tržby z predaja služieb;;;;;;12 000,00',
        'Trieda 6 spolu;;;;;;;12 000,00',
        '701;Začiatočný účet súvahový;;;;;;',
        '901;Podsúvahový;;;;;5,00;',
      ].join('\n'),
    ),
  )
  check(
    'a trial balance with KS MD and KS D: every balance-sheet account, a synthetic account by its analytic ones, the year\'s costs and revenues as the result on 431, totals and class 9 left out',
    linesOf(omega) === expected && omega.md === 1258050 && omega.d === 1258050 && omega.result === 565050 && omega.issues.length === 0,
    linesOf(omega),
  )
  const pohoda = takeover.trialBalance(
    tableRead.parseDelimited(
      ['Účet\tNázov účtu\tPočiatočný stav\tObraty MD\tObraty D\tKonečný stav', '211 Pokladnica\t\t\t\t\t120,50', '221.001\t\t\t\t\t6 000,00', '221.002\t\t\t\t\t4000', '311\t\t\t\t\t2460', '321\t\t\t\t\t-1 230,00', '411\t\t\t\t\t-5000', '428\t\t\t\t\t700,00 D', '518\t\t\t\t\t6349,5', '602\t\t\t\t\t-12000'].join('\n'),
    ),
  )
  check('a trial balance with one signed closing balance (and "700,00 D"), the account at the start of its cell', linesOf(pohoda) === expected, linesOf(pohoda))
  const turnover = takeover.trialBalance(tableRead.parseDelimited(['Účet;PS;Obrat MD;Obrat D', '211;100;20,50;', '221.001;5000;1000;', '221.002;4000;;', '311;;2460;', '321;-1000;;230', '411;-5000;;', '428;-700;;', '518;;6349,50;', '602;;;12000'].join('\n')))
  check('a trial balance without closing balances: the opening one with the turnover', linesOf(turnover) === expected, linesOf(turnover))
  const long = takeover.trialBalance(tableRead.parseDelimited('Účet;KS\n3432001;100,00\n343.200;-100,00\nx;1'))
  check('an analytic account of more than three digits is said with its line, never left out quietly', long.issues.length === 1 && long.issues[0].line === 2 && long.issues[0].what.startsWith('3432001'))
  check('a table without an account and a balance is said', takeover.trialBalance([['Názov', 'Suma']]).noColumns && takeover.trialBalance(tableRead.parseDelimited('Účet;Názov\n211;Pokladnica')).noColumns)
  check('an amount that is none is said with its line', takeover.trialBalance(tableRead.parseDelimited('Účet;KS MD;KS D\n211;12,x;')).issues[0]?.line === 2)

  // The open items
  const open = takeover.openItems(
    tableRead.parseDelimited(
      [
        'Druh;Číslo dokladu;VS;Partner;IČO;Dátum vystavenia;Dátum splatnosti;Suma celkom;Zostáva uhradiť',
        'FV;20260101;20260101;Odberateľ a. s.;12345678;15.12.2026;14.01.2027;1 230,00;1 230,00',
        'FP;D-77;;Dodávateľ s. r. o.;87654321;20.12.2026;03.01.2027;615,00;300,00',
        'FV;20260102;20260102;Iný;;10.12.2026;24.12.2026;100,00;0,00',
        'Spolu;;;;;;;1 945,00;1 530,00',
      ].join('\n'),
    ),
    null,
  )
  check(
    'open items: each with what is left, its side by its kind, its symbol and partner; paid ones and totals left out',
    open.issues.length === 0 &&
      open.items.length === 2 &&
      JSON.stringify(open.items[0]) === JSON.stringify({ side: 'issued', number: '20260101', vs: '20260101', party: 'Odberateľ a. s.', ico: '12345678', issuedOn: '2026-12-15', dueOn: '2027-01-14', cents: 123000, line: 2 }) &&
      open.items[1].side === 'received' && open.items[1].cents === 30000 && open.items[1].vs === null,
    JSON.stringify(open),
  )
  const sideless = tableRead.parseDelimited('Číslo faktúry;Suma\n77;10,00')
  check('a list that does not say the side: refused without the choice, read with it', takeover.openItems(sideless, null).issues.length === 1 && takeover.openItems(sideless, 'received').items[0]?.side === 'received' && takeover.openItems(sideless, 'received').items[0]?.vs === '77')
  const wrong = takeover.openItems(tableRead.parseDelimited('Účet;Číslo dokladu;Suma;Dátum splatnosti\n311;A1;-5,00;\n311;A2;5,00;31.2.2027\n321;A3;5,00;\n321;A3;6,00;'), null)
  check('a credit note, a wrong day and a number twice are said with their lines', wrong.items.length === 1 && wrong.issues.map((i) => i.line).join() === '2,3,5', JSON.stringify(wrong.issues))

  const pohodaXml = `<?xml version="1.0" encoding="UTF-8"?>
<dat:dataPack xmlns:dat="http://www.stormware.cz/schema/version_2/data.xsd" xmlns:inv="http://www.stormware.cz/schema/version_2/invoice.xsd" xmlns:typ="http://www.stormware.cz/schema/version_2/type.xsd" id="exp" ico="12345679" application="POHODA" version="2.0">
<dat:dataPackItem id="1" version="2.0"><inv:invoice version="2.0"><inv:invoiceHeader><inv:invoiceType>issuedInvoice</inv:invoiceType><inv:number><typ:numberRequested>20260101</typ:numberRequested></inv:number><inv:symVar>20260101</inv:symVar><inv:date>2026-12-15</inv:date><inv:dateDue>2027-01-14</inv:dateDue><inv:partnerIdentity><typ:address><typ:company>Odberateľ a. s.</typ:company><typ:ico>12345678</typ:ico></typ:address></inv:partnerIdentity></inv:invoiceHeader><inv:invoiceSummary><inv:homeCurrency><typ:priceNone>0</typ:priceNone><typ:priceLow>0</typ:priceLow><typ:priceLowVAT>0</typ:priceLowVAT><typ:priceLowSum>0</typ:priceLowSum><typ:priceHigh>1000</typ:priceHigh><typ:priceHighVAT>230</typ:priceHighVAT><typ:priceHighSum>1230</typ:priceHighSum></inv:homeCurrency></inv:invoiceSummary></inv:invoice></dat:dataPackItem>
<dat:dataPackItem id="2" version="2.0"><inv:invoice version="2.0"><inv:invoiceHeader><inv:invoiceType>receivedInvoice</inv:invoiceType><inv:number><typ:numberRequested>D-77</typ:numberRequested></inv:number><inv:date>2026-12-20</inv:date><inv:partnerIdentity><typ:address><typ:company>Dodávateľ s. r. o.</typ:company></typ:address></inv:partnerIdentity></inv:invoiceHeader><inv:invoiceSummary><inv:homeCurrency><typ:priceNone>615</typ:priceNone></inv:homeCurrency></inv:invoiceSummary></inv:invoice></dat:dataPackItem>
</dat:dataPack>`
  const fromPohoda = takeover.pohodaInvoices(pohodaXml)
  check(
    "Pohoda's XML of invoices: issued and received, the sum of its rates with VAT, the partner",
    fromPohoda?.items.length === 2 && fromPohoda.items[0].side === 'issued' && fromPohoda.items[0].cents === 123000 && fromPohoda.items[0].ico === '12345678' && fromPohoda.items[1].side === 'received' && fromPohoda.items[1].cents === 61500 && fromPohoda.items[1].number === 'D-77',
    JSON.stringify(fromPohoda),
  )
  check('XML that is no export of invoices is none', takeover.pohodaInvoices('<dokument/>') === null && takeover.pohodaInvoices('nie je xml <') === null)

  // Fixed assets
  const assetsRead = takeover.assetRows(
    tableRead.parseDelimited(
      [
        'Inventárne číslo;Názov;Dátum zaradenia;Vstupná cena;Odpisová skupina;Spôsob odpisovania;Daňové oprávky;Účtovné oprávky;Počet rokov odpisovania',
        'HM-1;Server;15.03.2024;4 800,00;2;zrýchlené;2 742,86;2 000,00;2',
        'NM-1;Softvér;01.02.2025;3 000,00;;;;1 000,00;',
        'HM-2;Stroj;01.01.2020;10 000,00;9;rovnomerné;;;',
      ].join('\n'),
    ),
  )
  check(
    'a register of assets: the group, the method, what was depreciated in tax and in the books; intangible without a group; a group that is none said',
    assetsRead.assets.length === 2 &&
      JSON.stringify(assetsRead.assets[0]) ===
        JSON.stringify({ name: 'Server', account: '022', inUseOn: '2024-03-15', costCents: 480000, taxGroup: 2, accelerated: true, priorTaxCents: 274286, priorBookCents: 200000, priorTaxYears: 2, note: 'Inventárne číslo u predchodcu: HM-1', line: 2 }) &&
      assetsRead.assets[1].account === '013' && assetsRead.assets[1].taxGroup === null && assetsRead.assets[1].priorBookCents === 100000 &&
      assetsRead.issues.length === 1 && assetsRead.issues[0].line === 4,
    JSON.stringify(assetsRead),
  )
  check(
    'the register numbers the assets taken over past every number used, by the year put in use',
    JSON.stringify(takeoverStore.assetNumbers(['M-2024-001', 'M-2024-003', 'M-2025-002', 'iné'], [{ inUseOn: '2024-05-01' }, { inUseOn: '2024-06-01' }, { inUseOn: '2023-01-01' }])) === JSON.stringify(['M-2024-004', 'M-2024-005', 'M-2023-001']),
  )

  // Employees
  const people = takeover.personRows(
    tableRead.parseDelimited(
      [
        'Meno a priezvisko;Dátum narodenia;Zdravotná poisťovňa;Dátum nástupu;Mesačná mzda;Druh pomeru;IBAN;Úväzok',
        'Jana Testová;01.02.1990;25 VšZP;01.03.2024;1 800,00;pracovný pomer;SK89 1100 0000 0026 2900 0001;40',
        'Peter Brigádnik;;Dôvera;01.06.2025;400;dohoda o brigádnickej práci študentov;;20',
        'Eva Bezpoistky;;;01.06.2025;400;;;',
      ].join('\n'),
    ),
  )
  check(
    'employees: the insurer by its code or name, the relationship by its words, the IBAN; one without an insurer said',
    people.people.length === 2 &&
      people.people[0].insurer === '25' && people.people[0].contract === 'employment' && people.people[0].wage === 180000 && people.people[0].iban === 'SK8911000000002629000001' && people.people[0].weeklyHours === 4000 &&
      people.people[1].insurer === '24' && people.people[1].contract === 'dobps' && people.people[1].weeklyHours === 2000 &&
      people.issues.length === 1 && people.issues[0].line === 4,
    JSON.stringify(people),
  )

  // The statements filed before: read back from the files Firmony itself writes for eDane.
  let n = 0
  const entry = (on, ...lines) => ({ key: `t${n++}`, on, kind: 'internal', number: '', text: '', docId: null, paymentId: null, manualId: null, lines: lines.map(([md, d, cents]) => ({ md, d, cents })) })
  const books = [
    { ...entry('2025-01-01', ['221.001', '701', 500000], ['701', '411', 500000]), kind: 'opening' },
    entry('2025-03-10', ['311', '602', 1230000]),
    entry('2025-03-20', ['221.001', '311', 1230000]),
    entry('2025-04-05', ['518', '221.001', 100000]),
    entry('2026-03-10', ['311', '602', 2000000]),
    entry('2026-04-05', ['022', '321', 480000]),
  ]
  const filer = { name: 'Prevzatá s. r. o.', ico: '12345679', dic: '2120000007', address: 'Hlavná 1, 040 01 Košice', registerLine: 'Obchodný register Okresného súdu Košice I, oddiel Sro, vložka č. 1/V', nace: '62.01.0', activity: 'Programovanie' }
  const nonzero = (o) => JSON.stringify(Object.fromEntries(Object.entries(o).filter(([, v]) => v !== 0).sort(([a], [b]) => (a < b ? -1 : 1))))
  const muj25 = closing.statementsOf({ entries: books }, 2025)
  const muj26 = closing.statementsOf({ entries: books }, 2026)
  const mujXml = closingXml.statementsXml(filer, muj26, muj25, { year: 2026, from: '2026-01-01', preparedOn: '2027-03-15' })
  const taken = takeover.priorStatements(mujXml)
  check(
    'Úč MUJ filed before: the year from its own column and the year before from the column of the period before, row by row, with the size figures',
    taken?.length === 2 &&
      taken[0].year === 2026 && taken[0].form === 'muj' && taken[0].ico === '12345679' &&
      nonzero(taken[0].balanceEur) === nonzero(muj26.balanceEur) && nonzero(taken[0].profitEur) === nonzero(muj26.profitEur) &&
      taken[0].turnover === muj26.profitEur.r01 * 100 && taken[0].assetsNet === muj26.balanceEur.r01 * 100 &&
      taken[1].year === 2025 && nonzero(taken[1].balanceEur) === nonzero(muj25.balanceEur),
    JSON.stringify(taken),
  )
  const pod25 = closing.statementsOf({ entries: books }, 2025, 'pod')
  const pod26 = closing.statementsOf({ entries: books }, 2026, 'pod')
  const podTaken = takeover.priorStatements(closingXml.statementsXml(filer, pod26, pod25, { year: 2026, from: '2026-01-01', preparedOn: '2027-03-15', size: 'small' }))
  check(
    'Úč POD filed before: the gross, the correction and the net of the year, the net of the year before (its gross unknown)',
    podTaken?.length === 2 &&
      podTaken[0].form === 'pod' && nonzero(podTaken[0].grossEur) === nonzero(pod26.grossEur) && nonzero(podTaken[0].balanceEur) === nonzero(pod26.balanceEur) && podTaken[0].assetsGross === pod26.grossEur.r001 * 100 &&
      nonzero(podTaken[1].balanceEur) === nonzero(pod25.balanceEur) && Object.keys(podTaken[1].grossEur).length === 0,
    JSON.stringify(podTaken?.[1]),
  )
  const asStatements = takeoverStore.statementsOfPrior(taken[0])
  check('the statements taken over stand where the closing reads the year before: the rows as filed, the size figures', asStatements.form === 'muj' && asStatements.balanceEur === taken[0].balanceEur && asStatements.turnover === taken[0].turnover && asStatements.unplaced.length === 0)
  check('a file that is no statements of eDane is none', takeover.priorStatements('<dokument><hlavicka/></dokument>') === null && takeover.priorStatements('<a') === null)

  // An open item taken over is settled in the books by the payment that comes later.
  const co = { id: 'c1', name: 'Firma s. r. o.', icdph: null, vatStatus: 'none', vatQuarterly: false, vatSince: null, startOn: '2027-01-01', vatCarry: 0 }
  const item = {
    id: 'old',
    companyId: 'c1',
    createdAt: Date.parse('2027-01-05T10:00:00Z') / 1000,
    source: 'takeover',
    kind: 'invoice_in',
    number: 'D-77',
    party: 'Dodávateľ s. r. o.',
    partyIco: null,
    issuedOn: '2026-12-20',
    dueOn: '2027-01-03',
    totalCents: 30000,
    vatCents: 0,
    currency: 'EUR',
    category: null,
    vatDeduct: null,
    account: null,
    bookedAt: 1,
    paidPrivately: false,
    paymentId: 'p1',
    vat: { mode: 'none', lines: [], suppliedOn: null, vatId: null, corrects: null, period: null },
    partyVatId: null,
    suppliedOn: null,
    foreign: null,
    correctsHint: null,
    linesHint: [],
  }
  const payment = { id: 'p1', bookedOn: '2027-01-10', amountCents: -30000, currency: 'EUR', party: 'Dodávateľ s. r. o.', vs: null, note: null, exempt: null, exemptNote: null, contra: null, bankId: 'b1', bank: '221.001' }
  const opening = [{ id: 'ps', kind: 'opening', number: 'PS', on: '2027-01-01', text: 'Počiatočné stavy', lines: [{ md: '221.001', d: '701', cents: 100000 }, { md: '701', d: '321', cents: 30000 }, { md: '701', d: '411', cents: 70000 }], createdAt: 1, createdByName: null }]
  const settled = ledger.buildBooks({ company: co, docs: [item], payments: [payment], banks: [{ id: 'b1', iban: 'SK3112000000198742637541', ledger: '221.001', balanceCents: 70000, balanceOn: '2027-01-10' }], filed: [], manual: opening })
  const paid = settled.entries.find((e) => e.paymentId === 'p1')
  check(
    'an invoice taken over stands in the open items, its payment settles 321 and waits for nothing',
    paid?.lines.map((l) => `${l.md}/${l.d}:${l.cents}`).join() === '321/221.001:30000' && settled.items.find((i) => i.docId === 'old')?.settled === 30000 && settled.issues.waiting.length === 0 && settled.issues.beforeStart.docs === 1,
    JSON.stringify({ paid, items: settled.items, issues: settled.issues }),
  )
  const unpaid = ledger.buildBooks({ company: co, docs: [{ ...item, paymentId: null }], payments: [], banks: [], filed: [], manual: opening })
  check('an invoice taken over and not yet paid is open in the saldokonto by what is left', unpaid.items.length === 1 && unpaid.items[0].total === 30000 && unpaid.items[0].settled === 0 && unpaid.entries.every((e) => e.docId !== 'old'))
  const uploaded = ledger.buildBooks({ company: co, docs: [{ ...item, source: 'upload', paymentId: null }], payments: [], banks: [], filed: [], manual: opening })
  check('an old invoice the client uploaded (paid before us) is no open item', uploaded.items.length === 0)
}

// Foreign currencies (17 October 2026): the ECB's rates, a document and a payment in euros, the exchange differences.
{
  check('a rate in millionths, as the ECB and as Slovak writes it; none that is no rate', fx.rateMicro('25.308') === 25308000 && fx.rateMicro('1,0823') === 1082300 && fx.rateMicro('162.53') === 162530000 && fx.rateMicro('0') === null && fx.rateMicro('1.2.3') === null && fx.rateText(25308000) === '25,308' && fx.rateText(2000000) === '2')
  check('550 000 CZK at 25,308 is 21 732,26 € (FR SR 297846); 100 USD at 1,0823 is 92,40 €, a credit note minus', fx.eurOf(55000000, 25308000) === 2173226 && fx.eurOf(10000, 1082300) === 9240 && fx.eurOf(-10000, 1082300) === -9240)
  const ecb = `<?xml version="1.0"?><gesmes:Envelope xmlns:gesmes="http://www.gesmes.org/xml/2002-08-01" xmlns="http://www.ecb.int/vocabulary/2002-08-01/eurofxref"><Cube>
    <Cube time="2024-03-11"><Cube currency="CZK" rate="25.295"/><Cube currency="USD" rate="1.0926"/></Cube>
    <Cube time="2024-03-08"><Cube currency="CZK" rate="25.308"/><Cube currency="USD" rate="1.0932"/></Cube>
    <Cube time="2024-03-07"><Cube currency="CZK" rate="25.270"/></Cube></Cube></gesmes:Envelope>`
  const read = fx.parseEcb(ecb)
  const rates = fx.ratesOf(read)
  check("the ECB's file: every day's rate of every currency", read.length === 5 && rates.get('CZK')?.length === 3 && rates.get('CZK')?.[0]?.[0] === '2024-03-07')
  check(
    'the rate of the day before: an invoice of Monday 11.3.2024 at Friday\'s 25,308 (FR SR 297846); the balance sheet day at its own',
    fx.rateFor(rates, 'CZK', '2024-03-11')?.rate === 25308000 && fx.rateFor(rates, 'CZK', '2024-03-10')?.day === '2024-03-08' && fx.rateFor(rates, 'CZK', '2024-03-11', 'onOrBefore')?.rate === 25295000,
  )
  check('no rate before the first kept, none for a currency not kept, none older than a fortnight', fx.rateFor(rates, 'CZK', '2024-03-07') === null && fx.rateFor(rates, 'GBP', '2024-03-11') === null && fx.rateFor(rates, 'CZK', '2024-04-30') === null)
  check('the last day the ECB declared: a Saturday the Friday, a Monday morning the Friday, a Monday evening the Monday', lastDeclared('2026-10-17', true) === '2026-10-16' && lastDeclared('2026-10-19', false) === '2026-10-16' && lastDeclared('2026-10-19', true) === '2026-10-19')
  const proposal = vat.proposeVat({ id: 'v', kind: 'invoice_in', number: 'US-1', party: 'Cloud Inc.', partyIco: null, partyVatId: null, suppliedOn: null, corrects: null, lines: [], issuedOn: '2026-03-10', receivedOn: '2026-03-12', totalCents: 10000, vatCents: 0, currency: 'USD', rate: 1080000, category: 'services', vatDeduct: true, foreign: true, booked: false, vat: null }, { status: 'payer', quarterly: false, since: null })
  check('a purchase in dollars with its rate: the reverse charge proposed in euros', proposal?.mode === 'reverse' && proposal.lines[0]?.base === 9259 && proposal.lines[0]?.vat === 2130, JSON.stringify(proposal))

  // The books of a company with documents and payments in other currencies.
  const co = { id: 'c1', name: 'Firma s. r. o.', icdph: null, vatStatus: 'none', vatQuarterly: false, vatSince: null, startOn: '2026-01-01', vatCarry: 0 }
  const doc = (id, fields) => ({ id, companyId: 'c1', createdAt: Date.parse('2026-03-12T10:00:00Z') / 1000, source: 'upload', kind: 'invoice_in', number: id, party: 'Partner', partyIco: null, issuedOn: '2026-03-10', dueOn: null, totalCents: 0, vatCents: 0, currency: 'EUR', category: 'services', vatDeduct: null, account: null, bookedAt: 1, paidPrivately: false, paymentId: null, vat: null, partyVatId: null, suppliedOn: null, foreign: null, correctsHint: null, linesHint: [], ...fields })
  const pay = (id, bookedOn, amountCents, fields = {}) => ({ id, bookedOn, amountCents, currency: 'EUR', party: 'Partner', vs: null, note: null, exempt: null, exemptNote: null, contra: null, bankId: 'b1', bank: '221.001', ...fields })
  const table = fx.ratesOf([
    { currency: 'USD', day: '2026-03-09', rate: '1.08' },
    { currency: 'USD', day: '2026-05-29', rate: '1.10' },
    { currency: 'USD', day: '2026-12-31', rate: '1.00' },
    { currency: 'CZK', day: '2026-11-19', rate: '25.3' },
    { currency: 'CZK', day: '2026-12-31', rate: '25.0' },
  ])
  const opening = [{ id: 'ps', kind: 'opening', number: 'PS', on: '2026-01-01', text: 'PS', lines: [{ md: '221.001', d: '701', cents: 1000000 }, { md: '701', d: '411', cents: 1000000 }], createdAt: 1, createdByName: null }]
  const books = ledger.buildBooks({
    company: co,
    rates: table,
    docs: [
      doc('usd-in', { totalCents: 100000, currency: 'USD', paymentId: 'p1' }),
      doc('czk-out', { kind: 'invoice_out', totalCents: 2530000, currency: 'CZK', issuedOn: '2026-11-20', category: 'sales', paymentId: 'p2' }),
      doc('usd-card', { kind: 'receipt', totalCents: 1000, currency: 'USD', issuedOn: '2026-03-10', paymentId: 'p3' }),
      doc('gbp', { totalCents: 5000, currency: 'GBP', paymentId: 'p4' }),
    ],
    payments: [
      pay('p1', '2026-03-20', -93000),
      pay('p2', '2027-01-15', 101000),
      pay('p3', '2026-03-10', -930),
      pay('p4', '2026-03-20', -6000),
      pay('p5', '2026-06-01', 100000, { currency: 'USD', bankId: 'b2', bank: '221.002', contra: '365', party: 'Spoločník' }),
    ],
    banks: [
      { id: 'b1', iban: 'SK3112000000198742637541', ledger: '221.001', balanceCents: null, balanceOn: null },
      { id: 'b2', iban: 'SK6809000000000999966666', ledger: '221.002', balanceCents: 100000, balanceOn: '2026-06-30', currency: 'USD' },
    ],
    filed: [],
    manual: opening,
  })
  const linesOf = (key) => (books.entries.find((e) => e.key === key)?.lines ?? []).map((l) => `${l.md}/${l.d}:${l.cents}`).join(' ')
  check('an invoice of 1 000 USD at the ECB\'s 1,08 of the day before it: 925,93 €', linesOf('d:usd-in') === '518/321:92593', linesOf('d:usd-in'))
  check('paid with 930 € from the euro account: the difference of 4,07 € a loss on 563, the invoice settled', linesOf('p:p1') === '321/221.001:93000 563/321:407' && books.items.find((i) => i.docId === 'usd-in')?.settled === books.items.find((i) => i.docId === 'usd-in')?.total, linesOf('p:p1'))
  check(
    'an issued invoice of 25 300 CZK open at the year\'s end: 1 000 € revalued at the rate of 31 December to 1 012 €, a gain on 663',
    linesOf('d:czk-out') === '311/602:100000' && linesOf('fx:2026') === '311/663:1200',
    `${linesOf('d:czk-out')} | ${linesOf('fx:2026')}`,
  )
  check('its payment of 1 010 € the next year settles what it stands at since: a loss of 2 €', linesOf('p:p2') === '221.001/311:101000 563/311:200', linesOf('p:p2'))
  check('a receipt of 10 USD paid alone by card: the 9,30 € the bank took, against the bank on its day', linesOf('d:usd-card') === '518/221.001:930' && !books.entries.some((e) => e.key === 'p:p3'), linesOf('d:usd-card'))
  check('a document in a currency without a rate is said and not booked; its payment waits', (books.issues.unrated ?? []).includes('gbp') && !books.entries.some((e) => e.key === 'd:gbp') && books.issues.waiting.includes('p4'))
  check(
    'a payment on a dollar account at the rate of the day before it, and the account revalued at the year\'s end from its balance in dollars',
    linesOf('p:p5') === '221.002/365:90909' && linesOf('fxb:2026:b2') === '221.002/663:9091',
    `${linesOf('p:p5')} | ${linesOf('fxb:2026:b2')}`,
  )
  const noRates = ledger.buildBooks({ company: co, docs: [doc('usd-in', { totalCents: 100000, currency: 'USD', fxRate: '1.25' })], payments: [], banks: [], filed: [], manual: opening })
  check('the rate the accountant confirmed counts without any kept: 1 000 USD at 1,25 is 800 €', noRates.entries.find((e) => e.key === 'd:usd-in')?.lines[0]?.cents === 80000)
}

// The one-stop shop (17 October 2026): a quarter's return of supplies to consumers in other member states.
{
  const xsdText = readFileSync(new URL('./xsd/dposs_eu01.xsd', import.meta.url), 'utf8')
  const validOss = async (xml, name) => {
    const result = await validateXML({ xml: [{ fileName: `${name}.xml`, contents: xml }], schema: [{ fileName: 'dposs_eu01.xsd', contents: xsdText }] })
    return { ok: result.valid, why: result.errors.map((e) => e.message).join(' | ') }
  }
  check('the quarter, its range and its deadline: the last day of the month after it, not moved', oss.quarterOfDay('2026-08-15') === '2026-Q3' && oss.quarterRange('2026-Q1').to === '2026-03-31' && oss.ossDue('2026-Q3') === '2026-10-31' && oss.ossDue('2026-Q4') === '2027-01-31' && oss.ossDue('2027-Q1') === '2027-04-30' && oss.nextQuarter('2026-Q4') === '2027-Q1' && oss.prevQuarter('2027-Q1') === '2026-Q4')
  const supply = (id, fields) => ({ id, number: id, day: '2026-08-10', country: 'DE', goods: true, lines: [{ rate: 19, base: 10000, vat: 1900, deduct: 0 }], currency: 'EUR', fxRate: null, corrects: null, ...fields })
  const rates = fx.ratesOf([{ currency: 'CZK', day: '2026-09-30', rate: '25.0' }, { currency: 'CZK', day: '2026-12-31', rate: '24.5' }])
  const supplies = [
    supply('a'),
    supply('b', { lines: [{ rate: 19, base: 5000, vat: 950, deduct: 0 }] }),
    supply('c', { country: 'AT', goods: false, lines: [{ rate: 20, base: 20000, vat: 4000, deduct: 0 }] }),
    supply('d', { country: 'FR', lines: [{ rate: 5.5, base: 1000, vat: 55, deduct: 0 }] }),
    supply('e', { country: 'CZ', currency: 'CZK', fxRate: 25500000, lines: [{ rate: 21, base: 4000, vat: 840, deduct: 0 }] }),
    supply('f', { day: '2026-11-02' }),
  ]
  const q3 = oss.ossLines(supplies, '2026-Q3', rates)
  const line = (c, r) => q3.lines.find((l) => l.country === c && l.rate === r)
  check(
    "a quarter's lines: each state's tax by kind and rate, the standard rate told from a reduced one, the next quarter's left out",
    q3.issues.length === 0 && line('DE', 19)?.base === 15000 && line('DE', 19)?.vat === 2850 && line('DE', 19)?.standard && line('AT', 20)?.goods === false && line('FR', 5.5)?.standard === false && q3.lines.length === 4,
    JSON.stringify(q3),
  )
  check("an amount in another currency at the ECB's rate of the quarter's last day: 40 € at 25,5 CZK is 1 020 CZK, at 25,0 it is 40,80 €", line('CZ', 21)?.base === 4080 && line('CZ', 21)?.vat === 857)
  const bad = oss.ossLines([supply('x', { country: null }), supply('y', { country: 'XI', goods: false }), supply('z', { currency: 'USD', fxRate: 1080000 })], '2026-Q3', rates)
  check('what keeps lines from being declared: no state, services to Northern Ireland, no rate of the quarter\'s end', bad.issues.map((i) => i.code).join() === 'country,rate,xi', JSON.stringify(bad.issues))
  const credit = supply('g', { day: '2026-10-05', corrects: 'a', lines: [{ rate: 19, base: -2000, vat: -380, deduct: 0 }] })
  check('a credit note belongs to the quarter of the invoice it corrects', oss.supplyQuarter(credit, [...supplies, credit]) === '2026-Q3' && oss.ossLines([...supplies, credit], '2026-Q4', rates).lines.every((l) => l.vat > 0))

  const filedQ3 = { quarter: '2026-Q3', lines: q3.lines, corrections: [], filedOn: '2026-10-20' }
  const after = [...supplies, credit]
  const fixes = oss.ossCorrections('2026-Q4', [filedQ3], (q) => oss.ossLines(after, q, rates).lines)
  check("a change of a filed quarter goes into the next return as each state's correction", fixes.length === 1 && fixes[0].quarter === '2026-Q3' && fixes[0].country === 'DE' && fixes[0].cents === -380, JSON.stringify(fixes))
  const q4 = oss.ossLines(after, '2026-Q4', rates)
  const { balances, total } = oss.ossBalances(q4.lines, fixes)
  check("each state's balance is its tax and its corrections; the total due", balances.length === 1 && balances[0].country === 'DE' && balances[0].cents === 1900 - 380 && total === 1520)
  const filedQ4 = { quarter: '2026-Q4', lines: q4.lines, corrections: fixes, filedOn: '2027-01-20' }
  check('a correction filed once is not carried again', oss.ossCorrections('2027-Q1', [filedQ3, filedQ4], (q) => oss.ossLines(after, q, rates).lines).length === 0)

  const xml = oss.ossXml('SK2120000007', '2026-Q4', q4.lines, fixes)
  let v = await validOss(xml, 'oss')
  check('the return is valid against DPOSS_EUv01: supplies, a correction, the balances, the total due', v.ok && xml.includes('<VATNumber issuedBy="SK">2120000007</VATNumber>') && xml.includes('<VATRate type="STANDARD">19.00</VATRate>') && xml.includes('<TotalVATAmountCorrection currency="EUR">-3.80</TotalVATAmountCorrection>') && xml.includes('<TotalVATAmountDue currency="EUR">15.20</TotalVATAmountDue>'), v.why)
  v = await validOss(oss.ossXml('SK2120000007', '2026-Q3', q3.lines, []), 'oss-q3')
  check('a quarter of four states, kinds and a reduced rate is valid too', v.ok, v.why)
  const nil = oss.ossXml('SK2120000007', '2027-Q1', [], [])
  v = await validOss(nil, 'oss-nil')
  check('a quarter without supplies is filed with nought due', v.ok && !nil.includes('<Supplies>') && nil.includes('<TotalVATAmountDue currency="EUR">0.00</TotalVATAmountDue>'), v.why)

  const view = (q, filed, today) => oss.ossView(q, '2026-07-01', after, filed, rates, today)
  check(
    "a quarter's state: running while it runs, ready after it, waiting while the one before is not filed, filed, changed once a later change reaches it",
    view('2026-Q4', [], '2026-12-15').state === 'running' &&
      view('2026-Q3', [], '2026-10-02').state === 'ready' &&
      view('2026-Q4', [], '2027-01-05').state === 'waiting' &&
      view('2026-Q4', [filedQ3], '2027-01-05').state === 'ready' &&
      view('2026-Q3', [{ ...filedQ3, lines: oss.ossLines(supplies, '2026-Q3', rates).lines }], '2026-10-02').state === 'changed' &&
      view('2026-Q3', [{ ...filedQ3, lines: oss.ossLines(after, '2026-Q3', rates).lines }], '2026-10-02').state === 'filed',
  )
}

// Intrastat (17 October 2026): the monthly reports of goods moved to and from other member states.
{
  const xsdText = readFileSync(new URL('./xsd/instat62.xsd', import.meta.url), 'latin1').replace('encoding = "ISO-8859-2"', 'encoding = "UTF-8"')
  const validInstat = async (xml, name) => {
    const bytes = intrastat.latin2(xml)
    const back = new TextDecoder('iso-8859-2').decode(bytes)
    const result = await validateXML({ xml: [{ fileName: `${name}.xml`, contents: back.replace('encoding="ISO-8859-2"', 'encoding="UTF-8"') }], schema: [{ fileName: 'instat62.xsd', contents: xsdText }] })
    return { ok: result.valid && back === xml, why: result.errors.map((e) => e.message).join(' | ') }
  }
  check('a VAT number\'s member state as Intrastat names it: EL is GR, Slovakia and a third country are none', intrastat.stateOfVatId('EL123456789') === 'GR' && intrastat.stateOfVatId('de 123456789') === 'DE' && intrastat.stateOfVatId('SK2020000000') === null && intrastat.stateOfVatId('CHE123456789') === null && intrastat.stateOfVatId('XI123456789') === 'XI')
  check('the deadline: the fifteenth day after the month, a Sunday moved to Monday', intrastat.intrastatDue('2026-09') === '2026-10-15' && intrastat.intrastatDue('2026-10') === '2026-11-16' && intrastat.intrastatDue('2027-04') === '2027-05-17')
  check('the value up to the whole euro and at least 1 €; the net mass in kilograms, under 1 kg up, otherwise half up', intrastat.reportEuros(100001) === 1001 && intrastat.reportEuros(100000) === 1000 && intrastat.reportEuros(40) === 1 && intrastat.reportKg(400) === 1 && intrastat.reportKg(1499) === 1 && intrastat.reportKg(1500) === 2 && intrastat.reportKg(12500) === 13)
  check('the thresholds of 2026: 1 000 000 € each flow, 200 000 € and 400 000 € for agriculture and food; a later year keeps them until its own', intrastat.thresholdOf(2026, 'A', false) === 100_000_000 && intrastat.thresholdOf(2026, 'A', true) === 20_000_000 && intrastat.thresholdOf(2026, 'D', true) === 40_000_000 && intrastat.thresholdOf(2028, 'D', false) === 100_000_000)
  const settings = { ...intrastat.settingsOf(JSON.stringify({ arrivals: '2026-01', dispatches: '2026-06', origin: 'SK', terms: 'EXW', nature: 'zz' })) }
  check('settings read back with the usual values where none is valid', settings.arrivals === '2026-01' && settings.dispatches === '2026-06' && settings.nature === '11' && settings.transport === '3' && settings.terms === 'EXW' && settings.origin === 'SK' && intrastat.settingsOf(null).arrivals === null)
  const g = (fields) => ({ ...intrastat.EMPTY_GOODS, ...fields })
  const doc = (id, fields) => ({ id, number: id, party: 'TEST-ONLY', mode: 'acquisition', month: '2026-09', cents: 50000, vatId: 'DE123456789', booked: true, goods: null, ...fields })
  const docs = [
    doc('small'),
    doc('big', { cents: 250000 }),
    doc('lines', {
      cents: 300000,
      goods: g({ lines: [{ cn: '84713000', description: 'Notebooky', origin: 'CN', grams: 12500, su: 'p/st', quantity: 10000, cents: 200000 }, { cn: '85044095', description: null, origin: null, grams: 400, su: null, quantity: null, cents: null }] }),
    }),
    doc('out', { mode: 'eu_goods', cents: 120000, vatId: 'EL123456789', goods: g({ lines: [{ cn: '40082110', description: 'Rohože', origin: null, grams: 80000, su: null, quantity: null, cents: null }] }) }),
    doc('nostate', { mode: 'eu_goods', cents: 30000, vatId: null }),
    doc('credit', { cents: -20000 }),
    doc('back', { mode: 'eu_goods', cents: -40000, vatId: 'AT123456789', goods: g({ returned: true }) }),
    doc('later', { month: '2026-10' }),
    doc('draft', { booked: false }),
  ]
  const a = intrastat.monthItems(docs, '2026-09', 'A', settings)
  const item = (key) => a.items.find((i) => i.key === key)
  check(
    "arrivals: an invoice below 1 000 € simply, one with goods line by line, the line without a value takes the rest; the origin of an arrival without one is the state it came from",
    item('small:s')?.cn === '99500000' && item('small:s')?.euros === 500 && item('small:s')?.partner === null && item('lines:0')?.euros === 2000 && item('lines:1')?.euros === 1000 && item('lines:1')?.origin === 'DE' && item('lines:0')?.kg === 13 && item('lines:0')?.quantity === 10 && item('lines:1')?.kg === 1 && item('lines:0')?.nature === '11' && item('lines:0')?.terms === 'EXW',
    JSON.stringify(a.items),
  )
  check('a return of goods supplied before is an arrival with the nature 2/1', item('back:s')?.country === 'AT' && item('back:s')?.euros === 400 && intrastat.flowOf(docs.find((d) => d.id === 'back')) === 'A')
  check(
    'what keeps arrivals back: a document from 1 000 € without goods, one not booked; a credit note without goods coming back is only said; another month is left out',
    a.issues.map((i) => `${i.code}:${i.ids.join('|')}`).join() === 'unbooked:draft,goods:big' && intrastat.creditNotes(docs, '2026-09').map((d) => d.id).join() === 'credit' && !a.items.some((i) => i.docId === 'later'),
    JSON.stringify(a.issues),
  )
  const d = intrastat.monthItems(docs, '2026-09', 'D', settings)
  check("dispatches: Greece as GR, the partner's VAT number as given, the origin from the settings; no member state is said", d.items.length === 1 && d.items[0].country === 'GR' && d.items[0].partner === 'EL123456789' && d.items[0].origin === 'SK' && d.items[0].kg === 80 && d.items[0].euros === 1200 && d.issues.map((i) => i.code).join() === 'country', JSON.stringify(d))
  const backLine = (origin) => g({ returned: true, lines: [{ cn: '84713000', description: null, origin, grams: 5000, su: null, quantity: null, cents: null }] })
  const goneBack = intrastat.monthItems([doc('ret-a', { cents: -150000, vatId: 'EL123456789', goods: backLine(null) })], '2026-09', 'D', settings).items[0]
  const cameBack = intrastat.monthItems([doc('ret-d', { mode: 'eu_goods', cents: -150000, vatId: 'AT123456789', goods: backLine(null) })], '2026-09', 'A', settings).items[0]
  check(
    "goods that go back keep their origin: acquired goods returned are of the supplier's state, our goods coming back of ours (review of 18 October 2026)",
    goneBack?.origin === 'GR' && goneBack?.nature === '21' && cameBack?.origin === 'SK' && cameBack?.country === 'AT',
    JSON.stringify([goneBack, cameBack]),
  )
  const bad = intrastat.monthItems([doc('v', { cents: 300000, goods: g({ lines: [{ cn: '8471', description: null, origin: null, grams: 1, su: null, quantity: null, cents: null }] }) }), doc('w', { cents: 300000, goods: g({ lines: [{ cn: '84713000', description: null, origin: null, grams: 1, su: null, quantity: null, cents: 100 }] }) }), doc('x', { cents: 300000, goods: g({ lines: [{ cn: '84713000', description: null, origin: null, grams: null, su: 'p/st', quantity: null, cents: null }] }) })], '2026-09', 'A', settings)
  check('a code of fewer than eight digits, values that do not make the base, a supplementary unit without its quantity', bad.issues.map((i) => i.code).join() === 'cn,quantity,values', JSON.stringify(bad.issues))

  const psi = { vatId: 'SK2020123456', name: 'TEST-ONLY Žltá ťava s. r. o.', ...intrastat.splitAddress('Hlavná 1, 040 01 Košice'), address: 'Hlavná 1, 040 01 Košice', contact: 'Lucia Horváthová', phone: null, email: 'ahoj@firmony.ai' }
  check('the address in its parts', psi.street === 'Hlavná 1' && psi.postal === '04001' && psi.city === 'Košice')
  const goodItems = a.items
  const first = intrastat.firstDeclarations(goodItems)
  const xml = intrastat.instatXml(psi, '2026-09', 'A', first, 9101, { date: '2026-10-10', time: '09:15:00' })
  let v = await validInstat(xml, 'instat-a')
  check('the arrivals report is valid against instat62.xsd and comes back the same from ISO-8859-2', v.ok && xml.includes('<envelopeId>AA09101</envelopeId>') && xml.includes('<functionCode>O</functionCode>') && xml.includes('<CN8Code>99500000</CN8Code>') && xml.includes('<CN8><CN8Code>84713000</CN8Code><SUCode>p/st</SUCode></CN8>') && xml.includes('<totalNumberLines>4</totalNumberLines>') && !xml.includes('partnerId'), v.why)
  const dx = intrastat.instatXml(psi, '2026-09', 'D', intrastat.firstDeclarations(d.items), 9201, { date: '2026-10-10', time: '09:15:00' })
  v = await validInstat(dx, 'instat-d')
  check('the dispatches report carries the partner and the nature in its two codes', v.ok && dx.includes('<partnerId>EL123456789</partnerId>') && dx.includes('<NatureOfTransaction><natureOfTransactionACode>1</natureOfTransactionACode><natureOfTransactionBCode>1</natureOfTransactionBCode></NatureOfTransaction>') && dx.includes('<MSConsDestCode>GR</MSConsDestCode>'), v.why)
  const nil = intrastat.instatXml(psi, '2026-10', 'A', intrastat.firstDeclarations([]), 10101, { date: '2026-11-10', time: '08:00:00' })
  v = await validInstat(nil, 'instat-nil')
  check('a month without goods is a nil report', v.ok && nil.includes('<functionCode>N</functionCode>') && !nil.includes('<Item>') && !nil.includes('totalNumberLines'), v.why)
  check('more than 30 000 items go into further reports', intrastat.firstDeclarations(Array.from({ length: 30001 }, (_, n) => ({ ...goodItems[0], key: `k${n}` }))).map((x) => `${x.id}:${x.items.length}`).join() === '1:30000,2:1')

  const filing = { seq: 1, filedOn: '2026-10-10', envelope: 9101, declarations: first }
  const changedItems = goodItems.filter((i) => i.key !== 'small:s').map((i) => (i.key === 'lines:0' ? { ...i, euros: 2100 } : i))
  const added = { ...goodItems[0], key: 'new:s', docId: 'new', euros: 77 }
  const f = intrastat.followUpOf([filing], [...changedItems, added])
  check('after filing: an item added, one changed, one gone', f.added.map((i) => i.key).join() === 'new:s' && f.changed.map((i) => i.key).join() === 'lines:0' && f.removed.map((i) => i.key).join() === 'small:s')
  const follow = intrastat.followUpDeclarations([filing], f)
  const o = follow.find((x) => x.fn === 'O')
  const m = follow.find((x) => x.fn === 'M')
  check(
    'what follows: the new item in report 2, the changed and the gone in a correction of report 1 by their numbers, the gone with the value 0',
    o?.id === 2 && o.items[0]?.no === 1 && m?.id === 1 && m.correction === 1 && m.items.map((i) => `${i.no}:${i.euros}`).join() === `${first[0].items.find((i) => i.key === 'small:s').no}:0,${first[0].items.find((i) => i.key === 'lines:0').no}:2100`,
    JSON.stringify(follow.map((x) => ({ id: x.id, fn: x.fn, c: x.correction, items: x.items.map((i) => [i.key, i.no, i.euros]) }))),
  )
  const fx = intrastat.instatXml(psi, '2026-09', 'A', follow, 9102, { date: '2026-11-02', time: '10:00:00' })
  v = await validInstat(fx, 'instat-m')
  check('the supplementary and corrective reports are valid; the correction names its number in the series', v.ok && fx.includes('<functionCode>M</functionCode><previousDeclarationId>1</previousDeclarationId>') && fx.includes('<numberOfDeclarations>2</numberOfDeclarations>') && fx.includes('<invoicedAmount>0</invoicedAmount>'), v.why)
  const second = { seq: 2, filedOn: '2026-11-02', envelope: 9102, declarations: follow }
  check('once sent, nothing follows; another correction of report 1 is the second in its series', intrastat.isEmptyFollowUp(intrastat.followUpOf([filing, second], [...changedItems, added])) && intrastat.followUpDeclarations([filing, second], intrastat.followUpOf([filing, second], changedItems.map((i) => (i.key === 'lines:1' ? { ...i, euros: 999 } : i)).concat([added]))).find((x) => x.fn === 'M')?.correction === 2)

  const view = (month, flow, filings, today, s = settings) => intrastat.intrastatView(docs.filter((x) => x.id !== 'big' && x.id !== 'draft'), month, flow, s, filings, today)
  check(
    "a month's state: not reported before the month in the settings, running, ready, filed, changed; blocked by what keeps it back",
    view('2026-05', 'D', [], '2026-06-10').state === 'none' &&
      view('2026-09', 'A', [], '2026-09-20').state === 'running' &&
      view('2026-09', 'A', [], '2026-10-02').state === 'ready' &&
      intrastat.intrastatView(docs, '2026-09', 'A', settings, [], '2026-10-02').state === 'blocked' &&
      view('2026-09', 'A', [{ ...filing, declarations: intrastat.firstDeclarations(view('2026-09', 'A', [], '2026-10-02').items) }], '2026-10-12').state === 'filed' &&
      view('2026-09', 'A', [{ ...filing, declarations: intrastat.firstDeclarations(goodItems.slice(1)) }], '2026-10-12').state === 'changed',
  )
  check('nothing to send while something blocks', intrastat.declarationsToSend(intrastat.intrastatView(docs, '2026-09', 'A', settings, [], '2026-10-02')) === null && intrastat.declarationsToSend(view('2026-09', 'A', [], '2026-10-02'))?.[0]?.fn === 'O')
  const many = [doc('t1', { month: '2025-11', cents: 60_000_000 }), doc('t2', { month: '2026-02', cents: 30_000_000 }), doc('t3', { month: '2026-04', cents: 50_000_000 }), doc('t4', { month: '2026-05', cents: 30_000_000 })]
  const w = intrastat.thresholdWatch(many, 'A', '2026-06', false)
  check('the threshold: the window before the year, the year so far and the month it is crossed in', w.window === 0 && w.year === 110_000_000 && w.from === '2026-05' && intrastat.thresholdWatch(many, 'A', '2027-03', false).from === '2027-01')
  const bytes = intrastat.latin2('Žltá ťava, Öl, € a ñ')
  check('ISO-8859-2: Slovak and German letters as they are, a letter it lacks without its accent, anything else "?"', new TextDecoder('iso-8859-2').decode(bytes) === 'Žltá ťava, Öl, ? a n')
}

// Joint-stock companies (17 October 2026): the legal form and the board from the register, who may conclude online, and
// a year's result distributed by the Commercial Code.
{
  check(
    "the legal form by the register's code, else by the name",
    rpo.legalFormOf('121', null, null) === 'as' && rpo.legalFormOf('125', null, null) === 'jsa' && rpo.legalFormOf('112', null, null) === 'sro' && rpo.legalFormOf('113', 'Verejná obchodná spoločnosť', 'X, v. o. s.') === null &&
      rpo.legalFormOf(null, null, 'Strojáreň a. s.') === 'as' && rpo.legalFormOf(null, null, 'KLIMAK, j. s. a.') === 'jsa' && rpo.legalFormOf(null, null, 'Zelený dvor, spol. s r. o.') === 'sro' && rpo.legalFormOf(null, 'Akciová spoločnosť', 'Niečo') === 'as',
  )
  const entity = rpo.readEntity(
    {
      legalForms: [{ value: { value: 'Akciová spoločnosť', code: '121' }, validFrom: '2001-01-01' }],
      statutoryBodies: [
        { stakeholderType: { value: 'Predstavenstvo', code: '99' }, statutoryBodyMember: { value: 'Predseda predstavenstva' }, personName: { formatedName: 'Ján Kováč' } },
        { stakeholderType: { value: 'Predstavenstvo', code: '99' }, personName: { givenNames: ['Eva'], familyNames: ['Horná'] } },
        { stakeholderType: { value: 'Dozorná rada', code: '50' }, personName: { formatedName: 'Igor Dozorný' } },
        { stakeholderType: { value: 'Predstavenstvo', code: '99' }, statutoryBodyMember: { value: 'Člen predstavenstva' }, personName: { formatedName: 'Starý Člen' }, validTo: '2020-01-01' },
      ],
      authorizations: [{ value: 'V mene spoločnosti konajú spoločne dvaja členovia predstavenstva.' }, { value: 'Prokurista koná samostatne.' }],
    },
    '2026-10-17',
  )
  check(
    "the board in office with each member's role, the supervisory board left out, the manner of acting without the proxy's",
    entity.form === 'as' && entity.directors.map((d) => `${d.name}:${d.role}`).join() === 'Ján Kováč:Predseda predstavenstva,Eva Horná:Člen predstavenstva' && entity.acting === 'V mene spoločnosti konajú spoločne dvaja členovia predstavenstva.',
    JSON.stringify(entity),
  )
  check(
    'one may conclude alone by the words of the register: "samostatne" without anything that asks for more; a mixed text is for a person',
    rpo.actingMode('Konateľ koná v mene spoločnosti samostatne.') === 'alone' &&
      rpo.actingMode('Členovia štatutárneho orgánu konajú samostatne.') === 'alone' &&
      rpo.actingMode('V mene Spoločnosti konajú spoločne ktorýkoľvek dvaja členovia predstavenstva.') === 'joint' &&
      rpo.actingMode('Vo všetkých veciach sú oprávnení konať najmenej dvaja členovia predstavenstva.') === 'joint' &&
      rpo.actingMode('Konať sú oprávnení všetci členovia predstavenstva, pričom samostatne predseda predstavenstva.') === 'unknown' &&
      rpo.actingMode(null) === 'unknown',
  )
  check(
    'acting alone only when the register says it of every member, without a limit of an amount (review of 18 October 2026)',
    rpo.actingMode('V mene spoločnosti koná predseda predstavenstva samostatne.') === 'unknown' &&
      rpo.actingMode('V mene spoločnosti koná každý konateľ samostatne; pri úkonoch nad 10 000 eur je potrebný podpis oboch konateľov.') === 'unknown' &&
      rpo.actingMode('Konateľ koná samostatne do sumy 5 000 eur, nad túto sumu konajú obidvaja konatelia.') === 'unknown' &&
      rpo.actingMode('Vo všetkých veciach koná a podpisuje každý konateľ samostatne. Podpisovanie: k obchodnému menu pripojí konateľ svoj podpis.') === 'alone' &&
      rpo.actingMode('Konatelia konajú obidvaja spoločne.') === 'joint' &&
      rpo.readActing({ authorizations: [{ value: 'Konatelia konajú spoločne.' }, { value: 'Prokúra je udelená ako samostatná.' }] }, '2026-10-18') === 'Konatelia konajú spoločne.',
  )
  const two = [{ name: 'A B', role: 'Konateľ' }, { name: 'C D', role: 'Konateľ' }]
  check(
    'who concludes online: the only member, or one who acts alone; members who act together, or a board the register did not name, sign on paper',
    rpo.oneMayConclude('sro', [two[0]], null) && rpo.oneMayConclude('sro', two, 'Každý konateľ koná samostatne.') && !rpo.oneMayConclude('sro', two, 'Konatelia konajú spoločne.') && !rpo.oneMayConclude('sro', two, null) && rpo.oneMayConclude('sro', null, null) && !rpo.oneMayConclude('as', null, null),
  )
  check('the role a paper writes after the name', rpo.signerRole('as', 'Predseda predstavenstva') === 'predseda predstavenstva' && rpo.signerRole('jsa', null) === 'člen predstavenstva' && rpo.signerRole('sro', '') === 'konateľ' && rpo.signerRole(null, null) === 'konateľ')

  const balances = new Map([['411', -2_500_000], ['421', -50_000], ['428', -200_000], ['429', 30_000], ['602', -1_500_000], ['518', 400_000], ['591', 100_000], ['221.001', 3_520_000]])
  const eq = distribution.equityOf(balances)
  check("the year's equity: the result after tax, the capital, the fund, what was kept and the losses", eq.result === 1_000_000 && eq.capital === 2_500_000 && eq.reserve === 50_000 && eq.retained === 200_000 && eq.losses === 30_000, JSON.stringify(eq))
  const minAs = distribution.reserveMinimum('as', eq)
  const minSro = distribution.reserveMinimum('sro', eq)
  const capped = distribution.reserveMinimum('sro', { ...eq, reserve: 240_000 })
  check(
    'the reserve fund: an a. s. 10 % of the profit until 20 % of the capital, an s. r. o. 5 % until 10 %, never past the cap, nothing out of a loss',
    minAs.cents === 100_000 && minAs.cap === 500_000 && minSro.cents === 50_000 && minSro.cap === 250_000 && capped.cents === 10_000 && distribution.reserveMinimum('as', { ...eq, result: -5 }).cents === 0,
  )
  const d = (fields) => ({ approvedOn: '2027-05-15', reserve: 100_000, cover: 0, dividends: 0, people: 0, payoutOn: null, ...fields })
  check(
    "what keeps a distribution back: dividends before the fund's share, more than may be paid out, more to natural persons than the dividends, a day in the year itself, amounts out of a loss",
    distribution.distributionIssues('as', 2026, eq, d({ reserve: 50_000, dividends: 100_000 })).join() === 'reserve' &&
      distribution.distributionIssues('as', 2026, eq, d({ dividends: 1_100_000 })).join() === 'tooMuch' &&
      distribution.distributionIssues('as', 2026, eq, d({ dividends: 100_000, people: 200_000 })).join() === 'people' &&
      distribution.distributionIssues('as', 2026, eq, d({ approvedOn: '2026-12-31' })).join() === 'day' &&
      distribution.distributionIssues('as', 2026, { ...eq, result: -10_000 }, d({ dividends: 1 })).join() === 'loss' &&
      distribution.distributionIssues('as', 2026, eq, d({ cover: 30_000, dividends: 1_040_000 })).join() === '',
  )
  check(
    'booked: the fund, old losses covered, dividends out of the profit and then out of what was kept, the rest kept; a loss carried to 429',
    JSON.stringify(distribution.distributionLines(eq, d({ cover: 30_000, dividends: 1_000_000 }))) ===
      JSON.stringify([
        { md: '431', d: '421', cents: 100_000 },
        { md: '431', d: '429', cents: 30_000 },
        { md: '431', d: '364', cents: 870_000 },
        { md: '428', d: '364', cents: 130_000 },
      ]) &&
      JSON.stringify(distribution.distributionLines(eq, d({ dividends: 400_000 }))) === JSON.stringify([{ md: '431', d: '421', cents: 100_000 }, { md: '431', d: '364', cents: 400_000 }, { md: '431', d: '428', cents: 500_000 }]) &&
      JSON.stringify(distribution.distributionLines({ ...eq, result: -70_000 }, d({}))) === JSON.stringify([{ md: '429', d: '431', cents: 70_000 }]),
  )
  check(
    'the tax withheld on dividends to natural persons: 7 %, 10 % of the profits of 2024; paid and noticed by the 15th after the payout, a working day',
    distribution.withheldOf(2026, { people: 500_000 }) === 35_000 && distribution.withheldOf(2024, { people: 500_000 }) === 50_000 && distribution.dividendTaxDue('2027-05-20') === '2027-06-15' && distribution.dividendTaxDue('2026-10-02') === '2026-11-16' && distribution.dividendTaxDue('2026-12-10') === '2027-01-15',
  )
  check(
    "the reserve fund gets its share of a profit whether or not anything is paid out (review of 18 October 2026)",
    distribution.distributionIssues('sro', 2026, eq, d({ reserve: 0 })).join() === 'reserve' && distribution.distributionIssues('sro', 2026, eq, d({ reserve: 50_000 })).join() === '',
  )
  const loss = { ...eq, result: -20_000 }
  check(
    'a loss year: covered out of what was kept or the reserve fund, the rest carried, dividends out of what is left after the losses',
    distribution.distributionIssues('as', 2026, loss, d({ reserve: 0, cover: 5_000, fromReserve: 10_000, dividends: 100_000 })).join() === '' &&
      JSON.stringify(distribution.distributionLines(loss, d({ reserve: 0, cover: 5_000, fromReserve: 10_000, dividends: 100_000 }))) ===
        JSON.stringify([
          { md: '428', d: '431', cents: 5_000 },
          { md: '421', d: '431', cents: 10_000 },
          { md: '429', d: '431', cents: 5_000 },
          { md: '428', d: '364', cents: 100_000 },
        ]) &&
      distribution.distributionIssues('as', 2026, loss, d({ reserve: 0, fromReserve: 60_000 })).join() === 'coverLoss,fund' &&
      distribution.distributionIssues('as', 2026, loss, d({ reserve: 0, dividends: 150_001 })).join() === 'tooMuch' &&
      distribution.distributionIssues('as', 2026, loss, d({ reserve: 0, dividends: 150_000 })).join() === '',
  )
  check(
    'dividends to natural persons out of profits taxed at the other rate: only out of what was kept, 2024 at 10 %, before 2024 at 7 % when the year is 2024',
    distribution.distributionIssues('as', 2026, eq, d({ cover: 30_000, dividends: 1_040_000, people: 500_000, peopleOther: 170_000 })).join() === '' &&
      distribution.distributionIssues('as', 2026, eq, d({ cover: 30_000, dividends: 1_040_000, people: 500_000, peopleOther: 170_001 })).join() === 'other' &&
      distribution.distributionIssues('as', 2023, eq, d({ cover: 30_000, dividends: 1_040_000, people: 500_000, peopleOther: 1 })).join() === 'other' &&
      distribution.withheldOf(2026, { people: 500_000, peopleOther: 100_000 }) === 38_000 &&
      distribution.withheldOf(2024, { people: 500_000, peopleOther: 100_000 }) === 47_000 &&
      distribution.withheldOf(2025, { people: 100_000, peopleOther: 40_000, basis: loss }) === 8_200 &&
      distribution.withheldOf(2024, { people: 100_000, basis: loss }) === 7_000,
  )
  const kept = distribution.distributionOf(JSON.stringify(d({ fromReserve: 3, peopleOther: 2, basis: loss })))
  check(
    'a distribution keeps the equity it was booked against, so a change of the year is seen',
    kept?.fromReserve === 3 && kept.peopleOther === 2 && distribution.sameEquity(kept.basis, loss) && !distribution.sameEquity(kept.basis, eq),
  )
  check('a distribution read back, and nothing from a broken one', distribution.distributionOf(JSON.stringify(d({ dividends: 5, payoutOn: '2027-06-01' })))?.payoutOn === '2027-06-01' && distribution.distributionOf('{') === null && distribution.distributionOf(JSON.stringify({ reserve: 1 })) === null)
}

// Bratislava's day and clock without Intl (18 October 2026): the same as Intl at every moment, summer time included.
{
  const intlDay = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Bratislava' })
  const intlClock = new Intl.DateTimeFormat('sk-SK', { timeZone: 'Europe/Bratislava', hour: 'numeric', minute: '2-digit' })
  const moments = []
  for (let year = 2019; year <= 2036; year++) {
    for (const month of [2, 9]) {
      const last = new Date(Date.UTC(year, month + 1, 0))
      const change = Date.UTC(year, month, last.getUTCDate() - last.getUTCDay(), 1) / 1000
      for (const shift of [-3601, -1, 0, 1, 3599, 3600, 7199, 7200, 82800, 86399]) moments.push(change + shift)
    }
  }
  let seed = 7
  for (let n = 0; n < 4000; n++) {
    seed = (seed * 48271) % 2147483647
    moments.push(1546300800 + (seed % 568024668))
  }
  const wrong = moments.filter((m) => time.bratislavaDay(m) !== intlDay.format(new Date(m * 1000)) || time.bratislavaClock(m) !== intlClock.format(new Date(m * 1000)))
  check("Bratislava's day and clock are Intl's at every moment tried, at the changes of summer time too", wrong.length === 0 && moments.length > 4000, wrong.slice(0, 3).map((m) => `${m}: ${time.bratislavaDay(m)} ${time.bratislavaClock(m)} / ${intlDay.format(new Date(m * 1000))} ${intlClock.format(new Date(m * 1000))}`).join(' | '))
  check('a working day remembered is the same as worked out', vat.workingDayFrom('2026-04-03') === '2026-04-07' && vat.workingDayFrom('2026-04-03') === '2026-04-07' && vat.workingDayFrom('2026-12-24') === '2026-12-28')
}

done('units')
