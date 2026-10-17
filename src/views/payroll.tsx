// The team's payroll of a client (/ucto/klienti/:id/mzdy): a month's payslips worked out from what the accountant
// typed (the income of each employee), what the company pays and where once the month is closed, the employees and
// the payroll settings, and an employee's payslip to print. payroll.ts works it all out; nothing here computes.
import type { FC } from 'hono/jsx'
import { formatEurExact } from '../format'
import { dayName, monthName } from '../app/copy'
import { textDay } from '../app/booking'
import type { Payslip, SocialKind } from '../app/payroll'
import { INSURERS, monthRange, type Employee, type Insurer, type PayrollRun, type RunLine } from '../app/payroll-store'
import type { PayrollTotals } from '../app/payroll'
import { groupedIban } from '../app/vat-store'
import { moneyText } from '../app/vat-form'
import type { Company } from '../app/store'
import { team as t } from '../team/copy'
import { Flash, Heading } from './inside'
import { REPORT_KINDS, REPORT_LABELS, type ReportItem } from '../payroll-reporting/model'
import { DELIVERY_TONE } from '../filings/model'
import type { RegistrationDue } from '../team/registrations'
import { registrationWhat } from './deadlines'

const w = t.payroll

export type MonthState = 'open' | 'closed' | 'running' | 'unsupported'
const STATE_PILL: Record<MonthState, string> = { open: 'pill--amber', closed: 'pill--ok', running: 'pill--grey', unsupported: 'pill--amber' }

export type SlipLine = RunLine & { slip: Payslip; days: number }

const base = (company: Company) => `/ucto/klienti/${company.id}/mzdy`

/** One payslip's lines: what comes off the wage, the tax, what is paid out, and what the employer pays on top. */
export const SlipDetail: FC<{ slip: Payslip }> = ({ slip }) => {
  const item = (label: string, cents: number, strong = false) => (
    <div class={strong ? 'kv__strong' : undefined}>
      <dt>{label}</dt>
      <dd>{formatEurExact(cents)}</dd>
    </div>
  )
  const social = (side: 'employee' | 'employer') =>
    (Object.entries(slip.social[side]) as [SocialKind, number][]).map(([kind, cents]) => (
      <div class="kv__sub">
        <dt>{w.lines[kind] ?? kind}</dt>
        <dd>{formatEurExact(cents)}</dd>
      </div>
    ))
  return (
    <dl class="kv wslip">
      {item(t.payroll.cols.gross, slip.gross, true)}
      {item(w.lines.socialEmployee ?? '', -slip.socialEmployee)}
      {social('employee')}
      {item(w.lines.healthEmployee ?? '', -slip.healthEmployee)}
      {slip.healthDeduction > 0 ? item(w.lines.healthDeduction ?? '', slip.healthDeduction) : null}
      {slip.healthTopUp > 0 ? item(w.lines.healthTopUp ?? '', slip.healthTopUp) : null}
      {item(w.lines.partialBase ?? '', slip.partialBase)}
      {item(w.lines.nonTaxable ?? '', slip.nonTaxable)}
      {item(w.lines.taxBase ?? '', slip.taxBase)}
      {item(w.lines.advance ?? '', -slip.advance)}
      {slip.bonus > 0 ? item(w.lines.bonus ?? '', slip.bonus) : null}
      {item(w.lines.net ?? '', slip.net, true)}
      {item(w.lines.socialEmployer ?? '', slip.socialEmployer)}
      {social('employer')}
      {item(w.lines.healthEmployer ?? '', slip.healthEmployer)}
      {item(w.lines.cost ?? '', slip.employerCost, true)}
    </dl>
  )
}

/** What the company pays for a month, to whom and where, and by when. */
export interface PayOrders {
  payday: string
  employees: { name: string; amount: number; iban: string | null }[]
  social: { amount: number; iban: string | null; vs: string | null }
  health: { code: Insurer; amount: number; iban: string | null; vs: string | null }[]
  tax: { amount: number; iban: string | null; vs: string; due: string }
}

const Account: FC<{ iban: string | null; vs?: string | null }> = ({ iban, vs }) => (
  <span class="wpay__acct">
    {iban ? groupedIban(iban) : <em>{w.pays.noAccount}</em>}
    {vs ? <span> · {w.pays.vs(vs)}</span> : null}
  </span>
)

