// End-to-end PREHLAD preparation and reviewed period corrections. All companies, reports and proofs are synthetic.
import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { validateXML } from 'xmllint-wasm'
import { check } from './check.mjs'
import { payrollGeneration as g, payrollReporting as p, companyOf, payslip, filingQueue, exportYear } from '../.wrangler/dist/stores.js'

export async function checkPrehlad({db,files,acc,admin,lucia,nowS,day,signIn,as,unzip,capture}) {
  const company='co-generated-overview',today=day(0),m=new Date(`${today.slice(0,7)}-15T12:00:00Z`);m.setUTCMonth(m.getUTCMonth()-1)
  const period=m.toISOString().slice(0,7),base=`/ucto/klienti/${company}/mzdove-podania`
  const user=await db.prepare('SELECT * FROM users WHERE id=?').bind(lucia.id).first(),adminUser=await db.prepare("SELECT * FROM users WHERE team='admin' ORDER BY id LIMIT 1").first()
  await db.batch([
    db.prepare("INSERT INTO companies(id,created_at,name,ico,dic,address,plan,inbox,accountant_id,start_on) VALUES(?,?,'Generovaný prehľad s. r. o.','63336666','2126333666','Testová 12, 040 01 Košice','rast','generatedoverview',?,?)").bind(company,nowS,lucia.id,`${period}-01`),
    db.prepare("INSERT INTO users(id,created_at,name,email) VALUES('overview-owner',?,'TEST owner','overview-owner@firmony.test')").bind(nowS),
    db.prepare("INSERT INTO members(company_id,user_id,role,created_at) VALUES(?,'overview-owner','owner',?)").bind(company,nowS),
  ])
  const owner=as((await signIn('overview-owner@firmony.test')).cookie),foreign=as((await signIn('boris@firma-b.test')).cookie)
  const co=()=>db.prepare('SELECT * FROM companies WHERE id=?').bind(company).first().then(companyOf)
  const slip=payslip({period,gross:150000,days:30,declaration:true,children:[],disabled:false,healthDeduction:false,healthMinimumExempt:false})
  await db.prepare('INSERT INTO payroll_runs(company_id,period,payday,lines,closed_at,closed_on,closed_by) VALUES(?,?,?,?,?,?,?)').bind(company,period,today,JSON.stringify([{employeeId:'TEST-overview-employee',name:'TEST private employee',insurer:'25',gross:150000,days:30,slip}]),nowS,today,user.id).run()
  await p.initializeClosedRun(db,await co(),period,user)
  const closure=await p.closureOf(db,company,period)
  await p.recordPayout(db,closure,user,{paidOn:today,reportPeriod:period,reference:'TEST verified settled full payroll',reason:'',checked:true,revision:0},today)
  let tax=(await p.reportItems(db,company)).find((r)=>r.kind==='tax')
  const plan=()=>g.generationPlan(db,company,tax.id,today)
  const input={dic:'2126333666',name:'Generovaný prehľad s. r. o.',street:'Testová',number:'12',postal:'04001',city:'Košice',preparedBy:'TEST Lucia',phone:'',email:'test@example.test',declaredOn:today,kind:'R',foundOn:'',representation:'company',reason:'',reference:'TEST complete monthly payroll review',checked:'1'}
  let res=await acc.get(`${base}/${tax.id}/pripravit`),html=await res.text()
  check('the accountant sees a source-based PREHLAD preview with a separate report month',res.status===200 && html.includes('prehlad-form') && html.includes('riadok 0') && html.replaceAll('\u00a0',' ').includes('1 500,00'))
  if(capture)writeFileSync(`${capture}/prehlad-ready.html`,html)
  let token=(await plan()).token
  res=await acc.post(`${base}/${tax.id}/generovat`,{...input,token,checked:''})
  html=await res.text()
  check('generation needs an explicit complete-scope check and preserves the entered reference',res.status===409 && html.includes(input.reference) && !(await p.reportItem(db,company,tax.id)).pkg)
  if(capture)writeFileSync(`${capture}/prehlad-error.html`,html)
  res=await acc.post(`${base}/${tax.id}/generovat`,{...input,token,representation:'firmony'})
  check('a selected representative does not manufacture a checked power of attorney',res.status===409 && !(await p.reportItem(db,company,tax.id)).pkg)
  const race=await Promise.all([1,2].map(()=>acc.post(`${base}/${tax.id}/generovat`,{...input,token})))
  res=race.find((r)=>r.status===303) ?? race[0]
  tax=await p.reportItem(db,company,tax.id)
  check('concurrent generation from one preview commits one exact report and provenance row',race.filter((r)=>r.status===303).length===1 && (await p.reportHistory(db,company,tax.id)).length===1 && (await db.prepare('SELECT COUNT(*) AS n FROM payroll_generations WHERE company_id=?').bind(company).first()).n===1)
  check('the HTTP preparation stores exact generated XML as prepared',res.status===303 && tax.status==='prepared' && tax.pkg.variant.startsWith('PREHLADv26'))
  const first=tax.pkg,meta=await g.generationOf(db,company,first.id),details=JSON.parse(meta.details)
  check('generated provenance binds the reviewed input, source hash and exact file bytes',meta.by_user===user.id && createHash('sha256').update(meta.details).digest('hex')===meta.sha256 && details.input.checked===true && details.sourceHash===first.source_hash && details.fileSha256===first.sha256)
  res=await acc.get(`${base}/${tax.id}/verzie/${first.id}/dokument`)
  const xml=await res.text(),month=period.slice(5),paidDate=`${today.slice(8,10)}.${today.slice(5,7)}.${today.slice(0,4)}`
  check('generated XML keeps the reviewed earned-month example separate from its following-month payout',res.status===200 && xml.includes(`<mesiac>${month}</mesiac>`) && xml.includes(`<datum>${paidDate}</datum>`) && !xml.includes('TEST private employee'))
  const valid=await validateXML({xml:[{fileName:first.name,contents:xml}],schema:[{fileName:'prehlad2026.xsd',contents:readFileSync(new URL('./xsd/prehlad2026.xsd',import.meta.url),'utf8')}]})
  check('the actual HTTP-generated file validates against the independent official XSD',valid.valid,JSON.stringify(valid.errors))
  let noStorage=false;try{await exportYear({DB:db},await co(),period.slice(0,4),null,today)}catch{noStorage=true}
  check('a payroll-only original cannot be exported successfully without its file storage',noStorage)
  const reviewed=await plan(),rawBatch=db.batch.bind(db);let revoked=false
  const raceDb={prepare:db.prepare.bind(db),async batch(statements){if(!revoked){revoked=true;await db.prepare('UPDATE companies SET accountant_id=NULL WHERE id=?').bind(company).run()}return rawBatch(statements)}}
  const denied=await g.generatePrehlad(raceDb,files,reviewed,user,reviewed.token,{...input,checked:true,reason:'TEST concurrent replacement before sending'},today)
  check('generation rechecks assignment inside SQL after the professional preview',!denied.ok && (await p.reportHistory(db,company,tax.id)).length===1 && Boolean(await files.head(first.file_key)))
  await db.prepare('UPDATE companies SET accountant_id=? WHERE id=?').bind(user.id,company).run()
  res=await owner.get(`/app/mzdove-podania/${tax.id}`);html=await res.text()
  check('the owner sees generated origin with the same prepared state and no staff form',res.status===200 && html.includes('Vytvorené vo Firmony') && !html.includes('prehlad-form') && !html.includes('payroll-report-upload'))
  if(capture)writeFileSync(`${capture}/prehlad-generated-client.html`,html)
  check('customers and other companies cannot invoke preparation or read generated files across scope',(await owner.post(`/app/mzdove-podania/${tax.id}/generovat`,input)).status===404 && (await foreign.get(`/app/mzdove-podania/${tax.id}/verzie/${first.id}/dokument`)).status===404 && (await acc.get(`/ucto/klienti/co-b/mzdove-podania/${tax.id}/pripravit`)).status===404)
  const receipt={name:'TEST_ONLY-overview-receipt.xml',type:'application/xml',bytes:new TextEncoder().encode('<TEST_ONLY recipient="FS" reference="TEST-GENERATED-ACCEPT"/>')}
  res=await acc.upload(`${base}/${tax.id}/verzie/${first.id}/stav`,receipt,{to:'accepted',revision:'0',externalOn:today,reference:'TEST-GENERATED-ACCEPT',channel:'TEST ONLY FS fixture',reason:'',checked:'1'},'receipt')
  check('generated reports use the same exact-file checked-receipt workflow',res.status===303 && (await p.reportItem(db,company,tax.id)).status==='accepted')
  const revisionPlan=await plan()
  res=await acc.post(`${base}/${tax.id}/generovat`,{...input,kind:'O',foundOn:today,reason:'TEST complete expert correction',token:revisionPlan.token})
  check('an ordinary accountant cannot supersede an accepted generated report',res.status===409 && (await p.reportHistory(db,company,tax.id)).length===1)
  res=await admin.post(`${base}/${tax.id}/generovat`,{...input,kind:'O',foundOn:today,reason:'TEST complete expert correction',token:(await plan()).token})
  tax=await p.reportItem(db,company,tax.id)
  check('an explicit admin correction preserves accepted XML and receipt history',res.status===303 && tax.pkg.previous_id===first.id && tax.status==='prepared' && (await p.reportEvents(db,company,first.id)).length===1 && Boolean(await g.generationOf(db,company,tax.pkg.id)))
  const stale=await plan(),before=(await files.list({prefix:`companies/${company}/filings/`})).objects.length
  await p.recordPayout(db,closure,adminUser,{paidOn:today,reportPeriod:period,reference:'TEST bank reference independently rechecked',reason:'TEST settlement reference corrected',checked:true,revision:1},today)
  res=await admin.post(`${base}/${tax.id}/generovat`,{...input,kind:'O',foundOn:today,reason:'TEST stale expert correction',token:stale.token})
  check('a changed payout/source refuses stale generation without a new file',res.status===409 && (await p.reportHistory(db,company,tax.id)).length===2 && (await files.list({prefix:`companies/${company}/filings/`})).objects.length===before)
  // Move the reviewed period explicitly; the previous target may only retire after the admin resolves old filings.
  await p.recordPayout(db,closure,adminUser,{paidOn:today,reportPeriod:today.slice(0,7),reference:'TEST expert reallocated reporting month',reason:'TEST explicit synthetic period reclassification',checked:true,revision:2},today)
  const other=(await p.reportItems(db,company)).find((r)=>r.kind==='tax'&&r.period===today.slice(0,7))
  res=await acc.get(`${base}/${other.id}/pripravit`);html=await res.text()
  if(capture)writeFileSync(`${capture}/prehlad-blocked.html`,html)
  check('nonstandard or unfinished reporting periods show blockers and a usable external path',res.status===200 && !html.includes('prehlad-form') && html.includes('Najprv vyriešte podklady'))
  const scope=await g.reviewScope(db,company,tax.id),reviewInput={revision:String(scope.revision),reference:'TEST professional closure reference',reason:'TEST all actual submitted reports and necessary corrections have been professionally resolved',checked:'1'}
  res=await acc.post(`${base}/${tax.id}/preverit-rozsah`,reviewInput)
  check('only an administrator can retire an incorrectly scoped obligation',res.status===409 && (await p.reportItem(db,company,tax.id)).active)
  res=await admin.post(`${base}/${tax.id}/preverit-rozsah`,reviewInput)
  check('a previously sent report needs original supporting evidence before retirement',res.status===409 && !(await g.targetReviews(db,company,tax.id)).length)
  const reviewFile={name:'TEST_ONLY-expert-resolution.xml',type:'application/xml',bytes:new TextEncoder().encode('<TEST_ONLY resolution="all actual FS reports professionally resolved"/>')}
  res=await admin.upload(`${base}/${tax.id}/preverit-rozsah`,reviewFile,reviewInput,'evidence')
  const review=(await g.targetReviews(db,company,tax.id))[0]
  check('reviewed retirement removes work without deleting prior reports or inventing acceptance',res.status===303 && !(await p.reportItem(db,company,tax.id)).active && !(await filingQueue(db,user)).some((r)=>r.id===tax.id) && (await p.reportHistory(db,company,tax.id)).length===2 && (await p.reportEvents(db,company,first.id)).length===1)
  res=await admin.get(`${base}/${tax.id}`);html=await res.text()
  if(capture)writeFileSync(`${capture}/prehlad-retired.html`,html)
  check('retired evidence clearly distinguishes resolved scope from external cancellation',res.status===200 && html.includes('vyradená z pracovného zoznamu') && html.includes(reviewInput.reference))
  res=await owner.get(`/app/mzdove-podania/${tax.id}/preverenia/${review.id}/dokument`)
  check('the owner downloads the exact original expert-resolution evidence',res.status===200 && Buffer.from(await res.arrayBuffer()).equals(Buffer.from(reviewFile.bytes)))
  check('review evidence remains company scoped',(await foreign.get(`/app/mzdove-podania/${tax.id}/preverenia/${review.id}/dokument`)).status===404)
  await p.recordPayout(db,closure,adminUser,{paidOn:today,reportPeriod:period,reference:'TEST final corrected reporting period',reason:'TEST final synthetic allocation confirmed',checked:true,revision:3},today)
  check('newly allocated income reactivates a retired target without reviving old completion',(await p.reportItem(db,company,tax.id)).active && (await p.reportItem(db,company,tax.id)).sourceChanged && (await g.targetReviews(db,company,tax.id)).length===1)
  await p.recordPayout(db,closure,adminUser,{paidOn:today,reportPeriod:today.slice(0,7),reference:'TEST renewed synthetic period reclassification',reason:'TEST renewed external correction requires a fresh scope review',checked:true,revision:4},today)
  check('returning to empty coverage cannot reuse a resolution from before renewed income',(await p.reportItem(db,company,tax.id)).active && (await g.reviewScope(db,company,tax.id)).canRetire && (await filingQueue(db,user)).some((r)=>r.id===tax.id))
  const freshScope=await g.reviewScope(db,company,tax.id)
  const renewed=await g.retireTarget(db,files,company,tax.id,adminUser,{revision:freshScope.revision,reason:'TEST renewed sources and all actual external reports professionally resolved',reference:'TEST new independent resolution',checked:true,file:{name:'TEST_ONLY-renewed-resolution.xml',bytes:new TextEncoder().encode('<TEST_ONLY resolution="newly reclassified income professionally resolved"/>')}})
  check('a new expert resolution can retire the changed empty scope with its own original',renewed.ok && !(await p.reportItem(db,company,tax.id)).active && (await g.targetReviews(db,company,tax.id)).length===2)
  const latest=(await p.reportItem(db,company,tax.id)).pkg
  res=await admin.post(`${base}/${tax.id}/verzie/${latest.id}/stav`,{to:'submitted',revision:String(latest.revision),externalOn:today,reference:'TEST late external submission evidence',channel:'TEST ONLY late FS evidence',reason:'TEST external event discovered after expert resolution',checked:'1'})
  check('late external evidence invalidates a prior empty-scope resolution',res.status===303 && (await p.reportItem(db,company,tax.id)).active && (await filingQueue(db,user)).some((r)=>r.id===tax.id))
  res=await owner.get(`/app/mzdove-podania/${tax.id}`);html=await res.text()
  check('the owner sees why resolved work reopened without receiving an administrative form',res.status===200 && html.includes('Predchádzajúce vyradenie už nepokrýva') && !html.includes('payroll-scope'))
  for(const sql of ['UPDATE payroll_generations SET details=details WHERE company_id=?','DELETE FROM payroll_target_reviews WHERE company_id=?']){let denied=false;try{await db.prepare(sql).bind(company).run()}catch{denied=true}check('generated and expert-review history is immutable and retained',denied)}
  const archive=await exportYear({DB:db,FILES:files},await co(),period.slice(0,4),null,today),zipped=await unzip(new Uint8Array(await new Response(archive.body).arrayBuffer()))
  const paths=Array.isArray(zipped)?zipped.map((f)=>f.name):[...zipped.keys()]
  check('portable handover carries generated provenance and original retirement evidence',paths.includes('data/generovanie-mzdovych-podani.json') && paths.includes('data/preverenia-mzdovych-povinnosti.json') && paths.some((n)=>n.includes(`review-${review.id}`)))
}
