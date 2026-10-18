// Business trips kept (18 October 2026, trips.ts): a trip and the document it makes, written in one batch, numbered in
// the company's year (CP2026-001), removed by a mark while its document is neither booked nor paired.
import { now } from '../db'
import { eventStatement } from './store'
import type { Meals, TripCar, TripResult, Transport } from './trips'

type Row = Record<string, unknown>
const str = (v: unknown) => (typeof v === 'string' ? v : null)

export interface Trip {
  id: string
  number: string
  createdAt: number
  createdByName: string | null
  traveller: string
  employeeId: string | null
  iban: string | null
  purpose: string
  from: string
  to: string
  start: string
  end: string
  transport: Transport
  plate: string | null
  car: TripCar | null
  meals: Record<string, Meals>
  result: TripResult
  totalCents: number
  documentId: string | null
  removedAt: number | null
  /** The document's state: booked by the accountant, and the day of the payment paired with it. */
  booked: boolean
  paidOn: string | null
}

const parse = <T>(text: unknown, fallback: T): T => {
  if (typeof text !== 'string') return fallback
  try {
    return JSON.parse(text) as T
  } catch {
    return fallback
  }
}

const COLUMNS = `t.*, u.name AS created_by_name, d.booked_at,
  (SELECT p.booked_on FROM links l JOIN payments p ON p.id = l.payment_id WHERE l.document_id = t.document_id ORDER BY p.booked_on LIMIT 1) AS paid_on`
const FROM = 'trips t LEFT JOIN users u ON u.id = t.created_by LEFT JOIN documents d ON d.id = t.document_id'

function tripOfRow(r: Row): Trip {
  return {
    id: String(r.id),
    number: String(r.number),
    createdAt: Number(r.created_at),
    createdByName: str(r.created_by_name),
    traveller: String(r.traveller),
    employeeId: str(r.employee_id),
    iban: str(r.iban),
    purpose: String(r.purpose),
    from: String(r.place_from),
    to: String(r.place_to),
    start: String(r.start_at),
    end: String(r.end_at),
    transport: (['car', 'company', 'public', 'other'].includes(String(r.transport)) ? r.transport : 'other') as Transport,
    plate: str(r.plate),
    car: parse<TripCar | null>(r.car, null),
    meals: parse<Record<string, Meals>>(r.meals, {}),
    result: parse<TripResult>(r.result, { days: [], meals: 0, carBasic: 0, carFuel: 0, total: Number(r.total_cents) }),
    totalCents: Number(r.total_cents),
    documentId: str(r.document_id),
    removedAt: typeof r.removed_at === 'number' ? r.removed_at : null,
    booked: typeof r.booked_at === 'number',
    paidOn: str(r.paid_on),
  }
}

/** The company's trips, the newest first, removed ones left out. */
export async function listTrips(db: D1Database, company: string, limit = 300): Promise<Trip[]> {
  const rows = await db.prepare(`SELECT ${COLUMNS} FROM ${FROM} WHERE t.company_id = ? AND t.removed_at IS NULL ORDER BY t.start_at DESC, t.seq DESC LIMIT ?`).bind(company, limit).all<Row>()
  return rows.results.map(tripOfRow)
}

export async function getTrip(db: D1Database, company: string, id: string): Promise<Trip | null> {
  const row = await db.prepare(`SELECT ${COLUMNS} FROM ${FROM} WHERE t.id = ? AND t.company_id = ?`).bind(id, company).first<Row>()
  return row ? tripOfRow(row) : null
}

/** The trip a document was made by. */
export async function tripOfDocument(db: D1Database, company: string, documentId: string): Promise<Trip | null> {
  const row = await db.prepare(`SELECT ${COLUMNS} FROM ${FROM} WHERE t.document_id = ? AND t.company_id = ?`).bind(documentId, company).first<Row>()
  return row ? tripOfRow(row) : null
}

