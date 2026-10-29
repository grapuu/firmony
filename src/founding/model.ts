// The s. r. o. for 1 €: what a founder's application holds and when it may move on (his word of 28 October 2026, the
// founder must not be able to have the company formed at our cost and go silent). Nothing is ordered from the advocate
// before every step below is done and the designated person has checked it; the rules are the contract's
// (src/content/formation-contract.ts).
import { birthDateOf, birthNumberValid } from '../app/aml'
import { dayOfText } from '../app/booking'
import { FORMATION, planById, type PlanId } from '../config'

export type FoundingStatus = 'open' | 'verifying' | 'verified' | 'refused' | 'lapsed' | 'ordered' | 'signing' | 'filed' | 'registered' | 'withdrawn' | 'cancelled'

/** The founder as the application gives him (birth number and document number seen by the designated person alone). */
export interface Founder {
  name: string
  birthNumber: string
  born: string
  address: string
  nationality: string
  idKind: 'op' | 'pas'
  idNumber: string
  idValid: string
  pep: boolean
  /** Where the money for the capital comes from, in the founder's words. */
  funds: string
  /** The company's expected yearly turnover (the AML declaration's bands), cash over 10 000 € at once, partners outside
   *  the EU and where: what the designated person weighs for the risk (program 4.1). */
  turnover: Turnover
  cash: boolean
  abroad: string
}

export const TURNOVERS = ['do-50', '50-200', '200-1000', 'nad-1000'] as const
export type Turnover = (typeof TURNOVERS)[number]

/** The company to be formed: one founder, who is also its managing director, and a capital paid in money. */
export interface PlannedCompany {
  name: string
  altName: string
  seat: string
  seatBasis: 'own' | 'rent' | 'virtual'
  activities: string[]
  capitalCents: number
}

export interface Founding {
  id: string
  createdAt: number
  expiresAt: number
  email: string
  phone: string | null
  plan: PlanId
  /** The campaign tags it came with (utm_*, ref), for the referral. */
  source: Record<string, string> | null
  status: FoundingStatus
  founder: Founder | null
  company: PlannedCompany | null
  dataAt: number | null
  idFrontKey: string | null
  idBackKey: string | null
  idAt: number | null
  contractVersion: string | null
  contractText: string | null
  contractHash: string | null
  signedKey: string | null
  signedKind: 'qes' | 'paper' | null
  signedHash: string | null
  signedContractHash: string | null
  signedAt: number | null
  originalAt: number | null
  vs: string
  paymentId: string | null
  paidCents: number | null
  paidAt: number | null
  payerName: string | null
  payerIban: string | null
  month: string | null
  calls: number
  calledAt: number | null
  ico: string | null
  companyId: string | null
  approvedAt: number | null
  /** Whether a contract ended early owes the exit fee: our own decision, or null for the rule (the company's notice). */
  exitDecision: 'charge' | 'waive' | null
  rev: number
  updatedAt: number
  purgeStartedAt: number | null
}

const str = (v: unknown) => (typeof v === 'string' ? v : null)
const num = (v: unknown) => (typeof v === 'number' ? v : v === null || v === undefined ? null : Number(v))
const json = <T>(v: unknown): T | null => {
  if (typeof v !== 'string') return null
  try {
    return JSON.parse(v) as T
  } catch {
    return null
  }
}

export function foundingOf(r: Record<string, unknown>): Founding {
  return {
    id: String(r.id),
    createdAt: Number(r.created_at),
    expiresAt: Number(r.expires_at),
    email: String(r.email),
    phone: str(r.phone),
    plan: (planById(String(r.plan))?.id ?? 'start') as PlanId,
    source: json<Record<string, string>>(r.source),
    status: String(r.status) as FoundingStatus,
    founder: json<Founder>(r.founder),
    company: json<PlannedCompany>(r.company),
    dataAt: num(r.data_at),
    idFrontKey: str(r.id_front_key),
    idBackKey: str(r.id_back_key),
    idAt: num(r.id_at),
    contractVersion: str(r.contract_version),
    contractText: str(r.contract_text),
    contractHash: str(r.contract_hash),
    signedKey: str(r.signed_key),
    signedKind: (str(r.signed_kind) as 'qes' | 'paper' | null) ?? null,
    signedHash: str(r.signed_hash),
    signedContractHash: str(r.signed_contract_hash),
    signedAt: num(r.signed_at),
    originalAt: num(r.original_at),
    vs: String(r.vs),
    paymentId: str(r.payment_id),
    paidCents: num(r.paid_cents),
    paidAt: num(r.paid_at),
    payerName: str(r.payer_name),
    payerIban: str(r.payer_iban),
    month: str(r.month),
    calls: Number(r.calls ?? 0),
    calledAt: num(r.called_at),
    ico: str(r.ico),
    companyId: str(r.company_id),
    approvedAt: num(r.approved_at),
    exitDecision: r.exit_decision === 'charge' || r.exit_decision === 'waive' ? r.exit_decision : null,
    rev: Number(r.rev ?? 0),
    updatedAt: Number(r.updated_at),
    purgeStartedAt: num(r.purge_started_at),
  }
}

