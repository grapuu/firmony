// Every text of the client's app, in the words a founder uses and not an accountant's: a payment, a document,
// "we need", never "párovanie", "MD/D" or "saldokonto". Typeset once, like the site's.
import { APP, BRAND } from '../config'
import { formatEur, typeset, typesetAll } from '../format'
import type { Exempt } from './match'

/** Slovak counting: 1 doklad, 2 doklady, 5 dokladov. */
export function plural(n: number, one: string, few: string, many: string): string {
  return n === 1 ? one : n >= 2 && n <= 4 ? few : many
}

const MONTHS = ['január', 'február', 'marec', 'apríl', 'máj', 'jún', 'júl', 'august', 'september', 'október', 'november', 'december']
const MONTHS_OF = ['januára', 'februára', 'marca', 'apríla', 'mája', 'júna', 'júla', 'augusta', 'septembra', 'októbra', 'novembra', 'decembra']

/** "október 2026" for a YYYY-MM-DD or YYYY-MM. */
export function monthName(day: string, capital = false): string {
  const name = `${MONTHS[Number(day.slice(5, 7)) - 1] ?? ''} ${day.slice(0, 4)}`
  return capital ? name.charAt(0).toUpperCase() + name.slice(1) : name
}

/** "13. októbra 2026", or without the year when it is this year. */
export function dayName(day: string, today?: string): string {
  const d = Number(day.slice(8, 10))
  const m = MONTHS_OF[Number(day.slice(5, 7)) - 1] ?? ''
  const year = day.slice(0, 4)
  return typeset(today && today.slice(0, 4) === year ? `${d}. ${m}` : `${d}. ${m} ${year}`)
}

/** "13. 10." for the lists, where space is short. */
export function dayShort(day: string): string {
  return `${Number(day.slice(8, 10))}. ${Number(day.slice(5, 7))}.`
}

/**
 * A name as a person writes it: a card payment's merchant comes from the bank in capitals and without accents
 * ("KAVIAREN NA ROHU KOSICE"), and reads easier as "Kaviaren Na Rohu Kosice". A name with any small letter is
 * left as it is.
 */
