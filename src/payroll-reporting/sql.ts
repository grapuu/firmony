// Shared current-source tests are also used by retention. Historical evidence is never silently current.
export const closureCurrentSql = (alias: string) => `EXISTS (SELECT 1 FROM payroll_runs r WHERE r.company_id = ${alias}.company_id AND r.period = ${alias}.period AND r.closed_at IS NOT NULL AND r.evidence_id = ${alias}.id AND r.lines = ${alias}.lines AND r.payday = ${alias}.payday)`
export const targetActiveSql = (alias: string) => `(${alias}.kind = 'tax' OR EXISTS (SELECT 1 FROM payroll_closures pc WHERE pc.id = ${alias}.closure_id AND pc.company_id = ${alias}.company_id AND (${closureCurrentSql('pc')})))`
export const latestPayoutSql = (alias: string) => `NOT EXISTS (SELECT 1 FROM payroll_payouts later WHERE later.closure_id = ${alias}.closure_id AND later.revision > ${alias}.revision)`
export const sourceRowsSql = (target: string) => `SELECT pc.id, pc.sha256, pp.id AS payout_id, pp.paid_on, pp.revision FROM payroll_closures pc
  JOIN payroll_payouts pp ON pp.closure_id = pc.id AND pp.company_id = pc.company_id
  WHERE pc.company_id = ${target}.company_id AND substr(pp.paid_on, 1, 7) = ${target}.period
    AND (${closureCurrentSql('pc')}) AND (${latestPayoutSql('pp')}) ORDER BY pc.id`
// Hashes are checked in application code; SQL conservatively catches changes in exact coverage identities as well.
export const coverageJsonSql = (target: string) => `(SELECT COALESCE(json_group_array(json_object('id', s.id, 'sha256', s.sha256, 'payout_id', s.payout_id, 'paid_on', s.paid_on, 'revision', s.revision)), '[]') FROM (${sourceRowsSql(target)}) s)`
export const reportCurrentSql = (target: string, pkg: string) => `(${pkg}.id IS NOT NULL AND CASE WHEN ${target}.kind = 'tax'
  THEN ${pkg}.source_json = ${coverageJsonSql(target)} ELSE EXISTS (SELECT 1 FROM payroll_closures pc WHERE pc.id = ${target}.closure_id AND pc.sha256 = ${pkg}.source_hash AND (${closureCurrentSql('pc')})) END)`
export const pendingPayrollSql = (company: string) => `(EXISTS (SELECT 1 FROM payroll_targets pt LEFT JOIN payroll_packages pp ON pp.id = pt.package_id AND pp.company_id = pt.company_id
  WHERE pt.company_id = ${company} AND (${targetActiveSql('pt')}) AND (pp.status IS NOT 'accepted' OR NOT (${reportCurrentSql('pt', 'pp')})))
  OR EXISTS (SELECT 1 FROM payroll_closures pc WHERE pc.company_id = ${company} AND (${closureCurrentSql('pc')})
    AND (SELECT COALESCE(SUM(json_extract(value, '$.gross')), 0) FROM json_each(pc.lines)) > 0
    AND NOT EXISTS (SELECT 1 FROM payroll_payouts pp WHERE pp.closure_id = pc.id)))`

export const payrollStatusSql = (target: string, pkg: string) => `CASE WHEN ${pkg}.id IS NULL OR NOT (${reportCurrentSql(target, pkg)}) THEN 'unverified' ELSE ${pkg}.status END`
const visible = `c.closed_at IS NULL AND c.demo = 0 AND (?1 = 'admin' OR c.accountant_id = ?2)`
export const payrollQueueSql = `SELECT t.id, t.company_id, c.name AS company_name, t.period, ${payrollStatusSql('t', 'p')} AS status, t.created_at,
  NULL AS kind, CASE t.kind WHEN 'sp' THEN 'Mesačný výkaz – Sociálna poisťovňa' WHEN 'health24' THEN 'Mesačný výkaz – Dôvera' WHEN 'health25' THEN 'Mesačný výkaz – VšZP' WHEN 'health27' THEN 'Mesačný výkaz – Union' ELSE 'Mesačný prehľad – Finančná správa' END AS label,
  '/ucto/klienti/' || c.id || '/mzdove-podania/' || t.id AS href
  FROM payroll_targets t JOIN companies c ON c.id = t.company_id LEFT JOIN payroll_packages p ON p.id = t.package_id AND p.company_id = t.company_id
  WHERE ${visible} AND (${targetActiveSql('t')}) AND (p.status IS NOT 'accepted' OR NOT (${reportCurrentSql('t', 'p')}))
  UNION ALL SELECT 'payroll-' || r.period || '-' || c.id, c.id, c.name, r.period, 'unverified', r.closed_at, NULL,
    CASE WHEN pc.id IS NULL THEN 'Založiť evidenciu mzdových podaní' ELSE 'Overiť skutočné vyplatenie príjmov' END,
    '/ucto/klienti/' || c.id || '/mzdove-podania?obdobie=' || r.period
    FROM payroll_runs r JOIN companies c ON c.id = r.company_id LEFT JOIN payroll_closures pc ON pc.id = r.evidence_id AND (${closureCurrentSql('pc')})
    WHERE ${visible} AND r.closed_at IS NOT NULL AND (pc.id IS NULL OR ((SELECT COALESCE(SUM(json_extract(value, '$.gross')), 0) FROM json_each(pc.lines)) > 0 AND NOT EXISTS (SELECT 1 FROM payroll_payouts cp WHERE cp.closure_id = pc.id)))`
export const payrollRunProtectedSql = (closure: string) => `EXISTS (SELECT 1 FROM payroll_targets t JOIN payroll_packages p ON p.target_id = t.id WHERE t.closure_id = ${closure} AND p.status IN ('submitted', 'accepted', 'review')) OR EXISTS (SELECT 1 FROM payroll_payouts WHERE closure_id = ${closure})`
