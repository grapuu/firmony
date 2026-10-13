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
  ['src/app/routes.tsx', "  if (site && site !== 'same-origin' && site !== 'none') return c.redirect('/app/banka', 303)\n", '', 'another site cannot send a client off to the bank'],
  ['src/app/bank.ts', "  if (tx.status && tx.status !== 'BOOK') return null\n", '', 'only what is booked is a payment'],
  ['src/app/store.ts', '      if (twin >= 0) {', '      if (false) {', 'a payment a statement brought is not brought twice by the bank'],
  ['src/app/store.ts', '        others.splice(twin, 1)\n', '', 'one payment of a statement stands for one of the bank'],
  ['src/app/store.ts', '    if (!mine.has(entry.ref)) {', '    if (true) {', 'a payment already read takes no other payment\'s place'],
  ['src/app/bank.ts', "(tried_at IS NULL OR tried_at < ?)", '(1 OR ?)', 'the bank is read every six hours, never more often'],
  ['src/app/bank.ts', '    const ended = err instanceof BankError && (status === 401 || (code !== null && ENDED.has(code)))', '    const ended = false', 'a consent the bank says is over is marked so'],
  ['src/app/bank.ts', 'l.validUntil - at < BANK.renewDays * 86400', 'l.validUntil - at < 0', 'a consent that ends soon is said on the overview'],
  ['src/app/remind.ts', '          key: `bank-renew:${link.id}:${owner.id}`,', '          key: `bank-renew:${link.id}:${owner.id}:${Math.random()}`,', 'the renewal is asked for once'],
  ['src/app/bank.ts', "  if (link.session_id && bankReady(env)) await call(env, 'DELETE', `/sessions/${encodeURIComponent(link.session_id)}`).catch(() => null)\n", '', 'an unlinked consent is closed at the bank'],
  ['src/app/match.ts', '    if (theOne && (byDocument', '    if (false && theOne && (byDocument', 'the number of an invoice decides which of two of the same amount is paid'],
  ['src/app/bank.ts', '  if (present) {', '  if (false) {', 'the bank is told a person is at the screen'],
  ['src/app/bank.ts', '    if (!iban || !/^[A-Z]{2}\\d{2}[A-Z0-9]{10,30}$/.test(iban) || typeof account.uid !== \'string\') continue', "    if (typeof account.uid !== 'string') continue", 'an account without an IBAN (a card) is not the company\'s account'],
  ['src/app/bank.ts', 'tried_at = CASE WHEN synced_at IS NULL THEN ? ELSE tried_at END WHERE id = ?`)', 'tried_at = CASE WHEN 0 THEN ? ELSE tried_at END WHERE id = ?`)', 'a first read that failed is tried again soon'],
  ['src/views/team.tsx', '          {p.bankLine ? <span>{p.bankLine}</span> : null}\n', '', 'the accountant sees the client\'s bank'],
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
