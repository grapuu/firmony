// The workspaces of invoicing alone, for the administrator (26 October 2026, the review of free invoicing): who signed
// up, how much each issues, and the switch that stops one that is misused (the terms of use, point 4.2). The team sees
// no invoice, customer or line of a workspace here: only what tells use from misuse. A stopped workspace opens nothing
// in the app, and its customers' links answer as if they never existed; its data stay as evidence until it is lifted.
import type { Context, Hono } from 'hono'
import type { Child, FC } from 'hono/jsx'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { now } from '../db'
import { formatEurExact } from '../format'
import { dayName } from '../app/copy'
import { eventStatement, type User } from '../app/store'
import { Flash, Heading } from '../views/inside'
import { providerOf } from '../peppol/provider'
import { bindByAdmin, bindingsList, deliverUnrouted, resolveUnrouted, unbindByAdmin, unroutedOne, unroutedOpen, type Unrouted } from '../peppol/store'

type Shell = (c: Context, title: string, child: Child, status?: ContentfulStatusCode) => Promise<Response> | Response

interface Workspace {
  id: string
  name: string
  ico: string | null
  createdAt: number
  closedAt: number | null
  owner: string | null
  issued: number
  issued30: number
  totalCents: number
}

const ID = /^[0-9a-f-]{36}$/
/** A company's id as a form carries it: checked again against the companies of the registration's DIČ. */
const COMPANY_ID = /^[A-Za-z0-9-]{1,64}$/

const FLASH: Record<string, string> = {
  zablokovany: 'Účet je zablokovaný.',
  odblokovany: 'Účet je znova otvorený.',
  pripojena: 'Firma je pripojená. E-faktúry posiela aj prijíma cez Firmony.',
  obsadena: 'Účastník alebo firma je už pripojená inak. Najprv odpojte nesprávne pripojenie.',
  vybavene: 'Označené ako vybavené.',
  dorucena: 'E-faktúra je doručená firme.',
  nikomu: 'E-faktúru teraz nemá komu doručiť: účastník nie je pripojený k otvorenej firme.',
  odpojena: 'Firma je odpojená. E-faktúry cez Firmony už neposiela ani neprijíma.',
}

/**
 * The workspaces, the newest first; with a search, those whose name, IČO or owner's e-mail holds it, or whose invoice a
 * customer's link (/f/...) names: what a report of misuse brings.
 */
async function workspaces(db: D1Database, q = ''): Promise<Workspace[]> {
  const token = /\/f\/([A-Za-z0-9_-]{16,})/.exec(q)?.[1] ?? (/^[A-Za-z0-9_-]{20,}$/.test(q) ? q : null)
  const text = q.replace(/[%_\\]/g, '').trim().toLowerCase().slice(0, 80)
  const filter = !q
    ? ''
    : token
      ? 'AND c.id IN (SELECT company_id FROM invoices WHERE token = ?2)'
      : `AND (lower(c.name) LIKE ?2 OR c.ico = ?3 OR EXISTS (SELECT 1 FROM members m JOIN users u ON u.id = m.user_id WHERE m.company_id = c.id AND lower(u.email) LIKE ?2))`
  const binds: unknown[] = [now() - 30 * 86400]
  if (q) binds.push(token ?? `%${text}%`)
  if (q && !token) binds.push(text)
  const rows = await db
    .prepare(
      `SELECT c.id, c.name, c.ico, c.created_at, c.closed_at,
         (SELECT u.email FROM members m JOIN users u ON u.id = m.user_id WHERE m.company_id = c.id AND m.role = 'owner' ORDER BY m.created_at LIMIT 1) AS owner,
         (SELECT COUNT(*) FROM invoices i WHERE i.company_id = c.id AND i.status = 'issued') AS issued,
         (SELECT COUNT(*) FROM invoices i WHERE i.company_id = c.id AND i.status = 'issued' AND i.created_at >= ?1) AS issued30,
         (SELECT COALESCE(SUM(i.total_cents), 0) FROM invoices i WHERE i.company_id = c.id AND i.status = 'issued' AND i.kind = 'invoice' AND COALESCE(i.currency, 'EUR') = 'EUR') AS total
       FROM companies c WHERE c.invoicing_only = 1 ${filter} ORDER BY c.created_at DESC LIMIT 300`,
    )
    .bind(...binds)
    .all<Record<string, unknown>>()
  return rows.results.map((r) => ({
    id: String(r.id),
    name: String(r.name),
    ico: typeof r.ico === 'string' ? r.ico : null,
    createdAt: Number(r.created_at),
    closedAt: typeof r.closed_at === 'number' ? r.closed_at : null,
    owner: typeof r.owner === 'string' ? r.owner : null,
    issued: Number(r.issued ?? 0),
    issued30: Number(r.issued30 ?? 0),
    totalCents: Number(r.total ?? 0),
  }))
}

