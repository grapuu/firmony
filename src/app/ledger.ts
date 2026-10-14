// The company's books in double entry (sústava podvojného účtovníctva, Act No. 431/2002 Z. z. on accounting): the
// journal (účtovný denník), every account's movements (hlavná kniha), the trial balance (obratová predvaha), the open
// items of customers and suppliers (saldokonto), and the bank's balance against the books. Pure functions:
// ledger-store.ts reads what they work from, the team's pages show it, and test/units.test.mjs checks every rule.
//
// Nothing of the books is kept as entries of their own. Each entry is worked out, every time, from what stands
// behind it, so that it can never drift from it:
// - A booked document gives the entry its booking form shows (booking.ts, `entryFor`), on its day of supply (else of
//   issue, else the day it came), with its VAT on 343.100 (deducted) and 343.200 (owed) as the return counts it.
//   A credit note (a corrective document whose amounts are minus) books the other way.
// - A payment gives its entry on the day the bank booked it, against the bank account's analytic account (221.001):
//   an invoice paid (321) or paid to us (311), a receipt paid by card (the receipt goes against the bank itself when
//   it was paid in its own month and to the cent, otherwise through money in transit, 261), or, for a payment that
//   needs no document, the account the accountant gave it or the account of its reason (a bank's fee 568, interest
//   662, money between the company's own accounts 261, VAT paid to the tax office 343.300 ...). A payment is booked
//   once its documents are; what is not booked yet is said on the page and never guessed.
// - A VAT return marked as filed settles its period on the period's last day: the tax owed (rows 17 and 25) and the
//   tax deducted (rows 18, 18a and 19, less row 28) move to 343.300, the account with the tax office, which the tax
//   paid then clears. A supplementary return settles its difference on the day it was filed.
// - The accountant's internal documents (interné doklady) and the opening balances (počiatočné stavy) are stored as
//   she wrote them (ledger_entries).
// A year starts from the closing balances of the one before: the balance-sheet accounts (classes 0 to 4) carry over,
// costs and revenues start from nothing, and the year's result stands on 431 until it is distributed.
import { csvCell, csvMoney } from '../team/store'
import { CATEGORIES, entryFor, type PaidBy } from './booking'
import { readableName } from './copy'
import { centsOf } from './invoices'
import { normalizeVs, type DocKind, type Exempt } from './match'
import { bratislavaDay, vatCompanyOf, vatDocOf, type Company, type Doc } from './store'
import { isIssued, periodRange, vatOf, type FilingKind, type Rows, type VatData, type VatLine } from './vat'
import { groupedIban, periodName, rowsOf, type FiledReturn } from './vat-store'

// ---------------------------------------------------------------------------------------------------------------
// The chart of accounts
// ---------------------------------------------------------------------------------------------------------------

/** The synthetic accounts a young company uses, named as the Slovak chart of accounts (rámcová účtová osnova) names them. */
export const CHART: Readonly<Record<string, string>> = {
  '012': 'Aktivované náklady na vývoj',
  '013': 'Softvér',
  '014': 'Oceniteľné práva',
  '019': 'Ostatný dlhodobý nehmotný majetok',
  '021': 'Stavby',
  '022': 'Samostatné hnuteľné veci a súbory hnuteľných vecí',
  '029': 'Ostatný dlhodobý hmotný majetok',
  '031': 'Pozemky',
  '041': 'Obstaranie dlhodobého nehmotného majetku',
  '042': 'Obstaranie dlhodobého hmotného majetku',
  '051': 'Poskytnuté preddavky na dlhodobý nehmotný majetok',
  '052': 'Poskytnuté preddavky na dlhodobý hmotný majetok',
  '073': 'Oprávky k softvéru',
  '074': 'Oprávky k oceniteľným právam',
  '081': 'Oprávky k stavbám',
  '082': 'Oprávky k samostatným hnuteľným veciam a súborom hnuteľných vecí',
  '112': 'Materiál na sklade',
  '132': 'Tovar na sklade a v predajniach',
  '211': 'Pokladnica',
  '213': 'Ceniny',
  '221': 'Bankové účty',
  '231': 'Krátkodobé bankové úvery',
  '261': 'Peniaze na ceste',
  '311': 'Odberatelia',
  '314': 'Poskytnuté preddavky',
  '315': 'Ostatné pohľadávky',
  '321': 'Dodávatelia',
  '324': 'Prijaté preddavky',
  '325': 'Ostatné záväzky',
  '331': 'Zamestnanci',
  '333': 'Ostatné záväzky voči zamestnancom',
  '335': 'Pohľadávky voči zamestnancom',
  '336': 'Zúčtovanie s orgánmi sociálneho poistenia a zdravotného poistenia',
  '341': 'Daň z príjmov',
  '342': 'Ostatné priame dane',
  '343': 'Daň z pridanej hodnoty',
  '345': 'Ostatné dane a poplatky',
  '353': 'Pohľadávky za upísané vlastné imanie',
  '354': 'Pohľadávky voči spoločníkom a združeniu',
  '355': 'Ostatné pohľadávky voči spoločníkom a združeniu',
  '364': 'Záväzky voči spoločníkom a združeniu',
  '365': 'Ostatné záväzky voči spoločníkom a združeniu',
  '366': 'Záväzky voči spoločníkom a združeniu zo závislej činnosti',
  '378': 'Iné pohľadávky',
  '379': 'Iné záväzky',
  '381': 'Náklady budúcich období',
  '383': 'Výdavky budúcich období',
  '384': 'Výnosy budúcich období',
  '385': 'Príjmy budúcich období',
  '411': 'Základné imanie',
  '413': 'Ostatné kapitálové fondy',
  '421': 'Zákonný rezervný fond',
  '428': 'Nerozdelený zisk minulých rokov',
  '429': 'Neuhradená strata minulých rokov',
  '431': 'Výsledok hospodárenia v schvaľovacom konaní',
  '461': 'Bankové úvery',
  '479': 'Ostatné dlhodobé záväzky',
  '501': 'Spotreba materiálu',
  '502': 'Spotreba energie',
  '504': 'Predaný tovar',
  '511': 'Opravy a udržiavanie',
  '512': 'Cestovné',
  '513': 'Náklady na reprezentáciu',
  '518': 'Ostatné služby',
  '521': 'Mzdové náklady',
  '524': 'Zákonné sociálne poistenie',
  '527': 'Zákonné sociálne náklady',
  '531': 'Daň z motorových vozidiel',
  '538': 'Ostatné dane a poplatky',
  '541': 'Zostatková cena predaného dlhodobého nehmotného majetku a dlhodobého hmotného majetku',
  '544': 'Zmluvné pokuty, penále a úroky z omeškania',
  '545': 'Ostatné pokuty, penále a úroky z omeškania',
  '546': 'Odpis pohľadávky',
  '548': 'Ostatné náklady na hospodársku činnosť',
  '549': 'Manká a škody na majetku',
  '551': 'Odpisy dlhodobého nehmotného majetku a dlhodobého hmotného majetku',
  '562': 'Úroky',
  '563': 'Kurzové straty',
  '568': 'Ostatné finančné náklady',
  '591': 'Splatná daň z príjmov',
  '592': 'Odložená daň z príjmov',
  '601': 'Tržby za vlastné výrobky',
  '602': 'Tržby z predaja služieb',
  '604': 'Tržby za tovar',
  '641': 'Tržby z predaja dlhodobého nehmotného majetku a dlhodobého hmotného majetku',
  '644': 'Zmluvné pokuty, penále a úroky z omeškania',
  '645': 'Ostatné pokuty, penále a úroky z omeškania',
  '646': 'Výnosy z odpísaných pohľadávok',
  '648': 'Ostatné výnosy z hospodárskej činnosti',
  '662': 'Úroky',
  '663': 'Kurzové zisky',
  '668': 'Ostatné finančné výnosy',
  '701': 'Začiatočný účet súvahový',
  '702': 'Konečný účet súvahový',
  '710': 'Účet ziskov a strát',
}

