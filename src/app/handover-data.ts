// Lossless accounting snapshots complement the human CSV reports. Never recalculate a closed payslip or filed XML here.
import { SCHEMA_VERSION } from '../db'
import { csvCell, csvMoney } from '../team/store'
import { zipName, type ZipEntry } from '../zip'

type Row = Record<string, unknown>
const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`
const parsed = (value: unknown): unknown => { try { return typeof value === 'string' ? JSON.parse(value) : null } catch { return null } }

export async function handoverData(db: D1Database, company: string, year: string, at: number): Promise<ZipEntry[]> {
  const selections: [string, string][] = [
    ['uzamknutie-obdobi', 'SELECT * FROM period_locks WHERE company_id = ?1'],
    ['historia-uzamknutia', 'SELECT * FROM period_lock_history WHERE company_id = ?1 ORDER BY version'],
    ['zamestnanci', 'SELECT * FROM employees WHERE company_id = ?1 ORDER BY id'],
    ['mzdy', 'SELECT * FROM payroll_runs WHERE company_id = ?1 AND substr(period, 1, 4) = ?2 ORDER BY period'],
    ['historia-miezd', 'SELECT * FROM payroll_history WHERE company_id = ?1 AND substr(period, 1, 4) = ?2 ORDER BY id'],
    ['zavierky', 'SELECT * FROM closings WHERE company_id = ?1 AND year = ?2 ORDER BY year'],
    ['historia-zavierok', 'SELECT * FROM closing_history WHERE company_id = ?1 AND year = ?2 ORDER BY id'],
    ['podania', 'SELECT * FROM filings WHERE company_id = ?1 AND substr(period, 1, 4) = ?2 ORDER BY kind, period'],
    ['historia-podani', 'SELECT * FROM filing_history WHERE company_id = ?1 AND substr(period, 1, 4) = ?2 ORDER BY id'],
    ['dph', 'SELECT * FROM vat_returns WHERE company_id = ?1 AND substr(period, 1, 4) = ?2 ORDER BY period'],
    ['interne-doklady', 'SELECT * FROM ledger_entries WHERE company_id = ?1 AND year = ?2 ORDER BY on_date, id'],
    ['nastavenia-miezd', 'SELECT payroll FROM companies WHERE id = ?1'],
    ['ucty', 'SELECT id, company_id, iban, bank, ledger, balance_cents, balance_on FROM accounts WHERE company_id = ?1 ORDER BY id'],
    ['doklady', "SELECT * FROM documents WHERE company_id = ?1 AND substr(COALESCE(issued_on, date(created_at, 'unixepoch')), 1, 4) = ?2 ORDER BY id"],
    ['platby', 'SELECT * FROM payments WHERE company_id = ?1 AND substr(booked_on, 1, 4) = ?2 ORDER BY id'],
    ['priradenia-platieb', 'SELECT * FROM links WHERE company_id = ?1 ORDER BY document_id, payment_id'],
    ['faktury', 'SELECT * FROM invoices WHERE company_id = ?1 AND substr(issued_on, 1, 4) = ?2 ORDER BY id'],
    ['riadky-faktur', 'SELECT l.* FROM invoice_lines l JOIN invoices i ON i.id = l.invoice_id WHERE i.company_id = ?1 AND substr(i.issued_on, 1, 4) = ?2 ORDER BY l.invoice_id, l.position'],
  ]
  const tables = new Map(await Promise.all(selections.map(async ([name, sql]) => {
    const stmt = db.prepare(sql)
    const result = await (sql.includes('?2') ? stmt.bind(company, year) : stmt.bind(company)).all<Row>()
    return [name, result.results] as const
  })))
  const encoder = new TextEncoder()
  const entry = (name: string, content: string): ZipEntry => ({ name: zipName(name), when: at, data: async () => encoder.encode(content) })
  const entries = [...tables].map(([name, rows]) => entry(`data/${name}.json`, json(rows)))
  entries.push(entry('data/format.json', json({ format: 'firmony-accounting-handover', version: 1, schema: SCHEMA_VERSION, company, year, createdAt: at, amounts: 'integer cents; JSON strings preserve original database values' })))

  const addFiled = (filed: unknown, path: string) => {
    const files = (parsed(filed) as { files?: { return?: { xml?: unknown }; statements?: { xml?: unknown } } } | null)?.files
    if (typeof files?.return?.xml === 'string') entries.push(entry(`${path}/priznanie.xml`, files.return.xml))
    if (typeof files?.statements?.xml === 'string') entries.push(entry(`${path}/zavierka.xml`, files.statements.xml))
  }
  for (const row of tables.get('zavierky') ?? []) addFiled(row.filed, `podania/${year}`)
  for (const row of tables.get('historia-zavierok') ?? []) addFiled((parsed(row.data) as Row | null)?.filed, `podania/${year}/historia/${row.id}`)
  const addSummary = (value: unknown, path: string) => {
    let filing = parsed(value) as { file?: { xml?: unknown }; prev?: unknown } | null
    for (let i = 0; filing && i <= 20; i++, filing = filing.prev as typeof filing) {
      if (typeof filing.file?.xml === 'string') entries.push(entry(`${path}/${i === 0 ? 'podane' : `predchadzajuce-${i}`}.xml`, filing.file.xml))
    }
  }
  for (const row of tables.get('podania') ?? []) if (row.kind === 'sv') addSummary(row.data, `podania/sv/${row.period}`)
  for (const row of tables.get('historia-podani') ?? []) if (row.kind === 'sv') addSummary((parsed(row.data) as Row | null)?.data, `podania/sv/${row.period}/historia/${row.id}`)
  for (const run of tables.get('mzdy') ?? []) {
    if (run.closed_at === null || !/^\d{4}-(0[1-9]|1[0-2])$/.test(String(run.period))) continue
    const lines = parsed(run.lines)
    if (!Array.isArray(lines)) continue
    const rows = [['Zamestnanec', 'Poisťovňa', 'Hrubá mzda', 'Sociálne zamestnanca', 'Zdravotné zamestnanca', 'Daň po bonuse', 'Čistá mzda', 'Cena práce'], ...lines.map((line) => [line.name, line.insurer, ...['gross', 'socialEmployee', 'healthEmployee', 'withheld', 'net', 'employerCost'].map((k) => csvMoney(line.slip?.[k] ?? null))])]
    entries.push(entry(`mzdy/${run.period}/pasky.csv`, `\uFEFF${rows.map((r) => r.map(csvCell).join(';')).join('\r\n')}\r\n`))
    entries.push(entry(`mzdy/${run.period}/uzavrete-pasky.json`, json(lines)))
  }
  return entries
}
