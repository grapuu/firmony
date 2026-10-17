// What is taken over from the accountant before, in the database (schema step 31): the financial statements she filed
// (one row a year), and the documents and assets of an import, each marked with its import (`takeover`), so that an
// import made by mistake is removed whole while nothing of it was used. takeover.ts reads the files.
import { now } from '../db'
import type { Statements } from './closing'
import { regularOf } from './payroll'
import type { AssetRow, OpenItem, PersonRow, PriorStatements } from './takeover'

type Row = Record<string, unknown>

/** The statements taken over, by year. */
export async function priorStatementsOf(db: D1Database, company: string): Promise<Map<number, PriorStatements>> {
  const rows = await db.prepare('SELECT year, data FROM prior_statements WHERE company_id = ?').bind(company).all<Row>()
  const out = new Map<number, PriorStatements>()
  for (const r of rows.results) {
    try {
      const s = JSON.parse(String(r.data)) as PriorStatements
      if (s && (s.form === 'muj' || s.form === 'pod')) out.set(Number(r.year), s)
    } catch {
      /* A row that cannot be read is left out. */
    }
  }
  return out
}

/** The statements of a year: they replace the year's, or (`keep`, the year before read from the column of the period before) come only where the year has none. */
export function priorStatementStatement(db: D1Database, company: string, s: PriorStatements, fileName: string, by: string, keep = false): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO prior_statements (company_id, year, form, data, file_name, created_at, created_by) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
       ON CONFLICT (company_id, year) DO ${keep ? 'NOTHING' : 'UPDATE SET form = excluded.form, data = excluded.data, file_name = excluded.file_name, created_at = excluded.created_at, created_by = excluded.created_by'}`,
    )
    .bind(company, s.year, s.form, JSON.stringify(s), fileName.slice(0, 120), now(), by)
}

/** The statements taken over as the page lists them, the newest year first. */
export async function priorListOf(db: D1Database, company: string): Promise<{ year: number; form: 'muj' | 'pod'; assetsNet: number; fileName: string }[]> {
  const [all, rows] = await Promise.all([priorStatementsOf(db, company), db.prepare('SELECT year, file_name FROM prior_statements WHERE company_id = ? ORDER BY year DESC').bind(company).all<Row>()])
  return rows.results.flatMap((r) => {
    const s = all.get(Number(r.year))
    return s ? [{ year: s.year, form: s.form, assetsNet: s.assetsNet, fileName: String(r.file_name ?? '') }] : []
  })
}

export function removePriorStatement(db: D1Database, company: string, year: number): D1PreparedStatement {
  return db.prepare('DELETE FROM prior_statements WHERE company_id = ? AND year = ?').bind(company, year)
}

/** Statements taken over as the closing reads a year it has no books of: the rows as filed, nothing else. */
export function statementsOfPrior(p: PriorStatements): Statements {
  return {
    year: p.year,
    form: p.form,
    balance: {},
    profit: {},
    balanceEur: p.balanceEur,
    profitEur: p.profitEur,
    rounding: 0,
    gross: {},
    fix: {},
    grossEur: p.grossEur,
    fixEur: p.fixEur,
    unplaced: [],
    accounts: {},
    result: 0,
    revenues: 0,
    costs: 0,
    turnover: p.turnover,
    assetsNet: p.assetsNet,
    assetsGross: p.assetsGross,
  }
}

/** How many rows one statement carries, as one JSON parameter (D1 binds at most 100 values, so rows go in JSON). */
const CHUNK = 1000

function chunks<T>(list: readonly T[]): T[][] {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += CHUNK) out.push(list.slice(i, i + CHUNK))
  return out
}

/**
 * The open items as documents of the import, dated before the books start (`before`, the day before the books begin,
 * for an item without its day), booked, with no VAT of ours (the period was the accountant's before), so that they
 * wait for nothing and only the payment that comes pairs with them.
 */
export function openItemsStatements(db: D1Database, company: string, batch: string, items: readonly OpenItem[], before: string, by: string): D1PreparedStatement[] {
  const at = now()
  return chunks(items).map((part) =>
    db
      .prepare(
        `INSERT INTO documents (id, company_id, created_at, source, added_by, status, kind, party, party_ico, number, vs, issued_on, due_on, total_cents, vat_cents, currency, booked_at, booked_by, takeover, vat_mode, vat_lines)
         SELECT json_extract(j.value, '$.id'), ?1, ?2, 'takeover', ?3, 'read', json_extract(j.value, '$.kind'), json_extract(j.value, '$.party'), json_extract(j.value, '$.ico'), json_extract(j.value, '$.number'),
           json_extract(j.value, '$.vs'), json_extract(j.value, '$.issued'), json_extract(j.value, '$.due'), json_extract(j.value, '$.cents'), 0, 'EUR', ?2, ?3, ?4, 'none', '[]'
         FROM json_each(?5) j`,
      )
      .bind(
        company,
        at,
        by,
        batch,
        JSON.stringify(
          part.map((item) => ({
            id: crypto.randomUUID(),
            kind: item.side === 'issued' ? 'invoice_out' : 'invoice_in',
            party: item.party,
            ico: item.ico,
            number: item.number,
            vs: item.vs,
            issued: item.issuedOn ?? before,
            due: item.dueOn,
            cents: item.cents,
          })),
        ),
      ),
  )
}

/** The numbers the register gives next (M-<year>-001 on), past every number the company used, removed ones too. */
export function assetNumbers(used: readonly string[], rows: readonly AssetRow[]): string[] {
  const next = new Map<string, number>()
  for (const n of used) {
    const m = /^M-(\d{4})-(\d+)$/.exec(n)
    if (m) next.set(m[1]!, Math.max(next.get(m[1]!) ?? 0, Number(m[2])))
  }
  return rows.map((a) => {
    const year = a.inUseOn.slice(0, 4)
    const n = (next.get(year) ?? 0) + 1
    next.set(year, n)
    return `M-${year}-${String(n).padStart(3, '0')}`
  })
}

/** The assets of the import, each one of the opening balances; numbered as `assetNumbers` gives (the schema refuses a number taken meanwhile). */
export function assetRowsStatements(db: D1Database, company: string, batch: string, rows: readonly AssetRow[], numbers: readonly string[], by: string): D1PreparedStatement[] {
  const at = now()
  const all = rows.map((a, i) => ({
    id: crypto.randomUUID(),
    number: numbers[i],
    name: a.name,
    account: a.account,
    cost: a.costCents,
    inUse: a.inUseOn,
    group: a.taxGroup,
    method: a.accelerated && (a.taxGroup === 2 || a.taxGroup === 3) ? 'accelerated' : 'straight',
    book: a.priorBookCents,
    tax: a.priorTaxCents,
    years: a.priorTaxYears,
    note: a.note,
  }))
  return chunks(all).map((part) =>
    db
      .prepare(
        `INSERT INTO assets (id, company_id, number, name, account, document_id, cost_cents, in_use_on, tax_group, tax_method, car, book_months, source, prior_book_cents, prior_tax_cents, prior_tax_years, note, created_at, created_by, takeover)
         SELECT json_extract(j.value, '$.id'), ?1, json_extract(j.value, '$.number'), json_extract(j.value, '$.name'), json_extract(j.value, '$.account'), NULL, json_extract(j.value, '$.cost'),
           json_extract(j.value, '$.inUse'), json_extract(j.value, '$.group'), json_extract(j.value, '$.method'), 0, NULL, 'opening', json_extract(j.value, '$.book'), json_extract(j.value, '$.tax'),
           json_extract(j.value, '$.years'), json_extract(j.value, '$.note'), ?2, ?3, ?4
         FROM json_each(?5) j`,
      )
      .bind(company, at, by, batch, JSON.stringify(part)),
  )
}

/** The employees of a list, with what payroll needs at least; the rest (the declaration, children, a pension) is set on each. */
export function peopleStatements(db: D1Database, company: string, people: readonly PersonRow[], by: string): D1PreparedStatement[] {
  const at = now()
  const all = people.map((p) => ({
    id: crypto.randomUUID(),
    name: p.name,
    born: p.bornOn,
    insurer: p.insurer,
    started: p.startedOn,
    ended: p.endedOn,
    wage: p.wage,
    iban: p.iban,
    contract: p.contract,
    regular: regularOf(p.contract, p.contract === 'employment' || p.contract === 'director') ? 1 : 0,
    wageKind: p.hourly ? 'hourly' : 'monthly',
    hours: p.weeklyHours,
  }))
  return chunks(all).map((part) =>
    db
      .prepare(
        `INSERT INTO employees (id, company_id, name, born_on, insurer, started_on, ended_on, wage_cents, declaration, disabled, health_deduction, health_exempt, children, iban, created_at, created_by, updated_at,
           contract, regular, pension, exemption, wage_kind, weekly_hours, leave_days)
         SELECT json_extract(j.value, '$.id'), ?1, json_extract(j.value, '$.name'), json_extract(j.value, '$.born'), json_extract(j.value, '$.insurer'), json_extract(j.value, '$.started'),
           json_extract(j.value, '$.ended'), json_extract(j.value, '$.wage'), 0, 0, 0, 0, '[]', json_extract(j.value, '$.iban'), ?2, ?3, ?2,
           json_extract(j.value, '$.contract'), json_extract(j.value, '$.regular'), 'none', 0, json_extract(j.value, '$.wageKind'), json_extract(j.value, '$.hours'), NULL
         FROM json_each(?4) j`,
      )
      .bind(company, at, by, JSON.stringify(part)),
  )
}

/** The imports made, newest first: what each brought and whether anything of it was used since (paired, changed). */
export interface TakeoverBatch {
  id: string
  kind: 'items' | 'assets'
  count: number
  used: number
  at: number
}

export async function batchesOf(db: D1Database, company: string): Promise<TakeoverBatch[]> {
  const [docs, assets] = await db.batch<Row>([
    db
      .prepare(
        `SELECT d.takeover AS id, COUNT(*) AS n, MAX(d.created_at) AS at, SUM(CASE WHEN EXISTS (SELECT 1 FROM links l WHERE l.document_id = d.id) THEN 1 ELSE 0 END) AS used
         FROM documents d WHERE d.company_id = ? AND d.takeover IS NOT NULL AND d.deleted_at IS NULL GROUP BY d.takeover`,
      )
      .bind(company),
    db
      .prepare(
        'SELECT takeover AS id, COUNT(*) AS n, MAX(created_at) AS at, SUM(CASE WHEN disposed_on IS NOT NULL THEN 1 ELSE 0 END) AS used FROM assets WHERE company_id = ? AND takeover IS NOT NULL AND deleted_at IS NULL GROUP BY takeover',
      )
      .bind(company),
  ])
  const of = (rows: Row[] | undefined, kind: TakeoverBatch['kind']) => (rows ?? []).map((r) => ({ id: String(r.id), kind, count: Number(r.n), used: Number(r.used ?? 0), at: Number(r.at) }))
  return [...of(docs?.results, 'items'), ...of(assets?.results, 'assets')].sort((a, b) => b.at - a.at)
}

/** An import removed whole, only while nothing of it was used: its documents and assets marked removed. */
export function removeBatchStatements(db: D1Database, company: string, batch: string, by: string): D1PreparedStatement[] {
  const at = now()
  return [
    db
      .prepare(
        `UPDATE documents SET deleted_at = ?1 WHERE company_id = ?2 AND takeover = ?3 AND deleted_at IS NULL
         AND NOT EXISTS (SELECT 1 FROM documents d JOIN links l ON l.document_id = d.id WHERE d.company_id = ?2 AND d.takeover = ?3)`,
      )
      .bind(at, company, batch),
    db
      .prepare(
        `UPDATE assets SET deleted_at = ?1, updated_at = ?1, updated_by = ?4 WHERE company_id = ?2 AND takeover = ?3 AND deleted_at IS NULL
         AND NOT EXISTS (SELECT 1 FROM assets a WHERE a.company_id = ?2 AND a.takeover = ?3 AND a.disposed_on IS NOT NULL)`,
      )
      .bind(at, company, batch, by),
  ]
}
