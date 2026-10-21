import { localDaySql } from '../app/period-schema'
// Programme 9.1-9.3 and § 19(2)-(4), Act 297/2008, effective 17 August 2026, read 21 October 2026:
// https://static.slov-lex.sk/static/SK/ZZ/2008/297/20260817.html
// Ninety days is the client's access window. It is never the AML erasure deadline.
export const AML_TODAY_SQL = localDaySql('unixepoch()')
const dayFormatter = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Bratislava' })
export const amlToday = () => dayFormatter.format(new Date())
const literal = (day: string) => `'${day.replace(/'/g, "''")}'`
export const accessOpenSql = (c = 'c', day = amlToday()) => `${c}.closed_at IS NULL AND (${c}.ends_on IS NULL OR date(${c}.ends_on, '+90 days') >= ${literal(day)})`
export const archiveDueSql = (c: string, todaySql: string) => `${c}.ends_on IS NOT NULL AND date(${c}.ends_on, '+90 days') < ${todaySql}`
export const retentionExpiredSql = (c: string, todaySql: string) => `${c}.ends_on IS NOT NULL AND date(${c}.ends_on, '+5 years', 'floor') < ${todaySql}`
export function fiveYearsAfter(day: string): string {
  const [y,m,d] = day.split('-').map(Number) as [number,number,number]
  const last = new Date(Date.UTC(y + 5,m,0)).getUTCDate()
  return `${y + 5}-${String(m).padStart(2,'0')}-${String(Math.min(d,last)).padStart(2,'0')}`
}
export const AML_RETENTION_SCHEMA = [
  'ALTER TABLE companies ADD COLUMN aml_archived_at INTEGER',
  'ALTER TABLE requests ADD COLUMN aml_ended_at INTEGER',
  'ALTER TABLE requests ADD COLUMN aml_delete_started_at INTEGER',
  `UPDATE requests SET aml_ended_at = COALESCE((SELECT MAX(at) FROM events e WHERE e.subject = requests.id
    AND e.action = 'request.status' AND json_valid(e.detail) AND json_extract(e.detail,'$.status') = 'declined'), unixepoch()) WHERE status = 'declined'`,
  ...['aml_dossiers','aml_checks','aml_decisions'].map((table) => {
    const dossier = table === 'aml_dossiers' ? 'OLD.id' : 'OLD.dossier_id'
    return `CREATE TRIGGER ${table}_retained BEFORE DELETE ON ${table} WHEN NOT EXISTS (
      SELECT 1 FROM aml_dossiers d LEFT JOIN orders o ON o.id = d.order_id
      LEFT JOIN companies c ON c.id = COALESCE(d.company_id,o.company_id)
      LEFT JOIN requests r ON r.id = o.request_id WHERE d.id = ${dossier} AND
      (c.records_delete_started_at IS NOT NULL AND NOT EXISTS (SELECT 1 FROM evidence_holds h WHERE h.company_id = c.id AND h.released_at IS NULL)
        AND NOT EXISTS (SELECT 1 FROM incidents i WHERE i.company_id = c.id AND i.closed_at IS NULL)
      OR c.id IS NULL AND (r.aml_delete_started_at IS NOT NULL OR o.aml_delete_started_at IS NOT NULL)))
      BEGIN SELECT RAISE(ABORT, 'AML retention prevents deletion'); END`
  }),
  `CREATE TRIGGER aml_officers_retained BEFORE DELETE ON aml_officers BEGIN SELECT RAISE(ABORT, 'AML appointment history is retained'); END`,
  'CREATE UNIQUE INDEX company_aml_admission ON companies (aml_dossier_id) WHERE aml_dossier_id IS NOT NULL',
]
