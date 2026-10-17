// OSS and Intrastat in the filing bundle (18 October 2026), in workerd: a company's ready OSS return and another's
// ready Intrastat report go into the one ZIP (the Intrastat file valid against instat62.xsd), a tick in the same form
// marks each as sent as its own page does, a report that changed after the download is not marked until downloaded
// again, and a key of a company that is not hers is never touched.
import { check } from './check.mjs'
import { readFileSync, writeFileSync } from 'node:fs'
import { validateXML } from 'xmllint-wasm'

const xsd = readFileSync(new URL('./xsd/instat62.xsd', import.meta.url), 'latin1').replace('encoding = "ISO-8859-2"', 'encoding = "UTF-8"')

export async function checkBundleExtras({ db, acc, lucia, nowS, day, unzip, capture }) {
  const plain = (text) => text.replace(/[\u00a0\u202f]/g, ' ')
  const today = day(0)
  const [ty, tm] = today.split('-').map(Number)
  const month = tm === 1 ? `${ty - 1}-12` : `${ty}-${String(tm - 1).padStart(2, '0')}`
  const quarterOf = (d) => `${d.slice(0, 4)}-Q${Math.ceil(Number(d.slice(5, 7)) / 3)}`
  const current = quarterOf(today)
  const quarter = current.endsWith('Q1') ? `${Number(current.slice(0, 4)) - 1}-Q4` : `${current.slice(0, 6)}${Number(current.slice(6)) - 1}`
  const qStart = `${quarter.slice(0, 4)}-${String(Number(quarter.slice(6)) * 3 - 2).padStart(2, '0')}-01`
  const oss = 'co-bx-oss'
  const ist = 'co-bx-ist'
  const settings = JSON.stringify({ arrivals: month, dispatches: null, nature: '11', transport: '3', terms: 'DAP', contact: 'Lucia Horváthová' })
  const acquisition = (id, base) =>
    db
      .prepare(
        `INSERT INTO documents (id, company_id, created_at, source, status, kind, party, number, issued_on, supplied_on, total_cents, vat_cents, currency, category, booked_at, booked_by, vat_mode, vat_lines, party_vat_id)
         VALUES (?, ?, ?, 'upload', 'read', 'invoice_in', 'TEST-ONLY Lieferant', ?, ?, ?, ?, 0, 'EUR', 'goods', ?, ?, 'acquisition', ?, 'DE123456789')`,
      )
      .bind(id, ist, nowS, id.toUpperCase(), `${month}-05`, `${month}-05`, base, nowS, lucia.id, JSON.stringify([{ rate: 23, base, vat: Math.round(base * 0.23), deduct: Math.round(base * 0.23) }]))
  await db.batch([
    db
      .prepare(
        "INSERT INTO companies (id, created_at, name, ico, dic, icdph, vat_payer, vat_since, oss_since, plan, inbox, accountant_id, start_on, address) VALUES (?, ?, 'TEST-ONLY Balík OSS s. r. o.', '65551111', '2126555111', 'SK2126555111', 1, ?, ?, 'firma', 'bxo00001', ?, ?, 'Hlavná 2, 040 01 Košice')",
      )
      .bind(oss, nowS, qStart, qStart, lucia.id, qStart),
    db
      .prepare(
        "INSERT INTO documents (id, company_id, created_at, source, status, kind, party, number, issued_on, supplied_on, total_cents, vat_cents, currency, category, booked_at, booked_by, vat_mode, vat_lines, vat_country) VALUES ('bx-oss-de', ?, ?, 'upload', 'read', 'invoice_out', 'TEST-ONLY Kunde', 'E-1', ?, ?, 11900, 1900, 'EUR', 'sales_goods', ?, ?, 'oss', '[{\"rate\":19,\"base\":10000,\"vat\":1900,\"deduct\":0}]', 'DE')",
      )
      .bind(oss, nowS, qStart.replace(/-01$/, '-10'), qStart.replace(/-01$/, '-10'), nowS, lucia.id),
    db
      .prepare(
        "INSERT INTO companies (id, created_at, name, ico, dic, icdph, vat_payer, vat_since, plan, inbox, accountant_id, start_on, address, intrastat) VALUES (?, ?, 'TEST-ONLY Balík Intrastat s. r. o.', '65552222', '2126555222', 'SK2126555222', 1, ?, 'firma', 'bxi00001', ?, ?, 'Hlavná 3, 040 01 Košice', ?)",
      )
      .bind(ist, nowS, `${month.slice(0, 4)}-01-01`, lucia.id, `${month.slice(0, 4)}-01-01`, settings),
    acquisition('bx-is-1', 50000),
  ])
  const ossKey = `o:${oss}:${quarter}`
  const istKey = `i:${ist}:${month}:A`
  const sigOf = (page, key) => new RegExp(`name="sig:${key}" value="([0-9a-f]{24})"`).exec(page)?.[1] ?? ''

  const raw = await (await acc.get('/ucto/podania')).text()
  if (capture) writeFileSync(`${capture}/podania-extras.html`, raw)
  let page = plain(raw)
  const ossSig = sigOf(page, ossKey)
  const istSig = sigOf(page, istKey)
  check(
    "the bundle lists her companies' ready OSS return and Intrastat report, each with a tick and the fingerprint of what goes",
    page.includes('Na odoslanie · OSS a Intrastat') &&
      page.includes(`value="${ossKey}"`) &&
      page.includes(`value="${istKey}"`) &&
      ossSig !== '' &&
      istSig !== '' &&
      page.includes('intrastat.financnasprava.sk'),
  )

  let res = await acc.get('/ucto/podania/balik.zip')
  const zip = res.status === 200 ? unzip(new Uint8Array(await res.arrayBuffer())) : null
  const ossFile = zip?.find((f) => f.name === `OSS/TEST-ONLY Balik OSS s. r. o. (ICO 65551111)/${quarter} Priznanie OSS.xml`)
  const istFile = zip?.find((f) => f.name === `Intrastat/TEST-ONLY Balik Intrastat s. r. o. (ICO 65552222)/${month} Intrastat dovoz.xml`)
  const istText = new TextDecoder('iso-8859-2').decode(istFile?.data ?? new Uint8Array())
  const overview = new TextDecoder().decode(zip?.find((f) => f.name === 'PREHLAD.txt')?.data ?? new Uint8Array())
  const result = istText
    ? await validateXML({ xml: [{ fileName: 'i.xml', contents: istText.replace('encoding="ISO-8859-2"', 'encoding="UTF-8"') }], schema: [{ fileName: 'instat62.xsd', contents: xsd }] })
    : null
  check(
    'the ZIP holds the OSS return and the Intrastat report (ISO-8859-2, valid against instat62.xsd), with what to do with each in the overview',
    res.status === 200 &&
      new TextDecoder().decode(ossFile?.data ?? new Uint8Array()).includes('<VATNumber issuedBy="SK">2126555111</VATNumber>') &&
      istText.startsWith('<?xml version="1.0" encoding="ISO-8859-2"?>') &&
      istText.includes('<CN8Code>99500000</CN8Code>') &&
      result?.valid === true &&
      overview.includes('portál OSS (One Stop Shop)') &&
      overview.includes('odoslať: intrastat.financnasprava.sk') &&
      overview.includes('len zaškrtnite ako odoslané'),
    `${zip?.map((f) => f.name).join(' | ')} ${result?.errors.map((e) => e.message).join(' | ')}`,
  )

  // Another invoice of the month after the download: the report downloaded is not the one that would be kept now.
  await acquisition('bx-is-2', 30000).run()
  res = await acc.form('/ucto/podania/naraz', [
    ['externalOn', today],
    ['extra', ossKey],
    [`sig:${ossKey}`, ossSig],
    [`sent:${ossKey}`, '1'],
    ['extra', istKey],
    [`sig:${istKey}`, istSig],
    [`sent:${istKey}`, '1'],
    ['extra', 'o:co-oss-cudzia:2026-Q1'],
    ['sig:o:co-oss-cudzia:2026-Q1', ossSig],
    ['sent:o:co-oss-cudzia:2026-Q1', '1'],
  ])
  page = plain(await res.text())
  const ossFiled = await db.prepare('SELECT filed_by FROM oss_returns WHERE company_id = ? AND quarter = ?').bind(oss, quarter).first()
  const told = await db.prepare("SELECT body FROM messages WHERE company_id = ? AND side = 'firmony'").bind(oss).first()
  const istFiled = await db.prepare('SELECT COUNT(*) AS n FROM intrastat_returns WHERE company_id = ?').bind(ist).first()
  check(
    'a tick marks the OSS return as its page does (the client told what to pay); the report changed since the download waits, said at its row, its tick kept',
    res.status === 409 &&
      ossFiled?.filed_by === lucia.id &&
      plain(told?.body ?? '').includes('Daň 19,00 €') &&
      istFiled?.n === 0 &&
      page.includes('Od stiahnutia balíka sa doklady zmenili') &&
      page.includes(`name="sent:${istKey}" value="1" checked`) &&
      page.includes('Zaevidované: 1.'),
  )
  check('a key of a company that is not hers is never touched', (await db.prepare("SELECT COUNT(*) AS n FROM oss_returns WHERE company_id = 'co-oss-cudzia'").first())?.n === 0)

  const fresh = sigOf(page, istKey)
  res = await acc.form('/ucto/podania/naraz', [
    ['externalOn', today],
    ['extra', istKey],
    [`sig:${istKey}`, fresh],
    [`sent:${istKey}`, '1'],
  ])
  const kept = await db.prepare('SELECT seq, filed_by, xml FROM intrastat_returns WHERE company_id = ? AND month = ? AND flow = ?').bind(ist, month, 'A').first()
  page = plain(await (await acc.get('/ucto/podania')).text())
  check(
    'downloaded again and ticked: the report kept with both invoices; neither waits in the bundle any more',
    res.status === 303 &&
      res.headers.get('location') === '/ucto/podania?zaevidovane=1' &&
      fresh !== istSig &&
      kept?.seq === 1 &&
      kept?.filed_by === lucia.id &&
      (String(kept?.xml).match(/<CN8Code>99500000<\/CN8Code>/g) ?? []).length === 2 &&
      !page.includes(`value="${ossKey}"`) &&
      !page.includes(`value="${istKey}"`),
  )
}
