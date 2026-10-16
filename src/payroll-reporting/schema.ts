import { TRANSITIONS } from '../filings/model'
import { closureCurrentSql, latestPayoutSql, pendingPayrollSql, payrollRunProtectedSql, reportCurrentSql, targetActiveSql } from './sql'

const authority = (company: string, user: string) => `EXISTS (SELECT 1 FROM users u JOIN companies c ON c.id = ${company} WHERE u.id = ${user} AND (u.team = 'admin' OR (u.team = 'accountant' AND c.accountant_id = u.id)))`
const held = (company: string) => `EXISTS (SELECT 1 FROM evidence_holds WHERE company_id = ${company} AND released_at IS NULL) OR EXISTS (SELECT 1 FROM incidents WHERE company_id = ${company} AND closed_at IS NULL)`
const transitions = Object.entries(TRANSITIONS).flatMap(([from, tos]) => tos.map((to) => `(NEW.from_state = '${from}' AND NEW.to_state = '${to}')`)).join(' OR ')
const sent = payrollRunProtectedSql
const immutable = ['id', 'target_id', 'company_id', 'previous_id', 'reason', 'variant', 'name', 'file_key', 'file_type', 'file_bytes', 'sha256', 'source_json', 'source_hash', 'created_at', 'created_by'].map((k) => `NEW.${k} IS NOT OLD.${k}`).join(' OR ')
const protectedRun = ['company_id', 'period', 'payday', 'lines', 'saved_at', 'saved_by', 'closed_at', 'closed_on', 'closed_by'].map((k) => `NEW.${k} IS NOT OLD.${k}`).join(' OR ')
const locked = (row: string) => `EXISTS (SELECT 1 FROM period_locks l JOIN companies c ON c.id = l.company_id WHERE l.company_id = ${row}.company_id AND l.through_on IS NOT NULL AND c.purge_started_at IS NULL AND ${row}.period || '-01' <= l.through_on)`

