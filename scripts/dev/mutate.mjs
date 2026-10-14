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
  // Every client's deadlines on one screen (src/team/deadlines.ts)
  ['src/team/deadlines.ts', '        if (filed.has(p)) continue\n', '', "an older period filed is not overdue"],
  ['src/team/deadlines.ts', "      if (view.state === 'ready') add(", "      if (view.state === 'never') add(", 'a period ready is listed'],
  ['src/team/deadlines.ts', "state: 'blocked', count: blocks })", "state: 'blocked', count: 0 })", 'a blocked period says how many things keep it back'],
  ['src/team/deadlines.ts', "day: fix === 'O' ? view.deadline : supplementaryDeadline(today)", 'day: view.deadline', 'a supplementary return is due at the end of the month after'],
  ['src/team/deadlines.ts', "const sv = company.vatStatus === 'reg7a' ? quarterOf(period) : period", 'const sv = period', '§ 7a files the recapitulative statement for a quarter'],
  ['src/team/deadlines.ts', 'const done = facts.filings.has(`${MARKED_KINDS.summary}:${sv}`)', 'const done = false', 'a recapitulative statement marked is done'],
  ['src/team/deadlines.ts', "today <= periodRange(sv).to ? 'running' : 'open'", "'open'", 'a quarter that runs runs'],
  ['src/team/deadlines.ts', "    if (company.vatStatus === 'payer' && (!first || current >= first)", "    if (false && (!first || current >= first)", 'the period that runs is ahead'],
  ['src/team/deadlines.ts', '      if (payable(company, f) === 0) continue\n', '', '§ 7a does not pay 5 € or less'],
  ['src/team/deadlines.ts', "state: rest > 0 ? 'open' : 'done', cents: rest", "state: 'open', cents: rest", 'a tax paid is done'],
  ['src/team/deadlines.ts', '  if (intakeOpen(company, today)) {', '  if (true) {', 'no documents asked for once the intake closed'],
  ['src/team/deadlines.ts', "state: running ? 'running' : 'open', count: n", "state: 'open', count: n", 'the month that runs is not late'],
  ['src/team/deadlines.ts', '  if (closingIsOurs(company, year)) add(', '  if (true) add(', 'the closing only when it is ours'],
  ['src/team/deadlines.ts', '(!company.endsOn || company.endsOn > end)', 'true', 'not the closing of the year the contract ended in'],
  ['src/team/deadlines.ts', "facts.filings.has(`${MARKED_KINDS.closing}:${year}`) ? 'done' : 'open'", "'open'", 'a closing marked is done'],
  ['src/team/deadlines.ts', "state: facts.handover > 0 ? 'done' : ", 'state: ', 'the books handed over are done'],
  ['src/team/deadlines.ts', "(due.state === 'open' || due.state === 'ready' || due.state === 'blocked') && today > due.day", 'today > due.day', 'only what is not done can be late'],
  ['src/team/deadlines.ts', "d.state !== 'running' || d.day <= ahead", 'true', 'what runs is shown once it is near'],
  ['src/team/deadlines.ts', "d.state === 'done' ? d.day >= back :", "d.state === 'done' ? true :", 'what was done stays a few weeks'],
  ['src/team/deadlines.ts', '    if (first && p < first) break\n', '', 'no period before our first'],
  ['src/team/deadlines.ts', '    if (!lastOurs || p <= lastOurs) out.unshift(p)', '    out.unshift(p)', 'no period after the contract'],
  // § 7a with a document not booked, the holidays
  ['src/app/vat-store.ts', " && !result.issues.some((i) => i.code === 'unbooked')", '', '§ 7a with a document not booked is not nothing to file'],
  ['src/app/vat.ts', "  if (date === '11-17') return year < 2025", "  if (date === '11-17') return true", '17 November is a working day'],
  ['src/app/vat.ts', "  if (date === '05-08' || date === '09-15') return year !== 2026", "  if (date === '05-08' || date === '09-15') return true", '8 May and 15 September worked in 2026'],
  // The screen and the mark (src/team/routes.tsx, deadlines-store.ts, views)
  ['src/team/routes.tsx', '      ? isPeriod(period) && periodRange(period).to < today', '      ? isPeriod(period)', 'only an ended period is marked'],
  ['src/team/routes.tsx', "typeof body.spat === 'string' && BACK.test(body.spat) ? body.spat", "typeof body.spat === 'string' ? body.spat", 'the way back stays on our pages'],
  ['src/team/routes.tsx', "  const accountant = admin && (asked === 'none'", "  const accountant = (asked === 'none'", "only the administrator chooses whose clients"],
  ['src/team/deadlines-store.ts', 'ON CONFLICT (company_id, kind, period) DO NOTHING', '', 'a mark is kept once'],
  ['src/views/deadlines.tsx', "  if (p.done) q.set('hotove', '1')\n", '', 'the filters stay in the address'],
  ['src/views/team.tsx', '                {items.slice(TABS).map((item) => (', '                {[].map((item) => (', "the places beyond the tabs are in the bar's menu"],
  ['src/views/team.tsx', '          {p.deadlines ?? null}\n', '', "the client's page has its deadlines"],
  ['src/app/purge.ts', "    db.prepare('DELETE FROM filings WHERE company_id = ?').bind(companyId),\n", '', 'the filings go with the company'],
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
