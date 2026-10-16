import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { validateXML } from 'xmllint-wasm'
import { prehlad as p, payroll, payrollReporting, security } from '../.wrangler/tmp/units-bundle.mjs'
import { check } from './check.mjs'

export async function checkPrehlad() {
  const period='2026-09',today='2026-10-16'
  const slip=payroll.payslip({period,gross:150000,days:30,declaration:true,children:[],disabled:false,healthDeduction:false,healthMinimumExempt:false})
  const line={employeeId:'TEST employee',gross:150000,slip}
  const source={id:'TEST closure',period,report_period:period,paid_on:'2026-10-12',lines:JSON.stringify([line])}
  const totals=p.prehladTotals(period,[source],today)
  const input={dic:'2126333555',name:'TEST & Test s. r. o.',street:'Testová',number:'12/3',postal:'04001',city:'Košice',preparedBy:'TEST Preparer',phone:'+421900000000',email:'test@example.test',declaredOn:today,kind:'R',foundOn:'',representation:'company',reason:'',reference:'TEST independent complete review',checked:true}
  const company={name:input.name,dic:input.dic}
  check('PREHLAD uses the reviewed reporting month with the actual next-month payout date',totals.issues.length===0 && totals.gross===150000 && totals.advance===slip.advance && totals.paidOn==='2026-10-12')
  const xml=p.prehladXml(period,totals,input),xsd=readFileSync(new URL('./xsd/prehlad2026.xsd',import.meta.url),'utf8')
  check('the PREHLAD schema is an unchanged pinned primary-source file',createHash('sha256').update(readFileSync(new URL('./xsd/prehlad2026.xsd',import.meta.url))).digest('hex')===p.PREHLAD_XSD_SHA256)
  let result=await validateXML({xml:[{fileName:'overview.xml',contents:xml}],schema:[{fileName:'prehlad2026.xsd',contents:xsd}]})
  check('an ordinary PREHLADv26 document validates against the official XSD',result.valid,JSON.stringify(result.errors))
  check('PREHLAD preserves independent period, date and exact integer-cent totals',xml.includes('<mesiac>09</mesiac><rok>2026</rok>') && xml.includes('<datum>12.10.2026</datum>') && xml.includes('<r00>1500.00</r00>') && xml.includes(`<r04>${(slip.advance/100).toFixed(2)}</r04>`) && xml.includes('<obchodneMeno>TEST &amp; Test s. r. o.</obchodneMeno>'))
  const error=(v={},poa=false,replacing=false)=>p.prehladInputError({...input,...v},period,today,company,poa,replacing)
  check('the user explicitly chooses ordinary versus corrective filing and representation',Boolean(error({kind:''})) && Boolean(error({representation:''})) && error()===null)
  check('a different company, missing completeness review or absent review reference is refused',Boolean(error({dic:'2126333556'})) && Boolean(error({name:'Different company'})) && Boolean(error({checked:false})) && Boolean(error({reference:''})))
  check('a lawyer-reviewed power is not inferred from a selected representative',Boolean(error({representation:'firmony'})) && error({representation:'firmony'},true)===null)
  check('unstructured addresses and forbidden XML controls cannot become a form',Boolean(error({postal:'040 01'})) && Boolean(error({street:'X\u0001Y'})) && Boolean(error({street:'x'.repeat(31)})))
  check('correction discovery date is required, bounded and kept off ordinary reports',Boolean(error({kind:'O'})) && Boolean(error({kind:'O',foundOn:'2026-10-17'})) && Boolean(error({foundOn:'2026-10-10'})) && error({kind:'O',foundOn:'2026-10-15',reason:'TEST full correction of initial report'})===null)
  check('superseding an earlier exact file needs an explicit reason',Boolean(error({},false,true)) && error({reason:'TEST expert replacement before sending'},false,true)===null)
  const corrected=p.prehladXml(period,totals,{...input,kind:'O',foundOn:'2026-10-15',representation:'firmony'})
  result=await validateXML({xml:[{fileName:'corrected.xml',contents:corrected}],schema:[{fileName:'prehlad2026.xsd',contents:xsd}]})
  check('a corrective overview with the explicit company representative validates',result.valid && corrected.includes('<opravny>1</opravny>') && corrected.includes('<datumZisteniaOP>15.10.2026</datumZisteniaOP>') && corrected.includes('<dic>2122734449</dic>'),JSON.stringify(result.errors))
  check('current and unsupported report periods are blocked',p.prehladTotals('2026-10',[{...source,period:'2026-10',report_period:'2026-10'}],today).issues.length>0 && p.prehladTotals('2028-09',[source],'2028-10-16').issues.length>0)
  check('a source from another earned month or an unreviewed report month cannot be guessed',p.prehladTotals(period,[{...source,period:'2026-08'}],today).issues.length>0 && p.prehladTotals(period,[{...source,report_period:null}],today).issues.length>0)
  check('duplicate source rows and corrupt closed slips are blocked',p.prehladTotals(period,[source,source],today).issues.length>0 && p.prehladTotals(period,[{...source,lines:'not JSON'}],today).issues.length>0 && p.prehladTotals(period,[{...source,lines:JSON.stringify([{...line,slip:{...slip,advance:NaN}}])}],today).issues.length>0)
  const bonus=payroll.payslip({period,gross:150000,days:30,declaration:true,children:[{name:'TEST child',born:'2020-01-01'}],disabled:false,healthDeduction:false,healthMinimumExempt:false})
  check('child-bonus figures require the external expert path instead of being zeroed',p.prehladTotals(period,[{...source,lines:JSON.stringify([{...line,slip:bonus}])}],today).issues.length>0)
  check('staff cannot copy an actual cash month into an unreviewed reporting period',Boolean(payrollReporting.payoutError({paidOn:'2026-10-12',reportPeriod:'',reference:'TEST bank settlement',checked:true,reason:'',revision:0},0,false,today,period)))
  check('PREHLAD resumes on preparation and scope review on evidence without POST replay',security.actionReturn('/ucto/klienti/co/mzdove-podania/t/generovat')==='/ucto/klienti/co/mzdove-podania/t/pripravit' && security.actionReturn('/ucto/klienti/co/mzdove-podania/t/preverit-rozsah')==='/ucto/klienti/co/mzdove-podania/t' && security.sensitivePath('/ucto/klienti/co/mzdove-podania/t/pripravit','GET'))
}
