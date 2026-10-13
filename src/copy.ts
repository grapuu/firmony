// Every visible text of the site, in Slovak, typeset once (src/format.ts). Prices and limits come from
// src/config.ts, so a text can never say another figure than the plans have.
import { APP, BRAND, CLOSING_PRICE, OPERATOR, ORDER, PAYROLL_PRICE, PLANS, REPLY_WITHIN, type Plan } from './config'
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
    title: `${BRAND.name}: účtovníctvo pre mladé firmy`,
    description: `Postaráme sa o celé účtovníctvo Vašej s. r. o. Doklady stačí odfotiť. Zaúčtujeme ich, podáme priznanie k DPH aj daňové priznanie a postrážime termíny. Od ${eur(start.price)} mesačne podľa počtu dokladov.`,
  },
  skip: 'Preskočiť na obsah',
  nav: { how: 'Ako to funguje', pricing: 'Cenník', about: 'Kto sme', faq: 'Otázky', start: 'Chcem začať', home: `${BRAND.name}, úvod` },

  hero: {
    tag: 'Účtovníctvo pre mladé s. r. o.',
    /** "Postaráme sa" is kept together, so that the line breaks before "o všetko". */
    first: 'Postaráme\u00a0sa o všetko.',
    second: 'Vy rastiete.',
    lead: 'Doklady odfotíte, všetko ostatné je na nás. Zaúčtujeme ich, podáme priznania a postrážime každý termín.',
    price: `Od ${eur(start.price)} mesačne. Platíte podľa počtu dokladov.`,
    secondary: 'Pozrieť cenník',
    how: 'Ako to funguje',
  },

  /** The card in the opening where a client starts: the IČO. */
  card: {
    title: 'Začnite s IČO Vašej firmy',
    text: 'Názov a sídlo doplníme z registra. Je to nezáväzné.',
    fine: `Ozveme sa ${REPLY_WITHIN}.`,
  },

  /** One month, as the papers fly into it while the page is scrolled. An illustration. */
  flow: {
    first: 'Vy pošlete doklady.',
    second: 'My urobíme zvyšok.',
    lead: 'Bloček odfotíte, faktúru prepošlete. Umelá inteligencia ich prečíta, účtovníčka všetko skontroluje a podá priznania.',
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
    { value: eur(0), label: 'za aplikáciu a e-faktúry' },
    { value: '1 deň', label: 'na odpoveď, po ľudsky' },
    { value: '1. 1. 2027', label: 'štart, e-faktúry v cene' },
  ],

  /** The hug of the brand, read word by word. */
  statement: {
    first: 'Ak Vás účtovníctvo stresuje, nie ste jediní.',
    second: 'Spolu to dáme do poriadku.',
  },

  /** Everything in the price: pick one and see it. */
  services: {
    first: 'Všetko, čo firma potrebuje.',
    second: 'Na jednom mieste.',
    lead: 'Vyberte si a pozrite sa, ako to vyzerá.',
    example: 'Ilustračná ukážka',
    items: [
      { id: 'doklady', title: 'Doklady a banka', text: 'Zaúčtujeme každý doklad a spárujeme platby.' },
      { id: 'dph', title: 'DPH a výkazy', text: 'Priznanie aj kontrolný výkaz podáme za Vás.' },
      { id: 'efaktury', title: 'E-faktúry', text: 'Prijmeme ich za Vás. Povinné sú od 1. 1. 2027.' },
      { id: 'mzdy', title: 'Mzdy', text: `Výplaty, odvody a hlásenia, ${eur(PAYROLL_PRICE)} mesačne za človeka.` },
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
      via: 'cez digitálneho poštára',
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
    /** A question to the accountant and her answer: Slovak tax law, said plainly (§ 22 ZDP: 1 700 €). */
    ask: {
      who: 'Vaša účtovníčka',
      online: 'odpovedá do jedného pracovného dňa',
      question: 'Môžem si dať do nákladov nový notebook?',
      answer: 'Áno, ak ho používate na podnikanie. Do 1 700 € ide rovno do nákladov, drahší sa odpisuje. Pošlite mi faktúru.',
      thanks: 'Super, ďakujem!',
    },
  },

  /** The machine and the person. */
  duo: {
    first: 'Rýchlosť stroja.',
    second: 'Istota človeka.',
    ai: { title: 'Umelá inteligencia', items: ['prečíta bloček aj faktúru', 'navrhne zaúčtovanie', 'spáruje platby z banky'] },
    human: { title: 'Vaša účtovníčka', items: ['všetko skontroluje', 'podá priznania a výkazy', 'odpovie na Vaše otázky'] },
  },

  einvoice: {
    date: '1. 1. 2027',
    title: `Od ${BRAND.launch} musí každá firma vedieť prijať e-faktúru.`,
    text: 'S Firmony je to v cene každého balíka. Faktúry nám prídu rovno do účtovníctva.',
    source: 'Zákon o DPH, § 85o, vložený zákonom č. 385/2025 Z. z.',
  },

  pricing: {
    first: 'Jasná cena.',
    second: 'Platíte podľa počtu dokladov.',
    lead: 'Vyberte si podľa počtu dokladov za mesiac a podľa toho, či ste platiteľom DPH.',
    perMonth: 'mesačne',
    rows: { docs: 'Doklady', vat: 'DPH', people: 'Mzdy' },
    included: `V každom balíku: zaúčtovanie dokladov a platieb, e-faktúry, mesačný prehľad, stráženie termínov a odpovede ${REPLY_WITHIN}.`,
    closing: `Závierka a daňové priznanie: ${eur(CLOSING_PRICE)} raz ročne. Mzdy: ${eur(PAYROLL_PRICE)} mesačne za človeka.`,
    vat: 'Ceny sú bez DPH, DPH zatiaľ nepripočítavame.',
    custom: `Viac ako ${largest.docs} dokladov mesačne? Pripravíme Vám ponuku na mieru.`,
  },

  /** What we promise, said once and plainly, next to the prices. */
  promises: [
    { title: 'Bez viazanosti', text: 'Mesačná výpovedná lehota.' },
    { title: 'Platíte podľa dokladov', text: 'Mesiac s viac dokladmi vyúčtujeme ako vyšší balík. Žiadne skryté poplatky.' },
    { title: 'Odpoveď do pracovného dňa', text: 'Po slovensky, nie úradnícky.' },
    { title: 'Účtovníctvo je Vaše', text: 'Keď odídete, všetko Vám odovzdáme.' },
  ],

  calc: {
    title: 'Koľko ušetríte?',
    lead: 'Napíšte, koľko dnes platíte svojej účtovníčke. Sumy uvádzajte bez DPH.',
    monthly: 'Mesačný paušál',
    perDoc: 'Poplatok za doklad',
    docs: 'Dokladov mesačne',
    closing: 'Závierka a priznanie ročne',
    vat: 'Ste platiteľom DPH?',
    no: 'Nie',
    yes: 'Áno',
    people: 'Ľudia na mzde',
    button: 'Porovnať',
    example: 'Príklad: paušál 60 €, 20 dokladov po 5,20 € a závierka 160 €.',
    empty: 'Zadajte svoje čísla a porovnáme ich s našou cenou.',
    today: 'Dnes zaplatíte ročne',
    save: 'Ušetríte ročne',
    more: 'S nami by ste ročne platili viac o',
    custom: 'Pre firmu s takýmto počtom dokladov pripravíme ponuku na mieru.',
    note: `Porovnávame aj so závierkou za ${eur(CLOSING_PRICE)} a mzdami za ${eur(PAYROLL_PRICE)} mesačne na človeka.`,
    invalid: 'Skontrolujte čísla. Sumy píšte v eurách, napríklad 60 alebo 5,20.',
  },

  paths: {
    first: 'Zakladáte firmu,',
    second: 'alebo už beží?',
    fresh: {
      title: 'Zakladáte s. r. o.',
      text: 'Od prvého dňa poriadok v účtovníctve. Povieme Vám, čo treba pri štarte vybaviť.',
      cta: 'Zakladám firmu',
    },
    switching: {
      title: 'Meníte účtovníčku',
      text: 'Prechod vybavíme za Vás. Podklady si od doterajšej účtovníčky vyžiadame sami.',
      cta: 'Chcem prejsť',
    },
  },

  founder: {
    title: 'Kto za nami stojí',
    quote:
      'Keď som si založil firmu, najviac nervov ma nestálo podnikanie, ale papiere okolo neho. Firmony robíme, aby sa o mladé firmy niekto postaral a ony mohli rásť.',
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
        a: 'Účtovníčka s praxou, ktorá bude mať Vašu firmu na starosti. Rutinnú prácu za ňu urobí umelá inteligencia. Ona všetko skontroluje, podá priznania a odpovie na Vaše otázky.',
      },
      {
        q: 'Ako prejdem od súčasnej účtovníčky?',
        a: 'Pozrite sa do zmluvy, aká dlhá je výpovedná lehota. Pri mesačnej lehote stačí poslať výpoveď v novembri. Podklady si od nej vyžiadame my, Vy podpíšete len plnú moc.',
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
        a: 'Nie. Zmluvu môžete kedykoľvek vypovedať priamo v aplikácii, s mesačnou výpovednou lehotou, a všetky podklady Vám odovzdáme.',
      },
      {
        q: 'Ako spolu budeme komunikovať?',
        a: 'Všetko vybavíme v aplikácii: správy s účtovníčkou, doklady, zmluvu aj plnú moc. Nič sa nestratí v e-mailoch a Vaše údaje neležia v cudzích schránkach. E-mail Vám príde len ako upozornenie, že na Vás niečo čaká.',
      },
      {
        q: 'Ako môžete mať takúto cenu?',
        a: 'Rutinu za nás robí umelá inteligencia a nemáme drahú kanceláriu. Platíte za prácu, ktorú za Vás niekto naozaj urobí, nie za papiere.',
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
    tagline: 'Účtovníctvo pre mladé firmy.',
    service: 'Služba',
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

  start: {
    title: 'Začnime Vašou firmou',
    lead: 'Zadajte IČO. Názov a sídlo doplníme z Registra právnických osôb.',
    chosen: 'Vybraný balík',
    perMonth: 'mesačne',
    company: 'Vaša firma',
    other: 'Zadať iné IČO',
    source: 'Údaje z Registra právnických osôb, Štatistický úrad SR, licencia CC BY 4.0.',
    terminated: 'Register vedie túto firmu ako zaniknutú. Ak je to omyl, napíšte nám do poznámky.',
    notSro: 'Firmony je zatiaľ pre s. r. o. Ak má Vaša firma inú právnu formu, napíšte nám to do poznámky a ozveme sa.',
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
    situation: 'Čo potrebujete',
    situations: { switch: 'Mením účtovníčku', fresh: 'Zakladám firmu', other: 'Iné' },
    name: 'Meno a priezvisko',
    email: 'E-mail',
    phone: 'Telefón',
    optional: 'nepovinné',
    note: 'Poznámka',
    notePlaceholder: 'Napríklad koľko dokladov máte mesačne alebo dokedy trvá Vaša výpovedná lehota.',
    privacy: 'Údaje použijeme len na to, aby sme Vám odpovedali a pripravili ponuku.',
    privacyLink: 'Ako s nimi zaobchádzame',
    submit: 'Odoslať žiadosť',
    errors: {
      name: 'Napíšte, prosím, svoje meno.',
      email: 'Skontrolujte, prosím, e-mail.',
      phone: 'Skontrolujte, prosím, telefónne číslo.',
      note: 'Poznámka je príliš dlhá. Stačí pár viet.',
      company: 'Napíšte, prosím, názov firmy.',
      throttle: `Z tohto pripojenia prišlo veľa žiadostí. Skúste to o hodinu alebo nám napíšte na ${BRAND.email}.`,
      summary: 'Niečo vo formulári treba opraviť.',
      expired: 'Formulár bol otvorený pridlho. Skontrolujte údaje a odošlite ho znova.',
    },
  },

  thanks: {
    orderTitle: 'Ďakujeme. Pozrite sa do e-mailu.',
    orderLead: 'Poslali sme Vám odkaz na zmluvu. Konateľ firmy ju uzavrie jedným kliknutím a hneď potom sa dostane do aplikácie.',
    title: 'Ďakujeme. Žiadosť máme.',
    lead: `Ozveme sa ${REPLY_WITHIN}. Potvrdenie sme Vám poslali na e-mail.`,
    next: 'Kým sa ozveme, pozrite sa do zmluvy so súčasnou účtovníčkou, aká dlhá je výpovedná lehota.',
    back: 'Späť na úvod',
  },

  /** The order a request becomes: the contract concluded online by a director the register names. */
  order: {
    title: 'Zmluva o vedení účtovníctva',
    lead: 'Skontrolujte, prosím, údaje a uzavrite zmluvu. Môže ju uzavrieť konateľ firmy zapísaný v registri.',
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
    startChosen: 'podľa voľby nižšie',
    invoicesValue: 'mesačne vopred, splatnosť 14 dní',
    noticeValue: 'jeden mesiac, bez viazanosti',
    docsValue: `za mesiac do ${APP.docsByDay}. dňa nasledujúceho mesiaca`,
    answersValue: REPLY_WITHIN,
    plan: 'Balík',
    start: 'Od kedy',
    startHint: 'Ak meníte účtovníčku, vyberte mesiac po skončení jej výpovednej lehoty.',
    director: 'Kto zmluvu uzatvára',
    directorHint: 'Konatelia podľa Registra právnických osôb.',
    directorName: 'Meno a priezvisko konateľa',
    directorNameHint: 'Register teraz neodpovedá. Napíšte meno konateľa tak, ako je zapísané v obchodnom registri.',
    agree: 'Súhlasím s obchodnými podmienkami vrátane zmluvy o spracúvaní osobných údajov. Som konateľ firmy a konám v jej mene.',
    termsLink: 'Obchodné podmienky',
    termsRead: 'Prečítať celé znenie',
    submit: 'Uzavrieť zmluvu',
    fine: 'Tlačidlom uzavriete zmluvu v mene firmy. Zmluvu aj obchodné podmienky potom nájdete v aplikácii, kde vybavíme všetko ostatné.',
    errors: {
      summary: 'Niečo treba doplniť.',
      director: 'Vyberte, prosím, konateľa.',
      directorName: 'Zmluvu môže uzavrieť len konateľ. Napíšte, prosím, jeho meno a priezvisko.',
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
    expiredLead: `Odkaz na zmluvu platí ${ORDER.days} dní. Napíšte nám a pošleme Vám nový.`,
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
