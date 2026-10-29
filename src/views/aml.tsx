// The team's page of a client under the law against money laundering (aml.ts): the declaration in full with the
// check of it, the risk the client is put in, and the internal reports of unusual operations with the designated
// person's decision. Only the team reaches it (/ucto); an accountant sees her own reports, only the explicitly designated person sees all reports. Other administrators see only their own. Nothing here is ever shown to the client (s. 18 of the Act).
import type { FC, Child } from 'hono/jsx'
import { APP } from '../config'
import { typeset } from '../format'
import { app, dayName, whenName } from '../app/copy'
import { declarationStateOf, type Level, type Report, type Risk, type StoredDeclaration } from '../app/aml'
import type { Company, User } from '../app/store'
import { team as t } from '../team/copy'
import { Flash, Heading } from './inside'
import { dayOf } from './inside-pages'

const a = t.aml
const d = app.declaration

const STATE_PILL = { missing: 'pill--amber', waiting: 'pill--blue', checked: 'pill--ok' } as const

const born = (rc: string, day: string) => (rc ? rc : day ? dayName(day) : a.no)

const Declaration: FC<{ company: Company; stored: StoredDeclaration | null; today: string; hidden?: boolean }> = ({ company, stored, today, hidden }) => {
  const state = declarationStateOf(stored)
  return (
    <section class="info" id="udaje" aria-labelledby="udaje-t">
      <header class="info__row">
        <h2 id="udaje-t" class="info__title">
          {a.declaration}
        </h2>
        <span class={`pill ${STATE_PILL[state]}`}>{a.state[state]}</span>
      </header>
      {hidden ? (
        // His word of 27 October 2026: the people's personal data are seen and checked by the designated person alone.
        <p class="info__lead">{typeset('Osobné údaje z vyhlásenia, rodné čísla, adresy a doklady, vidí a overuje len určená osoba. Podozrivé veci napíšte do oznámenia nižšie.')}</p>
      ) : !stored ? (
        <p class="info__empty">{a.missing}</p>
      ) : (
        <>
          <p class="info__source">{a.by(stored.createdByName, whenName(stored.createdAt, today))}</p>
          <h3 class="aml__sub">{a.director}</h3>
          <dl class="kv">
            <div>
              <dt>{a.name}</dt>
              <dd class="kv__long">{stored.data.director.name}</dd>
            </div>
            <div>
              <dt>{stored.data.director.birthNumber ? a.rc : a.dob}</dt>
              <dd>{born(stored.data.director.birthNumber, stored.data.director.birthDate)}</dd>
            </div>
            <div>
              <dt>{a.address}</dt>
              <dd class="kv__long">{stored.data.director.address}</dd>
            </div>
            <div>
              <dt>{a.nationality}</dt>
              <dd>{stored.data.director.nationality}</dd>
            </div>
            <div>
              <dt>{a.document}</dt>
              <dd class="kv__long">
                {d.idKinds[stored.data.director.idKind]} {stored.data.director.idNumber}
              </dd>
            </div>
            <div>
              <dt>{a.pep}</dt>
              <dd class={stored.data.director.pep ? 'aml__flag' : undefined}>{stored.data.director.pep ? a.yes : a.no}</dd>
            </div>
          </dl>
          <h3 class="aml__sub">{a.kuv}</h3>
          <p class="info__lead">{a.kuvs[stored.data.kuv]}</p>
          {stored.data.owners.length > 0 ? (
            <ul class="plain">
              {stored.data.owners.map((o) => (
                <li class="plain__row plain__row--two">
                  <span class="plain__name">
                    {o.name}, {o.share}
                  </span>
                  <span class="plain__sub">
                    <span>{born(o.birthNumber, o.birthDate)}</span>
                    <span>{o.address}</span>
                    <span>{o.nationality}</span>
                    {o.pep ? <span class="aml__flag">{a.pep}</span> : null}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          <h3 class="aml__sub">{a.business}</h3>
          <dl class="kv">
            <div>
              <dt>{a.activity}</dt>
              <dd class="kv__long">{stored.data.activity}</dd>
            </div>
            <div>
              <dt>{a.income}</dt>
              <dd class="kv__long">{stored.data.income}</dd>
            </div>
            <div>
              <dt>{a.turnover}</dt>
              <dd>{d.turnovers[stored.data.turnover]}</dd>
            </div>
            <div>
              <dt>{a.cash}</dt>
              <dd class={stored.data.cash ? 'aml__flag' : undefined}>{stored.data.cash ? a.yes : a.no}</dd>
            </div>
            <div>
              <dt>{a.abroad}</dt>
              <dd class={`kv__long${stored.data.abroad ? ' aml__flag' : ''}`}>{stored.data.abroad ? `${a.yes}: ${stored.data.abroadWhere}` : a.no}</dd>
            </div>
          </dl>
          {stored.checkedAt ? (
            <p class="info__source">{a.checked(dayName(dayOf(stored.checkedAt), today), stored.checkedByName)}</p>
          ) : (
            <>
              <p class="info__lead">{a.how}</p>
              <p class="info__lead">Dokončenie overenia sa potvrdzuje pri záznamoch jednotlivých kontrol.</p>
            </>
          )}
        </>
      )}
    </section>
  )
}

const Reports: FC<{ company: Company; reports: Report[]; admin: boolean; readOnly?: boolean; today: string; draft?: string }> = ({ company, reports, admin, today, draft, readOnly }) => (
  <section class="info" id="oznamenia" aria-labelledby="oznamenia-t">
    <h2 id="oznamenia-t" class="info__title">
      {a.reports}
    </h2>
    <p class="info__lead">{a.reportsLead}</p>
    {!readOnly ? <form class="stack" method="post" action={`/ucto/klienti/${company.id}/aml/oznamenie`} novalidate>
      <label class="field__label" for="oznamenie">
        {a.reportBody}
      </label>
      <textarea id="oznamenie" class="field__input field__area" name="text" rows={3} maxlength={APP.messageChars} placeholder={a.reportPlaceholder}>
        {draft ?? ''}
      </textarea>
      <button class="btn btn--line stack__submit" type="submit">
        {a.reportSend}
      </button>
    </form> : null}
    {reports.length === 0 ? (
      <p class="info__empty">{a.reportEmpty}</p>
    ) : (
      <ul class="reports">
        {reports.map((r) => (
          <li class={`report${r.decision ? '' : ' report--open'}`}>
            <p class="report__by">{a.reportBy(r.createdByName, whenName(r.createdAt, today))}</p>
            <p class="report__body">{r.body}</p>
            {r.decision && r.decidedAt ? (
              <p class="report__decision">
                {a.decided(a.decisions[r.decision], r.decidedByName, whenName(r.decidedAt, today))}
                {/* Program 7.2: the author learns the result, not the designated person's reasons. */}
                {admin && r.decisionNote ? `. ${r.decisionNote}` : ''}
              </p>
            ) : admin ? (
              <form class="stack report__decide" method="post" action={`/ucto/klienti/${company.id}/aml/oznamenie/${r.id}`} novalidate>
                <label class="field__label" for={`posudenie-${r.id}`}>
                  {a.decide}: {a.decisionNote.toLowerCase()}
                </label>
                <textarea id={`posudenie-${r.id}`} class="field__input field__area" name="poznamka" rows={2} maxlength={1000} />
                <div class="report__buttons">
                  <button class="btn btn--blue btn--small" type="submit" name="rozhodnutie" value="reported">
                    {a.decideReported}
                  </button>
                  <button class="btn btn--line btn--small" type="submit" name="rozhodnutie" value="not">
                    {a.decideNot}
                  </button>
                </div>
              </form>
            ) : (
              <p class="report__decision">
                <span class="pill pill--amber">{a.reportOpen}</span>
              </p>
            )}
          </li>
        ))}
      </ul>
    )}
  </section>
)

export interface AmlPageProps {
  user: User
  officer?: boolean
  readOnly?: boolean
  verification?: Child
  company: Company
  stored: StoredDeclaration | null
  risks: Risk[]
  suggested: Level | null
  reports: Report[]
  now: number
  flash?: string | null
  error?: string | null
  draft?: string
}

export const AmlPage: FC<AmlPageProps> = (p) => {
  const today = dayOf(p.now)
  return (
    <>
      <a class="back" href={p.readOnly ? `/ucto/archiv/${p.company.id}` : `/ucto/klienti/${p.company.id}`}>
        {p.company.name}
      </a>
      <header class="phead">
        <Heading first={a.title} second={a.serif} />
        <p class="phead__lead">{a.lead}</p>
      </header>
      <Flash text={p.flash} />
      <Flash text={p.error} tone="error" />
      <div class="pgrid pgrid--wide">
        <div class="pgrid__main">
          <Declaration company={p.company} stored={p.stored} today={today} hidden={p.officer !== true} />
          {p.officer === true ? p.verification : null}
          <Reports readOnly={p.readOnly} company={p.company} reports={p.reports} admin={p.officer === true} today={today} draft={p.draft} />
        </div>
        <aside class="pgrid__side">
          <section class="info"><h2 class="info__title">Riziková skupina</h2>{p.suggested ? <p>{a.suggested(a.levels[p.suggested])}</p> : null}<p>{p.risks[0] ? a.levels[p.risks[0].level] : 'Čaká na potvrdenie určenej osoby.'}</p></section>
        </aside>
      </div>
    </>
  )
}
