// Filing in one go (17 October 2026): everything to send in one ZIP sorted by office, and one form for the numbers
// and receipts afterwards. Each row is recorded as on its own page; an empty row changes nothing, a foreign row is
// never touched, a receipt counts only once she ticked that it matches. In workerd, through the accountant's pages.
import { check } from './check.mjs'
import { writeFileSync } from 'node:fs'
import { filingFile, prepareFiling, packageOf } from '../.wrangler/dist/stores.js'

export async function checkBundle({ db, acc, lucia, nowS, day, unzip, capture }) {
  const mine = 'co-balik', foreign = 'co-balik-cudzia', period = day(-20).slice(0, 7), today = day(0)
  // Another member of the team keeps the foreign company: an administrator's, never hers.
  const keeper = (await db.prepare("SELECT id FROM users WHERE team = 'admin' AND id <> ? LIMIT 1").bind(lucia.id).first())?.id
  await db.batch([
    db.prepare("INSERT INTO companies (id, created_at, name, ico, dic, icdph, vat_payer, plan, inbox, accountant_id, start_on) VALUES (?, ?, 'Aaa Balík s. r. o.', '63335555', '2126333555', 'SK2126333555', 1, 'rast', 'balik001', ?, ?)").bind(mine, nowS, lucia.id, `${today.slice(0, 4)}-01-01`),
    db.prepare("INSERT INTO companies (id, created_at, name, ico, dic, icdph, vat_payer, plan, inbox, accountant_id, start_on) VALUES (?, ?, 'Aaa Cudzia s. r. o.', '63336666', '2126333666', 'SK2126333666', 1, 'rast', 'balik002', ?, ?)").bind(foreign, nowS, keeper, `${today.slice(0, 4)}-01-01`),
  ])
  const make = async (company, ico, by) => {
    const vat = await filingFile('TEST-ONLY-DPH.xml', `<TEST_ONLY form="vat" company="${ico}" />`)
    const kv = await filingFile('TEST-ONLY-KV.xml', `<TEST_ONLY form="kv" company="${ico}" />`)
    await db.batch([
      db.prepare(`INSERT INTO vat_returns (company_id, period, filed_at, filed_on, filed_by, rows, kv_rows, pay_cents, refund_cents, due_on, kind, fast, carried, kv, delivery)
        VALUES (?, ?, ?, ?, ?, '{}', 0, 0, 0, ?, 'R', 0, 0, ?, ?)`)
        .bind(company, period, nowS, today, by, today, JSON.stringify({ kind: 'R', full: {}, sent: {} }), JSON.stringify({ vat: vat.attemptId, kv: kv.attemptId })),
      prepareFiling(db, company, 'vat', period, vat, by),
      prepareFiling(db, company, 'kv', period, kv, by),
    ])
    return { vat, kv }
  }
  const own = await make(mine, '63335555', lucia.id)
  const other = await make(foreign, '63336666', keeper)
  const state = async (company, file) => (await packageOf(db, company, file.attemptId))?.status

  let res = await acc.get('/ucto/podania'), page = (await res.text()).replace(/ /g, ' ')
  if (capture) writeFileSync(`${capture}/podania-balik.html`, page)
  check(
    'the queue opens with one package to send: the ZIP, the portals and one form, her companies only',
    res.status === 200 && page.includes('Podanie jedným balíkom') && page.includes('href="/ucto/podania/balik.zip"') && page.includes('action="/ucto/podania/naraz"') &&
      page.includes(`value="f-${own.vat.attemptId}"`) && page.includes(`value="f-${own.kv.attemptId}"`) && !page.includes(other.vat.attemptId),
  )

  res = await acc.get('/ucto/podania/balik.zip')
  const zip = res.status === 200 ? unzip(new Uint8Array(await res.arrayBuffer())) : null
  const ours = zip?.filter((f) => f.name.startsWith('Financna sprava/Aaa Balik s. r. o. (ICO 63335555)/')) ?? []
  const overview = new TextDecoder().decode(zip?.find((f) => f.name === 'PREHLAD.txt')?.data ?? new Uint8Array())
  check(
    'the ZIP holds each document as saved, in a folder of its office and company, with an overview of what goes where',
    res.status === 200 && (res.headers.get('content-disposition') ?? '').includes('firmony-na-podanie-') && res.headers.get('cache-control') === 'private, no-store' &&
      Boolean(zip?.every((f) => f.ok)) && ours.length === 2 &&
      ours.some((f) => new TextDecoder().decode(f.data) === `<TEST_ONLY form="vat" company="63335555" />` && f.name.endsWith(`${period} Priznanie k DPH.xml`)) &&
      overview.includes('Aaa Balík s. r. o., IČO 63335555 · Kontrolný výkaz DPH') && overview.includes('podať: Finančná správa') && !zip?.some((f) => f.name.includes('Cudzia')),
    zip?.map((f) => f.name).join(' | '),
  )

  const vatKey = `f-${own.vat.attemptId}`, kvKey = `f-${own.kv.attemptId}`, foreignKey = `f-${other.vat.attemptId}`
  const receipt = (ref) => ({ name: 'TEST-ONLY-potvrdenka.xml', type: 'application/xml', bytes: new TextEncoder().encode(`<?xml version="1.0"?><TEST_ONLY company="63335555" reference="${ref}" result="accepted"/>`) })
  // The VAT return gets its number; the control statement a receipt that was not ticked; a foreign row is slipped in.
  res = await acc.form('/ucto/podania/naraz', [
    ['externalOn', today],
    ['row', vatKey], [`ref:${vatKey}`, 'TEST-BALIK-DPH-1'],
    ['row', kvKey], [`ref:${kvKey}`, 'TEST-BALIK-KV-1'], [`receipt:${kvKey}`, receipt('TEST-BALIK-KV-1')],
    ['row', foreignKey], [`ref:${foreignKey}`, 'TEST-CUDZIE-1'],
  ])
  page = (await res.text()).replace(/ /g, ' ')
  check(
    'one form records the number it was given, holds back a receipt not ticked and says why, and keeps what was typed',
    res.status === 409 && (await state(mine, own.vat)) === 'submitted' && (await state(mine, own.kv)) === 'prepared' &&
      page.includes('Potvrďte, že potvrdenka zodpovedá firme') && page.includes('value="TEST-BALIK-KV-1"') && page.includes('Zaevidované: 1.'),
  )
  check('a row of a company that is not hers is never touched', (await state(foreign, other.vat)) === 'prepared')

  // Once she has the receipts: the sent return needs only its receipt; the statement goes straight to accepted.
  res = await acc.form('/ucto/podania/naraz', [
    ['externalOn', today],
    ['row', vatKey], [`receipt:${vatKey}`, receipt('TEST-BALIK-DPH-1')], [`ok:${vatKey}`, '1'],
    ['row', kvKey], [`ref:${kvKey}`, 'TEST-BALIK-KV-1'], [`receipt:${kvKey}`, receipt('TEST-BALIK-KV-1')], [`ok:${kvKey}`, '1'],
  ])
  const vatEvent = await db.prepare('SELECT reference, channel, file_key FROM filing_events WHERE package_id = ? ORDER BY revision DESC LIMIT 1').bind(own.vat.attemptId).first()
  check(
    'checked receipts finish both, the sent one under the number it was sent with, through the portal it went to',
    res.status === 303 && res.headers.get('location') === '/ucto/podania?zaevidovane=2' && (await state(mine, own.vat)) === 'accepted' && (await state(mine, own.kv)) === 'accepted' &&
      vatEvent?.reference === 'TEST-BALIK-DPH-1' && vatEvent?.channel === 'Osobná internetová zóna finančnej správy' && String(vatEvent?.file_key ?? '').startsWith(`companies/${mine}/filings/`),
    JSON.stringify(vatEvent),
  )
  page = (await (await acc.get('/ucto/podania?zaevidovane=2')).text()).replace(/ /g, ' ')
  check('the queue says what was recorded, and her finished documents leave the package', page.includes('Zaevidované: 2.') && !page.includes(own.vat.attemptId) && !page.includes(own.kv.attemptId))
}
