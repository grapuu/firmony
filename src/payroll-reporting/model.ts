// Monthly regular payroll only. Reporting periods and evidence are separate from planned payment instructions.
import { dayOfText } from '../app/booking'
import { addDays } from '../app/ending'
import { monthDays } from '../app/payroll'
import { workingDayFrom } from '../app/vat'
import { DELIVERY_LABELS, type DeliveryStatus, type DeliveryState } from '../filings/model'

export const REPORT_KINDS = {
  sp: 'Mesačný výkaz pre Sociálnu poisťovňu',
  health24: 'Mesačný výkaz pre Dôveru',
  health25: 'Mesačný výkaz pre VšZP',
  health27: 'Mesačný výkaz pre Union',
  tax: 'Mesačný prehľad pre finančnú správu',
} as const
export const REPORT_LABELS = { ...DELIVERY_LABELS, accepted: 'Prijatie príjemcom doložené', rejected: 'Príjemca výkaz odmietol' }
export type ReportKind = keyof typeof REPORT_KINDS
export const isReportKind = (v: unknown): v is ReportKind => typeof v === 'string' && Object.hasOwn(REPORT_KINDS, v)
export const isMonth = (v: unknown): v is string => typeof v === 'string' && /^(20\d{2})-(0[1-9]|1[0-2])$/.test(v)
export const nextMonth = (month: string) => month.slice(5) === '12' ? `${Number(month.slice(0, 4)) + 1}-01` : `${month.slice(0, 4)}-${String(Number(month.slice(5)) + 1).padStart(2, '0')}`
export const taxReportDue = (reportMonth: string) => { const n = nextMonth(reportMonth); return workingDayFrom(`${n}-${monthDays(n)}`) }
// Conservative operational dates: do not extend an insurer's filing date using tax-procedure rules.
export const reportDue = (kind: ReportKind, payday: string) => kind === 'tax' ? taxReportDue(payday.slice(0, 7)) : kind === 'sp' ? payday : addDays(payday, 3)
export interface Closure {
  id: string; company_id: string; period: string; payday: string; lines: string; source_json: string; sha256: string
  created_at: number; created_by: string; closed_at: number
}
export interface Payout {
  id: string; closure_id: string; company_id: string; revision: number; paid_on: string; reference: string; reason: string; at: number; by_user: string
  report_period: string | null
  by_name?: string | null
}
export interface ReportTarget {
  id: string; company_id: string; kind: ReportKind; period: string; due_on: string; closure_id: string | null
  package_id: string | null; revision: number; created_at: number; updated_by: string
}
export interface ReportPackage {
  id: string; target_id: string; company_id: string; previous_id: string | null; reason: string; variant: string
  name: string; file_key: string; file_type: string; file_bytes: number; sha256: string; source_json: string; source_hash: string
  status: DeliveryState; revision: number; created_at: number; created_by: string; updated_at: number; updated_by: string; last_event: string | null
}
export interface ReportItem extends ReportTarget {
  status: DeliveryStatus; sourceChanged: boolean; active: boolean; pkg: ReportPackage | null
}
export interface PayrollReportFact { id: string; kind: ReportKind; period: string; due: string; status: DeliveryStatus; sourceChanged: boolean }
export function requiredInsurers(lines: unknown): string[] | null {
  if (!Array.isArray(lines) || lines.length === 0) return null
  if (lines.some((l) => !l || typeof l !== 'object' || !['24', '25', '27'].includes(l.insurer) || !l.slip || typeof l.slip !== 'object' || !Number.isSafeInteger(l.gross) || l.gross < 0)) return null
  return [...new Set<string>(lines.map((l) => l.insurer))].sort()
}
export interface PayoutInput { paidOn: string; reportPeriod: string; reference: string; reason: string; checked: boolean; revision: number }
export function payoutError(value: PayoutInput, current: number, admin: boolean, today: string, period: string): string | null {
  if (value.revision !== current) return 'Evidencia výplaty sa medzitým zmenila. Obnovte stránku.'
  if (current > 0 && !admin) return 'Opravu potvrdeného dátumu musí vykonať správca s uvedením dôvodu.'
  if (value.paidOn !== dayOfText(value.paidOn) || !value.paidOn || value.paidOn > today || value.paidOn < `${period}-01`) return 'Zadajte skutočný dátum vyplatenia, ktorý nie je v budúcnosti.'
  if (!isMonth(value.reportPeriod) || value.reportPeriod < period || value.reportPeriod > value.paidOn.slice(0, 7)) return 'Samostatne potvrďte vykazované obdobie prehľadu FS podľa skutočného účtovného prípadu.'
  if (!value.checked || value.reference.trim().length < 12 || value.reference.length > 240) return 'Doplňte referenciu overenia a potvrďte vyplatenie všetkých príjmov tejto uzávierky.'
  if (value.reason.length > 1200 || current > 0 && value.reason.trim().length < 12) return 'Pri oprave uveďte dôvod, aspoň 12 znakov.'
  return null
}
export const payrollBlocked = (error: unknown): boolean => {
  const seen = new Set<unknown>(); let e = error
  while (e && !seen.has(e)) { seen.add(e); if (String(e).includes('FIRMONY_PAYROLL_REPORTED')) return true; e = typeof e === 'object' && 'cause' in e ? e.cause : null }
  return false
}
