import { prepareDossier, signatureFile } from '../aml/store'
import { companyFacts } from '../aml/model'
import { declarationPdf } from '../aml/pdf'
import { bootstrapOfficerStatement } from '../aml/store'
import { cancelHandover, managedHandover, requestHandover } from '../migration/store'
import { requestErrors, takeoverLoginNext, type HandoverRequestValues } from '../migration/model'
import { cancelFormation, formationCase, requestFormation } from '../formation/store'
import { requestErrors as formationRequestErrors, type FormationRequestValues } from '../formation/model'
import { ClientFormation } from '../views/formation'
import { accessOpenSql } from '../aml/retention'
import { TakeoverCompanyChoice } from '../views/managed-takeover'
import { AssistantPage } from '../views/assistant'
import { assistantAnswer, assistantDocuments } from '../assistant/context'
import { assistantAllowed, assistantControl, type AssistantScope } from '../assistant/store'
import { assistantQuestion, assistantTopic } from '../assistant/model'
import { askAssistant } from '../assistant/service'
// The client's app under /app. Signing in is open; everything else needs a session, and every read and change
// is made for the company of that session (store.ts). Forms answer with a redirect to a page that says what
// happened, so a reload never sends anything twice.
import { Hono, type Context } from 'hono'
import { clientPayrollReportRoutes } from '../payroll-reporting/routes'
import { clientFilingRoutes } from '../filings/routes'
import { html } from 'hono/html'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { APP, BANK, BANK_WAYS, BRAND, ENDING, FIO, TEAM } from '../config'
import { ensureSchema, now, sha256Hex, withinLimit } from '../db'
import { connection, isLocal, later, siteOrigin } from '../http'
import { flushOutbox, queueStatement, type Mailer } from '../mail'
import { DocumentPage, DocumentsPage, MessagesPage, Missing, Overview, PaymentPage, PaymentsPage, dayOf, groupIban } from '../views/inside-pages'
import { ConfirmByLink, Door, Enter, Expired, FirstAdmin, LinkSent, LoginForm, Shell, type Place } from '../views/inside'
import { CompanyPage } from '../views/settings'
import { InvoiceFormPage, InvoicePage, InvoicesPage, NumberingPage, logoSrc, type LateView, type NumberingValues } from '../views/invoices'
import { BankPage, waitingFirst, type BankSetup } from '../views/bank'
import { isFioToken, linkFio } from './fio'
import { answerAccount, statementById, statementDue, statementsOf, takeStatementFile } from './statements'
import { PoaPage, SwitchPage } from '../views/papers'
import { DeclarationPage } from '../views/declaration'
import { ContractPage } from '../views/contract'
import { bootstrapReady, safeNext, sensitivePath, type SecurityBindings } from '../security/policy'
import { securityGate } from '../security/routes'
import { resolveContract, type ContractBindings } from '../contracts'
import { TaxesPage } from '../views/taxes'
import { closingsOf, incomePaid } from './closing-store'
import { filedReturns, taxPaid } from './vat-store'
import { billingScheduled, billRows, tariffForClient } from '../team/billing-store'
import { booksRefused, getPaper, keepPaper, paperResponse, papersOf, poaStateOf } from './papers'
import { checkDeclaration, declarationStateOf, declarationStatements, latestDeclaration, noticeEndsOn, valuesFrom, valuesOfDeclaration, type DeclarationErrors, type DeclarationValues } from './aml'
import { bell, ringStatement } from '../bell'
import { bankReady, dropAccount, finishLink, linksOf, listBanks, noticeOf, readDue, readLink, startLink, unlink } from './bank'
import { bankHealthOf } from './overview'
import {
  advancePayments,
  advancesOf,
  centsOf,
  finalOf,
  isInvoiceCurrency,
  isCountry,
  checkValues,
  deductionLines,
  isInvoiceMode,
  creditLeft,
  creditLines,
  creditTooMuch,
  creditedLines,
  getInvoice,
  invoiceLines,
  linesOf,
  listInvoices,
  ON_REQUEST_SQL,
  plainIban,
  isIban,
  saveInvoiceStatements,
  stateOf,
  totalsOf,
  ublOf,
  type Errors as InvoiceErrors,
  type InvoiceMode,
  type InvoiceValues,
  type Line,
  type LineInput,
  type StoredInvoice,
} from './invoices'
import { dayOfText, isCategory, textDay } from './booking'
import { autoBook } from './autobook'
import { balanceOf, canonicalAccount, payableOf, type Books } from './ledger'
import { booksOf } from './ledger-store'
import { lookupCompany } from '../rpo'
import { normalizeIco } from '../ico'
import { formatEur, formatEurExact, formatMoney } from '../format'
import { app as t, dayName, monthName } from './copy'
import { clientDeadlines, nextMonth } from './deadlines'
import { companyDeadlines } from '../team/deadlines-store'
import { DEMO, seedDemo } from './demo'
import { EXEMPTS, type Exempt } from './match'
import { sniff } from './read'
import { keepFilesFor, readOne, type Kept, type NewFile } from './intake'
import { remindAll, remindApprovals, remindBankRenewals, remindStatements, bratislava } from './remind'
import { ratesFor, refreshRates } from './fx-store'
import { orderItems, orderStatements, painXml, payables, paymentOrders, PAYABLE_DOC } from './payorders'
import { issueAdvances } from './advance-auto'
import { PayOrdersPage } from '../views/payorders'
import { readTrip, tripOf, TRIPS_FROM, workingDaysAfter, type TripErrors, type TripValues } from './trips'
import { getTrip, listTrips, removeTripStatements, tripOfDocument, tripStatements } from './trips-store'
import { TripFormPage, TripPage, TripsPage } from '../views/trips'
import { CASH_KINDS, CASH_LIMIT, cashLines, isCashKind, lowestFrom, readCash, type CashErrors, type CashValues } from './cash'
import { cashDocuments, cashPayments, cashStatements, pendingCashReceipts, removeCashStatements } from './cash-store'
import { dataRevision } from './handover-store'
import { FLAT_COMPENSATION, lateInterest, ratePercent, REMIND_AFTER, reminderDue } from './dunning'
import { centerCode, centerTotals } from './centers'
import { addCenterStatements, archiveCenterStatement, budgetStatement, centerBudgets, documentCenters, documentCenterStatement, listCenters } from './centers-store'
import { CentersPage } from '../views/centers'
import { CashFormPage, CashPage, type CashRow } from '../views/cash'
import { emptyTakings, readTakings, type TakingsErrors, type TakingsValues } from './takings'
import { listTakings, removeTakingsStatements, takingsStatements, takingsYears } from './takings-store'
import { TakingsPage } from '../views/takings'
import { approvalCents, approvalSeen, approvalStep, mayApprove, needsTwo, type Approver, type DocApproval } from './approvals'
import { ApprovalsPage } from '../views/approvals'
import { bratislavaClock, bratislavaDay } from '../time'
import { isWorkingDay } from './vat'
import { isRepeatEvery, issueRepeats, mayRepeat, nextAfter, repeatOfInvoice, repeatsOf, startRepeatStatements, stopRepeatStatements, type RepeatEvery } from './repeat'
import { rateFor, rateMicro, rateText } from './fx'
import { addDays, endingOf, intakeOpen, serviceOpen } from './ending'
import { exportYear, exportYears } from './export'
import { beginExport, completeExport, confirmExport, exportReceipts } from './handover-store'
import { purgeEnded } from './purge'
import { currentWho, endSession, linkUsable, newLink, newToken, startSession, switchStatement, useLink } from './session'
import {
  afterReading,
  CASH_PAID,
  clearExemptStatement,
  companiesOf,
  countMissing,
  getCompany,
  deleteDocumentStatements,
  DOC_COLUMNS,
  DOC_FROM,
  docOf,
  documentByHash,
  documentsOfPayment,
  eventStatement,
  exemptStatement,
  filesToday,
  firstCompanyOf,
  getDocument,
  getPayment,
  importStatements,
  insertDocumentStatement,
  linkStatement,
  listDocuments,
  listMessages,
  listPayments,
  manualStatement,
  matchCompany,
  MISSING,
  messageStatement,
  monthFigures,
  peopleOf,
  privatelyStatement,
  readingStatement,
  seenStatement,
  suggestions,
  unlinkStatement,
  unseenFromFirmony,
  userByEmail,
  userById,
  type Company,
  type Doc,
  type Who,
} from './store'
import { readInvoice, readStatement, type Reading } from './xml'

export interface AppBindings extends ContractBindings, SecurityBindings {
  DB: D1Database
  EMAIL?: Mailer
  /** The documents' files (R2, EU). Without it nothing can be uploaded. */
  FILES?: R2Bucket
  /** Anthropic's key for reading photos and PDFs. Without it the accountant reads them. */
  ANTHROPIC_API_KEY?: string
  /** "1" only in the playground: the sample company at /app/ukazka. Never set on the live Worker. */
  DEMO?: string
  /** Enable Banking: the application's id (a variable) and its private key (a secret, PEM). Without both the bank is
   * not offered and statements are uploaded by hand. */
  ENABLE_BANKING_APP?: string
  ENABLE_BANKING_KEY?: string
}

/** A signed-in client: a session in a company the user is still a member of. */
export type ClientWho = Who & { company: Company; role: string }

type Env = { Bindings: AppBindings; Variables: { who: ClientWho } }
type Ctx = Context<Env>

export const appRoutes = new Hono<Env>()

const EMAIL = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)*\.[A-Za-z]{2,}$/
const ID = /^[A-Za-z0-9-]{1,64}$/

function render(c: Ctx, node: unknown, status: ContentfulStatusCode = 200) {
  return c.html(html`<!doctype html>${node as never}`, status)
}

/** The address documents are forwarded to: doklady-<code>@ the domain of the public mailbox. */
export function inboxAddress(company: Company): string {
  return `${APP.inboxPrefix}${company.inbox}@${BRAND.email.split('@')[1]}`
}

const today = () => dayOf(now())

/** What the pages for adding a document say ten days past the contract's last day, and null before. */
const closedIntake = (company: Company): string | null => (intakeOpen(company, today()) ? null : t.ending.noIntakeLead(dayName(company.endsOn ?? today())))

// ---------------------------------------------------------------------------------------------------------------
// Signing in
// ---------------------------------------------------------------------------------------------------------------

appRoutes.get('/prihlasenie', async (c) => {
  await ensureSchema(c.env.DB)
  const next = takeoverLoginNext(c.req.query('n'))
  if (await currentWho(c, c.env.DB)) return c.redirect(next ?? '/app', 303)
  return render(c, <Door title={t.login.title}>{<LoginForm next={next ?? undefined} />}</Door>)
})

appRoutes.post('/prihlasenie', async (c) => {
  const body = await c.req.parseBody()
  const next = takeoverLoginNext(body.n)
  const email = typeof body.email === 'string' ? body.email.trim().slice(0, 200) : ''
  if (!EMAIL.test(email)) return render(c, <Door title={t.login.title}>{<LoginForm value={email} error={t.login.badEmail} next={next ?? undefined} />}</Door>, 422)
  const db = c.env.DB
  await ensureSchema(db)
  if (!(await withinLimit(db, 'signin', connection(c), APP.signInsPerHour, 3600))) {
    return render(c, <Door title={t.login.title}>{<LoginForm value={email} error={t.login.throttle} next={next ?? undefined} />}</Door>, 429)
  }
  // The same answer whether the address is ours or not: the form tells nobody who is a client.
  let user = await userByEmail(db, email)
  if (!user && bootstrapReady(c.env, now()) && email.toLowerCase() === c.env.TEAM_BOOTSTRAP_EMAIL?.toLowerCase()) {
    // Initial provisioning requires all explicit bootstrap settings. Mailbox proof alone never opens team data.
    const anyone = await db.prepare('SELECT 1 AS x FROM users WHERE team IS NOT NULL LIMIT 1').first()
    if (!anyone) {
      const id = crypto.randomUUID()
      await db.batch([
        db.prepare("INSERT OR IGNORE INTO users (id, created_at, email, name, team) SELECT ?, ?, ?, ?, 'admin' WHERE NOT EXISTS (SELECT 1 FROM users WHERE team IS NOT NULL)").bind(id, now(), c.env.TEAM_BOOTSTRAP_EMAIL, TEAM.bootstrapName),
        db.prepare("INSERT INTO events (at, user_id, action) SELECT ?, id, 'team.bootstrap' FROM users WHERE id = ? AND team = 'admin'").bind(now(), id),
        bootstrapOfficerStatement(db, id),
      ])
      user = await userByEmail(db, email)
    }
  }
  if (user && (await withinLimit(db, 'link', user.email.toLowerCase(), APP.linksPerHour, 3600))) {
    const { token, statement } = await newLink(db, user.id)
    const link = `${siteOrigin(c)}/app/vstup?t=${token}${next ? `&n=${encodeURIComponent(next)}` : ''}`
    await db.batch([statement, queueStatement(db, { key: `login:${crypto.randomUUID()}`, to: user.email, subject: t.login.mailSubject, body: t.login.mailBody(link) })])
    later(c, flushOutbox(db, c.env.EMAIL))
  }
  return c.redirect('/app/prihlasenie/poslane', 303)
})

appRoutes.get('/prihlasenie/poslane', (c) => render(c, <Door title={t.login.sentTitle}>{<LinkSent />}</Door>))

// The first administrator, while nobody of the team exists: the three settings to put into the Worker, with a code made
// now and kept nowhere. It means nothing until the account's owner puts it there (security/policy.ts, bootstrapReady).
appRoutes.get('/prvy-spravca', async (c) => {
  const db = c.env.DB
  await ensureSchema(db)
  if (await db.prepare('SELECT 1 AS x FROM users WHERE team IS NOT NULL LIMIT 1').first()) return c.notFound()
  const expires = now() + 48 * 3600
  const until = bratislava(expires * 1000)
  c.header('Cache-Control', 'no-store')
  return render(c, <Door title={t.firstAdmin.title}>{<FirstAdmin code={newToken()} expires={expires} until={`${dayName(until.day)} o ${until.hour}:${String(until.minute).padStart(2, '0')}`} />}</Door>)
})

// The link from the email asks for one click: a mail scanner that opens links by itself must not use it up.
appRoutes.get('/vstup', async (c) => {
  await ensureSchema(c.env.DB)
  const token = c.req.query('t') ?? ''
  if (!(await linkUsable(c.env.DB, token))) return render(c, <Door title={t.login.expiredTitle}>{<Expired />}</Door>, 410)
  const next = c.req.query('n')
  return render(c, <Door title={t.login.enterTitle}>{<Enter token={token} next={next ? safeNext(next) : undefined} />}</Door>)
})

appRoutes.post('/vstup', async (c) => {
  const body = await c.req.parseBody()
  const token = typeof body.t === 'string' ? body.t : ''
  const db = c.env.DB
  await ensureSchema(db)
  const user = await useLink(db, token)
  if (!user) return render(c, <Door title={t.login.expiredTitle}>{<Expired />}</Door>, 410)
  const to = await startSession(c, db, user)
  if (!to) return render(c, <Door title={t.login.expiredTitle}>{<Expired noCompany />}</Door>, 403)
  const signedIn = await userById(db, user)
  // A link asked for to confirm a sensitive step (the archive) leads back to it; any other address is the app's own.
  const next = typeof body.n === 'string' && /^\/app(?:\/|$)/.test(safeNext(body.n)) ? safeNext(body.n) : null
  return c.redirect(signedIn?.team ? `/auth?next=${encodeURIComponent(takeoverLoginNext(next) ?? '/ucto')}` : (next ?? to), 303)
})

appRoutes.post('/odhlasit', async (c) => {
  await ensureSchema(c.env.DB)
  await endSession(c, c.env.DB)
  return c.redirect('/app/prihlasenie', 303)
})

// The sample company: only on a developer's own machine, and only when the Worker is told so.
appRoutes.get('/ukazka', async (c) => {
  if (c.env.DEMO !== '1' || !isLocal(new URL(c.req.url).hostname)) return c.notFound()
  const db = c.env.DB
  await ensureSchema(db)
  await seedDemo(db, today(), c.env.FILES)
  // ?ako=eva signs in the owner of the second sample company, which is new: its first steps, its empty declaration.
  if (c.req.query('ako') === 'eva') await startSession(c, db, DEMO.secondUser, DEMO.second)
  else await startSession(c, db, DEMO.user, DEMO.company)
  return c.redirect('/app', 303)
})

// ---------------------------------------------------------------------------------------------------------------
// Everything else needs a session
// ---------------------------------------------------------------------------------------------------------------

appRoutes.use('*', async (c, next) => {
  await ensureSchema(c.env.DB)
  const who = await currentWho(c, c.env.DB)
  const reads = c.req.method === 'GET' || c.req.method === 'HEAD'
  if (!who) {
    const url = new URL(c.req.url), id = url.searchParams.get('ziadost')
    const next = url.pathname === '/app/prechod/otazka' && id && ID.test(id) ? takeoverLoginNext(`/app/prechod/otazka?ziadost=${id}`) : null
    return reads ? c.redirect(`/app/prihlasenie${next ? `?n=${encodeURIComponent(next)}` : ''}`,303) : c.text('Forbidden',403)
  }
  if (!who.company || !who.role) {
    // Somebody of the team works on the other side; one who also has a company of their own is taken into it.
    if (who.user.team) {
      const own = await firstCompanyOf(c.env.DB, who.user.id)
      if (own && reads) {
        await c.env.DB.batch([switchStatement(c.env.DB, who.session, who.user.id, own)])
        const url = new URL(c.req.url)
        return c.redirect(takeoverLoginNext(`${url.pathname}${url.search}`) ?? url.pathname, 303)
      }
      return reads ? c.redirect('/ucto', 303) : c.text('Forbidden', 403)
    }
    await endSession(c, c.env.DB)
    return reads ? c.redirect('/app/prihlasenie', 303) : c.text('Forbidden', 403)
  }
  const path = new URL(c.req.url).pathname
  const security = await securityGate(c, who, sensitivePath(path, c.req.method) && (!/^\/app\/export(?:\/|$)/.test(path) || who.role === 'owner'))
  if (security) return security
  // A second tab can switch the session's company or account while the first still holds unsent files or text.
  if (!reads && wantsReceipt(c) && /^\/app\/(?:doklady|spravy|platby\/[^/]+\/doklad)$/.test(path)
    && c.req.header('x-firmony-context') !== `${who.user.id}:${who.company.id}`) {
    return c.json({ error: 'Prihlásený účet alebo firma sa zmenili. Otvorte Firmony v ďalšom okne, vráťte pôvodnú firmu a skúste odoslanie znova.' }, 409)
  }
  c.set('who', who as ClientWho)
  await next()
})

async function shell(c: Ctx, place: Place | null, title: string, node: unknown, status: ContentfulStatusCode = 200) {
  const who = c.get('who')
  const [missing, unread, companies] = await Promise.all([countMissing(c.env.DB, who.company.id), unseenFromFirmony(c.env.DB, who.company.id), companiesOf(c.env.DB, who.user.id)])
  return render(
    c,
    <Shell who={who} place={place} missing={missing} unread={unread} companies={companies} title={title} ending={endingOf(who.company, today())}>
      {node as never}
    </Shell>,
    status,
  )
}

/** The words of a finished action, chosen by a key in the address: nothing typed by anyone reaches the page this way. */
function flashOf(c: Ctx): string | null {
  const n = Math.min(Math.max(Number.parseInt(c.req.query('n') ?? '1', 10) || 1, 0), 999)
  const k = Math.min(Math.max(Number.parseInt(c.req.query('k') ?? '0', 10) || 0, 0), 9999)
  switch (c.req.query('ok')) {
    case 'pridane':
      return t.documents.added(n)
    case 'prijate':
      return `Prijatie potvrdené. Počet súborov: ${n}.`
    case 'priradene':
      return t.payment.linked
    case 'netreba':
      return t.payment.exempted
    case 'odpojene':
      return t.payment.unlinked
    case 'zmazane':
      return t.document.deleted
    case 'poslane':
      return t.messages.sent
    case 'vypis':
      return t.payments.statementDone(n, k)
    case 'pozvanka':
      return t.company.invited
    case 'odobraty':
      return t.company.removed
    case 'pripomienky':
      return t.company.remindersSaved
    case 'schvalovanie':
      return t.company.approvalsSaved
    case 'schvalene':
      return t.document.approvedFlash
    case 'schvalene-prve':
      return t.document.firstFlash
    case 'schvalene-druhy':
      return t.document.sameApprover
    case 'schvalene-znova':
      return t.document.againFlash
    case 'schvalenie-iban':
      return t.document.ibanMine
    case 'schvalenie-zmena':
      return t.document.changedFlash
    case 'schvalovanie-zle':
      return t.company.approvalsBad
    case 'neschvalene':
      return t.document.unapprovedFlash
    case 'vystavena':
      return t.invoices.issuedFlash
    case 'koncept':
      return t.invoices.saved
    case 'koncept-zahodeny':
      return t.invoices.deleted
    case 'poslana':
      return t.invoices.actions.sentFlash
    case 'pripomenuta':
      return t.invoices.actions.remindedFlash
    case 'zaloha':
      return t.invoices.actions.advanceFlash
    case 'opakovanie':
      return t.invoices.actions.repeatFlash
    case 'opakovanie-zastavene':
      return t.invoices.actions.repeatStoppedFlash
    case 'urok':
      return t.dunning.interestDone
    case 'stredisko':
      return t.centers.docSaved
    case 'upomienky-zapnute':
      return t.dunning.savedOn
    case 'upomienky-vypnute':
      return t.dunning.savedOff
    case 'banka-pripojena':
      return t.bank.flash.pripojena(n)
    case 'banka-bez-uctu':
      return t.bank.flash.pripojena(0)
    case 'banka-nacitane':
      return t.bank.flash.nacitane(n)
    case 'banka-nic':
      return t.bank.flash.nacitane(0)
    case 'banka-odpojena':
      return t.bank.flash.odpojena
    case 'ucet-odobraty':
      return t.bank.flash.odobraty
    case 'ucet-ponechany':
      return t.bank.flash.ponechany
    case 'ucet-pridany':
      return t.bank.statements.flash.confirmed(n)
    case 'vypis-nezauctovany':
      return t.bank.statements.flash.refused
    case 'nastavene':
      return t.bank.statements.flash.setup
    case 'fio':
      return t.bank.statements.flash.fio(n)
    case 'fio-skoro':
      return t.bank.statements.flash.fioSoon
    case 'fio-neodpoveda':
      return t.bank.free.fioDown
    case 'zmluva':
      return t.contract.flash
    case 'vypoved':
      return t.notice.flash
    case 'vypoved-spat':
      return t.notice.withdrawn
    default:
      return null
  }
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name
}

appRoutes.get('/', async (c) => {
  const who = c.get('who')
  const db = c.env.DB
  const company = who.company.id
  const day = today()
  const month = day.slice(0, 7)
  const [missingAll, figures, messages, counts, byMonth, started, unread] = await Promise.all([
    listPayments(db, company, 'missing', 200),
    monthFigures(db, company, `${month}-01`, `${nextMonth(month)}-01`),
    listMessages(db, company, 1),
    db.prepare('SELECT COUNT(*) AS n FROM payments WHERE company_id = ?').bind(company).first<{ n: number }>(),
    db
      .prepare(
        `SELECT substr(p.booked_on, 1, 7) AS month, COUNT(*) AS n FROM payments p WHERE p.company_id = ? AND ${MISSING} GROUP BY 1`,
      )
      .bind(company)
      .all<{ month: string; n: number }>(),
    db
      .prepare(
        `SELECT EXISTS (SELECT 1 FROM documents WHERE company_id = ?1 AND deleted_at IS NULL AND duplicate_of IS NULL AND source <> 'firmony') AS upload,
                EXISTS (SELECT 1 FROM declarations WHERE company_id = ?1) AS declaration,
                EXISTS (SELECT 1 FROM documents WHERE company_id = ?1 AND source = 'email') AS email,
                EXISTS (SELECT 1 FROM company_files WHERE company_id = ?1 AND kind = 'poa' AND deleted_at IS NULL) AS poa,
                (SELECT COUNT(*) FROM members WHERE company_id = ?1) AS people,
                (SELECT r.situation FROM companies co JOIN requests r ON r.id = co.request_id WHERE co.id = ?1) AS situation,
                EXISTS (SELECT 1 FROM events WHERE company_id = ?1 AND action = 'switching.sent')
                  OR EXISTS (SELECT 1 FROM company_files WHERE company_id = ?1 AND kind = 'takeover') AS switched`,
      )
      .bind(company)
      .first<{ upload: number; declaration: number; email: number; poa: number; people: number; situation: string | null; switched: number }>(),
    unseenFromFirmony(db, company),
  ])
  const [suggested, dues, bills, managed] = await Promise.all([
    suggestions(db, company, missingAll),
    companyDeadlines(db, company, day),
    billRows(db, day, company, 24).then((rows) => rows.filter((r) => r.state !== 'paid')),
    managedHandover(db,company),
  ])
  const ready = bankReady(c.env)
  // A consent of Enable Banking or a token of Fio that ends; a statement from an account the company does not have
  // yet; the statement of last month, still to be added.
  const open = serviceOpen(who.company, day)
  const [bankLinks, statements, due, approvals] = await Promise.all([
    open ? linksOf(db, company) : Promise.resolve([]),
    statementsOf(db, company),
    intakeOpen(who.company, day) ? statementDue(db, company, day) : Promise.resolve(null),
    open && who.company.approvals ? approvalQueueOf(db, who) : Promise.resolve(null),
  ])
  const at = now()
  const steps = {
    declaration: started?.declaration === 1,
    poa: started?.poa === 1,
    // A connected account or an accepted zero-movement statement completes setup too. Freshness is separate.
    payments: (counts?.n ?? 0) > 0 || bankLinks.some((l) => l.status === 'active' && (l.validUntil === null || l.validUntil > at))
      || statements.some((s) => s.status === 'taken' || s.status === 'known'),
    upload: started?.upload === 1,
    email: started?.email === 1,
    people: (started?.people ?? 1) > 1,
    switching: started?.situation === 'switch' && (!managed || managed.state === 'cancelled'),
    switched: started?.switched === 1,
  }
  return shell(
    c,
    'home',
    t.nav.home,
    <Overview
      managedTakeover={managed}
      firstName={firstName(who.user.name)}
      missing={missingAll.slice(0, 6)}
      missingCount={byMonth.results.reduce((total, row) => total + row.n, 0)}
      suggested={new Set(suggested.keys())}
      paymentsCount={counts?.n ?? 0}
      figures={figures}
      month={monthName(`${month}-01`)}
      today={day}
      deadlines={clientDeadlines(who.company, dues, day, new Map(byMonth.results.map((r) => [r.month, r.n])), bills)}
      inbox={inboxAddress(who.company)}
      accountant={who.company.accountantName}
      last={messages[0] ?? null}
      now={at}
      flash={flashOf(c)}
      steps={steps.declaration && steps.poa && steps.payments && steps.upload ? null : steps}
      me={who.user.id}
      bankReady={ready}
      bankNotice={noticeOf(bankLinks, at)}
      bankHealth={bankHealthOf(bankLinks, at)}
      unread={unread}
      approval={approvals?.mine[0] ? { dueOn: approvals.mine[0].dueOn } : null}
      waiting={waitingFirst(statements)}
      owner={who.role === 'owner'}
      statementDue={due}
      closed={closedIntake(who.company)}
    />,
  )
})

