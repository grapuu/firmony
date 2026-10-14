// What the VAT pages read and write: the documents a period may hold, the returns marked as filed, and how VAT is
// paid (the company's personal tax account, the variable symbol of the period). The rules themselves are in vat.ts.
import { typeset } from '../format'
import { now } from '../db'
import { DOC_COLUMNS, DOC_FROM, docOf, vatCompanyOf, vatDocOf, type Company, type Doc } from './store'
import {
  correctionKind,
  emptyRows,
  fastRefundAllowed,
  filingDeadline,
  isQuarter,
  isWorkingDay,
  kvDiff,
  kvFileLines,
  kvFileOf,
  nextPeriod,
  periodOf,
  periodOfDoc,
  periodRange,
  prevPeriod,
  ROWS,
  settle,
  signedResult,
  workOut,
  type FilingKind,
  type IssueCode,
  type KvFile,
  type PeriodResult,
  type Rows,
  type Settlement,
  type VatData,
} from './vat'

const MONTHS = ['január', 'február', 'marec', 'apríl', 'máj', 'jún', 'júl', 'august', 'september', 'október', 'november', 'december']

/** "september 2026", "3. štvrťrok 2026": a period as it is said after "za". */
export function periodName(period: string): string {
  return typeset(isQuarter(period) ? `${period.slice(6)}. štvrťrok ${period.slice(0, 4)}` : `${MONTHS[Number(period.slice(5, 7)) - 1] ?? ''} ${period.slice(0, 4)}`)
}

/**
 * The variable symbol of a VAT payment: 1100, the month and the year (1100092026); for a quarter 1100, 4, the quarter
 * and the year (1100432026). The Financial Administration's scheme, as podnikajte.sk lists it for 2026.
 */
export function vatSymbol(period: string): string {
  return isQuarter(period) ? `11004${period.slice(6)}${period.slice(0, 4)}` : `1100${period.slice(5, 7)}${period.slice(0, 4)}`
}

/** The prefix of the State Treasury's accounts for VAT (predčíslie), and its bank code. */
export const VAT_PREFIX = '500240'
export const TREASURY_BANK = '8180'
/** Who a tax is paid to, as the bank shows it. */
export const TAX_PAYEE = 'Finančné riaditeľstvo Slovenskej republiky'

/**
 * The base number of a personal tax account (osobný účet daňovníka) from what was typed: the number itself, the
 * whole account with any prefix ("500240-1234567890/8180") or its IBAN. Null when it is none of them.
 */
export function taxAccountOf(text: string): string | null {
  const plain = text.replace(/\s/g, '').toUpperCase()
  if (plain === '') return null
  const iban = /^SK\d{2}8180(\d{6})(\d{10})$/.exec(plain)
  if (iban) return ibanOk(plain) ? strip(iban[2] ?? '') : null
  // A tax's prefix is always six digits (500240 for VAT); a shorter one is a slip, not an account of the treasury.
  const full = /^(?:(\d{6})-)?(\d{1,10})(?:\/8180)?$/.exec(plain)
  return full ? strip(full[2] ?? '') : null
}

const strip = (digits: string): string | null => {
  const base = digits.replace(/^0+/, '')
  return base === '' ? null : base
}

const ibanOk = (iban: string): boolean => {
  let rest = 0
  for (const ch of iban.slice(4) + iban.slice(0, 4)) {
    const value = ch >= 'A' ? String(ch.charCodeAt(0) - 55) : ch
    for (const digit of value) rest = (rest * 10 + Number(digit)) % 97
  }
  return rest === 1
}

/** The IBAN to which a company pays VAT: SK, the check digits, 8180, the prefix 500240 and its account of ten digits. */
export function taxIban(account: string): string {
  const bban = `${TREASURY_BANK}${VAT_PREFIX}${account.padStart(10, '0')}`
  let rest = 0
  for (const ch of `${bban}SK00`) {
    const value = ch >= 'A' ? String(ch.charCodeAt(0) - 55) : ch
    for (const digit of value) rest = (rest * 10 + Number(digit)) % 97
  }
  return `SK${String(98 - rest).padStart(2, '0')}${bban}`
}

/** "SK12 8180 5002 4000 1234 5678" */
export const groupedIban = (iban: string): string => iban.replace(/(.{4})/g, '$1 ').trim()

/** The control statement as filed: its kind, the whole statement as it stands after it (what the next supplementary
 *  one is compared with) and the file as it was sent (for a supplementary one, only the lines with their codes). */
