// The team's screen of deadlines (/ucto/terminy): every client's deadlines grouped by how soon they come, each with the
// place where it is acted on. What the app does not file itself yet (the recapitulative statement) is marked as filed
// here. The rules are in team/deadlines.ts.
import type { FC } from 'hono/jsx'
import { DELIVERY_LABELS } from '../filings/model'
import { REPORT_KINDS, REPORT_LABELS } from '../payroll-reporting/model'
import { DEADLINES } from '../config'
import { formatEurExact } from '../format'
import { dayName, monthName } from '../app/copy'
import { periodName } from '../app/vat-store'
import type { User } from '../app/store'
import { DUE_GROUPS, DUE_SIDE, MARKED_KINDS, dueFigures, groupOf, type Due, type DueGroup, type DueSide } from '../team/deadlines'
import type { DueRow } from '../team/deadlines-store'
import { team } from '../team/copy'
import { Flash, Heading } from './inside'

const t = team.deadlines

/** What a deadline is, in words: "DPH a kontrolný výkaz za september 2026". */
export function dueWhat(d: Pick<DueRow, 'kind' | 'period' | 'fix' | 'reportKind' | 'payrollStage'> & { company: Pick<DueRow['company'], 'vatStatus'> }): string {
  const period = d.period ?? ''
  switch (d.kind) {
    case 'vat':
      return d.company.vatStatus === 'reg7a' ? t.what.vat7a(periodName(period)) : t.what.vat(periodName(period))
    case 'vatFix':
      return t.what.vatFix[d.fix ?? 'O'](periodName(period))
    case 'summary':
      return d.fix ? t.what.summaryFix[d.fix](periodName(period)) : t.what.summary(periodName(period))
    case 'vatPay':
      return t.what.vatPay(periodName(period))
    case 'docs':
      return t.what.docs(monthName(`${period}-01`))
    case 'closing':
      return t.what.closing(period)
    case 'taxPay':
      return t.what.taxPay(period)
    case 'payroll':
      return t.what.payroll(monthName(`${period}-01`))
    case 'payrollReport':
      return `${d.reportKind ? REPORT_KINDS[d.reportKind] : 'Mzdový výkaz'} za ${monthName(`${period}-01`)}`
    case 'payrollReports':
      if (d.payrollStage === 'payout') return `Overiť skutočné vyplatenie príjmov za ${monthName(`${period}-01`)}`
      return t.what.payrollReports(monthName(`${period}-01`))
    case 'handover':
      return t.what.handover
  }
}

/** Where it stands, in words: "Pripravené na podanie", "Treba vyriešiť: 3", "Na úhradu 1 234,56 €". */
export function dueState(d: Pick<Due, 'kind' | 'state' | 'count' | 'cents' | 'period'> & Pick<Due, 'deliveryStatus' | 'payrollStage' | 'sourceChanged'>): string {
  if (d.payrollStage === 'payout') return 'Výplatu treba overiť'
  if (d.sourceChanged) return 'Podklady sa po uložení zmenili'
  if (d.deliveryStatus) return d.kind === 'payrollReport' ? REPORT_LABELS[d.deliveryStatus] : DELIVERY_LABELS[d.deliveryStatus]
  if (d.kind === 'docs' && d.state !== 'done') return t.state.missing(d.count)
  switch (d.state) {
    case 'ready':
      return t.state.ready
    case 'blocked':
      return t.state.blocked(d.count)
    case 'running':
      return d.kind === 'handover' ? t.state.running.contract : d.kind === 'summary' && (d.period ?? '').includes('Q') ? t.state.running.quarter : t.state.running.period
    case 'done':
      return t.state.done[d.kind] ?? t.state.done.vat
    default:
      return d.kind === 'vatPay' || d.kind === 'taxPay' ? t.state.toPay(formatEurExact(d.cents)) : (t.state.open[d.kind] ?? t.state.open.vat)
  }
}

