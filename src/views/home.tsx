import type { FC } from 'hono/jsx'
import { MONY } from '../assistant/mony'
import { annualPlanCents, type CalcResult } from '../calc'
import { SRO_PATH } from '../content/sro-calc'
import { SZCO_PATH } from '../content/szco-calc'
import { WAGE_PATH } from '../content/wage-calc'
import { ART, BRAND, CUSTOM_PLAN, LEAD_PLAN, OPERATOR, PLANS, REGISTER_URL, asset, type Art, type PlanId } from '../config'
import { copy, planRows } from '../copy'
import { formatEur } from '../format'

/** Where a visitor came from (utm_* and ref), carried by every link and form to the request. */
export type Carry = readonly (readonly [string, string])[]

export function withCarry(path: string, carry: Carry, extra: Record<string, string> = {}): string {
  const params = new URLSearchParams(extra)
  for (const [name, value] of carry) params.set(name, value)
  const query = params.toString()
  return query ? `${path}?${query}` : path
}

export const CarryFields: FC<{ carry: Carry }> = ({ carry }) => (
  <>
    {carry.map(([name, value]) => (
      <input type="hidden" name={name} value={value} />
    ))}
  </>
)

export interface CalcState {
  values: { monthly: string; perDoc: string; docs: string; closing: string; vat: 'ano' | 'nie'; people: string }
  result: CalcResult | null
  invalid: boolean
}

/** One of the owner's pictures, or nothing while it does not exist. */
export const Picture: FC<{ art: Art | null; className: string; sizes?: string; eager?: boolean }> = ({ art, className, sizes, eager }) =>
  art ? (
    <img
      class={className}
      src={art.src}
      srcset={art.small ? `${art.small.src} ${art.small.width}w, ${art.src} ${art.width}w` : undefined}
      sizes={art.small ? (sizes ?? '100vw') : undefined}
      alt={art.alt}
      width={art.width}
      height={art.height}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
    />
  ) : null

/** A check in a circle: done. Drawn by the stylesheet. */
const Tick: FC = () => <span class="tick" aria-hidden="true"></span>

/** One of his glass icons in a rounded tile, the way CloudTalk sets its icons. */
export const Tile: FC<{ art: Art | null; size?: 'sm' | 'md' | 'lg'; eager?: boolean }> = ({ art, size = 'md', eager }) => (
  <span class={`tile tile--${size}`} aria-hidden="true">
    <Picture art={art} className="tile__img" sizes={size === 'lg' ? '88px' : size === 'md' ? '64px' : '40px'} eager={eager} />
  </span>
)

/** A section's title: the plain half in the blue sans, the warm half in the red serif. */
const Title: FC<{ id: string; first: string; second?: string }> = ({ id, first, second }) => (
  <h2 id={id} class="title">
    <span class="title__sans">{first}</span>
    {second ? (
      <>
        {' '}
        <em class="title__serif">{second}</em>
      </>
    ) : null}
  </h2>
)

/* The opening ---------------------------------------------------------------------------------------------- */

/**
 * The opening, built the way CloudTalk builds its own: a panel of blue and red light with the promise on it,
 * his glass floating in it, and the card where a client starts, lying over its lower edge.
 */
