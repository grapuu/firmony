import { AML_TODAY_SQL } from '../aml/retention'
import { AREA_KEYS } from './model'

// Schema 78 only. Existing 77 steps remain unchanged. A request and each revision carry their own immutable evidence.
export const handoverOpenSql = (company: string) => `EXISTS (SELECT 1 FROM companies c WHERE c.id = ${company}
  AND c.closed_at IS NULL AND c.purge_started_at IS NULL AND c.aml_archived_at IS NULL
  AND (c.contract_at IS NOT NULL OR c.demo = 1) AND (c.ends_on IS NULL OR c.ends_on >= ${AML_TODAY_SQL}))`
const retained = (company: string) => `NOT EXISTS (SELECT 1 FROM companies c WHERE c.id = ${company} AND c.records_delete_started_at IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM evidence_holds h WHERE h.company_id = c.id AND h.released_at IS NULL)
  AND NOT EXISTS (SELECT 1 FROM incidents i WHERE i.company_id = c.id AND i.closed_at IS NULL))`
const snapshot = `json_object('state',NEW.state,'responsible',NEW.responsible_id,'due',NEW.due_on,'authority',NEW.authority_reference,
  'contactReference',NEW.contact_reference,'contactOn',NEW.contact_on,'publicNote',NEW.public_note,'clientAction',NEW.client_action,
  'checks',json(NEW.checks),'completionSource',NEW.completion_source,'reason',NEW.reason)`
