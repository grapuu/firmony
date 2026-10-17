// Local recovery drill. The fixture application is quiescent while this consistent SQL snapshot is captured.
// It does not connect to a Cloudflare account, create a production backup or restore over an existing database.
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { createHash } from 'node:crypto'
import { check } from './check.mjs'
import { evidenceBlocked, forgetRecords, resolveContract } from '../.wrangler/dist/stores.js'

const hash = (value) => createHash('sha256').update(value).digest('hex')
const quote = (s) => `"${s.replaceAll('"', '""')}"`
const normalizedRows = (rows) =>
  JSON.stringify(
    rows
      .map((row) => Object.fromEntries(Object.entries(row).sort(([a], [b]) => a.localeCompare(b))))
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
  )
const persistent = (name) => !/^(?:sqlite_|_cf_)/.test(name)
const canonicalMetadata = (object) =>
  JSON.stringify({
    http: object.httpMetadata ?? {},
    custom: object.customMetadata ?? {},
  })
function validate(backup) {
  if (hash(JSON.stringify(backup.manifest)) !== backup.manifestHash) throw new Error('Backup manifest integrity failure')
  if (hash(JSON.stringify(backup.schema)) !== backup.manifest.schema) throw new Error('Backup schema integrity failure')
  for (const item of backup.manifest.tables)
    if (hash(normalizedRows(backup.rows.get(item.name))) !== item.sha256) throw new Error('Backup rows integrity failure')
  for (const item of backup.manifest.objects) {
    const object = backup.objects.get(item.key)
    if (!object || hash(object.bytes) !== item.sha256 || object.bytes.length !== item.bytes || hash(canonicalMetadata(object)) !== item.metadata)
      throw new Error('Backup object integrity failure')
  }
}
export async function checkRestore({ db, files, annaCookie, site, today, nowS }) {
  // Include an original with metadata and a held company in addition to the existing accounting/contracts state.
  await db
    .prepare("INSERT INTO companies (id, created_at, name, plan, inbox) VALUES ('co-restore', ?, 'Obnova test s. r. o.', 'start', 'restoreonly')")
    .bind(nowS)
    .run()
  const originalKey = 'companies/co-restore/documents/original.pdf'
  await files.put(originalKey, '%PDF-1.4 recovery fixture', {
    httpMetadata: { contentType: 'application/pdf' },
    customMetadata: { source: 'synthetic-drill' },
  })
  await db
    .prepare(
      "INSERT INTO documents (id, company_id, created_at, source, file_key, file_name, status) VALUES ('restore-doc', 'co-restore', ?, 'upload', ?, 'original.pdf', 'new')",
    )
    .bind(nowS, originalKey)
    .run()
  const schema = (
    await db
      .prepare("SELECT type, name, tbl_name, sql FROM sqlite_master WHERE sql IS NOT NULL AND type IN ('table','index','trigger') ORDER BY type, name")
      .all()
  ).results.filter((x) => persistent(x.name) && persistent(x.tbl_name))
  const tables = schema.filter((x) => x.type === 'table')
  const snapshots = await db.batch(tables.map((x) => db.prepare(`SELECT * FROM ${quote(x.name)}`)))
  const rows = new Map(tables.map((x, i) => [x.name, snapshots[i].results]))
  const objects = new Map()
  let cursor
  do {
    const listed = await files.list({ cursor, limit: 5 }) // deliberately cross listing pages
    for (const object of listed.objects) {
      const body = await files.get(object.key)
      if (!body) throw new Error('Snapshot changed while copying objects')
      objects.set(object.key, {
        bytes: Buffer.from(await body.arrayBuffer()),
        httpMetadata: body.httpMetadata,
        customMetadata: body.customMetadata,
      })
    }
    cursor = listed.truncated ? listed.cursor : undefined
  } while (cursor)
  const manifest = {
    format: 'firmony-local-restore-drill',
    schema: hash(JSON.stringify(schema)),
    tables: [...rows].map(([name, values]) => ({
      name,
      sha256: hash(normalizedRows(values)),
    })),
    objects: [...objects].map(([key, object]) => ({
      key,
      bytes: object.bytes.length,
      sha256: hash(object.bytes),
      metadata: hash(canonicalMetadata(object)),
    })),
  }
  const backup = {
    schema,
    rows,
    objects,
    manifest,
    manifestHash: hash(JSON.stringify(manifest)),
  }
  validate(backup)
  const damaged = new Map(objects)
  damaged.set(originalKey, {
    ...objects.get(originalKey),
    bytes: Buffer.from('corrupted'),
  })
  let refused = false
  try {
    validate({ ...backup, objects: damaged })
  } catch {
    refused = true
  }
  check('the recovery manifest rejects a changed original before restoration', refused)
  const missing = new Map(objects)
  missing.delete(originalKey)
  refused = false
  try {
    validate({ ...backup, objects: missing })
  } catch {
    refused = true
  }
  check('the recovery manifest rejects a missing original', refused)
  const badRows = new Map(rows)
  badRows.set('companies', [])
  refused = false
  try {
    validate({ ...backup, rows: badRows })
  } catch {
    refused = true
  }
  check('the recovery manifest rejects missing or altered SQL data', refused)

  const dist = new URL('../.wrangler/dist', import.meta.url).pathname
  const restored = new Miniflare(
    convertV4MiniflareOptions({
      cf: false,
      workers: [
        {
          name: 'restored',
          modulesRoot: dist,
          modules: [{ type: 'ESModule', path: `${dist}/index.js` }],
          compatibilityDate: '2026-10-01',
          d1Databases: { DB: 'isolated-restore-drill' },
          r2Buckets: { FILES: 'isolated-restored-files' },
          outboundService: () => new Response('offline recovery drill', { status: 599 }),
        },
      ],
    }),
  )
  try {
    const target = await restored.getD1Database('DB'),
      targetFiles = await restored.getR2Bucket('FILES')
    check(
      'recovery starts in a different empty database and bucket',
      (await target.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name = 'companies'").first()).n === 0 &&
        (await targetFiles.list()).objects.length === 0,
    )
    await target.batch(tables.map((x) => target.prepare(x.sql)))
    const inserts = []
    for (const [name, values] of rows)
      for (const row of values) {
        const cols = Object.keys(row)
        inserts.push(
          target
            .prepare(`INSERT INTO ${quote(name)} (${cols.map(quote).join(',')}) VALUES (${cols.map(() => '?').join(',')})`)
            .bind(...cols.map((key) => row[key])),
        )
      }
    // All inserts share one deferred-FK transaction. Business triggers are installed only after the snapshot data.
    await target.batch([target.prepare('PRAGMA defer_foreign_keys = ON'), ...inserts])
    await target.batch(schema.filter((x) => x.type !== 'table').map((x) => target.prepare(x.sql)))
    let equal = true
    for (const [name, values] of rows)
      if (hash(normalizedRows((await target.prepare(`SELECT * FROM ${quote(name)}`).all()).results)) !== hash(normalizedRows(values))) equal = false
    check('every business table round-trips into an independent real D1 database', equal)
    check('restored foreign keys are consistent', (await target.prepare('PRAGMA foreign_key_check').all()).results.length === 0)
    for (const [key, object] of objects)
      await targetFiles.put(key, object.bytes, {
        httpMetadata: object.httpMetadata,
        customMetadata: object.customMetadata,
      })
    let objectsEqual = true
    for (const [key, expected] of objects) {
      const actual = await targetFiles.get(key)
      if (!actual || hash(Buffer.from(await actual.arrayBuffer())) !== hash(expected.bytes) || canonicalMetadata(actual) !== canonicalMetadata(expected))
        objectsEqual = false
    }
    check('every original and its metadata survives recovery across object listing pages', objectsEqual && objects.size > 5)
    const contracts = (await target.prepare('SELECT company_id, terms_version, sha256 FROM contract_snapshots').all()).results
    check(
      'restored contracts verify against their acceptance-time SHA-256',
      contracts.length > 0 &&
        (
          await Promise.all(
            contracts.map(async (row) => {
              const s = await resolveContract(target, row.company_id, row.terms_version)
              return s.status === 'snapshot' && s.sha256 === row.sha256
            }),
          )
        ).every(Boolean),
    )
    check('incident holds survive restoration', await evidenceBlocked(target, 'co-records-evidence'))
    await forgetRecords({ DB: target, FILES: targetFiles }, today)
    check('restored holds still prevent retention deletion', Boolean(await target.prepare("SELECT id FROM companies WHERE id = 'co-records-evidence'").first()))
    let immutable = false
    try {
      await target.prepare("DELETE FROM incident_events WHERE company_id = 'co-records-evidence'").run()
    } catch {
      immutable = true
    }
    check('recovery restores the SQL evidence guards as well as their rows', immutable)
    // Never make old bearer credentials live after rolling time backwards. Public-key registrations survive.
    const keys = (await target.prepare('SELECT COUNT(*) AS n FROM passkeys').first()).n
    await target.batch([
      target.prepare('DELETE FROM auth_challenges'),
      target.prepare('DELETE FROM sessions'),
      target.prepare('DELETE FROM login_links'),
      target.prepare('UPDATE auth_grants SET revoked_at = ? WHERE used_at IS NULL AND revoked_at IS NULL').bind(nowS),
      target.prepare('DELETE FROM outbox WHERE sent_at IS NULL'),
      target.prepare("INSERT INTO events (at, action, detail) VALUES (?, 'recovery.local-drill', ?)").bind(
        nowS,
        JSON.stringify({
          manifest: backup.manifestHash,
          source: 'synthetic, quiescent fixture',
          sessionsRevoked: true,
        }),
      ),
    ])
    const old = await restored.dispatchFetch(`${site}/app`, {
      redirect: 'manual',
      headers: { cookie: annaCookie },
    })
    check('a recovered application rejects pre-restore browser sessions', old.status === 303 && old.headers.get('location') === '/app/prihlasenie')
    check(
      'mail links, challenges and unused recovery codes cannot resurrect after restoration',
      (
        await target
          .prepare(
            'SELECT (SELECT COUNT(*) FROM sessions) + (SELECT COUNT(*) FROM login_links) + (SELECT COUNT(*) FROM auth_challenges) + (SELECT COUNT(*) FROM auth_grants WHERE used_at IS NULL AND revoked_at IS NULL) AS n',
          )
          .first()
      ).n === 0,
    )
    check(
      'recovery keeps the registered public keys and consumed bootstrap history',
      keys > 0 &&
        (await target.prepare('SELECT COUNT(*) AS n FROM passkeys').first()).n === keys &&
        Boolean(await target.prepare('SELECT id FROM auth_bootstrap').first()),
    )
  } finally {
    await restored.dispose()
  }
}
