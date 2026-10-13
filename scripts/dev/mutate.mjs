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
  ['src/app/store.ts', "WHERE d.id = ? AND p.id = ? AND p.company_id = ? AND d.deleted_at IS NULL", "WHERE d.id = ? AND p.id = ? AND (p.company_id = ? OR 1) AND d.deleted_at IS NULL", 'a document goes only to a payment of its company'],
  ['src/app/store.ts', "FROM documents d JOIN payments p ON p.company_id = d.company_id", 'FROM documents d JOIN payments p ON 1', 'a document and its payment are of one company'],
  ['src/app/store.ts', "AND NOT EXISTS (SELECT 1 FROM links WHERE document_id = d.id)\n", '\n', 'a document belongs to one payment'],
  ['src/app/store.ts', "AND p.exempt IS NULL\n", '\n', 'a payment that needs no document takes none'],
  ['src/app/store.ts', "WHERE id = ? AND company_id = ? AND exempt IS NULL AND NOT EXISTS", 'WHERE id = ? AND (company_id = ? OR 1) AND exempt IS NULL AND NOT EXISTS', 'only a payment of the company is changed'],
  ['src/app/store.ts', "WHERE s.id = ? AND s.expires_at > ?", 'WHERE s.id = ? AND s.expires_at > ? - 1e12', 'an old session opens nothing'],
  ['src/app/session.ts', "WHERE id = ?2 AND used_at IS NULL AND expires_at > ?1", 'WHERE id = ?2 AND expires_at > ?1', 'a link works once'],
  ['src/app/routes.tsx', "    const existing = seen.has(hash) ? 'this-request' : await documentByHash(db, who.company.id, hash)", "    const existing = null", 'the same file is kept once'],
  ['src/app/routes.tsx', "if (c.env.DEMO !== '1' || !isLocal(new URL(c.req.url).hostname)) return c.notFound()", "if (false) return c.notFound()", 'the sample company exists only in the playground'],
  ['src/app/routes.tsx', "    ? await c.env.DB.prepare('SELECT file_key, file_type, file_name FROM documents WHERE id = ? AND company_id = ? AND deleted_at IS NULL').bind(id, who.company.id)", "    ? await c.env.DB.prepare('SELECT file_key, file_type, file_name FROM documents WHERE id = ? AND (company_id = ? OR 1) AND deleted_at IS NULL').bind(id, who.company.id)", 'a file goes only to its company'],
  ['src/app/match.ts', "if (only && only.points >= AUTO_SCORE && (byDocument.get(only.doc) ?? []).length === 1) {", "if (only && only.points >= AUTO_SCORE) {", 'a pair is made only when neither has another candidate'],
  ['src/app/match.ts', "  if (doc.kind === 'receipt') return days >= -1 && days <= 5", "  if (doc.kind === 'receipt') return true", 'a receipt is settled within days'],
  ['src/app/read.ts', "  if (b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff) return 'jpeg'", "  if (b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff) return 'jpeg'\n  if (bytes.length > 0) return 'jpeg'", 'a file is what its bytes say'],
  ['src/app/xml.ts', "  if (/<!DOCTYPE|<!ENTITY/i.test(text)) return null", '', 'a file that declares entities is refused'],
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
