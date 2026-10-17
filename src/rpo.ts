// The only file that asks the Register of Legal Entities (Register právnických osôb, run by the Statistical Office
// of the Slovak Republic). Its data are public under CC BY 4.0, which is why the page that shows them names the source.
//
// GET https://api.statistics.sk/rpo/v1/search?identifier=<IČO> answers {"results": [...]}, each result with lists of
// values over time (identifiers, fullNames, addresses, legalForms), every value with validFrom and, once replaced,
// validTo. Seen on 12 October 2026 for europio s. r. o. (test/fixtures/rpo-europio.json).

export const RPO_SEARCH = 'https://api.statistics.sk/rpo/v1/search'

export interface Company {
  ico: string
  name: string
  address: string
  /** The register's own id of the entity, which its detail is asked by (the directors). */
  rpoId: string | null
  /** Where the company is registered, as a contract names it: "Obchodný register Mestského súdu Košice, oddiel
   * Sro, vložka č. 64897/V". */
  registerLine: string | null
  /** The register's word for the legal form, when it gives one. */
  legalForm: string | null
  /** The legal forms we take online (by the register's code, else by the name): s. r. o., a. s., j. s. a. */
  form: LegalForm | null
  isSro: boolean
  /** The day the company ceased to exist, when it did. */
  terminated: string | null
}

interface Dated {
  validFrom?: string
  validTo?: string
}

interface RpoAddress extends Dated {
  street?: string
  regNumber?: number
  buildingNumber?: string
  postalCodes?: string[]
  municipality?: { value?: string }
  country?: { value?: string }
}

interface RpoResult {
  id?: number | string
  identifiers?: ({ value?: string } & Dated)[]
  fullNames?: ({ value?: string } & Dated)[]
  addresses?: RpoAddress[]
  legalForms?: ({ value?: { value?: string; code?: string } } & Dated)[]
  termination?: string
  sourceRegister?: {
    value?: { value?: string }
    registrationOffices?: ({ value?: string } & Dated)[]
    registrationNumbers?: ({ value?: string } & Dated)[]
  }
}

/** Of values over time, the one in force now: without an end, the latest start first. */
function current<T extends Dated>(list: T[] | undefined): T | undefined {
  if (!list || list.length === 0) return undefined
  const open = list.filter((item) => !item.validTo)
  const pool = open.length > 0 ? open : list
  return [...pool].sort((a, b) => (b.validFrom ?? '').localeCompare(a.validFrom ?? ''))[0]
}

function formatPostal(code: string | undefined): string {
  if (!code) return ''
  const digits = code.replace(/\s/g, '')
  return /^\d{5}$/.test(digits) ? `${digits.slice(0, 3)} ${digits.slice(3)}` : code
}

export function formatAddress(address: RpoAddress | undefined): string {
  if (!address) return ''
  const number = address.buildingNumber || (address.regNumber && address.regNumber > 0 ? String(address.regNumber) : '')
  const municipality = address.municipality?.value ?? ''
  const street = address.street ? `${address.street} ${number}`.trim() : `${municipality} ${number}`.trim()
  const city = `${formatPostal(address.postalCodes?.[0])} ${municipality}`.trim()
  return [street, address.street ? city : formatPostal(address.postalCodes?.[0])].filter(Boolean).join(', ')
}

/**
 * "Obchodný register", "Mestský súd Košice" and "Sro/64897/V" as a contract writes them: "Obchodný register
 * Mestského súdu Košice, oddiel Sro, vložka č. 64897/V". Null when the register names no court or number.
 */
export function registerLineOf(source: RpoResult['sourceRegister']): string | null {
  const office = current(source?.registrationOffices)?.value?.trim()
  const number = current(source?.registrationNumbers)?.value?.trim()
  if (!office || !number) return null
  const court = office.replace(/^Mestský súd\b/, 'Mestského súdu').replace(/^Okresný súd\b/, 'Okresného súdu')
  const entry = /^([A-Za-z]+)\/(\d+)\/([A-Za-z])$/.exec(number)
  const register = source?.value?.value?.trim() || 'Obchodný register'
  return entry ? `${register} ${court}, oddiel ${entry[1]}, vložka č. ${entry[2]}/${entry[3]}` : `${register}, ${office}, ${number}`
}

const SRO = /\bs\.\s*r\.\s*o\.|\bspol\.\s*s\s*r\.\s*o\.|\bs\.r\.o\b/i
const AS = /\ba\.\s*s\.(?!\s*r)|akciová spoločnosť/i
const JSA = /\bj\.\s*s\.\s*a\.|jednoduchá spoločnosť na akcie/i

/**
 * The legal forms a contract is concluded online with, by the code of the register's list of legal forms (CL000056,
 * seen on 17 October 2026: 112 Spoločnosť s ručením obmedzeným, 121 Akciová spoločnosť, 125 Jednoduchá spoločnosť na
 * akcie). Their statutory body is the director (konateľ) of an s. r. o. or the board of directors (predstavenstvo).
 */
