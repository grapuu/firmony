// Takes the rules of the client's app out one at a time, in a copy of the repository, and says which check
// fails without each. A rule that no check misses is a rule nothing holds.
//
//   node scripts/dev/mutate.mjs
//
// The list is the last change's; replace it for the next one. Each rule is a file, the text that holds it, and
// what it becomes without it. The copy is in the scratch folder of the system (never the repository itself), so
// a run that is cut off leaves nothing broken behind.
import { execSync } from 'node:child_process'
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const RULES = [
  ['src/team/routes.tsx', '  if (!who.user.team) {\n', '  if (false) {\n', 'a client gets nothing on the team side'],
  ['src/team/store.ts', "user.team === 'admin' || (user.team === 'accountant' && company.accountantId === user.id)", "user.team === 'admin' || user.team === 'accountant'", 'an accountant opens only her own clients'],
  ['src/team/store.ts', "const own = isAdmin(user) ? '' : 'AND c.accountant_id = ?'", "const own = isAdmin(user) ? '' : 'AND (c.accountant_id = ? OR 1)'", 'an accountant lists only her own clients'],
  ['src/team/routes.tsx', "teamRoutes.post('/klienti', async (c) => {\n  const who = c.get('who')\n  if (!isAdmin(who.user)) return missingPage(c)", "teamRoutes.post('/klienti', async (c) => {\n  const who = c.get('who')", 'only an administrator makes a client'],
  ['src/team/routes.tsx', "teamRoutes.get('/ziadosti', async (c) => {\n  const who = c.get('who')\n  if (!isAdmin(who.user)) return missingPage(c)", "teamRoutes.get('/ziadosti', async (c) => {\n  const who = c.get('who')", 'only an administrator reads the requests'],
  ['src/team/routes.tsx', '  if (!demoOn(c)) return c.notFound()', '  if (false) return c.notFound()', 'the sample team exists only in the playground'],
  ['src/team/routes.tsx', "if (values.request) statements.push(db.prepare(\"UPDATE requests SET status = 'client' WHERE id = ?\").bind(values.request))", '', 'a request that became a client says so'],
  ['src/team/routes.tsx', 'newLink(db, userId, TEAM.welcomeDays * 24 * 60)', 'newLink(db, userId, 0)', 'the welcome link lasts days'],
  ['src/team/routes.tsx', '    if (doc.bookedAt) return c.redirect(`/ucto/doklady/${doc.id}`, 303)\n', '', 'a booked document is not thrown away by the team'],
  ['src/app/store.ts', "WHERE id = ? AND company_id = ? AND deleted_at IS NULL AND booked_at IS NULL", "WHERE id = ? AND company_id = ? AND deleted_at IS NULL", 'a booked document is not deleted'],
  ['src/app/store.ts', 'const twin = rows.results.map(docOf).find((other) => sameDocument(self, other))', 'const twin = rows.results.map(docOf).find(() => false)', 'the same document twice is a suspected duplicate'],
  ['src/app/store.ts', "WHERE id = ?3 AND company_id = ?1 AND booked_at IS NULL AND EXISTS", "WHERE id = ?3 AND company_id = ?1 AND booked_at IS NULL AND 0 AND EXISTS", "a supplier's rule is proposed for its next documents"],
  ['src/app/routes.tsx', "    if (!anyone) {\n", '    if (true) {\n', 'the public mailbox makes an administrator only while the team is empty'],
  ['src/app/routes.tsx', 'who.company.accountantEmail ?? BRAND.email', 'BRAND.email', "a client's message goes to her accountant"],
  ['src/app/session.ts', 'WHERE id = ?2 AND user_id = ?3 AND EXISTS (SELECT 1 FROM members m', 'WHERE id = ?2 AND user_id = ?3 AND 1 OR EXISTS (SELECT 1 FROM members m', 'a person switches only to her own companies'],
  ['src/team/store.ts', "if (/^[=+\\-@\\t]/.test(text) && !/^-\\d+(?:,\\d+)?$/.test(text)) text = `'${text}`", '', 'a CSV cell never runs in Excel'],
  ['src/app/booking.ts', "  const split = vatPayer && args.vatDeduct && vat > 0\n", '  const split = vat > 0\n', 'VAT is split out only when it is deducted'],
  ['src/app/booking.ts', "const contra = kind === 'invoice_in' ? '321' : paidBy === 'private' ? '365'", "const contra = kind === 'invoice_in' ? '321' : paidBy === 'private' ? '221'", "what the owner paid is owed to him"],
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
let held = 0
for (const [file, from, to, what] of RULES) {
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
console.log(`${held} of ${RULES.length} rules held`)