const PaysCard: FC<{ orders: PayOrders; today: string }> = ({ orders, today }) => (
  <section class="info" id="platby" aria-labelledby="platby-t">
    <h2 id="platby-t" class="info__title">
      {w.pays.title}
    </h2>
    <ul class="wpays">
      <li class="wpay">
        <span class="wpay__who">{w.pays.employees}</span>
        <span class="wpay__due">{w.pays.due(dayName(orders.payday, today))}</span>
        <ul class="wpay__list">
          {orders.employees.map((e) => (
            <li>
              <span>{e.name}</span> <strong>{formatEurExact(e.amount)}</strong> <Account iban={e.iban} />
            </li>
          ))}
        </ul>
      </li>
      <li class="wpay">
        <span class="wpay__who">{w.pays.social}</span>
        <strong>{formatEurExact(orders.social.amount)}</strong>
        <span class="wpay__due">{w.pays.due(dayName(orders.payday, today))}</span>
        <Account iban={orders.social.iban} vs={orders.social.vs} />
      </li>
      {orders.health.map((h) => (
        <li class="wpay">
          <span class="wpay__who">{w.pays.health(INSURERS[h.code])}</span>
          <strong>{formatEurExact(h.amount)}</strong>
          <span class="wpay__due">{w.pays.due(dayName(orders.payday, today))}</span>
          <Account iban={h.iban} vs={h.vs} />
        </li>
      ))}
      {orders.tax.amount > 0 ? (
        <li class="wpay">
          <span class="wpay__who">{w.pays.tax}</span>
          <strong>{formatEurExact(orders.tax.amount)}</strong>
          <span class="wpay__due">{w.pays.taxDue(dayName(orders.tax.due, today))}</span>
          <Account iban={orders.tax.iban} vs={orders.tax.vs} />
        </li>
      ) : orders.tax.amount < 0 ? (
        <li class="wpay">
          <span class="info__source">{w.pays.bonusOver}</span>
        </li>
      ) : null}
    </ul>
  </section>
)

/** The registrations with the Social Insurance Agency and the health insurers: filed in their portals, recorded here. */
const RegistrationsCard: FC<{ company: Company; registrations: RegistrationDue[]; today: string }> = ({ company, registrations, today }) => (
  <section class="info" id="prihlasenia" aria-labelledby="prihlasenia-t">
    <h2 id="prihlasenia-t" class="info__title">
      {w.registrations.title}
    </h2>
    <p class="info__lead">{w.registrations.lead}</p>
    {registrations.length === 0 ? (
      <p class="info__empty">{w.registrations.empty}</p>
    ) : (
      <ul class="plain">
        {registrations.map((r) => (
          <li class="plain__row plain__row--two">
            <span class="plain__name">{registrationWhat(r)}</span>
            <span class="plain__sub">
              <span class={`pill ${r.done ? 'pill--ok' : today > r.day ? 'pill--red' : 'pill--amber'}`}>
                {r.done ? w.registrations.done : today > r.day ? w.registrations.late(dayName(r.day, today)) : w.registrations.by(dayName(r.day, today))}
              </span>
            </span>
            <form class="plain__action" method="post" action={`${base(company)}/prihlasenia`}>
              <input type="hidden" name="kluc" value={r.key} />
              {r.done ? <input type="hidden" name="spat" value="1" /> : null}
              <button class={`btn btn--small ${r.done ? 'btn--text' : 'btn--line'}`} type="submit">
                {r.done ? w.registrations.undo : w.registrations.mark}
              </button>
            </form>
          </li>
        ))}
      </ul>
    )}
  </section>
)

const EmployeesCard: FC<{ company: Company; employees: Employee[]; today: string }> = ({ company, employees, today }) => (
  <section class="info" id="zamestnanci" aria-labelledby="zamestnanci-t">
    <h2 id="zamestnanci-t" class="info__title">
      {w.employees.title}
    </h2>
    {employees.length === 0 ? (
      <p class="info__empty">{w.noEmployees}</p>
    ) : (
      <ul class="plain">
        {employees.map((e) => (
          <li class="plain__row plain__row--two">
            <span class="plain__name">{e.name}</span>
            <span class="plain__sub">
              <span>{w.employees.line(dayName(e.startedOn, today), e.endedOn ? dayName(e.endedOn, today) : null, formatEurExact(e.wage), INSURERS[e.insurer])}</span>
            </span>
            <a class="btn btn--line btn--small plain__action" href={`${base(company)}/zamestnanec?id=${e.id}`}>
              {w.employees.edit}
            </a>
          </li>
        ))}
      </ul>
    )}
    <a class="btn btn--line btn--small" href={`${base(company)}/zamestnanec`}>
      {w.employees.add}
    </a>
  </section>
)

