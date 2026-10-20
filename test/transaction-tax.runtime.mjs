// The transaction tax (20 October 2026, app/transaction-tax.ts), in workerd: a company with an account at a provider
// outside Slovakia has, for last month, the tax of its transfers on the screen of deadlines (card payments and a transfer
// to its own account there left out); the accountant records the notice as filed.
import { check } from './check.mjs'

export async function checkTransactionTax({ db, acc, lucia, nowS, day }) {
  const today = day(0)
  const [y, m] = today.slice(0, 7).split('-').map(Number)
  const last = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`
  const on = `${last}-15`
  const plain = (text) => text.replace(/[  ]/g, ' ')
  const pay = (id, account, cents, fields = {}) =>
    db
      .prepare("INSERT INTO payments (id, company_id, account_id, created_at, booked_on, amount_cents, party, party_iban, note, card, ref) VALUES (?, 'co-tt', ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(id, account, nowS, on, cents, fields.party ?? 'TEST-ONLY Dodávateľ', fields.iban ?? null, fields.note ?? null, fields.card ? 1 : 0, id)
  await db.batch([
    db
      .prepare("INSERT INTO companies (id, created_at, name, address, vat_payer, plan, inbox, start_on, accountant_id) VALUES ('co-tt', ?, 'TEST-ONLY Revolut s. r. o.', 'Hlavná 10, 811 01 Bratislava', 0, 'start', 'trns0001', ?, ?)")
      .bind(nowS, `${y - 1}-01-01`, lucia.id),
    db.prepare("INSERT INTO accounts (id, company_id, iban) VALUES ('acc-tt-1', 'co-tt', 'LT123250012345678901'), ('acc-tt-2', 'co-tt', 'LT853250098765432101'), ('acc-tt-sk', 'co-tt', 'SK3112000000198742637511')"),
    pay('tt-1', 'acc-tt-1', -250_000),
    pay('tt-2', 'acc-tt-1', -2_000, { card: true, note: 'Kaviareň' }),
    pay('tt-3', 'acc-tt-1', -50_000, { iban: 'LT853250098765432101', party: 'TEST-ONLY Revolut s. r. o.' }),
    pay('tt-4', 'acc-tt-sk', -900_000),
  ])
  let page = plain(await (await acc.get('/ucto/terminy')).text())
  check(
    "last month's tax of the foreign account's transfer alone: 0,4 % of 2 500 €, no card payment, no own transfer, no Slovak account",
    page.includes('Transakčná daň za') && page.includes('10,00 € z 1 platby'),
  )
  const res = await acc.post('/ucto/klienti/co-tt/transakcna-dan', { mesiac: last, spat: '/ucto/terminy' })
  check('the accountant records the notice as filed', res.status === 303)
  page = plain(await (await acc.get('/ucto/terminy?hotove=1')).text())
  check('it is done', page.includes('Oznámenie podané'))
  const bad = await acc.post('/ucto/klienti/co-tt/transakcna-dan', { mesiac: today.slice(0, 7) })
  check('not a month that runs', bad.status === 400)
  // The employer's annual report of payroll taxes (hlásenie) is recorded the same way, for a year that ended.
  const annual = await acc.post('/ucto/klienti/co-tt/mzdy/hlasenie', { rok: String(y - 1), spat: '/ucto/terminy' })
  const thisYear = await acc.post('/ucto/klienti/co-tt/mzdy/hlasenie', { rok: String(y) })
  const ev = await db.prepare("SELECT COUNT(*) AS n FROM events WHERE company_id = 'co-tt' AND action = 'payrollAnnual.filed' AND subject = ?").bind(String(y - 1)).first()
  check('the annual report of payroll taxes is recorded for a year that ended, not for this one', annual.status === 303 && thisYear.status === 400 && ev.n === 1)
}
