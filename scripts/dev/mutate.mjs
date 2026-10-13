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
  // The order with the contract online
  ['src/index.tsx', "    if (chosen) signedBy = chosen.name\n    else errors.director = copy.order.errors.director\n", '    signedBy = values.director\n', 'only a director the register names concludes the contract'],
  ['src/index.tsx', '  if (!values.agree) errors.agree = copy.order.errors.agree\n', '', 'without agreeing to the terms nothing is concluded'],
  ['src/index.tsx', '  if (!months.includes(values.start)) errors.start = copy.order.errors.start\n', '', 'the first month is one of those offered'],
  ['src/index.tsx', ' && !(await isClient(db, ico))) {', ') {', 'a company that is a client gets no second contract'],
  // The power of attorney and the notice
  ['src/app/papers.ts', "'Content-Disposition': `${inline ? 'inline' : 'attachment'}", "'Content-Disposition': `${'inline'}", 'a signature container is downloaded, never shown'],
  ['src/app/papers.ts', 'WHERE f.id = ? AND f.company_id = ?`,', 'WHERE f.id = ? AND (f.company_id = ? OR 1)`,', 'a paper is only its own company\'s'],
  ['src/app/papers.ts', " AND checked_at IS NULL').bind(now(), user, id, company)", "').bind(now(), user, id, company)", 'a paper is checked once'],
  ['src/app/routes.tsx', '      to: company.accountantEmail ?? BRAND.email,', '      to: BRAND.email,', 'the accountant who keeps the company is told of its power of attorney'],
  ['src/app/routes.tsx', 'steps={steps.poa && steps.payments && steps.upload ? null : steps}', 'steps={steps.payments && steps.upload ? null : steps}', 'the first steps stay until the power of attorney is there'],
  ['src/views/inside-pages.tsx', "    { done: steps.poa, href: '/app/plna-moc', text: s.poa, optional: false },\n", '', 'the power of attorney is a first step'],
  ['src/views/inside-pages.tsx', '    ...(steps.switching ? [', '    ...(true ? [', 'the notice to a former accountant is offered only to who changes accountants'],
  ['src/index.tsx', '|banka|plna-moc)$/', '|banka)$/', 'a signed power of attorney of real size can be uploaded'],
  ['src/app/routes.tsx', '  if (since === null) errors.since = t.switching.dayHint\n', '', 'a day that does not exist is said so'],
  ['src/views/team.tsx', "                    {row.poa === 'checked' ? null : <span class={`tbl__flag tbl__flag--${row.poa}`}>{t.client.poaState[row.poa]}</span>}\n", '', 'the accountant\'s list says whose power of attorney waits'],
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
