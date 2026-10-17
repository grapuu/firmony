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
  // Who signs up, and what is kept of it (index.tsx)
  ['src/index.tsx', "  if (field(one('web'), 200) !== '') return c.redirect('/investori/hotovo', 303)\n", '', 'a bot that fills the hidden field is forgotten'],
  [
    'src/index.tsx',
    '  const brokers = INVESTORS.brokers.map((b) => b.id).filter((id) => picked.includes(id)) as InvestorBroker[]',
    '  const brokers = picked.map(String) as InvestorBroker[]',
    'only brokers we know are kept',
  ],
  ['src/index.tsx', '  if (!EMAIL.test(values.email)) return page(c, meta, <InvestorsPage', '  if (false) return page(c, meta, <InvestorsPage', 'what is no email is refused'],
  ['src/index.tsx', "  const at = one('forma') === 'zapis' ? 'final' : 'hero'", "  const at = 'hero'", 'a mistake is said at the form it was made in'],
  ['src/index.tsx', "  if (!(await withinLimit(db, 'investor', connection(c), LIMITS.requestsPerHour, 3600))) {", '  if (false) {', 'sign-ups from one connection are limited'],
  [
    'src/index.tsx',
    "  if (await withinLimit(db, 'confirm', values.email.toLowerCase(), LIMITS.confirmationsPerDay, 86400)) {\n    statements.push(\n      queueStatement(db, {\n        key: `investor:",
    '  if (true) {\n    statements.push(\n      queueStatement(db, {\n        key: `investor:',
    'two confirmations a day at most',
  ],
  ['src/index.tsx', "          copy.investors.mail.remove.replace(/\\u00a0/g, ' '),\n          '',\n", '', 'the confirmation says how to be forgotten'],
  ['src/index.tsx', "  const urls = ['/', '/investori', '/podmienky'", "  const urls = ['/', '/podmienky'", 'the sitemap lists the investors page'],
  // One row an address, a year from its last sign-up (db.ts)
  ['src/db.ts', 'r.email.toLowerCase(), r.brokers.length', 'r.email, r.brokers.length', 'one row an address, whatever its letters'],
  ['src/db.ts', 'brokers = COALESCE(excluded.brokers, investor_requests.brokers)', 'brokers = excluded.brokers', 'a sign-up without brokers keeps the ones before'],
  ['src/db.ts', 'DO UPDATE SET updated_at = excluded.updated_at,', 'DO UPDATE SET updated_at = investor_requests.updated_at,', 'signing up again renews the year'],
  ['src/db.ts', "    db.prepare('DELETE FROM investor_requests WHERE updated_at < ?').bind(ts - RETENTION.requestDays * 86400),\n", '', 'a sign-up is deleted after a year'],
  // Who sees them
  [
    'src/team/routes.tsx',
    'const [requests, investors] = await Promise.all([listRequests(c.env.DB), listInvestors(c.env.DB)])',
    'const [requests, investors] = await Promise.all([listRequests(c.env.DB), Promise.resolve({ total: 0, list: [] })])',
    'the administrator sees who signed up',
  ],
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
