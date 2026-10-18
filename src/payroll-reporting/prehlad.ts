// PREHLADv26: the month's taxable income paid (wages and sick pay of every relationship), the advances withheld, the
// child bonus (row 05 at most row 04; the rest paid from the employer's own money, section II) and, once the annual
// settlement lands, its result. XSD and the official eForm mapper are pinned in docs/security/payroll-generation.md;
// the rows as the poučenie to PREHLADv26 has them (r04 = r01 + r02 + r03, r08 = r04 - r05 - r06 - r07).
import { OPERATOR } from '../config'
import { dayOfText } from '../app/booking'
import { addressParts, amount } from '../app/vat-xml'
import { isMonth, nextMonth } from './model'

export const PREHLAD_FORMAT = 'PREHLADv26'
export const PREHLAD_XSD_SHA256 = 'df44ab4383bf2900967eb57a2114622e6ec429bd828e1f7394292c0948dcc2ba'
export interface PrehladSource { id: string; period: string; lines: string; paid_on: string; report_period: string | null }
export interface PrehladTotals {
  /** Row 00: the taxable income paid; row 01: the advances withheld (before the bonus). */
  gross: number; advance: number; paidOn: string; employees: number; issues: string[]
  /** The child bonus of the month: the whole (row A), what the advances bear (row 05 and row B), what the employer pays of its own (row C). */
  bonus: number; bonusFromTax: number; bonusOwn: number
  /** Row 02: the annual settlements settled in the month (underpayments plus, overpayments minus), at most the advances down; what the advances cannot bear the employer pays of its own and asks the tax office for (§ 40(8)). */
  settlement: number; settlementOwn: number
}
const money = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0
export function prehladTotals(period: string, sources: PrehladSource[], today: string): PrehladTotals {
  const issues = new Set<string>(), seen = new Set<string>(), employees = new Set<string>()
  let gross = 0, advance = 0, paidOn = '', bonus = 0, settled = 0
  if (!isMonth(period) || ![2026, 2027].includes(Number(period.slice(0, 4)))) issues.add('Pre toto obdobie nemáme overený formulár PREHLADv26.')
  if (period >= today.slice(0, 7)) issues.add('Prehľad pripravte až po skončení vykazovaného mesiaca.')
  if (!sources.length) issues.add('Chýbajú vyplatené príjmy s odborne potvrdeným vykazovaným obdobím.')
  for (const source of sources) {
    if (seen.has(source.id)) { issues.add('Zdrojová uzávierka sa opakuje. Obnovte podklady.'); continue }
    seen.add(source.id)
    if (source.period !== period || source.report_period !== period || !source.paid_on || source.paid_on !== dayOfText(source.paid_on) || source.paid_on > today || source.paid_on.slice(0, 7) < period || source.paid_on.slice(0, 7) > nextMonth(period)) issues.add('Doplatky a neštandardné priradenie obdobia potrebujú osobitné odborné spracovanie.')
    if (source.paid_on > paidOn) paidOn = source.paid_on
    let lines: unknown; try { lines = JSON.parse(source.lines) } catch { lines = null }
    if (!Array.isArray(lines) || !lines.length) { issues.add('Uzávierka nemá úplné uložené výplatné pásky.'); continue }
    for (const line of lines) {
      const s = line?.slip
      const sick = s?.sickPay === undefined ? 0 : s.sickPay
      const st = s?.settlementTax === undefined ? 0 : s.settlementTax, sb = s?.settlementBonus === undefined ? 0 : s.settlementBonus
      // Meals (meals.ts) are neither taxed nor insured: a voucher's part the employee pays comes off the net, a financial contribution is paid with it.
      const me = s?.meals === undefined ? 0 : s.meals?.employee, mc = s?.meals === undefined ? 0 : s.meals?.cash
      if (!line || typeof line.employeeId !== 'string' || employees.has(line.employeeId) || !s || s.period !== source.period || s.rulesYear !== Number(source.period.slice(0, 4)) || ![line.gross, s.gross, sick, s.advance, s.socialEmployee, s.healthEmployee, s.net, s.bonus, me, mc].every(money) || ![s.withheld, st, sb].every(Number.isSafeInteger) || s.gross !== line.gross || s.withheld !== s.advance - s.bonus || s.net !== s.gross + sick - s.socialEmployee - s.healthEmployee - s.withheld - st + sb - me + mc) { issues.add('Uložená výplatná páska nemá úplné a konzistentné podklady.'); continue }
      employees.add(line.employeeId)
      gross += s.gross + sick; advance += s.advance; bonus += s.bonus + sb; settled += st
    }
  }
  if (!money(gross) || gross <= 0 || gross > 99_999_999_999 || !money(advance) || advance > 9_999_999_999 || bonus > 9_999_999_999) issues.add('Úhrny nezodpovedajú podporovanému rozsahu formulára.')
  if (bonus < 0) issues.add('Vrátenie daňového bonusu z ročného zúčtovania prevyšuje bonusy mesiaca. Prehľad pripravte odborne.')
  const settlement = Math.max(settled, -advance)
  const total = advance + settlement
  const bonusFromTax = Math.max(0, Math.min(bonus, total))
  return { gross, advance, paidOn, employees: employees.size, issues: [...issues], bonus, bonusFromTax, bonusOwn: bonus - bonusFromTax, settlement, settlementOwn: settlement - settled }
}
export interface PrehladInput {
  dic: string; name: string; street: string; number: string; postal: string; city: string
  preparedBy: string; phone: string; email: string; declaredOn: string; kind: string; foundOn: string
  representation: string; reason: string; reference: string; checked: boolean
}
export function prehladInputError(v: PrehladInput, period: string, today: string, company: { name: string; dic: string | null }, hasPoa: boolean, replacing: boolean): string | null {
  if (!/^\d{10}$/.test(v.dic) || company.dic && v.dic !== company.dic) return 'Overte DIČ tejto spoločnosti. Existujúce DIČ nemožno týmto formulárom nahradiť inou firmou.'
  const fields = [[v.name,111],[v.street,30],[v.number,11],[v.city,60],[v.preparedBy,100],[v.phone,13],[v.email,254]] as const
  if (fields.some(([s, max]) => s.length > max || /[\p{Cc}\p{Cs}\uFFFE\uFFFF]/u.test(s)) || v.name !== company.name || !v.name.trim() || !v.city.trim() || !v.preparedBy.trim() || !/^\d{5}$/.test(v.postal)) return 'Skontrolujte obchodné meno, úplnú adresu a vypracovateľa. Údaje neskracujeme ani nedopĺňame odhadom.'
  if (v.phone && !/^(?:\+\d{8,12}|\d{7,12}|\d{2,5}\/\d{5,9})$/.test(v.phone) || v.email && !/^[^\s@]{1,64}@[^\s@]+\.[^\s@]+$/.test(v.email)) return 'Skontrolujte kontaktný telefón a e-mail.'
  if (!['R','O'].includes(v.kind) || !v.declaredOn || v.declaredOn !== dayOfText(v.declaredOn) || v.declaredOn > today || v.declaredOn < `${nextMonth(period)}-01`) return 'Zvoľte druh prehľadu a platný dátum vypracovania po skončení obdobia.'
  if (v.kind === 'O' ? !v.foundOn || v.foundOn !== dayOfText(v.foundOn) || v.foundOn > v.declaredOn || v.foundOn < `${period}-01` : Boolean(v.foundOn)) return 'Pri opravnom prehľade zadajte platný dátum zistenia; pri riadnom ho nechajte prázdny.'
  if (!['company','firmony'].includes(v.representation) || v.representation === 'firmony' && !hasPoa) return 'Určite, kto podáva prehľad. Zastúpenie europio vyžaduje skontrolovanú plnú moc.'
  if (!v.checked || v.reference.trim().length < 12 || v.reference.length > 240) return 'Potvrďte podporovaný rozsah, všetky príjmy a neprítomnosť ďalších úprav; uveďte referenciu odbornej kontroly.'
  if (v.reason.length > 1200 || replacing && v.reason.trim().length < 12) return 'Pri ďalšej verzii uveďte dôvod, aspoň 12 znakov.'
  return null
}
const esc = (v: string) => v.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
const el = (tag: string, v = '') => `<${tag}>${esc(v)}</${tag}>`
const group = (tag: string, parts: string[]) => `<${tag}>${parts.join('')}</${tag}>`
const empty = (tags: string[]) => tags.map((tag) => el(tag))
const date = (v: string) => v ? `${v.slice(8,10)}.${v.slice(5,7)}.${v.slice(0,4)}` : ''
/** `legalForm` is the employer's code of the register's list (112 s. r. o., 121 a. s., 125 j. s. a.). */
export function prehladXml(period: string, totals: PrehladTotals, v: PrehladInput, legalForm = '112'): string {
  if (totals.issues.length) throw new Error('Unsupported payroll overview source')
  const representativeAddress = addressParts(`${OPERATOR.street}, ${OPERATOR.postalCity}`)
  const poa = v.representation === 'firmony'
  const header = [el('dic',v.dic), group('druhPrehladu',[el('riadny',v.kind==='R'?'1':'0'),el('opravny',v.kind==='O'?'1':'0')]), group('zdanovacieObdobie',[el('mesiac',period.slice(5)),el('rok',period.slice(0,4))]),el('datumZisteniaOP',date(v.foundOn)),group('fo',empty(['priezvisko','meno','titul','titulZa'])),group('po',[el('obchodneMeno',v.name),el('pravnaForma',legalForm)]),group('sidlo',[el('ulica',v.street),el('cislo',v.number),el('psc',v.postal),el('obec',v.city),el('stat','Slovenská republika')]),group('podava',[...empty(['priezvisko','meno','titul','titulZa','rodneCislo','datumNarodenia']),el('dic',poa?OPERATOR.taxId:''),el('obchodneMeno',poa?OPERATOR.name:''),el('pravnaForma',poa?'112':''),el('ulica',poa?representativeAddress.street:''),el('cislo',poa?representativeAddress.number:''),el('psc',poa?representativeAddress.postal:''),el('obec',poa?representativeAddress.city:''),el('stat',poa?OPERATOR.country:'')]),el('tel',v.phone),el('email',v.email)]
  const bonus = totals.bonus > 0
  const body = [group('cast1',[el('r00',amount(totals.gross)),group('r01',[el('datum',date(totals.paidOn)),el('suma',amount(totals.advance))]),group('r01a',empty(['mesiacRok','suma'])),...empty(['r01b']),el('r02',totals.settlement!==0?amount(totals.settlement):''),...empty(['r03']),el('r04',amount(totals.advance+totals.settlement)),el('r05',bonus?amount(totals.bonusFromTax):''),...empty(['r06','r07']),el('r08',amount(totals.advance+totals.settlement-totals.bonusFromTax)),el('r08b','0')]),group('cast2',[el('rA',bonus?amount(totals.bonus):''),el('rB',bonus?amount(totals.bonusFromTax):''),el('rC',bonus&&totals.bonusOwn>0?amount(totals.bonusOwn):''),...empty(['rD','rE','rF'])]),group('cast3',[...['poukazatBonus','poukazatPremiu','poukazatBonusNaUroky'].map((tag)=>group(tag,[el('ziadam','0'),el('suma')])),group('sposobPlatby',[el('poukazka','0'),el('ucet','0')]),el('IBAN')])]
  return `<?xml version="1.0" encoding="UTF-8"?>\n${group('dokument',[group('hlavicka',header),group('telo',body),group('vyhotovil',[el('meno',v.preparedBy),el('tel',v.phone),el('datumVyhotovenia',date(v.declaredOn))])])}\n`
}