/** The classes of the chart (účtové triedy), by their digit. */
export const CLASSES = ['Dlhodobý majetok', 'Zásoby', 'Finančné účty', 'Zúčtovacie vzťahy', 'Kapitálové účty a dlhodobé záväzky', 'Náklady', 'Výnosy', 'Závierkové účty'] as const

/** The analytic accounts the books keep of their own. */
export const VAT_IN = '343.100'
export const VAT_OUT = '343.200'
export const VAT_SETTLE = '343.300'
export const TRANSIT = '261'
export const CASH = '211'
export const OWNER = '365'
export const OPENING = '701'

const ANALYTICS: Readonly<Record<string, string>> = {
  [VAT_IN]: 'DPH na vstupe (odpočet)',
  [VAT_OUT]: 'DPH na výstupe',
  [VAT_SETTLE]: 'DPH, zúčtovanie s daňovým úradom',
}

/**
 * An account as the books write it: three digits of the synthetic account, and after a full stop its analytic
 * number as it was typed (518.001, 343.1). "518001" and "518-001" are 518.001. Null when it is no account of classes
 * 0 to 7.
 */
export function canonicalAccount(text: string | null | undefined): string | null {
  const plain = (text ?? '').replace(/\s/g, '')
  const m = /^([0-7]\d{2})(?:[.-]?(\d{1,3}))?$/.exec(plain)
  if (!m) return null
  return m[2] ? `${m[1]}.${m[2]}` : (m[1] as string)
}

export const synthetic = (account: string): string => account.slice(0, 3)
export const accountClass = (account: string): number => Number(account.charAt(0))
/** Costs and revenues: they start every year from nothing. */
export const isResultAccount = (account: string): boolean => accountClass(account) === 5 || accountClass(account) === 6

/** An account's name: a bank account by its IBAN, an analytic account of ours, or its synthetic account's name. */
export function accountName(account: string, banks: readonly { ledger: string; iban: string }[] = []): string {
  const bank = banks.find((b) => b.ledger === account)
  if (bank) return `Bankový účet ${groupedIban(bank.iban)}`
  return ANALYTICS[account] ?? CHART[synthetic(account)] ?? ''
}

// ---------------------------------------------------------------------------------------------------------------
// What the books are worked out from
// ---------------------------------------------------------------------------------------------------------------

/** One line of an entry: the account debited (má dať), the account credited (dal), the amount in cents. */
export interface LedgerLine {
  md: string
  d: string
  cents: number
  /** What the line is, for the booking form's table. */
  what?: 'cost' | 'vat' | 'revenue' | 'payable' | 'receivable'
}

export type EntryKind = 'opening' | 'document' | 'payment' | 'vat' | 'internal'

export interface LedgerEntry {
  /** Unique in the books: d:<document>, p:<payment>, v:<period>[:n], m:<stored entry>. */
  key: string
  on: string
  kind: EntryKind
  /** The accounting document's number as the journal prints it: the document's own, ID-2027-001, DPH 09/2027, PS. */
  number: string
  text: string
  docId: string | null
  paymentId: string | null
  manualId: string | null
  lines: LedgerLine[]
}

export interface LedgerPayment {
  id: string
  bookedOn: string
  amountCents: number
  currency: string
  party: string | null
  vs: string | null
  note: string | null
  exempt: Exempt | null
  exemptNote: string | null
  /** The account the accountant gave it. */
  contra: string | null
  /** Its bank account: the id, and the analytic account in the books (221.001). */
  bankId: string
  bank: string
}

export interface LedgerBank {
  id: string
  iban: string
  ledger: string
  /** The balance the bank last said, and on which day. */
  balanceCents: number | null
  balanceOn: string | null
}

export interface ManualEntry {
  id: string
  kind: 'internal' | 'opening'
  number: string | null
  on: string
  text: string
  lines: LedgerLine[]
  createdAt: number
  createdByName: string | null
}

export interface LedgerInput {
  company: Company
  /** Every document of the company that is not deleted, booked or not. */
  docs: Doc[]
  payments: LedgerPayment[]
  banks: LedgerBank[]
  filed: FiledReturn[]
  manual: ManualEntry[]
}

/** An invoice's open item (saldokonto): what it comes to on its account and what of it was settled. */
export interface OpenItem {
  docId: string
  account: '311' | '321'
  on: string
  dueOn: string | null
  number: string | null
  party: string | null
  /** In the account's own direction: a claim on 311 and a debt on 321 are plus, a credit note's minus. */
  total: number
  settled: number
}

export interface BookIssues {
  /** Documents not booked yet: the accountant's queue. */
  unbooked: string[]
  /** Booked documents that make no entry (no amount, or a category of the other kind). */
  noEntry: string[]
  /** Payments that need an account from the accountant: no document and no account of their reason, or only papers that are no accounting documents. */
  classify: string[]
  /** Payments whose documents are not all booked yet. */
  waiting: string[]
  /** Payments without a document, which the client is asked for. */
  missing: string[]
  /** Payments in another currency than the euro, which are not booked. */
  foreign: string[]
  /** Documents and payments dated before the books start: they belong to the accountant before us, or into the opening balances. */
  beforeStart: { docs: number; payments: number }
}

