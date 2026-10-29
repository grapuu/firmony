// Schema step 91 (29 October 2026): the identification the designated person verified in person at a meeting
// (in-person.ts), append only and kept as long as the rest of the dossier.
import { officerSql } from './constants'
import { dossierOpenSql, retainedSql } from './policy-schema'

export const AML_IN_PERSON_SCHEMA: string[] = [
  `CREATE TABLE aml_in_person (id INTEGER PRIMARY KEY AUTOINCREMENT, dossier_id TEXT NOT NULL REFERENCES aml_dossiers(id),
    verified_at INTEGER NOT NULL, verified_by TEXT NOT NULL, facts_hash TEXT NOT NULL CHECK(length(facts_hash) = 64),
    front_key TEXT NOT NULL UNIQUE, front_type TEXT NOT NULL, front_sha256 TEXT NOT NULL CHECK(length(front_sha256) = 64), front_bytes INTEGER NOT NULL CHECK(front_bytes > 0),
    back_key TEXT UNIQUE, back_type TEXT, back_sha256 TEXT CHECK(back_sha256 IS NULL OR length(back_sha256) = 64), back_bytes INTEGER,
    note TEXT NOT NULL CHECK(length(note) >= 12), CHECK((back_key IS NULL) = (back_sha256 IS NULL)))`,
  'CREATE INDEX aml_in_person_dossier ON aml_in_person (dossier_id, id DESC)',
  `CREATE TRIGGER aml_in_person_insert BEFORE INSERT ON aml_in_person WHEN NOT (${officerSql('NEW.verified_by')})
    OR NOT ${dossierOpenSql('NEW.dossier_id')}
    OR NOT EXISTS (SELECT 1 FROM aml_dossiers d WHERE d.id = NEW.dossier_id AND d.facts_hash = NEW.facts_hash)
    BEGIN SELECT RAISE(ABORT, 'AML identification is stale or not authorized'); END`,
  `CREATE TRIGGER aml_in_person_immutable BEFORE UPDATE ON aml_in_person BEGIN SELECT RAISE(ABORT, 'AML records are append only'); END`,
  `CREATE TRIGGER aml_in_person_retained BEFORE DELETE ON aml_in_person WHEN ${retainedSql('OLD.dossier_id')}
    BEGIN SELECT RAISE(ABORT, 'AML retention prevents deletion'); END`,
]
