// Deductions from wages for an execution (18 October 2026), in workerd through the accountant's pages: an employee with
// a person maintained; an execution written from the executor's orders (refused when a day or an amount is wrong); the
// month's slip with the deduction and its executor; what to pay him and what the client is told; a month closed and
// booked (331 against 379); the next month takes what is left; an execution kept until its execution order; removed.
import { check } from './check.mjs'
import { writeFileSync } from 'node:fs'

export async function checkGarnish({ db, acc, lucia, nowS, day, capture }) {
  const plain = (text) => text.replace(/[  ]/g, ' ')
  const sk = (d) => `${Number(d.slice(8, 10))}. ${Number(d.slice(5, 7))}. ${d.slice(0, 4)}`
  const shift = (period, n) => {
    const [y, m] = period.split('-').map(Number)
    return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7)
  }
  const M = shift(day(0).slice(0, 7), -2)
  const N = shift(M, 1)
  const company = 'co-garnish'
  await db
    .prepare(
      "INSERT INTO companies (id, created_at, name, ico, dic, vat_payer, plan, inbox, accountant_id, start_on) VALUES (?, ?, 'TEST-ONLY Exekúcie s. r. o.', '63337799', '2126333799', 0, 'firma', 'exek0001', ?, ?)",
    )
    .bind(company, nowS, lucia.id, `${M}-01`)
    .run()
  const base = `/ucto/klienti/${company}/mzdy`
  let res = await acc.post(`${base}/zamestnanec`, {
    meno: 'TEST-ONLY Dlžník Peter',
    narodeny: '1. 1. 1985',
    poistovna: '25',
    nastup: sk(`${M}-01`),
    skoncenie: '',
    mzda: '2000',
    vztah: 'employment',
    dochodok: 'none',
    odmenovanie: 'monthly',
    hodiny: '40',
    dovolenka: '',
    iban: '',
    vyhlasenie: '1',
    vyzivovani: '1',
  })
  const employee = await db.prepare('SELECT id, dependents FROM employees WHERE company_id = ?').bind(company).first()
  check('an employee with a person maintained', res.status === 303 && employee?.dependents === 1)

  // The execution, from the executor's orders.
  let page = plain(await (await acc.get(base)).text())
  check('the payroll page leads to the executions', page.includes('Zrážky zo mzdy (exekúcie)') && page.includes(`${base}/zrazka`))
  const form = (fields) => ({
    zamestnanec: employee.id,
    druh: 'ordinary',
    osoby: '',
    mesacne: '',
    exekutor: 'TEST-ONLY JUDr. Exekútorka',
    cislo: 'EX 77/2026',
    iban: 'SK31 1200 0000 1987 4263 7541',
    vs: '772026',
    zaciatok: sk(`${M}-05`),
    prikaz: sk(`${M}-20`),
    suma: '1 000',
    koniec: '',
    ...fields,
  })
  res = await acc.post(`${base}/zrazka`, form({ zaciatok: '31. 2. 2026', suma: 'veľa', prikaz: sk(`${M}-01`) }))
  page = plain(await res.text())
  check(
    'a day that is none and an amount that is none are refused, nothing kept',
    res.status === 422 &&
      page.includes('Dátum napíšte v tvare') &&
      page.includes('Sumu napíšte v eurách') &&
      (await db.prepare('SELECT COUNT(*) AS n FROM wage_garnishments WHERE company_id = ?').bind(company).first())?.n === 0,
  )
  res = await acc.post(`${base}/zrazka`, form({ druh: 'maintenance', suma: '', mesacne: '' }))
  check('maintenance asks for the current maintenance or arrears', res.status === 422 && plain(await res.text()).includes('Pri výživnom napíšte bežné výživné alebo nedoplatok'))
  res = await acc.post(`${base}/zrazka`, form({}))
  const stored = await db.prepare('SELECT * FROM wage_garnishments WHERE company_id = ?').bind(company).first()
  check(
    'kept as the orders say',
    res.status === 303 &&
      stored?.kind === 'ordinary' &&
      stored.total_cents === 100000 &&
      stored.started_on === `${M}-05` &&
      stored.order_on === `${M}-20` &&
      stored.iban === 'SK3112000000198742637541',
    JSON.stringify(stored),
  )

  // The month: the deduction on the slip, what to pay the executor.
  const raw = await (await acc.get(`${base}?obdobie=${M}`)).text()
  if (capture) writeFileSync(`${capture}/payroll-garnish.html`, raw)
  page = plain(raw)
  check(
    'the month shows the deduction in the net and what to pay the executor',
    /exekúcie [−-]/.test(page) && page.includes('Exekútor TEST-ONLY JUDr. Exekútorka (EX 77/2026)') && page.includes('SK31 1200 0000 1987 4263 7541') && page.includes('VS 772026'),
  )
  res = await acc.post(base, { obdobie: M, [`mzda_${employee.id}`]: '2000', vyplata: sk(`${N}-10`), akcia: 'uzavriet' })
  check('the month closed', res.status === 303 && (res.headers.get('location') ?? '').includes('mzdy-uzavrete'), res.headers.get('location'))
  const run = await db.prepare('SELECT lines FROM payroll_runs WHERE company_id = ? AND period = ?').bind(company, M).first()
  const slip = JSON.parse(run?.lines ?? '[]')[0]?.slip
  const first = slip?.garnish?.[0]?.arrears ?? 0
  check(
    'the closed slip keeps the deduction and its executor, not kept',
    first > 0 && first < 100000 && slip.garnish[0].creditor === 'TEST-ONLY JUDr. Exekútorka' && slip.garnish[0].held === false,
    JSON.stringify(slip?.garnish),
  )
  const message = await db.prepare("SELECT body FROM messages WHERE company_id = ? AND side = 'firmony' ORDER BY created_at DESC LIMIT 1").bind(company).first()
  check(
    'the client is told what to pay the executor',
    plain(message?.body ?? '').includes('Exekútorom (zrážky zo mzdy, už odpočítané z čistej mzdy)') && plain(message?.body ?? '').includes('VS 772026'),
  )
  page = plain(await (await acc.get(`/ucto/klienti/${company}/kniha/ucet/379?rok=${M.slice(0, 4)}`)).text())
  const eur = (c) => `${String(Math.floor(c / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')},${String(c % 100).padStart(2, '0')}`
  check('booked: owed to the executor on 379', page.includes(eur(first)))
  page = plain(await (await acc.get(base)).text())
  check('the list says what was deducted and what is left', page.includes(`Zrazené spolu ${eur(first)} €, zostáva ${eur(100000 - first)} €`))

  // The next month takes what is left; an execution without its execution order is kept.
  await acc.post(`${base}/zrazka`, form({ druh: 'priority', exekutor: 'TEST-ONLY Mgr. Druhý', cislo: 'EX 5/2026', zaciatok: sk(`${N}-02`), prikaz: '', suma: '' }))
  page = plain(await (await acc.get(`${base}?obdobie=${N}`)).text())
  check(
    'the next month: the first claim by its order, the second kept until its execution order',
    page.includes('Exekútor TEST-ONLY Mgr. Druhý (EX 5/2026)') && page.includes('zadržať u firmy, kým nepríde exekučný príkaz'),
  )
  const second = await db.prepare("SELECT id FROM wage_garnishments WHERE company_id = ? AND creditor LIKE '%Druhý'").bind(company).first()
  res = await acc.post(`${base}/zrazka/${second.id}/odstranit`, {})
  check('an execution written by mistake removed', res.status === 303 && (await db.prepare('SELECT deleted_at FROM wage_garnishments WHERE id = ?').bind(second.id).first())?.deleted_at !== null)
  check("another company's execution cannot be removed here", (await acc.post(`${base}/zrazka/${stored.id}x/odstranit`, {})).status === 404)
}
