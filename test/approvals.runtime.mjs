// Approving for larger companies (18 October 2026), in workerd: an owner makes colleagues approvers, one with a limit,
// and asks two approvals from 5 000 €; an approver within his limit approves alone, above it cannot; the first of two
// approvals is kept and its own approver cannot give the second; another person approves it whole; the queue shows what
// each may approve; a changed total takes an approval back.
import { check } from './check.mjs'
import { writeFileSync } from 'node:fs'

export async function checkApprovals({ db, acc, lucia, nowS, signIn, as, day, capture }) {
  const company = 'co-approvals'
  const plain = (text) => text.replace(/[  ]/g, ' ')
  const sk = (d) => `${Number(d.slice(8))}. ${Number(d.slice(5, 7))}. ${d.slice(0, 4)}`
  const doc = (id, party, cents) =>
    db
      .prepare(
        `INSERT INTO documents (id, company_id, created_at, source, status, kind, party, number, party_iban, issued_on, due_on, total_cents, vat_cents, currency, category)
         VALUES (?, ?, ?, 'upload', 'read', 'invoice_in', ?, ?, 'SK8975000000000012345671', ?, ?, ?, 0, 'EUR', 'services')`,
      )
      .bind(id, company, nowS, party, id.toUpperCase(), day(-10), day(5), cents)
  await db.batch([
    db
      .prepare(
        "INSERT INTO companies (id, created_at, name, ico, address, vat_payer, plan, inbox, start_on, accountant_id, approvals) VALUES (?, ?, 'TEST-ONLY Schvaľovanie a. s.', '50777880', 'Hlavná 20, 811 01 Bratislava', 0, 'firma', 'schv0001', '2026-01-01', ?, 1)",
      )
      .bind(company, nowS, lucia.id),
    db
      .prepare(
        "INSERT INTO users (id, created_at, email, name) VALUES ('u-appr-owner', ?, 'appr-owner@example.sk', 'TEST-ONLY Riaditeľ'), ('u-appr-a', ?, 'appr-a@example.sk', 'TEST-ONLY Vedúca'), ('u-appr-b', ?, 'appr-b@example.sk', 'TEST-ONLY Finančák')",
      )
      .bind(nowS, nowS, nowS),
    db
      .prepare("INSERT INTO members (company_id, user_id, role, created_at) VALUES (?, 'u-appr-owner', 'owner', ?), (?, 'u-appr-a', 'member', ?), (?, 'u-appr-b', 'member', ?)")
      .bind(company, nowS, company, nowS, company, nowS),
    doc('ap-small', 'TEST-ONLY Papiernictvo s. r. o.', 30000),
    doc('ap-big', 'TEST-ONLY Stavebná s. r. o.', 800000),
  ])
  // An approval carries what the page showed of the invoice (approvals.ts, `approvalSeen`).
  const shown = async (client, id) => {
    const html = await (await client.get(`/app/doklady/${id}`)).text()
    return html.match(/name="stav" value="([^"]*)"/)?.[1]?.replace(/&#124;|&amp;#124;/g, '|') ?? ''
  }
  const approveAs = async (client, id) => client.post(`/app/doklady/${id}/schvalit`, { stav: await shown(client, id) })
  const owner = as((await signIn('appr-owner@example.sk')).cookie)
  const a = as((await signIn('appr-a@example.sk')).cookie)
  const b = as((await signIn('appr-b@example.sk')).cookie)
  let page = plain(await (await owner.get('/app/firma')).text())
  check('the owner sets approvers, their limits and two approvals', page.includes('name="dve_od"') && page.includes('name="schvalovatel_u-appr-a"') && page.includes('name="limit_u-appr-b"'))
  let res = await owner.post('/app/firma/schvalovanie', { zapnut: '1', dve_od: 'veľa', schvalovatelia: '1' })
  check(
    'an amount that is none is refused and nothing is kept',
    (res.headers.get('location') ?? '').includes('schvalovanie-zle') && (await db.prepare('SELECT approval_two_from FROM companies WHERE id = ?').bind(company).first())?.approval_two_from === null,
  )
  check('a colleague sets nothing', (await a.post('/app/firma/schvalovanie', { zapnut: '1', dve_od: '1' })).status === 403)
  res = await owner.post('/app/firma/schvalovanie', {
    zapnut: '1',
    dve_od: '5 000',
    schvalovatelia: '1',
    'schvalovatel_u-appr-a': '1',
    'limit_u-appr-a': '1 000',
    'schvalovatel_u-appr-b': '1',
    'limit_u-appr-b': '',
  })
  const members = (await db.prepare('SELECT user_id, approver, approve_limit FROM members WHERE company_id = ? ORDER BY user_id').bind(company).all()).results
  check(
    'kept: two approvals from 5 000 €, the head of department up to 1 000 €, finance without a limit',
    res.status === 303 &&
      (await db.prepare('SELECT approval_two_from FROM companies WHERE id = ?').bind(company).first())?.approval_two_from === 500000 &&
      JSON.stringify(members.map((m) => [m.user_id, m.approver, m.approve_limit])) === '[["u-appr-a",1,100000],["u-appr-b",1,null],["u-appr-owner",0,null]]',
    JSON.stringify(members),
  )
  page = plain(await (await a.get('/app/firma')).text())
  check('a colleague sees what he approves', page.includes('schvaľuje do 1 000,00 €') && page.includes('Od 5 000,00 € schvaľujú dvaja'))

  // The queue of each.
  const raw = await (await a.get('/app/schvalovanie')).text()
  if (capture) writeFileSync(`${capture}/approvals.html`, raw)
  page = plain(raw)
  const mineAt = page.indexOf('Môžete schváliť')
  const othersAt = page.indexOf('Čakajú na iných')
  check(
    'the queue: what he may approve first, an amount above his limit waits for others',
    mineAt > 0 &&
      othersAt > mineAt &&
      page.indexOf('TEST-ONLY Papiernictvo') > mineAt &&
      page.indexOf('TEST-ONLY Papiernictvo') < othersAt &&
      page.indexOf('TEST-ONLY Stavebná') > othersAt &&
      page.includes('nad váš limit'),
  )
  page = plain(await (await owner.get('/app/doklady')).text())
  check('the documents lead to the queue', page.includes('href="/app/schvalovanie"'))

  // Within the limit alone; above it not.
  res = await approveAs(a, 'ap-small')
  check('an approver within his limit approves alone', res.status === 303 && (await db.prepare('SELECT approved_by FROM documents WHERE id = ?').bind('ap-small').first())?.approved_by === 'u-appr-a')
  check('above his limit he cannot', (await a.post('/app/doklady/ap-big/schvalit', {})).status === 403)
  page = plain(await (await a.get('/app/doklady/ap-big')).text())
  check(
    'the page says who may, and that two approve it',
    page.includes('Od 5 000 € ju schvaľujú dvaja') && page.includes('schvaľovateľ s dostatočným limitom') && !page.includes('/app/doklady/ap-big/schvalit'),
  )

  // Two approvals: the first kept, never twice by the same person, the second by somebody else.
  res = await approveAs(b, 'ap-big')
  let big = await db.prepare('SELECT approved_at, first_approved_by FROM documents WHERE id = ?').bind('ap-big').first()
  check('the first of two is kept, the invoice not approved yet', (res.headers.get('location') ?? '').includes('schvalene-prve') && big?.approved_at === null && big.first_approved_by === 'u-appr-b')
  res = await b.post('/app/doklady/ap-big/schvalit', { stav: '800000|EUR|SK8975000000000012345671' })
  big = await db.prepare('SELECT approved_at FROM documents WHERE id = ?').bind('ap-big').first()
  page = plain(await (await b.get('/app/doklady/ap-big')).text())
  check(
    'the same person cannot give the second',
    (res.headers.get('location') ?? '').includes('schvalene-druhy') && big?.approved_at === null && page.includes('Prvé schválenie: TEST-ONLY Finančák') && page.includes('druhé musí dať niekto iný'),
  )
  page = plain(await (await owner.get('/app/doklady/ap-big')).text())
  check('somebody else is offered the second', page.includes('Schváliť ako druhý'))
  page = plain(await (await owner.get('/app/uhrady')).text())
  check('one approval of two does not let it into a payment order', !page.includes('type="checkbox" name="doklad" value="ap-big"'))
  res = await approveAs(owner, 'ap-big')
  big = await db.prepare('SELECT approved_by, first_approved_by FROM documents WHERE id = ?').bind('ap-big').first()
  page = plain(await (await owner.get('/app/uhrady')).text())
  check('approved whole by the second, it may be paid', big?.approved_by === 'u-appr-owner' && big.first_approved_by === 'u-appr-b' && page.includes('type="checkbox" name="doklad" value="ap-big"'))

  // A total changed on the booking screen takes the approval back.
  res = await acc.post('/ucto/doklady/ap-small', {
    akcia: 'ulozit',
    kind: 'invoice_in',
    party: 'TEST-ONLY Papiernictvo s. r. o.',
    total: '310,00',
    vat: '',
    category: 'services',
    issued: sk(day(-10)),
    due: sk(day(5)),
  })
  const small = await db.prepare('SELECT total_cents, approved_at FROM documents WHERE id = ?').bind('ap-small').first()
  check('another total takes the approval back', res.status === 303 && small?.total_cents === 31000 && small.approved_at === null, JSON.stringify(small))
  res = await acc.post('/ucto/doklady/ap-big', {
    akcia: 'ulozit',
    kind: 'invoice_in',
    party: 'TEST-ONLY Stavebná s. r. o.',
    total: '8000,00',
    vat: '',
    category: 'services',
    issued: sk(day(-10)),
    due: sk(day(5)),
  })
  check('the same total keeps it', res.status === 303 && (await db.prepare('SELECT approved_by FROM documents WHERE id = ?').bind('ap-big').first())?.approved_by === 'u-appr-owner')
  res = await b.post('/app/doklady/ap-big/neschvalit', {})
  big = await db.prepare('SELECT approved_at, first_approved_at FROM documents WHERE id = ?').bind('ap-big').first()
  check('taken back, both approvals go', res.status === 303 && big?.approved_at === null && big.first_approved_at === null)

  // The review of 18 October 2026, a check for each finding mended.
  await db.batch([
    db.prepare("INSERT INTO users (id, created_at, email, name) VALUES ('u-appr-c', ?, 'appr-c@example.sk', 'TEST-ONLY Asistentka')").bind(nowS),
    db.prepare("INSERT INTO members (company_id, user_id, role, created_at) VALUES (?, 'u-appr-c', 'member', ?)").bind(company, nowS),
    db
      .prepare(
        `INSERT INTO documents (id, company_id, created_at, source, status, kind, party, number, issued_on, due_on, total_cents, vat_cents, currency, category)
         VALUES ('ap-noiban', ?, ?, 'upload', 'read', 'invoice_in', 'TEST-ONLY Bez účtu s. r. o.', 'AP-NOIBAN', ?, ?, 50000, 0, 'EUR', 'services')`,
      )
      .bind(company, nowS, day(-10), day(5)),
    doc('ap-zero', 'TEST-ONLY Nula s. r. o.', 0),
    doc('ap-big2', 'TEST-ONLY Druhá stavebná s. r. o.', 700000),
    doc('ap-big3', 'TEST-ONLY Tretia stavebná s. r. o.', 600000),
    doc('ap-stale', 'TEST-ONLY Zmenená s. r. o.', 20000),
  ])
  const cc = as((await signIn('appr-c@example.sk')).cookie)
  const settings = (aLimit, bLimit, twoFrom) =>
    owner.post('/app/firma/schvalovanie', {
      zapnut: '1',
      dve_od: twoFrom,
      schvalovatelia: '1',
      'schvalovatel_u-appr-a': '1',
      'limit_u-appr-a': aLimit,
      'schvalovatel_u-appr-b': '1',
      'limit_u-appr-b': bLimit,
    })

  // A colleague who typed the supplier's IBAN never approves that invoice himself; somebody else does.
  res = await a.post('/app/uhrady/iban', { doklad: 'ap-noiban', iban: 'SK31 1200 0000 1987 4263 7541' })
  check(
    'a colleague types a missing IBAN, kept with who typed it',
    res.status === 303 && (await db.prepare('SELECT iban_by FROM documents WHERE id = ?').bind('ap-noiban').first())?.iban_by === 'u-appr-a',
  )
  page = plain(await (await a.get('/app/doklady/ap-noiban')).text())
  res = await a.post('/app/doklady/ap-noiban/schvalit', { stav: '50000|EUR|SK3112000000198742637541' })
  check(
    'the colleague who typed it cannot approve it, within his limit as it is',
    (res.headers.get('location') ?? '').includes('schvalenie-iban') &&
      (await db.prepare('SELECT approved_at FROM documents WHERE id = ?').bind('ap-noiban').first())?.approved_at === null &&
      page.includes('Účet dodávateľa ste doplnili vy') &&
      !page.includes('/app/doklady/ap-noiban/schvalit'),
  )
  page = plain(await (await a.get('/app/schvalovanie')).text())
  check('his queue says so', page.includes('účet ste doplnili vy'))
  res = await approveAs(b, 'ap-noiban')
  check('somebody else approves it', (await db.prepare('SELECT approved_by FROM documents WHERE id = ?').bind('ap-noiban').first())?.approved_by === 'u-appr-b')

  // The queue: only what a payment order pays; a colleague who approves nothing sees that it waits for an approver.
  page = plain(await (await cc.get('/app/schvalovanie')).text())
  check(
    'nothing to pay is not in the queue; a colleague who is no approver sees whom it waits for',
    !page.includes('TEST-ONLY Nula') && page.includes('čaká na schvaľovateľa') && !page.includes('nad váš limit'),
  )
  check('and he approves nothing', (await cc.post('/app/doklady/ap-big2/schvalit', { stav: '700000|EUR|SK8975000000000012345671' })).status === 403)

  // A first approval left when the owners raise the amount of two: one is enough, also his own.
  res = await approveAs(owner, 'ap-big2')
  check('the owner gives the first of two', (res.headers.get('location') ?? '').includes('schvalene-prve'))
  res = await settings('1 000', '', '10 000')
  page = plain(await (await owner.get('/app/doklady/ap-big2')).text())
  check('the amount of two raised above it: his own approval is offered as enough', res.status === 303 && page.includes('Schváliť na úhradu') && !page.includes('druhé musí dať niekto iný'))
  res = await approveAs(owner, 'ap-big2')
  check('and approves it whole', (await db.prepare('SELECT approved_by FROM documents WHERE id = ?').bind('ap-big2').first())?.approved_by === 'u-appr-owner')

  // A first approval counts only while its approver may approve the amount.
  await settings('1 000', '', '5 000')
  res = await approveAs(b, 'ap-big3')
  check('finance gives the first of two', (res.headers.get('location') ?? '').includes('schvalene-prve'))
  await settings('1 000', '1 000', '5 000')
  page = plain(await (await owner.get('/app/doklady/ap-big3')).text())
  res = await approveAs(owner, 'ap-big3')
  let big3 = await db.prepare('SELECT approved_at, first_approved_by FROM documents WHERE id = ?').bind('ap-big3').first()
  check(
    'his limit lowered below it, his first approval counts for nothing: the next is the first',
    page.includes('kto túto sumu už schvaľovať nemôže') && (res.headers.get('location') ?? '').includes('schvalene-znova') && big3?.approved_at === null && big3.first_approved_by === 'u-appr-owner',
  )

  // An approval of what the page showed: a total changed meanwhile asks to look again.
  const stale = await shown(owner, 'ap-stale')
  const book = (fields) =>
    acc.post('/ucto/doklady/ap-stale', {
      akcia: 'ulozit',
      kind: 'invoice_in',
      party: 'TEST-ONLY Zmenená s. r. o.',
      total: '200,00',
      vat: '',
      category: 'services',
      issued: sk(day(-10)),
      due: sk(day(5)),
      ...fields,
    })
  await book({ total: '210,00' })
  res = await owner.post('/app/doklady/ap-stale/schvalit', { stav: stale })
  check(
    'a page opened before the total changed approves nothing',
    stale === '20000|EUR|SK8975000000000012345671' &&
      (res.headers.get('location') ?? '').includes('schvalenie-zmena') &&
      (await db.prepare('SELECT approved_at FROM documents WHERE id = ?').bind('ap-stale').first())?.approved_at === null,
  )
  res = await approveAs(owner, 'ap-stale')
  check('looked at again, it is approved', (await db.prepare('SELECT approved_by FROM documents WHERE id = ?').bind('ap-stale').first())?.approved_by === 'u-appr-owner')
  await book({ total: '210,00', vs: '2026001' })
  check(
    'a variable symbol given on the booking screen takes the approval back',
    (await db.prepare('SELECT approved_at, vs FROM documents WHERE id = ?').bind('ap-stale').first())?.approved_at === null,
  )
}
