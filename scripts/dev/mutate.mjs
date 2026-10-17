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
  // Stage 2 of closing the loop (17 October 2026): from a request on the site to the first document.
  ['src/team/routes.tsx', "if (!review || review.decision !== 'standard' || review.expires_at <= ts", 'if (!review || review.expires_at <= ts', 'a bespoke scope sends no link to a standard contract'],
  ['src/index.tsx', "  return Boolean(review && review.decision === 'standard' && review.expires_at <= now())", "  return Boolean(review && review.decision === 'standard' && review.expires_at <= 0)", 'a link whose review ran out offers a new one'],
  ['src/index.tsx', "      db.prepare(\"UPDATE requests SET status = 'new' WHERE id = ? AND status <> 'client'\")", "      db.prepare(\"UPDATE requests SET status = status WHERE id = ? AND status <> 'client'\")", 'asking for a new link opens the request again'],
  ['src/index.tsx', "  if (situation === 'switch') next.set('zmena', '1')\n", '', 'the thanks speak of the former accountant'],
  ['src/index.tsx', '      email: values.directorEmail || values.email,', '      email: values.email,', 'the order goes to the director'],
  ['src/team/routes.tsx', '  if (!values.offline) errors.offline = t.newClient.errors.offline\n', '', 'a client is made by hand only with a paper contract'],
  ['src/app/routes.tsx', "  if (refused) return switchPage(c, { error: answer[refused][0] }, answer[refused][1])\n", '', 'an upload of books is all or nothing'],
  ['src/app/routes.tsx', "  if (!(await switchingSentAt(db, who.company.id))) await db.batch(", '  if (true) await db.batch(', 'the letter is said to have gone out once'],
  ['src/app/routes.tsx', '(paper) => (rung ? [] : [ringStatement(', '(paper) => (false ? [] : [ringStatement(', 'the accountant is rung once for an upload'],
  ['src/views/inside-pages.tsx', '  const welcome = Boolean(props.steps) && !ended && props.paymentsCount === 0', '  const welcome = Boolean(props.steps) && !ended', 'payments lead once they come'],
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
