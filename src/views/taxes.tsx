// The client's taxes: every VAT return we filed for the company and what it came to; for a tax to pay, the account,
// the variable symbol, the due day and the QR code a Slovak bank's app reads (PAY by square), so that the payment
// arrives where it belongs and pairs itself with the return. What was already paid towards a period counts: after a
// correction only the rest is asked for, and paying more than the period comes to is said as an overpayment.
import type { FC } from 'hono/jsx'
import { ART } from '../config'
import { formatEurExact } from '../format'
import { app, dayName } from '../app/copy'
import type { Company } from '../app/store'
import { payBySquare, qrPicture } from '../app/paybysquare'
import { groupedIban, leftToPay, overpaid, payable, periodName, taxIban, TAX_PAYEE, vatSymbol, type FiledReturn, type TaxPaid } from '../app/vat-store'
import { Tile } from './home'
import { Heading } from './inside'

const x = app.taxes

const Return: FC<{ company: Company; ret: FiledReturn; paid: TaxPaid | undefined; today: string }> = ({ company, ret, paid, today }) => {
  const owed = payable(company, ret)
  const left = leftToPay(company, ret, paid)
  const over = overpaid(company, ret, paid)
  const small = owed === 0 && ret.payCents > 0
  const iban = company.taxAccount ? taxIban(company.taxAccount) : null
  const vs = vatSymbol(ret.period)
  const text = iban && left > 0 ? payBySquare({ iban, amountCents: left, vs, due: ret.dueOn, name: TAX_PAYEE, note: x.note(periodName(ret.period)) }) : null
  const qr = text ? qrPicture(text) : null
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
      {left > 0 ? (
        <>
          {late ? <p class="flag">{x.late}</p> : null}
          {paid && paid.cents > 0 ? <p class="info__lead">{x.partly(formatEurExact(paid.cents), formatEurExact(owed))}</p> : null}
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
                <dd>{dayName(ret.dueOn, today)}</dd>
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
      ) : back > 0 ? (
        <p class="info__lead">{ret.kind === 'D' ? x.refundCorrection(formatEurExact(back)) : ret.fast ? x.refundFast(formatEurExact(back)) : x.refund(formatEurExact(back))}</p>
      ) : small ? (
        <p class="info__lead">{x.small}</p>
      ) : null}
      {over > 0 ? <p class="info__lead">{x.overpaid(formatEurExact(over))}</p> : null}
    </section>
  )
}

export const TaxesPage: FC<{ company: Company; filed: FiledReturn[]; paid: Map<string, TaxPaid>; today: string }> = ({ company, filed, paid, today }) => (
  <>
    <header class="phead">
      <Heading first={x.title} second={x.serif} />
      <p class="phead__lead">{x.lead}</p>
    </header>
    {company.vatStatus === 'none' && filed.length === 0 ? (
      <section class="nothing">
        <Tile art={ART.paperReturn} size="lg" />
        <p class="nothing__lead">{x.notRegistered}</p>
      </section>
    ) : filed.length === 0 ? (
      <section class="nothing">
        <Tile art={ART.paperReturn} size="lg" />
        <p class="nothing__lead">{x.empty}</p>
      </section>
    ) : (
      <div class="taxrets">
        {filed.map((ret) => (
          <Return company={company} ret={ret} paid={paid.get(ret.period)} today={today} />
        ))}
      </div>
    )}
  </>
)
