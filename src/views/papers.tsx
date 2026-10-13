// The papers a new client signs: the power of attorney for us (plná moc), and the notice to the former accountant
// with the request to hand over the books. Each is a sheet to save as a PDF or to print, as an invoice is, with what
// to do beside it. The company's own data fill them in; what we do not know stays a line to write on.
import type { FC } from 'hono/jsx'
import { OPERATOR } from '../config'
import { app, dayName } from '../app/copy'
import type { Company } from '../app/store'
import type { Paper, PoaState } from '../app/papers'
import { formatIco } from '../ico'
import { Flash, Heading } from './inside'
import { whenName } from './inside-pages'

const p = app.poa
const s = app.switching

/** "zapísaná v Obchodnom registri Mestského súdu Košice, oddiel Sro, vložka č. 58123/V". */
function registeredIn(line: string): string {
  return /^Obchodný register\b/.test(line) ? `zapísaná v ${line.replace(/^Obchodný register\b/, 'Obchodnom registri')}` : `zapísaná: ${line}`
}

/** A line to write on, where we do not know what goes there. */
const Blank: FC<{ wide?: boolean }> = ({ wide }) => (
  <span class={`deed__blank${wide ? ' deed__blank--wide' : ''}`}>
    <span class="sr">doplniť</span>
  </span>
)

/** A party of a deed or a letter, as one sentence: name, seat, IČO, register, who acts for it. */
const PartyLine: FC<{ name: string; address: string | null; ico: string | null; register: string | null; director: string | null; tail?: string }> = ({ name, address, ico, register, director, tail }) => (
  <p class="deed__party">
    <strong class="deed__name">{name}</strong>, {p.sheet.seat} {address ?? <Blank wide />}, {p.sheet.ico} {ico ? formatIco(ico) : <Blank />}
    {register ? `, ${registeredIn(register)}` : ''}, {p.sheet.acting} {director ?? <Blank wide />}, {p.sheet.director}
    {tail ? (tail.startsWith('(') ? ` ${tail}` : `, ${tail}`) : ''}
  </p>
)

const Sign: FC<{ label: string; name: string | null; of: string }> = ({ label, name, of }) => (
  <div class="deed__sign">
    <span class="deed__signlabel">{label}</span>
    <span class="deed__line" aria-hidden="true" />
    <span class="deed__signname">{name ? `${name}, ${p.sheet.director}` : <Blank wide />}</span>
    <span class="deed__signof">{of}</span>
  </div>
)

/** The power of attorney as paper. The director is the one who concluded the contract, else a line to write on. */
export const PoaSheet: FC<{ company: Company }> = ({ company }) => {
  const sh = p.sheet
  return (
    <article class="sheet deed" aria-label={sh.title}>
      <h2 class="deed__title">{sh.title}</h2>
      <section class="deed__block">
        <p class="deed__label">{sh.principal}</p>
        <PartyLine name={company.name} address={company.address} ico={company.ico} register={company.registerLine} director={company.signedBy} tail={sh.principalTail} />
      </section>
      <p class="deed__grants">{sh.grants}</p>
      <section class="deed__block">
        <p class="deed__label">{sh.agent}</p>
        <PartyLine
          name={OPERATOR.name}
          address={`${OPERATOR.street}, ${OPERATOR.postalCity}`}
          ico={OPERATOR.companyId.replace(/\s/g, '')}
          register={OPERATOR.register}
          director="Christian Juhás"
          tail={sh.agentTail}
        />
      </section>
      <section class="deed__block">
        <p>{sh.scopeLead}</p>
        <ol class="deed__list">
          {sh.scope.map((item) => (
            <li>{item}</li>
          ))}
        </ol>
      </section>
      <p>{sh.substitute}</p>
      <p>{sh.term}</p>
      <p class="deed__place">
        {sh.place} <Blank /> {sh.on} <Blank />
      </p>
      <div class="deed__signs">
        <Sign label={sh.principalSign} name={company.signedBy} of={company.name} />
        <Sign label={sh.accept} name="Christian Juhás" of={OPERATOR.name} />
      </div>
    </article>
  )
}