/** The amount the founder pays before anything is ordered: the formation and the prepayment. */
export const FOUNDING_TOTAL = FORMATION.priceCents + FORMATION.prepaidCents

/** The founder's steps, in their order, and whether each is done. A signature counts only for the contract as it is. */
export function stepsOf(f: Founding) {
  const data = Boolean(f.founder && f.company)
  const id = Boolean(f.idFrontKey && f.idBackKey)
  const signed = Boolean(f.signedKey && f.contractHash && f.signedContractHash === f.contractHash)
  const paid = (f.paidCents ?? 0) >= FOUNDING_TOTAL
  return { data, id, signed, paid, all: data && id && signed && paid }
}

/** Whether the founder may still change the application: until it is signed and handed to us. */
export const editable = (f: Founding) => f.status === 'open'

/**
 * The designated person's checks that all have to be clear before the advocate is ordered; the original only on paper.
 * 'debts' is his word of 28 October 2026 (we must not be at a loss): the founder looked up in the public lists of
 * debtors of the Social Insurance Agency, the health insurers and the Financial Administration and in the register of
 * insolvent persons before a formation is paid for.
 */
export const CHECK_KINDS = ['identity', 'pep', 'sanctions', 'debts', 'signature', 'payment', 'original'] as const
export type CheckKind = (typeof CHECK_KINDS)[number]
export const checksNeeded = (f: Founding): CheckKind[] => CHECK_KINDS.filter((k) => k !== 'original' || f.signedKind === 'paper')

/**
 * How the founder's identity may be verified (AML Act 297/2008 § 8 ods. 1; program 4.2a b), 29 October 2026): by the
 * qualified electronic signature on the contract (písm. f), which counts as physical presence) or in person with the
 * identity document (písm. a)). A paper signature, certified or not, and a photo of the document are no verification,
 * so a founder who signed on paper is always verified in person.
 */
export const IDENTITY_WAYS = ['qes', 'person'] as const
export type IdentityWay = (typeof IDENTITY_WAYS)[number]
export const identityWaysOf = (f: Pick<Founding, 'signedKind'>): IdentityWay[] => (f.signedKind === 'qes' ? ['qes', 'person'] : ['person'])
/** What a clear identity check says first: the way, with its provision. */
export const IDENTITY_NOTE: Record<IdentityWay, string> = {
  qes: 'Overené kvalifikovaným elektronickým podpisom zakladateľa na zmluve (§ 8 ods. 1 písm. f) zákona č. 297/2008 Z. z.).',
  person: 'Overené za fyzickej prítomnosti zakladateľa s jeho dokladom totožnosti (§ 8 ods. 1 písm. a) zákona č. 297/2008 Z. z.).',
}
/**
 * Whether a recorded identity check stands for the signature the application has now: clear, by a way that signature
 * allows. One made by the signature before the founder signed again on paper does not.
 */
export const identityStands = (f: Pick<Founding, 'signedKind'>, check: { result: string; note: string } | undefined): boolean =>
  Boolean(check && check.result === 'clear' && identityWaysOf(f).some((w) => check.note.startsWith(IDENTITY_NOTE[w])))

/** Where an application may go from where it is, and who moves it: the founder hands it over, the team does the rest. */
export const MOVES: Record<FoundingStatus, readonly FoundingStatus[]> = {
  open: ['verifying', 'lapsed', 'cancelled'],
  verifying: ['verified', 'refused', 'open'],
  verified: ['ordered', 'withdrawn', 'cancelled'],
  ordered: ['signing', 'withdrawn', 'cancelled'],
  signing: ['filed', 'withdrawn', 'cancelled'],
  filed: ['registered', 'signing', 'withdrawn', 'cancelled'],
  registered: [],
  refused: [],
  lapsed: [],
  withdrawn: [],
  cancelled: [],
}
export const mayMove = (from: FoundingStatus, to: FoundingStatus) => MOVES[from].includes(to)

/** Applications that are over: nothing more happens to them. */
export const FINAL: readonly FoundingStatus[] = ['registered', 'refused', 'lapsed', 'withdrawn', 'cancelled']

/**
 * The payment's variable symbol: 7, the year and an order of five digits, ten digits in all. Invoices use the year and
 * their order (eight digits) and requests for an advance 9, so no symbol of europio's meets another.
 */
export const foundingVs = (year: number, order: number) => `7${year}${String(order).padStart(5, '0')}`

