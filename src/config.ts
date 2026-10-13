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
  /** A smaller cut of the same picture for phones, with its width. */
  small?: { src: string; width: number }
}

/** The plan the price list leads with: it has the blue outline and the blue button. */
export const LEAD_PLAN: PlanId = 'rast'

/** Where anybody can check that the company exists: the Business Register's search by IČO. */
export const REGISTER_URL = `https://www.orsr.sk/hladaj_ico.asp?ICO=${OPERATOR.companyId.replace(/\s/g, '')}&SID=0`

/** Where a picture can stand. Every section is finished without its picture; a picture makes it richer. */
export type ArtSlot =
  | 'logo'
  | 'mark'
  | 'envelope'
  | 'savings'
  | 'seed'
  | 'plant'
  | 'tree'
  | 'chip'
  | 'lens'
  | 'rocket'
  | 'key'
  | 'seal'
  | 'chat'
  | 'paperReceipt'
  | 'paperInvoice'
  | 'paperBank'
  | 'paperEinvoice'
  | 'paperReturn'
  | 'founder'

/** One of his glass objects, cut square at 960 and 480 px. */
const glass = (name: string): Art => ({ src: `/art/${name}.webp`, alt: '', width: 960, height: 960, small: { src: `/art/${name}-480.webp`, width: 480 } })

/**
 * The pictures of the site: 3D glass icons he makes in ChatGPT, never realistic photographs (his word of
 * 13 October 2026, 01:52: "realistické fotky generovať nebudem, to vyzerá úboho"). All of them are the same
 * glass in the blue of the brand with pink light on its edges, on a transparent background (sources in
 * art-src/icons/, cut by `scripts/art.py icon`; the F by `scripts/art.py logo`):
 * - the second set (prompts of 01:57, sent at 02:04): seed, plant and tree for the three plans, chip and lens
 *   for the machine and the person, rocket and key for the two ways in, seal for the company;
 * - the third (asked for at 14:12, sent at 14:51): the F (`mark`, the notification in the phone, the
 *   browser's and a shared link's icons), and the papers of a month: a slip, an invoice with a tick, a bank
 *   card, an envelope with a document (also the e-invoice band's), a calendar with a tick, and a stack of
 *   coins for what a client saves.
 * - chat (the question to the accountant) is still of the first set, iridescent glass made for black.
 * - founder: his own photo beside his note, a real one.
 * A slot without a picture shows nothing.
 */
export const ART: Record<ArtSlot, Art | null> = {
  logo: { src: '/art/logo-small.webp', alt: '', width: 128, height: 128 },
  mark: { src: '/art/logo.webp', alt: '', width: 960, height: 960 },
  envelope: glass('mail'),
  savings: glass('coins'),
  seed: glass('seed'),
  plant: glass('plant'),
  tree: glass('tree'),
  chip: glass('chip'),
  lens: glass('lens'),
  rocket: glass('rocket'),
  key: glass('key'),
  seal: glass('seal'),
  chat: glass('chat'),
  /* The papers that fly into the phone in the opening, each the icon of its row there. */
  paperReceipt: glass('slip'),
  paperInvoice: glass('doc'),
  paperBank: glass('card'),
  paperEinvoice: glass('mail'),
  paperReturn: glass('deadline'),
  founder: null,
}

/**
 * The client's app (13 October 2026): what it allows and how long things last. The model is Dougs' and
 * Pennylane's: every payment on the company's account needs a document, and the client's only task is to add a
 * document where one is missing. Everything else (reading it, pairing it with its payment, the deadlines) is ours.
 */
export const APP = {
  /** How long a sign-in link works, and how long a browser stays signed in. */
  linkMinutes: 20,
  sessionDays: 30,
  /** Sign-in links to one address in an hour, and sign-in requests from one connection in an hour. */
  linksPerHour: 5,
  signInsPerHour: 30,
  /** A file a client adds: the largest, how many in one go, and what a request with files may weigh. */
  fileBytes: 15_000_000,
  filesAtOnce: 20,
  uploadBytes: 60_000_000,
  /** Files a company may add in a day (a thousand is far beyond any month of a young company). */
  filesPerDay: 400,
  /** A message to the accountant, and messages a company may send in an hour. */
  messageChars: 4000,
  messagesPerHour: 30,
  /** The day of the next month by which we ask for a month's documents: the VAT return is due on the 25th. */
  docsByDay: 10,
  /** The address documents can be forwarded to: doklady-<code>@ the domain of the public mailbox. */
  inboxPrefix: 'doklady-',
} as const

/** The people of Firmony: who becomes the first administrator, and how long a welcome link works. */
export const TEAM = {
  /** Whoever signs in with this address while nobody of the team exists becomes the first administrator. */
  bootstrapEmail: BRAND.email,
  bootstrapName: 'Christian Juhás',
  /** The link in the email that welcomes a new client works this many days, once. */
  welcomeDays: 7,
} as const

/**
 * The reader of photographed and scanned documents: Claude, through Anthropic's API (secret ANTHROPIC_API_KEY).
 * Without the key nothing is sent anywhere and the accountant reads the document. An e-invoice (XML) is read by
 * our own code and never sent to the reader.
 */
export const READER = {
  model: 'claude-haiku-5-5',
  timeoutMs: 45_000,
  /** The API takes a picture of up to 5 MB; a larger one goes to the accountant (the app makes phone photos smaller first). */
  imageBytes: 5_000_000,
  pdfBytes: 25_000_000,
} as const

/** The version of the privacy notice; bump it with every change of /pravne-informacie. */
export const PRIVACY_VERSION = '2026-10-12'
