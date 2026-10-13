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
    isSro: form?.code === '112' || /ručením obmedzeným/i.test(legalForm ?? '') || SRO.test(name),
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

/** A director as the register names one: "Christian Juhás", "Konateľ". */
export interface Director {
  name: string
  role: string
}

interface RpoPerson extends Dated {
  stakeholderType?: { value?: string; code?: string }
  personName?: { formatedName?: string; givenNames?: string[]; familyNames?: string[] }
  fullName?: string
}

/**
 * The directors in office, read from the register's detail of an entity (GET .../rpo/v1/entity/<id>, seen on
 * 13 October 2026: `statutoryBodies`, each with `stakeholderType` "Konateľ" and `personName.formatedName`). One
 * that has ended (`validTo` in the past) is left out.
 */
export function readDirectors(answer: unknown, today: string = new Date().toISOString().slice(0, 10)): Director[] {
  const bodies = (answer as { statutoryBodies?: RpoPerson[] } | null)?.statutoryBodies
  if (!Array.isArray(bodies)) return []
  const out: Director[] = []
  for (const body of bodies) {
    if (body.validTo && body.validTo.slice(0, 10) < today) continue
    const person = body.personName
    const joined = [...(person?.givenNames ?? []), ...(person?.familyNames ?? [])].join(' ')
    const name = (person?.formatedName || joined || body.fullName || '').replace(/\s+/g, ' ').trim()
    if (name.length < 2 || out.some((d) => d.name === name)) continue
    out.push({ name, role: body.stakeholderType?.value?.trim() || 'Konateľ' })
  }
  return out
}

export const RPO_ENTITY = 'https://api.statistics.sk/rpo/v1/entity'

/** The directors of an entity, or null when the register does not answer within four seconds. */
export async function lookupDirectors(rpoId: string, fetcher: typeof fetch = fetch): Promise<Director[] | null> {
  if (!/^\d{1,12}$/.test(rpoId)) return null
  try {
    const res = await fetcher(`${RPO_ENTITY}/${rpoId}?showHistoricalData=false&showOrganizationUnits=false`, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(4000),
    })
    if (!res.ok) return null
    return readDirectors(await res.json())
  } catch {
    return null
  }
}
