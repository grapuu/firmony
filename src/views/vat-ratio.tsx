// The proportional deduction of a client (/ucto/klienti/:id/dph/koeficient?rok=): the coefficient the company uses in a
// year, the year's supplies that make its own coefficient, the documents deducted in proportion and the year's settlement
// in its last period (vat-ratio.ts).
import type { FC } from 'hono/jsx'
import { formatEurExact } from '../format'
import { dayName } from '../app/copy'
import { textDay } from '../app/booking'
import type { Company, Doc } from '../app/store'
import { periodName } from '../app/vat-store'
import { coefText, settleTotal, type RatioWork, type RatioYear } from '../app/vat-ratio'
import { team as t } from '../team/copy'
import { Flash, Heading } from './inside'
import { DocLinks } from './vat'

const k = t.ratio

export type RatioState = 'none' | 'running' | 'settle' | 'settled' | 'changed'

export interface RatioPageProps {
  company: Company
  year: number
  years: { year: number; state: RatioState }[]
  /** The year's coefficient as stored, and the coefficient the year before was settled with (the proposal). */
  stored: RatioYear | null
  proposal: { year: number; coef: number } | null
  work: RatioWork
  /** Documents of the year deducted by its coefficient, booked or not: while any is, the coefficient stays. */
  held: number
  state: RatioState
  /** The year's last period, where its settlement goes. */
  last: string
  /** The fingerprint of the figures shown, carried by the settlement. */
  sig: string
  locked: boolean
  docs: Map<string, Doc>
  today: string
  /** The coefficient of this year may be written (last, this or next year). */
  editable: boolean
  /** Our books started during the year: the coefficient and the settlement see only the documents since. */
  since: string | null
  values?: { koeficient: string; sposob: string }
  errors?: { koeficient?: string; sposob?: string }
  flash: string | null
}

const pill = (state: RatioState) => (state === 'settled' ? 'pill--ok' : state === 'changed' ? 'pill--red' : state === 'settle' ? 'pill--amber' : 'pill--grey')

