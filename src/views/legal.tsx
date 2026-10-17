import type { FC } from 'hono/jsx'
import { AUTHORITIES, BRAND, OPERATOR, PRIVACY_VERSION, RETENTION } from '../config'
import { typeset as t } from '../format'

const effective = (() => {
  const [y, m, d] = PRIVACY_VERSION.split('-').map(Number)
  const months = ['januára', 'februára', 'marca', 'apríla', 'mája', 'júna', 'júla', 'augusta', 'septembra', 'októbra', 'novembra', 'decembra']
  return t(`${d}. ${months[(m ?? 1) - 1]} ${y}`)
})()

const Mail: FC = () => <a href={`mailto:${BRAND.email}`}>{BRAND.email}</a>

/** Who runs Firmony, how personal data are handled, and that there are no cookies. */
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
          'Keď vyplníte formulár: IČO, názov a sídlo firmy z Registra právnických osôb, Vaše meno, e-mail, telefón a poznámku, ak ich uvediete, zvolený balík a to, z akej kampane alebo z akého odkazu ste prišli, ak to bolo v adrese stránky. Keď sa zapíšete na daňové priznanie z investícií: e-mail, brokerov a cestu, ktoré zvolíte, a kampaň, z ktorej ste prišli. Kalkulačka na úvodnej stránke nič neukladá.',
        )}
      </p>

      <p>
        {t(
          'Keď uzavriete zmluvu: meno konateľa, ktorý ju uzavrel, e-mail, na ktorý sme poslali odkaz na zmluvu, čas uzavretia, znenie obchodných podmienok a odtlačok (hash) adresy pripojenia, z ktorého bola uzavretá.',
        )}
      </p>
      <p>
        {t(
          'V aplikácii pre klientov: meno a e-mail ľudí firmy, ktorí sa do nej prihlasujú, záznamy o prihlásení, správy s účtovníčkou, nastavenie pripomienok a záznam o tom, kto čo urobil (napríklad kto pridal doklad). Všetko vybavujeme v aplikácii: e-mail posielame len s odkazom na prihlásenie alebo ako upozornenie, že v aplikácii niečo čaká, a správy, doklady ani zmluvu v ňom neposielame.',
        )}
      </p>
      <p>
        {t(
          'Kvôli zákonu č. 297/2008 Z. z. o ochrane pred legalizáciou príjmov z trestnej činnosti: plnú moc, ktorú konateľ podpíše, a údaje, ktoré konateľ vyplní v aplikácii o sebe a o konečných užívateľoch výhod (meno, rodné číslo alebo dátum narodenia, trvalý pobyt, štátnu príslušnosť, druh a číslo dokladu totožnosti a to, či ide o politicky exponovanú osobu), o činnosti firmy a o pôvode jej peňazí, a to, ako sme ich overili a do akého rizika sme firmu zaradili. V aplikácii ich vidí len majiteľ firmy a u nás ľudia, ktorí ich overujú.',
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
          'Aby sme Vám odpovedali a pripravili ponuku. Ak žiadate za seba, ide o kroky pred uzavretím zmluvy na Vašu žiadosť (článok 6 ods. 1 písm. b) GDPR). Ak žiadate za firmu, ide o náš oprávnený záujem odpovedať jej zástupcovi (článok 6 ods. 1 písm. f) GDPR). Ak sa zapíšete na daňové priznanie z investícií, uchovávame Váš e-mail, brokerov a cestu, ktorú ste zvolili, a použijeme ich len na to, aby sme Vám dali vedieť o spustení (článok 6 ods. 1 písm. b) GDPR).',
        )}
      </p>
      <p>
        {t(
          'Zmluvu plníme s firmou. Údaje jej konateľa a ľudí, ktorí ju v aplikácii zastupujú, spracúvame na základe nášho oprávneného záujmu plniť zmluvu s firmou a vedieť preukázať, kto a kedy ju uzavrel (článok 6 ods. 1 písm. f) GDPR).',
        )}
      </p>
      <p>
        {t(
          'Identifikovať klienta a uchovávať o tom záznamy nám ukladá zákon č. 297/2008 Z. z. a uchovávať faktúry za naše služby zákon o účtovníctve (článok 6 ods. 1 písm. c) GDPR).',
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
          'Fotky a PDF dokladov číta umelá inteligencia spoločnosti Anthropic, PBC (USA), aby z nich vypísala údaje. Prenos do USA chránia štandardné zmluvné doložky Európskej komisie a Anthropic doklady nepoužíva na trénovanie modelov.',
        )}
      </p>
      <p>
        {t(
          'Ak firma prepojí banku, pohyby na jej účtoch číta s jej súhlasom Enable Banking Oy (Fínsko), poskytovateľ služby informovania o platobnom účte. Ak firma vloží token Fio banky, pohyby na účte čítame priamo vo Fio banke; token slúži len na čítanie a zabudneme ho, keď firma banku odpojí. Výpisy, ktoré banka firmy posiela na adresu firmy pre doklady, spracúvame ako jej doklady. Účtovníctvo vedú naši externí účtovníci na Slovensku, viazaní mlčanlivosťou.',
        )}
      </p>
      <p>
        {t(
          'Na základe plnej moci podávame v mene firmy priznania, výkazy a hlásenia finančnej správe, Sociálnej poisťovni a zdravotným poisťovniam. Ak to vyžaduje zákon č. 297/2008 Z. z., údaje odovzdáme Finančnej spravodajskej jednotke.',
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
          `Žiadosti ${RETENTION.requestDays / 365 === 1 ? '12 mesiacov' : `${RETENTION.requestDays} dní`} od odoslania, ak z nich nevznikne zmluva, a zápis na daňové priznanie z investícií rovnako dlho od posledného zápisu. Odoslané e-maily ${RETENTION.outboxDays} dní. Odtlačky pripojení ${RETENTION.throttleHours / 24} dni.`,
        )}
      </p>
      <p>
        {t(
          `Údaje o zmluve, plnú moc a záznamy z identifikácie klienta (vyhlásenie, riziko a vnútorné oznámenia) 5 rokov od skončenia zmluvy, ako ukladá zákon č. 297/2008 Z. z., a potom ich vymažeme; faktúry za naše služby 10 rokov. Pri e-mailoch, ktoré prídu na adresu firmy pre doklady, uchovávame odosielateľa a predmet ${RETENTION.outboxDays} dní a prílohy ako doklady firmy, výpisy z banky rovnako. Doklady a ostatné údaje firmy si firma po skončení zmluvy stiahne v aplikácii a po uplynutí 90 dní od skončenia ich vymažeme, spolu s prístupmi ľudí, ktorí už k žiadnej inej firme nepatria.`,
        )}
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
      <p>{t('Webová stránka nepoužíva cookies ani nástroje na sledovanie návštevnosti. Aplikácia pre klientov používa jedno nevyhnutné cookie, ktoré slúži na prihlásenie.')}</p>

      <p class="small">{`Platné od ${effective}.`}</p>
    </div>
  </section>
)
