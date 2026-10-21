// Programme 9.2: a read-only archive after the client's ninety-day download window.
// § 19(2)-(4), Act 297/2008, read 21 October 2026:
// https://static.slov-lex.sk/static/SK/ZZ/2008/297/20260817.html
import type { Hono, Context } from 'hono'
import type { Child } from 'hono/jsx'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import type { AppBindings } from '../app/routes'
import { COMPANY_COLUMNS, companyOf, type Who } from '../app/store'
import { exportYear, exportYears } from '../app/export'
import { dayName } from '../app/copy'
import { archiveDueSql, AML_TODAY_SQL, amlToday, fiveYearsAfter } from './retention'
import { officerSql } from './constants'
import { companyDossiersSql } from './model'

type Env = { Bindings: AppBindings; Variables: { who: Who } }
type Ctx = Context<Env>
type Render = (c: Ctx, title: string, child: Child, status?: ContentfulStatusCode) => Promise<Response>
async function archived(c: Ctx) {
  const row = await c.env.DB.prepare(`SELECT ${COMPANY_COLUMNS} FROM companies c LEFT JOIN users acc ON acc.id = c.accountant_id
    WHERE c.id = ?1 AND c.demo = 0 AND ${archiveDueSql('c',AML_TODAY_SQL)} AND ${officerSql('?2')}`)
    .bind(c.req.param('id'),c.get('who').user.id).first<Record<string,unknown>>()
  return row ? companyOf(row) : null
}
export function registerArchiveRoutes(app: Hono<Env>, render: Render) {
  app.get('/archiv/:id', async (c) => {
    const company = await archived(c)
    if (!company) return c.notFound()
    const years = await exportYears(c.env.DB,company.id)
    const objects = c.env.FILES ? await c.env.FILES.list({prefix:`companies/${company.id}/`,limit:200,cursor:c.req.query('pokracovat')}) : null
    return render(c,'Zákonný archív klienta',<section class="info stack" data-aml-archive>
      <a class="back" href="/ucto">Späť na klientov</a><h1 class="h1">{company.name}</h1>
      <p>Zákonný archív je prístupný iba určenej osobe a iba na čítanie. Zmluva skončila {dayName(company.endsOn ?? '')}. Základná päťročná lehota uplynie {dayName(fiveYearsAfter(company.endsOn ?? amlToday()))}. Aktívne zákonné uchovanie výmaz odloží.</p>
      <a class="link" href={`/ucto/klienti/${company.id}/aml`}>Identifikácia, riziko a dôverné oznámenia</a>
      <a class="btn btn--line" href={`/ucto/archiv/${company.id}/aml.json`}>Stiahnuť históriu identifikácie a udalostí</a>
      <h2 class="info__title">Účtovníctvo, doklady, platby a správy</h2>
      <ul class="plain">{years.map((year) => <li><a class="link" href={`/ucto/archiv/${company.id}/uctovnictvo.zip?rok=${year}`}>Úplný účtovný export za rok {year}</a></li>)}</ul>
      <h2 class="info__title">Pôvodné súbory</h2>
      <ul class="plain">{objects?.objects.map((o) => <li><a class="link" href={`/ucto/archiv/${company.id}/subor?kluc=${encodeURIComponent(o.key)}`}>{o.key.slice(`companies/${company.id}/`.length)}</a></li>)}</ul>
      {objects?.truncated ? <a class="link" href={`/ucto/archiv/${company.id}?pokracovat=${encodeURIComponent(objects.cursor)}`}>Ďalšie pôvodné súbory</a> : null}
    </section>)
  })
  app.get('/archiv/:id/uctovnictvo.zip',async(c) => {
    const company=await archived(c),year=c.req.query('rok') ?? ''
    if (!company || !/^\d{4}$/.test(year) || !(await exportYears(c.env.DB,company.id)).includes(year)) return c.notFound()
    // No export receipt, confirmation, revision or download event is written to an archived company.
    const zip=await exportYear(c.env,company,year,null,dayName(amlToday()))
    return new Response(zip.body,{headers:{'Content-Type':'application/zip','Content-Disposition':`attachment; filename="${zip.name}"`,'Cache-Control':'private, no-store'}})
  })
  app.get('/archiv/:id/aml.json',async(c) => {
    const company=await archived(c)
    if (!company) return c.notFound()
    const db=c.env.DB
    const dossierIds=companyDossiersSql('c')
    const rows=await Promise.all(['declarations','risks','reports','events'].map(async(table) =>
      [table,(await db.prepare(`SELECT * FROM ${table} WHERE company_id = ? ORDER BY rowid`).bind(company.id).all()).results] as const))
    const dossiers=await db.prepare(`SELECT * FROM aml_dossiers WHERE id IN (SELECT x.id FROM companies c JOIN aml_dossiers x ON x.id IN (${dossierIds}) WHERE c.id = ?)` ).bind(company.id).all()
    const ids=dossiers.results.map((d)=>String(d.id))
    const history=await Promise.all(ids.map(async(id)=>({id,
      checks:(await db.prepare('SELECT * FROM aml_checks WHERE dossier_id = ? ORDER BY id').bind(id).all()).results,
      decisions:(await db.prepare('SELECT * FROM aml_decisions WHERE dossier_id = ? ORDER BY id').bind(id).all()).results})))
    const prospectReports=await db.prepare('SELECT * FROM aml_prospect_reports WHERE order_id IN (SELECT id FROM orders WHERE company_id = ?) ORDER BY created_at,id').bind(company.id).all()
    return c.body(JSON.stringify({company:{id:company.id,name:company.name,ico:company.ico,endsOn:company.endsOn},...Object.fromEntries(rows),dossiers:dossiers.results,history,prospectReports:prospectReports.results},null,2),200,
      {'Content-Type':'application/json; charset=utf-8','Content-Disposition':'attachment; filename="Firmony-AML-historia.json"','Cache-Control':'private, no-store'})
  })
  app.get('/archiv/:id/subor',async(c) => {
    const company=await archived(c),key=c.req.query('kluc') ?? ''
    if (!company || !c.env.FILES || !key.startsWith(`companies/${company.id}/`)) return c.notFound()
    const file=await c.env.FILES.get(key)
    if (!file) return c.notFound()
    return new Response(file.body,{headers:{'Content-Type':'application/octet-stream','Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(key.split('/').at(-1) ?? 'subor')}`,'Cache-Control':'private, no-store'}})
  })
}
