// The team's books of a client: the trial balance with what keeps the books from being whole, the journal, an
// account's movements, the open items, the payments that have no document, the internal documents and the opening
// balances. ledger.ts works everything out; nothing here computes beyond picking what to show.
import type { FC } from 'hono/jsx'
import { formatEurExact } from '../format'
import { EXEMPT_NAMES, dayName, dayShort, readableName } from '../app/copy'
import { textDay } from '../app/booking'
import {
  balanceOf,
  bankChecks,
  daysOverdue,
  leftOf,
  monthEnd,
  numberOf,
  paymentContra,
  reasonAccount,
  type AccountMove,
  type Books,
  type LedgerEntry,
  type LedgerPayment,
  type LineError,
  type ManualEntry,
  type OpeningError,
  type OpenItem,
  type TrialBalance,
} from '../app/ledger'
import type { Company } from '../app/store'
import { team as t } from '../team/copy'
import { Flash, Heading } from './inside'

const L = t.ledger

const MONTHS = ['január', 'február', 'marec', 'apríl', 'máj', 'jún', 'júl', 'august', 'september', 'október', 'november', 'december']

/** An amount in a table: two decimals, no currency sign, a minus as a minus. */
export const amount = (cents: number): string => formatEurExact(cents).replace(/ €$/, '')

/** A balance with its side: 1 234,56 MD, 560,00 D; nought as 0,00. */
const Balance: FC<{ cents: number }> = ({ cents }) =>
  cents === 0 ? (
    <>
      <span class="lzero">0,00</span>
      <span class="lside lside--blank" aria-hidden="true">
        {L.sideMd}
      </span>
    </>
  ) : (
    <>
      {amount(Math.abs(cents))}
      <span class="lside">{cents > 0 ? L.sideMd : L.sideD}</span>
    </>
  )

/** An amount of money with its sign: +5 000,00 €, −33,00 €. */
const signedExact = (cents: number): string => `${cents > 0 ? '+' : ''}${formatEurExact(cents)}`

/** A turnover: a dim nought when there was none. */
const Turnover: FC<{ cents: number }> = ({ cents }) => (cents === 0 ? <span class="lzero">0,00</span> : <>{amount(cents)}</>)

export type LedgerTab = 'trial' | 'journal' | 'saldo' | 'payments' | 'internal' | 'opening'
const TABS: readonly LedgerTab[] = ['trial', 'journal', 'saldo', 'payments', 'internal', 'opening']
const TAB_PATH: Record<LedgerTab, string> = { trial: '', journal: '/dennik', saldo: '/saldokonto', payments: '/platby', internal: '/interne', opening: '/pociatocne' }

export const bookPath = (company: Company, tab: LedgerTab = 'trial'): string => `/ucto/klienti/${company.id}/kniha${TAB_PATH[tab]}`

const LedgerHead: FC<{ company: Company; tab: LedgerTab | null; title: string; second?: string; lead?: string; flash?: string | null; error?: string | null; query?: string }> = (p) => (
  <>
    <a class="back" href={`/ucto/klienti/${p.company.id}`}>
      {p.company.name}
    </a>
    <header class="phead">
      <Heading first={p.title} second={p.second} />
      {p.lead ? <p class="phead__lead">{p.lead}</p> : null}
    </header>
    <nav class="ltabs" aria-label={L.title}>
      {TABS.map((tab) => (
        <a
          class="ltabs__item"
          href={`${bookPath(p.company, tab)}${p.query && (tab === 'trial' || tab === 'journal' || tab === 'payments') ? p.query : ''}`}
          aria-current={tab === p.tab ? 'page' : undefined}
        >
          {L.tabs[tab]}
        </a>
      ))}
    </nav>
    <Flash text={p.flash} />
    <Flash text={p.error} tone="error" />
  </>
)

/** The year, and the month the page goes up to (or the one it shows), chosen without a script. */
const RangeForm: FC<{ action: string; years: number[]; year: number; month?: number; which?: 'through' | 'month' }> = ({ action, years, year, month, which = 'through' }) => (
  <form class="lrange" method="get" action={action}>
    <div class="lrange__field">
      <label class="field__label" for="rok">
        {L.year}
      </label>
      <select id="rok" class="field__input" name="rok">
        {years.map((y) => (
          <option value={String(y)} selected={y === year}>
            {y}
          </option>
        ))}
      </select>
    </div>
    {month !== undefined ? (
      <div class="lrange__field">
        <label class="field__label" for="mesiac">
          {which === 'month' ? L.month : L.through}
        </label>
        <select id="mesiac" class="field__input" name="mesiac">
          {MONTHS.map((name, i) => (
            <option value={String(i + 1)} selected={i + 1 === month}>
              {name}
            </option>
          ))}
        </select>
      </div>
    ) : null}
    <button class="btn btn--line btn--small lrange__go" type="submit">
      {L.show}
    </button>
  </form>
)

