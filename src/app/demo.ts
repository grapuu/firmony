// The sample company of the playground and of the preview: a young s. r. o. in its first months, with three card
// payments that still need a receipt, a few invoices that were paired by themselves, payments that need no
// document, and a short exchange with the accountant. Everything is dated from today, so it always looks current.
// It exists only where the Worker is told so (DEMO=1 on a developer's own machine: src/app/routes.tsx).
import { now } from '../db'
import { eventStatement, insertPaymentStatement, messageStatement } from './store'

export const DEMO = { company: 'demo-company', user: 'demo-user', email: 'ukazka@firmony.test', account: 'demo-account' } as const

function shift(today: string, days: number): string {
  const d = new Date(`${today}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

const at = (today: string, days: number, hour: number, minute: number) => Math.floor(Date.parse(`${shift(today, days)}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00+02:00`) / 1000)

export async function seedDemo(db: D1Database, today: string): Promise<void> {
  const exists = await db.prepare('SELECT 1 AS ok FROM companies WHERE id = ?').bind(DEMO.company).first()
  if (exists) return
  const ts = now()
  const c = DEMO.company
  const day = (n: number) => shift(today, n)
  const pay = (ref: string, n: number, cents: number, party: string | null, extra: { iban?: string; vs?: string; note?: string; card?: boolean; exempt?: string } = {}) =>
    insertPaymentStatement(
      db,
      c,
      DEMO.account,
      { ref, bookedOn: day(n), amountCents: cents, currency: 'EUR', party, partyIban: extra.iban ?? null, vs: extra.vs ?? null, ss: null, ks: null, note: extra.note ?? null, card: extra.card ?? false },
      extra.exempt ?? null,
    )
  const doc = (id: string, n: number, d: { source: string; kind: string; party: string; ico?: string; iban?: string; number?: string; vs?: string; issued: number; due?: number; total: number; vat?: number }) =>
    db
      .prepare(
        `INSERT INTO documents (id, company_id, created_at, source, added_by, status, read_by, kind, party, party_ico, party_iban, number, vs, issued_on, due_on, total_cents, vat_cents, currency)
         VALUES (?, ?, ?, ?, ?, 'read', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'EUR')`,
      )
      .bind(id, c, ts + n * 86400, d.source, d.source === 'upload' ? DEMO.user : null, d.source === 'einvoice' ? 'xml' : 'demo', d.kind, d.party, d.ico ?? null, d.iban ?? null, d.number ?? null, d.vs ?? null, day(d.issued), d.due === undefined ? null : day(d.due), d.total, d.vat ?? null)
  const link = (docId: string, paymentRef: string, how: string) =>
    db
      .prepare(`INSERT INTO links (document_id, payment_id, company_id, how, by, created_at) SELECT ?, id, company_id, ?, ?, ? FROM payments WHERE account_id = ? AND ref = ?`)
      .bind(docId, how, how === 'client' ? DEMO.user : null, ts, DEMO.account, paymentRef)

  await db.batch([
    db.prepare('INSERT INTO companies (id, created_at, name, ico, vat_payer, plan, inbox, accountant, demo) VALUES (?, ?, ?, NULL, 1, ?, ?, NULL, 1)').bind(c, ts, 'Ukážková firma s. r. o.', 'rast', 'k7m2qx'),
    db.prepare('INSERT INTO users (id, created_at, email, name) VALUES (?, ?, ?, ?)').bind(DEMO.user, ts, DEMO.email, 'Martin Novák'),
    db.prepare("INSERT INTO members (company_id, user_id, role, created_at) VALUES (?, ?, 'owner', ?)").bind(c, DEMO.user, ts),
    db.prepare('INSERT INTO accounts (id, company_id, iban, bank, balance_cents, balance_on) VALUES (?, ?, ?, ?, ?, ?)').bind(DEMO.account, c, 'SK3112000000198742637541', 'Banka', 486163, day(-1)),
    // Three card payments without a receipt: what the client is asked for.
    pay('demo-1', -1, -1240, 'KAVIAREN NA ROHU KOSICE', { card: true }),
    pay('demo-2', -2, -6418, 'CERPACIA STANICA D1', { card: true }),
    pay('demo-3', -4, -2790, 'KANCELARSKE POTREBY', { card: true }),
    // Paired by themselves, or by the client.
    pay('demo-4', -3, -5990, 'Hostingový dom s. r. o.', { iban: 'SK8975000000000012345671', vs: '2026118', note: 'Faktúra 2026118' }),
    pay('demo-5', -6, 120000, 'Digitálne štúdio Vlna s. r. o.', { iban: 'SK6807200002891987426353', vs: '20260005', note: 'Úhrada faktúry 20260005' }),
    pay('demo-6', -8, -15000, 'Coworking Nádvorie s. r. o.', { iban: 'SK0809000000000123123123', vs: '1026', note: 'Nájom október' }),
    pay('demo-7', -9, -1999, 'Mobilný operátor a. s.', { iban: 'SK2111000000002612345678', vs: '7781202610' }),
    pay('demo-11', -15, -32000, 'Grafické štúdio Linka', { iban: 'SK5202000000004712345670', vs: '1112026', note: 'Logo a vizitky' }),
    // Recognised as needing no document, and one the client said needs none.
    pay('demo-8', -10, -450, null, { note: 'Poplatok za vedenie účtu', exempt: 'bank' }),
    pay('demo-10', -20, -3300, 'Finančná správa SR', { iban: 'SK3681800000007000123456', vs: '1700000000', note: 'Správny poplatok', exempt: 'state' }),
    pay('demo-9', -27, 500000, 'Martin Novák', { iban: 'SK7311000000002934567890', note: 'Splatenie základného imania' }),
    db.prepare("UPDATE payments SET exempt = 'capital', exempt_by = ?, exempt_note = 'základné imanie' WHERE account_id = ? AND ref = 'demo-9'").bind(DEMO.user, DEMO.account),
    doc('demo-doc-1', -3, { source: 'email', kind: 'invoice_in', party: 'Hostingový dom s. r. o.', ico: '36123456', iban: 'SK8975000000000012345671', number: '2026118', vs: '2026118', issued: -12, due: -2, total: 5990 }),
    doc('demo-doc-2', -20, { source: 'upload', kind: 'invoice_out', party: 'Digitálne štúdio Vlna s. r. o.', ico: '54123987', number: '20260005', vs: '20260005', issued: -21, due: -7, total: 120000 }),
    doc('demo-doc-3', -9, { source: 'email', kind: 'invoice_in', party: 'Coworking Nádvorie s. r. o.', ico: '51234567', iban: 'SK0809000000000123123123', number: 'FA1026', vs: '1026', issued: -9, due: -2, total: 15000, vat: 2500 }),
    doc('demo-doc-4', -11, { source: 'einvoice', kind: 'invoice_in', party: 'Mobilný operátor a. s.', ico: '35000001', iban: 'SK2111000000002612345678', number: '7781202610', vs: '7781202610', issued: -12, due: -2, total: 1999, vat: 333 }),
    doc('demo-doc-5', -16, { source: 'upload', kind: 'invoice_in', party: 'Grafické štúdio Linka', ico: '53456789', number: '1112026', vs: '1112026', issued: -18, due: -4, total: 32000 }),
    // Waiting: a receipt the client paid in cash, and an invoice that is not due yet.
    doc('demo-doc-6', -5, { source: 'upload', kind: 'receipt', party: 'Papiernictvo Pero', issued: -5, total: 890, vat: 148 }),
    doc('demo-doc-7', -2, { source: 'email', kind: 'invoice_in', party: 'Tlačiareň Farba s. r. o.', ico: '47654321', iban: 'SK4402000000003456789012', number: '2026-0412', vs: '20260412', issued: -2, due: 12, total: 8640, vat: 1440 }),
    link('demo-doc-1', 'demo-4', 'auto'),
    link('demo-doc-2', 'demo-5', 'auto'),
    link('demo-doc-3', 'demo-6', 'auto'),
    link('demo-doc-4', 'demo-7', 'auto'),
    link('demo-doc-5', 'demo-11', 'client'),
    messageStatement(db, { id: 'demo-msg-1', company: c, author: null, side: 'firmony', at: at(today, -12, 10, 15), payment: null, body: 'Dobrý deň, vitajte vo Firmony. Doklady stačí pridávať priebežne, za každý mesiac najneskôr do 10. dňa nasledujúceho mesiaca. Ak si s niečím nebudete vedieť rady, napíšte mi sem.' }),
    db.prepare('UPDATE messages SET seen_at = ? WHERE id = ?').bind(ts, 'demo-msg-1'),
    messageStatement(db, { id: 'demo-msg-2', company: c, author: DEMO.user, side: 'client', at: at(today, -8, 18, 40), payment: null, body: 'Dobrý deň, faktúru za coworking mi posielajú každý mesiac e-mailom. Stačí ju preposlať?' }),
    messageStatement(db, { id: 'demo-msg-3', company: c, author: null, side: 'firmony', at: at(today, -7, 9, 5), payment: null, body: 'Áno, stačí ju preposlať na vašu adresu pre doklady. K platbe ju priradíme sami. Túto už máme.' }),
    eventStatement(db, { company: c, user: null, action: 'demo.seeded' }),
  ])
}
