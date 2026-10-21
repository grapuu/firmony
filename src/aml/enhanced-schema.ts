import { AML_TODAY_SQL } from './retention'
import { bankCurrentSql } from './enhanced-model'
// Programme 4.6(f), original law: https://static.slov-lex.sk/static/SK/ZZ/2008/297/20260817.html
export const AML_ENHANCED_SCHEMA = [
  `CREATE TABLE aml_bank_evidence (id TEXT PRIMARY KEY,dossier_id TEXT NOT NULL REFERENCES aml_dossiers(id),created_at INTEGER NOT NULL,created_by TEXT,token_hash TEXT,
    account_key TEXT NOT NULL UNIQUE,account_sha256 TEXT NOT NULL CHECK(length(account_sha256)=64),account_bytes INTEGER NOT NULL CHECK(account_bytes>0),
    payment_key TEXT NOT NULL UNIQUE,payment_sha256 TEXT NOT NULL CHECK(length(payment_sha256)=64),payment_bytes INTEGER NOT NULL CHECK(payment_bytes>0))`,
  `CREATE TRIGGER aml_bank_evidence_insert BEFORE INSERT ON aml_bank_evidence WHEN NOT EXISTS (
    SELECT 1 FROM aml_dossiers d LEFT JOIN orders o ON o.id=d.order_id LEFT JOIN companies c ON c.id=COALESCE(d.company_id,o.company_id)
    LEFT JOIN users u ON u.id=NEW.created_by WHERE d.id=NEW.dossier_id AND
    (c.id IS NULL AND o.status='open' AND o.expires_at>unixepoch() AND (NEW.created_by IS NULL AND NEW.token_hash=o.token OR u.team='admin')
      OR c.id IS NOT NULL AND c.closed_at IS NULL AND (c.ends_on IS NULL OR date(c.ends_on,'+90 days') >= ${AML_TODAY_SQL})
      AND (u.team='admin' OR u.team='accountant' AND c.accountant_id=u.id OR EXISTS (SELECT 1 FROM members m WHERE m.company_id=c.id AND m.user_id=u.id AND m.role='owner'))))
    BEGIN SELECT RAISE(ABORT,'Bank evidence is not authorized'); END`,
  `CREATE TRIGGER aml_bank_evidence_immutable BEFORE UPDATE ON aml_bank_evidence BEGIN SELECT RAISE(ABORT,'Bank evidence is append only'); END`,
  `CREATE TRIGGER aml_bank_evidence_retained BEFORE DELETE ON aml_bank_evidence WHEN NOT EXISTS (
    SELECT 1 FROM aml_dossiers d LEFT JOIN orders o ON o.id=d.order_id LEFT JOIN companies c ON c.id=COALESCE(d.company_id,o.company_id)
    WHERE d.id=OLD.dossier_id AND (c.records_delete_started_at IS NOT NULL OR c.id IS NULL AND o.aml_delete_started_at IS NOT NULL))
    BEGIN SELECT RAISE(ABORT,'Bank evidence is retained'); END`,
  `CREATE TRIGGER aml_decisions_bank BEFORE INSERT ON aml_decisions WHEN NEW.decision='approved' AND NEW.level='high'
    AND NOT EXISTS (SELECT 1 FROM aml_dossiers d WHERE d.id=NEW.dossier_id AND ${bankCurrentSql('d','NEW')})
    BEGIN SELECT RAISE(ABORT,'High risk requires verified EU account and first payment'); END`,
]
