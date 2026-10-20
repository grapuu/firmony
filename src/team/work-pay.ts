// What an accountant is paid for a month's work (his yes of 20 October 2026, 17:13: paid for the work done, not a
// sum a client). Nothing of it is stored: it is counted every time from the events the app records as she works, so
// it cannot disagree with what she did. The rule, each part once ever, so that work done again (a document booked
// again, a return taken back and filed again, a payroll month opened and closed again) is no new pay:
//   - a document she booked or discarded in the month, when nobody had booked or discarded it before;
//   - a VAT period's regular return she marked as filed in the month, the first filing of that period;
//   - every company of hers whose contract ran in the month and that had no such filing: the month's fee;
//   - each person of a payroll month she closed in the month, at its first closing;
//   - a closing she marked as filed in the month, the first filing of that year;
//   - a company taken over (its opening balances or a takeover from another program), the first of them ever.
// Corrections (a corrective or supplementary return, a payroll month closed again) are paid by nothing: a correction of
// her own work is hers, and one the client caused is billed apart. The rates are ACCOUNTANT_RATES in config.ts.
import { ACCOUNTANT_RATES } from '../config'
import { bratislavaOffset } from '../time'
import { csvCell, csvMoney } from './store'

export interface WorkRow {
  companyId: string
  name: string
  ico: string | null
  /** Documents she dealt with for the first time. */
  documents: number
  /** VAT periods whose regular return she filed first. */
  vat: string[]
  /** Whether the company's contract ran in the month and it is hers: the month's fee when no VAT period was filed. */
  active: boolean
  /** People on the payroll months she closed first. */
  payroll: number
  /** Years whose closing she filed first. */
  closings: string[]
  /** Whether she took the company over in the month. */
  takeover: boolean
}

export interface WorkPay {
  documents: number
  vat: number
  month: number
  payroll: number
  closing: number
  takeover: number
  total: number
}

/** A company's pay of the month, in cents. */
export function payOf(row: WorkRow): WorkPay {
  const r = ACCOUNTANT_RATES
  const documents = row.documents * r.document
  const vat = row.vat.length * r.vatPeriod
  const month = row.active && row.vat.length === 0 ? r.month : 0
  const payroll = row.payroll * r.payroll
  const closing = row.closings.length * r.closing
  const takeover = row.takeover ? r.takeover : 0
  return { documents, vat, month, payroll, closing, takeover, total: documents + vat + month + payroll + closing + takeover }
}

/** The sum of a statement's companies. */
export function totalOf(rows: WorkRow[]): WorkPay {
  const sum: WorkPay = { documents: 0, vat: 0, month: 0, payroll: 0, closing: 0, takeover: 0, total: 0 }
  for (const row of rows) {
    const pay = payOf(row)
    for (const key of Object.keys(sum) as (keyof WorkPay)[]) sum[key] += pay[key]
  }
  return sum
}

/** Whether a row holds any work or a month's fee. */
export function hasWork(row: WorkRow): boolean {
  return payOf(row).total > 0
}

/** The first and the last day of a month, YYYY-MM. */
export function monthDays(month: string): { first: string; last: string } {
  const [y, m] = month.split('-').map(Number) as [number, number]
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return { first: `${month}-01`, last: `${month}-${String(last).padStart(2, '0')}` }
}

/** The moment (seconds) a day begins in Bratislava. Summer time never changes at midnight, so the offset an hour
 *  before the day's UTC midnight is the day's own. */
export function dayStart(day: string): number {
  const utc = Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10))) / 1000
  return utc - bratislavaOffset(utc - 3600)
}

/** The moments a month runs between, in Bratislava: from its first midnight to the next month's. */
export function monthRange(month: string): { from: number; to: number } {
  const [y, m] = month.split('-').map(Number) as [number, number]
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
  return { from: dayStart(`${month}-01`), to: dayStart(`${next}-01`) }
}

/** The last twelve months, this one first. */
export function lastMonths(today: string, count = 12): string[] {
  let y = Number(today.slice(0, 4))
  let m = Number(today.slice(5, 7))
  const out: string[] = []
  for (let i = 0; i < count; i++) {
    out.push(`${y}-${String(m).padStart(2, '0')}`)
    m -= 1
    if (m === 0) {
      m = 12
      y -= 1
    }
  }
  return out
}

const DOC_ACTIONS = "('document.booked', 'document.discarded')"
const TAKEOVER_ACTIONS = "('ledger.opening', 'takeover.statements', 'takeover.items', 'takeover.assets', 'takeover.people')"
/** An earlier event of the same kind about the same thing: the one in hand is then no first. */
const earlier = (same: string) => `NOT EXISTS (SELECT 1 FROM events f WHERE ${same} AND (f.at < e.at OR (f.at = e.at AND f.id < e.id)))`

type Row = Record<string, unknown>

