// The words of the SZČO tax-and-levy calculator (/szco-kalkulacka). Every figure comes from the engine (app/szco-calc.ts)
// or app/payroll.ts, so the page can never say another figure than it computes. Verified 23 October 2026; social
// insurance by the income test from 1 July 2026 read on 26 October 2026 (sources at the top of app/szco-calc.ts).
import { BRAND } from '../config'
import { formatEur, formatEurExact } from '../format'
import {
  SZCO_PAUSAL_CAP,
  SZCO_PAUSAL_PCT,
  SZCO_SP_RATE,
  SZCO_TEST_FROM,
  SZCO_ZP_RATE,
  szcoBases,
  szcoCalc,
  szcoHealthPremium,
  szcoPremium,
  szcoTest,
  szcoYears,
  type SzcoHalf,
  type SzcoResult,
} from '../app/szco-calc'

const eur = (cents: number) => formatEurExact(cents)
/** Limits, bases and monthly premiums in a sentence: whole euros without ",00". */
const sum = (cents: number) => formatEur(cents)
const pct = (n: number) => `${String(n).replace('.', ',')} %`

export const SZCO_PATH = '/szco-kalkulacka'
const years = szcoYears()
const first = years[0] as number
const last = years[years.length - 1] as number
const span = years.length > 1 ? `${first} a ${last}` : String(first)

const example = szcoCalc({ year: first, revenue: 2_500_000, mode: 'pausal', expenses: 0 })
const test = szcoTest(first)
const bases = szcoBases(first)
const zpMinimum = szcoHealthPremium(bases.health)

/** What the year's income test means, one sentence a year from the first test on. */
const testOf = (year: number): string => {
  const t = szcoTest(year)
  const b = szcoBases(year)
  return `Od 1. júla ${year} sa posudzuje príjem za rok ${year - 1}: do ${sum(t.lower)} sa sociálne poistenie neplatí, do ${sum(t.upper)} sa platí z osobitného základu ${sum(b.special)} (${sum(szcoPremium(b.special))} mesačne) a pri vyššom príjme najmenej ${sum(szcoPremium(b.minimum))} mesačne.`
}

/** The sentence of a half year of the result: the band the income falls in and what it pays a month. */
const halfText = (h: SzcoHalf): string =>
  h.band === 'none'
    ? `príjem do ${sum(h.test.lower)}, sociálne poistenie sa neplatí.`
    : h.band === 'special'
      ? `príjem do ${sum(h.test.upper)}, sociálne poistenie z osobitného základu ${sum(h.base)}, teda ${sum(h.monthly)} mesačne.`
      : h.limit === 'minimum'
        ? `príjem nad ${sum(h.test.upper)}, sociálne poistenie z minimálneho základu ${sum(h.base)}, teda ${sum(h.monthly)} mesačne.`
        : h.limit === 'maximum'
          ? `príjem nad ${sum(h.test.upper)}, sociálne poistenie z maximálneho základu ${sum(h.base)}, teda ${sum(h.monthly)} mesačne.`
          : `príjem nad ${sum(h.test.upper)}, sociálne poistenie zo základu dane cez koeficient 1,486, teda ${sum(h.monthly)} mesačne.`

const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

/** What the result's social insurance follows: one sentence, or one a half year when the halves differ. */
export function szcoSocialNote(r: SzcoResult): string[] {
  const [h1, h2] = r.social
  if (h1.band === h2.band && h1.monthly === h2.monthly) return [capital(halfText(h2))]
  return [`Január až jún: ${halfText(h1)}`, `Júl až december: ${halfText(h2)}`]
}

/** The assumptions of a result, the year's own said for the first year of the test. */
export function szcoNote(year: number): string {
  const transition = year === SZCO_TEST_FROM ? ` Rok ${year} počítame celý podľa pravidiel od 1. júla ${year}, hoci od januára do júna ${year} platili pre doterajších živnostníkov prechodné pravidlá.` : ''
  return `Výpočet je orientačný pre živnostníka, ktorý podniká celý rok aj rok predtým, bez súbehu so zamestnaním a bez zdravotného postihnutia. Príjem za predchádzajúci rok berieme rovnaký ako tento rok.${transition} Ročné zúčtovanie môže výsledok zmeniť.`
}

