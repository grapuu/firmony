// Výkaz práce: what an accountant did in a month and what she is paid for it (team/work-pay.ts). She sees her own,
// the administrator every one of the team, with the whole team's sums first.
import type { FC } from 'hono/jsx'
import { ACCOUNTANT_RATES } from '../config'
import { formatEurExact } from '../format'
import { monthName } from '../app/copy'
import { team as t } from '../team/copy'
import { payOf, totalOf, type WorkRow } from '../team/work-pay'
import { Heading } from './inside'

const w = t.work

export interface WorkPageProps {
  month: string
  months: string[]
  who: { id: string; name: string }
  rows: WorkRow[]
  /** The administrator's view: every member of the team and the sum of the month. */
  team: { id: string; name: string; total: number }[] | null
}

/** An amount and, when there is any, how many things it is for. */
const Cell: FC<{ cents: number; count?: number }> = ({ cents, count }) => (
  <td class="num">
    {cents > 0 ? formatEurExact(cents) : ''}
    {cents > 0 && count !== undefined && count > 0 ? <span class="small">{` (${count})`}</span> : null}
  </td>
)

export const WorkPage: FC<WorkPageProps> = (p) => {
  const sum = totalOf(p.rows)
  const query = (month: string, user: string) => `?mesiac=${month}${p.team ? `&uctovnicka=${user}` : ''}`
  return (
    <>
      <header class="phead">
        <Heading first={w.title} second={w.serif} />
        <p class="phead__lead">{w.lead}</p>
      </header>
      <form class="stack asset-form" method="get" action="/ucto/vykaz">
        <div class="asset-form__grid">
          <label class="field">
            <span class="field__label">{w.month}</span>
            <select class="field__input" name="mesiac">
              {p.months.map((m) => (
                <option value={m} selected={m === p.month}>
                  {monthName(m)}
                </option>
              ))}
            </select>
          </label>
          {p.team ? (
            <label class="field">
              <span class="field__label">{w.who}</span>
              <select class="field__input" name="uctovnicka">
                {p.team.map((m) => (
                  <option value={m.id} selected={m.id === p.who.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
        <button class="btn btn--line" type="submit">
          {w.show}
        </button>
      </form>
      {p.team ? (
        <section class="info" aria-labelledby="tim-t">
          <h2 id="tim-t" class="info__title">
            {`${w.team}, ${monthName(p.month)}`}
          </h2>
          <div class="lscroll">
            <table class="ltable">
              <tbody>
                {p.team.map((m) => (
                  <tr>
                    <td>
                      <a class="link" href={`/ucto/vykaz${query(p.month, m.id)}`}>
                        {m.name}
                      </a>
                    </td>
                    <td class="num">{formatEurExact(m.total)}</td>
                  </tr>
                ))}
                <tr>
                  <th scope="row">{w.total}</th>
                  <td class="num">
                    <strong>{formatEurExact(p.team.reduce((s, m) => s + m.total, 0))}</strong>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
      <section class="info" aria-labelledby="vykaz-t">
        <h2 id="vykaz-t" class="info__title">
          {`${p.who.name}, ${monthName(p.month)}`}
        </h2>
        {p.rows.length === 0 ? (
          <p class="small">{w.none}</p>
        ) : (
          <>
            <div class="lscroll">
              <table class="ltable">
                <thead>
                  <tr>
                    <th scope="col">{w.col.client}</th>
                    <th scope="col" class="num">
                      {w.col.documents}
                    </th>
                    <th scope="col" class="num">
                      {w.col.vat}
                    </th>
                    <th scope="col" class="num">
                      {w.col.month}
                    </th>
                    <th scope="col" class="num">
                      {w.col.payroll}
                    </th>
                    <th scope="col" class="num">
                      {w.col.closing}
                    </th>
                    <th scope="col" class="num">
                      {w.col.takeover}
                    </th>
                    <th scope="col" class="num">
                      {w.col.total}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {p.rows.map((r) => {
                    const pay = payOf(r)
                    return (
                      <tr>
                        <td>
                          <a class="link" href={`/ucto/klienti/${r.companyId}`}>
                            {r.name}
                          </a>
                        </td>
                        <Cell cents={pay.documents} count={r.documents} />
                        <Cell cents={pay.vat} count={r.vat.length} />
                        <Cell cents={pay.month} />
                        <Cell cents={pay.payroll} count={r.payroll} />
                        <Cell cents={pay.closing} count={r.closings.length} />
                        <Cell cents={pay.takeover} />
                        <td class="num">{formatEurExact(pay.total)}</td>
                      </tr>
                    )
                  })}
                  <tr>
                    <th scope="row">{w.total}</th>
                    <Cell cents={sum.documents} count={p.rows.reduce((n, r) => n + r.documents, 0)} />
                    <Cell cents={sum.vat} count={p.rows.reduce((n, r) => n + r.vat.length, 0)} />
                    <Cell cents={sum.month} />
                    <Cell cents={sum.payroll} count={p.rows.reduce((n, r) => n + r.payroll, 0)} />
                    <Cell cents={sum.closing} count={p.rows.reduce((n, r) => n + r.closings.length, 0)} />
                    <Cell cents={sum.takeover} />
                    <td class="num">
                      <strong>{formatEurExact(sum.total)}</strong>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p>
              <a class="btn btn--line" href={`/ucto/vykaz.csv${query(p.month, p.who.id)}`}>
                {w.csv}
              </a>
            </p>
          </>
        )}
      </section>
      <section class="info" aria-labelledby="sadzby-t">
        <h2 id="sadzby-t" class="info__title">
          {w.rates}
        </h2>
        <dl class="kv">
          {(Object.keys(ACCOUNTANT_RATES) as (keyof typeof ACCOUNTANT_RATES)[]).map((key) => (
            <div>
              <dt>{w.rate[key]}</dt>
              <dd>{formatEurExact(ACCOUNTANT_RATES[key])}</dd>
            </div>
          ))}
        </dl>
      </section>
    </>
  )
}
