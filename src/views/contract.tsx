// The contract inside the app (his word of 13 October 2026: nothing by email): what was agreed when the director
// concluded it, and the terms in full, numbered as the contract refers to them. It replaces the confirmation that
// used to go out by email with the terms in it: the client reads it, saves it as a PDF or prints it, here.
import type { FC } from 'hono/jsx'
import { CLOSING_PRICE, PAYROLL_PRICE, TERMS_VERSION, planById } from '../config'
import { TERMS, TERMS_SUBTITLE, TERMS_TITLE } from '../content/terms'
import { formatEur, typeset } from '../format'
import { app, dayName, whenName } from '../app/copy'
import type { Company } from '../app/store'
import { Heading } from './inside'

const p = app.contractPage

/** What the order of an online contract kept: the plan and its price on that day, who concluded it and when. */
export interface ContractOrder {
  plan: string
  priceCents: number | null
  acceptedAt: number | null
  signedBy: string | null
  startOn: string | null
  termsVersion: string | null
}

export const ContractPage: FC<{ company: Company; order: ContractOrder | null }> = ({ company, order }) => {
  const plan = planById(order?.plan ?? company.plan)
  const accepted = order?.termsVersion ?? company.termsVersion
  const signedAt = order?.acceptedAt ?? company.contractAt
  const signedBy = order?.signedBy ?? company.signedBy
  const startOn = order?.startOn ?? company.startOn
  return (
    <>
      <a class="back" href="/app/firma#zmluva">
        {app.company.title}
      </a>
      <header class="phead">
        <Heading first={p.title} second={p.serif} />
        <p class="phead__lead">{p.lead}</p>
      </header>
      <div class="invoice">
        <div class="invoice__paper">
          <article class="sheet deed contract" aria-label={TERMS_TITLE}>
            <h2 class="deed__title">{typeset(TERMS_TITLE)}</h2>
            <p class="contract__sub">{typeset(TERMS_SUBTITLE)}</p>
            <section class="contract__points" aria-labelledby="body-t">
              <h3 id="body-t" class="contract__heading">
                {p.points}
              </h3>
              <dl class="kv">
                <div>
                  <dt>{p.company}</dt>
                  <dd class="kv__long">{company.name}</dd>
                </div>
                {plan ? (
                  <div>
                    <dt>{p.plan}</dt>
                    <dd class="kv__long">
                      {plan.name}, {p.price(formatEur(order?.priceCents ?? plan.price * 100), plan.docs)}
                    </dd>
                  </div>
                ) : null}
                <div>
                  <dt>{p.payroll}</dt>
                  <dd class="kv__long">{p.payrollValue(formatEur(PAYROLL_PRICE * 100))}</dd>
                </div>
                <div>
                  <dt>{p.closing}</dt>
                  <dd class="kv__long">{p.closingValue(formatEur(CLOSING_PRICE * 100))}</dd>
                </div>
                {startOn ? (
                  <div>
                    <dt>{p.start}</dt>
                    <dd>{dayName(startOn)}</dd>
                  </div>
                ) : null}
                <div>
                  <dt>{p.concluded}</dt>
                  <dd class="kv__long">{signedAt && signedBy ? p.concludedValue(whenName(signedAt, '1900-01-01'), signedBy) : p.offline}</dd>
                </div>
                <div>
                  <dt>{p.notice}</dt>
                  <dd class="kv__long">{p.noticeValue}</dd>
                </div>
                {company.endsOn ? (
                  <div>
                    <dt>{p.ends}</dt>
                    <dd>{dayName(company.endsOn)}</dd>
                  </div>
                ) : null}
              </dl>
            </section>
            {TERMS.map((section, i) => (
              <section class="contract__section" id={`clanok-${i + 1}`}>
                <h3 class="contract__heading">
                  {i + 1}. {section.title}
                </h3>
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
          </article>
        </div>
        <aside class="invoice__side">
          <section class="info" aria-label={p.print}>
            <button class="btn btn--blue invoice__wide" type="button" data-print hidden>
              {p.print}
            </button>
            {accepted && accepted !== TERMS_VERSION ? <p class="info__lead">{p.other(dayName(accepted), dayName(TERMS_VERSION))}</p> : null}
            <p class="info__source">
              {p.question}{' '}
              <a class="link" href="/app/spravy">
                {app.home.write}
              </a>
            </p>
          </section>
        </aside>
      </div>
    </>
  )
}
