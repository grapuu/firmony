import { PAYROLL_REPORTING_SCHEMA } from './schema'
import { currentCoverageJsonSql, currentPendingPayrollSql, currentReportSql, currentTargetActiveSql, pendingPayrollSql, reportCurrentSql, targetActiveSql, targetReviewScopeSql, unknownLegacyPeriodSql } from './sql'

// Preserve schema 19 byte-for-byte. Replace only named guards in this additive migration, with checked matches.
function changedTrigger(name: string, changes: [string, string][]): string[] {
  let sql = PAYROLL_REPORTING_SCHEMA.find((s) => s.startsWith(`CREATE TRIGGER ${name} `))
  if (!sql) throw new Error(`Missing payroll migration guard: ${name}`)
  for (const [from, to] of changes) { if (!sql.includes(from)) throw new Error(`Changed payroll migration guard: ${name}`); sql = sql.replaceAll(from, to) }
  return [`DROP TRIGGER ${name}`, sql]
}
const held = (co: string) => `EXISTS (SELECT 1 FROM evidence_holds WHERE company_id = ${co} AND released_at IS NULL) OR EXISTS (SELECT 1 FROM incidents WHERE company_id = ${co} AND closed_at IS NULL)`
const authority = (co: string, by: string) => `EXISTS (SELECT 1 FROM users u JOIN companies c ON c.id = ${co} WHERE u.id = ${by} AND (u.team = 'admin' OR u.team = 'accountant' AND c.accountant_id = u.id))`

