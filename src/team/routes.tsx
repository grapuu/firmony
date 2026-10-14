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
import { dayOfText, isCategory, supplierKey, textDay, type PaidBy } from '../app/booking'
import { centsOf, getInvoice, invoiceLines } from '../app/invoices'
import { app, dayName, monthName, readableName, signed, whenName } from '../app/copy'
import { endingOf } from '../app/ending'
import { linksOf } from '../app/bank'
import { answerHeld, statementsOf } from '../app/statements'
import { DEMO, seedDemo } from '../app/demo'
import { decide, type DocKind } from '../app/match'
import type { AppBindings } from '../app/routes'
import { checkPaperStatement, getPaper, keepPaper, paperResponse, papersOf, poaStateOf } from '../app/papers'
import {
  LEVELS,
  checkDeclarationStatement,
  decideStatement,
  declarationStateOf,
  latestDeclaration,
  noticeEndsOn,
  reportStatements,
  reportsOf,
  riskStatements,
  risksOf,
  suggestedLevel,
  type Level,
} from '../app/aml'
import { AmlPage } from '../views/aml'
import {
  accountMoves,
  accountName,
  bookYears,
  bookingLines,
  canonicalAccount,
  generalLedgerCsv,
  journalCsv,
  openingRows,
  paymentsWithoutDocuments,
  readEntryRows,
  readOpeningRows,
  saldoCsv,
  synthetic,
  trialBalance,
  trialCsv,
  type Books,
} from '../app/ledger'
import { booksOf, contraStatement, internalStatement, manualEntries, openingStatements, removeInternalStatement } from '../app/ledger-store'
import {
  AccountPage,
  InternalPage,
  JournalPage,
  LedgerCard,
  OpeningPage,
  PaymentsPage,
  SaldoPage,
  TrialPage,
  blockingCount,
  bookPath,
  emptyInternal,
  type InternalForm,
  type OpeningForm,
  type OpeningRowValue,
} from '../views/ledger'
import { VatCard, VatPage, type VatForm } from '../views/vat'
import { ClosingPage, closingState, type ClosingState } from '../views/closing'
import { extensionDays, tableF } from '../app/closing'
import { closingValues, readClosing, type ClosingErrors, type ClosingValues } from '../app/closing-form'
import { bookTaxStatements, closingView, closingsOf, extendStatement, fileClosingStatement, incomeSymbol, saveInputsStatement, unfileClosingStatement, type ClosingView } from '../app/closing-store'
import { dppoXml, statementsXml, type ClosingFiler } from '../app/closing-xml'
import { CHILD_ROWS, EmployeePage, PayrollPage, PayslipPage, type FieldErrors, type MonthState, type PayOrders, type SlipLine } from '../views/payroll'
import {
  INSURERS,
  closeRunStatement,
  employeeStatement,
  employeesOf,
  isInsurer,
  monthRange,
  monthSlips,
  paydayOf,
  payrollSettingsOf,
  reopenRunStatement,
  runTotals,
  runsOf,
  saveRunStatement,
  settingsStatement,
  type Employee,
  type Insurer,
  type PayrollSettings,
} from '../app/payroll-store'
import { addDays } from '../app/ending'
import { isIban, plainIban } from '../app/invoices'
import { familyOf, moneyText, modesFor, periodsAround, readVat, vatValues } from '../app/vat-form'
import { isTaxOffice } from '../app/vat-xml'
import { formatEurExact } from '../format'
import { isPeriod, isQuarter, nextPeriod, outcome, periodOf, periodRange, prevPeriod, vatOf, workingDayFrom, type VatData } from '../app/vat'
import { returnXml, statementXml } from '../app/vat-xml'
import { DeadlinesCard, DeadlinesPage, type DueFilter } from '../views/deadlines'
import { MARKED_KINDS, closingIsOurs } from './deadlines'
import { markFilingStatement, teamDeadlines, unmarkFilingStatement } from './deadlines-store'
import {
  docPreview,
  docsAround,
  fileStatement,
  filedReturns,
  groupedIban,
  INCOME_PREFIX,
  WAGE_PREFIX,
  leftToPay,
  overpaid,
  payable,
  periodName,
  planFiling,
  selfVatOf,
  stripOf,
  taxAccountOf,
  taxIban,
  taxPaid,
  unfileStatement,
  vatSymbol,
  viewOf,
  type FiledReturn,
  type FilingChoices,
  type FilingPlan,
  type PeriodView,
} from '../app/vat-store'
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
  vatCompanyOf,
  vatDocOf,
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
  detailsOf,
  valuesOf,
  type BookValues,
  type DetailsErrors,
  type DetailsValues,
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
    case 'vypis-zauctovany':
      return t.client.statements.taken
    case 'vypis-nezauctovany':
      return t.client.statements.refused
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
    case 'dph-podane':
      return t.vat.flashes.filed
    case 'dph-zrusene':
      return t.vat.flashes.unfiled
    case 'dph-blokovane':
      return t.vat.flashes.blocked
    case 'dph-bezi':
      return t.vat.flashes.running
    case 'dph-uz':
      return t.vat.flashes.already
    case 'dph-opravene':
      return t.vat.flashes.corrected
    case 'dph-kv':
      return t.vat.flashes.correctedKv
    case 'dph-netreba':
      return t.vat.flashes.notNeeded
    case 'zavierka-ulozene':
      return t.closing.flashes.saved
    case 'zavierka-dan':
      return t.closing.flashes.booked
    case 'zavierka-podane':
      return t.closing.flashes.filed
    case 'zavierka-zrusene':
      return t.closing.flashes.unfiled
    case 'zavierka-blokovane':
      return t.closing.flashes.blocked
    case 'zavierka-bezi':
      return t.closing.flashes.running
    case 'zavierka-uz':
      return t.closing.flashes.already
    case 'zavierka-lehota':
      return t.closing.flashes.extended
    case 'mzdy-ulozene':
      return t.payroll.flashes.saved
    case 'mzdy-uzavrete':
      return t.payroll.flashes.closed
    case 'mzdy-otvorene':
      return t.payroll.flashes.reopened
    case 'mzdy-bezi':
      return t.payroll.flashes.running
    case 'mzdy-uz':
      return t.payroll.flashes.already
    case 'mzdy-nikto':
      return t.payroll.flashes.nobody
    case 'mzdy-zamestnanec':
      return t.payroll.flashes.employee
    case 'mzdy-nastavenie':
      return t.payroll.flashes.settings
    case 'kniha-ucet':
      return t.ledger.flashes.account
    case 'kniha-interny':
      return t.ledger.flashes.internal
    case 'kniha-odstraneny':
      return t.ledger.flashes.removed
    case 'kniha-ps':
      return t.ledger.flashes.opening
    case 'oznacene':
      return t.deadlines.flashes.marked
    case 'neoznacene':
      return t.deadlines.flashes.unmarked
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

// ---------------------------------------------------------------------------------------------------------------
// Every client's deadlines on one screen
// ---------------------------------------------------------------------------------------------------------------

teamRoutes.get('/terminy', async (c) => {
  const who = c.get('who')
  const admin = isAdmin(who.user)
  const today = dayOf(now())
  const kto = c.req.query('kto')
  const side: DueFilter = kto === 'my' ? 'ours' : kto === 'klient' ? 'client' : 'all'
  const accountants = admin ? await accountantsList(c.env.DB) : []
  const asked = c.req.query('uctovnicka') ?? ''
  // Only the administrator chooses whose clients; an accountant sees her own whatever the address says.
  const accountant = admin && (asked === 'none' || accountants.some((a) => a.id === asked)) ? asked : ''
  const { dues } = await teamDeadlines(c.env.DB, who.user, demoOn(c), today, { accountant: accountant || null })
  return shell(
    c,
    'deadlines',
    t.deadlines.title,
    <DeadlinesPage user={who.user} dues={dues} today={today} side={side} done={c.req.query('hotove') === '1'} accountant={accountant} accountants={accountants} flash={flashOf(c)} />,
  )
})

/** Where a form of the deadlines goes back to: the screen with its filters, or a client's page; nothing else. */
const BACK = /^\/ucto\/(?:terminy|klienti\/[A-Za-z0-9-]{1,64})(?:\?[A-Za-z0-9=&_-]{0,200})?$/

// A filing the app does not make yet (the recapitulative statement, a month's payroll reports), marked as filed
// elsewhere, or the mark taken back. The closing has its own page, which marks it.
teamRoutes.post('/klienti/:id/podane', async (c) => {
  const company = await companyParam(c)
  if (!company) return missingPage(c)
  const who = c.get('who')
  const db = c.env.DB
  const body = await c.req.parseBody()
  const today = dayOf(now())
  const kind = body.druh === MARKED_KINDS.summary ? MARKED_KINDS.summary : body.druh === MARKED_KINDS.payroll ? MARKED_KINDS.payroll : null
  const period = typeof body.obdobie === 'string' ? body.obdobie : ''
  // A statement of a period that has ended; payroll reports of a month that has.
  if (!kind || !isPeriod(period) || periodRange(period).to >= today || (kind === MARKED_KINDS.payroll && period.includes('Q'))) return c.text('Bad request', 400)
  const undo = body.zrusit === '1'
  await db.batch([
    undo ? unmarkFilingStatement(db, company.id, kind, period) : markFilingStatement(db, company.id, kind, period, who.user.id, today, now()),
    eventStatement(db, { company: company.id, user: who.user.id, action: undo ? 'filing.unmarked' : 'filing.marked', subject: `${kind}:${period}` }),
  ])
  const back = typeof body.spat === 'string' && BACK.test(body.spat) ? body.spat : '/ucto/terminy'
  return c.redirect(`${back}${back.includes('?') ? '&' : '?'}ok=${undo ? 'neoznacene' : 'oznacene'}`, 303)
})

