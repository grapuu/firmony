// The client's taxes: every VAT return and every income tax return with the financial statements we filed for the
// company and what each came to; for a tax to pay, the account, the variable symbol, the due day and the QR code a
// Slovak bank's app reads (PAY by square), so that the payment arrives where it belongs and pairs itself with the
// return. What was already paid counts: after a correction only the rest is asked for, and paying more than the
// period comes to is said as an overpayment.
import type { FC } from 'hono/jsx'
import { DeliveryNotice } from './filings'
import { ART } from '../config'
import { formatEurExact } from '../format'
import { app, dayName } from '../app/copy'
import type { Company } from '../app/store'
import { payBySquare, qrPicture } from '../app/paybysquare'
import { groupedIban, INCOME_PREFIX, leftToPay, overpaid, payable, periodName, taxIban, TAX_PAYEE, vatSymbol, type FiledReturn, type TaxPaid } from '../app/vat-store'
import { incomeSymbol, type Closing, type IncomePaid } from '../app/closing-store'
import { Tile } from './home'
import { Heading } from './inside'

const x = app.taxes

/** The amount, the due day, the account, the symbol and the payee of a tax to pay, with the QR code a bank's app reads. */
const PayBox: FC<{ left: number; dueOn: string; iban: string | null; vs: string; note: string; today: string }> = ({ left, dueOn, iban, vs, note, today }) => {
  const text = iban ? payBySquare({ iban, amountCents: left, vs, due: dueOn, name: TAX_PAYEE, note }) : null
  const qr = text ? qrPicture(text) : null
  return (
    <>
      <div class="taxret__pay">
        {qr ? (
          <figure class="sheet__qr taxret__qr">
            <svg viewBox={`0 0 ${qr.size} ${qr.size}`} role="img" aria-label={x.qr} shape-rendering="crispEdges">
              <rect width={String(qr.size)} height={String(qr.size)} fill="#ffffff" />
              <path fill="#000000" d={qr.path} />
            </svg>
            <figcaption>
              {x.scan}
              <span>PAY by square</span>
            </figcaption>
          </figure>
        ) : null}
        <dl class="kv taxret__kv">
          <div>
            <dt>{x.toPay}</dt>
            <dd>{formatEurExact(left)}</dd>
          </div>
          <div>
            <dt>{x.due}</dt>
            <dd>{dayName(dueOn, today)}</dd>
          </div>
          {iban ? (
            <div>
              <dt>{x.account}</dt>
              <dd class="kv__long">{groupedIban(iban)}</dd>
            </div>
          ) : null}
          <div>
            <dt>{x.vs}</dt>
            <dd>{vs}</dd>
          </div>
          <div>
            <dt>{x.payee}</dt>
            <dd class="kv__long">{TAX_PAYEE}</dd>
          </div>
        </dl>
      </div>
      {iban ? null : <p class="info__lead">{x.noAccount}</p>}
    </>
  )
}

const Return: FC<{ company: Company; ret: FiledReturn; paid: TaxPaid | undefined; today: string }> = ({ company, ret, paid, today }) => {
  const owed = payable(company, ret)
  const left = leftToPay(company, ret, paid)
  const over = overpaid(company, ret, paid)
  const small = owed === 0 && ret.payCents > 0
  const late = left > 0 && today > ret.dueOn
  // What a supplementary return gives back is its row 37; a regular or corrective one's, its excess deduction.
  const back = ret.kind === 'D' ? Math.max(0, -ret.rows.r37) : ret.refundCents
  const pill = left > 0 ? [late ? 'pill--red' : 'pill--amber', formatEurExact(left)] : owed > 0 && paid ? ['pill--ok', x.paid(dayName(paid.last, today))] : ['pill--grey', x.nothing]
  return (
    <section class="info taxret" id={`dph-${ret.period}`} aria-labelledby={`dph-${ret.period}-t`}>
      <header class="info__row">
        <h2 id={`dph-${ret.period}-t`} class="info__title">
          {x.period(periodName(ret.period))}
        </h2>
        <span class={`pill ${pill[0]}`}>{pill[1]}</span>
      </header>
      <p class="info__source">{x.filed[ret.kind](dayName(ret.filedOn, today))}</p>
      <DeliveryNotice client status={ret.deliveryStatus} href={`/app/podania?obdobie=${ret.period}`} />
      {left > 0 ? (
        <>
          {late ? <p class="flag">{x.late}</p> : null}
          {paid && paid.cents > 0 ? <p class="info__lead">{x.partly(formatEurExact(paid.cents), formatEurExact(owed))}</p> : null}
          <PayBox left={left} dueOn={ret.dueOn} iban={company.taxAccount ? taxIban(company.taxAccount) : null} vs={vatSymbol(ret.period)} note={x.note(periodName(ret.period))} today={today} />
        </>
      ) : back > 0 ? (
        <p class="info__lead">{ret.kind === 'D' ? x.refundCorrection(formatEurExact(back)) : ret.fast ? x.refundFast(formatEurExact(back)) : x.refund(formatEurExact(back))}</p>
      ) : small ? (
        <p class="info__lead">{x.small}</p>
      ) : null}
      {over > 0 ? <p class="info__lead">{x.overpaid(formatEurExact(over))}</p> : null}
    </section>
  )
}

