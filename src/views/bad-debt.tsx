// The supplier's bad debts of a client (/ucto/klienti/:id/dph/nevymozitelne, bad-debt.ts, § 25a): the issued invoices to
// look at, the corrections made, one invoice's form and correction, and the corrective document to send to the customer.
import type { FC } from 'hono/jsx'
import { formatEurExact } from '../format'
import { textDay } from '../app/booking'
import type { Company, Doc } from '../app/store'
import { periodName } from '../app/vat-store'
import { BAD_DEBT_GROUNDS, type BadDebt, type BadDebtErrors, type BadDebtForm, type BadDebtLine } from '../app/bad-debt'
import { team as t } from '../team/copy'
import { Flash, Heading } from './inside'

const k = t.badDebt

/** One issued invoice as the pages show it: what it comes to and what is left, its corrections and where they stand. */
export interface BadDebtRow {
  doc: Doc
  gross: number
  credited: number
  paid: number
  owed: number
  reminders: number
  remindedOn: string | null
  reduce: BadDebt | null
  restore: BadDebt | null
  /** The lowering's period and the raising's, as the return takes them. */
  reducePeriod: string | null
  restorePeriod: string | null
  /** A payment after the lowering's period that asks for its corrective document, with what it raises. */
  restoreDue: { on: string; cents: number; lines: BadDebtLine[] } | null
  void: boolean
  documented: boolean
  state: string
  /** The deadline of the return the corrective document is sent by. */
  sendBy: string | null
}

const base = (c: Company) => `/ucto/klienti/${c.id}/dph/nevymozitelne`
const pill = (state: string) => (state === 'sent' || state === 'restored' || state === 'none' ? 'pill--ok' : state === 'void' || state === 'restore' ? 'pill--red' : 'pill--amber')
const sum = (lines: readonly BadDebtLine[], key: 'base' | 'vat') => lines.reduce((s, l) => s + l[key], 0)