export interface Books {
  /** The first day of the books: the opening balances' day, else the contract's first day. */
  start: string | null
  entries: LedgerEntry[]
  items: OpenItem[]
  issues: BookIssues
  /** What of each payment is not in the books yet (the bank's way: out minus), for the bank's balance against the books. */
  unposted: Map<string, number>
  /** The payments booked by their documents (an invoice paid, a receipt paid by card), not by an account of their own. */
  documented: Set<string>
  payments: Map<string, LedgerPayment>
  banks: LedgerBank[]
}

const RI: readonly DocKind[] = ['receipt', 'invoice_in', 'invoice_out']
const isAccountingDoc = (kind: DocKind | null): kind is 'receipt' | 'invoice_in' | 'invoice_out' => kind !== null && RI.includes(kind)

export const KIND_NAMES: Readonly<Record<DocKind, string>> = { receipt: 'Bloček', invoice_in: 'Prijatá faktúra', invoice_out: 'Vydaná faktúra', other: 'Iný doklad' }

export const EXEMPT_TEXT: Readonly<Record<Exempt, string>> = {
  bank: 'Banka',
  own: 'Prevod medzi vlastnými účtami',
  payroll: 'Mzdy a odvody',
  state: 'Platba štátu',
  capital: 'Vklad alebo pôžička',
  other: 'Platba bez dokladu',
}

// ---------------------------------------------------------------------------------------------------------------
// A document's entry
// ---------------------------------------------------------------------------------------------------------------

interface Plan {
  /** The document's own day in the books. */
  on: string
  credit: boolean
  gross: number
  /** What the bank moves to settle it: out minus, in plus. */
  expected: number
  data: VatData | null
}

/** What the books need of a document: its day, whether it is a credit note, its amount and what settles it. Null when it makes no entry. */
function planOf(doc: Doc, company: Company): Plan | null {
  if (!isAccountingDoc(doc.kind) || doc.totalCents === null || doc.totalCents <= 0) return null
  const data = company.vatStatus === 'none' ? null : (vatOf(vatDocOf(doc), vatCompanyOf(company))?.data ?? null)
  const lines: { base: number; vat: number }[] = data ? data.lines : doc.linesHint
  const corrects = (data ? data.corrects : doc.correctsHint) ?? ''
  const credit = corrects !== '' && lines.reduce((sum, line) => sum + line.base + line.vat, 0) < 0
  const on = data?.suppliedOn ?? doc.suppliedOn ?? doc.issuedOn ?? bratislavaDay(doc.createdAt)
  const expected = (doc.kind === 'invoice_out' ? 1 : -1) * (credit ? -1 : 1) * doc.totalCents
  return { on, credit, gross: doc.totalCents, expected, data }
}

/**
 * The entry of a document as the books take it: `entryFor` with the VAT the return counts (what is deducted, what is
 * owed, what the company pays itself on what it bought from abroad), on the analytic accounts 343.100 and 343.200,
 * with the account that paid a receipt, and the other way for a credit note. Empty when the document makes none.
 */
export function documentLines(doc: Doc, company: Company, how: { paidBy: PaidBy; contra?: string | null }): LedgerLine[] {
  const plan = planOf(doc, company)
  if (!plan || !doc.category) return []
  const payer = company.vatStatus === 'payer'
  const { data, credit } = plan
  const sign = credit ? -1 : 1
  const sum = (pick: (line: VatLine) => number) => (data ? Math.max(0, sign * data.lines.reduce((total, line) => total + pick(line), 0)) : 0)
  let vatCents = 0
  let deduct = false
  let selfVat: { cents: number; deduct: boolean; deductCents: number } | null = null
  if (data) {
    if (isIssued(doc.kind)) vatCents = payer && data.mode === 'domestic' ? sum((line) => line.vat) : 0
    else if (data.mode === 'domestic') {
      vatCents = payer ? sum((line) => line.deduct) : 0
      deduct = vatCents > 0
    } else if (data.mode === 'reverse' || data.mode === 'acquisition') {
      const cents = sum((line) => line.vat)
      const deducted = payer ? sum((line) => line.deduct) : 0
      selfVat = cents > 0 ? { cents, deduct: deducted > 0, deductCents: deducted } : null
    }
  }
  const raw = entryFor({
    kind: doc.kind,
    category: doc.category,
    totalCents: plan.gross,
    vatCents,
    vatPayer: payer,
    vatDeduct: deduct,
    paidBy: how.paidBy,
    account: doc.account,
    selfVat,
    contra: how.contra ?? null,
  })
  const registered = company.vatStatus !== 'none'
  return raw
    .filter((line) => line.cents > 0)
    .map((line) => {
      const md = registered && line.md === '343' ? VAT_IN : (canonicalAccount(line.md) ?? line.md)
      const d = registered && line.d === '343' ? VAT_OUT : (canonicalAccount(line.d) ?? line.d)
      return credit ? { md: d, d: md, cents: line.cents, what: line.what } : { md, d, cents: line.cents, what: line.what }
    })
}

/**
 * The account that paid a receipt linked to a payment: the bank account itself when the payment is the receipt's
 * alone, to the cent and in the receipt's month (the entry then stands on the bank's day); otherwise money in
 * transit (261), which the payment clears on its own day.
 */
export function receiptContra(receipt: { on: string; expected: number }, payment: { bookedOn: string; amountCents: number; bank: string }, documents: number): { contra: string; on: string } {
  const direct = documents === 1 && payment.amountCents === receipt.expected && payment.bookedOn.slice(0, 7) === receipt.on.slice(0, 7)
  return direct ? { contra: payment.bank, on: payment.bookedOn } : { contra: TRANSIT, on: receipt.on }
}

