// Everything a page states as a fact lives here: the brand, the company behind it, the plans and the limits.
// Change a price or a limit here and every page, email and test follows.

export const BRAND = {
  name: 'Firmony',
  /** Where the site lives. Links in emails and the canonical address of every page are built from it. */
  origin: 'https://firmony.ai',
  /** The public mailbox: shown on the site, Reply-To of every email to a client, and where requests are reported. */
  email: 'ahoj@firmony.ai',
  /** The day the service starts, as the pages say it. */
  launch: '1. januára 2027',
} as const

/** The company that runs Firmony. */
export const OPERATOR = {
  name: 'europio s. r. o.',
  street: 'K lesu 2218/39A',
  postalCity: '040 18 Košice',
  country: 'Slovenská republika',
  companyId: '57 442 452',
  taxId: '2122734449',
  register: 'Obchodný register Mestského súdu Košice, oddiel Sro, vložka č. 64897/V',
  phone: '+421 907 178 695',
  phoneHref: 'tel:+421907178695',
} as const

export const AUTHORITIES = {
  trade: { name: 'Slovenská obchodná inšpekcia, Inšpektorát SOI pre Košický kraj', address: 'Vrátna 3, P. O. BOX A-35, 040 65 Košice 1', website: 'https://www.soi.sk' },
  data: { name: 'Úrad na ochranu osobných údajov Slovenskej republiky', address: 'Hraničná 12, 820 07 Bratislava 27', website: 'https://dataprotection.gov.sk' },
} as const

export type PlanId = 'start' | 'rast' | 'firma'

export interface Plan {
  id: PlanId
  name: string
  /** Euro a month, without VAT. */
  price: number
  /** Documents a month the plan is priced for. */
  docs: number
  /** People on the payroll the plan covers (the director on a salary counts). */
  people: number
  /** Whether the plan is for a VAT payer (monthly VAT return, control statement, recapitulative statement). */
  vatPayer: boolean
}

/**
 * The plans. Prices are the owner's (12 October 2026). The limits are the builder's proposal and his to change:
 * documents and people a plan is priced for, and that a VAT payer starts at Rast.
 */
export const PLANS: readonly Plan[] = [
  { id: 'start', name: 'Štart', price: 69, docs: 30, people: 0, vatPayer: false },
  { id: 'rast', name: 'Rast', price: 129, docs: 80, people: 2, vatPayer: true },
  { id: 'firma', name: 'Firma', price: 249, docs: 200, people: 5, vatPayer: true },
] as const

export function planById(id: string | undefined): Plan | undefined {
  return PLANS.find((plan) => plan.id === id)
}

/** The annual closing and the corporate income tax return, once a year, for every plan. */
export const CLOSING_PRICE = 149

/** How soon a request is answered, as the pages promise it. */
export const REPLY_WITHIN = 'do jedného pracovného dňa'

/** Limits that keep the forms from being used against us or against somebody's mailbox. */
export const LIMITS = {
  /** Company lookups in the register, per connection and hour. */
  lookupsPerHour: 30,
  /** Requests sent, per connection and hour. */
  requestsPerHour: 6,
  /** Confirmations to one email address in a day: the form cannot be used to flood somebody's mailbox. */
  confirmationsPerDay: 2,
  /** Bytes a posted form may have. */
  formBytes: 8_000,
} as const

/** How long things are kept, as the privacy notice says. */
export const RETENTION = {
  requestDays: 365,
  outboxDays: 90,
  throttleHours: 48,
} as const

export const MAIL = {
  from: 'ahoj@firmony.ai',
  name: 'Firmony',
  maxAttempts: 10,
} as const

/** A picture on the site: a file under public/art, its description and its size in pixels. */
export interface Art {
  src: string
  alt: string
  width: number
  height: number
}

/** The plan the price list leads with: it has the outline of light and the white button. */
export const LEAD_PLAN: PlanId = 'rast'

/** Where a picture can stand. Each section looks finished without its picture. */
export type ArtSlot =
  | 'logo'
  | 'heroLeft'
  | 'heroRight'
  | 'ai'
  | 'human'
  | 'docs'
  | 'deadlines'
  | 'overview'
  | 'answers'
  | 'einvoice'
  | 'calc'
  | 'fresh'
  | 'switching'
  | 'founder'
  | 'final'

/**
 * The pictures of the site: glossy 3D objects in iridescent glass on black, which the owner makes himself
 * (ChatGPT, from the builder's prompts), and his own photo beside his note. A picture on black is made
 * see-through before it goes in. Until one exists its place shows nothing, so no page carries a placeholder.
 */
export const ART: Record<ArtSlot, Art | null> = {
  logo: null,
  heroLeft: null,
  heroRight: null,
  ai: null,
  human: null,
  docs: null,
  deadlines: null,
  overview: null,
  answers: null,
  einvoice: null,
  calc: null,
  fresh: null,
  switching: null,
  founder: null,
  final: null,
}

/** The version of the privacy notice; bump it with every change of /pravne-informacie. */
export const PRIVACY_VERSION = '2026-10-12'
