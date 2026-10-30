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

// New legal guides: originals read on Slov-Lex, 21 October 2026. Claim / section mapping, effective dates and
// boundaries are in docs/research/seo-sources-2026-10-21.md. In particular, §110a is an exception to §57's
// ordinary formation form; VAT turnover uses a calendar year and two different thresholds. No old §112 checklist.
// Sources: 513/1991 and 29/2026 effective 20260817; 222/2004 effective 20260101; 595/2003 effective 20260101
// (relevant provisions also compared with 20261231 and the enacted 20270101 text); 431/2002 effective 20260601;
// 563/2009 effective 20260901. The cited VAT sections also match the enacted 20270101 text.

export const GUIDES: Guide[] = [
  {
    path: '/e-faktura-2027',
    nav: 'E-faktúra od roku 2027',
    title: `E-faktúra od 1. 1. 2027: čo musí urobiť Vaša firma | ${BRAND.name}`,
    description:
      'E-faktúry od roku 2027 pri určených tuzemských dodaniach. Kto ich vystavuje, kto prijíma aj bez DPH a čo pripravuje Firmony.',
    first: 'E-faktúra od 1. januára 2027.',
    second: 'Čo musí urobiť Vaša firma.',
    lead:
      'Od 1. januára 2027 sa pri určených tuzemských dodaniach uplatní elektronická fakturácia. Vystavovanie, prijímanie a oznamovanie údajov majú rozdielne pravidlá. Príjem sa môže týkať aj neplatiteľa DPH.',
    sections: [
      {
        h: 'Čo sa mení',
        p: [
          'Režim sa týka určených tuzemských dodaní od platiteľov DPH zdaniteľným osobám a nezdaniteľným právnickým osobám podľa § 85o ods. 2 a 3, so zákonnými výnimkami. Nejde o PDF poslané e-mailom ani o naskenovaný papier. E-faktúra je súbor so štruktúrovanými údajmi podľa európskej normy EN 16931, ktorý program prečíta bez ručného prepisovania.',
          'Faktúry posiela a prijíma digitálny poštár: certifikovaný poskytovateľ v sieti Peppol, ktorý doručí faktúru správnemu príjemcovi a jej údaje oznámi finančnej správe.',
        ],
      },
      {
        h: 'Kto musí e-faktúry prijímať',
        p: ['Ak prijímate tuzemské dodanie, pri ktorom má dodávateľ povinnosť vyhotoviť e-faktúru, musíte zabezpečiť jej prijatie doručovacou službou podľa § 71 ods. 5. Platí to aj pre neplatiteľa DPH; rozhoduje postavenie príjemcu a konkrétne plnenie.'],
        list: ['s. r. o. a akciové spoločnosti, platitelia DPH aj neplatitelia', 'živnostníci a samostatne zárobkovo činné osoby', 'advokáti, architekti, lekári a iné slobodné povolania', 'prenajímatelia nehnuteľností'],
      },
      {
        h: 'Kto ich musí vystavovať',
        p: [
          'Povinnosť majú platitelia podľa § 4, 4b alebo 4c pri dodaniach a zálohách podľa § 85o ods. 2. Výnimky zahŕňajú uvedené oslobodené plnenia a zjednodušené faktúry. Lehoty určuje § 85o ods. 6 až 8; pri oprave základu dane podľa § 25 ods. 1 sa základná lehota počíta od konca príslušného mesiaca. Nie každá faktúra patrí do povinného režimu.',
        ],
      },
      {
        h: 'Digitálny poštár a čo stojí',
        p: [
          'Príjem môže zabezpečiť účtovný program alebo iná služba napojená na certifikovaného poskytovateľa. Konkrétnu cenu a rozsah určuje ponuka poskytovateľa. Firmony napojenie pripravuje; dodávateľskú cenu zatiaľ nemáme potvrdenú.',
          'Oznamovanie podľa § 85o ods. 9 a 10 sa týka určených platiteľov DPH. Päťdňová lehota pri prijatí podľa odseku 10 sa nevzťahuje automaticky na každého neplatiteľa. Údaje sa oznamujú prostredníctvom doručovacej služby.',
        ],
      },
      {
        h: 'Pokuty',
        p: [
          'Pokuty do 10 000 € a pri opakovaní do 100 000 € podľa § 85o ods. 12 až 14 sa viažu na oznamovacie povinnosti určených platiteľov, so zákonnými výnimkami. Nie sú automatickou pokutou každému príjemcovi e-faktúry.',
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
        a: 'Áno, ak prijímate plnenie, pri ktorom má dodávateľ zákonnú povinnosť vyhotoviť e-faktúru. Samotné neplatiteľstvo DPH nevylučuje povinnosť zabezpečiť jej prijatie.',
      },
      {
        q: 'Stačí od roku 2027 poslať faktúru v PDF e-mailom?',
        a: 'Samotné PDF nespĺňa štruktúrovaný formát povinnej e-faktúry. Povinný režim má výnimky; pri zaslaní iným spôsobom než doručovacou službou zákon vyžaduje súhlas príjemcu. Podrobnosti určuje § 85o ods. 2 a 4.',
      },
      {
        q: 'Koľko stojí digitálny poštár?',
        a: 'Cenu a limity určuje konkrétna ponuka poskytovateľa. Porovnajte aj napojenie na účtovníctvo, príjem, odosielanie a prípadné objemové príplatky.',
      },
      { q: 'Zaniká kontrolný výkaz od roku 2027?', a: 'Nie. Kontrolný výkaz podľa § 78a zostáva v roku 2027 zachovaný. Začiatok e-fakturácie ho sám osebe neruší.' },
    ],
    // Original law read 22 October 2026: current 2026 and enacted 2027 wording, not just a press summary.
    sources: [
      { title: 'Zákon o DPH: § 71 ods. 5, § 78a a § 85o, vyhlásené znenie od 1. 1. 2027 (Slov-Lex)', url: 'https://static.slov-lex.sk/static/SK/ZZ/2004/222/20270101.html#paragraf-85o' },
      { title: 'Zákon č. 385/2025 Z. z.: čl. I bod 69 a čl. VIII, pravidlá a účinnosť (Slov-Lex)', url: 'https://static.slov-lex.sk/static/SK/ZZ/2025/385/20270101.html' },
      { title: 'Zákon o DPH: aktuálne znenie účinné v roku 2026 (Slov-Lex)', url: 'https://static.slov-lex.sk/static/SK/ZZ/2004/222/20260101.html' },
      { title: 'Finančná správa: oficiálna dokumentácia eFaktúry a Peppol', url: 'https://www.financnasprava.sk/sk/podnikatelia/dane/dan-z-pridanej-hodnoty/e-faktura' },
    ],
    published: '2026-10-20',
    modified: '2026-10-22',
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
          `${start.name}: ${eur(start.price)} mesačne, do ${start.docs} dokladov, pre firmy, ktoré nie sú platiteľmi DPH. ${rast.name}: ${eur(rast.price)} mesačne, do ${rast.docs} dokladov, pre platiteľov DPH. ${firma.name}: ${eur(firma.price)} mesačne, do ${firma.docs} dokladov. Mzdy ${eur(PAYROLL_PRICE)} mesačne za človeka, závierka s daňovým priznaním ${eur(CLOSING_PRICE)} ročne. Ceny sú konečné.`,
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
          'Doklady prečíta softvér a navrhne zaúčtovanie. Účtovníčka vedie odbornú kontrolu, rieši neštandardné prípady, dohodnuté podania a otázky. Účtovná kniha, DPH, mzdy aj závierka vznikajú v našej vlastnej aplikácii, takže v nej vidíte, čo je hotové a čo od Vás ešte treba.',
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
          'softvér doklad prečíta a spáruje s platbou',
          'účtovníčka vedie odbornú kontrolu a postará sa o dohodnutú agendu',
          'v aplikácii vidíte, čo je hotové a čo potrebuje Vaše doplnenie alebo rozhodnutie',
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
          'V aplikácii zadáte kontakt na doterajšieho účtovníka a potvrdíte koordináciu prevzatia. Vaša účtovníčka vo Firmony preverí oprávnenie, dohodne odovzdanie a skontroluje podklady aj nadväznosť počiatočných stavov. Vy sa zapojíte pri potrebnom podpise alebo doplnení. Priebeh a ďalší krok vidíte v aplikácii; list a podklady si môžete vybaviť aj osobne.',
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
    modified: '2026-10-22',
    keywords: ['online účtovník', 'účtovník online', 'účtovníctvo online', 'účtovník Bratislava', 'účtovník Košice'],
  },
  {
    // The question people put to a search engine and to an assistant after founding a company ("which accountant for my
    // new s. r. o."): the options told fairly, what to ask, what to watch, and when Firmony is not the right choice.
    path: '/ako-vybrat-uctovnika',
    nav: 'Ako vybrať účtovníka',
    title: `Ako vybrať účtovníka pre s. r. o.: 4 možnosti a 10 otázok | ${BRAND.name}`,
    description:
      'Založili ste s. r. o. a hľadáte účtovníka? Porovnanie štyroch možností: účtovník na živnosť, účtovná kancelária, program a online účtovná služba. Desať otázok, ktoré položiť, a na čo si dať pozor.',
    first: 'Ako vybrať účtovníka.',
    second: 'Pre novú s. r. o.',
    lead: 'Založili ste s. r. o. a hľadáte, kto Vám povedie účtovníctvo. Máte štyri možnosti: účtovníka na živnosť, účtovnú kanceláriu, program, v ktorom účtujete sami, alebo online účtovnú službu. Tu je, čím sa líšia, čo sa pýtať a na čo si dať pozor.',
    sections: [
      {
        h: 'Kedy účtovníka potrebujete',
        p: [
          'Firma vedie účtovníctvo odo dňa svojho vzniku (§ 4 ods. 1 zákona o účtovníctve) a s. r. o. vzniká zápisom do obchodného registra. Už prvé doklady, napríklad poplatky za založenie, treba zaúčtovať. Účtovníka preto dohodnite hneď, ako firma vznikne, nie až pri prvom priznaní.',
          'S. r. o. vedie podvojné účtovníctvo. Popri ňom podáva priznania k DPH, ak je platiteľom, odvádza mzdy za zamestnancov a raz ročne zostavuje závierku a podáva daňové priznanie.',
        ],
      },
      {
        h: 'Štyri možnosti',
        p: ['Každá sa hodí inej firme. Porovnajte ich podľa toho, koľko práce chcete robiť sami a ako chcete s účtovníkom komunikovať.'],
        list: [
          'Účtovník na živnosť: osobný kontakt a často nižšia cena. Opýtajte sa, kto ho zastúpi počas dovolenky alebo choroby a či zvládne aj DPH a mzdy.',
          'Účtovná kancelária: viac ľudí aj odborností, zastupovanie je jednoduchšie. Cena býva vyššia a doklady sa odovzdávajú podľa dohody, často raz mesačne.',
          'Program, v ktorom účtujete sami: najnižšia cena, ale prácu robíte Vy. Podvojné účtovníctvo, DPH a závierka chcú znalosti a čas a za správnosť zodpovedá firma.',
          'Online účtovná služba: doklady odfotíte alebo prepošlete, výpisy prídu z banky a účtovník všetko zaúčtuje a podá. Bez stretnutí a papierov, s prehľadom v aplikácii. Takto funguje Firmony.',
        ],
      },
      {
        h: 'Čo platí pri každej možnosti',
        p: [
          'Vedenie účtovníctva je voľná živnosť. Na jej ohlásenie netreba preukazovať vzdelanie ani prax, stačí vek 18 rokov, spôsobilosť na právne úkony a bezúhonnosť. Skúsenosti a referencie si preto overte sami.',
          'Firma sa poverením iného zodpovednosti za účtovníctvo nezbavuje (§ 5 ods. 2 zákona o účtovníctve). Pokutu od úradu dostane firma. Náhradu škody od účtovníka môžete žiadať podľa zmluvy a zákona, preto chcite písomnú zmluvu, ktorá to upravuje.',
        ],
      },
      {
        h: 'Desať otázok, ktoré položte každému účtovníkovi',
        p: ['Odpovede porovnajte vedľa seba. Dobrý účtovník na ne odpovie jasne a písomne.'],
        list: [
          'Čo presne je v cene: doklady, DPH, kontrolný a súhrnný výkaz, mzdy, závierka a daňové priznanie?',
          'Platím paušál, za doklad alebo oboje? Koľko zaplatím v mesiaci, keď bude dokladov viac?',
          'Ako odovzdám doklady a výpisy z banky? Musím niečo nosiť osobne?',
          'Kto podáva priznania a výkazy a dostanem potvrdenie, že sú podané?',
          'Ako rýchlo odpovedáte na otázky a kto Vás zastúpi počas dovolenky alebo choroby?',
          'Kto mi pripomenie termíny a povie, koľko dane a dokedy zaplatiť?',
          'Uzavrieme písomnú zmluvu? Kto zodpovedá za Vašu chybu a máte poistenie zodpovednosti?',
          'Ako ste pripravení na povinné e-faktúry od 1. 1. 2027?',
          'Uvidím priebežne, ako sa firme darí, alebo až pri závierke?',
          'Aká je výpovedná lehota a v akej podobe mi pri odchode odovzdáte doklady a účtovníctvo?',
        ],
      },
      {
        h: 'Na čo si dať pozor',
        p: ['Tieto signály neznamenajú zlého účtovníka, ale oplatí sa pri nich spýtať viac.'],
        list: [
          'cena bez rozpisu, z ktorej nie je jasné, čo je v nej a čo sa platí navyše',
          'žiadna písomná zmluva ani plná moc na podávanie',
          'účtovníctvo v programe, z ktorého Vám pri odchode nevydajú údaje',
          'jediný človek bez zastupovania, keď má firma DPH alebo zamestnancov',
          'sľub nižšej dane bez dokladov a bez vysvetlenia',
        ],
      },
      {
        h: 'Kedy je Firmony pre Vás a kedy nie',
        p: [
          `Firmony je pre s. r. o., ktoré chcú mať účtovníctvo online: doklady odfotiť alebo preposlať, mať prehľad v aplikácii a pevnú cenu podľa počtu dokladov, od ${eur(start.price)} mesačne. Vašu firmu má na starosti účtovníčka, ktorá vedie odbornú kontrolu, rieši dohodnuté podania a odpovie ${REPLY_WITHIN}.`,
          'Ak chcete účtovníka, s ktorým sa pravidelne stretávate osobne, budete spokojnejší s miestnym účtovníkom alebo kanceláriou. Ak vediete väčšiu firmu so stovkami dokladov mesačne, pripravíme Vám ponuku na mieru a otvorene povieme, či sme pre Vás tí správni.',
        ],
      },
    ],
    faq: [
      { q: 'Kedy si má nová s. r. o. zabezpečiť účtovníka?', a: 'Hneď, ako vznikne, teda zápisom do obchodného registra. Účtovníctvo vedie odo dňa svojho vzniku a už prvé doklady treba zaúčtovať.' },
      { q: 'Musí mať účtovník osvedčenie alebo certifikát?', a: 'Nie. Vedenie účtovníctva je voľná živnosť, na ktorú netreba preukazovať vzdelanie ani prax. Prax a referencie si preto overte sami.' },
      { q: 'Kto zodpovedá za chybu v účtovníctve?', a: 'Voči úradom firma: poverením účtovníka sa zodpovednosti nezbavuje. Škodu, ktorú účtovník spôsobí porušením svojich povinností, môžete od neho žiadať podľa zmluvy a zákona.' },
      { q: 'Koľko stojí účtovník pre s. r. o.?', a: `Závisí od počtu dokladov, DPH, zamestnancov a závierky. Vo Firmony od ${eur(start.price)} mesačne, mzdy ${eur(PAYROLL_PRICE)} mesačne za človeka a závierka s daňovým priznaním ${eur(CLOSING_PRICE)} ročne.` },
      { q: 'Môžem zmeniť účtovníka počas roka?', a: 'Áno. Doterajšiemu účtovníkovi dáte výpoveď podľa zmluvy a požiadate o odovzdanie dokladov a účtovníctva, nový pokračuje od stavov, ktoré prevezme. Vo Firmony môžete zadať kontakt a potvrdiť koordináciu prevzatia; účtovníčka preverí oprávnenie a dohodne odovzdanie. Pripravený list zostáva aj pre osobné vybavenie.' },
      { q: 'Je online účtovník rovnako spoľahlivý ako účtovník v meste?', a: 'Spoľahlivosť nezávisí od toho, kde účtovník sedí, ale od toho, čo je v zmluve, kto Vašu firmu kontroluje a ako rýchlo odpovedá. Položte online službe rovnakých desať otázok ako komukoľvek inému.' },
    ],
    sources: [
      { title: 'Zákon č. 431/2002 Z. z. o účtovníctve, § 4 a § 5 (Zákony pre ľudí)', url: 'https://www.zakonypreludi.sk/zz/2002-431' },
      { title: 'Podnikajte.sk: Zoznam voľných živností v roku 2026', url: 'https://www.podnikajte.sk/zivnost/zoznam-volnych-zivnosti-2026' },
    ],
    published: '2026-10-20',
    modified: '2026-10-29',
    keywords: ['ako vybrať účtovníka', 'účtovník pre novú s.r.o.', 'kde nájsť účtovníka', 'založil som s.r.o. účtovník', 'účtovná kancelária alebo online účtovník'],
  },
  {
    path: '/zalozenie-sro',
    nav: 'Založenie s. r. o.',
    title: `Založenie s. r. o. po 17. 8. 2026: postup a dokumenty | ${BRAND.name}`,
    description: 'Ako založiť s. r. o. podľa pravidiel od 17. augusta 2026. Notár alebo advokát, výnimka pre zjednodušený postup, základné imanie a prvé účtovníctvo.',
    first: 'Založenie s. r. o.',
    second: 'Podľa pravidiel od augusta 2026.',
    lead: 'Pri bežnom založení už nestačí vzor spoločenskej zmluvy s overenými podpismi. Od 17. augusta 2026 zákon vyžaduje notársku zápisnicu alebo dokument autorizovaný advokátom. Osobitný zjednodušený elektronický postup však zostáva zachovaný. Tu je, ako sa v možnostiach zorientovať.',
    sections: [
      {
        h: 'Najprv si vyberte správny postup',
        p: [
          'Pri štandardnom založení sa spoločenská zmluva vyhotovuje ako notárska zápisnica o právnom úkone alebo ako dokument autorizovaný advokátom. Podpisujú ju všetci zakladatelia. Pri jedinom zakladateľovi ju nahrádza zakladateľská listina v rovnakej zákonom určenej forme. Upravuje to § 57 ods. 1 až 3 Obchodného zákonníka.',
          'Výnimkou je zjednodušené založenie cez určený elektronický formulár podľa § 57 ods. 4 a § 110a. Nie je preto správne tvrdiť, že každá nová s. r. o. bez výnimky musí vzniknúť cez notára alebo advokáta.',
          'Právny stav tohto návodu je overený k 21. októbru 2026. Ide o založenie novej spoločnosti, nie o kúpu už existujúcej firmy.',
        ],
      },
      {
        h: 'Kedy prichádza do úvahy zjednodušené založenie',
        p: ['Podmienky § 110a ods. 2 musia byť splnené súčasne. Medzi ne patria:'],
        list: [
          'najviac päť spoločníkov a založenie na účel podnikania',
          'najviac 15 vybraných činností zo zákonného zoznamu voľných živností',
          'obchodné meno s dodatkom „s. r. o.“',
          'výlučne peňažné vklady a konateľ ako správca vkladu',
          'spoločnosť nemá ustanovenú dozornú radu',
          'splnené sú aj ostatné zákonné podmienky zápisu, ktoré tento postup neruší',
        ],
      },
      {
        h: 'Pripravte údaje, oprávnenia a vklady',
        p: [
          'Spoločenská zmluva podľa § 110 obsahuje najmä obchodné meno, sídlo, spoločníkov, predmet podnikania, základné imanie, jednotlivé vklady a ich splatenie, prvých konateľov, spôsob ich konania a správcu vkladov. Tieto údaje si ujasnite pred vyhotovením dokumentu.',
          'Základné imanie s. r. o. musí byť aspoň 5 000 € a vklad jedného spoločníka aspoň 750 € (§ 108 a § 109). Základné imanie nie je cenník právnika ani súdny poplatok. Správca vkladu vydáva pravdivé písomné vyhlásenie o splatení vkladov podľa § 60; nejde len o formálny podpis.',
          'Nepoužívajte bez kontroly starý checklist odkazujúci na § 112. Tento paragraf bol od 17. augusta 2026 vypustený. Konkrétne nastavenie vkladov patrí do aktuálne pripravovanej zakladateľskej dokumentácie.',
        ],
      },
      {
        h: 'Založenie ešte neznamená vznik firmy',
        p: [
          'Spoločnosť vzniká až dňom zápisu do obchodného registra. Podľa § 62 sa návrh podáva do 90 dní od založenia alebo od doručenia listiny preukazujúcej živnostenské či iné podnikateľské oprávnenie.',
          'Nový zákon č. 29/2026 Z. z. upravuje registráciu na registrovom súde aj u registrátora. Návrh sa podáva elektronickým formulárom cez špecializovaný portál, musí byť autorizovaný a musí mať všetky zápisové podklady. Osoba, ktorá ho podáva, potrebuje elektronickú schránku aktivovanú na doručovanie (§ 44 a § 45).',
          'Pri návrhu registrovému súdu zákon nepripúšťa jeho bežné dopĺňanie alebo opravu po podaní; na odstránenie nedostatkov slúžia námietky. Skontrolujte preto údaje a prílohy pred odoslaním. Samotné odoslanie formulára nie je potvrdením zápisu.',
        ],
      },
      {
        h: 'Účtovníctvo pripravte od prvého dňa',
        p: [
          'Právnická osoba vedie účtovníctvo odo dňa vzniku podľa § 4 ods. 1 zákona o účtovníctve. Účtovníkovi odovzdajte zakladateľské dokumenty, vyhlásenie správcu vkladu, prvé doklady a bankové podklady. Prakticky je vhodné dohodnúť si ich preberanie ešte pred zápisom.',
          'Vo Firmony po vzniku firmy doplníme jej údaje podľa IČO z registra. Prevzatie služby podlieha identifikácii a odbornému schváleniu. Tento návod nie je ponukou právneho založenia spoločnosti ani prísľubom automatického prijatia každej firmy.',
        ],
      },
    ],
    faq: [
      { q: 'Stačí od augusta 2026 overiť podpisy na vzore spoločenskej zmluvy?', a: 'Pri štandardnom založení nie. § 57 vyžaduje notársku zápisnicu alebo dokument autorizovaný advokátom. Samostatnou možnosťou je zákonom vymedzené zjednodušené elektronické založenie podľa § 110a.' },
      { q: 'Koľko musí mať s. r. o. základné imanie?', a: 'Aspoň 5 000 €. Vklad jedného spoločníka musí byť aspoň 750 €. Právne služby a registračné poplatky sú samostatné položky.' },
      { q: 'Kedy moja spoločnosť právne vznikne?', a: 'Dňom zápisu do obchodného registra, nie podpisom zakladateľskej listiny ani odoslaním návrhu.' },
      { q: 'Musím mať účtovníctvo, aj keď firma ešte nič nepredala?', a: 'Áno. Právnická osoba vedie účtovníctvo už odo dňa vzniku. Prvé účtovné prípady môžu súvisieť napríklad s vkladmi a počiatočnými nákladmi.' },
    ],
    sources: [
      { title: 'Obchodný zákonník: § 57, § 60, § 62 a § 108 až § 110a, znenie od 17. 8. 2026 (Slov-Lex)', url: 'https://static.slov-lex.sk/static/SK/ZZ/1991/513/20260817.html#paragraf-57' },
      { title: 'Zákon č. 29/2026 Z. z.: § 44 a § 45 a zmeny Obchodného zákonníka, od 17. 8. 2026 (Slov-Lex)', url: 'https://static.slov-lex.sk/static/SK/ZZ/2026/29/20260817.html#paragraf-44' },
      { title: 'Zákon o účtovníctve: § 4, znenie od 1. 6. 2026 (Slov-Lex)', url: 'https://static.slov-lex.sk/static/SK/ZZ/2002/431/20260601.html#paragraf-4' },
    ],
    published: '2026-10-21',
    modified: '2026-10-21',
    keywords: ['založenie s.r.o. 2026', 'založenie sro po 17.8.2026', 's.r.o. notár advokát', 'zjednodušené založenie sro', 'základné imanie sro'],
  },
  {
    path: '/registracia-dph',
    nav: 'Registrácia na DPH',
    title: `Registrácia na DPH: obrat 50 000 € a hranica 62 500 € | ${BRAND.name}`,
    description: 'Kedy sa firma stáva platiteľom DPH v roku 2026, dokedy podať žiadosť a prečo prekročenie 50 000 € nie je to isté ako prekročenie 62 500 €.',
    first: 'Registrácia na DPH.',
    second: 'Dve hranice, odlišné následky.',
    lead: 'Pri bežnej tuzemskej firme sledujete obrat za kalendárny rok. Presiahnutie 50 000 € spravidla znamená platiteľstvo od nasledujúceho januára. Presiahnutie 62 500 € ho môže spustiť už konkrétnym dodaním v tom istom roku. Žiadosť však nečaká do januára.',
    sections: [
      {
        h: 'Obrat nie je zostatok na bankovom účte',
        p: [
          'Podľa § 4 ods. 15 zákona o DPH je základom obratu hodnota dodaných tovarov a služieb v tuzemsku bez dane, s výnimkami uvedenými v tomto ustanovení. Nie je to mechanický súčet každej prijatej platby ani účtovný zisk. Niektoré oslobodené plnenia sa vylučujú, iné sa môžu započítavať; príležitostný predaj majetku má vlastné pravidlo.',
          'Pre hranice v § 4 ods. 1 písm. a) a b) sa sleduje kalendárny rok. Staré pravidlo 12 po sebe idúcich mesiacov sem nepreberajte. Tento návod opisuje bežnú tuzemskú zdaniteľnú osobu podľa pravidiel overených k 21. októbru 2026.',
        ],
      },
      {
        h: 'Keď presiahnete 50 000 €',
        p: [
          'Ak hodnota plnení zahrnovaných do obratu v kalendárnom roku presiahne 50 000 €, podávate žiadosť o registráciu do piatich pracovných dní od presiahnutia. Ak nenastane skorší zákonný dôvod, platiteľom sa stanete 1. januára nasledujúceho roka (§ 4 ods. 1 písm. a) a ods. 2). Samotných presne 50 000 € ešte nie je presiahnutie.',
          'Príklad: v roku 2026 máte započítateľný obrat 49 000 € a ďalším bežným tuzemským dodaním 3 000 € dosiahnete 52 000 €. Žiadosť podáte už po tomto dodaní do piatich pracovných dní. Pri tomto príklade sa bez ďalšieho dôvodu stanete platiteľom 1. januára 2027.',
        ],
      },
      {
        h: 'Keď v tom istom roku presiahnete 62 500 €',
        p: [
          'Platiteľom sa stávate už dodaním tovaru alebo služby, ktorým obrat v prebiehajúcom kalendárnom roku presiahne 62 500 € (§ 4 ods. 1 písm. b)). Nečakáte na január ani na doručenie rozhodnutia. Pri bežnom zdaniteľnom dodaní sa DPH týka tohto dodania, nie iba sumy nad hranicou.',
          'Pokračovanie príkladu: po obrate 52 000 € dodáte v roku 2026 ďalšiu bežne zdaniteľnú tuzemskú službu za 12 000 €. Obrat je 64 000 € a platiteľstvo vzniká týmto dodaním. Ak ste žiadosť po prekročení 50 000 € už podali, skorší vznik platiteľstva bezodkladne oznámite daňovému úradu podľa § 4 ods. 5. Ak podaná nebola, postupujete podľa príslušnej päťdňovej lehoty v § 4 ods. 2.',
          'Takýto obchod preverte ešte pred dohodnutím konečnej ceny a vystavením faktúry. Pri nehnuteľnostiach, prijatých platbách na ne, nástupníctve alebo nadobudnutí podniku môžu rozhodovať iné ustanovenia § 4 ods. 1.',
        ],
      },
      {
        h: 'Dobrovoľná registrácia a zahraničné služby',
        p: [
          'Platiteľom sa môžete stať aj dobrovoľne pred presiahnutím hraníc, pri splnení § 4 ods. 6 až 8. Rozlišujte dobrovoľnú žiadosť a osobitnú možnosť skoršieho platiteľstva po presiahnutí 50 000 €. Konkrétny deň závisí od zvoleného zákonného postupu.',
          'Ani nízky obrat neznamená, že nemusíte riešiť DPH. § 7a môže vyžadovať registráciu ešte pred prijatím určitej služby od dodávateľa z iného členského štátu alebo pred dodaním určitej služby odberateľovi v inom členskom štáte. Zákon tu nestanovuje hranicu 50 000 €. Musia však byť splnené jeho podmienky miesta dodania a osoby povinnej platiť daň.',
          'Registrácia podľa § 7a sama osebe nie je plným platiteľstvom podľa § 4. Samostatne sa posudzujú aj nákupy tovaru z EÚ a ďalšie cezhraničné situácie. Nepoužívajte jeden univerzálny postup na všetky zahraničné faktúry.',
        ],
      },
      {
        h: 'Čo si pripraviť pre účtovníka',
        p: ['Pri blížiacej sa hranici odporúčame kontrolovať plánované dodania, nielen už vystavené faktúry. Pre posúdenie pripravte:'],
        list: [
          'dátumy a hodnoty dodaní od začiatku kalendárneho roka',
          'krajinu a miesto dodania, oslobodené plnenia a príležitostný predaj majetku',
          'väčšie pripravované zákazky a podmienky ceny s odberateľom',
          'už podané žiadosti, oznámenia a doručené rozhodnutia',
          'zahraničné služby, ktoré budete prijímať alebo dodávať ešte pred plným platiteľstvom',
        ],
      },
    ],
    faq: [
      { q: 'Mám presne 50 000 € obratu. Už som prekročil hranicu?', a: 'Nie. § 4 používa presiahnutie 50 000 €. Sleduje sa však obrat určený zákonom, ktorý nemusí byť totožný so súčtom úhrad na účte.' },
      { q: 'Po presiahnutí 50 000 € stačí podať žiadosť v januári?', a: 'Nie. Lehota na žiadosť je päť pracovných dní od presiahnutia. Odlišuje sa od dňa, keď sa stanete platiteľom.' },
      { q: 'Po presiahnutí 62 500 € platím DPH iba z rozdielu?', a: 'Pri bežnom zdaniteľnom dodaní nie. Platiteľom sa stávate dodaním, ktorým sa hranica presiahne, a posudzuje sa toto dodanie ako celok.' },
      { q: 'Môže mať povinnosť registrácie aj firma s malým obratom?', a: 'Áno. Napríklad pri službách z EÚ alebo do EÚ môžu byť splnené podmienky § 7a ešte pred prijatím či dodaním služby, bez hranice 50 000 €. Nejde tým automaticky o plné platiteľstvo DPH.' },
    ],
    sources: [
      { title: 'Zákon o DPH: § 4 ods. 1 až 8 a ods. 15, znenie platné v roku 2026 (Slov-Lex)', url: 'https://static.slov-lex.sk/static/SK/ZZ/2004/222/20260101.html#paragraf-4' },
      { title: 'Zákon o DPH: § 7a, registrácia pri cezhraničných službách (Slov-Lex)', url: 'https://static.slov-lex.sk/static/SK/ZZ/2004/222/20260101.html#paragraf-7a' },
    ],
    published: '2026-10-21',
    modified: '2026-10-21',
    keywords: ['registrácia DPH 50000', 'obrat DPH 62500', 'kedy sa stať platiteľom DPH', 'registrácia DPH päť pracovných dní', 'registrácia 7a'],
  },
  {
    path: '/danove-priznanie-pravnickej-osoby',
    nav: 'Daňové priznanie s. r. o.',
    title: `Daňové priznanie právnickej osoby za rok 2026: sadzby a termín | ${BRAND.name}`,
    description: 'Daňové priznanie s. r. o. za rok 2026: termín, odklad, sadzby 10 %, 21 % a 24 %, minimálna daň a rozdiel medzi priznaním a účtovnou závierkou.',
    first: 'Daňové priznanie právnickej osoby.',
    second: 'Čo pripraviť za rok 2026.',
    lead: 'Pri s. r. o. sa priznanie začína spoľahlivo uzavretým účtovníctvom. Sadzba sa určuje podľa zdaniteľných príjmov, samotná daň sa však počíta zo základu dane. Strata alebo nulová činnosť automaticky neznamenajú, že sa priznanie nepodáva alebo nič neplatí.',
    sections: [
      {
        h: 'Kto podáva a kedy',
        p: [
          'Bežná podnikateľská s. r. o. podáva priznanie aj pri strate alebo bez tržieb. Výnimky v § 41 ods. 1 zákona o dani z príjmov sa nevzťahujú všeobecne na neaktívne obchodné spoločnosti. Likvidácia, konkurz, zánik alebo zmena zdaňovacieho obdobia vyžadujú samostatné posúdenie.',
          'Základná lehota podľa § 49 ods. 2 je tri kalendárne mesiace po uplynutí zdaňovacieho obdobia. Pri kalendárnom roku 2026 to podľa pravidiel overených k 21. októbru 2026 znamená 31. marec 2027. V rovnakej lehote sa spravidla platí aj daň. Pri hospodárskom roku nepreberajte automaticky marcový termín.',
          'S. r. o. zapísaná v obchodnom registri doručuje podania finančnej správe elektronicky podľa § 14 daňového poriadku. Nestačí mať pripravený dokument v počítači; podanie musí byť riadne doručené.',
        ],
      },
      {
        h: 'Odklad treba oznámiť včas',
        p: [
          'Oznámením podaným do riadnej lehoty možno podľa § 49 ods. 3 predĺžiť lehotu najviac o tri celé kalendárne mesiace. Ak súčasťou príjmov sú zdaniteľné príjmy zo zdrojov v zahraničí, najviac o šesť celých kalendárnych mesiacov. V oznámení uvediete novú lehotu, ktorá je koncom kalendárneho mesiaca; presúva sa aj splatnosť dane.',
          'Pri bežnej s. r. o. s kalendárnym rokom 2026 to znamená najneskôr 30. jún 2027, pri splnení podmienky zahraničných príjmov najneskôr 30. september 2027. Samotná faktúra od zahraničného dodávateľa nie je zahraničný príjem. Pre spoločnosť v konkurze alebo likvidácii platí odlišný režim žiadosti, nie toto bežné oznámenie.',
        ],
      },
      {
        h: 'Sadzba dane: 10 %, 21 % alebo 24 %',
        p: [
          'Pre bežný základ dane právnickej osoby znížený o daňovú stratu stanovuje § 15 písm. b) bod 1 sadzby podľa zdaniteľných príjmov, teda výnosov, za zdaňovacie obdobie. Nie podľa zisku, zostatku na účte ani hranice obratu na registráciu DPH.',
          'Účtovný výsledok hospodárenia nie je automaticky základ dane. Podľa § 17 sa upravuje napríklad o položky, ktoré nie sú daňovým výdavkom, a o ďalšie zákonné rozdiely. Osobitné základy dane majú samostatné pravidlá.',
        ],
        list: [
          '10 % pri zdaniteľných príjmoch najviac 100 000 € vrátane',
          '21 % pri zdaniteľných príjmoch nad 100 000 € do 5 000 000 € vrátane',
          '24 % pri zdaniteľných príjmoch nad 5 000 000 €',
        ],
      },
      {
        h: 'Minimálna daň môže vzniknúť aj pri strate',
        p: [
          'Ak vypočítaná daň po zákonných úpravách nedosiahne minimálnu daň alebo firma vykáže stratu, preveruje sa § 46b. Pre celé zdaňovacie obdobie začínajúce najskôr 1. januára 2026 zákon stanovuje nasledujúce pásma podľa zdaniteľných príjmov. Účinnosť novej úpravy určuje aj § 52zzzj ods. 5.',
          'Existujú výnimky, napríklad pri prvom priznaní za obdobie, v ktorom spoločnosť vznikla, ak nejde o právneho nástupcu. Kratšie obdobie a podmienky zníženia či zápočtu majú vlastné pravidlá. Nižšie sumy preto nie sú univerzálnym výpočtom pre každú firmu.',
        ],
        list: [
          'do 50 000 € vrátane: 340 €',
          'nad 50 000 € do 250 000 € vrátane: 960 €',
          'nad 250 000 € do 500 000 € vrátane: 1 920 €',
          'nad 500 000 € do 5 000 000 € vrátane: 3 840 €',
          'nad 5 000 000 €: 11 520 €',
        ],
      },
      {
        h: 'Čo odovzdať na uzavretie roka',
        p: ['Toto je praktický zoznam podkladov pre účtovníka, nie automatický zoznam príloh priznania. Rozsah závisí od činnosti firmy:'],
        list: [
          'všetky prijaté a vydané doklady, bankové výpisy a pokladničné doklady',
          'neuhradené pohľadávky a záväzky a vysvetlenie sporných zostatkov',
          'stav majetku, odpisy, zásoby a výsledky inventarizácie',
          'mzdy, odvody, zmluvy, úvery, pôžičky a vzťahy so spoločníkmi',
          'zahraničné príjmy, zaplatené zahraničné dane, daňové straty a preddavky',
        ],
      },
      {
        h: 'Priznanie a závierka sú dve povinnosti',
        p: [
          'Podľa § 49 ods. 11 sa na účely priznania zostavuje účtovná závierka a v zákonnej lehote sa ukladá podľa zákona o účtovníctve. Podané daňové priznanie samo osebe nenahrádza uloženie závierky do registra účtovných závierok. Pre bežnú s. r. o. ide o elektronické dokumenty podľa § 23a.',
          'Pred uzavretím si s účtovníkom potvrďte výslednú daň, lehotu, platobné údaje a prijatie podaní. Vo Firmony sa závierka a priznanie pripravujú v účtovnej časti; odbornú kontrolu a podanie zabezpečuje účtovníčka. Automatický návrh nie je potvrdením od úradu.',
        ],
      },
    ],
    faq: [
      { q: 'Firma v roku 2026 nemala tržby. Musí podať priznanie?', a: 'Bežná podnikateľská s. r. o. áno. Osobitne sa posúdi minimálna daň a jej výnimky; samotná nulová činnosť neznamená všeobecné oslobodenie.' },
      { q: 'Hranica 100 000 € pre 10 % sadzbu znamená zisk?', a: 'Nie. Ide o zdaniteľné príjmy, teda výnosy za obdobie. Sadzba sa následne použije na príslušný základ dane znížený o daňovú stratu.' },
      { q: 'Môžem si automaticky posunúť termín na september, keď nakupujem zo zahraničia?', a: 'Nie. Šesťmesačné predĺženie oznámením je viazané na zdaniteľné príjmy zo zdrojov v zahraničí. Zahraničný dodávateľ sám osebe túto podmienku nevytvára.' },
      { q: 'Stačí podať priznanie a závierka je tým vybavená?', a: 'Nie. Priznanie a uloženie účtovnej závierky sú samostatné povinnosti. Overte si riadne doručenie oboch dokumentov.' },
    ],
    sources: [
      { title: 'Zákon o dani z príjmov: § 15, § 17, § 41, § 46b a § 49, účinné znenie roku 2026 (Slov-Lex)', url: 'https://static.slov-lex.sk/static/SK/ZZ/2003/595/20260101.html#paragraf-15' },
      { title: 'Zákon o dani z príjmov: § 52zzzj ods. 5, prvé použitie nových pásiem minimálnej dane (Slov-Lex)', url: 'https://static.slov-lex.sk/static/SK/ZZ/2003/595/20260101.html#paragraf-52zzzj' },
      { title: 'Zákon o dani z príjmov: overené rovnaké ustanovenia aj v znení od 31. 12. 2026 (Slov-Lex)', url: 'https://static.slov-lex.sk/static/SK/ZZ/2003/595/20261231.html#paragraf-49' },
      { title: 'Zákon o dani z príjmov: overená rovnaká lehota aj v už vyhlásenom znení od 1. 1. 2027 (Slov-Lex)', url: 'https://static.slov-lex.sk/static/SK/ZZ/2003/595/20270101.html#paragraf-49' },
      { title: 'Daňový poriadok: § 14, elektronické podania, znenie od 1. 9. 2026 (Slov-Lex)', url: 'https://static.slov-lex.sk/static/SK/ZZ/2009/563/20260901.html#paragraf-14' },
      { title: 'Zákon o účtovníctve: § 23a, elektronické ukladanie dokumentov (Slov-Lex)', url: 'https://static.slov-lex.sk/static/SK/ZZ/2002/431/20260601.html#paragraf-23a' },
    ],
    published: '2026-10-21',
    modified: '2026-10-21',
    keywords: ['daňové priznanie právnickej osoby 2026', 'daňové priznanie sro 2027 termín', 'sadzba dane právnickej osoby 10 21 24', 'minimálna daň sro 2026', 'odklad daňového priznania sro'],
  },
  {
    path: '/zmena-uctovnika',
    nav: 'Zmena účtovníka',
    title: `Zmena účtovníka: postup a zoznam podkladov na prevzatie | ${BRAND.name}`,
    description: 'Ako pripraviť bezpečnú zmenu účtovníka, aj počas roka. Odovzdávací protokol, účtovné dáta, plné moci, termíny a kontrola po prevzatí.',
    first: 'Zmena účtovníka.',
    second: 'S jasným odovzdaním a termínmi.',
    lead: 'Pri zmene účtovníka nejde iba o presun faktúr. Nový účtovník potrebuje nadviazať na zostatky, podané priznania, majetok aj otvorené povinnosti. Najbezpečnejší začiatok je dohodnúť dátum prevzatia a kto ešte podá ktoré dokumenty.',
    sections: [
      {
        h: 'Najprv zmluva a dátum prevzatia',
        p: [
          'Zákon o účtovníctve v § 5 umožňuje poveriť účtovníctvom inú osobu. Neukladá všeobecné pravidlo, že sa účtovník smie meniť len v januári. Podmienky ukončenia terajšej služby však vychádzajú z Vašej zmluvy a príslušného práva; neexistuje jedna výpovedná lehota pre všetky účtovné kancelárie.',
          'Prakticky odporúčame písomne určiť posledné obdobie pôvodného účtovníka, prvý deň nového a zodpovednú osobu za najbližšie podania. Osobitne si potvrďte mzdy, DPH, výkazy, ročnú závierku a rozpracované výzvy úradov. Nepredpokladajte, že podanie automaticky dokončí druhá strana.',
        ],
      },
      {
        h: 'Odovzdajte účtovníctvo, nielen priečinok s PDF',
        p: ['Nasledujúci zoznam je odporúčanie na kontrolované prevzatie. Nie každá firma má všetky uvedené agendy a univerzálny zákonný exportný formát z neho nevzniká. Vyžiadajte si najmä:'],
        list: [
          'účtovný denník, hlavnú knihu, obratovú predvahu a účtový rozvrh vrátane analytík',
          'saldokonto pohľadávok a záväzkov vrátane čiastočných úhrad',
          'doklady a úplné bankové výpisy, stav pokladnice a inventarizačné podklady',
          'evidenciu majetku, odpisové plány, zásoby, úvery a pôžičky',
          'podané priznania a výkazy spolu s potvrdeniami o doručení, opravami a otvorenými výzvami',
          'mzdové podklady, zamestnancov, rozpracované povinnosti a potrebnú historickú dokumentáciu',
          'predchádzajúce závierky, daňové straty, preddavky a nastavenia DPH',
        ],
      },
      {
        h: 'Spíšte odovzdávací protokol',
        p: [
          'Do protokolu odporúčame uviesť deň odovzdania, obdobia, zoznam súborov a listín, konečné zostatky a známe chýbajúce podklady. Priložte zoznam nedokončených úloh s menom zodpovednej osoby a termínom. Takto viete odlíšiť prevzatý stav od toho, čo sa bude ešte dopĺňať.',
          'Po importe overte, že súčty sedia na odovzdanú predvahu, otvorené faktúry obsahujú správne zostávajúce sumy a nadväzuje banka, pokladnica a majetok. Chyba v zdrojových dátach sa samotným presunom do nového systému neopraví. Úplnosť a preukázateľnosť vyžaduje § 8 zákona o účtovníctve.',
        ],
      },
      {
        h: 'Plná moc musí nadviazať bez medzery',
        p: [
          'Podľa § 9 daňového poriadku je plnomocenstvo voči správcovi dane účinné doručením alebo udelením do zápisnice. Nové plnomocenstvo v uvedenom rozsahu nahrádza predchádzajúce a v tej istej veci môže byť len jeden zástupca. Odvolanie či výpoveď plnomocenstva sú tiež účinné voči správcovi dane po doručení alebo zápise do zápisnice.',
          'So zástupcami preto dohodnite poradie krokov a overte oprávnenie na konkrétne podania. Prístupy do aplikácií, banky a ďalších úradných systémov spravujte osobitne. Heslá a súkromné podpisové prostriedky neposielajte novému účtovníkovi ako náhradu riadneho oprávnenia.',
        ],
      },
      {
        h: 'Uchovanie dokladov pokračuje aj po zmene',
        p: [
          'Poverením účtovníka sa firma nezbavuje zákonnej zodpovednosti podľa § 5 ods. 2. Účtovné doklady, knihy a závierky sa podľa § 35 uchovávajú spravidla desať rokov nasledujúcich po roku, ktorého sa týkajú. § 36 a osobitné predpisy môžu vyžadovať dlhšie uchovanie.',
          'Lehota na prístup do aplikácie nie je zákonná doba archivácie účtovných dokladov. Pred zrušením prístupov si prevezmite a overte čitateľný úplný archív a určte, kto ho bude ďalej uchovávať. Osobitné AML uchovávanie poskytovateľa nenahrádza účtovnú archivačnú povinnosť Vašej firmy.',
        ],
      },
      {
        h: 'Ako sa podklady preberajú vo Firmony',
        p: [
          'Účtovníčka má nástroje na prevzatie obratovej predvahy, otvorených položiek, majetku, zamestnancov a predchádzajúcich závierok zo súborov. Rozpoznanie a vhodnosť konkrétneho exportu sa overujú pri prevzatí; nesľubujeme bez kontroly úplný import z každého programu.',
          'Pred začatím služby sa overuje firma a oprávnená osoba. Po uzavretí zmluvy môžete v aplikácii zadať kontakt a potvrdiť koordináciu prevzatia. Účtovníčka preverí oprávnenie, dohodne odovzdanie a prijme podklady priamo. Vy vybavíte potrebný podpis alebo konkrétne doplnenie; priebeh a ďalší krok uvidíte v aplikácii. Termín prevzatia sa potvrdí podľa rozsahu a stavu Vášho účtovníctva.',
        ],
      },
    ],
    faq: [
      { q: 'Môžem zmeniť účtovníka počas roka?', a: 'Áno, zákon o účtovníctve zmenu neviaže len na začiatok roka. Dodržte však zmluvné podmienky ukončenia a určte dátum prevzatia aj zodpovednosť za podania.' },
      { q: 'Stačia novému účtovníkovi faktúry v PDF?', a: 'Obvykle nie. Na nadviazanie potrebuje aj účtovné zostatky, otvorené položky, históriu podaní a podľa činnosti ďalšie evidencie. Zoznam sa dohodne podľa Vašej firmy.' },
      { q: 'Prestávam po odovzdaní zodpovedať za účtovníctvo?', a: 'Nie. Podľa § 5 ods. 2 zostáva zákonná zodpovednosť účtovnej jednotke aj pri externom účtovníkovi. Zmluvná zodpovednosť poskytovateľa sa posudzuje samostatne.' },
      { q: 'Môžem po prechode zmazať staré doklady?', a: 'Nie iba preto, že ste zmenili účtovníka. Dodržte zákonné uchovávanie a najprv overte úplnosť a čitateľnosť prevzatého archívu.' },
    ],
    sources: [
      { title: 'Zákon o účtovníctve: § 5 a § 8, poverenie a preukázateľnosť účtovníctva (Slov-Lex)', url: 'https://static.slov-lex.sk/static/SK/ZZ/2002/431/20260601.html#paragraf-5' },
      { title: 'Zákon o účtovníctve: § 35 a § 36, uchovávanie dokumentácie (Slov-Lex)', url: 'https://static.slov-lex.sk/static/SK/ZZ/2002/431/20260601.html#paragraf-35' },
      { title: 'AML zákon: § 19, osobitné uchovávanie u poskytovateľa (Slov-Lex)', url: 'https://static.slov-lex.sk/static/SK/ZZ/2008/297/20260817.html#paragraf-19' },
      { title: 'Daňový poriadok: § 9, zastupovanie, znenie od 1. 9. 2026 (Slov-Lex)', url: 'https://static.slov-lex.sk/static/SK/ZZ/2009/563/20260901.html#paragraf-9' },
    ],
    published: '2026-10-21',
    modified: '2026-10-22',
    keywords: ['zmena účtovníka', 'prechod k novému účtovníkovi', 'odovzdanie účtovníctva', 'zmena účtovníka počas roka', 'prevzatie účtovníctva'],
  },
  {
    path: '/kontrolny-a-suhrnny-vykaz',
    nav: 'Kontrolný a súhrnný výkaz',
    title: `Kontrolný a súhrnný výkaz DPH: rozdiel a termíny | ${BRAND.name}`,
    description: 'Kto podáva kontrolný a súhrnný výkaz DPH, aké majú obdobia, lehoty a výnimky. Aj súhrnný výkaz neplatiteľa registrovaného podľa § 7a.',
    first: 'Kontrolný a súhrnný výkaz.',
    second: 'Nie sú to rovnaké podania.',
    lead: 'Kontrolný výkaz rozpisuje zákonom určené údaje k DPH. Súhrnný výkaz zachytáva vybrané dodania do iných členských štátov EÚ. Firma môže podávať oba, iba jeden alebo v konkrétnom období žiadny. O povinnosti nerozhoduje len názov faktúry ani to, či má firma IČ DPH.',
    sections: [
      {
        h: 'Čo je kontrolný výkaz',
        p: [
          'Podľa § 78a zákona o DPH ho podáva platiteľ elektronicky za zdaňovacie obdobie, za ktoré má povinnosť podať priznanie, s výnimkami uvedenými v tomto ustanovení. Obsahuje údaje z určených prijatých a vydaných faktúr, opráv a ďalších plnení. Nie je náhradou daňového priznania k DPH.',
          'Bežná lehota je do 25 dní po skončení zdaňovacieho obdobia. Pre platiteľa, ktorý riadne splnil registračnú povinnosť, ale pri prvom období ešte nedostal IČ DPH, zákon ustanovuje osobitnú lehotu päť pracovných dní od doručenia rozhodnutia. Právny stav je tu overený k 21. októbru 2026.',
        ],
      },
      {
        h: 'Kedy kontrolný výkaz nevzniká',
        p: [
          'Nulové priznanie automaticky neznamená nulový kontrolný výkaz, ktorý treba odoslať. § 78a ods. 1 obsahuje výnimku, ak v priznaní nie je povinnosť uviesť žiadne údaje o plneniach. Ďalšia sa týka len dodaní oslobodených podľa § 43 alebo § 47 pri splnení podmienok odpočítania uvedených v zákone.',
          'Osoba registrovaná iba podľa § 7 alebo § 7a sa tým nestáva platiteľom podľa § 4. Samotná táto registrácia jej nevytvára povinnosť podávať kontrolný výkaz ako platiteľ. Pri cezhraničných obchodoch však môže mať inú povinnosť, napríklad priznanie alebo súhrnný výkaz.',
        ],
      },
      {
        h: 'Čo patrí do súhrnného výkazu',
        p: [
          '§ 80 uvádza najmä určené oslobodené dodania a premiestnenia tovaru do EÚ, účasť prvého odberateľa na trojstrannom obchode, vybrané služby s miestom dodania v inom členskom štáte, pri ktorých daň platí príjemca, a prípady režimu call-off stock.',
          'Nie každá faktúra do zahraničia je položkou súhrnného výkazu. Rozhoduje druh plnenia, miesto dodania a splnenie konkrétnych podmienok. Napríklad samotné prijatie zahraničnej služby nie je jej dodaním do EÚ. Služby oslobodené podľa práva štátu miesta dodania sa podľa § 80 ods. 5 do výkazu neuvádzajú.',
          'Aj zdaniteľná osoba registrovaná podľa § 7 alebo § 7a podáva výkaz za štvrťrok, v ktorom dodala službu spĺňajúcu § 80 ods. 1 písm. d). Preto môže mať súhrnný výkaz aj neplatiteľ DPH.',
        ],
      },
      {
        h: 'Mesačný alebo štvrťročný?',
        p: [
          'Pre platiteľa je východiskom súhrnný výkaz za kalendárny mesiac. Štvrťročné podávanie je možné podľa § 80 ods. 2, ak hodnota určených tovarových plnení nepresiahne 50 000 € v príslušnom štvrťroku ani v predchádzajúcich štyroch kalendárnych štvrťrokoch. Pri presiahnutí sa mení postup už v danom štvrťroku.',
          'Táto hranica 50 000 € nie je hranicou registrácie na DPH. Ide o iné pravidlo, iné obdobie a vybrané plnenia. Obdobie súhrnného výkazu sa preto nemusí zhodovať so zdaňovacím obdobím priznania k DPH.',
          'Pre osobu registrovanú podľa § 7 alebo § 7a pri uvedených službách zákon určuje štvrťrok. Pri jej účasti ako prvého odberateľa na trojstrannom obchode sa uplatní osobitná väzba na § 80 ods. 2.',
        ],
      },
      {
        h: 'Lehoty, opravy a potvrdenia',
        p: [
          'Súhrnný výkaz sa podáva elektronicky najneskôr do 25 dní po skončení príslušného obdobia (§ 80 ods. 9). Ak posledný deň daňovej lehoty pripadne na sobotu, nedeľu alebo deň pracovného pokoja, podľa § 27 ods. 4 daňového poriadku sa posúva na najbližší nasledujúci pracovný deň.',
          'Ak chybu zistíte pred uplynutím lehoty, zákon pri oboch výkazoch upravuje opravné podanie. Po lehote ide o dodatočný výkaz s doplnenými alebo opravenými údajmi (§ 78a ods. 12 a § 80 ods. 8). Oprava samotného daňového priznania tým nemusí byť vybavená, posudzuje sa samostatne.',
          'Odporúčame uchovať odoslaný súbor aj potvrdenie o doručení a sledovať prípadné výzvy na odstránenie nedostatkov. Stav „pripravené“ v aplikácii ešte neznamená prijatie výkazu finančnou správou.',
        ],
      },
      {
        h: 'Čo pripravuje Firmony a čo kontroluje účtovníčka',
        p: [
          'Z údajov účtovníctva sa pripravujú XML podklady k priznaniu a kontrolnému výkazu a podklady k súhrnnému výkazu. Účtovníčka kontroluje režim plnenia, obdobie, IČ DPH a väzbu na doklady. Podanie a jeho prijatie sa overujú osobitne.',
          'Ak doklad nemá dostatočné údaje, treba ho doplniť alebo odborne posúdiť. Cieľom je jedna konkrétna otázka k chýbajúcej informácii, nie prenesenie celého výpočtu na klienta.',
        ],
      },
    ],
    faq: [
      { q: 'Je kontrolný výkaz to isté ako priznanie k DPH?', a: 'Nie. Ide o samostatné podanie s vlastným obsahom. Pri povinnosti podať priznanie sa osobitne preveria pravidlá a výnimky pre kontrolný výkaz.' },
      { q: 'Podáva súhrnný výkaz aj neplatiteľ DPH?', a: 'Áno, napríklad osoba registrovaná podľa § 7a za štvrťrok, v ktorom dodala službu spĺňajúcu § 80 ods. 1 písm. d). Samotné prijatie služby zo zahraničia túto povinnosť nevytvára.' },
      { q: 'Mám štvrťročnú DPH. Je automaticky štvrťročný aj súhrnný výkaz?', a: 'Nie. Obdobie súhrnného výkazu sa posudzuje podľa § 80 samostatne, vrátane tovarového limitu a druhu registrácie.' },
      { q: 'Musím podať prázdny súhrnný výkaz, keď nebol žiadny obchod podľa § 80?', a: 'Povinnosť je viazaná na plnenia a udalosti uvedené v § 80. Ak v období žiadne také plnenie ani udalosť nenastali, z tohto ustanovenia povinnosť prázdneho výkazu nevzniká.' },
    ],
    sources: [
      { title: 'Zákon o DPH: § 78 a § 78a, priznanie a kontrolný výkaz, znenie roku 2026 (Slov-Lex)', url: 'https://static.slov-lex.sk/static/SK/ZZ/2004/222/20260101.html#paragraf-78a' },
      { title: 'Zákon o DPH: § 80, súhrnný výkaz a jeho obdobie (Slov-Lex)', url: 'https://static.slov-lex.sk/static/SK/ZZ/2004/222/20260101.html#paragraf-80' },
      { title: 'Zákon o DPH: § 4, § 7 a § 7a, odlišné druhy registrácie (Slov-Lex)', url: 'https://static.slov-lex.sk/static/SK/ZZ/2004/222/20260101.html#paragraf-7a' },
      { title: 'Daňový poriadok: § 27 ods. 4, počítanie lehôt, od 1. 9. 2026 (Slov-Lex)', url: 'https://static.slov-lex.sk/static/SK/ZZ/2009/563/20260901.html#paragraf-27' },
    ],
    published: '2026-10-21',
    modified: '2026-10-21',
    keywords: ['kontrolný výkaz DPH', 'súhrnný výkaz DPH', 'súhrnný výkaz 7a', 'kontrolný a súhrnný výkaz rozdiel', 'lehota súhrnný výkaz'],
  },
]
