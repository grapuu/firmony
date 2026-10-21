// Synthetic attestations exercise workflow protection. They do not claim cryptographic QES validation.
import { check } from './check.mjs'
import { aml, amlEnhanced, amlModel,amlAutoReview,teamDeadlines,archiveEnded,forgetProspects, acceptStatements, contractGate, contractCatalogueHash, orderOfferHash, orderOf } from '../.wrangler/dist/stores.js'

export const testDeclaration = (extra = {}) => ({
  version: 2, director: { name: 'AML Test Owner', birthNumber: '', birthDate: '1990-01-01', address: 'Testovacia 12, Košice', nationality: 'slovenská', citizenships: 'SK', residenceCountry: 'SK', pep: false, idKind: 'op', idNumber: 'TESTONLY123' },
  kuv: 'self', owners: [], activity: 'Vývoj softvéru', income: 'Príjmy z vlastných služieb', turnover: 'do-50', cash: false, abroad: false, abroadWhere: '',
  businessAtSeat: true, businessAddress: '', businessCountries: 'SK', ownBehalf: true, partnerCountries: 'SK', ...extra,
})

export async function ensureAmlOfficer(db) {
  const existing = await aml.officer(db)
  if (existing) return { id: existing.id, team: 'admin', name: existing.name, email: existing.email, reminders: true }
  await db.prepare("INSERT INTO users (id,created_at,email,name,team) VALUES ('aml-test-officer',unixepoch(),'officer@aml.test','TEST ONLY officer','admin')").run()
  await db.prepare("INSERT INTO events (at,user_id,action) VALUES (unixepoch(),'aml-test-officer','team.bootstrap')").run()
  await aml.bootstrapOfficerStatement(db, 'aml-test-officer').run()
  return { id: 'aml-test-officer', team: 'admin', name: 'TEST ONLY officer', email: 'officer@aml.test', reminders: true }
}
export async function seedAmlDossier(db, files, orderId, officerUser, declaration = testDeclaration()) {
  const row = await db.prepare('SELECT * FROM orders WHERE id = ?').bind(orderId).first()
  const order = orderOf(row)
  const data = { ...declaration, director: { ...declaration.director, name: order.directors?.find((p)=>p.name===declaration.director.name)?.name ?? order.directors?.[0]?.name ?? declaration.director.name } }
  const bytes = new TextEncoder().encode('%PDF-1.7\nTEST_ONLY_SYNTHETIC_NO_REAL_SIGNATURE\n%%EOF\n')
  const file = { bytes, type: 'pdf', name: 'TEST_ONLY-signed-declaration.pdf', sha256: await aml.bytesHash(bytes) }
  const made = await aml.prepareDossier(db, files, { order }, data, file, null)
  await made.statement.run()
  let view = await aml.dossierOfOrder(db, order.id)
  for (const kind of ['identity','kuv','pep','eu-sanctions','un-sanctions','countries']) {
    const done = await aml.recordCheck(db, officerUser, view, { kind, result: 'clear', source: `TEST ONLY independent ${kind} evidence reference`, subject: view.dossier.signer_name, qualified: true, hash: view.dossier.facts_hash })
    if (!done) throw new Error(`Could not seed ${kind}`)
  }
  view = await aml.dossierOfOrder(db, order.id)
  const level = view.dossier.required_risk
  if (!await aml.decideDossier(db, officerUser, view, { level, decision: 'approved', note: 'TEST ONLY complete source review', enhanced: level === 'high' ? 'TEST ONLY wealth, funds and additional independent sources' : '', hash: view.dossier.facts_hash })) throw new Error('Could not seed approval')
  return aml.dossierOfOrder(db, order.id)
}
export async function seedAmlBank(db,files,view,user) {
  const bytes=new TextEncoder().encode('%PDF-1.7\nTEST_ONLY bank original\n%%EOF')
  const original={bytes,sha256:await aml.bytesHash(bytes)}
  await (await amlEnhanced.prepareBankEvidence(db,files,view.dossier,original,original,user.id)).run()
  const proof=(await amlEnhanced.bankEvidence(db,view.dossier.id))[0]
  return {id:proof.id,iban:'SK3112000000198742637541',country:'SK',owner:JSON.parse(view.dossier.company_facts).name,reference:'TEST ONLY independently verified actual incoming payment'}
}
export async function checkAmlAdmission(db, files) {
  const user = await ensureAmlOfficer(db)
  const ts = Math.floor(Date.now()/1000)
  await db.prepare("INSERT INTO users (id,created_at,email,name,team) VALUES ('aml-other-admin',?,'other@aml.test','Other administrator','admin'),('aml-expert',?,'expert@aml.test','AML accountant','accountant')").bind(ts,ts).run()
  await db.prepare(`INSERT INTO orders (id,token,created_at,expires_at,ico,company,address,register_line,directors,plan,person,email)
    VALUES ('aml-live-order','test-token-hash',?,?,'90909090','TEST ONLY AML company','Testovacia 12, Košice','TEST ONLY register',?,'rast','AML Test Owner','owner@aml.test')`)
    .bind(ts,ts+86400,JSON.stringify([{ name:'AML Test Owner',role:'Konateľ' }])).run()
  const order = () => db.prepare("SELECT * FROM orders WHERE id='aml-live-order'").first().then(orderOf)
  check('AML admission is absent before any identity evidence', await aml.admissionForOrder(db,await order()) === null)
  const bytes = new TextEncoder().encode('%PDF-1.7\nTEST ONLY ORIGINAL\n%%EOF\n')
  const file = { bytes,type:'pdf',name:'TEST_ONLY.pdf',sha256:await aml.bytesHash(bytes) }
  const made = await aml.prepareDossier(db,files,{ order:await order() },testDeclaration(),file,null)
  await made.statement.run()
  let view = await aml.dossierOfOrder(db,'aml-live-order')
  let bank
  const decision = (who, level='low', enhanced='') => aml.decideDossier(db,who,view,{ level,enhanced,decision:'approved',note:'TEST ONLY independently reviewed',hash:view.dossier.facts_hash,bank })
  check('an uploaded PDF alone does not verify a signature or open signing', !view.ready && !await decision(user))
  const input = (kind, extra={}) => ({ kind,result:'clear',source:`TEST ONLY ${kind} independent evidence`,subject:'AML Test Owner',qualified:true,hash:view.dossier.facts_hash,...extra })
  check('a qualified-signature attestation with another subject is refused', !await aml.recordCheck(db,user,view,input('identity',{subject:'Another Person'})))
  check('a signature without explicit qualified-and-content validation is refused', !await aml.recordCheck(db,user,view,input('identity',{qualified:false})))
  check('a check without a real evidence reference is refused', !await aml.recordCheck(db,user,view,input('kuv',{source:'yes'})))
  for (const kind of ['identity','kuv','pep','eu-sanctions','un-sanctions']) check(`the ${kind} check records its actor and source`, await aml.recordCheck(db,user,view,input(kind)))
  view = await aml.dossierOfOrder(db,'aml-live-order')
  check('missing geography still prevents approval after the other five checks', !await decision(user))
  check('geography is recorded separately from sanctions', await aml.recordCheck(db,user,view,input('countries')))
  view = await aml.dossierOfOrder(db,'aml-live-order')
  check('an ordinary administrator cannot approve the AML dossier', !await decision({id:'aml-other-admin',team:'admin'}))
  let forged=false
  try { await db.prepare(`INSERT INTO aml_decisions (dossier_id,decided_at,decided_by,decision,level,note,enhanced_source,nonce,checks,facts_hash,policy_version)
    VALUES (?,? ,?,'approved','low','TEST ONLY forged unchecked decision',NULL,?,'{}',?,?)`).bind(view.dossier.id,ts,user.id,crypto.randomUUID(),view.dossier.facts_hash,view.dossier.policy_version).run() } catch { forged=true }
  check('SQL refuses a forged approval with no current check identities',forged)
  check('only the designated person confirms complete source-bound verification',await decision(user))
  view = await aml.dossierOfOrder(db,'aml-live-order')
  check('complete verification now opens the AML part of admission',view.ready && await aml.admissionForOrder(db,await order()) !== null)
  check('a later PEP result is recorded without replacing the old evidence',await aml.recordCheck(db,user,view,input('pep',{result:'high'})))
  view = await aml.dossierOfOrder(db,'aml-live-order')
  check('a later PEP finding invalidates the old approval immediately',!view.ready && await aml.admissionForOrder(db,await order()) === null)
  check('the verified PEP cannot be downgraded to low risk',!await decision(user,'low'))
  check('high risk without documented enhanced care stays blocked',!await decision(user,'high'))
  check('high risk with consent still requires original account and first-payment proof',!await decision(user,'high','TEST ONLY complete additional wealth and funds evidence'))
  bank=await seedAmlBank(db,files,view,user)
  check('high risk requires an explicit officer decision and enhanced evidence',await decision(user,'high','TEST ONLY wealth, funds, additional sources and measures'))
  view = await aml.dossierOfOrder(db,'aml-live-order')
  const release={ FILES:files,CONTRACT_RELEASE:JSON.stringify({catalogueHash:await contractCatalogueHash(),legalReview:'TEST ONLY lawyer',insuranceReview:'TEST ONLY insurer',validUntil:ts+86400}) }
  await db.prepare(`INSERT INTO order_reviews (order_id,reviewed_at,reviewed_by,decision,offer_hash,plan,evidence,accountant_id,expires_at)
    VALUES ('aml-live-order',?,?,'standard',?,'rast','TEST ONLY supported scope','aml-expert',?)`).bind(ts,user.id,await orderOfferHash(await order()),ts+86400).run()
  await files.put(view.dossier.file_key,new TextEncoder().encode('TEST ONLY TAMPERED'))
  check('a missing or altered original blocks the contract even with complete database records',!(await contractGate(db,release,await order())).ready)
  await files.put(view.dossier.file_key,bytes)
  const gate=await contractGate(db,release,await order())
  check('scope, released terms and complete AML evidence are all required',gate.ready && gate.approval?.aml?.level==='high')
  const acceptance=await acceptStatements(db,await order(),{plan:'rast',signedBy:'AML Test Owner',signedRole:'Konateľ',startOn:'2027-01-01',ipHash:'0'.repeat(64),approval:gate.approval},{companyId:'aml-accepted',userId:'aml-owner',existingUser:false,inbox:'aml-accepted-inbox'})
  await aml.recordCheck(db,user,view,input('un-sanctions',{result:'match'}))
  await db.batch(acceptance.statements)
  check('a sanction finding between preview and commit blocks every acceptance write',!(await db.prepare("SELECT id FROM companies WHERE id='aml-accepted'").first()) && !(await db.prepare("SELECT id FROM users WHERE id='aml-owner'").first()))
  view=await aml.dossierOfOrder(db,'aml-live-order')
  await aml.recordCheck(db,user,view,input('un-sanctions'))
  view=await aml.dossierOfOrder(db,'aml-live-order')
  await decision(user,'high','TEST ONLY renewed evidence of wealth, funds and measures')
  const current=await contractGate(db,release,await order())
  const accepted=await acceptStatements(db,await order(),{plan:'rast',signedBy:'AML Test Owner',signedRole:'Konateľ',startOn:'2027-01-01',ipHash:'0'.repeat(64),approval:current.approval},{companyId:'aml-accepted',userId:'aml-owner',existingUser:false,inbox:'aml-accepted-inbox'})
  await db.batch(accepted.statements)
  const declaration=await db.prepare("SELECT * FROM declarations WHERE company_id='aml-accepted'").first()
  check('acceptance preserves the pre-contract declaration, checker and original dossier',Boolean(declaration?.checked_at) && JSON.parse(declaration.data).version===2 && (await db.prepare("SELECT aml_dossier_id FROM companies WHERE id='aml-accepted'").first()).aml_dossier_id===view.dossier.id)
  check('calendar review dates clamp correctly at month end and leap years',amlModel.reviewDueOn('2026-08-31','high')==='2027-02-28' && amlModel.reviewDueOn('2024-02-29','low')==='2025-02-28')
  // Appending a new version must never fall back to a previously approved dossier.
  await db.prepare(`INSERT INTO orders(id,token,created_at,expires_at,ico,company,address,directors,plan,person,email,legal_form) VALUES('aml-versioned','TEST versions',?,?,'90112233','TEST Versions s. r. o.','TEST 12, Košice',?,'rast','AML Test Owner','versions@aml.test','sro')`).bind(ts,ts+86400,JSON.stringify([{name:'AML Test Owner',role:'Konateľ'}])).run()
  const approvedVersion=await seedAmlDossier(db,files,'aml-versioned',user)
  const versionOrder=orderOf(await db.prepare("SELECT * FROM orders WHERE id='aml-versioned'").first())
  const nextVersion=await aml.prepareDossier(db,files,{order:versionOrder},testDeclaration({activity:'TEST changed activity'}),file,null)
  await nextVersion.statement.run()
  check('a new unchecked version immediately invalidates the older admission',await aml.admissionForOrder(db,versionOrder)===null)
  check('a stale dossier cannot receive a current check',!await aml.recordCheck(db,user,approvedVersion,{kind:'pep',result:'clear',source:'TEST ONLY old source',subject:'',qualified:false,hash:approvedVersion.dossier.facts_hash}))
  check('a stale dossier cannot receive a new approval',!await aml.decideDossier(db,user,approvedVersion,{level:'low',decision:'approved',note:'TEST ONLY stale reapproval',enhanced:'',hash:approvedVersion.dossier.facts_hash}))
  const acceptedCompany=await db.prepare("SELECT * FROM companies WHERE id='aml-accepted'").first()
  const originalOfficer=user.id
  await db.prepare('INSERT INTO aml_officers(user_id,appointed_at,appointed_by,reason) VALUES(?,unixepoch(),?,?)').bind('aml-other-admin',user.id,'TEST ONLY documented programme succession').run()
  check('a successor is the only current officer and an old appointment is not a fallback',await aml.isOfficer(db,{id:'aml-other-admin',team:'admin'}) && !await aml.isOfficer(db,user))
  check('an authorized historical review remains valid after officer succession',Boolean(await db.prepare(`SELECT 1 FROM companies c WHERE c.id='aml-accepted' AND ${amlModel.companyVerifiedSql('c')}`).first()))
  await db.prepare("UPDATE users SET team=NULL WHERE id='aml-other-admin'").run()
  check('revoking the current officer does not revive an older appointment',!await aml.isOfficer(db,user) && await aml.officer(db)===null)
  let noOfficerDenied = false
  try { await db.prepare('INSERT INTO aml_officers(user_id,appointed_at,appointed_by,reason) VALUES(?,unixepoch(),?,?)').bind(originalOfficer,originalOfficer,'TEST ONLY unauthorized appointment with no current officer').run() } catch { noOfficerDenied = true }
  check('a missing current officer cannot authorize self-appointment through SQL NULL',noOfficerDenied)
  await db.prepare("UPDATE users SET team='admin' WHERE id='aml-other-admin'").run()
  await db.prepare('INSERT INTO aml_officers(user_id,appointed_at,appointed_by,reason) VALUES(?,unixepoch(),?,?)').bind(originalOfficer,'aml-other-admin','TEST ONLY restoring the verified programme owner').run()
  const skDay=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Bratislava'})
  const reviewed=await db.prepare("SELECT a.decided_at FROM aml_decisions a JOIN companies c ON c.aml_dossier_id=a.dossier_id WHERE c.id='aml-accepted' AND a.decision='approved' ORDER BY a.id DESC LIMIT 1").first()
  const reviewedDay=skDay.format(new Date(reviewed.decided_at*1000))
  const dues=await teamDeadlines(db,user,false,skDay.format(new Date()),{company:'aml-accepted'})
  check('an accepted high-risk client has a six-month review deadline from its actual Bratislava review day',dues.dues.some((d)=>d.kind==='aml' && d.day===amlModel.reviewDueOn(reviewedDay,'high')))
  await db.prepare("INSERT INTO documents(id,company_id,created_at,source,file_key,file_name,status,kind,category,total_cents,vat_cents,currency,booked_at,booked_by) VALUES('aml-auto-doc','aml-accepted',?,'upload','TEST-auto','TEST.pdf','read','receipt','services',1200,0,'EUR',?,'auto')").bind(ts,ts).run()
  const source=(await db.prepare(`SELECT ${amlAutoReview.autoSnapshotSql('d')} AS source FROM documents d WHERE d.id='aml-auto-doc'`).first()).source
  const token=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(source)).then((b)=>Buffer.from(b).toString('hex'))
  check('an unrelated administrator cannot fake another reviewer through missing source data',!await amlAutoReview.recordAutoReview(db,'aml-accepted','aml-auto-doc',user.id,'0'.repeat(64),'TEST ONLY attempted wrong version'))
  check('a professional review records the exact current automatic booking',await amlAutoReview.recordAutoReview(db,'aml-accepted','aml-auto-doc',user.id,token,'TEST ONLY original, related payment and client profile reviewed'))
  check('the same reviewed source is not counted twice',!await amlAutoReview.recordAutoReview(db,'aml-accepted','aml-auto-doc',user.id,token,'TEST ONLY repeat review'))
  await db.prepare("UPDATE documents SET total_cents=1300 WHERE id='aml-auto-doc'").run()
  check('changing the underlying source invalidates the old professional review',!(await db.prepare(`SELECT 1 FROM documents d WHERE d.id='aml-auto-doc' AND ${amlAutoReview.autoReviewedSql('d')}`).first()))
  // A refused prospect has the same complete five-calendar-year minimum, with separate FSJ and NOO holds.
  await db.prepare(`INSERT INTO orders(id,token,created_at,expires_at,ico,company,address,directors,plan,person,email,legal_form)
    VALUES('aml-retention','TEST retention',?,?,'90556677','TEST refused company','TEST 12, Košice',?,'rast','AML Test Owner','refused@aml.test','sro')`).bind(ts,ts+86400,JSON.stringify([{name:'AML Test Owner',role:'Konateľ'}])).run()
  const prospect=await seedAmlDossier(db,files,'aml-retention',user)
  await db.prepare("UPDATE orders SET status='expired',expires_at=1,aml_ended_at=unixepoch('2020-02-29T12:00:00Z') WHERE id='aml-retention'").run()
  await forgetProspects({DB:db,FILES:files},'2025-02-28')
  check('the fifth anniversary still retains every original of a refused prospect',Boolean(await files.head(prospect.dossier.file_key)) && Boolean(await db.prepare("SELECT id FROM aml_dossiers WHERE id=?").bind(prospect.dossier.id).first()))
  await db.prepare("INSERT INTO aml_prospect_reports(id,order_id,created_at,created_by,body) VALUES('aml-retention-report','aml-retention',?,?, 'TEST ONLY unresolved internal finding')").bind(ts,user.id).run()
  await forgetProspects({DB:db,FILES:files},'2026-10-21')
  check('an unresolved internal finding protects a refused prospect after five years',(await db.prepare("SELECT aml_purge_started_at FROM orders WHERE id='aml-retention'").first()).aml_purge_started_at===null)
  await db.prepare("UPDATE aml_prospect_reports SET decided_at=?,decided_by=?,decision='not',decision_note='TEST ONLY independently resolved' WHERE id='aml-retention-report'").bind(ts,user.id).run()
  const holdKey='onboarding/aml-retention/holds/TEST_ONLY.pdf'
  await files.put(holdKey,bytes)
  await db.prepare("INSERT INTO aml_prospect_holds(id,order_id,created_at,created_by,until_on,file_key,file_sha256,file_bytes,reference) VALUES('aml-retention-hold','aml-retention',?,?,'2027-02-28',?,?,?,'TEST ONLY written FSJ request')").bind(ts,user.id,holdKey,file.sha256,bytes.length).run()
  await forgetProspects({DB:db,FILES:files},'2026-10-21')
  check('a written FSJ extension protects the full refused-prospect dossier',(await db.prepare("SELECT aml_purge_started_at FROM orders WHERE id='aml-retention'").first()).aml_purge_started_at===null && Boolean(await files.head(holdKey)))
  await forgetProspects({DB:db,FILES:files},'2028-03-01')
  check('lawful prospect erasure still waits for the intervention window',(await db.prepare("SELECT aml_delete_started_at FROM orders WHERE id='aml-retention'").first()).aml_delete_started_at===null && Boolean(await files.head(prospect.dossier.file_key)))
  await db.prepare("UPDATE orders SET aml_purge_started_at=? WHERE id='aml-retention'").bind(ts-86401).run()
  await forgetProspects({DB:db,FILES:files},'2028-03-01')
  check('lawful erasure removes the refused prospect dossier and both kinds of original',!(await db.prepare("SELECT id FROM orders WHERE id='aml-retention'").first()) && !(await files.head(prospect.dossier.file_key)) && !(await files.head(holdKey)))
  check('the foreign keys of the admitted company remain valid',(await db.prepare('PRAGMA foreign_key_check').all()).results.length===0)
}