/** For the booking form: a document's entry as the books will hold it, with the payment it is linked to. */
export function bookingLines(doc: Doc, company: Company, payment: { bookedOn: string; amountCents: number; bankLedger: string; docs: number } | null): LedgerLine[] {
  const plan = planOf(doc, company)
  if (!plan) return []
  if (doc.kind === 'receipt' && payment) {
    const { contra } = receiptContra(plan, { bookedOn: payment.bookedOn, amountCents: payment.amountCents, bank: payment.bankLedger }, payment.docs)
    return documentLines(doc, company, { paidBy: 'bank', contra })
  }
  const lines = documentLines(doc, company, { paidBy: payment ? 'bank' : doc.paidPrivately ? 'private' : doc.kind === 'receipt' ? 'cash' : 'unpaid' })
  // A received invoice the owner paid himself: the company owes it to him now.
  if (doc.kind === 'invoice_in' && !payment && doc.paidPrivately && lines.length > 0)
    lines.push(plan.credit ? { md: OWNER, d: '321', cents: plan.gross, what: 'payable' } : { md: '321', d: OWNER, cents: plan.gross, what: 'payable' })
  return lines
}

// ---------------------------------------------------------------------------------------------------------------
// A payment that needs no document
// ---------------------------------------------------------------------------------------------------------------

/**
 * The account of a payment's reason, when it says it plainly: a bank's fee 568 and its interest 662, money between the
 * company's own accounts 261 (both sides of a transfer meet there), VAT paid to or refunded by the tax office 343.300
 * (its variable symbol begins 1100), capital paid in 353, money the owner lent or got back 365, wages paid 331. Null
 * when the accountant decides (a tax other than VAT, insurance, anything else).
 */
export function reasonAccount(p: Pick<LedgerPayment, 'amountCents' | 'vs' | 'note' | 'exempt' | 'exemptNote'>): string | null {
  if (p.exempt === 'state' && /^1100\d{6}$/.test(normalizeVs(p.vs))) return VAT_SETTLE
  switch (p.exempt) {
    case 'bank':
      return p.amountCents < 0 ? '568' : '662'
    case 'own':
      return TRANSIT
    case 'capital':
      return p.amountCents > 0 && /imani/i.test(`${p.exemptNote ?? ''} ${p.note ?? ''}`) ? '353' : OWNER
    case 'payroll':
      return p.amountCents < 0 ? '331' : null
    default:
      return null
  }
}

/** The payments of a year the books take without a document: those with a reason, an account of the accountant's, or waiting for one. */
export function paymentsWithoutDocuments(books: Books, year: number): LedgerPayment[] {
  const waiting = new Set(books.issues.classify)
  return [...books.payments.values()]
    .filter((p) => p.bookedOn.startsWith(`${year}-`) && !books.documented.has(p.id) && (p.exempt !== null || p.contra !== null || waiting.has(p.id)))
    .sort((a, b) => a.bookedOn.localeCompare(b.bookedOn) || a.id.localeCompare(b.id))
}

/** The account a payment without a document is booked against: the accountant's, else its reason's. */
export function paymentContra(p: LedgerPayment): string | null {
  const given = canonicalAccount(p.contra)
  if (given && synthetic(given) !== '221') return given
  return reasonAccount(p)
}

const lineOf = (account: string, bank: string, cents: number): LedgerLine => (cents < 0 ? { md: account, d: bank, cents: -cents } : { md: bank, d: account, cents })

// ---------------------------------------------------------------------------------------------------------------
// The books
// ---------------------------------------------------------------------------------------------------------------

/** A filed period's filings, the oldest first: the regular return, and the corrections that followed it. */
export function filingChain(f: FiledReturn): { kind: FilingKind; filedOn: string; rows: Rows }[] {
  const chain: { kind: FilingKind; filedOn: string; rows: Rows }[] = [{ kind: f.kind, filedOn: f.filedOn, rows: f.rows }]
  let prev = f.prev
  for (let guard = 0; prev && guard < 40; guard++) {
    try {
      const r = JSON.parse(prev) as Record<string, unknown>
      chain.unshift({ kind: r.kind === 'O' || r.kind === 'D' ? r.kind : 'R', filedOn: String(r.filed_on ?? f.filedOn), rows: rowsOf(r.rows) })
      prev = typeof r.prev === 'string' ? r.prev : null
    } catch {
      break
    }
  }
  return chain
}

/** The tax a return owes (rows 17 and 25) and deducts (rows 18, 18a and 19, less row 28). */
export const vatOwed = (rows: Rows): number => rows.r17 + rows.r25
export const vatDeducted = (rows: Rows): number => rows.r18 + rows.r18a + rows.r19 - rows.r28

function settlementLines(owed: number, deducted: number): LedgerLine[] {
  const lines: LedgerLine[] = []
  if (owed > 0) lines.push({ md: VAT_OUT, d: VAT_SETTLE, cents: owed })
  if (owed < 0) lines.push({ md: VAT_SETTLE, d: VAT_OUT, cents: -owed })
  if (deducted > 0) lines.push({ md: VAT_SETTLE, d: VAT_IN, cents: deducted })
  if (deducted < 0) lines.push({ md: VAT_IN, d: VAT_SETTLE, cents: -deducted })
  return lines
}

const ORDER: Record<EntryKind, number> = { opening: 0, document: 1, payment: 2, vat: 3, internal: 4 }

/** The day the books start: the opening balances' day, else the contract's first day; null when neither is known. */
export function booksStart(company: Pick<Company, 'startOn'>, manual: readonly ManualEntry[]): string | null {
  const opening = manual
    .filter((m) => m.kind === 'opening')
    .map((m) => m.on)
    .sort()[0]
  return opening ?? company.startOn ?? null
}

const docText = (doc: Doc): string => {
  const who = doc.party ? readableName(doc.party) : KIND_NAMES[doc.kind ?? 'other']
  const what = doc.category ? CATEGORIES[doc.category]?.name : null
  return what ? `${who}: ${what}` : who
}

