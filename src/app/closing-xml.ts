// The files of the closing the Financial Administration takes: the corporate income tax return (DPPOv25, its schema
// form.622.sk.xsd), the financial statements of a micro entity (UZMUJv14, form.301.sk.xsd) and of a small or a large
// one (UZPODv14, form.302.sk.xsd), written as the official eForms write them, so that "Načítať zo súboru" in eDane or
// in the client's internet zone opens them as they are. test/xsd holds the schemas, and the unit checks validate every
// file written here against them.
//
// Every element the schema asks for is present, empty when the row is not filled; amounts of the return have two
// decimals and a full stop, the statements' are whole euros; days are DD.MM.YYYY. A form for the period 2026 (DPPOv26)
// is published by the Financial Directorate in January 2027: its schema replaces the one here then.
import { BRAND, OPERATOR, TEAM } from '../config'
import { addressParts, amount, nameLines } from './vat-xml'
import type { EntitySize, Statements, TaxResult } from './closing'
import { BALANCE_ROWS, PROFIT_ROWS } from './closing'
import { POD_ASSET_ROWS, POD_LIABILITY_ROWS, POD_PROFIT_ROWS } from './closing-pod'

const esc = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const el = (name: string, value: string | number = '') => `<${name}>${esc(String(value))}</${name}>`
const group = (name: string, inner: string[]) => `<${name}>${inner.join('')}</${name}>`
const empties = (names: readonly string[]) => names.map((n) => el(n))
const textDay = (day: string): string => `${day.slice(8, 10)}.${day.slice(5, 7)}.${day.slice(0, 4)}`
const flag = (on: boolean) => (on ? '1' : '0')
const rows = (from: number, to: number, prefix = 'r', width = 2) => Array.from({ length: to - from + 1 }, (_, i) => `${prefix}${String(from + i).padStart(width, '0')}`)

/** An SK NACE code as the forms take it: "62.01.0" is 62, 01 and 0. Null when it is none. */
export function naceParts(code: string | null | undefined): { k1: string; k2: string; k3: string } | null {
  const m = /^(\d{2})\.?(\d{2})\.?(\d)$/.exec((code ?? '').replace(/\s/g, ''))
  return m ? { k1: m[1] as string, k2: m[2] as string, k3: m[3] as string } : null
}

/** The company the closing is of, as both forms name it. */
export interface ClosingFiler {
  name: string
  ico: string | null
  dic: string | null
  address: string | null
  registerLine: string | null
  /** SK NACE of its main activity, "62.01.0", and the activity in words. */
  nace: string
  activity: string
}

export interface ReturnOptions {
  year: number
  /** The tax period: from (the company's founding in its first one) to the end of the year. */
  from: string
  to: string
  declaredOn: string
  kind: 'R' | 'O' | 'D'
  foundOn?: string | null
  micro: boolean
  minimumHalf: boolean
  minimumExempt: boolean
  /** Table F: revenues, costs, the result before tax. */
  tableF: { r01: number; r02: number; r03: number }
}

/** The rows of the return that are filled whenever a return is filed: the computation from row 100 to the tax to pay. */
const COMPUTED = new Set([
  'r100',
  'r130',
  'r200',
  'r300',
  'r301',
  'r310',
  'r400',
  'r410',
  'r500',
  'r510',
  'r550',
  'r560',
  'r600',
  'r700',
  'r800',
  'r810',
  'r820',
  'r830',
  'r900',
  'r1010',
  'r1040',
  'r1050',
  'r1080',
  'r1110',
])

const RETURN_ROWS = [
  'r100', 'r110', 'r130', 'r140', 'r150', 'r170', 'r180', 'r200', 'r210', 'r220', 'r230', 'r240', 'r250', 'r260', 'r270', 'r280', 'r290', 'r300',
  'r301', 'r302', 'r303', 'r304', 'r305', 'r306', 'r307', 'r308', 'r310', 'r320', 'r330', 'r400', 'r410', 'r500', 'r501', 'r502', 'r503', 'r510',
  'r550', 'r560', 'r600',
] as const
const RETURN_ROWS_AFTER_610 = [
  'r700', 'r710', 'r800', 'r810', 'r820', 'r830', 'r840', 'r900', 'r910', 'r920', 'r1000', 'r1010', 'r1020', 'r1030', 'r1040', 'r1050',
  'r1060', 'r1061', 'r1062', 'r1070', 'r1071', 'r1080', 'r1090', 'r1100', 'r1101', 'r1110',
] as const

