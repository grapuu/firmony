// The client's app under /app. Signing in is open; everything else needs a session, and every read and change
// is made for the company of that session (store.ts). Forms answer with a redirect to a page that says what
// happened, so a reload never sends anything twice.
import { Hono, type Context } from 'hono'
import { html } from 'hono/html'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { APP, BANK, BRAND, TEAM } from '../config'
import { ensureSchema, now, sha256Hex, withinLimit } from '../db'
import { connection, isLocal, later, siteOrigin } from '../http'
import { flushOutbox, queueStatement, type Mailer } from '../mail'
import { DocumentPage, DocumentsPage, MessagesPage, Missing, Overview, PaymentPage, PaymentsPage, dayOf, groupIban } from '../views/inside-pages'
import { Door, Enter, Expired, LinkSent, LoginForm, Shell, type Place } from '../views/inside'
import { CompanyPage } from '../views/settings'
import { InvoiceFormPage, InvoicePage, InvoicesPage } from '../views/invoices'
import { BankPage } from '../views/bank'
import { bankReady, dropAccount, finishLink, linksOf, listBanks, noticeOf, readDue, readLink, startLink, unlink } from './bank'
import { checkValues, getInvoice, invoiceLines, linesOf, listInvoices, plainIban, saveInvoiceStatements, totalsOf, ublOf, type Errors as InvoiceErrors, type InvoiceValues, type Line, type LineInput, type StoredInvoice } from './invoices'
import { dayOfText, textDay } from './booking'
import { lookupCompany } from '../rpo'
import { normalizeIco } from '../ico'
import { formatEur, formatEurExact } from '../format'
import { team as tt } from '../team/copy'
import { app as t, dayName, monthName } from './copy'
import { deadlinesFor, nextMonth } from './deadlines'
import { DEMO, seedDemo } from './demo'
import { EXEMPTS, type Exempt } from './match'
import { sniff } from './read'
import { keepFilesFor, readOne, type NewFile } from './intake'
import { remindAll, remindBankRenewals } from './remind'
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
  type Company,
  type Who,
} from './store'
import { readInvoice, readStatement, type Reading } from './xml'

