import { fiveYearsAfter } from '../aml/retention'
import type { HandoverQueueItem } from '../migration/store'
import { HANDOVER_STATES } from '../migration/model'
// The accountants' side: the same frame and look as the client's app, with a column of its own. Built for doing
// the work quickly: what waits is counted everywhere, a document is booked on one screen with its original
// beside the form, and "Zaúčtovať a ďalší" goes straight to the next one.
import type { Child, FC } from 'hono/jsx'
import { APP, ART, BRAND, EKASA_VERIFY, INVESTORS, OFFLINE_TERMS, PLANS, type Art } from '../config'
import { formatEur, formatEurExact } from '../format'
import { EXEMPT_NAMES, app, dayName, dayShort, readableName, signed } from '../app/copy'
import { CATEGORIES, CATEGORY_IDS, entryFor, textDay, type PaidBy } from '../app/booking'
import type { LedgerLine } from '../app/ledger'
import type { Exempt } from '../app/match'
import type { Company, Doc, Message, Payment, User } from '../app/store'
import type { VatStatus } from '../app/vat'
import { coefText } from '../app/vat-ratio'
import { TAX_OFFICES } from '../app/vat-xml'
import { VatFields, type VatForm } from './vat'
import { moneyText } from '../app/vat-form'
import type { Paper, PoaState } from '../app/papers'
import type { MoneyView } from '../app/money'
import { MoneyCard } from './inside-pages'
import type { StatementView } from '../app/statements'
import type { DeclarationState, Level } from '../app/aml'
import { addDays, endingOf, type Ending } from '../app/ending'
import { team as t } from '../team/copy'
import { MonyBubble } from './mony'
import type { MonyAudience } from '../assistant/mony'
import { clientDone, type AutoQueued, type ClientRow, type InvestorRequest, type QueueDoc, type Request, type Rule, type TeamMember, type Thread, type ToCheck } from '../team/store'
import { Tile } from './home'
import { BarMenu, Flash, Heading, InsideHead, planName } from './inside'
import { dayOf, groupIban, whenName } from './inside-pages'
import { Wordmark } from './layout'
import { InvoiceSheet } from './invoices'
import { TripSheet } from './trips'
import { CenterSelect } from './centers'
import type { CostCenter } from '../app/centers'
import type { Trip } from '../app/trips-store'
import type { Line, StoredInvoice } from '../app/invoices'
import { responseDueAt } from '../team/support'
import { pressing } from '../team/deadlines'
import type { DueRow } from '../team/deadlines-store'
import { DueItem } from './deadlines'
import { UsageLine } from './overview'
import type { PlanUsage } from '../team/plan-usage'

export type TeamPlace = 'overview' | 'clients' | 'deadlines' | 'queue' | 'inbox' | 'requests' | 'users' | 'billing' | 'people' | 'work' | 'ai' | 'analytics' | 'workspaces' | 'incidents'

/** The team's places. `menu`: seldom used, so on a phone it is always in the bar's menu, never a tab. */
const NAV: { place: TeamPlace; href: string; label: string; short: string; art: Art | null; admin?: boolean; owner?: boolean; menu?: boolean }[] = [
  { place: 'overview', href: '/ucto/prehlad', label: t.nav.overview, short: t.nav.short.overview, art: ART.rocket, admin: true, menu: true },
  { place: 'clients', href: '/ucto', label: t.nav.clients, short: t.nav.short.clients, art: ART.tree },
  { place: 'deadlines', href: '/ucto/terminy', label: t.nav.deadlines, short: t.nav.short.deadlines, art: ART.paperReturn },
  { place: 'queue', href: '/ucto/doklady', label: t.nav.queue, short: t.nav.short.queue, art: ART.paperInvoice },
  { place: 'inbox', href: '/ucto/spravy', label: t.nav.inbox, short: t.nav.short.inbox, art: ART.chat },
  { place: 'requests', href: '/ucto/ziadosti', label: t.nav.requests, short: t.nav.short.requests, art: ART.envelope, admin: true },
  { place: 'users', href: '/ucto/pouzivatelia', label: t.nav.users, short: t.nav.short.users, art: ART.key, admin: true, owner: true },
  { place: 'billing', href: '/ucto/fakturacia', label: t.nav.billing, short: t.nav.short.billing, art: ART.savings, admin: true },
  { place: 'people', href: '/ucto/tim', label: t.nav.people, short: t.nav.short.people, art: ART.lens, admin: true },
  { place: 'work', href: '/ucto/vykaz', label: t.nav.work, short: t.nav.short.work, art: ART.savings },
  { place: 'ai', href: '/ucto/ai', label: t.nav.ai, short: t.nav.short.ai, art: ART.chip, menu: true },
  { place: 'analytics', href: '/ucto/analytika', label: t.nav.analytics, short: t.nav.short.analytics, art: ART.rocket, admin: true, menu: true },
  { place: 'workspaces', href: '/ucto/fakturacne-ucty', label: t.nav.workspaces, short: t.nav.short.workspaces, art: ART.paperInvoice, admin: true, menu: true },
  { place: 'incidents', href: '/ucto/incidenty', label: t.nav.incidents, short: t.nav.short.incidents, art: ART.lens, menu: true },
]

/** A phone's tab bar holds five places; the others are in the bar's menu. */
const TABS = 5

export interface TeamShellProps {
  user: User
  place: TeamPlace | null
  counts: { queue: number; inbox: number; requests: number }
  ownCompany: boolean
  /** The owner's own account: the only one that sees the people's contacts (team/people.ts, isOwner). */
  owner?: boolean
  title: string
  /** Mony in the corner, for whom it answers here; none without its key. */
  mony?: MonyAudience | null
  children: Child
}

export const TeamShell: FC<TeamShellProps> = ({ user, place, counts, ownCompany, owner = false, title, mony = null, children }) => {
  const items = NAV.filter((item) => (!item.admin || user.team === 'admin') && (!item.owner || owner))
  const tabs = items.filter((item) => !item.menu).slice(0, TABS)
  const menu = items.filter((item) => !tabs.includes(item))
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
              <a class="side__out" href="/auth?next=%2Fucto">Zabezpečenie prístupu</a>
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
                {menu.map((item) => (
                  <a class="barmenu__item" href={item.href} aria-current={place === item.place ? 'page' : undefined}>
                    {item.label}
                  </a>
                ))}
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
          {tabs.map((item) => (
            <a class="tabs__link" href={item.href} aria-current={place === item.place ? 'page' : undefined}>
              <span class="tabs__icon">
                {item.art ? <img class="tabs__img" src={item.art.small?.src ?? item.art.src} alt="" width="30" height="30" /> : null}
                {count(item.place) > 0 ? <span class={`tabs__dot${item.place === 'queue' ? '' : ' tabs__dot--blue'}`}>{count(item.place)}</span> : null}
              </span>
              <span class="tabs__label">{item.short}</span>
            </a>
          ))}
        </nav>
        {mony ? <MonyBubble audience={mony} /> : null}
      </body>
    </html>
  )
}

const vatLabel = (status: VatStatus) => (status === 'payer' ? t.clients.vat : status === 'reg7a' ? t.clients.vat7a : t.clients.noVat)

const Badge: FC<{ n: number; tone: 'amber' | 'blue' | 'grey' }> = ({ n, tone }) => (n > 0 ? <span class={`count count--${tone}`}>{n}</span> : <span class="tbl__zero">0</span>)

// ---------------------------------------------------------------------------------------------------------------
// Klienti
// ---------------------------------------------------------------------------------------------------------------

export interface EndedCompany {
  id: string
  name: string
  ico: string | null
  endsOn: string
  purgedAt: number
}

