// Synthetic persons/receipts; these HTTP requests never contact an authority.
import { writeFileSync,readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { validateXML } from 'xmllint-wasm'
import { check } from './check.mjs'
import { readSocialXml } from './social-xml.mjs'
import { socialReporting as s,healthReporting as h,payrollReporting as p,payrollGeneration as g,companyOf,filingQueue,teamDeadlines,socialPendingPayrollSql,exportYear } from '../.wrangler/dist/stores.js'

export async function checkSocialReports({db,files,acc,admin,lucia,nowS,day,signIn,as,unzip,capture,foreign}) {
  const today=day(0),date=new Date(`${today.slice(0,7)}-15T12:00:00Z`);date.setUTCMonth(date.getUTCMonth()-1)
  const period=date.toISOString().slice(0,7);date.setUTCMonth(date.getUTCMonth()-1);const older=date.toISOString().slice(0,7)
  const company='co-social-generation',base=`/ucto/klienti/${company}/mzdove-podania`,bank='SK3112000000198742637541'
  const user=await db.prepare('SELECT * FROM users WHERE id=?').bind(lucia.id).first(),root=await db.prepare("SELECT * FROM users WHERE team='admin' ORDER BY id LIMIT 1").first()
  await db.batch([
    db.prepare("INSERT INTO companies(id,created_at,name,ico,dic,plan,inbox,accountant_id,start_on,invoice_iban,payroll) VALUES(?,?,'TEST Sociálne podania s. r. o.','63336666','2126333666','rast','socialgeneration',?,?,?,?)").bind(company,nowS,user.id,`${older}-01`,bank,JSON.stringify({payday:12,social:{vs:'0000000012'}})),
    db.prepare("INSERT INTO users(id,created_at,name,email) VALUES('social-owner',?,'TEST Social owner','social-owner@firmony.test'),('social-member',?,'TEST Social member','social-member@firmony.test')").bind(nowS,nowS),
    db.prepare("INSERT INTO members(company_id,user_id,role,created_at) VALUES(?,'social-owner','owner',?),(?,'social-member','member',?)").bind(company,nowS,company,nowS),
    ...[['sp-main','25',150000,0],['sp-zero','24',0,1]].map(([id,insurer,gross,exempt])=>db.prepare('INSERT INTO employees(id,company_id,name,insurer,started_on,wage_cents,declaration,health_exempt,created_at) VALUES(?,?,?,?,?,?,1,?,?)').bind(id,company,`TEST Employee ${id}`,insurer,`${older}-01`,gross,exempt,nowS)),
  ])
  const owner=as((await signIn('social-owner@firmony.test')).cookie),member=as((await signIn('social-member@firmony.test')).cookie),co=async()=>companyOf(await db.prepare('SELECT * FROM companies WHERE id=?').bind(company).first())
  const close=async(of)=>{const d=new Date(`${of}-15T12:00:00Z`);d.setUTCMonth(d.getUTCMonth()+1);return acc.post(`/ucto/klienti/${company}/mzdy`,{obdobie:of,vyplata:`${d.toISOString().slice(0,7)}-12`,akcia:'uzavriet','hruba_sp-main':'1500','hruba_sp-zero':'0'})}
  let res=await close(period),targets=await p.reportItems(db,company),target=targets.find((t)=>t.kind==='sp')
  check('the real payroll close creates one SP obligation covering both represented insurers',res.status===303&&Boolean(target)&&targets.filter((t)=>t.kind.startsWith('health')).length===2)
  const closure=await p.closureOf(db,company,period),healthMain=targets.find((t)=>t.kind==='health25')
  await h.recordHealthIdentity(db,company,healthMain.id,'sp-main',user,{revision:0,identifier:'0010101234',reference:'TEST shared original identity document',reason:'',checked:true})
  const plan=()=>s.socialPlan(db,company,target.id,today)
  const fact=async(section,employee,value,extra={},actor=acc)=>{const a=await plan();return actor.post(`${base}/${target.id}/udaje-sp`,{token:a.token,section,employee,revision:'0',value,mode:section==='hours'?'known':'',reference:`TEST verified ${section} source ${employee}`,reason:'',checked:'1',...extra})}
  res=await acc.get(`${base}/${target.id}/pripravit`);let html=await res.text(),initial=await plan()
  check('SP preparation reuses a verified health identifier and asks staff only for missing facts',res.status===200&&initial.identities.length===1&&html.includes('končí 1234')&&!html.includes('0010101234')&&(html.match(/class="stack social-fact-form"/g)||[]).length===5&&!html.includes('social-report-form'))
  if(capture)writeFileSync(`${capture}/social-missing.html`,html)
  const forged={...user,id:'social-owner',team:'accountant'},forgedFact={employee:'sp-main',revision:0,mode:'known',reference:'TEST forged-role source check',reason:'',checked:true}
  const deniedRelation=await s.recordSocialFact(db,initial,forged,initial.token,{...forgedFact,section:'relation',value:'000000000009'}),deniedHours=await s.recordSocialFact(db,initial,forged,initial.token,{...forgedFact,section:'hours',value:'160'})
  check('SP registration and analytical SQL guards reject a forged client role independently of HTTP',!deniedRelation.ok&&!deniedHours.ok&&!(await plan()).relations.length&&!(await plan()).inputs.length)
  res=await fact('identity','sp-zero','901010123',{checked:''})
  check('SP cannot create an insured identity without a professional source check',res.status===409&&(await plan()).identities.length===1)
  await fact('identity','sp-zero','901010123')
  const racePlan=await plan(),races=await Promise.all([1,2].map(()=>fact('relation','sp-main','000000000001',{token:racePlan.token})))
  check('concurrent SP registration intake saves one immutable revision',races.filter((r)=>r.status===303).length===1&&(await plan()).relations.length===1)
  res=await fact('relation','sp-zero','000000000001')
  check('a current IČPV cannot be assigned to two employee records',res.status===409&&(await plan()).relations.length===1)
  await fact('relation','sp-zero','000000000002')
  res=await fact('hours','sp-main','999')
  check('typing a reserved unknown-hours code as a measured number is rejected',res.status===409&&!(await plan()).inputs.length)
  res=await fact('hours','sp-main','',{mode:'undetermined'})
  check('the unknown-hours choice requires an explicit reason instead of a guessed zero',res.status===409&&!(await plan()).inputs.length)
  await fact('hours','sp-main','176,25');await fact('hours','sp-zero','0')
  let reviewed=await plan();res=await acc.get(`${base}/${target.id}/pripravit`);html=await res.text()
  check('complete SP facts are masked, reused and accompanied by a prefilled reviewed employer header',res.status===200&&reviewed.issues.length===0&&html.includes('social-report-form')&&!html.includes('social-fact-form')&&!html.includes('000000000001')&&!html.includes('901010123')&&html.includes('0000000012')&&html.includes(bank))
  if(capture)writeFileSync(`${capture}/social-ready.html`,html)
  const values={name:'TEST Sociálne podania s. r. o.',payer:'0000000012',iban:bank,firstName:'TEST',lastName:'Reviewer',phone:'00421900000000',email:'test@example.test',preparedBy:'TEST Social reviewer',declaredOn:today,kind:'R',reason:'',reference:'TEST complete monthly social scope review',checked:'1'}
  res=await acc.post(`${base}/${target.id}/generovat`,{...values,token:initial.token})
  check('an SP preview opened before intake cannot silently generate against later facts',res.status===409&&!(await p.reportItem(db,company,target.id)).pkg)
  res=await acc.post(`${base}/${target.id}/generovat`,{...values,token:reviewed.token,checked:''});html=await res.text()
  check('SP generation requires a fresh complete-scope attestation and preserves the entered header',res.status===409&&html.includes(values.reference)&&!(await p.reportItem(db,company,target.id)).pkg)
  if(capture)writeFileSync(`${capture}/social-error.html`,html)
  res=await acc.post(`${base}/${target.id}/generovat`,{...values,token:reviewed.token,payer:'63336666'})
  check('SP never derives the employer registration number from the company IČO',res.status===409&&!(await p.reportItem(db,company,target.id)).pkg)
  const generations=await Promise.all([1,2].map(()=>acc.post(`${base}/${target.id}/generovat`,{...values,token:reviewed.token})))
  target=await p.reportItem(db,company,target.id);const first=target.pkg
  check('concurrent SP generation commits exactly one original and its complete provenance',generations.filter((r)=>r.status===303).length===1&&(await p.reportHistory(db,company,target.id)).length===1&&(await db.prepare('SELECT COUNT(*) AS n FROM payroll_social_generations WHERE company_id=?').bind(company).first()).n===1)
  res=await acc.get(`${base}/${target.id}/verzie/${first.id}/dokument`);const xml=await res.text(),parsed=readSocialXml(xml)
  check('the actual HTTP download contains independently checked SP XML including the zero-paid employee',res.status===200&&parsed.rows.length===2&&parsed.rows[0]['@_pocetHodin']==='176.25'&&parsed.rows[1]['@_pocetHodin']==='0.00'&&parsed.rows[0]['@_icpv']==='000000000001')
  const validated=await validateXML({xml:[{fileName:'actual-http-mvpp.xml',contents:xml}],schema:[{fileName:'mvpp2026.xsd',contents:readFileSync(new URL('./xsd/mvpp2026.xsd',import.meta.url),'utf8')}]})
  check('the actual HTTP MVPP file validates against the unchanged official XSD',validated.valid,JSON.stringify(validated.errors))
  const origin=await g.generationOf(db,company,first.id),details=JSON.parse(origin.details)
  check('SP provenance binds exact closed figures and immutable person/fact revisions without copying raw IDs',origin.format==='MVPP-v2026'&&createHash('sha256').update(origin.details).digest('hex')===origin.sha256&&details.fileSha256===first.sha256&&details.sourceHash===closure.sha256&&JSON.parse(details.factsJson).every((r)=>r.identity&&r.relation&&r.input)&&!origin.details.includes('0010101234')&&!origin.details.includes('000000000001'))
  res=await owner.get(`/app/mzdove-podania/${target.id}`);html=await res.text()
  check('the owner sees SP origin and the same prepared file without an intake or accounting task',res.status===200&&html.includes('MVPP-v2026')&&!html.includes('social-fact-form')&&!html.includes('social-report-form')&&!html.includes('payroll-report-upload'))
  if(capture)writeFileSync(`${capture}/social-client.html`,html)
  check('members, foreign companies and owners cannot enter or alter SP person facts',(await member.get(`/app/mzdove-podania/${target.id}`)).status===404&&(await foreign.get(`/app/mzdove-podania/${target.id}/verzie/${first.id}/dokument`)).status===404&&(await owner.post(`/app/mzdove-podania/${target.id}/udaje-sp`,{})).status===404)
  reviewed=await plan();const rawBatch=db.batch.bind(db);let revoked=false
  const raceDb={prepare:db.prepare.bind(db),async batch(statements){if(!revoked){revoked=true;await db.prepare('UPDATE companies SET accountant_id=NULL WHERE id=?').bind(company).run()}return rawBatch(statements)}}
  const denied=await s.generateSocial(raceDb,files,reviewed,user,reviewed.token,{...values,checked:true,reason:'TEST replacement under reviewed scope'},today)
  check('SP SQL rechecks a revoked live assignment at the final write',!denied.ok&&(await p.reportHistory(db,company,target.id)).length===1&&Boolean(await files.head(first.file_key)))
  await db.prepare('UPDATE companies SET accountant_id=? WHERE id=?').bind(user.id,company).run()
  const accept=async(item,actor=user)=>p.changeReportDelivery(db,files,item.pkg,actor,{to:'accepted',revision:item.pkg.revision,externalOn:today,reference:`TEST-SP-SCOPE-${item.pkg.id}`,channel:'TEST ONLY recipient',checked:true,reason:'',receipt:{name:'TEST_ONLY-receipt.xml',bytes:new TextEncoder().encode(`<TEST_ONLY receipt="${item.pkg.id}"/>`)}},today)
  await accept(target)
  reviewed=await plan();res=await admin.post(`${base}/${target.id}/generovat`,{...values,token:reviewed.token,reason:'TEST attempted second ordinary SP report'})
  check('known prior SP acceptance requires a corrective report rather than another ordinary submission',res.status===409&&reviewed.requiresCorrection&&(await p.reportHistory(db,company,target.id)).length===1)
  const forgedOrdinary=await s.generateSocial(db,files,{...reviewed,requiresCorrection:false},root,reviewed.token,{...values,checked:true,reason:'TEST bypassed application-only type check'},today)
  check('SP SQL independently rejects an ordinary replacement of an accepted report',!forgedOrdinary.ok&&(await p.reportHistory(db,company,target.id)).length===1&&Boolean(await files.head(first.file_key)))
  for(const t of targets.filter((t)=>t.kind.startsWith('health'))) {
    const a=await h.healthPlan(db,company,t.id,today),saved=await h.generateHealth(db,files,a,user,a.token,{name:values.name,dic:'2126333666',payer:`00000000${t.kind.slice(-2)}`,branch:`${t.kind.slice(-2)}00`,iban:bank,phone:'',email:'',sendOn:today,batch:'1',kind:'N',reason:'',reference:'TEST complete health source from shared identity',checked:true},today)
    check('a verified SP identity is reusable by its own health recipient without another intake',saved.ok)
    await accept({...t,pkg:await p.reportPackage(db,company,saved.id)})
  }
  await p.recordPayout(db,closure,user,{paidOn:today,reportPeriod:period,reference:'TEST all ordinary wages actually settled',reason:'',checked:true,revision:0},today)
  const tax=(await p.reportItems(db,company)).find((t)=>t.kind==='tax'),savedTax=await p.saveReport(db,files,tax,user,{revision:tax.revision,variant:'TEST ONLY FS',checked:true,reason:'',file:{name:'TEST_ONLY-fs.xml',bytes:new TextEncoder().encode('<TEST_ONLY recipient="FS"/>')}})
  await accept({...tax,pkg:await p.reportPackage(db,company,savedTax.id)})
  const pending=async()=>Boolean((await db.prepare(`SELECT ${socialPendingPayrollSql('?1')} AS pending`).bind(company).first()).pending)
  check('current accepted SP and other recipient evidence clear payroll handover work',!await pending())
  res=await fact('hours','sp-main','',{revision:'1',mode:'undetermined',reason:'TEST professional verified that analytical hours cannot be determined'})
  check('an ordinary accountant cannot overwrite previously verified analytical hours',res.status===409&&(await plan()).inputs.find((i)=>i.employee_id==='sp-main').revision===1)
  res=await fact('hours','sp-main','',{revision:'1',mode:'undetermined',reason:'TEST professional verified that analytical hours cannot be determined'},admin)
  target=await p.reportItem(db,company,target.id)
  check('admin hour corrections append history and reopen only affected SP work',res.status===303&&target.sourceChanged&&target.status==='unverified'&&(await p.reportPackage(db,company,first.id)).status==='accepted'&&(await p.reportItem(db,company,healthMain.id)).status==='accepted'&&await pending())
  check('changed SP facts reopen their work queue and deadline',(await filingQueue(db,user)).some((t)=>t.id===target.id)&&(await teamDeadlines(db,user,false,today,{company})).dues.some((d)=>d.reportId===target.id&&d.state==='blocked'))
  let frozen=false;try{await db.prepare('UPDATE companies SET purge_started_at=? WHERE id=?').bind(nowS,company).run()}catch{frozen=true}
  check('a formerly accepted SP file cannot falsely freeze a handover after its facts change',frozen)
  res=await admin.get(`${base}/${target.id}`);if(capture)writeFileSync(`${capture}/social-changed.html`,await res.text())
  reviewed=await plan();res=await admin.post(`${base}/${target.id}/generovat`,{...values,token:reviewed.token,kind:'O',reason:'TEST complete replacement with corrected analytical hours'})
  target=await p.reportItem(db,company,target.id);const replacement=target.pkg,changed=readSocialXml(await (await files.get(replacement.file_key)).text())
  check('a supported corrective SP report contains the full source and explicit unknown-hours code',res.status===303&&replacement.previous_id===first.id&&changed.root.typVykazu==='O'&&changed.rows.length===2&&changed.rows[0]['@_pocetHodin']==='999.00'&&target.status==='prepared'&&(await (await files.get(first.file_key)).text())===xml)
  await accept(target,root)
  res=await fact('relation','sp-main','000000000003',{revision:'1',reason:'TEST corrected registered legal relationship reference'},admin)
  check('registration corrections invalidate SP without altering other recipients',res.status===303&&(await p.reportItem(db,company,target.id)).sourceChanged&&(await p.reportItem(db,company,healthMain.id)).status==='accepted')
  const identity=(await plan()).identities.find((i)=>i.employee_id==='sp-main')
  res=await admin.post(`${base}/${healthMain.id}/poistenec`,{employee:'sp-main',revision:String(identity.revision),identifier:'0010101235',reference:'TEST corrected common identity document',reason:'TEST admin corrected identity shared by both recipients',checked:'1'})
  check('a common RČ correction reopens both generated recipients and retains their historical receipts',res.status===303&&(await p.reportItem(db,company,target.id)).sourceChanged&&(await p.reportItem(db,company,healthMain.id)).sourceChanged&&(await p.reportEvents(db,company,first.id)).length===1&&(await p.reportEvents(db,company,replacement.id)).length===1)
  const count=(await plan()).inputs.find((i)=>i.employee_id==='sp-main')
  res=await fact('hours','sp-main','',{revision:String(count.revision),mode:'undetermined',reference:'TEST corrected analytical evidence reference',reason:'TEST proof reference corrected without inventing different hours'},admin)
  check('a reference-only SP correction appends evidence without inventing a different numeric value',res.status===303&&(await plan()).inputs.find((i)=>i.employee_id==='sp-main').revision===3&&(await plan()).inputs.find((i)=>i.employee_id==='sp-main').hours===99900)
  const nextRes=await close(older),other=(await p.reportItems(db,company,older)).find((t)=>t.kind==='sp'),reused=await s.socialPlan(db,company,other.id,today)
  check('another month reuses registration and identifiers but never silently copies its hours',nextRes.status===303&&reused.identities.length===2&&reused.relations.length===2&&reused.inputs.length===0&&reused.defaults.firstName==='TEST'&&reused.defaults.payer==='0000000012'&&reused.issues.some((s)=>s.includes('počet hodín')))
  const archive=await exportYear({DB:db,FILES:files},await co(),period.slice(0,4),null,today),zip=await unzip(new Uint8Array(await new Response(archive.body).arrayBuffer())),names=Array.isArray(zip)?zip.map((f)=>f.name):[...zip.keys()]
  check('the complete portable archive retains SP registrations, analytical history, exact reports and provenance',names.includes('data/pravne-vztahy-sp.json')&&names.includes('data/analyticke-udaje-sp.json')&&names.includes('data/generovanie-vykazov-sp.json')&&(await p.reportHistory(db,company,target.id)).length===2)
  for(const table of ['payroll_social_relations','payroll_social_inputs','payroll_social_generations']) {let blocked=false;try{await db.prepare(`DELETE FROM ${table} WHERE company_id=?`).bind(company).run()}catch{blocked=true}check('SP history cannot be deleted outside controlled retention',blocked)}
}
