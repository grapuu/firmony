// The Register of Financial Statements as the Worker meets it (src/ruz.ts), in the shape its live API answers
// (recorded by github.com/freevisionsk/registeruz-mcp, tests/cassettes): every company and figure invented. Zelený dvor
// s. r. o. (55012345) files as a micro entity; 55099901 files on the template of the others; 55099902 was founded this
// year and has filed nothing; any other IČO is unknown to it.

const RUZ = 'https://www.registeruz.sk/cruz-public/api'
/** The statements are of the last two years, whenever the tests run. */
export const RUZ_LAST = new Date().getUTCFullYear() - 1
export const RUZ_CALLS = []

const UNITS = {
  '55012345': { id: 9100001, founded: '2023-03-01', employees: '02', closings: [9200001, 9200002] },
  '55099901': { id: 9100002, founded: '2010-05-05', employees: '06', closings: [9200003] },
  '55099902': { id: 9100003, founded: `${new Date().getUTCFullYear()}-02-10`, employees: '00', closings: [] },
}
const CLOSINGS = {
  9200001: { typ: 'Riadna', obdobieOd: `${RUZ_LAST - 1}-01`, obdobieDo: `${RUZ_LAST - 1}-12`, idUctovnychVykazov: [9300001] },
  9200002: { typ: 'Riadna', obdobieOd: `${RUZ_LAST}-01`, obdobieDo: `${RUZ_LAST}-12`, idUctovnychVykazov: [9300002] },
  9200003: { typ: 'Riadna', obdobieOd: `${RUZ_LAST}-01`, obdobieDo: `${RUZ_LAST}-12`, idUctovnychVykazov: [9300003] },
}
const REPORTS = { 9300001: 687, 9300002: 687, 9300003: 688 }
const TEMPLATES = { 687: 'Úč MUJ', 688: 'Úč POD' }

/** The register's answer to a call of the Worker, or null for any other address. */
export function ruzAnswer(url) {
  if (!url.startsWith(RUZ)) return null
  const u = new URL(url)
  const path = u.pathname.replace('/cruz-public/api', '')
  const id = Number(u.searchParams.get('id'))
  RUZ_CALLS.push(`${path}?${u.searchParams}`)
  if (path === '/uctovne-jednotky') {
    const unit = UNITS[u.searchParams.get('ico') ?? '']
    return Response.json({ id: unit ? [unit.id] : [], existujeDalsieId: false })
  }
  if (path === '/uctovna-jednotka') {
    const [ico, unit] = Object.entries(UNITS).find(([, x]) => x.id === id) ?? []
    return unit
      ? Response.json({ id, ico, nazovUJ: 'TEST ONLY', idUctovnychZavierok: unit.closings, konsolidovana: false, velkostOrganizacie: unit.employees, datumZalozenia: unit.founded, pravnaForma: '112', zdrojDat: 'SUSR' })
      : new Response('not found', { status: 404 })
  }
  if (path === '/uctovna-zavierka') return CLOSINGS[id] ? Response.json({ id, ...CLOSINGS[id], datumZostaveniaK: `${CLOSINGS[id].obdobieDo}-31`, zdrojDat: 'FRSR' }) : new Response('not found', { status: 404 })
  if (path === '/uctovny-vykaz') return REPORTS[id] ? Response.json({ id, idSablony: REPORTS[id], pristupnostDat: 'Verejné', zdrojDat: 'FRSR' }) : new Response('not found', { status: 404 })
  if (path === '/sablona') return TEMPLATES[id] ? Response.json({ id, nazov: TEMPLATES[id], platneOd: '2014-01-01' }) : new Response('not found', { status: 404 })
  return new Response('not found', { status: 404 })
}