export type LegalForm = 'sro' | 'as' | 'jsa'
export const LEGAL_FORM_CODES: Readonly<Record<LegalForm, string>> = { sro: '112', as: '121', jsa: '125' }
export const LEGAL_FORM_NAMES: Readonly<Record<LegalForm, string>> = { sro: 'Spoločnosť s ručením obmedzeným', as: 'Akciová spoločnosť', jsa: 'Jednoduchá spoločnosť na akcie' }
/** The signer's role as a paper names it after their name: the register's word in small letters, else the form's usual one. */
export function signerRole(form: LegalForm | null | undefined, role: string | null | undefined): string {
  const word = (role ?? '').trim()
  if (word) return word.charAt(0).toLowerCase() + word.slice(1)
  return form === 'as' || form === 'jsa' ? 'člen predstavenstva' : 'konateľ'
}
export const isLegalForm = (value: unknown): value is LegalForm => value === 'sro' || value === 'as' || value === 'jsa'

/** A legal form from the register's code, else from its word or the company's name; null for any other form. */
export function legalFormOf(code: string | null | undefined, word: string | null | undefined, name: string | null | undefined): LegalForm | null {
  const known = (Object.entries(LEGAL_FORM_CODES) as [LegalForm, string][]).find(([, c]) => c === code)
  if (known) return known[0]
  if (code) return null
  const text = `${word ?? ''} ${name ?? ''}`
  if (/ručením obmedzeným/i.test(word ?? '') || SRO.test(name ?? '')) return 'sro'
  if (JSA.test(text)) return 'jsa'
  if (AS.test(text)) return 'as'
  return null
}

/** The company the register knows under this IČO, read from its answer; null when it knows none. */
export function readCompany(ico: string, answer: unknown): Company | null {
  const results = (answer as { results?: RpoResult[] } | null)?.results
  if (!Array.isArray(results) || results.length === 0) return null
  const matching = results.filter((result) => result.identifiers?.some((id) => id.value === ico))
  const pool = matching.length > 0 ? matching : results
  const alive = pool.filter((result) => !result.termination)
  const result = (alive.length > 0 ? alive : pool)[0]
  if (!result) return null
  const name = current(result.fullNames)?.value?.trim()
  if (!name) return null
  const form = current(result.legalForms)?.value
  const legalForm = form?.value?.trim() || null
  return {
    ico,
    name,
    address: formatAddress(current(result.addresses)),
    rpoId: result.id === undefined || result.id === null ? null : String(result.id),
    registerLine: registerLineOf(result.sourceRegister),
    legalForm,
    form: legalFormOf(form?.code, legalForm, name),
    isSro: legalFormOf(form?.code, legalForm, name) === 'sro',
    terminated: result.termination ?? null,
  }
}

export type Lookup = { found: Company } | { found: null } | { failed: true }

/** Asks the register. A register that does not answer within four seconds is a failure, not "unknown". */
export async function lookupCompany(ico: string, fetcher: typeof fetch = fetch): Promise<Lookup> {
  try {
    const res = await fetcher(`${RPO_SEARCH}?identifier=${encodeURIComponent(ico)}`, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(4000),
    })
    if (res.status === 404) return { found: null }
    if (!res.ok) return { failed: true }
    return { found: readCompany(ico, await res.json()) }
  } catch {
    return { failed: true }
  }
}

/** A member of the statutory body as the register names one: "Christian Juhás", "Konateľ" or "Predseda predstavenstva". */
export interface Director {
  name: string
  role: string
}

interface RpoPerson extends Dated {
  stakeholderType?: { value?: string; code?: string }
  statutoryBodyMember?: { value?: string; code?: string }
  personName?: { formatedName?: string; givenNames?: string[]; familyNames?: string[] }
  fullName?: string
}

/** The statutory bodies of the forms we take (CL010113): 3 a director (konateľ), 99 the board of directors (predstavenstvo). */
const STATUTORY = new Set(['3', '99'])

/**
 * The members of the statutory body in office, read from the register's detail of an entity (GET .../rpo/v1/entity/<id>,
 * seen on 13 and 17 October 2026: `statutoryBodies`, each with `stakeholderType` "Konateľ" (3) or "Predstavenstvo"
 * (99), a board member's `statutoryBodyMember` "Predseda predstavenstva", "Podpredseda predstavenstva" or "Člen
 * predstavenstva", and `personName.formatedName`). One that has ended (`validTo` in the past) is left out; so is any
 * other body when the statutory one is named.
 */
