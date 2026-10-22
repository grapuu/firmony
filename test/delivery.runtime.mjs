// Real Worker/D1/R2: a transport retry confirms the same work without crossing account/company boundaries.
import { check } from './check.mjs'
import { randomUUID } from 'node:crypto'

export async function checkDeliveryRuntime({ mf, db, signIn, nowS, day }) {
  const site = 'https://firmony.io', company = 'co-j2-delivery', user = 'j2-delivery-owner', context = `${user}:${company}`
  await db.batch([
    db.prepare("INSERT INTO companies(id,created_at,name,ico,plan,inbox,start_on) VALUES(?,?,'TEST-ONLY Odovzdanie','50888874','rast','j2-delivery','2026-01-01')").bind(company, nowS),
    db.prepare("INSERT INTO users(id,created_at,email,name) VALUES(?,?,'j2-delivery@example.test','TEST-ONLY Odovzdanie')").bind(user, nowS),
    db.prepare("INSERT INTO members(company_id,user_id,role,created_at) VALUES(?,?,'owner',?)").bind(company, user, nowS),
    db.prepare("INSERT INTO accounts(id,company_id,iban) VALUES('j2-delivery-account',?,'SK3112000000198742637541')").bind(company),
    db.prepare("INSERT INTO payments(id,company_id,account_id,created_at,booked_on,amount_cents,ref) VALUES('j2-delivery-payment',?,'j2-delivery-account',?,?,-1200,'TEST-ONLY j2-payment')").bind(company, nowS, day(-1)),
  ])
  const cookie = (await signIn('j2-delivery@example.test')).cookie
  const post = async (path, fields = {}, files = [], scope = context, enhanced = true) => {
    const form = new FormData()
    for (const [key, value] of Object.entries(fields)) form.append(key, value)
    for (const file of files) form.append('file', new Blob([file.bytes]), file.name)
    const encoded = new Request(`${site}${path}`, { method: 'POST', body: form })
    const body = new Uint8Array(await encoded.arrayBuffer())
    return mf.dispatchFetch(`${site}${path}`, { method: 'POST', body, redirect: 'manual', headers: {
      cookie, origin: site, 'cf-connecting-ip': '203.0.113.72', 'content-type': encoded.headers.get('content-type'), 'content-length': String(body.length),
      ...(enhanced ? { accept: 'application/json', 'x-firmony-context': scope } : {}),
    } })
  }
  const picture = { name: 'TEST-ONLY foto.jpg', bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 72, 12, 1]) }
  let res = await post('/app/doklady', {}, [picture]), receipt = await res.json()
  check('delivery HTTP: an upload has an explicit scoped receipt only after persistence', res.status === 200 && receipt.upload === 1 && receipt.context === context && receipt.accepted === 1 && receipt.added === 1 && receipt.next === '/app/doklady')
  res = await post('/app/doklady', {}, [picture]); receipt = await res.json()
  check('delivery HTTP: a retry confirms the existing file without adding a second document', res.status === 200 && receipt.accepted === 1 && receipt.added === 0 && receipt.known === 1 && (await db.prepare('SELECT COUNT(*) AS n FROM documents WHERE company_id=?').bind(company).first()).n === 1)
  const invalid = { name: '<TEST-ONLY invalid>.exe', bytes: new TextEncoder().encode('not a receipt') }
  res = await post('/app/doklady', {}, [invalid]); receipt = await res.json()
  check('delivery HTTP: a rejected file is never acknowledged as received', res.status === 422 && receipt.accepted === 0 && receipt.problems.length === 1)
  const second = { name: 'TEST-ONLY second.pdf', bytes: new TextEncoder().encode('%PDF-1.7\nTEST-ONLY second') }
  res = await post('/app/doklady', {}, [second, invalid]); receipt = await res.json()
  check('delivery HTTP: a mixed request distinguishes its accepted and rejected files', res.status === 200 && receipt.accepted === 1 && receipt.added === 1 && receipt.problems.length === 1)
  const before = (await db.prepare('SELECT COUNT(*) AS n FROM documents WHERE company_id=?').bind(company).first()).n
  for (const scope of ['different-user:co-j2-delivery', `${user}:different-company`, '']) {
    res = await post('/app/doklady', {}, [{ ...picture, bytes: new Uint8Array([...picture.bytes, 9]) }], scope)
    check('delivery HTTP: a missing or changed account/company context blocks writes', res.status === 409 && (await res.json()).error && (await db.prepare('SELECT COUNT(*) AS n FROM documents WHERE company_id=?').bind(company).first()).n === before)
  }
  res = await post('/app/platby/j2-delivery-payment/doklad', {}, [picture]); receipt = await res.json()
  check('delivery HTTP: an existing file can be acknowledged on its payment without another document', res.status === 200 && receipt.accepted === 1 && receipt.next === '/app/platby/j2-delivery-payment' && (await db.prepare("SELECT COUNT(*) AS n FROM links WHERE payment_id='j2-delivery-payment'").first()).n === 1)
  res = await post('/app/platby/j2-delivery-payment/doklad', {}, [picture]); receipt = await res.json()
  check('delivery HTTP: repeating the payment upload preserves one link', receipt.accepted === 1 && (await db.prepare("SELECT COUNT(*) AS n FROM links WHERE payment_id='j2-delivery-payment'").first()).n === 1)
  res = await post('/app/doklady', {}, [invalid], context, false)
  check('delivery HTTP: ordinary non-JavaScript validation remains a complete HTML page', res.status === 422 && (res.headers.get('content-type') ?? '').includes('text/html') && (await res.text()).includes('TEST-ONLY invalid'))

  const id = randomUUID(), fields = { sprava: 'TEST-ONLY Odpoveď k nákupu.\r\nĎakujem.', platba: 'j2-delivery-payment', odoslanie: id }
  res = await post('/app/spravy', fields); receipt = await res.json()
  check('delivery HTTP: a message receipt names the persisted submission and its context', res.status === 200 && receipt.message === 1 && receipt.id === id && receipt.context === context)
  res = await post('/app/spravy', fields)
  check('delivery HTTP: repeating a confirmed message does not duplicate it or its audit event', res.status === 200 && (await res.json()).id === id && (await db.prepare('SELECT COUNT(*) AS n FROM messages WHERE id=?').bind(id).first()).n === 1 && (await db.prepare("SELECT COUNT(*) AS n FROM events WHERE subject=? AND action='message.sent'").bind(id).first()).n === 1)
  const concurrent = { sprava: 'TEST-ONLY concurrent', odoslanie: randomUUID() }
  const replies = await Promise.all([post('/app/spravy', concurrent), post('/app/spravy', concurrent)])
  check('delivery HTTP: concurrent identical submissions both confirm one atomic message', replies.every((r) => r.status === 200) && (await db.prepare("SELECT COUNT(*) AS n FROM events WHERE subject=? AND action='message.sent'").bind(concurrent.odoslanie).first()).n === 1)
  const outbox = (await db.prepare("SELECT COUNT(*) AS n FROM outbox WHERE id LIKE 'bell:message:%'").first()).n
  res = await post('/app/spravy', { ...fields, sprava: 'TEST-ONLY altered' })
  check('delivery HTTP: reusing a submission for a different body is rejected without changing the original', res.status === 409 && (await db.prepare('SELECT body FROM messages WHERE id=?').bind(id).first()).body === fields.sprava.replace(/\r\n/g, '\n'))
  res = await post('/app/spravy', fields, [], `${user}:different-company`)
  check('delivery HTTP: a stale company tab cannot replay a message into the current session company', res.status === 409 && (await db.prepare("SELECT COUNT(*) AS n FROM outbox WHERE id LIKE 'bell:message:%'").first()).n === outbox)
  res = await post('/app/spravy', { ...fields, odoslanie: randomUUID(), sprava: 'x'.repeat(4001) }, [], context, false)
  const html = await res.text()
  check('delivery HTTP: a native validation failure preserves the text and valid payment context', res.status === 422 && html.includes('name="platba" value="j2-delivery-payment"') && html.includes('x'.repeat(4000)) && html.includes('name="odoslanie"'))
  const legacy = { sprava: 'TEST-ONLY ordinary form', odoslanie: randomUUID() }
  res = await post('/app/spravy', legacy, [], context, false)
  const repeated = await post('/app/spravy', legacy, [], context, false)
  check('delivery HTTP: ordinary form retries retain the existing redirect and one message', res.status === 303 && repeated.status === 303 && repeated.headers.get('location') === '/app/spravy?ok=poslane#posledna' && (await db.prepare('SELECT COUNT(*) AS n FROM messages WHERE id=?').bind(legacy.odoslanie).first()).n === 1)
  await db.prepare('UPDATE companies SET ends_on=? WHERE id=?').bind(day(-20), company).run()
  res = await post('/app/doklady', {}, [picture]); receipt = await res.json()
  check('delivery HTTP: closed intake cannot issue a successful upload receipt', res.status === 409 && receipt.accepted === 0 && receipt.problems.length === 1)
}
