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
          'Keď vyplníte formulár: IČO, názov a sídlo firmy z Registra právnických osôb, Vaše meno, e-mail, telefón a poznámku, ak ich uvediete, zvolený balík a to, z akej kampane alebo z akého odkazu ste prišli, ak to bolo v adrese stránky. Kalkulačka na úvodnej stránke nič neukladá.',
        )}
      </p>

      <h3 class="h4">Prečo a na akom základe</h3>
      <p>
        {t(
          'Aby sme Vám odpovedali a pripravili ponuku. Ak žiadate za seba, ide o kroky pred uzavretím zmluvy na Vašu žiadosť (článok 6 ods. 1 písm. b) GDPR). Ak žiadate za firmu, ide o náš oprávnený záujem odpovedať jej zástupcovi (článok 6 ods. 1 písm. f) GDPR).',
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
          'Cloudflare, Inc. nám ako sprostredkovateľ poskytuje servery, databázu a odosielanie e-mailov. Databázu máme v Európskej únii. Cloudflare je zapojený do rámca na ochranu údajov medzi EÚ a USA (Data Privacy Framework).',
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
          `Žiadosti ${RETENTION.requestDays / 365 === 1 ? '12 mesiacov' : `${RETENTION.requestDays} dní`} od odoslania, ak z nich nevznikne zmluva. Odoslané e-maily ${RETENTION.outboxDays} dní. Odtlačky pripojení ${RETENTION.throttleHours / 24} dni.`,
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
