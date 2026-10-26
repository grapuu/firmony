import { Hono, type Context } from 'hono'
import { html } from 'hono/html'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import type { AppBindings } from '../app/routes'
import { companiesOf, type Who } from '../app/store'
import { teamCounts } from '../team/store'
import { TeamShell } from '../views/team'
import { IncidentPage, IncidentsPage } from '../views/incidents'
import { addDays } from '../app/ending'
import { approveRelease, assignIncident, closeIncident, getIncident, incidentsOf, openIncident, requestRelease, reviewHold } from './store'

type Env = { Bindings: AppBindings; Variables: { who: Who } }
type Ctx = Context<Env>
export const incidentRoutes = new Hono<Env>()
const today = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Bratislava' }).format(new Date())
const text = (v: unknown, n = 240) => (typeof v === 'string' ? v.trim().slice(0, n) : '')
const validReview = (v: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) &&
  new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v &&
  v >= today() &&
  v <= addDays(today(), 30)
async function shell(c: Ctx, node: unknown, status: ContentfulStatusCode = 200) {
  const who = c.get('who')
  const [counts, companies] = await Promise.all([teamCounts(c.env.DB, who.user, false), companiesOf(c.env.DB, who.user.id)])
  return c.html(
    html`<!doctype html>${(
        <TeamShell user={who.user} place="incidents" counts={counts} ownCompany={companies.length > 0} title="Incidenty">
          {node as never}
        </TeamShell>
      )}`,
    status,
  )
}
async function list(c: Ctx, error?: string, status: ContentfulStatusCode = 200) {
  const who = c.get('who'),
    db = c.env.DB
  const companies = await db
    .prepare("SELECT id, name FROM companies WHERE demo = 0 AND invoicing_only = 0 AND (?1 = 'admin' OR accountant_id = ?2) ORDER BY name LIMIT 500")
    .bind(who.user.team, who.user.id)
    .all<{ id: string; name: string }>()
  const people = await db.prepare('SELECT id, name FROM users WHERE team IS NOT NULL ORDER BY name').all<{ id: string; name: string }>()
  return shell(
    c,
    <IncidentsPage
      incidents={await incidentsOf(db, who.user)}
      companies={companies.results}
      people={people.results}
      user={who.user.id}
      today={today()}
      error={error}
    />,
    status,
  )
}
async function detail(c: Ctx, error?: string, status: ContentfulStatusCode = 200) {
  const who = c.get('who'),
    i = await getIncident(c.env.DB, who.user, c.req.param('id') ?? '')
  if (!i) return c.text('Not found', 404)
  const events = await c.env.DB.prepare(
    `SELECT e.action, e.at, e.user_id, e.detail, COALESCE(u.name, 'Neaktívny účet') AS user_name FROM incident_events e LEFT JOIN users u ON u.id = e.user_id WHERE e.incident_id = ? ORDER BY e.id DESC LIMIT 200`,
  )
    .bind(i.id)
    .all<{
      action: string
      at: number
      user_id: string
      detail: string
      user_name: string
    }>()
  const people = await c.env.DB.prepare('SELECT id, name FROM users WHERE team IS NOT NULL ORDER BY name').all<{ id: string; name: string }>()
  return shell(c, <IncidentPage people={people.results} incident={i} admin={who.user.team === 'admin'} events={events.results} error={error} />, status)
}
incidentRoutes.get('/', (c) => list(c))
incidentRoutes.get('/:id', (c) => detail(c))
incidentRoutes.post('/', async (c) => {
  const who = c.get('who'),
    body = await c.req.parseBody()
  const company = text(body.company, 64),
    title = text(body.title),
    evidence = text(body.evidence),
    reviewOn = text(body.review, 10),
    owner = text(body.owner, 64),
    backup = text(body.backup, 64)
  const severity = ['normal', 'high', 'critical'].includes(text(body.severity)) ? text(body.severity) : ''
  if (!company || title.length < 8 || evidence.length < 12 || !validReview(reviewOn) || !owner || backup === owner || !severity)
    return list(c, 'Vyplňte firmu, opis, referenciu podkladov, vlastníka a kontrolu najneskôr o 30 dní. Zástupca musí byť iná osoba.', 422)
  const id = await openIncident(c.env.DB, who.user, {
    company,
    title,
    evidence,
    reviewOn,
    owner,
    backup: backup || null,
    severity,
  })
  return id ? c.redirect(`/ucto/incidenty/${id}`, 303) : c.text('Not found', 404)
})
incidentRoutes.post('/:id/kontrola', async (c) => {
  const who = c.get('who'),
    id = c.req.param('id'),
    body = await c.req.parseBody()
  if (!(await getIncident(c.env.DB, who.user, id))) return c.text('Not found', 404)
  const review = text(body.review, 10),
    reference = text(body.reference)
  if (!validReview(review) || reference.length < 12) return detail(c, 'Uveďte referenciu a platný deň kontroly najneskôr o 30 dní.', 422)
  if (!(await reviewHold(c.env.DB, who.user, id, review, reference))) return detail(c, 'Uchovanie už nie je aktívne.', 409)
  return c.redirect(`/ucto/incidenty/${id}`, 303)
})
incidentRoutes.post('/:id/priradit', async (c) => {
  const who = c.get('who'),
    id = c.req.param('id')
  if (who.user.team !== 'admin' || !(await getIncident(c.env.DB, who.user, id))) return c.text('Not found', 404)
  const body = await c.req.parseBody(),
    owner = text(body.owner, 64),
    backup = text(body.backup, 64),
    version = Number(body.version)
  if (!owner || owner === backup || !Number.isSafeInteger(version) || version < 0) return detail(c, 'Skontrolujte vlastníka a zástupcu.', 422)
  if (!(await assignIncident(c.env.DB, who.user, id, owner, backup || null, version)))
    return detail(c, 'Prípad sa zmenil alebo osoby nie sú aktívnymi členmi tímu.', 409)
  return c.redirect(`/ucto/incidenty/${id}`, 303)
})
for (const action of ['uvolnit', 'schvalit-uvolnenie', 'uzavriet'] as const)
  incidentRoutes.post(`/:id/${action}`, async (c) => {
    const who = c.get('who'),
      id = c.req.param('id') ?? ''
    if (who.user.team !== 'admin' || !(await getIncident(c.env.DB, who.user, id))) return c.text('Not found', 404)
    const body = await c.req.parseBody(),
      reference = text(body.reference)
    if (action !== 'schvalit-uvolnenie' && reference.length < 12) return detail(c, 'Uveďte referenciu odborného posúdenia.', 422)
    const ok =
      action === 'uvolnit'
        ? await requestRelease(c.env.DB, who.user, id, reference)
        : action === 'schvalit-uvolnenie'
          ? await approveRelease(c.env.DB, who.user, id)
          : await closeIncident(c.env.DB, who.user, id, reference)
    return ok
      ? c.redirect(`/ucto/incidenty/${id}`, 303)
      : detail(c, 'Podmienky zmeny nie sú splnené. Uvoľnenie schvaľuje druhý správca; otvorený prípad s aktívnym uchovaním nemožno uzavrieť.', 409)
  })
