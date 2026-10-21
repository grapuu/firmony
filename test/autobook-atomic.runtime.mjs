// Exercise the actual SQL in workerd/D1. A concurrent edit runs after all checks, immediately before the write.
import { autoBook } from '../.wrangler/dist/stores.js'
import { check } from './check.mjs'

export async function checkAutobookAtomic({ db, nowS, day }) {
  const actor = 'autobook-atomic-accountant'
  await db.prepare("INSERT INTO users (id, created_at, email, name, team) VALUES (?, ?, 'autobook-atomic@example.invalid', 'TEST-ONLY Účtovníčka', 'accountant')").bind(actor, nowS).run()
  const seed = async (name, count = 1, stamp = nowS, issued = day(-1)) => {
    const company = `co-atomic-${name}`
    const docs = Array.from({ length: count }, (_, i) => `${company}-doc-${i}`)
    const payments = docs.map((id) => `${id}-payment`)
    await db.batch([
      db.prepare(`INSERT INTO companies (id,created_at,name,ico,vat_payer,vat_since,plan,inbox,start_on,autobook)
        VALUES (?,?,'TEST-ONLY Automatika s. r. o.','50888882',1,'2026-01-01','rast',?,'2026-01-01',1)`).bind(company, stamp, company),
      db.prepare('INSERT INTO accounts (id,company_id,iban) VALUES (?,?,?)').bind(`${company}-account`, company, 'SK3112000000198742637599'),
      db.prepare(`INSERT INTO supplier_rules (company_id,key,name,category,vat_deduct,uses,updated_at,updated_by)
        VALUES (?,'ico:36000001','TEST-ONLY Hosting s. r. o.','services',1,2,?,?)`).bind(company, nowS, actor),
      ...docs.flatMap((id, i) => [
        db.prepare(`INSERT INTO documents (id,company_id,created_at,source,status,read_by,kind,party,party_ico,party_vat_id,
          number,issued_on,due_on,total_cents,vat_cents,currency,category,proposal,vat_deduct)
          VALUES (?,?,?,'upload','read','claude-haiku-5-5','invoice_in','TEST-ONLY Hosting s. r. o.','36000001','SK2020000001',
          ?,?,?,?,?,'EUR','services','rule',1)`).bind(id, company, stamp + i, `TEST-${name}-${i}`, issued, day(5), 12300 + i * 6150, 2300 + i * 1150),
        db.prepare(`INSERT INTO payments (id,company_id,account_id,created_at,booked_on,amount_cents,currency,ref)
          VALUES (?,?,?,?,?,?,'EUR',?)`).bind(payments[i], company, `${company}-account`, stamp, day(-1), -(12300 + i * 6150), payments[i]),
        db.prepare("INSERT INTO links (document_id,payment_id,company_id,how,created_at) VALUES (?,?,?,'auto',?)").bind(id, payments[i], company, stamp),
      ]),
    ])
    return { company, docs, payments }
  }
  const state = async (id) => db.prepare(`SELECT booked_at,booked_by,vat_cents,
    (SELECT COUNT(*) FROM events e WHERE e.subject=d.id AND e.action='document.autobooked') AS events
    FROM documents d WHERE d.id=?`).bind(id).first()
  const beforeWrite = (change) => {
    let called = false
    return {
      prepare: (sql) => db.prepare(sql),
      batch: async (statements) => {
        if (!called) { called = true; await change() }
        return db.batch(statements)
      },
    }
  }
  const stop = (company) => db.prepare('UPDATE companies SET autobook=0 WHERE id=?').bind(company).run()
  const fileReturn = (company) => db.prepare(`INSERT INTO vat_returns (company_id,period,filed_at,filed_on,rows,due_on)
    VALUES (?,?,?,?,'{}',?)`).bind(company, day(-35).slice(0,7), nowS, day(-1), day(5)).run()

  const healthy = await seed('healthy', 2)
  const healthyCount = await autoBook(db, healthy.company)
  const healthyRows = await Promise.all(healthy.docs.map(state))
  check('atomic booking: two unchanged documents are booked once each in the same run', healthyCount === 2 && healthyRows.every((r) => r.booked_by === 'auto' && r.events === 1))
  await stop(healthy.company)

  const cases = [
    ['vat', 'VAT edited after checking', (s) => db.prepare('UPDATE documents SET vat_cents=1150 WHERE id=?').bind(s.docs[0]).run()],
    ['payment', 'payment amount edited after checking', (s) => db.prepare('UPDATE payments SET amount_cents=-12200 WHERE id=?').bind(s.payments[0]).run()],
    ['rule', 'supplier rule removed after checking', (s) => db.prepare('DELETE FROM supplier_rules WHERE company_id=?').bind(s.company).run()],
    ['person', 'document taken over by a person after checking', (s) => db.prepare("UPDATE documents SET read_by='person: TEST-ONLY' WHERE id=?").bind(s.docs[0]).run()],
    ['date', 'document date edited after checking', (s) => db.prepare('UPDATE documents SET issued_on=? WHERE id=?').bind(day(1), s.docs[0]).run()],
    ['registration', 'company VAT settings edited after checking', (s) => db.prepare('UPDATE companies SET vat_payer=0 WHERE id=?').bind(s.company).run()],
    ['filed', 'VAT return filed after checking', (s) => fileReturn(s.company)],
    ['off', 'accountant turns automation off after checking', (s) => stop(s.company)],
    ['shared', 'another document shares the payment after checking', (s) => db.batch([
      db.prepare("INSERT INTO documents (id,company_id,created_at,source,status,kind) VALUES (?,?,?,'upload','read','other')").bind(`${s.company}-extra`, s.company, nowS),
      db.prepare("INSERT INTO links (document_id,payment_id,company_id,how,created_at) VALUES (?,?,?,'manual',?)").bind(`${s.company}-extra`, s.payments[0], s.company, nowS),
    ])],
  ]
  for (const [name, label, change] of cases) {
    const s = name === 'filed' ? await seed(name, 1, nowS - 35 * 86400, day(-35)) : await seed(name)
    const count = await autoBook(beforeWrite(() => change(s)), s.company)
    const row = await state(s.docs[0])
    check(`atomic booking: ${label} leaves the document unbooked, with no booking event`, count === 0 && row.booked_at === null && row.events === 0, JSON.stringify(row))
    if (name === 'vat') check('atomic booking: the concurrent VAT correction is preserved', row.vat_cents === 1150)
    if (name === 'payment') {
      await db.prepare('UPDATE payments SET amount_cents=-12300 WHERE id=?').bind(s.payments[0]).run()
      check('atomic booking: a later run can book a stable corrected document', await autoBook(db, s.company) === 1)
    }
    await stop(s.company)
  }

  const changed = await seed('between-documents', 2)
  let batches = 0
  const edited = {
    prepare: (sql) => db.prepare(sql),
    batch: async (statements) => {
      const result = await db.batch(statements)
      if (++batches === 1) await db.prepare('UPDATE companies SET start_on=? WHERE id=?').bind(day(0), changed.company).run()
      return result
    },
  }
  const changedCount = await autoBook(edited, changed.company)
  check('atomic booking: company settings changed between documents invalidate the cached check', changedCount === 1 && (await state(changed.docs[1])).booked_at === null)
  await stop(changed.company)

  // Both originals were already received in the finished month before its return was filed.
  const filed = await seed('filed-between-documents', 2, nowS - 35 * 86400, day(-35))
  let filedBatches = 0
  const filing = {
    prepare: (sql) => db.prepare(sql),
    batch: async (statements) => {
      const result = await db.batch(statements)
      if (++filedBatches === 1) await fileReturn(filed.company)
      return result
    },
  }
  const filedCount = await autoBook(filing, filed.company)
  const filedRow = await state(filed.docs[1])
  check('atomic booking: a return filed between documents invalidates the cached period check', filedCount === 1 && filedRow.booked_at === null, JSON.stringify({ count: filedCount, row: filedRow }))
  await stop(filed.company)

  const concurrent = await seed('concurrent')
  const originalNow = Date.now
  const waiting = []
  const timeout = setTimeout(() => waiting.forEach((w) => w.reject(new Error('TEST-ONLY concurrent booking barrier timed out'))), 10000)
  const competing = {
    prepare: (sql) => db.prepare(sql),
    batch: (statements) => new Promise((resolve, reject) => {
      waiting.push({ statements, resolve, reject })
      if (waiting.length === 2) void (async () => {
        for (const w of waiting) {
          try { w.resolve(await db.batch(w.statements)) } catch (error) { w.reject(error) }
        }
      })()
    }),
  }
  try {
    Date.now = () => nowS * 1000
    const counts = await Promise.all([autoBook(competing, concurrent.company), autoBook(competing, concurrent.company)])
    const row = await state(concurrent.docs[0])
    check('atomic booking: two same-second workers record exactly one booking and one event', waiting.length === 2 && counts.reduce((sum, n) => sum + n, 0) === 1 && row.events === 1, JSON.stringify({ counts, row }))
  } finally { Date.now = originalNow; clearTimeout(timeout) }
  await stop(concurrent.company)

  const rollback = await seed('audit-rollback')
  await db.prepare(`CREATE TRIGGER test_autobook_audit_failure BEFORE INSERT ON events
    WHEN NEW.company_id='co-atomic-audit-rollback' AND NEW.action='document.autobooked'
    BEGIN SELECT RAISE(ABORT,'TEST-ONLY audit failure'); END`).run()
  try {
    const count = await autoBook(db, rollback.company)
    const row = await state(rollback.docs[0])
    check('atomic booking: failed audit insertion rolls the booking back', count === 0 && row.booked_at === null && row.events === 0)
  } finally { await db.prepare('DROP TRIGGER test_autobook_audit_failure').run() }
  await stop(rollback.company)

  const first = await seed('schedule-first')
  const second = await seed('schedule-second', 1, nowS + 1)
  const scheduledCount = await autoBook(beforeWrite(() => stop(first.company)), null, 2)
  check('atomic booking: a stale client does not stop another client in the same scheduled run', scheduledCount === 1 && (await state(first.docs[0])).booked_at === null && (await state(second.docs[0])).events === 1)
  await stop(second.company)
}
