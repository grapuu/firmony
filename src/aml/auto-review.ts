// Programme 6.1: every automatically booked document requires a recorded professional review by the end
// of the following month. §§ 10(1)(g),14,19, Act 297/2008, original read 21 October 2026:
// https://static.slov-lex.sk/static/SK/ZZ/2008/297/20260817.html
import { now, sha256Hex } from '../db'
import { autoSnapshotSql,autoReviewedSql } from './auto-review-model'
export { autoSnapshotSql,autoReviewedSql } from './auto-review-model'
export async function recordAutoReview(db:D1Database,company:string,document:string,user:string,hash:string,note:string) {
  const row=await db.prepare(`SELECT ${autoSnapshotSql('d')} AS source FROM documents d WHERE d.id=? AND d.company_id=? AND d.booked_by='auto' AND d.deleted_at IS NULL`).bind(document,company).first<{source:string}>()
  if (!row || note.trim().length<12 || note.length>2000 || await sha256Hex(row.source)!==hash) return false
  const result=await db.prepare(`INSERT INTO aml_auto_reviews(id,company_id,document_id,booked_at,source,reviewed_at,reviewed_by,note)
    SELECT ?1,d.company_id,d.id,d.booked_at,?2,?3,?4,?5 FROM documents d WHERE d.id=?6 AND d.company_id=?7
    AND d.booked_by='auto' AND d.deleted_at IS NULL AND ${autoSnapshotSql('d')}=?2 AND NOT (${autoReviewedSql('d')})`)
    .bind(crypto.randomUUID(),row.source,now(),user,note.trim(),document,company).run()
  return (result.meta.changes??0)>0
}
