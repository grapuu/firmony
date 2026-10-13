import type { Child, FC } from 'hono/jsx'
import { PLANS, planById } from '../config'
import { copy } from '../copy'
import { formatEur, typeset } from '../format'
import { formatIco } from '../ico'
import type { Company } from '../rpo'
import { CarryFields, StartForm, withCarry, type Carry } from './home'

export type Situation = 'switch' | 'fresh' | 'other'

export interface DetailsValues {
  company: string
  plan: string
  situation: Situation
  name: string
  email: string
  phone: string
  note: string
}

export type DetailsErrors = Partial<Record<'company' | 'name' | 'email' | 'phone' | 'note' | 'form', string>>

/** What the register said, as the page shows it. */
export type CompanyState =
  | { kind: 'found'; company: Company }
  | { kind: 'missing'; ico: string }
  | { kind: 'failed'; ico: string }
  | { kind: 'busy'; ico: string }
  | { kind: 'fresh' }

/** A page of the request: a soft light at its top and one narrow column. */
const Page: FC<{ children: Child }> = ({ children }) => (
  <section class="section page">
    <div class="wrap narrow page__inner">{children}</div>
  </section>
)

const ChosenPlan: FC<{ plan: string }> = ({ plan }) => {
  const chosen = planById(plan)
  if (!chosen) return null
  return (
    <p class="chosen">
      <span>{copy.start.chosen}</span>
      <strong>
        {chosen.name}, {formatEur(chosen.price * 100)} {copy.start.perMonth}
      </strong>
    </p>
  )
}

/** The first step: the IČO, or the way in without a company. */
export const StartIco: FC<{ carry: Carry; plan: string; value?: string; error?: string }> = ({ carry, plan, value, error }) => (
  <Page>
    <h1 class="h1">{copy.start.title}</h1>
    <p class="lead">{copy.start.lead}</p>
    <ChosenPlan plan={plan} />
    <StartForm carry={plan ? [...carry, ['balik', plan]] : carry} value={value} error={error} />
    <p class="page__more">
      <a class="link" href={withCarry('/zacat', carry, plan ? { nova: '1', balik: plan } : { nova: '1' })}>
        {copy.final.noCompany}
      </a>
    </p>
  </Page>
)

const CompanyBlock: FC<{ state: CompanyState; carry: Carry; plan: string }> = ({ state, carry, plan }) => {
  if (state.kind === 'fresh') return null
  const again = withCarry('/zacat', carry, plan ? { balik: plan } : {})
  if (state.kind === 'found') {
    const c = state.company
    return (
      <div class="company">
        <p class="company__label">{copy.start.company}</p>
        <p class="company__name">{c.name}</p>
        <p class="company__meta">
          {c.address ? `${c.address}, ` : ''}IČO {formatIco(c.ico)}
        </p>
        {c.terminated ? <p class="notice">{copy.start.terminated}</p> : !c.isSro ? <p class="notice">{copy.start.notSro}</p> : null}
        <p class="company__foot">
          <a class="link" href={again}>
            {copy.start.other}
          </a>
          <span class="small">{copy.start.source}</span>
        </p>
      </div>
    )
  }
  const message =
    state.kind === 'missing'
      ? typeset(`IČO ${formatIco(state.ico)} sme v registri nenašli. Skontrolujte ho alebo napíšte názov firmy sami.`)
      : state.kind === 'busy'
        ? copy.start.busy
        : copy.start.failed
  return (
    <div class="company company--missing">
      <p class="notice">{message}</p>
      <p class="company__foot">
        <a class="link" href={again}>
          {copy.start.other}
        </a>
      </p>
    </div>
  )
}

const Text: FC<{
  name: keyof DetailsValues
  label: string
  value: string
  error?: string
  type?: string
  autocomplete?: string
  optional?: boolean
  inputmode?: 'email' | 'tel' | 'numeric' | 'text'
}> = ({ name, label, value, error, type = 'text', autocomplete, optional, inputmode }) => (
  <div class="field">
    <label class="field__label" for={`f-${name}`}>
      {label}
      {optional ? <span class="field__optional"> ({copy.start.optional})</span> : null}
    </label>
    <input
      class="field__input"
      id={`f-${name}`}
      name={name}
      type={type}
      value={value}
      autocomplete={autocomplete}
      inputmode={inputmode}
      aria-invalid={error ? 'true' : undefined}
      aria-describedby={error ? `f-${name}-error` : undefined}
    />
    {error ? (
      <p class="field__error" id={`f-${name}-error`}>
        {error}
      </p>
    ) : null}
  </div>
)

