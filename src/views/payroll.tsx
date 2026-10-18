// The team's payroll of a client (/ucto/klienti/:id/mzdy): a month's payslips worked out from what the accountant
// typed for each person (the month's wage or reward, holiday, absences, overtime, surcharges, a bonus), the sick leaves
// with their daily base, what the company pays and where once the month is closed, the employees and the payroll
// settings, and a person's payslip to print. pay-month.ts and payroll.ts work it all out; nothing here computes.
import type { FC } from 'hono/jsx'
import { formatEurExact } from '../format'
import { dayName, monthName } from '../app/copy'
import { textDay } from '../app/booking'
import type { Payslip, SocialKind } from '../app/payroll'
import { INSURERS, monthRange, type Employee, type Insurer, type PayrollRun, type SlipLine } from '../app/payroll-store'
import type { PayrollTotals } from '../app/payroll'
import type { DvzProposal, SickLeave } from '../app/pay-month'
import { PART_FIELDS, hundredthsText, partsFor, tenThousandthsText } from '../app/payroll-form'
import { mealBounds } from '../app/meals'
import type { CostCenter } from '../app/centers'
import { subsistenceMissing, type Garnishment } from '../app/garnish'
import { groupedIban } from '../app/vat-store'
import type { Company } from '../app/store'
import { team as t } from '../team/copy'
import { Flash, Heading } from './inside'
import { REPORT_KINDS, REPORT_LABELS, type ReportItem } from '../payroll-reporting/model'
import { DELIVERY_TONE } from '../filings/model'
import type { RegistrationDue } from '../team/registrations'
import { registrationWhat } from './deadlines'

const w = t.payroll

export type MonthState = 'open' | 'closed' | 'running' | 'unsupported'
const STATE_PILL: Record<MonthState, string> = {
  open: 'pill--amber',
  closed: 'pill--ok',
  running: 'pill--grey',
  unsupported: 'pill--amber',
}

export type { SlipLine }

const base = (company: Company) => `/ucto/klienti/${company.id}/mzdy`
const eurPerHour = (n: number) => `${tenThousandthsText(n)} €`

/** A person's relationship in a few words: the contract, a regular income of an agreement or a director, a pension. */
function contractLine(l: Pick<SlipLine, 'terms' | 'slip'>): string {
  const kind = l.terms?.contract ?? l.slip.contract ?? 'employment'
  const parts = [w.contracts[kind] ?? kind]
  const regular = l.terms?.regular ?? l.slip.regular
  if (kind !== 'employment' && kind !== 'dobps' && regular !== undefined) parts.push(w.regularShort(regular))
  const pension = l.terms?.pension ?? l.slip.pension
  if (pension && pension !== 'none') parts.push(w.pensionShort[pension] ?? pension)
  return parts.join(' · ')
}

/** A month's pay, line by line, as it was worked out (older closed slips have the gross only). */
const PayLines: FC<{ line: SlipLine }> = ({ line }) => {
  const p = line.pay
  if (!p) return null
  const kind = line.terms?.contract ?? 'employment'
  const item = (label: string, cents: number) =>
    cents !== 0 ? (
      <div>
        <dt>{label}</dt>
        <dd>{formatEurExact(cents)}</dd>
      </div>
    ) : null
  return (
    <>
      {item(kind === 'employment' ? w.pay.wage : w.pay.reward, p.wage)}
      {item(w.pay.holiday, p.holiday)}
      {item(w.pay.publicHolidays, p.publicHolidays)}
      {item(w.pay.obstacle, p.obstacle)}
      {item(w.pay.overtime, p.overtime)}
      {item(w.pay.surcharges, p.surcharges)}
      {item(w.pay.bonus, p.bonus)}
      {item(w.pay.other, p.other)}
      {p.holiday + p.obstacle + p.overtime + p.surcharges + p.publicHolidays > 0 ? (
        <div class="kv__sub">
          <dt>{w.pay.average(eurPerHour(p.average))}</dt>
          <dd />
        </div>
      ) : null}
    </>
  )
}

