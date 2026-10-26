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

const WorkspacesPage: FC<{ list: Workspace[]; q?: string; flash?: string | null }> = ({ list, q = '', flash = null }) => (
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
    return shell(c, 'Fakturačné účty', <WorkspacesPage list={await workspaces(c.env.DB, q)} q={q} flash={ok === 'zablokovany' ? 'Účet je zablokovaný.' : ok === 'odblokovany' ? 'Účet je znova otvorený.' : null} />)
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
