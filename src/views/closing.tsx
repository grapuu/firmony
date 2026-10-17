// The team's closing page of a client (/ucto/klienti/:id/zavierka): a year's financial statements (of a micro entity on
// Úč MUJ, of a small or a large one on Úč POD with each asset's gross, correction and net) and its corporate income tax return as the books give them, what keeps them from being filed (each with where it is
// resolved), the accountant's adjustments, the files the Financial Administration takes, the tax booked, the deadline a
// notice moved, and the mark that it was filed, which sends the client what to pay. closing.ts works it all out.
import type { FC } from 'hono/jsx'
import { DeliveryNotice } from './filings'
import { formatCount, formatEurExact } from '../format'
import { dayName } from '../app/copy'
import { BALANCE_ROWS, ENTITY_SIZES, PROFIT_ROWS, TABLE_A, TABLE_B, extensionDays, type ClosingIssue, type Lines } from '../app/closing'
import { POD_ASSET_ROWS, POD_BALANCE_SUMS, POD_LIABILITY_ROWS, POD_PROFIT_ROWS, POD_PROFIT_SUMS } from '../app/closing-pod'
import { CREDIT_ROWS, LOSS_ROWS, NOTE_TEXT, PLACEMENT_ROWS, type ClosingErrors, type ClosingValues } from '../app/closing-form'
import { noteChecks } from '../app/notes'
import { notesSource } from '../app/closing-store'
import type { ClosingView } from '../app/closing-store'
import type { Company } from '../app/store'
import { team as t } from '../team/copy'
import { bookPath } from './ledger'
import { Flash, Heading } from './inside'

const k = t.closing

export type ClosingState = 'running' | 'blocked' | 'ready' | 'filed' | 'open'

const STATE_PILL: Record<ClosingState, string> = { running: 'pill--grey', blocked: 'pill--amber', ready: 'pill--blue', filed: 'pill--blue', open: 'pill--amber' }
const STATE_NAME: Record<ClosingState, string> = { ...k.state, open: t.deadlines.state.open.vat }

/** Where a year's closing stands: filed, its year running, something to resolve, or ready to be filed. */
export function closingState(view: Pick<ClosingView, 'closing' | 'running' | 'issues'>): ClosingState {
  if (view.closing?.filed) return 'filed'
  if (view.running) return 'running'
  return view.issues.some((i) => i.level === 'block') ? 'blocked' : 'ready'
}

const zavierka = (company: Company, year: number) => `/ucto/klienti/${company.id}/zavierka?rok=${year}`

const daysBetween = (from: string, to: string): number => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000)

const IssueItem: FC<{ issue: ClosingIssue; company: Company; view: ClosingView }> = ({ issue, company, view }) => {
  const base = bookPath(company)
  const y = view.year
  const [text, href, go] = ((): [string, string | null, string | null] => {
    switch (issue.code) {
      case 'start':
        return [k.issue.start, `${base}/pociatocne`, k.go.opening]
      case 'unbooked':
        return [k.issue.unbooked(issue.count), `/ucto/klienti/${company.id}#zauctovat`, k.go.queue]
      case 'payments':
        return [k.issue.payments(issue.count), `${base}?rok=${y}`, k.go.book]
      case 'unrated':
        return [k.issue.unrated(issue.count), `${base}?rok=${y}`, k.go.book]
      case 'foreign':
        return [k.issue.foreign(issue.count), `${base}/interne`, k.go.internal]
      case 'cash':
        return [k.issue.cash, `${base}/interne`, k.go.internal]
      case 'unplaced':
        return [k.issue.unplaced((issue.accounts ?? []).join(', ')), `${base}?rok=${y}&mesiac=12`, k.go.book]
      case 'dic':
        return [k.issue.dic, `/ucto/klienti/${company.id}#udaje`, k.go.details]
      case 'address':
        return [k.issue.address, `/ucto/klienti/${company.id}#udaje`, k.go.details]
      case 'nace':
        return [k.issue.nace, '#upravy', k.go.fix]
      case 'tax':
        return [k.issue.tax(formatEurExact(view.tax.rows.r1050 ?? 0), formatEurExact(view.booked)), null, null]
      case 'stockCount':
        return [k.issue.stockCount(view.stock?.method ?? 'A', view.year), `${base}/sklad`, k.go.stock]
      case 'deferred':
        return [k.issue.deferred(formatEurExact(view.deferred.expense), formatEurExact(view.deferredBooked)), null, null]
      case 'transit':
        return [k.issue.transit, `${base}/ucet/261?rok=${y}&mesiac=12`, k.go.account]
      case 'rounding':
        return [k.issue.rounding(issue.count, view.statements.form === 'pod' ? '073' : '22'), null, null]
      case 'audit':
        return [k.issue.audit(view.year), null, null]
      case 'auditMaybe':
        return [k.issue.auditMaybe, null, null]
    }
  })()
  return (
    <li class={`vissue${issue.level === 'warn' ? ' vissue--warn' : ''}`}>
      <span class="vissue__text">{text}</span>
      {href && go ? (
        <a class="btn btn--line btn--small" href={href}>
          {go}
        </a>
      ) : null}
    </li>
  )
}

