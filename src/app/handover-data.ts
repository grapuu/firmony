// Lossless accounting snapshots complement the human CSV reports. Never recalculate a closed payslip or filed XML here.
import { SCHEMA_VERSION } from '../db'
import { sha256Hex } from '../db'
import { csvCell, csvMoney } from '../team/store'
import { zipName, type ZipEntry } from '../zip'

type Row = Record<string, unknown>
const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`
const parsed = (value: unknown): unknown => { try { return typeof value === 'string' ? JSON.parse(value) : null } catch { return null } }

export async function handoverData(db: D1Database, company: string, year: string, at: number): Promise<ZipEntry[]> {
  const selections: [string, string][] = [
    ['prilohy', 'SELECT * FROM company_files WHERE company_id = ?1 ORDER BY id'],
    ['uzamknutie-obdobi', 'SELECT * FROM period_locks WHERE company_id = ?1'],
    ['historia-uzamknutia', 'SELECT * FROM period_lock_history WHERE company_id = ?1 ORDER BY version'],
    ['majetok', 'SELECT * FROM assets WHERE company_id = ?1 ORDER BY in_use_on, number'],
    ['sklad-nastavenie', 'SELECT * FROM stock_settings WHERE company_id = ?1'],
    ['sklad-polozky', 'SELECT * FROM stock_items WHERE company_id = ?1 ORDER BY code'],
    ['sklad-pohyby', "SELECT * FROM stock_moves WHERE company_id = ?1 AND substr(on_date, 1, 4) = ?2 ORDER BY on_date, number"],
    ['zamestnanci', 'SELECT * FROM employees WHERE company_id = ?1 ORDER BY id'],
    ['pracovne-neschopnosti', 'SELECT * FROM sick_leaves WHERE company_id = ?1 ORDER BY employee_id, from_on'],
    ['zavierky-predchodcu', 'SELECT * FROM prior_statements WHERE company_id = ?1 ORDER BY year'],
    ['oss-priznania', 'SELECT company_id, quarter, data, filed_on, filed_at, filed_by FROM oss_returns WHERE company_id = ?1 ORDER BY quarter'],
    ['intrastat-tovar', 'SELECT * FROM intrastat_goods WHERE company_id = ?1 ORDER BY document_id'],
    ['intrastat-hlasenia', "SELECT company_id, month, flow, seq, envelope, data, filed_on, filed_at, filed_by FROM intrastat_returns WHERE company_id = ?1 AND substr(month, 1, 4) = ?2 ORDER BY month, flow, seq"],
    ['rocne-zuctovania', 'SELECT * FROM tax_settlements WHERE company_id = ?1 AND year = CAST(?2 AS INTEGER) ORDER BY employee_id'],
    ['mzdy', 'SELECT * FROM payroll_runs WHERE company_id = ?1 AND substr(period, 1, 4) = ?2 ORDER BY period'],
    ['historia-miezd', 'SELECT * FROM payroll_history WHERE company_id = ?1 AND substr(period, 1, 4) = ?2 ORDER BY id'],
    ['zavierky', 'SELECT * FROM closings WHERE company_id = ?1 AND year = ?2 ORDER BY year'],
    ['historia-zavierok', 'SELECT * FROM closing_history WHERE company_id = ?1 AND year = ?2 ORDER BY id'],
    ['podania', 'SELECT * FROM filings WHERE company_id = ?1 AND substr(period, 1, 4) = ?2 ORDER BY kind, period'],
    ['historia-podani', 'SELECT * FROM filing_history WHERE company_id = ?1 AND substr(period, 1, 4) = ?2 ORDER BY id'],
    // Closure/payment dependencies may span New Year. Keep the complete company-level graph in each archive.
    ['mzdove-uzavierky', 'SELECT * FROM payroll_closures WHERE company_id = ?1 ORDER BY period, id'],
    ['overene-vyplaty', 'SELECT * FROM payroll_payouts WHERE company_id = ?1 ORDER BY closure_id, revision'],
    ['mzdove-povinnosti', 'SELECT * FROM payroll_targets WHERE company_id = ?1 ORDER BY period, kind'],
    ['verzie-mzdovych-podani', 'SELECT p.* FROM payroll_packages p JOIN payroll_targets t ON t.id = p.target_id WHERE p.company_id = ?1 AND substr(t.period, 1, 4) = ?2 ORDER BY p.id'],
    ['dorucenie-mzdovych-podani', 'SELECT e.* FROM payroll_events e JOIN payroll_packages p ON p.id = e.package_id JOIN payroll_targets t ON t.id = p.target_id WHERE e.company_id = ?1 AND substr(t.period, 1, 4) = ?2 ORDER BY e.package_id, e.revision'],
    ['generovanie-mzdovych-podani', 'SELECT g.* FROM payroll_generations g JOIN payroll_packages p ON p.id = g.package_id JOIN payroll_targets t ON t.id = p.target_id WHERE g.company_id = ?1 AND substr(t.period, 1, 4) = ?2 ORDER BY g.package_id'],
    ['generovanie-zdravotnych-vykazov', 'SELECT g.* FROM payroll_health_generations g JOIN payroll_packages p ON p.id = g.package_id JOIN payroll_targets t ON t.id = p.target_id WHERE g.company_id = ?1 AND substr(t.period, 1, 4) = ?2 ORDER BY g.package_id'],
    ['identifikatory-poistencov', 'SELECT * FROM payroll_health_ids WHERE company_id = ?1 ORDER BY employee_id, revision'],
    ['pravne-vztahy-sp', 'SELECT * FROM payroll_social_relations WHERE company_id = ?1 ORDER BY employee_id, revision'],
    ['analyticke-udaje-sp', 'SELECT * FROM payroll_social_inputs WHERE company_id = ?1 ORDER BY closure_id, employee_id, revision'],
    ['generovanie-vykazov-sp', 'SELECT g.* FROM payroll_social_generations g JOIN payroll_packages p ON p.id = g.package_id JOIN payroll_targets t ON t.id = p.target_id WHERE g.company_id = ?1 AND substr(t.period, 1, 4) = ?2 ORDER BY g.package_id'],
    ['preverenia-mzdovych-povinnosti', 'SELECT r.* FROM payroll_target_reviews r JOIN payroll_targets t ON t.id = r.target_id WHERE r.company_id = ?1 AND substr(t.period, 1, 4) = ?2 ORDER BY r.at, r.id'],
    ['verzie-podani', 'SELECT * FROM filing_packages WHERE company_id = ?1 AND substr(period, 1, 4) = ?2 ORDER BY id'],
    ['dorucenie-podani', 'SELECT e.* FROM filing_events e JOIN filing_packages p ON p.id = e.package_id WHERE e.company_id = ?1 AND substr(p.period, 1, 4) = ?2 ORDER BY e.package_id, e.revision'],
    ['dph', 'SELECT * FROM vat_returns WHERE company_id = ?1 AND substr(period, 1, 4) = ?2 ORDER BY period'],
    ['interne-doklady', 'SELECT * FROM ledger_entries WHERE company_id = ?1 AND year = ?2 ORDER BY on_date, id'],
    ['pracovne-cesty', 'SELECT * FROM trips WHERE company_id = ?1 AND year = ?2 ORDER BY seq'],
    ['strediska', 'SELECT * FROM cost_centers WHERE company_id = ?1 ORDER BY code'],
    ['rozpocty-stredisk', 'SELECT * FROM cost_center_budgets WHERE company_id = ?1 ORDER BY year, center_id'],
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
  for (const c of tables.get('mzdove-uzavierky') ?? []) if (typeof c.source_json !== 'string' || await sha256Hex(c.source_json) !== c.sha256) throw new Error('Payroll closure checksum mismatch')
  for (const p of tables.get('verzie-mzdovych-podani') ?? []) if (typeof p.source_json !== 'string' || await sha256Hex(p.source_json) !== p.source_hash) throw new Error('Payroll report coverage checksum mismatch')
  for (const g of tables.get('generovanie-mzdovych-podani') ?? []) if (typeof g.details !== 'string' || await sha256Hex(g.details) !== g.sha256) throw new Error('Payroll generation evidence checksum mismatch')
  for (const g of tables.get('generovanie-zdravotnych-vykazov') ?? []) if (typeof g.details !== 'string' || await sha256Hex(g.details) !== g.sha256) throw new Error('Health generation evidence checksum mismatch')
  for (const g of tables.get('generovanie-vykazov-sp') ?? []) if (typeof g.details !== 'string' || await sha256Hex(g.details) !== g.sha256) throw new Error('Social generation evidence checksum mismatch')
  for (const p of tables.get('verzie-podani') ?? []) {
    if (typeof p.xml !== 'string' || await sha256Hex(p.xml) !== p.sha256) throw new Error('Filing package checksum mismatch')
    entries.push(entry(`podania/dorucenie/${p.kind}-${p.period}-${p.id}.xml`, p.xml))
    entries.push(entry(`podania/dorucenie/${p.kind}-${p.period}-${p.id}.sha256`, `${p.sha256}\n`))
  }

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
    const rows = [
      ['Zamestnanec', 'Vzťah', 'Poisťovňa', 'Hrubá mzda', 'Náhrada príjmu pri PN', 'Sociálne zamestnanca', 'Zdravotné zamestnanca', 'Daň po bonuse', 'Ročné zúčtovanie: daň', 'Ročné zúčtovanie: bonus', 'Stravovacie poukážky: časť zamestnanca', 'Finančný príspevok na stravovanie', 'Čistá mzda', 'Cena práce'],
      // The columns make the net: the gross and sick pay, less the insurance and the tax after the bonus, less the annual
      // settlement's tax and plus its bonus, less the employee's part of the vouchers and plus the financial contribution.
      ...lines.map((line) => [
        line.name,
        line.slip?.contract ?? 'employment',
        line.insurer,
        ...['gross', 'sickPay', 'socialEmployee', 'healthEmployee', 'withheld'].map((k) => csvMoney(line.slip?.[k] ?? (k === 'sickPay' ? 0 : null))),
        csvMoney(line.slip?.settlementTax ?? 0),
        csvMoney(line.slip?.settlementBonus ?? 0),
        csvMoney(line.slip?.meals?.employee ?? 0),
        csvMoney(line.slip?.meals?.cash ?? 0),
        ...['net', 'employerCost'].map((k) => csvMoney(line.slip?.[k] ?? null)),
      ]),
    ]
    entries.push(entry(`mzdy/${run.period}/pasky.csv`, `\uFEFF${rows.map((r) => r.map(csvCell).join(';')).join('\r\n')}\r\n`))
    entries.push(entry(`mzdy/${run.period}/uzavrete-pasky.json`, json(lines)))
  }
  return entries
}