const day = (seconds: number) => new Date(seconds * 1000).toISOString().slice(0, 10)

const KIND: Record<Unrouted['kind'], string> = { received: 'Prijatá e-faktúra', registered: 'Prihlásenie do siete', event: 'Oznámenie poštára' }
const REASON: Record<Unrouted['reason'], string> = {
  unbound: 'Pre tohto účastníka nemáme pripojenú firmu. Keď ju pripojíte, e-faktúra jej príde sama.',
  unverified: 'Firma zvolila Firmony na portáli finančnej správy.',
  ambiguous: 'Toto DIČ má vo Firmony viac firiem. Pripojte len tú, ktorá Firmony naozaj zvolila.',
  unknown: 'Pri oznámení toto DIČ nemala žiadna firma vo Firmony.',
  conflict: 'Účastník alebo firma je už pripojená inak, alebo firma medzitým zmenila DIČ. Najprv odpojte nesprávne pripojenie.',
  ended: 'Firma je zablokovaná alebo jej zmluva skončila; e-faktúra prišla potom.',
  error: 'Oznámenie sa nepodarilo spracovať. Poštár ho pošle znova; ak sa to opakuje, napíšte vývoju.',
}

/** What every binding asks of the administrator before the click: it lets the company send and receive in its name. */
const VERIFY =
  'Pripojte firmu až po overení: jej DIČ sedí so zoznamom daňových subjektov finančnej správy a ten, kto účet vo Firmony používa, za firmu naozaj koná (overte to na kontakte z obchodného registra, nie z účtu).'

interface PeppolDesk {
  open: Unrouted[]
  total: number
  bindings: Awaited<ReturnType<typeof bindingsList>>
}