async function clientPage(
  c: Ctx,
  company: Company,
  extra: {
    error?: string
    draft?: string
    end?: { day: string; reason: string; errors: { day?: string; reason?: string; form?: string } }
    handoverError?: string
    details?: { values: DetailsValues; errors: DetailsErrors }
  } = {},
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
  const [banks, vat, books, statements, due] = await Promise.all([
    linksOf(db, company.id),
    vatSummary(db, company, day),
    booksOf(db, company),
    statementsOf(db, company.id, 6),
    // The company was checked against the user above; the sample companies count here as well.
    teamDeadlines(db, who.user, true, day, { company: company.id }),
  ])
  const active = banks.find((l) => l.status === 'active')
  const ended = banks.find((l) => l.status === 'expired')
  const mailed = statements.find((st) => st.source === 'email')
  const bankLine = active
    ? active.syncedAt
      ? t.client.bank(active.bank, whenName(active.syncedAt, day))
      : t.client.bankWaiting(active.bank)
    : ended
      ? t.client.bankEnded(ended.bank)
      : mailed
        ? t.client.bankStatements(whenName(mailed.createdAt, day))
        : t.client.noBank
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
      vat={<VatCard company={company} view={vat.view} needs7a={vat.needs7a} today={day} />}
      ledger={<LedgerCard company={company} tb={trialBalance(books, Number(day.slice(0, 4)), Number(day.slice(5, 7)))} waiting={blockingCount(books, day)} />}
      deadlines={<DeadlinesCard dues={due.dues} today={day} companyId={company.id} />}
      statements={statements}
      {...extra}
    />,
    status,
  )
}

/**
 * The client page's VAT in short: the period whose return is due next, or, for a company that is not registered,
 * how many services it bought from abroad in the last three months (each asks for a registration under § 7a).
 */
async function vatSummary(db: D1Database, company: Company, day: string): Promise<{ view: PeriodView | null; needs7a: number }> {
  const current = periodOf(day, company.vatQuarterly)
  if (company.vatStatus !== 'none') {
    const period = prevPeriod(current)
    const [docs, filed] = await Promise.all([docsAround(db, company.id, period, period), filedReturns(db, company.id)])
    return { view: viewOf(company, period, docs, filed, day), needs7a: 0 }
  }
  const periods = [prevPeriod(prevPeriod(current)), prevPeriod(current), current]
  const docs = await docsAround(db, company.id, periods[0] as string, current)
  const needs = new Set<string>()
  for (const p of periods) for (const i of viewOf(company, p, docs, [], day).result.issues) if (i.code === 'needs7a' && i.doc) needs.add(i.doc)
  return { view: null, needs7a: needs.size }
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

/** A statement that did not follow the one before: taken as it is, or not (statements.ts). */
teamRoutes.post('/klienti/:id/vypisy/:sid', async (c) => {
  const who = c.get('who')
  const company = await companyParam(c)
  if (!company) return missingPage(c)
  const body = await c.req.parseBody()
  const sid = c.req.param('sid')
  const done = /^[0-9a-f-]{36}$/.test(sid) ? await answerHeld(c.env, company, who.user.id, sid, body.akcia === 'prijat') : false
  if (!done) return c.redirect(`/ucto/klienti/${company.id}#vypisy`, 303)
  return c.redirect(`/ucto/klienti/${company.id}?ok=${body.akcia === 'prijat' ? 'vypis-zauctovany' : 'vypis-nezauctovany'}#vypisy`, 303)
})

teamRoutes.post('/klienti/:id/udaje', async (c) => {
  const who = c.get('who')
  const company = await companyParam(c)
  if (!company) return missingPage(c)
  const body = await c.req.parseBody()
  const text = (name: string, max: number) => (typeof body[name] === 'string' ? (body[name] as string).trim().slice(0, max) : '')
  // The registration for VAT: chosen in the form; an older form that only had "Platiteľ DPH" says it with a box.
  const status = body.dph_stav === 'payer' || body.dph_stav === 'reg7a' || body.dph_stav === 'none' ? body.dph_stav : body.dph === '1' ? 'payer' : 'none'
  const values: DetailsValues = {
    dic: text('dic', 14),
    icdph: text('icdph', 16),
    status,
    quarterly: status === 'payer' && body.dph_obdobie === 'quarter',
    since: text('dph_od', 20),
    office: text('danovy_urad', 60),
    account: text('oud', 40),
    carry: text('dph_prenos', 16),
    note: text('poznamka', 1000),
  }
  const dic = values.dic.replace(/\s/g, '')
  const icdph = values.icdph.replace(/\s/g, '').toUpperCase()
  const since = dayOfText(values.since)
  const account = taxAccountOf(values.account)
  const errors: DetailsErrors = {}
  if (dic !== '' && !/^\d{10}$/.test(dic)) errors.dic = t.client.detailsErrors.dic
  if (icdph !== '' && !/^SK\d{10}$/.test(icdph)) errors.icdph = t.client.detailsErrors.icdph
  if (since === null) errors.since = t.client.detailsErrors.since
  if (values.office !== '' && !isTaxOffice(values.office)) errors.office = t.client.detailsErrors.office
  if (values.account !== '' && !account) errors.account = t.client.detailsErrors.account
  // An excess deduction brought from before us: an amount in euros, or nothing.
  const carry = values.carry === '' ? 0 : centsOf(values.carry)
  if (carry === null || Number.isNaN(carry) || carry < 0) errors.carry = t.client.detailsErrors.carry
  if (Object.keys(errors).length > 0) return clientPage(c, company, { details: { values, errors }, error: t.client.detailsFix }, 422)
  const db = c.env.DB
  const sets = ['dic = ?', 'icdph = ?', 'vat_payer = ?', 'vat_7a = ?', 'vat_quarterly = ?', 'vat_since = ?', 'tax_office = ?', 'tax_account = ?', 'vat_carry = ?', 'note = ?']
  const binds: unknown[] = [
    dic || null,
    icdph || null,
    status === 'payer' ? 1 : 0,
    status === 'reg7a' ? 1 : 0,
    values.quarterly ? 1 : 0,
    since || null,
    isTaxOffice(values.office) ? values.office : null,
    account,
    status === 'payer' ? (carry ?? 0) : 0,
    values.note || null,
  ]
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
      .prepare(
        "UPDATE companies SET notice_at = ?, notice_by = ?, notice_side = 'firmony', ends_on = ? WHERE id = ? AND (notice_side IS NULL OR notice_side = 'firmony') AND (ends_on IS NULL OR ends_on >= ?)",
      )
      .bind(now(), who.user.id, day, company.id, today),
  ])
  if ((set?.meta?.changes ?? 0) === 0) return clientPage(c, company, { end: { day: dayText, reason, errors: {} }, error: t.end.errors.running }, 409)
  const ending = endingOf({ endsOn: day, noticeSide: 'firmony' }, today)
  const id = crypto.randomUUID()
  const plain = (d: string) => dayName(d)
  await db.batch([
    messageStatement(db, {
      id,
      company: company.id,
      author: who.user.id,
      side: 'firmony',
      body: t.end.message(plain(day), plain(ending?.intakeUntil ?? day), plain(ending?.handoverBy ?? day), plain(ending?.accessUntil ?? day)),
      payment: null,
    }),
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
    db.prepare("UPDATE companies SET notice_at = NULL, notice_by = NULL, notice_side = NULL, ends_on = NULL WHERE id = ? AND notice_side = 'firmony' AND ends_on >= ?").bind(company.id, dayOf(now())),
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
    const kept = await keepPaper(db, c.env.FILES, { company: company.id, user: who.user.id }, 'handover', {
      name: (file.name || 'uctovnictvo').slice(0, 120),
      bytes: new Uint8Array(await file.arrayBuffer()),
    })
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
  await db.batch([
    ...made.statements,
    ...admins.results.map((admin) => ringStatement(db, 'report', made.id, admin.email, bell.teamReport(`${siteOrigin(c)}/ucto/klienti/${company.id}/aml#oznamenia`))),
  ])
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
// VAT: the return and the control statement of a period (vat.ts), their files, and the mark that they were filed
// ---------------------------------------------------------------------------------------------------------------

/** The period of the address when it is one of the company's kind (a month, or a quarter for a quarterly payer). */
function periodParam(company: Company, text: unknown, today: string): string {
  const current = periodOf(today, company.vatQuarterly)
  if (typeof text === 'string' && isPeriod(text) && isQuarter(text) === company.vatQuarterly && text <= current) return text
  // The period whose return is due next: the last one that has ended.
  return prevPeriod(current)
}

/** A period worked out, with the documents it may hold and the returns filed. */
async function vatView(db: D1Database, company: Company, period: string, today: string): Promise<{ view: PeriodView; docs: Doc[]; filed: FiledReturn[] }> {
  const [docs, filed] = await Promise.all([docsAround(db, company.id, period, period), filedReturns(db, company.id)])
  return { view: viewOf(company, period, docs, filed, today), docs, filed }
}

/** What the accountant chose in the form of a filing; the same names in the files' address and in the mark. */
function choicesOf(get: (name: string) => unknown): FilingChoices {
  const yes = (value: unknown) => (value === '1' ? true : value === '0' ? false : undefined)
  const found = get('zistene')
  return { fast: yes(get('vratit')), settled: yes(get('vyrovnany')), foundOn: typeof found === 'string' ? dayOfText(found) || null : null }
}

/** A correction is made only from books that could be filed: nothing unbooked or unclear in the period. */
const correctionBlocked = (view: PeriodView): boolean => view.state === 'changed' && (view.companyIssues.length > 0 || view.result.issues.some((i) => i.level === 'block'))

/** The plan for a period, unless something keeps it from being filed. */
function vatPlan(company: Company, view: PeriodView, filed: FiledReturn[], today: string, choices: FilingChoices): FilingPlan | null {
  if (correctionBlocked(view) || !company.icdph || !company.taxOffice || company.vatStatus === 'none') return null
  return planFiling(company, view, filed, today, choices)
}

teamRoutes.get('/klienti/:id/dph', async (c) => {
  const company = await companyParam(c)
  if (!company) return missingPage(c)
  const db = c.env.DB
  const today = dayOf(now())
  const period = periodParam(company, c.req.query('obdobie'), today)
  const periods = stripOf(company, period, today)
  const [docs, filed] = await Promise.all([docsAround(db, company.id, periods[0] ?? period, periods[periods.length - 1] ?? period), filedReturns(db, company.id)])
  const strip = periods.map((p) => viewOf(company, p, docs, filed, today))
  const view = strip.find((s) => s.period === period) ?? viewOf(company, period, docs, filed, today)
  // Not registered: what was bought from abroad in the periods shown asks for a registration under § 7a.
  const needs = new Set(strip.flatMap((s) => s.result.issues.filter((i) => i.code === 'needs7a' && i.doc).map((i) => i.doc as string)))
  return shell(
    c,
    'clients',
    `${t.vat.title} ${periodName(period)}`,
    <VatPage
      user={c.get('who').user}
      company={company}
      view={view}
      plan={vatPlan(company, view, filed, today, {})}
      strip={strip}
      docs={new Map(docs.map((d) => [d.id, d]))}
      needs7a={docs.filter((d) => needs.has(d.id))}
      today={today}
      flash={flashOf(c)}
    />,
  )
})

/** The return or the control statement as a file, for "Načítať zo súboru" in eDane or on the portal. */
teamRoutes.get('/klienti/:id/dph/:file', async (c) => {
  const company = await companyParam(c)
  const file = c.req.param('file')
  if (!company || (file !== 'priznanie.xml' && file !== 'kontrolny-vykaz.xml')) return missingPage(c)
  const today = dayOf(now())
  const period = periodParam(company, c.req.query('obdobie'), today)
  const { view, filed } = await vatView(c.env.DB, company, period, today)
  const back = `/ucto/klienti/${company.id}/dph?obdobie=${period}`
  if (view.state === 'running') return c.redirect(`${back}&ok=dph-bezi`, 303)
  const plan = vatPlan(
    company,
    view,
    filed,
    today,
    choicesOf((name) => c.req.query(name)),
  )
  if (!plan || !company.icdph || !company.taxOffice || company.vatStatus === 'none') return c.redirect(`${back}&ok=dph-blokovane`, 303)
  const statement = file === 'kontrolny-vykaz.xml'
  if (statement ? !plan.kv : !plan.returnNeeded) return c.redirect(`${back}&ok=dph-netreba`, 303)
  const filer = { name: company.name, icdph: company.icdph, address: company.address, taxOffice: company.taxOffice, status: company.vatStatus }
  // A file of a period filed is the one that was filed, with the day it was declared.
  const declaredOn = view.state === 'filed' && view.filed ? view.filed.filedOn : today
  const xml =
    statement && plan.kv
      ? statementXml(filer, period, plan.kv.sent, plan.kv.kind)
      : returnXml(filer, period, plan.rows, { declaredOn, nothing: plan.nothing, fastRefund: plan.fast, kind: plan.kind, foundOn: plan.foundOn })
  const kind = statement ? (plan.kv?.kind ?? 'R') : plan.kind
  const name = `${statement ? 'KVDPH' : 'DPH'}${kind === 'R' ? '' : `_${kind}`}_${company.icdph}_${period}.xml`
  await c.env.DB.batch([
    eventStatement(c.env.DB, { company: company.id, user: c.get('who').user.id, action: statement ? 'vat.statement.downloaded' : 'vat.return.downloaded', subject: period, detail: { kind } }),
  ])
  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Content-Disposition': `attachment; filename="${name}"`,
      'Cache-Control': 'private, no-store',
    },
  })
})