export type SettingsValues = Record<string, string>
export type FieldErrors = Partial<Record<string, string>>

const Field: FC<{ id: string; name: string; label: string; value: string; hint?: string; error?: string; mode?: 'numeric' | 'text' | 'decimal'; max?: number }> = (p) => (
  <div class="fgrid__cell fgrid__cell--wide">
    <label class="field__label" for={p.id}>
      {p.label}
    </label>
    <input id={p.id} class="field__input" name={p.name} value={p.value} inputmode={p.mode ?? 'text'} maxlength={p.max ?? 40} autocomplete="off" aria-invalid={p.error ? 'true' : undefined} />
    {p.error ? <p class="field__error">{p.error}</p> : p.hint ? <p class="field__hint">{p.hint}</p> : null}
  </div>
)

const SettingsCard: FC<{ company: Company; insurers: Insurer[]; values: SettingsValues; errors: FieldErrors }> = ({ company, insurers, values, errors }) => (
  <section class="info" id="nastavenie" aria-labelledby="nastavenie-t">
    <h2 id="nastavenie-t" class="info__title">
      {w.settings.title}
    </h2>
    <p class="info__lead">{w.settings.lead}</p>
    <form class="fgrid" method="post" action={`${base(company)}/nastavenie`} novalidate>
      <Field id="w-den" name="den" label={w.settings.payday} value={values.den ?? ''} hint={w.settings.paydayHint} error={errors.den} mode="numeric" max={2} />
      <Field id="w-sp-iban" name="sp_iban" label={w.settings.socialIban} value={values.sp_iban ?? ''} error={errors.sp_iban} max={34} />
      <Field id="w-sp-vs" name="sp_vs" label={w.settings.socialVs} value={values.sp_vs ?? ''} error={errors.sp_vs} mode="numeric" max={10} />
      {insurers.map((code) => (
        <>
          <Field id={`w-zp-iban-${code}`} name={`zp_iban_${code}`} label={w.settings.healthIban(INSURERS[code])} value={values[`zp_iban_${code}`] ?? ''} error={errors[`zp_iban_${code}`]} max={34} />
          <Field id={`w-zp-vs-${code}`} name={`zp_vs_${code}`} label={w.settings.healthVs(INSURERS[code])} value={values[`zp_vs_${code}`] ?? ''} error={errors[`zp_vs_${code}`]} mode="numeric" max={10} />
        </>
      ))}
      <div class="fgrid__cell fgrid__cell--wide">
        <button class="btn btn--line stack__submit" type="submit">
          {w.settings.save}
        </button>
      </div>
    </form>
  </section>
)

export interface PayrollPageProps {
  /** The registrations with the Social Insurance Agency and the health insurers (team/registrations.ts). */
  registrations?: RegistrationDue[]
  reports?: ReportItem[]
  reopenBlocked?: boolean
  company: Company
  period: string
  months: { period: string; state: MonthState }[]
  state: MonthState
  employees: Employee[]
  slips: SlipLine[]
  run: PayrollRun | null
  totals: PayrollTotals
  orders: PayOrders
  /** The incomes and the payday as typed (after an error) or as stored. */
  values: Record<string, string>
  errors: FieldErrors
  settings: { values: SettingsValues; errors: FieldErrors; insurers: Insurer[] }
  today: string
  flash?: string | null
  error?: string | null
}

