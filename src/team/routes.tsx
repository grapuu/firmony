// The accountants' side under /ucto. Only somebody of the team gets in: a client who types the address gets the
// same "not found" as for anything that does not exist. Every company, document and payment is checked against
// what the user may see (an accountant her own clients, an administrator everybody).
import { Hono, type Context } from 'hono'
import { html } from 'hono/html'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { APP, ART, BRAND, ENDING, PLANS, TEAM } from '../config'
import { ensureSchema, now } from '../db'
import { isLocal, later, siteOrigin } from '../http'
import { formatIco, normalizeIco } from '../ico'
import { flushOutbox, queueStatement } from '../mail'
import { bell, ringStatement } from '../bell'
import { lookupCompany } from '../rpo'
import { dayOfText, isCategory, supplierKey, type PaidBy } from '../app/booking'
import { getInvoice, invoiceLines } from '../app/invoices'
import { app, dayName, readableName, signed, whenName } from '../app/copy'
import { endingOf } from '../app/ending'
import { linksOf } from '../app/bank'
import { DEMO, seedDemo } from '../app/demo'
import { decide, type DocKind } from '../app/match'
import type { AppBindings } from '../app/routes'
import { checkPaperStatement, getPaper, keepPaper, paperResponse, papersOf, poaStateOf } from '../app/papers'
import { LEVELS, checkDeclarationStatement, decideStatement, declarationStateOf, latestDeclaration, noticeEndsOn, reportStatements, reportsOf, riskStatements, risksOf, suggestedLevel, type Level } from '../app/aml'
import { AmlPage } from '../views/aml'
import { currentWho, newLink, startSession } from '../app/session'
import {
  checkStatement,
  clearExemptStatement,
  companiesOf,
  deleteDocumentStatements,
  eventStatement,
  getPayment,
  linkStatement,
  listMessages,
  listPayments,
  matchCompany,
  membersOf,
  messageStatement,
  ruleStatement,
  ruleUpsertStatement,
  seenStatement,
  userByEmail,
  type Company,
  type Doc,
  type Payment,
  type User,
  type Who,
} from '../app/store'
import { dayOf } from '../views/inside-pages'
import { Tile } from '../views/home'
import { Door, Heading } from '../views/inside'
import {
  BookPage,
  ClientPage,
  ClientsPage,
  InboxPage,
  NewClientPage,
  PeoplePage,
  QueuePage,
  RequestsPage,
  TeamMissing,
  TeamShell,
  valuesOf,
  type BookValues,
  type NewClientValues,
  type TeamPlace,
} from '../views/team'
import { team as t } from './copy'
import {
  bookingQueue,
  canSee,
  endedCompanies,
  exportCsv,
  exportRows,
  getRequest,
  inboxCode,
  isAdmin,
  listRequests,
  paidByOf,
  paymentsToCheck,
  rulesOf,
  teamClients,
  teamCompany,
  teamCounts,
  teamDocument,
  teamMembers,
  waitingThreads,
} from './store'

type Env = { Bindings: AppBindings; Variables: { who: Who } }
type Ctx = Context<Env>

export const teamRoutes = new Hono<Env>()

const ID = /^[A-Za-z0-9-]{1,64}$/
const EMAIL = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)*\.[A-Za-z]{2,}$/

/** Whether the sample companies are shown: only in the playground. */
const demoOn = (c: Ctx) => c.env.DEMO === '1' && isLocal(new URL(c.req.url).hostname)

function render(c: Ctx, node: unknown, status: ContentfulStatusCode = 200) {
  return c.html(html`<!doctype html>${node as never}`, status)
}

async function shell(c: Ctx, place: TeamPlace | null, title: string, node: unknown, status: ContentfulStatusCode = 200) {
  const who = c.get('who')
  const [counts, own] = await Promise.all([teamCounts(c.env.DB, who.user, demoOn(c)), companiesOf(c.env.DB, who.user.id)])
  return render(
    c,
    <TeamShell user={who.user} place={place} counts={counts} ownCompany={own.length > 0} title={title}>
      {node as never}
    </TeamShell>,
    status,
  )
}

const missingPage = (c: Ctx) => shell(c, null, t.errors.notFound, <TeamMissing />, 404)

// The sample accountant: only on a developer's own machine, and only when the Worker is told so.
teamRoutes.get('/ukazka', async (c) => {
  if (!demoOn(c)) return c.notFound()
  const db = c.env.DB
  await ensureSchema(db)
  await seedDemo(db, dayOf(now()), c.env.FILES)
  // The administrator by default; ?ako=uctovnicka shows what an accountant sees.
  await startSession(c, db, c.req.query('ako') === 'uctovnicka' ? DEMO.accountant : DEMO.admin)
  return c.redirect('/ucto', 303)
})

teamRoutes.use('*', async (c, next) => {
  await ensureSchema(c.env.DB)
  const who = await currentWho(c, c.env.DB)
  if (!who) {
    if (c.req.method === 'GET' || c.req.method === 'HEAD') return c.redirect('/app/prihlasenie', 303)
    return c.text('Forbidden', 403)
  }
  // A client who types the address gets a page that says nothing about what is here.
  if (!who.user.team) {
    return render(
      c,
      <Door title={t.errors.notFound}>
        <Tile art={ART.lens} size="lg" eager />
        <Heading first={t.errors.notFound} small />
        <p class="door__lead">{t.errors.clientLead}</p>
        <a class="btn btn--blue btn--large door__button" href="/app">
          {t.errors.toApp}
        </a>
      </Door>,
      404,
    )
  }
  c.set('who', who)
  await next()
})

function flashOf(c: Ctx): string | null {
  switch (c.req.query('ok')) {
    case 'zauctovane':
      return t.book.bookedFlash
    case 'pravidlo':
      return t.book.bookedRuleFlash
    case 'zahodene':
      return t.book.discardedFlash
    case 'ulozene':
      return t.book.savedFlash
    case 'zrusene':
      return t.book.unbookedFlash
    case 'hotovo':
      return t.book.allDone
    case 'odpoved':
      return t.client.replied
    case 'pripomenute':
      return t.client.reminded
    case 'potvrdene':
      return t.client.checked
    case 'vratene':
      return t.client.returned
    case 'udaje':
      return t.client.saved
    case 'zalozeny':
      return t.newClient.created
    case 'zalozeny-mail':
      return t.newClient.createdMail
    case 'tim':
      return t.people.added
    case 'plna-moc':
      return t.client.poaFlash
    case 'overene':
      return t.aml.checkedFlash
    case 'riziko':
      return t.aml.riskSaved
    case 'oznamenie':
      return t.aml.reportSent
    case 'posudene':
      return t.aml.decidedFlash
    case 'koniec':
      return t.end.flash
    case 'koniec-zruseny':
      return t.end.cancelled
    case 'odovzdane':
      return t.handover.flash
    case 'odstranene':
      return t.handover.removed
    default:
      return null
  }
}

