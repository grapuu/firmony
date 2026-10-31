// The designated person's side of a meeting (store.ts): started from the register on his phone, followed live, every
// step done there or, when it needs his own judgement, on the dossier's full page. Only the designated person: the
// identification of people is his alone (his word of 27 October 2026), and so is the approval.
import type { Context, Hono } from 'hono'
import type { Child } from 'hono/jsx'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import type { AppBindings } from '../app/routes'
import { userByEmail, type Who } from '../app/store'
import { newLink, newToken } from '../app/session'
import { bell, ringStatement } from '../bell'
import { DOMAIN, ORDER, PLANS, TEAM } from '../config'
import { startMonths } from '../content/terms'
import { now, sha256Hex, withinLimit } from '../db'
import { later, siteOrigin } from '../http'
import { normalizeIco } from '../ico'
import { flushOutbox } from '../mail'
import { acceptedAs, isClient, orderOf, type Order } from '../order'
import { lookupCompany, lookupEntity, oneMayConclude } from '../rpo'
import { normalName } from '../aml/model'
import { dossierProposals } from '../aml/proposals'
import { admissionForOrder, bankOriginalsIntact, dossierOfOrder, isOfficer, sourceIntact } from '../aml/store'
import { idCopy, inPersonIntact, recordInPerson } from '../aml/in-person'
import { leastLoadedAccountant } from '../team/assign'
import { paperClientBatch } from '../team/paper-client'
import { teamMembers } from '../team/store'
import { MeetingDeskPage, MeetingStartPage, PaperContractPage, type MeetingStartProps } from '../views/meeting'
import { approvalPlan, approveAtMeeting } from './approve'
import { firstName, keepLink, keptLink, meetingFacts, stateText, stepOf } from './store'
import { paperPhoto } from './paper'

type Env = { Bindings: AppBindings; Variables: { who: Who } }
type Ctx = Context<Env>
type Render = (c: Ctx, title: string, child: Child, status?: ContentfulStatusCode) => Promise<Response>

const ID = /^[A-Za-z0-9-]{1,64}$/
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
/**
 * Whose address a client's may be: a valid one, never ours (the domain of the service) nor a member's of the team, who
 * would be signed in to the client's company with it ('email', 'team'; null when it may be the client's).
 */
async function clientAddressError(db: D1Database, email: string): Promise<'email' | 'team' | null> {
  if (!EMAIL.test(email)) return 'email'
  if (email.endsWith(`@${DOMAIN}`) || (await userByEmail(db, email))?.team) return 'team'
  return null
}
const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const today = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Bratislava' }).format(new Date())

/** What a refused step says on the page it comes back to. */
const ERRORS: Record<string, string> = {
  stale: 'Medzitým sa údaje zmenili. Pozrite sa na ne znova.',
  compared: 'Potvrďte, že ste údaje a podobu porovnali s dokladom.',
  front: 'Odfoťte prednú stranu dokladu.',
  back: 'Odfoťte aj zadnú stranu dokladu.',
  type: 'Fotka musí byť obrázok (JPEG, PNG, WebP) alebo PDF.',
  size: 'Fotka je väčšia ako 10 MB.',
  manual: 'Niektorú kontrolu treba dokončiť v spise.',
  pep: 'Potvrďte, že ste overili PEP vo verejných zdrojoch.',
  kuv: 'Napíšte, ako ste overili konečných užívateľov výhod.',
  failed: 'Kontroly alebo schválenie sa nepodarilo zapísať. Skontrolujte ich v spise.',
  paper: 'Odfoťte podpísanú zmluvu.',
  signed: 'Potvrďte, že ste zmluvu obaja podpísali.',
  client: 'Klienta sa nepodarilo založiť: overenie alebo objednávka sa medzitým zmenili.',
  originals: 'Pôvodné podklady overenia nie sú úplné. Otvorte spis.',
  email: 'Napíšte platný e-mail.',
  link: 'Odkaz sa nepodarilo poslať. Skúste to o chvíľu.',
  expired: 'Stretnutie vypršalo. Začnite nové.',
  team: 'Tento e-mail patrí Firmony alebo členovi tímu. Napíšte e-mail klienta.',
}
const FLASH: Record<string, string> = {
  overene: 'Totožnosť je overená.',
  schvalene: 'Kontroly sú zapísané a klient je schválený.',
  odkaz: 'Odkaz je na ceste.',
  pripojene: 'Nový QR kód je pripravený.',
}

