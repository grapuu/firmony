// The pages of the client's app. One thing is asked of the client, and every page leads to it: a document where
// a payment has none. Everything else is shown so that nobody has to wonder whether it is in order.
import { bratislavaClock, bratislavaDay } from '../time'
import type { FC } from 'hono/jsx'
import type { BankLinkView, BankNotice } from '../app/bank'
import { BankCard, BankNoticeBar, ConfirmAccount } from './bank'
import type { StatementView } from '../app/statements'
import { APP, ART, type Art } from '../config'
import { formatEur } from '../format'
import { EXEMPT_NAMES, app, dayName, dayShort, monthName, readableName, signed } from '../app/copy'
import { EXEMPTS } from '../app/match'
import type { Deadline } from '../app/deadlines'
import type { Doc, Message, Payment } from '../app/store'
import { Tile } from './home'
import { Flash, Heading } from './inside'

const ACCEPT = 'image/*,application/pdf,.pdf,.xml,text/xml,application/xml'

/** What stands in a payment's tile: money in, a card, or a transfer. */
function artOfPayment(p: Payment): Art | null {
  if (p.amountCents > 0) return ART.savings
  if (p.card) return ART.paperBank
  return ART.paperInvoice
}

function artOfDoc(d: Doc): Art | null {
  if (d.kind === 'receipt') return ART.paperReceipt
  if (d.source === 'einvoice') return ART.paperEinvoice
  return ART.paperInvoice
}

/** A payment's name when the bank gave none. */
function paymentName(p: Payment): string {
  if (p.party) return readableName(p.party)
  if (p.amountCents > 0) return app.payments.incoming
  if (p.card) return app.payments.card
  return p.note ?? app.payments.transfer
}

function paymentKind(p: Payment): string {
  if (p.exempt) return EXEMPT_NAMES[p.exempt].name
  if (p.amountCents > 0) return app.payments.incoming
  return p.card ? app.payments.card : app.payments.transfer
}

const StatePill: FC<{ state: Payment['state'] }> = ({ state }) => <span class={`pill pill--${state === 'missing' ? 'amber' : state === 'done' ? 'ok' : 'grey'}`}>{app.payments.state[state]}</span>

export const PayRow: FC<{ p: Payment; suggested?: boolean }> = ({ p, suggested }) => (
  <li class="row">
    <a class="row__link" href={`/app/platby/${p.id}`}>
      <Tile art={artOfPayment(p)} size="sm" />
      <span class="row__text">
        <span class="row__title">{paymentName(p)}</span>
        <span class="row__sub">
          <span>{dayShort(p.bookedOn)}</span>
          <span>{suggested ? app.home.suggested : paymentKind(p)}</span>
        </span>
      </span>
      <span class="row__end">
        <span class={`row__amount${p.amountCents > 0 ? ' row__amount--in' : ''}`}>{signed(p.amountCents)}</span>
        <StatePill state={p.state} />
      </span>
    </a>
  </li>
)

function docName(d: Doc): string {
  return d.party ?? (d.status === 'reading' ? app.documents.state.reading : (d.fileName ?? app.documents.unknown))
}

function docState(d: Doc): { text: string; tone: string } {
  if (d.paymentId) return { text: app.documents.state.linked, tone: 'ok' }
  if (d.paidPrivately) return { text: app.documents.state.private, tone: 'grey' }
  if (d.status === 'reading') return { text: app.documents.state.reading, tone: 'blue' }
  if (d.status === 'manual') return { text: app.documents.state.manual, tone: 'grey' }
  return { text: app.documents.state.waiting, tone: 'blue' }
}

export const DocRow: FC<{ d: Doc }> = ({ d }) => {
  const state = docState(d)
  return (
    <li class="row">
      <a class="row__link" href={`/app/doklady/${d.id}`}>
        <Tile art={artOfDoc(d)} size="sm" />
        <span class="row__text">
          <span class="row__title">{docName(d)}</span>
          <span class="row__sub">
            <span>{d.issuedOn ? dayShort(d.issuedOn) : dayShort(dayOf(d.createdAt))}</span>
            <span>{d.kind ? app.document.kind[d.kind] : app.document.source[d.source]}</span>
          </span>
        </span>
        <span class="row__end">
          <span class="row__amount">{d.totalCents !== null ? formatEur(d.totalCents) : ''}</span>
          <span class={`pill pill--${state.tone}`}>{state.text}</span>
        </span>
      </a>
    </li>
  )
}

/** A small card of a document, to confirm it or to pick it. */
const DocMini: FC<{ d: Doc }> = ({ d }) => (
  <a class="mini" href={`/app/doklady/${d.id}`}>
    <Tile art={artOfDoc(d)} size="sm" />
    <span class="mini__text">
      <span class="mini__title">{docName(d)}</span>
      <span class="mini__sub">
        {d.kind ? app.document.kind[d.kind] : app.documents.unknown}
        {d.issuedOn ? `, ${dayShort(d.issuedOn)}` : ''}
      </span>
    </span>
    <span class="mini__amount">{d.totalCents !== null ? formatEur(d.totalCents) : ''}</span>
  </a>
)

export const dayOf = (seconds: number): string => bratislavaDay(seconds)

const timeOf = (seconds: number): string => bratislavaClock(seconds)

/** "dnes 14:32", "včera 9:10", "11. 10. 16:05". */
export function whenName(seconds: number, nowSeconds: number): string {
  const day = dayOf(seconds)
  const today = dayOf(nowSeconds)
  const yesterday = dayOf(nowSeconds - 86400)
  const prefix = day === today ? 'dnes' : day === yesterday ? 'včera' : dayShort(day)
  return `${prefix} ${timeOf(seconds)}`
}

