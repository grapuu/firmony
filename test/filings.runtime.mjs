// Delivery proof is per exact document, with the same company scope, immutable history and retention as the books.
import { check } from './check.mjs'
import { writeFileSync } from 'node:fs'
import { filingFile, prepareFiling, packageOf, changeDelivery, eventsOf, filedReturns, teamDeadlines, exportYear, companyOf, filingQueue, currentPackage, summariesFiled, reclassifySummaryStatements, dataRevision } from '../.wrangler/dist/stores.js'

export async function checkFilings({ db, files, acc, admin, lucia, nowS, day, signIn, as, unzip, capture }) {
  const company = 'co-delivery', period = day(-45).slice(0, 7), today = day(0), year = Number(today.slice(0, 4)) - 1
  const base = `/ucto/klienti/${company}/podania`
  await db.batch([
    db.prepare("INSERT INTO users (id, created_at, name, email) VALUES ('delivery-client', ?, 'Klient doručenia', 'delivery@firmony.test')").bind(nowS),
    db.prepare("INSERT INTO companies (id, created_at, name, ico, dic, icdph, vat_payer, plan, inbox, accountant_id, start_on) VALUES (?, ?, 'Doručenie s. r. o.', '63334444', '2126333444', 'SK2126333444', 1, 'rast', 'delivery001', ?, ?)").bind(company, nowS, lucia.id, `${year}-01-01`),
    db.prepare("INSERT INTO members (company_id, user_id, role, created_at) VALUES (?, 'delivery-client', 'owner', ?)").bind(company, nowS),
  ])
  const client = as((await signIn('delivery@firmony.test')).cookie)
  const co = async () => companyOf(await db.prepare('SELECT * FROM companies WHERE id = ?').bind(company).first())
  const user = await db.prepare('SELECT * FROM users WHERE id = ?').bind(lucia.id).first()
  const vat = await filingFile('TEST-ONLY-DPH.xml', '<TEST_ONLY form="vat" company="63334444" />')
  const kv = await filingFile('TEST-ONLY-KV.xml', '<TEST_ONLY form="kv" company="63334444" />')
  const sv = await filingFile('TEST-ONLY-SV.xml', '<TEST_ONLY form="sv" company="63334444" />')
  const dppo = await filingFile('TEST-ONLY-DPPO.xml', '<TEST_ONLY form="dppo" company="63334444" />')
  const uz = await filingFile('TEST-ONLY-UZ.xml', '<TEST_ONLY form="uz" company="63334444" />')
  await db.batch([
    db.prepare(`INSERT INTO vat_returns (company_id, period, filed_at, filed_on, filed_by, rows, kv_rows, pay_cents, refund_cents, due_on, kind, fast, carried, kv, delivery)
      VALUES (?, ?, ?, ?, ?, '{}', 0, 0, 0, ?, 'R', 0, 0, ?, ?)`)
      .bind(company, period, nowS, today, lucia.id, today, JSON.stringify({ kind: 'R', full: {}, sent: {} }), JSON.stringify({ vat: vat.attemptId, kv: kv.attemptId })),
    db.prepare("INSERT INTO filings (company_id, kind, period, filed_at, filed_on, filed_by, data) VALUES (?, 'sv', ?, ?, ?, ?, ?)")
      .bind(company, period, nowS, today, lucia.id, JSON.stringify({ kind: 'R', rows: [], sent: [], file: sv, prev: null })),
    db.prepare('INSERT INTO closings (company_id, year, filed_at, filed_on, filed_by, filed) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(company, year, nowS, today, lucia.id, JSON.stringify({ rows: {}, balance: {}, profit: {}, advancesNext: { kind: 'none', each: 0 }, files: { version: 1, declaredOn: today, return: dppo, statements: uz } })),
    ...[['vat', vat, period], ['kv', kv, period], ['sv', sv, period], ['dppo', dppo, String(year)], ['uz', uz, String(year)]].map(([kind, file, of]) => prepareFiling(db, company, kind, of, file, lucia.id)),
  ])
  const pkg = (file) => packageOf(db, company, file.attemptId)
  const state = async (file) => (await pkg(file)).status
  const row = async () => (await filedReturns(db, company))[0]
  const dues = async () => (await teamDeadlines(db, user, false, today, { company })).dues
  let res = await acc.get(base), html = await res.text()
  check('the shared filing register lists five independent prepared documents', res.status === 200 && (html.match(/class="info filing-card"/g) ?? []).length === 5 && html.includes('Podklady pripravené'))
  if (capture) writeFileSync(`${capture}/filings-prepared.html`, html)
  res = await client.get('/app/podania')
  check('the client sees the same company-scoped delivery states without a mutation form', res.status === 200 && (await res.text()).includes('Podklady pripravené'))
  check('prepared snapshots never close the filing deadline', (await row()).deliveryStatus === 'prepared' && (await dues()).some((d) => d.kind === 'vat' && d.period === period && d.state !== 'done'))
  const orphan = await filingFile('TEST-ONLY-stale.xml', '<TEST_ONLY stale="1"/>')
  const stalePreparation = await prepareFiling(db, company, 'vat', period, orphan, lucia.id).run()
  check('a stale source revision cannot create an unattached delivery package', stalePreparation.meta.changes === 0 && !await packageOf(db, company, orphan.attemptId))
  const fields = (to, revision, reference, extra = {}) => ({ to, revision: String(revision), reference, channel: 'TEST-ONLY FS fixture', externalOn: today, checked: '1', reason: '', ...extra })
  const proof = (form, reference, result = 'accepted') => ({ name: 'TEST-ONLY-potvrdenka.xml', type: 'application/xml', bytes: new TextEncoder().encode(`<?xml version="1.0"?><TEST_ONLY company="63334444" form="${form}" reference="${reference}" result="${result}"/>`) })
  const send = (actor, file, values, attachment) => attachment ? actor.upload(`${base}/${file.attemptId}/stav`, attachment, values, 'receipt') : actor.post(`${base}/${file.attemptId}/stav`, values)
  res = await send(acc, vat, fields('accepted', 0, 'TEST-ACCEPT-1'))
  check('one click without a receipt cannot turn preparation into acceptance', res.status === 409 && await state(vat) === 'prepared')
  res = await send(acc, vat, fields('accepted', 0, 'TEST-ACCEPT-1', { checked: '' }), proof('vat', 'TEST-ACCEPT-1'))
  check('receipt matching must be explicitly checked by the accountant', res.status === 409 && await state(vat) === 'prepared')
  res = await send(acc, vat, fields('submitted', 0, 'TEST-SEND-1'))
  check('manual sending is recorded without claiming receipt', res.status === 303 && await state(vat) === 'submitted' && (await row()).deliveryStatus !== 'accepted')
  const badBefore = (await files.list({ prefix: `companies/${company}/filings/` })).objects.length
  res = await send(acc, vat, fields('accepted', 0, 'TEST-STALE'), proof('vat', 'TEST-STALE'))
  check('a stale form neither changes state nor leaves a new receipt object', res.status === 409 && (await files.list({ prefix: `companies/${company}/filings/` })).objects.length === badBefore)
  const acceptance = proof('vat', 'TEST-ACCEPT-1')
  res = await send(acc, vat, fields('accepted', 1, 'TEST-ACCEPT-1'), acceptance)
  check('a checked receipt establishes only this document acceptance', res.status === 303 && await state(vat) === 'accepted' && await state(kv) === 'prepared' && (await row()).deliveryStatus !== 'accepted')
  check('an accepted VAT return does not silently finish its unconfirmed control statement', (await dues()).some((d) => d.kind === 'vat' && d.period === period && d.state !== 'done'))
  const received = (await eventsOf(db, company, vat.attemptId))[0]
  res = await client.get(`/app/podania/${vat.attemptId}/potvrdenka/${received.id}`)
  check('the client downloads the exact accountant-checked receipt', res.status === 200 && res.headers.get('content-disposition').startsWith('attachment') && Buffer.from(await res.arrayBuffer()).equals(Buffer.from(acceptance.bytes)))
  res = await client.get(`/app/podania/${vat.attemptId}/dokument.xml`)
  check('the shared register downloads the original saved XML bytes', res.status === 200 && await res.text() === vat.xml)
  const foreign = as((await signIn('boris@firma-b.test')).cookie)
  check('a different company cannot open the receipt or XML', (await foreign.get(`/app/podania/${vat.attemptId}`)).status === 404 && (await foreign.get(`/app/podania/${vat.attemptId}/potvrdenka/${received.id}`)).status === 404)
  res = await client.post(`/app/podania/${vat.attemptId}/stav`, fields('rejected', 2, 'TEST-CUSTOMER'))
  check('a customer cannot mutate delivery evidence', res.status === 404)
  res = await send(acc, kv, fields('accepted', 0, 'TEST-ACCEPT-1'), proof('kv', 'TEST-ACCEPT-1'))
  check('one external reference cannot certify a different document', res.status === 409 && await state(kv) === 'prepared')
  res = await send(acc, kv, fields('accepted', 0, 'TEST-KV-DIFFERENT-REF'), acceptance)
  check('renaming a reference cannot reuse another document receipt bytes', res.status === 409 && await state(kv) === 'prepared')
  res = await send(acc, kv, fields('accepted', 0, 'TEST-KV-ACCEPT'), proof('kv', 'TEST-KV-ACCEPT'))
  check('an existing receipt can finish preparation in one confirmed step', res.status === 303 && await state(kv) === 'accepted' && (await row()).deliveryStatus === 'accepted')
  check('both applicable forms must be accepted before the deadline becomes done', (await dues()).some((d) => d.kind === 'vat' && d.period === period && d.state === 'done'))
  const priorVat = await db.prepare('SELECT * FROM vat_returns WHERE company_id = ? AND period = ?').bind(company, period).first()
  const controlDraft = await filingFile('TEST-ONLY-KV-correction.xml', '<TEST_ONLY form="kv" correction="1"/>')
  await db.batch([
    db.prepare('UPDATE vat_returns SET delivery = ?, prev = ? WHERE company_id = ? AND period = ?')
      .bind(JSON.stringify({ vat: vat.attemptId, kv: controlDraft.attemptId }), JSON.stringify(priorVat), company, period),
    prepareFiling(db, company, 'kv', period, controlDraft, user.id),
  ])
  check('an accepted unchanged VAT return does not hide safe reopening of an unsent control-only draft', (await row()).canReprepare && await currentPackage(db, await pkg(controlDraft)) && await state(vat) === 'accepted')
  res = await acc.post(`/ucto/klienti/${company}/dph/zrusit`, { obdobie: period })
  check('reopening only the unsent correction restores accepted originals and retains draft evidence', res.status === 303 && (await row()).deliveryStatus === 'accepted' && (await row()).delivery.kv === kv.attemptId && !await currentPackage(db, await pkg(controlDraft)) && Boolean(await pkg(controlDraft)))
  const historyBefore = (await eventsOf(db, company, vat.attemptId)).length
  res = await send(acc, vat, fields('review', 2, 'TEST-REVIEW', { reason: 'TEST-ONLY suspicious receipt review' }))
  check('an ordinary accountant cannot reopen an accepted confirmation', res.status === 409 && await state(vat) === 'accepted')
  res = await send(admin, vat, fields('review', 2, 'TEST-REVIEW', { reason: 'TEST-ONLY suspicious receipt review' }))
  check('an administrator can open a documented review without erasing acceptance history', res.status === 303 && await state(vat) === 'review' && (await eventsOf(db, company, vat.attemptId)).length === historyBefore + 1)
  check('a disputed confirmation reopens the deadline', (await row()).deliveryStatus !== 'accepted' && (await dues()).some((d) => d.kind === 'vat' && d.period === period && d.state !== 'done'))
  res = await send(admin, vat, fields('accepted', 3, 'TEST-ACCEPT-1'), acceptance)
  check('review can reconfirm the same original receipt while retaining every decision', res.status === 303 && await state(vat) === 'accepted' && (await eventsOf(db, company, vat.attemptId)).length === historyBefore + 2)
  res = await send(acc, sv, fields('rejected', 0, 'TEST-SV-REJECT', { reason: 'TEST-ONLY invalid signing certificate' }), proof('sv', 'TEST-SV-REJECT', 'rejected'))
  check('a refusal preserves the original file and the reason for action', res.status === 303 && await state(sv) === 'rejected')
  res = await acc.get(`${base}/${sv.attemptId}`); html = await res.text()
  if (capture) writeFileSync(`${capture}/filing-rejected.html`, html)
  check('the accountant sees refusal history and a resending action', res.status === 200 && html.includes('Podateľňa podanie odmietla') && html.includes('invalid signing certificate') && html.includes('Evidovať odoslanie mimo Firmony'))
  res = await send(acc, sv, fields('submitted', 1, 'TEST-SV-RESEND', { reason: 'TEST-ONLY renewed signing certificate' }))
  check('resending the same immutable payload retains the refused attempt', res.status === 303 && await state(sv) === 'submitted' && (await eventsOf(db, company, sv.attemptId)).length === 2)
  res = await send(acc, dppo, fields('accepted', 0, 'TEST-DPPO-ACCEPT'), proof('dppo', 'TEST-DPPO-ACCEPT'))
  check('the income-tax receipt does not stand for the financial statements', res.status === 303 && await state(uz) === 'prepared' && (await dues()).some((d) => d.kind === 'closing' && d.state !== 'done'))
  const racePackage = await pkg(uz), countBeforeRace = (await files.list({ prefix: `companies/${company}/filings/` })).objects.length
  const raceResults = await Promise.all([1, 2].map((i) => changeDelivery(db, files, racePackage, user, { to: 'accepted', revision: 0, externalOn: today, reference: `TEST-UZ-RACE-${i}`, reason: '', channel: 'TEST-ONLY', checked: true, receipt: proof('uz', `TEST-UZ-RACE-${i}`) }, today)))
  check('concurrent acceptance commits exactly one event and removes only the losing new file', raceResults.filter((r) => r.ok).length === 1 && (await eventsOf(db, company, uz.attemptId)).length === 1 && (await files.list({ prefix: `companies/${company}/filings/` })).objects.length === countBeforeRace + 1)
  check('both annual documents clear the outstanding annual deadline', !(await dues()).some((d) => d.kind === 'closing' && d.state !== 'done'))
  for (const [name, sql] of [
    ['delivery events cannot be edited', `UPDATE filing_events SET reference = 'changed' WHERE company_id = '${company}'`],
    ['saved XML cannot be overwritten', `UPDATE filing_packages SET xml = '<changed/>' WHERE company_id = '${company}'`],
    ['a sent VAT source cannot be unmarked by deleting its snapshot', `DELETE FROM vat_returns WHERE company_id = '${company}'`],
    ['a sent annual source cannot be unmarked by clearing its snapshot', `UPDATE closings SET filed = NULL, filed_at = NULL WHERE company_id = '${company}'`],
    ['company deletion cannot cascade around retained filing evidence', `DELETE FROM companies WHERE id = '${company}'`],
  ]) {
    let blocked = false
    try { await db.prepare(sql).run() } catch { blocked = true }
    check(name, blocked)
  }
  res = await acc.post(`/ucto/klienti/${company}/dph/zrusit`, { obdobie: period })
  check('the HTTP undo action explains why externally recorded delivery is retained', res.status === 409 && (await res.text()).includes('Podanie sme nezrušili'))
  res = await acc.get(`${base}/${vat.attemptId}`); html = await res.text()
  if (capture) writeFileSync(`${capture}/filing-accepted.html`, html)
  res = await client.get(`/app/podania/${vat.attemptId}`); html = await res.text()
  check('the client sees the proof and history with no staff-only controls', res.status === 200 && html.includes('Prijatie podateľňou doložené') && html.includes('TEST-ACCEPT-1') && !html.includes('filing-form'))
  if (capture) writeFileSync(`${capture}/filing-client.html`, html)
  res = await acc.get('/ucto/podania'); html = await res.text()
  check('the shared work queue retains unfinished current forms across periods', res.status === 200 && html.includes(sv.attemptId) && !html.includes(`href="${base}/${vat.attemptId}"`))
  if (capture) writeFileSync(`${capture}/filing-queue.html`, html)
  await db.prepare('UPDATE companies SET accountant_id = NULL WHERE id = ?').bind(company).run()
  check('the work queue and dossier enforce the current accountant assignment', !(await filingQueue(db, user)).some((p) => p.company_id === company) && (await acc.get(`${base}/${sv.attemptId}`)).status === 404)
  await db.prepare('UPDATE companies SET accountant_id = ? WHERE id = ?').bind(lucia.id, company).run()

  const receiptPath = `/app/podania/${vat.attemptId}/potvrdenka/${received.id}`
  await files.put(received.file_key, '<TEST_ONLY corrupted="1"/>')
  check('a corrupted receipt cannot be downloaded as the verified original', (await client.get(receiptPath)).status === 409)
  let corruptExportBlocked = false
  try { const corrupt = await exportYear({ DB: db, FILES: files }, await co(), period.slice(0, 4), null, today); await new Response(corrupt.body).arrayBuffer() } catch { corruptExportBlocked = true }
  check('a corrupted receipt aborts the complete handover archive', corruptExportBlocked)
  await files.delete(received.file_key)
  check('missing receipt bytes are reported instead of returning a successful download', (await client.get(receiptPath)).status === 409)
  await files.put(received.file_key, acceptance.bytes, { httpMetadata: { contentType: 'application/xml' } })

  const quarter = `${year}-Q1`, lastMonth = `${year}-03`, quarterly = await filingFile('TEST-ONLY-original-quarter.xml', '<TEST_ONLY originalQuarter="1"/>')
  await db.batch([
    db.prepare("INSERT INTO filings (company_id, kind, period, filed_at, filed_on, filed_by, data) VALUES (?, 'sv', ?, ?, ?, ?, ?)")
      .bind(company, quarter, nowS, today, user.id, JSON.stringify({ kind: 'R', rows: [], sent: [], file: quarterly, prev: null })),
    prepareFiling(db, company, 'sv', quarter, quarterly, user.id),
  ])
  check('the work queue includes older current periods beyond the calculated deadline window', (await filingQueue(db, user)).some((p) => p.id === quarterly.attemptId && p.period === quarter))
  const quarterProof = proof('sv', 'TEST-ORIGINAL-QUARTER'), rawCommit = db.batch.bind(db)
  const lostAckDb = { prepare: db.prepare.bind(db), async batch(statements) { await rawCommit(statements); throw new Error('TEST-ONLY lost commit acknowledgement') } }
  let acknowledgementLost = false
  try { await changeDelivery(lostAckDb, files, await pkg(quarterly), user, { to: 'accepted', revision: 0, externalOn: today, reference: 'TEST-ORIGINAL-QUARTER', reason: '', channel: 'TEST-ONLY', checked: true, receipt: quarterProof }, today) } catch { acknowledgementLost = true }
  const quarterlyReceipt = (await eventsOf(db, company, quarterly.attemptId))[0]
  check('a lost commit acknowledgement never deletes evidence that was already committed', acknowledgementLost && await state(quarterly) === 'accepted' && Boolean(await files.head(quarterlyReceipt.file_key)))
  const originalQuarter = (await summariesFiled(db, company)).get(quarter)
  await db.batch(reclassifySummaryStatements(db, company, quarter, originalQuarter, await dataRevision(db, company)))
  const reclassified = JSON.parse((await db.prepare("SELECT data FROM filings WHERE company_id = ? AND kind = 'sv' AND period = ?").bind(company, lastMonth).first()).data)
  check('reclassifying an accepted quarter retains its exact payload, receipt and current identity', reclassified.sourcePeriod === quarter && reclassified.file.xml === quarterly.xml && await currentPackage(db, await pkg(quarterly)) && (await eventsOf(db, company, quarterly.attemptId))[0].id === quarterlyReceipt.id)
  res = await acc.get(`${base}?obdobie=${lastMonth}`)
  check('the reclassified monthly register still links the original quarter dossier', res.status === 200 && (await res.text()).includes(quarterly.attemptId))

  const archive = await exportYear({ DB: db, FILES: files }, await co(), period.slice(0, 4), null, today)
  const zipped = await unzip(new Uint8Array(await new Response(archive.body).arrayBuffer()))
  const paths = Array.isArray(zipped) ? zipped.map((f) => f.name) : [...zipped.keys()]
  check('portable handover contains exact filing versions, delivery history and original receipts', paths.some((p) => p === 'data/verzie-podani.json') && paths.some((p) => p === 'data/dorucenie-podani.json') && paths.some((p) => p.startsWith('podania/potvrdenky/')) && paths.some((p) => p.startsWith('podania/dorucenie/vat-')))
  const stalePkg = await pkg(sv), staleInput = { to: 'accepted', revision: stalePkg.revision, externalOn: today, reference: 'TEST-SV-STALE', reason: '', channel: 'TEST-ONLY', checked: true, receipt: proof('sv', 'TEST-SV-STALE') }
  const rawBatch = db.batch.bind(db)
  let raced = false
  const raceDb = { prepare: db.prepare.bind(db), async batch(statements) {
    if (!raced) { raced = true; await db.prepare('UPDATE companies SET accountant_id = NULL WHERE id = ?').bind(company).run() }
    return rawBatch(statements)
  } }
  const beforeFiles = (await files.list({ prefix: `companies/${company}/filings/` })).objects.length
  const denied = await changeDelivery(raceDb, files, stalePkg, user, staleInput, today)
  check('transactional authorization rejects assignment revocation after the request read', !denied.ok && await state(sv) === 'submitted')
  check('a rejected evidence transaction cleans only its new uncommitted original', (await files.list({ prefix: `companies/${company}/filings/` })).objects.length === beforeFiles && Boolean(await files.head(received.file_key)))
  await db.prepare('UPDATE companies SET accountant_id = ? WHERE id = ?').bind(lucia.id, company).run()
  // Every proof remains readable while an incident protects the company and stops final deletion.
  const actor = await db.prepare("SELECT id FROM users WHERE email = 'ahoj@firmony.io'").first()
  res = await admin.post('/ucto/incidenty', { company, title: 'TEST-ONLY delivery evidence incident', evidence: 'TEST-ONLY independent evidence retention reference', owner: actor.id, backup: lucia.id, severity: 'normal', review: day(7) })
  check('delivery evidence can be put under the existing incident hold', res.status === 303 && Boolean(await db.prepare('SELECT id FROM evidence_holds WHERE company_id = ? AND released_at IS NULL').bind(company).first()))
  let pendingFreezeBlocked = false
  try { await db.prepare('UPDATE companies SET purge_started_at = ? WHERE id = ?').bind(nowS, company).run() } catch { pendingFreezeBlocked = true }
  check('an unresolved current filing prevents handover from freezing receipt completion', pendingFreezeBlocked && !(await db.prepare('SELECT purge_started_at FROM companies WHERE id = ?').bind(company).first()).purge_started_at)
  res = await send(acc, sv, fields('accepted', 2, 'TEST-SV-ACCEPT'), proof('sv', 'TEST-SV-ACCEPT'))
  check('receipt completion remains available while an incident protects the originals', res.status === 303 && await state(sv) === 'accepted')
  await db.prepare('UPDATE companies SET purge_started_at = ? WHERE id = ?').bind(nowS, company).run()
  let protectedHistory = false
  try { await db.prepare('DELETE FROM filing_events WHERE company_id = ?').bind(company).run() } catch { protectedHistory = true }
  check('an active hold protects filing history even after handover freeze', protectedHistory)
  const adminUser = await db.prepare('SELECT * FROM users WHERE id = ?').bind(actor.id).first()
  const frozen = await changeDelivery(db, files, await pkg(sv), adminUser, { ...staleInput, to: 'review', revision: 3, reference: 'TEST-FROZEN', reason: 'TEST-ONLY frozen company review' }, today)
  check('handover freeze rejects receipt writes and keeps committed evidence', !frozen.ok && await state(sv) === 'accepted' && Boolean(await files.head(received.file_key)))
  res = await admin.get(`${base}/${sv.attemptId}`)
  html = await res.text()
  check('frozen handover shows a read-only dossier with its original evidence', res.status === 200 && !html.includes('filing-form') && html.includes('uzamknuté na odovzdanie'))
}
