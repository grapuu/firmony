import { Hono, type Context } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { html } from 'hono/html'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import type { AppBindings } from '../app/routes'
import { sha256Hex, withinLimit } from '../db'
import { companiesOf, countMissing, unseenFromFirmony, type Company, type Who } from '../app/store'
import { fileHash } from '../app/read'
import { endingOf } from '../app/ending'
import { teamCompany, teamCounts } from '../team/store'
import { TeamShell } from '../views/team'
import { Shell } from '../views/inside'
import { FilingPage, FilingsPage, FilingQueuePage } from '../views/filings'
import { changeDelivery, currentPackage, eventsOf, filingQueue, packageOf, packagesOf, type DeliveryChange } from './store'
import { isDeliveryState } from './model'

type Env = { Bindings: AppBindings; Variables: { who: Who; filingCompany: Company } }
type Ctx = Context<Env>
export const filingRoutes = new Hono<Env>(), clientFilingRoutes = new Hono<Env>(), filingQueueRoutes = new Hono<Env>()
const today = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Bratislava' }).format(new Date())
const text = (v: unknown, n: number) => typeof v === 'string' ? v.trim().slice(0, n) : ''
filingQueueRoutes.get('/', async (c) => {
  const who = c.get('who'), page = Math.min(10000, Math.max(1, Number.parseInt(c.req.query('strana') ?? '1', 10) || 1))
  const [rows, counts, companies] = await Promise.all([filingQueue(c.env.DB, who.user, page), teamCounts(c.env.DB, who.user, false), companiesOf(c.env.DB, who.user.id)])
  return c.html(html`<!doctype html>${<TeamShell user={who.user} place="deadlines" counts={counts} ownCompany={companies.length > 0} title="Podania na dokončenie"><FilingQueuePage rows={rows.slice(0, 50)} page={page} hasNext={rows.length > 50} /></TeamShell>}`)
})
async function frame(c: Ctx, node: unknown, status: ContentfulStatusCode = 200) {
  const who = c.get('who'), company = c.get('filingCompany'), team = new URL(c.req.url).pathname.startsWith('/ucto/')
  const companies = await companiesOf(c.env.DB, who.user.id)
  if (team) return c.html(html`<!doctype html>${<TeamShell user={who.user} place="deadlines" counts={await teamCounts(c.env.DB, who.user, false)} ownCompany={companies.length > 0} title="Podania">{node as never}</TeamShell>}`, status)
  return c.html(html`<!doctype html>${<Shell who={{ ...who, company }} place="taxes" missing={await countMissing(c.env.DB, company.id)} unread={await unseenFromFirmony(c.env.DB, company.id)} companies={companies} title="Podania" ending={endingOf(company, today())}>{node as never}</Shell>}`, status)
}
function base(c: Ctx) { return new URL(c.req.url).pathname.startsWith('/ucto/') ? `/ucto/klienti/${c.get('filingCompany').id}/podania` : '/app/podania' }
async function list(c: Ctx) {
  const company = c.get('filingCompany'), db = c.env.DB, period = c.req.query('obdobie') ?? ''
  const page = Math.min(10000, Math.max(1, Number.parseInt(c.req.query('strana') ?? '1', 10) || 1))
  const packages = await packagesOf(db, company.id, period, page)
  const legacy = await db.prepare(`SELECT 1 FROM vat_returns WHERE company_id = ?1 AND delivery IS NULL
    UNION ALL SELECT 1 FROM filings WHERE company_id = ?1 AND (kind <> 'sv' OR data IS NULL OR data NOT LIKE '%attemptId%')
    UNION ALL SELECT 1 FROM closings WHERE company_id = ?1 AND filed_at IS NOT NULL AND (filed IS NULL OR filed NOT LIKE '%attemptId%') LIMIT 1`).bind(company.id).first()
  return frame(c, <FilingsPage company={company} packages={packages.slice(0, 50).map((p) => ({ ...p, current: Boolean(p.current) }))} base={base(c)} period={period} page={page} hasNext={packages.length > 50} legacy={Boolean(legacy)} payrollHref={base(c).startsWith('/ucto') ? `/ucto/klienti/${company.id}/mzdove-podania` : c.get('who').role === 'owner' ? '/app/mzdove-podania' : undefined} />)
}
async function detail(c: Ctx, error?: string, values?: Record<string, string>, status: ContentfulStatusCode = 200) {
  const db = c.env.DB, company = c.get('filingCompany'), pkg = await packageOf(db, company.id, c.req.param('package') ?? '')
  if (!pkg) return c.notFound()
  const frozen = Boolean(await db.prepare('SELECT 1 FROM companies WHERE id = ? AND purge_started_at IS NOT NULL').bind(company.id).first())
  return frame(c, <FilingPage company={company} pkg={pkg} events={await eventsOf(db, company.id, pkg.id)} current={await currentPackage(db, pkg)} frozen={frozen} base={base(c)} user={base(c).startsWith('/ucto') ? c.get('who').user : undefined} today={today()} error={error} values={values} />, status)
}
async function document(c: Ctx) {
  const pkg = await packageOf(c.env.DB, c.get('filingCompany').id, c.req.param('package') ?? '')
  if (!pkg) return c.notFound()
  if (await sha256Hex(pkg.xml) !== pkg.sha256) return c.text('Uložený dokument sa nezhoduje s kontrolným odtlačkom. Obráťte sa na účtovný tím.', 409)
  return new Response(pkg.xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Content-Disposition': `attachment; filename="podanie-${pkg.id}.xml"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } })
}
async function receipt(c: Ctx) {
  const company = c.get('filingCompany'), pkg = await packageOf(c.env.DB, company.id, c.req.param('package') ?? '')
  const event = pkg ? (await eventsOf(c.env.DB, company.id, pkg.id)).find((e) => e.id === c.req.param('event')) : null
  if (!event?.file_key?.startsWith(`companies/${company.id}/filings/`)) return c.notFound()
  const file = await c.env.FILES?.get(event.file_key)
  if (!file) return c.text('Potvrdenka nie je dostupná. Obráťte sa na účtovný tím.', 409)
  const bytes = new Uint8Array(await file.arrayBuffer())
  if (bytes.length !== event.file_bytes || await fileHash(bytes) !== event.file_sha256) return c.text('Potvrdenka sa nezhoduje s uloženým kontrolným odtlačkom.', 409)
  return new Response(bytes, { headers: { 'Content-Type': event.file_type ?? 'application/octet-stream', 'Content-Disposition': `attachment; filename="potvrdenka-${event.id}.${event.file_key.split('.').pop()}"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } })
}
filingRoutes.use('*', async (c, next) => {
  const company = await teamCompany(c.env.DB, c.get('who').user, c.req.param('companyId') ?? '')
  if (!company) return c.notFound()
  c.set('filingCompany', company); await next()
})
clientFilingRoutes.use('*', async (c, next) => {
  const company = c.get('who').company
  if (!company) return c.notFound()
  c.set('filingCompany', company); await next()
})
for (const routes of [filingRoutes, clientFilingRoutes]) {
  routes.get('/', list); routes.get('/:package', (c) => detail(c)); routes.get('/:package/dokument.xml', document); routes.get('/:package/potvrdenka/:event', receipt)
}
filingRoutes.post('/:package/stav', bodyLimit({ maxSize: 10 * 1024 * 1024 + 128 * 1024, onError: (c) => detail(c as Ctx, 'Potvrdenka môže mať najviac 10 MB.', undefined, 413) }), async (c) => {
  const db = c.env.DB, who = c.get('who'), pkg = await packageOf(db, c.get('filingCompany').id, c.req.param('package'))
  if (!pkg) return c.notFound()
  if (Number(c.req.header('content-length')) > 10 * 1024 * 1024 + 128 * 1024) return detail(c, 'Potvrdenka môže mať najviac 10 MB.', undefined, 413)
  if (!await withinLimit(db, 'filing-state', who.user.id, 60, 3600)) return detail(c, 'Príliš veľa zmien. Skúste to neskôr.', undefined, 429)
  const body = await c.req.parseBody(), to = text(body.to, 30)
  const values = { to, externalOn: text(body.externalOn, 20), reference: text(body.reference, 161), reason: text(body.reason, 1201), channel: text(body.channel, 121), checked: body.checked === '1' ? '1' : '' }
  if (!isDeliveryState(to) || typeof body.revision !== 'string' || !/^\d+$/.test(body.revision)) return detail(c, 'Skontrolujte požadovanú zmenu a obnovte stránku.', values, 422)
  const attachment = body.receipt instanceof File && body.receipt.size > 0 ? body.receipt : null
  const input: DeliveryChange = { ...values, to, checked: values.checked === '1', revision: Number(body.revision), ...(attachment ? { receipt: { name: attachment.name, bytes: new Uint8Array(await attachment.arrayBuffer()) } } : {}) }
  const result = await changeDelivery(db, c.env.FILES, pkg, who.user, input, today())
  return result.ok ? c.redirect(`${base(c)}/${pkg.id}`, 303) : detail(c, result.error, values, 409)
})
