// Every visible text of the site, in Slovak, typeset once (src/format.ts). Prices and limits come from
// src/config.ts, so a text can never say another figure than the plans have.
// Price/trust decisions and primary sources, with transfer limits: docs/research/trust-and-value-2026-10-22.md.
// These are product hypotheses; no conversion uplift or market-wide cheapest claim is asserted.
import { APP, BRAND, CLOSING_PRICE, INVESTORS, OPERATOR, ORDER, PAYROLL_PRICE, PLANS, REPLY_WITHIN, type Plan } from './config'
import { formatEur, typeset, typesetAll } from './format'

const start = PLANS[0] as Plan
const largest = PLANS[PLANS.length - 1] as Plan
const eur = (euros: number) => formatEur(euros * 100)

/** What a plan's rows say: whom it is for, documents, VAT, payroll. */
export function planRows(plan: Plan): { forWhom: string; docs: string; vat: string; people: string } {
  return {
    forWhom: typeset(plan.id === 'start' ? 'Pre firmy, ktoré nie sú platiteľmi DPH.' : plan.id === 'rast' ? 'Pre platiteľov DPH.' : 'Pre firmy s väčším počtom dokladov.'),
    docs: typeset(`do ${plan.docs} dokladov mesačne`),
    vat: typeset(plan.vatPayer ? 'mesačné priznanie, kontrolný a súhrnný výkaz' : 'priznania pri registrácii podľa § 7a'),
    people: typeset(`${eur(PAYROLL_PRICE)} mesačne za človeka`),
  }
}