/**
 * The return marked as filed: once, with what was filed in it, and the client told what to pay and where. A period
 * filed whose books changed takes a correction the same way, in place of the filing it corrects; a correction of the
 * control statement alone is none of the client's business and tells the client nothing.
 */
teamRoutes.post('/klienti/:id/dph/podane', async (c) => {
  const who = c.get('who')
  const company = await companyParam(c)
  if (!company) return missingPage(c)
  const body = await c.req.parseBody()
  const today = dayOf(now())
  const period = periodParam(company, body.obdobie, today)
  const back = `/ucto/klienti/${company.id}/dph?obdobie=${period}`
  const db = c.env.DB
  const { view, filed } = await vatView(db, company, period, today)
  if (view.state === 'filed') return c.redirect(`${back}&ok=dph-uz`, 303)
  if (view.state === 'running') return c.redirect(`${back}&ok=dph-bezi`, 303)
  const plan =
    view.state === 'ready' || view.state === 'changed'
      ? vatPlan(
          company,
          view,
          filed,
          today,
          choicesOf((name) => body[name]),
        )
      : null
  if (!plan) return c.redirect(`${back}&ok=dph-blokovane`, 303)
  const [done] = await db.batch([fileStatement(db, company.id, plan, who.user.id, today)])
  if ((done?.meta?.changes ?? 0) === 0) return c.redirect(`${back}&ok=dph-uz`, 303)
  const detail = {
    kind: plan.kind,
    returned: plan.returnNeeded,
    statement: plan.kv?.kind ?? null,
    pay: plan.pay,
    refund: plan.refund,
    r36: plan.settlement?.r36 ?? null,
    r37: plan.settlement?.r37 ?? null,
  }
  const action = plan.replaces ? 'vat.corrected' : 'vat.filed'
  if (!plan.returnNeeded) {
    await db.batch([eventStatement(db, { company: company.id, user: who.user.id, action, subject: period, detail })])
    return c.redirect(`${back}&ok=dph-kv`, 303)
  }
  const ret = { payCents: plan.pay }
  const paid = (await taxPaid(db, company.id, [{ period } as FiledReturn])).get(period)
  const left = leftToPay(company, ret, paid)
  const over = overpaid(company, ret, paid)
  const backCents = plan.kind === 'D' ? Math.max(0, -(plan.settlement?.r37 ?? 0)) : plan.refund
  const id = crypto.randomUUID()
  const text = t.vat.clientMessage({
    label: periodName(period),
    kind: plan.kind,
    left: left > 0 ? formatEurExact(left) : null,
    paid: left > 0 && paid && paid.cents > 0 ? formatEurExact(paid.cents) : null,
    back: backCents > 0 ? formatEurExact(backCents) : null,
    fast: plan.fast,
    over: over > 0 ? formatEurExact(over) : null,
    due: dayName(plan.dueOn),
    vs: vatSymbol(period),
    account: company.taxAccount ? groupedIban(taxIban(company.taxAccount)) : null,
  })
  await db.batch([
    messageStatement(db, { id, company: company.id, author: who.user.id, side: 'firmony', body: text, payment: null }),
    eventStatement(db, { company: company.id, user: who.user.id, action, subject: period, detail }),
    ...(await ringClient(c, company, id)),
  ])
  later(c, flushOutbox(db, c.env.EMAIL))
  return c.redirect(`${back}&ok=${plan.replaces ? 'dph-opravene' : 'dph-podane'}`, 303)
})

/** A mark set by mistake taken back; the client, who was told what to pay, is told that it does not stand. A correction
 *  gives way to the filing it replaced. */
teamRoutes.post('/klienti/:id/dph/zrusit', async (c) => {
  const who = c.get('who')
  const company = await companyParam(c)
  if (!company) return missingPage(c)
  const body = await c.req.parseBody()
  const today = dayOf(now())
  const period = periodParam(company, body.obdobie, today)
  const db = c.env.DB
  const mine = (await filedReturns(db, company.id)).find((f) => f.period === period)
  const [gone] = mine ? await db.batch([unfileStatement(db, company.id, mine)]) : []
  if (mine && (gone?.meta?.changes ?? 0) > 0) {
    const id = crypto.randomUUID()
    await db.batch([
      messageStatement(db, {
        id,
        company: company.id,
        author: who.user.id,
        side: 'firmony',
        body: mine.prev ? t.vat.clientUnfiledCorrection(periodName(period)) : t.vat.clientUnfiled(periodName(period)),
        payment: null,
      }),
      eventStatement(db, { company: company.id, user: who.user.id, action: 'vat.unfiled', subject: period, detail: { kind: mine.kind } }),
      ...(await ringClient(c, company, id)),
    ])
    later(c, flushOutbox(db, c.env.EMAIL))
  }
  return c.redirect(`/ucto/klienti/${company.id}/dph?obdobie=${period}&ok=dph-zrusene`, 303)
})

// ---------------------------------------------------------------------------------------------------------------
// The closing: a year's financial statements and corporate income tax return (closing.ts), the accountant's
// adjustments, the tax booked, their files, the deadline a notice moved, and the mark that they were filed
// ---------------------------------------------------------------------------------------------------------------

/** The years of the books one may open a closing of, the oldest first: the last five, none before the books start. */
function closingYears(books: Books, today: string): number[] {
  const start = books.start ? Number(books.start.slice(0, 4)) : null
  return bookYears(books, today)
    .filter((y) => start === null || y >= start)
    .slice(0, 5)
    .reverse()
}

