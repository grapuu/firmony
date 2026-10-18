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
import type { AssetEntry } from './assets'
import type { StockEntry } from './stock'
import { readableName } from './copy'
import { eurOf, rateFor, rateMicro, type RateMicro, type Rates } from './fx'
import { centsOf } from './invoices'
import { normalizeVs, type DocKind, type Exempt } from './match'
import { bratislavaDay, vatCompanyOf, vatDocOf, type Company, type Doc } from './store'
import { badDebtEvents, isIssued, periodRange, taxDay, unpaidEvents, vatOf, type FilingKind, type Rows, type VatData, type VatLine } from './vat'
import { groupedIban, periodName, rowsOf, type FiledReturn } from './vat-store'
import { settleTotal } from './vat-ratio'

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
  '079': 'Oprávky k ostatnému dlhodobému nehmotnému majetku',
  '081': 'Oprávky k stavbám',
  '082': 'Oprávky k samostatným hnuteľným veciam a súborom hnuteľných vecí',
  '089': 'Oprávky k ostatnému dlhodobému hmotnému majetku',
  '111': 'Obstaranie materiálu',
  '112': 'Materiál na sklade',
  '123': 'Výrobky',
  '131': 'Obstaranie tovaru',
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
  '472': 'Záväzky zo sociálneho fondu',
  '479': 'Ostatné dlhodobé záväzky',
  '501': 'Spotreba materiálu',
  '502': 'Spotreba energie',
  '504': 'Predaný tovar',
  '511': 'Opravy a udržiavanie',
  '512': 'Cestovné',
  '513': 'Náklady na reprezentáciu',
  '518': 'Ostatné služby',
  '521': 'Mzdové náklady',
  '523': 'Odmeny členom orgánov spoločnosti a družstva',
  '524': 'Zákonné sociálne poistenie',
  '527': 'Zákonné sociálne náklady',
  '531': 'Daň z motorových vozidiel',
  '538': 'Ostatné dane a poplatky',
  '541': 'Zostatková cena predaného dlhodobého nehmotného majetku a dlhodobého hmotného majetku',
  '544': 'Zmluvné pokuty, penále a úroky z omeškania',
  '545': 'Ostatné pokuty, penále a úroky z omeškania',
  '546': 'Odpis pohľadávky',
  '543': 'Dary',
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
  '613': 'Zmena stavu výrobkov',
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
/** VAT owed in other member states through the one-stop shop (oss.ts), paid with its quarterly return. */
export const VAT_OSS = '343.400'
export const TRANSIT = '261'
export const OWNER = '365'
export const OPENING = '701'

const ANALYTICS: Readonly<Record<string, string>> = {
  [VAT_IN]: 'DPH na vstupe (odpočet)',
  [VAT_OUT]: 'DPH na výstupe',
  [VAT_SETTLE]: 'DPH, zúčtovanie s daňovým úradom',
  [VAT_OSS]: 'DPH iných štátov EÚ (OSS)',
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
  /** The document a line of an entry of several documents belongs to (a payment's exchange difference), when not the entry's own. */
  docId?: string
}

export type EntryKind = 'opening' | 'document' | 'payment' | 'cash' | 'vat' | 'payroll' | 'asset' | 'stock' | 'internal' | 'fx'

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
  /** A payroll month's cost of work of each cost centre's employees (centers.ts), a part of the entry's costs. */
  centerCosts?: { center: string; cents: number }[]
}

export interface LedgerPayment {
  id: string
  bookedOn: string
  amountCents: number
  currency: string
  party: string | null
  /** The other side's account, when the bank gave it: a tax paid to the State Treasury is told by its prefix. */
  partyIban?: string | null
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
  /** The balance the bank last said, and on which day (in the account's currency). */
  balanceCents: number | null
  balanceOn: string | null
  /** Its currency, when not the euro (a foreign currency account). */
  currency?: string | null
}

export interface ManualEntry {
  id: string
  /** The accountant's internal document, the opening balances, or a cash document of the cash box (cash.ts). */
  kind: 'internal' | 'opening' | 'cash'
  /** A cash document that pays an invoice: the invoice's document, whose open item it settles. */
  documentId?: string | null
  number: string | null
  on: string
  text: string
  lines: LedgerLine[]
  createdAt: number
  createdByName: string | null
}

/** A month's payroll closed (payroll-store.ts), as the books take it: the wages, each side's insurance, the tax withheld. */
export interface LedgerPayroll {
  period: string
  /** What the month costs in wages (the assessment base and the sick pay), and by account (521, 523, 527) when told. */
  gross: number
  costs?: { account: string; cents: number }[]
  socialEmployee: number
  socialEmployer: number
  healthEmployee: number
  healthEmployer: number
  /** The advances withheld less the bonuses (minus: the bonuses paid over them). */
  tax: number
  /** What each payment of it comes to: the Social Insurance Agency's, each health insurer's, the tax office's. */
  pays: { social: number; health: number[]; tax: number; garnish?: number[]; garnishIban?: string[] }
  /** Meals (meals.ts): vouchers out of their stock (213), the financial contribution with the wage (331). */
  meals?: { voucher: { employer: number; fund: number; employee: number }; cash: { employer: number; fund: number } }
  /** The social fund's mandatory allocation of the month (social-fund.ts): 527 against 472. */
  socialFund?: number
  /** The month's cost of work of the employees of each cost centre (centers.ts), out of the entry's costs. */
  centerCosts?: { center: string; cents: number }[]
  /** The deductions for executions (garnish.ts): owed to the executors, 331 against 379. */
  garnish?: number
}

