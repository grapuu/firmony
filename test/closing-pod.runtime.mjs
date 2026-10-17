// The closing of a large company (17 October 2026), in workerd through the accountant's pages: the size group the books
// propose from the two years before, the statements on Úč POD with each asset's gross, correction and net, an account
// placed in a row of the accountant's own, the audit said, and the file of UZPODv14 saved with the podklady, valid
// against the Financial Administration's schema.
import { check } from './check.mjs'
import { readFileSync, writeFileSync } from 'node:fs'
import { validateXML } from 'xmllint-wasm'

export async function checkClosingPod({ db, acc, lucia, nowS, day, unzip, capture }) {
  const plain = (text) => text.replace(/ /g, ' ')
  const validXml = async (xml, schema) => {
    const result = await validateXML({ xml: [{ fileName: 'x.xml', contents: xml }], schema: [{ fileName: schema, contents: readFileSync(new URL(`./xsd/${schema}`, import.meta.url), 'utf8') }] })
    return { ok: result.valid, why: result.errors.map((e) => e.message).join(' | ') }
  }
  const company = 'co-velka'
  const Y = Number(day(0).slice(0, 4)) - 1
  const base = `/ucto/klienti/${company}/zavierka`
  let seq = 0
  const entry = (on, md, d, cents) =>
    db
      .prepare("INSERT INTO ledger_entries (id, company_id, kind, year, seq, number, on_date, text, lines, created_at, created_by) VALUES (?, ?, 'internal', ?, ?, ?, ?, 'TEST-ONLY', ?, ?, ?)")
      .bind(`v-e${++seq}`, company, Number(on.slice(0, 4)), seq, `ID-${on.slice(0, 4)}-8${String(seq).padStart(2, '0')}`, on, JSON.stringify([{ md, d, cents }]), nowS, lucia.id)
  const M = (euros) => euros * 100
  // Two years of a large company (machinery of 6 000 000 € put in as capital, turnover above 10 000 000 € each year), then a quieter one.
  await db.batch([
    db
      .prepare(
        "INSERT INTO companies (id, created_at, name, ico, dic, address, register_line, vat_payer, plan, inbox, accountant_id, start_on) VALUES (?, ?, 'TEST-ONLY Veľká a. s.', '50888885', '2120888885', 'Hlavná 20, 040 01 Košice', 'Obchodný register Okresného súdu Košice I, oddiel Sa, vložka č. 8888/V', 0, 'firma', 'velka01', ?, ?)",
      )
      .bind(company, nowS, lucia.id, `${Y - 2}-01-01`),
    entry(`${Y - 2}-01-02`, '022', '411', M(6_000_000)),
    entry(`${Y - 2}-06-01`, '311', '602', M(12_000_000)),
    entry(`${Y - 2}-06-20`, '221.001', '311', M(12_000_000)),
    entry(`${Y - 2}-07-01`, '518', '221.001', M(10_000_000)),
    entry(`${Y - 1}-06-01`, '311', '602', M(11_000_000)),
    entry(`${Y - 1}-06-20`, '221.001', '311', M(11_000_000)),
    entry(`${Y - 1}-07-01`, '518', '221.001', M(10_500_000)),
    entry(`${Y}-03-01`, '311.002', '602', M(200_000)),
    entry(`${Y}-04-01`, '311', '602', M(500_000)),
    entry(`${Y}-04-20`, '221.001', '311', M(500_000)),
    entry(`${Y}-12-31`, '551', '082', M(1_000_000)),
  ])

  let res = await acc.get(`${base}?rok=${Y}`)
  let page = plain(await res.text())
  check(
    'two large years before: the books propose a large entity, and the statements are on Úč POD',
    res.status === 200 && page.includes('<option value="large" selected="">Veľká účtovná jednotka</option>') && page.includes('podľa oboch predchádzajúcich rokov') && page.includes('Úč POD 1-01') && page.includes('Súvaha: aktíva') && page.includes('Brutto'),
  )
  check(
    'the machinery with its gross amount, its depreciation and its net, the year before\'s net beside',
    page.includes('Samostatné hnuteľné veci a súbory hnuteľných vecí') && page.includes('<td class="num">6 000 000</td><td class="num">1 000 000</td><td class="num">5 000 000</td><td class="num">6 000 000</td>'),
  )
  check('this year alone meets one condition of the audit: none is said', !page.includes('povinného auditu'))
  res = await acc.get(`${base}?rok=${Y - 1}`)
  page = plain(await res.text())
  check(
    'the year before: its own first year kept the group it chose (micro proposed), and it met the audit with the year before it',
    page.includes('<option value="micro" selected="">Mikro účtovná jednotka</option>') && page.includes('Úč MUJ 1-01') && page.includes('Firma spĺňa podmienky povinného auditu') && page.includes(`31. 12. ${Y}`),
  )

  // The size group confirmed, the employees typed, a receivable due after a year placed among the long-term ones.
  const form = { rok: String(Y), velkost: 'large', zamestnanci: '60', ucet_0: '311.002', riadok_0: '45', nace: '70.10.0', cinnost: 'Vedenie firiem', zdanitelne: '700000', odlozena: '1', od_zdanitelne: '50000', od_odpocitatelne: '10000', poz_udalosti: 'TEST-ONLY udalosť po skončení roka' }
  res = await acc.post(base, { ...form, riadok_0: '41' })
  page = plain(await res.text())
  check('a sum row is no row to place an account in: said, nothing kept', res.status === 422 && page.includes('nie súčtový') && !(await db.prepare('SELECT 1 AS x FROM closings WHERE company_id = ?').bind(company).first()))
  res = await acc.post(base, form)
  const inputs = JSON.parse((await db.prepare('SELECT inputs FROM closings WHERE company_id = ? AND year = ?').bind(company, Y).first())?.inputs ?? '{}')
  check(
    "kept: the employees and the placement; the group equal to the books' proposal follows them",
    res.status === 303 && inputs.size === null && inputs.employees === 60 && JSON.stringify(inputs.placements) === JSON.stringify([{ account: '311.002', row: 'r045' }]) && inputs.deferredTaxable === 5_000_000 && inputs.deferredDeductible === 1_000_000,
    JSON.stringify(inputs),
  )
  res = await acc.get(`${base}?rok=${Y}`)
  const raw = await res.text()
  if (capture) writeFileSync(`${capture}/closing-pod.html`, raw)
  page = plain(raw)
  check(
    'the receivable among the long-term ones (row 045), the status card says the group',
    page.includes('<td class="ltable__acct">045</td><td class="ltable__name">Ostatné pohľadávky z obchodného styku</td><td class="num">200 000</td>') && page.includes('<dt>Veľkostná skupina</dt><dd>Veľká účtovná jednotka</dd>'),
  )

  check(
    'deferred tax at 21 %: an asset of 2 100 € and a liability of 10 500 €, to be booked with the tax',
    page.includes('Odložená daňová pohľadávka (riadok 052)</td><td class="vrows__amount">2 100,00 €') && page.includes('Odložený daňový záväzok (riadok 117)</td><td class="vrows__amount">10 500,00 €') && page.includes('a odložená daň 8 400,00 € na 592 a 481'),
  )
  check('the page offers the notes with what to check in them', page.includes('Stiahnuť poznámky (PDF)') && page.includes('členom orgánov neboli poskytnuté pôžičky') && !page.includes('po skončení roka nenastali významné udalosti; inak'))
  res = await acc.get(`${base}/poznamky.pdf?rok=${Y}`)
  const draft = await res.text()
  if (capture) writeFileSync(`${capture}/notes.pdf`, draft)
  check(
    "the notes' draft as a PDF: a large entity's, Úč POD 3-01 with IČO and DIČ, the tables and her events",
    res.status === 200 && res.headers.get('content-type') === 'application/pdf' && (res.headers.get('content-disposition') ?? '').includes(`Poznamky_50888885_${Y}.pdf`) && draft.startsWith('%PDF-1.4') && draft.includes('(Pozn\\341mky \\332\\201 POD 3-01)') && draft.includes('(I\\215O 50888885   DI\\215 2120888885)') && draft.includes('\\215l. VIII') && draft.includes('TEST-ONLY udalos\\252 po skon\\201en\\355 roka'),
    draft.slice(0, 200),
  )
  // The tax booked, the podklady saved: the files are the return and the statements of a large entity.
  res = await acc.post(`${base}/dan`, { rok: String(Y) })
  const taxLines = JSON.parse((await db.prepare("SELECT lines FROM ledger_entries WHERE company_id = ? AND text LIKE 'Daň z príjmov%' AND deleted_at IS NULL").bind(company).first())?.lines ?? '[]')
  check(
    'the tax booked with deferred tax in one internal document: 591/341, 481.100/592, 592/481.200',
    res.status === 303 && taxLines.length === 3 && taxLines[1].md === '481.100' && taxLines[1].cents === 210_000 && taxLines[2].d === '481.200' && taxLines[2].cents === 1_050_000,
    JSON.stringify(taxLines),
  )
  res = await acc.post(`${base}/podane`, { rok: String(Y) })
  check('the podklady saved', res.status === 303 && res.headers.get('location') === `/ucto/klienti/${company}/podania?obdobie=${Y}`, res.headers.get('location'))
  const filed = JSON.parse((await db.prepare('SELECT filed FROM closings WHERE company_id = ? AND year = ?').bind(company, Y).first())?.filed ?? '{}')
  check('what was filed keeps Úč POD\'s gross amounts too', filed.gross?.r014 === 6_000_000 && filed.balance?.r014 === 5_000_000)
  res = await acc.get(`${base}/zavierka.xml?rok=${Y}`)
  const xml = await res.text()
  const v = await validXml(xml, 'uzpod2014.xsd')
  check(
    'the statements as a file of UZPODv14, valid against its schema, named for it, a large entity',
    res.status === 200 && v.ok && (res.headers.get('content-disposition') ?? '').includes(`UZPOD_50888885_${Y}.xml`) && xml.includes('<mala>0</mala><velka>1</velka>'),
    v.why || xml.slice(0, 400),
  )
  check(
    'with the machinery gross, corrected and net, the year before, the receivable in row 045 and the result',
    xml.includes('<r014><s1>6000000</s1><s2>1000000</s2><s3>5000000</s3><s4>6000000</s4></r014>') && xml.includes('<r045><s1>200000</s1><s2>0</s2><s3>200000</s3>') && xml.includes('<r01><s1>700000</s1><s2>11000000</s2></r01>') &&
      xml.includes('<r052><s1>2100</s1><s2>0</s2><s3>2100</s3>') && xml.includes('<r117><s5>10500</s5>') && xml.includes('<r59><s1>8400</s1>'),
    xml.slice(xml.indexOf('<telo>'), xml.indexOf('<telo>') + 600),
  )
  res = await acc.get(`${base}/poznamky.pdf?rok=${Y}`)
  check('after the podklady are saved, the notes are the ones saved with them', res.status === 200 && (await res.text()) === filed.files?.notes?.text && filed.files.notes.name === `Poznamky_50888885_${Y}.pdf`)
  res = await acc.get('/ucto/podania/balik.zip')
  const zip = res.status === 200 ? unzip(new Uint8Array(await res.arrayBuffer())) : null
  const notesFile = zip?.find((f) => f.name.includes('(ICO 50888885)/') && f.name.endsWith(`${Y} Poznamky k zavierke.pdf`))
  const overview = new TextDecoder().decode(zip?.find((f) => f.name === 'PREHLAD.txt')?.data ?? new Uint8Array())
  check(
    'the filing bundle holds the notes beside the statements, as saved, said in the overview',
    Boolean(notesFile?.ok) && new TextDecoder().decode(notesFile.data) === filed.files.notes.text && zip.some((f) => f.name.includes('(ICO 50888885)/') && f.name.endsWith('.xml')) && overview.includes('poznámky k účtovnej závierke'),
    zip?.map((f) => f.name).join(' | '),
  )
  res = await acc.get(`${base}/priznanie.xml?rok=${Y}`)
  const dppo = await res.text()
  check('and the tax return beside it, valid against DPPOv25', res.status === 200 && (await validXml(dppo, 'dppo2025.xsd')).ok && dppo.includes('<mikrodanovnikPar2w>0</mikrodanovnikPar2w>'))
}
