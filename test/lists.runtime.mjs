// The client's lists past 400 (18 October 2026), in workerd: a company with 405 payments and 405 documents sees the
// newest 400 and a link to the older page, which shows the rest and leads back.
import { check } from './check.mjs'

export async function checkLists({ db, nowS, signIn, as }) {
  const company = 'co-many'
  await db.batch([
    db
      .prepare(
        "INSERT INTO companies (id, created_at, name, ico, vat_payer, plan, inbox, start_on) VALUES (?, ?, 'TEST-ONLY Veľa dokladov s. r. o.', '50666663', 0, 'firma', 'many0001', '2026-01-01')",
      )
      .bind(company, nowS),
    db.prepare("INSERT INTO users (id, created_at, email, name) VALUES ('u-many', ?, 'many@example.sk', 'TEST-ONLY Mnohý')").bind(nowS),
    db.prepare("INSERT INTO members (company_id, user_id, role, created_at) VALUES (?, 'u-many', 'owner', ?)").bind(company, nowS),
    db.prepare("INSERT INTO accounts (id, company_id, iban) VALUES ('acc-many', ?, 'SK3112000000198742637541')").bind(company),
    db
      .prepare(
        `WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 405)
         INSERT INTO payments (id, company_id, account_id, created_at, booked_on, amount_cents, currency, party, ref, source)
         SELECT 'pm-' || i, ?1, 'acc-many', ?2 + i, date('2026-01-01', '+' || (i % 250) || ' days'), -100 - i, 'EUR', 'TEST-ONLY Obchod ' || i, 'ref-' || i, 'statement' FROM n`,
      )
      .bind(company, nowS),
    db
      .prepare(
        `WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 405)
         INSERT INTO documents (id, company_id, created_at, source, status, kind, party, total_cents, currency)
         SELECT 'dm-' || i, ?1, ?2 - 40000 + i * 60, 'upload', 'read', 'receipt', 'TEST-ONLY Dodávateľ ' || i, 100 + i, 'EUR' FROM n`,
      )
      .bind(company, nowS),
  ])
  const client = as((await signIn('many@example.sk')).cookie)
  const count = (html, prefix) => (html.match(new RegExp(`href="/app/${prefix}/`, 'g')) ?? []).length
  let page = await (await client.get('/app/platby?filter=vsetky')).text()
  check(
    '400 payments a page, the newest first, and a link to the older ones',
    count(page, 'platby') >= 400 && page.includes('/app/platby?filter=vsetky&amp;strana=2') && page.includes('Staršie') && !page.includes('Novšie'),
  )
  page = await (await client.get('/app/platby?filter=vsetky&strana=2')).text()
  check('the older page has the rest and leads back', page.includes('TEST-ONLY Obchod 1<') && page.includes('Novšie') && !page.includes('strana=3'))
  page = await (await client.get('/app/doklady')).text()
  check('400 documents a page and a link to the older ones', page.includes('/app/doklady?strana=2') && !page.includes('TEST-ONLY Dodávateľ 1<'))
  page = await (await client.get('/app/doklady?strana=2')).text()
  check('the oldest documents on the second page', page.includes('TEST-ONLY Dodávateľ 1<') && page.includes('Novšie'))
}
