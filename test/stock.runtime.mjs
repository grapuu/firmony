// Stock (17 October 2026), in workerd through the accountant's pages: the way it is kept chosen, items added one by
// one and pasted, a purchase of goods booked to 131 and received to 132, an issue valued at the average, an issue
// that would go short refused, moves pasted (all or none), a count's shortage, each item's card, the locked period,
// and a company that keeps its stock by counts (method B).
import { check } from './check.mjs'
import { writeFileSync } from 'node:fs'
import { changeLockStatement, dataRevision } from '../.wrangler/dist/stores.js'

export async function checkStock({ db, acc, lucia, nowS, day, capture }) {
  const plain = (text) => text.replace(/ /g, ' ')
  const company = 'co-sklad'
  const Y = Number(day(0).slice(0, 4)) - 1
  await db.batch([
    db
      .prepare("INSERT INTO companies (id, created_at, name, ico, dic, icdph, vat_payer, plan, inbox, accountant_id, start_on) VALUES (?, ?, 'TEST-ONLY Sklad s. r. o.', '63338888', '2126333888', 'SK2126333888', 1, 'firma', 'sklad001', ?, ?)")
      .bind(company, nowS, lucia.id, `${Y}-01-01`),
    db
      .prepare(
        `INSERT INTO documents (id, company_id, created_at, source, status, kind, party, number, issued_on, total_cents, vat_cents, currency, category, vat_deduct, booked_at, booked_by)
         VALUES ('sk-doc', ?, ?, 'upload', 'read', 'invoice_in', 'TEST-ONLY Veľkoobchod', 'F-100', ?, 12300, 2300, 'EUR', 'goods', 1, ?, ?)`,
      )
      .bind(company, nowS, `${Y}-03-01`, nowS, lucia.id),
  ])
  const base = `/ucto/klienti/${company}/kniha/sklad`
  let res = await acc.get(base)
  let page = plain(await res.text())
  check('the books have a stock tab; a company without stock is asked how it keeps it', res.status === 200 && page.includes('href="/ucto/klienti/co-sklad/kniha/sklad"') && page.includes('Začať viesť sklad'))
  res = await acc.post(`${base}/nastavenie`, { sposob: 'A', ocenenie: 'average' })
  check('method A with the weighted average chosen', res.status === 303 && (await db.prepare('SELECT method, valuation FROM stock_settings WHERE company_id = ?').bind(company).first())?.method === 'A')
  res = await acc.post(`${base}/polozky`, { kod: 'T-1', nazov: 'TEST-ONLY Tovar', jednotka: 'ks', druh: 'goods' })
  check('an item added', res.status === 303)
  res = await acc.post(`${base}/polozky`, { kod: 't-1', nazov: 'Znova', jednotka: 'ks', druh: 'goods' })
  check('its code again is refused', res.status === 422 && plain(await res.text()).includes('Položka s týmto kódom už je.'))
  res = await acc.post(`${base}/vlozit-polozky`, { riadky: 'kód;názov;jednotka;druh\nM-1;TEST-ONLY Materiál;kg;materiál\nE-1;TEST-ONLY Prázdna;ks;tovar' })
  check('items pasted', res.status === 303 && res.headers.get('location')?.includes('n=2') && (await db.prepare('SELECT COUNT(*) AS n FROM stock_items WHERE company_id = ?').bind(company).first())?.n === 3)
  const id = async (code) => (await db.prepare('SELECT id FROM stock_items WHERE company_id = ? AND code = ?').bind(company, code).first())?.id
  const goods = await id('T-1')

  res = await acc.post(`${base}/pohyby`, { pohyb: 'in', polozka: goods, den: `${Y}-03-02`, mnozstvo: '10', hodnota: '100,00', doklad: 'sk-doc', poznamka: 'Dodávka F-100' })
  check('a receipt of 10 for 100 €, against the purchase', res.status === 303, String(res.status))
  res = await acc.post(`${base}/pohyby`, { pohyb: 'out', polozka: goods, den: `${Y}-03-20`, mnozstvo: '4' })
  check('an issue of 4', res.status === 303)
  res = await acc.post(`${base}/pohyby`, { pohyb: 'out', polozka: goods, den: `${Y}-03-10`, mnozstvo: '7' })
  page = plain(await res.text())
  check('an issue that would leave a later one short is refused, nothing written', res.status === 422 && page.includes('klesla pod nulu') && (await db.prepare("SELECT COUNT(*) AS n FROM stock_moves WHERE company_id = ? AND kind = 'out'").bind(company).first())?.n === 1)
  const numbers = (await db.prepare('SELECT number FROM stock_moves WHERE company_id = ? ORDER BY created_at').bind(company).all()).results.map((r) => r.number)
  check('each move numbered by its kind and year', numbers.join() === `P-${Y}-0001,V-${Y}-0001`, numbers.join())

  res = await acc.get(`${base}?ku=${Y}-03-31`)
  const raw = await res.text()
  if (capture) writeFileSync(`${capture}/stock.html`, raw)
  page = plain(raw)
  check(
    'the stock at the month end: 6 at 10 €, 60 € on the cards and 60 € on 132 in the books',
    page.includes('6 ks') && page.includes('10,00 €') && page.includes('tovar (132): na kartách / v knihe na 132') && page.includes('60,00 € / 60,00 €') && !page.includes('sa líši od účtu'),
  )
  const journal = plain(await (await acc.get(`/ucto/klienti/${company}/kniha/dennik?rok=${Y}&mesiac=3`)).text())
  check(
    'the journal has the purchase on 131, the month\'s receipts 132/131 and issues 504/132',
    journal.includes(`Príjem na sklad za 03/${Y}`) && journal.includes(`Výdaj zo skladu za 03/${Y}`) && journal.includes('/kniha/ucet/131') && journal.includes(`SKL 03/${Y}`),
  )
  const trial = plain(await (await acc.get(`/ucto/klienti/${company}/kniha/ucet/131?rok=${Y}`)).text())
  check('131 nets to nought once the goods are received', trial.includes('Obstaranie tovaru'))

  // Pasted moves: all or none.
  res = await acc.post(`${base}/vlozit-pohyby`, { riadky: `${Y}-04-01;T-1;príjem;5;60\n${Y}-04-02;X-9;výdaj;1;` })
  check('a wrong pasted line keeps all back', res.status === 422 && plain(await res.text()).includes('neznámy kód X-9') && (await db.prepare('SELECT COUNT(*) AS n FROM stock_moves WHERE company_id = ?').bind(company).first())?.n === 2)
  res = await acc.post(`${base}/vlozit-pohyby`, { riadky: `Deň;Kód;Druh;Množstvo;Hodnota\n1.4.${Y};T-1;príjem;5;60\n${Y}-04-15;M-1;príjem;100;250\n${Y}-04-20;M-1;výdaj;40;\n${Y}-04-30;T-1;inventúra;10;` })
  check('moves pasted together', res.status === 303 && res.headers.get('location')?.includes('n=4'))
  const cardRaw = await (await acc.get(`${base}/${goods}`)).text()
  if (capture) writeFileSync(`${capture}/stock-item.html`, cardRaw)
  const card = plain(cardRaw)
  check(
    "the item's card: every move with the stock after it; the count found one short, a shortage at the average",
    card.includes('skladová karta T-1') && card.includes(`P-${Y}-0002`) && card.includes(`I-${Y}-0001`) && card.includes('10 (−1)') && card.includes('−10,91 €'),
  )
  const april = plain(await (await acc.get(`/ucto/klienti/${company}/kniha/dennik?rok=${Y}&mesiac=4`)).text())
  check('the count\'s shortage booked to 549', april.includes('Inventúra: rozdiely zásob') && april.includes('/kniha/ucet/549'))

  // The locked period: nothing of it moves.
  const user = await db.prepare('SELECT * FROM users WHERE id = ?').bind(lucia.id).first()
  await changeLockStatement(db, company, `${Y}-03-31`, 'TEST-ONLY lock of March', user.id, 0, await dataRevision(db, company)).run()
  res = await acc.post(`${base}/pohyby`, { pohyb: 'in', polozka: goods, den: `${Y}-03-25`, mnozstvo: '1', hodnota: '10' })
  check('a move dated in a locked period is refused', res.status === 409 && plain(await res.text()).includes('uzamknutého obdobia'))
  const march = (await db.prepare("SELECT id FROM stock_moves WHERE company_id = ? AND number = ?").bind(company, `V-${Y}-0001`).first())?.id
  res = await acc.post(`${base}/pohyby/${march}/odstranit`, {})
  check('removing one of it is refused', res.status === 303 && res.headers.get('location')?.includes('chyba=uzamknute') && (await db.prepare('SELECT deleted_at FROM stock_moves WHERE id = ?').bind(march).first())?.deleted_at === null)
  res = await acc.post(`${base}/nastavenie`, { sposob: 'A', ocenenie: 'fifo' })
  check('so is a change of the valuation that would value it again', res.status === 409)
  res = await acc.post(`${base}/${goods}`, { kod: 'T-1', nazov: 'TEST-ONLY Tovar premenovaný', jednotka: 'ks', druh: 'material' })
  check('and a change of an item\'s kind; its name alone may change', res.status === 409 && (await acc.post(`${base}/${goods}`, { kod: 'T-1', nazov: 'TEST-ONLY Tovar premenovaný', jednotka: 'ks', druh: 'goods' })).status === 303)
  res = await acc.post(`${base}/${goods}/odstranit`, {})
  check('an item with moves is not removed; an empty one is', res.status === 409 && (await acc.post(`${base}/${await id('E-1')}/odstranit`, {})).status === 303)
  res = await acc.get(`/ucto/klienti/co-a/kniha/sklad/${goods}`)
  check('an item is reached only through its own company', res.status === 404)

  // Method B: the count puts the stock on its account at the year's end and takes it back the next day.
  const b = 'co-sklad-b'
  await db.prepare("INSERT INTO companies (id, created_at, name, ico, vat_payer, plan, inbox, accountant_id, start_on) VALUES (?, ?, 'TEST-ONLY Sklad B s. r. o.', '63339999', 0, 'start', 'skladb01', ?, ?)").bind(b, nowS, lucia.id, `${Y}-01-01`).run()
  const baseB = `/ucto/klienti/${b}/kniha/sklad`
  await acc.post(`${baseB}/nastavenie`, { sposob: 'B', ocenenie: 'average' })
  await acc.post(`${baseB}/polozky`, { kod: 'B-1', nazov: 'TEST-ONLY Tovar B', jednotka: 'ks', druh: 'goods' })
  const itemB = (await db.prepare('SELECT id FROM stock_items WHERE company_id = ?').bind(b).first())?.id
  res = await acc.post(`${baseB}/pohyby`, { pohyb: 'in', polozka: itemB, den: `${Y}-05-01`, mnozstvo: '1', hodnota: '10' })
  check('method B takes no receipt', res.status === 422 && plain(await res.text()).includes('len inventúra'))
  res = await acc.post(`${baseB}/pohyby`, { pohyb: 'count', polozka: itemB, den: `${Y}-12-31`, mnozstvo: '40', hodnota: '520' })
  check('its year-end count', res.status === 303)
  const dec = plain(await (await acc.get(`/ucto/klienti/${b}/kniha/dennik?rok=${Y}&mesiac=12`)).text())
  const jan = plain(await (await acc.get(`/ucto/klienti/${b}/kniha/dennik?rok=${Y + 1}&mesiac=1`)).text())
  check('the stock on 132 against 504 on the count\'s day, taken back on the next', dec.includes('Inventúra: stav zásob podľa inventúry') && dec.includes('520,00') && jan.includes('Zúčtovanie stavu zásob z inventúry do nákladov'))
  const closingB = plain(await (await acc.get(`/ucto/klienti/${b}/zavierka?rok=${Y}`)).text())
  check('its closing has the counted stock in the balance sheet, and asks for no count', closingB.includes('<td class="num">520</td>') && !closingB.includes('zapíšte inventúru'))
  await db.prepare("UPDATE stock_moves SET on_date = ? WHERE company_id = ?").bind(`${Y}-12-30`, b).run()
  const withoutCount = plain(await (await acc.get(`/ucto/klienti/${b}/zavierka?rok=${Y}`)).text())
  check('without the count of the year\'s last day the closing waits for it', withoutCount.includes(`zapíšte inventúru k 31. 12. ${Y} v sklade`))

  // Stock by cost centre: an item given to a centre on its card, whatever is locked (management information).
  await db.prepare("INSERT INTO cost_centers (id, company_id, code, name, created_at) VALUES ('00000000-0000-4000-8000-00000000c0de', ?, 'PREDAJNA', 'TEST-ONLY Predajňa', ?)").bind(company, nowS).run()
  page = plain(await (await acc.get(`${base}/${goods}`)).text())
  check("an item's card offers the company's centres", page.includes('name="stredisko"') && page.includes('PREDAJNA'))
  res = await acc.post(`${base}/${goods}`, { kod: 'T-1', nazov: 'TEST-ONLY Tovar premenovaný', jednotka: 'ks', druh: 'goods', stredisko: '00000000-0000-4000-8000-00000000c0de' })
  check('the item kept with its centre', res.status === 303 && (await db.prepare('SELECT center_id FROM stock_items WHERE id = ?').bind(goods).first())?.center_id === '00000000-0000-4000-8000-00000000c0de')
  res = await acc.post(`${base}/${goods}`, { kod: 'T-1', nazov: 'TEST-ONLY Tovar premenovaný', jednotka: 'ks', druh: 'goods', stredisko: '00000000-0000-4000-8000-0000000000aa' })
  check('a centre that is none is refused with why', res.status === 422 && plain(await res.text()).includes('Toto stredisko neexistuje alebo je archivované'))
}
