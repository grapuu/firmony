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
import { ConfirmByLink, Door, Enter, Expired, LinkSent, LoginForm, Shell, type Place } from '../views/inside'
import { CompanyPage } from '../views/settings'
import { InvoiceFormPage, InvoicePage, InvoicesPage } from '../views/invoices'
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
import { filedReturns, taxPaid, type TaxPaid } from './vat-store'
import { billingScheduled, billRows } from '../team/billing-store'
import { booksRefused, getPaper, keepPaper, paperResponse, papersOf, poaStateOf } from './papers'
import { checkDeclaration, declarationStateOf, declarationStatements, latestDeclaration, noticeEndsOn, valuesFrom, valuesOfDeclaration, type DeclarationErrors, type DeclarationValues } from './aml'
import { bell, ringStatement } from '../bell'
import { bankReady, dropAccount, finishLink, linksOf, listBanks, noticeOf, readDue, readLink, startLink, unlink } from './bank'
import {
  checkValues,
  getInvoice,
  invoiceLines,
  linesOf,
  listInvoices,
  plainIban,
  saveInvoiceStatements,
  totalsOf,
  ublOf,
  type Errors as InvoiceErrors,
  type InvoiceValues,
  type Line,
  type LineInput,
  type StoredInvoice,
} from './invoices'
import { dayOfText, textDay } from './booking'
import { lookupCompany } from '../rpo'
import { normalizeIco } from '../ico'
import { formatEur, formatEurExact } from '../format'
import { app as t, dayName, monthName } from './copy'
import { deadlinesFor, nextMonth } from './deadlines'
import { DEMO, seedDemo } from './demo'
import { EXEMPTS, type Exempt } from './match'
import { sniff } from './read'
import { keepFilesFor, readOne, type NewFile } from './intake'
import { remindAll, remindBankRenewals, remindStatements, bratislava } from './remind'
import { endingOf, intakeOpen, serviceOpen } from './ending'
import { exportYear, exportYears } from './export'
import { beginExport, completeExport, confirmExport, exportReceipts } from './handover-store'
import { purgeEnded } from './purge'
import { currentWho, endSession, linkUsable, newLink, newToken, startSession, switchStatement, useLink } from './session'
import {
  afterReading,
  clearExemptStatement,
  companiesOf,
  countMissing,
  getCompany,
  deleteDocumentStatements,
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
  if (await currentWho(c, c.env.DB)) return c.redirect('/app', 303)
  return render(c, <Door title={t.login.title}>{<LoginForm />}</Door>)
})

appRoutes.post('/prihlasenie', async (c) => {
  const body = await c.req.parseBody()
  const email = typeof body.email === 'string' ? body.email.trim().slice(0, 200) : ''
  if (!EMAIL.test(email)) return render(c, <Door title={t.login.title}>{<LoginForm value={email} error={t.login.badEmail} />}</Door>, 422)
  const db = c.env.DB
  await ensureSchema(db)
  if (!(await withinLimit(db, 'signin', connection(c), APP.signInsPerHour, 3600))) {
    return render(c, <Door title={t.login.title}>{<LoginForm value={email} error={t.login.throttle} />}</Door>, 429)
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
      ])
      user = await userByEmail(db, email)
    }
  }
  if (user && (await withinLimit(db, 'link', user.email.toLowerCase(), APP.linksPerHour, 3600))) {
    const { token, statement } = await newLink(db, user.id)
    const link = `${siteOrigin(c)}/app/vstup?t=${token}`
    await db.batch([statement, queueStatement(db, { key: `login:${crypto.randomUUID()}`, to: user.email, subject: t.login.mailSubject, body: t.login.mailBody(link) })])
    later(c, flushOutbox(db, c.env.EMAIL))
  }
  return c.redirect('/app/prihlasenie/poslane', 303)
})

