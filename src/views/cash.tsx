// The cash box (src/app/cash.ts): the cash book of a year with its balance day by day, and the form of a cash document.
import type { FC } from 'hono/jsx'
import { formatEurExact } from '../format'
import { app, dayName } from '../app/copy'
import { CASH_KIND_IDS, CASH_KINDS, type CashErrors, type CashValues } from '../app/cash'
import { Flash, Heading } from './inside'

const t = app.cash

export interface CashRow {
  key: string
  on: string
  number: string
  text: string
  /** Plus into the cash box, minus out of it. */
  cents: number
  balance: number
  /** A cash document that may be taken back: its id. */
  removable: string | null
}

export const CashPage: FC<{
  year: number
  years: number[]
  opening: number
  rows: CashRow[]
  balance: number
  pending: { id: string; on: string; party: string | null; cents: number }[]
  flash?: string | null
  error?: string | null
  closed?: boolean
}> = ({ year, years, opening, rows, balance, pending, flash = null, error = null, closed = false }) => {
  const yearIn = rows.filter((r) => r.cents > 0).reduce((s, r) => s + r.cents, 0)
  const yearOut = rows.filter((r) => r.cents < 0).reduce((s, r) => s - r.cents, 0)
  const minus = balance < 0 || rows.some((r) => r.balance < 0)
  return (
    <>
      <header class="phead phead--row">
        <div>
          <Heading first={t.title} second={t.serif} />
          <p class="phead__lead">{t.lead}</p>
        </div>
      </header>
      <Flash text={flash} />
      <Flash text={error} tone="error" />
      {minus ? <Flash text={t.minus} tone="warn" /> : null}
      <dl class="figs__grid">
        <div class="fig">
          <dt>{t.balance}</dt>
          <dd class={`fig__value${balance < 0 ? ' fig__value--due' : ''}`}>{formatEurExact(balance)}</dd>
        </div>
        <div class="fig">
          <dt>{t.yearIn(year)}</dt>
          <dd class="fig__value">{formatEurExact(yearIn)}</dd>
        </div>
        <div class="fig">
          <dt>{t.yearOut(year)}</dt>
          <dd class="fig__value">{formatEurExact(yearOut)}</dd>
        </div>
      </dl>
      {closed ? null : (
        <p class="cash__add">
          <a class="btn btn--blue" href="/app/pokladna/nova?strana=prijem">
            {t.addIn}
          </a>
          <a class="btn btn--line" href="/app/pokladna/nova?strana=vydaj">
            {t.addOut}
          </a>
        </p>
      )}
      <section class="info" aria-labelledby="pokladna-t">
        <header class="lhead">
          <h2 id="pokladna-t" class="info__title">
            {t.year} {year}
          </h2>
          {years.length > 1 ? (
            <form class="cash__years" method="get" action="/app/pokladna">
              <label class="field__label" for="pokladna-rok">
                {t.year}
              </label>
              <select id="pokladna-rok" class="field__input" name="rok">
                {years.map((y) => (
                  <option value={String(y)} selected={y === year}>
                    {y}
                  </option>
                ))}
              </select>
              <button class="btn btn--line btn--small" type="submit">
                {t.show}
              </button>
            </form>
          ) : null}
        </header>
        <p class="info__source">
          {t.opening(dayName(`${year}-01-01`))}: <strong>{formatEurExact(opening)}</strong>
        </p>
        {rows.length === 0 ? (
          <p class="info__empty">{t.empty}</p>
        ) : (
          <div class="lscroll">
            <table class="ltable cash__table">
              <thead>
                <tr>
                  <th scope="col">{t.cols.day}</th>
                  <th scope="col">{t.cols.number}</th>
                  <th scope="col">{t.cols.text}</th>
                  <th scope="col" class="num">
                    {t.cols.in}
                  </th>
                  <th scope="col" class="num">
                    {t.cols.out}
                  </th>
                  <th scope="col" class="num">
                    {t.cols.balance}
                  </th>
                  <th scope="col">
                    <span class="sr">{t.remove}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr>
                    <td>{dayName(r.on)}</td>
                    <td>{r.number}</td>
                    <td class="cash__text">{r.text}</td>
                    <td class="num">{r.cents > 0 ? formatEurExact(r.cents) : ''}</td>
                    <td class="num">{r.cents < 0 ? formatEurExact(-r.cents) : ''}</td>
                    <td class={`num${r.balance < 0 ? ' cash__minus' : ''}`}>{formatEurExact(r.balance)}</td>
                    <td>
                      {r.removable && !closed ? (
                        <form method="post" action={`/app/pokladna/${r.removable}/zrusit`}>
                          <button class="btn btn--line btn--small" type="submit" aria-label={`${t.remove} ${r.number}`}>
                            {t.remove}
                          </button>
                        </form>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {pending.length > 0 ? (
        <section class="info" aria-labelledby="pokladna-cakaju">
          <h2 id="pokladna-cakaju" class="info__title">
            {t.pending}
          </h2>
          <p class="info__lead">{t.pendingLead}</p>
          <ul class="plain">
            {pending.map((p) => (
              <li class="trips__item">
                <a class="link" href={`/app/doklady/${p.id}`}>
                  {p.party ?? app.documents.unknown}
                </a>
                <span>{dayName(p.on)}</span>
                <strong class="trips__amount">{formatEurExact(p.cents)}</strong>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  )
}

export const CashFormPage: FC<{
  side: 'in' | 'out'
  values: CashValues
  errors: CashErrors
  documents: { id: string; party: string | null; number: string | null; cents: number }[]
  payments: { id: string; on: string; cents: number; party: string | null; note: string | null }[]
  error?: string | null
}> = ({ side, values, errors, documents, payments, error = null }) => {
  const kinds = CASH_KIND_IDS.filter((k) => CASH_KINDS[k].side === side)
  const docKind = side === 'in' ? 'doc_in' : 'doc_out'
  const ownKind = side === 'in' ? 'withdrawal' : 'deposit'
  return (
    <>
      <a class="back" href="/app/pokladna">
        {t.back}
      </a>
      <header class="phead">
        <Heading first={side === 'in' ? t.newIn : t.newOut} small />
        <p class="phead__lead">{t.newLead}</p>
      </header>
      <Flash text={error ?? errors.limit ?? null} tone="error" />
      <form class="invform cashform" method="post" action="/app/pokladna" novalidate>
        <input type="hidden" name="strana" value={side === 'in' ? 'prijem' : 'vydaj'} />
        <section class="info" aria-labelledby="doklad-t">
          <h2 id="doklad-t" class="info__title">
            {side === 'in' ? t.newIn : t.newOut}
          </h2>
          <div class="fgrid">
            <div class="fgrid__cell fgrid__cell--wide">
              <label class="field__label" for="c-druh">
                {t.kind}
              </label>
              <select id="c-druh" class="field__input" name="druh" aria-invalid={errors.kind ? 'true' : undefined}>
                {kinds.map((k) => (
                  <option value={k} selected={values.kind === k}>
                    {t.kinds[k]}
                  </option>
                ))}
              </select>
              {errors.kind ? <p class="field__error">{errors.kind}</p> : null}
            </div>
            <div class="fgrid__cell">
              <label class="field__label" for="c-den">
                {t.day}
              </label>
              <input id="c-den" class="field__input" name="den" value={values.day} maxlength={20} aria-invalid={errors.day ? 'true' : undefined} />
              {errors.day ? <p class="field__error">{errors.day}</p> : null}
            </div>
            <div class="fgrid__cell">
              <label class="field__label" for="c-suma">
                {t.amount}
              </label>
              <input id="c-suma" class="field__input" name="suma" value={values.amount} inputmode="decimal" maxlength={20} aria-invalid={errors.amount ? 'true' : undefined} />
              {errors.amount ? <p class="field__error">{errors.amount}</p> : <p class="field__hint">{t.amountDocHint}</p>}
            </div>
            <div class="fgrid__cell fgrid__cell--wide cash__party">
              <label class="field__label" for="c-kto">
                {t.party}
              </label>
              <input id="c-kto" class="field__input" name="kto" value={values.party} maxlength={120} aria-invalid={errors.party ? 'true' : undefined} />
              {errors.party ? <p class="field__error">{errors.party}</p> : <p class="field__hint">{t.partyHint}</p>}
            </div>
            <div class={`fgrid__cell fgrid__cell--wide cash__doc cash__doc--${docKind}`}>
              <label class="field__label" for="c-doklad">
                {t.document}
              </label>
              {documents.length === 0 ? (
                <p class="field__hint">{t.documentNone}</p>
              ) : (
                <select id="c-doklad" class="field__input" name="doklad" aria-invalid={errors.document ? 'true' : undefined}>
                  <option value="">{t.documentPick}</option>
                  {documents.map((d) => (
                    <option value={d.id} selected={values.document === d.id}>
                      {[d.party ?? app.documents.unknown, d.number ?? '', formatEurExact(d.cents)].filter(Boolean).join(', ')}
                    </option>
                  ))}
                </select>
              )}
              {errors.document ? <p class="field__error">{errors.document}</p> : null}
            </div>
            <div class={`fgrid__cell fgrid__cell--wide cash__bank cash__bank--${ownKind}`}>
              <label class="field__label" for="c-platba">
                {t.payment}
              </label>
              <select id="c-platba" class="field__input" name="platba">
                <option value="">{t.paymentNone}</option>
                {payments.map((p) => (
                  <option value={p.id} selected={values.payment === p.id}>
                    {[dayName(p.on), formatEurExact(Math.abs(p.cents)), p.party ?? p.note ?? ''].filter(Boolean).join(', ')}
                  </option>
                ))}
              </select>
              <p class="field__hint">{t.paymentHint}</p>
            </div>
            <div class="fgrid__cell fgrid__cell--wide">
              <label class="field__label" for="c-poznamka">
                {t.note}
              </label>
              <input id="c-poznamka" class="field__input" name="poznamka" value={values.note} maxlength={300} />
            </div>
          </div>
        </section>
        <div class="invform__actions">
          <button class="btn btn--blue" type="submit">
            {t.save}
          </button>
        </div>
      </form>
    </>
  )
}