async function accountantsList(db: D1Database): Promise<{ id: string; name: string }[]> {
  return (await teamMembers(db)).map((m) => ({ id: m.id, name: m.name }))
}

// ---------------------------------------------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------------------------------------------

teamRoutes.get('/', async (c) => {
  const who = c.get('who')
  const [rows, ended] = await Promise.all([teamClients(c.env.DB, who.user, demoOn(c)), isAdmin(who.user) ? endedCompanies(c.env.DB) : Promise.resolve([])])
  return shell(c, 'clients', t.clients.title, <ClientsPage user={who.user} rows={rows} ended={ended} now={now()} flash={flashOf(c)} />)
})

async function clientPage(
  c: Ctx,
  company: Company,
  extra: { error?: string; draft?: string; end?: { day: string; reason: string; errors: { day?: string; reason?: string; form?: string } }; handoverError?: string } = {},
  status: ContentfulStatusCode = 200,
) {
  const who = c.get('who')
  const db = c.env.DB
  const [members, queue, toCheck, missing, messages, rules, accountants, papers, declared, risks, reports, handover] = await Promise.all([
    membersOf(db, company.id),
    bookingQueue(db, who.user, true, company.id),
    paymentsToCheck(db, company.id),
    listPayments(db, company.id, 'missing', 60),
    listMessages(db, company.id),
    rulesOf(db, company.id),
    isAdmin(who.user) ? accountantsList(db) : Promise.resolve([]),
    papersOf(db, company.id, 'poa'),
    latestDeclaration(db, company.id),
    risksOf(db, company.id),
    reportsOf(db, company.id, { id: who.user.id, admin: isAdmin(who.user) }),
    papersOf(db, company.id, 'handover'),
  ])
  if (status === 200) await db.batch([seenStatement(db, company.id, 'client')])
  const day = dayOf(now())
  const banks = await linksOf(db, company.id)
  const active = banks.find((l) => l.status === 'active')
  const ended = banks.find((l) => l.status === 'expired')
  const bankLine = active ? (active.syncedAt ? t.client.bank(active.bank, whenName(active.syncedAt, day)) : t.client.bankWaiting(active.bank)) : ended ? t.client.bankEnded(ended.bank) : t.client.noBank
  return shell(
    c,
    'clients',
    company.name,
    <ClientPage
      user={who.user}
      company={company}
      members={members}
      queue={queue}
      toCheck={toCheck}
      missing={missing}
      messages={messages}
      rules={rules}
      accountants={accountants}
      now={now()}
      month={day.slice(0, 7)}
      flash={flashOf(c)}
      bankLine={bankLine}
      papers={papers}
      poa={poaStateOf(papers)}
      declaration={declarationStateOf(declared)}
      risk={risks[0]?.level ?? null}
      openReports={reports.filter((r) => r.decision === null).length}
      handover={handover}
      ending={endingOf(company, day)}
      earliestEnd={noticeEndsOn(day)}
      {...extra}
    />,
    status,
  )
}

/** The company of the address, when the user may see it; `ended` lets the administrator see one whose data are deleted. */
async function companyParam(c: Ctx, ended = false): Promise<Company | null> {
  const id = c.req.param('id') ?? ''
  return ID.test(id) ? teamCompany(c.env.DB, c.get('who').user, id, ended) : null
}

teamRoutes.get('/klienti/novy', async (c) => {
  const who = c.get('who')
  if (!isAdmin(who.user)) return missingPage(c)
  const request = c.req.query('ziadost')
  const r = request && ID.test(request) ? await getRequest(c.env.DB, request) : null
  const values: NewClientValues = {
    ico: r?.ico ? formatIco(r.ico) : '',
    name: r?.company ?? '',
    address: r?.address ?? '',
    person: r?.name ?? '',
    email: r?.email ?? '',
    plan: r && PLANS.some((p) => p.id === r.plan) ? r.plan : 'start',
    vat: false,
    accountant: '',
    welcome: true,
    request: r?.id ?? '',
  }
  return shell(c, 'clients', t.newClient.title, <NewClientPage values={values} accountants={await accountantsList(c.env.DB)} errors={{}} />)
})