appRoutes.get('/prihlasenie/poslane', (c) => render(c, <Door title={t.login.sentTitle}>{<LinkSent />}</Door>))

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
  return c.redirect(signedIn?.team ? '/auth?next=%2Fucto' : (next ?? to), 303)
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
  if (!who) return reads ? c.redirect('/app/prihlasenie', 303) : c.text('Forbidden', 403)
  if (!who.company || !who.role) {
    // Somebody of the team works on the other side; one who also has a company of their own is taken into it.
    if (who.user.team) {
      const own = await firstCompanyOf(c.env.DB, who.user.id)
      if (own && reads) {
        await c.env.DB.batch([switchStatement(c.env.DB, who.session, who.user.id, own)])
        return c.redirect(new URL(c.req.url).pathname, 303)
      }
      return reads ? c.redirect('/ucto', 303) : c.text('Forbidden', 403)
    }
    await endSession(c, c.env.DB)
    return reads ? c.redirect('/app/prihlasenie', 303) : c.text('Forbidden', 403)
  }
  const path = new URL(c.req.url).pathname
  const security = await securityGate(c, who, sensitivePath(path, c.req.method) && (!/^\/app\/export(?:\/|$)/.test(path) || who.role === 'owner'))
  if (security) return security
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
  const [missingAll, figures, messages, counts, byMonth, started] = await Promise.all([
    listPayments(db, company, 'missing', 200),
    monthFigures(db, company, `${month}-01`, `${nextMonth(month)}-01`),
    listMessages(db, company, 1),
    db.prepare('SELECT COUNT(*) AS n FROM payments WHERE company_id = ?').bind(company).first<{ n: number }>(),
    db
      .prepare(
        `SELECT substr(p.booked_on, 1, 7) AS month, COUNT(*) AS n FROM payments p WHERE p.company_id = ? AND p.exempt IS NULL AND NOT EXISTS (SELECT 1 FROM links l WHERE l.payment_id = p.id) GROUP BY 1`,
      )
      .bind(company)
      .all<{ month: string; n: number }>(),
    db
      .prepare(
        `SELECT EXISTS (SELECT 1 FROM documents WHERE company_id = ?1 AND source = 'upload') AS upload,
                EXISTS (SELECT 1 FROM declarations WHERE company_id = ?1) AS declaration,
                EXISTS (SELECT 1 FROM documents WHERE company_id = ?1 AND source = 'email') AS email,
                EXISTS (SELECT 1 FROM company_files WHERE company_id = ?1 AND kind = 'poa') AS poa,
                (SELECT COUNT(*) FROM members WHERE company_id = ?1) AS people,
                (SELECT r.situation FROM companies co JOIN requests r ON r.id = co.request_id WHERE co.id = ?1) AS situation,
                EXISTS (SELECT 1 FROM events WHERE company_id = ?1 AND action = 'switching.sent')
                  OR EXISTS (SELECT 1 FROM company_files WHERE company_id = ?1 AND kind = 'takeover') AS switched`,
      )
      .bind(company)
      .first<{ upload: number; declaration: number; email: number; poa: number; people: number; situation: string | null; switched: number }>(),
  ])
  const [suggested, filed, bills] = await Promise.all([
    suggestions(db, company, missingAll),
    who.company.vatStatus === 'none' ? Promise.resolve([]) : filedReturns(db, company),
    billRows(db, day, company, 24).then((rows) => rows.filter((r) => r.state !== 'paid')),
  ])
  const paid = filed.length > 0 ? await taxPaid(db, company, filed) : new Map<string, TaxPaid>()
  const steps = {
    declaration: started?.declaration === 1,
    poa: started?.poa === 1,
    payments: (counts?.n ?? 0) > 0,
    upload: started?.upload === 1,
    email: started?.email === 1,
    people: (started?.people ?? 1) > 1,
    switching: started?.situation === 'switch',
    switched: started?.switched === 1,
  }
  const ready = bankReady(c.env)
  // A consent of Enable Banking or a token of Fio that ends; a statement from an account the company does not have
  // yet; the statement of last month, still to be added.
  const open = serviceOpen(who.company, day)
  const [bankNotice, statements, due] = await Promise.all([
    open ? linksOf(db, company).then((links) => noticeOf(links)) : Promise.resolve(null),
    statementsOf(db, company),
    intakeOpen(who.company, day) ? statementDue(db, company, day) : Promise.resolve(null),
  ])
  return shell(
    c,
    'home',
    t.nav.home,
    <Overview
      firstName={firstName(who.user.name)}
      missing={missingAll.slice(0, 6)}
      missingCount={missingAll.length}
      suggested={new Set(suggested.keys())}
      paymentsCount={counts?.n ?? 0}
      figures={figures}
      month={monthName(`${month}-01`)}
      today={day}
      deadlines={deadlinesFor(who.company, day, new Map(byMonth.results.map((r) => [r.month, r.n])), { filed, paid }, bills)}
      inbox={inboxAddress(who.company)}
      accountant={who.company.accountantName}
      last={messages[0] ?? null}
      now={now()}
      flash={flashOf(c)}
      steps={steps.declaration && steps.poa && steps.payments && steps.upload ? null : steps}
      me={who.user.id}
      bankReady={ready}
      bankNotice={bankNotice}
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

appRoutes.get('/platby', async (c) => {
  const who = c.get('who')
  const db = c.env.DB
  const q = c.req.query('filter')
  const search = (c.req.query('hladat') ?? '').replace(/\s+/g, ' ').trim().slice(0, 80)
  // A search looks through every payment, whatever tab was open.
  const filter = search ? 'all' : q === 'hotove' ? 'done' : q === 'vsetky' ? 'all' : 'missing'
  const [payments, missingCount] = await Promise.all([listPayments(db, who.company.id, filter, 400, search), countMissing(db, who.company.id)])
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
async function keepFiles(c: Ctx, files: NewFile[], payment: string | null): Promise<{ added: number; known: string[] }> {
  const who = c.get('who')
  const { kept, work } = await keepFilesFor(c.env, who.company, { user: who.user.id, source: 'upload' }, files, payment)
  if (work) later(c, work)
  return kept
}

appRoutes.get('/doklady', async (c) => {
  const who = c.get('who')
  const search = (c.req.query('hladat') ?? '').replace(/\s+/g, ' ').trim().slice(0, 80)
  const filter = !search && c.req.query('filter') === 'bez-platby' ? 'loose' : 'all'
  const docs = await listDocuments(c.env.DB, who.company.id, filter, 400, search)
  return shell(
    c,
    'documents',
    t.documents.title,
    <DocumentsPage filter={filter} docs={docs} inbox={inboxAddress(who.company)} flash={flashOf(c)} problems={[]} search={search} closed={closedIntake(who.company)} />,
  )
})

async function documentsWithProblems(c: Ctx, problems: string[], status: ContentfulStatusCode, flash: string | null = null) {
  const who = c.get('who')
  const docs = await listDocuments(c.env.DB, who.company.id, 'all')
  return shell(
    c,
    'documents',
    t.documents.title,
    <DocumentsPage filter="all" docs={docs} inbox={inboxAddress(who.company)} flash={flash} problems={problems} closed={closedIntake(who.company)} />,
    status,
  )
}

appRoutes.post('/doklady', async (c) => {
  const who = c.get('who')
  // Ten days past the last day: the page's card says that nothing more is taken.
  if (!intakeOpen(who.company, today())) return documentsWithProblems(c, [], 409)
  if (!c.env.FILES) return documentsWithProblems(c, [t.documents.noStorage], 503)
  if ((await filesToday(c.env.DB, who.company.id)) >= APP.filesPerDay) return documentsWithProblems(c, [t.documents.perDay], 429)
  const taken = await takeFiles(c)
  const kept = taken.files.length > 0 ? await keepFiles(c, taken.files, null) : { added: 0, known: [] }
  const problems = [...taken.problems, ...kept.known.map((name) => t.documents.known(name))]
  if (problems.length > 0) return documentsWithProblems(c, problems, kept.added > 0 || kept.known.length > 0 ? 200 : 422, kept.added > 0 ? t.documents.added(kept.added) : null)
  return c.redirect(`/app/doklady?ok=pridane&n=${kept.added}`, 303)
})

appRoutes.post('/platby/:id/doklad', async (c) => {
  const who = c.get('who')
  const id = c.req.param('id')
  const p = ID.test(id) ? await getPayment(c.env.DB, who.company.id, id) : null
  if (!p) return shell(c, 'payments', t.errors.notFound, <Missing />, 404)
  if (!intakeOpen(who.company, today())) return paymentPage(c, id, {}, 409)
  if (!c.env.FILES) return paymentPage(c, id, { error: t.documents.noStorage }, 503)
  if ((await filesToday(c.env.DB, who.company.id)) >= APP.filesPerDay) return paymentPage(c, id, { error: t.documents.perDay }, 429)
  const taken = await takeFiles(c)
  // A payment that needs no document takes none: what is sent there waits among the documents.
  const exempt = p.state === 'exempt'
  const kept = taken.files.length > 0 ? await keepFiles(c, taken.files, exempt ? null : p.id) : { added: 0, known: [] }
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
  return c.redirect(result.status === 'linked' ? `/app/banka?ok=fio&n=${result.added}` : '/app/banka?ok=fio-skoro', 303)
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

appRoutes.get('/doklady/:id', async (c) => {
  const who = c.get('who')
  const id = c.req.param('id')
  const d = ID.test(id) ? await getDocument(c.env.DB, who.company.id, id) : null
  if (!d) return shell(c, 'documents', t.errors.notFound, <Missing />, 404)
  const payment = d.paymentId ? await getPayment(c.env.DB, who.company.id, d.paymentId) : null
  return shell(c, 'documents', d.party ?? t.documents.title, <DocumentPage d={d} payment={payment} today={today()} flash={flashOf(c)} />)
})

/** Where to go back to: only a page of the app, never an address from outside. */
function backTo(value: unknown, fallback: string): string {
  return typeof value === 'string' && /^\/app\/[a-z]+\/[A-Za-z0-9-]{1,64}$/.test(value) ? value : fallback
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
  const results = await db.batch([...deleteDocumentStatements(db, who.company.id, id), eventStatement(db, { company: who.company.id, user: who.user.id, action: 'document.deleted', subject: id })])
  if ((results[1]?.meta?.changes ?? 0) === 0) {
    const d = await getDocument(db, who.company.id, id)
    if (!d) return shell(c, 'documents', t.errors.notFound, <Missing />, 404)
    const payment = d.paymentId ? await getPayment(db, who.company.id, d.paymentId) : null
    return shell(c, 'documents', t.documents.title, <DocumentPage d={d} payment={payment} today={today()} error={t.document.locked} />, 409)
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

async function messagesPage(c: Ctx, extra: { error?: string; draft?: string } = {}, status: ContentfulStatusCode = 200) {
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
    <MessagesPage messages={messages} accountant={who.company.accountantName} now={now()} payments={payments} flash={flashOf(c)} me={who.user.id} {...extra} />,
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

appRoutes.get('/spravy', (c) => messagesPage(c))

appRoutes.post('/spravy', async (c) => {
  const who = c.get('who')
  const body = await c.req.parseBody()
  const text = typeof body.sprava === 'string' ? body.sprava.replace(/\r\n?/g, '\n').trim() : ''
  if (text === '') return messagesPage(c, { error: t.messages.emptyBody }, 422)
  if (text.length > APP.messageChars) return messagesPage(c, { error: t.messages.tooLong, draft: text.slice(0, APP.messageChars) }, 422)
  const db = c.env.DB
  if (!(await withinLimit(db, 'message', who.company.id, APP.messagesPerHour, 3600))) return messagesPage(c, { error: t.messages.throttle, draft: text }, 429)
  const paymentId = typeof body.platba === 'string' && ID.test(body.platba) ? body.platba : null
  const payment = paymentId ? await getPayment(db, who.company.id, paymentId) : null
  const id = crypto.randomUUID()
  // The team is rung once for what it has not read yet: a second message before anybody looked rings nothing.
  const unread = await db.prepare("SELECT 1 AS x FROM messages WHERE company_id = ? AND side = 'client' AND seen_at IS NULL LIMIT 1").bind(who.company.id).first()
  await db.batch([
    messageStatement(db, { id, company: who.company.id, author: who.user.id, side: 'client', body: text, payment: payment?.id ?? null }),
    eventStatement(db, { company: who.company.id, user: who.user.id, action: 'message.sent', subject: id }),
    ...(unread ? [] : [ringStatement(db, 'message', id, who.company.accountantEmail ?? BRAND.email, bell.teamMessage(`${siteOrigin(c)}/ucto/klienti/${who.company.id}#spravy`))]),
  ])
  later(c, flushOutbox(db, c.env.EMAIL))
  return c.redirect('/app/spravy?ok=poslane#posledna', 303)
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
      noticeEnd={noticeEndsOn(today())}
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
async function switchPage(c: Ctx, notice: { flash?: string | null; error?: string | null } = {}, status?: ContentfulStatusCode) {
  const who = c.get('who')
  const q = (name: string, max: number) => (c.req.query(name) ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
  const values = { to: q('komu', 120), toAddress: q('adresa', 160), since: q('od', 20), until: q('do', 20) }
  const since = dayOfText(values.since)
  const until = dayOfText(values.until)
  const errors: { since?: string; until?: string } = {}
  if (since === null) errors.since = t.switching.dayHint
  if (until === null) errors.until = t.switching.dayHint
  const [papers, sentAt] = await Promise.all([papersOf(c.env.DB, who.company.id, 'takeover'), switchingSentAt(c.env.DB, who.company.id)])
  const ok = c.req.query('ok')
  const flash = notice.flash ?? (ok === 'podklady' ? t.switching.papersFlash : ok === 'odoslane' ? t.switching.sentFlash : null)
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
    />,
    status ?? (since === null || until === null ? 422 : 200),
  )
}

appRoutes.get('/prechod', (c) => switchPage(c))

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

appRoutes.post('/vyhlasenie', async (c) => {
  const who = c.get('who')
  if (who.role !== 'owner') return declarationPage(c, null, 403)
  const db = c.env.DB
  const values = valuesFrom(await c.req.parseBody())
  if (!(await withinLimit(db, 'declaration', who.company.id, APP.declarationsPerHour, 3600))) return declarationPage(c, { values, errors: {}, error: t.declaration.errors.throttle }, 429)
  const { declaration, errors } = checkDeclaration(values, today(), t.declaration.errors)
  if (!declaration) return declarationPage(c, { values, errors }, 422)
  const company = who.company
  const made = declarationStatements(db, company.id, who.user.id, declaration)
  await db.batch([...made.statements, ringStatement(db, 'declaration', made.id, company.accountantEmail ?? BRAND.email, bell.teamDeclaration(`${siteOrigin(c)}/ucto/klienti/${company.id}/aml`))])
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

appRoutes.post('/firma/vypoved', async (c) => {
  const who = c.get('who')
  if (who.role !== 'owner') return companyPage(c, { errors: { notice: t.notice.onlyOwner } }, 403)
  const body = await c.req.parseBody()
  if (body.potvrdit !== '1') return companyPage(c, { errors: { notice: t.notice.must } }, 422)
  const db = c.env.DB
  const end = noticeEndsOn(today())
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

function invoiceForm(
  c: Ctx,
  id: string | null,
  values: InvoiceValues,
  errors: InvoiceErrors = {},
  status: ContentfulStatusCode = 200,
  found: string | null = null,
  recent: { id: string; name: string }[] = [],
) {
  const who = c.get('who')
  return shell(
    c,
    'invoices',
    id ? ti.form.editTitle : ti.form.title,
    <InvoiceFormPage id={id} values={values} vatPayer={who.company.vatPayer} errors={errors} found={found} preview={previewLines(values, who.company.vatPayer)} recent={recent} />,
    status,
  )
}

/** The lines of a stored invoice as the form shows them, with an empty one to go on. */
function inputLines(lines: Line[], vatPayer: boolean): LineInput[] {
  return [
    ...lines.map((l) => ({
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
  return shell(c, 'invoices', ti.title, <InvoicesPage invoices={invoices} today={today()} flash={flashOf(c)} closed={closed} />, status)
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
  // "Vystaviť podobnú" starts from an earlier invoice of the company, its customer and its lines; a customer of an
  // earlier invoice starts from that customer alone. The days are today's, as on any new invoice.
  const like = c.req.query('podla') ?? ''
  const from = like || (c.req.query('odberatel') ?? '')
  const earlier = ID.test(from) ? await getInvoice(c.env.DB, who.company.id, from) : null
  if (earlier) {
    values.customerName = earlier.customerName
    values.customerAddress = earlier.customerAddress ?? ''
    values.customerIco = earlier.customerIco ?? ''
    values.customerDic = earlier.customerDic ?? ''
    values.customerIcdph = earlier.customerIcdph ?? ''
    values.customerEmail = earlier.customerEmail ?? ''
    if (like) {
      values.note = earlier.note ?? ''
      values.lines = inputLines(await invoiceLines(c.env.DB, earlier.id), who.company.vatPayer)
    }
  }
  return invoiceForm(c, null, values, {}, 200, null, earlier ? [] : await recentCustomers(c.env.DB, who.company.id))
})

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
  const errors = checkValues(values, dayOfText, { ...ti.errors, lines: ti.errors.lines, form: ti.errors.form })
  const { lines, error } = linesOf(values, vatPayer, { line: ti.errors.line, none: ti.errors.lines })
  if (error && (issue || error !== ti.errors.lines)) errors.lines = error
  const totals = totalsOf(lines, vatPayer)
  if (issue && !errors.lines && totals.total <= 0) errors.lines = ti.errors.lines
  // A draft needs only somebody to be issued to; an invoice needs everything.
  const blocking = issue ? errors : { customerName: errors.customerName, lines: errors.lines }
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
      }),
      eventStatement(db, { company: who.company.id, user: who.user.id, action: issue ? 'invoice.issued' : 'invoice.draft', subject: id, detail: { total: totals.total } }),
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
      customerEmail: invoice.customerEmail ?? '',
      issued: textDay(invoice.issuedOn),
      delivered: textDay(invoice.deliveredOn),
      due: textDay(invoice.dueOn),
      iban: invoice.iban ? groupIban(invoice.iban) : '',
      note: invoice.note ?? '',
      lines: inputLines(lines, who.company.vatPayer),
    }
    return invoiceForm(c, invoice.id, values, {}, status)
  }
  return shell(
    c,
    'invoices',
    `${ti.sheet.title} ${invoice.number}`,
    <InvoicePage invoice={invoice} lines={lines} seller={who.company} today={today()} link={`${siteOrigin(c)}/f/${invoice.token}`} flash={flashOf(c)} {...extra} />,
    status,
  )
}

appRoutes.get('/faktury/:id', (c) => invoicePage(c, c.req.param('id')))

appRoutes.post('/faktury/:id', async (c) => {
  const who = c.get('who')
  const id = c.req.param('id')
  const draft = ID.test(id) ? await getInvoice(c.env.DB, who.company.id, id) : null
  if (!draft) return shell(c, 'invoices', t.errors.notFound, <Missing />, 404)
  if (draft.status !== 'draft') return c.redirect(`/app/faktury/${id}`, 303)
  return saveInvoice(c, id)
})

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
  // A paid invoice is never reminded, whatever is posted.
  if (reminder && invoice.paidOn) return c.redirect(`/app/faktury/${invoice.id}`, 303)
  if (!(await withinLimit(db, 'invoice-mail', who.company.id, 30, 3600))) return invoicePage(c, id, { error: t.messages.throttle }, 429)
  const link = `${siteOrigin(c)}/f/${invoice.token}`
  const total = formatEurExact(invoice.totalCents).replace(/ /g, ' ')
  const due = dayName(invoice.dueOn).replace(/ /g, ' ')
  const iban = invoice.iban ? groupIban(invoice.iban) : null
  await db.batch([
    queueStatement(db, {
      key: `invoice:${reminder ? 'remind' : 'send'}:${invoice.id}:${now()}`,
      to: invoice.customerEmail,
      replyTo: who.user.email,
      subject: reminder ? ti.mail.reminderSubject(invoice.number, who.company.name) : ti.mail.subject(invoice.number, who.company.name),
      body: reminder ? ti.mail.reminderBody(who.company.name, invoice.number, total, due, iban, link) : ti.mail.body(who.company.name, invoice.number, total, due, iban, link, invoice.note),
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
  if (!invoice || invoice.status !== 'issued') return shell(c, 'invoices', t.errors.notFound, <Missing />, 404)
  return xmlResponse(invoice, await invoiceLines(c.env.DB, invoice.id), who.company)
})

export function xmlResponse(invoice: StoredInvoice, lines: Line[], seller: Company): Response {
  return new Response(ublOf(invoice, lines, seller), {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Content-Disposition': `attachment; filename="faktura-${invoice.number ?? 'koncept'}.xml"`,
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

/** Every fifteen minutes: documents whose reading was cut off are read again (three times at most), old sessions go. */
export async function appScheduled(env: AppBindings, at: number = Date.now()): Promise<void> {
  const db = env.DB
  const ts = now()
  // Each reminder on its own: one that fails does not take the others with it.
  for (const [name, remind] of [
    ['documents', remindAll],
    ['bank renewals', remindBankRenewals],
    ['statements', remindStatements],
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
