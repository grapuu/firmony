// What the app reads in the public registers for a review before the contract (ruz.ts, team/review-proposal.ts) and for
// the beneficial owners (rpo.ts readStakeholders, aml/proposals.ts kuvProposal). Every company and person invented.
import { check } from './check.mjs'
import { ruz, reviewPrep, rpo, kuvProposal, contractCatalogueHash } from '../.wrangler/tmp/units-bundle.mjs'
import { ruzAnswer, RUZ_CALLS, RUZ_LAST } from './ruz-fixtures.mjs'
import { registerAnswer } from './pretend.mjs'

const fetcher = async (url) => ruzAnswer(String(url)) ?? registerAnswer(String(url)) ?? new Response('unexpected', { status: 599 })
const failing = async () => { throw new Error('offline') }

export async function checkRegistersUnits() {
  const micro = await ruz.ruzProfile('55012345', fetcher)
  check('ruz: the latest statements by their period, their template by its name, the band of employees and the day founded',
    micro?.latest?.to === `${RUZ_LAST}-12` && micro.latest.template === 'Úč MUJ' && micro.employees === '02' && micro.founded === '2023-03-01' && micro.consolidated === false, JSON.stringify(micro))
  const before = RUZ_CALLS.filter((c) => c.startsWith('/sablona')).length
  await ruz.ruzProfile('55012345', fetcher)
  check('ruz: a template is asked once for the isolate', RUZ_CALLS.filter((c) => c.startsWith('/sablona')).length === before)
  check('ruz: a company it does not know, and a register that does not answer', (await ruz.ruzProfile('55000000', fetcher)) === 'none' && (await ruz.ruzProfile('55012345', failing)) === null && (await ruz.ruzProfile('1234', fetcher)) === null)
  const today = '2026-10-28'
  check('review: statements filed on Úč MUJ of the last periods make a micro entity', reviewPrep.micro(micro, null, today).ok)
  check('review: statements on another template do not', !reviewPrep.micro(await ruz.ruzProfile('55099901', fetcher), null, today).ok)
  check('review: an old statement on Úč MUJ is left to the person', !reviewPrep.micro({ ...micro, latest: { from: '2021-01', to: '2021-12', template: 'Úč MUJ' } }, null, today).ok)
  check('review: a company founded this year without statements is in its first periods; an older one without any is not known',
    reviewPrep.micro(await ruz.ruzProfile('55099902', fetcher), null, today).ok && !reviewPrep.micro({ founded: '2019-01-01', consolidated: false, employees: '01', latest: null }, null, today).ok)
  check('review: a company the register of statements does not know is judged by the day the register of legal entities gives',
    reviewPrep.micro('none', '2026-02-01', today).ok && !reviewPrep.micro('none', null, today).ok && !reviewPrep.micro(null, '2026-02-01', today).ok)
  check('review: a consolidated entity is never micro', !reviewPrep.micro({ ...micro, consolidated: true }, null, today).ok)

  const release = JSON.stringify({ catalogueHash: await contractCatalogueHash(), legalReview: 'TEST ONLY lawyer', insuranceReview: 'TEST ONLY insurer', validUntil: Math.floor(Date.now() / 1000) + 86400 })
  const order = { id: 'o', ico: '55012345', company: 'Zelený dvor s. r. o.', plan: 'rast', legalForm: 'sro', directors: [{ name: 'Tomáš Dvorský', role: 'Konateľ' }], acting: 'Konateľ koná samostatne.' }
  let p = await reviewPrep.reviewProposal({ CONTRACT_RELEASE: release }, order, 2, fetcher)
  check('review: a micro s. r. o. with one director, few employees, a team of two and the approved catalogue is proposed standard, every tick',
    p.standard && Object.values(p.ticks).every(Boolean) && p.evidence.length >= 12 && p.evidence.length <= 240 && p.evidence.includes('Tomáš Dvorský koná sám') && p.evidence.includes('Úč MUJ'), JSON.stringify(p))
  p = await reviewPrep.reviewProposal({}, order, 2, fetcher)
  check('review: without the approved catalogue the cover is left open and nothing is proposed standard', !p.standard && !p.ticks.cover && p.ticks.category && p.ticks.authority && p.evidence === '')
  p = await reviewPrep.reviewProposal({ CONTRACT_RELEASE: release }, order, 1, fetcher)
  check('review: a team of one has no deputy: the scope is left to the person', !p.standard && !p.ticks.scope && !p.ticks.cover)
  p = await reviewPrep.reviewProposal({ CONTRACT_RELEASE: release }, { ...order, directors: [{ name: 'A Prvý', role: 'Konateľ' }, { name: 'B Druhý', role: 'Konateľ' }], acting: 'Konatelia konajú spoločne.' }, 2, fetcher)
  check('review: directors who act together are not ticked', !p.ticks.authority && !p.standard)
  p = await reviewPrep.reviewProposal({ CONTRACT_RELEASE: release }, { ...order, ico: '55099901' }, 2, fetcher)
  check('review: ten employees or statements of another template leave the category and the scope to the person', !p.ticks.category && !p.ticks.scope && !p.standard)
  p = await reviewPrep.reviewProposal({ CONTRACT_RELEASE: release }, order, 2, failing)
  check('review: registers that do not answer propose nothing beyond who acts', p.ticks.authority && !p.ticks.category && !p.standard && p.notes.find((n) => n.check === 'category')?.text.includes('neodpovedal'))

  const stakeholders = rpo.readStakeholders({
    stakeholders: [
      { stakeholderType: { value: 'Spoločník' }, personName: { formatedName: 'Mgr. Anna Prvá' } },
      { stakeholderType: { value: 'Spoločník' }, companyName: { value: 'TEST Holding a. s.' }, identifier: '12345678' },
      { stakeholderType: { value: 'Spoločník' }, personName: { formatedName: 'Bývalý Spoločník' }, validTo: '2024-01-01' },
      { stakeholderType: { value: 'Konateľ' }, personName: { formatedName: 'Iný Konateľ' } },
      { stakeholderType: { value: 'Spoločník' }, companyName: { value: 'Bez IČO s. r. o.' }, identifier: 'Neuvedené' },
    ],
  }, '2026-10-28')
  check('rpo: the shareholders in office, a person and companies with their IČO, no one else',
    JSON.stringify(stakeholders) === JSON.stringify([
      { name: 'Mgr. Anna Prvá', kind: 'person', ico: null, role: 'Spoločník' },
      { name: 'TEST Holding a. s.', kind: 'company', ico: '12345678', role: 'Spoločník' },
      { name: 'Bez IČO s. r. o.', kind: 'company', ico: null, role: 'Spoločník' },
    ]), JSON.stringify(stakeholders))
  check('rpo: an answer without the list is not "nobody"', rpo.readStakeholders({}) === null && rpo.readStakeholders({ stakeholders: [] })?.length === 0)
  const declaration = (extra = {}) => ({ director: { name: 'Anna Prvá' }, kuv: 'self', owners: [], ...extra })
  const person = [{ name: 'Mgr. Anna Prvá', kind: 'person', ico: null, role: 'Spoločník' }]
  check('kuv: the only shareholder is the declared owner, titles aside: clear', kuvProposal(declaration(), person).proposal?.result === 'clear')
  const more = kuvProposal(declaration(), [...person, { name: 'Peter Tichý', kind: 'person', ico: null, role: 'Spoločník' }]).proposal
  check('kuv: a shareholder the declaration does not name is left to the person, with why', more?.result === '' && more.source.includes('V registri, ale nie vo vyhlásení: Peter Tichý'))
  const notThere = kuvProposal(declaration({ kuv: 'with', owners: [{ name: 'Mária Skrytá', share: '50 %' }] }), person).proposal
  check('kuv: an owner the register does not name is left to the person', notThere?.result === '' && notThere.source.includes('Vo vyhlásení, ale nie medzi spoločníkmi v registri: Mária Skrytá'))
  check('kuv: no list of shareholders says so and proposes nothing', 'missing' in kuvProposal(declaration(), null) && 'missing' in kuvProposal(declaration(), []))
}
