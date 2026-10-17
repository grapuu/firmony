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
  /** The same, as a sentence says where the company is registered: "zapísaná v Obchodnom registri ...". */
  registeredIn: 'v Obchodnom registri Mestského súdu Košice, oddiel Sro, vložka č. 64897/V',
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
  /** Documents a month the plan is priced for: a month with more is billed as the next plan. */
  docs: number
  /** Whether the plan is for a VAT payer (monthly VAT return, control statement, recapitulative statement). */
  vatPayer: boolean
}

/**
 * The plans, by documents a month and VAT (his yes of 13 October 2026, 22:04, to a price list with at least 60 %
 * margin; they were 69, 129 and 249 € with 30, 80 and 200 documents and payroll inside). A month with more documents
 * than a plan is billed as the next plan; above the largest a price is agreed. Payroll is priced per person
 * (PAYROLL_PRICE) on every plan.
 */
export const PLANS: readonly Plan[] = [
  { id: 'start', name: 'Štart', price: 89, docs: 20, vatPayer: false },
  { id: 'rast', name: 'Rast', price: 169, docs: 60, vatPayer: true },
  { id: 'firma', name: 'Firma', price: 329, docs: 150, vatPayer: true },
] as const

export function planById(id: string | undefined): Plan | undefined {
  return PLANS.find((plan) => plan.id === id)
}

/** The annual closing and the corporate income tax return, once a year, for every plan (149 € until 13 October 2026). */
export const CLOSING_PRICE = 249

/** Payroll: euro a month for each person on it (the director on a salary counts), on every plan. */
export const PAYROLL_PRICE = 15

/**
 * What a freelance accountant is paid (his yes of 13 October 2026, 22:04): a client a month by plan, a person's
 * payroll a month, a closing. Her planned work is the review, returns and answers. Shown on no
 * page. These are planning assumptions, not a verified margin: actual economics depend on measured onboarding,
 * review, support, corrections and production vendor charges.
 */
export const ACCOUNTANT_PAY = { start: 28, rast: 55, firma: 110, payroll: 5, closing: 90 } as const

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

/**
 * Firmony for investors (proposed on 14 October 2026 at 12:48, his word "poď do toho"): the tax return of a person
 * who invests through a broker, prepared from the broker's yearly report, or filed for them. Until it starts, the
 * page /investori collects the people who want it. The prices are the builder's proposal, not his decision yet.
 */
export const INVESTORS = {
  brokers: [
    { id: 'xtb', name: 'XTB' },
    { id: 't212', name: 'Trading 212' },
    { id: 'ibkr', name: 'Interactive Brokers' },
    { id: 'revolut', name: 'Revolut' },
    { id: 'ine', name: 'Iný broker' },
  ],
  ways: ['sam', 'za-mna'],
  /** Euros, proposals: one broker done by yourself, every broker and crypto by yourself, done by us. */
  prices: { self: 29, selfAll: 49, done: 89 },
  /** The tax period the first returns are for, and its deadlines (podnikajte.sk, read on 14 October 2026). */
  year: 2026,
  deadline: '2027-03-31',
  deadlineForeign: '2027-09-30',
} as const

export type InvestorBroker = (typeof INVESTORS.brokers)[number]['id']
export type InvestorWay = (typeof INVESTORS.ways)[number]

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
  /** An email to that address: the largest Cloudflare delivers, files taken from email in a day, notes about email
   * without a document in a day (anybody who knows the address can write to it). */
  mailBytes: 25 * 1024 * 1024,
  mailFilesPerDay: 100,
  mailNotesPerDay: 5,
  /** An image in an email smaller than this is a logo or a signature, not a photographed document. */
  mailImageMin: 12_000,
  /** The declaration for the law against money laundering, sent in an hour (each send is a version kept for years). */
  declarationsPerHour: 10,
} as const

/**
 * The end of a contract (point 10.4 of the terms): the last month's documents and payments are taken for ten days
 * past the last day (the day the monthly reminder asks them by), the books are handed over in the app within 30, and
 * everything can be downloaded for 90. Then the company's data are deleted, all but the contract, the power of
 * attorney and the identification, which the law against money laundering keeps for five years after the end
 * (s. 19 of Act No. 297/2008 Z. z.); after those five years they go too.
 */
export const ENDING = {
  intakeDays: 10,
  handoverDays: 30,
  keepDays: 90,
  recordsYears: 5,
  /** Companies whose data the schedule deletes in one run (each is a few hundred statements and the files). */
  perRun: 3,
  /** Files of the handover a company keeps, and handover files in one form. */
  handoverFiles: 30,
  handoverAtOnce: 10,
  /** Downloads of a year's archive by a company in an hour. */
  exportsPerHour: 10,
} as const

/**
 * The bank by open banking: Enable Banking (Enable Banking Oy, Finland, an account information service under
 * PSD2) reads a company's accounts with the consent the client gives at the bank itself. The application's id is
 * the variable ENABLE_BANKING_APP and its private key the secret ENABLE_BANKING_KEY; without both, statements are
 * uploaded by hand as before.
 */
