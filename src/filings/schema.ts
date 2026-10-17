import { pendingFilingsSql, quarterLastSql, safeJson, TRANSITIONS } from './model'

const authorized = (company: string, user: string) => `EXISTS (SELECT 1 FROM users u JOIN companies c ON c.id = ${company}
  WHERE u.id = ${user} AND (u.team = 'admin' OR (u.team = 'accountant' AND c.accountant_id = u.id)))`
const protectedCompany = (company: string) => `EXISTS (SELECT 1 FROM evidence_holds WHERE company_id = ${company} AND released_at IS NULL)
  OR EXISTS (SELECT 1 FROM incidents WHERE company_id = ${company} AND closed_at IS NULL)`
const transition = Object.entries(TRANSITIONS).flatMap(([from, tos]) => tos.map((to) => `(NEW.from_state = '${from}' AND NEW.to_state = '${to}')`)).join(' OR ')
const immutable = ['id', 'company_id', 'kind', 'period', 'name', 'xml', 'sha256', 'created_at', 'created_by'].map((k) => `NEW.${k} IS NOT OLD.${k}`).join(' OR ')
const sent = (company: string, ids: string[]) => `EXISTS (SELECT 1 FROM filing_packages WHERE company_id = ${company} AND id IN (${ids.join(', ')}) AND status IN ('submitted', 'accepted', 'review'))`
const vatIds = (row: string) => [safeJson(`${row}.delivery`, '$.vat'), safeJson(`${row}.delivery`, '$.kv')]
const summaryId = (row: string) => safeJson(`${row}.data`, '$.file.attemptId')
const closingIds = (row: string) => [safeJson(`${row}.filed`, '$.files.return.attemptId'), safeJson(`${row}.filed`, '$.files.statements.attemptId')]

