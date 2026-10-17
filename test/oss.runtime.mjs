// The one-stop shop (17 October 2026), in workerd: a company in the EU scheme, an issued invoice booked in the mode OSS
// on the booking form, the quarter's return (its lines, the file, the mark, the client told), a change after filing,
// the mark taken back, the books on 343.400, and the deadline on the screen.
import { check } from './check.mjs'
import { writeFileSync } from 'node:fs'

export async function checkOss({ db, acc, lucia, nowS, day, capture }) {
  const plain = (text) => text.replace(/[  ]/g, ' ')
  const company = 'co-oss'
  const today = day(0)
  const quarterOf = (d) => `${d.slice(0, 4)}-Q${Math.ceil(Number(d.slice(5, 7)) / 3)}`
  const current = quarterOf(today)
  const prev = current.endsWith('Q1') ? `${Number(current.slice(0, 4)) - 1}-Q4` : `${current.slice(0, 6)}${Number(current.slice(6)) - 1}`
  const month = String(Number(prev.slice(6)) * 3 - 2).padStart(2, '0')
  const supplied = `${prev.slice(0, 4)}-${month}-10`
  const since = `${prev.slice(0, 4)}-${month}-01`
  await db.batch([
    db
      .prepare(
        "INSERT INTO companies (id, created_at, name, ico, dic, icdph, vat_payer, vat_since, oss_since, plan, inbox, accountant_id, start_on, address) VALUES (?, ?, 'TEST-ONLY E-shop s. r. o.', '63336666', '2126333666', 'SK2126333666', 1, ?, ?, 'firma', 'oss00001', ?, ?, 'Hlavná 1, 040 01 Košice')",
      )
      .bind(company, nowS, since, since, lucia.id, since),
    db
      .prepare(
        "INSERT INTO documents (id, company_id, created_at, source, status, kind, party, number, issued_on, supplied_on, total_cents, vat_cents, currency, category, booked_at, booked_by, vat_mode, vat_lines, vat_country) VALUES ('oss-de', ?, ?, 'upload', 'read', 'invoice_out', 'TEST-ONLY Kunde', 'E-1', ?, ?, 11900, 1900, 'EUR', 'sales_goods', ?, ?, 'oss', '[{\"rate\":19,\"base\":10000,\"vat\":1900,\"deduct\":0}]', 'DE')",
      )
      .bind(company, nowS, supplied, supplied, nowS, lucia.id),
    db
      .prepare(
        "INSERT INTO documents (id, company_id, created_at, source, status, kind, party, number, issued_on, total_cents, vat_cents, currency, category) VALUES ('oss-at', ?, ?, 'upload', 'read', 'invoice_out', 'TEST-ONLY Kunde AT', 'E-2', ?, 24000, 4000, 'EUR', 'sales')",
      )
      .bind(company, nowS, supplied),
  ])
  const [y, m, d] = supplied.split('-')
  const textDay = `${Number(d)}. ${Number(m)}. ${y}`
  let res = await acc.get('/ucto/doklady/oss-at')
  let page = plain(await res.text())
  check(
    'the booking form of a company in the scheme offers the mode OSS with the member state and its rate',
    res.status === 200 && page.includes('value="oss"') && page.includes('name="dph_stat"') && page.includes('name="dph_oss_sadzba"'),
  )
  const form = {
    akcia: 'zauctovat',
    kind: 'invoice_out',
    category: 'sales',
    party: 'TEST-ONLY Kunde AT',
    ico: '',
    number: 'E-2',
    vs: '',
    issued: textDay,
    due: '',
    total: '240,00',
    vat: '40,00',
    account: '',
    currency: 'EUR',
    rate: '',
    dph: '1',
    dph_rezim: 'oss',
    dph_dodanie: textDay,
    dph_icdph: '',
    dph_opravuje: '',
    dph_obdobie: '',
    dph_stat: 'AT',
    dph_oss_sadzba: '20',
    dph_oss_zaklad: '200,00',
    dph_oss_dan: '',
  }
  res = await acc.post('/ucto/doklady/oss-at', { ...form, dph_stat: '' })
  check('without the member state the form says so', res.status === 422 && plain(await res.text()).includes('Vyberte štát spotreby.'))
  res = await acc.post('/ucto/doklady/oss-at', form)
  const at = await db.prepare("SELECT vat_mode, vat_country, vat_lines, booked_at FROM documents WHERE id = 'oss-at'").first()
  check(
    'booked in the mode OSS: Austria, 20 %, the VAT counted from the base',
    res.status === 303 && at?.vat_mode === 'oss' && at.vat_country === 'AT' && JSON.parse(at.vat_lines)[0]?.vat === 4000 && at.booked_at,
    JSON.stringify(at),
  )

  const base = `/ucto/klienti/${company}/dph/oss`
  res = await acc.get(`${base}?stvrtrok=${prev}`)
  const raw = await res.text()
  if (capture) writeFileSync(`${capture}/oss.html`, raw)
  page = plain(raw)
  check(
    "the quarter's return: each state's line, its kind and rate, the balances and the total; the running quarter beside it",
    res.status === 200 &&
      page.includes('Pripravené') &&
      page.includes('19 % (základná)') &&
      page.includes('20 % (základná)') &&
      page.includes('Spolu na úhradu') &&
      page.includes('59,00 €') &&
      page.includes('Štvrťrok beží'),
  )
  check('the VAT page leads to it', (await (await acc.get(`/ucto/klienti/${company}/dph`)).text()).includes(base))
  res = await acc.get(`${base}.xml?stvrtrok=${prev}`)
  const xml = await res.text()
  check(
    'the file for the OSS portal',
    res.status === 200 &&
      xml.includes('<OSSVATReturnMSCON xmlns="urn:ec.europa.eu:taxud:frsr:vatunion:v1.0">') &&
      xml.includes('<VATNumber issuedBy="SK">2126333666</VATNumber>') &&
      xml.includes('<TotalVATAmountDue currency="EUR">59.00</TotalVATAmountDue>'),
  )
  res = await acc.post(`${base}/podane`, { stvrtrok: current, datum: '' })
  check('a quarter that runs is not marked', res.status === 303 && (res.headers.get('location') ?? '').includes('ok=notReady'))
  res = await acc.post(`${base}/podane`, { stvrtrok: prev, datum: '' })
  const filed = await db.prepare('SELECT data, xml FROM oss_returns WHERE company_id = ? AND quarter = ?').bind(company, prev).first()
  const message = await db.prepare("SELECT body FROM messages WHERE company_id = ? AND side = 'firmony' ORDER BY created_at DESC LIMIT 1").bind(company).first()
  check(
    'marked as filed with what it declared and its file; the client told what to pay and by when',
    res.status === 303 && JSON.parse(filed?.data ?? '{}').total === 5900 && filed.xml === xml && plain(message?.body ?? '').includes('Daň 59,00 €'),
    JSON.stringify(message),
  )
  res = await acc.post(`${base}/podane`, { stvrtrok: prev, datum: '' })
  check('marked once', res.status === 303 && (res.headers.get('location') ?? '').includes('ok=already'))

  await db.prepare('UPDATE documents SET vat_lines = \'[{"rate":19,"base":5000,"vat":950,"deduct":0}]\' WHERE id = \'oss-de\'').run()
  page = plain(await (await acc.get(`${base}?stvrtrok=${prev}`)).text())
  check('a change after filing is said: it goes into the next return as a correction', page.includes('Podané, odvtedy zmenené') && page.includes('59,00 €'))
  const journal = plain(await (await acc.get(`/ucto/klienti/${company}/kniha/ucet/343.400?rok=${y}&mesiac=12`)).text())
  check('the books keep the VAT of other states on 343.400', journal.includes('DPH iných štátov EÚ (OSS)') && journal.includes('40,00'))
  const dues = plain(await (await acc.get('/ucto/terminy?hotove=1')).text())
  check('the deadlines list the quarters of the scheme', dues.includes('Priznanie OSS za') && dues.includes('TEST-ONLY E-shop s. r. o.'))
  res = await acc.post(`${base}/zrusit`, { stvrtrok: prev })
  check('the mark of the last quarter filed taken back', res.status === 303 && (await db.prepare('SELECT COUNT(*) AS n FROM oss_returns WHERE company_id = ?').bind(company).first())?.n === 0)
}
