import { PAYROLL_HEALTH_SCHEMA } from './health-schema'
import { closureCurrentSql,healthPendingPayrollSql,healthReportCurrentSql,socialCoverageSql,socialPendingPayrollSql,socialReportCurrentSql } from './sql'

const authority=(co:string,by:string)=>`EXISTS (SELECT 1 FROM users u JOIN companies c ON c.id = ${co} WHERE u.id = ${by} AND (u.team = 'admin' OR u.team = 'accountant' AND c.accountant_id = u.id))`
const held=(co:string)=>`EXISTS (SELECT 1 FROM evidence_holds WHERE company_id = ${co} AND released_at IS NULL) OR EXISTS (SELECT 1 FROM incidents WHERE company_id = ${co} AND closed_at IS NULL)`
function replaceGuard(name:string,from:string,to:string):string[] {
  const old=PAYROLL_HEALTH_SCHEMA.find((s)=>s.startsWith(`CREATE TRIGGER ${name} `))
  if (!old?.includes(from)) throw new Error(`Missing version-21 payroll guard: ${name}`)
  return [`DROP TRIGGER ${name}`,old.replaceAll(from,to)]
}
export const PAYROLL_SOCIAL_SCHEMA = [
  `CREATE TABLE payroll_social_relations (
    id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(id), employee_id TEXT NOT NULL,
    revision INTEGER NOT NULL CHECK (revision > 0), icpv TEXT NOT NULL CHECK (length(icpv) = 12 AND icpv NOT GLOB '*[^0-9]*'),
    reference TEXT NOT NULL CHECK (length(reference) BETWEEN 12 AND 240), reason TEXT NOT NULL CHECK (length(reason) <= 1200), at INTEGER NOT NULL, by_user TEXT NOT NULL,
    UNIQUE(company_id, employee_id, revision)
  )`,
  `CREATE TABLE payroll_social_inputs (
    id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(id), closure_id TEXT NOT NULL REFERENCES payroll_closures(id), employee_id TEXT NOT NULL,
    revision INTEGER NOT NULL CHECK (revision > 0), hours_mode TEXT NOT NULL CHECK (hours_mode IN ('known','undetermined')), hours INTEGER NOT NULL,
    reference TEXT NOT NULL CHECK (length(reference) BETWEEN 12 AND 240), reason TEXT NOT NULL CHECK (length(reason) <= 1200), at INTEGER NOT NULL, by_user TEXT NOT NULL,
    CHECK (hours_mode = 'known' AND hours BETWEEN 0 AND 74400 OR hours_mode = 'undetermined' AND hours = 99900 AND length(reason) >= 12),
    UNIQUE(closure_id, employee_id, revision)
  )`,
  `CREATE TABLE payroll_social_generations (
    package_id TEXT PRIMARY KEY REFERENCES payroll_packages(id), company_id TEXT NOT NULL REFERENCES companies(id),
    format TEXT NOT NULL CHECK (format = 'MVPP-v2026'), facts_json TEXT NOT NULL CHECK (json_valid(facts_json)),
    details TEXT NOT NULL CHECK (json_valid(details)), sha256 TEXT NOT NULL CHECK (length(sha256) = 64), at INTEGER NOT NULL, by_user TEXT NOT NULL
  )`,
  `CREATE TRIGGER payroll_social_relations_create BEFORE INSERT ON payroll_social_relations WHEN NOT (${authority('NEW.company_id','NEW.by_user')})
    OR NOT EXISTS (SELECT 1 FROM employees WHERE id = NEW.employee_id AND company_id = NEW.company_id)
    OR NEW.revision <> 1 + COALESCE((SELECT MAX(revision) FROM payroll_social_relations WHERE company_id = NEW.company_id AND employee_id = NEW.employee_id),0)
    OR (NEW.revision > 1 AND (length(NEW.reason) < 12 OR NOT EXISTS (SELECT 1 FROM users WHERE id = NEW.by_user AND team = 'admin')))
    OR EXISTS (SELECT 1 FROM payroll_social_relations r WHERE r.company_id = NEW.company_id AND r.employee_id <> NEW.employee_id AND r.icpv = NEW.icpv
      AND NOT EXISTS (SELECT 1 FROM payroll_social_relations n WHERE n.company_id = r.company_id AND n.employee_id = r.employee_id AND n.revision > r.revision))
    BEGIN SELECT RAISE(ABORT,'FIRMONY_PAYROLL_AUTHORITY'); END`,
  `CREATE TRIGGER payroll_social_inputs_create BEFORE INSERT ON payroll_social_inputs WHEN NOT (${authority('NEW.company_id','NEW.by_user')})
    OR NEW.revision <> 1 + COALESCE((SELECT MAX(revision) FROM payroll_social_inputs WHERE closure_id = NEW.closure_id AND employee_id = NEW.employee_id),0)
    OR (NEW.revision > 1 AND (length(NEW.reason) < 12 OR NOT EXISTS (SELECT 1 FROM users WHERE id = NEW.by_user AND team = 'admin')))
    OR NOT EXISTS (SELECT 1 FROM payroll_closures pc, json_each(pc.lines) l WHERE pc.id = NEW.closure_id AND pc.company_id = NEW.company_id
      AND json_extract(l.value,'$.employeeId') = NEW.employee_id AND (${closureCurrentSql('pc')})
      AND (NEW.hours_mode = 'undetermined' OR NEW.hours <= CAST(strftime('%d',date(pc.period || '-01','+1 month','-1 day')) AS INTEGER) * 2400))
    BEGIN SELECT RAISE(ABORT,'FIRMONY_PAYROLL_AUTHORITY'); END`,
  `CREATE TRIGGER payroll_social_generations_create BEFORE INSERT ON payroll_social_generations WHEN NOT (${authority('NEW.company_id','NEW.by_user')})
    OR NOT EXISTS (SELECT 1 FROM payroll_packages p JOIN payroll_targets t ON t.id = p.target_id WHERE p.id = NEW.package_id AND p.company_id = NEW.company_id
      AND p.created_by = NEW.by_user AND p.status = 'prepared' AND p.revision = 0 AND p.previous_id IS t.package_id AND t.kind = 'sp'
      AND NEW.facts_json = ${socialCoverageSql('t')} AND json_array_length(NEW.facts_json) > 0
      AND NOT EXISTS (SELECT 1 FROM json_each(NEW.facts_json) WHERE json_extract(value,'$.identity') IS NULL OR json_extract(value,'$.relation') IS NULL OR json_extract(value,'$.input') IS NULL)
      AND (NOT EXISTS (SELECT 1 FROM payroll_packages prior WHERE prior.target_id = t.id AND prior.company_id = t.company_id AND prior.status = 'accepted') OR json_extract(NEW.details,'$.input.kind') = 'O')
      AND json_extract(NEW.details,'$.version') = 1 AND json_extract(NEW.details,'$.fileSha256') = p.sha256 AND json_extract(NEW.details,'$.sourceHash') = p.source_hash)
    BEGIN SELECT RAISE(ABORT,'FIRMONY_PAYROLL_AUTHORITY'); END`,
  ...replaceGuard('payroll_targets_update',healthReportCurrentSql('NEW','p'),socialReportCurrentSql('NEW','p')),
  ...replaceGuard('payroll_packages_create',healthReportCurrentSql('t','NEW'),socialReportCurrentSql('t','NEW')),
  ...replaceGuard('payroll_pending_handover',healthPendingPayrollSql('NEW.id'),socialPendingPayrollSql('NEW.id')),
  ...['payroll_social_relations','payroll_social_inputs','payroll_social_generations'].flatMap((table)=>[
    `CREATE TRIGGER ${table}_immutable BEFORE UPDATE ON ${table} BEGIN SELECT RAISE(ABORT,'FIRMONY_PAYROLL_HISTORY'); END`,
    `CREATE TRIGGER ${table}_retain BEFORE DELETE ON ${table} WHEN EXISTS (SELECT 1 FROM companies WHERE id = OLD.company_id AND purge_started_at IS NULL) OR ${held('OLD.company_id')} BEGIN SELECT RAISE(ABORT,'Evidence hold prevents payroll deletion'); END`,
    `CREATE TRIGGER ${table}_freeze BEFORE INSERT ON ${table} WHEN EXISTS (SELECT 1 FROM companies WHERE id = NEW.company_id AND purge_started_at IS NOT NULL) BEGIN SELECT RAISE(ABORT,'Company handover is being finalized'); END`,
    ...['INSERT','DELETE'].map((action)=>{const row=action==='INSERT'?'NEW':'OLD';return `CREATE TRIGGER ${table}_revision_${action.toLowerCase()} AFTER ${action} ON ${table} BEGIN INSERT INTO company_data_revisions(company_id,revision) VALUES(${row}.company_id,1) ON CONFLICT(company_id) DO UPDATE SET revision = revision + 1; END`}),
  ]),
]
