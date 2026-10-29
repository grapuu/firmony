// Every visible text of the site, in Slovak, typeset once (src/format.ts). Prices and limits come from
// src/config.ts, so a text can never say another figure than the plans have.
// Price/trust decisions and primary sources, with transfer limits: docs/research/trust-and-value-2026-10-22.md.
// These are product hypotheses; no conversion uplift or market-wide cheapest claim is asserted.
import { APP, BRAND, CLOSING_PRICE, INVESTORS, OPERATOR, PAYROLL_PRICE, PLANS, REPLY_WITHIN, type Plan } from './config'
import { formatEur, typeset, typesetAll } from './format'

const start = PLANS[0] as Plan
const largest = PLANS[PLANS.length - 1] as Plan
const eur = (euros: number) => formatEur(euros * 100)
/** Štart by the day, averaged over a year, rounded up to the cent. */
const startPerDayCents = Math.ceil((start.price * 100 * 12) / 365)

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
    description: `Účtovníctvo s pridelenou účtovníčkou, dokladmi a termínmi v jednej aplikácii. Balíky od ${eur(start.price)} mesačne, závierka ${eur(CLOSING_PRICE)} ročne. Rozsah a cenu si prejdeme pred zmluvou.`,
  },
  skip: 'Preskočiť na obsah',
  nav: { how: 'Ako to funguje', pricing: 'Cenník', about: 'Kto sme', faq: 'Otázky', investors: 'Pre investorov', login: 'Prihlásiť sa', start: 'Chcem začať', home: `${BRAND.name}, úvod` },

  // His word of 27 October 2026, after his mother saw the site: say at once what we are and why us. "Pošlete", not
  // "odfotíte" (29 October 2026): most invoices come by e-mail and are forwarded, not photographed.
  hero: {
    first: 'Účtovníctvo pre Vašu s. r. o.',
    second: 'Vy pošlete doklad, my urobíme zvyšok.',
    lead: 'Online účtovná firma za pevnú cenu. Umelá inteligencia prečíta doklady, Vaša účtovníčka ich skontroluje a postará sa o dohodnuté priznania. Všetko vidíte v aplikácii.',
    price: `Od ${eur(start.price)} mesačne. Závierka a priznanie ${eur(CLOSING_PRICE)} ročne.`,
    secondary: 'Pozrieť cenník',
    how: 'Ako to funguje',
    // A ticket, not a chip (his word of 29 October 2026: the "Novinka" pill is what every AI site has). The usual price
    // is the formation's own lead below (about 500 € since August 2026), said as what it costs elsewhere, never as a
    // former price of ours.
    deal: { kicker: 'Zakladáte firmu?', text: 'S. r. o. za', price: '1 €', elsewhere: 'Inde okolo 500 €', more: 'Advokáta aj poplatky platíme my' },
  },

  /** The card in the opening where a client starts: the e-mail first (his word of 29 October 2026), then the IČO. */
  card: {
    title: 'Začnite online za pár minút',
    text: 'Všetko zvládnete sami, bez stretnutia a bez papierov. Zatiaľ nič neobjednávate.',
    next: 'Firmu nájdeme podľa IČO a cenu uvidíte pred uzavretím zmluvy. Zmluvu uzavriete online a Vaša účtovníčka sa Vám hneď začne venovať.',
    fine: `Ozveme sa ${REPLY_WITHIN}.`,
    noCompany: 'Nemáte firmu? S. r. o. za 1 €',
  },

  /** The e-mail that starts it, wherever on the site (POST /zacat/email): kept at once, then the IČO. */
  lead: {
    label: 'Váš e-mail',
    placeholder: 'meno@firma.sk',
    button: 'Pokračovať',
    privacy: 'E-mail použijeme len na Vašu žiadosť.',
    privacyLink: 'Ochrana údajov',
    title: 'Začnime',
    lead: 'Napíšte e-mail a pokračujte. Celý začiatok zvládnete online sami, krok za krokom.',
    error: 'Skontrolujte, prosím, e-mail.',
    throttle: `Z tohto pripojenia prišlo veľa pokusov. Skúste to o hodinu alebo nám napíšte na ${BRAND.email}.`,
    mail: {
      subject: `${BRAND.name}: dokončite začiatok za pár minút`,
      lead: `začali ste na stránke ${BRAND.name}. Pokračovať môžete tam, kde ste skončili:`,
      fresh: 'Ešte nemáte firmu? Založíme Vám s. r. o. za 1 €, advokáta aj poplatky platíme my:',
      end: 'Ak ste sa rozhodli inak, nemusíte nič robiť. Ďalší e-mail Vám už neposielame.',
    },
  },

  /** One month, as the papers fly into it while the page is scrolled. An illustration. */
  flow: {
    first: 'Vy pošlete doklady.',
    second: 'My ich skontrolujeme.',
    lead: 'Faktúru z e-mailu prepošlete, e-faktúra príde sama, papierový bloček odfotíte. Účtovníčka všetko skontroluje a postará sa o dohodnuté priznania.',
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

  /** Why Firmony, in three lines a visitor reads at a glance (27 October 2026). */
  why: {
    first: 'Prečo Firmony.',
    second: 'Tri veci, ktoré pocítite hneď.',
    items: [
      { title: 'Doklad len pošlete', text: 'Faktúru z e-mailu prepošlete, alebo si nastavíte, aby chodili samé. Bloček odfotíte. Prečítame ho, zaúčtujeme a spárujeme s platbou. Nič neprepisujete, nič nenosíte.' },
      { title: 'Pevná cena vopred', text: `Od ${eur(start.price)} mesačne podľa počtu dokladov. Prvý mesiac zadarmo a bez viazanosti.` },
      { title: 'Všetko v jednej aplikácii', text: `S účtovníčkou si píšete priamo pri doklade v našej aplikácii vyvinutej na Slovensku. Žiadne e-maily sem a tam, žiadny Google Drive. Odpoveď ${REPLY_WITHIN}.` },
    ],
  },

  // His word of 27 October 2026: the s. r. o. for 1 €, right under the opening, so that it pours over the visitor.
  // The market price (about 500 € since August 2026) is from Firmáreň and an advocate's published price; the terms
  // are his of that evening (36 months, the founder's guarantee, the exit fee and its cap, 20 firms a month) and of
  // 28 October 2026 (a deposit of 549 € held for the last bills, the monthly fee from the first month: we are never at a
  // loss when a founder leaves early); the application and the contract are src/founding/.
  formation: {
    badge: 'Pre tých, čo zakladajú firmu',
    first: 'Založíme Vám s. r. o.',
    big: 'za 1 €',
    second: 'Advokáta aj poplatky platíme my.',
    lead: 'Od augusta 2026 je založenie s. r. o. drahšie a bežne stojí okolo 500 €. U nás zaplatíte 1 € a od prvého dňa máte účtovníctvo, ktoré sa o Vás postará.',
    points: [
      { title: 'Advokát a poplatky v cene', text: 'Zakladateľskú listinu, zápis do obchodného registra aj živnosť zariadime za Vás. Súdny poplatok a odmenu advokáta platíme my.' },
      { title: 'Bez behania po úradoch', text: 'Podpíšete, čo treba, a ostatné vybavíme. Priebežne Vám povieme, v akom je to stave.' },
      { title: 'Účtovníctvo od prvého dňa', text: `Odo dňa vzniku firmy Vám účtovníctvo vedieme my, za cenu balíka od ${eur(start.price)} mesačne.` },
      { title: 'Rastieme spolu', text: 'Táto ponuka je pre tých, čo s nami chcú rásť. Účtovníctvo u nás vediete aspoň prvé tri roky a potom už len tak dlho, ako budete spokojní. A keby sme niekedy zlyhali a nenapravili to, odídete bez poplatku.' },
    ],
    cta: 'Chcem s. r. o. za 1 €',
    limit: 'Len pre prvých 20 firiem každý mesiac.',
    fine: 'Podmienky ponuky: pri prihláške zaplatíte 550 €, teda 1 € za založenie a kauciu 549 €, ktorú Vám odpočítame z posledných faktúr za účtovníctvo. Účtovníctvo vediete vo Firmony aspoň 36 mesiacov a platíte ho mesačne od vzniku firmy, potom zmluva pokračuje bez viazanosti. Pri skoršom ukončení sa kaucia započíta na odstupné, najviac 12 mesačných poplatkov. Zakladateľ za záväzky firmy z tejto zmluvy osobne ručí.',
  },

  /** Side by side: what is usual, and what Firmony does instead. Plain, without naming anybody. */
  versus: {
    first: 'V čom sme iní.',
    second: 'Porovnajte sami.',
    usual: {
      title: 'Bežne',
      items: [
        'Doklady nosíte osobne alebo ich posielate e-\u2060mailom.',
        'Výpisy z banky posielate každý mesiac.',
        'S účtovníčkou si píšete e-\u2060maily a prílohy hľadáte v schránke či na Google Drive.',
        'Čo je hotové, sa dozviete, keď sa opýtate.',
        'Cena sa často dohaduje individuálne.',
        'Pri zmene účtovníčky zháňate podklady sami.',
      ],
    },
    ours: {
      title: 'S Firmony',
      items: [
        'Faktúru prepošlete z e-\u2060mailu, e-\u2060faktúra príde sama, bloček odfotíte.',
        'Výpis z banky nám chodí sám alebo ho raz mesačne pridáte a máte ho aj vo svojom účte vo Firmony.',
        'S účtovníčkou si píšete priamo v aplikácii pri doklade, všetko na jednom mieste.',
        'Stav firmy vidíte v aplikácii kedykoľvek.',
        'Pevná cena podľa počtu dokladov, známa vopred.',
        'Prechod od doterajšej účtovníčky zariadime my.',
      ],
    },
  },

  // His word of 27 October 2026: what is free and the extra service for investors were hidden at the foot of the site.
  extras: {
    first: 'Ešte viac od Firmony.',
    second: 'Extra služba a nástroje zadarmo.',
    invest: {
      tag: 'Extra služba',
      title: 'Daňové priznanie z investícií',
      text: 'Investujete cez XTB, Trading 212, Interactive Brokers alebo Revolut? Pripravíme Vám daňové priznanie z akcií, ETF a dividend. Zapíšte sa a ozveme sa v januári.',
      button: 'Chcem priznanie',
    },
    tools: {
      tag: 'Zadarmo',
      title: 'Nástroje zadarmo',
      text: 'Bez registrácie a bez platobnej karty, pre každého:',
      invoice: 'Faktúra v PDF',
      wage: 'Mzdová kalkulačka',
      szco: 'Dane a odvody živnostníka',
      sro: 'Daň a dividendy s. r. o.',
      button: 'Všetky nástroje',
    },
  },

  /** One offer the visitor cannot refuse: four deals in a ring that turns without end. */
  offer: {
    eyebrow: 'Výhodnejší štart s Firmony',
    title: 'Začnite s náskokom. Štyri výhody za 0 €.',
    lead: 'Prvý mesiac, prechod k nám, fakturácia aj Mony, naša pomocníčka. Pozrite sa, čo všetko u nás získate za 0 €.',
    /** The big accent under each card's title, the same on all four. */
    accent: 'ZA 0 €',
    items: [
      { title: 'Mony, pomocníčka', text: 'Pýtajte sa kedykoľvek, aj v noci. Mony vpravo dole Vám hneď vysvetlí, ako Firmony funguje a čo kde nájdete.' },
      { title: 'Prvý mesiac', text: 'Za prvý mesiac služby neplatíte nič. Ak Vám Firmony nesadne, vypoviete zmluvu do jeho konca a neplatíte ani euro.' },
      { title: 'Prechod k Firmony', text: 'So zmenou Vám pomôžeme tak, aby ste nemuseli začínať od nuly ani platiť za samotný prechod.' },
      { title: 'Fakturácia', text: 'Faktúry vystavujete zadarmo, aj keď u nás účtovníctvo nemáte. Našim klientom sa vystavené faktúry nerátajú do dokladov balíka.', link: { href: '/fakturacia', text: 'Začať fakturovať' } },
    ],
    cta: 'Chcem začať',
    fine: 'Vedenie účtovníctva je bez viazanosti, s mesačnou výpovednou lehotou; výpoveď v prvom mesiaci ukončí zmluvu s jeho koncom. Výnimkou je ponuka s. r. o. za 1 €, pri ktorej sa zaviažete aspoň na 36 mesiacov; potom už bez viazanosti.',

    hint: 'Objavte všetky štyri výhody.',
    hintMobile: 'Potiahnite prstom a objavte ďalšie výhody.',
  },

  pricing: {
    first: 'Jasná cena.',
    second: 'Platíte podľa počtu dokladov.',
    lead: 'Vyberte si podľa počtu dokladov za mesiac a podľa toho, či ste platiteľom DPH.',
    firstMonthFree: 'Prvý mesiac máte zadarmo. Faktúry, ktoré vystavíte Vy, do počtu dokladov nerátame.',
    // His word of 29 October 2026: a line that tells the visitor how good a deal it is. Štart's price by the day,
    // averaged over a year (89 € × 12 / 365 is 2,93 €), said as "less than 3 €" only while it is; no comparison with
    // anybody named.
    value: {
      big: startPerDayCents < 300 ? 'Menej ako 3 € denne' : `Od ${formatEur(startPerDayCents)} denne`,
      text: `v priemere s balíkom ${start.name} za celé účtovníctvo Vašej firmy. V cene je aplikácia, fakturácia, digitálny poštár, stráženie termínov, prechod od doterajšej účtovníčky a odpovede do jedného pracovného dňa. Inde si za mnohé z toho priplácate.`,
    },
    perMonth: 'mesačne',
    annual: 'Za 12 mesiacov so závierkou',
    annualBasis: 'Ročný súčet počíta s rovnakým balíkom počas 12 mesiacov a jednou závierkou s daňovým priznaním. Mzdy a individuálne dohodnuté práce sú navyše.',
    documents: 'Rozsah a zodpovednosť v podmienkach',
    privacy: 'Ako chránime Vaše údaje',
    rows: { docs: 'Doklady', vat: 'DPH', people: 'Mzdy' },
    included: `V každom balíku: zaúčtovanie dokladov a platieb, e-faktúry, mesačný prehľad, stráženie termínov a odpovede ${REPLY_WITHIN}.`,
    closing: `Závierka a daňové priznanie: ${eur(CLOSING_PRICE)} raz ročne. Mzdy: ${eur(PAYROLL_PRICE)} mesačne za človeka.`,
    vat: 'Ceny sú konečné.',
    custom: `Viac ako ${largest.docs} dokladov mesačne? Pripravíme Vám ponuku na mieru.`,
    /** Beside the plans: the way in for a medium or large company, whose scope and price are agreed one by one. */
    large: {
      title: 'Na mieru',
      forWhom: 'Pre stredné a veľké firmy.',
      // His word of 27 October 2026: no price for the large; a contact, the conditions agreed with each.
      price: 'Podmienky dohodneme osobne',
      text: `Stovky dokladov mesačne, desiatky zamestnancov, viac účtov či prevádzok. Najprv s Vami prejdeme agendu, potom navrhneme rozsah, podmienky a postup prechodu.`,
      cta: 'Kontaktujte nás',
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
    lead: 'Porovnajte náklady na rovnaký rozsah služieb za celý rok. Vyplňte sumy, ktoré dnes platíte.',
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

  founder: {
    title: 'Kto za nami stojí',
    // His word of 27 October 2026: warmer and from him, people are not alone in it, we guide them without experience
    // and the client is the one we serve.
    quote:
      'Keď som zakladal firmu, najviac nervov ma nestálo podnikanie, ale papiere, termíny a úrady okolo neho. A hlavne pocit, že som na to všetko sám.',
    letter:
      'Preto robíme Firmony. Aby ste Vy taký pocit nikdy nemali. Nepotrebujete žiadne skúsenosti: aplikácia Vás prevedie krok za krokom, a keď si neviete rady, my Vám poradíme. Na nič nebudete sami. Nie ste pre nás ďalšie číslo v zozname. Ste dôvod, prečo Firmony existuje, a chceme Vám slúžiť najlepšie, ako vieme.',
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
    // His word of 27 October 2026: whoever does not know something should look for our helper in the corner.
    ask: { before: 'Nenašli ste odpoveď? Opýtajte sa kedykoľvek', after: ', našej pomocníčky vpravo dole. Alebo napíšte na' },
    reply: `odpovieme ${REPLY_WITHIN}.`,
    items: [
      // His word of 29 October 2026: this first. People, not a machine; the protection is the terms' point 6 (our
      // error put right without charge, damage including a fine it caused made good), no "100 %" promised.
      {
        q: 'Bude mi viesť účtovníctvo umelá inteligencia?',
        a: 'Nie. Účtovníctvo Vám vedie skúsená účtovníčka, ktorú sme starostlivo vybrali a zaškolili, a na prácu účtovníčok dohliadajú skúsené kontrolórky z nášho tímu. Náš softvér im len šetrí čas: prečíta doklad, spáruje platbu a navrhne zaúčtovanie. Každý výsledok kontroluje človek. A keby sme sa niekedy pomýlili my, chybu opravíme zadarmo a škodu, ktorú spôsobila, Vám nahradíme podľa obchodných podmienok.',
      },
      {
        q: 'Čo musím robiť ja?',
        a: 'Doklady pošlete: faktúry z e-mailu prepošlete na adresu svojej firmy vo Firmony, bloček odfotíte v mobile. Pri každom doklade vidíte, že prišiel. Keď potrebujeme vysvetliť nákup alebo doplniť údaj, ozveme sa v aplikácii. Začiatok zvládnete online sami, krok za krokom.',
      },
      {
        q: 'Ako prejdem od súčasnej účtovníčky?',
        a: 'V aplikácii nám zadáte kontakt na doterajšiu účtovníčku a potvrdíte koordináciu prechodu. Dohodneme prevzatie a Vaša účtovníčka skontroluje podklady. Vy sa zapojíte pri potrebnom podpise alebo doplnení. Priebeh aj ďalší krok uvidíte v aplikácii. Pripravený list si môžete vybaviť aj osobne.',
      },
      {
        q: 'Ešte nemám firmu. Môžem začať?',
        a: `Áno, a firmu Vám aj založíme. V ponuke s. r. o. za 1 € zariadime advokáta, zápis do obchodného registra aj živnosť a súdny poplatok aj odmenu advokáta platíme my. Prihlášku vyplníte online za pár minút. Účtovníctvo povedieme od ${BRAND.launch}, alebo odo dňa, keď firma vznikne, ak to bude neskôr.`,
      },
      {
        q: 'Musím sa viazať?',
        a: 'Pri bežnom vedení účtovníctva nie. Zmluvu môžete kedykoľvek vypovedať priamo v aplikácii, s mesačnou výpovednou lehotou; výpoveď v prvom mesiaci ukončí zmluvu s jeho koncom a prvý mesiac neplatíte. Výnimkou je ponuka s. r. o. za 1 €, pri ktorej sa zaviažete aspoň na 36 mesiacov. Keď odídete, účtovníctvo Vám odovzdáme a všetko si stiahnete v aplikácii.',
      },
      {
        q: 'Čo sa mení od 1. 1. 2027 s e\u2011faktúrami?',
        // Read 22 October 2026: current law and the enacted 2027 wording, especially § 71(5), § 85o(2)-(4),(9)-(10).
        // https://static.slov-lex.sk/static/SK/ZZ/2004/222/20270101.html#paragraf-85o
        a: 'Pri určených tuzemských dodaniach ich vystavujú platitelia DPH. Vedieť ich prijať musia aj neplatitelia. Digitálneho poštára budete mať priamo vo Firmony: e-faktúru pošlete jedným klikom a prijaté uvidíte v aplikácii. Zapíname pred 1. 1. 2027.',
      },
    ],
  },

  final: {
    title: 'Poďme do toho spolu.',
    lead: `Stačí e-mail. Ďalej Vás aplikácia prevedie sama a ozveme sa ${REPLY_WITHIN}.`,
    label: 'IČO Vašej firmy',
    placeholder: '8 číslic',
    button: 'Pokračovať',
    noCompany: 'Ešte nemám firmu',
    ask: 'Opýtajte sa Mony vpravo dole',
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
    imprint: `${BRAND.name} je služba spoločnosti ${OPERATOR.name}, ${OPERATOR.street}, ${OPERATOR.postalCity}, IČO ${OPERATOR.companyId}, DIČ ${OPERATOR.taxId}, zapísanej ${OPERATOR.registeredIn}.`,
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
    freshLead: `Založíme Vám s. r. o. za 1 €, advokáta aj poplatky platíme my. Napíšte nám, ako ďaleko ste, a ozveme sa ${REPLY_WITHIN}.`,
    freshFine: 'Pri ponuke s. r. o. za 1 € sa zaviažete viesť u nás účtovníctvo aspoň 36 mesiacov, potom už bez viazanosti.',
    companyName: 'Názov firmy',
    companyNameFresh: 'Názov firmy, ak ho už máte',
    plan: 'Balík',
    planUnsure: 'Ešte neviem',
    planCustom: 'Na mieru',
    planCustomHint: 'podmienky dohodneme osobne',
    situation: 'Čo potrebujete',
    situations: { first: 'Hľadám účtovnú firmu', switch: 'Mením účtovníčku', fresh: 'Zakladám firmu', other: 'Iné' },
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
    replacedLead: 'Platí vždy len najnovší odkaz, ktorý sme Vám poslali e-mailom. Otvorte, prosím, posledný e-mail od Firmony.',
    replacedBack: 'Späť na úvod',
    waitTitle: 'Zmluvu pre Vás pripravujeme.',
    waitLead: `Najprv posúdime, či Vašej firme sedí štandardný balík. Odkaz na podpis pošleme ${REPLY_WITHIN} tomu, kto za firmu koná.`,
    bespokeTitle: 'Pripravujeme Vám ponuku na mieru.',
    bespokeLead: 'Vaša firma potrebuje iný rozsah, než má štandardný balík. Ozveme sa Vám osobne s ponukou.',
    holdTitle: 'Potrebujeme ešte pár údajov.',
    holdLead: 'Pred zmluvou si s Vami potrebujeme niečo overiť. Ozveme sa Vám osobne.',
    staleTitle: 'Odkaz na podpis vypršal.',
    staleLead: 'Na uzavretie zmluvy je sedem dní. Požiadajte o predĺženie: ak sa ponuka nezmenila, otvorí sa hneď, inak nový odkaz pošleme tomu, kto za firmu koná.',
    staleButton: 'Predĺžiť odkaz',
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
