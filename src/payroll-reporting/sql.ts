// Shared current-source tests are also used by retention. Historical evidence is never silently current.
export const closureCurrentSql = (alias: string) => `EXISTS (SELECT 1 FROM payroll_runs r WHERE r.company_id = ${alias}.company_id AND r.period = ${alias}.period AND r.closed_at IS NOT NULL AND r.evidence_id = ${alias}.id AND r.lines = ${alias}.lines AND r.payday = ${alias}.payday)`
export const targetActiveSql = (alias: string, reviewed = false): string => `(${alias}.kind = 'tax'${reviewed ? ` AND NOT (${retiredTaxSql(alias)})` : ''} OR EXISTS (SELECT 1 FROM payroll_closures pc WHERE pc.id = ${alias}.closure_id AND pc.company_id = ${alias}.company_id AND (${closureCurrentSql('pc')})))`
export const latestPayoutSql = (alias: string) => `NOT EXISTS (SELECT 1 FROM payroll_payouts later WHERE later.closure_id = ${alias}.closure_id AND later.revision > ${alias}.revision)`
export const sourceRowsSql = (target: string, reviewed = false) => `SELECT pc.id, pc.sha256, pp.id AS payout_id, pp.paid_on, pp.revision${reviewed ? ', pp.report_period' : ''} FROM payroll_closures pc
  JOIN payroll_payouts pp ON pp.closure_id = pc.id AND pp.company_id = pc.company_id
  WHERE pc.company_id = ${target}.company_id AND ${reviewed ? 'pp.report_period' : 'substr(pp.paid_on, 1, 7)'} = ${target}.period
    AND (${closureCurrentSql('pc')}) AND (${latestPayoutSql('pp')}) ORDER BY pc.id`
// Hashes are checked in application code; SQL conservatively catches changes in exact coverage identities as well.
export const coverageJsonSql = (target: string, reviewed = false): string => `(SELECT COALESCE(json_group_array(json_object('id', s.id, 'sha256', s.sha256, 'payout_id', s.payout_id, 'paid_on', s.paid_on, 'revision', s.revision${reviewed ? ", 'report_period', s.report_period" : ''})), '[]') FROM (${sourceRowsSql(target, reviewed)}) s)`
export const reportCurrentSql = (target: string, pkg: string, reviewed = false) => `(${pkg}.id IS NOT NULL AND CASE WHEN ${target}.kind = 'tax'
  THEN ${pkg}.source_json = ${coverageJsonSql(target, reviewed)} ELSE EXISTS (SELECT 1 FROM payroll_closures pc WHERE pc.id = ${target}.closure_id AND pc.sha256 = ${pkg}.source_hash AND (${closureCurrentSql('pc')})) END)`
export const pendingPayrollSql = (company: string, reviewed = false) => `(EXISTS (SELECT 1 FROM payroll_targets pt LEFT JOIN payroll_packages pp ON pp.id = pt.package_id AND pp.company_id = pt.company_id
  WHERE pt.company_id = ${company} AND (${targetActiveSql('pt', reviewed)}) AND (pp.status IS NOT 'accepted' OR NOT (${reportCurrentSql('pt', 'pp', reviewed)})))
  OR EXISTS (SELECT 1 FROM payroll_closures pc WHERE pc.company_id = ${company} AND (${closureCurrentSql('pc')})
    AND (SELECT COALESCE(SUM(json_extract(value, '$.gross')), 0) FROM json_each(pc.lines)) > 0
    AND NOT EXISTS (SELECT 1 FROM payroll_payouts pp WHERE pp.closure_id = pc.id${reviewed ? ` AND pp.report_period IS NOT NULL AND (${latestPayoutSql('pp')})` : ''})))`

