// The checks the app prepares for the designated person (his word of 28 October 2026: his part one click): the EU's and
// the UN's sanctions lists screened by the app (aml/sanctions-store.ts), the countries of a declaration compared with the
// lists of high-risk countries the app keeps (aml/countries.ts), and for the s. r. o. for 1 € the payment the app paired.
// A proposal is text and a preselected result in the person's own form; nothing is recorded until he records it, and
// what needs his own eyes (the qualified signature, the identity document, PEP) is not prepared; the beneficial owners
// are compared with the register's shareholders by name (kuvProposal), the shares left to the declaration.
import type { Declaration } from '../app/aml'
import { textDay } from '../app/booking'
import { formatEurExact } from '../format'
import { bratislavaClock, bratislavaDay } from '../time'
import { COUNTRY_LISTS_CHECKED_ON, COUNTRY_POLICY_VERSION, countryCodes, highRiskCountry, highRiskName, isCountryCode, monitoredCountry } from './countries'
import { declarationSubjects, sanctionProposals, type ListProposal } from './sanctions-store'
import { birthYear } from './sanctions'
import { FOUNDING_TOTAL, sameName, type Founding } from '../founding/model'
import { lookupCompany, lookupEntity, type Stakeholder } from '../rpo'

const when = (seconds: number) => `${textDay(bratislavaDay(seconds))} ${bratislavaClock(seconds)}`

export type DossierProposals = Partial<Record<'eu-sanctions' | 'un-sanctions' | 'countries' | 'kuv', ListProposal>>

/**
 * The beneficial owners a declaration names against the shareholders the register of legal entities names (rpo.ts,
 * readStakeholders). The register gives no share, so a match of every name is proposed clear with that said, and
 * anything else is left to the person with what differs: a shareholder that is a company (whose owners are looked up
 * through it), a shareholder the declaration does not name (one under a quarter is no beneficial owner), or an owner
 * the register does not name (control by other means, a trustee).
 */
export function kuvProposal(d: Declaration, stakeholders: Stakeholder[] | null, at: number = Date.now()): ListProposal {
  if (!stakeholders || stakeholders.length === 0) return { missing: 'Register právnických osôb neuvádza spoločníkov. Konečných užívateľov výhod overte v obchodnom registri alebo v registri partnerov verejného sektora.' }
  const declared = [
    ...(d.kuv === 'self' || d.kuv === 'with' ? [{ name: d.director.name, share: 'konateľ' }] : []),
    ...(d.kuv === 'self' ? [] : d.owners.filter((o) => o.name.trim()).map((o) => ({ name: o.name, share: o.share }))),
  ]
  const companies = stakeholders.filter((s) => s.kind === 'company')
  const persons = stakeholders.filter((s) => s.kind === 'person')
  const undeclared = persons.filter((s) => !declared.some((k) => sameName(k.name, s.name)))
  const unregistered = declared.filter((k) => !persons.some((s) => sameName(k.name, s.name)))
  const same = companies.length === 0 && undeclared.length === 0 && unregistered.length === 0
  const register = stakeholders.map((s) => `${s.name}${s.kind === 'company' ? ` (právnická osoba${s.ico ? `, IČO ${s.ico}` : ''})` : ''}`).join(', ')
  const source = [
    `Automatické porovnanie vo Firmony ${when(Math.floor(at / 1000))}: spoločníci podľa registra právnických osôb Štatistického úradu SR: ${register}.`,
    `Koneční užívatelia výhod podľa podpísaného vyhlásenia: ${declared.map((k) => `${k.name} (${k.share || 'podiel neuvedený'})`).join(', ') || 'žiadni'}.`,
    same
      ? 'Výsledok: mená sa zhodujú. Výšku podielov register neuvádza, vychádza sa z vyhlásenia.'
      : [
          companies.length ? `SPOLOČNÍKOM JE PRÁVNICKÁ OSOBA: konečných užívateľov výhod treba dohľadať v jej vlastníckej štruktúre.` : '',
          undeclared.length ? `V registri, ale nie vo vyhlásení: ${undeclared.map((s) => s.name).join(', ')} (overte, či ide o podiel pod 25 %).` : '',
          unregistered.length ? `Vo vyhlásení, ale nie medzi spoločníkmi v registri: ${unregistered.map((k) => k.name).join(', ')} (overte, čím firmu ovláda).` : '',
        ].filter(Boolean).join(' '),
  ].join(' ')
  return { proposal: { result: same ? 'clear' : '', source: source.slice(0, 2000) } }
}

/** The shareholders of a company by its IČO, from the register; null when it does not answer or names none. */
export async function registerShareholders(ico: string | null, fetcher: typeof fetch = fetch): Promise<Stakeholder[] | null> {
  if (!ico || !/^\d{8}$/.test(ico)) return null
  const found = await lookupCompany(ico, fetcher)
  const rpoId = 'found' in found && found.found ? found.found.rpoId : null
  if (!rpoId) return null
  return (await lookupEntity(rpoId, fetcher))?.stakeholders ?? null
}

