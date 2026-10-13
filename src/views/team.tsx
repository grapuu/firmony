// The accountants' side: the same frame and look as the client's app, with a column of its own. Built for doing
// the work quickly: what waits is counted everywhere, a document is booked on one screen with its original
// beside the form, and "Zaúčtovať a ďalší" goes straight to the next one.
import type { Child, FC } from 'hono/jsx'
import { APP, ART, BRAND, PLANS, type Art } from '../config'
import { formatEur } from '../format'
import { EXEMPT_NAMES, dayName, dayShort, readableName, signed } from '../app/copy'
import { CATEGORIES, CATEGORY_IDS, entryFor, textDay, type PaidBy } from '../app/booking'
import type { Exempt } from '../app/match'
import type { Company, Doc, Message, Payment, User } from '../app/store'
import { team as t } from '../team/copy'
import type { ClientRow, QueueDoc, Request, Rule, TeamMember, Thread, ToCheck } from '../team/store'
import { Tile } from './home'
import { BarMenu, Flash, Heading, InsideHead, planName } from './inside'
import { dayOf, groupIban, whenName } from './inside-pages'
import { Wordmark } from './layout'
import { InvoiceSheet } from './invoices'
import type { Line, StoredInvoice } from '../app/invoices'

export type TeamPlace = 'clients' | 'queue' | 'inbox' | 'requests' | 'people'

const NAV: { place: TeamPlace; href: string; label: string; short: string; art: Art | null; admin?: boolean }[] = [
  { place: 'clients', href: '/ucto', label: t.nav.clients, short: t.nav.short.clients, art: ART.tree },
  { place: 'queue', href: '/ucto/doklady', label: t.nav.queue, short: t.nav.short.queue, art: ART.paperInvoice },
  { place: 'inbox', href: '/ucto/spravy', label: t.nav.inbox, short: t.nav.short.inbox, art: ART.chat },
  { place: 'requests', href: '/ucto/ziadosti', label: t.nav.requests, short: t.nav.short.requests, art: ART.envelope, admin: true },
  { place: 'people', href: '/ucto/tim', label: t.nav.people, short: t.nav.short.people, art: ART.lens, admin: true },
]

export interface TeamShellProps {
  user: User
  place: TeamPlace | null
  counts: { queue: number; inbox: number; requests: number }
  ownCompany: boolean
  title: string
  children: Child
}

export const TeamShell: FC<TeamShellProps> = ({ user, place, counts, ownCompany, title, children }) => {
  const items = NAV.filter((item) => !item.admin || user.team === 'admin')
  const count = (p: TeamPlace) => (p === 'queue' ? counts.queue : p === 'inbox' ? counts.inbox : p === 'requests' ? counts.requests : 0)
  return (
    <html lang="sk">
      <InsideHead title={`${title} | ${BRAND.name}`} />
      <body class="inside inside--team">
        <a class="skip" href="#obsah">
          Preskočiť na obsah
        </a>
        <div class="shell">
          <aside class="side" aria-label={t.nav.label}>
            <div class="side__top">
              <Wordmark href="/ucto" label={t.nav.clients} />
            </div>
            <div class="side__company side__company--team">
              <span class="side__name">{t.nav.label}</span>
              <span class="side__plan">{user.team ? t.nav.role[user.team] : ''}</span>
            </div>
            <nav class="side__nav">
              {items.map((item) => (
                <a class="side__link" href={item.href} aria-current={place === item.place ? 'page' : undefined}>
                  <Tile art={item.art} size="sm" />
                  <span class="side__label">{item.label}</span>
                  {count(item.place) > 0 ? <span class={`count count--${item.place === 'queue' ? 'amber' : 'blue'}`}>{count(item.place)}</span> : null}
                </a>
              ))}
              {ownCompany ? (
                <a class="side__link side__link--quiet" href="/app">
                  <Tile art={ART.mark} size="sm" />
                  <span class="side__label">{t.nav.own}</span>
                </a>
              ) : null}
            </nav>
            <div class="side__foot">
              <span class="side__user">{user.name}</span>
              <span class="side__email">{user.email}</span>
              <form method="post" action="/app/odhlasit">
                <button class="side__out" type="submit">
                  Odhlásiť sa
                </button>
              </form>
            </div>
          </aside>
          <div class="stage">
            <header class="bar">
              <Wordmark href="/ucto" label={t.nav.clients} />
              <BarMenu label={user.team ? t.nav.role[user.team] : t.nav.label} user={user}>
                {ownCompany ? (
                  <a class="barmenu__item" href="/app">
                    {t.nav.own}
                  </a>
                ) : null}
              </BarMenu>
            </header>
            <main id="obsah" class="content">
              {children}
            </main>
          </div>
        </div>
        <nav class="tabs tabs--team" aria-label={t.nav.label}>
          {items.slice(0, 5).map((item) => (
            <a class="tabs__link" href={item.href} aria-current={place === item.place ? 'page' : undefined}>
              <span class="tabs__icon">
                {item.art ? <img class="tabs__img" src={item.art.small?.src ?? item.art.src} alt="" width="30" height="30" /> : null}
                {count(item.place) > 0 ? <span class={`tabs__dot${item.place === 'queue' ? '' : ' tabs__dot--blue'}`}>{count(item.place)}</span> : null}
              </span>
              <span class="tabs__label">{item.short}</span>
            </a>
          ))}
        </nav>
      </body>
    </html>
  )
}

const Badge: FC<{ n: number; tone: 'amber' | 'blue' | 'grey' }> = ({ n, tone }) => (n > 0 ? <span class={`count count--${tone}`}>{n}</span> : <span class="tbl__zero">0</span>)

// ---------------------------------------------------------------------------------------------------------------
// Klienti
// ---------------------------------------------------------------------------------------------------------------

