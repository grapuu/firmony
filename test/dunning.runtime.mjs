// Reminders and late interest (18 October 2026), in workerd: an invoice to a business forty days overdue shows its
// late interest; issued in one click as an invoice of the interest and the flat 40 € outside VAT (once); interest of
// later days is invoiced again without the flat 40 €, and an invoice of interest a credit note took back counts for
// nothing; an invoice of interest is never copied or repeated. Since 26 October 2026 Firmony mails no reminder: the
// page of an overdue invoice prepares the client's own (an email, the phone's share sheet, the text to copy), for what
// is left after the credit notes; none for an invoice credited whole or a request with its final invoice, and the
// schedule sends nothing.
import { check } from './check.mjs'
import { writeFileSync } from 'node:fs'

export async function checkDunning({ db, nowS, lucia, signIn, as, day, tick, capture }) {
  const company = 'co-dunning'
  const plain = (text) => text.replace(/[  ]/g, ' ')
  const sk = (d) => `${Number(d.slice(8))}. ${Number(d.slice(5, 7))}. ${d.slice(0, 4)}`
  const GEN = ['januára', 'februára', 'marca', 'apríla', 'mája', 'júna', 'júla', 'augusta', 'septembra', 'októbra', 'novembra', 'decembra']
  const long = (d) => `${Number(d.slice(8))}. ${GEN[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`
  const idOf = (res) => res.headers.get('location')?.match(/\/app\/faktury\/([0-9a-f-]{36})/)?.[1] ?? ''
  await db.batch([
    db
      .prepare(
        "INSERT INTO companies (id, created_at, name, ico, dic, icdph, address, vat_payer, vat_since, plan, inbox, start_on, accountant_id) VALUES (?, ?, 'TEST-ONLY Upomienky s. r. o.', '50777850', '2120777850', 'SK2120777850', 'Hlavná 17, 811 01 Bratislava', 1, '2026-01-01', 'firma', 'upom0001', '2026-01-01', ?)",
      )
      .bind(company, nowS, lucia.id),
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
    'asked again the same day, the one there is',
    res.status === 303 &&
      (res.headers.get('location') ?? '').endsWith(`/app/faktury/${interestId}`) &&
      (await db.prepare('SELECT COUNT(*) AS n FROM invoices WHERE interest_of = ?').bind(invoiceId).first())?.n === 1,
  )
  page = plain(await (await owner.get(`/app/faktury/${invoiceId}`)).text())
  check(
    'the invoice leads to it, with the day its interest counts to, and asks for nothing more today',
    page.includes(`Faktúra na úrok z omeškania: ${interest?.number}, úrok do ${long(day(0)).replace(` ${day(0).slice(0, 4)}`, '')}`) && !page.includes(`action="/app/faktury/${invoiceId}/urok"`),
  )
  check('kept with its last day', (await db.prepare('SELECT interest_to FROM invoices WHERE id = ?').bind(interestId).first())?.interest_to === day(0))
  page = plain(await (await owner.get(`/app/faktury/${interestId}`)).text())
  const copied = plain(await (await owner.get(`/app/faktury/nova?podla=${interestId}`)).text())
  check(
    'an invoice of interest is never copied or repeated: only its customer is taken',
    !page.includes(`nova?podla=${interestId}`) &&
      !page.includes('id="opakovanie"') &&
      (await owner.post(`/app/faktury/${interestId}/opakovat`, { kazdy: 'month', od: sk(day(30)) })).status === 404 &&
      copied.includes('TEST-ONLY Neplatič s. r. o.') &&
      !copied.includes('Úrok z omeškania z faktúry'),
  )
  // Ten days later (its last day moved back ten days): the interest of those days, without the flat compensation.
  await db.prepare('UPDATE invoices SET interest_to = ? WHERE id = ?').bind(day(-10), interestId).run()
  page = plain(await (await owner.get(`/app/faktury/${invoiceId}`)).text())
  check(
    'later days are offered again, without the 40 €',
    page.includes('Úrok z omeškania za 10 dní') && page.includes('Vystaviť faktúru na ďalší úrok') && !page.includes('paušálna náhrada nákladov 40 €'),
  )
  res = await owner.post(`/app/faktury/${invoiceId}/urok`, {})
  const secondId = idOf(res)
  const second = await db.prepare('SELECT interest_of, interest_to, total_cents, note FROM invoices WHERE id = ?').bind(secondId).first()
  const secondLines = (await db.prepare('SELECT description, base_cents FROM invoice_lines WHERE invoice_id = ? ORDER BY position').bind(secondId).all()).results
  check(
    'the second invoice of interest: those ten days alone, no flat compensation, to today',
    res.status === 303 &&
      secondId !== interestId &&
      second?.interest_of === invoiceId &&
      second.interest_to === day(0) &&
      secondLines.length === 1 &&
      plain(secondLines[0].description).includes(`za ${long(day(-9))} až ${long(day(0))}`) &&
      second.total_cents === secondLines[0].base_cents &&
      second.total_cents > 0 &&
      !plain(second.note).includes('paušálna'),
    JSON.stringify([second, secondLines]),
  )
  // A credit note takes the second back whole: its days are offered again, still without the 40 €.
  res = await owner.post('/app/faktury', {
    akcia: 'vystavit',
    dobropis: secondId,
    meno: 'x',
    vystavena: sk(day(0)),
    dodana: sk(day(0)),
    splatna: sk(day(14)),
    riadky: '1',
    'r0-popis': 'Úrok omylom',
    'r0-mnozstvo': '1',
    'r0-jednotka': 'ks',
    'r0-cena': (second.total_cents / 100).toFixed(2).replace('.', ','),
    'r0-dph': '0',
    dovod: 'Úrok bol vyfakturovaný omylom',
  })
  const creditId = idOf(res)
  const credit = await db.prepare('SELECT kind, interest_of, interest_to, total_cents, document_id FROM invoices WHERE id = ?').bind(creditId).first()
  const creditDoc = await db
    .prepare('SELECT category FROM documents WHERE id = ?')
    .bind(credit?.document_id ?? '')
    .first()
  page = plain(await (await owner.get(`/app/faktury/${invoiceId}`)).text())
  check(
    'its credit note is interest too (644), and the days it took back are offered again',
    credit?.kind === 'credit' &&
      credit.interest_of === invoiceId &&
      credit.interest_to === null &&
      credit.total_cents === -second.total_cents &&
      creditDoc?.category === 'interest' &&
      page.includes('zrušená dobropisom') &&
      page.includes('Úrok z omeškania za 10 dní') &&
      !page.includes('paušálna náhrada nákladov 40 €'),
    JSON.stringify([credit, creditDoc]),
  )

  // Reminders the client sends himself (26 October 2026).
  check('the switch of the reminders that went by themselves is gone', (await owner.post('/app/faktury/upomienky', { zapnut: '1' })).status === 404 && (await db.prepare('SELECT dunning FROM companies WHERE id = ?').bind(company).first())?.dunning === 0)
  page = plain(await (await owner.get('/app/faktury')).text())
  check('the invoices offer no reminders by themselves', !page.includes('Upomienky odberateľom') && !page.includes('/app/faktury/upomienky'))
  const late = (email, extra = {}) =>
    owner.post('/app/faktury', {
      akcia: 'vystavit',
      ico: '50123456',
      meno: 'TEST-ONLY Neplatič s. r. o.',
      adresa: 'Dlhá 1, 040 01 Košice',
      icdph: 'SK2120000000',
      email,
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
      ...extra,
    })
  const creditOf = (id, cena) =>
    owner.post('/app/faktury', {
      akcia: 'vystavit',
      dobropis: id,
      meno: 'x',
      vystavena: sk(day(0)),
      dodana: sk(day(0)),
      splatna: sk(day(14)),
      riadky: '1',
      'r0-popis': 'Zľava',
      'r0-mnozstvo': '1',
      'r0-jednotka': 'ks',
      'r0-cena': cena,
      'r0-dph': '23',
      dovod: 'Zľava za oneskorenie',
    })
  // One credited in part, one credited whole, a request whose final invoice is issued.
  const partId = idOf(await late('dobropis@example.sk'))
  await creditOf(partId, '500,00')
  const wholeId = idOf(await late('cely@example.sk'))
  await creditOf(wholeId, '1000,00')
  const requestId = idOf(await late('zaloha@example.sk', { druh: 'zalohova' }))
  const finalRes = await owner.post('/app/faktury', {
    akcia: 'vystavit',
    vyuctovanie: requestId,
    meno: 'TEST-ONLY Neplatič s. r. o.',
    ico: '50123456',
    icdph: 'SK2120000000',
    adresa: 'Dlhá 1, 040 01 Košice',
    vystavena: sk(day(0)),
    dodana: sk(day(0)),
    splatna: sk(day(14)),
    iban: 'SK31 1200 0000 1987 4263 7541',
    riadky: '1',
    'r0-popis': 'Služba',
    'r0-mnozstvo': '1',
    'r0-jednotka': 'ks',
    'r0-cena': '1000,00',
    'r0-dph': '23',
  })
  check(
    'the request got its final invoice',
    finalRes.status === 303 && (await db.prepare("SELECT COUNT(*) AS n FROM invoices WHERE relates = ? AND kind = 'invoice' AND status = 'issued'").bind(requestId).first())?.n === 1,
  )
  const mailtos = (raw) => [...raw.matchAll(/href="(mailto:[^"]+)"/g)].map((m) => decodeURIComponent(m[1].replace(/&amp;/g, '&')))
  const lateRaw = await (await owner.get(`/app/faktury/${invoiceId}`)).text()
  if (capture) writeFileSync(`${capture}/invoice-remind.html`, lateRaw)
  const reminder = mailtos(lateRaw).find((m) => m.includes('Pripomienka'))
  check(
    'an overdue invoice prepares the reminder: an email to the customer with what it asks, its due day and the account, to share from a phone, the text to copy',
    plain(lateRaw).includes('Pripomenúť platbu') &&
      plain(lateRaw).includes('zostáva zaplatiť 1 230,00 €') &&
      Boolean(reminder) &&
      reminder.startsWith('mailto:neplatic@example.sk?subject=') &&
      reminder.includes(`Pripomienka úhrady faktúry ${number} od TEST-ONLY Upomienky s. r. o.`) &&
      reminder.includes(`pripomíname Vám úhradu faktúry č. ${number} na sumu 1 230,00 € so splatnosťou ${long(day(-40))}. Platbu sme zatiaľ nedostali.`) &&
      reminder.includes('Úhrada prevodom na účet SK31 1200 0000 1987 4263 7541') &&
      reminder.includes('Ak ste už zaplatili') &&
      (lateRaw.match(/data-share="[^"]*\/pdf\?zdielat=1"/g) ?? []).length === 2 &&
      lateRaw.includes('Kopírovať text pripomienky') &&
      lateRaw.includes('<textarea'),
    reminder,
  )
  const partRaw = await (await owner.get(`/app/faktury/${partId}`)).text()
  check(
    'one credited in part is reminded of what is left; one credited whole is not, nor a request with its final invoice',
    mailtos(partRaw).some((m) => m.includes('po dobropise na sumu 615,00 €')) &&
      !(await (await owner.get(`/app/faktury/${wholeId}`)).text()).includes('Pripomenúť platbu') &&
      !(await (await owner.get(`/app/faktury/${requestId}`)).text()).includes('Pripomenúť platbu'),
  )
  check('the removed reminder addresses answer nothing', (await owner.post(`/app/faktury/${invoiceId}/pripomenut`, {})).status === 404 && (await owner.post(`/app/faktury/${invoiceId}/poslat`, {})).status === 404)
  // The schedule at nine, with the bank up to date and an old company switched on: nothing goes to any customer.
  await db.prepare('UPDATE companies SET dunning = 1 WHERE id = ?').bind(company).run()
  await db.prepare('UPDATE invoices SET sent_at = ? WHERE company_id = ? AND kind IN (?, ?)').bind(nowS - 10 * 86400, company, 'invoice', 'proforma').run()
  await db
    .prepare(
      "INSERT INTO statements (id, company_id, account_id, iban, created_at, source, from_on, to_on, status) VALUES ('st-dunning', ?, 'acc-dunning', 'SK3112000000198742637541', ?, 'upload', ?, ?, 'taken')",
    )
    .bind(company, nowS, day(-70), day(-1))
    .run()
  await tick(Date.parse(`${day(0)}T09:30:00Z`))
  check(
    'the schedule mails no reminder to any customer',
    (await db.prepare("SELECT COUNT(*) AS n FROM outbox WHERE id LIKE 'invoice:%'").first())?.n === 0 &&
      (await db.prepare("SELECT COUNT(*) AS n FROM outbox WHERE recipient IN ('neplatic@example.sk', 'dobropis@example.sk', 'cely@example.sk', 'zaloha@example.sk')").first())?.n === 0 &&
      (await db.prepare('SELECT reminders FROM invoices WHERE id = ?').bind(invoiceId).first())?.reminders === 0,
  )
  // An invoice reminded by itself before 26 October 2026 keeps saying so.
  await db.prepare('UPDATE invoices SET reminders = 3 WHERE id = ?').bind(invoiceId).run()
  page = plain(await (await owner.get(`/app/faktury/${invoiceId}`)).text())
  check('an invoice reminded before still says how many went', page.includes('Firmony poslalo odberateľovi upomienky e-mailom: 3.') && page.includes('Firmony ju poslalo e-mailom'))
}
