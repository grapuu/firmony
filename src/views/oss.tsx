// The one-stop shop's return of a client (/ucto/klienti/:id/dph/oss?stvrtrok=): the quarters since the company uses
// the scheme, a quarter's lines, its corrections of earlier quarters, each state's balance, the file and the mark.
import type { FC } from 'hono/jsx'
import { formatEurExact } from '../format'
import { dayName } from '../app/copy'
import { textDay } from '../app/booking'
import type { Company } from '../app/store'
import type { OssView } from '../app/oss'
import { team as t } from '../team/copy'
import { Flash, Heading } from './inside'

const k = t.oss

export interface OssPageProps {
  company: Company
  quarters: { quarter: string; state: string }[]
  view: OssView | null
  today: string
  flash: string | null
  /** The fingerprint of the file the page offers, carried by the mark. */
  sig?: string | null
}

const pill = (state: string) => (state === 'filed' ? 'pill--ok' : state === 'blocked' || state === 'changed' ? 'pill--red' : state === 'ready' ? 'pill--amber' : 'pill--grey')

export const OssPage: FC<OssPageProps> = ({ company, quarters, view, today, flash, sig }) => {
  const base = `/ucto/klienti/${company.id}/dph/oss`
  return (
    <>
      <a class="back" href={`/ucto/klienti/${company.id}/dph`}>
        {t.vat.title}
      </a>
      <header class="phead">
        <Heading first={k.title} second={company.name} />
        <p class="phead__lead">{k.lead}</p>
      </header>
      <Flash text={flash} />
      {!company.ossSince ? (
        <section class="info">
          <p class="info__lead">{k.none}</p>
          <a class="btn btn--line btn--small" href={`/ucto/klienti/${company.id}#udaje`}>
            {t.client.ossSince}
          </a>
        </section>
      ) : (
        <>
          <nav class="periods" aria-label={k.quarters}>
            {quarters.map((q) => (
              <a class="periods__item" href={`${base}?stvrtrok=${q.quarter}`} aria-current={view?.quarter === q.quarter ? 'page' : undefined}>
                <span class="periods__name">{k.quarter(q.quarter)}</span>
                <span class={`pill ${pill(q.state)}`}>{k.states[q.state]}</span>
              </a>
            ))}
          </nav>
          {view ? <QuarterCard company={company} view={view} today={today} sig={sig} /> : null}
        </>
      )}
    </>
  )
}

const QuarterCard: FC<{ company: Company; view: OssView; today: string; sig?: string | null }> = ({ company, view, today, sig }) => {
  const base = `/ucto/klienti/${company.id}/dph/oss`
  const q = view.quarter
  const late = today > view.due && view.state !== 'filed' && view.state !== 'changed'
  return (
    <div class="pgrid">
      <div class="pgrid__main">
        <section class="info" aria-labelledby="oss-t">
          <header class="info__row">
            <h2 id="oss-t" class="info__title">
              {k.quarter(q)}
            </h2>
            <span class={`pill ${pill(view.state)}`}>{k.states[view.state]}</span>
          </header>
          {k.stateLead[view.state] ? <p class="info__lead">{k.stateLead[view.state]}</p> : null}
          {view.state === 'blocked' ? (
            <ul class="vissues">
              {view.issues.map((i) => (
                <li class="vissue">
                  <span class="vissue__text">{i.code === 'negative' ? k.issues.negative(i.ids.join(', ')) : k.issues[i.code](i.ids.length)}</span>
                  {i.code !== 'negative' && i.ids[0] ? (
                    <a class="link" href={`/ucto/doklady/${i.ids[0]}`}>
                      {k.openDoc}
                    </a>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
          {view.lines.length === 0 ? (
            <p class="info__empty">{k.empty}</p>
          ) : (
            <div class="lscroll">
              <table class="ltable">
                <thead>
                  <tr>
                    <th scope="col">{k.cols.country}</th>
                    <th scope="col">{k.cols.kind}</th>
                    <th scope="col" class="num">
                      {k.cols.rate}
                    </th>
                    <th scope="col" class="num">
                      {k.cols.base}
                    </th>
                    <th scope="col" class="num">
                      {k.cols.vat}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {view.lines.map((l) => (
                    <tr>
                      <td>{l.country}</td>
                      <td>{l.goods ? k.goods : k.services}</td>
                      <td class="num">
                        {String(l.rate).replace('.', ',')} % ({l.standard ? k.standard : k.reduced})
                      </td>
                      <td class="num">{formatEurExact(l.base)}</td>
                      <td class="num">{formatEurExact(l.vat)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {view.corrections.length > 0 ? (
            <>
              <h3 class="info__sub">{k.corrections}</h3>
              <dl class="kv">
                {view.corrections.map((c) => (
                  <div>
                    <dt>{k.correction(c.quarter, c.country)}</dt>
                    <dd>{formatEurExact(c.cents)}</dd>
                  </div>
                ))}
              </dl>
            </>
          ) : null}
        </section>
      </div>
      <aside class="pgrid__side">
        <section class="info" aria-label={k.balances}>
          <p class={late ? 'flag' : 'info__lead'}>{k.due(dayName(view.due, today))}</p>
          {view.balances.length > 0 ? (
            <dl class="kv">
              {view.balances.map((b) => (
                <div>
                  <dt>{b.country}</dt>
                  <dd>{formatEurExact(b.cents)}</dd>
                </div>
              ))}
              <div class="kv__strong">
                <dt>{view.total >= 0 ? k.total : k.refund}</dt>
                <dd>{formatEurExact(Math.abs(view.total))}</dd>
              </div>
            </dl>
          ) : null}
          {view.filed ? <p class="info__source">{k.filed(textDay(view.filed.filedOn))}</p> : null}
          {view.state === 'ready' || view.state === 'filed' || view.state === 'changed' ? (
            <>
              <a class="btn btn--line btn--small" href={`${base}.xml?stvrtrok=${q}`}>
                {k.file}
              </a>
              <p class="info__source">{k.fileHint}</p>
            </>
          ) : null}
          {view.state === 'ready' ? (
            <form class="stack" method="post" action={`${base}/podane`}>
              <input type="hidden" name="stvrtrok" value={q} />
              {sig ? <input type="hidden" name="sig" value={sig} /> : null}
              <label class="field__label" for="oss-den">
                {k.filedOn}
              </label>
              <input id="oss-den" class="field__input" name="datum" value={textDay(today)} maxlength={16} />
              <button class="btn btn--blue stack__submit" type="submit">
                {k.mark}
              </button>
            </form>
          ) : view.filed ? (
            <form method="post" action={`${base}/zrusit`}>
              <input type="hidden" name="stvrtrok" value={q} />
              <button class="btn btn--line btn--small" type="submit">
                {k.unmark}
              </button>
            </form>
          ) : null}
        </section>
      </aside>
    </div>
  )
}
