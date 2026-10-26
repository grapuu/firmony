// E-invoices through Peppol on the pages (26 October 2026): the invoice's card that sends it and follows its state,
// the company's place in the network, and a workspace's received invoices with the QR code that pays them.
import type { FC } from 'hono/jsx'
import { dayName } from '../app/copy'
import { payBySquare, qrPicture } from '../app/paybysquare'
import { formatMoney, groupIban } from '../format'
import { peppolCopy as p } from '../peppol/copy'
import type { Lookup } from '../peppol/participant'
import type { Blocked, Received, Sending } from '../peppol/store'
import { bratislavaClock, bratislavaDay } from '../time'
import { Flash, Heading } from './inside'
import { ART } from '../config'
import { Tile } from './home'

const when = (seconds: number, today: string) => p.card.at(dayName(bratislavaDay(seconds), today), bratislavaClock(seconds))

export interface PeppolView {
  /** Whether a postman is connected: without it the card says when sending starts. */
  live: boolean
  blocked: Blocked | null
  customer: Lookup | null
  customerName: string
  sendings: Sending[]
  invoiceId: string
  issuedAt: number
}

/** The steps of an e-invoice's way, each lit once reached. */
const Steps: FC<{ s: Sending; issuedAt: number; today: string }> = ({ s, issuedAt, today }) => {
  const c = p.card
  const steps: { label: string; at: number | null; tone: 'on' | 'wait' | 'off' | 'bad' }[] = [{ label: c.issued, at: issuedAt, tone: 'on' }]
  if (s.state === 'failed') steps.push({ label: c.states.failed ?? '', at: s.stateAt, tone: 'bad' })
  else {
    steps.push(s.state === 'queued' ? { label: c.states.queued ?? '', at: null, tone: 'wait' } : { label: c.states.sent ?? '', at: s.sentAt, tone: 'on' })
    steps.push(
      s.state === 'delivered'
        ? { label: c.states.delivered ?? '', at: s.stateAt, tone: 'on' }
        : s.state === 'rejected'
          ? { label: c.states.rejected ?? '', at: s.stateAt, tone: 'bad' }
          : { label: c.states.delivered ?? '', at: null, tone: 'off' },
    )
  }
  return (
    <ol class="einv__steps">
      {steps.map((step) => (
        <li class={`einv__step einv__step--${step.tone}`}>
          <span class="einv__dot" aria-hidden="true" />
          <span class="einv__label">{step.label}</span>
          {step.at ? <span class="einv__at">{when(step.at, today)}</span> : null}
        </li>
      ))}
    </ol>
  )
}

/** The invoice's e-invoice: who can receive it, the one click that sends it, and where it is now. */
export const PeppolCard: FC<{ view: PeppolView; today: string; error?: string | null }> = ({ view, today, error = null }) => {
  const c = p.card
  const current = view.sendings[0] ?? null
  const found = view.customer?.state === 'found'
  const again = current && (current.state === 'rejected' || current.state === 'failed')
  const sendForm = (label: string) => (
    <form method="post" action={`/app/faktury/${view.invoiceId}/einvoice`}>
      <button class="btn btn--blue invoice__wide" type="submit">
        {label}
      </button>
    </form>
  )
  return (
    <section class="info einv" id="efaktura" aria-labelledby="efaktura-t">
      <h2 id="efaktura-t" class="info__title">
        {c.title}
        {current ? <span class={`pill einv__pill einv__pill--${current.state}`}>{c.states[current.state]}</span> : null}
      </h2>
      <Flash text={error} tone="error" />
      {current ? (
        <>
          <Steps s={current} issuedAt={view.issuedAt} today={today} />
          {current.state === 'queued' ? <p class="info__lead">{current.tries > 0 ? c.retrying : c.queuedLead}</p> : null}
          {current.state === 'sent' ? <p class="info__lead">{c.sentLead}</p> : null}
          {current.state === 'delivered' ? <p class="info__lead">{c.deliveredLead}</p> : null}
          {current.state === 'rejected' ? (
            <>
              <p class="flag">{c.rejected(current.reason ?? '')}</p>
              <p class="info__source">{c.rejectedNext}</p>
            </>
          ) : null}
          {current.state === 'failed' ? <p class="flag">{c.failed(current.reason ?? '')}</p> : null}
          {again && view.live && !view.blocked && found ? sendForm(c.sendAgain) : null}
        </>
      ) : view.blocked === 'sellerId' ? (
        <>
          <p class="info__lead">{c.sellerId}</p>
          <a class="btn btn--line invoice__wide" href="/app/firma">
            {c.sellerIdLink}
          </a>
        </>
      ) : view.blocked === 'ended' ? (
        <p class="info__lead">{c.ended}</p>
      ) : !view.live ? (
        <p class="info__lead">{found ? c.soon(view.customerName) : c.soonMissing}</p>
      ) : view.customer?.state === 'missing' ? (
        <p class="info__lead">{c.missing(view.customerName)}</p>
      ) : view.customer?.state === 'unknown' ? (
        <p class="info__lead">{c.unknown}</p>
      ) : (
        <>
          <p class="info__lead">{c.sendLead(view.customerName)}</p>
          {sendForm(c.send)}
        </>
      )}
    </section>
  )
}