/** Works the books out. Every entry is balanced by its making: each line debits one account and credits another. */
export function buildBooks(input: LedgerInput): Books {
  const { company } = input
  const start = booksStart(company, input.manual)
  const entries: LedgerEntry[] = []
  const issues: BookIssues = { unbooked: [], noEntry: [], classify: [], waiting: [], missing: [], foreign: [], beforeStart: { docs: 0, payments: 0 } }
  const items = new Map<string, OpenItem>()
  const unposted = new Map<string, number>()
  const documented = new Set<string>()
  const payments = new Map(input.payments.map((p) => [p.id, p]))
  const inBooks = (day: string) => !start || day >= start

  // Each payment's documents, and the part of the payment that settles each (in the order of their days; the last
  // takes what is left, so the parts always make the payment).
  const docsOf = new Map<string, Doc[]>()
  for (const d of input.docs) if (d.paymentId) docsOf.set(d.paymentId, [...(docsOf.get(d.paymentId) ?? []), d])
  const plans = new Map<string, Plan>()
  for (const d of input.docs) {
    const plan = planOf(d, company)
    if (plan) plans.set(d.id, plan)
  }
  const shareOf = new Map<string, number>()
  for (const [paymentId, linked] of docsOf) {
    const p = payments.get(paymentId)
    if (!p) continue
    const accounting = linked.filter((d) => isAccountingDoc(d.kind)).sort((a, b) => (plans.get(a.id)?.on ?? '').localeCompare(plans.get(b.id)?.on ?? '') || a.id.localeCompare(b.id))
    let left = p.amountCents
    accounting.forEach((d, i) => {
      const share = i === accounting.length - 1 ? left : (plans.get(d.id)?.expected ?? 0)
      shareOf.set(d.id, share)
      left -= share
    })
  }

  // Documents.
  const booked = new Set<string>()
  const direct = new Set<string>()
  for (const doc of input.docs) {
    if (!doc.bookedAt) {
      issues.unbooked.push(doc.id)
      continue
    }
    if (!isAccountingDoc(doc.kind)) continue
    const plan = plans.get(doc.id)
    const pay = doc.paymentId ? payments.get(doc.paymentId) : undefined
    let on = plan?.on ?? ''
    let lines: LedgerLine[] = []
    if (plan) {
      if (!inBooks(plan.on)) {
        issues.beforeStart.docs++
        continue
      }
      if (doc.kind === 'receipt' && pay) {
        const usable = pay.currency === 'EUR' && inBooks(pay.bookedOn)
        const accounting = (docsOf.get(pay.id) ?? []).filter((d) => isAccountingDoc(d.kind)).length
        const paid = usable ? receiptContra(plan, pay, accounting) : { contra: TRANSIT, on: plan.on }
        if (paid.contra !== TRANSIT) direct.add(doc.id)
        on = paid.on
        lines = documentLines(doc, company, { paidBy: 'bank', contra: paid.contra })
      } else {
        lines = documentLines(doc, company, { paidBy: pay ? 'bank' : doc.paidPrivately ? 'private' : doc.kind === 'receipt' ? 'cash' : 'unpaid' })
      }
    }
    if (!plan || lines.length === 0) {
      issues.noEntry.push(doc.id)
      continue
    }
    booked.add(doc.id)
    entries.push({ key: `d:${doc.id}`, on, kind: 'document', number: doc.number ?? '', text: docText(doc), docId: doc.id, paymentId: pay?.id ?? null, manualId: null, lines })
    if (doc.kind === 'invoice_in' || doc.kind === 'invoice_out') {
      const account = doc.kind === 'invoice_out' ? '311' : '321'
      const item: OpenItem = { docId: doc.id, account, on: plan.on, dueOn: doc.dueOn, number: doc.number, party: doc.party, total: (plan.credit ? -1 : 1) * plan.gross, settled: 0 }
      items.set(doc.id, item)
      // A received invoice the owner paid himself: the company owes it to him now.
      if (doc.kind === 'invoice_in' && !pay && doc.paidPrivately) {
        entries.push({
          key: `d:${doc.id}:owner`,
          on: plan.on,
          kind: 'document',
          number: doc.number ?? '',
          text: `${docText(doc)}, zaplatil spoločník`,
          docId: doc.id,
          paymentId: null,
          manualId: null,
          lines: [plan.credit ? { md: OWNER, d: '321', cents: plan.gross } : { md: '321', d: OWNER, cents: plan.gross }],
        })
        item.settled = item.total
      }
    }
  }

  // Payments.
  for (const p of input.payments) {
    if (!inBooks(p.bookedOn)) {
      issues.beforeStart.payments++
      continue
    }
    if (p.currency !== 'EUR') {
      issues.foreign.push(p.id)
      unposted.set(p.id, p.amountCents)
      continue
    }
    const linked = docsOf.get(p.id) ?? []
    const accounting = linked.filter((d) => isAccountingDoc(d.kind))
    if (accounting.length > 0) {
      documented.add(p.id)
      const lines: LedgerLine[] = []
      let posted = 0
      for (const d of accounting) {
        const share = shareOf.get(d.id) ?? 0
        if (!booked.has(d.id)) continue
        posted += share
        if (direct.has(d.id) || share === 0) continue
        const account = d.kind === 'receipt' ? TRANSIT : d.kind === 'invoice_out' ? '311' : '321'
        lines.push(lineOf(account, p.bank, share))
        const item = items.get(d.id)
        if (item) item.settled += account === '321' ? -share : share
      }
      if (accounting.some((d) => !booked.has(d.id))) issues.waiting.push(p.id)
      if (lines.length > 0) {
        const first = accounting.find((d) => booked.has(d.id))
        const who = p.party ? readableName(p.party) : first?.party ? readableName(first.party) : ''
        const numbers = accounting.filter((d) => booked.has(d.id) && d.kind !== 'receipt' && d.number).map((d) => d.number)
        entries.push({
          key: `p:${p.id}`,
          on: p.bookedOn,
          kind: 'payment',
          number: '',
          text: [`Úhrada${who ? `: ${who}` : ''}`, numbers.length > 0 ? `(${numbers.join(', ')})` : ''].filter(Boolean).join(' '),
          docId: first?.id ?? null,
          paymentId: p.id,
          manualId: null,
          lines,
        })
      }
      if (p.amountCents - posted !== 0) unposted.set(p.id, p.amountCents - posted)
      continue
    }
    const contra = paymentContra(p)
    if (contra && p.amountCents !== 0) {
      const who = p.party ? readableName(p.party) : (p.note ?? '')
      entries.push({
        key: `p:${p.id}`,
        on: p.bookedOn,
        kind: 'payment',
        number: '',
        text: `${p.exempt ? EXEMPT_TEXT[p.exempt] : 'Platba'}${who ? `: ${who}` : ''}`,
        docId: linked[0]?.id ?? null,
        paymentId: p.id,
        manualId: null,
        lines: [lineOf(contra, p.bank, p.amountCents)],
      })
      continue
    }
    if (p.amountCents === 0) continue
    if (p.exempt || linked.length > 0) issues.classify.push(p.id)
    else issues.missing.push(p.id)
    unposted.set(p.id, p.amountCents)
  }

  // VAT settled by the returns marked as filed.
  if (company.vatStatus !== 'none') {
    for (const f of input.filed) {
      const chain = filingChain(f)
      let k = 0
      while (k + 1 < chain.length && chain[k + 1]?.kind !== 'D') k++
      const regular = chain[k]
      if (!regular) continue
      const end = periodRange(f.period).to
      if (!inBooks(end)) continue
      const label = `DPH ${f.period.includes('Q') ? `${f.period.slice(6)}Q` : f.period.slice(5, 7)}/${f.period.slice(0, 4)}`
      const first = settlementLines(vatOwed(regular.rows), vatDeducted(regular.rows))
      if (first.length > 0)
        entries.push({ key: `v:${f.period}`, on: end, kind: 'vat', number: label, text: `Zúčtovanie DPH za ${periodName(f.period)}`, docId: null, paymentId: null, manualId: null, lines: first })
      let before = regular.rows
      for (let j = k + 1; j < chain.length; j++) {
        const now = chain[j]
        if (!now) continue
        const lines = settlementLines(vatOwed(now.rows) - vatOwed(before), vatDeducted(now.rows) - vatDeducted(before))
        if (lines.length > 0)
          entries.push({
            key: `v:${f.period}:${j}`,
            on: now.filedOn,
            kind: 'vat',
            number: label,
            text: `Dodatočné priznanie DPH za ${periodName(f.period)}`,
            docId: null,
            paymentId: null,
            manualId: null,
            lines,
          })
        before = now.rows
      }
    }
  }

  // What the accountant wrote herself.
  for (const m of input.manual) {
    entries.push({ key: `m:${m.id}`, on: m.on, kind: m.kind, number: m.number ?? (m.kind === 'opening' ? 'PS' : ''), text: m.text, docId: null, paymentId: null, manualId: m.id, lines: m.lines })
  }

  entries.sort((a, b) => a.on.localeCompare(b.on) || ORDER[a.kind] - ORDER[b.kind] || a.number.localeCompare(b.number) || a.key.localeCompare(b.key))
  const openItems = [...items.values()].sort((a, b) => (a.dueOn ?? a.on).localeCompare(b.dueOn ?? b.on) || a.docId.localeCompare(b.docId))
  return { start, entries, items: openItems, issues, unposted, documented, payments, banks: input.banks }
}