/** The year of the address when the books have it; else last year when its closing is ours, else the newest. */
function closingYear(company: Company, asked: unknown, years: number[], today: string): number | null {
  const n = typeof asked === 'string' && /^\d{4}$/.test(asked) ? Number(asked) : Number.NaN
  if (years.includes(n)) return n
  const last = Number(today.slice(0, 4)) - 1
  if (years.includes(last) && closingIsOurs(company, last)) return last
  return years[years.length - 1] ?? null
}

/** A year asked for by a form, put together; null when the books do not have it. */
async function closingOfForm(c: Ctx, company: Company, asked: unknown): Promise<{ view: ClosingView; today: string } | null> {
  const db = c.env.DB
  const today = dayOf(now())
  const [books, closings] = await Promise.all([booksOf(db, company), closingsOf(db, company.id)])
  const n = typeof asked === 'string' && /^\d{4}$/.test(asked) ? Number(asked) : Number.NaN
  if (!closingYears(books, today).includes(n)) return null
  return { view: await closingView(db, company, n, today, { books, closings }), today }
}

async function closingPage(c: Ctx, company: Company, asked: unknown, form?: { values: ClosingValues; errors: ClosingErrors }) {
  const db = c.env.DB
  const today = dayOf(now())
  const [books, closings] = await Promise.all([booksOf(db, company), closingsOf(db, company.id)])
  const years = closingYears(books, today)
  const year = closingYear(company, asked, years, today)
  const view = year === null ? null : await closingView(db, company, year, today, { books, closings })
  const states = years.map((y): { year: number; state: ClosingState } => ({
    year: y,
    state: view && y === view.year ? closingState(view) : closings.some((k) => k.year === y && k.filed) ? 'filed' : today <= `${y}-12-31` ? 'running' : 'open',
  }))
  return shell(
    c,
    'clients',
    `${t.closing.title}${year ? ` ${year}` : ''}: ${company.name}`,
    <ClosingPage
      company={company}
      view={view}
      years={states}
      ours={year !== null && closingIsOurs(company, year)}
      values={form?.values ?? (view ? closingValues(view.year, view.inputs, view.proposal, { advances: view.paid.advances }) : {})}
      errors={form?.errors ?? {}}
      today={today}
      flash={form ? null : flashOf(c)}
      error={form ? t.closing.flashes.fix : null}
    />,
    form ? 422 : 200,
  )
}

teamRoutes.get('/klienti/:id/zavierka', async (c) => {
  const company = await companyParam(c)
  return company ? closingPage(c, company, c.req.query('rok')) : missingPage(c)
})

/** The accountant's adjustments, kept while the closing is not filed. */
teamRoutes.post('/klienti/:id/zavierka', async (c) => {
  const company = await companyParam(c)
  if (!company) return missingPage(c)
  const body = await c.req.parseBody()
  const found = await closingOfForm(c, company, body.rok)
  if (!found) return c.text('Bad request', 400)
  const { view } = found
  const back = `/ucto/klienti/${company.id}/zavierka?rok=${view.year}`
  if (view.closing?.filed) return c.redirect(`${back}&ok=zavierka-uz`, 303)
  const read = readClosing((name) => body[name], view.year, view.proposal, { advances: view.paid.advances })
  if (Object.keys(read.errors).length > 0) return closingPage(c, company, String(view.year), { values: read.values, errors: read.errors })
  const db = c.env.DB
  const who = c.get('who')
  await db.batch([saveInputsStatement(db, company.id, view.year, read.inputs, who.user.id), eventStatement(db, { company: company.id, user: who.user.id, action: 'closing.saved', subject: String(view.year) })])
  return c.redirect(`${back}&ok=zavierka-ulozene#dan`, 303)
})

/** The tax of the year booked as computed: an internal document on its last day, in place of the one booked before. */
teamRoutes.post('/klienti/:id/zavierka/dan', async (c) => {
  const company = await companyParam(c)
  if (!company) return missingPage(c)
  const found = await closingOfForm(c, company, (await c.req.parseBody()).rok)
  if (!found) return c.text('Bad request', 400)
  const { view } = found
  const back = `/ucto/klienti/${company.id}/zavierka?rok=${view.year}`
  if (view.running) return c.redirect(`${back}&ok=zavierka-bezi`, 303)
  if (view.closing?.filed) return c.redirect(`${back}&ok=zavierka-uz`, 303)
  const db = c.env.DB
  const who = c.get('who')
  const cents = view.tax.rows.r1050 ?? 0
  await db.batch([
    ...bookTaxStatements(db, company.id, view.year, cents, view.closing?.taxEntry ?? null, who.user.id),
    eventStatement(db, { company: company.id, user: who.user.id, action: 'closing.tax', subject: String(view.year), detail: { cents } }),
  ])
  return c.redirect(`${back}&ok=zavierka-dan`, 303)
})

/** The return or the statements as a file, for "Načítať zo súboru" in eDane or on the portal. */
teamRoutes.get('/klienti/:id/zavierka/:file', async (c) => {
  const company = await companyParam(c)
  const file = c.req.param('file')
  if (!company || (file !== 'priznanie.xml' && file !== 'zavierka.xml')) return missingPage(c)
  const found = await closingOfForm(c, company, c.req.query('rok'))
  if (!found) return missingPage(c)
  const { view, today } = found
  const back = `/ucto/klienti/${company.id}/zavierka?rok=${view.year}`
  if (view.running) return c.redirect(`${back}&ok=zavierka-bezi`, 303)
  const state = closingState(view)
  if (state !== 'ready' && state !== 'filed') return c.redirect(`${back}&ok=zavierka-blokovane`, 303)
  const filer: ClosingFiler = { name: company.name, ico: company.ico, dic: company.dic, address: company.address, registerLine: company.registerLine, nace: view.inputs.nace, activity: view.inputs.activity }
  const from = view.inputs.from ?? `${view.year}-01-01`
  // A file of a closing filed is the one that was filed, with the day it was declared.
  const declaredOn = view.closing?.filedOn ?? today
  const statements = file === 'zavierka.xml'
  const xml = statements
    ? statementsXml(filer, view.statements, view.previous, { year: view.year, from, preparedOn: declaredOn, approvedOn: view.inputs.approvedOn })
    : dppoXml(filer, view.tax, {
        year: view.year,
        from,
        to: `${view.year}-12-31`,
        declaredOn,
        kind: 'R',
        micro: view.input.micro,
        minimumHalf: view.input.minimumHalf,
        minimumExempt: view.input.minimumExempt,
        tableF: tableF(view.statements),
      })
  const name = statements ? `UZMUJ_${company.ico ?? company.id}_${view.year}.xml` : `DPPO_${company.dic ?? company.ico ?? company.id}_${view.year}.xml`
  await c.env.DB.batch([eventStatement(c.env.DB, { company: company.id, user: c.get('who').user.id, action: statements ? 'closing.statements.downloaded' : 'closing.return.downloaded', subject: String(view.year) })])
  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Content-Disposition': `attachment; filename="${name}"`,
      'Cache-Control': 'private, no-store',
    },
  })
})

/** The deadline a notice moved (§ 49(3)), or the notice taken back. */
teamRoutes.post('/klienti/:id/zavierka/lehota', async (c) => {
  const company = await companyParam(c)
  if (!company) return missingPage(c)
  const body = await c.req.parseBody()
  const found = await closingOfForm(c, company, body.rok)
  if (!found) return c.text('Bad request', 400)
  const { view } = found
  const back = `/ucto/klienti/${company.id}/zavierka?rok=${view.year}`
  const to = typeof body.lehota === 'string' ? body.lehota : ''
  if (to !== '' && !extensionDays(view.year).some((d) => d.day === to)) return c.text('Bad request', 400)
  if (view.running) return c.redirect(`${back}&ok=zavierka-bezi`, 303)
  if (view.closing?.filed) return c.redirect(`${back}&ok=zavierka-uz`, 303)
  const db = c.env.DB
  const who = c.get('who')
  await db.batch([extendStatement(db, company.id, view.year, to || null), eventStatement(db, { company: company.id, user: who.user.id, action: 'closing.extended', subject: String(view.year), detail: { to: to || null } })])
  return c.redirect(`${back}&ok=zavierka-lehota`, 303)
})

