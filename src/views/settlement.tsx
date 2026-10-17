// The annual settlement of a client's employees (/ucto/klienti/:id/mzdy/rocne?rok=): each employee's year from the
// months closed, the form of what the accountant gives (the request, the employers before, the spouse, supplementary
// pension saving, a pension, the month to settle in) and the result; and an employee's statement of taxable income to
// print. tax-settlement.ts works it out; nothing here computes.
import type { FC } from 'hono/jsx'
import { formatEurExact } from '../format'
import { monthName } from '../app/copy'
import { textDay } from '../app/booking'
import type { Employee } from '../app/payroll-store'
import type { SettlementResult, YearIncome } from '../app/tax-settlement'
import type { Company } from '../app/store'
import { team as t } from '../team/copy'
import { Flash, Heading } from './inside'

const w = t.payroll
const s = w.settlement
const base = (company: Company) => `/ucto/klienti/${company.id}/mzdy`

export type SettlementState = { kind: 'none' } | { kind: 'ready' } | { kind: 'due'; month: string } | { kind: 'closed'; month: string } | { kind: 'stale' }

export interface SettlementRow {
  employee: Employee
  income: YearIncome
  result: SettlementResult | null
  state: SettlementState
  /** A settled month closed: the form only shows. */
  locked: boolean
  values: Record<string, string>
  errors: Partial<Record<string, string>>
}

const stateText = (st: SettlementState): string => (st.kind === 'due' ? s.state.due(monthName(`${st.month}-01`)) : st.kind === 'closed' ? s.state.closed(monthName(`${st.month}-01`)) : s.state[st.kind])
const statePill = (st: SettlementState): string => (st.kind === 'closed' ? 'pill--ok' : st.kind === 'stale' ? 'pill--red' : st.kind === 'none' ? 'pill--grey' : 'pill--amber')

const ResultLines: FC<{ r: SettlementResult }> = ({ r }) => {
  const item = (label: string, cents: number, strong = false) => (
    <div class={strong ? 'kv__strong' : undefined}>
      <dt>{label}</dt>
      <dd>{formatEurExact(cents)}</dd>
    </div>
  )
  return (
    <dl class="kv wslip">
      {item(s.lines.taxable ?? '', r.taxable)}
      {item(s.lines.insurance ?? '', -r.insurance)}
      {item(s.lines.partialBase ?? '', r.partialBase, true)}
      {item(s.lines.taxpayer ?? '', -r.nonTaxable.taxpayer)}
      {r.nonTaxable.spouse > 0 ? item(s.lines.spouse ?? '', -r.nonTaxable.spouse) : null}
      {r.nonTaxable.dds > 0 ? item(s.lines.dds ?? '', -r.nonTaxable.dds) : null}
      {item(s.lines.taxBase ?? '', r.taxBase)}
      {item(s.lines.tax ?? '', r.tax)}
      {item(s.lines.advances ?? '', -r.advances)}
      {item((r.taxDifference >= 0 ? s.lines.owe : s.lines.refund) ?? '', Math.abs(r.taxDifference), true)}
      {r.bonus > 0 || r.bonusPaid > 0 ? (
        <>
          {item(s.lines.bonus ?? '', r.bonus)}
          {item(s.lines.bonusPaid ?? '', -r.bonusPaid)}
          {r.bonusDifference !== 0 ? item((r.bonusDifference > 0 ? s.lines.bonusOwed : s.lines.bonusBack) ?? '', Math.abs(r.bonusDifference), true) : null}
        </>
      ) : null}
    </dl>
  )
}

const Field: FC<{ id: string; name: string; label: string; value: string; error?: string; hint?: string; readonly?: boolean }> = (p) => (
  <div class="wparts__cell">
    <label class="field__label" for={p.id}>
      {p.label}
    </label>
    <input id={p.id} class="field__input" name={p.name} value={p.value} inputmode="decimal" maxlength={16} autocomplete="off" readonly={p.readonly} aria-invalid={p.error ? 'true' : undefined} />
    {p.error ? <p class="field__error">{p.error}</p> : p.hint ? <p class="field__hint">{p.hint}</p> : null}
  </div>
)

