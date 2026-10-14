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
  // The return and the control statement (vat.ts)
  ['src/app/vat.ts', '    statement: payer && !nothing && !goodsOnly,', '    statement: payer && !nothing,', 'goods to the EU alone need no control statement'],
  ['src/app/vat.ts', "      if (isReceived(doc.kind) && data.mode === 'reverse') issue('warn', 'needs7a', doc.id)\n", '', 'a service from abroad asks for § 7a'],
  [
    'src/app/vat.ts',
    '  let period = doc.receivedOn > filingDeadline(natural) ? periodOf(doc.receivedOn, quarterly) : natural',
    '  let period = natural',
    'a deduction that came late goes to the month it came',
  ],
  ['src/app/vat.ts', '    if (!filedOn || filedOn > doc.receivedOn) break', '    break', 'a month filed before the document came is closed to it'],
  ['src/app/vat.ts', '    if (company.since && taxDay(doc, data) < company.since) {', '    if (false) {', 'nothing from before the registration'],
  ['src/app/vat.ts', '    rows.r34 = Math.min(Math.max(0, carriedIn), rows.r32)', '    rows.r34 = Math.max(0, carriedIn)', 'row 34 is at most row 32'],
  ['src/app/vat.ts', '    if (total.o < B3_LIMIT) kv.b31 = total', '    if (true) kv.b31 = total', 'receipts by supplier from 3 000 €'],
  ['src/app/vat.ts', '    const business = Boolean(vatId || doc.partyIco)', '    const business = Boolean(vatId)', 'a business without a VAT number is in A.1'],
  ['src/app/vat.ts', '  while (!isWorkingDay(day)) day = addDays(day, 1)\n  return day', '  return day', 'a deadline moves past a day off'],
  ['src/app/vat.ts', "          add('r28', -deduct, doc.id)", "          add('r28', deduct, doc.id)", 'a credit note received raises the tax in 28'],
  ['src/app/vat.ts', '  return company.since <= yearBefore', '  return true', 'a refund at once only after 12 months'],
  // Corrections (vat.ts, vat-store.ts, vat-xml.ts)
  ['src/app/vat.ts', '    r37 = after > 0 ? after : null', '    r37 = r36', 'an excess deduction not yet refunded gives way'],
  ['src/app/vat.ts', '  } else r37 = r36 === 0 ? null : r36', '  } else r37 = r36', 'nothing changed, row 37 stays empty'],
  [
    'src/app/vat.ts',
    '      if ((left.get(k) ?? 0) > (kept.get(k) ?? 0)) kept.set(k, (kept.get(k) ?? 0) + 1)\n      else out[part].push({ ...line, k: 1 })',
    '      out[part].push({ ...line, k: 1 })',
    'a line that stays is not repeated',
  ],
  [
    'src/app/vat-store.ts',
    "  return ROWS.filter((row) => row !== 'r36' && row !== 'r37' && filed[row] !== now[row])",
    '  return ROWS.filter((row) => filed[row] !== now[row])',
    'a supplementary return filed stands filed',
  ],
  ['src/app/vat-store.ts', '(changed.length > 0 || kvChanged > 0 ?', '(changed.length > 0 ?', 'a change of the control statement alone is a change'],
  ['src/app/vat-store.ts', '  if (filed.some((f) => f.period === nextPeriod(prev.period))) return true\n', '', 'an excess deduction is settled once the next month was filed'],
  [
    'src/app/vat-store.ts',
    'choices.foundOn && choices.foundOn >= prev.filedOn && choices.foundOn <= today ? choices.foundOn : today',
    'choices.foundOn ? choices.foundOn : today',
    'a day of finding lies between the filing and today',
  ],
  ['src/app/vat-store.ts', '  while (!isWorkingDay(day)) day = addDays(day, 1)\n  return day', '  return day', 'a supplementary deadline moves past a day off'],
  ['src/app/vat-store.ts', '  if (!filed.prev) return db', '  if (true) return db', 'a correction taken back restores the filing before it'],
  ['src/app/vat-xml.ts', "el('ddp', flag(kind === 'D'))", "el('ddp', flag(kind === 'O'))", 'a supplementary return is marked so'],
  ['src/app/vat-xml.ts', "['KOpr', kind === 'D' && k ? k : null]", "['KOpr', null]", 'a supplementary control statement carries its codes'],
  ['src/app/vat-xml.ts', 'flag(Boolean(opts.fastRefund) && rows.r33 > 0)', 'flag(false)', 'the box of § 79(2) is marked'],
  [
    'src/team/routes.tsx',
    "const correctionBlocked = (view: PeriodView): boolean => view.state === 'changed' && (",
    'const correctionBlocked = (view: PeriodView): boolean => false && (',
    'a correction waits for books that could be filed',
  ],
  // The excess deduction carried, and the month before
  ['src/app/vat-store.ts', '  if (before) return before.fast ? 0 : before.rows.r33', '  if (before) return before.rows.r33', 'an excess deduction refunded at once is not carried'],
  ['src/app/vat-store.ts', '  if (mine) return mine.carried\n', '', 'a month filed keeps what it carried'],
  [
    'src/app/vat-store.ts',
    "  const blocked = issues.length > 0 || previous !== null || result.issues.some((i) => i.level === 'block')",
    "  const blocked = issues.length > 0 || result.issues.some((i) => i.level === 'block')",
    'the month before is filed first',
  ],
  // Paying
  [
    'src/app/vat-store.ts',
    "  if (company.vatStatus === 'reg7a' && ret.payCents <= 500) return 0",
    "  if (company.vatStatus === 'reg7a' && ret.payCents < 0) return 0",
    '§ 7a pays no tax of 5 € or less',
  ],
  ['src/app/vat-store.ts', '=> Math.max(0, payable(company, ret) - (paid?.cents ?? 0))', '=> Math.max(0, payable(company, ret))', 'what was paid counts'],
  ['src/app/vat-store.ts', "  if (iban) return ibanOk(plain) ? strip(iban[2] ?? '') : null", "  if (iban) return strip(iban[2] ?? '')", 'an IBAN with wrong check digits is refused'],
  ['src/app/deadlines.ts', '    for (const f of vat.filed) if (f.period !== of && left(f) > 0) out.push(pay(f))\n', '', 'a tax not paid stays on the list'],
  // The booking form, the entry and the end
  ['src/app/vat-form.ts', "  if (lines.some((line) => line.base < 0 || line.vat < 0) && corrects === '') errors.corrects = 'negative'\n", '', 'a minus needs the invoice it corrects'],
  ['src/app/vat-form.ts', '&& !isSkVatId(vatId)) errors.vatId', '&& false) errors.vatId', 'a deduction from a Slovak supplier needs his VAT number'],
  ['src/app/booking.ts', '  if (self && self.cents > 0) lines.push(', '  if (false) lines.push(', 'the VAT a company pays itself is booked'],
  ['src/app/purge.ts', "    db.prepare('DELETE FROM vat_returns WHERE company_id = ?').bind(companyId),\n", '', 'the returns filed go with the company'],
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
