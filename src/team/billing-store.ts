// Firmony's own invoices to its clients, in the database. europio s. r. o. is a company in the app like any other
// (operator = 1): its invoices are issued by the same code as a client's (numbers in an unbroken row, PAY by square,
// the e-invoice, the public page), they are documents of europio's own books, and europio's bank statement pairs the
// payments with them by their variable symbol, so an invoice says "zaplatená" by itself. Each client gets a copy of
// its invoice among its documents (source 'firmony', the e-invoice as its original), which its accountant books and
// its own bank pairs, and a message in the app; the email only rings.
//
// Issuing is two steps. The first writes the invoice and claims what it bills (billing_items: a key billed twice
// fails the whole batch, so nothing is billed twice however often the button is pressed). The second delivers the
// client's copy; it is idempotent and the schedule repeats it for a copy that did not arrive.
import { FORMATION } from '../config'
import { now } from '../db'
import { formatEurExact } from '../format'
import { textDay } from '../app/booking'
import { bell, ringStatement } from '../bell'
import { resolveContract, contractCatalogue } from '../contracts'
import { deliveryStatusSql, safeJson } from '../filings/model'
import { fileHash } from '../app/read'
import { readInvoice } from '../app/xml'
import { COMPANY_COLUMNS, companyOf, eventStatement, insertDocumentStatement, membersOf, messageStatement, type Company } from '../app/store'
import { getInvoice, invoiceLines, saveInvoiceStatements, stateOf, totalsOf, ublOf, type InvoiceState, type InvoiceValues, type Line, type StoredInvoice } from '../app/invoices'
import { newToken } from '../app/session'
import { monthName } from '../app/copy'
import { bratislava } from '../app/remind'
import { addMonths, BILLING_BACK_MONTHS, draftOf, monthStart, monthsFrom, peopleIn, type BillingDraft, type Tariff } from './billing'
import { byPressure, HISTORY_MONTHS, usageOf, type PlanUsage } from './plan-usage'

type Row = Record<string, unknown>
const str = (v: unknown) => (typeof v === 'string' ? v : null)

/** europio s. r. o., the company that issues Firmony's invoices, once it has been set up in the app. */
export async function operatorOf(db: D1Database): Promise<Company | null> {
  const row = await db.prepare(`SELECT ${COMPANY_COLUMNS} FROM companies c LEFT JOIN users acc ON acc.id = c.accountant_id WHERE c.operator = 1`).first<Row>()
  return row ? companyOf(row) : null
}

/** Today's price list, as a tariff: for a paper contract on the day it is made, or in place of a missing one. */
export function priceListTariff(source: Tariff['source']): Tariff {
  const catalogue = contractCatalogue()
  return { source, plans: catalogue.plans.map((p) => ({ id: p.id, name: p.name, docs: p.docs, monthlyCents: p.monthlyCents })), payrollCents: catalogue.payrollCents, closingCents: catalogue.closingCents, firstMonthFree: catalogue.firstMonthFree, issuedInvoicesFree: catalogue.issuedInvoicesFree }
}

/** The prices of a paper contract, kept when the client is made (the same batch). */
export function paperTariffStatement(db: D1Database, company: string, user: string): D1PreparedStatement {
  return db.prepare('INSERT INTO billing_tariffs (company_id, data, created_at, created_by) VALUES (?, ?, ?, ?)').bind(company, JSON.stringify(priceListTariff('paper')), now(), user)
}

function tariffOfJson(raw: unknown): Tariff | null {
  try {
    const t = JSON.parse(String(raw)) as Tariff
    const ok =
      Array.isArray(t.plans) &&
      t.plans.every((p) => typeof p.id === 'string' && typeof p.name === 'string' && Number.isSafeInteger(p.docs) && Number.isSafeInteger(p.monthlyCents)) &&
      Number.isSafeInteger(t.payrollCents) &&
      Number.isSafeInteger(t.closingCents)
    // A paper contract saved before the offer has neither part of it.
    return ok ? { ...t, source: 'paper', firstMonthFree: t.firstMonthFree === true, issuedInvoicesFree: t.issuedInvoicesFree === true } : null
  } catch {
    return null
  }
}

/** The prices a client is billed by: its contract's, else its paper contract's, else today's price list (flagged). */
async function tariffFor(db: D1Database, company: Company, paper: Map<string, Tariff>): Promise<Tariff | 'corrupt'> {
  const contract = await resolveContract(db, company.id, company.termsVersion)
  if (contract.status === 'corrupt') return 'corrupt'
  if (contract.snapshot) {
    const c = contract.snapshot.catalogue
    // A contract concluded before the offer was saved without it, and keeps what it said.
    const offer = c as { firstMonthFree?: unknown; issuedInvoicesFree?: unknown }
    return { source: 'contract', plans: c.plans.map((p) => ({ id: p.id, name: p.name, docs: p.docs, monthlyCents: p.monthlyCents })), payrollCents: c.payrollCents, closingCents: c.closingCents, firstMonthFree: offer.firstMonthFree === true, issuedInvoicesFree: offer.issuedInvoicesFree === true }
  }
  return paper.get(company.id) ?? priceListTariff('pricelist')
}

