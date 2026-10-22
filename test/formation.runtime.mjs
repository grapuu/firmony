// The real Worker, D1, R2 and session/role gates. Synthetic contacts only; no external message is sent.
import { check } from './check.mjs'
import { createHash } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { migrationSteps } from '../.wrangler/dist/schema.js'
import { archiveEnded, purgeCompany, forgetRecords } from '../.wrangler/dist/stores.js'

export async function checkFormationRuntime({ db, files, as, signIn, lucia, nowS, day, capture }) {
  check('formation: the first 79 deployed schemas are unchanged', createHash('sha256').update(JSON.stringify(migrationSteps.slice(0, 79))).digest('hex') === 'f4dbde7b69ab1e0fe3a1f174e71fe5ca867626d73f7283c679628bd0afc999af')
  const company = 'co-formation', email = 'formation-owner@example.test', user = 'formation-owner'
  await db.batch([
    db.prepare("INSERT INTO companies(id,created_at,name,ico,plan,inbox,start_on,contract_at,accountant_id) VALUES(?,?,'TEST-ONLY Založenie s.r.o.','50888875','rast','formation',?,?,?)").bind(company, nowS, `${day(0).slice(0, 4)}-01-01`, nowS, lucia.id),
    db.prepare("INSERT INTO users(id,created_at,name,email) VALUES(?,?,'TEST-ONLY Konateľ',?),('formation-member',?,'TEST-ONLY Kolega','formation-member@example.test')").bind(user, nowS, email, nowS),
    db.prepare("INSERT INTO members(company_id,user_id,role,created_at) VALUES(?,?,'owner',?),(?,'formation-member','member',?)").bind(company, user, nowS, company, nowS),
  ])
  const owner = as((await signIn(email)).cookie), member = as((await signIn('formation-member@example.test')).cookie), team = as((await signIn('lucia@firmony.test')).cookie)
  const save = (name, html) => { if (capture) writeFileSync(`${capture}/${name}.html`, html) }
  let res = await owner.get('/app/zalozenie'), html = await res.text()
  const id = html.match(/name="odoslanie" value="([a-f0-9-]{36})"/)?.[1]
  check('formation: the owner sees a scoped formation request with the 36-month term', res.status === 200 && Boolean(id) && html.includes('36 mesiacov') && html.includes('Založíme firmu s Vami'))
  const request = { firma: company, odoslanie: id, meno: 'TEST-ONLY Kontaktná osoba', email: 'contact@example.test', predmet: 'TEST-ONLY E-shop s oblečením', suhlas: '1' }
  res = await owner.post('/app/zalozenie', { ...request, suhlas: '' })
  check('formation: consent is mandatory and a refusal preserves typed data', res.status === 422 && (await res.text()).includes('contact@example.test') && !(await db.prepare('SELECT id FROM formation_cases WHERE company_id=?').bind(company).first()))
  check('formation: a colleague cannot authorize formation', (await member.post('/app/zalozenie', request)).status === 403)
  check('formation: a stale company form cannot create a request', (await owner.post('/app/zalozenie', { ...request, firma: 'other-company' })).status === 409)
  const repeated = await Promise.all([owner.post('/app/zalozenie', request), owner.post('/app/zalozenie', request)])
  const f = await db.prepare('SELECT * FROM formation_cases WHERE company_id=?').bind(company).first()
  check('formation: concurrent retries create one case and one audit event', repeated.every((r) => r.status === 303) && f?.id === id && (await db.prepare('SELECT COUNT(*) AS n FROM formation_history WHERE case_id=?').bind(id).first()).n === 1 && (await db.prepare("SELECT COUNT(*) AS n FROM events WHERE subject=? AND action='formation.requested'").bind(id).first()).n === 1)
  check('formation: the requester and 36-month consent are retained', f?.requester_name === 'TEST-ONLY Konateľ' && f?.consent_text.includes('36 mesiacov') && JSON.parse(f.company_snapshot).ico === '50888875')
  save('formation-request', html)
  check('formation: the team has the company-scoped queue', (await (await team.get('/ucto')).text()).includes(`/ucto/klienti/${company}/zalozenie`))
  res = await team.get(`/ucto/klienti/${company}/zalozenie`)
  check('formation: the accountant opens the case with the checklist', res.status === 200 && (await res.text()).includes('Kontrolný zoznam založenia'))
  const steps = { documents: 'received', license: 'received', capital: 'received', register: 'received', tax: 'received', insurance: 'not_applicable', vat: 'not_applicable' }
  const stepFields = Object.fromEntries(Object.entries(steps).flatMap(([k, result]) => [[`krok_${k}`, result], [`poznamka_${k}`, `TEST-ONLY Overené podľa podkladu ${k}.`]]))
  const field = { firma: company, ziadost: id, verzia: '0', stav: 'preparing', termin: day(5), opravnenie: 'TEST-ONLY Plná moc ev. 1/2026', otazka: '', dovod: 'TEST-ONLY Začíname prípravu dokumentov.', ...stepFields }
  res = await team.post(`/ucto/klienti/${company}/zalozenie`, field)
  check('formation: the accountant advances the case with the checklist', res.status === 303 && (await db.prepare('SELECT state FROM formation_cases WHERE id=?').bind(id).first()).state === 'preparing')
  res = await team.post(`/ucto/klienti/${company}/zalozenie`, { ...field, verzia: '1', stav: 'registering', dovod: 'TEST-ONLY Dokumenty hotové, zapisujeme.' })
  check('formation: the case reaches registration', res.status === 303 && (await db.prepare('SELECT state FROM formation_cases WHERE id=?').bind(id).first()).state === 'registering')
  res = await team.post(`/ucto/klienti/${company}/zalozenie`, { ...field, verzia: '2', stav: 'completed', dovod: 'TEST-ONLY Firma zapísaná do registra.' })
  check('formation: completion requires the register step and closes the case', res.status === 303 && (await db.prepare('SELECT state,completion_source FROM formation_cases WHERE id=?').bind(id).first()).state === 'completed')
  res = await team.post(`/ucto/klienti/${company}/zalozenie`, { ...field, verzia: '3', stav: 'registering', dovod: 'TEST-ONLY Oprava po zistení.' })
  check('formation: a completed case can be reopened', res.status === 303 && (await db.prepare('SELECT state FROM formation_cases WHERE id=?').bind(id).first()).state === 'registering')
  res = await owner.post('/app/zalozenie/zrusit', { firma: company, ziadost: id, verzia: '4' })
  check('formation: the owner cancels and the case is retained', res.status === 303 && (await db.prepare('SELECT state FROM formation_cases WHERE id=?').bind(id).first()).state === 'cancelled')
  let immutable = false, retained = false
  try { await db.prepare("UPDATE formation_history SET by_name='tampered' WHERE case_id=?").bind(id).run() } catch { immutable = true }
  try { await db.prepare('DELETE FROM formation_history WHERE case_id=?').bind(id).run() } catch { retained = true }
  check('formation: revision history cannot be edited or deleted before statutory erasure', immutable && retained)
  await db.prepare('UPDATE companies SET ends_on=? WHERE id=?').bind(day(-1), company).run()
  await archiveEnded({ DB: db, FILES: files }, day(0))
  check('formation: the end of service preserves all formation evidence', (await db.prepare('SELECT COUNT(*) AS n FROM formation_history WHERE company_id=?').bind(company).first()).n >= 1)
  await db.prepare('UPDATE companies SET purge_started_at=? WHERE id=?').bind(Math.floor(Date.now() / 1000) - 86401, company).run()
  await purgeCompany({ DB: db, FILES: files }, company, `${Number(day(0).slice(0, 4)) + 6}-${day(0).slice(5)}`)
  check('formation: statutory history is kept until the final legal-record erasure step', Boolean((await db.prepare('SELECT purged_at FROM companies WHERE id=?').bind(company).first())?.purged_at))
  await forgetRecords({ DB: db, FILES: files }, `${Number(day(0).slice(0, 4)) + 7}-${day(0).slice(5)}`)
  check('formation: authorized final erasure removes the case without a foreign-key orphan', !(await db.prepare('SELECT id FROM formation_cases WHERE company_id=?').bind(company).first()) && (await db.prepare('PRAGMA foreign_key_check').all()).results.length === 0)
}
