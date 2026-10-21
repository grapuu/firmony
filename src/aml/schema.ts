import { AML_TODAY_SQL } from './retention'
// Additive AML admission controls. Existing migrations remain byte for byte unchanged.
// Primary law read on 21 October 2026: https://static.slov-lex.sk/static/SK/ZZ/2008/297/20260817.html
// §§ 7, 8(1)(f),(2), 10, 12, 18, 19 and 20; operational policy: docs/aml/program.html.
import { AML_CHECK_KINDS, CURRENT_OFFICER_SQL, officerSql } from './constants'
import { checksCurrentSql, riskFloorSql } from './model'
export { AML_CHECK_KINDS, CURRENT_OFFICER_SQL, officerSql } from './constants'

export const AML_SCHEMA: string[] = [
  'ALTER TABLE companies ADD COLUMN aml_dossier_id TEXT',
  'ALTER TABLE orders ADD COLUMN aml_paper INTEGER NOT NULL DEFAULT 0',
  `CREATE TABLE aml_officers (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL,
    appointed_at INTEGER NOT NULL, appointed_by TEXT NOT NULL, reason TEXT NOT NULL CHECK(length(reason) >= 12))`,
  `CREATE TABLE aml_dossiers (id TEXT NOT NULL UNIQUE, sequence INTEGER PRIMARY KEY AUTOINCREMENT, order_id TEXT REFERENCES orders(id),
    company_id TEXT REFERENCES companies(id), declaration_id TEXT NOT NULL, order_token_hash TEXT, created_at INTEGER NOT NULL, created_by TEXT,
    declaration TEXT NOT NULL CHECK(json_valid(declaration)), company_facts TEXT NOT NULL CHECK(json_valid(company_facts)), signer_name TEXT NOT NULL, facts_hash TEXT NOT NULL CHECK(length(facts_hash) = 64),
    file_key TEXT NOT NULL UNIQUE, file_name TEXT NOT NULL, file_type TEXT NOT NULL CHECK(file_type IN ('pdf','asice')),
    file_sha256 TEXT NOT NULL CHECK(length(file_sha256) = 64), file_bytes INTEGER NOT NULL CHECK(file_bytes > 0),
    required_risk TEXT NOT NULL CHECK(required_risk IN ('low','standard','high')), policy_version TEXT NOT NULL,
    CHECK((order_id IS NULL) <> (company_id IS NULL)))`,
  'CREATE INDEX aml_dossiers_order ON aml_dossiers (order_id, sequence DESC)',
  'CREATE INDEX aml_dossiers_company ON aml_dossiers (company_id, sequence DESC)',
  `CREATE TABLE aml_checks (id INTEGER PRIMARY KEY AUTOINCREMENT, dossier_id TEXT NOT NULL REFERENCES aml_dossiers(id),
    kind TEXT NOT NULL CHECK(kind IN ('identity','kuv','pep','eu-sanctions','un-sanctions','countries')),
    result TEXT NOT NULL CHECK(result IN ('clear','high','match','unresolved')), checked_at INTEGER NOT NULL,
    checked_by TEXT NOT NULL, source TEXT NOT NULL CHECK(length(source) >= 12), subject_name TEXT, facts_hash TEXT NOT NULL)`,
  'CREATE INDEX aml_checks_latest ON aml_checks (dossier_id, kind, id DESC)',
  `CREATE TABLE aml_decisions (id INTEGER PRIMARY KEY AUTOINCREMENT, dossier_id TEXT NOT NULL REFERENCES aml_dossiers(id),
    decided_at INTEGER NOT NULL, decided_by TEXT NOT NULL, decision TEXT NOT NULL CHECK(decision IN ('approved','hold')),
    level TEXT NOT NULL CHECK(level IN ('low','standard','high')), note TEXT NOT NULL CHECK(length(note) >= 12),
    bank_id TEXT, bank_iban TEXT, bank_country TEXT, bank_owner TEXT, bank_payment_ref TEXT,
    enhanced_source TEXT, nonce TEXT NOT NULL UNIQUE, checks TEXT NOT NULL CHECK(json_valid(checks)), facts_hash TEXT NOT NULL, policy_version TEXT NOT NULL,
    CHECK(decision <> 'approved' OR level <> 'high' OR COALESCE(length(enhanced_source),0) >= 12))`,
  'CREATE INDEX aml_decisions_latest ON aml_decisions (dossier_id, id DESC)',
  `INSERT INTO aml_officers (user_id, appointed_at, appointed_by, reason)
    SELECT e.user_id, e.at, e.user_id, 'Prvý správca podľa programu vlastnej činnosti'
    FROM events e JOIN users u ON u.id = e.user_id WHERE e.action = 'team.bootstrap' AND u.team = 'admin'
    ORDER BY e.at, e.id LIMIT 1`,
  `CREATE TRIGGER aml_officers_insert BEFORE INSERT ON aml_officers WHEN
    NOT EXISTS (SELECT 1 FROM users WHERE id = NEW.user_id AND team = 'admin') OR
    (EXISTS (SELECT 1 FROM aml_officers) AND NOT (${officerSql('NEW.appointed_by')})) OR
    (NOT EXISTS (SELECT 1 FROM aml_officers) AND NEW.appointed_by <>
      COALESCE((SELECT user_id FROM events WHERE action = 'team.bootstrap' ORDER BY at, id LIMIT 1), ''))
    BEGIN SELECT RAISE(ABORT, 'AML appointment is not authorized'); END`,
  `CREATE TRIGGER aml_dossiers_insert BEFORE INSERT ON aml_dossiers WHEN COALESCE(json_extract(NEW.declaration,'$.version'),0) <> 2 OR NOT (
    NEW.order_id IS NOT NULL AND EXISTS (SELECT 1 FROM orders o WHERE o.id = NEW.order_id AND o.status = 'open'
      AND o.expires_at > unixepoch() AND o.token = NEW.order_token_hash)
    OR NEW.company_id IS NOT NULL AND EXISTS (SELECT 1 FROM companies c JOIN users u ON u.id = NEW.created_by
      JOIN declarations q ON q.id = NEW.declaration_id AND q.company_id = c.id WHERE c.id = NEW.company_id AND c.closed_at IS NULL
      AND (c.ends_on IS NULL OR date(c.ends_on,'+90 days') >= ${AML_TODAY_SQL}) AND q.data = NEW.declaration
      AND q.id = (SELECT id FROM declarations WHERE company_id = c.id ORDER BY created_at DESC,rowid DESC LIMIT 1)
      AND (u.team = 'admin' OR u.team = 'accountant' AND c.accountant_id = u.id OR EXISTS
        (SELECT 1 FROM members m WHERE m.company_id = c.id AND m.user_id = u.id AND m.role = 'owner'))))
    BEGIN SELECT RAISE(ABORT, 'AML intake is stale or not authorized'); END`,
  `CREATE TRIGGER aml_checks_insert BEFORE INSERT ON aml_checks WHEN NOT EXISTS (
    SELECT 1 FROM aml_dossiers d JOIN users u ON u.id = NEW.checked_by
    LEFT JOIN companies c ON c.id = COALESCE(d.company_id,(SELECT company_id FROM orders WHERE id = d.order_id))
    WHERE d.id = NEW.dossier_id AND d.facts_hash = NEW.facts_hash AND u.team IN ('admin','accountant')
      AND (d.order_id IS NOT NULL AND u.team = 'admin' AND EXISTS (SELECT 1 FROM orders o WHERE o.id = d.order_id AND o.status = 'open' AND o.expires_at > unixepoch())
        OR c.id IS NOT NULL AND c.closed_at IS NULL AND (c.ends_on IS NULL OR date(c.ends_on,'+90 days') >= ${AML_TODAY_SQL})
        AND (u.team = 'admin' OR c.accountant_id = u.id)))
    BEGIN SELECT RAISE(ABORT, 'AML check is stale or not authorized'); END`,
  `CREATE TRIGGER aml_decisions_insert BEFORE INSERT ON aml_decisions WHEN NOT (${officerSql('NEW.decided_by')})
    OR NOT EXISTS (SELECT 1 FROM aml_dossiers d LEFT JOIN orders ao ON ao.id = d.order_id LEFT JOIN companies ac ON ac.id = COALESCE(d.company_id,ao.company_id) WHERE d.id = NEW.dossier_id
      AND (ao.company_id IS NULL AND d.order_id IS NOT NULL AND ao.status = 'open' AND ao.expires_at > unixepoch()
        AND d.sequence = (SELECT MAX(sequence) FROM aml_dossiers WHERE order_id = d.order_id)
        OR ac.id IS NOT NULL AND ac.closed_at IS NULL AND (ac.ends_on IS NULL OR date(ac.ends_on,'+90 days') >= ${AML_TODAY_SQL})
        AND d.declaration_id = (SELECT id FROM declarations WHERE company_id = ac.id ORDER BY created_at DESC,rowid DESC LIMIT 1))
      AND d.facts_hash = NEW.facts_hash AND d.policy_version = NEW.policy_version
      AND (NEW.decision = 'hold' OR (${checksCurrentSql('NEW.dossier_id','NEW.checks','NEW.facts_hash')} AND ${riskFloorSql('d','NEW.level')})))
    BEGIN SELECT RAISE(ABORT, 'AML decision is stale or not authorized'); END`,
  ...['aml_officers', 'aml_dossiers', 'aml_checks', 'aml_decisions'].map((table) =>
    `CREATE TRIGGER ${table}_immutable BEFORE UPDATE ON ${table} BEGIN SELECT RAISE(ABORT, 'AML records are append only'); END`),
]
