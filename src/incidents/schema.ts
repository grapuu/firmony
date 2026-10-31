/** The evidence-hold delete guard of a company's data table, exactly as INCIDENT_SCHEMA makes it; step 93 calls the
 *  same generator for `links` after its table was recreated (31 October 2026). */
export const holdDeleteGuard = (t: string): string =>
  `CREATE TRIGGER ${t}_hold_delete BEFORE DELETE ON ${t}
      WHEN EXISTS (SELECT 1 FROM evidence_holds WHERE company_id = OLD.company_id AND released_at IS NULL) OR EXISTS (SELECT 1 FROM incidents WHERE company_id = OLD.company_id AND closed_at IS NULL)
      BEGIN SELECT RAISE(ABORT, 'Evidence hold prevents deletion'); END`

export const INCIDENT_SCHEMA = [
  'ALTER TABLE companies ADD COLUMN purge_delete_started_at INTEGER',
  'ALTER TABLE companies ADD COLUMN records_delete_started_at INTEGER',
  'ALTER TABLE company_files ADD COLUMN deleted_at INTEGER',
  'ALTER TABLE company_files ADD COLUMN deleted_by TEXT',
  'ALTER TABLE company_files ADD COLUMN retire_nonce TEXT',
  // An already-running old purge may have deleted objects. Never relabel it as safe merely by upgrading.
  'UPDATE companies SET purge_delete_started_at = purge_started_at WHERE purge_started_at IS NOT NULL',
  `CREATE TABLE incidents (
    id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL, created_by TEXT NOT NULL, owner_id TEXT NOT NULL, backup_id TEXT,
    version INTEGER NOT NULL DEFAULT 0, updated_by TEXT,
    severity TEXT NOT NULL CHECK (severity IN ('normal', 'high', 'critical')),
    title TEXT NOT NULL, evidence TEXT NOT NULL, review_on TEXT NOT NULL,
    preservation TEXT NOT NULL CHECK (preservation IN ('held', 'records_only', 'too_late')),
    closed_at INTEGER, closed_by TEXT, close_ref TEXT
  )`,
  'CREATE INDEX incidents_company ON incidents (company_id, created_at)',
  `CREATE TABLE evidence_holds (
    id TEXT PRIMARY KEY, incident_id TEXT NOT NULL UNIQUE REFERENCES incidents(id) ON DELETE CASCADE,
    company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL, created_by TEXT NOT NULL, review_on TEXT NOT NULL,
    reviewed_by TEXT, review_ref TEXT, release_requested_at INTEGER, release_requested_by TEXT,
    release_ref TEXT, released_at INTEGER, released_by TEXT
  )`,
  `CREATE TRIGGER company_files_hold_retire BEFORE UPDATE OF deleted_at ON company_files
    WHEN NEW.deleted_at IS NOT OLD.deleted_at AND (EXISTS (SELECT 1 FROM evidence_holds WHERE company_id = OLD.company_id AND released_at IS NULL) OR EXISTS (SELECT 1 FROM incidents WHERE company_id = OLD.company_id AND closed_at IS NULL))
    BEGIN SELECT RAISE(ABORT, 'Evidence hold prevents attachment retirement'); END`,
  'CREATE INDEX evidence_holds_active ON evidence_holds (company_id, released_at)',
  `CREATE TABLE incident_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT, incident_id TEXT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
    company_id TEXT NOT NULL, at INTEGER NOT NULL, user_id TEXT NOT NULL, action TEXT NOT NULL, detail TEXT NOT NULL
  )`,
  `CREATE TRIGGER incident_events_immutable BEFORE UPDATE ON incident_events BEGIN SELECT RAISE(ABORT, 'Incident history is immutable'); END`,
  ...['incident_events', 'incidents', 'evidence_holds'].map(
    (t) => `CREATE TRIGGER ${t}_keep BEFORE DELETE ON ${t}
    WHEN EXISTS (SELECT 1 FROM companies WHERE id = OLD.company_id) BEGIN SELECT RAISE(ABORT, 'Retain incident evidence with its company'); END`,
  ),
  `CREATE TRIGGER evidence_holds_claim BEFORE INSERT ON evidence_holds
    WHEN NOT EXISTS (SELECT 1 FROM companies c WHERE c.id = NEW.company_id AND
      ((c.purged_at IS NULL AND c.purge_delete_started_at IS NULL) OR (c.purged_at IS NOT NULL AND c.records_delete_started_at IS NULL)))
    BEGIN SELECT RAISE(ABORT, 'Destructive deletion already claimed'); END`,
  `CREATE TRIGGER evidence_holds_immutable BEFORE UPDATE ON evidence_holds WHEN
    OLD.id IS NOT NEW.id OR OLD.incident_id IS NOT NEW.incident_id OR OLD.company_id IS NOT NEW.company_id
    OR OLD.created_at IS NOT NEW.created_at OR OLD.created_by IS NOT NEW.created_by OR OLD.released_at IS NOT NULL
    BEGIN SELECT RAISE(ABORT, 'Retain original hold and released state'); END`,
  `CREATE TRIGGER evidence_holds_release_guard BEFORE UPDATE ON evidence_holds WHEN NEW.released_at IS NOT NULL AND (
    OLD.release_requested_by IS NULL OR NEW.released_by IS NULL OR NEW.released_by = OLD.release_requested_by
    OR NOT EXISTS (SELECT 1 FROM users WHERE id = NEW.released_by AND team = 'admin')
    OR NOT EXISTS (SELECT 1 FROM users WHERE id = OLD.release_requested_by AND team = 'admin'))
    BEGIN SELECT RAISE(ABORT, 'A different administrator must approve release'); END`,
  `CREATE TRIGGER incidents_identity BEFORE UPDATE ON incidents WHEN
    OLD.id IS NOT NEW.id OR OLD.company_id IS NOT NEW.company_id OR OLD.created_at IS NOT NEW.created_at
    OR OLD.created_by IS NOT NEW.created_by OR OLD.preservation IS NOT NEW.preservation OR OLD.closed_at IS NOT NULL
    BEGIN SELECT RAISE(ABORT, 'Retain original incident evidence'); END`,
  `CREATE TRIGGER incidents_close_guard BEFORE UPDATE ON incidents WHEN NEW.closed_at IS NOT NULL
    AND (NEW.closed_by = OLD.created_by OR NOT EXISTS (SELECT 1 FROM users WHERE id = NEW.closed_by AND team = 'admin') OR EXISTS (SELECT 1 FROM evidence_holds WHERE incident_id = OLD.id AND released_at IS NULL))
    BEGIN SELECT RAISE(ABORT, 'Release the evidence hold before closing'); END`,
  `CREATE TRIGGER incidents_open_event AFTER INSERT ON incidents BEGIN
    INSERT INTO incident_events (incident_id, company_id, at, user_id, action, detail)
    VALUES (NEW.id, NEW.company_id, NEW.created_at, NEW.created_by, 'incident.opened',
      json_object('title', NEW.title, 'severity', NEW.severity, 'evidence', NEW.evidence, 'preservation', NEW.preservation, 'owner', NEW.owner_id, 'backup', NEW.backup_id)); END`,
  `CREATE TRIGGER incidents_assignment_event AFTER UPDATE OF owner_id, backup_id ON incidents
    WHEN OLD.owner_id IS NOT NEW.owner_id OR OLD.backup_id IS NOT NEW.backup_id BEGIN
    INSERT INTO incident_events (incident_id, company_id, at, user_id, action, detail)
    VALUES (NEW.id, NEW.company_id, unixepoch(), NEW.updated_by, 'incident.assigned', json_object('owner', NEW.owner_id, 'backup', NEW.backup_id)); END`,
  `CREATE TRIGGER incidents_close_event AFTER UPDATE OF closed_at ON incidents WHEN NEW.closed_at IS NOT NULL BEGIN
    INSERT INTO incident_events (incident_id, company_id, at, user_id, action, detail)
    VALUES (NEW.id, NEW.company_id, NEW.closed_at, NEW.closed_by, 'incident.closed', json_object('reference', NEW.close_ref)); END`,
  `CREATE TRIGGER evidence_holds_created AFTER INSERT ON evidence_holds BEGIN
    INSERT INTO incident_events (incident_id, company_id, at, user_id, action, detail)
    VALUES (NEW.incident_id, NEW.company_id, NEW.created_at, NEW.created_by, 'hold.created', json_object('reviewOn', NEW.review_on)); END`,
  `CREATE TRIGGER evidence_holds_event AFTER UPDATE ON evidence_holds BEGIN
    INSERT INTO incident_events (incident_id, company_id, at, user_id, action, detail)
    VALUES (NEW.incident_id, NEW.company_id, unixepoch(),
      CASE WHEN NEW.released_at IS NOT NULL THEN NEW.released_by WHEN NEW.release_requested_by IS NOT NULL AND (NEW.release_requested_by IS NOT OLD.release_requested_by OR NEW.release_requested_at IS NOT OLD.release_requested_at) THEN NEW.release_requested_by ELSE NEW.reviewed_by END,
      CASE WHEN NEW.released_at IS NOT NULL THEN 'hold.released' WHEN NEW.release_requested_by IS NOT NULL AND (NEW.release_requested_by IS NOT OLD.release_requested_by OR NEW.release_requested_at IS NOT OLD.release_requested_at) THEN 'hold.release_requested' ELSE 'hold.reviewed' END,
      json_object('reviewOn', NEW.review_on, 'reviewRef', NEW.review_ref, 'releaseRef', NEW.release_ref)); END`,
  ...[
    'documents',
    'payments',
    'links',
    'accounts',
    'bank_links',
    'statements',
    'invoices',
    'messages',
    'inbound_mail',
    'supplier_rules',
    'vat_returns',
    'filings',
    'filing_history',
    'closings',
    'closing_history',
    'employees',
    'payroll_runs',
    'payroll_history',
    'ledger_entries',
    'period_locks',
    'period_lock_history',
    'company_files',
    'declarations',
    'risks',
    'reports',
    'events',
    'contract_snapshots',
  ].map(
    (t) =>
      `CREATE TRIGGER ${t}_hold_delete BEFORE DELETE ON ${t}
      WHEN EXISTS (SELECT 1 FROM evidence_holds WHERE company_id = OLD.company_id AND released_at IS NULL) OR EXISTS (SELECT 1 FROM incidents WHERE company_id = OLD.company_id AND closed_at IS NULL)
      BEGIN SELECT RAISE(ABORT, 'Evidence hold prevents deletion'); END`,
  ),
  `CREATE TRIGGER invoice_lines_hold_delete BEFORE DELETE ON invoice_lines
    WHEN EXISTS (SELECT 1 FROM invoices i JOIN evidence_holds h ON h.company_id = i.company_id WHERE i.id = OLD.invoice_id AND h.released_at IS NULL) OR EXISTS (SELECT 1 FROM invoices i JOIN incidents x ON x.company_id = i.company_id WHERE i.id = OLD.invoice_id AND x.closed_at IS NULL)
    BEGIN SELECT RAISE(ABORT, 'Evidence hold prevents deletion'); END`,
  `CREATE TRIGGER companies_hold_delete BEFORE DELETE ON companies
    WHEN EXISTS (SELECT 1 FROM evidence_holds WHERE company_id = OLD.id AND released_at IS NULL) OR EXISTS (SELECT 1 FROM incidents WHERE company_id = OLD.id AND closed_at IS NULL)
    BEGIN SELECT RAISE(ABORT, 'Evidence hold prevents company deletion'); END`,
  `CREATE TRIGGER companies_hold_claim BEFORE UPDATE OF purge_delete_started_at, records_delete_started_at ON companies
    WHEN (NEW.purge_delete_started_at IS NOT OLD.purge_delete_started_at OR NEW.records_delete_started_at IS NOT OLD.records_delete_started_at)
      AND (EXISTS (SELECT 1 FROM evidence_holds WHERE company_id = OLD.id AND released_at IS NULL) OR EXISTS (SELECT 1 FROM incidents WHERE company_id = OLD.id AND closed_at IS NULL))
    BEGIN SELECT RAISE(ABORT, 'Evidence hold prevents destructive claim'); END`,
]
