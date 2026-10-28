// Who takes a new client when nobody chose (his word of 28 October 2026: the firm runs without his attention): the
// accountant with the fewest clients now, the one longest in the team first among equals. None while the team has no
// accountant; the administrator then assigns on the client's page, as before. A subquery, so the choice is made in the
// same statement that writes the client and two clients made at once read the same counts at worst, never a stale id.
export const LEAST_LOADED_ACCOUNTANT_SQL = `SELECT u.id FROM users u WHERE u.team = 'accountant'
  ORDER BY (SELECT COUNT(*) FROM companies c WHERE c.accountant_id = u.id AND c.closed_at IS NULL AND c.demo = 0 AND c.invoicing_only = 0), u.created_at, u.id
  LIMIT 1`

/** The accountant a new client would get now, or null. */
export async function leastLoadedAccountant(db: D1Database): Promise<string | null> {
  const row = await db.prepare(LEAST_LOADED_ACCOUNTANT_SQL).first<{ id: string }>()
  return row?.id ?? null
}
