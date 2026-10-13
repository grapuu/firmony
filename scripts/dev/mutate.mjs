// Takes the rules of the last change out one at a time, in a copy of the repository, and says which check
// fails without each. A rule that no check misses is a rule nothing holds.
//
//   node scripts/dev/mutate.mjs
//
// The list is the last change's; replace it for the next one. Each rule is a file, the text that holds it, and
// what it becomes without it. The copy is in the scratch folder of the system (never the repository itself), so
// a run that is cut off leaves nothing broken behind.
import { execSync } from 'node:child_process'
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const RULES = [
  ['src/app/inbox.ts', '  if (!m || m[2] !== domain) return null', '  if (!m) return null', "a company's address is on our domain only"],
  ['src/app/inbox.ts', "    if (kind !== 'pdf' && kind !== 'xml' && bytes.length < APP.mailImageMin) continue\n", '', 'a logo in a signature is no document'],
  ['src/app/inbox.ts', "    if (attachment.related) continue\n    const content", '    const content', 'a picture inside the text is no document'],
  ['src/app/routes.tsx', "  if (who.role !== 'owner') return companyPage(c, { invite, errors: { form: t.company.onlyOwner } }, 403)\n", '', 'only an owner invites'],
  ['src/app/routes.tsx', "  if (who.role !== 'owner') return companyPage(c, { errors: { form: t.company.onlyOwner } }, 403)\n", '', 'only an owner removes'],
  ['src/app/routes.tsx', "AND role <> 'owner' AND user_id <> ?", "AND role <> 'owner' AND (user_id <> ? OR 1)", 'an owner does not remove herself'],
  ['src/app/routes.tsx', "  if (existing && (await db.prepare('SELECT 1 AS x FROM members WHERE company_id = ? AND user_id = ?').bind(who.company.id, existing.id).first())) {", '  if (false) {', 'somebody in the company is not invited again'],
  ['src/app/routes.tsx', "  const filter = search ? 'all' : q === 'hotove'", "  const filter = q === 'hotove'", 'a search looks through every payment'],
  ['src/app/routes.tsx', '      steps={steps.payments && steps.upload && steps.email ? null : steps}', '      steps={steps}', 'the first steps go once they are done'],
  ['src/app/remind.ts', '  if (b.hour !== 9 || b.minute >= 15) return null', '  if (b.minute >= 15) return null', 'reminders go at nine'],
  ['src/app/remind.ts', 'await membersOf(db, company.id, true)', 'await membersOf(db, company.id)', 'reminders go only to who wants them'],
  ['src/app/remind.ts', "          key: `remind:${kind}:${company.id}:${person.id}:${kind === 'weekly' ? day : day.slice(0, 7)}`,", '          key: `remind:${kind}:${company.id}:${person.id}:${Math.random()}`,', 'a reminder goes once'],
  ['src/app/intake.ts', "    const existing = seen.has(hash) ? 'this-request' : await documentByHash(db, company.id, hash)", '    const existing = null', 'the same file is kept once, by email too'],
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
let held = 0
for (const [file, from, to, what] of RULES) {
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
console.log(`${held} of ${RULES.length} rules held`)
