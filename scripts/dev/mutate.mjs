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
  // The recapitulative statement (src/app/vat-summary.ts)
  ['src/app/vat-summary.ts', 'if (summaryPeriodOf(periodOfDoc(doc, data, company), company) !== period) continue', 'if (periodOfDoc(doc, data, company) !== period) continue', '§ 7a by the calendar quarter'],
  ['src/app/vat-summary.ts', "const code = data.mode === 'eu_service' ? '2' : ''", "const code = '2'", 'goods without a code'],
  ['src/app/vat-summary.ts', "if (!vatId || !country || country === 'SK' || !isEuVatId(vatId)) {", 'if (!vatId || !country) {', 'a VAT number of another member state'],
  ['src/app/vat-summary.ts', '    due = true\n    if (!doc.booked) {', '    due = true\n    if (false) {', 'an invoice not booked keeps it back'],
  ['src/app/vat-summary.ts', 'Math.sign(cents) * Math.round(Math.abs(cents) / 100)', 'Math.floor(cents / 100)', 'whole euros, half up'],
  ['src/app/vat-summary.ts', '.filter((row) => row.euros !== 0)', '', 'nothing left is no row'],
  ['src/app/vat-summary.ts', "code: row.code === '1' || (row.code === '2' && stays) ? '0' : row.code", 'code: row.code', 'a wrong code cancelled with 0'],
  ['src/app/vat-summary.ts', 'const changed = now.filter((row) => before.get(key(row))?.euros !== row.euros)', 'const changed = now', 'only the rows that change'],
  ['src/app/vat-summary.ts', '    const kind = correctionKind(period, today)\n', "    const kind = 'O' as const\n", 'after the deadline a supplementary statement'],
  ['src/app/vat-summary.ts', "rows: kind === 'O' ? rows : svDiff(filed.rows, rows)", 'rows', 'a supplementary statement holds the difference'],
  ['src/app/vat-summary.ts', 'if (filed.rows === null || sameRows(filed.rows, rows))', 'if (filed.rows === null)', 'filed as it stands'],
  ['src/app/vat-summary.ts', 'if (!due || (!blocked && rows.length === 0))', 'if (!due)', 'supplies that came to nothing'],
  ['src/app/vat-summary.ts', "  if (today <= periodRange(period).to) return { ...base, state: 'running', plan: null }\n", '', 'the period running'],
  ['src/app/vat-summary.ts', "if (company.status === 'payer' && isQuarter(period) && goods > GOODS_LIMIT)", 'if (false)', 'a quarter of goods above 50 000 €'],
  // The tax day (src/app/vat.ts), the file (src/app/vat-xml.ts), what is kept (src/app/vat-store.ts)
  ['src/app/vat.ts', "if (data.mode !== 'acquisition' && data.mode !== 'eu_goods') return supplied", "if (data.mode !== 'acquisition') return supplied", 'goods to the EU fall due by § 19(8)'],
  ['src/app/vat-xml.ts', "el('celkovaHodnota', String(totalOf(rows)))", "el('celkovaHodnota', '')", 'the total on the first page'],
  ['src/app/vat-xml.ts', 'for (let page = 0; page < Math.ceil(rows.length / 12); page++)', 'for (let page = 0; page < 1; page++)', 'as many pages as the rows need'],
  ['src/app/vat-xml.ts', "(ROMAN[Number(period.slice(6)) - 1] ?? '') : '')}${el('rok'", "period.slice(6) : '')}${el('rok'", 'a quarter as I to IV'],
  ['src/app/vat-store.ts', '  if (filed.prev)\n', '  if (false)\n', 'a correction taken back gives way'],
  ['src/app/vat-store.ts', 'prev: f.prev ? { ...svData(f.prev), filedOn: f.prev.filedOn, filedAt: f.prev.filedAt, filedBy: f.prev.filedBy } : null', 'prev: null', 'a correction keeps the statement it corrects'],
  ['src/app/vat-store.ts', "companyIssues(company).filter((issue) => issue !== 'office').length", '0', "the company's VAT number"],
  // The deadlines and the pages
  ['src/team/deadlines.ts', "day: fix === 'O' ? sv.deadline : today", 'day: sv.deadline', 'a supplementary statement for today'],
  ['src/team/routes.tsx', 'const send = sv.plan ?? (sv.state === \'filed\' && sv.filed ? { kind: sv.filed.kind, rows: sv.filed.sent } : null)', 'const send = sv.plan', 'the file of a statement filed'],
  ['src/team/routes.tsx', "  if (sv.state === 'filed') return c.redirect(`${back}&ok=sv-uz#suhrnny`, 303)\n", '', 'filed once'],
  ['src/views/vat.tsx', "if (sv.state === 'none' && !sv.filed) return null", 'if (false) return null', 'no statement without supplies'],
  ['src/views/deadlines.tsx', 'return d.fix ? t.what.summaryFix[d.fix](periodName(period)) : t.what.summary(periodName(period))', 'return t.what.summary(periodName(period))', 'the correction named'],
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
