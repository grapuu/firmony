import { AML_TODAY_SQL } from '../aml/retention'
import { STEP_KEYS } from './model'

// Schema 80 only. Existing 79 steps remain unchanged. A request and each revision carry their own immutable evidence.
export const formationOpenSql = (company: string) => `EXISTS (SELECT 1 FROM companies c WHERE c.id = ${company}
  AND c.closed_at IS NULL AND c.purge_started_at IS NULL AND c.aml_archived_at IS NULL
  AND (c.contract_at IS NOT NULL OR c.demo = 1) AND (c.ends_on IS NULL OR c.ends_on >= ${AML_TODAY_SQL}))`
const retained = (company: string) => `NOT EXISTS (SELECT 1 FROM companies c WHERE c.id = ${company} AND c.records_delete_started_at IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM evidence_holds h WHERE h.company_id = c.id AND h.released_at IS NULL)
  AND NOT EXISTS (SELECT 1 FROM incidents i WHERE i.company_id = c.id AND i.closed_at IS NULL))`
const snapshot = `json_object('state',NEW.state,'responsible',NEW.responsible_id,'due',NEW.due_on,'authority',NEW.authority_reference,
  'publicNote',NEW.public_note,'clientAction',NEW.client_action,'steps',json(NEW.steps),'completionSource',NEW.completion_source,'reason',NEW.reason)`
export const FORMATION_SCHEMA = [
  `CREATE TABLE formation_cases (
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
    idea TEXT NOT NULL DEFAULT '',
    state TEXT NOT NULL DEFAULT 'requested' CHECK(state IN ('requested','preparing','waiting','registering','completed','cancelled')),
    revision INTEGER NOT NULL DEFAULT 0 CHECK(revision >= 0),
    updated_at INTEGER NOT NULL,
    updated_by TEXT NOT NULL,
    responsible_id TEXT,
    due_on TEXT,
    authority_reference TEXT NOT NULL DEFAULT '',
    public_note TEXT NOT NULL DEFAULT '',
    client_action TEXT NOT NULL DEFAULT '',
    steps TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(steps)),
    completion_source TEXT,
    reason TEXT NOT NULL DEFAULT ''
  )`,
  "CREATE UNIQUE INDEX formation_cases_active ON formation_cases(company_id) WHERE state <> 'cancelled'",
  'CREATE INDEX formation_cases_company ON formation_cases(company_id, created_at DESC)',
  `CREATE TABLE formation_history (
    case_id TEXT NOT NULL REFERENCES formation_cases(id), company_id TEXT NOT NULL REFERENCES companies(id),
    revision INTEGER NOT NULL, at INTEGER NOT NULL, by_user TEXT NOT NULL, by_name TEXT NOT NULL,
    data TEXT NOT NULL CHECK(json_valid(data)), PRIMARY KEY(case_id,revision)
  )`,
  `CREATE TRIGGER formation_cases_create BEFORE INSERT ON formation_cases WHEN
    NOT (${formationOpenSql('NEW.company_id')}) OR NEW.state <> 'requested' OR NEW.revision <> 0
    OR NOT EXISTS (SELECT 1 FROM members m JOIN users u ON u.id = m.user_id WHERE m.company_id = NEW.company_id AND m.user_id = NEW.created_by AND m.role = 'owner')
    BEGIN SELECT RAISE(ABORT,'Company formation is not available'); END`,
  `CREATE TRIGGER formation_cases_update BEFORE UPDATE ON formation_cases WHEN
    NOT (${formationOpenSql('NEW.company_id')}) OR NEW.revision <> OLD.revision + 1 OR OLD.state = 'cancelled'
    OR NEW.id IS NOT OLD.id OR NEW.company_id IS NOT OLD.company_id OR NEW.created_at IS NOT OLD.created_at OR NEW.created_by IS NOT OLD.created_by
    OR NEW.requester_name IS NOT OLD.requester_name OR NEW.company_snapshot IS NOT OLD.company_snapshot
    OR NEW.consent_version IS NOT OLD.consent_version OR NEW.consent_text IS NOT OLD.consent_text
    OR NEW.contact_name IS NOT OLD.contact_name OR NEW.contact_email IS NOT OLD.contact_email OR NEW.idea IS NOT OLD.idea
    BEGIN SELECT RAISE(ABORT,'Company formation cannot change its request'); END`,
  `CREATE TRIGGER formation_cases_step BEFORE UPDATE ON formation_cases WHEN
    NOT (OLD.state = 'requested' AND NEW.state IN ('preparing','registering')
    OR OLD.state = 'preparing' AND NEW.state IN ('waiting','registering')
    OR OLD.state = 'waiting' AND NEW.state IN ('preparing','registering')
    OR OLD.state = 'registering' AND NEW.state IN ('waiting','completed')
    OR OLD.state = 'completed' AND NEW.state = 'registering')
    BEGIN SELECT RAISE(ABORT,'Company formation cannot skip a step'); END`,
  `CREATE TRIGGER formation_cases_complete BEFORE UPDATE ON formation_cases WHEN NEW.state = 'completed' AND (
    NEW.client_action <> '' OR NEW.completion_source IS NULL OR NOT json_valid(NEW.completion_source)
    OR (SELECT COUNT(*) FROM json_each(NEW.steps)) <> ${STEP_KEYS.length}
    OR ${STEP_KEYS.map(k => `(json_extract(NEW.steps,'$.${k}.result') IS NULL OR json_extract(NEW.steps,'$.${k}.result') NOT IN ('received','not_applicable') OR COALESCE(length(trim(json_extract(NEW.steps,'$.${k}.note'))),0) < 10)`).join(' OR ')}
    OR json_extract(NEW.steps,'$.register.result') IS NOT 'received')
    BEGIN SELECT RAISE(ABORT,'Company formation requires complete evidence'); END`,
  ...['INSERT', 'UPDATE'].map(action => `CREATE TRIGGER formation_history_${action.toLowerCase()} AFTER ${action} ON formation_cases BEGIN
    INSERT INTO formation_history(case_id,company_id,revision,at,by_user,by_name,data)
      VALUES(NEW.id,NEW.company_id,NEW.revision,NEW.updated_at,NEW.updated_by,COALESCE((SELECT name FROM users WHERE id = NEW.updated_by),''),${snapshot});
    INSERT INTO events(at,company_id,user_id,action,subject,detail) VALUES(NEW.updated_at,NEW.company_id,NEW.updated_by,'formation.${action === 'INSERT' ? 'requested' : 'updated'}',NEW.id,json_object('revision',NEW.revision,'state',NEW.state)); END`),
  `CREATE TRIGGER formation_history_immutable BEFORE UPDATE ON formation_history BEGIN SELECT RAISE(ABORT,'Company formation history is immutable'); END`,
  ...['formation_cases', 'formation_history'].map(table => `CREATE TRIGGER ${table}_retained BEFORE DELETE ON ${table} WHEN ${retained('OLD.company_id')} BEGIN SELECT RAISE(ABORT,'Company formation retention prevents deletion'); END`),
  ...['formation_cases', 'formation_history'].flatMap(table => ['INSERT', 'UPDATE'].map(action => {
    const row = 'NEW'
    return `CREATE TRIGGER ${table}_data_${action.toLowerCase()} AFTER ${action} ON ${table} BEGIN
      INSERT INTO company_data_revisions(company_id,revision) VALUES(${row}.company_id,1)
      ON CONFLICT(company_id) DO UPDATE SET revision = revision + 1; END`
  })),
]

