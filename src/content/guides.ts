// The guides of the site (20 October 2026, his word: top SEO without ads, found by the words people search): each a
// page that answers one question people type into a search engine, true in every sentence, with its sources. The
// prices come from config.ts. A guide changes only when what it says changes; then `modified` moves.
import { BRAND, CLOSING_PRICE, PAYROLL_PRICE, PLANS, REPLY_WITHIN, type Plan } from '../config'
import { formatEur } from '../format'

export interface Guide {
  path: string
  /** The title of the browser tab and of the search result: the words searched first, the brand last. */
  title: string
  description: string
  /** The page's heading in two parts, as the site sets its titles: the sans and the serif. */
  first: string
  second: string
  lead: string
  sections: { h: string; p: string[]; list?: string[] }[]
  faq: { q: string; a: string }[]
  sources: { title: string; url: string }[]
  published: string
  modified: string
  /** The words it is written for, to keep each guide to its own. */
  keywords: string[]
  /** Its name in the footer. */
  nav: string
}

const eur = (euros: number) => formatEur(euros * 100)
const plan = (id: string) => PLANS.find((p) => p.id === id) as Plan
const start = plan('start')
const rast = plan('rast')
const firma = plan('firma')
const year = (monthly: number, people = 0) => (monthly + people * PAYROLL_PRICE) * 12 + CLOSING_PRICE

