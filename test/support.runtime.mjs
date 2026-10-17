// Real D1 queries and HTTP pages. System notices with a human author must not close a client's response clock.
import { check } from './check.mjs'
import { writeFileSync } from 'node:fs'
import { teamClients, waitingThreads, teamCounts } from '../.wrangler/dist/stores.js'

export async function checkSupportQueue({ db, acc, admin, anna, nowS, lucia, boss }) {
  const own = { id: lucia.id, team: 'accountant' }
  const all = { id: boss.id, team: 'admin' }
  const other = { id: boss.id, team: 'accountant' }
  const ids = ['co-support', 'co-support-unassigned', 'co-support-foreign', 'co-support-demo', 'co-support-closed']
  const first = nowS - 7 * 86400
  for (const [i, id] of ids.entries())
    await db
      .prepare('INSERT INTO companies (id, created_at, name, plan, inbox, accountant_id, demo, closed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(
        id,
        first,
        i === 1 ? 'Nepridelená servisná spoločnosť s dlhým obchodným názvom s. r. o.' : `Support ${i}`,
        'start',
        id,
        i === 1 ? null : i === 2 ? boss.id : lucia.id,
        i === 3 ? 1 : 0,
        i === 4 ? nowS : null,
      )
      .run()
  const msg = (id, company, at, side, author, body = id) =>
    db
      .prepare('INSERT INTO messages (id, company_id, created_at, author, side, body) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(id, company, at, author, side, body)
      .run()
  const event = (id, company, author, action = 'message.answered') =>
    db.prepare('INSERT INTO events (at, company_id, user_id, action, subject) VALUES (?, ?, ?, ?, ?)').bind(nowS, company, author, action, id).run()
  const threads = (user = own, demo = false) => waitingThreads(db, user, demo)
  const pending = async () => (await threads()).find((t) => t.company.id === ids[0])
  const capture = (name, html) => {
    if (process.env.FIRMONY_CAPTURE_DIR) writeFileSync(`${process.env.FIRMONY_CAPTURE_DIR}/${name}.html`, html)
  }
  try {
    await msg('support-first', ids[0], first, 'client', 'u-a', 'Pôvodná otázka <script>nie je kód</script>')
    await msg('support-followup', ids[0], nowS - 3, 'client', 'u-a', 'Dopĺňam otázku')
    let p = await pending()
    check('support: a follow-up retains the first unanswered time and preview', p?.at === first && p.pending === 2 && p.body.startsWith('Pôvodná otázka'))
    await msg('support-auto', ids[0], nowS - 2, 'firmony', null)
    check('support: a system notice does not hide a pending question', (await pending())?.at === first)
    await msg('support-filed', ids[0], nowS - 1, 'firmony', lucia.id)
    await event('support-filed', ids[0], lucia.id, 'closing.filed')
    check('support: a filing notice attributed to an accountant is not a reply', (await pending())?.pending === 2)
    await db.prepare('UPDATE messages SET seen_at = ? WHERE company_id = ?').bind(nowS, ids[0]).run()
    check('support: reading a question does not answer it', (await pending())?.at === first)
    const row = (await teamClients(db, own, false)).find((r) => r.company.id === ids[0])
    check('support: the company list agrees with the inbox about the oldest wait', row?.waiting === first)
    check('support: the navigation counts companies rather than follow-up messages', (await teamCounts(db, own, false)).inbox === (await threads()).length)

    await msg('support-person-without-event', ids[0], nowS, 'firmony', lucia.id)
    check('support: a named message without the explicit reply audit does not close a clock', Boolean(await pending()))
    await event('support-person-without-event', ids[1], lucia.id)
    check('support: another company cannot lend its reply event', Boolean(await pending()))
    await event('support-person-without-event', ids[0], boss.id)
    check('support: a different event author cannot authenticate a personal reply', Boolean(await pending()))
    await msg('support-other-question', ids[2], first, 'client', 'u-b')
    await msg('support-other-reply', ids[2], nowS, 'firmony', boss.id)
    await event('support-other-reply', ids[2], boss.id)
    check('support: a legitimate reply in another company cannot close this question', Boolean(await pending()))
    for (const [i, id] of ids.entries()) if (i !== 0 && i !== 2) await msg(`support-question-${i}`, id, first - i * 100, 'client', 'u-a')
    check(
      'support: an accountant sees neither unassigned, foreign, closed nor demo conversations',
      (await threads()).filter((t) => ids.includes(t.company.id)).length === 1,
    )
    check(
      'support: demo mode includes demo conversations but never closed companies',
      (await threads(own, true)).some((t) => t.company.id === ids[3]) && !(await threads(own, true)).some((t) => t.company.id === ids[4]),
    )
    const adminThreads = await threads(all)
    check(
      'support: an administrator sees an unassigned question, ordered by its original age',
      adminThreads[0]?.company.id === ids[1] && adminThreads[0].company.accountantId === null,
    )
    check('support: client HTTP access to the team inbox is denied', (await anna.get('/ucto/spravy')).status === 404)
    let response = await admin.get('/ucto/spravy'),
      html = await response.text()
    capture('support-inbox', html)
    check(
      'support: the real inbox shows owner, unassigned escalation, deadline and message count',
      response.status === 200 &&
        html.includes('Lucia Horváthová') &&
        html.includes('Bez pridelenej účtovníčky') &&
        html.includes('Po termíne odpovede') &&
        /Bez odpovede: 2/.test(html) &&
        /<time datetime="[^"]+">/.test(html),
    )
    check('support: the pending preview escapes client-supplied markup', html.includes('&lt;script&gt;') && !html.includes('<script>nie je kód'))

    response = await acc.post(`/ucto/klienti/${ids[0]}/spravy`, { sprava: 'Osobná odpoveď ku všetkým otázkam.' })
    check('support: the actual reply route closes all earlier questions', response.status === 303 && !(await pending()))
    check(
      'support: personal replies retain an audit event linked to the message and author',
      Boolean(
        await db
          .prepare(
            "SELECT 1 FROM events e JOIN messages m ON m.id=e.subject AND m.company_id=e.company_id AND m.author=e.user_id WHERE e.company_id=? AND e.action='message.answered' AND m.body='Osobná odpoveď ku všetkým otázkam.'",
          )
          .bind(ids[0])
          .first(),
      ),
    )
    const replied = await db.prepare("SELECT created_at FROM messages WHERE company_id=? AND body='Osobná odpoveď ku všetkým otázkam.'").bind(ids[0]).first()
    check('support: the company list also clears its waiting time', (await teamClients(db, own, false)).find((r) => r.company.id === ids[0])?.waiting === null)
    html = await (await acc.get('/ucto/spravy')).text()
    capture('support-empty', html)
    check('support: the empty inbox is shown after the personal reply', html.includes('Všetkým klientom ste odpovedali'))
    await msg('support-same-second-after', ids[0], replied.created_at, 'client', 'u-a')
    p = await pending()
    check('support: a client message after the reply in the same second starts a new clock', p?.body === 'support-same-second-after' && p.pending === 1)
    await msg('support-same-second-auto', ids[0], replied.created_at, 'firmony', lucia.id)
    await event('support-same-second-auto', ids[0], lucia.id, 'client.reminded')
    await msg('support-same-second-followup', ids[0], replied.created_at, 'client', 'u-a')
    check(
      'support: notices and follow-ups in that second keep the new oldest question',
      (await pending())?.body === 'support-same-second-after' && (await pending())?.pending === 2,
    )
    await db.prepare('UPDATE companies SET accountant_id=? WHERE id=?').bind(boss.id, ids[0]).run()
    check(
      'support: reassignment moves the pending clock to the new owner without resetting it',
      !(await pending()) && (await threads(other)).find((t) => t.company.id === ids[0])?.at === replied.created_at,
    )
    check('support: counts remain consistent for the reassigned owner', (await teamCounts(db, other, false)).inbox === (await threads(other)).length)
    await msg('support-backdated-followup', ids[0], replied.created_at - 1, 'client', 'u-a')
    check(
      'support: chronological order takes precedence over a later row ID for older history',
      (await threads(other)).find((t) => t.company.id === ids[0])?.pending === 2,
    )
    const boundary = replied.created_at + 10
    await msg('support-before-answer', ids[0], boundary, 'client', 'u-a')
    await msg('support-boundary-answer', ids[0], boundary, 'firmony', boss.id)
    await event('support-boundary-answer', ids[0], boss.id)
    check('support: a reply clears questions preceding it in the same second', !(await threads(other)).some((t) => t.company.id === ids[0]))
    await msg('support-after-answer', ids[0], boundary, 'client', 'u-a')
    check('support: only the later question at that second remains pending', (await threads(other)).find((t) => t.company.id === ids[0])?.pending === 1)
  } finally {
    for (const id of ids)
      await db.batch([
        db.prepare('DELETE FROM events WHERE company_id=?').bind(id),
        db.prepare('DELETE FROM messages WHERE company_id=?').bind(id),
        db.prepare('DELETE FROM companies WHERE id=?').bind(id),
      ])
  }
}
