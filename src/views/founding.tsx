// The s. r. o. for 1 €: the founder's pages (the offer, the link sent, the application step by step) and the
// designated person's (the list and one application). The founder has no account: the link from the email is the key,
// and nothing of the identity document is ever shown back on the founder's page.
import type { FoundingProposals } from '../aml/proposals'
import type { Child, FC } from 'hono/jsx'
import { ART, BRAND, FORMATION, OPERATOR, PLANS, asset, planById } from '../config'
import { formatEur, formatEurExact, typeset } from '../format'
import { textDay } from '../app/booking'
import { monthName, whenName } from '../app/copy'
import { bratislavaDay } from '../time'
import { payBySquare, qrPicture } from '../app/paybysquare'
import { formationContract, FORMATION_CONTRACT_TITLE, type FormationParties } from '../content/formation-contract'
import { CHECK_KINDS, FINAL, FOUNDING_TOTAL, TURNOVERS, checksNeeded, riskHints, sameName, stepsOf, type CheckKind, type Founding, type FoundingErrors, type FoundingStatus, type FoundingValues } from '../founding/model'
import type { FoundingCheck, FoundingEvent } from '../founding/store'
import { CarryFields, Picture, type Carry } from './home'
import { copy } from '../copy'

const total = formatEur(FOUNDING_TOTAL)
const prepaid = formatEur(FORMATION.prepaidCents)
const price = formatEur(FORMATION.priceCents)

/** A page of the founder: the site's soft light at its top, one column, and the team's cards (inside.css). */
const Page: FC<{ children: Child; wide?: boolean }> = ({ children, wide }) => (
  <section class="section page">
    <link rel="stylesheet" href={asset('/inside.css')} />
    <div class={`wrap ${wide ? 'reading' : 'narrow'} page__inner`}>{children}</div>
  </section>
)

const TURNOVER_WORDS: Record<string, string> = { 'do-50': 'do 50 000 €', '50-200': '50 000 až 200 000 €', '200-1000': '200 000 až 1 000 000 €', 'nad-1000': 'viac ako 1 000 000 €' }

export const STATUS_WORDS: Record<FoundingStatus, string> = {
  open: 'Rozpracovaná',
  verifying: 'Overujeme',
  verified: 'Overená, čaká na advokáta',
  ordered: 'Advokát pripravuje dokumenty',
  signing: 'Podpisujete dokumenty advokáta',
  filed: 'Návrh je podaný na súd',
  registered: 'Firma je zapísaná',
  refused: 'Neprijatá',
  lapsed: 'Zanikla',
  withdrawn: 'Ukončená pre nesúčinnosť',
  cancelled: 'Zrušená',
}

const tone = (s: FoundingStatus) => (s === 'registered' ? 'pill--ok' : s === 'refused' || s === 'withdrawn' ? 'pill--red' : s === 'lapsed' || s === 'cancelled' ? 'pill--grey' : s === 'open' ? 'pill--amber' : 'pill--blue')

export const StatusPill: FC<{ status: FoundingStatus }> = ({ status }) => <span class={`pill ${tone(status)}`}>{STATUS_WORDS[status]}</span>

// ---------------------------------------------------------------------------------------------------------------
// The offer and the link
// ---------------------------------------------------------------------------------------------------------------

export interface LandingValues {
  email: string
  phone: string
  plan: string
}

/**
 * The offer as it sells (his word of 28 October 2026, 15:20: sell it, promise within what we do, never mislead, never cut
 * the ground from under us): the deal on the site's panel, three steps, what is paid, the full conditions one click away,
 * and the form. What the law asks of a founder anyway (the capital) is the advocate's to explain, not the offer's.
 */
