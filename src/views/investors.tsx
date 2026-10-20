// Firmony for investors (14 October 2026): the page /investori, which says what the tax return of a person who
// invests through a broker will be and collects the people who want it, until it starts in January. It is built
// from the site's own parts: the panel of light with the card lying over its edge, his glass in tiles, the sheet of
// two ways, the questions, the closing panel with the form.
import type { FC } from 'hono/jsx'
import { ART, INVESTORS, type InvestorBroker, type InvestorWay } from '../config'
import { copy } from '../copy'
import { CarryFields, Picture, Tile, type Carry } from './home'

const t = copy.investors

export interface InvestorValues {
  email: string
  brokers: InvestorBroker[]
  way: InvestorWay | null
}

/** The address field and its button, as the IČO field is built (the card in the opening and the closing panel). */
const EmailRow: FC<{ id: string; value: string; error?: string }> = ({ id, value, error }) => (
  <>
    <label class="ico__label" for={id}>
      {t.card.label}
    </label>
    <div class={`ico__row ico__row--email${error ? ' ico__row--error' : ''}`}>
      <input
        class="ico__input"
        id={id}
        name="email"
        type="email"
        inputmode="email"
        autocomplete="email"
        placeholder={t.card.placeholder}
        value={value}
        maxlength={200}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
      />
      <button class="btn btn--blue ico__button" type="submit">
        {t.card.button}
      </button>
    </div>
    {error ? (
      <p class="field__error" id={`${id}-error`}>
        {error}
      </p>
    ) : null}
  </>
)

/** A field nobody sees, which only a machine fills in. */
const Trap: FC = () => (
  <p class="trap" aria-hidden="true">
    <label>
      Web
      <input type="text" name="web" tabindex={-1} autocomplete="off" />
    </label>
  </p>
)

const Hero: FC<{ carry: Carry; values: InvestorValues; error?: string }> = ({ carry, values, error }) => (
  <section class="hero" aria-labelledby="hero-title">
    <div class="wrap hero__grid">
      <div class="hero__panel">
        <div class="hero__copy">
          <h1 id="hero-title" class="hero__title">
            <span class="hero__line">{t.hero.first}</span> <em class="hero__line hero__line--serif">{t.hero.second}</em>
          </h1>
          <p class="hero__lead">{t.hero.lead}</p>
        </div>
        <ul class="hero__glass" aria-hidden="true">
          <li class="hero__float hero__float--1">
            <Picture art={ART.tree} className="hero__float-img" sizes="(max-width: 640px) 120px, 240px" eager />
          </li>
          <li class="hero__float hero__float--2">
            <Picture art={ART.savings} className="hero__float-img" sizes="(max-width: 640px) 90px, 160px" eager />
          </li>
          <li class="hero__float hero__float--3">
            <Picture art={ART.paperReturn} className="hero__float-img" sizes="(max-width: 640px) 80px, 130px" eager />
          </li>
        </ul>
      </div>
      <div class="hero__side">
        <div class="hero__card">
          <div class="hero__card-head">
            <Tile art={ART.envelope} size="md" eager />
            <h2 class="hero__card-title">{t.card.title}</h2>
          </div>
          <p class="hero__card-text">{t.card.text}</p>
          <form class="ico ico--compact" method="post" action="/investori" novalidate>
            <CarryFields carry={carry} />
            <Trap />
            <EmailRow id="email-hero" value={values.email} error={error} />
          </form>
          <p class="hero__card-foot">
            <span>{t.card.fine}</span>
          </p>
        </div>
      </div>
      <div class="hero__below">
        <p class="hero__price">{t.hero.note}</p>
        <p class="hero__actions">
          <a class="btn btn--text" href="#ako-to-funguje">
            {t.hero.how}
          </a>
        </p>
      </div>
    </div>
  </section>
)