export const RatioPage: FC<RatioPageProps> = (p) => {
  const c = p.company
  const base = `/ucto/klienti/${c.id}/dph/koeficient`
  const w = p.work
  const ended = p.today > `${p.year}-12-31`
  const total = w.rates.reduce((sum, r) => sum + r.settle, 0)
  const coefValue = p.values?.koeficient ?? (p.stored ? coefText(p.stored.coef) : p.proposal ? coefText(p.proposal.coef) : '')
  const how = p.values?.sposob ?? p.stored?.how ?? (p.proposal ? 'previous' : '')
  return (
    <>
      <a class="back" href={`/ucto/klienti/${c.id}/dph`}>
        {t.vat.title}
      </a>
      <header class="phead">
        <Heading first={k.title} second={c.name} />
        <p class="phead__lead">{k.lead}</p>
      </header>
      <Flash text={p.flash} />
      {c.vatStatus !== 'payer' ? (
        <section class="info">
          <p class="info__lead">{k.notPayer}</p>
        </section>
      ) : (
        <>
          <nav class="periods" aria-label={k.years}>
            {p.years.map((y) => (
              <a class="periods__item" href={`${base}?rok=${y.year}`} aria-current={y.year === p.year ? 'page' : undefined}>
                <span class="periods__name">{y.year}</span>
                <span class={`pill ${pill(y.state)}`}>{k.state[y.state]}</span>
              </a>
            ))}
          </nav>
          <div class="pgrid">
            <div class="pgrid__main">
              <section class="info" aria-labelledby="koef-t">
                <h2 id="koef-t" class="info__title">
                  {k.coefTitle}
                </h2>
                <p class="info__lead">{k.coefLead}</p>
                {p.stored ? <p class="info__lead">{k.current(coefText(p.stored.coef), k.how[p.stored.how] ?? '')}</p> : <p class="flag">{k.noCoef}</p>}
                {p.proposal ? <p class="info__source">{k.proposal(p.proposal.year, coefText(p.proposal.coef))}</p> : null}
                {p.locked || !p.editable ? (
                  <p class="info__source">{p.locked ? k.locked : k.notEditable}</p>
                ) : (
                  <form class="stack" method="post" action={base}>
                    <input type="hidden" name="rok" value={String(p.year)} />
                    <label class="field__label" for="koef-k">
                      {k.coef}
                    </label>
                    <input id="koef-k" class="field__input" name="koeficient" value={coefValue} maxlength={8} inputmode="decimal" aria-invalid={p.errors?.koeficient ? 'true' : undefined} />
                    {p.errors?.koeficient ? <p class="field__error">{p.errors.koeficient}</p> : <p class="field__hint">{k.coefHint}</p>}
                    <fieldset class="ratio__how">
                      <legend class="field__label">{k.howLegend}</legend>
                      {(['previous', 'estimate'] as const).map((h) => (
                        <label class="tickbox">
                          <input type="radio" name="sposob" value={h} checked={how === h} />
                          <span>{k.how[h]}</span>
                        </label>
                      ))}
                    </fieldset>
                    {p.errors?.sposob ? <p class="field__error">{p.errors.sposob}</p> : null}
                    <button class="btn btn--blue stack__submit" type="submit">
                      {k.save}
                    </button>
                  </form>
                )}
                {p.stored && !p.stored.settled && !p.locked && p.held === 0 ? (
                  <form method="post" action={`${base}/odstranit`}>
                    <input type="hidden" name="rok" value={String(p.year)} />
                    <button class="btn btn--text" type="submit">
                      {k.remove}
                    </button>
                  </form>
                ) : null}
              </section>
              <section class="info" aria-labelledby="dodania-t">
                <h2 id="dodania-t" class="info__title">
                  {k.suppliesTitle}
                </h2>
                <p class="info__lead">{k.suppliesLead}</p>
                {p.since ? <p class="flag">{k.since(dayName(p.since, p.today))}</p> : null}
                <dl class="kv">
                  <div>
                    <dt>{k.all}</dt>
                    <dd>{formatEurExact(w.denominator)}</dd>
                  </div>
                  <div>
                    <dt>{k.right}</dt>
                    <dd>{formatEurExact(w.numerator)}</dd>
                  </div>
                  <div>
                    <dt>{k.exempt}</dt>
                    <dd>{formatEurExact(w.denominator - w.numerator)}</dd>
                  </div>
                  <div class="kv__strong">
                    <dt>{k.share}</dt>
                    <dd>{coefText(w.coef)}</dd>
                  </div>
                </dl>
                {w.denominator > 0 ? <p class="info__source">{k.shareText(formatEurExact(w.numerator), formatEurExact(w.denominator), coefText(w.coef))}</p> : null}
                {w.deductible.length + w.exempt.length > 0 ? (
                  <details class="vrows__docs">
                    <summary>{k.docs(w.deductible.length + w.exempt.length)}</summary>
                    <DocLinks ids={[...w.deductible, ...w.exempt]} docs={p.docs} />
                  </details>
                ) : null}
                {w.skipped.length > 0 ? (
                  <details class="vrows__docs">
                    <summary>{k.skipped(w.skipped.length)}</summary>
                    <DocLinks ids={w.skipped} docs={p.docs} />
                  </details>
                ) : null}
              </section>
              <section class="info" aria-labelledby="vysporiadanie-t">
                <h2 id="vysporiadanie-t" class="info__title">
                  {k.settleTitle}
                </h2>
                <p class="info__lead">{k.settleLead(periodName(p.last))}</p>
                {w.proportional.length === 0 ? (
                  <p class="info__empty">{k.noneProportional}</p>
                ) : (
                  <>
                    <details class="vrows__docs">
                      <summary>{k.proportional(w.proportional.length)}</summary>
                      <DocLinks ids={w.proportional} docs={p.docs} />
                    </details>
                    <div class="lscroll">
                      <table class="ltable">
                        <thead>
                          <tr>
                            <th scope="col">{k.cols.rate}</th>
                            <th scope="col" class="num">
                              {k.cols.vat}
                            </th>
                            <th scope="col" class="num">
                              {k.cols.deducted}
                            </th>
                            <th scope="col" class="num">
                              {k.cols.due}
                            </th>
                            <th scope="col" class="num">
                              {k.cols.settle}
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {w.rates.map((r) => (
                            <tr>
                              <td>{r.rate} %</td>
                              <td class="num">{formatEurExact(r.vat)}</td>
                              <td class="num">{formatEurExact(r.deducted)}</td>
                              <td class="num">{formatEurExact(r.due)}</td>
                              <td class="num">{formatEurExact(r.settle)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </section>
            </div>
            <aside class="pgrid__side">
              <section class="info" aria-labelledby="stav-t">
                <header class="info__row">
                  <h2 id="stav-t" class="info__title">
                    {k.year(p.year)}
                  </h2>
                  <span class={`pill ${pill(p.state)}`}>{k.state[p.state]}</span>
                </header>
                <dl class="kv">
                  <div class="kv__strong">
                    <dt>{k.total(periodName(p.last))}</dt>
                    <dd>{formatEurExact(p.stored?.settled ? settleTotal(p.stored.settled) : total)}</dd>
                  </div>
                </dl>
                {!ended ? <p class="info__lead">{k.running(dayName(`${p.year}-12-31`, p.today))}</p> : null}
                {w.unbooked.length > 0 ? <p class="flag">{k.unbooked(w.unbooked.length)}</p> : null}
                {ended && !p.stored ? <p class="flag">{k.needCoef}</p> : null}
                {p.stored?.settled && p.stored.settledAt ? (
                  <p class="info__source">{k.settled(textDay(new Date(p.stored.settledAt * 1000).toISOString().slice(0, 10)), p.stored.settledByName ?? '')}</p>
                ) : null}
                {p.state === 'changed' ? <p class="flag">{k.changed}</p> : null}
                {p.locked ? (
                  <p class="info__source">{k.locked}</p>
                ) : (
                  <>
                    {ended && p.stored && w.unbooked.length === 0 && p.state !== 'settled' ? (
                      <form method="post" action={`${base}/vysporiadat`}>
                        <input type="hidden" name="rok" value={String(p.year)} />
                        <input type="hidden" name="podpis" value={p.sig} />
                        <button class="btn btn--blue" type="submit">
                          {p.state === 'changed' ? k.settleAgain : k.settle(periodName(p.last))}
                        </button>
                      </form>
                    ) : null}
                    {p.stored?.settled ? (
                      <form method="post" action={`${base}/zrusit`}>
                        <input type="hidden" name="rok" value={String(p.year)} />
                        <button class="btn btn--line btn--small" type="submit">
                          {k.unsettle}
                        </button>
                      </form>
                    ) : null}
                  </>
                )}
              </section>
            </aside>
          </div>
        </>
      )}
    </>
  )
}
