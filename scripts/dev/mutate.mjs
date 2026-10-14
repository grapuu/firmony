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
  // The statements of a micro entity (src/app/closing.ts)
  ['src/app/closing.ts', "  ['31', { debit: 'r18', credit: 'r39' }],", "  ['31', { signed: 'r18' }],", 'a customer who paid ahead is a liability'],
  ['src/app/closing.ts', "const key = synthetic(account) === '221' ? account : synthetic(account)", 'const key = synthetic(account)', 'an overdraft is a loan, not less money'],
  ['src/app/closing.ts', "if (before && (cls === 5 || cls === 6)) add('431', cents)", "if (false) add('431', cents)", "last year's result opens the next on 431"],
  ['src/app/closing.ts', '  if (rounding !== 0) {', '  if (false) {', 'the rounding is put in row 22'],
  ['src/app/closing.ts', '      unplaced.push(account)\n', '', 'an account without a row is said'],
  // The return (src/app/closing.ts)
  ['src/app/closing.ts', 'taxable <= E(100_000) ? 10 :', 'taxable <= E(50_000) ? 10 :', 'the 10 % rate up to 100 000 €'],
  ['src/app/closing.ts', '  if (year >= 2026 && taxable > E(5_000_000)) return E(11_520)\n', '', 'the minimum tax band above 5 000 000 € from 2026'],
  ['src/app/closing.ts', 'const cap = input.micro && l.year >= 2021 ? base : half', 'const cap = half', 'a micro-taxpayer deducts losses up to the whole base'],
  ['src/app/closing.ts', '.filter((l) => l.year < input.year && input.year - l.year <= LOSS_YEARS)', '.filter((l) => l.year < input.year)', 'losses five periods back'],
  ['src/app/closing.ts', 'roundCents(((input.minimumHalf ? whole / 2 : whole) * months) / 12)', 'whole', 'the minimum tax halved, and a share of a shorter period'],
  ['src/app/closing.ts', 'r.r910 = minimumPaid ? 0 : Math.max(0, r.r800 - minimum)', 'r.r910 = Math.max(0, r.r800)', 'the minimum tax credited only on the tax above the minimum'],
  ['src/app/closing.ts', 'r.r1100 = due > E(5) ? due : 0', 'r.r1100 = due > 0 ? due : 0', 'a tax to pay of 5 € or less is not paid'],
  ['src/app/closing.ts', 'r.r1110 > E(16_600) ?', 'r.r1110 > E(1_000_000) ?', 'monthly advances above 16 600 €'],
  ['src/app/closing.ts', 'r.r150 = Math.max(0, (tableB.r01 ?? 0) - (tableB.r06 ?? 0))', 'r.r150 = 0', 'the depreciation over the tax one is added in row 150'],
  ['src/app/closing.ts', 'tableB.r06 = (tableB.r02 ?? 0) - (tableB.r03 ?? 0) - (tableB.r04 ?? 0) + (tableB.r05 ?? 0)', 'tableB.r06 = tableB.r02 ?? 0', 'row 6 of Table B lowered by what is not claimed'],
  ['src/app/closing.ts', 'tableB: { b01: depreciation, b02: depreciation },', 'tableB: { b01: depreciation },', 'the tax depreciation proposed as the books have it'],
  ['src/app/closing.ts', 'micro: inputs.micro ?? taxable <= MICRO_REVENUES,', 'micro: inputs.micro ?? true,', 'a micro-taxpayer by the taxable revenues'],
  ['src/app/closing.ts', 'minimumExempt: inputs.minimumExempt ?? from > `${year}-01-01`,', 'minimumExempt: inputs.minimumExempt ?? false,', 'a first period pays no minimum tax'],
  ['src/app/closing.ts', 'months: periodMonths(from),', 'months: 12,', 'a shorter period counts its months'],
  ['src/app/closing.ts', 'advances: inputs.advances ?? found.advances,', 'advances: inputs.advances ?? 0,', 'the advances the bank shows'],
  ['src/app/closing.ts', '(extendedTo ? workingDayFrom(extendedTo) : closingDeadline(year))', '(extendedTo ? extendedTo : closingDeadline(year))', 'a day off moves a moved deadline too'],
  ['src/app/closing.ts', 'abroad: m > 6 }', 'abroad: false }', 'six months only with income from abroad'],
  // What keeps a closing back (src/app/closing.ts)
  ['src/app/closing.ts', "(books.docDays.get(id) ?? null) === null || (books.docDays.get(id) as string) <= end", 'true', "documents of the next year do not keep it back"],
  ['src/app/closing.ts', "ids.filter((id) => (books.payments.get(id)?.bookedOn ?? '') <= end)", 'ids', "payments of the next year do not keep it back"],
  ['src/app/closing.ts', "  if (args.tax && args.tax.computed !== args.tax.booked) block('tax')\n", '', 'the tax booked as computed'],
  ['src/app/closing.ts', "  if (!args.nace) block('nace')\n", '', 'the activity is asked for'],
  ['src/app/closing.ts', 'statements: differs(filed.balance, statements.balanceEur) ||', 'statements:', 'the statements changed since the filing'],
  // The adjustments (src/app/closing-form.ts)
  ['src/app/closing-form.ts', 'if (cents !== (proposal.tableA[row] ?? 0)) inputs.tableA[row as TableARow] = cents', 'inputs.tableA[row as TableARow] = cents', "what equals the books' proposal is not stored"],
  ['src/app/closing-form.ts', 'inputs.micro = micro === (taxable ?? proposal.taxable) <= MICRO_REVENUES ? null : micro', 'inputs.micro = micro', 'a tick is stored only against the proposal'],
  ['src/app/closing-form.ts', " || n < year - back || n >= year) errors[`${prefix}_rok_${i}`] = 'year'", ") errors[`${prefix}_rok_${i}`] = 'year'", 'a loss too old is refused'],
  ['src/app/closing-form.ts', "      else if ((used ?? 0) > sum) errors[`${prefix}_pred_${i}`] = 'used'\n", '', 'more used than there was is refused'],
  ['src/app/closing-form.ts', "if (approved === null || (approved !== '' && approved <= `${year}-12-31`)) errors.schvalena = 'day'", "if (approved === null) errors.schvalena = 'day'", 'the approval comes after the year'],
  ['src/app/closing-form.ts', '&& amountOk(v.usedBefore) && v.usedBefore <= v.amount)', ')', 'stored losses are checked again'],
  // The files, the books, the deadlines
  ['src/app/closing-xml.ts', "el(row, tax.tableBUsed ? amount(tax.tableB[row] ?? 0) : '')", "el(row, '')", 'Table B is in the file'],
  ['src/app/ledger.ts', "  if (p.exempt === 'state' && tax === null && /^170099\\d{4}$/.test(normalizeVs(p.vs))) return '341'\n", '', 'the income tax by its own symbol'],
  ['src/team/deadlines.ts', "state: last?.filed ? 'done' : 'open'", "state: 'open'", 'a closing filed is done'],
  ['src/team/deadlines.ts', 'day: closingDue(year, last?.extendedTo ?? null)', 'day: closingDue(year, null)', "a notice moves the closing's day"],
  ['src/team/deadlines.ts', 'const rest = Math.max(0, k.payCents - k.paid)', 'const rest = k.payCents', 'the income tax paid is taken off'],
  ['src/team/deadlines.ts', '    if (!k.filed || k.payCents <= 0) continue', '    if (!k.filed) continue', 'nothing to pay asks for nothing'],
  ['src/views/deadlines.tsx', '      return `${base}/zavierka?rok=${d.period}`', '      return `${base}/kniha`', 'the closing leads to its page'],
  // The routes and the store (runtime)
  ['src/team/routes.tsx', "  if (view.closing?.filed) return c.redirect(`${back}&ok=zavierka-uz`, 303)\n  const read = readClosing", '  const read = readClosing', "a filed closing's adjustments are not kept"],
  ['src/app/closing-store.ts', '  if (previous) out.push(removeInternalStatement(db, company, previous, by))\n', '', 'the tax booked again replaces the one before'],
  ['src/app/closing-store.ts', "\n            AND substr(upper(replace(COALESCE(party_iban, ''), ' ', '')), 5, 10) = ?3", '', "only a payment to the income tax's account is an advance"],
  ['src/team/routes.tsx', "  if (closingState(view) !== 'ready') return c.redirect(`${back}&ok=zavierka-blokovane`, 303)\n", '', 'a closing kept back is not marked filed'],
  ['src/team/routes.tsx', "  if (to !== '' && !extensionDays(view.year).some((d) => d.day === to)) return c.text('Bad request', 400)\n", '', 'only a day a notice may move to'],
  ['src/team/routes.tsx', "  if (state !== 'ready' && state !== 'filed') return c.redirect(`${back}&ok=zavierka-blokovane`, 303)\n", '', 'no file while something keeps it back'],
  ['src/team/routes.tsx', 'groupedIban(taxIban(company.taxAccount, INCOME_PREFIX))', 'groupedIban(taxIban(company.taxAccount))', "the income tax is paid to its own account"],
  ['src/team/deadlines-store.ts', "ltrim(p.vs, '0') = '170099' || k.year", "ltrim(p.vs, '0') LIKE '170099%'", "the income tax paid with the year's symbol"],
  ['src/app/purge.ts', "    db.prepare('DELETE FROM closings WHERE company_id = ?').bind(companyId),\n", '', 'the closings go with the company'],
  ['src/views/closing.tsx', '{!filed && !view.running && today > view.due ? <p class="flag">', '{false ? <p class="flag">', 'a closing past its deadline says so'],
  ['src/views/taxes.tsx', 'iban={company.taxAccount ? taxIban(company.taxAccount, INCOME_PREFIX) : null}', 'iban={company.taxAccount ? taxIban(company.taxAccount) : null}', 'the client pays the income tax to its account'],
  ['src/app/routes.tsx', 'closings.filter((k) => k.filed)', 'closings.filter(() => false)', "the client's taxes have the income tax"],
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