/** The same saved tariff as billing uses; a broken paper record must not masquerade as a confirmed price. */
export async function tariffForClient(db:D1Database,company:Company):Promise<Tariff|'corrupt'> {
  const row=await db.prepare('SELECT data FROM billing_tariffs WHERE company_id=?').bind(company.id).first<{data:string}>()
  const tariff=row?tariffOfJson(row.data):null
  if(row&&!tariff)return 'corrupt'
  return tariffFor(db,company,new Map(tariff?[[company.id,tariff]]:[]))
}

export interface ClientBill {
  company: Company
  draft: BillingDraft
  /** The contract's record could not be verified: nothing is billed until it is. */
  corrupt: boolean
  /** Documents that came in last month, for the page. */
  docsLastMonth: number
  /** The deposit of a company formed through the s. r. o. for 1 € that this bill may take (src/founding/): none before the
   *  last months of the commitment, unless the contract ends sooner. */
  prepaidCents: number
}

/**
 * Whether a bill of this month may take the deposit (article 3 of the formation contract): from the commitment's 31st
 * month, counting the company's first month as the first, or once the contract has ended (notice given or ended by us),
 * when the deposit goes to the exit fee and what is unpaid. Not while the notice runs: the client may take it back until
 * the last day (point 10.2), and the deposit has to be whole then. Before that the monthly fee is paid as usual.
 */
export function depositDue(company: Pick<Company, 'startOn' | 'endsOn'>, month: string): boolean {
  if (company.endsOn && month > company.endsOn.slice(0, 7)) return true
  if (!company.startOn) return false
  return month >= addMonths(company.startOn.slice(0, 7), FORMATION.depositFromMonth - 1)
}

/** What of a client's prepayment this bill takes: the bill's total at most. */
export const creditOf = (bill: Pick<ClientBill, 'prepaidCents' | 'draft'>) => Math.max(0, Math.min(bill.prepaidCents, bill.draft.totalCents))

/**
 * Every client's draft for the month an invoice is issued in: the clients with a contract that runs or ran, whose
 * data are not being handed over or deleted; europio itself and the sample companies are none.
 */
/** The clients billed: a contract that runs or ran, data not being handed over or deleted; europio and the samples are none. */
export const billedClientsSql = (demo = false) =>
  `c.operator = 0 AND ${demo ? '' : 'c.demo = 0 AND '}c.contract_at IS NOT NULL AND c.start_on IS NOT NULL AND c.purge_started_at IS NULL AND c.purged_at IS NULL`
export const BILLED_CLIENTS_SQL = billedClientsSql()

/**
 * What counts among a plan's documents (the terms, 4.2), as SQL over a document `d`: a document that came to us in the
 * app, once. Not a deleted one (what the accountant discards is deleted too), not the same document twice, not our own
 * invoice to the client, and not the open items the accountant took over from the client's former accountant (they
 * came with the books, not in the month they were typed in). A document the app took for a duplicate counts when the
 * accountant booked it all the same (two equal receipts of a day are two) or when its original was deleted (it is then
 * the only one). Invoices the client issues in the app are counted apart, so that an offer that leaves them out can.
 */
export const PLAN_DOC_SQL = `d.deleted_at IS NULL AND d.source NOT IN ('firmony', 'takeover')
  AND (d.duplicate_of IS NULL OR d.booked_at IS NOT NULL OR NOT EXISTS (SELECT 1 FROM documents o WHERE o.id = d.duplicate_of AND o.deleted_at IS NULL))`

/** Each client's documents by the Bratislava month they came in, from the first month given to the last one's end. */
export function docCountStatement(db: D1Database, months: readonly string[], clients: string = BILLED_CLIENTS_SQL): D1PreparedStatement {
  const bounds = [...months, addMonths(months[months.length - 1]!, 1)].map(monthStart)
  const bucket = months.map((m, i) => `WHEN d.created_at < ${bounds[i + 1]} THEN '${m}'`).join(' ')
  return db
    .prepare(
      `SELECT d.company_id, CASE ${bucket} END AS month, COUNT(*) AS n, SUM(CASE WHEN d.source = 'issued' THEN 1 ELSE 0 END) AS issued FROM documents d JOIN companies c ON c.id = d.company_id
        WHERE ${clients} AND d.created_at >= ? AND d.created_at < ? AND ${PLAN_DOC_SQL}
        GROUP BY d.company_id, month`,
    )
    .bind(bounds[0], bounds[bounds.length - 1])
}

/** The rows of docCountStatement, by client: every document of a month, and of them the invoices issued in the app. */
export interface DocCounts {
  all: Map<string, Map<string, number>>
  issued: Map<string, Map<string, number>>
}