/** The closing marked as filed: once, with what was filed, and the client told what to pay, by when and where. */
teamRoutes.post('/klienti/:id/zavierka/podane', async (c) => {
  const company = await companyParam(c)
  if (!company) return missingPage(c)
  const found = await closingOfForm(c, company, (await c.req.parseBody()).rok)
  if (!found) return c.text('Bad request', 400)
  const { view, today } = found
  const back = `/ucto/klienti/${company.id}/zavierka?rok=${view.year}`
  if (view.closing?.filed) return c.redirect(`${back}&ok=zavierka-uz`, 303)
  if (view.running) return c.redirect(`${back}&ok=zavierka-bezi`, 303)
  if (closingState(view) !== 'ready') return c.redirect(`${back}&ok=zavierka-blokovane`, 303)
  const db = c.env.DB
  const who = c.get('who')
  const r = view.tax.rows
  const pay = r.r1100 ?? 0
  const snapshot = { rows: r, balance: view.statements.balanceEur, profit: view.statements.profitEur, advancesNext: view.tax.advancesNext }
  const [done] = await db.batch([fileClosingStatement(db, company.id, view.year, snapshot, pay, view.due, who.user.id, today)])
  if ((done?.meta?.changes ?? 0) === 0) return c.redirect(`${back}&ok=zavierka-uz`, 303)
  const left = Math.max(0, pay - view.paid.tax)
  const over = Math.max(0, -(r.r1101 ?? 0)) + Math.max(0, view.paid.tax - pay)
  const id = crypto.randomUUID()
  const text = t.closing.clientMessage({
    year: view.year,
    left: left > 0 ? formatEurExact(left) : null,
    paid: left > 0 && view.paid.tax > 0 ? formatEurExact(view.paid.tax) : null,
    over: over > 0 ? formatEurExact(over) : null,
    due: dayName(view.due),
    vs: incomeSymbol(view.year),
    account: company.taxAccount ? groupedIban(taxIban(company.taxAccount, INCOME_PREFIX)) : null,
    advances: { kind: view.tax.advancesNext.kind, each: formatEurExact(view.tax.advancesNext.each) },
  })
  await db.batch([
    messageStatement(db, { id, company: company.id, author: who.user.id, side: 'firmony', body: text, payment: null }),
    eventStatement(db, { company: company.id, user: who.user.id, action: 'closing.filed', subject: String(view.year), detail: { pay, r1050: r.r1050 ?? 0, r1101: r.r1101 ?? 0 } }),
    ...(await ringClient(c, company, id)),
  ])
  later(c, flushOutbox(db, c.env.EMAIL))
  return c.redirect(`${back}&ok=zavierka-podane`, 303)
})

/** A mark set by mistake taken back; the client, who was told what to pay, is told that it does not stand. */
teamRoutes.post('/klienti/:id/zavierka/zrusit', async (c) => {
  const company = await companyParam(c)
  if (!company) return missingPage(c)
  const body = await c.req.parseBody()
  const year = typeof body.rok === 'string' && /^\d{4}$/.test(body.rok) ? Number(body.rok) : null
  if (!year) return c.text('Bad request', 400)
  const db = c.env.DB
  const who = c.get('who')
  const [gone] = await db.batch([unfileClosingStatement(db, company.id, year)])
  if ((gone?.meta?.changes ?? 0) > 0) {
    const id = crypto.randomUUID()
    await db.batch([
      messageStatement(db, { id, company: company.id, author: who.user.id, side: 'firmony', body: t.closing.clientUnfiled(year), payment: null }),
      eventStatement(db, { company: company.id, user: who.user.id, action: 'closing.unfiled', subject: String(year) }),
      ...(await ringClient(c, company, id)),
    ])
    later(c, flushOutbox(db, c.env.EMAIL))
  }
  return c.redirect(`/ucto/klienti/${company.id}/zavierka?rok=${year}&ok=zavierka-zrusene`, 303)
})

// ---------------------------------------------------------------------------------------------------------------
// Payroll: a month's payslips (payroll.ts), the month closed and the client told what to pay, the employees, the
// payroll settings, an employee's payslip
// ---------------------------------------------------------------------------------------------------------------

/** The months a company's payroll opens for: the last six up to this one, none before its first employee started. */
function payrollMonths(employees: readonly Employee[], today: string): string[] {
  const current = today.slice(0, 7)
  const first = employees.reduce<string | null>((min, e) => (!min || e.startedOn < min ? e.startedOn : min), null)?.slice(0, 7) ?? current
  const out: string[] = []
  for (let m = current; out.length < 6 && m >= first; m = prevPeriod(m)) out.unshift(m)
  return out
}

/** The month of the address when it is one of them; else last month when it is, else this one. */
function payrollPeriod(asked: unknown, months: readonly string[], today: string): string {
  if (typeof asked === 'string' && months.includes(asked)) return asked
  const last = prevPeriod(today.slice(0, 7))
  return months.includes(last) ? last : today.slice(0, 7)
}

async function payrollData(db: D1Database, company: Company) {
  const [employees, runs, row] = await Promise.all([employeesOf(db, company.id), runsOf(db, company.id), db.prepare('SELECT payroll FROM companies WHERE id = ?').bind(company.id).first<{ payroll: string | null }>()])
  return { employees, runs, settings: payrollSettingsOf(row?.payroll ?? null) }
}

/** What the company pays for a month and where: each employee's net wage, the Social Insurance Agency, each health insurer, the tax office. */
function payOrders(company: Company, period: string, slips: readonly SlipLine[], employees: readonly Employee[], settings: PayrollSettings, payday: string): PayOrders {
  const totals = runTotals(slips)
  const iban = new Map(employees.map((e) => [e.id, e.iban]))
  return {
    payday,
    employees: slips.map((l) => ({ name: l.name, amount: l.slip.net, iban: iban.get(l.employeeId) ?? null })),
    social: { amount: totals.social, iban: settings.social.iban, vs: settings.social.vs },
    health: (Object.entries(totals.health) as [Insurer, number][]).map(([code, amount]) => ({ code, amount, iban: settings.health[code]?.iban ?? null, vs: settings.health[code]?.vs ?? null })),
    tax: { amount: totals.tax, iban: company.taxAccount ? taxIban(company.taxAccount, WAGE_PREFIX) : null, vs: `1100${period.slice(5, 7)}${period.slice(0, 4)}`, due: workingDayFrom(addDays(payday, 5)) },
  }
}

const settingsValues = (s: PayrollSettings): Record<string, string> => {
  const v: Record<string, string> = { den: s.payday ? String(s.payday) : '', sp_iban: s.social.iban ?? '', sp_vs: s.social.vs ?? '' }
  for (const code of Object.keys(INSURERS) as Insurer[]) {
    v[`zp_iban_${code}`] = s.health[code]?.iban ?? ''
    v[`zp_vs_${code}`] = s.health[code]?.vs ?? ''
  }
  return v
}

async function payrollPage(
  c: Ctx,
  company: Company,
  asked: unknown,
  forms: { month?: { values: Record<string, string>; errors: FieldErrors }; settings?: { values: Record<string, string>; errors: FieldErrors } } = {},
) {
  const db = c.env.DB
  const today = dayOf(now())
  const { employees, runs, settings } = await payrollData(db, company)
  const months = payrollMonths(employees, today)
  const period = payrollPeriod(asked, months, today)
  const run = runs.find((r) => r.period === period) ?? null
  const stateOf = (m: string): MonthState => (runs.some((r) => r.period === m && r.closedOn) ? 'closed' : today <= monthRange(m).to ? 'running' : 'open')
  const slips = monthSlips(period, employees, run)
  const payday = run?.payday ?? paydayOf(period, settings)
  const insurers = [...new Set<Insurer>([...employees.map((e) => e.insurer), ...(Object.keys(settings.health) as Insurer[])])]
  const failed = Boolean(forms.month || forms.settings)
  return shell(
    c,
    'clients',
    `${t.payroll.title}: ${company.name}`,
    <PayrollPage
      company={company}
      period={period}
      months={months.map((m) => ({ period: m, state: stateOf(m) }))}
      state={stateOf(period)}
      employees={employees}
      slips={slips}
      run={run}
      totals={runTotals(slips)}
      orders={payOrders(company, period, slips, employees, settings, payday)}
      values={forms.month?.values ?? { vyplata: textDay(payday) }}
      errors={forms.month?.errors ?? {}}
      settings={{ values: forms.settings?.values ?? settingsValues(settings), errors: forms.settings?.errors ?? {}, insurers }}
      today={today}
      flash={failed ? null : flashOf(c)}
      error={failed ? t.payroll.flashes.fix : null}
    />,
    failed ? 422 : 200,
  )
}

teamRoutes.get('/klienti/:id/mzdy', async (c) => {
  const company = await companyParam(c)
  return company ? payrollPage(c, company, c.req.query('obdobie')) : missingPage(c)
})

