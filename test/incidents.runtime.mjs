import { check } from './check.mjs'
import { writeFileSync } from 'node:fs'
import {
  openIncident,
  reviewHold,
  requestRelease,
  approveRelease,
  closeIncident,
  assignIncident,
  evidenceBlocked,
  getIncident,
  purgeCompany,
  forgetRecords,
  exportYears,
  exportYear,
  companyOf,
  keepPaper,
  beginExport,
  completeExport,
  confirmExport,
} from '../.wrangler/dist/stores.js'

export async function checkIncidents({ db, files, admin, anna, acc, lucia, security, nowS, today, day, capture, unzip }) {
  const root = await db.prepare('SELECT * FROM users WHERE id = ?').bind(security.adminUser.id).first()
  const second = await db.prepare('SELECT * FROM users WHERE id = ?').bind(security.secondUser.id).first()
  const accountant = await db.prepare('SELECT * FROM users WHERE id = ?').bind(lucia.id).first()
  const ref = 'TEST-ONLY controlled evidence reference'
  const make = async (id, extras = '') => {
    await db
      .prepare(
        `INSERT INTO companies (id, created_at, name, plan, inbox, accountant_id, ends_on ${extras ? ', purged_at' : ''}) VALUES (?1, ?2, ?3, 'start', ?1, ?4, ?5 ${extras ? ', ?2' : ''})`,
      )
      .bind(id, nowS, `Test ${id} s. r. o.`, lucia.id, day(-1900))
      .run()
    if (!extras) {
      await db
        .prepare(
          "INSERT INTO documents (id, company_id, created_at, source, file_key, file_name, status) VALUES (?1, ?2, ?3, 'upload', ?4, 'original.pdf', 'new')",
        )
        .bind(`${id}-doc`, id, nowS, `companies/${id}/documents/original.pdf`)
        .run()
      await files.put(`companies/${id}/documents/original.pdf`, '%PDF-1.4 test original', {
        customMetadata: { fixture: 'incident' },
        httpMetadata: { contentType: 'application/pdf' },
      })
    }
  }
  const confirm = async (id) => {
    for (const y of await exportYears(db, id)) {
      const receipt = await beginExport(db, id, y, root.id)
      await completeExport(db, receipt.id)
      await confirmExport(db, id, receipt.id)
    }
  }
  const input = (company) => ({
    company,
    title: 'Overenie sporného účtovného dokladu',
    severity: 'high',
    evidence: ref,
    reviewOn: today,
    owner: accountant.id,
    backup: second.id,
  })
  await make('co-evidence')
  await confirm('co-evidence')
  await purgeCompany({ DB: db, FILES: files }, 'co-evidence', today)
  const staged = await db.prepare("SELECT * FROM companies WHERE id = 'co-evidence'").first()
  check(
    'a frozen handover still leaves originals available during the intervention window',
    staged.purge_started_at !== null && staged.purge_delete_started_at === null && Boolean(await files.head('companies/co-evidence/documents/original.pdf')),
  )
  let res = await admin.post('/ucto/incidenty', {
    ...input('co-evidence'),
    review: today,
  })
  const id = res.headers.get('location')?.split('/').at(-1)
  check(
    'an incident opened during the intervention window atomically preserves the company',
    res.status === 303 && Boolean(id) && (await evidenceBlocked(db, 'co-evidence')),
  )
  const incident = await getIncident(db, root, id)
  check('the evidence status reports a successful claim before destructive deletion', incident.preservation === 'held' && Boolean(incident.hold_id))
  res = await anna.get(`/ucto/incidenty/${id}`)
  check('a customer cannot read the internal incident register', res.status === 303 || res.status === 404)
  const outsider = { id: 'absent-user', team: 'accountant' }
  check(
    'an unassigned accountant cannot read or open another company incident',
    (await getIncident(db, outsider, id)) === null && (await openIncident(db, outsider, input('co-evidence'))) === null,
  )
  check('a company accountant can read the assigned incident', Boolean(await getIncident(db, accountant, id)))
  res = await acc.post(`/ucto/incidenty/${id}/uvolnit`, { reference: ref })
  check('an accountant cannot release a hold', res.status === 404)
  check(
    'a duplicated owner and backup is refused at the storage boundary',
    (await openIncident(db, root, {
      ...input('co-evidence'),
      backup: accountant.id,
    })) === null,
  )
  let blocked = 0
  for (const sql of [
    "DELETE FROM documents WHERE company_id = 'co-evidence'",
    `DELETE FROM incidents WHERE id = '${id}'`,
    `DELETE FROM evidence_holds WHERE incident_id = '${id}'`,
    `UPDATE incident_events SET detail = '{}' WHERE incident_id = '${id}'`,
    `DELETE FROM incident_events WHERE incident_id = '${id}'`,
    "DELETE FROM companies WHERE id = 'co-evidence'",
    "UPDATE companies SET purge_delete_started_at = 1 WHERE id = 'co-evidence'",
  ]) {
    try {
      await db.prepare(sql).run()
    } catch {
      blocked++
    }
  }
  check('SQL guards preserve the source, case, hold, history and company even outside HTTP handlers', blocked === 7)
  await db
    .prepare('UPDATE evidence_holds SET review_on = ?1, reviewed_by = ?2, review_ref = ?3 WHERE incident_id = ?4')
    .bind('2000-01-01', root.id, ref, id)
    .run()
  await db
    .prepare("UPDATE companies SET purge_started_at = ? WHERE id = 'co-evidence'")
    .bind(nowS - 86401)
    .run()
  const heldPurge = await purgeCompany({ DB: db, FILES: files }, 'co-evidence', today)
  check(
    'an overdue review never expires a hold or deletes the originals',
    heldPurge.rows === 0 && Boolean(await files.head('companies/co-evidence/documents/original.pdf')) && (await evidenceBlocked(db, 'co-evidence')),
  )
  if (capture) writeFileSync(`${capture}/incident-active.html`, await (await admin.get(`/ucto/incidenty/${id}`)).text())
  check(
    'assignment uses a version check instead of overwriting a concurrent decision',
    (await assignIncident(db, root, id, second.id, accountant.id, 0)) && !(await assignIncident(db, root, id, accountant.id, second.id, 0)),
  )
  check('a hold prevents closing a case even for an administrator', !(await closeIncident(db, second, id, ref)))
  check('release needs a distinct second current administrator', (await requestRelease(db, root, id, ref)) && !(await approveRelease(db, root, id)))
  check(
    'a new evidence review cancels an older pending release',
    (await reviewHold(db, accountant, id, today, 'TEST-ONLY newly assessed evidence')) && !(await approveRelease(db, second, id)),
  )
  check(
    'a new release request can be approved after the intervening review',
    (await requestRelease(db, root, id, ref)) && (await approveRelease(db, second, id)),
  )
  check(
    'a released hold alone does not permit deletion while the incident stays open',
    (await evidenceBlocked(db, 'co-evidence')) && (await purgeCompany({ DB: db, FILES: files }, 'co-evidence', today)).rows === 0,
  )
  check('the creator cannot close their own incident', !(await closeIncident(db, root, id, ref)))
  if (capture) {
    writeFileSync(`${capture}/incidents.html`, await (await admin.get('/ucto/incidenty')).text())
    writeFileSync(`${capture}/incident.html`, await (await admin.get(`/ucto/incidenty/${id}`)).text())
  }
  check('independent closure releases the remaining deletion block', (await closeIncident(db, second, id, ref)) && !(await evidenceBlocked(db, 'co-evidence')))
  const purged = await purgeCompany({ DB: db, FILES: files }, 'co-evidence', today)
  check(
    'a reviewed and independently closed case permits the already acknowledged purge',
    purged.rows > 0 && !(await files.head('companies/co-evidence/documents/original.pdf')),
  )
  check(
    'incident decisions remain after the ordinary accounting purge',
    (await db.prepare('SELECT COUNT(*) AS n FROM incident_events WHERE incident_id = ?').bind(id).first()).n >= 9,
  )
  await db.prepare("UPDATE companies SET ends_on = '2010-01-01' WHERE id = 'co-evidence'").run()
  await forgetRecords({ DB: db, FILES: files }, today)
  check(
    'final lawful retention cleanup cascades a closed case and its history together',
    !(await db.prepare("SELECT id FROM companies WHERE id = 'co-evidence'").first()) &&
      (await db.prepare('SELECT COUNT(*) AS n FROM incident_events WHERE incident_id = ?').bind(id).first()).n === 0,
  )

  // Claim-before-incident: preserve what remains and report the loss of the full-preservation claim honestly.
  await make('co-late-evidence')
  await confirm('co-late-evidence')
  await purgeCompany({ DB: db, FILES: files }, 'co-late-evidence', today)
  await db
    .prepare("UPDATE companies SET purge_started_at = ?, purge_delete_started_at = ? WHERE id = 'co-late-evidence'")
    .bind(nowS - 86401, nowS)
    .run()
  const late = await openIncident(db, root, input('co-late-evidence'))
  const lateCase = await getIncident(db, root, late)
  check('an already claimed destructive phase is never labeled fully preserved', lateCase.preservation === 'too_late' && lateCase.hold_id === null)
  check(
    'a late incident stops subsequent deletion and retains the remaining originals',
    (await evidenceBlocked(db, 'co-late-evidence')) &&
      (await purgeCompany({ DB: db, FILES: files }, 'co-late-evidence', today)).rows === 0 &&
      Boolean(await files.head('companies/co-late-evidence/documents/original.pdf')),
  )
  if (capture) writeFileSync(`${capture}/incident-late.html`, await (await admin.get(`/ucto/incidenty/${late}`)).text())
  check('a late incident also needs independent closure', !(await closeIncident(db, root, late, ref)) && (await closeIncident(db, second, late, ref)))
  await purgeCompany({ DB: db, FILES: files }, 'co-late-evidence', today)

  // Exercise the D1/R2 boundary, including the irreducible already-in-flight object deletion.
  for (const phase of ['list', 'delete']) {
    const company = `co-race-${phase}`
    await make(company)
    await files.put(`companies/${company}/statements/remaining.xml`, '<statement/>')
    await confirm(company)
    await purgeCompany({ DB: db, FILES: files }, company, today)
    await db
      .prepare('UPDATE companies SET purge_started_at = ? WHERE id = ?')
      .bind(nowS - 86401, company)
      .run()
    let raced = false,
      raceId
    const race = async () => {
      raced = true
      raceId = await openIncident(db, root, input(company))
    }
    const racingFiles = {
      async list(options) {
        const result = await files.list(options)
        if (phase === 'list' && !raced) await race()
        return result
      },
      async delete(keys) {
        await files.delete(keys)
        if (phase === 'delete' && !raced) await race()
      },
    }
    let interrupted = false
    try {
      await purgeCompany({ DB: db, FILES: racingFiles }, company, today)
    } catch (e) {
      interrupted = /Evidence hold/.test(String(e))
    }
    const original = await files.head(`companies/${company}/documents/original.pdf`)
    check(
      `an incident arriving during R2 ${phase} interrupts the next destructive action`,
      interrupted && raced && (await evidenceBlocked(db, company)) && Boolean(await files.head(`companies/${company}/statements/remaining.xml`)),
    )
    check(
      `R2 ${phase} race reports partial-loss risk without inventing full preservation`,
      (await getIncident(db, root, raceId)).preservation === 'too_late' &&
        (phase === 'list' ? Boolean(original) : !original) &&
        Boolean(await db.prepare('SELECT id FROM documents WHERE company_id = ?').bind(company).first()),
    )
    await closeIncident(db, second, raceId, ref)
    await purgeCompany({ DB: db, FILES: files }, company, today)
  }

  // Ordinary removal must never leave an untracked R2 delete racing a newly opened case.
  await make('co-retired-paper')
  await db.prepare("UPDATE companies SET ends_on = ? WHERE id = 'co-retired-paper'").bind(day(-5)).run()
  const retiredId = crypto.randomUUID(),
    activeId = crypto.randomUUID()
  const retiredKey = `companies/co-retired-paper/papers/${retiredId}.pdf`,
    activeKey = `companies/co-retired-paper/papers/${activeId}.pdf`
  for (const [paperId, key] of [
    [retiredId, retiredKey],
    [activeId, activeKey],
  ]) {
    await files.put(key, '%PDF-1.4 retained handover')
    await db
      .prepare(
        "INSERT INTO company_files (id, company_id, kind, created_at, created_by, file_name, file_type, file_size, r2_key) VALUES (?1, 'co-retired-paper', 'handover', ?2, ?3, 'retained.pdf', 'application/pdf', 26, ?4)",
      )
      .bind(paperId, nowS, accountant.id, key)
      .run()
  }
  res = await acc.post(`/ucto/klienti/co-retired-paper/odovzdanie/${retiredId}/odstranit`, {})
  const retired = await db.prepare('SELECT * FROM company_files WHERE id = ?').bind(retiredId).first()
  check(
    'ordinary removal retains the original and provenance instead of issuing an immediate R2 delete',
    res.status === 303 && retired.deleted_at !== null && retired.deleted_by === accountant.id && Boolean(await files.head(retiredKey)),
  )
  check(
    'a retired attachment is inaccessible through the ordinary download route',
    (await acc.get(`/ucto/klienti/co-retired-paper/odovzdanie/${retiredId}`)).status === 404,
  )
  const twice = await acc.post(`/ucto/klienti/co-retired-paper/odovzdanie/${retiredId}/odstranit`, {})
  check(
    'repeating retirement cannot create a second success event',
    twice.status === 404 &&
      (await db.prepare("SELECT COUNT(*) AS n FROM events WHERE subject = ? AND action = 'handover.removed'").bind(retiredId).first()).n === 1,
  )
  if (capture) writeFileSync(`${capture}/handover-retirement.html`, await (await acc.get('/ucto/klienti/co-retired-paper')).text())
  const paperCase = await openIncident(db, root, input('co-retired-paper'))
  check(
    'an incident opened after retirement still preserves the retired source and its metadata',
    (await getIncident(db, root, paperCase)).preservation === 'held' && Boolean(await files.head(retiredKey)) && retired.r2_key === retiredKey,
  )
  res = await acc.post(`/ucto/klienti/co-retired-paper/odovzdanie/${activeId}/odstranit`, {})
  check(
    'an active incident also blocks retirement itself without logging a false success',
    res.status === 409 &&
      (await db.prepare('SELECT deleted_at FROM company_files WHERE id = ?').bind(activeId).first()).deleted_at === null &&
      (await db.prepare("SELECT COUNT(*) AS n FROM events WHERE subject = ? AND action = 'handover.removed'").bind(activeId).first()).n === 0,
  )
  const co = companyOf(await db.prepare("SELECT * FROM companies WHERE id = 'co-retired-paper'").first())
  const portable = await exportYear({ DB: db, FILES: files }, co, String(today.slice(0, 4)), null, today)
  const zip = unzip(new Uint8Array(await new Response(portable.body).arrayBuffer()))
  const metadata = JSON.parse(new TextDecoder().decode(zip.find((x) => x.name === 'data/prilohy.json').data))
  check(
    'the full portable archive labels retired originals and includes their removal metadata',
    zip.some((x) => x.name.startsWith('odobrane-prilohy/') && new TextDecoder().decode(x.data).includes('retained handover')) &&
      metadata.find((x) => x.id === retiredId)?.deleted_by === accountant.id,
  )
  await requestRelease(db, root, paperCase, ref)
  await approveRelease(db, second, paperCase)
  await closeIncident(db, second, paperCase, ref)
  const concurrentRetirement = await Promise.all([acc.post(`/ucto/klienti/co-retired-paper/odovzdanie/${activeId}/odstranit`, {}), acc.post(`/ucto/klienti/co-retired-paper/odovzdanie/${activeId}/odstranit`, {})])
  check('concurrent attachment retirement records exactly one successful mutation', concurrentRetirement.filter((r) => r.status === 303).length === 1 && concurrentRetirement.every((r) => [303,404,409].includes(r.status)) && (await db.prepare("SELECT COUNT(*) AS n FROM events WHERE subject = ? AND action = 'handover.removed'").bind(activeId).first()).n === 1)
  await db.prepare("UPDATE companies SET ends_on = ? WHERE id = 'co-retired-paper'").bind(day(-1900)).run()
  await confirm('co-retired-paper')
  await purgeCompany({ DB: db, FILES: files }, 'co-retired-paper', today)
  await db
    .prepare("UPDATE companies SET purge_started_at = ? WHERE id = 'co-retired-paper'")
    .bind(nowS - 86401)
    .run()
  await purgeCompany({ DB: db, FILES: files }, 'co-retired-paper', today)
  check(
    'released retired originals are deleted only by controlled retention after acknowledged handover',
    !(await files.head(retiredKey)) &&
      !(await files.head(activeKey)) &&
      !(await db.prepare('SELECT id FROM company_files WHERE id = ?').bind(retiredId).first()),
  )

  await make('co-paper-upload')
  await confirm('co-paper-upload')
  let uncommittedKey
  const freezingFiles = {
    async put(key, bytes, options) {
      uncommittedKey = key
      await files.put(key, bytes, options)
      await purgeCompany({ DB: db, FILES: files }, 'co-paper-upload', today)
    },
    delete: (key) => files.delete(key),
  }
  let rolledBack = false
  try {
    await keepPaper(db, freezingFiles, { company: 'co-paper-upload', user: accountant.id }, 'handover', {
      name: 'new.pdf',
      bytes: new TextEncoder().encode('%PDF-1.4 rollback fixture'),
    })
  } catch {
    rolledBack = true
  }
  check(
    'a handover frozen during a new upload rolls back SQL and removes only the uncommitted object',
    rolledBack &&
      uncommittedKey &&
      !(await files.head(uncommittedKey)) &&
      !(await db.prepare("SELECT id FROM company_files WHERE company_id = 'co-paper-upload'").first()) &&
      Boolean(await files.head('companies/co-paper-upload/documents/original.pdf')),
  )
  await db
    .prepare("UPDATE companies SET purge_started_at = ? WHERE id = 'co-paper-upload'")
    .bind(nowS - 86401)
    .run()
  await purgeCompany({ DB: db, FILES: files }, 'co-paper-upload', today)

  // The client never confirmed its archives: kept while it may still take them, gone a year past the last day.
  await make('co-unconfirmed')
  await db.prepare("UPDATE companies SET ends_on = ? WHERE id = 'co-unconfirmed'").bind(day(-370)).run()
  await purgeCompany({ DB: db, FILES: files }, 'co-unconfirmed', today)
  check('an unconfirmed archive stays intact one year after the end', (await db.prepare("SELECT purge_started_at FROM companies WHERE id = 'co-unconfirmed'").first()).purge_started_at === null)
  await db.prepare('UPDATE companies SET ends_on = ? WHERE id = ?').bind(day(-1900), 'co-unconfirmed').run()
  await purgeCompany({ DB: db, FILES: files }, 'co-unconfirmed', today)
  await db.prepare('UPDATE companies SET purge_started_at = ? WHERE id = ?').bind(nowS - 86401, 'co-unconfirmed').run()
  await purgeCompany({ DB: db, FILES: files }, 'co-unconfirmed', today)
  check(
    'after five years an unconfirmed archive follows the same controlled erasure as confirmed data',
    Boolean((await db.prepare("SELECT purged_at FROM companies WHERE id = 'co-unconfirmed'").first()).purged_at) &&
      !(await db.prepare("SELECT id FROM documents WHERE company_id = 'co-unconfirmed'").first()) &&
      !(await files.head('companies/co-unconfirmed/documents/original.pdf')),
  )

  await make('co-records-evidence', 'purged')
  await db.prepare("UPDATE companies SET ends_on = '2010-01-01' WHERE id = 'co-records-evidence'").run()
  const recordCase = await openIncident(db, root, input('co-records-evidence'))
  check(
    'a case opened after the accounting purge promises only the records still retained',
    (await getIncident(db, root, recordCase)).preservation === 'records_only',
  )
  await db
    .prepare("INSERT INTO users (id, created_at, email, name, team) VALUES ('case-departed', ?, 'departed@case.test', 'Former case owner', 'accountant')")
    .bind(nowS)
    .run()
  await assignIncident(db, root, recordCase, 'case-departed', second.id, 0)
  await db.prepare("UPDATE users SET team = NULL WHERE id = 'case-departed'").run()
  check(
    'a revoked case owner cannot modify retention review through a stale role',
    !(await reviewHold(db, { id: 'case-departed', team: 'accountant' }, recordCase, today, ref)),
  )
  await assignIncident(db, root, recordCase, accountant.id, second.id, 1)
  await forgetRecords({ DB: db, FILES: files }, today)
  check(
    'a records-only hold also blocks the final retention cleanup',
    Boolean(await db.prepare("SELECT id FROM companies WHERE id = 'co-records-evidence'").first()),
  )
  return { retainedIncident: recordCase }
}
