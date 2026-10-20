// The words of the net wage calculator (/mzdova-kalkulacka). Every rate and figure comes from the payroll engine
// (app/payroll.ts) or config.ts, so the page can never say another figure than it computes.
import { BRAND, PAYROLL_PRICE } from '../config'
import { formatEur, formatEurExact } from '../format'
import { HEALTH, SOCIAL_EMPLOYEE, SOCIAL_EMPLOYER, payrollYear } from '../app/payroll'
import { calcYears, wageCalc } from '../app/wage-calc'

const pct = (bp: number) => `${String(bp / 100).replace('.', ',')} %`
const sum = (rates: Readonly<Record<string, number | undefined>>) => Object.values(rates).reduce<number>((s, v) => s + (v ?? 0), 0)
const eur = (cents: number) => formatEurExact(cents)

export const WAGE_PATH = '/mzdova-kalkulacka'
const years = calcYears()
const first = years[0] as number
const last = years[years.length - 1] as number
const span = years.length > 1 ? `${first} a ${last}` : String(first)

const example = wageCalc({ year: first, gross: 150_000, declaration: true, young: 0, teen: 0, disabled: false })
const minimum = wageCalc({ year: last, gross: payrollYear(last).minimumWage, declaration: true, young: 0, teen: 0, disabled: false })

export const WAGE_PAGE = {
  title: `Mzdová kalkulačka ${span}: čistá mzda a cena práce | ${BRAND.name}`,
  description: `Vypočítajte čistú mzdu z hrubej a koľko zamestnanec stojí firmu v roku ${span}: odvody, preddavok na daň a daňový bonus na deti. Počíta rovnaký program, ktorým vedieme mzdy.`,
  first: 'Mzdová kalkulačka.',
  second: 'Čistá mzda a cena práce.',
  lead: `Zadajte hrubú mzdu a zistíte, koľko dostane zamestnanec na účet a koľko zaplatí firma. Počíta to rovnaký program, ktorým vedieme mzdy našich klientov, podľa pravidiel na rok ${span}.`,
  form: {
    gross: 'Hrubá mzda mesačne',
    year: 'Rok',
    declaration: 'Podpísané vyhlásenie (nezdaniteľná časť, daňový bonus)',
    young: 'Deti do 15 rokov',
    teen: 'Deti od 15 do 18 rokov',
    disabled: 'Zamestnanec so zdravotným postihnutím (polovičné zdravotné poistenie)',
    button: 'Vypočítať',
    error: 'Hrubú mzdu napíšte v eurách, napríklad 1 500 alebo 1500,50.',
    empty: `Napríklad hrubá mzda ${eur(150_000)} v roku ${first}: čistá mzda ${eur(example.slip.net)}, firmu stojí ${eur(example.cost)}.`,
  },
  result: {
    gross: 'Hrubá mzda',
    social: `Sociálne poistenie (${pct(sum(SOCIAL_EMPLOYEE))})`,
    health: 'Zdravotné poistenie',
    advance: 'Preddavok na daň',
    bonus: 'Daňový bonus na deti',
    net: 'Čistá mzda',
    employerSocial: `Sociálne poistenie zamestnávateľa (${pct(sum(SOCIAL_EMPLOYER))})`,
    employerHealth: 'Zdravotné poistenie zamestnávateľa',
    cost: 'Cena práce pre firmu',
    below: (minimumWage: string) => `Mzda je nižšia ako minimálna mzda ${minimumWage} za celý mesiac pracovného pomeru.`,
    note: 'Pracovný pomer na celý mesiac s mesačnou mzdou. Výpočet je orientačný: dohody, PN, dovolenku, stravné ani ročné zúčtovanie nerátame.',
  },
  sections: [
    {
      h: 'Čo sa z hrubej mzdy odvádza',
      p: [
        `Zamestnanec platí sociálne poistenie ${pct(sum(SOCIAL_EMPLOYEE))}: nemocenské ${pct(SOCIAL_EMPLOYEE.sickness ?? 0)}, starobné ${pct(SOCIAL_EMPLOYEE.oldAge ?? 0)}, invalidné ${pct(SOCIAL_EMPLOYEE.disability ?? 0)} a v nezamestnanosti ${pct(SOCIAL_EMPLOYEE.unemployment ?? 0)}. Zdravotné poistenie je ${pct(HEALTH.employee)}.`,
        'Z príjmu po odvodoch sa odpočíta nezdaniteľná časť, ak zamestnanec podpísal vyhlásenie, a zo zvyšku sa platí preddavok na daň 19 %, pri vyšších príjmoch 25 %, 30 % a 35 %. Daňový bonus na dieťa sa od dane odpočíta a môže zvýšiť čistú mzdu.',
      ],
    },
    {
      h: 'Koľko stojí zamestnanec firmu',
      p: [
        `Firma platí okrem hrubej mzdy sociálne poistenie ${pct(sum(SOCIAL_EMPLOYER))} vrátane rezervného fondu solidarity a zdravotné poistenie ${pct(HEALTH.employer)}. Minimálna mzda v roku ${last} je ${eur(payrollYear(last).minimumWage)}: zamestnanec dostane ${eur(minimum.slip.net)} a firmu stojí ${eur(minimum.cost)} mesačne.`,
        `Mzdy, odvody, prihlášky a výkazy pre Vašu firmu vedieme za ${formatEur(PAYROLL_PRICE * 100)} mesačne za človeka.`,
      ],
    },
  ],
  faq: [
    {
      q: `Koľko je čistá mzda z 1 500 € v roku ${first}?`,
      a: `S podpísaným vyhlásením a bez detí ${eur(example.slip.net)}. Firmu takýto zamestnanec stojí ${eur(example.cost)} mesačne.`,
    },
    {
      q: `Koľko stojí firmu minimálna mzda v roku ${last}?`,
      a: `Minimálna mzda v roku ${last} je ${eur(payrollYear(last).minimumWage)}. Zamestnanec dostane ${eur(minimum.slip.net)}, firmu stojí ${eur(minimum.cost)} mesačne.`,
    },
    {
      q: 'Koľko je daňový bonus na dieťa?',
      a: 'Na dieťa do 15 rokov 100 € mesačne, od 15 do 18 rokov 50 € mesačne. Pri vyššom príjme sa znižuje a nesmie prekročiť časť príjmu. Uplatňuje sa podpísaným vyhlásením u zamestnávateľa.',
    },
    {
      q: 'Prečo mzdovú kalkulačku robí účtovná firma?',
      a: `Mzdy vedieme pre klientov ${BRAND.name} a kalkulačka počíta tým istým programom. Výplatné pásky, odvody aj hlásenia pre Vašu firmu pripravíme za ${formatEur(PAYROLL_PRICE * 100)} mesačne za človeka.`,
    },
  ],
  sources: [
    { title: 'Sociálna poisťovňa: Tabuľky platenia poistného od 1. januára 2026', url: 'https://www.socpoist.sk/socialne-poistenie/platenie-poistneho/tabulky-platenia-poistneho/tabulky-platenia-poistneho-od-1-6' },
    { title: 'Finančná správa: Daňový bonus na dieťa v roku 2026', url: 'https://podpora.financnasprava.sk/215354-Da%C5%88ov%C3%BD-bonus-na-die%C5%A5a-v-roku-2026' },
    { title: 'Zákon č. 595/2003 Z. z. o dani z príjmov (Slov-Lex)', url: 'https://www.slov-lex.sk/ezbierky/pravne-predpisy/SK/ZZ/2003/595/' },
  ],
  published: '2026-10-20',
  modified: '2026-10-20',
  nav: 'Mzdová kalkulačka',
} as const
