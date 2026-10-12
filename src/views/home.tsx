import type { FC } from 'hono/jsx'
import { EXAMPLE, compare, type CalcResult } from '../calc'
import { ART, BRAND, PLANS, type Art } from '../config'
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

const Receipt: FC = () => (
  <figure class="receipt" aria-label={copy.receipt.label}>
    <div class="receipt__paper">
      <p class="receipt__brand" aria-hidden="true">
        firmony<span class="wordmark__dot">.</span>
      </p>
      <p class="receipt__title">{copy.receipt.title}</p>
      <p class="receipt__sub">{copy.receipt.sub}</p>
      <dl class="receipt__lines">
        {copy.receipt.lines.map(([label, value]) => (
          <div>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <p class="receipt__total">
        <span>{copy.receipt.total}</span>
        <span class="receipt__sum">{copy.receipt.totalValue}</span>
      </p>
      <p class="receipt__foot">
        {copy.receipt.vat}
        <br />
        {copy.receipt.thanks}
      </p>
    </div>
  </figure>
)

const Hero: FC = () => (
  <section class="hero" aria-labelledby="hero-title">
    <div class="hero__inner wrap">
      <div class="hero__text">
        <h1 id="hero-title" class="hero__title">
          <span>{copy.hero.first}</span> <span>{copy.hero.second}</span>
        </h1>
        <p class="hero__lead">{copy.hero.lead}</p>
        <p class="hero__price">{copy.hero.price}</p>
        <div class="hero__actions">
          <a class="btn btn--coral" href="#zacat">
            {copy.hero.cta}
          </a>
          <a class="link" href="#cennik">
            {copy.hero.secondary}
          </a>
        </div>
        <p class="hero__note">{copy.hero.note}</p>
      </div>
      <Receipt />
    </div>
  </section>
)

const Pains: FC = () => (
  <section class="section section--lilac" aria-labelledby="pains-title">
    <div class="wrap">
      <h2 id="pains-title" class="h2 measure">
        {copy.pains.title}
      </h2>
      <ul class="pains">
        {copy.pains.items.map((item) => (
          <li>{item}</li>
        ))}
      </ul>
      <p class="pains__close measure">{copy.pains.close}</p>
    </div>
  </section>
)

const How: FC = () => (
  <section class="section" id="ako-to-funguje" aria-labelledby="how-title">
    <div class="wrap">
      <h2 id="how-title" class="h2">
        {copy.how.title}
      </h2>
      <ol class="steps">
        {copy.how.steps.map((step) => (
          <li class="step">
            <h3 class="step__title">{step.title}</h3>
            <p>{step.text}</p>
          </li>
        ))}
      </ol>
    </div>
  </section>
)

const People: FC = () => (
  <section class="section section--plum" aria-labelledby="people-title">
    <div class="wrap">
      <h2 id="people-title" class="h2 measure-wide">
        {copy.people.title}
      </h2>
      <div class="duo">
        {[copy.people.ai, copy.people.human].map((side) => (
          <div class="duo__side">
            <h3 class="duo__title">{side.title}</h3>
            <ul class="duo__list">
              {side.items.map((item) => (
                <li>{item}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p class="duo__close">{copy.people.close}</p>
    </div>
  </section>
)

const Included: FC = () => (
  <section class="section" aria-labelledby="included-title">
    <div class="wrap">
      <h2 id="included-title" class="h2">
        {copy.included.title}
      </h2>
      <p class="lead measure">{copy.included.lead}</p>
      <dl class="included">
        {copy.included.items.map((item) => (
          <div class="included__item">
            <dt>{item.title}</dt>
            <dd>{item.text}</dd>
          </div>
        ))}
      </dl>
    </div>
  </section>
)

const Einvoice: FC = () => (
  <section class="section section--lilac" aria-labelledby="einvoice-title">
    <div class="wrap einvoice">
      <h2 id="einvoice-title" class="h2 einvoice__title">
        {copy.einvoice.title}
      </h2>
      <div class="einvoice__body">
        <p>{copy.einvoice.text}</p>
        <p class="einvoice__ours">{copy.einvoice.ours}</p>
        <p class="small">{copy.einvoice.source}</p>
      </div>
    </div>
  </section>
)

const Pricing: FC<{ carry: Carry }> = ({ carry }) => (
  <section class="section" id="cennik" aria-labelledby="pricing-title">
    <div class="wrap">
      <h2 id="pricing-title" class="h2">
        {copy.pricing.title}
      </h2>
      <p class="lead measure">{copy.pricing.lead}</p>
      <div class="plans">
        {PLANS.map((plan) => {
          const rows = planRows(plan)
          return (
            <article class="plan" aria-labelledby={`plan-${plan.id}`}>
              <h3 id={`plan-${plan.id}`} class="plan__name">
                {plan.name}
              </h3>
              <p class="plan__price">
                <span class="plan__amount">{formatEur(plan.price * 100)}</span> <span class="plan__per">{copy.pricing.perMonth}</span>
              </p>
              <p class="plan__for">{rows.forWhom}</p>
              <dl class="plan__rows">
                <div class="plan__row">
                  <dt>{copy.pricing.rows.docs}</dt>
                  <dd>{rows.docs}</dd>
                </div>
                <div class="plan__row">
                  <dt>{copy.pricing.rows.vat}</dt>
                  <dd>{rows.vat}</dd>
                </div>
                <div class="plan__row">
                  <dt>{copy.pricing.rows.people}</dt>
                  <dd>{rows.people}</dd>
                </div>
              </dl>
              <a class="btn btn--line plan__cta" href={withCarry('/zacat', carry, { balik: plan.id })}>
                {`Chcem balík ${plan.name}`}
              </a>
            </article>
          )
        })}
      </div>
      <div class="pricing__notes">
        <p>{copy.pricing.included}</p>
        <p>
          <strong>{copy.pricing.closing}</strong> {copy.pricing.vat}
        </p>
        <p>{copy.pricing.custom}</p>
      </div>
    </div>
  </section>
)

const Field: FC<{ name: string; label: string; value: string; placeholder: string; suffix?: string; mode?: 'decimal' | 'numeric' }> = ({ name, label, value, placeholder, suffix, mode = 'decimal' }) => (
  <label class="calc__field">
    <span class="calc__label">{label}</span>
    <span class="calc__input">
      <input type="text" name={name} value={value} placeholder={placeholder} inputmode={mode} autocomplete="off" />
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
    <section class="section section--lilac" id="kalkulacka" aria-labelledby="calc-title">
      <div class="wrap calc">
        <div class="calc__intro">
          <h2 id="calc-title" class="h2">
            {copy.calc.title}
          </h2>
          <p class="lead">{copy.calc.lead}</p>
        </div>
        <form class="calc__form" method="get" action="/#kalkulacka" novalidate>
          <CarryFields carry={carry} />
          <Field name="mesacne" label={copy.calc.monthly} value={state.values.monthly} placeholder="60" suffix="€" />
          <Field name="za-doklad" label={copy.calc.perDoc} value={state.values.perDoc} placeholder="5,20" suffix="€" />
          <Field name="doklady" label={copy.calc.docs} value={state.values.docs} placeholder="25" mode="numeric" />
          <Field name="zavierka" label={copy.calc.closing} value={state.values.closing} placeholder="160" suffix="€" />
          <fieldset class="calc__field calc__choice">
            <legend class="calc__label">{copy.calc.vat}</legend>
            <label>
              <input type="radio" name="dph" value="nie" checked={state.values.vat === 'nie'} /> {copy.calc.no}
            </label>
            <label>
              <input type="radio" name="dph" value="ano" checked={state.values.vat === 'ano'} /> {copy.calc.yes}
            </label>
          </fieldset>
          <Field name="ludia" label={copy.calc.people} value={state.values.people} placeholder="0" mode="numeric" />
          <button class="btn btn--plum calc__button" type="submit">
            {copy.calc.button}
          </button>
        </form>
        <div class="calc__result" role="status">
          {state.invalid ? <p class="calc__message">{copy.calc.invalid}</p> : <Comparison result={!r || r.kind === 'empty' ? compare(EXAMPLE) : r} example={!r || r.kind === 'empty'} />}
        </div>
      </div>
    </section>
  )
}

const Picture: FC<{ art: Art | null; className: string }> = ({ art, className }) =>
  art ? <img class={className} src={art.src} alt={art.alt} width={art.width} height={art.height} loading="lazy" decoding="async" /> : null

const Paths: FC<{ carry: Carry }> = ({ carry }) => (
  <section class="section" aria-labelledby="paths-title">
    <div class="wrap">
      <h2 id="paths-title" class="h2">
        {copy.paths.title}
      </h2>
      <div class="paths">
        <div class="path">
          <Picture art={ART.fresh} className="path__picture" />
          <h3 class="path__title">{copy.paths.fresh.title}</h3>
          <p>{copy.paths.fresh.text}</p>
          <a class="link" href={withCarry('/zacat', carry, { nova: '1' })}>
            {copy.paths.fresh.cta}
          </a>
        </div>
        <div class="path">
          <Picture art={ART.switching} className="path__picture" />
          <h3 class="path__title">{copy.paths.switching.title}</h3>
          <p>{copy.paths.switching.text}</p>
          <a class="link" href="#zacat">
            {copy.paths.switching.cta}
          </a>
        </div>
      </div>
    </div>
  </section>
)

const Founder: FC = () => (
  <section class="section section--tight" aria-label={copy.founder.role}>
    <div class="wrap">
      <figure class={`founder${ART.founder ? ' founder--photo' : ''}`}>
        <Picture art={ART.founder} className="founder__photo" />
        <blockquote class="founder__quote">
          <p>{copy.founder.quote}</p>
        </blockquote>
        <figcaption class="founder__sign">
          <strong>{copy.founder.name}</strong>
          <span>{copy.founder.role}</span>
        </figcaption>
      </figure>
    </div>
  </section>
)

const Faq: FC = () => (
  <section class="section" id="otazky" aria-labelledby="faq-title">
    <div class="wrap faq">
      <h2 id="faq-title" class="h2">
        {copy.faq.title}
      </h2>
      <div class="faq__list">
        {copy.faq.items.map((item) => (
          <details class="faq__item">
            <summary>{item.q}</summary>
            <p>{item.a}</p>
          </details>
        ))}
      </div>
    </div>
  </section>
)

export const StartForm: FC<{ carry: Carry; value?: string; error?: string; id?: string }> = ({ carry, value = '', error, id = 'ico' }) => (
  <form class="ico" method="get" action="/zacat" novalidate>
    <CarryFields carry={carry} />
    <label class="ico__label" for={id}>
      {copy.final.label}
    </label>
    <div class="ico__row">
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
      <button class="btn btn--coral" type="submit">
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
  <section class="section section--plum final" id="zacat" aria-labelledby="final-title">
    <div class="wrap final__inner">
      <div class="final__main">
        <h2 id="final-title" class="h2 final__title">
          {copy.final.title}
        </h2>
        <p class="lead final__lead">{copy.final.lead}</p>
        <StartForm carry={carry} id="ico-final" />
        <a class="link link--light" href={withCarry('/zacat', carry, { nova: '1' })}>
          {copy.final.noCompany}
        </a>
      </div>
      <aside class="final__aside">
        <p class="final__ask">{copy.final.write}</p>
        <a class="final__mail" href={`mailto:${BRAND.email}`}>
          {BRAND.email}
        </a>
        <p class="final__reply">{copy.final.reply}</p>
      </aside>
    </div>
  </section>
)

export const Home: FC<{ carry: Carry; calc: CalcState }> = ({ carry, calc }) => (
  <>
    <Hero />
    <Pains />
    <How />
    <People />
    <Included />
    <Einvoice />
    <Pricing carry={carry} />
    <Calculator state={calc} carry={carry} />
    <Paths carry={carry} />
    <Founder />
    <Faq />
    <Final carry={carry} />
  </>
)
