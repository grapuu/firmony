import { accessOpenSql } from '../aml/retention'
// How well the reader reads (his word of 20 October 2026: "naša AI musí byť úplne dokonalá"): what it proposed for each
// document is kept as it proposed it (`documents.reading`, written once when the document is read), and a booked
// document's fields are compared with it. A field the accountant left as read was read right; one she changed was not.
// Nothing else is stored: the page works it out for a month of bookings each time.
import { READ_FIELDS, type ReadField } from '../app/xml'
import { monthRange } from './work-pay'

export { READ_FIELDS, type ReadField }

/** A value as it is compared: text without case, spaces or punctuation, an IČO by its digits, a number as it is. */
export function normal(field: ReadField, value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null
  if (field === 'totalCents' || field === 'vatCents') return Number.isFinite(Number(value)) ? String(Math.round(Number(value))) : null
  const text = String(value).trim()
  if (text === '') return null
  if (field === 'partyIco' || field === 'vs') return text.replace(/\D/g, '').replace(/^0+(?=\d)/, '') || null
  if (field === 'party') return text.toLowerCase().replace(/[\s.,\-\u2013]+/g, '').replace(/spolsro$|sro$/, '') || null
  if (field === 'number') return text.toUpperCase().replace(/\s+/g, '')
  return text.toLowerCase()
}

/** Each field: true read right, false changed by the accountant, null nothing to compare (both empty, or what an
 *  e-invoice never says: what the purchase is for). */
export function compareFields(read: Record<string, unknown>, booked: Record<ReadField, unknown>, source: 'xml' | 'ai' = 'ai'): Record<ReadField, boolean | null> {
  const out = {} as Record<ReadField, boolean | null>
  for (const field of READ_FIELDS) {
    if (source === 'xml' && field === 'category') {
      out[field] = null
      continue
    }
    const a = normal(field, read[field])
    const b = normal(field, booked[field])
    out[field] = a === null && b === null ? null : a === b
  }
  return out
}

export interface Compared {
  docId: string
  companyId: string
  party: string | null
  /** 'xml' an e-invoice read by our code, 'ai' a photo or a PDF read by the model. */
  source: 'xml' | 'ai'
  fields: Record<ReadField, boolean | null>
}

export interface Accuracy {
  documents: number
  /** Booked with every compared field as it was read. */
  unchanged: number
  fields: { field: ReadField; compared: number; right: number }[]
  /** The suppliers whose documents were changed most. */
  worst: { party: string; documents: number; changed: number }[]
  bySource: { source: 'xml' | 'ai'; documents: number; unchanged: number }[]
}

/** Whether every compared field of a document was read right. */
export function allRight(c: Compared): boolean {
  return READ_FIELDS.every((field) => c.fields[field] !== false)
}

export function accuracyOf(rows: Compared[]): Accuracy {
  const fields = READ_FIELDS.map((field) => {
    const compared = rows.filter((r) => r.fields[field] !== null)
    return { field, compared: compared.length, right: compared.filter((r) => r.fields[field] === true).length }
  })
  const parties = new Map<string, { party: string; documents: number; changed: number }>()
  for (const r of rows) {
    const name = r.party ?? '(bez mena)'
    const key = name.toLowerCase()
    const p = parties.get(key) ?? { party: name, documents: 0, changed: 0 }
    p.documents += 1
    if (!allRight(r)) p.changed += 1
    parties.set(key, p)
  }
  const worst = [...parties.values()].filter((p) => p.changed > 0).sort((a, b) => b.changed - a.changed || b.documents - a.documents || a.party.localeCompare(b.party, 'sk')).slice(0, 10)
  const bySource = (['ai', 'xml'] as const).map((source) => {
    const of = rows.filter((r) => r.source === source)
    return { source, documents: of.length, unchanged: of.filter(allRight).length }
  })
  return { documents: rows.length, unchanged: rows.filter(allRight).length, fields, worst, bySource }
}

type Row = Record<string, unknown>

/** The documents booked in a month that the reader or our code read, of the companies somebody of the team may see.
 *  What the app booked by itself is left out: nobody put it right, so it would only make the reading look better. */
export async function comparedOf(db: D1Database, user: { id: string; team: string | null }, month: string, demo: boolean): Promise<Compared[]> {
  const { from, to } = monthRange(month)
  const own = user.team === 'admin' ? '' : 'AND c.accountant_id = ?3'
  const rows = await db
    .prepare(
      `SELECT d.id, d.company_id, d.read_by, d.reading, d.kind, d.party, d.party_ico, d.number, d.vs, d.issued_on, d.due_on, d.total_cents,
         d.vat_cents, d.currency, d.category
       FROM documents d JOIN companies c ON c.id = d.company_id
       WHERE d.reading IS NOT NULL AND d.booked_at >= ?1 AND d.booked_at < ?2 AND d.booked_by IS NOT 'auto' ${own} ${demo ? '' : 'AND c.demo = 0'}
         AND ${accessOpenSql('c')}
       ORDER BY d.booked_at LIMIT 5000`,
    )
    .bind(from, to, ...(user.team === 'admin' ? [] : [user.id]))
    .all<Row>()
  const out: Compared[] = []
  for (const r of rows.results) {
    let read: Record<string, unknown>
    try {
      read = JSON.parse(String(r.reading)) as Record<string, unknown>
    } catch {
      continue
    }
    const booked: Record<ReadField, unknown> = {
      kind: r.kind,
      party: r.party,
      partyIco: r.party_ico,
      number: r.number,
      vs: r.vs,
      issuedOn: r.issued_on,
      dueOn: r.due_on,
      totalCents: r.total_cents,
      vatCents: r.vat_cents,
      currency: r.currency,
      category: r.category,
    }
    const source = String(r.read_by ?? '') === 'xml' ? 'xml' : 'ai'
    out.push({
      docId: String(r.id),
      companyId: String(r.company_id),
      party: r.party ? String(r.party) : read.party ? String(read.party) : null,
      source,
      fields: compareFields(read, booked, source),
    })
  }
  return out
}