const query = (year: number, month?: number) => `?rok=${year}${month ? `&mesiac=${month}` : ''}`

// ---------------------------------------------------------------------------------------------------------------
// The trial balance, and what keeps the books from being whole
// ---------------------------------------------------------------------------------------------------------------

const Issues: FC<{ company: Company; books: Books; today: string }> = ({ company, books, today }) => {
  const i = books.issues
  const base = bookPath(company)
  const cash = balanceOf(books.entries, '211', today)
  const transit = balanceOf(books.entries, '261', today)
  const items: { text: string; href: string | null; go: string | null; warn?: boolean }[] = []
  if (!books.start) items.push({ text: L.issue.noStart, href: `${base}/pociatocne`, go: L.go.opening })
  if (i.unbooked.length > 0) items.push({ text: L.issue.unbooked(i.unbooked.length), href: `/ucto/klienti/${company.id}#zauctovat`, go: L.go.queue })
  if (i.noEntry.length > 0) items.push({ text: L.issue.noEntry(i.noEntry.length), href: `/ucto/doklady/${i.noEntry[0]}`, go: L.go.queue })
  if (i.classify.length > 0) items.push({ text: L.issue.classify(i.classify.length), href: `${base}/platby`, go: L.go.payments })
  if (i.foreign.length > 0) items.push({ text: L.issue.foreign(i.foreign.length), href: `${base}/interne`, go: L.go.internal })
  if (cash < 0) items.push({ text: L.issue.cash(formatEurExact(cash)), href: `${base}/interne`, go: L.go.internal })
  if (i.waiting.length > 0) items.push({ text: L.issue.waiting(i.waiting.length), href: `/ucto/klienti/${company.id}#zauctovat`, go: L.go.queue, warn: true })
  if (i.missing.length > 0) items.push({ text: L.issue.missing(i.missing.length), href: `/ucto/klienti/${company.id}#chyba`, go: L.go.missing, warn: true })
  if (transit !== 0) items.push({ text: L.issue.transit(formatEurExact(Math.abs(transit))), href: null, go: null, warn: true })
  if (books.start && (i.beforeStart.docs > 0 || i.beforeStart.payments > 0))
    items.push({ text: L.issue.beforeStart(i.beforeStart.docs, i.beforeStart.payments, dayName(books.start)), href: `${base}/pociatocne`, go: L.go.opening, warn: true })
  return (
    <section class="info" id="doriesit" aria-labelledby="doriesit-t">
      <h2 id="doriesit-t" class="info__title">
        {L.issuesTitle}
      </h2>
      {items.length === 0 ? (
        <p class="info__empty">{L.allClear}</p>
      ) : (
        <ul class="vissues">
          {items.map((item) => (
            <li class={`vissue${item.warn ? ' vissue--warn' : ''}`}>
              <span class="vissue__text">{item.text}</span>
              {item.href && item.go ? (
                <a class="btn btn--line btn--small" href={item.href}>
                  {item.go}
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

const ResultCard: FC<{ tb: TrialBalance }> = ({ tb }) => (
  <section class="info lresult" aria-labelledby="vysledok-t">
    <h2 id="vysledok-t" class="info__title">
      {L.resultTitle}
    </h2>
    <p class={`lresult__big${tb.result < 0 ? ' lresult__big--loss' : ''}`}>
      <span>{tb.result >= 0 ? L.profit : L.loss}</span> <strong>{formatEurExact(Math.abs(tb.result))}</strong>
    </p>
    <dl class="kv">
      <div>
        <dt>{L.revenues}</dt>
        <dd>{formatEurExact(tb.revenues)}</dd>
      </div>
      <div>
        <dt>{L.costs}</dt>
        <dd>{formatEurExact(tb.costs)}</dd>
      </div>
    </dl>
    <p class="info__source">{L.resultLead}</p>
  </section>
)

const BankCard: FC<{ books: Books; today: string }> = ({ books, today }) => {
  const checks = bankChecks(books, today)
  if (checks.length === 0) return null
  return (
    <section class="info" aria-labelledby="banka-t">
      <h2 id="banka-t" class="info__title">
        {L.bankTitle}
      </h2>
      {checks.map((c) => (
        <div class="lbank">
          <p class="lbank__name">
            {c.bank.ledger} <span>{c.bank.iban.replace(/(.{4})/g, '$1 ').trim()}</span>
          </p>
          {c.balance === null ? (
            <p class="info__lead">
              {L.bankNoBalance} <strong>{formatEurExact(c.ledger)}</strong>
            </p>
          ) : (
            <>
              <dl class="kv">
                <div>
                  <dt>{L.bankOn(dayName(c.on, today))}</dt>
                  <dd>{formatEurExact(c.balance)}</dd>
                </div>
                <div>
                  <dt>{L.bankLedger}</dt>
                  <dd>{formatEurExact(c.ledger)}</dd>
                </div>
                {c.unposted !== 0 ? (
                  <div>
                    <dt>{L.bankUnposted}</dt>
                    <dd>{formatEurExact(c.unposted)}</dd>
                  </div>
                ) : null}
                {c.rest !== 0 ? (
                  <div>
                    <dt>{L.bankRest}</dt>
                    <dd class="lbank__rest">{formatEurExact(c.rest ?? 0)}</dd>
                  </div>
                ) : null}
              </dl>
              {c.rest === 0 ? (
                <p class="lbank__ok">
                  <span class="tick tick--green" aria-hidden="true" /> {L.bankAgrees}
                </p>
              ) : (
                <p class="info__source">{L.bankRestLead}</p>
              )}
            </>
          )}
        </div>
      ))}
    </section>
  )
}

const Downloads: FC<{ company: Company; year: number; month: number }> = ({ company, year, month }) => {
  const base = bookPath(company)
  return (
    <p class="ldown">
      <span>{L.downloads}:</span>
      <a class="link" href={`${base}/dennik.csv${query(year)}`}>
        {L.files.journal}
      </a>
      <a class="link" href={`${base}/hlavna-kniha.csv${query(year)}`}>
        {L.files.general}
      </a>
      <a class="link" href={`${base}/predvaha.csv${query(year, month)}`}>
        {L.files.trial}
      </a>
      <a class="link" href={`${base}/saldokonto.csv`}>
        {L.files.saldo}
      </a>
    </p>
  )
}

export interface TrialPageProps {
  company: Company
  books: Books
  tb: TrialBalance
  years: number[]
  year: number
  month: number
  today: string
  flash?: string | null
}

export const TrialPage: FC<TrialPageProps> = (p) => {
  const base = bookPath(p.company)
  const tb = p.tb
  return (
    <>
      <LedgerHead company={p.company} tab="trial" title={L.title} lead={L.lead} flash={p.flash} query={query(p.year, p.month)} />
      <div class="ltop">
        <Issues company={p.company} books={p.books} today={p.today} />
        <div class="lpair">
          <ResultCard tb={tb} />
          <BankCard books={p.books} today={p.today} />
        </div>
      </div>
      <section class="info ltrial" id="predvaha" aria-labelledby="predvaha-t">
        <header class="lhead">
          <h2 id="predvaha-t" class="info__title">
            {L.trialTitle}
          </h2>
          <RangeForm action={base} years={p.years} year={p.year} month={p.month} />
        </header>
        <p class="info__source">{L.range(dayName(tb.from), dayName(tb.to))}</p>
        {tb.classes.length === 0 ? (
          <p class="info__empty">{L.empty}</p>
        ) : (
          <>
            <div class="lscroll">
              <table class="ltable ltable--trial">
                <thead>
                  <tr>
                    <th scope="col">{L.cols.account}</th>
                    <th scope="col" class="ltable__name">
                      {L.cols.name}
                    </th>
                    <th scope="col" class="num">
                      {L.cols.ps}
                    </th>
                    <th scope="col" class="num">
                      {L.cols.md}
                    </th>
                    <th scope="col" class="num">
                      {L.cols.d}
                    </th>
                    <th scope="col" class="num">
                      {L.cols.ks}
                    </th>
                  </tr>
                </thead>
                {tb.classes.map((c) => (
                  <tbody>
                    <tr class="ltable__class">
                      <th colspan={6} scope="rowgroup">
                        {L.classRow(c.cls, c.name)}
                      </th>
                    </tr>
                    {c.rows.map((r) => (
                      <tr class={r.analytic ? 'ltable__an' : 'ltable__syn'}>
                        <td class="ltable__acct">
                          <a class="link" href={`${base}/ucet/${r.account}${query(p.year, p.month)}`}>
                            {r.account}
                          </a>
                          <span class="ltable__alt">{r.name}</span>
                        </td>
                        <td class="ltable__name">{r.name}</td>
                        <td class="num">
                          <Balance cents={r.ps} />
                        </td>
                        <td class="num">
                          <Turnover cents={r.md} />
                        </td>
                        <td class="num">
                          <Turnover cents={r.d} />
                        </td>
                        <td class="num">
                          <Balance cents={r.ks} />
                        </td>
                      </tr>
                    ))}
                    <tr class="ltable__sum">
                      <td colspan={2}>{L.classTotal(c.cls)}</td>
                      <td class="num">
                        <Balance cents={c.ps} />
                      </td>
                      <td class="num">{amount(c.md)}</td>
                      <td class="num">{amount(c.d)}</td>
                      <td class="num">
                        <Balance cents={c.ks} />
                      </td>
                    </tr>
                  </tbody>
                ))}
                <tfoot>
                  <tr class="ltable__total">
                    <th colspan={2} scope="row">
                      {L.total}
                    </th>
                    <td class="num">
                      <Balance cents={tb.ps} />
                    </td>
                    <td class="num">{amount(tb.md)}</td>
                    <td class="num">{amount(tb.d)}</td>
                    <td class="num">
                      <Balance cents={tb.ks} />
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
            {tb.md === tb.d && tb.ps === 0 && tb.ks === 0 ? (
              <p class="lbalanced">
                <span class="tick tick--green" aria-hidden="true" /> {L.balanced}
              </p>
            ) : null}
          </>
        )}
        <Downloads company={p.company} year={p.year} month={p.month} />
      </section>
    </>
  )
}

// ---------------------------------------------------------------------------------------------------------------
// The journal and an account
// ---------------------------------------------------------------------------------------------------------------

/** Where an entry's document is: the booking page of a document, or nothing to open. */
const docHref = (e: LedgerEntry): string | null => (e.docId ? `/ucto/doklady/${e.docId}` : null)

const EntryDoc: FC<{ e: LedgerEntry; books: Books }> = ({ e, books }) => {
  const number = numberOf(e, books)
  const href = docHref(e)
  return (
    <>
      <span class="lentry__src">{L.source[e.kind]}</span>
      {href ? (
        <a class="link" href={href}>
          {number || L.noNumber}
        </a>
      ) : (
        <span>{number}</span>
      )}
    </>
  )
}

export interface JournalPageProps {
  company: Company
  books: Books
  years: number[]
  year: number
  month: number
}

export const JournalPage: FC<JournalPageProps> = (p) => {
  const base = bookPath(p.company)
  const prefix = `${p.year}-${String(p.month).padStart(2, '0')}`
  const entries = p.books.entries.filter((e) => e.on.startsWith(prefix))
  return (
    <>
      <LedgerHead company={p.company} tab="journal" title={L.journalTitle} lead={L.journalLead} query={query(p.year, p.month)} />
      <section class="info" aria-labelledby="dennik-t">
        <header class="lhead">
          <h2 id="dennik-t" class="info__title">
            {MONTHS[p.month - 1]} {p.year}
          </h2>
          <RangeForm action={`${base}/dennik`} years={p.years} year={p.year} month={p.month} which="month" />
        </header>
        {entries.length === 0 ? (
          <p class="info__empty">{L.journalEmpty}</p>
        ) : (
          <div class="lscroll">
            <table class="ltable ltable--journal">
              <thead>
                <tr>
                  <th scope="col">{L.jcols.day}</th>
                  <th scope="col">{L.jcols.doc}</th>
                  <th scope="col">{L.jcols.text}</th>
                  <th scope="col">{L.jcols.md}</th>
                  <th scope="col">{L.jcols.d}</th>
                  <th scope="col" class="num">
                    {L.jcols.amount}
                  </th>
                </tr>
              </thead>
              {entries.map((e) => (
                <tbody class="lentry">
                  {e.lines.map((line, i) => (
                    <tr>
                      {i === 0 ? (
                        <>
                          <td class="lentry__day" rowspan={e.lines.length}>
                            {dayShort(e.on)}
                          </td>
                          <td class="lentry__doc" rowspan={e.lines.length}>
                            <EntryDoc e={e} books={p.books} />
                          </td>
                          <td class="lentry__text" rowspan={e.lines.length}>
                            {e.text}
                          </td>
                        </>
                      ) : null}
                      <td class="ltable__acct">
                        <a class="link" href={`${base}/ucet/${line.md}${query(p.year, p.month)}`}>
                          {line.md}
                        </a>
                      </td>
                      <td class="ltable__acct">
                        <a class="link" href={`${base}/ucet/${line.d}${query(p.year, p.month)}`}>
                          {line.d}
                        </a>
                      </td>
                      <td class="num">{amount(line.cents)}</td>
                    </tr>
                  ))}
                </tbody>
              ))}
            </table>
          </div>
        )}
        <Downloads company={p.company} year={p.year} month={p.month} />
      </section>
    </>
  )
}

export interface AccountPageProps {
  company: Company
  books: Books
  account: string
  name: string
  ps: number
  moves: AccountMove[]
  md: number
  d: number
  ks: number
  years: number[]
  year: number
  month: number
}

export const AccountPage: FC<AccountPageProps> = (p) => {
  const base = bookPath(p.company)
  return (
    <>
      <LedgerHead company={p.company} tab={null} title={L.accountTitle(p.account)} second={p.name} lead={L.accountLead} />
      <section class="info" aria-labelledby="ucet-t">
        <header class="lhead">
          <h2 id="ucet-t" class="info__title">
            {L.range(dayName(`${p.year}-01-01`), dayName(monthEnd(p.year, p.month)))}
          </h2>
          <RangeForm action={`${base}/ucet/${p.account}`} years={p.years} year={p.year} month={p.month} />
        </header>
        <div class="lscroll">
          <table class="ltable ltable--account">
            <thead>
              <tr>
                <th scope="col">{L.acols.day}</th>
                <th scope="col">{L.acols.doc}</th>
                <th scope="col">{L.acols.text}</th>
                <th scope="col">{L.acols.contra}</th>
                <th scope="col" class="num">
                  {L.acols.md}
                </th>
                <th scope="col" class="num">
                  {L.acols.d}
                </th>
                <th scope="col" class="num">
                  {L.acols.balance}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr class="ltable__syn">
                <td colspan={6}>{L.psRow}</td>
                <td class="num">
                  <Balance cents={p.ps} />
                </td>
              </tr>
              {p.moves.map((m) => (
                <tr>
                  <td class="lentry__day">{dayShort(m.entry.on)}</td>
                  <td class="lentry__doc">
                    <EntryDoc e={m.entry} books={p.books} />
                  </td>
                  <td class="lentry__text">{m.entry.text}</td>
                  <td class="ltable__acct">
                    <a class="link" href={`${base}/ucet/${m.contra}${query(p.year, p.month)}`}>
                      {m.contra}
                    </a>
                  </td>
                  <td class="num">{m.md ? amount(m.md) : ''}</td>
                  <td class="num">{m.d ? amount(m.d) : ''}</td>
                  <td class="num">
                    <Balance cents={m.balance} />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr class="ltable__total">
                <th colspan={4} scope="row">
                  {L.ksRow}
                </th>
                <td class="num">{amount(p.md)}</td>
                <td class="num">{amount(p.d)}</td>
                <td class="num">
                  <Balance cents={p.ks} />
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
        {p.moves.length === 0 ? <p class="info__empty">{L.accountEmpty}</p> : null}
        <a class="btn btn--line btn--small" href={`${base}${query(p.year, p.month)}`}>
          {L.accountBack}
        </a>
      </section>
    </>
  )
}

// ---------------------------------------------------------------------------------------------------------------
// The open items
// ---------------------------------------------------------------------------------------------------------------

const ItemsTable: FC<{ items: OpenItem[]; today: string }> = ({ items, today }) => (
  <div class="lscroll">
    <table class="ltable">
      <thead>
        <tr>
          <th scope="col">{L.scols.number}</th>
          <th scope="col">{L.scols.party}</th>
          <th scope="col">{L.scols.due}</th>
          <th scope="col" class="num">
            {L.scols.total}
          </th>
          <th scope="col" class="num">
            {L.scols.settled}
          </th>
          <th scope="col" class="num">
            {L.scols.left}
          </th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => {
          const late = daysOverdue(item, today)
          return (
            <tr class={late > 0 ? 'ltable__late' : undefined}>
              <td>
                <a class="link" href={`/ucto/doklady/${item.docId}`}>
                  {item.number ?? L.noNumber}
                </a>
              </td>
              <td class="ltable__name">{item.party ? readableName(item.party) : ''}</td>
              <td>
                {item.dueOn ? dayShort(item.dueOn) : ''}
                {late > 0 ? <span class="llate">{L.overdue(late)}</span> : null}
              </td>
              <td class="num">{amount(item.total)}</td>
              <td class="num">{amount(item.settled)}</td>
              <td class="num">
                <strong>{amount(leftOf(item))}</strong>
              </td>
            </tr>
          )
        })}
      </tbody>
      <tfoot>
        <tr class="ltable__total">
          <th colspan={5} scope="row">
            {L.saldoSum}
          </th>
          <td class="num">{amount(items.reduce((sum, i) => sum + leftOf(i), 0))}</td>
        </tr>
      </tfoot>
    </table>
  </div>
)

export const SaldoPage: FC<{ company: Company; books: Books; today: string }> = ({ company, books, today }) => {
  const open = books.items.filter((item) => leftOf(item) !== 0)
  const sides: { account: '311' | '321'; title: string }[] = [
    { account: '311', title: L.customers },
    { account: '321', title: L.suppliers },
  ]
  return (
    <>
      <LedgerHead company={company} tab="saldo" title={L.saldoTitle} lead={L.saldoLead} />
      <div class="lstack">
        {sides.map(({ account, title }) => {
          const items = open.filter((item) => item.account === account)
          // The account's balance (a claim on 311 as a debit, a debt on 321 as a credit) against its open items.
          const balance = (account === '311' ? 1 : -1) * balanceOf(books.entries, account, '9999-12-31')
          const other = balance - items.reduce((sum, i) => sum + leftOf(i), 0)
          return (
            <section class="info" aria-labelledby={`s${account}-t`}>
              <h2 id={`s${account}-t`} class="info__title">
                {title}
              </h2>
              {items.length === 0 ? <p class="info__empty">{L.saldoEmpty}</p> : <ItemsTable items={items} today={today} />}
              {other !== 0 ? <p class="info__source">{L.saldoOther(formatEurExact(other))}</p> : null}
            </section>
          )
        })}
        <p class="ldown">
          <span>{L.downloads}:</span>
          <a class="link" href={`${bookPath(company)}/saldokonto.csv`}>
            {L.files.saldo}
          </a>
        </p>
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------------------------------------------
// Payments that have no document
// ---------------------------------------------------------------------------------------------------------------

export interface PaymentsPageProps {
  company: Company
  books: Books
  /** The payments of the year that are booked without a document, or wait for an account. */
  payments: LedgerPayment[]
  years: number[]
  year: number
  /** A payment whose account was refused, with what was typed. */
  error?: { payment: string; value: string } | null
  flash?: string | null
}

export const PaymentsPage: FC<PaymentsPageProps> = (p) => {
  const base = bookPath(p.company)
  return (
    <>
      <LedgerHead company={p.company} tab="payments" title={L.paymentsTitle} lead={L.paymentsLead} flash={p.flash} query={query(p.year)} />
      <section class="info" aria-labelledby="platby-t">
        <header class="lhead">
          <h2 id="platby-t" class="info__title">
            {L.year} {p.year}
          </h2>
          <RangeForm action={`${base}/platby`} years={p.years} year={p.year} />
        </header>
        {p.payments.length === 0 ? (
          <p class="info__empty">{L.paymentsEmpty}</p>
        ) : (
          <ul class="lpays">
            {p.payments.map((x) => {
              const effective = paymentContra(x)
              const reason = reasonAccount(x)
              const mine = x.contra !== null && effective === x.contra
              const failed = p.error?.payment === x.id
              const what = x.party ? readableName(x.party) : (x.note ?? '')
              return (
                <li class={`lpay${effective ? '' : ' lpay--missing'}`} id={`platba-${x.id}`}>
                  <div class="lpay__text">
                    <span class="lpay__title">
                      {what} <span class="lpay__amount">{signedExact(x.amountCents)}</span>
                    </span>
                    <span class="lpay__sub">
                      <span>{dayShort(x.bookedOn)}</span>
                      <span>{x.exempt ? EXEMPT_NAMES[x.exempt].name : L.reasonNone}</span>
                      {x.exemptNote ? <span>{x.exemptNote}</span> : null}
                      <span class="lpay__state">{effective ? (mine ? `${L.yours} ${effective}` : `${effective}, ${L.proposed}`) : L.noAccount}</span>
                    </span>
                  </div>
                  <form class="lpay__form" method="post" action={`${base}/platby/${x.id}${query(p.year)}`} novalidate>
                    <label class="sr" for={`ucet-${x.id}`}>
                      {L.accountLabel(what)}
                    </label>
                    <input
                      id={`ucet-${x.id}`}
                      class="field__input lpay__input"
                      name="ucet"
                      value={failed ? p.error?.value : (x.contra ?? '')}
                      placeholder={reason ?? ''}
                      inputmode="decimal"
                      maxlength={7}
                      autocomplete="off"
                      aria-invalid={failed ? 'true' : undefined}
                    />
                    <button class="btn btn--line btn--small" type="submit">
                      {L.save}
                    </button>
                    {failed ? <p class="field__error lpay__error">{L.accountError}</p> : null}
                  </form>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </>
  )
}

// ---------------------------------------------------------------------------------------------------------------
// Internal documents and the opening balances
// ---------------------------------------------------------------------------------------------------------------

export interface EntryRowValue {
  md: string
  d: string
  amount: string
}

export interface InternalForm {
  day: string
  text: string
  rows: EntryRowValue[]
  errors: { day?: boolean; text?: boolean; lines?: boolean; rows?: Record<number, LineError> }
}

export const emptyInternal = (today: string, rows = 6): InternalForm => ({ day: textDay(today), text: '', rows: Array.from({ length: rows }, () => ({ md: '', d: '', amount: '' })), errors: {} })

export const InternalPage: FC<{ company: Company; entries: ManualEntry[]; form: InternalForm; flash?: string | null }> = ({ company, entries, form, flash }) => {
  const base = bookPath(company)
  const e = form.errors
  return (
    <>
      <LedgerHead company={company} tab="internal" title={L.internalTitle} lead={L.internalLead} flash={flash} />
      <div class="pgrid pgrid--wide">
        <div class="pgrid__main">
          <section class="info" aria-labelledby="interne-t">
            <h2 id="interne-t" class="info__title">
              {L.internalTitle}
            </h2>
            {entries.length === 0 ? (
              <p class="info__empty">{L.internalEmpty}</p>
            ) : (
              <ul class="lmanual">
                {entries.map((m) => (
                  <li class="lmanual__item">
                    <div class="lmanual__head">
                      <span class="lmanual__number">{m.number}</span>
                      <span>{dayName(m.on)}</span>
                      <span class="lmanual__text">{m.text}</span>
                    </div>
                    <table class="ltable ltable--lines">
                      <tbody>
                        {m.lines.map((line) => (
                          <tr>
                            <td class="ltable__acct">{line.md}</td>
                            <td class="ltable__acct">{line.d}</td>
                            <td class="num">{amount(line.cents)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div class="lmanual__foot">
                      {m.createdByName ? <span class="info__source">{L.by(m.createdByName)}</span> : <span />}
                      <form method="post" action={`${base}/interne/${m.id}/odstranit`}>
                        <button class="btn btn--text" type="submit">
                          {L.remove}
                        </button>
                      </form>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
        <aside class="pgrid__side">
          <section class="info" aria-labelledby="novy-t">
            <h2 id="novy-t" class="info__title">
              {L.newInternal}
            </h2>
            <form class="stack" method="post" action={`${base}/interne`} novalidate>
              <label class="field__label" for="datum">
                {L.day}
              </label>
              <input id="datum" class="field__input" name="datum" value={form.day} inputmode="numeric" maxlength={16} autocomplete="off" aria-invalid={e.day ? 'true' : undefined} />
              {e.day ? <p class="field__error">{L.internalErrors.day}</p> : null}
              <label class="field__label" for="text">
                {L.text}
              </label>
              <input id="text" class="field__input" name="text" value={form.text} maxlength={160} aria-invalid={e.text ? 'true' : undefined} />
              {e.text ? <p class="field__error">{L.internalErrors.text}</p> : null}
              <LinesTable rows={form.rows} errors={e.rows ?? {}} />
              {e.lines ? <p class="field__error">{L.internalErrors.lines}</p> : null}
              <button class="btn btn--blue stack__submit" type="submit">
                {L.addInternal}
              </button>
            </form>
          </section>
        </aside>
      </div>
    </>
  )
}

const LinesTable: FC<{ rows: EntryRowValue[]; errors: Record<number, LineError> }> = ({ rows, errors }) => (
  <table class="lform">
    <thead>
      <tr>
        <th scope="col">{L.lcols.md}</th>
        <th scope="col">{L.lcols.d}</th>
        <th scope="col">{L.lcols.amount}</th>
      </tr>
    </thead>
    <tbody>
      {rows.map((row, i) => (
        <>
          <tr>
            <td>
              <input
                class="field__input"
                name={`md_${i}`}
                value={row.md}
                inputmode="decimal"
                maxlength={7}
                autocomplete="off"
                aria-label={`${L.lcols.md} ${i + 1}`}
                aria-invalid={errors[i] === 'md' || errors[i] === 'same' ? 'true' : undefined}
              />
            </td>
            <td>
              <input
                class="field__input"
                name={`d_${i}`}
                value={row.d}
                inputmode="decimal"
                maxlength={7}
                autocomplete="off"
                aria-label={`${L.lcols.d} ${i + 1}`}
                aria-invalid={errors[i] === 'd' || errors[i] === 'same' ? 'true' : undefined}
              />
            </td>
            <td>
              <input
                class="field__input"
                name={`suma_${i}`}
                value={row.amount}
                inputmode="decimal"
                maxlength={16}
                autocomplete="off"
                aria-label={`${L.lcols.amount} ${i + 1}`}
                aria-invalid={errors[i] === 'amount' ? 'true' : undefined}
              />
            </td>
          </tr>
          {errors[i] ? (
            <tr>
              <td colspan={3}>
                <p class="field__error">{L.lineErrors[errors[i] as LineError]}</p>
              </td>
            </tr>
          ) : null}
        </>
      ))}
    </tbody>
  </table>
)

export interface OpeningRowValue {
  account: string
  md: string
  d: string
}

export interface OpeningForm {
  day: string
  rows: OpeningRowValue[]
  errors: { day?: boolean; rows?: Record<number, OpeningError>; unbalanced?: { md: number; d: number } }
}

export const OpeningPage: FC<{ company: Company; form: OpeningForm; saved: ManualEntry | null; flash?: string | null }> = ({ company, form, saved, flash }) => {
  const base = bookPath(company)
  const e = form.errors
  const errors = e.rows ?? {}
  return (
    <>
      <LedgerHead company={company} tab="opening" title={L.openingTitle} lead={L.openingLead} flash={flash} />
      <section class="info lopening" aria-labelledby="ps-t">
        <h2 id="ps-t" class="info__title">
          {saved ? `${L.openingTitle}, ${dayName(saved.on)}` : L.openingNone}
        </h2>
        <form class="stack" method="post" action={`${base}/pociatocne`} novalidate>
          <label class="field__label" for="datum">
            {L.openingDay}
          </label>
          <input id="datum" class="field__input lopening__day" name="datum" value={form.day} inputmode="numeric" maxlength={16} autocomplete="off" aria-invalid={e.day ? 'true' : undefined} />
          {e.day ? <p class="field__error">{L.openingErrors.day}</p> : null}
          <table class="lform">
            <thead>
              <tr>
                <th scope="col">{L.ocols.account}</th>
                <th scope="col">{L.ocols.md}</th>
                <th scope="col">{L.ocols.d}</th>
              </tr>
            </thead>
            <tbody>
              {form.rows.map((row, i) => (
                <>
                  <tr>
                    <td>
                      <input
                        class="field__input"
                        name={`ucet_${i}`}
                        value={row.account}
                        inputmode="decimal"
                        maxlength={7}
                        autocomplete="off"
                        aria-label={`${L.ocols.account} ${i + 1}`}
                        aria-invalid={errors[i] === 'account' || errors[i] === 'closing' ? 'true' : undefined}
                      />
                    </td>
                    <td>
                      <input
                        class="field__input"
                        name={`md_${i}`}
                        value={row.md}
                        inputmode="decimal"
                        maxlength={16}
                        autocomplete="off"
                        aria-label={`${L.ocols.md} ${i + 1}`}
                        aria-invalid={errors[i] === 'both' || errors[i] === 'amount' ? 'true' : undefined}
                      />
                    </td>
                    <td>
                      <input
                        class="field__input"
                        name={`d_${i}`}
                        value={row.d}
                        inputmode="decimal"
                        maxlength={16}
                        autocomplete="off"
                        aria-label={`${L.ocols.d} ${i + 1}`}
                        aria-invalid={errors[i] === 'both' || errors[i] === 'amount' ? 'true' : undefined}
                      />
                    </td>
                  </tr>
                  {errors[i] ? (
                    <tr>
                      <td colspan={3}>
                        <p class="field__error">{L.openingErrors[errors[i] as OpeningError]}</p>
                      </td>
                    </tr>
                  ) : null}
                </>
              ))}
            </tbody>
          </table>
          {e.unbalanced ? (
            <p class="field__error">{L.openingUnbalanced(formatEurExact(e.unbalanced.md), formatEurExact(e.unbalanced.d))}</p>
          ) : saved ? (
            <p class="lbalanced">
              <span class="tick tick--green" aria-hidden="true" />{' '}
              {L.openingTotals(
                formatEurExact(saved.lines.filter((l) => l.d === '701').reduce((sum, l) => sum + l.cents, 0)),
                formatEurExact(saved.lines.filter((l) => l.md === '701').reduce((sum, l) => sum + l.cents, 0)),
              )}
            </p>
          ) : null}
          <p class="info__source">{L.openingHint}</p>
          <button class="btn btn--blue stack__submit" type="submit">
            {L.openingSave}
          </button>
        </form>
      </section>
    </>
  )
}

// ---------------------------------------------------------------------------------------------------------------
// The client page's card
// ---------------------------------------------------------------------------------------------------------------

/** How many things keep the books from being whole: the issues the trial balance page lists as blocking. */
export function blockingCount(books: Books, today: string): number {
  const i = books.issues
  return (books.start ? 0 : 1) + i.unbooked.length + i.noEntry.length + i.classify.length + i.foreign.length + (balanceOf(books.entries, '211', today) < 0 ? 1 : 0)
}

export const LedgerCard: FC<{ company: Company; tb: TrialBalance; waiting: number }> = ({ company, tb, waiting }) => (
  <section class="info" id="kniha" aria-labelledby="kniha-t">
    <header class="info__row">
      <h2 id="kniha-t" class="info__title">
        {L.card}
      </h2>
      {waiting > 0 ? <span class="pill pill--amber">{L.cardIssues(waiting)}</span> : null}
    </header>
    <p class="info__lead">{L.cardResult(tb.result >= 0, formatEurExact(Math.abs(tb.result)), tb.year)}</p>
    <div class="info__acts">
      <a class="btn btn--line btn--small" href={bookPath(company)}>
        {L.cardOpen}
      </a>
      <a class="btn btn--line btn--small" href={`/ucto/klienti/${company.id}/zavierka`}>
        {t.closing.open}
      </a>
    </div>
  </section>
)
