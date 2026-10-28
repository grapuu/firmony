// The review of a request before the contract, prepared by the app (his word of 28 October 2026: his part one click).
// The four things the administrator confirms (views/contract-review.tsx) are looked up where they can be:
//  - authority: who acts for the company and how, from the register of legal entities as the order keeps it (rpo.ts);
//  - category: whether the company is a micro entity, from the register of financial statements (ruz.ts): its latest
//    statements filed on the micro entity's template (Úč MUJ, the measure MF/18008/2014), not consolidated, or a company
//    founded this year or the last that has filed none yet (its first periods);
//  - scope: fewer than ten employees by the same register, a standard plan, and a team of at least two (a deputy and an
//    independent check);
//  - cover: all of that within the catalogue the lawyer and the insurer approved (CONTRACT_RELEASE).
// What holds is ticked and said with its source; what does not, or what could not be looked up, is left to the person.
// Nothing is recorded until the administrator saves the review: the proposal is the form filled in, not a decision.
import { PLANS, planById } from '../config'
import { approvedRelease, contractCatalogueHash, type ContractBindings } from '../contracts'
import { textDay } from '../app/booking'
import { bratislavaDay } from '../time'
import { now } from '../db'
import { lookupCompany, oneMayConclude, signerRole, LEGAL_FORM_NAMES } from '../rpo'
import { EMPLOYEE_BANDS, fewEmployees, ruzProfile, type RuzProfile } from '../ruz'
import type { Order } from '../order'

export type ReviewCheck = 'category' | 'scope' | 'cover' | 'authority'

export interface ReviewProposal {
  ticks: Record<ReviewCheck, boolean>
  /** All four hold: the standard plan is proposed. */
  standard: boolean
  /** What the evidence field is filled with (12 to 240 characters), when the standard plan is proposed. */
  evidence: string
  /** Each check in words, with what it rests on. */
  notes: { check: ReviewCheck; ok: boolean; text: string }[]
}

const yearOf = (day: string) => Number(day.slice(0, 4))
const monthWord = (ym: string) => `${Number(ym.slice(5, 7))}/${ym.slice(0, 4)}`

/** Whether a register profile makes the company a micro entity now, and why (or why not). */
export function micro(profile: RuzProfile | 'none' | null, established: string | null, today: string): { ok: boolean; text: string; short: string } {
  if (profile === null) return { ok: false, text: 'Register účtovných závierok neodpovedal. Kategóriu overte ručne.', short: '' }
  const founded = (profile !== 'none' ? profile.founded : null) ?? established
  const young = Boolean(founded && yearOf(founded) >= yearOf(today) - 1)
  if (profile !== 'none' && profile.consolidated) return { ok: false, text: 'Register účtovných závierok uvádza konsolidovanú účtovnú jednotku.', short: '' }
  const latest = profile !== 'none' ? profile.latest : null
  if (latest) {
    const recent = latest.to >= `${yearOf(today) - 2}-12`
    const isMicro = /\bMUJ\b/.test(latest.template)
    if (isMicro && recent)
      return { ok: true, text: `Posledná závierka za ${monthWord(latest.from)} až ${monthWord(latest.to)} je podaná na šablóne ${latest.template} (mikro účtovná jednotka), nie konsolidovaná.`, short: `závierka do ${monthWord(latest.to)} na ${latest.template}` }
    if (!isMicro) return { ok: false, text: `Posledná závierka za ${monthWord(latest.from)} až ${monthWord(latest.to)} je podaná na šablóne ${latest.template}, nie ako mikro účtovná jednotka.`, short: '' }
    return { ok: false, text: `Posledná podaná závierka je za obdobie do ${monthWord(latest.to)}. Novšiu register nemá, kategóriu overte ručne.`, short: '' }
  }
  if (young && founded)
    return { ok: true, text: `Firma vznikla ${textDay(founded)} a závierku ešte nepodávala: je v prvých účtovných obdobiach.`, short: `vznik ${textDay(founded)}, bez závierky` }
  return { ok: false, text: founded ? `Firma vznikla ${textDay(founded)}, ale register nemá jej závierku. Kategóriu overte ručne.` : 'Register nemá závierku ani deň vzniku firmy. Kategóriu overte ručne.', short: '' }
}

