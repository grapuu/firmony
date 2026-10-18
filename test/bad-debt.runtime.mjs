// § 25a (18 October 2026, bad-debt.ts), in workerd through the accountant's pages: an issued invoice 150 days past its due
// day not paid is offered; its base lowered by the form (refused without what § 25a asks, and for a period whose return's
// deadline has passed), the corrective document numbered, shown and marked sent; the books take the VAT off 343.200; a
// payment that comes after a lowering keeps its period back until its own corrective document is made, then raises the
// base again; the correction taken back takes its raising along.
import { check } from './check.mjs'
import { writeFileSync } from 'node:fs'

export async function checkBadDebt({ db, acc, lucia, nowS, day, capture }) {
  const plain = (text) => text.replace(/[  ]/g, ' ')
  const sk = (d) => `${Number(d.slice(8, 10))}. ${Number(d.slice(5, 7))}. ${d.slice(0, 4)}`
  const company = 'co-25a'
  const Y = Number(day(0).slice(0, 4)) - 1
  const now = Number(day(0).slice(0, 4))
  const at = (d) => Math.floor(Date.parse(`${d}T10:00:00Z`) / 1000)
  const invoice = (id, number) =>
    db
      .prepare(
        `INSERT INTO documents (id, company_id, created_at, source, status, kind, party, party_ico, number, issued_on, due_on, supplied_on, total_cents, vat_cents, currency, category,
           booked_at, booked_by, vat_mode, vat_lines, party_vat_id)
         VALUES (?, ?, ?, 'upload', 'read', 'invoice_out', 'TEST-ONLY Neplatič s. r. o.', '50777001', ?, ?, ?, ?, 12300, 2300, 'EUR', 'sales', ?, ?, 'domestic', ?, 'SK2020777001')`,
      )
      .bind(id, company, at(`${Y}-01-10`), number, `${Y}-01-10`, `${Y}-01-31`, `${Y}-01-10`, nowS, lucia.id, JSON.stringify([{ rate: 23, base: 10000, vat: 2300, deduct: 0 }]))
  await db.batch([
    db
      .prepare(
        `INSERT INTO companies (id, created_at, name, ico, dic, icdph, address, vat_payer, vat_since, tax_office, plan, inbox, accountant_id, start_on)
         VALUES (?, ?, 'TEST-ONLY Veriteľ s. r. o.', '63335401', '2126335401', 'SK2126335401', 'Hlavná 3, 811 01 Bratislava', 1, ?, 'Bratislava', 'firma', 'veri0001', ?, ?)`,
      )
      .bind(company, nowS, `${Y}-01-01`, lucia.id, `${Y}-01-01`),
    invoice('bd-out', 'FA-25A1'),
  ])
  const base = `/ucto/klienti/${company}/dph/nevymozitelne`
  const vatPage = async (period) => plain(await (await acc.get(`/ucto/klienti/${company}/dph?obdobie=${period}`)).text())
  const thisMonth = day(0).slice(0, 7)

  let page = await vatPage(thisMonth)
  check('the VAT page leads to the bad debts', page.includes('Nevymožiteľné pohľadávky (§ 25a)') && page.includes(base))
  page = plain(await (await acc.get(base)).text())
  check('an invoice 150 days past its due day not paid is offered', page.includes('FA-25A1') && page.includes('123,00') && page.includes(`${base}/bd-out`))

  const form = (fields) => acc.post(`${base}/bd-out`, { dovod: 'a1', den: sk(day(0)), suma: '', dokaz: 'Upomienka odoslaná dnes', potvrdenie: '1', ...fields })
  const count = async () => (await db.prepare('SELECT COUNT(*) AS n FROM bad_debts WHERE company_id = ? AND deleted_at IS NULL').bind(company).first())?.n
  let res = await form({ dovod: 'a2' })
  check('a claim up to 1 000 € by an action: refused, the step is the case', res.status === 422 && plain(await res.text()).includes('Do 1 000 € s DPH vyberte prvú možnosť') && (await count()) === 0)
  res = await form({ potvrdenie: '' })
  check('without the word on § 25a(4): refused', res.status === 422 && plain(await res.text()).includes('Potvrďte, že nejde o prípad') && (await count()) === 0)
  res = await form({ den: sk(`${Y}-02-15`) })
  check(
    "a step of last February: uncollectible on 1 July of that year, whose return's deadline has passed: refused, a new step asked for",
    res.status === 422 && plain(await res.text()).includes('Lehota na podanie priznania za obdobie tohto dňa uplynula') && (await count()) === 0,
  )
  const raw = await (await acc.get(`${base}/bd-out`)).text()
  if (capture) writeFileSync(`${capture}/bad-debt.html`, raw)
  res = await form({})
  const lowered = await db.prepare("SELECT * FROM bad_debts WHERE company_id = ? AND kind = 'reduce'").bind(company).first()
  check(
    'lowered on the day of the step taken today, the whole 123 €, its corrective document numbered',
    res.status === 303 && lowered?.event_on === day(0) && lowered.cents === 12300 && lowered.number === `OD-${now}-001` && lowered.lines === JSON.stringify([{ rate: 23, base: 10000, vat: 2300 }]),
    JSON.stringify(lowered),
  )
  res = await form({})
  check('a second lowering of the same invoice is not made', (res.headers.get('location') ?? '').includes('ok=exists') && (await count()) === 1)

  page = await vatPage(thisMonth)
  check(
    'this month: rows 26 and 27 lowered, said why, and that the corrective document is not sent yet',
    page.includes('Oprava základu dane pri nevymožiteľnej pohľadávke (§ 25a)') &&
      page.includes('Oprava dane pri nevymožiteľnej pohľadávke (§ 25a)') &&
      page.includes('100,00') &&
      page.includes('Pohľadávka z vystavenej faktúry je nevymožiteľná') &&
      page.includes('ešte nie je označený ako odoslaný'),
  )
  page = plain(await (await acc.get(`${base}/bd-out/doklad?druh=reduce`)).text())
  check(
    'the corrective document: its number and day, "oprava základu dane podľa § 25a", the invoice, both sides, the amounts',
    page.includes(`OD-${now}-001`) &&
      page.includes('oprava základu dane podľa § 25a') &&
      page.includes('FA-25A1') &&
      page.includes('TEST-ONLY Neplatič s. r. o.') &&
      page.includes('SK2126335401') &&
      page.includes('23,00'),
  )
  res = await acc.post(`${base}/bd-out/odoslane`, { zaznam: lowered?.id ?? '', den: sk(day(0)) })
  check('marked sent', res.status === 303 && (await db.prepare("SELECT sent_on FROM bad_debts WHERE kind = 'reduce' AND company_id = ?").bind(company).first())?.sent_on === day(0))
  page = await vatPage(thisMonth)
  check('sent: no warning left', !page.includes('ešte nie je označený ako odoslaný'))
  page = plain(await (await acc.get(`/ucto/klienti/${company}/kniha/ucet/343.200?rok=${now}`)).text())
  check('the books: the VAT taken off 343.200 today', page.includes('Oprava dane pri nevymožiteľnej pohľadávke (§ 25a)') && page.includes('23,00'))

  // A lowering of last July, made and sent in time, and a payment in September: kept back until its own corrective
  // document is made, then the base raised again.
  await db.batch([
    invoice('bd-paid', 'FA-25A2'),
    db
      .prepare(
        `INSERT INTO bad_debts (id, company_id, document_id, kind, ground, event_on, year, seq, number, issued_on, sent_on, lines, cents, evidence, created_at, created_by)
         VALUES ('bd-paid-r', ?, 'bd-paid', 'reduce', 'a1', ?, ?, 50, ?, ?, ?, ?, 12300, 'TEST-ONLY upomienka', ?, ?)`,
      )
      .bind(company, `${Y}-07-01`, Y, `OD-${Y}-050`, `${Y}-07-02`, `${Y}-07-20`, JSON.stringify([{ rate: 23, base: 10000, vat: 2300 }]), nowS, lucia.id),
    db.prepare("INSERT INTO accounts (id, company_id, iban) VALUES ('acc-25a', ?, 'SK3112000000198742637541')").bind(company),
    db
      .prepare(
        "INSERT INTO payments (id, company_id, account_id, created_at, booked_on, amount_cents, party, vs, ref) VALUES ('pay-25a', ?, 'acc-25a', ?, ?, 12300, 'TEST-ONLY Neplatič s. r. o.', 'FA25A2', 'p25a')",
      )
      .bind(company, nowS, `${Y}-09-03`),
    db.prepare("INSERT INTO links (document_id, payment_id, company_id, how, created_at) VALUES ('bd-paid', 'pay-25a', ?, 'accountant', ?)").bind(company, nowS),
  ])
  page = await vatPage(`${Y}-07`)
  check('last July: the lowering made in time in rows 26 and 27', page.includes('Oprava základu dane pri nevymožiteľnej pohľadávke (§ 25a)') && !page.includes('ešte nie je označený ako odoslaný'))
  page = await vatPage(`${Y}-09`)
  check('September, paid: kept back until the corrective document of the payment is made', page.includes('treba vyhotoviť opravný doklad k prijatej platbe'))
  res = await acc.post(`${base}/bd-paid/platba`, {})
  const raised = await db.prepare("SELECT * FROM bad_debts WHERE company_id = ? AND kind = 'restore'").bind(company).first()
  check(
    'the corrective document of the payment: the whole raised, numbered next',
    res.status === 303 && raised?.event_on === `${Y}-09-03` && raised.number === `OD-${now}-002` && raised.cents === 12300,
    JSON.stringify(raised),
  )
  page = await vatPage(`${Y}-09`)
  check(
    'September: rows 26 and 27 raised again, nothing kept back by it',
    page.includes('Odberateľ po oprave podľa § 25a zaplatil') && page.includes('100,00') && !page.includes('treba vyhotoviť opravný doklad k prijatej platbe'),
  )
  page = plain(await (await acc.get(`${base}/bd-paid/doklad?druh=restore`)).text())
  check('its document names the first one and the payment', page.includes(`OD-${now}-002`) && page.includes(`OD-${Y}-050`) && page.includes('Prijatá platba'))
  page = plain(await (await acc.get(`/ucto/klienti/${company}/kniha/ucet/343.200?rok=${Y}`)).text())
  check('the books: off 343.200 on 1 July, back on 3 September', page.includes('Oprava dane pri nevymožiteľnej pohľadávke (§ 25a)') && page.includes('Oprava zníženej dane po prijatej platbe (§ 25a)'))

  // Taken back: the raising goes with it.
  res = await acc.post(`${base}/bd-paid/zrusit`, { zaznam: 'bd-paid-r' })
  page = await vatPage(`${Y}-07`)
  check(
    'the correction taken back with its raising: last July as before',
    res.status === 303 &&
      (await db.prepare("SELECT COUNT(*) AS n FROM bad_debts WHERE document_id = 'bd-paid' AND deleted_at IS NULL").first())?.n === 0 &&
      !page.includes('Oprava základu dane pri nevymožiteľnej pohľadávke'),
  )
}
