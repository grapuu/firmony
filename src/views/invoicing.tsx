// Invoicing for everyone (26 October 2026): the public page with its sign-up, the pages of the link, the terms of use,
// and the workspace's own pages in the app (settings, customers, the first steps, paid by hand). The site's own parts
// throughout: the panel of light with the card over its edge, his glass in tiles, the questions, the closing panel.
import type { FC } from 'hono/jsx'
import { ART, BRAND, type Art } from '../config'
import { formatEurExact } from '../format'
import { dayName } from '../app/copy'
import type { Customer, WorkspaceErrors, WorkspaceValues } from '../app/invoicing'
import { INVOICING_PATH, INVOICING_TERMS, invoicingCopy as v } from '../content/invoicing'
import { CarryFields, Picture, Tile, type Carry } from './home'
import { Flash, Heading } from './inside'

const FEATURE_ART: (Art | null)[] = [ART.seal, ART.paperInvoice, ART.paperReturn, ART.paperReceipt, ART.paperEinvoice, ART.plant, ART.lens, ART.key, ART.savings]

export interface SignupFormValues {
  email: string
  ico: string
  company: string
  address: string
}
export type SignupErrors = Partial<Record<keyof SignupFormValues | 'form', string>>

const Field: FC<{ id: string; name: string; label: string; value: string; error?: string; type?: string; mode?: string; auto?: string; max: number }> = ({ id, name, label, value, error, type = 'text', mode, auto = 'off', max }) => (
  <div class="field signup__field">
    <label class="field__label" for={id}>
      {label}
    </label>
    <input
      id={id}
      class="field__input"
      type={type}
      name={name}
      value={value}
      inputmode={mode as 'numeric' | 'email' | undefined}
      autocomplete={auto}
      maxlength={max}
      aria-invalid={error ? 'true' : undefined}
      aria-describedby={error ? `${id}-error` : undefined}
    />
    {error ? (
      <p class="field__error" id={`${id}-error`}>
        {error}
      </p>
    ) : null}
  </div>
)

/** The sign-up: e-mail, name and IČO; the company's name and address only when the register cannot give them. */
export const SignupForm: FC<{ carry: Carry; values: SignupFormValues; errors: SignupErrors; manual: boolean; prefix: string }> = ({ carry, values, errors, manual, prefix }) => {
  const f = v.form
  const consent = f.consent(f.termsLink, f.privacyLink)
  return (
    <form class="signup" method="post" action={INVOICING_PATH} novalidate>
      <CarryFields carry={carry} />
      {/* A field nobody sees, which only a machine fills in. */}
      <div class="trap" aria-hidden="true">
        <label for={`${prefix}-web`}>Web</label>
        <input id={`${prefix}-web`} name="web" tabindex={-1} autocomplete="off" />
      </div>
      {errors.form ? (
        <p class="notice notice--error" role="alert">
          {errors.form}
        </p>
      ) : null}
      <Field id={`${prefix}-ico`} name="ico" label={f.ico} value={values.ico} error={errors.ico} mode="numeric" max={12} />
      <Field id={`${prefix}-email`} name="email" label={f.email} value={values.email} error={errors.email} type="email" mode="email" auto="email" max={200} />
      {manual ? (
        <>
          <p class="signup__note">{f.manualLead}</p>
          <input type="hidden" name="rucne" value="1" />
          <Field id={`${prefix}-company`} name="firma" label={f.company} value={values.company} error={errors.company} auto="organization" max={160} />
          <Field id={`${prefix}-address`} name="adresa" label={f.address} value={values.address} error={errors.address} auto="street-address" max={240} />
        </>
      ) : null}
      <button class="btn btn--blue btn--large signup__submit" type="submit">
        {f.submit}
      </button>
      <p class="signup__fine">
        {consent[0]}
        <a class="link" href={`${INVOICING_PATH}/podmienky`}>
          {consent[1]}
        </a>
        {consent[2]}
        <a class="link" href="/pravne-informacie#ochrana-udajov">
          {consent[3]}
        </a>
        {consent[4]}
      </p>
    </form>
  )
}

