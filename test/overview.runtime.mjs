// HTTP and real D1 fixtures: a matched payment must not hide another person's or the client's remaining work.
import { check } from './check.mjs'
import { testDeclaration } from './aml.runtime.mjs'
import { writeFileSync } from 'node:fs'

export async function checkOverviewRuntime({ db, nowS, day, signIn, as, capture }) {
  const company = 'co-overview'
  const primary = (html) => html.match(/data-overview-action="([^"]+)"/)?.[1] ?? null
  const save = (name, html) => { if (capture) writeFileSync(`${capture}/${name}.html`, html) }
  await db.batch([
    db.prepare("INSERT INTO companies(id,created_at,name,ico,plan,inbox,start_on) VALUES(?,?,'TEST-ONLY Prehľad s. r. o.','50888874','rast','overview-test','2026-01-01')").bind(company, nowS),
    db.prepare("INSERT INTO users(id,created_at,email,name) VALUES('j1-overview-owner',?,'j1-overview-owner@example.test','TEST-ONLY Majiteľ'),('j1-overview-member',?,'j1-overview-member@example.test','TEST-ONLY Kolegyňa')").bind(nowS, nowS),
    db.prepare("INSERT INTO members(company_id,user_id,role,created_at,approver,approve_limit) VALUES(?,'j1-overview-owner','owner',?,0,NULL),(?,'j1-overview-member','member',?,1,1000)").bind(company, nowS, company, nowS),
    db.prepare("INSERT INTO declarations(id,company_id,created_at,created_by,data) VALUES('overview-declaration',?,?,'j1-overview-owner',?)").bind(company, nowS, JSON.stringify(testDeclaration())),
    db.prepare("INSERT INTO company_files(id,company_id,kind,created_at,file_name,file_type,file_size,r2_key) VALUES('overview-poa',?,'poa',?,'TEST-ONLY plna moc.pdf','application/pdf',20,'TEST-ONLY/overview/poa.pdf')").bind(company, nowS),
    db.prepare("INSERT INTO accounts(id,company_id,iban,balance_on) VALUES('overview-account',?,'SK3112000000198742637541',?)").bind(company, day(0)),
    db.prepare("INSERT INTO documents(id,company_id,created_at,source,status,kind,party,total_cents,currency,category,issued_on) VALUES('overview-doc',?,?,'firmony','read','invoice_in','TEST-ONLY Dodávateľ',1200,'EUR','services',?)").bind(company, nowS, day(-1)),
    db.prepare("INSERT INTO payments(id,company_id,account_id,created_at,booked_on,amount_cents,ref) VALUES('overview-payment',?,'overview-account',?,?,-1200,'TEST-ONLY overview-payment')").bind(company, nowS, day(-1)),
    db.prepare("INSERT INTO links(document_id,payment_id,company_id,how,created_at) VALUES('overview-doc','overview-payment',?,'auto',?)").bind(company, nowS),
  ])
  const owner = as((await signIn('j1-overview-owner@example.test')).cookie)
  const member = as((await signIn('j1-overview-member@example.test')).cookie)
  const home = async (client = owner) => {
    const response = await client.get('/app')
    const html = await response.text()
    check('overview HTTP: the current company overview answers successfully', response.status === 200)
    return html
  }
  let html = await home()
  check('overview HTTP: Firmony’s own bill does not pretend the client has already provided an accounting document', primary(html) === 'first-document')
  await db.prepare("UPDATE documents SET source='email' WHERE id='overview-doc'").run()
  html = await home()
  check('overview HTTP: matched payments get a strictly scoped statement, not a promise of complete accounting', html.includes('data-overview-state="matched"') && html.replace(/[  ]/g,' ').includes('Doklady k platbám máme.') && html.includes('Týka sa to platieb') && !html.includes('Nemusíte nič robiť.'))
  save('overview-ready', html)
  await db.batch([db.prepare("DELETE FROM links WHERE document_id='overview-doc'"), db.prepare("DELETE FROM payments WHERE id='overview-payment'")])
  html = await home(member)
  check('overview HTTP: unfinished bank setup is explained to a colleague without an owner-only connection link', html.includes('class="first"') && !html.includes('data-overview-action="setup-bank"') && !html.includes('href="/app/banka#prepojit"'))
  save('overview-member-onboarding', html)
  await db.batch([
    db.prepare("INSERT INTO payments(id,company_id,account_id,created_at,booked_on,amount_cents,ref) VALUES('overview-payment',?,'overview-account',?,?,-1200,'TEST-ONLY overview-payment')").bind(company, nowS, day(-1)),
    db.prepare("INSERT INTO links(document_id,payment_id,company_id,how,created_at) VALUES('overview-doc','overview-payment',?,'auto',?)").bind(company, nowS),
  ])

  await db.prepare("UPDATE accounts SET balance_on=? WHERE id='overview-account'").bind(day(-45)).run()
  html = await home()
  check('overview HTTP: a matched company with a missing statement gets the statement as its next step', primary(html) === 'statement' && !html.includes('data-overview-state="matched"'))
  await db.prepare("UPDATE accounts SET balance_on=? WHERE id='overview-account'").bind(day(0)).run()

  await db.prepare("INSERT INTO bank_links(id,company_id,created_at,bank,country,state,status,valid_until,synced_at,error) VALUES('overview-bank',?,?,'TEST-ONLY Banka','SK','TEST-ONLY overview-state','active',?,?,'TEST-ONLY private-provider-error')").bind(company, nowS, nowS + 90 * 86400, nowS - 13 * 3600).run()
  await db.prepare("UPDATE accounts SET link_id='overview-bank' WHERE id='overview-account'").run()
  html = await home()
  check('overview HTTP: a failed bank read has a visible warning and its last successful time, without exposing diagnostics', html.includes('data-overview-state="bank"') && html.includes('Posledné úspešné načítanie') && !html.includes('private-provider-error') && !html.includes('data-overview-state="matched"'))
  save('overview-bank', html)
  await db.prepare("UPDATE bank_links SET error=NULL,synced_at=NULL WHERE id='overview-bank'").run()
  await db.batch([db.prepare("DELETE FROM links WHERE document_id='overview-doc'"), db.prepare("DELETE FROM payments WHERE id='overview-payment'")])
  html = await home()
  check('overview HTTP: an unknown first sync stays unknown without asking to reconnect an already connected bank', html.includes('data-overview-state="bank"') && html.includes('Čas úspešného načítania zatiaľ nemáme potvrdený.') && !html.includes('data-overview-action="setup-bank"'))
  save('overview-zero-bank', html)
  await db.batch([
    db.prepare("INSERT INTO payments(id,company_id,account_id,created_at,booked_on,amount_cents,ref) VALUES('overview-payment',?,'overview-account',?,?,-1200,'TEST-ONLY overview-payment')").bind(company, nowS, day(-1)),
    db.prepare("INSERT INTO links(document_id,payment_id,company_id,how,created_at) VALUES('overview-doc','overview-payment',?,'auto',?)").bind(company, nowS),
  ])
  await db.prepare("UPDATE bank_links SET synced_at=? WHERE id='overview-bank'").bind(nowS - 13 * 3600).run()
  html = await home()
  check('overview HTTP: a delayed read stays visible even without a recorded provider error', html.includes('data-overview-state="bank"') && html.includes('sa dlhšie neaktualizovali.'))
  await db.prepare("UPDATE bank_links SET synced_at=?,valid_until=? WHERE id='overview-bank'").bind(nowS, nowS - 1).run()
  html = await home()
  check('overview HTTP: consent expiry is visible before the schedule changes active to expired', primary(html) === 'bank' && html.replace(/[  ]/g,' ').includes('vypršal a platby sa nenačítavajú.'))
  save('overview-expired', html)
  const memberExpired = await home(member)
  check('overview HTTP: a colleague sees the expiry without an unusable owner-only renewal control', !memberExpired.includes('data-overview-action="bank"') && !memberExpired.includes('>Obnoviť prístup<') && memberExpired.includes('Tento krok dokončí majiteľ účtu firmy.'))
  save('overview-member', memberExpired)
  await db.prepare("UPDATE bank_links SET synced_at=?,valid_until=? WHERE id='overview-bank'").bind(nowS, nowS + 90 * 86400).run()

  await db.prepare("INSERT INTO messages(id,company_id,created_at,side,body) VALUES('overview-question',?,?,'firmony','TEST-ONLY Na čo ste tento nákup použili vo firme?')").bind(company, nowS).run()
  await db.prepare("INSERT INTO messages(id,company_id,created_at,side,body) VALUES('overview-notification',?,?,'client','TEST-ONLY automatické oznámenie')").bind(company, nowS).run()
  html = await home()
  check('overview HTTP: an unread question is visible even when the latest client-side record is a notification', primary(html) === 'message' && html.includes('Prečítať správu'))
  await owner.get('/app/spravy')
  html = await home()
  check('overview HTTP: reading is not presented as proof of an answer or complete service', primary(html) !== 'message' && !html.includes('Nemusíte nič robiť.') && (await db.prepare("SELECT COUNT(*) AS n FROM events WHERE company_id=? AND action='message.sent'").bind(company).first()).n === 0)

  await db.prepare("INSERT INTO statements(id,company_id,iban,created_at,source,status) VALUES('overview-confirm',?,'SK2283300000002801234567',?,'upload','confirm')").bind(company, nowS).run()
  html = await home()
  check('overview HTTP: the owner is directed to the actual pending account confirmation', primary(html) === 'account' && html.includes('href="#potvrdit-overview-confirm"') && html.includes('id="potvrdit-overview-confirm"'))
  html = await home(member)
  check('overview HTTP: a colleague cannot get a confirmation action through the overview', !html.includes('data-overview-action="account"') && !html.includes('action="/app/vypisy/overview-confirm/ucet"'))
  await db.prepare("UPDATE statements SET status='refused' WHERE id='overview-confirm'").run()

  await db.batch([
    db.prepare('UPDATE companies SET approvals=1 WHERE id=?').bind(company),
    db.prepare("INSERT INTO documents(id,company_id,created_at,source,status,kind,party,party_iban,number,total_cents,currency,category,issued_on,due_on) VALUES('overview-approval',?,?,'upload','read','invoice_in','TEST-ONLY Schváliť','SK8975000000000012345671','TEST-ONLY AP',1200,'EUR','services',?,?)").bind(company, nowS, day(-2), day(2)),
  ])
  html = await home()
  check('overview HTTP: an eligible owner sees the same approval as the existing queue', primary(html) === 'approval' && (await (await owner.get('/app/schvalovanie')).text()).includes('href="/app/doklady/overview-approval#schvalenie"'))
  save('overview-approval', html)
  check('overview HTTP: an amount above a colleague’s limit does not become her approval action', !(await home(member)).includes('data-overview-action="approval"'))
  await db.prepare("UPDATE members SET approve_limit=2000 WHERE company_id=? AND user_id='j1-overview-member'").bind(company).run()
  check('overview HTTP: increasing the current limit makes the action eligible', primary(await home(member)) === 'approval')
  await db.batch([
    db.prepare('UPDATE companies SET approval_two_from=1000 WHERE id=?').bind(company),
    db.prepare("UPDATE documents SET first_approved_by='j1-overview-member',first_approved_at=? WHERE id='overview-approval'").bind(nowS),
  ])
  check('overview HTTP: a first approver is never asked to give her own second approval', !(await home(member)).includes('data-overview-action="approval"') && primary(await home()) === 'approval')

  await db.batch([
    db.prepare("INSERT INTO invoices(id,company_id,created_at,status,number,customer_name,issued_on,delivered_on,due_on,base_cents,vat_cents,total_cents,token) VALUES('overview-bill',?,?,'issued','TEST-ONLY BILL','TEST-ONLY Prehľad',?,?,?,8900,0,8900,'TEST-ONLY overview-bill-token')").bind(company, nowS, day(-10), day(-10), day(-1)),
    db.prepare("INSERT INTO billing_invoices(invoice_id,client_id,month,document_id,created_at) VALUES('overview-bill',?,?,'TEST-ONLY bill-copy',?)").bind(company, day(0).slice(0, 7), nowS),
    db.prepare("UPDATE accounts SET link_id=NULL,balance_on=? WHERE id='overview-account'").bind(day(-45)),
    db.prepare("UPDATE bank_links SET status='revoked' WHERE id='overview-bank'"),
  ])
  html = await home()
  check('overview HTTP: a due bill leads while the statement and personal approval remain visible', /^deadline-/.test(primary(html) ?? '') && html.includes('data-overview-action="statement"') && html.includes('data-overview-action="approval"') && html.includes('href="/app/firma#faktury-firmony"'))
  save('overview-actions', html)
  await db.batch([db.prepare("DELETE FROM links WHERE document_id='overview-doc'"), db.prepare("DELETE FROM payments WHERE id='overview-payment'")])
  html = await home()
  check('overview HTTP: a company with no bank movements still sees its due bill first', /^deadline-/.test(primary(html) ?? '') && html.includes('href="/app/firma#faktury-firmony"'))
  save('overview-no-payments', html)
  await db.batch([
    db.prepare("INSERT INTO statements(id,company_id,account_id,iban,created_at,source,status,entries,closing_on) VALUES('overview-zero-statement',?,'overview-account','SK3112000000198742637541',?,'upload','known',0,?)").bind(company, nowS, day(0)),
    db.prepare("UPDATE accounts SET balance_on=? WHERE id='overview-account'").bind(day(0)),
  ])
  html = await home()
  check('overview HTTP: an accepted statement with no movements completes bank setup without a new connection request', !html.includes('data-overview-action="setup-bank"') && !html.includes('class="first"'))

  await db.batch(Array.from({ length: 243 }, (_, i) => db.prepare("INSERT INTO payments(id,company_id,account_id,created_at,booked_on,amount_cents,ref) VALUES(?,?,'overview-account',?,?,-1200,?)").bind(`overview-missing-${i}`, company, nowS, day(-1), `TEST-ONLY missing-${i}`)))
  html = await home()
  check('overview HTTP: the missing-document count is not truncated to the 200 fetched suggestions', html.replace(/[  ]/g,' ').includes('K 243 platbám chýbajú doklady.') && !html.replace(/[  ]/g,' ').includes('K 200 platbám chýbajú doklady.'))
  await db.batch([
    db.prepare("UPDATE bank_links SET status='active',valid_until=? WHERE id='overview-bank'").bind(nowS - 1),
    db.prepare('UPDATE companies SET ends_on=?,notice_at=?,notice_side=\'client\' WHERE id=?').bind(day(-11), nowS - 20 * 86400, company),
  ])
  html = await home()
  check('overview HTTP: closed intake leads to export and never asks for the old active tasks', html.includes('data-overview-state="ended"') && !html.includes('data-overview-action=') && html.includes('href="/app/firma#stiahnut"') && !html.includes('class="first"'))
  save('overview-closed', html)
}
