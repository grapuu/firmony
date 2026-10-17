// Reconstruct the actual pre-upgrade schema in an independent D1, seed genuine schema-19 records, then apply step 20.
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { createHash } from 'node:crypto'
import { check } from './check.mjs'
import { PAYROLL_REPORTING_SCHEMA as oldStep, PAYROLL_REVIEW_SCHEMA as upgrade, PAYROLL_HEALTH_SCHEMA as healthUpgrade, payrollReporting as p, payrollGeneration as g, companyOf, payslip, legacyPayrollCoverage, filingQueue } from '../.wrangler/dist/stores.js'

export async function checkPayrollMigration({db: current,nowS,day}) {
  check('the entire existing schema-19 step remains byte-for-byte unchanged',createHash('sha256').update(JSON.stringify(oldStep)).digest('hex')==='1d22f406cada72ce9dda6640d74e86f870afa46ed6312657fd3d9f1846874d1e')
  check('the entire existing schema-20 step remains byte-for-byte unchanged',createHash('sha256').update(JSON.stringify(upgrade)).digest('hex')==='d78f2a456a90fe96aa901d77be9038acb5b072d5d4645c655e34bb7ed12235bc')
  const dist=new URL('../.wrangler/dist',import.meta.url).pathname
  const mf=new Miniflare(convertV4MiniflareOptions({cf:false,workers:[{name:'payroll-upgrade',modulesRoot:dist,modules:[{type:'ESModule',path:`${dist}/index.js`}],compatibilityDate:'2026-10-01',d1Databases:{DB:'payroll-upgrade'},r2Buckets:{FILES:'payroll-upgrade'},outboundService:()=>new Response('offline',{status:599})}]}))
  try {
    const db=await mf.getD1Database('DB'),files=await mf.getR2Bucket('FILES')
    const schema=(await current.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE sql IS NOT NULL AND type IN ('table','index','trigger') ORDER BY type,name").all()).results.filter((r)=>!/^(?:sqlite_|_cf_)/.test(r.name) && !['payroll_generations','payroll_target_reviews','payroll_health_ids','payroll_health_generations'].includes(r.tbl_name))
    const changed=['payroll_payouts_create','payroll_targets_create','payroll_targets_update','payroll_packages_create','payroll_pending_handover']
    const oldTrigger=(name)=>oldStep.find((sql)=>sql.startsWith(`CREATE TRIGGER ${name} `))
    const statements=schema.map((r)=>r.name==='payroll_payouts'&&r.type==='table'?oldStep.find((sql)=>sql.startsWith('CREATE TABLE payroll_payouts ')):r.type==='trigger'&&changed.includes(r.name)?oldTrigger(r.name):r.sql)
    await db.batch(schema.flatMap((r,i)=>r.type==='table'?[db.prepare(statements[i])]:[]))
    await db.batch(schema.flatMap((r,i)=>r.type!=='table'?[db.prepare(statements[i])]:[]))
    const today=day(0),cashMonth=today.slice(0,7),date=new Date(`${cashMonth}-15T12:00:00Z`);date.setUTCMonth(date.getUTCMonth()-1)
    const period=date.toISOString().slice(0,7),company='legacy-period',user={id:'legacy-admin',name:'TEST migration admin',email:'migration@firmony.test',team:'admin',reminders:false}
    await db.batch([
      db.prepare("INSERT INTO users(id,created_at,name,email,team) VALUES(?,?,'TEST migration admin','migration@firmony.test','admin')").bind(user.id,nowS),
      db.prepare("INSERT INTO companies(id,created_at,name,ico,dic,address,plan,inbox,accountant_id,start_on) VALUES(?,?,'TEST legacy period s. r. o.','63337777','2126333777','Testová 12, 040 01 Košice','rast','legacyperiod',?,?)").bind(company,nowS,user.id,`${period}-01`),
    ])
    const co=companyOf(await db.prepare('SELECT * FROM companies WHERE id=?').bind(company).first())
    const slip=payslip({period,gross:100000,days:30,declaration:true,children:[],disabled:false,healthDeduction:false,healthMinimumExempt:false})
    await db.prepare('INSERT INTO payroll_runs(company_id,period,payday,lines,closed_at,closed_on,closed_by) VALUES(?,?,?,?,?,?,?)').bind(company,period,today,JSON.stringify([{employeeId:'TEST legacy employee',name:'TEST synthetic employee',insurer:'25',gross:100000,days:30,slip}]),nowS,today,user.id).run()
    await p.initializeClosedRun(db,co,period,user)
    const closure=await p.closureOf(db,company,period)
    await db.prepare("INSERT INTO payroll_payouts(id,closure_id,company_id,revision,paid_on,reference,reason,at,by_user) VALUES('old-cash',?,?,1,?,'TEST legacy cash fact','',?,?)").bind(closure.id,company,today,nowS,user.id).run()
    const next=new Date(`${cashMonth}-15T12:00:00Z`);next.setUTCMonth(next.getUTCMonth()+2);next.setUTCDate(0)
    await db.prepare("INSERT INTO payroll_targets(id,company_id,kind,period,due_on,closure_id,created_at,updated_by) VALUES('old-tax',?,'tax',?,?,NULL,?,?)").bind(company,cashMonth,next.toISOString().slice(0,10),nowS,user.id).run()
    const source=(await db.prepare(`SELECT ${legacyPayrollCoverage('t')} AS json FROM payroll_targets t WHERE t.id='old-tax'`).first()).json
    const xml='<TEST_ONLY schema="19" cashMonthAssumed="true"/>',hash=(s)=>createHash('sha256').update(s).digest('hex'),key=`companies/${company}/filings/old-tax.xml`
    await files.put(key,xml,{httpMetadata:{contentType:'application/xml'}})
    await db.prepare("INSERT INTO payroll_packages(id,target_id,company_id,previous_id,reason,variant,name,file_key,file_type,file_bytes,sha256,source_json,source_hash,created_at,created_by,updated_at,updated_by) VALUES('old-package','old-tax',?,NULL,'','TEST legacy exact file','TEST_ONLY.xml',?,'application/xml',?,?,?,?,?,?,?,?)").bind(company,key,Buffer.byteLength(xml),hash(xml),source,hash(source),nowS,user.id,nowS,user.id).run()
    await db.prepare("UPDATE payroll_targets SET package_id='old-package',revision=revision+1,updated_by=? WHERE id='old-tax'").bind(user.id).run()
    const proof={name:'TEST_ONLY-old-proof.xml',bytes:new TextEncoder().encode('<TEST_ONLY receipt="old checked receipt"/>')}
    const accepted=await p.changeReportDelivery(db,files,await p.reportPackage(db,company,'old-package'),user,{to:'accepted',revision:0,externalOn:today,reference:'TEST-LEGACY-ACCEPTED',channel:'TEST ONLY',checked:true,reason:'',receipt:proof},today)
    check('the independent pre-upgrade database contains the old accepted exact-file workflow',accepted.ok && !(await db.prepare("PRAGMA table_info('payroll_payouts')").all()).results.some((r)=>r.name==='report_period'))
    await db.batch([...upgrade,...healthUpgrade].map((sql)=>db.prepare(sql)))
    const legacy=(await p.payoutsOf(db,company,closure.id))[0],item=await p.reportItem(db,company,'old-tax')
    check('upgrade preserves cash facts and leaves the previously assumed report period unverified',legacy.paid_on===today && legacy.report_period===null && legacy.reference==='TEST legacy cash fact' && item.status==='unverified' && item.sourceChanged && item.pkg.status==='accepted')
    check('upgrade preserves the original report and accepted receipt byte for byte',(await (await files.get(key)).text())===xml && (await p.reportEvents(db,company,'old-package')).length===1)
    check('legacy period review appears in work and cannot be retired before its allocation is checked',(await filingQueue(db,user)).some((r)=>r.id==='old-tax') && !(await g.reviewScope(db,company,'old-tax')).canRetire)
    let blocked=false;try{await db.prepare('UPDATE companies SET purge_started_at=? WHERE id=?').bind(nowS,company).run()}catch{blocked=true}
    check('an accepted legacy receipt cannot freeze unreviewed reporting data after migration',blocked)
    const verified=await p.recordPayout(db,closure,user,{paidOn:today,reportPeriod:period,reference:legacy.reference,reason:'TEST administrator reviewed actual reporting period',checked:true,revision:1},today)
    check('an explicit period review appends evidence without changing the original cash fact',verified.ok && (await p.payoutsOf(db,company,closure.id)).length===2 && (await p.payoutsOf(db,company,closure.id))[1].report_period===null && (await p.reportItems(db,company)).some((r)=>r.kind==='tax'&&r.period===period))
    const scope=await g.reviewScope(db,company,'old-tax')
    const resolution=await g.retireTarget(db,files,company,'old-tax',user,{revision:scope.revision,reason:'TEST all originally submitted tax reports and required corrections professionally resolved',reference:'TEST migration expert resolution',checked:true,file:{name:'TEST_ONLY-resolution.xml',bytes:new TextEncoder().encode('<TEST_ONLY expertResolution="complete"/>')}})
    check('a corrected legacy obligation retires only after evidence-backed expert review',resolution.ok && !(await p.reportItem(db,company,'old-tax')).active && (await g.targetReviews(db,company,'old-tax')).length===1 && (await p.reportPackage(db,company,'old-package')).status==='accepted')
    await p.recordPayout(db,closure,user,{paidOn:today,reportPeriod:cashMonth,reference:'TEST explicitly changed reviewed period',reason:'TEST explicit later expert period change',checked:true,revision:2},today)
    const reactivated=await p.reportItem(db,company,'old-tax')
    check('newly reviewed income reactivates legacy scope without resurrecting stale acceptance',reactivated.active && reactivated.status==='unverified' && reactivated.sourceChanged)
    check('the upgraded independent database keeps valid foreign-key relationships',(await db.prepare('PRAGMA foreign_key_check').all()).results.length===0)
  } finally {await mf.dispose()}
}
