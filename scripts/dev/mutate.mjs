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
  // Stage 7 of closing the loop (17 October 2026): what the check of the whole circle found.
  ['src/team/registrations.ts', "      add({ key: `${e.id}:in:social`, agency: 'social', move: 'in', name: e.name, insurer: null, day: addDays(e.startedOn, -1) })", "      add({ key: `${e.id}:in:social`, agency: 'social', move: 'in', name: e.name, insurer: null, day: e.startedOn })", 'an employee is registered the day before the start'],
  ['src/team/registrations.ts', '    if (isWorkingDay(d)) left--', '    left--', 'the insurer is told within eight working days'],
  ['src/team/registrations.ts', '  const ours = (day: string) => day >= from && (!until || day <= until)', '  const ours = (day: string) => !until || day <= until', 'what was before the contract is the former accountant\'s'],
  ['src/team/routes.tsx', '  if (!due || due.done !== back) return', '  if (!due) return', 'a registration recorded twice is one record'],
  ['src/team/deadlines.ts', "    add({ kind: 'registration', period: null, day: r.day, state: r.done ? 'done' : 'open', registration: r })", "    add({ kind: 'registration', period: null, day: r.day, state: 'open', registration: r })", 'a recorded registration is done'],
  ['src/team/store.ts', "  return `(CASE WHEN EXISTS (SELECT 1 FROM events ev WHERE ev.company_id = ${company}.id AND ev.action = '${POA_RESIGNED}')", "  return `(CASE WHEN 1", 'files alone do not finish the handover'],
  ['src/app/papers.ts', "AND kind = 'poa' AND deleted_at IS NULL AND checked_at IS NULL\").bind(ts, user, nonce, id, company)", "AND kind = 'poa' AND deleted_at IS NULL\").bind(ts, user, nonce, id, company)", 'a checked power of attorney is never returned'],
  ['src/team/routes.tsx', '  if (reason.length < 5) return', '  if (reason.length < 0) return', 'a power of attorney is returned with a reason'],
  ['src/team/deadlines.ts', "    if (filed.advances.kind === 'quarterly' && Number(month.slice(5, 7)) % 3 !== 0) continue\n", '', 'quarterly advances fall at the end of a quarter'],
  ['src/team/deadlines.ts', '    const day = workingDayFrom(periodRange(month).to)', '    const day = periodRange(month).to', 'an advance due on a weekend moves to the working day'],
  ['src/team/deadlines.ts', '  const from = nextMonth(closingDue(filed.year, filed.extendedTo).slice(0, 7))', '  const from = closingDue(filed.year, filed.extendedTo).slice(0, 7)', 'advances start the month after the filing deadline'],
  ['src/order.ts', "         AND NOT EXISTS (SELECT 1 FROM companies c WHERE c.ico = orders.ico AND c.closed_at IS NULL AND c.demo = 0 AND c.operator = 0)`", '`', 'no order is renewed for a client'],
  ['src/order.ts', "      `UPDATE orders SET expires_at = ?2 + ?3, token = ?4 WHERE", "      `UPDATE orders SET expires_at = ?2 + ?3 WHERE ?4 = ?4 AND", 'a renewed order has a new token'],
  ['src/app/fio.ts', " : read.status === 'failed' && read.why !== '409 soon' ? { status: 'down' }", '', 'Fio not answering is said as that'],
  ['src/views/team.tsx', '              {m.keys === 0 ? <span class="pill pill--amber">{t.people.noKey}</span> : null}\n', '', 'a member without a passkey is marked'],
  ['src/team/deadlines.ts', "      if (closed && day >= today) add({ kind: 'payrollPay', period: month, day, state: 'open' })", "      if (closed) add({ kind: 'payrollPay', period: month, day, state: 'open' })", 'wages to pay are listed until their payday'],
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
