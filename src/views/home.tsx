import type { FC } from 'hono/jsx'
import { EXAMPLE, compare, type CalcResult } from '../calc'
import { ART, BRAND, CUSTOM_PLAN, LEAD_PLAN, OPERATOR, PLANS, REGISTER_URL, type Art, type PlanId } from '../config'
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

/** Words that light up one by one as they scroll by; a word joined by a no-break space stays one. */
const Words: FC<{ text: string }> = ({ text }) => (
  <>
    {text.split(' ').map((word, i) => (
      <>
        {i > 0 ? ' ' : null}
        <span class="w">{word}</span>
      </>
    ))}
  </>
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
      <script src="/flow.js" defer></script>
    </section>
  )
}

/** Four true figures, each with what it means. */
const Stats: FC = () => (
  <div class="stats-section">
    <ul class="wrap stats">
      {copy.stats.map((stat) => (
        <li class="stat">
          <span class="stat__value">{stat.value}</span>
          <span class="stat__label">{stat.label}</span>
        </li>
      ))}
    </ul>
  </div>
)

/** The hug of the brand, lit word by word as it scrolls by. */
const Statement: FC = () => (
  <div class="statement">
    <p class="wrap statement__text">
      <span class="statement__sans">
        <Words text={copy.statement.first} />
      </span>{' '}
      <em class="statement__serif">
        <Words text={copy.statement.second} />
      </em>
    </p>
  </div>
)

/* Everything in the price: pick one and see it ------------------------------------------------------------ */