export const payrollStatusSql = (target: string, pkg: string, reviewed = false) => `CASE WHEN ${pkg}.id IS NULL OR NOT (${reportCurrentSql(target, pkg, reviewed)}) THEN 'unverified' ELSE ${pkg}.status END`
const visible = `c.closed_at IS NULL AND c.demo = 0 AND (?1 = 'admin' OR c.accountant_id = ?2)`
export const payrollQueueSql = `SELECT t.id, t.company_id, c.name AS company_name, t.period, ${payrollStatusSql('t', 'p', true)} AS status, t.created_at,
  NULL AS kind, CASE t.kind WHEN 'sp' THEN 'Mesačný výkaz – Sociálna poisťovňa' WHEN 'health24' THEN 'Mesačný výkaz – Dôvera' WHEN 'health25' THEN 'Mesačný výkaz – VšZP' WHEN 'health27' THEN 'Mesačný výkaz – Union' ELSE 'Mesačný prehľad – Finančná správa' END AS label,
  '/ucto/klienti/' || c.id || '/mzdove-podania/' || t.id AS href
  FROM payroll_targets t JOIN companies c ON c.id = t.company_id LEFT JOIN payroll_packages p ON p.id = t.package_id AND p.company_id = t.company_id
  WHERE ${visible} AND (${targetActiveSql('t', true)}) AND (p.status IS NOT 'accepted' OR NOT (${reportCurrentSql('t', 'p', true)}))
  UNION ALL SELECT 'payroll-' || r.period || '-' || c.id, c.id, c.name, r.period, 'unverified', r.closed_at, NULL,
    CASE WHEN pc.id IS NULL THEN 'Založiť evidenciu mzdových podaní' ELSE 'Overiť výplatu a obdobie prehľadu FS' END,
    '/ucto/klienti/' || c.id || '/mzdove-podania?obdobie=' || r.period
    FROM payroll_runs r JOIN companies c ON c.id = r.company_id LEFT JOIN payroll_closures pc ON pc.id = r.evidence_id AND (${closureCurrentSql('pc')})
    WHERE ${visible} AND r.closed_at IS NOT NULL AND (pc.id IS NULL OR ((SELECT COALESCE(SUM(json_extract(value, '$.gross')), 0) FROM json_each(pc.lines)) > 0 AND NOT EXISTS (SELECT 1 FROM payroll_payouts cp WHERE cp.closure_id = pc.id AND cp.report_period IS NOT NULL AND (${latestPayoutSql('cp')}))))`
export const payrollRunProtectedSql = (closure: string) => `EXISTS (SELECT 1 FROM payroll_targets t JOIN payroll_packages p ON p.target_id = t.id WHERE t.closure_id = ${closure} AND p.status IN ('submitted', 'accepted', 'review')) OR EXISTS (SELECT 1 FROM payroll_payouts WHERE closure_id = ${closure})`

// Schema 19 keeps the original helpers' default SQL; runtime and schema 20 require explicit period review.
export function unknownLegacyPeriodSql(target: string): string { return `EXISTS (SELECT 1 FROM payroll_payouts lp JOIN payroll_closures lc ON lc.id = lp.closure_id
  WHERE lp.company_id = ${target}.company_id AND lp.report_period IS NULL AND substr(lp.paid_on, 1, 7) = ${target}.period
    AND (${latestPayoutSql('lp')}) AND (${closureCurrentSql('lc')}))` }
export function retiredTaxSql(target: string): string { return `EXISTS (SELECT 1 FROM payroll_target_reviews tr WHERE tr.target_id = ${target}.id AND tr.company_id = ${target}.company_id
  AND tr.source_json = ${coverageJsonSql(target, true)} AND tr.source_json = '[]' AND tr.scope_json = ${targetReviewScopeSql(target)} AND NOT (${unknownLegacyPeriodSql(target)}))` }
// Include historical assignments: returning to an empty set must not revive an old resolution.
// Package revisions also invalidate it when late external evidence arrives for a historical version.
export function targetReviewScopeSql(target: string): string { return `json_object('payouts',
  (SELECT COALESCE(json_group_array(s.id), '[]') FROM (SELECT rp.id FROM payroll_payouts rp WHERE rp.company_id = ${target}.company_id
    AND (rp.report_period = ${target}.period OR rp.report_period IS NULL AND substr(rp.paid_on, 1, 7) = ${target}.period) ORDER BY rp.id) s),
  'packages', (SELECT COALESCE(json_group_array(json_object('id', s.id, 'revision', s.revision)), '[]') FROM
    (SELECT p.id, p.revision FROM payroll_packages p WHERE p.target_id = ${target}.id AND p.company_id = ${target}.company_id ORDER BY p.id) s))` }
export const currentTargetActiveSql = (t: string) => targetActiveSql(t, true)
export const currentCoverageJsonSql = (t: string) => coverageJsonSql(t, true)
export const currentReportSql = (t: string, p: string) => reportCurrentSql(t, p, true)
export const currentPendingPayrollSql = (c: string) => pendingPayrollSql(c, true)
export const currentPayrollStatusSql = (t: string, p: string) => payrollStatusSql(t, p, true)
