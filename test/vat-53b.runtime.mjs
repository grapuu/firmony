// § 53b (18 October 2026, vat.ts unpaidEvents), in workerd through the accountant's pages: a supplier's invoice not paid
// within 100 days of its due day corrects its deduction in the period of the 101st day (row 29, C.2 with ONP), is booked
// 378 against 343.100, and once paid comes back in the period of the payment.
import { check } from './check.mjs'

export async function checkUnpaid53b({ db, acc, lucia, nowS, day }) {
  const plain = (text) => text.replace(/[  ]/g, ' ')
  const company = 'co-53b'
  const Y = Number(day(0).slice(0, 4)) - 1
  const at = (d) => Math.floor(Date.parse(`${d}T10:00:00Z`) / 1000)
  await db.batch([
    db
      .prepare(
        `INSERT INTO companies (id, created_at, name, ico, dic, icdph, address, vat_payer, vat_since, tax_office, plan, inbox, accountant_id, start_on)
         VALUES (?, ?, 'TEST-ONLY Neplatič s. r. o.', '63335301', '2126335301', 'SK2126335301', 'Hlavná 2, 811 01 Bratislava', 1, ?, 'Bratislava', 'firma', 'nepl0001', ?, ?)`,
      )
      .bind(company, nowS, `${Y}-01-01`, lucia.id, `${Y}-01-01`),
    db
      .prepare(
        `INSERT INTO documents (id, company_id, created_at, source, status, kind, party, party_ico, number, issued_on, due_on, supplied_on, total_cents, vat_cents, currency, category,
           vat_deduct, booked_at, booked_by, vat_mode, vat_lines, party_vat_id)
         VALUES ('u53-in', ?, ?, 'upload', 'read', 'invoice_in', 'TEST-ONLY Dodávateľ s. r. o.', '36123456', 'FA-53', ?, ?, ?, 12300, 2300, 'EUR', 'services', 1, ?, ?, 'domestic', ?, 'SK2020123456')`,
      )
      .bind(company, at(`${Y}-01-12`), `${Y}-01-10`, `${Y}-01-31`, `${Y}-01-10`, nowS, lucia.id, JSON.stringify([{ rate: 23, base: 10000, vat: 2300, deduct: 2300 }])),
  ])
  const vatPage = async (period) => plain(await (await acc.get(`/ucto/klienti/${company}/dph?obdobie=${period}`)).text())

  let page = await vatPage(`${Y}-05`)
  check(
    'May, with the 101st day after 31 January: row 29 corrects the 23,00 € deducted, and says why',
    page.includes('Oprava odpočítanej dane pri nezaplatení (§ 53b)') && page.includes('23,00') && page.includes('nie je zaplatená do 100 dní od splatnosti'),
  )
  page = await vatPage(`${Y}-04`)
  check('April, before it, has none', !page.includes('Oprava odpočítanej dane pri nezaplatení'))
  page = plain(await (await acc.get(`/ucto/klienti/${company}/kniha/ucet/378?rok=${Y}`)).text())
  check('the books: 23,00 € on 378 from 12 May', page.includes('23,00') && page.includes('§ 53b'))

  // Paid in July: the deduction comes back there.
  await db.batch([
    db.prepare("INSERT INTO accounts (id, company_id, iban) VALUES ('acc-53b', ?, 'SK3112000000198742637541')").bind(company),
    db
      .prepare(
        "INSERT INTO payments (id, company_id, account_id, created_at, booked_on, amount_cents, party, vs, ref) VALUES ('pay-53b', ?, 'acc-53b', ?, ?, -12300, 'TEST-ONLY Dodávateľ s. r. o.', 'FA53', 'u53')",
      )
      .bind(company, nowS, `${Y}-07-03`),
    db.prepare("INSERT INTO links (document_id, payment_id, company_id, how, created_at) VALUES ('u53-in', 'pay-53b', ?, 'accountant', ?)").bind(company, nowS),
  ])
  page = await vatPage(`${Y}-07`)
  check(
    'July, the month it was paid: the correction back (row 29 minus), and says so',
    page.includes('Oprava odpočítanej dane pri nezaplatení (§ 53b)') && page.includes('zaplatená po oprave podľa § 53b'),
  )
  page = plain(await (await acc.get(`/ucto/klienti/${company}/kniha/ucet/378?rok=${Y}`)).text())
  check('the books: 378 settled on 3 July', page.includes('Oprava opravenej odpočítanej dane po zaplatení'))

  // Due on 31 May, so the 101st day is 9 September: one invoice half paid in June, one the supplier cancels in October.
  const inv = (id, number, total, base, vat, deduct, extra = {}) =>
    db
      .prepare(
        `INSERT INTO documents (id, company_id, created_at, source, status, kind, party, party_ico, number, issued_on, due_on, supplied_on, total_cents, vat_cents, currency, category,
           vat_deduct, booked_at, booked_by, vat_mode, vat_lines, party_vat_id, corrects)
         VALUES (?, ?, ?, 'upload', 'read', 'invoice_in', 'TEST-ONLY Dodávateľ s. r. o.', '36123456', ?, ?, ?, ?, ?, ?, 'EUR', 'services', 1, ?, ?, 'domestic', ?, 'SK2020123456', ?)`,
      )
      .bind(
        id,
        company,
        at(extra.came ?? `${Y}-05-03`),
        number,
        extra.on ?? `${Y}-05-01`,
        extra.due ?? `${Y}-05-31`,
        extra.on ?? `${Y}-05-01`,
        total,
        vat,
        nowS,
        lucia.id,
        JSON.stringify([{ rate: 23, base, vat, deduct }]),
        extra.corrects ?? null,
      )
  await db.batch([
    inv('u53-part', 'FA-54', 12300, 10000, 2300, 2300),
    inv('u53-cr', 'FA-55', 12300, 10000, 2300, 2300),
    inv('u53-cn', 'DB-55', -12300, -10000, -2300, -2300, { on: `${Y}-10-04`, came: `${Y}-10-05`, due: null, corrects: 'FA-55' }),
    db
      .prepare(
        "INSERT INTO payments (id, company_id, account_id, created_at, booked_on, amount_cents, party, vs, ref) VALUES ('pay-53p', ?, 'acc-53b', ?, ?, -6150, 'TEST-ONLY Dodávateľ s. r. o.', 'FA54', 'u53p')",
      )
      .bind(company, nowS, `${Y}-06-01`),
    db.prepare("INSERT INTO links (document_id, payment_id, company_id, how, created_at) VALUES ('u53-part', 'pay-53p', ?, 'accountant', ?)").bind(company, nowS),
  ])
  page = await vatPage(`${Y}-09`)
  check(
    'September: the half not paid of one (11,50 €) and the whole of the other (23,00 €), row 29 34,50 €',
    page.includes('Oprava odpočítanej dane pri nezaplatení (§ 53b)') && page.includes('34,50'),
    page.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').match(/Oprava odpočítanej dane pri nezaplatení.{0,400}/)?.[0],
  )
  page = await vatPage(`${Y}-10`)
  check(
    "October: the supplier's credit note corrects the deduction itself, so the § 53b correction it covers comes back",
    page.includes('znížil dodávateľ opravným dokladom') && page.includes('Oprava odpočítanej dane (§ 53)'),
  )
}
