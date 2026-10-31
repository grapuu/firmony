// Every migration on an empty database, with the trigger set compared around the steps that recreate tables
// (31 October 2026): step 92 dropped `links` and with it several triggers; no later step may leave a trigger
// that step 91 had missing or changed, unless it replaces it with the identical SQL from the same generator.
import { check } from './check.mjs'
import { MIGRATIONS } from '../.wrangler/dist/stores.js'

export async function checkMigrations({ mf }) {
  const db = await mf.getD1Database('DB_MIGRATIONS')
  const run = async (from, to) => {
    for (let step = from; step < to; step++) {
      const statements = (MIGRATIONS[step] ?? []).map((sql) => db.prepare(sql))
      await db.batch(statements)
    }
  }
  const triggers = async () => {
    const rows = await db.prepare("SELECT name, sql FROM sqlite_master WHERE type = 'trigger' AND name NOT LIKE 'sqlite_%'").all()
    return new Map(rows.results.map((r) => [String(r.name), String(r.sql ?? '').replace(/\s+/g, ' ').trim()]))
  }
  // Steps are one-based in the comments, zero-based in the array: snapshot after step 91, then the rest.
  await run(0, 91)
  const before = await triggers()
  await run(91, MIGRATIONS.length)
  const after = await triggers()
  const lost = [...before].filter(([name, sql]) => after.get(name) !== sql)
  check('no trigger that step 91 had is missing or changed after the last step', lost.length === 0, JSON.stringify(lost.map(([name]) => name)))
}
