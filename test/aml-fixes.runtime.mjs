// The findings of two independent reviews of the AML admission (26 October 2026), each against the real workerd and D1.
// Synthetic attestations only: nothing here claims a cryptographic validation of a qualified signature.
import { createHash } from 'node:crypto'
import { check } from './check.mjs'
import { migrationSteps } from '../.wrangler/dist/schema.js'
import { aml, orderOf, forgetLonely, purgeEnded, forgetUnidentified, dropAccount, comparedOf, teamDeadlines, startMonths, TERMS_VERSION, amlPolicy } from '../.wrangler/dist/stores.js'
import { ensureAmlOfficer, testDeclaration } from './aml.runtime.mjs'

const sha = (text) => createHash('sha256').update(text).digest('hex')

export async function checkAmlFixes({ db, files, get, post, admin, acc, lucia, signIn, as, nowS, day, freshAdmin }) {
  check('AML fixes: the first 80 deployed schema steps are unchanged and step 81 is added',
    sha(JSON.stringify(migrationSteps.slice(0, 80))) === '2e54ad4468c880713a84b65366c6e0bd7a278e2214fe4858d27bf6b9648b04ed' && migrationSteps.length >= 81)
  const officer = await ensureAmlOfficer(db)
  const today = day(0)
  const months = startMonths(today)
  const bytes = new TextEncoder().encode('%PDF-1.7\nTEST_ONLY aml fixes original\n%%EOF\n')
  const original = async () => ({ bytes, type: 'pdf', name: 'TEST_ONLY-aml-fixes.pdf', sha256: await aml.bytesHash(bytes) })
  const director = 'Fix Konateľ'
  const declaration = (extra = {}) => testDeclaration({ ...extra, director: { ...testDeclaration().director, name: director, ...(extra.director ?? {}) } })
  const newOrder = async (id, ico, { token = `TEST-${id}`, paper = 0, request = null, expires = nowS + 86400 } = {}) => {
    await db.prepare(`INSERT INTO orders (id,token,created_at,expires_at,request_id,ico,company,address,register_line,directors,plan,person,email,legal_form,aml_paper)
      VALUES (?,?,?,?,?,?,?,'TEST 12, Košice','TEST ONLY register',?,'rast',?,?,'sro',?)`)
      .bind(id, token, nowS, expires, request, ico, `TEST ONLY ${id} s. r. o.`, JSON.stringify([{ name: director, role: 'Konateľ' }]), director, `${id}@amlfix.test`, paper).run()
    return orderOf(await db.prepare('SELECT * FROM orders WHERE id = ?').bind(id).first())
  }
  const view = (orderId) => aml.dossierOfOrder(db, orderId)
  const record = async (v, kind, extra = {}) => aml.recordCheck(db, officer, v, { kind, result: 'clear', source: `TEST ONLY independent ${kind} evidence`, subject: v.dossier.signer_name, qualified: true, hash: v.dossier.facts_hash, ...extra })
  const all = async (orderId) => { for (const kind of ['identity', 'kuv', 'pep', 'eu-sanctions', 'un-sanctions', 'countries']) await record(await view(orderId), kind) }
  const decide = async (orderId, level, extra = {}) => aml.decideDossier(db, officer, await view(orderId), { level, decision: 'approved', note: 'TEST ONLY complete independent review', enhanced: '', hash: (await view(orderId)).dossier.facts_hash, ...extra })
  const admitted = async (orderId) => Boolean(await aml.admissionForOrder(db, orderOf(await db.prepare('SELECT * FROM orders WHERE id = ?').bind(orderId).first())))
  const raises = async (statement) => { try { await statement.run(); return false } catch { return true } }

  // Finding 2: a dossier evaluated under an earlier list of countries is re-evaluated by the designated person, without
  // a new declaration; only one whose required risk rises needs a new decision and its steps.
  const oldDossier = async (orderId, ico, data, requiredRisk) => {
    const order = await newOrder(orderId, ico)
    const made = await aml.prepareDossier(db, files, { order }, data, await original(), null)
    const d = { ...made.dossier, policy_version: '2026-10-21', required_risk: requiredRisk }
    await db.prepare(`INSERT INTO aml_dossiers (id,order_id,company_id,declaration_id,order_token_hash,created_at,created_by,declaration,company_facts,signer_name,facts_hash,file_key,file_name,file_type,file_sha256,file_bytes,required_risk,policy_version)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(d.id, d.order_id, d.company_id, d.declaration_id, d.order_token_hash, d.created_at, d.created_by, d.declaration, d.company_facts, d.signer_name, d.facts_hash, d.file_key, d.file_name, d.file_type, d.file_sha256, d.file_bytes, d.required_risk, d.policy_version).run()
    await all(orderId)
    return d.id
  }
  // Under the rule before 26 October a street name made this declaration "high"; the decision was taken at standard.
  const steady = await oldDossier('amlfix-policy', '91000001', declaration({ director: { address: 'Ruská Nová Ves 15, 080 05' } }), 'standard')
  check('an approval under the earlier lists is recorded', await decide('amlfix-policy', 'standard'))
  const rising = await oldDossier('amlfix-rising', '91000002', declaration({ cash: true }), 'low')
  check('an approval at the earlier, lower requirement is recorded', await decide('amlfix-rising', 'low'))
  check('a change of the lists leaves the old approvals not current until they are re-evaluated', !(await admitted('amlfix-policy')) && !(await view('amlfix-policy')).ready && !(await view('amlfix-policy')).policyCurrent)
  check('nobody but the designated person re-evaluates', await aml.reevaluatePolicy(db, { id: lucia.id, team: 'accountant' }, 'TEST ONLY lists checked again') === null)
  check('SQL refuses a re-evaluation by anybody else', await raises(db.prepare(`INSERT INTO aml_policy_reviews (dossier_id,policy_version,required_risk,previous_risk,reviewed_at,reviewed_by,note,facts_hash)
    SELECT id,?,'low','standard',?,?,'TEST ONLY forged re-evaluation',facts_hash FROM aml_dossiers WHERE id = ?`).bind(amlPolicy.COUNTRY_POLICY_VERSION, nowS, lucia.id, steady)))
  const result = await aml.reevaluatePolicy(db, officer, 'TEST ONLY EU and FATF lists checked against their originals')
  check('the re-evaluation records each stale dossier with the current version and names those whose risk rose', result && result.reviewed >= 2 && result.rising.includes(rising) && !result.rising.includes(steady))
  const steadyView = await view('amlfix-policy')
  check('a client whose approved level still meets the recomputed requirement is verified again at once', steadyView.ready && steadyView.policyCurrent && steadyView.requiredRisk === 'low' && await admitted('amlfix-policy'))
  check('a second run finds nothing left to re-evaluate', (await aml.reevaluatePolicy(db, officer, 'TEST ONLY the same lists again'))?.reviewed === 0)
  check('a client whose requirement rose stays unverified', !(await admitted('amlfix-rising')) && (await view('amlfix-rising')).requiredRisk === 'standard')
  check('a decision below the new requirement is refused', !(await decide('amlfix-rising', 'low')))
  check('a new decision at the new level still needs PEP, sanctions and KUV checks after the previous approval', !(await decide('amlfix-rising', 'standard')))
  for (const kind of ['pep', 'eu-sanctions', 'un-sanctions', 'kuv']) await record(await view('amlfix-rising'), kind)
  check('with fresh checks the designated person decides at the new level and the client is admitted', await decide('amlfix-rising', 'standard') && await admitted('amlfix-rising'))

  // Finding 7: the actual place of business, when not the seat, is checked from an independent source.
  const placeOrder = await newOrder('amlfix-place', '91000003')
  await (await aml.prepareDossier(db, files, { order: placeOrder }, declaration({ businessAtSeat: false, businessAddress: 'TEST Prevádzka 7, 040 01 Košice' }), await original(), null)).statement.run()
  await all('amlfix-place')
  check('the six checks alone do not admit a client whose business is not at its seat', !(await decide('amlfix-place', 'low')) && !(await admitted('amlfix-place')))
  const placeView = await view('amlfix-place')
  const ids = Object.fromEntries(placeView.checks.map((k) => [k.kind, k.id]).reverse())
  check('SQL refuses an approval without the place of business', await raises(db.prepare(`INSERT INTO aml_decisions (dossier_id,decided_at,decided_by,decision,level,note,enhanced_source,nonce,checks,facts_hash,policy_version)
    VALUES (?,?,?,'approved','low','TEST ONLY no place check',NULL,?,?,?,?)`).bind(placeView.dossier.id, nowS, officer.id, crypto.randomUUID(), JSON.stringify(ids), placeView.dossier.facts_hash, placeView.dossier.policy_version)))
  check('the place check is refused where the declaration says the business is at its seat', !(await record(await view('amlfix-policy'), 'place', { source: 'TEST ONLY rent invoice of a third party' })))
  check('the place check is recorded with its source', await record(placeView, 'place', { source: 'TEST ONLY rent invoice of a third party for the premises' }))
  check('with the place verified the client is admitted', await decide('amlfix-place', 'low') && await admitted('amlfix-place'))
  let res = await (await freshAdmin()).get('/ucto/aml/objednavky/amlfix-place')
  let page = await res.text()
  check('the dossier page shows the place of business and its check', res.status === 200 && page.includes('data-aml-place') && page.includes('TEST Prevádzka 7') && page.includes('rent invoice'))

  // Finding 5: a review is never closed on the checks of the previous approval.
  check('approving the same client again with the same checks is refused', !(await decide('amlfix-place', 'low')))
  const reused = await view('amlfix-place')
  const reusedIds = { ...Object.fromEntries(reused.checks.map((k) => [k.kind, k.id]).reverse()), place: reused.placeChecks[0].id }
  check('SQL refuses a review decision that reuses last approval\'s checks', await raises(db.prepare(`INSERT INTO aml_decisions (dossier_id,decided_at,decided_by,decision,level,note,enhanced_source,nonce,checks,facts_hash,policy_version)
    VALUES (?,?,?,'approved','low','TEST ONLY review on old checks',NULL,?,?,?,?)`).bind(reused.dossier.id, nowS, officer.id, crypto.randomUUID(), JSON.stringify(reusedIds), reused.dossier.facts_hash, reused.dossier.policy_version)))
  for (const kind of ['pep', 'eu-sanctions', 'un-sanctions']) await record(await view('amlfix-place'), kind)
  check('three of the four review checks are not enough', !(await decide('amlfix-place', 'low')))
  await record(await view('amlfix-place'), 'kuv')
  check('with PEP, both sanctions lists and KUV checked again the review is approved', await decide('amlfix-place', 'low'))

  // Finding 4: on paper too the identified person is a member of the statutory body the register named.
  const paper = await newOrder('amlfix-paper', '91000004', { paper: 1 })
  let refused = false
  try { await aml.prepareDossier(db, files, { order: paper }, declaration({ director: { name: 'Iná Osoba' } }), await original(), null) } catch { refused = true }
  check('a paper intake signed by somebody the register does not name is refused', refused)
  check('a paper intake of a registered director is taken', Boolean((await aml.prepareDossier(db, files, { order: paper }, declaration(), await original(), null)).statement))

  // Findings 6, 9 and 18: the intake of an online order accepts the offer in the signed declaration, never shows birth
  // numbers or the document's number again, and says that the data are processed without consent.
  const token = `amlfix${'k'.repeat(37)}`
  await newOrder('amlfix-intake', '91000005', { token: sha(token) })
  res = await get(`/objednavka/${token}`)
  page = await res.text()
  check('the intake page asks for the offer the declaration accepts and says the data are processed without consent',
    res.status === 200 && page.includes('data-aml-contract') && page.includes('name="contractAgree"') && page.includes(`value="${months[0]}"`) && page.includes('data-aml-consent') && page.includes('bez súhlasu dotknutých osôb') && !page.includes('name="agree"'))
  const form = { name: director, rc: '', dob: '1. 1. 1990', address: 'Testovacia 12, Košice', nationality: 'slovenská', citizenships: 'SK', residenceCountry: 'SK', idKind: 'op', idNumber: 'TESTONLY987', pep: '0', kuv: 'self',
    activity: 'Vývoj softvéru', income: 'Platby od zákazníkov', turnover: 'do-50', cash: '0', abroad: '0', businessAtSeat: '1', businessCountries: 'SK', ownBehalf: '1', partnerCountries: 'SK', contractPlan: 'rast', contractStart: months[1] }
  res = await post(`/objednavka/${token}/vyhlasenie.pdf`, form, { ip: '198.51.100.81' })
  check('a declaration to sign without accepting the offer is not made', res.status === 422 && (await res.text()).includes('Bez prijatia ponuky'))
  res = await post(`/objednavka/${token}/vyhlasenie.pdf`, { ...form, contractAgree: '1' }, { ip: '198.51.100.81' })
  const signedPdf = await res.text()
  check('the declaration to sign states the accepted offer and the processing without consent', res.status === 200 && (res.headers.get('content-type') ?? '').includes('application/pdf') && signedPdf.includes('Prijatie ponuky') && signedPdf.includes(TERMS_VERSION))
  const intakeOrder = orderOf(await db.prepare("SELECT * FROM orders WHERE id = 'amlfix-intake'").first())
  await (await aml.prepareDossier(db, files, { order: intakeOrder }, declaration({ director: { birthNumber: '905512/0017', birthDate: '', idNumber: 'TESTONLY987' }, contract: { plan: 'rast', startOn: months[1], terms: TERMS_VERSION } }), await original(), null)).statement.run()
  res = await get(`/objednavka/${token}?upravit=1`)
  page = await res.text()
  check('the public link refills the form without the birth number or the document number and asks for them again',
    res.status === 200 && !page.includes('905512/0017') && !page.includes('TESTONLY987') && page.includes('data-aml-retype') && page.includes(`value="${director}"`))
  res = await (await freshAdmin()).get('/ucto/aml/objednavky/amlfix-intake')
  page = await res.text()
  check('the dossier summary shows the birth number and the document number cut short', res.status === 200 && !page.includes('905512/0017') && page.includes('******/0017') && !page.includes('TESTONLY987') && page.includes('987'))
  await db.prepare("UPDATE orders SET token = ? WHERE id = 'amlfix-paper'").bind(sha(`amlfixpaper${'p'.repeat(32)}`)).run()
  page = await (await get(`/objednavka/${`amlfixpaper${'p'.repeat(32)}`}`)).text()
  check('a paper order accepts no offer online', page.includes('data-aml-consent') && !page.includes('data-aml-contract'))

  // Finding 3: a member taken out loses access at once, but the person stays known while the company's records are kept.
  await db.batch([
    db.prepare("INSERT INTO companies (id, created_at, name, ico, plan, inbox, accountant_id) VALUES ('amlfix-co', ?, 'TEST ONLY Členovia s. r. o.', '91000006', 'start', 'amlfix01', ?)").bind(nowS, lucia.id),
    db.prepare("INSERT INTO users (id, created_at, email, name) VALUES ('amlfix-owner', ?, 'owner@amlfix.test', 'TEST Majiteľ'), ('amlfix-member', ?, 'member@amlfix.test', 'TEST Kolega')").bind(nowS, nowS),
    db.prepare("INSERT INTO members (company_id, user_id, role, created_at) VALUES ('amlfix-co', 'amlfix-owner', 'owner', ?), ('amlfix-co', 'amlfix-member', 'member', ?)").bind(nowS, nowS),
    db.prepare("INSERT INTO sessions (id, user_id, company_id, created_at, expires_at) VALUES ('amlfix-member-session', 'amlfix-member', 'amlfix-co', ?, ?)").bind(nowS, nowS + 3600),
    db.prepare("INSERT INTO login_links (id, user_id, created_at, expires_at) VALUES ('amlfix-member-link', 'amlfix-member', ?, ?)").bind(nowS, nowS + 3600),
    db.prepare("INSERT INTO events (at, company_id, user_id, action, subject) VALUES (?, 'amlfix-co', 'amlfix-member', 'document.added', 'TEST')").bind(nowS),
  ])
  const owner = as((await signIn('owner@amlfix.test')).cookie)
  res = await owner.post('/app/firma/ludia/amlfix-member/odobrat', {})
  const sessions = await db.prepare("SELECT (SELECT COUNT(*) FROM sessions WHERE user_id = 'amlfix-member') AS s, (SELECT COUNT(*) FROM login_links WHERE user_id = 'amlfix-member') AS l").first()
  check('a member taken out loses every session and sign-in link at once', res.status === 303 && sessions.s === 0 && sessions.l === 0 && !(await db.prepare("SELECT 1 FROM members WHERE user_id = 'amlfix-member'").first()))
  await forgetLonely(db)
  check('the person stays known while the company keeps its records, with the removal recorded', Boolean(await db.prepare("SELECT 1 FROM users WHERE id = 'amlfix-member'").first()) && Boolean(await db.prepare("SELECT 1 FROM member_removals WHERE company_id = 'amlfix-co' AND user_id = 'amlfix-member' AND removed_by = 'amlfix-owner'").first()))
  await db.prepare("DELETE FROM member_removals WHERE company_id = 'amlfix-co'").run()
  await forgetLonely(db)
  check('once the company\'s records are purged with the removal, a person of nothing else is forgotten too', !(await db.prepare("SELECT 1 FROM users WHERE id = 'amlfix-member'").first()))

  // Finding 8: payments of an account taken out are kept apart from the books, not erased.
  await db.batch([
    db.prepare("INSERT INTO accounts (id, company_id, iban, link_id, remote_id) VALUES ('amlfix-account', 'amlfix-co', 'SK3112000000198742637541', 'amlfix-link', 'remote')"),
    db.prepare("INSERT INTO payments (id, company_id, account_id, created_at, booked_on, amount_cents, party, ref, source) VALUES ('amlfix-pay', 'amlfix-co', 'amlfix-account', ?, ?, -4210, 'TEST ONLY súkromná platba', 'amlfix-ref', 'bank')").bind(nowS, today),
  ])
  check('an owner takes out an account the books have not touched', await dropAccount(db, 'amlfix-co', 'amlfix-owner', 'amlfix-account') === 'dropped')
  const kept = await db.prepare("SELECT iban, data FROM dropped_payments WHERE id = 'amlfix-pay'").first()
  check('its bank payments leave the company\'s work but are kept with the IBAN until the five years end',
    !(await db.prepare("SELECT 1 FROM payments WHERE id = 'amlfix-pay'").first()) && kept?.iban === 'SK3112000000198742637541' && JSON.parse(kept.data).amount_cents === -4210)

  // Finding 10: a request that never reached the identification ends a year after it was sent.
  const old = nowS - 400 * 86400
  const request = (id, at, status = 'new') => db.prepare("INSERT INTO requests (id, created_at, plan, situation, name, email, privacy_version, status) VALUES (?, ?, 'start', 'new', 'TEST ONLY záujemca', 'prospect@amlfix.test', '2026-10-21', ?)").bind(id, at, status)
  await db.batch([request('amlfix-req-plain', old), request('amlfix-req-order', old), request('amlfix-req-dossier', old), request('amlfix-req-recent', nowS - 100 * 86400)])
  await newOrder('amlfix-lapsed', '91000007', { request: 'amlfix-req-order', expires: nowS - 300 * 86400 })
  await db.prepare("UPDATE orders SET request_id = 'amlfix-req-dossier' WHERE id = 'amlfix-intake'").run()
  await forgetUnidentified({ DB: db, FILES: files })
  const left = async (id) => Boolean(await db.prepare('SELECT 1 FROM requests WHERE id = ?').bind(id).first())
  check('a request with no order is forgotten a year after it was sent', !(await left('amlfix-req-plain')))
  check('so is one whose offer lapsed before any identification, with the offer', !(await left('amlfix-req-order')) && !(await db.prepare("SELECT 1 FROM orders WHERE id = 'amlfix-lapsed'").first()))
  check('one whose identification began, and one sent within the year, are kept', await left('amlfix-req-dossier') && await left('amlfix-req-recent'))

  // Finding 11: the author of an internal report learns the result, not the designated person's reasons.
  await db.prepare("INSERT INTO reports (id, company_id, created_at, created_by, body, decided_at, decided_by, decision, decision_note) VALUES ('amlfix-report', 'amlfix-co', ?, ?, 'TEST ONLY neobvyklé vklady hotovosti', ?, ?, 'not', 'TEST ONLY dôvody určenej osoby')").bind(nowS, lucia.id, nowS, officer.id).run()
  page = await (await acc.get('/ucto/klienti/amlfix-co/aml')).text()
  check('the author reads the result of the report without the reasons', page.includes('TEST ONLY neobvyklé vklady hotovosti') && !page.includes('TEST ONLY dôvody určenej osoby'))
  page = await (await (await freshAdmin()).get('/ucto/klienti/amlfix-co/aml')).text()
  check('the designated person reads the reasons', page.includes('TEST ONLY dôvody určenej osoby'))

  // Finding 12: an archived client's documents are not on the accuracy page.
  const reading = JSON.stringify({ kind: 'invoice_in', party: 'TEST ONLY archívny dodávateľ', totalCents: 1000, currency: 'EUR' })
  await db.batch([
    db.prepare("INSERT INTO companies (id, created_at, name, plan, inbox, accountant_id, closed_at) VALUES ('amlfix-archived', ?, 'TEST ONLY Archív s. r. o.', 'start', 'amlfix02', ?, ?)").bind(nowS, lucia.id, nowS),
    ...['amlfix-archived', 'amlfix-co'].map((company) => db.prepare(`INSERT INTO documents (id, company_id, created_at, source, status, read_by, kind, party, total_cents, vat_cents, currency, booked_at, booked_by, reading)
      VALUES (?, ?, ?, 'upload', 'read', 'claude-haiku-5-5', 'invoice_in', 'TEST ONLY archívny dodávateľ', 1000, 0, 'EUR', ?, ?, ?)`).bind(`${company}-doc`, company, nowS, nowS, lucia.id, reading)),
  ])
  const compared = await comparedOf(db, { id: officer.id, team: 'admin' }, today.slice(0, 7), false)
  check('the accuracy page leaves out archived clients and keeps the others', !compared.some((r) => r.docId === 'amlfix-archived-doc') && compared.some((r) => r.docId === 'amlfix-co-doc'))

  // Findings 14 and 15: europio itself has no identification deadline; reviews of automatic bookings are counted by the
  // Bratislava month and sorted among the rest.
  const operator = (await db.prepare('SELECT id FROM companies WHERE operator = 1').first())?.id
  if (operator) {
    const own = await teamDeadlines(db, officer, false, today, { company: operator })
    check('the operator company gets no AML identification deadline', !own.dues.some((d) => d.kind === 'aml'))
  }
  const midnight = Date.UTC(2026, 8, 30, 22, 30) / 1000 // 1 October 2026, 0:30 in Bratislava
  await db.batch([
    db.prepare("INSERT INTO documents (id, company_id, created_at, source, status, kind, total_cents, vat_cents, currency, booked_at, booked_by) VALUES ('amlfix-auto-1', 'amlfix-co', ?, 'upload', 'read', 'receipt', 500, 0, 'EUR', ?, 'auto')").bind(midnight, midnight),
    db.prepare("INSERT INTO documents (id, company_id, created_at, source, status, kind, total_cents, vat_cents, currency, booked_at, booked_by) VALUES ('amlfix-auto-2', 'amlfix-co', ?, 'upload', 'read', 'receipt', 700, 0, 'EUR', ?, 'auto')").bind(Date.UTC(2026, 7, 14, 10) / 1000, Date.UTC(2026, 7, 14, 10) / 1000),
  ])
  const dues = (await teamDeadlines(db, officer, false, today, { company: 'amlfix-co' })).dues
  const reviews = dues.filter((d) => d.kind === 'amlBooking')
  check('an automatic booking just after midnight in Bratislava belongs to that day\'s month', reviews.some((d) => d.period === '2026-10' && d.day === '2026-11-30') && !reviews.some((d) => d.period === '2026-09'))
  check('the reviews of automatic bookings are sorted among the other deadlines', dues.length > 2 && dues.every((d, i) => i === 0 || dues[i - 1].day <= d.day))

  // Finding 16: the designated person is not demoted while nobody else is appointed.
  await db.prepare("INSERT INTO users (id, created_at, email, name, team) VALUES ('amlfix-admin2', ?, 'admin2@amlfix.test', 'TEST Druhá správkyňa', 'admin')").bind(nowS).run()
  await db.prepare("INSERT INTO aml_officers (user_id, appointed_at, appointed_by, reason) VALUES ('amlfix-admin2', ?, ?, 'TEST ONLY documented programme succession')").bind(nowS, officer.id).run()
  res = await (await freshAdmin()).post('/ucto/tim', { name: 'TEST Druhá správkyňa', email: 'admin2@amlfix.test', rola: 'accountant' })
  check('the current designated person cannot be demoted', res.status === 409 && (await db.prepare("SELECT team FROM users WHERE id = 'amlfix-admin2'").first())?.team === 'admin', String(res.status))
  await db.prepare("INSERT INTO aml_officers (user_id, appointed_at, appointed_by, reason) VALUES (?, ?, 'amlfix-admin2', 'TEST ONLY the programme owner appointed again')").bind(officer.id, nowS).run()
  res = await (await freshAdmin()).post('/ucto/tim', { name: 'TEST Druhá správkyňa', email: 'admin2@amlfix.test', rola: 'accountant' })
  check('once another is appointed, the former designated person can be given another role', res.status === 303 && (await db.prepare("SELECT team FROM users WHERE id = 'amlfix-admin2'").first())?.team === 'accountant', String(res.status))

  // Finding 19: an internal report undecided five years after the end keeps its own company and nothing else back.
  await db.batch([
    db.prepare("INSERT INTO companies (id, created_at, name, plan, inbox, ends_on, closed_at, purged_at, aml_archived_at) VALUES ('amlfix-old', ?, 'TEST ONLY Stará s. r. o.', 'start', 'amlfix03', '2019-12-31', ?, ?, ?)").bind(nowS, nowS, nowS, nowS),
    db.prepare("INSERT INTO reports (id, company_id, created_at, created_by, body) VALUES ('amlfix-old-report', 'amlfix-old', ?, ?, 'TEST ONLY undecided finding')").bind(nowS, lucia.id),
    db.prepare("INSERT INTO users (id, created_at, email, name) VALUES ('amlfix-lonely', ?, 'lonely@amlfix.test', 'TEST Nikoho')").bind(nowS),
  ])
  let threw = false
  try { await purgeEnded({ DB: db, FILES: files }, today) } catch { threw = true }
  check('an undecided report past five years keeps its company and stops no other cleanup',
    !threw && Boolean(await db.prepare("SELECT 1 FROM companies WHERE id = 'amlfix-old'").first()) && !(await db.prepare("SELECT 1 FROM users WHERE id = 'amlfix-lonely'").first()))
}