export const BadDebtsPage: FC<{ company: Company; candidates: BadDebtRow[]; records: BadDebtRow[]; flash: string | null }> = ({ company: c, candidates, records, flash }) => (
  <>
    <a class="back" href={`/ucto/klienti/${c.id}/dph`}>
      {t.vat.title}
    </a>
    <header class="phead">
      <Heading first={k.title} second={c.name} />
      <p class="phead__lead">{k.lead}</p>
    </header>
    <Flash text={flash} />
    {c.vatStatus !== 'payer' ? (
      <section class="info">
        <p class="info__lead">{k.notPayer}</p>
      </section>
    ) : (
      <>
        <section class="info" aria-labelledby="bd-cand-t">
          <h2 id="bd-cand-t" class="info__title">
            {k.candidatesTitle}
          </h2>
          <p class="info__lead">{k.candidatesLead}</p>
          {candidates.length === 0 ? (
            <p class="info__empty">{k.noCandidates}</p>
          ) : (
            <div class="lscroll">
              <table class="ltable">
                <thead>
                  <tr>
                    <th scope="col">{k.cols.invoice}</th>
                    <th scope="col">{k.cols.customer}</th>
                    <th scope="col">{k.cols.due}</th>
                    <th scope="col" class="num">
                      {k.cols.owed}
                    </th>
                    <th scope="col">{k.cols.reminders}</th>
                  </tr>
                </thead>
                <tbody>
                  {candidates.map((r) => (
                    <tr>
                      <td>
                        <a href={`${base(c)}/${r.doc.id}`} aria-label={`${k.assess}: ${r.doc.number ?? ''}`}>
                          {r.doc.number ?? k.assess}
                        </a>
                      </td>
                      <td>{r.doc.party ?? ''}</td>
                      <td>{r.doc.dueOn ? textDay(r.doc.dueOn) : ''}</td>
                      <td class="num">{formatEurExact(r.owed)}</td>
                      <td>{r.reminders > 0 ? k.reminders(r.reminders) : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        <section class="info" aria-labelledby="bd-rec-t">
          <h2 id="bd-rec-t" class="info__title">
            {k.recordsTitle}
          </h2>
          {records.length === 0 ? (
            <p class="info__empty">{k.noRecords}</p>
          ) : (
            <div class="lscroll">
              <table class="ltable">
                <thead>
                  <tr>
                    <th scope="col">{k.cols.invoice}</th>
                    <th scope="col">{k.cols.customer}</th>
                    <th scope="col">{k.cols.period}</th>
                    <th scope="col" class="num">
                      {k.cols.vat}
                    </th>
                    <th scope="col">{k.cols.state}</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((r) => (
                    <tr>
                      <td>
                        <a href={`${base(c)}/${r.doc.id}`} aria-label={`${k.detail}: ${r.doc.number ?? ''}`}>
                          {r.doc.number ?? k.detail}
                        </a>
                      </td>
                      <td>{r.doc.party ?? ''}</td>
                      <td>{r.reducePeriod ? periodName(r.reducePeriod) : ''}</td>
                      <td class="num">{formatEurExact(-sum(r.reduce?.lines ?? [], 'vat'))}</td>
                      <td>
                        <span class={`pill ${pill(r.state)}`}>{k.state[r.state] ?? ''}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </>
    )}
  </>
)

const Lines: FC<{ lines: readonly BadDebtLine[]; sign: number }> = ({ lines, sign }) => (
  <div class="lscroll">
    <table class="ltable">
      <thead>
        <tr>
          <th scope="col">{k.sheet.rate}</th>
          <th scope="col" class="num">
            {k.sheet.base}
          </th>
          <th scope="col" class="num">
            {k.sheet.vat}
          </th>
        </tr>
      </thead>
      <tbody>
        {lines.map((l) => (
          <tr>
            <td>{l.rate} %</td>
            <td class="num">{formatEurExact(sign * l.base)}</td>
            <td class="num">{formatEurExact(sign * l.vat)}</td>
          </tr>
        ))}
        <tr>
          <th scope="row">{k.sheet.total}</th>
          <td class="num">{formatEurExact(sign * sum(lines, 'base'))}</td>
          <td class="num">{formatEurExact(sign * sum(lines, 'vat'))}</td>
        </tr>
      </tbody>
    </table>
  </div>
)

/** A correction's corrective document, the day it was sent or the form to say so, and taking it back. */
const Correction: FC<{ c: Company; row: BadDebtRow; which: BadDebt; today: string; locked: boolean }> = ({ c, row, which, today, locked }) => {
  const druh = which.kind
  return (
    <>
      {which.number && which.issuedOn ? <p class="info__lead">{k.document(which.number, textDay(which.issuedOn))}</p> : <p class="info__source">{k.noDocument}</p>}
      {which.number ? (
        <>
          <a class="btn btn--line btn--small" href={`${base(c)}/${row.doc.id}/doklad?druh=${druh}`}>
            {k.showDocument}
          </a>
          {which.sentOn ? (
            <p class="info__source">{k.sentOn(textDay(which.sentOn))}</p>
          ) : (
            <>
              {row.sendBy && druh === 'reduce' ? <p class="flag">{today > row.sendBy ? k.lateFlag(textDay(row.sendBy)) : k.sendBy(textDay(row.sendBy))}</p> : null}
              <form class="stack" method="post" action={`${base(c)}/${row.doc.id}/odoslane`}>
                <input type="hidden" name="zaznam" value={which.id} />
                <label class="field__label" for={`bd-sent-${druh}`}>
                  {k.sentLabel}
                </label>
                <input id={`bd-sent-${druh}`} class="field__input" name="den" value={textDay(today)} maxlength={12} />
                <button class="btn btn--blue stack__submit" type="submit">
                  {k.sentSubmit}
                </button>
              </form>
            </>
          )}
        </>
      ) : null}
      {locked ? null : (
        <form method="post" action={`${base(c)}/${row.doc.id}/zrusit`}>
          <input type="hidden" name="zaznam" value={which.id} />
          <button class="btn btn--text" type="submit">
            {k.remove}
          </button>
        </form>
      )}
    </>
  )
}

export const BadDebtPage: FC<{
  company: Company
  row: BadDebtRow
  today: string
  after: string | null
  threeYears: string | null
  locked: boolean
  values?: BadDebtForm
  errors?: BadDebtErrors
  flash: string | null
}> = ({ company: c, row, today, after, threeYears, locked, values, errors, flash }) => {
  const d = row.doc
  const v: BadDebtForm = values ?? {
    ground: '',
    day: row.remindedOn ? textDay(row.remindedOn) : '',
    amount: '',
    evidence: row.reminders > 0 && row.remindedOn ? k.evidenceReminder(row.reminders, textDay(row.remindedOn)) : '',
    confirm: false,
  }
  return (
    <>
      <a class="back" href={base(c)}>
        {k.title}
      </a>
      <header class="phead">
        <Heading first={`${k.facts.invoice} ${d.number ?? ''}`} second={c.name} />
        <p class="phead__lead">{k.lead}</p>
      </header>
      <Flash text={flash} />
      <div class="pgrid">
        <div class="pgrid__main">
          {row.reduce ? (
            <section class="info" aria-labelledby="bd-red-t">
              <h2 id="bd-red-t" class="info__title">
                {k.formTitle}
              </h2>
              <p class="info__lead">{row.reducePeriod ? k.reduced(periodName(row.reducePeriod)) : ''}</p>
              {row.reduce.ground ? <p class="info__source">{k.groundOf(k.grounds[row.reduce.ground] ?? '')}</p> : null}
              {row.reduce.evidence ? <p class="info__source">{k.evidenceOf(row.reduce.evidence)}</p> : null}
              <Lines lines={row.reduce.lines} sign={-1} />
              {row.void ? <p class="flag">{k.paidVoid}</p> : null}
              <Correction c={c} row={row} which={row.reduce} today={today} locked={locked} />
            </section>
          ) : (
            <section class="info" aria-labelledby="bd-form-t">
              <h2 id="bd-form-t" class="info__title">
                {k.formTitle}
              </h2>
              {threeYears ? <p class="flag">{k.threeYears(textDay(threeYears))}</p> : null}
              <form class="stack" method="post" action={`${base(c)}/${d.id}`}>
                <fieldset class="ratio__how">
                  <legend class="field__label">{k.ground}</legend>
                  {BAD_DEBT_GROUNDS.map((g) => (
                    <label class="tickbox">
                      <input type="radio" name="dovod" value={g} checked={v.ground === g} />
                      <span>{k.grounds[g]}</span>
                    </label>
                  ))}
                </fieldset>
                {errors?.ground ? <p class="field__error">{errors.ground}</p> : null}
                <label class="field__label" for="bd-day">
                  {k.day}
                </label>
                <input id="bd-day" class="field__input" name="den" value={v.day} maxlength={12} aria-invalid={errors?.day ? 'true' : undefined} />
                {errors?.day ? <p class="field__error">{errors.day}</p> : <p class="field__hint">{k.dayHint}</p>}
                <label class="field__label" for="bd-amount">
                  {k.amount}
                </label>
                <input id="bd-amount" class="field__input" name="suma" value={v.amount} maxlength={14} inputmode="decimal" aria-invalid={errors?.amount ? 'true' : undefined} />
                {errors?.amount ? <p class="field__error">{errors.amount}</p> : <p class="field__hint">{k.amountHint(formatEurExact(row.owed))}</p>}
                <label class="field__label" for="bd-evidence">
                  {k.evidence}
                </label>
                <textarea id="bd-evidence" class="field__input field__area" name="dokaz" rows={2} maxlength={1000} aria-invalid={errors?.evidence ? 'true' : undefined}>
                  {v.evidence}
                </textarea>
                {errors?.evidence ? <p class="field__error">{errors.evidence}</p> : <p class="field__hint">{k.evidenceHint}</p>}
                <label class="tickbox">
                  <input type="checkbox" name="potvrdenie" value="1" checked={v.confirm} />
                  <span>{k.confirm}</span>
                </label>
                {errors?.confirm ? <p class="field__error">{errors.confirm}</p> : null}
                <button class="btn btn--blue stack__submit" type="submit">
                  {k.submit}
                </button>
              </form>
            </section>
          )}
          {row.reduce && (row.restore || row.restoreDue) ? (
            <section class="info" aria-labelledby="bd-paid-t">
              <h2 id="bd-paid-t" class="info__title">
                {k.paidTitle}
              </h2>
              {row.restoreDue ? <p class="info__lead">{k.paid(textDay(row.restoreDue.on), formatEurExact(row.restoreDue.cents))}</p> : null}
              {row.restorePeriod ? <p class="info__source">{k.restored(periodName(row.restorePeriod))}</p> : null}
              {row.restore ? (
                <>
                  <Lines lines={row.restore.lines} sign={1} />
                  <Correction c={c} row={row} which={row.restore} today={today} locked={locked} />
                </>
              ) : row.restoreDue ? (
                <>
                  <Lines lines={row.restoreDue.lines} sign={1} />
                  <form method="post" action={`${base(c)}/${d.id}/platba`}>
                    <button class="btn btn--blue" type="submit">
                      {k.restore}
                    </button>
                  </form>
                </>
              ) : null}
            </section>
          ) : null}
        </div>
        <aside class="pgrid__side">
          <section class="info" aria-labelledby="bd-facts-t">
            <header class="info__row">
              <h2 id="bd-facts-t" class="info__title">
                {k.facts.invoice} {d.number ?? ''}
              </h2>
              {row.reduce ? <span class={`pill ${pill(row.state)}`}>{k.state[row.state] ?? ''}</span> : null}
            </header>
            <dl class="kv">
              <div>
                <dt>{k.facts.customer}</dt>
                <dd>{d.party ?? ''}</dd>
              </div>
              <div>
                <dt>{k.facts.total}</dt>
                <dd>{formatEurExact(row.gross)}</dd>
              </div>
              <div>
                <dt>{k.facts.due}</dt>
                <dd>{d.dueOn ? textDay(d.dueOn) : ''}</dd>
              </div>
              {after ? (
                <div>
                  <dt>{k.facts.after}</dt>
                  <dd>{textDay(after)}</dd>
                </div>
              ) : null}
              {row.credited !== 0 ? (
                <div>
                  <dt>{k.facts.credited}</dt>
                  <dd>{formatEurExact(row.credited)}</dd>
                </div>
              ) : null}
              <div>
                <dt>{k.facts.paid}</dt>
                <dd>{formatEurExact(row.paid)}</dd>
              </div>
              <div class="kv__strong">
                <dt>{k.facts.owed}</dt>
                <dd>{formatEurExact(row.owed)}</dd>
              </div>
            </dl>
            {row.reminders > 0 ? <p class="info__source">{k.reminders(row.reminders)}</p> : null}
          </section>
        </aside>
      </div>
    </>
  )
}

export interface SheetParty {
  name: string
  ico: string | null
  dic: string | null
  icdph: string | null
  address: string | null
}

/** The corrective document of § 25a(9) or (10), as the customer gets it. */
export const BadDebtSheet: FC<{ company: Company; row: BadDebtRow; which: BadDebt; reduce: BadDebt; customer: SheetParty; today: string }> = ({ company: c, row, which, reduce, customer, today }) => {
  const restore = which.kind === 'restore'
  const sign = restore ? 1 : -1
  const supplier: SheetParty = { name: c.name, ico: c.ico, dic: c.dic, icdph: c.icdph, address: c.address }
  const Party: FC<{ title: string; p: SheetParty }> = ({ title, p }) => (
    <div>
      <h2 class="info__title">{title}</h2>
      <p class="info__lead">
        <strong>{p.name}</strong>
      </p>
      <p class="info__source">{p.address ?? k.sheet.addressBlank}</p>
      <p class="info__source">{[p.ico ? `${k.sheet.ico} ${p.ico}` : null, p.dic ? `${k.sheet.dic} ${p.dic}` : null, p.icdph ? `${k.sheet.icdph} ${p.icdph}` : null].filter(Boolean).join(' · ')}</p>
    </div>
  )
  return (
    <>
      <a class="back" href={`${base(c)}/${row.doc.id}`}>
        {`${k.facts.invoice} ${row.doc.number ?? ''}`}
      </a>
      <article class="info wsheet">
        <header class="info__row">
          <h1 class="info__title">
            {k.sheet.title} {which.number ?? ''}
          </h1>
        </header>
        <p class="info__lead">
          <strong>{k.sheet.basis}</strong>
        </p>
        {restore && reduce.number && reduce.issuedOn ? <p class="info__source">{k.sheet.restoreLead(reduce.number, textDay(reduce.issuedOn))}</p> : null}
        <dl class="kv">
          <div>
            <dt>{k.sheet.number}</dt>
            <dd>{which.number ?? ''}</dd>
          </div>
          <div>
            <dt>{k.sheet.issued}</dt>
            <dd>{which.issuedOn ? textDay(which.issuedOn) : ''}</dd>
          </div>
          <div>
            <dt>{k.sheet.invoice}</dt>
            <dd>{row.doc.number ?? ''}</dd>
          </div>
        </dl>
        <Party title={k.sheet.supplier} p={supplier} />
        <Party title={k.sheet.customer} p={customer} />
        <Lines lines={which.lines} sign={sign} />
        {restore ? <p class="info__source">{k.sheet.payment(formatEurExact(which.cents), textDay(which.eventOn), formatEurExact(sum(which.lines, 'vat')))}</p> : null}
        <p class="info__source wsheet__print">
          {k.sheet.print} · {textDay(today)}
        </p>
      </article>
    </>
  )
}
