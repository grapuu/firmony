// The contract a founder signs for the s. r. o. for 1 € (his word of 28 October 2026: a founder must not be able to have
// the company formed at our cost and then go silent, and we must never be at a loss when he leaves after a month or two):
// the formation through an advocate for 1 €, a deposit of 549 € paid before anything is ordered and held like a rent
// deposit (credited to the commitment's last months, or to what is owed when it ends sooner), the accounting of the
// company paid monthly from its first month for at least 36 months, the exit fee, and the founder's guarantee. A proposal for the lawyer, who checks the wording; the structure is what the product does.
//
// Read in the original on 28 October 2026, the Commercial Code as in force from 17 August 2026
// (https://static.slov-lex.sk/static/SK/ZZ/1991/513/20260817.html):
// - § 57 ods. 1 and 3: the founding document of a sole founder is a notarial record or a document authorised by an
//   advocate; § 57 ods. 2: a founder may act through a proxy whose power of attorney bears an officially certified
//   signature.
// - § 64 ods. 1: who acts on behalf of a company before it arises is bound jointly and severally; approved by the
//   company within three months of its formation, the company is bound from the beginning. § 64 ods. 2: other
//   obligations than those connected with its formation only under the suspensive condition of that approval.
// - § 303: who declares in writing to a creditor that he will satisfy him if the debtor does not, becomes the guarantor;
//   § 304 ods. 2: a future obligation can be guaranteed; § 306 ods. 1: the guarantor is asked only after the debtor
//   did not pay within a reasonable time after a written call.
// The court fee for the first registration stays 220 € from 17 August 2026 (podnikajte.sk, read 28 October 2026); an
// advocate's fixed fee for the formation was 300 € without VAT (aksamec.sk, read the same day): `FORMATION.valueCents`.
// Open for the lawyer: whether a founder before the company exists is a consumer (CJEU C-269/95 Benincasa holds that a
// contract for a future trade is not a consumer's), the exit fee as a lump sum of the months left (at most twelve), and the
// approval under § 64 ods. 1 given in the app by a sole shareholder who is also the managing director.
import { BRAND, FORMATION, OPERATOR, TERMS_VERSION } from '../config'
import { formatEur as eur, typeset } from '../format'
import { longDate, type TermsSection } from './terms'

/** What the contract names: the founder, the company to be formed and the plan; the payment's account and symbol. */
export interface FormationParties {
  founder: { name: string; born: string; address: string }
  company: { name: string; seat: string; capitalCents: number; activities: readonly string[] }
  plan: { name: string; priceCents: number }
  payment: { iban: string; vs: string }
}

export const FORMATION_CONTRACT_TITLE = 'Zmluva o zabezpečení založenia spoločnosti a o vedení účtovníctva'