export const PayrollPage: FC<PayrollPageProps> = (p) => {
  const c = p.company
  const closed = p.state === 'closed'
  return (
    <>
      <a class="back" href={`/ucto/klienti/${c.id}`}>
        {c.name}
      </a>
      <header class="phead">
        <Heading first={w.title} second={w.of(monthName(`${p.period}-01`))} />
        <p class="phead__lead">{w.lead}</p>
      </header>
      <Flash text={p.flash} />
      <Flash text={p.error} tone="error" />
      {p.months.length > 0 ? (
        <nav class="periods" aria-label={w.months}>
          {p.months.map((m) => (
            <a class="periods__item" href={`${base(c)}?obdobie=${m.period}`} aria-current={m.period === p.period ? 'page' : undefined}>
              <span class="periods__name">{monthName(`${m.period}-01`)}</span>
              <span class={`pill ${STATE_PILL[m.state]}`}>{w.state[m.state]}</span>
            </a>
          ))}
        </nav>
      ) : null}
      <div class="pgrid pgrid--wide">
        <div class="pgrid__main">
          <section class="info wmonth" id="mesiac" aria-labelledby="mesiac-t">
            <header class="info__row">
              <h2 id="mesiac-t" class="info__title">
                {monthName(`${p.period}-01`)}
              </h2>
              <span class={`pill ${STATE_PILL[p.state]}`}>{w.state[p.state]}</span>
            </header>
            {p.state === 'running' ? <p class="info__lead">{w.running(dayName(monthRange(p.period).to, p.today))}</p> : null}
            {closed && p.run?.closedOn ? (
              <p class="vstatus__filed">
                <span class="tick tick--green" aria-hidden="true" /> {w.closedLine(dayName(p.run.closedOn, p.today), p.run.closedByName ?? '')}
              </p>
            ) : null}
            {p.state === 'unsupported' ? (
              <p class="info__lead">{w.unsupported}</p>
            ) : p.slips.length === 0 ? (
              <p class="info__empty">{p.employees.length === 0 ? w.noEmployees : w.nobodyInMonth}</p>
            ) : (
              <form method="post" action={base(c)} novalidate>
                <input type="hidden" name="obdobie" value={p.period} />
                <div class="lscroll">
                  <table class="ltable wtable">
                    <thead>
                      <tr>
                        <th scope="col">{w.cols.name}</th>
                        <th scope="col" class="num">
                          {w.cols.gross}
                        </th>
                        <th scope="col" class="num">
                          {w.cols.social}
                        </th>
                        <th scope="col" class="num">
                          {w.cols.health}
                        </th>
                        <th scope="col" class="num">
                          {w.cols.tax}
                        </th>
                        <th scope="col" class="num">
                          {w.cols.net}
                        </th>
                        <th scope="col" class="num">
                          {w.cols.cost}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {p.slips.map((l) => (
                        <tr>
                          <td class="ltable__name">
                            <span class="wtable__name">{l.name}</span>
                            <span class="wtable__sub">{w.days(l.days)}</span>
                            <details class="vrows__docs">
                              <summary>{w.detail}</summary>
                              <SlipDetail slip={l.slip} />
                              <a class="link" href={`${base(c)}/paska?obdobie=${p.period}&zamestnanec=${l.employeeId}`}>
                                {w.payslip}
                              </a>
                            </details>
                          </td>
                          <td class="num">
                            {closed ? (
                              formatEurExact(l.slip.gross)
                            ) : (
                              <>
                                <label class="sr" for={`w-g-${l.employeeId}`}>
                                  {w.grossLabel(l.name)}
                                </label>
                                <input
                                  id={`w-g-${l.employeeId}`}
                                  class="field__input wtable__input"
                                  name={`hruba_${l.employeeId}`}
                                  value={p.values[`hruba_${l.employeeId}`] ?? moneyText(l.gross)}
                                  inputmode="decimal"
                                  maxlength={14}
                                  autocomplete="off"
                                  aria-invalid={p.errors[`hruba_${l.employeeId}`] ? 'true' : undefined}
                                />
                                {p.errors[`hruba_${l.employeeId}`] ? <p class="field__error">{p.errors[`hruba_${l.employeeId}`]}</p> : null}
                              </>
                            )}
                          </td>
                          <td class="num">{formatEurExact(l.slip.socialEmployee)}</td>
                          <td class="num">{formatEurExact(l.slip.healthEmployee)}</td>
                          <td class="num">{formatEurExact(l.slip.withheld)}</td>
                          <td class="num">
                            <strong>{formatEurExact(l.slip.net)}</strong>
                          </td>
                          <td class="num">{formatEurExact(l.slip.employerCost)}</td>
                        </tr>
                      ))}
                      <tr class="ltable__sum">
                        <td>{w.total}</td>
                        <td class="num">{formatEurExact(p.totals.gross)}</td>
                        <td class="num">{formatEurExact(p.slips.reduce((s, l) => s + l.slip.socialEmployee, 0))}</td>
                        <td class="num">{formatEurExact(p.slips.reduce((s, l) => s + l.slip.healthEmployee, 0))}</td>
                        <td class="num">{formatEurExact(p.totals.tax)}</td>
                        <td class="num">{formatEurExact(p.totals.net)}</td>
                        <td class="num">{formatEurExact(p.totals.employerCost)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                {closed ? null : (
                  <>
                    <p class="field__hint">{w.grossHint}</p>
                    <div class="fgrid wform">
                      <div class="fgrid__cell">
                        <label class="field__label" for="w-vyplata">
                          {w.payday}
                        </label>
                        <input id="w-vyplata" class="field__input" name="vyplata" value={p.values.vyplata ?? ''} maxlength={16} autocomplete="off" aria-invalid={p.errors.vyplata ? 'true' : undefined} />
                        {p.errors.vyplata ? <p class="field__error">{p.errors.vyplata}</p> : <p class="field__hint">{w.paydayHint}</p>}
                      </div>
                    </div>
                    <div class="info__acts">
                      <button class="btn btn--line" type="submit" name="akcia" value="ulozit">
                        {w.save}
                      </button>
                      {p.state === 'open' ? (
                        <button class="btn btn--blue" type="submit" name="akcia" value="uzavriet">
                          {w.close}
                        </button>
                      ) : null}
                    </div>
                    {p.state === 'open' ? <p class="info__source">{w.closeLead}</p> : null}
                  </>
                )}
              </form>
            )}
            {closed && !p.reopenBlocked ? (
              <form method="post" action={`${base(c)}/otvorit`}>
                <input type="hidden" name="obdobie" value={p.period} />
                <button class="btn btn--text" type="submit">
                  {w.reopen}
                </button>
              </form>
            ) : null}
          </section>
          {closed ? <section class="info payroll-reports-summary"><h2 class="info__title">Mzdové podania a potvrdenky</h2>
            <p>Uzavretie miezd ešte nepotvrdzuje odoslanie výkazov. Každý príjemca má samostatný výsledok.</p>
            {(p.reports ?? []).filter((r) => r.active).map((r) => <p>{REPORT_KINDS[r.kind]} · {monthName(`${r.period}-01`)} <span class={`pill pill--${r.sourceChanged ? 'red' : DELIVERY_TONE[r.status]}`}>{r.sourceChanged ? 'Podklady sa zmenili' : r.pkg ? REPORT_LABELS[r.status] : 'Treba doložiť výkaz'}</span></p>)}
            {p.reopenBlocked ? <p class="notice">Uzávierka už má evidované odoslanie alebo overenú výplatu príjmov. Pôvodné podklady zostávajú zachované; ďalšiu opravu posúdi odborný správca.</p> : null}
            <a class="btn btn--line" href={`/ucto/klienti/${c.id}/mzdove-podania?obdobie=${p.period}`}>Otvoriť mzdové podania</a>
          </section> : null}
          {p.slips.length > 0 ? <PaysCard orders={p.orders} today={p.today} /> : null}
          <p class="info__source vnotbuilt">{w.notBuilt}</p>
        </div>
        <aside class="pgrid__side">
          <EmployeesCard company={c} employees={p.employees} today={p.today} />
          <RegistrationsCard company={c} registrations={p.registrations ?? []} today={p.today} />
          <SettingsCard company={c} insurers={p.settings.insurers} values={p.settings.values} errors={p.settings.errors} />
        </aside>
      </div>
    </>
  )
}

export interface EmployeeForm {
  id: string | null
  values: Record<string, string>
  errors: FieldErrors
}

export const CHILD_ROWS = 4

export const EmployeePage: FC<{ company: Company; form: EmployeeForm }> = ({ company, form }) => {
  const v = form.values
  const e = form.errors
  const tick = (name: string, label: string) => (
    <div class="fgrid__cell fgrid__cell--wide">
      <label class="tickbox">
        <input type="checkbox" name={name} value="1" checked={v[name] === '1'} />
        <span>{label}</span>
      </label>
    </div>
  )
  return (
    <>
      <a class="back" href={base(company)}>
        {w.form.back}
      </a>
      <header class="phead">
        <Heading first={form.id ? w.form.titleEdit : w.form.titleNew} second={company.name} />
        <p class="phead__lead">{w.form.lead}</p>
      </header>
      {Object.keys(e).length > 0 ? <Flash text={w.flashes.fix} tone="error" /> : null}
      <section class="info">
        <form class="fgrid" method="post" action={`${base(company)}/zamestnanec`} novalidate>
          {form.id ? <input type="hidden" name="id" value={form.id} /> : null}
          <Field id="z-meno" name="meno" label={w.form.name} value={v.meno ?? ''} error={e.meno} max={80} />
          <Field id="z-narodeny" name="narodeny" label={w.form.born} value={v.narodeny ?? ''} error={e.narodeny} max={16} />
          <div class="fgrid__cell fgrid__cell--wide">
            <label class="field__label" for="z-poistovna">
              {w.form.insurer}
            </label>
            <select id="z-poistovna" class="field__input" name="poistovna" aria-invalid={e.poistovna ? 'true' : undefined}>
              {(Object.keys(INSURERS) as Insurer[]).map((code) => (
                <option value={code} selected={v.poistovna === code}>
                  {INSURERS[code]} ({code})
                </option>
              ))}
            </select>
            {e.poistovna ? <p class="field__error">{e.poistovna}</p> : null}
          </div>
          <Field id="z-nastup" name="nastup" label={w.form.started} value={v.nastup ?? ''} error={e.nastup} max={16} />
          <Field id="z-skoncenie" name="skoncenie" label={w.form.ended} value={v.skoncenie ?? ''} hint={w.form.endedHint} error={e.skoncenie} max={16} />
          <Field id="z-mzda" name="mzda" label={w.form.wage} value={v.mzda ?? ''} error={e.mzda} mode="decimal" max={14} />
          <Field id="z-iban" name="iban" label={w.form.iban} value={v.iban ?? ''} error={e.iban} max={34} />
          {tick('vyhlasenie', w.form.declaration)}
          {tick('ztp', w.form.disabled)}
          {tick('op', w.form.healthDeduction)}
          {tick('vynimka', w.form.healthExempt)}
          <fieldset class="cform__section fgrid__cell--wide">
            <legend class="cform__title">{w.form.children}</legend>
            <div class="wkids">
              {Array.from({ length: CHILD_ROWS }, (_, i) => (
                <>
                  <div class="fgrid__cell">
                    <label class="field__label" for={`z-dieta-${i}`}>
                      {w.form.childName}
                    </label>
                    <input id={`z-dieta-${i}`} class="field__input" name={`dieta_${i}`} value={v[`dieta_${i}`] ?? ''} maxlength={80} autocomplete="off" aria-invalid={e[`dieta_${i}`] ? 'true' : undefined} />
                    {e[`dieta_${i}`] ? <p class="field__error">{e[`dieta_${i}`]}</p> : null}
                  </div>
                  <div class="fgrid__cell">
                    <label class="field__label" for={`z-narodene-${i}`}>
                      {w.form.childBorn}
                    </label>
                    <input id={`z-narodene-${i}`} class="field__input" name={`narodene_${i}`} value={v[`narodene_${i}`] ?? ''} maxlength={16} autocomplete="off" />
                  </div>
                </>
              ))}
            </div>
          </fieldset>
          <div class="fgrid__cell fgrid__cell--wide">
            <button class="btn btn--blue stack__submit" type="submit">
              {w.form.save}
            </button>
          </div>
        </form>
      </section>
    </>
  )
}

/** An employee's payslip for a month, to print or save as PDF (the written statement of § 130(5) of the Labour Code). */
export const PayslipPage: FC<{ company: Company; period: string; line: SlipLine; today: string }> = ({ company, period, line, today }) => (
  <>
    <a class="back" href={`${base(company)}?obdobie=${period}`}>
      {w.form.back}
    </a>
    <article class="info wsheet">
      <header class="info__row">
        <h1 class="info__title">
          {w.payslip} {w.of(monthName(`${period}-01`))}
        </h1>
      </header>
      <p class="info__lead">
        <strong>{line.name}</strong> · {company.name}
      </p>
      <p class="info__source">{w.days(line.days)}</p>
      <SlipDetail slip={line.slip} />
      <p class="info__source wsheet__print">
        {w.print} · {textDay(today)}
      </p>
    </article>
  </>
)