export interface FiledKv {
  kind: FilingKind
  full: KvFile
  sent: KvFile
}

export interface FiledReturn {
  period: string
  filedAt: number
  filedOn: string
  filedBy: string | null
  filedByName: string | null
  /** The rows of the return as filed (a supplementary one with rows 36 and 37). */
  rows: Rows
  kvRows: number
  /** What the period comes to after this filing: in all to pay, and in all to be refunded. */
  payCents: number
  refundCents: number
  /** By when what is to be paid is due: the deadline, or for a supplementary return the day it was filed. */
  dueOn: string
  kind: FilingKind
  /** The conditions of § 79(2) for refunding an excess deduction at once were marked as met. */
  fast: boolean
  /** The excess deduction of the period before that this one deducted from (row 34 is it, up to row 32). */
  carried: number
  kv: FiledKv | null
  /** The day the reason for a supplementary return was found. */
  foundOn: string | null
  /** The filing this one replaced, as it was stored; null for the first. */
  prev: string | null
  /** The row as stored, to keep as `prev` of the filing that replaces it. */
  raw: string
}

const EMPTY_KV: KvFile = { a1: [], b1: [], b2: [], b31: [], b32: [], c1: [], c2: [], d2: [] }

function kvOf(json: unknown): FiledKv | null {
  if (typeof json !== 'string') return null
  try {
    const value = JSON.parse(json) as Partial<FiledKv>
    const part = (file: unknown): KvFile => {
      const f = (file ?? {}) as Partial<Record<keyof KvFile, unknown>>
      return Object.fromEntries((Object.keys(EMPTY_KV) as (keyof KvFile)[]).map((key) => [key, Array.isArray(f[key]) ? f[key] : []])) as unknown as KvFile
    }
    const kind = value.kind === 'O' || value.kind === 'D' ? value.kind : 'R'
    return { kind, full: part(value.full), sent: part(value.sent) }
  } catch {
    return null
  }
}

export function rowsOf(json: unknown): Rows {
  const rows = emptyRows()
  if (typeof json !== 'string') return rows
  try {
    const value = JSON.parse(json) as Record<string, unknown>
    for (const row of ROWS) if (Number.isInteger(value[row])) rows[row] = value[row] as number
  } catch {
    // A snapshot that cannot be read compares as empty, which shows every row as changed: never silently equal.
  }
  return rows
}

/** The columns of a filing as stored, without the period and the company: what `prev` keeps of the one replaced. */
const FILING_COLUMNS = ['filed_at', 'filed_on', 'filed_by', 'rows', 'kv_rows', 'pay_cents', 'refund_cents', 'due_on', 'kind', 'fast', 'carried', 'kv', 'found_on', 'prev'] as const

/** The columns a filing is read with (vat_returns aliased v, the person who filed it u). */
export const FILED_SELECT = `v.company_id, v.period, ${FILING_COLUMNS.map((c) => `v.${c}`).join(', ')}, u.name AS filed_by_name`

/** A filing as stored. */
export function filedReturnOf(r: Record<string, unknown>): FiledReturn {
  return {
    period: String(r.period),
    filedAt: Number(r.filed_at),
    filedOn: String(r.filed_on),
    filedBy: typeof r.filed_by === 'string' ? r.filed_by : null,
    filedByName: typeof r.filed_by_name === 'string' ? r.filed_by_name : null,
    rows: rowsOf(r.rows),
    kvRows: Number(r.kv_rows ?? 0),
    payCents: Number(r.pay_cents ?? 0),
    refundCents: Number(r.refund_cents ?? 0),
    dueOn: String(r.due_on),
    kind: r.kind === 'O' || r.kind === 'D' ? r.kind : 'R',
    fast: r.fast === 1,
    carried: Number(r.carried ?? 0),
    kv: kvOf(r.kv),
    foundOn: typeof r.found_on === 'string' ? r.found_on : null,
    prev: typeof r.prev === 'string' ? r.prev : null,
    raw: JSON.stringify(Object.fromEntries(FILING_COLUMNS.map((c) => [c, r[c] ?? null]))),
  }
}

/** The returns marked as filed, the newest period first. */
export async function filedReturns(db: D1Database, company: string): Promise<FiledReturn[]> {
  const rows = await db
    .prepare(`SELECT ${FILED_SELECT} FROM vat_returns v LEFT JOIN users u ON u.id = v.filed_by WHERE v.company_id = ? ORDER BY v.period DESC`)
    .bind(company)
    .all<Record<string, unknown>>()
  return rows.results.map(filedReturnOf)
}