/** A small mark of an invoice's e-invoice in the list. */
export const EinvoicePill: FC<{ state: Sending['state'] | undefined }> = ({ state }) =>
  state ? <span class={`einv__mark einv__mark--${state}`}>{p.list.pill[state]}</span> : null

export interface CompanyPeppol {
  participant: string | null
  lookup: Lookup | null
  live: boolean
  /** The connected postman's SMP host: a registration there is ours. */
  ourSmp: string | null
}

/** Where the company stands in the Peppol network, in the company's settings. */
export const PeppolCompany: FC<{ state: CompanyPeppol }> = ({ state }) => {
  const c = p.company
  const l = state.lookup
  const ours = l?.state === 'found' && state.live && state.ourSmp !== null && l.smp === state.ourSmp
  return (
    <section class="info einv" id="peppol" aria-labelledby="peppol-t">
      <h2 id="peppol-t" class="info__title">
        {c.title}
        {l?.state === 'found' ? <span class={`pill einv__pill einv__pill--${ours || !state.live ? 'delivered' : 'sent'}`}>{ours ? 'Zapnuté' : 'V sieti'}</span> : null}
      </h2>
      {!state.participant ? (
        <p class="info__lead">{c.noDic}</p>
      ) : (
        <>
          {l?.state === 'found' ? (
            ours ? (
              <p class="info__lead">{c.ours}</p>
            ) : state.live ? (
              <>
                <p class="info__lead">{c.elsewhere(l.smp ?? '')}</p>
                <p class="info__source">{c.elsewhereNote}</p>
              </>
            ) : (
              <p class="info__lead">{c.registered}</p>
            )
          ) : l?.state === 'missing' ? (
            <>
              <p class="info__lead">{c.missing}</p>
              <p class="info__source">{state.live ? c.howOurs : c.howSoon}</p>
            </>
          ) : (
            <p class="info__lead">{c.unknown}</p>
          )}
          <p class="info__source">{c.id(state.participant)}</p>
        </>
      )}
    </section>
  )
}

/** A received invoice's pill: paid green, past its due day amber, else blue (as the issued ones). */
const tone = (x: Received, today: string) => (x.paidOn ? 'pill--ok' : x.dueOn && x.dueOn < today ? 'pill--amber' : 'pill--blue')

