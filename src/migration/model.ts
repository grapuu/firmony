// Managed handover coordinates the existing service. It does not terminate the old contract or validate a signature.
// Originals read 22 October 2026: Civil Code §§31-33b,40 (current since 31 July):
// https://static.slov-lex.sk/static/SK/ZZ/1964/40/20260731.html
// Accounting Act §§5,8: https://static.slov-lex.sk/static/SK/ZZ/2002/431/20260601.html
export const HANDOVER_CONSENT_VERSION = '2026-10-22'
export const HANDOVER_CONSENT = 'Žiadam Firmony o koordináciu prevzatia účtovníctva mojej firmy. Súhlasím, aby kontaktovalo uvedenú účtovníčku, dohodlo rozsah a bezpečný spôsob odovzdania podkladov a priebežne ma informovalo. Potvrdzujem, že túto žiadosť zadávam za firmu oprávnene. Žiadosť sama neukončuje doterajšiu zmluvu a nenahrádza osobitné plnomocenstvo ani podpis, ak sú potrebné. Pred úkonom v mene firmy Firmony overí potrebné oprávnenie. Koordináciu môžem odvolať; vykonané úkony a zákonná evidencia zostávajú zachované.'

export const HANDOVER_STATES = {
  requested: 'Žiadosť sme prijali',
  coordinating: 'Dohadujeme prevzatie',
  waiting: 'Čakáme na podklady',
  reviewing: 'Kontrolujeme prevzaté údaje',
  completed: 'Prevzatie je skontrolované',
  cancelled: 'Koordinácia je odvolaná',
} as const
export type HandoverState = keyof typeof HANDOVER_STATES
export const CHECK_AREAS = {
  books: 'Účtovné knihy a obratová predvaha',
  items: 'Pohľadávky a záväzky',
  bank: 'Banka, pokladnica a zostatky',
  assets: 'Majetok, odpisy a zásoby',
  payroll: 'Zamestnanci a mzdy',
  filings: 'Podania, závierky a potvrdenia',
  opening: 'Počiatočné stavy a nadväznosť knihy',
} as const
export type CheckArea = keyof typeof CHECK_AREAS
export interface HandoverCheck { result: 'pending' | 'received' | 'not_applicable'; file: string; note: string }
export type HandoverChecks = Record<CheckArea, HandoverCheck>
export const AREA_KEYS = Object.keys(CHECK_AREAS) as CheckArea[]
export const emptyChecks = (): HandoverChecks => Object.fromEntries(AREA_KEYS.map(k => [k, { result: 'pending', file: '', note: '' }])) as HandoverChecks
export const isHandoverState = (value: string): value is HandoverState => Object.hasOwn(HANDOVER_STATES, value)
export function mayMove(from: HandoverState, to: HandoverState): boolean {
  if (from === 'cancelled') return false
  if (to === 'cancelled') return true
  if (from === to) return from !== 'completed'
  return ({ requested: ['coordinating'], coordinating: ['waiting'], waiting: ['reviewing', 'coordinating'], reviewing: ['waiting', 'completed', 'coordinating'], completed: ['reviewing'], cancelled: [] } as Record<HandoverState, HandoverState[]>)[from].includes(to)
}
export const handoverDay = (value: string) => /^20\d{2}-(0[1-9]|1[0-2])-([012]\d|3[01])$/.test(value) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value
export const handoverEmail = (value: string) => value.length <= 254 && /^[A-Za-z0-9._%+-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)*\.[A-Za-z]{2,}$/.test(value)
export const handoverText = (value: unknown, max: number) => typeof value === 'string' && value.length <= max && !/[\u0000-\u0008\u000b-\u001f\u007f\u202a-\u202e\u2066-\u2069]/.test(value) ? value.trim() : null
export interface HandoverRequestValues { name: string; email: string; day: string }
export function requestErrors(v: HandoverRequestValues, consent: boolean): string[] {
  const e: string[] = []
  if (!handoverText(v.name, 120) || v.name.trim().length < 2) e.push('Doplňte meno alebo názov doterajšej účtovnej kancelárie.')
  if (!handoverEmail(v.email)) e.push('Doplňte platný e-mail účtovníčky bez medzier.')
  if (v.day && !handoverDay(v.day)) e.push('Vyberte platný dátum požadovaného prevzatia.')
  if (!consent) e.push('Prečítajte si rozsah koordinácie a potvrďte žiadosť.')
  return e
}
export function checksFrom(body: Record<string, unknown>): HandoverChecks {
  return Object.fromEntries(AREA_KEYS.map(k => {
    const result = body[`stav_${k}`]
    return [k, { result: result === 'received' || result === 'not_applicable' ? result : 'pending', file: handoverText(body[`subor_${k}`], 64) ?? '', note: handoverText(body[`poznamka_${k}`], 1000) ?? '' }]
  })) as HandoverChecks
}