/** The incomes typed and the payday: kept, or the month closed with them and the client told what to pay. */
teamRoutes.post('/klienti/:id/mzdy', async (c) => {
  const company = await companyParam(c)
  if (!company) return missingPage(c)
  const db = c.env.DB
  const who = c.get('who')
  const body = await c.req.parseBody()
  const today = dayOf(now())
  const { employees, runs, settings } = await payrollData(db, company)
  const months = payrollMonths(employees, today)
  const period = typeof body.obdobie === 'string' && months.includes(body.obdobie) ? body.obdobie : null
  if (!period) return c.text('Bad request', 400)
  const back = `/ucto/klienti/${company.id}/mzdy?obdobie=${period}`
  const run = runs.find((r) => r.period === period) ?? null
  if (run?.closedOn) return c.redirect(`${back}&ok=mzdy-uz`, 303)
  const values: Record<string, string> = {}
  const errors: FieldErrors = {}
  const proposed = monthSlips(period, employees, run)
  const lines = proposed.map((l) => {
    const name = `hruba_${l.employeeId}`
    const text = typeof body[name] === 'string' ? (body[name] as string).trim().slice(0, 14) : ''
    values[name] = text
    const cents = centsOf(text)
    if (cents === null || Number.isNaN(cents) || cents < 0) errors[name] = t.payroll.errors.amount
    return { employeeId: l.employeeId, name: l.name, insurer: l.insurer, gross: cents !== null && cents >= 0 ? cents : 0 }
  })
  const paydayText = typeof body.vyplata === 'string' ? body.vyplata.trim().slice(0, 16) : ''
  values.vyplata = paydayText
  const payday = dayOfText(paydayText)
  if (!payday || payday < `${period}-01`) errors.vyplata = t.payroll.errors.paydayDate
  if (Object.keys(errors).length > 0 || !payday) return payrollPage(c, company, period, { month: { values, errors } })
  const close = body.akcia === 'uzavriet'
  if (!close) {
    await db.batch([saveRunStatement(db, company.id, period, payday, lines, who.user.id, now()), eventStatement(db, { company: company.id, user: who.user.id, action: 'payroll.saved', subject: period })])
    return c.redirect(`${back}&ok=mzdy-ulozene`, 303)
  }
  if (today <= monthRange(period).to) return c.redirect(`${back}&ok=mzdy-bezi`, 303)
  if (lines.length === 0) return c.redirect(`${back}&ok=mzdy-nikto`, 303)
  const slips = monthSlips(period, employees, { period, payday, lines, closedOn: null, closedByName: null })
  const [done] = await db.batch([closeRunStatement(db, company.id, period, payday, slips, who.user.id, today, now())])
  if ((done?.meta?.changes ?? 0) === 0) return c.redirect(`${back}&ok=mzdy-uz`, 303)
  const orders = payOrders(company, period, slips, employees, settings, payday)
  const iban = (value: string | null) => (value ? groupedIban(value) : null)
  const text = t.payroll.clientMessage({
    month: monthName(`${period}-01`),
    payday: dayName(payday),
    employees: orders.employees.map((e) => ({ name: e.name, amount: formatEurExact(e.amount), iban: iban(e.iban) })),
    social: orders.social.amount > 0 ? { amount: formatEurExact(orders.social.amount), iban: iban(orders.social.iban), vs: orders.social.vs } : null,
    health: orders.health.map((h) => ({ name: INSURERS[h.code], amount: formatEurExact(h.amount), iban: iban(h.iban), vs: h.vs })),
    tax: orders.tax.amount > 0 ? { amount: formatEurExact(orders.tax.amount), iban: iban(orders.tax.iban), vs: orders.tax.vs, due: dayName(orders.tax.due) } : null,
  })
  const id = crypto.randomUUID()
  await db.batch([
    messageStatement(db, { id, company: company.id, author: who.user.id, side: 'firmony', body: text, payment: null }),
    eventStatement(db, { company: company.id, user: who.user.id, action: 'payroll.closed', subject: period, detail: { employees: slips.length, gross: runTotals(slips).gross } }),
    ...(await ringClient(c, company, id)),
  ])
  later(c, flushOutbox(db, c.env.EMAIL))
  return c.redirect(`${back}&ok=mzdy-uzavrete`, 303)
})

/** A month closed by mistake opened again; the client, who was told what to pay, is told that it does not stand. */
teamRoutes.post('/klienti/:id/mzdy/otvorit', async (c) => {
  const company = await companyParam(c)
  if (!company) return missingPage(c)
  const body = await c.req.parseBody()
  const period = typeof body.obdobie === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(body.obdobie) ? body.obdobie : null
  if (!period) return c.text('Bad request', 400)
  const db = c.env.DB
  const who = c.get('who')
  const [gone] = await db.batch([reopenRunStatement(db, company.id, period)])
  if ((gone?.meta?.changes ?? 0) > 0) {
    const id = crypto.randomUUID()
    await db.batch([
      messageStatement(db, { id, company: company.id, author: who.user.id, side: 'firmony', body: t.payroll.clientReopened(monthName(`${period}-01`)), payment: null }),
      eventStatement(db, { company: company.id, user: who.user.id, action: 'payroll.reopened', subject: period }),
      ...(await ringClient(c, company, id)),
    ])
    later(c, flushOutbox(db, c.env.EMAIL))
  }
  return c.redirect(`/ucto/klienti/${company.id}/mzdy?obdobie=${period}&ok=mzdy-otvorene`, 303)
})

/** The payroll settings: the payday, and the accounts and payer numbers at the Social Insurance Agency and the health insurers. */
teamRoutes.post('/klienti/:id/mzdy/nastavenie', async (c) => {
  const company = await companyParam(c)
  if (!company) return missingPage(c)
  const body = await c.req.parseBody()
  const text = (name: string, max: number) => (typeof body[name] === 'string' ? (body[name] as string).trim().slice(0, max) : '')
  const values: Record<string, string> = {}
  const errors: FieldErrors = {}
  const den = text('den', 2)
  values.den = den
  const day = den === '' ? null : Number(den)
  if (day !== null && (!Number.isInteger(day) || day < 1 || day > 31)) errors.den = t.payroll.errors.payday
  const pair = (ibanName: string, vsName: string) => {
    const i = text(ibanName, 34)
    const v = text(vsName, 10)
    values[ibanName] = i
    values[vsName] = v
    if (i !== '' && !isIban(i)) errors[ibanName] = t.payroll.errors.iban
    if (v !== '' && !/^\d{1,10}$/.test(v)) errors[vsName] = t.payroll.errors.vs
    return { iban: i !== '' && isIban(i) ? plainIban(i) : null, vs: /^\d{1,10}$/.test(v) ? v : null }
  }
  const settings: PayrollSettings = { payday: errors.den ? null : day, social: pair('sp_iban', 'sp_vs'), health: {} }
  for (const code of Object.keys(INSURERS) as Insurer[]) {
    if (!(`zp_iban_${code}` in body) && !(`zp_vs_${code}` in body)) continue
    settings.health[code] = pair(`zp_iban_${code}`, `zp_vs_${code}`)
  }
  if (Object.keys(errors).length > 0) return payrollPage(c, company, body.obdobie, { settings: { values, errors } })
  const db = c.env.DB
  await db.batch([settingsStatement(db, company.id, settings), eventStatement(db, { company: company.id, user: c.get('who').user.id, action: 'payroll.settings' })])
  return c.redirect(`/ucto/klienti/${company.id}/mzdy?ok=mzdy-nastavenie#nastavenie`, 303)
})

const employeeValues = (e: Employee | null): Record<string, string> => {
  const v: Record<string, string> = {
    meno: e?.name ?? '',
    narodeny: e?.bornOn ? textDay(e.bornOn) : '',
    poistovna: e?.insurer ?? '25',
    nastup: e ? textDay(e.startedOn) : '',
    skoncenie: e?.endedOn ? textDay(e.endedOn) : '',
    mzda: e ? moneyText(e.wage) : '',
    iban: e?.iban ? groupedIban(e.iban) : '',
    vyhlasenie: e?.declaration ? '1' : '',
    ztp: e?.disabled ? '1' : '',
    op: e?.healthDeduction ? '1' : '',
    vynimka: e?.healthExempt ? '1' : '',
  }
  for (let i = 0; i < CHILD_ROWS; i++) {
    v[`dieta_${i}`] = e?.children[i]?.name ?? ''
    v[`narodene_${i}`] = e?.children[i] ? textDay(e.children[i]?.born ?? '') : ''
  }
  return v
}

teamRoutes.get('/klienti/:id/mzdy/zamestnanec', async (c) => {
  const company = await companyParam(c)
  if (!company) return missingPage(c)
  const asked = c.req.query('id')
  const employee = asked ? ((await employeesOf(c.env.DB, company.id)).find((e) => e.id === asked) ?? null) : null
  if (asked && !employee) return missingPage(c)
  return shell(c, 'clients', `${t.payroll.title}: ${company.name}`, <EmployeePage company={company} form={{ id: employee?.id ?? null, values: employeeValues(employee), errors: {} }} />)
})

teamRoutes.post('/klienti/:id/mzdy/zamestnanec', async (c) => {
  const company = await companyParam(c)
  if (!company) return missingPage(c)
  const db = c.env.DB
  const body = await c.req.parseBody()
  const text = (name: string, max: number) => (typeof body[name] === 'string' ? (body[name] as string).trim().slice(0, max) : '')
  const existing = typeof body.id === 'string' && ID.test(body.id) ? ((await employeesOf(db, company.id)).find((e) => e.id === body.id) ?? null) : null
  if (typeof body.id === 'string' && body.id !== '' && !existing) return missingPage(c)
  const values: Record<string, string> = {}
  const errors: FieldErrors = {}
  const field = (name: string, max: number) => {
    values[name] = text(name, max)
    return values[name] as string
  }
  const name = field('meno', 80)
  if (name.length < 2) errors.meno = t.payroll.errors.name
  const born = dayOfText(field('narodeny', 16), 1900)
  if (born === null) errors.narodeny = t.payroll.errors.day
  const insurer = field('poistovna', 2)
  if (!isInsurer(insurer)) errors.poistovna = t.payroll.errors.insurer
  const started = dayOfText(field('nastup', 16))
  if (!started) errors.nastup = t.payroll.errors.day
  const ended = dayOfText(field('skoncenie', 16))
  if (ended === null) errors.skoncenie = t.payroll.errors.day
  else if (ended && started && ended < started) errors.skoncenie = t.payroll.errors.ended
  const wage = centsOf(field('mzda', 14))
  if (wage === null || Number.isNaN(wage) || wage < 0) errors.mzda = t.payroll.errors.amount
  const iban = field('iban', 34)
  if (iban !== '' && !isIban(iban)) errors.iban = t.payroll.errors.iban
  for (const tick of ['vyhlasenie', 'ztp', 'op', 'vynimka']) values[tick] = body[tick] === '1' ? '1' : ''
  const children: { name: string; born: string }[] = []
  for (let i = 0; i < CHILD_ROWS; i++) {
    const childName = field(`dieta_${i}`, 80)
    const childBorn = dayOfText(field(`narodene_${i}`, 16))
    if (childName === '' && childBorn === '') continue
    if (childName.length < 1 || !childBorn) errors[`dieta_${i}`] = t.payroll.errors.child
    else children.push({ name: childName, born: childBorn })
  }
  if (Object.keys(errors).length > 0 || !started || wage === null || !isInsurer(insurer))
    return shell(c, 'clients', `${t.payroll.title}: ${company.name}`, <EmployeePage company={company} form={{ id: existing?.id ?? null, values, errors }} />, 422)
  const employee: Employee = {
    id: existing?.id ?? crypto.randomUUID(),
    name,
    bornOn: born || null,
    insurer,
    startedOn: started,
    endedOn: ended || null,
    wage,
    declaration: values.vyhlasenie === '1',
    disabled: values.ztp === '1',
    healthDeduction: values.op === '1',
    healthExempt: values.vynimka === '1',
    children,
    iban: iban !== '' ? plainIban(iban) : null,
  }
  await db.batch([
    employeeStatement(db, company.id, employee, c.get('who').user.id, now()),
    eventStatement(db, { company: company.id, user: c.get('who').user.id, action: existing ? 'employee.changed' : 'employee.added', subject: employee.id }),
  ])
  return c.redirect(`/ucto/klienti/${company.id}/mzdy?ok=mzdy-zamestnanec#zamestnanci`, 303)
})

