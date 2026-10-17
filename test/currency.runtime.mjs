// Foreign currencies (17 October 2026), in workerd: the ECB's rates fetched by the schedule from the pretend ECB, a
// received invoice in dollars booked at the rate of the day before it (proposed on the form, kept when the field is
// left empty), a rate typed that is none refused, and the journal in euros.
import { check } from './check.mjs'
import { ECB_CALLS, ecbRate } from './pretend.mjs'

export async function checkCurrency({ db, acc, lucia, nowS, day }) {
  const plain = (text) => text.replace(/[  ]/g, ' ')
  const kept = (await db.prepare('SELECT COUNT(*) AS n, MAX(day) AS last FROM fx_rates').first()) ?? { n: 0 }
  check("the schedule fetched the ECB's rates of the last ninety days", ECB_CALLS.length >= 1 && kept.n > 100, JSON.stringify(kept))

  const company = 'co-mena'
  // A weekday ten days back or more, and the ECB's last day before it.
  let issued = day(-10)
  while ([0, 6].includes(new Date(`${issued}T00:00:00Z`).getUTCDay())) issued = new Date(Date.parse(`${issued}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10)
  let before = new Date(Date.parse(`${issued}T00:00:00Z`) - 86_400_000)
  while ([0, 6].includes(before.getUTCDay())) before = new Date(before.getTime() - 86_400_000)
  const rate = ecbRate('USD', before.toISOString().slice(0, 10))
  await db.batch([
    db
      .prepare("INSERT INTO companies (id, created_at, name, ico, plan, inbox, accountant_id, start_on) VALUES (?, ?, 'TEST-ONLY Mena s. r. o.', '63337777', 'firma', 'mena0001', ?, ?)")
      .bind(company, nowS, lucia.id, `${issued.slice(0, 4)}-01-01`),
    db
      .prepare(
        "INSERT INTO documents (id, company_id, created_at, source, status, kind, party, number, issued_on, total_cents, vat_cents, currency, category) VALUES ('usd-doc', ?, ?, 'upload', 'read', 'invoice_in', 'TEST-ONLY Cloud Inc.', 'US-100', ?, 100000, 0, 'USD', 'services')",
      )
      .bind(company, nowS, issued),
  ])
  const [y, m, d] = issued.split('-')
  const textDay = `${Number(d)}. ${Number(m)}. ${y}`
  let res = await acc.get('/ucto/doklady/usd-doc')
  let page = plain(await res.text())
  check(
    "the booking form has the currency and proposes the ECB's rate of the day before",
    res.status === 200 && page.includes('<option value="USD" selected="">USD</option>') && page.includes(`Kurz ECB z `) && page.includes(`: ${rate.replace('.', ',').replace(/0+$/, '')}.`),
    page.slice(page.indexOf('b-currency') - 50, page.indexOf('b-currency') + 600),
  )
  const form = (extra) => ({
    akcia: 'zauctovat',
    kind: 'invoice_in',
    category: 'services',
    party: 'TEST-ONLY Cloud Inc.',
    ico: '',
    number: 'US-100',
    vs: '',
    issued: textDay,
    due: '',
    total: '1000,00',
    vat: '0,00',
    account: '',
    currency: 'USD',
    rate: '',
    ...extra,
  })
  res = await acc.post('/ucto/doklady/usd-doc', form({ rate: 'kurz' }))
  check('a rate that is none is said at its field', res.status === 422 && plain(await res.text()).includes('Kurz zadajte ako počet jednotiek meny za 1 €'))
  res = await acc.post('/ucto/doklady/usd-doc', form({}))
  const saved = await db.prepare("SELECT currency, fx_rate, booked_at FROM documents WHERE id = 'usd-doc'").first()
  check(
    "booked with the field empty: the ECB's rate of the day before kept with it",
    res.status === 303 && saved?.currency === 'USD' && saved.booked_at && Number(saved.fx_rate) === Number(rate),
    JSON.stringify(saved),
  )
  const euros = Math.round((100000 * 1_000_000) / Math.round(Number(rate) * 1_000_000))
  const journal = plain(await (await acc.get(`/ucto/klienti/${company}/kniha/dennik?rok=${y}&mesiac=${Number(m)}`)).text())
  const shown = `${String(Math.floor(euros / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')},${String(euros % 100).padStart(2, '0')}`
  check(
    'the journal books it in euros at that rate',
    journal.includes('TEST-ONLY Cloud Inc.') && journal.includes(shown),
    shown + ' | ' + journal.slice(journal.indexOf('TEST-ONLY Cloud'), journal.indexOf('TEST-ONLY Cloud') + 400),
  )
  res = await acc.post('/ucto/doklady/usd-doc', form({ rate: '1,25' }))
  check('a rate the accountant types is kept instead', res.status === 303 && (await db.prepare("SELECT fx_rate FROM documents WHERE id = 'usd-doc'").first())?.fx_rate === '1.25')
}
