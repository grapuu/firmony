// Rebuild the actual live schema 72, preserve old originals, then let the deployed worker upgrade it.
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { createHash } from 'node:crypto'
import { migrationSteps } from '../.wrangler/dist/schema.js'
import { check } from './check.mjs'

export async function checkAmlMigration() {
  // Independently calculated from main f9c2230's unchanged 72 steps, before this branch existed.
  check('all 72 live migration steps remain byte for byte unchanged',createHash('sha256').update(JSON.stringify(migrationSteps.slice(0,72))).digest('hex') === 'cdffb5bd04bcbafcae7a166850f2089318efd9c367356bb2e3bafc528f7b89df')
  const dist = new URL('../.wrangler/dist',import.meta.url).pathname
  const mf = new Miniflare(convertV4MiniflareOptions({cf:false,workers:[{name:'aml-upgrade',modulesRoot:dist,modules:[{type:'ESModule',path:`${dist}/index.js`}],compatibilityDate:'2026-10-01',d1Databases:{DB:'aml-upgrade'},r2Buckets:{FILES:'aml-upgrade'},outboundService:() => new Response('TEST ONLY offline',{status:599})}]}))
  try {
    const db = await mf.getD1Database('DB'),files = await mf.getR2Bucket('FILES')
    for (let i=0;i<72;i++) await db.batch(migrationSteps[i].map((sql) => db.prepare(sql)))
    const at = Math.floor(Date.now()/1000), data = '{"version":1,"TEST_ONLY":"legacy declaration"}'
    await db.batch([
      db.prepare("INSERT INTO meta(key,value) VALUES('schema','72')"),
      db.prepare("INSERT INTO users(id,created_at,email,name,team) VALUES('legacy-officer',?,'upgrade@firmony.test','TEST legacy officer','admin')").bind(at),
      db.prepare("INSERT INTO companies(id,created_at,name,plan,inbox) VALUES('legacy-aml',?,'TEST legacy company','start','legacy-aml')").bind(at),
      db.prepare("INSERT INTO events(at,user_id,action) VALUES(?,'legacy-officer','team.bootstrap')").bind(at),
      db.prepare("INSERT INTO declarations(id,company_id,created_at,created_by,data,checked_at,checked_by) VALUES('legacy-declaration','legacy-aml',?,'legacy-officer',?,?,'legacy-officer')").bind(at,data,at),
      db.prepare("INSERT INTO messages(id,company_id,created_at,author,side,body) VALUES('legacy-message','legacy-aml',?,'legacy-officer','team','TEST original business correspondence')").bind(at),
    ])
    const key = 'companies/legacy-aml/documents/original.pdf',original = '%PDF-1.7\nTEST ONLY original before upgrade\n%%EOF'
    await files.put(key,original)
    const worker = await mf.getWorker('aml-upgrade'),response = await worker.fetch('https://firmony.io/app')
    check('the deployed worker upgrades a real schema-72 database without an error',[200,303].includes(response.status))
    check('every new step is committed in order',(await db.prepare("SELECT value FROM meta WHERE key='schema'").first()).value === String(migrationSteps.length))
    const old = await db.prepare("SELECT data,checked_at,checked_by FROM declarations WHERE id='legacy-declaration'").first()
    check('upgrade preserves old declarations and correspondence exactly',old.data === data && old.checked_at === at && old.checked_by === 'legacy-officer' && (await db.prepare("SELECT body FROM messages WHERE id='legacy-message'").first()).body === 'TEST original business correspondence')
    check('old checked markers never manufacture qualified signature evidence',(await db.prepare('SELECT COUNT(*) AS n FROM aml_dossiers').first()).n === 0 && (await db.prepare('SELECT COUNT(*) AS n FROM aml_decisions').first()).n === 0)
    const appointed = await db.prepare('SELECT user_id,appointed_by FROM aml_officers').first()
    check('only the recorded first administrator seeds the initial AML appointment',appointed.user_id === 'legacy-officer' && appointed.appointed_by === 'legacy-officer')
    check('the original stored before upgrade remains byte for byte readable',(await (await files.get(key)).text()) === original)
    check('the upgraded live schema has no broken foreign keys',(await db.prepare('PRAGMA foreign_key_check').all()).results.length === 0)
  } finally { await mf.dispose() }
}