export function docCountsOf(rows: readonly Row[]): DocCounts {
  const all = new Map<string, Map<string, number>>()
  const issued = new Map<string, Map<string, number>>()
  for (const r of rows) {
    if (typeof r.month !== 'string') continue
    const id = String(r.company_id)
    all.set(id, (all.get(id) ?? new Map<string, number>()).set(r.month, Number(r.n)))
    issued.set(id, (issued.get(id) ?? new Map<string, number>()).set(r.month, Number(r.issued ?? 0)))
  }
  return { all, issued }
}

/** A client's documents of each month as its plan counts them: without the invoices it issued when its offer says so. */
export function planDocs(counts: DocCounts, id: string, tariff: Tariff | 'corrupt'): Map<string, number> {
  const all = counts.all.get(id) ?? new Map<string, number>()
  if (tariff === 'corrupt' || !tariff.issuedInvoicesFree) return all
  const issued = counts.issued.get(id)
  return new Map([...all].map(([m, n]) => [m, Math.max(0, n - (issued?.get(m) ?? 0))]))
}

export async function billingDrafts(db: D1Database, month: string): Promise<ClientBill[]> {
  const where = BILLED_CLIENTS_SQL
  const first = addMonths(month, -BILLING_BACK_MONTHS)
  const months = monthsFrom(first, addMonths(month, -1))
  const [companyRows, tariffRows, docRows, employeeRows, closingRows, billedRows, prepaidRows, foundingRows] = await db.batch<Row>([
    db.prepare(`SELECT ${COMPANY_COLUMNS} FROM companies c LEFT JOIN users acc ON acc.id = c.accountant_id WHERE ${where} ORDER BY c.name`),
    db.prepare(`SELECT t.company_id, t.data FROM billing_tariffs t JOIN companies c ON c.id = t.company_id WHERE ${where}`),
    // A document counts in the month it came to us, once (PLAN_DOC_SQL).
    docCountStatement(db, months, where),
    db.prepare(`SELECT e.company_id, e.started_on, e.ended_on FROM employees e JOIN companies c ON c.id = e.company_id WHERE ${where}`),
    // A closing is billed once it was filed (the terms, 4.3): submitted or accepted, not only prepared.
    db.prepare(
      `SELECT k.company_id, k.year, ${deliveryStatusSql('k.company_id', [safeJson('k.filed', '$.files.return.attemptId'), safeJson('k.filed', '$.files.statements.attemptId')])} AS status
         FROM closings k JOIN companies c ON c.id = k.company_id WHERE ${where} AND k.filed_at IS NOT NULL`,
    ),
    db.prepare(`SELECT b.client_id, b.key FROM billing_items b JOIN companies c ON c.id = b.client_id WHERE ${where}`),
    db.prepare(`SELECT c.id, c.prepaid_cents FROM companies c WHERE ${where} AND c.prepaid_cents > 0`),
    db.prepare(`SELECT f.company_id, f.exit_decision FROM foundings f JOIN companies c ON c.id = f.company_id WHERE ${where}`),
  ])
  // A formed company's commitment: the exit fee is owed when the company gave notice before its end, or when we ended the
  // contract for its breach (the designated person's decision 'charge'); never when it was waived.
  const commitments = new Map((foundingRows?.results ?? []).map((r) => [String(r.company_id), r.exit_decision === null || r.exit_decision === undefined ? null : String(r.exit_decision)]))
  const prepaid = new Map((prepaidRows?.results ?? []).map((r) => [String(r.id), Number(r.prepaid_cents)]))
  const companies = (companyRows?.results ?? []).map(companyOf)
  const paper = new Map<string, Tariff>()
  for (const r of tariffRows?.results ?? []) {
    const t = tariffOfJson(r.data)
    if (t) paper.set(String(r.company_id), t)
  }
  // Each month's documents, and of them the invoices the client issued in the app (free under the offer).
  const counts = docCountsOf(docRows?.results ?? [])
  const docsOf = (id: string, tariff: Tariff | 'corrupt') => planDocs(counts, id, tariff)
  const employees = new Map<string, { startedOn: string; endedOn: string | null }[]>()
  for (const r of employeeRows?.results ?? []) {
    const id = String(r.company_id)
    employees.set(id, [...(employees.get(id) ?? []), { startedOn: String(r.started_on), endedOn: str(r.ended_on) }])
  }
  const closings = new Map<string, number[]>()
  for (const r of closingRows?.results ?? [])
    if (r.status === 'submitted' || r.status === 'accepted') closings.set(String(r.company_id), [...(closings.get(String(r.company_id)) ?? []), Number(r.year)])
  const billed = new Map<string, Set<string>>()
  for (const r of billedRows?.results ?? []) billed.set(String(r.client_id), (billed.get(String(r.client_id)) ?? new Set<string>()).add(String(r.key)))
  const out: ClientBill[] = []
  for (const company of companies) {
    const tariff = await tariffFor(db, company, paper)
    const people = new Map(months.map((m) => [m, peopleIn(m, employees.get(company.id) ?? [])]))
    const draft =
      tariff === 'corrupt'
        ? { lines: [], flags: [], totalCents: 0 }
        : draftOf({
            month,
            startOn: company.startOn,
            endsOn: company.endsOn,
            plan: company.plan,
            tariff,
            docs: docsOf(company.id, tariff),
            people,
            closings: closings.get(company.id) ?? [],
            billed: billed.get(company.id) ?? new Set(),
            commitment: commitments.has(company.id)
              ? { months: FORMATION.commitMonths, maxMonths: FORMATION.exitMaxMonths, charge: commitments.get(company.id) === 'charge' || (commitments.get(company.id) !== 'waive' && company.noticeSide === 'client') }
              : null,
          })
    out.push({ company, draft, corrupt: tariff === 'corrupt', docsLastMonth: docsOf(company.id, tariff).get(addMonths(month, -1)) ?? 0, prepaidCents: depositDue(company, month) ? (prepaid.get(company.id) ?? 0) : 0 })
  }
  return out
}

