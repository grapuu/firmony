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
import { getInvoice, invoiceLines, saveInvoiceStatements, stateOf, totalsOf, ublOf, type InvoiceState, type InvoiceValues, type Line } from '../app/invoices'
import { newToken } from '../app/session'
import { monthName } from '../app/copy'
import { bratislava } from '../app/remind'
import { addMonths, BILLING_BACK_MONTHS, draftOf, monthStart, monthsFrom, peopleIn, type BillingDraft, type Tariff } from './billing'

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
 * month, counting the company's first month as the first, or once the contract has an end (notice given or ended by us),
 * when the deposit goes to the last bills, the exit fee and what is unpaid. Before that the monthly fee is paid as usual.
 */
export function depositDue(company: Pick<Company, 'startOn' | 'endsOn'>, month: string): boolean {
  if (company.endsOn) return true
  if (!company.startOn) return false
  return month >= addMonths(company.startOn.slice(0, 7), FORMATION.depositFromMonth - 1)
}

/** What of a client's prepayment this bill takes: the bill's total at most. */
export const creditOf = (bill: Pick<ClientBill, 'prepaidCents' | 'draft'>) => Math.max(0, Math.min(bill.prepaidCents, bill.draft.totalCents))

/**
 * Every client's draft for the month an invoice is issued in: the clients with a contract that runs or ran, whose
 * data are not being handed over or deleted; europio itself and the sample companies are none.
 */
export async function billingDrafts(db: D1Database, month: string): Promise<ClientBill[]> {
  const where = 'c.operator = 0 AND c.demo = 0 AND c.contract_at IS NOT NULL AND c.start_on IS NOT NULL AND c.purge_started_at IS NULL AND c.purged_at IS NULL'
  const first = addMonths(month, -BILLING_BACK_MONTHS)
  const months = monthsFrom(first, addMonths(month, -1))
  const bounds = [...months, month].map(monthStart)
  const bucket = months.map((m, i) => `WHEN d.created_at < ${bounds[i + 1]} THEN '${m}'`).join(' ')
  const [companyRows, tariffRows, docRows, employeeRows, closingRows, billedRows, prepaidRows, foundingRows] = await db.batch<Row>([
    db.prepare(`SELECT ${COMPANY_COLUMNS} FROM companies c LEFT JOIN users acc ON acc.id = c.accountant_id WHERE ${where} ORDER BY c.name`),
    db.prepare(`SELECT t.company_id, t.data FROM billing_tariffs t JOIN companies c ON c.id = t.company_id WHERE ${where}`),
    // A document counts in the month it came to us, once: not a duplicate, not discarded, and not our own invoice.
    db.prepare(
      `SELECT d.company_id, CASE ${bucket} END AS month, COUNT(*) AS n, SUM(CASE WHEN d.source = 'issued' THEN 1 ELSE 0 END) AS issued FROM documents d JOIN companies c ON c.id = d.company_id
        WHERE ${where} AND d.created_at >= ? AND d.created_at < ? AND d.deleted_at IS NULL AND d.duplicate_of IS NULL AND d.source <> 'firmony'
        GROUP BY d.company_id, month`,
    ).bind(bounds[0], bounds[bounds.length - 1]),
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
  const allDocs = new Map<string, Map<string, number>>()
  const issuedDocs = new Map<string, Map<string, number>>()
  for (const r of docRows?.results ?? []) {
    if (typeof r.month !== 'string') continue
    const id = String(r.company_id)
    allDocs.set(id, (allDocs.get(id) ?? new Map<string, number>()).set(r.month, Number(r.n)))
    issuedDocs.set(id, (issuedDocs.get(id) ?? new Map<string, number>()).set(r.month, Number(r.issued ?? 0)))
  }
  const docsOf = (id: string, tariff: Tariff | 'corrupt') => {
    const all = allDocs.get(id) ?? new Map<string, number>()
    if (tariff === 'corrupt' || !tariff.issuedInvoicesFree) return all
    const issued = issuedDocs.get(id)
    return new Map([...all].map(([m, n]) => [m, Math.max(0, n - (issued?.get(m) ?? 0))]))
  }
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
  token: string
  delivered: boolean
  remindedAt: number | null
  state: InvoiceState
}

/** europio's invoices to clients, the newest first, with what became of each. */
export async function billRows(db: D1Database, today: string, client: string | null = null, limit = 200): Promise<BillRow[]> {
  const rows = await db
    .prepare(
      `SELECT b.invoice_id, b.client_id, b.delivered_at, i.number, i.vs, i.customer_name, i.issued_on, i.due_on, i.total_cents, i.token, i.reminded_at, i.status,
         (SELECT p.booked_on FROM links l JOIN payments p ON p.id = l.payment_id WHERE l.document_id = i.document_id ORDER BY p.booked_on LIMIT 1) AS paid_on
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
    token: String(r.token),
    delivered: r.delivered_at !== null && r.delivered_at !== undefined,
    remindedAt: typeof r.reminded_at === 'number' ? r.reminded_at : null,
    state: stateOf({ status: String(r.status), paidOn: str(r.paid_on), dueOn: String(r.due_on) }, today),
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
  if (await db.prepare('SELECT 1 AS x FROM outbox WHERE id LIKE ?').bind(`bell:billing:${month}:%`).first()) return
  if (!(await billingDrafts(db, month)).some(issuable)) return
  const admins = await db.prepare("SELECT email FROM users WHERE team = 'admin'").all<{ email: string }>()
  if (admins.results.length > 0)
    await db.batch(admins.results.map((a) => ringStatement(db, 'billing', month, a.email, bell.teamBilling(monthName(month), `${origin}/ucto/fakturacia`))))
}

/** A reminder of an unpaid invoice past its due day: a message in the client's app and a doorbell, once a week. */
export const REMIND_EVERY = 7 * 86400

export function remindMessage(number: string, totalCents: number, dueOn: string, iban: string | null, vs: string = number): string {
  return `Faktúra č. ${number} na ${formatEurExact(totalCents)} bola splatná ${textDay(dueOn)} a platbu od Vás zatiaľ nevidíme. Prosíme o úhradu${iban ? ` na účet ${iban.replace(/(.{4})/g, '$1 ').trim()}` : ''} s variabilným symbolom ${vs}. QR kód na platbu nájdete v časti Firma a nastavenia. Ak ste už zaplatili, ďakujeme a správu prosím nevšímajte.`
}