export const GUIDES: Guide[] = [
  {
    path: '/e-faktura-2027',
    nav: 'E-faktúra od roku 2027',
    title: `E-faktúra od 1. 1. 2027: čo musí urobiť Vaša firma | ${BRAND.name}`,
    description:
      'Od 1. januára 2027 musia firmy prijímať faktúry elektronicky cez digitálneho poštára, aj keď nie sú platiteľmi DPH. Kto musí čo urobiť, čo to stojí a aké sú pokuty.',
    first: 'E-faktúra od 1. januára 2027.',
    second: 'Čo musí urobiť Vaša firma.',
    lead:
      'Od 1. januára 2027 si slovenské firmy posielajú faktúry iba elektronicky, v jednotnom formáte a cez digitálneho poštára. Týka sa to aj neplatiteľov DPH. Tu je, čo sa mení, kto musí čo urobiť a ako sa na to pripraviť.',
    sections: [
      {
        h: 'Čo sa mení',
        p: [
          'Faktúry medzi firmami za tuzemské dodania tovarov a služieb (B2B) a faktúry pre štát a verejnú správu (B2G) budú elektronické. Nejde o PDF poslané e-mailom ani o naskenovaný papier. E-faktúra je súbor so štruktúrovanými údajmi podľa európskej normy EN 16931, ktorý program prečíta bez ručného prepisovania.',
          'Faktúry posiela a prijíma digitálny poštár: certifikovaný poskytovateľ v sieti Peppol, ktorý doručí faktúru správnemu príjemcovi a jej údaje oznámi finančnej správe.',
        ],
      },
      {
        h: 'Kto musí e-faktúry prijímať',
        p: ['Prijímať ich musí každá právnická osoba a každý podnikateľ, ktorý je zdaniteľnou osobou. Teda aj firma, ktorá nie je platiteľom DPH, živnostník, slobodné povolanie či prenajímateľ nehnuteľnosti.'],
        list: ['s. r. o. a akciové spoločnosti, platitelia DPH aj neplatitelia', 'živnostníci a samostatne zárobkovo činné osoby', 'advokáti, architekti, lekári a iné slobodné povolania', 'prenajímatelia nehnuteľností'],
      },
      {
        h: 'Kto ich musí vystavovať',
        p: [
          'Vystavovať e-faktúry musia platitelia DPH pri tuzemských dodaniach iným podnikateľom. Faktúru treba vystaviť do 15 dní od dodania, aj opravnú. Faktúry spotrebiteľom (B2C) a do zahraničia sa zatiaľ nemenia. Cezhraničné e-faktúry prídu podľa európskej iniciatívy ViDA najskôr v roku 2030.',
        ],
      },
      {
        h: 'Digitálny poštár a čo stojí',
        p: [
          'Každá firma, ktorá musí e-faktúry prijímať, si musí zmluvne zabezpečiť digitálneho poštára. Môže to byť jej účtovný program, webová aplikácia alebo služba účtovníka. Finančná správa odhaduje, že predplatné nebude vyššie ako priemer v EÚ, teda 5 až 12 € mesačne. Konkrétnu cenu určuje poskytovateľ.',
          'Po prijatí e-faktúry má podnikateľ 5 dní na oznámenie jej údajov finančnej správe. Robí to automaticky digitálny poštár.',
        ],
      },
      {
        h: 'Pokuty',
        p: [
          'Za neoznámenie, nesprávne alebo oneskorené oznámenie údajov hrozí pokuta do 10 000 €, pri opakovanom porušení do 100 000 €. Neuloží sa, ak ide o zrejmý omyl, ktorý firma hneď opraví, alebo ak zlyhal digitálny poštár a údaje sa oznámili hneď po odstránení poruchy.',
        ],
      },
      {
        h: 'Ako to rieši Firmony',
        p: [
          'Faktúry, ktoré vystavíte vo Firmony, už dnes vznikajú ako e-faktúry v európskej norme a podľa pravidiel siete Peppol. Každý druh overujeme proti oficiálnym pravidlám. Prijaté e-faktúry vieme prečítať bez prepisovania, zaúčtujeme ich a spárujeme s platbou. Napojenie na digitálneho poštára pripravujeme a pred spustením služby Vám presne povieme, ako ho budete mať.',
        ],
      },
    ],
    faq: [
      {
        q: 'Musím prijímať e-faktúry, aj keď nie som platiteľom DPH?',
        a: 'Áno. Od 1. januára 2027 ich musí vedieť prijímať každá právnická osoba a každý podnikateľ, ktorý je zdaniteľnou osobou, aj keď nie je platiteľom DPH.',
      },
      {
        q: 'Stačí od roku 2027 poslať faktúru v PDF e-mailom?',
        a: 'Pri tuzemských faktúrach medzi firmami nie, ak ich vystavuje platiteľ DPH. E-faktúra je súbor so štruktúrovanými údajmi podľa normy EN 16931, ktorý sa posiela cez digitálneho poštára. Spotrebiteľom môžete faktúry posielať ako doteraz.',
      },
      {
        q: 'Koľko stojí digitálny poštár?',
        a: 'Cenu určuje poskytovateľ. Finančná správa odhaduje, že predplatné nebude vyššie ako priemer v EÚ, teda 5 až 12 € mesačne.',
      },
      { q: 'Čo sa stane s kontrolným výkazom?', a: 'Podľa novely sa kontrolné výkazy majú zrušiť od 1. júla 2030, keď údaje z faktúr bude finančná správa dostávať priamo.' },
    ],
    sources: [
      { title: 'Podnikajte.sk: E-faktúra od 1. 1. 2027, otázky a odpovede', url: 'https://www.podnikajte.sk/pripravovane-zmeny-v-legislative/efaktura-od-1-1-2027-otazky-odpovede' },
      { title: 'Právne noviny: Od januára 2027 musí elektronickú faktúru vedieť prijať aj neplatiteľ DPH', url: 'https://pravnenoviny.sk/elektronicka-faktura-povinnost-prijimat/' },
      { title: 'Podnikajte.sk: Čo vedieť o digitálnych poštároch', url: 'https://www.podnikajte.sk/zakonne-povinnosti-podnikatela/e-faktura-co-vediet-o-digitalnych-postaroch' },
    ],
    published: '2026-10-20',
    modified: '2026-10-20',
    keywords: ['e-faktúra 2027', 'povinná elektronická fakturácia', 'digitálny poštár', 'e-faktúra neplatiteľ DPH', 'Peppol'],
  },
  {
    path: '/cena-uctovnictva',
    nav: 'Koľko stojí účtovníctvo',
    title: `Koľko stojí účtovníctvo pre s. r. o.? Cena účtovníka | ${BRAND.name}`,
    description: `Od čoho závisí cena účtovníctva pre s. r. o., ako účtujú účtovníci a kancelárie a koľko zaplatíte za rok. Firmony od ${eur(start.price)} mesačne podľa počtu dokladov.`,
    first: 'Koľko stojí účtovníctvo.',
    second: 'Pre s. r. o. v roku 2027.',
    lead: 'Cena účtovníctva závisí od toho, koľko dokladov firma má, či je platiteľom DPH, koľko ľudí zamestnáva a či sa platí aj závierka. Tu je, ako sa cena skladá, a príklady, koľko zaplatíte za celý rok.',
    sections: [
      {
        h: 'Od čoho cena závisí',
        p: ['Účtovníci a účtovné kancelárie účtujú najčastejšie mesačný paušál, cenu za každý doklad alebo ich kombináciu. Navyše si účtujú mzdy za každého zamestnanca a ročnú závierku s daňovým priznaním.'],
        list: [
          'počet dokladov mesačne: faktúry, bločky, výpisy z banky',
          'platiteľ DPH: mesačné alebo štvrťročné priznanie, kontrolný a súhrnný výkaz',
          'zamestnanci: mzdy, odvody, prihlášky a ročné zúčtovanie',
          'raz ročne: účtovná závierka a daňové priznanie k dani z príjmov',
          'majetok, zásoby, cudzie meny a obchod so zahraničím',
        ],
      },
      {
        h: 'Prečo sa oplatí pevná cena',
        p: [
          'Pri cene za doklad platíte viac práve v mesiacoch, keď má firma najviac práce. Pri pevnej cene viete vopred, koľko zaplatíte. Vo Firmony platíte podľa počtu dokladov v balíku: mesiac s viac dokladmi vyúčtujeme ako vyšší balík, nič navyše za každý doklad.',
        ],
      },
      {
        h: 'Cenník Firmony',
        p: [
          `${start.name}: ${eur(start.price)} mesačne, do ${start.docs} dokladov, pre firmy, ktoré nie sú platiteľmi DPH. ${rast.name}: ${eur(rast.price)} mesačne, do ${rast.docs} dokladov, pre platiteľov DPH. ${firma.name}: ${eur(firma.price)} mesačne, do ${firma.docs} dokladov. Mzdy ${eur(PAYROLL_PRICE)} mesačne za človeka, závierka s daňovým priznaním ${eur(CLOSING_PRICE)} ročne. Ceny sú bez DPH.`,
        ],
      },
      {
        h: 'Príklady na celý rok',
        p: [
          `Nová s. r. o. bez zamestnancov, ktorá nie je platiteľom DPH, s 15 dokladmi mesačne: balík ${start.name} a závierka, spolu ${eur(year(start.price))} ročne.`,
          `Platiteľ DPH so 40 dokladmi mesačne a dvoma zamestnancami: balík ${rast.name}, mzdy a závierka, spolu ${eur(year(rast.price, 2))} ročne.`,
          `Firma so 120 dokladmi mesačne a piatimi zamestnancami: balík ${firma.name}, mzdy a závierka, spolu ${eur(year(firma.price, 5))} ročne.`,
          'Porovnať to s Vašou terajšou cenou môžete v kalkulačke na úvodnej stránke.',
        ],
      },
    ],
    faq: [
      { q: 'Čo sa počíta ako doklad?', a: 'Doklady, ktoré v mesiaci pribudnú v aplikácii: prijaté faktúry, bločky aj faktúry, ktoré v nej vystavíte. Nerátame ten istý doklad poslaný dvakrát, vymazaný doklad ani naše faktúry Vám.' },
      { q: 'Je v cene aj priznanie k DPH?', a: `Áno. V balíkoch ${rast.name} a ${firma.name} je mesačné priznanie k DPH, kontrolný a súhrnný výkaz. V balíku ${start.name} priznania pri registrácii podľa § 7a.` },
      { q: 'Čo ak budem mať v niektorom mesiaci viac dokladov?', a: `Ten mesiac vyúčtujeme ako vyšší balík. Pri viac ako ${firma.docs} dokladoch mesačne Vám pripravíme ponuku na mieru.` },
      { q: 'Platím za otázky účtovníčke?', a: `Nie. Otázky sú v cene a odpovieme ${REPLY_WITHIN}.` },
    ],
    sources: [],
    published: '2026-10-20',
    modified: '2026-10-20',
    keywords: ['cena účtovníctva', 'koľko stojí účtovník', 'cenník účtovníctva s.r.o.', 'účtovníctvo cena za doklad', 'vedenie účtovníctva cena'],
  },
  {
    path: '/uctovnictvo-pre-sro',
    nav: 'Účtovníctvo pre s. r. o.',
    title: `Účtovníctvo pre s. r. o.: čo zahŕňa a ako ho mať bez starostí | ${BRAND.name}`,
    description:
      'Čo všetko patrí k vedeniu účtovníctva s. r. o.: podvojné účtovníctvo, DPH, mzdy, termíny, závierka a daňové priznanie. A ako ho viesť online, bez papierov a bez stresu.',
    first: 'Účtovníctvo pre s. r. o.',
    second: 'Čo všetko zahŕňa.',
    lead:
      'Spoločnosť s ručením obmedzeným vedie podvojné účtovníctvo. Za to, že je vedené správne, zodpovedá firma, aj keď ho za ňu vedie niekto iný. Tu je, čo k nemu patrí každý mesiac a raz ročne.',
    sections: [
      {
        h: 'Každý mesiac',
        p: ['Základom sú doklady: takmer každá platba na účte firmy musí mať svoj doklad. Z nich vzniká účtovníctvo, priznania aj prehľad o tom, ako sa firme darí.'],
        list: [
          'zaúčtovanie prijatých a vydaných faktúr, bločkov a výpisov z banky',
          'platiteľ DPH: priznanie a kontrolný výkaz do 25. dňa po skončení obdobia, pri dodaniach do EÚ aj súhrnný výkaz',
          'mzdy: výplatné pásky, odvody do Sociálnej poisťovne a zdravotných poisťovní, preddavky na daň',
          'prihlášky a odhlášky zamestnancov',
          'sledovanie termínov a toho, čo firma komu dlží',
        ],
      },
      {
        h: 'Raz ročne',
        p: [
          'Po skončení roka sa zostavuje účtovná závierka a podáva daňové priznanie k dani z príjmov právnických osôb. Lehota je spravidla do 31. marca, oznámením sa dá predĺžiť o tri mesiace, s príjmami zo zahraničia o šesť. Závierka sa ukladá do registra účtovných závierok.',
          'Audit je povinný, ak firma ku dňu závierky aj v predchádzajúcom roku prekročí dve z troch hraníc: majetok 4 000 000 €, čistý obrat 8 000 000 € a viac ako 50 zamestnancov.',
        ],
      },
      {
        h: 'Čo robí konateľ a čo účtovník',
        p: [
          'Konateľ zabezpečí, aby sa doklady dostali k účtovníkovi, a podpíše, čo treba. Účtovník doklady zaúčtuje, pripraví a podá priznania a výkazy a upozorní na termíny. Vo Firmony konateľ doklad odfotí alebo prepošle e-mailom, výpisy chodia z banky a všetko ostatné robíme my.',
        ],
      },
      {
        h: 'Ako to robí Firmony',
        p: [
          'Doklady prečíta umelá inteligencia a navrhne zaúčtovanie. Účtovníčka všetko skontroluje, podá priznania a odpovie na otázky. Účtovná kniha, DPH, mzdy aj závierka vznikajú v našej vlastnej aplikácii, takže v nej vidíte, čo je hotové a čo od Vás ešte treba.',
        ],
      },
    ],
    faq: [
      { q: 'Môže si konateľ viesť účtovníctvo sám?', a: 'Áno. Na vedenie účtovníctva vlastnej firmy nie je potrebné osvedčenie. Za správnosť však zodpovedá firma, preto väčšina konateľov prenechá účtovníctvo odborníkovi.' },
      { q: 'Dokedy treba podať daňové priznanie s. r. o.?', a: 'Do troch mesiacov po skončení zdaňovacieho obdobia, teda pri kalendárnom roku do 31. marca. Oznámením správcovi dane sa lehota dá predĺžiť o tri mesiace, s príjmami zo zahraničia o šesť.' },
      { q: 'Musí mať s. r. o. podvojné účtovníctvo?', a: 'Áno. Obchodné spoločnosti vrátane s. r. o. vedú účtovníctvo v sústave podvojného účtovníctva podľa zákona o účtovníctve.' },
    ],
    sources: [{ title: 'Zákon č. 431/2002 Z. z. o účtovníctve (Slov-Lex)', url: 'https://www.slov-lex.sk/ezbierky/pravne-predpisy/SK/ZZ/2002/431/' }],
    published: '2026-10-20',
    modified: '2026-10-20',
    keywords: ['účtovníctvo pre s.r.o.', 'vedenie účtovníctva', 'podvojné účtovníctvo s.r.o.', 'účtovník pre s.r.o.', 'účtovná závierka s.r.o.'],
  },
  {
    path: '/online-uctovnik',
    nav: 'Online účtovník',
    title: `Online účtovník pre firmy na celom Slovensku | ${BRAND.name}`,
    description:
      'Účtovník online: doklady odfotíte alebo prepošlete, výpisy prídu z banky a Vaša účtovníčka všetko zaúčtuje a podá. Bez stretnutí a papierov, odkiaľkoľvek zo Slovenska.',
    first: 'Online účtovník.',
    second: 'Pre firmy na celom Slovensku.',
    lead:
      'Nemusíte hľadať účtovníka vo svojom meste ani nosiť šanóny. Je jedno, či má Vaša firma sídlo v Bratislave, Košiciach, Žiline, Prešove, Nitre alebo Banskej Bystrici: všetko vybavíme online.',
    sections: [
      {
        h: 'Ako to funguje',
        p: ['Firmony spája aplikáciu, ktorá robí rutinnú prácu, s účtovníčkou, ktorá má Vašu firmu na starosti.'],
        list: [
          'bloček odfotíte v telefóne, faktúru prepošlete na adresu Vašej firmy pre doklady',
          'výpisy z banky chodia samé alebo ich raz mesačne pridáte',
          'umelá inteligencia doklad prečíta a spáruje s platbou',
          'účtovníčka všetko skontroluje, zaúčtuje a podá priznania',
          'v aplikácii vidíte, čo je hotové, a jedinú vec, ktorá od Vás chýba',
        ],
      },
      {
        h: 'Vaša účtovníčka, nie anonymná linka',
        p: [
          `Vašu firmu má na starosti jedna účtovníčka s praxou. Píšete si s ňou priamo v aplikácii a odpovie ${REPLY_WITHIN}. Plnú moc podpíšete občianskym preukazom s čipom, bez stretnutí.`,
        ],
      },
      {
        h: 'Prechod od doterajšieho účtovníka',
        p: [
          'Výpoveď so žiadosťou o odovzdanie podkladov Vám pripravíme, konateľ ju len podpíše. Podklady od doterajšieho účtovníka nahráte do aplikácie, počiatočné stavy prevezmeme z jeho programu a pokračujeme bez prerušenia.',
        ],
      },
    ],
    faq: [
      { q: 'Musím sa s účtovníčkou niekedy stretnúť osobne?', a: 'Nie. Plnú moc, doklady aj správy vybavíte v aplikácii.' },
      { q: 'Ako odovzdám doklady?', a: 'Bloček odfotíte, faktúru prepošlete e-mailom na adresu Vašej firmy pre doklady a výpisy prídu z banky. Papier nikam nenosíte.' },
      { q: 'Odkiaľ zo Slovenska môžem byť?', a: 'Odkiaľkoľvek. Všetko prebieha online, preto je jedno, kde má Vaša firma sídlo.' },
    ],
    sources: [],
    published: '2026-10-20',
    modified: '2026-10-20',
    keywords: ['online účtovník', 'účtovník online', 'účtovníctvo online', 'účtovník Bratislava', 'účtovník Košice'],
  },
]

export function guideByPath(path: string): Guide | undefined {
  return GUIDES.find((g) => g.path === path)
}
