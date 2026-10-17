// A company's registrations with the Social Insurance Agency and the health insurers, as deadlines: worked out from
// its employees and the day the books start, done when the accountant has recorded them (events
// 'registration.done' / 'registration.undone', the newest of a key counts). Nothing is filed by the app: the
// accountant files them in the authorities' portals and records it here, as with any other professional's check.
//
// Read in the original on 17 October 2026 (static.slov-lex.sk):
// - Act No. 461/2003 Z. z., s. 231(1)(a): the employer registers "najneskôr v deň predchádzajúci dňu, v ktorom začne
//   zamestnávať aspoň jedného zamestnanca"; (b): an employee is registered "najneskôr pred začatím výkonu činnosti
//   zamestnanca" and deregistered "do ôsmich dní od zániku".
// - Act No. 580/2004 Z. z., s. 24(1)(c): the change of an employee's payer "najneskôr do ôsmich pracovných dní";
//   (k): the employer as a new payer "do ôsmich pracovných dní odo dňa vzniku", at each insurer.
import { addDays } from '../app/ending'
import { isWorkingDay } from '../app/vat'

/** The records of a registration filed, and of a record taken back (`events.subject` is the registration's key). */
export const REGISTRATION_EVENTS = { done: 'registration.done', undone: 'registration.undone' } as const

export type RegistrationAgency = 'social' | 'health'
export type RegistrationMove = 'employer' | 'in' | 'out'

export interface RegistrationEmployee {
  id: string
  name: string
  insurer: string
  startedOn: string
  endedOn: string | null
}

export interface RegistrationDue {
  key: string
  agency: RegistrationAgency
  move: RegistrationMove
  /** The employee's name; null for the company's own registration as an employer. */
  name: string | null
  /** The health insurer's code, for the health insurer's registrations. */
  insurer: string | null
  day: string
  done: boolean
}

/** The nth working day after a day (the day itself does not count). */
export function workingDaysAfter(day: string, n: number): string {
  let d = day
  for (let left = n; left > 0; ) {
    d = addDays(d, 1)
    if (isWorkingDay(d)) left--
  }
  return d
}

/**
 * Every registration the company owes while the contract is ours (`from` its first day, `until` its last or null):
 * what happened before it was the former accountant's, what happens after it is the next one's. `done` holds the day
 * each was recorded as filed; a done one is kept for a month after its day or after it was recorded, so that it can be
 * seen and taken back, and the list does not grow for ever.
 */
export function registrationDues(
  employees: readonly RegistrationEmployee[],
  from: string,
  until: string | null,
  done: ReadonlyMap<string, string>,
  today: string,
): RegistrationDue[] {
  const dues: RegistrationDue[] = []
  const ours = (day: string) => day >= from && (!until || day <= until)
  const add = (due: Omit<RegistrationDue, 'done'>) => {
    const recorded = done.get(due.key)
    const cutoff = addDays(today, -31)
    if (recorded === undefined || due.day >= cutoff || recorded >= cutoff) dues.push({ ...due, done: recorded !== undefined })
  }
  const byStart = [...employees].sort((a, b) => (a.startedOn < b.startedOn ? -1 : a.startedOn > b.startedOn ? 1 : 0))
  const first = byStart[0]
  if (first && ours(first.startedOn)) {
    add({ key: 'employer:social', agency: 'social', move: 'employer', name: null, insurer: null, day: addDays(first.startedOn, -1) })
  }
  const insurers = new Set<string>()
  for (const e of byStart) {
    if (!insurers.has(e.insurer)) {
      insurers.add(e.insurer)
      if (ours(e.startedOn))
        add({ key: `employer:health:${e.insurer}`, agency: 'health', move: 'employer', name: null, insurer: e.insurer, day: workingDaysAfter(e.startedOn, 8) })
    }
    if (ours(e.startedOn)) {
      add({ key: `${e.id}:in:social`, agency: 'social', move: 'in', name: e.name, insurer: null, day: addDays(e.startedOn, -1) })
      add({ key: `${e.id}:in:health`, agency: 'health', move: 'in', name: e.name, insurer: e.insurer, day: workingDaysAfter(e.startedOn, 8) })
    }
    if (e.endedOn && ours(e.endedOn)) {
      add({ key: `${e.id}:out:social`, agency: 'social', move: 'out', name: e.name, insurer: null, day: addDays(e.endedOn, 8) })
      add({ key: `${e.id}:out:health`, agency: 'health', move: 'out', name: e.name, insurer: e.insurer, day: workingDaysAfter(e.endedOn, 8) })
    }
  }
  return dues.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0))
}