const TODAY_SHOWN = 8

export const ClientsPage: FC<{ user: User; rows: ClientRow[]; dues?: DueRow[]; mail?: { n: number; error: string | null } | null; ended?: EndedCompany[]; takeovers?:HandoverQueueItem[]; now: number; flash?: string | null }> = ({ user, rows, dues = [], mail = null, ended = [], takeovers = [], now, flash }) => {
  const sum = (pick: (row: ClientRow) => number) => rows.reduce((total, row) => total + pick(row), 0)
  const waiting = rows.filter((row) => row.waiting !== null).length
  const admin = user.team === 'admin'
  const today = dayOf(now)
  const urgent = pressing(dues, today)
  const byCompany = new Map<string, { late: number; soon: number }>()
  for (const d of urgent) {
    const n = byCompany.get(d.companyId) ?? { late: 0, soon: 0 }
    if (d.late) n.late++
    else n.soon++
    byCompany.set(d.companyId, n)
  }
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
      <section class="info today" aria-labelledby="dnes-t">
        <div class="today__head">
          <h2 id="dnes-t" class="info__title">
            {t.clients.today.title}
          </h2>
          <span class="today__links">
            <a class="link" href="/ucto/podania">Podania na dokončenie</a>
            <a class="link" href="/ucto/terminy?kto=my">{t.clients.today.all}</a>
          </span>
        </div>
        {mail && mail.n > 0 ? <p class="flag">{t.clients.today.mailFailed(mail.n, mail.error)}</p> : null}
        {urgent.length === 0 ? (
          <p class="info__empty">{t.clients.today.empty}</p>
        ) : (
          <>
            <p class="info__lead">{t.clients.today.lead}</p>
            <ul class="dues__list today__list">
              {urgent.slice(0, TODAY_SHOWN).map((d) => (
                <DueItem d={d} today={today} admin={admin} back="/ucto/terminy?kto=my" />
              ))}
            </ul>
            {urgent.length > TODAY_SHOWN ? (
              <a class="link" href="/ucto/terminy?kto=my">
                {t.clients.today.more(urgent.length - TODAY_SHOWN)}
              </a>
            ) : null}
          </>
        )}
      </section>
      {takeovers.length ? <section class="info managed-takeover" aria-labelledby="prevzatia-t"><h2 class="info__title" id="prevzatia-t">Prevzatia firiem</h2><ul class="plain">{takeovers.map(h => <li class="plain__row plain__row--two"><a class="link plain__name" href={`/ucto/klienti/${h.companyId}/prevzatie#koordinacia`}>{h.companyName}</a><span class="plain__sub">{HANDOVER_STATES[h.state]}{h.responsibleName ? `, ${h.responsibleName}` : ', čaká na pridelenú účtovníčku'}{h.dueOn ? `, ďalší krok do ${dayName(h.dueOn,today)}` : ''}</span></li>)}</ul></section> : null}
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
            const ending = endingOf(row.company, dayOf(now))
            // Past the last day the books are owed to the client: within thirty days, then it is late.
            const owed = ending && ending.phase !== 'ending' && row.handover === 0 ? (dayOf(now) > ending.handoverBy ? 'late' : 'due') : null
            const due = byCompany.get(row.company.id)
            const done = clientDone(row, owed !== null, due ? due.late + due.soon : 0)
            return (
              <a class={`tbl__row${done ? ' tbl__row--done' : ''}`} role="row" href={`/ucto/klienti/${row.company.id}`}>
                <span class="tbl__company" role="cell">
                  <span class="tbl__name">
                    {row.company.name}
                    {done ? <span class="tick tick--green tbl__tick" role="img" aria-label={t.clients.done} /> : null}
                  </span>
                  <span class="tbl__sub">
                    <span>{t.clients.plan(planName(row.company.plan))}</span>
                    <span>{vatLabel(row.company.vatStatus)}</span>
                    {row.declaration === 'checked' ? null : <span class={`tbl__flag tbl__flag--${row.declaration}`}>{t.aml.state[row.declaration]}</span>}
                    {row.poa === 'checked' ? null : <span class={`tbl__flag tbl__flag--${row.poa}`}>{t.client.poaState[row.poa]}</span>}
                    {row.openReports > 0 ? <span class="tbl__flag tbl__flag--report">{t.client.reportsOpen(row.openReports)}</span> : null}
                    {due?.late ? <span class="tbl__flag tbl__flag--report">{t.clients.dueLate(due.late)}</span> : due ? <span class="tbl__flag tbl__flag--ends">{t.clients.dueSoon}</span> : null}
                    {ending ? <span class="tbl__flag tbl__flag--ends">{ending.phase === 'ending' ? t.client.ends(dayName(ending.endsOn)) : t.client.ended(dayName(ending.endsOn))}</span> : null}
                    {owed && ending ? (
                      <span class={`tbl__flag ${owed === 'late' ? 'tbl__flag--report' : 'tbl__flag--ends'}`}>
                        {owed === 'late' ? t.client.handoverLate : t.client.handoverDue(dayName(ending.handoverBy))}
                      </span>
                    ) : null}
                  </span>
                </span>
                <span class="tbl__num" role="cell" data-label={t.clients.columns.book}>
                  <Badge n={row.toBook} tone="amber" />
                  {row.reading > 0 ? (
                    <span class="tbl__note">
                      +{row.reading} {t.clients.reading.toLowerCase()}
                    </span>
                  ) : null}
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
      {admin && ended.length > 0 ? (
        <section class="info ended-list" aria-labelledby="skonceni-t">
          <h2 id="skonceni-t" class="info__title">
            {t.ended.title}
          </h2>
          <p class="info__lead">{t.ended.lead}</p>
          <ul class="plain">
            {ended.map((company) => (
              <li class="plain__row plain__row--two">
                <a class="link plain__name" href={`/ucto/archiv/${company.id}`}>
                  {company.name}
                </a>
                <span class="plain__sub">
                  {company.ico ? <span>{company.ico}</span> : null}
                  <span>{t.client.ended(dayName(company.endsOn))}</span>
                  <span>{t.ended.purged(dayName(dayOf(company.purgedAt)))}</span>
                  <span>{t.ended.until(dayName(fiveYearsAfter(company.endsOn)))}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <p class="sr">{dayOf(now)}</p>
    </>
  )
}

// ---------------------------------------------------------------------------------------------------------------
// One client
// ---------------------------------------------------------------------------------------------------------------

export interface ClientPageProps {
  assistant?: boolean
  user: User
  company: Company
  members: User[]
  /** The owner's own account sees the people's e-mails; nobody else of the team (team/people.ts, isOwner). */
  owner?: boolean
  queue: QueueDoc[]
  toCheck: ToCheck[]
  missing: Payment[]
  messages: Message[]
  rules: Rule[]
  accountants: { id: string; name: string }[]
  now: number
  flash?: string | null
  error?: string | null
  draft?: string
  /** How the client's bank stands, in a line. */
  bankLine?: string | null
  /** The client's money view as on its home page: the accountant reads the same figures. */
  money?: MoneyView | null
  /** Whether the client receives e-invoices through Peppol, and through whose postman. */
  peppolLine?: string | null
  /** The month's documents against the plan (team/plan-usage.ts), for the administrators only. */
  usage?: PlanUsage | null
  /** The power of attorney the client uploaded, the newest first. */
  papers: Paper[]
  poa: PoaState
  /** The identification under the law against money laundering, the client's risk, and reports not decided yet. */
  declaration: DeclarationState
  risk: Level | null
  openReports: number
  /** The books handed over at the end, the contract's end once it has a last day, and the earliest end we can give. */
  handover: Paper[]
  /** The power of attorney given up at the end, as recorded (point 10.4 of the terms). */
  resigned?: { at: number; by: string | null } | null
  /** What the former accountant handed over, as the client uploaded it (/app/prechod). */
  takeover?: Paper[]
  ending: Ending | null
  earliestEnd: string
  /** The form to end the contract from our side, as it was sent, with what is wrong with it. */
  end?: { day: string; reason: string; errors: { day?: string; reason?: string; form?: string } }
  handoverError?: string
  /** The VAT of the period being filed now (views/vat.tsx). */
  vat?: Child
  /** The books in short (views/ledger.tsx). */
  ledger?: Child
  /** The client's deadlines (views/deadlines.tsx). */
  deadlines?: Child
  /** The newest statements of the bank, and every one that waits (app/statements.ts). */
  statements?: StatementView[]
  /** The company's details as they were sent, with what is wrong with them. */
  details?: { values: DetailsValues; errors: DetailsErrors }
  /** What the app booked by itself in the last month (app/autobook.ts), newest first. */
  auto?: { id: string; party: string | null; issuedOn: string | null; totalCents: number | null; bookedAt: number;reviewed:boolean;token:string }[]
}

/** The company's details as the form shows them. */
export interface DetailsValues {
  dic: string
  icdph: string
  status: VatStatus
  quarterly: boolean
  since: string
  office: string
  account: string
  carry: string
  note: string
  /** The day the company uses the one-stop shop (OSS) from; empty when it does not. */
  oss?: string
  /** The legal form (rpo.ts), '' for another one. */
  legalForm?: string
}

export type DetailsErrors = Partial<Record<'dic' | 'icdph' | 'since' | 'office' | 'account' | 'carry' | 'oss', string>>

export const detailsOf = (c: Company): DetailsValues => ({
  dic: c.dic ?? '',
  icdph: c.icdph ?? '',
  status: c.vatStatus,
  quarterly: c.vatQuarterly,
  since: c.vatSince ? textDay(c.vatSince) : '',
  oss: c.ossSince ? textDay(c.ossSince) : '',
  legalForm: c.legalForm ?? '',
  office: c.taxOffice ?? '',
  account: c.taxAccount ?? '',
  carry: c.vatCarry > 0 ? moneyText(c.vatCarry) : '',
  note: c.note ?? '',
})

const FieldError: FC<{ text?: string }> = ({ text }) => (text ? <p class="field__error">{text}</p> : null)

const POA_PILL: Record<PoaState, string> = { missing: 'pill--amber', waiting: 'pill--blue', checked: 'pill--ok' }

const RISK_PILL: Record<Level, string> = { low: 'pill--ok', standard: 'pill--blue', high: 'pill--red' }

/** The contract as it was concluded, the identification and the risk, and the power of attorney with what the
 * accountant does with it. */
const ContractCard: FC<{
  company: Company
  papers: Paper[]
  poa: PoaState
  declaration: DeclarationState
  risk: Level | null
  openReports: number
  now: number
  admin: boolean
  ending: Ending | null
  earliestEnd: string
  end?: ClientPageProps['end']
}> = ({ company: c, papers, poa, declaration, risk, openReports, now, admin, ending, earliestEnd, end }) => {
  const today = dayOf(now)
  // Our end can be set while the client has not given notice and the contract runs; it can be moved or taken back.
  const canEnd = admin && (!ending || (ending.side === 'firmony' && ending.phase === 'ending'))
  return (
    <section class="info" id="zmluva" aria-labelledby="zmluva-t">
      <h2 id="zmluva-t" class="info__title">
        {t.client.contract}
      </h2>
      <p class="info__lead">
        {c.termsVersion === OFFLINE_TERMS && c.contractAt && c.signedBy
          ? t.client.contractPaper(dayName(dayOf(c.contractAt), today), c.signedBy)
          : c.contractAt && c.signedBy
            ? t.client.contractOnline(dayName(dayOf(c.contractAt), today), c.signedBy, app.contract.termsVersion(c.termsVersion ?? ''))
            : t.client.contractOffline}
        {c.startOn ? ` ${t.client.start(dayName(c.startOn, today))}` : ''}
      </p>
      {ending && c.noticeAt ? (
        <div class="notice-box notice-box--given">
          <p class="notice-box__text">
            {ending.side === 'firmony'
              ? t.client.endedByUs(dayName(dayOf(c.noticeAt), today), dayName(ending.endsOn, today))
              : t.client.endsLead(dayName(dayOf(c.noticeAt), today), dayName(ending.endsOn, today))}
          </p>
          <p class="notice-box__text">{t.client.afterEnd(dayName(ending.intakeUntil, today), dayName(ending.handoverBy, today), dayName(addDays(ending.accessUntil, 1), today))}</p>
          {admin && ending.side === 'firmony' && ending.phase === 'ending' ? (
            <form method="post" action={`/ucto/klienti/${c.id}/koniec/zrusit`}>
              <button class="btn btn--line btn--small" type="submit">
                {t.end.cancel}
              </button>
            </form>
          ) : null}
        </div>
      ) : null}
      <p class="pills">
        <span class={`pill ${POA_PILL[declaration]}`}>{t.aml.state[declaration]}</span>
        {risk ? <span class={`pill ${RISK_PILL[risk]}`}>{`${t.aml.risk}: ${t.aml.levels[risk].toLowerCase()}`}</span> : null}
        {openReports > 0 ? <span class="pill pill--amber">{t.client.reportsOpen(openReports)}</span> : null}
      </p>
      <p>
        <a class="btn btn--line btn--small" href={`/ucto/klienti/${c.id}/aml`}>
          {t.client.amlOpen}
        </a>
      </p>
      <p>
        <span class={`pill ${POA_PILL[poa]}`}>{t.client.poaState[poa]}</span>
      </p>
      {papers.length === 0 ? (
        <p class="info__empty">{t.client.poaMissing}</p>
      ) : (
        <>
          {poa === 'checked' ? null : <p class="info__lead">{t.client.poaLead(c.signedBy)}</p>}
          <ul class="plain">
            {papers.map((paper) => (
              <li class="plain__row plain__row--two">
                <a class="link plain__name" href={`/ucto/klienti/${c.id}/plna-moc/${paper.id}`}>
                  {paper.fileName}
                </a>
                <span class="plain__sub">
                  <span>{t.client.poaAdded(whenName(paper.createdAt, now), paper.createdByName)}</span>
                  <span>{paper.checkedAt ? t.client.poaChecked(dayName(dayOf(paper.checkedAt), today), paper.checkedByName) : t.client.poaWaits}</span>
                </span>
                {paper.checkedAt === null && poa !== 'checked' ? (
                  <form class="plain__action" method="post" action={`/ucto/klienti/${c.id}/plna-moc/${paper.id}/overit`}>
                    <button class="btn btn--blue btn--small" type="submit">
                      {t.client.poaCheck}
                    </button>
                  </form>
                ) : null}
                {paper.checkedAt === null && poa !== 'checked' ? (
                  <details class="more more--quiet plain__more">
                    <summary class="more__summary">{t.client.poaReturn}</summary>
                    <form class="more__body stack" method="post" action={`/ucto/klienti/${c.id}/plna-moc/${paper.id}/vratit`} novalidate>
                      <label class="field__label" for={`vratit-${paper.id}`}>
                        {t.client.poaReturnReason}
                      </label>
                      <input id={`vratit-${paper.id}`} class="field__input" name="dovod" maxlength={300} placeholder={t.client.poaReturnHint} autocomplete="off" />
                      <button class="btn btn--line btn--small stack__submit" type="submit">
                        {t.client.poaReturn}
                      </button>
                    </form>
                  </details>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      )}
      {canEnd ? (
        <details class="more more--quiet end-form" open={Boolean(end)}>
          <summary class="more__summary">{t.end.title}</summary>
          <form class="more__body stack" method="post" action={`/ucto/klienti/${c.id}/koniec`} novalidate>
            <p class="info__lead">{t.end.lead(dayName(earliestEnd, today))}</p>
            <div class="field">
              <label class="field__label" for="koniec-den">
                {t.end.day}
              </label>
              <input
                id="koniec-den"
                class="field__input"
                name="den"
                value={end?.day ?? (ending ? textDay(ending.endsOn) : textDay(earliestEnd))}
                maxlength={20}
                placeholder={t.end.dayHint}
                autocomplete="off"
                aria-invalid={end?.errors.day ? 'true' : undefined}
              />
              {end?.errors.day ? <p class="field__error">{end.errors.day}</p> : null}
            </div>
            <div class="field">
              <label class="field__label" for="koniec-dovod">
                {t.end.reason}
              </label>
              <textarea id="koniec-dovod" class="field__input field__area" name="dovod" rows={3} maxlength={1000} aria-invalid={end?.errors.reason ? 'true' : undefined}>
                {end?.reason ?? ''}
              </textarea>
              {end?.errors.reason ? <p class="field__error">{end.errors.reason}</p> : null}
            </div>
            <button class="btn btn--line stack__submit" type="submit">
              {t.end.button}
            </button>
          </form>
        </details>
      ) : !admin && !ending ? (
        <p class="info__source">{t.end.onlyAdmin}</p>
      ) : null}
    </section>
  )
}

/** The books handed over at the end of the contract: uploaded here, shown to the client in Firma a nastavenia. */
const HandoverCard: FC<{ company: Company; handover: Paper[]; resigned: { at: number; by: string | null } | null; ending: Ending; now: number; error?: string }> = ({
  company: c,
  handover,
  resigned,
  ending,
  now,
  error,
}) => {
  const today = dayOf(now)
  return (
    <section class="info" id="odovzdanie" aria-labelledby="odovzdanie-t">
      <h2 id="odovzdanie-t" class="info__title">
        {t.handover.title}
      </h2>
      <p class="info__lead">{t.handover.lead}</p>
      <p class="pills">
        {handover.length > 0 && resigned ? null : (
          <span class={`pill ${today > ending.handoverBy ? 'pill--red' : 'pill--amber'}`}>
            {today > ending.handoverBy ? t.client.handoverLate : t.client.handoverDue(dayName(ending.handoverBy, today))}
          </span>
        )}
      </p>
      {error ? <p class="field__error">{error}</p> : null}
      {handover.length === 0 ? (
        <p class="info__empty">{t.handover.none}</p>
      ) : (
        <ul class="plain handover__list">
          {handover.map((paper) => (
            <li class="plain__row plain__row--two">
              <a class="link plain__name" href={`/ucto/klienti/${c.id}/odovzdanie/${paper.id}`}>
                {paper.fileName}
              </a>
              <span class="plain__sub">
                <span>{whenName(paper.createdAt, now)}</span>
                {paper.createdByName ? <span>{paper.createdByName}</span> : null}
              </span>
              <form class="plain__action" method="post" action={`/ucto/klienti/${c.id}/odovzdanie/${paper.id}/odstranit`}>
                <button class="btn btn--text btn--small" type="submit">
                  {t.handover.remove}
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
      <p class="small">Odobratie vyradí prílohu z bežného prehľadu. Originál s históriou zostáva v plnom archíve do riadeného výmazu.</p>
      <form class="stack" method="post" action={`/ucto/klienti/${c.id}/odovzdanie`} enctype="multipart/form-data">
        <label class="field__label" for="odovzdanie-subory">
          {t.handover.files}
        </label>
        <input id="odovzdanie-subory" class="field__input" type="file" name="file" multiple />
        <button class="btn btn--blue stack__submit" type="submit">
          {t.handover.button}
        </button>
      </form>
      <h3 class="info__subtitle">{t.handover.poa.title}</h3>
      {resigned ? (
        <p class="vstatus__filed">
          <span class="tick tick--green" aria-hidden="true" /> {t.handover.poa.done(whenName(resigned.at, now), resigned.by)}
        </p>
      ) : (
        <form class="stack" method="post" action={`/ucto/klienti/${c.id}/odovzdanie/plna-moc`}>
          <p class="info__lead">{t.handover.poa.lead}</p>
          <button class="btn btn--line stack__submit" type="submit">
            {t.handover.poa.button}
          </button>
        </form>
      )}
    </section>
  )
}

/** Why a statement waits, said with its figures. */
function heldText(st: StatementView, today: string): string {
  const r = st.reason
  if (!r) return t.client.statements.heldTitle
  if (r.kind === 'gap' && r.last) return t.client.statements.reason.gap(formatEurExact(r.opening ?? 0), formatEurExact(r.last.cents), dayName(r.last.on, today))
  if (r.kind === 'sum') return t.client.statements.reason.sum(formatEurExact(r.opening ?? 0), formatEurExact(r.sum ?? 0), formatEurExact(r.closing ?? 0))
  if (r.kind === 'overlap' && r.last) return t.client.statements.reason.overlap(dayName(r.last.on, today))
  if (r.kind === 'unknown') return t.client.statements.reason.unknown
  return t.client.statements.reason.opening
}

/** The client's statements: the ones that wait first, with what the accountant can do about each. */
const StatementsCard: FC<{ company: Company; list: StatementView[]; now: number }> = ({ company, list, now }) => {
  const today = dayOf(now)
  const s = app.bank.statements
  return (
    <section class="info" id="vypisy" aria-labelledby="vypisy-t">
      <h2 id="vypisy-t" class="info__title">
        {t.client.statements.title}
      </h2>
      <p class="info__lead">{t.client.statements.lead}</p>
      {list.length === 0 ? (
        <p class="info__empty">{t.client.statements.empty}</p>
      ) : (
        <ul class="stmts__list">
          {[...list]
            .sort((a, z) => Number(z.status === 'held') - Number(a.status === 'held'))
            .map((st) => (
              <li class={`stmts__item${st.status === 'held' ? ' stmts__item--held' : ''}`}>
                <div class="stmts__main">
                  <p class="stmts__period">
                    {st.from && st.to ? (st.from === st.to ? dayName(st.from, today) : `${dayName(st.from, today)} až ${dayName(st.to, today)}`) : whenName(st.createdAt, now)}
                  </p>
                  <p class="stmts__meta">
                    <span class="stmts__iban">{groupIban(st.iban)}</span>
                    <span>{s.entries(st.entries)}</span>
                    <span>{s.source[st.source]}</span>
                  </p>
                  {st.status === 'held' ? <p class="stmts__note">{heldText(st, today)}</p> : null}
                  {st.status === 'confirm' ? <p class="stmts__note">{t.client.statements.ownerWaits}</p> : null}
                </div>
                <span class={`pill ${st.status === 'taken' ? 'pill--ok' : st.status === 'held' || st.status === 'confirm' ? 'pill--amber' : 'pill--mist'}`}>{s.status[st.status]}</span>
                {st.status === 'held' ? (
                  <form class="stmts__actions" method="post" action={`/ucto/klienti/${company.id}/vypisy/${st.id}`}>
                    <button class="btn btn--blue btn--small" type="submit" name="akcia" value="prijat">
                      {t.client.statements.take}
                    </button>
                    <button class="btn btn--line btn--small" type="submit" name="akcia" value="odmietnut">
                      {t.client.statements.refuse}
                    </button>
                  </form>
                ) : null}
              </li>
            ))}
        </ul>
      )}
    </section>
  )
}

export const ClientPage: FC<ClientPageProps> = (p) => {
  const c = p.company
  const admin = p.user.team === 'admin'
  const d = p.details?.values ?? detailsOf(c)
  const de = p.details?.errors ?? {}
  return (
    <>
      <a class="back" href="/ucto">
        {t.client.back}
      </a>
      {p.assistant?<p><a class="link" href={`/ucto/klienti/${c.id}/asistent`}>Asistent k tejto firme</a></p>:null}
      <header class="phero">
        <p class="phero__kind phero__kind--row">
          <span>{t.clients.plan(planName(c.plan))}</span>
          <span>{vatLabel(c.vatStatus)}</span>
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
          {p.bankLine ? <span>{p.bankLine}</span> : null}
          {p.peppolLine ? <span>{p.peppolLine}</span> : null}
          {p.usage ? <UsageLine usage={p.usage} /> : null}
          {p.ending ? <span class="pill pill--amber">{p.ending.phase === 'ending' ? t.client.ends(dayName(p.ending.endsOn)) : t.client.ended(dayName(p.ending.endsOn))}</span> : null}
        </p>
      </header>
      <Flash text={p.flash} />
      <Flash text={p.error} tone="error" />
      <nav class="jump" aria-label={c.name}>
        <a href="#peniaze">{app.home.money.title}</a>
        <a href="#zauctovat">
          {t.client.toBook} <span class="count count--amber">{p.queue.length}</span>
        </a>
        <a href="#kontrola">
          {t.clients.toCheck} <span class="count count--amber">{p.toCheck.length}</span>
        </a>
        <a href="#spravy">{t.client.messages}</a>
        <a href="#chyba">{t.clients.missing}</a>
        {(p.statements ?? []).some((st) => st.status === 'held') ? (
          <a href="#vypisy">
            {t.client.statements.title} <span class="count count--amber">{(p.statements ?? []).filter((st) => st.status === 'held').length}</span>
          </a>
        ) : null}
        <a href="#zmluva">{p.declaration === 'checked' ? t.client.poaState[p.poa] : t.aml.state[p.declaration]}</a>
        <a href="#terminy">{t.deadlines.title}</a>
        <a href={`/ucto/klienti/${c.id}/dph`}>{t.client.vatCard}</a>
        <a href={`/ucto/klienti/${c.id}/kniha`}>{t.ledger.card}</a>
        <a href="#udaje">{t.client.details}</a>
      </nav>
      <div class="pgrid pgrid--wide">
        <div class="pgrid__main">
          {p.money ? <MoneyCard view={p.money} action={`/ucto/klienti/${c.id}`} /> : null}
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
          <StatementsCard company={c} list={p.statements ?? []} now={p.now} />
        </div>
        <aside class="pgrid__side">
          <ContractCard
            company={c}
            papers={p.papers}
            poa={p.poa}
            declaration={p.declaration}
            risk={p.risk}
            openReports={p.openReports}
            now={p.now}
            admin={admin}
            ending={p.ending}
            earliestEnd={p.earliestEnd}
            end={p.end}
          />
          {p.ending ? <HandoverCard company={c} handover={p.handover} resigned={p.resigned ?? null} ending={p.ending} now={p.now} error={p.handoverError} /> : null}
          {p.takeover && p.takeover.length > 0 ? (
            <section class="info" id="prevzatie" aria-labelledby="prevzatie-t">
              <h2 id="prevzatie-t" class="info__title">
                {t.client.takeover}
              </h2>
              <p class="info__lead">{t.client.takeoverLead}</p>
              <ul class="plain">
                {p.takeover.map((paper) => (
                  <li class="plain__row plain__row--two">
                    <a class="link plain__name" href={`/ucto/klienti/${c.id}/prevzatie/${paper.id}`}>
                      {paper.fileName}
                    </a>
                    <span class="plain__sub">
                      <span>{whenName(paper.createdAt, p.now)}</span>
                      {paper.createdByName ? <span>{paper.createdByName}</span> : null}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {p.deadlines ?? null}
          {p.vat ?? null}
          {p.ledger ?? null}
          <section class="info" id="udaje" aria-labelledby="udaje-t">
            <h2 id="udaje-t" class="info__title">
              {t.client.details}
            </h2>
            <p class="info__lead">{t.client.detailsLead}</p>
            <form class="stack" method="post" action={`/ucto/klienti/${c.id}/udaje`} novalidate>
              <label class="field__label" for="pravna-forma">
                {t.newClient.legalForm}
              </label>
              <select id="pravna-forma" class="field__input" name="pravna_forma">
                {Object.entries(t.newClient.legalForms).map(([value, label]) => (
                  <option value={value} selected={(d.legalForm ?? '') === value}>
                    {label}
                  </option>
                ))}
              </select>
              <label class="field__label" for="dic">
                {t.client.dic}
              </label>
              <input id="dic" class="field__input" name="dic" value={d.dic} maxlength={12} inputmode="numeric" aria-invalid={de.dic ? 'true' : undefined} />
              <FieldError text={de.dic} />
              <label class="field__label" for="icdph">
                {t.client.icdph}
              </label>
              <input id="icdph" class="field__input" name="icdph" value={d.icdph} maxlength={14} aria-invalid={de.icdph ? 'true' : undefined} />
              <FieldError text={de.icdph} />
              <label class="field__label" for="dph-stav">
                {t.client.vatStatus}
              </label>
              <select id="dph-stav" class="field__input" name="dph_stav">
                {(['none', 'payer', 'reg7a'] as const).map((status) => (
                  <option value={status} selected={d.status === status}>
                    {t.client.vatStatuses[status]}
                  </option>
                ))}
              </select>
              <label class="field__label" for="dph-obdobie">
                {t.client.vatQuarterly}
              </label>
              <select id="dph-obdobie" class="field__input" name="dph_obdobie">
                <option value="month" selected={!d.quarterly}>
                  {t.client.vatPeriods.month}
                </option>
                <option value="quarter" selected={d.quarterly}>
                  {t.client.vatPeriods.quarter}
                </option>
              </select>
              <label class="field__label" for="dph-od">
                {t.client.vatSince}
              </label>
              <input id="dph-od" class="field__input" name="dph_od" value={d.since} maxlength={16} aria-invalid={de.since ? 'true' : undefined} />
              {de.since ? <FieldError text={de.since} /> : <p class="field__hint">{t.client.vatSinceHint}</p>}
              <label class="field__label" for="oss-od">
                {t.client.ossSince}
              </label>
              <input id="oss-od" class="field__input" name="oss_od" value={d.oss ?? ''} maxlength={16} aria-invalid={de.oss ? 'true' : undefined} />
              {de.oss ? <FieldError text={de.oss} /> : <p class="field__hint">{t.client.ossSinceHint}</p>}
              <label class="field__label" for="danovy-urad">
                {t.client.taxOffice}
              </label>
              <select id="danovy-urad" class="field__input" name="danovy_urad" aria-invalid={de.office ? 'true' : undefined}>
                <option value="">{t.client.taxOfficeNone}</option>
                {TAX_OFFICES.map((office) => (
                  <option value={office} selected={d.office === office}>
                    {office}
                  </option>
                ))}
              </select>
              <FieldError text={de.office} />
              <label class="field__label" for="oud">
                {t.client.taxAccount}
              </label>
              <input id="oud" class="field__input" name="oud" value={d.account} maxlength={40} inputmode="numeric" aria-invalid={de.account ? 'true' : undefined} />
              {de.account ? <FieldError text={de.account} /> : <p class="field__hint">{t.client.taxAccountHint}</p>}
              <label class="field__label" for="dph-prenos">
                {t.client.vatCarry}
              </label>
              <input id="dph-prenos" class="field__input" name="dph_prenos" value={d.carry} maxlength={16} inputmode="decimal" aria-invalid={de.carry ? 'true' : undefined} />
              {de.carry ? <FieldError text={de.carry} /> : <p class="field__hint">{t.client.vatCarryHint}</p>}
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
                {d.note}
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
                  {p.owner ? <span class="plain__mail">{m.email}</span> : null}
                </li>
              ))}
            </ul>
          </section>
          <section class="info" id="samo" aria-labelledby="samo-t">
            <h2 id="samo-t" class="info__title">
              {t.client.auto.title}: {p.company.autobook ? t.client.auto.on : t.client.auto.off}
            </h2>
            <p class="info__lead">{t.client.auto.lead}</p>
            <form method="post" action={`/ucto/klienti/${p.company.id}/samo`}>
              <input type="hidden" name="zapnut" value={p.company.autobook ? '0' : '1'} />
              <button class="btn btn--line btn--small" type="submit">
                {p.company.autobook ? t.client.auto.turnOff : t.client.auto.turnOn}
              </button>
            </form>
            {p.company.autobook || (p.auto ?? []).length > 0 ? (
              <>
                <h3 class="info__sub">{t.client.auto.list}</h3>
                {(p.auto ?? []).length === 0 ? (
                  <p class="info__lead">{t.client.auto.empty}</p>
                ) : (
                  <>
                    <ul class="plain">
                      {(p.auto ?? []).map((d) => (
                        <li class="plain__row plain__row--two">
                          <a class="plain__name link" href={`/ucto/doklady/${d.id}`}>
                            {d.party ?? t.book.kinds.other}
                          </a>
                          <span class="plain__sub">
                            <span>{d.issuedOn ? dayShort(d.issuedOn) : ''}</span>
                            <span>{d.totalCents !== null ? formatEurExact(d.totalCents) : ''}</span>
                          </span>
                          {d.reviewed ? <span class="pill pill--ok">Odborne posúdené</span> : <form class="stack" method="post" action={`/ucto/klienti/${p.company.id}/samo/${d.id}/posudit`}><input type="hidden" name="hash" value={d.token} /><label class="field__label" for={`auto-review-${d.id}`}>Výsledok posúdenia a dôvod</label><textarea id={`auto-review-${d.id}`} class="field__input field__area" name="poznamka" rows={2} minlength={12} maxlength={2000} required /><label class="tickbox"><input type="checkbox" name="posudene" value="1" required /><span>Posúdil som pôvodný doklad, súvisiacu platbu a súlad s profilom klienta. Podozrivý prípad riešim dôverným interným oznámením.</span></label><button class="btn btn--line btn--small" type="submit">Zapísať odborné posúdenie</button></form>}
                        </li>
                      ))}
                    </ul>
                    <p class="info__lead">{t.client.auto.check}</p>
                  </>
                )}
              </>
            ) : null}
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
                      {r.center ? <span>{t.client.ruleCenter(r.center)}</span> : null}
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
          {d.status === 'manual'
            ? t.queue.pill.manual
            : d.duplicateOf
              ? t.queue.pill.duplicate
              : d.proposal === 'rule'
                ? t.queue.pill.rule
                : d.proposal === 'ai'
                  ? t.queue.pill.ai
                  : t.queue.pill.check}
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

export const QueuePage: FC<{ docs: QueueDoc[]; auto: AutoQueued[]; flash?: string | null }> = ({ docs, auto, flash }) => {
  const groups = new Map<string, QueueDoc[]>()
  for (const d of docs) groups.set(d.companyName, [...(groups.get(d.companyName) ?? []), d])
  return (
    <>
      <header class="phead">
        <Heading first={t.queue.title} second={t.queue.serif} />
        <p class="phead__lead">{t.queue.lead}</p>
      </header>
      <Flash text={flash} />
      {auto.length > 0 && (
        <section class="month" aria-label={t.queue.autoTitle}>
          <h2 class="month__title">
            {t.queue.autoTitle} <span class="count count--blue">{auto.length}</span>
          </h2>
          <p class="month__lead">{t.queue.autoLead}</p>
          <ul class="rows rows--card">
            {auto.map((a) => (
              <li class="row" key={a.id}>
                <a class="row__link" href={`/ucto/klienti/${a.companyId}`}>
                  <span class="row__text">
                    <span class="row__title">{a.companyName}</span>
                    <span class="row__sub row__sub--text">{a.party ?? ''}</span>
                  </span>
                  <span class="row__end">
                    <span class="pill pill--blue">{t.queue.pill.check}</span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
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
      <p class="phead__lead">{t.inbox.target}</p>
    </header>
    {threads.length === 0 ? (
      <section class="nothing">
        <Tile art={ART.chat} size="lg" />
        <p class="nothing__title">{t.inbox.empty}</p>
      </section>
    ) : (
      <ul class="rows rows--card">
        {threads.map((th) => {
          const due = responseDueAt(th.at)
          const late = now > due
          return (
            <li class="row support-row">
              <a class="row__link" href={`/ucto/klienti/${th.company.id}#spravy`}>
                <Tile art={ART.chat} size="sm" />
                <span class="row__text">
                  <span class="row__title">{th.company.name}</span>
                  <span class="row__sub row__sub--text">{th.body}</span>
                  <span class="row__sub">{t.inbox.owner(th.company.accountantName)}</span>
                  <span class="row__sub">{t.inbox.pending(th.pending)}</span>
                </span>
                <span class="row__end">
                  <span class="pill pill--blue">{t.inbox.waiting(whenName(th.at, now))}</span>
                  <span class={`pill${late ? ' pill--red' : ''}`}>
                    {late ? `${t.inbox.late} · ` : ''}
                    <time datetime={new Date(due * 1000).toISOString()}>{t.inbox.due(whenName(due, now))}</time>
                  </span>
                </span>
              </a>
            </li>
          )
        })}
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
  /** What is left to pay when less than the total (a credit or a balance set off); '' when the total is paid. */
  payable?: string
  category: string
  deduct: boolean
  remember: boolean
  account: string
  /** The currency and the rate it is converted at (units for one euro), empty for the ECB's of the day before. */
  currency: string
  rate: string
  /** The cost centre picked on the form ('' none); the document's own when not given. */
  center?: string
  /** A received document deducted in proportion by the year's coefficient (§ 50, vat-ratio.ts). */
  ratio?: boolean
  /** An issued document's own mark for the coefficient ('' as its taxation says; 'right', 'none', 'skip'). */
  ratioMode?: string
  /** When the booking screen was first opened for this booking (seconds), carried through a form sent back with an
   *  error, so the time a document took is measured from the first look (team/work-pay.ts). */
  opened?: string
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
    payable: money(d.dueCents ?? null),
    category,
    deduct: vatPayer && (d.vatDeduct ?? (category ? (CATEGORIES[category as keyof typeof CATEGORIES]?.deduct ?? true) : true)),
    // A trip's settlement is owed to a person, not bought of a supplier: nothing to remember for the next one.
    remember: d.source !== 'trip',
    account: d.account ?? '',
    currency: d.currency ?? 'EUR',
    rate: d.fxRate ? d.fxRate.replace('.', ',') : '',
    ratio: d.vatRatio !== null && d.vatRatio !== undefined,
    ratioMode: d.ratioMode && d.ratioMode !== 'final' ? d.ratioMode : '',
  }
}

export interface BookPageProps {
  d: Doc
  company: Company
  /** How VAT falls on the document; null where the company reports none. */
  vat?: VatForm | null
  /** The document's kind has no VAT yet: it is proposed once the kind is saved. */
  vatKindFirst?: boolean
  /** A company that is not registered buys a service from abroad: a registration under § 7a is due. */
  needs7a?: boolean
  /** An invoice the client issued in Firmony: its sheet is the original. */
  invoice?: { invoice: StoredInvoice; lines: Line[] } | null
  /** A business trip the client settled in Firmony: its settlement is the original. */
  trip?: Trip | null
  /** The company's cost centres: the document's own is given on the form. */
  centers?: CostCenter[]
  values: BookValues
  /** The document's entry as the books hold it; null shows the entry of the form's own figures (after a mistake). */
  ledgerLines?: LedgerLine[] | null
  payment: Payment | null
  candidates: Payment[]
  paidBy: PaidBy
  queueLeft: number
  now: number
  errors: Partial<Record<keyof BookValues, string>>
  flash?: string | null
  /** The currencies to pick (the ECB's), the ECB's rate of the day before the document, its total in euros. */
  currencies?: string[]
  rateProposal?: { rate: string; day: string } | null
  inEuros?: number | null
}

const Field: FC<{ name: keyof BookValues; label: string; value: string; error?: string; type?: string; mode?: 'decimal' | 'numeric' | 'text'; wide?: boolean; max?: number }> = ({
  name,
  label,
  value,
  error,
  type = 'text',
  mode,
  wide,
  max,
}) => (
  <div class={`fgrid__cell${wide ? ' fgrid__cell--wide' : ''}`}>
    <label class="field__label" for={`b-${name}`}>
      {label}
    </label>
    <input id={`b-${name}`} class="field__input" type={type} name={name} value={value} inputmode={mode} maxlength={max ?? 160} aria-invalid={error ? 'true' : undefined} />
    {error ? <p class="field__error">{error}</p> : null}
  </div>
)

export const BookPage: FC<BookPageProps> = ({ d, company, vat, vatKindFirst, needs7a, invoice, trip = null, centers = [], values, ledgerLines, payment, candidates, paidBy, queueLeft, now, errors, flash, currencies = [], rateProposal = null, inEuros = null }) => {
  const image = d.fileKey && d.fileType?.startsWith('image/') && d.fileType !== 'image/heic'
  const cents = (text: string) => {
    const m = /^(\d+)(?:[,.](\d{1,2}))?$/.exec(text.replace(/\s/g, ''))
    return m ? Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0')) : null
  }
  // The entry as the books hold it (with the bank account's analytic account and VAT's); the form's own figures after a mistake.
  const entry: LedgerLine[] =
    ledgerLines ??
    entryFor({
      kind: (values.kind || null) as Doc['kind'],
      category: (values.category || null) as Doc['category'],
      totalCents: cents(values.total),
      vatCents: cents(values.vat),
      vatPayer: company.vatPayer,
      vatDeduct: values.deduct,
      paidBy,
      account: values.account || null,
      selfVat: vat?.selfVat ?? null,
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
          ) : trip ? (
            <div class="book__sheet">
              <TripSheet trip={trip} company={company} />
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
          {d.ekasaUid || d.ekasaOkp ? (
            <p class="book__origfoot">
              <span class="book__code">
                <span>{t.book.ekasaCode(d.ekasaUid ? 'UID' : 'OKP')}</span>
                <span class="book__codevalue">{d.ekasaUid ?? d.ekasaOkp}</span>
              </span>
              <a class="link" href={EKASA_VERIFY} target="_blank" rel="noopener">
                {t.book.ekasaVerify}
              </a>
            </p>
          ) : null}
        </div>
        <form class="book__form" method="post" action={`/ucto/doklady/${d.id}`} novalidate>
          <input type="hidden" name="otvorene" value={values.opened || String(now)} />
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
            <Field name="payable" label={t.book.payable} value={values.payable ?? ''} mode="decimal" error={errors.payable} max={20} />
            <div class="fgrid__cell">
              <label class="field__label" for="b-currency">
                {t.book.currency}
              </label>
              <select id="b-currency" class="field__input" name="currency">
                {[...new Set(['EUR', ...currencies, values.currency].filter(Boolean))].map((c) => (
                  <option value={c} selected={values.currency === c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            {values.currency !== 'EUR' ? (
              <div class="fgrid__cell">
                <label class="field__label" for="b-rate">
                  {t.book.rate}
                </label>
                <input id="b-rate" class="field__input" name="rate" value={values.rate} inputmode="decimal" maxlength={16} autocomplete="off" aria-invalid={errors.rate ? 'true' : undefined} />
                {errors.rate ? (
                  <p class="field__error">{errors.rate}</p>
                ) : (
                  <p class="field__hint">{rateProposal ? t.book.rateHint(rateProposal.rate, rateProposal.day) : t.book.rateNone}</p>
                )}
                {inEuros !== null ? <p class="field__hint">{t.book.inEuros(formatEurExact(inEuros))}</p> : null}
              </div>
            ) : null}
            <Field name="vs" label={t.book.vs} value={values.vs} mode="numeric" max={20} />
            <Field name="account" label={t.book.account} value={values.account} mode="numeric" max={6} />
            {centers.some((c) => !c.archived) || d.centerId ? (
              <div class="fgrid__cell">
                <label class="field__label" for="b-stredisko">
                  {t.book.center}
                </label>
                <CenterSelect centers={centers} value={values.center !== undefined ? values.center || null : (d.centerId ?? null)} id="b-stredisko" />
                {/* What the document had when the page was made: a centre the client gives meanwhile is not taken back. */}
                <input type="hidden" name="stredisko_bolo" value={d.centerId ?? ''} />
              </div>
            ) : null}
          </div>
          {vat ? <VatFields form={vat} /> : vatKindFirst ? <p class="vatbox__note">{t.book.vatKindFirst}</p> : null}
          {needs7a ? <p class="flag">{t.vat.issue.needs7a}</p> : null}
          <div class="book__ticks">
            {company.vatPayer ? (
              <label class="tickbox">
                <input type="checkbox" name="deduct" value="1" checked={values.deduct} />
                <span>{t.book.deduct}</span>
              </label>
            ) : null}
            {company.vatPayer && (company.vatRatios?.length ?? 0) > 0 && (values.kind === 'receipt' || values.kind === 'invoice_in') ? (
              <label class="tickbox">
                <input type="checkbox" name="pomerne" value="1" checked={values.ratio} />
                <span>{d.vatRatio !== null && d.vatRatio !== undefined ? t.book.ratioWith(coefText(d.vatRatio)) : t.book.ratio}</span>
              </label>
            ) : null}
            {company.vatPayer && (company.vatRatios?.length ?? 0) > 0 && values.kind === 'invoice_out' ? (
              <label class="field">
                <span class="field__label">{t.book.ratioMode}</span>
                <select class="field__input" name="koeficient">
                  {['', 'right', 'none', 'skip'].map((m) => (
                    <option value={m} selected={(values.ratioMode ?? '') === m}>
                      {t.book.ratioModes[m]}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {d.ratioMode === 'final' && d.vatRatio !== null && d.vatRatio !== undefined ? <p class="field__hint">{t.book.ratioFinal(coefText(d.vatRatio))}</p> : null}
            {company.vatPayer && d.kind === 'invoice_out' && d.bookedAt && d.vat?.mode === 'domestic' && !d.vat.corrects ? (
              <p class="field__hint">
                <a href={`/ucto/klienti/${company.id}/dph/nevymozitelne/${d.id}`}>{(d.badDebts?.length ?? 0) > 0 ? t.book.badDebtOn : t.book.badDebt}</a>
              </p>
            ) : null}
            <label class="tickbox">
              <input type="checkbox" name="remember" value="1" checked={values.remember} />
              <span>{t.book.remember}</span>
            </label>
          </div>
          {errors.ratio ? <p class="field__error">{errors.ratio}</p> : null}
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
                      <td>{line.what ? t.book.entryWhat[line.what] : ''}</td>
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
            <p class="info__empty">{d.cashPaid ? t.book.paidByCash(d.cashPaid.number, textDay(d.cashPaid.on)) : d.paidPrivately ? t.book.paidPrivate : t.book.pairNone}</p>
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

/** The people who want the investors' tax return: who, which brokers, which way. */
const Investors: FC<{ investors: { total: number; list: InvestorRequest[] }; now: number }> = ({ investors, now }) => (
  <section class="info investors" id="investori" aria-labelledby="investori-t">
    <h2 id="investori-t" class="info__title">
      {t.requests.investors.title}
    </h2>
    {investors.total === 0 ? (
      <p class="info__empty">{t.requests.investors.empty}</p>
    ) : (
      <>
        <p class="info__lead">{t.requests.investors.lead(investors.total)}</p>
        <ul class="investors__list">
          {investors.list.map((r) => (
            <li class="investors__item">
              <span class="investors__email">{r.email}</span>
              <span class="investors__meta">
                {r.brokers.length > 0 ? <span>{r.brokers.map((id) => INVESTORS.brokers.find((b) => b.id === id)?.name ?? id).join(', ')}</span> : null}
                <span>{r.way ? (t.requests.investors.way[r.way] ?? r.way) : t.requests.investors.noWay}</span>
                <span>{whenName(r.updatedAt, now)}</span>
              </span>
            </li>
          ))}
        </ul>
        {investors.total > investors.list.length ? <p class="info__source">{t.requests.investors.shown(investors.list.length)}</p> : null}
      </>
    )}
  </section>
)

export const RequestsPage: FC<{ requests: Request[]; investors: { total: number; list: InvestorRequest[] }; now: number; released?: boolean; flash?: string | null; foundings?: { waiting: number; going: number } | null }> = ({
  requests,
  investors,
  now,
  released = true,
  flash,
  foundings = null,
}) => (
  <>
    <header class="phead">
      <Heading first={t.requests.title} second={t.requests.serif} />
      <p class="phead__lead">{t.requests.lead}</p>
    </header>
    <Flash text={flash} />
    {foundings ? (
      <p class={foundings.waiting > 0 ? 'notice' : 'small'}>
        S. r. o. za 1 €: {foundings.waiting > 0 ? `${foundings.waiting} na overenie, ` : ''}
        {foundings.going} v založení.{' '}
        <a class="link" href="/ucto/zalozenia">
          Otvoriť založenia
        </a>
      </p>
    ) : null}
    {released ? null : (
      <p class="notice">
        {t.release.blocked}{' '}
        <a class="link" href="/ucto/ziadosti/schvalenie">
          {t.release.link}
        </a>
      </p>
    )}
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
                <span>{t.clients.plan(PLANS.find((p) => p.id === r.plan)?.name ?? t.requests.planOther[r.plan as keyof typeof t.requests.planOther] ?? r.plan)}</span>
                <span>{t.requests.situation[r.situation as keyof typeof t.requests.situation] ?? r.situation}</span>
                <span>{whenName(r.createdAt, now)}</span>
              </p>
              {r.note ? <p class="req__note">{r.note}</p> : null}
            </div>
            <div class="req__side">
              <span class={`pill ${r.status === 'new' ? 'pill--amber' : r.status === 'client' ? 'pill--ok' : 'pill--grey'}`}>
                {t.requests.status[r.status as keyof typeof t.requests.status] ?? r.status}
              </span>
              {r.status === 'new' ? (
                // The site promises an answer within one working day: the request says by when, and when it is late.
                (() => {
                  const due = responseDueAt(r.createdAt)
                  return (
                    <span class={`req__due${due < now ? ' req__due--late' : ''}`}>
                      {due < now ? t.requests.late(whenName(due, now)) : t.requests.replyBy(whenName(due, now))}
                    </span>
                  )
                })()
              ) : null}
              {r.status === 'new' || r.status === 'contacted' ? (
                <div class="req__actions">
                  {r.hasOrder ? (
                    <a class="btn btn--blue btn--small" href={`/ucto/ziadosti/${r.id}/posudenie`}>
                      {t.requests.review}
                    </a>
                  ) : (
                    <a class="btn btn--blue btn--small" href={`/ucto/klienti/novy?ziadost=${r.id}`}>
                      {t.requests.make}
                    </a>
                  )}
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
    <Investors investors={investors} now={now} />
  </>
)

export interface NewClientValues {
  amlOrder?: string
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
  /** The first month of the service, YYYY-MM-01. */
  start: string
  /** Whether the administrator confirms that a contract was signed outside the app. */
  offline: boolean
  /** The legal form ('' for another one) and the signer's role, as the paper contract has them. */
  legalForm?: string
  role?: string
}

export const NewClientPage: FC<{
  values: NewClientValues
  accountants: { id: string; name: string }[]
  errors: Partial<Record<keyof NewClientValues | 'form', string>>
  found?: string | null
  months: string[]
}> = ({ values, accountants, errors, found, months }) => (
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
        <input type="hidden" name="aml" value={values.amlOrder ?? ''} />
        {!values.amlOrder ? <p class="notice">Najprv dokončite overenie pred zmluvou. <a class="link" href="/ucto/aml/papier">Začať overenie klienta s papierovou zmluvou</a></p> : <p class="info__source">Údaje sú naviazané na overenú osobu a firmu. Ich zmena vyžaduje nové overenie.</p>}
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
            <label class="field__label" for="n-form">
              {t.newClient.legalForm}
            </label>
            <select id="n-form" class="field__input" name="forma">
              {Object.entries(t.newClient.legalForms).map(([value, label]) => (
                <option value={value} selected={(values.legalForm ?? 'sro') === value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div class="fgrid__cell">
            <label class="field__label" for="n-role">
              {t.newClient.role}
            </label>
            <input id="n-role" class="field__input" name="funkcia" value={values.role ?? ''} maxlength={60} />
            <p class="field__hint">{t.newClient.roleHint}</p>
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
            <label class="field__label" for="n-start">
              {t.newClient.start}
            </label>
            <select id="n-start" class="field__input" name="start" aria-invalid={errors.start ? 'true' : undefined}>
              {months.map((m) => (
                <option value={m} selected={m === values.start}>
                  {monthName(m)}
                </option>
              ))}
            </select>
            {errors.start ? <p class="field__error">{errors.start}</p> : null}
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
        <label class="tickbox">
          <input type="checkbox" name="mimo" value="1" checked={values.offline} aria-invalid={errors.offline ? 'true' : undefined} />
          <span>{t.newClient.offline}</span>
        </label>
        {errors.offline ? <p class="field__error">{errors.offline}</p> : null}
        <button class="btn btn--blue btn--large stack__submit" type="submit" name="akcia" value="zalozit">
          {t.newClient.create}
        </button>
      </form>
    </section>
  </>
)

export const PeoplePage: FC<{ people: TeamMember[]; values: { name: string; email: string; role: string }; errors: { name?: string; email?: string }; flash?: string | null }> = ({
  people,
  values,
  errors,
  flash,
}) => (
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
              {m.keys === 0 ? <span class="pill pill--amber">{t.people.noKey}</span> : null}
              <span class={`pill ${m.team === 'admin' ? 'pill--blue' : 'pill--grey'}`}>{t.nav.role[m.team]}</span>
            </span>
          </span>
          {m.keys === 0 ? (
            <a class="link row__act" href="/auth/grants">
              {t.people.activate}
            </a>
          ) : null}
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