// ---------------------------------------------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------------------------------------------

/** The client's lists of payments and documents show this many a page. */
const LIST_PAGE = 400

appRoutes.get('/platby', async (c) => {
  const who = c.get('who')
  const db = c.env.DB
  const q = c.req.query('filter')
  const search = (c.req.query('hladat') ?? '').replace(/\s+/g, ' ').trim().slice(0, 80)
  // A search looks through every payment, whatever tab was open.
  const filter = search ? 'all' : q === 'hotove' ? 'done' : q === 'vsetky' ? 'all' : 'missing'
  // 400 a page, the newest first; one more is asked to know whether an older page follows.
  const page = Math.max(1, Math.min(10_000, Math.floor(Number(c.req.query('strana')) || 1)))
  const [found, missingCount] = await Promise.all([listPayments(db, who.company.id, filter, LIST_PAGE + 1, search, (page - 1) * LIST_PAGE), countMissing(db, who.company.id)])
  const payments = found.slice(0, LIST_PAGE)
  const suggested = await suggestions(db, who.company.id, payments)
  const bank = serviceOpen(who.company, today())
    ? { links: await linksOf(db, who.company.id), today: today(), ready: bankReady(c.env), lastStatement: await lastEmailStatement(db, who.company.id) }
    : null
  return shell(
    c,
    'payments',
    t.payments.title,
    <PaymentsPage
      filter={filter}
      payments={payments}
      missingCount={missingCount}
      suggested={new Set(suggested.keys())}
      flash={flashOf(c)}
      search={search}
      bank={bank}
      closed={closedIntake(who.company) !== null}
      pager={{ page, more: found.length > LIST_PAGE, href: `/app/platby?${filter === 'done' ? 'filter=hotove&' : filter === 'all' && !search ? 'filter=vsetky&' : ''}${search ? `hladat=${encodeURIComponent(search)}&` : ''}` }}
    />,
  )
})

async function paymentPage(c: Ctx, id: string, extra: { error?: string; exemptValue?: string; noteValue?: string } = {}, status: ContentfulStatusCode = 200) {
  const who = c.get('who')
  const db = c.env.DB
  const p = ID.test(id) ? await getPayment(db, who.company.id, id) : null
  if (!p) return shell(c, 'payments', t.errors.notFound, <Missing />, 404)
  const [docs, loose, suggested] = await Promise.all([documentsOfPayment(db, who.company.id, p.id), listDocuments(db, who.company.id, 'loose', 60), suggestions(db, who.company.id, [p])])
  const offered = suggested.get(p.id) ?? []
  const offeredIds = new Set(offered.map((d) => d.id))
  return shell(
    c,
    'payments',
    t.payments.title,
    <PaymentPage p={p} docs={docs} suggestions={offered} loose={loose.filter((d) => !offeredIds.has(d.id))} today={today()} flash={flashOf(c)} closed={closedIntake(who.company)} {...extra} />,
    status,
  )
}

appRoutes.get('/platby/:id', (c) => paymentPage(c, c.req.param('id')))

appRoutes.post('/platby/:id/priradit', async (c) => {
  const who = c.get('who')
  const id = c.req.param('id')
  const body = await c.req.parseBody()
  const doc = typeof body.doklad === 'string' && ID.test(body.doklad) ? body.doklad : ''
  const db = c.env.DB
  const [linked] = await db.batch([
    linkStatement(db, who.company.id, id, doc, 'client', who.user.id),
    eventStatement(db, { company: who.company.id, user: who.user.id, action: 'link.client', subject: id, detail: { doc } }),
  ])
  if ((linked?.meta?.changes ?? 0) === 0) return paymentPage(c, id, { error: t.errors.gone }, 409)
  return c.redirect(`/app/platby/${id}?ok=priradene`, 303)
})

appRoutes.post('/platby/:id/bez-dokladu', async (c) => {
  const who = c.get('who')
  const id = c.req.param('id')
  const body = await c.req.parseBody()
  const reason = typeof body.dovod === 'string' && (EXEMPTS as readonly string[]).includes(body.dovod) ? (body.dovod as Exempt) : null
  const note = typeof body.poznamka === 'string' ? body.poznamka.trim().slice(0, 300) : ''
  if (!reason || (reason === 'other' && note.length < 3)) {
    return paymentPage(c, id, { error: reason ? t.payment.noNeedNoteMissing : t.payment.noNeedLead, exemptValue: reason ?? 'other', noteValue: note }, 422)
  }
  const db = c.env.DB
  const [changed] = await db.batch([
    exemptStatement(db, who.company.id, id, reason, note || null, who.user.id),
    eventStatement(db, { company: who.company.id, user: who.user.id, action: 'exempt.client', subject: id, detail: { reason } }),
  ])
  if ((changed?.meta?.changes ?? 0) === 0) return paymentPage(c, id, { error: t.errors.gone }, 409)
  return c.redirect(`/app/platby/${id}?ok=netreba`, 303)
})

appRoutes.post('/platby/:id/zrusit', async (c) => {
  const who = c.get('who')
  const id = c.req.param('id')
  const db = c.env.DB
  await db.batch([clearExemptStatement(db, who.company.id, id), eventStatement(db, { company: who.company.id, user: who.user.id, action: 'exempt.cleared', subject: id })])
  return c.redirect(`/app/platby/${id}`, 303)
})

// ---------------------------------------------------------------------------------------------------------------
// Files: a client's documents, and the bank's statement
// ---------------------------------------------------------------------------------------------------------------

interface Taken {
  files: NewFile[]
  problems: string[]
}

const wantsReceipt = (c: Ctx) => c.req.header('accept') === 'application/json'

/** An explicit receipt, never an HTML page or a followed sign-in redirect, confirms a browser's upload. */
function uploadReceipt(c: Ctx, taken: Taken, kept: Kept | null, next: string, status: ContentfulStatusCode = 200) {
  return c.json({ upload: 1, context: `${c.get('who').user.id}:${c.get('who').company.id}`, accepted: kept ? taken.files.length : 0,
    added: kept?.added ?? 0, known: kept?.known.length ?? 0, statements: kept?.statements.statements ?? 0,
    problems: taken.problems, next }, status)
}

/** The files of a form, each checked by what it is and not by what it is called. */
async function takeFiles(c: Ctx): Promise<Taken> {
  const body = await c.req.parseBody({ all: true })
  const raw = body.file
  const all = (Array.isArray(raw) ? raw : [raw]).filter((f): f is File => typeof f === 'object' && f !== null && 'arrayBuffer' in f && (f as File).size > 0)
  const out: Taken = { files: [], problems: [] }
  if (all.length === 0) out.problems.push(t.documents.none)
  if (all.length > 12) {
    out.problems.push(t.documents.tooMany)
    return out
  }
  for (const file of all) {
    const name = (file.name || 'doklad').slice(0, 120)
    if (file.size > APP.fileBytes) {
      out.problems.push(t.documents.tooLarge(name))
      continue
    }
    const bytes = new Uint8Array(await file.arrayBuffer())
    const kind = sniff(bytes)
    if (!kind) {
      out.problems.push(t.documents.refused(name))
      continue
    }
    out.files.push({ name, kind, bytes })
  }
  return out
}

/** Keeps the files of a form; whatever is to be read is read after the answer. */
async function keepFiles(c: Ctx, files: NewFile[], payment: string | null): Promise<Kept> {
  const who = c.get('who')
  const { kept, work } = await keepFilesFor(c.env, who.company, { user: who.user.id, source: 'upload' }, files, payment)
  if (work) later(c, work)
  return kept
}

appRoutes.get('/doklady', async (c) => {
  const who = c.get('who')
  const search = (c.req.query('hladat') ?? '').replace(/\s+/g, ' ').trim().slice(0, 80)
  const filter = !search && c.req.query('filter') === 'bez-platby' ? 'loose' : 'all'
  const page = Math.max(1, Math.min(10_000, Math.floor(Number(c.req.query('strana')) || 1)))
  const found = await listDocuments(c.env.DB, who.company.id, filter, LIST_PAGE + 1, search, (page - 1) * LIST_PAGE)
  const docs = found.slice(0, LIST_PAGE)
  const pageHref = `/app/doklady?${filter === 'loose' ? 'filter=bez-platby&' : ''}${search ? `hladat=${encodeURIComponent(search)}&` : ''}`
  return shell(
    c,
    'documents',
    t.documents.title,
    <DocumentsPage
      filter={filter}
      docs={docs}
      inbox={inboxAddress(who.company)}
      flash={flashOf(c)}
      problems={[]}
      search={search}
      closed={closedIntake(who.company)}
      pager={{ page, more: found.length > LIST_PAGE, href: pageHref }}
      approvals={who.company.approvals}
    />,
  )
})

async function documentsWithProblems(c: Ctx, problems: string[], status: ContentfulStatusCode, flash: string | null = null) {
  const who = c.get('who')
  const docs = await listDocuments(c.env.DB, who.company.id, 'all')
  return shell(
    c,
    'documents',
    t.documents.title,
    <DocumentsPage filter="all" docs={docs} inbox={inboxAddress(who.company)} flash={flash} problems={problems} closed={closedIntake(who.company)} approvals={who.company.approvals} />,
    status,
  )
}

appRoutes.post('/doklady', async (c) => {
  const who = c.get('who')
  const bad = (problems: string[], status: ContentfulStatusCode) => wantsReceipt(c)
    ? uploadReceipt(c, { files: [], problems }, null, '/app/doklady', status) : documentsWithProblems(c, problems, status)
  // Ten days past the last day: the page's card says that nothing more is taken.
  if (!intakeOpen(who.company, today())) return bad([t.ending.noIntake(dayName(who.company.endsOn ?? today()))], 409)
  if (!c.env.FILES) return bad([t.documents.noStorage], 503)
  if ((await filesToday(c.env.DB, who.company.id)) >= APP.filesPerDay) return bad([t.documents.perDay], 429)
  const taken = await takeFiles(c)
  const kept = taken.files.length > 0 ? await keepFiles(c, taken.files, null) : null
  if (wantsReceipt(c)) return uploadReceipt(c, taken, kept, kept?.statements.statements ? '/app/platby' : '/app/doklady', kept ? 200 : 422)
  if (!kept) return documentsWithProblems(c, taken.problems, 422)
  const problems = [...taken.problems, ...kept.known.map((name) => t.documents.known(name))]
  if (problems.length > 0) return documentsWithProblems(c, problems, kept.added > 0 || kept.known.length > 0 ? 200 : 422, kept.added > 0 ? t.documents.added(kept.added) : null)
  return c.redirect(`/app/doklady?ok=pridane&n=${kept.added}`, 303)
})

appRoutes.post('/platby/:id/doklad', async (c) => {
  const who = c.get('who')
  const id = c.req.param('id')
  const p = ID.test(id) ? await getPayment(c.env.DB, who.company.id, id) : null
  if (!p) return shell(c, 'payments', t.errors.notFound, <Missing />, 404)
  const bad = (error: string, status: ContentfulStatusCode) => wantsReceipt(c)
    ? uploadReceipt(c, { files: [], problems: [error] }, null, `/app/platby/${id}`, status) : paymentPage(c, id, { error }, status)
  if (!intakeOpen(who.company, today())) return bad(t.ending.noIntake(dayName(who.company.endsOn ?? today())), 409)
  if (!c.env.FILES) return bad(t.documents.noStorage, 503)
  if ((await filesToday(c.env.DB, who.company.id)) >= APP.filesPerDay) return bad(t.documents.perDay, 429)
  const taken = await takeFiles(c)
  // A payment that needs no document takes none: what is sent there waits among the documents.
  const exempt = p.state === 'exempt'
  const kept = taken.files.length > 0 ? await keepFiles(c, taken.files, exempt ? null : p.id) : null
  if (wantsReceipt(c)) return uploadReceipt(c, taken, kept, exempt ? '/app/doklady' : `/app/platby/${id}`, kept ? 200 : 422)
  if (!kept) return paymentPage(c, id, { error: taken.problems.join(' ') }, 422)
  const problems = [...taken.problems, ...kept.known.map((name) => t.documents.known(name))]
  if (problems.length > 0) return paymentPage(c, id, { error: problems.join(' ') }, taken.files.length > 0 ? 200 : 422)
  return c.redirect(exempt ? `/app/doklady?ok=pridane&n=${kept.added}` : `/app/platby/${id}?ok=priradene`, 303)
})

appRoutes.post('/banka', async (c) => {
  const who = c.get('who')
  const body = await c.req.parseBody()
  const file = body.file
  const db = c.env.DB
  const bad = async (warn: string = t.payments.statementBad, status: ContentfulStatusCode = 422) => {
    const [payments, missingCount] = await Promise.all([listPayments(db, who.company.id, 'all'), countMissing(db, who.company.id)])
    return shell(
      c,
      'payments',
      t.payments.title,
      <PaymentsPage filter="all" payments={payments} missingCount={missingCount} suggested={new Set()} warn={warn} closed={closedIntake(who.company) !== null} />,
      status,
    )
  }
  if (!intakeOpen(who.company, today())) return bad(t.ending.noIntake(dayName(who.company.endsOn ?? today())), 409)
  if (typeof file !== 'object' || file === null || !('arrayBuffer' in file) || file.size === 0 || file.size > APP.fileBytes) return bad()
  // Kept as a record with its file (statements.ts); whoever adds it on a page is signed in, so it is taken.
  const result = await takeStatementFile(
    c.env,
    who.company,
    { user: who.user.id, source: 'upload' },
    { name: (file.name || 'vypis.xml').slice(0, 120), bytes: new Uint8Array(await file.arrayBuffer()) },
    siteOrigin(c),
  )
  if (!result) return bad()
  // Sent from the steps of a bank whose statements are added once a month: the page opens on that bank next time.
  const bank = BANK_WAYS.find((w) => w.id === body.banka && w.way === 'monthly')
  if (bank && result.statements > 0 && (await bankSetupOf(db, who.company.id))?.bank !== bank.id)
    await db
      .prepare('UPDATE companies SET bank_setup = ? WHERE id = ?')
      .bind(JSON.stringify({ bank: bank.id, at: now() }), who.company.id)
      .run()
  return c.redirect(`/app/platby?filter=vsetky&ok=vypis&n=${result.added}&k=${result.known}`, 303)
})

// ---------------------------------------------------------------------------------------------------------------
// The bank by open banking (bank.ts): linked at the bank itself, read four times a day, renewed with one click
// ---------------------------------------------------------------------------------------------------------------

/** What went wrong on the way to the bank or back, by a key in the address. */
function bankError(c: Ctx): string | null {
  switch (c.req.query('chyba')) {
    case 'zrusene':
      return t.bank.flash.zrusene
    case 'neplatne':
      return t.bank.flash.neplatne
    case 'banka':
      return t.bank.flash.chyba
    case 'vyprsalo':
      return t.bank.flash.vyprsalo
    case 'vela':
      return t.bank.flash.vela
    case 'koniec':
      return t.ending.noBank(dayName(c.get('who').company.endsOn ?? today()))
    default:
      return null
  }
}

/** The way the owner said the bank comes in, and when (the bank's id among BANK_WAYS). */
async function bankSetupOf(db: D1Database, company: string): Promise<BankSetup | null> {
  const row = await db.prepare('SELECT bank_setup FROM companies WHERE id = ?').bind(company).first<{ bank_setup: string | null }>()
  if (!row?.bank_setup) return null
  try {
    const value = JSON.parse(row.bank_setup) as { bank?: unknown; at?: unknown }
    return typeof value.bank === 'string' && typeof value.at === 'number' ? { bank: value.bank, at: value.at } : null
  } catch {
    return null
  }
}

/** The moment the newest statement came by email: the bank sends them itself. */
async function lastEmailStatement(db: D1Database, company: string): Promise<number | null> {
  const row = await db.prepare("SELECT MAX(created_at) AS at FROM statements WHERE company_id = ? AND source = 'email'").bind(company).first<{ at: number | null }>()
  return typeof row?.at === 'number' ? row.at : null
}

async function bankPage(c: Ctx, error: string | null = null, status: ContentfulStatusCode = 200, fioError: string | null = null) {
  const who = c.get('who')
  const db = c.env.DB
  const ready = bankReady(c.env)
  const [links, banks, setup, statements, lastEmail] = await Promise.all([
    linksOf(db, who.company.id),
    ready ? listBanks(c.env).catch(() => null) : Promise.resolve([]),
    bankSetupOf(db, who.company.id),
    statementsOf(db, who.company.id),
    lastEmailStatement(db, who.company.id),
  ])
  const asked = c.req.query('banka') ?? (fioError ? 'fio' : null)
  const chosen = BANK_WAYS.some((w) => w.id === asked) ? asked : (setup?.bank ?? null)
  return shell(
    c,
    'payments',
    t.bank.title,
    <BankPage
      ready={ready}
      links={links}
      banks={banks}
      owner={who.role === 'owner'}
      today={today()}
      flash={flashOf(c)}
      error={error ?? bankError(c)}
      open={serviceOpen(who.company, today())}
      intake={intakeOpen(who.company, today())}
      inbox={inboxAddress(who.company)}
      chosen={chosen}
      setup={setup}
      statements={statements}
      lastEmail={lastEmail}
      fioError={fioError}
    />,
    status,
  )
}

appRoutes.get('/banka', (c) => bankPage(c))

/**
 * To the bank's own sign-in. A link and not a form, because the pages' rules let a form lead only to our own pages,
 * and only from our own pages: another site cannot send a signed-in client off to the bank.
 */
appRoutes.get('/banka/pripojit', async (c) => {
  const who = c.get('who')
  if (!bankReady(c.env)) return c.redirect('/app/banka', 303)
  if (!serviceOpen(who.company, today())) return c.redirect('/app/banka?chyba=koniec', 303)
  const site = c.req.header('sec-fetch-site')
  if (site && site !== 'same-origin' && site !== 'none') return c.redirect('/app/banka', 303)
  if (!(await withinLimit(c.env.DB, 'bank-start', who.company.id, 20, 3600))) return c.redirect('/app/banka?chyba=vela', 303)
  try {
    const url = await startLink(c.env, { company: who.company.id, user: who.user.id, bank: (c.req.query('banka') ?? '').slice(0, 200), redirect: `${siteOrigin(c)}/app/banka/navrat` })
    return url ? c.redirect(url, 302) : c.redirect('/app/banka', 303)
  } catch (err) {
    console.error('linking a bank failed', err instanceof Error ? err.message : 'error')
    return c.redirect('/app/banka?chyba=banka', 303)
  }
})

/** Back from the bank: the consent becomes the company's, and its accounts are read at once. */
appRoutes.get('/banka/navrat', async (c) => {
  const who = c.get('who')
  const db = c.env.DB
  const code = c.req.query('code') ?? ''
  const state = c.req.query('state') ?? ''
  if (c.req.query('error')) {
    // Cancelled at the bank: the pending consent is forgotten.
    if (/^[A-Za-z0-9_-]{43}$/.test(state))
      await db
        .prepare("DELETE FROM bank_links WHERE state = ? AND company_id = ? AND status = 'pending'")
        .bind(await sha256Hex(state), who.company.id)
        .run()
    return c.redirect('/app/banka?chyba=zrusene', 303)
  }
  if (!bankReady(c.env) || code === '' || code.length > 2000 || !/^[A-Za-z0-9_-]{43}$/.test(state)) return c.redirect('/app/banka?chyba=neplatne', 303)
  try {
    const done = await finishLink(c.env, { company: who.company.id, user: who.user.id, code, state })
    if (!done) return c.redirect('/app/banka?chyba=neplatne', 303)
    later(
      c,
      readLink(c.env, done.link).catch(() => null),
    )
    return c.redirect(done.accounts > 0 ? `/app/banka?ok=banka-pripojena&n=${done.accounts}` : '/app/banka?ok=banka-bez-uctu', 303)
  } catch (err) {
    console.error('finishing a bank link failed', err instanceof Error ? err.message : 'error')
    return c.redirect('/app/banka?chyba=banka', 303)
  }
})

/** Read now, while the client is at the screen: the bank does not count that among its four a day. */
appRoutes.post('/banka/:id/nacitat', async (c) => {
  const who = c.get('who')
  const db = c.env.DB
  const id = c.req.param('id')
  const link = ID.test(id)
    ? await db
        .prepare("SELECT id, kind, tried_at FROM bank_links WHERE id = ? AND company_id = ? AND status = 'active'")
        .bind(id, who.company.id)
        .first<{ id: string; kind: string; tried_at: number | null }>()
    : null
  if (!link || (link.kind !== 'fio' && !bankReady(c.env))) return c.redirect('/app/banka', 303)
  // Fio answers one token at most every 30 seconds.
  if (link.kind === 'fio' && link.tried_at !== null && now() - link.tried_at < FIO.minSeconds) return c.redirect('/app/banka?ok=fio-skoro', 303)
  if (!(await withinLimit(db, 'bank-read', who.company.id, BANK.readsPerHour, 3600))) return c.redirect('/app/banka?chyba=vela', 303)
  const result = await readLink(c.env, id, { ip: c.req.header('cf-connecting-ip') ?? '', agent: c.req.header('user-agent') ?? '' })
  if (result.status === 'read') return c.redirect(result.added > 0 ? `/app/banka?ok=banka-nacitane&n=${result.added}` : '/app/banka?ok=banka-nic', 303)
  if (result.status === 'failed' && result.why === '409 soon') return c.redirect('/app/banka?ok=fio-skoro', 303)
  return c.redirect(result.status === 'ended' ? '/app/banka?chyba=vyprsalo' : '/app/banka?chyba=banka', 303)
})

appRoutes.post('/banka/:id/odpojit', async (c) => {
  const who = c.get('who')
  if (who.role !== 'owner') return bankPage(c, t.bank.onlyOwner, 403)
  const id = c.req.param('id')
  if (ID.test(id)) await unlink(c.env, who.company.id, who.user.id, id)
  return c.redirect('/app/banka?ok=banka-odpojena', 303)
})

/** An account that is not the company's, given at the bank by mistake: read no more, its payments from the bank gone. */
appRoutes.post('/banka/ucet/:id/odobrat', async (c) => {
  const who = c.get('who')
  if (who.role !== 'owner') return bankPage(c, t.bank.onlyOwner, 403)
  const id = c.req.param('id')
  const db = c.env.DB
  const iban = ID.test(id) ? await db.prepare('SELECT iban FROM accounts WHERE id = ? AND company_id = ?').bind(id, who.company.id).first<{ iban: string }>() : null
  const done = iban ? await dropAccount(db, who.company.id, who.user.id, id) : false
  if (done === 'kept' && iban) {
    // The books already hold some of its payments: the accountant takes them out, and the client's own words say so.
    const message = crypto.randomUUID()
    const unread = await db.prepare("SELECT 1 AS x FROM messages WHERE company_id = ? AND side = 'client' AND seen_at IS NULL LIMIT 1").bind(who.company.id).first()
    await db.batch([
      messageStatement(db, { id: message, company: who.company.id, author: who.user.id, side: 'client', body: t.bank.droppedMessage(iban.iban), payment: null }),
      ...(unread ? [] : [ringStatement(db, 'message', message, who.company.accountantEmail ?? BRAND.email, bell.teamMessage(`${siteOrigin(c)}/ucto/klienti/${who.company.id}#spravy`))]),
    ])
    later(c, flushOutbox(db, c.env.EMAIL))
  }
  return c.redirect(done === 'kept' ? '/app/banka?ok=ucet-ponechany' : done ? '/app/banka?ok=ucet-odobraty' : '/app/banka', 303)
})

/** The owner says how the bank comes in (a bank that sends its statements by itself): the page then waits for the first. */
appRoutes.post('/banka/nastavene', async (c) => {
  const who = c.get('who')
  const body = await c.req.parseBody()
  const bank = BANK_WAYS.find((w) => w.id === body.banka && (w.way === 'daily' || w.way === 'email'))
  if (!bank) return c.redirect('/app/banka#postup', 303)
  const db = c.env.DB
  await db.batch([
    db.prepare('UPDATE companies SET bank_setup = ? WHERE id = ?').bind(JSON.stringify({ bank: bank.id, at: now() }), who.company.id),
    eventStatement(db, { company: who.company.id, user: who.user.id, action: 'bank.setup', detail: { bank: bank.id } }),
  ])
  return c.redirect(`/app/banka?banka=${bank.id}&ok=nastavene#postup-banka`, 303)
})