const tone = (d: Due): string => (d.state === 'done' ? 'pill--ok' : d.late || d.sourceChanged || d.deliveryStatus === 'rejected' || d.deliveryStatus === 'review' ? 'pill--red' : d.state === 'ready' ? 'pill--blue' : d.state === 'running' ? 'pill--grey' : 'pill--amber')

/** Where a deadline is acted on: the period on the VAT page, the client's missing documents, the closing's page, the handover. */
export function dueHref(d: Pick<DueRow, 'kind' | 'period' | 'deliveryStatus' | 'reportId'> & { company: Pick<DueRow['company'], 'id' | 'vatStatus'> & Partial<Pick<DueRow['company'], 'vatQuarterly'>> }): string {
  const base = `/ucto/klienti/${d.company.id}`
  if (d.deliveryStatus && ['vat', 'summary', 'closing'].includes(d.kind)) return `${base}/podania?obdobie=${d.period}`
  switch (d.kind) {
    case 'vat':
    case 'vatFix':
    case 'vatPay':
      return `${base}/dph?obdobie=${d.period}`
    case 'summary': {
      // A person registered under § 7a files it for a quarter; its VAT page goes by months: the quarter's first one.
      const period = d.period ?? ''
      const month = period.includes('Q') && d.company.vatStatus === 'reg7a' ? `${period.slice(0, 4)}-${String((Number(period.slice(6)) - 1) * 3 + 1).padStart(2, '0')}` : period
      const vat = d.company.vatQuarterly && !period.includes('Q') ? `${period.slice(0, 4)}-Q${Math.ceil(Number(period.slice(5, 7)) / 3)}` : month
      return `${base}/dph?obdobie=${vat}#suhrnny${d.company.vatQuarterly && !period.includes('Q') ? `-${period}` : ''}`
    }
    case 'docs':
      return `${base}#chyba`
    case 'closing':
    case 'taxPay':
      return `${base}/zavierka?rok=${d.period}`
    case 'payrollReport':
      return `${base}/mzdove-podania/${d.reportId}`
    case 'payrollReports':
      return `${base}/mzdove-podania?obdobie=${d.period}`
    case 'payroll':
      return `${base}/mzdy?obdobie=${d.period}`
    case 'handover':
      return `${base}#odovzdanie`
  }
}

/** A line under the deadline that says what to know about it. */
function noteOf(d: Due): string | null {
  if (d.payrollStage === 'payout') return 'Plánovaný výplatný termín nestačí. Obdobie prehľadu finančnej správy sa určí podľa overeného vyplatenia príjmov.'
  if (d.sourceChanged) return 'Pôvodné potvrdenie zostáva v histórii. Odborník musí posúdiť aktuálne podklady a správny druh opravy.'
  if (d.kind === 'payrollReports' && !d.manualRecorded) return 'Založte samostatnú evidenciu príjemcov tejto staršej uzávierky. Jedno označenie nepotvrdzuje všetky podania.'
  if (d.kind === 'payrollReports' && d.manualRecorded) return 'Odoslanie je označené ručne. Prijatie jednotlivými príjemcami zatiaľ nie je doložené.'
  if (d.deliveryStatus && d.deliveryStatus !== 'accepted') return 'Termín zostáva otvorený do doloženia prijatia. Odbornú správnosť kontroluje účtovník.'
  if (d.kind === 'vatFix') return d.fix === 'D' ? t.note.fixD : t.note.fixO
  if (d.kind === 'vat' && d.state === 'open') return t.note.older
  if (d.kind === 'summary' && d.fix === 'D') return t.note.summaryD
  if (d.kind === 'summary' && d.state !== 'done') return t.note.summary
  if (d.kind === 'payrollReports' && d.state !== 'done') return t.note.payrollReports
  return null
}

const daysBetween = (from: string, to: string): number => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000)

export type DueFilter = 'all' | DueSide

export interface DeadlinesPageProps {
  user: User
  dues: DueRow[]
  today: string
  side: DueFilter
  done: boolean
  /** The administrator's choice of an accountant: '' all, 'none' the companies of nobody, or her id. */
  accountant: string
  accountants: { id: string; name: string }[]
  flash?: string | null
}

