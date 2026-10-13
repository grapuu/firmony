import type { FC } from 'hono/jsx'
import { EXAMPLE, compare, type CalcResult } from '../calc'
import { ART, BRAND, LEAD_PLAN, OPERATOR, PLANS, REGISTER_URL, type Art, type PlanId } from '../config'
import { copy, planRows, type Paper } from '../copy'
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

/* The opening ------------------------------------------------------------------------------------------- */

/** One paper of the pile: a slip, an invoice, a statement, or a notification that nags. */
const PaperCard: FC<{ paper: Paper; n: number }> = ({ paper, n }) => (
  <li class={`paper paper--${paper.kind} paper--${n}`}>
    <span class="paper__sheet">
      <span class="paper__label">{paper.label}</span>
      <span class="paper__title">{paper.title}</span>
      {paper.kind === 'receipt' || paper.kind === 'invoice' || paper.kind === 'statement' ? <span class="paper__lines"></span> : null}
      {paper.meta ? <span class="paper__meta">{paper.meta}</span> : null}
    </span>
  </li>
)

/** The month in order: what the pile becomes. */
const Ledger: FC = () => {
  const l = copy.settle.ledger
  return (
    <figure class="ledger" aria-label={l.label}>
      <div class="ledger__head">
        <strong>{l.month}</strong>
        <span>{l.company}</span>
      </div>
      <ol class="ledger__rows">
        {l.rows.map((row, i) => (
          <li class={`ledger__row ledger__row--${i + 1}`}>
            <Tick />
            <span class="ledger__what">{row.what}</span>
            <span class="ledger__amount">{row.amount}</span>
            <span class="ledger__state">{row.state}</span>
          </li>
        ))}
      </ol>
      <div class="ledger__foot">
        <span>{l.foot}</span>
        <span class="ledger__count">{l.count}</span>
      </div>
    </figure>
  )
}

/**
 * The opening: the promise over a pile of papers and nagging notices. Where the browser can tie an animation to
 * scrolling, the stage stands still while the pile flies into one month in order and the night turns to day;
 * elsewhere the pile and the order are two screens, one under the other.
 */
const Settle: FC = () => (
  <section class="settle" aria-labelledby="hero-title">
    <div class="settle__stage">
      <div class="settle__night" aria-hidden="true"></div>
      <div class="settle__hero">
        <ul class="papers" aria-hidden="true">
          {copy.settle.papers.map((paper, i) => (
            <PaperCard paper={paper} n={i + 1} />
          ))}
        </ul>
        <div class="hero wrap">
          <h1 id="hero-title" class="hero__title">
            <span class="hero__line">{copy.hero.first}</span> <span class="hero__line hero__line--blue">{copy.hero.second}</span>
          </h1>
          <p class="hero__lead">{copy.hero.lead}</p>
          <p class="hero__price">{copy.hero.price}</p>
          <div class="hero__actions">
            <a class="btn btn--blue btn--large" href="#zacat">
              {copy.hero.cta}
            </a>
            <a class="btn btn--ghost btn--large" href="#cennik">
              {copy.hero.secondary}
            </a>
          </div>
          <p class="hero__note">{copy.hero.note}</p>
        </div>
        <span class="settle__cue" aria-hidden="true"></span>
      </div>
      <div class="settle__order">
        <div class="wrap settle__grid">
          <div class="settle__copy">
            <h2 class="h2 settle__title">{copy.settle.title}</h2>
            <p class="lead settle__text">{copy.settle.text}</p>
          </div>
          <Ledger />
        </div>
      </div>
    </div>
  </section>
)

/** Why now: the date every company has to meet. */
const Einvoice: FC = () => (
  <section class="band" aria-labelledby="einvoice-title">
    <div class="wrap">
      <div class="band__top">
        <p class="band__date" aria-hidden="true">
          {copy.einvoice.date}
        </p>
        <Picture art={ART.envelope} className="band__object" sizes="(max-width: 960px) 40vw, 360px" />
      </div>
      <div class="band__copy">
        <h2 id="einvoice-title" class="h2">
          {copy.einvoice.title}
        </h2>
        <p class="band__text">{copy.einvoice.text}</p>
        <p class="band__ours">
          <Tick />
          <span>{copy.einvoice.ours}</span>
        </p>
        <p class="small band__source">{copy.einvoice.source}</p>
      </div>
    </div>
  </section>
)

