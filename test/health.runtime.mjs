// Synthetic employees and receipts. This exercises the actual close/prepare/import-file workflow, never a live insurer.
import { writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { check } from './check.mjs'
import { readHealthText } from './health-text.mjs'
import { healthReporting as h, payrollReporting as p, payrollGeneration as fs, companyOf, filingQueue, teamDeadlines, exportYear, healthPendingPayrollSql } from '../.wrangler/dist/stores.js'

export async function checkHealthReports({db,files,acc,admin,lucia,nowS,day,signIn,as,unzip,capture,foreign}) {
  const today=day(0),date=new Date(`${today.slice(0,7)}-15T12:00:00Z`);date.setUTCMonth(date.getUTCMonth()-1)
  const period=date.toISOString().slice(0,7);date.setUTCMonth(date.getUTCMonth()-1);const older=date.toISOString().slice(0,7)
  const company='co-health-generation',base=`/ucto/klienti/${company}/mzdove-podania`,bank='SK3112000000198742637541'
  const user=await db.prepare('SELECT * FROM users WHERE id=?').bind(lucia.id).first(),root=await db.prepare("SELECT * FROM users WHERE team='admin' ORDER BY id LIMIT 1").first()
  const employeeRows=[['h-main','25',150000,false,false],['h-low','25',30000,false,true],['h-dovera','24',100000,false,false],['h-union','27',50000,true,false]]
  const rawIds=new Map([['h-main','0010101234'],['h-low','901010123'],['h-dovera','8310101234'],['h-union','8510101234']])
  await db.batch([
    db.prepare("INSERT INTO companies(id,created_at,name,ico,dic,plan,inbox,accountant_id,start_on,invoice_iban,payroll) VALUES(?,?,'TEST Zdravotné podania s. r. o.','63338888','2126333888','rast','healthgeneration',?,?,?,?)").bind(company,nowS,user.id,`${older}-01`,bank,JSON.stringify({payday:12,health:{24:{vs:'0000000024'},25:{vs:'0000000025'},27:{vs:'0000000027'}}})),
    db.prepare("INSERT INTO users(id,created_at,name,email) VALUES('health-owner',?,'TEST Health owner','health-owner@firmony.test'),('health-member',?,'TEST Health member','health-member@firmony.test')").bind(nowS,nowS),
    db.prepare("INSERT INTO members(company_id,user_id,role,created_at) VALUES(?,'health-owner','owner',?),(?,'health-member','member',?)").bind(company,nowS,company,nowS),
    ...employeeRows.map(([id,insurer,wage,disabled,deduct])=>db.prepare('INSERT INTO employees(id,company_id,name,insurer,started_on,wage_cents,declaration,disabled,health_deduction,created_at) VALUES(?,?,?,?,?,?,1,?,?,?)').bind(id,company,`TEST Employee ${id}`,insurer,`${older}-01`,wage,disabled?1:0,deduct?1:0,nowS)),
  ])
  const owner=as((await signIn('health-owner@firmony.test')).cookie),member=as((await signIn('health-member@firmony.test')).cookie)
  const co=()=>db.prepare('SELECT * FROM companies WHERE id=?').bind(company).first().then(companyOf)
  const close=async(of)=>acc.post(`/ucto/klienti/${company}/mzdy`,{obdobie:of,vyplata:`${today.slice(0,7)}-12`,akcia:'uzavriet',...Object.fromEntries(employeeRows.map(([id,,gross])=>[`hruba_${id}`,String(gross/100)]))})
  let res=await close(period),closure=await p.closureOf(db,company,period)
  check('actual monthly close stores insurance regimes alongside the immutable payslips',res.status===303&&Boolean(closure)&&JSON.parse(closure.lines).every((l)=>typeof l.health?.minimumExempt==='boolean'))
  let targets=await p.reportItems(db,company),target=targets.find((t)=>t.kind==='health25')
  const plan=()=>h.healthPlan(db,company,target.id,today)
  res=await acc.get(`${base}/${target.id}/pripravit`);let html=await res.text()
  check('first preparation asks staff for verified identifiers without inferring them from birth dates',res.status===200&&html.includes('health-id-form')&&!html.includes('health-report-form')&&!html.includes('0010101234'))
  if(capture)writeFileSync(`${capture}/health-missing.html`,html)
  const initial=await plan()
  const identity=(id,extra={})=>({employee:id,revision:'0',identifier:rawIds.get(id),reference:`TEST verified employee document ${id}`,reason:'',checked:'1',...extra})
  res=await acc.post(`${base}/${target.id}/poistenec`,identity('h-main',{checked:''}))
  check('insured identity intake needs an explicit document check',res.status===409&&!(await plan()).identities.length)
  const race=await Promise.all([1,2].map(()=>acc.post(`${base}/${target.id}/poistenec`,identity('h-main'))))
  check('concurrent identity intake appends one verified revision',race.filter((r)=>r.status===303).length===1&&(await plan()).identities.filter((i)=>i.employee_id==='h-main').length===1)
  res=await acc.post(`${base}/${target.id}/poistenec`,identity('h-dovera'))
  check('one insurer cannot assign an identity to an employee outside its closed source',res.status===409&&!(await db.prepare('SELECT 1 FROM payroll_health_ids WHERE employee_id=?').bind('h-dovera').first()))
  for(const [id,code] of employeeRows.slice(1)) {
    const t=targets.find((t)=>t.kind===`health${code}`)
    res=await acc.post(`${base}/${t.id}/poistenec`,identity(id))
    check(`a checked identity is captured for ${code} without client administration`,res.status===303)
  }
  const values={name:'TEST Zdravotné podania s. r. o.',dic:'2126333888',payer:'0000000025',branch:'2500',iban:bank,phone:'',email:'test@example.test',sendOn:today,batch:'1',kind:'N',reason:'',reference:'TEST complete ordinary payroll review',checked:'1'}
  res=await acc.post(`${base}/${target.id}/generovat`,{...values,token:initial.token})
  check('a preview opened before identity verification cannot silently generate a file',res.status===409&&!(await p.reportItem(db,company,target.id)).pkg)
  let reviewed=await plan()
  res=await acc.get(`${base}/${target.id}/pripravit`);html=await res.text()
  check('verified identifiers are masked and remembered while the employer header is prefilled',res.status===200&&html.includes('health-report-form')&&html.includes('končí 1234')&&!html.includes('0010101234')&&html.includes(bank)&&html.includes('0000000025'))
  if(capture)writeFileSync(`${capture}/health-ready.html`,html)
  res=await acc.post(`${base}/${target.id}/generovat`,{...values,checked:'',token:reviewed.token});html=await res.text()
  check('health generation requires a complete-scope review and preserves entered header values',res.status===409&&html.includes(values.reference)&&!(await p.reportItem(db,company,target.id)).pkg)
  if(capture)writeFileSync(`${capture}/health-error.html`,html)
  res=await acc.post(`${base}/${target.id}/generovat`,{...values,branch:'2400',token:reviewed.token})
  check('a wrong-recipient branch is refused before storage',res.status===409&&!(await p.reportItem(db,company,target.id)).pkg)
  const generationRace=await Promise.all([1,2].map(()=>acc.post(`${base}/${target.id}/generovat`,{...values,token:reviewed.token})))
  target=await p.reportItem(db,company,target.id)
  check('concurrent 514 preparation commits one exact file and one origin record',generationRace.filter((r)=>r.status===303).length===1&&(await p.reportHistory(db,company,target.id)).length===1&&(await db.prepare('SELECT COUNT(*) AS n FROM payroll_health_generations WHERE company_id=?').bind(company).first()).n===1)
  const first=target.pkg
  res=await acc.get(`${base}/${target.id}/verzie/${first.id}/dokument`)
  const text=await res.text(),parsed=readHealthText(text)
  check('HTTP generation downloads a normative file name and independent valid 514 text',res.status===200&&res.headers.get('content-disposition').includes(`N514${period.slice(2,4)}${period.slice(5)}.001`)&&parsed.rows.length===2&&parsed.id[4]==='2500'&&parsed.rows.some((r)=>r[16]==='12,45'))
  const meta=await fs.generationOf(db,company,first.id),details=JSON.parse(meta.details)
  check('514 origin binds the closed source, exact file and identity revisions without copying raw identifiers',meta.format==='ZP514-TXT-2026'&&createHash('sha256').update(meta.details).digest('hex')===meta.sha256&&details.fileSha256===first.sha256&&details.sourceHash===closure.sha256&&JSON.parse(details.identitiesJson).length===2&&!meta.details.includes('0010101234'))
  res=await owner.get(`/app/mzdove-podania/${target.id}`);html=await res.text()
  check('the owner sees the same prepared health file without private intake or accounting forms',res.status===200&&html.includes('ZP514-TXT-2026')&&!html.includes('health-id-form')&&!html.includes('payroll-report-upload')&&!html.includes('0010101234'))
  if(capture)writeFileSync(`${capture}/health-client.html`,html)
  check('invited members and foreign companies cannot read employee files or invoke intake',(await member.get(`/app/mzdove-podania/${target.id}`)).status===404&&(await foreign.get(`/app/mzdove-podania/${target.id}/verzie/${first.id}/dokument`)).status===404&&(await owner.post(`/app/mzdove-podania/${target.id}/poistenec`,identity('h-main'))).status===404)
  reviewed=await plan();const rawBatch=db.batch.bind(db);let revoked=false
  const raceDb={prepare:db.prepare.bind(db),async batch(s){if(!revoked){revoked=true;await db.prepare('UPDATE companies SET accountant_id=NULL WHERE id=?').bind(company).run()}return rawBatch(s)}}
  const denied=await h.generateHealth(raceDb,files,reviewed,user,reviewed.token,{...values,checked:true,reason:'TEST replacement after verified review'},today)
  check('514 SQL rechecks live assignment after header and source review',!denied.ok&&(await p.reportHistory(db,company,target.id)).length===1&&Boolean(await files.head(first.file_key)))
  await db.prepare('UPDATE companies SET accountant_id=? WHERE id=?').bind(user.id,company).run()
  const accept=async(t,actor=user)=>p.changeReportDelivery(db,files,t.pkg,actor,{to:'accepted',revision:t.pkg.revision,externalOn:today,reference:`TEST-HEALTH-${t.pkg.id}`,channel:'TEST ONLY insurer',checked:true,reason:'',receipt:{name:'TEST_ONLY-receipt.xml',bytes:new TextEncoder().encode(`<TEST_ONLY health="${t.kind}" package="${t.pkg.id}"/>`)}},today)
  await accept(target)
  check('a health acceptance finishes only its exact recipient',(await p.reportItem(db,company,target.id)).status==='accepted'&&(await p.reportItem(db,company,targets.find((t)=>t.kind==='health24').id)).status==='unverified')
  await db.prepare('UPDATE employees SET disabled=1 WHERE id=?').bind('h-main').run()
  const historical=await plan()
  check('changing the current employee card never rewrites an old closed insurance regime',historical.totals.rows.find((r)=>r.employeeId==='h-main').disabled===false&&historical.totals.rows.find((r)=>r.employeeId==='h-main').employer===16500&&(await p.reportItem(db,company,target.id)).status==='accepted')
  await db.prepare('UPDATE employees SET disabled=0 WHERE id=?').bind('h-main').run()
  for(const code of ['24','27']) {
    const t=targets.find((x)=>x.kind===`health${code}`),review=await h.healthPlan(db,company,t.id,today)
    res=await acc.post(`${base}/${t.id}/generovat`,{...values,payer:`00000000${code}`,branch:`${code}00`,token:review.token})
    const item=await p.reportItem(db,company,t.id);await accept(item)
    const result=readHealthText(await (await files.get(item.pkg.file_key)).text())
    check(`the same normative generator scopes recipient ${code} to its own insured employee`,res.status===303&&result.rows.length===1&&result.id[4]===`${code}00`&&result.rows[0][1]===rawIds.get(code==='24'?'h-dovera':'h-union'))
  }
  // Complete the other recipients so the following freeze rejection is caused by the changed health identity alone.
  const sp=targets.find((t)=>t.kind==='sp'),spFile=await p.saveReport(db,files,sp,user,{revision:sp.revision,variant:'TEST ONLY SP',checked:true,reason:'',file:{name:'TEST_ONLY-sp.xml',bytes:new TextEncoder().encode('<TEST_ONLY recipient="SP"/>')}})
  await accept({...sp,pkg:await p.reportPackage(db,company,spFile.id)})
  await p.recordPayout(db,closure,user,{paidOn:today,reportPeriod:period,reference:'TEST settled complete bank payroll',checked:true,reason:'',revision:0},today)
  const tax=(await p.reportItems(db,company)).find((t)=>t.kind==='tax'),fsPlan=await fs.generationPlan(db,company,tax.id,today)
  const fsSaved=await fs.generatePrehlad(db,files,fsPlan,user,fsPlan.token,{dic:values.dic,name:values.name,street:'Testová',number:'12',postal:'04001',city:'Košice',preparedBy:'TEST Health reviewer',phone:'',email:'',declaredOn:today,kind:'R',foundOn:'',representation:'company',reason:'',reference:'TEST complete monthly FS payroll',checked:true},today)
  await accept({...tax,pkg:await p.reportPackage(db,company,fsSaved.id)})
  const pending=async()=>Boolean((await db.prepare(`SELECT ${healthPendingPayrollSql('?1')} AS pending`).bind(company).first()).pending)
  check('all independently accepted current recipients clear payroll handover work',!await pending())
  res=await acc.post(`${base}/${target.id}/poistenec`,identity('h-main',{revision:'1',identifier:'0010101235',reason:'TEST corrected verified identity'}))
  check('a verified insured identifier cannot be overwritten by an ordinary accountant',res.status===409&&(await plan()).identities.find((i)=>i.employee_id==='h-main').revision===1)
  res=await admin.post(`${base}/${target.id}/poistenec`,identity('h-main',{revision:'1',identifier:'0010101235',reason:'TEST administrator corrected verified identity'}))
  target=await p.reportItem(db,company,target.id)
  check('an admin correction appends identity history and invalidates old accepted generated coverage',res.status===303&&target.sourceChanged&&target.status==='unverified'&&target.pkg.status==='accepted'&&(await db.prepare('SELECT COUNT(*) AS n FROM payroll_health_ids WHERE employee_id=?').bind('h-main').first()).n===2&&(await p.reportEvents(db,company,first.id)).length===1)
  res=await admin.post(`${base}/${target.id}/poistenec`,identity('h-main',{revision:'2',identifier:'0010101235',reference:'TEST corrected original-document reference',reason:'TEST administrator corrected the evidence reference without changing identity'}))
  const correctedIdentity=(await plan()).identities.find((i)=>i.employee_id==='h-main')
  check('an admin can correct the evidence reference without inventing a different identifier',res.status===303&&correctedIdentity.revision===3&&correctedIdentity.identifier==='0010101235'&&correctedIdentity.reference==='TEST corrected original-document reference')
  check('identity correction reopens its deadline and work queue while leaving other insurers current',(await filingQueue(db,user)).some((r)=>r.id===target.id)&&(await teamDeadlines(db,user,false,today,{company})).dues.some((d)=>d.reportId===target.id&&d.state==='blocked')&&!(await p.reportItem(db,company,targets.find((t)=>t.kind==='health24').id)).sourceChanged)
  let frozen=false;try{await db.prepare('UPDATE companies SET purge_started_at=? WHERE id=?').bind(nowS,company).run()}catch{frozen=true}
  check('changed health identity alone prevents a falsely complete handover freeze',await pending()&&frozen)
  res=await admin.get(`${base}/${target.id}`);html=await res.text();if(capture)writeFileSync(`${capture}/health-changed.html`,html)
  reviewed=await plan();res=await admin.post(`${base}/${target.id}/generovat`,{...values,kind:'O',batch:'2',reason:'TEST expert full report with corrected identity',token:reviewed.token})
  const corrected=await p.reportItem(db,company,target.id);await accept(corrected,root)
  check('an expert full replacement binds new identity while preserving original file and receipt',res.status===303&&corrected.pkg.previous_id===first.id&&(await (await files.get(first.file_key)).text())===text&&!await pending())
  res=await close(older);const previousTarget=(await p.reportItems(db,company,older)).find((t)=>t.kind==='health25'),reused=await h.healthPlan(db,company,previousTarget.id,today)
  check('later preparation reuses verified identifiers and last reviewed payer header without asking the client',res.status===303&&reused.issues.length===0&&reused.identities.length===2&&reused.defaults.branch==='2500'&&reused.defaults.iban===bank)
  const archive=await exportYear({DB:db,FILES:files},await co(),period.slice(0,4),null,today),zip=await unzip(new Uint8Array(await new Response(archive.body).arrayBuffer())),names=Array.isArray(zip)?zip.map((f)=>f.name):[...zip.keys()]
  check('the complete archive preserves identity history, origin and required import filenames',names.includes('data/identifikatory-poistencov.json')&&names.includes('data/generovanie-zdravotnych-vykazov.json')&&names.some((n)=>n.endsWith(`/N514${period.slice(2,4)}${period.slice(5)}.001`))&&names.some((n)=>n.endsWith(`/O514${period.slice(2,4)}${period.slice(5)}.001`)))
  for(const table of ['payroll_health_ids','payroll_health_generations']) {let denied=false;try{await db.prepare(`DELETE FROM ${table} WHERE company_id=?`).bind(company).run()}catch{denied=true}check('health identity and generation evidence cannot be deleted outside controlled retention',denied)}
}