teamRoutes.post('/klienti', async (c) => {
  const who = c.get('who')
  if (!isAdmin(who.user)) return missingPage(c)
  const db = c.env.DB
  const body = await c.req.parseBody()
  const text = (name: string, max: number) => (typeof body[name] === 'string' ? (body[name] as string).trim().slice(0, max) : '')
  const accountants = await accountantsList(db)
  const values: NewClientValues = {
    ico: text('ico', 20),
    name: text('name', 160),
    address: text('address', 200),
    person: text('person', 120),
    email: text('email', 200),
    plan: PLANS.some((p) => p.id === text('plan', 10)) ? text('plan', 10) : 'start',
    vat: body.dph === '1',
    accountant: accountants.some((a) => a.id === text('uctovnicka', 64)) ? text('uctovnicka', 64) : '',
    welcome: body.uvitat === '1',
    request: ID.test(text('ziadost', 64)) ? text('ziadost', 64) : '',
  }
  const ico = values.ico === '' ? null : normalizeIco(values.ico)
  const errors: Partial<Record<keyof NewClientValues | 'form', string>> = {}
  if (values.ico !== '' && !ico) errors.ico = t.newClient.errors.ico
  let found: string | null = null
  if (ico && (body.akcia === 'register' || values.name === '')) {
    const answer = await lookupCompany(ico)
    if ('found' in answer && answer.found) {
      values.name = values.name || answer.found.name
      values.address = values.address || answer.found.address || ''
      found = `${t.newClient.found} ${answer.found.name}`
    } else found = t.newClient.notFound
  }
  if (body.akcia === 'register') return shell(c, 'clients', t.newClient.title, <NewClientPage values={values} accountants={accountants} errors={errors} found={found} />)
  if (values.name.length < 2) errors.name = t.newClient.errors.name
  if (values.person.length < 2) errors.person = t.newClient.errors.person
  if (!EMAIL.test(values.email)) errors.email = t.newClient.errors.email
  if (ico && (await db.prepare('SELECT 1 AS x FROM companies WHERE ico = ? AND closed_at IS NULL').bind(ico).first())) errors.ico = t.newClient.errors.exists
  if (Object.keys(errors).length > 0) return shell(c, 'clients', t.newClient.title, <NewClientPage values={values} accountants={accountants} errors={errors} found={found} />, 422)

  const companyId = crypto.randomUUID()
  const existing = await userByEmail(db, values.email)
  const userId = existing?.id ?? crypto.randomUUID()
  const ts = now()
  let inbox = inboxCode()
  for (let i = 0; i < 5 && (await db.prepare('SELECT 1 AS x FROM companies WHERE inbox = ?').bind(inbox).first()); i++) inbox = inboxCode()
  const statements: D1PreparedStatement[] = [
    db
      .prepare('INSERT INTO companies (id, created_at, name, ico, address, vat_payer, plan, inbox, accountant_id, request_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(companyId, ts, values.name, ico, values.address || null, values.vat ? 1 : 0, values.plan, inbox, values.accountant || null, values.request || null),
    ...(existing ? [] : [db.prepare('INSERT INTO users (id, created_at, email, name) VALUES (?, ?, ?, ?)').bind(userId, ts, values.email, values.person)]),
    db.prepare("INSERT OR IGNORE INTO members (company_id, user_id, role, created_at, invited_by) VALUES (?, ?, 'owner', ?, ?)").bind(companyId, userId, ts, who.user.id),
    eventStatement(db, { company: companyId, user: who.user.id, action: 'company.created', detail: { request: values.request || null } }),
  ]
  if (values.request) statements.push(db.prepare("UPDATE requests SET status = 'client' WHERE id = ?").bind(values.request))
  if (values.welcome) {
    const { token, statement } = await newLink(db, userId, TEAM.welcomeDays * 24 * 60)
    statements.push(statement, ringStatement(db, 'welcome', companyId, values.email, bell.welcome(`${siteOrigin(c)}/app/vstup?t=${token}`)))
  }
  await db.batch(statements)
  if (values.welcome) later(c, flushOutbox(db, c.env.EMAIL))
  return c.redirect(`/ucto/klienti/${companyId}?ok=${values.welcome ? 'zalozeny-mail' : 'zalozeny'}`, 303)
})

teamRoutes.get('/klienti/:id', async (c) => {
  const company = await companyParam(c)
  return company ? clientPage(c, company) : missingPage(c)
})

teamRoutes.post('/klienti/:id/spravy', async (c) => {
  const who = c.get('who')
  const company = await companyParam(c)
  if (!company) return missingPage(c)
  const body = await c.req.parseBody()
  const text = typeof body.sprava === 'string' ? body.sprava.replace(/\r\n?/g, '\n').trim() : ''
  if (text === '') return clientPage(c, company, { error: t.errors.messageEmpty }, 422)
  if (text.length > APP.messageChars) return clientPage(c, company, { error: t.errors.messageLong, draft: text.slice(0, APP.messageChars) }, 422)
  const db = c.env.DB
  const id = crypto.randomUUID()
  await db.batch([
    messageStatement(db, { id, company: company.id, author: who.user.id, side: 'firmony', body: text, payment: null }),
    eventStatement(db, { company: company.id, user: who.user.id, action: 'message.answered', subject: id }),
    ...(await ringClient(c, company, id)),
  ])
  later(c, flushOutbox(db, c.env.EMAIL))
  return c.redirect(`/ucto/klienti/${company.id}?ok=odpoved#spravy`, 303)
})

/**
 * A doorbell to every member of a client's company that a message from the team waits in the app (src/bell.ts: it
 * carries nothing of the message). Rung once for what the company has not read yet: called before the new message
 * is written, it rings nothing while an earlier one is still unread.
 */
async function ringClient(c: Ctx, company: Company, messageId: string): Promise<D1PreparedStatement[]> {
  const db = c.env.DB
  const unread = await db.prepare("SELECT 1 AS x FROM messages WHERE company_id = ? AND side = 'firmony' AND seen_at IS NULL LIMIT 1").bind(company.id).first()
  if (unread) return []
  const members = await membersOf(db, company.id)
  return members.map((m) => ringStatement(db, 'answer', messageId, m.email, bell.answer(`${siteOrigin(c)}/app/spravy`)))
}

teamRoutes.post('/klienti/:id/pripomenut', async (c) => {
  const who = c.get('who')
  const company = await companyParam(c)
  if (!company) return missingPage(c)
  const db = c.env.DB
  const missing = await listPayments(db, company.id, 'missing', 20)
  if (missing.length === 0) return c.redirect(`/ucto/klienti/${company.id}#chyba`, 303)
  const lines = missing.map((p) => `${p.bookedOn.slice(8, 10)}. ${p.bookedOn.slice(5, 7)}. ${p.party ? readableName(p.party) : (p.note ?? '')}, ${signed(p.amountCents)}`)
  const text = t.client.remindMessage(lines)
  const id = crypto.randomUUID()
  await db.batch([
    messageStatement(db, { id, company: company.id, author: who.user.id, side: 'firmony', body: text, payment: null }),
    eventStatement(db, { company: company.id, user: who.user.id, action: 'client.reminded', subject: id, detail: { payments: missing.length } }),
    ...(await ringClient(c, company, id)),
  ])
  later(c, flushOutbox(db, c.env.EMAIL))
  return c.redirect(`/ucto/klienti/${company.id}?ok=pripomenute#chyba`, 303)
})

teamRoutes.post('/klienti/:id/udaje', async (c) => {
  const who = c.get('who')
  const company = await companyParam(c)
  if (!company) return missingPage(c)
  const body = await c.req.parseBody()
  const text = (name: string, max: number) => (typeof body[name] === 'string' ? (body[name] as string).trim().slice(0, max) : '')
  const dic = text('dic', 12).replace(/\D/g, '')
  const icdph = text('icdph', 14).replace(/\s/g, '').toUpperCase()
  const db = c.env.DB
  const sets = ['dic = ?', 'icdph = ?', 'vat_payer = ?', 'note = ?']
  const binds: unknown[] = [/^\d{10}$/.test(dic) ? dic : null, /^SK\d{10}$/.test(icdph) ? icdph : null, body.dph === '1' ? 1 : 0, text('poznamka', 1000) || null]
  if (isAdmin(who.user)) {
    const plan = text('plan', 10)
    if (PLANS.some((p) => p.id === plan)) {
      sets.push('plan = ?')
      binds.push(plan)
    }
    const accountant = text('uctovnicka', 64)
    const team = await accountantsList(db)
    sets.push('accountant_id = ?')
    binds.push(team.some((a) => a.id === accountant) ? accountant : null)
  }
  await db.batch([
    db.prepare(`UPDATE companies SET ${sets.join(', ')} WHERE id = ?`).bind(...binds, company.id),
    eventStatement(db, { company: company.id, user: who.user.id, action: 'company.updated' }),
  ])
  // An accountant who just handed the client to somebody else no longer sees it.
  const still = await teamCompany(db, who.user, company.id)
  return c.redirect(still ? `/ucto/klienti/${company.id}?ok=udaje#udaje` : '/ucto', 303)
})

teamRoutes.get('/klienti/:id/export', async (c) => {
  const company = await companyParam(c)
  if (!company) return missingPage(c)
  const month = /^\d{4}-\d{2}$/.test(c.req.query('mesiac') ?? '') ? (c.req.query('mesiac') as string) : dayOf(now()).slice(0, 7)
  const rows = await exportRows(c.env.DB, company.id, month)
  const csv = exportCsv(rows, company.vatPayer, t.csv, t.book.kinds, { bank: t.book.paidBank, private: t.book.paidPrivate, cash: t.book.paidCash, unpaid: t.book.unpaid })
  const name = `firmony-${(company.ico ?? company.name).replace(/[^\p{L}\p{N}]+/gu, '-').toLowerCase()}-${month}.csv`
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
      'Cache-Control': 'private, no-store',
    },
  })
})

