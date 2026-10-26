// Company formation as a case of an existing client (G4) was taken out on 26 October 2026: it needed a company with a
// contract, so nobody founding a company could reach it. What stays: the deployed schema is untouched, and the pages are gone.
import { check } from './check.mjs'
import { createHash } from 'node:crypto'
import { migrationSteps } from '../.wrangler/dist/schema.js'

export async function checkFormationRuntime({ db, as, signIn, nowS }) {
  check('formation: the first 79 deployed schemas are unchanged', createHash('sha256').update(JSON.stringify(migrationSteps.slice(0, 79))).digest('hex') === 'f4dbde7b69ab1e0fe3a1f174e71fe5ca867626d73f7283c679628bd0afc999af')
  const company = 'co-formation', email = 'formation-owner@example.test', user = 'formation-owner'
  await db.batch([
    db.prepare("INSERT INTO companies(id,created_at,name,ico,plan,inbox,start_on,contract_at,accountant_id) VALUES(?,?,'TEST-ONLY Založenie s.r.o.','50888875','rast','formation',?,?,NULL)").bind(company, nowS, '2027-01-01', nowS),
    db.prepare("INSERT INTO users(id,created_at,name,email) VALUES(?,?,'TEST-ONLY Konateľ',?)").bind(user, nowS, email),
    db.prepare("INSERT INTO members(company_id,user_id,role,created_at) VALUES(?,?,'owner',?)").bind(company, user, nowS),
  ])
  const owner = as((await signIn(email)).cookie), team = as((await signIn('lucia@firmony.test')).cookie)
  check('formation: the owner finds no formation page any more', (await owner.get('/app/zalozenie')).status === 404 && (await owner.post('/app/zalozenie', { firma: company })).status === 404)
  check('formation: the team finds no formation page any more', (await team.get(`/ucto/klienti/${company}/zalozenie`)).status === 404 && !(await (await team.get('/ucto')).text()).includes('/zalozenie'))
}
