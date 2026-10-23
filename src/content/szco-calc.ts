// The words of the SZČO tax-and-levy calculator (/szco-kalkulacka). Every figure comes from the engine (app/szco-calc.ts)
// or app/payroll.ts, so the page can never say another figure than it computes. Verified 23 October 2026.
import { BRAND } from '../config'
import { formatEur, formatEurExact } from '../format'
import { payrollYear } from '../app/payroll'
import { SZCO_PAUSAL_CAP, SZCO_PAUSAL_PCT, SZCO_SP_RATE, SZCO_ZP_RATE, szcoCalc, szcoYears } from '../app/szco-calc'

const eur = (cents: number) => formatEurExact(cents)
const pct = (n: number) => `${String(n).replace('.', ',')} %`

export const SZCO_PATH = '/szco-kalkulacka'
const years = szcoYears()
const first = years[0] as number
const last = years[years.length - 1] as number
const span = years.length > 1 ? `${first} a ${last}` : String(first)

const example = szcoCalc({ year: first, revenue: 2_500_000, mode: 'pausal', expenses: 0 })
const minimum = szcoCalc({ year: last, revenue: payrollYear(last).minimumWage * 12, mode: 'pausal', expenses: 0 })

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
    empty: `Napríklad príjem ${eur(2_500_000)} v roku ${first} s paušálom: odvody ${eur(example.odvody)}, daň ${eur(example.tax)}, zostane ${eur(example.net)}.`,
  },
  result: {
    revenue: 'Ročný príjem',
    expenses: `Paušálne výdavky (${pct(SZCO_PAUSAL_PCT)}, strop ${eur(SZCO_PAUSAL_CAP)})`,
    czd: 'Čiastkový základ dane',
    sp: `Sociálne poistenie (${pct(SZCO_SP_RATE)})`,
    zp: `Zdravotné poistenie (${pct(SZCO_ZP_RATE)})`,
    odvody: 'Odvody spolu za rok',
    nczd: 'Nezdaniteľná časť',
    tax: 'Daň z príjmov',
    net: 'Čo zostane po odvodoch a dani',
    note: 'Výpočet je orientačný pre bežného živnostníka s paušálnymi výdavkami, bez súbehu so zamestnaním, bez mikroodvodu a bez zdravotného postihnutia. Ročné zúčtovanie môže výsledok zmeniť.',
  },
  sections: [
    {
      h: 'Čo živnostník platí',
      p: [
        `Sociálne poistenie je ${pct(SZCO_SP_RATE)} (starobné 18 %, invalidné 6 %, rezervný fond 4,75 %, nemocenské 4,4 %) a zdravotné ${pct(SZCO_ZP_RATE)}. Vymeriavací základ vychádza z čiastkového základu dane cez koeficient 1,486 a nesmie byť nižší ako 60 % priemernej mzdy pre sociálne a 50 % pre zdravotné poistenie. Sociálne poistenie má aj hornú hranicu 11-násobok priemernej mzdy.`,
        `Od 1. júla 2026 platí pre niektorých začínajúcich živnostníkov mikroodvod z osobitného základu 26 % priemernej mzdy; túto osobitnú situáciu kalkulačka nepočíta.`,
      ],
    },
    {
      h: 'Ako sa počíta daň',
      p: [
        `Z čiastkového základu dane sa odpočítajú odvody a nezdaniteľná časť (v roku ${first} ${eur(example.nczd)} pri nižšom základe). Živnostník s príjmom do 100 000 € platí daň ${pct(15)}; nad ňou sa použijú progresívne sadzby ${pct(19)}, ${pct(25)}, ${pct(30)} a ${pct(35)}.`,
      ],
    },
  ],
  faq: [
    {
      q: `Koľko zaplatí živnostník s príjmom ${eur(2_500_000)} v roku ${first}?`,
      a: `S paušálnymi výdavkami 60 %: odvody ${eur(example.odvody)} a daň ${eur(example.tax)} ročne. Zostane mu ${eur(example.net)}.`,
    },
    {
      q: 'Platí živnostník odvody, aj keď má nízky príjem?',
      a: `Áno, aspoň minimálne odvody. V roku ${first} je minimálny sociálny odvod ${eur(Math.round(payrollYear(first).averageWage * 0.6 * SZCO_SP_RATE / 100))} mesačne a minimálny zdravotný preddavok ${eur(Math.round(payrollYear(first).averageWage * 0.5 * SZCO_ZP_RATE / 100))} mesačne.`,
    },
    {
      q: 'Počíta kalkulačka aj s. r. o.?',
      a: 'Táto kalkulačka počíta živnostníka (SZČO). Pre s. r. o. platí daň z príjmov 10 %, 21 % alebo 24 % podľa výnosov a zrážková daň z dividend 7 % zo zisku od roku 2025. Odvody ako živnostník s. r. o. neplatí.',
    },
    {
      q: 'Prečo túto kalkulačku robí účtovná firma?',
      a: `Účtovníctvo a mzdy vedieme pre klientov ${BRAND.name}. Kalkulačka je orientačná; konkrétny výpočet a ročné zúčtovanie pre vašu situáciu pripraví účtovníčka.`,
    },
  ],
  sources: [
    { title: 'Sociálna poisťovňa: poistné SZČO a mikroodvod', url: 'https://www.socpoist.sk/' },
    { title: 'VšZP: preddavky SZČO', url: 'https://www.vszp.sk/' },
    { title: 'Zákon č. 595/2003 Z. z. o dani z príjmov (Slov-Lex)', url: 'https://www.slov-lex.sk/ezbierky/pravne-predpisy/SK/ZZ/2003/595/' },
    { title: 'Zákon č. 461/2003 Z. z. o sociálnom poistení (Slov-Lex)', url: 'https://www.slov-lex.sk/ezbierky/pravne-predpisy/SK/ZZ/2003/461/' },
    { title: 'Zákon č. 580/2004 Z. z. o zdravotnom poistení (Slov-Lex)', url: 'https://www.slov-lex.sk/ezbierky/pravne-predpisy/SK/ZZ/2004/580/' },
  ],
  published: '2026-10-23',
  modified: '2026-10-23',
  nav: 'Kalkulačka pre živnostníkov',
} as const