/** A name compared the way a bank writes it: no accents, no case, no punctuation, the words in any order. */
export function sameName(a: string, b: string): boolean {
  const words = (s: string) =>
    s
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .toLowerCase()
      .replace(/[^a-z0-9 ]+/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 1 && !['ing', 'mgr', 'bc', 'phd', 'mudr', 'judr', 'rndr', 'doc', 'prof', 'mba'].includes(w))
      .sort()
      .join(' ')
  const x = words(a)
  const y = words(b)
  return x !== '' && (x === y || x.includes(y) || y.includes(x))
}

/** The day of birth a Slovak birth number says (a woman's month is 50 more, a later number's 20 or 70 more). */
export function bornOfNumber(rc: string): string {
  const d = rc.replace(/[\s/]/g, '')
  let month = Number(d.slice(2, 4))
  if (month > 70) month -= 70
  else if (month > 50) month -= 50
  else if (month > 20) month -= 20
  const yy = Number(d.slice(0, 2))
  const year = d.length === 9 || yy >= 54 ? 1900 + yy : 2000 + yy
  return `${year}-${String(month).padStart(2, '0')}-${d.slice(4, 6)}`
}

/**
 * What the designated person should weigh first, from the application alone: a politically exposed person, cash, partners
 * outside the EU. The level itself is the person's decision (program 4.1).
 */
export function riskHints(f: Founder): string[] {
  const out: string[] = []
  if (f.pep) out.push('Politicky exponovaná osoba: zvýšené riziko, súhlas určenej osoby.')
  if (f.cash) out.push('Hotovosť nad 10 000 € naraz.')
  if (f.abroad.trim()) out.push(`Partneri mimo EÚ: ${f.abroad}`)
  if (f.turnover === 'nad-1000' || f.turnover === '200-1000') out.push('Vysoký očakávaný obrat pri novej firme.')
  return out
}

export type FoundingErrors = Partial<Record<string, string>>
export type FoundingValues = Record<string, string>

const field = (body: Record<string, unknown>, name: string, max: number) => (typeof body[name] === 'string' ? (body[name] as string).replace(/\s+/g, ' ').trim().slice(0, max) : '')

/** The form's fields as text, for showing it again. */
export function valuesFrom(body: Record<string, unknown>): FoundingValues {
  const out: FoundingValues = {}
  for (const name of ['meno', 'rc', 'narodeny', 'adresa', 'obcianstvo', 'doklad', 'cislo', 'platnost', 'pep', 'zdroj', 'obrat', 'hotovost', 'zahranicie', 'vlastne', 'firma', 'firma2', 'sidlo', 'sidlo_typ', 'cinnosti', 'imanie', 'telefon'])
    out[name] = name === 'cinnosti' ? (typeof body[name] === 'string' ? (body[name] as string).slice(0, 2000) : '') : field(body, name, 300)
  return out
}

/** The application's data as the form shows them, for a change (the birth number and document number typed again). */
export function valuesOf(f: Founding): FoundingValues {
  const p = f.founder
  const c = f.company
  const day = (d: string) => (d ? `${Number(d.slice(8, 10))}. ${Number(d.slice(5, 7))}. ${d.slice(0, 4)}` : '')
  return {
    meno: p?.name ?? '',
    rc: '',
    narodeny: p ? day(p.born) : '',
    adresa: p?.address ?? '',
    obcianstvo: p?.nationality ?? 'slovenské',
    doklad: p?.idKind ?? 'op',
    cislo: '',
    platnost: p ? day(p.idValid) : '',
    pep: p ? (p.pep ? 'ano' : 'nie') : '',
    zdroj: p?.funds ?? '',
    obrat: p?.turnover ?? '',
    hotovost: p ? (p.cash ? 'ano' : 'nie') : '',
    zahranicie: p?.abroad ?? '',
    vlastne: p ? 'ano' : '',
    firma: c?.name ?? '',
    firma2: c?.altName ?? '',
    sidlo: c?.seat ?? '',
    sidlo_typ: c?.seatBasis ?? '',
    cinnosti: c?.activities.join('\n') ?? '',
    imanie: c ? String(c.capitalCents / 100) : '5000',
    telefon: f.phone ?? '',
  }
}

/**
 * The founder's and the company's data from the form, or why not. A Slovak birth number is checked by its rules; the
 * founder is at least eighteen (a managing director has full capacity); the document is valid; the company's name
 * carries its form; the capital is at least 5 000 € (§ 108 ods. 1 of the Commercial Code).
 */
