// The suppliers' invoices that wait for approving before they are paid (src/app/approvals.ts): those the person may
// approve, then those that wait for somebody else (a second approval, an amount above his limit, an IBAN he typed).
import type { FC } from 'hono/jsx'
import { formatEurExact } from '../format'
import { app, dayName } from '../app/copy'
import type { Doc } from '../app/store'
import { Heading } from './inside'

const t = app.approvalsQueue

/** What waits of an invoice, said to the person who looks. */
const stateOf = (d: Doc, me: string, mine: boolean, approver: boolean, ibanMine: readonly string[]): string => {
  if (mine) return d.firstApprovedBy && d.firstApprovedBy !== me ? t.first(d.firstApprovedByName ?? '') : t.waiting
  if (d.firstApprovedBy === me) return t.yours
  if (ibanMine.includes(d.id)) return t.ibanYours
  if (d.firstApprovedBy) return t.first(d.firstApprovedByName ?? '')
  return approver ? t.beyond : t.notApprover
}

const Table: FC<{ docs: Doc[]; me: string; today: string; mine: boolean; approver: boolean; ibanMine: readonly string[] }> = ({ docs, me, today, mine, approver, ibanMine }) => (
  <div class="lscroll">
    <table class="ltable approvals__table">
      <thead>
        <tr>
          <th scope="col">{t.cols.party}</th>
          <th scope="col">{t.cols.number}</th>
          <th scope="col" class="num">
            {t.cols.amount}
          </th>
          <th scope="col">{t.cols.due}</th>
          <th scope="col">{t.cols.state}</th>
        </tr>
      </thead>
      <tbody>
        {docs.map((d) => (
          <tr>
            <th scope="row">
              <a class="link" href={`/app/doklady/${d.id}#schvalenie`}>
                {d.party ?? app.documents.unknown}
              </a>
            </th>
            <td>{d.number ?? ''}</td>
            <td class="num">{d.totalCents === null ? '' : (d.currency ?? 'EUR') === 'EUR' ? formatEurExact(d.totalCents) : `${(d.totalCents / 100).toFixed(2).replace('.', ',')} ${d.currency}`}</td>
            <td class={d.dueOn && d.dueOn < today ? 'cash__minus' : undefined}>{d.dueOn ? dayName(d.dueOn, today) : ''}</td>
            <td>{stateOf(d, me, mine, approver, ibanMine)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
)

export const ApprovalsPage: FC<{ on: boolean; mine: Doc[]; others: Doc[]; me: string; today: string; approver: boolean; ibanMine: readonly string[] }> = ({
  on,
  mine,
  others,
  me,
  today,
  approver,
  ibanMine,
}) => (
  <>
    <a class="back" href="/app/doklady">
      {app.documents.title}
    </a>
    <header class="phead">
      <Heading first={t.title} second={t.serif} />
      <p class="phead__lead">{t.lead}</p>
    </header>
    {!on ? (
      <p class="info__empty">{t.off}</p>
    ) : (
      <>
        <section class="info" aria-labelledby="moje-t">
          <h2 id="moje-t" class="info__title">
            {t.mine}
          </h2>
          {mine.length === 0 ? <p class="info__empty">{t.none}</p> : <Table docs={mine} me={me} today={today} mine approver={approver} ibanMine={ibanMine} />}
        </section>
        <section class="info" aria-labelledby="ini-t">
          <h2 id="ini-t" class="info__title">
            {t.others}
          </h2>
          {others.length === 0 ? <p class="info__empty">{t.noneOthers}</p> : <Table docs={others} me={me} today={today} mine={false} approver={approver} ibanMine={ibanMine} />}
        </section>
      </>
    )}
  </>
)
