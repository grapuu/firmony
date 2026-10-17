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
  // Stage 4 of closing the loop (17 October 2026): one desk for the accountant, one truth for the client.
  ['src/team/deadlines.ts', " && due.deliveryStatus !== 'submitted' })", ' })', 'sent and waiting for its receipt is never late'],
  ['src/team/deadlines.ts', "  return dues.filter((d) => DUE_SIDE[d.kind] === 'ours' && d.state !== 'done' && d.state !== 'running' && (d.late || d.day <= week))", "  return dues.filter((d) => d.state !== 'done' && (d.late || d.day <= week))", 'only ours presses, and not what still runs'],
  ['src/app/store.ts', " AND p.booked_on >= ${booksFromSql('p.company_id')}`", '`', 'a payment before the books asks for no document'],
  ['src/app/store.ts', " : String(row.booked_on) < String(row.books_from ?? '') ? 'before'", ' : false ? \'before\'', 'a payment before the books says why on its page'],
  ['src/app/statements.ts', "          AND ?2 >= ${booksFromSql('?1')}`", "          AND ?2 = ?2`", 'no statement is due of a month before the books'],
  ['src/app/deadlines.ts', '    if (ours(month)) months.add(month)', '    months.add(month)', 'no documents of a month before the contract'],
  ['src/app/deadlines.ts', '  const shown = dues.filter((d) => d.state !== \'done\' || d.day >= day)', '  const shown = dues', 'what was done leaves once its day has passed'],
  ['src/app/deadlines.ts', '  if (!closing && closingIsOurs(company, year))', '  if (!closing)', 'no closing of a year that is not ours'],
  ['src/views/team.tsx', ' && owed === null && !due', ' && owed === null', 'a client with something pressing is not done'],
  ['src/views/vat.tsx', '      {filed ? (\n        // The files are the ones saved', '      {true ? (\n        // The files are the ones saved', 'no VAT file before the podklady are saved'],
  ['src/views/vat.tsx', "      {sv.state === 'filed' ? (", "      {sv.state === 'filed' || sv.plan ? (", 'no summary file before its podklady are saved'],
  ['src/team/routes.tsx', '  if (!snapshot) {\n    if (view.running)', '  if (false) {\n    if (view.running)', 'no closing file before its podklady are saved'],
  ['src/team/routes.tsx', "  if (body.zrusit !== '1') return c.text('Bad request', 400)\n", '', 'no new manual payroll mark'],
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
