// Invoices issued again by themselves (18 October 2026): a company makes an issued invoice repeat every month, quarter
// or year, and the schedule issues the next one on its day with the same customer, lines, taxation and currency, due
// as many days after it as the invoice was, numbered in the invoices' row, and sends it to the customer when asked.
//
// The rule, said plainly:
// - A repeat keeps the day of the month it started on: from the 31st it is the last day of a shorter month and the 31st
//   again after it (`anchoredDay`).
// - The schedule issues a repeat whose day has come (in Bratislava), dated that day, then moves it to its next day
//   after today, so a schedule that did not run for a while issues one invoice, not every missed one.
// - One invoice a repeat a day: a unique index on the invoice's repeat and day of issue makes a second run of the same
//   day fail as a whole (nothing is issued twice), and the repeat moves on only in the same batch.
// - Nothing is issued after the repeat's last day, after the contract ended, or in a period the accountant locked; an
//   invoice in another currency waits for the ECB's rate of the day before its supply and says so on the repeat.
import { now } from '../db'
import { rateFor, rateText } from './fx'
import { ratesFor } from './fx-store'
import { invoiceLines, getInvoice, saveInvoiceStatements, totalsOf, type InvoiceValues, type Line, type StoredInvoice } from './invoices'
import { eventStatement, getCompany, type Company } from './store'
import { serviceOpen } from './ending'
import { newToken } from './session'

type Row = Record<string, unknown>
const str = (v: unknown) => (typeof v === 'string' ? v : null)

/** How often: every month, every quarter, every year (months between two invoices). */
export const REPEAT_EVERY = [1, 3, 12] as const
export type RepeatEvery = (typeof REPEAT_EVERY)[number]
export const isRepeatEvery = (v: unknown): v is RepeatEvery => REPEAT_EVERY.includes(Number(v) as RepeatEvery)

export interface Repeat {
  id: string
  companyId: string
  templateId: string
  templateNumber: string | null
  customerName: string
  totalCents: number
  currency: string
  every: RepeatEvery
  /** The day of the month it keeps (1 to 31). */
  anchor: number
  nextOn: string
  untilOn: string | null
  send: boolean
  stoppedAt: number | null
  lastInvoiceId: string | null
  lastOn: string | null
  /** Who started it: its invoices are issued in that person's name. */
  createdBy: string | null
  /** Why the last try issued nothing ('rate', 'locked', 'ended', 'failed'), until one is issued. */
  failed: string | null
}

const lastDayOf = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate()

/** The day `months` months after a day's month, on the anchor day or the month's last day when it has fewer. */
export function anchoredDay(day: string, months: number, anchor: number): string {
  const y = Number(day.slice(0, 4))
  const m = Number(day.slice(5, 7)) - 1 + months
  const year = y + Math.floor(m / 12)
  const month = (((m % 12) + 12) % 12) + 1
  const date = Math.min(anchor, lastDayOf(year, month))
  return `${year}-${String(month).padStart(2, '0')}-${String(date).padStart(2, '0')}`
}

/** The repeat's first day after `today`, period by period from its next day. */
export function nextAfter(next: string, every: number, anchor: number, today: string): string {
  let day = next
  for (let i = 0; day <= today && i < 1200; i++) day = anchoredDay(day, every, anchor)
  return day
}

