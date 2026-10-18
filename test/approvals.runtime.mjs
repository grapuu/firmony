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
  res = await a.post('/app/doklady/ap-small/schvalit', {})
  check('an approver within his limit approves alone', res.status === 303 && (await db.prepare('SELECT approved_by FROM documents WHERE id = ?').bind('ap-small').first())?.approved_by === 'u-appr-a')
  check('above his limit he cannot', (await a.post('/app/doklady/ap-big/schvalit', {})).status === 403)
  page = plain(await (await a.get('/app/doklady/ap-big')).text())
  check(
    'the page says who may, and that two approve it',
    page.includes('Od 5 000 € ju schvaľujú dvaja') && page.includes('schvaľovateľ s dostatočným limitom') && !page.includes('/app/doklady/ap-big/schvalit'),
  )

  // Two approvals: the first kept, never twice by the same person, the second by somebody else.
  res = await b.post('/app/doklady/ap-big/schvalit', {})
  let big = await db.prepare('SELECT approved_at, first_approved_by FROM documents WHERE id = ?').bind('ap-big').first()
  check('the first of two is kept, the invoice not approved yet', (res.headers.get('location') ?? '').includes('schvalene-prve') && big?.approved_at === null && big.first_approved_by === 'u-appr-b')
  res = await b.post('/app/doklady/ap-big/schvalit', {})
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
  res = await owner.post('/app/doklady/ap-big/schvalit', {})
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
}
