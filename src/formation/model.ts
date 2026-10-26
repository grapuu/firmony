// Company formation (založenie s.r.o.) coordinated by the existing service, like the managed handover. The code
// coordinates; the legal formation itself is done by a person/lawyer. It never claims an automatic registration.
// Legal sources are opened and cited when the feature is wired into the routes and tests, as the handover does.

export const FORMATION_CONSENT_VERSION = '2026-10-22'
// The formation case of a client (G4) was taken out on 26 October 2026 (formation is free help, outside the contract);
// what stays here is what the deployed schema step 80 reads.

export const FORMATION_STATES = {
  requested: 'Žiadosť sme prijali',
  preparing: 'Pripravujeme dokumenty',
  waiting: 'Čakáme na Vás',
  registering: 'Zapisujeme do registra',
  completed: 'Firma je zapísaná',
  cancelled: 'Žiadosť je zrušená',
} as const
export type FormationState = keyof typeof FORMATION_STATES

export const FORMATION_STEPS = {
  documents: 'Zakladateľská listina / spoločenská zmluva',
  license: 'Oprávnenie na podnikanie (živnosť)',
  capital: 'Základné imanie a bankový účet',
  register: 'Zápis do Obchodného registra',
  tax: 'Registrácia na daňovom úrade (DIČ)',
  insurance: 'Registrácia do poisťovní',
  vat: 'Registrácia pre DPH (ak treba)',
} as const
export type FormationStep = keyof typeof FORMATION_STEPS

export interface FormationStepState { result: 'pending' | 'received' | 'not_applicable'; note: string }
export type FormationSteps = Record<FormationStep, FormationStepState>

export const STEP_KEYS = Object.keys(FORMATION_STEPS) as FormationStep[]
export const emptySteps = (): FormationSteps => Object.fromEntries(STEP_KEYS.map(k => [k, { result: 'pending', note: '' }])) as FormationSteps
export const isFormationState = (value: string): value is FormationState => Object.hasOwn(FORMATION_STATES, value)

export function mayMove(from: FormationState, to: FormationState): boolean {
  if (from === 'cancelled') return false
  if (to === 'cancelled') return true
  if (from === to) return from !== 'completed'
  return ({ requested: ['preparing', 'registering'], preparing: ['waiting', 'registering'], waiting: ['preparing', 'registering'], registering: ['waiting', 'completed'], completed: ['registering'], cancelled: [] } as Record<FormationState, FormationState[]>)[from].includes(to)
}

export const formationDay = (value: string) => /^20\d{2}-(0[1-9]|1[0-2])-([012]\d|3[01])$/.test(value) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value
export const formationEmail = (value: string) => value.length <= 254 && /^[A-Za-z0-9._%+-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)*\.[A-Za-z]{2,}$/.test(value)
export const formationText = (value: unknown, max: number) => typeof value === 'string' && value.length <= max && !/[\u0000-\u0008\u000b-\u001f\u007f\u202a-\u202e\u2066-\u2069]/.test(value) ? value.trim() : null

export interface FormationRequestValues { name: string; email: string; idea: string }
export function requestErrors(v: FormationRequestValues, consent: boolean): string[] {
  const e: string[] = []
  if (!formationText(v.name, 120) || v.name.trim().length < 2) e.push('Doplňte meno a priezvisko kontaktnej osoby.')
  if (!formationEmail(v.email)) e.push('Doplňte platný e-mail bez medzier.')
  if (!formationText(v.idea, 1000)) e.push('Stručne opíšte predmet činnosti firmy.')
  if (!consent) e.push('Prečítajte si rozsah koordinácie a potvrďte žiadosť.')
  return e
}

export function stepsFrom(body: Record<string, unknown>): FormationSteps {
  return Object.fromEntries(STEP_KEYS.map(k => {
    const result = body[`krok_${k}`]
    return [k, { result: result === 'received' || result === 'not_applicable' ? result : 'pending', note: formationText(body[`poznamka_${k}`], 1000) ?? '' }]
  })) as FormationSteps
}