export const SZCO_PAGE = {
  title: `Kalkulačka odvodov a dane pre živnostníkov ${span} | ${BRAND.name}`,
  description: `Vypočítajte orientačné odvody do Sociálnej a zdravotnej poisťovne a daň z príjmov živnostníka (SZČO) za rok ${span} s paušálnymi výdavkami 60 %.`,
  first: 'Kalkulačka pre živnostníkov.',
  second: 'Odvody a daň SZČO.',
  lead: `Zadajte ročný príjem a zistíte, koľko živnostník zaplatí na odvodoch a dani a čo mu zostane. Počíta podľa pravidiel na rok ${span}, s paušálnymi výdavkami ${pct(SZCO_PAUSAL_PCT)}.`,
  form: {
    revenue: 'Ročný príjem (bez DPH)',
    year: 'Rok',
    expenses: 'Paušálne výdavky 60 % (do 20 000 €)',
    real: 'Skutočné výdavky',
    realSum: 'Skutočné výdavky v eurách',
    button: 'Vypočítať',
    error: 'Príjem napíšte v eurách, napríklad 25 000 alebo 25000,50.',
    empty: `Napríklad príjem ${eur(2_500_000)} v roku ${first} s paušálom: odvody ${eur(example.odvody)}, daň ${eur(example.tax)}, zostane ${eur(example.net)} pred skutočnými nákladmi na podnikanie.`,
  },
  result: {
    revenue: 'Ročný príjem',
    expenses: `Paušálne výdavky (${pct(SZCO_PAUSAL_PCT)}, strop ${eur(SZCO_PAUSAL_CAP)})`,
    realExpenses: 'Skutočné výdavky',
    czd: 'Čiastkový základ dane',
    sp: `Sociálne poistenie (${pct(SZCO_SP_RATE)})`,
    zp: `Zdravotné poistenie (${pct(SZCO_ZP_RATE)})`,
    odvody: 'Odvody spolu za rok',
    nczd: 'Nezdaniteľná časť',
    tax: 'Daň z príjmov',
    net: 'Čo zostane po výdavkoch, odvodoch a dani',
    netPausal: 'Čo zostane po odvodoch a dani, pred skutočnými nákladmi na podnikanie',
  },
  sections: [
    {
      h: 'Čo živnostník platí',
      p: [
        `Sociálne poistenie je ${pct(SZCO_SP_RATE)} (starobné 18 %, invalidné 6 %, rezervný fond 4,75 %, nemocenské 4,4 %), každá časť sa zaokrúhľuje nadol zvlášť. Zdravotné poistenie je ${pct(SZCO_ZP_RATE)}. Vymeriavací základ vychádza z čiastkového základu dane cez koeficient 1,486. Zdravotné poistenie sa platí najmenej z 50 % priemernej mzdy, v roku ${first} ${sum(zpMinimum)} mesačne.`,
        `Sociálne poistenie od 1. júla ${SZCO_TEST_FROM} závisí od príjmu z podnikania za predchádzajúci rok, nie od základu dane. ${years.filter((y) => y >= SZCO_TEST_FROM).map(testOf).join(' ')} Pri vyššom príjme je základ najmenej 60 % a najviac 11-násobok priemernej mzdy.`,
        `Kalkulačka berie príjem za predchádzajúci rok rovnaký ako tento rok. Rok ${SZCO_TEST_FROM} počíta celý podľa pravidiel od 1. júla ${SZCO_TEST_FROM}. Od januára do júna ${SZCO_TEST_FROM} platili pre doterajších živnostníkov prechodné pravidlá, preto môžu byť skutočné odvody za tieto mesiace iné.`,
      ],
    },
    {
      h: 'Ako sa počíta daň',
      p: [
        `Z čiastkového základu dane sa odpočítajú odvody a nezdaniteľná časť (v roku ${first} ${eur(example.nczd)} pri nižšom základe). Živnostník s príjmom do 100 000 € platí daň ${pct(15)}; nad ňou sa použijú progresívne sadzby ${pct(19)}, ${pct(25)}, ${pct(30)} a ${pct(35)}.`,
        'Paušálne výdavky nie sú peniaze, ktoré ste minuli. Pri paušále preto kalkulačka ukáže, čo zostane pred skutočnými nákladmi na podnikanie.',
      ],
    },
  ],
  faq: [
    {
      q: `Koľko zaplatí živnostník s príjmom ${eur(2_500_000)} v roku ${first}?`,
      a: `S paušálnymi výdavkami 60 %: odvody ${eur(example.odvody)} a daň ${eur(example.tax)} ročne. Zostane mu ${eur(example.net)} pred skutočnými nákladmi na podnikanie.`,
    },
    {
      q: 'Platí živnostník odvody, aj keď má nízky príjem?',
      a: `Zdravotné poistenie platí každý živnostník, v roku ${first} najmenej ${sum(zpMinimum)} mesačne. Sociálne poistenie závisí od príjmu za predchádzajúci rok: pri príjme do ${sum(test.lower)} sa neplatí, pri príjme do ${sum(test.upper)} sa od 1. júla ${first} platí z osobitného základu ${sum(bases.special)} (${sum(szcoPremium(bases.special))} mesačne) a pri vyššom príjme najmenej ${sum(szcoPremium(bases.minimum))} mesačne. Kto začína podnikať alebo nepodnikal viac ako 60 mesiacov, platí sociálne poistenie až od prvého dňa šiesteho kalendárneho mesiaca po mesiaci, v ktorom živnosť vznikla.`,
    },
    {
      q: 'Počíta kalkulačka aj s. r. o.?',
      a: 'Táto kalkulačka počíta živnostníka (SZČO). Pre s. r. o. platí daň z príjmov 10 %, 21 % alebo 24 % podľa výnosov, najmenej minimálna daň, a zrážková daň z dividend 7 % zo zisku od roku 2025. Odvody ako živnostník s. r. o. neplatí.',
    },
    {
      q: 'Prečo túto kalkulačku robí účtovná firma?',
      a: `${BRAND.name} vedie účtovníctvo, dane a mzdy pre s. r. o. Daňové priznanie ani odvody živnostníkov nevybavujeme. Kalkulačka je orientačná a pomôže Vám porovnať živnosť so s. r. o.; presné sumy pre Vašu situáciu určí daňové priznanie a poisťovne.`,
    },
  ],
  sources: [
    { title: 'Sociálna poisťovňa: poistné SZČO od 1. júla 2026 (mikroodvod)', url: 'https://www.socpoist.sk/socialne-poistenie/platenie-poistneho/poistne-szco-od-1-jula-2026-mikroodvod?ref=2496' },
    { title: 'Sociálna poisťovňa: najdôležitejšie zmeny v sociálnom poistení od 1. 1. 2026', url: 'https://www.socpoist.sk/socialne-poistenie/zmeny-v-socialnom-poisteni/najdolezitejsie-zmeny-v-socialnom-poisteni-od-1-1?ref=2441' },
    { title: 'VšZP: preddavky SZČO', url: 'https://www.vszp.sk/' },
    { title: 'Zákon č. 595/2003 Z. z. o dani z príjmov (Slov-Lex)', url: 'https://www.slov-lex.sk/ezbierky/pravne-predpisy/SK/ZZ/2003/595/' },
    { title: 'Zákon č. 461/2003 Z. z. o sociálnom poistení (Slov-Lex)', url: 'https://www.slov-lex.sk/ezbierky/pravne-predpisy/SK/ZZ/2003/461/' },
    { title: 'Zákon č. 580/2004 Z. z. o zdravotnom poistení (Slov-Lex)', url: 'https://www.slov-lex.sk/ezbierky/pravne-predpisy/SK/ZZ/2004/580/' },
  ],
  published: '2026-10-23',
  modified: '2026-10-26',
  nav: 'Kalkulačka pre živnostníkov',
} as const