/** Fio banka by the owner's token: read at once (fio.ts). */
appRoutes.post('/banka/fio', async (c) => {
  const who = c.get('who')
  if (!serviceOpen(who.company, today())) return c.redirect('/app/banka?chyba=koniec', 303)
  const body = await c.req.parseBody()
  const token = typeof body.token === 'string' ? body.token.replace(/\s+/g, '') : ''
  if (!isFioToken(token)) return bankPage(c, null, 422, t.bank.free.fioBad)
  if (!(await withinLimit(c.env.DB, 'fio-link', who.company.id, 10, 3600))) return c.redirect('/app/banka?chyba=vela', 303)
  const result = await linkFio(c.env, { company: who.company.id, user: who.user.id, token })
  if (result.status === 'refused') return bankPage(c, null, 422, t.bank.free.fioRefused)
  return c.redirect(result.status === 'linked' ? `/app/banka?ok=fio&n=${result.added}` : result.status === 'down' ? '/app/banka?ok=fio-neodpoveda' : '/app/banka?ok=fio-skoro', 303)
})

/** The owner's answer about an account a statement came for (statements.ts). */
appRoutes.post('/vypisy/:id/ucet', async (c) => {
  const who = c.get('who')
  if (who.role !== 'owner') return bankPage(c, t.bank.onlyOwner, 403)
  const id = c.req.param('id')
  const body = await c.req.parseBody()
  const done = ID.test(id) ? await answerAccount(c.env, who.company, who.user.id, id, body.ano === '1', siteOrigin(c)) : null
  if (!done) return c.redirect('/app/banka#vypisy', 303)
  later(c, flushOutbox(c.env.DB, c.env.EMAIL))
  return c.redirect(body.ano === '1' ? `/app/banka?ok=ucet-pridany&n=${done.taken}#vypisy` : '/app/banka?ok=vypis-nezauctovany#vypisy', 303)
})

/** A statement's file as it came: for the company's people, downloaded and never shown. */
appRoutes.get('/vypisy/:id/subor', async (c) => {
  const who = c.get('who')
  const id = c.req.param('id')
  const st = ID.test(id) ? await statementById(c.env.DB, who.company.id, id) : null
  const object = st?.fileKey && c.env.FILES ? await c.env.FILES.get(st.fileKey) : null
  if (!st || !object) return shell(c, 'payments', t.errors.notFound, <Missing />, 404)
  const name = `vypis-${(st.to ?? st.from ?? 'banka').replace(/[^0-9-]/g, '')}-${st.iban.slice(-4)}.xml`
  return new Response(object.body, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Content-Disposition': `attachment; filename="${name}"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' },
  })
})

// ---------------------------------------------------------------------------------------------------------------
// One document
// ---------------------------------------------------------------------------------------------------------------

// ---------------------------------------------------------------------------------------------------------------
// Na úhradu: the suppliers' invoices owed, and the payment order for the bank (payorders.ts)
// ---------------------------------------------------------------------------------------------------------------

async function payOrdersPage(c: Ctx, extra: { error?: string; day?: string; account?: string | null; picked?: Set<string> | null } = {}, status: ContentfulStatusCode = 200) {
  const who = c.get('who')
  const db = c.env.DB
  const [owed, orders, accounts] = await Promise.all([
    payables(db, who.company.id, who.company.approvals),
    paymentOrders(db, who.company.id),
    db.prepare("SELECT id, iban FROM accounts WHERE company_id = ? AND COALESCE(currency, 'EUR') = 'EUR' ORDER BY rowid").bind(who.company.id).all<{ id: string; iban: string }>(),
  ])
  const readyId = c.req.query('prikaz') ?? ''
  const ready = c.req.query('ok') === 'prikaz' ? (orders.find((o) => o.id === readyId) ?? null) : null
  return shell(
    c,
    'documents',
    t.payorders.title,
    <PayOrdersPage
      payables={owed}
      orders={orders}
      accounts={accounts.results}
      today={today()}
      day={extra.day ?? textDay(today())}
      account={extra.account ?? null}
      picked={extra.picked ?? null}
      error={extra.error ?? null}
      ready={ready}
      flash={c.req.query('ok') === 'iban' ? t.payorders.ibanSaved : null}
    />,
    status,
  )
}

appRoutes.get('/uhrady', (c) => payOrdersPage(c))

appRoutes.post('/uhrady', async (c) => {
  const who = c.get('who')
  const db = c.env.DB
  const body = await c.req.parseBody({ all: true })
  const picked = new Set((Array.isArray(body.doklad) ? body.doklad : [body.doklad]).filter((v): v is string => typeof v === 'string' && ID.test(v)))
  const accountId = typeof body.ucet === 'string' ? body.ucet : ''
  const dayText = typeof body.den === 'string' ? body.den : ''
  const again = (error: string) => payOrdersPage(c, { error, day: dayText, account: accountId, picked }, 422)
  const account = ID.test(accountId)
    ? await db.prepare("SELECT iban FROM accounts WHERE id = ? AND company_id = ? AND COALESCE(currency, 'EUR') = 'EUR'").bind(accountId, who.company.id).first<{ iban: string }>()
    : null
  if (!account) return again(t.payorders.errors.account)
  const executeOn = dayOfText(dayText)
  if (!executeOn || executeOn < today()) return again(t.payorders.errors.day)
  // Only what is owed and payable now, whatever was posted.
  const items = (await payables(db, who.company.id, who.company.approvals)).filter((p) => !p.blocked && picked.has(p.id))
  if (items.length === 0) return again(t.payorders.errors.none)
  const id = crypto.randomUUID()
  await db.batch([
    ...orderStatements(db, { id, company: who.company.id, user: who.user.id, accountIban: account.iban, executeOn, items }),
    eventStatement(db, { company: who.company.id, user: who.user.id, action: 'payorder.created', subject: id, detail: { count: items.length, total: items.reduce((sum, p) => sum + p.totalCents, 0) } }),
  ])
  return c.redirect(`/app/uhrady?ok=prikaz&prikaz=${id}`, 303)
})

/** The supplier's IBAN typed for an invoice whose document has none (the reader found none). */
appRoutes.post('/uhrady/iban', async (c) => {
  const who = c.get('who')
  const db = c.env.DB
  const body = await c.req.parseBody()
  const id = typeof body.doklad === 'string' && ID.test(body.doklad) ? body.doklad : ''
  const iban = typeof body.iban === 'string' ? plainIban(body.iban).slice(0, 34) : ''
  if (!isIban(iban)) return payOrdersPage(c, { error: t.payorders.ibanBad }, 422)
  // Only where the document has no IBAN that is one (the page offers no more): an IBAN read from the invoice is never
  // replaced here. Typed by anybody but an owner, it takes an approval given before back, so the owner sees whom it pays.
  const doc = ID.test(id) ? await db.prepare("SELECT party_iban FROM documents WHERE id = ? AND company_id = ? AND kind = 'invoice_in' AND deleted_at IS NULL").bind(id, who.company.id).first<{ party_iban: string | null }>() : null
  const before = doc?.party_iban ?? null
  if (!doc || (before && isIban(plainIban(before)))) return shell(c, 'documents', t.errors.notFound, <Missing />, 404)
  const owner = who.role === 'owner'
  const result = await db.batch([
    db
      .prepare(
        `UPDATE documents SET party_iban = ?1, iban_by = ?6, approved_at = CASE WHEN ?2 THEN approved_at END, approved_by = CASE WHEN ?2 THEN approved_by END,
           first_approved_at = CASE WHEN ?2 THEN first_approved_at END, first_approved_by = CASE WHEN ?2 THEN first_approved_by END
         WHERE id = ?3 AND company_id = ?4 AND kind = 'invoice_in' AND deleted_at IS NULL AND party_iban IS ?5`,
      )
      .bind(iban, owner ? 1 : 0, id, who.company.id, before, who.user.id),
    eventStatement(db, { company: who.company.id, user: who.user.id, action: 'document.iban', subject: id }),
  ])
  if ((result[0]?.meta?.changes ?? 0) === 0) return shell(c, 'documents', t.errors.notFound, <Missing />, 404)
  return c.redirect('/app/uhrady?ok=iban', 303)
})

appRoutes.get('/uhrady/:id/xml', async (c) => {
  const who = c.get('who')
  const id = c.req.param('id')
  const found = ID.test(id) ? await orderItems(c.env.DB, who.company.id, id) : null
  if (!found) return shell(c, 'documents', t.errors.notFound, <Missing />, 404)
  const xml = painXml({ id: found.order.id, company: who.company.name, accountIban: found.order.accountIban, executeOn: found.order.executeOn, createdAt: found.order.createdAt, items: found.items })
  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Content-Disposition': `attachment; filename="prikaz-${found.order.executeOn}.xml"`,
      'Cache-Control': 'private, no-store',
    },
  })
})

// Cost centres (centers.ts): what each centre earned in a period, from the books; the list (owners); a document's centre.
async function centersPage(
  c: Ctx,
  extra: { values?: { code: string; name: string }; errors?: { code?: string; name?: string }; budget?: { year: number; values: Record<string, string>; errors: Record<string, string> } } = {},
  status: 200 | 409 | 422 = 200,
) {
  const who = c.get('who')
  const db = c.env.DB
  const [books, centers, centerOfDoc] = await Promise.all([booksOf(db, who.company), listCenters(db, who.company.id), documentCenters(db, who.company.id)])
  const day = today()
  const years = [...new Set([Number(day.slice(0, 4)), Number(day.slice(0, 4)) + 1, ...books.entries.map((e) => Number(e.on.slice(0, 4)))])].sort((a, b) => b - a)
  const asked = extra.budget?.year ?? Number(c.req.query('rok'))
  const year = years.includes(asked) ? asked : Number(day.slice(0, 4))
  const month = (v: string | undefined, fallback: number) => {
    const n = Number(v)
    return Number.isInteger(n) && n >= 1 && n <= 12 ? n : fallback
  }
  const from = month(c.req.query('od'), 1)
  const to = Math.max(from, month(c.req.query('do'), year === Number(day.slice(0, 4)) ? Number(day.slice(5, 7)) : 12))
  const last = new Date(Date.UTC(year, to, 0)).toISOString().slice(0, 10)
  const totals = centerTotals(books.entries, centerOfDoc, centers, `${year}-${String(from).padStart(2, '0')}-01`, last)
  const budgets = Object.fromEntries(await centerBudgets(db, who.company.id, year))
  const ok = c.req.query('ok')
  const flash = ok === 'pridane' ? t.centers.added : ok === 'ulozene' ? t.centers.changed : ok === 'rozpocet' ? t.centers.budgetSaved : null
  return shell(
    c,
    'documents',
    t.centers.title,
    <CentersPage
      centers={centers}
      totals={totals}
      year={year}
      years={years}
      from={from}
      to={to}
      owner={who.role === 'owner'}
      values={extra.values}
      errors={extra.errors}
      flash={flash}
      budgets={budgets}
      budgetForm={extra.budget ?? null}
    />,
    status,
  )
}

appRoutes.get('/strediska', (c) => centersPage(c))

appRoutes.post('/strediska', async (c) => {
  const who = c.get('who')
  if (who.role !== 'owner') return shell(c, 'documents', t.errors.notFound, <Missing />, 403)
  const body = await c.req.parseBody()
  const typed = { code: typeof body.kod === 'string' ? body.kod.trim().slice(0, 40) : '', name: typeof body.nazov === 'string' ? body.nazov.trim().slice(0, 80) : '' }
  const code = centerCode(typed.code)
  const errors = { ...(code ? {} : { code: t.centers.errors.code }), ...(typed.name ? {} : { name: t.centers.errors.name }) }
  if (!code || !typed.name) return centersPage(c, { values: typed, errors }, 422)
  try {
    await c.env.DB.batch(addCenterStatements(c.env.DB, { id: crypto.randomUUID(), company: who.company.id, code, name: typed.name, user: who.user.id }))
  } catch (err) {
    const taken = await c.env.DB.prepare('SELECT 1 FROM cost_centers WHERE company_id = ? AND code = ?').bind(who.company.id, code).first()
    if (taken) return centersPage(c, { values: typed, errors: { code: t.centers.errors.taken } }, 409)
    throw err
  }
  return c.redirect('/app/strediska?ok=pridane', 303)
})

/** The centres' budgets of a year (owners): each centre's revenues and costs planned; empty is nought (no budget). */
appRoutes.post('/strediska/rozpocet', async (c) => {
  const who = c.get('who')
  if (who.role !== 'owner') return shell(c, 'documents', t.errors.notFound, <Missing />, 403)
  const db = c.env.DB
  const body = await c.req.parseBody()
  const year = Number(body.rok)
  const thisYear = Number(today().slice(0, 4))
  if (!Number.isInteger(year) || year < 2000 || year > thisYear + 1) return shell(c, 'documents', t.errors.notFound, <Missing />, 404)
  const centers = (await listCenters(db, who.company.id)).filter((x) => !x.archived)
  const values: Record<string, string> = {}
  const errors: Record<string, string> = {}
  const amount = (name: string) => {
    const text = typeof body[name] === 'string' ? (body[name] as string).trim().slice(0, 20) : ''
    values[name] = text
    if (text === '') return 0
    const cents = centsOf(text)
    if (cents === null || Number.isNaN(cents) || cents < 0 || cents > 100_000_000_000) {
      errors[name] = t.centers.errors.budget
      return 0
    }
    return cents
  }
  // Only the centres the form showed: one restored meanwhile keeps the budget it had.
  const budgets = centers.filter((x) => `prijmy_${x.id}` in body || `naklady_${x.id}` in body).map((x) => ({ id: x.id, revenue: amount(`prijmy_${x.id}`), costs: amount(`naklady_${x.id}`) }))
  if (Object.keys(errors).length > 0) return centersPage(c, { budget: { year, values, errors } }, 422)
  await db.batch([
    ...budgets.map((b) => budgetStatement(db, who.company.id, b.id, year, { revenue: b.revenue, costs: b.costs }, who.user.id)),
    eventStatement(db, { company: who.company.id, user: who.user.id, action: 'center.budget', subject: String(year) }),
  ])
  return c.redirect(`/app/strediska?rok=${year}&ok=rozpocet#rozpocet`, 303)
})

for (const [path, archived] of [
  ['/strediska/:id/archivovat', true],
  ['/strediska/:id/obnovit', false],
] as const) {
  appRoutes.post(path, async (c) => {
    const who = c.get('who')
    if (who.role !== 'owner') return shell(c, 'documents', t.errors.notFound, <Missing />, 403)
    const id = c.req.param('id')
    const result = ID.test(id) ? await archiveCenterStatement(c.env.DB, who.company.id, id, archived).run() : null
    if ((result?.meta?.changes ?? 0) === 0) return shell(c, 'documents', t.errors.notFound, <Missing />, 404)
    return c.redirect('/app/strediska?ok=ulozene', 303)
  })
}

appRoutes.post('/doklady/:id/stredisko', async (c) => {
  const who = c.get('who')
  const id = c.req.param('id')
  const body = await c.req.parseBody()
  const center = typeof body.stredisko === 'string' && ID.test(body.stredisko) ? body.stredisko : null
  const d = ID.test(id) ? await getDocument(c.env.DB, who.company.id, id) : null
  if (!d) return shell(c, 'documents', t.errors.notFound, <Missing />, 404)
  // The centre it has (an archived one too): nothing to change.
  if ((d.centerId ?? null) === center) return c.redirect(`/app/doklady/${id}?ok=stredisko`, 303)
  const result = await documentCenterStatement(c.env.DB, who.company.id, id, center).run()
  if ((result?.meta?.changes ?? 0) === 0) return shell(c, 'documents', t.errors.notFound, <Missing />, 404)
  return c.redirect(`/app/doklady/${id}?ok=stredisko`, 303)
})

// The cash box (cash.ts): the cash book is account 211 of the books day by day; a cash document is written by any
// member, numbered and booked at once, refused when it would pay out cash that is not there or more than the law allows.

/** Each entry of the books that moves the cash box, with how much (plus in, minus out). */
const cashMoves = (books: Books) =>
  books.entries.flatMap((e) => {
    const cents = e.lines.reduce((sum, l) => sum + (canonicalAccount(l.md)?.startsWith('211') ? l.cents : 0) - (canonicalAccount(l.d)?.startsWith('211') ? l.cents : 0), 0)
    return cents === 0 ? [] : [{ e, on: e.on, cents }]
  })

async function cashPage(c: Ctx, extra: { error?: string | null } = {}, status: 200 | 409 | 422 = 200) {
  const who = c.get('who')
  const db = c.env.DB
  const [books, pending] = await Promise.all([booksOf(db, who.company), pendingCashReceipts(db, who.company.id)])
  const day = today()
  const moves = cashMoves(books)
  const years = [...new Set([Number(day.slice(0, 4)), ...moves.map((m) => Number(m.on.slice(0, 4)))])].sort((a, b) => b - a)
  const asked = Number(c.req.query('rok'))
  const year = years.includes(asked) ? asked : Number(day.slice(0, 4))
  const opening = balanceOf(books.entries, '211', `${year - 1}-12-31`)
  let running = opening
  const rows: CashRow[] = moves
    .filter((m) => m.on.startsWith(`${year}-`))
    .map((m) => {
      running += m.cents
      return { key: m.e.key, on: m.on, number: m.e.number, text: m.e.text, cents: m.cents, balance: running, removable: m.e.kind === 'cash' ? m.e.manualId : null }
    })
  const saved = c.req.query('ok') === 'doklad' ? rows.find((r) => r.removable === c.req.query('id')) : undefined
  const flash = saved ? t.cash.saved(saved.number) : c.req.query('ok') === 'zruseny' ? t.cash.removed : null
  return shell(
    c,
    'payments',
    t.cash.title,
    <CashPage year={year} years={years} opening={opening} rows={rows} balance={balanceOf(books.entries, '211', day)} pending={pending} flash={flash} error={extra.error ?? null} closed={!intakeOpen(who.company, day)} />,
    status,
  )
}

appRoutes.get('/pokladna', (c) => cashPage(c))

const sideOf = (v: unknown): 'in' | 'out' => (v === 'prijem' ? 'in' : 'out')

async function cashForm(c: Ctx, side: 'in' | 'out', values: CashValues, errors: CashErrors, status: 200 | 409 | 422 = 200, error: string | null = null) {
  const who = c.get('who')
  const db = c.env.DB
  // Cash taken out of the bank came by a payment out; cash put into it, by a payment in.
  const [documents, payments] = await Promise.all([cashDocuments(db, who.company.id, side), cashPayments(db, who.company.id, side === 'in' ? 'out' : 'in', today())])
  return shell(c, 'payments', side === 'in' ? t.cash.newIn : t.cash.newOut, <CashFormPage side={side} values={values} errors={errors} documents={documents} payments={payments} error={error ?? closedIntake(who.company)} />, status)
}

appRoutes.get('/pokladna/nova', (c) => {
  const side = sideOf(c.req.query('strana'))
  const asked = c.req.query('druh')
  const kind = isCashKind(asked) && CASH_KINDS[asked].side === side ? asked : side === 'in' ? 'withdrawal' : 'deposit'
  return cashForm(c, side, { kind, day: textDay(today()), amount: '', party: '', note: '', document: c.req.query('doklad') ?? '', payment: '' }, {})
})

appRoutes.post('/pokladna', async (c) => {
  const who = c.get('who')
  const db = c.env.DB
  const body = await c.req.parseBody()
  const side = sideOf(body.strana)
  // Cash taken from the bank (or put in it) with its bank payment picked and no amount typed is the payment's amount.
  const bankPayments = typeof body.platba === 'string' && body.platba ? await cashPayments(db, who.company.id, side === 'in' ? 'out' : 'in', today()) : []
  const picked = bankPayments.find((p) => p.id === body.platba)
  const typed = typeof body.suma === 'string' ? body.suma.trim() : ''
  const field = (name: string) => (name === 'suma' && typed === '' && picked ? (Math.abs(picked.cents) / 100).toFixed(2).replace('.', ',') : body[name])
  const read = readCash(field, t.cash.errors, today(), (text) => dayOfText(text) || null, centsOf)
  const errors: CashErrors = { ...read.errors }
  if (CASH_KINDS[read.values.kind].side !== side) errors.kind = t.cash.errors.kind
  if (!intakeOpen(who.company, today())) return cashForm(c, side, read.values, {}, 409)
  const info = CASH_KINDS[read.values.kind]
  let cents = read.input?.cents ?? null
  let party: string | null = read.values.party || null
  let text = ''
  let account: string | null = null
  let documentId: string | null = null
  let paymentId: string | null = null
  if (info.contra === 'doc') {
    const doc = (await cashDocuments(db, who.company.id, side)).find((d) => d.id === read.values.document)
    if (!doc) errors.document = t.cash.errors.document
    else {
      // What was paid; nothing typed is what the invoice still asks for (less its credit notes). Never more than that.
      if (cents === null) cents = doc.cents
      else if (cents > doc.cents) errors.amount = t.cash.errors.moreThanAsked(formatEurExact(doc.cents))
      party = doc.party
      documentId = doc.id
      account = side === 'in' ? '311' : payableOf({ kind: 'invoice_in', category: isCategory(doc.category) ? doc.category : null })
      text = t.cash.docText(doc.number, doc.party)
      if (cents > CASH_LIMIT) errors.limit = t.cash.errors.limit
    }
  } else {
    text = t.cash.entryText(t.cash.kinds[read.values.kind] ?? '', party) + (read.values.note ? ` (${read.values.note})` : '')
  }
  if (info.own && read.values.payment) {
    const payment = picked
    if (!payment) errors.amount = t.cash.errors.payment
    else if (cents !== null && cents !== Math.abs(payment.cents)) errors.amount = t.cash.errors.paymentAmount
    else paymentId = payment.id
  }
  if (Object.values(errors).some(Boolean) || !read.input || cents === null) return cashForm(c, side, read.values, errors, 422)
  const on = read.input.on
  // The balance is checked at a revision of the company's data and the document written only at the same one, so two
  // documents at once cannot both pay out the same cash.
  const revision = await dataRevision(db, who.company.id)
  const books = await booksOf(db, who.company)
  // Before our books start the cash was the former accountant's: it stands in the opening balances.
  if (books.start && on < books.start) return cashForm(c, side, read.values, { day: t.cash.errors.beforeBooks(dayName(books.start)) }, 422)
  // Cash that is not there is not paid out: the cash box stays at nought or above from that day on.
  if (side === 'out') {
    const lowest = lowestFrom([...cashMoves(books).map((m) => ({ on: m.on, cents: m.cents })), { on, cents: -cents }], on)
    if (lowest !== null && lowest < 0) return cashForm(c, side, read.values, {}, 422, t.cash.errors.short(formatEurExact(-lowest)))
  }
  const id = crypto.randomUUID()
  try {
    const results = await db.batch(
      cashStatements(db, { id, company: who.company.id, user: who.user.id, kind: read.values.kind, on, text, party, lines: cashLines(read.values.kind, cents, account), documentId, paymentId, revision }),
    )
    if ((results[0]?.meta?.changes ?? 0) === 0) return cashForm(c, side, read.values, documentId ? { document: t.cash.errors.document } : {}, 409, documentId ? null : t.cash.errors.changed)
  } catch (err) {
    const message = err instanceof Error ? err.message : ''
    console.error('a cash document failed', err instanceof Error ? err.name : 'error')
    return cashForm(c, side, read.values, /UNIQUE/i.test(message) ? { document: t.cash.errors.document } : {}, 409, /UNIQUE/i.test(message) ? null : t.cash.errors.locked)
  }
  return c.redirect(`/app/pokladna?rok=${on.slice(0, 4)}&ok=doklad&id=${id}`, 303)
})

appRoutes.post('/pokladna/:id/zrusit', async (c) => {
  const who = c.get('who')
  const db = c.env.DB
  const id = c.req.param('id')
  const revision = await dataRevision(db, who.company.id)
  const books = ID.test(id) ? await booksOf(db, who.company) : null
  const moves = books ? cashMoves(books) : []
  const move = moves.find((m) => m.e.kind === 'cash' && m.e.manualId === id)
  if (!move) return shell(c, 'payments', t.errors.notFound, <Missing />, 404)
  if (!intakeOpen(who.company, today())) return cashPage(c, {}, 409)
  // Money in that paid what followed is not taken back: the cash box would go below nought.
  const lowest = lowestFrom(
    moves.filter((m) => m !== move).map((m) => ({ on: m.on, cents: m.cents })),
    move.on,
  )
  if (move.cents > 0 && lowest !== null && lowest < 0) return cashPage(c, { error: t.cash.errors.short(formatEurExact(-lowest)) }, 409)
  try {
    const results = await db.batch(removeCashStatements(db, who.company.id, id, who.user.id, revision))
    if ((results[0]?.meta?.changes ?? 0) === 0) return cashPage(c, { error: t.cash.errors.changed }, 409)
  } catch (err) {
    console.error('a cash document was not removed', err instanceof Error ? err.name : 'error')
    return cashPage(c, { error: t.cash.errors.locked }, 409)
  }
  return c.redirect(`/app/pokladna?rok=${move.on.slice(0, 4)}&ok=zruseny`, 303)
})

// The day's takings of an eKasa till (takings.ts): written by any member, a document booked at once; taken back unless
// its cash paid what followed out of the cash box.
async function takingsPage(c: Ctx, extra: { values?: TakingsValues; errors?: TakingsErrors; error?: string | null } = {}, status: 200 | 409 | 422 = 200) {
  const who = c.get('who')
  const db = c.env.DB
  const day = today()
  const years = [...new Set([Number(day.slice(0, 4)), ...(await takingsYears(db, who.company.id))])].sort((a, b) => b - a)
  const asked = Number(c.req.query('rok'))
  const year = years.includes(asked) ? asked : Number(day.slice(0, 4))
  const [rows, centers] = await Promise.all([listTakings(db, who.company.id, year), listCenters(db, who.company.id)])
  const savedOn = c.req.query('ok') === 'zapisana' ? (c.req.query('den') ?? '') : ''
  const flash = /^\d{4}-\d{2}-\d{2}$/.test(savedOn)
    ? `${t.takings.saved(dayName(savedOn))}${c.req.query('bezdph') === '1' ? ` ${t.takings.beforeVat}` : ''}`
    : c.req.query('ok') === 'zrusena'
      ? t.takings.removed
      : null
  return shell(
    c,
    'payments',
    t.takings.title,
    <TakingsPage
      year={year}
      years={years}
      rows={rows}
      payer={who.company.vatPayer}
      values={extra.values ?? emptyTakings(textDay(day))}
      errors={extra.errors}
      centers={centers}
      flash={flash}
      error={extra.error ?? closedIntake(who.company)}
      closed={!intakeOpen(who.company, day)}
    />,
    status,
  )
}

