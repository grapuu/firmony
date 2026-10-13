// Takes the rules of the last change out one at a time, in a copy of the repository, and says which check
// fails without each. A rule that no check misses is a rule nothing holds.
//
//   node scripts/dev/mutate.mjs              every rule of the list
//   node scripts/dev/mutate.mjs number QR    only the rules whose description has one of these words
//
// The list is the last change's; replace it for the next one. Each rule is a file, the text that holds it, and
// what it becomes without it. The copy is in the scratch folder of the system (never the repository itself), so
// a run that is cut off leaves nothing broken behind.
import { execSync } from 'node:child_process'
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const RULES = [
  // The client's declaration (aml.ts, /app/vyhlasenie)
  ['src/app/aml.ts', "  if (v.truthful !== '1') errors.truthful = words.truthful\n", '', 'without the statement nothing is taken'],
  ['src/app/aml.ts', "    if (rc !== '' && !birthNumberValid(rc)) errors[`${prefix}rc`] = words.rc\n", '', 'a birth number that cannot be one is refused'],
  ['src/app/aml.ts', '  if (whole % 11n === 0n) return true\n', '  return true\n', 'a birth number has its check digit'],
  ['src/app/aml.ts', "  if (kuv && kuv !== 'self' && owners.length === 0) errors.owners = words.owners\n", '', 'other owners are asked for when the director is not the only one'],
  ['src/app/aml.ts', "  if (v.abroad === '1' && (v.abroadWhere ?? '').length < 2) errors.abroadWhere = words.abroadWhere\n", '', 'partners outside the EU are named'],
  ['src/app/aml.ts', '  const last = new Date(Date.UTC(y, m + 1, 0))', '  const last = new Date(Date.UTC(y, m, 0))', 'a notice ends on the last day of the month after it'],
  ['src/app/routes.tsx', "  if (who.role !== 'owner') return declarationPage(c, null, 403)\n", '', 'only the owner gives the declaration'],
  ['src/views/declaration.tsx', '    {!owner ? (', '    {false ? (', 'a member sees nothing of the declaration'],
  ['src/views/declaration.tsx', '(rc ? maskBirthNumber(rc) :', '(rc ? rc :', 'the owner reads the birth number cut short'],
  ['src/views/inside-pages.tsx', "    { done: steps.declaration, href: '/app/vyhlasenie', text: s.declaration, optional: false },\n", '', 'the declaration is a first step'],
  ['src/app/routes.tsx', 'steps={steps.declaration && steps.poa && steps.payments && steps.upload ? null : steps}', 'steps={steps.poa && steps.payments && steps.upload ? null : steps}', 'the first steps stay until the declaration is given'],
  ['src/app/routes.tsx', "ringStatement(db, 'declaration', made.id, company.accountantEmail ?? BRAND.email,", "ringStatement(db, 'declaration', made.id, BRAND.email,", 'the accountant who keeps the company is rung of its declaration'],
  // The team: the check, the risk, the reports
  ['src/app/aml.ts', ' AND checked_at IS NULL\n         AND id = (SELECT id FROM declarations WHERE company_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1)', ' AND checked_at IS NULL\n         AND ? IS NOT NULL', 'only the newest declaration is checked'],
  ['src/app/aml.ts', "WHERE id = ? AND company_id = ? AND checked_at IS NULL\n", "WHERE id = ? AND company_id = ?\n", 'a declaration is checked once'],
  ['src/team/routes.tsx', "typeof body.uroven === 'string' && (LEVELS as readonly string[]).includes(body.uroven)", "typeof body.uroven === 'string'", 'a level that is none is not kept'],
  ['src/team/routes.tsx', '  if (!company || !isAdmin(who.user)) return missingPage(c)\n  const report', '  if (!company) return missingPage(c)\n  const report', 'only the designated person decides'],
  ['src/app/aml.ts', " WHERE id = ? AND company_id = ? AND decided_at IS NULL')", " WHERE id = ? AND company_id = ?')", 'a report is decided once'],
  ['src/app/aml.ts', 'AND (? = 1 OR r.created_by = ?)', 'AND (? = 1 OR ? IS NOT NULL)', 'an accountant reads only her own reports'],
  ['src/team/routes.tsx', "  if (note === '') return amlPage(c, company, { error: t.aml.errors.note }, 422)\n", '', 'a decision needs its reasons'],
  ['src/team/routes.tsx', `"SELECT email FROM users WHERE team = 'admin'"`, `"SELECT email FROM users WHERE team = 'nobody'"`, 'the designated person is rung of a report'],
  // The notice
  ['src/app/routes.tsx', "  if (body.potvrdit !== '1') return companyPage(c, { errors: { notice: t.notice.must } }, 422)\n", '', 'without the tick no notice is given'],
  ['src/app/routes.tsx', "WHERE id = ? AND notice_at IS NULL').bind(now(), who.user.id, end, who.company.id)", "WHERE id = ?').bind(now(), who.user.id, end, who.company.id)", 'notice is given once'],
  ['src/app/routes.tsx', "appRoutes.post('/firma/vypoved', async (c) => {\n  const who = c.get('who')\n  if (who.role !== 'owner') return companyPage(c, { errors: { notice: t.notice.onlyOwner } }, 403)\n", "appRoutes.post('/firma/vypoved', async (c) => {\n  const who = c.get('who')\n", 'only the owner gives notice'],
  // Doorbells
  ['src/app/routes.tsx', "    ...(unread ? [] : [ringStatement(db, 'message',", "    ...(false ? [] : [ringStatement(db, 'message',", 'the team is rung once for what it has not read'],
  ['src/team/routes.tsx', '  if (unread) return []\n', '', 'the client is rung once for what she has not read'],
  ['src/app/remind.ts', "kind === 'weekly' ? day : day.slice(0, 7), person.email, ring", "`${company.id}:${kind === 'weekly' ? day : day.slice(0, 7)}`, person.email, ring", 'a reminder rings a person once, whatever her companies'],
]

