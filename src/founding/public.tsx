// The founder's side of the s. r. o. for 1 €, mounted at /zalozenie (src/index.tsx): the offer and the form that sends
// the link, the contract to read before applying, and the application by its link. The founder has no account; the link
// from the email is the key. Every form posts back to these pages, and the site's guard (origin, length) holds for them.
import { Hono, type Context } from 'hono'
import { html } from 'hono/html'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { BRAND, LIMITS } from '../config'
import { now, withinLimit } from '../db'
import { connection, later, siteOrigin } from '../http'
import { flushOutbox, type Mailer } from '../mail'
import { approvedRelease, contractCatalogueHash } from '../contracts'
import { operatorOf } from '../team/billing-store'
import { bratislavaDay } from '../time'
import { Layout, type PageMeta } from '../views/layout'
import { NotFound } from '../views/start'
import { FoundingContractPreview, FoundingLanding, FoundingPage, FoundingSent, type LandingValues } from '../views/founding'
import { checkFounding, editable, valuesFrom, valuesOf, type FoundingErrors } from './model'
import { applyFor, eventsOf, fixContract, foundingByToken, handOver, ID_BYTES, notePayment, paymentTarget, placesLeft, saveData, saveIdSide, saveSigned, SIGNED_BYTES, withdrawOpen } from './store'
import { foundingContractPdf } from './pdf'
import type { AppBindings } from '../app/routes'

type Env = { Bindings: AppBindings & { EMAIL?: Mailer } }
type Ctx = Context<Env>

export const foundingRoutes = new Hono<Env>()

const EMAIL = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)*\.[A-Za-z]{2,}$/
const PHONE = /^\+?[0-9 ()/.-]{6,24}$/
const today = () => bratislavaDay(now())

/** Where the visitor came from (utm_* and ref, the same rule as a request's in index.tsx): kept for the referral. */
const CARRIED = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'ref'] as const
const CARRY_VALUE = /^[\p{L}\p{N}_.\-+]{1,60}$/u
function carryFrom(read: (name: string) => unknown): [string, string][] {
  const out: [string, string][] = []
  for (const name of CARRIED) {
    const value = read(name)
    if (typeof value === 'string' && CARRY_VALUE.test(value)) out.push([name, value])
  }
  return out
}
const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

const META: PageMeta = {
  title: `S. r. o. za 1 € | ${BRAND.name}`,
  description: 'Založíme Vám s. r. o. cez advokáta za 1 €. Súdny poplatok aj odmenu advokáta platíme my, účtovníctvo vedieme od prvého dňa.',
  path: '/zalozenie',
  noindex: true,
  ctaHref: '/zalozenie',
}

function page(c: Ctx, meta: PageMeta, node: unknown, status: ContentfulStatusCode = 200) {
  c.header('Cache-Control', 'no-store')
  c.header('Referrer-Policy', 'no-referrer')
  return c.html(html`<!doctype html>${(<Layout meta={meta} live mony={Boolean(c.env.ANTHROPIC_API_KEY)}>{node as never}</Layout>)}`, status)
}

/**
 * Applications open only while the lawyer's and the insurer's approval of today's contracts holds (contracts.ts) and
 * europio has its account for payments set up (the contract names it, billing-store.ts).
 */
const isOpen = async (c: Ctx) => Boolean(approvedRelease(c.env.CONTRACT_RELEASE, await contractCatalogueHash())) && Boolean((await operatorOf(c.env.DB))?.invoiceIban)

const missing = (c: Ctx) => page(c, { ...META, title: `Stránka neexistuje | ${BRAND.name}` }, <NotFound />, 404)

foundingRoutes.get('/', async (c) => {
  const values: LandingValues = { email: '', phone: '', plan: text(c.req.query('balik'), 10) }
  const carry = carryFrom((name) => c.req.query(name))
  return page(c, META, <FoundingLanding values={values} errors={{}} places={await placesLeft(c.env.DB, today())} open={await isOpen(c)} carry={carry} />)
})