export const BANK = {
  api: 'https://api.enablebanking.com',
  country: 'SK',
  /** How long a consent is asked for, held to what the bank allows: 180 days is the most PSD2 allows today. */
  consentDays: 180,
  /** Reads while nobody is looking: PSD2 allows four a day (RTS art. 36(5)), so one every six hours. */
  syncEverySeconds: 6 * 3600,
  /** How far back the first read goes, and how far each later one looks back for bookings that came late. */
  firstDays: 90,
  overlapDays: 5,
  /** Pages of transactions read at most for one account in one read. */
  pages: 20,
  /** Links read in one run of the schedule, and how long one call to the API may take. */
  linksPerRun: 10,
  timeoutMs: 15_000,
  /** A pending consent that never came back from the bank is forgotten after an hour. */
  pendingSeconds: 3600,
  /** The owner is reminded to renew the consent this many days before it ends. */
  renewDays: 10,
  /** Reads a client starts in an hour ("Načítať teraz"), while the client is present. */
  readsPerHour: 6,
} as const

/**
 * Fio banka read by the client's own token (src/app/fio.ts): Fio's free API, read in its manual (API_Bankovnictvi.pdf,
 * version 1.9 of 16 October 2025). A token lives 180 days at most, and one token is asked at most every 30 seconds.
 */
export const FIO = {
  api: 'https://fioapi.fio.cz/v1/rest',
  tokenDays: 180,
  minSeconds: 30,
  timeoutMs: 15_000,
} as const

/**
 * How the bank comes in without an aggregator (14 October 2026), bank by bank, as each bank's own pages said that day:
 * Slovenská sporiteľňa e-mails SEPA XML statements every day ("Email (PDF, SEPA XML, MT940)", "on a daily, monthly or
 * annual basis", slsp.sk); ČSOB sets e-mailed statements in its internet banking (the format was not confirmed);
 * Fio gives a free token; Tatra banka e-mails only an encrypted PDF, so its "Výpis do účtovníctva" in XML (camt.053)
 * is added once a month; the others are added once a month in XML until we know better. `way`: 'daily' (the bank
 * sends XML every day), 'email' (the bank sends it, how often is set there), 'token' (Fio), 'monthly'.
 */
export type BankWay = 'daily' | 'email' | 'token' | 'monthly'
export const BANK_WAYS: readonly { id: string; name: string; way: BankWay }[] = [
  { id: 'slsp', name: 'Slovenská sporiteľňa', way: 'daily' },
  { id: 'tatra', name: 'Tatra banka', way: 'monthly' },
  { id: 'vub', name: 'VÚB banka', way: 'monthly' },
  { id: 'csob', name: 'ČSOB', way: 'email' },
  { id: 'fio', name: 'Fio banka', way: 'token' },
  { id: '365', name: '365.bank', way: 'monthly' },
  { id: 'mbank', name: 'mBank', way: 'monthly' },
  { id: 'unicredit', name: 'UniCredit Bank', way: 'monthly' },
  { id: 'prima', name: 'Prima banka', way: 'monthly' },
  { id: 'revolut', name: 'Revolut Business', way: 'monthly' },
  { id: 'wise', name: 'Wise Business', way: 'monthly' },
  { id: 'ina', name: 'Iná banka', way: 'monthly' },
] as const

/** A statement the owner said comes by itself, and that has not come for this many days, is said to be missing. */
export const STATEMENTS = {
  waitDays: 3,
  /** The statement of a month is asked for from the first day of the next one. */
  dueDay: 1,
} as const

/** Team display defaults and welcome-link duration. Provisioning requires explicit SecurityBindings. */
export const TEAM = {
  bootstrapName: 'Christian Juhás',
  /** The link in the email that welcomes a new client works this many days, once. */
  welcomeDays: 7,
} as const

/**
 * Every client's deadlines on one screen (the team's /ucto/terminy, src/team/deadlines.ts): how far ahead a deadline
 * is shown, how long what was done stays listed, and which VAT periods are worked out from the documents.
 */
export const DEADLINES = {
  /** What still runs (a period, a month, a contract) is shown once its deadline is this many days ahead or nearer;
   *  what can be done now always is. */
  aheadDays: 45,
  /** What was done is listed (when asked for) while its deadline is at most this many days past. */
  doneDays: 45,
  /** The VAT periods worked out in full: the ones that ended in the last four months (a quarterly payer's last two). */
  vatMonths: 4,
  /** A payer's periods older than those, never filed, are listed as overdue without being worked out: at most this many. */
  olderPeriods: 24,
  /** Companies whose documents are read in one batch. */
  batch: 40,
  /** The months of payroll listed: the one that runs and the ones before it. */
  payrollMonths: 3,
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

/**
 * The Financial Administration's "Over doklad" on the web, where anyone checks a receipt of an eKasa till by its
 * identifier (UID) or, off-line, by its verification code (OKP) and what goes with it (§ 18(1) and (3) of Act No.
 * 384/2025 Z. z.). The accountant opens it herself; Firmony asks it nothing (src/app/ekasa.ts).
 */
export const EKASA_VERIFY = 'https://opd.financnasprava.sk/'

/** The version of the privacy notice; bump it with every change of /pravne-informacie. */
export const PRIVACY_VERSION = '2026-10-14'

/**
 * The contract a client concludes online (13 October 2026). A request whose company the register knows as an
 * s. r. o. becomes an order; its link goes by email to the address that was typed, and a director (konateľ) named
 * in the register accepts the terms on the order's page. Bump TERMS_VERSION with every change of the terms
 * (src/content/terms.ts): acceptance keeps the complete wording and tariffs with SHA-256. Signing also requires
 * explicit legal/insurance release approval and a documented review of the particular order.
 */
export const TERMS_VERSION = '2026-10-15'

export const ORDER = {
  /** The link to an order works this many days. */
  days: 30,
  /** Acceptances tried from one connection in an hour. */
  acceptsPerHour: 10,
  /** The first month the service runs, and how many months a client can choose to start in. */
  firstMonth: '2027-01',
  startMonths: 6,
} as const