/** Days from a to b. */
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)
const plusDays = (day: string, days: number) => {
  const d = new Date(`${day}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

const REPEAT_COLUMNS = `r.*, i.number AS template_number, i.customer_name, i.total_cents, COALESCE(i.currency, 'EUR') AS currency`

function repeatOf(row: Row): Repeat {
  const every = Number(row.every)
  return {
    id: String(row.id),
    companyId: String(row.company_id),
    templateId: String(row.template_id),
    templateNumber: str(row.template_number),
    customerName: String(row.customer_name ?? ''),
    totalCents: Number(row.total_cents ?? 0),
    currency: String(row.currency ?? 'EUR'),
    every: isRepeatEvery(every) ? every : 1,
    anchor: Number(row.anchor),
    nextOn: String(row.next_on),
    untilOn: str(row.until_on),
    send: Number(row.send) === 1,
    stoppedAt: typeof row.stopped_at === 'number' ? row.stopped_at : null,
    lastInvoiceId: str(row.last_invoice_id),
    lastOn: str(row.last_on),
    createdBy: str(row.created_by),
    failed: str(row.failed),
  }
}

/** A company's repeats that run, the nearest first. */
export async function repeatsOf(db: D1Database, company: string): Promise<Repeat[]> {
  const rows = await db
    .prepare(`SELECT ${REPEAT_COLUMNS} FROM invoice_repeats r JOIN invoices i ON i.id = r.template_id WHERE r.company_id = ? AND r.stopped_at IS NULL ORDER BY r.next_on, r.created_at`)
    .bind(company)
    .all<Row>()
  return rows.results.map(repeatOf)
}

/** The repeat of an invoice that runs, if any. */
export async function repeatOfInvoice(db: D1Database, company: string, invoice: string): Promise<Repeat | null> {
  const row = await db
    .prepare(`SELECT ${REPEAT_COLUMNS} FROM invoice_repeats r JOIN invoices i ON i.id = r.template_id WHERE r.company_id = ? AND r.template_id = ? AND r.stopped_at IS NULL`)
    .bind(company, invoice)
    .first<Row>()
  return row ? repeatOf(row) : null
}

/** An issued invoice that may repeat: an invoice (not a credit note, a request, an advance or a final invoice). */
export const mayRepeat = (invoice: StoredInvoice) => invoice.status === 'issued' && invoice.kind === 'invoice' && !invoice.relates && Boolean(invoice.number)

/** Starts a repeat of an invoice; one that runs per invoice (a unique index keeps it so). */
export function startRepeatStatements(
  db: D1Database,
  args: { id: string; company: string; template: string; every: RepeatEvery; nextOn: string; untilOn: string | null; send: boolean; user: string },
): D1PreparedStatement[] {
  return [
    db
      .prepare(
        `INSERT INTO invoice_repeats (id, company_id, template_id, every, anchor, next_on, until_on, send, created_at, created_by)
         SELECT ?, ?, id, ?, ?, ?, ?, ?, ?, ? FROM invoices WHERE id = ? AND company_id = ? AND status = 'issued' AND kind = 'invoice' AND relates IS NULL`,
      )
      .bind(args.id, args.company, args.every, Number(args.nextOn.slice(8, 10)), args.nextOn, args.untilOn, args.send ? 1 : 0, now(), args.user, args.template, args.company),
    eventStatement(db, { company: args.company, user: args.user, action: 'invoice.repeat.started', subject: args.template, detail: { repeat: args.id, every: args.every, next: args.nextOn } }),
  ]
}

export function stopRepeatStatements(db: D1Database, company: string, repeat: string, user: string | null, why: string): D1PreparedStatement[] {
  return [
    db
      .prepare('UPDATE invoice_repeats SET stopped_at = ?, stopped_by = ?, failed = ? WHERE id = ? AND company_id = ? AND stopped_at IS NULL')
      .bind(now(), user, why === 'stopped' ? null : why, repeat, company),
    eventStatement(db, { company, user, action: 'invoice.repeat.stopped', subject: repeat, detail: { why } }),
  ]
}

export interface RepeatIssued {
  repeat: Repeat
  invoiceId: string
  documentId: string
  company: Company
}

/**
 * Issues every repeat whose day has come, at most `limit` a run. Returns what was issued, for the caller to send and
 * pair (the mail and the pairing live with the routes).
 */
export async function issueRepeats(db: D1Database, today: string, limit = 50): Promise<RepeatIssued[]> {
  const due = await db
    .prepare(`SELECT ${REPEAT_COLUMNS} FROM invoice_repeats r JOIN invoices i ON i.id = r.template_id WHERE r.stopped_at IS NULL AND r.next_on <= ? ORDER BY r.next_on LIMIT ?`)
    .bind(today, limit)
    .all<Row>()
  const out: RepeatIssued[] = []
  for (const row of due.results) {
    const repeat = repeatOf(row)
    try {
      const done = await issueOne(db, repeat, today)
      if (done) out.push(done)
    } catch (err) {
      console.error('a repeated invoice failed', err instanceof Error ? err.name : 'error')
    }
  }
  return out
}

async function issueOne(db: D1Database, repeat: Repeat, today: string): Promise<RepeatIssued | null> {
  const next = nextAfter(repeat.nextOn, repeat.every, repeat.anchor, today)
  const mark = (why: string) => db.prepare('UPDATE invoice_repeats SET failed = ? WHERE id = ? AND stopped_at IS NULL').bind(why, repeat.id).run()
  const company = await getCompany(db, repeat.companyId)
  const template = company ? await getInvoice(db, company.id, repeat.templateId) : null
  if (!company || !template) return null
  // Past its last day, or after the contract: the repeat ends.
  if ((repeat.untilOn && today > repeat.untilOn) || !serviceOpen(company, today)) {
    await db.batch(stopRepeatStatements(db, company.id, repeat.id, null, repeat.untilOn && today > repeat.untilOn ? 'until' : 'ended'))
    return null
  }
  const lines: Line[] = (await invoiceLines(db, template.id)).filter((l) => typeof l.vatCents !== 'number').map((l, i) => ({ ...l, position: i + 1 }))
  if (lines.length === 0) return null
  const totals = totalsOf(lines, company.vatPayer)
  // Another currency: the ECB's rate of the day before the supply (a typed rate is the template's own day's, not this one's).
  let fx: { currency: string; rate: string | null; day: string | null } | null = null
  if (template.currency !== 'EUR') {
    const found = rateFor(await ratesFor(db, [template.currency]), template.currency, today, 'before')
    if (!found) {
      await mark('rate')
      return null
    }
    fx = { currency: template.currency, rate: rateText(found.rate), day: found.day }
  }
  const values: InvoiceValues = {
    customerName: template.customerName,
    customerAddress: template.customerAddress ?? '',
    customerIco: template.customerIco ?? '',
    customerDic: template.customerDic ?? '',
    customerIcdph: template.customerIcdph ?? '',
    customerEmail: template.customerEmail ?? '',
    issued: today,
    delivered: today,
    due: today,
    iban: template.iban ?? '',
    note: template.note ?? '',
    lines: [],
    mode: template.mode,
    reverseKind: template.reverse?.kind ?? '',
    reverseCode: template.reverse?.code ?? '',
  }
  const id = crypto.randomUUID()
  const documentId = crypto.randomUUID()
  const due = plusDays(today, Math.max(0, daysBetween(template.issuedOn, template.dueOn)))
  try {
    await db.batch([
      ...saveInvoiceStatements(db, {
        id,
        company: company.id,
        user: repeat.createdBy ?? '',
        issue: true,
        values,
        lines,
        totals,
        issued: today,
        delivered: today,
        due,
        token: newToken(),
        iban: template.iban,
        documentId,
        fx,
        repeat: repeat.id,
      }),
      db.prepare('UPDATE invoice_repeats SET next_on = ?, last_invoice_id = ?, last_on = ?, failed = NULL WHERE id = ? AND stopped_at IS NULL').bind(next, id, today, repeat.id),
      eventStatement(db, { company: company.id, user: null, action: 'invoice.repeated', subject: id, detail: { repeat: repeat.id, template: template.id, total: totals.total } }),
    ])
  } catch (err) {
    const text = err instanceof Error ? err.message : ''
    // Issued already today (a second run), or a period the accountant locked.
    if (/UNIQUE|constraint/i.test(text)) return null
    await mark(/FIRMONY_PERIOD_LOCKED/.test(text) ? 'locked' : 'failed')
    return null
  }
  return { repeat: { ...repeat, nextOn: next, lastInvoiceId: id, lastOn: today }, invoiceId: id, documentId, company }
}
