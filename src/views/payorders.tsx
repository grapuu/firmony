// "Na úhradu": the suppliers' invoices the company owes, and the payment order for its bank (src/app/payorders.ts).
import type { FC } from 'hono/jsx'
import { formatEur, formatEurExact, formatMoney } from '../format'
import { app, dayName } from '../app/copy'
import type { Payable, PaymentOrder } from '../app/payorders'
import { Flash, Heading } from './inside'
import { groupIban } from './inside-pages'

const t = app.payorders

export const PayOrdersPage: FC<{
  payables: Payable[]
  orders: PaymentOrder[]
  accounts: { id: string; iban: string }[]
  today: string
  day: string
  account: string | null
  picked: Set<string> | null
  error?: string | null
  ready?: PaymentOrder | null
  flash?: string | null
}> = ({ payables, orders, accounts, today, day, account, picked, error = null, ready = null, flash = null }) => {
  const payable = payables.filter((p) => !p.blocked)
  const blocked = payables.filter((p) => p.blocked)
  const owed = payables.filter((p) => p.currency === 'EUR').reduce((sum, p) => sum + p.totalCents, 0)
  const overdue = payables.filter((p) => p.currency === 'EUR' && p.dueOn && p.dueOn < today).reduce((sum, p) => sum + p.totalCents, 0)
  // Ticked by default: what is not in an order yet.
  const ticked = (p: Payable) => (picked ? picked.has(p.id) : !p.orderId)
  return (
    <>
      <header class="phead">
        <Heading first={t.title} second={t.serif} />
        <p class="phead__lead">{t.lead}</p>
      </header>
      {ready ? (
        <div class="payorder__ready">
          <Flash text={t.ready} />
          <a class="btn btn--blue btn--small" href={`/app/uhrady/${ready.id}/xml`}>
            {t.download}
          </a>
        </div>
      ) : null}
      <Flash text={flash} />
      <Flash text={error} tone="error" />
      {payables.length === 0 ? (
        <p class="over__empty">{t.empty}</p>
      ) : (
        <>
          <dl class="figs__grid">
            <div class="fig">
              <dt>{t.owed}</dt>
              <dd class="fig__value">{formatEur(owed)}</dd>
            </div>
            <div class="fig">
              <dt>{t.overdue}</dt>
              <dd class={`fig__value${overdue > 0 ? ' fig__value--due' : ''}`}>{formatEur(overdue)}</dd>
            </div>
          </dl>
          {payable.length > 0 ? (
            <form class="info payorder" method="post" action="/app/uhrady">
              {accounts.length === 0 ? (
                <p class="flag">{t.noAccount}</p>
              ) : (
                <div class="fgrid">
                  <div class="fgrid__cell">
                    <label class="field__label" for="po-ucet">
                      {t.account}
                    </label>
                    <select id="po-ucet" class="field__input" name="ucet">
                      {accounts.map((a) => (
                        <option value={a.id} selected={account === a.id}>
                          {groupIban(a.iban)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div class="fgrid__cell">
                    <label class="field__label" for="po-den">
                      {t.day}
                    </label>
                    <input id="po-den" class="field__input" name="den" value={day} maxlength={16} />
                  </div>
                </div>
              )}
              <fieldset class="payorder__list">
                <legend class="field__label">{t.pick}</legend>
                <ul class="plain">
                  {payable.map((p) => (
                    <li class="payorder__item">
                      <label class="tickbox">
                        <input type="checkbox" name="doklad" value={p.id} checked={ticked(p)} />
                        <span class="payorder__text">
                          <a class="link" href={`/app/doklady/${p.id}`}>
                            {p.party ?? app.documents.unknown}
                          </a>{' '}
                          {p.number ?? ''}
                          <span class={`payorder__due${p.dueOn && p.dueOn < today ? ' payorder__due--late' : ''}`}>
                            {p.dueOn ? (p.dueOn < today ? t.overdueOn(dayName(p.dueOn, today)) : t.due(dayName(p.dueOn, today))) : ''}
                            {p.orderedOn ? ` · ${t.ordered(dayName(p.orderedOn, today))}` : ''}
                          </span>
                        </span>
                        <strong class="payorder__amount">{formatEurExact(p.totalCents)}</strong>
                      </label>
                    </li>
                  ))}
                </ul>
              </fieldset>
              {accounts.length > 0 ? (
                <button class="btn btn--blue" type="submit">
                  {t.submit}
                </button>
              ) : null}
            </form>
          ) : null}
          {blocked.length > 0 ? (
            <section class="info" aria-labelledby="po-rucne">
              <h2 id="po-rucne" class="info__title">
                {t.blockedTitle}
              </h2>
              <ul class="plain">
                {blocked.map((p) => (
                  <li>
                    <a class="link" href={`/app/doklady/${p.id}`}>
                      {p.party ?? app.documents.unknown}
                    </a>{' '}
                    {p.number ?? ''}, {formatMoney(p.totalCents, p.currency)}: {t.blocked[p.blocked ?? 'iban']}
                    {p.blocked === 'iban' ? (
                      <form class="payorder__iban" method="post" action="/app/uhrady/iban">
                        <input type="hidden" name="doklad" value={p.id} />
                        <input class="field__input" name="iban" aria-label={t.iban} placeholder={t.iban} maxlength={42} autocomplete="off" />
                        <button class="btn btn--line btn--small" type="submit">
                          {t.ibanAdd}
                        </button>
                      </form>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}
      {orders.length > 0 ? (
        <section class="info" aria-labelledby="po-prikazy">
          <h2 id="po-prikazy" class="info__title">
            {t.orders}
          </h2>
          <ul class="plain">
            {orders.map((o) => (
              <li>
                {t.orderRow(dayName(o.executeOn, today), o.count, formatEurExact(o.totalCents))}{' '}
                <a class="link" href={`/app/uhrady/${o.id}/xml`}>
                  {t.download}
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  )
}