const IssuesCard: FC<{ company: Company; view: ClosingView }> = ({ company, view }) => {
  const blocks = view.issues.filter((i) => i.level === 'block')
  const warns = view.issues.filter((i) => i.level === 'warn')
  if (view.issues.length === 0) return null
  return (
    <section class="info" id="vyriesit" aria-labelledby="vyriesit-t">
      {blocks.length > 0 ? (
        <>
          <h2 id="vyriesit-t" class="info__title">
            {k.issues}
          </h2>
          <ul class="vissues">
            {blocks.map((issue) => (
              <IssueItem issue={issue} company={company} view={view} />
            ))}
          </ul>
        </>
      ) : null}
      {warns.length > 0 ? (
        <>
          <h2 class="info__title" id={blocks.length > 0 ? undefined : 'vyriesit-t'}>
            {k.warnings}
          </h2>
          <ul class="vissues">
            {warns.map((issue) => (
              <IssueItem issue={issue} company={company} view={view} />
            ))}
          </ul>
        </>
      ) : null}
    </section>
  )
}

/** The return's rows in their order; those always shown, and the sums set apart. */
const TAX_ORDER = ['r100', 'r110', 'r130', 'r140', 'r150', 'r170', 'r180', 'r200', 'r210', 'r230', 'r250', 'r260', 'r270', 'r280', 'r290', 'r300', 'r400', 'r410', 'r500', 'r560', 'r550', 'r600', 'r810', 'r830', 'r920', 'r1050', 'r1010', 'r1030', 'r1100', 'r1101', 'r1110']
const TAX_ALWAYS = new Set(['r100', 'r400', 'r560', 'r550', 'r600', 'r1050'])
const TAX_SUMS = new Set(['r200', 'r300', 'r400', 'r500', 'r1050', 'r1100', 'r1101'])

