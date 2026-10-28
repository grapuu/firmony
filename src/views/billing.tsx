// Fakturácia: Firmony's own invoices to its clients, for the administrator. What each client is billed this month is
// worked out from the app (team/billing.ts) and shown before anything is issued; the invoices issued and what became
// of each (paid by europio's bank, due, past due) follow. europio s. r. o. is set up once, as the company that issues.
import type { FC } from 'hono/jsx'
import { OPERATOR } from '../config'
import { formatEurExact } from '../format'
import { app, dayName, monthName } from '../app/copy'
import type { Company } from '../app/store'
import type { BillRow, ClientBill } from '../team/billing-store'
import { creditOf, issuable } from '../team/billing-store'
import { team as t } from '../team/copy'
import { Flash, Heading, planName } from './inside'
import { groupIban } from './inside-pages'

const b = t.billing

export interface BillingPageProps {
  operator: Company | null
  month: string
  today: string
  bills: ClientBill[]
  rows: BillRow[]
  months: string[]
  flash?: string | null
  error?: string | null
}

const StatePill: FC<{ row: BillRow; today: string }> = ({ row, today }) => (
  <span class={`pill ${row.state === 'paid' ? 'pill--ok' : row.state === 'overdue' ? 'pill--red' : 'pill--grey'}`}>
    {row.state === 'paid' ? b.state.paid : row.state === 'overdue' ? b.state.overdue(dayName(row.dueOn, today)) : b.state.unpaid(dayName(row.dueOn, today))}
  </span>
)