export function checkFounding(v: FoundingValues, today: string): { founder: Founder; company: PlannedCompany; errors: FoundingErrors } | { errors: FoundingErrors } {
  const errors: FoundingErrors = {}
  const name = v.meno ?? ''
  if (name.split(' ').length < 2 || name.length < 5) errors.meno = 'Napíšte meno a priezvisko ako v občianskom preukaze.'
  const rc = (v.rc ?? '').replace(/[\s/]/g, '')
  const slovak = /sloven/i.test(v.obcianstvo ?? '')
  if (slovak && !birthNumberValid(rc)) errors.rc = 'Rodné číslo nesedí. Skontrolujte ho, prosím.'
  if (!slovak && rc && !birthNumberValid(rc)) errors.rc = 'Rodné číslo nesedí. Ak ho nemáte, nechajte pole prázdne.'
  const born = birthDateOf(v.narodeny ?? '', today, 18)
  if (!born) errors.narodeny = 'Dátum narodenia napíšte ako 7. 3. 1994. Konateľ musí mať aspoň 18 rokov.'
  if ((v.adresa ?? '').length < 10) errors.adresa = 'Napíšte celú adresu trvalého pobytu.'
  if ((v.obcianstvo ?? '').length < 3) errors.obcianstvo = 'Napíšte štátne občianstvo.'
  const idKind = v.doklad === 'pas' ? 'pas' : v.doklad === 'op' ? 'op' : null
  if (!idKind) errors.doklad = 'Vyberte doklad.'
  const idNumber = (v.cislo ?? '').replace(/\s/g, '').toUpperCase()
  if (!/^[A-Z0-9]{6,12}$/.test(idNumber)) errors.cislo = 'Napíšte číslo dokladu, ako je na ňom.'
  const idValid = dayOfText(v.platnost ?? '', Number(today.slice(0, 4)))
  if (!idValid || idValid < today) errors.platnost = 'Napíšte, dokedy je doklad platný. Doklad musí byť platný.'
  if (v.pep !== 'ano' && v.pep !== 'nie') errors.pep = 'Vyberte jednu z možností.'
  if (born && birthNumberValid(rc) && bornOfNumber(rc) !== born) errors.narodeny = 'Dátum narodenia nesedí s rodným číslom.'
  const turnover = (TURNOVERS as readonly string[]).includes(v.obrat ?? '') ? (v.obrat as Turnover) : null
  if (!turnover) errors.obrat = 'Vyberte jednu z možností.'
  if (v.hotovost !== 'ano' && v.hotovost !== 'nie') errors.hotovost = 'Vyberte jednu z možností.'
  // The offer is for a founder who forms the company for himself (§ 10 ods. 1 písm. f) of Act No. 297/2008 Z. z.).
  if (v.vlastne !== 'ano') errors.vlastne = 'S. r. o. za 1 € zakladáme iba zakladateľovi, ktorý koná vo vlastnom mene. Inak nám napíšte.'
  if ((v.zdroj ?? '').length < 3) errors.zdroj = 'Napíšte, odkiaľ sú peniaze na základné imanie (napríklad úspory zo zamestnania).'
  const company = v.firma ?? ''
  if (!/(s\.\s?r\.\s?o\.|spol\.\s?s\s?r\.\s?o\.|spoločnosť s ručením obmedzeným)\s*$/i.test(company) || company.length < 8)
    errors.firma = 'Obchodné meno musí končiť označením „s. r. o.“, napríklad „Nova Studio s. r. o.“.'
  if ((v.sidlo ?? '').length < 10) errors.sidlo = 'Napíšte celú adresu sídla.'
  const seatBasis = v.sidlo_typ === 'own' || v.sidlo_typ === 'rent' || v.sidlo_typ === 'virtual' ? v.sidlo_typ : null
  if (!seatBasis) errors.sidlo_typ = 'Vyberte, na akom základe bude sídlo.'
  const activities = (v.cinnosti ?? '')
    .split(/\n|;/)
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, 12)
  if (activities.length === 0) errors.cinnosti = 'Napíšte aspoň jednu činnosť (voľnú živnosť), každú na nový riadok.'
  const capital = Number((v.imanie ?? '').replace(/\s/g, '').replace(',', '.'))
  if (!Number.isFinite(capital) || capital < 5000 || capital > 10_000_000) errors.imanie = 'Základné imanie je najmenej 5 000 €.'
  if (v.telefon && !/^\+?[0-9 ]{9,16}$/.test(v.telefon)) errors.telefon = 'Napíšte telefón v tvare +421 900 000 000.'
  if (Object.keys(errors).length > 0 || !born || !idKind || !idValid || !seatBasis || !turnover) return { errors }
  return {
    errors,
    founder: { name, birthNumber: rc, born, address: v.adresa ?? '', nationality: v.obcianstvo ?? '', idKind, idNumber, idValid, pep: v.pep === 'ano', funds: v.zdroj ?? '', turnover, cash: v.hotovost === 'ano', abroad: (v.zahranicie ?? '').slice(0, 300) },
    company: { name: company, altName: v.firma2 ?? '', seat: v.sidlo ?? '', seatBasis, activities, capitalCents: Math.round(capital * 100) },
  }
}