export const ClientsPage: FC<{ user: User; rows: ClientRow[]; now: number; flash?: string | null }> = ({ user, rows, now, flash }) => {
  const sum = (pick: (row: ClientRow) => number) => rows.reduce((total, row) => total + pick(row), 0)
  const waiting = rows.filter((row) => row.waiting !== null).length
  const admin = user.team === 'admin'
  return (
    <>
      <header class="phead phead--row">
        <div>
          <Heading first={t.clients.title} second={t.clients.serif} />
          <p class="phead__lead">{t.clients.lead}</p>
        </div>
        {admin ? (
          <a class="btn btn--blue" href="/ucto/klienti/novy">
            {t.clients.add}
          </a>
        ) : null}
      </header>
      <Flash text={flash} />
      <dl class="figs__grid figs__grid--four">
        <div class="fig">
          <dt>{t.clients.toBook}</dt>
          <dd class="fig__value">{sum((r) => r.toBook)}</dd>
        </div>
        <div class="fig">
          <dt>{t.clients.unanswered}</dt>
          <dd class="fig__value">{waiting}</dd>
        </div>
        <div class="fig">
          <dt>{t.clients.toCheck}</dt>
          <dd class="fig__value">{sum((r) => r.toCheck)}</dd>
        </div>
        <div class="fig">
          <dt>{t.clients.missing}</dt>
          <dd class="fig__value">{sum((r) => r.missing)}</dd>
        </div>
      </dl>
      {rows.length === 0 ? (
        <p class="over__empty">{admin ? t.clients.empty : t.clients.emptyMine}</p>
      ) : (
        <div class={`tbl${admin ? ' tbl--admin' : ''}`} role="table" aria-label={t.clients.title}>
          <div class="tbl__head" role="row">
            <span role="columnheader">{t.clients.columns.company}</span>
            <span role="columnheader">{t.clients.columns.book}</span>
            <span role="columnheader">{t.clients.columns.check}</span>
            <span role="columnheader">{t.clients.columns.messages}</span>
            <span role="columnheader">{t.clients.columns.missing}</span>
            {admin ? <span role="columnheader">{t.clients.columns.accountant}</span> : null}
          </div>
          {rows.map((row) => {
            const done = row.toBook === 0 && row.toCheck === 0 && row.waiting === null
            return (
              <a class={`tbl__row${done ? ' tbl__row--done' : ''}`} role="row" href={`/ucto/klienti/${row.company.id}`}>
                <span class="tbl__company" role="cell">
                  <span class="tbl__name">
                    {row.company.name}
                    {done ? <span class="tick tick--green tbl__tick" role="img" aria-label={t.clients.done} /> : null}
                  </span>
                  <span class="tbl__sub">
                    <span>{t.clients.plan(planName(row.company.plan))}</span>
                    <span>{row.company.vatPayer ? t.clients.vat : t.clients.noVat}</span>
                  </span>
                </span>
                <span class="tbl__num" role="cell" data-label={t.clients.columns.book}>
                  <Badge n={row.toBook} tone="amber" />
                  {row.reading > 0 ? <span class="tbl__note">+{row.reading} {t.clients.reading.toLowerCase()}</span> : null}
                </span>
                <span class="tbl__num" role="cell" data-label={t.clients.columns.check}>
                  <Badge n={row.toCheck} tone="amber" />
                </span>
                <span class={`tbl__num${row.waiting === null ? ' tbl__num--empty' : ''}`} role="cell" data-label={t.clients.columns.messages}>
                  {row.waiting !== null ? <span class="pill pill--blue">{t.clients.waits}</span> : null}
                </span>
                <span class="tbl__num" role="cell" data-label={t.clients.columns.missing}>
                  <Badge n={row.missing} tone="grey" />
                </span>
                {admin ? (
                  <span class="tbl__who" role="cell" data-label={t.clients.columns.accountant}>
                    {row.company.accountantName ?? t.clients.nobody}
                  </span>
                ) : null}
              </a>
            )
          })}
        </div>
      )}
      <p class="sr">{dayOf(now)}</p>
    </>
  )
}

// ---------------------------------------------------------------------------------------------------------------
// One client
// ---------------------------------------------------------------------------------------------------------------

export interface ClientPageProps {
  user: User
  company: Company
  members: User[]
  queue: QueueDoc[]
  toCheck: ToCheck[]
  missing: Payment[]
  messages: Message[]
  rules: Rule[]
  accountants: { id: string; name: string }[]
  now: number
  month: string
  flash?: string | null
  error?: string | null
  draft?: string
}

