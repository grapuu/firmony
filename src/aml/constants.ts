export const CURRENT_OFFICER_SQL = `(SELECT a.user_id FROM aml_officers a JOIN users u ON u.id = a.user_id
  WHERE a.id = (SELECT MAX(id) FROM aml_officers) AND u.team = 'admin')`
export const officerSql = (user: string) => `(${user} = ${CURRENT_OFFICER_SQL})`
export const AML_CHECK_KINDS = ['identity', 'kuv', 'pep', 'eu-sanctions', 'un-sanctions', 'countries'] as const

