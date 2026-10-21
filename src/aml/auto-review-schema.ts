import { AML_TODAY_SQL } from './retention'
import { autoSnapshotSql } from './auto-review-model'
// Programme 6.1, original law: https://static.slov-lex.sk/static/SK/ZZ/2008/297/20260817.html
export const AML_AUTO_REVIEW_SCHEMA = [
  `CREATE TABLE aml_auto_reviews (id TEXT PRIMARY KEY,company_id TEXT NOT NULL REFERENCES companies(id),document_id TEXT NOT NULL REFERENCES documents(id),
    booked_at INTEGER NOT NULL,source TEXT NOT NULL CHECK(json_valid(source)),reviewed_at INTEGER NOT NULL,reviewed_by TEXT NOT NULL,note TEXT NOT NULL CHECK(length(note)>=12))`,
  `CREATE INDEX aml_auto_reviews_document ON aml_auto_reviews (document_id,reviewed_at)`,
  `CREATE TRIGGER aml_auto_reviews_insert BEFORE INSERT ON aml_auto_reviews WHEN NOT EXISTS (
    SELECT 1 FROM documents d JOIN companies c ON c.id=d.company_id JOIN users u ON u.id=NEW.reviewed_by WHERE d.id=NEW.document_id
    AND c.id=NEW.company_id AND d.booked_by='auto' AND d.deleted_at IS NULL AND d.booked_at=NEW.booked_at AND ${autoSnapshotSql('d')}=NEW.source
    AND c.closed_at IS NULL AND c.purge_started_at IS NULL AND (c.ends_on IS NULL OR date(c.ends_on,'+90 days')>=${AML_TODAY_SQL})
    AND (u.team='admin' OR u.team='accountant' AND c.accountant_id=u.id)) BEGIN SELECT RAISE(ABORT,'Automatic booking review is not authorized or is stale'); END`,
  `CREATE TRIGGER aml_auto_reviews_immutable BEFORE UPDATE ON aml_auto_reviews BEGIN SELECT RAISE(ABORT,'Professional reviews are append only'); END`,
  `CREATE TRIGGER aml_auto_reviews_retained BEFORE DELETE ON aml_auto_reviews WHEN NOT EXISTS (SELECT 1 FROM companies c WHERE c.id=OLD.company_id
    AND c.purge_delete_started_at IS NOT NULL AND date(c.ends_on,'+5 years','floor')<${AML_TODAY_SQL}
    AND NOT EXISTS(SELECT 1 FROM evidence_holds h WHERE h.company_id=c.id AND h.released_at IS NULL)
    AND NOT EXISTS(SELECT 1 FROM incidents i WHERE i.company_id=c.id AND i.closed_at IS NULL)) BEGIN SELECT RAISE(ABORT,'Professional review is retained'); END`,
]
