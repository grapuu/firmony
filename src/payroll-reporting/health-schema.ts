import { PAYROLL_REVIEW_SCHEMA } from './review-schema'
import { currentPendingPayrollSql, currentReportSql, healthIdentityCoverageSql, healthInsuredCoverageSql, healthPendingPayrollSql, healthReportCurrentSql } from './sql'

const authority = (co: string, by: string) => `EXISTS (SELECT 1 FROM users u JOIN companies c ON c.id = ${co} WHERE u.id = ${by} AND (u.team = 'admin' OR u.team = 'accountant' AND c.accountant_id = u.id))`
const held = (co: string) => `EXISTS (SELECT 1 FROM evidence_holds WHERE company_id = ${co} AND released_at IS NULL) OR EXISTS (SELECT 1 FROM incidents WHERE company_id = ${co} AND closed_at IS NULL)`
function replaceGuard(name: string, from: string, to: string): string[] {
  const old = PAYROLL_REVIEW_SCHEMA.find((s)=>s.startsWith(`CREATE TRIGGER ${name} `))
  if (!old?.includes(from)) throw new Error(`Missing version-20 payroll guard: ${name}`)
  return [`DROP TRIGGER ${name}`,old.replaceAll(from,to)]
}
export const PAYROLL_HEALTH_SCHEMA = [
  `CREATE TABLE payroll_health_ids (
    id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(id), employee_id TEXT NOT NULL,
    revision INTEGER NOT NULL CHECK (revision > 0), identifier TEXT NOT NULL CHECK (length(identifier) BETWEEN 9 AND 10 AND identifier NOT GLOB '*[^0-9]*'),
    reference TEXT NOT NULL CHECK (length(reference) >= 12), reason TEXT NOT NULL, at INTEGER NOT NULL, by_user TEXT NOT NULL,
    UNIQUE(company_id, employee_id, revision)
  )`,
  `CREATE TABLE payroll_health_generations (
    package_id TEXT PRIMARY KEY REFERENCES payroll_packages(id), company_id TEXT NOT NULL REFERENCES companies(id),
    format TEXT NOT NULL CHECK (format = 'ZP514-TXT-2026'), identities_json TEXT NOT NULL CHECK (json_valid(identities_json)),
    details TEXT NOT NULL CHECK (json_valid(details)), sha256 TEXT NOT NULL CHECK (length(sha256) = 64), at INTEGER NOT NULL, by_user TEXT NOT NULL
  )`,
  `CREATE TRIGGER payroll_health_ids_create BEFORE INSERT ON payroll_health_ids WHEN NOT (${authority('NEW.company_id','NEW.by_user')})
    OR NOT EXISTS (SELECT 1 FROM employees WHERE id = NEW.employee_id AND company_id = NEW.company_id)
    OR NEW.revision <> 1 + COALESCE((SELECT MAX(revision) FROM payroll_health_ids WHERE company_id = NEW.company_id AND employee_id = NEW.employee_id), 0)
    OR (NEW.revision > 1 AND (length(NEW.reason) < 12 OR NOT EXISTS (SELECT 1 FROM users WHERE id = NEW.by_user AND team = 'admin')))
    BEGIN SELECT RAISE(ABORT, 'FIRMONY_PAYROLL_AUTHORITY'); END`,
  `CREATE TRIGGER payroll_health_generations_create BEFORE INSERT ON payroll_health_generations WHEN NOT (${authority('NEW.company_id','NEW.by_user')})
    OR NOT EXISTS (SELECT 1 FROM payroll_packages p JOIN payroll_targets t ON t.id = p.target_id WHERE p.id = NEW.package_id AND p.company_id = NEW.company_id
      AND p.created_by = NEW.by_user AND p.status = 'prepared' AND p.revision = 0 AND p.previous_id IS t.package_id AND t.kind IN ('health24','health25','health27')
      AND NEW.identities_json = ${healthIdentityCoverageSql('t')} AND json_array_length(NEW.identities_json) > 0
      AND NOT EXISTS (SELECT 1 FROM json_each(NEW.identities_json) WHERE json_extract(value, '$.identity') IS NULL)
      AND json_extract(NEW.details, '$.version') = 1 AND json_extract(NEW.details, '$.fileSha256') = p.sha256 AND json_extract(NEW.details, '$.sourceHash') = p.source_hash)
    BEGIN SELECT RAISE(ABORT, 'FIRMONY_PAYROLL_AUTHORITY'); END`,
  ...replaceGuard('payroll_targets_update',currentReportSql('NEW','p'),healthReportCurrentSql('NEW','p')),
  ...replaceGuard('payroll_packages_create',currentReportSql('t','NEW'),healthReportCurrentSql('t','NEW')),
  ...replaceGuard('payroll_pending_handover',currentPendingPayrollSql('NEW.id'),healthPendingPayrollSql('NEW.id')),
  ...['payroll_health_ids','payroll_health_generations'].flatMap((table)=>[
    `CREATE TRIGGER ${table}_immutable BEFORE UPDATE ON ${table} BEGIN SELECT RAISE(ABORT, 'FIRMONY_PAYROLL_HISTORY'); END`,
    `CREATE TRIGGER ${table}_retain BEFORE DELETE ON ${table} WHEN EXISTS (SELECT 1 FROM companies WHERE id = OLD.company_id AND purge_started_at IS NULL) OR ${held('OLD.company_id')} BEGIN SELECT RAISE(ABORT, 'Evidence hold prevents payroll deletion'); END`,
    `CREATE TRIGGER ${table}_freeze BEFORE INSERT ON ${table} WHEN EXISTS (SELECT 1 FROM companies WHERE id = NEW.company_id AND purge_started_at IS NOT NULL) BEGIN SELECT RAISE(ABORT, 'Company handover is being finalized'); END`,
    ...['INSERT','DELETE'].map((action)=>{const row=action==='INSERT'?'NEW':'OLD';return `CREATE TRIGGER ${table}_revision_${action.toLowerCase()} AFTER ${action} ON ${table} BEGIN INSERT INTO company_data_revisions (company_id, revision) VALUES (${row}.company_id, 1) ON CONFLICT(company_id) DO UPDATE SET revision = revision + 1; END`}),
  ]),
]

/** Schema step 29: a health report's generation covers the people insured with the insurer as employees (healthInsuredCoverageSql). */
export const PAYROLL_HEALTH_COVERAGE_SCHEMA = [
  'DROP TRIGGER payroll_health_generations_create',
  `CREATE TRIGGER payroll_health_generations_create BEFORE INSERT ON payroll_health_generations WHEN NOT (${authority('NEW.company_id','NEW.by_user')})
    OR NOT EXISTS (SELECT 1 FROM payroll_packages p JOIN payroll_targets t ON t.id = p.target_id WHERE p.id = NEW.package_id AND p.company_id = NEW.company_id
      AND p.created_by = NEW.by_user AND p.status = 'prepared' AND p.revision = 0 AND p.previous_id IS t.package_id AND t.kind IN ('health24','health25','health27')
      AND NEW.identities_json = ${healthInsuredCoverageSql('t')} AND json_array_length(NEW.identities_json) > 0
      AND NOT EXISTS (SELECT 1 FROM json_each(NEW.identities_json) WHERE json_extract(value, '$.identity') IS NULL)
      AND json_extract(NEW.details, '$.version') = 1 AND json_extract(NEW.details, '$.fileSha256') = p.sha256 AND json_extract(NEW.details, '$.sourceHash') = p.source_hash)
    BEGIN SELECT RAISE(ABORT, 'FIRMONY_PAYROLL_AUTHORITY'); END`,
]
