// Intrastat (17 October 2026), in workerd: a company's settings, a month of arrivals with an invoice below 1 000 €
// reported simply and one above it waiting for its goods, the goods given, the file (ISO-8859-2, valid against
// instat62.xsd), the mark, the deadline, a change after sending and what follows it, dispatches, the mark taken back.
import { check } from './check.mjs'
import { readFileSync, writeFileSync } from 'node:fs'
import { validateXML } from 'xmllint-wasm'

const xsd = readFileSync(new URL('./xsd/instat62.xsd', import.meta.url), 'latin1').replace('encoding = "ISO-8859-2"', 'encoding = "UTF-8"')
const valid = async (text) => {
  const result = await validateXML({ xml: [{ fileName: 'i.xml', contents: text.replace('encoding="ISO-8859-2"', 'encoding="UTF-8"') }], schema: [{ fileName: 'instat62.xsd', contents: xsd }] })
  return { ok: result.valid, why: result.errors.map((e) => e.message).join(' | ') }
}

export async function checkIntrastat({ db, acc, lucia, nowS, day, capture }) {
  const plain = (text) => text.replace(/[  ]/g, ' ')
  const company = 'co-istat'
  const today = day(0)
  const [ty, tm] = today.split('-').map(Number)
  const month = tm === 1 ? `${ty - 1}-12` : `${ty}-${String(tm - 1).padStart(2, '0')}`
  const mmyyyy = `${month.slice(5, 7)}/${month.slice(0, 4)}`
  const supplied = `${month}-05`
  await db.batch([
    db
      .prepare(
        "INSERT INTO companies (id, created_at, name, ico, dic, icdph, vat_payer, vat_since, plan, inbox, accountant_id, start_on, address) VALUES (?, ?, 'TEST-ONLY Dovoz Vývoz s. r. o.', '64447777', '2126444777', 'SK2126444777', 1, ?, 'firma', 'ist00001', ?, ?, 'Hlavná 1, 040 01 Košice')",
      )
      .bind(company, nowS, `${month.slice(0, 4)}-01-01`, lucia.id, `${month.slice(0, 4)}-01-01`),
    ...[
      ['is-small', 'invoice_in', 'TEST-ONLY Lieferant', 'DE123456789', 'acquisition', 50000, 23],
      ['is-big', 'invoice_in', 'TEST-ONLY Lieferant', 'DE123456789', 'acquisition', 250000, 23],
      ['is-out', 'invoice_out', 'TEST-ONLY Pelatis', 'EL123456789', 'eu_goods', 120000, 0],
    ].map(([id, kind, party, vatId, mode, base, rate]) =>
      db
        .prepare(
          `INSERT INTO documents (id, company_id, created_at, source, status, kind, party, number, issued_on, supplied_on, total_cents, vat_cents, currency, category, booked_at, booked_by, vat_mode, vat_lines, party_vat_id)
           VALUES (?, ?, ?, 'upload', 'read', ?, ?, ?, ?, ?, ?, 0, 'EUR', ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          id,
          company,
          nowS,
          kind,
          party,
          id.toUpperCase(),
          supplied,
          supplied,
          base,
          kind === 'invoice_out' ? 'sales_goods' : 'goods',
          nowS,
          lucia.id,
          mode,
          JSON.stringify([{ rate, base, vat: Math.round((base * rate) / 100), deduct: Math.round((base * rate) / 100) }]),
          vatId,
        ),
    ),
  ])
  const base = `/ucto/klienti/${company}/intrastat`
  let res = await acc.get(`${base}?mesiac=${month}&tok=A`)
  let page = plain(await res.text())
  check('before the settings a month is not reported, its goods shown for a look', res.status === 200 && page.includes('Nevykazuje sa') && page.includes('Prah oslobodenia'))
  check('the VAT page leads to Intrastat', (await (await acc.get(`/ucto/klienti/${company}/dph`)).text()).includes(base))

  res = await acc.post(`${base}/nastavenie`, { dovoz: '13/2026', vyvoz: '', druh: '11', doprava: '3', podmienky: 'DAP', region: '', povod: '', kontakt: '', telefon: '', email: '' })
  check('a month that is none is said at its field', res.status === 422 && plain(await res.text()).includes('Mesiac zapíšte ako 01/2027.'))
  res = await acc.post(`${base}/nastavenie`, {
    mesiac: month,
    tok: 'A',
    dovoz: mmyyyy,
    vyvoz: mmyyyy,
    druh: '11',
    doprava: '3',
    podmienky: 'DAP',
    region: '8',
    povod: 'SK',
    kontakt: 'Lucia Horváthová',
    telefon: '',
    email: '',
  })
  const kept = await db.prepare('SELECT intrastat FROM companies WHERE id = ?').bind(company).first()
  check(
    'the settings kept: both flows from the month, the region, the origin, the contact',
    res.status === 303 && JSON.parse(kept?.intrastat ?? '{}').arrivals === month && JSON.parse(kept.intrastat).region === '8' && JSON.parse(kept.intrastat).contact === 'Lucia Horváthová',
  )

  page = plain(await (await acc.get(`${base}?mesiac=${month}&tok=A`)).text())
  check(
    'arrivals: the invoice below 1 000 € simply, the one above waits for its goods',
    page.includes('Treba vyriešiť') && page.includes('zjednodušene') && page.includes('nemá zapísaný tovar') && page.includes(`${base}/doklad/is-big`),
  )
  res = await acc.get(`${base}.xml?mesiac=${month}&tok=A`)
  check('no file while something keeps it back', res.status === 303 && (res.headers.get('location') ?? '').includes('ok=notReady'))

  res = await acc.get(`${base}/doklad/is-big`)
  const formRaw = await res.text()
  if (capture) writeFileSync(`${capture}/intrastat-goods.html`, formRaw)
  const form = plain(formRaw)
  check("the document's goods: a form of lines, no simple way above 1 000 €", res.status === 200 && form.includes('Kód KN') && !form.includes('name="zjednodusene"'))
  res = await acc.post(`${base}/doklad/is-big`, { kn_0: '8471 30', kg_0: '12,5', povod_0: 'CN', hodnota_0: '', mj_0: '', mnozstvo_0: '', opis_0: '' })
  check('a code of fewer than eight digits is said at its field', res.status === 422 && plain(await res.text()).includes('Kód KN má osem číslic.'))
  res = await acc.post(`${base}/doklad/is-big`, {
    kn_0: '8471 30 00',
    kg_0: '12,5',
    povod_0: 'cn',
    hodnota_0: '',
    mj_0: 'p/st',
    mnozstvo_0: '5',
    opis_0: 'Notebooky',
    druh: '',
    doprava: '',
    podmienky: '',
    region: '',
    stat: '',
    mesiac: '',
  })
  const goods = await db.prepare("SELECT data FROM intrastat_goods WHERE company_id = ? AND document_id = 'is-big'").bind(company).first()
  const line = JSON.parse(goods?.data ?? '{}').lines?.[0]
  check(
    'the goods kept: the code without spaces, the mass in grams, the origin in capitals, the quantity in thousandths',
    res.status === 303 && line?.cn === '84713000' && line.grams === 12500 && line.origin === 'CN' && line.quantity === 5000,
    goods?.data,
  )
  check('a document that is no goods from or to the EU has no such form', (await acc.get(`${base}/doklad/oss-de`)).status === 404)

  const raw = await (await acc.get(`${base}?mesiac=${month}&tok=A`)).text()
  if (capture) writeFileSync(`${capture}/intrastat.html`, raw)
  page = plain(raw)
  check('ready: two items, 500 € and 2 500 €, the deadline', page.includes('Pripravené') && page.includes('2 500 €') && page.includes('Odoslať do'))
  res = await acc.get(`${base}.xml?mesiac=${month}&tok=A`)
  const bytes = new Uint8Array(await res.arrayBuffer())
  const xml = new TextDecoder('iso-8859-2').decode(bytes)
  let v = await valid(xml)
  check(
    'the file: ISO-8859-2, valid against instat62.xsd, the company as the reporting unit, both items',
    res.status === 200 &&
      (res.headers.get('content-type') ?? '').includes('iso-8859-2') &&
      v.ok &&
      xml.includes(`<envelopeId>AA${month.slice(5, 7)}101</envelopeId>`) &&
      xml.includes('<PSIId>SK2126444777</PSIId>') &&
      xml.includes('<CN8Code>99500000</CN8Code>') &&
      xml.includes('<invoicedAmount>2500</invoicedAmount>') &&
      xml.includes('<partyName>TEST-ONLY Dovoz Vývoz s. r. o.</partyName>') &&
      bytes.includes(0xfd),
    v.why,
  )
  const sig = /name="sig" value="([0-9a-f]{24})"/.exec(raw)?.[1] ?? ''
  res = await acc.post(`${base}/podane`, { mesiac: month, tok: 'A', datum: '', sig: '0'.repeat(24) })
  const none = await db.prepare('SELECT COUNT(*) AS n FROM intrastat_returns WHERE company_id = ?').bind(company).first()
  check('a mark of reports other than the page showed is refused, nothing marked', sig !== '' && (res.headers.get('location') ?? '').includes('ok=stale') && none?.n === 0)
  res = await acc.post(`${base}/podane`, { mesiac: month, tok: 'A', datum: '', sig })
  const filed = await db.prepare("SELECT seq, envelope, xml FROM intrastat_returns WHERE company_id = ? AND month = ? AND flow = 'A'").bind(company, month).first()
  check(
    'marked as sent with its reports and its file',
    res.status === 303 && filed?.seq === 1 && filed.envelope === Number(`${month.slice(5, 7)}101`) && filed.xml.includes('<functionCode>O</functionCode>'),
  )
  res = await acc.post(`${base}/podane`, { mesiac: month, tok: 'A', datum: '' })
  check('marked once', res.status === 303 && (res.headers.get('location') ?? '').includes('ok=already'))
  page = plain(await (await acc.get(`${base}?mesiac=${month}&tok=A`)).text())
  check('the month says it was sent, with its file', page.includes('Odoslané') && page.includes(`podanie=1`))
  const dues = plain(await (await acc.get('/ucto/terminy?hotove=1')).text())
  check('the deadlines list both flows of the month', dues.includes('Intrastat, dovoz za') && dues.includes('Intrastat, vývoz za') && dues.includes('TEST-ONLY Dovoz Vývoz s. r. o.'))

  await db.prepare('UPDATE documents SET vat_lines = \'[{"rate":23,"base":60000,"vat":13800,"deduct":13800}]\' WHERE id = \'is-small\'').run()
  page = plain(await (await acc.get(`${base}?mesiac=${month}&tok=A`)).text())
  check('a change after sending is said with what follows: a corrective report', page.includes('Odoslané, odvtedy zmenené') && page.includes('zmenená položka: opravné hlásenie'))
  const follow = new TextDecoder('iso-8859-2').decode(new Uint8Array(await (await acc.get(`${base}.xml?mesiac=${month}&tok=A`)).arrayBuffer()))
  v = await valid(follow)
  check(
    'the corrective report: valid, the item by its number with its right value',
    v.ok &&
      follow.includes('<functionCode>M</functionCode><previousDeclarationId>1</previousDeclarationId>') &&
      follow.includes('<invoicedAmount>600</invoicedAmount>') &&
      follow.includes(`<envelopeId>AA${month.slice(5, 7)}102</envelopeId>`),
    v.why,
  )

  page = plain(await (await acc.get(`${base}?mesiac=${month}&tok=D`)).text())
  check('dispatches above 1 000 € wait for their goods too', page.includes('nemá zapísaný tovar') && page.includes(`${base}/doklad/is-out`))
  res = await acc.post(`${base}/doklad/is-out`, {
    kn_0: '40082110',
    kg_0: '80',
    povod_0: '',
    hodnota_0: '',
    mj_0: '',
    mnozstvo_0: '',
    opis_0: 'Rohože',
    druh: '',
    doprava: '',
    podmienky: 'EXW',
    region: '',
    stat: '',
    partner: '',
    mesiac: '',
  })
  check('the dispatched goods kept', res.status === 303)
  page = plain(await (await acc.get(`${base}?mesiac=${month}&tok=D`)).text())
  const dx = new TextDecoder('iso-8859-2').decode(new Uint8Array(await (await acc.get(`${base}.xml?mesiac=${month}&tok=D`)).arrayBuffer()))
  v = await valid(dx)
  check(
    'dispatches: Greece as GR, the partner, the origin from the settings, the region',
    page.includes('Pripravené') &&
      v.ok &&
      dx.includes('<MSConsDestCode>GR</MSConsDestCode>') &&
      dx.includes('<partnerId>EL123456789</partnerId>') &&
      dx.includes('<flowCode>D</flowCode>') &&
      dx.includes('<countryOfOriginCode>SK</countryOfOriginCode>') &&
      dx.includes('<regionCode>8</regionCode>') &&
      dx.includes('<TODCode>EXW</TODCode>'),
    v.why,
  )

  res = await acc.post(`${base}/zrusit`, { mesiac: month, tok: 'A' })
  check('the last mark taken back', res.status === 303 && (await db.prepare("SELECT COUNT(*) AS n FROM intrastat_returns WHERE company_id = ? AND flow = 'A'").bind(company).first())?.n === 0)
}
