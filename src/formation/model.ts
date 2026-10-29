// The formation case of a client (G4) was taken out on 26 October 2026: formation is free help outside the contract, and
// the s. r. o. for 1 € has its own flow (src/founding/). What stays here is what the deployed schema step 80 reads.

const FORMATION_STEPS = {
  documents: 'Zakladateľská listina / spoločenská zmluva',
  license: 'Oprávnenie na podnikanie (živnosť)',
  capital: 'Základné imanie a bankový účet',
  register: 'Zápis do Obchodného registra',
  tax: 'Registrácia na daňovom úrade (DIČ)',
  insurance: 'Registrácia do poisťovní',
  vat: 'Registrácia pre DPH (ak treba)',
} as const

export const STEP_KEYS = Object.keys(FORMATION_STEPS) as (keyof typeof FORMATION_STEPS)[]
