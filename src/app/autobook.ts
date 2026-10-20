// Documents the app books by itself (20 October 2026; his word: "čím viac náš softvér bude robiť a čím bude lepší, tým
// máme vyššiu maržu ... urob ho elitný a dokonalý už teraz"; item 2(d) of the handover). A document is booked without
// the accountant only when everything agrees and nothing is left to judge: the supplier's rule she made and used at
// least twice gives its category; the reader or the e-invoice read it; it is in euros, no duplicate and no correction;
// one payment of the bank pays it to the cent; a routine cost below the threshold of an asset; and its VAT, for a payer,
// is a domestic purchase whose lines make its total, goes into the period of its own day, which is not filed, with
// nothing the return would say of it. Anything else stays in her queue. She turns it on per client; what was booked
// so is listed on the client's page for her month's check, and a document she books again is her work as any other.
import { AUTOBOOK } from '../config'
import { now } from '../db'
import { CATEGORIES, supplierKey, type Category } from './booking'
import { eventStatement, getCompany, getDocument, getPayment, vatCompanyOf, vatDocOf, type Company, type Doc, type Payment } from './store'
import { bratislavaDay } from '../time'
import { vatOf, type VatData } from './vat'
import { docPreview, filedReturns, type FiledReturn } from './vat-store'

/** Routine costs: nothing of them asks for an asset card, the stock, a trip or a judgement of the tax. */
export const AUTO_CATEGORIES: readonly Category[] = ['material', 'fuel', 'energy', 'repairs', 'travel', 'services', 'fees', 'insurance', 'bank']

export type AutoWhy = 'off' | 'kind' | 'source' | 'reader' | 'rule' | 'category' | 'amount' | 'currency' | 'duplicate' | 'corrects' | 'payment' | 'date' | 'vat' | 'period'

export interface AutoRule {
  category: Category
  vatDeduct: boolean
  uses: number
}

/**
 * Whether the app may book a document by itself, and the VAT it books it with (null for a company that is no payer).
 * Pure: everything it judges is given.
 */
export function autoBookable(
  doc: Doc,
  company: Company,
  rule: AutoRule | null,
  payment: Pick<Payment, 'amountCents' | 'currency' | 'docs'> | null,
  filed: FiledReturn[],
  today: string,
): { ok: true; vat: VatData | null } | { ok: false; why: AutoWhy } {
  const no = (why: AutoWhy) => ({ ok: false as const, why })
  if (!company.autobook) return no('off')
  if (doc.kind !== 'receipt' && doc.kind !== 'invoice_in') return no('kind')
  if (doc.source === 'trip' || doc.source === 'issued' || doc.source === 'takings' || doc.bookedAt !== null) return no('source')
  if (doc.status !== 'read' || !doc.readBy || doc.readBy.startsWith('person')) return no('reader')
  if (doc.proposal !== 'rule' || !rule || rule.uses < AUTOBOOK.ruleUses || doc.category !== rule.category || doc.vatDeduct !== rule.vatDeduct) return no('rule')
  if (!AUTO_CATEGORIES.includes(rule.category) || CATEGORIES[rule.category]?.payable) return no('category')
  if (doc.totalCents === null || doc.totalCents <= 0 || doc.totalCents > AUTOBOOK.limitCents) return no('amount')
  if ((doc.currency ?? 'EUR') !== 'EUR' || doc.fxRate) return no('currency')
  if (doc.duplicateOf !== null) return no('duplicate')
  if (doc.correctsHint || doc.vat?.corrects) return no('corrects')
  if (doc.paidPrivately || doc.cashPaid || !doc.paymentId || !payment || payment.docs !== 1 || (payment.currency ?? 'EUR') !== 'EUR' || Math.abs(payment.amountCents) !== doc.totalCents || payment.amountCents > 0)
    return no('payment')
  if (!doc.issuedOn || doc.issuedOn > today || (company.startOn && doc.issuedOn < company.startOn)) return no('date')
  const counted = vatOf(vatDocOf(doc), vatCompanyOf(company))
  if (company.vatStatus !== 'payer') return counted && counted.data.mode !== 'none' ? no('vat') : { ok: true, vat: null }
  // A payer: a domestic purchase whose lines make the total, deducted as the rule says, in no coefficient's year.
  if (!counted || counted.data.mode !== 'domestic' || counted.data.lines.length === 0 || (company.vatRatios ?? []).length > 0) return no('vat')
  const lines = counted.data.lines
  const sum = lines.reduce((s, line) => s + line.base + line.vat, 0)
  if (Math.abs(sum - doc.totalCents) > 1 || lines.some((line) => line.rate <= 0 || line.deduct !== (rule.vatDeduct ? line.vat : 0))) return no('vat')
  const data: VatData = { ...counted.data, period: null }
  const preview = docPreview(company, doc, data, filed)
  if (preview.issues.length > 0) return no('vat')
  if (preview.period !== preview.natural || filed.some((f) => f.period === preview.period)) return no('period')
  return { ok: true, vat: data }
}

/** A company's rule for a supplier, by the key its documents carry. */
async function ruleFor(db: D1Database, company: string, doc: Doc): Promise<AutoRule | null> {
  const key = supplierKey(doc.partyIco, doc.party)
  if (!key) return null
  const row = await db.prepare('SELECT category, vat_deduct, uses FROM supplier_rules WHERE company_id = ? AND key = ?').bind(company, key).first<{ category: string; vat_deduct: number; uses: number }>()
  return row && Object.hasOwn(CATEGORIES, row.category) ? { category: row.category as Category, vatDeduct: row.vat_deduct === 1, uses: Number(row.uses) } : null
}