export const PAYROLL_REVIEW_SCHEMA = [
  // NULL means the old automatic cash-month assignment was never independently reviewed. Do not backfill it.
  "ALTER TABLE payroll_payouts ADD COLUMN report_period TEXT CHECK (report_period IS NULL OR (report_period GLOB '20[0-9][0-9]-[01][0-9]' AND substr(report_period, 6, 2) BETWEEN '01' AND '12'))",
  `CREATE TABLE payroll_target_reviews (
    id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(id), target_id TEXT NOT NULL REFERENCES payroll_targets(id),
    source_json TEXT NOT NULL CHECK (source_json = '[]'), scope_json TEXT NOT NULL CHECK (json_valid(scope_json)), data_revision INTEGER NOT NULL,
    reason TEXT NOT NULL CHECK (length(reason) >= 24), reference TEXT NOT NULL CHECK (length(reference) >= 12), at INTEGER NOT NULL, by_user TEXT NOT NULL,
    file_key TEXT, file_name TEXT, file_type TEXT, file_bytes INTEGER, file_sha256 TEXT,
    UNIQUE(target_id, data_revision)
  )`,
  `CREATE TABLE payroll_generations (
    package_id TEXT PRIMARY KEY REFERENCES payroll_packages(id), company_id TEXT NOT NULL REFERENCES companies(id),
    format TEXT NOT NULL CHECK (format = 'PREHLADv26'), details TEXT NOT NULL CHECK (json_valid(details)),
    sha256 TEXT NOT NULL CHECK (length(sha256) = 64), at INTEGER NOT NULL, by_user TEXT NOT NULL
  )`,
  ...changedTrigger('payroll_payouts_create', [['OR NEW.revision <>', `OR NEW.report_period IS NULL OR NOT EXISTS (SELECT 1 FROM payroll_closures pc WHERE pc.id = NEW.closure_id AND NEW.report_period >= pc.period AND NEW.report_period <= substr(NEW.paid_on, 1, 7))
    OR NEW.revision <>`]]),
  ...changedTrigger('payroll_targets_create', [['substr(cp.paid_on, 1, 7) = NEW.period', 'cp.report_period = NEW.period']]),
  ...changedTrigger('payroll_targets_update', [[reportCurrentSql('NEW', 'p'), currentReportSql('NEW', 'p')]]),
  ...changedTrigger('payroll_packages_create', [[targetActiveSql('t'), currentTargetActiveSql('t')], [reportCurrentSql('t', 'NEW'), currentReportSql('t', 'NEW')]]),
  ...changedTrigger('payroll_pending_handover', [[pendingPayrollSql('NEW.id'), currentPendingPayrollSql('NEW.id')]]),
  `CREATE TRIGGER payroll_target_reviews_create BEFORE INSERT ON payroll_target_reviews WHEN
    NOT EXISTS (SELECT 1 FROM users WHERE id = NEW.by_user AND team = 'admin')
    OR NOT EXISTS (SELECT 1 FROM payroll_targets t WHERE t.id = NEW.target_id AND t.company_id = NEW.company_id AND t.kind = 'tax'
      AND (${currentTargetActiveSql('t')}) AND ${currentCoverageJsonSql('t')} = '[]' AND NEW.scope_json = ${targetReviewScopeSql('t')} AND NOT (${unknownLegacyPeriodSql('t')}))
    OR NEW.data_revision <> COALESCE((SELECT revision FROM company_data_revisions WHERE company_id = NEW.company_id), 0)
    OR (EXISTS (SELECT 1 FROM payroll_packages p WHERE p.target_id = NEW.target_id AND p.status <> 'prepared') AND (NEW.file_key IS NULL OR NEW.file_sha256 IS NULL OR COALESCE(NEW.file_bytes, 0) <= 0))
    OR (NEW.file_key IS NOT NULL AND NEW.file_key NOT LIKE 'companies/' || NEW.company_id || '/filings/%')
    BEGIN SELECT RAISE(ABORT, 'FIRMONY_PAYROLL_AUTHORITY'); END`,
  `CREATE TRIGGER payroll_generations_create BEFORE INSERT ON payroll_generations WHEN NOT (${authority('NEW.company_id', 'NEW.by_user')})
    OR NOT EXISTS (SELECT 1 FROM payroll_packages p JOIN payroll_targets t ON t.id = p.target_id WHERE p.id = NEW.package_id AND p.company_id = NEW.company_id
      AND p.created_by = NEW.by_user AND p.status = 'prepared' AND p.revision = 0 AND p.previous_id IS t.package_id
      AND t.kind = 'tax' AND json_extract(NEW.details, '$.version') = 1 AND json_extract(NEW.details, '$.fileSha256') = p.sha256 AND json_extract(NEW.details, '$.sourceHash') = p.source_hash)
    OR (json_extract(NEW.details, '$.input.representation') = 'firmony' AND NOT EXISTS (SELECT 1 FROM company_files WHERE company_id = NEW.company_id AND kind = 'poa' AND checked_at IS NOT NULL AND deleted_at IS NULL))
    BEGIN SELECT RAISE(ABORT, 'FIRMONY_PAYROLL_AUTHORITY'); END`,
  ...['payroll_target_reviews', 'payroll_generations'].flatMap((table) => [
    `CREATE TRIGGER ${table}_immutable BEFORE UPDATE ON ${table} BEGIN SELECT RAISE(ABORT, 'FIRMONY_PAYROLL_HISTORY'); END`,
    `CREATE TRIGGER ${table}_retain BEFORE DELETE ON ${table} WHEN EXISTS (SELECT 1 FROM companies WHERE id = OLD.company_id AND purge_started_at IS NULL) OR ${held('OLD.company_id')} BEGIN SELECT RAISE(ABORT, 'Evidence hold prevents payroll deletion'); END`,
    `CREATE TRIGGER ${table}_freeze BEFORE INSERT ON ${table} WHEN EXISTS (SELECT 1 FROM companies WHERE id = NEW.company_id AND purge_started_at IS NOT NULL) BEGIN SELECT RAISE(ABORT, 'Company handover is being finalized'); END`,
    ...['INSERT', 'DELETE'].map((action) => { const row = action === 'DELETE' ? 'OLD' : 'NEW'; return `CREATE TRIGGER ${table}_revision_${action.toLowerCase()} AFTER ${action} ON ${table} BEGIN INSERT INTO company_data_revisions (company_id, revision) VALUES (${row}.company_id, 1) ON CONFLICT(company_id) DO UPDATE SET revision = revision + 1; END` }),
  ]),
]