/** The contract's articles for these parties, numbered as the page and its references show them. */
export function formationContract(p: FormationParties, version = FORMATION.contractVersion): TermsSection[] {
  const value = eur(FORMATION.valueCents)
  const total = eur(FORMATION.priceCents + FORMATION.prepaidCents)
  const sections: TermsSection[] = [
    {
      title: 'Zmluvné strany',
      points: [
        `Poskytovateľ: ${OPERATOR.name}, so sídlom ${OPERATOR.street}, ${OPERATOR.postalCity}, IČO ${OPERATOR.companyId}, DIČ ${OPERATOR.taxId}, zapísaná ${OPERATOR.registeredIn}, prevádzkovateľ služby ${BRAND.name} (ďalej „my“ alebo „poskytovateľ“).`,
        `Zakladateľ: ${p.founder.name}, narodený(á) ${p.founder.born}, trvalý pobyt ${p.founder.address} (ďalej „Vy“ alebo „zakladateľ“). Zmluvu uzatvárate vo vlastnom mene a zároveň v mene spoločnosti ${p.company.name}, ktorá ešte nevznikla (ďalej „spoločnosť“), podľa § 64 Obchodného zákonníka.`,
        'Zmluvu uzatvárate ako budúci jediný spoločník a konateľ spoločnosti pri príprave jej podnikania. Riadi sa Obchodným zákonníkom (§ 269 ods. 2).',
      ],
    },
    {
      title: 'Čo zabezpečíme',
      points: [
        `Zabezpečíme založenie spoločnosti s ručením obmedzeným s údajmi z Vašej prihlášky: obchodné meno ${p.company.name}, sídlo ${p.company.seat}, základné imanie ${eur(p.company.capitalCents)}, Vy ako jediný spoločník a konateľ, predmet podnikania: ${p.company.activities.join('; ')}.`,
        'Založenie urobí advokát, s ktorým spolupracujeme: zakladateľskú listinu autorizovanú advokátom (§ 57 ods. 3 Obchodného zákonníka), ohlásenie voľných živností a elektronický návrh na zápis do obchodného registra. Právne služby Vám poskytuje advokát na základe Vašej plnej moci; my nie sme advokátska kancelária a právne služby neposkytujeme.',
        `Odmenu advokáta za tieto úkony a súdny poplatok za prvý zápis do obchodného registra platíme my. Za zabezpečenie založenia zaplatíte ${eur(FORMATION.priceCents)}. Hodnota založenia (súdny poplatok 220 € a odmena advokáta 300 € bez DPH) je na účely tejto zmluvy ${value}.`,
        'Založenie nezahŕňa základné imanie (sú to peniaze spoločnosti, ktoré splatíte podľa zakladateľskej listiny), remeselné a viazané živnosti a ich poplatky, súhlas vlastníka nehnuteľnosti so sídlom, poplatky za overenie podpisov a úkony nad rámec založenia s jedným spoločníkom a peňažným vkladom. Ak by niečo také bolo potrebné, povieme Vám to vopred a bez Vášho súhlasu to neurobíme.',
        `Od vzniku spoločnosti pre ňu vedieme účtovníctvo podľa Obchodných podmienok služby ${BRAND.name} v znení z ${longDate(TERMS_VERSION)} (ďalej „podmienky“), v balíku ${p.plan.name} za ${eur(p.plan.priceCents)} mesačne bez DPH. Podmienky sú súčasťou tejto zmluvy; ak sa od nej líšia, prednosť má táto zmluva.`,
      ],
    },
    {
      title: 'Platba vopred a zábezpeka',
      points: [
        `Skôr, ako objednáme advokáta, zaplatíte ${eur(FORMATION.priceCents)} za zabezpečenie založenia a zábezpeku (kauciu) ${eur(FORMATION.prepaidCents)}, spolu ${total}, na náš účet ${p.payment.iban} s variabilným symbolom ${p.payment.vs}.`,
        'Platba musí prísť z účtu vedeného na Vaše meno v banke v Európskej únii. Je to súčasť overenia Vašej totožnosti podľa zákona č. 297/2008 Z. z. Platbu z cudzieho účtu Vám vrátime a overenie nebude dokončené.',
        `Zábezpeka zabezpečuje záväzky spoločnosti a Vaše záväzky z tejto zmluvy a podmienok. Držíme ju počas viazanosti a neúročí sa. Od ${FORMATION.depositFromMonth}. mesiaca vedenia účtovníctva ju započítame na mesačné odplaty v poradí ich splatnosti, kým sa nevyčerpá; dovtedy sa odplaty platia podľa podmienok, mesačne vopred od prvého mesiaca.`,
        'Ak sa zmluva skončí skôr, zábezpeku započítame na odstupné podľa článku 7 a na všetky splatné a nezaplatené odplaty. Ak spoločnosť nezaplatí odplatu ani 30 dní po splatnosti, môžeme ju zo zábezpeky započítať kedykoľvek. Čo zo zábezpeky zostane po skončení zmluvy, vrátime do 14 dní.',
        'Ceny sú bez DPH. Kým nie sme platiteľom DPH, DPH neúčtujeme; ak sa ním staneme, k odplatám, ktoré ešte nie sú zaplatené, pripočítame DPH podľa zákona.',
      ],
    },
    {
      title: 'Postup a Vaša súčinnosť',
      points: [
        `Postup: vyplníte prihlášku, nahráte fotku dokladu totožnosti, podpíšete túto zmluvu a zaplatíte podľa článku 3. Po overení podľa článku 9 objednáme advokáta najneskôr do piatich pracovných dní. Ak prihlášku nedokončíte do ${FORMATION.applyDays} dní, zanikne a nič neplatíte.`,
        `Zaväzujete sa uviesť pravdivé a úplné údaje, podpísať dokumenty advokáta a dodať potrebné podklady (najmä súhlas vlastníka nehnuteľnosti so sídlom) do ${FORMATION.cooperateDays} dní od výzvy a splatiť vklad tak, aby ho bolo možné vyhlásiť v návrhu na zápis.`,
        `Priebežne Vás informujeme v aplikácii ${BRAND.name}, v akom stave založenie je. Výzvy a oznámenia podľa tejto zmluvy Vám posielame v aplikácii a na e-mail z prihlášky; doručené sú nasledujúci pracovný deň.`,
      ],
    },
    {
      title: 'Ak spoločnosť nevznikne',
      points: [
        `Ak sa založenie neuskutoční z dôvodu na našej strane alebo preto, že súd návrh zamietne bez Vášho zavinenia, vrátime Vám celých ${total} do 14 dní.`,
        `Ak nedáte súčinnosť podľa článku 4 ani do ${FORMATION.cooperateDays} dní od našej druhej výzvy, alebo ak od založenia sami ustúpite, môžeme od zmluvy odstúpiť. Zaplatených ${total} si v tom prípade ponecháme ako paušálnu náhradu za prácu a náklady, ktoré sme na založenie už vynaložili (overenie, príprava, advokát, systém), a nevraciame ich.`,
      ],
    },
    {
      title: 'Spoločnosť po svojom vzniku',
      points: [
        'Spoločnosť vzniká dňom zápisu do obchodného registra. Zaväzujete sa zabezpečiť, aby spoločnosť túto zmluvu schválila do troch mesiacov od svojho vzniku (§ 64 ods. 1 Obchodného zákonníka). Schválenie urobíte ako jediný spoločník a konateľ potvrdením v aplikácii; spoločnosť je potom zo zmluvy zaviazaná od počiatku.',
        'Kým spoločnosť zmluvu neschváli, ste zo záväzkov z nej zaviazaný(á) osobne (§ 64 ods. 1 Obchodného zákonníka).',
        'Po zápise založíme spoločnosť v aplikácii, pozveme Vás do nej a od prvého mesiaca jej existencie pre ňu vedieme účtovníctvo podľa podmienok.',
      ],
    },
    {
      title: 'Doba trvania a odstupné',
      points: [
        `Vedenie účtovníctva dojednávame na ${FORMATION.commitMonths} mesiacov od mesiaca, v ktorom spoločnosť vznikla. Potom zmluva pokračuje na dobu neurčitú a každá strana ju môže vypovedať s mesačnou výpovednou lehotou podľa podmienok.`,
        `Ak sa zmluva skončí pred uplynutím ${FORMATION.commitMonths} mesiacov výpoveďou spoločnosti alebo preto, že sme ju ukončili pre podstatné porušenie povinností spoločnosťou (najmä neplatenie), spoločnosť zaplatí odstupné vo výške mesačných odplát jej balíka za zostávajúce mesiace do ${FORMATION.commitMonths}. mesiaca, najviac však ${FORMATION.exitMaxMonths} mesačných odplát.`,
        'Odstupné sa neplatí, ak spoločnosť zmluvu ukončí preto, že sme podstatne porušili svoje povinnosti a nenapravili sme to ani do 30 dní od jej písomnej výzvy.',
        `Ak spoločnosť nezaplatí odplatu ani 30 dní po splatnosti ani po našej písomnej výzve, je to podstatné porušenie zmluvy a zmluvu môžeme ukončiť; spoločnosť potom zaplatí odstupné podľa bodu 7.2. Na nezaplatené odplaty a odstupné sa vzťahuje úrok z omeškania a paušálna náhrada nákladov spojených s uplatnením pohľadávky podľa § 369c Obchodného zákonníka.`,
      ],
    },
    {
      title: 'Ručenie zakladateľa',
      points: [
        `Týmto nám písomne vyhlasujete, že nás uspokojíte, ak spoločnosť nesplní svoje peňažné záväzky z tejto zmluvy a z podmienok: odplaty za vedenie účtovníctva splatné počas prvých ${FORMATION.commitMonths} mesiacov a odstupné podľa článku 7 (§ 303 Obchodného zákonníka). Ručenie zabezpečuje aj záväzky, ktoré vzniknú v budúcnosti (§ 304 ods. 2).`,
        'Plnenie od Vás môžeme žiadať, ak spoločnosť nezaplatí splatný záväzok ani v primeranej lehote po našej písomnej výzve (§ 306 ods. 1). Výzvu spoločnosti a jej výsledok Vám oznámime.',
        `Ručenie zaniká splnením zabezpečených záväzkov, najneskôr však zaplatením všetkého, čo bolo splatné do konca ${FORMATION.commitMonths}. mesiaca, a prípadného odstupného.`,
      ],
    },
    {
      title: 'Totožnosť a osobné údaje',
      points: [
        'Ako povinná osoba podľa zákona č. 297/2008 Z. z. overíme pred začatím obchodného vzťahu Vašu totožnosť: údaje z prihlášky, fotku dokladu totožnosti, Váš podpis tejto zmluvy kvalifikovaným elektronickým podpisom alebo vlastnoručným podpisom s úradným osvedčením a platbu z účtu na Vaše meno. Overenie robí naša určená osoba.',
        'Kópiu dokladu totožnosti a ďalšie údaje uchovávame päť rokov od skončenia obchodného vzťahu (§ 19 zákona č. 297/2008 Z. z.). Na tento účel ich spracúvame na základe zákona, bez Vášho súhlasu. Advokátovi odovzdáme len údaje potrebné na založenie.',
        `Viac o spracúvaní osobných údajov nájdete v informácii o ochrane osobných údajov na ${new URL(BRAND.origin).hostname}/pravne-informacie.`,
      ],
    },
    {
      title: 'Podpis a záverečné ustanovenia',
      points: [
        'Zmluvu podpisujete kvalifikovaným elektronickým podpisom (občiansky preukaz s čipom, eID) alebo vlastnoručne s úradne osvedčeným podpisom; originál s osvedčeným podpisom nám pošlete poštou. Zmluva vzniká, keď po overení podľa článku 9 potvrdíme jej prijatie v aplikácii a pošleme Vám potvrdenie.',
        `Zmenu zmluvy dojednávame písomne. Spory rieši príslušný súd Slovenskej republiky podľa slovenského práva. Znenie zmluvy z ${longDate(version)}.`,
      ],
    },
  ]
  return sections.map((s) => ({ title: typeset(s.title), points: s.points.map((x) => typeset(x)) }))
}

/** The whole contract as plain text, for its PDF and the archive: numbered articles and points, an annex, the signature. */
export function formationContractText(p: FormationParties, version = FORMATION.contractVersion, annex = ''): string {
  const lines = [FORMATION_CONTRACT_TITLE, '']
  formationContract(p, version).forEach((s, i) => {
    lines.push(`${i + 1}. ${s.title}`)
    s.points.forEach((point, j) => lines.push(`${i + 1}.${j + 1} ${point}`))
    lines.push('')
  })
  // The founder's declaration goes before the signature, so that one signature covers both.
  if (annex) lines.push(annex, '')
  lines.push('Podpis zakladateľa (vo vlastnom mene, v mene spoločnosti pred jej vznikom a ako ručiteľa):', '', '', p.founder.name)
  return lines.join('\n')
}
