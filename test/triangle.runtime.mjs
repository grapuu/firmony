// Triangular trade (18 October 2026, vat.ts `triangle` and `triangle_in`), in workerd through the accountant's booking
// form: the last customer's purchase in rows 11b and 12b (refused without a VAT number of another member state), and the
// middle person's sale only in the recapitulative statement, with the code 1.
import { check } from './check.mjs'

export async function checkTriangle({ db, acc, lucia, nowS, day }) {
  const plain = (text) => text.replace(/[  ]/g, ' ')
  const sk = (d) => `${Number(d.slice(8, 10))}. ${Number(d.slice(5, 7))}. ${d.slice(0, 4)}`
  const company = 'co-tri'
  const Y = Number(day(0).slice(0, 4)) - 1
  const at = (d) => Math.floor(Date.parse(`${d}T10:00:00Z`) / 1000)
  const unread = (id, kind, party, on) =>
    db
      .prepare(
        `INSERT INTO documents (id, company_id, created_at, source, status, kind, party, number, issued_on, total_cents, vat_cents, currency, category)
         VALUES (?, ?, ?, 'upload', 'read', ?, ?, ?, ?, 0, 0, 'EUR', NULL)`,
      )
      .bind(id, company, at(on), kind, party, id.toUpperCase(), on)
  await db.batch([
    db
      .prepare(
        `INSERT INTO companies (id, created_at, name, ico, dic, icdph, address, vat_payer, vat_since, tax_office, plan, inbox, accountant_id, start_on)
         VALUES (?, ?, 'TEST-ONLY Trojka s. r. o.', '63335501', '2126335501', 'SK2126335501', 'Hlavná 5, 811 01 Bratislava', 1, ?, 'Bratislava', 'firma', 'troj0001', ?, ?)`,
      )
      .bind(company, nowS, `${Y}-01-01`, lucia.id, `${Y}-01-01`),
    unread('tri-in', 'invoice_in', 'TEST-ONLY Lieferant GmbH', `${Y}-02-20`),
    unread('tri-out', 'invoice_out', 'TEST-ONLY Odběratel s. r. o.', `${Y}-02-20`),
  ])
  const book = (id, fields) =>
    acc.post(`/ucto/doklady/${id}`, {
      akcia: 'zauctovat',
      vs: '',
      due: '',
      account: '',
      dph: '1',
      dph_dodanie: sk(`${Y}-02-10`),
      dph_opravuje: '',
      dph_obdobie: '',
      issued: sk(`${Y}-02-20`),
      number: id.toUpperCase(),
      ...fields,
    })
  const bought = {
    kind: 'invoice_in',
    category: 'goods',
    party: 'TEST-ONLY Lieferant GmbH',
    ico: '',
    total: '1000,00',
    vat: '0,00',
    deduct: '1',
    dph_rezim: 'triangle_in',
    dph_icdph: 'DE123456789',
    dph_zaklad_23: '1000,00',
    dph_dan_23: '230,00',
  }
  let res = await book('tri-in', { ...bought, dph_icdph: 'SK2020123456' })
  check(
    'the last customer with a Slovak VAT number: refused, another member state asked for',
    res.status === 422 && plain(await res.text()).includes('Trojstranný obchod je medzi platiteľmi troch štátov EÚ'),
  )
  res = await book('tri-in', bought)
  check('the last customer booked', res.status === 303 && (await db.prepare("SELECT vat_mode FROM documents WHERE id = 'tri-in'").first())?.vat_mode === 'triangle_in')
  res = await book('tri-out', {
    kind: 'invoice_out',
    category: 'sales_goods',
    party: 'TEST-ONLY Odběratel s. r. o.',
    ico: '',
    total: '4500,00',
    vat: '0,00',
    dph_rezim: 'triangle',
    dph_icdph: 'CZ12345678',
    dph_zaklad_0: '4500,00',
  })
  check('the middle person booked', res.status === 303 && (await db.prepare("SELECT vat_mode FROM documents WHERE id = 'tri-out'").first())?.vat_mode === 'triangle')
  const page = plain(await (await acc.get(`/ucto/klienti/${company}/dph?obdobie=${Y}-02`)).text())
  check(
    'February: the last customer in rows 11b and 12b and deducted; the middle person in the recapitulative statement alone',
    page.includes('Trojstranný obchod, posledný odberateľ (§ 69 ods. 9), 23 %: základ') && page.includes('1 000,00') && page.includes('230,00') && page.includes('12345678') && page.includes('4 500'),
  )
}