export const copy = typesetAll({
  meta: {
    title: `${BRAND.name}: online účtovníctvo pre Vašu firmu od ${eur(start.price)} mesačne`,
    description: `Účtovníctvo s pridelenou účtovníčkou, dokladmi a termínmi v jednej aplikácii. Balíky od ${eur(start.price)} mesačne bez DPH, závierka ${eur(CLOSING_PRICE)} ročne. Rozsah a cenu si prejdeme pred zmluvou.`,
  },
  skip: 'Preskočiť na obsah',
  nav: { how: 'Ako to funguje', pricing: 'Cenník', about: 'Kto sme', faq: 'Otázky', investors: 'Pre investorov', login: 'Prihlásiť sa', start: 'Chcem začať', home: `${BRAND.name}, úvod` },

  hero: {
    first: 'Vy budujete firmu.',
    second: 'My strážime účtovníctvo.',
    lead: 'Doklady odfotíte alebo prepošlete. Účtovníčka sa postará o dohodnutú agendu a v aplikácii uvidíte, čo je hotové a čo potrebuje Vaše rozhodnutie.',
    price: `Od ${eur(start.price)} mesačne bez DPH. Závierka a priznanie ${eur(CLOSING_PRICE)} ročne.`,
    secondary: 'Pozrieť cenník',
    how: 'Ako to funguje',
  },

  /** The card in the opening where a client starts: the IČO. */
  card: {
    title: 'Začnite s IČO Vašej firmy',
    text: 'Názov a sídlo doplníme z registra. Zatiaľ nič neobjednávate.',
    next: 'Po nezáväznom dopyte si prejdeme Vašu agendu. Rozsah služby a cenu dostanete pred uzavretím zmluvy.',
    fine: `Ozveme sa ${REPLY_WITHIN}.`,
  },

  /** One month, as the papers fly into it while the page is scrolled. An illustration. */
  flow: {
    first: 'Vy pošlete doklady.',
    second: 'My ich skontrolujeme.',
    lead: 'Bloček odfotíte, faktúru prepošlete. Systém pomôže s čítaním a párovaním. Účtovníčka vedie odbornú kontrolu a postará sa o dohodnuté priznania.',
    label: 'Ukážka: október Vašej firmy vo Firmony, všetko zaúčtované',
    month: 'Október 2026',
    company: 'Vaša firma',
    count: '5 dokladov',
    rows: [
      { title: 'Bloček', sub: 'Kaviareň, 14. 10.', amount: '4,80 €', state: 'Zaúčtovaný' },
      { title: 'Faktúra 2026041', sub: 'Váš klient s. r. o.', amount: '+1 200 €', state: 'Zaúčtovaná' },
      { title: 'Výpis z účtu', sub: '23 platieb', amount: '', state: 'Spárovaný' },
      { title: 'E-faktúra', sub: 'Webhosting', amount: '14,90 €', state: 'Prijatá' },
      { title: 'Priznanie k DPH', sub: 'Za október', amount: '1 220 €', state: 'Podané' },
    ],
    foot: 'Všetko zaúčtované',
    footSub: 'Skontrolovala účtovníčka, 24. 11.',
    example: 'Ilustračná ukážka',
  },

  /** Four true figures, each with what it means. */
  stats: [
    { value: eur(start.price), label: `mesačne za balík ${start.name}` },
    { value: eur(0), label: 'za aplikáciu k účtovnej službe' },
    { value: eur(0), label: 'za založenie s. r. o. pri 36-mesačnom vedení' },
    { value: '1 deň', label: 'na odpoveď, po ľudsky' },
  ],

  /** The hug of the brand, read word by word. */
  statement: {
    first: 'Účtovníctvo, ktoré sa robí takmer samo.',
    second: 'AI prečíta doklady, systém navrhne zaúčtovanie, účtovníčka skontroluje.',
  },

  /** One offer the visitor cannot refuse: four deals in a ring that turns without end. */
  offer: {
    eyebrow: 'Výhodnejší štart s Firmony',
    title: 'Začnite s náskokom. Štyri výhody za 0 €.',
    lead: 'Prvý mesiac, pomoc so založením s. r. o., prechod k nám aj fakturácia. Pozrite sa, čo všetko u nás získate za 0 €.',
    /** The big accent under each card's title, the same on all four. */
    accent: 'ZA 0 €',
    items: [
      { title: 'Prvý mesiac', text: 'Za prvý mesiac služby neplatíte nič. Ak Vám Firmony nesadne, vypoviete zmluvu do jeho konca a neplatíte ani euro.' },
      { title: 'Pomoc so založením', text: 'Prevedieme Vás založením s. r. o. krok za krokom: čo pripraviť, ku komu ísť a čo podpísať. Za našu pomoc neplatíte.' },
      { title: 'Prechod k Firmony', text: 'So zmenou Vám pomôžeme tak, aby ste nemuseli začínať od nuly ani platiť za samotný prechod.' },
      { title: 'Fakturácia', text: 'Faktúry vystavujete zadarmo, aj keď u nás účtovníctvo nemáte. Našim klientom sa vystavené faktúry nerátajú do dokladov balíka.', link: { href: '/fakturacia', text: 'Začať fakturovať' } },
    ],
    cta: 'Chcem začať',
    fine: 'Bez viazanosti, s mesačnou výpovednou lehotou; výpoveď v prvom mesiaci ukončí zmluvu s jeho koncom. Odmenu notára alebo advokáta a poplatky za zápis firmy platí zakladateľ.',
    hint: 'Objavte všetky štyri výhody.',
    hintMobile: 'Potiahnite prstom a objavte ďalšie výhody.',
  },

  /** Everything in the price: pick one and see it. */
  services: {
    first: 'Doklady, dane aj odpovede.',
    second: 'Na jednom mieste.',
    lead: 'Vyberte si a pozrite sa, ako to vyzerá.',
    example: 'Ilustračná ukážka',
    items: [
      { id: 'doklady', title: 'Doklady a banka', text: 'Spracovanie dokladov a párovanie platieb podľa dohodnutej agendy.' },
      { id: 'dph', title: 'DPH a výkazy', text: 'Priznanie aj kontrolný výkaz podáme za Vás.' },
      { id: 'efaktury', title: 'E-faktúry', text: 'Príjem cez digitálneho poštára pripravujeme pred spustením služby.' },
      { id: 'mzdy', title: 'Mzdy', text: `Výplaty, odvody a hlásenia zamestnancov, ${eur(PAYROLL_PRICE)} mesačne za človeka.` },
      { id: 'terminy', title: 'Termíny', text: 'Postrážime každý a pripomenieme, čo chýba.' },
      { id: 'otazky', title: 'Otázky', text: 'Odpovieme do jedného pracovného dňa.' },
    ],
    /** What the machine reads off a slip, and what it proposes. The entry is the Slovak chart of accounts. */
    scan: {
      slip: { shop: 'Kaviareň', when: '14. 10. 2026, 8:42', item: '2× espresso', pay: 'Platba kartou', total: 'Spolu', sum: '4,80 €' },
      read: 'Prečítané z bločku',
      fields: [
        ['Obchodník', 'Kaviareň'],
        ['Dátum', '14. 10. 2026'],
        ['Suma', '4,80 €'],
        ['Druh', 'reprezentácia'],
      ] as [string, string][],
      entry: 'Návrh zaúčtovania',
      debit: ['MD 513', 'Náklady na reprezentáciu'],
      credit: ['D 221', 'Bankové účty'],
      flag: 'Reprezentácia nie je daňový výdavok.',
    },
    file: {
      doc: 'Priznanie k DPH',
      period: 'Obdobie: október 2026',
      status: 'Podané',
      rows: [
        ['Daň na úhradu', '1 220,15 €'],
        ['Splatnosť', '25. 11. 2026'],
        ['Kontrolný výkaz', 'podaný'],
      ] as [string, string][],
      checked: 'Skontrolovala účtovníčka',
      when: '24. 11. 2026, 9:41',
    },
    inbox: {
      title: 'Prijaté e-faktúry',
      via: 'pripravované napojenie na poštára',
      rows: [
        ['Webhosting', '14,90 €'],
        ['Telefón a internet', '29,00 €'],
        ['Coworking', '120,00 €'],
      ] as [string, string][],
      state: 'zaúčtovaná',
    },
    payroll: {
      title: 'Mzdy za október',
      rows: ['Výplatné pásky', 'Odvody do Sociálnej poisťovne', 'Zdravotné poistenie', 'Prehľad o preddavkoch na daň'],
      state: 'hotovo',
      note: `${eur(PAYROLL_PRICE)} mesačne za človeka, v každom balíku.`,
    },
    deadlines: {
      title: 'Termíny',
      rows: [
        ['25. 11.', 'Priznanie k DPH', 'podané'],
        ['25. 11.', 'Kontrolný výkaz', 'podaný'],
        ['30. 11.', 'Prehľad o preddavkoch na daň', 'pripravený'],
      ] as [string, string, string][],
      missing: 'Chýba jeden bloček z októbra. Pošlete nám ho, prosím?',
    },
    /** An operational question and the next useful step, without a simulated blanket tax ruling. */
    ask: {
      who: 'Vaša účtovníčka',
      online: 'odpovedá do jedného pracovného dňa',
      question: 'Kúpil som notebook do firmy. Čo mám poslať?',
      answer: 'Pošlite faktúru a stručne napíšte, ako ho používate vo firme. Zaúčtovanie a prípadné odpisy preverím.',
      thanks: 'Super, ďakujem!',
    },
  },

  /** The machine and the person. */
  duo: {
    first: 'Menej rutiny pre Vás.',
    second: 'Odborná kontrola pre Vašu firmu.',
    ai: { title: 'Umelá inteligencia', items: ['prečíta bloček aj faktúru', 'navrhne zaúčtovanie', 'spáruje platby z banky'] },
    human: { title: 'Vaša účtovníčka', items: ['vedie odbornú kontrolu', 'rieši neštandardné prípady a dohodnuté podania', 'odpovie na Vaše otázky'] },
  },

  einvoice: {
    // Read 22 October 2026: current law and the enacted 2027 wording, especially § 71(5), § 85o(2)-(4),(9)-(10).
    // https://static.slov-lex.sk/static/SK/ZZ/2004/222/20260101.html
    // https://static.slov-lex.sk/static/SK/ZZ/2004/222/20270101.html#paragraf-85o
    date: '1. 1. 2027',
    title: 'E-faktúry sa týkajú aj neplatiteľov DPH.',
    text: 'Pri určených tuzemských dodaniach ich vystavujú platitelia DPH. Vedieť ich prijať musia aj neplatitelia. Napojenie na digitálneho poštára pripravujeme pred spustením služby.',
    source: 'Zákon o DPH, § 71 ods. 5 a § 85o, znenie od 1. 1. 2027.',
    more: 'Čo musí urobiť Vaša firma',
  },

  pricing: {
    first: 'Jasná cena.',
    second: 'Platíte podľa počtu dokladov.',
    lead: 'Vyberte si podľa počtu dokladov za mesiac a podľa toho, či ste platiteľom DPH.',
    firstMonthFree: 'Prvý mesiac zadarmo. Vystavené faktúry sa do dokladov balíka nerátajú.',
    perMonth: 'mesačne',
    annual: 'Za 12 mesiacov so závierkou',
    annualBasis: 'Ročný súčet počíta s rovnakým balíkom počas 12 mesiacov a jednou závierkou s daňovým priznaním. Mzdy a individuálne dohodnuté práce sú navyše.',
    documents: 'Rozsah a zodpovednosť v podmienkach',
    privacy: 'Ako chránime Vaše údaje',
    rows: { docs: 'Doklady', vat: 'DPH', people: 'Mzdy' },
    included: `V každom balíku: zaúčtovanie dokladov a platieb, e-faktúry, mesačný prehľad, stráženie termínov a odpovede ${REPLY_WITHIN}.`,
    closing: `Závierka a daňové priznanie: ${eur(CLOSING_PRICE)} raz ročne. Mzdy: ${eur(PAYROLL_PRICE)} mesačne za človeka.`,
    vat: 'Ceny sú bez DPH, DPH zatiaľ nepripočítavame.',
    custom: `Viac ako ${largest.docs} dokladov mesačne? Pripravíme Vám ponuku na mieru.`,
    /** Beside the plans: the way in for a medium or large company, whose scope and price are agreed one by one. */
    large: {
      title: 'Na mieru',
      forWhom: 'Pre stredné a veľké firmy.',
      price: 'Cena podľa rozsahu',
      text: `Stovky dokladov mesačne, desiatky zamestnancov, viac účtov či prevádzok. Najprv s Vami prejdeme agendu, potom navrhneme rozsah, cenu a postup prechodu.`,
      cta: 'Chcem ponuku na mieru',
    },
  },

  /** What we promise, said once and plainly, next to the prices. */
  promises: [
    { title: 'Bez viazanosti', text: 'Mesačná výpovedná lehota.' },
    { title: 'Rozumiete cene vopred', text: 'Vidíte mesačný balík, ročnú závierku aj mzdy. Viac dokladov môže znamenať vyšší balík.' },
    { title: 'Odpoveď do pracovného dňa', text: 'Po slovensky, nie úradnícky.' },
    { title: 'Účtovníctvo je Vaše', text: 'Keď odídete, všetko Vám odovzdáme.' },
  ],

  calc: {
    title: 'Čo Vám vychádza výhodnejšie?',
    lead: 'Porovnajte náklady na rovnaký rozsah služieb za celý rok. Vyplňte svoje údaje bez DPH.',
    monthly: 'Dnešné mesačné náklady vrátane miezd',
    perDoc: 'Poplatok za doklad',
    docs: 'Dokladov mesačne',
    closing: 'Závierka a priznanie ročne',
    vat: 'Ste platiteľom DPH?',
    no: 'Nie',
    yes: 'Áno',
    people: 'Ľudia na mzde',
    button: 'Porovnať',
    empty: 'Zadajte svoje náklady. Uvidíte ročný súčet a rozdiel oproti Firmony.',
    today: 'Vaše zadané náklady za rok',
    save: 'Ušetríte ročne',
    more: 'S nami by ste ročne platili viac o',
    custom: 'Pre firmu s takýmto počtom dokladov pripravíme ponuku na mieru.',
    same: 'Pri týchto údajoch je ročná cena rovnaká.',
    note: `Firmony počíta aj so závierkou za ${eur(CLOSING_PRICE)} a mzdami za ${eur(PAYROLL_PRICE)} mesačne na človeka. Rovnaký počet dokladov a ľudí predpokladáme každý mesiac. Práce dohodnuté individuálne v súčte nie sú.`,
    inputHelp: 'Do mesačných nákladov zahrňte aj poplatky za mzdy a používaný účtovný softvér. Poplatok za doklad a ročnú závierku zadajte osobitne, aby sa nezapočítali dvakrát. Vyššiu aj nižšiu cenu ukážeme rovnakým spôsobom.',
    resultBasis: 'Orientačné cenové porovnanie podľa Vašich vstupov. Rozdiel nepotvrdzuje rovnakú kvalitu ani rozsah služieb. Konkrétnu ponuku si prejdeme spolu.',
    invalid: 'Skontrolujte čísla. Sumy píšte v eurách, napríklad 60 alebo 5,20.',
  },

  paths: {
    first: 'Začnite tam, kde ste.',
    second: 'My nadviažeme.',
    fresh: {
      title: 'Zakladáte firmu',
      text: 'So založením s. r. o. Vám pomôžeme zadarmo a účtovníctvo povedieme od mesiaca, v ktorom firma vznikne. Odmenu notára alebo advokáta a poplatky za zápis platí zakladateľ.',
      cta: 'Založím s. r. o.',
    },
    switching: {
      title: 'Meníte účtovníčku',
      text: 'Zadáte kontakt na doterajšiu účtovníčku a potvrdíte. Prevzatie aj odovzdanie podkladov vybavíme my. Vy riešite len potrebný podpis alebo doplnenie.',
      cta: 'Chcem prejsť',
    },
    large: {
      title: 'Vediete väčšiu firmu',
      text: 'Prejdeme s Vami agendu, navrhneme rozsah a cenu na mieru a prechod naplánujeme tak, aby žiadna povinnosť nezostala bez riešenia.',
      cta: 'Chcem ponuku na mieru',
    },
  },

  founder: {
    title: 'Kto za nami stojí',
    quote:
      'Keď som si založil firmu, najviac nervov ma nestálo podnikanie, ale papiere okolo neho. Firmony robíme, aby sa o účtovníctvo každej firmy postaral niekto spoľahlivý a ona mohla rásť.',
    name: 'Christian Juhás',
    role: 'zakladateľ Firmony',
  },

  /** The company behind the service, as the register has it, and how to reach it. */
  company: {
    title: `${BRAND.name} je služba spoločnosti`,
    seat: 'Sídlo',
    ico: 'IČO',
    dic: 'DIČ',
    register: 'Zápis',
    verify: 'Overiť v Obchodnom registri',
    contact: 'Kontakt',
    email: 'E-mail',
    phone: 'Telefón',
    reply: `Odpovedáme ${REPLY_WITHIN}.`,
  },

  faq: {
    title: 'Otázky',
    more: 'Nenašli ste odpoveď? Napíšte na',
    reply: `odpovieme ${REPLY_WITHIN}.`,
    items: [
      {
        q: 'Kto mi bude viesť účtovníctvo?',
        a: 'Vaša firma má pridelenú účtovníčku. Systém jej pomáha s čítaním dokladov a párovaním platieb. Ona vedie odbornú kontrolu, rieši neštandardné prípady, dohodnuté podania a Vaše otázky.',
      },
      {
        q: 'Čo musím robiť ja?',
        a: 'Doklady odfotíte, nahráte alebo prepošlete na adresu svojej firmy vo Firmony. Pri nahrávaní vidíte potvrdenie prijatia. Keď potrebujeme vysvetliť nákup, doplniť údaj alebo schváliť rozhodnutie, ozveme sa v aplikácii. Potrebné overenie a nastavenie prejdeme na začiatku spolu.',
      },
      {
        q: 'Objednávam si službu už zadaním IČO?',
        a: 'Nie. Najprv doplníme údaje z registra a po nezáväznom dopyte si prejdeme Vašu agendu. Pred uzavretím zmluvy dostanete rozsah služby, cenu a podmienky spolupráce. Zmluva má samostatný krok po overení údajov a totožnosti.',
      },
      {
        q: 'Viete viesť aj väčšiu firmu?',
        a: `Áno. Štandardné balíky sú pre firmy do ${largest.docs} dokladov mesačne. Pri väčšej firme najprv prejdeme agendu: počet dokladov a zamestnancov, majetok, zásoby a režimy DPH. Potom navrhneme rozsah, cenu a postup prechodu na mieru. Závierku pripravíme mikro, malej aj veľkej účtovnej jednotke.`,
      },
      {
        q: 'Ako prejdem od súčasnej účtovníčky?',
        a: 'V aplikácii nám zadáte kontakt na doterajšiu účtovníčku a potvrdíte koordináciu prechodu. Dohodneme prevzatie a Vaša účtovníčka skontroluje podklady. Vy sa zapojíte pri potrebnom podpise alebo doplnení. Priebeh aj ďalší krok uvidíte v aplikácii. Pripravený list si môžete vybaviť aj osobne.',
      },
      {
        q: 'Kto urobí závierku za rok 2026?',
        a: `Zvyčajne doterajšia účtovníčka, lebo rok 2026 účtovala ona. Ak sa dohodnete inak, urobíme ju my za ${eur(CLOSING_PRICE)}, keď dostaneme celé účtovníctvo za rok 2026.`,
      },
      {
        q: 'Ešte nemám firmu. Môžem začať?',
        a: `Áno. Vyplňte formulár bez IČO a ozveme sa. Účtovníctvo povedieme od ${BRAND.launch}, alebo odo dňa, keď firma vznikne, ak to bude neskôr.`,
      },
      {
        q: 'Čo ak budem mať viac dokladov, ako je v balíku?',
        a: `Mesiac, v ktorom ich budete mať viac, vyúčtujeme ako vyšší balík. Pri viac ako ${largest.docs} dokladoch mesačne Vám pripravíme ponuku na mieru.`,
      },
      {
        q: 'Musím sa viazať?',
        a: 'Nie. Zmluvu môžete kedykoľvek vypovedať priamo v aplikácii, s mesačnou výpovednou lehotou; výpoveď v prvom mesiaci ukončí zmluvu s jeho koncom a prvý mesiac neplatíte. Účtovníctvo Vám odovzdáme v aplikácii a všetky doklady a údaje si tam stiahnete ešte 90 dní po skončení zmluvy. Potom prístup skončí a úplný zákonný archív uchovávame päť rokov od skončenia zmluvy; číta ho iba určená osoba. Zákonné dôvody môžu uchovanie predĺžiť.',
      },
      {
        q: 'Ako spolu budeme komunikovať?',
        a: 'Správy s účtovníčkou, doklady, zmluvu aj plnú moc nájdete v aplikácii. E-mail Vás upozorní na novú správu bez jej obsahu. Doklady môžete aj preposielať na adresu svojej firmy vo Firmony.',
      },
      {
        q: 'Ako môžete mať takúto cenu?',
        a: 'Čítanie dokladov, párovanie a ďalšie opakované úkony zjednodušuje systém. Účtovníčka sa môže venovať odbornej kontrole a Vašim otázkam. Platíte za dohodnutý rozsah služby. Mesačný balík, závierku aj mzdy vidíte v cenníku.',
      },
    ],
  },

  final: {
    title: 'Poďme do toho spolu.',
    lead: `Stačí IČO Vašej firmy. Ozveme sa ${REPLY_WITHIN}.`,
    label: 'IČO Vašej firmy',
    placeholder: '8 číslic',
    button: 'Pokračovať',
    noCompany: 'Ešte nemám firmu',
    write: 'Chcete nám radšej napísať?',
    reply: `Odpovieme ${REPLY_WITHIN}.`,
  },

  footer: {
    tagline: 'Online účtovníctvo pre Vašu firmu.',
    service: 'Služba',
    guides: 'Poradíme',
    company: 'Spoločnosť',
    contact: 'Kontakt',
    calc: 'Kalkulačka',
    terms: 'Obchodné podmienky',
    legal: 'Právne informácie',
    privacy: 'Ochrana údajov',
    cookies: 'Bez cookies a bez sledovania',
    reply: `Odpovedáme ${REPLY_WITHIN}.`,
    imprint: `${BRAND.name} je služba spoločnosti ${OPERATOR.name}, ${OPERATOR.street}, ${OPERATOR.postalCity}, IČO ${OPERATOR.companyId}, DIČ ${OPERATOR.taxId}, zapísanej ${OPERATOR.registeredIn}. Ceny sú uvedené bez DPH.`,
    rights: '© 2026 europio s. r. o.',
  },

  /** Firmony for investors: the page /investori, collecting the people who want it until it starts. */
  investors: {
    meta: {
      title: `Daňové priznanie z investícií | ${BRAND.name}`,
      description: `Nahráte ročný výpis od brokera, ${BRAND.name} spočíta, čo sa zdaňuje a čo nie, a pripraví daňové priznanie za rok ${INVESTORS.year}. Alebo ho podáme za Vás. Spúšťame v januári ${INVESTORS.year + 1}.`,
    },
    cta: 'Zapísať sa',
    hero: {
      first: 'Daňové priznanie z investícií.',
      second: 'Hotové za pár minút.',
      lead: 'Nahráte ročný výpis od brokera. Spočítame, čo sa zdaňuje a čo nie, a pripravíme priznanie, ktoré len podpíšete. Alebo ho podáme za Vás.',
      note: `Spúšťame v januári ${INVESTORS.year + 1}, včas na priznanie za rok ${INVESTORS.year}.`,
      how: 'Ako to funguje',
    },
    card: {
      title: 'Dáme Vám vedieť',
      text: `Zapíšte sa a priznanie za rok ${INVESTORS.year} budete mať hotové medzi prvými.`,
      label: 'Váš e-mail',
      placeholder: 'meno@email.sk',
      button: 'Zapísať sa',
      fine: 'Pošleme Vám len potvrdenie a správu o spustení.',
    },
    brokers: 'Začíname s brokermi, cez ktorých na Slovensku investuje najviac ľudí:',
    steps: {
      first: 'Tri kroky.',
      second: 'Žiadne tabuľky.',
      items: [
        { title: 'Stiahnete ročný výpis', text: `V aplikácii brokera si stiahnete výpis obchodov a dividend za rok ${INVESTORS.year}. Ukážeme Vám presne kde.` },
        { title: 'Nahráte ho do Firmony', text: 'Každý predaj spárujeme s jeho nákupom, prepočítame doláre na eurá a postrážime časový test.' },
        { title: 'Priznanie je hotové', text: 'Dostanete priznanie, ktoré nahráte do eDane a podpíšete. Alebo ho za Vás podá naša účtovníčka.' },
      ],
    },
    rules: {
      first: 'Čo za Vás spočítame.',
      second: 'Podľa zákona, nie odhadom.',
      items: [
        {
          title: 'Predaj po roku',
          text: 'Akcie a ETF z regulovaného trhu, ktoré ste držali viac ako rok, sú od dane oslobodené. Každý predaj porovnáme s nákupom a oslobodené obchody do priznania nedáme.',
        },
        {
          title: 'Predaj do roka',
          text: 'Zisk sa zdaňuje sadzbou 19 až 35 % podľa celého Vášho základu dane. Zisky a straty z predajov v jednom roku spočítame a uplatníme oslobodenie do 500 € ročne, ak naň máte nárok.',
        },
        {
          title: 'Dividendy zo zahraničia',
          text: 'Dividendy z akcií sa zdaňujú spravidla sadzbou 7 %. Ak zahraničie zrazilo viac, na Slovensku nič nedoplácate, no v priznaní byť musia. Výplaty z ETF nie sú dividendy a zdaňujú sa sadzbou 19 %. Aj tie rozlíšime.',
        },
        { title: 'Úroky u brokera', text: 'Úroky z hotovosti, ktorú ste nezainvestovali, sa zdaňujú sadzbou 19 %. Vo výpise ich nájdeme za Vás.' },
        { title: 'Doláre na eurá', text: 'Každý nákup, predaj aj dividendu prepočítame kurzom Európskej centrálnej banky.' },
        { title: 'Zdravotné odvody', text: 'Zo zisku z predaja do roka sa platí aj zdravotné poistenie. Povieme Vám, koľko a dokedy.' },
      ],
    },
    ways: {
      first: 'Sám, alebo za Vás.',
      second: 'Vyberiete si.',
      self: {
        title: 'Sám',
        price: `${INVESTORS.prices.self} €`,
        priceNote: `za jedného brokera, ${INVESTORS.prices.selfAll} € za všetkých`,
        points: ['Priznanie pripravené na podpis', 'Nahráte ho do eDane alebo vytlačíte', 'Výpočet každého obchodu na kontrolu'],
      },
      done: {
        title: 'Za Vás',
        price: `${INVESTORS.prices.done} €`,
        priceNote: 'všetci brokeri',
        points: ['Všetko, čo pri ceste Sám', 'Pred podaním ho skontroluje účtovníčka', 'Podáme ho za Vás na základe plnej moci'],
      },
      note: 'Ceny sú konečné, DPH sa k nim nepripočítava.',
    },
    bridge: {
      title: 'Raz si možno založíte firmu.',
      text: `${BRAND.name} vedie aj celé účtovníctvo firiem. Keď z investovania vznikne podnikanie, nemusíte hľadať nikoho iného.`,
      link: 'Účtovníctvo pre firmy',
    },
    faq: [
      { q: 'Musím podať priznanie, keď som akcie len kupoval?', a: 'Samotný nákup sa nezdaňuje. Priznanie riešite, keď ste predávali, alebo ste dostali dividendy či úroky.' },
      { q: 'Musia byť dividendy v priznaní, keď daň zrazili v zahraničí?', a: 'Áno. Dividendy zo zahraničia patria do priznania, aj keď sa z nich na Slovensku nič nedoplatí.' },
      {
        q: 'Dokedy treba priznanie podať?',
        a: `Za rok ${INVESTORS.year} do 31. marca ${INVESTORS.year + 1}. Kto má príjmy zo zahraničia, môže si lehotu oznámením predĺžiť až do 30. septembra ${INVESTORS.year + 1}.`,
      },
      { q: 'Čo kryptomeny?', a: 'Pripravujeme ich hneď po akciách a ETF. Zdaňujú sa inak, preto ich chceme mať presne, nie približne.' },
      { q: 'Uvidíte do môjho účtu u brokera?', a: 'Nie. Pracujeme len s výpisom, ktorý si sami stiahnete. Prístup k Vášmu účtu nepotrebujeme.' },
      {
        q: 'Kto výpočet skontroluje?',
        a: 'Pri ceste Za Vás ho pred podaním skontroluje účtovníčka. Pri ceste Sám uvidíte výpočet každého obchodu a porovnáte ho s výpisom.',
      },
    ],
    final: {
      title: 'Zapíšte sa. Ozveme sa v januári.',
      lead: 'Povedzte nám, cez koho investujete, a pripravíme to najprv pre Vášho brokera.',
      brokers: 'Cez koho investujete',
      way: 'Ako to chcete',
      ways: { sam: 'Sám, s pripraveným priznaním', 'za-mna': 'Za mňa, priznanie podajte Vy' },
      button: 'Zapísať sa',
      fine: 'Pošleme Vám len potvrdenie a správu o spustení.',
      privacy: 'Ochrana údajov',
    },
    errors: {
      email: 'Skontrolujte e-mail, takto nevyzerá správne.',
      throttle: 'Z tohto pripojenia prišlo priveľa zápisov. Skúste to, prosím, o hodinu.',
    },
    thanks: {
      title: 'Ďakujeme. Zapísali sme Vás.',
      lead: `Keď spustíme priznania za rok ${INVESTORS.year}, napíšeme Vám. Bude to v januári, včas pred termínom 31. marca.`,
      back: 'Späť na stránku pre investorov',
      firms: 'Máte aj firmu? Pozrite si účtovníctvo pre firmy.',
    },
    mail: {
      subject: `${BRAND.name}: zapísali sme Vás`,
      lead: `ďakujeme za záujem. Keď spustíme daňové priznania z investícií za rok ${INVESTORS.year}, dáme Vám vedieť. Bude to v januári ${INVESTORS.year + 1}, včas pred termínom 31. marca.`,
      remove: 'Ak ste sa nezapisovali Vy alebo si to rozmyslíte, odpíšte na tento e-mail a adresu vymažeme.',
    },
  },

  start: {
    title: 'Začnime Vašou firmou',
    lead: 'Zadajte IČO. Názov a sídlo doplníme z Registra právnických osôb.',
    chosen: 'Vybraný balík',
    perMonth: 'mesačne',
    company: 'Vaša firma',
    other: 'Zadať iné IČO',
    source: 'Údaje z Registra právnických osôb, Štatistický úrad SR, licencia CC BY 4.0.',
    terminated: 'Register vedie túto firmu ako zaniknutú. Ak je to omyl, napíšte nám do poznámky.',
    notSro: 'Online uzatvárame zmluvy so spoločnosťou s ručením obmedzeným, akciovou spoločnosťou a jednoduchou spoločnosťou na akcie. Iným právnym formám pripravíme zmluvu osobne, stačí odoslať žiadosť.',
    badIco: 'IČO má 8 číslic. Skontrolujte ho, prosím.',
    wrongIco: 'Toto IČO v registri nie je a nevyzerá správne. Skontrolujte ho, prosím.',
    failed: 'Register práve neodpovedá. Napíšte názov firmy sami, overíme ho neskôr.',
    busy: 'Z tohto pripojenia prišlo veľa vyhľadávaní. Napíšte názov firmy sami.',
    freshTitle: 'Zakladáte firmu',
    freshLead: 'Napíšte nám, ako ďaleko ste so založením. Ozveme sa a všetko prejdeme spolu.',
    companyName: 'Názov firmy',
    companyNameFresh: 'Názov firmy, ak ho už máte',
    plan: 'Balík',
    planUnsure: 'Ešte neviem',
    planCustom: 'Na mieru',
    planCustomHint: 'cena podľa rozsahu',
    situation: 'Čo potrebujete',
    situations: { switch: 'Mením účtovníčku', fresh: 'Zakladám firmu', other: 'Iné' },
    name: 'Meno a priezvisko',
    email: 'E-mail',
    directorEmail: 'E-mail konateľa alebo člena predstavenstva, ak to nie ste Vy',
    directorEmailHint: 'Zmluvu môže uzavrieť len ten, kto za firmu podľa obchodného registra koná. Odkaz na ňu pošleme jemu, potvrdenie žiadosti Vám.',
    phone: 'Telefón',
    optional: 'nepovinné',
    note: 'Poznámka',
    notePlaceholder: 'Napríklad koľko máte dokladov mesačne a zamestnancov, alebo dokedy trvá Vaša výpovedná lehota.',
    next: `Čo bude ďalej: ${REPLY_WITHIN} posúdime, či Vašej firme sedí štandardný balík. Ak áno, pošleme odkaz na zmluvu tomu, kto za firmu koná, a uzavrie ju online.`,
    privacy: 'Údaje použijeme len na to, aby sme Vám odpovedali a pripravili ponuku.',
    privacyLink: 'Ako s nimi zaobchádzame',
    submit: 'Odoslať žiadosť',
    errors: {
      name: 'Napíšte, prosím, svoje meno.',
      email: 'Skontrolujte, prosím, e-mail.',
      directorEmail: 'Skontrolujte, prosím, e-mail toho, kto za firmu koná.',
      phone: 'Skontrolujte, prosím, telefónne číslo.',
      note: 'Poznámka je príliš dlhá. Stačí pár viet.',
      company: 'Napíšte, prosím, názov firmy.',
      throttle: `Z tohto pripojenia prišlo veľa žiadostí. Skúste to o hodinu alebo nám napíšte na ${BRAND.email}.`,
      summary: 'Niečo vo formulári treba opraviť.',
      expired: 'Formulár bol otvorený pridlho. Skontrolujte údaje a odošlite ho znova.',
    },
  },

  thanks: {
    title: 'Ďakujeme. Žiadosť máme.',
    orderLead: `${REPLY_WITHIN.charAt(0).toUpperCase()}${REPLY_WITHIN.slice(1)} posúdime, či Vašej firme sedí štandardný balík, a odkaz na zmluvu pošleme tomu, kto za firmu koná. Uzavrie ju online.`,
    lead: `Ozveme sa ${REPLY_WITHIN}.`,
    customLead: `Ozveme sa ${REPLY_WITHIN} a dohodneme, ako spolu prejdeme Vašu agendu. Potom Vám pripravíme ponuku na mieru.`,
    confirmed: 'Potvrdenie sme Vám poslali na e-mail.',
    next: 'Kým sa ozveme, pozrite sa do zmluvy so súčasnou účtovníčkou, aká dlhá je výpovedná lehota.',
    back: 'Späť na úvod',
  },

  /** The order a request becomes: the contract concluded online by a member of the statutory body the register names. */
  order: {
    title: 'Zmluva o vedení účtovníctva',
    lead: 'Skontrolujte, prosím, údaje a uzavrite zmluvu. Môže ju uzavrieť konateľ alebo člen predstavenstva zapísaný v registri, ktorý za firmu koná sám.',
    summary: 'Hlavné body zmluvy',
    rows: {
      company: 'Firma',
      plan: 'Balík',
      price: 'Cena mesačne',
      payroll: 'Mzdy',
      closing: 'Závierka a daňové priznanie',
      start: 'Začiatok',
      invoices: 'Faktúry',
      notice: 'Výpovedná lehota',
      docs: 'Doklady',
      answers: 'Odpovede',
    },
    noVat: 'bez DPH',
    yearly: 'raz ročne',
    invoicesValue: 'prvý mesiac zadarmo, potom balík mesačne vopred, mzdy a doklady navyše za uplynulý mesiac, splatnosť 14 dní',
    noticeValue: 'jeden mesiac, bez viazanosti; v prvom mesiaci zmluva skončí s jeho koncom',
    docsValue: `za mesiac do ${APP.docsByDay}. dňa nasledujúceho mesiaca`,
    answersValue: REPLY_WITHIN,
    plan: 'Balík',
    start: 'Od kedy',
    startHint: 'Ak meníte účtovníčku, vyberte mesiac po skončení jej výpovednej lehoty.',
    director: 'Kto zmluvu uzatvára',
    directorHint: 'Štatutárny orgán podľa Registra právnických osôb.',
    acting: 'Spôsob konania podľa registra',
    jointTitle: 'Zmluvu uzavrieme písomne.',
    jointLead: 'Podľa obchodného registra za firmu nekoná jeden človek sám, alebo to z registra nevieme jednoznačne určiť. Zmluvu Vám preto pošleme na podpis všetkým, ktorí za firmu konajú; ozveme sa Vám.',
    directorName: 'Meno a priezvisko konateľa alebo člena predstavenstva',
    directorNameHint: 'Register teraz neodpovedá. Napíšte svoje meno tak, ako je zapísané v obchodnom registri.',
    agree: 'Súhlasím s obchodnými podmienkami vrátane zmluvy o spracúvaní osobných údajov. Som konateľ alebo člen predstavenstva firmy a konám v jej mene sám, ako to zapisuje obchodný register.',
    termsLink: 'Obchodné podmienky',
    termsRead: 'Prečítať celé znenie',
    submit: 'Uzavrieť zmluvu',
    fine: 'Tlačidlom uzavriete zmluvu v mene firmy. Zmluvu aj obchodné podmienky potom nájdete v aplikácii, kde vybavíme všetko ostatné.',
    errors: {
      summary: 'Niečo treba doplniť.',
      director: 'Vyberte, prosím, kto zmluvu uzatvára.',
      joint: 'Podľa obchodného registra za firmu nekoná jeden človek sám. Zmluvu uzavrieme písomne, ozveme sa Vám.',
      directorName: 'Zmluvu môže uzavrieť len konateľ alebo člen predstavenstva. Napíšte, prosím, meno a priezvisko.',
      agree: 'Bez súhlasu s podmienkami zmluvu uzavrieť nemôžeme.',
      start: 'Vyberte, prosím, od kedy.',
      plan: 'Vyberte, prosím, balík.',
      throttle: 'Z tohto pripojenia prišlo priveľa pokusov. Skúste to o hodinu.',
      failed: 'Zmluvu sa nepodarilo uložiť. Skúste to, prosím, znova.',
    },
    doneTitle: 'Zmluva je uzavretá.',
    doneLead: 'Zmluvu aj obchodné podmienky nájdete v aplikácii, kde vybavíme všetko ostatné. Vitajte vo Firmony.',
    doneSigned: 'Uzavrel(a)',
    toApp: 'Pokračovať do aplikácie',
    signIn: 'Prihlásiť sa do aplikácie',
    expiredTitle: 'Tento odkaz už neplatí.',
    expiredLead: 'Ponuka bola platná obmedzený čas. Vyplňte žiadosť znova, údaje z registra doplníme sami.',
    expiredAgain: 'Vyplniť žiadosť znova',
    waitTitle: 'Zmluvu pre Vás pripravujeme.',
    waitLead: `Najprv posúdime, či Vašej firme sedí štandardný balík. Odkaz na podpis pošleme ${REPLY_WITHIN} tomu, kto za firmu koná.`,
    bespokeTitle: 'Pripravujeme Vám ponuku na mieru.',
    bespokeLead: 'Vaša firma potrebuje iný rozsah, než má štandardný balík. Ozveme sa Vám osobne s ponukou.',
    holdTitle: 'Potrebujeme ešte pár údajov.',
    holdLead: 'Pred zmluvou si s Vami potrebujeme niečo overiť. Ozveme sa Vám osobne.',
    staleTitle: 'Odkaz na podpis vypršal.',
    staleLead: 'Ponuka platí sedem dní. Požiadajte o nový odkaz a pošleme ho tomu, kto za firmu koná.',
    staleButton: 'Požiadať o nový odkaz',
    askedTitle: 'Dali sme vedieť.',
    askedLead: `Nový odkaz na zmluvu pošleme ${REPLY_WITHIN} tomu, kto za firmu koná.`,
    clientTitle: 'Táto firma už u nás má zmluvu.',
    clientLead: 'Prihláste sa do aplikácie e-mailom, s ktorým ste zmluvu uzavreli.',
  },

  terms: {
    back: 'Späť na úvod',
    contact: 'Otázky k podmienkam nám napíšte na',
  },

  notFound: {
    title: 'Táto stránka neexistuje.',
    lead: 'Možno sa zmenila adresa. Všetko podstatné nájdete na úvodnej stránke.',
    back: 'Späť na úvod',
  },
})