/** The analytic accounts of 336: the Social Insurance Agency and the health insurers. */
export const SOCIAL_ACCOUNT = '336.100'
export const HEALTH_ACCOUNT = '336.200'

export interface LedgerInput {
  company: Company
  /** Every document of the company that is not deleted, booked or not. */
  docs: Doc[]
  payments: LedgerPayment[]
  banks: LedgerBank[]
  filed: FiledReturn[]
  manual: ManualEntry[]
  /** The months of payroll closed. */
  payroll?: LedgerPayroll[]
  /** The register's entries (assets.ts, assetEntries): putting in use, each month's depreciation, each disposal. */
  assets?: AssetEntry[]
  /** The stock's entries (stock.ts, stockEntries): each month's receipts and issues, each count. */
  stock?: StockEntry[]
  /** The ECB's reference rates of the currencies the documents and payments are in (fx-store.ts). */
  rates?: Rates
  /** Today in Bratislava: a correction under § 53b whose day has not come yet is not in the books. */
  today?: string
}

/** An invoice's open item (saldokonto): what it comes to on its account and what of it was settled. */
export interface OpenItem {
  docId: string
  /** Customers 311, suppliers 321, or employees 333 for travel compensation owed (`payableOf`). */
  account: '311' | '321' | '333'
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
  /** Payments in another currency than the euro without a rate of the day before them, which are not booked. */
  foreign: string[]
  /** Booked documents in another currency without a rate (none given, none kept for the day before them): not in the books yet. */
  unrated?: string[]
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
  /** The day each document belongs to, booked or not (its entry's, else the day it was issued); null when it has none yet. */
  docDays: Map<string, string | null>
  payments: Map<string, LedgerPayment>
  banks: LedgerBank[]
  /** The months of payroll closed, which tell a payroll payment's account. */
  payroll: LedgerPayroll[]
}

/**
 * The account an invoice's open item stands on: an issued one on customers (311); a received one on suppliers (321),
 * or, for what the category says is owed to somebody else (an employee's travel compensation), on that account.
 */
export function payableOf(doc: Pick<Doc, 'kind' | 'category'>): OpenItem['account'] {
  if (doc.kind === 'invoice_out') return '311'
  return doc.category && CATEGORIES[doc.category]?.payable === '333' ? '333' : '321'
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
  /** In euros: a document in another currency at its rate. */
  gross: number
  /** What the bank moves to settle it: out minus, in plus. */
  expected: number
  data: VatData | null
  /** In another currency than the euro, at `rate` (millionths; null when the amount was given in euros). */
  foreign: boolean
  rate: RateMicro | null
  /** In another currency and no rate known: no entry until there is one. */
  unrated: boolean
}

/**
 * What the books need of a document: its day, whether it is a credit note, its amount in euros and what settles it. A
 * document in another currency at the rate the accountant confirmed, else the ECB's of the day before its day (§ 24 of
 * the Act on Accounting), or at `gross` when its euros are known (a receipt paid from a euro account). Null when it
 * makes no entry.
 */
function planOf(doc: Doc, company: Company, rates?: Rates, gross?: number): Plan | null {
  // A final invoice its advances paid whole comes to nought and still moves their base from 324 to the revenue.
  if (!isAccountingDoc(doc.kind) || doc.totalCents === null || (doc.totalCents === 0 && !(doc.kind === 'invoice_out' && doc.advanceCents > 0))) return null
  const data = company.vatStatus === 'none' ? null : (vatOf(vatDocOf(doc), vatCompanyOf(company))?.data ?? null)
  const lines: { base: number; vat: number }[] = data ? data.lines : doc.linesHint
  const corrects = (data ? data.corrects : doc.correctsHint) ?? ''
  const credit = corrects !== '' && lines.reduce((sum, line) => sum + line.base + line.vat, 0) < 0
  // A credit note read from a supplier's file is a plus with minus lines; one issued here keeps its minus in the total
  // too. Either is the amount it takes back; a minus that corrects nothing makes no entry.
  if (doc.totalCents < 0 && !credit) return null
  const total = Math.abs(doc.totalCents)
  const on = data?.suppliedOn ?? doc.suppliedOn ?? doc.issuedOn ?? bratislavaDay(doc.createdAt)
  const currency = doc.currency ?? 'EUR'
  const foreign = currency !== 'EUR'
  const rate = foreign && gross === undefined ? (rateMicro(doc.fxRate) ?? (rates ? (rateFor(rates, currency, on)?.rate ?? null) : null)) : null
  const amount = gross ?? (foreign ? (rate !== null ? eurOf(total, rate) : null) : total)
  if (amount === null) return { on, credit, gross: 0, expected: 0, data, foreign, rate: null, unrated: true }
  const expected = (doc.kind === 'invoice_out' ? 1 : -1) * (credit ? -1 : 1) * amount
  return { on, credit, gross: amount, expected, data, foreign, rate, unrated: false }
}

/**
 * The entry of a document as the books take it: `entryFor` with the VAT the return counts (what is deducted, what is
 * owed, what the company pays itself on what it bought from abroad), on the analytic accounts 343.100 and 343.200,
 * with the account that paid a receipt, and the other way for a credit note. Empty when the document makes none.
 */