// ---------------------------------------------------------------------------------------------------------------
// The client's power of attorney: its file, and the mark that it was checked and filed
// ---------------------------------------------------------------------------------------------------------------

teamRoutes.get('/klienti/:id/plna-moc/:file', async (c) => {
  const company = await companyParam(c)
  const id = c.req.param('file')
  const paper = company && ID.test(id) ? await getPaper(c.env.DB, company.id, id) : null
  const answer = paper ? await paperResponse(c.env.FILES, paper) : null
  return answer ?? missingPage(c)
})

teamRoutes.post('/klienti/:id/plna-moc/:file/overit', async (c) => {
  const who = c.get('who')
  const company = await companyParam(c)
  const id = c.req.param('file')
  const paper = company && ID.test(id) ? await getPaper(c.env.DB, company.id, id) : null
  if (!company || !paper) return missingPage(c)
  const db = c.env.DB
  const [checked] = await db.batch([checkPaperStatement(db, company.id, paper.id, who.user.id)])
  if ((checked?.meta?.changes ?? 0) > 0) await db.batch([eventStatement(db, { company: company.id, user: who.user.id, action: 'poa.checked', subject: paper.id })])
  return c.redirect(`/ucto/klienti/${company.id}?ok=plna-moc#zmluva`, 303)
})

// ---------------------------------------------------------------------------------------------------------------
// The end of a contract from our side (point 10.2 and 10.3 of the terms), and the books handed over at its end
// ---------------------------------------------------------------------------------------------------------------

/** The day a contract the administrator ends: today or later; the reason stays with the team (the event). */
teamRoutes.post('/klienti/:id/koniec', async (c) => {
  const who = c.get('who')
  const company = await companyParam(c)
  if (!company || !isAdmin(who.user)) return missingPage(c)
  const body = await c.req.parseBody()
  const dayText = typeof body.den === 'string' ? body.den.trim().slice(0, 20) : ''
  const reason = typeof body.dovod === 'string' ? body.dovod.replace(/\r\n?/g, '\n').trim().slice(0, 1000) : ''
  const today = dayOf(now())
  const day = dayOfText(dayText)
  const errors: { day?: string; reason?: string; form?: string } = {}
  if (!day || day < today) errors.day = t.end.errors.day
  if (reason === '') errors.reason = t.end.errors.reason
  if (company.noticeSide === 'client' || (company.endsOn && company.endsOn < today)) errors.form = t.end.errors.running
  if (Object.keys(errors).length > 0 || !day) return clientPage(c, company, { end: { day: dayText, reason, errors }, error: errors.form }, 422)
  const db = c.env.DB
  // Set while the contract still runs and the client has not given notice; an end we set before can be moved.
  const [set] = await db.batch([
    db
      .prepare("UPDATE companies SET notice_at = ?, notice_by = ?, notice_side = 'firmony', ends_on = ? WHERE id = ? AND (notice_side IS NULL OR notice_side = 'firmony') AND (ends_on IS NULL OR ends_on >= ?)")
      .bind(now(), who.user.id, day, company.id, today),
  ])
  if ((set?.meta?.changes ?? 0) === 0) return clientPage(c, company, { end: { day: dayText, reason, errors: {} }, error: t.end.errors.running }, 409)
  const ending = endingOf({ endsOn: day, noticeSide: 'firmony' }, today)
  const id = crypto.randomUUID()
  const plain = (d: string) => dayName(d)
  await db.batch([
    messageStatement(db, { id, company: company.id, author: who.user.id, side: 'firmony', body: t.end.message(plain(day), plain(ending?.intakeUntil ?? day), plain(ending?.handoverBy ?? day), plain(ending?.accessUntil ?? day)), payment: null }),
    eventStatement(db, { company: company.id, user: who.user.id, action: 'contract.ended', subject: id, detail: { endsOn: day, reason } }),
    ...(await ringClient(c, company, id)),
  ])
  later(c, flushOutbox(db, c.env.EMAIL))
  return c.redirect(`/ucto/klienti/${company.id}?ok=koniec#zmluva`, 303)
})

teamRoutes.post('/klienti/:id/koniec/zrusit', async (c) => {
  const who = c.get('who')
  const company = await companyParam(c)
  if (!company || !isAdmin(who.user)) return missingPage(c)
  const db = c.env.DB
  const [back] = await db.batch([
    db
      .prepare("UPDATE companies SET notice_at = NULL, notice_by = NULL, notice_side = NULL, ends_on = NULL WHERE id = ? AND notice_side = 'firmony' AND ends_on >= ?")
      .bind(company.id, dayOf(now())),
  ])
  if ((back?.meta?.changes ?? 0) === 0) return c.redirect(`/ucto/klienti/${company.id}#zmluva`, 303)
  const id = crypto.randomUUID()
  await db.batch([
    messageStatement(db, { id, company: company.id, author: who.user.id, side: 'firmony', body: t.end.messageCancel, payment: null }),
    eventStatement(db, { company: company.id, user: who.user.id, action: 'contract.ended.cancelled', subject: id }),
    ...(await ringClient(c, company, id)),
  ])
  later(c, flushOutbox(db, c.env.EMAIL))
  return c.redirect(`/ucto/klienti/${company.id}?ok=koniec-zruseny#zmluva`, 303)
})