export interface AppBindings {
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
  if (!user && email.toLowerCase() === TEAM.bootstrapEmail.toLowerCase()) {
    // The first administrator: whoever receives the email of the public mailbox, while nobody of the team exists.
    const anyone = await db.prepare('SELECT 1 AS x FROM users WHERE team IS NOT NULL LIMIT 1').first()
    if (!anyone) {
      const id = crypto.randomUUID()
      await db.batch([
        db.prepare("INSERT INTO users (id, created_at, email, name, team) VALUES (?, ?, ?, ?, 'admin')").bind(id, now(), TEAM.bootstrapEmail, TEAM.bootstrapName),
        eventStatement(db, { company: null, user: id, action: 'team.bootstrap' }),
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
  return render(c, <Door title={t.login.enterTitle}>{<Enter token={token} />}</Door>)
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
  return c.redirect(to, 303)
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
  await startSession(c, db, DEMO.user, DEMO.company)
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
  c.set('who', who as ClientWho)
  await next()
})

async function shell(c: Ctx, place: Place | null, title: string, node: unknown, status: ContentfulStatusCode = 200) {
  const who = c.get('who')
  const [missing, unread, companies] = await Promise.all([countMissing(c.env.DB, who.company.id), unseenFromFirmony(c.env.DB, who.company.id), companiesOf(c.env.DB, who.user.id)])
  return render(
    c,
    <Shell who={who} place={place} missing={missing} unread={unread} companies={companies} title={title}>
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
      .prepare(`SELECT substr(p.booked_on, 1, 7) AS month, COUNT(*) AS n FROM payments p WHERE p.company_id = ? AND p.exempt IS NULL AND NOT EXISTS (SELECT 1 FROM links l WHERE l.payment_id = p.id) GROUP BY 1`)
      .bind(company)
      .all<{ month: string; n: number }>(),
    db
      .prepare(
        `SELECT EXISTS (SELECT 1 FROM documents WHERE company_id = ?1 AND source = 'upload') AS upload,
                EXISTS (SELECT 1 FROM documents WHERE company_id = ?1 AND source = 'email') AS email,
                (SELECT COUNT(*) FROM members WHERE company_id = ?1) AS people`,
      )
      .bind(company)
      .first<{ upload: number; email: number; people: number }>(),
  ])
  const suggested = await suggestions(db, company, missingAll)
  const steps = { payments: (counts?.n ?? 0) > 0, upload: started?.upload === 1, email: started?.email === 1, people: (started?.people ?? 1) > 1 }
  const ready = bankReady(c.env)
  const bankNotice = ready ? noticeOf(await linksOf(db, company)) : null
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
      deadlines={deadlinesFor(who.company, day, new Map(byMonth.results.map((r) => [r.month, r.n])))}
      inbox={inboxAddress(who.company)}
      accountant={who.company.accountantName}
      last={messages[0] ?? null}
      now={now()}
      flash={flashOf(c)}
      steps={steps.payments && steps.upload && steps.email ? null : steps}
      me={who.user.id}
      bankReady={ready}
      bankNotice={bankNotice}
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
  const bank = bankReady(c.env) ? { links: await linksOf(db, who.company.id), today: today() } : null
  return shell(c, 'payments', t.payments.title, <PaymentsPage filter={filter} payments={payments} missingCount={missingCount} suggested={new Set(suggested.keys())} flash={flashOf(c)} search={search} bank={bank} />)
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
    <PaymentPage p={p} docs={docs} suggestions={offered} loose={loose.filter((d) => !offeredIds.has(d.id))} today={today()} flash={flashOf(c)} {...extra} />,
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
  const [linked] = await db.batch([linkStatement(db, who.company.id, id, doc, 'client', who.user.id), eventStatement(db, { company: who.company.id, user: who.user.id, action: 'link.client', subject: id, detail: { doc } })])
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
  const [changed] = await db.batch([exemptStatement(db, who.company.id, id, reason, note || null, who.user.id), eventStatement(db, { company: who.company.id, user: who.user.id, action: 'exempt.client', subject: id, detail: { reason } })])
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
  return shell(c, 'documents', t.documents.title, <DocumentsPage filter={filter} docs={docs} inbox={inboxAddress(who.company)} flash={flashOf(c)} problems={[]} search={search} />)
})

async function documentsWithProblems(c: Ctx, problems: string[], status: ContentfulStatusCode, flash: string | null = null) {
  const who = c.get('who')
  const docs = await listDocuments(c.env.DB, who.company.id, 'all')
  return shell(c, 'documents', t.documents.title, <DocumentsPage filter="all" docs={docs} inbox={inboxAddress(who.company)} flash={flash} problems={problems} />, status)
}

appRoutes.post('/doklady', async (c) => {
  const who = c.get('who')
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
  const bad = async () => {
    const [payments, missingCount] = await Promise.all([listPayments(db, who.company.id, 'all'), countMissing(db, who.company.id)])
    return shell(c, 'payments', t.payments.title, <PaymentsPage filter="all" payments={payments} missingCount={missingCount} suggested={new Set()} warn={t.payments.statementBad} />, 422)
  }
  if (typeof file !== 'object' || file === null || !('arrayBuffer' in file) || file.size === 0 || file.size > APP.fileBytes) return bad()
  const statements = readStatement(new TextDecoder().decode(await file.arrayBuffer()))
  if (!statements || statements.every((s) => !s.iban)) return bad()
  const result = await importStatements(db, who.company.id, who.user.id, statements)
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
    default:
      return null
  }
}

async function bankPage(c: Ctx, error: string | null = null, status: ContentfulStatusCode = 200) {
  const who = c.get('who')
  const ready = bankReady(c.env)
  const [links, banks] = await Promise.all([linksOf(c.env.DB, who.company.id), ready ? listBanks(c.env).catch(() => null) : Promise.resolve([])])
  return shell(
    c,
    'payments',
    t.bank.title,
    <BankPage ready={ready} links={links} banks={banks} owner={who.role === 'owner'} today={today()} flash={flashOf(c)} error={error ?? bankError(c)} />,
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
    if (/^[A-Za-z0-9_-]{43}$/.test(state)) await db.prepare("DELETE FROM bank_links WHERE state = ? AND company_id = ? AND status = 'pending'").bind(await sha256Hex(state), who.company.id).run()
    return c.redirect('/app/banka?chyba=zrusene', 303)
  }
  if (!bankReady(c.env) || code === '' || code.length > 2000 || !/^[A-Za-z0-9_-]{43}$/.test(state)) return c.redirect('/app/banka?chyba=neplatne', 303)
  try {
    const done = await finishLink(c.env, { company: who.company.id, user: who.user.id, code, state })
    if (!done) return c.redirect('/app/banka?chyba=neplatne', 303)
    later(c, readLink(c.env, done.link).catch(() => null))
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
  const link = ID.test(id) ? await db.prepare("SELECT id FROM bank_links WHERE id = ? AND company_id = ? AND status = 'active'").bind(id, who.company.id).first() : null
  if (!link || !bankReady(c.env)) return c.redirect('/app/banka', 303)
  if (!(await withinLimit(db, 'bank-read', who.company.id, BANK.readsPerHour, 3600))) return c.redirect('/app/banka?chyba=vela', 303)
  const result = await readLink(c.env, id, { ip: c.req.header('cf-connecting-ip') ?? '', agent: c.req.header('user-agent') ?? '' })
  if (result.status === 'read') return c.redirect(result.added > 0 ? `/app/banka?ok=banka-nacitane&n=${result.added}` : '/app/banka?ok=banka-nic', 303)
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
  const done = ID.test(id) ? await dropAccount(c.env.DB, who.company.id, who.user.id, id) : false
  return c.redirect(done ? '/app/banka?ok=ucet-odobraty' : '/app/banka', 303)
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
  await db.batch([privatelyStatement(db, who.company.id, id, paid), eventStatement(db, { company: who.company.id, user: who.user.id, action: paid ? 'document.private' : 'document.company', subject: id })])
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
    ? await c.env.DB.prepare('SELECT file_key, file_type, file_name FROM documents WHERE id = ? AND company_id = ? AND deleted_at IS NULL').bind(id, who.company.id).first<{ file_key: string | null; file_type: string | null; file_name: string | null }>()
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
  return shell(c, 'messages', t.messages.title, <MessagesPage messages={messages} accountant={who.company.accountantName} now={now()} payments={payments} flash={flashOf(c)} me={who.user.id} {...extra} />, status)
}

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
  await db.batch([
    messageStatement(db, { id, company: who.company.id, author: who.user.id, side: 'client', body: text, payment: payment?.id ?? null }),
    eventStatement(db, { company: who.company.id, user: who.user.id, action: 'message.sent', subject: id }),
    queueStatement(db, {
      key: `message:${id}`,
      to: who.company.accountantEmail ?? BRAND.email,
      subject: tt.mail.toTeamSubject(who.company.name),
      body: tt.mail.toTeamBody(
        who.user.name,
        who.company.name,
        text,
        payment ? `${payment.bookedOn}, ${(payment.amountCents / 100).toFixed(2).replace('.', ',')} €, ${payment.party ?? payment.note ?? ''}` : null,
        `${siteOrigin(c)}/ucto/klienti/${who.company.id}#spravy`,
      ),
    }),
  ])
  later(c, flushOutbox(db, c.env.EMAIL))
  return c.redirect('/app/spravy?ok=poslane#posledna', 303)
})

