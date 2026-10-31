// Takes the rules of the last change out one at a time, in a copy of the repository, and says which check
// fails without each. A rule that no check misses is a rule nothing holds.
//
//   node scripts/dev/mutate.mjs              every rule of the list
//   node scripts/dev/mutate.mjs number QR    only the rules whose description has one of these words
//   UNITS_ONLY=1 node scripts/dev/mutate.mjs  only the unit suite, never the runtime one
//
// The list is the last change's; replace it for the next one. Each rule is a file, the text that holds it, and
// what it becomes without it. The copy is in the scratch folder of the system (never the repository itself), so
// a run that is cut off leaves nothing broken behind.
import { execSync } from 'node:child_process'
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const RULES = [
  // The audits of 30 October 2026: VAT, the books and the closing.
  ['src/app/vat.ts', "    for (const e of unpaidEvents(doc, counted.data, company, filed)) if (e.period !== own && !out.get(e.period)?.includes(doc)) put(e.period, doc)", "    for (const e of unpaidEvents(doc, counted.data, company, filed)) if (e.period !== own) put(e.period, doc)", '§ 53b: a document once in a period'],
  ['src/app/vat.ts', '          if (deduct === 0) continue\n', '', 'a correction of no deduction corrects nothing'],
  ['src/app/vat.ts', '    if (filedOn === doc.receivedOn && at && doc.receivedAt !== undefined && doc.receivedAt <= Number(at)) break\n', '', 'a document of the filing day before the mark'],
  ['src/app/takeover.ts', '    if ((cls === 5 || cls === 6) && !midYear) {', '    if (cls === 5 || cls === 6) {', 'mid-year: costs and revenues stay'],
  ['src/app/takeover.ts', '    if ((cls > 6 || (cls > 4 && !midYear)) || balance === 0) continue', '    if (cls > 4 || balance === 0) continue', 'mid-year: costs and revenues are opening lines'],
  ['src/app/closing.ts', "    if (!soFar) out.push({ code: 'midyear', level: 'warn', count: 1 })", '', 'books from the middle of the year warned'],
  ['src/app/closing.ts', "  if ((args.carsSold ?? 0) > 0) out.push({ code: 'carSale', level: 'warn', count: args.carsSold ?? 0 })", '', 'a car sold warned'],
  ['src/app/closing.ts', '  if (input.cars && input.cars.excess > 0 && r.r301 < input.cars.limit) r.r302 = roundCents(input.cars.excess)\n', '', 'row 302 for dear cars'],
  ['src/app/closing.ts', '  if (input.cars && input.cars.excess > 0 && r.r301 < input.cars.limit) r.r302', '  if (input.cars && input.cars.excess > 0) r.r302', 'row 302 only below the limit'],
  ['src/app/closing.ts', '      ...(assets.residualUp > 0 ? { r180: assets.residualUp } : {}),\n', '', 'row 180 proposed from the register'],
  ['src/app/closing.ts', "    typed: { r210: proposal.r210, ...(proposal.r180 ? { r180: proposal.r180 } : {}), ...(proposal.r290 ? { r290: proposal.r290 } : {}), ...inputs.typed },", '    typed: { r210: proposal.r210, ...inputs.typed },', 'the proposed rows 180 and 290 reach the return'],
  ['src/app/assets.ts', '        out.residualUp += Math.max(0, book - taxResidual)\n', '', 'the books residual over the tax one'],
  ['src/app/assets.ts', '        out.residualDown += Math.max(0, taxResidual - book)\n', '', 'the tax residual over the books one'],
  ['src/app/assets.ts', "      if (taxResidual !== null && a.disposal !== 'gift') {", '      if (taxResidual !== null) {', 'a gift adjusts no residual'],
  ['src/app/assets.ts', "      if (a.car && a.disposal === 'sale') out.carsSold++", '', 'cars sold counted'],
  ['src/app/assets.ts', "  else if (a.source === 'opening' && kind === 'tangible' && a.bookMonths === null && a.priorBookCents !== a.priorTaxCents)", "  else if (false)", 'an opening asset with other oprávky refused'],
  ['src/app/ledger.ts', '        if (item && left !== 0 && Math.abs(Math.abs(share) - worth) <= worth * FX_SLACK) {', '        if (item && left !== 0) {', 'a part payment in another currency stays owed'],
  ['src/app/ledger.ts', '        const worth = foreign && dayRate ? Math.abs(eurOf(foreign.cents, dayRate.rate)) : owed', '        const worth = owed', 'a whole payment after a large move of the rate'],
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
  const runtime = units.ok && !process.env.UNITS_ONLY ? run('npm run test:runtime') : { ok: !process.env.UNITS_ONLY ? false : units.ok, out: '' }
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