/** The periods filed, with the day each was filed: what vat.ts needs to place a late document. */
export const filedMap = (filed: FiledReturn[]): Map<string, string> => new Map(filed.map((f) => [f.period, f.filedOn]))

const addDays = (day: string, days: number): string => new Date(Date.parse(`${day}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)
const secondsOf = (day: string): number => Math.floor(Date.parse(`${day}T00:00:00Z`) / 1000)

/**
 * The documents that may fall in the periods from `first` to `last`: every one dated in them or in the two months
 * before (goods from the EU fall due the month after), every one that came in during them (a late deduction), and
 * every one the accountant put in a period by hand. A superset: vat.ts decides which period each is.
 */
export async function docsAround(db: D1Database, company: string, first: string, last: string): Promise<Doc[]> {
  const rows = await docsAroundStatement(db, company, first, last).all<Record<string, unknown>>()
  return rows.results.map(docOf)
}

/** The query of `docsAround`, for a batch of several companies at once (the team's screen of deadlines). */
export function docsAroundStatement(db: D1Database, company: string, first: string, last: string): D1PreparedStatement {
  const from = periodRange(first).from
  const to = periodRange(last).to
  return db
    .prepare(
      `SELECT ${DOC_COLUMNS} FROM ${DOC_FROM}
        WHERE d.company_id = ?1 AND d.deleted_at IS NULL AND (d.kind IS NULL OR d.kind IN ('receipt', 'invoice_in', 'invoice_out'))
          AND (d.vat_period IS NOT NULL
               OR d.supplied_on BETWEEN ?2 AND ?3
               OR d.issued_on BETWEEN ?2 AND ?3
               OR d.created_at BETWEEN ?4 AND ?5)
        ORDER BY COALESCE(d.supplied_on, d.issued_on), d.created_at`,
    )
    .bind(company, addDays(from, -62), to, secondsOf(from) - 86_400, secondsOf(to) + 2 * 86_400)
}

/** The rows whose amounts differ from what was filed (rows 36 and 37 belong to a supplementary return alone). */
export function changedRows(filed: Rows, now: Rows): string[] {
  return ROWS.filter((row) => row !== 'r36' && row !== 'r37' && filed[row] !== now[row])
}

/** What the accountant chose for a filing: the box of § 79(2), the day a reason for a supplementary return was found,
 *  and whether the excess deduction filed before has been refunded or deducted. */
export interface FilingChoices {
  fast?: boolean
  foundOn?: string | null
  settled?: boolean
}

/** What is filed for a period, now: the return and its kind, the control statement, and what the period comes to. */
export interface FilingPlan {
  period: string
  kind: FilingKind
  /** Whether a return is filed now (a correction of the control statement alone files none). */
  returnNeeded: boolean
  rows: Rows
  nothing: boolean
  fast: boolean
  /** Whether the box of § 79(2) is offered: an excess deduction of a monthly payer registered for 12 months. */
  fastOffered: boolean
  carried: number
  /** The control statement filed now, or null; and the one that stands after it (what is stored). */
  kv: FiledKv | null
  kvStored: FiledKv | null
  pay: number
  refund: number
  dueOn: string
  foundOn: string | null
  /** A supplementary return after an excess deduction: whether it was taken as refunded or deducted, and whether that is asked. */
  settled: boolean
  askSettled: boolean
  settlement: Settlement | null
  /** The filing a correction replaces. */
  replaces: FiledReturn | null
}

/** Whether an excess deduction filed for a period has been refunded or deducted by now, as far as we can tell: the
 *  next period was filed (it deducted it, and the tax office refunds the rest), or it was to be refunded under § 79(2)
 *  and the 30 days for that have passed. */
function excessSettledBy(prev: FiledReturn, filed: FiledReturn[], today: string): boolean {
  if (filed.some((f) => f.period === nextPeriod(prev.period))) return true
  return prev.fast && today > addDays(filingDeadline(prev.period), 30)
}

const nonzeroJson = (rows: Rows): string => JSON.stringify(Object.fromEntries(ROWS.filter((row) => rows[row] !== 0).map((row) => [row, rows[row]])))

/**
 * What would be filed for a period now. A period ready to be filed: the regular return and, when it is due, the
 * control statement. A period filed: the same files again, as they were filed. A period whose books changed after it
 * was filed: a corrective return and control statement in their place while the deadline has not passed (§ 16(3) of
 * the Tax Procedure Code), a supplementary return with rows 36 and 37 and a supplementary control statement of the
 * lines that changed after it (vat.ts: `settle`, `kvDiff`); only the control statement when the return's rows are as
 * filed. Anything else (running, blocked, nothing to file): null.
 */
export function planFiling(company: Company, view: PeriodView, filed: FiledReturn[], today: string, choices: FilingChoices = {}): FilingPlan | null {
  const result = view.result
  const offered = fastRefundAllowed(vatCompanyOf(company), view.period)
  const base = { period: view.period, settled: false, askSettled: false, settlement: null, replaces: null }
  if (view.state === 'filed' && view.filed) {
    const f = view.filed
    return {
      ...base,
      kind: f.kind,
      returnNeeded: true,
      rows: f.rows,
      nothing: ROWS.every((row) => f.rows[row] === 0),
      fast: f.fast,
      fastOffered: offered && f.rows.r33 > 0,
      carried: f.carried,
      kv: f.kv,
      kvStored: f.kv,
      pay: f.payCents,
      refund: f.refundCents,
      dueOn: f.dueOn,
      foundOn: f.foundOn,
    }
  }
  const full = result.statement ? kvFileOf(result.kv) : null
  if (view.state === 'ready') {
    const kv: FiledKv | null = full ? { kind: 'R', full, sent: full } : null
    const fastOffered = offered && result.rows.r33 > 0
    return {
      ...base,
      kind: 'R',
      returnNeeded: true,
      rows: result.rows,
      nothing: result.nothing,
      fast: fastOffered && (choices.fast ?? true),
      fastOffered,
      carried: view.carried,
      kv,
      kvStored: kv,
      pay: Math.max(0, result.rows.r35),
      refund: Math.max(0, result.rows.r33),
      dueOn: view.deadline,
      foundOn: null,
    }
  }
  if (view.state !== 'changed' || !view.filed) return null
  const prev = view.filed
  const kind = correctionKind(view.period, today)
  const returnNeeded = view.changed.length > 0
  // The control statement: corrective, the whole of it again; supplementary, the lines that changed with their codes;
  // regular, when none was filed before and one is due now.
  let kv: FiledKv | null = null
  if (kind === 'O') {
    if (full) kv = { kind: prev.kv ? 'O' : 'R', full, sent: full }
    else if (prev.kv) kv = { kind: 'O', full: EMPTY_KV, sent: EMPTY_KV }
  } else if (prev.kv) {
    const sent = kvDiff(prev.kv.full, full ?? EMPTY_KV)
    if (kvFileLines(sent) > 0) kv = { kind: 'D', full: full ?? EMPTY_KV, sent }
  } else if (full) kv = { kind: 'R', full, sent: full }
  const fastOffered = offered && result.rows.r33 > 0
  const plan: FilingPlan = {
    ...base,
    kind: returnNeeded ? kind : prev.kind,
    returnNeeded,
    rows: returnNeeded ? { ...result.rows } : prev.rows,
    nothing: returnNeeded ? result.nothing : ROWS.every((row) => prev.rows[row] === 0),
    fast: kind === 'O' && fastOffered ? (choices.fast ?? prev.fast) : prev.fast,
    fastOffered: kind === 'O' && fastOffered,
    carried: prev.carried,
    kv,
    kvStored: kv ?? prev.kv,
    pay: prev.payCents,
    refund: prev.refundCents,
    dueOn: prev.dueOn,
    foundOn: null,
    replaces: prev,
  }
  if (!returnNeeded) return plan
  if (kind === 'O') return { ...plan, pay: Math.max(0, result.rows.r35), refund: Math.max(0, result.rows.r33), dueOn: view.deadline }
  const askSettled = signedResult(prev.rows) < 0
  const settled = askSettled && (choices.settled ?? excessSettledBy(prev, filed, today))
  const settlement = settle({ rows: prev.rows, pay: prev.payCents, refund: prev.refundCents }, plan.rows, settled)
  plan.rows.r36 = settlement.r36
  plan.rows.r37 = settlement.r37 ?? 0
  const found = choices.foundOn && choices.foundOn >= prev.filedOn && choices.foundOn <= today ? choices.foundOn : today
  return { ...plan, pay: settlement.pay, refund: settlement.refund, dueOn: supplementaryDeadline(found), foundOn: found, settled, askSettled, settlement }
}

/**
 * By when a supplementary return is filed, and the tax it adds paid: the end of the month after the one in which its
 * reason was found (§ 16(2) of the Tax Procedure Code, as in force from 1 January 2027, read that day).
 */
export function supplementaryDeadline(found: string): string {
  const year = Number(found.slice(0, 4))
  const month = Number(found.slice(5, 7)) + 1
  const y = month > 12 ? year + 1 : year
  const m = month > 12 ? 1 : month
  let day = `${y}-${String(m).padStart(2, '0')}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`
  // A deadline on a weekend or a day off moves to the next working day (§ 27(2)).
  while (!isWorkingDay(day)) day = addDays(day, 1)
  return day
}

/**
 * A plan marked as filed. The first filing of a period goes in once (the key is the company and the period); a
 * correction replaces the filing it was made against, and only that one (an answer sent twice changes nothing the
 * second time), keeping it in `prev`.
 */
export function fileStatement(db: D1Database, company: string, plan: FilingPlan, by: string, today: string): D1PreparedStatement {
  const values = [
    now(),
    today,
    by,
    nonzeroJson(plan.rows),
    plan.kvStored ? kvFileLines(plan.kvStored.full) : 0,
    plan.pay,
    plan.refund,
    plan.dueOn,
    plan.kind,
    plan.fast ? 1 : 0,
    plan.carried,
    plan.kvStored ? JSON.stringify(plan.kvStored) : null,
    plan.foundOn,
  ]
  if (!plan.replaces) {
    return db
      .prepare(
        `INSERT INTO vat_returns (company_id, period, filed_at, filed_on, filed_by, rows, kv_rows, pay_cents, refund_cents, due_on, kind, fast, carried, kv, found_on, prev)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL) ON CONFLICT (company_id, period) DO NOTHING`,
      )
      .bind(company, plan.period, ...values)
  }
  const prev = plan.replaces
  return db
    .prepare(
      `UPDATE vat_returns SET filed_at = ?, filed_on = ?, filed_by = ?, rows = ?, kv_rows = ?, pay_cents = ?, refund_cents = ?, due_on = ?, kind = ?, fast = ?, carried = ?, kv = ?, found_on = ?, prev = ?
        WHERE company_id = ? AND period = ? AND filed_at = ? AND IFNULL(prev, '') = ?`,
    )
    .bind(...values, prev.raw, company, plan.period, prev.filedAt, prev.prev ?? '')
}

/** A mark set by mistake taken back: a correction gives way to the filing it replaced, a first filing goes. */
export function unfileStatement(db: D1Database, company: string, filed: FiledReturn): D1PreparedStatement {
  if (!filed.prev) return db.prepare('DELETE FROM vat_returns WHERE company_id = ? AND period = ? AND filed_at = ? AND prev IS NULL').bind(company, filed.period, filed.filedAt)
  const before = JSON.parse(filed.prev) as Record<string, unknown>
  return db
    .prepare(`UPDATE vat_returns SET ${FILING_COLUMNS.map((c) => `${c} = ?`).join(', ')} WHERE company_id = ? AND period = ? AND filed_at = ? AND prev = ?`)
    .bind(...FILING_COLUMNS.map((c) => (before[c] ?? null) as string | number | null), company, filed.period, filed.filedAt, filed.prev)
}

/** The first period of ours: not before the registration took effect, nor before our contract started. */
export function firstPeriod(company: Pick<Company, 'vatQuarterly' | 'vatSince' | 'startOn'>): string | null {
  const quarterly = company.vatQuarterly
  const starts = [company.vatSince, company.startOn].filter((day): day is string => Boolean(day)).map((day) => periodOf(day, quarterly))
  return starts.length > 0 ? (starts.sort()[starts.length - 1] ?? null) : null
}

/**
 * The excess deduction a period deducts (row 34 up to row 32): the one it was filed with; else the excess deduction
 * of the period before when that was not to be refunded at once (§ 79(1)); for our first period, the one the
 * company brought from before us.
 */
export function carriedInto(company: Company, period: string, filed: FiledReturn[]): number {
  if (company.vatStatus !== 'payer') return 0
  const mine = filed.find((f) => f.period === period)
  if (mine) return mine.carried
  const before = filed.find((f) => f.period === prevPeriod(period))
  if (before) return before.fast ? 0 : before.rows.r33
  return period === firstPeriod(company) ? company.vatCarry : 0
}

// ---------------------------------------------------------------------------------------------------------------
// Where a period stands
// ---------------------------------------------------------------------------------------------------------------

/** What the company's own details lack for the forms' header. */
export type CompanyIssue = 'icdph' | 'office' | 'address'

export function companyIssues(company: Company): CompanyIssue[] {
  if (company.vatStatus === 'none') return []
  const out: CompanyIssue[] = []
  if (!/^SK\d{10}$/.test(company.icdph ?? '')) out.push('icdph')
  if (!company.taxOffice) out.push('office')
  if (!company.address) out.push('address')
  return out
}

/** filed: marked as filed; changed: filed, and the books now give other figures; running: the period has not ended;
 *  none: a person registered under § 7a with nothing to report files nothing; blocked: something keeps it from being
 *  filed; ready: the files can be made. */
export type PeriodState = 'filed' | 'changed' | 'running' | 'blocked' | 'ready' | 'none'

export interface PeriodView {
  period: string
  state: PeriodState
  result: PeriodResult
  filed: FiledReturn | null
  /** The rows whose amounts differ from what was filed. */
  changed: string[]
  /** The control statement's lines that differ from what was filed (with their codes), when any do. */
  kvChanged: number
  companyIssues: CompanyIssue[]
  /** A payer's period before this one, of ours, that is not filed yet: it goes first (its excess deduction counts here). */
  previous: string | null
  /** The excess deduction of the period before that this one deducts (row 34, up to row 32). */
  carried: number
  running: boolean
  deadline: string
}

export function viewOf(company: Company, period: string, docs: Doc[], filed: FiledReturn[], today: string): PeriodView {
  const carried = carriedInto(company, period, filed)
  const result = workOut(vatCompanyOf(company), period, docs.map(vatDocOf), filedMap(filed), carried)
  const mine = filed.find((f) => f.period === period) ?? null
  const changed = mine ? changedRows(mine.rows, result.rows) : []
  const kvChanged = mine ? kvFileLines(kvDiff(mine.kv?.full ?? EMPTY_KV, result.statement ? kvFileOf(result.kv) : EMPTY_KV)) : 0
  const running = today <= periodRange(period).to
  const issues = companyIssues(company)
  const first = firstPeriod(company)
  const before = prevPeriod(period)
  const previous = company.vatStatus === 'payer' && !mine && first !== null && before >= first && !filed.some((f) => f.period === before) ? before : null
  const blocked = issues.length > 0 || previous !== null || result.issues.some((i) => i.level === 'block')
  // A person registered under § 7a files a return only for a month in which it owes tax; that it owes none is known
  // only once every document of the month is booked (one not booked yet may be the service bought from abroad).
  const nothingToFile = company.vatStatus !== 'payer' && result.nothing && !result.issues.some((i) => i.code === 'unbooked')
  const state: PeriodState = mine ? (changed.length > 0 || kvChanged > 0 ? 'changed' : 'filed') : running ? 'running' : nothingToFile ? 'none' : blocked ? 'blocked' : 'ready'
  return { period, state, result, filed: mine, changed, kvChanged, companyIssues: issues, previous, carried, running, deadline: filingDeadline(period) }
}

/**
 * The periods shown side by side: six, ending with the one that runs today, or around an older one that was asked
 * for; none before the registration took effect or our contract started, unless it was asked for.
 */
export function stripOf(company: Company, asked: string, today: string): string[] {
  const quarterly = company.vatQuarterly
  const current = periodOf(today, quarterly)
  let end = current
  const back = (from: string, n: number) => {
    let p = from
    for (let i = 0; i < n; i++) p = prevPeriod(p)
    return p
  }
  if (asked < back(current, 5)) {
    end = asked
    for (let i = 0; i < 3 && end < current; i++) end = nextPeriod(end)
  }
  // Not before the registration took effect, nor before our contract started: the returns before it were not ours.
  const first = firstPeriod(company)
  const out: string[] = []
  for (let p = back(end, 5); p <= end; p = nextPeriod(p)) if (!first || p >= first || p === asked) out.push(p)
  return out.length > 0 ? out : [end]
}

/**
 * What a filed return asks the client to pay: row 35, except that a person registered under § 7a does not pay tax of
 * 5 € or less (poučenie to the return, point 50).
 */
export function payable(company: Pick<Company, 'vatStatus'>, ret: Pick<FiledReturn, 'payCents'>): number {
  if (company.vatStatus === 'reg7a' && ret.payCents <= 500) return 0
  return ret.payCents
}

/**
 * Where one document goes with the VAT it has (or is given in the form): the period its dates give, the period it is
 * reported in, the rows of the return and the parts of the control statement, in the forms' order, and what keeps it
 * from going there.
 */
export function docPreview(company: Company, doc: Doc, data: VatData, filed: FiledReturn[]): { natural: string; period: string; goes: string[]; issues: IssueCode[] } {
  const vc = vatCompanyOf(company)
  const vdoc = { ...vatDocOf(doc), booked: true, vat: data }
  const map = filedMap(filed)
  const natural = periodOfDoc(vdoc, { ...data, period: null }, vc, map)
  const period = periodOfDoc(vdoc, data, vc, map)
  const result = workOut(vc, period, [vdoc], map)
  const keys = [...result.sources.entries()].filter(([, ids]) => ids.has(doc.id)).map(([key]) => key)
  const order = (key: string) => {
    const row = (ROWS as readonly string[]).indexOf(key)
    return row >= 0 ? row : ROWS.length + key.charCodeAt(0) * 10 + Number(key.slice(1))
  }
  const issues = result.issues.filter((i) => i.doc === doc.id && i.code !== 'proposed' && i.code !== 'unbooked').map((i) => i.code)
  return { natural, period, goes: keys.sort((a, b) => order(a) - order(b)), issues }
}

/** What was paid towards a period's VAT: in all, and the day of the last payment. */
export interface TaxPaid {
  cents: number
  last: string
}

/**
 * What was paid towards each filed period: payments out of the company's accounts with the period's variable symbol
 * (a bank may write it with zeros in front). A supplementary return's difference is paid with the same symbol.
 */
export async function taxPaid(db: D1Database, companyId: string, filed: FiledReturn[]): Promise<Map<string, TaxPaid>> {
  if (filed.length === 0) return new Map()
  // Every VAT symbol begins 1100: one query for all of them, however many years of returns there are.
  const rows = await db
    .prepare(
      `SELECT ltrim(vs, '0') AS vs, -SUM(amount_cents) AS paid, MAX(booked_on) AS last FROM payments
        WHERE company_id = ? AND amount_cents < 0 AND ltrim(vs, '0') LIKE '1100%' GROUP BY ltrim(vs, '0')`,
    )
    .bind(companyId)
    .all<{ vs: string; paid: number; last: string }>()
  return paidByPeriod(filed, rows.results)
}

/** What was paid towards each filed period, from the payments summed by their symbol (without zeros in front). */
export function paidByPeriod(filed: FiledReturn[], bySymbolRows: readonly { vs: string; paid: number; last: string }[]): Map<string, TaxPaid> {
  const bySymbol = new Map(bySymbolRows.map((r) => [r.vs, r]))
  const out = new Map<string, TaxPaid>()
  for (const f of filed) {
    const row = bySymbol.get(vatSymbol(f.period))
    if (row) out.set(f.period, { cents: row.paid, last: row.last })
  }
  return out
}

/** What is left to pay of a period's tax: what it comes to, less what was paid towards it. */
export const leftToPay = (company: Pick<Company, 'vatStatus'>, ret: Pick<FiledReturn, 'payCents'>, paid: TaxPaid | undefined): number => Math.max(0, payable(company, ret) - (paid?.cents ?? 0))

/** Paid more than the period comes to (a correction lowered it): an overpayment, which the tax office offsets or refunds. */
export const overpaid = (company: Pick<Company, 'vatStatus'>, ret: Pick<FiledReturn, 'payCents'>, paid: TaxPaid | undefined): number => Math.max(0, (paid?.cents ?? 0) - payable(company, ret))

/** The VAT a company pays itself on a document it bought from abroad (§ 69, § 11), as confirmed or proposed, for its entry. */
export function selfVatOf(data: VatData | null | undefined): { cents: number; deduct: boolean; deductCents: number } | null {
  if (!data || (data.mode !== 'reverse' && data.mode !== 'acquisition')) return null
  const cents = data.lines.reduce((sum, line) => sum + line.vat, 0)
  const deductCents = data.lines.reduce((sum, line) => sum + line.deduct, 0)
  return cents > 0 ? { cents, deduct: deductCents > 0, deductCents } : null
}