const root = new URL('../..', import.meta.url).pathname
const copy = mkdtempSync(join(tmpdir(), 'firmony-mutate-'))
cpSync(root, copy, { recursive: true, filter: (path) => !/\/(\.git|\.wrangler|node_modules)(\/|$)/.test(path.slice(root.length - 1)) })
symlinkSync(join(root, 'node_modules'), join(copy, 'node_modules'))
const run = (command) => {
  try {
    return { ok: true, out: execSync(command, { cwd: copy, stdio: 'pipe', timeout: 240_000 }).toString() }
  } catch (err) {
    return { ok: false, out: `${err.stdout ?? ''}${err.stderr ?? ''}` }
  }
}
const only = process.argv.slice(2)
let held = 0
const chosen = RULES.filter(([, , , what]) => only.length === 0 || only.some((word) => what.includes(word)))
for (const [file, from, to, what] of chosen) {
  const path = join(copy, file)
  const original = readFileSync(path, 'utf8')
  if (!original.includes(from) || from === to) {
    console.log(`NOT FOUND  ${what}`)
    continue
  }
  writeFileSync(path, original.replace(from, to))
  const units = run('npm test')
  const runtime = units.ok ? run('npm run test:runtime') : { ok: false, out: '' }
  writeFileSync(path, original)
  const fails = `${units.out}\n${runtime.out}`.split('\n').filter((line) => line.startsWith('FAIL')).slice(0, 2)
  if (units.ok && runtime.ok) console.log(`NOT HELD   ${what}`)
  else {
    held++
    console.log(`held       ${what}: ${fails.join(' | ') || 'the build or the run failed'}`)
  }
}
rmSync(copy, { recursive: true, force: true })
console.log(`${held} of ${chosen.length} rules held`)
