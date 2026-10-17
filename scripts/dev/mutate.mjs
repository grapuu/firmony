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
  // Stage 3 of closing the loop (17 October 2026): Firmony's own invoices to its clients.
  ['src/team/billing.ts', '    if (cents > 0 && !f.billed.has(key)) lines.push(', '    if (cents > 0) lines.push(', 'what was billed is billed no more'],
  ['src/team/billing.ts', '    const until = last && last < f.month ? last : f.month', '    const until = f.month', 'nothing of the plan after the last month'],
  ['src/team/billing.ts', '  const usedUntil = last && last < addMonths(f.month, -1) ? last : addMonths(f.month, -1)', '  const usedUntil = last && last < f.month ? last : f.month', 'the month that runs is not counted before it ends'],
  ['src/team/billing.ts', '  if (docs <= own.docs) return { plan: own, agree: false }', '  if (docs < own.docs) return { plan: own, agree: false }', 'as many documents as the plan is for cost nothing more'],
  ['src/team/billing.ts', "    if (String(year) >= first.slice(0, 4)) line(", '    line(', 'a closing only for a year we kept'],
  ['src/team/billing-store.ts', " AND d.source <> 'firmony'", '', 'our own invoice is no document of the client'],
  ['src/team/billing-store.ts', ' AND d.duplicate_of IS NULL', '', 'a duplicate counts once'],
  ['src/team/billing-store.ts', "    if (r.status === 'submitted' || r.status === 'accepted') closings.set(", '    if (true) closings.set(', 'a closing is billed once filed'],
  ['src/db.ts', '      PRIMARY KEY (client_id, key)\n', '      created INTEGER\n', 'a key cannot be billed twice'],
  ['src/team/routes.tsx', ' AND (reminded_at IS NULL OR reminded_at <= ?4)', '', 'a reminder once a week'],
  ['src/team/routes.tsx', '    paperTariffStatement(db, companyId, who.user.id),\n', '', 'a paper contract keeps its prices'],
  ['src/app/deadlines.ts', "    out.push({ day: bill.dueOn, label: t.bills.deadline(bill.number)", "    void ({ day: bill.dueOn, label: t.bills.deadline(bill.number)", 'an unpaid invoice is among the client deadlines'],
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
