import { Hono, type Context } from 'hono'
import { html } from 'hono/html'
import { bodyLimit } from 'hono/body-limit'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import type { AppBindings } from '../app/routes'
import { companiesOf, countMissing, unseenFromFirmony, type Company, type Who } from '../app/store'
import { endingOf } from '../app/ending'
import { fileHash } from '../app/read'
import { withinLimit } from '../db'
import { teamCompany, teamCounts } from '../team/store'
import { Shell } from '../views/inside'
import { TeamShell } from '../views/team'
import { PayrollReportsPage, PayrollReportPage } from '../views/payroll-reports'
import { isDeliveryState } from '../filings/model'
import { isMonth } from './model'
import { changeReportDelivery, closureOf, initializeClosedRun, recordPayout, reportEvents, reportHistory, reportItem, reportItems, reportPackage, runEvidence, saveReport, targetOf } from './store'

type Env = { Bindings: AppBindings; Variables: { who: Who; payrollCompany: Company } }
type Ctx = Context<Env>
export const payrollReportRoutes = new Hono<Env>(), clientPayrollReportRoutes = new Hono<Env>()
const today = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Bratislava' }).format(new Date())
const text = (v: unknown, n: number) => typeof v === 'string' ? v.trim().slice(0, n) : ''
const number = (v: unknown) => typeof v === 'string' && /^\d{1,12}$/.test(v) ? Number(v) : -1
const staff = (c: Ctx) => new URL(c.req.url).pathname.startsWith('/ucto/')
const base = (c: Ctx) => staff(c) ? `/ucto/klienti/${c.get('payrollCompany').id}/mzdove-podania` : '/app/mzdove-podania'
async function frozen(c: Ctx) { return Boolean(await c.env.DB.prepare('SELECT 1 FROM companies WHERE id = ? AND purge_started_at IS NOT NULL').bind(c.get('payrollCompany').id).first()) }
async function frame(c: Ctx, content: unknown, status: ContentfulStatusCode = 200) {
  const who = c.get('who'), co = c.get('payrollCompany'), companies = await companiesOf(c.env.DB, who.user.id)
  if (staff(c)) return c.html(html`<!doctype html>${<TeamShell user={who.user} place="deadlines" counts={await teamCounts(c.env.DB, who.user, false)} ownCompany={companies.length > 0} title="Mzdové podania">{content as never}</TeamShell>}`, status)
  return c.html(html`<!doctype html>${<Shell who={{ ...who, company: co }} place="taxes" companies={companies} missing={await countMissing(c.env.DB, co.id)} unread={await unseenFromFirmony(c.env.DB, co.id)} title="Mzdové podania" ending={endingOf(co, today())}>{content as never}</Shell>}`, status)
}
async function list(c: Ctx, error?: string, values?: Record<string, string>, status: ContentfulStatusCode = 200) {
  const company = c.get('payrollCompany'), period = values?.period ?? c.req.query('obdobie') ?? ''
  if (period && !isMonth(period)) return c.text('Neplatné mzdové obdobie.', 400)
  const page = Math.min(10000, Math.max(1, Number.parseInt(c.req.query('strana') ?? '1', 10) || 1))
  const [items, runs, locked] = await Promise.all([reportItems(c.env.DB, company.id, period, page), runEvidence(c.env.DB, company.id, period), frozen(c)])
  return frame(c, <PayrollReportsPage company={company} items={items.slice(0, 50)} runs={runs} base={base(c)} user={staff(c) ? c.get('who').user : undefined} today={today()} frozen={locked} period={period} page={page} hasNext={items.length > 50} error={error} values={values} />, status)
}
async function detail(c: Ctx, error?: string, values?: Record<string, string>, status: ContentfulStatusCode = 200) {
  const company = c.get('payrollCompany'), db = c.env.DB, item = await reportItem(db, company.id, c.req.param('target') ?? '')
  if (!item) return c.notFound()
  const pkgId = c.req.param('package') ?? item.package_id
  const selected = pkgId ? await reportPackage(db, company.id, pkgId) : null
  if (pkgId && (!selected || selected.target_id !== item.id)) return c.notFound()
  return frame(c, <PayrollReportPage company={company} target={item} item={item} selected={selected} packages={await reportHistory(db, company.id, item.id)} events={selected ? await reportEvents(db, company.id, selected.id) : []} base={base(c)} user={staff(c) ? c.get('who').user : undefined} frozen={await frozen(c)} today={today()} error={error} values={values} />, status)
}
async function download(c: Ctx, receipt: boolean) {
  const co = c.get('payrollCompany'), db = c.env.DB, pkg = await reportPackage(db, co.id, c.req.param('package') ?? '')
  if (!pkg || pkg.target_id !== c.req.param('target')) return c.notFound()
  const event = receipt ? (await reportEvents(db, co.id, pkg.id)).find((e) => e.id === c.req.param('event')) : null
  const key = receipt ? event?.file_key : pkg.file_key, hash = receipt ? event?.file_sha256 : pkg.sha256, size = receipt ? event?.file_bytes : pkg.file_bytes
  if (!key?.startsWith(`companies/${co.id}/filings/`)) return c.notFound()
  const file = await c.env.FILES?.get(key)
  if (!file) return c.text('Pôvodný súbor nie je dostupný. Obráťte sa na účtovný tím.', 409)
  const bytes = new Uint8Array(await file.arrayBuffer())
  if (bytes.length !== size || await fileHash(bytes) !== hash) return c.text('Pôvodný súbor sa nezhoduje s kontrolným odtlačkom. Obráťte sa na účtovný tím.', 409)
  return new Response(bytes, { headers: { 'Content-Type': receipt ? event?.file_type ?? 'application/octet-stream' : pkg.file_type, 'Content-Disposition': `attachment; filename="${receipt ? 'potvrdenka' : 'vykaz'}-${receipt ? event?.id : pkg.id}.${key.split('.').pop()}"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } })
}
payrollReportRoutes.use('*', async (c, next) => {
  const company = await teamCompany(c.env.DB, c.get('who').user, c.req.param('companyId') ?? '')
  if (!company) return c.notFound()
  c.set('payrollCompany', company); await next()
})
clientPayrollReportRoutes.use('*', async (c, next) => {
  const who = c.get('who')
  // The original report can contain employees' personal data. Ordinary invited members do not receive it.
  if (!who.company || who.role !== 'owner') return c.notFound()
  c.set('payrollCompany', who.company); await next()
})
for (const routes of [payrollReportRoutes, clientPayrollReportRoutes]) {
  routes.get('/', (c) => list(c))
  routes.get('/:target', (c) => detail(c))
  routes.get('/:target/verzie/:package', (c) => detail(c))
  routes.get('/:target/verzie/:package/dokument', (c) => download(c, false))
  routes.get('/:target/verzie/:package/potvrdenka/:event', (c) => download(c, true))
}
const uploadLimit = bodyLimit({ maxSize: 10 * 1024 * 1024 + 128 * 1024, onError: (c) => detail(c as Ctx, 'Súbor môže mať najviac 10 MB.', undefined, 413) })
const smallLimit = bodyLimit({ maxSize: 64 * 1024 })
payrollReportRoutes.post('/zalozit', smallLimit, async (c) => {
  const data = await c.req.parseBody(), period = text(data.period, 16)
  if (!isMonth(period)) return c.text('Neplatné mzdové obdobie.', 400)
  if (!await withinLimit(c.env.DB, 'payroll-setup', c.get('who').user.id, 60, 3600)) return list(c, 'Príliš veľa požiadaviek. Skúste to neskôr.', { period }, 429)
  const result = await initializeClosedRun(c.env.DB, c.get('payrollCompany'), period, c.get('who').user)
  return result.ok ? c.redirect(`${base(c)}?obdobie=${period}`, 303) : list(c, result.error, { period }, 409)
})
payrollReportRoutes.post('/vyplata', smallLimit, async (c) => {
  const data = await c.req.parseBody(), period = text(data.period, 16), co = c.get('payrollCompany'), user = c.get('who').user
  if (!isMonth(period)) return c.text('Neplatné mzdové obdobie.', 400)
  const closure = await closureOf(c.env.DB, co.id, period)
  if (!closure || closure.id !== text(data.closure, 64)) return list(c, 'Mzdová uzávierka sa zmenila. Obnovte stránku.', { period }, 409)
  if (!await withinLimit(c.env.DB, 'payroll-payout', user.id, 60, 3600)) return list(c, 'Príliš veľa zmien. Skúste to neskôr.', { period }, 429)
  const values = { period, paidOn: text(data.paidOn, 16), reference: text(data.reference, 241), reason: text(data.reason, 1201), checked: data.checked === '1' ? '1' : '' }
  const result = await recordPayout(c.env.DB, closure, user, { ...values, checked: values.checked === '1', revision: number(data.revision) }, today())
  return result.ok ? c.redirect(`${base(c)}?obdobie=${period}#vyplata-${period}`, 303) : list(c, result.error, values, 409)
})
payrollReportRoutes.post('/:target/subor', uploadLimit, async (c) => {
  const target = await targetOf(c.env.DB, c.get('payrollCompany').id, c.req.param('target'))
  if (!target) return c.notFound()
  if (!await withinLimit(c.env.DB, 'payroll-document', c.get('who').user.id, 60, 3600)) return detail(c, 'Príliš veľa požiadaviek. Skúste to neskôr.', undefined, 429)
  const body = await c.req.parseBody(), values = { variant: text(body.variant, 121), reason: text(body.reason, 1201), checked: body.checked === '1' ? '1' : '' }, file = body.report
  if (!(file instanceof File) || !file.size) return detail(c, 'Priložte pôvodný súbor výkazu.', values, 422)
  const result = await saveReport(c.env.DB, c.env.FILES, target, c.get('who').user, { ...values, checked: values.checked === '1', revision: number(body.revision), file: { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) } })
  return result.ok ? c.redirect(`${base(c)}/${target.id}/verzie/${result.id}`, 303) : detail(c, result.error, values, 409)
})
payrollReportRoutes.post('/:target/verzie/:package/stav', uploadLimit, async (c) => {
  const pkg = await reportPackage(c.env.DB, c.get('payrollCompany').id, c.req.param('package'))
  if (!pkg || pkg.target_id !== c.req.param('target')) return c.notFound()
  if (!await withinLimit(c.env.DB, 'payroll-delivery', c.get('who').user.id, 60, 3600)) return detail(c, 'Príliš veľa zmien. Skúste to neskôr.', undefined, 429)
  const body = await c.req.parseBody(), to = text(body.to, 30)
  const values = { to, externalOn: text(body.externalOn, 20), reference: text(body.reference, 161), reason: text(body.reason, 1201), channel: text(body.channel, 121), checked: body.checked === '1' ? '1' : '' }
  if (!isDeliveryState(to) || number(body.revision) < 0) return detail(c, 'Skontrolujte požadovanú zmenu a obnovte stránku.', values, 422)
  const file = body.receipt instanceof File && body.receipt.size > 0 ? body.receipt : null
  const result = await changeReportDelivery(c.env.DB, c.env.FILES, pkg, c.get('who').user, { ...values, to, revision: number(body.revision), checked: values.checked === '1', ...(file ? { receipt: { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) } } : {}) }, today())
  return result.ok ? c.redirect(`${base(c)}/${pkg.target_id}/verzie/${pkg.id}`, 303) : detail(c, result.error, values, 409)
})
