import { localDaySql } from '../app/period-schema'
// Pre-contract findings also require confidential handling (§§ 14,15,17,18) and full retention (§ 19).
// https://static.slov-lex.sk/static/SK/ZZ/2008/297/20260817.html, read 21 October 2026.
import { officerSql } from './constants'

export const AML_PROSPECT_SCHEMA = [
  'ALTER TABLE orders ADD COLUMN aml_ended_at INTEGER',
  'ALTER TABLE orders ADD COLUMN aml_purge_started_at INTEGER',
  'ALTER TABLE orders ADD COLUMN aml_delete_started_at INTEGER',
  `CREATE TABLE aml_prospect_reports (id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id),
    created_at INTEGER NOT NULL, created_by TEXT NOT NULL, body TEXT NOT NULL CHECK(length(body) >= 12),
    decided_at INTEGER, decided_by TEXT, decision TEXT CHECK(decision IN ('reported','not')), decision_note TEXT)`,
  'CREATE INDEX aml_prospect_reports_order ON aml_prospect_reports (order_id,created_at)',
  `CREATE TABLE aml_prospect_holds (id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id),
    created_at INTEGER NOT NULL, created_by TEXT NOT NULL, until_on TEXT NOT NULL, file_key TEXT NOT NULL UNIQUE, file_sha256 TEXT NOT NULL, file_bytes INTEGER NOT NULL, reference TEXT NOT NULL CHECK(length(reference) >= 12))`,
  `CREATE TRIGGER aml_prospect_report_insert BEFORE INSERT ON aml_prospect_reports WHEN
    NOT EXISTS (SELECT 1 FROM users WHERE id = NEW.created_by AND team = 'admin') OR
    EXISTS (SELECT 1 FROM orders WHERE id = NEW.order_id AND (company_id IS NOT NULL OR aml_delete_started_at IS NOT NULL)) OR
    (NEW.decided_at IS NOT NULL AND (NEW.decision IS NULL OR NEW.decided_by IS NULL OR COALESCE(length(NEW.decision_note),0) < 12 OR NOT (${officerSql('NEW.decided_by')}))) OR
    (NEW.decided_at IS NULL AND (NEW.decision IS NOT NULL OR NEW.decided_by IS NOT NULL OR NEW.decision_note IS NOT NULL))
    BEGIN SELECT RAISE(ABORT, 'Prospect report is not authorized'); END`,
  `CREATE TRIGGER aml_prospect_report_decision BEFORE UPDATE ON aml_prospect_reports WHEN
    NEW.id IS NOT OLD.id OR NEW.order_id IS NOT OLD.order_id OR NEW.created_at IS NOT OLD.created_at
    OR NEW.created_by IS NOT OLD.created_by OR NEW.body IS NOT OLD.body OR OLD.decided_at IS NOT NULL
    OR NEW.decided_at IS NULL OR NEW.decision IS NULL OR NEW.decision NOT IN ('reported','not') OR COALESCE(length(NEW.decision_note),0) < 12
    OR NOT (${officerSql('NEW.decided_by')})
    BEGIN SELECT RAISE(ABORT, 'Prospect report decision is not authorized'); END`,
  `CREATE TRIGGER aml_prospect_hold_insert BEFORE INSERT ON aml_prospect_holds WHEN NOT (${officerSql('NEW.created_by')})
    OR EXISTS (SELECT 1 FROM orders WHERE id = NEW.order_id AND aml_delete_started_at IS NOT NULL)
    OR NOT EXISTS (SELECT 1 FROM orders o WHERE o.id = NEW.order_id AND o.aml_ended_at IS NOT NULL
      AND NEW.until_on >= date(${localDaySql('o.aml_ended_at')},'+5 years','floor')
      AND NEW.until_on <= date(${localDaySql('o.aml_ended_at')},'+10 years','floor'))
    BEGIN SELECT RAISE(ABORT, 'FSJ retention extension is not authorized'); END`,
  `CREATE TRIGGER aml_prospect_holds_immutable BEFORE UPDATE ON aml_prospect_holds BEGIN SELECT RAISE(ABORT, 'Retention evidence is append only'); END`,
  ...['aml_prospect_reports','aml_prospect_holds'].map((table) => `CREATE TRIGGER ${table}_retained BEFORE DELETE ON ${table}
    WHEN NOT EXISTS (SELECT 1 FROM orders o WHERE o.id = OLD.order_id AND (o.aml_delete_started_at IS NOT NULL OR EXISTS (SELECT 1 FROM companies c WHERE c.id = o.company_id AND c.records_delete_started_at IS NOT NULL)))
    BEGIN SELECT RAISE(ABORT, 'Prospect evidence is retained'); END`),
  `CREATE TRIGGER aml_order_reopened AFTER UPDATE OF expires_at ON orders WHEN NEW.status = 'open' AND NEW.expires_at > unixepoch()
    BEGIN UPDATE orders SET aml_ended_at = NULL, aml_purge_started_at = NULL WHERE id = NEW.id AND aml_delete_started_at IS NULL; UPDATE requests SET aml_ended_at = NULL WHERE id = NEW.request_id AND status <> 'client'; END`,
]
