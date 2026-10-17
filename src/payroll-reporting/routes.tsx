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
import { PrehladPreparationPage } from '../views/prehlad-preparation'
import { HealthPreparationPage } from '../views/health-preparation'
import { SocialPreparationPage } from '../views/social-preparation'
import { generateSocial,recordSocialFact,socialPlan } from './social-store'
import type { SocialInput } from './social'
import { generateHealth, healthPlan, recordHealthIdentity } from './health-store'
import { healthKind, type HealthInput } from './health'
import { generatePrehlad, generationOf, generationPlan, retireTarget, reviewScope, targetReviews } from './generation-store'
import { addressParts } from '../app/vat-xml'
import type { PrehladInput } from './prehlad'
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
  return frame(c, <PayrollReportPage company={company} target={item} item={item} selected={selected} packages={await reportHistory(db, company.id, item.id)} events={selected ? await reportEvents(db, company.id, selected.id) : []} generation={selected ? await generationOf(db, company.id, selected.id) : null} reviews={await targetReviews(db, company.id, item.id)} scope={staff(c) && c.get('who').user.team === 'admin' ? await reviewScope(db, company.id, item.id) : null} base={base(c)} user={staff(c) ? c.get('who').user : undefined} frozen={await frozen(c)} today={today()} error={error} values={values} />, status)
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
  const name = !receipt && /^[NO]514\d{4}\.\d{3}$/.test(pkg.name) ? pkg.name : `${receipt ? 'potvrdenka' : 'vykaz'}-${receipt ? event?.id : pkg.id}.${key.split('.').pop()}`
  return new Response(bytes, { headers: { 'Content-Type': receipt ? event?.file_type ?? 'application/octet-stream' : pkg.file_type, 'Content-Disposition': `attachment; filename="${name}"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } })
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
  routes.get('/:target/preverenia/:review/dokument', async (c) => {
    const co = c.get('payrollCompany'), review = (await targetReviews(c.env.DB, co.id, c.req.param('target'))).find((r) => r.id === c.req.param('review'))
    if (!review?.file_key?.startsWith(`companies/${co.id}/filings/`)) return c.notFound()
    const object = await c.env.FILES?.get(review.file_key)
    if (!object) return c.text('Pôvodný podklad nie je dostupný.', 409)
    const bytes = new Uint8Array(await object.arrayBuffer())
    if (bytes.length !== review.file_bytes || await fileHash(bytes) !== review.file_sha256) return c.text('Podklad sa nezhoduje s kontrolným odtlačkom.', 409)
    return new Response(bytes, { headers: { 'Content-Type': review.file_type ?? 'application/octet-stream', 'Content-Disposition': `attachment; filename="preverenie-${review.id}.${review.file_key.split('.').pop()}"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } })
  })
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
  const values = { period, paidOn: text(data.paidOn, 16), reportPeriod: text(data.reportPeriod, 16), reference: text(data.reference, 241), reason: text(data.reason, 1201), checked: data.checked === '1' ? '1' : '' }
  const result = await recordPayout(c.env.DB, closure, user, { ...values, checked: values.checked === '1', revision: number(data.revision) }, today())
  return result.ok ? c.redirect(`${base(c)}?obdobie=${period}#vyplata-${period}`, 303) : list(c, result.error, values, 409)
})
async function preparation(c: Ctx, values?: Record<string, string>, error?: string, status: ContentfulStatusCode = 200) {
  const target = await targetOf(c.env.DB,c.get('payrollCompany').id,c.req.param('target')??'')
  if (target && healthKind(target.kind)) return healthPreparation(c,values,error,status)
  if (target?.kind === 'sp') return socialPreparation(c,values,error,status)
  const plan = await generationPlan(c.env.DB, c.get('payrollCompany').id, c.req.param('target') ?? '', today())
  if (!plan) return c.notFound()
  const address = addressParts(plan.company.address), user = c.get('who').user
  const defaults = { dic: plan.company.dic ?? '', name: plan.company.name, street: address.street, number: address.number, postal: address.postal, city: address.city, preparedBy: user.name, phone: '', email: user.email, declaredOn: today(), foundOn: '', kind: '', representation: '', reason: '', reference: '', checked: '' }
  return frame(c, <PrehladPreparationPage plan={plan} base={base(c)} values={{ ...defaults, ...values }} error={error} />, status)
}
payrollReportRoutes.get('/:target/pripravit', (c) => preparation(c))
payrollReportRoutes.post('/:target/generovat', smallLimit, async (c) => {
  const target = await targetOf(c.env.DB,c.get('payrollCompany').id,c.req.param('target'))
  if (target && healthKind(target.kind)) return healthGeneration(c)
  if (target?.kind === 'sp') return socialGeneration(c)
  const body = await c.req.parseBody(), plan = await generationPlan(c.env.DB, c.get('payrollCompany').id, c.req.param('target'), today())
  if (!plan) return c.notFound()
  if (!await withinLimit(c.env.DB, 'payroll-generation', c.get('who').user.id, 60, 3600)) return preparation(c, undefined, 'Príliš veľa požiadaviek. Skúste to neskôr.', 429)
  const values: Record<string, string> = {}
  for (const key of ['dic','name','street','number','postal','city','preparedBy','phone','email','declaredOn','foundOn','kind','representation','reason','reference']) values[key] = text(body[key], 1201)
  values.checked = body.checked === '1' ? '1' : ''
  const result = await generatePrehlad(c.env.DB, c.env.FILES, plan, c.get('who').user, text(body.token, 64), { ...values, checked: values.checked === '1' } as unknown as PrehladInput, today())
  return result.ok && 'id' in result ? c.redirect(`${base(c)}/${plan.target.id}/verzie/${result.id}`, 303) : preparation(c, { ...values, checked: '' }, result.error, 409)
})
async function socialPreparation(c:Ctx,values?:Record<string,string>,error?:string,status:ContentfulStatusCode=200) {
  const plan=await socialPlan(c.env.DB,c.get('payrollCompany').id,c.req.param('target')??'',today())
  if (!plan) return c.notFound()
  const user=c.get('who').user,defaults={...plan.defaults,preparedBy:plan.defaults.preparedBy||(user.name.length<=30?user.name:''),email:plan.defaults.email||user.email}
  return frame(c,<SocialPreparationPage plan={plan} base={base(c)} user={user} values={{...defaults,...values}} error={error}/>,status)
}
async function socialGeneration(c:Ctx) {
  const body=await c.req.parseBody(),plan=await socialPlan(c.env.DB,c.get('payrollCompany').id,c.req.param('target')??'',today())
  if (!plan) return c.notFound()
  if (!await withinLimit(c.env.DB,'payroll-generation',c.get('who').user.id,60,3600)) return socialPreparation(c,undefined,'Príliš veľa požiadaviek. Skúste to neskôr.',429)
  const values:Record<string,string>={}
  for (const key of ['name','payer','iban','firstName','lastName','phone','email','preparedBy','declaredOn','kind','reason','reference']) values[key]=text(body[key],1201)
  values.checked=body.checked==='1'?'1':''
  const r=await generateSocial(c.env.DB,c.env.FILES,plan,c.get('who').user,text(body.token,64),{...values,checked:values.checked==='1'} as unknown as SocialInput,today())
  return r.ok&&'id' in r?c.redirect(`${base(c)}/${plan.target.id}/verzie/${r.id}`,303):socialPreparation(c,{...values,checked:''},r.error,409)
}
payrollReportRoutes.post('/:target/udaje-sp',smallLimit,async(c)=>{
  const b=await c.req.parseBody(),plan=await socialPlan(c.env.DB,c.get('payrollCompany').id,c.req.param('target'),today())
  if (!plan) return c.notFound()
  const values={factEmployee:text(b.employee,100),factSection:text(b.section,16),factValue:text(b.value,16),factMode:text(b.mode,16),factReference:text(b.reference,241),factReason:text(b.reason,1201)}
  if (!await withinLimit(c.env.DB,'payroll-social-fact',c.get('who').user.id,300,3600)) return socialPreparation(c,values,'Príliš veľa požiadaviek. Skúste to neskôr.',429)
  const r=await recordSocialFact(c.env.DB,plan,c.get('who').user,text(b.token,64),{employee:values.factEmployee,section:values.factSection,value:values.factValue,mode:values.factMode,reference:values.factReference,reason:values.factReason,checked:b.checked==='1',revision:number(b.revision)})
  return r.ok?c.redirect(`${base(c)}/${plan.target.id}/pripravit#udaje-poistencov`,303):socialPreparation(c,values,r.error,409)
})
async function healthPreparation(c:Ctx, values?:Record<string,string>, error?:string, status:ContentfulStatusCode=200) {
  const plan=await healthPlan(c.env.DB,c.get('payrollCompany').id,c.req.param('target')??'',today())
  if (!plan) return c.notFound()
  return frame(c,<HealthPreparationPage plan={plan} base={base(c)} user={c.get('who').user} values={{...plan.defaults,...values}} error={error}/>,status)
}
async function healthGeneration(c:Ctx) {
  const body=await c.req.parseBody(),plan=await healthPlan(c.env.DB,c.get('payrollCompany').id,c.req.param('target')??'',today())
  if (!plan) return c.notFound()
  if (!await withinLimit(c.env.DB,'payroll-generation',c.get('who').user.id,60,3600)) return healthPreparation(c,undefined,'Príliš veľa požiadaviek. Skúste to neskôr.',429)
  const values:Record<string,string>={}
  for (const key of ['name','dic','payer','branch','iban','phone','email','sendOn','batch','kind','reason','reference']) values[key]=text(body[key],1201)
  values.checked=body.checked==='1'?'1':''
  const r=await generateHealth(c.env.DB,c.env.FILES,plan,c.get('who').user,text(body.token,64),{...values,checked:values.checked==='1'} as unknown as HealthInput,today())
  return r.ok && 'id' in r ? c.redirect(`${base(c)}/${plan.target.id}/verzie/${r.id}`,303) : healthPreparation(c,{...values,checked:''},r.error,409)
}
payrollReportRoutes.post('/:target/poistenec',smallLimit,async(c)=>{
  const b=await c.req.parseBody(),employee=text(b.employee,100),values={employee,identifier:text(b.identifier,11),identityReference:text(b.reference,241),identityReason:text(b.reason,1201)}
  if (!await withinLimit(c.env.DB,'payroll-health-identity',c.get('who').user.id,300,3600)) return healthPreparation(c,values,'Príliš veľa požiadaviek. Skúste to neskôr.',429)
  const r=await recordHealthIdentity(c.env.DB,c.get('payrollCompany').id,c.req.param('target'),employee,c.get('who').user,{revision:number(b.revision),identifier:values.identifier,reference:values.identityReference,reason:values.identityReason,checked:b.checked==='1'})
  return r.ok ? c.redirect(`${base(c)}/${c.req.param('target')}/pripravit#poistenci`,303) : healthPreparation(c,values,r.error,409)
})
payrollReportRoutes.post('/:target/preverit-rozsah', uploadLimit, async (c) => {
  const body = await c.req.parseBody(), file = body.evidence instanceof File && body.evidence.size ? body.evidence : null
  const values = { reviewReason: text(body.reason, 1201), reviewReference: text(body.reference, 241) }
  if (!await withinLimit(c.env.DB, 'payroll-scope-review', c.get('who').user.id, 60, 3600)) return detail(c, 'Príliš veľa požiadaviek. Skúste to neskôr.', values, 429)
  const result = await retireTarget(c.env.DB, c.env.FILES, c.get('payrollCompany').id, c.req.param('target'), c.get('who').user, { revision: number(body.revision), reason: values.reviewReason, reference: values.reviewReference, checked: body.checked === '1', ...(file ? { file: { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) } } : {}) })
  return result.ok ? c.redirect(`${base(c)}/${c.req.param('target')}`, 303) : detail(c, result.error, values, 409)
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
