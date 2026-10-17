// The terms a client accepts when the contract is concluded online: the contract for keeping the accounts between
// europio s. r. o. and a company, with the agreement on processing personal data (GDPR, art. 28) as its article 8.
// A B2B proposal under the Commercial Code (§ 269 ods. 2), awaiting lawyer and underwriter approval. Signing
// is closed without CONTRACT_RELEASE and an order review. Old contracts keep their original wording. The checks
// hold every such reference to a point that exists. Bump TERMS_VERSION with every change of the wording.
import { APP, BRAND, OPERATOR, ORDER, PLANS, REPLY_WITHIN, TERMS_VERSION } from '../config'
import { typeset } from '../format'

export interface TermsSection {
  title: string
  points: string[]
}

const MONTHS_OF = ['januára', 'februára', 'marca', 'apríla', 'mája', 'júna', 'júla', 'augusta', 'septembra', 'októbra', 'novembra', 'decembra']

/** "13. októbra 2026" for a YYYY-MM-DD. */
export function longDate(day: string): string {
  return `${Number(day.slice(8, 10))}. ${MONTHS_OF[Number(day.slice(5, 7)) - 1] ?? ''} ${day.slice(0, 4)}`
}

export const TERMS_TITLE = `Obchodné podmienky služby ${BRAND.name}`
export const TERMS_SUBTITLE = `Zmluva o vedení účtovníctva medzi spoločnosťou ${OPERATOR.name} a klientom. Znenie z ${longDate(TERMS_VERSION)}.`

const domain = new URL(BRAND.origin).hostname

