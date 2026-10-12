// Every visible text of the site, in Slovak, typeset once (src/format.ts). Prices and limits come from
// src/config.ts, so a text can never say another figure than the plans have.
import { BRAND, CLOSING_PRICE, PLANS, REPLY_WITHIN, type Plan } from './config'
import { formatEur, typeset, typesetAll } from './format'

const start = PLANS[0] as Plan
const eur = (euros: number) => formatEur(euros * 100)

/** What a plan's rows say: whom it is for, documents, VAT, payroll. */
export function planRows(plan: Plan): { forWhom: string; docs: string; vat: string; people: string } {
  return {
    forWhom: typeset(plan.id === 'start' ? 'Firmy, ktoré nie sú platiteľom DPH' : plan.id === 'rast' ? 'Platitelia DPH' : 'Firmy so zamestnancami'),
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
  nav: { how: 'Ako to funguje', pricing: 'Cenník', faq: 'Otázky', start: 'Chcem začať', home: `${BRAND.name}, úvod` },

  hero: {
    first: 'Postaráme sa o všetko.',
    second: 'Vy rastite.',
    lead: 'Firmony je účtovníctvo pre mladé firmy. Doklady stačí odfotiť a zvyšok urobíme my: zaúčtujeme ich, podáme DPH aj daňové priznanie a postrážime každý termín.',
    price: `Od ${eur(start.price)} mesačne. Bez poplatkov za doklad.`,
    cta: 'Chcem začať',
    secondary: 'Pozrieť cenník',
    note: `Začíname ${BRAND.launch}. Stačí IČO a kontakt, je to nezáväzné.`,
    /** What happens while the receipt is printed: three things we take off their hands. */
    chips: [
      { title: 'Bloček zaúčtovaný', sub: 'Káva s klientom, 4,80 €' },
      { title: 'E-faktúra prijatá', sub: 'Rovno do účtovníctva' },
      { title: 'Termín postrážený', sub: 'Priznanie k DPH je podané' },
    ],
  },

  receipt: {
    label: `Čo dostanete v balíku ${start.name}`,
    title: `Balík ${start.name}`,
    sub: 'mesačne',
    lines: [
      ['Zaúčtovanie dokladov', 'v cene'],
      ['Párovanie platieb z banky', 'v cene'],
      ['DPH podľa § 7a', 'v cene'],
      ['Prijímanie e-faktúr', 'v cene'],
      ['Mesačný prehľad daní', 'v cene'],
      ['Strážime termíny', 'v cene'],
      ['Poplatok za doklad', eur(0)],
    ],
    total: 'Spolu',
    totalValue: eur(start.price),
    vat: 'Bez DPH.',
    thanks: 'Ďakujeme, že ste s nami.',
  },

  pains: {
    title: 'Ak vás účtovníctvo stresuje, nie ste jediní.',
    items: [
      'Bločky v peňaženke, faktúry v maile a termíny v hlave.',
      'Neviete, koľko vám na konci roka zoberú dane.',
      'Na odpoveď čakáte týždeň a aj tak jej nerozumiete.',
      'Bojíte sa, že prehliadnete termín a príde pokuta.',
    ],
    close: {
      first: 'Nikoho nesúdime.',
      rest: 'Ak máte v papieroch neporiadok, dáme ho spolu do poriadku a odvtedy sa oň staráme my.',
    },
  },

  how: {
    title: 'Ako to funguje',
    steps: [
      { title: 'Ozvete sa nám', text: `Vyplníte IČO a kontakt. ${capitalize(REPLY_WITHIN)} sa vám ozveme a všetko vysvetlíme po ľudsky.` },
      { title: 'Prechod vybavíme za vás', text: `Podpíšete zmluvu a plnú moc. Podklady si od doterajšej účtovníčky vyžiadame sami a od ${BRAND.launch} to preberáme.` },
      { title: 'Doklady posielate, ako sa vám hodí', text: 'Bloček odfotíte v mobile, faktúru prepošlete e-mailom a e-faktúry nám prídu samy. Bankový účet prepojíte raz.' },
      { title: 'My zaúčtujeme a podáme', text: 'Doklady roztriedi umelá inteligencia, účtovníčka všetko skontroluje a podá. Každý mesiac dostanete prehľad: koľko ste zarobili a koľko pôjde na dane.' },
    ],
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

  included: {
    title: 'Čo všetko za vás urobíme',
    lead: 'Jedna mesačná cena. Nemusíte rozmýšľať, čo je navyše.',
    items: [
      { title: 'Zaúčtovanie dokladov', text: 'Faktúry, bločky aj výpisy z banky. Za doklad neplatíte nič navyše.' },
      { title: 'DPH a výkazy', text: 'Priznanie k DPH, kontrolný a súhrnný výkaz. Aj keď ste registrovaní len podľa § 7a.' },
      { title: 'Závierka a daňové priznanie', text: `Raz ročne za ${eur(CLOSING_PRICE)}, aby ste vedeli dopredu, koľko to bude.` },
      { title: 'Mzdy a odvody', text: 'Pre konateľa aj zamestnancov v balíkoch Rast a Firma.' },
      { title: 'E-faktúry', text: 'Od roku 2027 ich musí vedieť prijať každá firma. U nás to máte v cene.' },
      { title: 'Termíny', text: 'Podávame za vás a vopred vám povieme, čo a dokedy zaplatiť.' },
      { title: 'Mesačný prehľad', text: 'Koľko ste zarobili, koľko pôjde na dane a čo vás čaká.' },
      { title: 'Odpovede', text: `Na otázky odpovedáme ${REPLY_WITHIN}. Po slovensky, nie úradnícky.` },
    ],
    /** Two deadlines every s. r. o. lives with, shown in the tile about deadlines. */
    deadlines: [
      { what: 'Priznanie k DPH a kontrolný výkaz', when: 'do 25. dňa po skončení obdobia' },
      { what: 'Daňové priznanie a závierka', when: 'do 31. marca' },
    ],
  },

  einvoice: {
    title: `Od ${BRAND.launch} musí každá firma vedieť prijať e-faktúru.`,
    text: 'Faktúry medzi firmami budú chodiť cez certifikovaných digitálnych poštárov. Prijímať ich musí aj firma, ktorá nie je platiteľom DPH, a platitelia DPH ich budú musieť aj vystavovať.',
    ours: 'S Firmony máte prijímanie e-faktúr v cene každého balíka a faktúry nám prídu rovno do účtovníctva.',
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
    title: 'Či firmu len zakladáte, alebo už beží',
    fresh: {
      title: 'Zakladáte s. r. o.',
      text: 'Od prvého dňa budete mať v účtovníctve poriadok. Povieme vám, čo treba pri štarte vybaviť, a postrážime prvé termíny.',
      cta: 'Zakladám firmu',
    },
    switching: {
      title: 'Meníte účtovníčku',
      text: `Prechod vybavíme za vás. Pri mesačnej výpovednej lehote stačí poslať výpoveď v novembri a od ${BRAND.launch} začneme my.`,
      cta: 'Chcem prejsť',
    },
  },

  founder: {
    quote:
      'Keď som si založil firmu, najviac nervov ma nestálo podnikanie, ale papiere okolo neho. Termíny, priznania, pravidlá, ktorým som nerozumel, a pocit, že som na to sám. Firmony robíme, aby to mladé firmy mali inak: aby sa o ne niekto postaral a ony mohli rásť.',
    name: 'Christian Juhás',
    role: 'zakladateľ Firmony',
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
    legal: 'Právne informácie',
    privacy: 'Ochrana údajov',
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

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}
