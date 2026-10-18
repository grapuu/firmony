// Stock in the database (schema step 27; stock.ts has the rules): how a company keeps it, its items, their moves. A
// move gets the next number of its kind and year in the statement that writes it (P-2026-0001 príjemka, V-… výdajka,
// I-… inventúra); a removed move or item is marked, never deleted. The schema's triggers guard what reaches a locked
// period.
import { now } from '../db'
import { STOCK_KINDS, VALUATIONS, type MoveKind, type StockItem, type StockKind, type StockMove, type StockSettings } from './stock'

type Row = Record<string, unknown>
const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null)

export interface Stock {
  settings: StockSettings | null
  items: StockItem[]
  moves: StockMove[]
}

/** A company's stock: how it is kept, its items (removed ones left out) and every move of them that stands. */
export async function stockOf(db: D1Database, company: string): Promise<Stock> {
  const [settings, items, moves] = await db.batch([
    db.prepare('SELECT method, valuation FROM stock_settings WHERE company_id = ?').bind(company),
    db.prepare('SELECT * FROM stock_items WHERE company_id = ? AND deleted_at IS NULL ORDER BY code COLLATE NOCASE, id').bind(company),
    db.prepare('SELECT * FROM stock_moves WHERE company_id = ? AND deleted_at IS NULL ORDER BY on_date, created_at, number').bind(company),
  ])
  const s = settings?.results?.[0] as Row | undefined
  return {
    settings: s ? { method: s.method === 'B' ? 'B' : 'A', valuation: s.valuation === 'fifo' ? 'fifo' : 'average' } : null,
    items: ((items?.results ?? []) as Row[]).map(itemOf),
    moves: ((moves?.results ?? []) as Row[]).map(moveOf),
  }
}

export function itemOf(r: Row): StockItem {
  const kind = String(r.kind)
  return {
    id: String(r.id),
    code: String(r.code),
    name: String(r.name),
    unit: String(r.unit),
    kind: (STOCK_KINDS as readonly string[]).includes(kind) ? (kind as StockKind) : 'goods',
    centerId: str(r.center_id),
  }
}

export function moveOf(r: Row): StockMove {
  const kind = String(r.kind)
  return {
    id: String(r.id),
    itemId: String(r.item_id),
    number: String(r.number),
    kind: kind === 'out' || kind === 'count' ? kind : 'in',
    on: String(r.on_date),
    quantity: Number(r.quantity_milli),
    value: r.value_cents === null || r.value_cents === undefined ? null : Number(r.value_cents),
    documentId: str(r.document_id),
    note: str(r.note),
    createdAt: Number(r.created_at),
  }
}

/** How the company keeps its stock: set or changed (refused by the schema once a move it changes is locked). */
export function settingsStatement(db: D1Database, company: string, s: StockSettings, by: string): D1PreparedStatement {
  const valuation = (VALUATIONS as readonly string[]).includes(s.valuation) ? s.valuation : 'average'
  return db
    .prepare(
      `INSERT INTO stock_settings (company_id, method, valuation, updated_at, updated_by) VALUES (?1, ?2, ?3, ?4, ?5)
       ON CONFLICT (company_id) DO UPDATE SET method = excluded.method, valuation = excluded.valuation, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
    )
    .bind(company, s.method, valuation, now(), by)
}

export interface ItemInput {
  code: string
  name: string
  unit: string
  kind: StockKind
}

export function insertItemStatement(db: D1Database, company: string, id: string, i: ItemInput, by: string): D1PreparedStatement {
  return db.prepare('INSERT INTO stock_items (id, company_id, code, name, unit, kind, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(id, company, i.code, i.name, i.unit, i.kind, now(), by)
}

export function updateItemStatement(db: D1Database, company: string, id: string, i: ItemInput): D1PreparedStatement {
  return db.prepare('UPDATE stock_items SET code = ?1, name = ?2, unit = ?3, kind = ?4, updated_at = ?5 WHERE id = ?6 AND company_id = ?7 AND deleted_at IS NULL').bind(i.code, i.name, i.unit, i.kind, now(), id, company)
}

/**
 * The cost centre an item's stock belongs to (centers.ts), management information: a centre of the company in use, or
 * the one it has; none when empty; one archived after the page checked it leaves the item's as it was. No period lock
 * holds it (the books' lines stay as they are).
 */
export function itemCenterStatement(db: D1Database, company: string, id: string, center: string | null): D1PreparedStatement {
  return db
    .prepare(
      `UPDATE stock_items SET center_id = CASE WHEN ?1 IS NULL THEN NULL ELSE COALESCE((SELECT c.id FROM cost_centers c WHERE c.id = ?1 AND c.company_id = ?2 AND (c.archived_at IS NULL OR c.id IS stock_items.center_id)), stock_items.center_id) END
       WHERE id = ?3 AND company_id = ?2 AND deleted_at IS NULL`,
    )
    .bind(center, company, id)
}

/** An item removed: only one with no move that stands (the route asks), marked so its code may be used again. */
export function removeItemStatement(db: D1Database, company: string, id: string): D1PreparedStatement {
  return db
    .prepare("UPDATE stock_items SET deleted_at = ?1, code = code || '#' || ?1 WHERE id = ?2 AND company_id = ?3 AND deleted_at IS NULL AND NOT EXISTS (SELECT 1 FROM stock_moves WHERE item_id = ?2 AND company_id = ?3 AND deleted_at IS NULL)")
    .bind(now(), id, company)
}

export interface MoveInput {
  itemId: string
  kind: MoveKind
  on: string
  quantity: number
  value: number | null
  documentId: string | null
  note: string | null
}

const PREFIX: Record<MoveKind, string> = { in: 'P', out: 'V', count: 'I' }

/** A move with the next number of its kind and year: P-2026-0001. */
export function insertMoveStatement(db: D1Database, company: string, id: string, m: MoveInput, by: string, at = now()): D1PreparedStatement {
  // The prefix and the year as text: a number bound is a real, which would never match the LIKE.
  const prefix = `${PREFIX[m.kind]}-${m.on.slice(0, 4)}-`
  return db
    .prepare(
      `INSERT INTO stock_moves (id, company_id, item_id, number, kind, on_date, quantity_milli, value_cents, document_id, note, created_at, created_by)
       SELECT ?1, ?2, ?3, printf('%s%04d', ?4, COALESCE(MAX(CAST(substr(number, 8) AS INTEGER)), 0) + 1), ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12
         FROM stock_moves WHERE company_id = ?2 AND number LIKE ?4 || '%'`,
    )
    .bind(id, company, m.itemId, prefix, m.kind, m.on, m.quantity, m.value, m.documentId, m.note, at, by)
}

/** A move entered by mistake, removed: marked, never deleted; its number stays taken. */
export function removeMoveStatement(db: D1Database, company: string, id: string, by: string): D1PreparedStatement {
  return db.prepare('UPDATE stock_moves SET deleted_at = ?1, deleted_by = ?2 WHERE id = ?3 AND company_id = ?4 AND deleted_at IS NULL').bind(now(), by, id, company)
}