/** The countries of a declaration against the lists of high-risk countries: every code it holds, and its free text. */
export function countriesProposal(d: Declaration, at: number = Date.now()): ListProposal {
  const persons = [d.director, ...d.owners]
  if (persons.some((p) => !p.citizenships || !p.residenceCountry) || !d.businessCountries)
    return { missing: 'Vyhlásenie je v staršom tvare bez kódov krajín pri každej osobe. Kontrolu urobte ručne.' }
  const fields = [d.businessCountries, d.partnerCountries ?? '', ...persons.flatMap((p) => [p.citizenships ?? '', p.residenceCountry ?? ''])]
  const codes = [...new Set(fields.flatMap(countryCodes))].filter(isCountryCode).sort()
  const high = codes.filter(highRiskCountry)
  const monitored = codes.filter(monitoredCountry)
  const text = [d.abroad ? d.abroadWhere : '', ...persons.map((p) => p.nationality)].filter((t) => t && t.trim())
  const highText = text.filter(highRiskName)
  const source = [
    `Automatické porovnanie vo Firmony ${when(Math.floor(at / 1000))}: krajiny z podpísaného vyhlásenia (štátne občianstvo a pobyt každej osoby, miesto činnosti, obchodní partneri): ${codes.join(', ') || 'žiadne'}.`,
    d.abroad && d.abroadWhere ? `Partneri mimo EÚ podľa vyhlásenia: ${d.abroadWhere}.` : 'Partneri mimo EÚ podľa vyhlásenia: nie.',
    `Porovnané so zoznamom vysokorizikových tretích krajín EÚ (delegované nariadenie 2016/1675) a s výzvou FATF, pravidlá vo verzii ${COUNTRY_POLICY_VERSION}, zoznamy overené ${textDay(COUNTRY_LISTS_CHECKED_ON)}.`,
    `Vysokorizikové: ${high.length || highText.length ? [...high, ...highText].join(', ') : 'žiadne'}. Pod zvýšeným monitorovaním FATF: ${monitored.length ? monitored.join(', ') : 'žiadne'}.`,
  ].join(' ')
  return { proposal: { result: high.length || highText.length ? 'high' : 'clear', source: source.slice(0, 2000) } }
}

/** What the app prepares for a dossier: both sanctions lists, the countries and the beneficial owners against the register. */
export async function dossierProposals(env: { DB: D1Database; FILES?: R2Bucket }, d: Declaration, company: string | null, at: number = Date.now(), ico: string | null = null, fetcher: typeof fetch = fetch): Promise<DossierProposals> {
  const [lists, shareholders] = await Promise.all([sanctionProposals(env, declarationSubjects(d, company), at), registerShareholders(ico, fetcher).catch(() => null)])
  return { 'eu-sanctions': lists.eu, 'un-sanctions': lists.un, countries: countriesProposal(d, at), kuv: kuvProposal(d, shareholders, at) }
}

export type FoundingProposals = Partial<Record<'sanctions' | 'payment', ListProposal>>

/** What the app prepares for an application of the s. r. o. for 1 €: the founder on both lists, and the payment. */
export async function foundingProposals(env: { DB: D1Database; FILES?: R2Bucket }, f: Founding, at: number = Date.now()): Promise<FoundingProposals> {
  const out: FoundingProposals = {}
  const founder = f.founder
  if (!founder) return out
  const lists = await sanctionProposals(env, [{ role: 'zakladateľ', name: founder.name, kind: 'p', year: birthYear(founder.born, founder.birthNumber) }], at)
  if ('missing' in lists.eu || 'missing' in lists.un)
    out.sanctions = { missing: ['missing' in lists.eu ? `EÚ: ${lists.eu.missing}` : '', 'missing' in lists.un ? `OSN: ${lists.un.missing}` : ''].filter(Boolean).join(' ') }
  else
    out.sanctions = {
      proposal: { result: lists.eu.proposal.result === 'clear' && lists.un.proposal.result === 'clear' ? 'clear' : '', source: `${lists.eu.proposal.source} ${lists.un.proposal.source}`.slice(0, 2000) },
    }
  if (!f.paidAt || (f.paidCents ?? 0) < FOUNDING_TOTAL) out.payment = { missing: 'Platba v plnej výške zatiaľ neprišla.' }
  else {
    const same = Boolean(f.payerName && sameName(f.payerName, founder.name))
    out.payment = {
      proposal: {
        result: same ? 'clear' : '',
        source: `Automatické spárovanie vo Firmony: platba ${formatEurExact(f.paidCents ?? 0).replace(/ /g, ' ')} s variabilným symbolom ${f.vs} prišla ${textDay(bratislavaDay(f.paidAt))} z účtu ${f.payerIban ?? 'bez uvedeného účtu'} na meno ${f.payerName ?? 'bez mena'}. ${same ? `Meno platiteľa sa zhoduje so zakladateľom ${founder.name} (bez diakritiky, v ľubovoľnom poradí slov).` : `MENO PLATITEĽA SA NEZHODUJE so zakladateľom ${founder.name}: overte, či ide o jeho vlastný účet.`}`,
      },
    }
  }
  return out
}