// ---------------------------------------------------------------------------------------------------------------
// Balances, the trial balance and an account's movements
// ---------------------------------------------------------------------------------------------------------------

const add = (map: Map<string, number>, account: string, cents: number) => map.set(account, (map.get(account) ?? 0) + cents)

/** The last day of a month of a year. */
export function monthEnd(year: number, month: number): string {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return `${year}-${String(month).padStart(2, '0')}-${String(last).padStart(2, '0')}`
}

/** Every account's balance (debit plus, credit minus) from the entries up to a day. */
export function balancesAt(entries: readonly LedgerEntry[], through: string): Map<string, number> {
  const out = new Map<string, number>()
  for (const e of entries) {
    if (e.on > through) break
    for (const line of e.lines) {
      add(out, line.md, line.cents)
      add(out, line.d, -line.cents)
    }
  }
  return out
}

/** One account's balance up to a day: the account itself, or a synthetic account with all its analytic ones. */
export function balanceOf(entries: readonly LedgerEntry[], account: string, through: string): number {
  let sum = 0
  for (const [acct, cents] of balancesAt(entries, through)) if (matches(account, acct)) sum += cents
  return sum
}

const matches = (wanted: string, account: string): boolean => (wanted.includes('.') ? account === wanted : synthetic(account) === wanted)

/**
 * The balances a year opens with: the balance-sheet accounts as the year before closed them, and the result of every
 * year before it on 431 (a profit as a credit), where it stands until it is distributed. Costs, revenues and the
 * closing accounts start from nothing.
 */
export function yearOpening(entries: readonly LedgerEntry[], year: number): Map<string, number> {
  const before = balancesAt(entries, `${year - 1}-12-31`)
  const out = new Map<string, number>()
  let result = 0
  for (const [account, cents] of before) {
    if (isResultAccount(account)) result += cents
    else if (accountClass(account) !== 7) add(out, account, cents)
  }
  if (result !== 0) add(out, '431', result)
  return out
}

export interface TrialRow {
  account: string
  name: string
  /** The opening balance (počiatočný stav), the debit and credit turnover, the closing balance: debit plus, credit minus. */
  ps: number
  md: number
  d: number
  ks: number
  /** An analytic account under the synthetic row before it. */
  analytic: boolean
}

export interface TrialClass {
  cls: number
  name: string
  rows: TrialRow[]
  ps: number
  md: number
  d: number
  ks: number
}

export interface TrialBalance {
  year: number
  from: string
  to: string
  classes: TrialClass[]
  ps: number
  md: number
  d: number
  ks: number
  /** Costs and revenues of the range (with what the opening balances brought of them), and the result: a profit plus. */
  costs: number
  revenues: number
  result: number
}

/**
 * The trial balance from the first day of a year to the end of a month: each account's opening balance (what the year
 * before left, and the opening balances written in the range), its turnover, and its closing balance, by class, with
 * the analytic accounts under their synthetic one.
 */
