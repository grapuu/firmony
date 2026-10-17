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
  // Stage 1 of closing the loop (17 October 2026): what one company's state does to the others, and to its client.
  [
    'src/app/bank.ts',
    "valid_until < ?\n         AND company_id IN (SELECT id FROM companies WHERE purge_started_at IS NULL)`",
    'valid_until < ?`',
    "a frozen company's consent does not stop the others' expiry",
  ],
  ['src/app/purge.ts', '  if (revision === null) return thaw(db, companyId)', '  if (revision === null) return { files: 0, rows: 0 }', 'a freeze whose archive is no longer confirmed is lifted'],
  ['src/db.ts', "    'DROP TRIGGER IF EXISTS bank_links_data_update',\n", '', 'a bank consent is no accounting data'],
  [
    'src/db.ts',
    'OR OLD.side IS NOT NEW.side OR OLD.body IS NOT NEW.body OR OLD.payment_id IS NOT NEW.payment_id)\n        AND EXISTS',
    'OR 1)\n        AND EXISTS',
    'reading a message works while a handover is finalized',
  ],
  ['src/app/bank.ts', '  const keep = Boolean(touched?.touched)', '  const keep = false', "an account whose payments the books hold keeps them"],
  ['src/security/routes.tsx', '    if (who.createdAt > now() - SECURITY.freshLinkSeconds) return null', '    if (false) return null', 'a fresh sign-in by link confirms a client'],
  ['src/security/routes.tsx', "    return c.redirect(`/app/potvrdit?next=${encodeURIComponent(next)}`, 303)\n  }", '  }', 'an old sign-in is asked for a link, not for a key'],
  ['src/app/routes.tsx', "  return c.redirect(signedIn?.team ? '/auth?next=%2Fucto' : (next ?? to), 303)", "  return c.redirect(signedIn?.team ? '/auth?next=%2Fucto' : to, 303)", 'the link leads back to where it was asked for'],
  ['src/views/layout.tsx', '          <a class="top__login" href="/app/prihlasenie">', '          <a class="top__login" href="/app/prihlasenie-x">', 'the site has a way in'],
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