const SECTIONS: TermsSection[] = [
  {
    title: 'Zmluvné strany a uzavretie zmluvy',
    points: [
      `Službu ${BRAND.name} poskytuje spoločnosť ${OPERATOR.name}, so sídlom ${OPERATOR.street}, ${OPERATOR.postalCity}, IČO ${OPERATOR.companyId}, DIČ ${OPERATOR.taxId}, zapísaná ${OPERATOR.registeredIn} (ďalej „my“ alebo „poskytovateľ“).`,
      'Klientom je obchodná spoločnosť, ktorá si službu objedná a v mene ktorej koná jej konateľ (ďalej „Vy“ alebo „klient“).',
      `Zmluva vzniká, keď konateľ klienta na stránke objednávky potvrdí tieto podmienky tlačidlom „Uzavrieť zmluvu“. Zmluvu tvorí objednávka (firma, balík, cena a deň začiatku) a tieto podmienky. Zmluvu aj podmienky v znení, s ktorým bola uzavretá, nájdete v aplikácii ${BRAND.name}, kde si ich môžete kedykoľvek pozrieť, uložiť a vytlačiť.`,
      'Zmluvu uzatvárajú podnikatelia pri svojej podnikateľskej činnosti a riadi sa Obchodným zákonníkom (§ 269 ods. 2). Predpisy na ochranu spotrebiteľa sa na ňu nevzťahujú.',
    ],
  },
  {
    title: 'Čo pre Vás robíme',
    points: [
      'Vedieme Vaše účtovníctvo v sústave podvojného účtovníctva podľa zákona č. 431/2002 Z. z. o účtovníctve, z dokladov, ktoré nám dodáte, a z pohybov na Vašich bankových účtoch.',
      'Podľa objednaného balíka ďalej pripravujeme a podávame priznania k DPH, kontrolné a súhrnné výkazy a pri registrácii podľa § 7a zákona o DPH priznania za mesiace, v ktorých vznikne povinnosť ich podať. Spracúvame mzdy, odvody, hlásenia a prehľady o preddavkoch na daň zamestnancov v pracovnom pomere s mesačnou mzdou, ktorých nám nahlásite. Dohody o prácach vykonávaných mimo pracovného pomeru, odmeny konateľov a iné príjmy spracujeme len po dohode podľa bodu 2.6.',
      'Raz ročne, za cenu podľa cenníka, zostavíme účtovnú závierku mikro účtovnej jednotky a pripravíme a podáme daňové priznanie k dani z príjmov právnickej osoby. Závierku inej účtovnej jednotky urobíme len po dohode podľa bodu 2.6.',
      `K službe patrí aplikácia ${BRAND.name}: pridávanie dokladov, pohyby na účtoch, vystavovanie faktúr, termíny a správy s účtovníčkou. Na otázky k Vášmu účtovníctvu odpovedáme ${REPLY_WITHIN}.`,
      'Prácu vykonávajú naši účtovníci vrátane externých spolupracovníkov. Za ich prácu zodpovedáme, akoby sme ju vykonali sami. Doklady čítame aj pomocou umelej inteligencie a výsledok vždy kontroluje človek.',
      'Nie sme daňoví poradcovia a daňové poradenstvo neposkytujeme. Služba nezahŕňa audit, znalecké posudky, zastupovanie v daňovej kontrole nad rámec predloženia podkladov, účtovníctvo za obdobia pred dňom začiatku ani opravu chýb z čias pred nami. Tieto práce urobíme len po dohode, za cenu dohodnutú vopred.',
    ],
  },
  {
    title: 'Čo potrebujeme od Vás',
    points: [
      `Doklady za každý mesiac nám dodáte najneskôr do ${APP.docsByDay}. dňa nasledujúceho mesiaca, v aplikácii alebo preposlaním na adresu Vašej firmy pre doklady, ktorú v aplikácii nájdete. Doklady musia byť úplné, čitateľné a musia zodpovedať skutočnosti.`,
      'Umožníte nám vidieť pohyby na účtoch firmy, a to prepojením banky v aplikácii alebo výpismi z banky.',
      'Konateľ podpíše plnú moc, aby sme Vás mohli zastupovať pred finančnou správou, a ak spracúvame mzdy, aj pred Sociálnou poisťovňou a zdravotnými poisťovňami.',
      'Bez zbytočného odkladu nám oznámite zmeny, ktoré sa týkajú účtovníctva a daní (napríklad registráciu pre DPH, nového zamestnanca alebo zmenu sídla), a na naše otázky odpoviete spravidla do piatich pracovných dní.',
      'Za to, že doklady a údaje sú pravdivé a úplné, zodpovedáte Vy. Za vedenie účtovníctva podľa zákona zodpovedá účtovná jednotka, teda Vaša firma, aj keď ho vedieme my.',
      'Ak chýbajú podklady alebo informácie, bez zbytočného odkladu Vás upozorníme, čo chýba, na dotknutý termín a na možné následky. Dohodneme zákonný postup nápravy; nebudeme vedome podávať nesprávne údaje. Vplyv Vašej súčinnosti na prípadnú škodu sa posudzuje podľa bodu 6.4, nie automatickým vylúčením našej zodpovednosti.',
    ],
  },
  {
    title: 'Cena a platby',
    points: [
      `Mesačná cena je cena Vášho balíka podľa cenníka na stránke ${domain} v deň uzavretia zmluvy a je uvedená v objednávke. Za mzdy sa k nej pripočíta cena podľa cenníka za každého človeka, ktorého firma v danom mesiaci zamestnávala. Ceny sú bez DPH. Kým nie sme platiteľom DPH, DPH nepripočítavame; keď sa ním staneme, pripočítame ju v zákonnej sadzbe.`,
      `Každý balík je určený pre počet dokladov za mesiac uvedený v cenníku. Rátajú sa doklady, ktoré v danom mesiaci pribudli v aplikácii, vrátane faktúr, ktoré ste v nej vystavili; nerátame ten istý doklad poslaný dvakrát, vymazaný doklad ani naše faktúry Vám. Mesiac, v ktorom ich bude viac, vyúčtujeme ako najbližší vyšší balík. Ak ich bude viac ako ${PLANS[PLANS.length - 1]?.docs ?? 0} za mesiac, dohodneme sa na cene; kým sa nedohodneme, účtujeme cenu najvyššieho balíka, a ak sa nedohodneme, môžeme zmluvu vypovedať.`,
      'Cenu balíka fakturujeme mesačne vopred. Mzdy a rozdiel za mesiac vyúčtovaný ako vyšší balík fakturujeme za uplynulý mesiac na tej istej faktúre. Závierku a daňové priznanie fakturujeme po ich podaní. Faktúry sú splatné do 14 dní prevodom na účet uvedený na faktúre a nájdete ich v aplikácii.',
      'Práce mimo balíka podľa bodu 2.6 fakturujeme podľa dohody.',
      'Ak ste v omeškaní s platbou viac ako 30 dní, môžeme po upozornení v aplikácii najmenej 10 dní vopred pozastaviť prácu až do zaplatenia. Za následky pozastavenia nezodpovedáme. Pri omeškaní môžeme požadovať úrok z omeškania podľa Obchodného zákonníka.',
      'Ceny môžeme zmeniť. Zmenu oznámime v aplikácii najmenej 30 dní vopred. Ak so zmenou nesúhlasíte, môžete zmluvu vypovedať ku dňu, keď má zmena nastať.',
    ],
  },
  {
    title: 'Začiatok a prechod od doterajšej účtovníčky',
    points: [
      'Služba začína dňom uvedeným v objednávke, vždy prvým dňom mesiaca. Účtovníctvo vedieme za obdobia od tohto dňa.',
      'Ak prechádzate od inej účtovníčky alebo kancelárie, pripravíme Vám výpoveď a žiadosť o odovzdanie podkladov a prevezmeme počiatočné stavy. Za správnosť účtovníctva za obdobia pred dňom začiatku nezodpovedáme. Účtovnú závierku za rok pred dňom začiatku robí doterajšia účtovníčka, ak sa nedohodneme inak.',
    ],
  },
  {
    title: 'Zodpovednosť',
    points: [
      'Za riadne a včasné vykonanie dohodnutých služieb zodpovedáme podľa zmluvy a právnych predpisov vrátane § 373 a nasl. Obchodného zákonníka. Použitie softvéru, umelej inteligencie alebo našich spolupracovníkov samo osebe túto zodpovednosť nevylučuje. Zákonná zodpovednosť účtovnej jednotky podľa bodu 3.5 tým nie je dotknutá.',
      'Ak porušením našej povinnosti spôsobíme Vašej firme škodu, nahradíme ju v zákonnom rozsahu. To zahŕňa aj preukázanú pokutu alebo úrok uložený Vašej firme, ak za túto škodu zodpovedáme a jej náhradu právny predpis pripúšťa. Posudzuje sa konkrétna povinnosť, jej porušenie, príčinná súvislosť a výška škody; nejde o prevzatie všetkých sankcií bez ohľadu na príčinu.',
      'Daň alebo odvod, ktorý by ste museli zaplatiť aj pri správnom postupe, sám osebe nie je škodou spôsobenou našou chybou. Tým sa nevylučuje posúdenie nezvratnej straty zákonného nároku, napríklad odpočtu, ktorú spôsobilo porušenie našej povinnosti. Predvídateľnosť a rozsah škody sa posudzujú podľa zákona; tieto podmienky nestanovujú paušálny limit vo výške mesačných poplatkov.',
      'Nesprávne alebo oneskorené podklady, pokyn klienta či výpadok tretej strany zohľadníme len podľa ich preukázaného vplyvu a právnych predpisov. Nie sú všeobecným zbavením našej povinnosti odborne kontrolovať dohodnutý rozsah, včas upozorniť a predchádzať škode. Náhrada sa neposkytuje dvakrát za tú istú škodu; prípadné spoluspôsobenie a povinnosť škodu zmierniť sa posudzujú podľa zákona.',
      'Pri zistení chyby zabezpečíme bezodkladnú ochranu lehôt, preverenie a nápravu v našom rozsahu bez ďalšej odmeny. Oznámite nám rozhodnutie úradu, známe okolnosti a podklady bez zbytočného odkladu; neskoršie oznámenie samo osebe neruší Váš nárok. O jeho vplyve na škodu rozhodujú okolnosti a zákon. Chránime Vaše právo na opravné prostriedky; oznámenie škody nenahrádza ich podanie ani neodkladá úhradu povinnosti úradu.',
      'Poistné krytie a prípadné osobitné zabezpečenie preukazujeme iba v skutočne dohodnutom rozsahu. Rozhodnutie poisťovne ani jej limit nemenia našu zákonnú alebo zmluvnú povinnosť nahradiť škodu. Všeobecné poistenie samo osebe neznamená krytie každej sankcie alebo osobitnej garancie. Širšie záruky, individuálny rozsah alebo zabezpečenie platia len podľa osobitnej písomnej dohody.',
    ],
  },
  {
    title: 'Aplikácia, Vaše údaje a mlčanlivosť',
    points: [
      'Prístup do aplikácie majú ľudia, ktorých pozvete. Za ich konanie v aplikácii zodpovedáte Vy. Prístup chráňte a podozrenie na jeho zneužitie nám hneď oznámte.',
      'Doklady a účtovníctvo sú Vaše. Po skončení zmluvy Vám ich odovzdáme podľa bodu 10.4.',
      'O všetkom, čo sa o Vás a Vašej firme dozvieme, zachovávame mlčanlivosť, aj po skončení zmluvy. Neplatí to tam, kde nám povinnosť ukladá zákon (bod 9.3).',
      'Vaše doklady a údaje nepoužívame na trénovanie modelov umelej inteligencie a nikomu ich nedávame na iné účely.',
    ],
  },
  {
    title: 'Spracúvanie osobných údajov v mene klienta',
    points: [
      'Na dokladoch, v mzdách a v účtovníctve sú osobné údaje Vašich zamestnancov, obchodných partnerov a ďalších ľudí. Ich prevádzkovateľom ste Vy a my sme sprostredkovateľom podľa článku 28 nariadenia (EÚ) 2016/679 (GDPR). Tento článok je zmluvou o spracúvaní osobných údajov.',
      'Predmetom a účelom spracúvania je vedenie účtovníctva, daní a miezd podľa zmluvy, po dobu jej trvania. Spracúvame identifikačné a kontaktné údaje, údaje na dokladoch a o platbách a pri mzdách pracovnoprávne a mzdové údaje vrátane údajov o pracovnej neschopnosti. Dotknutými osobami sú zamestnanci, konatelia a spoločníci a obchodní partneri, ktorí sú fyzickými osobami.',
      'Údaje spracúvame len na Váš pokyn. Pokynom je táto zmluva a to, čo nám zadáte v aplikácii. Ak by bol pokyn v rozpore s právom, upozorníme Vás.',
      'Ľudia, ktorí s údajmi pracujú, sú viazaní mlčanlivosťou. Údaje chránime primeranými opatreniami: šifrovaným spojením, prístupom len pre oprávnených ľudí a databázou a súbormi uloženými v Európskej únii.',
      'Využívame ďalších sprostredkovateľov a dávate nám na to všeobecný súhlas: Cloudflare, Inc. (servery, databáza, súbory a e-maily, údaje uložené v Európskej únii), Anthropic, PBC (čítanie dokladov umelou inteligenciou v USA na základe štandardných zmluvných doložiek, bez použitia na trénovanie), Enable Banking Oy (čítanie pohybov na účtoch s Vaším súhlasom, Fínsko) a našich externých účtovníkov (Slovensko). O pridaní alebo výmene sprostredkovateľa Vás vopred informujeme v aplikácii. Môžete namietať, a ak sa nedohodneme, zmluvu vypovedať.',
      'Pomôžeme Vám pri vybavovaní žiadostí dotknutých osôb, pri zabezpečení údajov a pri oznamovaní porušenia ich ochrany. O porušení ochrany Vašich údajov Vás upovedomíme bez zbytočného odkladu, najneskôr do 48 hodín od jeho zistenia.',
      'Na požiadanie Vám poskytneme informácie, ktoré preukazujú, že povinnosti sprostredkovateľa plníme, a po predchádzajúcej dohode umožníme primeranú kontrolu.',
      'Po skončení zmluvy Vám údaje vrátime podľa bodu 10.4. Vymažeme ich po uplynutí 90 dní od skončenia, keď potvrdíte, že ste ich prevzali, inak rok po skončení zmluvy; otvorený prípad alebo podanie, ktoré ešte nie je vybavené, výmaz odloží. Ponecháme len zmluvu, plnú moc a údaje z Vašej identifikácie podľa bodu 9.1, ktoré musíme uchovávať päť rokov od skončenia zmluvy, a potom ich vymažeme tiež.',
    ],
  },
  {
    title: 'Ochrana pred legalizáciou príjmov z trestnej činnosti',
    points: [
      'Ako poskytovateľ účtovných služieb sme povinnou osobou podľa zákona č. 297/2008 Z. z. Pred začatím spolupráce a počas nej musíme identifikovať a overiť Vašu firmu, jej konateľa a konečných užívateľov výhod a poznať účel a povahu obchodného vzťahu.',
      'Konateľ nám v aplikácii vyplní údaje o sebe, o konečných užívateľoch výhod a o činnosti firmy a ich zmeny nám tam bez zbytočného odkladu oznámi. Jeho totožnosť overíme z plnej moci podpísanej kvalifikovaným elektronickým podpisom (občiansky preukaz s čipom); inak Vás požiadame o iný spôsob, ktorý zákon pripúšťa. Bez identifikácie službu začať nemôžeme.',
      'Ak to zákon vyžaduje, môžeme spoluprácu odmietnuť alebo ukončiť. Neobvyklú obchodnú operáciu sme povinní ohlásiť a o ohlásení Vás informovať nesmieme.',
    ],
  },
  {
    title: 'Trvanie a skončenie zmluvy',
    points: [
      'Zmluva sa uzatvára na dobu neurčitú.',
      'Každá strana ju môže vypovedať aj bez udania dôvodu: Vy v aplikácii v časti Firma a nastavenia, my správou v aplikácii. Výpovedná lehota je jeden mesiac a začína plynúť prvým dňom mesiaca nasledujúceho po doručení výpovede. Výpoveď, ktorú ste podali v aplikácii, tam môžete do konca výpovednej lehoty vziať späť; s takým späťvzatím vopred súhlasíme.',
      'Od zmluvy môžeme odstúpiť, ak ste v omeškaní s platbou viac ako 60 dní, ak nám ani po upozornení opakovane nedodávate doklady, alebo z dôvodov podľa bodu 9.3. Vy môžete od zmluvy odstúpiť, ak ani po upozornení opakovane porušujeme svoje povinnosti.',
      'Po skončení zmluvy dokončíme práce za obdobia, za ktoré ste zaplatili; doklady a platby za posledný mesiac zmluvy prijímame ešte 10 dní po jej skončení. Do 30 dní od skončenia Vám v aplikácii odovzdáme účtovníctvo a jeho export v bežnom formáte a vzdáme sa plnej moci. Všetky doklady, platby, faktúry a správy si v aplikácii stiahnete kedykoľvek, za každý rok ako jeden súbor, a ich prevzatie tam potvrdíte. Prístup do aplikácie trvá, kým údaje nevymažeme podľa bodu 8.8. Doklady a účtovníctvo ste povinní uchovávať Vy. Závierku za rok, v ktorom zmluva skončila, urobíme len po dohode.',
    ],
  },
  {
    title: 'Komunikácia a záverečné ustanovenia',
    points: [
      'Komunikujeme správami v aplikácii a všetko, čo si podľa zmluvy oznamujeme, si oznamujeme tam. O novej správe Vás upozorníme e-mailom na adresu, ktorou sa prihlasujete; upozornenie obsah správy nenesie. Správa sa považuje za doručenú nasledujúci pracovný deň po tom, ako bola v aplikácii zverejnená.',
      'Tieto podmienky môžeme zmeniť. Zmenu oznámime v aplikácii najmenej 30 dní vopred. Ak so zmenou nesúhlasíte, môžete zmluvu vypovedať ku dňu, keď zmena nadobúda účinnosť; inak platí zmenené znenie.',
      'Zmluva sa riadi právom Slovenskej republiky. Spory riešia súdy Slovenskej republiky.',
      'Ak by niektoré ustanovenie bolo neplatné, ostatné platia ďalej a strany ho nahradia platným ustanovením s čo najbližším účelom.',
    ],
  },
]

