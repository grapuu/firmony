// Taking a client over from the accountant before (/ucto/klienti/:id/prevzatie): the trial balance for the opening
// balances, the open items, the fixed assets, the employees and the statements she filed, each from a file of her
// program or rows pasted; the lists read so far, each removable while nothing of it was used. takeover.ts reads them.
import type { FC } from 'hono/jsx'
import { TeamTakeover, type TeamTakeoverProps } from './managed-takeover'
import { formatEurExact } from '../format'
import { dayName } from '../app/copy'
import type { Company } from '../app/store'
import type { TakeoverBatch } from '../app/takeover-store'
import { team as t } from '../team/copy'
import { Flash, Heading } from './inside'

const k = t.takeover

export type TakeoverCard = 'trial' | 'items' | 'assets' | 'people' | 'prior' | 'batch' | 'managed'

export interface TakeoverPageProps {
  managed?: TeamTakeoverProps
  company: Company
  /** The day the books begin, when they have one. */
  start: string | null
  prior: { year: number; form: 'muj' | 'pod'; assetsNet: number; fileName: string }[]
  batches: TakeoverBatch[]
  /** What was refused, on the card it came from: why, and the lines that could not be read. */
  error: { card: TakeoverCard; text: string; lines?: string[] } | null
  values: { day: string; side: string; rows: Partial<Record<TakeoverCard, string>> }
  flash: string | null
}

const path = (c: Company) => `/ucto/klienti/${c.id}/prevzatie`

const Refused: FC<{ error: TakeoverPageProps['error']; card: TakeoverCard }> = ({ error, card }) =>
  error && error.card === card ? (
    <div class="notice notice--error" role="alert">
      <p>{error.text}</p>
      {error.lines && error.lines.length > 0 ? (
        <ul class="takeover__lines">
          {error.lines.map((l) => (
            <li>{l}</li>
          ))}
        </ul>
      ) : null}
    </div>
  ) : null

/** A file of the program, or rows pasted, and what else the card asks. */
const ListForm: FC<{ c: Company; card: TakeoverCard; action: string; file: string; rows?: string; children?: unknown }> = ({ c, card, action, file, rows, children }) => (
  <form class="stack" method="post" action={`${path(c)}/${action}`} enctype="multipart/form-data">
    {children as never}
    <label class="field" for={`${card}-subor`}>
      <span class="field__label">{file}</span>
      <input
        id={`${card}-subor`}
        class="field__input"
        type="file"
        name="subor"
        accept=".xlsx,.csv,.txt,.xml,text/csv,text/plain,application/xml,text/xml,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      />
    </label>
    <label class="field" for={`${card}-riadky`}>
      <span class="field__label">{k.paste}</span>
      <textarea id={`${card}-riadky`} class="field__input field__area" name="riadky" rows={4}>
        {rows ?? ''}
      </textarea>
    </label>
    <button class="btn btn--blue stack__submit" type="submit">
      {k.read}
    </button>
  </form>
)

const Card: FC<{ id: TakeoverCard; title: string; lead: string; children?: unknown }> = ({ id, title, lead, children }) => (
  <section class="info" id={`prevzatie-${id}`} aria-labelledby={`prevzatie-${id}-t`}>
    <h2 id={`prevzatie-${id}-t`} class="info__title">
      {title}
    </h2>
    <p class="info__lead">{lead}</p>
    {children as never}
  </section>
)

