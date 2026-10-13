// Every visible text of the site, in Slovak, typeset once (src/format.ts). Prices and limits come from
// src/config.ts, so a text can never say another figure than the plans have.
import { BRAND, CLOSING_PRICE, OPERATOR, PLANS, REPLY_WITHIN, type Plan } from './config'
import { formatEur, typeset, typesetAll } from './format'

const start = PLANS[0] as Plan
const eur = (euros: number) => formatEur(euros * 100)

/** What a plan's rows say: whom it is for, documents, VAT, payroll. */
export function planRows(plan: Plan): { forWhom: string; docs: string; vat: string; people: string } {
  return {
    forWhom: typeset(plan.id === 'start' ? 'Pre firmy, ktoré nie sú platiteľom DPH.' : plan.id === 'rast' ? 'Pre platiteľov DPH.' : 'Pre firmy so zamestnancami.'),
    docs: typeset(`do ${plan.docs} dokladov`),
    vat: typeset(plan.vatPayer ? 'mesačné priznanie, kontrolný a súhrnný výkaz' : 'priznania pri registrácii podľa § 7a'),
    people: typeset(plan.people === 0 ? 'bez zamestnancov' : `do ${plan.people} ľudí`),
  }
}

export const copy = typesetAll({
  meta: {
    title: `${BRAND.name}: účtovníctvo pre mladé firmy`,
    description: `Postaráme sa o celé účtovníctvo vašej s. r. o. Doklady stačí odfotiť, my zaúčtujeme, podáme DPH aj priznanie a postrážime termíny. Od ${eur(start.price)} mesačne, bez poplatkov za doklad.`,
  },
  skip: 'Preskočiť na obsah',
  nav: { how: 'Ako to funguje', pricing: 'Cenník', about: 'Kto sme', faq: 'Otázky', start: 'Chcem začať', home: `${BRAND.name}, úvod` },

  hero: {
    first: 'Postaráme sa o všetko.',
    second: 'Vy rastite.',
    lead: 'Účtovníctvo pre mladé s. r. o. Doklady odfotíte, všetko ostatné je na nás.',
    price: `Od ${eur(start.price)} mesačne. Bez poplatkov za doklad.`,
    cta: 'Chcem začať',
    secondary: 'Pozrieť cenník',
    note: `Začíname ${BRAND.launch}. Stačí IČO a kontakt, je to nezáväzné.`,
  },

  /** The app in the opening's phone: one month of a young company, everything booked. An illustration. */
  app: {
    label: 'Ukážka aplikácie Firmony: október vašej firmy, všetko zaúčtované',
    time: '9:41',
    month: 'Október 2026',
    company: 'Vaša firma',
    initials: 'VF',
    profit: 'Zisk za október',
    profitValue: '5 305 €',
    tax: 'Odložte si na dane',
    taxValue: '530 €',
    status: 'Všetko zaúčtované',
    deadline: 'DPH do 25. 11.',
    docs: 'Doklady',
    count: '5 nových',
    rows: [
      { title: 'Bloček', sub: 'Kaviareň', amount: '4,80 €', state: 'zaúčtované' },
      { title: 'Faktúra 2026041', sub: 'Váš klient s. r. o.', amount: '+1 200 €', state: 'zaúčtovaná' },
      { title: 'Výpis z účtu', sub: 'Október, 23 platieb', amount: 'spárovaný', state: '' },
      { title: 'E-faktúra', sub: 'Webhosting', amount: '14,90 €', state: 'prijatá' },
      { title: 'Priznanie k DPH', sub: 'Podané 24. 11.', amount: '1 220 €', state: 'podané' },
    ],
    snap: 'Odfotiť doklad',
    /** What the left side says once the papers are in. */
    title: 'Toto je celé vaše účtovníctvo.',
    text: 'Doklady pošlete, ako sa vám hodí. My ich zaúčtujeme, podáme, čo treba, a postrážime každý termín. Vy viete, na čom ste.',
    example: 'Ilustračná ukážka',
  },

  /** Read line by line as it scrolls by: the hug of the brand. */
  embrace: {
    text: 'Ak vás účtovníctvo stresuje, nie ste jediní. Nikoho nesúdime. Ak máte v papieroch neporiadok, dáme ho spolu do poriadku a odvtedy sa oň staráme my.',
  },

  month: {
    title: 'Jeden mesiac s Firmony.',
    lead: 'Takto vyzerá účtovníctvo, keď ho nemusíte riešiť.',
    example: 'Ilustračný príklad',
    /** What the machine reads off a slip, and what it proposes. The entry is the Slovak chart of accounts. */
    snap: {
      title: 'Odfotíte. AI prečíta.',
      text: 'Bloček odfotíte v mobile, faktúru prepošlete e-mailom, e-faktúry prídu samy. Umelá inteligencia z nich vytiahne obchodníka, dátum aj sumu a navrhne zaúčtovanie.',
      slip: {
        shop: 'Kaviareň',
        when: '14. 10. 2026, 8:42',
        item: '2× espresso',
        pay: 'Platba kartou',
        total: 'Spolu',
        sum: '4,80 €',
      },
      read: 'Prečítané z bločku',
      fields: [
        ['Obchodník', 'Kaviareň'],
        ['Dátum', '14. 10. 2026'],
        ['Suma', '4,80 €'],
        ['Platba', 'kartou'],
        ['Druh', 'reprezentácia'],
      ] as [string, string][],
      entry: 'Návrh zaúčtovania',
      debit: ['MD 513', 'Náklady na reprezentáciu'],
      credit: ['D 221', 'Bankové účty'],
      flag: 'Reprezentácia nie je daňový výdavok.',
      toast: 'Zaúčtované',
      toastSub: 'Skontroluje účtovníčka',
    },
    file: {
      title: 'Účtovníčka skontroluje a podá.',
      text: 'Každý návrh skontroluje človek. Účtovníčka podá priznania a výkazy za vás a termíny strážime my, nie vy.',
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
    /** A question to the accountant and her answer: Slovak tax law, said plainly (§ 22 ZDP: 1 700 €). */
    ask: {
      title: 'Pýtate sa, odpovedáme po ľudsky.',
      text: `Na otázky odpovedá vaša účtovníčka, ${REPLY_WITHIN}. Bez úradníčiny a bez čakania na termín.`,
      who: 'Vaša účtovníčka',
      online: 'odpovedá do jedného pracovného dňa',
      question: 'Môžem si dať do nákladov nový notebook?',
      answer: 'Áno, ak ho používate na podnikanie. Ak stál do 1 700 €, ide rovno do nákladov. Drahší sa odpisuje niekoľko rokov. Pošlite mi faktúru a zaúčtujem ho.',
      thanks: 'Super, ďakujem!',
      typing: 'Píše odpoveď',
    },
  },

  people: {
    title: 'Rutinu robí umelá inteligencia. Za každým číslom stojí človek.',
    ai: {
      title: 'Umelá inteligencia',
      items: ['prečíta bloček aj faktúru', 'roztriedi doklady a navrhne zaúčtovanie', 'spáruje platby z banky', 'postráži termíny a pripomenie, čo chýba'],
    },
    human: {
      title: 'Vaša účtovníčka',
      items: ['všetko skontroluje', 'podá priznania a výkazy', 'odpovie na vaše otázky', 'poradí, keď firma rastie'],
    },
    close: 'Preto vieme byť rýchli a mať férovú cenu.',
  },

  /** The bill a client would get from us: everything in the price, nothing per document. */
  receipt: {
    title: 'Všetko v jednej cene.',
    lead: 'Nemusíte rozmýšľať, čo je navyše. Nič.',
    label: `Čo dostanete v balíku ${start.name}`,
    head: `Balík ${start.name}`,
    sub: 'mesačne',
    lines: [
      ['Zaúčtovanie dokladov a banky', 'v cene'],
      ['DPH podľa § 7a', 'v cene'],
      ['Prijímanie e-faktúr', 'v cene'],
      ['Mesačný prehľad', 'v cene'],
      ['Strážené termíny', 'v cene'],
      ['Odpovede na vaše otázky', 'v cene'],
      ['Poplatok za doklad', eur(0)],
    ] as [string, string][],
    total: 'Spolu',
    totalValue: eur(start.price),
    vat: 'Bez DPH.',
    thanks: 'Ďakujeme, že ste s nami.',
    notes: [
      `Platitelia DPH a mzdy v balíkoch Rast a Firma.`,
      `Závierka a daňové priznanie: ${eur(CLOSING_PRICE)} raz ročne.`,
    ],
  },

  einvoice: {
    date: '1. 1. 2027',
    title: `Od ${BRAND.launch} musí každá firma vedieť prijať e-faktúru.`,
    text: 'Faktúry medzi firmami budú chodiť cez certifikovaných digitálnych poštárov. Prijímať ich musí aj firma, ktorá nie je platiteľom DPH, a platitelia DPH ich budú musieť aj vystavovať.',
    ours: 'S Firmony máte prijímanie e-faktúr v cene každého balíka. Faktúry nám prídu rovno do účtovníctva.',
    source: 'Zákon o DPH, § 85o, vložený zákonom č. 385/2025 Z. z.',
  },

  pricing: {
    title: 'Jasná cena. Žiadne poplatky za doklad.',
    lead: 'Vyberte si podľa toho, či ste platiteľom DPH a koľko ľudí máte na mzde.',
    perMonth: 'mesačne',
    rows: { docs: 'Doklady', vat: 'DPH', people: 'Mzdy' },
    included: `V každom balíku: zaúčtovanie dokladov a banky, prijímanie e-faktúr, mesačný prehľad, strážené termíny a odpovede ${REPLY_WITHIN}.`,
    closing: `Závierka a daňové priznanie: ${eur(CLOSING_PRICE)} raz ročne.`,
    vat: 'Ceny sú bez DPH. DPH zatiaľ nepripočítavame, lebo nie sme jej platiteľom.',
    custom: 'Máte viac dokladov alebo ľudí? Pripravíme vám ponuku na mieru.',
  },

  /** What we promise, said once and plainly, next to the prices. */
  promises: [
    { title: 'Bez viazanosti', text: 'Zmluvu môžete vypovedať s mesačnou výpovednou lehotou.' },
    { title: 'Doklady navyše zadarmo', text: 'Ak ich budete mať viac dva mesiace po sebe, ponúkneme vyšší balík.' },
    { title: 'Odpoveď do jedného dňa', text: `Na otázky odpovedáme ${REPLY_WITHIN}. Po slovensky, nie úradnícky.` },
    { title: 'Účtovníctvo je vaše', text: 'Keď odídete, odovzdáme vám všetky doklady aj celé účtovníctvo.' },
  ],

  calc: {
    title: 'Koľko ušetríte?',
    lead: 'Zadajte, koľko dnes platíte svojej účtovníčke. Sumy bez DPH.',
    monthly: 'Mesačný paušál',
    perDoc: 'Poplatok za doklad',
    docs: 'Dokladov mesačne',
    closing: 'Závierka a priznanie ročne',
    vat: 'Ste platiteľ DPH?',
    no: 'Nie',
    yes: 'Áno',
    people: 'Ľudia na mzde',
    button: 'Porovnať',
    example: 'Príklad: paušál 60 €, 25 dokladov po 5,20 € a závierka 160 €.',
    empty: 'Zadajte svoje čísla a porovnáme ich s našou cenou.',
    today: 'Dnes zaplatíte ročne',
    save: 'Ušetríte ročne',
    more: 'S nami by ste ročne platili viac o',
    custom: 'Pre firmu s takýmto počtom dokladov alebo ľudí pripravíme ponuku na mieru.',
    note: `Porovnávame aj so závierkou za ${eur(CLOSING_PRICE)}.`,
    invalid: 'Skontrolujte čísla. Sumy píšte v eurách, napríklad 60 alebo 5,20.',
  },

  paths: {
    title: 'Či firmu len zakladáte, alebo už beží.',
    fresh: {
      title: 'Zakladáte s. r. o.',
      text: 'Od prvého dňa budete mať v účtovníctve poriadok. Povieme vám, čo treba pri štarte vybaviť, a postrážime prvé termíny.',
      cta: 'Zakladám firmu',
    },
    switching: {
      title: 'Meníte účtovníčku',
      text: `Prechod vybavíme za vás: podpíšete zmluvu a plnú moc, podklady si od doterajšej účtovníčky vyžiadame sami. Pri mesačnej výpovednej lehote stačí poslať výpoveď v novembri a od ${BRAND.launch} začneme my.`,
      cta: 'Chcem prejsť',
    },
  },

  founder: {
    title: 'Kto za nami stojí',
    quote:
      'Keď som si založil firmu, najviac nervov ma nestálo podnikanie, ale papiere okolo neho. Termíny, priznania, pravidlá, ktorým som nerozumel, a pocit, že som na to sám. Firmony robíme, aby to mladé firmy mali inak: aby sa o ne niekto postaral a ony mohli rásť.',
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
    more: 'Nenašli ste, čo ste hľadali? Napíšte na',
    reply: `odpovieme ${REPLY_WITHIN}.`,
    items: [
      {
        q: 'Kto mi bude viesť účtovníctvo?',
        a: 'Účtovníčka s praxou, ktorá bude mať vašu firmu na starosti. Rutinnú prácu za ňu urobí umelá inteligencia, ona všetko skontroluje, podá a odpovie vám.',
      },
      {
        q: 'Ako prejdem od súčasnej účtovníčky?',
        a: 'Pozrite sa do zmluvy, aká dlhá je výpovedná lehota. Pri mesačnej stačí poslať výpoveď v novembri. Podklady si od nej vyžiadame my, vy podpíšete len plnú moc.',
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
        a: 'Za doklady navyše nič neplatíte. Ak ich budete mať viac dva mesiace po sebe, ponúkneme vám vyšší balík.',
      },
      {
        q: 'Musím sa viazať?',
        a: 'Nie. Zmluvu môžete vypovedať s mesačnou výpovednou lehotou a všetky podklady vám odovzdáme.',
      },
      {
        q: 'Ako môžete mať takúto cenu?',
        a: 'Rutinu za nás robí umelá inteligencia a nemáme drahú kanceláriu. Platíte za prácu, ktorú za vás niekto naozaj urobí, nie za papiere.',
      },
    ],
  },

  final: {
    title: 'Poďme do toho spolu.',
    lead: `Stačí IČO vašej firmy. Údaje doplníme z registra, vy pridáte kontakt a ${REPLY_WITHIN} sa vám ozveme.`,
    label: 'IČO vašej firmy',
    placeholder: '8 číslic',
    button: 'Pokračovať',
    noCompany: 'Ešte nemám firmu',
    write: 'Radšej napíšete?',
    reply: `Odpovieme ${REPLY_WITHIN}.`,
  },

  footer: {
    tagline: 'Účtovníctvo pre mladé firmy.',
    service: 'Služba',
    company: 'Spoločnosť',
    contact: 'Kontakt',
    calc: 'Kalkulačka',
    legal: 'Právne informácie',
    privacy: 'Ochrana údajov',
    cookies: 'Bez cookies a bez sledovania',
    reply: `Odpovedáme ${REPLY_WITHIN}.`,
    imprint: `${BRAND.name} je služba spoločnosti ${OPERATOR.name}, ${OPERATOR.street}, ${OPERATOR.postalCity}, IČO ${OPERATOR.companyId}, DIČ ${OPERATOR.taxId}, zapísanej v Obchodnom registri Mestského súdu Košice, oddiel Sro, vložka č. 64897/V. Ceny sú uvedené bez DPH.`,
    rights: '© 2026 europio s. r. o.',
  },

  start: {
    title: 'Začnime vašou firmou',
    lead: 'Zadajte IČO. Názov a sídlo doplníme z Registra právnických osôb.',
    chosen: 'Vybraný balík',
    perMonth: 'mesačne',
    company: 'Vaša firma',
    other: 'Zadať iné IČO',
    source: 'Údaje z Registra právnických osôb, Štatistický úrad SR, licencia CC BY 4.0.',
    terminated: 'Register vedie túto firmu ako zaniknutú. Ak je to omyl, napíšte nám do poznámky.',
    notSro: 'Firmony je zatiaľ pre s. r. o. Ak máte inú formu, napíšte nám do poznámky a ozveme sa.',
    badIco: 'IČO má 8 číslic. Skontrolujte ho, prosím.',
    wrongIco: 'Toto IČO v registri nie je a nevyzerá správne. Skontrolujte ho, prosím.',
    failed: 'Register práve neodpovedá. Napíšte názov firmy sami, overíme ho neskôr.',
    busy: 'Z tohto pripojenia prišlo veľa vyhľadávaní. Napíšte názov firmy sami.',
    freshTitle: 'Zakladáte firmu',
    freshLead: 'Napíšte nám, ako ste ďaleko. Ozveme sa a všetko prejdeme spolu.',
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
    notePlaceholder: 'Napríklad koľko máte dokladov mesačne alebo dokedy máte výpovednú lehotu.',
    privacy: 'Údaje použijeme len na to, aby sme vám odpovedali a pripravili ponuku.',
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
    title: 'Ďakujeme. Žiadosť máme.',
    lead: `Ozveme sa ${REPLY_WITHIN}. Potvrdenie sme vám poslali na e-mail.`,
    next: 'Kým sa ozveme, pozrite sa do zmluvy so súčasnou účtovníčkou, aká dlhá je výpovedná lehota.',
    back: 'Späť na úvod',
  },

  notFound: {
    title: 'Táto stránka neexistuje.',
    lead: 'Možno sa zmenila adresa. Všetko podstatné nájdete na úvodnej stránke.',
    back: 'Späť na úvod',
  },
})