const TaxCard: FC<{ view: ClosingView }> = ({ view }) => {
  const r = view.tax.rows
  const shown = TAX_ORDER.filter((row) => TAX_ALWAYS.has(row) || (r[row] ?? 0) !== 0 || (row === 'r1100' && (r.r1101 ?? 0) === 0))
  const next = view.tax.advancesNext
  return (
    <section class="info" id="dan" aria-labelledby="dan-t">
      <h2 id="dan-t" class="info__title">
        {k.taxTitle}
      </h2>
      <table class="vrows">
        <thead>
          <tr>
            <th scope="col">{k.row}</th>
            <th scope="col">
              <span class="sr">{k.taxTitle}</span>
            </th>
            <th scope="col" class="vrows__amount">
              {k.amountCol}
            </th>
          </tr>
        </thead>
        <tbody>
          {shown.map((row) => (
            <tr class={TAX_SUMS.has(row) ? 'vrows__sum' : undefined}>
              <td class="vrows__no">{row.slice(1)}</td>
              <td class="vrows__what">{k.taxRows[row] ?? row}</td>
              <td class="vrows__amount">{row === 'r550' ? k.rate(view.tax.rate) : formatEurExact(r[row] ?? 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {view.input.minimumExempt ? <p class="info__source">{k.minimumExempt}</p> : view.tax.minimumPaid ? <p class="info__source">{k.minimumPaid}</p> : null}
      <p class="info__source">{next.kind === 'none' ? k.advances.none : k.advances[next.kind](formatEurExact(next.each))}</p>
    </section>
  )
}

/** Deferred tax of a small or a large entity: the differences, the rate, the asset and the liability, the year's 592. */
const DeferredCard: FC<{ view: ClosingView }> = ({ view }) => {
  if (view.size === 'micro') return null
  const d = view.deferred
  const rows: [string, string, boolean][] = [
    [k.deferredRows.assetsTaxable, formatEurExact(view.deferredAssets.taxable), false],
    [k.deferredRows.assetsDeductible, formatEurExact(view.deferredAssets.deductible), false],
    [k.deferredRows.taxable, formatEurExact(d.taxable), true],
    [k.deferredRows.deductible, formatEurExact(d.deductible), true],
    [k.deferredRows.rate, k.rate(d.rate), false],
    [k.deferredRows.asset, formatEurExact(d.asset), true],
    [k.deferredRows.liability, formatEurExact(d.liability), true],
    [d.expense >= 0 ? k.deferredRows.expense : k.deferredRows.income, formatEurExact(Math.abs(d.expense)), true],
  ]
  return (
    <section class="info" id="odlozena" aria-labelledby="odlozena-t">
      <h2 id="odlozena-t" class="info__title">
        {k.deferredTitle}
      </h2>
      {d.on ? (
        <table class="vrows">
          <tbody>
            {rows.map(([label, value, sum]) => (
              <tr class={sum ? 'vrows__sum' : undefined}>
                <td class="vrows__what">{label}</td>
                <td class="vrows__amount">{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p class="info__source">{k.deferredOff}</p>
      )}
    </section>
  )
}

/** One amount of the form: its row's number, what it is, the field; "z kníh" while it is the books' proposal. */
const AmountRow: FC<{ name: string; no: string; label: string; values: ClosingValues; errors: ClosingErrors; proposed?: boolean }> = ({ name, no, label, values, errors, proposed }) => (
  <div class="crow">
    <span class="crow__no" aria-hidden="true">
      {no}
    </span>
    <label class="crow__label" for={`z-${name}`}>
      {label}
      {proposed ? <span class="crow__books">{k.fromBooks}</span> : null}
    </label>
    <input id={`z-${name}`} class="field__input" name={name} value={values[name] ?? ''} inputmode="decimal" maxlength={16} autocomplete="off" aria-invalid={errors[name] ? 'true' : undefined} />
    {errors[name] ? <p class="field__error">{k.errors[errors[name] ?? 'amount']}</p> : null}
  </div>
)

const Field: FC<{ name: string; label: string; hint?: string; values: ClosingValues; errors: ClosingErrors; mode?: 'decimal' | 'numeric' | 'text'; max?: number; wide?: boolean }> = (p) => (
  <div class={`fgrid__cell${p.wide ? ' fgrid__cell--wide' : ''}`}>
    <label class="field__label" for={`z-${p.name}`}>
      {p.label}
    </label>
    <input
      id={`z-${p.name}`}
      class="field__input"
      name={p.name}
      value={p.values[p.name] ?? ''}
      inputmode={p.mode ?? 'decimal'}
      maxlength={p.max ?? 16}
      autocomplete="off"
      aria-invalid={p.errors[p.name] ? 'true' : undefined}
      aria-describedby={p.hint && !p.errors[p.name] ? `z-${p.name}-hint` : undefined}
    />
    {p.errors[p.name] ? (
      <p class="field__error">{k.errors[p.errors[p.name] ?? 'amount']}</p>
    ) : p.hint ? (
      <p class="field__hint" id={`z-${p.name}-hint`}>
        {p.hint}
      </p>
    ) : null}
  </div>
)

/** A text of her own for the notes. */
const Area: FC<{ name: string; label: string; hint?: string; values: ClosingValues }> = ({ name, label, hint, values }) => (
  <div class="fgrid__cell fgrid__cell--wide">
    <label class="field__label" for={`z-${name}`}>
      {label}
    </label>
    <textarea id={`z-${name}`} class="field__input field__area" name={name} rows={3} maxlength={NOTE_TEXT} aria-describedby={hint ? `z-${name}-hint` : undefined}>
      {values[name] ?? ''}
    </textarea>
    {hint ? (
      <p class="field__hint" id={`z-${name}-hint`}>
        {hint}
      </p>
    ) : null}
  </div>
)

const Tick: FC<{ name: string; label: string; values: ClosingValues; hint?: string }> = ({ name, label, values, hint }) => (
  <div class="fgrid__cell fgrid__cell--wide">
    <label class="tickbox">
      <input type="checkbox" name={name} value="1" checked={values[name] === '1'} />
      <span>{label}</span>
    </label>
    {hint ? <p class="field__hint">{hint}</p> : null}
  </div>
)

/** Rows of years before (losses, minimum taxes to credit): the year, the amount, what was used of it before. */
const PastRows: FC<{ prefix: string; rows: number; labels: [string, string, string]; values: ClosingValues; errors: ClosingErrors }> = ({ prefix, rows, labels, values, errors }) => (
  <div class="cpast">
    <span class="cpast__head" aria-hidden="true">
      {labels[0]}
    </span>
    <span class="cpast__head" aria-hidden="true">
      {labels[1]}
    </span>
    <span class="cpast__head" aria-hidden="true">
      {labels[2]}
    </span>
    {Array.from({ length: rows }, (_, i) =>
      (['rok', 'suma', 'pred'] as const).map((part, j) => {
        const name = `${prefix}_${part}_${i}`
        return (
          <div class="cpast__cell">
            <label class="sr" for={`z-${name}`}>
              {labels[j]} {i + 1}
            </label>
            <input
              id={`z-${name}`}
              class="field__input"
              name={name}
              value={values[name] ?? ''}
              inputmode={part === 'rok' ? 'numeric' : 'decimal'}
              maxlength={part === 'rok' ? 4 : 16}
              autocomplete="off"
              aria-invalid={errors[name] ? 'true' : undefined}
            />
            {errors[name] ? <p class="field__error">{k.errors[errors[name] ?? 'amount']}</p> : null}
          </div>
        )
      }),
    )}
  </div>
)

/** A part of the form seldom needed, folded unless it holds anything (or something in it is wrong). */
const More: FC<{ title: string; names: string[]; values: ClosingValues; errors: ClosingErrors; filed: boolean; children?: unknown }> = ({ title, names, values, errors, filed, children }) => (
  <details class="cform__more" open={names.some((n) => (values[n] ?? '') !== '' || errors[n] !== undefined)}>
    <summary class="cform__title">{title}</summary>
    <fieldset class="cform__section" disabled={filed}>
      <legend class="sr">{title}</legend>
      {children as never}
    </fieldset>
  </details>
)

const pastNames = (prefix: string, rows: number): string[] => Array.from({ length: rows }, (_, i) => [`${prefix}_rok_${i}`, `${prefix}_suma_${i}`, `${prefix}_pred_${i}`]).flat()
const placementNames = Array.from({ length: PLACEMENT_ROWS }, (_, i) => [`ucet_${i}`, `riadok_${i}`]).flat()

const FormCard: FC<{ company: Company; view: ClosingView; values: ClosingValues; errors: ClosingErrors }> = ({ company, view, values, errors }) => {
  const inputs = view.inputs
  const p = view.proposal
  const filed = Boolean(view.closing?.filed)
  const UP = ['r110', 'r140', 'r170', 'r180'] as const
  const DOWN = ['r210', 'r230', 'r260', 'r270', 'r280', 'r290'] as const
  return (
    <section class="info" id="upravy" aria-labelledby="upravy-t">
      <h2 id="upravy-t" class="info__title">
        {k.formTitle}
      </h2>
      <p class="info__lead">{k.formLead}</p>
      <form class="cform" method="post" action={`/ucto/klienti/${company.id}/zavierka`} novalidate>
        <input type="hidden" name="rok" value={String(view.year)} />
        <More title={k.sections.placements} names={placementNames} values={values} errors={errors} filed={filed}>
          <p class="field__hint">{k.placementsLead}</p>
          <div class="cplace">
            <span class="cpast__head" aria-hidden="true">
              {k.placementAccount}
            </span>
            <span class="cpast__head" aria-hidden="true">
              {k.placementRow}
            </span>
            {Array.from({ length: PLACEMENT_ROWS }, (_, i) =>
              (['ucet', 'riadok'] as const).map((part, j) => {
                const name = `${part}_${i}`
                return (
                  <div class="cpast__cell">
                    <label class="sr" for={`z-${name}`}>
                      {j === 0 ? k.placementAccount : k.placementRow} {i + 1}
                    </label>
                    <input
                      id={`z-${name}`}
                      class="field__input"
                      name={name}
                      value={values[name] ?? ''}
                      inputmode={part === 'riadok' ? 'numeric' : 'decimal'}
                      maxlength={part === 'riadok' ? 5 : 10}
                      autocomplete="off"
                      aria-invalid={errors[name] ? 'true' : undefined}
                    />
                    {errors[name] ? <p class="field__error">{k.errors[errors[name] ?? 'amount']}</p> : null}
                  </div>
                )
              }),
            )}
          </div>
        </More>
        {view.size === 'micro' ? null : (
          <More title={k.sections.deferred} names={['odlozena', 'od_zdanitelne', 'od_straty']} values={values} errors={errors} filed={filed}>
            <div class="fgrid">
              <Tick name="odlozena" label={k.deferredTick} hint={k.deferredHint(view.found.deferred ?? false)} values={values} />
              <Field name="od_zdanitelne" label={k.deferredTaxable} hint={k.deferredTaxableHint} values={values} errors={errors} wide />
              <Field name="od_odpocitatelne" label={k.deferredDeductible} hint={k.deferredDeductibleHint} values={values} errors={errors} wide />
              <Tick name="od_straty" label={k.deferredLosses} hint={k.deferredLossesHint} values={values} />
            </div>
          </More>
        )}
        <More title={k.sections.a} names={[...TABLE_A]} values={values} errors={errors} filed={filed}>
          {TABLE_A.map((row, i) => (
            <AmountRow name={row} no={String(i + 1)} label={k.tableA[row] ?? row} values={values} errors={errors} proposed={inputs.tableA[row] === undefined && (p.tableA[row] ?? 0) > 0} />
          ))}
        </More>
        <More title={k.sections.b} names={[...TABLE_B]} values={values} errors={errors} filed={filed}>
          <p class="field__hint">{k.tableBHint}</p>
          {TABLE_B.map((row, i) => (
            <AmountRow name={row} no={String(i + 1)} label={k.tableB[row] ?? row} values={values} errors={errors} proposed={inputs.tableB[row] === undefined && (p.tableB[row] ?? 0) > 0} />
          ))}
        </More>
        <More title={k.sections.up} names={[...UP]} values={values} errors={errors} filed={filed}>
          {UP.map((row) => (
            <AmountRow name={row} no={row.slice(1)} label={k.taxRows[row] ?? row} values={values} errors={errors} />
          ))}
        </More>
        <More title={k.sections.down} names={[...DOWN]} values={values} errors={errors} filed={filed}>
          {DOWN.map((row) => (
            <AmountRow name={row} no={row.slice(1)} label={k.taxRows[row] ?? row} values={values} errors={errors} proposed={row === 'r210' && inputs.typed.r210 === undefined && p.r210 > 0} />
          ))}
        </More>
        <fieldset class="cform__section" disabled={filed}>
          <legend class="cform__title">{k.sections.base}</legend>
          <div class="fgrid">
            <Field name="zdanitelne" label={k.taxable} hint={k.taxableHint} values={values} errors={errors} wide />
            <Tick name="mikro" label={k.micro} hint={k.microHint} values={values} />
            <Field name="od" label={k.from} hint={k.fromHint} values={values} errors={errors} mode="text" />
            <Tick name="oslobodena" label={k.exempt} values={values} />
            <Tick name="polovicna" label={k.half} values={values} />
          </div>
        </fieldset>
        <More title={k.sections.losses} names={[...pastNames('strata', LOSS_ROWS), 'odpocet']} values={values} errors={errors} filed={filed}>
          <PastRows prefix="strata" rows={LOSS_ROWS} labels={[k.lossYear, k.lossAmount, k.lossUsed]} values={values} errors={errors} />
          <div class="fgrid">
            <Field name="odpocet" label={k.lossDeduct} hint={k.lossDeductHint} values={values} errors={errors} wide />
          </div>
        </More>
        <More title={k.sections.credits} names={pastNames('kredit', CREDIT_ROWS)} values={values} errors={errors} filed={filed}>
          <PastRows prefix="kredit" rows={CREDIT_ROWS} labels={[k.creditYear, k.creditAmount, k.creditUsed]} values={values} errors={errors} />
        </More>
        <fieldset class="cform__section" disabled={filed}>
          <legend class="cform__title">{k.sections.paid}</legend>
          <div class="fgrid">
            <Field name="preddavky" label={k.advancesPaid} hint={k.advancesHint(formatEurExact(view.paid.advances))} values={values} errors={errors} />
            <Field name="zrazena" label={k.withheld} values={values} errors={errors} />
          </div>
        </fieldset>
        <fieldset class="cform__section" disabled={filed}>
          <legend class="cform__title">{k.sections.company}</legend>
          <div class="fgrid">
            <div class="fgrid__cell fgrid__cell--wide">
              <label class="field__label" for="z-velkost">
                {k.size}
              </label>
              <select id="z-velkost" class="field__input" name="velkost" aria-describedby="z-velkost-hint">
                {ENTITY_SIZES.map((size) => (
                  <option value={size} selected={values.velkost === size}>
                    {k.sizes[size]}
                  </option>
                ))}
              </select>
              <p class="field__hint" id="z-velkost-hint">
                {k.sizeHint(view.sizeProposal.reason, (k.sizes[view.sizeProposal.size] ?? '').toLowerCase())}
              </p>
            </div>
            <Field name="zamestnanci" label={k.employees} hint={k.employeesHint(String(view.found.employees).replace('.', ','))} values={values} errors={errors} mode="decimal" max={10} wide />
            <Field name="nace" label={k.nace} hint={k.naceHint} values={values} errors={errors} mode="text" max={12} />
            <Field name="cinnost" label={k.activity} hint={k.activityHint} values={values} errors={errors} mode="text" max={120} />
            <Field name="schvalena" label={k.approved} hint={k.approvedHint} values={values} errors={errors} mode="text" />
          </div>
        </fieldset>
        <fieldset class="cform__section" disabled={filed}>
          <legend class="cform__title">{k.sections.notes}</legend>
          <div class="fgrid">
            {view.size === 'micro' ? null : <Field name="poz_schvalena" label={k.notesPriorApproved} hint={k.notesPriorApprovedHint} values={values} errors={errors} mode="text" />}
            <Area name="poz_udalosti" label={k.notesEvents} hint={k.notesEventsHint} values={values} />
            <Area name="poz_zisk" label={k.notesProfit} values={values} />
            <Area name="poz_ine" label={k.notesOther} values={values} />
          </div>
        </fieldset>
        {filed ? null : (
          <button class="btn btn--blue stack__submit" type="submit">
            {k.save}
          </button>
        )}
      </form>
    </section>
  )
}

/** The rows of a statement worth showing: the sums always, a row of its own when it holds anything this year or the last. */
const SUMS_BALANCE = new Set(['r01', 'r02', 'r04', 'r09', 'r14', 'r17', 'r21', 'r24', 'r25', 'r26', 'r34', 'r38'])
const SUMS_PROFIT = new Set(['r01', 'r08', 'r18', 'r19', 'r20', 'r27', 'r34', 'r35', 'r38'])

/** Whole euros as the statements have them: "8 490", "−5". */
const euros = (n: number): string => `${n < 0 ? '−' : ''}${formatCount(Math.abs(n))}`

const StatementTable: FC<{ title: string; rows: readonly string[]; labels: Record<string, string>; sums: ReadonlySet<string>; current: Lines; previous: Lines | null }> = ({ title, rows, labels, sums, current, previous }) => (
  <div class="lscroll">
    <table class="ltable cstate">
      <caption class="cstate__title">{title}</caption>
      <thead>
        <tr>
          <th scope="col">{k.row}</th>
          <th scope="col" class="ltable__name">
            <span class="sr">{title}</span>
          </th>
          <th scope="col" class="num">
            {k.current}
          </th>
          {previous ? (
            <th scope="col" class="num">
              {k.previous}
            </th>
          ) : null}
        </tr>
      </thead>
      <tbody>
        {rows
          .filter((row) => sums.has(row) || (current[row] ?? 0) !== 0 || (previous?.[row] ?? 0) !== 0)
          .map((row) => (
            <tr class={sums.has(row) ? 'ltable__syn' : undefined}>
              <td class="ltable__acct">{row.slice(1)}</td>
              <td class="ltable__name">{labels[row] ?? row}</td>
              <td class="num">{euros(current[row] ?? 0)}</td>
              {previous ? <td class="num">{euros(previous[row] ?? 0)}</td> : null}
            </tr>
          ))}
      </tbody>
    </table>
  </div>
)

/** The assets of Úč POD: each row's gross amount, correction and net, the net of the year before beside. */
const AssetsTable: FC<{ view: ClosingView }> = ({ view }) => {
  const st = view.statements
  const before = view.previous?.balanceEur ?? null
  const shown = POD_ASSET_ROWS.filter((row) => POD_BALANCE_SUMS.has(row) || (st.grossEur[row] ?? 0) !== 0 || (st.fixEur[row] ?? 0) !== 0 || (before?.[row] ?? 0) !== 0)
  return (
    <div class="lscroll">
      <table class="ltable cstate">
        <caption class="cstate__title">{k.assets}</caption>
        <thead>
          <tr>
            <th scope="col">{k.row}</th>
            <th scope="col" class="ltable__name">
              <span class="sr">{k.assets}</span>
            </th>
            <th scope="col" class="num">
              {k.gross}
            </th>
            <th scope="col" class="num">
              {k.fix}
            </th>
            <th scope="col" class="num">
              {k.net}
            </th>
            {before ? (
              <th scope="col" class="num">
                {k.previousNet}
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {shown.map((row) => (
            <tr class={POD_BALANCE_SUMS.has(row) ? 'ltable__syn' : undefined}>
              <td class="ltable__acct">{row.slice(1)}</td>
              <td class="ltable__name">{k.podBalanceRows[row] ?? row}</td>
              <td class="num">{euros(st.grossEur[row] ?? 0)}</td>
              <td class="num">{euros(st.fixEur[row] ?? 0)}</td>
              <td class="num">{euros(st.balanceEur[row] ?? 0)}</td>
              {before ? <td class="num">{euros(before[row] ?? 0)}</td> : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const StatementsCard: FC<{ view: ClosingView }> = ({ view }) => (
  <section class="info" id="zavierka" aria-labelledby="zavierka-t">
    <h2 id="zavierka-t" class="info__title">
      {k.statementsTitle}
    </h2>
    <p class="info__lead">{k.statementsLead(view.statements.form, k.sizes[view.size] ?? '')}</p>
    {view.previousFrom === 'books' ? null : <p class="info__source">{view.previousFrom === 'prior' ? k.previousTaken : view.previousFrom === 'otherForm' ? k.previousOtherForm : k.noPrevious}</p>}
    {view.statements.form === 'pod' ? (
      <>
        <AssetsTable view={view} />
        <StatementTable title={k.liabilities} rows={POD_LIABILITY_ROWS} labels={k.podBalanceRows} sums={POD_BALANCE_SUMS} current={view.statements.balanceEur} previous={view.previous?.balanceEur ?? null} />
        <StatementTable title={k.profit} rows={POD_PROFIT_ROWS} labels={k.podProfitRows} sums={POD_PROFIT_SUMS} current={view.statements.profitEur} previous={view.previous?.profitEur ?? null} />
      </>
    ) : (
      <>
        <StatementTable title={k.balance} rows={BALANCE_ROWS} labels={k.balanceRows} sums={SUMS_BALANCE} current={view.statements.balanceEur} previous={view.previous?.balanceEur ?? null} />
        <StatementTable title={k.profit} rows={PROFIT_ROWS} labels={k.profitRows} sums={SUMS_PROFIT} current={view.statements.profitEur} previous={view.previous?.profitEur ?? null} />
      </>
    )}
  </section>
)

/** The notes: the draft to download, and what it says that only the accountant can confirm. */
const NotesCard: FC<{ company: Company; view: ClosingView; checks: string[] }> = ({ company, view, checks }) => (
  <section class="info" id="poznamky" aria-labelledby="poznamky-t">
    <h2 id="poznamky-t" class="info__title">
      {k.notesTitle}
    </h2>
    <p class="info__lead">{view.closing?.filed?.files?.notes ? k.notesSaved : k.notesLead(view.statements.form)}</p>
    {view.closing?.filed?.files?.notes ? null : (
      <>
        <p class="info__source">{k.notesChecksTitle}</p>
        <ul class="cchecks">
          {checks.map((c) => (
            <li>{k.notesChecks[c] ?? c}</li>
          ))}
        </ul>
      </>
    )}
    <a class="btn btn--line" href={`/ucto/klienti/${company.id}/zavierka/poznamky.pdf?rok=${view.year}`}>
      {k.notesDownload}
    </a>
  </section>
)

const StatusCard: FC<{ company: Company; view: ClosingView; ours: boolean; today: string }> = ({ company, view, ours, today }) => {
  const base = `/ucto/klienti/${company.id}/zavierka`
  const state = closingState(view)
  const r = view.tax.rows
  const filed = view.closing?.filed ? view.closing : null
  const canFile = state === 'ready' || state === 'filed'
  const toBook = !view.running && !filed && ((r.r1050 ?? 0) !== view.booked || view.deferred.expense !== view.deferredBooked)
  return (
    <section class="info vstatus" id="stav" aria-labelledby="stav-t">
      <header class="info__row">
        <h2 id="stav-t" class="info__title">
          {k.of(view.year)}
        </h2>
        <span class={`pill ${STATE_PILL[state]}`}>{STATE_NAME[state]}</span>
      </header>
      {filed ? <DeliveryNotice status={filed.deliveryStatus} href={`/ucto/klienti/${company.id}/podania?obdobie=${view.year}`} /> : null}
      <dl class="kv">
        <div>
          <dt>{k.deadlineLabel}</dt>
          <dd>{dayName(view.due, today)}</dd>
        </div>
        <div>
          <dt>{k.resultLabel}</dt>
          <dd>{formatEurExact(r.r100 ?? 0)}</dd>
        </div>
        <div>
          <dt>{k.taxLabel}</dt>
          <dd>{formatEurExact(r.r1050 ?? 0)}</dd>
        </div>
        <div>
          <dt>{(r.r1101 ?? 0) < 0 ? k.overLabel : k.payLabel}</dt>
          <dd>{formatEurExact((r.r1101 ?? 0) < 0 ? -(r.r1101 ?? 0) : (r.r1100 ?? 0))}</dd>
        </div>
        <div>
          <dt>{k.sizeLabel}</dt>
          <dd>{k.sizes[view.size]}</dd>
        </div>
        <div>
          <dt>{k.microLabel}</dt>
          <dd>{view.input.micro ? k.yes : k.no}</dd>
        </div>
      </dl>
      {ours ? null : <p class="flag">{k.notOurs}</p>}
      {!filed && !view.running && today > view.due ? <p class="flag">{k.late(daysBetween(view.due, today))}</p> : null}
      {view.running ? <p class="info__lead">{k.running(dayName(`${view.year}-12-31`, today))}</p> : null}
      {view.closing?.extendedTo && !filed ? <p class="info__lead">{k.extendedTo(dayName(view.closing.extendedTo, today))}</p> : null}
      {filed ? (
        <p class="vstatus__filed">
          {k.filed(dayName(filed.filedOn ?? today, today), filed.filedByName ?? '')}
        </p>
      ) : null}
      {view.changed && (view.changed.rows.length > 0 || view.changed.statements) ? (
        <p class="flag">{filed?.deliveryStatus && ['prepared', 'rejected', 'review'].includes(filed.deliveryStatus)
          ? filed.canReprepare
            ? 'Po uložení podkladov sa výpočet zmenil. Neodoslané alebo odmietnuté podklady znovu otvorte a skontrolujte pred prípravou novej verzie.'
            : 'Po uložení podkladov sa výpočet zmenil. Dokumenty majú rozdielny alebo sporný stav doručenia; ďalší postup musí posúdiť odborný správca.'
          : k.changed(view.changed.rows.map((row) => row.slice(1)).join(', '), view.changed.statements)}</p>
      ) : null}
      {state === 'blocked' ? <p class="vstatus__blocked">{t.vat.blocked(view.issues.filter((i) => i.level === 'block').length)}</p> : null}
      {toBook ? (
        <form class="stack" method="post" action={`${base}/dan`}>
          <input type="hidden" name="rok" value={String(view.year)} />
          <p class="info__source">{k.bookTaxLead(formatEurExact(r.r1050 ?? 0), view.year, view.deferred.lines.length > 0 ? formatEurExact(view.deferred.expense) : null)}</p>
          <button class="btn btn--line stack__submit" type="submit">
            {k.bookTax}
          </button>
        </form>
      ) : view.booked > 0 ? (
        <p class="info__source">{k.taxBooked(formatEurExact(view.booked))}</p>
      ) : null}
      {filed?.filed && !filed.filed.files ? <p class="flag">{k.missingOriginal}</p> : view.running ? null : filed?.filed ? (
        <div class="vstatus__files">
          <a class="btn btn--blue" href={`${base}/priznanie.xml?rok=${view.year}`}>
            {k.download}
          </a>
          <a class="btn btn--line" href={`${base}/zavierka.xml?rok=${view.year}`}>
            {k.downloadStatements}
          </a>
        </div>
      ) : canFile ? null : (
        <p class="info__source">{k.downloadBlocked}</p>
      )}
      {view.running ? null : <p class="info__source">{k.notes}</p>}
      {state === 'ready' ? (
        <form class="stack vfile__mark" method="post" action={`${base}/podane`}>
          <input type="hidden" name="rok" value={String(view.year)} />
          <p class="info__lead">{k.markLead}</p>
          <button class="btn btn--blue stack__submit" type="submit">
            {k.mark}
          </button>
        </form>
      ) : null}
      {(r.r1100 ?? 0) > 0 && !company.taxAccount && !view.running ? <p class="flag">{k.accountMissing}</p> : null}
      {filed && (filed.canReprepare || !filed.filed?.files?.return.attemptId && !filed.filed?.files?.statements.attemptId) ? (
        <form method="post" action={`${base}/zrusit`}>
          <input type="hidden" name="rok" value={String(view.year)} />
          <button class="btn btn--text" type="submit">
            {filed.canReprepare ? 'Znovu otvoriť neodoslané alebo odmietnuté podklady' : k.unmark}
          </button>
        </form>
      ) : null}
    </section>
  )
}

/** The deadline a notice moved (§ 49(3)): the end of a month up to three months on, six with income from abroad. */
const ExtendCard: FC<{ company: Company; view: ClosingView; today: string }> = ({ company, view, today }) => {
  if (view.running || view.closing?.filed) return null
  const current = view.closing?.extendedTo ?? ''
  return (
    <section class="info" id="lehota" aria-labelledby="lehota-t">
      <h2 id="lehota-t" class="info__title">
        {k.extendTitle}
      </h2>
      <p class="info__lead">{k.extendLead}</p>
      <form class="stack" method="post" action={`/ucto/klienti/${company.id}/zavierka/lehota`}>
        <input type="hidden" name="rok" value={String(view.year)} />
        <label class="sr" for="z-lehota">
          {k.extendTitle}
        </label>
        <select id="z-lehota" class="field__input" name="lehota">
          <option value="" selected={current === ''}>
            {k.extendNone}
          </option>
          {extensionDays(view.year).map((d) => (
            <option value={d.day} selected={current === d.day}>
              {k.extendTo(dayName(d.day, today), d.abroad)}
            </option>
          ))}
        </select>
        <button class="btn btn--line stack__submit" type="submit">
          {k.extendSave}
        </button>
      </form>
    </section>
  )
}

export interface ClosingPageProps {
  company: Company
  /** The year shown, put together; null when the books have no year yet. */
  view: ClosingView | null
  /** The years side by side, the oldest first, each with where it stands. */
  years: { year: number; state: ClosingState }[]
  /** The year's end was ours (point 5.2 and 10.4 of the terms). */
  ours: boolean
  values: ClosingValues
  errors: ClosingErrors
  today: string
  flash?: string | null
  error?: string | null
}

export const ClosingPage: FC<ClosingPageProps> = (p) => {
  const c = p.company
  const view = p.view
  return (
    <>
      <a class="back" href={`/ucto/klienti/${c.id}`}>
        {c.name}
      </a>
      <header class="phead">
        <Heading first={k.title} second={view ? k.of(view.year) : undefined} />
        <p class="phead__lead">{k.lead}</p>
      </header>
      <Flash text={p.flash} />
      <Flash text={p.error} tone="error" />
      {view ? (
        <>
          <nav class="periods" aria-label={k.years}>
            {p.years.map((y) => (
              <a class="periods__item" href={zavierka(c, y.year)} aria-current={y.year === view.year ? 'page' : undefined}>
                <span class="periods__name">{y.year}</span>
                <span class={`pill ${STATE_PILL[y.state]}`}>{STATE_NAME[y.state]}</span>
              </a>
            ))}
          </nav>
          <div class="pgrid pgrid--wide pgrid--side-first">
            <div class="pgrid__main">
              <IssuesCard company={c} view={view} />
              <TaxCard view={view} />
              <DeferredCard view={view} />
              <StatementsCard view={view} />
              {view.running ? null : <NotesCard company={c} view={view} checks={noteChecks(notesSource(c, view))} />}
              <FormCard company={c} view={view} values={p.values} errors={p.errors} />
              <p class="info__source vnotbuilt">{k.notBuilt}</p>
            </div>
            <aside class="pgrid__side">
              <StatusCard company={c} view={view} ours={p.ours} today={p.today} />
              <ExtendCard company={c} view={view} today={p.today} />
            </aside>
          </div>
        </>
      ) : (
        <p class="over__empty">{k.noYears}</p>
      )}
    </>
  )
}
