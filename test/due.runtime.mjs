// What is left to pay of a document apart from its total (29 October 2026, europio as client zero), in workerd's D1:
// kept on the document, paid by a payment order of what is left, paired with the payment of it, and a document paid
// whole by a credit set off asked of nobody. Every value invented.
import { check } from './check.mjs'
import { insertDocumentStatement, insertPaymentStatement, matchCompany, payables } from '../.wrangler/dist/stores.js'

export async function checkDueRuntime({ db }) {
  const ts = Math.floor(Date.now() / 1000)
  await db.batch([
    db.prepare("INSERT INTO companies (id, created_at, name, ico, plan, inbox, contract_at, start_on) VALUES ('due-co', ?, 'TEST ONLY Kredit s. r. o.', '99887755', 'start', 'due00001', ?, '2026-01-01')").bind(ts, ts),
    db.prepare("INSERT INTO accounts (id, company_id, iban, ledger) VALUES ('due-acct', 'due-co', 'SK3111000000002612340000', '221.001')"),
  ])
  const supplier = { party: 'TEST ONLY Cloud Ltd.', partyIco: null, partyIban: 'IE29AIBK93115212345678', vs: null, issuedOn: '2026-10-22', dueOn: '2026-10-22', vatCents: 0, currency: 'EUR' }
  const doc = (id, number, reading) =>
    insertDocumentStatement(db, { id, company: 'due-co', source: 'upload', addedBy: null, fileKey: null, fileType: null, fileName: null, fileBytes: null, fileHash: null, reading: { kind: 'invoice_in', ...supplier, number, ...reading }, readBy: 'test', status: 'read' })
  await db.batch([
    doc('due-part', 'IE-1', { totalCents: 9000, dueCents: 1419 }),
    doc('due-none', 'IE-2', { totalCents: 4490, dueCents: 0, issuedOn: '2026-11-03', dueOn: '2026-11-03' }),
    doc('due-whole', 'IE-3', { totalCents: 5000, issuedOn: '2026-11-04', dueOn: '2026-11-18' }),
  ])
  const kept = (await db.prepare("SELECT id, total_cents, due_cents FROM documents WHERE company_id = 'due-co' ORDER BY id").all()).results
  check('due: a document keeps its total and, apart, what is left to pay', JSON.stringify(kept.map((r) => [r.id, r.total_cents, r.due_cents])) === JSON.stringify([['due-none', 4490, 0], ['due-part', 9000, 1419], ['due-whole', 5000, null]]), JSON.stringify(kept))
  let owed = await payables(db, 'due-co')
  check(
    'due: a payment order pays what is left, and a document paid whole by a credit is not offered',
    owed.length === 2 && owed.find((p) => p.id === 'due-part')?.totalCents === 1419 && owed.find((p) => p.id === 'due-whole')?.totalCents === 5000 && !owed.some((p) => p.id === 'due-none'),
    JSON.stringify(owed.map((p) => [p.id, p.totalCents])),
  )
  await db.batch([
    insertPaymentStatement(db, 'due-co', 'due-acct', { bookedOn: '2026-10-23', amountCents: -1419, currency: 'EUR', party: 'TEST ONLY CLOUD LTD', partyIban: 'IE29AIBK93115212345678', vs: null, ss: null, ks: null, note: null, card: false, ref: 'due-1' }, null),
  ])
  const paired = await matchCompany(db, 'due-co')
  const link = await db.prepare("SELECT l.document_id AS doc FROM links l JOIN payments p ON p.id = l.payment_id WHERE p.company_id = 'due-co' AND p.ref = 'due-1'").first()
  owed = await payables(db, 'due-co')
  check('due: the payment of what was left pairs with its document by itself, which is then owed no more', paired === 1 && link?.doc === 'due-part' && !owed.some((p) => p.id === 'due-part'), JSON.stringify({ paired, link }))
}