/** The sections, typeset once, as the page and the confirmation show them. */
export const TERMS: readonly TermsSection[] = SECTIONS.map((s) => ({ title: typeset(s.title), points: s.points.map((p) => typeset(p)) }))

/** The terms as plain text, numbered as the contract refers to them (the unit checks read them this way). */
export function termsText(): string {
  const lines = [TERMS_TITLE, TERMS_SUBTITLE.replace(/ /g, ' '), '']
  SECTIONS.forEach((section, i) => {
    lines.push(`${i + 1}. ${section.title}`)
    section.points.forEach((point, j) => lines.push(`${i + 1}.${j + 1} ${point}`))
    lines.push('')
  })
  return lines.join('\n').trim()
}

/** Every "bod 2.6" in the terms, with whether such a point exists (the unit checks hold it). */
export function termsReferences(): { ref: string; exists: boolean }[] {
  const out: { ref: string; exists: boolean }[] = []
  for (const section of SECTIONS) {
    for (const point of section.points) {
      for (const m of point.matchAll(/bod[ue]? (\d+)\.(\d+)/g)) {
        const i = Number(m[1]) - 1
        const j = Number(m[2]) - 1
        out.push({ ref: `${m[1]}.${m[2]}`, exists: Boolean(SECTIONS[i]?.points[j]) })
      }
    }
  }
  return out
}

/** The first day of each month a client can choose to start in, from the next month and never before the launch. */
export function startMonths(today: string): string[] {
  let [y, m] = today.slice(0, 7).split('-').map(Number) as [number, number]
  m += 1
  if (m > 12) {
    m = 1
    y += 1
  }
  const [fy, fm] = ORDER.firstMonth.split('-').map(Number) as [number, number]
  if (y < fy || (y === fy && m < fm)) {
    y = fy
    m = fm
  }
  const out: string[] = []
  for (let k = 0; k < ORDER.startMonths; k++) {
    out.push(`${y}-${String(m).padStart(2, '0')}-01`)
    m += 1
    if (m > 12) {
      m = 1
      y += 1
    }
  }
  return out
}
