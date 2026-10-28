import type { FC } from 'hono/jsx'
import { OPERATOR, ORDER, PLANS, TERMS_VERSION } from '../config'
import type { OrderReview, ReleaseState } from '../contracts'
import type { Order } from '../order'
import { LEGAL_FORM_NAMES, oneMayConclude } from '../rpo'
import { team as t } from '../team/copy'
import { Heading } from './inside'

export interface ReleaseForm {
  legal: string
  insurance: string
  until: string
  errors: { legal?: string; insurance?: string; until?: string }
}

/** The approval of today's terms and prices: where it stands, and the value to set on the Worker once a lawyer and
 * an insurer have looked at them. Nothing on this page is stored: the value lives only on the Worker. */
export const ContractReleasePage: FC<{ state: ReleaseState; untilText: string | null; hash: string; form: ReleaseForm | null; value: string | null }> = ({
  state,
  untilText,
  hash,
  form,
  value,
}) => (
  <>
    <a class="back" href="/ucto/ziadosti">
      {t.requests.title}
    </a>
    <header class="phead">
      <Heading first={t.release.title} second={t.release.serif} />
      <p class="phead__lead">{t.release.lead}</p>
    </header>
    <div class="release">
    {state.state === 'valid' ? (
      <p class="flash" role="status">
        <span class="tick" aria-hidden="true" />
        {t.release.state.valid(untilText ?? '')}
      </p>
    ) : (
      <p class="notice notice--error" role="alert">
        {state.state === 'expired' ? t.release.state.expired(untilText ?? '') : t.release.state[state.state]}
      </p>
    )}
    <section class="info">
      <h2 class="info__title">{t.release.what}</h2>
      <ul class="steps">
        <li>{t.release.terms(TERMS_VERSION)}</li>
        <li>{t.release.prices}</li>
        <li>{t.release.operator(OPERATOR.name)}</li>
      </ul>
      <dl class="kv">
        <div>
          <dt>{t.release.hash}</dt>
          <dd class="kv__long">
            <code>{hash}</code>
          </dd>
        </div>
      </dl>
    </section>
    <section class="info">
    <form class="stack" method="get" action="/ucto/ziadosti/schvalenie#hodnota" novalidate>
      <h2 class="info__title">{t.release.form}</h2>
      <div class="field">
        <label class="field__label" for="schvalenie-pravne">
          {t.release.legal}
        </label>
        <input id="schvalenie-pravne" class="field__input" name="pravne" value={form?.legal ?? ''} maxlength={240} autocomplete="off"
          aria-invalid={form?.errors.legal ? 'true' : undefined} />
        <p class="field__hint">{t.release.legalHint}</p>
        {form?.errors.legal ? <p class="field__error">{form.errors.legal}</p> : null}
      </div>
      <div class="field">
        <label class="field__label" for="schvalenie-poistne">
          {t.release.insurance}
        </label>
        <input id="schvalenie-poistne" class="field__input" name="poistne" value={form?.insurance ?? ''} maxlength={240} autocomplete="off"
          aria-invalid={form?.errors.insurance ? 'true' : undefined} />
        <p class="field__hint">{t.release.insuranceHint}</p>
        {form?.errors.insurance ? <p class="field__error">{form.errors.insurance}</p> : null}
      </div>
      <div class="field">
        <label class="field__label" for="schvalenie-do">
          {t.release.until}
        </label>
        <input id="schvalenie-do" class="field__input" name="do" value={form?.until ?? ''} maxlength={20} placeholder={t.release.untilHint} autocomplete="off"
          aria-invalid={form?.errors.until ? 'true' : undefined} />
        {form?.errors.until ? <p class="field__error">{form.errors.until}</p> : null}
      </div>
      <button class="btn btn--line stack__submit" type="submit">
        {t.release.prepare}
      </button>
    </form>
    </section>
    {value ? (
      <section class="info" id="hodnota">
        <h2 class="info__title">{t.release.value}</h2>
        <ol class="steps">
          {t.release.steps.map((step) => (
            <li>{step}</li>
          ))}
        </ol>
        <p class="info__subtitle">CONTRACT_RELEASE</p>
        <code class="release__value">{value}</code>
      </section>
    ) : null}
    </div>
  </>
)

