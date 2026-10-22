// The overview describes known work, never an assurance that the whole accounting service is complete.
import { BANK } from '../config'
import type { BankLinkView, BankNotice } from './bank'
import { app, dayName, monthName } from './copy'
import type { Deadline } from './deadlines'
import { bratislavaDay } from '../time'

export interface FirstStepsState {
  declaration: boolean
  poa: boolean
  payments: boolean
  upload: boolean
  email: boolean
  people: boolean
  switching: boolean
  switched?: boolean
}

export interface OverviewAction {
  id: string
  title: string
  lead: string
  button: string
  href: string
  dueOn: string | null
}

export interface OverviewFacts {
  takeoverAction?: string | null
  closed: boolean
  today: string
  owner: boolean
  missing: number
  deadlines: readonly Deadline[]
  unread: number
  /** A personal, currently eligible approval from the same queue as /app/schvalovanie. */
  approval: { dueOn: string | null } | null
  confirmAccount: string | null
  statementDue: string | null
  bankNotice: BankNotice
  bankReady: boolean
  steps: FirstStepsState | null
}

export function bankRenewHref(notice: NonNullable<BankNotice>, ready: boolean): string {
  return notice.fio ? '/app/banka?banka=fio#postup-banka' : ready ? `/app/banka/pripojit?banka=${encodeURIComponent(notice.bank)}` : '/app/banka'
}

/** One list of the known next steps. Every item stays visible even when another one leads the page. */
export function overviewActions(facts: OverviewFacts): OverviewAction[] {
  if (facts.closed) return []
  const text = app.home.next
  const actions: (OverviewAction & { priority: number })[] = []
  const add = (id: string, copy: { title: string; lead: string; button: string }, href: string, priority: number, dueOn: string | null = null) =>
    actions.push({ id, ...copy, href, priority, dueOn })
  for (const [i, d] of facts.deadlines.entries()) {
    // A blue filing is Firmony's work. An amber document deadline has no href and is covered by missing below.
    if (d.tone === 'amber' && d.href) add(`deadline-${i}`, { title: d.label, lead: d.state, button: text.payment }, d.href, 7, d.day)
  }
  if (facts.owner && facts.bankNotice) {
    const n = facts.bankNotice
    add('bank', { ...text.bank, lead: n.kind === 'ended' ? app.bank.notice.ended(n.bank) : app.bank.notice.renew(n.bank, dayName(bratislavaDay(n.until))) }, bankRenewHref(n, facts.bankReady), n.kind === 'ended' ? 0 : 8, n.kind === 'renew' ? bratislavaDay(n.until) : null)
  }
  if (facts.owner && facts.confirmAccount) add('account', text.account, `#potvrdit-${facts.confirmAccount}`, 1)
  if (facts.statementDue) add('statement', { ...text.statement, lead: app.bank.statements.due.title(monthName(`${facts.statementDue}-01`)) }, '/app/banka#pridat', 2)
  if (facts.missing > 0) {
    const due = facts.deadlines.filter((d) => d.tone === 'amber' && !d.href).map((d) => d.day).sort()[0] ?? null
    add('documents', { ...text.documents, title: app.home.missingTitle(facts.missing) }, '/app/platby', 3, due)
  }
  if (facts.approval) add('approval', text.approval, '/app/schvalovanie', 4, facts.approval.dueOn)
  if (facts.takeoverAction) add('managed-takeover', {title:'Doplnenie k prevzatiu účtovníctva',lead:facts.takeoverAction,button:'Vybaviť s účtovníčkou'}, '/app/prechod#koordinacia',5)
  // Reading a message does not prove a question was answered. Do not infer an obligation to reply from its text.
  if (facts.unread > 0) add('message', text.message, '/app/spravy', 5)
  if (facts.steps) {
    const s = facts.steps
    const copy = app.start.steps
    const first = facts.owner && !s.declaration ? { id: 'declaration', copy: copy.declaration, href: '/app/vyhlasenie' }
      : !s.poa ? { id: 'poa', copy: copy.poa, href: '/app/plna-moc' }
      : !s.payments && facts.owner && !facts.confirmAccount && !facts.statementDue && !facts.bankNotice ? { id: 'setup-bank', copy: facts.bankReady ? copy.bank : copy.payments, href: facts.bankReady ? '/app/banka#prepojit' : '/app/banka#postup' }
      : !s.upload && facts.missing === 0 ? { id: 'first-document', copy: copy.upload, href: '/app/doklady#pridat' } : null
    if (first) add(first.id, { title: first.copy.title, lead: first.copy.lead, button: first.copy.link }, first.href, 6)
  }
  return actions.sort((a, b) => {
    const dueA = a.dueOn !== null && a.dueOn <= facts.today
    const dueB = b.dueOn !== null && b.dueOn <= facts.today
    if (dueA !== dueB) return dueA ? -1 : 1
    if (dueA && dueB && a.dueOn !== b.dueOn) return a.dueOn!.localeCompare(b.dueOn!)
    return a.priority - b.priority || (a.dueOn ?? '').localeCompare(b.dueOn ?? '') || a.id.localeCompare(b.id)
  }).map(({ priority: _, ...action }) => action)
}

export interface BankHealth {
  kind: 'waiting' | 'delayed' | 'error'
  bank: string
  syncedAt: number | null
}

/** Two scheduled reading intervals is an internal visibility threshold, not a promise of bank freshness. */
export const BANK_DELAY_SECONDS = 2 * BANK.syncEverySeconds

export function bankHealthOf(links: readonly BankLinkView[], at: number): BankHealth | null {
  const issues = links.filter((l) => l.status === 'active' && (l.validUntil === null || l.validUntil > at)).flatMap((l): BankHealth[] => {
    const syncedAt = l.syncedAt !== null && Number.isFinite(l.syncedAt) && l.syncedAt >= 0 && l.syncedAt <= at ? l.syncedAt : null
    if (l.error) return [{ kind: 'error', bank: l.bank, syncedAt }]
    if (syncedAt === null) return [{ kind: 'waiting', bank: l.bank, syncedAt: null }]
    return at - syncedAt >= BANK_DELAY_SECONDS ? [{ kind: 'delayed', bank: l.bank, syncedAt }] : []
  })
  const rank = { error: 0, delayed: 1, waiting: 2 }
  return issues.sort((a, b) => rank[a.kind] - rank[b.kind] || (a.syncedAt ?? 0) - (b.syncedAt ?? 0) || a.bank.localeCompare(b.bank))[0] ?? null
}
