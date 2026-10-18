// Cost centres (src/app/centers.ts): what each centre earned in a period, and the company's list of centres.
import type { FC } from 'hono/jsx'
import { formatEurExact } from '../format'
import { app, MONTHS } from '../app/copy'
import type { CenterTotals, CostCenter } from '../app/centers'
import { Flash, Heading } from './inside'

const t = app.centers

export const CentersPage: FC<{
  centers: CostCenter[]
  totals: CenterTotals[]
  year: number
  years: number[]
  from: number
  to: number
  owner: boolean
  values?: { code: string; name: string }
  errors?: { code?: string; name?: string }
  flash?: string | null
}> = ({ centers, totals, year, years, from, to, owner, values = { code: '', name: '' }, errors = {}, flash = null }) => {
  const byId = new Map(centers.map((c) => [c.id, c]))
  const sum = totals.reduce((s, r) => ({ revenue: s.revenue + r.revenue, costs: s.costs + r.costs }), { revenue: 0, costs: 0 })
  return (
    <>
      <header class="phead">
        <Heading first={t.title} second={t.serif} />
        <p class="phead__lead">{t.lead}</p>
      </header>
      <Flash text={flash} />
      <section class="info" aria-labelledby="strediska-t">
        <header class="lhead">
          <h2 id="strediska-t" class="info__title">
            {t.period}: {from === to ? `${MONTHS[from - 1]} ${year}` : t.range(MONTHS[from - 1] ?? '', MONTHS[to - 1] ?? '', year)}
          </h2>
          <form class="centers__range" method="get" action="/app/strediska">
            <label class="field__label" for="st-rok">
              {t.year}
            </label>
            <select id="st-rok" class="field__input" name="rok">
              {years.map((y) => (
                <option value={String(y)} selected={y === year}>
                  {y}
                </option>
              ))}
            </select>
            <label class="field__label" for="st-od">
              {t.from}
            </label>
            <select id="st-od" class="field__input" name="od">
              {MONTHS.map((m, i) => (
                <option value={String(i + 1)} selected={i + 1 === from}>
                  {m}
                </option>
              ))}
            </select>
            <label class="field__label" for="st-do">
              {t.to}
            </label>
            <select id="st-do" class="field__input" name="do">
              {MONTHS.map((m, i) => (
                <option value={String(i + 1)} selected={i + 1 === to}>
                  {m}
                </option>
              ))}
            </select>
            <button class="btn btn--line btn--small" type="submit">
              {t.show}
            </button>
          </form>
        </header>
        <div class="lscroll">
          <table class="ltable centers__table">
            <thead>
              <tr>
                <th scope="col">{t.cols.center}</th>
                <th scope="col" class="num">
                  {t.cols.revenue}
                </th>
                <th scope="col" class="num">
                  {t.cols.costs}
                </th>
                <th scope="col" class="num">
                  {t.cols.result}
                </th>
              </tr>
            </thead>
            <tbody>
              {totals.map((r) => {
                const c = r.id ? byId.get(r.id) : null
                return (
                  <tr>
                    <th scope="row">
                      {c ? (
                        <>
                          <strong>{c.code}</strong> {c.name}
                        </>
                      ) : (
                        <>
                          {t.common}
                          <span class="centers__hint">{t.commonHint}</span>
                        </>
                      )}
                    </th>
                    <td class="num">{formatEurExact(r.revenue)}</td>
                    <td class="num">{formatEurExact(r.costs)}</td>
                    <td class={`num${r.result < 0 ? ' cash__minus' : ''}`}>{formatEurExact(r.result)}</td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr class="ltable__total">
                <th scope="row">{t.total}</th>
                <td class="num">{formatEurExact(sum.revenue)}</td>
                <td class="num">{formatEurExact(sum.costs)}</td>
                <td class="num">{formatEurExact(sum.revenue - sum.costs)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
      <section class="info" aria-labelledby="zoznam-t">
        <h2 id="zoznam-t" class="info__title">
          {t.list}
        </h2>
        {centers.length === 0 ? <p class="info__empty">{t.empty}</p> : null}
        <ul class="plain">
          {centers.map((c) => (
            <li class="trips__item">
              <strong>{c.code}</strong>
              <span>
                {c.name}
                {c.archived ? ` (${t.archived})` : ''}
              </span>
              {owner ? (
                <form class="trips__amount" method="post" action={`/app/strediska/${c.id}/${c.archived ? 'obnovit' : 'archivovat'}`}>
                  <button class="btn btn--line btn--small" type="submit">
                    {c.archived ? t.restore : t.archive}
                  </button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
        {owner ? (
          <form class="fgrid centers__add" method="post" action="/app/strediska" novalidate>
            <div class="fgrid__cell">
              <label class="field__label" for="st-kod">
                {t.code}
              </label>
              <input id="st-kod" class="field__input" name="kod" value={values.code} maxlength={12} aria-invalid={errors.code ? 'true' : undefined} />
              {errors.code ? <p class="field__error">{errors.code}</p> : <p class="field__hint">{t.codeHint}</p>}
            </div>
            <div class="fgrid__cell">
              <label class="field__label" for="st-nazov">
                {t.name}
              </label>
              <input id="st-nazov" class="field__input" name="nazov" value={values.name} maxlength={80} aria-invalid={errors.name ? 'true' : undefined} />
              {errors.name ? <p class="field__error">{errors.name}</p> : null}
            </div>
            <div class="fgrid__cell fgrid__cell--wide">
              <button class="btn btn--blue" type="submit">
                {t.add}
              </button>
            </div>
          </form>
        ) : (
          <p class="info__source">{t.ownerOnly}</p>
        )}
      </section>
    </>
  )
}

/** The centre of a document, on its page (any member) or the booking screen. */
export const CenterSelect: FC<{ centers: CostCenter[]; value: string | null; name?: string; id?: string }> = ({ centers, value, name = 'stredisko', id = 'd-stredisko' }) => (
  <select id={id} class="field__input" name={name}>
    <option value="">{t.docNone}</option>
    {centers
      .filter((c) => !c.archived || c.id === value)
      .map((c) => (
        <option value={c.id} selected={c.id === value}>
          {c.code} {c.name}
        </option>
      ))}
  </select>
)