export function documentLines(doc: Doc, company: Company, how: { paidBy: PaidBy; contra?: string | null; rates?: Rates; gross?: number; plan?: Plan | null }): LedgerLine[] {
  // The books pass the plan they worked out already (its VAT is the costly part), made with the same rates and euros.
  const plan = how.plan !== undefined ? how.plan : planOf(doc, company, how.rates, how.gross)
  if (!plan || plan.unrated || !doc.category) return []
  const payer = company.vatStatus === 'payer'
  const { data, credit } = plan
  const sign = credit ? -1 : 1
  const sum = (pick: (line: VatLine) => number) => (data ? Math.max(0, sign * data.lines.reduce((total, line) => total + pick(line), 0)) : 0)
  let vatCents = 0
  let deduct = false
  let selfVat: { cents: number; deduct: boolean; deductCents: number } | null = null
  const oss = data?.mode === 'oss'
  if (data) {
    if (isIssued(doc.kind)) vatCents = (payer && data.mode === 'domestic') || oss ? sum((line) => line.vat) : 0
    else if (data.mode === 'domestic' || data.mode === 'import') {
      // VAT paid to the customs office is part of what its document asks for, as a Slovak supplier's VAT.
      vatCents = payer ? sum((line) => line.deduct) : 0
      deduct = vatCents > 0
    } else if (data.mode === 'reverse' || data.mode === 'acquisition' || data.mode === 'triangle_in' || data.mode === 'import84a') {
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
    vatPayer: payer || oss,
    vatDeduct: deduct,
    paidBy: how.paidBy,
    // A company that keeps its goods continuously (stock.ts, method A) buys them to their acquisition (131).
    account: doc.account ?? (company.stockMethod === 'A' && doc.category === 'goods' ? '131' : null),
    selfVat,
    contra: how.contra ?? null,
  })
  const registered = company.vatStatus !== 'none'
  // A final invoice deducting advances received: their base leaves 324 for the revenue (their VAT was settled on the
  // advances' own tax documents).
  const revenueAccount = doc.account && /^\d{3,6}$/.test(doc.account) ? doc.account : CATEGORIES[doc.category].account
  const advance: typeof raw = isIssued(doc.kind) && doc.advanceCents > 0 && CATEGORIES[doc.category].revenue && doc.category !== 'advance' ? [{ md: '324', d: revenueAccount, cents: doc.advanceCents, what: 'revenue' }] : []
  const lines = [...raw, ...advance]
    .filter((line) => line.cents > 0)
    .map((line) => {
      const md = registered && line.md === '343' ? VAT_IN : (canonicalAccount(line.md) ?? line.md)
      const d = line.d === '343' && oss ? VAT_OSS : registered && line.d === '343' ? VAT_OUT : (canonicalAccount(line.d) ?? line.d)
      return credit ? { md: d, d: md, cents: line.cents, what: line.what } : { md, d, cents: line.cents, what: line.what }
    })
  if (doc.source !== 'takings' || credit) return lines
  // The day's takings of a till (takings.ts) are paid at the till: the cash part into the cash box (211), the rest by
  // card, money on its way (261) until the bank brings it; no customer owes them (311).
  let cash = Math.max(0, Math.min(doc.takingsCash ?? 0, plan.gross))
  return lines.flatMap((line) => {
    if (line.md !== '311') return [line]
    const inCash = Math.min(cash, line.cents)
    cash -= inCash
    return [...(inCash > 0 ? [{ ...line, md: '211', cents: inCash }] : []), ...(line.cents > inCash ? [{ ...line, md: TRANSIT, cents: line.cents - inCash }] : [])]
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
export function bookingLines(doc: Doc, company: Company, payment: { bookedOn: string; amountCents: number; bankLedger: string; docs: number; currency?: string } | null, rates?: Rates): LedgerLine[] {
  // A receipt in another currency paid alone from a euro account is the euros the bank took.
  const paidEuros = doc.kind === 'receipt' && payment && (doc.currency ?? 'EUR') !== 'EUR' && (payment.currency ?? 'EUR') === 'EUR' && payment.docs === 1 ? Math.abs(payment.amountCents) : undefined
  const plan = planOf(doc, company, rates, paidEuros)
  if (!plan || plan.unrated) return []
  if (doc.kind === 'receipt' && payment) {
    const { contra } = receiptContra(plan, { bookedOn: payment.bookedOn, amountCents: payment.amountCents, bank: payment.bankLedger }, payment.docs)
    return documentLines(doc, company, { paidBy: 'bank', contra, rates, gross: paidEuros })
  }
  const lines = documentLines(doc, company, { paidBy: payment ? 'bank' : doc.paidPrivately ? 'private' : doc.kind === 'receipt' ? 'cash' : 'unpaid', rates })
  // A received invoice the owner paid himself: the company owes it to him now.
  const owed = payableOf(doc)
  if (doc.kind === 'invoice_in' && !payment && doc.paidPrivately && lines.length > 0)
    lines.push(plan.credit ? { md: OWNER, d: owed, cents: plan.gross, what: 'payable' } : { md: owed, d: OWNER, cents: plan.gross, what: 'payable' })
  return lines
}

// ---------------------------------------------------------------------------------------------------------------
// A payment that needs no document
// ---------------------------------------------------------------------------------------------------------------

/**
 * Which tax a payment to the State Treasury pays, by the prefix of the account it went to (IBAN SKkk 8180 PPPPPP
 * AAAAAAAAAA): 500240 VAT, 500224 the income tax of a legal person and its advances, 500259 the tax withheld from
 * wages. Null for any other account, or when the bank did not say where the money went.
 */
export function treasuryTax(iban: string | null | undefined): 'vat' | 'income' | 'wage' | 'other' | null {
  const plain = (iban ?? '').replace(/\s/g, '').toUpperCase()
  const m = /^SK\d{2}8180(\d{6})\d{10}$/.exec(plain)
  if (!m) return null
  return m[1] === '500240' ? 'vat' : m[1] === '500224' ? 'income' : m[1] === '500259' ? 'wage' : 'other'
}

/**
 * The account of a payment's reason, when it says it plainly: a bank's fee 568 and its interest 662, money between the
 * company's own accounts 261 (both sides of a transfer meet there), VAT paid to or refunded by the tax office 343.300
 * (its variable symbol begins 1100, and it went to VAT's account if the bank says where), the income tax and its
 * advances 341 (the account of the income tax of legal persons, prefix 500224: an advance's symbol begins 1100 as
 * VAT's does; the tax of a year has its own, 170099 and the year), capital paid in 353, money the owner lent or got
 * back 365, wages paid 331, and of payroll the sums a closed month owes the Social Insurance Agency (336.100), a health
 * insurer (336.200) and the tax office (342, also by its account's prefix 500259). Null when the accountant decides
 * (another tax, insurance, anything else).
 */
export function reasonAccount(p: Pick<LedgerPayment, 'amountCents' | 'vs' | 'note' | 'exempt' | 'exemptNote' | 'partyIban'>, payroll: readonly LedgerPayroll[] = []): string | null {
  const tax = p.exempt === 'state' || p.exempt === 'payroll' ? treasuryTax(p.partyIban) : null
  if (tax === 'income') return '341'
  if (tax === 'wage') return '342'
  // Payroll paid out: the sum due to the Social Insurance Agency, to a health insurer or to the tax office of a month
  // closed is that, whether the client marked it "payroll" or the app took it for the state's (the Agency's and VšZP's
  // accounts are at the State Treasury too); anything else marked "payroll" is wages.
  if ((p.exempt === 'payroll' || p.exempt === 'state') && p.amountCents < 0) {
    const out = -p.amountCents
    // A deduction paid to an executor (garnish.ts): to his account first (also what was kept until his execution order and
    // paid later), whatever its amount; then by the amount of a deduction paid with the wages.
    const to = (p.partyIban ?? '').replace(/\s/g, '').toUpperCase()
    if (to !== '' && payroll.some((r) => r.pays.garnishIban?.includes(to))) return '379'
    if (payroll.some((r) => r.pays.social === out)) return SOCIAL_ACCOUNT
    if (payroll.some((r) => r.pays.health.includes(out))) return HEALTH_ACCOUNT
    if (payroll.some((r) => r.pays.tax === out)) return '342'
    if (payroll.some((r) => r.pays.garnish?.includes(out))) return '379'
  }
  if (p.exempt === 'state' && (tax === 'vat' || tax === null) && /^1100\d{6}$/.test(normalizeVs(p.vs))) return VAT_SETTLE
  if (p.exempt === 'state' && tax === null && /^170099\d{4}$/.test(normalizeVs(p.vs))) return '341'
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
export function paymentContra(p: LedgerPayment, payroll: readonly LedgerPayroll[] = []): string | null {
  const given = canonicalAccount(p.contra)
  if (given && synthetic(given) !== '221') return given
  // A later payroll must never reclassify an earlier payment, including one in a locked period.
  return reasonAccount(p, payroll.filter((run) => run.period <= p.bookedOn.slice(0, 7)))
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

/** The tax a return owes (rows 17, 25 and 27) and deducts (rows 18, 18a and 19, less rows 28 and 29). */
export const vatOwed = (rows: Rows): number => rows.r17 + rows.r25 + rows.r27
/** What a return deducts: rows 18, 18a and 19, less the corrections of row 28 (§ 53) and row 29 (§ 53b). */
export const vatDeducted = (rows: Rows): number => rows.r18 + rows.r18a + rows.r19 - rows.r28 - rows.r29

function settlementLines(owed: number, deducted: number): LedgerLine[] {
  const lines: LedgerLine[] = []
  if (owed > 0) lines.push({ md: VAT_OUT, d: VAT_SETTLE, cents: owed })
  if (owed < 0) lines.push({ md: VAT_SETTLE, d: VAT_OUT, cents: -owed })
  if (deducted > 0) lines.push({ md: VAT_SETTLE, d: VAT_IN, cents: deducted })
  if (deducted < 0) lines.push({ md: VAT_IN, d: VAT_SETTLE, cents: -deducted })
  return lines
}

const ORDER: Record<EntryKind, number> = { opening: 0, document: 1, payment: 2, cash: 2, vat: 3, payroll: 4, asset: 5, stock: 6, internal: 7, fx: 8 }

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
  const issues: BookIssues = { unbooked: [], noEntry: [], classify: [], waiting: [], missing: [], foreign: [], unrated: [], beforeStart: { docs: 0, payments: 0 } }
  const items = new Map<string, OpenItem>()
  const unposted = new Map<string, number>()
  const documented = new Set<string>()
  const docDays = new Map<string, string | null>()
  const payments = new Map(input.payments.map((p) => [p.id, p]))
  const inBooks = (day: string) => !start || day >= start

  // Each payment's documents, and the part of the payment that settles each (in the order of their days; the last
  // takes what is left, so the parts always make the payment).
  const docsOf = new Map<string, Doc[]>()
  for (const d of input.docs) if (d.paymentId) docsOf.set(d.paymentId, [...(docsOf.get(d.paymentId) ?? []), d])
  const rates: Rates = input.rates ?? new Map()
  // Each payment in euros: one of a foreign currency account at the ECB's rate of the day before it (§ 24 of the Act on
  // Accounting); null when no rate is kept for it.
  const eurosOf = new Map<string, number | null>()
  for (const p of input.payments) {
    if ((p.currency ?? 'EUR') === 'EUR') eurosOf.set(p.id, p.amountCents)
    else {
      const r = rateFor(rates, p.currency, p.bookedOn)
      eurosOf.set(p.id, r ? eurOf(p.amountCents, r.rate) : null)
    }
  }
  const plans = new Map<string, Plan>()
  for (const d of input.docs) {
    let plan = planOf(d, company, rates)
    // A receipt in another currency paid alone (a card abroad): the euros the bank took for it.
    if (plan && d.kind === 'receipt' && plan.foreign && d.paymentId) {
      const euros = eurosOf.get(d.paymentId)
      const alone = (docsOf.get(d.paymentId) ?? []).filter((x) => isAccountingDoc(x.kind)).length === 1
      if (alone && typeof euros === 'number' && euros !== 0) plan = planOf(d, company, rates, Math.abs(euros))
    }
    if (plan) plans.set(d.id, plan)
    docDays.set(d.id, plan?.on ?? d.issuedOn ?? bratislavaDay(d.createdAt))
  }
  /** The euros a document's entry is made of when they are not its own at a rate (a receipt paid alone from a euro account). */
  const grossOf = (plan: Plan): number | undefined => (plan.foreign && plan.rate === null ? plan.gross : undefined)
  const shareOf = new Map<string, number>()
  for (const [paymentId, linked] of docsOf) {
    const p = payments.get(paymentId)
    const euros = eurosOf.get(paymentId)
    if (!p || euros === null || euros === undefined) continue
    // Documents in another currency last: what the payment differs from their euros by is their exchange difference.
    const accounting = linked
      .filter((d) => isAccountingDoc(d.kind))
      .sort((a, b) => Number(plans.get(a.id)?.foreign ?? false) - Number(plans.get(b.id)?.foreign ?? false) || (plans.get(a.id)?.on ?? '').localeCompare(plans.get(b.id)?.on ?? '') || a.id.localeCompare(b.id))
    let left = euros
    accounting.forEach((d, i) => {
      const share = i === accounting.length - 1 ? left : (plans.get(d.id)?.expected ?? 0)
      shareOf.set(d.id, share)
      left -= share
    })
  }

  // Documents.
  const booked = new Set<string>()
  const direct = new Set<string>()
  /** The invoices in another currency at a rate, with their amount in it (in their open item's direction): revalued at each year's end, their payment's difference booked. */
  const foreignOf = new Map<string, { currency: string; cents: number }>()
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
        // An open item taken over from the accountant before (takeover.ts): the opening balances hold it on 311 or 321,
        // so it stands in the open items and the payment that comes later settles it there.
        if (doc.source === 'takeover' && (doc.kind === 'invoice_in' || doc.kind === 'invoice_out')) {
          booked.add(doc.id)
          items.set(doc.id, { docId: doc.id, account: doc.kind === 'invoice_out' ? '311' : '321', on: plan.on, dueOn: doc.dueOn, number: doc.number, party: doc.party, total: plan.gross, settled: 0 })
        }
        continue
      }
      if (plan.unrated) {
        issues.unrated?.push(doc.id)
        continue
      }
      if (doc.kind === 'receipt' && pay) {
        const euros = eurosOf.get(pay.id)
        const usable = typeof euros === 'number' && inBooks(pay.bookedOn)
        const accounting = (docsOf.get(pay.id) ?? []).filter((d) => isAccountingDoc(d.kind)).length
        const paid = usable ? receiptContra(plan, { ...pay, amountCents: euros }, accounting) : { contra: TRANSIT, on: plan.on }
        if (paid.contra !== TRANSIT) direct.add(doc.id)
        on = paid.on
        lines = documentLines(doc, company, { paidBy: 'bank', contra: paid.contra, rates, gross: grossOf(plan), plan })
      } else {
        lines = documentLines(doc, company, { paidBy: pay ? 'bank' : doc.paidPrivately ? 'private' : doc.kind === 'receipt' ? 'cash' : 'unpaid', rates, gross: grossOf(plan), plan })
      }
    }
    if (!plan || lines.length === 0) {
      issues.noEntry.push(doc.id)
      continue
    }
    booked.add(doc.id)
    entries.push({ key: `d:${doc.id}`, on, kind: 'document', number: doc.number ?? '', text: docText(doc), docId: doc.id, paymentId: pay?.id ?? null, manualId: null, lines })
    // The day's takings of a till are paid at the till: no open item (takings.ts).
    if ((doc.kind === 'invoice_in' || doc.kind === 'invoice_out') && doc.source !== 'takings') {
      const account = payableOf(doc)
      const item: OpenItem = { docId: doc.id, account, on: plan.on, dueOn: doc.dueOn, number: doc.number, party: doc.party, total: (plan.credit ? -1 : 1) * plan.gross, settled: 0 }
      items.set(doc.id, item)
      if (plan.foreign && plan.rate !== null && doc.currency && doc.totalCents !== null) foreignOf.set(doc.id, { currency: doc.currency, cents: (plan.credit ? -1 : 1) * Math.abs(doc.totalCents) })
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
          lines: [plan.credit ? { md: OWNER, d: account, cents: plan.gross } : { md: account, d: OWNER, cents: plan.gross }],
        })
        item.settled = item.total
      }
    }
  }

  // Each year's end: an invoice in another currency still open at it, at the ECB's rate of that day (§ 24), the
  // difference to 563 or 663 (Kurzové straty, Kurzové zisky; FR SR 931674); its payment later settles what
  // it stands at since. A year whose rate is not kept yet (it has not ended) is not revalued.
  const lastRateYear = Math.max(0, ...[...rates.values()].map((list) => Number(list[list.length - 1]?.[0].slice(0, 4) ?? 0)))
  const docById = new Map(input.docs.map((d) => [d.id, d]))
  const revalued = new Map<number, LedgerLine[]>()
  const yearRate = (currency: string, y: number) => {
    const r = rateFor(rates, currency, `${y}-12-31`, 'onOrBefore')
    return r && r.day >= `${y}-12-28` ? r.rate : null
  }
  for (const [docId, f] of foreignOf) {
    const item = items.get(docId)
    const doc = docById.get(docId)
    if (!item || !doc) continue
    const payDay = doc.paymentId ? (payments.get(doc.paymentId)?.bookedOn ?? null) : null
    let carrying = item.total
    for (let y = Number(item.on.slice(0, 4)); y <= lastRateYear; y++) {
      const end = `${y}-12-31`
      if (item.on > end || !inBooks(end)) continue
      if (payDay && payDay <= end) break
      const rate = yearRate(f.currency, y)
      if (rate === null) break
      const value = eurOf(f.cents, rate)
      const diff = value - carrying
      if (diff !== 0) {
        const grows = diff > 0
        const line: LedgerLine =
          item.account === '311'
            ? grows
              ? { md: '311', d: '663', cents: diff }
              : { md: '563', d: '311', cents: -diff }
            : grows
              ? { md: '563', d: item.account, cents: diff }
              : { md: item.account, d: '663', cents: -diff }
        revalued.set(y, [...(revalued.get(y) ?? []), line])
        item.settled -= diff
        carrying = value
      }
    }
  }
  for (const [y, lines] of revalued) entries.push({ key: `fx:${y}`, on: `${y}-12-31`, kind: 'fx', number: `KR ${y}`, text: `Kurzové rozdiely k 31. 12. ${y}: pohľadávky a záväzky v cudzej mene`, docId: null, paymentId: null, manualId: null, lines })

  // Payments.
  for (const p of input.payments) {
    if (!inBooks(p.bookedOn)) {
      issues.beforeStart.payments++
      continue
    }
    const amount = eurosOf.get(p.id) ?? null
    if (amount === null) {
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
        const account = d.kind === 'receipt' ? TRANSIT : payableOf(d)
        lines.push(lineOf(account, p.bank, share))
        const item = items.get(d.id)
        if (item) item.settled += account === '311' ? share : -share
        // An invoice in another currency is settled whole by its payment: what is left of it is the exchange difference.
        const left = item && foreignOf.has(d.id) ? item.total - item.settled : 0
        if (item && left !== 0) {
          // Each document's difference names it: a payment of several documents of several cost centres (centers.ts).
          if (item.account !== '311') lines.push(left > 0 ? { md: item.account, d: '663', cents: left, docId: d.id } : { md: '563', d: item.account, cents: -left, docId: d.id })
          else lines.push(left > 0 ? { md: '563', d: '311', cents: left, docId: d.id } : { md: '311', d: '663', cents: -left, docId: d.id })
          item.settled = item.total
        }
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
      if (amount - posted !== 0) unposted.set(p.id, p.currency === 'EUR' ? amount - posted : p.amountCents)
      continue
    }
    const contra = paymentContra(p, input.payroll ?? [])
    if (contra && amount !== 0) {
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
        lines: [lineOf(contra, p.bank, amount)],
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

  // § 53b (vat.ts unpaidEvents): the VAT deducted from a supplier's invoice not paid within 100 days of its due day leaves
  // the deduction (it is owed back to the state until the invoice is paid: 378 against 343.100), and comes back with the
  // payment (343.100 against 378); the return of each period then moves it with row 29.
  if (company.vatStatus === 'payer') {
    const vc = vatCompanyOf(company)
    const filedOn = new Map(input.filed.map((f) => [f.period, f.filedOn]))
    for (const d of input.docs) {
      // Only what the return holds: an invoice in the books (its own entry made) and of our VAT (not before the registration).
      if (d.kind !== 'invoice_in' || !d.bookedAt || !d.dueOn || !booked.has(d.id)) continue
      const vd = vatDocOf(d)
      const data = vatOf(vd, vc)?.data
      if (!data || (vc.since && taxDay(vd, data) < vc.since)) continue
      for (const e of unpaidEvents(vd, data, vc, filedOn)) {
        if (!inBooks(e.on) || (input.today && e.on > input.today)) continue
        const deducted = e.lines.reduce((sum, line) => sum + line.deduct, 0)
        entries.push({
          key: `53b:${d.id}:${e.kind}:${e.on}`,
          on: e.on,
          kind: 'vat',
          number: d.number ?? '',
          text:
            e.kind === 'correct'
              ? `Oprava odpočítanej dane, faktúra nezaplatená do 100 dní od splatnosti (§ 53b): ${d.party ?? ''}`
              : e.credit
                ? `Oprava opravenej odpočítanej dane po opravnom doklade dodávateľa (§ 53b): ${d.party ?? ''}`
                : `Oprava opravenej odpočítanej dane po zaplatení (§ 53b): ${d.party ?? ''}`,
          docId: d.id,
          paymentId: null,
          manualId: null,
          lines: [e.kind === 'correct' ? { md: '378', d: VAT_IN, cents: deducted } : { md: VAT_IN, d: '378', cents: deducted }],
        })
      }
    }
  }

  // § 25a (vat.ts badDebtEvents): an issued invoice's claim lowered once uncollectible takes its VAT off what is owed
  // (343.200 against 311, the open item lowered by it), and a payment that comes later puts the share it pays back (311
  // against 343.200); the return of each period then moves it with row 27.
  if (company.vatStatus === 'payer') {
    const vc = vatCompanyOf(company)
    for (const d of input.docs) {
      if (d.kind !== 'invoice_out' || !booked.has(d.id) || !d.badDebts?.length) continue
      const vd = vatDocOf(d)
      const data = vatOf(vd, vc)?.data
      if (!data || (vc.since && taxDay(vd, data) < vc.since)) continue
      for (const e of badDebtEvents(vd, data, vc)) {
        if (e.kind === 'void' || !inBooks(e.on) || (input.today && e.on > input.today)) continue
        const vat = e.lines.reduce((sum, line) => sum + line.vat, 0)
        if (vat === 0) continue
        const account = payableOf(d)
        entries.push({
          key: `25a:${d.id}:${e.kind}:${e.on}`,
          on: e.on,
          kind: 'vat',
          number: e.number ?? d.number ?? '',
          text: e.kind === 'reduce' ? `Oprava dane pri nevymožiteľnej pohľadávke (§ 25a): ${d.party ?? ''}` : `Oprava zníženej dane po prijatej platbe (§ 25a): ${d.party ?? ''}`,
          docId: d.id,
          paymentId: null,
          manualId: null,
          lines: [e.kind === 'reduce' ? { md: VAT_OUT, d: account, cents: vat } : { md: account, d: VAT_OUT, cents: vat }],
        })
        const item = items.get(d.id)
        if (item) item.settled += e.kind === 'reduce' ? vat : -vat
      }
    }
  }

  // The year's settlement of the proportional deduction (§ 50(4), vat-ratio.ts), once confirmed, on 31 December: more
  // deducted lowers the costs (343.100 against 548), less deducted is a cost (548 against 343.100); the return of the
  // year's last period then moves it to 343.300 with the rest of rows 18 to 19.
  if (company.vatStatus === 'payer') {
    for (const r of company.vatRatios ?? []) {
      if (!r.settled) continue
      const total = settleTotal(r.settled)
      const end = `${r.year}-12-31`
      if (total === 0 || !inBooks(end)) continue
      entries.push({
        key: `koef:${r.year}`,
        on: end,
        kind: 'vat',
        number: `KOEF ${r.year}`,
        text: `Vysporiadanie odpočítanej dane koeficientom za rok ${r.year} (§ 50 ods. 4)`,
        docId: null,
        paymentId: null,
        manualId: null,
        lines: [total > 0 ? { md: VAT_IN, d: '548', cents: total } : { md: '548', d: VAT_IN, cents: -total }],
      })
    }
  }

  // Payroll of each month closed, on its last day: the wages, the employee's insurance and tax withheld from them,
  // the employer's insurance on top.
  for (const r of input.payroll ?? []) {
    const end = periodRange(r.period).to
    if (!inBooks(end)) continue
    const lines: LedgerLine[] = [
      ...(r.costs ?? [{ account: '521', cents: r.gross }]).map((c) => ({ md: c.account, d: '331', cents: c.cents })),
      { md: '331', d: SOCIAL_ACCOUNT, cents: r.socialEmployee },
      { md: '331', d: HEALTH_ACCOUNT, cents: r.healthEmployee },
      r.tax >= 0 ? { md: '331', d: '342', cents: r.tax } : { md: '342', d: '331', cents: -r.tax },
      { md: '524', d: SOCIAL_ACCOUNT, cents: r.socialEmployer },
      { md: '524', d: HEALTH_ACCOUNT, cents: r.healthEmployer },
      // Meals: the employer's part a cost (527), the social fund's out of it (472); vouchers leave their stock (213),
      // the employee's part of them taken off the wage (331); a financial contribution is owed with the wage (331).
      { md: '527', d: '213', cents: r.meals?.voucher.employer ?? 0 },
      { md: '472', d: '213', cents: r.meals?.voucher.fund ?? 0 },
      { md: '331', d: '213', cents: r.meals?.voucher.employee ?? 0 },
      { md: '527', d: '331', cents: r.meals?.cash.employer ?? 0 },
      { md: '472', d: '331', cents: r.meals?.cash.fund ?? 0 },
      // The social fund's mandatory allocation (Act No. 152/1994 Z. z.), created by the payday: a cost of the month.
      { md: '527', d: '472', cents: r.socialFund ?? 0 },
      // The deductions for executions (garnish.ts): owed to the executors until paid (379).
      { md: '331', d: '379', cents: r.garnish ?? 0 },
    ].filter((l) => l.cents > 0)
    if (lines.length > 0)
      entries.push({
        key: `w:${r.period}`,
        on: end,
        kind: 'payroll',
        number: `MZDY ${r.period.slice(5, 7)}/${r.period.slice(0, 4)}`,
        text: `Mzdy za ${periodName(r.period)}`,
        docId: null,
        paymentId: null,
        manualId: null,
        lines,
        ...(r.centerCosts?.length ? { centerCosts: r.centerCosts } : {}),
      })
  }

  // The register of fixed assets: putting in use, each month's depreciation, each disposal, all within the books.
  for (const a of input.assets ?? []) {
    if (!inBooks(a.on)) continue
    entries.push({
      key: a.key,
      on: a.on,
      kind: 'asset',
      number: a.number,
      text: a.text,
      docId: null,
      paymentId: null,
      manualId: null,
      lines: a.lines.map((l) => ({ ...l })),
      ...(a.centerCosts?.length ? { centerCosts: a.centerCosts.map((x) => ({ ...x })) } : {}),
    })
  }

  // The stock's receipts, issues and counts.
  for (const e of input.stock ?? []) {
    if (!inBooks(e.on)) continue
    entries.push({
      key: e.key,
      on: e.on,
      kind: 'stock',
      number: e.number,
      text: e.text,
      docId: null,
      paymentId: null,
      manualId: null,
      lines: e.lines.map((l) => ({ ...l })),
      ...(e.centerCosts?.length ? { centerCosts: e.centerCosts.map((x) => ({ ...x })) } : {}),
    })
  }

  // What the accountant wrote herself, and the cash documents; one that pays an invoice in cash settles its open item.
  for (const m of input.manual) {
    entries.push({ key: `m:${m.id}`, on: m.on, kind: m.kind, number: m.number ?? (m.kind === 'opening' ? 'PS' : ''), text: m.text, docId: m.documentId ?? null, paymentId: null, manualId: m.id, lines: m.lines })
    const item = m.kind === 'cash' && m.documentId ? items.get(m.documentId) : undefined
    if (item && inBooks(m.on)) item.settled += m.lines.reduce((sum, l) => sum + l.cents, 0)
  }

  // Each year's end: a foreign currency account's balance in its currency (from the last the bank said) at the ECB's rate
  // of that day, against what the books hold in euros; the difference to 563 or 663. Not while a payment of it has no rate.
  const startYear = start ? Number(start.slice(0, 4)) : null
  for (const bank of input.banks) {
    const currency = bank.currency ?? 'EUR'
    if (currency === 'EUR' || bank.balanceCents === null || !bank.balanceOn || startYear === null) continue
    const own = input.payments.filter((p) => p.bankId === bank.id)
    if (own.some((p) => eurosOf.get(p.id) === null)) continue
    for (let y = startYear; y <= lastRateYear; y++) {
      const end = `${y}-12-31`
      if (!inBooks(end)) continue
      const rate = yearRate(currency, y)
      if (rate === null) break
      let foreign = bank.balanceCents
      for (const p of own) {
        if (p.bookedOn > end && p.bookedOn <= bank.balanceOn) foreign -= p.amountCents
        if (p.bookedOn <= end && p.bookedOn > bank.balanceOn) foreign += p.amountCents
      }
      let carrying = 0
      for (const e of entries) {
        if (e.on > end) continue
        for (const l of e.lines) {
          if (l.md === bank.ledger) carrying += l.cents
          if (l.d === bank.ledger) carrying -= l.cents
        }
      }
      const diff = eurOf(foreign, rate) - carrying
      if (diff !== 0)
        entries.push({
          key: `fxb:${y}:${bank.id}`,
          on: end,
          kind: 'fx',
          number: `KR ${y}`,
          text: `Kurzový rozdiel k 31. 12. ${y}: účet ${groupedIban(bank.iban)} (${currency})`,
          docId: null,
          paymentId: null,
          manualId: null,
          lines: [diff > 0 ? { md: bank.ledger, d: '663', cents: diff } : { md: '563', d: bank.ledger, cents: -diff }],
        })
    }
  }

  entries.sort((a, b) => a.on.localeCompare(b.on) || ORDER[a.kind] - ORDER[b.kind] || a.number.localeCompare(b.number) || a.key.localeCompare(b.key))
  const openItems = [...items.values()].sort((a, b) => (a.dueOn ?? a.on).localeCompare(b.dueOn ?? b.on) || a.docId.localeCompare(b.docId))
  return { start, entries, items: openItems, issues, unposted, documented, docDays, payments, banks: input.banks, payroll: input.payroll ?? [] }
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
  /** The account's currency: a foreign one is compared in it by nobody, its euros follow the rates. */
  currency: string
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
    const currency = bank.currency ?? 'EUR'
    if (currency !== 'EUR') return { bank, currency, on, ledger, balance, unposted: 0, rest: null }
    return { bank, currency, on, ledger, balance, unposted, rest: balance === null ? null : balance - ledger - unposted }
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

const SOURCE: Record<EntryKind, string> = { opening: 'počiatočný stav', document: 'doklad', payment: 'výpis z účtu', cash: 'pokladničný doklad', vat: 'priznanie DPH', payroll: 'mzdy', asset: 'majetok', stock: 'sklad', internal: 'interný doklad', fx: 'kurzové rozdiely' }

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