export const FoundingLanding: FC<{ values: LandingValues; errors: Partial<Record<'email' | 'phone' | 'form', string>>; places: number; open: boolean; carry?: Carry }> = ({ values, errors, places, open, carry = [] }) => {
  const d = copy.formation
  return (
    <>
      <section class="deal-section found-hero" aria-labelledby="found-title">
        <div class="wrap">
          <div class="deal">
            <div class="deal__copy">
              <p class="deal__badge">{places > 0 ? `Tento mesiac ešte ${places} ${places === 1 ? 'miesto' : places < 5 ? 'miesta' : 'miest'}` : 'Tento mesiac plno, berieme na ďalší'}</p>
              <h1 id="found-title" class="deal__title">
                <span class="deal__first">{d.first}</span> <span class="deal__big">{d.big}</span> <em class="deal__serif">{d.second}</em>
              </h1>
              <p class="deal__lead">{typeset('Bežne stojí založenie s. r. o. okolo 500 €. U nás zaplatíte 1 €, všetko vybavíte online za pár minút a od prvého dňa máte účtovníčku, ktorá sa o Vašu firmu postará.')}</p>
              <ul class="deal__points">
                {d.points.map((p) => (
                  <li class="deal__point">
                    <strong class="deal__point-title">{p.title}</strong>
                    <span class="deal__point-text">{p.text}</span>
                  </li>
                ))}
              </ul>
              <p class="deal__actions">
                <a class="btn deal__cta" href="#prihlaska">
                  {d.cta}
                </a>
                <span class="deal__limit">{d.limit}</span>
              </p>
            </div>
            <div class="deal__art" aria-hidden="true">
              <Picture art={ART.formation} className="deal__img" sizes="(max-width: 900px) 220px, 400px" eager />
            </div>
          </div>
        </div>
      </section>

      <section class="section found-how" aria-labelledby="found-how">
        <div class="wrap">
          <header class="head head--center">
            <h2 id="found-how" class="title">
              <span class="title__sans">Firma za pár dní.</span>
              <em class="title__serif">Tri kroky, zvyšok je na nás.</em>
            </h2>
          </header>
          <ol class="found-steps">
            {FOUNDING_STEPS.map((step, i) => (
              <li class="found-step">
                <span class="found-step__num" aria-hidden="true">
                  {i + 1}
                </span>
                <h3 class="found-step__title">{step.title}</h3>
                <p class="found-step__text">{typeset(step.text)}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section class="section found-price-section" aria-labelledby="found-price">
        <div class="wrap narrow">
          <div class="found-price">
            <h2 id="found-price" class="found-price__title">
              Čo zaplatíte
            </h2>
            <dl class="found-price__rows">
              <div>
                <dt>Založenie s. r. o.</dt>
                <dd>{price}</dd>
              </div>
              <div>
                <dt>Advokát a súdny poplatok</dt>
                <dd>platíme my</dd>
              </div>
              <div>
                <dt>
                  Kaucia
                  <span>{typeset('Odpočítame Vám ju z posledných faktúr, takže Vás nestojí nič navyše.')}</span>
                </dt>
                <dd>{prepaid}</dd>
              </div>
              <div>
                <dt>
                  Účtovníctvo
                  <span>{typeset(`Od vzniku firmy, spolupráca na ${FORMATION.commitMonths / 12} roky, potom bez viazanosti.`)}</span>
                </dt>
                <dd>od {formatEur(PLANS[0]!.price * 100)} mesačne</dd>
              </div>
            </dl>
            <p class="found-price__total">
              <span>{typeset('Úvodná platba pri prihláške')}</span>
              <strong>{total}</strong>
            </p>
            <details class="found-terms">
              <summary>Podmienky ponuky</summary>
              <ul>
                <li>{typeset(`Účtovníctvo firmy vediete vo Firmony aspoň ${FORMATION.commitMonths} mesiacov za cenu zvoleného balíka, platí sa mesačne od vzniku firmy. Potom zmluva pokračuje bez viazanosti s mesačnou výpovednou lehotou.`)}</li>
                <li>{typeset(`Kauciu ${prepaid} Vám odpočítame z faktúr na konci spolupráce. Ak by ste odišli skôr, započíta sa na odstupné za zostávajúce mesiace, najviac ${FORMATION.exitMaxMonths} mesačných poplatkov.`)}</li>
                <li>{typeset(`Ak firmu nezaložíme z dôvodu na našej strane alebo ju súd nezapíše bez Vašej viny, vrátime Vám celých ${total}.`)}</li>
                <li>{typeset('Úvodná platba pokrýva prácu na založení. Ak od založenia odstúpite alebo nedodáte podklady ani po druhej výzve, nevracia sa.')}</li>
                <li>{typeset('Ako zakladateľ za záväzky firmy z tejto zmluvy ručíte. Ceny sú bez DPH. Ponuka platí pre prvých 20 firiem v mesiaci.')}</li>
              </ul>
              <a class="link" href="/zalozenie/zmluva">
                Celé znenie zmluvy
              </a>
            </details>
          </div>
        </div>
      </section>

      <section class="section found-apply" id="prihlaska" aria-labelledby="found-apply">
        <div class="wrap narrow">
          {open ? (
            <div class="found-form">
              <h2 id="found-apply" class="title title--small">
                <span class="title__sans">Začnite prihláškou.</span>
                <em class="title__serif">Odkaz Vám pošleme e-mailom.</em>
              </h2>
              {errors.form ? (
                <p class="notice notice--error" role="alert">
                  {errors.form}
                </p>
              ) : null}
              <form class="details" method="post" action="/zalozenie" novalidate>
                <CarryFields carry={carry} />
                <div class="trap" aria-hidden="true">
                  <label>
                    Web
                    <input type="text" name="web" tabindex={-1} autocomplete="off" />
                  </label>
                </div>
                <fieldset class="field choice">
                  <legend class="field__label">Balík účtovníctva</legend>
                  <div class="choice__options">
                    {PLANS.map((plan) => (
                      <label class="choice__option">
                        <input type="radio" name="plan" value={plan.id} checked={(values.plan || 'start') === plan.id} />
                        <span>
                          {plan.name} <span class="choice__hint">{formatEur(plan.price * 100)} mesačne, do {plan.docs} dokladov</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>
                <Input name="email" label="Váš e-mail" value={values.email} error={errors.email} type="email" autocomplete="email" />
                <Input name="phone" label="Telefón" value={values.phone} error={errors.phone} type="tel" autocomplete="tel" optional />
                <p class="small">
                  Osobné údaje spracúvame podľa{' '}
                  <a class="link" href="/pravne-informacie#ochrana-udajov">
                    informácie o ochrane osobných údajov
                  </a>
                  .
                </p>
                <button class="btn btn--blue btn--large details__submit" type="submit">
                  Pokračovať k prihláške
                </button>
              </form>
            </div>
          ) : (
            <div class="found-form found-form--soon">
              <h2 id="found-apply" class="title title--small">
                <span class="title__sans">Prvé miesta otvárame.</span>
                <em class="title__serif">Buďte medzi prvými.</em>
              </h2>
              <p class="lead">{typeset('Nechajte nám kontakt a ozveme sa Vám ako prvým, hneď ako prihlášky spustíme.')}</p>
              <p class="page__more">
                <a class="btn btn--blue btn--large" href="/zacat?nova=1">
                  Chcem byť medzi prvými
                </a>
              </p>
            </div>
          )}
        </div>
      </section>
    </>
  )
}

const FOUNDING_STEPS = [
  { title: 'Vyplníte prihlášku', text: 'Údaje o sebe a o budúcej firme a fotka občianskeho. Asi 10 minút, pokojne z mobilu.' },
  { title: 'Podpíšete a potvrdíte', text: 'Zmluvu podpíšete občianskym s čipom priamo z domu a pošlete úvodnú platbu.' },
  { title: 'Zvyšok vybavíme my', text: 'Advokát, zápis do obchodného registra aj živnosť. Keď je firma zapísaná, dáme Vám vedieť a môžete podnikať.' },
]

const Input: FC<{ name: string; label: string; value: string; error?: string; type?: string; autocomplete?: string; optional?: boolean; hint?: string; inputmode?: 'numeric' | 'tel' | 'email' | 'text' }> = ({ name, label, value, error, type = 'text', autocomplete, optional, hint, inputmode }) => (
  <div class="field">
    <label class="field__label" for={`z-${name}`}>
      {label}
      {optional ? <span class="field__optional"> (nepovinné)</span> : null}
    </label>
    <input
      class="field__input"
      id={`z-${name}`}
      name={name}
      type={type}
      value={value}
      autocomplete={autocomplete ?? 'off'}
      inputmode={inputmode}
      aria-invalid={error ? 'true' : undefined}
      aria-describedby={[error ? `z-${name}-e` : '', hint ? `z-${name}-h` : ''].filter(Boolean).join(' ') || undefined}
    />
    {hint ? (
      <p class="field__hint" id={`z-${name}-h`}>
        {hint}
      </p>
    ) : null}
    {error ? (
      <p class="field__error" id={`z-${name}-e`}>
        {error}
      </p>
    ) : null}
  </div>
)

export const FoundingSent: FC = () => (
  <Page>
    <h1 class="h1">Skontrolujte e-mail</h1>
    <p class="lead">{typeset(`Poslali sme Vám odkaz na prihlášku. Platí ${FORMATION.applyDays} dní a prihlášku ním otvoríte kedykoľvek, aj z iného zariadenia.`)}</p>
    <p class="page__text">{typeset('E-mail neprišiel? Pozrite sa do priečinka s nevyžiadanou poštou. Ak tam nie je, skúste to znova o pár minút.')}</p>
    <p class="page__more">
      <a class="btn btn--line" href="/">
        Späť na úvod
      </a>
    </p>
  </Page>
)

/** The contract with blanks, to read before applying. */
export const FoundingContractPreview: FC = () => {
  const blank: FormationParties = {
    founder: { name: '[meno zakladateľa]', born: '[dátum narodenia]', address: '[adresa trvalého pobytu]' },
    company: { name: '[obchodné meno] s. r. o.', seat: '[sídlo]', capitalCents: 500_000, activities: ['[predmet podnikania]'] },
    plan: { name: '[balík]', priceCents: 8_900 },
    payment: { iban: '[účet Firmony]', vs: '[variabilný symbol]' },
  }
  return (
    <Page wide>
      <h1 class="h1">{FORMATION_CONTRACT_TITLE}</h1>
      <p class="lead">{typeset('Takto znie zmluva, ktorú podpíšete. V prihláške ju doplníme o Vaše údaje a údaje firmy a pridáme Vaše vyhlásenie.')}</p>
      <ContractText sections={formationContract(blank)} />
      <p class="page__more">
        <a class="btn btn--blue" href="/zalozenie">
          Späť na prihlášku
        </a>
      </p>
    </Page>
  )
}

const ContractText: FC<{ sections: ReturnType<typeof formationContract> }> = ({ sections }) => (
  <ol class="found__contract">
    {sections.map((s, i) => (
      <li>
        <h2 class="found__article">
          {i + 1}. {s.title}
        </h2>
        {s.points.map((p, j) => (
          <p class="found__point">
            <span class="found__no">
              {i + 1}.{j + 1}
            </span>{' '}
            {p}
          </p>
        ))}
      </li>
    ))}
  </ol>
)

// ---------------------------------------------------------------------------------------------------------------
// The application
// ---------------------------------------------------------------------------------------------------------------

export interface FoundingPageProps {
  f: Founding
  token: string
  values: FoundingValues
  errors: FoundingErrors
  /** The data form open (a change), else the summary. */
  editing: boolean
  pay: { iban: string; vs: string; beneficiary: string } | null
  events: FoundingEvent[]
  flash: string | null
  today: string
  error?: string | null
}

const FLASH: Record<string, string> = {
  udaje: 'Údaje sú uložené.',
  doklad: 'Doklad je nahratý.',
  podpis: 'Podpísaná zmluva je nahratá.',
  odoslane: 'Prihlášku sme prijali na overenie. Ozveme sa do dvoch pracovných dní.',
}

/** The founder's page: the steps while it is open, then where the formation stands and what we wrote. */
export const FoundingPage: FC<FoundingPageProps> = (p) => {
  const f = p.f
  const steps = stepsOf(f)
  const base = `/zalozenie/${p.token}`
  const name = f.company?.name ?? 'Nová s. r. o.'
  const notes = p.events.filter((e) => e.action === 'note' || e.action === 'call')
  return (
    <Page wide>
      <p class="found__eyebrow">Prihláška na založenie s. r. o. za 1 €</p>
      <h1 class="h1">{name}</h1>
      <p class="found__state">
        <StatusPill status={f.status} />
        {f.status === 'open' ? <span class="small">{typeset(`Dokončite ju do ${textDay(bratislavaDay(f.expiresAt))}.`)}</span> : null}
      </p>
      {p.flash && FLASH[p.flash] ? (
        <p class="notice notice--ok" role="status">
          {FLASH[p.flash]}
        </p>
      ) : null}
      {p.error ? (
        <p class="notice notice--error" role="alert">
          {p.error}
        </p>
      ) : null}
      {f.status === 'open' ? <OpenSteps {...p} steps={steps} base={base} /> : <Progress f={f} />}
      {notes.length > 0 ? (
        <section class="info found__box" aria-labelledby="spravy">
          <h2 id="spravy" class="info__title">
            Správy od nás
          </h2>
          <ul class="plain found__notes">
            {notes
              .slice()
              .reverse()
              .map((e) => (
                <li>
                  <span class="small">
                    {whenName(e.at, p.today)}
                    {e.action === 'call' ? ', výzva na súčinnosť' : ''}
                  </span>
                  <p>{e.note}</p>
                </li>
              ))}
          </ul>
        </section>
      ) : null}
      <p class="small found__help">{typeset(`Otázky nám napíšte na ${BRAND.email}. Do správy uveďte variabilný symbol ${f.vs}.`)}</p>
    </Page>
  )
}

const Step: FC<{ n: number; title: string; done: boolean; locked?: boolean; id: string; children: Child }> = ({ n, title, done, locked, id, children }) => (
  <section class={`info fstep${done ? ' fstep--done' : ''}${locked ? ' fstep--locked' : ''}`} id={id} aria-labelledby={`${id}-t`}>
    <header class="fstep__head">
      <span class="fstep__num" aria-hidden="true">
        {done ? '✓' : n}
      </span>
      <h2 class="info__title fstep__title" id={`${id}-t`}>
        {title}
      </h2>
      {done ? <span class="pill pill--ok">Hotovo</span> : locked ? <span class="pill pill--grey">Neskôr</span> : null}
    </header>
    {children}
  </section>
)

const OpenSteps: FC<FoundingPageProps & { steps: ReturnType<typeof stepsOf>; base: string }> = (p) => {
  const { f, steps, base } = p
  const edit = p.editing || !steps.data
  return (
    <div class="found__flow">
      <Step n={1} id="udaje" title="Vaše údaje a údaje firmy" done={steps.data && !edit}>
        {edit ? <DataForm values={p.values} errors={p.errors} action={`${base}/udaje`} retype={steps.data} /> : <DataSummary f={f} base={base} />}
      </Step>
      <Step n={2} id="doklad" title="Doklad totožnosti" done={steps.id}>
        <p>{typeset('Odfoťte doklad z oboch strán tak, aby boli čitateľné všetky údaje aj fotka. Stačí mobil, súbor do 10 MB (fotka alebo PDF).')}</p>
        <p class="small">{typeset('Kópiu dokladu vyžaduje zákon proti praniu špinavých peňazí. Vidí ju iba naša určená osoba a nikomu inému ju neposielame.')}</p>
        <form class="stack" method="post" action={`${base}/doklad`} enctype="multipart/form-data">
          <div class="fgrid">
            <div class="fgrid__cell">
              <label class="field__label" for="z-predna">
                Predná strana {f.idFrontKey ? <span class="pill pill--ok">nahratá</span> : null}
              </label>
              <input class="field__input" id="z-predna" type="file" name="predna" accept="image/jpeg,image/png,image/webp,application/pdf" />
            </div>
            <div class="fgrid__cell">
              <label class="field__label" for="z-zadna">
                Zadná strana {f.idBackKey ? <span class="pill pill--ok">nahratá</span> : null}
              </label>
              <input class="field__input" id="z-zadna" type="file" name="zadna" accept="image/jpeg,image/png,image/webp,application/pdf" />
            </div>
          </div>
          <button class="btn btn--line" type="submit">
            {steps.id ? 'Nahrať znova' : 'Nahrať doklad'}
          </button>
        </form>
      </Step>
      <Step n={3} id="zmluva" title="Podpis zmluvy" done={steps.signed} locked={!steps.data}>
        {!steps.data ? (
          <p>{typeset('Zmluvu pripravíme z Vašich údajov, keď ich uložíte.')}</p>
        ) : (
          <>
            <p>{typeset('Stiahnite si zmluvu s Vašimi údajmi a vyhlásením a podpíšte ju jedným z dvoch spôsobov:')}</p>
            <p>
              <a class="btn btn--blue" href={`${base}/zmluva.pdf`}>
                Stiahnuť zmluvu na podpis
              </a>
            </p>
            <div class="fgrid found__ways">
              <div class="fgrid__cell">
                <h3 class="info__sub">Občianskym preukazom s čipom (eID)</h3>
                <p class="small">{typeset('Otvorte zmluvu v aplikácii D.Signer zo slovensko.sk, podpíšte ju kvalifikovaným podpisom a nahrajte podpísaný súbor (.asice alebo PDF). Najrýchlejšia cesta.')}</p>
              </div>
              <div class="fgrid__cell">
                <h3 class="info__sub">Na papieri s overeným podpisom</h3>
                <p class="small">
                  {typeset(`Vytlačte zmluvu a podpíšte ju pred notárom alebo na matrike. Sken nahrajte sem a originál pošlite na ${OPERATOR.name}, ${OPERATOR.street}, ${OPERATOR.postalCity}.`)}
                </p>
              </div>
            </div>
            {f.signedKey && !steps.signed ? <p class="notice">{typeset('Údaje ste po podpise zmenili. Stiahnite zmluvu znova a podpíšte novú.')}</p> : null}
            <form class="stack" method="post" action={`${base}/podpis`} enctype="multipart/form-data">
              <fieldset class="field choice">
                <legend class="field__label">Ako ste podpísali</legend>
                <div class="choice__options">
                  <label class="choice__option">
                    <input type="radio" name="druh" value="qes" checked={f.signedKind !== 'paper'} />
                    <span>Elektronicky (eID)</span>
                  </label>
                  <label class="choice__option">
                    <input type="radio" name="druh" value="paper" checked={f.signedKind === 'paper'} />
                    <span>Na papieri s overeným podpisom</span>
                  </label>
                </div>
              </fieldset>
              <div class="field">
                <label class="field__label" for="z-podpis">
                  Podpísaná zmluva
                </label>
                <input class="field__input" id="z-podpis" type="file" name="subor" accept=".asice,.asics,application/pdf,image/jpeg,image/png" />
                <p class="field__hint">Súbor do 25 MB.</p>
              </div>
              <button class="btn btn--line" type="submit">
                Nahrať podpísanú zmluvu
              </button>
            </form>
          </>
        )}
      </Step>
      <Step n={4} id="platba" title={`Platba ${total}`} done={steps.paid} locked={!steps.signed && !steps.paid}>
        {steps.paid ? (
          <p>{typeset(`Platba prišla ${textDay(bratislavaDay(f.paidAt ?? 0))}. Ďakujeme.`)}</p>
        ) : !steps.signed ? (
          <p>{typeset('Platobné údaje uvidíte po podpise zmluvy.')}</p>
        ) : p.pay ? (
          <PayBox pay={p.pay} />
        ) : (
          <p>{typeset(`Platobné údaje Vám pošleme e-mailom. Napíšte nám na ${BRAND.email}.`)}</p>
        )}
      </Step>
      <Step n={5} id="odoslat" title="Odoslať na overenie" done={false} locked={!(steps.data && steps.id && steps.signed)}>
        <p>{typeset('Po odoslaní prihlášku overí naša určená osoba, zvyčajne do dvoch pracovných dní. Údaje potom už meniť nebudete.')}</p>
        {!steps.paid && steps.signed ? <p class="small">{typeset('Prihlášku môžete odoslať aj skôr, ako platba príde. Overíme ju, keď ju uvidíme na účte.')}</p> : null}
        <form method="post" action={`${base}/odoslat`}>
          <button class="btn btn--blue" type="submit" disabled={!(steps.data && steps.id && steps.signed)}>
            Odoslať na overenie
          </button>
        </form>
      </Step>
      {!f.paidAt ? (
        <details class="found__cancel">
          <summary class="link">Zrušiť prihlášku</summary>
          <form method="post" action={`${base}/zrusit`}>
            <p class="small">{typeset('Prihláška a nahraté súbory sa vymažú. Začať môžete kedykoľvek znova.')}</p>
            <button class="btn btn--line" type="submit">
              Áno, zrušiť prihlášku
            </button>
          </form>
        </details>
      ) : null}
    </div>
  )
}

const PayBox: FC<{ pay: { iban: string; vs: string; beneficiary: string } }> = ({ pay }) => {
  const text = payBySquareText(pay)
  const qr = text ? qrPicture(text) : null
  return (
    <div class="found__pay">
      {qr ? (
        <figure class="found__qr">
          <svg viewBox={`0 0 ${qr.size} ${qr.size}`} role="img" aria-label="QR kód platby" shape-rendering="crispEdges">
            <rect width={String(qr.size)} height={String(qr.size)} fill="#ffffff" />
            <path fill="#000000" d={qr.path} />
          </svg>
          <figcaption class="small">Naskenujte v aplikácii banky (PAY by square)</figcaption>
        </figure>
      ) : null}
      <dl class="kv">
        <div>
          <dt>Suma</dt>
          <dd>{formatEurExact(FOUNDING_TOTAL)}</dd>
        </div>
        <div>
          <dt>Účet</dt>
          <dd>{pay.iban.replace(/(.{4})/g, '$1 ').trim()}</dd>
        </div>
        <div>
          <dt>Variabilný symbol</dt>
          <dd>{pay.vs}</dd>
        </div>
        <div>
          <dt>Príjemca</dt>
          <dd>{pay.beneficiary}</dd>
        </div>
      </dl>
      <p class="small">{typeset(`Z toho ${price} za založenie a ${prepaid} kaucia, ktorú Vám odpočítame z posledných faktúr. Pošlite ich z účtu vedeného na Vaše meno: je to súčasť overenia totožnosti. Platbu z cudzieho účtu vrátime.`)}</p>
    </div>
  )
}

const payBySquareText = (pay: { iban: string; vs: string; beneficiary: string }) =>
  payBySquare({ iban: pay.iban, amountCents: FOUNDING_TOTAL, vs: pay.vs, due: null, name: pay.beneficiary, note: 'Zalozenie s.r.o. a kaucia' })

const DataSummary: FC<{ f: Founding; base: string }> = ({ f, base }) => {
  const p = f.founder!
  const c = f.company!
  return (
    <>
      <dl class="kv">
        <div>
          <dt>Zakladateľ a konateľ</dt>
          <dd>{p.name}</dd>
        </div>
        <div>
          <dt>Trvalý pobyt</dt>
          <dd>{p.address}</dd>
        </div>
        <div>
          <dt>Obchodné meno</dt>
          <dd>
            {c.name}
            {c.altName ? `, náhradné ${c.altName}` : ''}
          </dd>
        </div>
        <div>
          <dt>Sídlo</dt>
          <dd>{c.seat}</dd>
        </div>
        <div>
          <dt>Základné imanie</dt>
          <dd>{formatEur(c.capitalCents)}</dd>
        </div>
        <div>
          <dt>Predmet podnikania</dt>
          <dd>{c.activities.join('; ')}</dd>
        </div>
        <div>
          <dt>Balík účtovníctva</dt>
          <dd>{planById(f.plan)?.name ?? f.plan}</dd>
        </div>
      </dl>
      <p>
        <a class="link" href={`${base}?upravit=1#udaje`}>
          Upraviť údaje
        </a>
      </p>
    </>
  )
}

const Radio: FC<{ name: string; label: string; options: [string, string][]; value: string; error?: string; hint?: string }> = ({ name, label, options, value, error, hint }) => (
  <fieldset class="field choice">
    <legend class="field__label">{label}</legend>
    {hint ? <p class="field__hint">{hint}</p> : null}
    <div class="choice__options">
      {options.map(([v, text]) => (
        <label class="choice__option">
          <input type="radio" name={name} value={v} checked={value === v} />
          <span>{text}</span>
        </label>
      ))}
    </div>
    {error ? <p class="field__error">{error}</p> : null}
  </fieldset>
)

const DataForm: FC<{ values: FoundingValues; errors: FoundingErrors; action: string; retype: boolean }> = ({ values: v, errors: e, action, retype }) => (
  <form class="details found__form" method="post" action={action} novalidate>
    {retype ? <p class="notice">{typeset('Rodné číslo a číslo dokladu z bezpečnostných dôvodov nezobrazujeme. Pri úprave ich, prosím, napíšte znova.')}</p> : null}
    <h3 class="info__sub">Zakladateľ (budúci spoločník a konateľ)</h3>
    <Input name="meno" label="Meno a priezvisko" value={v.meno ?? ''} error={e.meno} autocomplete="name" hint="Ako v občianskom preukaze, aj s titulom." />
    <div class="fgrid">
      <div class="fgrid__cell">
        <Input name="rc" label="Rodné číslo" value={v.rc ?? ''} error={e.rc} inputmode="numeric" hint="Bez lomky alebo s ňou." />
      </div>
      <div class="fgrid__cell">
        <Input name="narodeny" label="Dátum narodenia" value={v.narodeny ?? ''} error={e.narodeny} hint="Napríklad 7. 3. 1994." />
      </div>
    </div>
    <Input name="adresa" label="Adresa trvalého pobytu" value={v.adresa ?? ''} error={e.adresa} autocomplete="street-address" />
    <Input name="obcianstvo" label="Štátne občianstvo" value={v.obcianstvo ?? 'slovenské'} error={e.obcianstvo} />
    <Radio name="doklad" label="Doklad totožnosti" options={[['op', 'Občiansky preukaz'], ['pas', 'Cestovný pas']]} value={v.doklad ?? 'op'} error={e.doklad} />
    <div class="fgrid">
      <div class="fgrid__cell">
        <Input name="cislo" label="Číslo dokladu" value={v.cislo ?? ''} error={e.cislo} />
      </div>
      <div class="fgrid__cell">
        <Input name="platnost" label="Platný do" value={v.platnost ?? ''} error={e.platnost} hint="Napríklad 12. 5. 2031." />
      </div>
    </div>
    <Radio
      name="pep"
      label="Ste politicky exponovaná osoba?"
      hint="Napríklad poslanec, člen vlády, sudca, veľvyslanec, vysoký dôstojník, člen vedenia štátnej firmy, alebo ich blízky príbuzný či spoločník."
      options={[['nie', 'Nie'], ['ano', 'Áno']]}
      value={v.pep ?? ''}
      error={e.pep}
    />
    <label class="tickbox">
      <input type="checkbox" name="vlastne" value="ano" checked={v.vlastne === 'ano'} aria-invalid={e.vlastne ? 'true' : undefined} />
      <span>{typeset('Firmu zakladám vo vlastnom mene a na vlastný účet, nie pre niekoho iného.')}</span>
    </label>
    {e.vlastne ? <p class="field__error">{e.vlastne}</p> : null}
    <h3 class="info__sub">Firma</h3>
    <div class="fgrid">
      <div class="fgrid__cell">
        <Input name="firma" label="Obchodné meno" value={v.firma ?? ''} error={e.firma} hint="Napríklad Nova Studio s. r. o." />
      </div>
      <div class="fgrid__cell">
        <Input name="firma2" label="Náhradné obchodné meno" value={v.firma2 ?? ''} optional hint="Ak by prvé už niekto mal." />
      </div>
    </div>
    <Input name="sidlo" label="Adresa sídla" value={v.sidlo ?? ''} error={e.sidlo} />
    <Radio
      name="sidlo_typ"
      label="Sídlo bude"
      options={[
        ['own', 'Vo Vašej nehnuteľnosti'],
        ['rent', 'V prenajatých priestoroch'],
        ['virtual', 'Virtuálne sídlo'],
      ]}
      value={v.sidlo_typ ?? ''}
      error={e.sidlo_typ}
    />
    <div class="field">
      <label class="field__label" for="z-cinnosti">
        Predmet podnikania
      </label>
      <p class="field__hint" id="z-cinnosti-h">
        {typeset('Voľné živnosti, každú na nový riadok. Napríklad „Poskytovanie softvéru“ alebo „Kúpa tovaru na účely jeho predaja konečnému spotrebiteľovi“. Advokát ich zosúladí so zoznamom.')}
      </p>
      <textarea class="field__input field__area" id="z-cinnosti" name="cinnosti" rows={4} aria-describedby="z-cinnosti-h" aria-invalid={e.cinnosti ? 'true' : undefined}>
        {v.cinnosti ?? ''}
      </textarea>
      {e.cinnosti ? <p class="field__error">{e.cinnosti}</p> : null}
    </div>
    <div class="fgrid">
      <div class="fgrid__cell">
        <Input name="imanie" label="Základné imanie v eurách" value={v.imanie ?? '5000'} error={e.imanie} inputmode="numeric" />
      </div>
      <div class="fgrid__cell">
        <Input name="zdroj" label="Odkiaľ sú peniaze na imanie" value={v.zdroj ?? ''} error={e.zdroj} hint="Napríklad úspory zo zamestnania." />
      </div>
    </div>
    <h3 class="info__sub">Ako bude firma fungovať</h3>
    <Radio name="obrat" label="Očakávaný ročný obrat" options={TURNOVERS.map((t) => [t, TURNOVER_WORDS[t] ?? t])} value={v.obrat ?? ''} error={e.obrat} />
    <Radio name="hotovost" label="Budete prijímať alebo platiť hotovosť nad 10 000 € naraz?" options={[['nie', 'Nie'], ['ano', 'Áno']]} value={v.hotovost ?? ''} error={e.hotovost} />
    <Input name="zahranicie" label="Pravidelní partneri mimo EÚ" value={v.zahranicie ?? ''} optional hint="Ak áno, napíšte krajiny." />
    <Input name="telefon" label="Telefón" value={v.telefon ?? ''} error={e.telefon} type="tel" autocomplete="tel" optional />
    <button class="btn btn--blue btn--large" type="submit">
      Uložiť údaje
    </button>
  </form>
)

/** Where an application stands after it was handed over: the formation's steps, the one it is at. */
const PATH: FoundingStatus[] = ['verifying', 'verified', 'ordered', 'signing', 'filed', 'registered']

const Progress: FC<{ f: Founding }> = ({ f }) => {
  if (f.status === 'lapsed') return <Ended title="Prihláška zanikla" text="Prihlášku ste nedokončili včas, takže nič neplatíte a nahraté súbory sme vymazali. Začať môžete kedykoľvek znova." again />
  if (f.status === 'cancelled') return <Ended title="Prihláška je zrušená" text="Ak ste platbu poslali, vrátime ju na účet, z ktorého prišla, do 14 dní." again />
  if (f.status === 'refused') return <Ended title="Prihlášku sme nemohli prijať" text="Dôvod nájdete v správach nižšie. Platbu, ak prišla, vrátime na účet, z ktorého prišla, do 14 dní." />
  if (f.status === 'withdrawn') return <Ended title="Založenie sme ukončili" text={`Ani po druhej výzve sme nedostali potrebnú súčinnosť, preto sme od zmluvy odstúpili. Platba sa podľa článku 5 zmluvy nevracia.`} />
  const at = PATH.indexOf(f.status)
  return (
    <section class="info found__box" aria-labelledby="priebeh">
      <h2 id="priebeh" class="info__title">
        Priebeh založenia
      </h2>
      <ol class="found__path">
        {PATH.map((s, i) => (
          <li class={i < at ? 'is-done' : i === at ? 'is-now' : ''}>
            <span class="found__dot" aria-hidden="true" />
            <span>{STATUS_WORDS[s]}</span>
          </li>
        ))}
      </ol>
      {f.status === 'verified' && f.month ? <p class="small">{typeset(`Založenie je naplánované na ${monthName(`${f.month}-01`)}.`)}</p> : null}
      {f.status === 'registered' ? (
        <p>
          <a class="btn btn--blue" href="/app/prihlasenie">
            Prihlásiť sa do aplikácie
          </a>
        </p>
      ) : null}
    </section>
  )
}

const Ended: FC<{ title: string; text: string; again?: boolean }> = ({ title, text, again }) => (
  <section class="info found__box">
    <h2 class="info__title">{title}</h2>
    <p>{typeset(text)}</p>
    {again ? (
      <p>
        <a class="btn btn--line" href="/zalozenie">
          Začať novú prihlášku
        </a>
      </p>
    ) : null}
  </section>
)

// ---------------------------------------------------------------------------------------------------------------
// The designated person
// ---------------------------------------------------------------------------------------------------------------

const GROUPS: { title: string; statuses: FoundingStatus[] }[] = [
  { title: 'Na overenie', statuses: ['verifying'] },
  { title: 'V založení', statuses: ['verified', 'ordered', 'signing', 'filed'] },
  { title: 'Rozpracované zakladateľom', statuses: ['open'] },
  { title: 'Uzavreté', statuses: [...FINAL] },
]

export const FoundingsList: FC<{ list: Founding[]; places: number; today: string }> = ({ list, places, today }) => (
  <div class="stack">
    <a class="back" href="/ucto/ziadosti">
      Späť na žiadosti
    </a>
    <h1 class="h1">Založenia s. r. o. za 1 €</h1>
    <p>{typeset(`Tento mesiac zostáva ${places} z ${FORMATION.perMonth} miest. Prihlášky vidí iba určená osoba.`)}</p>
    {GROUPS.map((g) => {
      const rows = list.filter((f) => g.statuses.includes(f.status))
      return rows.length === 0 ? null : (
        <section class="info">
          <h2 class="info__title">
            {g.title} ({rows.length})
          </h2>
          <ul class="plain">
            {rows.map((f) => (
              <li class="check">
                <div class="check__text">
                  <span class="check__title">
                    <a class="link" href={`/ucto/zalozenia/${f.id}`}>
                      {f.company?.name ?? f.email}
                    </a>
                    <StatusPill status={f.status} />
                  </span>
                  <span class="check__sub">
                    <span>{f.founder?.name ?? 'bez údajov'}</span>
                    <span>VS {f.vs}</span>
                    <span>{f.paidAt ? `zaplatené ${formatEurExact(f.paidCents ?? 0)}` : 'nezaplatené'}</span>
                    <span>zmena {whenName(f.updatedAt, today)}</span>
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )
    })}
    {list.length === 0 ? <p class="info__empty">Zatiaľ žiadna prihláška.</p> : null}
  </div>
)

export const CHECK_WORDS: Record<CheckKind, string> = {
  identity: 'Totožnosť: doklad, údaje a podpis patria tej istej osobe',
  pep: 'Politicky exponovaná osoba (vlastné vyhľadanie)',
  sanctions: 'Sankčné zoznamy EÚ a OSN',
  debts: 'Dlžníci a úpadcovia: zoznamy Sociálnej poisťovne, zdravotných poisťovní, finančnej správy a register úpadcov',
  signature: 'Podpis zmluvy (kvalifikovaný alebo úradne osvedčený) na tomto texte',
  payment: 'Platba z účtu na meno zakladateľa',
  original: 'Originál s osvedčeným podpisom prišiel poštou',
}

export interface FoundingDetailProps {
  f: Founding
  checks: FoundingCheck[]
  events: FoundingEvent[]
  blockers: string[]
  today: string
  flash: string | null
  error: string | null
  canWithdraw: boolean
  /** The checks the app prepared (aml/proposals.ts): the founder on the sanctions lists, the payment it paired. */
  proposals?: FoundingProposals
}

const MOVE_WORDS: Partial<Record<FoundingStatus, string>> = { ordered: 'Advokát objednaný', signing: 'Dokumenty advokáta poslané na podpis', filed: 'Návrh podaný na súd' }

export const FoundingDetail: FC<FoundingDetailProps> = ({ f, checks, events, blockers, today, flash, error, canWithdraw, proposals = {} }) => {
  const p = f.founder
  const c = f.company
  const base = `/ucto/zalozenia/${f.id}`
  const latest = new Map(checks.map((k) => [k.kind, k]))
  const next: FoundingStatus | null = f.status === 'verified' ? 'ordered' : f.status === 'ordered' ? 'signing' : f.status === 'signing' ? 'filed' : null
  const payerMatches = p && f.payerName ? sameName(f.payerName, p.name) : null
  return (
    <div class="stack">
      <a class="back" href="/ucto/zalozenia">
        Späť na založenia
      </a>
      <h1 class="h1">{c?.name ?? f.email}</h1>
      <p>
        <StatusPill status={f.status} /> <span class="small">VS {f.vs}, prihláška {whenName(f.createdAt, today)}{f.month ? `, mesiac ${f.month}` : ''}</span>
      </p>
      {flash ? <p class="notice notice--ok" role="status">{flash}</p> : null}
      {error ? <p class="notice notice--error" role="alert">{error}</p> : null}
      <section class="info">
        <h2 class="info__title">Zakladateľ</h2>
        {p ? (
          <dl class="kv">
            <div><dt>Meno</dt><dd>{p.name}</dd></div>
            <div><dt>Rodné číslo</dt><dd>{p.birthNumber || 'nemá'}</dd></div>
            <div><dt>Dátum narodenia</dt><dd>{textDay(p.born)}</dd></div>
            <div><dt>Trvalý pobyt</dt><dd>{p.address}</dd></div>
            <div><dt>Občianstvo</dt><dd>{p.nationality}</dd></div>
            <div><dt>Doklad</dt><dd>{p.idKind === 'pas' ? 'pas' : 'OP'} {p.idNumber}, platný do {textDay(p.idValid)}</dd></div>
            <div><dt>PEP</dt><dd>{p.pep ? 'áno' : 'nie'}</dd></div>
            <div><dt>Pôvod imania</dt><dd>{p.funds}</dd></div>
            <div><dt>Obrat, hotovosť, mimo EÚ</dt><dd>{TURNOVER_WORDS[p.turnover] ?? p.turnover}; {p.cash ? 'hotovosť áno' : 'hotovosť nie'}; {p.abroad || 'nie'}</dd></div>
            <div><dt>E-mail, telefón</dt><dd>{f.email}{f.phone ? `, ${f.phone}` : ''}</dd></div>
            {f.source ? <div><dt>Odkiaľ prišiel</dt><dd>{Object.entries(f.source).map(([k, v]) => `${k}=${v}`).join(', ')}</dd></div> : null}
          </dl>
        ) : (
          <p>Zakladateľ ešte nevyplnil údaje.</p>
        )}
        {p && riskHints(p).length > 0 ? (
          <ul class="plain">
            {riskHints(p).map((h) => (
              <li class="notice">{h}</li>
            ))}
          </ul>
        ) : null}
      </section>
      {c ? (
        <section class="info">
          <h2 class="info__title">Firma</h2>
          <dl class="kv">
            <div><dt>Obchodné meno</dt><dd>{c.name}{c.altName ? ` (náhradné ${c.altName})` : ''}</dd></div>
            <div><dt>Sídlo</dt><dd>{c.seat} ({c.seatBasis === 'own' ? 'vlastná nehnuteľnosť' : c.seatBasis === 'rent' ? 'nájom' : 'virtuálne sídlo'})</dd></div>
            <div><dt>Imanie</dt><dd>{formatEur(c.capitalCents)}</dd></div>
            <div><dt>Predmet podnikania</dt><dd>{c.activities.join('; ')}</dd></div>
            <div><dt>Balík</dt><dd>{planById(f.plan)?.name ?? f.plan}</dd></div>
          </dl>
        </section>
      ) : null}
      <section class="info">
        <h2 class="info__title">Doklad, podpis a platba</h2>
        <dl class="kv">
          <div><dt>Doklad</dt><dd>{f.idFrontKey ? <a class="link" href={`${base}/subor/predna`}>predná strana</a> : 'chýba'}{', '}{f.idBackKey ? <a class="link" href={`${base}/subor/zadna`}>zadná strana</a> : 'chýba'}</dd></div>
          <div><dt>Podpísaná zmluva</dt><dd>{f.signedKey ? <><a class="link" href={`${base}/subor/podpis`}>{f.signedKind === 'paper' ? 'sken s overeným podpisom' : 'elektronicky podpísaný súbor'}</a>{f.signedContractHash === f.contractHash ? ', na aktuálny text' : ', NA STARŠÍ TEXT'}</> : 'chýba'}</dd></div>
          <div><dt>Text zmluvy SHA-256</dt><dd class="kv__long">{f.contractHash ?? 'nie je'}</dd></div>
          {f.signedKind === 'paper' ? <div><dt>Originál poštou</dt><dd>{f.originalAt ? `prišiel ${textDay(bratislavaDay(f.originalAt))}` : 'ešte neprišiel'}</dd></div> : null}
          <div><dt>Platba</dt><dd>{f.paidAt ? `${formatEurExact(f.paidCents ?? 0)}, ${textDay(bratislavaDay(f.paidAt))}` : 'neprišla'}</dd></div>
          {f.paidAt ? <div><dt>Platiteľ</dt><dd>{f.payerName ?? 'bez mena'}, {f.payerIban ?? 'bez účtu'}{payerMatches === false ? ' (MENO SA NEZHODUJE)' : payerMatches ? ' (meno sa zhoduje)' : ''}</dd></div> : null}
        </dl>
        {!f.paidAt ? (
          <form method="post" action={`${base}/platba`}>
            <button class="btn btn--line btn--small" type="submit">Pozrieť platbu znova</button>
          </form>
        ) : null}
        {f.contractText ? (
          <details>
            <summary class="link">Text zmluvy, ako ho zakladateľ dostal</summary>
            <pre class="found__pre">{f.contractText}</pre>
          </details>
        ) : null}
      </section>
      <section class="info">
        <h2 class="info__title">Kontroly určenej osoby</h2>
        <ul class="plain">
          {checksNeeded(f).map((kind) => {
            const k = latest.get(kind)
            return (
              <li class="check">
                <div class="check__text">
                  <span class="check__title">
                    {CHECK_WORDS[kind]}
                    <span class={`pill ${k ? (k.result === 'clear' ? 'pill--ok' : 'pill--red') : 'pill--grey'}`}>{k ? (k.result === 'clear' ? 'v poriadku' : 'problém') : 'chýba'}</span>
                  </span>
                  {k ? <span class="check__sub"><span>{k.byName ?? ''}, {whenName(k.at, today)}</span><span>{k.note}</span></span> : null}
                </div>
              </li>
            )
          })}
        </ul>
        {f.status === 'verifying'
          ? (['sanctions', 'payment'] as const).map((kind) => {
              const prepared = proposals[kind]
              if (!prepared || latest.get(kind)?.result === 'clear') return null
              if ('missing' in prepared)
                return (
                  <p class="small" data-found-proposal-missing={kind}>
                    {CHECK_WORDS[kind]}: {prepared.missing}
                  </p>
                )
              const p = prepared.proposal
              return (
                <form class="stack info" method="post" action={`${base}/kontrola`} data-found-proposal={kind}>
                  <p class="notice">{p.result ? `${CHECK_WORDS[kind]}: kontrolu pripravila aplikácia. Prečítajte text a zaznamenajte ju.` : `${CHECK_WORDS[kind]}: aplikácia našla niečo na posúdenie. Rozhodnite o výsledku.`}</p>
                  <input type="hidden" name="druh" value={kind} />
                  <label class="field__label" for={`kp-${kind}-vysledok`}>Výsledok</label>
                  <select class="field__input" id={`kp-${kind}-vysledok`} name="vysledok" required>
                    {p.result ? null : <option value="">Vyberte výsledok</option>}
                    <option value="clear" selected={p.result === 'clear'}>V poriadku</option>
                    <option value="problem">Problém</option>
                  </select>
                  <label class="field__label" for={`kp-${kind}-zdroj`}>Zdroj a čo bolo overené</label>
                  <textarea class="field__input" id={`kp-${kind}-zdroj`} name="poznamka" rows={6} required minlength={12}>{p.source}</textarea>
                  <button class={p.result ? 'btn btn--blue' : 'btn btn--line'} type="submit">Zaznamenať kontrolu</button>
                </form>
              )
            })
          : null}
        {f.status === 'verifying' ? (
          <form class="stack" method="post" action={`${base}/kontrola`}>
            <div class="fgrid">
              <div class="fgrid__cell">
                <label class="field__label" for="k-druh">Kontrola</label>
                <select class="field__input" id="k-druh" name="druh">
                  {CHECK_KINDS.filter((k) => checksNeeded(f).includes(k)).map((k) => <option value={k}>{CHECK_WORDS[k]}</option>)}
                </select>
              </div>
              <div class="fgrid__cell">
                <label class="field__label" for="k-vysledok">Výsledok</label>
                <select class="field__input" id="k-vysledok" name="vysledok">
                  <option value="clear">V poriadku</option>
                  <option value="problem">Problém</option>
                </select>
              </div>
            </div>
            <label class="field__label" for="k-zdroj">Zdroj a čo ste overili</label>
            <textarea class="field__input" id="k-zdroj" name="poznamka" rows={2} required minlength={12} placeholder="Napríklad: sankčné zoznamy EÚ (sanctionsmap.eu) a OSN, 28. 10. 2026, bez zhody"></textarea>
            <button class="btn btn--line" type="submit">Zaznamenať kontrolu</button>
          </form>
        ) : null}
      </section>
      {f.status === 'verifying' ? (
        <section class="info">
          <h2 class="info__title">Rozhodnutie</h2>
          {blockers.length > 0 ? (
            <ul class="plain">
              {blockers.map((b) => <li class="notice">{b}</li>)}
            </ul>
          ) : (
            <p>{typeset('Všetko je overené. Prijatím vznikne zmluva a zakladateľ dostane potvrdenie.')}</p>
          )}
          <form class="stack" method="post" action={`${base}/rozhodnutie`}>
            <label class="field__label" for="r-pozn">Poznámka (pri odmietnutí ju zakladateľ uvidí)</label>
            <textarea class="field__input" id="r-pozn" name="poznamka" rows={2}></textarea>
            <div class="page__more">
              {blockers.length === 0 ? <button class="btn btn--blue" type="submit" name="verdikt" value="verified">Overiť a prijať</button> : null}
              <button class="btn btn--line" type="submit" name="verdikt" value="refused">Odmietnuť</button>
              <button class="btn btn--text" type="submit" name="verdikt" value="open">Vrátiť zakladateľovi na doplnenie</button>
            </div>
          </form>
        </section>
      ) : null}
      {!FINAL.includes(f.status) && f.status !== 'verifying' && f.status !== 'open' ? (
        <section class="info">
          <h2 class="info__title">Priebeh založenia</h2>
          {next ? (
            <form class="stack" method="post" action={`${base}/stav`}>
              <input type="hidden" name="na" value={next} />
              <label class="field__label" for="s-pozn">Poznámka pre zakladateľa (nepovinná)</label>
              <textarea class="field__input" id="s-pozn" name="poznamka" rows={2}></textarea>
              <button class="btn btn--blue" type="submit">{MOVE_WORDS[next]}</button>
            </form>
          ) : null}
          {f.status === 'filed' ? (
            <form class="stack" method="post" action={`${base}/registracia`}>
              <div class="fgrid">
                <div class="fgrid__cell">
                  <label class="field__label" for="s-ico">IČO zapísanej firmy</label>
                  <input class="field__input" id="s-ico" name="ico" inputmode="numeric" required />
                </div>
                <div class="fgrid__cell">
                  <label class="field__label" for="s-vznik">Deň vzniku (zápisu do registra)</label>
                  <input class="field__input" id="s-vznik" name="vznik" placeholder={textDay(today)} />
                </div>
              </div>
              <p class="field__hint">{typeset('Firmu založíme v aplikácii z údajov registra, s balíkom zo zmluvy a kauciou na posledné faktúry. Zakladateľ dostane odkaz na prihlásenie.')}</p>
              <button class="btn btn--blue" type="submit">Firma je zapísaná</button>
            </form>
          ) : null}
          <form class="stack" method="post" action={`${base}/vyzva`}>
            <label class="field__label" for="s-vyzva">{`Výzva na súčinnosť (doteraz ${f.calls})`}</label>
            <textarea class="field__input" id="s-vyzva" name="text" rows={2} required placeholder="Čo potrebujeme, dokedy a ako to poslať"></textarea>
            <p class="field__hint">{typeset(`Po druhej výzve a ${FORMATION.cooperateDays} dňoch bez súčinnosti môžete od zmluvy odstúpiť (článok 5).`)}</p>
            <button class="btn btn--line" type="submit">Poslať výzvu</button>
          </form>
          {canWithdraw ? (
            <form class="stack" method="post" action={`${base}/odstupit`}>
              <label class="field__label" for="s-odst">Dôvod odstúpenia</label>
              <textarea class="field__input" id="s-odst" name="poznamka" rows={2} required></textarea>
              <button class="btn btn--line" type="submit">Odstúpiť pre nesúčinnosť (platba sa nevracia)</button>
            </form>
          ) : null}
        </section>
      ) : null}
      {!FINAL.includes(f.status) ? (
        <section class="info">
          <h2 class="info__title">Správa zakladateľovi</h2>
          <form class="stack" method="post" action={`${base}/sprava`}>
            <textarea class="field__input" name="text" rows={2} required></textarea>
            <button class="btn btn--line" type="submit">Poslať správu</button>
          </form>
          <details>
            <summary class="link">Zrušiť prihlášku</summary>
            <form class="stack" method="post" action={`${base}/zrusit`}>
              <p class="small">{typeset('Zrušenie z našej strany: ak prišla platba, vráťte ju celú do 14 dní a zaznamenajte to.')}</p>
              <textarea class="field__input" name="poznamka" rows={2} required placeholder="Dôvod"></textarea>
              <button class="btn btn--line" type="submit">Zrušiť prihlášku</button>
            </form>
          </details>
        </section>
      ) : null}
      {(f.status === 'refused' || f.status === 'cancelled') && f.paidAt && !events.some((e) => e.action === 'refunded') ? (
        <section class="info">
          <h2 class="info__title">Vrátenie platby</h2>
          <form class="stack" method="post" action={`${base}/vratene`}>
            <label class="field__label" for="v-pozn">Kedy a na aký účet</label>
            <textarea class="field__input" id="v-pozn" name="poznamka" rows={2} required></textarea>
            <button class="btn btn--line" type="submit">Platba je vrátená</button>
          </form>
        </section>
      ) : null}
      {f.status === 'registered' ? (
        <section class="info">
          <h2 class="info__title">Odstupné pri skoršom konci zmluvy</h2>
          <p class="small">
            {typeset(
              `Podľa článku 7 sa odstupné fakturuje samo, keď firma zmluvu vypovie pred koncom ${FORMATION.commitMonths} mesiacov. Ak zmluvu ukončíme my pre neplatenie, zvoľte „Účtovať“. Ak sme pochybili my, zvoľte „Neúčtovať“.`,
            )}
          </p>
          <p>Teraz: {f.exitDecision === 'charge' ? 'účtovať vždy' : f.exitDecision === 'waive' ? 'neúčtovať' : 'podľa pravidla (výpoveď firmy)'}</p>
          <form class="stack" method="post" action={`${base}/odstupne`}>
            <select class="field__input" name="rozhodnutie">
              <option value="">Podľa pravidla</option>
              <option value="charge" selected={f.exitDecision === 'charge'}>
                Účtovať (ukončili sme pre porušenie zmluvy firmou)
              </option>
              <option value="waive" selected={f.exitDecision === 'waive'}>
                Neúčtovať (náš podstatný nedostatok)
              </option>
            </select>
            <textarea class="field__input" name="poznamka" rows={2} required placeholder="Dôvod"></textarea>
            <button class="btn btn--line" type="submit">
              Uložiť
            </button>
          </form>
        </section>
      ) : null}
      <section class="info">
        <h2 class="info__title">História</h2>
        <ul class="plain">
          {events.slice().reverse().map((e) => (
            <li class="check">
              <div class="check__text">
                <span class="check__title">{EVENT_WORDS[e.action] ?? e.action}{e.action === 'moved' || e.action === 'decided' ? `: ${STATUS_WORDS[e.status]}` : ''}</span>
                <span class="check__sub"><span>{whenName(e.at, today)}</span><span>{e.byName ?? 'zakladateľ'}</span>{e.note ? <span>{e.note}</span> : null}</span>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

const EVENT_WORDS: Record<string, string> = {
  created: 'Prihláška vytvorená',
  data: 'Údaje uložené',
  'id-front': 'Predná strana dokladu',
  'id-back': 'Zadná strana dokladu',
  signed: 'Podpísaná zmluva nahratá',
  paid: 'Platba prišla',
  moved: 'Stav',
  decided: 'Rozhodnutie',
  note: 'Správa zakladateľovi',
  call: 'Výzva na súčinnosť',
  registered: 'Firma zapísaná',
  approved: 'Firma schválila zmluvu',
  refunded: 'Platba vrátená',
}

// ---------------------------------------------------------------------------------------------------------------
// The company's approval (§ 64 ods. 1 of the Commercial Code)
// ---------------------------------------------------------------------------------------------------------------

export const FoundingApprovePage: FC<{ f: Founding; owner: boolean; prepaidLeft: number; dueOn: string | null; today: string }> = ({ f, owner, prepaidLeft, dueOn, today }) => (
  <div class="stack">
    <h1 class="h1">Zmluva o založení</h1>
    <section class="info">
      <h2 class="info__title">{f.approvedAt ? 'Firma zmluvu schválila' : 'Schválenie zmluvy firmou'}</h2>
      {f.approvedAt ? (
        <p>{typeset(`Schválené ${whenName(f.approvedAt, today)}. Firma je zo zmluvy zaviazaná od začiatku.`)}</p>
      ) : (
        <>
          <p>{typeset(`Zmluvu ste podpísali ešte pred vznikom firmy. Podľa § 64 Obchodného zákonníka ju firma schváli do troch mesiacov od svojho vzniku${dueOn ? `, teda do ${textDay(dueOn)}` : ''}. Potom ste zo zmluvy zaviazaní už nie Vy osobne, ale firma.`)}</p>
          {owner ? (
            <form method="post" action="/app/zalozenie/schvalit">
              <label class="tickbox">
                <input type="checkbox" name="suhlas" value="1" required />
                <span>{typeset('Ako jediný spoločník a konateľ za firmu schvaľujem zmluvu, ktorú som uzavrel(a) v jej mene pred jej vznikom.')}</span>
              </label>
              <button class="btn btn--blue" type="submit">
                Schváliť zmluvu
              </button>
            </form>
          ) : (
            <p class="small">Zmluvu schvaľuje vlastník firmy.</p>
          )}
        </>
      )}
      <dl class="kv">
        <div>
          <dt>Kaucia na posledné faktúry</dt>
          <dd>{formatEurExact(prepaidLeft)}</dd>
        </div>
      </dl>
    </section>
    {f.contractText ? (
      <section class="info">
        <h2 class="info__title">Text zmluvy</h2>
        <pre class="found__pre">{f.contractText}</pre>
      </section>
    ) : null}
  </div>
)