export function trialBalance(books: Books, year: number, through: number): TrialBalance {
  const from = `${year}-01-01`
  const to = monthEnd(year, through)
  const ps = yearOpening(books.entries, year)
  const md = new Map<string, number>()
  const d = new Map<string, number>()
  for (const e of books.entries) {
    if (e.on < from || e.on > to) continue
    for (const line of e.lines) {
      if (e.kind === 'opening') {
        add(ps, line.md, line.cents)
        add(ps, line.d, -line.cents)
      } else {
        add(md, line.md, line.cents)
        add(d, line.d, line.cents)
      }
    }
  }
  const accounts = [...new Set([...ps.keys(), ...md.keys(), ...d.keys()])].filter((a) => (ps.get(a) ?? 0) !== 0 || (md.get(a) ?? 0) !== 0 || (d.get(a) ?? 0) !== 0).sort()
  const row = (account: string, analytic: boolean): TrialRow => {
    const p = ps.get(account) ?? 0
    const m = md.get(account) ?? 0
    const c = d.get(account) ?? 0
    return { account, name: accountName(account, books.banks), ps: p, md: m, d: c, ks: p + m - c, analytic }
  }
  const classes: TrialClass[] = []
  const synthetics = [...new Set(accounts.map(synthetic))].sort()
  for (const s of synthetics) {
    const own = accounts.filter((a) => synthetic(a) === s)
    const analytics = own.filter((a) => a !== s)
    const rows: TrialRow[] = []
    if (analytics.length === 0) rows.push(row(s, false))
    else {
      // Lines written to the synthetic account itself stand as a row of their own among its analytic accounts.
      const parts = own.map((a) => (a === s ? { ...row(a, true), name: 'Bez analytického účtu' } : row(a, true)))
      rows.push({
        account: s,
        name: accountName(s, books.banks),
        ps: parts.reduce((sum, r) => sum + r.ps, 0),
        md: parts.reduce((sum, r) => sum + r.md, 0),
        d: parts.reduce((sum, r) => sum + r.d, 0),
        ks: parts.reduce((sum, r) => sum + r.ks, 0),
        analytic: false,
      })
      rows.push(...parts)
    }
    const cls = accountClass(s)
    let group = classes.find((c) => c.cls === cls)
    if (!group) {
      group = { cls, name: CLASSES[cls] ?? '', rows: [], ps: 0, md: 0, d: 0, ks: 0 }
      classes.push(group)
    }
    group.rows.push(...rows)
    const head = rows[0] as TrialRow
    group.ps += head.ps
    group.md += head.md
    group.d += head.d
    group.ks += head.ks
  }
  const total = (pick: (c: TrialClass) => number) => classes.reduce((sum, c) => sum + pick(c), 0)
  const costs = classes.find((c) => c.cls === 5)?.ks ?? 0
  const revenues = -(classes.find((c) => c.cls === 6)?.ks ?? 0)
  return { year, from, to, classes, ps: total((c) => c.ps), md: total((c) => c.md), d: total((c) => c.d), ks: total((c) => c.ks), costs, revenues, result: revenues - costs }
}

export interface AccountMove {
  entry: LedgerEntry
  /** The account on the other side of the line. */
  contra: string
  md: number
  d: number
  /** The balance after this line: debit plus. */
  balance: number
}

/** An account's movements in a year up to the end of a month (hlavná kniha): its opening balance, each line, its turnover. */
export function accountMoves(books: Books, account: string, year: number, through: number, exact = account.includes('.')): { ps: number; moves: AccountMove[]; md: number; d: number; ks: number } {
  const from = `${year}-01-01`
  const to = monthEnd(year, through)
  const matches = (wanted: string, acct: string) => (exact ? acct === wanted : synthetic(acct) === wanted)
  let ps = 0
  for (const [acct, cents] of yearOpening(books.entries, year)) if (matches(account, acct)) ps += cents
  const moves: AccountMove[] = []
  let balance = ps
  let md = 0
  let d = 0
  for (const e of books.entries) {
    if (e.on < from || e.on > to) continue
    for (const line of e.lines) {
      const debit = matches(account, line.md)
      const credit = matches(account, line.d)
      if (!debit && !credit) continue
      if (e.kind === 'opening') {
        ps += (debit ? line.cents : 0) - (credit ? line.cents : 0)
        balance = ps + md - d
        continue
      }
      if (debit) {
        md += line.cents
        balance += line.cents
        moves.push({ entry: e, contra: line.d, md: line.cents, d: 0, balance })
      }
      if (credit) {
        d += line.cents
        balance -= line.cents
        moves.push({ entry: e, contra: line.md, md: 0, d: line.cents, balance })
      }
    }
  }
  return { ps, moves, md, d, ks: ps + md - d }
}

/** The years the books have anything in, the newest first, and always this year. */
export function bookYears(books: Books, today: string): number[] {
  const years = new Set<number>([Number(today.slice(0, 4))])
  for (const e of books.entries) years.add(Number(e.on.slice(0, 4)))
  return [...years].filter((y) => y >= 2000 && y <= 2100).sort((a, b) => b - a)
}

// ---------------------------------------------------------------------------------------------------------------
// Open items and the bank
// ---------------------------------------------------------------------------------------------------------------

/** An item's part not settled yet. */
export const leftOf = (item: OpenItem): number => item.total - item.settled

