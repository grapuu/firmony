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
  // Stages 5 and 6 of closing the loop (17 October 2026): texts that are true, and what running it needs.
  ['src/app/purge.ts', '    if (ended?.ends_on && ended.ends_on < unconfirmedFloor(today)) revision = await dataRevision(db, companyId)\n', '', 'an unconfirmed archive is deleted a year after the end'],
  ['src/app/purge.ts', ' && ended.ends_on < unconfirmedFloor(today))', ')', 'an unconfirmed archive is kept within the year'],
  ['src/team/store.ts', ' && !owed && pressing === 0', ' && !owed', 'a client with something pressing is not done'],
  ['src/team/store.ts', 'attempts >= ? AND created_at > ?', 'attempts > ? AND created_at > ?', 'email that every attempt failed is flagged'],
  ['src/team/routes.tsx', "    isAdmin(who.user) ? failedMail(c.env.DB) : Promise.resolve(null),", '    failedMail(c.env.DB),', 'only the administrator is told of failed email'],
  ['src/app/routes.tsx', "  if (await db.prepare('SELECT 1 AS x FROM users WHERE team IS NOT NULL LIMIT 1').first()) return c.notFound()\n", '', 'the first administrator page is gone once the team exists'],
  ['src/contracts.ts', "  if (release.catalogueHash !== hash) return { state: 'other' }\n", '', 'an approval of other terms is said to be one'],
  ['src/contracts.ts', '  const midnight = [1, 2, 0]', '  const midnight = [0]', 'a prepared approval lasts through its last day in Bratislava'],
  ['src/team/routes.tsx', '    else if (day <= dayOf(now())) form.errors.until = t.release.errors.past\n', '', 'no approval is prepared for a day gone'],
  ['src/team/routes.tsx', "teamRoutes.get('/ziadosti/schvalenie', async (c) => {\n  if (!isAdmin(c.get('who').user)) return missingPage(c)\n", "teamRoutes.get('/ziadosti/schvalenie', async (c) => {\n", 'only an administrator prepares the approval'],
  ['src/team/routes.tsx', '    if (!reference(form.legal)) form.errors.legal = t.release.errors.reference\n', '', 'an approval needs the lawyer\'s reference'],
  ['src/payroll-reporting/model.ts', "  sp: 'Mesačný výkaz pre Sociálnu poisťovňu',", "  sp: 'Mesačný výkaz \u2014 Sociálna poisťovňa',", 'no long dash in any text'],
]

const root = new URL('../..', import.meta.url).pathname
const copy = mkdtempSync(join(tmpdir(), 'firmony-mutate-'))
cpSync(root, copy, { recursive: true, filter: (path) => !/\/(\.git|\.wrangler|node_modules)(\/|$)/.test(path.slice(root.length - 1)) })
symlinkSync(join(root, 'node_modules'), join(copy, 'node_modules'))
const run = (command) => {
  try {
    return { ok: true, out: execSync(command, { cwd: copy, stdio: 'pipe', timeout: 900_000, env: { ...process.env } }).toString() }
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
  const units = process.env.RUNTIME_ONLY ? { ok: true, out: '' } : run('npm test')
  const runtime = units.ok ? run('npm run test:runtime') : { ok: false, out: '' }
  writeFileSync(path, original)
  const fails = `${units.out}\n${runtime.out}`
    .split('\n')
    .filter((line) => line.startsWith('FAIL'))
    .slice(0, 2)
  if (units.ok && runtime.ok) console.log(`NOT HELD   ${what}`)
  else {
    held++
    console.log(`held       ${what}: ${fails.join(' | ') || 'the build or the run failed'}`)
  }
}
rmSync(copy, { recursive: true, force: true })
console.log(`${held} of ${chosen.length} rules held`)