/** One payslip's lines: what the month pays, what comes off it, the tax, what is paid out, and what the employer pays on top. */
export const SlipDetail: FC<{ line: SlipLine }> = ({ line }) => {
  const slip: Payslip = line.slip
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
  const sick = line.sick
  return (
    <dl class="kv wslip">
      <PayLines line={line} />
      {item(line.pay ? w.pay.gross : t.payroll.cols.gross, slip.gross, true)}
      {(slip.sickPay ?? 0) > 0 ? item(w.pay.sick, slip.sickPay ?? 0) : null}
      {(sick?.parts ?? [])
        .filter((s) => s.amount > 0)
        .map((s) => (
          <div class="kv__sub">
            <dt>
              {textDay(s.from)} {'\u2013'} {textDay(s.to)}: {w.pay.sickDays(s.days25, s.days55, s.dvz === null ? '' : `${tenThousandthsText(s.dvz)} €`)}
            </dt>
            <dd>{formatEurExact(s.amount)}</dd>
          </div>
        ))}
      {item(w.lines.socialEmployee ?? '', -slip.socialEmployee)}
      {(slip.exemption ?? 0) > 0 ? (
        <div class="kv__sub">
          <dt>{w.pay.exemption(formatEurExact(slip.exemption ?? 0))}</dt>
          <dd />
        </div>
      ) : null}
      {social('employee')}
      {item(w.lines.healthEmployee ?? '', -slip.healthEmployee)}
      {slip.healthInsured === false ? (
        <div class="kv__sub">
          <dt>{w.pay.noHealth}</dt>
          <dd />
        </div>
      ) : null}
      {slip.healthDeduction > 0 ? item(w.lines.healthDeduction ?? '', slip.healthDeduction) : null}
      {slip.healthTopUp > 0 ? item(w.lines.healthTopUp ?? '', slip.healthTopUp) : null}
      {item(w.lines.partialBase ?? '', slip.partialBase)}
      {item(w.lines.nonTaxable ?? '', slip.nonTaxable)}
      {item(w.lines.taxBase ?? '', slip.taxBase)}
      {item(w.lines.advance ?? '', -slip.advance)}
      {slip.bonus > 0 ? item(w.lines.bonus ?? '', slip.bonus) : null}
      {slip.settlementTax ? item(w.settlement.slipTax(slip.settlementTax > 0), -slip.settlementTax) : null}
      {slip.settlementBonus ? item(w.settlement.slipBonus(slip.settlementBonus > 0), slip.settlementBonus) : null}
      {slip.meals?.way === 'voucher' ? (
        <>
          {item(w.meals.slipVoucher(slip.meals.count), -slip.meals.employee)}
          <div class="kv__sub">
            <dt>{w.meals.slipParts(formatEurExact(slip.meals.employer), formatEurExact(slip.meals.fund))}</dt>
            <dd />
          </div>
        </>
      ) : null}
      {slip.meals?.way === 'cash' ? (
        <>
          {item(w.meals.slipCash(slip.meals.count), slip.meals.cash)}
          <div class="kv__sub">
            <dt>{w.meals.slipParts(formatEurExact(slip.meals.employer), formatEurExact(slip.meals.fund))}</dt>
            <dd />
          </div>
        </>
      ) : null}
      {(slip.garnish ?? []).map((d) => (
        <>
          {item(w.garnish.slip(d.creditor, d.reference), -(d.current + d.arrears))}
          {d.current > 0 || d.held ? (
            <div class="kv__sub">
              <dt>{[d.current > 0 ? w.garnish.slipCurrent(formatEurExact(d.current)) : '', d.held ? w.garnish.slipHeld : ''].filter(Boolean).join('; ')}</dt>
              <dd />
            </div>
          ) : null}
        </>
      ))}
      {item(w.lines.net ?? '', slip.net, true)}
      {item(w.lines.socialEmployer ?? '', slip.socialEmployer)}
      {social('employer')}
      {item(w.lines.healthEmployer ?? '', slip.healthEmployer)}
      {(slip.meals?.employer ?? 0) > 0 ? item(w.meals.employerCost, slip.meals?.employer ?? 0) : null}
      {item(w.lines.cost ?? '', slip.employerCost, true)}
    </dl>
  )
}

/** What the company pays for a month, to whom and where, and by when. */
export interface PayOrders {
  payday: string
  employees: { name: string; amount: number; iban: string | null }[]
  social: { amount: number; iban: string | null; vs: string | null }
  health: {
    code: Insurer
    amount: number
    iban: string | null
    vs: string | null
  }[]
  tax: { amount: number; iban: string | null; vs: string; due: string }
  /** Deductions for executions (garnish.ts): paid to each executor with the wages, or kept until his execution order. */
  garnish?: { name: string; creditor: string; reference: string; amount: number; iban: string | null; vs: string | null; held: boolean }[]
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
      {(orders.garnish ?? []).map((g) => (
        <li class="wpay">
          <span class="wpay__who">{w.garnish.payTo(g.creditor, g.reference)}</span>
          <strong>{formatEurExact(g.amount)}</strong>
          {g.held ? (
            <span class="wpay__due">{w.garnish.held}</span>
          ) : (
            <>
              <span class="wpay__due">{w.pays.due(dayName(orders.payday, today))}</span>
              <Account iban={g.iban} vs={g.vs} />
            </>
          )}
          <span class="wpay__acct">{w.garnish.of(g.name)}</span>
        </li>
      ))}
    </ul>
  </section>
)

