import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { validateXML } from 'xmllint-wasm'
import { socialReporting as p,payroll,security } from '../.wrangler/tmp/units-bundle.mjs'
import { readSocialXml } from './social-xml.mjs'
import { check } from './check.mjs'

export async function checkSocial() {
  const period='2026-09',today='2026-10-17',payday='2026-10-12',base={period,days:30,declaration:true,children:[],disabled:false,healthDeduction:false,healthMinimumExempt:false}
  const make=(id,gross,extra={})=>({employeeId:id,name:`TEST ${id}`,gross,days:base.days,slip:payroll.payslip({...base,gross}),...extra})
  const lines=[make('ordinary',150000),make('above-cap',2000000),make('zero',0)],totals=p.socialTotals(period,JSON.stringify(lines),today)
  const people=new Map([['ordinary',{identifier:'0010101234',icpv:'000000000001',hours:17625,mode:'known'}],['above-cap',{identifier:'901010123',icpv:'000000000002',hours:99900,mode:'undetermined'}],['zero',{identifier:'9010101235',icpv:'000000000003',hours:0,mode:'known'}]])
  const input={name:'TEST & Test s. r. o.',payer:'0000000012',iban:'SK3112000000198742637541',firstName:'TEST',lastName:'Reviewer',phone:'00421900000000',email:'test@example.test',preparedBy:'TEST Reviewer',declaredOn:today,kind:'R',reason:'',reference:'TEST complete source and legal scope review',checked:true},company={name:input.name,ico:'63333333'}
  const xml=p.socialXml(period,totals,input,company.ico,payday,people),parsed=readSocialXml(xml),xsd=readFileSync(new URL('./xsd/mvpp2026.xsd',import.meta.url),'utf8')
  check('social reporting pins the exact official 2026 XSD bytes',createHash('sha256').update(readFileSync(new URL('./xsd/mvpp2026.xsd',import.meta.url))).digest('hex')===p.SOCIAL_XSD_SHA256)
  let result=await validateXML({xml:[{fileName:'mvpp.xml',contents:xml}],schema:[{fileName:'mvpp2026.xsd',contents:xsd}]})
  check('a full ordinary social report validates against the official XSD',result.valid,JSON.stringify(result.errors))
  check('an independent reader verifies individual funds, totals, zero pay and uncapped accident insurance',totals.issues.length===0&&parsed.rows.length===3&&parsed.rows[1]['@_vzUp']==='20000.00'&&parsed.rows[1]['@_vzNp']==='16764.00'&&parsed.rows[2]['@_npZamnec']==='0.00')
  check('social insurance preserves leading-zero and nine-digit identifiers and employer-assigned numbers',parsed.rows[0]['@_rc']==='0010101234'&&parsed.rows[1]['@_rc']==='901010123'&&parsed.rows[0]['@_icpv']==='000000000001'&&parsed.root.zamestnavatel.identifikacia.variabilnySymbol==='0000000012')
  check('the declared payday remains independent of generation date and hours are exact hundredths',parsed.root.denVyplaty==='12.10.2026'&&parsed.root.vystavenie.datum==='17.10.2026'&&parsed.rows[0]['@_pocetHodin']==='176.25'&&parsed.rows[1]['@_pocetHodin']==='999.00')
  check('SP and second-pillar contributions remain combined while unemployment and support stay distinct',parsed.rows[0]['@_spZamtel']==='210.00'&&parsed.rows[0]['@_pvnZamtel']==='7.50'&&parsed.rows[0]['@_pfpZamtel']==='7.50')
  const corrected=p.socialXml(period,totals,{...input,kind:'O',reason:'TEST complete replacement'},company.ico,payday,people)
  result=await validateXML({xml:[{fileName:'corrected.xml',contents:corrected}],schema:[{fileName:'mvpp2026.xsd',contents:xsd}]})
  check('a corrective MVPP is a complete replacement with all original-source employees',result.valid&&readSocialXml(corrected).rows.length===3&&corrected.includes('<typVykazu>O</typVykazu>'))
  const error=(v={},replace=false)=>p.socialInputError({...input,...v},period,today,company,replace)
  check('social preparation requires an explicit kind, full-scope review and employer identity',error()===null&&Boolean(error({kind:''}))&&Boolean(error({checked:false}))&&Boolean(error({payer:'63333333'}))&&Boolean(error({name:'Other company'}))&&Boolean(error({reference:''})))
  check('SP preparation requires the responsible person’s actual phone and email even when XSD permits empty text',Boolean(error({phone:''}))&&Boolean(error({email:''})))
  check('the social header rejects invalid dates, accounts, controls and silently shortened names',Boolean(error({declaredOn:'2026-10-18'}))&&Boolean(error({declaredOn:'2026-02-31'}))&&Boolean(error({iban:'SK00'}))&&Boolean(error({firstName:'A'.repeat(25)}))&&Boolean(error({lastName:'X\u0001'}))&&Boolean(error({preparedBy:'X\uD800'})))
  check('another social file version needs a recorded reason',Boolean(error({},true))&&error({reason:'TEST checked complete replacement'},true)===null)
  check('even the first internally prepared corrective SP file requires its scope and reason',Boolean(error({kind:'O'}))&&error({kind:'O',reason:'TEST correction of an externally prepared first report'})===null)
  check('analytical hours accept exact decimals and explicit unknown without guessing from salary',p.socialHours('176,25','known',period)===17625&&p.socialHours('0','known',period)===0&&p.socialHours('','known',period)===null&&p.socialHours('','undetermined',period)===99900&&p.socialHours('0','undetermined',period)===null&&p.socialHours('999','known',period)===null&&p.socialHours('176.255','known',period)===null)
  check('the current period or unsupported future rules block automatic social output',p.socialTotals('2026-10',JSON.stringify(lines),today).issues.length>0&&p.socialTotals('2028-09',JSON.stringify(lines),'2028-10-17').issues.length>0)
  const partial=p.socialTotals(period,JSON.stringify([make('x',75000,{days:15})]),today)
  check('a partial month reports its days of the relationship',partial.issues.length===0&&partial.rows[0].days===15)
  // Every relationship the payroll works out (17 October 2026): its type, its funds, its bases, against the XSD.
  const kind=(id,gross,fields)=>make(id,gross,{slip:payroll.payslip({...base,gross,...fields})})
  const kinds=[
    kind('dovp',50000,{contract:'dovp',regular:false}),
    kind('director',80000,{contract:'director',regular:false}),
    kind('director-regular',120000,{contract:'director',regular:true}),
    kind('student',30000,{contract:'dobps',exemption:true}),
    kind('pensioner',40000,{contract:'dopc',regular:true,pension:'old',exemption:true}),
    kind('pensioner-irregular',40000,{contract:'dovp',regular:false,pension:'old'}),
    kind('old-employee',150000,{contract:'employment',pension:'old'}),
  ]
  const all=p.socialTotals(period,JSON.stringify(kinds),today)
  const type=(id)=>all.rows.find((r)=>r.employeeId===id)?.typZec
  check(
    'each relationship has its type of the report: ZECD1N, ZECN, ZEC, ZECD3NV, ZECD2V, ZECD1N, ZEC',
    all.issues.length===0&&type('dovp')==='ZECD1N'&&type('director')==='ZECN'&&type('director-regular')==='ZEC'&&type('student')==='ZECD3NV'&&type('pensioner')==='ZECD2V'&&type('pensioner-irregular')==='ZECD1N'&&type('old-employee')==='ZEC',
    JSON.stringify(all.issues),
  )
  const kindPeople=new Map(kinds.map((l,i)=>[l.employeeId,{identifier:`90101012${String(i).padStart(2,'0')}`,icpv:`0000000001${String(i).padStart(2,'0')}`,hours:4000,mode:'known'}]))
  const kindXml=p.socialXml(period,all,input,company.ico,payday,kindPeople),kindRows=readSocialXml(kindXml).rows,row=(i)=>kindRows[i]
  result=await validateXML({xml:[{fileName:'kinds.xml',contents:kindXml}],schema:[{fileName:'mvpp2026.xsd',contents:xsd}]})
  check('the report of every relationship validates against the official XSD',result.valid,JSON.stringify(result.errors))
  check(
    "an irregular agreement: no sickness nor unemployment base; a director: no accident, guarantee or support, the support left out whole",
    row(0)['@_vzNp']==='0.00'&&row(0)['@_npZamnec']==='0.00'&&row(0)['@_vzUp']==='500.00'&&row(0)['@_pfpZamtel']==='0.00'&&row(1)['@_vzUp']==='0.00'&&row(1)['@_upZamtel']==='0.00'&&row(1)['@_vzPfp']===undefined&&row(1)['@_pfpZamtel']===undefined&&row(2)['@_pvnZamtel']==='12.00',
    JSON.stringify([row(0),row(1),row(2)]),
  )
  check(
    "the deduction lowers the base of pension insurance and the reserve fund only; accident and guarantee from the whole",
    row(3)['@_vzSp']==='100.00'&&row(3)['@_vzRfs']==='100.00'&&row(3)['@_vzUp']==='300.00'&&row(3)['@_vzGp']==='300.00'&&row(4)['@_vzSp']==='200.00'&&row(4)['@_vzIp']==='0.00'&&row(4)['@_vzNp']==='0.00',
    JSON.stringify([row(3),row(4)]),
  )
  const tampered=structuredClone(kinds[0]);tampered.slip.social.employer.accident+=1
  check('a slip whose funds do not agree with its relationship is never reported',p.socialTotals(period,JSON.stringify([tampered]),today).issues.length>0)
  const irregularDeduction=kind('wrong',40000,{contract:'dovp',regular:false,pension:'old'});irregularDeduction.slip.exemption=20000
  check('nor a deduction its relationship cannot have',p.socialTotals(period,JSON.stringify([irregularDeduction]),today).issues.length>0)
  check('missing, duplicate or inconsistent closed social fields cannot be replaced with zeros',p.socialTotals(period,'not JSON',today).issues.length>0&&p.socialTotals(period,JSON.stringify([lines[0],lines[0]]),today).issues.length>0&&p.socialTotals(period,JSON.stringify([{...lines[0],slip:{...lines[0].slip,socialEmployee:0}}]),today).issues.length>0&&p.socialTotals(period,JSON.stringify([{...lines[0],slip:{...lines[0].slip,rulesYear:undefined}}]),today).issues.length>0)
  const p27='2027-09',slip27=payroll.payslip({...base,period:p27,gross:2000000}),t27=p.socialTotals(p27,JSON.stringify([{employeeId:'above-cap',name:'TEST 2027',gross:2000000,days:30,slip:slip27}]),'2027-10-17')
  const xml27=p.socialXml(p27,t27,{...input,declaredOn:'2027-10-17'},company.ico,'2027-10-12',people)
  result=await validateXML({xml:[{fileName:'mvpp2027.xml',contents:xml27}],schema:[{fileName:'mvpp2026.xsd',contents:xsd}]})
  check('verified 2027 ordinary caps use the published 2026 interface without borrowing 2026 amounts',result.valid&&readSocialXml(xml27).rows[0]['@_vzNp']==='17820.00'&&t27.issues.length===0)
  let missing=false;try {p.socialXml(period,totals,input,company.ico,payday,new Map())} catch {missing=true}
  check('XML output cannot invent missing insured-person facts',missing)
  check('SP fact intake requires fresh confirmation and safely returns to GET preparation without POST replay',security.sensitivePath('/ucto/klienti/co/mzdove-podania/t/udaje-sp','POST')&&security.actionReturn('/ucto/klienti/co/mzdove-podania/t/udaje-sp')==='/ucto/klienti/co/mzdove-podania/t/pripravit')
}