/** The corporate income tax return of a period, as a file of DPPOv25. */
export function dppoXml(filer: ClosingFiler, tax: TaxResult, opts: ReturnOptions): string {
  const a = addressParts(filer.address)
  const nace = naceParts(filer.nace) ?? { k1: '0', k2: '0', k3: '0' }
  const lines = nameLines(filer.name, 37, 3)
  const r = tax.rows
  const value = (row: string): string => {
    const v = r[row] ?? 0
    if (row === 'r550') return String(tax.rate)
    // The tax to pay or the overpayment: the one that applies.
    if (row === 'r1100') return (r.r1101 ?? 0) < 0 ? '' : amount(v)
    if (row === 'r1101') return v < 0 ? amount(v) : ''
    if (row === 'r1000' || row === 'r910' || row === 'r920') return (r.r920 ?? 0) > 0 ? amount(v) : ''
    return COMPUTED.has(row) || v !== 0 ? amount(v) : ''
  }
  const tableA = rows(1, 17).map((row) => el(row, (tax.tableA[row] ?? 0) !== 0 ? amount(tax.tableA[row] ?? 0) : ''))
  // Table B: filled whenever the books depreciated or the tax did, every row of it (rows 150 and 250 are read from it).
  const tableB = rows(1, 6).map((row) => el(row, tax.tableBUsed ? amount(tax.tableB[row] ?? 0) : ''))
  // Table D: columns 4 to 8 hold the losses of the five periods before, the oldest first; column 9 their totals.
  const losses = tax.losses.filter((l) => l.amount > 0).slice(-5)
  const lossColumn = (i: number) => {
    const l = losses[i]
    return group(`tabDs0${i + 4}`, l ? [el('datumOd', `01.01.${l.year}`), el('datumDo', `31.12.${l.year}`), el('r01', amount(l.amount)), el('r02', amount(l.now)), el('r03', amount(l.left))] : empties(['datumOd', 'datumDo', 'r01', 'r02', 'r03']))
  }
  const lossTotal = losses.length > 0 ? [el('r01', amount(losses.reduce((s, l) => s + l.amount, 0))), el('r02', amount(r.r410 ?? 0)), el('r03', amount(losses.reduce((s, l) => s + l.left, 0)))] : empties(['r01', 'r02', 'r03'])
  const tabD = group('tabD', [
    group('tabDs01', empties(['r01', 'r02', 'r03'])),
    group('tabDs02', empties(['datumOd', 'datumDo', 'r01', 'r02', 'r03'])),
    group('tabDs03', empties(['datumOd', 'datumDo', 'r01', 'r02', 'r03'])),
    lossColumn(0),
    lossColumn(1),
    lossColumn(2),
    lossColumn(3),
    lossColumn(4),
    group('tabDs09', lossTotal),
  ])
  // Table K: the minimum tax of up to four periods before, credited now.
  const credits = tax.minimumCredits.filter((c) => c.amount > 0).slice(-4)
  const creditPeriod = (i: number) => {
    const c = credits[i]
    return group(
      `obdobie${i + 1}`,
      c
        ? [el('datumOd', `01.01.${c.year}`), el('datumDo', `31.12.${c.year}`), el('vyskaKladnehoRozdielu', amount(c.amount)), el('zapocitanaVPredObdobiach', amount(c.usedBefore)), el('zapocitanaVDanomObdobi', amount(c.now)), el('zostavajucaCast', amount(c.left))]
        : empties(['datumOd', 'datumDo', 'vyskaKladnehoRozdielu', 'zapocitanaVPredObdobiach', 'zapocitanaVDanomObdobi', 'zostavajucaCast']),
    )
  }
  const tabK = group('tabK', [
    group('obdobiaMinimalDane', [creditPeriod(0), creditPeriod(1), creditPeriod(2), creditPeriod(3)]),
    group('spolu', credits.length > 0 ? [el('zapocitanaVDanomObdobi', amount(r.r920 ?? 0)), el('zostavajucaCast', amount(credits.reduce((s, c) => s + c.left, 0)))] : empties(['zapocitanaVDanomObdobi', 'zostavajucaCast'])),
  ])
  const two = (names: string[]) => names.map((n) => group(n, empties(['s1', 's2'])))
  const tabI = group(
    'tabI',
    rows(1, 18).map((row) => group(row, empties(['druh', 'vplyvNaR100', 'nazovZavislejOsoby', 'kodStatu']))),
  )
  const [surname, ...given] = TEAM.bootstrapName.split(' ').reverse()
  const operator = addressParts(`${OPERATOR.street}, ${OPERATOR.postalCity}`)
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<dokument>',
    '<hlavicka>',
    el('dic', filer.dic ?? ''),
    el('ico', filer.ico ?? ''),
    el('pravnaForma', '112'),
    group('typDP', [el('rdp', flag(opts.kind === 'R')), el('odp', flag(opts.kind === 'O')), el('ddp', flag(opts.kind === 'D'))]),
    group('zdanovacieObdobie', [el('od', textDay(opts.from)), el('do', textDay(opts.to))]),
    group('skNace', [el('k1', nace.k1), el('k2', nace.k2), el('k3', nace.k3), el('cinnost', filer.activity)]),
    group('obchodneMeno', [el('riadok', lines[0] ?? ''), el('riadok', lines[1] ?? ''), ...(lines[2] ? [el('riadok', lines[2])] : [])]),
    group('sidlo', [el('ulica', a.street), el('cislo', a.number), el('psc', a.postal), el('obec', a.city), el('stat', OPERATOR.country), el('tel', ''), el('emailFax', '')]),
    el('uplatnujemPar17', '0'),
    el('ukoncujemUplatnovaniePar17', '0'),
    el('obmedzenie', '0'),
    el('prepojenie', '0'),
    el('uplatnenieOslobodeniaPar13ab', '0'),
    el('mikrodanovnikPar2w', flag(opts.micro)),
    el('polovicnaVyskaDanePar46b3', flag(opts.minimumHalf && !opts.minimumExempt)),
    el('neplatenieMinDanePar46b7', flag(opts.minimumExempt)),
    el('zapocitanieMinDanePar46b5', flag((r.r920 ?? 0) > 0)),
    group('stalaPrevadzkaren', empties(['ulica', 'cislo', 'psc', 'obec', 'pocetSp'])),
    '</hlavicka>',
    '<telo>',
    ...RETURN_ROWS.map((row) => el(row, value(row))),
    group('r610', [el('text', ''), el('suma', '')]),
    ...RETURN_ROWS_AFTER_610.map((row) => el(row, value(row))),
    el('ddpDatum', opts.kind === 'D' && opts.foundOn ? textDay(opts.foundOn) : ''),
    ...empties(['r1120', 'r1130', 'r1140', 'r1150', 'r1160', 'r1170', 'r1180', 'r1190', 'r1191', 'r1192']),
    group('tabA', tableA),
    group('tabB', tableB),
    group('tabC1', empties(rows(1, 6))),
    group('tabC2', empties(rows(1, 6))),
    tabD,
    group('tabE', empties(rows(1, 10))),
    group('tabF', [el('r01', amount(opts.tableF.r01)), el('r02', amount(opts.tableF.r02)), el('r03', amount(opts.tableF.r03))]),
    group('tabG1', empties(rows(1, 3))),
    group('tabG2', empties(rows(1, 3))),
    group('tabG3', empties(rows(1, 4))),
    group('tabH', [el('r01'), group('prijmy', empties(rows(2, 10))), group('vydavky', empties(rows(2, 10))), el('r11')]),
    tabI,
    group('tabJ', empties(rows(1, 2))),
    group('obmedzenaDanovaPovinnost', empties(['datumOd', 'datumDo', 'TIN'])),
    tabK,
    group('zdaneniePar17f', [...two(rows(1, 6)), ...empties(rows(7, 13)), ...two(rows(14, 19)), ...empties(rows(20, 31))]),
    group('podielyNaZiskuPar51e', [...empties(rows(1, 3)), ...two(rows(4, 6)), ...empties(rows(7, 9))]),
    group('vynosyZoStatnychDlhopisov', [...two(rows(1, 3, 'r', 1)), group('r4', [el('s1', '16'), el('s2', '13')]), ...two(rows(5, 14, 'r', 1))]),
    // Part VII: the share of the tax for a recipient (§ 50) is the client's to decide; not assigned unless the accountant fills it in eDane.
    el('c7paragraf50', '1'),
    el('suhlasZasl', '0'),
    ...empties(['c7r1', 'c7r2', 'c7r3', 'c7r4', 'c7r5']),
    group('c7prijimatel1', [el('suma'), el('ico'), group('obchodneMeno', [el('riadok'), el('riadok')])]),
    el('osobitneZaznamy', ''),
    group('opravnenaOsoba', [
      el('priezvisko', surname ?? ''),
      el('meno', given.reverse().join(' ')),
      el('titul', ''),
      el('titulZa', ''),
      el('postavenie', `splnomocnenec, ${OPERATOR.name}`),
      group('trvalyPobyt', [el('ulica', operator.street), el('cislo', operator.number), el('psc', operator.postal), el('obec', operator.city), el('stat', OPERATOR.country), el('tel', OPERATOR.phone), el('emailFax', BRAND.email)]),
    ]),
    el('pocetPriloh', '0'),
    el('datumVyhlasenia', textDay(opts.declaredOn)),
    group('platenieDanePar17f', [el('ziadam17f', '0'), ...Array.from({ length: 5 }, () => group('splatka', empties(['datumSplat', 'suma']))), el('datum')]),
    group('vrateniePreplatku', [el('vratit', '0'), group('sposobPlatby', [el('poukazka', '0'), el('ucet', '0')]), group('bankovyUcet', [el('IBAN')]), el('datum')]),
    group('prilPar13aA13b', empties(['r01', 'cisloPatentuSoftver', 'r02', 'cisloPatentu', 'r03'])),
    '</telo>',
    '</dokument>',
    '',
  ].join('\n')
}

