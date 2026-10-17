import { now,sha256Hex } from '../db'
import { dataRevision } from '../app/handover-store'
import { companyOf,type Company,type User } from '../app/store'
import { payrollSettingsOf } from '../app/payroll-store'
import { dayOfText } from '../app/booking'
import { closureCurrentSql,currentTargetActiveSql,socialCoverageSql } from './sql'
import { insuredId } from './health'
import { recordInsuredIdentity,type InsuredIdentity } from './insured-identities'
import { socialHours,socialInputError,socialTotals,socialXml,validIcpv,SOCIAL_FORMAT,SOCIAL_XSD_SHA256,type SocialInput,type SocialTotals,type HoursMode } from './social'
import type { Closure,ReportTarget } from './model'
import { saveReport } from './store'

export interface SocialRelation { id:string; employee_id:string; revision:number; icpv:string; reference:string; reason:string }
export interface SocialAnalytic { id:string; employee_id:string; closure_id:string; revision:number; hours_mode:HoursMode; hours:number; reference:string; reason:string }
export interface SocialPlan {
  company:Company; target:ReportTarget; closure:Closure; revision:number; token:string; totals:SocialTotals; issues:string[]; frozen:boolean; requiresCorrection:boolean
  identities:InsuredIdentity[]; relations:SocialRelation[]; inputs:SocialAnalytic[]; factsJson:string; defaults:Record<string,string>
}
export async function socialPlan(db:D1Database,companyId:string,targetId:string,today:string):Promise<SocialPlan|null> {
  const revision=await dataRevision(db,companyId)
  const r=await db.batch<Record<string,unknown>>([
    db.prepare('SELECT * FROM companies WHERE id=?').bind(companyId),
    db.prepare(`SELECT t.*,(${currentTargetActiveSql('t')}) AS active,${socialCoverageSql('t')} AS facts,
      EXISTS(SELECT 1 FROM payroll_packages p WHERE p.target_id=t.id AND p.company_id=t.company_id AND p.status='accepted') AS accepted FROM payroll_targets t WHERE t.id=? AND t.company_id=? AND t.kind='sp'`).bind(targetId,companyId),
    db.prepare(`SELECT pc.* FROM payroll_closures pc JOIN payroll_targets t ON t.closure_id=pc.id AND t.company_id=pc.company_id WHERE t.id=? AND t.company_id=? AND (${closureCurrentSql('pc')})`).bind(targetId,companyId),
    db.prepare('SELECT i.* FROM payroll_health_ids i WHERE i.company_id=? AND NOT EXISTS(SELECT 1 FROM payroll_health_ids n WHERE n.company_id=i.company_id AND n.employee_id=i.employee_id AND n.revision>i.revision) ORDER BY i.employee_id').bind(companyId),
    db.prepare('SELECT r.* FROM payroll_social_relations r WHERE r.company_id=? AND NOT EXISTS(SELECT 1 FROM payroll_social_relations n WHERE n.company_id=r.company_id AND n.employee_id=r.employee_id AND n.revision>r.revision) ORDER BY r.employee_id').bind(companyId),
    db.prepare('SELECT a.* FROM payroll_social_inputs a WHERE a.company_id=? AND a.closure_id=(SELECT closure_id FROM payroll_targets WHERE id=? AND company_id=?) AND NOT EXISTS(SELECT 1 FROM payroll_social_inputs n WHERE n.closure_id=a.closure_id AND n.employee_id=a.employee_id AND n.revision>a.revision) ORDER BY a.employee_id').bind(companyId,targetId,companyId),
    db.prepare('SELECT details FROM payroll_social_generations WHERE company_id=? ORDER BY at DESC,rowid DESC LIMIT 1').bind(companyId),
  ])
  const raw=r[0]?.results[0],target=r[1]?.results[0],closure=r[2]?.results[0] as unknown as Closure|undefined
  if (!raw||!target||!closure) return null
  const company=companyOf(raw),frozen=raw.purge_started_at!==null,totals=socialTotals(String(target.period),closure.lines,today),issues=[...totals.issues]
  if (!target.active||frozen) issues.push('Táto uzávierka alebo účtovníctvo nie sú dostupné na novú prípravu.')
  let snap:{company?:{id?:string};period?:string;payday?:string;lines?:unknown}|null=null
  try {snap=JSON.parse(closure.source_json)} catch { /* Check the exact source below. */ }
  if (await sha256Hex(closure.source_json)!==closure.sha256||snap?.company?.id!==companyId||snap?.period!==closure.period||snap?.payday!==closure.payday||JSON.stringify(snap?.lines)!==JSON.stringify(JSON.parse(closure.lines))||closure.payday!==dayOfText(closure.payday)) issues.push('Mzdový zdroj alebo určený výplatný termín sa nezhodujú s uloženým odtlačkom.')
  const ids=new Set(totals.rows.map((x)=>x.employeeId)),selected=(i:Record<string,unknown>)=>ids.has(String(i.employee_id))
  const identities=(r[3]?.results??[]).filter(selected) as unknown as InsuredIdentity[],relations=(r[4]?.results??[]).filter(selected) as unknown as SocialRelation[],inputs=(r[5]?.results??[]).filter(selected) as unknown as SocialAnalytic[]
  for (const row of totals.rows) {
    if (!identities.some((i)=>i.employee_id===row.employeeId&&insuredId(i.identifier))) issues.push(`Overte rodné číslo: ${row.name}.`)
    if (!relations.some((i)=>i.employee_id===row.employeeId&&validIcpv(i.icpv))) issues.push(`Overte IČPV pridelené SP: ${row.name}.`)
    if (!inputs.some((i)=>i.employee_id===row.employeeId)) issues.push(`Overte počet hodín za tento mesiac: ${row.name}.`)
  }
  if (new Set(identities.map((i)=>i.identifier)).size!==identities.length||new Set(relations.map((i)=>i.icpv)).size!==relations.length) issues.push('Poistenec alebo právny vzťah sa opakuje. Viac pracovných vzťahov pripravte odborne externe.')
  let previous:Record<string,unknown>={};try {previous=JSON.parse(String(r[6]?.results[0]?.details??'null'))?.input??{}} catch { /* No previous header is required. */ }
  const prior=(k:string)=>typeof previous[k]==='string'?previous[k] as string:''
  const defaults={name:company.name,payer:payrollSettingsOf(raw.payroll).social.vs??prior('payer'),iban:company.invoiceIban??prior('iban'),firstName:prior('firstName'),lastName:prior('lastName'),phone:prior('phone'),email:prior('email'),preparedBy:prior('preparedBy'),declaredOn:today,kind:'',reason:'',reference:'',checked:''}
  const factsJson=String(target.facts),token=await sha256Hex(JSON.stringify({version:1,format:SOCIAL_FORMAT,xsd:SOCIAL_XSD_SHA256,revision,target,sourceHash:closure.sha256,company:{id:company.id,ico:company.ico,name:company.name},factsJson,defaults,issues,frozen}))
  return {company,target:target as unknown as ReportTarget,closure,revision,token,totals,issues,frozen,requiresCorrection:Boolean(target.accepted),identities,relations,inputs,factsJson,defaults}
}
export interface SocialFactInput { employee:string; section:string; revision:number; value:string; mode:string; reference:string; reason:string; checked:boolean }
export async function recordSocialFact(db:D1Database,plan:SocialPlan,user:User,token:string,v:SocialFactInput):Promise<{ok:boolean;error?:string}> {
  if (token!==plan.token||plan.frozen||!plan.totals.rows.some((r)=>r.employeeId===v.employee)) return {ok:false,error:'Podklady sa zmenili alebo zamestnanec nepatrí do tejto podporovanej uzávierky. Obnovte stránku.'}
  if (!v.checked||!Number.isSafeInteger(v.revision)||v.revision<0||v.reference.trim().length<12||v.reference.length>240||v.reason.length>1200||v.revision>0&&(user.team!=='admin'||v.reason.trim().length<12)) return {ok:false,error:'Potvrďte overenie a referenciu podkladu. Opravu robí správca s dôvodom aspoň 12 znakov.'}
  if (v.section==='identity') return recordInsuredIdentity(db,plan.company.id,plan.target.id,v.employee,user,{...v,identifier:v.value},'social',plan.revision)
  if (!['relation','hours'].includes(v.section)) return {ok:false,error:'Neznámy druh podkladu.'}
  const relation=v.section==='relation',old=(relation?plan.relations:plan.inputs).find((i)=>i.employee_id===v.employee)
  if ((old?.revision??0)!==v.revision) return {ok:false,error:'Údaj sa zmenil. Obnovte podklady.'}
  const hours=relation?null:socialHours(v.value,v.mode,plan.target.period)
  if (relation?!validIcpv(v.value):hours===null||v.mode==='undetermined'&&v.reason.trim().length<12) return {ok:false,error:'Overte 12 číslic IČPV alebo počet hodín zodpovedajúci príjmu. Kód 999 zvoľte samostatne, bez zadanej číselnej hodnoty a s dôvodom.'}
  if (old&&old.reference===v.reference.trim()&&(relation?(old as SocialRelation).icpv===v.value:(old as SocialAnalytic).hours===hours&&(old as SocialAnalytic).hours_mode===v.mode)) return {ok:false,error:'Tento overený údaj už evidujeme. Pôvodný záznam nemeníme.'}
  const company=plan.company.id,id=crypto.randomUUID(),at=now(),guard=`COALESCE((SELECT revision FROM company_data_revisions WHERE company_id=?),0)=? AND EXISTS(SELECT 1 FROM payroll_closures pc WHERE pc.id=? AND pc.company_id=? AND (${closureCurrentSql('pc')}))`
  try {
    const statement=relation?db.prepare(`INSERT INTO payroll_social_relations(id,company_id,employee_id,revision,icpv,reference,reason,at,by_user) SELECT ?,?,?,?,?,?,?,?,? WHERE ${guard}`).bind(id,company,v.employee,v.revision+1,v.value,v.reference.trim(),v.reason.trim(),at,user.id,company,plan.revision,plan.closure.id,company):db.prepare(`INSERT INTO payroll_social_inputs(id,company_id,closure_id,employee_id,revision,hours_mode,hours,reference,reason,at,by_user) SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE ${guard}`).bind(id,company,plan.closure.id,v.employee,v.revision+1,v.mode,hours,v.reference.trim(),v.reason.trim(),at,user.id,company,plan.revision,plan.closure.id,company)
    const r=await statement.run()
    return r.meta.changes?{ok:true}:{ok:false,error:'Podklady sa medzitým zmenili. Obnovte stránku; nový údaj sme nezapísali.'}
  } catch(e) {
    if (/FIRMONY_PAYROLL_AUTHORITY|UNIQUE constraint|handover is being finalized/.test(String(e))) return {ok:false,error:'Podklady, IČPV alebo oprávnenia sa zmenili. Obnovte stránku; nový údaj sme nezapísali.'}
    throw e
  }
}
export async function generateSocial(db:D1Database,files:R2Bucket|undefined,plan:SocialPlan,user:User,token:string,v:SocialInput,today:string) {
  if (token!==plan.token) return {ok:false,error:'Podklady sa od otvorenia stránky zmenili. Obnovte a skontrolujte ich znova.'}
  if (plan.issues.length) return {ok:false,error:plan.issues[0]}
  if (plan.requiresCorrection&&v.kind!=='O') return {ok:false,error:'Toto obdobie už má doložené prijatie SP. Pripravte úplný opravný výkaz O; ďalší riadny výkaz nevytvárame.'}
  const error=socialInputError(v,plan.target.period,today,plan.company,Boolean(plan.target.package_id))
  if (error) return {ok:false,error}
  const people=new Map(plan.totals.rows.map((r)=>{const i=plan.identities.find((i)=>i.employee_id===r.employeeId)!,p=plan.relations.find((p)=>p.employee_id===r.employeeId)!,a=plan.inputs.find((a)=>a.employee_id===r.employeeId)!;return [r.employeeId,{identifier:i.identifier,icpv:p.icpv,hours:a.hours,mode:a.hours_mode}]}))
  const xml=socialXml(plan.target.period,plan.totals,v,plan.company.ico!,plan.closure.payday,people),bytes=new TextEncoder().encode(xml),fileSha256=await sha256Hex(xml)
  const details=JSON.stringify({version:1,format:SOCIAL_FORMAT,xsdSha256:SOCIAL_XSD_SHA256,sourceHash:plan.closure.sha256,fileSha256,reviewedDataRevision:plan.revision,input:v,factsJson:plan.factsJson,closure:plan.closure.id,employees:plan.totals.rows.length,total:plan.totals.total})
  return saveReport(db,files,plan.target,user,{revision:plan.target.revision,variant:`${SOCIAL_FORMAT} · ${v.kind==='R'?'riadny':'opravný'}`,reason:v.reason,checked:true,file:{name:`${SOCIAL_FORMAT}-${plan.target.period}-${v.kind}.xml`,bytes},expectedDataRevision:plan.revision,expectedSourceHash:plan.closure.sha256,socialGeneration:{format:SOCIAL_FORMAT,facts:plan.factsJson,details,sha256:await sha256Hex(details)}})
}