export const TakeoverPage: FC<TakeoverPageProps> = (p) => {
  const c = p.company
  const rows = p.values.rows
  return (
    <>
      <a class="back" href={`/ucto/klienti/${c.id}`}>
        {c.name}
      </a>
      <header class="phead">
        <Heading first={k.title} second={k.second} />
        <p class="phead__lead">{k.lead}</p>
      </header>
      <Flash text={p.flash} />
      <Refused error={p.error} card="managed" />
      {p.managed ? <TeamTakeover {...p.managed} /> : null}
      <div class="pgrid">
        <div class="pgrid__main">
          <Card id="trial" title={k.trial.title} lead={k.trial.lead}>
            <Refused error={p.error} card="trial" />
            <ListForm c={c} card="trial" action="predvaha" file={k.file} rows={rows.trial}>
              <label class="field" for="trial-datum">
                <span class="field__label">{k.trial.day}</span>
                <input id="trial-datum" class="field__input takeover__day" name="datum" value={p.values.day} inputmode="numeric" maxlength={16} autocomplete="off" />
              </label>
            </ListForm>
          </Card>
          <Card id="items" title={k.items.title} lead={k.items.lead}>
            <Refused error={p.error} card="items" />
            {p.start ? (
              <ListForm c={c} card="items" action="saldokonto" file={k.fileXml} rows={rows.items}>
                <label class="field" for="items-strana">
                  <span class="field__label">{k.items.side}</span>
                  <select id="items-strana" class="field__input" name="strana">
                    {Object.entries(k.items.sides).map(([value, label]) => (
                      <option value={value} selected={value === p.values.side}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
              </ListForm>
            ) : (
              <p class="info__source">{k.noStart}</p>
            )}
          </Card>
          <Card id="assets" title={k.assets.title} lead={k.assets.lead}>
            <Refused error={p.error} card="assets" />
            {p.start ? <ListForm c={c} card="assets" action="majetok" file={k.file} rows={rows.assets} /> : <p class="info__source">{k.noStart}</p>}
          </Card>
          <Card id="people" title={k.people.title} lead={k.people.lead}>
            <Refused error={p.error} card="people" />
            <ListForm c={c} card="people" action="zamestnanci" file={k.file} rows={rows.people} />
          </Card>
        </div>
        <aside class="pgrid__side">
          <section class="info" aria-label={k.title}>
            <p class="info__lead">{p.start ? k.start(dayName(p.start)) : k.noStart}</p>
          </section>
          <Card id="prior" title={k.prior.title} lead={k.prior.lead}>
            <Refused error={p.error} card="prior" />
            {p.prior.length === 0 ? (
              <p class="info__empty">{k.prior.empty}</p>
            ) : (
              <ul class="takeover__list">
                {p.prior.map((s) => (
                  <li class="takeover__item">
                    <span>
                      <strong>{k.prior.row(s.year, k.prior.forms[s.form] ?? s.form)}</strong>
                      <span class="takeover__meta">{k.prior.assets(formatEurExact(s.assetsNet))}</span>
                      <span class="takeover__meta">{s.fileName}</span>
                    </span>
                    <form method="post" action={`${path(c)}/zavierka/${s.year}/odstranit`}>
                      <button class="btn btn--line btn--small" type="submit">
                        {k.prior.remove}
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
            <form class="stack" method="post" action={`${path(c)}/zavierka`} enctype="multipart/form-data">
              <label class="field" for="prior-subor">
                <span class="field__label">{k.prior.file}</span>
                <input id="prior-subor" class="field__input" type="file" name="subor" accept=".xml,application/xml,text/xml" />
              </label>
              <button class="btn btn--line stack__submit" type="submit">
                {k.read}
              </button>
            </form>
          </Card>
          <Card id="batch" title={k.batches.title} lead={k.batches.lead}>
            <Refused error={p.error} card="batch" />
            {p.batches.length === 0 ? (
              <p class="info__empty">{k.batches.empty}</p>
            ) : (
              <ul class="takeover__list">
                {p.batches.map((b) => (
                  <li class="takeover__item">
                    <span>
                      <strong>{b.kind === 'items' ? k.batches.items(b.count) : k.batches.assets(b.count)}</strong>
                      {b.used > 0 ? <span class="takeover__meta">{k.batches.used(b.used)}</span> : null}
                    </span>
                    {b.used === 0 ? (
                      <form method="post" action={`${path(c)}/zoznam/${b.id}/odstranit`}>
                        <button class="btn btn--line btn--small" type="submit">
                          {k.batches.remove}
                        </button>
                      </form>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </aside>
      </div>
    </>
  )
}
