export const autoSnapshotSql = (d='d') => `json_object('file',${d}.file_key,'booked',${d}.booked_at,'kind',${d}.kind,'category',${d}.category,
  'party',${d}.party,'ico',${d}.party_ico,'number',${d}.number,'issued',${d}.issued_on,'total',${d}.total_cents,'vat',${d}.vat_cents,'currency',${d}.currency,'vatMode',${d}.vat_mode,'reading',${d}.reading)`
export const autoReviewedSql = (d='d') => `EXISTS (SELECT 1 FROM aml_auto_reviews ar WHERE ar.document_id=${d}.id AND ar.company_id=${d}.company_id AND ar.source=${autoSnapshotSql(d)})`