/** The public page: what it is, the sign-up in the card over the panel's edge, what it does, how, why free, questions. */
export const InvoicingPage: FC<{ carry: Carry; values: SignupFormValues; errors: SignupErrors; manual: boolean }> = ({ carry, values, errors, manual }) => (
  <>
    <section class="hero hero--invoicing" aria-labelledby="hero-title">
      <div class="wrap hero__grid">
        <div class="hero__panel">
          <div class="hero__copy">
            <p class="pill pill--glass">{v.hero.pill}</p>
            <h1 id="hero-title" class="hero__title">
              <span class="hero__line">{v.hero.first}</span> <em class="hero__line hero__line--serif">{v.hero.second}</em>
            </h1>
            <p class="hero__lead">{v.hero.lead}</p>
          </div>
          <ul class="hero__glass" aria-hidden="true">
            <li class="hero__float hero__float--1">
              <Picture art={ART.paperInvoice} className="hero__float-img" sizes="(max-width: 640px) 120px, 240px" eager />
            </li>
            <li class="hero__float hero__float--2">
              <Picture art={ART.paperEinvoice} className="hero__float-img" sizes="(max-width: 640px) 90px, 160px" eager />
            </li>
            <li class="hero__float hero__float--3">
              <Picture art={ART.savings} className="hero__float-img" sizes="(max-width: 640px) 80px, 130px" eager />
            </li>
          </ul>
        </div>
        <div class="hero__side" id="zacat">
          <div class="hero__card">
            <div class="hero__card-head">
              <Tile art={ART.mark} size="md" eager />
              <h2 class="hero__card-title">{v.form.title}</h2>
            </div>
            <p class="hero__card-text">{v.form.text}</p>
            <SignupForm carry={carry} values={values} errors={errors} manual={manual} prefix="signup" />
            <p class="hero__card-foot">
              <span>{v.form.fine}</span>
            </p>
          </div>
        </div>
        <div class="hero__below">
          <p class="hero__price">{v.hero.price}</p>
          <p class="hero__actions">
            <a class="btn btn--line" href="#co-vie">
              {v.hero.features}
            </a>
            <a class="btn btn--text" href="#ako">
              {v.hero.how}
            </a>
          </p>
        </div>
      </div>
    </section>

    <section class="section invoicing-features" id="co-vie" aria-labelledby="features-title">
      <header class="wrap head head--center">
        <h2 id="features-title" class="title">
          <span class="title__sans">{v.features.title}</span> <em class="title__serif">{v.features.serif}</em>
        </h2>
      </header>
      <div class="wrap invoicing-features__grid">
        {v.features.items.map((item, i) => (
          <article class="invoicing-features__card">
            <Tile art={FEATURE_ART[i] ?? ART.mark} size="md" />
            <h3>{item.title}</h3>
            <p>{item.text}</p>
          </article>
        ))}
      </div>
    </section>

    <section class="section invoicing-steps" id="ako" aria-labelledby="steps-title">
      <header class="wrap head head--center">
        <h2 id="steps-title" class="title">
          <span class="title__sans">{v.steps.title}</span> <em class="title__serif">{v.steps.serif}</em>
        </h2>
      </header>
      <ol class="wrap invoicing-steps__list">
        {v.steps.items.map((item, i) => (
          <li class="invoicing-steps__item">
            <span class="invoicing-steps__n" aria-hidden="true">
              {i + 1}
            </span>
            <h3>{item.title}</h3>
            <p>{item.text}</p>
          </li>
        ))}
      </ol>
    </section>

    <section class="section invoicing-why" aria-labelledby="why-title">
      <div class="wrap narrow invoicing-why__box">
        <h2 id="why-title" class="invoicing-why__title">
          {v.why.title}
        </h2>
        <p>{v.why.text}</p>
        <a class="btn btn--line" href="/#cennik">
          {v.why.link}
        </a>
      </div>
    </section>

    <section class="section faq-section" id="otazky" aria-labelledby="faq-title">
      <header class="wrap head head--center">
        <h2 id="faq-title" class="title">
          <span class="title__sans">{v.faq.title}</span>
        </h2>
      </header>
      <div class="wrap faq">
        {v.faq.items.map((item) => (
          <details class="faq__item">
            <summary>{item.q}</summary>
            <p>{item.a}</p>
          </details>
        ))}
      </div>
    </section>

    <section class="final-section" aria-labelledby="final-title">
      <div class="wrap">
        <div class="final">
          <Picture art={ART.mark} className="final__mark" sizes="(max-width: 640px) 96px, 140px" />
          <h2 id="final-title" class="final__title">
            {v.final.title} <em>{v.final.serif}</em>
          </h2>
          <a class="btn btn--white btn--large" href="#zacat">
            {v.final.button}
          </a>
        </div>
      </div>
    </section>
  </>
)

/** A small page of its own for each step of the link: the wordmark's site, one card. */
const Card: FC<{ title: string; children?: unknown }> = ({ title, children }) => (
  <section class="section page">
    <div class="wrap narrow page__inner signup-card">
      <h1 class="title">
        <span class="title__sans">{title}</span>
      </h1>
      {children as never}
    </div>
  </section>
)