/** The days an item is past its due day (0 when it is not). */
export function daysOverdue(item: OpenItem, today: string): number {
  if (!item.dueOn || item.dueOn >= today || leftOf(item) <= 0) return 0
  return Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${item.dueOn}T00:00:00Z`)) / 86_400_000)
}

export interface BankCheck {
  bank: LedgerBank
  /** The day compared: the bank's balance day, or today when the bank has said none. */
  on: string
  ledger: number
  balance: number | null
  /** What of the bank's payments up to that day is not in the books yet. */
  unposted: number
  /** What neither explains (the opening balance of the account, when it is not written in yet); null without the bank's balance. */
  rest: number | null
}

/** Each bank account against the books: its balance in the books on the day the bank last said its own. */
export function bankChecks(books: Books, today: string): BankCheck[] {
  return books.banks.map((bank) => {
    const on = bank.balanceOn ?? today
    const ledger = books.entries.filter((e) => e.on <= on).reduce((sum, e) => sum + e.lines.reduce((s, l) => s + (l.md === bank.ledger ? l.cents : 0) - (l.d === bank.ledger ? l.cents : 0), 0), 0)
    let unposted = 0
    for (const [id, cents] of books.unposted) {
      const p = books.payments.get(id)
      if (p && p.bankId === bank.id && p.bookedOn <= on) unposted += cents
    }
    const balance = bank.balanceCents
    return { bank, on, ledger, balance, unposted, rest: balance === null ? null : balance - ledger - unposted }
  })
}

// ---------------------------------------------------------------------------------------------------------------
// What the accountant writes herself
// ---------------------------------------------------------------------------------------------------------------

export type LineError = 'md' | 'd' | 'same' | 'amount'

/** The lines of an internal document as typed: an empty row is left out; every other row two accounts and an amount. */
export function readEntryRows(rows: readonly { md: string; d: string; amount: string }[]): { lines: LedgerLine[]; errors: Record<number, LineError> } {
  const lines: LedgerLine[] = []
  const errors: Record<number, LineError> = {}
  rows.forEach((row, i) => {
    if (row.md.trim() === '' && row.d.trim() === '' && row.amount.trim() === '') return
    const md = canonicalAccount(row.md)
    const d = canonicalAccount(row.d)
    const cents = centsOf(row.amount)
    if (!md) errors[i] = 'md'
    else if (!d) errors[i] = 'd'
    else if (md === d) errors[i] = 'same'
    else if (cents === null || Number.isNaN(cents) || cents <= 0) errors[i] = 'amount'
    else lines.push({ md, d, cents })
  })
  return { lines, errors }
}

export type OpeningError = 'account' | 'closing' | 'both' | 'amount'

/**
 * The opening balances as typed: an account and its balance on the debit side or on the credit side. Each becomes a
 * line against the opening balance account (701), which the balances leave at nought when they agree.
 */
export function readOpeningRows(rows: readonly { account: string; md: string; d: string }[]): { lines: LedgerLine[]; errors: Record<number, OpeningError>; md: number; d: number } {
  const lines: LedgerLine[] = []
  const errors: Record<number, OpeningError> = {}
  let md = 0
  let d = 0
  rows.forEach((row, i) => {
    if (row.account.trim() === '' && row.md.trim() === '' && row.d.trim() === '') return
    const account = canonicalAccount(row.account)
    const debit = centsOf(row.md)
    const credit = centsOf(row.d)
    if (!account) errors[i] = 'account'
    else if (accountClass(account) === 7) errors[i] = 'closing'
    else if (debit !== null && credit !== null) errors[i] = 'both'
    else {
      const cents = debit ?? credit
      if (cents === null || Number.isNaN(cents) || cents <= 0) errors[i] = 'amount'
      else if (debit !== null) {
        lines.push({ md: account, d: OPENING, cents })
        md += cents
      } else {
        lines.push({ md: OPENING, d: account, cents })
        d += cents
      }
    }
  })
  return { lines, errors, md, d }
}

/** The opening balances as rows of the form: an account and its debit or credit balance, in cents. */
export function openingRows(lines: readonly LedgerLine[]): { account: string; md: number | null; d: number | null }[] {
  return lines.map((line) => (line.d === OPENING ? { account: line.md, md: line.cents, d: null } : { account: line.d, md: null, d: line.cents }))
}

// ---------------------------------------------------------------------------------------------------------------
// The books as files (CSV for Slovak Excel)
// ---------------------------------------------------------------------------------------------------------------

const csv = (rows: (string | number | null)[][]) => `﻿${rows.map((row) => row.map((cell) => csvCell(cell)).join(';')).join('\r\n')}\r\n`

const SOURCE: Record<EntryKind, string> = { opening: 'počiatočný stav', document: 'doklad', payment: 'výpis z účtu', vat: 'priznanie DPH', internal: 'interný doklad' }

/** The number a journal prints for an entry: the document's own, or what the entry is. */
export function numberOf(e: LedgerEntry, books: Books): string {
  if (e.number) return e.number
  if (e.kind === 'payment') {
    const p = e.paymentId ? books.payments.get(e.paymentId) : undefined
    return p ? `VBÚ ${p.bank}` : 'VBÚ'
  }
  return e.kind === 'document' ? 'bez čísla' : ''
}

/** The journal of a year (účtovný denník): every line of every entry, in the order of their days. */
export function journalCsv(books: Books, year: number): string {
  const rows = books.entries.filter((e) => e.on.startsWith(`${year}-`))
  return csv([
    ['Dátum', 'Doklad', 'Text', 'MD', 'D', 'Suma', 'Zdroj'],
    ...rows.flatMap((e) => e.lines.map((line) => [e.on, numberOf(e, books), e.text, line.md, line.d, csvMoney(line.cents), SOURCE[e.kind]])),
  ])
}

/** The trial balance as a file. */
export function trialCsv(tb: TrialBalance): string {
  return csv([
    ['Účet', 'Názov účtu', 'Počiatočný stav', 'Obrat MD', 'Obrat D', 'Konečný stav'],
    ...tb.classes.flatMap((c) => [
      ...c.rows.map((r) => [r.account, r.name, csvMoney(r.ps), csvMoney(r.md), csvMoney(r.d), csvMoney(r.ks)]),
      [`Trieda ${c.cls}`, c.name, csvMoney(c.ps), csvMoney(c.md), csvMoney(c.d), csvMoney(c.ks)],
    ]),
    ['Spolu', '', csvMoney(tb.ps), csvMoney(tb.md), csvMoney(tb.d), csvMoney(tb.ks)],
    ['Náklady', '', '', '', '', csvMoney(tb.costs)],
    ['Výnosy', '', '', '', '', csvMoney(tb.revenues)],
    [tb.result >= 0 ? 'Zisk' : 'Strata', '', '', '', '', csvMoney(Math.abs(tb.result))],
  ])
}

/** The general ledger of a year (hlavná kniha): each account with its opening balance, its lines and its closing balance. */
export function generalLedgerCsv(books: Books, year: number): string {
  const tb = trialBalance(books, year, 12)
  const rows: (string | number | null)[][] = [['Účet', 'Názov účtu', 'Dátum', 'Doklad', 'Text', 'Protiúčet', 'MD', 'D', 'Zostatok']]
  for (const r of tb.classes.flatMap((c) => c.rows)) {
    if (!r.analytic && tb.classes.some((c) => c.rows.some((x) => x.analytic && synthetic(x.account) === r.account))) continue
    const { ps, moves, md, d, ks } = accountMoves(books, r.account, year, 12, r.analytic)
    rows.push([r.account, r.name, `${year}-01-01`, '', 'Počiatočný stav', '', '', '', csvMoney(ps)])
    for (const m of moves) rows.push([r.account, r.name, m.entry.on, numberOf(m.entry, books), m.entry.text, m.contra, m.md ? csvMoney(m.md) : '', m.d ? csvMoney(m.d) : '', csvMoney(m.balance)])
    rows.push([r.account, r.name, `${year}-12-31`, '', 'Spolu a konečný stav', '', csvMoney(md), csvMoney(d), csvMoney(ks)])
  }
  return csv(rows)
}

/** The open items (saldokonto) as they stand on a day. */
export function saldoCsv(books: Books, today: string): string {
  return csv([
    ['Účet', 'Číslo dokladu', 'Partner', 'Dátum', 'Splatnosť', 'Suma', 'Uhradené', 'Zostáva', 'Dní po splatnosti'],
    ...books.items
      .filter((item) => leftOf(item) !== 0)
      .map((item) => [
        item.account,
        item.number ?? '',
        item.party ?? '',
        item.on,
        item.dueOn ?? '',
        csvMoney(item.total),
        csvMoney(item.settled),
        csvMoney(leftOf(item)),
        daysOverdue(item, today) || '',
      ]),
  ])
}