/** The address of the screen with the filters given, the others kept. */
export function deadlinesHref(p: { side: DueFilter; done: boolean; accountant: string }): string {
  const q = new URLSearchParams()
  if (p.side !== 'all') q.set('kto', p.side === 'ours' ? 'my' : 'klient')
  if (p.done) q.set('hotove', '1')
  if (p.accountant) q.set('uctovnicka', p.accountant)
  const s = q.toString()
  return s ? `/ucto/terminy?${s}` : '/ucto/terminy'
}

const MarkForm: FC<{ d: DueRow; back: string }> = ({ d, back }) => {
  if (d.kind !== 'payrollReports' || d.payrollStage === 'payout' || !d.manualRecorded || !d.period || (d.state !== 'open' && d.state !== 'done')) return <span class="due__act" />
  return (
    <form class="due__act" method="post" action={`/ucto/klienti/${d.company.id}/podane`}>
      <input type="hidden" name="druh" value={MARKED_KINDS.payroll} />
      <input type="hidden" name="obdobie" value={d.period} />
      <input type="hidden" name="spat" value={back} />
      {d.state === 'done' || d.manualRecorded ? <input type="hidden" name="zrusit" value="1" /> : null}
      <button class="btn btn--line btn--small" type="submit">
        {d.state === 'done' || d.manualRecorded ? t.unmark : t.mark}
      </button>
    </form>
  )
}

export const DueItem: FC<{ d: DueRow; today: string; admin: boolean; back: string; company?: boolean }> = ({ d, today, admin, back, company = true }) => {
  const note = noteOf(d)
  return (
    <li class={`due${d.state === 'done' ? ' due--done' : ''}`}>
      <span class="date__day">
        <span class={`date__num${d.late ? ' date__num--late' : ''}`}>{Number(d.day.slice(8, 10))}.</span>
        <span class="date__month">{dayName(d.day, today).replace(/^\d+\.\s/, '')}</span>
      </span>
      <span class="due__text">
        <a class="due__what" href={dueHref(d)}>
          {dueWhat(d)}
        </a>
        <span class="due__sub">
          {company ? (
            <a class="link" href={`/ucto/klienti/${d.company.id}`}>
              {d.companyName}
            </a>
          ) : null}
          <span>{t.side[DUE_SIDE[d.kind]]}</span>
          {admin && company ? <span>{d.company.accountantName ?? team.clients.nobody}</span> : null}
          {d.late ? <span class="due__late">{t.late(daysBetween(d.day, today))}</span> : d.day === today && d.state !== 'done' && d.state !== 'running' ? <span class="due__late">{t.today}</span> : null}
          {note ? <span>{note}</span> : null}
        </span>
      </span>
      <span class={`pill ${tone(d)}`}>{dueState(d)}</span>
      <MarkForm d={d} back={back} />
    </li>
  )
}

/** One client's deadlines on its page: what is open, each with where it is done. */
export const DeadlinesCard: FC<{ dues: DueRow[]; today: string; companyId: string }> = ({ dues, today, companyId }) => {
  const open = dues.filter((d) => d.state !== 'done')
  return (
    <section class="info" id="terminy" aria-labelledby="terminy-t">
      <h2 id="terminy-t" class="info__title">
        {t.title}
      </h2>
      {open.length === 0 ? (
        <p class="info__empty">{t.cardEmpty(DEADLINES.aheadDays)}</p>
      ) : (
        <ul class="dues__list dues__list--card">
          {open.map((d) => (
            <DueItem d={d} today={today} admin={false} back={`/ucto/klienti/${companyId}`} company={false} />
          ))}
        </ul>
      )}
      <a class="btn btn--line btn--small" href="/ucto/terminy">
        {t.cardAll}
      </a>
    </section>
  )
}

