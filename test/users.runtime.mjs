// Používatelia (27 October 2026, team/people.ts): the administrator sees everybody Firmony knows by e-mail, with the
// contact, what each is to us and the last activity; filters and a search find them; one person's page shows all of
// it; the list for Excel needs a fresh passkey; an accountant never gets there; no birth number is on it.
import { check } from './check.mjs'
import { writeFileSync } from 'node:fs'

export async function checkUsers({ db, admin, acc, lucia, nowS, capture }) {
  const boss = await db.prepare("SELECT id FROM users WHERE email = 'ahoj@firmony.io'").first()
  await db.batch([
    db
      .prepare(
        `INSERT INTO requests (id, created_at, ico, company, plan, situation, name, email, phone, note, source, privacy_version, status)
         VALUES ('rq-users', ?, '63335699', 'TEST-ONLY Záujem s. r. o.', 'rast', 'first', 'Zuzana Záujemná', 'zaujemca@firmony.test', '+421 900 111 222', 'TEST-ONLY poznámka', 'utm_source=test-ig', '2026-10-27', 'new')`,
      )
      .bind(nowS - 100),
    db
      .prepare("INSERT INTO investor_requests (id, created_at, updated_at, email, brokers, way, source, privacy_version) VALUES ('inv-users', ?, ?, 'investor-users@firmony.test', 'xtb,t212', 'sam', NULL, '2026-10-27')")
      .bind(nowS - 50, nowS - 50),
  ])
  const page = (path) => admin.get(path).then(async (r) => ({ status: r.status, html: (await r.text()).replace(/[  ]/g, ' ') }))
  let res = await page('/ucto/pouzivatelia')
  if (capture) writeFileSync(`${capture}/users.html`, res.html)
  check(
    'users: the administrator sees everybody with e-mail, phone, what each is and the firm',
    res.status === 200 && res.html.includes('zaujemca@firmony.test') && res.html.includes('+421 900 111 222') && res.html.includes('investor-users@firmony.test') && res.html.includes('ahoj@firmony.io') &&
      ['Záujemca', 'Investor', 'Tím', 'Klient'].every((k) => res.html.includes(`>${k}</span>`)) && res.html.includes('TEST-ONLY Záujem s. r. o.') && res.html.includes('href="/ucto/pouzivatelia"'),
  )
  check('users: no birth number and nothing inline', !/\b\d{6}\/\d{3,4}\b/.test(res.html) && !/<script>/.test(res.html) && !/ style=/i.test(res.html))
  res = await page('/ucto/pouzivatelia?kto=zaujemcovia')
  check('users: a filter shows only its people', res.status === 200 && res.html.includes('zaujemca@firmony.test') && !res.html.includes('investor-users@firmony.test') && !res.html.includes('mailto:ahoj@firmony.io'))
  res = await page('/ucto/pouzivatelia?hladat=900111222')
  check('users: a search finds a phone typed without spaces', res.status === 200 && res.html.includes('zaujemca@firmony.test') && !res.html.includes('investor-users@firmony.test'))
  res = await page('/ucto/pouzivatelia?hladat=63335699')
  check('users: and a firm by its IČO', res.html.includes('zaujemca@firmony.test'))
  res = await page('/ucto/pouzivatelia/r-rq-users')
  if (capture) writeFileSync(`${capture}/user.html`, res.html)
  check('users: a lead\'s page shows the request, its source and note', res.status === 200 && res.html.includes('Žiadosti z webu') && res.html.includes('utm_source=test-ig') && res.html.includes('TEST-ONLY poznámka') && res.html.includes('Hľadá účtovnú firmu'))
  res = await page(`/ucto/pouzivatelia/u-${boss.id}`)
  check('users: an account\'s page shows its passkeys and its last activities', res.status === 200 && res.html.includes('Prihlasovacie kľúče') && res.html.includes('Posledné aktivity'))
  check('users: an unknown person is not found', (await admin.get('/ucto/pouzivatelia/u-nikto')).status === 404)
  check('users: an accountant never gets there', (await acc.get('/ucto/pouzivatelia')).status === 404 && (await acc.get('/ucto/pouzivatelia.csv')).status !== 200)
  check("users: the accountant's menu does not lead there", !(await (await acc.get('/ucto')).text()).includes('/ucto/pouzivatelia'))

  // His account alone: another administrator does not get there either, nor sees the people's e-mails on a client.
  await db.prepare("UPDATE users SET team = 'admin' WHERE id = ?").bind(lucia.id).run()
  check('users: another administrator never gets there', (await acc.get('/ucto/pouzivatelia')).status === 404 && !(await (await acc.get('/ucto')).text()).includes('/ucto/pouzivatelia'))
  await db.prepare("UPDATE users SET team = 'accountant' WHERE id = ?").bind(lucia.id).run()
  const client = await db.prepare("SELECT c.id, u.email FROM companies c JOIN members m ON m.company_id = c.id JOIN users u ON u.id = m.user_id WHERE c.accountant_id = ? AND c.invoicing_only = 0 LIMIT 1").bind(lucia.id).first()
  if (client) {
    const hers = await (await acc.get(`/ucto/klienti/${client.id}`)).text()
    const his = await (await admin.get(`/ucto/klienti/${client.id}`)).text()
    check("users: an accountant sees her client's people by name, never their e-mails; the owner does", !hers.includes(`>${client.email}<`) && his.includes(`>${client.email}<`))
  }

  // The list for Excel: a fresh passkey first, then every person of the filter with the columns, and the event.
  await db.prepare('UPDATE sessions SET verified_at = ? WHERE user_id = ?').bind(Math.floor(Date.now() / 1000) - 301, boss.id).run()
  let csv = await admin.get('/ucto/pouzivatelia.csv')
  check('users: the download asks for a fresh confirmation first', csv.status === 303 && (csv.headers.get('location') ?? '').startsWith('/auth?next='))
  await db.prepare('UPDATE sessions SET verified_at = ? WHERE user_id = ?').bind(Math.floor(Date.now() / 1000), boss.id).run()
  csv = await admin.get('/ucto/pouzivatelia.csv?kto=zaujemcovia')
  const text = await csv.text()
  const lines = text.replace(/^﻿/, '').split('\r\n').filter(Boolean)
  check(
    'users: confirmed, the file holds the filter\'s people with their columns',
    csv.status === 200 && (csv.headers.get('content-disposition') ?? '').includes('attachment') && lines[0].startsWith('E-mail;Meno;Telefón;Kto je') &&
      lines.some((l) => l.startsWith("zaujemca@firmony.test;Zuzana Záujemná;'+421 900 111 222;Záujemca;")) && !text.includes('investor-users@firmony.test'),
  )
  check('users: the download is in the events', Boolean(await db.prepare("SELECT 1 AS x FROM events WHERE action = 'people.exported' AND user_id = ?").bind(boss.id).first()))
}
