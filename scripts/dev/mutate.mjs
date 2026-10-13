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
  ['src/app/invoices.ts', '    const rate = vatPayer ? line.vatRate : 0', '    const rate = line.vatRate', 'a company that is no VAT payer adds no VAT'],
  ['src/app/invoices.ts', '  return rest === 1\n', '  return true\n', 'an IBAN with a typo is refused'],
  ['src/app/invoices.ts', "WHERE i.token = ? AND i.status = 'issued'", 'WHERE i.token = ?', "a draft's link opens nothing"],
  ['src/app/invoices.ts', 'FROM invoices WHERE company_id = ?2 AND year = ?6) AS next', 'FROM invoices WHERE year = ?6) AS next', 'every company numbers its own invoices'],
  ['src/app/invoices.ts', "printf('%d%04d', ?6, next.seq)", "printf('%d%04d', ?6, 1)", 'the next invoice takes the next number'],
  ['src/app/invoices.ts', 'WHERE i.company_id = ? AND i.id = ?', 'WHERE (i.company_id = ? OR 1) AND i.id = ?', "another company's invoice is never seen or copied"],
  ['src/app/invoices.ts', '  const vatId = (icdph: string | null) => (seller.vatPayer ? icdph : null)', '  const vatId = (icdph: string | null) => icdph', 'a seller who is no VAT payer writes no VAT identifier'],
  ['src/app/invoices.ts', "(rate > 0 ? 'S' : 'E')", "(rate > 0 ? 'S' : 'Z')", 'a supply at nought is exempt'],
  ['src/app/invoices.ts', '(line.unitCents < 0 ? -line.quantityMilli : line.quantityMilli) / 1000', 'line.quantityMilli / 1000', 'a discount keeps its price positive'],
  ['src/app/paybysquare.ts', '          amount: order.amountCents / 100,', '          amount: order.amountCents,', 'the QR code pays the amount in euros'],
  ['src/app/routes.tsx', "  if (draft.status !== 'draft') return c.redirect(`/app/faktury/${id}`, 303)\n", '', 'an issued invoice is never changed'],
  ['src/app/routes.tsx', '  if (reminder && invoice.paidOn) return c.redirect(`/app/faktury/${invoice.id}`, 303)\n', '', 'a paid invoice is never reminded'],
  ['src/app/routes.tsx', '      replyTo: who.user.email,\n', '', 'a reply goes to whoever sent the invoice'],
  ['src/app/routes.tsx', '    if (seen.has(key)) continue\n', '', 'the customers of earlier invoices, each once'],
  ['src/app/routes.tsx', '    if (like) {\n      values.note', '    if (true) {\n      values.note', 'a customer of an earlier invoice comes without its lines'],
  ['src/app/routes.tsx', '    if (!EMAIL.test(typed)) return invoicePage(c, id, { error: ti.actions.badEmail }, 422)\n', '', 'a typed email that is none is refused'],
  ['src/views/invoices.tsx', '<InvoiceSheet invoice={invoice} lines={lines} seller={seller} pay={!invoice.paidOn} />', '<InvoiceSheet invoice={invoice} lines={lines} seller={seller} />', 'a paid invoice carries no QR code to pay it twice'],
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