/** The figures of the annual report (hlásenie, § 39(9)) from the year's closed months and the settlements made. */
const AnnualReport: FC<{ year: number; rows: SettlementRow[] }> = ({ year, rows }) => {
  const sum = (pick: (r: SettlementRow) => number) => rows.reduce((t, r) => t + pick(r), 0)
  const settled = rows.filter((r) => r.result && r.state.kind !== 'none')
  const item = (label: string, value: string) => (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
  return (
    <section class="info" id="hlasenie" aria-labelledby="hlasenie-t">
      <h2 id="hlasenie-t" class="info__title">
        {s.report.title}
      </h2>
      <p class="info__lead">{s.report.lead(year)}</p>
      <dl class="kv">
        {item(s.report.rows.employees ?? '', String(rows.length))}
        {item(s.report.rows.taxable ?? '', formatEurExact(sum((r) => r.income.taxable)))}
        {item(s.report.rows.insurance ?? '', formatEurExact(sum((r) => r.income.insurance)))}
        {item(s.report.rows.advance ?? '', formatEurExact(sum((r) => r.income.advance)))}
        {item(s.report.rows.bonus ?? '', formatEurExact(sum((r) => r.income.bonus)))}
        {item(s.report.rows.settled ?? '', String(settled.length))}
        {item(s.report.rows.refunds ?? '', formatEurExact(settled.reduce((t, r) => t + Math.max(0, -(r.result?.taxDifference ?? 0)), 0)))}
        {item(s.report.rows.owed ?? '', formatEurExact(settled.reduce((t, r) => t + Math.max(0, r.result?.taxDifference ?? 0), 0)))}
        {item(s.report.rows.bonusOwed ?? '', formatEurExact(settled.reduce((t, r) => t + Math.max(0, r.result?.bonusDifference ?? 0), 0)))}
      </dl>
    </section>
  )
}

export interface SettlementPageProps {
  company: Company
  year: number
  years: number[]
  supported: boolean
  rows: SettlementRow[]
  /** The months a settlement may be settled in: after the year, not closed. */
  months: string[]
  flash?: string | null
  error?: string | null
}

export const SettlementPage: FC<SettlementPageProps> = (p) => {
  const c = p.company
  return (
    <>
      <a class="back" href={base(c)}>
        {w.form.back}
      </a>
      <header class="phead">
        <Heading first={s.title} second={s.of(p.year)} />
        <p class="phead__lead">{s.lead}</p>
      </header>
      <Flash text={p.flash} />
      <Flash text={p.error} tone="error" />
      <nav class="periods" aria-label={s.years}>
        {p.years.map((y) => (
          <a class="periods__item" href={`${base(c)}/rocne?rok=${y}`} aria-current={y === p.year ? 'page' : undefined}>
            <span class="periods__name">{y}</span>
          </a>
        ))}
      </nav>
      {!p.supported ? (
        <section class="info">
          <p class="info__lead">{s.unsupported}</p>
        </section>
      ) : p.rows.length === 0 ? (
        <section class="info">
          <p class="info__empty">{s.empty}</p>
        </section>
      ) : (
        <div class="pgrid__main">
          <section class="info wmonth" aria-label={s.title}>
            <div class="lscroll">
              <table class="ltable wtable">
                <thead>
                  <tr>
                    <th scope="col">{s.cols.name}</th>
                    <th scope="col" class="num">
                      {s.cols.taxable}
                    </th>
                    <th scope="col" class="num">
                      {s.cols.insurance}
                    </th>
                    <th scope="col" class="num">
                      {s.cols.advance}
                    </th>
                    <th scope="col" class="num">
                      {s.cols.bonus}
                    </th>
                    <th scope="col" class="num">
                      {s.cols.result}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {p.rows.map((r) => (
                    <tr>
                      <td class="ltable__name">
                        <a class="wtable__name" href={`#rz-${r.employee.id}`}>
                          {r.employee.name}
                        </a>
                        <span class="wtable__sub">
                          <span class={`pill ${statePill(r.state)}`}>{stateText(r.state)}</span>
                        </span>
                      </td>
                      <td class="num">{formatEurExact(r.income.taxable)}</td>
                      <td class="num">{formatEurExact(r.income.insurance)}</td>
                      <td class="num">{formatEurExact(r.income.advance)}</td>
                      <td class="num">{formatEurExact(r.income.bonus)}</td>
                      <td class="num">{r.result ? formatEurExact(-(r.result.taxDifference - r.result.bonusDifference)) : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <AnnualReport year={p.year} rows={p.rows} />
          {p.rows.map((r) => {
            const v = r.values
            const e = r.errors
            const id = r.employee.id
            return (
              <section class="info" id={`rz-${id}`} aria-labelledby={`rz-t-${id}`}>
                <header class="info__row">
                  <h2 id={`rz-t-${id}`} class="info__title">
                    {r.employee.name}
                  </h2>
                  <span class={`pill ${statePill(r.state)}`}>{stateText(r.state)}</span>
                </header>
                <form method="post" action={`${base(c)}/rocne`} novalidate>
                  <input type="hidden" name="rok" value={String(p.year)} />
                  <input type="hidden" name="zamestnanec" value={id} />
                  <label class="tickbox">
                    <input type="checkbox" name="poziadal" value="1" checked={v.poziadal === '1'} disabled={r.locked} />
                    <span>{s.requested}</span>
                  </label>
                  {e.poziadal ? <p class="field__error">{e.poziadal}</p> : null}
                  <p class="cform__title">{s.otherTitle}</p>
                  <div class="wparts">
                    {(['taxable', 'insurance', 'advance', 'bonus', 'months'] as const).map((k) => (
                      <Field id={`rz-${k}-${id}`} name={`ine_${k}`} label={s.other[k] ?? k} value={v[`ine_${k}`] ?? ''} error={e[`ine_${k}`]} readonly={r.locked} />
                    ))}
                  </div>
                  <div class="wparts">
                    <Field id={`rz-sm-${id}`} name="manzel_mesiace" label={s.spouseMonths} value={v.manzel_mesiace ?? ''} error={e.manzel_mesiace} readonly={r.locked} />
                    <Field id={`rz-si-${id}`} name="manzel_prijem" label={s.spouseIncome} value={v.manzel_prijem ?? ''} error={e.manzel_prijem} readonly={r.locked} />
                    <Field id={`rz-dds-${id}`} name="dds" label={s.dds} value={v.dds ?? ''} error={e.dds} hint={s.ddsHint} readonly={r.locked} />
                    <Field id={`rz-p-${id}`} name="dochodok" label={s.pension} value={v.dochodok ?? ''} error={e.dochodok} readonly={r.locked} />
                    <div class="wparts__cell">
                      <label class="field__label" for={`rz-in-${id}`}>
                        {s.settleIn}
                      </label>
                      <select id={`rz-in-${id}`} class="field__input" name="zuctovat" disabled={r.locked} aria-invalid={e.zuctovat ? 'true' : undefined}>
                        <option value="">{s.settleNone}</option>
                        {[...new Set([...p.months, ...(v.zuctovat ? [v.zuctovat] : [])])].sort().map((m) => (
                          <option value={m} selected={v.zuctovat === m}>
                            {monthName(`${m}-01`)}
                          </option>
                        ))}
                      </select>
                      {e.zuctovat ? <p class="field__error">{e.zuctovat}</p> : null}
                    </div>
                  </div>
                  {r.locked ? <p class="info__source">{s.closedRefused}</p> : (
                    <button class="btn btn--line" type="submit">
                      {s.save}
                    </button>
                  )}
                </form>
                {r.result ? <ResultLines r={r.result} /> : null}
                <a class="link" href={`${base(c)}/potvrdenie?rok=${p.year}&zamestnanec=${id}`}>
                  {s.certificate}
                </a>
              </section>
            )
          })}
        </div>
      )}
    </>
  )
}

/** An employee's statement of taxable income from employment for a year, to print (§ 39(5) of the Income Tax Act). */
export const CertificatePage: FC<{ company: Company; employee: Employee; year: number; income: YearIncome & { social: number; health: number; bonusMonths: string[] }; today: string }> = ({ company, employee, year, income, today }) => {
  const item = (label: string, value: string) => (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
  const months = (list: string[]) => list.map((m) => Number(m.slice(5))).join(', ')
  return (
    <>
      <a class="back" href={`${base(company)}/rocne?rok=${year}`}>
        {s.title}
      </a>
      <article class="info wsheet">
        <header class="info__row">
          <h1 class="info__title">
            {s.certificate} {s.of(year)}
          </h1>
        </header>
        <p class="info__lead">
          <strong>{employee.name}</strong>
          {employee.bornOn ? ` · ${textDay(employee.bornOn)}` : ''} · {company.name}
          {company.dic ? ` · DIČ ${company.dic}` : ''}
        </p>
        <p class="info__source">{s.certificateLead}</p>
        <dl class="kv wslip">
          {item(s.certificateRows.months ?? '', months(income.months))}
          {item(s.certificateRows.taxable ?? '', formatEurExact(income.taxable))}
          {item(s.certificateRows.social ?? '', formatEurExact(income.social))}
          {item(s.certificateRows.health ?? '', formatEurExact(income.health))}
          {item(s.certificateRows.advance ?? '', formatEurExact(income.advance))}
          {item(s.certificateRows.bonus ?? '', formatEurExact(income.bonus))}
          {income.bonusMonths.length > 0 ? item(s.certificateRows.bonusMonths ?? '', months(income.bonusMonths)) : null}
        </dl>
        <p class="info__source wsheet__print">
          {w.print} · {textDay(today)}
        </p>
      </article>
    </>
  )
}