/** The card for adding documents: a button that opens the camera or the files, a place to drop them, the email. */
export const AddCard: FC<{ inbox: string; id?: string; wide?: boolean; action?: string; title?: string; lead?: string; button?: string; closed?: string | null }> = ({
  inbox,
  id = 'pridat',
  wide,
  action = '/app/doklady',
  title = app.add.title,
  lead = app.add.lead,
  button = app.add.button,
  closed = null,
}) =>
  closed ? (
    <section class={`add add--closed${wide ? ' add--wide' : ''}`} id={id} aria-labelledby={`${id}-title`}>
      <div class="add__main">
        <Tile art={ART.paperReceipt} size="md" />
        <h2 id={`${id}-title`} class="add__title">
          {app.ending.closedTitle}
        </h2>
        <p class="add__lead">{closed}</p>
        <a class="btn btn--line" href="/app/firma#stiahnut">
          {app.ending.download}
        </a>
      </div>
    </section>
  ) : (
    <section class={`add${wide ? ' add--wide' : ''}`} id={id} aria-labelledby={`${id}-title`} data-drop>
      <div class="add__main">
        <Tile art={ART.paperReceipt} size="md" />
        <h2 id={`${id}-title`} class="add__title">
          {title}
        </h2>
        <p class="add__lead">{lead}</p>
        <form class="add__form" method="post" action={action} enctype="multipart/form-data" data-upload>
          <label class="btn btn--blue add__button" for={`${id}-file`}>
            <span class="add__desk">{button}</span>
            <span class="add__phone">{app.add.phone}</span>
          </label>
          <input id={`${id}-file`} class="add__file" type="file" name="file" multiple accept={ACCEPT} />
          <button class="btn btn--line add__send" type="submit">
            {app.add.send}
          </button>
          <p class="add__drop">{app.add.drop}</p>
        </form>
        <p class="add__types">{app.add.types}</p>
      </div>
      <div class="add__mail">
        <p class="add__mailtitle">{app.add.emailTitle}</p>
        <p class="add__maillead">{app.add.emailLead}</p>
        <p class="copyline">
          <span class="copyline__text">{inbox}</span>
          <button class="copyline__button" type="button" data-copy={inbox} data-done={app.add.copied} hidden>
            {app.add.copy}
          </button>
        </p>
      </div>
    </section>
  )

// ---------------------------------------------------------------------------------------------------------------
// Prehľad
// ---------------------------------------------------------------------------------------------------------------

export interface OverviewProps {
  firstName: string
  missing: Payment[]
  missingCount: number
  suggested: Set<string>
  paymentsCount: number
  figures: { inCents: number; outCents: number; balanceCents: number | null; balanceOn: string | null }
  month: string
  today: string
  deadlines: Deadline[]
  inbox: string
  accountant: string | null
  last: Message | null
  now: number
  flash?: string | null
  /** The first steps of a new company, until the three that matter are done. */
  steps?: FirstStepsState | null
  /** Who is signed in: a message of another person of the company carries that person's name. */
  me?: string
  /** Whether the bank can be linked, and what the overview says about a consent that ends. */
  bankReady?: boolean
  bankNotice?: BankNotice
  /** Statements from accounts the company does not have yet, one for each account (the owner answers them). */
  waiting?: StatementView[]
  owner?: boolean
  /** The month whose bank statement is still to be added (YYYY-MM). */
  statementDue?: string | null
  /** Ten days past the contract's last day no document is taken, and this says why. */
  closed?: string | null
}

export interface FirstStepsState {
  /** The declaration for the law against money laundering is given: without it we may not start. */
  declaration: boolean
  /** The power of attorney is uploaded: without it we file nothing for the company. */
  poa: boolean
  payments: boolean
  upload: boolean
  email: boolean
  people: boolean
  /** The company changes accountants (what its request said): the notice to the former one is offered. */
  switching: boolean
  /** The notice went out, or the former accountant's papers are here: the step is done. */
  switched?: boolean
}

/**
 * A new company's first steps, as Dougs and Pennylane open their apps: four that matter (who stands behind the
 * company, the power of attorney, the bank, the first document), the rest for later.
 */