/** The books handed over: the files go to the client's page, with a message that says where they are. */
teamRoutes.post('/klienti/:id/odovzdanie', async (c) => {
  const who = c.get('who')
  const company = await companyParam(c)
  if (!company) return missingPage(c)
  const body = await c.req.parseBody({ all: true })
  const raw = body.file
  const files = (Array.isArray(raw) ? raw : [raw]).filter((f): f is File => typeof f === 'object' && f !== null && 'arrayBuffer' in f && (f as File).size > 0)
  if (files.length === 0) return clientPage(c, company, { handoverError: t.handover.errors.none }, 422)
  if (files.length > ENDING.handoverAtOnce) return clientPage(c, company, { handoverError: t.handover.errors.atOnce }, 422)
  const db = c.env.DB
  const names: string[] = []
  for (const file of files) {
    const kept = await keepPaper(db, c.env.FILES, { company: company.id, user: who.user.id }, 'handover', { name: (file.name || 'uctovnictvo').slice(0, 120), bytes: new Uint8Array(await file.arrayBuffer()) })
    if (!kept.ok) {
      if (names.length > 0) break
      return clientPage(c, company, { handoverError: t.handover.errors[kept.reason] }, kept.reason === 'storage' ? 503 : 422)
    }
    names.push(kept.paper.name)
  }
  const id = crypto.randomUUID()
  await db.batch([
    messageStatement(db, { id, company: company.id, author: who.user.id, side: 'firmony', body: app.ending.handedOver(names.join(', ')), payment: null }),
    eventStatement(db, { company: company.id, user: who.user.id, action: 'handover.sent', subject: id, detail: { files: names.length } }),
    ...(await ringClient(c, company, id)),
  ])
  later(c, flushOutbox(db, c.env.EMAIL))
  return c.redirect(`/ucto/klienti/${company.id}?ok=odovzdane#odovzdanie`, 303)
})

teamRoutes.get('/klienti/:id/odovzdanie/:file', async (c) => {
  const company = await companyParam(c)
  const id = c.req.param('file')
  const paper = company && ID.test(id) ? await getPaper(c.env.DB, company.id, id) : null
  const answer = paper?.kind === 'handover' ? await paperResponse(c.env.FILES, paper) : null
  return answer ?? missingPage(c)
})

teamRoutes.post('/klienti/:id/odovzdanie/:file/odstranit', async (c) => {
  const who = c.get('who')
  const company = await companyParam(c)
  const id = c.req.param('file')
  const paper = company && ID.test(id) ? await getPaper(c.env.DB, company.id, id) : null
  if (!company || !paper || paper.kind !== 'handover') return missingPage(c)
  const db = c.env.DB
  await db.batch([
    db.prepare("DELETE FROM company_files WHERE id = ? AND company_id = ? AND kind = 'handover'").bind(paper.id, company.id),
    eventStatement(db, { company: company.id, user: who.user.id, action: 'handover.removed', subject: paper.id }),
  ])
  if (c.env.FILES) await c.env.FILES.delete(paper.r2Key)
  return c.redirect(`/ucto/klienti/${company.id}?ok=odstranene#odovzdanie`, 303)
})

// ---------------------------------------------------------------------------------------------------------------
// Identification and risk under the law against money laundering (aml.ts): the client's declaration and its check,
// the risk, and the internal reports with the designated person's decision. The client never sees any of it but the
// declaration it gave; a report is seen by its author and by the administrator, who is the designated person.
// ---------------------------------------------------------------------------------------------------------------

async function amlPage(c: Ctx, company: Company, extra: { error?: string; draft?: string } = {}, status: ContentfulStatusCode = 200) {
  const who = c.get('who')
  const db = c.env.DB
  const [stored, risks, reports] = await Promise.all([latestDeclaration(db, company.id), risksOf(db, company.id), reportsOf(db, company.id, { id: who.user.id, admin: isAdmin(who.user) })])
  return shell(
    c,
    'clients',
    t.aml.title,
    <AmlPage user={who.user} company={company} stored={stored} risks={risks} suggested={stored ? suggestedLevel(stored.data) : null} reports={reports} now={now()} flash={flashOf(c)} {...extra} />,
    status,
  )
}

teamRoutes.get('/klienti/:id/aml', async (c) => {
  const company = await companyParam(c, true)
  return company ? amlPage(c, company) : missingPage(c)
})

teamRoutes.post('/klienti/:id/aml/overit', async (c) => {
  const who = c.get('who')
  const company = await companyParam(c, true)
  if (!company) return missingPage(c)
  const body = await c.req.parseBody()
  const id = typeof body.vyhlasenie === 'string' && ID.test(body.vyhlasenie) ? body.vyhlasenie : ''
  const db = c.env.DB
  // Only the newest declaration, and only once: an older one opened in another tab is never checked in its place.
  const [checked] = await db.batch([checkDeclarationStatement(db, company.id, id, who.user.id)])
  if ((checked?.meta?.changes ?? 0) > 0) await db.batch([eventStatement(db, { company: company.id, user: who.user.id, action: 'declaration.checked', subject: id })])
  return c.redirect(`/ucto/klienti/${company.id}/aml?ok=overene#udaje`, 303)
})

teamRoutes.post('/klienti/:id/aml/riziko', async (c) => {
  const who = c.get('who')
  const company = await companyParam(c, true)
  if (!company) return missingPage(c)
  const body = await c.req.parseBody()
  const level = typeof body.uroven === 'string' && (LEVELS as readonly string[]).includes(body.uroven) ? (body.uroven as Level) : null
  if (!level) return c.redirect(`/ucto/klienti/${company.id}/aml#riziko`, 303)
  const note = typeof body.poznamka === 'string' ? body.poznamka.replace(/\r\n?/g, '\n').trim().slice(0, 1000) : ''
  const db = c.env.DB
  await db.batch(riskStatements(db, company.id, who.user.id, level, note || null))
  return c.redirect(`/ucto/klienti/${company.id}/aml?ok=riziko#riziko`, 303)
})