appRoutes.get('/trzby', (c) => takingsPage(c))

appRoutes.post('/trzby', async (c) => {
  const who = c.get('who')
  const db = c.env.DB
  const body = await c.req.parseBody()
  if (!intakeOpen(who.company, today())) return takingsPage(c, {}, 409)
  const read = readTakings((name) => body[name], who.company.vatPayer, today(), (text) => dayOfText(text) || null, centsOf, t.takings.errors)
  const errors: TakingsErrors = { ...read.errors }
  const centers = read.values.center ? await listCenters(db, who.company.id) : []
  if (read.values.center && !centers.some((x) => x.id === read.values.center && !x.archived)) errors.center = t.takings.errors.center
  if (Object.values(errors).some(Boolean) || !read.input) return takingsPage(c, { values: read.values, errors }, 422)
  let takings = read.input
  // Before our books start the takings were the former accountant's.
  const books = await booksOf(db, who.company)
  if (books.start && takings.on < books.start) return takingsPage(c, { values: read.values, errors: { day: t.takings.errors.beforeBooks(dayName(books.start)) } }, 422)
  // A day before the registration for VAT took effect carries no VAT: its takings are the revenue whole.
  const payer = who.company.vatPayer && (!who.company.vatSince || takings.on >= who.company.vatSince)
  if (who.company.vatPayer && !payer) takings = { ...takings, lines: [{ rate: 0, base: takings.total, vat: 0, deduct: 0 }], vat: 0 }
  // The same closing twice (a second click, or written again): the same day and number, or without one the same total.
  const twice = await db
    .prepare(
      `SELECT 1 FROM documents WHERE company_id = ?1 AND source = 'takings' AND deleted_at IS NULL AND issued_on = ?2
         AND (CASE WHEN ?3 IS NOT NULL THEN number = ?3 ELSE number IS NULL AND total_cents = ?4 END)`,
    )
    .bind(who.company.id, takings.on, takings.number, takings.total)
    .first()
  if (twice) return takingsPage(c, { values: read.values, error: t.takings.errors.twice }, 409)
  const id = crypto.randomUUID()
  try {
    const results = await db.batch(takingsStatements(db, { id, company: who.company.id, user: who.user.id, takings, payer }))
    if ((results[0]?.meta?.changes ?? 0) === 0) return takingsPage(c, { values: read.values, errors: { center: t.takings.errors.center } }, 409)
  } catch (err) {
    const message = err instanceof Error ? err.message : ''
    console.error('takings failed', err instanceof Error ? err.name : 'error')
    return takingsPage(c, { values: read.values, error: /FIRMONY_PERIOD_LOCKED/.test(message) ? t.takings.errors.locked : /UNIQUE/i.test(message) ? t.takings.errors.twice : t.takings.errors.changed }, 409)
  }
  return c.redirect(`/app/trzby?rok=${takings.on.slice(0, 4)}&ok=zapisana&den=${takings.on}${who.company.vatPayer && !payer ? '&bezdph=1' : ''}`, 303)
})

appRoutes.post('/trzby/:id/zrusit', async (c) => {
  const who = c.get('who')
  const db = c.env.DB
  const id = c.req.param('id')
  const d = ID.test(id) ? await getDocument(db, who.company.id, id) : null
  if (!d || d.source !== 'takings') return shell(c, 'payments', t.errors.notFound, <Missing />, 404)
  if (!intakeOpen(who.company, today())) return takingsPage(c, {}, 409)
  const revision = await dataRevision(db, who.company.id)
  const books = await booksOf(db, who.company)
  const moves = cashMoves(books)
  const own = moves.find((m) => m.e.key === `d:${id}`)
  // Cash of the day that paid what followed out of the cash box is not taken back: the box would go below nought.
  if (own && own.cents > 0) {
    const lowest = lowestFrom(
      moves.filter((m) => m !== own).map((m) => ({ on: m.on, cents: m.cents })),
      own.on,
    )
    if (lowest !== null && lowest < 0) return takingsPage(c, { error: t.takings.errors.short(formatEurExact(-lowest)) }, 409)
  }
  try {
    const results = await db.batch(removeTakingsStatements(db, who.company.id, id, who.user.id, revision))
    if ((results[0]?.meta?.changes ?? 0) === 0) return takingsPage(c, { error: t.takings.errors.changed }, 409)
  } catch (err) {
    console.error('takings were not removed', err instanceof Error ? err.name : 'error')
    return takingsPage(c, { error: t.takings.errors.locked }, 409)
  }
  return c.redirect(`/app/trzby?rok=${(d.issuedOn ?? today()).slice(0, 4)}&ok=zrusena`, 303)
})

// Business trips (trips.ts): the list, the form worked out on the server (a recount shows the days for the meals), the
// settlement kept as the company's document owed to the traveller, and taken back while nothing was done with it.
appRoutes.get('/cesty', async (c) => {
  const who = c.get('who')
  const flash = c.req.query('ok') === 'zrusena' ? t.trips.removed : null
  return shell(c, 'documents', t.trips.title, <TripsPage trips={await listTrips(c.env.DB, who.company.id)} flash={flash} />)
})

async function tripEmployees(db: D1Database, company: string): Promise<{ id: string; name: string; iban: string | null }[]> {
  const rows = await db
    .prepare("SELECT id, name, iban FROM employees WHERE company_id = ? AND (ended_on IS NULL OR ended_on >= date('now', '-1 year')) ORDER BY name LIMIT 500")
    .bind(company)
    .all<{ id: string; name: string; iban: string | null }>()
  return rows.results
}

const emptyTrip = (): TripValues => ({
  traveller: '',
  employee: '',
  iban: '',
  purpose: '',
  from: '',
  to: '',
  start: '',
  end: '',
  transport: 'car',
  plate: '',
  km: '',
  consumption: '',
  price: '',
  free: false,
  meals: {},
  shown: '',
})

async function tripForm(c: Ctx, values: TripValues, errors: TripErrors, status: 200 | 409 | 422 = 200, error: string | null = null) {
  const employees = await tripEmployees(c.env.DB, c.get('who').company.id)
  return shell(c, 'documents', t.trips.newTitle, <TripFormPage values={values} errors={errors} employees={employees} error={error ?? closedIntake(c.get('who').company)} />, status)
}

appRoutes.get('/cesty/nova', (c) => tripForm(c, emptyTrip(), {}))

appRoutes.post('/cesty', async (c) => {
  const who = c.get('who')
  const db = c.env.DB
  const body = await c.req.parseBody()
  const at = Math.floor(Date.now() / 1000)
  const nowLocal = `${bratislavaDay(at)}T${bratislavaClock(at).padStart(5, '0')}`
  const read = readTrip((name) => body[name], t.trips.errors, nowLocal, isIban)
  if (body.akcia !== 'ulozit') return tripForm(c, read.values, {})
  if (!intakeOpen(who.company, today())) return tripForm(c, read.values, {}, 409)
  if (!read.input) return tripForm(c, read.values, read.errors, 422)
  const result = tripOf(read.input)
  if (!result) return tripForm(c, read.values, { start: t.trips.errors.before(TRIPS_FROM) }, 422)
  // A payroll employee travels under the name and with the IBAN payroll keeps, unless another IBAN is typed.
  const employee = read.values.employee ? (await tripEmployees(db, who.company.id)).find((e) => e.id === read.values.employee) : undefined
  if (read.values.employee && !employee) return tripForm(c, read.values, { traveller: t.trips.errors.traveller }, 422)
  const typedIban = read.values.iban ? plainIban(read.values.iban) : null
  const iban = typedIban ?? (employee?.iban ? plainIban(employee.iban) : null)
  const id = crypto.randomUUID()
  const documentId = crypto.randomUUID()
  const settledOn = today()
  try {
    await db.batch(
      tripStatements(db, {
        id,
        documentId,
        company: who.company.id,
        user: who.user.id,
        traveller: employee?.name ?? read.values.traveller,
        employeeId: employee?.id ?? null,
        iban: iban && isIban(iban) ? iban : null,
        purpose: read.values.purpose,
        from: read.values.from,
        to: read.values.to,
        start: read.input.start,
        end: read.input.end,
        transport: read.values.transport,
        plate: read.values.plate || null,
        car: read.input.car,
        meals: read.input.meals,
        result,
        settledOn,
        due: workingDaysAfter(settledOn, 10, isWorkingDay),
      }),
    )
  } catch (err) {
    console.error('a trip failed', err instanceof Error ? err.name : 'error')
    return tripForm(c, read.values, {}, 409, t.trips.errors.locked)
  }
  // A payment to the traveller that came already pairs with it (no supplier's rule touches a trip's settlement).
  if (result.total > 0) later(c, matchCompany(db, who.company.id))
  return c.redirect(`/app/cesty/${id}?ok=cesta`, 303)
})

appRoutes.get('/cesty/:id', async (c) => {
  const who = c.get('who')
  const id = c.req.param('id')
  const trip = ID.test(id) ? await getTrip(c.env.DB, who.company.id, id) : null
  if (!trip) return shell(c, 'documents', t.errors.notFound, <Missing />, 404)
  const flash = c.req.query('ok') === 'cesta' ? t.trips.saved : null
  return shell(c, 'documents', `${t.trips.sheetTitle} ${trip.number}`, <TripPage trip={trip} company={who.company} flash={flash} />)
})

appRoutes.post('/cesty/:id/zrusit', async (c) => {
  const who = c.get('who')
  const db = c.env.DB
  const id = c.req.param('id')
  const trip = ID.test(id) ? await getTrip(db, who.company.id, id) : null
  if (!trip) return shell(c, 'documents', t.errors.notFound, <Missing />, 404)
  const result = await db.batch(removeTripStatements(db, who.company.id, trip.id, who.user.id))
  if ((result[0]?.meta?.changes ?? 0) === 0) return c.redirect(`/app/cesty/${trip.id}`, 303)
  return c.redirect('/app/cesty?ok=zrusena', 303)
})

appRoutes.get('/doklady/:id', async (c) => {
  const who = c.get('who')
  const id = c.req.param('id')
  const d = ID.test(id) ? await getDocument(c.env.DB, who.company.id, id) : null
  if (!d) return shell(c, 'documents', t.errors.notFound, <Missing />, 404)
  const payment = d.paymentId ? await getPayment(c.env.DB, who.company.id, d.paymentId) : null
  const trip = d.source === 'trip' ? await tripOfDocument(c.env.DB, who.company.id, d.id) : null
  const centers = await listCenters(c.env.DB, who.company.id)
  return shell(
    c,
    'documents',
    d.party ?? t.documents.title,
    <DocumentPage
      d={d}
      payment={payment}
      today={today()}
      flash={flashOf(c)}
      approvals={who.company.approvals}
      owner={who.role === 'owner'}
      approval={await approvalOf(c.env.DB, who, d)}
      tripId={trip?.id ?? null}
      centers={centers}
    />,
  )
})

/** Where to go back to: only a page of the app, never an address from outside. */
function backTo(value: unknown, fallback: string): string {
  return typeof value === 'string' && /^\/app\/[a-z]+\/[A-Za-z0-9-]{1,64}$/.test(value) ? value : fallback
}

/** A member of a company for approving (approvals.ts): an owner, or a colleague made an approver with his limit; null for nobody of it. */
async function memberApprover(db: D1Database, company: string, user: string): Promise<Approver | null> {
  const row = await db.prepare('SELECT role, approver, approve_limit FROM members WHERE company_id = ? AND user_id = ?').bind(company, user).first<{ role: string; approver: number; approve_limit: number | null }>()
  if (!row) return null
  if (row.role === 'owner') return { owner: true, approver: true, limit: null }
  return { owner: false, approver: row.approver === 1, limit: typeof row.approve_limit === 'number' ? row.approve_limit : null }
}

/** Who the signed-in person is for approving. */
async function approverOf(db: D1Database, who: { role: string; user: { id: string }; company: { id: string } }): Promise<Approver | null> {
  if (who.role === 'owner') return { owner: true, approver: true, limit: null }
  return memberApprover(db, who.company.id, who.user.id)
}

/** Whether a first approval still counts: its approver may still approve the amount. */
async function firstStillMay(db: D1Database, company: string, d: Doc, cents: number): Promise<boolean> {
  return !d.firstApprovedBy || mayApprove(await memberApprover(db, company, d.firstApprovedBy), cents)
}

/**
 * What the document's page says of approving it: whether the person may approve its amount, from what amount it needs
 * two, what his approval would do (approvals.ts) and what the page shows of the invoice, which the approval is of.
 */
async function approvalOf(db: D1Database, who: { role: string; user: { id: string }; company: Company }, d: Doc): Promise<DocApproval | null> {
  if (!who.company.approvals || d.kind !== 'invoice_in') return null
  const cents = approvalCents(d)
  const firstMay = await firstStillMay(db, who.company.id, d, cents)
  const two = needsTwo(who.company.approvalTwoFrom, cents)
  return {
    may: mayApprove(await approverOf(db, who), cents),
    twoFrom: two ? who.company.approvalTwoFrom : null,
    userId: who.user.id,
    step: approvalStep({ approvedAt: d.approvedAt, firstApprovedBy: d.firstApprovedBy ?? null, ibanBy: d.ibanBy ?? null }, who.company.approvalTwoFrom, cents, who.user.id, { owner: who.role === 'owner', firstMay }),
    firstVoid: two && !firstMay,
    seen: approvalSeen(d),
  }
}

/**
 * A supplier's invoice approved for payment by who may approve its amount: whole, or the first of two from the amount
 * the owners set (then the second by somebody else); or the approval taken back.
 */
for (const [path, approve] of [
  ['/doklady/:id/schvalit', true],
  ['/doklady/:id/neschvalit', false],
] as const) {
  appRoutes.post(path, async (c) => {
    const who = c.get('who')
    const db = c.env.DB
    const id = c.req.param('id')
    const d = ID.test(id) ? await getDocument(db, who.company.id, id) : null
    if (!d || d.kind !== 'invoice_in' || !who.company.approvals) return shell(c, 'documents', t.errors.notFound, <Missing />, 404)
    const cents = approvalCents(d)
    if (!mayApprove(await approverOf(db, who), cents)) return shell(c, 'documents', t.errors.notFound, <Missing />, 403)
    if (!approve) {
      await db.batch([
        db.prepare('UPDATE documents SET approved_at = NULL, approved_by = NULL, first_approved_at = NULL, first_approved_by = NULL WHERE id = ? AND company_id = ?').bind(id, who.company.id),
        eventStatement(db, { company: who.company.id, user: who.user.id, action: 'document.unapproved', subject: id }),
      ])
      return c.redirect(`/app/doklady/${id}?ok=neschvalene`, 303)
    }
    const two = needsTwo(who.company.approvalTwoFrom, cents)
    const firstMay = await firstStillMay(db, who.company.id, d, cents)
    const step = approvalStep({ approvedAt: d.approvedAt, firstApprovedBy: d.firstApprovedBy ?? null, ibanBy: d.ibanBy ?? null }, who.company.approvalTwoFrom, cents, who.user.id, { owner: who.role === 'owner', firstMay })
    if (step === 'done') return c.redirect(`/app/doklady/${id}`, 303)
    if (step === 'same') return c.redirect(`/app/doklady/${id}?ok=schvalene-druhy`, 303)
    if (step === 'iban') return c.redirect(`/app/doklady/${id}?ok=schvalenie-iban#schvalenie`, 303)
    // The approval is of the invoice as the page showed it: changed since (its total, currency or IBAN), it is looked at again.
    const body = await c.req.parseBody()
    if (body.stav !== approvalSeen(d)) return c.redirect(`/app/doklady/${id}?ok=schvalenie-zmena#schvalenie`, 303)
    // Each written only from the state it was read in (the approvals, the total, currency and IBAN shown, and who typed
    // the IBAN): two people at once make one approval of each step, and nobody approves what he did not see.
    const seen = 'total_cents IS ? AND currency IS ? AND party_iban IS ? AND iban_by IS ?'
    const seenValues = [d.totalCents, d.currency, d.partyIban, d.ibanBy ?? null]
    const results = await db.batch([
      step === 'first' || step === 'again'
        ? db
            .prepare(`UPDATE documents SET first_approved_at = ?, first_approved_by = ? WHERE id = ? AND company_id = ? AND approved_at IS NULL AND first_approved_by IS ? AND ${seen}`)
            .bind(now(), who.user.id, id, who.company.id, d.firstApprovedBy ?? null, ...seenValues)
        : db
            .prepare(
              `UPDATE documents SET approved_at = ?, approved_by = ? WHERE id = ? AND company_id = ? AND approved_at IS NULL AND first_approved_by IS ? AND (? = 0 OR first_approved_by IS NULL OR first_approved_by <> ?) AND ${seen}`,
            )
            .bind(now(), who.user.id, id, who.company.id, d.firstApprovedBy ?? null, two ? 1 : 0, who.user.id, ...seenValues),
      db
        .prepare("INSERT INTO events (at, company_id, user_id, action, subject) SELECT ?, ?, ?, ?, ? WHERE changes() > 0")
        .bind(now(), who.company.id, who.user.id, step === 'final' ? 'document.approved' : 'document.approved.first', id),
    ])
    if ((results[0]?.meta?.changes ?? 0) === 0) return c.redirect(`/app/doklady/${id}?ok=schvalenie-zmena#schvalenie`, 303)
    return c.redirect(`/app/doklady/${id}?ok=${step === 'first' ? 'schvalene-prve' : step === 'again' ? 'schvalene-znova' : 'schvalene'}`, 303)
  })
}

appRoutes.post('/doklady/:id/odpojit', async (c) => {
  const who = c.get('who')
  const id = c.req.param('id')
  const body = await c.req.parseBody()
  const db = c.env.DB
  await db.batch([unlinkStatement(db, who.company.id, id), eventStatement(db, { company: who.company.id, user: who.user.id, action: 'link.removed', subject: id })])
  return c.redirect(`${backTo(body.spat, `/app/doklady/${id}`)}?ok=odpojene`, 303)
})

appRoutes.post('/doklady/:id/sukromne', async (c) => {
  const who = c.get('who')
  const id = c.req.param('id')
  const body = await c.req.parseBody()
  const db = c.env.DB
  const paid = body.ano === '1'
  await db.batch([
    privatelyStatement(db, who.company.id, id, paid),
    eventStatement(db, { company: who.company.id, user: who.user.id, action: paid ? 'document.private' : 'document.company', subject: id }),
  ])
  return c.redirect(`/app/doklady/${id}`, 303)
})

appRoutes.post('/doklady/:id/zmazat', async (c) => {
  const who = c.get('who')
  const id = c.req.param('id')
  const db = c.env.DB
  // A trip's settlement goes with its trip (its page takes it back), never alone; a day's takings on its own page.
  const trip = ID.test(id) ? await tripOfDocument(db, who.company.id, id) : null
  if (trip) return c.redirect(`/app/cesty/${trip.id}`, 303)
  const takings = ID.test(id) ? await getDocument(db, who.company.id, id) : null
  if (takings?.source === 'takings') return c.redirect(`/app/trzby?rok=${(takings.issuedOn ?? today()).slice(0, 4)}`, 303)
  const results = await db.batch([...deleteDocumentStatements(db, who.company.id, id), eventStatement(db, { company: who.company.id, user: who.user.id, action: 'document.deleted', subject: id })])
  if ((results[1]?.meta?.changes ?? 0) === 0) {
    const d = await getDocument(db, who.company.id, id)
    if (!d) return shell(c, 'documents', t.errors.notFound, <Missing />, 404)
    const payment = d.paymentId ? await getPayment(db, who.company.id, d.paymentId) : null
    const centers = await listCenters(db, who.company.id)
    return shell(
      c,
      'documents',
      t.documents.title,
      <DocumentPage
        d={d}
        payment={payment}
        today={today()}
        error={t.document.locked}
        approvals={who.company.approvals}
        owner={who.role === 'owner'}
        approval={await approvalOf(db, who, d)}
        centers={centers}
      />,
      409,
    )
  }
  return c.redirect('/app/doklady?ok=zmazane', 303)
})

