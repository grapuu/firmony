// The register of fixed assets (17 October 2026), in workerd through the accountant's pages: an asset added, its
// putting in use and each ended month's depreciation in the journal, its plan, a change refused once its period is
// locked, a disposal in an open period, a removal, and the yearly archive carrying the register.
import { check } from './check.mjs'
import { writeFileSync } from 'node:fs'
import { changeLockStatement, dataRevision } from '../.wrangler/dist/stores.js'

export async function checkAssets({ db, acc, lucia, nowS, day, capture }) {
  const company = 'co-majetok'
  const thisYear = Number(day(0).slice(0, 4))
  const start = `${thisYear - 1}-01-01`
  await db.prepare("INSERT INTO companies (id, created_at, name, ico, dic, icdph, vat_payer, plan, inbox, accountant_id, start_on) VALUES (?, ?, 'Majetok s. r. o.', '63337777', '2126333777', 'SK2126333777', 1, 'firma', 'majetok01', ?, ?)")
    .bind(company, nowS, lucia.id, start).run()
  const base = `/ucto/klienti/${company}/kniha/majetok`
  let res = await acc.get(base)
  let page = (await res.text()).replace(/ /g, ' ')
  check('the books have a register of assets, empty with its form', res.status === 200 && page.includes('Evidencia majetku') && page.includes('Pridať do evidencie') && page.includes('href="/ucto/klienti/co-majetok/kniha/majetok"'))

  const machine = { nazov: 'TEST-ONLY Sústruh', ucet: '022', zaradenie: `${thisYear - 1}-03-15`, cena: '10 000', skupina: '1', metoda: 'straight', uctovne: 'tax', povod: 'purchase' }
  res = await acc.post(base, { ...machine, cena: '1 500' })
  page = (await res.text()).replace(/ /g, ' ')
  check('a machine of 1 500 € is no fixed asset for tax, and the form says so', res.status === 422 && page.includes('§ 22 ods. 2') && page.includes('value="TEST-ONLY Sústruh"'))
  res = await acc.post(base, machine)
  const row = await db.prepare('SELECT * FROM assets WHERE company_id = ?').bind(company).first()
  check('an asset is added with the next inventory number of its year', res.status === 303 && row?.number === `M-${thisYear - 1}-001` && row?.cost_cents === 1_000_000 && row?.tax_group === 1, JSON.stringify(row))
  res = await acc.post(base, { ...machine, nazov: 'TEST-ONLY Softvér', ucet: '013', skupina: '', uctovne: 'months', mesiace: '36', cena: '3 600', zaradenie: `${thisYear - 1}-02-01` })
  check('software over 36 months goes in as well, the next number of its year', res.status === 303 && (await db.prepare("SELECT number FROM assets WHERE company_id = ? AND account = '013'").bind(company).first())?.number === `M-${thisYear - 1}-002`)

  page = (await (await acc.get(base)).text()).replace(/ /g, ' ')
  if (capture) writeFileSync(`${capture}/assets.html`, page)
  check('the register lists both with their depreciation, and the year for the closing', page.includes(`M-${thisYear - 1}-001`) && page.includes('10 000,00 €') && page.includes(`Rok ${thisYear} pre závierku`) && page.includes('Daňové odpisy hmotného majetku'))
  const journal = (await (await acc.get(`/ucto/klienti/${company}/kniha/dennik?rok=${thisYear - 1}&mesiac=3`)).text()).replace(/ /g, ' ')
  check(
    'the journal of its month has the putting in use from 042 and the month\'s depreciation on 551',
    journal.includes('Zaradenie do užívania: TEST-ONLY Sústruh') && journal.includes(`ODP 03/${thisYear - 1}`) && journal.includes('/kniha/ucet/082') && journal.includes('/kniha/ucet/042'),
  )
  const detail = (await (await acc.get(`${base}/${row.id}`)).text()).replace(/ /g, ' ')
  if (capture) writeFileSync(`${capture}/asset.html`, detail)
  check('the asset\'s page has its plan year by year, the deferred part in the year after the four', detail.includes('Odpisový plán') && detail.includes('2 083,33 €') && detail.includes(String(thisYear + 3)) && detail.includes('416,67 €'))

  // Last year locked: a change that reaches it is refused; a disposal this year is not.
  const user = await db.prepare('SELECT * FROM users WHERE id = ?').bind(lucia.id).first()
  const locked = await changeLockStatement(db, company, `${thisYear - 1}-12-31`, 'TEST-ONLY lock of last year', user.id, 0, await dataRevision(db, company)).run()
  res = await acc.post(`${base}/${row.id}`, { ...machine, cena: '12 000' })
  page = (await res.text()).replace(/ /g, ' ')
  check('a change of an asset whose putting in use is locked is refused, nothing changed', locked.meta.changes >= 1 && res.status === 409 && page.includes('uzamknutého obdobia') && (await db.prepare('SELECT cost_cents FROM assets WHERE id = ?').bind(row.id).first())?.cost_cents === 1_000_000, `${locked.meta.changes} ${res.status} ${page.match(/field__error">[^<]*|notice[^>]*>[^<]*/g)}`)
  res = await acc.post(`${base}/${row.id}/vyradit`, { den: day(0), sposob: 'sale' })
  const sold = await db.prepare('SELECT disposed_on, disposal FROM assets WHERE id = ?').bind(row.id).first()
  check('a sale this year, in an open period, is written', res.status === 303 && sold?.disposed_on === day(0) && sold?.disposal === 'sale')
  res = await acc.post(`${base}/${row.id}/vyradit`, { den: `${thisYear - 1}-11-30`, sposob: 'liquidation', zrusit: '' })
  check('a disposal dated in the locked year is refused', res.status === 422 || res.status === 409)
  res = await acc.post(`${base}/${row.id}/odstranit`, {})
  check('removing an asset that reaches a locked period is refused too', res.status === 409 && (await db.prepare('SELECT deleted_at FROM assets WHERE id = ?').bind(row.id).first())?.deleted_at === null)
  res = await acc.get(`/ucto/klienti/co-a/kniha/majetok/${row.id}`)
  check('an asset is reached only through its own company', res.status === 404)
}