export const FILING_SCHEMA = [
  'ALTER TABLE vat_returns ADD COLUMN delivery TEXT CHECK (delivery IS NULL OR json_valid(delivery))',
  `CREATE TABLE filing_packages (
    id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('vat', 'kv', 'sv', 'dppo', 'uz')), period TEXT NOT NULL,
    name TEXT NOT NULL, xml TEXT NOT NULL, sha256 TEXT NOT NULL CHECK (length(sha256) = 64),
    created_at INTEGER NOT NULL, created_by TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'prepared' CHECK (status IN ('prepared', 'submitted', 'accepted', 'rejected', 'review')),
    revision INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL, updated_by TEXT NOT NULL, last_event TEXT
  )`,
  'CREATE INDEX filing_packages_company ON filing_packages (company_id, period, created_at)',
  `CREATE TABLE filing_events (
    id TEXT PRIMARY KEY, package_id TEXT NOT NULL REFERENCES filing_packages(id) ON DELETE CASCADE,
    company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE, revision INTEGER NOT NULL,
    at INTEGER NOT NULL, by_user TEXT NOT NULL, from_state TEXT NOT NULL, to_state TEXT NOT NULL,
    external_on TEXT NOT NULL, reference TEXT NOT NULL, reason TEXT NOT NULL, channel TEXT NOT NULL,
    file_key TEXT, file_name TEXT, file_type TEXT, file_bytes INTEGER, file_sha256 TEXT,
    UNIQUE (package_id, revision),
    CHECK (length(reference) >= 4 AND length(channel) >= 2),
    CHECK (to_state NOT IN ('accepted', 'rejected') OR (file_key IS NOT NULL AND file_sha256 IS NOT NULL AND file_bytes > 0)),
    CHECK (to_state NOT IN ('rejected', 'review') OR length(reason) >= 12)
  )`,
  'CREATE INDEX filing_events_company ON filing_events (company_id, package_id, revision)',
  `CREATE TRIGGER filing_company_retain BEFORE DELETE ON companies WHEN OLD.purged_at IS NULL
    AND EXISTS (SELECT 1 FROM filing_packages WHERE company_id = OLD.id)
    BEGIN SELECT RAISE(ABORT, 'Evidence hold prevents filing deletion'); END`,
  `CREATE TRIGGER filing_pending_handover BEFORE UPDATE OF purge_started_at ON companies
    WHEN OLD.purge_started_at IS NULL AND NEW.purge_started_at IS NOT NULL AND ${pendingFilingsSql('NEW.id')}
    BEGIN SELECT RAISE(ABORT, 'FIRMONY_PENDING_FILINGS'); END`,
  `CREATE TRIGGER vat_delivery_delete BEFORE DELETE ON vat_returns WHEN ${sent('OLD.company_id', vatIds('OLD'))}
    AND NOT EXISTS (SELECT 1 FROM companies WHERE id = OLD.company_id AND purge_started_at IS NOT NULL)
    BEGIN SELECT RAISE(ABORT, 'FIRMONY_FILING_SENT'); END`,
  `CREATE TRIGGER vat_delivery_update BEFORE UPDATE ON vat_returns WHEN
    ${safeJson('NEW.prev', '$.delivery')} IS NOT OLD.delivery AND (${vatIds('OLD').map((id, i) => `(${id} IS NOT ${vatIds('NEW')[i]} AND ${sent('OLD.company_id', [id])})`).join(' OR ')})
    BEGIN SELECT RAISE(ABORT, 'FIRMONY_FILING_SENT'); END`,
  `CREATE TRIGGER sv_delivery_delete BEFORE DELETE ON filings WHEN OLD.kind = 'sv' AND ${sent('OLD.company_id', [summaryId('OLD')])}
    AND NOT EXISTS (SELECT 1 FROM companies WHERE id = OLD.company_id AND purge_started_at IS NOT NULL)
    AND NOT EXISTS (SELECT 1 FROM filings m WHERE OLD.period GLOB '[12][0-9][0-9][0-9]-Q[1-4]'
      AND m.company_id = OLD.company_id AND m.kind = 'sv' AND m.period = ${quarterLastSql('OLD.period')}
      AND ${safeJson('m.data', '$.sourcePeriod')} = OLD.period AND ${safeJson('m.data', '$.file.attemptId')} = ${summaryId('OLD')})
    BEGIN SELECT RAISE(ABORT, 'FIRMONY_FILING_SENT'); END`,
  `CREATE TRIGGER sv_delivery_update BEFORE UPDATE ON filings WHEN OLD.kind = 'sv' AND ${sent('OLD.company_id', [summaryId('OLD')])}
    AND (OLD.period IS NOT NEW.period OR (${summaryId('OLD')} IS NOT ${summaryId('NEW')} AND ${safeJson('NEW.data', '$.prev.file.attemptId')} IS NOT ${summaryId('OLD')}))
    BEGIN SELECT RAISE(ABORT, 'FIRMONY_FILING_SENT'); END`,
  `CREATE TRIGGER closing_delivery_update BEFORE UPDATE ON closings WHEN ${sent('OLD.company_id', closingIds('OLD'))}
    AND (${closingIds('OLD').map((id, i) => `${id} IS NOT ${closingIds('NEW')[i]}`).join(' OR ')})
    BEGIN SELECT RAISE(ABORT, 'FIRMONY_FILING_SENT'); END`,
  `CREATE TRIGGER closing_delivery_delete BEFORE DELETE ON closings WHEN ${sent('OLD.company_id', closingIds('OLD'))}
    AND NOT EXISTS (SELECT 1 FROM companies WHERE id = OLD.company_id AND purge_started_at IS NOT NULL)
    BEGIN SELECT RAISE(ABORT, 'FIRMONY_FILING_SENT'); END`,
  `CREATE TRIGGER filing_packages_create BEFORE INSERT ON filing_packages WHEN NEW.status <> 'prepared' OR NEW.revision <> 0
    OR NOT (${authorized('NEW.company_id', 'NEW.created_by')})
    BEGIN SELECT RAISE(ABORT, 'FIRMONY_FILING_AUTHORITY'); END`,
  `CREATE TRIGGER filing_packages_immutable BEFORE UPDATE ON filing_packages WHEN ${immutable}
    OR NEW.revision <> OLD.revision + 1 OR NOT EXISTS (SELECT 1 FROM filing_events e WHERE e.id = NEW.last_event
      AND e.package_id = OLD.id AND e.company_id = OLD.company_id AND e.revision = NEW.revision
      AND e.from_state = OLD.status AND e.to_state = NEW.status AND e.by_user = NEW.updated_by AND e.at = NEW.updated_at)
    BEGIN SELECT RAISE(ABORT, 'FIRMONY_FILING_HISTORY'); END`,
  `CREATE TRIGGER filing_events_create BEFORE INSERT ON filing_events WHEN NOT (${authorized('NEW.company_id', 'NEW.by_user')})
    OR NOT (${transition}) OR NOT EXISTS (SELECT 1 FROM filing_packages p WHERE p.id = NEW.package_id
      AND p.company_id = NEW.company_id AND p.revision + 1 = NEW.revision AND p.status = NEW.from_state)
    OR (NEW.from_state IN ('accepted', 'review') AND NOT EXISTS (SELECT 1 FROM users WHERE id = NEW.by_user AND team = 'admin'))
    OR (NEW.file_key IS NOT NULL AND NEW.file_key NOT LIKE 'companies/' || NEW.company_id || '/filings/%')
    BEGIN SELECT RAISE(ABORT, 'FIRMONY_FILING_AUTHORITY'); END`,
  `CREATE TRIGGER filing_events_immutable BEFORE UPDATE ON filing_events BEGIN SELECT RAISE(ABORT, 'FIRMONY_FILING_HISTORY'); END`,
  `CREATE TRIGGER filing_events_reuse BEFORE INSERT ON filing_events WHEN EXISTS (SELECT 1 FROM filing_events e
    WHERE e.company_id = NEW.company_id AND e.package_id <> NEW.package_id
      AND (e.reference = NEW.reference COLLATE NOCASE OR (NEW.file_sha256 IS NOT NULL AND e.file_sha256 = NEW.file_sha256)))
    BEGIN SELECT RAISE(ABORT, 'FIRMONY_FILING_RECEIPT_REUSED'); END`,
  ...['filing_packages', 'filing_events'].flatMap((table) => [
    `CREATE TRIGGER ${table}_retain BEFORE DELETE ON ${table}
      WHEN EXISTS (SELECT 1 FROM companies WHERE id = OLD.company_id AND purge_started_at IS NULL)
        OR ${protectedCompany('OLD.company_id')}
      BEGIN SELECT RAISE(ABORT, 'Evidence hold prevents filing deletion'); END`,
    ...['INSERT', 'UPDATE', 'DELETE'].map((action) => {
      const row = action === 'DELETE' ? 'OLD' : 'NEW'
      return `CREATE TRIGGER ${table}_revision_${action.toLowerCase()} AFTER ${action} ON ${table} BEGIN
        INSERT INTO company_data_revisions (company_id, revision) VALUES (${row}.company_id, 1)
        ON CONFLICT (company_id) DO UPDATE SET revision = revision + 1; END`
    }),
    ...['INSERT', 'UPDATE'].map((action) => `CREATE TRIGGER ${table}_freeze_${action.toLowerCase()} BEFORE ${action} ON ${table}
      WHEN EXISTS (SELECT 1 FROM companies WHERE id = NEW.company_id AND purge_started_at IS NOT NULL)
      BEGIN SELECT RAISE(ABORT, 'Company handover is being finalized'); END`),
  ]),
]