/** The second step: who they are and what they want. Posted to /zacat. */
export const StartDetails: FC<{
  carry: Carry
  state: CompanyState
  ico: string
  values: DetailsValues
  errors: DetailsErrors
}> = ({ carry, state, ico, values, errors }) => {
  const manual = state.kind !== 'found'
  const fresh = state.kind === 'fresh'
  return (
    <Page>
        <h1 class="h1">{fresh ? copy.start.freshTitle : copy.start.title}</h1>
        {fresh ? <p class="lead">{copy.start.freshLead}</p> : null}
        <CompanyBlock state={state} carry={carry} plan={values.plan} />
        {errors.form ? (
          <p class="notice notice--error" role="alert">
            {errors.form}
          </p>
        ) : null}
        <form class="details" method="post" action="/zacat" novalidate>
          <CarryFields carry={carry} />
          <input type="hidden" name="ico" value={ico} />
          <input type="hidden" name="mode" value={fresh ? 'fresh' : 'company'} />
          {state.kind === 'found' ? <input type="hidden" name="seen" value={state.company.name} /> : null}
          <div class="trap" aria-hidden="true">
            <label>
              Web
              <input type="text" name="web" tabindex={-1} autocomplete="off" />
            </label>
          </div>
          {manual ? (
            <Text name="company" label={fresh ? copy.start.companyNameFresh : copy.start.companyName} value={values.company} error={errors.company} optional={fresh} autocomplete="organization" />
          ) : null}
          <fieldset class="field choice">
            <legend class="field__label">{copy.start.plan}</legend>
            <div class="choice__options">
            {PLANS.map((plan) => (
              <label class="choice__option">
                <input type="radio" name="plan" value={plan.id} checked={values.plan === plan.id} />
                <span>
                  {plan.name} <span class="choice__hint">{formatEur(plan.price * 100)}</span>
                </span>
              </label>
            ))}
            <label class="choice__option">
              <input type="radio" name="plan" value="neviem" checked={!planById(values.plan)} />
              <span>{copy.start.planUnsure}</span>
            </label>
            </div>
          </fieldset>
          <fieldset class="field choice">
            <legend class="field__label">{copy.start.situation}</legend>
            <div class="choice__options">
              {(['switch', 'fresh', 'other'] as const).map((id) => (
                <label class="choice__option">
                  <input type="radio" name="situation" value={id} checked={values.situation === id} />
                  <span>{copy.start.situations[id]}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <Text name="name" label={copy.start.name} value={values.name} error={errors.name} autocomplete="name" />
          <Text name="email" label={copy.start.email} value={values.email} error={errors.email} type="email" autocomplete="email" inputmode="email" />
          <Text name="phone" label={copy.start.phone} value={values.phone} error={errors.phone} type="tel" autocomplete="tel" optional />
          <div class="field">
            <label class="field__label" for="f-note">
              {copy.start.note}
              <span class="field__optional"> ({copy.start.optional})</span>
            </label>
            <textarea
              class="field__input field__area"
              id="f-note"
              name="note"
              rows={4}
              placeholder={copy.start.notePlaceholder}
              aria-invalid={errors.note ? 'true' : undefined}
              aria-describedby={errors.note ? 'f-note-error' : undefined}
            >
              {values.note}
            </textarea>
            {errors.note ? (
              <p class="field__error" id="f-note-error">
                {errors.note}
              </p>
            ) : null}
          </div>
          <p class="small">
            {copy.start.privacy} <a href="/pravne-informacie#ochrana-udajov">{copy.start.privacyLink}</a>.
          </p>
          <button class="btn btn--white btn--large details__submit" type="submit">
            {copy.start.submit}
          </button>
        </form>
    </Page>
  )
}

export const Thanks: FC = () => (
  <Page>
    <h1 class="h1">{copy.thanks.title}</h1>
    <p class="lead">{copy.thanks.lead}</p>
    <p class="page__text">{copy.thanks.next}</p>
    <p class="page__more">
      <a class="btn btn--ghost" href="/">
        {copy.thanks.back}
      </a>
    </p>
  </Page>
)

export const NotFound: FC = () => (
  <Page>
    <h1 class="h1">{copy.notFound.title}</h1>
    <p class="lead">{copy.notFound.lead}</p>
    <p class="page__more">
      <a class="btn btn--ghost" href="/">
        {copy.notFound.back}
      </a>
    </p>
  </Page>
)
