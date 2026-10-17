// Keep independent suppliers independent, and keep a batch's first original free of duplicate cycles.
import { check } from './check.mjs'
import { afterReading, markDuplicate } from '../.wrangler/dist/stores.js'
import { writeFileSync } from 'node:fs'

export async function checkAutomation({ db, acc, anna, nowS, day, appPost, pretendPhoto, settle, capture }) {
  const ids = ['auto-original', 'auto-other-supplier', 'auto-second-photo']
  await db.batch(ids.map((id, i) => db.prepare(
    `INSERT INTO documents (id, company_id, created_at, source, status, kind, party, party_ico, number,
      issued_on, total_cents, vat_cents, currency, category, read_by, file_name)
      VALUES (?, 'co-a', ?, 'upload', 'read', 'invoice_in', ?, ?, 'AUTO-118', ?, 8750, 0, 'EUR', 'services', 'xml', ?)`,
  ).bind(id, nowS, i === 1 ? 'Beta dodávateľ' : 'Alfa dodávateľ', i === 1 ? '62222222' : '61111111', day(-2), `${id}.xml`)))
  await Promise.all(ids.map((id) => markDuplicate(db, 'co-a', id)))
  const originals = (await db.prepare("SELECT id, duplicate_of FROM documents WHERE id LIKE 'auto-%' ORDER BY rowid").all()).results
  check('same-second concurrent duplicate checks retain the first original', originals[0]?.id === ids[0] && originals[0].duplicate_of === null)
  check('equal invoice numbers and amounts from different suppliers remain independent', originals[1]?.duplicate_of === null)
  check('another copy points backwards to the original without a cycle', originals[2]?.duplicate_of === ids[0])
  // Rechecking in the opposite order must not introduce a backwards link to a newer row.
  await Promise.all([...ids].reverse().map((id) => markDuplicate(db, 'co-a', id)))
  check('rechecking the batch leaves the original unmarked', (await db.prepare('SELECT duplicate_of FROM documents WHERE id = ?').bind(ids[0]).first()).duplicate_of === null)
  let response = await acc.get(`/ucto/doklady/${ids[1]}`), html = await response.text()
  check('the accountant can review the independent invoice without a false duplicate warning', response.status === 200 && html.includes('Beta dodávateľ') && !/Možno ide o.duplikát/.test(html))
  response = await acc.get(`/ucto/doklady/${ids[2]}`)
  html = await response.text()
  check('the actual duplicate links the accountant to its original', response.status === 200 && /Možno ide o.duplikát/.test(html) && html.includes(`/ucto/doklady/${ids[0]}`))

  const delayed = ['auto-delayed-original', 'auto-faster-copy']
  await db.batch(delayed.map((id, i) => db.prepare(
    `INSERT INTO documents (id, company_id, created_at, source, status, kind, party, party_ico, number, issued_on, total_cents, currency)
      VALUES (?, 'co-a', ?, 'upload', ?, ?, 'Alfa dodávateľ', '61111111', 'AUTO-119', ?, ?, 'EUR')`,
  ).bind(id, nowS, i ? 'read' : 'reading', i ? 'invoice_in' : null, day(-2), i ? 8750 : null)))
  await afterReading(db, 'co-a', delayed[1])
  check('a faster OCR result waits for the older original to become readable', (await db.prepare('SELECT duplicate_of FROM documents WHERE id = ?').bind(delayed[1]).first()).duplicate_of === null)
  await db.prepare("UPDATE documents SET status = 'read', kind = 'invoice_in', total_cents = 8750 WHERE id = ?").bind(delayed[0]).run()
  await afterReading(db, 'co-a', delayed[0])
  check('finishing older OCR rechecks newer copies without marking the original', (await db.prepare('SELECT duplicate_of FROM documents WHERE id = ?').bind(delayed[0]).first()).duplicate_of === null && (await db.prepare('SELECT duplicate_of FROM documents WHERE id = ?').bind(delayed[1]).first()).duplicate_of === delayed[0])

  response = await appPost('/app/doklady', {}, { files: [pretendPhoto('auto-invalid-reading.jpg', {
    typ: 'constructor', kategoria: '__proto__', datum_vystavenia: '2026-02-31', datum_splatnosti: '2026-04-31', datum_dodania: '2026-02-29',
    druha_strana: 'Neistý doklad test', ico_druhej_strany: '63333333',
  })] })
  check('the client uploads a document without having to repair an AI answer', response.status === 303)
  await settle(600)
  const invalid = await db.prepare("SELECT id, kind, category, issued_on, due_on, supplied_on, booked_at FROM documents WHERE file_name = 'auto-invalid-reading.jpg'").first()
  check('invalid AI enum values and impossible dates never enter the accounting proposal', invalid?.kind === 'other' && invalid.category === null && invalid.issued_on === null && invalid.due_on === null && invalid.supplied_on === null && invalid.booked_at === null)
  response = await acc.get(`/ucto/doklady/${invalid?.id}`)
  html = await response.text()
  check('an uncertain AI reading remains available in the accountant work form', response.status === 200 && html.includes('name="kind"') && html.includes('name="issued"'))
  if (capture) writeFileSync(`${capture}/automation-review.html`, html)
  for (const id of [...ids, ...delayed, invalid?.id]) await anna.post(`/app/doklady/${id}/zmazat`, {})
}
