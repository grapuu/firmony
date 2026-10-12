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
  identifiers?: ({ value?: string } & Dated)[]
  fullNames?: ({ value?: string } & Dated)[]
  addresses?: RpoAddress[]
  legalForms?: ({ value?: { value?: string; code?: string } } & Dated)[]
  termination?: string
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