const PILL: Record<PoaState, string> = { missing: 'pill--amber', waiting: 'pill--blue', checked: 'pill--ok' }

export interface PoaPageProps {
  company: Company
  papers: Paper[]
  state: PoaState
  today: string
  now: number
  flash?: string | null
  error?: string | null
}

export const PoaPage: FC<PoaPageProps> = ({ company, papers, state, today, now, flash, error }) => (
  <>
    <header class="phead phead--row">
      <div>
        <Heading first={p.title} second={p.serif} />
        <p class="phead__lead">{p.lead}</p>
      </div>
      <span class={`pill ${PILL[state]} phead__aside`}>{p.state[state]}</span>
    </header>
    <Flash text={flash} />
    <Flash text={error} tone="error" />
    <div class="invoice invoice--side-first">
      <div class="invoice__paper">
        <PoaSheet company={company} />
      </div>
      <aside class="invoice__side">
        <section class={`info poastate poastate--${state}`} aria-live="polite">
          <p class="poastate__text">{p.stateLead[state]}</p>
        </section>
        {state === 'checked' ? null : (
          <section class="info" aria-labelledby="podpis-t">
            <h2 id="podpis-t" class="info__title">
              {p.howTitle}
            </h2>
            <ol class="steps">
              {p.how.map((step) => (
                <li>{step}</li>
              ))}
            </ol>
            <button class="btn btn--line invoice__wide" type="button" data-print hidden>
              {p.print}
            </button>
          </section>
        )}
        <section class="info" id="nahrat" aria-labelledby="nahrat-t">
          <h2 id="nahrat-t" class="info__title">
            {p.uploadTitle}
          </h2>
          <p class="info__lead">{p.uploadLead}</p>
          <form class="bankfile__form poa__form" method="post" action="/app/plna-moc" enctype="multipart/form-data" data-upload>
            <label class={`btn ${state === 'missing' ? 'btn--blue' : 'btn--line'}`} for="plna-moc-file">
              {p.upload}
            </label>
            <input id="plna-moc-file" class="add__file" type="file" name="file" accept=".asice,.asics,.pdf,application/pdf,image/jpeg,image/png,image/webp" />
            <button class="btn btn--line add__send" type="submit">
              {p.send}
            </button>
          </form>
          {papers.length > 0 ? (
            <>
              <p class="poa__files">{p.files}</p>
              <ul class="plain">
                {papers.map((paper) => (
                  <li class="plain__row plain__row--two">
                    <a class="link plain__name" href={`/app/plna-moc/${paper.id}`}>
                      {paper.fileName}
                    </a>
                    <span class="plain__sub">
                      <span>{p.added(whenName(paper.createdAt, now), paper.createdByName)}</span>
                      <span>{paper.checkedAt ? p.checkedBy(dayName(new Date(paper.checkedAt * 1000).toISOString().slice(0, 10), today), paper.checkedByName) : p.waits}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </section>
        {state === 'checked' ? null : (
          <section class="info" aria-labelledby="papier-t">
            <h2 id="papier-t" class="info__title">
              {p.paperTitle}
            </h2>
            <p class="info__lead">{p.paperLead(`${OPERATOR.name}, ${OPERATOR.street}, ${OPERATOR.postalCity}`)}</p>
          </section>
        )}
      </aside>
    </div>
  </>
)

// ---------------------------------------------------------------------------------------------------------------
// The notice to the former accountant
// ---------------------------------------------------------------------------------------------------------------

export interface SwitchValues {
  to: string
  toAddress: string
  since: string
  until: string
}

/** The letter, with what the client typed in its place, or lines to write on. */
export const LetterSheet: FC<{ company: Company; values: SwitchValues; since: string | null; until: string | null; startOn: string | null }> = ({ company, values, since, until, startOn }) => {
  const l = s.letter
  return (
    <article class="sheet deed deed--letter" aria-label={l.subject}>
      <div class="deed__parties">
        <div class="deed__party">
          <p class="deed__label">{l.from}</p>
          <p>
            <strong class="deed__name">{company.name}</strong>
          </p>
          <p>{company.address ?? <Blank wide />}</p>
          <p>
            {p.sheet.ico} {company.ico ? formatIco(company.ico) : <Blank />}
          </p>
        </div>
        <div class="deed__party deed__party--to">
          <p class="deed__label">{l.to}</p>
          <p>{values.to ? <strong class="deed__name">{values.to}</strong> : <Blank wide />}</p>
          <p>{values.toAddress ? values.toAddress : <Blank wide />}</p>
        </div>
      </div>
      <p class="deed__place deed__place--right">
        {p.sheet.place} <Blank /> {p.sheet.on} <Blank />
      </p>
      <h2 class="deed__subject">{l.subject}</h2>
      <p>{l.hello}</p>
      <p>{l.notice(since, until)}</p>
      <p>{l.next(startOn ? dayName(startOn) : null)}</p>
      <ol class="deed__list">
        {l.list.map((item) => (
          <li>{item}</li>
        ))}
      </ol>
      <p>{l.electronic}</p>
      <p>{l.revoke}</p>
      <p>{l.thanks}</p>
      <div class="deed__signs deed__signs--one">
        <Sign label={l.sign} name={company.signedBy} of={company.name} />
      </div>
    </article>
  )
}

export interface SwitchPageProps {
  company: Company
  values: SwitchValues
  since: string | null
  until: string | null
  errors: { since?: string; until?: string }
}

export const SwitchPage: FC<SwitchPageProps> = ({ company, values, since, until, errors }) => (
  <>
    <header class="phead">
      <Heading first={s.title} second={s.serif} />
      <p class="phead__lead">{s.lead}</p>
    </header>
    <div class="invoice invoice--side-first">
      <div class="invoice__paper">
        <LetterSheet company={company} values={values} since={since} until={until} startOn={company.startOn} />
      </div>
      <aside class="invoice__side">
        <section class="info" aria-labelledby="doplnit-t">
          <h2 id="doplnit-t" class="info__title">
            {s.formTitle}
          </h2>
          <form class="stack" method="get" action="/app/prechod" novalidate>
            <label class="field__label" for="p-komu">
              {s.to}
            </label>
            <input id="p-komu" class="field__input" name="komu" value={values.to} maxlength={120} autocomplete="off" />
            <label class="field__label" for="p-adresa">
              {s.toAddress}
            </label>
            <input id="p-adresa" class="field__input" name="adresa" value={values.toAddress} maxlength={160} autocomplete="off" />
            <label class="field__label" for="p-od">
              {s.since}
            </label>
            <input id="p-od" class="field__input" name="od" value={values.since} maxlength={20} inputmode="numeric" placeholder="1. 3. 2025" aria-invalid={errors.since ? 'true' : undefined} />
            {errors.since ? <p class="field__error">{errors.since}</p> : null}
            <label class="field__label" for="p-do">
              {s.until}
            </label>
            <input id="p-do" class="field__input" name="do" value={values.until} maxlength={20} inputmode="numeric" placeholder="31. 12. 2026" aria-invalid={errors.until ? 'true' : undefined} />
            {errors.until ? <p class="field__error">{errors.until}</p> : <p class="field__hint">{s.untilHint}</p>}
            <button class="btn btn--line" type="submit">
              {s.fill}
            </button>
          </form>
          <button class="btn btn--blue invoice__wide" type="button" data-print hidden>
            {s.print}
          </button>
        </section>
        <section class="info" aria-labelledby="dalej-t">
          <h2 id="dalej-t" class="info__title">
            {s.stepsTitle}
          </h2>
          <ol class="steps">
            {s.steps.map((step) => (
              <li>{step}</li>
            ))}
          </ol>
          <p class="info__source">
            <a class="link" href="/app/spravy">
              {app.home.write}
            </a>
          </p>
        </section>
      </aside>
    </div>
  </>
)