/**
 * A trip and its document: the trip numbered in the company's year in the statement that writes it, the document a
 * received one owed to the traveller (category 'allowance': 512 against 333), of the day of the return in the books,
 * settled on `settledOn` and due by `due`, out of VAT altogether (mode 'none'), with the traveller's IBAN for the
 * payment orders.
 */
export function tripStatements(
  db: D1Database,
  a: {
    id: string
    documentId: string
    company: string
    user: string
    traveller: string
    employeeId: string | null
    iban: string | null
    purpose: string
    from: string
    to: string
    start: string
    end: string
    transport: Transport
    plate: string | null
    car: TripCar | null
    meals: Record<string, Meals>
    result: TripResult
    settledOn: string
    due: string
  },
): D1PreparedStatement[] {
  const year = Number(a.start.slice(0, 4))
  return [
    db
      .prepare(
        `INSERT INTO trips (id, company_id, year, seq, number, created_at, created_by, traveller, employee_id, iban, purpose, place_from, place_to,
           start_at, end_at, transport, plate, car, meals, result, total_cents)
         SELECT ?1, ?2, ?3, next.seq, 'CP' || CAST(?3 AS INTEGER) || '-' || printf('%03d', next.seq), ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19
         FROM (SELECT COALESCE(MAX(seq), 0) + 1 AS seq FROM trips WHERE company_id = ?2 AND year = ?3) AS next`,
      )
      .bind(
        a.id,
        a.company,
        year,
        now(),
        a.user,
        a.traveller,
        a.employeeId,
        a.iban,
        a.purpose,
        a.from,
        a.to,
        a.start,
        a.end,
        a.transport,
        a.plate,
        a.car ? JSON.stringify(a.car) : null,
        JSON.stringify(a.meals),
        JSON.stringify(a.result),
        a.result.total,
      ),
    db
      .prepare(
        `INSERT INTO documents (id, company_id, created_at, source, added_by, status, read_by, kind, party, party_iban, number,
           issued_on, due_on, supplied_on, total_cents, vat_cents, currency, category, vat_mode, vat_lines)
         SELECT ?, company_id, created_at, 'trip', created_by, 'read', 'trip', 'invoice_in', traveller, iban, number,
           ?, ?, substr(end_at, 1, 10), total_cents, 0, 'EUR', 'allowance', 'none', '[]'
         FROM trips WHERE id = ? AND company_id = ? AND total_cents > 0`,
      )
      .bind(a.documentId, a.settledOn, a.due, a.id, a.company),
    db.prepare('UPDATE trips SET document_id = (SELECT id FROM documents WHERE id = ?1) WHERE id = ?2 AND company_id = ?3').bind(a.documentId, a.id, a.company),
    eventStatement(db, { company: a.company, user: a.user, action: 'trip.added', subject: a.id, detail: { total: a.result.total, days: a.result.days.length } }),
  ]
}

/** Removes a trip and its document, only while the document is neither booked nor paired with a payment. */
export function removeTripStatements(db: D1Database, company: string, id: string, user: string): D1PreparedStatement[] {
  const free = `(t.document_id IS NULL OR EXISTS (SELECT 1 FROM documents d WHERE d.id = t.document_id AND d.booked_at IS NULL
    AND NOT EXISTS (SELECT 1 FROM links l WHERE l.document_id = d.id)))`
  return [
    db.prepare(`UPDATE trips AS t SET removed_at = ?, removed_by = ? WHERE t.id = ? AND t.company_id = ? AND t.removed_at IS NULL AND ${free}`).bind(now(), user, id, company),
    db
      .prepare(
        `UPDATE documents SET deleted_at = ? WHERE company_id = ? AND booked_at IS NULL AND deleted_at IS NULL
           AND id = (SELECT document_id FROM trips WHERE id = ? AND company_id = ? AND removed_at IS NOT NULL)
           AND NOT EXISTS (SELECT 1 FROM links l WHERE l.document_id = documents.id)`,
      )
      .bind(now(), company, id, company),
    eventStatement(db, { company, user, action: 'trip.removed', subject: id }),
  ]
}
