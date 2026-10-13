// Faktúry: the list with what waits to be paid, the form, the invoice as a sheet of paper, and the page a customer
// opens from the email. The sheet is one component for the app, the customer's page, the accountant and print.
import type { FC } from 'hono/jsx'
import { ART, BRAND } from '../config'
import { formatEur, formatEurExact } from '../format'
import { app, dayName } from '../app/copy'
import { UNITS, VAT_RATES, stateOf, totalsOf, type Errors, type InvoiceState, type InvoiceValues, type Line, type StoredInvoice } from '../app/invoices'
import { payBySquare, qrPicture } from '../app/paybysquare'
import type { Company } from '../app/store'
import { Tile } from './home'
import { Flash, Heading, InsideHead } from './inside'
import { groupIban } from './inside-pages'
import { Wordmark } from './layout'

const t = app.invoices

const PILL: Record<InvoiceState, string> = { draft: 'pill--grey', unpaid: 'pill--blue', overdue: 'pill--amber', paid: 'pill--ok' }

export const InvoicesPage: FC<{ invoices: StoredInvoice[]; today: string; flash?: string | null; closed?: string | null }> = ({ invoices, today, flash, closed = null }) => {
  const month = today.slice(0, 7)
  const sum = (pick: (i: StoredInvoice) => boolean) => invoices.filter(pick).reduce((total, i) => total + i.totalCents, 0)
  const unpaid = sum((i) => stateOf(i, today) === 'unpaid' || stateOf(i, today) === 'overdue')
  const overdue = sum((i) => stateOf(i, today) === 'overdue')
  const paid = sum((i) => stateOf(i, today) === 'paid' && (i.paidOn ?? '').startsWith(month))
  return (
    <>
      <header class="phead phead--row">
        <div>
          <Heading first={t.title} second={t.serif} />
          <p class="phead__lead">{t.lead}</p>
        </div>
        {closed ? null : (
          <a class="btn btn--blue" href="/app/faktury/nova">
            {t.add}
          </a>
        )}
      </header>
      <Flash text={flash} />
      {closed ? <p class="closednote">{closed}</p> : null}
      {invoices.length === 0 ? (
        <section class="nothing">
          <Tile art={ART.paperInvoice} size="lg" />
          <p class="nothing__title">{t.empty}</p>
          <p class="nothing__lead">{t.emptyLead}</p>
          {closed ? null : (
            <a class="btn btn--blue" href="/app/faktury/nova">
              {t.add}
            </a>
          )}
        </section>
      ) : (
        <>
          <dl class="figs__grid">
            <div class="fig">
              <dt>{t.toCollect}</dt>
              <dd class="fig__value">{formatEur(unpaid)}</dd>
            </div>
            <div class="fig">
              <dt>{t.overdueSum}</dt>
              <dd class={`fig__value${overdue > 0 ? ' fig__value--due' : ''}`}>{formatEur(overdue)}</dd>
            </div>
            <div class="fig">
              <dt>{t.paidMonth}</dt>
              <dd class="fig__value fig__value--in">{formatEur(paid)}</dd>
            </div>
          </dl>
          <ul class="rows rows--card invoices">
            {invoices.map((i) => {
              const state = stateOf(i, today)
              return (
                <li class="row">
                  <a class="row__link" href={`/app/faktury/${i.id}`}>
                    <Tile art={ART.paperInvoice} size="sm" />
                    <span class="row__text">
                      <span class="row__title">{i.customerName}</span>
                      <span class="row__sub">
                        <span>{i.number ?? t.draftName}</span>
                        <span>{state === 'paid' && i.paidOn ? t.paidOn(dayName(i.paidOn, today)) : t.dueOn(dayName(i.dueOn, today))}</span>
                      </span>
                    </span>
                    <span class="row__end">
                      <span class="row__amount">{formatEur(i.totalCents)}</span>
                      <span class={`pill ${PILL[state]}`}>{t.state[state]}</span>
                    </span>
                  </a>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------------------------------------------
// The form
// ---------------------------------------------------------------------------------------------------------------

export interface InvoiceFormProps {
  id: string | null
  values: InvoiceValues
  vatPayer: boolean
  errors: Errors
  found?: string | null
  /** The sums of what was typed so far, when it could be read. */
  preview: Line[]
  /** Customers of earlier invoices, for a new invoice to start from. */
  recent?: { id: string; name: string }[]
}

const Text: FC<{ name: string; label: string; value: string; error?: string; hint?: string; wide?: boolean; type?: string; mode?: 'numeric' | 'decimal' | 'email'; max?: number }> = ({ name, label, value, error, hint, wide, type = 'text', mode, max = 200 }) => (
  <div class={`fgrid__cell${wide ? ' fgrid__cell--wide' : ''}`}>
    <label class="field__label" for={`f-${name}`}>
      {label}
    </label>
    <input id={`f-${name}`} class="field__input" type={type} name={name} value={value} inputmode={mode} maxlength={max} aria-invalid={error ? 'true' : undefined} />
    {error ? <p class="field__error">{error}</p> : hint ? <p class="field__hint">{hint}</p> : null}
  </div>
)

export const InvoiceFormPage: FC<InvoiceFormProps> = ({ id, values, vatPayer, errors, found, preview, recent = [] }) => {
  const f = t.form
  const totals = totalsOf(preview, vatPayer)
  return (
    <>
      <a class="back" href="/app/faktury">
        {t.actions.back}
      </a>
      <header class="phead">
        <Heading first={id ? f.editTitle : f.title} small />
      </header>
      <Flash text={errors.form} tone="error" />
      <form class="invform" method="post" action={id ? `/app/faktury/${id}` : '/app/faktury'} novalidate>
        <input type="hidden" name="riadky" value={String(values.lines.length)} />
        <section class="info" aria-labelledby="odberatel-t">
          <h2 id="odberatel-t" class="info__title">
            {f.customer}
          </h2>
          {recent.length > 0 && !id && values.customerName === '' ? (
            <div class="recent">
              <p class="recent__label">{f.recent}</p>
              <ul class="recent__list">
                {recent.map((r) => (
                  <li>
                    <a class="recent__item" href={`/app/faktury/nova?odberatel=${r.id}`}>
                      {r.name}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <div class="fgrid">
            <Text name="ico" label={f.ico} value={values.customerIco} error={errors.customerIco} hint={found ?? f.icoHint} mode="numeric" max={12} />
            <div class="fgrid__cell fgrid__cell--end">
              <button class="btn btn--line" type="submit" name="akcia" value="register" formnovalidate>
                {f.lookup}
              </button>
            </div>
            <Text name="meno" label={f.name} value={values.customerName} error={errors.customerName} wide />
            <Text name="adresa" label={f.address} value={values.customerAddress} wide max={300} />
            <Text name="dic" label={f.dic} value={values.customerDic} mode="numeric" max={12} />
            <Text name="icdph" label={f.icdph} value={values.customerIcdph} max={14} />
            <Text name="email" label={f.email} value={values.customerEmail} error={errors.customerEmail} hint={f.emailHint} type="email" wide />
          </div>
        </section>
        <section class="info" aria-labelledby="datumy-t">
          <h2 id="datumy-t" class="info__title">
            {f.dates}
          </h2>
          <div class="fgrid fgrid--three">
            <Text name="vystavena" label={f.issued} value={values.issued} error={errors.issued} max={16} />
            <Text name="dodana" label={f.delivered} value={values.delivered} error={errors.delivered} max={16} />
            <Text name="splatna" label={f.due} value={values.due} error={errors.due} max={16} />
          </div>
        </section>
        <section class="info" aria-labelledby="polozky-t">
          <h2 id="polozky-t" class="info__title">
            {f.items}
          </h2>
          {errors.lines ? <p class="field__error">{errors.lines}</p> : null}
          <div class={`items${vatPayer ? ' items--vat' : ''}`}>
            <div class="items__head" aria-hidden="true">
              <span>{f.description}</span>
              <span>{f.quantity}</span>
              <span>{f.unit}</span>
              <span>{vatPayer ? f.priceVat : f.price}</span>
              {vatPayer ? <span>{f.vat}</span> : null}
            </div>
            {values.lines.map((line, i) => (
              <div class="items__row">
                <label class="sr" for={`r${i}-popis`}>
                  {f.description} {i + 1}
                </label>
                <input id={`r${i}-popis`} class="field__input items__desc" name={`r${i}-popis`} value={line.description} maxlength={300} placeholder={f.description} />
                <label class="sr" for={`r${i}-mnozstvo`}>
                  {f.quantity}
                </label>
                <input id={`r${i}-mnozstvo`} class="field__input" name={`r${i}-mnozstvo`} value={line.quantity} inputmode="decimal" maxlength={10} />
                <label class="sr" for={`r${i}-jednotka`}>
                  {f.unit}
                </label>
                <select id={`r${i}-jednotka`} class="field__input" name={`r${i}-jednotka`}>
                  {UNITS.map((unit) => (
                    <option value={unit} selected={line.unit === unit}>
                      {unit}
                    </option>
                  ))}
                </select>
                <label class="sr" for={`r${i}-cena`}>
                  {vatPayer ? f.priceVat : f.price}
                </label>
                <input id={`r${i}-cena`} class="field__input" name={`r${i}-cena`} value={line.price} inputmode="decimal" maxlength={14} placeholder="0,00" />
                {vatPayer ? (
                  <>
                    <label class="sr" for={`r${i}-dph`}>
                      {f.vat}
                    </label>
                    <select id={`r${i}-dph`} class="field__input" name={`r${i}-dph`}>
                      {VAT_RATES.map((rate) => (
                        <option value={String(rate)} selected={line.vat === String(rate)}>
                          {rate} %
                        </option>
                      ))}
                    </select>
                  </>
                ) : null}
              </div>
            ))}
          </div>
          <div class="items__foot">
            <button class="btn btn--text btn--small" type="submit" name="akcia" value="riadok" formnovalidate>
              {f.addLine}
            </button>
            <dl class="items__sum">
              {vatPayer ? (
                <>
                  <div>
                    <dt>{f.totalBase}</dt>
                    <dd>{formatEurExact(totals.base)}</dd>
                  </div>
                  <div>
                    <dt>{f.totalVat}</dt>
                    <dd>{formatEurExact(totals.vat)}</dd>
                  </div>
                </>
              ) : null}
              <div class="items__total">
                <dt>{f.total}</dt>
                <dd>{formatEurExact(totals.total)}</dd>
              </div>
            </dl>
          </div>
        </section>
        <section class="info" aria-labelledby="uhrada-t">
          <h2 id="uhrada-t" class="info__title">
            {f.payment}
          </h2>
          <div class="fgrid">
            <Text name="iban" label={f.iban} value={values.iban} error={errors.iban} wide max={42} />
            <div class="fgrid__cell fgrid__cell--wide">
              <label class="field__label" for="f-poznamka">
                {f.note}
              </label>
              <textarea id="f-poznamka" class="field__input field__area" name="poznamka" rows={2} maxlength={1000} placeholder={f.notePlaceholder}>
                {values.note}
              </textarea>
            </div>
          </div>
        </section>
        <div class="invform__actions">
          <p class="invform__lead">{f.issueLead}</p>
          <button class="btn btn--blue btn--large" type="submit" name="akcia" value="vystavit">
            {f.issue}
          </button>
          <button class="btn btn--line" type="submit" name="akcia" value="koncept">
            {f.draft}
          </button>
          {id ? (
            <button class="btn btn--text book__discard" type="submit" name="akcia" value="zahodit" formnovalidate>
              {f.deleteDraft}
            </button>
          ) : null}
        </div>
      </form>
    </>
  )
}

// ---------------------------------------------------------------------------------------------------------------
// The invoice as paper
// ---------------------------------------------------------------------------------------------------------------

const qty = (milli: number) => (milli % 1000 === 0 ? String(milli / 1000) : (milli / 1000).toFixed(3).replace(/0+$/, '').replace('.', ','))

/** The QR code a bank's app pays from, for an issued invoice with an account and something to pay. */
function payQr(invoice: StoredInvoice, total: number, seller: Company) {
  if (!invoice.number || !invoice.iban) return null
  const text = payBySquare({ iban: invoice.iban, amountCents: total, vs: invoice.number, due: invoice.dueOn, name: seller.name, note: `${t.sheet.title} ${invoice.number}` })
  return text ? qrPicture(text) : null
}

export const InvoiceSheet: FC<{ invoice: StoredInvoice; lines: Line[]; seller: Company; pay?: boolean }> = ({ invoice, lines, seller, pay = true }) => {
  const s = t.sheet
  const totals = totalsOf(lines, seller.vatPayer)
  const qr = pay ? payQr(invoice, totals.total, seller) : null
  return (
    <article class="sheet" aria-label={`${s.title} ${invoice.number ?? ''}`}>
      <header class="sheet__head">
        <div class="sheet__from">
          <p class="sheet__company">{seller.name}</p>
          {seller.address ? <p>{seller.address}</p> : null}
          <p class="sheet__ids">
            {seller.ico ? (
              <span>
                {s.ico} {seller.ico}
              </span>
            ) : null}
            {seller.dic ? (
              <span>
                {s.dic} {seller.dic}
              </span>
            ) : null}
            {seller.icdph ? (
              <span>
                {s.icdph} {seller.icdph}
              </span>
            ) : null}
          </p>
        </div>
        <div class="sheet__title">
          <p class="sheet__kind">{s.title}</p>
          <p class="sheet__number">{invoice.number ? s.number(invoice.number) : t.draftName}</p>
        </div>
      </header>
      <div class="sheet__parties">
        <div class="sheet__to">
          <p class="sheet__label">{s.customer}</p>
          <p class="sheet__company">{invoice.customerName}</p>
          {invoice.customerAddress ? <p>{invoice.customerAddress}</p> : null}
          <p class="sheet__ids">
            {invoice.customerIco ? (
              <span>
                {s.ico} {invoice.customerIco}
              </span>
            ) : null}
            {invoice.customerDic ? (
              <span>
                {s.dic} {invoice.customerDic}
              </span>
            ) : null}
            {invoice.customerIcdph ? (
              <span>
                {s.icdph} {invoice.customerIcdph}
              </span>
            ) : null}
          </p>
        </div>
        <dl class="sheet__dates">
          <div>
            <dt>{s.issued}</dt>
            <dd>{dayName(invoice.issuedOn)}</dd>
          </div>
          <div>
            <dt>{s.delivered}</dt>
            <dd>{dayName(invoice.deliveredOn)}</dd>
          </div>
          <div>
            <dt>{s.due}</dt>
            <dd>{dayName(invoice.dueOn)}</dd>
          </div>
          {invoice.number ? (
            <div>
              <dt>{s.vs}</dt>
              <dd>{invoice.number}</dd>
            </div>
          ) : null}
        </dl>
      </div>
      <div class="sheet__table">
        <table>
          <thead>
            <tr>
              <th scope="col">{s.description}</th>
              <th scope="col">{s.quantity}</th>
              <th scope="col">{s.unitPrice}</th>
              {seller.vatPayer ? <th scope="col">{s.vat}</th> : null}
              <th scope="col">{s.amount}</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr>
                <td>
                  {line.description}
                  <span class="sheet__lineinfo">
                    {qty(line.quantityMilli)} {line.unit ?? ''} × {formatEurExact(line.unitCents)}
                    {seller.vatPayer ? `, ${s.vat} ${line.vatRate} %` : ''}
                  </span>
                </td>
                <td>
                  {qty(line.quantityMilli)} {line.unit ?? ''}
                </td>
                <td>{formatEurExact(line.unitCents)}</td>
                {seller.vatPayer ? <td>{line.vatRate} %</td> : null}
                <td>{formatEurExact(line.baseCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div class="sheet__bottom">
        <div class="sheet__payment">
        {qr ? (
          <figure class="sheet__qr">
            <svg viewBox={`0 0 ${qr.size} ${qr.size}`} role="img" aria-label={s.qrLabel} shape-rendering="crispEdges">
              <rect width={String(qr.size)} height={String(qr.size)} fill="#ffffff" />
              <path fill="#000000" d={qr.path} />
            </svg>
            <figcaption>
              {s.qr}
              <span>PAY by square</span>
            </figcaption>
          </figure>
        ) : null}
        <dl class="sheet__pay">
          <div>
            <dt>{s.method}</dt>
            <dd>{s.transfer}</dd>
          </div>
          {invoice.iban ? (
            <div>
              <dt>{s.iban}</dt>
              <dd>{groupIban(invoice.iban)}</dd>
            </div>
          ) : null}
          {invoice.number ? (
            <div>
              <dt>{s.vs}</dt>
              <dd>{invoice.number}</dd>
            </div>
          ) : null}
        </dl>
        </div>
        <dl class="sheet__totals">
          {seller.vatPayer
            ? totals.rates.flatMap((r) => [
                <div>
                  <dt>{s.base(r.rate)}</dt>
                  <dd>{formatEurExact(r.base)}</dd>
                </div>,
                <div>
                  <dt>{s.vatOf(r.rate)}</dt>
                  <dd>{formatEurExact(r.vat)}</dd>
                </div>,
              ])
            : null}
          <div class="sheet__total">
            <dt>{s.total}</dt>
            <dd>{formatEurExact(totals.total)}</dd>
          </div>
        </dl>
      </div>
      {invoice.note ? <p class="sheet__note">{invoice.note}</p> : null}
      <footer class="sheet__foot">
        {seller.vatPayer ? null : <p>{s.noVat}</p>}
        {seller.registerLine ? <p>{seller.registerLine}</p> : null}
        {invoice.createdByName ? <p>{s.by(invoice.createdByName)}</p> : null}
      </footer>
    </article>
  )
}

export const InvoicePage: FC<{ invoice: StoredInvoice; lines: Line[]; seller: Company; today: string; link: string; flash?: string | null; error?: string | null }> = ({ invoice, lines, seller, today, link, flash, error }) => {
  const a = t.actions
  const state = stateOf(invoice, today)
  return (
    <>
      <a class="back" href="/app/faktury">
        {a.back}
      </a>
      <header class="phead phead--row">
        <div>
          <Heading first={`${t.sheet.title} ${invoice.number ?? ''}`.trim()} small />
          <p class="phead__lead">
            {invoice.customerName}, {formatEurExact(invoice.totalCents)}
          </p>
        </div>
        <span class={`pill ${PILL[state]} phead__aside`}>{state === 'paid' && invoice.paidOn ? t.paidOn(dayName(invoice.paidOn, today)) : t.state[state]}</span>
      </header>
      <Flash text={flash} />
      <Flash text={error} tone="error" />
      <div class="invoice">
        <div class="invoice__paper">
          <InvoiceSheet invoice={invoice} lines={lines} seller={seller} pay={state !== 'paid'} />
        </div>
        <aside class="invoice__side">
          <section class="info">
            {invoice.customerEmail ? (
              <form method="post" action={`/app/faktury/${invoice.id}/poslat`}>
                <button class={`btn ${invoice.sentAt ? 'btn--line' : 'btn--blue'} invoice__wide`} type="submit">
                  {invoice.sentAt ? a.resend : a.send}
                </button>
              </form>
            ) : (
              <form class="invoice__mail" method="post" action={`/app/faktury/${invoice.id}/poslat`} novalidate>
                <p class="info__lead">{a.noEmail}</p>
                <label class="field__label" for="poslat-email">
                  {a.emailLabel}
                </label>
                <input id="poslat-email" class="field__input" type="email" name="email" maxlength={200} autocomplete="off" />
                <button class="btn btn--blue invoice__wide" type="submit">
                  {a.send}
                </button>
              </form>
            )}
            {invoice.sentAt ? <p class="info__source">{a.sent(dayName(new Date(invoice.sentAt * 1000).toISOString().slice(0, 10), today))}</p> : null}
            {state === 'overdue' && invoice.customerEmail ? (
              <form method="post" action={`/app/faktury/${invoice.id}/pripomenut`}>
                <button class="btn btn--line invoice__wide" type="submit">
                  {a.remind}
                </button>
              </form>
            ) : null}
            <button class="btn btn--line invoice__wide" type="button" data-print hidden>
              {a.print}
            </button>
            <a class="btn btn--line invoice__wide" href={`/app/faktury/${invoice.id}/xml`}>
              {a.xml}
            </a>
            <a class="btn btn--line invoice__wide" href={`/app/faktury/nova?podla=${invoice.id}`}>
              {a.copy}
            </a>
          </section>
          <section class="info">
            <h2 class="info__title">{a.payment}</h2>
            <p class="info__lead">{state === 'paid' && invoice.paidOn ? t.paidOn(dayName(invoice.paidOn, today)) : a.paymentNone}</p>
          </section>
          <section class="info">
            <h2 class="info__title">{a.link}</h2>
            <p class="info__lead">{a.linkLead}</p>
            <p class="copyline copyline--one">
              <span class="copyline__text">{link}</span>
              <button class="copyline__button" type="button" data-copy={link} data-done={app.add.copied} hidden>
                {app.add.copy}
              </button>
            </p>
            <a class="link invoice__view" href={link}>
              {a.view}
            </a>
          </section>
        </aside>
      </div>
    </>
  )
}

/** The page a customer opens from the email: the sheet, how to save it, the e-invoice. No sign-in. */
export const PublicInvoicePage: FC<{ invoice: StoredInvoice; lines: Line[]; seller: Company; token: string }> = ({ invoice, lines, seller, token }) => (
  <html lang="sk">
    <InsideHead title={`${t.public.title(invoice.number ?? '')} | ${seller.name}`} />
    <body class="inside inside--public">
      <main class="public">
        <div class="public__bar">
          <p class="public__lead">{t.public.lead}</p>
          <a class="btn btn--line btn--small" href={`/f/${token}/xml`}>
            {t.actions.xml}
          </a>
          <button class="btn btn--line btn--small" type="button" data-print hidden>
            {t.actions.print}
          </button>
        </div>
        {invoice.paidOn ? <p class="public__paid">{t.public.paid}</p> : null}
        <InvoiceSheet invoice={invoice} lines={lines} seller={seller} pay={!invoice.paidOn} />
        <p class="public__foot">
          {t.public.print} <Wordmark href={BRAND.origin} />
        </p>
      </main>
    </body>
  </html>
)
