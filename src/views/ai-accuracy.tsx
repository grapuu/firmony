// Presnosť AI: how well the reader read the documents booked in a month (team/ai-accuracy.ts), field by field, and
// the suppliers whose documents were put right most often.
import type { FC } from 'hono/jsx'
import { monthName } from '../app/copy'
import { team as t } from '../team/copy'
import type { Accuracy } from '../team/ai-accuracy'
import { Heading } from './inside'

const a = t.ai

/** A share as Slovak writes it, to one decimal place: "97,5 %". */
export function shareText(right: number, of: number): string {
  if (of === 0) return ''
  return `${(Math.floor((right / of) * 1000) / 10).toFixed(1).replace('.', ',')} %`
}

export interface AiPageProps {
  month: string
  months: string[]
  accuracy: Accuracy
}

export const AiPage: FC<AiPageProps> = ({ month, months, accuracy }) => {
  const ai = accuracy.bySource.find((s) => s.source === 'ai')
  const xml = accuracy.bySource.find((s) => s.source === 'xml')
  return (
    <>
      <header class="phead">
        <Heading first={a.title} second={a.serif} />
        <p class="phead__lead">{a.lead}</p>
      </header>
      <form class="stack asset-form" method="get" action="/ucto/ai">
        <label class="field">
          <span class="field__label">{a.month}</span>
          <select class="field__input" name="mesiac">
            {months.map((m) => (
              <option value={m} selected={m === month}>
                {monthName(m)}
              </option>
            ))}
          </select>
        </label>
        <button class="btn btn--line" type="submit">
          {a.show}
        </button>
      </form>
      {accuracy.documents === 0 ? (
        <section class="info">
          <p class="small">{a.none}</p>
        </section>
      ) : (
        <>
          <section class="info" aria-labelledby="ai-t">
            <h2 id="ai-t" class="info__title">
              {monthName(month)}
            </h2>
            <dl class="kv">
              <div>
                <dt>{a.documents}</dt>
                <dd>{String(accuracy.documents)}</dd>
              </div>
              <div>
                <dt>{a.unchanged}</dt>
                <dd>{`${accuracy.unchanged} (${shareText(accuracy.unchanged, accuracy.documents)})`}</dd>
              </div>
              {ai && ai.documents > 0 ? (
                <div>
                  <dt>{a.ai}</dt>
                  <dd>{`${ai.unchanged} z ${ai.documents} bez opravy (${shareText(ai.unchanged, ai.documents)})`}</dd>
                </div>
              ) : null}
              {xml && xml.documents > 0 ? (
                <div>
                  <dt>{a.xml}</dt>
                  <dd>{`${xml.unchanged} z ${xml.documents} bez opravy (${shareText(xml.unchanged, xml.documents)})`}</dd>
                </div>
              ) : null}
            </dl>
          </section>
          <section class="info" aria-labelledby="polia-t">
            <h2 id="polia-t" class="info__title">
              {a.fields}
            </h2>
            <div class="lscroll">
              <table class="ltable">
                <thead>
                  <tr>
                    <th scope="col">{a.col.field}</th>
                    <th scope="col" class="num">
                      {a.col.compared}
                    </th>
                    <th scope="col" class="num">
                      {a.col.right}
                    </th>
                    <th scope="col" class="num">
                      {a.col.share}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {accuracy.fields
                    .filter((f) => f.compared > 0)
                    .map((f) => (
                      <tr>
                        <td>{a.field[f.field]}</td>
                        <td class="num">{String(f.compared)}</td>
                        <td class="num">{String(f.right)}</td>
                        <td class="num">{f.right < f.compared ? <strong>{shareText(f.right, f.compared)}</strong> : shareText(f.right, f.compared)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </section>
          {accuracy.worst.length > 0 ? (
            <section class="info" aria-labelledby="najhorsie-t">
              <h2 id="najhorsie-t" class="info__title">
                {a.worst}
              </h2>
              <div class="lscroll">
                <table class="ltable">
                  <thead>
                    <tr>
                      <th scope="col">{a.col.party}</th>
                      <th scope="col" class="num">
                        {a.col.docs}
                      </th>
                      <th scope="col" class="num">
                        {a.col.changed}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {accuracy.worst.map((w) => (
                      <tr>
                        <td>{w.party}</td>
                        <td class="num">{String(w.documents)}</td>
                        <td class="num">{String(w.changed)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}
        </>
      )}
    </>
  )
}