/** Every client's documents of the month that runs against its plan, with the months before (team/plan-usage.ts). */
export async function planUsages(db: D1Database, at: number, only: string | null = null, demo = false): Promise<{ company: Company; usage: PlanUsage; corrupt: boolean; tariff: Tariff['source'] | 'corrupt' }[]> {
  if (only !== null && !/^[A-Za-z0-9-]{1,64}$/.test(only)) return []
  const month = bratislava(at * 1000).day.slice(0, 7)
  const months = monthsFrom(addMonths(month, -HISTORY_MONTHS), month)
  // A contract that has begun by this month and not ended before it (the month and the id are checked above, so inlined).
  const clients = `${billedClientsSql(demo)} AND c.start_on < '${addMonths(month, 1)}-01' AND (c.ends_on IS NULL OR c.ends_on >= '${month}-01')${only ? ` AND c.id = '${only}'` : ''}`
  const [companyRows, tariffRows, docRows] = await db.batch<Row>([
    db.prepare(`SELECT ${COMPANY_COLUMNS} FROM companies c LEFT JOIN users acc ON acc.id = c.accountant_id WHERE ${clients} ORDER BY c.name`),
    db.prepare(`SELECT t.company_id, t.data FROM billing_tariffs t JOIN companies c ON c.id = t.company_id WHERE ${clients}`),
    docCountStatement(db, months, clients),
  ])
  const paper = new Map<string, Tariff>()
  for (const r of tariffRows?.results ?? []) {
    const t = tariffOfJson(r.data)
    if (t) paper.set(String(r.company_id), t)
  }
  const docs = docCountsOf(docRows?.results ?? [])
  const out: { company: Company; usage: PlanUsage; corrupt: boolean; tariff: Tariff['source'] | 'corrupt' }[] = []
  for (const company of (companyRows?.results ?? []).map(companyOf)) {
    const tariff = await tariffFor(db, company, paper)
    // A contract whose record cannot be verified is still counted, by today's prices, and said to be so.
    const prices = tariff === 'corrupt' ? priceListTariff('pricelist') : tariff
    const usage = usageOf({ month, at, plan: company.plan, tariff: prices, startOn: company.startOn, docs: planDocs(docs, company.id, prices) })
    if (usage) out.push({ company, usage, corrupt: tariff === 'corrupt', tariff: tariff === 'corrupt' ? 'corrupt' : tariff.source })
  }
  return out.sort(byPressure)
}

/**
 * The administrators are rung once a month for each client that outgrows its plan, and once more when it passes the
 * highest plan (a price to agree): in the client's month, while it can still be offered a larger plan. The doorbell names
 * nobody; the overview says who. Looked at once an hour.
 */
export async function planUsageScheduled(env: { DB: D1Database }, at: number, origin: string): Promise<number> {
  const db = env.DB
  const clock = bratislava(at)
  if (clock.minute >= 15 || clock.hour < 8 || clock.hour > 20) return 0
  const outgrown = (await planUsages(db, Math.floor(at / 1000))).filter((u) => u.usage.state === 'over' || u.usage.state === 'agree')
  if (outgrown.length === 0) return 0
  const admins = await db.prepare("SELECT email FROM users WHERE team = 'admin'").all<{ email: string }>()
  if (admins.results.length === 0) return 0
  const statements: D1PreparedStatement[] = []
  for (const { company, usage } of outgrown) {
    const kind = usage.state === 'agree' ? 'plan-agree' : 'plan-over'
    for (const a of admins.results) statements.push(ringStatement(db, kind, `${company.id}:${usage.month}`, a.email, (usage.state === 'agree' ? bell.teamPlanAgree : bell.teamPlanOver)(`${origin}/ucto/prehlad#baliky`)))
  }
  await db.batch(statements)
  return outgrown.length
}

/** Whether a draft may be issued as it stands. A plan without a price, or an unverified contract, is not. */
export const issuable = (bill: ClientBill) => !bill.corrupt && bill.draft.lines.length > 0 && !bill.draft.flags.includes('plan')