const FirstSteps: FC<{ steps: FirstStepsState; bankReady?: boolean }> = ({ steps, bankReady }) => {
  const s = app.start.steps
  const list = [
    { done: steps.declaration, href: '/app/vyhlasenie', text: s.declaration, optional: false },
    { done: steps.poa, href: '/app/plna-moc', text: s.poa, optional: false },
    bankReady ? { done: steps.payments, href: '/app/banka#prepojit', text: s.bank, optional: false } : { done: steps.payments, href: '/app/banka#postup', text: s.payments, optional: false },
    { done: steps.upload, href: '/app/doklady#pridat', text: s.upload, optional: false },
    ...(steps.switching ? [{ done: Boolean(steps.switched), href: '/app/prechod', text: s.switching, optional: true }] : []),
    { done: steps.email, href: '/app/firma#doklady-emailom', text: s.email, optional: true },
    { done: steps.people, href: '/app/firma#ludia', text: s.people, optional: true },
  ]
  const done = list.filter((step) => !step.optional && step.done).length
  return (
    <section class="first" aria-labelledby="zaciname">
      <header class="first__head">
        <h2 id="zaciname" class="first__title">
          {app.start.title}
        </h2>
        <p class="first__lead">{app.start.lead}</p>
        <span class={`first__bar first__bar--${done}`} role="img" aria-label={`${done} / 4`} />
      </header>
      <ul class="first__list">
        {list.map((step) => (
          <li class={`first__step${step.done ? ' first__step--done' : ''}${step.optional ? ' first__step--later' : ''}`}>
            <span class={step.done ? 'tick tick--green first__mark' : 'first__mark first__mark--open'} aria-hidden="true" />
            <span class="first__text">
              <span class="first__name">{step.text.title}</span>
              <span class="first__sub">{step.optional && !step.done ? `${app.start.optional}. ${step.text.lead}` : step.text.lead}</span>
            </span>
            {step.done ? (
              <span class="pill pill--ok">{app.start.done}</span>
            ) : (
              <a class={`btn ${step.optional ? 'btn--text' : 'btn--line'} btn--small first__go`} href={step.href}>
                {step.text.link}
              </a>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

export const Overview: FC<OverviewProps> = (props) => {
  const { missing, missingCount } = props
  const calm = missingCount === 0 && props.paymentsCount > 0
  // Nothing is missing, but a tax waits to be paid: the one thing left for the client, said in the panel itself.
  const taxDue = props.deadlines.some((d) => d.href === '/app/dane' && d.tone === 'amber')
  // Ten days past the contract's last day nothing more is asked of the client: only the download is left.
  const ended = Boolean(props.closed)
  // A new company with no payment yet is welcomed to its first steps; once payments come, what they lack leads.
  const welcome = Boolean(props.steps) && !ended && props.paymentsCount === 0
  return (
    <div class="over">
      <div class="over__main">
        {ended ? (
          <section class="hello hello--ended" aria-labelledby="stav">
            <p class="hello__name">{app.home.hello(props.firstName)}</p>
            <Heading id="stav" first={app.ending.overTitle} second={app.ending.overSerif} />
            <p class="hello__lead">{props.closed}</p>
            <a class="btn btn--blue" href="/app/firma#stiahnut">
              {app.ending.download}
            </a>
          </section>
        ) : welcome ? (
          <section class="hello" aria-labelledby="stav">
            <p class="hello__name">{app.home.hello(props.firstName)}</p>
            <Heading id="stav" first={app.home.welcomeTitle} second={app.home.welcomeSerif} />
          </section>
        ) : calm ? (
          <section class="calm" aria-labelledby="stav">
            <div class="calm__text">
              <p class="calm__hello">{app.home.hello(props.firstName)}</p>
              <h1 id="stav" class="calm__title">
                <span class="calm__sans">{app.home.doneTitle}</span> <em class="calm__serif">{taxDue ? app.home.doneSerifTax : app.home.doneSerif}</em>
              </h1>
              <p class="calm__lead">{taxDue ? app.home.doneLeadTax : app.home.doneLead}</p>
              {taxDue ? (
                <a class="btn btn--white calm__pay" href="/app/dane">
                  {app.home.payTax}
                </a>
              ) : null}
            </div>
            <img class="calm__glass" src={ART.seal?.small?.src ?? ''} width="240" height="240" alt="" />
          </section>
        ) : (
          <section class="hello" aria-labelledby="stav">
            <p class="hello__name">{app.home.hello(props.firstName)}</p>
            {props.paymentsCount === 0 ? (
              <Heading id="stav" first={app.home.noPayments} />
            ) : (
              <Heading id="stav" first={app.home.missingTitle(missingCount)} second={app.home.missingSerif(missingCount)} />
            )}
          </section>
        )}
        <Flash text={props.flash} />
        <BankNoticeBar notice={props.bankNotice ?? null} today={props.today} />
        {ended ? null : (props.waiting ?? []).map((st) => <ConfirmAccount st={st} owner={Boolean(props.owner)} />)}
        {!ended && props.statementDue ? (
          <section class="stmtdue" aria-labelledby="vypis-chyba">
            <div class="stmtdue__text">
              <h2 id="vypis-chyba" class="stmtdue__title">
                {app.bank.statements.due.title(monthName(`${props.statementDue}-01`))}
              </h2>
              <p>{app.bank.statements.due.lead}</p>
            </div>
            <a class="btn btn--blue btn--small" href="/app/banka#pridat">
              {app.bank.statements.due.go}
            </a>
          </section>
        ) : null}
        {props.steps && !ended ? <FirstSteps steps={props.steps} bankReady={props.bankReady} /> : null}
        {ended ? null : props.paymentsCount === 0 ? (
          props.steps ? null : (
            <p class="over__empty">{app.home.noPaymentsLead}</p>
          )
        ) : missingCount > 0 ? (
          <section class="feedcard" aria-labelledby="chyba">
            <header class="feedcard__head">
              <h2 id="chyba" class="feedcard__title">
                {app.home.missingHead}
              </h2>
              <span class="count count--amber">{missingCount}</span>
            </header>
            <ul class="rows">
              {missing.map((p) => (
                <PayRow p={p} suggested={props.suggested.has(p.id)} />
              ))}
            </ul>
            <footer class="feedcard__foot">
              <span class="tick" aria-hidden="true" />
              <span>{app.home.restDone}</span>
              {missingCount > missing.length ? (
                <a class="link feedcard__all" href="/app/platby">
                  {app.home.allMissing}
                </a>
              ) : null}
            </footer>
          </section>
        ) : null}
        <section class="figs" aria-labelledby="cisla">
          <h2 id="cisla" class="sect">
            {app.home.month(props.month)}
          </h2>
          <dl class="figs__grid">
            <div class="fig">
              <dt>{app.home.in}</dt>
              <dd class="fig__value fig__value--in">{signed(props.figures.inCents)}</dd>
            </div>
            <div class="fig">
              <dt>{app.home.out}</dt>
              <dd class="fig__value">{signed(-props.figures.outCents)}</dd>
            </div>
            <div class="fig">
              <dt>{app.home.balance}</dt>
              {props.figures.balanceCents !== null ? (
                <>
                  <dd class="fig__value">{formatEur(props.figures.balanceCents)}</dd>
                  <dd class="fig__note">{app.home.balanceOn(dayName(props.figures.balanceOn ?? props.today, props.today))}</dd>
                </>
              ) : (
                <dd class="fig__value fig__value--none">{app.home.noBalance}</dd>
              )}
            </div>
          </dl>
        </section>
        {ended ? null : (
          <section class="dates" aria-labelledby="terminy">
            <h2 id="terminy" class="sect">
              {app.home.deadlines}
            </h2>
            <p class="sect__lead">{app.home.deadlinesLead}</p>
            <ul class="dates__list">
              {props.deadlines.map((d) => (
                <li class="date">
                  <span class="date__day">
                    <span class="date__num">{Number(d.day.slice(8, 10))}.</span>
                    <span class="date__month">{dayName(d.day, props.today).replace(/^\d+\.\s/, '')}</span>
                  </span>
                  {d.href ? (
                    <a class="date__what link" href={d.href}>
                      {d.label}
                    </a>
                  ) : (
                    <span class="date__what">{d.label}</span>
                  )}
                  <span class={`pill pill--${d.tone}`}>{d.state}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
      <aside class="over__side">
        {ended ? null : <AddCard inbox={props.inbox} />}
        <section class="mate" aria-labelledby="ucto">
          <div class="mate__who">
            <Tile art={ART.chat} size="md" />
            <div>
              <h2 id="ucto" class="mate__name">
                {props.accountant ?? app.home.accountant}
              </h2>
              <p class="mate__sub">{app.home.accountantLead}</p>
            </div>
          </div>
          {props.last ? (
            <a class="mate__last" href="/app/spravy#posledna">
              <span class="mate__lastwho">
                {props.last.side === 'firmony'
                  ? (props.last.authorName ?? props.accountant ?? app.home.accountant)
                  : props.last.author && props.last.author !== props.me
                    ? (props.last.authorName ?? app.messages.you)
                    : app.messages.you}
                , {whenName(props.last.createdAt, props.now)}
              </span>
              <span class="mate__lasttext">{props.last.body}</span>
            </a>
          ) : null}
          <a class="btn btn--line mate__button" href="/app/spravy#napisat">
            {app.home.write}
          </a>
        </section>
      </aside>
    </div>
  )
}

// ---------------------------------------------------------------------------------------------------------------
// Platby
// ---------------------------------------------------------------------------------------------------------------

function byMonth<T>(items: T[], dayOfItem: (item: T) => string): [string, T[]][] {
  const groups = new Map<string, T[]>()
  for (const item of items) {
    const key = dayOfItem(item).slice(0, 7)
    groups.set(key, [...(groups.get(key) ?? []), item])
  }
  return [...groups]
}

/** A search over a list: every word must be found; a number finds that amount. */
const SearchForm: FC<{ action: string; value: string }> = ({ action, value }) => (
  <form class="search" method="get" action={action} role="search">
    <label class="sr" for="hladat">
      {app.search.label}
    </label>
    <input id="hladat" class="search__input" type="search" name="hladat" value={value} maxlength={80} placeholder={app.search.placeholder} autocomplete="off" />
    <button class="btn btn--line btn--small search__button" type="submit">
      {app.search.button}
    </button>
    {value ? (
      <a class="search__clear" href={action}>
        {app.search.clear}
      </a>
    ) : null}
  </form>
)

/** A page of a client's list: which, whether an older one follows, and the address the page number is added to. */
export interface ListPage {
  page: number
  more: boolean
  href: string
}

const ListPager: FC<{ pager?: ListPage }> = ({ pager }) =>
  pager && (pager.page > 1 || pager.more) ? (
    <nav class="lpager" aria-label={app.list.older}>
      <span class="lpager__links">
        {pager.page > 1 ? (
          <a class="btn btn--line btn--small" href={`${pager.href}strana=${pager.page - 1}`}>
            {app.list.newer}
          </a>
        ) : null}
        {pager.more ? (
          <a class="btn btn--line btn--small" href={`${pager.href}strana=${pager.page + 1}`}>
            {app.list.older}
          </a>
        ) : null}
      </span>
    </nav>
  ) : null

export const PaymentsPage: FC<{
  filter: 'missing' | 'done' | 'all'
  payments: Payment[]
  missingCount: number
  suggested: Set<string>
  flash?: string | null
  warn?: string | null
  search?: string
  /** The bank, when it can be linked: linked (and when it was read), or the way to link it. */
  bank?: { links: BankLinkView[]; today: string; ready: boolean; lastStatement: number | null } | null
  /** Ten days past the contract's last day no statement is taken. */
  closed?: boolean
  pager?: ListPage
}> = ({ filter, payments, missingCount, suggested, flash, warn, search = '', bank, closed = false, pager }) => (
  <>
    <header class="phead">
      <Heading first={app.payments.title} />
      <p class="phead__lead">{app.payments.lead}</p>
    </header>
    <Flash text={flash} />
    <Flash text={warn} tone="warn" />
    <div class="listbar">
      <nav class="filters" aria-label={app.payments.title}>
        {(['missing', 'done', 'all'] as const).map((f) => (
          <a class="filters__item" href={f === 'missing' ? '/app/platby' : `/app/platby?filter=${f === 'done' ? 'hotove' : 'vsetky'}`} aria-current={filter === f && !search ? 'page' : undefined}>
            {app.payments.filters[f]}
            {f === 'missing' && missingCount > 0 ? <span class="count count--amber">{missingCount}</span> : null}
          </a>
        ))}
      </nav>
      <SearchForm action="/app/platby" value={search} />
    </div>
    {payments.length === 0 && search ? (
      <p class="over__empty">{app.search.none(search)}</p>
    ) : payments.length === 0 ? (
      filter === 'missing' ? (
        <section class="nothing">
          <Tile art={ART.seal} size="lg" />
          <p class="nothing__title">
            {app.payments.emptyMissing} <em class="nothing__serif">{app.payments.emptyMissingSerif}</em>
          </p>
        </section>
      ) : (
        <p class="over__empty">{app.payments.empty}</p>
      )
    ) : (
      byMonth(payments, (p) => p.bookedOn).map(([month, items]) => (
        <section class="month" aria-label={monthName(month, true)}>
          <h2 class="month__title">{monthName(`${month}-01`, true)}</h2>
          <ul class="rows rows--card">
            {items.map((p) => (
              <PayRow p={p} suggested={suggested.has(p.id)} />
            ))}
          </ul>
        </section>
      ))
    )}
    <ListPager pager={pager} />
    {bank ? <BankCard links={bank.links} today={bank.today} ready={bank.ready} lastStatement={bank.lastStatement} /> : null}
    <section class="bankfile" aria-labelledby="vypis">
      <Tile art={ART.paperBank} size="md" />
      <div class="bankfile__text">
        <h2 id="vypis" class="bankfile__title">
          {bank ? (bank.ready ? app.bank.statementTitle : app.bank.free.fileTitle) : app.payments.statementTitle}
        </h2>
        <p>{bank ? (bank.ready ? app.bank.statementLead : app.bank.free.fileLead) : app.payments.statementLead}</p>
      </div>
      {closed ? null : (
        <form class="bankfile__form" method="post" action="/app/banka" enctype="multipart/form-data" data-upload>
          <label class="btn btn--line" for="vypis-file">
            {app.payments.statementButton}
          </label>
          <input id="vypis-file" class="add__file" type="file" name="file" accept=".xml,text/xml,application/xml" />
          <button class="btn btn--line add__send" type="submit">
            {app.add.send}
          </button>
        </form>
      )}
    </section>
  </>
)

// ---------------------------------------------------------------------------------------------------------------
// Jedna platba
// ---------------------------------------------------------------------------------------------------------------

export interface PaymentPageProps {
  p: Payment
  docs: Doc[]
  suggestions: Doc[]
  loose: Doc[]
  today: string
  flash?: string | null
  error?: string | null
  exemptValue?: string
  noteValue?: string
  /** Ten days past the contract's last day: no document is taken, and this says why. */
  closed?: string | null
}

const UploadForm: FC<{ p: Payment; label: string; line?: boolean; closed?: string | null }> = ({ p, label, line, closed }) =>
  closed ? (
    <p class="need__closed">{closed}</p>
  ) : (
    <form class="need__form" method="post" action={`/app/platby/${p.id}/doklad`} enctype="multipart/form-data" data-upload>
      <label class={`btn ${line ? 'btn--line' : 'btn--blue btn--large'} need__button`} for={`doklad-${p.id}`}>
        {label}
      </label>
      <input id={`doklad-${p.id}`} class="add__file" type="file" name="file" multiple accept={ACCEPT} />
      <button class="btn btn--line add__send" type="submit">
        {app.add.send}
      </button>
    </form>
  )

export const PaymentPage: FC<PaymentPageProps> = ({ p, docs, suggestions, loose, today, flash, error, exemptValue, noteValue, closed = null }) => {
  const docsTotal = docs.reduce((sum, d) => sum + (d.totalCents ?? 0), 0)
  const allRead = docs.length > 0 && docs.every((d) => d.status === 'read' && d.totalCents !== null)
  const differs = allRead && docsTotal !== Math.abs(p.amountCents)
  const reading = docs.some((d) => d.status === 'reading')
  return (
    <>
      <a class="back" href="/app/platby">
        {app.payment.back}
      </a>
      <header class="phero">
        <p class={`phero__amount${p.amountCents > 0 ? ' phero__amount--in' : ''}`}>{signed(p.amountCents)}</p>
        <h1 class="phero__name">{paymentName(p)}</h1>
        <p class="phero__meta">
          <span>{dayName(p.bookedOn, today)}</span>
          <span>{paymentKind(p)}</span>
        </p>
      </header>
      <Flash text={flash} />
      <Flash text={error} tone="error" />
      <div class="pgrid">
        <div class="pgrid__main" data-part="state" data-live={reading ? '1' : undefined}>
          {p.state === 'missing' ? (
            <section class="need" aria-labelledby="stav">
              <div class="need__head">
                <span class="mark mark--amber" aria-hidden="true" />
                <h2 id="stav" class="need__title">
                  {app.payment.missingTitle}
                </h2>
              </div>
              <p class="need__lead">{app.payment.missingLead}</p>
              <UploadForm p={p} label={app.payment.upload} closed={closed} />
              {suggestions.length > 0 ? (
                <div class="suggest">
                  <p class="suggest__title">{app.payment.suggestTitle}</p>
                  {suggestions.slice(0, 3).map((d) => (
                    <div class="suggest__row">
                      <DocMini d={d} />
                      <form method="post" action={`/app/platby/${p.id}/priradit`}>
                        <input type="hidden" name="doklad" value={d.id} />
                        <button class="btn btn--blue btn--small" type="submit">
                          {app.payment.suggestYes}
                        </button>
                      </form>
                    </div>
                  ))}
                </div>
              ) : null}
              {loose.length > 0 ? (
                <details class="more">
                  <summary class="more__summary">{app.payment.pickTitle}</summary>
                  <div class="more__body">
                    {loose.slice(0, 12).map((d) => (
                      <div class="suggest__row">
                        <DocMini d={d} />
                        <form method="post" action={`/app/platby/${p.id}/priradit`}>
                          <input type="hidden" name="doklad" value={d.id} />
                          <button class="btn btn--line btn--small" type="submit">
                            {app.payment.pick}
                          </button>
                        </form>
                      </div>
                    ))}
                  </div>
                </details>
              ) : null}
              <details class="more" open={exemptValue ? true : undefined}>
                <summary class="more__summary">{app.payment.noNeed}</summary>
                <form class="more__body noneed" method="post" action={`/app/platby/${p.id}/bez-dokladu`} novalidate>
                  <p class="noneed__lead">{app.payment.noNeedLead}</p>
                  <fieldset class="noneed__options">
                    <legend class="sr">{app.payment.noNeed}</legend>
                    {EXEMPTS.map((reason) => (
                      <label class="noneed__option">
                        <input type="radio" name="dovod" value={reason} checked={exemptValue === reason} />
                        <span>
                          <span class="noneed__name">{EXEMPT_NAMES[reason].name}</span>
                          <span class="noneed__hint">{EXEMPT_NAMES[reason].hint}</span>
                        </span>
                      </label>
                    ))}
                  </fieldset>
                  <label class="field__label" for="poznamka">
                    {app.payment.noNeedNote} <span class="field__optional">{app.payment.noNeedNoteHint}</span>
                  </label>
                  <input id="poznamka" class="field__input" type="text" name="poznamka" value={noteValue ?? ''} maxlength={300} />
                  <button class="btn btn--blue noneed__save" type="submit">
                    {app.payment.noNeedSave}
                  </button>
                </form>
              </details>
            </section>
          ) : p.state === 'before' ? (
            <section class="have have--exempt" aria-labelledby="stav">
              <div class="need__head">
                <span class="tick tick--grey" aria-hidden="true" />
                <h2 id="stav" class="need__title">
                  {app.payment.beforeTitle}
                </h2>
              </div>
              <p class="have__reason">{app.payment.beforeLead(dayName(p.booksFrom ?? p.bookedOn))}</p>
            </section>
          ) : p.state === 'done' ? (
            <section class="have" aria-labelledby="stav">
              <div class="need__head">
                <span class="tick tick--green" aria-hidden="true" />
                <h2 id="stav" class="need__title">
                  {app.payment.doneTitle(docs.length)}
                </h2>
              </div>
              {docs.map((d) => (
                <div class="have__doc">
                  <DocMini d={d} />
                  <form method="post" action={`/app/doklady/${d.id}/odpojit`}>
                    <input type="hidden" name="spat" value={`/app/platby/${p.id}`} />
                    <button class="have__unlink" type="submit">
                      {app.payment.unlink}
                    </button>
                  </form>
                </div>
              ))}
              {differs ? <p class="flag">{app.payment.differs(formatEur(docsTotal), formatEur(Math.abs(p.amountCents)))}</p> : null}
              <UploadForm p={p} label={app.payment.uploadMore} line closed={closed} />
            </section>
          ) : (
            <section class="have have--exempt" aria-labelledby="stav">
              <div class="need__head">
                <span class="tick tick--grey" aria-hidden="true" />
                <h2 id="stav" class="need__title">
                  {app.payment.exemptTitle}
                </h2>
              </div>
              <p class="have__reason">
                {p.exempt ? EXEMPT_NAMES[p.exempt].name : ''}
                {p.exemptNote ? `: ${p.exemptNote}` : ''}
              </p>
              {p.exemptBy === 'auto' ? <p class="have__auto">{app.payment.exemptAuto}</p> : null}
              <form method="post" action={`/app/platby/${p.id}/zrusit`}>
                <button class="btn btn--line btn--small" type="submit">
                  {app.payment.exemptUndo}
                </button>
              </form>
            </section>
          )}
        </div>
        <aside class="pgrid__side">
          <section class="info" aria-labelledby="podrobnosti">
            <h2 id="podrobnosti" class="info__title">
              {app.payment.details}
            </h2>
            <dl class="kv">
              <div>
                <dt>{app.payment.date}</dt>
                <dd>{dayName(p.bookedOn)}</dd>
              </div>
              <div>
                <dt>{app.payment.amount}</dt>
                <dd>{signed(p.amountCents)}</dd>
              </div>
              {p.party ? (
                <div>
                  <dt>{app.payment.party}</dt>
                  <dd>{p.party}</dd>
                </div>
              ) : null}
              {p.partyIban ? (
                <div>
                  <dt>{app.payment.iban}</dt>
                  <dd class="kv__long">{groupIban(p.partyIban)}</dd>
                </div>
              ) : null}
              {p.vs ? (
                <div>
                  <dt>{app.payment.vs}</dt>
                  <dd>{p.vs}</dd>
                </div>
              ) : null}
              {p.note ? (
                <div>
                  <dt>{app.payment.note}</dt>
                  <dd class="kv__long">{p.note}</dd>
                </div>
              ) : null}
              <div>
                <dt>{app.payment.account}</dt>
                <dd class="kv__long">{groupIban(p.accountIban)}</dd>
              </div>
            </dl>
          </section>
          <section class="ask" aria-labelledby="otazka">
            <h2 id="otazka" class="ask__title">
              {app.payment.ask}
            </h2>
            <p class="ask__lead">{app.payment.askLead}</p>
            <form class="ask__form" method="post" action="/app/spravy" novalidate>
              <input type="hidden" name="platba" value={p.id} />
              <textarea class="field__input field__area ask__area" name="sprava" rows={3} maxlength={APP.messageChars} placeholder={app.payment.askPlaceholder}></textarea>
              <button class="btn btn--line btn--small" type="submit">
                {app.payment.askButton}
              </button>
            </form>
          </section>
        </aside>
      </div>
    </>
  )
}

/** An IBAN in groups of four, as banks print it. */
export function groupIban(iban: string): string {
  return iban.replace(/\s/g, '').replace(/(.{4})(?=.)/g, '$1 ')
}

// ---------------------------------------------------------------------------------------------------------------
// Doklady
// ---------------------------------------------------------------------------------------------------------------

export const DocumentsPage: FC<{ filter: 'all' | 'loose'; docs: Doc[]; inbox: string; flash?: string | null; problems: string[]; search?: string; closed?: string | null; pager?: ListPage }> = ({
  filter,
  docs,
  inbox,
  flash,
  problems,
  search = '',
  closed = null,
  pager,
}) => (
  <>
    <header class="phead phead--row">
      <div>
        <Heading first={app.documents.title} />
        <p class="phead__lead">{app.documents.lead}</p>
      </div>
      <span class="phead__actions">
        <a class="btn btn--line" href="/app/uhrady">
          {app.payorders.link}
        </a>
      </span>
    </header>
    <Flash text={flash} />
    {problems.map((text) => (
      <Flash text={text} tone="warn" />
    ))}
    <AddCard inbox={inbox} wide closed={closed} />
    <div class="listbar">
      <nav class="filters" aria-label={app.documents.title}>
        {(['all', 'loose'] as const).map((f) => (
          <a class="filters__item" href={f === 'all' ? '/app/doklady' : '/app/doklady?filter=bez-platby'} aria-current={filter === f && !search ? 'page' : undefined}>
            {app.documents.filters[f]}
          </a>
        ))}
      </nav>
      <SearchForm action="/app/doklady" value={search} />
    </div>
    <div data-part="docs" data-live={docs.some((d) => d.status === 'reading') ? '1' : undefined}>
      {docs.length === 0 ? (
        <p class="over__empty">{search ? app.search.none(search) : filter === 'loose' ? app.documents.emptyLoose : app.documents.empty}</p>
      ) : (
        byMonth(docs, (d) => dayOf(d.createdAt)).map(([month, items]) => (
          <section class="month" aria-label={monthName(`${month}-01`, true)}>
            <h2 class="month__title">{monthName(`${month}-01`, true)}</h2>
            <ul class="rows rows--card">
              {items.map((d) => (
                <DocRow d={d} />
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
    <ListPager pager={pager} />
  </>
)

/** What we read, drawn as the paper it came on: a till receipt or an invoice. Decoration; the facts are in the list. */
const Paper: FC<{ d: Doc }> = ({ d }) => (
  <figure class={`paper paper--${d.kind === 'receipt' ? 'receipt' : 'invoice'}`} aria-hidden="true">
    <div class="paper__sheet">
      <p class="paper__party">{d.party ?? app.documents.unknown}</p>
      {d.partyIco ? <p class="paper__line">IČO {d.partyIco}</p> : null}
      <p class="paper__kind">
        {d.kind ? app.document.kind[d.kind] : app.documents.unknown}
        {d.number ? ` ${d.number}` : ''}
      </p>
      <span class="paper__rule" />
      {d.issuedOn ? (
        <p class="paper__row">
          <span>{app.document.issued}</span>
          <span>{dayShort(d.issuedOn)}</span>
        </p>
      ) : null}
      {d.dueOn ? (
        <p class="paper__row">
          <span>{app.document.due}</span>
          <span>{dayShort(d.dueOn)}</span>
        </p>
      ) : null}
      {d.vatCents ? (
        <p class="paper__row">
          <span>DPH</span>
          <span>{formatEur(d.vatCents)}</span>
        </p>
      ) : null}
      <span class="paper__rule" />
      <p class="paper__total">
        <span>{app.document.total}</span>
        <span>{d.totalCents !== null ? formatEur(d.totalCents) : ''}</span>
      </p>
    </div>
  </figure>
)

export const DocumentPage: FC<{ d: Doc; payment: Payment | null; today: string; flash?: string | null; error?: string | null; approvals?: boolean; owner?: boolean }> = ({
  d,
  payment,
  today,
  flash,
  error,
  approvals = false,
  owner = false,
}) => {
  const image = d.fileKey && d.fileType?.startsWith('image/') && d.fileType !== 'image/heic'
  const outgoing = d.kind === 'invoice_out'
  return (
    <>
      <a class="back" href="/app/doklady">
        {app.document.back}
      </a>
      <header class="phero">
        <p class="phero__kind">{d.kind ? app.document.kind[d.kind] : app.document.source[d.source]}</p>
        <h1 class="phero__name">{docName(d)}</h1>
        {d.totalCents !== null ? <p class="phero__amount phero__amount--doc">{formatEur(d.totalCents)}</p> : null}
      </header>
      <Flash text={flash} />
      <Flash text={error} tone="error" />
      <div class="pgrid">
        <div class="pgrid__main" data-part="doc" data-live={d.status === 'reading' ? '1' : undefined}>
          {approvals && d.kind === 'invoice_in' ? (
            <section class="info" id="schvalenie" aria-labelledby="schvalenie-t">
              <h2 id="schvalenie-t" class="info__title">
                {app.document.approveTitle}
              </h2>
              {d.approvedAt ? (
                <p class="info__lead">{app.document.approvedBy(d.approvedByName ?? '', dayName(dayOf(d.approvedAt), today))}</p>
              ) : (
                <p class="flag">{app.document.approveWaiting}</p>
              )}
              {owner ? (
                <form method="post" action={`/app/doklady/${d.id}/${d.approvedAt ? 'neschvalit' : 'schvalit'}`}>
                  <button class={`btn ${d.approvedAt ? 'btn--line' : 'btn--blue'}`} type="submit">
                    {d.approvedAt ? app.document.unapprove : app.document.approve}
                  </button>
                </form>
              ) : null}
            </section>
          ) : null}
          {d.status === 'reading' ? <p class="flag flag--ask">{app.document.reading}</p> : null}
          {d.status === 'manual' ? <p class="flag">{app.document.manual}</p> : null}
          {d.status === 'read' ? (
            <section class="info" aria-labelledby="precitane">
              <h2 id="precitane" class="info__title">
                {app.document.read}
              </h2>
              <dl class="kv">
                {d.party ? (
                  <div>
                    <dt>{outgoing ? app.document.partyOut : app.document.party}</dt>
                    <dd>{d.party}</dd>
                  </div>
                ) : null}
                {d.partyIco ? (
                  <div>
                    <dt>{app.document.ico}</dt>
                    <dd>{d.partyIco}</dd>
                  </div>
                ) : null}
                {d.number ? (
                  <div>
                    <dt>{app.document.number}</dt>
                    <dd>{d.number}</dd>
                  </div>
                ) : null}
                {d.issuedOn ? (
                  <div>
                    <dt>{app.document.issued}</dt>
                    <dd>{dayName(d.issuedOn)}</dd>
                  </div>
                ) : null}
                {d.dueOn ? (
                  <div>
                    <dt>{app.document.due}</dt>
                    <dd>{dayName(d.dueOn)}</dd>
                  </div>
                ) : null}
                {d.totalCents !== null ? (
                  <div>
                    <dt>{app.document.total}</dt>
                    <dd>{formatEur(d.totalCents)}</dd>
                  </div>
                ) : null}
                {d.vatCents ? (
                  <div>
                    <dt>{app.document.vat}</dt>
                    <dd>{formatEur(d.vatCents)}</dd>
                  </div>
                ) : null}
                {d.vs ? (
                  <div>
                    <dt>{app.document.vs}</dt>
                    <dd>{d.vs}</dd>
                  </div>
                ) : null}
                {d.partyIban ? (
                  <div>
                    <dt>{app.document.iban}</dt>
                    <dd class="kv__long">{groupIban(d.partyIban)}</dd>
                  </div>
                ) : null}
              </dl>
              <p class="info__source">{app.document.source[d.source]}</p>
            </section>
          ) : null}
          <section class="paid" aria-labelledby="platba">
            <h2 id="platba" class="info__title">
              {app.document.payment}
            </h2>
            {payment ? (
              <ul class="rows">
                <PayRow p={payment} />
              </ul>
            ) : d.paidPrivately ? (
              <>
                <p class="paid__text">{app.document.privatelyDone}</p>
                <form method="post" action={`/app/doklady/${d.id}/sukromne`}>
                  <input type="hidden" name="ano" value="0" />
                  <button class="btn btn--line btn--small" type="submit">
                    {app.document.privatelyUndo}
                  </button>
                </form>
              </>
            ) : (
              <>
                <p class="paid__text paid__text--strong">{app.document.noPayment}</p>
                <p class="paid__text">{app.document.noPaymentLead}</p>
                <form method="post" action={`/app/doklady/${d.id}/sukromne`}>
                  <input type="hidden" name="ano" value="1" />
                  <button class="btn btn--line btn--small" type="submit">
                    {app.document.privately}
                  </button>
                </form>
              </>
            )}
          </section>
        </div>
        <aside class="pgrid__side">
          {!image && d.status === 'read' ? <Paper d={d} /> : null}
          {d.fileKey ? (
            image ? (
              <figure class="orig">
                <a href={`/app/subory/${d.id}`}>
                  <img class="orig__img" src={`/app/subory/${d.id}`} alt={app.document.original} loading="lazy" />
                </a>
              </figure>
            ) : (
              <a class="btn btn--line orig__open" href={`/app/subory/${d.id}`}>
                {app.document.original}
              </a>
            )
          ) : d.invoiceId ? (
            <a class="btn btn--line orig__open" href={`/app/faktury/${d.invoiceId}`}>
              {app.invoices.actions.open}
            </a>
          ) : null}
          <details class="more more--quiet">
            <summary class="more__summary">{app.document.delete}</summary>
            <div class="more__body">
              <p class="paid__text">{app.document.deleteLead}</p>
              <form method="post" action={`/app/doklady/${d.id}/zmazat`}>
                <button class="btn btn--danger btn--small" type="submit">
                  {app.document.deleteSure}
                </button>
              </form>
            </div>
          </details>
        </aside>
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------------------------------------------
// Správy
// ---------------------------------------------------------------------------------------------------------------

export const MessagesPage: FC<{
  messages: Message[]
  accountant: string | null
  now: number
  payments: Map<string, Payment>
  flash?: string | null
  error?: string | null
  draft?: string
  me?: string
}> = ({ messages, accountant, now, payments, flash, error, draft, me }) => (
  <>
    <header class="phead">
      <Heading first={app.messages.title} />
      <p class="phead__lead">{app.messages.lead}</p>
    </header>
    <section class="talk" aria-label={app.messages.title}>
      {messages.length === 0 ? (
        <div class="nothing">
          <Tile art={ART.chat} size="lg" />
          <p class="nothing__title">{app.messages.empty}</p>
          <p class="nothing__lead">{app.messages.emptyLead}</p>
        </div>
      ) : (
        <ol class="talk__list">
          {messages.map((m, i) => {
            const about = m.paymentId ? payments.get(m.paymentId) : undefined
            return (
              <li class={`msg msg--${m.side}`} id={i === messages.length - 1 ? 'posledna' : undefined}>
                <div class="msg__bubble">
                  {about ? (
                    <a class="msg__about" href={`/app/platby/${about.id}`}>
                      {app.messages.about}: {paymentName(about)}, {signed(about.amountCents)}
                    </a>
                  ) : null}
                  <p class="msg__body">{m.body}</p>
                </div>
                <p class="msg__meta">
                  {m.side === 'client' ? (m.author && m.author !== me ? (m.authorName ?? app.messages.you) : app.messages.you) : (m.authorName ?? accountant ?? app.home.accountant)},{' '}
                  {whenName(m.createdAt, now)}
                </p>
              </li>
            )
          })}
        </ol>
      )}
      <Flash text={flash} />
      <form class="composer" id="napisat" method="post" action="/app/spravy" novalidate>
        <label class="sr" for="sprava">
          {app.messages.placeholder}
        </label>
        <textarea id="sprava" class="composer__area" name="sprava" rows={3} maxlength={APP.messageChars} placeholder={app.messages.placeholder} aria-invalid={error ? 'true' : undefined}>
          {draft ?? ''}
        </textarea>
        {error ? <p class="field__error composer__error">{error}</p> : null}
        <button class="btn btn--blue composer__send" type="submit">
          {app.messages.send}
        </button>
      </form>
    </section>
  </>
)

export const Missing: FC = () => (
  <section class="nothing">
    <Tile art={ART.lens} size="lg" />
    <p class="nothing__title">{app.errors.notFound}</p>
    <p class="nothing__lead">{app.errors.notFoundLead}</p>
    <a class="btn btn--line" href="/app">
      {app.nav.home}
    </a>
  </section>
)