teamRoutes.post('/klienti/:id/aml/oznamenie', async (c) => {
  const who = c.get('who')
  const company = await companyParam(c, true)
  if (!company) return missingPage(c)
  const body = await c.req.parseBody()
  const text = typeof body.text === 'string' ? body.text.replace(/\r\n?/g, '\n').trim() : ''
  if (text === '') return amlPage(c, company, { error: t.aml.errors.body }, 422)
  if (text.length > APP.messageChars) return amlPage(c, company, { error: t.aml.errors.long, draft: text.slice(0, APP.messageChars) }, 422)
  const db = c.env.DB
  const made = reportStatements(db, company.id, who.user.id, text)
  // Every administrator is the designated person's door: a doorbell that names neither the client nor the report.
  const admins = await db.prepare("SELECT email FROM users WHERE team = 'admin'").all<{ email: string }>()
  await db.batch([...made.statements, ...admins.results.map((admin) => ringStatement(db, 'report', made.id, admin.email, bell.teamReport(`${siteOrigin(c)}/ucto/klienti/${company.id}/aml#oznamenia`)))])
  later(c, flushOutbox(db, c.env.EMAIL))
  return c.redirect(`/ucto/klienti/${company.id}/aml?ok=oznamenie#oznamenia`, 303)
})

teamRoutes.post('/klienti/:id/aml/oznamenie/:report', async (c) => {
  const who = c.get('who')
  const company = await companyParam(c, true)
  if (!company || !isAdmin(who.user)) return missingPage(c)
  const report = c.req.param('report')
  const body = await c.req.parseBody()
  const decision = body.rozhodnutie === 'reported' ? 'reported' : body.rozhodnutie === 'not' ? 'not' : null
  const note = typeof body.poznamka === 'string' ? body.poznamka.replace(/\r\n?/g, '\n').trim().slice(0, 1000) : ''
  if (!decision || !ID.test(report)) return c.redirect(`/ucto/klienti/${company.id}/aml#oznamenia`, 303)
  if (note === '') return amlPage(c, company, { error: t.aml.errors.note }, 422)
  const db = c.env.DB
  const [decided] = await db.batch([decideStatement(db, company.id, report, who.user.id, decision, note)])
  if ((decided?.meta?.changes ?? 0) > 0) await db.batch([eventStatement(db, { company: company.id, user: who.user.id, action: 'report.decided', subject: report, detail: { decision } })])
  return c.redirect(`/ucto/klienti/${company.id}/aml?ok=posudene#oznamenia`, 303)
})

// ---------------------------------------------------------------------------------------------------------------
// Payments: what the client marked as needing no document
// ---------------------------------------------------------------------------------------------------------------

/** A payment with its company, when the user may see it. */
async function teamPayment(c: Ctx, id: string): Promise<{ payment: Payment; company: Company } | null> {
  if (!ID.test(id)) return null
  const row = await c.env.DB.prepare('SELECT company_id FROM payments WHERE id = ?').bind(id).first<{ company_id: string }>()
  const company = row ? await teamCompany(c.env.DB, c.get('who').user, row.company_id) : null
  const payment = company ? await getPayment(c.env.DB, company.id, id) : null
  return company && payment ? { payment, company } : null
}

teamRoutes.post('/platby/:id/kontrola', async (c) => {
  const who = c.get('who')
  const found = await teamPayment(c, c.req.param('id'))
  if (!found) return missingPage(c)
  const { payment, company } = found
  const body = await c.req.parseBody()
  const db = c.env.DB
  if (body.ok === '1') {
    await db.batch([checkStatement(db, company.id, payment.id, who.user.id), eventStatement(db, { company: company.id, user: who.user.id, action: 'exempt.checked', subject: payment.id })])
    return c.redirect(`/ucto/klienti/${company.id}?ok=potvrdene#kontrola`, 303)
  }
  const what = `${payment.party ? readableName(payment.party) : (payment.note ?? '')} (${signed(payment.amountCents)}, ${payment.bookedOn.slice(8, 10)}. ${payment.bookedOn.slice(5, 7)}.)`
  const text = t.client.checkBackMessage(what)
  const id = crypto.randomUUID()
  await db.batch([
    clearExemptStatement(db, company.id, payment.id),
    messageStatement(db, { id, company: company.id, author: who.user.id, side: 'firmony', body: text, payment: payment.id }),
    eventStatement(db, { company: company.id, user: who.user.id, action: 'exempt.returned', subject: payment.id }),
    ...(await ringClient(c, company, id)),
  ])
  later(c, flushOutbox(db, c.env.EMAIL))
  return c.redirect(`/ucto/klienti/${company.id}?ok=vratene#kontrola`, 303)
})

// ---------------------------------------------------------------------------------------------------------------
// Booking
// ---------------------------------------------------------------------------------------------------------------

teamRoutes.get('/doklady', async (c) => {
  const who = c.get('who')
  const docs = await bookingQueue(c.env.DB, who.user, demoOn(c))
  return shell(c, 'queue', t.queue.title, <QueuePage docs={docs} flash={flashOf(c)} />)
})

/** Payments of the company that this document may belong to, best first. */
async function candidatesFor(db: D1Database, company: string, d: Doc): Promise<Payment[]> {
  if (d.paymentId || d.totalCents === null) return []
  const missing = await listPayments(db, company, 'missing', 300)
  const { auto, suggest } = decide(
    missing.map((p) => ({ id: p.id, bookedOn: p.bookedOn, amountCents: p.amountCents, party: p.party, partyIban: p.partyIban, vs: p.vs })),
    [{ id: d.id, kind: d.kind, issuedOn: d.issuedOn, dueOn: d.dueOn, totalCents: d.totalCents, party: d.party, partyIban: d.partyIban, vs: d.vs }],
  )
  const ids = new Set([...auto.map(([p]) => p), ...[...suggest].filter(([, docs]) => docs.includes(d.id)).map(([p]) => p)])
  return missing.filter((p) => ids.has(p.id)).slice(0, 5)
}

