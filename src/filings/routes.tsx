import { Hono, type Context } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { html } from 'hono/html'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import type { AppBindings } from '../app/routes'
import { now, sha256Hex, withinLimit } from '../db'
import { companiesOf, countMissing, unseenFromFirmony, type Company, type Who } from '../app/store'
import { fileHash } from '../app/read'
import { endingOf } from '../app/ending'
import { teamCompany, teamCounts } from '../team/store'
import { TeamShell } from '../views/team'
import { Shell } from '../views/inside'
import { FilingPage, FilingsPage, FilingQueuePage } from '../views/filings'
import { changeDelivery, currentPackage, eventsOf, filingQueue, packageOf, packagesOf, type DeliveryChange } from './store'
import { isDeliveryState } from './model'
import { BUNDLE_ROWS, bundleItems, bundleZip, recordBundle, type BundleRow } from './bundle'
import { EXTRA_ROWS, bundleExtras, extraFiles, isExtraKey, recordExtras, type ExtraTick } from './extras'
import { siteOrigin } from '../http'

type Env = { Bindings: AppBindings; Variables: { who: Who; filingCompany: Company } }
type Ctx = Context<Env>
export const filingRoutes = new Hono<Env>(), clientFilingRoutes = new Hono<Env>(), filingQueueRoutes = new Hono<Env>()
const today = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Bratislava' }).format(new Date())
const text = (v: unknown, n: number) => typeof v === 'string' ? v.trim().slice(0, n) : ''
async function queue(c: Ctx, bundleState: { errors?: Record<string, string>; values?: Record<string, string>; recorded?: number } = {}, status: ContentfulStatusCode = 200) {
  const who = c.get('who'), page = Math.min(10000, Math.max(1, Number.parseInt(c.req.query('strana') ?? '1', 10) || 1))
  const [rows, counts, companies, bundle, extras] = await Promise.all([filingQueue(c.env.DB, who.user, page), teamCounts(c.env.DB, who.user, false), companiesOf(c.env.DB, who.user.id), bundleItems(c.env.DB, who.user), bundleExtras(c.env.DB, who.user, today())])
  const recorded = bundleState.recorded ?? (Number.parseInt(c.req.query('zaevidovane') ?? '', 10) || 0)
  return c.html(html`<!doctype html>${<TeamShell user={who.user} place="deadlines" counts={counts} ownCompany={companies.length > 0} title="Podania na dokončenie"><FilingQueuePage rows={rows.slice(0, 50)} page={page} hasNext={rows.length > 50} bundle={{ ...bundle, extras, today: today(), recorded, errors: bundleState.errors ?? {}, values: bundleState.values ?? {} }} /></TeamShell>}`, status)
}
filingQueueRoutes.get('/', (c) => queue(c))
// Everything to be sent, in one ZIP: the documents as saved with their podklady, sorted by the office they go to.
filingQueueRoutes.get('/balik.zip', async (c) => {
  const user = c.get('who').user
  const [{ toSend }, extras] = await Promise.all([bundleItems(c.env.DB, user), bundleExtras(c.env.DB, user, today())])
  if (toSend.length === 0 && extras.length === 0) return c.redirect('/ucto/podania', 303)
  return new Response(bundleZip(toSend, c.env.FILES, now(), extraFiles(extras, today())), {
    headers: { 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="firmony-na-podanie-${today()}.zip"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' },
  })
})
// What she did on the portals, recorded in one form: the number of each submission and, when she has it, its receipt.
filingQueueRoutes.post('/naraz', bodyLimit({ maxSize: 64 * 1024 * 1024, onError: (c) => queue(c as Ctx, { errors: { form: 'Potvrdenky spolu môžu mať najviac 64 MB. Priložte ich po častiach.' } }, 413) }), async (c) => {
  const db = c.env.DB, who = c.get('who')
  if (!(await withinLimit(db, 'filing-batch', who.user.id, 30, 3600))) return queue(c, { errors: { form: 'Príliš veľa záznamov za hodinu. Skúste to neskôr.' } }, 429)
  const body = await c.req.parseBody({ all: true })
  const keys = (Array.isArray(body.row) ? body.row : [body.row]).filter((k): k is string => typeof k === 'string' && /^[fm]-[A-Za-z0-9-]{1,64}$/.test(k)).slice(0, 2 * BUNDLE_ROWS)
  const externalOn = text(body.externalOn, 20)
  const values: Record<string, string> = { externalOn }
  const rows: BundleRow[] = []
  for (const key of keys) {
    const file = body[`receipt:${key}`]
    const row: BundleRow = {
      key,
      reference: text(body[`ref:${key}`], 161),
      reason: text(body[`reason:${key}`], 1201),
      checked: body[`ok:${key}`] === '1',
      receipt: file instanceof File && file.size > 0 ? { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) } : null,
    }
    values[`ref:${key}`] = row.reference
    values[`reason:${key}`] = row.reason
    if (row.checked) values[`ok:${key}`] = '1'
    rows.push(row)
  }
  // The returns of OSS and reports of Intrastat ticked as sent, each with the fingerprint of what was downloaded.
  const ticks: ExtraTick[] = (Array.isArray(body.extra) ? body.extra : [body.extra])
    .filter((k): k is string => typeof k === 'string' && isExtraKey(k))
    .slice(0, 2 * EXTRA_ROWS)
    .filter((key) => body[`sent:${key}`] === '1')
    .map((key) => ({ key, sig: text(body[`sig:${key}`], 64) }))
  const outcome = await recordBundle(db, c.env.FILES, who.user, rows, externalOn, today())
  const extra = await recordExtras(db, who.user, ticks, /^\d{4}-\d{2}-\d{2}$/.test(externalOn) ? externalOn : null, today(), siteOrigin(c))
  const errors = { ...outcome.errors, ...extra.errors }
  for (const key of Object.keys(extra.errors)) values[`sent:${key}`] = '1'
  const recorded = outcome.recorded + extra.recorded
  if (Object.keys(errors).length > 0) return queue(c, { errors, values, recorded }, 409)
  return c.redirect(`/ucto/podania?zaevidovane=${recorded}`, 303)
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