/** A document's own file, to the company it belongs to. An XML file is shown as text, never as a page. */
appRoutes.get('/subory/:id', async (c) => {
  const who = c.get('who')
  const id = c.req.param('id')
  const row = ID.test(id)
    ? await c.env.DB.prepare('SELECT file_key, file_type, file_name FROM documents WHERE id = ? AND company_id = ? AND deleted_at IS NULL')
        .bind(id, who.company.id)
        .first<{ file_key: string | null; file_type: string | null; file_name: string | null }>()
    : null
  const object = row?.file_key && c.env.FILES ? await c.env.FILES.get(row.file_key) : null
  if (!row || !object) return c.notFound()
  const type = row.file_type === 'application/xml' ? 'text/plain; charset=utf-8' : (row.file_type ?? 'application/octet-stream')
  const name = (row.file_name ?? 'doklad').replace(/[^\p{L}\p{N}._ -]/gu, '_')
  // A picture or a text runs nothing (sandbox); a PDF needs the browser's own viewer, which a sandbox would stop.
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
// Messages
// ---------------------------------------------------------------------------------------------------------------

async function messagesPage(c: Ctx, extra: { error?: string; draft?: string; submission?: string; paymentId?: string | null } = {}, status: ContentfulStatusCode = 200) {
  const who = c.get('who')
  const db = c.env.DB
  const messages = await listMessages(db, who.company.id)
  const about = [...new Set(messages.map((m) => m.paymentId).filter((id): id is string => Boolean(id)))]
  const payments = new Map((await Promise.all(about.map((id) => getPayment(db, who.company.id, id)))).filter((p) => p !== null).map((p) => [p.id, p]))
  if (status === 200) await db.batch([seenStatement(db, who.company.id)])
  return shell(
    c,
    'messages',
    t.messages.title,
    <MessagesPage messages={messages} accountant={who.company.accountantName} now={now()} payments={payments} flash={flashOf(c)} me={who.user.id} assistant={await assistantAllowed(db,clientAssistantScope(c))} {...extra} />,
    status,
  )
}

// A sensitive step of a client without a passkey (the whole archive) waits for a fresh sign-in by a link from the email.
appRoutes.get('/potvrdit', (c) => {
  const who = c.get('who')
  const next = safeNext(c.req.query('next') ?? '/app')
  return shell(c, 'company', t.confirm.title, <ConfirmByLink email={who.user.email} next={next} sent={c.req.query('poslane') === '1'} />)
})

appRoutes.post('/potvrdit', async (c) => {
  const who = c.get('who')
  const body = await c.req.parseBody()
  const next = safeNext(typeof body.next === 'string' ? body.next : '/app')
  const db = c.env.DB
  if (await withinLimit(db, 'link', who.user.email.toLowerCase(), APP.linksPerHour, 3600)) {
    const { token, statement } = await newLink(db, who.user.id)
    const link = `${siteOrigin(c)}/app/vstup?t=${token}&n=${encodeURIComponent(next)}`
    await db.batch([statement, queueStatement(db, { key: `login:${crypto.randomUUID()}`, to: who.user.email, subject: t.login.mailSubject, body: t.login.mailBody(link) })])
    later(c, flushOutbox(db, c.env.EMAIL))
  }
  return c.redirect(`/app/potvrdit?poslane=1&next=${encodeURIComponent(next)}`, 303)
})

const clientAssistantScope=(c:Ctx):AssistantScope=>({company:c.get('who').company.id,actor:c.get('who').user.id,side:'client'})
async function assistantPage(c:Ctx,result?:Awaited<ReturnType<typeof askAssistant>>) {
  const who=c.get('who'),s=clientAssistantScope(c),db=c.env.DB
  if(!await assistantAllowed(db,s))return c.notFound()
  const document=result?.document??c.req.query('doklad')??''
  if(document&&!ID.test(document))return c.notFound()
  const [documents,control]=await Promise.all([assistantDocuments(db,s,document),assistantControl(db)])
  if(document&&!documents.some(d=>d.id===document))return c.notFound()
  const topic=assistantTopic(c.req.query('tema'))
  const answer=result?.answer??(topic?await assistantAnswer(db,s,who.company,topic,document):undefined)
  if(topic&&!answer&&!result)return c.notFound()
  return shell(c,'messages','Asistent Firmony',<AssistantPage company={who.company} context={`${who.user.id}:${who.company.id}`} base="/app/asistent"
    documents={documents} available={Boolean(c.env.ANTHROPIC_API_KEY)&&control.enabled} answer={answer??undefined}
    question={result?.question} document={document} error={result?.error} submission={result?.submission} />,result?.status??200)
}
appRoutes.get('/asistent',(c)=>assistantPage(c))
appRoutes.post('/asistent',async c=>{
  const who=c.get('who'),body=await c.req.parseBody(),db=c.env.DB,s=clientAssistantScope(c)
  if(body.firma!==s.company||body.kontext!==`${s.actor}:${s.company}`)return c.text('Účet alebo firma sa zmenili. Obnovte stránku.',409)
  const fresh=async()=>{const again=await currentWho(c,db);return Boolean(again?.company?.id===s.company&&again?.user.id===s.actor&&again?.role&&!(await securityGate(c,again)))}
  const result=await askAssistant(db,c.env.ANTHROPIC_API_KEY,s,who.company,{id:body.odoslanie,question:body.otazka,document:body.doklad},fresh)
  if(!await fresh())return c.text('Účet alebo firma sa zmenili. Obnovte stránku.',409)
  return assistantPage(c,result)
})
appRoutes.post('/asistent/odovzdat',async c=>{
  const who=c.get('who'),body=await c.req.parseBody(),s=clientAssistantScope(c)
  if(body.firma!==s.company||body.kontext!==`${s.actor}:${s.company}`)return c.text('Účet alebo firma sa zmenili. Obnovte stránku.',409)
  const question=assistantQuestion(body.otazka)
  if(!question)return assistantPage(c,{status:422,error:'Najprv napíšte otázku, ktorú chcete pripraviť účtovníčke.',question:'',document:''})
  const document=typeof body.doklad==='string'?body.doklad:''
  const d=document&&ID.test(document)?await getDocument(c.env.DB,s.company,document):null
  if(document&&!d||!await assistantAllowed(c.env.DB,s))return c.notFound()
  // Preparation only. The existing composer shows the exact text, then sends it once after the client's click.
  const draft=`Otázka pre účtovníčku:\n${question}${d?`\n\nDoklad: ${d.number??d.fileName??d.id}\n${BRAND.origin}/app/doklady/${d.id}`:''}`
  return messagesPage(c,{draft,submission:crypto.randomUUID()})
})

appRoutes.get('/spravy', (c) => messagesPage(c))

appRoutes.post('/spravy', async (c) => {
  const who = c.get('who')
  const body = await c.req.parseBody()
  const text = typeof body.sprava === 'string' ? body.sprava.replace(/\r\n?/g, '\n').trim() : ''
  const db = c.env.DB
  const paymentId = typeof body.platba === 'string' && ID.test(body.platba) ? body.platba : null
  const payment = paymentId ? await getPayment(db, who.company.id, paymentId) : null
  const supplied = typeof body.odoslanie === 'string' ? body.odoslanie : ''
  const id = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(supplied) ? supplied.toLowerCase() : crypto.randomUUID()
  const bad = (error: string, status: ContentfulStatusCode) => wantsReceipt(c) ? c.json({ error }, status)
    : messagesPage(c, { error, draft: text.slice(0, APP.messageChars), submission: id, paymentId: payment?.id ?? null }, status)
  const sent = () => wantsReceipt(c) ? c.json({ message: 1, id, context: `${who.user.id}:${who.company.id}`, next: '/app/spravy?ok=poslane#posledna' })
    : c.redirect('/app/spravy?ok=poslane#posledna', 303)
  if (text === '') return bad(t.messages.emptyBody, 422)
  if (text.length > APP.messageChars) return bad(t.messages.tooLong, 422)
  const previous = () => db.prepare('SELECT company_id, author, side, body, payment_id FROM messages WHERE id = ?').bind(id)
    .first<{ company_id: string; author: string | null; side: string; body: string; payment_id: string | null }>()
  const matches = (row: Awaited<ReturnType<typeof previous>>) => row && row.company_id === who.company.id && row.author === who.user.id
    && row.side === 'client' && row.body === text && row.payment_id === (payment?.id ?? null)
  const conflict = 'Toto odoslanie už patrí inej správe. Otvorte Správy znova a skopírujte do nich svoj text.'
  const prior = await previous()
  if (prior) return matches(prior) ? sent() : bad(conflict, 409)
  if (!(await withinLimit(db, 'message', who.company.id, APP.messagesPerHour, 3600))) return bad(t.messages.throttle, 429)
  // The team is rung once for what it has not read yet: a second message before anybody looked rings nothing.
  const unread = await db.prepare("SELECT 1 AS x FROM messages WHERE company_id = ? AND side = 'client' AND seen_at IS NULL LIMIT 1").bind(who.company.id).first()
  try { await db.batch([
    messageStatement(db, { id, company: who.company.id, author: who.user.id, side: 'client', body: text, payment: payment?.id ?? null }),
    eventStatement(db, { company: who.company.id, user: who.user.id, action: 'message.sent', subject: id }),
    ...(unread ? [] : [ringStatement(db, 'message', id, who.company.accountantEmail ?? BRAND.email, bell.teamMessage(`${siteOrigin(c)}/ucto/klienti/${who.company.id}#spravy`))]),
  ]) } catch (error) {
    // A concurrent retry can lose the UNIQUE race. D1 rolls the whole batch back, including its event and bell.
    const saved = await previous()
    if (saved) return matches(saved) ? sent() : bad(conflict, 409)
    throw error
  }
  later(c, flushOutbox(db, c.env.EMAIL))
  return sent()
})

// ---------------------------------------------------------------------------------------------------------------
// The company: its details, its people, the reminders, switching to another one of the same user
// ---------------------------------------------------------------------------------------------------------------

async function companyPage(
  c: Ctx,
  extra: { invite?: { name: string; email: string }; errors?: { name?: string; email?: string; form?: string; notice?: string }; download?: string } = {},
  status: ContentfulStatusCode = 200,
) {
  const who = c.get('who')
  const db = c.env.DB
  const [people, companies, papers, declared, years, handover, receipts, bills] = await Promise.all([
    peopleOf(db, who.company.id),
    companiesOf(db, who.user.id),
    papersOf(db, who.company.id, 'poa'),
    latestDeclaration(db, who.company.id),
    exportYears(db, who.company.id),
    papersOf(db, who.company.id, 'handover'),
    exportReceipts(db, who.company.id),
    billRows(db, today(), who.company.id, 24),
  ])
  const me = people.find((p) => p.id === who.user.id) ?? { ...who.user, role: who.role }
  return shell(
    c,
    'company',
    t.company.title,
    <CompanyPage
      company={who.company}
      people={people}
      me={me}
      companies={companies}
      inbox={inboxAddress(who.company)}
      invite={extra.invite ?? { name: '', email: '' }}
      errors={extra.errors ?? {}}
      flash={flashOf(c)}
      poa={poaStateOf(papers)}
      declaration={declarationStateOf(declared)}
      today={today()}
      noticeEnd={await clientNoticeEnd(c.env.DB, who.company, today())}
      ending={endingOf(who.company, today())}
      years={years}
      handover={handover}
      receipts={receipts}
      downloadError={extra.download ?? null}
      bills={bills}
    />,
    status,
  )
}

appRoutes.get('/firma', (c) => companyPage(c))

/** The VAT and income tax returns we filed for the company, and for a tax to pay everything a bank needs, the QR code included. */
appRoutes.get('/dane', async (c) => {
  const who = c.get('who')
  const db = c.env.DB
  const [filed, closings] = await Promise.all([filedReturns(db, who.company.id), closingsOf(db, who.company.id)])
  const [paid, income] = await Promise.all([
    taxPaid(db, who.company.id, filed),
    Promise.all(closings.filter((k) => k.filed).map(async (closing) => ({ closing, paid: await incomePaid(db, who.company.id, closing.year) }))),
  ])
  return shell(c, 'taxes', t.taxes.title, <TaxesPage payroll={who.role === 'owner'} company={who.company} filed={filed} paid={paid} income={income} today={today()} />)
})

appRoutes.post('/firma/pozvat', async (c) => {
  const who = c.get('who')
  const db = c.env.DB
  const body = await c.req.parseBody()
  const invite = {
    name: typeof body.meno === 'string' ? body.meno.trim().slice(0, 120) : '',
    email: typeof body.email === 'string' ? body.email.trim().slice(0, 200) : '',
  }
  if (who.role !== 'owner') return companyPage(c, { invite, errors: { form: t.company.onlyOwner } }, 403)
  const errors: { name?: string; email?: string; form?: string; notice?: string } = {}
  if (invite.name.length < 2) errors.name = t.company.badName
  if (!EMAIL.test(invite.email)) errors.email = t.company.badEmail
  if (Object.keys(errors).length > 0) return companyPage(c, { invite, errors }, 422)
  if (!(await withinLimit(db, 'invite', who.company.id, 10, 3600))) return companyPage(c, { invite, errors: { form: t.messages.throttle } }, 429)
  const existing = await userByEmail(db, invite.email)
  if (existing && (await db.prepare('SELECT 1 AS x FROM members WHERE company_id = ? AND user_id = ?').bind(who.company.id, existing.id).first())) {
    return companyPage(c, { invite, errors: { email: t.company.already } }, 409)
  }
  const id = existing?.id ?? crypto.randomUUID()
  const { token, statement } = await newLink(db, id, TEAM.welcomeDays * 24 * 60)
  await db.batch([
    ...(existing ? [] : [db.prepare('INSERT INTO users (id, created_at, email, name) VALUES (?, ?, ?, ?)').bind(id, now(), invite.email, invite.name)]),
    db.prepare("INSERT OR IGNORE INTO members (company_id, user_id, role, created_at, invited_by) VALUES (?, ?, 'member', ?, ?)").bind(who.company.id, id, now(), who.user.id),
    statement,
    eventStatement(db, { company: who.company.id, user: who.user.id, action: 'member.invited', subject: id }),
    queueStatement(db, {
      key: `invite:${who.company.id}:${id}:${now()}`,
      to: invite.email,
      subject: t.company.inviteSubject(who.company.name),
      body: t.company.inviteBody(existing?.name ?? invite.name, who.user.name, who.company.name, `${siteOrigin(c)}/app/vstup?t=${token}`),
    }),
  ])
  later(c, flushOutbox(db, c.env.EMAIL))
  return c.redirect('/app/firma?ok=pozvanka#ludia', 303)
})

appRoutes.post('/firma/ludia/:id/odobrat', async (c) => {
  const who = c.get('who')
  const db = c.env.DB
  const id = c.req.param('id')
  if (who.role !== 'owner') return companyPage(c, { errors: { form: t.company.onlyOwner } }, 403)
  const [removed] = await db.batch([
    db.prepare("DELETE FROM members WHERE company_id = ? AND user_id = ? AND role <> 'owner' AND user_id <> ?").bind(who.company.id, id, who.user.id),
    eventStatement(db, { company: who.company.id, user: who.user.id, action: 'member.removed', subject: id }),
  ])
  return c.redirect((removed?.meta?.changes ?? 0) > 0 ? '/app/firma?ok=odobraty#ludia' : '/app/firma#ludia', 303)
})

appRoutes.post('/firma/pripomienky', async (c) => {
  const who = c.get('who')
  const body = await c.req.parseBody()
  const on = body.zapnut === '1'
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE users SET reminders = ? WHERE id = ?').bind(on ? 1 : 0, who.user.id),
    eventStatement(c.env.DB, { company: who.company.id, user: who.user.id, action: on ? 'reminders.on' : 'reminders.off' }),
  ])
  return c.redirect('/app/firma?ok=pripomienky#pripomienky', 303)
})

/**
 * An owner turns approving suppliers' invoices on or off, sets from what amount two people approve, and which colleagues
 * approve up to what amount (approvals.ts). A form without the colleagues' part (approving only turned on) keeps them.
 */
appRoutes.post('/firma/schvalovanie', async (c) => {
  const who = c.get('who')
  const db = c.env.DB
  if (who.role !== 'owner') return shell(c, 'company', t.errors.notFound, <Missing />, 403)
  const body = await c.req.parseBody()
  const on = body.zapnut === '1'
  const amount = (name: string): number | null | 'bad' => {
    const text = typeof body[name] === 'string' ? (body[name] as string).trim() : ''
    if (text === '') return null
    const cents = centsOf(text)
    return cents === null || Number.isNaN(cents) || cents <= 0 ? 'bad' : cents
  }
  const statements: D1PreparedStatement[] = [db.prepare('UPDATE companies SET approvals = ? WHERE id = ?').bind(on ? 1 : 0, who.company.id)]
  if (typeof body.dve_od === 'string') {
    const two = amount('dve_od')
    if (two === 'bad') return c.redirect('/app/firma?ok=schvalovanie-zle#schvalovanie', 303)
    statements.push(db.prepare('UPDATE companies SET approval_two_from = ? WHERE id = ?').bind(two, who.company.id))
  }
  if (body.schvalovatelia === '1') {
    for (const person of (await peopleOf(db, who.company.id)).filter((p) => p.role !== 'owner')) {
      const limit = amount(`limit_${person.id}`)
      if (limit === 'bad') return c.redirect('/app/firma?ok=schvalovanie-zle#schvalovanie', 303)
      statements.push(
        db
          .prepare("UPDATE members SET approver = ?, approve_limit = ? WHERE company_id = ? AND user_id = ? AND role <> 'owner'")
          .bind(body[`schvalovatel_${person.id}`] === '1' ? 1 : 0, limit, who.company.id, person.id),
      )
    }
  }
  statements.push(eventStatement(db, { company: who.company.id, user: who.user.id, action: on ? 'approvals.on' : 'approvals.off' }))
  await db.batch(statements)
  return c.redirect('/app/firma?ok=schvalovanie#schvalovanie', 303)
})

/** Shared by the queue and the overview: only approvals this person is currently allowed to give. */
async function approvalQueueOf(db: D1Database, who: { role: string; user: { id: string }; company: Company }) {
  const rows = who.company.approvals
    ? (
        await db
          .prepare(
            `SELECT ${DOC_COLUMNS} FROM ${DOC_FROM}
              WHERE d.company_id = ? AND d.kind = 'invoice_in' AND d.deleted_at IS NULL AND d.duplicate_of IS NULL AND d.approved_at IS NULL
                AND (d.status = 'read' OR d.booked_at IS NOT NULL) AND d.paid_privately = 0 AND l.payment_id IS NULL AND NOT ${CASH_PAID} AND ${PAYABLE_DOC}
              ORDER BY COALESCE(d.due_on, d.issued_on, '9999'), d.created_at LIMIT 300`,
          )
          .bind(who.company.id)
          .all<Record<string, unknown>>()
      ).results.map(docOf)
    : []
  // One membership read instead of one query for every distinct first approver on a busy company overview.
  const people = await db.prepare('SELECT user_id,role,approver,approve_limit FROM members WHERE company_id=?').bind(who.company.id)
    .all<{ user_id: string; role: string; approver: number; approve_limit: number | null }>()
  const firsts = new Map<string, Approver>(people.results.map((p) => [p.user_id, { owner: p.role === 'owner', approver: p.role === 'owner' || p.approver === 1, limit: p.role === 'owner' ? null : p.approve_limit }]))
  const approver: Approver | null = who.role === 'owner' ? { owner: true, approver: true, limit: null } : firsts.get(who.user.id) ?? null
  const stepOf = (d: Doc) => {
    const cents = approvalCents(d)
    const firstMay = !d.firstApprovedBy || mayApprove(firsts.get(d.firstApprovedBy) ?? null, cents)
    return approvalStep({ approvedAt: d.approvedAt, firstApprovedBy: d.firstApprovedBy ?? null, ibanBy: d.ibanBy ?? null }, who.company.approvalTwoFrom, cents, who.user.id, { owner: who.role === 'owner', firstMay })
  }
  const mine = rows.filter((d) => mayApprove(approver, approvalCents(d)) && ['first', 'again', 'final'].includes(stepOf(d)))
  const others = rows.filter((d) => !mine.includes(d))
  return { approver, mine, others, ibanMine: others.filter((d) => stepOf(d) === 'iban').map((d) => d.id) }
}

/** The suppliers' invoices that wait for approving: those the person may approve first, then those that wait for others. */
appRoutes.get('/schvalovanie', async (c) => {
  const who = c.get('who')
  const { approver, mine, others, ibanMine } = await approvalQueueOf(c.env.DB, who)
  return shell(
    c,
    'documents',
    t.approvalsQueue.title,
    <ApprovalsPage on={who.company.approvals} mine={mine} others={others} me={who.user.id} today={today()} approver={Boolean(approver?.owner || approver?.approver)} ibanMine={ibanMine} />,
  )
})

appRoutes.post('/firma/prepnut', async (c) => {
  const who = c.get('who')
  const body = await c.req.parseBody()
  const company = typeof body.firma === 'string' && ID.test(body.firma) ? body.firma : ''
  await c.env.DB.batch([switchStatement(c.env.DB, who.session, who.user.id, company)])
  return c.redirect('/app', 303)
})

// ---------------------------------------------------------------------------------------------------------------
// The papers of the start: the power of attorney for us, the notice to the former accountant (papers.ts)
// ---------------------------------------------------------------------------------------------------------------

async function poaPage(c: Ctx, error: string | null = null, status: ContentfulStatusCode = 200) {
  const who = c.get('who')
  const papers = await papersOf(c.env.DB, who.company.id, 'poa')
  return shell(
    c,
    'company',
    t.poa.title,
    <PoaPage company={who.company} papers={papers} state={poaStateOf(papers)} today={today()} now={now()} flash={c.req.query('ok') === 'plna-moc' ? t.poa.flash : null} error={error} />,
    status,
  )
}

appRoutes.get('/plna-moc', (c) => poaPage(c))

appRoutes.post('/plna-moc', async (c) => {
  const who = c.get('who')
  const db = c.env.DB
  if (!(await withinLimit(db, 'poa', who.company.id, 10, 3600))) return poaPage(c, t.messages.throttle, 429)
  const body = await c.req.parseBody()
  const raw = body.file
  const file = typeof raw === 'object' && raw !== null && 'arrayBuffer' in raw && raw.size > 0 ? raw : null
  if (!file) return poaPage(c, t.poa.none, 422)
  if (file.size > APP.fileBytes) return poaPage(c, t.poa.large, 422)
  const company = who.company
  const kept = await keepPaper(
    db,
    c.env.FILES,
    { company: company.id, user: who.user.id },
    'poa',
    { name: (file.name || 'plna-moc').slice(0, 120), bytes: new Uint8Array(await file.arrayBuffer()) },
    (paper) => [ringStatement(db, 'poa', paper.id, company.accountantEmail ?? BRAND.email, bell.teamPoa(`${siteOrigin(c)}/ucto/klienti/${company.id}#zmluva`))],
  )
  if (!kept.ok) {
    const answer = { none: [t.poa.none, 422], large: [t.poa.large, 422], type: [t.poa.refused, 422], many: [t.poa.many, 409], storage: [t.poa.noStorage, 503] } as const
    const [text, code] = answer[kept.reason]
    return poaPage(c, text, code)
  }
  later(c, flushOutbox(db, c.env.EMAIL))
  return c.redirect('/app/plna-moc?ok=plna-moc', 303)
})

/** A paper's own file, to the company it belongs to: shown, or downloaded when it is a signature container. */
appRoutes.get('/plna-moc/:id', async (c) => {
  const who = c.get('who')
  const id = c.req.param('id')
  const paper = ID.test(id) ? await getPaper(c.env.DB, who.company.id, id) : null
  const answer = paper ? await paperResponse(c.env.FILES, paper) : null
  return answer ?? c.notFound()
})

/** When the company told us that the notice to its former accountant went out, or null. */
async function switchingSentAt(db: D1Database, company: string): Promise<number | null> {
  const row = await db.prepare("SELECT at FROM events WHERE company_id = ? AND action = 'switching.sent' ORDER BY id DESC LIMIT 1").bind(company).first<{ at: number }>()
  return row?.at ?? null
}

/**
 * The notice to the former accountant: what is typed in the side's form goes only into this page's address. Below
 * it, what the former accountant hands over is uploaded here (the accountant takes it over on the client's page),
 * and the client says when the letter went out, which ticks the step.
 */
