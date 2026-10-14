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
  // What an emailed statement has to show before it touches the books (statements.ts)
  [
    'src/app/statements.ts',
    "  if (!account) return trusted ? { status: 'taken' } : { status: 'confirm' }",
    "  if (!account) return { status: 'taken' }",
    'an account the company does not have waits for the owner',
  ],
  ['src/app/statements.ts', "  if (trusted) return { status: 'taken' }\n", '', 'a member who adds it on a page is trusted'],
  ['src/app/statements.ts', "  if (s.entries.every((e) => known.has(e.ref))) return { status: 'known' }\n", '', 'the same movements again are nothing new'],
  ['src/app/statements.ts', '  if (sum !== s.closing.cents) return', '  if (false) return', 'figures that do not add up wait'],
  ['src/app/statements.ts', "return { status: 'held', reason: { kind: 'unknown', opening: s.opening.cents } }", "return { status: 'taken' }", 'an account whose balance we do not know waits'],
  ['src/app/statements.ts', '  if (starts < account.balanceOn) return', '  if (false) return', 'days the books already have wait'],
  [
    'src/app/statements.ts',
    "  return s.opening.cents === account.balanceCents ? { status: 'taken' } :",
    "  return true ? { status: 'taken' } :",
    'a statement that does not follow the last one waits',
  ],
  ['src/app/statements.ts', "  const trusted = by.source === 'upload' && by.user !== null", '  const trusted = by.user !== null || true', 'an emailed statement is not trusted'],
  ['src/app/statements.ts', '  if ((seen?.n ?? 0) > 0) {', '  if (false) {', 'the same file twice is taken once'],
  [
    'src/app/statements.ts',
    "    const verdict = taken === 0 ? ({ status: 'taken' } as Verdict) : verdictOf(",
    "    const verdict = true ? ({ status: 'taken' } as Verdict) : verdictOf(",
    'after the yes the next ones still have to follow',
  ],
  ['src/app/statements.ts', "      if (verdict.status === 'held') rings.push(...(await ringFor(db, company, 'held', row.id, origin)))\n", '', 'the accountant is told of one that waits after the yes'],
  ['src/app/statements.ts', '  if (!take_) {', '  if (false) {', 'the accountant can refuse a statement'],
  ['src/app/statements.ts', "WHERE m.company_id = ? AND m.role = 'owner'\")", 'WHERE m.company_id = ?")', 'only the owners are asked about an account'],
  ['src/app/statements.ts', "  const due = rows.results.some((a) => a.source !== 'email' && (", '  const due = rows.results.some((a) => (', 'statements the bank sends are not asked for'],
  ['src/app/statements.ts', "\n          AND NOT EXISTS (SELECT 1 FROM bank_links l WHERE l.id = a.link_id AND l.status = 'active')", '', 'an account a link reads is not asked for'],
  [
    'src/app/statements.ts',
    'SELECT ${COLUMNS} FROM statements WHERE id = ? AND company_id = ?`).bind(id, company)',
    'SELECT ${COLUMNS} FROM statements WHERE id = ? AND (company_id = ? OR 1)`).bind(id, company)',
    "a statement's file is its company's alone",
  ],
  // Rung at once, on the 3rd once a month
  ['src/app/inbox.ts', '  if (kept.statements.confirm + kept.statements.held > 0) later(flushOutbox(db, env.EMAIL))\n', '', 'a statement that waits rings at once'],
  ['src/app/remind.ts', '  if (b.date !== STATEMENT_DAY || b.hour !== 9 || b.minute >= 15) return 0', '  if (b.hour !== 9 || b.minute >= 15) return 0', 'the statement is asked for on the 3rd'],
  [
    'src/app/remind.ts',
    "ringStatement(db, 'remind-statement', month, person.email, ring)",
    "ringStatement(db, 'remind-statement', String(Date.now()), person.email, ring)",
    'the statement is asked for once',
  ],
  // Where a statement goes, and who may answer
  [
    'src/app/intake.ts',
    "    if (file.kind === 'xml') {\n      const taken = await takeStatementFile",
    '    if (false) {\n      const taken = await takeStatementFile',
    'a statement among documents goes to the bank',
  ],
  ['src/app/routes.tsx', "w.id === body.banka && w.way === 'monthly')", "w.id === body.banka && w.way === 'never')", 'a bank of once a month is remembered'],
  [
    'src/app/routes.tsx',
    "  if (who.role !== 'owner') return bankPage(c, t.bank.onlyOwner, 403)\n  const id = c.req.param('id')\n  const body = await c.req.parseBody()\n  const done = ID.test(id) ? await answerAccount",
    "  const id = c.req.param('id')\n  const body = await c.req.parseBody()\n  const done = ID.test(id) ? await answerAccount",
    'only an owner answers about an account',
  ],
  ['src/views/bank.tsx', '    {owner ? (\n      <form class="stmtconfirm__actions"', '    {true ? (\n      <form class="stmtconfirm__actions"', 'a member is shown no answers'],
  ['src/app/export.ts', "    if (statementList.length > 0) yield { name: 'vypisy.csv', when: at, data: text(statementsCsv) }\n", '', "the year's download holds the statements"],
  ['src/app/purge.ts', "    db.prepare('DELETE FROM statements WHERE company_id = ?').bind(companyId),\n", '', 'the statements go with the company'],
  // Fio banka (fio.ts) and its 30 seconds
  ['src/app/fio.ts', "  if (res.status === 409) throw new FioError(409, 'soon')\n", '', 'too soon is said so'],
  ['src/app/fio.ts', "    const ended = fio?.kind === 'token'", '    const ended = false', 'a token Fio no longer takes ends the link'],
  ['src/app/fio.ts', '${String(98 - rest)', '${String(97 - rest)', 'the IBAN of an account number'],
  ['src/app/fio.ts', '  const card = /kart/i.test(kind)', '  const card = false', 'a card payment of Fio is one'],
  ['src/app/fio.ts', 'args.token, now())\n', 'args.token, null)\n', 'the first read counts against the 30 seconds'],
  [
    'src/app/routes.tsx',
    "  if (link.kind === 'fio' && link.tried_at !== null && now() - link.tried_at < FIO.minSeconds) return c.redirect('/app/banka?ok=fio-skoro', 303)\n",
    '',
    'Fio is not asked again within 30 seconds',
  ],
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