/** A workspace's received e-invoices. */
export const ReceivedPage: FC<{ list: Received[]; today: string }> = ({ list, today }) => {
  const r = p.received
  return (
    <>
      <header class="phead">
        <Heading first={r.title} small />
        <p class="phead__lead">{r.lead}</p>
      </header>
      {list.length === 0 ? (
        <section class="info">
          <p class="info__empty">{r.empty}</p>
        </section>
      ) : (
        <ul class="rows rows--card">
          {list.map((x) => (
            <li class="row">
              <a class="row__link" href={`/app/prijate/${x.id}`}>
                <Tile art={ART.paperInvoice} size="sm" />
                <span class="row__text">
                  <span class="row__title">{x.party ?? r.supplier}</span>
                  <span class="row__sub">
                    {x.number ? <span>{x.number}</span> : null}
                    {x.dueOn ? <span>{`${r.due} ${dayName(x.dueOn, today)}`}</span> : null}
                  </span>
                </span>
                <span class="row__end">
                  <span class="row__amount">{x.totalCents !== null ? formatMoney(x.totalCents, x.currency ?? 'EUR') : ''}</span>
                  <span class={`pill ${tone(x, today)}`}>{x.paidOn ? r.paid(dayName(x.paidOn, today)) : r.unpaid}</span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

/** One received e-invoice: what it asks, the QR code that pays it, the mark of the payment. */
export const ReceivedOne: FC<{ x: Received; today: string; flash?: string | null; error?: string | null }> = ({ x, today, flash = null, error = null }) => {
  const r = p.received
  const euro = (x.currency ?? 'EUR') === 'EUR'
  const text = !x.paidOn && euro && x.partyIban && x.totalCents ? payBySquare({ iban: x.partyIban, amountCents: x.totalCents, vs: x.vs, due: x.dueOn, name: x.party ?? '', note: x.number ? `Faktura ${x.number}` : 'Faktura' }) : null
  const qr = text ? qrPicture(text) : null
  return (
    <>
      <a class="back" href="/app/prijate">
        {r.back}
      </a>
      <header class="phead phead--row">
        <div>
          <Heading first={`${x.party ?? r.supplier}`} small />
          <p class="phead__lead">{[x.number, x.totalCents !== null ? formatMoney(x.totalCents, x.currency ?? 'EUR') : null].filter(Boolean).join(', ')}</p>
        </div>
        <span class={`pill ${tone(x, today)} phead__aside`}>{x.paidOn ? r.paid(dayName(x.paidOn, today)) : r.unpaid}</span>
      </header>
      <Flash text={flash} />
      <div class="invoice">
        <div class="invoice__paper">
          <section class="info">
            {qr ? (
              <div class="taxret__pay">
                <figure class="sheet__qr taxret__qr">
                  <svg viewBox={`0 0 ${qr.size} ${qr.size}`} role="img" aria-label={r.pay} shape-rendering="crispEdges">
                    <rect width={String(qr.size)} height={String(qr.size)} fill="#ffffff" />
                    <path fill="#000000" d={qr.path} />
                  </svg>
                  <figcaption>
                    {r.payLead}
                    <span>PAY by square</span>
                  </figcaption>
                </figure>
              </div>
            ) : !x.paidOn ? (
              <p class="info__lead">{r.noQr}</p>
            ) : null}
            <dl class="kv">
              {x.totalCents !== null ? (
                <div>
                  <dt>{r.amount}</dt>
                  <dd>{formatMoney(x.totalCents, x.currency ?? 'EUR')}</dd>
                </div>
              ) : null}
              {x.dueOn ? (
                <div>
                  <dt>{r.due}</dt>
                  <dd>{dayName(x.dueOn, today)}</dd>
                </div>
              ) : null}
              {x.partyIban ? (
                <div>
                  <dt>{r.iban}</dt>
                  <dd class="kv__long">{groupIban(x.partyIban)}</dd>
                </div>
              ) : null}
              {x.vs ? (
                <div>
                  <dt>{r.vs}</dt>
                  <dd>{x.vs}</dd>
                </div>
              ) : null}
            </dl>
            <p class="info__source">{r.receivedAt(dayName(bratislavaDay(x.receivedAt), today))}</p>
          </section>
        </div>
        <aside class="invoice__side">
          <section class="info">
            {x.paidOn ? (
              <form method="post" action={`/app/prijate/${x.id}/nezaplatena`}>
                <button class="btn btn--line invoice__wide" type="submit">
                  {r.unmark}
                </button>
              </form>
            ) : (
              <form class="stack" method="post" action={`/app/prijate/${x.id}/zaplatena`} novalidate>
                <label class="field__label" for="prijata-den">
                  Deň platby
                </label>
                <input id="prijata-den" class="field__input" name="den" value={dayName(today).replace(/\u00a0/g, ' ')} inputmode="numeric" maxlength={16} autocomplete="off" aria-invalid={error ? 'true' : undefined} />
                {error ? <p class="field__error">{error}</p> : null}
                <button class="btn btn--blue invoice__wide" type="submit">
                  {r.mark}
                </button>
              </form>
            )}
            <a class="btn btn--line invoice__wide" href={`/app/prijate/${x.id}/xml`}>
              {r.xml}
            </a>
          </section>
        </aside>
      </div>
    </>
  )
}
