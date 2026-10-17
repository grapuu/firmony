// The accountants' side under /ucto. Only somebody of the team gets in: a client who types the address gets the
// same "not found" as for anything that does not exist. Every company, document and payment is checked against
// what the user may see (an accountant her own clients, an administrator everybody).
import { Hono, type Context } from 'hono'
import { filingFile, packageOf, prepareFiling } from '../filings/store'
import { filingRoutes, filingQueueRoutes } from '../filings/routes'
import { payrollReportRoutes } from '../payroll-reporting/routes'
import { closureStatements, reportItems as payrollReportItems, runReopenBlocked } from '../payroll-reporting/store'
import { html } from 'hono/html'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { APP, ART, BRAND, ENDING, OFFLINE_TERMS, OPERATOR, PLANS, TEAM } from '../config'
import { ensureSchema, now, sha256Hex } from '../db'
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
import { booksRefused, checkPaperStatement, getPaper, keepPaper, paperResponse, papersOf, poaStateOf, retirePaperStatements, returnPoaStatements } from '../app/papers'
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
import { changeLockStatement, lockHistory, periodLock } from '../app/period-store'
import { lockBlockers, lockTarget, type LockValues } from '../app/periods'
import { PeriodPage, type PeriodPageProps } from '../views/periods'
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
import { AssetPage, AssetsPage, assetRow, emptyAssetValues, valuesOf as assetValuesOf, type AssetFormErrors, type AssetValues } from '../views/assets'
import { DISPOSALS, assetErrors, assetKind, assetYear, isAssetAccount, type AssetAccount, type Disposal } from '../app/assets'
import { assetsOf, disposeAssetStatement, insertAssetStatement, removeAssetStatement, updateAssetStatement, type AssetInput } from '../app/assets-store'
import { StockItemPage, StockPage, type StockDocument } from '../views/stock'
import { parseItemsCsv, parseMovesCsv, readItem, readMove, shortOf, stockSummary, valueItem, STOCK_ACCOUNTS, STOCK_KINDS, type ItemErrors, type ItemValues, type MoveErrors, type MoveValues, type StockKind, type StockMove } from '../app/stock'
import { insertItemStatement, insertMoveStatement, removeItemStatement, removeMoveStatement, settingsStatement as stockSettingsStatement, stockOf, updateItemStatement, type Stock } from '../app/stock-store'
import { balanceOf as accountBalance } from '../app/ledger'
import { isPeriodLocked } from '../app/periods'
import { VatCard, VatPage, type VatForm } from '../views/vat'
import { ClosingPage, closingState, type ClosingState } from '../views/closing'
import { extensionDays, tableF } from '../app/closing'
import { closingValues, readClosing, type ClosingErrors, type ClosingValues } from '../app/closing-form'
import { bookTaxStatements, closingView, closingsOf, extendStatement, fileClosingStatement, incomeSymbol, notesSource, saveInputsStatement, unfileClosingStatement, type ClosingView, type ClosingFiles } from '../app/closing-store'
import { notesDocument } from '../app/notes'
import { pdfText } from '../app/pdf'
import { dppoXml, statementsXml, type ClosingFiler } from '../app/closing-xml'
import { CHILD_ROWS, EmployeePage, PayrollPage, PayslipPage, type FieldErrors, type LeaveRow, type LeaveUse, type MonthState, type PayOrders, type SickForm, type SlipLine } from '../views/payroll'
import {
  INSURERS,
  closeRunStatement,
  closedMonthsOf,
  storedLine,
  employeeStatement,
  employeesOf,
  isInsurer,
  leaveTouchesClosed,
  monthIssues,
  monthRange,
  monthSlips,
  paydayOf,
  payrollSettingsOf,
  removeSickLeaveStatement,
  reopenRunStatement,
  runTotals,
  runsOf,
  saveRunStatement,
  settingsStatement,
  sickLeaveStatement,
  sickLeavesOf,
  type Employee,
  type Insurer,
  type PayrollSettings,
  type PayrollRun,
} from '../app/payroll-store'
import { addDays } from '../app/ending'
import { exemptionAllowed, isContract, isPension, regularOf, supportsPayrollPeriod } from '../app/payroll'
import { addDay, leaveEntitlement, proposeDvz, type SickLeave } from '../app/pay-month'
import { decodeText, parseDelimited, readTable } from '../app/table-read'
import { assetRows, openItems, personRows, pohodaInvoices, priorStatements as takeoverPrior, trialBalance as takeoverTrial, type LineIssue, type OpenItem } from '../app/takeover'
import { assetNumbers, assetRowsStatements, batchesOf, openItemsStatements, peopleStatements, priorListOf, priorStatementStatement, removeBatchStatements, removePriorStatement } from '../app/takeover-store'
import { TakeoverPage, type TakeoverPageProps } from '../views/takeover'
import { hundredthsOf, hundredthsText, partsValues, readParts, tenThousandthsOf, tenThousandthsText } from '../app/payroll-form'
import { EMPTY_SETTLEMENT, settle, type SettlementInputs } from '../app/tax-settlement'
import { settledInClosed, settlementStatement, settlementsOf, yearIncome } from '../app/tax-settlement-store'
import { CertificatePage, SettlementPage, type SettlementRow, type SettlementState } from '../views/settlement'
import { isIban, plainIban } from '../app/invoices'
import { familyOf, moneyText, modesFor, periodsAround, readVat, vatValues } from '../app/vat-form'
import { isTaxOffice } from '../app/vat-xml'
import { formatEurExact } from '../format'
import { isPeriod, isQuarter, nextPeriod, outcome, periodOf, periodRange, prevPeriod, vatOf, workingDayFrom, type VatData } from '../app/vat'
import { returnXml, statementXml, summaryXml } from '../app/vat-xml'
import { quarterOf, summaryLookbackFrom, summaryPeriodOf, type SvView, type SvFiled } from '../app/vat-summary'
import { dataRevision } from '../app/handover-store'
import { sensitivePath } from '../security/policy'
import { securityGate } from '../security/routes'
import { incidentRoutes } from '../incidents/routes'
import { approvedRelease, contractCatalogueHash, latestOrderReview, orderOfferHash, releaseState, releaseValue } from '../contracts'
import { startMonths } from '../content/terms'
import { latestOrderOfRequest, renewOrderStatement, type Order } from '../order'
import { orderLinkMail } from '../order-mail'
import { ContractReleasePage, ContractReviewPage, type ReleaseForm } from '../views/contract-review'
import { BillingPage } from '../views/billing'
import { billingDrafts, billRows, deliverBill, issuable, issueBill, operatorOf, paperTariffStatement, REMIND_EVERY, remindMessage } from './billing-store'
import { DeadlinesCard, DeadlinesPage, type DueFilter } from '../views/deadlines'
import { MARKED_KINDS, closingIsOurs } from './deadlines'
import { companyRegistrations, teamDeadlines, unmarkFilingStatement } from './deadlines-store'
import { REGISTRATION_EVENTS } from './registrations'
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
  summaryFiled,
  svViewOf,
  svViewsOf,
  summariesFiled,
  reclassifySummaryStatements,
  fileSummaryStatement,
  unfileSummaryStatement,
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
import { currentWho, newLink, newToken, startSession } from '../app/session'
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
  failedMail,
  POA_RESIGNED,
  getRequest,
  inboxCode,
  isAdmin,
  listInvestors,
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
  const security = await securityGate(c, who, sensitivePath(new URL(c.req.url).pathname, c.req.method))
  if (security) return security
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
    case 'dph-ulozit':
      return t.vat.flashes.saveFirst
    case 'sv-podany':
      return t.vat.sv.flashes.filed
    case 'sv-opraveny':
      return t.vat.sv.flashes.corrected
    case 'sv-zruseny':
      return t.vat.sv.flashes.unfiled
    case 'sv-blokovane':
      return t.vat.sv.flashes.blocked
    case 'sv-bezi':
      return t.vat.sv.flashes.running
    case 'sv-uz':
      return t.vat.sv.flashes.already
    case 'sv-netreba':
      return t.vat.sv.flashes.none
    case 'sv-zmeneny':
      return t.vat.sv.flashes.stale
    case 'sv-ulozit':
      return t.vat.sv.flashes.saveFirst
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
    case 'zavierka-ulozit':
      return t.closing.flashes.saveFirst
    case 'zavierka-lehota':
      return t.closing.flashes.extended
    case 'zavierka-zmenena':
      return t.closing.flashes.stale
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
    case 'mzdy-zmenene':
      return 'Podklady sa medzitým zmenili. Obnovte stránku a skontrolujte aktuálne mzdy; uzávierku sme nevytvorili.'
    case 'mzdy-nikto':
      return t.payroll.flashes.nobody
    case 'mzdy-zamestnanec':
      return t.payroll.flashes.employee
    case 'mzdy-prevzati':
      return t.takeover.flashes.people ?? null
    case 'mzdy-nastavenie':
      return t.payroll.flashes.settings
    case 'mzdy-nepodporovane':
      return t.payroll.unsupported
    case 'mzdy-doplnit':
      return t.payroll.flashes.issues
    case 'mzdy-pn':
      return t.payroll.flashes.sick
    case 'mzdy-pn-odstranena':
      return t.payroll.flashes.sickRemoved
    case 'mzdy-pn-uzavrete':
      return t.payroll.errors.sickClosed
    case 'rz':
      return t.payroll.settlement.flash
    case 'rz-uzavrete':
      return t.payroll.settlement.closedRefused
    case 'plna-moc-vratena':
      return t.client.poaReturned
    case 'plna-moc-dovod':
      return t.client.poaReturnError
    case 'plna-moc-vzdana':
      return t.handover.poa.flash
    case 'prihlasenie':
      return t.payroll.registrations.flashDone
    case 'prihlasenie-spat':
      return t.payroll.registrations.flashUndone
    case 'kniha-ucet':
      return t.ledger.flashes.account
    case 'kniha-interny':
      return t.ledger.flashes.internal
    case 'kniha-odstraneny':
      return t.ledger.flashes.removed
    case 'kniha-ps':
      return t.ledger.flashes.opening
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
  const [rows, ended, { dues }, mail] = await Promise.all([
    teamClients(c.env.DB, who.user, demoOn(c)),
    isAdmin(who.user) ? endedCompanies(c.env.DB) : Promise.resolve([]),
    teamDeadlines(c.env.DB, who.user, demoOn(c), dayOf(now())),
    isAdmin(who.user) ? failedMail(c.env.DB) : Promise.resolve(null),
  ])
  return shell(c, 'clients', t.clients.title, <ClientsPage user={who.user} rows={rows} dues={dues} mail={mail} ended={ended} now={now()} flash={flashOf(c)} />)
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

// A month's payroll reports marked as filed by hand, before they were filed one recipient at a time on their own page
// (schema 19): such a mark can only be taken back. No new one is made: one mark never proved all of a month's reports.
teamRoutes.post('/klienti/:id/podane', async (c) => {
  const company = await companyParam(c)
  if (!company) return missingPage(c)
  const who = c.get('who')
  const db = c.env.DB
  const body = await c.req.parseBody()
  const today = dayOf(now())
  const kind = body.druh === MARKED_KINDS.payroll ? MARKED_KINDS.payroll : null
  const period = typeof body.obdobie === 'string' ? body.obdobie : ''
  // Payroll reports of a month that has ended.
  if (!kind || !isPeriod(period) || periodRange(period).to >= today || period.includes('Q')) return c.text('Bad request', 400)
  if (body.zrusit !== '1') return c.text('Bad request', 400)
  await db.batch([
    unmarkFilingStatement(db, company.id, kind, period),
    eventStatement(db, { company: company.id, user: who.user.id, action: 'filing.unmarked', subject: `${kind}:${period}` }),
  ])
  const back = typeof body.spat === 'string' && BACK.test(body.spat) ? body.spat : '/ucto/terminy'
  return c.redirect(`${back}${back.includes('?') ? '&' : '?'}ok=neoznacene`, 303)
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
  const [members, queue, toCheck, missing, messages, rules, accountants, papers, declared, risks, reports, handover, takeover] = await Promise.all([
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
    papersOf(db, company.id, 'takeover'),
  ])
  const resigned = await db
    .prepare(`SELECT ev.at, u.name FROM events ev LEFT JOIN users u ON u.id = ev.user_id WHERE ev.company_id = ? AND ev.action = '${POA_RESIGNED}' ORDER BY ev.id LIMIT 1`)
    .bind(company.id)
    .first<{ at: number; name: string | null }>()
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
      flash={flashOf(c)}
      bankLine={bankLine}
      papers={papers}
      poa={poaStateOf(papers)}
      declaration={declarationStateOf(declared)}
      risk={risks[0]?.level ?? null}
      openReports={reports.filter((r) => r.decision === null).length}
      handover={handover}
      resigned={resigned ? { at: Number(resigned.at), by: resigned.name } : null}
      takeover={takeover}
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
    start: startMonths(dayOf(now()))[0] ?? '',
    offline: false,
  }
  return shell(c, 'clients', t.newClient.title, <NewClientPage values={values} accountants={await accountantsList(c.env.DB)} errors={{}} months={startMonths(dayOf(now()))} />)
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
    start: text('start', 10),
    offline: body.mimo === '1',
  }
  const months = startMonths(dayOf(now()))
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
  if (body.akcia === 'register') return shell(c, 'clients', t.newClient.title, <NewClientPage values={values} accountants={accountants} errors={errors} found={found} months={months} />)
  if (values.name.length < 2) errors.name = t.newClient.errors.name
  if (values.person.length < 2) errors.person = t.newClient.errors.person
  if (!EMAIL.test(values.email)) errors.email = t.newClient.errors.email
  if (ico && (await db.prepare('SELECT 1 AS x FROM companies WHERE ico = ? AND closed_at IS NULL').bind(ico).first())) errors.ico = t.newClient.errors.exists
  if (!months.includes(values.start)) errors.start = t.newClient.errors.start
  // A client is made by hand only with a contract signed on paper: the app then says so, and the first month counts
  // for deadlines and the closing as it does for a contract concluded online.
  if (!values.offline) errors.offline = t.newClient.errors.offline
  if (Object.keys(errors).length > 0) return shell(c, 'clients', t.newClient.title, <NewClientPage values={values} accountants={accountants} errors={errors} found={found} months={months} />, 422)

  const companyId = crypto.randomUUID()
  const existing = await userByEmail(db, values.email)
  const userId = existing?.id ?? crypto.randomUUID()
  const ts = now()
  let inbox = inboxCode()
  for (let i = 0; i < 5 && (await db.prepare('SELECT 1 AS x FROM companies WHERE inbox = ?').bind(inbox).first()); i++) inbox = inboxCode()
  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT INTO companies (id, created_at, name, ico, address, vat_payer, plan, inbox, accountant_id, request_id, contract_at, terms_version, signed_by, start_on)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '${OFFLINE_TERMS}', ?, ?)`,
      )
      .bind(companyId, ts, values.name, ico, values.address || null, values.vat ? 1 : 0, values.plan, inbox, values.accountant || null, values.request || null, ts, values.person, values.start),
    ...(existing ? [] : [db.prepare('INSERT INTO users (id, created_at, email, name) VALUES (?, ?, ?, ?)').bind(userId, ts, values.email, values.person)]),
    db.prepare("INSERT OR IGNORE INTO members (company_id, user_id, role, created_at, invited_by) VALUES (?, ?, 'owner', ?, ?)").bind(companyId, userId, ts, who.user.id),
    eventStatement(db, { company: companyId, user: who.user.id, action: 'company.created', detail: { request: values.request || null } }),
    // The price list of the day the paper contract was signed: what the client is billed by (billing-store.ts).
    paperTariffStatement(db, companyId, who.user.id),
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

// A power of attorney that is not one goes back to the client, with a message that says why and what to upload.
teamRoutes.post('/klienti/:id/plna-moc/:file/vratit', async (c) => {
  const who = c.get('who')
  const company = await companyParam(c)
  const id = c.req.param('file')
  const paper = company && ID.test(id) ? await getPaper(c.env.DB, company.id, id) : null
  if (!company || !paper || paper.kind !== 'poa') return missingPage(c)
  const db = c.env.DB
  const body = await c.req.parseBody()
  const reason = typeof body.dovod === 'string' ? body.dovod.trim().replace(/\s+/g, ' ').slice(0, 300) : ''
  if (reason.length < 5) return c.redirect(`/ucto/klienti/${company.id}?ok=plna-moc-dovod#zmluva`, 303)
  const sentence = /[.!?]$/.test(reason) ? reason : `${reason}.`
  const [returned] = await db.batch(returnPoaStatements(db, company.id, paper.id, who.user.id, reason))
  if ((returned?.meta?.changes ?? 0) === 0) return c.redirect(`/ucto/klienti/${company.id}#zmluva`, 303)
  const message = crypto.randomUUID()
  await db.batch([
    messageStatement(db, { id: message, company: company.id, author: who.user.id, side: 'firmony', body: t.client.poaReturnMessage(paper.fileName, sentence), payment: null }),
    ...(await ringClient(c, company, message)),
  ])
  later(c, flushOutbox(db, c.env.EMAIL))
  return c.redirect(`/ucto/klienti/${company.id}?ok=plna-moc-vratena#zmluva`, 303)
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
  const refused = await booksRefused(db, company.id, 'handover', files)
  if (refused) return clientPage(c, company, { handoverError: t.handover.errors[refused] }, 422)
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

