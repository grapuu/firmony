// MVPP 2026: every closed relationship the payroll works out (an employment, an agreement outside employment with a
// regular or irregular income, a student's agreement, a director's remuneration; pensions and the deduction), each
// with its type of relationship (typZec of the Agency's schema), its days, each fund's base and amount. No inferred
// registration or analytical hours. The funds of each relationship are kept here on their own, to check every closed
// slip against them; a slip that does not agree is never reported.
import { dayOfText } from '../app/booking'
import { isIban, plainIban } from '../app/invoices'
import { monthDays } from '../app/payroll'
import { isMonth, nextMonth } from './model'
import { insuredId } from './health'

export const SOCIAL_FORMAT = 'MVPP-v2026'
export const SOCIAL_XSD_SHA256 = '39b03c603ad1883cc1f3647f4e6afbbd7e15057a035d29cc6aedfebcb4a4d132'
const CAPS = {2026:1_676_400,2027:1_782_000} as const
/** The deduction of a student or a pensioner on an agreement (odvodová odpočítateľná položka). */
const DEDUCTION = {2026:20_000,2027:30_000} as const
// Independent historical reporting rules. SP and SDS are reported together at 14%, including pillar II.
const EMPLOYEE = {sickness:140,oldAge:400,disability:300,unemployment:100} as const
const EMPLOYER = {sickness:140,oldAge:1400,disability:300,unemployment:50,accident:80,guarantee:25,reserve:475,support:50} as const
type Fund = keyof typeof EMPLOYER
type EmployeeAmounts = Record<keyof typeof EMPLOYEE,number>
type EmployerAmounts = Record<Fund,number>
const PENSION_FUNDS = new Set<Fund>(['oldAge','disability','reserve'])
type Contract = 'employment'|'dovp'|'dopc'|'dobps'|'director'
type Pension = 'none'|'old'|'invalid'|'invalid70'
/** The funds a relationship pays to, each side, by the Agency's tables of 2026. */
function fundsOf(contract:Contract,regular:boolean,pension:Pension):{employee:Set<keyof typeof EMPLOYEE>;employer:Set<Fund>} {
  const employee=new Set<keyof typeof EMPLOYEE>(regular?['sickness','oldAge','disability','unemployment']:['oldAge','disability'])
  const employer=new Set<Fund>(regular?['sickness','oldAge','disability','unemployment','support','guarantee','accident','reserve']:['oldAge','disability','guarantee','accident','reserve'])
  if (contract==='director') {employer.delete('guarantee');employer.delete('accident');employer.delete('support')}
  const agreement=contract==='dovp'||contract==='dopc'||contract==='dobps'
  const drop=(...funds:Fund[])=>{for (const f of funds) {employer.delete(f);employee.delete(f as keyof typeof EMPLOYEE)}}
  if (pension==='old') drop('disability','unemployment','support')
  if (pension==='invalid70') drop('unemployment','support')
  if (agreement&&pension!=='none') drop('sickness','unemployment','support')
  return {employee,employer}
}
/** The type of relationship in the report: ZEC and ZECN for an employment or a director, ZECD1 (DoVP), ZECD2 (DoPČ), ZECD3 (DoBPŠ); N irregular, V the deduction. */
function typeOf(contract:Contract,regular:boolean,deduction:boolean):string|null {
  if (contract==='employment') return regular&&!deduction?'ZEC':null
  if (contract==='director') return deduction?null:regular?'ZEC':'ZECN'
  const n={dovp:'1',dopc:'2',dobps:'3'}[contract]
  if (contract==='dobps') return regular?(deduction?'ZECD3V':'ZECD3'):(deduction?'ZECD3NV':'ZECD3N')
  return regular?`ZECD${n}${deduction?'V':''}`:deduction?null:`ZECD${n}N`
}
export interface SocialRow {
  employeeId:string; name:string; days:number; gross:number; base:number
  /** The base of pension insurance and the reserve fund (the base less the deduction). */
  pensionBase:number
  employee:EmployeeAmounts; employer:EmployerAmounts
  typZec:string
  /** A director's relationship is no labour relationship: the report leaves the support in short-time work out. */
  labour:boolean
  /** The funds this relationship pays to, each side (a fund it does not pay to is reported with nought). */
  funds:{employee:(keyof typeof EMPLOYEE)[];employer:Fund[]}
  /** Hours paid in the month as the payroll counted them, offered for the analytical hours; null on older slips. */
  paidHours:number|null
}
export interface SocialTotals { rows:SocialRow[]; employee:EmployeeAmounts; employer:EmployerAmounts; employeeTotal:number; employerTotal:number; total:number; issues:string[] }
const cents = (v:unknown):v is number => Number.isSafeInteger(v) && (v as number)>=0 && (v as number)<=9_999_999_999
const floor = (base:number,rate:number) => Number(BigInt(base)*BigInt(rate)/10000n)
const CONTRACTS=new Set(['employment','dovp','dopc','dobps','director']),PENSIONS=new Set(['none','old','invalid','invalid70'])
export function socialTotals(period:string,json:string,today:string):SocialTotals {
  const issues=new Set<string>(),rows:SocialRow[]=[],seen=new Set<string>(),year=Number(period.slice(0,4))
  const cap=year===2026||year===2027?CAPS[year]:null,deductionMax=year===2026||year===2027?DEDUCTION[year]:0
  if (!isMonth(period)||!cap) issues.add('Pre toto obdobie nemáme overené pravidlá MVPP 2026.')
  if (period>=today.slice(0,7)) issues.add('Výkaz pripravte až po skončení vykazovaného mesiaca.')
  let lines:unknown;try {lines=JSON.parse(json)} catch {lines=null}
  if (!Array.isArray(lines)||!lines.length) issues.add('Chýbajú úplné uložené výplatné pásky.')
  for (const l of Array.isArray(lines)?lines:[]) {
    if (!l||typeof l.employeeId!=='string'||!l.employeeId||seen.has(l.employeeId)) {issues.add('Zamestnanci v uzávierke sú neúplní alebo sa opakujú.');continue}
    seen.add(l.employeeId)
    const s=l.slip
    if (!cap||!s||s.period!==period||s.rulesYear!==year||![l.gross,s.gross,s.socialBase,s.socialEmployee,s.socialEmployer].every(cents)||s.gross!==l.gross||!Number.isInteger(l.days)||l.days<1||l.days>monthDays(period)||s.socialBase!==Math.min(s.gross,cap)||!s.social?.employee||!s.social?.employer) {issues.add('Uzavretá páska nemá konzistentné sumy, dni alebo vymeriavací základ. Prepočítajte mesiac.');continue}
    const contract:Contract=s.contract===undefined?'employment':s.contract,pension:Pension=s.pension===undefined?'none':s.pension
    const regular=contract==='employment'?true:contract==='dobps'?false:s.regular===true
    const deduction=s.exemption===undefined?0:s.exemption
    if (!CONTRACTS.has(contract)||!PENSIONS.has(pension)||!cents(deduction)||deduction>Math.min(deductionMax,s.socialBase)||deduction>0&&!(contract==='dobps'||(contract==='dovp'||contract==='dopc')&&pension!=='none'&&regular)) {issues.add('Uzavretá páska má neznámy vzťah alebo odpočítateľnú položku. Prepočítajte mesiac.');continue}
    const typZec=typeOf(contract,regular,deduction>0)
    if (!typZec) {issues.add(`Pre vzťah zamestnanca ${typeof l.name==='string'?l.name:''} nemá výkaz MVPP 2026 typ. Pripravte ho odborne externe.`);continue}
    const funds=fundsOf(contract,regular,pension),pensionBase=s.socialBase-deduction
    const baseOf=(f:Fund)=>f==='accident'?s.gross:PENSION_FUNDS.has(f)?pensionBase:s.socialBase
    const employee=Object.fromEntries(Object.keys(EMPLOYEE).map((k)=>[k,funds.employee.has(k as keyof typeof EMPLOYEE)?floor(baseOf(k as Fund),EMPLOYEE[k as keyof typeof EMPLOYEE]):0])) as EmployeeAmounts
    const employer=Object.fromEntries(Object.keys(EMPLOYER).map((k)=>[k,funds.employer.has(k as Fund)?floor(baseOf(k as Fund),k==='unemployment'&&contract==='director'?100:EMPLOYER[k as Fund]):0])) as EmployerAmounts
    const stored=(side:Record<string,unknown>,expected:Record<string,number>,allowed:Set<string>)=>Object.keys(side).every((k)=>allowed.has(k)&&cents(side[k])&&side[k]===expected[k])&&[...allowed].every((k)=>side[k]===expected[k])
    if (!stored(s.social.employee,employee,funds.employee)||!stored(s.social.employer,employer,funds.employer)||Object.values(employee).reduce((a,v)=>a+v,0)!==s.socialEmployee||Object.values(employer).reduce((a,v)=>a+v,0)!==s.socialEmployer) {issues.add('Uložené sociálne odvody nezodpovedajú pravidlám vzťahu zamestnanca. Použite odborné spracovanie.');continue}
    const paid=l.pay&&Number.isSafeInteger(l.pay.paid)&&l.pay.paid>=0&&l.pay.paid<=monthDays(period)*2400?l.pay.paid:null
    rows.push({employeeId:l.employeeId,name:typeof l.name==='string'?l.name:'Zamestnanec',days:l.days,gross:s.gross,base:s.socialBase,pensionBase,employee,employer,typZec,labour:contract!=='director',funds:{employee:[...funds.employee],employer:[...funds.employer]},paidHours:paid})
  }
  const employee=Object.fromEntries(Object.keys(EMPLOYEE).map((k)=>[k,rows.reduce((a,r)=>a+r.employee[k as keyof EmployeeAmounts],0)])) as EmployeeAmounts
  const employer=Object.fromEntries(Object.keys(EMPLOYER).map((k)=>[k,rows.reduce((a,r)=>a+r.employer[k as keyof EmployerAmounts],0)])) as EmployerAmounts
  const employeeTotal=Object.values(employee).reduce((a,v)=>a+v,0),employerTotal=Object.values(employer).reduce((a,v)=>a+v,0),total=employeeTotal+employerTotal
  if (!rows.length||![...Object.values(employee),...Object.values(employer)].every(cents)||!Number.isSafeInteger(total)||total>99_999_999_999) issues.add('Podklady alebo úhrny prekračujú podporovaný rozsah výkazu.')
  return {rows,employee,employer,employeeTotal,employerTotal,total,issues:[...issues]}
}
export const validIcpv = (v:string) => /^\d{12}$/.test(v)
export type HoursMode = 'known'|'undetermined'
export function socialHours(value:string,mode:string,period:string):number|null {
  if (mode==='undetermined') return value.trim()===''?99900:null
  if (mode!=='known'||!/^\d{1,3}(?:[.,]\d{1,2})?$/.test(value)) return null
  const [whole,part='']=value.replace(',','.').split('.')
  const n=Number(whole)*100+Number(part.padEnd(2,'0'))
  return isMonth(period)&&n<=monthDays(period)*2400?n:null
}
export const socialHoursLabel = (n:number,mode:string) => mode==='undetermined'?'999 · počet hodín nemožno určiť':`${Math.floor(n/100)},${String(n%100).padStart(2,'0')} h`
export interface SocialInput { name:string; payer:string; iban:string; firstName:string; lastName:string; phone:string; email:string; preparedBy:string; declaredOn:string; kind:string; reason:string; reference:string; checked:boolean }
export function socialInputError(v:SocialInput,period:string,today:string,company:{name:string;ico:string|null},replacing:boolean):string|null {
  if (!company.ico||!/^\d{8}$/.test(company.ico)||v.name!==company.name||!v.name.trim()||v.name.length>144||!/^\d{10}$/.test(v.payer)||!isIban(v.iban)) return 'Overte názov, IČO, číslo zamestnávateľa pridelené SP a vlastný IBAN, z ktorého odvádzate poistné.'
  const fields=[[v.name,144],[v.firstName,24],[v.lastName,36],[v.phone,50],[v.email,255],[v.preparedBy,30]] as const
  if (fields.some(([s,max])=>s.length>max||/[\p{Cc}\p{Cs}\uFFFE\uFFFF]/u.test(s))||!v.firstName.trim()||!v.lastName.trim()||!v.preparedBy.trim()) return 'Skontrolujte meno a priezvisko osoby plniacej povinnosti voči SP a vypracovateľa. Údaje neskracujeme odhadom.'
  if (!/^(?:00\d{8,15}|\+\d{8,15})$/.test(v.phone)||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)) return 'Vyplňte telefón osoby plniacej povinnosti voči SP s medzinárodnou predvoľbou a jej e-mail.'
  if (!['R','O'].includes(v.kind)||!v.declaredOn||dayOfText(v.declaredOn)!==v.declaredOn||v.declaredOn>today||v.declaredOn<`${nextMonth(period)}-01`) return 'Zvoľte riadny alebo opravný výkaz a platný dátum vypracovania po skončení obdobia.'
  if (!v.checked||v.reference.trim().length<12||v.reference.length>240||v.reason.length>1200||(replacing||v.kind==='O')&&v.reason.trim().length<12) return 'Potvrďte úplnosť podporovaného rozsahu a referenciu kontroly; opravný alebo ďalší výkaz potrebuje dôvod aspoň 12 znakov.'
  return null
}
const money=(n:number)=>`${Math.floor(n/100)}.${String(n%100).padStart(2,'0')}`
const esc=(v:string)=>v.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;')
const el=(tag:string,v:string)=>`<${tag}>${esc(v)}</${tag}>`
const group=(tag:string,body:string)=>`<${tag}>${body}</${tag}>`
const date=(v:string)=>`${v.slice(8,10)}.${v.slice(5,7)}.${v.slice(0,4)}`
const fundTags={sickness:'np',oldAge:'sp',disability:'ip',unemployment:'pvn',accident:'up',guarantee:'gp',reserve:'rfs',support:'pfp'} as const
export interface SocialPerson { identifier:string; icpv:string; hours:number; mode:HoursMode }
export function socialXml(period:string,totals:SocialTotals,v:SocialInput,ico:string,payday:string,people:ReadonlyMap<string,SocialPerson>):string {
  if (totals.issues.length||totals.rows.some((r)=>{const p=people.get(r.employeeId);return !p||!insuredId(p.identifier)||!validIcpv(p.icpv)||!['known','undetermined'].includes(p.mode)||!Number.isSafeInteger(p.hours)||p.hours<0||p.mode==='undetermined'&&p.hours!==99900||p.mode==='known'&&p.hours>monthDays(period)*2400})||new Set(totals.rows.map((r)=>people.get(r.employeeId)?.identifier)).size!==totals.rows.length||new Set(totals.rows.map((r)=>people.get(r.employeeId)?.icpv)).size!==totals.rows.length) throw new Error('Unsupported social report source')
  const summary=Object.entries(fundTags).map(([key,tag])=>group(tag,el(`${tag}Zamtel`,money(totals.employer[key as keyof EmployerAmounts]))+(Object.hasOwn(EMPLOYEE,key)?el(`${tag}Zamnec`,money(totals.employee[key as keyof EmployeeAmounts])):''))).join('')+el('spoluPoistne',money(totals.total))
  const rows=totals.rows.map((r,i)=>{
    const p=people.get(r.employeeId)!,attrs:Record<string,string|number>={pc:i+1,rc:p.identifier,icpv:p.icpv,pocDni:r.days,typZec:r.typZec,vynimkaVZ:'0'}
    const baseOf=(key:string)=>key==='accident'?r.gross:PENSION_FUNDS.has(key as Fund)?r.pensionBase:r.base
    for (const [key,tag] of Object.entries(fundTags)) {
      if (key==='support') continue
      const name=`${tag[0]!.toUpperCase()}${tag.slice(1)}`
      attrs[`vz${name}`]=money(r.funds.employer.includes(key as Fund)?baseOf(key):0)
      attrs[`${tag}Zamtel`]=money(r.employer[key as keyof EmployerAmounts])
      if (Object.hasOwn(EMPLOYEE,key)) {attrs[`vzZec${name}`]=money(r.funds.employee.includes(key as keyof typeof EMPLOYEE)?baseOf(key):0);attrs[`${tag}Zamnec`]=money(r.employee[key as keyof EmployeeAmounts])}
    }
    // The support in short-time work: left out whole for a relationship that is no labour relationship (the schema's note).
    if (r.labour) {attrs.vzPfp=money(r.funds.employer.includes('support')?r.base:0);attrs.pfpZamtel=money(r.employer.support)}
    attrs.pocetHodin=money(p.hours)
    return `<poistneZamestnanca${Object.entries(attrs).map(([k,value])=>` ${k}="${esc(String(value))}"`).join('')}/>`
  }).join('')
  const employer=group('identifikacia',el('variabilnySymbol',v.payer)+group('identifikator',el('ico',ico))+el('nazov',v.name))+group('ucet',el('iban',plainIban(v.iban)))
  const officer=el('priezvisko',v.lastName)+el('meno',v.firstName)+el('tel',v.phone)+el('mail',v.email)
  return `<?xml version="1.0" encoding="UTF-8"?><mvpp xmlns="http://socpoist.sk/xsd/mvpp2026">${el('typDoc','MVP00001')}${el('obdobie',period.slice(5)+period.slice(0,4))}${el('denVyplaty',date(payday))}${el('typVykazu',v.kind)}${group('zamestnavatel',employer)}${group('poistne',summary)}${group('fOsoba',officer)}${group('vystavenie',el('zostavil',v.preparedBy)+el('datum',date(v.declaredOn)))}${group('priloha',group('poistneZamestnancov',rows))}</mvpp>\n`
}