const Brokers: FC = () => (
  <section class="ibrokers" aria-label={t.brokers}>
    <div class="wrap ibrokers__row">
      <p class="ibrokers__lead">{t.brokers}</p>
      <ul class="ibrokers__list">
        {INVESTORS.brokers
          .filter((b) => b.id !== 'ine')
          .map((b) => (
            <li class="ibrokers__name">{b.name}</li>
          ))}
      </ul>
    </div>
  </section>
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

const STEP_ART = [ART.paperBank, ART.lens, ART.seal] as const

const Steps: FC = () => (
  <section class="section" id="ako-to-funguje" aria-labelledby="steps-title">
    <header class="wrap head head--center">
      <Title id="steps-title" first={t.steps.first} second={t.steps.second} />
    </header>
    <ol class="wrap isteps">
      {t.steps.items.map((step, i) => (
        <li class="card istep">
          <span class="istep__top">
            <Tile art={STEP_ART[i] ?? null} size="md" />
            <span class="istep__n">{i + 1}</span>
          </span>
          <h3 class="h4">{step.title}</h3>
          <p class="istep__text">{step.text}</p>
        </li>
      ))}
    </ol>
  </section>
)

const RULE_ART = [ART.plant, ART.paperReturn, ART.savings, ART.seed, ART.chip, ART.key] as const

const Rules: FC = () => (
  <section class="section irules-section" aria-labelledby="rules-title">
    <header class="wrap head head--center">
      <Title id="rules-title" first={t.rules.first} second={t.rules.second} />
    </header>
    <ul class="wrap irules">
      {t.rules.items.map((rule, i) => (
        <li class="irule">
          <Tile art={RULE_ART[i] ?? null} size="sm" />
          <h3 class="h4">{rule.title}</h3>
          <p class="irule__text">{rule.text}</p>
        </li>
      ))}
    </ul>
  </section>
)

const Way: FC<{ way: typeof t.ways.self; lead?: boolean }> = ({ way, lead }) => (
  <article class={`card iway${lead ? ' iway--lead' : ''}`}>
    <h3 class="h3">{way.title}</h3>
    <p class="iway__price">
      <span class="iway__amount">{way.price}</span>
      <span class="iway__note">{way.priceNote}</span>
    </p>
    <ul class="iway__points">
      {way.points.map((point) => (
        <li>
          <span class="tick" aria-hidden="true"></span>
          {point}
        </li>
      ))}
    </ul>
  </article>
)

const Ways: FC = () => (
  <section class="section" id="cena" aria-labelledby="ways-title">
    <header class="wrap head head--center">
      <Title id="ways-title" first={t.ways.first} second={t.ways.second} />
    </header>
    <div class="wrap iways">
      <Way way={t.ways.self} />
      <Way way={t.ways.done} lead />
    </div>
    <p class="wrap small iways__note">{t.ways.note}</p>
  </section>
)

const Bridge: FC<{ carry: Carry }> = ({ carry }) => (
  <section class="section ibridge-section" aria-labelledby="bridge-title">
    <div class="wrap">
      <div class="ibridge">
        <Tile art={ART.rocket} size="lg" />
        <div class="ibridge__text">
          <h2 id="bridge-title" class="h3">
            {t.bridge.title}
          </h2>
          <p>{t.bridge.text}</p>
        </div>
        <a class="btn btn--line" href={carry.length > 0 ? `/?${new URLSearchParams(carry as [string, string][]).toString()}` : '/'}>
          {t.bridge.link}
        </a>
      </div>
    </div>
  </section>
)

const Faq: FC = () => (
  <section class="section faq-section" id="otazky" aria-labelledby="ifaq-title">
    <header class="wrap head head--center">
      <Title id="ifaq-title" first={copy.faq.title} />
    </header>
    <div class="wrap faq">
      {t.faq.map((item) => (
        <details class="faq__item">
          <summary>{item.q}</summary>
          <p>{item.a}</p>
        </details>
      ))}
    </div>
  </section>
)

const Final: FC<{ carry: Carry; values: InvestorValues; error?: string }> = ({ carry, values, error }) => (
  <section class="final-section" id="zapis" aria-labelledby="final-title">
    <div class="wrap">
      <div class="final">
        <Picture art={ART.mark} className="final__mark" sizes="(max-width: 640px) 96px, 140px" />
        <h2 id="final-title" class="final__title">
          {t.final.title}
        </h2>
        <p class="final__lead">{t.final.lead}</p>
        <form class="ico iform" method="post" action="/investori" novalidate>
          <CarryFields carry={carry} />
          <Trap />
          <input type="hidden" name="forma" value="zapis" />
          <fieldset class="iform__group">
            <legend class="iform__legend">{t.final.brokers}</legend>
            <div class="iform__chips">
              {INVESTORS.brokers.map((b) => (
                <label class="ichip">
                  <input type="checkbox" name="broker" value={b.id} checked={values.brokers.includes(b.id)} />
                  <span>{b.name}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset class="iform__group">
            <legend class="iform__legend">{t.final.way}</legend>
            <div class="iform__chips">
              {INVESTORS.ways.map((way) => (
                <label class="ichip">
                  <input type="radio" name="cesta" value={way} checked={values.way === way} />
                  <span>{t.final.ways[way]}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <EmailRow id="email-final" value={values.email} error={error} />
        </form>
        <p class="final__aside">
          <span>{t.final.fine}</span>
          <a class="final__mail" href="/pravne-informacie#ochrana-udajov">
            {t.final.privacy}
          </a>
        </p>
      </div>
    </div>
  </section>
)

export const InvestorsPage: FC<{ carry: Carry; values: InvestorValues; error?: string; at?: 'hero' | 'final' }> = ({ carry, values, error, at }) => (
  <>
    <Hero carry={carry} values={at === 'final' ? { ...values, email: '' } : values} error={at === 'final' ? undefined : error} />
    <Brokers />
    <Steps />
    <Rules />
    <Ways />
    <Bridge carry={carry} />
    <Faq />
    <Final carry={carry} values={at === 'hero' ? { email: '', brokers: [], way: null } : values} error={at === 'hero' ? undefined : error} />
  </>
)

export const InvestorsThanks: FC = () => (
  <section class="section page">
    <div class="wrap narrow page__inner">
      <Tile art={ART.seal} size="lg" />
      <h1 class="h1">{t.thanks.title}</h1>
      <p class="lead">{t.thanks.lead}</p>
      <p class="page__more">
        <a class="btn btn--line" href="/investori">
          {t.thanks.back}
        </a>
        <a class="link" href="/">
          {t.thanks.firms}
        </a>
      </p>
    </div>
  </section>
)
