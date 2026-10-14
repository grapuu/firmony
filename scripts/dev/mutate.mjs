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
  // The codes of an eKasa receipt (src/app/ekasa.ts)
  ['src/app/ekasa.ts', ".toUpperCase().replace(/^0-/, 'O-')", '.toUpperCase()', 'a nought for the letter O'],
  ['src/app/ekasa.ts', "value.replace(/\\s/g, '').toUpperCase().replace", "value.replace(/\\s/g, '').replace", 'an identifier in capitals'],
  ['src/app/ekasa.ts', 'return /^[A-Z]-[0-9A-F]{32}$/.test(plain) ? plain : null', 'return plain', 'an identifier of its form only'],
  ['src/app/ekasa.ts', "test(hex) ? (hex.match(/.{8}/g) ?? []).join('-') : null", 'test(hex) ? hex : null', 'a verification code in its five blocks'],
  ['src/app/ekasa.ts', "return /^[0-9A-F]{40}$/.test(hex) ? (hex.match(/.{8}/g) ?? []).join('-') : null", "return (hex.match(/.{8}/g) ?? []).join('-')", 'a verification code of its form only'],
  ['src/app/ekasa.ts', 'const MISREAD = 4', 'const MISREAD = 0', 'a few characters read wrong'],
  ['src/app/ekasa.ts', 'const MISREAD = 4', 'const MISREAD = 5', 'five characters wrong is another code'],
  ['src/app/ekasa.ts', 'if (byUid === true || byOkp === true) return true', 'if (byUid === true) return true', 'either code agreeing is enough'],
  ['src/app/ekasa.ts', '  if (byUid === false || byOkp === false) return false\n', '', 'codes that disagree are two receipts'],
  // A duplicate (src/app/booking.ts, src/app/store.ts)
  ['src/app/booking.ts', 'if (receipt !== null) return receipt', 'if (receipt === true) return true', 'two receipts of one number and amount stay two'],
  ['src/app/booking.ts', 'if (receipt !== null) return receipt', 'if (receipt === false) return false', 'one receipt by its code, whatever amount was read'],
  ['src/app/store.ts', 'OR d.ekasa_uid = ?5 OR d.ekasa_okp = ?6 ', '', 'a document with the exact code is looked at'],
  ['src/app/store.ts', 'AND d.issued_on = ?8 AND (d.ekasa_uid IS NOT NULL OR d.ekasa_okp IS NOT NULL)', 'AND d.issued_on = ?8 AND 0', 'a coded receipt of the same day is looked at'],
  ['src/app/store.ts', 'const twin = others.find((other) => !other.duplicateOf) ?? others[0]', 'const twin = others[0]', 'the twin is the original'],
  ['src/app/store.ts', 'if (!self || (self.totalCents === null && !codes)) return null', 'if (!self || self.totalCents === null) return null', 'a receipt without an amount, by its code'],
  ['src/app/store.ts', 'ORDER BY d.created_at DESC LIMIT 50', 'ORDER BY d.created_at LIMIT 50', 'the latest documents are looked at'],
  // Read, kept and shown (src/app/read.ts, src/app/store.ts, src/views/team.tsx)
  ['src/app/read.ts', 'ekasaUid: ekasaUid(input.ekasa_uid),', 'ekasaUid: null,', "the reader's identifier"],
  ['src/app/read.ts', 'ekasaOkp: ekasaOkp(input.ekasa_okp),', 'ekasaOkp: null,', "the reader's verification code"],
  ['src/app/store.ts', '      reading.ekasaUid ?? null,\n', '      null,\n', 'the identifier is stored'],
  ['src/app/store.ts', '      reading.ekasaOkp ?? null,\n', '      null,\n', 'the verification code is stored'],
  ['src/app/store.ts', 'ekasaUid: str(row.ekasa_uid),', 'ekasaUid: null,', 'the identifier is read back'],
  ['src/views/team.tsx', '{d.ekasaUid || d.ekasaOkp ? (', '{false ? (', 'the accountant sees the code'],
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
