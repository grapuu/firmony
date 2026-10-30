import {check} from './check.mjs'
import {randomUUID,createHash} from 'node:crypto'
import {writeFileSync} from 'node:fs'
import {migrationSteps} from '../.wrangler/dist/schema.js'
import {assistantStore,askAssistant,handoverData,archiveEnded,purgeCompany,forgetRecords} from '../.wrangler/dist/stores.js'
import {ensureAmlOfficer} from './aml.runtime.mjs'
const {finishQuestion}=assistantStore


export async function checkAssistantRuntime({db,files,as,signIn,lucia,nowS,day,provider,capture}){
  check('assistant: the first 78 deployed schemas are unchanged',createHash('sha256').update(JSON.stringify(migrationSteps.slice(0,78))).digest('hex')==='47362b29a0d135a664308a70ce9fd5e32d06445e70adee41015bcf0831e0277e')
  const co='co-assistant',other='co-assistant-other',actor='assistant-owner',email='assistant-owner@example.test'
  await db.batch([
    db.prepare("INSERT INTO companies(id,created_at,name,plan,inbox,start_on,contract_at,accountant_id) VALUES(?,?,'TEST-ONLY Asistent s.r.o.','rast','assistant',?,?,?),(?,?,'TEST-ONLY Cudzia firma','rast','assistant-other',?,?,?)").bind(co,nowS,`${day(0).slice(0,4)}-01-01`,nowS,lucia.id,other,nowS,`${day(0).slice(0,4)}-01-01`,nowS,lucia.id),
    db.prepare("INSERT INTO users(id,created_at,email,name) VALUES(?,? ,?,'TEST-ONLY Majiteľ'),('assistant-member',?,'assistant-member@example.test','TEST-ONLY Kolega')").bind(actor,nowS,email,nowS),
    db.prepare("INSERT INTO members(company_id,user_id,role,created_at) VALUES(?,?,'owner',?),(?,'assistant-member','member',?)").bind(co,actor,nowS,co,nowS),
    db.prepare("INSERT INTO documents(id,company_id,created_at,source,status,number,party,currency,total_cents,booked_at,booked_by) VALUES('assistant-reading',?,?,'upload','reading','TEST-READING','TEST-ONLY Predajca','EUR',12345,NULL,NULL),('assistant-auto',?,?,'upload','read','TEST-AUTO','TEST-ONLY Predajca','EUR',54321,?,'auto'),('assistant-foreign',?,?,'upload','read','TEST-FOREIGN','TEST-ONLY PRIVATE FOREIGN','EUR',98765,NULL,NULL)").bind(co,nowS,co,nowS,nowS,other,nowS),
    db.prepare("INSERT INTO accounts(id,company_id,iban) VALUES('assistant-account',?,'SK3112000000198742637541')").bind(co),
    db.prepare("INSERT INTO payments(id,company_id,account_id,created_at,booked_on,amount_cents,ref,party) VALUES('assistant-payment',?,'assistant-account',?,?,-12345,'assistant-ref','TEST-ONLY Predajca')").bind(co,nowS,day(0)),
  ])
  const login=await signIn(email),owner=as(login.cookie),member=as((await signIn('assistant-member@example.test')).cookie),team=as((await signIn('lucia@firmony.test')).cookie)
  const session=createHash('sha256').update(login.cookie.split('=')[1]).digest('hex')
  const scope={company:co,actor,side:'client'},context=`${actor}:${co}`
  const fields=changes=>({firma:co,kontext:context,odoslanie:randomUUID(),otazka:'TEST-ONLY Ako je na tom účtovníctvo?',doklad:'',...changes})
  const plain=s=>s.replace(/[\u00a0\u202f]/g,' ')
  const save=(name,html)=>{if(capture)writeFileSync(`${capture}/${name}.html`,html)}
  const startCalls=provider.requests.length
  let res=await owner.get('/app/asistent'),html=await res.text()
  check('assistant: the actual client page has a scoped form, privacy explanation and an expert path',res.status===200&&html.includes('data-assistant-form')&&html.includes(`name="kontext" value="${context}"`)&&html.includes('Pripraviť otázku účtovníčke')&&html.includes('spoločnosti Anthropic iba jej text'))
  save('assistant-client',html)
  res=await owner.get('/app/asistent?tema=overview');html=plain(await res.text())
  check('assistant: quick overview reads real document and missing-payment counts without AI',res.status===200&&html.includes('V evidencii sú 2 doklady')&&html.includes('K 1 evidovanej platbe')&&html.includes('pri 1 automaticky zaúčtovanom doklade')&&provider.requests.length===startCalls)
  check('assistant: another company’s labels never enter a client answer',!html.includes('TEST-ONLY PRIVATE FOREIGN')&&!html.includes('TEST-FOREIGN'))
  save('assistant-answer',html)
  res=await owner.get('/app/asistent?tema=document&doklad=assistant-reading');html=await res.text()
  check('assistant: a received file being read is never described as booked',html.includes('prebieha jeho čítanie')&&html.includes('/app/doklady/assistant-reading'))
  res=await owner.get('/app/asistent?tema=document&doklad=assistant-auto')
  check('assistant: automatic booking without a current human review stays explicit',(await res.text()).includes('Odborná kontrola aktuálnej verzie ešte nie je potvrdená'))
  res=await owner.get('/app/asistent?tema=document&doklad=assistant-foreign')
  check('assistant: guessing a foreign document is a 404, never an AI lookup',res.status===404&&provider.requests.length===startCalls)
  res=await owner.post('/app/asistent',fields({firma:other}));check('assistant: a stale company form cannot call AI',res.status===409&&provider.requests.length===startCalls)
  res=await owner.post('/app/asistent',fields({kontext:`someone-else:${co}`}));check('assistant: a stale account form cannot call AI',res.status===409&&provider.requests.length===startCalls)
  res=await owner.post('/app/asistent',fields({doklad:'assistant-foreign'}));check('assistant: a foreign selected document is refused before provider use',res.status===404&&provider.requests.length===startCalls)
  res=await owner.post('/app/asistent',fields({otazka:'x'.repeat(1201)}));check('assistant: oversized questions are refused before provider use',res.status===422&&provider.requests.length===startCalls)

  const sent=fields(),repeated=await Promise.all([owner.post('/app/asistent',sent),owner.post('/app/asistent',sent)])
  check('assistant: concurrent duplicate submissions produce one provider call and at least one confirmed answer',repeated.some(r=>r.status===200)&&repeated.every(r=>[200,409].includes(r.status))&&provider.requests.length===startCalls+1)
  const payload=provider.requests.at(-1),serialized=JSON.stringify(payload)
  check('assistant: only the typed question enters the provider, never company, document, bank or account context',payload.messages[0].content===sent.otazka&&!serialized.includes('TEST-ONLY Predajca')&&!serialized.includes(co)&&!serialized.includes('assistant-reading')&&!serialized.includes('SK3112000000198742637541')&&!serialized.includes(email))
  let use=await db.prepare('SELECT * FROM assistant_uses WHERE id=?').bind(sent.odoslanie).first()
  check('assistant: usage retains a fingerprint and known meters but no question or model-written advice',use.state==='done'&&use.input_tokens===127&&use.output_tokens===9&&use.fingerprint.length===64&&!JSON.stringify(use).includes(sent.otazka)&&!JSON.stringify(use).includes('999 eur'))
  res=await owner.post('/app/asistent',sent);html=await res.text()
  check('assistant: reloading the same submission never repeats a paid call',res.status===200&&provider.requests.length===startCalls+1&&!html.includes('Untrusted advice'))
  check('assistant: the confirmed HTML preserves the exact submission id for an ordinary browser retry',html.includes(`name="odoslanie" value="${sent.odoslanie}"`))
  await db.prepare("INSERT INTO documents(id,company_id,created_at,source,status,number) VALUES('assistant-added-later',?,?,'upload','manual','TEST-NEW')").bind(co,nowS).run()
  res=await owner.post('/app/asistent',sent)
  check('assistant: a cached topic re-reads current facts instead of replaying an old financial answer',plain(await res.text()).includes('V evidencii sú 3 doklady')&&provider.requests.length===startCalls+1)
  res=await owner.post('/app/asistent',{...sent,otazka:'TEST-ONLY Zmenená otázka'})
  check('assistant: one submission id cannot be reused for different text',res.status===409&&provider.requests.length===startCalls+1)
  res=await member.post('/app/asistent',{...sent,kontext:`assistant-member:${co}`})
  check('assistant: one member cannot recover another member’s cached question',res.status===409&&provider.requests.length===startCalls+1)

  provider.next={body:{stop_reason:'tool_use',content:[{type:'tool_use',name:'execute_sql',input:{sql:'DELETE FROM companies'}}],usage:{input_tokens:1,output_tokens:1}}}
  res=await owner.post('/app/asistent',fields());html=await res.text()
  check('assistant: an injected tool or unrecognized response never becomes an answer',res.status===503&&!html.includes('data-assistant-answer')&&!html.includes('DELETE FROM companies'))
  provider.next={status:429};const failed=fields();res=await owner.post('/app/asistent',failed)
  const failureCalls=provider.requests.length
  check('assistant: a refused API response keeps the question and the human path',res.status===503&&(await res.text()).includes(failed.otazka)&&(await db.prepare('SELECT state FROM assistant_uses WHERE id=?').bind(failed.odoslanie).first()).state==='failed')
  await owner.post('/app/asistent',failed)
  check('assistant: an uncertain or failed request is never retried automatically',provider.requests.length===failureCalls)
  provider.next={raw:'x'.repeat(40_000)};res=await owner.post('/app/asistent',fields())
  check('assistant: an oversized provider answer is refused rather than parsed or rendered',res.status===503)

  await db.exec("CREATE TRIGGER assistant_test_finish BEFORE UPDATE ON assistant_uses WHEN NEW.state='done' BEGIN SELECT RAISE(ABORT,'TEST-ONLY storage unavailable'); END")
  const unconfirmed=fields(),beforeUnconfirmed=provider.requests.length
  res=await owner.post('/app/asistent',unconfirmed);html=await res.text()
  check('assistant: an unconfirmed final write keeps the question and never claims a saved answer',res.status===503&&html.includes(unconfirmed.otazka)&&!html.includes('data-assistant-answer'))
  check('assistant: an uncertain HTML form preserves its paid attempt rather than minting a new one',html.includes(`name="odoslanie" value="${unconfirmed.odoslanie}"`))
  await owner.post('/app/asistent',unconfirmed)
  check('assistant: retrying an unconfirmed write does not repeat the provider call',provider.requests.length===beforeUnconfirmed+1)
  await db.exec('DROP TRIGGER assistant_test_finish')
  await finishQuestion(db,scope,unconfirmed.odoslanie,null)

  provider.next={before:()=>db.prepare('DELETE FROM members WHERE company_id=? AND user_id=?').bind(co,'assistant-member').run()}
  res=await member.post('/app/asistent',fields({kontext:`assistant-member:${co}`}));html=await res.text()
  check('assistant: revoked company membership during the API wait reveals no company answer',res.status!==200&&!html.includes('data-assistant-answer'))
  await db.prepare("INSERT INTO members(company_id,user_id,role,created_at) VALUES(?,?,'member',?)").bind(co,'assistant-member',nowS).run()

  await db.prepare("INSERT INTO members(company_id,user_id,role,created_at) VALUES(?,?,'owner',?)").bind(other,actor,nowS).run()
  provider.next={before:()=>db.prepare('UPDATE sessions SET company_id=? WHERE id=?').bind(other,session).run()}
  res=await owner.post('/app/asistent',fields());html=await res.text()
  check('assistant: switching company during the API wait reveals no answer for the former context',res.status===409&&!html.includes('data-assistant-answer'))
  await owner.post('/app/firma/prepnut',{firma:co})
  const accountancyBefore=(await db.prepare('SELECT (SELECT COUNT(*) FROM ledger_entries) AS books,(SELECT COUNT(*) FROM payments) AS payments,(SELECT COUNT(*) FROM filings) AS filings').first())
  provider.next={topic:'expert'};res=await owner.post('/app/asistent',fields({otazka:'TEST-ONLY Vypočítaj mi daň a pošli platbu.'}));html=await res.text()
  check('assistant: tax or payment requests go to a visible professional path without invented advice',res.status===200&&html.includes('odborné posúdenie')&&!html.includes('Untrusted advice'))
  save('assistant-expert',html)
  check('assistant: natural-language requests cannot create books, payments or filings',JSON.stringify(accountancyBefore)===JSON.stringify(await db.prepare('SELECT (SELECT COUNT(*) FROM ledger_entries) AS books,(SELECT COUNT(*) FROM payments) AS payments,(SELECT COUNT(*) FROM filings) AS filings').first()))
  const beforeMessages=(await db.prepare('SELECT COUNT(*) AS n FROM messages WHERE company_id=?').bind(co).first()).n
  res=await owner.post('/app/asistent/odovzdat',fields({otazka:'TEST-ONLY Potrebujem odborné posúdenie nákupu.',doklad:'assistant-auto'}));html=await res.text()
  check('assistant: escalation prepares the exact question and document without sending a message or notification',res.status===200&&html.includes('TEST-ONLY Potrebujem odborné posúdenie nákupu.')&&html.includes('/app/doklady/assistant-auto')&&(await db.prepare('SELECT COUNT(*) AS n FROM messages WHERE company_id=?').bind(co).first()).n===beforeMessages)
  const messageId=html.match(/name="odoslanie" value="([a-f0-9-]{36})"/)?.[1]
  const message=html.match(/<textarea[^>]*name="sprava"[^>]*>([\s\S]*?)<\/textarea>/)?.[1]
  const decoded=message?.replace(/&amp;/g,'&').replace(/&#39;/g,"'").replace(/&quot;/g,'"').replace(/&lt;/g,'<').replace(/&gt;/g,'>')
  res=await owner.post('/app/spravy',{odoslanie:messageId,sprava:decoded})
  check('assistant: the client explicitly sends the prepared expert question through the existing idempotent composer',res.status===303&&(await db.prepare('SELECT COUNT(*) AS n FROM messages WHERE id=? AND company_id=?').bind(messageId,co).first()).n===1)

  const fakeTariff={source:'paper',plans:[{id:'rast',name:'TEST-ONLY Tarif',docs:60,monthlyCents:12345}],payrollCents:987,closingCents:45678}
  await db.prepare('INSERT INTO billing_tariffs(company_id,data,created_at) VALUES(?,?,?)').bind(co,JSON.stringify(fakeTariff),nowS).run()
  res=await owner.get('/app/asistent?tema=price');html=plain(await res.text())
  check('assistant: price explanations use the stored contract tariff, not today’s marketing price',html.includes('123,45')&&html.includes('456,78')&&html.includes('uloženého zmluvného cenníka'))
  res=await member.get('/app/asistent?tema=price');html=plain(await res.text())
  check('assistant: a regular member gets the public price path without private contract numbers',!html.includes('123,45')&&html.includes('vlastník firemného účtu'))
  await db.prepare("UPDATE billing_tariffs SET data='{}' WHERE company_id=?").bind(co).run()
  res=await owner.get('/app/asistent?tema=price')
  check('assistant: corrupt contract prices are never replaced by a claimed precise price',(await res.text()).includes('nevieme spoľahlivo potvrdiť'))
  res=await owner.get('/app/asistent?tema=deadlines');check('assistant: deadlines come from the same client projection as the overview',res.status===200&&(await res.text()).includes('Celý prehľad termínov'))

  res=await team.get(`/ucto/klienti/${co}/asistent`);html=await res.text()
  check('assistant: the assigned accountant has the same sourced assistant inside her company context',res.status===200&&html.includes(`name="kontext" value="${lucia.id}:${co}"`))
  save('assistant-team',html)
  const adminUser=await ensureAmlOfficer(db),admin=as((await signIn(adminUser.email)).cookie)
  provider.next={before:()=>db.prepare('UPDATE companies SET accountant_id=? WHERE id=?').bind(adminUser.id,co).run()}
  res=await team.post(`/ucto/klienti/${co}/asistent`,fields({kontext:`${lucia.id}:${co}`}));html=await res.text()
  check('assistant: an accountant reassigned during the API wait receives no company answer',res.status!==200&&!html.includes('data-assistant-answer'))
  await db.prepare('UPDATE companies SET accountant_id=? WHERE id=?').bind(lucia.id,co).run()
  await db.prepare('UPDATE companies SET accountant_id=? WHERE id=?').bind(adminUser.id,co).run()
  check('assistant: reassignment removes the former accountant’s assistant',(await team.get(`/ucto/klienti/${co}/asistent`)).status===404)
  await db.prepare('UPDATE companies SET accountant_id=? WHERE id=?').bind(lucia.id,co).run()
  check('assistant: a client and an accountant cannot operate the global AI switch',(await owner.get('/ucto/ai/asistent')).status===404&&(await team.get('/ucto/ai/asistent')).status===404)
  res=await admin.get('/ucto/ai/asistent');save('assistant-control',await res.text())
  await admin.post('/ucto/ai/asistent',{zapnute:'nie'});const beforeDisabled=provider.requests.length
  res=await owner.post('/app/asistent',fields())
  check('assistant: the operational switch prevents provider calls immediately',res.status===503&&provider.requests.length===beforeDisabled)
  res=await owner.get('/app/asistent?tema=missing')
  check('assistant: useful quick answers keep working while cloud AI is disabled',res.status===200&&(await res.text()).includes('K 1 evidovanej platbe'))
  await admin.post('/ucto/ai/asistent',{zapnute:'ano'})
  provider.next={before:()=>admin.post('/ucto/ai/asistent',{zapnute:'nie'})}
  res=await owner.post('/app/asistent',fields());html=await res.text()
  check('assistant: disabling cloud AI while a request is in flight prevents publication of its answer',res.status===503&&!html.includes('data-assistant-answer'))
  await admin.post('/ucto/ai/asistent',{zapnute:'ano'})
  const beforeMissingKey=provider.requests.length
  const noKey=await askAssistant(db,undefined,scope,{}, {id:randomUUID(),question:'TEST-ONLY otázka',document:''},async()=>true)
  check('assistant: a missing provider binding has a graceful path and makes no reservation',noKey.status===503&&provider.requests.length===beforeMissingKey)

  let immutable=false,retained=false
  try{await db.prepare('UPDATE assistant_uses SET input_tokens=0 WHERE id=?').bind(sent.odoslanie).run()}catch{immutable=true}
  try{await db.prepare('DELETE FROM assistant_uses WHERE id=?').bind(sent.odoslanie).run()}catch{retained=true}
  check('assistant: completed usage evidence cannot be edited or erased early',immutable&&retained)
  const seed=async(company,user,side,n)=>{
    for(let i=0;i<n;i++){
      const id=randomUUID()
      await db.prepare('INSERT INTO assistant_uses(id,company_id,actor,side,fingerprint,day,created_at,model) VALUES(?,?,?,?,?,?,?,?)').bind(id,company,user,side,'0'.repeat(64),day(0),nowS,'TEST-ONLY boundary fixture').run()
      await db.prepare("UPDATE assistant_uses SET state='failed',finished_at=? WHERE id=?").bind(nowS,id).run()
    }
  }
  const used=(await db.prepare('SELECT COUNT(*) AS n FROM assistant_uses WHERE actor=? AND day=?').bind(actor,day(0)).first()).n
  await seed(co,actor,'client',12-used)
  res=await owner.post('/app/asistent',fields());html=await res.text()
  check('assistant: the daily per-user cap is enforced while preserving the question and expert route',res.status===429&&html.includes('limit softvérových otázok')&&html.includes('Pripraviť otázku účtovníčke'))
  const companyUsed=(await db.prepare('SELECT COUNT(*) AS n FROM assistant_uses WHERE company_id=? AND day=?').bind(co,day(0)).first()).n
  await seed(co,adminUser.id,'team',39-companyUsed)
  const companyCap=await Promise.all(['company-boundary-a','company-boundary-b'].map(async label=>assistantStore.reserveQuestion(db,{company:co,actor:label==='company-boundary-a'?'assistant-member':lucia.id,side:label==='company-boundary-a'?'client':'team'},randomUUID(),label,'')))
  check('assistant: concurrent different users cannot cross a company’s daily cap',companyCap.filter(x=>x.kind==='new').length===1&&(await db.prepare('SELECT COUNT(*) AS n FROM assistant_uses WHERE company_id=? AND day=?').bind(co,day(0)).first()).n===40)
  const globalUsed=(await db.prepare('SELECT COUNT(*) AS n FROM assistant_uses WHERE day=?').bind(day(0)).first()).n
  await seed(other,adminUser.id,'team',199-globalUsed)
  await db.prepare("UPDATE assistant_uses SET state='failed',finished_at=? WHERE state='pending'").bind(nowS).run()
  await db.batch([
    db.prepare("INSERT INTO companies(id,created_at,name,plan,inbox,contract_at,accountant_id) VALUES('assistant-global-a',?,'TEST-ONLY Global A','rast','assistant-global-a',?,?),('assistant-global-b',?,'TEST-ONLY Global B','rast','assistant-global-b',?,?)").bind(nowS,nowS,lucia.id,nowS,nowS,lucia.id),
    db.prepare("INSERT INTO users(id,created_at,name,email) VALUES('assistant-global-owner',?,'TEST-ONLY Global owner','assistant-global-owner@example.test')").bind(nowS),
    db.prepare("INSERT INTO members(company_id,user_id,role,created_at) VALUES('assistant-global-a','assistant-global-owner','owner',?)").bind(nowS),
  ])
  const globals=await Promise.all([assistantStore.reserveQuestion(db,{company:'assistant-global-a',actor:'assistant-global-owner',side:'client'},randomUUID(),'TEST-ONLY global A',''),assistantStore.reserveQuestion(db,{company:'assistant-global-b',actor:lucia.id,side:'team'},randomUUID(),'TEST-ONLY global B','')])
  check('assistant: the global cap also holds across simultaneous companies and users',globals.filter(x=>x.kind==='new').length===1&&(await db.prepare('SELECT COUNT(*) AS n FROM assistant_uses WHERE day=?').bind(day(0)).first()).n===200)
  const entries=await handoverData(db,co,day(0).slice(0,4),nowS)
  const exported=JSON.parse(new TextDecoder().decode(await entries.find(e=>e.name==='data/asistent-pouzitie.json').data()))
  const clientUses=(await db.prepare("SELECT COUNT(*) AS n FROM assistant_uses WHERE company_id=? AND side='client'").bind(co).first()).n
  check('assistant: a full company export carries the client\'s usage evidence without raw questions',exported.length===clientUses&&clientUses>0&&exported.some(r=>r.id===sent.odoslanie)&&!JSON.stringify(exported).includes(sent.otazka))
  check('assistant: the team\'s use of the assistant is no data of the client\'s export (26 October 2026)',exported.every(r=>r.side!=='team')&&(await db.prepare("SELECT COUNT(*) AS n FROM assistant_uses WHERE company_id=? AND side='team'").bind(co).first()).n>0)
  await db.prepare('UPDATE companies SET ends_on=? WHERE id=?').bind(day(-100),co).run()
  await archiveEnded({DB:db,FILES:files},day(0))
  check('assistant: ending service removes assistant access while retaining audit evidence',(await owner.get('/app/asistent')).status!==200&&(await db.prepare('SELECT COUNT(*) AS n FROM assistant_uses WHERE company_id=?').bind(co).first()).n===40)
  const future=`${Number(day(0).slice(0,4))+6}-${day(0).slice(5)}`
  await purgeCompany({DB:db,FILES:files},co,future)
  await db.prepare('UPDATE companies SET purge_started_at=? WHERE id=?').bind(nowS-86401,co).run()
  await purgeCompany({DB:db,FILES:files},co,future)
  await forgetRecords({DB:db,FILES:files},future)
  check('assistant: final authorized erasure leaves no usage foreign-key orphan',!(await db.prepare('SELECT id FROM companies WHERE id=?').bind(co).first())&&!(await db.prepare('SELECT id FROM assistant_uses WHERE company_id=?').bind(co).first()))
}
