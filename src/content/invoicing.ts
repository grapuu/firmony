// The words of invoicing for everyone (26 October 2026): the public page /fakturacia, its sign-up, and the workspace in
// the app. Short sentences, the polite "Vy" in capitals, no long dashes. Every promise here is something the code does:
// the PDF, the QR code, the e-invoice file checked against Peppol BIS 3.0 (test/peppol.mjs), the register's data.
import { BRAND, INVOICING, OPERATOR, PLANS } from '../config'
import { typeset } from '../format'

export const INVOICING_PATH = '/fakturacia'
export const INVOICING_UPDATED = '2026-10-26'

const cheapest = Math.min(...PLANS.map((p) => p.price))

export const invoicingCopy = {
  meta: {
    title: 'Fakturácia zadarmo pre firmy a živnostníkov | Firmony',
    description: typeset('Faktúry, dobropisy a zálohové faktúry zadarmo. PDF s QR kódom na platbu, e-faktúra Peppol, platitelia DPH aj neplatitelia. Bez platobnej karty.'),
  },
  hero: {
    pill: 'Pre s. r. o. aj živnostníkov',
    first: 'Fakturácia zadarmo.',
    second: 'Pre každého.',
    lead: typeset('Faktúra hotová za minútu. S QR kódom na platbu, v PDF aj ako e-\u2060faktúra. Pre platiteľov DPH aj neplatiteľov.'),
    price: typeset('0 € mesačne. Bez platobnej karty a bez mesačného limitu faktúr.'),
    how: 'Ako to funguje',
    features: 'Čo všetko vie',
  },
  form: {
    title: 'Začnite s IČO',
    text: typeset('Údaje Vašej firmy doplníme z registra. Odkaz na dokončenie Vám pošleme e-\u2060mailom.'),
    email: 'Váš e-\u2060mail',
    name: 'Vaše meno a priezvisko',
    ico: 'IČO firmy alebo živnosti',
    company: 'Obchodné meno',
    address: 'Sídlo alebo miesto podnikania',
    manualLead: typeset('Register teraz túto firmu nenašiel alebo neodpovedá. Doplňte, prosím, obchodné meno a adresu. Neskôr ich zmeníte v nastaveniach.'),
    submit: 'Začať zadarmo',
    fine: typeset('Bez platobnej karty. Účet zrušíte kedykoľvek.'),
    consent: (terms: string, privacy: string) => [typeset('Pokračovaním súhlasíte s '), terms, ' a beriete na vedomie ', privacy, '.'] as const,
    termsLink: 'podmienkami používania fakturácie',
    privacyLink: 'ochranu osobných údajov',
    errors: {
      email: 'Napíšte e-\u2060mail v tvare meno@firma.sk.',
      name: 'Napíšte svoje meno a priezvisko.',
      ico: 'IČO má 6 až 8 číslic.',
      icoWrong: typeset('Toto IČO nie je platné. Skontrolujte, prosím, číslice.'),
      ended: typeset('Táto firma podľa registra zanikla. Fakturovať za ňu už nemožno.'),
      company: 'Napíšte obchodné meno.',
      address: 'Napíšte adresu sídla alebo miesta podnikania.',
      throttle: typeset('Z tohto pripojenia prišlo veľa registrácií. Skúste to, prosím, o hodinu.'),
      busy: typeset('Registrácií je dnes výnimočne veľa. Skúste to, prosím, zajtra alebo nám napíšte.'),
      summary: 'Skontrolujte, prosím, vyznačené polia.',
    },
  },
  sent: {
    title: 'Pozrite sa do e-\u2060mailu',
    lead: (email: string) => typeset(`Ak je adresa ${email} správna, je v nej odkaz na dokončenie registrácie. Platí ${INVOICING.linkHours} hodín.`),
    spam: typeset('Nič neprišlo do pár minút? Pozrite priečinok Spam alebo Hromadné a skúste to znova.'),
    again: 'Zadať údaje znova',
  },
  enter: {
    title: 'Dokončite registráciu',
    lead: typeset('Skontrolujte údaje. Jedným klikom vytvoríme Váš účet a môžete vystaviť prvú faktúru.'),
    company: 'Firma',
    ico: 'IČO',
    email: 'E-mail',
    agree: 'Súhlasím s podmienkami používania fakturácie.',
    agreeError: 'Na pokračovanie potvrďte súhlas s podmienkami.',
    submit: 'Vytvoriť účet a začať fakturovať',
    expiredTitle: 'Odkaz už neplatí',
    expired: typeset(`Odkaz platí ${INVOICING.linkHours} hodín a len raz. Ak ste účet už vytvorili, prihláste sa. Inak začnite znova.`),
    signIn: 'Prihlásiť sa',
    again: 'Začať znova',
    blocked: typeset(`Váš fakturačný účet je zablokovaný a nový teraz nevytvoríte. Ak ide o omyl, napíšte nám na ${BRAND.email}.`),
    client: typeset(`Táto firma už má vo ${BRAND.name} účet s účtovníctvom a faktúry vystavuje v ňom. Požiadajte jeho majiteľa o pozvánku, alebo sa prihláste.`),
    tooMany: typeset(`Na jednu e-\u2060mailovú adresu môže byť najviac ${INVOICING.workspacesPerUser} fakturačných účtov. Prihláste sa do niektorého z nich.`),
  },
  mail: {
    subject: `${BRAND.name}: dokončite registráciu fakturácie`,
    body: (link: string) =>
      [
        'Dobrý deň,',
        '',
        'registráciu bezplatnej fakturácie dokončíte jedným klikom na tento odkaz:',
        link,
        '',
        `Odkaz platí ${INVOICING.linkHours} hodín. Ak ste sa neregistrovali, tento e-mail ignorujte. Nič sa nevytvorí.`,
        '',
        BRAND.name,
      ].join('\n'),
  },
  features: {
    title: 'Všetko, čo faktúra potrebuje.',
    serif: 'Nič navyše.',
    items: [
      { title: 'QR kód na platbu', text: typeset('Odberateľ naskenuje PAY by square v bankovej aplikácii. Suma, IBAN aj variabilný symbol sa vyplnia samy.') },
      { title: 'PDF na jeden klik', text: typeset('Faktúru stiahnete v PDF. Na telefóne ju rovno pošlete cez Mail, WhatsApp alebo Správy.') },
      { title: 'Platitelia DPH aj neplatitelia', text: typeset('Sadzby 23, 19 a 5 %, prenesenie daňovej povinnosti, dodanie do EÚ, export aj služby do zahraničia.') },
      { title: 'Dobropisy a zálohové faktúry', text: typeset('Opravu vystavíte dobropisom. Pri zálohe vystavíme daňový doklad k prijatej platbe aj konečnú faktúru.') },
      { title: 'E-faktúra na rok 2027', text: typeset('Ku každej faktúre aj súbor e-\u2060faktúry vo formáte Peppol BIS 3.0, overený podľa jeho pravidiel. Odosielanie priamo z Firmony zapíname pred 1. 1. 2027.') },
      { title: 'Opakované faktúry', text: typeset('Nájom alebo mesačný paušál sa vystaví sám. Každý mesiac, štvrťrok alebo rok.') },
      { title: 'Odberateľ podľa IČO', text: typeset('Názov a adresu odberateľa doplníme z registra. Stálych odberateľov máte po ruke.') },
      { title: 'Vaše logo a číslovanie', text: typeset('Vlastný rad čísel, napríklad FA2026-0001, a Vaše logo na každej faktúre.') },
      { title: 'Cudzie meny', text: typeset('Faktúra v dolároch či korunách s kurzom ECB a DPH prepočítanou na eurá.') },
    ],
  },
  steps: {
    title: 'Prvá faktúra o minútu.',
    serif: 'Naozaj.',
    items: [
      { title: 'Zadajte IČO a e-\u2060mail', text: typeset('Firmu nájdeme v registri. Nemusíte nič prepisovať.') },
      { title: 'Kliknite na odkaz', text: typeset('V e-\u2060maile je odkaz, ktorý účet dokončí. Potom sa prihlasujete odtlačkom prsta alebo tvárou, bez hesla.') },
      { title: 'Vystavte faktúru', text: typeset('Doplníte IBAN, odberateľa a položky. PDF s QR kódom je hotové.') },
    ],
  },
  why: {
    title: 'Prečo zadarmo?',
    text: typeset(`${BRAND.name} je online účtovná služba pre slovenské firmy. Fakturáciu dávame zadarmo, aby ste nás spoznali bez rizika. Keď budete chcieť, povedieme Vám aj účtovníctvo od ${cheapest} € mesačne. Doterajšie faktúry Vám ostanú v aplikácii.`),
    link: 'Pozrieť účtovníctvo',
  },
  faq: {
    title: 'Časté otázky',
    items: [
      {
        q: 'Je to naozaj zadarmo?',
        a: typeset(`Áno. Vystavovanie faktúr nič nestojí a nepýtame platobnú kartu. Zarábame na vedení účtovníctva pre firmy, ktoré si ho objednajú. Ak by sa podmienky bezplatnej fakturácie niekedy zmenili, oznámime to najmenej 30 dní vopred a všetky faktúry si stiahnete.`),
      },
      { q: 'Kto môže fakturovať?', a: typeset('Každý podnikateľ s IČO: s. r. o., akciová spoločnosť aj živnostník. Platiteľ DPH aj neplatiteľ.') },
      {
        q: 'Pošlete faktúru odberateľovi za mňa?',
        a: typeset('Nie, a je to tak lepšie. Faktúru stiahnete v PDF alebo ju z telefónu pošlete sami, z vlastného e-\u2060mailu či cez WhatsApp. Odberateľ dostane aj odkaz, kde nájde PDF, QR kód na platbu a e-\u2060faktúru.'),
      },
      {
        q: 'Ako zistím, že odberateľ zaplatil?',
        a: typeset('Keď platba príde, označíte faktúru ako zaplatenú. Hneď vidíte, čo je po splatnosti, a pripomienku pošlete jedným klikom zo svojho e-\u2060mailu. Klientom nášho účtovníctva sa faktúry spárujú s platbami z banky samy.'),
      },
      {
        q: 'Je to e-\u2060faktúra podľa pravidiel od roku 2027?',
        a: typeset('Ku každej faktúre pripravíme súbor e-\u2060faktúry vo formáte Peppol BIS 3.0 a overujeme ho podľa pravidiel Peppol aj slovenských doplnení. Odosielanie priamo z Firmony cez sieť Peppol zapíname pred 1. 1. 2027.'),
      },
      {
        q: 'Kde sú moje údaje?',
        a: typeset('V Európskej únii. Nepredávame ich a nepoužívame na reklamu. Faktúry kedykoľvek stiahnete a účet zrušíte. Podľa zákona o účtovníctve si faktúry uchovávajte 10 rokov.'),
      },
      {
        q: 'Čo keď budem chcieť aj účtovníctvo?',
        a: typeset('V nastaveniach kliknete na Účtovníctvo s Firmony. Vašu firmu preveríme a ponúkneme presnú cenu. Po uzavretí zmluvy fakturujete v účte s účtovníctvom, kde sa faktúry samy spárujú s platbami, a číslovanie nastavíte tak, aby plynulo pokračovalo. Doterajšie faktúry Vám ostanú.'),
      },
    ],
  },
  terms: {
    title: 'Podmienky používania fakturácie',
    lead: typeset(`Znenie ${INVOICING.termsVersion.split('-').reverse().map(Number).join('. ')}. Platí pre bezplatnú fakturáciu v aplikácii ${BRAND.name}, nie pre vedenie účtovníctva.`),
    contact: 'Otázky k podmienkam nám napíšte na',
  },
  final: {
    title: 'Prvá faktúra o minútu.',
    serif: 'Zadarmo.',
    button: 'Začať zadarmo',
  },

  ai: {
    title: 'Faktúra z jednej vety',
    lead: typeset('Napíšte, čo fakturujete, a formulár vyplníme za Vás. Vy už len skontrolujete a vystavíte.'),
    label: 'Čo fakturujete',
    placeholder: '3 hodiny konzultácií po 50 € pre Zelený dvor, IČO 55012345, splatnosť 14 dní',
    privacy: typeset('Vetu spracuje softvér od spoločnosti Anthropic. Neukladáme ju. Faktúra sa nevystaví bez Vás.'),
    button: 'Vyplniť faktúru',
    done: typeset('Faktúru sme vyplnili podľa vety. Skontrolujte odberateľa, položky a sumy, potom ju vystavte.'),
    doneNoCustomer: typeset('Položky sme vyplnili podľa vety. Odberateľa doplňte podľa IČO alebo ho napíšte, potom faktúru skontrolujte a vystavte.'),
    errors: {
      short: 'Napíšte aspoň pár slov o tom, čo fakturujete.',
      unavailable: typeset('Softvér teraz nie je dostupný. Faktúru vyplníte aj ručne nižšie.'),
      limit: typeset('Dnes ste použili všetky návrhy z vety. Faktúru vyplníte aj ručne nižšie.'),
      failed: typeset('Z tejto vety sme faktúru nevedeli pripraviť. Skúste napísať, čo, koľko a za akú cenu fakturujete, alebo vyplňte formulár.'),
    },
  },

  // ---- The workspace in the app -------------------------------------------------------------------------------
  app: {
    plan: 'Fakturácia zadarmo',
    moved: typeset('Táto firma má už vo Firmony účet s účtovníctvom. Faktúry vystavujte v ňom, aby sa spárovali s platbami a číslovanie sa nezdvojilo. Účty prepnete vľavo hore.'),
    limit: typeset(`Dnes ste vystavili ${INVOICING.issuedPerDay} faktúr, čo je denný limit bezplatnej fakturácie. Ďalšie vystavíte zajtra; koncept môžete uložiť.`),
    nav: { invoices: 'Faktúry', customers: 'Odberatelia', settings: 'Nastavenia', add: 'Nová faktúra', addShort: 'Nová' },
    welcome: {
      title: 'Vitajte vo Firmony',
      lead: typeset('Ešte jedna vec a môžete fakturovať: číslo účtu, na ktorý Vám odberatelia zaplatia. Skontrolujte aj, či ste platiteľom DPH.'),
      button: 'Doplniť údaje firmy',
      ready: 'Všetko je pripravené.',
      readyLead: typeset('Vystavte prvú faktúru. PDF s QR kódom bude hotové hneď.'),
      first: 'Vystaviť prvú faktúru',
      register: typeset('Na faktúre má byť aj zápis v registri (obchodný alebo živnostenský register a číslo zápisu). Doplňte ho v nastaveniach.'),
    },
    settings: {
      title: 'Nastavenia fakturácie',
      lead: typeset('Tieto údaje sú na každej faktúre, ktorú vystavíte.'),
      firm: 'Údaje na faktúre',
      name: 'Obchodné meno',
      address: 'Sídlo alebo miesto podnikania',
      ico: 'IČO',
      icoFixed: typeset('IČO sa nemení. Pre inú firmu si vytvorte ďalší fakturačný účet.'),
      dic: 'DIČ',
      icdph: 'IČ DPH',
      register: 'Zápis v registri',
      registerHint: typeset('Napríklad: Obchodný register Mestského súdu Košice, oddiel Sro, vložka č. 12345/V. Živnostník: Živnostenský register Okresného úradu Košice, č. 820-12345.'),
      vatPayer: 'Som platiteľ DPH',
      vatPayerHint: typeset('Platiteľ vyberá pri každej položke sadzbu DPH. Neplatiteľ ju na faktúre neuvádza.'),
      payments: 'Platby',
      iban: 'IBAN, na ktorý Vám zaplatia',
      dueDays: 'Splatnosť faktúr v dňoch',
      save: 'Uložiť',
      saved: 'Uložené. Platí pre ďalšie faktúry.',
      numbering: 'Číslovanie a logo',
      numberingLead: typeset('Vlastný rad čísel faktúr a Vaše logo.'),
      numberingLink: 'Nastaviť číslovanie a logo',
      onlyOwner: 'Údaje mení majiteľ účtu.',
      registerLocked: typeset('Obchodné meno a zápis v registri preberáme z registra právnických osôb. Keď sa v registri zmenia, načítajte ich znova.'),
      registerReload: 'Načítať znova z registra',
      registerDone: 'Údaje sme načítali z registra.',
      errors: {
        registerDown: typeset('Register právnických osôb teraz neodpovedá. Skúste to o chvíľu.'),
        registerMissing: typeset(`Register už toto IČO nepozná alebo firma zanikla. Napíšte nám na ${BRAND.email}.`),
        name: 'Napíšte obchodné meno.',
        address: 'Napíšte adresu.',
        ico: 'IČO má 6 až 8 číslic.',
        dic: 'DIČ má 10 číslic.',
        icdph: 'IČ DPH je SK a 10 číslic.',
        iban: 'Tento IBAN nie je správny. Skontrolujte, prosím, číslice.',
        dueDays: 'Splatnosť je 0 až 365 dní.',
        vatId: typeset('Platiteľ DPH uvádza na faktúre IČ DPH.'),
        summary: 'Skontrolujte, prosím, vyznačené polia.',
      },
    },
    accounting: {
      title: 'Účtovníctvo s Firmony',
      lead: typeset(`Keď nechcete riešiť účtovníctvo, DPH ani dane, povedieme ho za Vás od ${cheapest} € mesačne. Doterajšie faktúry Vám ostanú a v číslovaní plynulo pokračujete.`),
      button: 'Nezáväzne preveriť moju firmu',
    },
    download: {
      title: 'Stiahnuť všetky faktúry',
      lead: typeset('Jeden ZIP za rok: každá faktúra ako PDF a ako e-faktúra na import do účtovného programu, a zoznam pre Excel. Hodí sa pre účtovníka aj na archív.'),
      year: (year: string) => `Rok ${year}`,
      none: typeset('Keď vystavíte prvú faktúru, stiahnete si ich tu.'),
      throttle: typeset('Faktúry ste sťahovali už veľakrát za poslednú hodinu. Skúste to o chvíľu.'),
    },
    remove: {
      title: 'Zrušiť fakturačný účet',
      lead: typeset('Zmažeme všetky faktúry a údaje tohto účtu. Najprv si faktúry stiahnite (vyššie, Stiahnuť všetky faktúry): podľa zákona o účtovníctve ich máte uchovávať 10 rokov.'),
      confirm: 'Na potvrdenie napíšte ZRUŠIŤ',
      button: 'Zrušiť účet a zmazať faktúry',
      error: 'Na potvrdenie napíšte presne ZRUŠIŤ.',
      onlyOwner: 'Účet ruší jeho majiteľ.',
      done: 'Fakturačný účet sme zrušili a údaje zmazali.',
      failed: typeset(`Účet teraz nemožno zrušiť. Napíšte nám, prosím, na ${BRAND.email} a vyriešime to.`),
    },
    customers: {
      title: 'Odberatelia',
      lead: typeset('Z Vašich faktúr. Ďalšiu faktúru vystavíte jedným klikom.'),
      empty: typeset('Zatiaľ tu nikto nie je. Odberateľa pridáte s prvou faktúrou.'),
      first: 'Vystaviť prvú faktúru',
      name: 'Odberateľ',
      count: 'Faktúry',
      invoiced: 'Fakturované',
      open: 'Neuhradené',
      last: 'Posledná',
      action: 'Nová faktúra',
      ico: (ico: string) => `IČO ${ico}`,
    },
    paid: {
      title: 'Platba',
      lead: typeset('Keď peniaze prídu na účet, označte faktúru ako zaplatenú.'),
      leadProforma: typeset('Keď záloha príde na účet, označte ju. Daňový doklad k prijatej platbe vystavíme hneď.'),
      day: 'Dátum úhrady',
      mark: 'Označiť ako zaplatenú',
      markProforma: 'Záloha prijatá',
      marked: (day: string) => typeset(`Zaplatená ${day}.`),
      undo: 'Zrušiť označenie',
      undoBlocked: typeset('K zálohe je vystavený daňový doklad. Označenie už nezrušíte; prípadný rozdiel opravte dobropisom.'),
      advance: (n: string) => `Daňový doklad k prijatej platbe ${n}`,
      errors: { day: typeset('Napíšte dátum úhrady, napríklad 26. 10. 2026. Nesmie byť v budúcnosti ani pred vystavením.') },
      flash: 'Faktúra je označená ako zaplatená.',
      flashAdvance: typeset('Záloha je prijatá a daňový doklad k nej je vystavený.'),
      flashUndo: 'Označenie platby je zrušené.',
    },
  },
}