export const SignupSent: FC<{ email: string }> = ({ email }) => (
  <Card title={v.sent.title}>
    <p class="lead">{v.sent.lead(email)}</p>
    <p class="page__text">{v.sent.spam}</p>
    <p>
      <a class="btn btn--line" href={`${INVOICING_PATH}#zacat`}>
        {v.sent.again}
      </a>
    </p>
  </Card>
)

export const SignupEnter: FC<{ token: string; company: string; ico: string | null; email: string; name?: string; errors?: { name?: string; agree?: string } }> = ({ token, company, ico, email, name = '', errors = {} }) => (
  <Card title={v.enter.title}>
    <p class="lead">{v.enter.lead}</p>
    <dl class="signup-card__facts">
      <div>
        <dt>{v.enter.company}</dt>
        <dd>{company}</dd>
      </div>
      {ico ? (
        <div>
          <dt>{v.enter.ico}</dt>
          <dd>{ico}</dd>
        </div>
      ) : null}
      <div>
        <dt>{v.enter.email}</dt>
        <dd>{email}</dd>
      </div>
    </dl>
    <form method="post" action={`${INVOICING_PATH}/vstup`} class="signup" novalidate>
      <input type="hidden" name="t" value={token} />
      <Field id="enter-name" name="meno" label={v.form.name} value={name} error={errors.name} auto="name" max={120} />
      <div class="field">
        <label class="agree">
          <input type="checkbox" name="suhlas" value="1" aria-invalid={errors.agree ? 'true' : undefined} aria-describedby={errors.agree ? 'suhlas-error' : undefined} />
          <span>{v.enter.agree}</span>
        </label>
        <p class="small">
          <a class="link" href={`${INVOICING_PATH}/podmienky`} target="_blank" rel="noopener">
            {v.form.termsLink}
          </a>
          {' · '}
          <a class="link" href="/pravne-informacie#ochrana-udajov" target="_blank" rel="noopener">
            {v.form.privacyLink}
          </a>
        </p>
        {errors.agree ? (
          <p class="field__error" id="suhlas-error">
            {errors.agree}
          </p>
        ) : null}
      </div>
      <button class="btn btn--blue btn--large signup__submit" type="submit">
        {v.enter.submit}
      </button>
    </form>
  </Card>
)

export const SignupExpired: FC<{ tooMany?: boolean }> = ({ tooMany = false }) => (
  <Card title={v.enter.expiredTitle}>
    <p class="lead">{tooMany ? v.enter.tooMany : v.enter.expired}</p>
    <p class="signup-card__actions">
      <a class="btn btn--blue" href="/app/prihlasenie">
        {v.enter.signIn}
      </a>
      {tooMany ? null : (
        <a class="btn btn--line" href={`${INVOICING_PATH}#zacat`}>
          {v.enter.again}
        </a>
      )}
    </p>
  </Card>
)

export const InvoicingTermsPage: FC = () => (
  <section class="section page">
    <div class="wrap reading page__inner">
      <article class="legal terms">
        <h1 class="h1">{v.terms.title}</h1>
        <p class="lead">{v.terms.lead}</p>
        {INVOICING_TERMS.map((section, i) => (
          <section class="terms__section" id={`clanok-${i + 1}`}>
            <h2 class="h3">
              {i + 1}. {section.title}
            </h2>
            <ol class="terms__points">
              {section.points.map((point, j) => (
                <li id={`bod-${i + 1}-${j + 1}`}>
                  <span class="terms__number">
                    {i + 1}.{j + 1}
                  </span>
                  <span>{point}</span>
                </li>
              ))}
            </ol>
          </section>
        ))}
        <p class="small">
          {v.terms.contact} <a href={`mailto:${BRAND.email}`}>{BRAND.email}</a>.
        </p>
      </article>
    </div>
  </section>
)

// ---------------------------------------------------------------------------------------------------------------
// The workspace in the app
// ---------------------------------------------------------------------------------------------------------------

/** Above the invoices of a workspace: what is still missing for the first one, or the way to it. */
export const WorkspaceWelcome: FC<{ ready: boolean; register: boolean; empty: boolean }> = ({ ready, register, empty }) => {
  const w = v.app.welcome
  if (ready && !register && !empty) return null
  return (
    <section class="info workspace-welcome" aria-labelledby="vitajte-t">
      <h2 id="vitajte-t" class="info__title">
        {ready ? w.ready : w.title}
      </h2>
      <p class="info__lead">{ready ? w.readyLead : w.lead}</p>
      {register ? <p class="info__source">{w.register}</p> : null}
      <p class="workspace-welcome__actions">
        {ready ? (
          <a class="btn btn--blue" href="/app/faktury/nova">
            {w.first}
          </a>
        ) : (
          <a class="btn btn--blue" href="/app/fakturacia">
            {w.button}
          </a>
        )}
      </p>
    </section>
  )
}