export interface StatementsOptions {
  year: number
  from: string
  preparedOn: string
  approvedOn?: string | null
  /** The size group: a small or a large entity files Úč POD and says which it is. */
  size?: EntitySize
}

/**
 * The financial statements as a file: of a micro entity in UZMUJv14, of a small or a large one in UZPODv14 (the forms
 * the statements were made on), the current year and the one before, in whole euros.
 */
export function statementsXml(filer: ClosingFiler, current: Statements, previous: Statements | null, opts: StatementsOptions): string {
  const a = addressParts(filer.address)
  const nace = naceParts(filer.nace) ?? { k1: '0', k2: '0', k3: '0' }
  const lines = nameLines(filer.name, 37, 2)
  const register = nameLines(filer.registerLine ?? '', 37, 2)
  const pod = current.form === 'pod'
  const fromMonth = String(Number(opts.from.slice(5, 7)))
  const before = previous && previous.form === current.form ? previous : null
  const header = [
    group('datumK', [el('den', '31'), el('mesiac', '12'), el('rok', String(opts.year))]),
    el('dic', filer.dic ?? ''),
    el('ico', filer.ico ?? ''),
    group('skNace', [el('k1', nace.k1), el('k2', nace.k2), el('k3', nace.k3)]),
    group('typUzavierky', [el('riadna', '1'), el('mimoriadna', '0'), el('priebezna', '0'), ...(pod ? [el('mala', flag(opts.size !== 'large')), el('velka', flag(opts.size === 'large'))] : [])]),
    group('obdobie', [group('od', [el('mesiac', fromMonth), el('rok', opts.from.slice(0, 4))]), group('do', [el('mesiac', '12'), el('rok', String(opts.year))])]),
    group('bPredObdobie', before ? [group('od', [el('mesiac', '1'), el('rok', String(opts.year - 1))]), group('do', [el('mesiac', '12'), el('rok', String(opts.year - 1))])] : [group('od', [el('mesiac'), el('rok')]), group('do', [el('mesiac'), el('rok')])]),
    group('prilozeneSucasti', [el('suvaha', '1'), el('vykazZiskovStrat', '1'), el('poznamky', '1')]),
    group('uctJednotka', [
      group('obchMeno', [el('riadok', lines[0] ?? ''), el('riadok', lines[1] ?? '')]),
      group('sidlo', [el('ulica', a.street), el('cislo', a.number), el('psc', a.postal), el('obec', a.city), group('oznObchodReg', [el('riadok', register[0] ?? ''), el('riadok', register[1] ?? '')]), el('telefon', ''), el('fax', ''), el('email', '')]),
    ]),
    el('datZostavenia', textDay(opts.preparedOn)),
    el('datSchvalenia', opts.approvedOn ? textDay(opts.approvedOn) : ''),
  ]
  const pair = (row: string, mine: Record<string, number>, past: Record<string, number> | null, names: [string, string] = ['s1', 's2']) =>
    group(row, [el(names[0], mine[row] ?? 0), el(names[1], past ? (past[row] ?? 0) : '')])
  const body = pod
    ? [
        // Assets: the gross amount, the correction, the net, and the net of the year before; then equity and liabilities.
        group('ucPod1Suvaha', [
          ...POD_ASSET_ROWS.map((row) =>
            group(row, [el('s1', current.grossEur[row] ?? 0), el('s2', current.fixEur[row] ?? 0), el('s3', current.balanceEur[row] ?? 0), el('s4', before ? (before.balanceEur[row] ?? 0) : '')]),
          ),
          ...POD_LIABILITY_ROWS.map((row) => pair(row, current.balanceEur, before?.balanceEur ?? null, ['s5', 's6'])),
        ]),
        group('ucPod2VykazZS', POD_PROFIT_ROWS.map((row) => pair(row, current.profitEur, before?.profitEur ?? null))),
      ]
    : [
        group('ucMuj1Suvaha', BALANCE_ROWS.map((row) => pair(row, current.balanceEur, before?.balanceEur ?? null))),
        group('ucMuj2VykazZS', PROFIT_ROWS.map((row) => pair(row, current.profitEur, before?.profitEur ?? null))),
      ]
  return ['<?xml version="1.0" encoding="UTF-8"?>', '<dokument>', '<hlavicka>', ...header, '</hlavicka>', '<telo>', ...body, '</telo>', '</dokument>', ''].join('\n')
}
