export const EU_COUNTRIES = 'AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE'.split(' ')
export interface BankEvidence { id:string; dossier_id:string; created_at:number; created_by:string|null; account_key:string; account_sha256:string; account_bytes:number; payment_key:string; payment_sha256:string; payment_bytes:number }
export interface BankVerification { id:string; iban:string; country:string; owner:string; reference:string }
export const bankCurrentSql = (d:string,a:string) => `(${a}.level <> 'high' OR EXISTS (SELECT 1 FROM aml_bank_evidence be
  WHERE be.id = ${a}.bank_id AND be.dossier_id = ${d}.id AND be.id = (SELECT id FROM aml_bank_evidence WHERE dossier_id = ${d}.id ORDER BY created_at DESC,rowid DESC LIMIT 1) AND length(${a}.bank_iban) >= 15
  AND ${a}.bank_country IN (${EU_COUNTRIES.map((c)=>`'${c}'`).join(',')}) AND length(${a}.bank_owner) >= 3 AND length(${a}.bank_payment_ref) >= 12))`
