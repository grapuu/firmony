import { check } from './check.mjs'
import { healthReporting as h, payroll, payrollStore, security } from '../.wrangler/tmp/units-bundle.mjs'
import { readHealthText } from './health-text.mjs'

export function checkHealth() {
  const period='2026-09',today='2026-10-17',kind='health25'
  const row=(id,gross,disabled=false,deductionClaimed=false,minimumExempt=false,insurer='25')=>({employeeId:id,name:`TEST ${id}`,insurer,gross,days:30,health:{disabled,deductionClaimed,minimumExempt},slip:payroll.payslip({period,gross,days:30,disabled,healthDeduction:deductionClaimed,healthMinimumExempt:minimumExempt,declaration:true,children:[]})})
  const rows=[row('ordinary',150000),row('low',30000,false,true),row('disabled',50000,true),row('other',100000,false,false,false,'24')]
  const totals=h.healthTotals(period,kind,JSON.stringify(rows),today)
  const v={name:'TEST Zdravotný výkaz s. r. o.',dic:'2126333888',payer:'6333888800',branch:'2500',iban:'SK3112000000198742637541',phone:'+421900000000',email:'test@example.test',sendOn:today,batch:'12',kind:'N',reason:'',reference:'TEST verified complete monthly scope',checked:true}
  const company={name:v.name,dic:v.dic,ico:'63338888'}
  const error=(x={},replacing=false)=>h.healthInputError({...v,...x},period,kind,today,company,replacing)
  check('514 uses closed insurer-specific sums and counts all represented employees',totals.issues.length===0&&totals.rows.length===3&&totals.allEmployees===4&&totals.total===32545)
  check('514 validates the company payer code, branch and own bank account',error()===null&&Boolean(error({payer:'123'}))&&Boolean(error({branch:'2400'}))&&Boolean(error({iban:'SK0012000000198742637541'})))
  const identifiers=new Map([['ordinary','0010101234'],['low','901010123'],['disabled','8510101234']])
  const txt=h.healthText(period,totals,v,company.ico,'2026-10-12',identifiers),parsed=readHealthText(txt)
  check('514 independent reader verifies the complete 10/13/20/17-field contract',parsed.id[7]==='3'&&parsed.employer[0]==='202609'&&parsed.employer[1]==='12'&&parsed.summary[19]==='4')
  check('514 keeps the separate minimum top-up and the employer/employee assessment bases',parsed.rows[1].join('|')==='2|901010123|30|11,00|5,00|300,00|0,00|33,00|0,00|45,45|300,00|0,00|300,00|||0|12,45')
  check('514 preserves leading zeros and nine-digit insured identifiers without deriving them',parsed.rows[0][1]==='0010101234'&&parsed.rows[1][1]==='901010123')
  check('514 reports disabled rates separately with no minimum top-up',parsed.rows[2][3]==='5,50'&&parsed.rows[2][4]==='2,50'&&parsed.rows[2][15]==='1'&&parsed.rows[2][16]==='0,00')
  check('514 never substitutes an unverified identifier',!h.insuredId('')&&!h.insuredId('901010/1234')&&!h.insuredId('not known'))
  let refused=false;try{h.healthText(period,totals,v,company.ico,'2026-10-12',new Map())}catch{refused=true}check('514 cannot serialize missing insured identifiers',refused)
  check('514 preserves normative file naming and UTF-8 text without a BOM',h.healthFilename(period,'N')==='N5142609.001'&&h.healthFilename('2027-01','O')==='O5142701.001'&&!txt.startsWith('\uFEFF')&&txt.includes('Zdravotný'))
  check('514 rejects additive differences, absent scope attestation and unexplained successors',Boolean(error({kind:'A'}))&&Boolean(error({checked:false}))&&Boolean(error({},true))&&error({kind:'O',reason:'TEST expert full replacement'},true)===null)
  check('514 rejects a premature period or invalid planned date and batch number',Boolean(error({sendOn:'2026-09-30'}))&&Boolean(error({sendOn:'2026-02-30'}))&&Boolean(error({sendOn:'2026-10-18'}))&&Boolean(error({batch:'0'}))&&h.healthTotals('2026-10',kind,JSON.stringify(rows),today).issues.length>0)
  check('514 text fields reject delimiter and line injection instead of corrupting the batch',Boolean(error({email:'a|b@example.test'}))&&Boolean(error({name:company.name+'\n'}))&&Boolean(error({phone:'+421900000000\n'})))
  const missing=rows.map((r)=>{const{health,...old}=r;return old})
  check('legacy closed slips cannot infer their old insurance flags from current people',h.healthTotals(period,kind,JSON.stringify(missing),today).issues.length>0)
  check('514 blocks inconsistent closed contributions and duplicate source people',h.healthTotals(period,kind,JSON.stringify([{...rows[0],slip:{...rows[0].slip,healthEmployee:1}}]),today).issues.length>0&&h.healthTotals(period,kind,JSON.stringify([rows[0],rows[0]]),today).issues.length>0)
  check('514 can represent a zero-contribution disabled employee',h.healthTotals(period,kind,JSON.stringify([row('zero',0,true)]),today).issues.length===0)
  const nextSlip=payroll.payslip({period:'2027-01',gross:30000,days:31,declaration:true,children:[],disabled:false,healthDeduction:true,healthMinimumExempt:false})
  const nextRow={...row('next-year',30000,false,true),days:31,slip:nextSlip}
  check('514 uses the stored 2027 minimum and refuses unsupported years',h.healthTotals('2027-01',kind,JSON.stringify([nextRow]),'2027-02-01').issues.length===0&&nextSlip.healthTopUp===1423&&h.healthTotals('2028-01',kind,JSON.stringify([nextRow]),'2028-02-01').issues.length>0)
  const employees=[{id:'TEST employee',name:'TEST Employee',bornOn:null,insurer:'25',startedOn:'2026-01-01',endedOn:null,wage:150000,declaration:true,disabled:false,healthDeduction:false,healthExempt:false,children:[],iban:null}]
  check('new month slips retain the exact insurance regime in the closeable snapshot',payrollStore.monthSlips(period,employees,null)[0].health?.minimumExempt===false&&payrollStore.monthSlips(period,[{...employees[0],disabled:true}],null)[0].health.disabled===true)
  check('identity intake resumes on fresh GET preparation without replaying the private POST',security.actionReturn('/ucto/klienti/co/mzdove-podania/t/poistenec')==='/ucto/klienti/co/mzdove-podania/t/pripravit'&&security.sensitivePath('/ucto/klienti/co/mzdove-podania/t/poistenec','POST'))
}