/** The registrations with the Social Insurance Agency and the health insurers: filed in their portals, recorded here. */
const RegistrationsCard: FC<{
  company: Company
  registrations: RegistrationDue[]
  today: string
}> = ({ company, registrations, today }) => (
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

/** How much holiday a person has taken in the year, of how much. */
export interface LeaveUse {
  year: number
  taken: number
  entitled: number
}

const EmployeesCard: FC<{
  company: Company
  employees: Employee[]
  leave: Record<string, LeaveUse>
  today: string
}> = ({ company, employees, leave, today }) => (
  <section class="info" id="zamestnanci" aria-labelledby="zamestnanci-t">
    <h2 id="zamestnanci-t" class="info__title">
      {w.employees.title}
    </h2>
    {employees.length === 0 ? (
      <p class="info__empty">{w.noEmployees}</p>
    ) : (
      <ul class="plain">
        {employees.map((e) => {
          const use = leave[e.id]
          return (
            <li class="plain__row plain__row--two">
              <span class="plain__name">{e.name}</span>
              <span class="plain__sub">
                <span>
                  {w.employees.line(
                    w.contracts[e.contract] ?? e.contract,
                    dayName(e.startedOn, today),
                    e.endedOn ? dayName(e.endedOn, today) : null,
                    e.wageKind === 'hourly' ? w.employees.hourly(formatEurExact(e.wage)) : formatEurExact(e.wage),
                    INSURERS[e.insurer],
                  )}
                </span>
                {use ? <span>{w.leave(use.year, hundredthsText(use.taken), hundredthsText(use.entitled))}</span> : null}
              </span>
              <a class="btn btn--line btn--small plain__action" href={`${base(company)}/zamestnanec?id=${e.id}`}>
                {w.employees.edit}
              </a>
            </li>
          )
        })}
      </ul>
    )}
    <a class="btn btn--line btn--small" href={`${base(company)}/zamestnanec`}>
      {w.employees.add}
    </a>
  </section>
)

export type SettingsValues = Record<string, string>
export type FieldErrors = Partial<Record<string, string>>

const Field: FC<{
  id: string
  name: string
  label: string
  value: string
  hint?: string
  error?: string
  mode?: 'numeric' | 'text' | 'decimal'
  max?: number
  wide?: boolean
}> = (p) => (
  <div class={`fgrid__cell${p.wide === false ? '' : ' fgrid__cell--wide'}`}>
    <label class="field__label" for={p.id}>
      {p.label}
    </label>
    <input id={p.id} class="field__input" name={p.name} value={p.value} inputmode={p.mode ?? 'text'} maxlength={p.max ?? 40} autocomplete="off" aria-invalid={p.error ? 'true' : undefined} />
    {p.error ? <p class="field__error">{p.error}</p> : p.hint ? <p class="field__hint">{p.hint}</p> : null}
  </div>
)

const SettingsCard: FC<{
  company: Company
  insurers: Insurer[]
  values: SettingsValues
  errors: FieldErrors
  today: string
}> = ({ company, insurers, values, errors, today }) => (
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
          <Field
            id={`w-zp-vs-${code}`}
            name={`zp_vs_${code}`}
            label={w.settings.healthVs(INSURERS[code])}
            value={values[`zp_vs_${code}`] ?? ''}
            error={errors[`zp_vs_${code}`]}
            mode="numeric"
            max={10}
          />
        </>
      ))}
      <Field id="w-sf-sadzba" name="sf_sadzba" label={w.fund.rate} value={values.sf_sadzba ?? ''} hint={w.fund.rateHint} error={errors.sf_sadzba} mode="decimal" max={6} />
      <fieldset class="cform__section fgrid__cell--wide">
        <legend class="cform__title">{w.meals.title}</legend>
        <div class="fgrid">
          <Select id="w-stravovanie" name="stravovanie" label={w.meals.way} value={values.stravovanie ?? ''} options={w.meals.ways} hint={w.meals.wayHint} />
          <Field id="w-poukazka" name="poukazka" label={w.meals.voucher} value={values.poukazka ?? ''} error={errors.poukazka} mode="decimal" max={12} wide={false} />
          <Field id="w-prispevok" name="prispevok" label={w.meals.employer} value={values.prispevok ?? ''} error={errors.prispevok} mode="decimal" max={12} wide={false} />
          <Field id="w-fond" name="fond" label={w.meals.fund} value={values.fond ?? ''} error={errors.fond} mode="decimal" max={12} wide={false} />
          {(() => {
            const b = mealBounds(today)
            return b ? <p class="field__hint fgrid__cell--wide">{w.meals.bounds(formatEurExact(b.voucherMin), formatEurExact(b.employerMax), formatEurExact(b.cashMin))}</p> : null
          })()}
        </div>
      </fieldset>
      <div class="fgrid__cell fgrid__cell--wide">
        <button class="btn btn--line stack__submit" type="submit">
          {w.settings.save}
        </button>
      </div>
    </form>
  </section>
)

/** A sick leave as listed: its person, its days, its daily base (typed, or proposed and from which period). */
export interface LeaveRow {
  leave: SickLeave
  name: string
  proposal: DvzProposal | null
}

export interface SickForm {
  id: string | null
  values: Record<string, string>
  errors: FieldErrors
}

