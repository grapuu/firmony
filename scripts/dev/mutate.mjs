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
  // The end of a contract (ending.ts), and what is refused after it
  ['src/app/ending.ts', "    phase: today <= endsOn ? 'ending' :", "    phase: today < endsOn ? 'ending' :", 'a contract runs through its last day'],
  ['src/app/ending.ts', "today <= intakeUntil ? 'closing' : 'ended'", "today < intakeUntil ? 'closing' : 'ended'", 'the last month is taken through its tenth day'],
  ['src/app/ending.ts', '!company.endsOn || today <= addDays(company.endsOn, ENDING.intakeDays)', 'true', 'documents are refused ten days past the end'],
  ['src/app/routes.tsx', "  if (!serviceOpen(who.company, today()) && !(action === 'zahodit' && draftId)) return invoicesPage(c, 409)\n", '', 'no invoice is issued after the last day'],
  ['src/app/routes.tsx', "  if (!serviceOpen(who.company, today())) return c.redirect('/app/banka?chyba=koniec', 303)\n", '', 'no bank is linked after the last day'],
  ['src/app/inbox.ts', "  if (!intakeOpen(company, new Intl", "  if (false && !intakeOpen(company, new Intl", 'no email is taken past the intake'],
  ['src/views/inside.tsx', "  const intake = !ending || ending.phase !== 'ended'", '  const intake = true', 'the buttons for a document go once nothing is taken'],
  // Ending it from our side
  ['src/team/routes.tsx', "  if (!company || !isAdmin(who.user)) return missingPage(c)\n  const body = await c.req.parseBody()\n  const dayText", "  if (!company) return missingPage(c)\n  const body = await c.req.parseBody()\n  const dayText", 'only the administrator ends a contract'],
  ['src/team/routes.tsx', '  if (!day || day < today) errors.day = t.end.errors.day', '  if (!day) errors.day = t.end.errors.day', 'a day already past is refused'],
  ['src/team/routes.tsx', "  if (reason === '') errors.reason = t.end.errors.reason\n", '', 'an end needs its reason'],
  ['src/app/routes.tsx', "WHERE id = ? AND notice_at IS NOT NULL AND notice_side = 'client' AND ends_on >= ?", 'WHERE id = ? AND notice_at IS NOT NULL AND ends_on >= ?', 'the client cannot take our end back'],
  // The download
  ['src/app/export.ts', 'const csv = (rows: (string | number | null)[][]) => `\\uFEFF${', 'const csv = (rows: (string | number | null)[][]) => `${', 'the lists open in Slovak Excel'],
  ['src/app/export.ts', "         WHERE d.company_id = ? AND d.deleted_at IS NULL AND substr(", "         WHERE ? IS NOT NULL AND d.deleted_at IS NULL AND substr(", 'the archive holds the company\'s own documents'],
  ['src/app/routes.tsx', "  if (!/^\\d{4}$/.test(year) || !(await exportYears(db, who.company.id)).includes(year)) return", "  if (!/^\\d{4}$/.test(year)) return", 'a year without anything is not found'],
  ['src/zip.ts', '    const crc = crc32(data)\n', '    const crc = 0\n', 'every sum in the archive is right'],
  ['src/zip.ts', "    .replace(/[\\u0300-\\u036f]/g, '')\n", '', 'names in the archive lose their accents'],
  ['src/app/papers.ts', '  if (head.includes(0)) return null\n', '', 'a program is not handed over'],
  // The deletion
  ['src/app/purge.ts', '.bind(purgeFloor(today), ENDING.perRun)', '.bind(today, ENDING.perRun)', 'data are deleted only ninety days after the end'],
  ['src/app/purge.ts', `db.prepare("DELETE FROM company_files WHERE company_id = ? AND kind <> 'poa'").bind(companyId),`, `db.prepare("DELETE FROM company_files WHERE company_id = ?").bind(companyId),`, 'the power of attorney stays'],
  ['src/app/purge.ts', "`companies/${companyId}/papers/`, new Set(kept.results.map((r) => r.r2_key))", "`companies/${companyId}/papers/`", 'the file of the power of attorney stays'],
  ['src/app/purge.ts', "WHERE u.team IS NULL AND NOT EXISTS (SELECT 1 FROM members m WHERE m.user_id = u.id)'", "WHERE u.team IS NULL'", 'a person in another company keeps her account'],
  ['src/team/store.ts', '.bind(id, ended && isAdmin(user) ? 1 : 0)', '.bind(id, ended ? 1 : 0)', 'only the administrator opens an ended company'],
  ['src/team/store.ts', 'WHERE c.id = ? AND (c.closed_at IS NULL OR (? = 1 AND c.purged_at IS NOT NULL))', 'WHERE c.id = ? AND (1 = 1 OR (? = 1 AND c.purged_at IS NOT NULL))', 'the page of work of an ended company is gone'],
  ['src/app/purge.ts', "      db.prepare('DELETE FROM declarations WHERE company_id = ?').bind(id),\n", '', 'five years past the end the identification goes'],
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