/** The hug of the brand, read line by line as it scrolls by. */
const Embrace: FC = () => (
  <section class="embrace">
    <p class="wrap embrace__text">
      {copy.embrace.text.split(' ').map((word) => (
        <>
          <span class="w">{word}</span>{' '}
        </>
      ))}
    </p>
  </section>
)

/* One month, as the client sees it ------------------------------------------------------------------------ */

/** The machine reading a slip: the slip with its beam, what was read, and the entry it proposes. */
const ScanScreen: FC = () => {
  const s = copy.month.snap
  return (
    <div class="ui ui--scan">
      <div class="scan__slip" aria-hidden="true">
        <span class="scan__shop">{s.slip.shop}</span>
        <span class="scan__when">{s.slip.when}</span>
        <span class="scan__row">
          <span>{s.slip.item}</span>
          <span>{s.slip.sum}</span>
        </span>
        <span class="scan__pay">{s.slip.pay}</span>
        <span class="scan__row scan__row--total">
          <span>{s.slip.total}</span>
          <span>{s.slip.sum}</span>
        </span>
        <span class="scan__beam"></span>
      </div>
      <div class="scan__card">
        <p class="scan__title">{s.read}</p>
        <dl class="scan__fields">
          {s.fields.map(([label, value], i) => (
            <div class={`scan__field scan__field--${i + 1}`}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        <div class="scan__entry">
          <p class="scan__entry-title">{s.entry}</p>
          <p class="scan__account">
            <strong>{s.debit[0]}</strong>
            <span>{s.debit[1]}</span>
          </p>
          <p class="scan__account">
            <strong>{s.credit[0]}</strong>
            <span>{s.credit[1]}</span>
          </p>
        </div>
        <p class="scan__flag">{s.flag}</p>
        <div class="toast">
          <Tick />
          <span class="toast__text">
            <strong>{s.toast}</strong>
            <span>{s.toastSub}</span>
          </span>
        </div>
      </div>
    </div>
  )
}

const FileScreen: FC = () => {
  const f = copy.month.file
  return (
    <div class="ui ui--file">
      <div class="filing">
        <div class="filing__top">
          <span>
            <span class="filing__doc">{f.doc}</span>
            <span class="filing__period">{f.period}</span>
          </span>
          <span class="pill">{f.status}</span>
        </div>
        <dl class="filing__rows">
          {f.rows.map(([label, value]) => (
            <div>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        <div class="filing__foot">
          <Tick />
          <span>{f.checked}</span>
          <span class="filing__when">{f.when}</span>
        </div>
      </div>
    </div>
  )
}

const KnowScreen: FC = () => {
  const k = copy.month.know
  return (
    <div class="ui ui--know">
      <div class="overview">
        <p class="overview__month">{k.month}</p>
        <dl class="overview__stats">
          {k.stats.map(([label, value]) => (
            <div>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        <div class="bars" aria-hidden="true">
          {k.bars.map((month, i) => (
            <span class={`bar bar--${i + 1}`}>
              <span class="bar__fill"></span>
              <span class="bar__label">{month}</span>
            </span>
          ))}
        </div>
        <div class="overview__tax">
          <span>{k.tax}</span>
          <strong>{k.taxValue}</strong>
        </div>
        <p class="overview__next">{k.next}</p>
      </div>
    </div>
  )
}

const MOMENTS = [
  { id: 'scan', text: copy.month.snap, Screen: ScanScreen },
  { id: 'file', text: copy.month.file, Screen: FileScreen },
  { id: 'know', text: copy.month.know, Screen: KnowScreen },
] as const

const Month: FC = () => (
  <section class="section month" id="ako-to-funguje" aria-labelledby="month-title">
    <div class="wrap">
      <header class="head">
        <h2 id="month-title" class="h2">
          {copy.month.title}
        </h2>
        <p class="lead">{copy.month.lead}</p>
      </header>
      <ol class="moments">
        {MOMENTS.map(({ id, text, Screen }, i) => (
          <li class={`moment moment--${id}`}>
            <div class="moment__copy">
              <span class="moment__num" aria-hidden="true">
                {i + 1}
              </span>
              <h3 class="h3">{text.title}</h3>
              <p class="moment__text">{text.text}</p>
            </div>
            <figure class="moment__stage" aria-label={`${copy.month.example}: ${text.title}`}>
              <Screen />
            </figure>
          </li>
        ))}
      </ol>
      <p class="month__example">{copy.month.example}</p>
    </div>
  </section>
)

/** The machine and the person: what each of them does. */
const Minds: FC = () => (
  <section class="section minds" aria-labelledby="people-title">
    <div class="wrap">
      <h2 id="people-title" class="h2 minds__title">
        {copy.people.title}
      </h2>
      <div class="minds__grid">
        {[
          { side: copy.people.ai, art: ART.chip, kind: 'ai' },
          { side: copy.people.human, art: ART.lens, kind: 'human' },
        ].map(({ side, art, kind }) => (
          <div class={`minds__side minds__side--${kind}`}>
            <Picture art={art} className="icon minds__icon" sizes="96px" />
            <h3 class="h3">{side.title}</h3>
            <ul class="minds__list">
              {side.items.map((item) => (
                <li>
                  <Tick />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p class="minds__close">{copy.people.close}</p>
    </div>
  </section>
)

/** The bill a client would get from us: everything in the price, nothing per document. */
const Receipt: FC = () => {
  const r = copy.receipt
  return (
    <section class="section included" aria-labelledby="included-title">
      <div class="wrap included__grid">
        <div class="included__copy">
          <h2 id="included-title" class="h2">
            {r.title}
          </h2>
          <p class="lead">{r.lead}</p>
          <ul class="included__notes">
            {r.notes.map((note) => (
              <li>{note}</li>
            ))}
          </ul>
        </div>
        <figure class="receipt" aria-label={r.label}>
          <div class="receipt__paper">
            <p class="receipt__brand" aria-hidden="true">
              firmony<span class="receipt__dot">.</span>
            </p>
            <p class="receipt__head">{r.head}</p>
            <p class="receipt__sub">{r.sub}</p>
            <dl class="receipt__lines">
              {r.lines.map(([label, value]) => (
                <div>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
            <p class="receipt__total">
              <span>{r.total}</span>
              <span class="receipt__sum">{r.totalValue}</span>
            </p>
            <p class="receipt__foot">
              {r.vat}
              <br />
              {r.thanks}
            </p>
          </div>
        </figure>
      </div>
    </section>
  )
}

const PLAN_ART: Record<PlanId, Art | null> = { start: ART.seed, rast: ART.plant, firma: ART.tree }

const Pricing: FC<{ carry: Carry }> = ({ carry }) => (
  <section class="section pricing" id="cennik" aria-labelledby="pricing-title">
    <div class="wrap">
      <header class="head head--center">
        <h2 id="pricing-title" class="h2">
          {copy.pricing.title}
        </h2>
        <p class="lead">{copy.pricing.lead}</p>
      </header>
      <div class="plans">
        {PLANS.map((plan) => {
          const rows = planRows(plan)
          const lead = plan.id === LEAD_PLAN
          return (
            <article class={`plan${lead ? ' plan--lead' : ''}`} aria-labelledby={`plan-${plan.id}`}>
              <Picture art={PLAN_ART[plan.id]} className="icon plan__icon" sizes="112px" />
              <h3 id={`plan-${plan.id}`} class="plan__name">
                {plan.name}
              </h3>
              <p class="plan__for">{rows.forWhom}</p>
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
      <div class="pricing__fine">
        <p>{copy.pricing.included}</p>
        <p>
          <strong>{copy.pricing.closing}</strong> {copy.pricing.vat} {copy.pricing.custom}
        </p>
      </div>
      <ul class="promises">
        {copy.promises.map((promise) => (
          <li class="promise">
            <Tick />
            <span class="promise__title">{promise.title}</span>
            <span class="promise__text">{promise.text}</span>
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
      <div class="wrap">
        <header class="head">
          <h2 id="calc-title" class="h2">
            {copy.calc.title}
          </h2>
          <p class="lead">{copy.calc.lead}</p>
        </header>
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
            <button class="btn btn--dark calc__button" type="submit">
              {copy.calc.button}
            </button>
          </form>
          <div class="calc__result" role="status">
            <Picture art={ART.calc} className="calc__object" sizes="(max-width: 960px) 120px, 180px" />
            {state.invalid ? <p class="calc__message">{copy.calc.invalid}</p> : <Comparison result={!r || r.kind === 'empty' ? compare(EXAMPLE) : r} example={!r || r.kind === 'empty'} />}
          </div>
        </div>
      </div>
    </section>
  )
}

const Paths: FC<{ carry: Carry }> = ({ carry }) => (
  <section class="section paths-section" aria-labelledby="paths-title">
    <div class="wrap">
      <header class="head">
        <h2 id="paths-title" class="h2">
          {copy.paths.title}
        </h2>
      </header>
      <div class="paths">
        <article class="path">
          <Picture art={ART.rocket} className="icon path__icon" sizes="128px" />
          <h3 class="h3">{copy.paths.fresh.title}</h3>
          <p class="path__text">{copy.paths.fresh.text}</p>
          <a class="btn btn--line path__cta" href={withCarry('/zacat', carry, { nova: '1' })}>
            {copy.paths.fresh.cta}
          </a>
        </article>
        <article class="path">
          <Picture art={ART.key} className="icon path__icon" sizes="128px" />
          <h3 class="h3">{copy.paths.switching.title}</h3>
          <p class="path__text">{copy.paths.switching.text}</p>
          <a class="btn btn--line path__cta" href="#zacat">
            {copy.paths.switching.cta}
          </a>
        </article>
      </div>
    </div>
  </section>
)

/** Who is behind it: the founder's note, and the company as the register has it, with a way to check it. */
const About: FC = () => (
  <section class="section about" id="kto-sme" aria-labelledby="about-title">
    <div class="wrap about__grid">
      <div class="about__note">
        <h2 id="about-title" class="h2">
          {copy.founder.title}
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
      <div class="about__card">
        <Picture art={ART.seal} className="icon about__icon" sizes="104px" />
        <p class="about__lead">{copy.company.title}</p>
        <p class="about__name">{OPERATOR.name}</p>
        <dl class="about__facts">
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
        </dl>
        <a class="btn btn--line about__verify" href={REGISTER_URL} target="_blank" rel="noopener noreferrer">
          {copy.company.verify}
        </a>
        <dl class="about__facts about__contact">
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
        <p class="small">{copy.company.reply}</p>
      </div>
    </div>
  </section>
)

const Faq: FC = () => (
  <section class="section" id="otazky" aria-labelledby="faq-title">
    <div class="wrap faq">
      <div class="faq__head">
        <h2 id="faq-title" class="h2">
          {copy.faq.title}
        </h2>
        <p class="faq__more">
          {copy.faq.more}{' '}
          <a class="link" href={`mailto:${BRAND.email}`}>
            {BRAND.email}
          </a>
          , {copy.faq.reply}
        </p>
      </div>
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
  <section class="final" id="zacat" aria-labelledby="final-title">
    <div class="wrap final__inner">
      <Picture art={ART.mark} className="final__mark" sizes="200px" />
      <h2 id="final-title" class="final__title">
        {copy.final.title}
      </h2>
      <p class="lead final__lead">{copy.final.lead}</p>
      <StartForm carry={carry} id="ico-final" />
      <a class="link final__fresh" href={withCarry('/zacat', carry, { nova: '1' })}>
        {copy.final.noCompany}
      </a>
      <p class="final__aside">
        {copy.final.write}{' '}
        <a class="link" href={`mailto:${BRAND.email}`}>
          {BRAND.email}
        </a>
        . {copy.final.reply}
      </p>
    </div>
  </section>
)

export const Home: FC<{ carry: Carry; calc: CalcState }> = ({ carry, calc }) => (
  <>
    <Settle />
    <Einvoice />
    <Embrace />
    <Month />
    <Minds />
    <Receipt />
    <Pricing carry={carry} />
    <Calculator state={calc} carry={carry} />
    <Paths carry={carry} />
    <About />
    <Faq />
    <Final carry={carry} />
  </>
)