export function registerMeetingRoutes(app: Hono<Env>, render: Render): void {
  const missing = (c: Ctx) => c.notFound()

  /** The meeting of the address, only for the designated person. */
  async function meeting(c: Ctx): Promise<Order | null> {
    const id = c.req.param('id') ?? ''
    if (!ID.test(id) || !(await isOfficer(c.env.DB, c.get('who').user))) return null
    const row = await c.env.DB.prepare('SELECT * FROM orders WHERE id = ? AND meeting_by IS NOT NULL').bind(id).first<Record<string, unknown>>()
    return row ? orderOf(row) : null
  }
  const back = (order: Order, query: string) => `/ucto/stretnutie/${order.id}?${query}`

  // ------------------------------------------------------------------------------------------- starting a meeting
  async function start(c: Ctx, ico: string, values: MeetingStartProps['values'], error: string | null, status: ContentfulStatusCode = 200) {
    let found: MeetingStartProps['found'] = null
    if (ico) {
      const lookup = await lookupCompany(ico)
      const registered = 'found' in lookup ? lookup.found : null
      const entity = registered?.rpoId ? await lookupEntity(registered.rpoId) : null
      if ('failed' in lookup || (registered && !entity)) error = error ?? 'Register teraz neodpovedá. Skúste to o chvíľu.'
      else if (!registered || registered.terminated) error = error ?? 'Firmu s týmto IČO register nepozná.'
      else if (entity && entity.directors.length === 0) error = error ?? 'Register pri tejto firme neuvádza konateľa.'
      else if (entity) found = { name: registered.name, address: registered.address, directors: entity.directors, mayConclude: oneMayConclude(entity.form ?? registered.form, entity.directors, entity.acting), client: await isClient(c.env.DB, ico) }
    }
    return render(c, 'Nový klient na stretnutí', <MeetingStartPage ico={ico} found={found} error={error} values={values} />, status)
  }

  app.get('/stretnutie', async (c) => {
    if (!(await isOfficer(c.env.DB, c.get('who').user))) return missing(c)
    const raw = c.req.query('ico') ?? ''
    const ico = raw ? normalizeIco(raw) : ''
    return start(c, ico ?? '', { director: '', email: '', plan: 'start' }, raw && !ico ? 'IČO má osem číslic.' : null)
  })

  app.post('/stretnutie', async (c) => {
    const db = c.env.DB
    const user = c.get('who').user
    if (!(await isOfficer(db, user))) return missing(c)
    const body = await c.req.parseBody()
    const ico = normalizeIco(text(body.ico, 12)) ?? ''
    const values = { director: text(body.konatel, 160), email: text(body.email, 200).toLowerCase(), plan: text(body.balik, 10) }
    if (!ico) return start(c, '', values, 'IČO má osem číslic.', 422)
    const wrongAddress = await clientAddressError(db, values.email)
    if (wrongAddress) return start(c, ico, values, ERRORS[wrongAddress] ?? '', 422)
    const plan = PLANS.find((p) => p.id === values.plan)
    if (!plan) return start(c, ico, values, 'Vyberte balík.', 422)
    if (!(await withinLimit(db, 'meeting-start', user.id, 30, 3600))) return start(c, ico, values, 'Priveľa stretnutí za hodinu. Skúste to neskôr.', 429)
    // As the paper intake (aml/routes.tsx): the company, its seat and who may act for it only as the register says now.
    const lookup = await lookupCompany(ico)
    const registered = 'found' in lookup ? lookup.found : null
    const entity = registered?.rpoId ? await lookupEntity(registered.rpoId) : null
    const director = entity?.directors.find((d) => d.name === values.director)
    if (!registered || registered.terminated || !entity || !director) return start(c, ico, values, 'Vyberte konateľa z registra.', 422)
    if (!oneMayConclude(entity.form ?? registered.form, entity.directors, entity.acting)) return start(c, ico, values, null, 409)
    if (await isClient(db, ico)) return start(c, ico, values, 'Táto firma už je naším klientom.', 409)
    const id = crypto.randomUUID()
    const token = newToken()
    const ts = now()
    const inserted = await db.batch([
      db.prepare(`INSERT INTO orders (id, token, created_at, expires_at, ico, company, address, register_line, directors, plan, person, email, legal_form, acting, aml_paper, meeting_by)
        SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, 1, ?15 WHERE EXISTS (SELECT 1 FROM users WHERE id = ?15 AND team = 'admin')`)
        .bind(id, await sha256Hex(token), ts, ts + ORDER.days * 86400, ico, registered.name, registered.address, registered.registerLine, JSON.stringify(entity.directors), plan.id, director.name, values.email, entity.form ?? registered.form, entity.acting, user.id),
      db.prepare("INSERT INTO events (at, user_id, action, subject) SELECT ?, ?, 'meeting.started', ? WHERE EXISTS (SELECT 1 FROM orders WHERE id = ?3)").bind(ts, user.id, id),
    ])
    if (!inserted[0]?.meta.changes) return missing(c)
    keepLink(c, id, token)
    return c.redirect(`/ucto/stretnutie/${id}`, 303)
  })

  // ------------------------------------------------------------------------------------------- the meeting
  app.get('/stretnutie/:id', async (c) => {
    const order = await meeting(c)
    if (!order) return missing(c)
    const db = c.env.DB
    const facts = await meetingFacts(db, order.id)
    if (!facts) return missing(c)
    const view = facts.dossier ? await dossierOfOrder(db, order.id) : null
    const admitted = Boolean(await admissionForOrder(db, order))
    const step = stepOf(facts, admitted)
    const expired = order.status === 'expired'
    const plan = step === 'approve' && view ? approvalPlan(view, await dossierProposals(c.env, view.declaration, order.company, Date.now(), order.ico).catch(() => ({}))) : null
    const ok = c.req.query('ok') ?? ''
    const err = c.req.query('chyba') ?? ''
    const token = expired ? null : await keptLink(c, order)
    return render(c, `Stretnutie: ${order.company}`, <MeetingDeskPage order={order} step={expired ? 'connect' : step} state={stateText(facts, 'desk')} person={firstName(order.person)}
      link={token ? `${siteOrigin(c)}/objednavka/${token}` : null} view={view} plan={plan} months={startMonths(today())}
      accountants={(await teamMembers(db)).filter((m) => m.team === 'accountant' || m.team === 'admin').map((m) => ({ id: m.id, name: m.name }))}
      accountant={(await leastLoadedAccountant(db)) ?? ''} flash={FLASH[ok] ?? null} error={expired ? ERRORS.expired : ERRORS[err] ?? null} />)
  })

  // What both phones ask for every few seconds: a change of it loads the page again. No data of a person in it.
  app.get('/stretnutie/:id/stav', async (c) => {
    const order = await meeting(c)
    const facts = order ? await meetingFacts(c.env.DB, order.id) : null
    if (!facts) return missing(c)
    return c.text(stateText(facts, 'desk'), 200, { 'Cache-Control': 'no-store', 'x-firmony-refresh': '1' })
  })

  // A new link for the director's phone (this browser had none, or the old one should stop working).
  app.post('/stretnutie/:id/pripojit', async (c) => {
    const order = await meeting(c)
    if (!order || order.status !== 'open') return missing(c)
    const token = newToken()
    const changed = await c.env.DB.prepare("UPDATE orders SET token = ?1 WHERE id = ?2 AND status = 'open' AND company_id IS NULL").bind(await sha256Hex(token), order.id).run()
    if (!changed.meta.changes) return missing(c)
    keepLink(c, order.id, token)
    return c.redirect(back(order, 'ok=pripojene'), 303)
  })

  // The link by email, when the camera will not do: to the director's address, corrected here if it was misheard.
  app.post('/stretnutie/:id/email', async (c) => {
    const db = c.env.DB
    const order = await meeting(c)
    if (!order || order.status !== 'open') return missing(c)
    const body = await c.req.parseBody()
    const email = text(body.email, 200).toLowerCase()
    const wrongAddress = await clientAddressError(db, email)
    if (wrongAddress) return c.redirect(back(order, `chyba=${wrongAddress}`), 303)
    if (!(await withinLimit(db, 'meeting-link', order.id, 6, 3600))) return c.redirect(back(order, 'chyba=link'), 303)
    let token = await keptLink(c, order)
    const ts = now()
    const statements = [db.prepare("UPDATE orders SET email = ?1 WHERE id = ?2 AND status = 'open' AND company_id IS NULL").bind(email, order.id)]
    if (!token) {
      token = newToken()
      statements.push(db.prepare("UPDATE orders SET token = ?1 WHERE id = ?2 AND status = 'open' AND company_id IS NULL").bind(await sha256Hex(token), order.id))
      keepLink(c, order.id, token)
    }
    await db.batch([...statements,
      ringStatement(db, 'meeting-link', `${order.id}:${ts}`, email, bell.meetingLink(`${siteOrigin(c)}/objednavka/${token}`)),
      db.prepare("INSERT INTO events (at, user_id, action, subject) VALUES (?, ?, 'meeting.link.sent', ?)").bind(ts, c.get('who').user.id, order.id)])
    later(c, flushOutbox(db, c.env.EMAIL))
    return c.redirect(back(order, 'ok=odkaz'), 303)
  })

  // The identity document, at the meeting: both sides photographed and the data and likeness compared.
  app.post('/stretnutie/:id/doklad', async (c) => {
    const order = await meeting(c)
    if (!order || order.status !== 'open' || !c.env.FILES) return missing(c)
    const view = await dossierOfOrder(c.env.DB, order.id)
    if (!view) return c.redirect(back(order, 'chyba=stale'), 303)
    const body = await c.req.parseBody()
    const result = await recordInPerson(c.env.DB, c.env.FILES, c.get('who').user, view, {
      hash: text(body.hash, 64), front: await idCopy(body.predna), back: await idCopy(body.zadna), compared: body.porovnane === '1',
    })
    return c.redirect(back(order, result === 'ok' ? 'ok=overene' : `chyba=${result}`), 303)
  })

  // The checks and the approval, in one tap when nothing needs his own judgement (approve.ts).
  app.post('/stretnutie/:id/schvalit', async (c) => {
    const order = await meeting(c)
    if (!order || order.status !== 'open') return missing(c)
    const view = await dossierOfOrder(c.env.DB, order.id)
    if (!view) return c.redirect(back(order, 'chyba=stale'), 303)
    const body = await c.req.parseBody()
    const plan = approvalPlan(view, await dossierProposals(c.env, view.declaration, order.company, Date.now(), order.ico).catch(() => ({})))
    const result = await approveAtMeeting(c.env, c.get('who').user, order, view, plan, { hash: text(body.hash, 64), pep: body.pep === '1', kuv: text(body.kuv, 1500) })
    return c.redirect(back(order, result === 'ok' ? 'ok=schvalene' : `chyba=${result}`), 303)
  })

  // The contract both signed on paper: its photo kept with the order, the client made (team/paper-client.ts), the
  // director's phone shown the way in, and the sign-in link by email for any other device.
  app.post('/stretnutie/:id/zmluva', async (c) => {
    const db = c.env.DB
    const user = c.get('who').user
    const order = await meeting(c)
    if (!order || order.status !== 'open' || !c.env.FILES) return missing(c)
    const body = await c.req.parseBody()
    if (body.podpisana !== '1') return c.redirect(back(order, 'chyba=signed'), 303)
    const photo = await idCopy(body.zmluva)
    if (typeof photo === 'string') return c.redirect(back(order, `chyba=${photo === 'missing' ? 'paper' : photo}`), 303)
    const plan = PLANS.find((p) => p.id === text(body.balik, 10))
    const start = text(body.start, 10)
    const accountants = (await teamMembers(db)).filter((m) => m.team === 'accountant' || m.team === 'admin')
    const accountant = accountants.find((a) => a.id === text(body.uctovnicka, 64))?.id ?? null
    if (!plan || !startMonths(today()).includes(start)) return c.redirect(back(order, 'chyba=stale'), 303)
    const admission = await admissionForOrder(db, order)
    const view = await dossierOfOrder(db, order.id)
    if (!admission || !view || (await isClient(db, order.ico))) return c.redirect(back(order, 'chyba=client'), 303)
    // As for any paper contract: a director the register named, acting alone, and the originals of the identification intact.
    if (!oneMayConclude(order.legalForm, order.directors, order.acting) || !order.directors?.some((d) => normalName(d.name) === normalName(admission.signerName))) return c.redirect(back(order, 'chyba=client'), 303)
    if (!(await sourceIntact(c.env.FILES, view.dossier)) || !view.inPerson || !(await inPersonIntact(c.env.FILES, view.inPerson))
      || (admission.level === 'high' && !(await bankOriginalsIntact(db, c.env.FILES, view.dossier, view.decision?.bank_id ?? '')))) return c.redirect(back(order, 'chyba=originals'), 303)
    // The address he signs in with, read back to him at the table: corrected here when it was misheard at the start.
    const email = text(body.email, 200).toLowerCase() || order.email
    const wrongAddress = await clientAddressError(db, email)
    if (wrongAddress) return c.redirect(back(order, `chyba=${wrongAddress}`), 303)
    const existing = await userByEmail(db, email)
    if (email !== order.email) await db.prepare("UPDATE orders SET email = ?1 WHERE id = ?2 AND status = 'open' AND company_id IS NULL").bind(email, order.id).run()
    const key = `onboarding/${order.id}/zmluva-${crypto.randomUUID()}.${photo.ext}`
    await c.env.FILES.put(key, photo.bytes, { httpMetadata: { contentType: photo.type } })
    const role = order.directors?.find((d) => normalName(d.name) === normalName(admission.signerName))?.role ?? null
    const made = await paperClientBatch(db, user.id, {
      order, admission, name: order.company, ico: order.ico, address: order.address, person: admission.signerName, email, plan: plan.id, vat: body.dph === '1',
      accountant, request: order.requestId, start, legalForm: order.legalForm, role, registerLine: order.registerLine,
      paper: { key, type: photo.type, sha256: photo.sha256, bytes: photo.bytes.length },
    }, existing?.id ?? null)
    try {
      await db.batch(made.statements)
    } catch {
      // Nothing was written: the batch is one transaction.
    }
    if (!(await acceptedAs(db, order.id, made.companyId))) {
      await c.env.FILES.delete(key).catch(() => undefined)
      return c.redirect(back(order, 'chyba=client'), 303)
    }
    const login = await newLink(db, made.userId, TEAM.welcomeDays * 24 * 60)
    await db.batch([login.statement, ringStatement(db, 'contract', order.id, email, bell.contract(`${siteOrigin(c)}/app/vstup?t=${login.token}`)),
      db.prepare("INSERT INTO events (at, company_id, user_id, action, subject) VALUES (?, ?, ?, 'meeting.signed', ?)").bind(now(), made.companyId, user.id, order.id)])
    later(c, flushOutbox(db, c.env.EMAIL))
    return c.redirect(`/ucto/stretnutie/${order.id}`, 303)
  })

  // ------------------------------------------------------------------------------------------- the paper
  app.get('/stretnutie/:id/zmluva', async (c) => {
    const order = await meeting(c)
    if (!order) return missing(c)
    const director = order.directors?.find((d) => d.name === order.person)
    return render(c, 'Zmluva na vytlačenie', <PaperContractPage back={`/ucto/stretnutie/${order.id}`}
      party={{ name: order.company, address: order.address, ico: order.ico, register: order.registerLine, person: order.person, role: director?.role ?? 'konateľ' }} />)
  })
  app.get('/zmluva-na-papier', async (c) => {
    if (c.get('who').user.team !== 'admin') return missing(c)
    return render(c, 'Zmluva na vytlačenie', <PaperContractPage party={null} back="/ucto/stretnutie" />)
  })

  // The photo of the contract, for the team that keeps the client (the client sees it in the app, app/routes.tsx).
  app.get('/stretnutie/:id/zmluva/foto', async (c) => {
    const order = await meeting(c)
    if (!order?.paperKey || !c.env.FILES) return missing(c)
    return paperPhoto(c.env.FILES, order)
  })
}