const SettingsField: FC<{ name: string; label: string; value: string; error?: string; hint?: string; mode?: string; max: number; wide?: boolean }> = ({ name, label, value, error, hint, mode, max, wide }) => (
  <div class={`fgrid__cell${wide ? ' fgrid__cell--wide' : ''}`}>
    <label class="field__label" for={`w-${name}`}>
      {label}
    </label>
    <input
      id={`w-${name}`}
      class="field__input"
      name={name}
      value={value}
      inputmode={mode as 'numeric' | undefined}
      maxlength={max}
      autocomplete="off"
      aria-invalid={error ? 'true' : undefined}
      aria-describedby={[error ? `w-${name}-error` : '', hint ? `w-${name}-hint` : ''].filter(Boolean).join(' ') || undefined}
    />
    {hint ? (
      <p class="field__hint" id={`w-${name}-hint`}>
        {hint}
      </p>
    ) : null}
    {error ? (
      <p class="field__error" id={`w-${name}-error`}>
        {error}
      </p>
    ) : null}
  </div>
)

export const WorkspaceSettings: FC<{ values: WorkspaceValues; errors: WorkspaceErrors; owner: boolean; ico: string | null; flash?: string | null; removeError?: string | null }> = ({
  values,
  errors,
  owner,
  ico,
  flash = null,
  removeError = null,
}) => {
  const s = v.app.settings
  const r = v.app.remove
  return (
    <>
      <header class="phead">
        <Heading first={s.title} small />
        <p class="phead__lead">{s.lead}</p>
      </header>
      <Flash text={flash} />
      {errors.form ? <Flash text={errors.form} tone="error" /> : null}
      {owner ? (
        <form class="stack" method="post" action="/app/fakturacia" novalidate>
          <section class="info" aria-labelledby="w-firma">
            <h2 id="w-firma" class="info__title">
              {s.firm}
            </h2>
            <div class="fgrid">
              <SettingsField name="meno" label={s.name} value={values.name} error={errors.name} max={160} wide />
              <SettingsField name="adresa" label={s.address} value={values.address} error={errors.address} max={240} wide />
              <SettingsField name="ico" label={s.ico} value={values.ico} error={errors.ico} mode="numeric" max={12} />
              <SettingsField name="dic" label={s.dic} value={values.dic} error={errors.dic} mode="numeric" max={12} />
              <SettingsField name="icdph" label={s.icdph} value={values.icdph} error={errors.icdph} max={14} />
              <SettingsField name="register" label={s.register} value={values.registerLine} error={errors.registerLine} hint={s.registerHint} max={240} wide />
            </div>
            <label class="agree">
              <input type="checkbox" name="platitel" value="1" checked={values.vatPayer} />
              <span>{s.vatPayer}</span>
            </label>
            <p class="field__hint">{s.vatPayerHint}</p>
          </section>
          <section class="info" aria-labelledby="w-platby">
            <h2 id="w-platby" class="info__title">
              {s.payments}
            </h2>
            <div class="fgrid">
              <SettingsField name="iban" label={s.iban} value={values.iban} error={errors.iban} max={42} wide />
              <SettingsField name="splatnost" label={s.dueDays} value={values.dueDays} error={errors.dueDays} mode="numeric" max={3} />
            </div>
          </section>
          <p>
            <button class="btn btn--blue btn--large" type="submit">
              {s.save}
            </button>
          </p>
        </form>
      ) : (
        <p class="info__source">{s.onlyOwner}</p>
      )}
      <section class="info" aria-labelledby="w-cisla">
        <h2 id="w-cisla" class="info__title">
          {s.numbering}
        </h2>
        <p class="info__lead">{s.numberingLead}</p>
        <a class="btn btn--line" href="/app/faktury/cislovanie">
          {s.numberingLink}
        </a>
      </section>
      <section class="info info--soft" aria-labelledby="w-uctovnictvo">
        <h2 id="w-uctovnictvo" class="info__title">
          {v.app.accounting.title}
        </h2>
        <p class="info__lead">{v.app.accounting.lead}</p>
        <a class="btn btn--blue" href={ico ? `/zacat?ico=${encodeURIComponent(ico)}&ref=fakturacia` : '/zacat?ref=fakturacia'}>
          {v.app.accounting.button}
        </a>
      </section>
      <section class="info info--danger" id="zrusit" aria-labelledby="w-zrusit">
        <h2 id="w-zrusit" class="info__title">
          {r.title}
        </h2>
        <p class="info__lead">{r.lead}</p>
        {owner ? (
          <form class="stack" method="post" action="/app/fakturacia/zrusit" novalidate>
            <label class="field__label" for="w-potvrdenie">
              {r.confirm}
            </label>
            <input id="w-potvrdenie" class="field__input" name="potvrdenie" autocomplete="off" maxlength={20} aria-invalid={removeError ? 'true' : undefined} />
            {removeError ? <p class="field__error">{removeError}</p> : null}
            <button class="btn btn--danger" type="submit">
              {r.button}
            </button>
          </form>
        ) : (
          <p class="info__source">{r.onlyOwner}</p>
        )}
      </section>
    </>
  )
}

