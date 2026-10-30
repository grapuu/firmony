// The designated person's side of the s. r. o. for 1 €, at /ucto/zalozenia: the applications, one application with its
// files, the checks, the decision, the formation's steps, the calls and the end. His word of 27 October 2026: a person's
// identification is seen by the designated person alone, never by an accountant or another administrator.
import type { Context, Hono } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import type { Child } from 'hono/jsx'
import type { AppBindings } from '../app/routes'
import type { Who } from '../app/store'
import { isOfficer } from '../aml/store'
import { foundingProposals } from '../aml/proposals'
import { normalizeIco } from '../ico'
import { dayOfText } from '../app/booking'
import { flushOutbox } from '../mail'
import { later, siteOrigin } from '../http'
import { now } from '../db'
import { bratislavaDay } from '../time'
import { FoundingDetail, FoundingsList } from '../views/founding'
import { CHECK_KINDS, FOUNDING_RISKS, IDENTITY_WAYS, identityWaysOf, type CheckKind, type IdentityWay } from './model'
import { advance, callFounder, cancel, checksOf, decide, handedOverAt, decideExit, eventsOf, foundingById, foundingsList, mayWithdraw, notePayment, noteRefund, noteToFounder, placesLeft, recordCheck, register, verifyBlockers, withdraw } from './store'

type Env = { Bindings: AppBindings; Variables: { who: Who } }
type Ctx = Context<Env>
type Render = (c: Ctx, title: string, child: Child, status?: ContentfulStatusCode) => Promise<Response>

const ID = /^[0-9a-f-]{36}$/
const text = (v: unknown, max = 2000) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const today = () => bratislavaDay(now())

const FLASH: Record<string, string> = {
  kontrola: 'Kontrola je zaznamenaná.',
  overene: 'Prihláška je overená, zmluva vznikla. Zakladateľ dostal správu.',
  odmietnute: 'Prihláška je odmietnutá. Ak prišla platba, vráťte ju do 14 dní a zaznamenajte to.',
  vratene: 'Prihláška je vrátená zakladateľovi na doplnenie.',
  stav: 'Stav je zmenený a zakladateľ dostal správu.',
  vyzva: 'Výzva je odoslaná.',
  sprava: 'Správa je odoslaná.',
  odstupene: 'Od zmluvy sme odstúpili. Platba sa nevracia.',
  zrusene: 'Prihláška je zrušená.',
  platba: 'Vrátenie platby je zaznamenané.',
  zapisana: 'Firma je založená v aplikácii a zakladateľ dostal odkaz na prihlásenie. Účtovníčku jej aplikácia pridelila podľa vyťaženia; zmeniť ju môžete na stránke klienta.',
  odstupne: 'Rozhodnutie o odstupnom je uložené.',
}

const ERRORS: Record<string, string> = {
  state: 'Prihláška sa medzitým zmenila. Pozrite sa na ňu znova.',
  blocked: 'Overenie ešte nie je úplné. Pozrite si, čo chýba.',
  note: 'Napíšte, čo ste overili a z akého zdroja (aspoň 12 znakov).',
  risk: 'Pri prijatí vyberte rizikovú skupinu zakladateľa.',
  way: 'Pri totožnosti vyberte, ako ste ju overili. Pri podpise na papieri ju overíte len osobne s dokladom totožnosti.',
  reason: 'Napíšte dôvod (aspoň 5 znakov).',
  register: 'Register firmu s týmto IČO nenašiel. Skontrolujte IČO alebo to skúste o chvíľu.',
  exists: 'Firma s týmto IČO už v aplikácii je.',
  name: 'Obchodné meno v registri sa nezhoduje s menom z prihlášky. Skontrolujte IČO.',
  day: 'Napíšte deň vzniku firmy (deň zápisu do obchodného registra), napríklad 3. 12. 2026.',
  withdraw: 'Odstúpiť možno až po dvoch výzvach a 30 dňoch od druhej.',
}

