import { isWorkingDay } from '../app/vat'

const clock = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Bratislava',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})

function parts(seconds: number): Record<string, string> {
  if (!Number.isFinite(seconds)) throw new RangeError('Invalid message time')
  return Object.fromEntries(clock.formatToParts(new Date(seconds * 1000)).map((p) => [p.type, p.value]))
}

/** Internal response target: the same Bratislava wall-clock time on the next Slovak working day.
 * A follow-up never changes the first unanswered message's target. This measures a first personal response,
 * not resolution; the working-day calendar is shared with the statutory deadlines, including 2026 exceptions.
 */
export function responseDueAt(firstUnanswered: number): number {
  const p = parts(firstUnanswered)
  let day = new Date(Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day) + 1, 12)).toISOString().slice(0, 10)
  while (!isWorkingDay(day)) day = new Date(Date.parse(`${day}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10)
  const wall = Date.parse(`${day}T${p.hour}:${p.minute}:${p.second}Z`)
  const atTarget = parts(wall / 1000)
  const offset =
    Date.UTC(Number(atTarget.year), Number(atTarget.month) - 1, Number(atTarget.day), Number(atTarget.hour), Number(atTarget.minute), Number(atTarget.second)) -
    wall
  return (wall - offset) / 1000
}
