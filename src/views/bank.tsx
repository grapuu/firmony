// Banka: the company's bank. Since 14 October 2026 without an aggregator first: the client picks the bank and is shown
// exactly what to set once (Slovenská sporiteľňa and ČSOB send statements by themselves, Fio gives a token, the others
// are added once a month), the statements that came and what became of each, and a statement from an account the
// company does not have yet, which waits for the owner's yes. A consent of Enable Banking, when its application is set
// up, stays the first way, and each link (Enable Banking's or Fio's) shows its accounts and when it was read.
import { bratislavaDay } from '../time'
import type { FC } from 'hono/jsx'
import { ART, BANK, BANK_WAYS, STATEMENTS, type BankWay } from '../config'
import { formatEur } from '../format'
import { app, dayName, whenName } from '../app/copy'
import type { Aspsp, BankLinkView, BankNotice } from '../app/bank'
import type { StatementView } from '../app/statements'
import { Tile } from './home'
import { Flash, Heading } from './inside'
import { groupIban } from './inside-pages'

const b = app.bank
const f = app.bank.free
const s = app.bank.statements

/** Today in Bratislava, YYYY-MM-DD, for the moment a page is drawn. */
const dayOfSeconds = (seconds: number) => bratislavaDay(seconds)

export interface BankSetup {
  bank: string
  at: number
}

export interface BankPageProps {
  /** Whether the bank can be linked through Enable Banking (its application is set up). */
  ready: boolean
  links: BankLinkView[]
  /** The banks to pick from; null when they could not be asked. */
  banks: Aspsp[] | null
  owner: boolean
  today: string
  flash?: string | null
  error?: string | null
  /** Until the contract's last day a bank can be linked; ten days past it no statement is taken either. */
  open?: boolean
  intake?: boolean
  /** The company's address for documents, which statements are sent to. */
  inbox: string
  /** The bank whose steps are shown: picked on the page, else the one the owner set. */
  chosen: string | null
  setup: BankSetup | null
  statements: StatementView[]
  fioError?: string | null
  /** The moment of the newest statement that came by email, for the bank that sends them itself. */
  lastEmail: number | null
}

const pickHref = (bank: string) => `/app/banka/pripojit?banka=${encodeURIComponent(bank)}`
const wayOf = (id: string | null) => BANK_WAYS.find((w) => w.id === id) ?? null