export const MANAGED_HANDOVER_SCHEMA = [
  `CREATE TABLE managed_handovers (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL REFERENCES companies(id),
    created_at INTEGER NOT NULL,
    created_by TEXT NOT NULL,
    requester_name TEXT NOT NULL,
    company_snapshot TEXT NOT NULL CHECK(json_valid(company_snapshot)),
    consent_version TEXT NOT NULL,
    consent_text TEXT NOT NULL,
    contact_name TEXT NOT NULL,
    contact_email TEXT NOT NULL,
    requested_on TEXT,
    state TEXT NOT NULL DEFAULT 'requested' CHECK(state IN ('requested','coordinating','waiting','reviewing','completed','cancelled')),
    revision INTEGER NOT NULL DEFAULT 0 CHECK(revision >= 0),
    updated_at INTEGER NOT NULL,
    updated_by TEXT NOT NULL,
    responsible_id TEXT,
    due_on TEXT,
    authority_reference TEXT NOT NULL DEFAULT '',
    contact_reference TEXT NOT NULL DEFAULT '',
    contact_on TEXT,
    public_note TEXT NOT NULL DEFAULT '',
    client_action TEXT NOT NULL DEFAULT '',
    checks TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(checks)),
    completion_source TEXT,
    reason TEXT NOT NULL DEFAULT ''
  )`,
  "CREATE UNIQUE INDEX managed_handovers_active ON managed_handovers(company_id) WHERE state <> 'cancelled'",
  'CREATE INDEX managed_handovers_company ON managed_handovers(company_id, created_at DESC)',
  `CREATE TABLE managed_handover_history (
    case_id TEXT NOT NULL REFERENCES managed_handovers(id), company_id TEXT NOT NULL REFERENCES companies(id),
    revision INTEGER NOT NULL, at INTEGER NOT NULL, by_user TEXT NOT NULL, by_name TEXT NOT NULL,
    data TEXT NOT NULL CHECK(json_valid(data)), PRIMARY KEY(case_id,revision)
  )`,
  `CREATE TRIGGER managed_handovers_create BEFORE INSERT ON managed_handovers WHEN
    NOT (${handoverOpenSql('NEW.company_id')}) OR NEW.state <> 'requested' OR NEW.revision <> 0
    OR NOT EXISTS (SELECT 1 FROM members m JOIN users u ON u.id = m.user_id WHERE m.company_id = NEW.company_id AND m.user_id = NEW.created_by AND m.role = 'owner')
    BEGIN SELECT RAISE(ABORT,'Managed handover is not available'); END`,
  `CREATE TRIGGER managed_handovers_update BEFORE UPDATE ON managed_handovers WHEN
    NOT (${handoverOpenSql('NEW.company_id')}) OR NEW.revision <> OLD.revision + 1 OR OLD.state = 'cancelled'
    OR NEW.id IS NOT OLD.id OR NEW.company_id IS NOT OLD.company_id OR NEW.created_at IS NOT OLD.created_at OR NEW.created_by IS NOT OLD.created_by
    OR NEW.requester_name IS NOT OLD.requester_name OR NEW.company_snapshot IS NOT OLD.company_snapshot
    OR NEW.consent_version IS NOT OLD.consent_version OR NEW.consent_text IS NOT OLD.consent_text
    OR NEW.contact_name IS NOT OLD.contact_name OR NEW.contact_email IS NOT OLD.contact_email OR NEW.requested_on IS NOT OLD.requested_on
    OR NOT EXISTS (SELECT 1 FROM users u JOIN companies c ON c.id = NEW.company_id WHERE u.id = NEW.updated_by
      AND (u.team = 'admin' OR u.team = 'accountant' AND c.accountant_id = u.id
        OR NEW.state = 'cancelled' AND EXISTS (SELECT 1 FROM members m WHERE m.company_id = c.id AND m.user_id = u.id AND m.role = 'owner')))
    BEGIN SELECT RAISE(ABORT,'Managed handover changed or is not writable'); END`,
  `CREATE TRIGGER managed_handovers_steps BEFORE UPDATE ON managed_handovers WHEN NOT (
    NEW.state = 'cancelled' OR NEW.state = OLD.state AND OLD.state <> 'completed'
    OR OLD.state = 'requested' AND NEW.state = 'coordinating'
    OR OLD.state = 'coordinating' AND NEW.state = 'waiting'
    OR OLD.state = 'waiting' AND NEW.state IN ('coordinating','reviewing')
    OR OLD.state = 'reviewing' AND NEW.state IN ('coordinating','waiting','completed')
    OR OLD.state = 'completed' AND NEW.state = 'reviewing')
    BEGIN SELECT RAISE(ABORT,'Managed handover cannot skip a step'); END`,
  `CREATE TRIGGER managed_handovers_complete BEFORE UPDATE ON managed_handovers WHEN NEW.state = 'completed' AND (
    NEW.client_action <> '' OR NEW.completion_source IS NULL OR NOT json_valid(NEW.completion_source)
    OR (SELECT COUNT(*) FROM json_each(NEW.checks)) <> ${AREA_KEYS.length}
    OR NOT EXISTS (SELECT 1 FROM company_files f WHERE f.company_id = NEW.company_id AND f.kind = 'takeover' AND f.deleted_at IS NULL)
    OR NOT EXISTS (SELECT 1 FROM companies c JOIN users u ON u.id = c.accountant_id WHERE c.id = NEW.company_id AND c.accountant_id = NEW.responsible_id AND u.team IN ('accountant','admin'))
    OR json_extract(NEW.checks,'$.books.result') IS NOT 'received'
    OR ${AREA_KEYS.map(k => `(json_extract(NEW.checks,'$.${k}.result') IS NULL OR json_extract(NEW.checks,'$.${k}.result') NOT IN ('received','not_applicable') OR COALESCE(length(trim(json_extract(NEW.checks,'$.${k}.note'))),0) < 10
      OR json_extract(NEW.checks,'$.${k}.result') = 'received' AND NOT EXISTS (SELECT 1 FROM company_files f WHERE f.company_id = NEW.company_id AND f.id = json_extract(NEW.checks,'$.${k}.file') AND f.kind = 'takeover' AND f.deleted_at IS NULL))`).join(' OR ')}
    OR json_extract(NEW.checks,'$.opening.result') = 'received' AND NOT EXISTS (SELECT 1 FROM ledger_entries e WHERE e.company_id = NEW.company_id AND e.kind = 'opening' AND e.deleted_at IS NULL))
    BEGIN SELECT RAISE(ABORT,'Managed handover requires complete evidence'); END`,
  `CREATE TRIGGER managed_handover_file_guard BEFORE INSERT ON events WHEN NEW.action = 'takeover.managed.file' AND NOT EXISTS (
    SELECT 1 FROM managed_handovers h JOIN users u ON u.id = NEW.user_id JOIN companies c ON c.id = h.company_id
    WHERE h.company_id = NEW.company_id AND h.id = json_extract(NEW.detail,'$.case') AND h.revision = json_extract(NEW.detail,'$.revision')
      AND h.state NOT IN ('cancelled','completed') AND (u.team = 'admin' OR u.team = 'accountant' AND c.accountant_id = u.id)
      AND ${handoverOpenSql('h.company_id')})
    BEGIN SELECT RAISE(ABORT,'Managed handover upload changed'); END`,
  ...['INSERT', 'UPDATE'].map(action => `CREATE TRIGGER managed_handovers_history_${action.toLowerCase()} AFTER ${action} ON managed_handovers BEGIN
    INSERT INTO managed_handover_history(case_id,company_id,revision,at,by_user,by_name,data)
      VALUES(NEW.id,NEW.company_id,NEW.revision,NEW.updated_at,NEW.updated_by,COALESCE((SELECT name FROM users WHERE id = NEW.updated_by),''),${snapshot});
    INSERT INTO events(at,company_id,user_id,action,subject,detail) VALUES(NEW.updated_at,NEW.company_id,NEW.updated_by,'takeover.managed.${action === 'INSERT' ? 'requested' : 'updated'}',NEW.id,json_object('revision',NEW.revision,'state',NEW.state)); END`),
  `CREATE TRIGGER managed_handover_history_immutable BEFORE UPDATE ON managed_handover_history BEGIN SELECT RAISE(ABORT,'Managed handover history is immutable'); END`,
  ...['managed_handovers', 'managed_handover_history'].map(table => `CREATE TRIGGER ${table}_retained BEFORE DELETE ON ${table} WHEN ${retained('OLD.company_id')} BEGIN SELECT RAISE(ABORT,'Managed handover retention prevents deletion'); END`),
  ...['managed_handovers', 'managed_handover_history'].flatMap(table => ['INSERT','UPDATE'].map(action => {
    const row = 'NEW'
    return `CREATE TRIGGER ${table}_data_${action.toLowerCase()} AFTER ${action} ON ${table} BEGIN
      INSERT INTO company_data_revisions(company_id,revision) VALUES(${row}.company_id,1)
      ON CONFLICT(company_id) DO UPDATE SET revision = revision + 1; END`
  })),
]