foundingRoutes.post('/', async (c) => {
  const body = await c.req.parseBody()
  // A field nobody sees, which only a machine fills in: answered as if it had worked.
  if (text(body.web, 200) !== '') return c.redirect('/zalozenie/odoslane', 303)
  if (!(await isOpen(c))) return c.redirect('/zalozenie', 303)
  const values: LandingValues = { email: text(body.email, 200), phone: text(body.phone, 30), plan: text(body.plan, 10) }
  const carry = carryFrom((name) => body[name])
  const errors: Partial<Record<'email' | 'phone' | 'form', string>> = {}
  if (!EMAIL.test(values.email)) errors.email = 'Napíšte e-mail v tvare meno@domena.sk.'
  if (values.phone && !PHONE.test(values.phone)) errors.phone = 'Napíšte telefón v tvare +421 900 000 000.'
  const db = c.env.DB
  const places = await placesLeft(db, today())
  if (Object.keys(errors).length > 0) return page(c, META, <FoundingLanding values={values} errors={errors} places={places} open carry={carry} />, 422)
  if (!(await withinLimit(db, 'founding', connection(c), LIMITS.requestsPerHour, 3600)))
    return page(c, META, <FoundingLanding values={values} errors={{ form: `Z tohto pripojenia prišlo veľa žiadostí. Skúste to o hodinu alebo nám napíšte na ${BRAND.email}.` }} places={places} open carry={carry} />, 429)
  // At most a few links a day to one address: a stranger cannot flood somebody's inbox through our form. The page says
  // the same either way, so it does not tell whether an address has an application.
  if (await withinLimit(db, 'founding-mail', values.email.toLowerCase(), 3, 86400)) {
    await applyFor(db, { email: values.email, phone: values.phone || null, plan: values.plan, source: Object.fromEntries(carry) }, siteOrigin(c))
    later(c, flushOutbox(db, c.env.EMAIL))
  }
  return c.redirect('/zalozenie/odoslane', 303)
})

foundingRoutes.get('/odoslane', (c) => page(c, { ...META, title: `Skontrolujte e-mail | ${BRAND.name}` }, <FoundingSent />))

foundingRoutes.get('/zmluva', (c) => page(c, { ...META, title: `Zmluva o založení | ${BRAND.name}`, path: '/zalozenie/zmluva' }, <FoundingContractPreview />))

/** The application of the link in the address, its payment looked at again; null answers as no page. */
async function load(c: Ctx) {
  const token = c.req.param('token') ?? ''
  const f = await foundingByToken(c.env, token)
  return f ? { f: editable(f) || f.status === 'verifying' ? await notePayment(c.env.DB, f) : f, token } : null
}

async function show(c: Ctx, token: string, opts: { values?: Record<string, string>; errors?: FoundingErrors; editing?: boolean; error?: string; status?: ContentfulStatusCode } = {}) {
  const f = await foundingByToken(c.env, token)
  if (!f) return missing(c)
  const editing = opts.editing ?? c.req.query('upravit') === '1'
  const [pay, events] = await Promise.all([paymentTarget(c.env.DB, f), eventsOf(c.env.DB, f.id)])
  return page(
    c,
    { ...META, title: `Prihláška na založenie s. r. o. | ${BRAND.name}`, path: '/zalozenie' },
    <FoundingPage
      f={f}
      token={token}
      values={opts.values ?? valuesOf(f)}
      errors={opts.errors ?? {}}
      editing={editing}
      pay={pay}
      events={events}
      flash={opts.error ? null : (c.req.query('ok') ?? null)}
      today={today()}
      error={opts.error ?? null}
    />,
    opts.status ?? 200,
  )
}

foundingRoutes.get('/:token', async (c) => {
  const loaded = await load(c)
  return loaded ? show(c, loaded.token) : missing(c)
})

foundingRoutes.post('/:token/udaje', async (c) => {
  const loaded = await load(c)
  if (!loaded) return missing(c)
  const { f, token } = loaded
  if (!editable(f)) return show(c, token, { error: 'Prihláška je už odovzdaná, údaje sa meniť nedajú.', status: 409 })
  const body = await c.req.parseBody()
  const values = valuesFrom(body)
  const checked = checkFounding(values, today())
  if (!('founder' in checked)) return show(c, token, { values: { ...values, rc: '', cislo: '' }, errors: checked.errors, editing: true, error: 'Skontrolujte, prosím, označené polia.', status: 422 })
  const phone = values.telefon ? values.telefon : null
  if (!(await saveData(c.env.DB, f, checked.founder, checked.company, phone))) return show(c, token, { error: 'Prihláška sa medzitým zmenila. Skúste to, prosím, znova.', status: 409 })
  return c.redirect(`/zalozenie/${token}?ok=udaje#doklad`, 303)
})

