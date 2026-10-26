// The order's page: the contract for keeping the accounts, concluded online by a director the register names. The
// main points stand in a bordered table at the top (the way his contracts are made: what matters first, the rest in
// the terms), and follow the plan and the month chosen below them without a script (`:has()` in app.css).
import type { Child, FC } from 'hono/jsx'
import { BRAND, CLOSING_PRICE, PAYROLL_PRICE, PLANS } from '../config'
import { copy } from '../copy'
import { formatEur, typeset } from '../format'
import { formatIco } from '../ico'
import type { Order } from '../order'
import { oneMayConclude } from '../rpo'
import type { ContractGate, ResolvedContract } from '../contracts'
import { TERMS, TERMS_SUBTITLE, TERMS_TITLE, longDate } from '../content/terms'

const o = copy.order

const Page: FC<{ children: Child; wide?: boolean }> = ({ children, wide }) => (
  <section class="section page">
    <div class={`wrap ${wide ? 'reading' : 'narrow'} page__inner`}>{children}</div>
  </section>
)

/** "január 2027" for the first day of a month. */
const planName = (id: string) => PLANS.find((p) => p.id === id)?.name ?? id

export function monthLabel(day: string): string {
  const names = ['január', 'február', 'marec', 'apríl', 'máj', 'jún', 'júl', 'august', 'september', 'október', 'november', 'december']
  return `${names[Number(day.slice(5, 7)) - 1] ?? ''} ${day.slice(0, 4)}`
}

export interface OrderValues {
  plan: string
  start: string
  director: string
  directorName: string
  agree: boolean
}

export type OrderErrors = Partial<Record<'plan' | 'start' | 'director' | 'directorName' | 'agree' | 'form', string>>

const Error: FC<{ id: string; text?: string }> = ({ id, text }) =>
  text ? (
    <p class="field__error" id={id}>
      {text}
    </p>
  ) : null

const CompanyCard: FC<{ order: Order }> = ({ order }) => (
  <div class="company">
    <p class="company__label">{copy.start.company}</p>
    <p class="company__name">{order.company}</p>
    <p class="company__meta">
      {order.address ? `${order.address}, ` : ''}IČO {formatIco(order.ico)}
    </p>
    {order.registerLine ? <p class="company__meta">{typeset(order.registerLine)}</p> : null}
  </div>
)

/** The main points: what the client binds the company to, in one look. */
const Summary: FC<{ order: Order; months: string[] }> = ({ order, months }) => (
  <div class="summary">
    <h2 class="summary__title">{o.summary}</h2>
    <table class="summary__table">
      <tbody>
        <tr>
          <th scope="row">{o.rows.company}</th>
          <td>{order.company}</td>
        </tr>
        {PLANS.map((plan) => (
          <tr class={`summary__plan summary__plan--${plan.id}`}>
            <th scope="row">{o.rows.price}</th>
            <td>
              <strong>{formatEur(plan.price * 100)}</strong> {o.noVat}, {o.rows.plan.toLowerCase()} {plan.name}, {typeset(`do ${plan.docs} dokladov mesačne`)}
            </td>
          </tr>
        ))}
        <tr>
          <th scope="row">{o.rows.payroll}</th>
          <td>{typeset(`${formatEur(PAYROLL_PRICE * 100)} ${o.noVat} mesačne za človeka`)}</td>
        </tr>
        <tr>
          <th scope="row">{o.rows.closing}</th>
          <td>
            {formatEur(CLOSING_PRICE * 100)} {o.noVat}, {o.yearly}
          </td>
        </tr>
        {months.map((day, i) => (
          <tr class={`summary__start summary__start--${i}`}>
            <th scope="row">{o.rows.start}</th>
            <td>{typeset(longDate(day))}</td>
          </tr>
        ))}
        <tr>
          <th scope="row">{o.rows.invoices}</th>
          <td>{o.invoicesValue}</td>
        </tr>
        <tr>
          <th scope="row">{o.rows.notice}</th>
          <td>{o.noticeValue}</td>
        </tr>
        <tr>
          <th scope="row">{o.rows.docs}</th>
          <td>{o.docsValue}</td>
        </tr>
        <tr>
          <th scope="row">{o.rows.answers}</th>
          <td>{o.answersValue}</td>
        </tr>
      </tbody>
    </table>
  </div>
)

/**
 * An order that cannot be signed yet shows where it stands and no form: we are still looking at it (or the terms
 * wait for their release), it needs a scope of its own, something is missing, or its seven days have passed and a
 * new link can be asked for with one click.
 */