export const BillingPage: FC<BillingPageProps> = (p) => {
  const ready = p.bills.filter(issuable)
  const clean = ready.filter((bill) => bill.draft.flags.length === 0)
  const open = p.rows.filter((r) => r.state !== 'paid')
  const overdue = p.rows.filter((r) => r.state === 'overdue')
  const sum = (rows: BillRow[]) => rows.reduce((total, r) => total + r.totalCents, 0)
  return (
    <>
      <header class="phead">
        <Heading first={b.title} second={b.serif} />
        <p class="phead__lead">{b.lead}</p>
      </header>
      <Flash text={p.flash} />
      <Flash text={p.error} tone="error" />
      {!p.operator ? (
        <section class="info info--form" aria-labelledby="vystavovatel-t">
          <h2 id="vystavovatel-t" class="info__title">
            {b.setup.title}
          </h2>
          <p class="info__lead">{b.setup.lead}</p>
          <dl class="kv">
            <div>
              <dt>{b.setup.company}</dt>
              <dd>
                {OPERATOR.name}, {OPERATOR.street}, {OPERATOR.postalCity}
              </dd>
            </div>
            <div>
              <dt>{b.setup.ids}</dt>
              <dd>
                IČO {OPERATOR.companyId}, DIČ {OPERATOR.taxId}
              </dd>
            </div>
          </dl>
          <form class="stack" method="post" action="/ucto/fakturacia/europio" novalidate>
            <label class="field">
              <span class="field__label">{b.setup.iban}</span>
              <input class="field__input" name="iban" inputmode="text" autocomplete="off" placeholder="SK00 0000 0000 0000 0000 0000" required />
              <span class="field__hint">{b.setup.ibanHint}</span>
            </label>
            <label class="field">
              <span class="field__label">{b.setup.start}</span>
              <select class="field__input" name="start">
                {p.months.map((m) => (
                  <option value={m}>{monthName(m)}</option>
                ))}
              </select>
              <span class="field__hint">{b.setup.startHint}</span>
            </label>
            <div>
              <button class="btn btn--blue" type="submit">
                {b.setup.submit}
              </button>
            </div>
          </form>
        </section>
      ) : (
        <div class="billing">
          <dl class="figs__grid figs__grid--four">
            <div class="fig">
              <dt>{b.figures.ready(monthName(p.month))}</dt>
              <dd class="fig__value">{ready.length}</dd>
            </div>
            <div class="fig">
              <dt>{b.figures.toIssue}</dt>
              <dd class="fig__value">{formatEurExact(ready.reduce((total, bill) => total + bill.draft.totalCents - creditOf(bill), 0))}</dd>
            </div>
            <div class="fig">
              <dt>{b.figures.unpaid}</dt>
              <dd class="fig__value">{formatEurExact(sum(open))}</dd>
            </div>
            <div class="fig">
              <dt>{b.figures.overdue}</dt>
              <dd class="fig__value">{formatEurExact(sum(overdue))}</dd>
            </div>
          </dl>
          <section class="info" id="na-vystavenie" aria-labelledby="na-vystavenie-t">
            <h2 id="na-vystavenie-t" class="info__title">
              {b.drafts.title(monthName(p.month))}
            </h2>
            <p class="info__lead">{b.drafts.lead(groupIban(p.operator.invoiceIban ?? ''))}</p>
            {ready.length === 0 && p.bills.every((bill) => !bill.corrupt && !bill.draft.flags.includes('plan')) ? (
              <p class="info__empty">{b.drafts.none}</p>
            ) : (
              <ul class="plain">
                {p.bills
                  .filter((bill) => bill.draft.lines.length > 0 || bill.corrupt || bill.draft.flags.includes('plan'))
                  .map((bill) => (
                    <li class="check" id={`klient-${bill.company.id}`}>
                      <div class="check__text">
                        <span class="check__title">
                          <a class="link" href={`/ucto/klienti/${bill.company.id}`}>
                            {bill.company.name}
                          </a>
                          <span class="check__amount">{formatEurExact(bill.draft.totalCents - creditOf(bill))}</span>
                        </span>
                        <span class="check__sub">
                          <span>{t.clients.plan(planName(bill.company.plan))}</span>
                          <span>{b.drafts.docs(bill.docsLastMonth)}</span>
                        </span>
                        <ul class="plain bill__lines">
                          {bill.draft.lines.map((line) => (
                            <li>
                              <span>{line.description}</span>
                              <span>{line.quantityMilli === 1000 ? '' : `${line.quantityMilli / 1000} × ${formatEurExact(line.unitCents)}, `}{formatEurExact(line.cents)}</span>
                            </li>
                          ))}
                          {creditOf(bill) > 0 ? (
                            <li>
                              <span>Započítaná zábezpeka (zostáva {formatEurExact(bill.prepaidCents - creditOf(bill))})</span>
                              <span>{formatEurExact(-creditOf(bill))}</span>
                            </li>
                          ) : null}
                        </ul>
                        {bill.corrupt ? <span class="tbl__flag tbl__flag--report">{b.flags.corrupt}</span> : null}
                        {bill.draft.flags.map((flag) => (
                          <span class={`tbl__flag ${flag === 'plan' ? 'tbl__flag--report' : 'tbl__flag--ends'}`}>{b.flags[flag]}</span>
                        ))}
                      </div>
                      {issuable(bill) ? (
                        <form class="check__actions" method="post" action="/ucto/fakturacia/vystavit">
                          <input type="hidden" name="klient" value={bill.company.id} />
                          <button class="btn btn--line btn--small" type="submit">
                            {b.drafts.issueOne}
                          </button>
                        </form>
                      ) : null}
                    </li>
                  ))}
              </ul>
            )}
            {clean.length > 0 ? (
              <form class="info__acts" method="post" action="/ucto/fakturacia/vystavit">
                <input type="hidden" name="klient" value="vsetci" />
                <button class="btn btn--blue" type="submit">
                  {b.drafts.issueAll(clean.length)}
                </button>
              </form>
            ) : null}
            {ready.length > clean.length ? <p class="info__lead">{b.drafts.flaggedNote}</p> : null}
          </section>
          <section class="info" id="vystavene" aria-labelledby="vystavene-t">
            <h2 id="vystavene-t" class="info__title">
              {b.issued.title}
            </h2>
            <p class="info__lead">{b.issued.lead}</p>
            {p.rows.length === 0 ? (
              <p class="info__empty">{b.issued.none}</p>
            ) : (
              <ul class="plain">
                {[...overdue, ...p.rows.filter((r) => r.state !== 'overdue')].map((row) => (
                  <li class="check">
                    <div class="check__text">
                      <span class="check__title">
                        <a class="link" href={`/f/${row.token}`}>
                          {b.issued.number(row.number)}
                        </a>
                        <span class="check__amount">{formatEurExact(row.totalCents)}</span>
                      </span>
                      <span class="check__sub">
                        <a class="link" href={`/ucto/klienti/${row.clientId}`}>
                          {row.clientName}
                        </a>
                        <span>{b.issued.issuedOn(dayName(row.issuedOn, p.today))}</span>
                        {row.delivered ? null : <span class="tbl__flag tbl__flag--ends">{b.issued.notDelivered}</span>}
                      </span>
                    </div>
                    <div class="check__actions">
                      <StatePill row={row} today={p.today} />
                      {row.delivered ? null : (
                        <form method="post" action={`/ucto/fakturacia/${row.invoiceId}/dorucit`}>
                          <button class="btn btn--line btn--small" type="submit">
                            {b.issued.deliver}
                          </button>
                        </form>
                      )}
                      {row.state === 'overdue' ? (
                        <form method="post" action={`/ucto/fakturacia/${row.invoiceId}/pripomenut`}>
                          <button class="btn btn--line btn--small" type="submit">
                            {b.issued.remind}
                          </button>
                        </form>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </>
  )
}

/** The client's side: Firmony's invoices to the company, in Firma a nastavenia. */
export const ClientBills: FC<{ rows: BillRow[]; today: string }> = ({ rows, today }) =>
  rows.length === 0 ? null : (
    <section class="info" id="faktury-firmony" aria-labelledby="faktury-firmony-t">
      <h2 id="faktury-firmony-t" class="info__title">
        {app.bills.title}
      </h2>
      <p class="info__lead">{app.bills.lead}</p>
      <ul class="plain">
        {rows.map((row) => (
          <li class="check">
            <div class="check__text">
              <span class="check__title">
                {app.bills.number(row.number)}
                <span class="check__amount">{formatEurExact(row.totalCents)}</span>
              </span>
              <span class="check__sub">
                <span>{app.bills.issuedOn(dayName(row.issuedOn, today))}</span>
              </span>
            </div>
            <div class="check__actions">
              <span class={`pill ${row.state === 'paid' ? 'pill--ok' : row.state === 'overdue' ? 'pill--red' : 'pill--grey'}`}>
                {row.state === 'paid' ? app.bills.paid : row.state === 'overdue' ? app.bills.overdue(dayName(row.dueOn, today)) : app.bills.due(dayName(row.dueOn, today))}
              </span>
              <a class="btn btn--line btn--small" href={`/f/${row.token}`}>
                {row.state === 'paid' ? app.bills.open : app.bills.pay}
              </a>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
