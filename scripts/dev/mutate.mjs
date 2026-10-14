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
  // An employee's month (src/app/payroll.ts)
  ['src/app/payroll.ts', "floorCents(((kind === 'accident' ? gross : socialBase) * bp) / 10000)", 'floorCents((socialBase * bp) / 10000)', 'accident insurance has no cap'],
  ['src/app/payroll.ts', 'const socialBase = Math.min(gross, socialCap(y))', 'const socialBase = gross', 'social insurance is capped'],
  ['src/app/payroll.ts', 'const floorCents = (value: number): number => Math.floor(value + 1e-9)', 'const floorCents = (value: number): number => Math.round(value)', 'insurance amounts are rounded down'],
  ['src/app/payroll.ts', '    healthTopUp = Math.max(0, minimum - healthEmployee - healthEmployer)', '    healthTopUp = 0', 'the minimum health advance is topped up'],
  ['src/app/payroll.ts', 'const minimum = floorCents((whole * days) / monthDays(input.period))', 'const minimum = whole', 'the minimum health advance is shared by the days'],
  ['src/app/payroll.ts', 'const nonTaxable = input.declaration ? Math.min(Math.max(0, partialBase), nonTaxableMonth(y)) : 0', 'const nonTaxable = Math.min(Math.max(0, partialBase), nonTaxableMonth(y))', 'the non-taxable part only with the declaration'],
  ['src/app/payroll.ts', 'part(b1, b2) * 25', 'part(b1, b2) * 19', 'the 25 % band'],
  ['src/app/payroll.ts', 'part(b3, Number.POSITIVE_INFINITY) * 35', 'part(b3, Number.POSITIVE_INFINITY) * 30', 'the 35 % band'],
  ['src/app/payroll.ts', 'if (years < 15 || (years === 15 && birthdayMonth)) return 10000', 'if (years < 15) return 10000', 'the 100 € bonus to the month the child turns 15'],
  ['src/app/payroll.ts', '  if (child.born.slice(0, 7) > period) return 0\n', '', 'no bonus before the birth'],
  ['src/app/payroll.ts', 'const cut = partialBase > threshold ? (partialBase - threshold) / 10 : 0', 'const cut = 0', 'the bonus cut for a high income'],
  ['src/app/payroll.ts', 'const cap = ((BONUS_CAP[Math.min(reduced.length, 6)] ?? 0) * Math.max(0, partialBase)) / 10000', 'const cap = Number.POSITIVE_INFINITY', 'the bonus at most a share of the base'],
  ['src/app/payroll.ts', 'const eligible = input.declaration ? input.children', 'const eligible = true ? input.children', 'the bonus only with the declaration'],
  ['src/app/payroll.ts', 'const half = input.disabled ? 2 : 1', 'const half = 1', 'a disability halves health insurance'],
  ['src/app/payroll.ts', 'return Math.max(0, Math.ceil(38000 - (income - 38000) * 2))', 'return 38000', 'the deductible item shrinks above 380 €'],
  ['src/app/payroll.ts', 'export const nonTaxableYear = (y: PayrollYear): number => roundCents(21 * y.subsistence)', 'export const nonTaxableYear = (y: PayrollYear): number => roundCents(19.2 * y.subsistence)', 'the non-taxable part is 21 times the subsistence minimum'],
  // The months (src/app/payroll-store.ts)
  ['src/app/payroll-store.ts', 'const day = settings.payday ? Math.min(settings.payday, last) : last', 'const day = settings.payday ?? last', 'a payday in a shorter month'],
  ['src/app/payroll-store.ts', '(days === monthDays(period) ? e.wage : Math.round((e.wage * days) / monthDays(period)))', 'e.wage', 'a share of the wage for part of a month'],
  ['src/app/payroll-store.ts', '  if (start > end) return 0\n', '', 'nobody employed has no days'],
  // The books (src/app/ledger.ts)
  ['src/app/ledger.ts', '    if (payroll.some((r) => r.pays.social === out)) return SOCIAL_ACCOUNT\n', '', "the Social Insurance Agency's sum to 336.100"],
  ['src/app/ledger.ts', "  if (tax === 'wage') return '342'\n", '', 'the wage tax by its account'],
  ['src/app/ledger.ts', "(p.exempt === 'payroll' || p.exempt === 'state') && p.amountCents < 0", "p.exempt === 'payroll' && p.amountCents < 0", "a payroll sum the app took for the state's"],
  ['src/app/ledger.ts', "{ md: '524', d: SOCIAL_ACCOUNT, cents: r.socialEmployer }", "{ md: '521', d: SOCIAL_ACCOUNT, cents: r.socialEmployer }", "the employer's insurance to 524"],
  // The deadlines (src/team/deadlines.ts)
  ['src/team/deadlines.ts', "state: closed ? 'done' : today <= periodRange(month).to ? 'running' : 'open'", "state: today <= periodRange(month).to ? 'running' : 'open'", 'a closed month is done'],
  ['src/team/deadlines.ts', 'const day = workingDayFrom(pr.closed.get(month) ?? paydayOf(month, pr))', 'const day = workingDayFrom(paydayOf(month, pr))', 'a closed month by its own payday'],
  ['src/team/deadlines.ts', 'if ((pr.last && month > pr.last.slice(0, 7)) || (lastOurs && month > lastOurs)) continue', 'if (lastOurs && month > lastOurs) continue', 'nothing after the last employee left'],
  ['src/team/deadlines.ts', "state: facts.filings.has(`${MARKED_KINDS.payroll}:${month}`) ? 'done' : 'open'", "state: 'open'", 'the reports marked are done'],
  // The pages (runtime)
  ['src/team/routes.tsx', "  if (today <= monthRange(period).to) return c.redirect(`${back}&ok=mzdy-bezi`, 303)\n", '', 'the month that runs is not closed'],
  ['src/team/routes.tsx', 'iban: company.taxAccount ? taxIban(company.taxAccount, WAGE_PREFIX) : null', 'iban: company.taxAccount ? taxIban(company.taxAccount) : null', 'the wage tax to its own account'],
  ['src/team/routes.tsx', "  if (iban !== '' && !isIban(iban)) errors.iban = t.payroll.errors.iban\n", '', "an employee's IBAN that is none is refused"],
  ['src/team/routes.tsx', "const born = dayOfText(field('narodeny', 16), 1900)", "const born = dayOfText(field('narodeny', 16))", 'a birth day in the 1900s'],
  ['src/app/purge.ts', "    db.prepare('DELETE FROM employees WHERE company_id = ?').bind(companyId),\n", '', 'the employees go with the company'],
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
