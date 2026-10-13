import { existsSync, readFileSync } from 'node:fs'
import { calc, config, copy, format, ico, planRows, rpo } from '../.wrangler/tmp/units-bundle.mjs'
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
check('the receipt totals the lowest price', copy.receipt.totalValue === format.formatEur(start.price * 100))
check('the closing price is the config one', copy.pricing.closing.includes(format.formatEur(config.CLOSING_PRICE * 100)))
check('every plan row is filled', config.PLANS.every((p) => Object.values(planRows(p)).every((v) => typeof v === 'string' && v.length > 0)))
const texts = []
const walk = (value) => (typeof value === 'string' ? texts.push(value) : Array.isArray(value) ? value.forEach(walk) : value && typeof value === 'object' ? Object.values(value).forEach(walk) : null)
walk(copy)
check('no dash in any text', texts.every((t) => !/[–—]/.test(t) && !/ - /.test(t)), texts.find((t) => /[–—]/.test(t) || / - /.test(t)))
check('no one-letter word ends a line', texts.every((t) => !/(^|\s)[vszkouaiVSZKOUAI] /.test(t)), texts.find((t) => /(^|\s)[vszkouaiVSZKOUAI] /.test(t)))
check('no straight quotes', texts.every((t) => !/"/.test(t)))

done('units')
