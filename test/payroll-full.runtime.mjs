// Full payroll (17 October 2026), in workerd through the accountant's pages: an employee, a director, a student on a
// student's agreement with the deduction and an old-age pensioner on an agreement added by the form; three months of
// the employee closed; a sick leave whose daily base the app proposes from them; a month with holiday, overtime and a
// bonus that absences longer than the month keep back, then closed; each relationship's insurance on its slip; the
// books' 521, 523 and 527; a closed month's leave that can no longer change; the payslip.
import { check } from './check.mjs'
import { writeFileSync } from 'node:fs'
import { healthReporting, socialReporting } from '../.wrangler/dist/stores.js'

export async function checkPayrollFull({ db, acc, lucia, nowS, day, capture }) {
  const plain = (text) => text.replace(/\u00a0/g, ' ')
  const sk = (d) => `${Number(d.slice(8, 10))}. ${Number(d.slice(5, 7))}. ${d.slice(0, 4)}`
  const shift = (period, n) => {
    const [y, m] = period.split('-').map(Number)
    const t = new Date(Date.UTC(y, m - 1 + n, 1))
    return t.toISOString().slice(0, 7)
  }
  const today = day(0)
  const M = shift(today.slice(0, 7), -1) // last month: the one with the sick leave
  const A = shift(M, -3)
  const company = 'co-mzdy-plne'
  await db
    .prepare("INSERT INTO companies (id, created_at, name, ico, dic, vat_payer, plan, inbox, accountant_id, start_on) VALUES (?, ?, 'TEST-ONLY Mzdy s. r. o.', '63337777', '2126333777', 0, 'firma', 'mzdy0001', ?, ?)")
    .bind(company, nowS, lucia.id, `${A}-01`)
    .run()
  const base = `/ucto/klienti/${company}/mzdy`
  const person = (fields) => ({ meno: '', narodeny: '1. 1. 1990', poistovna: '25', nastup: sk(`${M}-01`), skoncenie: '', mzda: '0', vztah: 'employment', dochodok: 'none', odmenovanie: 'monthly', hodiny: '40', dovolenka: '', iban: '', ...fields })
  let res = await acc.post(`${base}/zamestnanec`, person({ meno: 'TEST-ONLY Ján Plný', nastup: sk(`${A}-01`), mzda: '1500', vyhlasenie: '1' }))
  check('an employee added', res.status === 303)
  res = await acc.post(`${base}/zamestnanec`, person({ meno: 'TEST-ONLY Eva Konateľka', vztah: 'director', mzda: '800' }))
  check('a director with an irregular remuneration added', res.status === 303)
  res = await acc.post(`${base}/zamestnanec`, person({ meno: 'TEST-ONLY Peter Študent', narodeny: '1. 1. 2005', vztah: 'dobps', oop: '1' }))
  check("a student on a student's agreement with the deduction added", res.status === 303)
  res = await acc.post(`${base}/zamestnanec`, person({ meno: 'TEST-ONLY Mária Dôchodkyňa', narodeny: '1. 1. 1955', vztah: 'employment', dochodok: 'old', oop: '1', pravidelny: '1' }))
  check('the deduction is refused on an employment: only a student or a pensioner on an agreement claims it', res.status === 422)
  res = await acc.post(`${base}/zamestnanec`, person({ meno: 'TEST-ONLY Mária Dôchodkyňa', narodeny: '1. 1. 1955', vztah: 'dovp', dochodok: 'old', oop: '1', pravidelny: '1' }))
  check('an old-age pensioner on an agreement with the deduction added', res.status === 303)
  res = await acc.post(`${base}/zamestnanec`, person({ meno: 'TEST-ONLY Zlá', vztah: 'dovp', oop: '1' }))
  check('the deduction for an agreement of somebody who is neither a student nor a pensioner is refused', res.status === 422 && plain(await res.text()).includes('Odpočítateľnú položku si uplatní len'))
  const ids = Object.fromEntries((await db.prepare('SELECT id, name, contract, regular, pension, exemption FROM employees WHERE company_id = ?').bind(company).all()).results.map((r) => [r.name.split(' ')[1], r]))
  check(
    'each kept with its relationship, regular income, pension and deduction',
    ids['Ján']?.contract === 'employment' && ids['Ján']?.regular === 1 && ids['Eva']?.contract === 'director' && ids['Eva']?.regular === 0 && ids['Peter']?.exemption === 1 && ids['Peter']?.regular === 0 && ids['Mária']?.pension === 'old' && ids['Mária']?.regular === 1,
    JSON.stringify(ids),
  )
  const jan = ids['Ján'].id
  const eva = ids['Eva'].id
  const peter = ids['Peter'].id
  const maria = ids['Mária'].id

  // Three months of Ján closed: the decisive period of the sick leave.
  for (const p of [A, shift(A, 1), shift(A, 2)]) {
    res = await acc.post(base, { obdobie: p, [`mzda_${jan}`]: '1500', vyplata: sk(`${shift(p, 1)}-10`), akcia: 'uzavriet' })
    check(`month ${p} closed`, res.status === 303 && res.headers.get('location')?.includes('mzdy-uzavrete'), res.headers.get('location'))
  }

  // The sick leave: its daily base proposed from the closed months.
  res = await acc.post(`${base}/pn`, { obdobie: M, zamestnanec: jan, od: sk(`${M}-05`), do: sk(`${M}-20`), dvz: '' })
  check('a sick leave written', res.status === 303 && res.headers.get('location')?.includes('mzdy-pn'))
  const leave = await db.prepare('SELECT * FROM sick_leaves WHERE company_id = ?').bind(company).first()
  let page = plain(await (await acc.get(`${base}?obdobie=${M}`)).text())
  check('its daily base proposed from the period of the closed months', page.includes('navrhnutý z obdobia') && page.includes(sk(`${A}-01`)), page.slice(page.indexOf('Práceneschopnosť'), page.indexOf('Práceneschopnosť') + 900))
  res = await acc.post(`${base}/pn`, { obdobie: M, zamestnanec: jan, od: sk(`${M}-18`), do: sk(`${M}-25`), dvz: '' })
  check('another over it is refused', res.status === 422 && plain(await res.text()).includes('prekrýva'))
  res = await acc.post(`${base}/pn`, { obdobie: M, zamestnanec: eva, od: sk(`${shift(M, -1)}-15`), do: '', dvz: '' })
  check('one before the employment is refused', res.status === 422 && plain(await res.text()).includes('počas pomeru'))
  res = await acc.post(`${base}/pn`, { obdobie: M, zamestnanec: jan, od: sk(`${A}-10`), do: sk(`${A}-12`), dvz: '45' })
  check('one in a closed month is refused', res.status === 422 && plain(await res.text()).includes('Najprv ho otvorte'))
  page = plain(await (await acc.get(`${base}?obdobie=${M}&pn=${leave.id}`)).text())
  check('a leave opened for a change fills the form', page.includes(`value="${sk(`${M}-05`)}"`) && page.includes('Uložiť PN'))
  res = await acc.get(`/ucto/klienti/co-a/mzdy?pn=${leave.id}`)
  check("another client's page knows nothing of it", !plain(await res.text()).includes(`value="${sk(`${M}-05`)}"`))

  // The month: absences longer than its working time keep it back.
  const month = (fields) => ({ obdobie: M, vyplata: sk(`${shift(M, 1)}-10`), [`mzda_${jan}`]: '1500', [`mzda_${eva}`]: '800', [`mzda_${peter}`]: '300', [`hodiny_${peter}`]: '20', [`mzda_${maria}`]: '400', ...fields })
  res = await acc.post(base, month({ [`dovolenka_${jan}`]: '25', akcia: 'uzavriet' }))
  check('absences longer than the month keep it back; it is kept as typed', res.status === 303 && res.headers.get('location')?.includes('mzdy-doplnit') && !(await db.prepare('SELECT closed_at FROM payroll_runs WHERE company_id = ? AND period = ?').bind(company, M).first())?.closed_at)
  page = plain(await (await acc.get(`${base}?obdobie=${M}`)).text())
  check('the page says what to put right', page.includes('Pred uzavretím treba doplniť') && page.includes('presahujú pracovný čas'))
  res = await acc.post(base, month({ [`nadcas_${jan}`]: 'veľa', akcia: 'ulozit' }))
  check('a wrong figure is said under its field', res.status === 422 && plain(await res.text()).includes('Hodiny napíšte číslom'))
  res = await acc.post(base, month({ [`dovolenka_${jan}`]: '2', [`nadcas_${jan}`]: '4', [`odmena_${jan}`]: '100', akcia: 'ulozit' }))
  check('the month kept', res.status === 303 && res.headers.get('location')?.includes('mzdy-ulozene'))
  const raw = await (await acc.get(`${base}?obdobie=${M}`)).text()
  if (capture) writeFileSync(`${capture}/payroll-full.html`, raw)
  page = plain(raw)
  check('the parts typed come back, the holiday pay and the sick pay stand on the slip', page.includes(`name="dovolenka_${jan}" value="2"`) && page.includes('Náhrada mzdy za dovolenku') && page.includes('Náhrada príjmu pri PN') && page.includes('Odmena člena orgánu'))
  res = await acc.post(base, month({ [`dovolenka_${jan}`]: '2', [`nadcas_${jan}`]: '4', [`odmena_${jan}`]: '100', akcia: 'uzavriet' }))
  check('then closed', res.status === 303 && res.headers.get('location')?.includes('mzdy-uzavrete'), res.headers.get('location'))
  const lines = JSON.parse((await db.prepare('SELECT lines FROM payroll_runs WHERE company_id = ? AND period = ?').bind(company, M).first())?.lines ?? '[]')
  const of = (id) => lines.find((l) => l.employeeId === id)
  const J = of(jan)
  const E = of(eva)
  const P = of(peter)
  const R = of(maria)
  check(
    "Ján's slip: the wage lowered by the holiday and the sick leave, holiday pay, overtime, the bonus, sick pay at 25 % and 55 % of the base proposed",
    J.pay.holiday > 0 && J.pay.overtime > 0 && J.pay.bonus === 10000 && J.pay.wage < 150000 && J.sick.parts[0].days25 === 3 && J.sick.parts[0].days55 === 11 && J.slip.sickPay === J.sick.amount && J.sick.amount > 0 && J.slip.socialBase === J.pay.gross,
    JSON.stringify({ pay: J.pay, sick: J.sick }),
  )
  check("Eva's remuneration: no accident nor guarantee insurance, 7 % hers", E.slip.contract === 'director' && E.slip.social.employer.accident === undefined && E.slip.socialEmployee === 5600)
  check("Peter's agreement: the deduction off 300 €, no health insurance, his hours kept", P.slip.exemption === 20000 && P.slip.healthInsured === false && P.slip.healthEmployee === 0 && P.pay.worked === 2000 && P.slip.socialEmployee === 700)
  check("Mária's agreement: neither sickness nor disability insurance, no health insurance", R.slip.social.employee.disability === undefined && R.slip.social.employee.sickness === undefined && R.slip.healthInsured === false && R.slip.socialEmployee === 800)
  // The month's reports: the Agency's with every relationship and its type; VšZP's without those the state insures.
  const targets = Object.fromEntries((await db.prepare('SELECT id, kind FROM payroll_targets WHERE company_id = ? AND period = ?').bind(company, M).all()).results.map((r) => [r.kind, r.id]))
  check('the month owes the Agency and VšZP a report', Boolean(targets.sp) && Boolean(targets.health25), JSON.stringify(targets))
  const social = await socialReporting.socialPlan(db, company, targets.sp, today)
  const types = Object.fromEntries(social.totals.rows.map((r) => [r.employeeId, r.typZec]))
  check(
    "the Agency's report has each person with the type of the relationship, its hours proposed; only the verified facts wait",
    social.totals.issues.length === 0 && types[jan] === 'ZEC' && types[eva] === 'ZECN' && types[peter] === 'ZECD3NV' && types[maria] === 'ZECD1V' && social.totals.rows.find((r) => r.employeeId === peter)?.paidHours === 2000 && social.issues.every((i) => /rodné číslo|IČPV|počet hodín/.test(i)),
    JSON.stringify({ types, issues: social.issues }),
  )
  const health = await healthReporting.healthPlan(db, company, targets.health25, today)
  check(
    "VšZP's report has Ján and Eva, not the student nor the pensioner",
    health.totals.issues.length === 0 && health.totals.rows.map((r) => r.employeeId).sort().join() === [jan, eva].sort().join() && JSON.parse(health.identitiesJson).length === 2,
    JSON.stringify({ rows: health.totals.rows.map((r) => r.employeeId), issues: health.totals.issues }),
  )
  const journal = plain(await (await acc.get(`/ucto/klienti/${company}/kniha/dennik?rok=${M.slice(0, 4)}&mesiac=${Number(M.slice(5))}`)).text())
  check('the books: wages on 521, the remuneration on 523, sick pay on 527', journal.includes('/kniha/ucet/521') && journal.includes('/kniha/ucet/523') && journal.includes('/kniha/ucet/527'))
  res = await acc.post(`${base}/pn`, { obdobie: M, id: leave.id, zamestnanec: jan, od: sk(`${M}-05`), do: sk(`${M}-15`), dvz: '' })
  check("the closed month's leave can no longer be changed", res.status === 422 && plain(await res.text()).includes('Najprv ho otvorte'))
  res = await acc.post(`${base}/pn/${leave.id}/odstranit`, { obdobie: M })
  check('nor removed', res.status === 303 && res.headers.get('location')?.includes('mzdy-pn-uzavrete') && (await db.prepare('SELECT deleted_at FROM sick_leaves WHERE id = ?').bind(leave.id).first())?.deleted_at === null)
  const slipPage = plain(await (await acc.get(`${base}/paska?obdobie=${M}&zamestnanec=${jan}`)).text())
  check('the payslip has each part of the month', slipPage.includes('Mzda za odpracovaný čas') && slipPage.includes('Náhrada príjmu pri PN') && slipPage.includes('Mzda a príplatok za nadčas') && slipPage.includes('Pracovný pomer'))
  page = plain(await (await acc.get(`${base}?obdobie=${M}`)).text())
  check('the holiday taken stands with the employee', page.includes(`dovolenka ${M.slice(0, 4)}: čerpané 2 z`))
  // The annual settlement of the year: worked out from the closed months, the month after the year to settle in.
  const year = Number(M.slice(0, 4))
  const rz = `${base}/rocne`
  res = await acc.post(rz, { rok: String(year), zamestnanec: jan, ine_taxable: '', dds: '100', zuctovat: `${year}-12` })
  check('a settlement in a month of the year itself is refused, as one not asked for', res.status === 422 && plain(await res.text()).includes('Vyberte mesiac po skončení roka'))
  res = await acc.post(rz, { rok: String(year), zamestnanec: jan, poziadal: '1', dds: '100', ine_months: '13', zuctovat: `${year + 1}-03` })
  check('months above twelve are refused', res.status === 422 && plain(await res.text()).includes('od 0 do 12'))
  res = await acc.post(rz, { rok: String(year), zamestnanec: jan, poziadal: '1', dds: '100', zuctovat: `${year + 1}-03` })
  check('the settlement worked out and kept with its month', res.status === 303 && res.headers.get('location')?.includes('ok=rz'))
  const kept = await db.prepare('SELECT * FROM tax_settlements WHERE company_id = ? AND employee_id = ?').bind(company, jan).first()
  const result = JSON.parse(kept?.result ?? 'null')
  check('its result: the closed months\' income, the parts, the tax against the advances', kept?.settle_in === `${year + 1}-03` && result.taxable > 0 && result.nonTaxable.dds === 10000 && result.advances > 0 && result.taxDifference === result.tax - result.advances, JSON.stringify(result))
  const rzRaw = await (await acc.get(`${rz}?rok=${year}`)).text()
  if (capture) writeFileSync(`${capture}/settlement.html`, rzRaw)
  const rzPage = plain(rzRaw)
  check('the page has each person of the year and the result', rzPage.includes('TEST-ONLY Ján Plný') && rzPage.includes('TEST-ONLY Peter Študent') && rzPage.includes('Čiastkový základ dane') && rzPage.includes(`So mzdou za marec ${year + 1}`) && rzPage.includes('Podklady pre ročné hlásenie') && rzPage.includes(`do 30. apríla ${year + 1}`))
  const certificate = plain(await (await acc.get(`${base}/potvrdenie?rok=${year}&zamestnanec=${jan}`)).text())
  check('the statement of taxable income of the year', certificate.includes('Potvrdenie o zdaniteľných príjmoch') && certificate.includes('Úhrn zdaniteľných príjmov') && certificate.includes('Zrazené preddavky na daň'))
  check(
    'the student and the pensioner on agreements are registered with the Social Insurance Agency, never with a health insurer',
    page.includes('Sociálnej poisťovne: TEST-ONLY Peter Študent') && !page.includes('VšZP: TEST-ONLY Peter Študent') && !page.includes('VšZP: TEST-ONLY Mária Dôchodkyňa') && page.includes('VšZP: TEST-ONLY Eva Konateľka'),
  )
}
