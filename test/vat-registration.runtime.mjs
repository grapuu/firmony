// The registration for VAT a crossed turnover asks for (20 October 2026, app/vat-registration.ts), in workerd: a company
// that is no payer and issued more than 50 000 € this year is on the screen of deadlines with five working days to apply;
// the accountant records the application as filed; a company near the threshold is said to be near, and services to a
// business abroad are not its turnover.
import { check } from './check.mjs'

export async function checkVatRegistration({ db, acc, lucia, nowS, day }) {
  const today = day(0)
  const year = today.slice(0, 4)
  const plain = (text) => text.replace(/[  ]/g, ' ')
  const company = (id, name, inbox) =>
    db
      .prepare("INSERT INTO companies (id, created_at, name, ico, address, vat_payer, plan, inbox, start_on, accountant_id) VALUES (?, ?, ?, NULL, 'Hlavná 9, 811 01 Bratislava', 0, 'start', ?, ?, ?)")
      .bind(id, nowS, name, inbox, `${year}-01-01`, lucia.id)
  const sale = (id, co, cents, vatId = null) =>
    db
      .prepare(
        `INSERT INTO documents (id, company_id, created_at, source, status, read_by, kind, party, party_vat_id, number, issued_on, total_cents, currency, category, booked_at, booked_by)
         VALUES (?, ?, ?, 'issued', 'read', 'xml', 'invoice_out', 'TEST-ONLY Odberateľ', ?, ?, ?, ?, 'EUR', 'sales', ?, ?)`,
      )
      .bind(id, co, nowS, vatId, id, today, cents, nowS, lucia.id)
  await db.batch([
    company('co-vatreg', 'TEST-ONLY Obrat s. r. o.', 'obrt0001'),
    company('co-vatnear', 'TEST-ONLY Blízko s. r. o.', 'obrt0002'),
    sale('vr-1', 'co-vatreg', 2_600_000),
    sale('vr-2', 'co-vatreg', 2_600_000),
    sale('vn-1', 'co-vatnear', 4_500_000),
    sale('vn-2', 'co-vatnear', 1_000_000, 'DE123456789'),
  ])
  let page = plain(await (await acc.get('/ucto/terminy')).text())
  check('a company whose turnover crossed 50 000 € has five working days to apply, on the screen of deadlines', page.includes(`Registrácia pre DPH: obrat za rok ${year} prekročil 50 000 €`) && page.includes('Podať žiadosť'))
  check('one near it is said to be near; a service to a business abroad is not its turnover', page.includes('Obrat 45 000,00 €'))
  const res = await acc.post('/ucto/klienti/co-vatreg/dph-registracia', { rok: year, spat: '/ucto/terminy' })
  check('the accountant records the application as filed', res.status === 303 && (res.headers.get('location') ?? '').includes('ok=oznacene'))
  page = plain(await (await acc.get('/ucto/terminy?hotove=1')).text())
  check('it is done', page.includes('Žiadosť podaná'))
  const bad = await acc.post('/ucto/klienti/co-vatreg/dph-registracia', { rok: '2999' })
  check('no year ahead is recorded', bad.status === 400)
}
