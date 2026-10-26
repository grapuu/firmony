// Act 297/2008, effective 17 August 2026, § 9(o),(p), § 12(1): citizenship and residence both matter.
// https://static.slov-lex.sk/static/SK/ZZ/2008/297/20260817.html
// EU 2016/1675, consolidated 29 January 2026, including EU 2026/46 and 2026/83.
// The Commission's primary table was checked on 21 October 2026:
// https://finance.ec.europa.eu/financial-crime/anti-money-laundering-and-countering-financing-terrorism-international-level_en
// FATF's original statements, 19 June 2026: call-for-action-june-2026.html and
// increased-monitoring-june-2026.html under https://www.fatf-gafi.org/en/publications/High-risk-and-other-monitored-jurisdictions/
// Increased monitoring alone is not the FATF high-risk list. Keep the two sets distinct.
// The lists themselves were last checked on COUNTRY_LISTS_CHECKED_ON. The policy version also changes when the way the
// lists are applied changes, so every dossier is re-evaluated under the corrected rule (26 October 2026: country codes
// only in the code fields, country names only in the fields that hold a country name, never in a street address).
export const COUNTRY_LISTS_CHECKED_ON = '2026-10-21'
export const COUNTRY_POLICY_VERSION = '2026-10-26'
export const COUNTRY_SOURCES = {
  eu: 'https://eur-lex.europa.eu/eli/reg_del/2016/1675/2026-01-29/eng',
  commission: 'https://finance.ec.europa.eu/financial-crime/anti-money-laundering-and-countering-financing-terrorism-international-level_en',
  fatfHigh: 'https://www.fatf-gafi.org/en/publications/High-risk-and-other-monitored-jurisdictions/call-for-action-june-2026.html',
  fatfMonitoring: 'https://www.fatf-gafi.org/en/publications/High-risk-and-other-monitored-jurisdictions/increased-monitoring-june-2026.html',
} as const

export const EU_HIGH_RISK_COUNTRIES = ['AF', 'DZ', 'AO', 'BO', 'VG', 'CM', 'CI', 'KP', 'CD', 'HT', 'IR', 'KE', 'LA', 'LB', 'MC', 'MM', 'NA', 'NP', 'RU', 'SS', 'SY', 'TT', 'VU', 'VE', 'VN', 'YE'] as const
export const FATF_HIGH_RISK_COUNTRIES = ['IR', 'KP', 'MM'] as const
export const FATF_MONITORING_COUNTRIES = ['AO', 'BO', 'BA', 'BG', 'CM', 'CI', 'CD', 'HT', 'IQ', 'KE', 'KW', 'LA', 'LB', 'MC', 'NP', 'PG', 'SS', 'SY', 'VE', 'VN', 'VG', 'YE'] as const
const high = new Set<string>([...EU_HIGH_RISK_COUNTRIES, ...FATF_HIGH_RISK_COUNTRIES])
const monitored = new Set<string>(FATF_MONITORING_COUNTRIES)

export const isCountryCode = (value: string): boolean => /^[A-Z]{2}$/.test(value) && !['XX', 'ZZ', 'EU'].includes(value)
export const countryCodes = (text: string): string[] => [...new Set(text.toUpperCase().split(/[\s,;]+/).filter(Boolean))]
export const validCountryCodes = (text: string): boolean => countryCodes(text).length > 0 && countryCodes(text).every(isCountryCode)
export const highRiskCountry = (code: string): boolean => high.has(code.toUpperCase())
export const monitoredCountry = (code: string): boolean => monitored.has(code.toUpperCase())

// Legacy declarations used free text for nationality and countries. Recognise clear names, but never treat
// an unrecognised text as verified geography. A professional must record the countries check in every dossier.
const normal = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const aliases: Record<string, string[]> = {
  AF: ['Afganistan', 'Afghanistan', 'afganska'], DZ: ['Alzirsko', 'Algeria', 'alzirska'], AO: ['Angola', 'angolska'],
  BO: ['Bolivia', 'bolivijska'], VG: ['Britske Panenske ostrovy', 'British Virgin Islands'], CM: ['Kamerun', 'Cameroon', 'kamerunska'],
  CI: ['Pobrezie Slonoviny', 'Cote d Ivoire'], KP: ['Severna Korea', 'North Korea', 'Korean Democratic People s Republic', 'KLDR'],
  CD: ['Konžská demokratická republika', 'Democratic Republic of the Congo', 'DR Congo'], HT: ['Haiti', 'haitska'],
  IR: ['Iran', 'iranska', 'Iranian'], KE: ['Kena', 'Kenya', 'kenska'], LA: ['Laos', 'Lao PDR'], LB: ['Libanon', 'Lebanon', 'libanonska'],
  MC: ['Monako', 'Monaco'], MM: ['Mjanmarsko', 'Myanmar', 'Burma'], NA: ['Namibia', 'namibijska'], NP: ['Nepal', 'nepalska'],
  RU: ['Rusko', 'Ruska', 'Ruske', 'Russian', 'Russian Federation', 'Russia'], SS: ['Juzny Sudan', 'South Sudan'],
  SY: ['Syria', 'Syrska', 'Syrian'], TT: ['Trinidad a Tobago', 'Trinidad and Tobago'], VU: ['Vanuatu'],
  VE: ['Venezuela', 'venezuelska'], VN: ['Vietnam', 'vietnamska'], YE: ['Jemen', 'Yemen', 'jemenska'],
}
/** A field that holds country codes ("SK, CZ"): only its codes count, never a word of free text. */
export const highRiskCodes = (codes: string): boolean => countryCodes(codes).some((code) => isCountryCode(code) && highRiskCountry(code))
export const monitoredCodes = (codes: string): boolean => countryCodes(codes).some((code) => isCountryCode(code) && monitoredCountry(code))
/**
 * A field that holds the name of a country or a nationality ("ruská", "Rusko, Kazachstan"): only whole names count.
 * A two-letter word is never read as a code here ("Na Hrebienku" is no Namibia), and a street address is never passed
 * in at all ("Ruská Nová Ves" is a village in Slovakia).
 */
export function highRiskName(text: string): boolean {
  const value = ` ${normal(text)} `
  return Object.entries(aliases).some(([code, names]) => high.has(code) && names.some((name) => value.includes(` ${normal(name)} `)))
}
