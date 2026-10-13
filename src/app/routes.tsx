// The client's app under /app. Signing in is open; everything else needs a session, and every read and change
// is made for the company of that session (store.ts). Forms answer with a redirect to a page that says what
// happened, so a reload never sends anything twice.
import { Hono, type Context } from 'hono'
import { html } from 'hono/html'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { APP, BRAND } from '../config'
import { ensureSchema, now, withinLimit } from '../db'
import { connection, isLocal, later, siteOrigin } from '../http'
import { flushOutbox, queueStatement, type Mailer } from '../mail'
import { DocumentPage, DocumentsPage, MessagesPage, Missing, Overview, PaymentPage, PaymentsPage, dayOf } from '../views/inside-pages'
import { Door, Enter, Expired, LinkSent, LoginForm, Shell, type Place } from '../views/inside'
import { app as t, monthName } from './copy'
import { deadlinesFor, nextMonth } from './deadlines'
import { DEMO, seedDemo } from './demo'
import { EXEMPTS, type Exempt } from './match'
import { FILE_TYPES, fileHash, readDocument, sniff, type FileKind } from './read'
import { currentWho, endSession, linkUsable, newLink, startSession, useLink } from './session'
import {
  clearExemptStatement,
  countMissing,
  deleteDocumentStatements,
  documentByHash,
  documentsOfPayment,
  eventStatement,
  exemptStatement,
  filesToday,
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
}

type Env = { Bindings: AppBindings; Variables: { who: Who } }
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
  const user = await userByEmail(db, email)
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
  if (!(await startSession(c, db, user))) return render(c, <Door title={t.login.expiredTitle}>{<Expired noCompany />}</Door>, 403)
  return c.redirect('/app', 303)
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
  await seedDemo(db, today())
  await startSession(c, db, DEMO.user, DEMO.company)
  return c.redirect('/app', 303)
})

// ---------------------------------------------------------------------------------------------------------------
// Everything else needs a session
// ---------------------------------------------------------------------------------------------------------------

appRoutes.use('*', async (c, next) => {
  await ensureSchema(c.env.DB)
  const who = await currentWho(c, c.env.DB)
  if (!who) {
    if (c.req.method === 'GET' || c.req.method === 'HEAD') return c.redirect('/app/prihlasenie', 303)
    return c.text('Forbidden', 403)
  }
  c.set('who', who)
  await next()
})