// ---------------------------------------------------------------------------------------------------------------
// The company: its details, its people, the reminders, switching to another one of the same user
// ---------------------------------------------------------------------------------------------------------------

async function companyPage(c: Ctx, extra: { invite?: { name: string; email: string }; errors?: { name?: string; email?: string; form?: string } } = {}, status: ContentfulStatusCode = 200) {
  const who = c.get('who')
  const db = c.env.DB
  const [people, companies] = await Promise.all([peopleOf(db, who.company.id), companiesOf(db, who.user.id)])
  const me = people.find((p) => p.id === who.user.id) ?? { ...who.user, role: who.role }
  return shell(
    c,
    'company',
    t.company.title,
    <CompanyPage company={who.company} people={people} me={me} companies={companies} inbox={inboxAddress(who.company)} invite={extra.invite ?? { name: '', email: '' }} errors={extra.errors ?? {}} flash={flashOf(c)} />,
    status,
  )
}

appRoutes.get('/firma', (c) => companyPage(c))

appRoutes.post('/firma/pozvat', async (c) => {
  const who = c.get('who')
  const db = c.env.DB
  const body = await c.req.parseBody()
  const invite = {
    name: typeof body.meno === 'string' ? body.meno.trim().slice(0, 120) : '',
    email: typeof body.email === 'string' ? body.email.trim().slice(0, 200) : '',
  }
  if (who.role !== 'owner') return companyPage(c, { invite, errors: { form: t.company.onlyOwner } }, 403)
  const errors: { name?: string; email?: string; form?: string } = {}
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

function invoiceForm(c: Ctx, id: string | null, values: InvoiceValues, errors: InvoiceErrors = {}, status: ContentfulStatusCode = 200, found: string | null = null, recent: { id: string; name: string }[] = []) {
  const who = c.get('who')
  return shell(c, 'invoices', id ? ti.form.editTitle : ti.form.title, <InvoiceFormPage id={id} values={values} vatPayer={who.company.vatPayer} errors={errors} found={found} preview={previewLines(values, who.company.vatPayer)} recent={recent} />, status)
}

/** The lines of a stored invoice as the form shows them, with an empty one to go on. */
function inputLines(lines: Line[], vatPayer: boolean): LineInput[] {
  return [
    ...lines.map((l) => ({ description: l.description, quantity: String(l.quantityMilli / 1000).replace('.', ','), unit: l.unit ?? 'ks', price: `${(l.unitCents / 100).toFixed(2).replace('.', ',')}`, vat: String(l.vatRate) })),
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

appRoutes.get('/faktury', async (c) => {
  const who = c.get('who')
  const invoices = await listInvoices(c.env.DB, who.company.id)
  return shell(c, 'invoices', ti.title, <InvoicesPage invoices={invoices} today={today()} flash={flashOf(c)} />)
})

appRoutes.get('/faktury/nova', async (c) => {
  const who = c.get('who')
  const day = today()
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
  if (issue) later(c, (async () => {
    await afterReading(db, who.company.id, documentId)
    await matchCompany(db, who.company.id)
  })())
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

appRoutes.notFound((c) => (c.get('who') ? shell(c, null, t.errors.notFound, <Missing />, 404) : c.redirect('/app/prihlasenie', 303)))

// ---------------------------------------------------------------------------------------------------------------
// The schedule
// ---------------------------------------------------------------------------------------------------------------

/** Every fifteen minutes: documents whose reading was cut off are read again (three times at most), old sessions go. */
export async function appScheduled(env: AppBindings, at: number = Date.now()): Promise<void> {
  const db = env.DB
  const ts = now()
  try {
    await remindAll(env, at)
    await remindBankRenewals(env, at)
  } catch (err) {
    console.error('reminders failed', err instanceof Error ? err.name : 'error')
  }
  try {
    await readDue(env)
  } catch (err) {
    console.error('reading the banks failed', err instanceof Error ? err.name : 'error')
  }
  const stuck = await db
    .prepare("SELECT id, company_id, read_tries FROM documents WHERE status = 'reading' AND deleted_at IS NULL AND created_at < ? ORDER BY created_at LIMIT 20")
    .bind(ts - 120)
    .all<{ id: string; company_id: string; read_tries: number }>()
  for (const row of stuck.results) {
    const company = await getCompany(db, row.company_id)
    if (!company) continue
    if (row.read_tries >= 3) await db.batch([manualStatement(db, company.id, row.id, 'three tries')])
    else {
      await readOne(env, company, row.id)
      await matchCompany(db, company.id)
    }
  }
  await db.batch([
    db.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(ts),
    db.prepare('DELETE FROM login_links WHERE expires_at < ?').bind(ts - 86400),
  ])
}
