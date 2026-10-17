import { Miniflare,convertV4MiniflareOptions } from 'miniflare'
import { createHash } from 'node:crypto'
import { check } from './check.mjs'
import { PAYROLL_HEALTH_SCHEMA,PAYROLL_SOCIAL_SCHEMA,payrollReporting as p,healthReporting as h,socialReporting as s,companyOf,payslip } from '../.wrangler/dist/stores.js'

export async function checkSocialMigration({db:current,nowS,day}) {
  check('the entire existing schema-21 step remains byte-for-byte unchanged',createHash('sha256').update(JSON.stringify(PAYROLL_HEALTH_SCHEMA)).digest('hex')==='226d83b5103a7b28098d7fc4dae1004db2c7cc365a5c1dc76404791e34d0d8f7')
  const dist=new URL('../.wrangler/dist',import.meta.url).pathname,mf=new Miniflare(convertV4MiniflareOptions({cf:false,workers:[{name:'social-upgrade',modulesRoot:dist,modules:[{type:'ESModule',path:`${dist}/index.js`}],compatibilityDate:'2026-10-01',d1Databases:{DB:'social-upgrade'},r2Buckets:{FILES:'social-upgrade'},outboundService:()=>new Response('offline',{status:599})}]}))
  try {
    const db=await mf.getD1Database('DB'),files=await mf.getR2Bucket('FILES'),tables=['payroll_social_relations','payroll_social_inputs','payroll_social_generations'],changed=['payroll_targets_update','payroll_packages_create','payroll_pending_handover']
    const schema=(await current.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE sql IS NOT NULL AND type IN ('table','index','trigger') ORDER BY type,name").all()).results.filter((r)=>!/^(?:sqlite_|_cf_)/.test(r.name)&&!tables.includes(r.tbl_name))
    const statements=schema.map((r)=>r.type==='trigger'&&changed.includes(r.name)?PAYROLL_HEALTH_SCHEMA.find((sql)=>sql.startsWith(`CREATE TRIGGER ${r.name} `)):r.sql)
    await db.batch(schema.flatMap((r,i)=>r.type==='table'?[db.prepare(statements[i])]:[]));await db.batch(schema.flatMap((r,i)=>r.type!=='table'?[db.prepare(statements[i])]:[]))
    const today=day(0),d=new Date(`${today.slice(0,7)}-15T12:00:00Z`);d.setUTCMonth(d.getUTCMonth()-1);const period=d.toISOString().slice(0,7),days=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate(),company='social-legacy21',user={id:'social-migration-admin',name:'TEST migration admin',email:'social-migration@firmony.test',team:'admin'}
    await db.batch([
      db.prepare("INSERT INTO users(id,created_at,name,email,team) VALUES(?,?,'TEST migration admin','social-migration@firmony.test','admin')").bind(user.id,nowS),
      db.prepare("INSERT INTO companies(id,created_at,name,ico,dic,plan,inbox,accountant_id,start_on) VALUES(?,?,'TEST Legacy 21 s. r. o.','63335555','2126333555','rast','sociallegacy21',?,?)").bind(company,nowS,user.id,`${period}-01`),
      db.prepare("INSERT INTO employees(id,company_id,name,insurer,started_on,wage_cents,created_at) VALUES('legacy-sp',?,'TEST Legacy employee','25',?,100000,?)").bind(company,`${period}-01`,nowS),
    ])
    const co=companyOf(await db.prepare('SELECT * FROM companies WHERE id=?').bind(company).first()),slip=payslip({period,gross:100000,days,disabled:false,declaration:true,children:[],healthDeduction:false,healthMinimumExempt:false})
    await db.prepare('INSERT INTO payroll_runs(company_id,period,payday,lines,closed_at,closed_on,closed_by) VALUES(?,?,?,?,?,?,?)').bind(company,period,today,JSON.stringify([{employeeId:'legacy-sp',name:'TEST Legacy employee',insurer:'25',gross:100000,days,slip,health:{disabled:false,minimumExempt:false,deductionClaimed:false}}]),nowS,today,user.id).run()
    await p.initializeClosedRun(db,co,period,user)
    const targets=(await db.prepare('SELECT * FROM payroll_targets WHERE company_id=?').bind(company).all()).results,sp=targets.find((t)=>t.kind==='sp'),health=targets.find((t)=>t.kind==='health25')
    const original='<TEST_ONLY externalSocialReport="schema21"/>',saved=await p.saveReport(db,files,sp,user,{revision:0,variant:'TEST external MVPP',checked:true,reason:'',file:{name:'TEST_ONLY-sp.xml',bytes:new TextEncoder().encode(original)}})
    const accept=async(id,label)=>p.changeReportDelivery(db,files,await p.reportPackage(db,company,id),user,{to:'accepted',revision:0,externalOn:today,reference:`TEST-LEGACY-21-${label}`,channel:'TEST ONLY',reason:'',checked:true,receipt:{name:'TEST_ONLY-receipt.xml',bytes:new TextEncoder().encode(`<TEST_ONLY receipt="legacy21-${label}"/>`)}},today)
    await accept(saved.id,'sp')
    await h.recordHealthIdentity(db,company,health.id,'legacy-sp',user,{revision:0,identifier:'9010101234',reference:'TEST legacy21 verified original identity',reason:'',checked:true})
    const hp=await h.healthPlan(db,company,health.id,today),generated=await h.generateHealth(db,files,hp,user,hp.token,{name:co.name,dic:co.dic,payer:'6333555500',branch:'2500',iban:'SK3112000000198742637541',phone:'',email:'',sendOn:today,batch:'1',kind:'N',reason:'',reference:'TEST complete legacy21 health source',checked:true},today)
    await accept(generated.id,'health')
    const healthPackage=await p.reportPackage(db,company,generated.id),healthOriginal=await (await files.get(healthPackage.file_key)).text()
    check('independent schema 21 contains accepted external SP and generated health evidence before new tables exist',Boolean(saved.ok&&generated.ok)&&!(await db.prepare("SELECT 1 FROM sqlite_master WHERE name='payroll_social_relations'").first()))
    await db.batch(PAYROLL_SOCIAL_SCHEMA.map((sql)=>db.prepare(sql)))
    const oldSp=await p.reportItem(db,company,sp.id),oldHealth=await p.reportItem(db,company,health.id),plan=await s.socialPlan(db,company,sp.id,today)
    check('the 21-to-22 upgrade keeps prior external SP acceptance and generated health coverage current',oldSp.status==='accepted'&&!oldSp.sourceChanged&&oldHealth.status==='accepted'&&!oldHealth.sourceChanged)
    check('the SP upgrade preserves exact originals, receipt history and existing identity revision',(await (await files.get(oldSp.pkg.file_key)).text())===original&&(await (await files.get(healthPackage.file_key)).text())===healthOriginal&&(await p.reportEvents(db,company,saved.id)).length===1&&(await p.reportEvents(db,company,generated.id)).length===1&&plan.identities[0].revision===1)
    check('the upgrade never fabricates a legal relationship, hours or an internal SP generation',(await db.prepare('SELECT COUNT(*) AS n FROM payroll_social_relations').first()).n===0&&(await db.prepare('SELECT COUNT(*) AS n FROM payroll_social_inputs').first()).n===0&&(await db.prepare('SELECT COUNT(*) AS n FROM payroll_social_generations').first()).n===0&&plan.issues.some((v)=>v.includes('IČPV'))&&plan.issues.some((v)=>v.includes('počet hodín')))
    check('the social upgrade keeps valid foreign keys',(await db.prepare('PRAGMA foreign_key_check').all()).results.length===0)
  } finally {await mf.dispose()}
}