teamRoutes.get('/klienti/:id/prevzatie/:file', async (c) => {
  const company = await companyParam(c)
  const id = c.req.param('file')
  const paper = company && ID.test(id) ? await getPaper(c.env.DB, company.id, id) : null
  const answer = paper?.kind === 'takeover' ? await paperResponse(c.env.FILES, paper) : null
  return answer ?? missingPage(c)
})

teamRoutes.get('/klienti/:id/odovzdanie/:file', async (c) => {
  const company = await companyParam(c)
  const id = c.req.param('file')
  const paper = company && ID.test(id) ? await getPaper(c.env.DB, company.id, id) : null
  const answer = paper?.kind === 'handover' ? await paperResponse(c.env.FILES, paper) : null
  return answer ?? missingPage(c)
})

// The power of attorney given up at the end of the contract (point 10.4 of the terms), recorded once.
teamRoutes.post('/klienti/:id/odovzdanie/plna-moc', async (c) => {
  const company = await companyParam(c)
  if (!company) return missingPage(c)
  const db = c.env.DB
  if (!endingOf(company, dayOf(now()))) return c.redirect(`/ucto/klienti/${company.id}`, 303)
  await db
    .prepare(
      `INSERT INTO events (at, company_id, user_id, action, subject, detail) SELECT ?2, ?1, ?3, '${POA_RESIGNED}', ?1, NULL
         WHERE NOT EXISTS (SELECT 1 FROM events WHERE company_id = ?1 AND action = '${POA_RESIGNED}')`,
    )
    .bind(company.id, now(), c.get('who').user.id)
    .run()
  return c.redirect(`/ucto/klienti/${company.id}?ok=plna-moc-vzdana#odovzdanie`, 303)
})

teamRoutes.post('/klienti/:id/odovzdanie/:file/odstranit', async (c) => {
  const who = c.get('who')
  const company = await companyParam(c)
  const id = c.req.param('file')
  const paper = company && ID.test(id) ? await getPaper(c.env.DB, company.id, id) : null
  if (!company || !paper || paper.kind !== 'handover') return missingPage(c)
  const db = c.env.DB
  const result = await db.batch(retirePaperStatements(db, company.id, paper.id, who.user.id))
  if (!result[0]?.meta.changes) return c.text('Príloha sa medzitým zmenila. Obnovte stránku.', 409)
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

/** The recapitulative statement of a VAT period's statement period (a quarter under § 7a), with its own documents. */
async function svWithDocs(db: D1Database, company: Company, period: string, today: string) {
  const revision = await dataRevision(db, company.id)
  const sv = summaryPeriodOf(period, { status: company.vatStatus })
  const [docs, filed] = await Promise.all([docsAround(db, company.id, summaryLookbackFrom(sv), quarterOf(sv)), summariesFiled(db, company.id)])
  return { ...svViewsOf(company, sv, docs, filed, today), docs, filed, revision }
}

/** SV accepts its own month, even when the VAT return uses a quarter. Never silently substitutes another filing period. */
function summaryParam(company: Company, value: unknown, today: string): string | null {
  if (company.vatStatus === 'none' || typeof value !== 'string' || !isPeriod(value) || periodRange(value).from > today) return null
  return summaryPeriodOf(value, { status: company.vatStatus })
}

const summaryBack = (company: Company, period: string): string => {
  const vat = company.vatQuarterly ? quarterOf(period) : isQuarter(period) ? `${period.slice(0, 4)}-${String((Number(period.slice(-1)) - 1) * 3 + 1).padStart(2, '0')}` : period
  return `/ucto/klienti/${company.id}/dph?obdobie=${vat}`
}

function selectedSummary(company: Company, period: string, loaded: Awaited<ReturnType<typeof svWithDocs>>, today: string): SvView {
  return loaded.views.find((v) => v.period === period) ?? svViewOf(company, period, loaded.docs, loaded.filed.get(period) ?? null, today, loaded.schedule)
}

async function summarySnapshot(company: Company, period: string, kind: 'R' | 'O' | 'D', rows: NonNullable<SvView['plan']>['rows'], today: string): Promise<NonNullable<SvFiled['file']>> {
  const xml = summaryXml({ name: company.name, icdph: company.icdph as string, address: company.address }, period, rows, kind, today)
  const name = `SVDPH${kind === 'R' ? '' : `_${kind}`}_${company.icdph}_${period}.xml`
  const sha256 = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(xml)))].map((b) => b.toString(16).padStart(2, '0')).join('')
  return { name, xml, sha256 }
}

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
  const [docs, filed, summary] = await Promise.all([
    docsAround(db, company.id, periods[0] ?? period, periods[periods.length - 1] ?? period),
    filedReturns(db, company.id),
    company.vatStatus === 'none' ? null : svWithDocs(db, company, period, today),
  ])
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
      docs={new Map([...docs, ...(summary?.docs ?? [])].map((d) => [d.id, d]))}
      needs7a={docs.filter((d) => needs.has(d.id))}
      summaries={summary?.views ?? []}
      summarySchedule={summary?.schedule ?? null}
      legacySummary={summary?.legacy ?? null}
      today={today}
      flash={flashOf(c)}
    />,
  )
})

/**
 * The return, the control statement or the recapitulative statement as a file, for "Načítať zo súboru" in eDane or on
 * the portal: always the one saved with the filing's podklady, never one made on the fly, so what is loaded in eDane is
 * what the filing's evidence holds. Before the podklady are saved, the page says why there is no file yet.
 */
teamRoutes.get('/klienti/:id/dph/:file', async (c) => {
  const company = await companyParam(c)
  const file = c.req.param('file')
  if (!company || (file !== 'priznanie.xml' && file !== 'kontrolny-vykaz.xml' && file !== 'suhrnny-vykaz.xml')) return missingPage(c)
  const today = dayOf(now())
  if (file === 'suhrnny-vykaz.xml') {
    const sv = summaryParam(company, c.req.query('obdobie'), today)
    return sv ? summaryFile(c, company, sv, today) : missingPage(c)
  }
  const period = periodParam(company, c.req.query('obdobie'), today)
  const { view, filed } = await vatView(c.env.DB, company, period, today)
  const back = `/ucto/klienti/${company.id}/dph?obdobie=${period}`
  const statement = file === 'kontrolny-vykaz.xml'
  if (view.state === 'filed') {
    const id = view.filed?.delivery?.[statement ? 'kv' : 'vat']
    if (!id) return statement && !view.filed?.kv ? c.redirect(`${back}&ok=dph-netreba`, 303) : c.text(t.vat.flashes.missingOriginal, 409)
    const saved = await packageOf(c.env.DB, company.id, id)
    if (!saved || await sha256Hex(saved.xml) !== saved.sha256) return c.text('Uložený dokument chýba alebo sa nezhoduje s kontrolným odtlačkom. Prípad musí preveriť účtovný tím.', 409)
    await c.env.DB.batch([eventStatement(c.env.DB, { company: company.id, user: c.get('who').user.id, action: statement ? 'vat.statement.downloaded' : 'vat.return.downloaded', subject: period, detail: { kind: view.filed?.kind ?? 'R' } })])
    return new Response(saved.xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Content-Disposition': `attachment; filename="${saved.name}"`, 'Cache-Control': 'private, no-store' } })
  }
  if (view.state === 'running') return c.redirect(`${back}&ok=dph-bezi`, 303)
  const plan = vatPlan(company, view, filed, today, choicesOf((name) => c.req.query(name)))
  if (!plan) return c.redirect(`${back}&ok=dph-blokovane`, 303)
  if (statement ? !plan.kv : !plan.returnNeeded) return c.redirect(`${back}&ok=dph-netreba`, 303)
  return c.redirect(`${back}&ok=dph-ulozit`, 303)
})

/**
 * The recapitulative statement's file: what is to be filed now (a regular statement, or the correction of the one
 * filed), or the one filed, with the day it was declared; none while the period runs or something keeps it back.
 */
async function summaryFile(c: Ctx, company: Company, period: string, today: string): Promise<Response> {
  const loaded = await svWithDocs(c.env.DB, company, period, today)
  const sv = selectedSummary(company, period, loaded, today)
  const back = `${summaryBack(company, period)}#suhrnny`
  const original = c.req.query('povodne') === '1'
  const saved = loaded.filed.get(period)
  if (original && !saved?.file) return c.text(t.vat.sv.missingOriginal, 409)
  const send = sv.plan ?? (sv.state === 'filed' && sv.filed ? { kind: sv.filed.kind, rows: sv.filed.sent } : null)
  if (!original && sv.state === 'running') return c.redirect(back.replace('#', '&ok=sv-bezi#'), 303)
  if (!original && sv.state === 'none') return c.redirect(back.replace('#', '&ok=sv-netreba#'), 303)
  if (!original && (!send || !company.icdph)) return c.redirect(back.replace('#', '&ok=sv-blokovane#'), 303)
  if (!original && sv.state === 'filed' && !sv.filed?.file) return c.text(t.vat.sv.missingOriginal, 409)
  // A file is the one saved with the podklady; before they are saved there is none to load in eDane.
  if (!original && sv.state !== 'filed') return c.redirect(back.replace('#', '&ok=sv-ulozit#'), 303)
  const snapshot = saved?.file
  if (!snapshot) return c.text(t.vat.sv.missingOriginal, 409)
  if (await sha256Hex(snapshot.xml) !== snapshot.sha256) return c.text('Uložený dokument sa nezhoduje s kontrolným odtlačkom. Prípad musí preveriť účtovný tím.', 409)
  if (snapshot.attemptId) {
    const pkg = await packageOf(c.env.DB, company.id, snapshot.attemptId)
    if (!pkg || pkg.kind !== 'sv' || pkg.xml !== snapshot.xml || pkg.sha256 !== snapshot.sha256) return c.text('Pôvodný dokument sa nezhoduje s evidenciou podania. Prípad musí preveriť účtovný tím.', 409)
  }
  await c.env.DB.batch([eventStatement(c.env.DB, { company: company.id, user: c.get('who').user.id, action: 'vat.summary.downloaded', subject: sv.period, detail: { kind: original ? saved?.kind : send?.kind, original } })])
  return new Response(snapshot.xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Content-Disposition': `attachment; filename="${snapshot.name}"`,
      'Cache-Control': 'private, no-store',
    },
  })
}

/** The recapitulative statement marked as filed, with what its file held; a correction over the statement it corrects. */
teamRoutes.post('/klienti/:id/dph/suhrnny-vykaz/podane', async (c) => {
  const who = c.get('who')
  const company = await companyParam(c)
  if (!company) return missingPage(c)
  const body = await c.req.parseBody()
  const today = dayOf(now())
  const period = summaryParam(company, body.obdobie, today)
  if (!period) return c.text('Bad request', 400)
  const back = summaryBack(company, period)
  const db = c.env.DB
  const loaded = await svWithDocs(db, company, period, today)
  const sv = selectedSummary(company, period, loaded, today)
  if (sv.state === 'filed') return c.redirect(`${back}&ok=sv-uz#suhrnny`, 303)
  if (sv.state === 'none') return c.redirect(`${back}&ok=sv-netreba#suhrnny`, 303)
  if (sv.state === 'running') return c.redirect(`${back}&ok=sv-bezi#suhrnny`, 303)
  if (!sv.plan) return c.redirect(`${back}&ok=sv-blokovane#suhrnny`, 303)
  const original = await summarySnapshot(company, sv.period, sv.plan.kind, sv.plan.rows, today)
  const snapshot = await filingFile(original.name, original.xml)
  const [done] = await db.batch([
    fileSummaryStatement(db, company.id, sv, sv.plan, who.user.id, today, snapshot, loaded.revision),
    prepareFiling(db, company.id, 'sv', sv.period, snapshot, who.user.id),
  ])
  if ((done?.meta?.changes ?? 0) === 0) return c.redirect(`${back}&ok=sv-zmeneny#suhrnny`, 303)
  const correction = sv.filed !== null
  await db.batch([eventStatement(db, { company: company.id, user: who.user.id, action: correction ? 'vat.summary.corrected' : 'vat.summary.filed', subject: sv.period, detail: { kind: sv.plan.kind, rows: sv.plan.rows.length } })])
  return c.redirect(`/ucto/klienti/${company.id}/podania?obdobie=${sv.period}`, 303)
})

/** A mark set by mistake taken back: a correction gives way to the statement it replaced. */
teamRoutes.post('/klienti/:id/dph/suhrnny-vykaz/zrusit', async (c) => {
  const who = c.get('who')
  const company = await companyParam(c)
  if (!company) return missingPage(c)
  const body = await c.req.parseBody()
  const today = dayOf(now())
  const period = summaryParam(company, body.obdobie, today)
  if (!period) return c.text('Bad request', 400)
  const db = c.env.DB
  const revision = await dataRevision(db, company.id)
  const filed = await summaryFiled(db, company.id, period)
  const [gone] = filed ? await db.batch([unfileSummaryStatement(db, company.id, period, filed, revision)]) : []
  if (filed && (gone?.meta?.changes ?? 0) > 0) await db.batch([eventStatement(db, { company: company.id, user: who.user.id, action: 'vat.summary.unfiled', subject: period, detail: { kind: filed.kind } })])
  return c.redirect(`${summaryBack(company, period)}&ok=sv-zruseny#suhrnny`, 303)
})

teamRoutes.post('/klienti/:id/dph/suhrnny-vykaz/obdobie', async (c) => {
  const company = await companyParam(c)
  if (!company) return missingPage(c)
  const today = dayOf(now())
  const body = await c.req.parseBody()
  const period = summaryParam(company, body.obdobie, today)
  if (!period || !isQuarter(period)) return c.text('Bad request', 400)
  const loaded = await svWithDocs(c.env.DB, company, period, today)
  if (!loaded.schedule.monthly || !loaded.legacy || loaded.legacy.rows === null) return c.redirect(`${summaryBack(company, period)}&ok=sv-zmeneny#suhrnny`, 303)
  const [done] = await c.env.DB.batch(reclassifySummaryStatements(c.env.DB, company.id, period, loaded.legacy, loaded.revision))
  if ((done?.meta?.changes ?? 0) > 0) await c.env.DB.batch([eventStatement(c.env.DB, { company: company.id, user: c.get('who').user.id, action: 'vat.summary.reclassified', subject: period })])
  return c.redirect(`${summaryBack(company, period)}&ok=sv-zmeneny#suhrnny`, 303)
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
  const revision = await dataRevision(db, company.id)
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
  if (!plan || company.vatStatus === 'none' || !company.icdph || !company.taxOffice) return c.redirect(`${back}&ok=dph-blokovane`, 303)
  const filer = { name: company.name, icdph: company.icdph, address: company.address, taxOffice: company.taxOffice, status: company.vatStatus }
  const returnFile = plan.returnNeeded ? await filingFile(
    `DPH${plan.kind === 'R' ? '' : `_${plan.kind}`}_${company.icdph}_${period}.xml`,
    returnXml(filer, period, plan.rows, { declaredOn: today, nothing: plan.nothing, fastRefund: plan.fast, kind: plan.kind, foundOn: plan.foundOn }),
  ) : null
  const kvFile = plan.kv ? await filingFile(
    `KVDPH${plan.kv.kind === 'R' ? '' : `_${plan.kv.kind}`}_${company.icdph}_${period}.xml`,
    statementXml(filer, period, plan.kv.sent, plan.kv.kind),
  ) : null
  const delivery = { ...(plan.replaces?.delivery ?? {}), ...(returnFile ? { vat: returnFile.attemptId } : {}), ...(kvFile ? { kv: kvFile.attemptId } : {}) }
  const [done] = await db.batch([
    fileStatement(db, company.id, plan, who.user.id, today, delivery, revision),
    ...(returnFile ? [prepareFiling(db, company.id, 'vat', period, returnFile, who.user.id)] : []),
    ...(kvFile ? [prepareFiling(db, company.id, 'kv', period, kvFile, who.user.id)] : []),
  ])
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
    return c.redirect(`/ucto/klienti/${company.id}/podania?obdobie=${period}`, 303)
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
  return c.redirect(`/ucto/klienti/${company.id}/podania?obdobie=${period}`, 303)
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
      values={form?.values ?? (view ? closingValues(view.year, view.inputs, view.proposal, view.found) : {})}
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
  const read = readClosing((name) => body[name], view.year, view.proposal, view.found)
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
  const result = await db.batch(bookTaxStatements(db, company.id, view.year, cents, view.closing?.taxEntry ?? null, who.user.id, view.closing?.revision ?? 0, view.deferred.lines))
  if ((result[1]?.meta?.changes ?? 0) === 0) return c.redirect(`${back}&ok=zavierka-zmenena`, 303)
  await db.batch([eventStatement(db, { company: company.id, user: who.user.id, action: 'closing.tax', subject: String(view.year), detail: { cents, deferred: view.deferred.expense } })])
  return c.redirect(`${back}&ok=zavierka-dan`, 303)
})

