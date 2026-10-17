// A continuous lock includes earlier years: their balances open the next year. Reopening from a month leaves earlier months locked.
import { monthEnd, type Books } from './ledger'

export interface PeriodLock {
  through: string | null
  version: number
  at: number
  by: string
  reason: string
}
export interface LockChange extends PeriodLock {
  before: string | null
  byName: string | null
}
export interface LockValues {
  action: string
  month: string
  reason: string
}

export function lockTarget(values: LockValues, current: string | null, today: string, start?: string | null): { through: string | null } | { error: string } {
  if (!/^[12]\d{3}-(0[1-9]|1[0-2])$/.test(values.month)) return { error: 'Vyberte platný mesiac a rok.' }
  const year = Number(values.month.slice(0, 4)),
    month = Number(values.month.slice(5, 7))
  if (values.action === 'lock') {
    const through = monthEnd(year, month)
    if (through >= today) return { error: 'Uzamknúť možno iba ukončené mesiace.' }
    if (start && through < start) return { error: 'Vyberte mesiac od začiatku účtovníctva.' }
    if (current && through <= current) return { error: 'Tento mesiac je už uzamknutý. Vyberte neskorší mesiac.' }
    return { through }
  }
  if (values.action !== 'open') return { error: 'Vyberte uzamknutie alebo otvorenie obdobia.' }
  if (!current || `${values.month}-01` > current) return { error: 'Vybraný mesiac nie je uzamknutý.' }
  if (values.reason.trim().length < 10 || values.reason.length > 1000) return { error: 'Pri otvorení napíšte dôvod v rozsahu 10 až 1 000 znakov.' }
  // A complete reopening can go all the way back to the first supported year.
  return {
    through:
      values.month === '1000-01' || (start && values.month <= start.slice(0, 7)) ? null : monthEnd(month === 1 ? year - 1 : year, month === 1 ? 12 : month - 1),
  }
}

/** Known incomplete accounting in the interval must be resolved before it is frozen. Unknown document dates also need review. */
export function lockBlockers(books: Books, through: string): { documents: number; payments: number } {
  const within = (day: string | null) => !day || (day <= through && (!books.start || day >= books.start))
  const docs = new Set([...books.issues.unbooked, ...books.issues.noEntry].filter((id) => within(books.docDays.get(id) ?? null)))
  const payments = new Set(
    [...books.issues.classify, ...books.issues.waiting, ...books.issues.missing, ...books.issues.foreign].filter((id) =>
      within(books.payments.get(id)?.bookedOn ?? null),
    ),
  )
  return { documents: docs.size, payments: payments.size }
}

/** D1 wraps SQLite errors; never expose its SQL to the user. */
export function isPeriodLocked(error: unknown): boolean {
  for (let i = 0; error && i < 8; i++) {
    if (typeof error !== 'object') return false
    const e = error as { message?: unknown; cause?: unknown }
    if (typeof e.message === 'string' && e.message.includes('FIRMONY_PERIOD_LOCKED')) return true
    error = e.cause
  }
  return false
}