async function shell(c: Ctx, place: Place | null, title: string, node: unknown, status: ContentfulStatusCode = 200) {
  const who = c.get('who')
  const [missing, unread] = await Promise.all([countMissing(c.env.DB, who.company.id), unseenFromFirmony(c.env.DB, who.company.id)])
  return render(
    c,
    <Shell who={who} place={place} missing={missing} unread={unread} title={title}>
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
  const [missingAll, figures, messages, counts, byMonth] = await Promise.all([
    listPayments(db, company, 'missing', 200),
    monthFigures(db, company, `${month}-01`, `${nextMonth(month)}-01`),
    listMessages(db, company, 1),
    db.prepare('SELECT COUNT(*) AS n FROM payments WHERE company_id = ?').bind(company).first<{ n: number }>(),
    db
      .prepare(`SELECT substr(p.booked_on, 1, 7) AS month, COUNT(*) AS n FROM payments p WHERE p.company_id = ? AND p.exempt IS NULL AND NOT EXISTS (SELECT 1 FROM links l WHERE l.payment_id = p.id) GROUP BY 1`)
      .bind(company)
      .all<{ month: string; n: number }>(),
  ])
  const suggested = await suggestions(db, company, missingAll)
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
      accountant={who.company.accountant}
      last={messages[0] ?? null}
      now={now()}
      flash={flashOf(c)}
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
  const filter = q === 'hotove' ? 'done' : q === 'vsetky' ? 'all' : 'missing'
  const [payments, missingCount] = await Promise.all([listPayments(db, who.company.id, filter), countMissing(db, who.company.id)])
  const suggested = await suggestions(db, who.company.id, payments)
  return shell(c, 'payments', t.payments.title, <PaymentsPage filter={filter} payments={payments} missingCount={missingCount} suggested={new Set(suggested.keys())} flash={flashOf(c)} />)
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

const EXTENSIONS: Record<FileKind, string> = { jpeg: 'jpg', png: 'png', webp: 'webp', heic: 'heic', pdf: 'pdf', xml: 'xml' }

interface Taken {
  files: { name: string; kind: FileKind; bytes: Uint8Array }[]
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

/**
 * Keeps the files and writes the documents down; a document sent on a payment's page belongs to that payment.
 * A file that was sent before is not kept twice: on a payment's page the document we have is given to it.
 */
async function keepFiles(c: Ctx, files: Taken['files'], payment: string | null): Promise<{ added: number; known: string[] }> {
  const who = c.get('who')
  const db = c.env.DB
  const bucket = c.env.FILES
  const out = { added: 0, known: [] as string[] }
  if (!bucket) return out
  const toRead: string[] = []
  const statements: D1PreparedStatement[] = []
  const seen = new Set<string>()
  for (const file of files) {
    const hash = await fileHash(file.bytes)
    const existing = seen.has(hash) ? 'this-request' : await documentByHash(db, who.company.id, hash)
    if (existing) {
      if (payment && existing !== 'this-request') statements.push(linkStatement(db, who.company.id, payment, existing, 'client', who.user.id))
      else out.known.push(file.name)
      continue
    }
    seen.add(hash)
    const id = crypto.randomUUID()
    const key = `companies/${who.company.id}/documents/${id}.${EXTENSIONS[file.kind]}`
    await bucket.put(key, file.bytes, { httpMetadata: { contentType: FILE_TYPES[file.kind] } })
    let reading: Reading | null = null
    let status: 'reading' | 'read' | 'manual' = 'reading'
    let readBy: string | null = null
    if (file.kind === 'xml') {
      reading = readInvoice(new TextDecoder().decode(file.bytes), who.company.ico)
      status = reading ? 'read' : 'manual'
      readBy = reading ? 'xml' : 'person: not an invoice'
    } else toRead.push(id)
    statements.push(
      insertDocumentStatement(db, { id, company: who.company.id, source: 'upload', addedBy: who.user.id, fileKey: key, fileType: FILE_TYPES[file.kind], fileName: file.name, fileBytes: file.bytes.length, fileHash: hash, reading, readBy, status }),
      eventStatement(db, { company: who.company.id, user: who.user.id, action: 'document.added', subject: id, detail: { kind: file.kind, bytes: file.bytes.length, payment } }),
    )
    if (payment) statements.push(linkStatement(db, who.company.id, payment, id, 'client', who.user.id))
    out.added++
  }
  if (statements.length > 0) await db.batch(statements)
  if (out.added > 0) later(c, readAll(c.env, who.company, toRead, payment === null || files.some((f) => f.kind === 'xml')))
  return out
}

/** Has every new document read, then pairs what can be paired. */
async function readAll(env: AppBindings, company: Company, ids: string[], match: boolean): Promise<void> {
  for (const id of ids) await readOne(env, company, id)
  if (match || ids.length > 0) await matchCompany(env.DB, company.id)
}

export async function readOne(env: AppBindings, company: Company, id: string): Promise<void> {
  const db = env.DB
  const row = await db.prepare("SELECT file_key, file_type FROM documents WHERE id = ? AND company_id = ? AND status = 'reading' AND deleted_at IS NULL").bind(id, company.id).first<{ file_key: string | null; file_type: string | null }>()
  if (!row) return
  await db.prepare('UPDATE documents SET read_tries = read_tries + 1 WHERE id = ?').bind(id).run()
  const object = row.file_key && env.FILES ? await env.FILES.get(row.file_key) : null
  if (!object) {
    await db.batch([manualStatement(db, company.id, id, 'no file')])
    return
  }
  const bytes = new Uint8Array(await object.arrayBuffer())
  const kind = sniff(bytes)
  const result = kind ? await readDocument(env.ANTHROPIC_API_KEY, { kind, bytes }, company) : { manual: 'unknown file' }
  if ('reading' in result) await db.batch([readingStatement(db, company.id, id, result.reading, result.by), eventStatement(db, { company: company.id, user: null, action: 'document.read', subject: id, detail: { by: result.by } })])
  else await db.batch([manualStatement(db, company.id, id, result.manual), eventStatement(db, { company: company.id, user: null, action: 'document.manual', subject: id, detail: { why: result.manual } })])
}

appRoutes.get('/doklady', async (c) => {
  const who = c.get('who')
  const filter = c.req.query('filter') === 'bez-platby' ? 'loose' : 'all'
  const docs = await listDocuments(c.env.DB, who.company.id, filter)
  return shell(c, 'documents', t.documents.title, <DocumentsPage filter={filter} docs={docs} inbox={inboxAddress(who.company)} flash={flashOf(c)} problems={[]} />)
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
  const policy = type === 'application/pdf' ? "default-src 'none'; object-src 'self'; frame-ancestors 'none'" : "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox"
  return new Response(object.body, {
    headers: {
      'Content-Type': type,
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(name)}`,
      'Cache-Control': 'private, no-store',
      'Content-Security-Policy': policy,
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
  return shell(c, 'messages', t.messages.title, <MessagesPage messages={messages} accountant={who.company.accountant} now={now()} payments={payments} flash={flashOf(c)} {...extra} />, status)
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
      to: BRAND.email,
      subject: `Správa od klienta: ${who.company.name}`,
      body: [`${who.user.name} (${who.company.name}) napísal(a):`, '', text, '', payment ? `K platbe ${payment.bookedOn}, ${(payment.amountCents / 100).toFixed(2)} €, ${payment.party ?? ''}` : '', `Odpovedať: ${siteOrigin(c)}/app/spravy`].join('\n'),
    }),
  ])
  later(c, flushOutbox(db, c.env.EMAIL))
  return c.redirect('/app/spravy?ok=poslane#posledna', 303)
})

appRoutes.notFound((c) => (c.get('who') ? shell(c, null, t.errors.notFound, <Missing />, 404) : c.redirect('/app/prihlasenie', 303)))

// ---------------------------------------------------------------------------------------------------------------
// The schedule
// ---------------------------------------------------------------------------------------------------------------

/** Every fifteen minutes: documents whose reading was cut off are read again (three times at most), old sessions go. */
export async function appScheduled(env: AppBindings): Promise<void> {
  const db = env.DB
  const ts = now()
  const stuck = await db
    .prepare(
      `SELECT d.id AS doc_id, d.read_tries, c.id AS company_id, c.name, c.ico, c.vat_payer, c.plan, c.inbox, c.accountant, c.demo
       FROM documents d JOIN companies c ON c.id = d.company_id
       WHERE d.status = 'reading' AND d.deleted_at IS NULL AND d.created_at < ? ORDER BY d.created_at LIMIT 20`,
    )
    .bind(ts - 120)
    .all<Record<string, unknown>>()
  for (const row of stuck.results) {
    const company: Company = { id: String(row.company_id), name: String(row.name), ico: (row.ico as string | null) ?? null, vatPayer: row.vat_payer === 1, plan: String(row.plan), inbox: String(row.inbox), accountant: (row.accountant as string | null) ?? null, demo: row.demo === 1 }
    if (Number(row.read_tries ?? 0) >= 3) await db.batch([manualStatement(db, company.id, String(row.doc_id), 'three tries')])
    else await readOne(env, company, String(row.doc_id))
  }
  await db.batch([
    db.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(ts),
    db.prepare('DELETE FROM login_links WHERE expires_at < ?').bind(ts - 86400),
  ])
}