/** The sick leaves: each with its daily base, a form to write one or change the one picked. */
/** An execution as the payroll page lists it: the claim, its employee, what was deducted, kept and is left. */
export interface GarnishRow {
  g: Garnishment
  name: string
  deducted: number
  held: number
  left: number | null
  /** The employee left while the execution stands: the executor is to be told within a week (§ 85(2)). */
  employeeLeft: boolean
}

const GarnishCard: FC<{ company: Company; rows: GarnishRow[]; today: string }> = ({ company, rows, today }) => (
  <section class="info" id="exekucie" aria-labelledby="exekucie-t">
    <h2 id="exekucie-t" class="info__title">
      {w.garnish.title}
    </h2>
    <p class="info__lead">{w.garnish.lead}</p>
    {rows.length === 0 ? <p class="info__empty">{w.garnish.empty}</p> : null}
    {rows.some((r) => !r.g.endedOn) && subsistenceMissing(today) ? <p class="flag">{w.garnish.subsistence(dayName(subsistenceMissing(today) as string, today))}</p> : null}
    <ul class="plain">
      {rows.map((r) => (
        <li class="plain__row plain__row--two">
          <span class="plain__name">{w.garnish.line(r.name, w.garnish.kindShort[r.g.kind] ?? r.g.kind, r.g.creditor, r.g.reference)}</span>
          <span class="plain__sub">
            <span>{r.g.endedOn ? w.garnish.endedOn(dayName(r.g.endedOn, today)) : w.garnish.since(dayName(r.g.startedOn, today))}</span>
            <span>{w.garnish.sums(formatEurExact(r.deducted), r.left === null ? null : formatEurExact(Math.max(0, r.left)), r.held > 0 ? formatEurExact(r.held) : null)}</span>
            <a class="link" href={`${base(company)}/zrazka?id=${r.g.id}`}>
              {w.garnish.edit}
            </a>
          </span>
          {r.employeeLeft ? <span class="flag">{w.garnish.left(r.name)}</span> : null}
        </li>
      ))}
    </ul>
    <a class="btn btn--line btn--small" href={`${base(company)}/zrazka`}>
      {w.garnish.add}
    </a>
  </section>
)

export interface GarnishForm {
  id: string | null
  values: Record<string, string>
  errors: FieldErrors
}

export const GarnishPage: FC<{ company: Company; employees: Employee[]; form: GarnishForm }> = ({ company, employees, form }) => {
  const v = form.values
  const e = form.errors
  const f = w.garnish.form
  return (
    <>
      <a class="back" href={`${base(company)}#exekucie`}>
        {f.back}
      </a>
      <header class="phead">
        <Heading first={form.id ? f.titleEdit : f.titleNew} second={company.name} />
        <p class="phead__lead">{f.lead}</p>
      </header>
      {Object.keys(e).length > 0 ? <Flash text={w.flashes.fix} tone="error" /> : null}
      <section class="info">
        <form class="fgrid" method="post" action={`${base(company)}/zrazka`} novalidate>
          {form.id ? <input type="hidden" name="id" value={form.id} /> : null}
          <Select
            id="x-zamestnanec"
            name="zamestnanec"
            label={f.employee}
            value={v.zamestnanec ?? ''}
            options={Object.fromEntries([['', ''], ...employees.map((x) => [x.id, x.name])])}
            error={e.zamestnanec}
          />
          <Select id="x-druh" name="druh" label={f.kind} value={v.druh ?? 'ordinary'} options={w.garnish.kinds} error={e.druh} />
          <div class="fgrid__cell fgrid__cell--wide">
            <label class="tickbox">
              <input type="checkbox" name="malolete" value="1" checked={v.malolete === '1'} />
              <span>{f.minor}</span>
            </label>
          </div>
          <Field id="x-osoby" name="osoby" label={f.persons} value={v.osoby ?? ''} error={e.osoby} mode="numeric" max={2} wide={false} />
          <Field id="x-mesacne" name="mesacne" label={f.monthly} value={v.mesacne ?? ''} error={e.mesacne} mode="decimal" max={14} wide={false} />
          <Field id="x-exekutor" name="exekutor" label={f.creditor} value={v.exekutor ?? ''} error={e.exekutor} max={120} />
          <Field id="x-cislo" name="cislo" label={f.reference} value={v.cislo ?? ''} error={e.cislo} max={60} />
          <Field id="x-iban" name="iban" label={f.iban} value={v.iban ?? ''} error={e.iban} max={34} />
          <Field id="x-vs" name="vs" label={f.vs} value={v.vs ?? ''} error={e.vs} mode="numeric" max={10} />
          <Field id="x-zaciatok" name="zaciatok" label={f.started} value={v.zaciatok ?? ''} hint={f.startedHint} error={e.zaciatok} max={16} />
          <Field id="x-prikaz" name="prikaz" label={f.order} value={v.prikaz ?? ''} hint={f.orderHint} error={e.prikaz} max={16} />
          <Field id="x-suma" name="suma" label={f.total} value={v.suma ?? ''} hint={f.totalHint} error={e.suma} mode="decimal" max={14} />
          <Field id="x-koniec" name="koniec" label={f.ended} value={v.koniec ?? ''} hint={f.endedHint} error={e.koniec} max={16} />
          <div class="fgrid__cell fgrid__cell--wide">
            <button class="btn btn--blue stack__submit" type="submit">
              {f.save}
            </button>
          </div>
        </form>
        {form.id ? (
          <form method="post" action={`${base(company)}/zrazka/${form.id}/odstranit`}>
            <button class="btn btn--text" type="submit">
              {f.remove}
            </button>
          </form>
        ) : null}
      </section>
    </>
  )
}

