// Meals of employees (18 October 2026), in workerd through the accountant's pages: the company's way refused below the
// Labour Code's bounds and kept within them; an employee who chose the financial contribution; the month's meals
// proposed from the working days, one typed; the slips; the month closed and booked (527, 472, 213, 331); the social
// fund's mandatory allocation (social-fund.ts).
import { check } from './check.mjs'
import { writeFileSync } from 'node:fs'

export async function checkMeals({ db, acc, lucia, nowS, day, capture }) {
  const plain = (text) => text.replace(/[  ]/g, ' ')
  const sk = (d) => `${Number(d.slice(8, 10))}. ${Number(d.slice(5, 7))}. ${d.slice(0, 4)}`
  const shift = (period, n) => {
    const [y, m] = period.split('-').map(Number)
    return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7)
  }
  const M = shift(day(0).slice(0, 7), -1)
  const company = 'co-meals'
  await db
    .prepare(
      "INSERT INTO companies (id, created_at, name, ico, dic, vat_payer, plan, inbox, accountant_id, start_on) VALUES (?, ?, 'TEST-ONLY Stravovanie s. r. o.', '63337788', '2126333788', 0, 'firma', 'jedl0001', ?, ?)",
    )
    .bind(company, nowS, lucia.id, `${M}-01`)
    .run()
  const base = `/ucto/klienti/${company}/mzdy`
  const person = (fields) => ({
    meno: '',
    narodeny: '1. 1. 1990',
    poistovna: '25',
    nastup: sk(`${M}-01`),
    skoncenie: '',
    mzda: '1500',
    vztah: 'employment',
    dochodok: 'none',
    odmenovanie: 'monthly',
    hodiny: '40',
    dovolenka: '',
    iban: '',
    vyhlasenie: '1',
    ...fields,
  })
  await acc.post(`${base}/zamestnanec`, person({ meno: 'TEST-ONLY Ján Poukážka' }))
  let res = await acc.post(`${base}/zamestnanec`, person({ meno: 'TEST-ONLY Ema Príspevok', stravne: 'cash' }))
  const people = Object.fromEntries((await db.prepare('SELECT id, name, meal_way FROM employees WHERE company_id = ?').bind(company).all()).results.map((r) => [r.name.split(' ')[1], r]))
  check(
    "an employee who chose the financial contribution keeps his choice, another the company's way",
    res.status === 303 && people['Ema']?.meal_way === 'cash' && people['Ján']?.meal_way === null,
    JSON.stringify(people),
  )
  const jan = people['Ján'].id
  const ema = people['Ema'].id

  check('no meals field while the company gives none', !plain(await (await acc.get(`${base}?obdobie=${M}`)).text()).includes(`name="jedla_${jan}"`))

  // The company's way: below the law refused, within it kept.
  res = await acc.post(`${base}/nastavenie`, { den: '10', stravovanie: 'voucher', poukazka: '5', prispevok: '3', fond: '' })
  let page = plain(await res.text())
  check(
    'a voucher below 75 % of the meal allowance and a contribution below 55 % are refused, nothing kept',
    page.includes('Poukážka musí mať hodnotu aspoň 6,98 €') && (await db.prepare('SELECT payroll FROM companies WHERE id = ?').bind(company).first())?.payroll === null,
  )
  res = await acc.post(`${base}/nastavenie`, { den: '10', stravovanie: 'voucher', poukazka: '7', prispevok: '6', fond: '' })
  check('more than 5,12 € a meal from the employer is refused', plain(await res.text()).includes('najviac 5,12 € na jedlo'))
  res = await acc.post(`${base}/nastavenie`, { den: '10', stravovanie: 'voucher', poukazka: '7', prispevok: '3,85', fond: '1', sf_sadzba: '1,5' })
  check("the social fund's mandatory allocation above 1 % is refused", plain(await res.text()).includes('Povinný prídel do sociálneho fondu je od 0,6 do 1 %'))
  res = await acc.post(`${base}/nastavenie`, { den: '10', stravovanie: 'voucher', poukazka: '7', prispevok: '3,85', fond: '1' })
  const settings = JSON.parse((await db.prepare('SELECT payroll FROM companies WHERE id = ?').bind(company).first())?.payroll ?? '{}')
  check(
    'vouchers of 7 €, 3,85 € from the employer and 1 € from the social fund kept',
    res.status === 303 && JSON.stringify(settings.meals) === '{"way":"voucher","voucher":700,"employer":385,"fund":100}',
    JSON.stringify(settings),
  )

  // The month: meals proposed from the working days, the slips.
  const raw = await (await acc.get(`${base}?obdobie=${M}`)).text()
  if (capture) writeFileSync(`${capture}/payroll-meals.html`, raw)
  page = plain(raw)
  const proposed = Number(page.match(/Prázdne: (\d+) podľa dní odpracovaných nad 4 hodiny/)?.[1] ?? 0)
  check(
    "the month offers each employee's meals with the count proposed from the working days, and the slips say them",
    proposed >= 19 &&
      proposed <= 23 &&
      page.includes(`name="jedla_${jan}"`) &&
      page.includes(`Stravovacie poukážky (${proposed} ×), časť zamestnanca`) &&
      page.includes(`Finančný príspevok na stravovanie (${proposed} ×)`),
  )
  check('the settings show the bounds of today', page.includes('poukážka aspoň 6,98 €') && page.includes('name="poukazka" value="7,00"'))
  res = await acc.post(base, { obdobie: M, [`mzda_${jan}`]: '1500', [`mzda_${ema}`]: '1500', [`jedla_${jan}`]: '70', vyplata: sk(`${shift(M, 1)}-10`), akcia: 'ulozit' })
  check('a count above 62 is refused', plain(await res.text()).includes('Počet jedál napíšte celým číslom'))
  res = await acc.post(base, { obdobie: M, [`mzda_${jan}`]: '1500', [`mzda_${ema}`]: '1500', [`jedla_${jan}`]: '15', vyplata: sk(`${shift(M, 1)}-10`), akcia: 'uzavriet' })
  check('the month closed', res.status === 303 && (res.headers.get('location') ?? '').includes('mzdy-uzavrete'), res.headers.get('location'))
  const run = await db.prepare('SELECT lines FROM payroll_runs WHERE company_id = ? AND period = ?').bind(company, M).first()
  const lines = JSON.parse(run?.lines ?? '[]')
  const slipOf = (id) => lines.find((l) => l.employeeId === id)?.slip
  const j = slipOf(jan)
  const e = slipOf(ema)
  check(
    'kept on the slips: 15 vouchers, the employee paying 2,15 € of each off the net; the financial contribution paid with the wage; the same tax',
    j?.meals?.way === 'voucher' &&
      j.meals.count === 15 &&
      j.meals.employee === 15 * 215 &&
      e?.meals?.way === 'cash' &&
      e.meals.count === proposed &&
      e.meals.cash === proposed * 485 &&
      j.advance === e.advance &&
      e.net - j.net === proposed * 485 + 15 * 215,
    JSON.stringify([j?.meals, e?.meals]),
  )
  page = plain(await (await acc.get(`${base}?obdobie=${M}`)).text())
  check(
    "the social fund's allocation of the month: 0,6 % of both wages, kept with the closed month",
    page.includes('Prídel do sociálneho fondu za mesiac: 18,00 €') && settings.fundRate === 60 && lines.every((l) => l.fund === 900),
  )
  const fund = plain(await (await acc.get(`/ucto/klienti/${company}/kniha/ucet/472?rok=${M.slice(0, 4)}`)).text())
  check('booked to the fund (472) with what it paid for the meals', fund.includes('18,00') && fund.includes('15,00'))
  const message = await db.prepare("SELECT body FROM messages WHERE company_id = ? AND side = 'firmony' ORDER BY created_at DESC LIMIT 1").bind(company).first()
  check(
    'the client is told how many vouchers to hand out, of what value, to whom',
    plain(message?.body ?? '').includes('Stravovacie poukážky za mesiac: 15 ks po 7,00 € (TEST-ONLY Ján Poukážka 15)'),
    message?.body,
  )
  check("the month's table says what the meals did to each net", page.includes('stravovanie −32,25 €') || page.includes('stravovanie -32,25 €'))
  page = plain(await (await acc.get(`/ucto/klienti/${company}/kniha/ucet/213?rok=${M.slice(0, 4)}`)).text())
  check("the books: the vouchers out of 213 (the employer's, the fund's and the employee's parts)", page.includes('57,75') && page.includes('15,00') && page.includes('32,25'))
}