const Hero: FC<{ carry: Carry }> = ({ carry }) => (
  <section class="hero" aria-labelledby="hero-title">
    <div class="wrap hero__grid">
      <div class="hero__panel">
        <div class="hero__copy">
          <h1 id="hero-title" class="hero__title">
            <span class="hero__line">{copy.hero.first}</span> <em class="hero__line hero__line--serif">{copy.hero.second}</em>
          </h1>
          <p class="hero__lead">{copy.hero.lead}</p>
        </div>
        <ul class="hero__glass" aria-hidden="true">
          <li class="hero__float hero__float--1">
            <Picture art={ART.paperInvoice} className="hero__float-img" sizes="(max-width: 640px) 120px, 240px" eager />
          </li>
          <li class="hero__float hero__float--2">
            <Picture art={ART.savings} className="hero__float-img" sizes="(max-width: 640px) 90px, 160px" eager />
          </li>
          <li class="hero__float hero__float--3">
            <Picture art={ART.paperReceipt} className="hero__float-img" sizes="(max-width: 640px) 80px, 130px" eager />
          </li>
        </ul>
      </div>
      <div class="hero__side">
        <div class="hero__card">
          <div class="hero__card-head">
            <Tile art={ART.mark} size="md" eager />
            <h2 class="hero__card-title">{copy.card.title}</h2>
          </div>
          <p class="hero__card-text">{copy.card.text}</p>
          <StartForm carry={carry} id="ico-hero" compact />
          <p class="hero__card-next">{copy.card.next}</p>
          <p class="hero__card-foot">
            <span>{copy.card.fine}</span>
            <a class="link" href={withCarry('/zacat', carry, { nova: '1' })}>
              {copy.final.noCompany}
            </a>
          </p>
        </div>
      </div>
      <div class="hero__below">
        <p class="hero__price">{copy.hero.price}</p>
        <p class="hero__actions">
          <a class="btn btn--line" href="#cennik">
            {copy.hero.secondary}
          </a>
          <a class="btn btn--text" href="#ako-to-funguje">
            {copy.hero.how}
          </a>
        </p>
      </div>
    </div>
  </section>
)

/* One month: the papers fly in and are booked ------------------------------------------------------------- */

/** The papers of a month, in the order of the card's rows. */
const PAPERS = [ART.paperReceipt, ART.paperInvoice, ART.paperBank, ART.paperEinvoice, ART.paperReturn] as const

/**
 * One month of a young company as a card, the way CloudTalk shows a feed. Where the browser can tie an
 * animation to scrolling, the card stands still while his glass papers fly into it one by one and each
 * becomes a booked row; elsewhere it stands finished.
 */
const Flow: FC = () => {
  const f = copy.flow
  return (
    <section class="flow" id="ako-to-funguje" aria-labelledby="flow-title">
      <header class="wrap head head--center">
        <Title id="flow-title" first={f.first} second={f.second} />
        <p class="lead">{f.lead}</p>
      </header>
      <div class="flow__track">
        <div class="flow__stage">
          <div class="wrap">
            <div class="flow__panel">
              <figure class="feed" aria-label={f.label}>
                <div class="feed__head">
                  <span class="feed__month">{f.month}</span>
                  <span class="feed__company">{f.company}</span>
                  <span class="feed__count">{f.count}</span>
                </div>
                <ul class="feed__rows">
                  {f.rows.map((row, i) => (
                    <li class={`feed__row feed__row--${i + 1}`}>
                      <Tile art={PAPERS[i] ?? null} size="sm" />
                      <span class="feed__text">
                        <span class="feed__title">{row.title}</span>
                        <span class="feed__sub">{row.sub}</span>
                      </span>
                      <span class="feed__end">
                        {row.amount ? <span class="feed__amount">{row.amount}</span> : null}
                        <span class="pill pill--ok">{row.state}</span>
                      </span>
                    </li>
                  ))}
                </ul>
                <div class="feed__foot">
                  <Tick />
                  <span class="feed__done">{f.foot}</span>
                  <span class="feed__by">{f.footSub}</span>
                </div>
                <ul class="flyers" aria-hidden="true">
                  {PAPERS.map((art, i) => (
                    <li class={`flyer flyer--${i + 1}`}>
                      <Picture art={art} className="flyer__img" sizes="(max-width: 640px) 96px, 160px" />
                    </li>
                  ))}
                </ul>
              </figure>
            </div>
            <p class="flow__example">{f.example}</p>
          </div>
        </div>
      </div>
      {/* Plays the month where scroll timelines are missing (public/flow.js); the only script of the site. */}
      <script src={asset('/flow.js')} defer></script>
    </section>
  )
}

