// The real Worker, D1, R2 and session/role gates. Synthetic contacts only; no external message is sent.
import { check } from './check.mjs'
import { randomUUID, createHash } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { migrationSteps } from '../.wrangler/dist/schema.js'
import { handoverData, archiveEnded, purgeCompany, forgetRecords } from '../.wrangler/dist/stores.js'
import { ensureAmlOfficer } from './aml.runtime.mjs'

export async function checkManagedTakeover({db,files,as,signIn,lucia,nowS,day,capture}) {
  check('managed takeover: all 77 previously deployed migration steps remain unchanged',createHash('sha256').update(JSON.stringify(migrationSteps.slice(0,77))).digest('hex') === '41efbbc5455d8d5096d8c2ee9b1ab27f93f5a389a38f41a431c9c137bd6fc45a')
  const company = 'co-managed-takeover', email = 'managed-owner@example.test', user = 'managed-owner'
  await db.batch([
    db.prepare("INSERT INTO companies(id,created_at,name,ico,plan,inbox,start_on,contract_at,accountant_id) VALUES(?,?,'TEST-ONLY Spravované prevzatie','50888874','rast','managed-takeover',?,?,?)").bind(company,nowS,`${day(0).slice(0,4)}-01-01`,nowS,lucia.id),
    db.prepare("INSERT INTO users(id,created_at,name,email) VALUES(?,?,'TEST-ONLY Konateľ',?),('managed-member',?,'TEST-ONLY Kolega','managed-member@example.test')").bind(user,nowS,email,nowS),
    db.prepare("INSERT INTO members(company_id,user_id,role,created_at) VALUES(?,?,'owner',?),(?,'managed-member','member',?)").bind(company,user,nowS,company,nowS),
  ])
  const ownerLogin = await signIn(email)
  const owner = as(ownerLogin.cookie), member = as((await signIn('managed-member@example.test')).cookie), team = as((await signIn('lucia@firmony.test')).cookie)
  const ownerSession = createHash('sha256').update(ownerLogin.cookie.split('=')[1]).digest('hex')
  const anonymous = as('')
  const save = (name,html) => {if(capture) writeFileSync(`${capture}/${name}.html`,html)}
  const plain = text => text.replace(/[\u00a0\u202f]/g,' ')
  let res = await owner.get('/app/prechod'), html = await res.text()
  const id = html.match(/name="odoslanie" value="([a-f0-9-]{36})"/)?.[1]
  check('managed takeover: the owner sees a scoped coordination request and the original manual alternative',res.status === 200 && Boolean(id) && html.includes('Poveriť Firmony koordináciou') && html.includes('List a podklady si chcem vybaviť osobne'))
  const alertPath = `/app/prechod/otazka?ziadost=${id}`
  res = await anonymous.get(alertPath)
  const signInPath = res.headers.get('location')
  check('managed takeover: an unauthenticated alert preserves only its scoped task through login',res.status === 303 && new URL(signInPath,'https://firmony.io').searchParams.get('n') === alertPath && (await (await anonymous.get(signInPath)).text()).includes(`name="n" value="${alertPath}"`))
  res = await anonymous.post('/app/prihlasenie',{email:'not-an-email',n:alertPath})
  check('managed takeover: a login validation error preserves the intended task',res.status === 422 && (await res.text()).includes(`name="n" value="${alertPath}"`))
  res = await anonymous.get('/app/prihlasenie?n=https%3A%2F%2Fevil.example%2F')
  check('managed takeover: login never accepts an external return URL',!(await res.text()).includes('name="n"'))
  res = await anonymous.post('/app/prihlasenie',{email,n:alertPath})
  const loginMail = await db.prepare("SELECT body FROM outbox WHERE recipient=? AND id LIKE 'login:%' ORDER BY created_at DESC,rowid DESC LIMIT 1").bind(email).first()
  const loginUrl = new URL(loginMail.body.match(/https:\/\/firmony.io\/app\/vstup\?[^\s]+/)[0])
  check('managed takeover: the actual sign-in email retains the exact safe task',res.status === 303 && loginUrl.searchParams.get('n') === alertPath)
  const enter = await (await anonymous.get(loginUrl.pathname+loginUrl.search)).text()
  check('managed takeover: the mailbox link remains a confirmation page with the same task',enter.includes(`name="n" value="${alertPath}"`))
  res = await anonymous.post('/app/vstup',{t:loginUrl.searchParams.get('t'),n:alertPath})
  check('managed takeover: explicit mailbox confirmation returns to the requested task',res.status === 303 && res.headers.get('location') === alertPath)
  save('managed-takeover-request',html)
  const request = {firma:company,odoslanie:id,meno:'TEST-ONLY Stará kancelária',email:'old-accountant@example.test',den:day(10),suhlas:'ano'}
  res = await owner.post('/app/prechod/poverit',{...request,suhlas:''})
  check('managed takeover: consent is mandatory and a refusal preserves typed contact data',res.status === 422 && (await res.text()).includes('old-accountant@example.test') && !(await db.prepare('SELECT id FROM managed_handovers WHERE company_id=?').bind(company).first()))
  check('managed takeover: a colleague cannot authorize coordination',(await member.post('/app/prechod/poverit',request)).status === 403)
  check('managed takeover: a stale company form cannot create a request for the current company',(await owner.post('/app/prechod/poverit',{...request,firma:'other-company'})).status === 409)
  const repeated = await Promise.all([owner.post('/app/prechod/poverit',request),owner.post('/app/prechod/poverit',request)])
  let h = await db.prepare('SELECT * FROM managed_handovers WHERE company_id=?').bind(company).first()
  check('managed takeover: concurrent retries create one request, one history revision and one audit event',repeated.every(r => r.status === 303) && h?.id === id && (await db.prepare('SELECT COUNT(*) AS n FROM managed_handover_history WHERE case_id=?').bind(id).first()).n === 1 && (await db.prepare("SELECT COUNT(*) AS n FROM events WHERE subject=? AND action='takeover.managed.requested'").bind(id).first()).n === 1)
  check('managed takeover: the full scope and company identity are retained with the requester',h.consent_version === '2026-10-22' && h.requester_name === 'TEST-ONLY Konateľ' && h.consent_text.includes('nenahrádza osobitné plnomocenstvo') && JSON.parse(h.company_snapshot).ico === '50888874')
  await db.prepare("INSERT INTO members(company_id,user_id,role,created_at) VALUES(?,?,'member',?)").bind(company,lucia.id,nowS).run()
  res = await team.get(alertPath)
  check('managed takeover: a verified team member acquiring a client membership retains the exact task',res.status === 303 && res.headers.get('location') === alertPath && (await team.get(alertPath)).headers.get('location') === '/app/prechod#koordinacia')
  await db.prepare('DELETE FROM members WHERE company_id=? AND user_id=?').bind(company,lucia.id).run()
  res = await owner.post('/app/prechod/poverit',{...request,email:'different@example.test'})
  check('managed takeover: reusing a request id cannot change its recipient or scope',res.status === 409 && (await db.prepare('SELECT contact_email FROM managed_handovers WHERE id=?').bind(id).first()).contact_email === request.email)
  check('managed takeover: the team has a company-scoped work queue',(await (await team.get('/ucto')).text()).includes(`/ucto/klienti/${company}/prevzatie#koordinacia`))
  check('managed takeover: a client cannot open accountant actions',(await owner.get(`/ucto/klienti/${company}/prevzatie`)).status === 404)
  await db.prepare('UPDATE companies SET accountant_id=NULL WHERE id=?').bind(company).run()
  check('managed takeover: reassignment immediately removes the former accountant’s page and work queue',(await team.get(`/ucto/klienti/${company}/prevzatie`)).status === 404 && !(await (await team.get('/ucto')).text()).includes(`/ucto/klienti/${company}/prevzatie#koordinacia`))
  await db.prepare('UPDATE companies SET accountant_id=? WHERE id=?').bind(lucia.id,company).run()
  const base = `/ucto/klienti/${company}/prevzatie/prechod`
  const revision = async () => (await db.prepare('SELECT revision FROM company_data_revisions WHERE company_id=?').bind(company).first())?.revision ?? 0
  const current = async () => db.prepare('SELECT * FROM managed_handovers WHERE id=?').bind(id).first()
  const form = async (changes = {}) => {
    h = await current()
    return {firma:company,ziadost:id,verzia:String(h.revision),podklady_verzia:String(await revision()),stav:h.state,termin:day(5),opravnenie:'TEST-ONLY Overený osobitný rozsah plnomocenstva, podpis a oprávnený konateľ, podklad v spise.',kontakt:'TEST-ONLY Odoslaný e-mail na overený kontakt, Message-ID <test-takeover@example.test>.',kontakt_den:day(0),verejne:'TEST-ONLY Dohadujeme bezpečné odovzdanie.',od_klienta:'',dovod:'TEST-ONLY Konkrétny záznam kontroly účtovníčky.',...changes}
  }
  res = await team.post(`${base}/stav`,await form({stav:'completed'}))
  check('managed takeover: a request cannot skip professional coordination or become completed directly',res.status === 409 && (await current()).state === 'requested')
  res = await team.post(`${base}/stav`,await form({stav:'coordinating',opravnenie:''}))
  check('managed takeover: a checkbox never manufactures verified authority',res.status === 409 && (await current()).revision === 0)
  res = await team.post(`${base}/stav`,await form({stav:'coordinating'}))
  check('managed takeover: the assigned accountant accepts responsibility and a dated next step',res.status === 303 && (await current()).responsible_id === lucia.id && (await current()).due_on === day(5))
  res = await team.get(`${base}/ziadost.txt`)
  const draft = await res.text()
  check('managed takeover: a ready contact text is a download, never a claim of sending or a termination',res.status === 200 && draft.includes('nie je výpoveďou') && draft.includes('Citlivé podklady neposielajte') && !(await db.prepare('SELECT id FROM outbox WHERE recipient=?').bind(request.email).first()))
  const clientHtml = await (await owner.get('/app/prechod')).text()
  check('managed takeover: the client sees real progress without private authority/contact evidence',clientHtml.includes('Dohadujeme prevzatie') && !clientHtml.includes('TEST-ONLY Overený osobitný rozsah') && !clientHtml.includes('Message-ID'))
  save('managed-takeover-client',clientHtml)
  res = await team.post(`${base}/stav`,await form({stav:'waiting',kontakt:''}))
  check('managed takeover: waiting for documents requires a record of actual contact',res.status === 409)
  res = await team.post(`${base}/stav`,await form({stav:'waiting',kontakt_den:day(1)}))
  check('managed takeover: future contact is not accepted as already performed',res.status === 409)
  res = await team.post(`${base}/stav`,await form({stav:'waiting'}))
  check('managed takeover: actual contact and its reference precede waiting',res.status === 303 && (await current()).state === 'waiting')
  res = await team.post(`${base}/stav`,await form({stav:'reviewing'}))
  check('managed takeover: an empty file area cannot be declared received',res.status === 409)
  const fields = async () => Object.entries({firma:company,ziadost:id,verzia:String((await current()).revision)})
  const invalid = {name:'TEST-ONLY invalid.exe',bytes:new Uint8Array([0,1,2,3,0,5])}
  const original = {name:'TEST-ONLY hlavna-kniha.csv',bytes:new TextEncoder().encode('Účet;MD;D\n'+ '221.001;100;0\n'.repeat(2000))}
  res = await team.form(`${base}/podklady`,[...await fields(),['file',original],['file',invalid]])
  check('managed takeover: a mixed invalid batch is refused before saving any file',res.status === 422 && !(await db.prepare("SELECT id FROM company_files WHERE company_id=? AND kind='takeover'").bind(company).first()))
  res = await team.form(`${base}/podklady`,[...await fields(),['file',original]])
  const file = await db.prepare("SELECT * FROM company_files WHERE company_id=? AND kind='takeover'").bind(company).first()
  check('managed takeover: the accountant can store a real export above the ordinary form limit',res.status === 303 && file?.file_size === original.bytes.length && (await files.head(file.r2_key))?.size === original.bytes.length && (await db.prepare("SELECT detail FROM events WHERE subject=? AND action='takeover.managed.file'").bind(file.id).first())?.detail.includes(id))
  const questionForm = await form({stav:'reviewing',od_klienta:'TEST-ONLY Potvrďte obchodný rozsah prevzatia.'})
  const beforeQuestion = await current()
  const beforeQuestionHistory = (await db.prepare('SELECT COUNT(*) AS n FROM managed_handover_history WHERE case_id=?').bind(id).first()).n
  await db.prepare("CREATE TRIGGER test_managed_bell_failure BEFORE INSERT ON outbox WHEN NEW.id LIKE 'bell:managed-question:%' BEGIN SELECT RAISE(ABORT,'TEST-ONLY outbox failure'); END").run()
  res = await team.post(`${base}/stav`,questionForm)
  check('managed takeover: outbox persistence failure rolls back the question and its success history',res.status === 409 && (await current()).revision === beforeQuestion.revision && (await current()).client_action === '' && (await db.prepare('SELECT COUNT(*) AS n FROM managed_handover_history WHERE case_id=?').bind(id).first()).n === beforeQuestionHistory)
  await db.prepare('DROP TRIGGER test_managed_bell_failure').run()
  const concurrentQuestions = await Promise.all([team.post(`${base}/stav`,questionForm),team.post(`${base}/stav`,questionForm)])
  res = concurrentQuestions.find(r => r.status === 303) ?? concurrentQuestions[0]
  const noticePrefix = `bell:managed-question:${id}:`
  const notices = (await db.prepare('SELECT recipient,body FROM outbox WHERE substr(id,1,length(?1))=?1').bind(noticePrefix).all()).results
  check('managed takeover: concurrent question updates enqueue one private bell per eligible member',concurrentQuestions.filter(r=>r.status === 303).length === 1 && notices.length === 2 && notices.some(n=>n.recipient === email) && notices.every(n=>n.body.includes(alertPath) && !n.body.includes(questionForm.od_klienta) && !n.body.includes(request.meno)))
  check('managed takeover: an explicit client question stays a visible overview action',res.status === 303 && (await (await owner.get('/app')).text()).includes('data-overview-action="managed-takeover"'))
  await db.batch([
    db.prepare("INSERT INTO companies(id,created_at,name,plan,inbox) VALUES('co-managed-other',?,'TEST-ONLY Iná firma','rast','managed-other')").bind(nowS),
    db.prepare("INSERT INTO members(company_id,user_id,role,created_at) VALUES('co-managed-other',?,'owner',?)").bind(user,nowS),
    db.prepare("INSERT INTO users(id,created_at,email,name) VALUES('managed-stranger',?,'managed-stranger@example.test','TEST-ONLY Cudzí používateľ')").bind(nowS),
    db.prepare("INSERT INTO members(company_id,user_id,role,created_at) VALUES('co-managed-other','managed-stranger','owner',?)").bind(nowS),
  ])
  const stranger = as((await signIn('managed-stranger@example.test')).cookie)
  res = await stranger.get(alertPath)
  check('managed takeover: an alert id discloses no company or question to a non-member',res.status === 404 && !(await res.text()).includes(request.meno))
  check('managed takeover: an alert in its current company opens the authoritative case',(await owner.get(alertPath)).headers.get('location') === '/app/prechod#koordinacia')
  await owner.post('/app/firma/prepnut',{firma:'co-managed-other'})
  res = await owner.get(alertPath)
  const choice = await res.text()
  check('managed takeover: an alert for another owned company asks for explicit selection without switching on GET',res.status === 200 && choice.includes('data-takeover-company-choice') && choice.includes(`name="firma" value="${company}"`) && (await db.prepare('SELECT company_id FROM sessions WHERE id=?').bind(ownerSession).first()).company_id === 'co-managed-other')
  save('managed-takeover-choice',choice)
  await owner.post('/app/firma/prepnut',{firma:company})
  check('managed takeover: explicit company selection exposes the outstanding task in the correct overview',(await (await owner.get('/app')).text()).includes('data-overview-action="managed-takeover"'))
  res = await team.post(`${base}/stav`,await form({od_klienta:questionForm.od_klienta}))
  check('managed takeover: an unchanged outstanding question does not send another bell',res.status === 303 && (await db.prepare('SELECT COUNT(*) AS n FROM outbox WHERE substr(id,1,length(?1))=?1').bind(noticePrefix).first()).n === 2)
  const teamHtml = await (await team.get(`/ucto/klienti/${company}/prevzatie`)).text()
  check('managed takeover: review joins stored originals, existing imports and all seven evidence areas',plain(teamHtml).includes(file.file_name) && (teamHtml.match(/name="stav_(?:books|items|bank|assets|payroll|filings|opening)"/g) ?? []).length === 7 && plain(teamHtml).includes('Počiatočné stavy z obratovej predvahy'),JSON.stringify({file:plain(teamHtml).includes(file.file_name),fields:(teamHtml.match(/name="stav_(?:books|items|bank|assets|payroll|filings|opening)"/g) ?? []).length,imports:plain(teamHtml).includes('Počiatočné stavy z obratovej predvahy')}))
  save('managed-takeover-team',teamHtml)
  res = await team.post(`${base}/stav`,await form({stav:'completed',od_klienta:'TEST-ONLY Stále potrebujeme odpoveď.'}))
  check('managed takeover: completion cannot hide an outstanding customer action',res.status === 409)
  res = await team.post(`${base}/stav`,await form({stav:'completed'}))
  check('managed takeover: unchecked areas cannot be bulk declared complete',res.status === 409)
  const checked = {}
  for (const k of ['books','items','bank','assets','payroll','filings','opening']) Object.assign(checked,{[`stav_${k}`]:k === 'books' || k === 'opening' ? 'received' : 'not_applicable',[`subor_${k}`]:file.id,[`poznamka_${k}`]:`TEST-ONLY ${k}: konkrétny rozsah a výsledok kontroly alebo odôvodnená neprítomnosť.`})
  res = await team.post(`${base}/stav`,await form({stav:'completed',...checked,subor_books:'other-company-file'}))
  check('managed takeover: a file of another company is not completion evidence',res.status === 409)
  res = await team.post(`${base}/stav`,await form({stav:'completed',...checked}))
  check('managed takeover: received opening balances require a real saved ledger entry',res.status === 409)
  res = await team.post(`/ucto/klienti/${company}/kniha/pociatocne`,{datum:`1. 1. ${day(0).slice(0,4)}`,ucet_0:'221.001',md_0:'100,00',d_0:'',ucet_1:'411',md_1:'',d_1:'100,00'})
  check('managed takeover: the existing opening-balance workflow remains the source of the books',res.status === 303 && Boolean(await db.prepare("SELECT id FROM ledger_entries WHERE company_id=? AND kind='opening' AND deleted_at IS NULL").bind(company).first()))
  const stale = await form({stav:'completed',...checked})
  await db.prepare("INSERT INTO messages(id,company_id,created_at,side,body) VALUES('managed-source-change',?,?,'client','TEST-ONLY New evidence after review')").bind(company,nowS).run()
  res = await team.post(`${base}/stav`,stale)
  check('managed takeover: newly changed source data require a fresh professional review',res.status === 409 && (await current()).state === 'reviewing')
  await files.delete(file.r2_key)
  res = await team.post(`${base}/stav`,await form({stav:'completed',...checked}))
  check('managed takeover: a database row without its R2 original cannot complete the handover',res.status === 409)
  await files.put(file.r2_key,original.bytes)
  const complete = await form({stav:'completed',...checked})
  res = await team.post(`${base}/stav`,complete)
  h = await current()
  const historyCount = (await db.prepare('SELECT COUNT(*) AS n FROM managed_handover_history WHERE case_id=?').bind(id).first()).n
  check('managed takeover: completion retains the accountant, seven results and exact original/ledger snapshot',res.status === 303 && h.state === 'completed' && JSON.parse(h.completion_source).files[0].id === file.id && JSON.parse(h.completion_source).opening.length === 1 && JSON.parse(h.checks).books.file === file.id && h.updated_by === lucia.id)
  res = await team.post(`${base}/stav`,complete)
  check('managed takeover: repeating a completed stale form cannot add a second completion or audit revision',res.status === 409 && (await db.prepare('SELECT COUNT(*) AS n FROM managed_handover_history WHERE case_id=?').bind(id).first()).n === historyCount)
  let immutable = false, retained = false
  try { await db.prepare("UPDATE managed_handover_history SET by_name='tampered' WHERE case_id=?").bind(id).run() } catch { immutable = true }
  try { await db.prepare('DELETE FROM managed_handover_history WHERE case_id=?').bind(id).run() } catch { retained = true }
  check('managed takeover: revision history cannot be edited or deleted before statutory erasure',immutable && retained)
  const entries = await handoverData(db,company,day(0).slice(0,4),nowS)
  const cases = JSON.parse(new TextDecoder().decode(await entries.find(e => e.name === 'data/spravovane-prevzatie.json').data()))
  const history = JSON.parse(new TextDecoder().decode(await entries.find(e => e.name === 'data/historia-spravovaneho-prevzatia.json').data()))
  check('managed takeover: a portable accounting archive includes consent and every workflow revision',cases[0].consent_text === h.consent_text && history.length === historyCount)
  res = await team.post(`${base}/stav`,await form({stav:'reviewing',...checked,dovod:'TEST-ONLY Nová informácia vyžaduje opakovanú kontrolu.'}))
  check('managed takeover: a completed case can be explicitly reopened without overwriting its old evidence',res.status === 303 && (await current()).state === 'reviewing' && (await db.prepare("SELECT data FROM managed_handover_history WHERE case_id=? AND json_extract(data,'$.state')='completed'").bind(id).first()).data.includes('completionSource'))
  const cancel = {firma:company,ziadost:id,verzia:String((await current()).revision)}
  res = await owner.post('/app/prechod/odvolat',cancel)
  check('managed takeover: an owner can withdraw ongoing coordination with retained history',res.status === 303 && (await current()).state === 'cancelled' && (await team.get(`${base}/ziadost.txt`)).status === 404)
  res = await owner.post('/app/prechod/poverit',request)
  check('managed takeover: replaying an old consent after withdrawal cannot restart coordination',res.status === 409 && (await db.prepare('SELECT COUNT(*) AS n FROM managed_handovers WHERE company_id=?').bind(company).first()).n === 1)
  check('managed takeover: stale accountant updates cannot revive withdrawn authority',(await team.post(`${base}/stav`,await form({stav:'coordinating'}))).status === 409)
  const nextRequest = {...request,odoslanie:randomUUID()}
  res = await owner.post('/app/prechod/poverit',nextRequest)
  check('managed takeover: only a new deliberate request creates a new consent after withdrawal',res.status === 303 && (await db.prepare('SELECT COUNT(*) AS n FROM managed_handovers WHERE company_id=?').bind(company).first()).n === 2)
  await db.prepare('UPDATE companies SET ends_on=? WHERE id=?').bind(day(-1),company).run()
  check('managed takeover: an ended service cannot authorize new coordination',(await owner.post('/app/prechod/poverit',{...nextRequest,odoslanie:randomUUID()})).status === 409)
  const archived = await db.prepare('SELECT COUNT(*) AS n FROM managed_handover_history WHERE company_id=?').bind(company).first()
  check('managed takeover: the end of service preserves all coordination evidence',archived.n === historyCount + 3)
  check('managed takeover: no request was sent to the former accountant by a test or state change',!(await db.prepare('SELECT id FROM outbox WHERE recipient=?').bind(request.email).first()))
  await db.prepare('UPDATE companies SET ends_on=? WHERE id=?').bind(day(-100),company).run()
  await archiveEnded({DB:db,FILES:files},day(0))
  check('managed takeover: after the access window the former client and accountant lose the work page',(await team.get(`/ucto/klienti/${company}/prevzatie`)).status === 404 && !(await (await owner.get('/app/prechod')).text()).includes('old-accountant@example.test'))
  const officer = as((await signIn((await ensureAmlOfficer(db)).email)).cookie)
  res = await officer.get(`/ucto/archiv/${company}/uctovnictvo.zip?rok=${day(0).slice(0,4)}`)
  check('managed takeover: only the designated archive path retains a read-only complete accounting export',res.status === 200 && (res.headers.get('content-type') ?? '').includes('zip') && (await team.get(`/ucto/archiv/${company}`)).status === 404)
  await res.arrayBuffer()
  const future = `${Number(day(0).slice(0,4))+6}-${day(0).slice(5)}`
  await purgeCompany({DB:db,FILES:files},company,future)
  await db.prepare('UPDATE companies SET purge_started_at=? WHERE id=?').bind(Math.floor(Date.now()/1000)-86401,company).run()
  await purgeCompany({DB:db,FILES:files},company,future)
  check('managed takeover: statutory history is kept until the final legal-record erasure step',Boolean((await db.prepare('SELECT purged_at FROM companies WHERE id=?').bind(company).first())?.purged_at) && (await db.prepare('SELECT COUNT(*) AS n FROM managed_handover_history WHERE company_id=?').bind(company).first()).n === archived.n)
  await forgetRecords({DB:db,FILES:files},future)
  check('managed takeover: authorized final erasure removes the case and revisions without a foreign-key orphan',!(await db.prepare('SELECT id FROM companies WHERE id=?').bind(company).first()) && (await db.prepare('SELECT COUNT(*) AS n FROM managed_handovers WHERE company_id=?').bind(company).first()).n === 0 && (await db.prepare('PRAGMA foreign_key_check').all()).results.length === 0)
}