const SickCard: FC<{
  company: Company
  period: string
  rows: LeaveRow[]
  employees: Employee[]
  form: SickForm
}> = ({ company, period, rows, employees, form }) => {
  const v = form.values
  const e = form.errors
  const dvzText = (r: LeaveRow) => {
    if (r.leave.dvz !== null) return w.sick.typed(`${tenThousandthsText(r.leave.dvz)} €`)
    const p = r.proposal
    if (!p) return null
    if (p.dvz !== null) return w.sick.proposed(`${tenThousandthsText(p.dvz)} €`, textDay(p.from), textDay(p.to))
    return p.reason === 'missing' && p.month ? w.sick.reasons.missing(monthName(`${p.month}-01`)) : w.sick.reasons[p.reason === 'missing' ? 'none' : p.reason]
  }
  return (
    <section class="info" id="pn" aria-labelledby="pn-t">
      <h2 id="pn-t" class="info__title">
        {w.sick.title}
      </h2>
      <p class="info__lead">{w.sick.lead}</p>
      {rows.length === 0 ? (
        <p class="info__empty">{w.sick.empty}</p>
      ) : (
        <ul class="plain">
          {rows.map((r) => (
            <li class="plain__row plain__row--two">
              <span class="plain__name">{r.name}</span>
              <span class="plain__sub">
                <span>
                  {textDay(r.leave.from)} {'\u2013'} {r.leave.to ? textDay(r.leave.to) : w.sick.lasts}
                </span>
                <span class={r.leave.dvz === null && r.proposal?.dvz === null ? 'field__error' : undefined}>{dvzText(r)}</span>
              </span>
              <span class="plain__action wsick__acts">
                <a class="btn btn--line btn--small" href={`${base(company)}?obdobie=${period}&pn=${r.leave.id}#pn`}>
                  {w.sick.edit}
                </a>
                <form method="post" action={`${base(company)}/pn/${r.leave.id}/odstranit`}>
                  <input type="hidden" name="obdobie" value={period} />
                  <button class="btn btn--text btn--small" type="submit">
                    {w.sick.remove}
                  </button>
                </form>
              </span>
            </li>
          ))}
        </ul>
      )}
      {employees.length > 0 ? (
        <form class="fgrid" method="post" action={`${base(company)}/pn`} novalidate>
          <input type="hidden" name="obdobie" value={period} />
          {form.id ? <input type="hidden" name="id" value={form.id} /> : null}
          <div class="fgrid__cell fgrid__cell--wide">
            <label class="field__label" for="pn-zamestnanec">
              {w.sick.employee}
            </label>
            <select id="pn-zamestnanec" class="field__input" name="zamestnanec" aria-invalid={e.zamestnanec ? 'true' : undefined}>
              {employees.map((x) => (
                <option value={x.id} selected={v.zamestnanec === x.id}>
                  {x.name}
                </option>
              ))}
            </select>
            {e.zamestnanec ? <p class="field__error">{e.zamestnanec}</p> : null}
          </div>
          <Field id="pn-od" name="od" label={w.sick.from} value={v.od ?? ''} error={e.od} max={16} wide={false} />
          <Field id="pn-do" name="do" label={w.sick.to} value={v.do ?? ''} hint={w.sick.toHint} error={e.do} max={16} wide={false} />
          <Field id="pn-dvz" name="dvz" label={w.sick.dvz} value={v.dvz ?? ''} hint={w.sick.dvzHint} error={e.dvz} mode="decimal" max={14} />
          <div class="fgrid__cell fgrid__cell--wide">
            <button class="btn btn--line stack__submit" type="submit">
              {form.id ? w.sick.save : w.sick.add}
            </button>
          </div>
        </form>
      ) : null}
    </section>
  )
}

