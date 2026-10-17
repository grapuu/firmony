import { now } from '../db'
import type { User } from '../app/store'
import { insuredId } from './health'
import { closureCurrentSql } from './sql'

// The existing schema-21 table retains its name/history. A verified RČ is shared by both recipients.
export interface InsuredIdentity { id:string; company_id:string; employee_id:string; revision:number; identifier:string; reference:string; reason:string; at:number; by_user:string }
export interface InsuredIdentityInput { revision:number; identifier:string; reference:string; reason:string; checked:boolean }
export async function recordInsuredIdentity(db:D1Database,company:string,targetId:string,employee:string,user:User,v:InsuredIdentityInput,recipient:'health'|'social'='health',expectedDataRevision?:number):Promise<{ok:boolean;error?:string}> {
  if (!v.checked||!insuredId(v.identifier)||v.reference.trim().length<12||v.reference.length>240||v.reason.length>1200||!Number.isSafeInteger(v.revision)||v.revision<0||v.revision>0&&(user.team!=='admin'||v.reason.trim().length<12)) return {ok:false,error:'Overte rodné číslo bez lomky a referenciu dokladu. Opravu robí správca s dôvodom aspoň 12 znakov.'}
  const scope=recipient==='social'?"t.kind='sp'":"'health'||json_extract(l.value,'$.insurer')=t.kind"
  const source=await db.prepare(`SELECT 1 AS present FROM payroll_targets t JOIN payroll_closures pc ON pc.id=t.closure_id AND pc.company_id=t.company_id, json_each(pc.lines) l WHERE t.id=? AND t.company_id=? AND (${scope}) AND json_extract(l.value,'$.employeeId')=? AND (${closureCurrentSql('pc')})`).bind(targetId,company,employee).first()
  if (!source) return {ok:false,error:'Zamestnanec nepatrí do aktuálnych podkladov tohto výkazu.'}
  const old=await db.prepare('SELECT * FROM payroll_health_ids WHERE company_id=? AND employee_id=? ORDER BY revision DESC LIMIT 1').bind(company,employee).first<InsuredIdentity>()
  if ((old?.revision??0)!==v.revision||old?.identifier===v.identifier&&old.reference===v.reference.trim()) return {ok:false,error:'Údaj sa zmenil alebo ho už evidujeme. Obnovte podklady.'}
  try {
    const r=await db.prepare(`INSERT INTO payroll_health_ids(id,company_id,employee_id,revision,identifier,reference,reason,at,by_user)
      SELECT ?,?,?,?,?,?,?,?,? WHERE ? IS NULL OR COALESCE((SELECT revision FROM company_data_revisions WHERE company_id=?),0)=?`).bind(crypto.randomUUID(),company,employee,v.revision+1,v.identifier,v.reference.trim(),v.reason.trim(),now(),user.id,expectedDataRevision??null,company,expectedDataRevision??null).run()
    return r.meta.changes?{ok:true}:{ok:false,error:'Podklady sa zmenili. Obnovte ich; nový identifikátor sme nezapísali.'}
  } catch(e) {
    if (/FIRMONY_PAYROLL_AUTHORITY|UNIQUE constraint|handover is being finalized/.test(String(e))) return {ok:false,error:'Údaje alebo oprávnenia sa zmenili. Obnovte podklady; nový identifikátor sme nezapísali.'}
    throw e
  }
}