/** The review the app proposes for an open order. `team` is the number of the team's people (administrators and accountants). */
export async function reviewProposal(env: ContractBindings, order: Order, team: number, fetcher: typeof fetch = fetch, at: number = now()): Promise<ReviewProposal> {
  const today = bratislavaDay(at)
  const directors = order.directors ?? []
  const form = order.legalForm ?? 'sro'
  const acting = oneMayConclude(form, directors, order.acting) && directors.length > 0
  const actor = directors.length === 1 ? directors[0] : null
  const authority = {
    check: 'authority' as const,
    ok: acting,
    text: acting
      ? `${LEGAL_FORM_NAMES[form]}. Podľa registra právnických osôb ${actor ? `koná ${actor.name} (${signerRole(form, actor.role)}) ako jediný člen štatutárneho orgánu` : `členovia štatutárneho orgánu konajú samostatne: ${(order.acting ?? '').replace(/[.\s]+$/, '')}`}.`
      : directors.length === 0
        ? 'Register neuviedol štatutárny orgán. Overte ho v obchodnom registri.'
        : `Za firmu nekoná jeden človek sám, alebo to z registra nevieme určiť: ${(order.acting ?? 'spôsob konania register neuviedol').replace(/[.\s]+$/, '')}.`,
  }
  const profile = await ruzProfile(order.ico, fetcher)
  const established = profile === 'none' || (profile !== null && !profile.founded && !profile.latest)
    ? await lookupCompany(order.ico, fetcher).then((r) => ('found' in r && r.found ? (r.found.established ?? null) : null)).catch(() => null)
    : null
  const category = micro(profile, established, today)
  const employees = profile && profile !== 'none' ? profile.employees : null
  const plan = planById(order.plan)
  const scopeOk = category.ok && fewEmployees(employees) && Boolean(plan && PLANS.includes(plan)) && team >= 2
  const scope = {
    check: 'scope' as const,
    ok: scopeOk,
    text: !category.ok
      ? 'Rozsah posúďte spolu s kategóriou.'
      : !fewEmployees(employees)
        ? 'Register účtovných závierok uvádza desať a viac zamestnancov: rozsah posúďte individuálne.'
        : team < 2
          ? 'V tíme je zatiaľ jediný človek: chýba zástupca a nezávislá kontrola.'
          : `Balík ${plan?.name ?? order.plan} (do ${plan?.docs ?? '?'} dokladov mesačne), ${employees && EMPLOYEE_BANDS[employees] ? EMPLOYEE_BANDS[employees] : 'počet zamestnancov register neuvádza'}; mzdy, DPH a prevzatie od doterajšej účtovníčky sú v aplikácii. V tíme je ${team} ľudí.`,
  }
  const release = approvedRelease(env.CONTRACT_RELEASE, await contractCatalogueHash(), at)
  const coverOk = scopeOk && Boolean(release)
  const cover = {
    check: 'cover' as const,
    ok: coverOk,
    text: !release
      ? 'Znenie a cenník ešte nie sú schválené advokátom a poisťovňou.'
      : coverOk
        ? `Štandardný balík v rozsahu katalógu, ktorý schválil advokát a poisťovňa (platí do ${textDay(bratislavaDay(release.validUntil - 1))}).`
        : 'Krytie posúďte, keď bude jasná kategória a rozsah.',
  }
  const notes = [authority, { check: 'category' as const, ok: category.ok, text: category.text }, scope, cover]
  const ticks = { authority: authority.ok, category: category.ok, scope: scope.ok, cover: cover.ok }
  const standard = Object.values(ticks).every(Boolean)
  const who = actor ? `${actor.name} koná sám` : 'konatelia samostatne'
  const evidence = standard ? `Firmony ${textDay(today)}: RPO ${who}; RÚZ ${category.short}; ${employees && EMPLOYEE_BANDS[employees] ? EMPLOYEE_BANDS[employees] : 'zamestnanci neuvedení'}; balík ${plan?.name ?? order.plan}; katalóg schválený.`.slice(0, 240) : ''
  return { ticks, standard, evidence, notes }
}
