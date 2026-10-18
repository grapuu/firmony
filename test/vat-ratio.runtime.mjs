// The proportional deduction of VAT (18 October 2026, vat-ratio.ts), in workerd through the accountant's pages: the
// year's coefficient written (refused when it is none); a supplier's invoice booked in proportion, its deduction the
// VAT times the coefficient (refused in a year without one); an issued sale of property left out of the coefficient;
// the year's last period kept back until the settlement; the coefficient of the year's supplies and the settlement by
// rate, confirmed as the page showed it; in rows 18 to 19 of December and in the books on 31 December; a change of the
// year's documents seen; nothing changed once the year is locked.
import { check } from './check.mjs'
import { writeFileSync } from 'node:fs'

export async function checkVatRatio({ db, acc, lucia, nowS, day, capture }) {
  const plain = (text) => text.replace(/[\u00a0\u202f]/g, ' ')
  const sk = (d) => `${Number(d.slice(8, 10))}. ${Number(d.slice(5, 7))}. ${d.slice(0, 4)}`
  const company = 'co-ratio'
  const Y = Number(day(0).slice(0, 4)) - 1
  const atDay = (d) => Math.floor(Date.parse(`${d}T10:00:00Z`) / 1000)
  await db
    .prepare(
      `INSERT INTO companies (id, created_at, name, ico, dic, icdph, address, vat_payer, vat_since, tax_office, plan, inbox, accountant_id, start_on)
       VALUES (?, ?, 'TEST-ONLY Pomerná s. r. o.', '63338801', '2126338801', 'SK2126338801', 'Hlavná 1, 811 01 Bratislava', 1, ?, 'Bratislava', 'firma', 'pome0001', ?, ?)`,
    )
    .bind(company, nowS, `${Y}-01-01`, lucia.id, `${Y}-01-01`)
    .run()
  const issued = (id, base, rate, extra = {}) =>
    db
      .prepare(
        `INSERT INTO documents (id, company_id, created_at, source, status, kind, party, party_ico, number, issued_on, supplied_on, total_cents, vat_cents, currency, category,
           booked_at, booked_by, vat_mode, vat_lines, party_vat_id, ratio_skip)
         VALUES (?, ?, ?, 'upload', 'read', 'invoice_out', 'TEST-ONLY Odberateľ', '50777001', ?, ?, ?, ?, ?, 'EUR', 'sales', ?, ?, 'domestic', ?, 'SK2020777001', ?)`,
      )
      .bind(
        id,
        company,
        atDay(extra.on ?? `${Y}-05-10`),
        id.toUpperCase(),
        extra.on ?? `${Y}-05-10`,
        extra.on ?? `${Y}-05-10`,
        base + Math.round((base * rate) / 100),
        Math.round((base * rate) / 100),
        extra.booked === false ? null : nowS,
        extra.booked === false ? null : lucia.id,
        JSON.stringify([{ rate, base, vat: Math.round((base * rate) / 100), deduct: 0 }]),
        extra.skip ? 1 : 0,
      )
  await db.batch([
    // Supplies of the year: 800 € with VAT (the right to deduct), 200 € of rent exempt (§ 38), and a car sold (left out).
    issued('ra-sale', 80000, 23),
    issued('ra-rent', 20000, 0, { on: `${Y}-07-01` }),
    issued('ra-car', 50000, 23, { on: `${Y}-09-15`, booked: false }),
    // A supplier's invoice of June of the year, for both kinds of supplies, and one of this year.
    db
      .prepare(
        `INSERT INTO documents (id, company_id, created_at, source, status, kind, party, party_ico, number, issued_on, total_cents, vat_cents, currency, category)
         VALUES ('ra-in', ?, ?, 'upload', 'read', 'invoice_in', 'TEST-ONLY Správca budovy s. r. o.', '36123456', 'FA-6', ?, 12300, 2300, 'EUR', 'services'),
                ('ra-now', ?, ?, 'upload', 'read', 'invoice_in', 'TEST-ONLY Správca budovy s. r. o.', '36123456', 'FA-7', ?, 12300, 2300, 'EUR', 'services')`,
      )
      .bind(company, atDay(`${Y}-06-20`), `${Y}-06-15`, company, nowS, day(-3)),
  ])
  const base = `/ucto/klienti/${company}/dph/koeficient`

  // The year's coefficient.
  let page = plain(await (await acc.get(`/ucto/klienti/${company}/dph?obdobie=${Y}-06`)).text())
  check('the VAT page leads to the coefficient', page.includes('Pomerné odpočítanie dane (§ 50)') && page.includes(`${base}?rok=${Y}`))
  page = plain(await (await acc.get(`${base}?rok=${Y}`)).text())
  check('a year without a coefficient says so', page.includes('Pre tento rok koeficient nie je zapísaný') && page.includes('Bez koeficientu'))
  let res = await acc.post(base, { rok: String(Y), koeficient: '1,5', sposob: 'previous' })
  check(
    'a coefficient that is none is refused, nothing kept',
    res.status === 422 &&
      plain(await res.text()).includes('Koeficient napíšte ako 0,74') &&
      (await db.prepare('SELECT COUNT(*) AS n FROM vat_ratios WHERE company_id = ?').bind(company).first())?.n === 0,
  )
  res = await acc.post(base, { rok: String(Y), koeficient: '0,75', sposob: 'previous' })
  const kept = await db.prepare('SELECT coef, how FROM vat_ratios WHERE company_id = ? AND year = ?').bind(company, Y).first()
  check("the year before's coefficient kept", res.status === 303 && (res.headers.get('location') ?? '').includes('ok=saved') && kept?.coef === 75 && kept.how === 'previous', JSON.stringify(kept))

  // A supplier's invoice booked in proportion.
  const book = (id, issuedOn, extra) =>
    acc.post(`/ucto/doklady/${id}`, {
      akcia: 'zauctovat',
      kind: 'invoice_in',
      category: 'services',
      party: 'TEST-ONLY Správca budovy s. r. o.',
      ico: '36123456',
      number: id === 'ra-in' ? 'FA-6' : 'FA-7',
      vs: '',
      issued: sk(issuedOn),
      due: '',
      total: '123,00',
      vat: '23,00',
      account: '',
      deduct: '1',
      pomerne: '1',
      dph: '1',
      dph_rezim: 'domestic',
      dph_dodanie: '',
      dph_icdph: 'SK2020123456',
      dph_opravuje: '',
      dph_obdobie: '',
      dph_zaklad_23: '100,00',
      dph_dan_23: '23,00',
      ...extra,
    })
  page = plain(await (await acc.get('/ucto/doklady/ra-in')).text())
  check('the booking form offers the proportional deduction', page.includes('Pomerne koeficientom (§ 50)'))
  res = await book('ra-now', day(-3), {})
  check(
    'in proportion in a year without a coefficient: refused, nothing booked',
    res.status === 422 &&
      plain(await res.text()).includes(`Pre rok ${Number(day(0).slice(0, 4))} nie je zapísaný koeficient`) &&
      (await db.prepare("SELECT booked_at FROM documents WHERE id = 'ra-now'").first())?.booked_at === null,
  )
  res = await book('ra-in', `${Y}-06-15`, {})
  const inDoc = await db.prepare("SELECT booked_at, vat_ratio, vat_lines FROM documents WHERE id = 'ra-in'").first()
  check(
    'booked in proportion: the VAT times 0,75, the coefficient kept',
    res.status === 303 && Boolean(inDoc?.booked_at) && inDoc.vat_ratio === 75 && inDoc.vat_lines === JSON.stringify([{ rate: 23, base: 10000, vat: 2300, deduct: 1725 }]),
    JSON.stringify(inDoc),
  )
  page = plain(await (await acc.get(`/ucto/klienti/${company}/dph?obdobie=${Y}-06`)).text())
  check('the return of June deducts 17,25 € (row 19 and B.2)', page.includes('Odpočítanie dane, 23 %') && page.includes('17,25'))
  page = plain(await (await acc.get(`/ucto/klienti/${company}/kniha/ucet/343.100?rok=${Y}`)).text())
  const costs = plain(await (await acc.get(`/ucto/klienti/${company}/kniha/ucet/518?rok=${Y}`)).text())
  check('the books: 17,25 € deducted on 343.100, the rest of the VAT in the cost (105,75 €)', page.includes('17,25') && costs.includes('105,75'))

  // An issued sale of property left out of the coefficient (§ 50(2)).
  res = await acc.post('/ucto/doklady/ra-car', {
    akcia: 'zauctovat',
    kind: 'invoice_out',
    category: 'sales',
    party: 'TEST-ONLY Odberateľ',
    ico: '50777001',
    number: 'RA-CAR',
    vs: '',
    issued: sk(`${Y}-09-15`),
    due: '',
    total: '615,00',
    vat: '115,00',
    account: '',
    mimo_koeficientu: '1',
    dph: '1',
    dph_rezim: 'domestic',
    dph_dodanie: '',
    dph_icdph: 'SK2020777001',
    dph_opravuje: '',
    dph_obdobie: '',
    dph_zaklad_23: '500,00',
    dph_dan_23: '115,00',
  })
  check('an issued sale of property booked as left out of the coefficient', res.status === 303 && (await db.prepare("SELECT ratio_skip FROM documents WHERE id = 'ra-car'").first())?.ratio_skip === 1)

  // The year's last period waits for the settlement.
  page = plain(await (await acc.get(`/ucto/klienti/${company}/dph?obdobie=${Y}-12`)).text())
  check('December is kept back until the settlement, with the way to it', page.includes('po skončení roka treba v tomto období vysporiadať odpočet koeficientom') && page.includes(`${base}?rok=${Y}`))

  // The year's coefficient and its settlement.
  const raw = await (await acc.get(`${base}?rok=${Y}`)).text()
  if (capture) writeFileSync(`${capture}/vat-ratio.html`, raw)
  page = plain(raw)
  check(
    "the year's coefficient of its supplies: 800 € of 1 000 €, the car left out, 0,80",
    page.includes('800,00') && page.includes('1 000,00') && page.includes('0,80') && page.includes('1 doklad nezapočítaný do koeficientu') && page.includes('Na vysporiadanie'),
  )
  check(
    'the settlement by rate: 23,00 € of VAT, 17,25 € deducted, 18,40 € by 0,80, 1,15 € more',
    page.includes('23,00') && page.includes('18,40') && page.includes('1,15') && page.includes(`Vysporiadať v priznaní za december ${Y}`),
  )
  const sig = raw.match(/name="podpis" value="([^"]+)"/)?.[1] ?? ''
  res = await acc.post(`${base}/vysporiadat`, { rok: String(Y), podpis: `${sig}x` })
  check(
    'figures other than the page showed are not confirmed',
    (res.headers.get('location') ?? '').includes('ok=stale') && (await db.prepare('SELECT settled FROM vat_ratios WHERE company_id = ?').bind(company).first())?.settled === null,
  )
  res = await acc.post(`${base}/vysporiadat`, { rok: String(Y), podpis: sig })
  const settled = JSON.parse((await db.prepare('SELECT settled FROM vat_ratios WHERE company_id = ? AND year = ?').bind(company, Y).first())?.settled ?? 'null')
  check(
    'the settlement kept as shown',
    (res.headers.get('location') ?? '').includes('ok=settled') && settled?.coef === 80 && settled.numerator === 80000 && settled.denominator === 100000 && settled.rates?.[0]?.settle === 115,
    JSON.stringify(settled),
  )
  page = plain(await (await acc.get(`/ucto/klienti/${company}/dph?obdobie=${Y}-12`)).text())
  check(
    "December's rows 18 to 19 hold the settlement, the period no longer kept back by it",
    !page.includes('po skončení roka treba v tomto období vysporiadať') && page.includes(`vysporiadanie koeficientom za rok ${Y}`) && page.includes('1,15'),
  )
  page = plain(await (await acc.get(`/ucto/klienti/${company}/kniha/ucet/548?rok=${Y}`)).text())
  check('the books on 31 December: 343.100 against 548', page.includes('1,15') && page.includes(`KOEF ${Y}`))

  // A document of the year changed after the settlement is seen.
  await issued('ra-rent2', 30000, 0, { on: `${Y}-11-02` }).run()
  page = plain(await (await acc.get(`${base}?rok=${Y}`)).text())
  check('a change of the year after the settlement is said', page.includes('Údaje roka sa od vysporiadania zmenili') && page.includes('Zmenené'))

  // A locked year changes no more.
  await db
    .prepare("INSERT INTO period_locks (company_id, through_on, version, change_id, changed_at, changed_by, reason) VALUES (?, ?, 1, 'lock-co-ratio', ?, ?, 'TEST-ONLY uzávierka')")
    .bind(company, `${Y}-12-31`, nowS, lucia.id)
    .run()
  res = await acc.post(`${base}/zrusit`, { rok: String(Y) })
  check(
    'a locked year: the settlement is not taken back',
    (res.headers.get('location') ?? '').includes('ok=locked') && (await db.prepare('SELECT settled FROM vat_ratios WHERE company_id = ? AND year = ?').bind(company, Y).first())?.settled !== null,
  )
  res = await acc.post(base, { rok: String(Y), koeficient: '0,60', sposob: 'estimate' })
  check(
    'nor its coefficient changed',
    (res.headers.get('location') ?? '').includes('ok=locked') && (await db.prepare('SELECT coef FROM vat_ratios WHERE company_id = ? AND year = ?').bind(company, Y).first())?.coef === 75,
  )
}
