// Reminders, the way Dougs and Pennylane send them: on Monday morning to a company that has payments without a
// document, and on the 5th of the month before the deadline for documents (the 10th). Only to people who did not
// turn them off, never for the sample companies, and once: each email has a key in the outbox. Each is a doorbell
// (src/bell.ts): it says that documents are missing and links to the app, and names no payment, amount or partner.
import { APP, BANK, BRAND } from '../config'
import { flushOutbox } from '../mail'
import { bell, ringStatement } from '../bell'
import { monthName } from './copy'
import type { AppBindings } from './routes'
import { MISSING, membersOf } from './store'

/** The parts of a moment in Bratislava. */
export function bratislava(ms: number): { day: string; weekday: number; date: number; hour: number; minute: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Bratislava', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23' })
      .formatToParts(new Date(ms))
      .map((p) => [p.type, p.value]),
  )
  const weekdays: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }
  return {
    day: `${parts.year}-${parts.month}-${parts.day}`,
    weekday: weekdays[parts.weekday ?? ''] ?? 0,
    date: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  }
}

/** Which reminder goes out at this moment: the monthly one on the 5th, else the weekly one on Monday, at nine. */
export function reminderAt(ms: number): 'monthly' | 'weekly' | null {
  const b = bratislava(ms)
  if (b.hour !== 9 || b.minute >= 15) return null
  if (b.date === 5) return 'monthly'
  if (b.weekday === 1) return 'weekly'
  return null
}

const prevMonth = (day: string) => {
  const [y, m] = day.slice(0, 7).split('-').map(Number) as [number, number]
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`
}

/** Queues the reminders of this moment and sends them; says how many were queued. */
export async function remindAll(env: AppBindings, ms: number, origin: string = BRAND.origin): Promise<number> {
  const kind = reminderAt(ms)
  if (!kind) return 0
  const db = env.DB
  const day = bratislava(ms).day
  const month = prevMonth(day)
  const from = `${month}-01`
  const to = `${day.slice(0, 7)}-01`
  const companies = await db
    .prepare(
      `SELECT c.id, c.name FROM companies c WHERE c.closed_at IS NULL AND c.demo = 0 AND (c.ends_on IS NULL OR c.ends_on >= ?)
         AND EXISTS (SELECT 1 FROM payments p WHERE p.company_id = c.id AND ${MISSING} ${kind === 'monthly' ? 'AND p.booked_on >= ? AND p.booked_on < ?' : ''})`,
    )
    // A contract that ended is reminded of nothing more, but for the documents of its last month (point 10.4).
    .bind(...(kind === 'monthly' ? [from, from, to] : [day]))
    .all<{ id: string; name: string }>()
  const statements: D1PreparedStatement[] = []
  const by = `${APP.docsByDay}. ${Number(day.slice(5, 7))}.`
  const monthWord = monthName(`${month}-01`)
  // One doorbell for a person, whatever number of companies of theirs miss documents: it names none of them, and its
  // key names the person and the day (or the month), never the company, so the outbox keeps one.
  const ring = kind === 'weekly' ? bell.missing(`${origin}/app/platby`, `${origin}/app/firma#pripomienky`) : bell.monthly(monthWord, by, `${origin}/app/platby`, `${origin}/app/firma#pripomienky`)
  for (const company of companies.results) {
    for (const person of await membersOf(db, company.id, true)) {
      statements.push(ringStatement(db, `remind-${kind}`, kind === 'weekly' ? day : day.slice(0, 7), person.email, ring))
    }
  }
  for (let i = 0; i < statements.length; i += 50) await db.batch(statements.slice(i, i + 50))
  if (statements.length > 0) await flushOutbox(db, env.EMAIL, 50)
  return statements.length
}

/**
 * The owners of a company whose consent at the bank ends within ten days are asked once, at nine in the morning,
 * to renew it: a bank gives it for 180 days at most, and without it the payments stop coming.
 */
export async function remindBankRenewals(env: AppBindings, ms: number, origin: string = BRAND.origin): Promise<number> {
  const b = bratislava(ms)
  if (b.hour !== 9 || b.minute >= 15) return 0
  const db = env.DB
  const ts = Math.floor(ms / 1000)
  const links = await db
    .prepare(
      `SELECT l.id, l.bank, l.valid_until, c.id AS company_id, c.name AS company FROM bank_links l JOIN companies c ON c.id = l.company_id
       WHERE l.status = 'active' AND l.valid_until IS NOT NULL AND l.valid_until > ? AND l.valid_until < ? AND c.demo = 0 AND c.closed_at IS NULL
         AND (c.ends_on IS NULL OR c.ends_on >= date(l.valid_until, 'unixepoch'))`,
    )
    .bind(ts, ts + BANK.renewDays * 86400)
    .all<{ id: string; bank: string; valid_until: number; company_id: string; company: string }>()
  const statements: D1PreparedStatement[] = []
  for (const link of links.results) {
    const owners = await db
      .prepare("SELECT u.id, u.name, u.email FROM members m JOIN users u ON u.id = m.user_id WHERE m.company_id = ? AND m.role = 'owner'")
      .bind(link.company_id)
      .all<{ id: string; name: string; email: string }>()
    for (const owner of owners.results) {
      statements.push(ringStatement(db, 'bank-renew', link.id, owner.email, bell.bank(`${origin}/app/banka`)))
    }
  }
  for (let i = 0; i < statements.length; i += 50) await db.batch(statements.slice(i, i + 50))
  if (statements.length > 0) await flushOutbox(db, env.EMAIL, 50)
  return statements.length
}
