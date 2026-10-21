// The end of a contract, and what follows it (point 10.4 of the terms). Its last day is set by the client's notice in
// the app, or by us on the team's side. After it the last month's documents and payments are still taken for ten
// days, the accountant hands the books over in the app within thirty, and everything can be downloaded for ninety;
// then the schedule deletes the company's data (purge.ts), all but what the law against money laundering keeps.
import { ENDING } from '../config'
import type { Company } from './store'

/** A day moved by whole days, YYYY-MM-DD. */
export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/**
 * Where a contract with a last day stands: it still runs ("ending"), it ended and the last month's documents are
 * still taken ("closing"), or only the download is left ("ended").
 */
export type Phase = 'ending' | 'closing' | 'ended'

export interface Ending {
  phase: Phase
  /** Who set the last day: the client by notice, or we. */
  side: 'client' | 'firmony'
  endsOn: string
  /** The last day documents and payments of the last month are taken. */
  intakeUntil: string
  /** The day by which the books are handed over in the app. */
  handoverBy: string
  /** The last day of client access; statutory records remain in the restricted archive. */
  accessUntil: string
}

export function endingOf(company: Pick<Company, 'endsOn' | 'noticeSide'>, today: string): Ending | null {
  const endsOn = company.endsOn
  if (!endsOn) return null
  const intakeUntil = addDays(endsOn, ENDING.intakeDays)
  return {
    phase: today <= endsOn ? 'ending' : today <= intakeUntil ? 'closing' : 'ended',
    side: company.noticeSide === 'firmony' ? 'firmony' : 'client',
    endsOn,
    intakeUntil,
    handoverBy: addDays(endsOn, ENDING.handoverDays),
    accessUntil: addDays(endsOn, ENDING.keepDays),
  }
}

/** Whether the service still runs (new invoices, a new link to the bank): until the contract's last day. */
export const serviceOpen = (company: Pick<Company, 'endsOn'>, today: string): boolean => !company.endsOn || today <= company.endsOn

/** Whether documents and payments are still taken: until ten days past the contract's last day. */
export const intakeOpen = (company: Pick<Company, 'endsOn'>, today: string): boolean => !company.endsOn || today <= addDays(company.endsOn, ENDING.intakeDays)

/** For SQL over a company aliased c, `(c.ends_on IS NULL OR c.ends_on >= ?)` bound to this day: its intake is open today. */
export const intakeFloor = (today: string): string => addDays(today, -ENDING.intakeDays)

/** Legacy cutoff helper: erasure is governed by the full five-year retention, never the access window. */
export const purgeFloor = (today: string): string => recordsFloor(today)

/** The day whose companies are past the year that waits for the client's confirmation of its archives: `c.ends_on < ?`. */
export const unconfirmedFloor = (today: string): string => addDays(today, -ENDING.unconfirmedDays)

/** The day whose companies are past the five years the law keeps their identification: `c.ends_on < ?`. */
export function recordsFloor(today: string): string {
  const y = Number(today.slice(0, 4)) - ENDING.recordsYears
  const month = Number(today.slice(5,7))
  const day = Math.min(Number(today.slice(8,10)), new Date(Date.UTC(y,month,0)).getUTCDate())
  return `${y}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`
}
