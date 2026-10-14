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
  // The chart and a document's entry (ledger.ts)
  ['src/app/ledger.ts', '  const m = /^([0-7]\\d{2})(?:[.-]?(\\d{1,3}))?$/.exec(plain)', '  const m = /^(\\d{3})(?:[.-]?(\\d{1,3}))?$/.exec(plain)', 'no account outside classes 0 to 7'],
  ['src/app/ledger.ts', "  const credit = corrects !== '' && lines.reduce((sum, line) => sum + line.base + line.vat, 0) < 0", '  const credit = false', 'a credit note books the other way'],
  [
    'src/app/ledger.ts',
    '  const on = data?.suppliedOn ?? doc.suppliedOn ?? doc.issuedOn ?? bratislavaDay(doc.createdAt)',
    '  const on = bratislavaDay(doc.createdAt)',
    "an entry stands on the document's own day",
  ],
  [
    'src/app/ledger.ts',
    "      const md = registered && line.md === '343' ? VAT_IN : (canonicalAccount(line.md) ?? line.md)",
    '      const md = canonicalAccount(line.md) ?? line.md',
    'VAT deducted on its analytic account',
  ],
  ['src/app/ledger.ts', '  const direct = documents === 1 && ', '  const direct = ', 'a receipt paid directly only when it is the payment alone'],
  ['src/app/ledger.ts', 'payment.amountCents === receipt.expected && payment.bookedOn', 'payment.bookedOn', 'a receipt paid directly only to the cent'],
  ['src/app/ledger.ts', ' && payment.bookedOn.slice(0, 7) === receipt.on.slice(0, 7)', '', 'a receipt paid in another month goes through money in transit'],
  // A payment without a document
  ['src/app/ledger.ts', "  if (p.exempt === 'state' && /^1100\\d{6}$/.test(normalizeVs(p.vs))) return VAT_SETTLE\n", '', 'VAT paid clears the settlement'],
  ['src/app/ledger.ts', "      return p.amountCents < 0 ? '568' : '662'", "      return '568'", 'interest from the bank is a revenue'],
  ['src/app/ledger.ts', "/imani/i.test(`${p.exemptNote ?? ''} ${p.note ?? ''}`) ? '353' : OWNER", "false ? '353' : OWNER", 'capital paid in goes to 353'],
  ['src/app/ledger.ts', "  if (given && synthetic(given) !== '221') return given", '  if (given) return given', 'the bank is never the other side of its own payment'],
  // The books (buildBooks)
  ['src/app/ledger.ts', '    if (!doc.bookedAt) {', '    if (false) {', 'a document not booked is not in the books'],
  ['src/app/ledger.ts', '      if (!inBooks(plan.on)) {', '      if (false) {', 'documents before the books start are left out'],
  ['src/app/ledger.ts', "      if (doc.kind === 'invoice_in' && !pay && doc.paidPrivately) {", '      if (false) {', 'an invoice the owner paid is owed to him'],
  ['src/app/ledger.ts', '      const share = i === accounting.length - 1 ? left : (plans.get(d.id)?.expected ?? 0)', '      const share = left', 'one payment for two invoices: each its own'],
  ['src/app/ledger.ts', '        if (!booked.has(d.id)) continue\n', '', 'a payment waits for its documents to be booked'],
  ['src/app/ledger.ts', '        if (direct.has(d.id) || share === 0) continue', '        if (share === 0) continue', 'a receipt paid directly takes the bank once'],
  ['src/app/ledger.ts', "        if (item) item.settled += account === '321' ? -share : share", '        if (item) item.settled += share', 'a supplier paid is settled'],
  ['src/app/ledger.ts', '      if (p.amountCents - posted !== 0) unposted.set(p.id, p.amountCents - posted)\n', '', 'what is not booked of a payment is counted'],
  ['src/app/ledger.ts', '    if (p.exempt || linked.length > 0) issues.classify.push(p.id)', '    if (false) issues.classify.push(p.id)', 'a payment without an account is asked about'],
  // VAT settled by the returns
  ['src/app/ledger.ts', "      while (k + 1 < chain.length && chain[k + 1]?.kind !== 'D') k++\n", '', 'a corrective return replaces the regular one'],
  ['src/app/ledger.ts', 'rows.r18 + rows.r18a + rows.r19 - rows.r28', 'rows.r18 + rows.r18a + rows.r19 + rows.r28', 'a credit note received lowers what is deducted'],
  ['src/app/ledger.ts', '=> rows.r17 + rows.r25', '=> rows.r17', 'corrections of the tax owed are settled'],
  // Years, the trial balance, the open items, the bank
  ['src/app/ledger.ts', "  if (result !== 0) add(out, '431', result)\n", '', "a year's result opens the next on 431"],
  ['src/app/ledger.ts', '    else if (accountClass(account) !== 7) add(out, account, cents)', '    else add(out, account, cents)', 'the closing accounts do not carry'],
  ['src/app/ledger.ts', "      if (e.kind === 'opening') {\n        add(ps, line.md, line.cents)", '      if (false) {\n        add(ps, line.md, line.cents)', 'opening balances stand as the opening'],
  ['src/app/ledger.ts', '  if (!item.dueOn || item.dueOn >= today || leftOf(item) <= 0) return 0', '  if (!item.dueOn || item.dueOn >= today) return 0', 'a paid invoice is never overdue'],
  ['src/app/ledger.ts', '      if (p && p.bankId === bank.id && p.bookedOn <= on) unposted += cents', '      if (p && p.bookedOn <= on) unposted += cents', 'each bank explains its own difference'],
  // What the accountant types and what is stored
  ['src/app/ledger.ts', "    else if (md === d) errors[i] = 'same'\n", '', 'an internal line has two different accounts'],
  ['src/app/ledger.ts', "    else if (accountClass(account) === 7) errors[i] = 'closing'\n", '', 'no closing account among the opening balances'],
  ['src/app/ledger.ts', "    else if (debit !== null && credit !== null) errors[i] = 'both'\n", '', 'an opening balance is on one side'],
  ['src/app/ledger-store.ts', '      return md && d && md !== d && Number.isInteger(cents)', '      return md && d && Number.isInteger(cents)', 'a stored line is checked again'],
  [
    'src/app/ledger-store.ts',
    "FROM ledger_entries WHERE company_id = ?2 AND kind = 'internal' AND year = ?3)",
    "FROM ledger_entries WHERE company_id = ?2 AND kind = 'internal' AND year = ?3 AND deleted_at IS NULL)",
    'a number once given is not given again',
  ],
  [
    'src/app/ledger-store.ts',
    '  const out = [db.prepare("UPDATE ledger_entries SET deleted_at = ?, deleted_by = ? WHERE company_id = ? AND kind = \'opening\' AND deleted_at IS NULL").bind(ts, by, company)]',
    '  const out: D1PreparedStatement[] = []',
    'the opening balances written anew stand alone',
  ],
  [
    'src/app/ledger-store.ts',
    "AND kind = 'internal' AND deleted_at IS NULL\").bind(now(), by, id, company)",
    'AND deleted_at IS NULL").bind(now(), by, id, company)',
    'only an internal document is removed',
  ],
  // The pages, the download and the end
  ['src/team/routes.tsx', "  if (typed !== '' && (!account || synthetic(account) === '221')) {", "  if (typed !== '' && !account) {", 'the bank account is refused as the other side'],
  ['src/team/routes.tsx', '  if (what.length < 2) errors.text = true\n', '', 'an internal document says what it is'],
  ['src/team/routes.tsx', '  if ((removed.meta?.changes ?? 0) === 0) return missingPage(c)\n', '', 'a removal of nothing is no removal'],
  ['src/team/routes.tsx', '  else if (read.md !== read.d) errors.unbalanced = { md: read.md, d: read.d }\n', '', 'opening balances with sides that differ are refused'],
  ['src/team/routes.tsx', '        extra.values ? null : bookingLines(doc, company,', '        true ? null : bookingLines(doc, company,', 'the booking form shows the entry as the books hold it'],
  ['src/app/export.ts', '  const hasBooks = books.entries.some((e) => e.on.startsWith(`${year}-`))', '  const hasBooks = false', "the year's download holds the books"],
  ['src/app/purge.ts', "    db.prepare('DELETE FROM ledger_entries WHERE company_id = ?').bind(companyId),\n", '', 'the books go with the company'],
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