/** The parts of a person's month to type, as its relationship has them; the wage (or hours) is in the table's own column. */
const PartsFields: FC<{
  line: SlipLine
  values: Record<string, string>
  errors: FieldErrors
}> = ({ line, values, errors }) => {
  const kind = line.terms?.contract ?? 'employment'
  const wageKind = line.terms?.wageKind ?? 'monthly'
  const keys = partsFor(kind, wageKind)
  const average = line.proposals?.average
  return (
    <div class="wparts">
      {keys
        .filter((key) => key !== 'meals' || (line.proposals?.meals !== null && line.proposals?.meals !== undefined))
        .map((key) => {
        const name = `${PART_FIELDS[key]}_${line.employeeId}`
        const hint =
          key === 'average' && average
            ? w.averageHint(eurPerHour(average.average), average.source === 'quarter')
            : key === 'hours' && line.pay && kind === 'employment'
              ? w.hoursHint(hundredthsText(line.pay.worked))
              : key === 'meals'
                ? line.proposals?.meals === null || line.proposals?.meals === undefined
                  ? w.meals.none
                  : w.meals.hint(String(line.proposals.meals))
                : undefined
        const label = key === 'wage' && kind !== 'employment' ? w.parts.reward : (w.parts[key] ?? key)
        return (
          <div class="wparts__cell">
            <label class="field__label" for={`w-${name}`}>
              {label}
            </label>
            <input
              id={`w-${name}`}
              class="field__input"
              name={name}
              value={values[name] ?? ''}
              inputmode="decimal"
              maxlength={16}
              autocomplete="off"
              aria-invalid={errors[name] ? 'true' : undefined}
            />
            {errors[name] ? <p class="field__error">{errors[name]}</p> : hint ? <p class="field__hint">{hint}</p> : null}
          </div>
        )
      })}
    </div>
  )
}

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
  /** The parts and the payday as typed (after an error) or as stored. */
  values: Record<string, string>
  errors: FieldErrors
  /** What keeps the month from being closed. */
  /** The executions of the company's employees (garnish.ts). */
  garnishments?: GarnishRow[]
  issues?: {
    employeeId: string
    name: string
    issue: 'absence' | 'sickBase' | 'negative'
  }[]
  leaves?: LeaveRow[]
  sickForm?: SickForm
  leave?: Record<string, LeaveUse>
  settings: {
    values: SettingsValues
    errors: FieldErrors
    insurers: Insurer[]
  }
  today: string
  flash?: string | null
  error?: string | null
}