/** Produce both files together; at filing they become an immutable snapshot, including the filer and filenames. */
async function closingFiles(company: Company, view: ClosingView, declaredOn: string): Promise<ClosingFiles> {
  const filer: ClosingFiler = { name: company.name, ico: company.ico, dic: company.dic, address: company.address, registerLine: company.registerLine, nace: view.inputs.nace, activity: view.inputs.activity }
  const from = view.inputs.from ?? `${view.year}-01-01`
  const make = async (name: string, xml: string) => ({ name, xml, sha256: [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(xml)))].map((b) => b.toString(16).padStart(2, '0')).join('') })
  return {
    version: 1,
    declaredOn,
    return: await make(`DPPO_${company.dic ?? company.ico ?? company.id}_${view.year}.xml`, dppoXml(filer, view.tax, {
      year: view.year, from, to: `${view.year}-12-31`, declaredOn, kind: 'R', micro: view.input.micro,
      minimumHalf: view.input.minimumHalf, minimumExempt: view.input.minimumExempt, tableF: tableF(view.statements),
    })),
    statements: await make(`${view.statements.form === 'pod' ? 'UZPOD' : 'UZMUJ'}_${company.ico ?? company.id}_${view.year}.xml`, statementsXml(filer, view.statements, view.previous, { year: view.year, from, preparedOn: declaredOn, approvedOn: view.inputs.approvedOn, size: view.size })),
    notes: await (async () => {
      const made = await make(notesName(company, view.year), pdfText(notesDocument(notesSource(company, view))))
      return { name: made.name, text: made.xml, sha256: made.sha256 }
    })(),
  }
}

/** The notes' file name: Poznamky_<IČO>_<year>.pdf. */
const notesName = (company: Company, year: number): string => `Poznamky_${company.ico ?? company.id}_${year}.pdf`

/** The notes to the statements as a PDF: the ones saved with the podklady, else the draft from the books as they stand. */
teamRoutes.get('/klienti/:id/zavierka/poznamky.pdf', async (c) => {
  const company = await companyParam(c)
  if (!company) return missingPage(c)
  const found = await closingOfForm(c, company, c.req.query('rok'))
  if (!found) return missingPage(c)
  const { view } = found
  const saved = view.closing?.filed?.files?.notes
  if (saved && (await sha256Hex(saved.text)) !== saved.sha256) return c.text('Uložený dokument sa nezhoduje s kontrolným odtlačkom. Prípad musí preveriť účtovný tím.', 409)
  const text = saved?.text ?? pdfText(notesDocument(notesSource(company, view)))
  await c.env.DB.batch([eventStatement(c.env.DB, { company: company.id, user: c.get('who').user.id, action: 'closing.notes.downloaded', subject: String(view.year) })])
  return new Response(text, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${saved?.name ?? notesName(company, view.year)}"`,
      'Cache-Control': 'private, no-store',
    },
  })
})

