// The sanctions lists in workerd (aml/sanctions-store.ts, aml/proposals.ts): read by the schedule from both publishers
// (the UN's through its redirect), kept with their day, size and hash, said on /healthz; the designated person's
// dossier prepared with both lists and the countries, a possible match left to him, a different year set apart, one
// click to record; a list that fails, is cut off, too old or not what was kept is said and never used.
import { check } from './check.mjs'
import { aml, orderOf } from '../.wrangler/dist/stores.js'
import { testDeclaration } from './aml.runtime.mjs'
import { SANCTIONS_FEED } from './sanctions-fixtures.mjs'

const unescape = (s) => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
const textarea = (html, id) => unescape(new RegExp(`<textarea[^>]*id="${id}"[^>]*>([^<]*)</textarea>`).exec(html)?.[1] ?? '')
const selected = (html, id) => new RegExp(`id="${id}"[^>]*>(?:(?!</select>)[\\s\\S])*?<option value="(\\w+)" selected`).exec(html)?.[1] ?? ''

export async function checkSanctionsRuntime({ db, files, get, freshAdmin, worker, settle, nowS }) {
  const row = async (list) => db.prepare('SELECT * FROM sanction_lists WHERE list = ?').bind(list).first()
  let eu = await row('eu')
  let un = await row('un')
  check(
    'sanctions: the schedule read both lists, the UN\'s through its redirect, each with its day, its size and the hash of what it kept',
    eu?.entries === 1203 && un?.entries === 402 && eu.generated === '2026-10-27' && un.generated === '2026-10-27' && !eu.error && !un.error && /^[0-9a-f]{64}$/.test(eu.sha256 ?? '') &&
      Boolean(await files.get('aml/sanctions/eu.json')) && Boolean(await files.get('aml/sanctions/un.json')),
    JSON.stringify({ eu, un, calls: SANCTIONS_FEED.calls }),
  )
  let health = await (await get('/healthz')).json()
  check('sanctions: /healthz says the day of each list and nothing more', health.sanctions?.eu === '2026-10-27' && health.sanctions?.un === '2026-10-27' && Object.keys(health.sanctions).length === 2)

  const officer = await freshAdmin()
  const bytes = new TextEncoder().encode('%PDF-1.7\nTEST_ONLY sanctions screening\n%%EOF\n')
  const dossier = async (id, ico, company, director) => {
    await db
      .prepare(
        `INSERT INTO orders (id,token,created_at,expires_at,request_id,ico,company,address,register_line,directors,plan,person,email,legal_form,aml_paper)
         VALUES (?,?,?,?,NULL,?,?,'TEST 12, Košice','TEST ONLY register',?,'rast',?,?,'sro',0)`,
      )
      .bind(id, `TEST-${id}`, nowS, nowS + 86400, ico, company, JSON.stringify([{ name: director.name, role: 'Konateľ' }]), director.name, `${id}@sanctions.test`)
      .run()
    const order = orderOf(await db.prepare('SELECT * FROM orders WHERE id = ?').bind(id).first())
    const made = await aml.prepareDossier(db, files, { order }, testDeclaration({ director: { ...testDeclaration().director, ...director } }), { bytes, type: 'pdf', name: 'TEST_ONLY.pdf', sha256: await aml.bytesHash(bytes) }, null)
    await made.statement.run()
    return aml.dossierOfOrder(db, id)
  }

  // A director with a listed name and year, at a company named as a listed entity: a possible match to judge.
  await dossier('sanct-hit', '99000001', 'TEST-ONLY Embargo Trading s. r. o.', { name: 'Testoslav Sankcionovaný', birthDate: '1971-04-02' })
  let html = await (await officer.get('/ucto/aml/objednavky/sanct-hit')).text()
  const euText = textarea(html, 'aml-eu-sanctions-zdroj')
  check(
    'sanctions: a possible match on the EU list is prepared for the person to judge, nothing preselected',
    html.includes('data-aml-proposal="eu-sanctions"') && euText.includes('MOŽNÁ ZHODA') && euText.includes('EU.9001.01') && euText.includes('EU.9002.02') && euText.includes('vydaný 27. 10. 2026') && selected(html, 'aml-eu-sanctions-vysledok') === '',
    euText,
  )
  const unText = textarea(html, 'aml-un-sanctions-zdroj')
  check('sanctions: the UN list with nobody on it is prepared as clear, its source and what was compared said', selected(html, 'aml-un-sanctions-vysledok') === 'clear' && unText.includes('Výsledok: bez zhody') && unText.includes('Bezpečnostnej rady OSN') && unText.includes('konateľ Testoslav Sankcionovaný (nar. 1971)') && unText.includes('firma TEST-ONLY Embargo Trading s. r. o.'))
  check('sanctions: the countries are prepared from the codes of the declaration', selected(html, 'aml-countries-vysledok') === 'clear' && textarea(html, 'aml-countries-zdroj').includes('Vysokorizikové: žiadne'))
  check('sanctions: what needs the person\'s own eyes is not prepared', !html.includes('data-aml-proposal="identity"') && !html.includes('data-aml-proposal="pep"') && !html.includes('data-aml-proposal="kuv"') && textarea(html, 'aml-pep-zdroj') === '')

  // One click: the prepared text recorded as it stands, under the person's name.
  const v = await aml.dossierOfOrder(db, 'sanct-hit')
  let res = await officer.post(`/ucto/aml/spisy/${v.dossier.id}/kontrola`, { hash: v.dossier.facts_hash, druh: 'un-sanctions', vysledok: 'clear', zdroj: unText, spat: '/ucto/aml/objednavky/sanct-hit' })
  const recorded = await db.prepare("SELECT * FROM aml_checks WHERE dossier_id = ? AND kind = 'un-sanctions'").bind(v.dossier.id).first()
  check('sanctions: the prepared check is recorded with one click, as the person\'s own, with its text', res.status === 303 && recorded?.result === 'clear' && recorded.source.startsWith('Automatické porovnanie vo Firmony') && recorded.checked_by !== null)

  // The same name born another year: set apart, the result proposed clear with why.
  await dossier('sanct-apart', '99000002', 'TEST ONLY Čistá firma s. r. o.', { name: 'Ján Vzorový', birthDate: '1990-05-05' })
  html = await (await officer.get('/ucto/aml/objednavky/sanct-apart')).text()
  check('sanctions: a listed name of another year of birth is set apart, said and proposed clear', selected(html, 'aml-eu-sanctions-vysledok') === 'clear' && textarea(html, 'aml-eu-sanctions-zdroj').includes('vylúčená iným rokom narodenia: EU.9003.03'))

  // Read again only a day later: a run of the schedule now asks nobody.
  const asked = () => SANCTIONS_FEED.calls.filter((c) => c === 'eu').length
  let before = asked()
  await db.prepare("UPDATE sanction_lists SET fetched_at = ?, tried_at = ? WHERE list = 'eu'").bind(nowS - 3600, nowS - 3600).run()
  await worker.scheduled({ cron: '*/15 * * * *' })
  await settle(300)
  check('sanctions: a list read within the day is not read again', asked() === before)

  // A publisher that fails: said in its row and tried again in an hour; the list read before stays while it is fresh.
  SANCTIONS_FEED.eu = 'fail'
  before = asked()
  await db.prepare("UPDATE sanction_lists SET fetched_at = ?, tried_at = ? WHERE list = 'eu'").bind(nowS - 21 * 3600, nowS - 2 * 3600).run()
  await worker.scheduled({ cron: '*/15 * * * *' })
  await settle(500)
  eu = await row('eu')
  health = await (await get('/healthz')).json()
  check('sanctions: a list that cannot be read is said with its error, the one read before kept while fresh', eu.error === 'HTTP 503' && eu.fetched_at === nowS - 21 * 3600 && health.sanctions.eu === '2026-10-27')
  await worker.scheduled({ cron: '*/15 * * * *' })
  await settle(300)
  check('sanctions: and tried again only after an hour', asked() === before + 1)

  // Too old: no proposal, and why.
  await db.prepare("UPDATE sanction_lists SET fetched_at = ? WHERE list = 'eu'").bind(nowS - 40 * 3600).run()
  html = await (await officer.get('/ucto/aml/objednavky/sanct-apart')).text()
  health = await (await get('/healthz')).json()
  check('sanctions: a list older than a day and a half prepares nothing and says so', html.includes('data-aml-proposal-missing="eu-sanctions"') && html.includes('starší ako deň a pol') && textarea(html, 'aml-eu-sanctions-zdroj') === '' && health.sanctions.eu === null && html.includes('data-aml-proposal="un-sanctions"'))

  // A cut-off file is refused whole.
  SANCTIONS_FEED.eu = 'small'
  await db.prepare("UPDATE sanction_lists SET tried_at = ? WHERE list = 'eu'").bind(nowS - 2 * 3600).run()
  await worker.scheduled({ cron: '*/15 * * * *' })
  await settle(500)
  eu = await row('eu')
  check('sanctions: a file with fewer subjects than a whole list is refused, the old one not replaced', eu.error === 'neúplný súbor: 8 subjektov' && eu.entries === 1203)

  // Read again: fresh, and a kept file that is not what was read is never screened against.
  SANCTIONS_FEED.eu = 'ok'
  await db.prepare("UPDATE sanction_lists SET tried_at = ? WHERE list = 'eu'").bind(nowS - 2 * 3600).run()
  await worker.scheduled({ cron: '*/15 * * * *' })
  await settle(500)
  eu = await row('eu')
  check('sanctions: read again, the list is fresh and its error gone', eu.error === null && eu.fetched_at > nowS - 600 && eu.entries === 1203)
  // The record says another hash than the file kept: the file is not what was read, and nothing is prepared from it.
  await db.prepare("UPDATE sanction_lists SET sha256 = ? WHERE list = 'eu'").bind('0'.repeat(64)).run()
  html = await (await officer.get('/ucto/aml/objednavky/sanct-apart')).text()
  check('sanctions: a kept list that is not what was read is not used', html.includes('nezhoduje so záznamom o jeho načítaní') && textarea(html, 'aml-eu-sanctions-zdroj') === '')
  await db.prepare("UPDATE sanction_lists SET sha256 = ? WHERE list = 'eu'").bind(eu.sha256).run()
  html = await (await officer.get('/ucto/aml/objednavky/sanct-apart')).text()
  check('sanctions: and used again once it is what was read', selected(html, 'aml-eu-sanctions-vysledok') === 'clear')
}
