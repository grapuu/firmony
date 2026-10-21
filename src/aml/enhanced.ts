// Programme 4.6(f), § 12(2)(a)(2), Act 297/2008, original read 21 October 2026:
// https://static.slov-lex.sk/static/SK/ZZ/2008/297/20260817.html
// This records professional verification of originals. An upload alone never proves account ownership or payment.
import type { Dossier } from './model'
import { now } from '../db'

import type { BankEvidence } from './enhanced-model'
export { EU_COUNTRIES, bankCurrentSql } from './enhanced-model'
export type { BankEvidence,BankVerification } from './enhanced-model'
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
