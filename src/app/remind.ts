// Reminders by email, the way Dougs and Pennylane send them: on Monday morning to a company that has payments
// without a document, and on the 5th of the month before the deadline for documents (the 10th). Only to people who
// did not turn them off, never for the sample companies, and once: each email has a key in the outbox.
import { APP, BRAND } from '../config'
import { flushOutbox, queueStatement } from '../mail'
import { app as t, monthName, readableName, signed } from './copy'
import type { AppBindings } from './routes'
import { MISSING, listPayments, membersOf } from './store'

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
      `SELECT c.id, c.name FROM companies c WHERE c.closed_at IS NULL AND c.demo = 0
         AND EXISTS (SELECT 1 FROM payments p WHERE p.company_id = c.id AND ${MISSING} ${kind === 'monthly' ? 'AND p.booked_on >= ? AND p.booked_on < ?' : ''})`,
    )
    .bind(...(kind === 'monthly' ? [from, to] : []))
    .all<{ id: string; name: string }>()
  const statements: D1PreparedStatement[] = []
  const by = `${APP.docsByDay}. ${Number(day.slice(5, 7))}.`
  const monthWord = monthName(`${month}-01`)
  for (const company of companies.results) {
    const missing = (await listPayments(db, company.id, 'missing', 200)).filter((p) => kind === 'weekly' || (p.bookedOn >= from && p.bookedOn < to))
    if (missing.length === 0) continue
    const lines = missing.slice(0, 10).map((p) => `${Number(p.bookedOn.slice(8, 10))}. ${Number(p.bookedOn.slice(5, 7))}. ${p.party ? readableName(p.party) : (p.note ?? '')}, ${signed(p.amountCents)}`)
    for (const person of await membersOf(db, company.id, true)) {
      const subject = kind === 'weekly' ? t.remind.weeklySubject(missing.length) : t.remind.monthlySubject(monthWord, by)
      const intro = kind === 'weekly' ? t.remind.weeklyIntro(company.name) : t.remind.monthlyIntro(monthWord, by)
      const name = person.name.split(/\s+/)[0] ?? person.name
      statements.push(
        queueStatement(db, {
          key: `remind:${kind}:${company.id}:${person.id}:${kind === 'weekly' ? day : day.slice(0, 7)}`,
          to: person.email,
          subject,
          body: t.remind.body(name, company.name, intro, lines, missing.length - lines.length, `${origin}/app/platby`, `${origin}/app/firma#pripomienky`),
        }),
      )
    }
  }
  for (let i = 0; i < statements.length; i += 50) await db.batch(statements.slice(i, i + 50))
  if (statements.length > 0) await flushOutbox(db, env.EMAIL, 50)
  return statements.length
}
