import { AML_TODAY_SQL } from '../aml/retention'

/** Schema 79 only. Topic routing keeps no question, document, bank data or generated answer. */
export const ASSISTANT_SCHEMA = [
  `CREATE TABLE assistant_control (id INTEGER PRIMARY KEY CHECK(id=1), enabled INTEGER NOT NULL CHECK(enabled IN (0,1)), changed_at INTEGER NOT NULL, changed_by TEXT)`,
  'INSERT INTO assistant_control(id,enabled,changed_at) VALUES(1,1,0)',
  `CREATE TABLE assistant_uses (
    id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(id), actor TEXT NOT NULL,
    side TEXT NOT NULL CHECK(side IN ('client','team')), fingerprint TEXT NOT NULL CHECK(length(fingerprint)=64),
    day TEXT NOT NULL, created_at INTEGER NOT NULL, finished_at INTEGER,
    state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','done','failed')),
    topic TEXT CHECK(topic IS NULL OR topic IN ('overview','missing','deadlines','document','price','next','expert')),
    model TEXT NOT NULL, input_tokens INTEGER CHECK(input_tokens IS NULL OR input_tokens>=0),
    output_tokens INTEGER CHECK(output_tokens IS NULL OR output_tokens>=0)
  )`,
  'CREATE INDEX assistant_uses_day ON assistant_uses(day)',
  'CREATE INDEX assistant_uses_actor_day ON assistant_uses(actor,day)',
  'CREATE INDEX assistant_uses_company_day ON assistant_uses(company_id,day)',
  'CREATE INDEX assistant_uses_pending ON assistant_uses(actor,state,created_at)',
  `CREATE TRIGGER assistant_uses_create BEFORE INSERT ON assistant_uses WHEN
    NEW.state <> 'pending' OR NOT EXISTS (SELECT 1 FROM assistant_control WHERE id=1 AND enabled=1)
    OR NOT EXISTS (SELECT 1 FROM companies c JOIN users u ON u.id=NEW.actor WHERE c.id=NEW.company_id
      AND c.closed_at IS NULL AND c.purge_started_at IS NULL AND c.aml_archived_at IS NULL
      AND (c.contract_at IS NOT NULL OR c.demo=1) AND (c.ends_on IS NULL OR c.ends_on>=${AML_TODAY_SQL})
      AND (NEW.side='client' AND EXISTS (SELECT 1 FROM members m WHERE m.company_id=c.id AND m.user_id=u.id)
        OR NEW.side='team' AND (u.team='admin' OR u.team='accountant' AND c.accountant_id=u.id)))
    BEGIN SELECT RAISE(ABORT,'Assistant scope is no longer available'); END`,
  `CREATE TRIGGER assistant_uses_update BEFORE UPDATE ON assistant_uses WHEN OLD.state<>'pending' OR NEW.state='pending'
    OR NEW.id IS NOT OLD.id OR NEW.company_id IS NOT OLD.company_id OR NEW.actor IS NOT OLD.actor OR NEW.side IS NOT OLD.side
    OR NEW.fingerprint IS NOT OLD.fingerprint OR NEW.day IS NOT OLD.day OR NEW.created_at IS NOT OLD.created_at OR NEW.model IS NOT OLD.model
    BEGIN SELECT RAISE(ABORT,'Assistant usage is immutable'); END`,
  `CREATE TRIGGER assistant_uses_retained BEFORE DELETE ON assistant_uses WHEN NOT EXISTS (
    SELECT 1 FROM companies c WHERE c.id=OLD.company_id AND c.records_delete_started_at IS NOT NULL
      AND NOT EXISTS(SELECT 1 FROM evidence_holds h WHERE h.company_id=c.id AND h.released_at IS NULL)
      AND NOT EXISTS(SELECT 1 FROM incidents i WHERE i.company_id=c.id AND i.closed_at IS NULL))
    BEGIN SELECT RAISE(ABORT,'Assistant usage evidence is retained'); END`,
  ...['INSERT','UPDATE'].map(action=>`CREATE TRIGGER assistant_uses_data_${action.toLowerCase()} AFTER ${action} ON assistant_uses BEGIN
    INSERT INTO company_data_revisions(company_id,revision) VALUES(NEW.company_id,1) ON CONFLICT(company_id) DO UPDATE SET revision=revision+1; END`),
]
