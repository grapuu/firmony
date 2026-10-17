// Dávka 514, UTF-8 text interface in the MZ SR 2026 specification. Never infer an insured identifier.
import { dayOfText } from '../app/booking'
import { isIban, plainIban } from '../app/invoices'
import { monthDays, supportsPayrollPeriod } from '../app/payroll'
import { isInsurer } from '../app/payroll-store'
import { isMonth, nextMonth } from './model'

export const HEALTH_FORMAT = 'ZP514-TXT-2026'
export const HEALTH_SPEC_SHA256 = 'fc1cce5f760582ceb52ab29a040ae22863b24959d5c8b6ea53639e14073f184d'
// Keep verified historical rates independent of a future change to the payroll calculator's defaults.
const REPORT_RATES = {2026:{employee:500,employer:1100},2027:{employee:500,employer:1100}} as const
const ratesOf = (period:string) => {const year=Number(period.slice(0,4));return year===2026||year===2027?REPORT_RATES[year]:null}
export const healthKind = (v: string) => /^health(?:24|25|27)$/.test(v)
export interface HealthRow {
  employeeId: string; name: string; days: number; gross: number; base: number; deduction: number
  employee: number; employer: number; topUp: number; disabled: boolean; exempt: boolean
}
export interface HealthTotals { rows: HealthRow[]; allEmployees: number; gross: number; employee: number; employer: number; total: number; issues: string[] }
const cents = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0 && (v as number) <= 999_999_999_999
export function healthTotals(period: string, kind: string, json: string, today: string): HealthTotals {
  const issues = new Set<string>(), rows: HealthRow[] = [], ids = new Set<string>()
  const rates=ratesOf(period)
  if (!healthKind(kind) || !isMonth(period) || !supportsPayrollPeriod(period) || !rates) issues.add('Pre toto obdobie alebo príjemcu nemáme overený formát zdravotného výkazu.')
  if (period >= today.slice(0,7)) issues.add('Výkaz pripravte až po skončení vykazovaného mesiaca.')
  let lines: unknown; try { lines = JSON.parse(json) } catch { lines = null }
  if (!Array.isArray(lines) || !lines.length) issues.add('Chýbajú úplné uložené výplatné pásky.')
  for (const l of Array.isArray(lines) ? lines : []) {
    if (!l || typeof l.employeeId !== 'string' || !l.employeeId || ids.has(l.employeeId) || !isInsurer(l.insurer)) { issues.add('Zamestnanci v uzávierke sú neúplní alebo sa opakujú.'); continue }
    ids.add(l.employeeId)
    if (`health${l.insurer}` !== kind) continue
    if (!rates) continue
    const s = l.slip, h = l.health
    if (!h || ['disabled','minimumExempt','deductionClaimed'].some((k) => typeof h[k] !== 'boolean')) { issues.add('V staršej uzávierke nie sú uložené režimy zdravotného poistenia. Použite odborne pripravený externý výkaz; historickú mzdu neprepočítavame.'); continue }
    if (!s || s.period !== period || s.rulesYear !== Number(period.slice(0,4)) || ![l.gross,s.gross,s.healthDeduction,s.healthTopUp,s.healthEmployee,s.healthEmployer].every(cents) || s.gross !== l.gross || !Number.isInteger(l.days) || l.days < 1 || l.days > monthDays(period) || s.healthDeduction > s.gross || s.healthTopUp > s.healthEmployee || !h.deductionClaimed && s.healthDeduction !== 0 || (h.disabled || h.minimumExempt) && s.healthTopUp !== 0) { issues.add('Uzavretá páska nemá konzistentné sumy, dni alebo režim zdravotného poistenia.'); continue }
    const divisor = h.disabled ? 2 : 1
    if (Math.floor(s.gross * rates.employer / divisor / 10000 + 1e-9) !== s.healthEmployer || Math.floor((s.gross-s.healthDeduction) * rates.employee / divisor / 10000 + 1e-9) !== s.healthEmployee-s.healthTopUp) { issues.add('Uložené odvody nezodpovedajú podporovanému bežnému pracovnému pomeru. Použite odborné spracovanie.'); continue }
    rows.push({ employeeId:l.employeeId, name:typeof l.name === 'string' ? l.name : 'Zamestnanec', days:l.days, gross:s.gross, base:s.gross-s.healthDeduction, deduction:s.healthDeduction, employee:s.healthEmployee, employer:s.healthEmployer, topUp:s.healthTopUp, disabled:h.disabled, exempt:h.minimumExempt || h.disabled })
  }
  if (!rows.length) issues.add('V podkladoch chýbajú podporovaní zamestnanci tejto poisťovne.')
  const sum = (k: 'gross'|'employee'|'employer') => rows.reduce((a,r)=>a+r[k],0)
  const gross=sum('gross'), employee=sum('employee'), employer=sum('employer'), total=employee+employer
  if (![gross,employee,employer,total].every(cents) || rows.length > 999999 || ids.size > 9999999) issues.add('Úhrny prekračujú podporované limity textového rozhrania.')
  return { rows, allEmployees:ids.size, gross, employee, employer, total, issues:[...issues] }
}
export interface HealthInput {
  name: string; dic: string; payer: string; branch: string; iban: string; phone: string; email: string
  sendOn: string; batch: string; kind: string; reason: string; reference: string; checked: boolean
}
export function healthInputError(v: HealthInput, period: string, targetKind: string, today: string, company: { name:string; ico:string|null; dic:string|null }, replacing: boolean): string | null {
  if (!company.ico || !/^\d{8}$/.test(company.ico) || v.name !== company.name || !v.name || v.name.length > 80) return 'Overte obchodné meno a osemmiestne IČO slovenskej s. r. o.; údaje neskracujeme odhadom.'
  if (!/^\d{10}$/.test(v.payer) || !/^\d{4}$/.test(v.branch) || v.branch.slice(0,2) !== targetKind.slice(-2)) return 'Overte desaťmiestne číslo platiteľa a štvormiestny kód správnej poisťovne a pobočky.'
  if (v.dic && !/^\d{10}$/.test(v.dic) || company.dic && v.dic !== company.dic || !isIban(v.iban)) return 'Skontrolujte DIČ a vlastný IBAN zamestnávateľa. Neuvádzajte príjmový účet poisťovne.'
  if ([v.name,v.phone,v.email].some((s)=>/[|\p{Cc}\p{Cs}\uFFFE\uFFFF]/u.test(s)) || v.phone && !/^\+421\d{9}$/.test(v.phone) || v.email.length > 75 || v.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)) return 'Skontrolujte kontakt; text nesmie obsahovať oddeľovač dávky ani riadiace znaky.'
  if (!['N','O'].includes(v.kind) || !/^\d{1,6}$/.test(v.batch) || Number(v.batch) < 1 || !v.sendOn || dayOfText(v.sendOn) !== v.sendOn || v.sendOn > today || v.sendOn < `${nextMonth(period)}-01`) return 'Zvoľte novú alebo opravnú dávku, jej poradové číslo a platný dátum po skončení obdobia.'
  if (!v.checked || v.reference.trim().length < 12 || v.reference.length > 240 || v.reason.length > 1200 || replacing && v.reason.trim().length < 12) return 'Potvrďte úplnosť bežných miezd a referenciu odbornej kontroly. Ďalšia verzia potrebuje dôvod aspoň 12 znakov.'
  return null
}
export const insuredId = (v: string) => /^\d{9,10}$/.test(v)
export const healthFilename = (period: string, kind: string) => `${kind}514${period.slice(2,4)}${period.slice(5)}.001`
const money = (v: number) => `${Math.floor(v/100)},${String(v%100).padStart(2,'0')}`
const line = (items: (string|number)[]) => `${items.join('|')}|\r\n`
export function healthText(period: string, totals: HealthTotals, v: HealthInput, ico: string, payday: string, identifiers: ReadonlyMap<string,string>): string {
  const rates=ratesOf(period)
  if (!rates || totals.issues.length || totals.rows.some((r)=>!insuredId(identifiers.get(r.employeeId) ?? ''))) throw new Error('Unsupported health report source')
  const group = (disabled: boolean) => totals.rows.filter((r)=>r.disabled===disabled)
  const sum = (disabled: boolean, key: 'days'|'gross'|'base'|'employee'|'employer') => group(disabled).reduce((a,r)=>a+r[key],0)
  let text = line([v.kind,514,ico,v.payer,v.branch,v.sendOn.replaceAll('-',''),Number(v.batch),totals.rows.length,1,1])
  text += line([period.replace('-',''),Number(payday.slice(8)),v.name,ico,v.payer,v.dic,v.phone,'',v.email,'','','',plainIban(v.iban)])
  text += line([totals.rows.length,money(rates.employer),money(rates.employee),money(rates.employer/2),money(rates.employee/2),group(false).length,group(true).length,sum(false,'days'),sum(true,'days'),money(sum(false,'gross')),money(sum(true,'gross')),money(sum(false,'base')),money(sum(true,'base')),money(sum(false,'employer')),money(sum(false,'employee')),money(sum(true,'employer')),money(sum(true,'employee')),money(totals.total),'PO',totals.allEmployees])
  for (const [i,r] of totals.rows.entries()) text += line([i+1,identifiers.get(r.employeeId)!,r.days,money(rates.employer/(r.disabled?2:1)),money(rates.employee/(r.disabled?2:1)),money(r.gross),money(r.base),money(r.employer),money(r.employee-r.topUp),money(r.employer+r.employee),money(r.gross),'0,00',money(r.deduction),'','',r.exempt?1:0,money(r.topUp)])
  return text
}