/** An employee's payslip of a month, to print. */
teamRoutes.get('/klienti/:id/mzdy/paska', async (c) => {
  const company = await companyParam(c)
  if (!company) return missingPage(c)
  const today = dayOf(now())
  const { employees, runs } = await payrollData(c.env.DB, company)
  const months = payrollMonths(employees, today)
  const period = c.req.query('obdobie') ?? ''
  if (!months.includes(period)) return missingPage(c)
  const line = monthSlips(period, employees, runs.find((r) => r.period === period) ?? null).find((l) => l.employeeId === c.req.query('zamestnanec'))
  if (!line) return missingPage(c)
  return shell(c, 'clients', `${t.payroll.payslip}: ${line.name}`, <PayslipPage company={company} period={period} line={line} today={today} />)
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
// The books: the trial balance, the journal, an account, the open items, payments without a document, internal
// documents and the opening balances. All of it is worked out from the books (src/app/ledger.ts) on every request.
// ---------------------------------------------------------------------------------------------------------------

/** The year and the month of the address: this year up to this month unless another is asked for. */
function rangeOf(c: Ctx, years: number[], today: string): { year: number; month: number } {
  const asked = Number(c.req.query('rok'))
  const thisYear = Number(today.slice(0, 4))
  const year = years.includes(asked) ? asked : thisYear
  const m = Number(c.req.query('mesiac'))
  const month = Number.isInteger(m) && m >= 1 && m <= 12 ? m : year === thisYear ? Number(today.slice(5, 7)) : 12
  return { year, month }
}

async function booksPage(c: Ctx): Promise<{ company: Company; books: Books; today: string; years: number[]; year: number; month: number } | null> {
  const company = await companyParam(c)
  if (!company) return null
  const today = dayOf(now())
  const books = await booksOf(c.env.DB, company)
  const years = bookYears(books, today)
  return { company, books, today, years, ...rangeOf(c, years, today) }
}

teamRoutes.get('/klienti/:id/kniha', async (c) => {
  const b = await booksPage(c)
  if (!b) return missingPage(c)
  return shell(
    c,
    'clients',
    `${t.ledger.title}: ${b.company.name}`,
    <TrialPage company={b.company} books={b.books} tb={trialBalance(b.books, b.year, b.month)} years={b.years} year={b.year} month={b.month} today={b.today} flash={flashOf(c)} />,
  )
})

teamRoutes.get('/klienti/:id/kniha/dennik', async (c) => {
  const b = await booksPage(c)
  if (!b) return missingPage(c)
  return shell(c, 'clients', `${t.ledger.journalTitle}: ${b.company.name}`, <JournalPage company={b.company} books={b.books} years={b.years} year={b.year} month={b.month} />)
})

teamRoutes.get('/klienti/:id/kniha/ucet/:account', async (c) => {
  const account = canonicalAccount(c.req.param('account'))
  const b = account ? await booksPage(c) : null
  if (!b || !account) return missingPage(c)
  const moves = accountMoves(b.books, account, b.year, b.month)
  return shell(
    c,
    'clients',
    `${t.ledger.accountTitle(account)}: ${b.company.name}`,
    <AccountPage company={b.company} books={b.books} account={account} name={accountName(account, b.books.banks)} {...moves} years={b.years} year={b.year} month={b.month} />,
  )
})

teamRoutes.get('/klienti/:id/kniha/saldokonto', async (c) => {
  const b = await booksPage(c)
  if (!b) return missingPage(c)
  return shell(c, 'clients', `${t.ledger.saldoTitle}: ${b.company.name}`, <SaldoPage company={b.company} books={b.books} today={b.today} />)
})

teamRoutes.get('/klienti/:id/kniha/platby', async (c) => {
  const b = await booksPage(c)
  if (!b) return missingPage(c)
  return shell(
    c,
    'clients',
    `${t.ledger.paymentsTitle}: ${b.company.name}`,
    <PaymentsPage company={b.company} books={b.books} payments={paymentsWithoutDocuments(b.books, b.year)} years={b.years} year={b.year} flash={flashOf(c)} />,
  )
})

/** The account the accountant gives a payment without a document; empty puts its reason's back. */
teamRoutes.post('/klienti/:id/kniha/platby/:payment', async (c) => {
  const b = await booksPage(c)
  const id = c.req.param('payment')
  const payment = b && ID.test(id) ? b.books.payments.get(id) : undefined
  if (!b || !payment) return missingPage(c)
  const body = await c.req.parseBody()
  const typed = typeof body.ucet === 'string' ? body.ucet.trim().slice(0, 12) : ''
  const account = typed === '' ? null : canonicalAccount(typed)
  if (typed !== '' && (!account || synthetic(account) === '221')) {
    return shell(
      c,
      'clients',
      `${t.ledger.paymentsTitle}: ${b.company.name}`,
      <PaymentsPage company={b.company} books={b.books} payments={paymentsWithoutDocuments(b.books, b.year)} years={b.years} year={b.year} error={{ payment: id, value: typed }} />,
      422,
    )
  }
  const db = c.env.DB
  await db.batch([contraStatement(db, b.company.id, id, account), eventStatement(db, { company: b.company.id, user: c.get('who').user.id, action: 'ledger.contra', subject: id, detail: { account } })])
  return c.redirect(`${bookPath(b.company, 'payments')}?rok=${b.year}&ok=kniha-ucet#platba-${id}`, 303)
})

const INTERNAL_ROWS = 6

async function internalPage(c: Ctx, company: Company, form: InternalForm, status: ContentfulStatusCode = 200) {
  const entries = (await manualEntries(c.env.DB, company.id)).filter((m) => m.kind === 'internal').reverse()
  return shell(c, 'clients', `${t.ledger.internalTitle}: ${company.name}`, <InternalPage company={company} entries={entries} form={form} flash={status === 200 ? flashOf(c) : null} />, status)
}

teamRoutes.get('/klienti/:id/kniha/interne', async (c) => {
  const company = await companyParam(c)
  if (!company) return missingPage(c)
  return internalPage(c, company, emptyInternal(dayOf(now()), INTERNAL_ROWS))
})

teamRoutes.post('/klienti/:id/kniha/interne', async (c) => {
  const company = await companyParam(c)
  if (!company) return missingPage(c)
  const body = await c.req.parseBody()
  const text = (name: string, max: number) => (typeof body[name] === 'string' ? (body[name] as string).trim().slice(0, max) : '')
  const rows = Array.from({ length: INTERNAL_ROWS }, (_, i) => ({ md: text(`md_${i}`, 12), d: text(`d_${i}`, 12), amount: text(`suma_${i}`, 20) }))
  const day = dayOfText(text('datum', 20))
  const what = text('text', 160)
  const read = readEntryRows(rows)
  const errors: InternalForm['errors'] = {}
  if (!day) errors.day = true
  if (what.length < 2) errors.text = true
  if (Object.keys(read.errors).length > 0) errors.rows = read.errors
  else if (read.lines.length === 0) errors.lines = true
  if (!day || Object.keys(errors).length > 0) return internalPage(c, company, { day: text('datum', 20), text: what, rows, errors }, 422)
  const db = c.env.DB
  const id = crypto.randomUUID()
  await db.batch([
    internalStatement(db, company.id, { id, on: day, text: what, lines: read.lines }, c.get('who').user.id),
    eventStatement(db, { company: company.id, user: c.get('who').user.id, action: 'ledger.internal', subject: id, detail: { on: day, lines: read.lines.length } }),
  ])
  return c.redirect(`${bookPath(company, 'internal')}?ok=kniha-interny`, 303)
})

teamRoutes.post('/klienti/:id/kniha/interne/:entry/odstranit', async (c) => {
  const company = await companyParam(c)
  const id = c.req.param('entry')
  if (!company || !ID.test(id)) return missingPage(c)
  const db = c.env.DB
  const removed = await removeInternalStatement(db, company.id, id, c.get('who').user.id).run()
  if ((removed.meta?.changes ?? 0) === 0) return missingPage(c)
  await db.batch([eventStatement(db, { company: company.id, user: c.get('who').user.id, action: 'ledger.removed', subject: id })])
  return c.redirect(`${bookPath(company, 'internal')}?ok=kniha-odstraneny`, 303)
})

const money = (cents: number | null): string => (cents === null ? '' : moneyText(cents))

async function openingPage(c: Ctx, company: Company, form: OpeningForm | null, status: ContentfulStatusCode = 200) {
  const saved = (await manualEntries(c.env.DB, company.id)).find((m) => m.kind === 'opening') ?? null
  const rows: OpeningRowValue[] = form?.rows ?? (saved ? openingRows(saved.lines).map((r) => ({ account: r.account, md: money(r.md), d: money(r.d) })) : [])
  const filled = rows.filter((r) => r.account || r.md || r.d)
  const shown = [...filled, ...Array.from({ length: Math.max(14 - filled.length, 8) }, () => ({ account: '', md: '', d: '' }))]
  const day = form?.day ?? textDay(saved?.on ?? company.startOn ?? `${dayOf(now()).slice(0, 4)}-01-01`)
  return shell(
    c,
    'clients',
    `${t.ledger.openingTitle}: ${company.name}`,
    <OpeningPage company={company} form={{ day, rows: form ? rows : shown, errors: form?.errors ?? {} }} saved={saved} flash={status === 200 ? flashOf(c) : null} />,
    status,
  )
}

teamRoutes.get('/klienti/:id/kniha/pociatocne', async (c) => {
  const company = await companyParam(c)
  return company ? openingPage(c, company, null) : missingPage(c)
})

const OPENING_ROWS = 80

teamRoutes.post('/klienti/:id/kniha/pociatocne', async (c) => {
  const company = await companyParam(c)
  if (!company) return missingPage(c)
  const body = await c.req.parseBody()
  const text = (name: string, max: number) => (typeof body[name] === 'string' ? (body[name] as string).trim().slice(0, max) : '')
  const rows: OpeningRowValue[] = []
  for (let i = 0; i < OPENING_ROWS; i++) {
    if (!(`ucet_${i}` in body) && !(`md_${i}` in body) && !(`d_${i}` in body)) continue
    rows.push({ account: text(`ucet_${i}`, 12), md: text(`md_${i}`, 20), d: text(`d_${i}`, 20) })
  }
  const day = dayOfText(text('datum', 20))
  const read = readOpeningRows(rows)
  const errors: OpeningForm['errors'] = {}
  if (!day) errors.day = true
  if (Object.keys(read.errors).length > 0) errors.rows = read.errors
  else if (read.md !== read.d) errors.unbalanced = { md: read.md, d: read.d }
  if (!day || Object.keys(errors).length > 0) return openingPage(c, company, { day: text('datum', 20), rows, errors }, 422)
  const db = c.env.DB
  const id = crypto.randomUUID()
  await db.batch([
    ...openingStatements(db, company.id, { id, on: day, lines: read.lines }, c.get('who').user.id),
    eventStatement(db, { company: company.id, user: c.get('who').user.id, action: 'ledger.opening', subject: id, detail: { on: day, lines: read.lines.length, total: read.md } }),
  ])
  return c.redirect(`${bookPath(company, 'opening')}?ok=kniha-ps`, 303)
})

/** The books as files for Slovak Excel: the journal and the general ledger of a year, the trial balance, the open items. */
teamRoutes.get('/klienti/:id/kniha/:file', async (c) => {
  const file = c.req.param('file')
  if (!['dennik.csv', 'hlavna-kniha.csv', 'predvaha.csv', 'saldokonto.csv'].includes(file)) return missingPage(c)
  const b = await booksPage(c)
  if (!b) return missingPage(c)
  const csv =
    file === 'dennik.csv'
      ? journalCsv(b.books, b.year)
      : file === 'hlavna-kniha.csv'
        ? generalLedgerCsv(b.books, b.year)
        : file === 'predvaha.csv'
          ? trialCsv(trialBalance(b.books, b.year, b.month))
          : saldoCsv(b.books, b.today)
  const slug = (b.company.ico ?? b.company.name).replace(/[^\p{L}\p{N}]+/gu, '-').toLowerCase()
  const name = `${file.replace('.csv', '')}-${slug}-${file === 'saldokonto.csv' ? b.today : file === 'predvaha.csv' ? `${b.year}-${String(b.month).padStart(2, '0')}` : b.year}.csv`
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
      'Cache-Control': 'private, no-store',
    },
  })
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

/**
 * The booking form's VAT: what the accountant confirmed, or what is proposed until she does, with the periods it may
 * go into and where it goes. Null for a company that reports no VAT or a document whose kind has none.
 */
async function vatFormOf(db: D1Database, company: Company, doc: Doc, typed?: { values: VatForm['values']; errors: VatForm['errors'] }): Promise<VatForm | null> {
  if (company.vatStatus === 'none') return null
  const modes = modesFor(doc.kind)
  if (modes.length === 0) return null
  const counted = vatOf(vatDocOf(doc), vatCompanyOf(company))
  if (!counted) return null
  const filed = await filedReturns(db, company.id)
  const preview = docPreview(company, doc, counted.data, filed)
  const data: VatData = counted.data
  const sum = data.lines.reduce((total, line) => total + line.base + (data.mode === 'domestic' ? line.vat : 0), 0)
  const euro = (doc.currency ?? 'EUR') === 'EUR'
  const sumOff =
    euro && doc.totalCents !== null && data.lines.length > 0 && data.mode !== 'none' && Math.abs(sum - doc.totalCents) > 1
      ? t.book.vatSumOff(formatEurExact(sum), formatEurExact(doc.totalCents))
      : null
  const goes =
    preview.goes.length > 0
      ? t.book.vatGoes(periodName(preview.period), preview.goes.map((key) => (key.startsWith('r') ? `r. ${key.slice(1)}` : `${key.slice(0, 1)}.${key.slice(1)}`)).join(', '))
      : t.book.vatGoesNowhere
  return {
    values: typed?.values ?? vatValues(data),
    errors: typed?.errors ?? {},
    proposed: counted.proposed,
    modes,
    periods: periodsAround(preview.natural, data.period, nextPeriod, prevPeriod),
    natural: preview.natural,
    goes,
    issues: preview.issues,
    sumOff,
    currency: euro ? null : doc.currency,
    selfVat: selfVatOf(data),
  }
}

async function bookPage(
  c: Ctx,
  found: { doc: Doc; company: Company },
  extra: { values?: BookValues; errors?: Partial<Record<keyof BookValues, string>>; vat?: { values: VatForm['values']; errors: VatForm['errors'] } } = {},
  status: ContentfulStatusCode = 200,
) {
  const who = c.get('who')
  const db = c.env.DB
  const { doc, company } = found
  const [payment, candidates, queue, invoice, vat] = await Promise.all([
    doc.paymentId ? getPayment(db, company.id, doc.paymentId) : Promise.resolve(null),
    candidatesFor(db, company.id, doc),
    bookingQueue(db, who.user, true, company.id),
    doc.invoiceId ? getInvoice(db, company.id, doc.invoiceId) : Promise.resolve(null),
    vatFormOf(db, company, doc, extra.vat),
  ])
  // A company that is not registered and buys a service from abroad owes a registration under § 7a.
  const needs7a = company.vatStatus === 'none' && vatOf(vatDocOf(doc), vatCompanyOf(company))?.data.mode === 'reverse'
  return shell(
    c,
    'queue',
    t.book.title,
    <BookPage
      d={doc}
      company={company}
      vat={vat}
      vatKindFirst={company.vatStatus !== 'none' && familyOf(doc.kind) === null}
      needs7a={needs7a}
      invoice={invoice ? { invoice, lines: await invoiceLines(db, invoice.id) } : null}
      values={extra.values ?? valuesOf(doc, company.vatPayer)}
      ledgerLines={
        extra.values ? null : bookingLines(doc, company, payment ? { bookedOn: payment.bookedOn, amountCents: payment.amountCents, bankLedger: payment.bankLedger, docs: payment.docs } : null)
      }
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
  // The VAT part of the form, when it was on it: read only while the kind stays issued or received as it was shown;
  // a document that changes between them gets a new proposal for its new kind.
  const kind = (values.kind || null) as DocKind | null
  const vatShown = body.dph === '1' && company.vatStatus !== 'none'
  const sameFamily = familyOf(kind) !== null && familyOf(kind) === familyOf(doc.kind)
  let vatRead: ReturnType<typeof readVat> | null = null
  if (vatShown && sameFamily) {
    const counted = vatOf(vatDocOf(doc), vatCompanyOf(company))
    const natural = counted ? docPreview(company, doc, { ...counted.data, period: null }, await filedReturns(db, company.id)).natural : null
    const periods = natural ? periodsAround(natural, counted?.data.period ?? null, nextPeriod, prevPeriod) : []
    vatRead = readVat(body, { kind, payer: company.vatStatus === 'payer', deduct: values.deduct, booking, periods })
  }
  const vatErrors = vatRead !== null && Object.keys(vatRead.errors).length > 0
  if (Object.keys(errors).length > 0 || vatErrors) return bookPage(c, found, { values, errors, vat: vatRead ? { values: vatRead.values, errors: vatRead.errors } : undefined }, 422)
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
  if (vatRead?.data) {
    const v = vatRead.data
    statements.push(
      db
        .prepare('UPDATE documents SET vat_mode = ?, vat_lines = ?, supplied_on = ?, party_vat_id = ?, corrects = ?, vat_period = ? WHERE id = ? AND company_id = ?')
        .bind(v.mode, JSON.stringify(v.lines), v.suppliedOn, v.vatId, v.corrects, v.period, doc.id, company.id),
    )
  } else if (vatShown && !sameFamily) {
    statements.push(db.prepare('UPDATE documents SET vat_mode = NULL, vat_period = NULL WHERE id = ? AND company_id = ?').bind(doc.id, company.id))
  }
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
    headers: {
      'Content-Type': type,
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(name)}`,
      'Cache-Control': 'private, no-store',
      'Content-Security-Policy': policy,
      'X-Frame-Options': type === 'application/pdf' ? 'SAMEORIGIN' : 'DENY',
    },
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