/** The machine reading a slip: the slip under its beam, what was read, and the entry it proposes. */
const ScanPreview: FC = () => {
  const s = copy.services.scan
  return (
    <div class="ui ui--scan">
      <div class="slip__shadow" aria-hidden="true">
      <div class="slip">
        <span class="slip__shop">{s.slip.shop}</span>
        <span class="slip__when">{s.slip.when}</span>
        <span class="slip__row">
          <span>{s.slip.item}</span>
          <span>{s.slip.sum}</span>
        </span>
        <span class="slip__pay">{s.slip.pay}</span>
        <span class="slip__row slip__row--total">
          <span>{s.slip.total}</span>
          <span>{s.slip.sum}</span>
        </span>
        <span class="slip__beam"></span>
      </div>
      </div>
      <div class="card ui__card">
        <p class="card__label">{s.read}</p>
        <dl class="kv">
          {s.fields.map(([label, value]) => (
            <div>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        <p class="card__label">{s.entry}</p>
        <dl class="kv kv--entry">
          <div>
            <dt>{s.debit[0]}</dt>
            <dd>{s.debit[1]}</dd>
          </div>
          <div>
            <dt>{s.credit[0]}</dt>
            <dd>{s.credit[1]}</dd>
          </div>
        </dl>
        <p class="flag">{s.flag}</p>
      </div>
    </div>
  )
}

/** His glass object over the top corner of a preview's card. */
const Glass: FC<{ art: Art | null }> = ({ art }) => <Picture art={art} className="ui__glass" sizes="(max-width: 640px) 84px, 132px" />

const FilePreview: FC = () => {
  const f = copy.services.file
  return (
    <div class="ui">
      <div class="card ui__card">
        <Glass art={ART.paperInvoice} />
        <div class="card__top">
          <span>
            <span class="card__title">{f.doc}</span>
            <span class="card__sub">{f.period}</span>
          </span>
          <span class="pill pill--ok">{f.status}</span>
        </div>
        <dl class="kv kv--roomy">
          {f.rows.map(([label, value]) => (
            <div>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        <p class="card__foot">
          <Tick />
          <span>{f.checked}</span>
          <span class="card__when">{f.when}</span>
        </p>
      </div>
    </div>
  )
}

const InboxPreview: FC = () => {
  const n = copy.services.inbox
  return (
    <div class="ui">
      <div class="card ui__card">
        <Glass art={ART.paperEinvoice} />
        <div class="card__top">
          <span>
            <span class="card__title">{n.title}</span>
            <span class="card__sub">{n.via}</span>
          </span>
        </div>
        <ul class="list">
          {n.rows.map(([name, amount]) => (
            <li class="list__row">
              <span class="list__name">{name}</span>
              <span class="list__amount">{amount}</span>
              <span class="pill pill--ok">{n.state}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

const PayrollPreview: FC = () => {
  const p = copy.services.payroll
  return (
    <div class="ui">
      <div class="card ui__card">
        <Glass art={ART.savings} />
        <div class="card__top">
          <span class="card__title">{p.title}</span>
          <span class="pill pill--ok">{p.state}</span>
        </div>
        <ul class="list">
          {p.rows.map((row) => (
            <li class="list__row list__row--tick">
              <Tick />
              <span class="list__name">{row}</span>
            </li>
          ))}
        </ul>
        <p class="card__note">{p.note}</p>
      </div>
    </div>
  )
}

const DeadlinesPreview: FC = () => {
  const d = copy.services.deadlines
  return (
    <div class="ui">
      <div class="card ui__card">
        <Glass art={ART.paperReturn} />
        <div class="card__top">
          <span class="card__title">{d.title}</span>
        </div>
        <ul class="list">
          {d.rows.map(([date, what, state]) => (
            <li class="list__row">
              <span class="list__date">{date}</span>
              <span class="list__name">{what}</span>
              <span class="pill pill--ok">{state}</span>
            </li>
          ))}
        </ul>
        <p class="flag flag--ask">{d.missing}</p>
      </div>
    </div>
  )
}

/** A question to the accountant and her answer. */
const AskPreview: FC = () => {
  const q = copy.services.ask
  return (
    <div class="ui">
      <div class="card ui__card chat">
        <Glass art={ART.chat} />
        <div class="chat__head">
          <span class="chat__avatar" aria-hidden="true"></span>
          <span>
            <span class="chat__who">{q.who}</span>
            <span class="chat__online">{q.online}</span>
          </span>
        </div>
        <p class="chat__msg chat__msg--me">{q.question}</p>
        <p class="chat__msg chat__msg--her">{q.answer}</p>
        <p class="chat__msg chat__msg--me">{q.thanks}</p>
      </div>
    </div>
  )
}

const SERVICES: Record<string, { art: Art | null; Preview: FC }> = {
  doklady: { art: ART.paperReceipt, Preview: ScanPreview },
  dph: { art: ART.paperInvoice, Preview: FilePreview },
  efaktury: { art: ART.paperEinvoice, Preview: InboxPreview },
  mzdy: { art: ART.savings, Preview: PayrollPreview },
  terminy: { art: ART.paperReturn, Preview: DeadlinesPreview },
  otazky: { art: ART.chat, Preview: AskPreview },
}

/**
 * Everything a plan holds, as CloudTalk shows its features: a list to pick from and, beside it, what the
 * picked one looks like. The radios are the state; the stylesheet shows the preview of the one that is checked.
 */
const Services: FC = () => {
  const s = copy.services
  return (
    <section class="section services" aria-labelledby="services-title">
      <header class="wrap head head--center">
        <Title id="services-title" first={s.first} second={s.second} />
        <p class="lead">{s.lead}</p>
      </header>
      <div class="wrap">
        <div class="svc">
          <div class="svc__list" role="radiogroup" aria-labelledby="services-title">
            {s.items.map((item, i) => (
              <label class={`svc__item svc__item--${item.id}`}>
                <input class="svc__radio" type="radio" name="sluzba" id={`svc-${item.id}`} value={item.id} checked={i === 0} />
                <Tile art={SERVICES[item.id]?.art ?? null} size="sm" />
                <span class="svc__words">
                  <span class="svc__title">{item.title}</span>
                  <span class="svc__text">{item.text}</span>
                </span>
              </label>
            ))}
          </div>
          <div class="svc__stage">
            {s.items.map((item) => {
              const Preview = SERVICES[item.id]?.Preview
              return Preview ? (
                <div class={`svc__preview svc__preview--${item.id}`}>
                  <Preview />
                </div>
              ) : null
            })}
            <p class="svc__example">{s.example}</p>
          </div>
        </div>
      </div>
    </section>
  )
}

/** The machine and the person: what each of them does. */
const Duo: FC = () => (
  <section class="section duo" aria-labelledby="duo-title">
    <header class="wrap head head--center">
      <Title id="duo-title" first={copy.duo.first} second={copy.duo.second} />
    </header>
    <div class="wrap duo__grid">
      {[
        { side: copy.duo.ai, art: ART.chip, kind: 'ai' },
        { side: copy.duo.human, art: ART.lens, kind: 'human' },
      ].map(({ side, art, kind }) => (
        <article class={`card duo__card duo__card--${kind}`}>
          <Tile art={art} size="lg" />
          <h3 class="h3">{side.title}</h3>
          <ul class="ticks">
            {side.items.map((item) => (
              <li>
                <Tick />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </article>
      ))}
    </div>
  </section>
)

/** Why now: the date every company has to meet. */
const Einvoice: FC = () => (
  <section class="band-section" aria-labelledby="einvoice-title">
    <div class="wrap">
      <div class="band">
        <div class="band__copy">
          <p class="band__date">{copy.einvoice.date}</p>
          <h2 id="einvoice-title" class="band__title">
            {copy.einvoice.title}
          </h2>
          <p class="band__text">{copy.einvoice.text}</p>
          <p class="band__source">{copy.einvoice.source}</p>
        </div>
        <Picture art={ART.envelope} className="band__object" sizes="(max-width: 860px) 60vw, 420px" />
      </div>
    </div>
  </section>
)

/* The price ------------------------------------------------------------------------------------------------ */

const PLAN_ART: Record<PlanId, Art | null> = { start: ART.seed, rast: ART.plant, firma: ART.tree }

const Pricing: FC<{ carry: Carry }> = ({ carry }) => (
  <section class="section pricing" id="cennik" aria-labelledby="pricing-title">
    <header class="wrap head head--center">
      <Title id="pricing-title" first={copy.pricing.first} second={copy.pricing.second} />
      <p class="lead">{copy.pricing.lead}</p>
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
              <p class="plan__price">
                <span class="plan__amount">{formatEur(plan.price * 100)}</span>
                <span class="plan__per">{copy.pricing.perMonth}</span>
              </p>
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
        <p>{copy.pricing.included}</p>
        <p>
          <strong>{copy.pricing.closing}</strong> {copy.pricing.vat}
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

const Comparison: FC<{ result: CalcResult; example: boolean }> = ({ result, example }) => {
  if (result.kind === 'empty') return <p class="calc__message">{copy.calc.empty}</p>
  return (
    <>
      {example ? <p class="calc__example">{copy.calc.example}</p> : null}
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
          <p class={`calc__line calc__line--total${result.difference > 0 ? ' calc__line--save' : ''}`}>
            <span>{result.difference >= 0 ? copy.calc.save : copy.calc.more}</span>
            <strong>{formatEur(Math.abs(result.difference))}</strong>
          </p>
          <p class="small">{example ? copy.calc.empty : copy.calc.note}</p>
        </>
      )}
    </>
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
          <form class="calc__form" method="get" action="/#kalkulacka" novalidate>
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
            <button class="btn btn--blue calc__button" type="submit">
              {copy.calc.button}
            </button>
          </form>
          <div class="calc__result" role="status">
            <Picture art={ART.savings} className="calc__object" sizes="(max-width: 960px) 96px, 140px" />
            {state.invalid ? <p class="calc__message">{copy.calc.invalid}</p> : <Comparison result={!r || r.kind === 'empty' ? compare(EXAMPLE) : r} example={!r || r.kind === 'empty'} />}
          </div>
        </div>
      </div>
    </section>
  )
}

const Paths: FC<{ carry: Carry }> = ({ carry }) => (
  <section class="section paths-section" aria-labelledby="paths-title">
    <header class="wrap head head--center">
      <Title id="paths-title" first={copy.paths.first} second={copy.paths.second} />
    </header>
    <div class="wrap paths">
      <article class="card path">
        <Tile art={ART.rocket} size="lg" />
        <h3 class="h3">{copy.paths.fresh.title}</h3>
        <p class="path__text">{copy.paths.fresh.text}</p>
        <a class="btn btn--line path__cta" href={withCarry('/zacat', carry, { nova: '1' })}>
          {copy.paths.fresh.cta}
        </a>
      </article>
      <article class="card path">
        <Tile art={ART.key} size="lg" />
        <h3 class="h3">{copy.paths.switching.title}</h3>
        <p class="path__text">{copy.paths.switching.text}</p>
        <a class="btn btn--line path__cta" href="#zacat">
          {copy.paths.switching.cta}
        </a>
      </article>
      <article class="card path">
        <Tile art={ART.tree} size="lg" />
        <h3 class="h3">{copy.paths.large.title}</h3>
        <p class="path__text">{copy.paths.large.text}</p>
        <a class="btn btn--line path__cta" href={withCarry('/zacat', carry, { balik: CUSTOM_PLAN })}>
          {copy.paths.large.cta}
        </a>
      </article>
    </div>
  </section>
)

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
        {copy.faq.more}{' '}
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
    <Flow />
    <Stats />
    <Statement />
    <Services />
    <Duo />
    <Einvoice />
    <Pricing carry={carry} />
    <Calculator state={calc} carry={carry} />
    <Paths carry={carry} />
    <About />
    <Faq />
    <Final carry={carry} />
  </>
)