async function bookPage(c: Ctx, found: { doc: Doc; company: Company }, extra: { values?: BookValues; errors?: Partial<Record<keyof BookValues, string>> } = {}, status: ContentfulStatusCode = 200) {
  const who = c.get('who')
  const db = c.env.DB
  const { doc, company } = found
  const [payment, candidates, queue, invoice] = await Promise.all([
    doc.paymentId ? getPayment(db, company.id, doc.paymentId) : Promise.resolve(null),
    candidatesFor(db, company.id, doc),
    bookingQueue(db, who.user, true, company.id),
    doc.invoiceId ? getInvoice(db, company.id, doc.invoiceId) : Promise.resolve(null),
  ])
  return shell(
    c,
    'queue',
    t.book.title,
    <BookPage
      d={doc}
      company={company}
      invoice={invoice ? { invoice, lines: await invoiceLines(db, invoice.id) } : null}
      values={extra.values ?? valuesOf(doc, company.vatPayer)}
      payment={payment}
      candidates={candidates}
      paidBy={paidByOf(doc, doc.paymentId !== null)}
      queueLeft={queue.filter((q) => q.id !== doc.id).length}
      now={now()}
      errors={extra.errors ?? {}}
      flash={flashOf(c)}
    />,
    status,
  )
}

teamRoutes.get('/doklady/:id', async (c) => {
  const id = c.req.param('id')
  const found = ID.test(id) ? await teamDocument(c.env.DB, c.get('who').user, id) : null
  return found ? bookPage(c, found) : missingPage(c)
})

/** "12,40" or "1 200" in cents; null when empty, NaN when it is not an amount. */
function moneyOf(text: string): number | null {
  const plain = text.replace(/[\s €]/g, '')
  if (plain === '') return null
  const m = /^(\d{1,9})(?:[,.](\d{1,2}))?$/.exec(plain)
  return m ? Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0')) : Number.NaN
}

const KINDS: readonly DocKind[] = ['receipt', 'invoice_in', 'invoice_out', 'other']

teamRoutes.post('/doklady/:id', async (c) => {
  const who = c.get('who')
  const id = c.req.param('id')
  const db = c.env.DB
  const found = ID.test(id) ? await teamDocument(db, who.user, id) : null
  if (!found) return missingPage(c)
  const { doc, company } = found
  const body = await c.req.parseBody()
  const text = (name: string, max: number) => (typeof body[name] === 'string' ? (body[name] as string).trim().slice(0, max) : '')
  const action = typeof body.akcia === 'string' ? body.akcia : 'ulozit'
  if (action === 'zahodit') {
    if (doc.bookedAt) return c.redirect(`/ucto/doklady/${doc.id}`, 303)
    await db.batch([
      ...deleteDocumentStatements(db, company.id, doc.id),
      eventStatement(db, { company: company.id, user: who.user.id, action: 'document.discarded', subject: doc.id, detail: { duplicateOf: doc.duplicateOf } }),
    ])
    const next = (await bookingQueue(db, who.user, true, company.id)).find((q) => q.id !== doc.id)
    return c.redirect(next ? `/ucto/doklady/${next.id}?ok=zahodene` : `/ucto/klienti/${company.id}?ok=zahodene`, 303)
  }
  if (action === 'zrusit') {
    await db.batch([
      db.prepare('UPDATE documents SET booked_at = NULL, booked_by = NULL WHERE id = ? AND company_id = ?').bind(doc.id, company.id),
      eventStatement(db, { company: company.id, user: who.user.id, action: 'document.unbooked', subject: doc.id }),
    ])
    return c.redirect(`/ucto/doklady/${doc.id}?ok=zrusene`, 303)
  }
  const values: BookValues = {
    kind: KINDS.includes(text('kind', 20) as DocKind) ? text('kind', 20) : '',
    party: text('party', 160),
    ico: text('ico', 12).replace(/\s/g, ''),
    number: text('number', 40),
    vs: text('vs', 20).replace(/\D/g, ''),
    issued: text('issued', 20),
    due: text('due', 20),
    total: text('total', 20),
    vat: text('vat', 20),
    category: isCategory(text('category', 20)) ? text('category', 20) : '',
    deduct: company.vatPayer && body.deduct === '1',
    remember: body.remember === '1',
    account: /^\d{3,6}$/.test(text('account', 6)) ? text('account', 6) : '',
  }
  const booking = action === 'dalsi' || action === 'zauctovat'
  const errors: Partial<Record<keyof BookValues, string>> = {}
  const total = moneyOf(values.total)
  const vat = moneyOf(values.vat)
  const issued = dayOfText(values.issued)
  const due = dayOfText(values.due)
  if (total !== null && (Number.isNaN(total) || total <= 0)) errors.total = t.book.errors.total
  if (vat !== null && (Number.isNaN(vat) || (total !== null && !Number.isNaN(total) && vat > total))) errors.vat = t.book.errors.vat
  if (issued === null) errors.issued = t.book.errors.date
  if (due === null) errors.due = t.book.errors.date
  if (booking) {
    if (values.kind === '') errors.kind = t.book.errors.kind
    if (total === null && !errors.total) errors.total = t.book.errors.total
    if (values.kind !== 'other' && values.category === '') errors.category = t.book.errors.category
    if (values.kind !== 'other' && values.party === '') errors.party = t.book.errors.party
  }
  if (Object.keys(errors).length > 0) return bookPage(c, found, { values, errors }, 422)
  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `UPDATE documents SET status = 'read', read_by = CASE WHEN status = 'read' THEN read_by ELSE ?1 END,
           kind = ?2, party = ?3, party_ico = ?4, number = ?5, vs = ?6, issued_on = ?7, due_on = ?8, total_cents = ?9, vat_cents = ?10,
           category = ?11, vat_deduct = ?12, account = ?13,
           booked_at = CASE WHEN ?14 = 1 THEN ?15 ELSE booked_at END, booked_by = CASE WHEN ?14 = 1 THEN ?16 ELSE booked_by END
         WHERE id = ?17 AND company_id = ?18 AND deleted_at IS NULL`,
      )
      .bind(
        `person: ${who.user.name}`.slice(0, 80),
        values.kind || null,
        values.party || null,
        /^\d{8}$/.test(values.ico) ? values.ico : null,
        values.number || null,
        values.vs || null,
        issued || null,
        due || null,
        total,
        vat,
        values.category || null,
        company.vatPayer ? (values.deduct ? 1 : 0) : 0,
        values.account || null,
        booking ? 1 : 0,
        now(),
        who.user.id,
        doc.id,
        company.id,
      ),
    eventStatement(db, { company: company.id, user: who.user.id, action: booking ? 'document.booked' : 'document.saved', subject: doc.id }),
  ]
  const key = supplierKey(values.ico, values.party)
  const remembered = booking && values.remember && key !== null && isCategory(values.category) && values.kind !== 'invoice_out'
  if (remembered && key && isCategory(values.category)) {
    statements.push(ruleUpsertStatement(db, company.id, key, values.party || null, values.category, values.deduct, who.user.id))
  }
  await db.batch(statements)
  const waiting = await bookingQueue(db, who.user, true, company.id)
  // The rule is proposed at once for the supplier's other documents that wait.
  if (remembered && key) {
    const same = waiting.filter((q) => q.id !== doc.id && supplierKey(q.partyIco, q.party) === key)
    if (same.length > 0) await db.batch(same.map((q) => ruleStatement(db, company.id, q.id, key)))
  }
  later(c, matchCompany(db, company.id))
  const flash = booking ? (remembered ? 'pravidlo' : 'zauctovane') : 'ulozene'
  if (action === 'dalsi') {
    const next = waiting.find((q) => q.id !== doc.id)
    return c.redirect(next ? `/ucto/doklady/${next.id}?ok=${flash}` : `/ucto/klienti/${company.id}?ok=hotovo`, 303)
  }
  return c.redirect(`/ucto/doklady/${doc.id}?ok=${flash}`, 303)
})