/** Why Firmony: three things a visitor feels at once, and beside them what is usual and what we do instead. */
const WHY_ART: readonly (Art | null)[] = [ART.paperReceipt, ART.savings, ART.chat]

const Why: FC = () => (
  <section class="section why" aria-labelledby="why-title">
    <header class="wrap head head--center">
      <Title id="why-title" first={copy.why.first} second={copy.why.second} />
    </header>
    <ul class="wrap why__grid">
      {copy.why.items.map((item, i) => (
        <li class="card why__card">
          <Tile art={WHY_ART[i] ?? null} size="lg" />
          <h3 class="h3">{item.title}</h3>
          <p class="why__text">{item.text}</p>
        </li>
      ))}
    </ul>
    <section class="wrap versus" aria-labelledby="versus-title">
      <h2 id="versus-title" class="title title--small versus__title">
        <span class="title__sans">{copy.versus.first}</span> <em class="title__serif">{copy.versus.second}</em>
      </h2>
      <div class="versus__grid">
        <article class="versus__side versus__side--usual">
          <h3 class="versus__name">{copy.versus.usual.title}</h3>
          <ul class="versus__list">
            {copy.versus.usual.items.map((item) => (
              <li>
                <span class="versus__mark versus__mark--usual" aria-hidden="true"></span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </article>
        <article class="versus__side versus__side--ours">
          <h3 class="versus__name">{copy.versus.ours.title}</h3>
          <ul class="versus__list">
            {copy.versus.ours.items.map((item) => (
              <li>
                <Tick />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </article>
      </div>
    </section>
  </section>
)

/** The glass icon of each deal card, in the same order as copy.offer.items. */
const OFFER_ART: readonly (Art | null)[] = [ART.offerFirstMonth, ART.offerCompanyFormation, ART.offerSwitch, ART.offerInvoices]

/** The one offer the visitor cannot refuse: four cards on a virtual ring. The card in front is the hero in the
 *  middle, one card each side is visible and readable, and the fourth hides behind. public/flow.js turns the ring
 *  a quarter turn on a click, an arrow key or a swipe, so it never ends and never jumps. */
const Offer: FC<{ carry: Carry }> = ({ carry }) => {
  const o = copy.offer
  return (
    <section class="section offer" aria-labelledby="offer-title">
      <div class="wrap">
        <header class="head head--center offer__head">
          <p class="eyebrow">{o.eyebrow}</p>
          <h2 id="offer-title" class="title">
            <span class="title__sans">{o.title}</span>
          </h2>
          <p class="lead">{o.lead}</p>
        </header>

        <div class="offer__stage" data-offer-stage role="region" aria-roledescription="Kolotoč" aria-label={o.eyebrow} tabindex={0}>
          <div class="offer__ring">
            <ul class="offer__track">
              {o.items.map((item, i) => (
                <li class="offer__card">
                  <span class="offer__badge">0 €</span>
                  <div class="offer__art" aria-hidden="true">
                    <Picture art={OFFER_ART[i] ?? null} className="offer__img" sizes="(max-width: 700px) 58vw, 240px" />
                  </div>
                  <div class="offer__copy">
                    <h3 class="offer__title" aria-label={`${item.title} za 0 €`}>
                      <span class="offer__title-main">{item.title}</span>
                      <span class="offer__title-accent">{o.accent}</span>
                    </h3>
                    <p class="offer__text">{item.text}</p>
                    {'link' in item && item.link ? (
                      <a class="offer__link" href={item.link.href}>
                        {item.link.text}
                      </a>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div class="offer__nav">
            <button class="offer__arrow" type="button" data-offer-prev aria-label="Predchádzajúca ponuka">
              <svg class="offer__arrow-ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M15 5 8 12l7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </button>
            <span class="offer__count" data-offer-count aria-live="polite">2 / 4</span>
            <button class="offer__arrow" type="button" data-offer-next aria-label="Nasledujúca ponuka">
              <svg class="offer__arrow-ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </button>
          </div>

          <p class="offer__hint">
            <span class="offer__hint--desktop">{o.hint}</span>
            <span class="offer__hint--mobile">{o.hintMobile}</span>
          </p>
        </div>

        <p class="offer__cta">
          <a class="btn btn--blue" href={withCarry('/zacat', carry)}>{o.cta}</a>
        </p>
        <p class="offer__fine">{o.fine}</p>
      </div>
    </section>
  )
}

/* The price ------------------------------------------------------------------------------------------------ */

const PLAN_ART: Record<PlanId, Art | null> = { start: ART.seed, rast: ART.plant, firma: ART.tree }

const Pricing: FC<{ carry: Carry }> = ({ carry }) => (
  <section class="section pricing" id="cennik" aria-labelledby="pricing-title">
    <header class="wrap head head--center">
      <Title id="pricing-title" first={copy.pricing.first} second={copy.pricing.second} />
      <p class="lead">{copy.pricing.lead}</p>
      <p class="pricing__offer">{copy.pricing.firstMonthFree}</p>
    </header>
    <div class="wrap">
      <div class="plans">
        {PLANS.map((plan) => {
          const rows = planRows(plan)
          const lead = plan.id === LEAD_PLAN
          return (
            <article class={`plan${lead ? ' plan--lead' : ''}`} aria-labelledby={`plan-${plan.id}`}>
              <div class="plan__top">
                <Tile art={PLAN_ART[plan.id]} size="md" />
                <span>
                  <h3 id={`plan-${plan.id}`} class="plan__name">
                    {plan.name}
                  </h3>
                  <span class="plan__for">{rows.forWhom}</span>
                </span>
              </div>
              <div class="plan__cost">
                <p class="plan__price">
                  <span class="plan__amount">{formatEur(plan.price * 100)}</span>
                  <span class="plan__per">{copy.pricing.perMonth}</span>
                </p>
                <p class="plan__annual" data-plan-year={plan.id}>
                  {copy.pricing.annual}: <strong>{formatEur(annualPlanCents(plan))}</strong>
                </p>
              </div>
              <a class={`btn ${lead ? 'btn--blue' : 'btn--line'} plan__cta`} href={withCarry('/zacat', carry, { balik: plan.id })}>
                {`Chcem balík ${plan.name}`}
              </a>
              <dl class="plan__rows">
                <div>
                  <dt>{copy.pricing.rows.docs}</dt>
                  <dd>{rows.docs}</dd>
                </div>
                <div>
                  <dt>{copy.pricing.rows.vat}</dt>
                  <dd>{rows.vat}</dd>
                </div>
                <div>
                  <dt>{copy.pricing.rows.people}</dt>
                  <dd>{rows.people}</dd>
                </div>
              </dl>
            </article>
          )
        })}
      </div>
      <article class="plan-large" aria-labelledby="plan-large">
        <div class="plan-large__top">
          <Tile art={ART.seal} size="md" />
          <span>
            <h3 id="plan-large" class="plan__name">
              {copy.pricing.large.title}
            </h3>
            <span class="plan__for">{copy.pricing.large.forWhom}</span>
          </span>
        </div>
        <p class="plan-large__text">{copy.pricing.large.text}</p>
        <div class="plan-large__side">
          <span class="plan-large__price">{copy.pricing.large.price}</span>
          <a class="btn btn--line" href={withCarry('/zacat', carry, { balik: CUSTOM_PLAN })}>
            {copy.pricing.large.cta}
          </a>
        </div>
      </article>
      <div class="pricing__fine">
        <p>{copy.pricing.annualBasis}</p>
        <p>{copy.pricing.included}</p>
        <p>
          <strong>{copy.pricing.closing}</strong> {copy.pricing.vat}
        </p>
        <p class="pricing__links">
          <a href="/podmienky">{copy.pricing.documents}</a>
          <a href="/pravne-informacie#ochrana-udajov">{copy.pricing.privacy}</a>
        </p>
      </div>
      <ul class="promises">
        {copy.promises.map((promise) => (
          <li class="promise">
            <Tick />
            <span>
              <span class="promise__title">{promise.title}</span>
              <span class="promise__text">{promise.text}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  </section>
)

const Field: FC<{ name: string; label: string; value: string; placeholder: string; suffix?: string; mode?: 'decimal' | 'numeric' }> = ({ name, label, value, placeholder, suffix, mode = 'decimal' }) => (
  <label class="calc__field">
    <span class="calc__label">{label}</span>
    <span class={`calc__input${suffix ? ' calc__input--suffix' : ''}`}>
      <input class="input" type="text" name={name} value={value} placeholder={placeholder} inputmode={mode} autocomplete="off" />
      {suffix ? <span class="calc__suffix">{suffix}</span> : null}
    </span>
  </label>
)

const Comparison: FC<{ result: CalcResult }> = ({ result }) => {
  if (result.kind === 'empty') return <p class="calc__message">{copy.calc.empty}</p>
  return (
    <>
      <p class="calc__line">
        <span>{copy.calc.today}</span>
        <strong>{formatEur(result.todayYear)}</strong>
      </p>
      {result.kind === 'custom' ? (
        <p class="calc__message">{copy.calc.custom}</p>
      ) : (
        <>
          <p class="calc__line">
            <span>{`S Firmony, balík ${result.plan.name}`}</span>
            <strong>{formatEur(result.usYear)}</strong>
          </p>
          {result.difference === 0 ? <p class="calc__message">{copy.calc.same}</p> : (
            <p class="calc__line calc__line--total">
              <span>{result.difference > 0 ? copy.calc.save : copy.calc.more}</span>
              <strong>{formatEur(Math.abs(result.difference))}</strong>
            </p>
          )}
          <p class="small">{copy.calc.note}</p>
          <p class="small">{copy.calc.resultBasis}</p>
        </>
      )}
    </>
  )
}

/** What else Firmony gives: the investors' tax return, an extra service, and the tools free for anybody. */
const Extras: FC = () => {
  const x = copy.extras
  return (
    <section class="section extras" aria-labelledby="extras-title">
      <header class="wrap head head--center">
        <Title id="extras-title" first={x.first} second={x.second} />
      </header>
      <ul class="wrap extras__grid">
        <li class="card extras__card extras__card--invest">
          <div class="extras__top">
            <Tile art={ART.rocket} size="lg" />
            <span class="extras__tag extras__tag--extra">{x.invest.tag}</span>
          </div>
          <h3 class="h3">{x.invest.title}</h3>
          <p class="extras__text">{x.invest.text}</p>
          <a class="btn btn--blue extras__button" href="/investori">
            {x.invest.button}
          </a>
        </li>
        <li class="card extras__card">
          <div class="extras__top">
            <Tile art={ART.toolPdf} size="lg" />
            <span class="extras__tag extras__tag--free">{x.tools.tag}</span>
          </div>
          <h3 class="h3">{x.tools.title}</h3>
          <p class="extras__text">{x.tools.text}</p>
          <ul class="extras__links">
            <li>
              <a class="link" href="/faktura-zadarmo">
                {x.tools.invoice}
              </a>
            </li>
            <li>
              <a class="link" href={WAGE_PATH}>
                {x.tools.wage}
              </a>
            </li>
            <li>
              <a class="link" href={SZCO_PATH}>
                {x.tools.szco}
              </a>
            </li>
            <li>
              <a class="link" href={SRO_PATH}>
                {x.tools.sro}
              </a>
            </li>
          </ul>
          <a class="btn btn--line extras__button" href="/bezplatne-nastroje">
            {x.tools.button}
          </a>
        </li>
      </ul>
    </section>
  )
}

const Calculator: FC<{ state: CalcState; carry: Carry }> = ({ state, carry }) => {
  const r = state.result
  return (
    <section class="section calc-section" id="kalkulacka" aria-labelledby="calc-title">
      <header class="wrap head head--center">
        <Title id="calc-title" first={copy.calc.title} />
        <p class="lead">{copy.calc.lead}</p>
      </header>
      <div class="wrap">
        <div class="calc">
          <form class="calc__form" method="get" action="/#kalkulacka" aria-describedby="calc-input-help" novalidate>
            <CarryFields carry={carry} />
            <Field name="mesacne" label={copy.calc.monthly} value={state.values.monthly} placeholder="60" suffix="€" />
            <Field name="za-doklad" label={copy.calc.perDoc} value={state.values.perDoc} placeholder="5,20" suffix="€" />
            <Field name="doklady" label={copy.calc.docs} value={state.values.docs} placeholder="25" mode="numeric" />
            <Field name="zavierka" label={copy.calc.closing} value={state.values.closing} placeholder="160" suffix="€" />
            <fieldset class="calc__field calc__choice">
              <legend class="calc__label">{copy.calc.vat}</legend>
              <span class="seg">
                <label class="seg__option">
                  <input type="radio" name="dph" value="nie" checked={state.values.vat === 'nie'} />
                  <span>{copy.calc.no}</span>
                </label>
                <label class="seg__option">
                  <input type="radio" name="dph" value="ano" checked={state.values.vat === 'ano'} />
                  <span>{copy.calc.yes}</span>
                </label>
              </span>
            </fieldset>
            <Field name="ludia" label={copy.calc.people} value={state.values.people} placeholder="0" mode="numeric" />
            <p class="small calc__help" id="calc-input-help">{copy.calc.inputHelp}</p>
            <button class="btn btn--blue calc__button" type="submit">
              {copy.calc.button}
            </button>
          </form>
          <div class="calc__result" role="status">
            <Picture art={ART.savings} className="calc__object" sizes="(max-width: 960px) 96px, 140px" />
            {state.invalid ? <p class="calc__message">{copy.calc.invalid}</p> : <Comparison result={r ?? { kind: 'empty' }} />}
          </div>
        </div>
      </div>
    </section>
  )
}

/** Who is behind it: the founder's note, and the company as the register has it, with a way to check it. */
const About: FC = () => (
  <section class="section about" id="kto-sme" aria-labelledby="about-title">
    <div class="wrap about__grid">
      <div class="about__note">
        <h2 id="about-title" class="title title--small">
          <span class="title__sans">{copy.founder.title}</span>
        </h2>
        <figure class="quote">
          <blockquote>
            <p>{copy.founder.quote}</p>
            <p class="quote__letter">{copy.founder.letter}</p>
          </blockquote>
          <figcaption class="quote__sign">
            <Picture art={ART.founder} className="quote__photo" />
            <strong>{copy.founder.name}</strong>
            <span>{copy.founder.role}</span>
          </figcaption>
        </figure>
      </div>
      <div class="card about__card">
        <div class="about__top">
          <span>
            <span class="about__lead">{copy.company.title}</span>
            <span class="about__name">{OPERATOR.name}</span>
          </span>
          <Tile art={ART.seal} size="md" />
        </div>
        <dl class="kv kv--facts">
          <div>
            <dt>{copy.company.seat}</dt>
            <dd>{`${OPERATOR.street}, ${OPERATOR.postalCity}`}</dd>
          </div>
          <div>
            <dt>{copy.company.ico}</dt>
            <dd>{OPERATOR.companyId}</dd>
          </div>
          <div>
            <dt>{copy.company.dic}</dt>
            <dd>{OPERATOR.taxId}</dd>
          </div>
          <div>
            <dt>{copy.company.register}</dt>
            <dd>{OPERATOR.register}</dd>
          </div>
          <div>
            <dt>{copy.company.email}</dt>
            <dd>
              <a class="link" href={`mailto:${BRAND.email}`}>
                {BRAND.email}
              </a>
            </dd>
          </div>
          <div>
            <dt>{copy.company.phone}</dt>
            <dd>
              <a class="link" href={OPERATOR.phoneHref}>
                {OPERATOR.phone}
              </a>
            </dd>
          </div>
        </dl>
        <a class="btn btn--line about__verify" href={REGISTER_URL} target="_blank" rel="noopener noreferrer">
          {copy.company.verify}
        </a>
        <p class="small">{copy.company.reply}</p>
      </div>
    </div>
  </section>
)

const Faq: FC = () => (
  <section class="section faq-section" id="otazky" aria-labelledby="faq-title">
    <header class="wrap head head--center">
      <Title id="faq-title" first={copy.faq.title} />
      <p class="lead">
        {copy.faq.ask.before}{' '}
        <button type="button" class="link link--button" data-mony-call aria-controls="mony-panel">
          {MONY.name}
        </button>
        {copy.faq.ask.after}{' '}
        <a class="link" href={`mailto:${BRAND.email}`}>
          {BRAND.email}
        </a>
        , {copy.faq.reply}
      </p>
    </header>
    <div class="wrap faq">
      {copy.faq.items.map((item) => (
        <details class="faq__item">
          <summary>{item.q}</summary>
          <p>{item.a}</p>
        </details>
      ))}
    </div>
  </section>
)

/** The IČO field and its button. Compact: its label is read out but not shown, because the card says it. */
export const StartForm: FC<{ carry: Carry; value?: string; error?: string; id?: string; compact?: boolean }> = ({ carry, value = '', error, id = 'ico', compact }) => (
  <form class={`ico${compact ? ' ico--compact' : ''}`} method="get" action="/zacat" novalidate>
    <CarryFields carry={carry} />
    <label class="ico__label" for={id}>
      {copy.final.label}
    </label>
    <div class={`ico__row${error ? ' ico__row--error' : ''}`}>
      <input
        class="ico__input"
        id={id}
        name="ico"
        type="text"
        inputmode="numeric"
        autocomplete="off"
        placeholder={copy.final.placeholder}
        value={value}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
      />
      <button class="btn btn--blue ico__button" type="submit">
        {copy.final.button}
      </button>
    </div>
    {error ? (
      <p class="field__error" id={`${id}-error`}>
        {error}
      </p>
    ) : null}
  </form>
)

const Final: FC<{ carry: Carry }> = ({ carry }) => (
  <section class="final-section" id="zacat" aria-labelledby="final-title">
    <div class="wrap">
      <div class="final">
        <Picture art={ART.mark} className="final__mark" sizes="(max-width: 640px) 96px, 140px" />
        <h2 id="final-title" class="final__title">
          {copy.final.title}
        </h2>
        <p class="final__lead">{copy.final.lead}</p>
        <StartForm carry={carry} id="ico-final" compact />
        <p class="final__aside">
          <a class="final__fresh" href={withCarry('/zacat', carry, { nova: '1' })}>
            {copy.final.noCompany}
          </a>
          <button type="button" class="final__fresh final__ask" data-mony-call aria-controls="mony-panel">
            {copy.final.ask}
          </button>
          <span>
            {copy.final.write}{' '}
            <a class="final__mail" href={`mailto:${BRAND.email}`}>
              {BRAND.email}
            </a>
          </span>
        </p>
      </div>
    </div>
  </section>
)

export const Home: FC<{ carry: Carry; calc: CalcState }> = ({ carry, calc }) => (
  <>
    <Hero carry={carry} />
    <Why />
    <Flow />
    <Offer carry={carry} />
    <Pricing carry={carry} />
    <Extras />
    <Calculator state={calc} carry={carry} />
    <About />
    <Faq />
    <Final carry={carry} />
  </>
)
