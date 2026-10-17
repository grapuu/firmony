import { sha256Hex } from '../db'
import { dataRevision } from '../app/handover-store'
import { companyOf, type Company, type User } from '../app/store'
import { payrollSettingsOf } from '../app/payroll-store'
import { dayOfText } from '../app/booking'
import type { Closure, ReportTarget } from './model'
import { closureCurrentSql, currentTargetActiveSql, healthInsuredCoverageSql } from './sql'
import { healthFilename, healthInputError, healthText, healthTotals, insuredId, HEALTH_FORMAT, HEALTH_SPEC_SHA256, type HealthInput, type HealthTotals } from './health'
import { saveReport } from './store'
import type { InsuredIdentity } from './insured-identities'
export { recordInsuredIdentity as recordHealthIdentity } from './insured-identities'

export type HealthIdentity = InsuredIdentity
export interface HealthPlan {
  company:Company; target:ReportTarget; closure:Closure; revision:number; token:string; totals:HealthTotals
  identities:HealthIdentity[]; identitiesJson:string; issues:string[]; frozen:boolean; defaults:Record<string,string>
}
export async function healthPlan(db:D1Database, companyId:string, targetId:string, today:string):Promise<HealthPlan|null> {
  const revision=await dataRevision(db,companyId)
  const r=await db.batch<Record<string,unknown>>([
    db.prepare('SELECT * FROM companies WHERE id = ?').bind(companyId),
    db.prepare(`SELECT t.*, (${currentTargetActiveSql('t')}) AS active, ${healthInsuredCoverageSql('t')} AS identities FROM payroll_targets t WHERE t.id = ? AND t.company_id = ? AND t.kind IN ('health24','health25','health27')`).bind(targetId,companyId),
    db.prepare(`SELECT pc.* FROM payroll_closures pc JOIN payroll_targets t ON t.closure_id = pc.id AND t.company_id = pc.company_id WHERE t.id = ? AND t.company_id = ? AND (${closureCurrentSql('pc')})`).bind(targetId,companyId),
    db.prepare('SELECT i.* FROM payroll_health_ids i WHERE i.company_id = ? AND NOT EXISTS (SELECT 1 FROM payroll_health_ids n WHERE n.company_id = i.company_id AND n.employee_id = i.employee_id AND n.revision > i.revision) ORDER BY i.employee_id').bind(companyId),
    db.prepare('SELECT g.details FROM payroll_health_generations g JOIN payroll_packages p ON p.id = g.package_id JOIN payroll_targets t ON t.id = p.target_id WHERE g.company_id = ? AND t.kind = (SELECT kind FROM payroll_targets WHERE id = ? AND company_id = ?) ORDER BY g.at DESC, g.rowid DESC LIMIT 1').bind(companyId,targetId,companyId),
  ])
  const raw=r[0]?.results[0], target=r[1]?.results[0], closure=r[2]?.results[0] as unknown as Closure|undefined
  if (!raw || !target || !closure) return null
  const company=companyOf(raw), frozen=raw.purge_started_at!==null, totals=healthTotals(String(target.period),String(target.kind),closure.lines,today), issues=[...totals.issues]
  if (!target.active || frozen) issues.push('Účtovníctvo alebo táto uzávierka nie sú dostupné na novú prípravu.')
  let snap:{company?:{id?:string};period?:string;payday?:string;lines?:unknown}|null=null
  try {snap=JSON.parse(closure.source_json)} catch { /* Integrity is checked below. */ }
  if (await sha256Hex(closure.source_json)!==closure.sha256 || snap?.company?.id!==companyId || snap?.period!==closure.period || snap?.payday!==closure.payday || JSON.stringify(snap?.lines)!==JSON.stringify(JSON.parse(closure.lines)) || closure.payday!==dayOfText(closure.payday)) issues.push('Mzdový zdroj sa nezhoduje s uloženým odtlačkom alebo výplatným termínom.')
  const rows=new Set(totals.rows.map((x)=>x.employeeId)), identities=(r[3]?.results??[]).filter((i)=>rows.has(String(i.employee_id))) as unknown as HealthIdentity[]
  for (const row of totals.rows) if (!identities.some((i)=>i.employee_id===row.employeeId && insuredId(i.identifier))) issues.push(`Overte identifikátor poistenca: ${row.name}.`)
  if (new Set(identities.map((i)=>i.identifier)).size!==identities.length) issues.push('Rovnaký poistenec sa v prílohe opakuje. Viac pracovných vzťahov pripravte odborne externe.')
  let previous:Record<string,string>={};try {const d=JSON.parse(String(r[4]?.results[0]?.details??'null'));if(d?.input && typeof d.input==='object') previous=d.input} catch { /* No previous header is required. */ }
  const settings=payrollSettingsOf(raw.payroll), savedPayer=settings.health[String(target.kind).slice(-2) as '24'|'25'|'27']?.vs
  const defaults:Record<string,string>={name:company.name,dic:company.dic??'',payer:savedPayer??(typeof previous.payer==='string'?previous.payer:''),branch:typeof previous.branch==='string'?previous.branch:'',iban:company.invoiceIban??(typeof previous.iban==='string'?previous.iban:''),phone:typeof previous.phone==='string'?previous.phone:'',email:typeof previous.email==='string'?previous.email:'',sendOn:today,batch:'',kind:'',reason:'',reference:'',checked:''}
  const identitiesJson=String(target.identities)
  const token=await sha256Hex(JSON.stringify({version:1,format:HEALTH_FORMAT,spec:HEALTH_SPEC_SHA256,revision,target,closureHash:closure.sha256,company:{id:company.id,ico:company.ico,dic:company.dic,name:company.name},identitiesJson,issues,defaults,frozen}))
  return {company,target:target as unknown as ReportTarget,closure,revision,token,totals,identities,identitiesJson,issues,frozen,defaults}
}
export async function generateHealth(db:D1Database, files:R2Bucket|undefined, plan:HealthPlan, user:User, token:string, v:HealthInput, today:string) {
  if (token!==plan.token) return {ok:false,error:'Podklady sa od otvorenia stránky zmenili. Skontrolujte ich a potvrďte odbornú kontrolu znova.'}
  if (plan.issues.length) return {ok:false,error:plan.issues[0]}
  const error=healthInputError(v,plan.target.period,plan.target.kind,today,plan.company,Boolean(plan.target.package_id))
  if (error) return {ok:false,error}
  const text=healthText(plan.target.period,plan.totals,v,plan.company.ico!,plan.closure.payday,new Map(plan.identities.map((i)=>[i.employee_id,i.identifier])))
  const bytes=new TextEncoder().encode(text), fileSha256=await sha256Hex(text)
  const details=JSON.stringify({version:1,format:HEALTH_FORMAT,specSha256:HEALTH_SPEC_SHA256,sourceHash:plan.closure.sha256,fileSha256,reviewedDataRevision:plan.revision,input:v,identitiesJson:plan.identitiesJson,closure:plan.closure.id,employees:plan.totals.rows.length,total:plan.totals.total})
  return saveReport(db,files,plan.target,user,{revision:plan.target.revision,variant:`Dávka 514 · ${v.kind==='N'?'nová':'opravná'}`,reason:v.reason,checked:true,file:{name:healthFilename(plan.target.period,v.kind),bytes},expectedDataRevision:plan.revision,expectedSourceHash:plan.closure.sha256,healthGeneration:{format:HEALTH_FORMAT,identities:plan.identitiesJson,details,sha256:await sha256Hex(details)}})
}