export const DeadlinesPage: FC<DeadlinesPageProps> = ({ user, dues, today, side, done, accountant, accountants, flash }) => {
  const admin = user.team === 'admin'
  const figures = dueFigures(dues, today)
  const shown = dues.filter((d) => (side === 'all' || DUE_SIDE[d.kind] === side) && (done || d.state !== 'done'))
  const groups = new Map<DueGroup, DueRow[]>()
  for (const d of shown) {
    const g = groupOf(d, today)
    groups.set(g, [...(groups.get(g) ?? []), d])
  }
  const here = deadlinesHref({ side, done, accountant })
  const filter = (s: DueFilter) => (
    <a class="filters__item" href={deadlinesHref({ side: s, done, accountant })} aria-current={side === s ? 'page' : undefined}>
      {s === 'all' ? t.filters.all : s === 'ours' ? t.filters.ours : t.filters.client}
    </a>
  )
  return (
    <>
      <header class="phead phead--row">
        <div>
          <Heading first={t.title} second={t.serif} />
          <p><a class="link" href="/ucto/podania">Podania a potvrdenky na dokončenie zo všetkých období</a></p>
          <p class="phead__lead">{t.lead}</p>
        </div>
      </header>
      <Flash text={flash} />
      <dl class="figs__grid figs__grid--four">
        <div class="fig">
          <dt>{t.figures.late}</dt>
          <dd class={`fig__value${figures.late > 0 ? ' fig__value--late' : ''}`}>{figures.late}</dd>
        </div>
        <div class="fig">
          <dt>{t.figures.week}</dt>
          <dd class="fig__value">{figures.week}</dd>
        </div>
        <div class="fig">
          <dt>{t.figures.ready}</dt>
          <dd class="fig__value">{figures.ready}</dd>
        </div>
        <div class="fig">
          <dt>{t.figures.client}</dt>
          <dd class="fig__value">{figures.client}</dd>
        </div>
      </dl>
      <div class="dues__bar">
        <nav class="filters dues__filters" aria-label={t.filters.label}>
          {filter('all')}
          {filter('ours')}
          {filter('client')}
        </nav>
        <a class="link dues__done" href={deadlinesHref({ side, done: !done, accountant })}>
          {done ? t.filters.withoutDone : t.filters.withDone}
        </a>
        {admin && accountants.length > 0 ? (
          <form class="inline dues__who" method="get" action="/ucto/terminy">
            {side !== 'all' ? <input type="hidden" name="kto" value={side === 'ours' ? 'my' : 'klient'} /> : null}
            {done ? <input type="hidden" name="hotove" value="1" /> : null}
            <label class="sr" for="uctovnicka">
              {t.accountant}
            </label>
            <select id="uctovnicka" class="field__input" name="uctovnicka">
              <option value="">{t.accountantAll}</option>
              {accountants.map((a) => (
                <option value={a.id} selected={a.id === accountant}>
                  {a.name}
                </option>
              ))}
              <option value="none" selected={accountant === 'none'}>
                {t.accountantNone}
              </option>
            </select>
            <button class="btn btn--line btn--small" type="submit">
              {t.show}
            </button>
          </form>
        ) : null}
      </div>
      {shown.length === 0 ? (
        <p class="over__empty">{dues.length === 0 ? t.empty(DEADLINES.aheadDays) : t.emptyFiltered}</p>
      ) : (
        DUE_GROUPS.filter((g) => (groups.get(g) ?? []).length > 0).map((g) => (
          <section class={`info dues dues--${g}`} aria-labelledby={`terminy-${g}`}>
            <h2 id={`terminy-${g}`} class="info__title">
              {t.groups[g]} <span class={`count ${g === 'late' ? 'count--red' : 'count--grey'}`}>{(groups.get(g) ?? []).length}</span>
            </h2>
            <ul class="dues__list">
              {(groups.get(g) ?? []).map((d) => (
                <DueItem d={d} today={today} admin={admin} back={here} />
              ))}
            </ul>
          </section>
        ))
      )}
    </>
  )
}