async function switchPage(c: Ctx, notice: { flash?: string | null; error?: string | null; values?: HandoverRequestValues; errors?: string[]; submission?: string } = {}, status?: ContentfulStatusCode) {
  const who = c.get('who')
  const q = (name: string, max: number) => (c.req.query(name) ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
  const values = { to: q('komu', 120), toAddress: q('adresa', 160), since: q('od', 20), until: q('do', 20) }
  const since = dayOfText(values.since)
  const until = dayOfText(values.until)
  const errors: { since?: string; until?: string } = {}
  if (since === null) errors.since = t.switching.dayHint
  if (until === null) errors.until = t.switching.dayHint
  const [papers, sentAt, managed] = await Promise.all([papersOf(c.env.DB, who.company.id, 'takeover'), switchingSentAt(c.env.DB, who.company.id), managedHandover(c.env.DB,who.company.id)])
  const ok = c.req.query('ok')
  const flash = notice.flash ?? (ok === 'koordinacia' ? 'Žiadosť sme prijali. Priebeh prevzatia uvidíte tu.' : ok === 'odvolane' ? 'Koordinácia je odvolaná. Doterajšie záznamy zostávajú zachované.' : ok === 'podklady' ? t.switching.papersFlash : ok === 'odoslane' ? t.switching.sentFlash : null)
  return shell(
    c,
    'company',
    t.switching.title,
    <SwitchPage
      company={who.company}
      values={values}
      since={since ? dayName(since) : null}
      until={until ? dayName(until) : null}
      errors={errors}
      papers={papers}
      sentAt={sentAt}
      now={now()}
      flash={flash}
      error={notice.error ?? null}
      managed={{company:who.company,h:managed,owner:who.role === 'owner',open:serviceOpen(who.company,today()),submission:notice.submission ?? crypto.randomUUID(),now:now(),values:notice.values,errors:notice.errors}}
    />,
    status ?? (since === null || until === null ? 422 : 200),
  )
}

appRoutes.get('/prechod', (c) => switchPage(c))

appRoutes.get('/prechod/otazka', async (c) => {
  const who = c.get('who'), id = c.req.query('ziadost') ?? ''
  if (!ID.test(id)) return c.notFound()
  const company = await c.env.DB.prepare(`SELECT co.id,co.name FROM managed_handovers h
    JOIN companies co ON co.id = h.company_id JOIN members m ON m.company_id = co.id
    WHERE h.id = ? AND m.user_id = ? AND ${accessOpenSql('co')}`).bind(id,who.user.id).first<{id:string;name:string}>()
  if (!company) return c.notFound()
  if (company.id === who.company.id) return c.redirect('/app/prechod#koordinacia',303)
  return shell(c,'company','Upozornenie k prevzatiu',<TakeoverCompanyChoice company={company} />)
})

appRoutes.post('/prechod/poverit', async (c) => {
  const who = c.get('who'), db = c.env.DB
  if (who.role !== 'owner') return switchPage(c,{error:'Koordináciu môže zadať vlastník firemného účtu.'},403)
  if (!serviceOpen(who.company,today())) return switchPage(c,{error:'Služba už skončila. Nové prevzatie sa nezačína.'},409)
  if (!(await withinLimit(db,'managed-takeover',who.company.id,20,3600))) return switchPage(c,{error:t.messages.throttle},429)
  const body = await c.req.parseBody()
  const values = {name:typeof body.meno === 'string' ? body.meno : '',email:typeof body.email === 'string' ? body.email.trim() : '',day:typeof body.den === 'string' ? body.den : ''}
  const submission = typeof body.odoslanie === 'string' && /^[a-f0-9-]{36}$/.test(body.odoslanie) ? body.odoslanie : ''
  if (body.firma !== who.company.id) return switchPage(c,{error:'Aktívna firma sa zmenila. Obnovte stránku a zadajte žiadosť pre správnu firmu.',values},409)
  const errors = requestErrors(values,body.suhlas === 'ano')
  if (!submission) errors.push('Otvorte aktuálny formulár a žiadosť zopakujte.')
  if (errors.length) return switchPage(c,{values,errors,submission:submission || undefined},422)
  const created = await requestHandover(db,who.company,who.user,submission,values)
  const current = await managedHandover(db,who.company.id)
  if (!created && current && (current.contactName !== values.name.trim() || current.contactEmail !== values.email.toLowerCase() || current.requestedOn !== (values.day || null))) return switchPage(c,{error:'Firma už má žiadosť s iným kontaktom alebo termínom. Pôvodnú koordináciu môžete odvolať a zadať novú; tento pokus ju nezmenil.'},409)
  if (!created && (!current || current.state === 'cancelled')) return switchPage(c,{error:'Táto žiadosť už bola odvolaná alebo sa zmenila. Pre novú koordináciu použite aktuálny formulár.'},409)
  if (created) {
    await ringStatement(db,'managed-takeover',submission,who.company.accountantEmail ?? BRAND.email,bell.teamManagedTakeover(`${siteOrigin(c)}/ucto/klienti/${who.company.id}/prevzatie#koordinacia`)).run()
    later(c,flushOutbox(db,c.env.EMAIL))
  }
  return c.redirect('/app/prechod?ok=koordinacia#koordinacia',303)
})

appRoutes.post('/prechod/odvolat', async (c) => {
  const who = c.get('who'), body = await c.req.parseBody()
  if (who.role !== 'owner') return switchPage(c,{error:'Koordináciu môže odvolať vlastník firemného účtu.'},403)
  if (body.firma !== who.company.id || typeof body.ziadost !== 'string' || !/^\d+$/.test(String(body.verzia))) return switchPage(c,{error:'Firma alebo verzia žiadosti sa zmenila. Obnovte stránku.'},409)
  const changed = await cancelHandover(c.env.DB,who.company.id,who.user.id,body.ziadost,Number(body.verzia))
  return changed ? c.redirect('/app/prechod?ok=odvolane#koordinacia',303) : switchPage(c,{error:'Žiadosť sa medzitým zmenila alebo je už uzavretá. Obnovte stránku.'},409)
})

async function formationPage(c: Ctx, notice: { flash?: string | null; error?: string | null; values?: FormationRequestValues; errors?: string[]; submission?: string } = {}, status?: ContentfulStatusCode) {
  const who = c.get('who')
  const f = await formationCase(c.env.DB, who.company.id)
  const ok = c.req.query('ok')
  const flash = notice.flash ?? (ok === 'zalozenie' ? 'Žiadosť sme prijali. Priebeh založenia uvidíte tu.' : ok === 'zrusene' ? 'Koordinácia je zrušená. Doterajšie záznamy zostávajú zachované.' : null)
  return shell(c, 'company', 'Založenie s.r.o.', <ClientFormation company={who.company} f={f} owner={who.role === 'owner'} submission={notice.submission ?? crypto.randomUUID()} values={notice.values} errors={notice.errors} />, status ?? 200)
}

appRoutes.get('/zalozenie', (c) => formationPage(c))

appRoutes.post('/zalozenie', async (c) => {
  const who = c.get('who'), db = c.env.DB
  if (who.role !== 'owner') return formationPage(c, { error: 'Žiadosť o založenie môže zadať vlastník firemného účtu.' }, 403)
  if (!serviceOpen(who.company, today())) return formationPage(c, { error: 'Služba už skončila. Nové založenie sa nezačína.' }, 409)
  if (!(await withinLimit(db, 'formation', who.company.id, 20, 3600))) return formationPage(c, { error: t.messages.throttle }, 429)
  const body = await c.req.parseBody()
  const values = { name: typeof body.meno === 'string' ? body.meno.trim() : '', email: typeof body.email === 'string' ? body.email.trim().toLowerCase() : '', idea: typeof body.predmet === 'string' ? body.predmet.trim() : '' }
  const submission = typeof body.odoslanie === 'string' && /^[a-f0-9-]{36}$/.test(body.odoslanie) ? body.odoslanie : ''
  if (body.firma !== who.company.id) return formationPage(c, { error: 'Aktívna firma sa zmenila. Obnovte stránku a zadajte žiadosť pre správnu firmu.', values }, 409)
  const errors = formationRequestErrors(values, body.suhlas === '1')
  if (!submission) errors.push('Otvorte aktuálny formulár a žiadosť zopakujte.')
  if (errors.length) return formationPage(c, { values, errors, submission: submission || undefined }, 422)
  const created = await requestFormation(db, who.company, who.user, values, submission)
  const current = await formationCase(db, who.company.id)
  if (!created && current && (current.contactName !== values.name || current.contactEmail !== values.email || current.idea !== values.idea)) return formationPage(c, { error: 'Firma už má žiadosť s inými údajmi. Pôvodnú môžete zrušiť a zadať novú; tento pokus ju nezmenil.' }, 409)
  if (!created && (!current || current.state === 'cancelled')) return formationPage(c, { error: 'Táto žiadosť už bola zrušená alebo sa zmenila. Pre novú použite aktuálny formulár.' }, 409)
  if (created) {
    await ringStatement(db, 'formation', submission, who.company.accountantEmail ?? BRAND.email, bell.teamManagedTakeover(`${siteOrigin(c)}/ucto/klienti/${who.company.id}/zalozenie`)).run()
    later(c, flushOutbox(db, c.env.EMAIL))
  }
  return c.redirect('/app/zalozenie?ok=zalozenie#zalozenie', 303)
})

appRoutes.post('/zalozenie/zrusit', async (c) => {
  const who = c.get('who'), body = await c.req.parseBody()
  if (who.role !== 'owner') return formationPage(c, { error: 'Koordináciu môže zrušiť vlastník firemného účtu.' }, 403)
  if (body.firma !== who.company.id || typeof body.ziadost !== 'string' || !/^\d+$/.test(String(body.verzia))) return formationPage(c, { error: 'Firma alebo verzia žiadosti sa zmenila. Obnovte stránku.' }, 409)
  const changed = await cancelFormation(c.env.DB, who.company.id, who.user.id, body.ziadost, Number(body.verzia))
  return changed ? c.redirect('/app/zalozenie?ok=zrusene#zalozenie', 303) : formationPage(c, { error: 'Žiadosť sa medzitým zmenila alebo je už uzavretá. Obnovte stránku.' }, 409)
})

appRoutes.post('/prechod/odoslane', async (c) => {
  const who = c.get('who')
  const db = c.env.DB
  if (!(await switchingSentAt(db, who.company.id))) await db.batch([eventStatement(db, { company: who.company.id, user: who.user.id, action: 'switching.sent' })])
  return c.redirect('/app/prechod?ok=odoslane', 303)
})

appRoutes.post('/prechod/podklady', async (c) => {
  const who = c.get('who')
  const db = c.env.DB
  if (!(await withinLimit(db, 'takeover', who.company.id, 30, 3600))) return switchPage(c, { error: t.messages.throttle }, 429)
  const body = await c.req.parseBody({ all: true })
  const raws = ([] as unknown[]).concat(body.file ?? [])
  const files = raws.filter((raw): raw is File => typeof raw === 'object' && raw !== null && 'arrayBuffer' in raw && (raw as File).size > 0)
  const answer = { none: [t.poa.none, 422], large: [t.poa.large, 422], type: [t.switching.papersRefused, 422], many: [t.switching.papersMany, 409], storage: [t.poa.noStorage, 503] } as const
  if (files.length > ENDING.handoverAtOnce) return switchPage(c, { error: t.switching.papersAtOnce }, 422)
  const refused = await booksRefused(db, who.company.id, 'takeover', files)
  if (refused) return switchPage(c, { error: answer[refused][0] }, answer[refused][1])
  const company = who.company
  let rung = false
  for (const file of files) {
    const kept = await keepPaper(
      db,
      c.env.FILES,
      { company: company.id, user: who.user.id },
      'takeover',
      { name: (file.name || 'podklady').slice(0, 120), bytes: new Uint8Array(await file.arrayBuffer()) },
      (paper) => (rung ? [] : [ringStatement(db, 'takeover', paper.id, company.accountantEmail ?? BRAND.email, bell.teamTakeover(`${siteOrigin(c)}/ucto/klienti/${company.id}#prevzatie`))]),
    )
    if (!kept.ok) {
      const [text, code] = answer[kept.reason]
      return switchPage(c, { error: text }, code)
    }
    rung = true
  }
  later(c, flushOutbox(db, c.env.EMAIL))
  return c.redirect('/app/prechod?ok=podklady#podklady', 303)
})

appRoutes.get('/prechod/podklady/:id', async (c) => {
  const who = c.get('who')
  const id = c.req.param('id')
  const paper = ID.test(id) ? await getPaper(c.env.DB, who.company.id, id) : null
  const answer = paper?.kind === 'takeover' ? await paperResponse(c.env.FILES, paper) : null
  return answer ?? c.notFound()
})

// ---------------------------------------------------------------------------------------------------------------
// Kto stojí za firmou: the declaration the law against money laundering asks for (aml.ts). The owner of the company
// fills it in and sees it; a member is told only where it stands. Every version is kept; the team checks the newest.
// ---------------------------------------------------------------------------------------------------------------

async function declarationPage(c: Ctx, form: { values: DeclarationValues; errors: DeclarationErrors; error?: string } | null = null, status: ContentfulStatusCode = 200) {
  const who = c.get('who')
  const stored = await latestDeclaration(c.env.DB, who.company.id)
  const owner = who.role === 'owner'
  const fresh: DeclarationValues = { name: who.company.signedBy ?? who.user.name, nationality: 'slovenská' }
  return shell(
    c,
    'company',
    t.declaration.title,
    <DeclarationPage
      signature={<section class="info stack"><h2 class="info__title">Podpísané vyhlásenie</h2><p>Skontrolujte predvyplnené údaje, stiahnite vyhlásenie a podpíšte ho kvalifikovaným elektronickým podpisom.</p><button class="btn btn--line" type="submit" formaction="/app/vyhlasenie/pdf">Stiahnuť vyhlásenie na podpis</button><label class="field__label" for="dek-podpis">Pôvodný podpísaný súbor, najviac 25 MB</label><input id="dek-podpis" class="field__input" name="podpis" type="file" accept=".pdf,.asice" />{form?.errors.podpis ? <p class="field__error">{form.errors.podpis}</p> : null}</section>}
      state={declarationStateOf(stored)}
      stored={owner ? stored : null}
      owner={owner}
      editing={form !== null || c.req.query('zmenit') === '1' || !stored}
      values={form?.values ?? (stored ? valuesOfDeclaration(stored.data) : fresh)}
      errors={form?.errors ?? {}}
      now={now()}
      flash={c.req.query('ok') === 'vyhlasenie' ? t.declaration.flash : null}
      error={form?.error ?? null}
    />,
    status,
  )
}

appRoutes.get('/vyhlasenie', (c) => declarationPage(c))

appRoutes.post('/vyhlasenie/pdf', async (c) => {
  const who = c.get('who')
  if (who.role !== 'owner') return c.notFound()
  const values = valuesFrom(await c.req.parseBody())
  const { declaration, errors } = checkDeclaration({ ...values, truthful: '1' }, today(), t.declaration.errors)
  if (!declaration) return declarationPage(c, { values, errors }, 422)
  return c.body(await declarationPdf(who.company, declaration), 200, { 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="Firmony-vyhlasenie.pdf"', 'Cache-Control': 'private, no-store' })
})
appRoutes.post('/vyhlasenie', async (c) => {
  const who = c.get('who')
  if (who.role !== 'owner') return declarationPage(c, null, 403)
  const db = c.env.DB
  const body = await c.req.parseBody()
  const values = valuesFrom(body)
  if (!(await withinLimit(db, 'declaration', who.company.id, APP.declarationsPerHour, 3600))) return declarationPage(c, { values, errors: {}, error: t.declaration.errors.throttle }, 429)
  const { declaration, errors } = checkDeclaration(values, today(), t.declaration.errors)
  if (!declaration) return declarationPage(c, { values, errors }, 422)
  const company = who.company
  const file = await signatureFile(body.podpis)
  if (!file || !c.env.FILES) return declarationPage(c, { values, errors: { podpis: 'Nahrajte pôvodný podpísaný PDF alebo ASiC-E súbor, najviac 25 MB.' } }, 422)
  const made = declarationStatements(db, company.id, who.user.id, declaration)
  const dossier = await prepareDossier(db,c.env.FILES,{company:company.id,declarationId:made.id,facts:companyFacts(company)},declaration,file,who.user.id)
  await db.batch([...made.statements, dossier.statement, ringStatement(db, 'declaration', made.id, company.accountantEmail ?? BRAND.email, bell.teamDeclaration(`${siteOrigin(c)}/ucto/klienti/${company.id}/aml`))])
  later(c, flushOutbox(db, c.env.EMAIL))
  return c.redirect('/app/vyhlasenie?ok=vyhlasenie', 303)
})

// ---------------------------------------------------------------------------------------------------------------
// The contract inside the app: what was agreed and the terms in full; and the notice, given and taken back here
// ---------------------------------------------------------------------------------------------------------------

appRoutes.get('/zmluva', async (c) => {
  const who = c.get('who')
  const row = await c.env.DB.prepare('SELECT o.plan, o.price_cents, o.accepted_at, o.signed_by, o.start_on, o.terms_version FROM orders o JOIN companies co ON co.order_id = o.id WHERE co.id = ?')
    .bind(who.company.id)
    .first<{ plan: string; price_cents: number | null; accepted_at: number | null; signed_by: string | null; start_on: string | null; terms_version: string | null }>()
  const order = row ? { plan: row.plan, priceCents: row.price_cents, acceptedAt: row.accepted_at, signedBy: row.signed_by, startOn: row.start_on, termsVersion: row.terms_version } : null
  const contract = await resolveContract(c.env.DB, who.company.id, order?.termsVersion ?? who.company.termsVersion)
  return shell(c, 'company', t.contractPage.title, <ContractPage company={who.company} order={order} contract={contract} />)
})

/** When the client's notice given on a day ends the contract: a contract whose first month is free ends with it. */
async function clientNoticeEnd(db: D1Database, company: Company, day: string): Promise<string> {
  const tariff = await tariffForClient(db, company)
  return noticeEndsOn(day, { startOn: company.startOn, firstMonthFree: tariff !== 'corrupt' && tariff.firstMonthFree })
}

appRoutes.post('/firma/vypoved', async (c) => {
  const who = c.get('who')
  if (who.role !== 'owner') return companyPage(c, { errors: { notice: t.notice.onlyOwner } }, 403)
  const body = await c.req.parseBody()
  if (body.potvrdit !== '1') return companyPage(c, { errors: { notice: t.notice.must } }, 422)
  const db = c.env.DB
  const end = await clientNoticeEnd(db, who.company, today())
  // Given once: a second click, or a second person at the same moment, changes nothing and writes nothing.
  const [given] = await db.batch([
    db.prepare("UPDATE companies SET notice_at = ?, notice_by = ?, notice_side = 'client', ends_on = ? WHERE id = ? AND notice_at IS NULL").bind(now(), who.user.id, end, who.company.id),
  ])
  if ((given?.meta?.changes ?? 0) === 0) return c.redirect('/app/firma#zmluva', 303)
  const id = crypto.randomUUID()
  await db.batch([
    messageStatement(db, { id, company: who.company.id, author: who.user.id, side: 'client', body: t.notice.message(dayName(end)), payment: null }),
    eventStatement(db, { company: who.company.id, user: who.user.id, action: 'contract.notice', subject: id, detail: { endsOn: end } }),
    ringStatement(db, 'notice', id, BRAND.email, bell.teamNotice(`${siteOrigin(c)}/ucto/klienti/${who.company.id}#zmluva`)),
    ...(who.company.accountantEmail && who.company.accountantEmail.toLowerCase() !== BRAND.email.toLowerCase()
      ? [ringStatement(db, 'notice', id, who.company.accountantEmail, bell.teamNotice(`${siteOrigin(c)}/ucto/klienti/${who.company.id}#zmluva`))]
      : []),
  ])
  later(c, flushOutbox(db, c.env.EMAIL))
  return c.redirect('/app/firma?ok=vypoved#zmluva', 303)
})

appRoutes.post('/firma/vypoved/spat', async (c) => {
  const who = c.get('who')
  if (who.role !== 'owner') return companyPage(c, { errors: { notice: t.notice.onlyOwner } }, 403)
  const db = c.env.DB
  // Taken back while the contract still runs (point 10.2 of the terms: we agree to it in advance).
  const [back] = await db.batch([
    db
      .prepare("UPDATE companies SET notice_at = NULL, notice_by = NULL, notice_side = NULL, ends_on = NULL WHERE id = ? AND notice_at IS NOT NULL AND notice_side = 'client' AND ends_on >= ?")
      .bind(who.company.id, today()),
  ])
  if ((back?.meta?.changes ?? 0) === 0) return c.redirect('/app/firma#zmluva', 303)
  const id = crypto.randomUUID()
  await db.batch([
    messageStatement(db, { id, company: who.company.id, author: who.user.id, side: 'client', body: t.notice.messageBack, payment: null }),
    eventStatement(db, { company: who.company.id, user: who.user.id, action: 'contract.notice.withdrawn', subject: id }),
    ringStatement(db, 'notice', id, BRAND.email, bell.teamNotice(`${siteOrigin(c)}/ucto/klienti/${who.company.id}#zmluva`)),
    ...(who.company.accountantEmail && who.company.accountantEmail.toLowerCase() !== BRAND.email.toLowerCase()
      ? [ringStatement(db, 'notice', id, who.company.accountantEmail, bell.teamNotice(`${siteOrigin(c)}/ucto/klienti/${who.company.id}#zmluva`))]
      : []),
  ])
  later(c, flushOutbox(db, c.env.EMAIL))
  return c.redirect('/app/firma?ok=vypoved-spat#zmluva', 303)
})

// ---------------------------------------------------------------------------------------------------------------
// Everything of the company to download, a year at a time (export.ts), and the books the accountant handed over
// ---------------------------------------------------------------------------------------------------------------

appRoutes.get('/export', async (c) => {
  const who = c.get('who')
  if (who.role !== 'owner') return companyPage(c, { download: t.download.onlyOwner }, 403)
  const db = c.env.DB
  const year = c.req.query('rok') ?? ''
  if (!/^\d{4}$/.test(year) || !(await exportYears(db, who.company.id)).includes(year)) return shell(c, 'company', t.errors.notFound, <Missing />, 404)
  const contract = await resolveContract(db, who.company.id, who.company.termsVersion)
  if (contract.status === 'corrupt') return companyPage(c, { download: contract.notice }, 409)
  if (!(await withinLimit(db, 'export', who.company.id, ENDING.exportsPerHour, 3600))) return companyPage(c, { download: t.download.throttle }, 429)
  const row = await db
    .prepare('SELECT o.plan, o.price_cents, o.accepted_at, o.signed_by, o.start_on FROM orders o JOIN companies co ON co.order_id = o.id WHERE co.id = ?')
    .bind(who.company.id)
    .first<{ plan: string; price_cents: number | null; accepted_at: number | null; signed_by: string | null; start_on: string | null }>()
  const order = row ? { plan: row.plan, priceCents: row.price_cents, acceptedAt: row.accepted_at, signedBy: row.signed_by, startOn: row.start_on } : null
  await db.batch([eventStatement(db, { company: who.company.id, user: who.user.id, action: 'export.downloaded', subject: year })])
  const receipt = await beginExport(db, who.company.id, year, who.user.id)
  const archive = await exportYear(c.env, who.company, year, order, dayName(today()).replace(/\u00a0/g, ' '), { ...receipt, onComplete: async () => { await completeExport(db, receipt.id) } })
  return new Response(archive.body, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${archive.name}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
})

appRoutes.post('/export/potvrdit', async (c) => {
  const who = c.get('who')
  if (who.role !== 'owner') return companyPage(c, { download: t.company.onlyOwner }, 403)
  const body = await c.req.parseBody()
  if (body.potvrdit !== '1' || typeof body.export !== 'string') return companyPage(c, { download: t.download.confirmNeeded }, 422)
  const done = await confirmExport(c.env.DB, who.company.id, body.export)
  if ((done.meta?.changes ?? 0) === 0) return companyPage(c, { download: t.download.stale }, 409)
  await c.env.DB.batch([eventStatement(c.env.DB, { company: who.company.id, user: who.user.id, action: 'export.confirmed', subject: body.export })])
  return c.redirect('/app/firma#stiahnut', 303)
})

appRoutes.get('/odovzdanie/:id', async (c) => {
  const who = c.get('who')
  const id = c.req.param('id')
  const paper = ID.test(id) ? await getPaper(c.env.DB, who.company.id, id) : null
  const answer = paper?.kind === 'handover' ? await paperResponse(c.env.FILES, paper) : null
  return answer ?? c.notFound()
})

// ---------------------------------------------------------------------------------------------------------------
// Faktúry
// ---------------------------------------------------------------------------------------------------------------

const ti = t.invoices

function emptyLine(vatPayer: boolean): LineInput {
  return { description: '', quantity: '1', unit: 'ks', price: '', vat: vatPayer ? '23' : '0' }
}

/** The account an invoice is paid to: the one set for invoices, else the company's account we know. */
async function invoiceIban(db: D1Database, company: Company): Promise<string> {
  if (company.invoiceIban) return groupIban(company.invoiceIban)
  const row = await db.prepare('SELECT iban FROM accounts WHERE company_id = ? ORDER BY rowid LIMIT 1').bind(company.id).first<{ iban: string }>()
  return row ? groupIban(row.iban) : ''
}

function invoiceValuesFrom(body: Record<string, unknown>, vatPayer: boolean): InvoiceValues {
  const text = (name: string, max: number) => (typeof body[name] === 'string' ? (body[name] as string).trim().slice(0, max) : '')
  const rows = Math.min(Math.max(Number.parseInt(text('riadky', 3), 10) || 3, 1), 30)
  return {
    customerName: text('meno', 200),
    customerAddress: text('adresa', 300),
    customerIco: text('ico', 12),
    customerDic: text('dic', 12),
    customerIcdph: text('icdph', 14),
    customerEmail: text('email', 200),
    issued: text('vystavena', 16),
    delivered: text('dodana', 16),
    due: text('splatna', 16),
    iban: text('iban', 42),
    note: typeof body.poznamka === 'string' ? body.poznamka.replace(/\r\n?/g, '\n').trim().slice(0, 1000) : '',
    ...(ID.test(text('dobropis', 64)) ? { corrects: text('dobropis', 64), reason: typeof body.dovod === 'string' ? body.dovod.replace(/\s+/g, ' ').trim().slice(0, 500) : '' } : {}),
    // How it is taxed: a VAT payer's choice, Slovak VAT otherwise.
    mode: vatPayer && isInvoiceMode(text('rezim', 20)) ? (text('rezim', 20) as InvoiceMode) : 'domestic',
    reverseKind: text('ptp_druh', 8),
    reverseCode: text('ptp_kod', 8),
    ...(text('druh', 12) === 'zalohova' ? { proforma: true } : {}),
    ...(ID.test(text('vyuctovanie', 64)) ? { relates: text('vyuctovanie', 64) } : {}),
    currency: isInvoiceCurrency(text('mena', 3)) ? text('mena', 3) : 'EUR',
    customerCountry: isCountry(text('stat', 2)) ? text('stat', 2) : '',
    center: ID.test(text('stredisko', 64)) ? text('stredisko', 64) : '',
    rate: text('kurz', 16),
    lines: Array.from({ length: rows }, (_, i) => ({
      description: text(`r${i}-popis`, 300),
      quantity: text(`r${i}-mnozstvo`, 10),
      unit: text(`r${i}-jednotka`, 8),
      price: text(`r${i}-cena`, 14),
      vat: text(`r${i}-dph`, 3) || (vatPayer ? '23' : '0'),
    })),
  }
}

function previewLines(values: InvoiceValues, vatPayer: boolean): Line[] {
  // What the sums show while a form is filled: every line that can be read.
  const readable = { ...values, lines: values.lines.filter((l) => l.description.trim() !== '' || l.price.trim() !== '') }
  return readable.lines.flatMap((line) => linesOf({ ...readable, lines: [line] }, vatPayer, { line: () => 'x', none: 'x' }).lines)
}

async function invoiceForm(
  c: Ctx,
  id: string | null,
  values: InvoiceValues,
  errors: InvoiceErrors = {},
  status: ContentfulStatusCode = 200,
  found: string | null = null,
  recent: { id: string; name: string }[] = [],
) {
  const who = c.get('who')
  // A credit note shows the invoice it corrects; a final invoice the request and the advances it deducts.
  const original = values.corrects ? await getInvoice(c.env.DB, who.company.id, values.corrects) : null
  const credit = original?.number ? { number: original.number, issuedOn: original.issuedOn } : null
  const request = values.relates ? await requestOf(c.env.DB, who.company.id, values.relates) : null
  const final = request?.number ? { number: request.number, advances: (await advancesOf(c.env.DB, who.company.id, request.id)).map((a) => ({ number: a.number, totalCents: a.totalCents })) } : null
  const title = credit ? ti.form.creditTitle(credit.number) : final ? ti.form.finalTitle(final.number) : values.proforma ? ti.form.proformaTitle : id ? ti.form.editTitle : ti.form.title
  return shell(
    c,
    'invoices',
    title,
    <InvoiceFormPage
      id={id}
      values={values}
      vatPayer={who.company.vatPayer}
      errors={errors}
      found={found}
      preview={previewLines(values, who.company.vatPayer)}
      recent={recent}
      credit={credit}
      final={final}
      title={title}
      centers={await listCenters(c.env.DB, who.company.id)}
    />,
    status,
  )
}

/** An issued request for an advance of the company, which a final invoice or an advance's tax document belongs to. */
async function requestOf(db: D1Database, company: string, id: string | undefined): Promise<StoredInvoice | null> {
  const request = id && ID.test(id) ? await getInvoice(db, company, id) : null
  return request && request.status === 'issued' && request.kind === 'proforma' && request.number && request.vs ? request : null
}

/**
 * The issued invoice a credit note may be made to: an invoice of this company (a final invoice too), not a credit
 * note, a request or an advance's tax document.
 */
async function creditable(db: D1Database, company: string, id: string | undefined): Promise<StoredInvoice | null> {
  const original = id && ID.test(id) ? await getInvoice(db, company, id) : null
  return original && original.status === 'issued' && original.kind === 'invoice' && original.number ? original : null
}

/** The lines of a stored invoice as the form shows them, with an empty one to go on. */
function inputLines(lines: Line[], vatPayer: boolean): LineInput[] {
  // An advance's lines and their deductions are made by the app, never typed again.
  return [
    ...lines.filter((l) => typeof l.vatCents !== 'number').map((l) => ({
      description: l.description,
      quantity: String(l.quantityMilli / 1000).replace('.', ','),
      unit: l.unit ?? 'ks',
      price: `${(l.unitCents / 100).toFixed(2).replace('.', ',')}`,
      vat: String(l.vatRate),
    })),
    emptyLine(vatPayer),
  ]
}

/** The customers of the company's latest invoices, each once, for a new invoice to start from. */
async function recentCustomers(db: D1Database, company: string): Promise<{ id: string; name: string }[]> {
  const rows = await db
    .prepare("SELECT id, customer_name FROM invoices WHERE company_id = ? AND status = 'issued' ORDER BY created_at DESC LIMIT 40")
    .bind(company)
    .all<{ id: string; customer_name: string }>()
  const seen = new Set<string>()
  const recent: { id: string; name: string }[] = []
  for (const row of rows.results) {
    const key = row.customer_name.toLocaleLowerCase('sk').replace(/\s+/g, ' ').trim()
    if (seen.has(key)) continue
    seen.add(key)
    recent.push({ id: row.id, name: row.customer_name })
    if (recent.length === 6) break
  }
  return recent
}

async function invoicesPage(c: Ctx, status: ContentfulStatusCode = 200) {
  const who = c.get('who')
  const invoices = await listInvoices(c.env.DB, who.company.id)
  const closed = serviceOpen(who.company, today()) ? null : t.ending.noInvoices(dayName(who.company.endsOn ?? today()))
  return shell(
    c,
    'invoices',
    ti.title,
    <InvoicesPage
      invoices={invoices}
      today={today()}
      flash={flashOf(c)}
      closed={closed}
      repeats={await repeatsOf(c.env.DB, who.company.id)}
      dunning={closed ? null : { on: who.company.dunning, owner: who.role === 'owner' }}
    />,
    status,
  )
}

appRoutes.get('/faktury', (c) => invoicesPage(c))

appRoutes.get('/faktury/nova', async (c) => {
  const who = c.get('who')
  const day = today()
  if (!serviceOpen(who.company, day)) return invoicesPage(c, 409)
  const due = new Date(`${day}T12:00:00Z`)
  due.setUTCDate(due.getUTCDate() + who.company.invoiceDueDays)
  const values: InvoiceValues = {
    customerName: '',
    customerAddress: '',
    customerIco: '',
    customerDic: '',
    customerIcdph: '',
    customerEmail: '',
    issued: textDay(day),
    delivered: textDay(day),
    due: textDay(due.toISOString().slice(0, 10)),
    iban: await invoiceIban(c.env.DB, who.company),
    note: '',
    lines: [emptyLine(who.company.vatPayer), emptyLine(who.company.vatPayer), emptyLine(who.company.vatPayer)],
  }
  if (c.req.query('zalohova') === '1') values.proforma = true
  // A final invoice starts from its request for an advance: its customer and lines; the advances go off it when issued.
  const request = await requestOf(c.env.DB, who.company.id, c.req.query('vyuctovanie'))
  const done = request ? await finalOf(c.env.DB, who.company.id, request.id) : null
  if (done) return c.redirect(`/app/faktury/${done.id}`, 303)
  if (request) {
    values.customerName = request.customerName
    values.customerAddress = request.customerAddress ?? ''
    values.customerIco = request.customerIco ?? ''
    values.customerDic = request.customerDic ?? ''
    values.customerIcdph = request.customerIcdph ?? ''
    values.customerCountry = request.customerCountry ?? ''
    values.customerEmail = request.customerEmail ?? ''
    values.note = request.note ?? ''
    values.mode = request.mode
    values.reverseKind = request.reverse?.kind ?? ''
    values.reverseCode = request.reverse?.code ?? ''
    values.relates = request.id
    values.center = await centreInUse(c.env.DB, who.company.id, request.centerId)
    values.lines = inputLines(await invoiceLines(c.env.DB, request.id), who.company.vatPayer)
    return invoiceForm(c, null, values)
  }
  // A credit note starts from the invoice it corrects: its customer and its lines, as what it may be lowered by.
  const original = await creditable(c.env.DB, who.company.id, c.req.query('dobropis'))
  if (original) {
    values.customerName = original.customerName
    values.customerAddress = original.customerAddress ?? ''
    values.customerIco = original.customerIco ?? ''
    values.customerDic = original.customerDic ?? ''
    values.customerIcdph = original.customerIcdph ?? ''
    values.customerCountry = original.customerCountry ?? ''
    values.customerEmail = original.customerEmail ?? ''
    values.delivered = textDay(original.deliveredOn)
    values.iban = ''
    values.corrects = original.id
    values.reason = ''
    values.mode = original.mode
    values.reverseKind = original.reverse?.kind ?? ''
    values.reverseCode = original.reverse?.code ?? ''
    values.currency = original.currency
    values.rate = original.fxRate ?? ''
    values.lines = inputLines(await invoiceLines(c.env.DB, original.id), who.company.vatPayer)
    return invoiceForm(c, null, values)
  }
  // "Vystaviť podobnú" starts from an earlier invoice of the company, its customer and its lines; a customer of an
  // earlier invoice starts from that customer alone. The days are today's, as on any new invoice.
  let like = c.req.query('podla') ?? ''
  const from = like || (c.req.query('odberatel') ?? '')
  const earlier = ID.test(from) ? await getInvoice(c.env.DB, who.company.id, from) : null
  // An invoice of late interest is made from its invoice paid late (/urok), never copied: only its customer is taken.
  if (earlier?.interestOf) like = ''
  if (earlier) {
    values.customerName = earlier.customerName
    values.customerAddress = earlier.customerAddress ?? ''
    values.customerIco = earlier.customerIco ?? ''
    values.customerDic = earlier.customerDic ?? ''
    values.customerIcdph = earlier.customerIcdph ?? ''
    values.customerCountry = earlier.customerCountry ?? ''
    values.customerEmail = earlier.customerEmail ?? ''
    if (like) {
      values.note = earlier.note ?? ''
      values.mode = earlier.mode
      values.reverseKind = earlier.reverse?.kind ?? ''
      values.reverseCode = earlier.reverse?.code ?? ''
      values.currency = earlier.currency
      values.center = await centreInUse(c.env.DB, who.company.id, earlier.centerId)
      values.lines = inputLines(await invoiceLines(c.env.DB, earlier.id), who.company.vatPayer)
    }
  }
  return invoiceForm(c, null, values, {}, 200, null, earlier ? [] : await recentCustomers(c.env.DB, who.company.id))
})

/** A centre a new invoice may start from: the one given while it is in use, else none (an archived one takes no new invoice). */
async function centreInUse(db: D1Database, company: string, center: string | null | undefined): Promise<string> {
  if (!center) return ''
  const row = await db.prepare('SELECT 1 FROM cost_centers WHERE id = ? AND company_id = ? AND archived_at IS NULL').bind(center, company).first()
  return row ? center : ''
}

/** A new invoice, or a draft saved again: looked up in the register, a line added, kept as a draft, or issued. */
async function saveInvoice(c: Ctx, draftId: string | null) {
  const who = c.get('who')
  const db = c.env.DB
  const body = await c.req.parseBody()
  const vatPayer = who.company.vatPayer
  const values = invoiceValuesFrom(body, vatPayer)
  const action = typeof body.akcia === 'string' ? body.akcia : 'koncept'
  // After the contract's last day a draft can only be thrown away: nothing new is issued or kept here.
  if (!serviceOpen(who.company, today()) && !(action === 'zahodit' && draftId)) return invoicesPage(c, 409)
  if (action === 'zahodit' && draftId) {
    await db.batch([
      db.prepare("DELETE FROM invoice_lines WHERE invoice_id = ? AND EXISTS (SELECT 1 FROM invoices WHERE id = ? AND company_id = ? AND status = 'draft')").bind(draftId, draftId, who.company.id),
      db.prepare("DELETE FROM invoices WHERE id = ? AND company_id = ? AND status = 'draft'").bind(draftId, who.company.id),
      eventStatement(db, { company: who.company.id, user: who.user.id, action: 'invoice.draft.deleted', subject: draftId }),
    ])
    return c.redirect('/app/faktury?ok=koncept-zahodeny', 303)
  }
  if (action === 'riadok') {
    values.lines.push(emptyLine(vatPayer))
    return invoiceForm(c, draftId, values)
  }
  if (action === 'register') {
    const ico = normalizeIco(values.customerIco)
    if (!ico) return invoiceForm(c, draftId, values, { customerIco: ti.errors.customerIco }, 422)
    const answer = await lookupCompany(ico)
    if ('found' in answer && answer.found) {
      values.customerIco = ico
      values.customerName = answer.found.name
      values.customerAddress = answer.found.address ?? values.customerAddress
      return invoiceForm(c, draftId, values, {}, 200, `${ti.form.found} ${answer.found.name}`)
    }
    return invoiceForm(c, draftId, values, {}, 200, ti.form.notFound)
  }
  const issue = action === 'vystavit'
  // A credit note is made to an issued invoice of the company and takes its customer from it, whatever is posted.
  const original = values.corrects ? await creditable(db, who.company.id, values.corrects) : null
  if (values.corrects && !original) return invoiceForm(c, draftId, { ...values, corrects: undefined }, { form: ti.errors.creditOf }, 422)
  if (original) {
    values.customerName = original.customerName
    values.customerAddress = original.customerAddress ?? ''
    values.customerIco = original.customerIco ?? ''
    values.customerDic = original.customerDic ?? ''
    values.customerIcdph = original.customerIcdph ?? ''
    values.customerCountry = original.customerCountry ?? ''
    values.iban = ''
    // A credit note is taxed as the invoice it corrects, in its currency and at its rate (§ 25: the rate of the supply).
    values.currency = original.currency
    values.rate = original.fxRate ?? ''
    values.mode = original.mode
    values.reverseKind = original.reverse?.kind ?? ''
    values.reverseCode = original.reverse?.code ?? ''
  }
  const errors = checkValues(values, dayOfText, { ...ti.errors, lines: ti.errors.lines, form: ti.errors.form })
  const read = linesOf(values, vatPayer, { line: ti.errors.line, none: ti.errors.lines })
  const error = read.error
  // What a credit note's form says is what the invoice is lowered by: kept with the minus.
  const lines = original ? creditLines(read.lines) : read.lines
  if (error && (issue || error !== ti.errors.lines)) errors.lines = error
  let totals = totalsOf(lines, vatPayer)
  if (issue && !errors.lines && (original ? totals.total >= 0 : totals.total <= 0)) errors.lines = ti.errors.lines
  if (original && issue && !values.reason) errors.reason = ti.errors.reason
  // A payment before a supply without Slovak VAT is no tax point, and its documents are not built yet: a request for an
  // advance is made for a supply with Slovak VAT (or by a company that is no VAT payer).
  if (values.proforma && !original && vatPayer && (values.mode ?? 'domestic') !== 'domestic') errors.form = ti.errors.proformaMode
  if (original && !errors.lines) {
    const over = creditTooMuch(creditLeft(await invoiceLines(db, original.id), await creditedLines(db, who.company.id, original.id, draftId), vatPayer), lines, vatPayer)
    if (over) errors.lines = ti.errors.creditTooMuch(over.rate, formatEurExact(over.left))
  }
  // A final invoice belongs to an issued request for an advance; issued, it deducts every advance received on it.
  const request = values.relates ? await requestOf(db, who.company.id, values.relates) : null
  if (values.relates && !request) return invoiceForm(c, draftId, { ...values, relates: undefined }, { form: ti.errors.finalOf }, 422)
  if (request && issue && (await finalOf(db, who.company.id, request.id))) return invoiceForm(c, draftId, values, { form: ti.errors.finalDone }, 409)
  // Money on the request that pairing has not given its tax document yet gets it now: after the final invoice none is
  // made, and the final invoice deducts only what has one.
  if (request && issue && !errors.lines) await issueAdvances(db, who.company, request, who.user.id, 'auto')
  const deductions = request && issue ? deductionLines(await advancesOf(db, who.company.id, request.id), lines.length + 1, ti.form.deduction) : []
  const advanceCents = -deductions.reduce((sum, line) => sum + line.baseCents, 0)
  if (deductions.length > 0) {
    lines.push(...deductions)
    totals = totalsOf(lines, vatPayer)
    if (!errors.lines && totals.total < 0) errors.lines = ti.errors.finalTooMuch
  }
  // In another currency: the rate typed, a credit note's invoice's, or the ECB's of the day before the supply (§ 26).
  const currency = values.currency ?? 'EUR'
  const supplied = dayOfText(values.delivered) || dayOfText(values.issued) || today()
  let fx: { currency: string; rate: string | null; day: string | null } | null = null
  if (currency !== 'EUR') {
    const typed = rateMicro(values.rate)
    if ((values.proforma || request) && !original) errors.form = ti.errors.currencyAdvance
    else if (original?.fxRate) fx = { currency, rate: original.fxRate, day: original.fxDay }
    else if ((values.rate ?? '').trim() !== '' && !typed) errors.rate = ti.errors.rate
    else if (typed) fx = { currency, rate: rateText(typed), day: null }
    else {
      const found = rateFor(await ratesFor(db, [currency]), currency, supplied, 'before')
      if (found) fx = { currency, rate: rateText(found.rate), day: found.day }
      else if (issue) errors.rate = ti.errors.rateUnknown
      else fx = { currency, rate: null, day: null }
    }
  }
  // A cost centre archived since (a draft's, or one shown again after an error) takes no new invoice: said, not dropped.
  if (values.center) {
    const centre = await db.prepare('SELECT archived_at FROM cost_centers WHERE id = ? AND company_id = ?').bind(values.center, who.company.id).first<{ archived_at: number | null }>()
    if (!centre || centre.archived_at !== null) errors.center = ti.errors.center
  }
  // A draft needs only somebody to be issued to; an invoice needs everything.
  const blocking = issue ? errors : { customerName: errors.customerName, lines: errors.lines, rate: errors.rate, center: errors.center }
  if (Object.values(blocking).some(Boolean)) return invoiceForm(c, draftId, values, issue ? errors : blocking, 422)
  const issued = dayOfText(values.issued) || today()
  const delivered = dayOfText(values.delivered) || issued
  const due = dayOfText(values.due) || issued
  const id = draftId ?? crypto.randomUUID()
  const documentId = crypto.randomUUID()
  try {
    await db.batch([
      ...saveInvoiceStatements(db, {
        id,
        company: who.company.id,
        user: who.user.id,
        issue,
        values,
        lines,
        totals,
        issued,
        delivered,
        due,
        token: newToken(),
        iban: values.iban ? plainIban(values.iban) : null,
        documentId,
        credit: original ? { corrects: original.id, number: original.number, reason: values.reason ?? '' } : null,
        // A credit note of an invoice of late interest takes the interest back (644) and says why it carries no VAT.
        interestOf: original?.interestOf ?? null,
        kind: values.proforma && !original && !request ? 'proforma' : null,
        relates: request?.id ?? null,
        advanceCents,
        fx,
      }),
      eventStatement(db, { company: who.company.id, user: who.user.id, action: issue ? (original ? 'invoice.credited' : 'invoice.issued') : 'invoice.draft', subject: id, detail: { total: totals.total, ...(original ? { corrects: original.id } : {}) } }),
    ])
  } catch (err) {
    console.error('an invoice failed', err instanceof Error ? err.name : 'error')
    return invoiceForm(c, draftId, values, { form: ti.errors.form }, 409)
  }
  if (issue)
    later(
      c,
      (async () => {
        await afterReading(db, who.company.id, documentId)
        await matchCompany(db, who.company.id)
      })(),
    )
  return c.redirect(`/app/faktury/${id}?ok=${issue ? 'vystavena' : 'koncept'}`, 303)
}

/**
 * The tax documents of advances received on a request (§ 73: within 15 days of the payment; for a company that is
 * no VAT payer, the document of the money received): one for each payment on its variable symbol that has none, its
 * amount split by the request's rates, dated today, the payment's day as the day it was received, linked to it.
 */
appRoutes.post('/faktury/:id/zaloha', async (c) => {
  const who = c.get('who')
  const db = c.env.DB
  const request = await requestOf(db, who.company.id, c.req.param('id'))
  if (!request || !request.vs) return shell(c, 'invoices', t.errors.notFound, <Missing />, 404)
  if (!serviceOpen(who.company, today())) return invoicesPage(c, 409)
  const made = await issueAdvances(db, who.company, request, who.user.id, 'client')
  for (const done of made) later(c, afterReading(db, who.company.id, done.documentId))
  later(c, flushOutbox(db, c.env.EMAIL))
  return c.redirect(`/app/faktury/${request.id}${made.length > 0 ? '?ok=zaloha' : ''}`, 303)
})

/** Makes an issued invoice repeat: how often, its next day (today or later), its last day, and whether it is mailed. */
appRoutes.post('/faktury/:id/opakovat', async (c) => {
  const who = c.get('who')
  const db = c.env.DB
  const id = c.req.param('id')
  const invoice = ID.test(id) ? await getInvoice(db, who.company.id, id) : null
  if (!invoice || !mayRepeat(invoice)) return shell(c, 'invoices', t.errors.notFound, <Missing />, 404)
  if (!serviceOpen(who.company, today())) return invoicesPage(c, 409)
  const body = await c.req.parseBody()
  const every = isRepeatEvery(body.kazdych) ? (Number(body.kazdych) as RepeatEvery) : null
  const next = dayOfText(typeof body.od === 'string' ? body.od : '')
  const untilText = typeof body.do === 'string' ? body.do.trim() : ''
  const until = untilText ? dayOfText(untilText) : null
  const fail = (error: string) => invoicePage(c, id, { error }, 422)
  if (!every || !next || next < today()) return fail(ti.actions.repeatBadDay)
  if (untilText && (!until || until < next)) return fail(ti.actions.repeatBadUntil)
  try {
    await db.batch(startRepeatStatements(db, { id: crypto.randomUUID(), company: who.company.id, template: invoice.id, every, nextOn: next, untilOn: until, send: body.poslat === '1', user: who.user.id }))
  } catch (err) {
    // It repeats already (a second click): nothing more is started.
    console.error('a repeat failed', err instanceof Error ? err.name : 'error')
  }
  return c.redirect(`/app/faktury/${invoice.id}?ok=opakovanie`, 303)
})

appRoutes.post('/faktury/opakovanie/:id/zastavit', async (c) => {
  const who = c.get('who')
  const db = c.env.DB
  const id = c.req.param('id')
  const row = ID.test(id) ? await db.prepare('SELECT template_id FROM invoice_repeats WHERE id = ? AND company_id = ?').bind(id, who.company.id).first<{ template_id: string }>() : null
  if (!row) return shell(c, 'invoices', t.errors.notFound, <Missing />, 404)
  await db.batch(stopRepeatStatements(db, who.company.id, id, who.user.id, 'stopped'))
  return c.redirect(`/app/faktury/${row.template_id}?ok=opakovanie-zastavene`, 303)
})

appRoutes.post('/faktury', (c) => saveInvoice(c, null))

async function invoicePage(c: Ctx, id: string, extra: { error?: string } = {}, status: ContentfulStatusCode = 200) {
  const who = c.get('who')
  const db = c.env.DB
  const invoice = ID.test(id) ? await getInvoice(db, who.company.id, id) : null
  if (!invoice) return shell(c, 'invoices', t.errors.notFound, <Missing />, 404)
  const lines = await invoiceLines(db, invoice.id)
  if (invoice.status === 'draft') {
    const values: InvoiceValues = {
      customerName: invoice.customerName,
      customerAddress: invoice.customerAddress ?? '',
      customerIco: invoice.customerIco ?? '',
      customerDic: invoice.customerDic ?? '',
      customerIcdph: invoice.customerIcdph ?? '',
      customerCountry: invoice.customerCountry ?? '',
      center: invoice.centerId ?? '',
      customerEmail: invoice.customerEmail ?? '',
      issued: textDay(invoice.issuedOn),
      delivered: textDay(invoice.deliveredOn),
      due: textDay(invoice.dueOn),
      iban: invoice.iban ? groupIban(invoice.iban) : '',
      note: invoice.note ?? '',
      // A credit note's draft shows what the invoice is lowered by, without the minus it is kept with.
      lines: inputLines(invoice.kind === 'credit' ? creditLines(lines) : lines, who.company.vatPayer),
      ...(invoice.kind === 'credit' && invoice.corrects ? { corrects: invoice.corrects, reason: invoice.reason ?? '' } : {}),
      mode: invoice.mode,
      reverseKind: invoice.reverse?.kind ?? '',
      reverseCode: invoice.reverse?.code ?? '',
      ...(invoice.kind === 'proforma' ? { proforma: true } : {}),
      ...(invoice.kind === 'invoice' && invoice.relates ? { relates: invoice.relates } : {}),
      currency: invoice.currency,
      rate: invoice.fxDay ? '' : (invoice.fxRate ?? ''),
    }
    return invoiceForm(c, invoice.id, values, {}, status)
  }
  const advance =
    invoice.kind === 'proforma' && invoice.vs
      ? {
          payments: await advancePayments(db, who.company.id, invoice.vs),
          advances: (await advancesOf(db, who.company.id, invoice.id)).map((a) => ({ id: a.id, number: a.number, totalCents: a.totalCents })),
          final: await finalOf(db, who.company.id, invoice.id),
        }
      : null
  const credits =
    invoice.kind === 'invoice'
      ? (
          await db
            .prepare("SELECT id, number, total_cents FROM invoices WHERE company_id = ? AND corrects = ? AND kind = 'credit' AND status = 'issued' ORDER BY seq")
            .bind(who.company.id, invoice.id)
            .all<{ id: string; number: string | null; total_cents: number }>()
        ).results.map((r) => ({ id: r.id, number: r.number, totalCents: Number(r.total_cents) }))
      : []
  // A repeat: the one that runs, or the form with the next day a month on (kept to the invoice's day of the month).
  const repeat = mayRepeat(invoice)
    ? {
        running: await repeatOfInvoice(db, who.company.id, invoice.id),
        next: textDay(nextAfter(invoice.issuedOn, 1, Number(invoice.issuedOn.slice(8, 10)), today())),
        open: serviceOpen(who.company, today()),
      }
    : null
  const late = await lateOf(db, who.company.id, invoice, credits)
  return shell(
    c,
    'invoices',
    `${ti.sheet.kinds[invoice.kind] ?? ti.sheet.title} ${invoice.number}`,
    <InvoicePage invoice={invoice} lines={lines} seller={who.company} today={today()} link={`${siteOrigin(c)}/f/${invoice.token}`} flash={flashOf(c)} credits={credits} advance={advance} repeat={repeat} late={late} {...extra} />,
    status,
  )
}

/**
 * The late interest of an invoice paid late or still unpaid (dunning.ts): on what it asks for after its credit notes,
 * to the day it was paid or today, from the day after the last day an invoice of interest counted (interest is invoiced
 * once for each day); the invoices of interest issued for it already, and whether the flat compensation is still owed
 * (once, with the first). An invoice of interest a credit note took back whole counts for neither. Null for anything else.
 */
async function lateOf(db: D1Database, company: string, invoice: StoredInvoice, credits: { totalCents: number }[]): Promise<LateView | null> {
  if (invoice.kind !== 'invoice' || invoice.status !== 'issued' || invoice.interestOf || invoice.currency !== 'EUR' || !invoice.number) return null
  const principal = invoice.totalCents + credits.reduce((sum, c) => sum + c.totalCents, 0)
  const rows = (
    await db
      .prepare(
        `SELECT i.id, i.number, i.issued_on, i.interest_to,
           i.total_cents + COALESCE((SELECT SUM(c.total_cents) FROM invoices c WHERE c.company_id = i.company_id AND c.corrects = i.id AND c.kind = 'credit' AND c.status = 'issued'), 0) AS left_cents
         FROM invoices i WHERE i.company_id = ? AND i.interest_of = ? AND i.status = 'issued' AND i.kind = 'invoice'
         ORDER BY COALESCE(i.interest_to, i.issued_on), i.seq`,
      )
      .bind(company, invoice.id)
      .all<{ id: string; number: string; issued_on: string; interest_to: string | null; left_cents: number }>()
  ).results
  const standing = rows.filter((r) => Number(r.left_cents) > 0)
  const last = standing.at(-1)
  // An invoice of interest made before its last day was kept counted to the day it was issued.
  const since = last ? addDays(last.interest_to ?? last.issued_on, 1) : null
  const interest = principal > 0 ? lateInterest(principal, invoice.dueOn, invoice.paidOn ?? today(), since) : null
  if (!interest && rows.length === 0) return null
  return {
    interest,
    issued: rows.map((r) => ({ id: r.id, number: r.number, to: r.interest_to, cancelled: Number(r.left_cents) <= 0 })),
    flat: standing.length === 0,
    business: Boolean(invoice.customerIco || invoice.customerIcdph),
    principal,
  }
}

/** What a late invoice's interest would bill now: interest of days not billed yet, or the flat compensation still owed. */
const toBill = (late: LateView | null): late is LateView & { interest: NonNullable<LateView['interest']> } => Boolean(late?.interest && (late.interest.cents > 0 || late.flat))

/** An invoice of the late interest and the flat compensation of an invoice paid late, to a business customer. */
appRoutes.post('/faktury/:id/urok', async (c) => {
  const who = c.get('who')
  const db = c.env.DB
  const id = c.req.param('id')
  const invoice = ID.test(id) ? await getInvoice(db, who.company.id, id) : null
  if (!invoice) return shell(c, 'invoices', t.errors.notFound, <Missing />, 404)
  if (!serviceOpen(who.company, today())) return invoicesPage(c, 409)
  const credits = (
    await db.prepare("SELECT total_cents FROM invoices WHERE company_id = ? AND corrects = ? AND kind = 'credit' AND status = 'issued'").bind(who.company.id, invoice.id).all<{ total_cents: number }>()
  ).results.map((r) => ({ totalCents: Number(r.total_cents) }))
  const late = await lateOf(db, who.company.id, invoice, credits)
  // Nothing more to bill and an invoice of interest there (a second click): that one.
  const lastIssued = late?.issued.filter((i) => !i.cancelled).at(-1)
  if (!toBill(late) && lastIssued) return c.redirect(`/app/faktury/${lastIssued.id}`, 303)
  if (!toBill(late) || !late.business || !invoice.number) return invoicePage(c, invoice.id, { error: t.dunning.interestBusiness }, 422)
  const interest = late.interest
  const from = dayName(interest.from).replace(/\u00a0/g, ' ')
  const to = dayName(interest.to).replace(/\u00a0/g, ' ')
  const rates = [...new Set(interest.segments.map((s) => ratePercent(s.rate)))].join(', ')
  const vatPayer = who.company.vatPayer
  const lines: Line[] = [
    ...(interest.cents > 0 ? [{ position: 1, description: t.dunning.interestLine(invoice.number, from, to), quantityMilli: 1000, unit: 'ks', unitCents: interest.cents, vatRate: 0, baseCents: interest.cents }] : []),
    // The flat compensation once, with the first invoice of interest (§ 369c).
    ...(late.flat
      ? [{ position: interest.cents > 0 ? 2 : 1, description: t.dunning.flatLine(invoice.number), quantityMilli: 1000, unit: 'ks', unitCents: FLAT_COMPENSATION, vatRate: 0, baseCents: FLAT_COMPENSATION }]
      : []),
  ]
  const issued = today()
  const due = addDays(issued, who.company.invoiceDueDays)
  const values: InvoiceValues = {
    customerName: invoice.customerName,
    customerAddress: invoice.customerAddress ?? '',
    customerIco: invoice.customerIco ?? '',
    customerDic: invoice.customerDic ?? '',
    customerIcdph: invoice.customerIcdph ?? '',
    customerCountry: invoice.customerCountry ?? '',
    customerEmail: invoice.customerEmail ?? '',
    issued,
    delivered: issued,
    due,
    iban: invoice.iban ?? '',
    note: t.dunning.interestNote(rates, late.flat),
    lines: [],
    // Neither is a supply: outside VAT (O), said so on the sheet and in the e-invoice.
    mode: vatPayer ? 'outside' : 'domestic',
  }
  const newId = crypto.randomUUID()
  const documentId = crypto.randomUUID()
  try {
    await db.batch([
      ...saveInvoiceStatements(db, {
        id: newId,
        company: who.company.id,
        user: who.user.id,
        issue: true,
        values,
        lines,
        totals: totalsOf(lines, vatPayer),
        issued,
        delivered: issued,
        due,
        token: newToken(),
        iban: invoice.iban,
        documentId,
        interestOf: invoice.id,
        interestTo: interest.to,
      }),
      eventStatement(db, {
        company: who.company.id,
        user: who.user.id,
        action: 'invoice.interest',
        subject: newId,
        detail: { of: invoice.id, from: interest.from, to: interest.to, interest: interest.cents, flat: late.flat ? FLAT_COMPENSATION : 0 },
      }),
    ])
  } catch (err) {
    // Issued already to the same day (a second click at once): the one there is.
    console.error('an interest invoice failed', err instanceof Error ? err.name : 'error')
    const there = await lateOf(db, who.company.id, invoice, credits)
    const made = there?.issued.filter((i) => !i.cancelled).at(-1)
    if (made && !toBill(there)) return c.redirect(`/app/faktury/${made.id}`, 303)
    return invoicePage(c, invoice.id, { error: t.invoices.errors.form }, 409)
  }
  later(
    c,
    (async () => {
      await afterReading(db, who.company.id, documentId)
      await matchCompany(db, who.company.id)
    })(),
  )
  return c.redirect(`/app/faktury/${newId}?ok=urok`, 303)
})

/** An owner turns the reminders that go by themselves on or off. */
appRoutes.post('/faktury/upomienky', async (c) => {
  const who = c.get('who')
  if (who.role !== 'owner') return shell(c, 'invoices', t.errors.notFound, <Missing />, 403)
  const on = (await c.req.parseBody()).zapnut === '1'
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE companies SET dunning = ? WHERE id = ?').bind(on ? 1 : 0, who.company.id),
    eventStatement(c.env.DB, { company: who.company.id, user: who.user.id, action: on ? 'dunning.on' : 'dunning.off', subject: who.company.id }),
  ])
  return c.redirect(`/app/faktury?ok=${on ? 'upomienky-zapnute' : 'upomienky-vypnute'}`, 303)
})

/** The largest logo taken (512 kB): a picture for the head of an invoice. */
const LOGO_BYTES = 512 * 1024

/** A company's logo as a picture that runs nothing, or 404 without one. */
export async function logoResponse(files: R2Bucket | undefined, company: Company): Promise<Response> {
  const object = company.logoKey && files ? await files.get(company.logoKey) : null
  if (!object) return new Response('Not found', { status: 404 })
  return new Response(object.body, {
    headers: {
      'Content-Type': company.logoType ?? 'application/octet-stream',
      'Cache-Control': 'private, max-age=86400',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

/** The company's invoice numbers: the next number as it will be, and the form (owners). */
async function numberingPage(c: Ctx, extra: { values?: NumberingValues; errors?: { prefix?: string; from?: string }; logoError?: string } = {}, status: ContentfulStatusCode = 200) {
  const who = c.get('who')
  const year = today().slice(0, 4)
  const n = who.company.invoiceNumbering
  const last = await c.env.DB.prepare("SELECT COALESCE(MAX(seq), 0) + 1 AS next FROM invoices WHERE company_id = ? AND year = ? AND kind <> 'proforma'").bind(who.company.id, Number(year)).first<{ next: number }>()
  const next = Math.max(Number(last?.next ?? 1), n.fromYear === Number(year) && n.from ? n.from : 1)
  const order = String(next).padStart(n.digits, '0')
  return shell(
    c,
    'invoices',
    ti.numbering.title,
    <NumberingPage
      values={extra.values ?? { prefix: n.prefix, sep: n.sep, digits: String(n.digits), from: String(next) }}
      year={year}
      next={next}
      example={{ number: `${n.prefix}${year}${n.sep}${order}`, vs: `${year}${order}` }}
      owner={who.role === 'owner'}
      errors={extra.errors ?? {}}
      flash={c.req.query('ok') === 'cislovanie' ? ti.numbering.saved : c.req.query('ok') === 'logo' ? ti.numbering.logoSaved : c.req.query('ok') === 'logo-odstranene' ? ti.numbering.logoRemoved : null}
      logo={logoSrc(who.company, '/app/logo')}
      logoError={extra.logoError ?? null}
    />,
    status,
  )
}

appRoutes.get('/faktury/cislovanie', (c) => numberingPage(c))

/** A logo's picture as its bytes say: PNG, JPEG or WebP (no SVG: it could carry a script); null for anything else. */
export function logoTypeOf(bytes: Uint8Array): { type: string; ext: string } | null {
  if (bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return { type: 'image/png', ext: 'png' }
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { type: 'image/jpeg', ext: 'jpg' }
  if (bytes.length > 12 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP') return { type: 'image/webp', ext: 'webp' }
  return null
}

/** The company's logo for its invoices (owners): a new picture replaces the one before, which is deleted. */
appRoutes.post('/faktury/logo', async (c) => {
  const who = c.get('who')
  if (who.role !== 'owner') return shell(c, 'invoices', t.errors.notFound, <Missing />, 403)
  const body = await c.req.parseBody()
  const file = body.logo
  const bytes = file instanceof File ? new Uint8Array(await file.arrayBuffer()) : new Uint8Array()
  const kind = bytes.length > 0 && bytes.length <= LOGO_BYTES ? logoTypeOf(bytes) : null
  if (!kind || !c.env.FILES) return numberingPage(c, { logoError: ti.numbering.logoBad }, 422)
  const key = `companies/${who.company.id}/brand/logo-${crypto.randomUUID()}.${kind.ext}`
  await c.env.FILES.put(key, bytes, { httpMetadata: { contentType: kind.type } })
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE companies SET logo_key = ?, logo_type = ? WHERE id = ?').bind(key, kind.type, who.company.id),
    eventStatement(c.env.DB, { company: who.company.id, user: who.user.id, action: 'invoices.logo' }),
  ])
  if (who.company.logoKey) await c.env.FILES.delete(who.company.logoKey).catch(() => null)
  return c.redirect('/app/faktury/cislovanie?ok=logo#logo', 303)
})

appRoutes.post('/faktury/logo/odstranit', async (c) => {
  const who = c.get('who')
  if (who.role !== 'owner') return shell(c, 'invoices', t.errors.notFound, <Missing />, 403)
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE companies SET logo_key = NULL, logo_type = NULL WHERE id = ?').bind(who.company.id),
    eventStatement(c.env.DB, { company: who.company.id, user: who.user.id, action: 'invoices.logo.removed' }),
  ])
  if (who.company.logoKey && c.env.FILES) await c.env.FILES.delete(who.company.logoKey).catch(() => null)
  return c.redirect('/app/faktury/cislovanie?ok=logo-odstranene#logo', 303)
})

appRoutes.get('/logo', async (c) => logoResponse(c.env.FILES, c.get('who').company))

appRoutes.post('/faktury/cislovanie', async (c) => {
  const who = c.get('who')
  if (who.role !== 'owner') return shell(c, 'invoices', t.errors.notFound, <Missing />, 403)
  const body = await c.req.parseBody()
  const text = (name: string) => (typeof body[name] === 'string' ? (body[name] as string).trim() : '')
  const values: NumberingValues = { prefix: text('predpona').toUpperCase(), sep: text('oddelovac'), digits: text('cislice'), from: text('od').replace(/\s/g, '') }
  const digits = ['3', '4', '5', '6'].includes(values.digits) ? Number(values.digits) : 4
  const sep = values.sep === '-' || values.sep === '/' ? values.sep : ''
  const from = /^\d{1,6}$/.test(values.from) ? Number(values.from) : NaN
  const errors: { prefix?: string; from?: string } = {}
  if (!/^[A-Z0-9-]{0,8}$/.test(values.prefix)) errors.prefix = ti.numbering.errors.prefix
  if (!Number.isInteger(from) || from < 1 || from >= 10 ** digits) errors.from = ti.numbering.errors.from
  if (errors.prefix || errors.from) return numberingPage(c, { values, errors }, 422)
  await c.env.DB.batch([
    c.env.DB
      .prepare('UPDATE companies SET invoice_prefix = ?, invoice_sep = ?, invoice_digits = ?, invoice_from_year = ?, invoice_from = ? WHERE id = ?')
      .bind(values.prefix || null, sep || null, digits, Number(today().slice(0, 4)), from, who.company.id),
    eventStatement(c.env.DB, { company: who.company.id, user: who.user.id, action: 'invoices.numbering', detail: { prefix: values.prefix, sep, digits, from } }),
  ])
  return c.redirect('/app/faktury/cislovanie?ok=cislovanie', 303)
})

appRoutes.get('/faktury/:id', (c) => invoicePage(c, c.req.param('id')))

appRoutes.post('/faktury/:id', async (c) => {
  const who = c.get('who')
  const id = c.req.param('id')
  const draft = ID.test(id) ? await getInvoice(c.env.DB, who.company.id, id) : null
  if (!draft) return shell(c, 'invoices', t.errors.notFound, <Missing />, 404)
  if (draft.status !== 'draft') return c.redirect(`/app/faktury/${id}`, 303)
  return saveInvoice(c, id)
})

/** What an issued invoice still asks for: an invoice less its credit notes; anything else its total. */
async function stillAsked(db: D1Database, company: string, invoice: StoredInvoice): Promise<number> {
  if (invoice.kind !== 'invoice') return invoice.totalCents
  const row = await db
    .prepare("SELECT COALESCE(SUM(total_cents), 0) AS credited FROM invoices WHERE company_id = ? AND corrects = ? AND kind = 'credit' AND status = 'issued'")
    .bind(company, invoice.id)
    .first<{ credited: number }>()
  return invoice.totalCents + Number(row?.credited ?? 0)
}

/** Sends the invoice to its customer, or reminds them of it; a reply goes to the person who sent it. */
async function mailInvoice(c: Ctx, id: string, reminder: boolean) {
  const who = c.get('who')
  const db = c.env.DB
  const invoice = ID.test(id) ? await getInvoice(db, who.company.id, id) : null
  if (!invoice || invoice.status !== 'issued' || !invoice.number) return shell(c, 'invoices', t.errors.notFound, <Missing />, 404)
  // An invoice issued without the customer's email is sent to one typed beside it, which is kept with it.
  if (!invoice.customerEmail) {
    const body = await c.req.parseBody()
    const typed = typeof body.email === 'string' ? body.email.trim().slice(0, 200) : ''
    if (!EMAIL.test(typed)) return invoicePage(c, id, { error: ti.actions.badEmail }, 422)
    await db.prepare('UPDATE invoices SET customer_email = ? WHERE id = ? AND company_id = ? AND customer_email IS NULL').bind(typed, invoice.id, who.company.id).run()
    invoice.customerEmail = typed
  }
  // A paid invoice is never reminded, nor a credit note, an advance's document or a final invoice its advances paid; nor
  // an invoice its credit notes took back whole, nor a request whose final invoice is issued (that one asks now). A
  // reminder asks for what is left after the credit notes.
  const asked = reminder ? await stillAsked(db, who.company.id, invoice) : invoice.totalCents
  if (reminder && (['paid', 'credit'].includes(stateOf(invoice, today())) || asked <= 0 || (invoice.kind === 'proforma' && (await finalOf(db, who.company.id, invoice.id)))))
    return c.redirect(`/app/faktury/${invoice.id}`, 303)
  if (!(await withinLimit(db, 'invoice-mail', who.company.id, 30, 3600))) return invoicePage(c, id, { error: t.messages.throttle }, 429)
  const link = `${siteOrigin(c)}/f/${invoice.token}`
  const total = formatMoney(asked, invoice.currency).replace(/ /g, ' ')
  const due = dayName(invoice.dueOn).replace(/ /g, ' ')
  const iban = invoice.iban ? groupIban(invoice.iban) : null
  await db.batch([
    queueStatement(db, {
      key: `invoice:${reminder ? 'remind' : 'send'}:${invoice.id}:${now()}`,
      to: invoice.customerEmail,
      replyTo: who.user.email,
      subject:
        reminder
          ? ti.mail.reminderSubject(invoice.number, who.company.name, invoice.kind === 'proforma')
          : invoice.kind === 'proforma'
            ? ti.mail.proformaSubject(invoice.number, who.company.name)
            : invoice.kind === 'credit'
              ? ti.mail.creditSubject(invoice.number, who.company.name)
              : invoice.kind === 'advance'
                ? ti.mail.advanceSubject(invoice.number, who.company.name, who.company.vatPayer)
                : ti.mail.subject(invoice.number, who.company.name),
      body: reminder
        ? ti.mail.reminderBody(who.company.name, invoice.number, total, due, iban, link, invoice.kind === 'proforma', invoice.vs ?? invoice.number, asked !== invoice.totalCents)
        : invoice.kind === 'proforma'
          ? ti.mail.proformaBody(who.company.name, invoice.number, invoice.vs ?? '', total, due, iban, link)
          : invoice.kind === 'credit'
            ? ti.mail.creditBody(who.company.name, invoice.number, invoice.correctsNumber ?? '', total, link, invoice.reason)
            : invoice.kind === 'advance'
              ? ti.mail.advanceBody(who.company.name, invoice.number, invoice.relatesNumber ?? '', total, dayName(invoice.deliveredOn).replace(/\u00a0/g, ' '), link, who.company.vatPayer)
              : ti.mail.body(who.company.name, invoice.number, total, due, iban, link, invoice.note, invoice.vs ?? invoice.number),
    }),
    db.prepare(`UPDATE invoices SET ${reminder ? 'reminded_at' : 'sent_at'} = ? WHERE id = ? AND company_id = ?`).bind(now(), invoice.id, who.company.id),
    eventStatement(db, { company: who.company.id, user: who.user.id, action: reminder ? 'invoice.reminded' : 'invoice.sent', subject: invoice.id }),
  ])
  later(c, flushOutbox(db, c.env.EMAIL))
  return c.redirect(`/app/faktury/${invoice.id}?ok=${reminder ? 'pripomenuta' : 'poslana'}`, 303)
}

appRoutes.post('/faktury/:id/poslat', (c) => mailInvoice(c, c.req.param('id'), false))
appRoutes.post('/faktury/:id/pripomenut', (c) => mailInvoice(c, c.req.param('id'), true))

appRoutes.get('/faktury/:id/xml', async (c) => {
  const who = c.get('who')
  const id = c.req.param('id')
  const invoice = ID.test(id) ? await getInvoice(c.env.DB, who.company.id, id) : null
  // A request for an advance is no invoice: it has no e-invoice.
  if (!invoice || invoice.status !== 'issued' || invoice.kind === 'proforma') return shell(c, 'invoices', t.errors.notFound, <Missing />, 404)
  return xmlResponse(invoice, await invoiceLines(c.env.DB, invoice.id), who.company)
})

export function xmlResponse(invoice: StoredInvoice, lines: Line[], seller: Company): Response {
  return new Response(ublOf(invoice, lines, seller), {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Content-Disposition': `attachment; filename="${invoice.kind === 'credit' ? 'dobropis' : invoice.kind === 'advance' ? 'zaloha' : 'faktura'}-${invoice.number ?? 'koncept'}.xml"`,
      'Cache-Control': 'private, no-store',
    },
  })
}

appRoutes.route('/podania', clientFilingRoutes)
appRoutes.route('/mzdove-podania', clientPayrollReportRoutes)
appRoutes.notFound((c) => (c.get('who') ? shell(c, null, t.errors.notFound, <Missing />, 404) : c.redirect('/app/prihlasenie', 303)))

// ---------------------------------------------------------------------------------------------------------------
// The schedule
// ---------------------------------------------------------------------------------------------------------------

/**
 * Invoices whose repeat has come: issued (repeat.ts), paired with a payment that came already, and mailed to the
 * customer when the repeat says so, as "Poslať odberateľovi" mails them (the reply goes to who started the repeat).
 */
async function repeatScheduled(env: AppBindings, day: string): Promise<void> {
  const db = env.DB
  for (const done of await issueRepeats(db, day)) {
    try {
      await afterReading(db, done.company.id, done.documentId)
      await matchCompany(db, done.company.id)
      const invoice = await getInvoice(db, done.company.id, done.invoiceId)
      if (!done.repeat.send || !invoice?.customerEmail || !invoice.number) continue
      const by = done.repeat.createdBy ? await db.prepare('SELECT email FROM users WHERE id = ?').bind(done.repeat.createdBy).first<{ email: string }>() : null
      const total = formatMoney(invoice.totalCents, invoice.currency).replace(/\u00a0/g, ' ')
      const due = dayName(invoice.dueOn).replace(/\u00a0/g, ' ')
      await db.batch([
        queueStatement(db, {
          key: `invoice:send:${invoice.id}:repeat`,
          to: invoice.customerEmail,
          replyTo: by?.email ?? null,
          subject: ti.mail.subject(invoice.number, done.company.name),
          body: ti.mail.body(done.company.name, invoice.number, total, due, invoice.iban ? groupIban(invoice.iban) : null, `${BRAND.origin}/f/${invoice.token}`, invoice.note, invoice.vs ?? invoice.number),
        }),
        db.prepare('UPDATE invoices SET sent_at = ? WHERE id = ? AND company_id = ?').bind(now(), invoice.id, done.company.id),
        eventStatement(db, { company: done.company.id, user: null, action: 'invoice.sent', subject: invoice.id, detail: { repeat: done.repeat.id } }),
      ])
    } catch (err) {
      console.error('after a repeated invoice', err instanceof Error ? err.name : 'error')
    }
  }
  await flushOutbox(db, env.EMAIL)
}

/**
 * Reminders that go by themselves (dunning.ts): from nine in Bratislava, each overdue invoice of a company that turned
 * them on, sent to its customer by email before, gets its next reminder when its day has come (3, 14 and 30 days after
 * the due day, none within five days of the invoice mailed or another reminder, one sent by hand too); each step once
 * (the outbox key and the count). Only an invoice nobody paid, that asks for something after its credit notes (and for
 * what it asks), with no money on its symbol a person still has to pair, of a request without its final invoice, and
 * only once the company's bank (a statement, a payment, a linked bank read) reaches the day before the step's day: a
 * payment the bank has not told us of yet is no reason to remind. The query asks all of it, so a hundred invoices that
 * are not due cannot keep the ones that are from their turn.
 */
async function dunningScheduled(env: AppBindings, day: string): Promise<void> {
  const db = env.DB
  const after = (n: number) => `CASE i.reminders WHEN 0 THEN ${REMIND_AFTER[0] - n} WHEN 1 THEN ${REMIND_AFTER[1] - n} ELSE ${REMIND_AFTER[2] - n} END`
  const rows = await db
    .prepare(
      `SELECT i.id, i.company_id FROM invoices i JOIN companies c ON c.id = i.company_id
        WHERE c.dunning = 1 AND c.demo = 0 AND c.purged_at IS NULL AND c.closed_at IS NULL
          AND i.status = 'issued' AND i.kind IN ('invoice', 'proforma') AND i.interest_of IS NULL
          AND i.customer_email IS NOT NULL AND i.sent_at IS NOT NULL AND i.reminders < 3
          AND i.due_on <= date(?1, '-' || (${after(0)}) || ' days')
          AND date(max(i.sent_at, COALESCE(i.reminded_at, 0)), 'unixepoch') <= date(?1, '-5 days')
          AND (CASE WHEN i.kind = 'proforma'
                 THEN NOT EXISTS (SELECT 1 FROM payments p WHERE ${ON_REQUEST_SQL})
                   AND NOT EXISTS (SELECT 1 FROM invoices f WHERE f.company_id = i.company_id AND f.relates = i.id AND f.kind = 'invoice' AND f.status = 'issued')
                 ELSE i.total_cents <> 0
                   AND NOT EXISTS (SELECT 1 FROM links l WHERE l.document_id = i.document_id)
                   AND NOT EXISTS (SELECT 1 FROM ledger_entries ce WHERE ce.document_id = i.document_id AND ce.kind = 'cash' AND ce.deleted_at IS NULL)
                   AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.company_id = i.company_id AND p.amount_cents > 0 AND p.booked_on >= i.issued_on
                     AND ltrim(p.vs, '0') = ltrim(COALESCE(i.vs, i.number), '0') AND NOT EXISTS (SELECT 1 FROM links pl WHERE pl.payment_id = p.id))
               END)
          AND i.total_cents + COALESCE((SELECT SUM(cr.total_cents) FROM invoices cr WHERE cr.company_id = i.company_id AND cr.corrects = i.id AND cr.kind = 'credit' AND cr.status = 'issued'), 0) > 0
          AND (SELECT max(COALESCE((SELECT MAX(p.booked_on) FROM payments p WHERE p.company_id = i.company_id), ''),
                          COALESCE((SELECT MAX(s.to_on) FROM statements s WHERE s.company_id = i.company_id AND s.status IN ('taken', 'known')), ''),
                          COALESCE((SELECT date(MAX(b.synced_at), 'unixepoch') FROM bank_links b WHERE b.company_id = i.company_id AND b.status = 'active'), '')))
              >= date(i.due_on, '+' || (${after(1)}) || ' days')
        ORDER BY i.due_on LIMIT 100`,
    )
    .bind(day)
    .all<{ id: string; company_id: string }>()
  const companies = new Map<string, Company | null>()
  for (const row of rows.results) {
    try {
      if (!companies.has(row.company_id)) companies.set(row.company_id, await getCompany(db, row.company_id))
      const company = companies.get(row.company_id)
      const invoice = company ? await getInvoice(db, company.id, row.id) : null
      if (!company || !invoice?.number || !invoice.customerEmail || !serviceOpen(company, day) || stateOf(invoice, day) !== 'overdue') continue
      const contact = Math.max(invoice.sentAt ?? 0, invoice.remindedAt ?? 0)
      const step = reminderDue(invoice.dueOn, invoice.reminders, day, contact > 0 ? bratislava(contact * 1000).day : null)
      if (step === null) continue
      const asked = await stillAsked(db, company.id, invoice)
      if (asked <= 0) continue
      const from = invoice.createdBy ? await db.prepare('SELECT email FROM users WHERE id = ?').bind(invoice.createdBy).first<{ email: string }>() : null
      const proforma = invoice.kind === 'proforma'
      await db.batch([
        db.prepare('UPDATE invoices SET reminders = ?, reminded_at = ? WHERE id = ? AND company_id = ? AND reminders = ?').bind(step + 1, now(), invoice.id, company.id, step),
        queueStatement(db, {
          key: `invoice:dun:${invoice.id}:${step}`,
          to: invoice.customerEmail,
          replyTo: from?.email ?? null,
          subject: t.dunning.subject(step, invoice.number, company.name, proforma),
          body: ti.mail.reminderBody(
            company.name,
            invoice.number,
            formatMoney(asked, invoice.currency).replace(/\u00a0/g, ' '),
            dayName(invoice.dueOn).replace(/\u00a0/g, ' '),
            invoice.iban ? groupIban(invoice.iban) : null,
            `${BRAND.origin}/f/${invoice.token}`,
            proforma,
            invoice.vs ?? invoice.number,
            asked !== invoice.totalCents,
          ),
        }),
        eventStatement(db, { company: company.id, user: null, action: 'invoice.dunned', subject: invoice.id, detail: { step } }),
      ])
    } catch (err) {
      console.error('a reminder failed', err instanceof Error ? err.name : 'error')
    }
  }
  await flushOutbox(db, env.EMAIL)
}

/** Every fifteen minutes: documents whose reading was cut off are read again (three times at most), old sessions go. */
export async function appScheduled(env: AppBindings, at: number = Date.now()): Promise<void> {
  const db = env.DB
  const ts = now()
  // Each reminder on its own: one that fails does not take the others with it.
  for (const [name, remind] of [
    ['documents', remindAll],
    ['bank renewals', remindBankRenewals],
    ['statements', remindStatements],
    ['approvals', remindApprovals],
  ] as const) {
    try {
      await remind(env, at)
    } catch (err) {
      console.error(`reminders (${name}) failed`, err instanceof Error ? err.name : 'error')
    }
  }
  try {
    await readDue(env)
  } catch (err) {
    console.error('reading the banks failed', err instanceof Error ? err.name : 'error')
  }
  try {
    await purgeEnded(env, bratislava(at).day)
  } catch (err) {
    console.error('deleting ended companies failed', err instanceof Error ? err.name : 'error')
  }
  try {
    await billingScheduled(env, at, BRAND.origin)
  } catch (err) {
    console.error('billing failed', err instanceof Error ? err.name : 'error')
  }
  try {
    await repeatScheduled(env, bratislava(at).day)
  } catch (err) {
    console.error('repeated invoices failed', err instanceof Error ? err.name : 'error')
  }
  try {
    if (bratislava(at).hour >= 9) await dunningScheduled(env, bratislava(at).day)
  } catch (err) {
    console.error('reminders of invoices failed', err instanceof Error ? err.name : 'error')
  }
  try {
    const b = bratislava(at)
    await refreshRates(db, fetch, b.day, b.hour * 60 + b.minute >= 16 * 60 + 30)
  } catch (err) {
    console.error('the ECB rates failed', err instanceof Error ? err.name : 'error')
  }
  try {
    await autoBook(db)
  } catch (err) {
    console.error('booking by itself failed', err instanceof Error ? err.name : 'error')
  }
  const stuck = await db
    .prepare("SELECT id, company_id, read_tries FROM documents WHERE status = 'reading' AND deleted_at IS NULL AND created_at < ? ORDER BY created_at LIMIT 20")
    .bind(ts - 120)
    .all<{ id: string; company_id: string; read_tries: number }>()
  // A run has minutes, not hours: reading stops after four of them and the rest waits for the next run. One document
  // that fails does not keep the others, or the clean-up below, from their turn.
  const until = Date.now() + 240_000
  for (const row of stuck.results) {
    if (Date.now() > until) break
    try {
      const company = await getCompany(db, row.company_id)
      if (!company) continue
      if (row.read_tries >= 3) await db.batch([manualStatement(db, company.id, row.id, 'three tries')])
      else {
        await readOne(env, company, row.id)
        await matchCompany(db, company.id)
      }
    } catch (err) {
      console.error('reading a document again failed', err instanceof Error ? err.name : 'error')
    }
  }
  await db.batch([db.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(ts), db.prepare('DELETE FROM login_links WHERE expires_at < ?').bind(ts - 86400), db.prepare('DELETE FROM auth_challenges WHERE expires_at < ?').bind(ts)])
}
