// The checks and the approval at a meeting, in one tap for the designated person when nothing needs his own judgement:
// the checks the app prepared (aml/proposals.ts) recorded as they read when they are clear, PEP from the declaration and
// his own word that public sources say nothing else, the beneficial owners in his own words when the register names no
// shareholders, and the approval at the risk the declaration requires. Anything else (a name on a sanctions list, a
// country of high risk, a PEP, a place of business not at the seat, a required risk that is high) is his to do on the
// full page of the dossier, as for any client; the meeting's page then follows it there.
import type { User } from '../app/store'
import { textDay } from '../app/booking'
import { bratislavaClock, bratislavaDay } from '../time'
import { CHECK_LABELS, type DossierView } from '../aml/model'
import type { DossierProposals } from '../aml/proposals'
import { decideDossier, dossierOfOrder, recordCheck } from '../aml/store'
import { now } from '../db'
import type { Order } from '../order'

export const PREPARED = ['eu-sanctions', 'un-sanctions', 'countries', 'kuv'] as const
type Prepared = (typeof PREPARED)[number]

export interface PlanItem {
  kind: Prepared | 'pep'
  label: string
  /** recorded: a clear check of these data stands; ready: the app prepared a clear one; confirm: his word records it;
   *  manual: his own judgement on the dossier's page. */
  state: 'recorded' | 'ready' | 'confirm' | 'manual'
  text: string
  source?: string
}

export interface ApprovalPlan {
  items: PlanItem[]
  level: 'low' | 'standard' | 'high'
  /** Why the meeting's page cannot approve by itself, or null. */
  blocked: string | null
}

const recorded = (view: DossierView, kind: string) => {
  const k = view.checks.find((c) => c.kind === kind)
  return k && k.facts_hash === view.dossier.facts_hash && k.result === 'clear' ? k : null
}

/** What the approval at the meeting would record, and whether it can. */
export function approvalPlan(view: DossierView, proposals: DossierProposals): ApprovalPlan {
  const items: PlanItem[] = PREPARED.map((kind) => {
    const label = CHECK_LABELS[kind]
    if (recorded(view, kind)) return { kind, label, state: 'recorded', text: 'Zapísané, bez prekážky.' }
    const p = proposals[kind]
    if (p && 'proposal' in p && p.proposal.result === 'clear') return { kind, label, state: 'ready', text: 'Pripravené aplikáciou, bez prekážky.', source: p.proposal.source }
    if (kind === 'kuv') return { kind, label, state: 'confirm', text: p && 'missing' in p ? p.missing : 'Register sa so spoločníkmi z vyhlásenia celkom nezhoduje. Overte ich a napíšte, ako.' }
    return { kind, label, state: 'manual', text: p && 'missing' in p ? p.missing : p && 'proposal' in p && p.proposal.result === 'high' ? 'Krajina s vysokým rizikom: treba zvýšenú starostlivosť.' : 'Aplikácia našla niečo na posúdenie.' }
  })
  const d = view.declaration
  const pep = [d.director, ...d.owners].some((p) => p.pep)
  items.push(recorded(view, 'pep')
    ? { kind: 'pep', label: CHECK_LABELS.pep, state: 'recorded', text: 'Zapísané, bez prekážky.' }
    : pep
      ? { kind: 'pep', label: CHECK_LABELS.pep, state: 'manual', text: 'Podľa vyhlásenia je niekto politicky exponovaná osoba: treba zvýšenú starostlivosť.' }
      : { kind: 'pep', label: CHECK_LABELS.pep, state: 'confirm', text: 'Podľa vyhlásenia nikto nie je politicky exponovaná osoba.' })
  const level = view.requiredRisk ?? view.dossier.required_risk
  const placeOk = d.businessAtSeat !== false || view.placeChecks?.[0]?.result === 'clear' && view.placeChecks[0].facts_hash === view.dossier.facts_hash
  const blocked = level === 'high' ? 'Klient patrí do skupiny so zvýšeným rizikom: overenie dokončite v spise so zvýšenou starostlivosťou.'
    : !placeOk ? 'Skutočné miesto činnosti nie je sídlo: overte ho v spise z dokladu tretej osoby.'
      : items.some((i) => i.state === 'manual') ? 'Niektorú kontrolu treba posúdiť v spise.' : null
  return { items, level, blocked }
}

const when = (at: number) => `${textDay(bratislavaDay(at))} o ${bratislavaClock(at)}`

/**
 * Records what the plan allows and approves. `kuv` is his own text of how the beneficial owners were verified when the
 * register could not say it, `pep` his word that public sources say nothing more than the declaration.
 */
export async function approveAtMeeting(env: { DB: D1Database }, user: User, order: Order, view: DossierView, plan: ApprovalPlan, input: { hash: string; pep: boolean; kuv: string }): Promise<'ok' | 'stale' | 'manual' | 'pep' | 'kuv' | 'failed'> {
  const db = env.DB
  if (input.hash !== view.dossier.facts_hash || !view.inPerson || view.inPerson.facts_hash !== view.dossier.facts_hash) return 'stale'
  if (plan.blocked) return 'manual'
  const pep = plan.items.find((i) => i.kind === 'pep')
  if (pep?.state === 'confirm' && !input.pep) return 'pep'
  const kuv = plan.items.find((i) => i.kind === 'kuv')
  if (kuv?.state === 'confirm' && input.kuv.trim().length < 12) return 'kuv'
  const at = now()
  for (const item of plan.items) {
    const source = item.state === 'ready' ? item.source ?? ''
      : item.state === 'confirm' && item.kind === 'pep' ? `Osobné stretnutie ${when(at)}: podľa vyhlásenia konateľ ani koneční užívatelia výhod nie sú politicky exponované osoby (§ 6 zákona č. 297/2008 Z. z.); verejné zdroje nič iné neukázali.`
        : item.state === 'confirm' && item.kind === 'kuv' ? `Osobné stretnutie ${when(at)}: ${input.kuv.trim()}`
          : ''
    if (!source) continue
    if (!(await recordCheck(db, user, view, { kind: item.kind, result: 'clear', source, subject: '', hash: view.dossier.facts_hash, qualified: false }))) return 'failed'
  }
  const fresh = await dossierOfOrder(db, order.id)
  if (!fresh || fresh.dossier.id !== view.dossier.id) return 'stale'
  const ok = await decideDossier(db, user, fresh, { level: plan.level, decision: 'approved', hash: fresh.dossier.facts_hash, enhanced: '',
    note: `Osobné stretnutie ${when(at)}: totožnosť overená osobne s dokladom, kontroly PEP, sankčných zoznamov, krajín a KUV zapísané v spise.` })
  return ok ? 'ok' : 'failed'
}