/**
 * Issues one client's invoice for what its draft bills (step one), then delivers the client's copy (step two).
 * Answers 'issued', or why not: 'empty' (nothing to bill), 'billed' (a line was billed meanwhile), 'iban' (europio
 * has no account for payments yet).
 */
export async function issueBill(
  env: { DB: D1Database; FILES?: R2Bucket },
  operator: Company,
  bill: ClientBill,
  user: string | null,
  today: string,
  origin: string,
): Promise<{ result: 'issued' | 'empty' | 'billed' | 'iban'; invoiceId?: string }> {
  const db = env.DB
  if (!issuable(bill)) return { result: 'empty' }
  if (!operator.invoiceIban) return { result: 'iban' }
  const client = bill.company
  const vatRate = operator.vatPayer ? 23 : 0
  const lines: Line[] = bill.draft.lines.map((l, i) => ({
    position: i + 1,
    description: l.description,
    quantityMilli: l.quantityMilli,
    unit: l.unit,
    unitCents: l.unitCents,
    vatRate,
    baseCents: l.cents,
  }))
  // The deposit of the s. r. o. for 1 € (article 3 of its contract), credited to the last bills of the commitment in the
  // order they fall due: a line of its own that takes it off, never more than the bill. It was paid before europio was a
  // VAT payer and bore no VAT, so it lowers the base and carries no VAT of its own; the supply's VAT stays whole. The companies' CHECK keeps the
  // rest at nought or above, so two bills issued at once cannot credit the same money twice.
  const credit = creditOf(bill)
  if (credit > 0)
    lines.push({ position: lines.length + 1, description: 'Započítaná zábezpeka zo zmluvy o založení spoločnosti', quantityMilli: -1000, unit: 'ks', unitCents: credit, vatRate, baseCents: -credit, vatCents: 0 })
  const totals = totalsOf(lines, operator.vatPayer)
  const due = bratislavaDayAfter(today, 14)
  const values: InvoiceValues = {
    customerName: client.name,
    customerAddress: client.address ?? '',
    customerIco: client.ico ?? '',
    customerDic: client.dic ?? '',
    customerIcdph: client.icdph ?? '',
    customerEmail: '',
    issued: today,
    delivered: today,
    due,
    iban: operator.invoiceIban,
    note: 'Ďakujeme, že účtujete s Firmony.',
    lines: [],
  }
  const id = crypto.randomUUID()
  const documentId = crypto.randomUUID()
  const clientDocument = crypto.randomUUID()
  try {
    await db.batch([
      ...saveInvoiceStatements(db, { id, company: operator.id, user, issue: true, values, lines, totals, issued: today, delivered: today, due, token: newToken(), iban: operator.invoiceIban, documentId }),
      db
        .prepare('INSERT INTO billing_invoices (invoice_id, client_id, month, document_id, created_at, created_by, prepaid_cents) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .bind(id, client.id, today.slice(0, 7), clientDocument, now(), user, credit),
      ...(credit > 0 ? [db.prepare('UPDATE companies SET prepaid_cents = prepaid_cents - ? WHERE id = ?').bind(credit, client.id)] : []),
      // A key billed already (two administrators at once, a reload) fails the whole batch: nothing is billed twice.
      ...bill.draft.lines.map((l) => db.prepare('INSERT INTO billing_items (client_id, key, invoice_id, cents) VALUES (?, ?, ?, ?)').bind(client.id, l.key, id, l.cents)),
      eventStatement(db, { company: operator.id, user, action: 'billing.issued', subject: id, detail: { client: client.id, total: totals.total, keys: bill.draft.lines.map((l) => l.key) } }),
    ])
  } catch (error) {
    if (/UNIQUE|PRIMARY KEY|constraint/i.test(error instanceof Error ? error.message : '')) return { result: 'billed' }
    throw error
  }
  await deliverBill(env, id, origin).catch((error) => console.error('billing delivery', error instanceof Error ? error.name : 'error'))
  return { result: 'issued', invoiceId: id }
}

function bratislavaDayAfter(day: string, days: number): string {
  const d = new Date(`${day}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/**
 * Puts the client's copy of an invoice among its documents, with the e-invoice as its original, says so in its
 * messages and rings its people. Idempotent: a copy that is there already is not made again. A client whose data
 * are being handed over or deleted gets nothing ('frozen'); the invoice stays in europio's books.
 */
export async function deliverBill(env: { DB: D1Database; FILES?: R2Bucket }, invoiceId: string, origin: string): Promise<'delivered' | 'done' | 'frozen' | 'missing'> {
  const db = env.DB
  const row = await db.prepare('SELECT * FROM billing_invoices WHERE invoice_id = ?').bind(invoiceId).first<Row>()
  if (!row) return 'missing'
  if (row.delivered_at !== null && row.delivered_at !== undefined) return 'done'
  const operator = await operatorOf(db)
  const clientRow = await db
    .prepare(`SELECT ${COMPANY_COLUMNS}, c.purge_started_at FROM companies c LEFT JOIN users acc ON acc.id = c.accountant_id WHERE c.id = ?`)
    .bind(String(row.client_id))
    .first<Row>()
  const invoice = operator ? await getInvoice(db, operator.id, invoiceId) : null
  if (!operator || !clientRow || !invoice) return 'missing'
  if (clientRow.purge_started_at !== null && clientRow.purge_started_at !== undefined) return 'frozen'
  const client = companyOf(clientRow)
  const docId = String(row.document_id)
  const author = str(row.created_by)
  const lines = await invoiceLines(db, invoiceId)
  // The copy, its message and the mark are written together, so a copy that is there was delivered: only the mark
  // is put right, and the client is not told twice.
  if (await db.prepare('SELECT 1 AS x FROM documents WHERE id = ? AND company_id = ?').bind(docId, client.id).first()) {
    await db.prepare('UPDATE billing_invoices SET delivered_at = ? WHERE invoice_id = ? AND delivered_at IS NULL').bind(now(), invoiceId).run()
    return 'done'
  }
  if (!env.FILES) return 'missing'
  const bytes = new TextEncoder().encode(ublOf(invoice, lines, operator))
  const reading = readInvoice(new TextDecoder().decode(bytes), client.ico)
  if (!reading) return 'missing'
  const key = `companies/${client.id}/documents/${docId}.xml`
  await env.FILES.put(key, bytes, { httpMetadata: { contentType: 'application/xml' } })
  const message = crypto.randomUUID()
  const members = await membersOf(db, client.id)
  const statements: D1PreparedStatement[] = [
    insertDocumentStatement(db, {
        id: docId,
        company: client.id,
        source: 'firmony',
        addedBy: null,
        fileKey: key,
        fileType: 'application/xml',
        fileName: `Firmony ${invoice.number ?? ''}.xml`,
        fileBytes: bytes.length,
        fileHash: await fileHash(bytes),
        // Whatever the e-invoice's parties look like to the reader, to the client it is a received invoice from europio.
        reading: { ...reading, kind: 'invoice_in', party: operator.name, partyIco: operator.ico, partyIban: invoice.iban, category: 'services' },
        readBy: 'xml',
        status: 'read',
      }),
    messageStatement(db, {
      id: message,
      company: client.id,
      author,
      side: 'firmony',
      body: billMessage(invoice.number ?? '', invoice.totalCents, invoice.dueOn),
      payment: null,
    }),
    eventStatement(db, { company: client.id, user: author, action: 'billing.delivered', subject: invoiceId, detail: { document: docId } }),
    db.prepare('UPDATE billing_invoices SET delivered_at = ? WHERE invoice_id = ? AND delivered_at IS NULL').bind(now(), invoiceId),
    ...members.map((m) => ringStatement(db, 'invoice', invoiceId, m.email, bell.invoice(`${origin}/app/firma#faktury-firmony`))),
  ]
  try {
    await db.batch(statements)
  } catch (error) {
    // The original is deleted only when no document names it: an interrupted answer may hide a batch that did commit.
    const used = await db.prepare('SELECT 1 AS x FROM documents WHERE file_key = ?').bind(key).first().catch(() => true)
    if (!used) await env.FILES.delete(key)
    throw error
  }
  return 'delivered'
}

export function billMessage(number: string, totalCents: number, dueOn: string): string {
  return `Vystavili sme faktúru č. ${number} za služby Firmony na ${formatEurExact(totalCents)} so splatnosťou ${textDay(dueOn)}. Nájdete ju v časti Firma a nastavenia aj s QR kódom na platbu. Medzi Vaše doklady sme ju pridali sami.`
}

export interface BillRow {
  invoiceId: string
  number: string
  /** Its variable symbol (the year and its order), the number for invoices issued before 18 October 2026. */
  vs: string
  clientId: string
  clientName: string
  issuedOn: string
  dueOn: string
  totalCents: number
  /** What the bill still asks after the credit notes that correct it. */
  leftCents: number
  token: string
  delivered: boolean
  remindedAt: number | null
  state: InvoiceState
}

/** europio's invoices to clients, the newest first, with what became of each. */
export async function billRows(db: D1Database, today: string, client: string | null = null, limit = 200): Promise<BillRow[]> {
  const rows = await db
    .prepare(
      `SELECT b.invoice_id, b.client_id, b.delivered_at, i.number, i.vs, i.customer_name, i.issued_on, i.due_on, i.total_cents, i.token, i.reminded_at, i.status, i.kind,
         (SELECT p.booked_on FROM links l JOIN payments p ON p.id = l.payment_id WHERE l.document_id = i.document_id ORDER BY p.booked_on LIMIT 1) AS paid_on,
         (SELECT COALESCE(SUM(ABS(cn.total_cents)), 0) FROM invoices cn WHERE cn.company_id = i.company_id AND cn.corrects = i.id AND cn.kind = 'credit' AND cn.status = 'issued') AS credited
         FROM billing_invoices b JOIN invoices i ON i.id = b.invoice_id
        WHERE (?1 IS NULL OR b.client_id = ?1) ORDER BY i.issued_on DESC, i.seq DESC LIMIT ?2`,
    )
    .bind(client, limit)
    .all<Row>()
  return rows.results.map((r) => ({
    invoiceId: String(r.invoice_id),
    number: String(r.number ?? ''),
    vs: String(r.vs ?? r.number ?? ''),
    clientId: String(r.client_id),
    clientName: String(r.customer_name),
    issuedOn: String(r.issued_on),
    dueOn: String(r.due_on),
    totalCents: Number(r.total_cents),
    leftCents: Math.max(0, Number(r.total_cents) - Number(r.credited ?? 0)),
    token: String(r.token),
    delivered: r.delivered_at !== null && r.delivered_at !== undefined,
    remindedAt: typeof r.reminded_at === 'number' ? r.reminded_at : null,
    // A bill the deposit paid whole (0 €) or a credit note took back whole asks for nothing: it is settled, never chased.
    state: stateOf({ status: String(r.status), paidOn: str(r.paid_on), dueOn: String(r.due_on), kind: (r.kind ?? 'invoice') as StoredInvoice['kind'], totalCents: Math.max(0, Number(r.total_cents) - Number(r.credited ?? 0)) }, today),
  }))
}

/**
 * Copies that did not arrive (the client's documents could not be written at that moment), from the last month: the
 * schedule repeats them. A client whose data are being handed over or deleted gets none, and is not asked again.
 */
export async function undelivered(db: D1Database, limit = 20): Promise<string[]> {
  const rows = await db
    .prepare(
      `SELECT b.invoice_id FROM billing_invoices b JOIN companies c ON c.id = b.client_id
        WHERE b.delivered_at IS NULL AND b.created_at > ? AND c.purge_started_at IS NULL AND c.purged_at IS NULL ORDER BY b.created_at LIMIT ?`,
    )
    .bind(now() - 31 * 86400, limit)
    .all<Row>()
  return rows.results.map((r) => String(r.invoice_id))
}

/**
 * The schedule's part: copies that did not arrive are delivered again; in the first five days of a month, at nine in
 * the morning, every bill with nothing to look at is issued by itself, as the administrator's "Vystaviť všetky" issues
 * it (his word of 28 October 2026: the firm runs without his attention); and the administrators are rung once only
 * when some bill waits for them (a note to check, a price to agree).
 */
export async function billingScheduled(env: { DB: D1Database; FILES?: R2Bucket }, at: number, origin: string): Promise<void> {
  const db = env.DB
  for (const id of await undelivered(db)) await deliverBill(env, id, origin).catch((error) => console.error('billing delivery', error instanceof Error ? error.name : 'error'))
  const clock = bratislava(at)
  // Looked at once an hour, in the first quarter of it: working out every client's month is not for every run.
  if (clock.date > 5 || clock.hour < 9 || clock.minute >= 15) return
  const month = clock.day.slice(0, 7)
  const operator = await operatorOf(db)
  if (!operator) return
  // Once a day, at nine: a bill issued is never issued again (billing_items), so a later run finds nothing of it.
  if (clock.hour === 9 && operator.invoiceIban)
    for (const bill of (await billingDrafts(db, month)).filter((b) => issuable(b) && b.draft.flags.length === 0)) {
      const done = await issueBill(env, operator, bill, null, clock.day, origin).catch((error) => {
        console.error('billing auto', error instanceof Error ? error.name : 'error')
        return null
      })
      if (done?.result === 'iban') break
    }
  // The administrators are rung by day, and only for a bill that waits for them: one without a flag is issued at nine by
  // the run above (on the 5th, the last day it runs, whatever is left waits for them too).
  if (clock.hour > 20) return
  if (await db.prepare('SELECT 1 AS x FROM outbox WHERE id LIKE ?').bind(`bell:billing:${month}:%`).first()) return
  if (!(await billingDrafts(db, month)).some((b) => issuable(b) && (b.draft.flags.length > 0 || clock.date === 5 || !operator.invoiceIban))) return
  const admins = await db.prepare("SELECT email FROM users WHERE team = 'admin'").all<{ email: string }>()
  if (admins.results.length > 0)
    await db.batch(admins.results.map((a) => ringStatement(db, 'billing', month, a.email, bell.teamBilling(monthName(month), `${origin}/ucto/fakturacia`))))
}

/** A reminder of an unpaid invoice past its due day: a message in the client's app and a doorbell, once a week. */
export const REMIND_EVERY = 7 * 86400

/**
 * Firmony's own invoices collected without the administrator (his word of 28 October 2026): an invoice still unpaid
 * three days past its due day, and again at fourteen, gets the same reminder the button sends (a message in the
 * client's app and a doorbell); at thirty days the administrators are rung once, since what follows is their decision.
 * Each step once (`invoices.reminders` moved from the step it read), a manual reminder of the last five days counts for
 * the client's step, and a client whose data are handed over or deleted gets nothing. Looked at at nine in the morning.
 */
export const BILL_STEPS = [
  { days: 3, client: true },
  { days: 14, client: true },
  { days: 30, client: false },
] as const

export async function remindBillsScheduled(env: { DB: D1Database }, at: number, origin: string): Promise<number> {
  const db = env.DB
  const clock = bratislava(at)
  if (clock.hour !== 9 || clock.minute >= 15) return 0
  const operator = await operatorOf(db)
  if (!operator) return 0
  const today = clock.day
  const overdue = (await billRows(db, today, null, 2000)).filter((r) => r.state === 'overdue')
  if (overdue.length === 0) return 0
  // How far europio's bank is known (its statements and payments): a client is told that we do not see the payment only
  // once the bank reaches the day before the reminder's day, else a payment made in time but not read yet is chased.
  const bank = await db
    .prepare("SELECT MAX(d) AS d FROM (SELECT MAX(booked_on) AS d FROM payments WHERE company_id = ?1 UNION ALL SELECT MAX(to_on) AS d FROM statements WHERE company_id = ?1 AND status IN ('taken', 'known'))")
    .bind(operator.id)
    .first<{ d: string | null }>()
  const bankUntil = bank?.d ?? ''
  const dayAfter = (day: string, days: number) => new Date(Date.parse(`${day}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)
  const ts = now()
  let done = 0
  for (const row of overdue) {
    const days = Math.floor((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${row.dueOn}T12:00:00Z`)) / 86_400_000)
    const reached = BILL_STEPS.filter((step) => days >= step.days).length
    const state = await db
      .prepare('SELECT i.reminders, c.purge_started_at, c.purged_at FROM invoices i JOIN companies c ON c.id = ? WHERE i.id = ? AND i.company_id = ?')
      .bind(row.clientId, row.invoiceId, operator.id)
      .first<{ reminders: number; purge_started_at: number | null; purged_at: number | null }>()
    if (!state || state.purge_started_at || state.purged_at || reached <= state.reminders) continue
    // One step a day at most: an invoice found long overdue still gets its reminders before the administrators hear.
    const target = state.reminders + 1
    const step = BILL_STEPS[target - 1]!
    if (step.client && bankUntil < dayAfter(row.dueOn, step.days - 1)) continue
    // The step is claimed first, from the one it read: two runs never send it twice.
    const claimed = await db.prepare('UPDATE invoices SET reminders = ?1 WHERE id = ?2 AND reminders = ?3').bind(target, row.invoiceId, state.reminders).run()
    if ((claimed.meta?.changes ?? 0) === 0) continue
    const recently = row.remindedAt !== null && row.remindedAt > ts - 5 * 86400
    try {
      if (step.client && !recently) {
        const members = await membersOf(db, row.clientId)
        await db.batch([
          db.prepare('UPDATE invoices SET reminded_at = ? WHERE id = ?').bind(ts, row.invoiceId),
          messageStatement(db, { id: crypto.randomUUID(), company: row.clientId, author: null, side: 'firmony', body: remindMessage(row.number, row.leftCents, row.dueOn, operator.invoiceIban, row.vs), payment: null }),
          eventStatement(db, { company: row.clientId, user: null, action: 'billing.reminded', subject: row.invoiceId, detail: { auto: true, days: step.days } }),
          ...members.map((m) => ringStatement(db, 'invoice-overdue', `${row.invoiceId}:auto${step.days}`, m.email, bell.invoiceOverdue(`${origin}/app/firma#faktury-firmony`))),
        ])
        done++
      } else if (!step.client) {
        const admins = await db.prepare("SELECT email FROM users WHERE team = 'admin'").all<{ email: string }>()
        await db.batch([
          eventStatement(db, { company: row.clientId, user: null, action: 'billing.overdue30', subject: row.invoiceId }),
          ...admins.results.map((a) => ringStatement(db, 'invoice-overdue-team', row.invoiceId, a.email, bell.teamOverdue(`${origin}/ucto/fakturacia#vystavene`))),
        ])
        done++
      }
    } catch (error) {
      // Nothing was sent: the step is given back for the next run.
      await db.prepare('UPDATE invoices SET reminders = ?1 WHERE id = ?2 AND reminders = ?3').bind(state.reminders, row.invoiceId, target).run()
      console.error('billing reminder', error instanceof Error ? error.name : 'error')
    }
  }
  return done
}

export function remindMessage(number: string, totalCents: number, dueOn: string, iban: string | null, vs: string = number): string {
  return `Faktúra č. ${number} na ${formatEurExact(totalCents)} bola splatná ${textDay(dueOn)} a platbu od Vás zatiaľ nevidíme. Prosíme o úhradu${iban ? ` na účet ${iban.replace(/(.{4})/g, '$1 ').trim()}` : ''} s variabilným symbolom ${vs}. QR kód na platbu nájdete v časti Firma a nastavenia. Ak ste už zaplatili, ďakujeme a správu prosím nevšímajte.`
}