export function readableName(name: string): string {
  if (/\p{Ll}/u.test(name) || !/\p{Lu}{3}/u.test(name)) return name
  return name.toLowerCase().replace(/(^|[\s\-/.(])(\p{L})/gu, (_m, before: string, letter: string) => before + letter.toUpperCase())
}

/** A payment's amount with its sign: "+1 200 €", "−12,40 €". */
export function signed(cents: number): string {
  return cents > 0 ? `+${formatEur(cents)}` : formatEur(cents)
}

export const EXEMPT_NAMES: Record<Exempt, { name: string; hint: string }> = typesetAll({
  bank: { name: 'Poplatok alebo úrok banky', hint: 'Výpis z banky stačí.' },
  own: { name: 'Prevod medzi vlastnými účtami firmy', hint: 'Peniaze neopustili firmu.' },
  payroll: { name: 'Mzda, odvody alebo daň zo mzdy', hint: 'Podklady k mzdám pripravujeme my.' },
  state: { name: 'Daň alebo iná platba štátu', hint: 'Daň aj odvody vidíme vo výpise.' },
  capital: { name: 'Vklad do firmy alebo pôžička', hint: 'Napríklad základné imanie alebo pôžička od spoločníka.' },
  other: { name: 'Niečo iné', hint: 'Napíšte nám, čo to bolo.' },
})

export const app = typesetAll({
  title: 'Firmony',
  skip: 'Preskočiť na obsah',
  nav: {
    label: 'Aplikácia',
    home: 'Prehľad',
    payments: 'Platby',
    documents: 'Doklady',
    messages: 'Správy',
    add: 'Pridať doklad',
    addShort: 'Pridať',
    signOut: 'Odhlásiť sa',
    plan: (name: string) => typeset(`Balík ${name}`),
    unread: 'nové správy',
    switch: 'Prepnúť na firmu',
    team: 'Účtovníctvo pre tím',
    settings: 'Firma a nastavenia',
  },
  login: {
    title: 'Prihlásenie',
    serif: 'Bez hesla.',
    lead: 'Napíšte e-mail, s ktorým u nás máte firmu. Pošleme naň odkaz, ktorý vás prihlási.',
    email: 'Váš e-mail',
    button: 'Poslať odkaz',
    badEmail: 'Takto e-mail nevyzerá. Skontrolujte ho, prosím.',
    throttle: 'Odkazov na prihlásenie bolo priveľa. Skúste to znova o hodinu.',
    notClient: 'Ešte nie ste naším klientom?',
    start: 'Začnite tu',
    sentTitle: 'Pozrite sa do e-mailu.',
    sentSerif: 'Odkaz je na ceste.',
    sentLead: `Ak e-mail patrí k firme u nás, poslali sme naň odkaz na prihlásenie. Platí ${APP.linkMinutes} minút a dá sa použiť raz.`,
    sentAgain: 'Neprišiel do pár minút? Pozrite aj do spamu, alebo si pošlite nový.',
    sentButton: 'Poslať nový odkaz',
    enterTitle: 'Prihlásiť sa',
    enterSerif: 'Jedným kliknutím.',
    enterLead: 'Odkaz z e-mailu je platný. Kliknite a ste dnu.',
    enterButton: 'Prihlásiť sa do Firmony',
    expiredTitle: 'Tento odkaz už neplatí.',
    expiredSerif: 'Pošlite si nový.',
    expiredLead: `Odkaz na prihlásenie platí ${APP.linkMinutes} minút a dá sa použiť len raz.`,
    noCompany: 'K tomuto e-mailu u nás zatiaľ nie je žiadna firma. Ak ste ju práve objednali, ozveme sa vám.',
    mailSubject: `${BRAND.name}: odkaz na prihlásenie`,
    mailBody: (link: string) =>
      [
        'Dobrý deň,',
        '',
        `tu je váš odkaz na prihlásenie do ${BRAND.name}:`,
        '',
        link,
        '',
        `Platí ${APP.linkMinutes} minút a dá sa použiť raz. Ak ste o prihlásenie nežiadali, tento e-mail pokojne zmažte.`,
        '',
        BRAND.name,
      ].join('\n'),
  },
  home: {
    hello: (name: string) => typeset(`Dobrý deň, ${name}.`),
    missingTitle: (n: number) => typeset(n === 1 ? 'K jednej platbe chýba doklad.' : `K ${n} platbám chýba doklad.`),
    missingSerif: (n: number) => (n === 1 ? 'Stačí ho odfotiť.' : 'Stačí ich odfotiť.'),
    missingHead: 'Chýba doklad',
    suggested: 'Máme doklad, ktorý sedí',
    restDone: 'Ku všetkým ostatným platbám doklady máme.',
    allMissing: 'Zobraziť všetky',
    doneTitle: 'Všetko máme.',
    doneSerif: 'Nemusíte nič robiť.',
    doneLead: 'Ku každej platbe máme doklad. Keď pribudne nová, uvidíte ju tu.',
    noPayments: 'Zatiaľ tu nie sú žiadne platby.',
    noPaymentsLead: 'Keď prepojíme vašu banku alebo pridáte výpis z banky, platby sa objavia tu. Doklady môžete pridávať už teraz.',
    month: (name: string) => typeset(`${name.charAt(0).toUpperCase()}${name.slice(1)} v číslach`),
    in: 'Prišlo na účet',
    out: 'Odišlo z účtu',
    balance: 'Na účte',
    balanceOn: (day: string) => typeset(`podľa výpisu z ${day}`),
    noBalance: 'Pribudne s výpisom',
    deadlines: 'Termíny',
    deadlinesLead: 'Všetko podávame za vás. Od vás potrebujeme len doklady.',
    accountant: 'Vaša účtovníčka',
    accountantLead: 'Odpovedá do jedného pracovného dňa.',
    write: 'Napísať správu',
    lastMessage: 'Posledná správa',
  },
  deadline: {
    docs: (month: string) => typeset(`Doklady za ${month}`),
    docsState: (missing: number) =>
      missing === 0 ? 'Máme všetko' : typeset(`${plural(missing, 'Chýba', 'Chýbajú', 'Chýba')} ${missing} ${plural(missing, 'doklad', 'doklady', 'dokladov')}`),
    vat: (month: string) => typeset(`DPH a kontrolný výkaz za ${month}`),
    closing: (year: string) => typeset(`Účtovná závierka a daňové priznanie za rok ${year}`),
    ours: 'Podáme za vás',
  },
  add: {
    title: 'Pridajte doklady',
    lead: 'Odfoťte bloček alebo nahrajte faktúru. Aj viac naraz. Prečítame ich a priradíme k platbám sami.',
    button: 'Vybrať doklady',
    phone: 'Odfotiť alebo vybrať',
    drop: 'Alebo ich sem pretiahnite.',
    sending: 'Posielam…',
    send: 'Nahrať',
    types: 'Fotka (JPG, PNG, HEIC), PDF alebo e-faktúra (XML), do 15 MB.',
    emailTitle: 'Faktúry z e-mailu',
    emailLead: 'Faktúru, ktorá vám príde e-mailom, nám jednoducho prepošlite na túto adresu:',
    copy: 'Kopírovať',
    copied: 'Skopírované',
  },
  payments: {
    title: 'Platby',
    lead: 'Všetko, čo prišlo na firemný účet a odišlo z neho. Ku každej platbe potrebujeme doklad.',
    filters: { missing: 'Chýba doklad', done: 'Hotové', all: 'Všetky' },
    emptyMissing: 'Ku každej platbe máme doklad.',
    emptyMissingSerif: 'Nič nechýba.',
    empty: 'Zatiaľ tu nie sú žiadne platby.',
    state: { missing: 'Chýba doklad', done: 'Doklad máme', exempt: 'Netreba' },
    card: 'Platba kartou',
    transfer: 'Prevod',
    incoming: 'Prišlo na účet',
    statementTitle: 'Výpis z banky',
    statementLead: 'Kým vašu banku prepojíme priamo, pridajte sem výpis z internet bankingu vo formáte XML (camt.053). Platby, ktoré už máme, sa nezdvoja.',
    statementButton: 'Pridať výpis',
    statementDone: (added: number, known: number) =>
      typeset(
        added === 0
          ? 'Vo výpise nebola žiadna nová platba.'
          : `Pribudlo ${added} ${plural(added, 'platba', 'platby', 'platieb')}${known > 0 ? `, ${known} sme už mali` : ''}.`,
      ),
    statementBad: 'Toto nie je výpis vo formáte XML (camt.053). V internet bankingu ho nájdete pri výpisoch, zvyčajne ako „XML“ alebo „camt.053“.',
  },
  payment: {
    back: 'Platby',
    missingTitle: 'K tejto platbe ešte nemáme doklad.',
    missingLead: 'Odfoťte bloček alebo nahrajte faktúru. Priradíme ho k tejto platbe.',
    upload: 'Odfotiť alebo nahrať doklad',
    uploadMore: 'Pridať ďalší doklad',
    suggestTitle: 'Je toto doklad k tejto platbe?',
    suggestYes: 'Áno, je',
    pickTitle: 'Alebo vyberte doklad, ktorý už máme',
    pick: 'Priradiť',
    noNeed: 'Doklad k tejto platbe netreba?',
    noNeedLead: 'Vyberte, čo to bolo. Účtovníčka to skontroluje.',
    noNeedNote: 'Čo to bolo?',
    noNeedNoteHint: 'Stačí pár slov.',
    noNeedSave: 'Uložiť',
    noNeedNoteMissing: 'Napíšte, prosím, pár slov, čo to bolo.',
    doneTitle: (n: number) => (n === 1 ? 'Doklad k tejto platbe máme.' : typeset(`K tejto platbe máme ${n} doklady.`)),
    exemptTitle: 'K tejto platbe doklad netreba.',
    exemptAuto: 'Rozpoznali sme to sami.',
    exemptUndo: 'Doklad k nej predsa existuje',
    unlink: 'Toto nie je doklad k tejto platbe',
    differs: (doc: string, payment: string) => typeset(`Na doklade je ${doc}, platba je ${payment}. Účtovníčka sa na to pozrie.`),
    details: 'Podrobnosti',
    date: 'Dátum',
    amount: 'Suma',
    party: 'Druhá strana',
    iban: 'Účet druhej strany',
    vs: 'Variabilný symbol',
    note: 'Správa',
    account: 'Firemný účet',
    ask: 'Neviete, čo s touto platbou?',
    askLead: 'Napíšte nám. Odpovieme do jedného pracovného dňa.',
    askPlaceholder: 'Napríklad: Toto bola záloha za…',
    askButton: 'Poslať otázku',
    linked: 'Doklad sme priradili.',
    exempted: 'Uložené. Doklad k tejto platbe netreba.',
    unlinked: 'Doklad sme od platby odpojili.',
  },
  documents: {
    title: 'Doklady',
    lead: 'Všetky doklady, ktoré ste nám poslali. Väčšinu priradíme k platbám sami.',
    filters: { all: 'Všetky', loose: 'Bez platby' },
    empty: 'Zatiaľ tu nie sú žiadne doklady.',
    emptyLoose: 'Každý doklad má svoju platbu.',
    state: { reading: 'Čítame…', manual: 'Prečíta ho účtovníčka', linked: 'Priradený k platbe', waiting: 'Čaká na platbu', private: 'Zaplatené súkromne' },
    unknown: 'Doklad',
    added: (n: number) => typeset(n === 1 ? 'Doklad sme dostali. Prečítame ho a priradíme.' : `Dostali sme ${n} ${plural(n, 'doklad', 'doklady', 'dokladov')}. Prečítame ich a priradíme.`),
    refused: (name: string) => typeset(`Súbor „${name}“ nie je fotka, PDF ani e-faktúra, preto sme ho nepridali.`),
    tooLarge: (name: string) => typeset(`Súbor „${name}“ má viac ako 15 MB.`),
    none: 'Vyberte, prosím, aspoň jeden súbor.',
    known: (name: string) => typeset(`Doklad „${name}“ už máme, druhýkrát sme ho nepridali.`),
    tooMany: 'Naraz sa dá pridať najviac 12 súborov.',
    perDay: 'Dnes ste pridali veľmi veľa súborov. Ďalšie pridajte zajtra, alebo nám napíšte.',
    noStorage: 'Doklady sa tu zatiaľ nedajú nahrať. Pošlite nám ich, prosím, e-mailom.',
  },
  document: {
    back: 'Doklady',
    read: 'Čo sme prečítali',
    reading: 'Doklad práve čítame. Zvyčajne to trvá pár sekúnd.',
    manual: 'Tento doklad sa nedal prečítať automaticky. Prečíta ho účtovníčka, vy nemusíte nič robiť.',
    kind: { receipt: 'Bloček', invoice_in: 'Prijatá faktúra', invoice_out: 'Vydaná faktúra', other: 'Doklad' },
    party: 'Od koho',
    partyOut: 'Pre koho',
    ico: 'IČO',
    number: 'Číslo dokladu',
    issued: 'Dátum',
    due: 'Splatnosť',
    total: 'Suma',
    vat: 'Z toho DPH',
    vs: 'Variabilný symbol',
    iban: 'Platiť na účet',
    source: { upload: 'Nahrali ste ho', email: 'Prišiel e-mailom', einvoice: 'Prišiel ako e-faktúra', issued: 'Vystavili ste ju vo Firmony' },
    original: 'Otvoriť originál',
    payment: 'Platba',
    noPayment: 'Zatiaľ k nemu nemáme platbu.',
    noPaymentLead: 'Keď ho zaplatíte z firemného účtu, priradíme ho sami. Ak ste ho platili hotovosťou alebo zo svojich peňazí, dajte nám vedieť.',
    privately: 'Zaplatené z vlastných peňazí',
    privatelyDone: 'Tento doklad ste zaplatili z vlastných peňazí. Firma vám tú sumu dlhuje a účtovníčka to tak zaúčtuje.',
    privatelyUndo: 'Nie, platila ho firma',
    delete: 'Zmazať doklad',
    deleteLead: 'Ak ste ho pridali omylom.',
    deleteSure: 'Áno, zmazať',
    deleted: 'Doklad sme zmazali.',
    locked: 'Tento doklad už účtovníčka zaúčtovala, preto sa nedá zmazať. Napíšte jej.',
  },
  messages: {
    title: 'Správy',
    lead: 'Píšete priamo účtovníčke. Odpovedá do jedného pracovného dňa.',
    empty: 'Zatiaľ ste si nenapísali.',
    emptyLead: 'Keď si s niečím nebudete vedieť rady, opýtajte sa. Žiadna otázka nie je hlúpa.',
    placeholder: 'Napíšte správu…',
    send: 'Odoslať',
    you: 'Vy',
    about: 'K platbe',
    tooLong: `Správa je pridlhá. Rozdeľte ju, prosím, na viac správ (najviac ${APP.messageChars} znakov).`,
    emptyBody: 'Napíšte, prosím, správu.',
    throttle: 'Správ bolo za hodinu priveľa. Skúste to o chvíľu.',
    sent: 'Správu sme poslali.',
  },
  errors: {
    notFound: 'Toto sa nenašlo.',
    notFoundLead: 'Možno to už niekto zmazal, alebo patrí inej firme.',
    gone: 'Platbu alebo doklad medzitým niekto zmenil. Pozrite sa, ako to vyzerá teraz.',
  },
})
