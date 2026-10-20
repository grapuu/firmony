// The accountants paid for the work done (20 October 2026, team/work-pay.ts), in workerd: a month's statement counts
// each thing once ever (a document booked again, a return filed again, payroll closed again pay nothing), gives a
// quiet company of hers the month's fee, and an accountant sees only her own while the administrator sees the team.
import { check } from './check.mjs'
import { writeFileSync } from 'node:fs'

export async function checkWorkPay({ db, acc, admin, lucia, nowS, day, capture }) {
  const month = day(0).slice(0, 7)
  const before = Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 1) / 1000 - 5 * 86400
  const boss = await db.prepare("SELECT id FROM users WHERE email = 'ahoj@firmony.io'").first()
  await db.batch([
    db
      .prepare(
        `INSERT INTO companies (id, created_at, name, ico, address, plan, inbox, accountant_id, contract_at, start_on)
         VALUES ('co-wp', ?, 'TEST-ONLY Výkaz s. r. o.', '63335602', 'Hlavná 7, 811 01 Bratislava', 'rast', 'vykz0001', ?, ?, '2026-01-01'),
                ('co-wq', ?, 'TEST-ONLY Ticho s. r. o.', NULL, NULL, 'start', 'tich0001', ?, ?, '2026-01-01')`,
      )
      .bind(nowS, lucia.id, nowS, nowS, lucia.id, nowS),
  ])
  const ev = (company, user, action, subject, at, detail = null) =>
    db.prepare('INSERT INTO events (at, company_id, user_id, action, subject, detail) VALUES (?, ?, ?, ?, ?, ?)').bind(at, company, user, action, subject, detail)
  await db.batch([
    // Booked last month, booked again now: no new work.
    ev('co-wp', lucia.id, 'document.booked', 'wp-old', before),
    ev('co-wp', lucia.id, 'document.booked', 'wp-old', nowS - 50),
    // Booked, unbooked and booked again this month: one document.
    ev('co-wp', lucia.id, 'document.booked', 'wp-a', nowS - 40, JSON.stringify({ seconds: 60 })),
    ev('co-wp', lucia.id, 'document.booked', 'wp-a', nowS - 30),
    ev('co-wp', lucia.id, 'document.discarded', 'wp-b', nowS - 30),
    ev('co-wp', lucia.id, 'document.booked', 'wp-c', nowS - 20, JSON.stringify({ seconds: 84 })),
    // Booked by somebody else first: not hers to be paid for.
    ev('co-wp', boss?.id ?? null, 'document.booked', 'wp-d', nowS - 25),
    ev('co-wp', lucia.id, 'document.booked', 'wp-d', nowS - 10),
    // A period filed for the first time, filed again after it was taken back; one filed first last month.
    ev('co-wp', lucia.id, 'vat.filed', '2026-07', before),
    ev('co-wp', lucia.id, 'vat.filed', '2026-07', nowS - 15),
    ev('co-wp', lucia.id, 'vat.filed', '2026-08', nowS - 15),
    ev('co-wp', lucia.id, 'vat.filed', '2026-08', nowS - 5),
    // A payroll month of three people, closed again; a closing; the opening balances twice.
    ev('co-wp', lucia.id, 'payroll.closed', '2026-08', nowS - 14, JSON.stringify({ employees: 3, gross: 300000 })),
    ev('co-wp', lucia.id, 'payroll.closed', '2026-08', nowS - 4, JSON.stringify({ employees: 3, gross: 300000 })),
    ev('co-wp', lucia.id, 'closing.filed', '2025', nowS - 13),
    ev('co-wp', lucia.id, 'ledger.opening', 'wp-open-1', nowS - 12),
    ev('co-wp', lucia.id, 'ledger.opening', 'wp-open-2', nowS - 3),
  ])

  const raw = await (await acc.get(`/ucto/vykaz?mesiac=${month}`)).text()
  if (capture) writeFileSync(`${capture}/work-pay.html`, raw)
  check('her statement says how long a document took', /Čas na jeden doklad od otvorenia po zaúčtovanie: medián [^<]+ \(z \d+ dokladov\)/.test(raw.replace(/[\u00a0\u202f]/g, ' ')))
  check('her statement lists her companies and the rates', raw.includes('Výkaz práce') && raw.includes('TEST-ONLY Výkaz s. r. o.') && raw.includes('TEST-ONLY Ticho s. r. o.') && raw.includes('doklad zaúčtovaný alebo vyradený'))
  const csv = await (await acc.get(`/ucto/vykaz.csv?mesiac=${month}`)).text()
  const line = (name) => csv.split('\r\n').find((l) => l.startsWith(`${name};`)) ?? ''
  check(
    'each thing once ever: 3 documents, one period, three people, a closing, a takeover (145,50 €)',
    line('TEST-ONLY Výkaz s. r. o.') === 'TEST-ONLY Výkaz s. r. o.;63335602;3;1,50;1;12,00;0,00;3;12,00;1;90,00;30,00;145,50',
    line('TEST-ONLY Výkaz s. r. o.'),
  )
  check('a quiet company of hers: the month\'s fee', line('TEST-ONLY Ticho s. r. o.') === 'TEST-ONLY Ticho s. r. o.;;0;0,00;0;0,00;6,00;0;0,00;0;0,00;0,00;6,00', line('TEST-ONLY Ticho s. r. o.'))
  const sum = csv.split('\r\n').find((l) => l.startsWith('Spolu;')) ?? ''
  const lines = csv.split('\r\n').slice(1).filter((l) => l && !l.startsWith('Spolu;'))
  const cents = (l) => Number(l.split(';').at(-1).replace(',', ''))
  check('the sum is the sum of the lines', cents(sum) === lines.reduce((s, l) => s + cents(l), 0) && cents(sum) >= 15150, sum)

  const other = await (await acc.get(`/ucto/vykaz?mesiac=${month}&uctovnicka=${boss?.id}`)).text()
  check("an accountant asking for somebody else's statement gets her own", other.includes('Lucia Horváthová,') && !other.includes('Christian Juhás,'))
  const team = await (await admin.get(`/ucto/vykaz?mesiac=${month}&uctovnicka=${lucia.id}`)).text()
  check('the administrator sees the whole team and her statement', team.includes('Celý tím') && team.includes('Lucia Horváthová,') && team.includes('TEST-ONLY Výkaz s. r. o.'))
  const mine = await (await admin.get(`/ucto/vykaz.csv?mesiac=${month}&uctovnicka=${boss?.id}`)).text()
  check("the administrator's own statement: the document he booked first", (mine.split('\r\n').find((l) => l.startsWith('TEST-ONLY Výkaz s. r. o.;')) ?? '').startsWith('TEST-ONLY Výkaz s. r. o.;63335602;1;0,50;'))
}
