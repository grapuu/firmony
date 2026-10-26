// Invoices issued again by themselves (18 October 2026), in workerd: an issued invoice is made to repeat every month
// from today, the schedule issues the next one with the same customer and lines, numbered in the invoices' row, due as
// many days after it, mails nothing to the customer but rings the person who started it with a doorbell (26 October
// 2026), moves the repeat a month on and issues nothing twice; the repeat is listed, stopped, and refused for a day in
// the past and for a credit note.
import { check } from './check.mjs'
import { writeFileSync } from 'node:fs'

export async function checkRepeats({ db, nowS, signIn, as, day, tick, capture }) {
  const company = 'co-repeat'
  const plain = (text) => text.replace(/[  ]/g, ' ')
  const sk = (d) => `${Number(d.slice(8))}. ${Number(d.slice(5, 7))}. ${d.slice(0, 4)}`
  const idOf = (res) => res.headers.get('location')?.match(/\/app\/faktury\/([0-9a-f-]{36})/)?.[1] ?? ''
  await db.batch([
    db
      .prepare(
        "INSERT INTO companies (id, created_at, name, ico, dic, icdph, address, vat_payer, vat_since, plan, inbox, start_on) VALUES (?, ?, 'TEST-ONLY Opakovaná s. r. o.', '50777802', '2120777802', 'SK2120777802', 'Hlavná 11, 811 01 Bratislava', 1, '2026-01-01', 'firma', 'opak0001', '2026-01-01')",
      )
      .bind(company, nowS),
    db.prepare("INSERT INTO users (id, created_at, email, name) VALUES ('u-repeat', ?, 'repeat@example.sk', 'TEST-ONLY Opakovaná')").bind(nowS),
    db.prepare("INSERT INTO members (company_id, user_id, role, created_at) VALUES (?, 'u-repeat', 'owner', ?)").bind(company, nowS),
    db.prepare("INSERT INTO accounts (id, company_id, iban) VALUES ('acc-repeat', ?, 'SK3112000000198742637541')").bind(company),
  ])
  const client = as((await signIn('repeat@example.sk')).cookie)
  const today = day(0)
  const issuedOn = day(-31)
  let res = await client.post('/app/faktury', {
    akcia: 'vystavit',
    meno: 'TEST-ONLY Nájomca s. r. o.',
    adresa: 'Námestie 3, 040 01 Košice',
    icdph: 'SK2120000000',
    email: 'najomca@example.sk',
    vystavena: sk(issuedOn),
    dodana: sk(issuedOn),
    splatna: sk(day(-17)),
    iban: 'SK31 1200 0000 1987 4263 7541',
    riadky: '1',
    'r0-popis': 'Nájom kancelárie',
    'r0-mnozstvo': '1',
    'r0-jednotka': 'ks',
    'r0-cena': '500,00',
    'r0-dph': '23',
  })
  const templateId = idOf(res)
  const template = await db.prepare('SELECT number FROM invoices WHERE id = ?').bind(templateId).first()
  const pageRaw = await (await client.get(`/app/faktury/${templateId}`)).text()
  let page = plain(pageRaw)
  check(
    'an issued invoice offers to repeat, its next day a month on, kept to its day of the month',
    page.includes(`action="/app/faktury/${templateId}/opakovat"`) && page.includes('Každý mesiac') && !page.includes('name="poslat"'),
  )
  res = await client.post(`/app/faktury/${templateId}/opakovat`, { kazdych: '1', od: sk(day(-1)), do: '', poslat: '1' })
  check('a repeat may not start in the past', res.status === 422 && plain(await res.text()).includes('nie skôr ako dnes'))
  res = await client.post(`/app/faktury/${templateId}/opakovat`, { kazdych: '1', od: sk(today), do: sk(day(-3)), poslat: '1' })
  check('nor end before it starts', res.status === 422 && plain(await res.text()).includes('nesmie byť skôr'))
  res = await client.post(`/app/faktury/${templateId}/opakovat`, { kazdych: '1', od: sk(today), do: '', poslat: '1' })
  const repeat = await db.prepare('SELECT id, every, anchor, next_on, send FROM invoice_repeats WHERE template_id = ? AND stopped_at IS NULL').bind(templateId).first()
  check(
    'it repeats every month from today, mailed to nobody whatever an old form posts',
    res.status === 303 &&
      (res.headers.get('location') ?? '').includes('ok=opakovanie') &&
      repeat?.every === 1 &&
      repeat.next_on === today &&
      repeat.anchor === Number(today.slice(8)) &&
      repeat.send === 0,
    JSON.stringify(repeat),
  )
  res = await client.post(`/app/faktury/${templateId}/opakovat`, { kazdych: '3', od: sk(today), do: '', poslat: '' })
  check('a second repeat of the same invoice is not started', (await db.prepare('SELECT COUNT(*) AS n FROM invoice_repeats WHERE template_id = ?').bind(templateId).first())?.n === 1)

  // The schedule: the next invoice today, once.
  const scheduledAt = Date.now()
  const scheduledDay = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Bratislava' }).format(new Date(scheduledAt))
  const scheduledDue = new Date(Date.parse(`${scheduledDay}T12:00:00Z`) + 14 * 86400000).toISOString().slice(0, 10)
  await tick(scheduledAt)
  let issued = null
  for (let i = 0; i < 30 && !issued; i++) {
    issued = await db
      .prepare('SELECT id, number, issued_on, delivered_on, due_on, total_cents, customer_name, repeat_id, sent_at, document_id FROM invoices WHERE repeat_id = ?')
      .bind(repeat?.id ?? '')
      .first()
    if (!issued) await new Promise((r) => setTimeout(r, 100))
  }
  const lines = (
    await db
      .prepare('SELECT description, base_cents, vat_rate FROM invoice_lines WHERE invoice_id = ?')
      .bind(issued?.id ?? '')
      .all()
  ).results
  check(
    'the schedule issues it today: the next number, the same customer and lines, due as many days after it',
    issued?.number === String(Number(template?.number) + 1) &&
      issued.issued_on === scheduledDay &&
      issued.delivered_on === scheduledDay &&
      issued.due_on === scheduledDue &&
      issued.total_cents === 61500 &&
      issued.customer_name === 'TEST-ONLY Nájomca s. r. o.' &&
      lines.length === 1 &&
      lines[0].description === 'Nájom kancelárie' &&
      lines[0].base_cents === 50000 &&
      Boolean(issued.document_id),
    JSON.stringify([issued, lines]),
  )
  let bell = null
  for (let i = 0; i < 30 && !bell; i++) {
    bell = await db
      .prepare("SELECT subject, body FROM outbox WHERE recipient = 'repeat@example.sk' AND id = ?")
      .bind(`bell:invoice-repeated:${issued?.id ?? ''}:repeat@example.sk`)
      .first()
    if (!bell) await new Promise((r) => setTimeout(r, 100))
  }
  check(
    'nothing goes to the customer; who started the repeat gets a doorbell with the link to the new invoice and nothing else',
    (await db.prepare("SELECT COUNT(*) AS n FROM outbox WHERE recipient = 'najomca@example.sk'").first())?.n === 0 &&
      issued?.sent_at === null &&
      bell?.subject === 'Firmony: faktúra je vystavená' &&
      bell.body.includes(`/app/faktury/${issued?.id}`) &&
      !bell.body.includes('Nájomca') &&
      !bell.body.includes('615'),
    JSON.stringify(bell),
  )
  const moved = await db
    .prepare('SELECT next_on, last_invoice_id, failed FROM invoice_repeats WHERE id = ?')
    .bind(repeat?.id ?? '')
    .first()
  const nextMonth = (() => {
    const y = Number(today.slice(0, 4))
    const m = Number(today.slice(5, 7))
    const ny = m === 12 ? y + 1 : y
    const nm = m === 12 ? 1 : m + 1
    const last = new Date(Date.UTC(ny, nm, 0)).getUTCDate()
    return `${ny}-${String(nm).padStart(2, '0')}-${String(Math.min(Number(today.slice(8)), last)).padStart(2, '0')}`
  })()
  check('the repeat moves a month on', moved?.next_on === nextMonth && moved.last_invoice_id === issued?.id && moved.failed === null, JSON.stringify(moved))
  await db
    .prepare('UPDATE invoice_repeats SET next_on = ? WHERE id = ?')
    .bind(today, repeat?.id ?? '')
    .run()
  await tick(Date.now())
  await new Promise((r) => setTimeout(r, 500))
  check(
    'run again the same day, it issues nothing twice',
    (
      await db
        .prepare('SELECT COUNT(*) AS n FROM invoices WHERE repeat_id = ?')
        .bind(repeat?.id ?? '')
        .first()
    )?.n === 1,
  )
  await db
    .prepare('UPDATE invoice_repeats SET next_on = ? WHERE id = ?')
    .bind(nextMonth, repeat?.id ?? '')
    .run()

  const issuedRaw = await (await client.get(`/app/faktury/${issued?.id}`)).text()
  check('the invoice it issued says so, and offers its PDF to send', plain(issuedRaw).includes('Vystavená sama z opakovania') && issuedRaw.includes(`href="/app/faktury/${issued?.id}/pdf"`))
  const templateRaw = await (await client.get(`/app/faktury/${templateId}`)).text()
  if (capture) writeFileSync(`${capture}/invoice-repeat.html`, templateRaw)
  page = plain(templateRaw)
  check('the invoice says it repeats, when next, and offers to stop', page.includes('Opakuje sa každý mesiac, ďalšia') && page.includes(`/app/faktury/opakovanie/${repeat?.id}/zastavit`))
  const listRaw = await (await client.get('/app/faktury')).text()
  if (capture) writeFileSync(`${capture}/invoices-repeats.html`, listRaw)
  page = plain(listRaw)
  check('the invoices list their repeats', page.includes('Opakované faktúry') && page.includes(`/app/faktury/${templateId}#opakovanie`) && page.includes('615,00 €, každý mesiac'))
  res = await client.post(`/app/faktury/opakovanie/${repeat?.id}/zastavit`, {})
  check(
    'stopped, it issues nothing more and the invoice may repeat again',
    res.status === 303 &&
      (
        await db
          .prepare('SELECT stopped_at FROM invoice_repeats WHERE id = ?')
          .bind(repeat?.id ?? '')
          .first()
      )?.stopped_at !== null &&
      plain(await (await client.get(`/app/faktury/${templateId}`)).text()).includes(`action="/app/faktury/${templateId}/opakovat"`),
  )
  // A credit note does not repeat.
  res = await client.post('/app/faktury', {
    akcia: 'vystavit',
    dobropis: templateId,
    meno: 'x',
    vystavena: sk(today),
    dodana: sk(today),
    splatna: sk(today),
    riadky: '1',
    'r0-popis': 'Zľava',
    'r0-mnozstvo': '1',
    'r0-jednotka': 'ks',
    'r0-cena': '10,00',
    'r0-dph': '23',
    dovod: 'Zľava za opravu',
  })
  const creditId = idOf(res)
  check(
    'a credit note does not repeat',
    Boolean(creditId) &&
      !plain(await (await client.get(`/app/faktury/${creditId}`)).text()).includes('/opakovat') &&
      (await client.post(`/app/faktury/${creditId}/opakovat`, { kazdych: '1', od: sk(today) })).status === 404,
  )
}
