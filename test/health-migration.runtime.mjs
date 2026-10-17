import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { check } from './check.mjs'
import { PAYROLL_REVIEW_SCHEMA, PAYROLL_HEALTH_SCHEMA, payrollReporting as p, healthReporting as h, companyOf, payslip } from '../.wrangler/dist/stores.js'

export async function checkHealthMigration({db:current,nowS,day}) {
  const dist=new URL('../.wrangler/dist',import.meta.url).pathname
  const mf=new Miniflare(convertV4MiniflareOptions({cf:false,workers:[{name:'health-upgrade',modulesRoot:dist,modules:[{type:'ESModule',path:`${dist}/index.js`}],compatibilityDate:'2026-10-01',d1Databases:{DB:'health-upgrade'},r2Buckets:{FILES:'health-upgrade'},outboundService:()=>new Response('offline',{status:599})}]}))
  try {
    const db=await mf.getD1Database('DB'),files=await mf.getR2Bucket('FILES')
    const schema=(await current.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE sql IS NOT NULL AND type IN ('table','index','trigger') ORDER BY type,name").all()).results.filter((r)=>!/^(?:sqlite_|_cf_)/.test(r.name)&&!['payroll_health_ids','payroll_health_generations'].includes(r.tbl_name))
    const replaced=['payroll_targets_update','payroll_packages_create','payroll_pending_handover']
    const statements=schema.map((r)=>r.type==='trigger'&&replaced.includes(r.name)?PAYROLL_REVIEW_SCHEMA.find((s)=>s.startsWith(`CREATE TRIGGER ${r.name} `)):r.sql)
    await db.batch(schema.flatMap((r,i)=>r.type==='table'?[db.prepare(statements[i])]:[]));await db.batch(schema.flatMap((r,i)=>r.type!=='table'?[db.prepare(statements[i])]:[]))
    const today=day(0),m=new Date(`${today.slice(0,7)}-15T12:00:00Z`);m.setUTCMonth(m.getUTCMonth()-1);const period=m.toISOString().slice(0,7),company='health-legacy20',user={id:'health-migration-admin',name:'TEST migration admin',email:'health-migration@firmony.test',team:'admin'}
    await db.batch([
      db.prepare("INSERT INTO users(id,created_at,name,email,team) VALUES(?,?,'TEST migration admin','health-migration@firmony.test','admin')").bind(user.id,nowS),
      db.prepare("INSERT INTO companies(id,created_at,name,ico,dic,plan,inbox,accountant_id,start_on) VALUES(?,?,'TEST Legacy 20 s. r. o.','63339999','2126333999','rast','healthlegacy20',?,?)").bind(company,nowS,user.id,`${period}-01`),
    ])
    const co=companyOf(await db.prepare('SELECT * FROM companies WHERE id=?').bind(company).first()),slip=payslip({period,gross:100000,days:30,disabled:false,declaration:true,children:[],healthDeduction:false,healthMinimumExempt:false})
    await db.prepare('INSERT INTO payroll_runs(company_id,period,payday,lines,closed_at,closed_on,closed_by) VALUES(?,?,?,?,?,?,?)').bind(company,period,today,JSON.stringify([{employeeId:'TEST legacy20 employee',name:'TEST Employee',insurer:'25',gross:100000,days:30,slip}]),nowS,today,user.id).run()
    await p.initializeClosedRun(db,co,period,user)
    const target=await db.prepare("SELECT * FROM payroll_targets WHERE company_id=? AND kind='health25'").bind(company).first()
    const original='<TEST_ONLY externalHealthReport="schema20"/>',saved=await p.saveReport(db,files,target,user,{revision:0,variant:'TEST external 514',checked:true,reason:'',file:{name:'TEST_ONLY-health.xml',bytes:new TextEncoder().encode(original)}})
    const receipt=new TextEncoder().encode('<TEST_ONLY healthReceipt="before migration"/>')
    const accepted=await p.changeReportDelivery(db,files,await p.reportPackage(db,company,saved.id),user,{to:'accepted',revision:0,externalOn:today,reference:'TEST-LEGACY-HEALTH-20',channel:'TEST ONLY insurer',reason:'',checked:true,receipt:{name:'TEST_ONLY-receipt.xml',bytes:receipt}},today)
    check('independent schema 20 has an accepted external health file before identity tables exist',accepted.ok&&!(await db.prepare("SELECT 1 FROM sqlite_master WHERE name='payroll_health_ids'").first()))
    await db.batch(PAYROLL_HEALTH_SCHEMA.map((s)=>db.prepare(s)))
    const item=await p.reportItem(db,company,target.id),review=await h.healthPlan(db,company,target.id,today)
    check('upgrade preserves the old external acceptance without demanding invented identity facts',item.status==='accepted'&&!item.sourceChanged&&(await db.prepare('SELECT COUNT(*) AS n FROM payroll_health_ids').first()).n===0&&(await db.prepare('SELECT COUNT(*) AS n FROM payroll_health_generations').first()).n===0)
    check('legacy report and original receipt survive the health upgrade byte for byte',(await (await files.get(item.pkg.file_key)).text())===original&&(await p.reportEvents(db,company,item.pkg.id)).length===1&&Buffer.from(await (await files.get((await p.reportEvents(db,company,item.pkg.id))[0].file_key)).arrayBuffer()).equals(Buffer.from(receipt)))
    check('older closed payroll without captured insurance flags stays on the professional external path',review.issues.some((s)=>s.includes('staršej uzávierke'))&&review.totals.rows.length===0)
    check('health schema upgrade keeps valid foreign keys',(await db.prepare('PRAGMA foreign_key_check').all()).results.length===0)
  } finally {await mf.dispose()}
}
