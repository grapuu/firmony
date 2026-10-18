// The adjustment on investment property (18 October 2026, vat-assets.ts, § 54 to § 54d), in workerd through the
// accountant's asset page: a building whose period began in 2018 under the former rules, rented free of VAT from last
// year, gives back every year left at once in last December's rows 18 to 19 and in the books; a locked year's end
// refuses changes that reach it and lets later ones through.
import { check } from './check.mjs'
import { writeFileSync } from 'node:fs'

export async function checkAssetVat({ db, acc, lucia, nowS, day, capture }) {
  const plain = (text) => text.replace(/[\u00a0\u202f]/g, ' ')
  const company = 'co-54'
  const Y = Number(day(0).slice(0, 4)) - 1
  await db.batch([
    db
      .prepare(
        `INSERT INTO companies (id, created_at, name, ico, dic, icdph, address, vat_payer, vat_since, tax_office, plan, inbox, accountant_id, start_on)
         VALUES (?, ?, 'TEST-ONLY Budova s. r. o.', '63335601', '2126335601', 'SK2126335601', 'Hlavná 6, 811 01 Bratislava', 1, '2017-01-01', 'Bratislava', 'firma', 'budo0001', ?, ?)`,
      )
      .bind(company, nowS, lucia.id, `${Y}-01-01`),
    db
      .prepare(
        `INSERT INTO assets (id, company_id, number, name, account, cost_cents, in_use_on, tax_group, tax_method, source, prior_book_cents, prior_tax_cents, prior_tax_years, created_at, created_by)
         VALUES ('as-54', ?, 'M-2018-001', 'TEST-ONLY Administratívna budova', '021', 10000000, '2018-05-01', 6, 'straight', 'opening', 1500000, 1500000, 6, ?, ?)`,
      )
      .bind(company, nowS, lucia.id),
  ])
  const base = `/ucto/klienti/${company}/kniha/majetok/as-54`
  let page = plain(await (await acc.get(base)).text())
  check('the asset page of a VAT payer offers the adjustment of § 54', page.includes('DPH: úprava odpočítanej dane (§ 54)') && page.includes('Zapísať údaje DPH'))

  let res = await acc.post(`${base}/dph`, { dph_sadzba: '23', dph_dv: '', dph_rok: '2018', dph_odpocet: '1', dph_podnikanie: '1', dph_pouzitie: 'fixed', dph_predaj: '' })
  check('without DV: refused', res.status === 422 && plain(await res.text()).includes('Zadajte daň z obstarávacej ceny'))
  res = await acc.post(`${base}/dph`, { dph_sadzba: '23', dph_dv: '20 000', dph_rok: '2018', dph_odpocet: '1', dph_podnikanie: '1', dph_pouzitie: 'fixed', dph_predaj: '' })
  const kept = await db.prepare("SELECT * FROM asset_vat WHERE asset_id = 'as-54'").first()
  check(
    'its VAT written: 20 000 € at 23 %, first used 2018, deducted in full',
    res.status === 303 && kept?.lines === JSON.stringify([{ rate: 23, vat: 2000000 }]) && kept.first_year === 2018 && kept.deducted === 100,
    JSON.stringify(kept),
  )
  res = await acc.post(`${base}/dph/pouzitie`, { od: '2017', pouzitie: 'exempt', podiel: '', podnikanie: '1' })
  check('a change of use before the period: refused', res.status === 422)
  res = await acc.post(`${base}/dph/pouzitie`, { od: String(Y), pouzitie: 'exempt', podiel: '', podnikanie: '1' })
  check(
    'rented free of VAT from last year: written',
    res.status === 303 && (await db.prepare("SELECT COUNT(*) AS n FROM asset_vat_uses WHERE asset_id = 'as-54' AND deleted_at IS NULL").first())?.n === 1,
  )

  const left = 2037 - Y + 1
  const back = Math.round((2000000 * left) / 20)
  const eur = (cents) =>
    `${Math.floor(cents / 100)
      .toLocaleString('sk-SK')
      .replace(/\s/g, ' ')},${String(cents % 100).padStart(2, '0')}`
  const raw = await (await acc.get(base)).text()
  if (capture) writeFileSync(`${capture}/asset-vat.html`, raw)
  page = plain(raw)
  check(`the plan: ${Y} adjusts ${left}/20 at once (the former rules), less deducted`, page.includes(`${left}/20`) && page.includes(eur(back)) && page.includes('doterajšie pravidlá'), eur(back))
  page = plain(await (await acc.get(`/ucto/klienti/${company}/dph?obdobie=${Y}-12`)).text())
  check(
    `December ${Y}: row 19 lowered by the adjustment, said with the asset and how to open it`,
    page.includes('úprava odpočítanej dane pri investičnom majetku') && page.includes('M-2018-001') && page.includes(eur(back)) && page.includes('Otvoriť majetok'),
  )
  page = plain(await (await acc.get(`/ucto/klienti/${company}/kniha/ucet/343.100?rok=${Y}`)).text())
  check(`the books: 31 December ${Y}, 548 against 343.100`, page.includes('Úprava odpočítanej dane pri investičnom majetku') && page.includes(eur(back)))

  // A lock through last December: what reaches it is refused, a change from this year is not.
  await db
    .prepare("INSERT INTO period_locks (company_id, through_on, version, change_id, changed_at, changed_by, reason) VALUES (?, ?, 1, 'lock-54', ?, ?, 'TEST-ONLY koniec roka')")
    .bind(company, `${Y}-12-31`, nowS, lucia.id)
    .run()
  res = await acc.post(`${base}/dph/pouzitie`, { od: String(Y), pouzitie: 'taxable', podiel: '', podnikanie: '1' })
  check('locked: a change of use from last year refused', res.status === 409 && plain(await res.text()).includes('koniec je uzamknutý'))
  res = await acc.post(`${base}/dph`, { dph_sadzba: '23', dph_dv: '21 000', dph_rok: '2018', dph_odpocet: '1', dph_podnikanie: '1', dph_pouzitie: 'fixed', dph_predaj: '' })
  check('locked: DV changed refused', res.status === 409)
  res = await acc.post(`${base}/dph/pouzitie`, { od: String(Y + 1), pouzitie: 'share', podiel: '0,50', podnikanie: '1' })
  check('a change from this year: written', res.status === 303 && (await db.prepare("SELECT COUNT(*) AS n FROM asset_vat_uses WHERE asset_id = 'as-54' AND deleted_at IS NULL").first())?.n === 2)
  const use = await db.prepare("SELECT id FROM asset_vat_uses WHERE asset_id = 'as-54' AND from_year = ? AND deleted_at IS NULL").bind(Y).first()
  res = await acc.post(`${base}/dph/pouzitie/${use?.id}/zrusit`, {})
  check("locked: last year's change cannot be removed", res.status === 409)
}