/** An accountant's statement of a month: a row a company with work or a month's fee, by name. */
export async function workStatement(db: D1Database, userId: string, month: string, demo: boolean): Promise<WorkRow[]> {
  const { from, to } = monthRange(month)
  const { first, last } = monthDays(month)
  const [docs, firsts, takeovers, companies] = await db.batch<Row>([
    db
      .prepare(
        `SELECT e.company_id AS company, COUNT(DISTINCT e.subject) AS n FROM events e
         WHERE e.user_id = ?1 AND e.at >= ?2 AND e.at < ?3 AND e.action IN ${DOC_ACTIONS} AND e.subject IS NOT NULL
           AND ${earlier(`f.subject = e.subject AND f.action IN ${DOC_ACTIONS}`)}
         GROUP BY e.company_id`,
      )
      .bind(userId, from, to),
    db
      .prepare(
        `SELECT e.company_id AS company, e.action, e.subject, json_extract(e.detail, '$.employees') AS employees FROM events e
         WHERE e.user_id = ?1 AND e.at >= ?2 AND e.at < ?3 AND e.action IN ('vat.filed', 'payroll.closed', 'closing.filed') AND e.subject IS NOT NULL
           AND ${earlier('f.subject = e.subject AND f.action = e.action AND f.company_id = e.company_id')}`,
      )
      .bind(userId, from, to),
    db
      .prepare(
        `SELECT DISTINCT e.company_id AS company FROM events e
         WHERE e.user_id = ?1 AND e.at >= ?2 AND e.at < ?3 AND e.action IN ${TAKEOVER_ACTIONS}
           AND ${earlier(`f.company_id = e.company_id AND f.action IN ${TAKEOVER_ACTIONS}`)}`,
      )
      .bind(userId, from, to),
    db
      .prepare(
        `SELECT id, name, ico, accountant_id = ?1 AND contract_at IS NOT NULL AND start_on IS NOT NULL AND start_on <= ?3
           AND (ends_on IS NULL OR ends_on >= ?2) AND purged_at IS NULL AS active, demo FROM companies
         WHERE (accountant_id = ?1 AND contract_at IS NOT NULL AND start_on IS NOT NULL AND start_on <= ?3 AND (ends_on IS NULL OR ends_on >= ?2) AND purged_at IS NULL)
            OR id IN (SELECT company_id FROM events WHERE user_id = ?1 AND at >= ?4 AND at < ?5)`,
      )
      .bind(userId, first, last, from, to),
  ])
  const rows = new Map<string, WorkRow>()
  for (const c of companies?.results ?? []) {
    if (!demo && Number(c.demo ?? 0) === 1) continue
    rows.set(String(c.id), { companyId: String(c.id), name: String(c.name), ico: c.ico ? String(c.ico) : null, documents: 0, vat: [], active: Number(c.active ?? 0) === 1, payroll: 0, closings: [], takeover: false })
  }
  for (const d of docs?.results ?? []) {
    const row = rows.get(String(d.company))
    if (row) row.documents = Number(d.n ?? 0)
  }
  for (const e of firsts?.results ?? []) {
    const row = rows.get(String(e.company))
    if (!row) continue
    if (e.action === 'vat.filed') row.vat.push(String(e.subject))
    else if (e.action === 'closing.filed') row.closings.push(String(e.subject))
    else row.payroll += Math.max(0, Number(e.employees ?? 0))
  }
  for (const t of takeovers?.results ?? []) {
    const row = rows.get(String(t.company))
    if (row) row.takeover = true
  }
  return [...rows.values()].filter(hasWork).sort((a, b) => a.name.localeCompare(b.name, 'sk'))
}

/** The statement as a file for Slovak Excel: a row a company and the sum. */
export function workCsv(rows: WorkRow[]): string {
  const head = ['Klient', 'IČO', 'Doklady', 'Doklady €', 'Podané DPH', 'DPH €', 'Mesiac €', 'Mzdy (ľudia)', 'Mzdy €', 'Závierky', 'Závierky €', 'Prevzatie €', 'Spolu €']
  const line = (name: string, ico: string | null, n: { documents: number; vat: number; payroll: number; closings: number }, pay: WorkPay) =>
    [name, ico, n.documents, csvMoney(pay.documents), n.vat, csvMoney(pay.vat), csvMoney(pay.month), n.payroll, csvMoney(pay.payroll), n.closings, csvMoney(pay.closing), csvMoney(pay.takeover), csvMoney(pay.total)]
  const lines = rows.map((r) => line(r.name, r.ico, { documents: r.documents, vat: r.vat.length, payroll: r.payroll, closings: r.closings.length }, payOf(r)))
  const counts = rows.reduce((n, r) => ({ documents: n.documents + r.documents, vat: n.vat + r.vat.length, payroll: n.payroll + r.payroll, closings: n.closings + r.closings.length }), { documents: 0, vat: 0, payroll: 0, closings: 0 })
  lines.push(line('Spolu', null, counts, totalOf(rows)))
  return `﻿${[head, ...lines].map((r) => r.map((cell) => csvCell(cell as string | number | null)).join(';')).join('\r\n')}\r\n`
}
