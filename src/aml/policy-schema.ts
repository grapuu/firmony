import { AML_TODAY_SQL } from './retention'
import { officerSql } from './constants'
import { floorSql, freshChecksSql, placeCurrentSql, previousApprovalSql, requiredRiskSql } from './model'
// Schema step 81 (26 October 2026), additive: the findings of two independent reviews of the AML admission.
// Act 297/2008 as effective from 17 August 2026, read in the original: https://static.slov-lex.sk/static/SK/ZZ/2008/297/20260817.html
// (§ 7(1)(b) the actual place of business, § 10(1)(d) and (g) the ongoing care and its updates, § 19(2) to (4) the five
// years); the programme docs/aml/program.html points 4.2 a), 4.4 c), 4.7, 9.1 and 9.3.

/** Where a dossier may still take a record: the newest of its open order, or of a company whose access is open. */
const dossierOpenSql = (dossier: string) => `EXISTS (SELECT 1 FROM aml_dossiers d LEFT JOIN orders ao ON ao.id = d.order_id
  LEFT JOIN companies ac ON ac.id = COALESCE(d.company_id,ao.company_id) WHERE d.id = ${dossier}
  AND (ao.company_id IS NULL AND d.order_id IS NOT NULL AND ao.status = 'open' AND ao.expires_at > unixepoch()
      AND d.sequence = (SELECT MAX(sequence) FROM aml_dossiers WHERE order_id = d.order_id)
    OR ac.id IS NOT NULL AND ac.closed_at IS NULL AND (ac.ends_on IS NULL OR date(ac.ends_on,'+90 days') >= ${AML_TODAY_SQL})
      AND d.declaration_id = (SELECT id FROM declarations WHERE company_id = ac.id ORDER BY created_at DESC,rowid DESC LIMIT 1)))`
/** The same five-year guard as the other AML records (step 74): deleted only by the purge of the whole record. */
const retainedSql = (dossier: string) => `NOT EXISTS (
  SELECT 1 FROM aml_dossiers d LEFT JOIN orders o ON o.id = d.order_id
  LEFT JOIN companies c ON c.id = COALESCE(d.company_id,o.company_id)
  LEFT JOIN requests r ON r.id = o.request_id WHERE d.id = ${dossier} AND
  (c.records_delete_started_at IS NOT NULL AND NOT EXISTS (SELECT 1 FROM evidence_holds h WHERE h.company_id = c.id AND h.released_at IS NULL)
    AND NOT EXISTS (SELECT 1 FROM incidents i WHERE i.company_id = c.id AND i.closed_at IS NULL)
  OR c.id IS NULL AND (r.aml_delete_started_at IS NOT NULL OR o.aml_delete_started_at IS NOT NULL)))`

