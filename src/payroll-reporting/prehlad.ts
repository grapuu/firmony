// PREHLADv26: ordinary regular wages only. XSD and the official eForm mapper are pinned in docs/security/payroll-generation.md.
import { OPERATOR } from '../config'
import { dayOfText } from '../app/booking'
import { addressParts, amount } from '../app/vat-xml'
import { isMonth, nextMonth } from './model'

export const PREHLAD_FORMAT = 'PREHLADv26'
export const PREHLAD_XSD_SHA256 = 'df44ab4383bf2900967eb57a2114622e6ec429bd828e1f7394292c0948dcc2ba'
export interface PrehladSource { id: string; period: string; lines: string; paid_on: string; report_period: string | null }
export interface PrehladTotals { gross: number; advance: number; paidOn: string; employees: number; issues: string[] }
const money = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0
export function prehladTotals(period: string, sources: PrehladSource[], today: string): PrehladTotals {
  const issues = new Set<string>(), seen = new Set<string>(), employees = new Set<string>()
  let gross = 0, advance = 0, paidOn = ''
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
      if (!line || typeof line.employeeId !== 'string' || employees.has(line.employeeId) || !s || s.period !== source.period || s.rulesYear !== Number(source.period.slice(0, 4)) || ![line.gross, s.gross, s.advance, s.withheld, s.socialEmployee, s.healthEmployee, s.net, s.bonus].every(money) || s.gross !== line.gross || s.net !== s.gross - s.socialEmployee - s.healthEmployee - s.withheld) { issues.add('Uložená výplatná páska nemá úplné a konzistentné podklady.'); continue }
      employees.add(line.employeeId)
      if (s.bonus !== 0 || s.withheld !== s.advance) issues.add('Daňový bonus alebo ďalšie úpravy dane zatiaľ pripravte v externom mzdovom nástroji.')
      gross += s.gross; advance += s.advance
    }
  }
  if (!money(gross) || gross <= 0 || gross > 99_999_999_999 || !money(advance) || advance > 9_999_999_999) issues.add('Úhrny nezodpovedajú podporovanému rozsahu formulára.')
  return { gross, advance, paidOn, employees: employees.size, issues: [...issues] }
}
export interface PrehladInput {
  dic: string; name: string; street: string; number: string; postal: string; city: string
  preparedBy: string; phone: string; email: string; declaredOn: string; kind: string; foundOn: string
  representation: string; reason: string; reference: string; checked: boolean
}
export function prehladInputError(v: PrehladInput, period: string, today: string, company: { name: string; dic: string | null }, hasPoa: boolean, replacing: boolean): string | null {
  if (!/^\d{10}$/.test(v.dic) || company.dic && v.dic !== company.dic) return 'Overte DIČ tejto spoločnosti. Existujúce DIČ nemožno týmto formulárom nahradiť inou firmou.'
  const fields = [[v.name,111],[v.street,30],[v.number,11],[v.city,60],[v.preparedBy,100],[v.phone,13],[v.email,254]] as const
  if (fields.some(([s, max]) => s.length > max || /[\p{Cc}\p{Cs}]/u.test(s)) || v.name !== company.name || !v.name.trim() || !v.city.trim() || !v.preparedBy.trim() || !/^\d{5}$/.test(v.postal)) return 'Skontrolujte obchodné meno, úplnú adresu a vypracovateľa. Údaje neskracujeme ani nedopĺňame odhadom.'
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
export function prehladXml(period: string, totals: PrehladTotals, v: PrehladInput): string {
  if (totals.issues.length) throw new Error('Unsupported payroll overview source')
  const representativeAddress = addressParts(`${OPERATOR.street}, ${OPERATOR.postalCity}`)
  const poa = v.representation === 'firmony'
  const header = [el('dic',v.dic), group('druhPrehladu',[el('riadny',v.kind==='R'?'1':'0'),el('opravny',v.kind==='O'?'1':'0')]), group('zdanovacieObdobie',[el('mesiac',period.slice(5)),el('rok',period.slice(0,4))]),el('datumZisteniaOP',date(v.foundOn)),group('fo',empty(['priezvisko','meno','titul','titulZa'])),group('po',[el('obchodneMeno',v.name),el('pravnaForma','112')]),group('sidlo',[el('ulica',v.street),el('cislo',v.number),el('psc',v.postal),el('obec',v.city),el('stat','Slovenská republika')]),group('podava',[...empty(['priezvisko','meno','titul','titulZa','rodneCislo','datumNarodenia']),el('dic',poa?OPERATOR.taxId:''),el('obchodneMeno',poa?OPERATOR.name:''),el('pravnaForma',poa?'112':''),el('ulica',poa?representativeAddress.street:''),el('cislo',poa?representativeAddress.number:''),el('psc',poa?representativeAddress.postal:''),el('obec',poa?representativeAddress.city:''),el('stat',poa?OPERATOR.country:'')]),el('tel',v.phone),el('email',v.email)]
  const body = [group('cast1',[el('r00',amount(totals.gross)),group('r01',[el('datum',date(totals.paidOn)),el('suma',amount(totals.advance))]),group('r01a',empty(['mesiacRok','suma'])),...empty(['r01b','r02','r03']),el('r04',amount(totals.advance)),...empty(['r05','r06','r07']),el('r08',amount(totals.advance)),el('r08b','0')]),group('cast2',empty(['rA','rB','rC','rD','rE','rF'])),group('cast3',[...['poukazatBonus','poukazatPremiu','poukazatBonusNaUroky'].map((tag)=>group(tag,[el('ziadam','0'),el('suma')])),group('sposobPlatby',[el('poukazka','0'),el('ucet','0')]),el('IBAN')])]
  return `<?xml version="1.0" encoding="UTF-8"?>\n${group('dokument',[group('hlavicka',header),group('telo',body),group('vyhotovil',[el('meno',v.preparedBy),el('tel',v.phone),el('datumVyhotovenia',date(v.declaredOn))])])}\n`
}