const FILE_ERRORS = {
  type: 'Tento súbor nevieme prijať. Nahrajte fotku (JPEG, PNG, WebP) alebo PDF.',
  size: 'Súbor je príliš veľký.',
  state: 'Prihláška sa medzitým zmenila. Skúste to, prosím, znova.',
  storage: 'Súbory teraz nevieme uložiť. Skúste to o chvíľu.',
  contract: 'Najprv si stiahnite zmluvu s Vašimi aktuálnymi údajmi a podpíšte ju.',
} as const

foundingRoutes.post('/:token/doklad', async (c) => {
  const loaded = await load(c)
  if (!loaded) return missing(c)
  const { token } = loaded
  const body = await c.req.parseBody()
  const sides = ([['front', body.predna], ['back', body.zadna]] as const).filter(([, file]) => file instanceof File && file.size > 0) as ['front' | 'back', File][]
  if (sides.length === 0) return show(c, token, { error: 'Vyberte fotku dokladu.', status: 422 })
  for (const [side, file] of sides) {
    if (file.size > ID_BYTES) return show(c, token, { error: FILE_ERRORS.size, status: 413 })
    // Each side is written from the application as it is now: the first side moved its revision.
    const f = await foundingByToken(c.env, token)
    if (!f) return missing(c)
    const result = await saveIdSide(c.env, f, side, new Uint8Array(await file.arrayBuffer()))
    if (result !== 'saved') return show(c, token, { error: FILE_ERRORS[result], status: result === 'state' ? 409 : 422 })
  }
  return c.redirect(`/zalozenie/${token}?ok=doklad#zmluva`, 303)
})

foundingRoutes.get('/:token/zmluva.pdf', async (c) => {
  const loaded = await load(c)
  if (!loaded) return missing(c)
  const contract = await fixContract(c.env.DB, loaded.f)
  if (!contract) return show(c, loaded.token, { error: loaded.f.founder ? `Zmluvu teraz nevieme pripraviť. Skúste to o chvíľu alebo nám napíšte na ${BRAND.email}.` : 'Zmluvu pripravíme, keď uložíte svoje údaje.', status: 409 })
  return c.body(foundingContractPdf(contract.text, contract.hash, loaded.f.vs), 200, {
    'Content-Type': 'application/pdf',
    'Content-Disposition': `attachment; filename="Firmony-zmluva-${loaded.f.vs}.pdf"`,
    'Cache-Control': 'private, no-store',
  })
})

foundingRoutes.post('/:token/podpis', async (c) => {
  const loaded = await load(c)
  if (!loaded) return missing(c)
  const { f, token } = loaded
  const body = await c.req.parseBody()
  const file = body.subor
  if (!(file instanceof File) || file.size === 0) return show(c, token, { error: 'Vyberte podpísaný súbor zmluvy.', status: 422 })
  if (file.size > SIGNED_BYTES) return show(c, token, { error: FILE_ERRORS.size, status: 413 })
  const kind = body.druh === 'paper' ? 'paper' : 'qes'
  const result = await saveSigned(c.env, f, kind, new Uint8Array(await file.arrayBuffer()))
  if (result !== 'saved')
    return show(c, token, { error: result === 'type' ? (kind === 'qes' ? 'Nahrajte podpísaný súbor .asice alebo podpísané PDF.' : 'Nahrajte sken ako PDF alebo fotku.') : FILE_ERRORS[result], status: result === 'state' ? 409 : 422 })
  return c.redirect(`/zalozenie/${token}?ok=podpis#platba`, 303)
})

foundingRoutes.post('/:token/odoslat', async (c) => {
  const loaded = await load(c)
  if (!loaded) return missing(c)
  const result = await handOver(c.env.DB, loaded.f, siteOrigin(c))
  if (result !== 'ok') return show(c, loaded.token, { error: result === 'steps' ? 'Najprv dokončite údaje, doklad a podpis zmluvy.' : FILE_ERRORS.state, status: 409 })
  later(c, flushOutbox(c.env.DB, c.env.EMAIL))
  return c.redirect(`/zalozenie/${loaded.token}?ok=odoslane`, 303)
})

foundingRoutes.post('/:token/zrusit', async (c) => {
  const loaded = await load(c)
  if (!loaded) return missing(c)
  if (!(await withdrawOpen(c.env, loaded.f))) return show(c, loaded.token, { error: `Prihlášku už nemôžete zrušiť sami. Napíšte nám na ${BRAND.email}.`, status: 409 })
  return c.redirect(`/zalozenie/${loaded.token}`, 303)
})
