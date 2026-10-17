// Transactional period locks exercised through HTTP and direct D1 writes. No external services.
import { check } from './check.mjs'
import { writeFileSync } from 'node:fs'
import {
  booksOf,
  changeLockStatement,
  periodLock,
  lockHistory,
  dataRevision,
  companyOf,
  importEntries,
  linkStatement,
  matchCompany,
  exportYear,
  exportYears,
  beginExport,
  completeExport,
  confirmExport,
  purgeCompany,
  localDaySql,
  keepFilesFor,
} from '../.wrangler/dist/stores.js'

export async function checkPeriodLocks({ db, acc, admin, anna, nowS, lucia, today, files, unzip, text }) {
  const y = Number(today.slice(0, 4)) - 1,
    month = `${y}-09`,
    end = `${month}-30`
  const path = '/ucto/klienti/co-lock/kniha/obdobia'
  const co = async () => companyOf(await db.prepare("SELECT * FROM companies WHERE id = 'co-lock'").first())
  const history = () => lockHistory(db, 'co-lock')
  const fresh = async () => {
    const response = await acc.get(path),
      html = await response.text()
    return { revizia: html.match(/name="revizia" value="(\d+)"/)?.[1] ?? '-1', verzia: html.match(/name="verzia" value="(\d+)"/)?.[1] ?? '-1' }
  }
  const submit = async (fields, expected) =>
    acc.post(path, { ...(expected ?? (await fresh())), akcia: 'lock', mesiac: month, dovod: `Kontrola všetkých zápisov ${'x'.repeat(300)}`, ...fields })
  const reject = async (name, sql, bindings = []) => {
    let refused = false
    try {
      await db
        .prepare(sql)
        .bind(...bindings)
        .run()
    } catch (error) {
      refused = String(error).includes('FIRMONY_PERIOD_LOCKED')
    }
    check(name, refused)
  }
  await db.batch([
    db
      .prepare(
        "INSERT INTO companies (id, created_at, name, ico, vat_payer, plan, inbox, accountant_id, start_on) VALUES ('co-lock', ?, 'Uzamknutá s. r. o.', '50999988', 1, 'rast', 'locks001', ?, ?)",
      )
      .bind(nowS, lucia.id, `${y}-01-01`),
    db.prepare("INSERT INTO accounts (id, company_id, iban, ledger) VALUES ('al-lock', 'co-lock', 'SK6809000000000999988888', '221.001')"),
    db
      .prepare(
        "INSERT INTO payments (id, company_id, account_id, created_at, booked_on, amount_cents, ref, exempt) VALUES ('pl-lock', 'co-lock', 'al-lock', ?, ?, -12300, 'locked-invoice', NULL), ('pl-fee-lock', 'co-lock', 'al-lock', ?, ?, -200, 'locked-fee', 'bank'), ('pl-cross-lock', 'co-lock', 'al-lock', ?, ?, -1000, 'future-payment', NULL)",
      )
      .bind(nowS, `${month}-13`, nowS, `${month}-14`, nowS, `${y}-10-05`),
    db
      .prepare(
        "INSERT INTO documents (id, company_id, created_at, source, status, kind, number, issued_on, total_cents, vat_cents, category, currency, booked_at) VALUES ('dl-lock', 'co-lock', ?, 'upload', 'read', 'invoice_in', 'LOCK-1', ?, 12300, 2300, 'services', 'EUR', ?), ('dl-cross-lock', 'co-lock', ?, 'upload', 'read', 'receipt', 'LOCK-2', ?, 1000, 0, 'services', 'EUR', ?), ('dl-future-lock', 'co-lock', ?, 'upload', 'read', 'invoice_in', 'FUTURE-1', ?, 500, 0, 'services', 'EUR', NULL)",
      )
      .bind(nowS, `${month}-12`, nowS, nowS, `${month}-15`, nowS, nowS, `${y}-10-10`),
    db
      .prepare(
        "INSERT INTO links (company_id, payment_id, document_id, how, created_at) VALUES ('co-lock', 'pl-lock', 'dl-lock', 'accountant', ?), ('co-lock', 'pl-cross-lock', 'dl-cross-lock', 'accountant', ?)",
      )
      .bind(nowS, nowS),
    db
      .prepare(
        "INSERT INTO ledger_entries (id, company_id, kind, year, seq, number, on_date, text, lines, created_at) VALUES ('el-lock', 'co-lock', 'internal', ?, 1, 'ID-LOCK', ?, 'Kontrola', '[{\"md\":\"548\",\"d\":\"325\",\"cents\":10}]', ?), ('el-aug-lock', 'co-lock', 'internal', ?, 2, 'ID-AUG', ?, 'August', '[{\"md\":\"548\",\"d\":\"325\",\"cents\":10}]', ?)",
      )
      .bind(y, end, nowS, y, `${y}-08-31`, nowS),
    db.prepare("INSERT INTO payroll_runs (company_id, period, lines, closed_at, closed_on) VALUES ('co-lock', ?, '[]', ?, ?)").bind(month, nowS, today),
    db
      .prepare("INSERT INTO vat_returns (company_id, period, filed_at, filed_on, rows, due_on) VALUES ('co-lock', ?, ?, ?, '{}', ?)")
      .bind(month, nowS, today, `${y}-10-25`),
    db.prepare("INSERT INTO filings (company_id, kind, period, filed_on, filed_at, data) VALUES ('co-lock', 'sv', ?, ?, ?, '{}')").bind(month, today, nowS),
    db
      .prepare(
        "INSERT INTO invoices (id, company_id, created_at, status, number, customer_name, issued_on, delivered_on, due_on, base_cents, vat_cents, total_cents, token) VALUES ('il-lock', 'co-lock', ?, 'issued', 'LOCK-OUT', 'Odberateľ', ?, ?, ?, 1000, 0, 1000, 'lock-invoice-token')",
      )
      .bind(nowS, `${month}-16`, `${month}-16`, `${month}-30`),
    db.prepare(
      "INSERT INTO invoice_lines (invoice_id, position, description, quantity_milli, unit_cents, vat_rate, base_cents) VALUES ('il-lock', 0, 'Služba', 1000, 1000, 0, 1000)",
    ),
  ])
  let res = await acc.get(path),
    page = await res.text()
  check(
    'the assigned accountant can manage periods from the ledger navigation',
    res.status === 200 && page.includes('Uzamknutie období') && page.includes('name="revizia"'),
  )
  if (process.env.FIRMONY_CAPTURE_DIR) writeFileSync(`${process.env.FIRMONY_CAPTURE_DIR}/period-open.html`, page)
  res = await anna.get(path)
  check('a client cannot manage period locks', res.status === 404)
  res = await acc.get('/ucto/klienti/co-b/kniha/obdobia')
  check('an accountant cannot see another accountant’s locks', res.status === 404)
  res = await admin.get(path)
  check('an administrator can manage every company’s locks', res.status === 200)
  // A genuinely incomplete source must be resolved, rather than buried by a lock.
  await db
    .prepare("INSERT INTO documents (id, company_id, created_at, source, status, issued_on) VALUES ('dl-pending-lock', 'co-lock', ?, 'upload', 'manual', ?)")
    .bind(nowS, `${month}-20`)
    .run()
  res = await submit({})
  check(
    'known unfinished documents block closing and explain what to resolve',
    res.status === 422 && (await res.text()).includes('Doklady: 1') && (await periodLock(db, 'co-lock')) === null,
  )
  await db.prepare("DELETE FROM documents WHERE id = 'dl-pending-lock'").run()
  const staleData = await fresh()
  await db.prepare("UPDATE accounts SET balance_cents = -12500 WHERE id = 'al-lock'").run()
  res = await submit({}, staleData)
  check('a change after the displayed readiness rejects a stale lock and writes no history', res.status === 409 && (await history()).length === 0)
  const initialForm = await fresh()
  res = await submit({}, initialForm)
  let state = await periodLock(db, 'co-lock')
  check(
    'locking saves the cutoff and exactly one durable transition',
    res.status === 303 && state?.through === end && state.version === 1 && (await history()).length === 1,
  )
  let storageRefused = false
  try {
    await changeLockStatement(db, 'co-lock', `${y}-08-31`, 'Oprava bez oprávnenia', 'u-a', 1, await dataRevision(db, 'co-lock')).run()
  } catch {
    storageRefused = true
  }
  check('storage rejects a client as the author of a lock change', storageRefused && (await history()).length === 1)
  storageRefused = false
  try {
    await changeLockStatement(db, 'co-lock', `${y}-08-31`, '', lucia.id, 1, await dataRevision(db, 'co-lock')).run()
  } catch {
    storageRefused = true
  }
  check('storage itself requires a reopening reason', storageRefused && (await periodLock(db, 'co-lock')).version === 1)
  res = await submit({ akcia: 'open', dovod: 'Oprava po kontrole účtov' }, initialForm)
  check('a stale tab cannot reopen a newer lock', res.status === 409 && (await history()).length === 1)
  res = await submit({ akcia: 'open', dovod: 'oprava' })
  check('opening without a meaningful reason is refused', res.status === 422 && (await history()).length === 1)
  res = await acc.get(path)
  page = await res.text()
  if (process.env.FIRMONY_CAPTURE_DIR) writeFileSync(`${process.env.FIRMONY_CAPTURE_DIR}/period-locked.html`, page)
  check(
    'the locked page includes separate controls and the actor’s history',
    page.includes('id="otvorit-mesiac"') && page.includes('Lucia') && page.includes('Kontrola všetkých zápisov'),
  )
  const before = JSON.stringify((await booksOf(db, await co())).entries.filter((e) => e.on <= end))
  await reject('a booked locked document cannot be edited', "UPDATE documents SET total_cents = 13000 WHERE id = 'dl-lock'")
  await reject('moving a locked document into an open month cannot bypass its original date', "UPDATE documents SET issued_on = ? WHERE id = 'dl-lock'", [
    `${y}-10-12`,
  ])
  await reject('a locked document cannot be unbooked', "UPDATE documents SET booked_at = NULL WHERE id = 'dl-lock'")
  await reject('a locked document cannot be removed directly', "DELETE FROM documents WHERE id = 'dl-lock'")
  await reject('a locked payment cannot be reclassified', "UPDATE payments SET contra = '513' WHERE id = 'pl-fee-lock'")
  await reject('a locked payment cannot be deleted', "DELETE FROM payments WHERE id = 'pl-fee-lock'")
  await reject('moving a payment out of its locked date cannot bypass the cutoff', "UPDATE payments SET booked_on = ? WHERE id = 'pl-fee-lock'", [`${y}-10-14`])
  await reject('a future payment remains protected when it changes a locked receipt', "UPDATE payments SET amount_cents = -900 WHERE id = 'pl-cross-lock'")
  await reject('unlinking would change a locked entry and is blocked', "DELETE FROM links WHERE document_id = 'dl-lock'")
  await reject(
    'another document cannot change allocation of a locked payment',
    "INSERT INTO links (document_id, payment_id, company_id, how, created_at) VALUES ('dl-future-lock', 'pl-lock', 'co-lock', 'client', ?)",
    [nowS],
  )
  await reject(
    'another receipt cannot change a payment shared with a locked document',
    "INSERT INTO links (document_id, payment_id, company_id, how, created_at) VALUES ('dl-future-lock', 'pl-cross-lock', 'co-lock', 'client', ?)",
    [nowS],
  )
  await reject('the bank ledger cannot be renumbered under a lock', "UPDATE accounts SET ledger = '221.002' WHERE id = 'al-lock'")
  await reject('an accounting bank account cannot be removed under a lock', "DELETE FROM accounts WHERE id = 'al-lock'")
  await reject('VAT settings cannot recalculate locked books', "UPDATE companies SET vat_payer = 0 WHERE id = 'co-lock'")
  await reject('the beginning of the books cannot be moved past locked entries', "UPDATE companies SET start_on = ? WHERE id = 'co-lock'", [`${y}-10-01`])
  await reject(
    'a future opening balance cannot hide earlier locked entries',
    "INSERT INTO ledger_entries (id, company_id, kind, year, on_date, text, lines, created_at) VALUES ('el-future-opening', 'co-lock', 'opening', ?, ?, 'PS', '[]', ?)",
    [y, `${y}-10-01`, nowS],
  )
  await reject('a locked internal document cannot be soft-deleted', "UPDATE ledger_entries SET deleted_at = ? WHERE id = 'el-lock'", [nowS])
  await reject(
    'new entries cannot be backdated into the lock',
    "INSERT INTO ledger_entries (id, company_id, kind, year, on_date, text, lines, created_at) VALUES ('el-late-lock', 'co-lock', 'internal', ?, ?, 'Neskorý', '[]', ?)",
    [y, end, nowS],
  )
  await reject('a locked payroll cannot be reopened or recomputed', "UPDATE payroll_runs SET closed_at = NULL WHERE company_id = 'co-lock' AND period = ?", [
    month,
  ])
  await reject('a locked VAT return cannot be overwritten', "UPDATE vat_returns SET rows = '{\"17\":999}' WHERE company_id = 'co-lock'")
  await reject('a locked summary filing cannot be unmarked', "DELETE FROM filings WHERE company_id = 'co-lock' AND kind = 'sv'")
  await reject(
    'a later supplementary return cannot introduce an entry dated in a locked month',
    "INSERT INTO vat_returns (company_id, period, filed_at, filed_on, rows, due_on, kind) VALUES ('co-lock', ?, ?, ?, '{}', ?, 'D')",
    [`${y}-10`, nowS, end, today],
  )
  await reject(
    'a nested prior VAT correction is also checked for locked posting dates',
    "INSERT INTO vat_returns (company_id, period, filed_at, filed_on, rows, due_on, prev) VALUES ('co-lock', ?, ?, ?, '{}', ?, ?)",
    [`${y}-10`, nowS, today, today, JSON.stringify({ filedOn: end, kind: 'D' })],
  )
  await reject('issued invoices in a locked month cannot change', "UPDATE invoices SET total_cents = 2000 WHERE id = 'il-lock'")
  await reject('issued invoice lines are protected as well', "UPDATE invoice_lines SET description = 'Iná služba' WHERE invoice_id = 'il-lock'")
  // Allowed operational metadata and open-period work.
  await db.prepare("UPDATE payments SET checked_at = ? WHERE id = 'pl-fee-lock'").bind(nowS).run()
  await db.prepare("UPDATE accounts SET balance_cents = 10000, balance_on = ? WHERE id = 'al-lock'").bind(today).run()
  await db.prepare("UPDATE documents SET read_tries = read_tries + 1 WHERE id = 'dl-lock'").run()
  await db.prepare("UPDATE documents SET booked_at = ? WHERE id = 'dl-future-lock'").bind(nowS).run()
  await reject('an open booked document cannot be moved back into a locked month', "UPDATE documents SET supplied_on = ? WHERE id = 'dl-future-lock'", [end])
  check(
    'metadata and later accounting leave every locked journal entry identical',
    before === JSON.stringify((await booksOf(db, await co())).entries.filter((e) => e.on <= end)),
  )
  res = await acc.post('/ucto/klienti/co-lock/kniha/interne', { datum: `30. 9. ${y}`, text: 'Zápis do uzamknutého', md_0: '548', d_0: '325', suma_0: '1' })
  page = await res.text()
  check(
    'a rejected HTTP write gives a clear 409 without leaking SQLite or source SQL',
    res.status === 409 && page.includes('Účtovné obdobie je uzamknuté') && !page.includes('FIRMONY_PERIOD_LOCKED') && !page.includes('INSERT INTO'),
  )
  let uploaded = false,
    uploadRefused = false
  try {
    await keepFilesFor(
      {
        DB: db,
        FILES: {
          put: async () => {
            uploaded = true
          },
        },
      },
      await co(),
      { user: lucia.id, source: 'upload' },
      [{ name: 'neskory.pdf', kind: 'pdf', bytes: new TextEncoder().encode('%PDF-1.4\nlocked') }],
      'pl-lock',
    )
  } catch (error) {
    uploadRefused = String(error).includes('FIRMONY_PERIOD_LOCKED')
  }
  check('attaching to a locked payment is rejected before writing any file', uploadRefused && !uploaded)
  // Raw late imports are retained, without silently posting their guessed accounts or pairs.
  const late = {
    ref: 'late-bank-fee',
    bookedOn: `${month}-22`,
    amountCents: -99,
    currency: 'EUR',
    party: 'Dodávateľ test',
    partyIban: null,
    vs: '99123',
    ss: null,
    ks: null,
    note: 'Poplatok za vedenie účtu',
    card: true,
  }
  const imported = await importEntries(db, 'co-lock', 'al-lock', [late], 'statement')
  const latePayment = await db.prepare("SELECT * FROM payments WHERE ref = 'late-bank-fee'").first()
  check(
    'a late bank fact is kept but its automatic posting is held, with an accurate result count',
    imported.added === 1 && imported.exempt === 0 && latePayment.exempt === null,
  )
  await db
    .prepare(
      "INSERT INTO documents (id, company_id, created_at, source, status, kind, issued_on, total_cents, category, party, vs) VALUES ('dl-late-lock', 'co-lock', ?, 'upload', 'read', 'receipt', ?, 99, 'services', 'Dodávateľ test', '99123')",
    )
    .bind(nowS, `${month}-22`)
    .run()
  await db.prepare("UPDATE documents SET number = 'LATE' WHERE id = 'dl-late-lock'").run()
  let result = await linkStatement(db, 'co-lock', latePayment.id, 'dl-late-lock', 'auto', null, true).run()
  check('automatic matching skips locked sources without aborting document intake', result.meta.changes === 0)
  const paired = await matchCompany(db, 'co-lock')
  check(
    'the automatic matcher records no false event when a period lock skips the pair',
    paired === 0 && (await db.prepare("SELECT COUNT(*) AS n FROM events WHERE company_id = 'co-lock' AND action = 'link.auto'").first()).n === 0,
  )
  await reject('a late document cannot be posted until its period is reopened', "UPDATE documents SET booked_at = ? WHERE id = 'dl-late-lock'", [nowS])
  check(
    'receiving late facts leaves the locked journal unchanged',
    before === JSON.stringify((await booksOf(db, await co())).entries.filter((e) => e.on <= end)),
  )
  res = await submit({ mesiac: `${y}-10` })
  check('newly received incomplete accounting prevents extending the lock', res.status === 422 && (await history()).length === 1)
  // Revision guards are checked inside the storage write, not only in HTTP handlers.
  const current = await periodLock(db, 'co-lock'),
    revision = await dataRevision(db, 'co-lock')
  await db.prepare("UPDATE accounts SET balance_cents = 10001 WHERE id = 'al-lock'").run()
  result = await changeLockStatement(db, 'co-lock', `${y}-08-31`, 'Oprava účtovnej chyby', lucia.id, current.version, revision).run()
  check('a concurrent write between readiness and SQL prevents reopening atomically', result.meta.changes === 0 && (await history()).length === 1)
  res = await submit({ akcia: 'open', dovod: 'Oprava dokladu <script>alert(1)</script>' })
  state = await periodLock(db, 'co-lock')
  check(
    'partial reopening retains the previous months’ protection and exact reason',
    res.status === 303 && state.through === `${y}-08-31` && state.version === 2 && (await history())[0].reason.includes('<script>'),
  )
  await db.prepare("UPDATE ledger_entries SET text = 'Opravený september' WHERE id = 'el-lock'").run()
  await reject('August stays locked after September is reopened', "UPDATE ledger_entries SET text = 'Iný august' WHERE id = 'el-aug-lock'")
  res = await acc.get(path)
  page = await res.text()
  check('the saved reason is escaped when rendered', !page.includes('<script>alert(1)</script>') && page.includes('&lt;script&gt;'))
  let historyBlocked = false
  try {
    await db.prepare("DELETE FROM period_lock_history WHERE company_id = 'co-lock'").run()
  } catch {
    historyBlocked = true
  }
  check('transition history cannot be deleted during normal operation', historyBlocked && (await history()).length === 2)
  historyBlocked = false
  try {
    await db.prepare("UPDATE period_lock_history SET reason = 'prepísané' WHERE company_id = 'co-lock'").run()
  } catch {
    historyBlocked = true
  }
  check('saved history reasons cannot be overwritten', historyBlocked)
  historyBlocked = false
  try {
    await db.prepare("DELETE FROM period_locks WHERE company_id = 'co-lock'").run()
  } catch {
    historyBlocked = true
  }
  check('deleting the current lock cannot bypass the required reopening reason', historyBlocked)
  res = await submit({ akcia: 'open', mesiac: `${y}-01`, dovod: 'Kontrola počiatočných stavov a oprava' })
  check(
    'full reopening removes the active cutoff while keeping all three transitions',
    res.status === 303 && (await periodLock(db, 'co-lock')).through === null && (await history()).length === 3,
  )
  await db.prepare("UPDATE companies SET vat_payer = 0 WHERE id = 'co-lock'").run()
  check('configuration can change after complete reopening', (await co()).vatStatus === 'none')
  const archive = await exportYear({ DB: db }, await co(), String(y), null, today)
  const entries = unzip(new Uint8Array(await new Response(archive.body).arrayBuffer()))
  check(
    'the portable archive includes the complete lock state and transition history',
    JSON.parse(text(entries.find((e) => e.name === 'data/historia-uzamknutia.json'))).length === 3 &&
      JSON.parse(text(entries.find((e) => e.name === 'data/uzamknutie-obdobi.json')))[0].version === 3,
  )
  // SQL local day agrees with Bratislava at month ends and both daylight-saving boundaries.
  for (const iso of [
    '2026-01-31T22:30:00Z',
    '2026-01-31T23:30:00Z',
    '2026-03-29T00:59:59Z',
    '2026-03-29T01:00:00Z',
    '2026-07-31T22:30:00Z',
    '2026-10-25T00:59:59Z',
    '2026-10-25T01:00:00Z',
  ]) {
    const seconds = Date.parse(iso) / 1000
    const row = await db
      .prepare(`SELECT ${localDaySql('?1')} AS day`)
      .bind(seconds)
      .first()
    check(
      `SQL protection uses the Bratislava day at ${iso}`,
      row.day === new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Bratislava' }).format(new Date(iso)),
    )
  }
  // A lock must not make the already controlled handover/purge impossible.
  await db
    .prepare(
      "INSERT INTO companies (id, created_at, name, plan, inbox, accountant_id, start_on, ends_on) VALUES ('co-lock-purge', ?, 'Odovzdaná s. r. o.', 'start', 'lockspurge', ?, ?, ?)",
    )
    .bind(nowS, lucia.id, `${y}-01-01`, new Date(Date.parse(`${today}T12:00:00Z`) - 120 * 86_400_000).toISOString().slice(0, 10))
    .run()
  await changeLockStatement(db, 'co-lock-purge', end, 'Skontrolované pred odovzdaním', lucia.id, 0, await dataRevision(db, 'co-lock-purge')).run()
  for (const year of await exportYears(db, 'co-lock-purge')) {
    const receipt = await beginExport(db, 'co-lock-purge', year, lucia.id)
    await completeExport(db, receipt.id)
    await confirmExport(db, 'co-lock-purge', receipt.id)
  }
  const staged = await purgeCompany({ DB: db, FILES: files }, 'co-lock-purge', today)
  const frozen = await db.prepare("SELECT purge_started_at, purge_delete_started_at FROM companies WHERE id = 'co-lock-purge'").first()
  check('a confirmed handover first freezes writes without starting destructive deletion', staged.rows === 0 && frozen.purge_started_at !== null && frozen.purge_delete_started_at === null)
  await db.prepare("UPDATE companies SET purge_started_at = ? WHERE id = 'co-lock-purge'").bind(nowS - 86401).run()
  const purged = await purgeCompany({ DB: db, FILES: files }, 'co-lock-purge', today)
  check(
    'a confirmed handover can purge a locked company including its history',
    purged.rows > 0 && (await periodLock(db, 'co-lock-purge')) === null && (await lockHistory(db, 'co-lock-purge')).length === 0,
  )
  // A lock created after R2 upload but before the SQL batch rolls back the new document and removes its object.
  await db.batch([
    db
      .prepare(
        "INSERT INTO companies (id, created_at, name, plan, inbox, accountant_id, start_on) VALUES ('co-lock-upload', ?, 'Nahrávanie s. r. o.', 'start', 'locksupload', ?, ?)",
      )
      .bind(nowS, lucia.id, `${y}-01-01`),
    db.prepare("INSERT INTO accounts (id, company_id, iban, ledger) VALUES ('al-lock-upload', 'co-lock-upload', 'SK6809000000000999977777', '221.001')"),
    db
      .prepare(
        "INSERT INTO payments (id, company_id, account_id, created_at, booked_on, amount_cents, ref) VALUES ('pl-lock-upload', 'co-lock-upload', 'al-lock-upload', ?, ?, -100, 'upload-payment')",
      )
      .bind(nowS, end),
    db
      .prepare(
        "INSERT INTO documents (id, company_id, created_at, source, status, kind, issued_on, total_cents, category, booked_at) VALUES ('dl-lock-upload', 'co-lock-upload', ?, 'upload', 'read', 'invoice_in', ?, 100, 'services', ?)",
      )
      .bind(nowS, end, nowS),
    db
      .prepare(
        "INSERT INTO links (company_id, document_id, payment_id, how, created_at) VALUES ('co-lock-upload', 'dl-lock-upload', 'pl-lock-upload', 'accountant', ?)",
      )
      .bind(nowS),
  ])
  let newObject = null,
    raced = false
  const racingFiles = {
    async put(key, bytes, options) {
      newObject = key
      await files.put(key, bytes, options)
      await changeLockStatement(db, 'co-lock-upload', end, 'Kontrola počas nahrávania', lucia.id, 0, await dataRevision(db, 'co-lock-upload')).run()
    },
    delete: (keys) => files.delete(keys),
  }
  const uploadCompany = companyOf(await db.prepare("SELECT * FROM companies WHERE id = 'co-lock-upload'").first())
  try {
    await keepFilesFor(
      { DB: db, FILES: racingFiles },
      uploadCompany,
      { user: lucia.id, source: 'upload' },
      [{ name: 'race.pdf', kind: 'pdf', bytes: new TextEncoder().encode('%PDF-1.4\nlock upload race') }],
      'pl-lock-upload',
    )
  } catch (error) {
    raced = String(error).includes('FIRMONY_PERIOD_LOCKED')
  }
  check(
    'locking during upload rolls back the document and removes the orphan object',
    raced &&
      newObject &&
      (await files.head(newObject)) === null &&
      (await db.prepare("SELECT COUNT(*) AS n FROM documents WHERE company_id = 'co-lock-upload'").first()).n === 1,
  )
}
