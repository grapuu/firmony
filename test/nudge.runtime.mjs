// Nudges for what a newcomer left unfinished (team/nudge.ts), in workerd's D1: the director who did not send the
// declaration, the director told that the contract may be concluded and reminded, the founder of an application left
// open, and a new client whose first steps are not done. Each on its day at nine, once, with a new link where the
// email carries one (the one before an order stops working), and nothing stale long after.
import { check } from './check.mjs'
import { nudge, contractCatalogueHash, orderOfferHash, orderOf } from '../.wrangler/dist/stores.js'
import { ensureAmlOfficer, seedAmlDossier, testDeclaration } from './aml.runtime.mjs'

const DAY = 86400
const HOUR = 3600_000
const BRATISLAVA = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Bratislava', hour: '2-digit', hourCycle: 'h23' })

/** The next 9:05 in Bratislava after a moment. */
function nineAfter(ms) {
  let t = Math.floor(ms / HOUR) * HOUR + 5 * 60_000
  while (t <= ms || BRATISLAVA.format(new Date(t)) !== '09') t += HOUR
  return t
}

export async function checkNudgeRuntime({ db, files }) {
  const origin = 'https://firmony.io'
  const at = nineAfter(Date.now())
  const ts = Math.floor(at / 1000)
  const release = JSON.stringify({ catalogueHash: await contractCatalogueHash(), legalReview: 'TEST ONLY lawyer', insuranceReview: 'TEST ONLY insurer', validUntil: Math.floor(Date.now() / 1000) + 30 * DAY })
  const env = { DB: db, FILES: files, CONTRACT_RELEASE: release }
  const officer = await ensureAmlOfficer(db)

  check(
    'nudge: a step goes out within two days of its day, the latest one not sent, nothing before or long after',
    nudge.dueStep(0, [2, 5], 0, 2 * DAY) === 0 && nudge.dueStep(0, [2, 5], 0, 4 * DAY - 1) === 0 && nudge.dueStep(0, [2, 5], 0, 4 * DAY) === null &&
      nudge.dueStep(0, [2, 5], 0, 5 * DAY) === 1 && nudge.dueStep(0, [2, 5], 1, 3 * DAY) === null && nudge.dueStep(0, [2, 5], 2, 5 * DAY) === null &&
      nudge.dueStep(0, [2, 5], 0, DAY) === null && nudge.dueStep(0, [2, 5], 0, 30 * DAY) === null,
  )

  // Orders as the team leaves them: a link sent (its event), a standard review, a register's director.
  const order = async (id, { paper = false, sentAgo, reviewLeft = 5 * DAY, reviewed = true }) => {
    await db
      .prepare(
        `INSERT INTO orders (id,token,created_at,expires_at,ico,company,address,register_line,directors,plan,person,email,legal_form,aml_paper)
         VALUES (?,?,?,?,?,?,'TEST 12, Košice','TEST ONLY register',?,'rast','TEST ONLY Konateľ',?,'sro',?)`,
      )
      .bind(id, `${id}-hash`, ts - sentAgo - 600, ts + 25 * DAY, `9${String(Math.abs([...id].reduce((h, ch) => h * 31 + ch.charCodeAt(0), 7)) % 1e7).padStart(7, '0')}`,
        `TEST ONLY ${id} s. r. o.`, JSON.stringify([{ name: 'TEST ONLY Konateľ', role: 'Konateľ' }]), `${id}@nudge.test`, paper ? 1 : 0)
      .run()
    await db.prepare('INSERT INTO events (at, user_id, action, subject) VALUES (?, ?, ?, ?)').bind(ts - sentAgo, officer.id, paper ? 'aml.paper.intake.created' : 'contract.link.sent', id).run()
    if (!paper && reviewed) {
      const o = orderOf(await db.prepare('SELECT * FROM orders WHERE id = ?').bind(id).first())
      await db
        .prepare(`INSERT INTO order_reviews (order_id,reviewed_at,reviewed_by,decision,offer_hash,plan,evidence,accountant_id,expires_at) VALUES (?,?,?,'standard',?,'rast','TEST ONLY supported scope',?,?)`)
        .bind(id, ts - sentAgo, officer.id, await orderOfferHash(o), officer.id, Math.floor(Date.now() / 1000) + reviewLeft)
        .run()
    }
  }
  const tokenOf = async (id) => (await db.prepare('SELECT token FROM orders WHERE id = ?').bind(id).first())?.token
  const mails = async (id) => (await db.prepare("SELECT id, subject, body FROM outbox WHERE id LIKE ? ORDER BY created_at, id").bind(`order-nudge:${id}:%`).all()).results
  const nudges = async (id) => (await db.prepare("SELECT detail FROM events WHERE action = 'order.nudged' AND subject = ? ORDER BY id").bind(id).all()).results.map((e) => JSON.parse(e.detail))

  await order('nudge-decl', { sentAgo: 2 * DAY + 3600 })
  await order('nudge-expired', { sentAgo: 2 * DAY + 3600, reviewLeft: -60 })
  await order('nudge-paper', { paper: true, sentAgo: 5 * DAY + 3600 })
  await order('nudge-old', { sentAgo: 9 * DAY })
  await order('nudge-fresh', { sentAgo: 3600 })

  // An application of the s. r. o. for 1 € left three days, and one its founder works on now.
  const founding = async (id, { openedAgo, touchedAgo, vs }) =>
    db
      .prepare("INSERT INTO foundings (id, created_at, expires_at, email, plan, vs, updated_at) VALUES (?, ?, ?, ?, 'start', ?, ?)")
      .bind(id, ts - openedAgo, ts - openedAgo + 14 * DAY, `${id}@nudge.test`, vs, ts - touchedAgo)
      .run()
  await founding('nudge-found', { openedAgo: 3 * DAY + 3600, touchedAgo: 2 * DAY, vs: '7209990001' })
  await founding('nudge-busy', { openedAgo: 3 * DAY + 3600, touchedAgo: 3600, vs: '7209990002' })

  // New clients three days after their contract: one with nothing done, one with every first step done.
  const client = async (id, inbox) => {
    await db.batch([
      db.prepare("INSERT INTO companies (id, created_at, name, ico, plan, inbox, contract_at) VALUES (?, ?, ?, ?, 'start', ?, ?)").bind(id, ts - 4 * DAY, `TEST ONLY ${id} s. r. o.`, inbox.replace(/\D/g, '').padStart(8, '9').slice(0, 8), inbox, ts - 3 * DAY - 7200),
      db.prepare('INSERT INTO users (id, created_at, email, name) VALUES (?, ?, ?, ?)').bind(`${id}-owner`, ts - 4 * DAY, `${id}@nudge.test`, 'TEST ONLY Majiteľ'),
      db.prepare("INSERT INTO members (company_id, user_id, role, created_at) VALUES (?, ?, 'owner', ?)").bind(id, `${id}-owner`, ts - 4 * DAY),
    ])
  }
  await client('nudge-new', 'nudge01')
  await client('nudge-done', 'nudge02')
  await db.batch([
    db.prepare("INSERT INTO declarations (id, company_id, created_at, created_by, data) VALUES ('nudge-done-decl', 'nudge-done', ?, 'nudge-done-owner', '{}')").bind(ts - 3 * DAY),
    db.prepare("INSERT INTO company_files (id, company_id, kind, created_at, file_name, file_type, file_size, r2_key) VALUES ('nudge-done-poa', 'nudge-done', 'poa', ?, 'TEST_ONLY.pdf', 'pdf', 10, 'companies/nudge-done/papers/x.pdf')").bind(ts - 3 * DAY),
    db.prepare("INSERT INTO accounts (id, company_id, iban) VALUES ('nudge-done-acc', 'nudge-done', 'SK3112000000198742637541')"),
    db.prepare("INSERT INTO payments (id, company_id, account_id, created_at, booked_on, amount_cents, ref) VALUES ('nudge-done-pay', 'nudge-done', 'nudge-done-acc', ?, '2026-10-01', -1240, 'nudge-done-1')").bind(ts - 3 * DAY),
    db.prepare("INSERT INTO documents (id, company_id, created_at, source, status) VALUES ('nudge-done-doc', 'nudge-done', ?, 'upload', 'read')").bind(ts - 3 * DAY),
  ])

  const before = { decl: await tokenOf('nudge-decl') }
  let count = await nudge.nudgeScheduled(env, at, origin)
  let m = await mails('nudge-decl')
  check(
    'nudge: two days after the link, the director without a declaration gets a new link and the one before stops',
    m.length === 1 && m[0].subject === 'Firmony: dokončite podklady pre spoluprácu' && m[0].body.includes('TEST ONLY nudge-decl s. r. o.') && m[0].body.includes('predchádzajúci odkaz už neplatí') &&
      /https:\/\/firmony\.io\/objednavka\/[A-Za-z0-9_-]{43}/.test(m[0].body) && (await tokenOf('nudge-decl')) !== before.decl && JSON.stringify(await nudges('nudge-decl')) === '[{"stage":"declaration","step":0}]',
    JSON.stringify(m),
  )
  check('nudge: the link in the email is the one the order now has', await (async () => {
    const token = m[0].body.match(/objednavka\/([A-Za-z0-9_-]{43})/)?.[1] ?? ''
    const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)))].map((b) => b.toString(16).padStart(2, '0')).join('')
    return hash === await tokenOf('nudge-decl')
  })())
  check('nudge: an order whose reviewed offer ran out waits for the team, not the director', (await mails('nudge-expired')).length === 0 && (await tokenOf('nudge-expired')) === 'nudge-expired-hash')
  m = await mails('nudge-paper')
  check('nudge: a paper intake is reminded on its second day, five days after its link', m.length === 1 && JSON.stringify(await nudges('nudge-paper')) === '[{"stage":"declaration","step":1}]')
  check('nudge: a link sent long ago or just now is left alone', (await mails('nudge-old')).length === 0 && (await mails('nudge-fresh')).length === 0)

  const fEvents = async (id) => (await db.prepare("SELECT note FROM founding_events WHERE founding_id = ? AND action = 'nudged'").bind(id).all()).results
  const fMail = await db.prepare("SELECT subject, body FROM outbox WHERE id LIKE 'bell:founding-nudge:nudge-found:%'").first()
  check(
    'nudge: an application left open three days is reminded with a new link and the day it is open until, recorded among its events',
    fMail?.subject === 'Firmony: prihláška na založenie s. r. o.' && fMail.body.includes('dokončíte do') && /\/zalozenie\/[A-Za-z0-9_-]{43}/.test(fMail.body) &&
      JSON.stringify(await fEvents('nudge-found')) === '[{"note":"Pripomienka 1"}]' &&
      Number((await db.prepare("SELECT COUNT(*) AS n FROM founding_links WHERE founding_id = 'nudge-found'").first())?.n) === 1,
    JSON.stringify(fMail),
  )
  check('nudge: a founder at work on the application is not disturbed', (await fEvents('nudge-busy')).length === 0)

  const steps = async (id) => (await db.prepare("SELECT recipient FROM outbox WHERE id LIKE ?").bind(`bell:first-steps:${id}:%`).all()).results.map((r) => r.recipient)
  check('nudge: a new client with first steps not done gets a doorbell to the overview', JSON.stringify(await steps('nudge-new')) === '["nudge-new@nudge.test"]' &&
    (await db.prepare("SELECT body FROM outbox WHERE id LIKE 'bell:first-steps:nudge-new:%'").first())?.body.includes('https://firmony.io/app'))
  check('nudge: a client with every first step done gets nothing', (await steps('nudge-done')).length === 0)
  check('nudge: the run says how many went out', count >= 4, String(count))

  // The same morning again: nothing twice.
  count = await nudge.nudgeScheduled(env, at, origin)
  check('nudge: a second run of the same morning sends nothing again',
    (await mails('nudge-decl')).length === 1 && (await fEvents('nudge-found')).length === 1 && (await steps('nudge-new')).length === 1 && (await nudges('nudge-paper')).length === 1)
  check('nudge: and nothing outside nine', (await nudge.nudgeScheduled(env, at + 2 * HOUR, origin)) === 0)

  // Identified: the director is told at once, then reminded while the contract may be concluded.
  await order('nudge-admit', { sentAgo: 3 * DAY })
  await seedAmlDossier(db, files, 'nudge-admit', officer, { ...testDeclaration(), director: { ...testDeclaration().director, name: 'TEST ONLY Konateľ' } })
  check('nudge: without released terms nobody is told', !(await nudge.tellAdmitted({ DB: db, FILES: files }, 'nudge-admit', origin, ts)))
  check('nudge: with them the director is told that the contract is ready, with a new link', await nudge.tellAdmitted(env, 'nudge-admit', origin, ts))
  m = await mails('nudge-admit')
  check('nudge: the email says the identification is done and where to conclude', m.length === 1 && m[0].subject === 'Firmony: zmluva je pripravená' && m[0].body.includes('overenie podkladov') && JSON.stringify(await nudges('nudge-admit')) === '[{"stage":"contract","step":0}]')
  check('nudge: and only once', !(await nudge.tellAdmitted(env, 'nudge-admit', origin, ts)) && (await mails('nudge-admit')).length === 1)
  await nudge.nudgeScheduled(env, at + 2 * DAY * 1000, origin)
  m = await mails('nudge-admit')
  // Both emails may be queued within one second: which came second is told by the events, not the outbox's order.
  check('nudge: two days later the contract not concluded is reminded', m.length === 2 && m.some((x) => x.subject === 'Firmony: zmluva čaká na uzavretie') && JSON.stringify((await nudges('nudge-admit')).at(-1)) === '{"stage":"contract","step":1}', JSON.stringify(m.map((x) => x.subject)))

  // Approved with nobody told (the terms released later): the schedule tells the director a day after the approval.
  await order('nudge-late', { sentAgo: 3 * DAY })
  await seedAmlDossier(db, files, 'nudge-late', officer, { ...testDeclaration(), director: { ...testDeclaration().director, name: 'TEST ONLY Konateľ' } })
  await nudge.nudgeScheduled(env, at, origin)
  check('nudge: an approval of today is left to its own notice', (await mails('nudge-late')).length === 0)
  await nudge.nudgeScheduled(env, at + DAY * 1000, origin)
  m = await mails('nudge-late')
  check('nudge: a day after it, the schedule tells the director nobody told', m.length === 1 && m[0].subject === 'Firmony: zmluva je pripravená')
}