export const AML_POLICY_SCHEMA: string[] = [
  // Program 4.4 c): after a change of the lists the designated person re-evaluates the clients concerned. The server
  // works the required risk out of the stored declaration; the dossier and its decisions stay as they were.
  `CREATE TABLE aml_policy_reviews (id INTEGER PRIMARY KEY AUTOINCREMENT, dossier_id TEXT NOT NULL REFERENCES aml_dossiers(id),
    policy_version TEXT NOT NULL, required_risk TEXT NOT NULL CHECK(required_risk IN ('low','standard','high')),
    previous_risk TEXT NOT NULL CHECK(previous_risk IN ('low','standard','high')), reviewed_at INTEGER NOT NULL, reviewed_by TEXT NOT NULL,
    note TEXT NOT NULL CHECK(length(note) >= 12), facts_hash TEXT NOT NULL, UNIQUE (dossier_id, policy_version))`,
  `CREATE TRIGGER aml_policy_reviews_insert BEFORE INSERT ON aml_policy_reviews WHEN NOT (${officerSql('NEW.reviewed_by')})
    OR NOT ${dossierOpenSql('NEW.dossier_id')}
    OR NOT EXISTS (SELECT 1 FROM aml_dossiers d WHERE d.id = NEW.dossier_id AND d.facts_hash = NEW.facts_hash AND d.policy_version <> NEW.policy_version)
    BEGIN SELECT RAISE(ABORT, 'AML re-evaluation is stale or not authorized'); END`,
  // Program 4.2 a): the actual place of business, when it is not the seat, verified from an independent source.
  `CREATE TABLE aml_place_checks (id INTEGER PRIMARY KEY AUTOINCREMENT, dossier_id TEXT NOT NULL REFERENCES aml_dossiers(id),
    result TEXT NOT NULL CHECK(result IN ('clear','match','unresolved')), checked_at INTEGER NOT NULL, checked_by TEXT NOT NULL,
    source TEXT NOT NULL CHECK(length(source) >= 12), facts_hash TEXT NOT NULL)`,
  'CREATE INDEX aml_place_checks_latest ON aml_place_checks (dossier_id, id DESC)',
  `CREATE TRIGGER aml_place_checks_insert BEFORE INSERT ON aml_place_checks WHEN NOT EXISTS (
    SELECT 1 FROM aml_dossiers d JOIN users u ON u.id = NEW.checked_by
    LEFT JOIN companies c ON c.id = COALESCE(d.company_id,(SELECT company_id FROM orders WHERE id = d.order_id))
    WHERE d.id = NEW.dossier_id AND d.facts_hash = NEW.facts_hash AND u.team IN ('admin','accountant')
      AND (d.order_id IS NOT NULL AND u.team = 'admin' AND EXISTS (SELECT 1 FROM orders o WHERE o.id = d.order_id AND o.status = 'open' AND o.expires_at > unixepoch())
        OR c.id IS NOT NULL AND c.closed_at IS NULL AND (c.ends_on IS NULL OR date(c.ends_on,'+90 days') >= ${AML_TODAY_SQL})
        AND (u.team = 'admin' OR c.accountant_id = u.id)))
    BEGIN SELECT RAISE(ABORT, 'AML check is stale or not authorized'); END`,
  ...['aml_policy_reviews', 'aml_place_checks'].flatMap((table) => [
    `CREATE TRIGGER ${table}_immutable BEFORE UPDATE ON ${table} BEGIN SELECT RAISE(ABORT, 'AML records are append only'); END`,
    `CREATE TRIGGER ${table}_retained BEFORE DELETE ON ${table} WHEN ${retainedSql('OLD.dossier_id')}
      BEGIN SELECT RAISE(ABORT, 'AML retention prevents deletion'); END`,
  ]),
  // Approvals since step 81: the place of business when it is not the seat, the floor of the newest re-evaluation, and on a
  // review fresh PEP, sanctions and KUV checks (program 4.7). The checks of step 73 stand beside these.
  `CREATE TRIGGER aml_decisions_place BEFORE INSERT ON aml_decisions WHEN NEW.decision = 'approved'
    AND NOT EXISTS (SELECT 1 FROM aml_dossiers d WHERE d.id = NEW.dossier_id AND ${placeCurrentSql('d', 'NEW.checks')})
    BEGIN SELECT RAISE(ABORT, 'The actual place of business is not verified'); END`,
  `CREATE TRIGGER aml_decisions_policy BEFORE INSERT ON aml_decisions WHEN NEW.decision = 'approved'
    AND NOT EXISTS (SELECT 1 FROM aml_dossiers d WHERE d.id = NEW.dossier_id AND ${floorSql(requiredRiskSql('d'), 'd.id', 'NEW.level')})
    BEGIN SELECT RAISE(ABORT, 'The risk is below the re-evaluated requirement'); END`,
  `CREATE TRIGGER aml_decisions_fresh BEFORE INSERT ON aml_decisions WHEN NEW.decision = 'approved'
    AND NOT EXISTS (SELECT 1 FROM aml_dossiers d WHERE d.id = NEW.dossier_id AND ${freshChecksSql('d', 'NEW.checks', previousApprovalSql('d'))})
    BEGIN SELECT RAISE(ABORT, 'A review needs PEP, sanctions and KUV checks recorded after the previous approval'); END`,
  // Program 9.1 c) and 9.3: who did what stays known for the five years. A member taken out of a company keeps the person
  // row (no sessions, no links) while the company's records are kept; app/purge.ts forgets it only after them.
  `CREATE TABLE member_removals (id INTEGER PRIMARY KEY AUTOINCREMENT, company_id TEXT NOT NULL, user_id TEXT NOT NULL,
    removed_at INTEGER NOT NULL, removed_by TEXT)`,
  'CREATE INDEX member_removals_user ON member_removals (user_id)',
  'CREATE INDEX member_removals_company ON member_removals (company_id)',
  `INSERT INTO member_removals (company_id, user_id, removed_at, removed_by)
    SELECT e.company_id, e.subject, e.at, e.user_id FROM events e WHERE e.action = 'member.removed' AND e.company_id IS NOT NULL
      AND e.subject IN (SELECT id FROM users) AND EXISTS (SELECT 1 FROM companies c WHERE c.id = e.company_id)`,
  // Program 9.1 b): payments a bank brought for an account taken out during the contract are kept, apart from the books,
  // until the company's five years end.
  `CREATE TABLE dropped_payments (id TEXT PRIMARY KEY, company_id TEXT NOT NULL, account_id TEXT NOT NULL, iban TEXT,
    dropped_at INTEGER NOT NULL, dropped_by TEXT, data TEXT NOT NULL CHECK(json_valid(data)))`,
  'CREATE INDEX dropped_payments_company ON dropped_payments (company_id)',
]
