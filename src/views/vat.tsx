// The team's VAT page of a client: the return and the control statement of one period as the books give them, what
// keeps them from being filed (each with the document to open), the files the Financial Administration takes, and the
// mark that they were filed, which sends the client what to pay. vat.ts works it all out; nothing here computes.
import type { FC } from 'hono/jsx'
import { formatEurExact } from '../format'
import { dayName, dayShort, readableName } from '../app/copy'
import { textDay } from '../app/booking'
import type { Company, Doc, User } from '../app/store'
import { ROWS, correctionKind, outcome, periodRange, type Issue, type IssueCode, type VatMode } from '../app/vat'
import { FORM_RATES, type FormRate, type VatErrorCode, type VatErrors, type VatValues } from '../app/vat-form'
import { payable, periodName, type FilingPlan, type PeriodState, type PeriodView } from '../app/vat-store'
import { team as t } from '../team/copy'
import { Flash, Heading } from './inside'

const v = t.vat

const STATE_PILL: Record<PeriodState, string> = { filed: 'pill--ok', changed: 'pill--amber', running: 'pill--grey', blocked: 'pill--amber', ready: 'pill--blue', none: 'pill--grey' }

/** "03", "01a": a row as the form numbers it. */
const rowNo = (row: string) => row.slice(1)

/** A document in one line: who, its number, its day and its amount. */
export function docLine(d: Doc): string {
  const who = d.party ? readableName(d.party) : t.book.kinds[d.kind ?? 'other']
  const parts = [who, d.number, d.issuedOn ? dayShort(d.issuedOn) : null, d.totalCents !== null ? formatEurExact(d.totalCents) : null]
  return parts.filter(Boolean).join(', ')
}

const DocLinks: FC<{ ids: string[]; docs: Map<string, Doc> }> = ({ ids, docs }) => {
  const shown = ids.slice(0, 30)
  return (
    <ul class="vdocs">
      {shown.map((id) => {
        const d = docs.get(id)
        return (
          <li>
            <a class="link" href={`/ucto/doklady/${id}`}>
              {d ? docLine(d) : id}
            </a>
          </li>
        )
      })}
      {ids.length > shown.length ? <li class="vdocs__more">{v.more(ids.length - shown.length)}</li> : null}
    </ul>
  )
}

/** The result in a line: what is paid, what comes back, or that nothing does. */
export function resultLine(company: Company, view: PeriodView): string {
  const { pay, refund } = outcome(view.result.rows)
  if (company.vatStatus === 'payer' && view.result.nothing) return v.nothing
  if (company.vatStatus === 'reg7a' && view.result.nothing) return v.nothing7a
  if (refund > 0) return v.toRefund(formatEurExact(refund))
  if (pay > 0) return v.toPay(formatEurExact(pay))
  return v.zero
}

const Issues: FC<{ company: Company; view: PeriodView; docs: Map<string, Doc> }> = ({ company, view, docs }) => {
  const blocks = view.result.issues.filter((i) => i.level === 'block')
  const warns = view.result.issues.filter((i) => i.level === 'warn')
  const first = view.companyIssues.length > 0 || blocks.length > 0 || view.previous !== null
  if (!first && warns.length === 0) return null
  const one = (i: Issue) => {
    const d = i.doc ? docs.get(i.doc) : undefined
    return (
      <li class={`vissue vissue--${i.level}`}>
        <span class="vissue__text">
          {d ? <span class="vissue__doc">{docLine(d)}</span> : null}
          <span>{v.issue[i.code as IssueCode]}</span>
        </span>
        {i.doc ? (
          <a class="btn btn--line btn--small" href={`/ucto/doklady/${i.doc}`}>
            {v.open}
          </a>
        ) : null}
      </li>
    )
  }
  return (
    <section class="info" id="vyriesit" aria-labelledby="vyriesit-t">
      {first ? (
        <>
          <h2 id="vyriesit-t" class="info__title">
            {v.issues}
          </h2>
          <ul class="vissues">
            {view.previous ? (
              <li class="vissue vissue--block">
                <span class="vissue__text">{v.previous(periodName(view.previous))}</span>
                <a class="btn btn--line btn--small" href={`/ucto/klienti/${company.id}/dph?obdobie=${view.previous}`}>
                  {v.previousOpen}
                </a>
              </li>
            ) : null}
            {view.companyIssues.map((code) => (
              <li class="vissue vissue--block">
                <span class="vissue__text">{v.company[code]}</span>
                <a class="btn btn--line btn--small" href={`/ucto/klienti/${company.id}#udaje`}>
                  {v.fix}
                </a>
              </li>
            ))}
            {blocks.map(one)}
          </ul>
        </>
      ) : null}
      {warns.length > 0 ? (
        <>
          <h2 class="info__title" id={first ? undefined : 'vyriesit-t'}>
            {v.warnings}
          </h2>
          <ul class="vissues">{warns.map(one)}</ul>
        </>
      ) : null}
    </section>
  )
}

