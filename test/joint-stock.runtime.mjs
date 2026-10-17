// Joint-stock companies (17 October 2026), in workerd: a request of an a. s. whose board acts by two members together
// (an order with its legal form and manner of acting, the review says so, no link goes out), a j. s. a. whose members
// act alone, the paper contract with the form and the role, and a year's result of an a. s. distributed: the reserve
// fund the Commercial Code asks for, dividends, the tax withheld and its deadline, the booking taken back.
import { check } from './check.mjs'
import { writeFileSync } from 'node:fs'

export async function checkJointStock({ db, admin, acc, lucia, nowS, day, post, capture }) {
  const plain = (text) => text.replace(/[  ]/g, ' ')
  const request = { mode: 'company', plan: 'rast', situation: 'switch', phone: '', note: '' }
  let res = await post('/zacat', { ...request, ico: '36611111', name: 'Ján Kováč', email: 'kovac@strojaren.example' }, { ip: '198.51.100.61' })
  const as = await db.prepare("SELECT o.*, r.id AS request FROM orders o JOIN requests r ON r.id = o.request_id WHERE o.ico = '36611111'").first()
  const board = JSON.parse(as?.directors ?? '[]')
  check(
    "an a. s. gets an order: its legal form, the board's members with their roles (not the supervisory board), how the board acts",
    res.status === 303 &&
      as?.legal_form === 'as' &&
      board.length === 2 &&
      board[0].role === 'Predseda predstavenstva' &&
      board[1].role === 'Člen predstavenstva' &&
      (as.acting ?? '').includes('spoločne dvaja'),
    JSON.stringify(as),
  )
  const reviewRaw = await (await admin.get(`/ucto/ziadosti/${as?.request}/posudenie`)).text()
  if (capture) writeFileSync(`${capture}/joint-review.html`, reviewRaw)
  let page = plain(reviewRaw)
  check(
    'the review says who acts for it and that one person does not conclude it online',
    page.includes('Kto za firmu koná') && page.includes('Akciová spoločnosť') && page.includes('Ing. Ján Kováč (predseda predstavenstva)') && page.includes('online zmluvu jeden človek neuzavrie'),
  )
  res = await admin.post(`/ucto/ziadosti/${as?.request}/odkaz`, {})
  check('no link to the contract goes to one of two members who act together', res.status === 409 && plain(await res.text()).includes('Odkaz neposielame'))

  res = await post('/zacat', { ...request, ico: '56622222', name: 'Mária Nová', email: 'nova@inova.example' }, { ip: '198.51.100.62' })
  const jsa = await db.prepare("SELECT o.*, r.id AS request FROM orders o JOIN requests r ON r.id = o.request_id WHERE o.ico = '56622222'").first()
  page = plain(await (await admin.get(`/ucto/ziadosti/${jsa?.request}/posudenie`)).text())
  check(
    'a j. s. a. whose members act alone may conclude it online',
    res.status === 303 &&
      jsa?.legal_form === 'jsa' &&
      (jsa.acting ?? '').includes('samostatne') &&
      page.includes('Jednoduchá spoločnosť na akcie') &&
      !page.includes('online zmluvu jeden človek neuzavrie'),
  )

  // A year's result of an a. s.: capital 25 000 €, a profit of 10 000 €, distributed after the general meeting.
  const company = 'co-as'
  const Y = Number(day(0).slice(0, 4)) - 1
  let seq = 0
  const entry = (on, md, d, cents) =>
    db
      .prepare("INSERT INTO ledger_entries (id, company_id, kind, year, seq, number, on_date, text, lines, created_at, created_by) VALUES (?, ?, 'internal', ?, ?, ?, ?, 'TEST-ONLY', ?, ?, ?)")
      .bind(`as-e${++seq}`, company, Number(on.slice(0, 4)), seq, `ID-${on.slice(0, 4)}-9${String(seq).padStart(2, '0')}`, on, JSON.stringify([{ md, d, cents }]), nowS, lucia.id)
  await db.batch([
    db
      .prepare(
        "INSERT INTO companies (id, created_at, name, ico, dic, address, register_line, vat_payer, plan, inbox, accountant_id, start_on, legal_form, signed_by, signed_role) VALUES (?, ?, 'TEST-ONLY Akciová a. s.', '50777774', '2120777774', 'Hlavná 30, 040 01 Košice', 'Obchodný register Mestského súdu Košice, oddiel Sa, vložka č. 7777/V', 0, 'firma', 'akcia001', ?, ?, 'as', 'Ing. Ján Kováč', 'Predseda predstavenstva')",
      )
      .bind(company, nowS, lucia.id, `${Y}-01-01`),
    entry(`${Y}-01-02`, '221.001', '411', 2_500_000),
    entry(`${Y}-06-01`, '311', '602', 1_500_000),
    entry(`${Y}-06-20`, '221.001', '311', 1_500_000),
    entry(`${Y}-07-01`, '518', '221.001', 500_000),
  ])
  const base = `/ucto/klienti/${company}/zavierka`
  page = plain(await (await acc.get(`${base}?rok=${Y}`)).text())
  check(
    "the closing shows the year's result and the reserve fund an a. s. owes: 10 % of the profit, until 20 % of the capital",
    page.includes('Rozdelenie výsledku hospodárenia') && page.includes('najmenej 10 % zo zisku') && page.includes('1 000,00 €') && page.includes('5 000,00 €'),
  )
  const approved = `${Y + 1}-03-15`
  const paid = `${Y + 1}-04-10`
  const text = (d) => `${Number(d.slice(8))}. ${Number(d.slice(5, 7))}. ${d.slice(0, 4)}`
  res = await acc.post(`${base}/rozdelenie`, {
    rok: String(Y),
    akcia: 'zauctovat',
    schvalene: text(approved),
    rezerva: '500,00',
    krytie: '',
    dividendy: '5000,00',
    fyzicke: '5000,00',
    vyplata: text(paid),
  })
  check('dividends before the reserve fund has its legal share are refused', res.status === 422 && plain(await res.text()).includes('podiel na zisku sa určiť nedá'))
  res = await acc.post(`${base}/rozdelenie`, { rok: String(Y), akcia: 'zauctovat', schvalene: text(approved), rezerva: '1000,00', krytie: '', dividendy: '9500,00', fyzicke: '', vyplata: '' })
  check('more than the profit after the fund cannot be paid out', res.status === 422 && plain(await res.text()).includes('Rozdeľuje sa viac'))
  res = await acc.post(`${base}/rozdelenie`, {
    rok: String(Y),
    akcia: 'zauctovat',
    schvalene: text(approved),
    rezerva: '1000,00',
    krytie: '',
    dividendy: '5000,00',
    fyzicke: '5000,00',
    vyplata: text(paid),
  })
  const entries = (
    await db.prepare("SELECT on_date, lines FROM ledger_entries WHERE company_id = ? AND deleted_at IS NULL AND text LIKE '%' || ? ORDER BY on_date").bind(company, String(Y)).all()
  ).results.filter((e) => e.on_date > `${Y}-12-31`)
  const lines = entries.flatMap((e) => JSON.parse(e.lines).map((l) => `${e.on_date}:${l.md}/${l.d}:${l.cents}`))
  check(
    'booked on the day of the approval: the fund, the dividends, the rest kept; the tax of 7 % withheld on the day of the payout',
    res.status === 303 && lines.join() === [`${approved}:431/421:100000`, `${approved}:431/364:500000`, `${approved}:431/428:400000`, `${paid}:364/342:35000`].join(),
    lines.join(),
  )
  if (capture) writeFileSync(`${capture}/distribution.html`, await (await acc.get(`${base}?rok=${Y}`)).text())
  const dues = plain(await (await acc.get('/ucto/terminy?hotove=1')).text())
  check(
    'the tax withheld on dividends is a deadline of ours, by the 15th of the month after the payout',
    dues.includes(`Daň z dividend zo zisku za rok ${Y}`) && dues.includes('TEST-ONLY Akciová a. s.'),
  )
  res = await acc.post(`${base}/dividendy`, { rok: String(Y), akcia: 'podane' })
  const marked = await db.prepare('SELECT distribution FROM closings WHERE company_id = ? AND year = ?').bind(company, Y).first()
  check('the notice of the tax withheld marked as filed', res.status === 303 && Boolean(JSON.parse(marked?.distribution ?? '{}').taxFiledOn))
  res = await acc.post(`${base}/rozdelenie`, { rok: String(Y), akcia: 'zrusit' })
  const left = await db.prepare('SELECT COUNT(*) AS n FROM ledger_entries WHERE company_id = ? AND deleted_at IS NULL AND on_date > ?').bind(company, `${Y}-12-31`).first()
  const gone = await db.prepare('SELECT distribution FROM closings WHERE company_id = ? AND year = ?').bind(company, Y).first()
  check('the booking taken back: its documents removed, the distribution forgotten', res.status === 303 && left?.n === 0 && gone?.distribution === null)
}