export function registerFoundingTeam(app: Hono<Env>, render: Render): void {
  /** The application of the address, for the designated person only; anybody else gets no page. */
  async function officerOnly(c: Ctx): Promise<boolean> {
    const user = c.get('who')?.user
    return Boolean(user) && (await isOfficer(c.env.DB, user))
  }
  const missing = (c: Ctx) => c.notFound()

  async function detail(c: Ctx, id: string, error: string | null = null, status: ContentfulStatusCode = 200) {
    let f = await foundingById(c.env.DB, id)
    if (!f) return missing(c)
    f = await notePayment(c.env.DB, f)
    const [checks, events, blockers, proposals] = await Promise.all([
      // What counts now: the checks since the application was last handed over (store.ts, handedOverAt).
      handedOverAt(c.env.DB, id).then((since) => checksOf(c.env.DB, id, since)),
      eventsOf(c.env.DB, id),
      verifyBlockers(c.env.DB, f),
      // The founder on the sanctions lists and the payment, prepared for his check (aml/proposals.ts).
      f.status === 'verifying' ? foundingProposals(c.env, f).catch(() => ({})) : Promise.resolve({}),
    ])
    c.header('Cache-Control', 'no-store')
    const flash = error ? null : (FLASH[c.req.query('ok') ?? ''] ?? null)
    return render(c, f.company?.name ?? 'Založenie s. r. o.', <FoundingDetail f={f} checks={checks} events={events} blockers={blockers} today={today()} flash={flash} error={error} canWithdraw={mayWithdraw(f)} proposals={proposals} />, status)
  }

  app.get('/zalozenia', async (c) => {
    if (!(await officerOnly(c))) return missing(c)
    c.header('Cache-Control', 'no-store')
    const [list, places] = await Promise.all([foundingsList(c.env.DB), placesLeft(c.env.DB, today())])
    return render(c, 'Založenia s. r. o.', <FoundingsList list={list} places={places} today={today()} />)
  })

  app.get('/zalozenia/:id', async (c) => {
    if (!(await officerOnly(c)) || !ID.test(c.req.param('id'))) return missing(c)
    return detail(c, c.req.param('id'))
  })

  // The founder's files: downloaded, never shown inside our pages, and only to the designated person.
  app.get('/zalozenia/:id/subor/:which', async (c) => {
    if (!(await officerOnly(c)) || !ID.test(c.req.param('id'))) return missing(c)
    const f = await foundingById(c.env.DB, c.req.param('id'))
    const which = c.req.param('which')
    const key = !f ? null : which === 'predna' ? f.idFrontKey : which === 'zadna' ? f.idBackKey : which === 'podpis' ? f.signedKey : null
    const object = key && c.env.FILES ? await c.env.FILES.get(key) : null
    if (!object || !key) return missing(c)
    const ext = key.split('.').pop() ?? 'bin'
    return new Response(object.body, {
      headers: {
        'Content-Type': object.httpMetadata?.contentType ?? 'application/octet-stream',
        'Content-Disposition': `attachment; filename="zalozenie-${f!.vs}-${which}.${ext}"`,
        'Content-Security-Policy': "default-src 'none'; sandbox",
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  })

  /** A form of one application: the designated person, an application that exists, then the work. */
  function post(path: string, work: (c: Ctx, id: string, body: Record<string, unknown>) => Promise<Response>) {
    app.post(`/zalozenia/:id/${path}`, async (c) => {
      if (!(await officerOnly(c)) || !ID.test(c.req.param('id'))) return missing(c)
      return work(c, c.req.param('id'), await c.req.parseBody())
    })
  }
  const back = (c: Ctx, id: string, ok: string) => c.redirect(`/ucto/zalozenia/${id}?ok=${ok}`, 303)
  const user = (c: Ctx) => c.get('who').user.id
  const loaded = async (c: Ctx, id: string) => foundingById(c.env.DB, id)

  post('kontrola', async (c, id, body) => {
    const f = await loaded(c, id)
    if (!f) return missing(c)
    const kind = text(body.druh, 20) as CheckKind
    const note = text(body.poznamka)
    if (!CHECK_KINDS.includes(kind) || (body.vysledok !== 'clear' && body.vysledok !== 'problem')) return detail(c, id, ERRORS.state!, 422)
    if (note.length < 12) return detail(c, id, ERRORS.note!, 422)
    // Identity is clear only with the way it was verified, and on paper only in person (model.ts identityWaysOf).
    const way = IDENTITY_WAYS.find((w) => w === body.sposob) as IdentityWay | undefined
    if (kind === 'identity' && body.vysledok === 'clear' && (!way || !identityWaysOf(f).includes(way))) return detail(c, id, ERRORS.way!, 422)
    return (await recordCheck(c.env.DB, f, user(c), kind, body.vysledok, note, way)) ? back(c, id, 'kontrola') : detail(c, id, ERRORS.state!, 409)
  })

  post('rozhodnutie', async (c, id, body) => {
    const f = await loaded(c, id)
    if (!f) return missing(c)
    const verdict = body.verdikt === 'verified' || body.verdikt === 'refused' || body.verdikt === 'open' ? body.verdikt : null
    const note = text(body.poznamka)
    if (!verdict) return detail(c, id, ERRORS.state!, 422)
    if (verdict !== 'verified' && note.length < 5) return detail(c, id, ERRORS.reason!, 422)
    const risk = FOUNDING_RISKS.find((r) => r === body.riziko)
    const result = await decide(c.env.DB, f, user(c), verdict, note, today(), siteOrigin(c), risk)
    if (result !== 'ok') console.error('FOUNDING-DEBUG', verdict, result, JSON.stringify(await verifyBlockers(c.env.DB, f)))
    if (result !== 'ok') return detail(c, id, ERRORS[result]!, result === 'risk' ? 422 : 409)
    later(c, flushOutbox(c.env.DB, c.env.EMAIL))
    return back(c, id, verdict === 'verified' ? 'overene' : verdict === 'refused' ? 'odmietnute' : 'vratene')
  })

  post('stav', async (c, id, body) => {
    const f = await loaded(c, id)
    if (!f) return missing(c)
    const to = body.na === 'ordered' || body.na === 'signing' || body.na === 'filed' ? body.na : null
    if (!to) return detail(c, id, ERRORS.state!, 422)
    if (!(await advance(c.env.DB, f, user(c), to, text(body.poznamka), siteOrigin(c)))) return detail(c, id, ERRORS.state!, 409)
    later(c, flushOutbox(c.env.DB, c.env.EMAIL))
    return back(c, id, 'stav')
  })

  post('registracia', async (c, id, body) => {
    const f = await loaded(c, id)
    if (!f) return missing(c)
    const ico = normalizeIco(text(body.ico, 20))
    const arose = dayOfText(text(body.vznik, 20) || today(), 2026)
    if (!ico) return detail(c, id, ERRORS.register!, 422)
    if (!arose) return detail(c, id, ERRORS.day!, 422)
    const result = await register(c.env.DB, f, user(c), ico, arose, siteOrigin(c))
    if (result !== 'ok') return detail(c, id, ERRORS[result]!, result === 'state' ? 409 : 422)
    later(c, flushOutbox(c.env.DB, c.env.EMAIL))
    return back(c, id, 'zapisana')
  })

  post('vyzva', async (c, id, body) => {
    const f = await loaded(c, id)
    const words = text(body.text)
    if (!f) return missing(c)
    if (words.length < 5) return detail(c, id, ERRORS.reason!, 422)
    if (!(await callFounder(c.env.DB, f, user(c), words, siteOrigin(c)))) return detail(c, id, ERRORS.state!, 409)
    later(c, flushOutbox(c.env.DB, c.env.EMAIL))
    return back(c, id, 'vyzva')
  })

  post('sprava', async (c, id, body) => {
    const f = await loaded(c, id)
    const words = text(body.text)
    if (!f) return missing(c)
    if (words.length < 5) return detail(c, id, ERRORS.reason!, 422)
    await noteToFounder(c.env.DB, f, user(c), words, siteOrigin(c))
    later(c, flushOutbox(c.env.DB, c.env.EMAIL))
    return back(c, id, 'sprava')
  })

  post('odstupit', async (c, id, body) => {
    const f = await loaded(c, id)
    if (!f) return missing(c)
    if (!mayWithdraw(f)) return detail(c, id, ERRORS.withdraw!, 409)
    if (!(await withdraw(c.env.DB, f, user(c), text(body.poznamka), siteOrigin(c)))) return detail(c, id, ERRORS.state!, 409)
    later(c, flushOutbox(c.env.DB, c.env.EMAIL))
    return back(c, id, 'odstupene')
  })

  post('zrusit', async (c, id, body) => {
    const f = await loaded(c, id)
    const note = text(body.poznamka)
    if (!f) return missing(c)
    if (note.length < 5) return detail(c, id, ERRORS.reason!, 422)
    if (!(await cancel(c.env.DB, f, user(c), note, siteOrigin(c)))) return detail(c, id, ERRORS.state!, 409)
    later(c, flushOutbox(c.env.DB, c.env.EMAIL))
    return back(c, id, 'zrusene')
  })

  post('vratene', async (c, id, body) => {
    const f = await loaded(c, id)
    const note = text(body.poznamka)
    if (!f) return missing(c)
    if (note.length < 5) return detail(c, id, ERRORS.reason!, 422)
    return (await noteRefund(c.env.DB, f, user(c), note)) ? back(c, id, 'platba') : detail(c, id, ERRORS.state!, 409)
  })

  post('platba', async (c, id) => back(c, id, ''))

  post('odstupne', async (c, id, body) => {
    const f = await loaded(c, id)
    const note = text(body.poznamka)
    if (!f) return missing(c)
    const decision = body.rozhodnutie === 'charge' || body.rozhodnutie === 'waive' ? body.rozhodnutie : null
    if (note.length < 5) return detail(c, id, ERRORS.reason!, 422)
    return (await decideExit(c.env.DB, f, user(c), decision, note)) ? back(c, id, 'odstupne') : detail(c, id, ERRORS.state!, 409)
  })
}