export const ContractReviewPage: FC<{
  requestId: string
  order: Order | null
  offerHash: string
  review: OrderReview | null
  people: { id: string; name: string }[]
  /** The accountant with the fewest clients, offered first (team/assign.ts); null while the team has none. */
  suggested?: string | null
  released: boolean
  /** When the director was last sent the link to the contract, or null. */
  linkSentAt?: number | null
  flash?: string
  error?: string
}> = ({ requestId, order, offerHash, review, people, suggested = null, released, linkSentAt = null, flash, error }) => (
  <>
    <a class="back" href="/ucto/ziadosti">
      Žiadosti z webu
    </a>
    <header class="phead">
      <Heading first="Posúdenie" second="pred podpisom" />
      <p class="phead__lead">{order?.company ?? 'Pre túto žiadosť nie je otvorená online objednávka.'}</p>
    </header>
    {!released ? (
      <p class="notice">
        Podpisovanie je zablokované: chýba platné schválenie tohto znenia a cenníka po právnom a poistnom posúdení.{' '}
        <a class="link" href="/ucto/ziadosti/schvalenie">
          {t.release.link}
        </a>
      </p>
    ) : null}
    {review ? (
      <p class="notice">
        Posledné rozhodnutie: {review.decision === 'standard' ? 'štandardný balík' : review.decision === 'bespoke' ? 'individuálny rozsah' : 'pozastavené'}.
        Nové rozhodnutie predchádzajúce nenahrádza v histórii.
      </p>
    ) : null}
    {flash ? (
      <p class="flash" role="status">
        <span class="tick" aria-hidden="true" />
        {flash}
      </p>
    ) : null}
    {error ? (
      <p class="notice notice--error" role="alert">
        {error}
      </p>
    ) : null}
    {order ? (
      <section class="info" aria-labelledby="review-acting-t">
        <h2 id="review-acting-t" class="info__title">
          Kto za firmu koná
        </h2>
        <p class="info__lead">
          {LEGAL_FORM_NAMES[order.legalForm ?? 'sro']}. {order.directors && order.directors.length > 0 ? order.directors.map((d) => `${d.name} (${d.role.toLowerCase()})`).join(', ') : 'Register štatutárny orgán neuviedol, overte ho v obchodnom registri.'}
        </p>
        <p class="info__source">Spôsob konania podľa registra: {order.acting ?? 'register ho neuviedol.'}</p>
        {oneMayConclude(order.legalForm ?? 'sro', order.directors, order.acting) ? null : (
          <p class="notice notice--error">Za firmu nekoná jeden človek sám, alebo to z registra nevieme určiť: online zmluvu jeden človek neuzavrie. Založte klienta na zmluvu podpísanú všetkými, ktorí za firmu konajú.</p>
        )}
      </section>
    ) : null}
    {order ? <section class="info"><h2 class="info__title">Overenie pred zmluvou</h2><p>Pred podpisom musí byť úplné vyhlásenie, overenie kvalifikovaného podpisu, KUV, PEP, sankcií, krajín a rozhodnutie určenej osoby.</p><a class="btn btn--line" href={`/ucto/aml/objednavky/${order.id}`}>Otvoriť doklady a kontroly</a></section> : null}
    {order && order.status === 'expired' ? (
      <section class="info">
        <h2 class="info__title">Objednávka vypršala</h2>
        <p class="info__lead">
          Online objednávka platí {ORDER.days} dní a táto uplynula bez zmluvy. Obnovte ju a posúďte znova, alebo založte klienta na zmluvu podpísanú na
          papieri.
        </p>
        <form method="post" action={`/ucto/ziadosti/${requestId}/obnovit`}>
          <button class="btn btn--blue" type="submit">
            Obnoviť objednávku na {ORDER.days} dní
          </button>
        </form>
      </section>
    ) : null}
    {order && order.status !== 'accepted' ? (
      <p class="info__source">
        {review?.decision === 'bespoke' ? 'Individuálnu službu uzavriete zmluvou na papieri: ' : 'Ak zmluvu podpíšete na papieri: '}
        <a class="link" href={`/ucto/klienti/novy?ziadost=${requestId}`}>
          Založiť klienta bez online zmluvy
        </a>
      </p>
    ) : null}
    {order && order.status === 'open' && review?.decision === 'standard' ? (
      <section class="info">
        <h2 class="info__title">Odkaz na overenie a zmluvu</h2>
        <p class="info__lead">
          {linkSentAt
            ? `Poslali sme ho na ${order.email} ${new Intl.DateTimeFormat('sk-SK', { timeZone: 'Europe/Bratislava', day: 'numeric', month: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(linkSentAt * 1000))}. Nový odkaz nahradí predchádzajúci.`
            : released
              ? `Ešte sme ho neposlali. Pošleme ho na ${order.email}.`
              : 'Odkaz na podklady možno poslať už teraz. Uzavretie zmluvy zostáva zablokované do úplného overenia a právneho a poistného schválenia.'}
        </p>
        {review.expires_at > Math.floor(Date.now() / 1000) ? (
          <form method="post" action={`/ucto/ziadosti/${requestId}/odkaz`}>
            <button class="btn btn--line" type="submit">
              {linkSentAt ? 'Poslať nový odkaz' : 'Poslať odkaz'}
            </button>
          </form>
        ) : null}
      </section>
    ) : null}
    {order && order.status === 'open' ? (
      <form class="details" method="post" action={`/ucto/ziadosti/${requestId}/posudenie`}>
        <input type="hidden" name="proposal" value={offerHash} />
        <p>
          Štandardné prijatie je určené iba pre odborne overenú mikro účtovnú jednotku v podporovanom rozsahu. Obrat sám nestačí. Audit, IFRS, skupina alebo
          nepokrytá agenda vyžadujú individuálne riešenie.
        </p>
        <div class="field">
          <label class="field__label" for="review-decision">
            Rozhodnutie
          </label>
          <select class="field__input" id="review-decision" name="decision" required>
            <option value="hold">Pozastaviť do doplnenia podkladov</option>
            <option value="bespoke">Pripraviť individuálnu službu</option>
            <option value="standard">Schváliť štandardný balík</option>
          </select>
        </div>
        <div class="field">
          <label class="field__label" for="review-plan">
            Posúdený balík
          </label>
          <select class="field__input" id="review-plan" name="plan">
            {PLANS.map((p) => (
              <option value={p.id} selected={p.id === order.plan}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div class="field">
          <label class="field__label" for="review-accountant">
            Zodpovedná účtovníčka alebo účtovník
          </label>
          <select class="field__input" id="review-accountant" name="accountant">
            <option value="">Vyberte člena tímu</option>
            {people.map((p) => (
              <option value={p.id} selected={p.id === suggested}>
                {p.name}
                {p.id === suggested ? ' (najmenej klientov)' : ''}
              </option>
            ))}
          </select>
        </div>
        <div class="field">
          <label class="field__label" for="review-evidence">
            Referencia na podpísané odborné posúdenie
          </label>
          <input class="field__input" id="review-evidence" name="evidence" maxlength={240} required aria-describedby="review-evidence-hint" />
          <p class="small" id="review-evidence-hint">
            Použite interné číslo alebo zabezpečený odkaz. Správa má doložiť kategóriu a obdobia, audit, rozsah, riziká, mandát, kapacitu tímu a posúdenie
            konkrétneho klienta voči poistke. Účtovné doklady ani osobné údaje sem nevkladajte.
          </p>
        </div>
        <fieldset class="field choice">
          <legend class="field__label">Pre schválenie štandardného balíka potvrďte všetky kontroly</legend>
          {[
            ['category', 'Kategória mikro a podmienky príslušných období sú overené; nejde o povinný audit, IFRS ani konsolidáciu.'],
            ['scope', 'Dohodnutá agenda, objem, mzdy, DPH a migrácia sú podporované; je určený zástupca a nezávislá kontrola.'],
            ['cover', 'Riziko tohto klienta a rozsah zmluvy sú posúdené voči skutočnému krytiu a finančnej kapacite.'],
            ['authority', 'Konanie za firmu vrátane prípadného spoločného podpisovania je overené. Jeden online podpis je pre túto firmu postačujúci.'],
          ].map(([name, label]) => (
            <label class="agree">
              <input type="checkbox" name={name} value="1" />
              <span>{label}</span>
            </label>
          ))}
        </fieldset>
        <p class="small">
          Potvrdenie je záznam ľudského rozhodnutia, nie automatické overenie pravdivosti podkladov. Platí najviac sedem dní, pre tento návrh a balík; prijatie
          zmluvy ešte nenahrádza AML a plnú moc pred začatím služby.
        </p>
        <button class="btn btn--blue" type="submit">
          Uložiť posúdenie
        </button>
      </form>
    ) : null}
  </>
)
