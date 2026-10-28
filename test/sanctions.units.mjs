// The sanctions lists (aml/sanctions.ts) and the countries (aml/proposals.ts): reading both publishers' files as they
// stream in, the names compared, and what a proposal says. Every name invented (test/sanctions-fixtures.mjs).
import { check } from './check.mjs'
import { sanctions as s, countriesProposal } from '../.wrangler/tmp/units-bundle.mjs'
import { chunked, euXml, unXml } from './sanctions-fixtures.mjs'

export async function checkSanctionsUnits() {
  const eu = await s.parseList('eu', chunked(euXml({ padding: 20 }), 7))
  const one = eu.entries.find((e) => e[0] === 'EU.9001.01')
  check('sanctions: the EU file is read in pieces of seven bytes, every subject whole', eu.entries.length === 23 && eu.generated === '2026-10-27')
  check('sanctions: an EU person with every name of it compared, its year of birth', one?.[1] === 'p' && one[2] === 'Testoslav Sankcionovaný' && one[3].join('|') === 'testoslav sankcionovany|sankcionovany' && one[4].join() === '1971')
  const firm = eu.entries.find((e) => e[0] === 'EU.9002.02')
  check("sanctions: an EU entity, its names' entities decoded", firm?.[1] === 'e' && firm[3].includes('embargo partners') && firm[3].includes('test only embargo trading llc'))
  const un = await s.parseList('un', chunked(unXml({ padding: 10 }), 5))
  const ind = un.entries.find((e) => e[0] === 'KPi.900')
  check('sanctions: the UN file read in pieces, individuals and entities, its day', un.entries.length === 12 && un.generated === '2026-10-27' && un.entries.find((e) => e[0] === 'KPe.900')?.[1] === 'e')
  check('sanctions: a UN person with its alias, born between two years', ind?.[2] === 'TESTOMIR UNLISTED' && ind[3].includes('testomir unlistedov') && ind[4].join() === '1960,1961,1962,1963,1964,1965')

  const hits = (subjects, entries = eu.entries) => s.screen(subjects, entries)
  const p = (name, year = null) => ({ role: 'konateľ', name, kind: 'p', year })
  check('sanctions: a listed person is found without accents, case or a title', hits([p('Ing. TESTOSLAV Sankcionovany')]).some((h) => h.ref === 'EU.9001.01' && !h.otherYear))
  check('sanctions: one letter apart in a long word is still the person', hits([p('Testoslav Sankcionovani')]).length === 1)
  check('sanctions: the same name born in another year is set apart, not hidden', hits([p('Ján Vzorový', 1990)]).every((h) => h.otherYear) && hits([p('Ján Vzorový', 1990)]).length === 1)
  check('sanctions: the same name and year is a hit to judge', hits([p('Ján Vzorový', 1950)]).some((h) => !h.otherYear))
  check('sanctions: a different person is no hit, one word in common is none either', hits([p('Ján Novák'), p('Testoslav Novák')]).length === 0)
  check('sanctions: a company is matched without its legal form', hits([{ role: 'firma', name: 'TEST-ONLY Embargo Trading s. r. o.', kind: 'e' }]).some((h) => h.ref === 'EU.9002.02'))
  check('sanctions: a person is never matched to an entity of the same words', hits([p('Embargo Partners')]).length === 0)
  check('sanctions: an entity of the UN by its alias', hits([{ role: 'firma', name: 'Blockade Shipping, s.r.o.', kind: 'e' }], un.entries).some((h) => h.ref === 'KPe.900'))
  check('sanctions: years of birth from a date or a birth number', s.birthYear('1994-03-07', '') === 1994 && s.birthYear('', '940307/1234') === 1994 && s.birthYear('', '450101123') === 1945 && s.birthYear('', '0501011234') === 2005 && s.birthYear('', '') === null)

  const decl = (patch = {}) => ({ version: 2, director: { name: 'A B', birthNumber: '', birthDate: '1990-01-01', address: 'x', nationality: 'slovenská', citizenships: 'SK', residenceCountry: 'SK', pep: false, idKind: 'op', idNumber: 'X' }, kuv: 'self', owners: [], activity: 'x', income: 'x', turnover: 'do-50', cash: false, abroad: false, abroadWhere: '', businessAtSeat: true, businessAddress: '', businessCountries: 'SK', ownBehalf: true, partnerCountries: 'SK, CZ', ...patch })
  const clear = countriesProposal(decl())
  check('countries: codes of nobody high-risk are proposed clear, with the lists and the codes named', clear.proposal?.result === 'clear' && clear.proposal.source.includes('CZ, SK') && clear.proposal.source.includes('2016/1675') && clear.proposal.source.includes('Vysokorizikové: žiadne'))
  const high = countriesProposal(decl({ partnerCountries: 'SK, RU' }))
  check('countries: a high-risk country is proposed as raised risk', high.proposal?.result === 'high' && high.proposal.source.includes('Vysokorizikové: RU'))
  check('countries: a monitored country is named', countriesProposal(decl({ partnerCountries: 'SK, BG' })).proposal?.source.includes('monitorovaním FATF: BG'))
  check('countries: an older declaration without codes for each person gets no proposal', 'missing' in countriesProposal(decl({ director: { ...decl().director, citizenships: undefined } })))
}