const OrderWaiting: FC<{ order: Order; token: string; gate: ContractGate; stale: boolean }> = ({ order, token, gate, stale }) => {
  const [title, lead] = stale
    ? [o.staleTitle, o.staleLead]
    : gate.reason === 'bespoke'
      ? [o.bespokeTitle, o.bespokeLead]
      : gate.reason === 'hold'
        ? [o.holdTitle, o.holdLead]
        : [o.waitTitle, o.waitLead]
  return (
    <Page>
      <h1 class="h1">{title}</h1>
      <p class="lead">{lead}</p>
      <CompanyCard order={order} />
      {stale ? (
        <form class="page__more" method="post" action={`/objednavka/${token}/novy`}>
          <button class="btn btn--blue" type="submit">
            {o.staleButton}
          </button>
        </form>
      ) : null}
    </Page>
  )
}

export const OrderAsked: FC = () => (
  <Page>
    <h1 class="h1">{o.askedTitle}</h1>
    <p class="lead">{o.askedLead}</p>
  </Page>
)

export const OrderPage: FC<{ order: Order; token: string; months: string[]; values: OrderValues; errors: OrderErrors; gate: ContractGate; stale?: boolean; signed?: { plan: string; startOn: string; terms: string } | null }> = ({
  order,
  token,
  months,
  values,
  errors,
  gate,
  stale = false,
  signed = null,
}) => {
  const directors = order.directors ?? []
  if (!gate.ready) return <OrderWaiting order={order} token={token} gate={gate} stale={stale} />
  const acting = order.acting ? (
    <p class="small">
      <strong>{o.acting}:</strong> {order.acting}
    </p>
  ) : null
  if (!oneMayConclude(order.legalForm ?? 'sro', order.directors, order.acting))
    return (
      <Page>
        <div class="order">
          <h1 class="h1">{o.jointTitle}</h1>
          <p class="lead">{o.jointLead}</p>
          <CompanyCard order={order} />
          {acting}
          <Summary order={order} months={months} />
        </div>
      </Page>
    )
  return (
    <Page>
      <form class="order" method="post" action={`/objednavka/${token}`} novalidate>
        <h1 class="h1">{o.title}</h1>
        <p class="lead">{o.lead}</p>
        <input type="hidden" name="proposal" value={gate.offerHash} />
        <CompanyCard order={order} />
        {acting}
        <Summary order={order} months={months} />
        {errors.form ? (
          <p class="notice notice--error" role="alert">
            {errors.form}
          </p>
        ) : null}
        <div class="details">
          {signed ? <p class="small" data-signed-offer>{typeset(`Zmluvu uzavriete v znení, ktoré osoba konajúca za firmu prijala v podpísanom vyhlásení: balík ${planName(signed.plan)}, prvý mesiac ${monthLabel(signed.startOn)}, obchodné podmienky vo verzii ${signed.terms}.`)}</p> : null}
          <fieldset class="field choice" aria-describedby={errors.plan ? 'o-plan-error' : undefined}>
            <legend class="field__label">{o.plan}</legend>
            <div class="choice__options">
              {PLANS.map((plan) => (
                <label class="choice__option">
                  <input type="radio" name="plan" id={`plan-${plan.id}`} value={plan.id} checked={values.plan === plan.id} disabled={gate.approval?.review.plan !== plan.id} />
                  <span>
                    {plan.name} <span class="choice__hint">{formatEur(plan.price * 100)}</span>
                  </span>
                </label>
              ))}
            </div>
            <Error id="o-plan-error" text={errors.plan} />
          </fieldset>
          <fieldset class="field choice" aria-describedby={errors.start ? 'o-start-error' : 'o-start-hint'}>
            <legend class="field__label">{o.start}</legend>
            <div class="choice__options">
              {months.map((day, i) => (
                <label class="choice__option">
                  <input type="radio" name="start" id={`start-${i}`} value={day} checked={values.start === day} disabled={signed ? signed.startOn !== day : undefined} />
                  <span>{monthLabel(day)}</span>
                </label>
              ))}
            </div>
            <p class="small" id="o-start-hint">
              {o.startHint}
            </p>
            <Error id="o-start-error" text={errors.start} />
          </fieldset>
          {directors.length > 0 ? (
            <fieldset class="field choice" aria-describedby={errors.director ? 'o-director-error' : 'o-director-hint'}>
              <legend class="field__label">{o.director}</legend>
              <div class="choice__options choice__options--list">
                {directors.map((d) => (
                  <label class="choice__option">
                    <input type="radio" name="director" value={d.name} checked={values.director === d.name} />
                    <span>
                      {d.name} <span class="choice__hint">{d.role}</span>
                    </span>
                  </label>
                ))}
              </div>
              <p class="small" id="o-director-hint">
                {o.directorHint}
              </p>
              <Error id="o-director-error" text={errors.director} />
            </fieldset>
          ) : (
            <div class="field">
              <label class="field__label" for="o-director-name">
                {o.directorName}
              </label>
              <input
                class="field__input"
                id="o-director-name"
                name="directorName"
                type="text"
                value={values.directorName}
                autocomplete="name"
                aria-invalid={errors.directorName ? 'true' : undefined}
                aria-describedby={errors.directorName ? 'o-director-name-error' : 'o-director-name-hint'}
              />
              <p class="small" id="o-director-name-hint">
                {o.directorNameHint}
              </p>
              <Error id="o-director-name-error" text={errors.directorName} />
            </div>
          )}
          <div class="field">
            <label class="agree">
              <input type="checkbox" name="agree" value="1" checked={values.agree} aria-invalid={errors.agree ? 'true' : undefined} aria-describedby={errors.agree ? 'o-agree-error' : undefined} />
              <span>{o.agree}</span>
            </label>
            <p class="small">
              <a class="link" href="/podmienky" target="_blank" rel="noopener">
                {o.termsRead}: {o.termsLink}
              </a>
            </p>
            <Error id="o-agree-error" text={errors.agree} />
          </div>
          <button class="btn btn--blue btn--large details__submit" type="submit">
            {o.submit}
          </button>
          <p class="small">{o.fine}</p>
        </div>
      </form>
    </Page>
  )
}