/** The terms of use of invoicing, numbered, as /fakturacia/podmienky shows them. */
export const INVOICING_TERMS: { title: string; points: string[] }[] = [
  {
    title: 'Úvod',
    points: [
      typeset(`Tieto podmienky upravujú bezplatné používanie fakturácie v aplikácii ${BRAND.name} (ďalej „fakturácia“). Poskytuje ju spoločnosť ${OPERATOR.name}, ${OPERATOR.street}, ${OPERATOR.postalCity}, IČO ${OPERATOR.companyId}, zapísaná ${OPERATOR.registeredIn} (ďalej „my“). Používateľom je podnikateľ, ktorý si fakturačný účet vytvoril (ďalej „Vy“).`),
      typeset('Fakturácia nie je vedenie účtovníctva ani daňové poradenstvo. Vedenie účtovníctva sa uzatvára samostatnou zmluvou.'),
    ],
  },
  {
    title: 'Čo fakturácia je',
    points: [
      typeset('Vystavíte v nej faktúry, dobropisy, zálohové faktúry, daňové doklady k prijatým platbám a faktúry úrokov z omeškania. Ku každej pripravíme PDF, odkaz pre odberateľa a súbor e-\u2060faktúry.'),
      typeset('Faktúry odberateľom neposielame. Posielate ich Vy, stiahnutým PDF alebo odkazom.'),
      typeset('Fakturácia je bezplatná. Ak by sme jej rozsah alebo bezplatnosť zmenili, oznámime to v aplikácii najmenej 30 dní vopred. Počas tejto lehoty si všetky faktúry stiahnete.'),
    ],
  },
  {
    title: 'Vaša zodpovednosť',
    points: [
      typeset('Za obsah faktúr zodpovedáte Vy: údaje o sebe a odberateľovi, sumy, sadzby DPH, dátumy a spôsob zdanenia. Aplikácia počíta sumy a dopĺňa náležitosti podľa toho, čo zadáte; nepreveruje, či zodpovedajú skutočnosti.'),
      typeset('Faktúry vystavujete len vo vlastnom mene alebo v mene podnikateľa, ktorý Vás na to oprávnil. Fakturácia sa nesmie použiť na podvod, klamanie odberateľov ani obchádzanie zákona.'),
      typeset('Faktúry a ich e-\u2060faktúry uchovávate sami po dobu, ktorú vyžaduje zákon (spravidla 10 rokov podľa § 35 zákona o účtovníctve). Aplikácia nie je archívom podľa zákona.'),
    ],
  },
  {
    title: 'Primerané používanie',
    points: [
      typeset(`Na ochranu služby platia technické limity, napríklad najviac ${INVOICING.issuedPerDay} vystavených faktúr za deň v jednom účte. Pri bežnom podnikaní ich nedosiahnete.`),
      typeset('Účet, ktorý sa zjavne zneužíva, môžeme obmedziť alebo zrušiť. Ak to nie je nevyhnutné hneď, vopred Vám to oznámime v aplikácii.'),
    ],
  },
  {
    title: 'Osobné údaje',
    points: [
      typeset('Údaje Vášho účtu spracúvame ako prevádzkovateľ podľa informácie o ochrane osobných údajov. Osobné údaje odberateľov na faktúrach spracúvame ako sprostredkovateľ podľa čl. 28 GDPR, len aby fakturácia fungovala: uložíme ich, zobrazíme Vám a Vašim odberateľom cez odkaz a zmažeme so zrušením účtu.'),
      typeset('Ďalšími sprostredkovateľmi sú Cloudflare, Inc. (servery, databáza a súbory v Európskej únii) a pri Faktúre z jednej vety Anthropic, PBC (USA), ktorej odovzdáme iba napísanú vetu na vyplnenie formulára; prenos do USA chránia štandardné zmluvné doložky Európskej komisie. S ich zapojením súhlasíte. O zmene sprostredkovateľov Vás vopred informujeme v aplikácii a môžete ju odmietnuť zrušením účtu.'),
      typeset('Údaje sú uložené v Európskej únii. Nepredávame ich a nepoužívame na reklamu.'),
    ],
  },
  {
    title: 'Zrušenie',
    points: [
      typeset('Účet zrušíte kedykoľvek v nastaveniach. Zmažeme ho aj so všetkými faktúrami. Odkazy, ktoré ste poslali odberateľom, prestanú fungovať.'),
      typeset('Fakturácia sa poskytuje tak, ako je. Za škodu zodpovedáme len podľa zákona, za ušlý zisk nezodpovedáme, ak zákon nestanovuje inak.'),
      typeset('Vzťahy neupravené týmito podmienkami sa spravujú slovenským právom, najmä Obchodným zákonníkom.'),
    ],
  },
]