export function readDirectors(answer: unknown, today: string = new Date().toISOString().slice(0, 10)): Director[] {
  const bodies = (answer as { statutoryBodies?: RpoPerson[] } | null)?.statutoryBodies
  if (!Array.isArray(bodies)) return []
  const current = bodies.filter((b) => !(b.validTo && b.validTo.slice(0, 10) < today))
  const statutory = current.filter((b) => STATUTORY.has(b.stakeholderType?.code ?? '') || /konate|predstavenstv/i.test(b.stakeholderType?.value ?? ''))
  const out: Director[] = []
  for (const body of statutory.length > 0 ? statutory : current) {
    const person = body.personName
    const joined = [...(person?.givenNames ?? []), ...(person?.familyNames ?? [])].join(' ')
    const name = (person?.formatedName || joined || body.fullName || '').replace(/\s+/g, ' ').trim()
    if (name.length < 2 || out.some((d) => d.name === name)) continue
    const type = body.stakeholderType?.value?.trim() || ''
    const member = body.statutoryBodyMember?.value?.trim() || ''
    out.push({ name, role: member || (/predstavenstv/i.test(type) ? 'Člen predstavenstva' : type || 'Konateľ') })
  }
  return out
}

/**
 * How the statutory body acts for the company (spôsob konania), as the register writes it in `authorizations`: the
 * entries in force that are not about a proxy (prokúra), joined.
 */
export function readActing(answer: unknown, today: string = new Date().toISOString().slice(0, 10)): string | null {
  const list = (answer as { authorizations?: ({ value?: string } & Dated)[] } | null)?.authorizations
  if (!Array.isArray(list)) return null
  const texts = list
    .filter((a) => !(a.validTo && a.validTo.slice(0, 10) < today))
    .map((a) => (a.value ?? '').replace(/\s+/g, ' ').trim())
    .filter((v) => v.length > 0 && !/prok[uú]r/i.test(v))
  return texts.length > 0 ? texts.join(' ') : null
}

export type ActingMode = 'alone' | 'joint' | 'unknown'

/**
 * Whether one member may conclude the contract alone: by the register's words, "samostatne" (alone) without anything
 * that asks for more than one ("spoločne", "dvaja", "obaja", "oboch", "aspoň", "najmenej", "všetci", "spolu s"),
 * without a limit of an amount (above which more may sign) and without naming one office (the chairman alone, which
 * says nothing of the other members). A text that says both or neither is for a person to read, and the contract is
 * concluded on paper.
 */
export function actingMode(text: string | null | undefined): ActingMode {
  if (!text) return 'unknown'
  const t = text.toLowerCase()
  const joint = /spoločne|spolu s|\bdvaja\b|\bdvoch\b|\btraja\b|\btroch\b|\boba\b|\bobaja\b|\bobidvaja\b|\bobidva\b|\boboch\b|\bobidvoch\b|\bobe\b|aspoň|najmenej|všetci/.test(t)
  const alone = /samostatn/.test(t)
  // "samostatne" of one office, or up to an amount: whether a given member may act alone is not said.
  const narrowed = /predsed|podpredsed|riaditeľ|\beur\b|€|\bsum[auy]\b|\bnad\s+\d|do\s+výšky|hodnot/.test(t)
  if (alone && !joint && !narrowed) return 'alone'
  return joint && !alone ? 'joint' : 'unknown'
}

/** Whether a contract may be concluded online by one member: the only member in office, or one who acts alone. */
export function oneMayConclude(form: LegalForm | null, directors: readonly Director[] | null, acting: string | null): boolean {
  if (directors === null || directors.length === 0) return form === 'sro' || form === null
  if (directors.length === 1) return true
  return actingMode(acting) === 'alone'
}

export const RPO_ENTITY = 'https://api.statistics.sk/rpo/v1/entity'

/** What the detail of an entity says: its statutory body, its legal form and how the body acts. */
export interface Entity {
  directors: Director[]
  form: LegalForm | null
  formCode: string | null
  acting: string | null
}

export function readEntity(answer: unknown, today?: string): Entity {
  const forms = (answer as { legalForms?: ({ value?: { value?: string; code?: string } } & Dated)[] } | null)?.legalForms
  const form = current(Array.isArray(forms) ? forms : undefined)?.value
  const names = (answer as { fullNames?: ({ value?: string } & Dated)[] } | null)?.fullNames
  const name = current(Array.isArray(names) ? names : undefined)?.value ?? null
  return { directors: readDirectors(answer, today), form: legalFormOf(form?.code, form?.value, name), formCode: form?.code ?? null, acting: readActing(answer, today) }
}

/** The detail of an entity, or null when the register does not answer within four seconds. */
export async function lookupEntity(rpoId: string, fetcher: typeof fetch = fetch): Promise<Entity | null> {
  if (!/^\d{1,12}$/.test(rpoId)) return null
  try {
    const res = await fetcher(`${RPO_ENTITY}/${rpoId}?showHistoricalData=false&showOrganizationUnits=false`, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(4000),
    })
    if (!res.ok) return null
    return readEntity(await res.json())
  } catch {
    return null
  }
}

/** The directors of an entity, or null when the register does not answer within four seconds. */
export async function lookupDirectors(rpoId: string, fetcher: typeof fetch = fetch): Promise<Director[] | null> {
  return (await lookupEntity(rpoId, fetcher))?.directors ?? null
}