export const PayrollPage: FC<PayrollPageProps> = (p) => {
  const c = p.company
  const closed = p.state === 'closed'
  const issues = p.issues ?? []
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
            {!closed && issues.length > 0 ? (
              <div class="notice wissues">
                <strong>{w.issuesTitle}</strong>
                <ul>
                  {issues.map((i) => (
                    <li>{i.issue === 'absence' ? w.issues.absence(i.name) : i.issue === 'negative' ? w.issues.negative(i.name) : w.issues.sickBase(i.name)}</li>
                  ))}
                </ul>
              </div>
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
                            <a class="wtable__name" href={`#zlozky-${l.employeeId}`}>
                              {l.name}
                            </a>
                            <span class="wtable__sub">
                              {contractLine(l)} · {w.days(l.days)}
                            </span>
                          </td>
                          <td class="num">{formatEurExact(l.slip.gross + (l.slip.sickPay ?? 0))}</td>
                          <td class="num">{formatEurExact(l.slip.socialEmployee)}</td>
                          <td class="num">{formatEurExact(l.slip.healthEmployee)}</td>
                          <td class="num">{formatEurExact(l.slip.withheld)}</td>
                          <td class="num">
                            <strong>{formatEurExact(l.slip.net)}</strong>
                            {l.slip.meals ? <span class="wnet__meals">{w.meals.inNet(l.slip.meals.way === 'voucher' ? formatEurExact(-l.slip.meals.employee) : `+${formatEurExact(l.slip.meals.cash)}`)}</span> : null}
                            {l.slip.garnish?.length ? (
                              <span class="wnet__meals">{w.garnish.inNet(formatEurExact(-l.slip.garnish.reduce((t, d) => t + d.current + d.arrears, 0)))}</span>
                            ) : null}
                          </td>
                          <td class="num">{formatEurExact(l.slip.employerCost)}</td>
                        </tr>
                      ))}
                      <tr class="ltable__sum">
                        <td>{w.total}</td>
                        <td class="num">{formatEurExact(p.totals.gross + p.totals.sickPay)}</td>
                        <td class="num">{formatEurExact(p.slips.reduce((s, l) => s + l.slip.socialEmployee, 0))}</td>
                        <td class="num">{formatEurExact(p.slips.reduce((s, l) => s + l.slip.healthEmployee, 0))}</td>
                        <td class="num">{formatEurExact(p.totals.tax)}</td>
                        <td class="num">{formatEurExact(p.totals.net)}</td>
                        <td class="num">{formatEurExact(p.totals.employerCost)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div class="wpeople">
                  {p.slips.map((l) => {
                    const kind = l.terms?.contract ?? 'employment'
                    const wrong = Object.keys(p.errors).some((k) => k.endsWith(`_${l.employeeId}`))
                    const typed = partsFor(kind, l.terms?.wageKind ?? 'monthly').some((k) => {
                      const v = p.values[`${PART_FIELDS[k]}_${l.employeeId}`]
                      return k !== 'wage' && k !== 'hours' && v !== undefined && v !== ''
                    })
                    const open = !closed && (wrong || typed || p.slips.length <= 12)
                    return (
                      <details class="wperson" id={`zlozky-${l.employeeId}`} open={open ? true : undefined}>
                        <summary>
                          <span class="wperson__name">{l.name}</span> <span class="wperson__sub">{contractLine(l)}</span>
                        </summary>
                        {closed ? null : <PartsFields line={l} values={p.values} errors={p.errors} />}
                        {p.slips.length <= 12 ? (
                          <details class="vrows__docs">
                            <summary>{w.detail}</summary>
                            <SlipDetail line={l} />
                            <a class="link" href={`${base(c)}/paska?obdobie=${p.period}&zamestnanec=${l.employeeId}`}>
                              {w.payslip}
                            </a>
                          </details>
                        ) : (
                          <a class="link" href={`${base(c)}/paska?obdobie=${p.period}&zamestnanec=${l.employeeId}`}>
                            {w.payslip}
                          </a>
                        )}
                      </details>
                    )
                  })}
                </div>
                {closed ? null : (
                  <>
                    <p class="field__hint">{w.grossHint}</p>
                    <div class="fgrid wform">
                      <div class="fgrid__cell">
                        <label class="field__label" for="w-vyplata">
                          {w.payday}
                        </label>
                        <input
                          id="w-vyplata"
                          class="field__input"
                          name="vyplata"
                          value={p.values.vyplata ?? ''}
                          maxlength={16}
                          autocomplete="off"
                          aria-invalid={p.errors.vyplata ? 'true' : undefined}
                        />
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
            {(() => {
              // The social fund's allocation of the month (social-fund.ts), open or closed.
              const fund = p.slips.reduce((t, l) => t + (l.fund ?? 0), 0)
              return fund > 0 ? <p class="info__source">{w.fund.month(formatEurExact(fund))}</p> : null
            })()}
            {closed && !p.reopenBlocked ? (
              <form method="post" action={`${base(c)}/otvorit`}>
                <input type="hidden" name="obdobie" value={p.period} />
                <button class="btn btn--text" type="submit">
                  {w.reopen}
                </button>
              </form>
            ) : null}
          </section>
          {closed ? (
            <section class="info payroll-reports-summary">
              <h2 class="info__title">Mzdové podania a potvrdenky</h2>
              <p>Uzavretie miezd ešte nepotvrdzuje odoslanie výkazov. Každý príjemca má samostatný výsledok.</p>
              {(p.reports ?? [])
                .filter((r) => r.active)
                .map((r) => (
                  <p>
                    {REPORT_KINDS[r.kind]} · {monthName(`${r.period}-01`)}{' '}
                    <span class={`pill pill--${r.sourceChanged ? 'red' : DELIVERY_TONE[r.status]}`}>
                      {r.sourceChanged ? 'Podklady sa zmenili' : r.pkg ? REPORT_LABELS[r.status] : 'Treba doložiť výkaz'}
                    </span>
                  </p>
                ))}
              {p.reopenBlocked ? (
                <p class="notice">Uzávierka už má evidované odoslanie alebo overenú výplatu príjmov. Pôvodné podklady zostávajú zachované; ďalšiu opravu posúdi odborný správca.</p>
              ) : null}
              <a class="btn btn--line" href={`/ucto/klienti/${c.id}/mzdove-podania?obdobie=${p.period}`}>
                Otvoriť mzdové podania
              </a>
            </section>
          ) : null}
          {p.slips.length > 0 ? <PaysCard orders={p.orders} today={p.today} /> : null}
          <SickCard company={c} period={p.period} rows={p.leaves ?? []} employees={p.employees} form={p.sickForm ?? { id: null, values: {}, errors: {} }} />
          {p.employees.length > 0 ? <GarnishCard company={c} rows={p.garnishments ?? []} today={p.today} /> : null}
          <p class="info__source vnotbuilt">{w.notBuilt}</p>
        </div>
        <aside class="pgrid__side">
          <EmployeesCard company={c} employees={p.employees} leave={p.leave ?? {}} today={p.today} />
          <section class="info" id="rocne" aria-labelledby="rocne-t">
            <h2 id="rocne-t" class="info__title">
              {w.settlement.open}
            </h2>
            <p class="info__lead">{w.settlement.openLead}</p>
            <a class="btn btn--line btn--small" href={`${base(c)}/rocne`}>
              {w.settlement.open}
            </a>
          </section>
          <RegistrationsCard company={c} registrations={p.registrations ?? []} today={p.today} />
          <SettingsCard company={c} insurers={p.settings.insurers} values={p.settings.values} errors={p.settings.errors} today={p.today} />
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

const Select: FC<{
  id: string
  name: string
  label: string
  value: string
  options: Record<string, string>
  error?: string
  hint?: string
}> = (p) => (
  <div class="fgrid__cell fgrid__cell--wide">
    <label class="field__label" for={p.id}>
      {p.label}
    </label>
    <select id={p.id} class="field__input" name={p.name} aria-invalid={p.error ? 'true' : undefined}>
      {Object.entries(p.options).map(([value, label]) => (
        <option value={value} selected={p.value === value}>
          {label}
        </option>
      ))}
    </select>
    {p.error ? <p class="field__error">{p.error}</p> : p.hint ? <p class="field__hint">{p.hint}</p> : null}
  </div>
)

export const EmployeePage: FC<{ company: Company; form: EmployeeForm; centers?: CostCenter[] }> = ({ company, form, centers = [] }) => {
  const v = form.values
  const e = form.errors
  const tick = (name: string, label: string, hint?: string, error?: string) => (
    <div class="fgrid__cell fgrid__cell--wide">
      <label class="tickbox">
        <input type="checkbox" name={name} value="1" checked={v[name] === '1'} />
        <span>{label}</span>
      </label>
      {error ? <p class="field__error">{error}</p> : hint ? <p class="field__hint">{hint}</p> : null}
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
          <Select id="z-vztah" name="vztah" label={w.form.contract} value={v.vztah ?? 'employment'} options={w.contracts} error={e.vztah} />
          {tick('pravidelny', w.form.regular, w.form.regularHint)}
          <Select id="z-dochodok" name="dochodok" label={w.form.pension} value={v.dochodok ?? 'none'} options={w.pensions} />
          {tick('oop', w.form.exemption, undefined, e.oop)}
          <Select
            id="z-poistovna"
            name="poistovna"
            label={w.form.insurer}
            value={v.poistovna ?? '25'}
            options={Object.fromEntries((Object.keys(INSURERS) as Insurer[]).map((code) => [code, `${INSURERS[code]} (${code})`]))}
            error={e.poistovna}
          />
          <Field id="z-nastup" name="nastup" label={w.form.started} value={v.nastup ?? ''} error={e.nastup} max={16} />
          <Field id="z-skoncenie" name="skoncenie" label={w.form.ended} value={v.skoncenie ?? ''} hint={w.form.endedHint} error={e.skoncenie} max={16} />
          <Select id="z-odmenovanie" name="odmenovanie" label={w.form.wageKind} value={v.odmenovanie ?? 'monthly'} options={w.wageKinds} />
          <Field id="z-mzda" name="mzda" label={w.form.wage} value={v.mzda ?? ''} error={e.mzda} mode="decimal" max={14} />
          <Field id="z-hodiny" name="hodiny" label={w.form.weeklyHours} value={v.hodiny ?? ''} error={e.hodiny} mode="decimal" max={6} />
          <Field id="z-dovolenka" name="dovolenka" label={w.form.leaveDays} value={v.dovolenka ?? ''} hint={w.form.leaveHint} error={e.dovolenka} mode="decimal" max={6} />
          <Field id="z-iban" name="iban" label={w.form.iban} value={v.iban ?? ''} error={e.iban} max={34} />
          <Select id="z-stravne" name="stravne" label={w.meals.choice} value={v.stravne ?? ''} options={w.meals.choices} hint={w.meals.choiceHint} />
          <Field id="z-vyzivovani" name="vyzivovani" label={w.garnish.dependents} value={v.vyzivovani ?? ''} hint={w.garnish.dependentsHint} error={e.vyzivovani} mode="numeric" max={2} />
          {centers.length > 0 ? (
            <Select
              id="z-stredisko"
              name="stredisko"
              label={w.form.center}
              value={v.stredisko ?? ''}
              options={Object.fromEntries([['', w.form.centerNone], ...centers.filter((x) => !x.archived || x.id === v.stredisko).map((x) => [x.id, `${x.code} ${x.name}`])])}
              hint={w.form.centerHint}
              error={e.stredisko}
            />
          ) : null}
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
                    <input
                      id={`z-dieta-${i}`}
                      class="field__input"
                      name={`dieta_${i}`}
                      value={v[`dieta_${i}`] ?? ''}
                      maxlength={80}
                      autocomplete="off"
                      aria-invalid={e[`dieta_${i}`] ? 'true' : undefined}
                    />
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

/** A person's payslip for a month, to print or save as PDF (the written statement of § 130(5) of the Labour Code). */
export const PayslipPage: FC<{
  company: Company
  period: string
  line: SlipLine
  today: string
}> = ({ company, period, line, today }) => (
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
      <p class="info__source">
        {contractLine(line)} · {w.days(line.days)}
        {line.pay && line.pay.worked > 0 ? ` · ${hundredthsText(line.pay.worked)} h` : ''}
      </p>
      <SlipDetail line={line} />
      <p class="info__source wsheet__print">
        {w.print} · {textDay(today)}
      </p>
    </article>
  </>
)