/** An order that was accepted: what was agreed, and the way into the app. */
export const OrderDone: FC<{ order: Order; contract: ResolvedContract | null }> = ({ order, contract }) => {
  const plan = contract?.snapshot?.plan
  return (
    <Page>
      <h1 class="h1">{o.doneTitle}</h1>
      <p class="lead">{o.doneLead}</p>
      <CompanyCard order={order} />
      <div class="summary">
        <table class="summary__table">
          <tbody>
            {order.priceCents !== null ? (
              <tr>
                <th scope="row">{o.rows.plan}</th>
                <td>
                  {plan?.name ?? order.plan}, {formatEur(order.priceCents)} {o.noVat}
                </td>
              </tr>
            ) : null}
            {order.startOn ? (
              <tr>
                <th scope="row">{o.rows.start}</th>
                <td>{typeset(longDate(order.startOn))}</td>
              </tr>
            ) : null}
            {order.signedBy ? (
              <tr>
                <th scope="row">{o.doneSigned}</th>
                <td>{order.signedBy}</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <p class="page__more">
        <a class="btn btn--blue" href="/app/prihlasenie">
          {o.signIn}
        </a>
      </p>
    </Page>
  )
}

/** A link that no longer works, or a company that is already a client. */
export const OrderGone: FC<{ kind: 'expired' | 'client'; again?: string }> = ({ kind, again = '/zacat' }) => (
  <Page>
    <h1 class="h1">{kind === 'client' ? o.clientTitle : o.expiredTitle}</h1>
    <p class="lead">{kind === 'client' ? o.clientLead : o.expiredLead}</p>
    <p class="page__more">
      {kind === 'client' ? (
        <a class="btn btn--blue" href="/app/prihlasenie">
          {o.signIn}
        </a>
      ) : (
        <a class="btn btn--blue" href={again}>
          {o.expiredAgain}
        </a>
      )}
    </p>
  </Page>
)

/** The terms in full, numbered as the contract refers to them ("bod 3.1"). */
export const TermsPage: FC<{ released?: boolean }> = ({ released = false }) => (
  <Page wide>
    <article class="legal terms">
      <h1 class="h1">{typeset(TERMS_TITLE)}</h1>
      <p class="lead">{typeset(TERMS_SUBTITLE)}</p>
      {!released ? <p class="notice">Návrh pred spustením služby. Toto znenie čaká na právne a poistné schválenie a nemení už uzavreté zmluvy.</p> : null}
      {TERMS.map((section, i) => (
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
        {copy.terms.contact} <a href={`mailto:${BRAND.email}`}>{BRAND.email}</a>.
      </p>
    </article>
  </Page>
)