const RowsCard: FC<{ view: PeriodView; docs: Map<string, Doc> }> = ({ view, docs }) => {
  const rows = ROWS.filter((row) => view.result.rows[row] !== 0)
  return (
    <section class="info" id="riadky" aria-labelledby="riadky-t">
      <h2 id="riadky-t" class="info__title">
        {v.rows}
      </h2>
      {rows.length === 0 ? (
        <p class="info__empty">{v.nothing}</p>
      ) : (
        <table class="vrows">
          <thead>
            <tr>
              <th scope="col">{v.row}</th>
              <th scope="col">
                <span class="sr">{v.rows}</span>
              </th>
              <th scope="col" class="vrows__amount">
                {t.book.amount}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const ids = [...(view.result.sources.get(row) ?? [])]
              const changed = view.changed.includes(row)
              return (
                <tr class={changed ? 'vrows__changed' : undefined}>
                  <td class="vrows__no">{rowNo(row)}</td>
                  <td class="vrows__what">
                    <span>{v.rowLabels[row] ?? row}</span>
                    {ids.length > 0 ? (
                      <details class="vrows__docs">
                        <summary>{v.docs(ids.length)}</summary>
                        <DocLinks ids={ids} docs={docs} />
                      </details>
                    ) : null}
                  </td>
                  <td class="vrows__amount">{formatEurExact(view.result.rows[row])}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </section>
  )
}

const KV_PARTS: { key: string; count: (view: PeriodView) => number }[] = [
  { key: 'A1', count: (w) => w.result.kv.a1.length },
  { key: 'B1', count: (w) => w.result.kv.b1.length },
  { key: 'B2', count: (w) => w.result.kv.b2.length },
  { key: 'B3', count: (w) => (w.result.kv.b31 ? 1 : 0) + w.result.kv.b32.length },
  { key: 'C1', count: (w) => w.result.kv.c1.length },
  { key: 'C2', count: (w) => w.result.kv.c2.length },
  { key: 'D2', count: (w) => (w.result.kv.d2 ? 1 : 0) },
]

const StatementCard: FC<{ company: Company; view: PeriodView; docs: Map<string, Doc> }> = ({ company, view, docs }) => {
  const parts = KV_PARTS.map((p) => ({ ...p, lines: p.count(view), ids: [...(view.result.sources.get(p.key) ?? [])] })).filter((p) => p.lines > 0)
  const text = company.vatStatus !== 'payer' ? v.statement7a : !view.result.statement ? (view.result.nothing ? v.statementNil : v.statementGoods) : parts.length === 0 ? v.statementNone : null
  return (
    <section class="info" id="vykaz" aria-labelledby="vykaz-t">
      <h2 id="vykaz-t" class="info__title">
        {v.statement}
      </h2>
      {text ? (
        <p class="info__lead">{text}</p>
      ) : (
        <ul class="plain vkv">
          {parts.map((p) => (
            <li class="plain__row plain__row--two">
              <span class="plain__name">{v.parts[p.key]}</span>
              <span class="plain__sub">
                <span>{v.lines(p.lines)}</span>
              </span>
              <details class="vrows__docs">
                <summary>{v.docs(p.ids.length)}</summary>
                <DocLinks ids={p.ids} docs={docs} />
              </details>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** "+8,20 €" or "-60,00 €": a difference with its sign, as rows 36 and 37 have it. */
const signedEur = (cents: number) => `${cents > 0 ? '+' : ''}${formatEurExact(cents)}`

/**
 * One form for a filing: the choices it takes (the box of § 79(2), and for a supplementary return the day its reason
 * was found and whether the excess deduction filed before has been settled), the files made with them, and the mark
 * that they were filed, sent with the same choices. No script: the files are fetched by GET, the mark is a POST.
 */
const FilingForm: FC<{ company: Company; view: PeriodView; plan: FilingPlan; today: string }> = ({ company, view, plan, today }) => {
  const base = `/ucto/klienti/${company.id}/dph`
  const filed = view.state === 'filed'
  const supplementary = plan.kind === 'D' && plan.returnNeeded && !filed
  return (
    <form class="vfile" method="get" action={`${base}/priznanie.xml`}>
      <input type="hidden" name="obdobie" value={view.period} />
      {plan.fastOffered && !filed ? (
        <fieldset class="noneed__options">
          <legend class="yesno__legend">{v.fastQ}</legend>
          <label class="noneed__option">
            <input type="radio" name="vratit" value="1" checked={plan.fast} />
            <span>
              <span class="noneed__name">{v.fastYes}</span>
              <span class="noneed__hint">{v.fastYesHint}</span>
            </span>
          </label>
          <label class="noneed__option">
            <input type="radio" name="vratit" value="0" checked={!plan.fast} />
            <span>
              <span class="noneed__name">{v.fastNo}</span>
              <span class="noneed__hint">{v.fastNoHint}</span>
            </span>
          </label>
        </fieldset>
      ) : null}
      {supplementary ? (
        <>
          <div class="stack">
            <label class="field__label" for="zistene">
              {v.found}
            </label>
            <input id="zistene" class="field__input" type="text" name="zistene" value={textDay(plan.foundOn ?? today)} inputmode="numeric" autocomplete="off" aria-describedby="zistene-hint" />
            <span class="field__hint" id="zistene-hint">
              {v.foundHint}
            </span>
          </div>
          {plan.askSettled ? (
            <fieldset class="yesno">
              <legend class="yesno__legend">{v.settledQ(periodName(view.period))}</legend>
              <div class="yesno__options">
                <label class="yesno__option">
                  <input type="radio" name="vyrovnany" value="1" checked={plan.settled} />
                  <span>{v.settledYes}</span>
                </label>
                <label class="yesno__option">
                  <input type="radio" name="vyrovnany" value="0" checked={!plan.settled} />
                  <span>{v.settledNo}</span>
                </label>
              </div>
            </fieldset>
          ) : null}
          {plan.settlement ? <p class="info__lead">{v.settlement(signedEur(plan.settlement.r36), plan.settlement.r37 === null ? null : signedEur(plan.settlement.r37))}</p> : null}
        </>
      ) : null}
      <div class="vstatus__files">
        {plan.returnNeeded ? (
          <button class="btn btn--blue" type="submit" formaction={`${base}/priznanie.xml`}>
            {v.downloadKind[plan.kind]}
          </button>
        ) : null}
        {plan.kv ? (
          <button class="btn btn--line" type="submit" formaction={`${base}/kontrolny-vykaz.xml`}>
            {v.downloadKvKind[plan.kv.kind]}
          </button>
        ) : null}
      </div>
      {filed ? null : (
        <div class="stack vfile__mark">
          <p class="info__lead">{plan.replaces ? v.markCorrectionLead : v.markLead}</p>
          <button class="btn btn--line stack__submit" type="submit" formaction={`${base}/podane`} formmethod="post">
            {plan.replaces ? v.markCorrection : v.markFiled}
          </button>
        </div>
      )}
    </form>
  )
}

const StatusCard: FC<{ company: Company; view: PeriodView; plan: FilingPlan | null; today: string }> = ({ company, view, plan, today }) => {
  const base = `/ucto/klienti/${company.id}/dph`
  const blocks = view.companyIssues.length + (view.previous ? 1 : 0) + view.result.issues.filter((i) => i.level === 'block').length
  const { pay } = outcome(view.result.rows)
  const toPay = payable(company, { payCents: pay })
  const changed = view.state === 'changed'
  const kind = correctionKind(view.period, today)
  return (
    <section class="info vstatus" id="stav" aria-labelledby="stav-t">
      <header class="info__row">
        <h2 id="stav-t" class="info__title">
          {periodName(view.period)}
        </h2>
        <span class={`pill ${STATE_PILL[view.state]}`}>{v.state[view.state]}</span>
      </header>
      <dl class="kv">
        <div>
          <dt>{v.registration}</dt>
          <dd>{company.vatStatus === 'payer' ? v.statusPayer(company.vatQuarterly ? 'quarter' : 'month') : t.clients.vat7a}</dd>
        </div>
        <div>
          <dt>{v.deadlineLabel}</dt>
          <dd>{dayName(view.deadline, today)}</dd>
        </div>
        <div>
          <dt>{v.result}</dt>
          <dd>{resultLine(company, view)}</dd>
        </div>
        <div>
          <dt>{v.inPeriod}</dt>
          <dd>{view.result.docs.length}</dd>
        </div>
      </dl>
      {view.filed ? (
        <p class="vstatus__filed">
          <span class="tick tick--green" aria-hidden="true" /> {v.filed(dayName(view.filed.filedOn, today), view.filed.filedByName ?? '', view.filed.kind)}
        </p>
      ) : null}
      {view.result.rows.r34 > 0 ? <p class="info__lead">{v.carried(formatEurExact(view.result.rows.r34))}</p> : null}
      {view.running ? <p class="info__lead">{v.running(dayName(periodRange(view.period).to, today))}</p> : null}
      {view.state === 'none' ? <p class="info__lead">{v.nothing7a}</p> : null}
      {view.state === 'blocked' ? <p class="vstatus__blocked">{v.blocked(blocks)}</p> : null}
      {changed ? (
        <p class="flag">
          {view.changed.length > 0 ? (kind === 'O' ? v.changedO : v.changedD(dayName(plan?.dueOn ?? view.deadline, today))) : kind === 'O' ? v.changedKvO : v.changedKvD}
          {view.changed.length > 0 ? ` ${v.changedRows(view.changed.map(rowNo).join(', '))}` : null}
        </p>
      ) : null}
      {plan ? (
        <FilingForm company={company} view={view} plan={plan} today={today} />
      ) : view.state === 'blocked' ? (
        <p class="info__source">{v.downloadBlocked}</p>
      ) : changed ? (
        <p class="info__source">{v.correctionBlocked}</p>
      ) : null}
      {toPay > 0 && !company.taxAccount && (view.state === 'ready' || view.state === 'filed' || view.state === 'changed') ? <p class="flag">{v.accountMissing}</p> : null}
      {view.filed ? (
        <form method="post" action={`${base}/zrusit`}>
          <input type="hidden" name="obdobie" value={view.period} />
          <button class="btn btn--text" type="submit">
            {view.filed.prev ? v.unmarkCorrection : v.unmark}
          </button>
        </form>
      ) : null}
    </section>
  )
}

export interface VatPageProps {
  user: User
  company: Company
  view: PeriodView
  /** The periods side by side, the oldest first; the selected one among them. */
  strip: PeriodView[]
  /** The documents of the periods shown, by their id. */
  docs: Map<string, Doc>
  /** A company that is not registered: the services it bought from abroad, which call for a registration under § 7a. */
  needs7a: Doc[]
  /** What would be filed now (the files and the mark), or null when nothing can be. */
  plan: FilingPlan | null
  today: string
  flash?: string | null
  error?: string | null
}

export const VatPage: FC<VatPageProps> = (p) => {
  const c = p.company
  const registered = c.vatStatus !== 'none'
  return (
    <>
      <a class="back" href={`/ucto/klienti/${c.id}`}>
        {c.name}
      </a>
      <header class="phead">
        <Heading first={v.title} second={registered ? v.of(periodName(p.view.period)) : undefined} />
        <p class="phead__lead">{registered ? v.lead : v.notRegistered}</p>
      </header>
      <Flash text={p.flash} />
      <Flash text={p.error} tone="error" />
      {registered ? (
        <>
          <nav class="periods" aria-label={v.periods}>
            {p.strip.map((s) => (
              <a class="periods__item" href={`/ucto/klienti/${c.id}/dph?obdobie=${s.period}`} aria-current={s.period === p.view.period ? 'page' : undefined}>
                <span class="periods__name">{periodName(s.period)}</span>
                <span class={`pill ${STATE_PILL[s.state]}`}>{v.state[s.state]}</span>
              </a>
            ))}
          </nav>
          <div class="pgrid pgrid--wide pgrid--side-first">
            <div class="pgrid__main">
              <Issues company={c} view={p.view} docs={p.docs} />
              <RowsCard view={p.view} docs={p.docs} />
              <StatementCard company={c} view={p.view} docs={p.docs} />
              <p class="info__source vnotbuilt">{v.notBuilt}</p>
            </div>
            <aside class="pgrid__side">
              <StatusCard company={c} view={p.view} plan={p.plan} today={p.today} />
            </aside>
          </div>
        </>
      ) : (
        <section class="info" aria-labelledby="sedemA-t">
          <h2 id="sedemA-t" class="info__title">
            {v.needs7aTitle}
          </h2>
          <p class="info__lead">{v.needs7aLead}</p>
          {p.needs7a.length === 0 ? <p class="info__empty">{v.needs7aNone}</p> : <DocLinks ids={p.needs7a.map((d) => d.id)} docs={new Map(p.needs7a.map((d) => [d.id, d]))} />}
        </section>
      )}
    </>
  )
}

/** The client page's card: the period being filed now, where it stands, and the way to it. */
export const VatCard: FC<{ company: Company; view: PeriodView | null; needs7a: number; today: string }> = ({ company, view, needs7a, today }) => {
  if (company.vatStatus === 'none') {
    if (needs7a === 0) return null
    return (
      <section class="info" id="dph" aria-labelledby="dph-t">
        <header class="info__row">
          <h2 id="dph-t" class="info__title">
            {v.needs7aTitle}
          </h2>
          <span class="pill pill--red">{needs7a}</span>
        </header>
        <p class="info__lead">{v.needs7aLead}</p>
        <a class="btn btn--line btn--small" href={`/ucto/klienti/${company.id}/dph`}>
          {v.open}
        </a>
      </section>
    )
  }
  if (!view) return null
  return (
    <section class="info" id="dph" aria-labelledby="dph-t">
      <header class="info__row">
        <h2 id="dph-t" class="info__title">
          {t.client.vatCard} {v.of(periodName(view.period))}
        </h2>
        <span class={`pill ${STATE_PILL[view.state]}`}>{v.state[view.state]}</span>
      </header>
      <p class="info__lead">{resultLine(company, view)}</p>
      {view.state === 'filed' || view.state === 'none' ? null : <p class="info__source">{v.deadline(dayName(view.deadline, today))}</p>}
      <a class="btn btn--line btn--small" href={`/ucto/klienti/${company.id}/dph?obdobie=${view.period}`}>
        {t.client.vatOpen}
      </a>
    </section>
  )
}

// ---------------------------------------------------------------------------------------------------------------
// The booking form's VAT
// ---------------------------------------------------------------------------------------------------------------

/** What the booking form shows about a document's VAT. */
export interface VatForm {
  values: VatValues
  errors: VatErrors
  /** The values are a proposal: saving confirms them. */
  proposed: boolean
  modes: readonly VatMode[]
  /** The periods offered, and the one the dates give. */
  periods: string[]
  natural: string | null
  /** Where the document goes, said in a sentence; and what keeps it from going there. */
  goes: string | null
  issues: IssueCode[]
  sumOff: string | null
  currency: string | null
  /** VAT the company pays itself on the document (from abroad), for the accounting entry. */
  selfVat: { cents: number; deduct: boolean } | null
}

const RATE_LABEL: Record<FormRate, string> = { 23: '23 %', 19: '19 %', 5: '5 %', 0: t.book.vatZero }

export const VatFields: FC<{ form: VatForm }> = ({ form }) => {
  const e = form.errors
  const err = (field: keyof VatErrors) => (e[field] ? t.book.vatErrors[e[field] as VatErrorCode] : null)
  return (
    <fieldset class="vatbox" id="dph">
      <legend class="vatbox__title">{t.book.vatTitle}</legend>
      <input type="hidden" name="dph" value="1" />
      {form.proposed ? <p class="vatbox__note">{t.book.vatProposed}</p> : null}
      <div class="fgrid">
        <div class="fgrid__cell fgrid__cell--wide">
          <label class="field__label" for="b-dph-rezim">
            {t.book.vatMode}
          </label>
          <select id="b-dph-rezim" class="field__input" name="dph_rezim" aria-invalid={e.mode ? 'true' : undefined}>
            {form.modes.map((mode) => (
              <option value={mode} selected={form.values.mode === mode}>
                {t.book.vatModes[mode]}
              </option>
            ))}
          </select>
          {err('mode') ? <p class="field__error">{err('mode')}</p> : null}
        </div>
        <div class="fgrid__cell">
          <label class="field__label" for="b-dph-dodanie">
            {t.book.vatSupplied}
          </label>
          <input id="b-dph-dodanie" class="field__input" name="dph_dodanie" value={form.values.supplied} maxlength={16} aria-invalid={e.supplied ? 'true' : undefined} />
          {err('supplied') ? <p class="field__error">{err('supplied')}</p> : null}
        </div>
        <div class="fgrid__cell">
          <label class="field__label" for="b-dph-icdph">
            {t.book.vatId}
          </label>
          <input id="b-dph-icdph" class="field__input" name="dph_icdph" value={form.values.vatId} maxlength={20} aria-invalid={e.vatId ? 'true' : undefined} />
          {err('vatId') ? <p class="field__error">{err('vatId')}</p> : null}
        </div>
        <div class="fgrid__cell fgrid__cell--wide">
          <label class="field__label" for="b-dph-obdobie">
            {t.book.vatPeriod}
          </label>
          <select id="b-dph-obdobie" class="field__input" name="dph_obdobie" aria-invalid={e.period ? 'true' : undefined}>
            <option value="">{t.book.vatPeriodAuto(form.natural ? periodName(form.natural) : '')}</option>
            {form.periods.map((p) => (
              <option value={p} selected={form.values.period === p}>
                {periodName(p)}
              </option>
            ))}
          </select>
          {err('period') ? <p class="field__error">{err('period')}</p> : null}
        </div>
        <div class="fgrid__cell fgrid__cell--wide">
          <label class="field__label" for="b-dph-opravuje">
            {t.book.vatCorrects}
          </label>
          <input id="b-dph-opravuje" class="field__input" name="dph_opravuje" value={form.values.corrects} maxlength={32} aria-invalid={e.corrects ? 'true' : undefined} />
          {err('corrects') ? <p class="field__error">{err('corrects')}</p> : <p class="field__hint">{t.book.vatCorrectsHint}</p>}
        </div>
      </div>
      <table class="vatlines">
        <thead>
          <tr>
            <th scope="col">{t.book.vatRate}</th>
            <th scope="col">{t.book.vatBase}</th>
            <th scope="col">{t.book.vatTax}</th>
          </tr>
        </thead>
        <tbody>
          {FORM_RATES.map((rate) => (
            <tr>
              <th scope="row">{RATE_LABEL[rate]}</th>
              <td>
                <label class="sr" for={`b-dph-zaklad-${rate}`}>
                  {t.book.vatBase} {RATE_LABEL[rate]}
                </label>
                <input
                  id={`b-dph-zaklad-${rate}`}
                  class="field__input"
                  name={`dph_zaklad_${rate}`}
                  value={form.values.base[rate]}
                  inputmode="decimal"
                  maxlength={16}
                  aria-invalid={e[`base${rate}`] ? 'true' : undefined}
                />
                {err(`base${rate}`) ? <p class="field__error">{err(`base${rate}`)}</p> : null}
              </td>
              <td>
                {rate === 0 ? null : (
                  <>
                    <label class="sr" for={`b-dph-dan-${rate}`}>
                      {t.book.vatTax} {RATE_LABEL[rate]}
                    </label>
                    <input
                      id={`b-dph-dan-${rate}`}
                      class="field__input"
                      name={`dph_dan_${rate}`}
                      value={form.values.tax[rate]}
                      inputmode="decimal"
                      maxlength={16}
                      aria-invalid={e[`tax${rate}`] ? 'true' : undefined}
                    />
                    {err(`tax${rate}`) ? <p class="field__error">{err(`tax${rate}`)}</p> : null}
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {form.currency ? <p class="field__hint">{t.book.vatForeign(form.currency)}</p> : null}
      {form.sumOff ? <p class="vatbox__warn">{form.sumOff}</p> : null}
      {form.issues.map((code) => (
        <p class="vatbox__warn">{v.issue[code]}</p>
      ))}
      {form.goes ? <p class="vatbox__goes">{form.goes}</p> : null}
    </fieldset>
  )
}
