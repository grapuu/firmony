// Prehľad (team/overview.ts, 29 October 2026): the administrator's page of the whole firm, in workerd's D1. A client's
// documents are counted against its plan exactly as billing counts them (a deleted one, our invoice, a duplicate and the
// open items taken over count nothing; a duplicate whose original was deleted counts once), the month outgrown is said
// with the plan it is billed as, a larger plan is offered after two months of three, the administrators are rung once,
// the check by Claude gets no name and no message, and what it says that the data do not hold is left out.
import { check } from './check.mjs'
import { writeFileSync } from 'node:fs'
import { billingDrafts, monthStart, planUsages, planUsageScheduled, complains, numbersIn } from '../.wrangler/dist/stores.js'

const addMonths = (month, n) => {
  const i = Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1 + n
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`
}
const bratislavaDay = (seconds) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Bratislava' }).format(new Date(seconds * 1000))

export async function checkAdminOverview({ db, admin, acc, nowS, readings, capture }) {
  const plain = (html) => html.replace(/[\u00a0\u202f]/g, ' ')
  const month = bratislavaDay(nowS).slice(0, 7)
  const before = (n) => addMonths(month, -n)
  const ts = nowS
  await db.batch([
    db.prepare("INSERT INTO companies (id, created_at, name, ico, plan, inbox, contract_at, start_on) VALUES ('ov-co', ?, 'TEST-ONLY Balíky s. r. o.', '99112233', 'start', 'ovco0001', ?, ?)").bind(ts, ts, `${before(3)}-01`),
    db.prepare("INSERT INTO messages (id, company_id, created_at, author, side, body) VALUES ('ov-m1', 'ov-co', ?, NULL, 'client', 'Dobrý deň, mám SŤAŽNOSŤ, faktúra je zle zaúčtovaná.')").bind(ts - 3600),
    db.prepare("INSERT INTO messages (id, company_id, created_at, author, side, body) VALUES ('ov-m2', 'ov-co', ?, NULL, 'client', 'Ďakujem pekne, všetko v poriadku.')").bind(ts - 1800),
  ])
  // This month: 22 that count, a duplicate the accountant booked all the same (it counts), and a deleted one, our own
  // invoice, three taken over and a duplicate that count nothing; then the original of that duplicate is deleted, so it
  // is the only one left and counts.
  const inMonth = Math.max(monthStart(month) + 60, ts - 86400 * 2)
  const rows = []
  for (let i = 0; i < 22; i++) rows.push(['upload', null, null])
  rows.push(['upload', null, inMonth], ['firmony', null, null], ['takeover', null, null], ['takeover', null, null], ['takeover', null, null], ['upload', 'ov-d0', null], ['upload', 'ov-d1', null, ts])
  const docs = rows.map(([source, dup, deleted, booked = null], i) =>
    db.prepare('INSERT INTO documents (id, company_id, created_at, source, status, duplicate_of, deleted_at, booked_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(`ov-d${i}`, 'ov-co', Math.min(inMonth + i, ts), source, 'manual', dup, deleted, booked),
  )
  // The months before: 30 in the first and in the third before this one (more than Štart's 20), 10 in the second.
  for (const [n, count] of [[1, 30], [2, 10], [3, 30]])
    for (let i = 0; i < count; i++) docs.push(db.prepare("INSERT INTO documents (id, company_id, created_at, source, status) VALUES (?, 'ov-co', ?, 'upload', 'manual')").bind(`ov-p${n}-${i}`, monthStart(before(n)) + 3600 + i))
  await db.batch(docs)
  let usage = (await planUsages(db, ts)).find((u) => u.company.id === 'ov-co')?.usage
  check('overview: the month counts what came, once, without the deleted, our invoice, the duplicate and what was taken over', usage?.docs === 23 && usage.limit === 20, JSON.stringify(usage))
  check('overview: 23 of Štart\'s 20 is over the plan and billed as Rast, 80 € more', usage?.state === 'over' && usage.billedAs.id === 'rast' && usage.extraCents === 8000)
  check('overview: two of the three months before outgrew it, so Rast is offered', usage?.offer?.id === 'rast' && usage.history.map((h) => h.docs).join(',') === '30,10,30', JSON.stringify(usage?.history))
  await db.prepare("UPDATE documents SET deleted_at = ? WHERE id = 'ov-d0'").bind(ts).run()
  usage = (await planUsages(db, ts)).find((u) => u.company.id === 'ov-co')?.usage
  check('overview: a duplicate whose original was deleted is the only one left and counts', usage?.docs === 23, String(usage?.docs))
  const bill = (await billingDrafts(db, addMonths(month, 1))).find((b) => b.company.id === 'ov-co')
  check('overview: what it counts is what billing counts', bill?.docsLastMonth === usage?.docs, `${bill?.docsLastMonth} ${usage?.docs}`)

  let res = await acc.get('/ucto/prehlad')
  check('overview: an accountant does not get there', res.status === 404)
  res = await admin.get('/ucto/prehlad')
  let page = plain(await res.text())
  if (capture) writeFileSync(`${capture}/admin-overview.html`, page)
  check(
    'overview: the administrator sees what burns, the plans, what is new and how much',
    res.status === 200 && page.includes('Čo horí a čo čaká') && page.includes('Balíky a doklady tento mesiac') && page.includes('TEST-ONLY Balíky s. r. o.') && page.includes('23 / 20') && page.includes('Nad balíkom') && page.includes('Rast, +80') && page.includes('data-refresh="90"'),
  )
  check('overview: the complaint is found, its text is not shown', page.includes('id="staznosti"') && page.includes('href="/ucto/klienti/ov-co#spravy"') && !page.includes('zle zaúčtovaná'))
  check('overview: nothing inline', !/<script>/.test(page) && !/ style=/i.test(page))
  res = await admin.get('/ucto/klienti/ov-co')
  const client = plain(await res.text())
  check('overview: the client\'s page tells the administrator the month against the plan', res.status === 200 && client.includes('Doklady 23 / 20, nad balíkom, vyúčtujeme ako Rast') && client.includes('href="/ucto/prehlad#baliky"'))
  check('overview: the place is in the administrator\'s menu', page.includes('href="/ucto/prehlad"'))
  check('complaints: a word in capitals with diacritics is found, thanks are not', complains('Mám SŤAŽNOSŤ!') && complains('nefunguje mi to') && !complains('Ďakujem, všetko super.'))
  check('numbers: thousands, decimals and firm keys are read as the guard needs', numbersIn('K12 má 1 234 dokladov a 12,50 € a 80 %').join(',') === '1234,12.5,80')

  // The check by Claude: nothing of a person goes out; a point the data do not hold is left out; names come back here.
  const before2 = readings.length
  res = await admin.post('/ucto/prehlad/kontrola', {})
  check('check: done and back on the page', res.status === 303 && res.headers.get('location') === '/ucto/prehlad?ok=kontrola#kontrola', `${res.status}`)
  const sentOut = readings.slice(before2).find((b) => b?.tools?.[0]?.name === 'firmony_prehlad')
  // What Claude reads is the JSON inside the message, and the system prompt beside it.
  const text = `${sentOut?.system ?? ''} ${String(sentOut?.messages?.[0]?.content ?? '')}`
  check('check: Claude gets firms as keys, no name, no e-mail and no message', Boolean(sentOut) && text.includes('"K1"') && !text.includes('Balíky s. r. o.') && !text.includes('@') && !text.includes('SŤAŽNOSŤ') && !text.includes('ov-co'), text.slice(0, 300))
  res = await admin.get('/ucto/prehlad?ok=kontrola')
  page = plain(await res.text())
  if (capture) writeFileSync(`${capture}/admin-overview-check.html`, page)
  check(
    'check: the true point is shown with the firm\'s name, the invented ones are left out and counted',
    page.includes('Kontrola je hotová.') && page.includes('TEST-ONLY Balíky s. r. o. je nad balíkom') && page.includes('23 dokladov pri limite 20') && !page.includes('987654') && !page.includes('K999') && page.includes('2 body sme vynechali'),
  )
  const stored = await db.prepare('SELECT COUNT(*) AS n, MAX(input_tokens) AS input FROM admin_checks').first()
  check('check: kept with its cost', stored?.n === 1 && stored.input === 2400)
  res = await admin.post('/ucto/prehlad/kontrola', {})
  check('check: not twice in half a minute', res.status === 429)
  res = await acc.post('/ucto/prehlad/kontrola', {})
  check('check: an accountant cannot run it', res.status === 404)

  // The administrators hear it once a month for each client over its plan, at a working hour.
  const at = (monthStart(month) + 86400 * 5 + 9 * 3600 + 300) * 1000
  const rung = await planUsageScheduled({ DB: db }, at, 'https://firmony.io')
  const n = async () => (await db.prepare("SELECT COUNT(*) AS n FROM outbox WHERE id LIKE 'bell:plan-over:ov-co:%'").first())?.n
  const first = await n()
  await planUsageScheduled({ DB: db }, at, 'https://firmony.io')
  const bell = await db.prepare("SELECT body FROM outbox WHERE id LIKE 'bell:plan-over:ov-co:%' LIMIT 1").first()
  check('plans: the administrators are rung once, with nothing of the client in it', rung >= 1 && first >= 1 && (await n()) === first && Boolean(bell) && !bell.body.includes('Balíky s. r. o.') && bell.body.includes('/ucto/prehlad#baliky'), `${rung} ${first}`)
}
