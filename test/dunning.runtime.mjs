// Reminders and late interest (18 October 2026), in workerd: an invoice to a business forty days overdue shows its
// late interest; issued in one click as an invoice of the interest and the flat 40 € outside VAT (once); an owner turns
// the reminders on, and the schedule sends the reminder, the second and the third on their days, five days apart.
import { check } from './check.mjs'
import { writeFileSync } from 'node:fs'

export async function checkDunning({ db, nowS, signIn, as, day, tick, capture }) {
  const company = 'co-dunning'
  const plain = (text) => text.replace(/[  ]/g, ' ')
  const sk = (d) => `${Number(d.slice(8))}. ${Number(d.slice(5, 7))}. ${d.slice(0, 4)}`
  const idOf = (res) => res.headers.get('location')?.match(/\/app\/faktury\/([0-9a-f-]{36})/)?.[1] ?? ''
  await db.batch([
    db
      .prepare(
        "INSERT INTO companies (id, created_at, name, ico, dic, icdph, address, vat_payer, vat_since, plan, inbox, start_on) VALUES (?, ?, 'TEST-ONLY Upomienky s. r. o.', '50777850', '2120777850', 'SK2120777850', 'Hlavná 17, 811 01 Bratislava', 1, '2026-01-01', 'firma', 'upom0001', '2026-01-01')",
      )
      .bind(company, nowS),
    db
      .prepare("INSERT INTO users (id, created_at, email, name) VALUES ('u-dunning', ?, 'dunning@example.sk', 'TEST-ONLY Vymáhačka'), ('u-dunning-2', ?, 'dunning2@example.sk', 'TEST-ONLY Kolega')")
      .bind(nowS, nowS),
    db.prepare("INSERT INTO members (company_id, user_id, role, created_at) VALUES (?, 'u-dunning', 'owner', ?), (?, 'u-dunning-2', 'member', ?)").bind(company, nowS, company, nowS),
    db.prepare("INSERT INTO accounts (id, company_id, iban) VALUES ('acc-dunning', ?, 'SK3112000000198742637541')").bind(company),
  ])
  const owner = as((await signIn('dunning@example.sk')).cookie)
  const colleague = as((await signIn('dunning2@example.sk')).cookie)
  let res = await owner.post('/app/faktury', {
    akcia: 'vystavit',
    ico: '50123456',
    meno: 'TEST-ONLY Neplatič s. r. o.',
    adresa: 'Dlhá 1, 040 01 Košice',
    icdph: 'SK2120000000',
    email: 'neplatic@example.sk',
    vystavena: sk(day(-60)),
    dodana: sk(day(-60)),
    splatna: sk(day(-40)),
    iban: 'SK31 1200 0000 1987 4263 7541',
    riadky: '1',
    'r0-popis': 'Služba',
    'r0-mnozstvo': '1',
    'r0-jednotka': 'ks',
    'r0-cena': '1000,00',
    'r0-dph': '23',
  })
  const invoiceId = idOf(res)
  await owner.post(`/app/faktury/${invoiceId}/poslat`, {})
  const number = (await db.prepare('SELECT number FROM invoices WHERE id = ?').bind(invoiceId).first())?.number
  const raw = await (await owner.get(`/app/faktury/${invoiceId}`)).text()
  if (capture) writeFileSync(`${capture}/invoice-late.html`, raw)
  let page = plain(raw)
  check(
    'an invoice forty days overdue shows its late interest, the rate and the flat compensation',
    page.includes('Úrok z omeškania za 40 dní') &&
      page.includes('plus 8 percentuálnych bodov') &&
      page.includes('paušálna náhrada nákladov 40 €') &&
      page.includes(`action="/app/faktury/${invoiceId}/urok"`),
  )
  res = await owner.post(`/app/faktury/${invoiceId}/urok`, {})
  const interestId = idOf(res)
  const interest = await db.prepare('SELECT number, total_cents, vat_cents, vat_mode, interest_of, document_id, note FROM invoices WHERE id = ?').bind(interestId).first()
  const lines = (await db.prepare('SELECT description, base_cents, vat_rate FROM invoice_lines WHERE invoice_id = ? ORDER BY position').bind(interestId).all()).results
  const doc = await db
    .prepare('SELECT category, total_cents FROM documents WHERE id = ?')
    .bind(interest?.document_id ?? '')
    .first()
  check(
    'issued in one click: the interest and 40 €, outside VAT, owed on 644, linked to the invoice paid late',
    res.status === 303 &&
      interest?.interest_of === invoiceId &&
      interest.vat_mode === 'outside' &&
      interest.vat_cents === 0 &&
      lines.length === 2 &&
      plain(lines[0].description).startsWith(`Úrok z omeškania z faktúry ${number}`) &&
      lines[0].base_cents > 0 &&
      lines[1].base_cents === 4000 &&
      interest.total_cents === lines[0].base_cents + 4000 &&
      doc?.category === 'interest' &&
      doc.total_cents === interest.total_cents,
    JSON.stringify([interest, lines, doc]),
  )
  const sheet = plain(await (await owner.get(`/app/faktury/${interestId}`)).text())
  const xml = await (await owner.get(`/app/faktury/${interestId}/xml`)).text()
  check(
    'its sheet and e-invoice say why there is no VAT',
    sheet.includes('nie sú predmetom dane z pridanej hodnoty') && xml.includes('<cbc:ID>O</cbc:ID>') && xml.includes('nie sú predmetom dane z pridanej hodnoty'),
  )
  res = await owner.post(`/app/faktury/${invoiceId}/urok`, {})
  check(
    'asked again, the one there is',
    res.status === 303 &&
      (res.headers.get('location') ?? '').endsWith(`/app/faktury/${interestId}`) &&
      (await db.prepare('SELECT COUNT(*) AS n FROM invoices WHERE interest_of = ?').bind(invoiceId).first())?.n === 1,
  )
  page = plain(await (await owner.get(`/app/faktury/${invoiceId}`)).text())
  check('the invoice leads to it', page.includes(`Faktúra na úrok z omeškania: ${interest?.number}`))

  // Reminders by themselves.
  check('only an owner turns the reminders on', (await colleague.post('/app/faktury/upomienky', { zapnut: '1' })).status === 403)
  page = plain(await (await owner.get('/app/faktury')).text())
  check('the invoices offer the reminders, off', page.includes('Upomienky odberateľom') && page.includes('Zapnúť upomienky'))
  res = await owner.post('/app/faktury/upomienky', { zapnut: '1' })
  check('an owner turns them on', res.status === 303 && (await db.prepare('SELECT dunning FROM companies WHERE id = ?').bind(company).first())?.dunning === 1)
  const nine = Date.parse(`${day(0)}T09:30:00Z`)
  const mails = async () => (await db.prepare("SELECT id, subject FROM outbox WHERE recipient = 'neplatic@example.sk' AND id LIKE 'invoice:dun:%' ORDER BY created_at, id").all()).results
  await tick(nine)
  let sent = await mails()
  let row = await db.prepare('SELECT reminders FROM invoices WHERE id = ?').bind(invoiceId).first()
  check(
    'the schedule sends the first reminder of an overdue invoice',
    sent.length === 1 && sent[0].subject === `Pripomienka: faktúra ${number} od TEST-ONLY Upomienky s. r. o.` && row?.reminders === 1,
    JSON.stringify([sent, row]),
  )
  await tick(nine + 60_000)
  sent = await mails()
  check('not the next one within five days', sent.length === 1 && (await db.prepare('SELECT reminders FROM invoices WHERE id = ?').bind(invoiceId).first())?.reminders === 1)
  await db.prepare('UPDATE invoices SET reminded_at = reminded_at - 6 * 86400 WHERE id = ?').bind(invoiceId).run()
  await tick(nine + 120_000)
  await db.prepare('UPDATE invoices SET reminded_at = reminded_at - 6 * 86400 WHERE id = ?').bind(invoiceId).run()
  await tick(nine + 180_000)
  await db.prepare('UPDATE invoices SET reminded_at = reminded_at - 6 * 86400 WHERE id = ?').bind(invoiceId).run()
  await tick(nine + 240_000)
  sent = await mails()
  row = await db.prepare('SELECT reminders FROM invoices WHERE id = ?').bind(invoiceId).first()
  check(
    'then the reminder and the second reminder, three at most',
    sent.length === 3 && sent[1].subject.startsWith('Upomienka: faktúra') && sent[2].subject.startsWith('Druhá upomienka: faktúra') && row?.reminders === 3,
    JSON.stringify([sent, row]),
  )
  page = plain(await (await owner.get(`/app/faktury/${invoiceId}`)).text())
  check('the invoice says how many went', page.includes('Upomienky poslané samé: 3 z 3'))
}