/** What the postman told us that waits for the administrator, and who sends and receives through us. */
const PeppolDeskView: FC<{ desk: PeppolDesk }> = ({ desk }) =>
  desk.open.length === 0 && desk.bindings.length === 0 ? null : (
    <section class="info" id="peppol" aria-labelledby="peppol-desk-t">
      <h2 id="peppol-desk-t" class="info__title">
        E-faktúry v sieti Peppol
      </h2>
      {desk.open.length === 0 ? (
        <p class="info__empty">Nič nečaká na vybavenie.</p>
      ) : (
        <>
        {desk.open.some((u) => u.candidates.length > 0) ? <p class="flag">{VERIFY}</p> : null}
        {desk.total > desk.open.length ? <p class="info__source">{`Zobrazených ${desk.open.length} najstarších z ${desk.total}.`}</p> : null}
        <ul class="rows">
          {desk.open.map((u) => (
            <li class="row customers__row">
              <div class="customers__who">
                <p class="row__title">{`${KIND[u.kind]}${u.participant ? ` · ${u.participant}` : ''}`}</p>
                <p class="row__sub">{[dayName(day(u.at)), u.company?.name ?? null].filter(Boolean).join(' · ')}</p>
                <p class="row__sub">{REASON[u.reason]}</p>
              </div>
              <div class="customers__action">
                {u.kind === 'registered'
                  ? u.candidates.map((c) => (
                      <form method="post" action={`/ucto/fakturacne-ucty/peppol/${u.id}/pripojit`}>
                        <input type="hidden" name="firma" value={c.id} />
                        <button class="btn btn--small btn--line" type="submit">
                          {`Pripojiť ${c.name} (${[c.workspace ? 'fakturačný účet' : 'klient', c.ico ? `IČO ${c.ico}` : null, c.owner].filter(Boolean).join(', ')})`}
                        </button>
                      </form>
                    ))
                  : null}
                {u.deliverTo ? (
                  <form method="post" action={`/ucto/fakturacne-ucty/peppol/${u.id}/dorucit`}>
                    <button class="btn btn--small btn--line" type="submit">
                      {`Doručiť firme ${u.deliverTo}`}
                    </button>
                  </form>
                ) : null}
                {u.fileKey ? (
                  <a class="btn btn--small btn--line" href={`/ucto/fakturacne-ucty/peppol/${u.id}/subor.xml`}>
                    Stiahnuť e-faktúru
                  </a>
                ) : null}
                <form method="post" action={`/ucto/fakturacne-ucty/peppol/${u.id}/vybavene`}>
                  <button class="btn btn--small btn--line" type="submit">
                    Vybavené
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
        </>
      )}
      {desk.bindings.length > 0 ? (
        <details class="peppol-desk__bound">
          <summary>{`Pripojené firmy (${desk.bindings.length})`}</summary>
          <ul class="rows">
            {desk.bindings.map((b) => (
              <li class="row customers__row">
                <div class="customers__who">
                  <p class="row__title">{b.name}</p>
                  <p class="row__sub">{[b.participant, b.workspace ? 'fakturačný účet' : 'klient', `od ${dayName(day(b.boundAt))}`].join(' · ')}</p>
                </div>
                <form method="post" action={`/ucto/fakturacne-ucty/peppol/odpojit/${b.company}`} class="customers__action">
                  <button class="btn btn--small btn--danger" type="submit">
                    Odpojiť
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  )

const WorkspacesPage: FC<{ list: Workspace[]; q?: string; flash?: string | null; desk?: PeppolDesk | null }> = ({ list, q = '', flash = null, desk = null }) => (
  <>
    <header class="phead">
      <Heading first="Fakturačné účty" small />
      <p class="phead__lead">Bezplatná fakturácia: kto sa zaregistroval a koľko vystavuje. Obsah faktúr tu nie je. Zneužívaný účet zablokujete; jeho odkazy pre odberateľov prestanú fungovať a údaje ostanú ako dôkaz.</p>
    </header>
    <form class="search workspaces__search" method="get" action="/ucto/fakturacne-ucty" role="search">
      <label class="sr" for="ws-q">
        Hľadať účet
      </label>
      <input id="ws-q" class="search__input" type="search" name="q" value={q} maxlength={200} placeholder="Meno, IČO, e-mail alebo odkaz na faktúru" autocomplete="off" />
      <button class="btn btn--line btn--small search__button" type="submit">
        Hľadať
      </button>
      {q ? (
        <a class="search__clear" href="/ucto/fakturacne-ucty">
          Zrušiť
        </a>
      ) : null}
    </form>
    <Flash text={flash} />
    {desk ? <PeppolDeskView desk={desk} /> : null}
    {list.length === 0 ? (
      <section class="info">
        <p class="info__empty">Zatiaľ žiadny fakturačný účet.</p>
      </section>
    ) : (
      <ul class="rows rows--card">
        {list.map((w) => (
          <li class="row customers__row">
            <div class="customers__who">
              <p class="row__title">{w.name}</p>
              <p class="row__sub">{[w.ico ? `IČO ${w.ico}` : null, w.owner, `od ${dayName(day(w.createdAt))}`, w.closedAt ? `zablokovaný ${dayName(day(w.closedAt))}` : null].filter(Boolean).join(' · ')}</p>
            </div>
            <dl class="customers__figures">
              <div>
                <dt>Faktúry</dt>
                <dd>{w.issued}</dd>
              </div>
              <div>
                <dt>Za 30 dní</dt>
                <dd>{w.issued30}</dd>
              </div>
              <div>
                <dt>Spolu v EUR</dt>
                <dd>{formatEurExact(w.totalCents)}</dd>
              </div>
            </dl>
            <form method="post" action={`/ucto/fakturacne-ucty/${w.id}/${w.closedAt ? 'odblokovat' : 'zablokovat'}`} class="customers__action">
              {w.closedAt ? null : <input class="field__input" name="dovod" placeholder="Dôvod (zostane v zázname)" maxlength={300} aria-label="Dôvod zablokovania" required />}
              <button class={`btn btn--small ${w.closedAt ? 'btn--line' : 'btn--danger'}`} type="submit">
                {w.closedAt ? 'Odblokovať' : 'Zablokovať'}
              </button>
            </form>
          </li>
        ))}
      </ul>
    )}
  </>
)

/** The administrator's page of workspaces and the switch; anybody else of the team finds nothing here. */
export function registerWorkspaceRoutes(routes: Hono<any>, shell: Shell, missing: (c: Context) => Promise<Response> | Response): void {
  const admin = (c: Context) => (c.get('who') as { user: User }).user.team === 'admin'
  routes.get('/fakturacne-ucty', async (c) => {
    if (!admin(c)) return missing(c)
    const ok = c.req.query('ok')
    const q = (c.req.query('q') ?? '').trim().slice(0, 200)
    const db = c.env.DB as D1Database
    const open = await unroutedOpen(db)
    const desk = { open: open.list, total: open.total, bindings: await bindingsList(db) }
    const flash = ok ? (FLASH[ok] ?? null) : null
    return shell(c, 'Fakturačné účty', <WorkspacesPage list={await workspaces(db, q)} q={q} flash={flash} desk={desk} />)
  })
  // The postman's notices the administrator settles (peppol/store.ts). Each is a sensitive action (security/policy.ts).
  routes.post('/fakturacne-ucty/peppol/:id/pripojit', async (c) => {
    if (!admin(c)) return missing(c)
    const id = c.req.param('id')
    const provider = providerOf(c.env)
    const body = await c.req.parseBody()
    const company = typeof body.firma === 'string' ? body.firma : ''
    if (!ID.test(id) || !COMPANY_ID.test(company) || !provider) return missing(c)
    const who = c.get('who') as { user: User }
    const outcome = await bindByAdmin(c.env, provider.name, id, company, who.user.id, (work) => c.executionCtx.waitUntil(work.catch(() => null)))
    if (outcome === 'gone' || outcome === 'mismatch') return missing(c)
    return c.redirect(`/ucto/fakturacne-ucty?ok=${outcome === 'bound' ? 'pripojena' : 'obsadena'}#peppol`, 303)
  })
  routes.post('/fakturacne-ucty/peppol/:id/dorucit', async (c) => {
    if (!admin(c)) return missing(c)
    const id = c.req.param('id')
    const who = c.get('who') as { user: User }
    if (!ID.test(id)) return missing(c)
    const outcome = await deliverUnrouted(c.env, id, who.user.id, (work) => c.executionCtx.waitUntil(work.catch(() => null)))
    if (outcome === 'gone') return missing(c)
    return c.redirect(`/ucto/fakturacne-ucty?ok=${outcome === 'delivered' ? 'dorucena' : 'nikomu'}#peppol`, 303)
  })
  routes.post('/fakturacne-ucty/peppol/:id/vybavene', async (c) => {
    if (!admin(c)) return missing(c)
    const id = c.req.param('id')
    const who = c.get('who') as { user: User }
    if (!ID.test(id) || !(await resolveUnrouted(c.env.DB, id, who.user.id))) return missing(c)
    return c.redirect('/ucto/fakturacne-ucty?ok=vybavene#peppol', 303)
  })
  routes.post('/fakturacne-ucty/peppol/odpojit/:company', async (c) => {
    if (!admin(c)) return missing(c)
    const company = c.req.param('company')
    const who = c.get('who') as { user: User }
    if (!COMPANY_ID.test(company) || !(await unbindByAdmin(c.env.DB, company, who.user.id))) return missing(c)
    return c.redirect('/ucto/fakturacne-ucty?ok=odpojena#peppol', 303)
  })
  routes.get('/fakturacne-ucty/peppol/:id/subor.xml', async (c) => {
    if (!admin(c)) return missing(c)
    const id = c.req.param('id')
    const row = ID.test(id) ? await unroutedOne(c.env.DB, id) : null
    const object = row?.fileKey && c.env.FILES ? await (c.env.FILES as R2Bucket).get(row.fileKey) : null
    if (!object) return missing(c)
    return new Response(object.body, {
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Content-Disposition': `attachment; filename="e-faktura-${id.slice(0, 8)}.xml"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  })
  for (const [path, close] of [['zablokovat', true], ['odblokovat', false]] as const) {
    routes.post(`/fakturacne-ucty/:id/${path}`, async (c) => {
      if (!admin(c)) return missing(c)
      const id = c.req.param('id')
      if (!ID.test(id)) return missing(c)
      const body = await c.req.parseBody()
      const reason = typeof body.dovod === 'string' ? body.dovod.replace(/\s+/g, ' ').trim().slice(0, 300) : ''
      if (close && reason.length < 5) return shell(c, 'Fakturačné účty', <WorkspacesPage list={await workspaces(c.env.DB)} flash="Napíšte dôvod zablokovania, zostane v zázname." />, 422)
      const db = c.env.DB as D1Database
      const who = c.get('who') as { user: User }
      const changed = await db.batch([
        close
          ? db.prepare('UPDATE companies SET closed_at = ?2 WHERE id = ?1 AND invoicing_only = 1 AND closed_at IS NULL').bind(id, now())
          : db.prepare('UPDATE companies SET closed_at = NULL WHERE id = ?1 AND invoicing_only = 1 AND closed_at IS NOT NULL').bind(id),
        // Its people are signed out of it at once.
        ...(close ? [db.prepare('DELETE FROM sessions WHERE company_id = ?1 AND EXISTS (SELECT 1 FROM companies WHERE id = ?1 AND invoicing_only = 1)').bind(id)] : []),
        eventStatement(db, { company: null, user: who.user.id, action: close ? 'invoicing.blocked' : 'invoicing.unblocked', subject: id, detail: close ? { reason } : null }),
      ])
      if (!changed[0]?.meta.changes) return missing(c)
      return c.redirect(`/ucto/fakturacne-ucty?ok=${close ? 'zablokovany' : 'odblokovany'}`, 303)
    })
  }
}