/** A year's income tax return filed: what it asks to pay (to the income tax's account, with the year's symbol) or the overpayment, and the advances it brings. */
const IncomeReturn: FC<{ company: Company; closing: Closing; paid: IncomePaid; today: string }> = ({ company, closing, paid, today }) => {
  const owed = closing.payCents
  const left = Math.max(0, owed - paid.tax)
  const over = Math.max(0, -(closing.filed?.rows.r1101 ?? 0)) + Math.max(0, paid.tax - owed)
  const dueOn = closing.dueOn ?? closing.filedOn ?? today
  const late = left > 0 && today > dueOn
  const next = closing.filed?.advancesNext ?? { kind: 'none', each: 0 }
  const pill = left > 0 ? [late ? 'pill--red' : 'pill--amber', formatEurExact(left)] : owed > 0 && paid.last ? ['pill--ok', x.paid(dayName(paid.last, today))] : ['pill--grey', x.nothing]
  return (
    <section class="info taxret" id={`dzp-${closing.year}`} aria-labelledby={`dzp-${closing.year}-t`}>
      <header class="info__row">
        <h2 id={`dzp-${closing.year}-t`} class="info__title">
          {x.income(closing.year)}
        </h2>
        <span class={`pill ${pill[0]}`}>{pill[1]}</span>
      </header>
      <p class="info__source">{x.incomeFiled(dayName(closing.filedOn ?? today, today))}</p>
      <DeliveryNotice client status={closing.deliveryStatus} href={`/app/podania?obdobie=${closing.year}`} />
      {left > 0 ? (
        <>
          {late ? <p class="flag">{x.late}</p> : null}
          {paid.tax > 0 ? <p class="info__lead">{x.partly(formatEurExact(paid.tax), formatEurExact(owed))}</p> : null}
          <PayBox left={left} dueOn={dueOn} iban={company.taxAccount ? taxIban(company.taxAccount, INCOME_PREFIX) : null} vs={incomeSymbol(closing.year)} note={x.incomeNote(closing.year)} today={today} />
        </>
      ) : null}
      {over > 0 ? <p class="info__lead">{x.incomeOver(formatEurExact(over))}</p> : null}
      {next.kind !== 'none' ? <p class="info__lead">{x.incomeAdvances[next.kind](formatEurExact(next.each))}</p> : null}
    </section>
  )
}

export interface TaxesPageProps {
  payroll?: boolean
  company: Company
  filed: FiledReturn[]
  paid: Map<string, TaxPaid>
  /** The income tax returns filed, the newest first, each with what was paid towards its year. */
  income: { closing: Closing; paid: IncomePaid }[]
  today: string
}

export const TaxesPage: FC<TaxesPageProps> = ({ company, filed, paid, income, today, payroll }) => (
  <>
    <header class="phead">
      <Heading first={x.title} second={x.serif} />
      <p class="phead__lead">{x.lead}</p>
      {payroll ? <p><a class="link" href="/app/mzdove-podania">Mzdové podania a potvrdenky</a></p> : null}
    </header>
    {company.vatStatus === 'none' && filed.length === 0 && income.length === 0 ? (
      <section class="nothing">
        <Tile art={ART.paperReturn} size="lg" />
        <p class="nothing__lead">{x.notRegistered}</p>
      </section>
    ) : filed.length === 0 && income.length === 0 ? (
      <section class="nothing">
        <Tile art={ART.paperReturn} size="lg" />
        <p class="nothing__lead">{x.empty}</p>
      </section>
    ) : (
      <div class="taxrets">
        {income.map((i) => (
          <IncomeReturn company={company} closing={i.closing} paid={i.paid} today={today} />
        ))}
        {filed.map((ret) => (
          <Return company={company} ret={ret} paid={paid.get(ret.period)} today={today} />
        ))}
      </div>
    )}
  </>
)
