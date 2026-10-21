export const CURRENT_OFFICER_SQL = `(SELECT a.user_id FROM aml_officers a JOIN users u ON u.id = a.user_id
  WHERE a.id = (SELECT MAX(id) FROM aml_officers) AND u.team = 'admin')`
// A missing current officer must deny permission even inside a NOT (...) SQL trigger.
export const officerSql = (user: string) => `COALESCE((${user} = ${CURRENT_OFFICER_SQL}),0)`
export const AML_CHECK_KINDS = ['identity', 'kuv', 'pep', 'eu-sanctions', 'un-sanctions', 'countries'] as const