export const ClientPage: FC<ClientPageProps> = (p) => {
  const c = p.company
  const admin = p.user.team === 'admin'
  return (
    <>
      <a class="back" href="/ucto">
        {t.client.back}
      </a>
      <header class="phero">
        <p class="phero__kind phero__kind--row">
          <span>{t.clients.plan(planName(c.plan))}</span>
          <span>{c.vatPayer ? t.clients.vat : t.clients.noVat}</span>
        </p>
        <h1 class="phero__name">{c.name}</h1>
        <p class="phero__meta">
          {c.ico ? (
            <span>
              {t.client.ico} {c.ico}
            </span>
          ) : null}
          {c.address ? <span>{c.address}</span> : null}
          <span>{c.accountantName ?? t.clients.nobody}</span>
        </p>
      </header>
      <Flash text={p.flash} />
      <Flash text={p.error} tone="error" />
      <nav class="jump" aria-label={c.name}>
        <a href="#zauctovat">
          {t.client.toBook} <span class="count count--amber">{p.queue.length}</span>
        </a>
        <a href="#kontrola">
          {t.clients.toCheck} <span class="count count--amber">{p.toCheck.length}</span>
        </a>
        <a href="#spravy">{t.client.messages}</a>
        <a href="#chyba">{t.clients.missing}</a>
        <a href="#udaje">{t.client.details}</a>
      </nav>
      <div class="pgrid pgrid--wide">
        <div class="pgrid__main">
          <section class="info" id="zauctovat" aria-labelledby="zauctovat-t">
            <h2 id="zauctovat-t" class="info__title">
              {t.client.toBook}
            </h2>
            {p.queue.length === 0 ? (
              <p class="info__empty">{t.client.toBookEmpty}</p>
            ) : (
              <ul class="rows">
                {p.queue.map((d) => (
                  <QueueRow d={d} />
                ))}
              </ul>
            )}
          </section>
          <section class="info" id="kontrola" aria-labelledby="kontrola-t">
            <h2 id="kontrola-t" class="info__title">
              {t.client.toCheck}
            </h2>
            {p.toCheck.length === 0 ? (
              <p class="info__empty">{t.client.nothing}</p>
            ) : (
              <>
                <p class="info__lead">{t.client.toCheckLead}</p>
                <ul class="checks">
                  {p.toCheck.map((x) => (
                    <li class="check">
                      <div class="check__text">
                        <span class="check__title">
                          {x.party ? readableName(x.party) : (x.note ?? '')} <span class="check__amount">{signed(x.amountCents)}</span>
                        </span>
                        <span class="check__sub">
                          <span>{dayShort(x.bookedOn)}</span>
                          <span>
                            {EXEMPT_NAMES[x.exempt as Exempt]?.name ?? x.exempt}
                            {x.exemptNote ? `: ${x.exemptNote}` : ''}
                          </span>
                          {x.byName ? <span>{x.byName}</span> : null}
                        </span>
                      </div>
                      <div class="check__actions">
                        <form method="post" action={`/ucto/platby/${x.id}/kontrola`}>
                          <input type="hidden" name="ok" value="1" />
                          <button class="btn btn--blue btn--small" type="submit">
                            {t.client.checkOk}
                          </button>
                        </form>
                        <form method="post" action={`/ucto/platby/${x.id}/kontrola`}>
                          <input type="hidden" name="ok" value="0" />
                          <button class="btn btn--line btn--small" type="submit">
                            {t.client.checkBack}
                          </button>
                        </form>
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
          <section class="info" id="spravy" aria-labelledby="spravy-t">
            <h2 id="spravy-t" class="info__title">
              {t.client.messages}
            </h2>
            <Thread messages={p.messages} now={p.now} />
            <form class="composer" method="post" action={`/ucto/klienti/${c.id}/spravy`} novalidate>
              <label class="sr" for="odpoved">
                {t.client.replyPlaceholder}
              </label>
              <textarea id="odpoved" class="composer__area" name="sprava" rows={3} maxlength={APP.messageChars} placeholder={t.client.replyPlaceholder}>
                {p.draft ?? ''}
              </textarea>
              <button class="btn btn--blue composer__send" type="submit">
                {t.client.reply}
              </button>
            </form>
          </section>
          <section class="info" id="chyba" aria-labelledby="chyba-t">
            <h2 id="chyba-t" class="info__title">
              {t.client.missing}
            </h2>
            {p.missing.length === 0 ? (
              <p class="info__empty">{t.client.nothing}</p>
            ) : (
              <>
                <p class="info__lead">{t.client.missingLead}</p>
                <ul class="plain">
                  {p.missing.slice(0, 30).map((x) => (
                    <li class="plain__row">
                      <span>{dayShort(x.bookedOn)}</span>
                      <span class="plain__name">{x.party ? readableName(x.party) : (x.note ?? '')}</span>
                      <span class="plain__amount">{signed(x.amountCents)}</span>
                    </li>
                  ))}
                </ul>
                <form method="post" action={`/ucto/klienti/${c.id}/pripomenut`}>
                  <button class="btn btn--line btn--small" type="submit">
                    {t.client.remind}
                  </button>
                </form>
              </>
            )}
          </section>
        </div>
        <aside class="pgrid__side">
          <section class="info" id="udaje" aria-labelledby="udaje-t">
            <h2 id="udaje-t" class="info__title">
              {t.client.details}
            </h2>
            <p class="info__lead">{t.client.detailsLead}</p>
            <form class="stack" method="post" action={`/ucto/klienti/${c.id}/udaje`} novalidate>
              <label class="field__label" for="dic">
                {t.client.dic}
              </label>
              <input id="dic" class="field__input" name="dic" value={c.dic ?? ''} maxlength={12} inputmode="numeric" />
              <label class="field__label" for="icdph">
                {t.client.icdph}
              </label>
              <input id="icdph" class="field__input" name="icdph" value={c.icdph ?? ''} maxlength={14} />
              <label class="tickbox">
                <input type="checkbox" name="dph" value="1" checked={c.vatPayer} />
                <span>{t.client.vatPayer}</span>
              </label>
              {admin ? (
                <>
                  <label class="field__label" for="plan">
                    {t.client.plan}
                  </label>
                  <select id="plan" class="field__input" name="plan">
                    {PLANS.map((plan) => (
                      <option value={plan.id} selected={plan.id === c.plan}>
                        {plan.name}
                      </option>
                    ))}
                  </select>
                  <label class="field__label" for="uctovnicka">
                    {t.client.accountant}
                  </label>
                  <select id="uctovnicka" class="field__input" name="uctovnicka">
                    <option value="">{t.clients.nobody}</option>
                    {p.accountants.map((a) => (
                      <option value={a.id} selected={a.id === c.accountantId}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </>
              ) : null}
              <label class="field__label" for="poznamka">
                {t.client.note}
              </label>
              <textarea id="poznamka" class="field__input field__area" name="poznamka" rows={3} maxlength={1000} placeholder={t.client.notePlaceholder}>
                {c.note ?? ''}
              </textarea>
              <button class="btn btn--line" type="submit">
                {t.client.save}
              </button>
            </form>
          </section>
          <section class="info" aria-labelledby="ludia-t">
            <h2 id="ludia-t" class="info__title">
              {t.client.members}
            </h2>
            <ul class="plain">
              {p.members.map((m) => (
                <li class="plain__row plain__row--two">
                  <span class="plain__name">{m.name}</span>
                  <a class="link plain__mail" href={`mailto:${m.email}`}>
                    {m.email}
                  </a>
                </li>
              ))}
            </ul>
          </section>
          <section class="info" aria-labelledby="export-t">
            <h2 id="export-t" class="info__title">
              {t.client.export}
            </h2>
            <p class="info__lead">{t.client.exportLead}</p>
            <form class="inline" method="get" action={`/ucto/klienti/${c.id}/export`}>
              <label class="sr" for="mesiac">
                {t.client.export}
              </label>
              <select id="mesiac" class="field__input" name="mesiac">
                {lastMonths(p.month, 13).map((m) => (
                  <option value={m} selected={m === p.month}>
                    {monthName(m)}
                  </option>
                ))}
              </select>
              <button class="btn btn--line" type="submit">
                {t.client.exportButton}
              </button>
            </form>
          </section>
          <section class="info" aria-labelledby="pravidla-t">
            <h2 id="pravidla-t" class="info__title">
              {t.client.rules}
            </h2>
            <p class="info__lead">{p.rules.length === 0 ? t.client.rulesEmpty : t.client.rulesLead}</p>
            {p.rules.length > 0 ? (
              <ul class="plain">
                {p.rules.map((r) => (
                  <li class="plain__row plain__row--two">
                    <span class="plain__name">{r.name ?? r.key}</span>
                    <span class="plain__sub">
                      <span>
                        {CATEGORIES[r.category]?.account} {CATEGORIES[r.category]?.name}
                      </span>
                      <span>{r.vatDeduct ? t.client.ruleDeduct : t.client.ruleNoDeduct}</span>
                      <span>{t.client.uses(r.uses)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        </aside>
      </div>
    </>
  )
}

const MONTHS = ['január', 'február', 'marec', 'apríl', 'máj', 'jún', 'júl', 'august', 'september', 'október', 'november', 'december']
const monthName = (month: string) => `${MONTHS[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`

/** This month and the ones before it, newest first, as YYYY-MM. */
function lastMonths(month: string, n: number): string[] {
  let [y, m] = month.split('-').map(Number) as [number, number]
  const out: string[] = []
  for (let i = 0; i < n; i++) {
    out.push(`${y}-${String(m).padStart(2, '0')}`)
    m -= 1
    if (m === 0) {
      m = 12
      y -= 1
    }
  }
  return out
}

const QueueRow: FC<{ d: QueueDoc | Doc; company?: boolean }> = ({ d, company }) => (
  <li class="row">
    <a class="row__link" href={`/ucto/doklady/${d.id}`}>
      <Tile art={d.kind === 'receipt' ? ART.paperReceipt : d.source === 'einvoice' ? ART.paperEinvoice : ART.paperInvoice} size="sm" />
      <span class="row__text">
        <span class="row__title">{d.party ?? d.fileName ?? t.book.kinds.other}</span>
        <span class="row__sub">
          {company && 'companyName' in d ? <span>{d.companyName}</span> : null}
          <span>{d.issuedOn ? dayShort(d.issuedOn) : dayShort(dayOf(d.createdAt))}</span>
          <span>{d.kind ? t.book.kinds[d.kind] : t.book.kinds.other}</span>
        </span>
      </span>
      <span class="row__end">
        <span class="row__amount">{d.totalCents !== null ? formatEur(d.totalCents) : ''}</span>
        <span class={`pill ${d.status === 'manual' || d.duplicateOf ? 'pill--amber' : d.proposal === 'rule' ? 'pill--ok' : 'pill--blue'}`}>
          {d.status === 'manual' ? t.queue.pill.manual : d.duplicateOf ? t.queue.pill.duplicate : d.proposal === 'rule' ? t.queue.pill.rule : d.proposal === 'ai' ? t.queue.pill.ai : t.queue.pill.check}
        </span>
      </span>
    </a>
  </li>
)

const Thread: FC<{ messages: Message[]; now: number }> = ({ messages, now }) =>
  messages.length === 0 ? (
    <p class="info__empty">{t.client.noMessages}</p>
  ) : (
    <ol class="talk__list talk__list--team">
      {messages.map((m, i) => (
        <li class={`msg msg--${m.side === 'firmony' ? 'client' : 'firmony'}`} id={i === messages.length - 1 ? 'posledna' : undefined}>
          <div class="msg__bubble">
            <p class="msg__body">{m.body}</p>
          </div>
          <p class="msg__meta">
            {m.authorName ?? (m.side === 'firmony' ? BRAND.name : '')}, {whenName(m.createdAt, now)}
          </p>
        </li>
      ))}
    </ol>
  )

// ---------------------------------------------------------------------------------------------------------------
// Na zaúčtovanie, Správy
// ---------------------------------------------------------------------------------------------------------------

export const QueuePage: FC<{ docs: QueueDoc[]; flash?: string | null }> = ({ docs, flash }) => {
  const groups = new Map<string, QueueDoc[]>()
  for (const d of docs) groups.set(d.companyName, [...(groups.get(d.companyName) ?? []), d])
  return (
    <>
      <header class="phead">
        <Heading first={t.queue.title} second={t.queue.serif} />
        <p class="phead__lead">{t.queue.lead}</p>
      </header>
      <Flash text={flash} />
      {docs.length === 0 ? (
        <section class="nothing">
          <Tile art={ART.seal} size="lg" />
          <p class="nothing__title">{t.queue.empty}</p>
        </section>
      ) : (
        [...groups].map(([name, items]) => (
          <section class="month" aria-label={name}>
            <h2 class="month__title">
              {name} <span class="count count--amber">{items.length}</span>
            </h2>
            <ul class="rows rows--card">
              {items.map((d) => (
                <QueueRow d={d} />
              ))}
            </ul>
          </section>
        ))
      )}
    </>
  )
}

export const InboxPage: FC<{ threads: Thread[]; now: number }> = ({ threads, now }) => (
  <>
    <header class="phead">
      <Heading first={t.inbox.title} second={t.inbox.serif} />
      <p class="phead__lead">{t.inbox.lead}</p>
    </header>
    {threads.length === 0 ? (
      <section class="nothing">
        <Tile art={ART.chat} size="lg" />
        <p class="nothing__title">{t.inbox.empty}</p>
      </section>
    ) : (
      <ul class="rows rows--card">
        {threads.map((th) => (
          <li class="row">
            <a class="row__link" href={`/ucto/klienti/${th.company.id}#spravy`}>
              <Tile art={ART.chat} size="sm" />
              <span class="row__text">
                <span class="row__title">{th.company.name}</span>
                <span class="row__sub row__sub--text">{th.body}</span>
              </span>
              <span class="row__end">
                <span class="pill pill--blue">{t.inbox.waiting(whenName(th.at, now))}</span>
              </span>
            </a>
          </li>
        ))}
      </ul>
    )}
  </>
)

// ---------------------------------------------------------------------------------------------------------------
// Zaúčtovať doklad
// ---------------------------------------------------------------------------------------------------------------

export interface BookValues {
  kind: string
  party: string
  ico: string
  number: string
  vs: string
  issued: string
  due: string
  total: string
  vat: string
  category: string
  deduct: boolean
  remember: boolean
  account: string
}

/** What the form shows for a document: its own values, written the way they are typed. */
export function valuesOf(d: Doc, vatPayer: boolean): BookValues {
  const money = (cents: number | null) => (cents === null ? '' : `${Math.floor(cents / 100)},${String(cents % 100).padStart(2, '0')}`)
  const category = d.category ?? ''
  return {
    kind: d.kind ?? '',
    party: d.party ?? '',
    ico: d.partyIco ?? '',
    number: d.number ?? '',
    vs: d.vs ?? '',
    issued: d.issuedOn ? textDay(d.issuedOn) : '',
    due: d.dueOn ? textDay(d.dueOn) : '',
    total: money(d.totalCents),
    vat: money(d.vatCents),
    category,
    deduct: vatPayer && (d.vatDeduct ?? (category ? CATEGORIES[category as keyof typeof CATEGORIES]?.deduct ?? true : true)),
    remember: true,
    account: d.account ?? '',
  }
}

export interface BookPageProps {
  d: Doc
  company: Company
  /** An invoice the client issued in Firmony: its sheet is the original. */
  invoice?: { invoice: StoredInvoice; lines: Line[] } | null
  values: BookValues
  payment: Payment | null
  candidates: Payment[]
  paidBy: PaidBy
  queueLeft: number
  now: number
  errors: Partial<Record<keyof BookValues, string>>
  flash?: string | null
}

const Field: FC<{ name: keyof BookValues; label: string; value: string; error?: string; type?: string; mode?: 'decimal' | 'numeric' | 'text'; wide?: boolean; max?: number }> = ({ name, label, value, error, type = 'text', mode, wide, max }) => (
  <div class={`fgrid__cell${wide ? ' fgrid__cell--wide' : ''}`}>
    <label class="field__label" for={`b-${name}`}>
      {label}
    </label>
    <input id={`b-${name}`} class="field__input" type={type} name={name} value={value} inputmode={mode} maxlength={max ?? 160} aria-invalid={error ? 'true' : undefined} />
    {error ? <p class="field__error">{error}</p> : null}
  </div>
)

export const BookPage: FC<BookPageProps> = ({ d, company, invoice, values, payment, candidates, paidBy, queueLeft, now, errors, flash }) => {
  const image = d.fileKey && d.fileType?.startsWith('image/') && d.fileType !== 'image/heic'
  const cents = (text: string) => {
    const m = /^(\d+)(?:[,.](\d{1,2}))?$/.exec(text.replace(/\s/g, ''))
    return m ? Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0')) : null
  }
  const entry = entryFor({
    kind: (values.kind || null) as Doc['kind'],
    category: (values.category || null) as Doc['category'],
    totalCents: cents(values.total),
    vatCents: cents(values.vat),
    vatPayer: company.vatPayer,
    vatDeduct: values.deduct,
    paidBy,
    account: values.account || null,
  })
  const paidName = { bank: t.book.paidBank, private: t.book.paidPrivate, cash: t.book.paidCash, unpaid: t.book.unpaid }[paidBy]
  return (
    <>
      <a class="back" href={`/ucto/klienti/${company.id}#zauctovat`}>
        {company.name}
      </a>
      <header class="phead phead--row">
        <div>
          <Heading first={t.book.title} small />
          <p class="phead__lead">
            {d.source === 'upload' && d.addedByName ? `${t.book.from.upload} ${d.addedByName}` : t.book.from[d.source]}, {whenName(d.createdAt, now)}
          </p>
        </div>
        {queueLeft > 0 ? <span class="pill pill--grey phead__aside">{t.book.left(queueLeft)}</span> : null}
      </header>
      <Flash text={flash} />
      {d.duplicateOf ? (
        <p class="flag">
          {t.book.duplicate}{' '}
          <a class="link" href={`/ucto/doklady/${d.duplicateOf}`}>
            {t.book.duplicateOpen}
          </a>
        </p>
      ) : null}
      {d.status === 'reading' ? <p class="flag flag--ask">{t.book.reading}</p> : null}
      {d.status === 'manual' ? <p class="flag">{t.book.manual}</p> : null}
      <div class="book">
        <div class="book__orig">
          {invoice ? (
            <div class="book__sheet">
              <InvoiceSheet invoice={invoice.invoice} lines={invoice.lines} seller={company} pay={false} />
            </div>
          ) : d.fileKey ? (
            image ? (
              <a class="book__img" href={`/ucto/subory/${d.id}`}>
                <img src={`/ucto/subory/${d.id}`} alt={t.book.open} />
              </a>
            ) : d.fileType === 'application/pdf' ? (
              <>
                <iframe class="book__pdf" src={`/ucto/subory/${d.id}`} title={d.fileName ?? t.book.open} />
                <p class="book__origfoot">
                  <span class="book__origname">{d.fileName ?? ''}</span>
                  <a class="link" href={`/ucto/subory/${d.id}`} target="_blank" rel="noopener">
                    {t.book.open}
                  </a>
                </p>
              </>
            ) : (
              <div class="book__file">
                <Tile art={d.fileType === 'application/pdf' ? ART.paperInvoice : ART.paperEinvoice} size="lg" />
                <p>{d.fileName ?? ''}</p>
                <a class="btn btn--line" href={`/ucto/subory/${d.id}`} target="_blank" rel="noopener">
                  {t.book.open}
                </a>
              </div>
            )
          ) : (
            <p class="info__empty">{t.book.noFile}</p>
          )}
        </div>
        <form class="book__form" method="post" action={`/ucto/doklady/${d.id}`} novalidate>
          {d.proposal ? <p class="book__proposal">{d.proposal === 'rule' ? t.book.proposalRule : t.book.proposalAi}</p> : null}
          <div class="fgrid">
            <div class="fgrid__cell">
              <label class="field__label" for="b-kind">
                {t.book.kind}
              </label>
              <select id="b-kind" class="field__input" name="kind" aria-invalid={errors.kind ? 'true' : undefined}>
                <option value="">{t.book.categoryNone}</option>
                {(['receipt', 'invoice_in', 'invoice_out', 'other'] as const).map((k) => (
                  <option value={k} selected={values.kind === k}>
                    {t.book.kinds[k]}
                  </option>
                ))}
              </select>
              {errors.kind ? <p class="field__error">{errors.kind}</p> : null}
            </div>
            <div class="fgrid__cell">
              <label class="field__label" for="b-category">
                {t.book.category}
              </label>
              <select id="b-category" class="field__input" name="category" aria-invalid={errors.category ? 'true' : undefined}>
                <option value="">{t.book.categoryNone}</option>
                <optgroup label={t.book.costs}>
                  {CATEGORY_IDS.filter((id) => !CATEGORIES[id].revenue).map((id) => (
                    <option value={id} selected={values.category === id}>
                      {CATEGORIES[id].account} {CATEGORIES[id].name}
                    </option>
                  ))}
                </optgroup>
                <optgroup label={t.book.revenues}>
                  {CATEGORY_IDS.filter((id) => CATEGORIES[id].revenue).map((id) => (
                    <option value={id} selected={values.category === id}>
                      {CATEGORIES[id].account} {CATEGORIES[id].name}
                    </option>
                  ))}
                </optgroup>
              </select>
              {errors.category ? <p class="field__error">{errors.category}</p> : null}
            </div>
            <Field name="party" label={t.book.party} value={values.party} error={errors.party} wide />
            <Field name="ico" label={t.book.ico} value={values.ico} mode="numeric" max={12} />
            <Field name="number" label={t.book.number} value={values.number} max={40} />
            <Field name="issued" label={t.book.issued} value={values.issued} error={errors.issued} max={16} />
            <Field name="due" label={t.book.due} value={values.due} error={errors.due} max={16} />
            <Field name="total" label={t.book.total} value={values.total} mode="decimal" error={errors.total} max={20} />
            <Field name="vat" label={t.book.vat} value={values.vat} mode="decimal" error={errors.vat} max={20} />
            <Field name="vs" label={t.book.vs} value={values.vs} mode="numeric" max={20} />
            <Field name="account" label={t.book.account} value={values.account} mode="numeric" max={6} />
          </div>
          <div class="book__ticks">
            {company.vatPayer ? (
              <label class="tickbox">
                <input type="checkbox" name="deduct" value="1" checked={values.deduct} />
                <span>{t.book.deduct}</span>
              </label>
            ) : null}
            <label class="tickbox">
              <input type="checkbox" name="remember" value="1" checked={values.remember} />
              <span>{t.book.remember}</span>
            </label>
          </div>
          <div class="entry" aria-live="polite">
            <p class="entry__title">
              <span>{t.book.entry}</span>
              <span class="entry__paid">{paidName}</span>
            </p>
            {entry.length === 0 ? (
              <p class="entry__none">{t.book.entryNone}</p>
            ) : (
              <table class="entry__table">
                <thead>
                  <tr>
                    <th scope="col">MD</th>
                    <th scope="col">D</th>
                    <th scope="col">{t.book.amount}</th>
                    <th scope="col">
                      <span class="sr">Čo</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {entry.map((line) => (
                    <tr>
                      <td>{line.md}</td>
                      <td>{line.d}</td>
                      <td>{formatEur(line.cents)}</td>
                      <td>{t.book.entryWhat[line.what]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          {d.bookedAt ? (
            <p class="book__booked">
              <span class="tick tick--green" aria-hidden="true" /> {t.book.booked(d.bookedByName ?? '', whenName(d.bookedAt, now))}
            </p>
          ) : null}
          <div class="book__actions">
            {d.bookedAt ? (
              <>
                <button class="btn btn--blue" type="submit" name="akcia" value="zauctovat">
                  {t.book.saveChanges}
                </button>
                <button class="btn btn--line" type="submit" name="akcia" value="zrusit">
                  {t.book.unbook}
                </button>
              </>
            ) : (
              <>
                <button class="btn btn--blue btn--large" type="submit" name="akcia" value="dalsi">
                  {t.book.bookNext}
                </button>
                <button class="btn btn--line" type="submit" name="akcia" value="ulozit">
                  {t.book.save}
                </button>
                <button class="btn btn--text book__discard" type="submit" name="akcia" value="zahodit" formnovalidate>
                  {d.duplicateOf ? t.book.discardDuplicate : t.book.discard}
                </button>
              </>
            )}
          </div>
        </form>
      </div>
      <section class="info book__pay" aria-labelledby="platba-t">
        <h2 id="platba-t" class="info__title">
          {t.book.pair}
        </h2>
        {payment ? (
          <p class="plain__row">
            <span>{dayShort(payment.bookedOn)}</span>
            <span class="plain__name">{payment.party ? readableName(payment.party) : (payment.note ?? '')}</span>
            <span class="plain__amount">{signed(payment.amountCents)}</span>
          </p>
        ) : (
          <>
            <p class="info__empty">{d.paidPrivately ? t.book.paidPrivate : t.book.pairNone}</p>
            {candidates.map((x) => (
              <form class="plain__row plain__row--form" method="post" action={`/ucto/doklady/${d.id}/platba`}>
                <input type="hidden" name="platba" value={x.id} />
                <span>{dayShort(x.bookedOn)}</span>
                <span class="plain__name">{x.party ? readableName(x.party) : (x.note ?? '')}</span>
                <span class="plain__amount">{signed(x.amountCents)}</span>
                <button class="btn btn--line btn--small" type="submit">
                  {t.book.pairPick}
                </button>
              </form>
            ))}
          </>
        )}
        {payment?.accountIban ? <p class="info__source">{groupIban(payment.accountIban)}</p> : null}
      </section>
    </>
  )
}

// ---------------------------------------------------------------------------------------------------------------
// Žiadosti, nový klient, tím
// ---------------------------------------------------------------------------------------------------------------

export const RequestsPage: FC<{ requests: Request[]; now: number; flash?: string | null }> = ({ requests, now, flash }) => (
  <>
    <header class="phead">
      <Heading first={t.requests.title} second={t.requests.serif} />
      <p class="phead__lead">{t.requests.lead}</p>
    </header>
    <Flash text={flash} />
    {requests.length === 0 ? (
      <section class="nothing">
        <Tile art={ART.envelope} size="lg" />
        <p class="nothing__title">{t.requests.empty}</p>
      </section>
    ) : (
      <ul class="reqs">
        {requests.map((r) => (
          <li class={`req req--${r.status}`}>
            <div class="req__main">
              <p class="req__company">
                {r.company ?? t.requests.noCompany}
                {r.ico ? <span class="req__ico">IČO {r.ico}</span> : null}
              </p>
              <p class="req__who">
                <span>{r.name}</span>
                <a class="link" href={`mailto:${r.email}`}>
                  {r.email}
                </a>
                {r.phone ? <span>{r.phone}</span> : null}
              </p>
              <p class="req__sub">
                <span>{t.clients.plan(PLANS.find((p) => p.id === r.plan)?.name ?? r.plan)}</span>
                <span>{t.requests.situation[r.situation as keyof typeof t.requests.situation] ?? r.situation}</span>
                <span>{whenName(r.createdAt, now)}</span>
              </p>
              {r.note ? <p class="req__note">{r.note}</p> : null}
            </div>
            <div class="req__side">
              <span class={`pill ${r.status === 'new' ? 'pill--amber' : r.status === 'client' ? 'pill--ok' : 'pill--grey'}`}>{t.requests.status[r.status as keyof typeof t.requests.status] ?? r.status}</span>
              {r.status === 'new' || r.status === 'contacted' ? (
                <div class="req__actions">
                  <a class="btn btn--blue btn--small" href={`/ucto/klienti/novy?ziadost=${r.id}`}>
                    {t.requests.make}
                  </a>
                  {r.status === 'new' ? (
                    <form method="post" action={`/ucto/ziadosti/${r.id}`}>
                      <input type="hidden" name="stav" value="contacted" />
                      <button class="btn btn--line btn--small" type="submit">
                        {t.requests.contacted}
                      </button>
                    </form>
                  ) : null}
                  <form method="post" action={`/ucto/ziadosti/${r.id}`}>
                    <input type="hidden" name="stav" value="declined" />
                    <button class="btn btn--text btn--small" type="submit">
                      {t.requests.declined}
                    </button>
                  </form>
                </div>
              ) : r.status === 'declined' ? (
                <form method="post" action={`/ucto/ziadosti/${r.id}`}>
                  <input type="hidden" name="stav" value="new" />
                  <button class="btn btn--text btn--small" type="submit">
                    {t.requests.reopen}
                  </button>
                </form>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    )}
  </>
)

export interface NewClientValues {
  ico: string
  name: string
  address: string
  person: string
  email: string
  plan: string
  vat: boolean
  accountant: string
  welcome: boolean
  request: string
}

export const NewClientPage: FC<{ values: NewClientValues; accountants: { id: string; name: string }[]; errors: Partial<Record<keyof NewClientValues | 'form', string>>; found?: string | null }> = ({ values, accountants, errors, found }) => (
  <>
    <a class="back" href={values.request ? '/ucto/ziadosti' : '/ucto'}>
      {values.request ? t.requests.title : t.nav.clients}
    </a>
    <header class="phead">
      <Heading first={t.newClient.title} second={t.newClient.serif} />
      <p class="phead__lead">{t.newClient.lead}</p>
    </header>
    <Flash text={errors.form} tone="error" />
    <section class="info info--form">
      <form class="stack" method="post" action="/ucto/klienti" novalidate>
        <input type="hidden" name="ziadost" value={values.request} />
        <div class="fgrid">
          <div class="fgrid__cell">
            <label class="field__label" for="n-ico">
              {t.newClient.ico}
            </label>
            <input id="n-ico" class="field__input" name="ico" value={values.ico} inputmode="numeric" maxlength={12} aria-invalid={errors.ico ? 'true' : undefined} />
            {errors.ico ? <p class="field__error">{errors.ico}</p> : <p class="field__hint">{found ?? t.newClient.icoHint}</p>}
          </div>
          <div class="fgrid__cell fgrid__cell--end">
            <button class="btn btn--line" type="submit" name="akcia" value="register" formnovalidate>
              {t.newClient.lookup}
            </button>
          </div>
          <div class="fgrid__cell fgrid__cell--wide">
            <label class="field__label" for="n-name">
              {t.newClient.name}
            </label>
            <input id="n-name" class="field__input" name="name" value={values.name} maxlength={160} aria-invalid={errors.name ? 'true' : undefined} />
            {errors.name ? <p class="field__error">{errors.name}</p> : null}
          </div>
          <div class="fgrid__cell fgrid__cell--wide">
            <label class="field__label" for="n-address">
              {t.newClient.address}
            </label>
            <input id="n-address" class="field__input" name="address" value={values.address} maxlength={200} />
          </div>
          <div class="fgrid__cell">
            <label class="field__label" for="n-person">
              {t.newClient.person}
            </label>
            <input id="n-person" class="field__input" name="person" value={values.person} maxlength={120} aria-invalid={errors.person ? 'true' : undefined} />
            {errors.person ? <p class="field__error">{errors.person}</p> : null}
          </div>
          <div class="fgrid__cell">
            <label class="field__label" for="n-email">
              {t.newClient.email}
            </label>
            <input id="n-email" class="field__input" type="email" name="email" value={values.email} maxlength={200} aria-invalid={errors.email ? 'true' : undefined} />
            {errors.email ? <p class="field__error">{errors.email}</p> : null}
          </div>
          <div class="fgrid__cell">
            <label class="field__label" for="n-plan">
              {t.newClient.plan}
            </label>
            <select id="n-plan" class="field__input" name="plan">
              {PLANS.map((plan) => (
                <option value={plan.id} selected={plan.id === values.plan}>
                  {plan.name}
                </option>
              ))}
            </select>
          </div>
          <div class="fgrid__cell">
            <label class="field__label" for="n-accountant">
              {t.newClient.accountant}
            </label>
            <select id="n-accountant" class="field__input" name="uctovnicka">
              <option value="">{t.newClient.noAccountant}</option>
              {accountants.map((a) => (
                <option value={a.id} selected={a.id === values.accountant}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <label class="tickbox">
          <input type="checkbox" name="dph" value="1" checked={values.vat} />
          <span>{t.newClient.vatPayer}</span>
        </label>
        <label class="tickbox">
          <input type="checkbox" name="uvitat" value="1" checked={values.welcome} />
          <span>{t.newClient.welcome}</span>
        </label>
        <button class="btn btn--blue btn--large stack__submit" type="submit" name="akcia" value="zalozit">
          {t.newClient.create}
        </button>
      </form>
    </section>
  </>
)

export const PeoplePage: FC<{ people: TeamMember[]; values: { name: string; email: string; role: string }; errors: { name?: string; email?: string }; flash?: string | null }> = ({ people, values, errors, flash }) => (
  <>
    <header class="phead">
      <Heading first={t.people.title} second={t.people.serif} />
      <p class="phead__lead">{t.people.lead}</p>
    </header>
    <Flash text={flash} />
    <ul class="rows rows--card">
      {people.map((m) => (
        <li class="row">
          <span class="row__link row__link--static">
            <Tile art={ART.lens} size="sm" />
            <span class="row__text">
              <span class="row__title">{m.name}</span>
              <span class="row__sub">
                <span>{m.email}</span>
                <span>{t.people.clients(m.clients)}</span>
              </span>
            </span>
            <span class="row__end">
              <span class={`pill ${m.team === 'admin' ? 'pill--blue' : 'pill--grey'}`}>{t.nav.role[m.team]}</span>
            </span>
          </span>
        </li>
      ))}
    </ul>
    <section class="info info--form">
      <h2 class="info__title">{t.people.add}</h2>
      <form class="stack" method="post" action="/ucto/tim" novalidate>
        <div class="fgrid">
          <div class="fgrid__cell">
            <label class="field__label" for="p-name">
              {t.people.name}
            </label>
            <input id="p-name" class="field__input" name="name" value={values.name} maxlength={120} aria-invalid={errors.name ? 'true' : undefined} />
            {errors.name ? <p class="field__error">{errors.name}</p> : null}
          </div>
          <div class="fgrid__cell">
            <label class="field__label" for="p-email">
              {t.people.email}
            </label>
            <input id="p-email" class="field__input" type="email" name="email" value={values.email} maxlength={200} aria-invalid={errors.email ? 'true' : undefined} />
            {errors.email ? <p class="field__error">{errors.email}</p> : null}
          </div>
          <div class="fgrid__cell">
            <label class="field__label" for="p-role">
              {t.people.role}
            </label>
            <select id="p-role" class="field__input" name="rola">
              <option value="accountant" selected={values.role !== 'admin'}>
                {t.nav.role.accountant}
              </option>
              <option value="admin" selected={values.role === 'admin'}>
                {t.nav.role.admin}
              </option>
            </select>
          </div>
        </div>
        <button class="btn btn--blue stack__submit" type="submit">
          {t.people.add}
        </button>
      </form>
    </section>
  </>
)

export const TeamMissing: FC = () => (
  <section class="nothing">
    <Tile art={ART.lens} size="lg" />
    <p class="nothing__title">{t.errors.notFound}</p>
    <p class="nothing__lead">{t.errors.notFoundLead}</p>
    <a class="btn btn--line" href="/ucto">
      {t.nav.clients}
    </a>
  </section>
)

export { dayName }
