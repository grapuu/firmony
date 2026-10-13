// Banka: the company's bank as Pennylane and Dougs show it. Each consent with its accounts, when it was read and
// until when it holds, the banks to link, and the statement upload for whoever cannot or does not want to link.
import type { FC } from 'hono/jsx'
import { ART, BANK } from '../config'
import { formatEur } from '../format'
import { app, dayName, whenName } from '../app/copy'
import type { Aspsp, BankLinkView, BankNotice } from '../app/bank'
import { Tile } from './home'
import { Flash, Heading } from './inside'
import { groupIban } from './inside-pages'

const b = app.bank

/** Today in Bratislava, YYYY-MM-DD, for the moment a page is drawn. */
const dayOfSeconds = (seconds: number) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Bratislava' }).format(new Date(seconds * 1000))

export interface BankPageProps {
  /** Whether the bank can be linked at all (Enable Banking's application is set up). */
  ready: boolean
  links: BankLinkView[]
  /** The banks to pick from; null when they could not be asked. */
  banks: Aspsp[] | null
  owner: boolean
  today: string
  flash?: string | null
  error?: string | null
}

const pickHref = (bank: string) => `/app/banka/pripojit?banka=${encodeURIComponent(bank)}`

const LinkCard: FC<{
  link: BankLinkView
  owner: boolean
  today: string
  ready: boolean
}> = ({ link, owner, today, ready }) => {
  const ended = link.status !== 'active'
  const soon = !ended && link.validUntil !== null && link.validUntil - Date.now() / 1000 < BANK.renewDays * 86400
  return (
    <section class={`info banklink${ended ? ' banklink--ended' : ''}`} aria-labelledby={`banka-${link.id}`}>
      <header class="banklink__head">
        <Tile art={ART.paperBank} size="sm" />
        <div class="banklink__name">
          <h2 id={`banka-${link.id}`} class="info__title">
            {link.bank}
          </h2>
          <p class="banklink__sub">
            {ended ? b.ended : link.syncedAt ? b.read(whenName(link.syncedAt, today)) : b.notYet}
            {!ended && link.validUntil ? <span>{b.until(dayName(dayOfSeconds(link.validUntil), today))}</span> : null}
          </p>
        </div>
        <span class={`pill ${ended ? 'pill--amber' : 'pill--ok'}`}>{ended ? b.ended : b.linked}</span>
      </header>
      {ended ? <p class="info__lead">{b.endedLead}</p> : link.error ? <p class="info__lead banklink__warn">{b.failed}</p> : null}
      {link.accounts.length > 0 ? (
        <ul class="banklink__accounts" aria-label={b.accounts}>
          {link.accounts.map((a) => (
            <li class="banklink__account">
              <span class="banklink__iban">{groupIban(a.iban)}</span>
              {a.balanceCents !== null && a.balanceOn ? <span class="banklink__balance">{b.balance(formatEur(a.balanceCents, true), dayName(a.balanceOn, today))}</span> : null}
              {owner ? (
                <details class="banklink__drop">
                  <summary>{b.notCompany}</summary>
                  <form method="post" action={`/app/banka/ucet/${a.id}/odobrat`}>
                    <p>{b.notCompanyLead}</p>
                    <button class="btn btn--line btn--small" type="submit">
                      {b.notCompany}
                    </button>
                  </form>
                </details>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      <div class="banklink__actions">
        {ready && (ended || soon) ? (
          <a class="btn btn--blue btn--small" href={pickHref(link.bank)}>
            {b.renew}
          </a>
        ) : null}
        {ready && !ended ? (
          <form method="post" action={`/app/banka/${link.id}/nacitat`}>
            <button class="btn btn--line btn--small" type="submit">
              {b.readNow}
            </button>
          </form>
        ) : null}
        {owner ? (
          <details class="banklink__drop banklink__unlink">
            <summary>{b.unlink}</summary>
            <form method="post" action={`/app/banka/${link.id}/odpojit`}>
              <p>{b.unlinkLead}</p>
              <button class="btn btn--line btn--small" type="submit">
                {b.unlink}
              </button>
            </form>
          </details>
        ) : null}
      </div>
    </section>
  )
}

const BankList: FC<{ banks: Aspsp[] }> = ({ banks }) => (
  <>
    <p class="info__lead">{b.pickLead}</p>
    <ul class="bankpick__list">
      {banks.map((bank) => (
        <li>
          <a class="bankpick__item" href={pickHref(bank.name)}>
            <span class="bankpick__name">{bank.name}</span>
            <span class="bankpick__go" aria-hidden="true" />
          </a>
        </li>
      ))}
    </ul>
    <p class="info__source">{b.pickFoot}</p>
  </>
)

export const BankPage: FC<BankPageProps> = ({ ready, links, banks, owner, today, flash, error }) => {
  // Once a bank is linked, another one is a choice for later, folded away.
  const linked = links.some((l) => l.status === 'active')
  return (
    <>
      <a class="back" href="/app/platby">
        {app.payments.title}
      </a>
      <header class="phead">
        <Heading first={b.title} second={b.serif} />
        <p class="phead__lead">{b.lead}</p>
      </header>
      <Flash text={flash} />
      <Flash text={error} tone="error" />
      {links.length > 0 ? (
        <div class="banklinks">
          {links.map((link) => (
            <LinkCard link={link} owner={owner} today={today} ready={ready} />
          ))}
        </div>
      ) : null}
      {linked && ready && banks ? (
        <section class="info bankpick" id="prepojit">
          <details class="more">
            <summary class="more__summary">{b.pickAnother}</summary>
            <div class="more__body">
              <BankList banks={banks} />
            </div>
          </details>
        </section>
      ) : (
        <section class="info bankpick" id="prepojit" aria-labelledby="prepojit-t">
          <h2 id="prepojit-t" class="info__title">
            {b.pickTitle}
          </h2>
          {!ready ? <p class="info__lead">{b.off}</p> : banks === null ? <p class="info__lead">{b.unreachable}</p> : <BankList banks={banks} />}
        </section>
      )}
      <section class="bankfile" aria-labelledby="vypis">
        <Tile art={ART.paperBank} size="md" />
        <div class="bankfile__text">
          <h2 id="vypis" class="bankfile__title">
            {ready ? b.statementTitle : app.payments.statementTitle}
          </h2>
          <p>{ready ? b.statementLead : app.payments.statementLead}</p>
        </div>
        <form class="bankfile__form" method="post" action="/app/banka" enctype="multipart/form-data" data-upload>
          <label class="btn btn--line" for="vypis-file">
            {app.payments.statementButton}
          </label>
          <input id="vypis-file" class="add__file" type="file" name="file" accept=".xml,text/xml,application/xml" />
          <button class="btn btn--line add__send" type="submit">
            {app.add.send}
          </button>
        </form>
      </section>
    </>
  )
}

/** The bank on the page of payments: linked (and since when it was read), or the way to link it. */
export const BankCard: FC<{ links: BankLinkView[]; today: string }> = ({ links, today }) => {
  const active = links.filter((l) => l.status === 'active')
  if (active.length === 0) {
    return (
      <section class="bankcard" aria-labelledby="banka-karta">
        <Tile art={ART.paperBank} size="md" />
        <div class="bankcard__text">
          <h2 id="banka-karta" class="bankcard__title">
            {b.card.title}
          </h2>
          <p>{b.card.lead}</p>
        </div>
        <a class="btn btn--blue" href="/app/banka#prepojit">
          {b.card.go}
        </a>
      </section>
    )
  }
  const first = active[0]
  return (
    <section class="bankcard bankcard--linked" aria-labelledby="banka-karta">
      <span class="tick tick--green" aria-hidden="true" />
      <div class="bankcard__text">
        <h2 id="banka-karta" class="bankcard__title">
          {active.map((l) => b.card.linked(l.bank)).join(', ')}
        </h2>
        <p>{first?.syncedAt ? b.read(whenName(first.syncedAt, today)) : b.notYet}</p>
      </div>
      <a class="btn btn--line btn--small" href="/app/banka">
        {b.card.manage}
      </a>
    </section>
  )
}

/** A consent that ends soon or ended, said where the client looks first. */
export const BankNoticeBar: FC<{ notice: BankNotice; today: string }> = ({ notice, today }) =>
  notice ? (
    <div class="banknotice" role="status">
      <p>{notice.kind === 'renew' ? b.notice.renew(notice.bank, dayName(dayOfSeconds(notice.until), today)) : b.notice.ended(notice.bank)}</p>
      <a class="btn btn--blue btn--small" href={pickHref(notice.bank)}>
        {b.notice.go}
      </a>
    </div>
  ) : null