const LinkCard: FC<{
  link: BankLinkView
  owner: boolean
  today: string
  ready: boolean
}> = ({ link, owner, today, ready }) => {
  const ended = link.status !== 'active'
  const soon = !ended && link.validUntil !== null && link.validUntil - Date.now() / 1000 < BANK.renewDays * 86400
  const fio = link.kind === 'fio'
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
        {fio && (ended || soon) ? (
          <a class="btn btn--blue btn--small" href="/app/banka?banka=fio#postup-banka">
            {f.fioRenew}
          </a>
        ) : null}
        {!fio && ready && (ended || soon) ? (
          <a class="btn btn--blue btn--small" href={pickHref(link.bank)}>
            {b.renew}
          </a>
        ) : null}
        {(fio || ready) && !ended ? (
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

const Address: FC<{ inbox: string }> = ({ inbox }) => (
  <div class="bankway__address">
    <p class="bankway__label">{f.address}</p>
    <p class="copyline">
      <span class="copyline__text">{inbox}</span>
      <button class="copyline__button" type="button" data-copy={inbox} data-done={app.add.copied} hidden>
        {app.add.copy}
      </button>
    </p>
  </div>
)

const UploadForm: FC<{ id?: string; bank?: string }> = ({ id = 'vypis-file', bank }) => (
  <form class="bankfile__form" method="post" action="/app/banka" enctype="multipart/form-data" data-upload>
    {bank ? <input type="hidden" name="banka" value={bank} /> : null}
    <label class="btn btn--line" for={id}>
      {app.payments.statementButton}
    </label>
    <input id={id} class="add__file" type="file" name="file" accept=".xml,text/xml,application/xml" />
    <button class="btn btn--line add__send" type="submit">
      {app.add.send}
    </button>
  </form>
)

/** Whether the statements a bank sends by itself come: waiting for the first, late, or coming. */
const EmailState: FC<{ bank: string; setup: BankSetup | null; lastEmail: number | null; inbox: string; today: string }> = ({ bank, setup, lastEmail, inbox, today }) => {
  if (lastEmail !== null && (setup === null || lastEmail >= setup.at)) {
    return (
      <p class="bankway__state bankway__state--ok">
        <span class="tick tick--green" aria-hidden="true" /> {f.working(whenName(lastEmail, today))}
      </p>
    )
  }
  if (!setup) return null
  const late = Date.now() / 1000 - setup.at > STATEMENTS.waitDays * 86400
  return <p class={`bankway__state${late ? ' bankway__state--late' : ''}`}>{late ? f.late(inbox) : f.waiting(bank)}</p>
}

const FioForm: FC<{ fioError?: string | null }> = ({ fioError }) => (
  <form class="bankway__form" method="post" action="/app/banka/fio" novalidate>
    <label class="field">
      <span class="field__label">{f.fioLabel}</span>
      <input class="field__input bankway__token" name="token" autocomplete="off" spellcheck={false} inputmode="text" maxlength={200} required />
    </label>
    {fioError ? (
      <p class="field__error" role="alert">
        {fioError}
      </p>
    ) : null}
    <button class="btn btn--blue" type="submit">
      {f.fioButton}
    </button>
    <p class="info__source">{f.fioNote}</p>
  </form>
)

/**
 * The steps for one bank: what to set once, the address, and the one action that finishes it. Once its payments come
 * (statements arrive by email, or a token of Fio's reads), the state comes first and the steps are folded away.
 */
const WayPanel: FC<{
  id: string
  inbox: string
  setup: BankSetup | null
  lastEmail: number | null
  today: string
  intake: boolean
  fioError?: string | null
  fioLinked: boolean
}> = ({ id, inbox, setup, lastEmail, today, intake, fioError, fioLinked }) => {
  const bank = wayOf(id)
  if (!bank) return null
  const key = (['slsp', 'csob', 'fio', 'tatra', 'revolut', 'wise'] as const).find((k) => k === id) ?? 'generic'
  const way: BankWay = bank.way
  const mine = setup?.bank === id ? setup : null
  const sends = way === 'daily' || way === 'email'
  const working = (sends && lastEmail !== null && (mine === null || lastEmail >= mine.at)) || (way === 'token' && fioLinked && !fioError)
  const steps = (
    <>
      <p class="bankway__lead">{f.lead[key]}</p>
      <ol class="bankway__steps">
        {f.steps[key].map((step) => (
          <li>{step}</li>
        ))}
      </ol>
    </>
  )
  return (
    <div class="bankway" id="postup-banka">
      <header class="bankway__head">
        <h3 class="bankway__title">{bank.name}</h3>
        <span class={`pill ${way === 'monthly' ? 'pill--mist' : 'pill--ok'}`}>{f.wayShort[way]}</span>
      </header>
      {working ? (
        <>
          {way === 'token' ? (
            <p class="bankway__state bankway__state--ok">
              <span class="tick tick--green" aria-hidden="true" /> {f.fioWorking}
            </p>
          ) : (
            <EmailState bank={bank.name} setup={mine} lastEmail={lastEmail} inbox={inbox} today={today} />
          )}
          {way === 'token' ? null : <Address inbox={inbox} />}
          <details class="more more--quiet">
            <summary class="more__summary">{way === 'token' ? f.fioRenew : f.howTo}</summary>
            <div class="more__body">
              {steps}
              {way === 'token' ? <FioForm fioError={fioError} /> : null}
            </div>
          </details>
        </>
      ) : (
        <>
          {steps}
          {way === 'token' ? <FioForm fioError={fioError} /> : <Address inbox={inbox} />}
          {sends ? (
            mine ? (
              <EmailState bank={bank.name} setup={mine} lastEmail={lastEmail} inbox={inbox} today={today} />
            ) : (
              <form class="bankway__done" method="post" action="/app/banka/nastavene">
                <input type="hidden" name="banka" value={id} />
                <button class="btn btn--blue" type="submit">
                  {f.done}
                </button>
                <p class="info__source">{f.doneLead}</p>
              </form>
            )
          ) : null}
        </>
      )}
      {way === 'monthly' && intake ? (
        <div class="bankway__monthly" id="pridat">
          <UploadForm id="vypis-mesiac" bank={id} />
          <p class="info__source">{f.monthlyNote}</p>
        </div>
      ) : null}
    </div>
  )
}

/** The banks to pick from, each with the way its payments come; the page then shows the steps for the one picked. */
const BankWays: FC<{ chosen: string | null }> = ({ chosen }) => (
  <ul class="bankways__list" aria-label={f.pick}>
    {BANK_WAYS.map((w) => (
      <li>
        <a class={`bankways__item${chosen === w.id ? ' bankways__item--on' : ''}`} href={`/app/banka?banka=${w.id}#postup-banka`} aria-current={chosen === w.id ? 'true' : undefined}>
          <span class="bankways__name">{w.name}</span>
          <span class="bankways__way">{f.wayShort[w.way]}</span>
        </a>
      </li>
    ))}
  </ul>
)

const statusTone = (status: StatementView['status']) => (status === 'taken' ? 'pill--ok' : status === 'confirm' || status === 'held' ? 'pill--amber' : 'pill--mist')

/** The statements that came: the days they cover, the account, how many movements, and what became of each. */
const Statements: FC<{ list: StatementView[]; today: string }> = ({ list, today }) => (
  <section class="info stmts" id="vypisy" aria-labelledby="vypisy-t">
    <h2 id="vypisy-t" class="info__title">
      {s.title}
    </h2>
    {list.length === 0 ? (
      <p class="info__empty">{s.empty}</p>
    ) : (
      <ul class="stmts__list">
        {list.map((st) => (
          <li class="stmts__item">
            <div class="stmts__main">
              <p class="stmts__period">{st.from && st.to ? (st.from === st.to ? dayName(st.from, today) : `${dayName(st.from, today)} až ${dayName(st.to, today)}`) : whenName(st.createdAt, today)}</p>
              <p class="stmts__meta">
                <span class="stmts__iban">{groupIban(st.iban)}</span>
                <span>{s.entries(st.entries)}</span>
                <span>{s.source[st.source]}</span>
              </p>
              {st.status === 'held' ? <p class="stmts__note">{s.heldLead}</p> : null}
            </div>
            <span class={`pill ${statusTone(st.status)}`}>{s.status[st.status]}</span>
            {st.hasFile ? (
              <a class="link stmts__file" href={`/app/vypisy/${st.id}/subor`}>
                {s.download}
              </a>
            ) : null}
          </li>
        ))}
      </ul>
    )}
    <p class="info__source">{s.lead}</p>
  </section>
)

/** A statement from an account the company does not have yet: the owner says whether it is the company's. */
export const ConfirmAccount: FC<{ st: StatementView; owner: boolean }> = ({ st, owner }) => (
  <section class="stmtconfirm" aria-labelledby={`potvrdit-${st.id}`}>
    <Tile art={ART.paperBank} size="md" />
    <div class="stmtconfirm__text">
      <h2 id={`potvrdit-${st.id}`} class="stmtconfirm__title">
        {s.confirmTitle}
      </h2>
      <p>{s.confirmLead(groupIban(st.iban))}</p>
      {owner ? null : <p class="info__source">{s.confirmOwner}</p>}
    </div>
    {owner ? (
      <form class="stmtconfirm__actions" method="post" action={`/app/vypisy/${st.id}/ucet`}>
        <button class="btn btn--blue btn--small" type="submit" name="ano" value="1">
          {s.confirmYes}
        </button>
        <button class="btn btn--line btn--small" type="submit" name="ano" value="0">
          {s.confirmNo}
        </button>
      </form>
    ) : null}
  </section>
)

export const BankPage: FC<BankPageProps> = (p) => {
  const { ready, links, banks, owner, today, flash, error, open = true, intake = true } = p
  // Once a bank is linked, another one is a choice for later, folded away.
  const linked = links.some((l) => l.status === 'active')
  const waiting = waitingFirst(p.statements)
  const chosen = wayOf(p.chosen)
  // The bank the owner set up is shown with its steps; the other banks are a choice for later, folded away.
  const folded = chosen !== null && p.setup?.bank === chosen.id
  return (
    <>
      <a class="back" href="/app/platby">
        {app.payments.title}
      </a>
      <header class="phead">
        <Heading first={b.title} second={b.serif} />
        <p class="phead__lead">{ready ? b.lead : f.intro}</p>
      </header>
      <Flash text={flash} />
      <Flash text={error} tone="error" />
      {waiting.map((st) => (
        <ConfirmAccount st={st} owner={owner} />
      ))}
      {links.length > 0 ? (
        <div class="banklinks">
          {links.map((link) => (
            <LinkCard link={link} owner={owner} today={today} ready={ready} />
          ))}
        </div>
      ) : null}
      {open && ready ? (
        linked && banks ? (
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
            {banks === null ? <p class="info__lead">{b.unreachable}</p> : <BankList banks={banks} />}
          </section>
        )
      ) : null}
      {open ? (
        <section class="info bankways" id="postup" aria-labelledby="postup-t">
          <h2 id="postup-t" class="info__title">
            {ready ? f.otherTitle : f.title}
          </h2>
          {folded ? null : <BankWays chosen={chosen?.id ?? null} />}
          {chosen ? (
            <WayPanel
              id={chosen.id}
              inbox={p.inbox}
              setup={p.setup}
              lastEmail={p.lastEmail}
              today={today}
              intake={intake}
              fioError={p.fioError}
              fioLinked={links.some((l) => l.kind === 'fio' && l.status === 'active')}
            />
          ) : null}
          {folded ? (
            <details class="more bankways__more">
              <summary class="more__summary">{f.change}</summary>
              <div class="more__body">
                <BankWays chosen={chosen?.id ?? null} />
              </div>
            </details>
          ) : null}
        </section>
      ) : null}
      {intake && chosen?.way !== 'monthly' ? (
        <section class="bankfile" id="pridat" aria-labelledby="vypis">
          <Tile art={ART.paperBank} size="md" />
          <div class="bankfile__text">
            <h2 id="vypis" class="bankfile__title">
              {ready ? b.statementTitle : f.fileTitle}
            </h2>
            <p>{ready ? b.statementLead : f.fileLead}</p>
          </div>
          <UploadForm />
        </section>
      ) : null}
      <Statements list={p.statements} today={today} />
    </>
  )
}

/** One statement for each account that waits for the owner's yes, the oldest first. */
export function waitingFirst(list: StatementView[]): StatementView[] {
  const seen = new Set<string>()
  return [...list]
    .filter((st) => st.status === 'confirm')
    .sort((a, z) => a.createdAt - z.createdAt)
    .filter((st) => (seen.has(st.iban) ? false : (seen.add(st.iban), true)))
}

/** The bank on the page of payments: linked (and since when it was read), statements that come, or the way to set it. */
export const BankCard: FC<{ links: BankLinkView[]; today: string; ready: boolean; lastStatement: number | null }> = ({ links, today, ready, lastStatement }) => {
  const active = links.filter((l) => l.status === 'active')
  if (active.length === 0) {
    if (!ready && lastStatement !== null) {
      return (
        <section class="bankcard bankcard--linked" aria-labelledby="banka-karta">
          <span class="tick tick--green" aria-hidden="true" />
          <div class="bankcard__text">
            <h2 id="banka-karta" class="bankcard__title">
              {b.card.working(whenName(lastStatement, today))}
            </h2>
          </div>
          <a class="btn btn--line btn--small" href="/app/banka">
            {b.card.manage}
          </a>
        </section>
      )
    }
    return (
      <section class="bankcard" aria-labelledby="banka-karta">
        <Tile art={ART.paperBank} size="md" />
        <div class="bankcard__text">
          <h2 id="banka-karta" class="bankcard__title">
            {ready ? b.card.title : b.card.freeTitle}
          </h2>
          <p>{ready ? b.card.lead : b.card.freeLead}</p>
        </div>
        <a class="btn btn--blue" href={ready ? '/app/banka#prepojit' : '/app/banka#postup'}>
          {ready ? b.card.go : b.card.freeGo}
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

/** A consent or a token that ends soon or ended, said where the client looks first. */
export const BankNoticeBar: FC<{ notice: BankNotice; today: string }> = ({ notice, today }) =>
  notice ? (
    <div class="banknotice" role="status">
      <p>{notice.kind === 'renew' ? b.notice.renew(notice.bank, dayName(dayOfSeconds(notice.until), today)) : b.notice.ended(notice.bank)}</p>
      <a class="btn btn--blue btn--small" href={notice.fio ? '/app/banka?banka=fio#postup-banka' : pickHref(notice.bank)}>
        {b.notice.go}
      </a>
    </div>
  ) : null