teamRoutes.post('/doklady/:id/platba', async (c) => {
  const who = c.get('who')
  const id = c.req.param('id')
  const db = c.env.DB
  const found = ID.test(id) ? await teamDocument(db, who.user, id) : null
  if (!found) return missingPage(c)
  const body = await c.req.parseBody()
  const payment = typeof body.platba === 'string' && ID.test(body.platba) ? body.platba : ''
  await db.batch([
    linkStatement(db, found.company.id, payment, found.doc.id, 'accountant', who.user.id),
    eventStatement(db, { company: found.company.id, user: who.user.id, action: 'link.accountant', subject: payment, detail: { doc: found.doc.id } }),
  ])
  return c.redirect(`/ucto/doklady/${found.doc.id}`, 303)
})

/** A document's file for somebody of the team who may see its company. */
teamRoutes.get('/subory/:id', async (c) => {
  const id = c.req.param('id')
  const found = ID.test(id) ? await teamDocument(c.env.DB, c.get('who').user, id) : null
  const object = found?.doc.fileKey && c.env.FILES ? await c.env.FILES.get(found.doc.fileKey) : null
  if (!found || !object) return c.notFound()
  const type = found.doc.fileType === 'application/xml' ? 'text/plain; charset=utf-8' : (found.doc.fileType ?? 'application/octet-stream')
  const name = (found.doc.fileName ?? 'doklad').replace(/[^\p{L}\p{N}._ -]/gu, '_')
  const policy = type === 'application/pdf' ? "default-src 'none'; object-src 'self'; frame-ancestors 'self'" : "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox"
  return new Response(object.body, {
    headers: { 'Content-Type': type, 'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(name)}`, 'Cache-Control': 'private, no-store', 'Content-Security-Policy': policy, 'X-Frame-Options': type === 'application/pdf' ? 'SAMEORIGIN' : 'DENY' },
  })
})

// ---------------------------------------------------------------------------------------------------------------
// Messages, requests, the team
// ---------------------------------------------------------------------------------------------------------------

teamRoutes.get('/spravy', async (c) => {
  const who = c.get('who')
  const threads = await waitingThreads(c.env.DB, who.user, demoOn(c))
  return shell(c, 'inbox', t.inbox.title, <InboxPage threads={threads} now={now()} />)
})

teamRoutes.get('/ziadosti', async (c) => {
  const who = c.get('who')
  if (!isAdmin(who.user)) return missingPage(c)
  return shell(c, 'requests', t.requests.title, <RequestsPage requests={await listRequests(c.env.DB)} now={now()} flash={flashOf(c)} />)
})

teamRoutes.post('/ziadosti/:id', async (c) => {
  const who = c.get('who')
  if (!isAdmin(who.user)) return missingPage(c)
  const id = c.req.param('id')
  const body = await c.req.parseBody()
  const status = typeof body.stav === 'string' && ['new', 'contacted', 'declined'].includes(body.stav) ? body.stav : null
  if (status && ID.test(id)) {
    await c.env.DB.batch([
      c.env.DB.prepare("UPDATE requests SET status = ? WHERE id = ? AND status <> 'client'").bind(status, id),
      eventStatement(c.env.DB, { company: null, user: who.user.id, action: 'request.status', subject: id, detail: { status } }),
    ])
  }
  return c.redirect('/ucto/ziadosti', 303)
})

teamRoutes.get('/tim', async (c) => {
  const who = c.get('who')
  if (!isAdmin(who.user)) return missingPage(c)
  return shell(c, 'people', t.people.title, <PeoplePage people={await teamMembers(c.env.DB)} values={{ name: '', email: '', role: 'accountant' }} errors={{}} flash={flashOf(c)} />)
})

teamRoutes.post('/tim', async (c) => {
  const who = c.get('who')
  if (!isAdmin(who.user)) return missingPage(c)
  const db = c.env.DB
  const body = await c.req.parseBody()
  const values = {
    name: typeof body.name === 'string' ? body.name.trim().slice(0, 120) : '',
    email: typeof body.email === 'string' ? body.email.trim().slice(0, 200) : '',
    role: body.rola === 'admin' ? 'admin' : 'accountant',
  }
  const errors: { name?: string; email?: string } = {}
  if (values.name.length < 2) errors.name = t.people.errors.name
  if (!EMAIL.test(values.email)) errors.email = t.people.errors.email
  if (Object.keys(errors).length > 0) return shell(c, 'people', t.people.title, <PeoplePage people={await teamMembers(db)} values={values} errors={errors} />, 422)
  const existing = await userByEmail(db, values.email)
  const id = existing?.id ?? crypto.randomUUID()
  await db.batch([
    existing
      ? db.prepare('UPDATE users SET team = ? WHERE id = ?').bind(values.role, id)
      : db.prepare('INSERT INTO users (id, created_at, email, name, team) VALUES (?, ?, ?, ?, ?)').bind(id, now(), values.email, values.name, values.role),
    eventStatement(db, { company: null, user: who.user.id, action: 'team.added', subject: id, detail: { role: values.role } }),
    queueStatement(db, { key: `team:${id}:${values.role}`, to: values.email, subject: t.people.inviteSubject, body: t.people.inviteBody(values.name, `${siteOrigin(c)}/app/prihlasenie`) }),
  ])
  later(c, flushOutbox(db, c.env.EMAIL))
  return c.redirect('/ucto/tim?ok=tim', 303)
})

teamRoutes.notFound((c) => (c.get('who') ? missingPage(c) : c.redirect('/app/prihlasenie', 303)))

export { canSee }
