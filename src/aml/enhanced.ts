// Programme 4.6(f), § 12(2)(a)(2), Act 297/2008, original read 21 October 2026:
// https://static.slov-lex.sk/static/SK/ZZ/2008/297/20260817.html
// This records professional verification of originals. An upload alone never proves account ownership or payment.
import { AML_TODAY_SQL } from './retention'
import type { Dossier } from './model'
import { officerSql } from './constants'
import { now } from '../db'

export const EU_COUNTRIES = 'AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE'.split(' ')
export interface BankEvidence { id:string; dossier_id:string; created_at:number; created_by:string|null; account_key:string; account_sha256:string; account_bytes:number; payment_key:string; payment_sha256:string; payment_bytes:number }
export interface BankVerification { id:string; iban:string; country:string; owner:string; reference:string }
export const bankCurrentSql = (d:string,a:string) => `(${a}.level <> 'high' OR EXISTS (SELECT 1 FROM aml_bank_evidence be
  WHERE be.id = ${a}.bank_id AND be.dossier_id = ${d}.id AND be.id = (SELECT id FROM aml_bank_evidence WHERE dossier_id = ${d}.id ORDER BY created_at DESC,rowid DESC LIMIT 1) AND length(${a}.bank_iban) >= 15
  AND ${a}.bank_country IN (${EU_COUNTRIES.map((c)=>`'${c}'`).join(',')}) AND length(${a}.bank_owner) >= 3 AND length(${a}.bank_payment_ref) >= 12))`
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
type Original = {bytes:Uint8Array;sha256:string}
export async function bankEvidence(db:D1Database,dossier:string):Promise<BankEvidence[]> {
  return (await db.prepare('SELECT * FROM aml_bank_evidence WHERE dossier_id=? ORDER BY created_at DESC,rowid DESC').bind(dossier).all<BankEvidence>()).results
}
export async function prepareBankEvidence(db:D1Database,files:R2Bucket,d:Dossier,account:Original,payment:Original,user:string|null,tokenHash:string|null=null) {
  const id=crypto.randomUUID(),prefix=d.order_id?`onboarding/${d.order_id}/bank/${id}`:`companies/${d.company_id}/aml/bank/${id}`
  await files.put(`${prefix}/account`,account.bytes)
  await files.put(`${prefix}/payment`,payment.bytes)
  return db.prepare(`INSERT INTO aml_bank_evidence (id,dossier_id,created_at,created_by,token_hash,account_key,account_sha256,account_bytes,payment_key,payment_sha256,payment_bytes)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`).bind(id,d.id,now(),user,tokenHash,`${prefix}/account`,account.sha256,account.bytes.length,`${prefix}/payment`,payment.sha256,payment.bytes.length)
}