export const CustomersPage: FC<{ customers: Customer[] }> = ({ customers }) => {
  const c = v.app.customers
  return (
    <>
      <header class="phead phead--row">
        <div>
          <Heading first={c.title} small />
          <p class="phead__lead">{c.lead}</p>
        </div>
        <a class="btn btn--blue phead__aside" href="/app/faktury/nova">
          {v.app.nav.add}
        </a>
      </header>
      {customers.length === 0 ? (
        <section class="info">
          <p class="info__empty">{c.empty}</p>
          <a class="btn btn--blue" href="/app/faktury/nova">
            {c.first}
          </a>
        </section>
      ) : (
        <ul class="rows rows--card customers">
          {customers.map((customer) => (
            <li class="row customers__row">
              <div class="customers__who">
                <p class="row__title">{customer.name}</p>
                <p class="row__sub">{[customer.ico ? c.ico(customer.ico) : null, customer.address].filter(Boolean).join(' · ')}</p>
              </div>
              <dl class="customers__figures">
                <div>
                  <dt>{c.count}</dt>
                  <dd>{customer.invoices}</dd>
                </div>
                <div>
                  <dt>{c.invoiced}</dt>
                  <dd>{formatEurExact(customer.invoicedCents)}</dd>
                </div>
                <div>
                  <dt>{c.open}</dt>
                  <dd class={customer.openCents > 0 ? 'customers__open' : undefined}>{formatEurExact(customer.openCents)}</dd>
                </div>
                <div>
                  <dt>{c.last}</dt>
                  <dd>{dayName(customer.lastOn)}</dd>
                </div>
              </dl>
              <a class="btn btn--line btn--small customers__action" href={`/app/faktury/nova?odberatel=${customer.latest}`}>
                {c.action}
              </a>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

/** The payment of a workspace's invoice: marked by hand, or taken back (not once an advance's document stands). */
export const HandPaid: FC<{ invoiceId: string; proforma: boolean; paidOn: string | null; today: string; advance: { id: string; number: string | null } | null; error?: string | null }> = ({
  invoiceId,
  proforma,
  paidOn,
  today,
  advance,
  error = null,
}) => {
  const p = v.app.paid
  return (
    <section class="info hand-paid" aria-labelledby="platba-t">
      <h2 id="platba-t" class="info__title">
        {p.title}
      </h2>
      {paidOn ? (
        <>
          <p class="info__lead">{p.marked(dayName(paidOn, today))}</p>
          {advance ? (
            <>
              <a class="btn btn--line invoice__wide" href={`/app/faktury/${advance.id}`}>
                {p.advance(advance.number ?? '')}
              </a>
              <p class="info__source">{p.undoBlocked}</p>
            </>
          ) : (
            <form method="post" action={`/app/faktury/${invoiceId}/nezaplatena`}>
              <button class="btn btn--text" type="submit">
                {p.undo}
              </button>
            </form>
          )}
        </>
      ) : (
        <form class="stack" method="post" action={`/app/faktury/${invoiceId}/zaplatena`} novalidate>
          <p class="info__lead">{proforma ? p.leadProforma : p.lead}</p>
          <label class="field__label" for="platba-den">
            {p.day}
          </label>
          <input id="platba-den" class="field__input" name="den" value={dayName(today).replace(/ /g, ' ')} inputmode="numeric" maxlength={16} autocomplete="off" aria-invalid={error ? 'true' : undefined} />
          {error ? <p class="field__error">{error}</p> : null}
          <button class="btn btn--blue invoice__wide" type="submit">
            {proforma ? p.markProforma : p.mark}
          </button>
        </form>
      )}
    </section>
  )
}