/** The return or the statements as a file, for "Načítať zo súboru" in eDane or on the portal. */
teamRoutes.get('/klienti/:id/zavierka/:file', async (c) => {
  const company = await companyParam(c)
  const file = c.req.param('file')
  if (!company || (file !== 'priznanie.xml' && file !== 'zavierka.xml')) return missingPage(c)
  const found = await closingOfForm(c, company, c.req.query('rok'))
  if (!found) return missingPage(c)
  const { view } = found
  const back = `/ucto/klienti/${company.id}/zavierka?rok=${view.year}`
  const statements = file === 'zavierka.xml'
  const snapshot = view.closing?.filed
  // The files are the ones saved with the podklady: none before, and never one made again for a filing that kept none.
  if (!snapshot) {
    if (view.running) return c.redirect(`${back}&ok=zavierka-bezi`, 303)
    return c.redirect(`${back}&ok=${closingState(view) === 'ready' ? 'zavierka-ulozit' : 'zavierka-blokovane'}`, 303)
  }
  if (!snapshot.files) return c.text(t.closing.missingOriginal, 409)
  const saved = statements ? snapshot.files.statements : snapshot.files.return
  const { xml, name } = saved
  if (await sha256Hex(xml) !== saved.sha256) return c.text('Uložený dokument sa nezhoduje s kontrolným odtlačkom. Prípad musí preveriť účtovný tím.', 409)
  if (saved.attemptId) {
    const pkg = await packageOf(c.env.DB, company.id, saved.attemptId)
    if (!pkg || pkg.kind !== (statements ? 'uz' : 'dppo') || pkg.xml !== xml || pkg.sha256 !== saved.sha256) return c.text('Pôvodný dokument sa nezhoduje s evidenciou podania. Prípad musí preveriť účtovný tím.', 409)
  }
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
  const generated = await closingFiles(company, view, today)
  const files = { ...generated, return: await filingFile(generated.return.name, generated.return.xml), statements: await filingFile(generated.statements.name, generated.statements.xml) }
  const snapshot = { rows: r, balance: view.statements.balanceEur, profit: view.statements.profitEur, ...(view.statements.form === 'pod' ? { gross: view.statements.grossEur } : {}), advancesNext: view.tax.advancesNext, files }
  const [done] = await db.batch([
    fileClosingStatement(db, company.id, view.year, snapshot, pay, view.due, who.user.id, today, view.closing?.revision ?? 0),
    prepareFiling(db, company.id, 'dppo', String(view.year), files.return, who.user.id),
    prepareFiling(db, company.id, 'uz', String(view.year), files.statements, who.user.id),
  ])
  if ((done?.meta?.changes ?? 0) === 0) return c.redirect(`${back}&ok=zavierka-zmenena`, 303)
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
  return c.redirect(`/ucto/klienti/${company.id}/podania?obdobie=${view.year}`, 303)
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

/** Recent work plus every stored month. Historical closed payslips must never expire from navigation. */
function payrollMonths(employees: readonly Employee[], today: string, runs: readonly PayrollRun[]): string[] {
  const current = today.slice(0, 7)
  const first = employees.reduce<string | null>((min, e) => (!min || e.startedOn < min ? e.startedOn : min), null)?.slice(0, 7) ?? current
  const out: string[] = []
  for (let m = current; out.length < 6 && m >= first; m = prevPeriod(m)) out.unshift(m)
  return [...new Set([...out, ...runs.map((r) => r.period).filter((p) => /^\d{4}-(0[1-9]|1[0-2])$/.test(p))])].sort()
}

/** The month of the address when it is one of them; else last month when it is, else this one. */
function payrollPeriod(asked: unknown, months: readonly string[], today: string): string {
  if (typeof asked === 'string' && months.includes(asked)) return asked
  const last = prevPeriod(today.slice(0, 7))
  return months.includes(last) ? last : today.slice(0, 7)
}

async function payrollData(db: D1Database, company: Company) {
  const [employees, runs, row, leaves, settlements] = await Promise.all([
    employeesOf(db, company.id),
    runsOf(db, company.id),
    db.prepare('SELECT payroll FROM companies WHERE id = ?').bind(company.id).first<{ payroll: string | null }>(),
    sickLeavesOf(db, company.id),
    settlementsOf(db, company.id),
  ])
  return { employees, runs, leaves, settlements, settings: payrollSettingsOf(row?.payroll ?? null) }
}

/** What the company pays for a month and where: each employee's net wage, the Social Insurance Agency, each health insurer, the tax office. */
function payOrders(company: Company, period: string, slips: readonly SlipLine[], employees: readonly Employee[], settings: PayrollSettings, payday: string): PayOrders {
  const totals = runTotals(slips)
  const iban = new Map(employees.map((e) => [e.id, e.iban]))
  return {
    payday,
    employees: slips.map((l) => ({ name: l.name, amount: l.slip.net, iban: iban.get(l.employeeId) ?? null })),
    social: { amount: totals.social, iban: settings.social.iban, vs: settings.social.vs },
    health: (Object.entries(totals.health) as [Insurer, number][]).filter(([, amount]) => amount > 0).map(([code, amount]) => ({ code, amount, iban: settings.health[code]?.iban ?? null, vs: settings.health[code]?.vs ?? null })),
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

/** Each line's parts as the form shows them: the month's wage as agreed in the table's column, an hourly person's hours left for the proposal. */
function monthValues(slips: readonly SlipLine[], employees: readonly Employee[], payday: string): Record<string, string> {
  const v: Record<string, string> = { vyplata: textDay(payday) }
  for (const l of slips) {
    const e = employees.find((x) => x.id === l.employeeId)
    if (!e || !l.parts) continue
    Object.assign(v, partsValues(l.parts, l.employeeId, e.contract, e.wageKind))
    if (!(e.wageKind === 'hourly' && e.contract !== 'director')) v[`mzda_${l.employeeId}`] = moneyText(l.parts.wage ?? e.wage)
  }
  return v
}

/** How much holiday each employee took in a year (closed months as they were, open ones as typed), of the days owed. */
function leaveUse(employees: readonly Employee[], runs: readonly PayrollRun[], year: number): Record<string, LeaveUse> {
  const out: Record<string, LeaveUse> = {}
  for (const e of employees) {
    if (e.contract !== 'employment' || e.startedOn.slice(0, 4) > String(year) || (e.endedOn && e.endedOn.slice(0, 4) < String(year))) continue
    const taken = runs.filter((r) => r.period.startsWith(`${year}-`)).reduce((s, r) => s + (r.lines.find((l) => l.employeeId === e.id)?.parts?.holidayDays ?? 0), 0)
    out[e.id] = { year, taken, entitled: e.leaveDays ?? leaveEntitlement(e.bornOn, year) }
  }
  return out
}

/** The sick leaves as listed, the newest first, each with its daily base proposed when none was typed. */
function leaveRows(leaves: readonly SickLeave[], employees: readonly Employee[], runs: readonly PayrollRun[]): LeaveRow[] {
  return [...leaves]
    .sort((a, b) => (a.from > b.from ? -1 : 1))
    .flatMap((leave) => {
      const e = employees.find((x) => x.id === leave.employeeId)
      if (!e) return []
      return [{ leave, name: e.name, proposal: leave.dvz === null ? proposeDvz(leave, e.startedOn, closedMonthsOf(e, runs, leave.from.slice(0, 7))) : null }]
    })
}

const sickValues = (leave: SickLeave | null, employees: readonly Employee[]): Record<string, string> => ({
  zamestnanec: leave?.employeeId ?? employees[0]?.id ?? '',
  od: leave ? textDay(leave.from) : '',
  do: leave?.to ? textDay(leave.to) : '',
  dvz: leave?.dvz !== null && leave?.dvz !== undefined ? tenThousandthsText(leave.dvz) : '',
})

async function payrollPage(
  c: Ctx,
  company: Company,
  asked: unknown,
  forms: { month?: { values: Record<string, string>; errors: FieldErrors }; settings?: { values: Record<string, string>; errors: FieldErrors }; sick?: SickForm } = {},
) {
  const db = c.env.DB
  const today = dayOf(now())
  const { employees, runs, leaves, settlements, settings } = await payrollData(db, company)
  const months = payrollMonths(employees, today, runs)
  const period = payrollPeriod(asked, months, today)
  const run = runs.find((r) => r.period === period) ?? null
  const stateOf = (m: string): MonthState => (runs.some((r) => r.period === m && r.closedOn) ? 'closed' : !supportsPayrollPeriod(m) ? 'unsupported' : today <= monthRange(m).to ? 'running' : 'open')
  const slips = stateOf(period) === 'unsupported' ? [] : monthSlips(period, employees, run, { leaves, runs, settlements })
  const payday = run?.payday ?? paydayOf(period, settings)
  const insurers = [...new Set<Insurer>([...employees.map((e) => e.insurer), ...(Object.keys(settings.health) as Insurer[])])]
  const failed = Boolean(forms.month || forms.settings || forms.sick?.errors && Object.keys(forms.sick.errors).length > 0)
  const editing = typeof c.req.query('pn') === 'string' ? (leaves.find((l) => l.id === c.req.query('pn')) ?? null) : null
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
      reports={run?.closedOn ? await payrollReportItems(db, company.id, period) : []}
      registrations={await companyRegistrations(db, company, today)}
      reopenBlocked={run?.closedOn ? await runReopenBlocked(db, company.id, period) : false}
      totals={runTotals(slips)}
      orders={payOrders(company, period, slips, employees, settings, payday)}
      values={forms.month?.values ?? monthValues(slips, employees, payday)}
      errors={forms.month?.errors ?? {}}
      issues={stateOf(period) === 'closed' ? [] : monthIssues(slips)}
      leaves={leaveRows(leaves, employees, runs)}
      sickForm={forms.sick ?? { id: editing?.id ?? null, values: sickValues(editing, employees), errors: {} }}
      leave={leaveUse(employees, runs, Number(period.slice(0, 4)))}
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

/**
 * A registration with the Social Insurance Agency or a health insurer recorded as filed in its portal, or taken back
 * when recorded by mistake. Only a registration the company owes today can be recorded; the newest record counts.
 */
teamRoutes.post('/klienti/:id/mzdy/prihlasenia', async (c) => {
  const company = await companyParam(c)
  if (!company) return missingPage(c)
  const db = c.env.DB
  const body = await c.req.parseBody()
  const key = typeof body.kluc === 'string' ? body.kluc : ''
  const back = body.spat === '1'
  const due = (await companyRegistrations(db, company, dayOf(now()))).find((r) => r.key === key)
  if (!due || due.done !== back) return c.redirect(`/ucto/klienti/${company.id}/mzdy#prihlasenia`, 303)
  await db.batch([
    eventStatement(db, {
      company: company.id,
      user: c.get('who').user.id,
      action: back ? REGISTRATION_EVENTS.undone : REGISTRATION_EVENTS.done,
      subject: key,
      detail: { agency: due.agency, move: due.move, day: due.day },
    }),
  ])
  return c.redirect(`/ucto/klienti/${company.id}/mzdy?ok=${back ? 'prihlasenie-spat' : 'prihlasenie'}#prihlasenia`, 303)
})

const PART_ERRORS = { amount: t.payroll.errors.amount, hours: t.payroll.errors.hours, days: t.payroll.errors.days, average: t.payroll.errors.average } as const

/** The parts typed and the payday: kept, or the month closed with them and the client told what to pay. */
teamRoutes.post('/klienti/:id/mzdy', async (c) => {
  const company = await companyParam(c)
  if (!company) return missingPage(c)
  const db = c.env.DB
  const who = c.get('who')
  const body = await c.req.parseBody()
  const today = dayOf(now())
  const sourceRevision = await dataRevision(db, company.id)
  const { employees, runs, leaves, settlements, settings } = await payrollData(db, company)
  const months = payrollMonths(employees, today, runs)
  const period = typeof body.obdobie === 'string' && months.includes(body.obdobie) ? body.obdobie : null
  if (!period) return c.text('Bad request', 400)
  const back = `/ucto/klienti/${company.id}/mzdy?obdobie=${period}`
  const run = runs.find((r) => r.period === period) ?? null
  if (run?.closedOn) return c.redirect(`${back}&ok=mzdy-uz`, 303)
  if (!supportsPayrollPeriod(period)) return c.redirect(`${back}&ok=mzdy-nepodporovane`, 303)
  const values: Record<string, string> = {}
  const errors: FieldErrors = {}
  const proposed = monthSlips(period, employees, run, { leaves, runs, settlements })
  const lines = proposed.map((l) => {
    const e = employees.find((x) => x.id === l.employeeId)!
    const read = readParts(body as Record<string, unknown>, l.employeeId, e.contract, e.wageKind, e.wage)
    Object.assign(values, read.values)
    for (const [name, code] of Object.entries(read.errors)) errors[name] = PART_ERRORS[code]
    return { employeeId: l.employeeId, name: l.name, insurer: l.insurer, gross: 0, parts: read.parts }
  })
  const paydayText = typeof body.vyplata === 'string' ? body.vyplata.trim().slice(0, 16) : ''
  values.vyplata = paydayText
  const payday = dayOfText(paydayText)
  if (!payday || payday < `${period}-01`) errors.vyplata = t.payroll.errors.paydayDate
  if (Object.keys(errors).length > 0 || !payday) return payrollPage(c, company, period, { month: { values, errors } })
  const slips = monthSlips(period, employees, { period, payday, lines, closedOn: null, closedByName: null }, { leaves, runs, settlements })
  const typed = slips.map((l) => ({ employeeId: l.employeeId, name: l.name, insurer: l.insurer, gross: l.gross, parts: l.parts }))
  const close = body.akcia === 'uzavriet'
  if (!close) {
    await db.batch([saveRunStatement(db, company.id, period, payday, typed, who.user.id, now()), eventStatement(db, { company: company.id, user: who.user.id, action: 'payroll.saved', subject: period })])
    return c.redirect(`${back}&ok=mzdy-ulozene`, 303)
  }
  if (today <= monthRange(period).to) return c.redirect(`${back}&ok=mzdy-bezi`, 303)
  if (lines.length === 0) return c.redirect(`${back}&ok=mzdy-nikto`, 303)
  if (monthIssues(slips).length > 0) {
    await db.batch([saveRunStatement(db, company.id, period, payday, typed, who.user.id, now())])
    return c.redirect(`${back}&ok=mzdy-doplnit`, 303)
  }
  const evidenceId = crypto.randomUUID(), closedAt = now()
  const stored = slips.map(storedLine)
  const [done] = await db.batch([
    closeRunStatement(db, company.id, period, payday, stored, who.user.id, today, closedAt, evidenceId, sourceRevision),
    ...await closureStatements(db, company, { company_id: company.id, period, payday, lines: JSON.stringify(stored), closed_at: closedAt, evidence_id: evidenceId }, evidenceId, who.user.id),
  ])
  if ((done?.meta?.changes ?? 0) === 0) return c.redirect(`${back}&ok=mzdy-zmenene`, 303)
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
  if (!supportsPayrollPeriod(period)) return c.redirect(`/ucto/klienti/${company.id}/mzdy?obdobie=${period}&ok=mzdy-nepodporovane`, 303)
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

/**
 * A sick leave written or changed: its person (of this company), its first day within the employment, its last day
 * (empty while it lasts), its daily base (empty: proposed). Never over another of the same person, never changing what
 * a closed month paid.
 */
teamRoutes.post('/klienti/:id/mzdy/pn', async (c) => {
  const company = await companyParam(c)
  if (!company) return missingPage(c)
  const db = c.env.DB
  const body = await c.req.parseBody()
  const text = (name: string, max: number) => (typeof body[name] === 'string' ? (body[name] as string).trim().slice(0, max) : '')
  const { employees, runs, leaves } = await payrollData(db, company)
  const period = text('obdobie', 7)
  const existing = typeof body.id === 'string' && body.id !== '' ? (leaves.find((l) => l.id === body.id) ?? null) : null
  if (typeof body.id === 'string' && body.id !== '' && !existing) return missingPage(c)
  const values = { zamestnanec: text('zamestnanec', 64), od: text('od', 16), do: text('do', 16), dvz: text('dvz', 14) }
  const errors: FieldErrors = {}
  const employee = employees.find((e) => e.id === values.zamestnanec) ?? null
  if (!employee || (existing && existing.employeeId !== employee.id)) errors.zamestnanec = t.payroll.errors.sickEmployee
  const from = dayOfText(values.od)
  if (!from) errors.od = t.payroll.errors.day
  const to = dayOfText(values.do)
  if (to === null) errors.do = t.payroll.errors.day
  else if (to && from && to < from) errors.do = t.payroll.errors.sickTo
  const dvz = tenThousandthsOf(values.dvz)
  if (dvz !== null && (Number.isNaN(dvz) || dvz <= 0)) errors.dvz = t.payroll.errors.dvz
  const leave: SickLeave | null = employee && from && to !== null ? { id: existing?.id ?? crypto.randomUUID(), employeeId: employee.id, from, to: to || null, dvz: dvz !== null && !Number.isNaN(dvz) ? dvz : null } : null
  if (leave && employee && !errors.od) {
    if (leave.from < employee.startedOn || (employee.endedOn && leave.from > employee.endedOn)) errors.od = t.payroll.errors.sickOutside
    const end = (l: SickLeave) => l.to ?? '9999-12-31'
    if (leaves.some((l) => l.id !== leave.id && l.employeeId === leave.employeeId && l.from <= end(leave) && leave.from <= end(l))) errors.od = t.payroll.errors.sickOverlap
    else if (leaveTouchesClosed(existing, leave, runs, employee)) errors.od = t.payroll.errors.sickClosed
  }
  if (Object.keys(errors).length > 0 || !leave) return payrollPage(c, company, period, { sick: { id: existing?.id ?? null, values, errors } })
  await db.batch([
    sickLeaveStatement(db, company.id, leave, c.get('who').user.id, now()),
    eventStatement(db, { company: company.id, user: c.get('who').user.id, action: existing ? 'payroll.sick.changed' : 'payroll.sick.added', subject: leave.id }),
  ])
  return c.redirect(`/ucto/klienti/${company.id}/mzdy?obdobie=${encodeURIComponent(/^\d{4}-\d{2}$/.test(period) ? period : '')}&ok=mzdy-pn#pn`, 303)
})

/** A sick leave entered by mistake, removed (never one a closed month paid by). */
teamRoutes.post('/klienti/:id/mzdy/pn/:leave/odstranit', async (c) => {
  const company = await companyParam(c)
  if (!company) return missingPage(c)
  const db = c.env.DB
  const body = await c.req.parseBody()
  const period = typeof body.obdobie === 'string' && /^\d{4}-\d{2}$/.test(body.obdobie) ? body.obdobie : ''
  const { employees, runs, leaves } = await payrollData(db, company)
  const leave = leaves.find((l) => l.id === c.req.param('leave'))
  const employee = leave ? employees.find((e) => e.id === leave.employeeId) : undefined
  if (!leave || !employee) return missingPage(c)
  if (leaveTouchesClosed(leave, null, runs, employee)) return c.redirect(`/ucto/klienti/${company.id}/mzdy?obdobie=${period}&ok=mzdy-pn-uzavrete#pn`, 303)
  await db.batch([
    removeSickLeaveStatement(db, company.id, leave.id, c.get('who').user.id, now()),
    eventStatement(db, { company: company.id, user: c.get('who').user.id, action: 'payroll.sick.removed', subject: leave.id }),
  ])
  return c.redirect(`/ucto/klienti/${company.id}/mzdy?obdobie=${period}&ok=mzdy-pn-odstranena#pn`, 303)
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
    vztah: e?.contract ?? 'employment',
    pravidelny: !e || regularOf(e.contract, e.regular) ? '1' : '',
    dochodok: e?.pension ?? 'none',
    oop: e?.exemption ? '1' : '',
    odmenovanie: e?.wageKind ?? 'monthly',
    hodiny: hundredthsText(e?.weeklyHours ?? 4000),
    dovolenka: e?.leaveDays !== null && e?.leaveDays !== undefined ? hundredthsText(e.leaveDays) : '',
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
  const contract = field('vztah', 16) || 'employment'
  if (!isContract(contract)) errors.vztah = t.payroll.errors.contract
  const pension = field('dochodok', 16) || 'none'
  const wageKind = field('odmenovanie', 16) === 'hourly' ? 'hourly' : 'monthly'
  values.odmenovanie = wageKind
  const weekly = hundredthsOf(field('hodiny', 6) || '40')
  if (weekly === null || Number.isNaN(weekly) || weekly < 100 || weekly > 4800) errors.hodiny = t.payroll.errors.weekly
  const leaveText = field('dovolenka', 6)
  const leaveDays = leaveText === '' ? null : hundredthsOf(leaveText)
  if (leaveDays !== null && (Number.isNaN(leaveDays) || leaveDays < 2000 || leaveDays > 6000)) errors.dovolenka = t.payroll.errors.leave
  for (const tick of ['vyhlasenie', 'ztp', 'op', 'vynimka', 'pravidelny', 'oop']) values[tick] = body[tick] === '1' ? '1' : ''
  if (values.oop === '1' && isContract(contract) && isPension(pension) && !exemptionAllowed(contract, pension, regularOf(contract, values.pravidelny === '1'))) errors.oop = t.payroll.errors.exemption
  const children: { name: string; born: string }[] = []
  for (let i = 0; i < CHILD_ROWS; i++) {
    const childName = field(`dieta_${i}`, 80)
    const childBorn = dayOfText(field(`narodene_${i}`, 16))
    if (childName === '' && childBorn === '') continue
    if (childName.length < 1 || !childBorn) errors[`dieta_${i}`] = t.payroll.errors.child
    else children.push({ name: childName, born: childBorn })
  }
  if (Object.keys(errors).length > 0 || !started || wage === null || !isInsurer(insurer) || !isContract(contract) || weekly === null)
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
    contract,
    regular: regularOf(contract, values.pravidelny === '1'),
    pension: isPension(pension) ? pension : 'none',
    exemption: values.oop === '1',
    wageKind,
    weeklyHours: weekly,
    leaveDays: leaveDays !== null && !Number.isNaN(leaveDays) ? leaveDays : null,
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
  const { employees, runs, leaves, settlements } = await payrollData(c.env.DB, company)
  const months = payrollMonths(employees, today, runs)
  const period = c.req.query('obdobie') ?? ''
  if (!months.includes(period)) return missingPage(c)
  const run = runs.find((r) => r.period === period) ?? null
  if (!run?.closedOn && !supportsPayrollPeriod(period)) return missingPage(c)
  const line = monthSlips(period, employees, run, { leaves, runs, settlements }).find((l) => l.employeeId === c.req.query('zamestnanec'))
  if (!line) return missingPage(c)
  return shell(c, 'clients', `${t.payroll.payslip}: ${line.name}`, <PayslipPage company={company} period={period} line={line} today={today} />)
})

// ---------------------------------------------------------------------------------------------------------------
// The annual settlement of the income tax advances (ročné zúčtovanie)
// ---------------------------------------------------------------------------------------------------------------

/** The year a settlement page opens on: last year until the end of June, else this one. */
const settlementYear = (asked: unknown, today: string): number => {
  const n = Number(asked)
  if (Number.isInteger(n) && n >= 2020 && n <= Number(today.slice(0, 4))) return n
  return today.slice(5, 7) <= '06' ? Number(today.slice(0, 4)) - 1 : Number(today.slice(0, 4))
}

const settlementValues = (i: SettlementInputs): Record<string, string> => ({
  poziadal: i.requested ? '1' : '',
  ine_taxable: i.other.taxable ? moneyText(i.other.taxable) : '',
  ine_insurance: i.other.insurance ? moneyText(i.other.insurance) : '',
  ine_advance: i.other.advance ? moneyText(i.other.advance) : '',
  ine_bonus: i.other.bonus ? moneyText(i.other.bonus) : '',
  ine_months: i.other.months ? String(i.other.months) : '',
  manzel_mesiace: i.spouseMonths ? String(i.spouseMonths) : '',
  manzel_prijem: i.spouseIncome ? moneyText(i.spouseIncome) : '',
  dds: i.dds ? moneyText(i.dds) : '',
  dochodok: i.pension ? moneyText(i.pension) : '',
  zuctovat: i.settleIn ?? '',
})

async function settlementPage(c: Ctx, company: Company, asked: unknown, form?: { employeeId: string; values: Record<string, string>; errors: FieldErrors }) {
  const db = c.env.DB
  const today = dayOf(now())
  const year = settlementYear(asked, today)
  const [{ employees, runs }, settlements] = await Promise.all([payrollData(db, company), settlementsOf(db, company.id)])
  const supported = supportsPayrollPeriod(`${year}-01`)
  const first = employees.reduce<number>((min, e) => Math.min(min, Number(e.startedOn.slice(0, 4))), Number(today.slice(0, 4)))
  const years: number[] = []
  for (let y = Number(today.slice(0, 4)); y >= first && years.length < 6; y--) years.unshift(y)
  const closedMonths = new Set(runs.filter((r) => r.closedOn).map((r) => r.period))
  const months = Array.from({ length: 12 }, (_, i) => `${year + 1}-${String(i + 1).padStart(2, '0')}`).filter((m) => !closedMonths.has(m))
  const rows: SettlementRow[] = supported
    ? employees.flatMap((e) => {
        const income = yearIncome(e.id, runs, year)
        if (income.months.length === 0) return []
        const saved = settlements.find((x) => x.employeeId === e.id && x.year === year)
        const locked = settledInClosed(saved, runs)
        const fresh = saved?.inputs.requested ? settle(year, income, e.children, saved.inputs) : null
        const stale = Boolean(saved?.result && fresh && !locked && JSON.stringify(fresh) !== JSON.stringify(saved.result))
        const state: SettlementState = !saved?.inputs.requested
          ? { kind: 'none' }
          : locked && saved.inputs.settleIn
            ? { kind: 'closed', month: saved.inputs.settleIn }
            : stale
              ? { kind: 'stale' }
              : saved.inputs.settleIn
                ? { kind: 'due', month: saved.inputs.settleIn }
                : { kind: 'ready' }
        const own = form?.employeeId === e.id
        return [{ employee: e, income, result: saved?.result ?? null, state, locked, values: own ? form.values : settlementValues(saved?.inputs ?? EMPTY_SETTLEMENT), errors: own ? form.errors : {} }]
      })
    : []
  const failed = Boolean(form && Object.keys(form.errors).length > 0)
  return shell(
    c,
    'clients',
    `${t.payroll.settlement.title}: ${company.name}`,
    <SettlementPage company={company} year={year} years={years} supported={supported} rows={rows} months={months} flash={failed ? null : flashOf(c)} error={failed ? t.payroll.flashes.fix : null} />,
    failed ? 422 : 200,
  )
}

teamRoutes.get('/klienti/:id/mzdy/rocne', async (c) => {
  const company = await companyParam(c)
  return company ? settlementPage(c, company, c.req.query('rok')) : missingPage(c)
})

/** An employee's settlement worked out and kept, with the month it is settled in (never one closed). */
teamRoutes.post('/klienti/:id/mzdy/rocne', async (c) => {
  const company = await companyParam(c)
  if (!company) return missingPage(c)
  const db = c.env.DB
  const body = await c.req.parseBody()
  const today = dayOf(now())
  const year = settlementYear(body.rok, today)
  if (!supportsPayrollPeriod(`${year}-01`)) return c.text('Bad request', 400)
  const [{ employees, runs }, settlements] = await Promise.all([payrollData(db, company), settlementsOf(db, company.id)])
  const employee = employees.find((e) => e.id === body.zamestnanec)
  if (!employee) return missingPage(c)
  const saved = settlements.find((x) => x.employeeId === employee.id && x.year === year)
  if (settledInClosed(saved, runs)) return c.redirect(`/ucto/klienti/${company.id}/mzdy/rocne?rok=${year}&ok=rz-uzavrete#rz-${employee.id}`, 303)
  const text = (name: string) => (typeof body[name] === 'string' ? (body[name] as string).trim().slice(0, 16) : '')
  const values: Record<string, string> = {}
  const errors: FieldErrors = {}
  const amount = (name: string) => {
    values[name] = text(name)
    const n = centsOf(values[name] as string)
    if (n !== null && (Number.isNaN(n) || n < 0)) {
      errors[name] = t.payroll.errors.amount
      return 0
    }
    return n ?? 0
  }
  const months = (name: string) => {
    values[name] = text(name)
    const n = values[name] === '' ? 0 : Number(values[name])
    if (!Number.isInteger(n) || n < 0 || n > 12) {
      errors[name] = t.payroll.settlement.errors.months
      return 0
    }
    return n
  }
  values.poziadal = body.poziadal === '1' ? '1' : ''
  const settleIn = typeof body.zuctovat === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(body.zuctovat) ? body.zuctovat : null
  values.zuctovat = settleIn ?? ''
  const inputs: SettlementInputs = {
    requested: values.poziadal === '1',
    other: { taxable: amount('ine_taxable'), insurance: amount('ine_insurance'), advance: amount('ine_advance'), bonus: amount('ine_bonus'), months: months('ine_months') },
    spouseMonths: months('manzel_mesiace'),
    spouseIncome: amount('manzel_prijem'),
    dds: amount('dds'),
    pension: amount('dochodok'),
    settleIn,
  }
  const result = settle(year, yearIncome(employee.id, runs, year), employee.children, inputs)
  // § 38 (the Financial Directorate, 405687 and 903886): what is refunded (an overpayment, the bonus owed) with the wage for April at the latest; an underpayment
  // withheld by the end of the year the settlement is made in.
  const latest = result.taxDifference < 0 || result.bonusDifference > 0 ? `${year + 1}-04` : `${year + 1}-12`
  if (settleIn && (settleIn < `${year + 1}-01` || settleIn > latest || runs.some((r) => r.closedOn && r.period === settleIn) || !supportsPayrollPeriod(settleIn))) errors.zuctovat = t.payroll.settlement.errors.settleIn
  if (settleIn && !inputs.requested) errors.poziadal = t.payroll.settlement.errors.requested
  if (Object.keys(errors).length > 0) return settlementPage(c, company, year, { employeeId: employee.id, values, errors })
  await db.batch([
    settlementStatement(db, company.id, employee.id, year, inputs, result, c.get('who').user.id, now()),
    eventStatement(db, { company: company.id, user: c.get('who').user.id, action: 'payroll.settlement', subject: `${employee.id}:${year}` }),
  ])
  return c.redirect(`/ucto/klienti/${company.id}/mzdy/rocne?rok=${year}&ok=rz#rz-${employee.id}`, 303)
})

/** An employee's statement of taxable income of a year, to print. */
teamRoutes.get('/klienti/:id/mzdy/potvrdenie', async (c) => {
  const company = await companyParam(c)
  if (!company) return missingPage(c)
  const today = dayOf(now())
  const year = Number(c.req.query('rok'))
  const { employees, runs } = await payrollData(c.env.DB, company)
  const employee = employees.find((e) => e.id === c.req.query('zamestnanec'))
  if (!employee || !Number.isInteger(year)) return missingPage(c)
  const income = yearIncome(employee.id, runs, year)
  if (income.months.length === 0) return missingPage(c)
  let social = 0
  let health = 0
  const bonusMonths: string[] = []
  for (const run of runs) {
    if (!run.closedOn || !run.period.startsWith(`${year}-`)) continue
    const slip = run.lines.find((l) => l.employeeId === employee.id)?.slip
    if (!slip) continue
    social += slip.socialEmployee
    health += slip.healthEmployee
    if (slip.bonus > 0) bonusMonths.push(run.period)
  }
  return shell(c, 'clients', `${t.payroll.settlement.certificate}: ${employee.name}`, <CertificatePage company={company} employee={employee} year={year} income={{ ...income, social, health, bonusMonths: bonusMonths.sort() }} today={today} />)
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
    <TrialPage company={b.company} books={b.books} tb={trialBalance(b.books, b.year, b.month)} years={b.years} year={b.year} month={b.month} today={b.today} lockedThrough={(await periodLock(c.env.DB, b.company.id))?.through} flash={flashOf(c)} />,
  )
})

async function periodsPage(c: Ctx, company: Company, extra: Partial<Pick<PeriodPageProps, 'values' | 'error' | 'blockers'>> = {}, status: ContentfulStatusCode = 200) {
  const db = c.env.DB
  const revision = await dataRevision(db, company.id)
  // Company settings also affect the books; read them after the revision, rather than reuse an earlier route lookup.
  const currentCompany = await teamCompany(db, c.get('who').user, company.id)
  if (!currentCompany) return missingPage(c)
  const [lock, history, books] = await Promise.all([periodLock(db, company.id), lockHistory(db, company.id), booksOf(db, currentCompany)])
  return shell(c, 'clients', `Uzamknutie období: ${company.name}`, <PeriodPage company={company} lock={lock} history={history} revision={revision} today={dayOf(now())} start={books.start}
    flash={c.req.query('ok') === 'uzamknute' ? 'Obdobie je uzamknuté.' : c.req.query('ok') === 'otvorene' ? 'Obdobie je otvorené. Dôvod je uložený v histórii.' : null} {...extra} />, status)
}

teamRoutes.get('/klienti/:id/kniha/obdobia', async (c) => {
  const company = await companyParam(c)
  return company ? periodsPage(c, company) : missingPage(c)
})

teamRoutes.post('/klienti/:id/kniha/obdobia', async (c) => {
  const company = await companyParam(c)
  if (!company) return missingPage(c)
  const body = await c.req.parseBody()
  const text = (key: string) => typeof body[key] === 'string' ? (body[key] as string).trim() : ''
  const values: LockValues = { action: text('akcia'), month: text('mesiac'), reason: text('dovod') }
  const fail = (error: string, status: ContentfulStatusCode = 422, blockers?: PeriodPageProps['blockers']) => periodsPage(c, company, { values, error, blockers }, status)
  const version = Number(text('verzia')), revision = Number(text('revizia'))
  const db = c.env.DB
  const currentRevision = await dataRevision(db, company.id)
  const currentCompany = await teamCompany(db, c.get('who').user, company.id)
  if (!currentCompany) return missingPage(c)
  const [lock, books] = await Promise.all([periodLock(db, company.id), booksOf(db, currentCompany)])
  if (!/^\d+$/.test(text('verzia')) || !/^\d+$/.test(text('revizia')) || !Number.isSafeInteger(version) || !Number.isSafeInteger(revision)
    || version !== (lock?.version ?? 0) || revision !== currentRevision) return fail('Údaje sa medzičasom zmenili. Skontrolujte aktuálny stav a odošlite formulár znova.', 409)
  const target = lockTarget(values, lock?.through ?? null, dayOf(now()), books.start)
  if ('error' in target) return fail(target.error)
  if (values.reason.length > 1000) return fail('Poznámka môže mať najviac 1 000 znakov.')
  if (values.action === 'lock' && target.through) {
    if (!books.start) return fail('Najprv nastavte začiatok účtovníctva alebo počiatočné stavy.')
    const blockers = lockBlockers(books, target.through)
    if (blockers.documents + blockers.payments > 0) return fail('Vybrané obdobie obsahuje nedoriešené účtovné zápisy.', 422, blockers)
  }
  const result = await changeLockStatement(db, company.id, target.through, values.reason, c.get('who').user.id, version, revision).run()
  if ((result.meta?.changes ?? 0) === 0) return fail('Údaje sa medzičasom zmenili. Skontrolujte aktuálny stav a odošlite formulár znova.', 409)
  return c.redirect(`${bookPath(company, 'periods')}?ok=${values.action === 'lock' ? 'uzamknute' : 'otvorene'}`, 303)
})

teamRoutes.get('/klienti/:id/kniha/dennik', async (c) => {
  const b = await booksPage(c)
  if (!b) return missingPage(c)
  return shell(c, 'clients', `${t.ledger.journalTitle}: ${b.company.name}`, <JournalPage company={b.company} books={b.books} years={b.years} year={b.year} month={b.month} page={Number(c.req.query('strana') ?? 1)} />)
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
    <AccountPage company={b.company} books={b.books} account={account} name={accountName(account, b.books.banks)} {...moves} years={b.years} year={b.year} month={b.month} page={Number(c.req.query('strana') ?? 1)} />,
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

// ---------------------------------------------------------------------------------------------------------------
// The register of fixed assets (17 October 2026; src/app/assets.ts): every size of company has assets
// ---------------------------------------------------------------------------------------------------------------

const ASSET_LOCKED = 'Toto zasahuje do uzamknutého obdobia. Najprv ho otvorte v časti Uzamknutie období.'

/** What the form of an asset sent: its values to show again, and the asset when every part of it is right. */
function assetFromForm(body: Record<string, unknown>): { values: AssetValues; input: AssetInput | null; errors: AssetFormErrors } {
  const text = (key: string, max: number) => (typeof body[key] === 'string' ? (body[key] as string).trim().slice(0, max) : '')
  const values: AssetValues = {
    name: text('nazov', 160),
    account: text('ucet', 3),
    inUseOn: text('zaradenie', 10),
    cost: text('cena', 20),
    group: text('skupina', 1),
    method: text('metoda', 12) === 'accelerated' ? 'accelerated' : 'straight',
    car: body.auto === '1',
    books: text('uctovne', 10) === 'months' ? 'months' : 'tax',
    months: text('mesiace', 5),
    source: text('povod', 10) === 'opening' ? 'opening' : 'purchase',
    priorBook: text('opravky', 20),
    priorTax: text('danove', 20),
    priorYears: text('roky', 3),
    note: text('poznamka', 300),
  }
  const account = isAssetAccount(values.account) ? values.account : null
  const intangible = account !== null && assetKind(account) === 'intangible'
  const cost = moneyOf(values.cost)
  const months = values.books === 'months' || intangible ? Number.parseInt(values.months, 10) : null
  const priorTax = values.source === 'opening' ? (moneyOf(values.priorTax) ?? 0) : 0
  const priorBook = values.source === 'opening' ? (values.books === 'tax' && !intangible ? priorTax : (moneyOf(values.priorBook) ?? 0)) : 0
  const candidate = {
    name: values.name,
    account: (account ?? values.account) as AssetAccount,
    inUseOn: values.inUseOn,
    costCents: cost === null || Number.isNaN(cost) ? 0 : cost,
    taxGroup: intangible || values.group === '' ? null : Number(values.group),
    taxMethod: intangible ? ('straight' as const) : values.method === 'accelerated' ? ('accelerated' as const) : ('straight' as const),
    car: !intangible && values.car,
    bookMonths: months === null || Number.isNaN(months) ? (intangible || values.books === 'months' ? Number.NaN : null) : months,
    source: values.source,
    priorBookCents: Number.isNaN(priorBook) ? -1 : priorBook,
    priorTaxCents: Number.isNaN(priorTax) ? -1 : priorTax,
    priorTaxYears: values.source === 'opening' ? Number.parseInt(values.priorYears || '0', 10) : 0,
    disposedOn: null,
    disposal: null,
  }
  const errors: AssetFormErrors = assetErrors(candidate)
  if (dayOfText(values.inUseOn) === null && !/^\d{4}-\d{2}-\d{2}$/.test(values.inUseOn)) errors.inUseOn = 'Zadajte deň zaradenia do užívania.'
  if (Object.keys(errors).length > 0 || !account) return { values, input: null, errors }
  return {
    values,
    input: {
      name: candidate.name,
      account,
      documentId: null,
      costCents: candidate.costCents,
      inUseOn: candidate.inUseOn,
      taxGroup: candidate.taxGroup,
      taxMethod: candidate.taxMethod,
      car: candidate.car,
      bookMonths: candidate.bookMonths,
      source: candidate.source,
      priorBookCents: candidate.priorBookCents,
      priorTaxCents: candidate.priorTaxCents,
      priorTaxYears: Number.isNaN(candidate.priorTaxYears) ? 0 : candidate.priorTaxYears,
      note: values.note || null,
    },
    errors,
  }
}

async function assetsPage(c: Ctx, company: Company, form: { values?: AssetValues; errors?: AssetFormErrors } = {}, status: ContentfulStatusCode = 200) {
  const today = dayOf(now())
  const year = Number(today.slice(0, 4))
  const assets = await assetsOf(c.env.DB, company.id)
  const flash = c.req.query('ok') === 'pridane' ? 'Majetok je v evidencii.' : c.req.query('ok') === 'odstranene' ? 'Majetok sme z evidencie odstránili.' : null
  return shell(
    c,
    'clients',
    `Majetok: ${company.name}`,
    <AssetsPage company={company} rows={assets.map((a) => assetRow(a, today))} year={year} summary={assetYear(assets, year)} values={form.values ?? emptyAssetValues(today)} errors={form.errors ?? {}} flash={flash} today={today} />,
    status,
  )
}

async function assetPage(c: Ctx, company: Company, form: { values?: AssetValues; errors?: AssetFormErrors; flash?: string | null } = {}, status: ContentfulStatusCode = 200) {
  const asset = (await assetsOf(c.env.DB, company.id)).find((a) => a.id === c.req.param('asset'))
  if (!asset) return missingPage(c)
  const flash = form.flash ?? (c.req.query('ok') === 'ulozene' ? 'Zmeny sú uložené.' : c.req.query('ok') === 'vyradene' ? 'Vyradenie je zapísané.' : null)
  return shell(c, 'clients', `${asset.name}: ${company.name}`, <AssetPage company={company} asset={asset} values={form.values ?? assetValuesOf(asset)} errors={form.errors ?? {}} flash={flash} today={dayOf(now())} />, status)
}

teamRoutes.get('/klienti/:id/kniha/majetok', async (c) => {
  const company = await companyParam(c)
  return company ? assetsPage(c, company) : missingPage(c)
})

teamRoutes.post('/klienti/:id/kniha/majetok', async (c) => {
  const company = await companyParam(c)
  if (!company) return missingPage(c)
  const { values, input, errors } = assetFromForm(await c.req.parseBody())
  if (!input) return assetsPage(c, company, { values, errors }, 422)
  const id = crypto.randomUUID()
  const who = c.get('who')
  try {
    await c.env.DB.batch([insertAssetStatement(c.env.DB, company.id, id, input, who.user.id), eventStatement(c.env.DB, { company: company.id, user: who.user.id, action: 'asset.added', subject: id })])
  } catch (err) {
    if (isPeriodLocked(err)) return assetsPage(c, company, { values, errors: { form: ASSET_LOCKED } }, 409)
    throw err
  }
  return c.redirect(`${bookPath(company)}/majetok?ok=pridane`, 303)
})

teamRoutes.get('/klienti/:id/kniha/majetok/:asset', async (c) => {
  const company = await companyParam(c)
  return company ? assetPage(c, company) : missingPage(c)
})

teamRoutes.post('/klienti/:id/kniha/majetok/:asset', async (c) => {
  const company = await companyParam(c)
  if (!company) return missingPage(c)
  const id = c.req.param('asset')
  if (!(await assetsOf(c.env.DB, company.id)).some((a) => a.id === id)) return missingPage(c)
  const { values, input, errors } = assetFromForm(await c.req.parseBody())
  if (!input) return assetPage(c, company, { values, errors }, 422)
  const who = c.get('who')
  try {
    await c.env.DB.batch([updateAssetStatement(c.env.DB, company.id, id, input, who.user.id), eventStatement(c.env.DB, { company: company.id, user: who.user.id, action: 'asset.changed', subject: id })])
  } catch (err) {
    if (isPeriodLocked(err)) return assetPage(c, company, { values, errors: { form: ASSET_LOCKED } }, 409)
    throw err
  }
  return c.redirect(`${bookPath(company)}/majetok/${id}?ok=ulozene`, 303)
})

teamRoutes.post('/klienti/:id/kniha/majetok/:asset/vyradit', async (c) => {
  const company = await companyParam(c)
  if (!company) return missingPage(c)
  const asset = (await assetsOf(c.env.DB, company.id)).find((a) => a.id === c.req.param('asset'))
  if (!asset) return missingPage(c)
  const body = await c.req.parseBody()
  const undo = body.zrusit === '1'
  const day = typeof body.den === 'string' ? body.den.trim() : ''
  const how = typeof body.sposob === 'string' && (DISPOSALS as readonly string[]).includes(body.sposob) ? (body.sposob as Disposal) : null
  if (!undo && (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day < asset.inUseOn || !how)) return assetPage(c, company, { errors: { disposal: 'Zadajte deň a spôsob vyradenia, nie pred zaradením.' } }, 422)
  const who = c.get('who')
  try {
    await c.env.DB.batch([
      disposeAssetStatement(c.env.DB, company.id, asset.id, undo ? null : day, undo ? null : how, who.user.id),
      eventStatement(c.env.DB, { company: company.id, user: who.user.id, action: undo ? 'asset.restored' : 'asset.disposed', subject: asset.id, ...(undo ? {} : { detail: { on: day, how } }) }),
    ])
  } catch (err) {
    if (isPeriodLocked(err)) return assetPage(c, company, { errors: { disposal: ASSET_LOCKED } }, 409)
    throw err
  }
  return c.redirect(`${bookPath(company)}/majetok/${asset.id}?ok=vyradene`, 303)
})

teamRoutes.post('/klienti/:id/kniha/majetok/:asset/odstranit', async (c) => {
  const company = await companyParam(c)
  if (!company) return missingPage(c)
  const asset = (await assetsOf(c.env.DB, company.id)).find((a) => a.id === c.req.param('asset'))
  if (!asset) return missingPage(c)
  const who = c.get('who')
  try {
    await c.env.DB.batch([removeAssetStatement(c.env.DB, company.id, asset.id, who.user.id), eventStatement(c.env.DB, { company: company.id, user: who.user.id, action: 'asset.removed', subject: asset.id })])
  } catch (err) {
    if (isPeriodLocked(err)) return assetPage(c, company, { errors: { form: ASSET_LOCKED } }, 409)
    throw err
  }
  return c.redirect(`${bookPath(company)}/majetok?ok=odstranene`, 303)
})

// ---------------------------------------------------------------------------------------------------------------
// Stock (17 October 2026; src/app/stock.ts): items, receipts, issues and counts, pasted lists, each item's card
// ---------------------------------------------------------------------------------------------------------------

const STOCK_LOCKED = 'Toto zasahuje do uzamknutého obdobia. Najprv ho otvorte v časti Uzamknutie období.'

/** The company's documents a receipt or an issue may name, the newest first. */
async function stockDocuments(db: D1Database, company: string): Promise<StockDocument[]> {
  const rows = await db
    .prepare("SELECT id, number, party, issued_on FROM documents WHERE company_id = ? AND deleted_at IS NULL AND kind IN ('invoice_in', 'invoice_out', 'receipt') ORDER BY COALESCE(issued_on, '') DESC, created_at DESC LIMIT 300")
    .bind(company)
    .all<Record<string, unknown>>()
  return rows.results.map((r) => ({ id: String(r.id), label: [r.number ?? 'bez čísla', r.party, typeof r.issued_on === 'string' ? dayName(r.issued_on) : null].filter(Boolean).join(', ') }))
}

const emptyMove = (day: string): MoveValues => ({ kind: 'in', item: '', on: day, quantity: '', value: '', document: '', note: '' })
const emptyItem = (): ItemValues => ({ code: '', name: '', unit: 'ks', kind: 'goods' })

/** What a set of new moves would leave short: the first item and move that would go below nought. */
function stockShort(stock: Stock, added: readonly StockMove[]): { item: string; move: StockMove } | null {
  if (!stock.settings || stock.settings.method === 'B') return null
  for (const itemId of new Set(added.map((m) => m.itemId))) {
    const moves = [...stock.moves.filter((m) => m.itemId === itemId), ...added.filter((m) => m.itemId === itemId)]
    const short = shortOf(valueItem(moves, stock.settings))
    if (short) return { item: stock.items.find((i) => i.id === itemId)?.code ?? itemId, move: short }
  }
  return null
}

async function stockPage(
  c: Ctx,
  company: Company,
  form: { item?: { values: ItemValues; errors: ItemErrors }; move?: { values: MoveValues; errors: MoveErrors }; paste?: { moves: string; items: string; errors: string[] }; error?: string } = {},
  status: ContentfulStatusCode = 200,
) {
  const today = dayOf(now())
  const asked = c.req.query('ku') ?? ''
  const day = /^\d{4}-\d{2}-\d{2}$/.test(asked) ? asked : today
  const [stock, books, documents] = await Promise.all([stockOf(c.env.DB, company.id), booksOf(c.env.DB, company), stockDocuments(c.env.DB, company.id)])
  const summary = stock.settings ? stockSummary(stock.settings, stock.items, stock.moves, day) : { items: stock.items.map((item) => ({ item, quantity: 0, value: 0 })), kinds: { goods: 0, material: 0, products: 0 } }
  const bookValues = Object.fromEntries(STOCK_KINDS.map((k) => [k, accountBalance(books.entries, STOCK_ACCOUNTS[k].stock, day)])) as Record<StockKind, number>
  const ok = c.req.query('ok')
  const flash = ok === 'nastavenie' ? 'Spôsob vedenia skladu je uložený.' : ok === 'polozka' ? 'Položka je pridaná.' : ok === 'pohyb' ? 'Pohyb je zapísaný a zaúčtovaný.' : ok === 'vlozene' ? `Vložili sme ${c.req.query('n') ?? ''} riadkov.` : ok === 'odstranene' ? 'Odstránené.' : null
  return shell(
    c,
    'clients',
    `Sklad: ${company.name}`,
    <StockPage
      company={company}
      settings={stock.settings}
      rows={summary.items}
      kinds={summary.kinds}
      books={bookValues}
      day={day}
      documents={documents}
      item={form.item ?? { values: emptyItem(), errors: {} }}
      move={form.move ?? { values: { ...emptyMove(today), item: stock.items[0]?.id ?? '', kind: stock.settings?.method === 'B' ? 'count' : 'in' }, errors: {} }}
      paste={form.paste ?? { moves: '', items: '', errors: [] }}
      flash={status === 200 ? flash : null}
      error={form.error ?? null}
    />,
    status,
  )
}

teamRoutes.get('/klienti/:id/kniha/sklad', async (c) => {
  const company = await companyParam(c)
  return company ? stockPage(c, company) : missingPage(c)
})

teamRoutes.post('/klienti/:id/kniha/sklad/nastavenie', async (c) => {
  const company = await companyParam(c)
  if (!company) return missingPage(c)
  const body = await c.req.parseBody()
  const method = body.sposob === 'B' ? 'B' : body.sposob === 'A' ? 'A' : null
  const valuation = body.ocenenie === 'fifo' ? 'fifo' : 'average'
  if (!method) return stockPage(c, company, { error: 'Vyberte spôsob A alebo B.' }, 422)
  const who = c.get('who')
  try {
    await c.env.DB.batch([stockSettingsStatement(c.env.DB, company.id, { method, valuation }, who.user.id), eventStatement(c.env.DB, { company: company.id, user: who.user.id, action: 'stock.settings', subject: company.id, detail: { method, valuation } })])
  } catch (err) {
    if (isPeriodLocked(err)) return stockPage(c, company, { error: STOCK_LOCKED }, 409)
    throw err
  }
  return c.redirect(`${bookPath(company)}/sklad?ok=nastavenie`, 303)
})

teamRoutes.post('/klienti/:id/kniha/sklad/polozky', async (c) => {
  const company = await companyParam(c)
  if (!company) return missingPage(c)
  const body = await c.req.parseBody()
  const stock = await stockOf(c.env.DB, company.id)
  const read = readItem((name) => body[name], new Set(stock.items.map((i) => i.code.toLowerCase())))
  if (!read.item) return stockPage(c, company, { item: { values: read.values, errors: read.errors } }, 422)
  const id = crypto.randomUUID()
  const who = c.get('who')
  await c.env.DB.batch([insertItemStatement(c.env.DB, company.id, id, read.item, who.user.id), eventStatement(c.env.DB, { company: company.id, user: who.user.id, action: 'stock.item.added', subject: id })])
  return c.redirect(`${bookPath(company)}/sklad?ok=polozka`, 303)
})

teamRoutes.post('/klienti/:id/kniha/sklad/pohyby', async (c) => {
  const company = await companyParam(c)
  if (!company) return missingPage(c)
  const body = await c.req.parseBody()
  const [stock, documents] = await Promise.all([stockOf(c.env.DB, company.id), stockDocuments(c.env.DB, company.id)])
  if (!stock.settings) return stockPage(c, company, { error: 'Najprv vyberte, ako firma vedie zásoby.' }, 422)
  const read = readMove((name) => body[name], stock.settings, stock.items, new Set(documents.map((d) => d.id)))
  if (!read.move) return stockPage(c, company, { move: { values: read.values, errors: read.errors } }, 422)
  const id = crypto.randomUUID()
  const at = now()
  const short = stockShort(stock, [{ ...read.move, id, number: '~', createdAt: at }])
  if (short) return stockPage(c, company, { move: { values: read.values, errors: { form: `Na sklade by chýbalo: položka ${short.item} by ${dayName(short.move.on)} klesla pod nulu. Skontrolujte množstvo a deň.` } } }, 422)
  const who = c.get('who')
  try {
    await c.env.DB.batch([insertMoveStatement(c.env.DB, company.id, id, read.move, who.user.id, at), eventStatement(c.env.DB, { company: company.id, user: who.user.id, action: 'stock.move.added', subject: id, detail: { kind: read.move.kind } })])
  } catch (err) {
    if (isPeriodLocked(err)) return stockPage(c, company, { move: { values: read.values, errors: { form: STOCK_LOCKED } } }, 409)
    throw err
  }
  return c.redirect(`${bookPath(company)}/sklad?ok=pohyb`, 303)
})

teamRoutes.post('/klienti/:id/kniha/sklad/vlozit-polozky', async (c) => {
  const company = await companyParam(c)
  if (!company) return missingPage(c)
  const body = await c.req.parseBody()
  const text = typeof body.riadky === 'string' ? body.riadky.slice(0, 400_000) : ''
  const stock = await stockOf(c.env.DB, company.id)
  const parsed = parseItemsCsv(text, new Set(stock.items.map((i) => i.code.toLowerCase())))
  if (parsed.errors.length > 0) return stockPage(c, company, { paste: { items: text, moves: '', errors: parsed.errors } }, 422)
  const who = c.get('who')
  const statements = parsed.items.map((item) => insertItemStatement(c.env.DB, company.id, crypto.randomUUID(), item, who.user.id))
  for (let i = 0; i < statements.length; i += 200) await c.env.DB.batch(statements.slice(i, i + 200))
  await c.env.DB.batch([eventStatement(c.env.DB, { company: company.id, user: who.user.id, action: 'stock.items.pasted', subject: company.id, detail: { count: parsed.items.length } })])
  return c.redirect(`${bookPath(company)}/sklad?ok=vlozene&n=${parsed.items.length}`, 303)
})

teamRoutes.post('/klienti/:id/kniha/sklad/vlozit-pohyby', async (c) => {
  const company = await companyParam(c)
  if (!company) return missingPage(c)
  const body = await c.req.parseBody()
  const text = typeof body.riadky === 'string' ? body.riadky.slice(0, 400_000) : ''
  const stock = await stockOf(c.env.DB, company.id)
  if (!stock.settings) return stockPage(c, company, { error: 'Najprv vyberte, ako firma vedie zásoby.' }, 422)
  const parsed = parseMovesCsv(text, stock.settings, stock.items)
  if (parsed.errors.length > 0) return stockPage(c, company, { paste: { moves: text, items: '', errors: parsed.errors } }, 422)
  const at = now()
  // Each line its own moment, in the order pasted, so that moves of one day keep their order.
  const moves = parsed.moves.map((m, i) => ({ ...m, id: crypto.randomUUID(), number: '~', createdAt: at + i / 1000 }))
  const short = stockShort(stock, moves)
  if (short) return stockPage(c, company, { paste: { moves: text, items: '', errors: [`Na sklade by chýbalo: položka ${short.item} by ${dayName(short.move.on)} klesla pod nulu. Nevložili sme nič.`] } }, 422)
  const who = c.get('who')
  // One transaction: the period lock refuses all of it, or none is refused.
  const statements = moves.map((m) => insertMoveStatement(c.env.DB, company.id, m.id, m, who.user.id, m.createdAt))
  try {
    await c.env.DB.batch([...statements, eventStatement(c.env.DB, { company: company.id, user: who.user.id, action: 'stock.moves.pasted', subject: company.id, detail: { count: moves.length } })])
  } catch (err) {
    if (isPeriodLocked(err)) return stockPage(c, company, { paste: { moves: text, items: '', errors: [STOCK_LOCKED] } }, 409)
    throw err
  }
  return c.redirect(`${bookPath(company)}/sklad?ok=vlozene&n=${moves.length}`, 303)
})

teamRoutes.post('/klienti/:id/kniha/sklad/pohyby/:move/odstranit', async (c) => {
  const company = await companyParam(c)
  if (!company) return missingPage(c)
  const stock = await stockOf(c.env.DB, company.id)
  const move = stock.moves.find((m) => m.id === c.req.param('move'))
  if (!move) return missingPage(c)
  // Removing a receipt may leave a later issue short.
  if (stock.settings && stock.settings.method === 'A') {
    const short = shortOf(valueItem(stock.moves.filter((m) => m.itemId === move.itemId && m.id !== move.id), stock.settings))
    if (short) return c.redirect(`${bookPath(company)}/sklad/${move.itemId}?chyba=chyba`, 303)
  }
  const who = c.get('who')
  try {
    await c.env.DB.batch([removeMoveStatement(c.env.DB, company.id, move.id, who.user.id), eventStatement(c.env.DB, { company: company.id, user: who.user.id, action: 'stock.move.removed', subject: move.id })])
  } catch (err) {
    if (isPeriodLocked(err)) return c.redirect(`${bookPath(company)}/sklad/${move.itemId}?chyba=uzamknute`, 303)
    throw err
  }
  return c.redirect(`${bookPath(company)}/sklad/${move.itemId}?ok=odstranene`, 303)
})

async function stockItemPage(c: Ctx, company: Company, form: { values?: ItemValues; errors?: ItemErrors } = {}, status: ContentfulStatusCode = 200) {
  const [stock, documents] = await Promise.all([stockOf(c.env.DB, company.id), stockDocuments(c.env.DB, company.id)])
  const item = stock.items.find((i) => i.id === c.req.param('item'))
  if (!item || !stock.settings) return missingPage(c)
  const err = c.req.query('chyba')
  const error = err === 'uzamknute' ? STOCK_LOCKED : err === 'chyba' ? 'Pohyb sme neodstránili: na sklade by potom chýbalo pri neskoršej výdajke.' : null
  return shell(
    c,
    'clients',
    `${item.name}: ${company.name}`,
    <StockItemPage
      company={company}
      settings={stock.settings}
      item={item}
      moves={valueItem(stock.moves.filter((m) => m.itemId === item.id), stock.settings)}
      documents={new Map(documents.map((d) => [d.id, d.label]))}
      values={form.values ?? { code: item.code, name: item.name, unit: item.unit, kind: item.kind }}
      errors={form.errors ?? {}}
      flash={status === 200 && c.req.query('ok') === 'ulozene' ? 'Údaje sú uložené.' : status === 200 && c.req.query('ok') === 'odstranene' ? 'Pohyb sme odstránili.' : null}
      error={error}
    />,
    status,
  )
}

teamRoutes.get('/klienti/:id/kniha/sklad/:item', async (c) => {
  const company = await companyParam(c)
  return company ? stockItemPage(c, company) : missingPage(c)
})

teamRoutes.post('/klienti/:id/kniha/sklad/:item', async (c) => {
  const company = await companyParam(c)
  if (!company) return missingPage(c)
  const stock = await stockOf(c.env.DB, company.id)
  const item = stock.items.find((i) => i.id === c.req.param('item'))
  if (!item) return missingPage(c)
  const body = await c.req.parseBody()
  const read = readItem((name) => body[name], new Set(stock.items.filter((i) => i.id !== item.id).map((i) => i.code.toLowerCase())))
  if (!read.item) return stockItemPage(c, company, { values: read.values, errors: read.errors }, 422)
  const who = c.get('who')
  try {
    await c.env.DB.batch([updateItemStatement(c.env.DB, company.id, item.id, read.item), eventStatement(c.env.DB, { company: company.id, user: who.user.id, action: 'stock.item.changed', subject: item.id })])
  } catch (err) {
    if (isPeriodLocked(err)) return stockItemPage(c, company, { values: read.values, errors: { form: STOCK_LOCKED } }, 409)
    throw err
  }
  return c.redirect(`${bookPath(company)}/sklad/${item.id}?ok=ulozene`, 303)
})

teamRoutes.post('/klienti/:id/kniha/sklad/:item/odstranit', async (c) => {
  const company = await companyParam(c)
  if (!company) return missingPage(c)
  const stock = await stockOf(c.env.DB, company.id)
  const item = stock.items.find((i) => i.id === c.req.param('item'))
  if (!item) return missingPage(c)
  const who = c.get('who')
  const [done] = await c.env.DB.batch([removeItemStatement(c.env.DB, company.id, item.id), eventStatement(c.env.DB, { company: company.id, user: who.user.id, action: 'stock.item.removed', subject: item.id })])
  if ((done?.meta?.changes ?? 0) === 0) return stockItemPage(c, company, { errors: { form: 'Položku s pohybmi neodstránime: najprv odstráňte jej pohyby.' } }, 409)
  return c.redirect(`${bookPath(company)}/sklad?ok=odstranene`, 303)
})

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

async function openingPage(c: Ctx, company: Company, form: OpeningForm | null, status: ContentfulStatusCode = 200, note: string | null = null) {
  const saved = (await manualEntries(c.env.DB, company.id)).find((m) => m.kind === 'opening') ?? null
  const rows: OpeningRowValue[] = form?.rows ?? (saved ? openingRows(saved.lines).map((r) => ({ account: r.account, md: money(r.md), d: money(r.d) })) : [])
  const filled = rows.filter((r) => r.account || r.md || r.d)
  const shown = [...filled, ...Array.from({ length: Math.max(14 - filled.length, 8) }, () => ({ account: '', md: '', d: '' }))]
  const day = form?.day ?? textDay(saved?.on ?? company.startOn ?? `${dayOf(now()).slice(0, 4)}-01-01`)
  return shell(
    c,
    'clients',
    `${t.ledger.openingTitle}: ${company.name}`,
    <OpeningPage company={company} form={{ day, rows: form ? rows : shown, errors: form?.errors ?? {} }} saved={saved} flash={status === 200 && !note ? flashOf(c) : null} note={note} />,
    status,
  )
}

teamRoutes.get('/klienti/:id/kniha/pociatocne', async (c) => {
  const company = await companyParam(c)
  return company ? openingPage(c, company, null) : missingPage(c)
})

// A large company's trial balance taken over (Prevzatie) has hundreds of accounts.
const OPENING_ROWS = 800

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

// ---------------------------------------------------------------------------------------------------------------
// Taking a client over from the accountant before (takeover.ts reads the files, takeover-store.ts writes)
// ---------------------------------------------------------------------------------------------------------------

const takeoverPath = (company: Company) => `/ucto/klienti/${company.id}/prevzatie`

/** The day the books begin: the opening balances' day, else the contract's first day. */
async function booksStart(db: D1Database, company: Company): Promise<string | null> {
  const opening = (await manualEntries(db, company.id)).find((m) => m.kind === 'opening')
  return opening?.on ?? company.startOn ?? null
}

async function takeoverPage(c: Ctx, company: Company, extra: { error?: TakeoverPageProps['error']; values?: Partial<TakeoverPageProps['values']> } = {}, status: ContentfulStatusCode = 200) {
  const db = c.env.DB
  const [start, prior, batches] = await Promise.all([booksStart(db, company), priorListOf(db, company.id), batchesOf(db, company.id)])
  const ok = c.req.query('ok')
  return shell(
    c,
    'clients',
    `${t.takeover.open}: ${company.name}`,
    <TakeoverPage
      company={company}
      start={start}
      prior={prior}
      batches={batches}
      error={extra.error ?? null}
      values={{ day: extra.values?.day ?? textDay(start ?? `${dayOf(now()).slice(0, 4)}-01-01`), side: extra.values?.side ?? '', rows: extra.values?.rows ?? {} }}
      flash={status === 200 && ok ? (t.takeover.flashes[ok] ?? null) : null}
    />,
    status,
  )
}

/** At most this many bytes of a list (a large company's open items or register as .xlsx). */
const TAKEOVER_BYTES = 20_000_000

type Upload = { bytes: Uint8Array } | { text: string }

async function uploadOf(body: Record<string, unknown>): Promise<Upload | null> {
  const file = body.subor
  if (file instanceof File && file.size > 0) return { bytes: new Uint8Array(await file.arrayBuffer()) }
  const text = typeof body.riadky === 'string' ? body.riadky : ''
  return text.trim() ? { text: text.slice(0, TAKEOVER_BYTES) } : null
}

/** An upload as XML when it is one (Pohoda's invoices, the statements from eDane). */
function xmlOf(u: Upload): string | null {
  const text = 'text' in u ? u.text : u.bytes.length <= TAKEOVER_BYTES ? decodeText(u.bytes) : ''
  return /^\s*</.test(text) ? text : null
}

async function tableOf(u: Upload): Promise<string[][] | string> {
  const e = t.takeover.errors
  if ('text' in u) return parseDelimited(u.text)
  if (u.bytes.length > TAKEOVER_BYTES) return e.unreadable
  const table = await readTable(u.bytes)
  return 'error' in table ? e[table.error] : table.rows
}

/** The lines that could not be read, as the card says them: the first thirty, and how many more. */
const issueLines = (issues: readonly LineIssue[]): string[] => [...issues.slice(0, 30).map((i) => t.takeover.errors.line(i.line, i.what)), ...(issues.length > 30 ? [t.takeover.errors.more(issues.length - 30)] : [])]

const pastedOf = (body: Record<string, unknown>) => (typeof body.riadky === 'string' ? body.riadky.slice(0, 200_000) : '')

teamRoutes.get('/klienti/:id/prevzatie', async (c) => {
  const company = await companyParam(c)
  return company ? takeoverPage(c, company) : missingPage(c)
})

/** The trial balance: read into the opening balances' form, which she checks and saves there; nothing is stored here. */
teamRoutes.post('/klienti/:id/prevzatie/predvaha', async (c) => {
  const company = await companyParam(c)
  if (!company) return missingPage(c)
  const body = await c.req.parseBody()
  const e = t.takeover.errors
  const day = typeof body.datum === 'string' ? body.datum.trim().slice(0, 20) : ''
  const refuse = (text: string, lines?: string[]) => takeoverPage(c, company, { error: { card: 'trial', text, lines }, values: { day, rows: { trial: pastedOf(body) } } }, 422)
  const upload = await uploadOf(body)
  if (!upload) return refuse(e.none)
  const rows = await tableOf(upload)
  if (typeof rows === 'string') return refuse(rows)
  if (rows.length === 0) return refuse(e.empty)
  const read = takeoverTrial(rows)
  if (read.noColumns) return refuse(e.columns(t.takeover.columns.trial))
  if (read.issues.length > 0) return refuse(e.lines, issueLines(read.issues))
  if (read.lines.length === 0) return refuse(e.nothing)
  if (read.lines.length > OPENING_ROWS) return refuse(e.lines, [e.more(read.lines.length - OPENING_ROWS)])
  const filled = read.lines.map((l) => ({ account: l.account, md: l.md ? moneyText(l.md) : '', d: l.d ? moneyText(l.d) : '' }))
  const rowsShown = [...filled, ...Array.from({ length: Math.min(8, OPENING_ROWS - filled.length) }, () => ({ account: '', md: '', d: '' }))]
  return openingPage(c, company, { day: day || textDay((await booksStart(c.env.DB, company)) ?? `${dayOf(now()).slice(0, 4)}-01-01`), rows: rowsShown, errors: {} }, 200, t.takeover.trial.note(read.lines.length, read.result !== 0 ? formatEurExact(read.result) : null))
})

/** The open items: every one becomes a document of the import before the books start, all or none. */
teamRoutes.post('/klienti/:id/prevzatie/saldokonto', async (c) => {
  const company = await companyParam(c)
  if (!company) return missingPage(c)
  const db = c.env.DB
  const body = await c.req.parseBody()
  const e = t.takeover.errors
  const side = body.strana === 'issued' || body.strana === 'received' ? body.strana : null
  const refuse = (text: string, lines?: string[], status: ContentfulStatusCode = 422) => takeoverPage(c, company, { error: { card: 'items', text, lines }, values: { side: side ?? '', rows: { items: pastedOf(body) } } }, status)
  const start = await booksStart(db, company)
  if (!start) return refuse(e.noStart, undefined, 409)
  const upload = await uploadOf(body)
  if (!upload) return refuse(e.none)
  const xml = xmlOf(upload)
  let read: { items: OpenItem[]; issues: LineIssue[] }
  if (xml !== null) {
    const pohoda = pohodaInvoices(xml)
    if (!pohoda) return refuse(e.xml)
    read = pohoda
  } else {
    const rows = await tableOf(upload)
    if (typeof rows === 'string') return refuse(rows)
    if (rows.length === 0) return refuse(e.empty)
    const table = openItems(rows, side)
    if (table.noColumns) return refuse(e.columns(t.takeover.columns.items))
    read = table
  }
  const known = await db.prepare("SELECT kind, number FROM documents WHERE company_id = ? AND deleted_at IS NULL AND number IS NOT NULL AND kind IN ('invoice_in', 'invoice_out')").bind(company.id).all<{ kind: string; number: string }>()
  const taken = new Set(known.results.map((r) => `${r.kind}:${r.number}`))
  const issues = [...read.issues]
  for (const item of read.items) {
    if (item.issuedOn && item.issuedOn >= start) issues.push({ line: item.line, what: `${item.number}: ${e.after}` })
    else if (taken.has(`${item.side === 'issued' ? 'invoice_out' : 'invoice_in'}:${item.number}`)) issues.push({ line: item.line, what: `${item.number}: ${e.duplicate}` })
  }
  if (issues.length > 0) return refuse(e.lines, issueLines(issues.sort((a, b) => a.line - b.line)))
  if (read.items.length === 0) return refuse(e.nothing)
  const batch = crypto.randomUUID()
  const by = c.get('who').user.id
  try {
    await db.batch([
      ...openItemsStatements(db, company.id, batch, read.items, addDay(start, -1), by),
      eventStatement(db, { company: company.id, user: by, action: 'takeover.items', subject: batch, detail: { count: read.items.length, cents: read.items.reduce((sum, i) => sum + i.cents, 0) } }),
    ])
  } catch (err) {
    if (isPeriodLocked(err)) return refuse(e.locked, undefined, 409)
    throw err
  }
  return c.redirect(`${takeoverPath(company)}?ok=items#prevzatie-batch`, 303)
})

/** The register of fixed assets: each asset one of the opening balances, all or none. */
teamRoutes.post('/klienti/:id/prevzatie/majetok', async (c) => {
  const company = await companyParam(c)
  if (!company) return missingPage(c)
  const db = c.env.DB
  const body = await c.req.parseBody()
  const e = t.takeover.errors
  const refuse = (text: string, lines?: string[], status: ContentfulStatusCode = 422) => takeoverPage(c, company, { error: { card: 'assets', text, lines }, values: { rows: { assets: pastedOf(body) } } }, status)
  const start = await booksStart(db, company)
  if (!start) return refuse(e.noStart, undefined, 409)
  const upload = await uploadOf(body)
  if (!upload) return refuse(e.none)
  const rows = await tableOf(upload)
  if (typeof rows === 'string') return refuse(rows)
  if (rows.length === 0) return refuse(e.empty)
  const read = assetRows(rows)
  if (read.noColumns) return refuse(e.columns(t.takeover.columns.assets))
  const issues = [...read.issues]
  for (const a of read.assets) if (a.inUseOn >= start) issues.push({ line: a.line, what: `${a.name}: ${e.assetAfter}` })
  if (issues.length > 0) return refuse(e.lines, issueLines(issues.sort((a, b) => a.line - b.line)))
  if (read.assets.length === 0) return refuse(e.nothing)
  const used = await db.prepare('SELECT number FROM assets WHERE company_id = ?').bind(company.id).all<{ number: string }>()
  const numbers = assetNumbers(used.results.map((r) => String(r.number)), read.assets)
  const batch = crypto.randomUUID()
  const by = c.get('who').user.id
  try {
    await db.batch([...assetRowsStatements(db, company.id, batch, read.assets, numbers, by), eventStatement(db, { company: company.id, user: by, action: 'takeover.assets', subject: batch, detail: { count: read.assets.length } })])
  } catch (err) {
    if (isPeriodLocked(err)) return refuse(e.locked, undefined, 409)
    throw err
  }
  return c.redirect(`${takeoverPath(company)}?ok=assets#prevzatie-batch`, 303)
})

/** The employees: whoever is not in payroll yet (by name and start), all or none. */
teamRoutes.post('/klienti/:id/prevzatie/zamestnanci', async (c) => {
  const company = await companyParam(c)
  if (!company) return missingPage(c)
  const db = c.env.DB
  const body = await c.req.parseBody()
  const e = t.takeover.errors
  const refuse = (text: string, lines?: string[]) => takeoverPage(c, company, { error: { card: 'people', text, lines }, values: { rows: { people: pastedOf(body) } } }, 422)
  const upload = await uploadOf(body)
  if (!upload) return refuse(e.none)
  const rows = await tableOf(upload)
  if (typeof rows === 'string') return refuse(rows)
  if (rows.length === 0) return refuse(e.empty)
  const read = personRows(rows)
  if (read.noColumns) return refuse(e.columns(t.takeover.columns.people))
  if (read.issues.length > 0) return refuse(e.lines, issueLines(read.issues))
  const known = new Set((await employeesOf(db, company.id)).map((p) => `${p.name.toLowerCase()}|${p.startedOn}`))
  const fresh = read.people.filter((p) => !known.has(`${p.name.toLowerCase()}|${p.startedOn}`))
  if (fresh.length === 0) return refuse(e.nothing)
  const by = c.get('who').user.id
  await db.batch([...peopleStatements(db, company.id, fresh, by), eventStatement(db, { company: company.id, user: by, action: 'takeover.people', detail: { count: fresh.length } })])
  return c.redirect(`/ucto/klienti/${company.id}/mzdy?ok=mzdy-prevzati#zamestnanci`, 303)
})

/** The statements the accountant before filed, from eDane's XML: the year's, and the year before's where none is kept. */
teamRoutes.post('/klienti/:id/prevzatie/zavierka', async (c) => {
  const company = await companyParam(c)
  if (!company) return missingPage(c)
  const db = c.env.DB
  const body = await c.req.parseBody()
  const e = t.takeover.errors
  const refuse = (text: string) => takeoverPage(c, company, { error: { card: 'prior', text } }, 422)
  const file = body.subor
  if (!(file instanceof File) || file.size === 0) return refuse(e.none)
  if (file.size > TAKEOVER_BYTES) return refuse(e.priorXml)
  const found = takeoverPrior(decodeText(new Uint8Array(await file.arrayBuffer())))
  if (!found) return refuse(e.priorXml)
  const own = found[0]!
  if (company.ico && own.ico && own.ico.padStart(8, '0') !== company.ico.padStart(8, '0')) return refuse(e.ico(own.ico))
  const by = c.get('who').user.id
  await db.batch([
    ...found.map((s, i) => priorStatementStatement(db, company.id, s, file.name || 'zavierka.xml', by, i > 0)),
    eventStatement(db, { company: company.id, user: by, action: 'takeover.statements', subject: String(own.year), detail: { form: own.form, years: found.map((s) => s.year) } }),
  ])
  return c.redirect(`${takeoverPath(company)}?ok=prior#prevzatie-prior`, 303)
})

teamRoutes.post('/klienti/:id/prevzatie/zavierka/:year/odstranit', async (c) => {
  const company = await companyParam(c)
  const year = Number(c.req.param('year'))
  if (!company || !Number.isInteger(year) || year < 2000 || year > 2100) return missingPage(c)
  const db = c.env.DB
  const removed = await removePriorStatement(db, company.id, year).run()
  if ((removed.meta?.changes ?? 0) === 0) return missingPage(c)
  await db.batch([eventStatement(db, { company: company.id, user: c.get('who').user.id, action: 'takeover.statements.removed', subject: String(year) })])
  return c.redirect(`${takeoverPath(company)}?ok=priorRemoved#prevzatie-prior`, 303)
})

/** A list read by mistake, removed whole while nothing of it was used. */
teamRoutes.post('/klienti/:id/prevzatie/zoznam/:batch/odstranit', async (c) => {
  const company = await companyParam(c)
  const id = c.req.param('batch')
  if (!company || !ID.test(id)) return missingPage(c)
  const db = c.env.DB
  const batch = (await batchesOf(db, company.id)).find((b) => b.id === id)
  if (!batch) return missingPage(c)
  if (batch.used > 0) return takeoverPage(c, company, { error: { card: 'batch', text: t.takeover.errors.used } }, 409)
  const by = c.get('who').user.id
  try {
    const results = await db.batch([...removeBatchStatements(db, company.id, id, by), eventStatement(db, { company: company.id, user: by, action: 'takeover.removed', subject: id, detail: { kind: batch.kind, count: batch.count } })])
    if (results.slice(0, 2).every((r) => (r.meta?.changes ?? 0) === 0)) return takeoverPage(c, company, { error: { card: 'batch', text: t.takeover.errors.used } }, 409)
  } catch (err) {
    if (isPeriodLocked(err)) return takeoverPage(c, company, { error: { card: 'batch', text: t.takeover.errors.locked } }, 409)
    throw err
  }
  return c.redirect(`${takeoverPath(company)}?ok=batch#prevzatie-batch`, 303)
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
  const missing = await listPayments(db, company, 'unpaired', 300)
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

// ---------------------------------------------------------------------------------------------------------------
// Fakturácia: Firmony's own invoices to its clients (billing-store.ts), for the administrator
// ---------------------------------------------------------------------------------------------------------------

async function billingPage(c: Ctx, notice: { flash?: string | null; error?: string | null } = {}, status: ContentfulStatusCode = 200) {
  const db = c.env.DB
  const today = dayOf(now())
  const month = today.slice(0, 7)
  const operator = await operatorOf(db)
  const [bills, rows] = operator ? await Promise.all([billingDrafts(db, month), billRows(db, today)]) : [[], []]
  const ok = c.req.query('ok')
  const vystavene = Number(c.req.query('n') ?? '0')
  const flash =
    notice.flash ??
    (ok === 'europio' ? t.billing.setup.done : ok === 'vystavene' ? t.billing.result.issued(vystavene) : ok === 'dorucena' ? t.billing.result.delivered : ok === 'pripomenute' ? t.billing.result.reminded : null)
  return shell(
    c,
    'billing',
    t.billing.title,
    <BillingPage operator={operator} month={month} today={today} bills={bills} rows={rows} months={startMonths(today).slice(0, 6)} flash={flash} error={notice.error ?? null} />,
    status,
  )
}

teamRoutes.get('/fakturacia', (c) => (isAdmin(c.get('who').user) ? billingPage(c) : missingPage(c)))

// europio s. r. o. as the company that issues: its facts from the config, its account for payments, the month its own
// books start, and the administrator as its owner, so that its own documents and bank come in like a client's.
teamRoutes.post('/fakturacia/europio', async (c) => {
  const who = c.get('who')
  if (!isAdmin(who.user)) return missingPage(c)
  const db = c.env.DB
  if (await operatorOf(db)) return billingPage(c, { error: t.billing.setup.errors.exists }, 409)
  const body = await c.req.parseBody()
  const iban = typeof body.iban === 'string' ? plainIban(body.iban) : ''
  const start = typeof body.start === 'string' ? body.start : ''
  if (!isIban(iban)) return billingPage(c, { error: t.billing.setup.errors.iban }, 422)
  if (!startMonths(dayOf(now())).includes(start)) return billingPage(c, { error: t.billing.setup.errors.start }, 422)
  const id = crypto.randomUUID()
  let inbox = inboxCode()
  for (let i = 0; i < 5 && (await db.prepare('SELECT 1 AS x FROM companies WHERE inbox = ?').bind(inbox).first()); i++) inbox = inboxCode()
  const ts = now()
  try {
    await db.batch([
      db
        .prepare(
          `INSERT INTO companies (id, created_at, name, ico, dic, address, register_line, vat_payer, vat_7a, plan, inbox, start_on, operator, invoice_iban, invoice_due_days)
           VALUES (?, ?, ?, ?, ?, ?, ?, 0, 1, 'start', ?, ?, 1, ?, 14)`,
        )
        .bind(id, ts, OPERATOR.name, OPERATOR.companyId.replace(/\s/g, ''), OPERATOR.taxId, `${OPERATOR.street}, ${OPERATOR.postalCity}`, OPERATOR.register, inbox, start, iban),
      db.prepare("INSERT INTO members (company_id, user_id, role, created_at, invited_by) VALUES (?, ?, 'owner', ?, ?)").bind(id, who.user.id, ts, who.user.id),
      eventStatement(db, { company: id, user: who.user.id, action: 'billing.operator', detail: { start } }),
    ])
  } catch {
    // Two administrators at once: the unique index lets one of them make europio.
    return billingPage(c, { error: t.billing.setup.errors.exists }, 409)
  }
  return c.redirect('/ucto/fakturacia?ok=europio', 303)
})

// Issues the invoices of this month: one client's (after its notes were checked), or every one that has no note.
teamRoutes.post('/fakturacia/vystavit', async (c) => {
  const who = c.get('who')
  if (!isAdmin(who.user)) return missingPage(c)
  const db = c.env.DB
  const operator = await operatorOf(db)
  if (!operator) return c.redirect('/ucto/fakturacia', 303)
  const body = await c.req.parseBody()
  const which = typeof body.klient === 'string' ? body.klient : ''
  const today = dayOf(now())
  const bills = (await billingDrafts(db, today.slice(0, 7))).filter((bill) => issuable(bill) && (which === 'vsetci' ? bill.draft.flags.length === 0 : bill.company.id === which))
  if (bills.length === 0) return billingPage(c, { error: t.billing.result.empty }, 409)
  let issued = 0
  for (const bill of bills) {
    const done = await issueBill(c.env, operator, bill, who.user.id, today, siteOrigin(c))
    if (done.result === 'iban') return billingPage(c, { error: t.billing.result.iban }, 409)
    if (done.result === 'billed') return billingPage(c, { error: t.billing.result.billed }, 409)
    if (done.result === 'issued') issued++
  }
  later(c, flushOutbox(db, c.env.EMAIL))
  return c.redirect(`/ucto/fakturacia?ok=vystavene&n=${issued}#vystavene`, 303)
})

teamRoutes.post('/fakturacia/:invoice/dorucit', async (c) => {
  if (!isAdmin(c.get('who').user)) return missingPage(c)
  const id = c.req.param('invoice')
  if (!ID.test(id)) return missingPage(c)
  const done = await deliverBill(c.env, id, siteOrigin(c))
  if (done === 'missing') return missingPage(c)
  later(c, flushOutbox(c.env.DB, c.env.EMAIL))
  return c.redirect('/ucto/fakturacia?ok=dorucena#vystavene', 303)
})

// An unpaid invoice past its due day: a message in the client's app and a doorbell, at most once a week.
teamRoutes.post('/fakturacia/:invoice/pripomenut', async (c) => {
  const who = c.get('who')
  if (!isAdmin(who.user)) return missingPage(c)
  const db = c.env.DB
  const id = c.req.param('invoice')
  const today = dayOf(now())
  const row = ID.test(id) ? (await billRows(db, today, null, 1000)).find((r) => r.invoiceId === id) : undefined
  const operator = await operatorOf(db)
  if (!row || !operator) return missingPage(c)
  if (row.state !== 'overdue') return c.redirect('/ucto/fakturacia#vystavene', 303)
  const ts = now()
  const message = crypto.randomUUID()
  const members = await membersOf(db, row.clientId)
  // The invoice takes the moment first, on its own: of two clicks within the week only the first finds it free.
  const claimed = await db
    .prepare('UPDATE invoices SET reminded_at = ?1 WHERE id = ?2 AND company_id = ?3 AND (reminded_at IS NULL OR reminded_at <= ?4)')
    .bind(ts, id, operator.id, ts - REMIND_EVERY)
    .run()
  if ((claimed.meta?.changes ?? 0) === 0) return billingPage(c, { error: t.billing.result.remindedRecently }, 409)
  try {
    await db.batch([
      messageStatement(db, { id: message, company: row.clientId, author: who.user.id, side: 'firmony', body: remindMessage(row.number, row.totalCents, row.dueOn, operator.invoiceIban), payment: null }),
      eventStatement(db, { company: row.clientId, user: who.user.id, action: 'billing.reminded', subject: id }),
      ...members.map((m) => ringStatement(db, 'invoice-overdue', `${id}:${ts}`, m.email, bell.invoiceOverdue(`${siteOrigin(c)}/app/firma#faktury-firmony`))),
    ])
  } catch (error) {
    // Nothing reached the client: the week is given back.
    await db.prepare('UPDATE invoices SET reminded_at = NULL WHERE id = ? AND reminded_at = ?').bind(id, ts).run()
    throw error
  }
  later(c, flushOutbox(db, c.env.EMAIL))
  return c.redirect('/ucto/fakturacia?ok=pripomenute#vystavene', 303)
})

teamRoutes.get('/ziadosti', async (c) => {
  const who = c.get('who')
  if (!isAdmin(who.user)) return missingPage(c)
  const [requests, investors] = await Promise.all([listRequests(c.env.DB), listInvestors(c.env.DB)])
  const released = Boolean(approvedRelease(c.env.CONTRACT_RELEASE, await contractCatalogueHash()))
  return shell(c, 'requests', t.requests.title, <RequestsPage requests={requests} investors={investors} now={now()} released={released} flash={flashOf(c)} />)
})

// What the approval on the Worker says, and the value a new one takes: the hash of today's terms and prices with the
// references the owner types. Nothing is stored here; the value lives only on the Worker (CONTRACT_RELEASE).
teamRoutes.get('/ziadosti/schvalenie', async (c) => {
  if (!isAdmin(c.get('who').user)) return missingPage(c)
  const hash = await contractCatalogueHash()
  const state = releaseState(c.env.CONTRACT_RELEASE, hash)
  const untilText = state.state === 'valid' || state.state === 'expired' ? textDay(dayOf(state.until)) : null
  const q = (name: string) => (c.req.query(name) ?? '').trim()
  const asked = ['pravne', 'poistne', 'do'].some((name) => c.req.query(name) !== undefined)
  let form: ReleaseForm | null = null
  let value: string | null = null
  if (asked) {
    form = { legal: q('pravne').slice(0, 240), insurance: q('poistne').slice(0, 240), until: q('do').slice(0, 20), errors: {} }
    const reference = (s: string) => s.length >= 5 && s.length <= 240
    if (!reference(form.legal)) form.errors.legal = t.release.errors.reference
    if (!reference(form.insurance)) form.errors.insurance = t.release.errors.reference
    const day = dayOfText(form.until)
    if (!day) form.errors.until = t.release.errors.day
    else if (day <= dayOf(now())) form.errors.until = t.release.errors.past
    if (day && Object.keys(form.errors).length === 0) value = releaseValue(hash, form.legal, form.insurance, day)
  }
  c.header('Cache-Control', 'no-store')
  return shell(c, 'requests', t.release.title, <ContractReleasePage state={state} untilText={untilText} hash={hash} form={form} value={value} />, form && !value ? 422 : 200)
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

async function reviewPage(c: Ctx, error?: string, status: ContentfulStatusCode = 200) {
  if (!isAdmin(c.get('who').user)) return missingPage(c)
  const id = c.req.param('id') ?? ''
  if (!ID.test(id) || !await getRequest(c.env.DB, id)) return missingPage(c)
  const order = await latestOrderOfRequest(c.env.DB, id)
  const people = await c.env.DB.prepare("SELECT id, name FROM users WHERE team IN ('admin', 'accountant') ORDER BY name").all<{ id: string; name: string }>()
  const sent = order
    ? await c.env.DB.prepare("SELECT at FROM events WHERE action = 'contract.link.sent' AND subject = ? ORDER BY id DESC LIMIT 1").bind(order.id).first<{ at: number }>()
    : null
  return shell(c, 'requests', 'Posúdenie pred podpisom', <ContractReviewPage requestId={id} order={order}
    offerHash={order ? await orderOfferHash(order) : ''} review={order ? await latestOrderReview(c.env.DB, order.id) : null}
    people={people.results} released={Boolean(approvedRelease(c.env.CONTRACT_RELEASE, await contractCatalogueHash()))} linkSentAt={sent?.at ?? null}
    flash={c.req.query('ok') === 'odkaz' ? 'Odkaz na zmluvu sme poslali konateľovi.' : c.req.query('ok') === 'obnovena' ? 'Objednávka platí ďalších 30 dní. Posúďte ju a odkaz pošleme konateľovi.' : undefined} error={error} />, status)
}

/**
 * The link to the contract goes to the director only once the order may be signed: a standard review that holds,
 * and the release of the terms. A new link replaces the one before (its token is all an order has), and it lasts as
 * long as the review does. The request counts as answered.
 */
async function sendOrderLink(c: Ctx, order: Order, requestId: string, user: string): Promise<boolean> {
  const db = c.env.DB
  const review = await latestOrderReview(db, order.id)
  const ts = now()
  if (!review || review.decision !== 'standard' || review.expires_at <= ts || order.status !== 'open') return false
  if (!approvedRelease(c.env.CONTRACT_RELEASE, await contractCatalogueHash())) return false
  const token = newToken()
  const tokenHash = await sha256Hex(token)
  const days = Math.max(1, Math.floor((review.expires_at - ts) / 86400))
  const mail = orderLinkMail(order.company, review.plan, `${siteOrigin(c)}/objednavka/${token}`, days)
  // The email is keyed by its link, not by the second: two links sent in one second are two emails, and the one
  // that works is always among them.
  const results = await db.batch([
    db.prepare("UPDATE orders SET token = ? WHERE id = ? AND status = 'open' AND expires_at > ?").bind(tokenHash, order.id, ts),
    queueStatement(db, { key: `order-link:${order.id}:${tokenHash.slice(0, 16)}`, to: order.email, subject: mail.subject, body: mail.body }),
    db.prepare("INSERT INTO events (at, company_id, user_id, action, subject) VALUES (?, NULL, ?, 'contract.link.sent', ?)").bind(ts, user, order.id),
    db.prepare("UPDATE requests SET status = 'contacted' WHERE id = ? AND status IN ('new', 'contacted')").bind(requestId),
  ])
  later(c, flushOutbox(db, c.env.EMAIL))
  return (results[0]?.meta?.changes ?? 0) > 0
}
teamRoutes.get('/ziadosti/:id/posudenie', (c) => reviewPage(c))
teamRoutes.post('/ziadosti/:id/posudenie', async (c) => {
  const who = c.get('who')
  if (!isAdmin(who.user)) return missingPage(c)
  const id = c.req.param('id')
  if (!ID.test(id) || !await getRequest(c.env.DB, id)) return missingPage(c)
  const db = c.env.DB
  const order = await latestOrderOfRequest(db, id)
  if (!order || order.status !== 'open') return reviewPage(c, 'Objednávka už nie je otvorená.', 409)
  const body = await c.req.parseBody()
  const text = (v: unknown) => typeof v === 'string' ? v.trim() : ''
  const decision = text(body.decision)
  const evidence = text(body.evidence)
  const accountant = text(body.accountant)
  const plan = PLANS.find((p) => p.id === body.plan)
  const hash = await orderOfferHash(order)
  if (body.proposal !== hash) return reviewPage(c, 'Návrh sa zmenil. Posúďte aktuálne údaje znova.', 409)
  if (!['standard', 'bespoke', 'hold'].includes(decision) || evidence.length < 12 || evidence.length > 240 || !plan)
    return reviewPage(c, 'Vyberte rozhodnutie a balík a uveďte referenciu na odborné posúdenie (12 až 240 znakov).', 422)
  if (decision === 'standard' && (!['category', 'scope', 'cover', 'authority'].every((k) => body[k] === '1')
    || !await db.prepare("SELECT 1 AS x FROM users WHERE id = ? AND team IN ('admin', 'accountant')").bind(accountant).first()))
    return reviewPage(c, 'Štandardné prijatie vyžaduje všetky kontroly a zodpovedného člena tímu.', 422)
  const ts = now()
  await db.batch([
    db.prepare(`INSERT INTO order_reviews (order_id, reviewed_at, reviewed_by, decision, offer_hash, plan, evidence, accountant_id, expires_at)
      SELECT id, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9 FROM orders WHERE id = ?1 AND status = 'open' AND expires_at > ?2`)
      .bind(order.id, ts, who.user.id, decision, hash, plan.id, evidence, decision === 'standard' ? accountant : null, Math.min(order.expiresAt, ts + 7 * 86400)),
    db.prepare(`INSERT INTO events (at, company_id, user_id, action, subject, detail)
      SELECT ?2, NULL, ?3, 'contract.reviewed', id, ?4 FROM orders
      WHERE id = ?1 AND status = 'open' AND expires_at > ?2`)
      .bind(order.id, ts, who.user.id, JSON.stringify({ decision, offerHash: hash, plan: plan.id, evidence, accountant: decision === 'standard' ? accountant : null })),
  ])
  // A standard scope goes to the director at once, when the terms are released; anything else the administrator
  // answers in person (a scope of its own, or what is still missing), and the request stays open until then.
  const sent = decision === 'standard' && (await sendOrderLink(c, order, id, who.user.id))
  return c.redirect(`/ucto/ziadosti/${id}/posudenie${sent ? '?ok=odkaz' : ''}`, 303)
})

// An online order that lapsed while the request waited: thirty more days, and the review is made again.
teamRoutes.post('/ziadosti/:id/obnovit', async (c) => {
  const who = c.get('who')
  if (!isAdmin(who.user)) return missingPage(c)
  const id = c.req.param('id')
  const db = c.env.DB
  if (!ID.test(id) || !(await getRequest(db, id))) return missingPage(c)
  const order = await latestOrderOfRequest(db, id)
  if (!order || order.status !== 'expired') return reviewPage(c, 'Obnoviť sa dá len objednávka, ktorej platnosť uplynula.', 409)
  const ts = now()
  const [renewed] = await db.batch([
    renewOrderStatement(db, order.id, ts, await sha256Hex(newToken())),
    db.prepare(`INSERT INTO events (at, company_id, user_id, action, subject, detail) SELECT ?2, NULL, ?3, 'order.renewed', id, NULL FROM orders WHERE id = ?1 AND status = 'open' AND expires_at > ?2`).bind(order.id, ts, who.user.id),
  ])
  if (!renewed?.meta.changes) return reviewPage(c, 'Objednávku nemožno obnoviť: firma je už klientom alebo zmluvu medzičasom uzavrela.', 409)
  return c.redirect(`/ucto/ziadosti/${id}/posudenie?ok=obnovena`, 303)
})

teamRoutes.post('/ziadosti/:id/odkaz', async (c) => {
  const who = c.get('who')
  if (!isAdmin(who.user)) return missingPage(c)
  const id = c.req.param('id')
  if (!ID.test(id) || !await getRequest(c.env.DB, id)) return missingPage(c)
  const order = await latestOrderOfRequest(c.env.DB, id)
  if (!order || !(await sendOrderLink(c, order, id, who.user.id))) return reviewPage(c, 'Odkaz teraz poslať nemožno: zmluvu musí potvrdiť platné štandardné posúdenie a schválené znenie.', 409)
  return c.redirect(`/ucto/ziadosti/${id}/posudenie?ok=odkaz`, 303)
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
  if (existing?.id === who.user.id && values.role !== 'admin') return shell(c, 'people', t.people.title, <PeoplePage people={await teamMembers(db)} values={values} errors={{ email: 'Vlastnú rolu správcu nemožno týmto formulárom znížiť.' }} />, 422)
  const id = existing?.id ?? crypto.randomUUID()
  const changed = await db.batch([
    existing
      ? db.prepare("UPDATE users SET team = ?1 WHERE id = ?2 AND EXISTS (SELECT 1 FROM users WHERE id = ?3 AND team = 'admin') AND (?1 = 'admin' OR team IS NOT 'admin' OR EXISTS (SELECT 1 FROM users WHERE team = 'admin' AND id <> ?2))").bind(values.role, id, who.user.id)
      : db.prepare("INSERT INTO users (id, created_at, email, name, team) SELECT ?1, ?2, ?3, ?4, ?5 WHERE EXISTS (SELECT 1 FROM users WHERE id = ?6 AND team = 'admin')").bind(id, now(), values.email, values.name, values.role, who.user.id),
    ...(existing && existing.id !== who.user.id ? [
      db.prepare("DELETE FROM sessions WHERE user_id = ?1 AND EXISTS (SELECT 1 FROM users WHERE id = ?2 AND team = 'admin') AND EXISTS (SELECT 1 FROM users WHERE id = ?1 AND team = ?3)").bind(id, who.user.id, values.role),
      db.prepare("DELETE FROM login_links WHERE user_id = ?1 AND EXISTS (SELECT 1 FROM users WHERE id = ?2 AND team = 'admin') AND EXISTS (SELECT 1 FROM users WHERE id = ?1 AND team = ?3)").bind(id, who.user.id, values.role),
    ] : []),
  ])
  if (!changed[0]?.meta.changes) return shell(c, 'people', t.people.title, <PeoplePage people={await teamMembers(db)} values={values} errors={{ email: 'Oprávnenia sa zmenili. Obnovte stránku a skontrolujte tím.' }} />, 409)
  await db.batch([
    eventStatement(db, { company: null, user: who.user.id, action: 'team.added', subject: id, detail: { role: values.role } }),
    queueStatement(db, { key: `team:${id}:${values.role}`, to: values.email, subject: t.people.inviteSubject, body: t.people.inviteBody(values.name, `${siteOrigin(c)}/app/prihlasenie`) }),
  ])
  later(c, flushOutbox(db, c.env.EMAIL))
  return c.redirect('/ucto/tim?ok=tim', 303)
})

teamRoutes.route('/incidenty', incidentRoutes)
teamRoutes.route('/podania', filingQueueRoutes)
teamRoutes.route('/klienti/:companyId/podania', filingRoutes)
teamRoutes.route('/klienti/:companyId/mzdove-podania', payrollReportRoutes)

teamRoutes.notFound((c) => (c.get('who') ? missingPage(c) : c.redirect('/app/prihlasenie', 303)))

export { canSee }
