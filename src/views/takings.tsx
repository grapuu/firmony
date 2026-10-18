// The day's takings of an eKasa till (src/app/takings.ts): the takings of a year, and the form of a day's closing.
import type { FC } from 'hono/jsx'
import { formatEurExact } from '../format'
import { app, dayName } from '../app/copy'
import type { CostCenter } from '../app/centers'
import { TAKINGS_RATES, type TakingsErrors, type TakingsValues } from '../app/takings'
import type { StoredTakings } from '../app/takings-store'
import { CenterSelect } from './centers'
import { Flash, Heading } from './inside'

const t = app.takings

export const TakingsPage: FC<{
  year: number
  years: number[]
  rows: StoredTakings[]
  payer: boolean
  values: TakingsValues
  errors?: TakingsErrors
  centers: CostCenter[]
  flash?: string | null
  error?: string | null
  closed?: boolean
}> = ({ year, years, rows, payer, values, errors = {}, centers, flash = null, error = null, closed = false }) => {
  const sum = rows.reduce((s, r) => ({ total: s.total + r.total, vat: s.vat + r.vat, cash: s.cash + r.cash }), { total: 0, vat: 0, cash: 0 })
  const rates = payer ? TAKINGS_RATES : ([0] as const)
  return (
    <>
      <a class="back" href="/app/pokladna">
        {app.cash.back}
      </a>
      <header class="phead">
        <Heading first={t.title} second={t.serif} />
        <p class="phead__lead">{payer ? t.lead : t.leadNoVat}</p>
      </header>
      <Flash text={flash} />
      <Flash text={error} tone="error" />
      {closed ? null : (
        <form class="invform takings__form" method="post" action="/app/trzby" novalidate>
          <section class="info" aria-labelledby="trzba-t">
            <h2 id="trzba-t" class="info__title">
              {t.add}
            </h2>
            <div class="fgrid">
              <div class="fgrid__cell">
                <label class="field__label" for="t-den">
                  {t.day}
                </label>
                <input id="t-den" class="field__input" name="den" value={values.day} maxlength={20} aria-invalid={errors.day ? 'true' : undefined} />
                {errors.day ? <p class="field__error">{errors.day}</p> : null}
              </div>
              <div class="fgrid__cell">
                <label class="field__label" for="t-cislo">
                  {t.number}
                </label>
                <input id="t-cislo" class="field__input" name="cislo" value={values.number} maxlength={40} />
                <p class="field__hint">{t.numberHint}</p>
              </div>
              {rates.map((rate) => (
                <>
                  <div class="fgrid__cell">
                    <label class="field__label" for={`t-trzba-${rate}`}>
                      {!payer ? t.grossNoVat : rate === 0 ? t.gross0 : t.gross(rate)}
                    </label>
                    <input
                      id={`t-trzba-${rate}`}
                      class="field__input"
                      name={`trzba_${rate}`}
                      value={values.gross[rate]}
                      inputmode="decimal"
                      maxlength={20}
                      aria-invalid={errors.amount ? 'true' : undefined}
                    />
                  </div>
                  {rate !== 0 ? (
                    <div class="fgrid__cell">
                      <label class="field__label" for={`t-dph-${rate}`}>
                        {t.vat(rate)}
                      </label>
                      <input
                        id={`t-dph-${rate}`}
                        class="field__input"
                        name={`dph_${rate}`}
                        value={values.vat[rate]}
                        inputmode="decimal"
                        maxlength={20}
                        aria-invalid={errors.vat ? 'true' : undefined}
                      />
                    </div>
                  ) : null}
                </>
              ))}
              <div class="fgrid__cell fgrid__cell--wide">
                {errors.amount ? <p class="field__error">{errors.amount}</p> : null}
                {errors.vat ? <p class="field__error">{errors.vat}</p> : payer ? <p class="field__hint">{t.vatHint}</p> : null}
              </div>
              <div class="fgrid__cell">
                <label class="field__label" for="t-karta">
                  {t.card}
                </label>
                <input id="t-karta" class="field__input" name="karta" value={values.card} inputmode="decimal" maxlength={20} aria-invalid={errors.card ? 'true' : undefined} />
                {errors.card ? <p class="field__error">{errors.card}</p> : <p class="field__hint">{t.cardHint}</p>}
              </div>
              <div class="fgrid__cell">
                <label class="field__label" for="t-druh">
                  {t.kind}
                </label>
                <select id="t-druh" class="field__input" name="druh">
                  {(['sales_goods', 'sales'] as const).map((k) => (
                    <option value={k} selected={values.category === k}>
                      {t.kinds[k]}
                    </option>
                  ))}
                </select>
              </div>
              {centers.some((c) => !c.archived) ? (
                <div class="fgrid__cell">
                  <label class="field__label" for="t-stredisko">
                    {t.center}
                  </label>
                  <CenterSelect centers={centers} value={values.center || null} id="t-stredisko" />
                  {errors.center ? <p class="field__error">{errors.center}</p> : null}
                </div>
              ) : null}
              <div class="fgrid__cell fgrid__cell--wide">
                <button class="btn btn--blue" type="submit">
                  {t.add}
                </button>
              </div>
            </div>
          </section>
        </form>
      )}
      <section class="info" aria-labelledby="trzby-t">
        <header class="lhead">
          <h2 id="trzby-t" class="info__title">
            {t.list} {year}
          </h2>
          {years.length > 1 ? (
            <form class="cash__years" method="get" action="/app/trzby">
              <label class="field__label" for="trzby-rok">
                {t.year}
              </label>
              <select id="trzby-rok" class="field__input" name="rok">
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
        {rows.length === 0 ? (
          <p class="info__empty">{t.empty}</p>
        ) : (
          <div class="lscroll">
            <table class="ltable takings__table">
              <thead>
                <tr>
                  <th scope="col">{t.cols.day}</th>
                  <th scope="col">{t.cols.number}</th>
                  <th scope="col" class="num">
                    {t.cols.total}
                  </th>
                  {payer ? (
                    <th scope="col" class="num">
                      {t.cols.vat}
                    </th>
                  ) : null}
                  <th scope="col" class="num">
                    {t.cols.cash}
                  </th>
                  <th scope="col" class="num">
                    {t.cols.card}
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
                    <td>{r.number ?? ''}</td>
                    <td class="num">{formatEurExact(r.total)}</td>
                    {payer ? <td class="num">{formatEurExact(r.vat)}</td> : null}
                    <td class="num">{formatEurExact(r.cash)}</td>
                    <td class="num">{formatEurExact(r.total - r.cash)}</td>
                    <td>
                      {closed ? null : (
                        <form method="post" action={`/app/trzby/${r.id}/zrusit`}>
                          <button class="btn btn--line btn--small" type="submit" aria-label={`${t.remove} ${dayName(r.on)}`}>
                            {t.remove}
                          </button>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr class="ltable__total">
                  <th scope="row" colspan={2}>
                    {t.total}
                  </th>
                  <td class="num">{formatEurExact(sum.total)}</td>
                  {payer ? <td class="num">{formatEurExact(sum.vat)}</td> : null}
                  <td class="num">{formatEurExact(sum.cash)}</td>
                  <td class="num">{formatEurExact(sum.total - sum.cash)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>
    </>
  )
}