/**
 * Books what may be booked: of one company (when its accountant turns it on) or of every company that has it on (the
 * schedule), the oldest documents first, at most `limit`. Each is written only while it is as it was judged (unbooked,
 * the same total, category and payment); a period locked since refuses it, and it waits for her. Returns how many.
 */
export async function autoBook(db: D1Database, company: string | null = null, limit: number = AUTOBOOK.perRun): Promise<number> {
  const rows = await db
    .prepare(
      `SELECT d.id, d.company_id FROM documents d JOIN companies c ON c.id = d.company_id AND c.autobook = 1 AND c.purged_at IS NULL
         JOIN links l ON l.document_id = d.id
       WHERE d.booked_at IS NULL AND d.deleted_at IS NULL AND d.status = 'read' AND d.proposal = 'rule' AND d.duplicate_of IS NULL
         AND d.kind IN ('receipt', 'invoice_in') AND d.source NOT IN ('trip', 'issued', 'takings') AND COALESCE(d.currency, 'EUR') = 'EUR'
         AND d.total_cents > 0 AND d.total_cents <= ?2 AND (?1 IS NULL OR d.company_id = ?1)
       ORDER BY d.created_at LIMIT ?3`,
    )
    .bind(company, AUTOBOOK.limitCents, limit)
    .all<{ id: string; company_id: string }>()
  const companies = new Map<string, { company: Company; filed: FiledReturn[] } | null>()
  const today = bratislavaDay(now())
  let booked = 0
  for (const row of rows.results) {
    try {
      if (!companies.has(row.company_id)) {
        const found = await getCompany(db, row.company_id)
        companies.set(row.company_id, found ? { company: found, filed: found.vatStatus === 'payer' ? await filedReturns(db, found.id) : [] } : null)
      }
      const of = companies.get(row.company_id)
      if (!of) continue
      const doc = await getDocument(db, row.company_id, row.id)
      if (!doc || !doc.paymentId) continue
      const [rule, payment] = await Promise.all([ruleFor(db, row.company_id, doc), getPayment(db, row.company_id, doc.paymentId)])
      const verdict = autoBookable(doc, of.company, rule, payment, of.filed, today)
      if (!verdict.ok) continue
      const at = now()
      const v = verdict.vat
      const results = await db.batch([
        db
          .prepare(
            `UPDATE documents SET booked_at = ?1, booked_by = 'auto',
               vat_mode = ?2, vat_lines = ?3, supplied_on = ?4, party_vat_id = ?5, corrects = NULL, vat_period = NULL
             WHERE id = ?6 AND company_id = ?7 AND booked_at IS NULL AND deleted_at IS NULL AND status = 'read' AND duplicate_of IS NULL
               AND total_cents IS ?8 AND category IS ?9 AND vat_deduct IS ?10
               AND EXISTS (SELECT 1 FROM links WHERE document_id = ?6 AND payment_id = ?11)`,
          )
          .bind(at, v ? v.mode : null, v ? JSON.stringify(v.lines) : null, v ? v.suppliedOn : doc.suppliedOn, v ? v.vatId : doc.partyVatId, doc.id, doc.companyId, doc.totalCents, doc.category, doc.vatDeduct ? 1 : 0, doc.paymentId),
        db
          .prepare(
            `INSERT INTO events (at, company_id, user_id, action, subject, detail)
             SELECT ?1, ?2, NULL, 'document.autobooked', ?3, ?4 WHERE EXISTS (SELECT 1 FROM documents WHERE id = ?3 AND booked_by = 'auto' AND booked_at = ?1)`,
          )
          .bind(at, doc.companyId, doc.id, JSON.stringify({ category: doc.category, payment: doc.paymentId })),
      ])
      if ((results[0]?.meta.changes ?? 0) > 0) booked++
    } catch (err) {
      // A period locked since, or anything else: the document waits for the accountant.
      console.error('booking by itself failed', err instanceof Error ? err.name : 'error')
    }
  }
  return booked
}

/** What the app booked by itself for a company in the last days, newest first, for the accountant's check. */
export async function autoBooked(db: D1Database, company: string, days = 31): Promise<{ id: string; party: string | null; issuedOn: string | null; totalCents: number | null; bookedAt: number }[]> {
  const rows = await db
    .prepare(
      `SELECT id, party, issued_on, total_cents, booked_at FROM documents
       WHERE company_id = ? AND booked_by = 'auto' AND booked_at >= ? AND deleted_at IS NULL ORDER BY booked_at DESC LIMIT 50`,
    )
    .bind(company, now() - days * 86400)
    .all<{ id: string; party: string | null; issued_on: string | null; total_cents: number | null; booked_at: number }>()
  return rows.results.map((r) => ({ id: r.id, party: r.party, issuedOn: r.issued_on, totalCents: r.total_cents, bookedAt: Number(r.booked_at) }))
}

/** The accountant turns booking by itself on or off for a client. */
export function autobookStatements(db: D1Database, company: string, on: boolean, by: string): D1PreparedStatement[] {
  return [
    db.prepare('UPDATE companies SET autobook = ? WHERE id = ?').bind(on ? 1 : 0, company),
    eventStatement(db, { company, user: by, action: on ? 'autobook.on' : 'autobook.off' }),
  ]
}