export const PAYROLL_REPORTING_SCHEMA = [
  'ALTER TABLE payroll_runs ADD COLUMN evidence_id TEXT',
  `CREATE TABLE payroll_closures (
    id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE, period TEXT NOT NULL,
    payday TEXT NOT NULL, lines TEXT NOT NULL CHECK (json_valid(lines)), source_json TEXT NOT NULL CHECK (json_valid(source_json)),
    sha256 TEXT NOT NULL CHECK (length(sha256) = 64), closed_at INTEGER NOT NULL, created_at INTEGER NOT NULL, created_by TEXT NOT NULL
  )`,
  'CREATE INDEX payroll_closures_company ON payroll_closures(company_id, period)',
  `CREATE TABLE payroll_payouts (
    id TEXT PRIMARY KEY, closure_id TEXT NOT NULL REFERENCES payroll_closures(id), company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    revision INTEGER NOT NULL CHECK (revision > 0), paid_on TEXT NOT NULL, reference TEXT NOT NULL CHECK (length(reference) >= 12),
    reason TEXT NOT NULL, at INTEGER NOT NULL, by_user TEXT NOT NULL, UNIQUE(closure_id, revision)
  )`,
  'CREATE INDEX payroll_payouts_company ON payroll_payouts(company_id, paid_on)',
  `CREATE TABLE payroll_targets (
    id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('sp', 'health24', 'health25', 'health27', 'tax')), period TEXT NOT NULL,
    due_on TEXT NOT NULL, closure_id TEXT REFERENCES payroll_closures(id), package_id TEXT, revision INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL, updated_by TEXT NOT NULL, UNIQUE(company_id, kind, period),
    CHECK ((kind = 'tax' AND closure_id IS NULL) OR (kind <> 'tax' AND closure_id IS NOT NULL))
  )`,
  `CREATE TABLE payroll_packages (
    id TEXT PRIMARY KEY, target_id TEXT NOT NULL REFERENCES payroll_targets(id), company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    previous_id TEXT REFERENCES payroll_packages(id), reason TEXT NOT NULL, variant TEXT NOT NULL CHECK (length(variant) >= 2),
    name TEXT NOT NULL, file_key TEXT NOT NULL, file_type TEXT NOT NULL, file_bytes INTEGER NOT NULL CHECK (file_bytes > 0), sha256 TEXT NOT NULL CHECK (length(sha256) = 64),
    source_json TEXT NOT NULL CHECK (json_valid(source_json)), source_hash TEXT NOT NULL CHECK (length(source_hash) = 64),
    status TEXT NOT NULL DEFAULT 'prepared' CHECK (status IN ('prepared', 'submitted', 'accepted', 'rejected', 'review')),
    revision INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, created_by TEXT NOT NULL, updated_at INTEGER NOT NULL, updated_by TEXT NOT NULL, last_event TEXT
  )`,
  'CREATE INDEX payroll_packages_company ON payroll_packages(company_id, target_id, created_at)',
  `CREATE TABLE payroll_events (
    id TEXT PRIMARY KEY, package_id TEXT NOT NULL REFERENCES payroll_packages(id), company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    revision INTEGER NOT NULL, at INTEGER NOT NULL, by_user TEXT NOT NULL, from_state TEXT NOT NULL, to_state TEXT NOT NULL,
    external_on TEXT NOT NULL, reference TEXT NOT NULL, reason TEXT NOT NULL, channel TEXT NOT NULL,
    file_key TEXT, file_name TEXT, file_type TEXT, file_bytes INTEGER, file_sha256 TEXT,
    UNIQUE(package_id, revision), CHECK (length(reference) >= 4 AND length(channel) >= 2),
    CHECK (to_state NOT IN ('accepted', 'rejected') OR (file_key IS NOT NULL AND file_sha256 IS NOT NULL AND file_bytes > 0)),
    CHECK (to_state NOT IN ('rejected', 'review') OR length(reason) >= 12)
  )`,
  'CREATE INDEX payroll_events_company ON payroll_events(company_id, package_id, revision)',
  `CREATE TRIGGER payroll_closures_create BEFORE INSERT ON payroll_closures WHEN NOT (${authority('NEW.company_id', 'NEW.created_by')})
    OR NOT EXISTS (SELECT 1 FROM payroll_runs r WHERE r.company_id = NEW.company_id AND r.period = NEW.period AND r.closed_at = NEW.closed_at
      AND r.lines = NEW.lines AND r.payday = NEW.payday AND (r.evidence_id IS NULL OR r.evidence_id = NEW.id))
    BEGIN SELECT RAISE(ABORT, 'FIRMONY_PAYROLL_AUTHORITY'); END`,
  `CREATE TRIGGER payroll_closures_immutable BEFORE UPDATE ON payroll_closures BEGIN SELECT RAISE(ABORT, 'FIRMONY_PAYROLL_HISTORY'); END`,
  `CREATE TRIGGER payroll_payouts_create BEFORE INSERT ON payroll_payouts WHEN NOT (${authority('NEW.company_id', 'NEW.by_user')})
    OR NOT EXISTS (SELECT 1 FROM payroll_closures pc WHERE pc.id = NEW.closure_id AND pc.company_id = NEW.company_id AND (${closureCurrentSql('pc')})
      AND (SELECT COALESCE(SUM(json_extract(value, '$.gross')), 0) FROM json_each(pc.lines)) > 0)
    OR NEW.revision <> 1 + COALESCE((SELECT MAX(revision) FROM payroll_payouts WHERE closure_id = NEW.closure_id), 0)
    OR (NEW.revision > 1 AND (length(NEW.reason) < 12 OR NOT EXISTS (SELECT 1 FROM users WHERE id = NEW.by_user AND team = 'admin')))
    BEGIN SELECT RAISE(ABORT, 'FIRMONY_PAYROLL_AUTHORITY'); END`,
  `CREATE TRIGGER payroll_payouts_immutable BEFORE UPDATE ON payroll_payouts BEGIN SELECT RAISE(ABORT, 'FIRMONY_PAYROLL_HISTORY'); END`,
  `CREATE TRIGGER payroll_targets_create BEFORE INSERT ON payroll_targets WHEN NOT (${authority('NEW.company_id', 'NEW.updated_by')}) OR NEW.package_id IS NOT NULL OR NEW.revision <> 0
    OR (NEW.kind = 'tax' AND NOT EXISTS (SELECT 1 FROM payroll_payouts cp JOIN payroll_closures pc ON pc.id = cp.closure_id WHERE cp.company_id = NEW.company_id AND substr(cp.paid_on, 1, 7) = NEW.period AND (${latestPayoutSql('cp')}) AND (${closureCurrentSql('pc')})))
    OR (NEW.kind <> 'tax' AND NOT EXISTS (SELECT 1 FROM payroll_closures pc WHERE pc.id = NEW.closure_id AND pc.company_id = NEW.company_id AND pc.period = NEW.period AND (${closureCurrentSql('pc')})
      AND (NEW.kind = 'sp' OR EXISTS (SELECT 1 FROM json_each(pc.lines) l WHERE 'health' || json_extract(l.value, '$.insurer') = NEW.kind))))
    BEGIN SELECT RAISE(ABORT, 'FIRMONY_PAYROLL_AUTHORITY'); END`,
  `CREATE TRIGGER payroll_targets_update BEFORE UPDATE ON payroll_targets WHEN NEW.id IS NOT OLD.id OR NEW.company_id IS NOT OLD.company_id
    OR NEW.kind IS NOT OLD.kind OR NEW.period IS NOT OLD.period OR NEW.created_at IS NOT OLD.created_at OR NEW.revision <> OLD.revision + 1
    OR NOT (${authority('NEW.company_id', 'NEW.updated_by')})
    OR (NEW.closure_id IS NOT OLD.closure_id AND (NEW.kind = 'tax' OR NEW.package_id IS NOT NULL OR NOT EXISTS (SELECT 1 FROM payroll_closures pc WHERE pc.id = NEW.closure_id AND pc.company_id = NEW.company_id AND pc.period = NEW.period AND (${closureCurrentSql('pc')})
      AND (NEW.kind = 'sp' OR EXISTS (SELECT 1 FROM json_each(pc.lines) l WHERE 'health' || json_extract(l.value, '$.insurer') = NEW.kind)))))
    OR (NEW.closure_id IS OLD.closure_id AND (NEW.due_on IS NOT OLD.due_on OR NOT EXISTS (SELECT 1 FROM payroll_packages p
      WHERE p.id = NEW.package_id AND p.target_id = OLD.id AND p.previous_id IS OLD.package_id AND p.created_by = NEW.updated_by AND (${reportCurrentSql('NEW', 'p')}))))
    BEGIN SELECT RAISE(ABORT, 'FIRMONY_PAYROLL_HISTORY'); END`,
  `CREATE TRIGGER payroll_packages_create BEFORE INSERT ON payroll_packages WHEN NEW.status <> 'prepared' OR NEW.revision <> 0
    OR NOT (${authority('NEW.company_id', 'NEW.created_by')}) OR NEW.file_key NOT LIKE 'companies/' || NEW.company_id || '/filings/%'
    OR NOT EXISTS (SELECT 1 FROM payroll_targets t WHERE t.id = NEW.target_id AND t.company_id = NEW.company_id AND t.package_id IS NEW.previous_id AND (${targetActiveSql('t')}) AND (${reportCurrentSql('t', 'NEW')}))
    OR (NEW.previous_id IS NOT NULL AND (length(NEW.reason) < 12 OR EXISTS (SELECT 1 FROM payroll_packages p WHERE p.id = NEW.previous_id AND p.status IN ('submitted', 'accepted', 'review') AND NOT EXISTS (SELECT 1 FROM users WHERE id = NEW.created_by AND team = 'admin'))))
    BEGIN SELECT RAISE(ABORT, 'FIRMONY_PAYROLL_AUTHORITY'); END`,
  `CREATE TRIGGER payroll_packages_reuse BEFORE INSERT ON payroll_packages WHEN EXISTS (SELECT 1 FROM payroll_packages p WHERE p.company_id = NEW.company_id AND p.target_id <> NEW.target_id AND p.sha256 = NEW.sha256) BEGIN SELECT RAISE(ABORT, 'FIRMONY_PAYROLL_FILE_REUSED'); END`,
  `CREATE TRIGGER payroll_packages_immutable BEFORE UPDATE ON payroll_packages WHEN ${immutable} OR NEW.revision <> OLD.revision + 1
    OR NOT EXISTS (SELECT 1 FROM payroll_events e WHERE e.id = NEW.last_event AND e.package_id = OLD.id AND e.company_id = OLD.company_id
      AND e.revision = NEW.revision AND e.from_state = OLD.status AND e.to_state = NEW.status AND e.by_user = NEW.updated_by AND e.at = NEW.updated_at)
    BEGIN SELECT RAISE(ABORT, 'FIRMONY_PAYROLL_HISTORY'); END`,
  `CREATE TRIGGER payroll_events_create BEFORE INSERT ON payroll_events WHEN NOT (${authority('NEW.company_id', 'NEW.by_user')}) OR NOT (${transitions})
    OR NOT EXISTS (SELECT 1 FROM payroll_packages p WHERE p.id = NEW.package_id AND p.company_id = NEW.company_id AND p.revision + 1 = NEW.revision AND p.status = NEW.from_state)
    OR (NEW.from_state IN ('accepted', 'review') AND NOT EXISTS (SELECT 1 FROM users WHERE id = NEW.by_user AND team = 'admin'))
    OR (NEW.file_key IS NOT NULL AND NEW.file_key NOT LIKE 'companies/' || NEW.company_id || '/filings/%')
    BEGIN SELECT RAISE(ABORT, 'FIRMONY_FILING_AUTHORITY'); END`,
  `CREATE TRIGGER payroll_events_immutable BEFORE UPDATE ON payroll_events BEGIN SELECT RAISE(ABORT, 'FIRMONY_PAYROLL_HISTORY'); END`,
  // Receipt bytes are global per company; identifier namespaces belong to each recipient (all FS forms share one).
  ...['payroll_events', 'filing_events'].map((table) => `CREATE TRIGGER ${table}_payroll_reuse BEFORE INSERT ON ${table} WHEN
    EXISTS (SELECT 1 FROM payroll_events e JOIN payroll_packages ep ON ep.id = e.package_id JOIN payroll_targets et ON et.id = ep.target_id
      WHERE e.company_id = NEW.company_id ${table === 'payroll_events' ? 'AND e.package_id <> NEW.package_id' : ''}
      AND ((e.reference = NEW.reference COLLATE NOCASE AND ${table === 'filing_events' ? "et.kind = 'tax'" : 'et.kind = (SELECT nt.kind FROM payroll_packages np JOIN payroll_targets nt ON nt.id = np.target_id WHERE np.id = NEW.package_id)'})
        OR (NEW.file_sha256 IS NOT NULL AND e.file_sha256 = NEW.file_sha256)))
    OR EXISTS (SELECT 1 FROM filing_events e WHERE e.company_id = NEW.company_id ${table === 'filing_events' ? 'AND e.package_id <> NEW.package_id' : ''}
      AND ((e.reference = NEW.reference COLLATE NOCASE ${table === 'payroll_events' ? "AND EXISTS (SELECT 1 FROM payroll_packages np JOIN payroll_targets nt ON nt.id = np.target_id WHERE np.id = NEW.package_id AND nt.kind = 'tax')" : ''})
        OR (NEW.file_sha256 IS NOT NULL AND e.file_sha256 = NEW.file_sha256)))
    BEGIN SELECT RAISE(ABORT, 'FIRMONY_FILING_RECEIPT_REUSED'); END`),
  // Only evidence metadata may be linked after the accounting period is locked. Monetary fields stay protected.
  'DROP TRIGGER payroll_runs_locked_update',
  `CREATE TRIGGER payroll_runs_locked_update BEFORE UPDATE ON payroll_runs WHEN (${protectedRun}) AND (${locked('OLD')} OR ${locked('NEW')}) BEGIN SELECT RAISE(ABORT, 'FIRMONY_PERIOD_LOCKED'); END`,
  `CREATE TRIGGER payroll_run_evidence BEFORE UPDATE ON payroll_runs WHEN OLD.evidence_id IS NOT NULL AND OLD.closed_at IS NOT NULL
    AND ((NEW.closed_at IS NOT NULL AND (NEW.evidence_id IS NOT OLD.evidence_id OR ${protectedRun}))
      OR (NEW.closed_at IS NULL AND (${sent('OLD.evidence_id')})))
    BEGIN SELECT RAISE(ABORT, 'FIRMONY_PAYROLL_REPORTED'); END`,
  `CREATE TRIGGER payroll_run_delete BEFORE DELETE ON payroll_runs WHEN (${sent('OLD.evidence_id')})
    AND NOT EXISTS (SELECT 1 FROM companies WHERE id = OLD.company_id AND purge_started_at IS NOT NULL)
    BEGIN SELECT RAISE(ABORT, 'FIRMONY_PAYROLL_REPORTED'); END`,
  `CREATE TRIGGER payroll_pending_handover BEFORE UPDATE OF purge_started_at ON companies WHEN OLD.purge_started_at IS NULL AND NEW.purge_started_at IS NOT NULL AND ${pendingPayrollSql('NEW.id')}
    BEGIN SELECT RAISE(ABORT, 'FIRMONY_PENDING_FILINGS'); END`,
  `CREATE TRIGGER payroll_company_retain BEFORE DELETE ON companies WHEN OLD.purged_at IS NULL AND EXISTS (SELECT 1 FROM payroll_closures WHERE company_id = OLD.id)
    BEGIN SELECT RAISE(ABORT, 'Evidence hold prevents payroll deletion'); END`,
  ...['payroll_closures', 'payroll_payouts', 'payroll_targets', 'payroll_packages', 'payroll_events'].flatMap((table) => [
    `CREATE TRIGGER ${table}_retain BEFORE DELETE ON ${table} WHEN EXISTS (SELECT 1 FROM companies WHERE id = OLD.company_id AND purge_started_at IS NULL) OR ${held('OLD.company_id')}
      BEGIN SELECT RAISE(ABORT, 'Evidence hold prevents payroll deletion'); END`,
    ...['INSERT', 'UPDATE'].map((action) => `CREATE TRIGGER ${table}_freeze_${action.toLowerCase()} BEFORE ${action} ON ${table} WHEN EXISTS (SELECT 1 FROM companies WHERE id = NEW.company_id AND purge_started_at IS NOT NULL) BEGIN SELECT RAISE(ABORT, 'Company handover is being finalized'); END`),
    ...['INSERT', 'UPDATE', 'DELETE'].map((action) => { const row = action === 'DELETE' ? 'OLD' : 'NEW'; return `CREATE TRIGGER ${table}_revision_${action.toLowerCase()} AFTER ${action} ON ${table} BEGIN
      INSERT INTO company_data_revisions (company_id, revision) VALUES (${row}.company_id, 1) ON CONFLICT(company_id) DO UPDATE SET revision = revision + 1; END` }),
  ]),
]
