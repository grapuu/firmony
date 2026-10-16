// Synthetic reports and receipts only: no official portal, legal acceptance or payroll schema is simulated.
import { writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { check } from './check.mjs'
import { payrollReporting as p, companyOf, payslip, filingQueue, teamDeadlines, exportYear, reopenRunStatement, changeLockStatement, periodLock, dataRevision, filingFile, prepareFiling, changeDelivery, packageOf } from '../.wrangler/dist/stores.js'

export async function checkPayrollReports({ db, files, acc, admin, lucia, nowS, day, signIn, as, unzip, capture }) {
  const company = 'co-payroll-evidence', today = day(0), paidMonth = today.slice(0,7)
  const back = (n) => { const d = new Date(`${paidMonth}-15T12:00:00Z`); d.setUTCMonth(d.getUTCMonth()-n); return d.toISOString().slice(0,7) }
  const period = back(1), older = back(2), zeroPeriod = back(3), planned = `${paidMonth}-10`
  const base = `/ucto/klienti/${company}/mzdove-podania`
  await db.batch([
    db.prepare("INSERT INTO users (id,created_at,name,email) VALUES ('payroll-owner',?,'TEST payroll owner','payroll-owner@firmony.test'),('payroll-member',?,'TEST invited member','payroll-member@firmony.test')").bind(nowS,nowS),
    db.prepare("INSERT INTO companies (id,created_at,name,ico,dic,plan,inbox,accountant_id,start_on,payroll) VALUES (?,?,'Mzdové potvrdenia s. r. o.','63335555','2126333555','rast','payrollevidence',?,?,?)").bind(company,nowS,lucia.id,`${back(4)}-01`,JSON.stringify({day:10,health:{24:{iban:'TEST'},25:{iban:'TEST'},27:{iban:'TEST'}}})),
    db.prepare("INSERT INTO members (company_id,user_id,role,created_at) VALUES (?,'payroll-owner','owner',?),(?,'payroll-member','member',?)").bind(company,nowS,company,nowS),
  ])
  const owner = as((await signIn('payroll-owner@firmony.test')).cookie), member = as((await signIn('payroll-member@firmony.test')).cookie)
  const user = await db.prepare('SELECT * FROM users WHERE id=?').bind(lucia.id).first()
  const adminUser = await db.prepare("SELECT * FROM users WHERE team='admin' ORDER BY id LIMIT 1").first()
  const co = () => db.prepare('SELECT * FROM companies WHERE id=?').bind(company).first().then(companyOf)
  const line = (insurer='25',gross=100000,of=period) => ({employeeId:`TEST-${insurer}`,name:`TEST Employee ${insurer}`,insurer,gross,days:30,slip:payslip({period:of,gross,days:30,declaration:true,children:[],disabled:false,healthDeduction:false,healthMinimumExempt:false})})
  const seed = (of, lines) => db.prepare('INSERT INTO payroll_runs (company_id,period,payday,lines,closed_at,closed_on,closed_by) VALUES (?,?,?,?,?,?,?)').bind(company,of,planned,JSON.stringify(lines),nowS,today,lucia.id).run()
  await seed(period,[line(),line('24',0)])
  // Close the financial period before linking legacy evidence: metadata may be added; money may not change.
  const through = new Date(`${paidMonth}-01T12:00:00Z`); through.setUTCDate(0)
  await changeLockStatement(db,company,through.toISOString().slice(0,10),'TEST lock before evidence',user.id,0,await dataRevision(db,company)).run()
  let res = await acc.post(`${base}/zalozit`,{period}), html
  check('a locked legacy closure can gain recipient evidence without changing its money',res.status===303 && Boolean(await p.closureOf(db,company,period)))
  let items = await p.reportItems(db,company), sp = items.find((r)=>r.kind==='sp'), zp = items.find((r)=>r.kind==='health25')
  check('targets follow snapshot insurers, include zero pay and ignore unrelated saved bank settings',items.map((r)=>r.kind).sort().join()==='health24,health25,sp' && items.every((r)=>r.status==='unverified'))
  check('no tax reporting period is fabricated from the scheduled payday',!items.some((r)=>r.kind==='tax'))
  let blocked=false
  try { await db.prepare("UPDATE payroll_runs SET lines='[]' WHERE company_id=? AND period=?").bind(company,period).run() } catch { blocked=true }
  check('linking evidence does not weaken locked payroll figures',blocked)
  res=await acc.get(`${base}?obdobie=${period}`);html=await res.text()
  check('actual payout date starts blank and requests bank verification',res.status===200 && html.includes('name="paidOn"') && html.includes('value=""') && html.includes('Samotný platobný príkaz nestačí'))
  if(capture)writeFileSync(`${capture}/payroll-reports.html`,html)
  res=await acc.get(`${base}/${sp.id}`);html=await res.text()
  if(capture)writeFileSync(`${capture}/payroll-report-upload.html`,html)
  const closure=await p.closureOf(db,company,period)
  const payoutFields=(changes={})=>({period,closure:closure.id,revision:'0',paidOn:today,reference:'TEST bank settlement 123456',checked:'1',reason:'',...changes})
  res=await acc.post(`${base}/vyplata`,payoutFields({checked:''}))
  check('planned instructions cannot create an actual-payout fact without attestation',res.status===409 && !(await p.payoutsOf(db,company,closure.id)).length)
  const file=(kind,version='1')=>({name:`TEST_ONLY-${kind}-${version}.xml`,type:'application/xml',bytes:new TextEncoder().encode(`<TEST_ONLY company="63335555" kind="${kind}" version="${version}"/>`)})
  const reportFields=(target,changes={})=>({revision:String(target.revision),variant:'TEST ONLY riadny výkaz',checked:'1',reason:'',...changes})
  const upload=async(actor,target,version='1',changes={})=>actor.upload(`${base}/${target.id}/subor`,file(target.kind,version),reportFields(target,changes),'report')
  res=await upload(acc,sp,'bad',{checked:''})
  check('exact payroll payload requires a professional completeness check',res.status===409 && !(await p.reportItem(db,company,sp.id)).pkg)
  res=await upload(acc,sp)
  sp=await p.reportItem(db,company,sp.id)
  check('the exact external payroll report is stored as prepared rather than accepted',res.status===303 && sp.status==='prepared' && sp.pkg.sha256===createHash('sha256').update(file('sp').bytes).digest('hex'))
  const proof=(kind,ref)=>({name:'TEST_ONLY-receipt.xml',type:'application/xml',bytes:new TextEncoder().encode(`<TEST_ONLY recipient="${kind}" reference="${ref}"/>`)})
  const delivery=(pkg,to,reference,extra={})=>({to,revision:String(pkg.revision),externalOn:today,reference,channel:'TEST ONLY recipient portal',reason:'',checked:'1',...extra})
  const deliver=(actor,item,to,ref,extra={},attachment=proof(item.kind,ref))=>actor.upload(`${base}/${item.id}/verzie/${item.pkg.id}/stav`,attachment,delivery(item.pkg,to,ref,extra),'receipt')
  res=await acc.post(`${base}/${sp.id}/verzie/${sp.pkg.id}/stav`,delivery(sp.pkg,'accepted','TEST-PAY-SP'))
  check('a payroll acceptance cannot be asserted without an original receipt',res.status===409 && (await p.reportItem(db,company,sp.id)).status==='prepared')
  res=await deliver(acc,sp,'accepted','TEST-PAY-SP')
  sp=await p.reportItem(db,company,sp.id)
  const spReceipt=(await p.reportEvents(db,company,sp.pkg.id))[0]
  check('one SP receipt finishes only SP, leaving each health insurer pending',res.status===303 && sp.status==='accepted' && (await p.reportItem(db,company,zp.id)).status==='unverified')
  check('global work queue keeps every unresolved recipient across all periods',!(await filingQueue(db,user)).some((r)=>r.id===sp.id) && (await filingQueue(db,user)).some((r)=>r.id===zp.id))
  res=await upload(acc,zp)
  zp=await p.reportItem(db,company,zp.id)
  let dovera=(await p.reportItems(db,company)).find((r)=>r.kind==='health24')
  await upload(acc,dovera)
  dovera=await p.reportItem(db,company,dovera.id)
  res=await deliver(acc,dovera,'accepted','TEST-PAY-SP')
  check('independent recipients may use the same reference with their own distinct originals',res.status===303 && (await p.reportItem(db,company,dovera.id)).status==='accepted')
  res=await deliver(acc,zp,'accepted','TEST-ZP-RENAMED',{},proof('sp','TEST-PAY-SP'))
  check('renaming a reference cannot reuse the SP receipt bytes',res.status===409 && (await p.reportItem(db,company,zp.id)).status==='prepared')
  res=await deliver(acc,zp,'rejected','TEST-ZP-REJECT',{reason:'TEST invalid portal signing certificate'})
  zp=await p.reportItem(db,company,zp.id)
  res=await acc.get(`${base}/${zp.id}`);html=await res.text()
  if(capture)writeFileSync(`${capture}/payroll-report-rejected.html`,html)
  check('a rejected payroll report shows the reason and a recovery action',zp.status==='rejected' && html.includes('invalid portal signing certificate') && html.includes('Evidovať odoslanie mimo Firmony'))
  // Customer roles: owners can review/download; invited members cannot see employee report data.
  const document=`/app/mzdove-podania/${sp.id}/verzie/${sp.pkg.id}/dokument`, receipt=`/app/mzdove-podania/${sp.id}/verzie/${sp.pkg.id}/potvrdenka/${spReceipt.id}`
  res=await owner.get(document)
  check('the owner downloads exact original report bytes with attachment and no-store',res.status===200 && res.headers.get('cache-control').includes('no-store') && Buffer.from(await res.arrayBuffer()).equals(Buffer.from(file('sp').bytes)))
  res=await owner.get(receipt)
  check('the owner downloads the matching checked receipt',res.status===200 && Buffer.from(await res.arrayBuffer()).equals(Buffer.from(proof('sp','TEST-PAY-SP').bytes)))
  check('an ordinary invited member cannot open payroll lists, originals or receipts',(await member.get('/app/mzdove-podania')).status===404 && (await member.get(document)).status===404 && (await member.get(receipt)).status===404)
  const foreign=as((await signIn('boris@firma-b.test')).cookie)
  check('another tenant cannot use guessed payroll report identifiers',(await foreign.get(document)).status===404 && (await acc.get(`/ucto/klienti/co-b/mzdove-podania/${sp.id}`)).status===404)
  check('an owner has no payroll evidence mutation endpoint',(await owner.post(`/app/mzdove-podania/${sp.id}/subor`,{})).status===404 && (await owner.post('/app/mzdove-podania/vyplata',payoutFields())).status===404)
  res=await owner.get(`/app/mzdove-podania/${sp.id}`);html=await res.text()
  if(capture)writeFileSync(`${capture}/payroll-report-client.html`,html)
  check('the owner sees the same accepted report without preparation controls',res.status===200 && html.includes('Prijatie príjemcom doložené') && !html.includes('payroll-report-upload') && !html.includes('filing-form'))
  // Reopening externally sent payroll would change the financial source: refuse it even on a direct store call.
  blocked=false
  try {await reopenRunStatement(db,company,period).run()}catch{blocked=true}
  check('reported payroll source cannot be reopened or overwritten',blocked && await p.runReopenBlocked(db,company,period))
  // Payout is independently attested; no amount or planned date silently marks this done.
  res=await acc.post(`${base}/vyplata`,payoutFields())
  const payout=(await p.payoutsOf(db,company,closure.id))[0]
  let tax=(await p.reportItems(db,company)).find((r)=>r.kind==='tax')
  check('actual cash payment creates one FS prehľad for its paid month',res.status===303 && payout.paid_on===today && tax.period===paidMonth && tax.period!==period)
  check('a source-month link includes its next-month FS report',(await p.reportItems(db,company,period)).some((r)=>r.id===tax.id))
  res=await upload(acc,tax)
  tax=await p.reportItem(db,company,tax.id)
  res=await deliver(acc,tax,'accepted','TEST-PAY-TAX')
  tax=await p.reportItem(db,company,tax.id)
  check('the FS report can be accepted against its exact payout coverage',res.status===303 && tax.status==='accepted' && !tax.sourceChanged)
  res=await acc.post(`${base}/vyplata`,payoutFields({revision:'1',reference:'TEST changed bank reference',reason:'TEST correction after bank review'}))
  check('ordinary accountants cannot rewrite an already verified payout',res.status===409 && (await p.payoutsOf(db,company,closure.id)).length===1)
  // A second closed wage run paid in the same month belongs to the same FS report; old receipt is retained.
  // Insert the synthetic source while temporarily opening the lock through its authorized change statement.
  const lock=await periodLock(db,company)
  await changeLockStatement(db,company,null,'TEST add historical synthetic source',adminUser.id,lock.version,await dataRevision(db,company)).run()
  await seed(older,[line('27',100000,older)])
  await p.initializeClosedRun(db,await co(),older,user)
  const olderClosure=await p.closureOf(db,company,older)
  await p.recordPayout(db,olderClosure,user,{paidOn:today,reference:'TEST second settled payroll 123',reason:'',checked:true,revision:0},today)
  tax=await p.reportItem(db,company,tax.id)
  const source=JSON.parse((await p.sourceOf(db,tax)).json)
  check('two wage runs paid in one month aggregate into one FS target',(await p.reportItems(db,company)).filter((r)=>r.kind==='tax'&&r.period===paidMonth).length===1 && source.length===2)
  check('later paid income invalidates current completion without erasing the old acceptance',tax.sourceChanged && tax.status==='unverified' && tax.pkg.status==='accepted' && (await p.reportEvents(db,company,tax.pkg.id)).length===1 && (await filingQueue(db,user)).some((r)=>r.id===tax.id))
  res=await admin.get(`${base}/${tax.id}`);html=await res.text()
  if(capture)writeFileSync(`${capture}/payroll-report-changed.html`,html)
  const dues=(await teamDeadlines(db,user,false,today,{company})).dues
  check('the deadline remains blocked while a paid-month report omits a later source',dues.some((d)=>d.reportId===tax.id && d.state==='blocked'))
  res=await upload(acc,tax,'2',{reason:'TEST include second paid wage source'})
  check('a successor of an accepted report needs an administrator expert decision',res.status===409 && (await p.reportHistory(db,company,tax.id)).length===1)
  res=await upload(admin,tax,'2',{reason:'TEST expert selected corrected full month report'})
  const originalTax=tax.pkg
  tax=await p.reportItem(db,company,tax.id)
  check('an admin successor keeps the old payload and receipt chain',res.status===303 && tax.status==='prepared' && tax.pkg.previous_id===originalTax.id && (await p.reportHistory(db,company,tax.id)).length===2 && JSON.parse(tax.pkg.source_json).length===2)
  // Concurrent evidence uses the same SQL authorization/CAS and never deletes the winning R2 object.
  const input=(i)=>({to:'accepted',revision:0,externalOn:today,reference:`TEST-TAX-RACE-${i}`,channel:'TEST ONLY',reason:'',checked:true,receipt:proof('tax',`TEST-TAX-RACE-${i}`)})
  const races=await Promise.all([1,2].map((i)=>p.changeReportDelivery(db,files,tax.pkg,adminUser,input(i),today)))
  check('concurrent payroll confirmations commit exactly one event',races.filter((r)=>r.ok).length===1 && (await p.reportEvents(db,company,tax.pkg.id)).length===1)
  const winner=(await p.reportEvents(db,company,tax.pkg.id))[0]
  check('the winning original receipt remains available after the losing write',Boolean(await files.head(winner.file_key)))
  res=await admin.post(`${base}/vyplata`,payoutFields({revision:'1',reason:'TEST bank reference corrected after expert review',reference:'TEST corrected bank statement 456'}))
  check('an admin payout correction appends history and invalidates earlier coverage',res.status===303 && (await p.payoutsOf(db,company,closure.id)).length===2 && (await p.reportItem(db,company,tax.id)).sourceChanged && (await p.payoutsOf(db,company,closure.id))[1].reference==='TEST bank settlement 123456')
  // FS identifiers share their namespace with the five existing tax forms; other recipients do not.
  const sv=await filingFile('TEST_ONLY-SV.xml','<TEST_ONLY company="63335555" kind="sv"/>')
  await db.batch([
    db.prepare("INSERT INTO filings (company_id,kind,period,filed_at,filed_on,filed_by,data) VALUES (?,'sv',?,?,?,?,?)").bind(company,period,nowS,today,user.id,JSON.stringify({file:sv})),
    prepareFiling(db,company,'sv',period,sv,user.id),
  ])
  const svInput={...input(4),reference:'TEST-PAY-TAX',receipt:proof('sv','TEST-PAY-TAX')}
  let result=await changeDelivery(db,files,await packageOf(db,company,sv.attemptId),user,svInput,today)
  check('an FS payroll reference cannot also certify a different FS tax form',!result.ok && (await packageOf(db,company,sv.attemptId)).status==='prepared')
  result=await changeDelivery(db,files,await packageOf(db,company,sv.attemptId),user,{...svInput,reference:'TEST-SV-LEGIT',receipt:proof('sv','TEST-SV-LEGIT')},today)
  check('a distinct FS original can be recorded in the existing tax module',result.ok)
  tax=await p.reportItem(db,company,tax.id)
  await upload(admin,tax,'3',{reason:'TEST expert review of corrected payout metadata'})
  tax=await p.reportItem(db,company,tax.id)
  result=await p.changeReportDelivery(db,files,tax.pkg,adminUser,{...input(5),reference:'TEST-SV-LEGIT',receipt:proof('tax','TEST-SV-LEGIT')},today)
  check('FS reference protection also works from tax forms back to payroll',!result.ok && (await p.reportItem(db,company,tax.id)).status==='prepared')
  // Two initial uploads race; a lost acknowledgement must keep a file that really committed.
  const olderSp=(await p.reportItems(db,company,older)).find((r)=>r.kind==='sp')
  const uploadInput=(version)=>({revision:olderSp.revision,variant:'TEST concurrent regular report',checked:true,reason:'',file:file('older-sp',version)})
  const uploadRaces=await Promise.all([1,2].map((i)=>p.saveReport(db,files,olderSp,user,uploadInput(String(i)))))
  check('concurrent payroll uploads retain one current source version',uploadRaces.filter((r)=>r.ok).length===1 && (await p.reportHistory(db,company,olderSp.id)).length===1)
  const committedSp=await p.reportItem(db,company,olderSp.id)
  const ackDb={prepare:db.prepare.bind(db),async batch(statements){await db.batch(statements);throw new Error('TEST lost payroll upload acknowledgement')}}
  let ackLost=false
  try{await p.saveReport(ackDb,files,committedSp,user,{...uploadInput('ack'),revision:committedSp.revision,reason:'TEST report revised before any external sending'})}catch{ackLost=true}
  const afterAck=await p.reportItem(db,company,olderSp.id)
  check('a lost upload acknowledgement preserves committed original bytes and version history',ackLost && afterAck.pkg.previous_id===committedSp.pkg.id && Boolean(await files.head(afterAck.pkg.file_key)) && (await p.reportHistory(db,company,olderSp.id)).length===2)
  // Assignment can change after the HTTP/read phase; SQL must check the live assignment.
  zp=await p.reportItem(db,company,zp.id)
  const rawBatch=db.batch.bind(db);let raced=false
  const raceDb={prepare:db.prepare.bind(db),async batch(statements){if(!raced){raced=true;await db.prepare('UPDATE companies SET accountant_id=NULL WHERE id=?').bind(company).run()}return rawBatch(statements)}}
  const before=(await files.list({prefix:`companies/${company}/filings/`})).objects.length
  const denied=await p.changeReportDelivery(raceDb,files,zp.pkg,user,{...input(3),revision:zp.pkg.revision,reference:'TEST-ZP-REVOKED'},today)
  check('payroll receipt writes reject a revoked accountant assignment inside SQL',!denied.ok && (await p.reportItem(db,company,zp.id)).status==='rejected' && (await files.list({prefix:`companies/${company}/filings/`})).objects.length===before)
  await db.prepare('UPDATE companies SET accountant_id=? WHERE id=?').bind(lucia.id,company).run()
  // All metadata is retained, and export verifies bytes rather than silently dropping a missing original.
  for(const sql of ["UPDATE payroll_closures SET payday='2099-01-01' WHERE company_id=?","UPDATE payroll_payouts SET reference='TEST overwritten' WHERE company_id=?","DELETE FROM payroll_packages WHERE company_id=?","DELETE FROM companies WHERE id=?"]){blocked=false;try{await db.prepare(sql).bind(company).run()}catch{blocked=true}check('payroll evidence rejects destructive history mutation',blocked)}
  const archive=await exportYear({DB:db,FILES:files},await co(),period.slice(0,4),null,today)
  const zipped=await unzip(new Uint8Array(await new Response(archive.body).arrayBuffer()))
  const paths=Array.isArray(zipped)?zipped.map((f)=>f.name):[...zipped.keys()]
  check('portable handover includes payroll sources, payouts, versions and original proof',['data/mzdove-uzavierky.json','data/overene-vyplaty.json','data/mzdove-povinnosti.json','data/verzie-mzdovych-podani.json','data/dorucenie-mzdovych-podani.json'].every((n)=>paths.includes(n)) && paths.some((n)=>n.startsWith('mzdy/podania/sp-')) && paths.some((n)=>n.startsWith('podania/potvrdenky/payroll-')))
  await files.delete(sp.pkg.file_key)
  res=await owner.get(document)
  check('a missing original returns an explicit failure instead of a reconstructed file',res.status===409)
  blocked=false;try{const broken=await exportYear({DB:db,FILES:files},await co(),period.slice(0,4),null,today);await new Response(broken.body).arrayBuffer()}catch{blocked=true}
  check('an incomplete payroll export cannot masquerade as a complete handover',blocked)
  await files.put(sp.pkg.file_key,file('sp').bytes,{httpMetadata:{contentType:'application/xml'}})
  blocked=false;try{await db.prepare('UPDATE companies SET purge_started_at=? WHERE id=?').bind(nowS,company).run()}catch{blocked=true}
  check('unresolved recipient reports prevent a handover freeze',blocked)
  // Zero income still has insurer obligations but must not fabricate an actual cash payout fact.
  await seed(zeroPeriod,[line('25',0,zeroPeriod)])
  await p.initializeClosedRun(db,await co(),zeroPeriod,user)
  const zero=await p.closureOf(db,company,zeroPeriod)
  const zeroCash=await p.recordPayout(db,zero,user,{paidOn:today,reference:'TEST no actual income exists',reason:'',checked:true,revision:0},today)
  check('a zero-income snapshot has insurer targets but no fabricated cash payout',!zeroCash.ok && !(await p.payoutsOf(db,company,zero.id)).length && (await p.runEvidence(db,company,zeroPeriod))[0].needsPayout===false)
  // Leave this retained fixture for the independent all-table D1/R2 restoration test.
}
