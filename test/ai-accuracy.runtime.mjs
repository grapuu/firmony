// How well the reader reads (20 October 2026, team/ai-accuracy.ts), in workerd: what the reader proposed is kept on
// the document when it is read, and the page compares it with the booking, field by field.
import { check } from './check.mjs'
import { writeFileSync } from 'node:fs'

export async function checkAiAccuracy({ db, acc, admin, lucia, nowS, capture }) {
  const kept = await db.prepare("SELECT COUNT(*) AS n FROM documents WHERE reading IS NOT NULL AND read_by IS NOT NULL AND read_by != 'xml' AND read_by NOT LIKE 'person%'").first()
  check('a document the reader read keeps what it proposed', Number(kept?.n ?? 0) > 0, JSON.stringify(kept))
  const people = await db.prepare("SELECT COUNT(*) AS n FROM documents WHERE reading IS NOT NULL AND read_by LIKE 'person%'").first()
  check('a document left to the accountant keeps no proposal', Number(people?.n ?? 0) === 0)
  const read = { kind: 'invoice_in', party: 'TEST-ONLY Zlý dodávateľ s. r. o.', partyIco: '63335603', number: 'F-77', vs: '77', issuedOn: '2026-10-01', dueOn: '2026-10-15', totalCents: 12300, vatCents: 2300, currency: 'EUR', category: 'services' }
  await db.prepare("INSERT INTO companies (id, created_at, name, plan, inbox, accountant_id, contract_at, start_on) VALUES ('co-ai', ?, 'TEST-ONLY Presnosť s. r. o.', 'rast', 'aiac0001', ?, ?, '2026-01-01')").bind(nowS, lucia.id, nowS).run()
  const doc = (id, booked) =>
    db
      .prepare(
        `INSERT INTO documents (id, company_id, created_at, source, status, read_by, kind, party, party_ico, number, vs, issued_on, due_on, total_cents, vat_cents, currency, category, booked_at, booked_by, reading)
         VALUES (?, 'co-ai', ?, 'upload', 'read', 'claude-haiku-5-5', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(id, nowS, booked.kind, booked.party, booked.partyIco, booked.number, booked.vs, booked.issuedOn, booked.dueOn, booked.totalCents, booked.vatCents, booked.currency, booked.category, nowS, lucia.id, JSON.stringify(read))
  await db.batch([doc('ai-1', read), doc('ai-2', { ...read, totalCents: 13200, number: 'F-78' })])
  const raw = await (await acc.get('/ucto/ai')).text()
  if (capture) writeFileSync(`${capture}/ai-accuracy.html`, raw)
  check(
    'the page compares field by field and names the supplier put right',
    raw.includes('Presnosť softvéru') && raw.includes('Suma spolu') && raw.includes('Bez jedinej opravy') && raw.includes('TEST-ONLY Zlý dodávateľ s. r. o.'),
  )
  const all = await (await admin.get('/ucto/ai')).text()
  check('the administrator sees it too', all.includes('TEST-ONLY Zlý dodávateľ s. r. o.'))
}
