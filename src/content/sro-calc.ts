// The words of the SRO corporate-tax and dividend calculator (/sro-kalkulacka). Figures from app/sro-calc.ts,
// verified 23 October 2026; the minimum tax (§ 46b) added 26 October 2026 from the closing's own bands (app/closing.ts).
import { BRAND } from '../config'
import { formatEur, formatEurExact } from '../format'
import { SRO_DIVIDEND_RATE, SRO_YEAR, sroCalc, sroMinimumBands, type SroResult } from '../app/sro-calc'

const eur = (cents: number) => formatEurExact(cents)

export const SRO_PATH = '/sro-kalkulacka'

const example = sroCalc({ year: SRO_YEAR, revenue: 12_000_000, expenses: 4_000_000 })
const small = sroCalc({ year: SRO_YEAR, revenue: 3_000_000, expenses: 2_800_000 })
const bands = sroMinimumBands(SRO_YEAR)
const bandsText = bands.map((b, i) => (b.upTo === null ? `${formatEur(b.tax)} nad ${formatEur(bands[i - 1]?.upTo ?? 0)}` : `${formatEur(b.tax)} do ${formatEur(b.upTo)}`)).join(', ')

/** Said under a result whose tax is the minimum tax: what the rate would have given. */
export const sroMinimumNote = (r: SroResult): string => `Daň ${r.rate} % zo zisku by bola ${eur(r.computed)}, preto sa platí minimálna daň ${eur(r.minimum)}.`

export const SRO_PAGE = {
  title: `Kalkulačka dane s. r. o. a dividend | ${BRAND.name}`,
  description: `Vypočítajte orientačnú daň z príjmov s. r. o. (10 %, 21 % alebo 24 % podľa výnosov, najmenej minimálna daň) a zrážkovú daň z dividend 7 %.`,
  first: 'Kalkulačka pre s. r. o.',
  second: 'Daň a dividendy.',
  lead: `Zadajte ročný príjem a výdavky a zistíte, koľko zaplatí s. r. o. na dani z príjmov a koľko zostane spoločníkovi po zdanení dividend. Orientačný výpočet.`,
  form: {
    revenue: 'Ročné príjmy (výnosy)',
    expenses: 'Ročné výdavky',
    button: 'Vypočítať',
    error: 'Sumy píšte v eurách, napríklad 120 000 alebo 120000,50. Výdavky môžu byť aj 0.',
    empty: `Napríklad príjem ${eur(12_000_000)} a výdavky ${eur(4_000_000)}: daň s. r. o. ${eur(example.corporate)}, daň z dividend ${eur(example.dividend)}, spoločníkovi zostane ${eur(example.net)}.`,
  },
  result: {
    profit: 'Zisk (základ dane)',
    corporate: 'Daň z príjmov s. r. o.',
    corporateMinimum: 'Daň z príjmov s. r. o. (minimálna daň)',
    netProfit: 'Zisk po zdanení',
    dividend: `Zrážková daň z dividend (${SRO_DIVIDEND_RATE} %)`,
    net: 'Spoločníkovi zostane',
    note: `Sadzba dane sa určuje podľa výnosov (10 % do 100 000 €, 21 % do 5 000 000 €, 24 % nad) a použije sa na zisk. Daň je najmenej minimálna daň podľa výnosov: ${bandsText}. Prvé zdaňovacie obdobie novej firmy minimálnu daň neplatí. Zrážková daň 7 % platí pre zisk od roku 2025. Orientačný výpočet bez odpočítateľných položiek.`,
  },
  faq: [
    {
      q: `Koľko zaplatí s. r. o. s príjmom ${eur(12_000_000)} a výdavkami ${eur(4_000_000)}?`,
      a: `Daň z príjmov ${eur(example.corporate)} a po vyplatení zisku aj zrážková daň z dividend ${eur(example.dividend)}. Spoločníkovi zostane ${eur(example.net)}.`,
    },
    {
      q: 'Koľko zaplatí s. r. o. s malým ziskom?',
      a: `Pri príjme ${eur(small.query.revenue)} a výdavkoch ${eur(small.query.expenses)} je zisk ${eur(small.profit)}. Daň ${small.rate} % by bola ${eur(small.computed)}, ale s. r. o. platí najmenej minimálnu daň ${eur(small.minimum)}. Prvé zdaňovacie obdobie novej firmy minimálnu daň neplatí.`,
    },
    {
      q: 'Čo je výhodnejšie: živnostník alebo s. r. o.?',
      a: `Záleží na príjme a nákladoch. Živnostník platí odvody (SP 33,15 % a ZP 16 %) a daň z príjmov, s. r. o. daň z príjmov a pri výplate aj daň z dividend. Porovnajte v kalkulačke pre živnostníkov a v tejto.`,
    },
    {
      q: 'Platí s. r. o. odvody ako živnostník?',
      a: 'Nie. Odvody do poisťovní platí s. r. o. iba za zamestnancov a konateľov. Samotná s. r. o. platí daň z príjmov a pri rozdeľovaní zisku zrážkovú daň z dividend.',
    },
  ],
  sources: [
    { title: 'Zákon č. 595/2003 Z. z. o dani z príjmov (Slov-Lex)', url: 'https://www.slov-lex.sk/ezbierky/pravne-predpisy/SK/ZZ/2003/595/' },
    { title: 'Zákon o dani z príjmov: § 46b, minimálna daň (Slov-Lex)', url: 'https://static.slov-lex.sk/static/SK/ZZ/2003/595/20260101.html#paragraf-46b' },
    { title: 'Finančná správa: daň z príjmov PO', url: 'https://podpora.financnasprava.sk/' },
  ],
  published: '2026-10-23',
  modified: '2026-10-26',
  nav: 'Kalkulačka pre s. r. o.',
} as const
