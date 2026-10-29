import type { FC } from 'hono/jsx'
import { AUTHORITIES, BRAND, OPERATOR, PRIVACY_VERSION, RETENTION } from '../config'
import { typeset as t } from '../format'
import { USAGE_MONTHS } from '../analytics/model'

const effective = (() => {
  const [y, m, d] = PRIVACY_VERSION.split('-').map(Number)
  const months = ['januára', 'februára', 'marca', 'apríla', 'mája', 'júna', 'júla', 'augusta', 'septembra', 'októbra', 'novembra', 'decembra']
  return t(`${d}. ${months[(m ?? 1) - 1]} ${y}`)
})()

const Mail: FC = () => <a href={`mailto:${BRAND.email}`}>{BRAND.email}</a>

/** Who runs Firmony, how personal data are handled, what is measured (first-party, in daily sums), and that there are
 * no cookies on the site. */
export const Legal: FC = () => (
  <section class="section page">
    <div class="wrap narrow page__inner legal">
      <h1 class="h1">Právne informácie</h1>

      <h2 class="h3">Kto stojí za Firmony</h2>
      <p>{t(`Firmony je služba spoločnosti ${OPERATOR.name}${OPERATOR.name.endsWith('.') ? '' : '.'}`)}</p>
      <dl class="facts">
        <div>
          <dt>Obchodné meno</dt>
          <dd>{t(OPERATOR.name)}</dd>
        </div>
        <div>
          <dt>Sídlo</dt>
          <dd>{t(`${OPERATOR.street}, ${OPERATOR.postalCity}, ${OPERATOR.country}`)}</dd>
        </div>
        <div>
          <dt>IČO</dt>
          <dd>{t(OPERATOR.companyId)}</dd>
        </div>
        <div>
          <dt>DIČ</dt>
          <dd>{OPERATOR.taxId}</dd>
        </div>
        <div>
          <dt>Zápis</dt>
          <dd>{t(OPERATOR.register)}</dd>
        </div>
        <div>
          <dt>E-mail</dt>
          <dd>
            <Mail />
          </dd>
        </div>
        <div>
          <dt>Telefón</dt>
          <dd>
            <a href={OPERATOR.phoneHref}>{t(OPERATOR.phone)}</a>
          </dd>
        </div>
        <div>
          <dt>Orgán dozoru</dt>
          <dd>{t(`${AUTHORITIES.trade.name}, ${AUTHORITIES.trade.address}`)}</dd>
        </div>
      </dl>

      <h2 class="h3" id="ochrana-udajov">
        Ochrana osobných údajov
      </h2>
      <p>
        {t(
          `Prevádzkovateľom je ${OPERATOR.name}, ${OPERATOR.street}, ${OPERATOR.postalCity}, IČO ${OPERATOR.companyId}. S otázkou alebo so žiadosťou týkajúcou sa Vašich údajov nám napíšte na `,
        )}
        <Mail />.
      </p>

      <h3 class="h4">Aké údaje spracúvame</h3>
      <p>
        {t(
          'Keď na webe zadáte e-mail, aby ste začali: e-mail, kedy a koľkokrát ste ho zadali, na ktorej časti webu a z akej kampane alebo z akého odkazu ste prišli. Keď vyplníte formulár: IČO, názov a sídlo firmy z Registra právnických osôb, Vaše meno, e-mail, telefón a poznámku, ak ich uvediete, zvolený balík a to, z akej kampane alebo z akého odkazu ste prišli, ak to bolo v adrese stránky. Keď sa zapíšete na daňové priznanie z investícií: e-mail, brokerov a cestu, ktoré zvolíte, a kampaň, z ktorej ste prišli. Kalkulačka na úvodnej stránke nič neukladá.',
        )}
      </p>

      <p>
        {t(
          'Keď uzavriete zmluvu: meno konateľa alebo člena predstavenstva, ktorý ju uzavrel, a jeho funkciu, e-mail, na ktorý sme poslali odkaz na zmluvu, čas uzavretia, znenie obchodných podmienok a odtlačok (hash) adresy pripojenia, z ktorého bola uzavretá.',
        )}
      </p>
      <p>
        {t(
          'V aplikácii pre klientov: meno a e-mail ľudí firmy, ktorí sa do nej prihlasujú, záznamy o prihlásení, správy s účtovníčkou, nastavenie pripomienok a záznam o tom, kto čo urobil (napríklad kto pridal doklad). Všetko vybavujeme v aplikácii: e-mail posielame len s odkazom na prihlásenie alebo ako upozornenie, že v aplikácii niečo čaká, a správy, doklady ani zmluvu v ňom neposielame.',
        )}
      </p>
      <p>
        {t(
          'Kvôli zákonu č. 297/2008 Z. z. o ochrane pred legalizáciou príjmov z trestnej činnosti: plnú moc, ktorú podpíše ten, kto za firmu koná, a údaje, ktoré vyplní v aplikácii o sebe a o konečných užívateľoch výhod (meno, rodné číslo alebo dátum narodenia, trvalý pobyt, štátnu príslušnosť, druh a číslo dokladu totožnosti a to, či ide o politicky exponovanú osobu), o činnosti firmy a o pôvode jej peňazí, a to, ako sme ich overili a do akého rizika sme firmu zaradili. V aplikácii ich vidí len majiteľ firmy a u nás ľudia, ktorí ich overujú.',
        )}
      </p>
      <p>
        {t(
          'Keď si cez nás zakladáte s. r. o. za 1 €: e-mail a telefón, Vaše meno, rodné číslo, dátum narodenia, adresu, štátne občianstvo, číslo a platnosť dokladu totožnosti a jeho fotku z oboch strán, údaje budúcej firmy, Vaše vyhlásenie (politicky exponovaná osoba, konanie vo vlastnom mene, pôvod peňazí na imanie, očakávaný obrat), podpísanú zmluvu, platbu s menom a účtom platiteľa a to, z akej kampane alebo z akého odkazu ste prišli. Pred prijatím prihlášky Vás naša určená osoba vyhľadá aj v sankčných zoznamoch a vo verejných zoznamoch dlžníkov Sociálnej poisťovne, zdravotných poisťovní a finančnej správy a v registri úpadcov. Fotku dokladu a Vaše údaje vidí iba určená osoba; advokátovi odovzdáme len údaje potrebné na založenie.',
        )}
      </p>
      <p>
        {t(
          'Doklady, výpisy, faktúry a mzdy firmy obsahujú aj osobné údaje jej zamestnancov a obchodných partnerov. Tie spracúvame ako sprostredkovateľ v mene firmy, ktorá je ich prevádzkovateľom, podľa článku 8 ',
        )}
        <a href="/podmienky#clanok-8">obchodných podmienok</a>.
      </p>

      <h3 class="h4">Prečo a na akom základe</h3>
      <p>
        {t(
          'Aby sme Vám odpovedali a pripravili ponuku. E-mail, ktorý zadáte na začiatku, uložíme hneď, aby sme Vás mohli previesť ďalej. Ak žiadosť nedokončíte, pošleme Vám raz jednu pripomienku s odkazom, kde ste skončili; reklamné e-maily neposielame. Ak žiadate za seba, ide o kroky pred uzavretím zmluvy na Vašu žiadosť (článok 6 ods. 1 písm. b) GDPR). Ak žiadate za firmu, ide o náš oprávnený záujem odpovedať jej zástupcovi (článok 6 ods. 1 písm. f) GDPR). Ak sa zapíšete na daňové priznanie z investícií, uchovávame Váš e-mail, brokerov a cestu, ktorú ste zvolili, a použijeme ich len na to, aby sme Vám dali vedieť o spustení (článok 6 ods. 1 písm. b) GDPR).',
        )}
      </p>
      <p>
        {t(
          'Zmluvu plníme s firmou. Údaje toho, kto v jej mene koná, a ľudí, ktorí ju v aplikácii zastupujú, spracúvame na základe nášho oprávneného záujmu plniť zmluvu s firmou a vedieť preukázať, kto a kedy ju uzavrel (článok 6 ods. 1 písm. f) GDPR).',
        )}
      </p>
      <p>
        {t(
          'Identifikovať klienta a uchovávať o tom záznamy nám ukladá zákon č. 297/2008 Z. z. a uchovávať faktúry za naše služby zákon o účtovníctve (článok 6 ods. 1 písm. c) GDPR). Overiť v zoznamoch dlžníkov zakladateľa, za ktorého pred založením firmy platíme súdny poplatok a advokáta, je náš oprávnený záujem nebyť stratoví (článok 6 ods. 1 písm. f) GDPR).',
        )}
      </p>
      <p>
        {t(
          `Aby formuláre nikto nezneužil, počítame, koľko žiadostí prišlo z jedného pripojenia. Ukladáme len jednosmerný odtlačok (hash) adresy pripojenia a po ${RETENTION.throttleHours / 24} dňoch ho mažeme. Ide o náš oprávnený záujem chrániť službu (článok 6 ods. 1 písm. f) GDPR).`,
        )}
      </p>

      <h3 class="h4">Komu údaje odovzdávame</h3>
      <p>
        {t(
          'Cloudflare, Inc. nám ako sprostredkovateľ poskytuje servery, databázu, úložisko súborov a odosielanie e-mailov. Databázu aj súbory máme v Európskej únii. Cloudflare je zapojený do rámca na ochranu údajov medzi EÚ a USA (Data Privacy Framework).',
        )}
      </p>
      <p>
        {t(
          'Fotky a PDF dokladov číta umelá inteligencia spoločnosti Anthropic, PBC (USA), aby z nich vypísala údaje. Prenos do USA chránia štandardné zmluvné doložky Európskej komisie. Pri komerčnom API Anthropic vstupy a výstupy predvolene nepoužíva na trénovanie modelov; na trénovanie ich za nás neposkytujeme ani ako spätnú väzbu.',
        )}
      </p>
      <p>
        {t(
          'Ak firma prepojí banku, pohyby na jej účtoch číta s jej súhlasom Enable Banking Oy (Fínsko), poskytovateľ služby informovania o platobnom účte. Ak firma vloží token Fio banky, pohyby na účte čítame priamo vo Fio banke; token slúži len na čítanie a zabudneme ho, keď firma banku odpojí. Výpisy, ktoré banka firmy posiela na adresu firmy pre doklady, spracúvame ako jej doklady. Účtovníctvo vedú naši externí účtovníci na Slovensku, viazaní mlčanlivosťou.',
        )}
      </p>
      <p>
        {t(
          'Na základe plnej moci podávame v mene firmy priznania, výkazy a hlásenia finančnej správe, Sociálnej poisťovni a zdravotným poisťovniam. Na plnenie povinností podľa zákona č. 297/2008 Z. z. spracúvame osobné údaje aj bez súhlasu dotknutých osôb (§ 19 ods. 1 a § 21 ods. 3). Ak to vyžaduje tento zákon, údaje odovzdáme Finančnej spravodajskej jednotke.',
        )}
      </p>
      <p>
        {t(
          'IČO, ktoré zadáte, pošleme Štatistickému úradu Slovenskej republiky, aby sme z Registra právnických osôb načítali názov a sídlo firmy. Ide o verejné údaje.',
        )}
      </p>

      <h3 class="h4">Ako dlho ich uchovávame</h3>
      <p>
        {t(
          `Prihlášku na založenie s. r. o., ktorú nikto neoveroval a nič ste na ňu nezaplatili (zanikla alebo ste ju zrušili), vymažeme aj so súbormi mesiac po jej poslednej zmene. Prihlášku, ktorú sme overovali, odmietli alebo ukončili, uchovávame päť rokov od jej skončenia; prihlášku, z ktorej vznikla firma, s údajmi tejto firmy. `,
        )}
      </p>
      <p>
        {t(
`E-mail, ktorý ste zadali na začiatku, vymažeme ${RETENTION.requestDays} dní od jeho posledného zadania. Žiadosť z webu, ku ktorej sme nedostali podpísané vyhlásenie na overenie totožnosti, vymažeme ${RETENTION.requestDays} dní od jej odoslania, spolu s ponukou, ak sme ju poslali a už neplatí. Ak sme overenie začali alebo to vyžaduje zákon proti praniu špinavých peňazí, údaje záujemcu a podklady z rokovania, z ktorého nevznikla zmluva, uchovávame päť rokov od odmietnutia alebo skončenia rokovania podľa AML programu. Zápis na daňové priznanie z investícií uchovávame ${RETENTION.requestDays} dní od posledného zápisu. Technické záznamy odoslaných upozornení ${RETENTION.outboxDays} dní a odtlačky pripojení ${RETENTION.throttleHours / 24} dni.`,
        )}
      </p>
      <p>
        {t(
          `Doklady, platby, bankové výpisy, účtovníctvo, správy, udalosti, zmluvu, plnú moc a záznamy o identifikácii, riziku a internom posúdení uchovávame päť rokov od skončenia zmluvy podľa § 19 ods. 2 zákona č. 297/2008 Z. z. Klient si údaje stiahne počas zmluvy a 90 dní po jej skončení. Potom sú dostupné iba určenej osobe na čítanie na splnenie zákonných povinností. Uchovanie môže predĺžiť písomná žiadosť FSJ v určenom rozsahu najviac o ďalších päť rokov; iné zákonné povinnosti a prebiehajúce zákonné konanie môžu vyžadovať dlhšiu lehotu. Naše vlastné účtovné doklady vrátane faktúr za služby uchovávame desať rokov podľa zákona o účtovníctve. Údaje obsahu správ a spracovania dokladov nezanikajú s technickým záznamom e-mailového upozornenia.`,
        )}
      </p>

      {/* Provider originals read 22 October 2026: https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data
          https://privacy.claude.com/en/articles/7996868-is-my-data-used-for-model-training
          National scope checked: https://static.slov-lex.sk/static/SK/ZZ/2018/18/20260818.html#paragraf-3 */}
      <h3 class="h4" id="asistent">Dobrovoľný asistent v aplikácii</h3>
      <p>{t('Rýchle otázky čítajú stav priamo z údajov Vašej firmy bez odoslania otázky do AI. Ak sa rozhodnete napísať vlastnú otázku a odoslať ju AI, spoločnosti Anthropic pošleme iba tento text na rozpoznanie témy. Doklady, bankové výpisy, identifikačné údaje firmy ani obsah správ do tohto volania automaticky nepridávame. Samotný text však môže obsahovať osobné údaje, preto doň nepíšte heslá, citlivé údaje ani údaje iných ľudí, ktoré nie sú potrebné.')}</p>
      <p>{t('Odpoveď a odkazy zostaví aplikácia z evidovaných údajov firmy, do ktorej máte prístup. Asistent nerozhoduje o dani, nevykonáva platby, nemení účtovné knihy a neposiela podania. Text otázky ani odpoveď ako rozhovor u nás trvalo neukladáme. Uchovávame záznam použitia s identifikátorom firmy a používateľa, časom, témou, modelom, dostupným počtom tokenov a odtlačkom otázky bez jej textu. Patrí k auditnej histórii služby s nižšie uvedeným uchovávaním. Správu účtovníčke uložíme až po Vašom výslovnom odoslaní z pripraveného formulára.')}</p>
      <p>{t('Anthropic pri štandardnom API uvádza odstránenie vstupov a výstupov do 30 dní, s výnimkami napríklad pre zákonné povinnosti a presadzovanie pravidiel bezpečného používania. Pri označení porušenia pravidiel môže údaje uchovávať dlhšie. Nepredpokladáme osobitnú dohodu o nulovom uchovávaní. Podrobnosti sú v ')}<a href="https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data" rel="noopener noreferrer">informácii Anthropic o uchovávaní</a>.</p>

      <h3 class="h4" id="mony">Asistent Mony</h3>
      <p>{t('Asistent Mony v pravom dolnom rohu webu a aplikácie odpovedá na otázky, ako Firmony funguje a ako ho používať. Keď mu napíšete otázku, spoločnosti Anthropic pošleme jej text, predchádzajúce otázky a odpovede z tej istej karty prehliadača, adresu stránky, na ktorej práve ste, a návody Firmony, z ktorých odpovedá. Doklady, platby, bankové výpisy ani iné údaje Vašej firmy mu neposielame. Do otázky preto nepíšte heslá, rodné čísla ani iné citlivé údaje.')}</p>
      <p>{t('Rozhovor u nás neukladáme; zostáva len vo Vašej karte prehliadača, kým ju nezatvoríte. Uchovávame iba záznam použitia s časom a počtom tokenov, bez textu otázky a odpovede; v aplikácii aj s identifikátorom používateľa a firmy, s uchovávaním ako ostatná auditná história služby. Na webe obmedzujeme počet otázok z jedného pripojenia; na to slúži odtlačok IP adresy, ktorý mažeme do troch dní. Pre uchovávanie u spoločnosti Anthropic platí to isté ako pri asistentovi vyššie.')}</p>

      <h3 class="h4" id="fakturacia">Bezplatná fakturácia</h3>
      <p>{t('Ak si vytvoríte bezplatný fakturačný účet, spracúvame Váš e-mail, meno a údaje firmy, ktoré zadáte alebo načítame z registra, aby fakturácia fungovala podľa jej podmienok používania (článok 6 ods. 1 písm. b) GDPR). Kým registráciu nedokončíte, uchovávame e-mail, IČO a údaje firmy z registra najviac 8 dní.')}</p>
      <p>{t('Osobné údaje Vašich odberateľov, ktoré uvediete na faktúrach, spracúvame ako sprostredkovateľ podľa článku 28 GDPR, len na Váš pokyn a len aby ste mohli faktúry vystaviť, uložiť, stiahnuť a sprístupniť odberateľovi cez odkaz. Faktúry odberateľom neposielame. Kto má odkaz na faktúru, vidí ju, preto ho posielajte len odberateľovi.')}</p>
      <p>{t('Ak použijete Faktúru z jednej vety, spoločnosti Anthropic pošleme iba napísanú vetu a vrátime návrh do formulára. Vetu u nás neukladáme; zaznamenáme len, že návrh vznikol, a počet tokenov. Údaje fakturačného účtu uchovávame, kým účet nezrušíte. Po zrušení zmažeme faktúry a údaje firmy hneď; Váš e-mail a meno pri najbližšom nočnom spracovaní, ak u nás nemáte iný účet. Zo záloh databázy zmiznú najneskôr do 30 dní.')}</p>
      <h3 class="h4" id="peppol">E-faktúry cez sieť Peppol</h3>
      <p>{t('Či Váš odberateľ alebo Vaša firma prijíma e-faktúry, overujeme vo verejnom registri siete Peppol (SML) podľa DIČ. Otázka ide cez službu DNS spoločnosti Cloudflare a obsahuje len odtlačok označenia v sieti, nie meno ani iné údaje. Odpoveď si pamätáme najviac tri dni, tiež len pod týmto odtlačkom.')}</p>
      <p>{t('Keď e-faktúru odošlete cez sieť Peppol, odovzdáme ju certifikovanému poskytovateľovi doručovacej služby. Ten ju doručí odberateľovi a jej údaje oznámi finančnej správe, ako to vyžaduje zákon o DPH. E-faktúry, ktoré Vám cez sieť prídu, uložíme medzi Vaše doklady alebo prijaté faktúry. Uchovávame ich rovnako ako ostatné doklady a pri zrušení účtu ich zmažeme. Poskytovateľa, s ktorým spolupracujeme, tu uvedieme pred spustením odosielania.')}</p>
      <p>{t('Posielať a prijímať cez Firmony môže firma až vtedy, keď si Firmony zvolí na portáli finančnej správy, kde sa jej zástupca prihlasuje občianskym preukazom s čipom, a my overíme, že účet vo Firmony patrí tejto firme. E-faktúru, ktorú nevieme priradiť žiadnej firme (napríklad príde po skončení zmluvy), uchováme, kým ju nevybavíme, a potom najviac rok.')}</p>
      <h3 class="h4" id="meranie">
        Meranie návštevnosti a používania
      </h3>
      <p>
        {t(
          'Návštevnosť webu meriame sami, bez cookies, bez cudzích skriptov a bez sledovania jednotlivých ľudí. Za každý deň ukladáme len súčty: koľkokrát bola stránka zobrazená (jej adresa bez parametrov, kľúče a identifikátory v nej nahradíme), z akej domény ste prišli (len doména, nie celá adresa), označenie kampane z adresy stránky (utm_source, utm_medium, utm_campaign, ref), či ide o mobil, tablet alebo počítač, a zvlášť počet návštev automatov vyhľadávačov, zobrazení prihlásených používateľov a chýb stránok. IP adresu ani celý identifikátor prehliadača na to neukladáme.',
        )}
      </p>
      <p>
        {t(
          `V aplikácii pre klientov a v časti pre náš tím ukladáme za každý deň súčty požiadaviek podľa stránky aplikácie, ich výsledok a čas spracovania na serveri. O prihlásenom používateľovi ukladáme, ktoré časti aplikácie v daný deň použil a koľkokrát: identifikátor používateľa a firmy, deň, časť aplikácie, počet a čas poslednej požiadavky. Tieto záznamy o používateľoch mažeme po ${USAGE_MONTHS} mesiacoch, denné súčty bez údajov o osobách uchovávame dlhodobo.`,
        )}
      </p>
      <p>
        {t(
          'Pomáhajú nám zistiť, ktoré funkcie ľudia používajú, kde službu zlepšiť a kde je aplikácia pomalá. Ide o náš oprávnený záujem zlepšovať službu (článok 6 ods. 1 písm. f) GDPR). Vidí ich len správca Firmony. Na analýzu si ich môže stiahnuť bez e-mailov a mien ľudí, s identifikátormi používateľov nahradenými jednosmerným odtlačkom. Proti tomuto spracúvaniu môžete kedykoľvek namietať na ',
        )}
        <Mail />.
      </p>

      <h3 class="h4">Vaše práva</h3>
      <p>
        {t(
          'Máte právo na prístup k údajom, ich opravu, vymazanie, obmedzenie spracúvania a prenosnosť a tiež právo namietať proti spracúvaniu na základe oprávneného záujmu. Stačí napísať na ',
        )}
        <Mail />.{' '}
        {t(`Ak si myslíte, že s údajmi nezaobchádzame správne, môžete sa obrátiť na ${AUTHORITIES.data.name}, ${AUTHORITIES.data.address}, `)}
        <a href={AUTHORITIES.data.website}>dataprotection.gov.sk</a>.
      </p>

      <h3 class="h4" id="cookies">
        Cookies
      </h3>
      <p>{t('Webová stránka nepoužíva cookies ani cudzie nástroje na sledovanie návštevnosti. Návštevnosť meriame sami v denných súčtoch, ako je opísané vyššie. Aplikácia pre klientov používa jedno nevyhnutné cookie, ktoré slúži na prihlásenie.')}</p>

      <p class="small">{`Platné od ${effective}.`}</p>
    </div>
  </section>
)
