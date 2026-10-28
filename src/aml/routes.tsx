import { dossierProposals } from './proposals'
import { tellAdmitted } from '../team/nudge'
import { bankEvidence,prepareBankEvidence } from './enhanced'
import { registerArchiveRoutes } from './archive'
import { AmlProspectPanel, type ProspectReport, type ProspectHold } from '../views/aml-prospects'
import { bell, ringStatement } from '../bell'
import { AML_TODAY_SQL, accessOpenSql } from './retention'
import type { Context, Hono } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import type { Child } from 'hono/jsx'
import type { AppBindings } from '../app/routes'
import type { Who } from '../app/store'
import { now, sha256Hex, withinLimit } from '../db'
import { newToken } from '../app/session'
import { normalizeIco } from '../ico'
import { lookupCompany, lookupEntity, oneMayConclude } from '../rpo'
import { flushOutbox, queueStatement } from '../mail'
import { later, siteOrigin } from '../http'
import { ORDER, PLANS } from '../config'
import { orderOf, type Order } from '../order'
import { AmlDossierPanel } from '../views/aml-admission'
import { officerSql } from './schema'
import { bankOriginalsIntact, bytesHash, decideDossier, dossierOfOrder, dossierView, isOfficer, officer, recordCheck, reevaluatePolicy, signatureFile, sourceIntact } from './store'
import { COUNTRY_LISTS_CHECKED_ON, COUNTRY_POLICY_VERSION } from './countries'
import { latestPolicyReviewSql } from './model'
import type { Dossier, DossierView } from './model'

type Env = { Bindings: AppBindings; Variables: { who: Who } }
type Ctx = Context<Env>
type Render = (c: Ctx, title: string, child: Child, status?: ContentfulStatusCode) => Promise<Response>
const identifier = /^[A-Za-z0-9_-]{1,64}$/
const text = (v: unknown, max = 2000) => typeof v === 'string' ? v.trim().slice(0, max) : ''

/** Permission is checked on the effective company even for a dossier collected before that company existed. */
async function accessible(c: Ctx, id: string, write: boolean): Promise<{ view: DossierView; back: string; order: Order | null } | null> {
  if (!identifier.test(id)) return null
  const db = c.env.DB
  const user = c.get('who').user
  const d = await db.prepare('SELECT * FROM aml_dossiers WHERE id = ?').bind(id).first<Dossier>()
  if (!d || !user.team) return null
  const o = d.order_id ? await db.prepare('SELECT * FROM orders WHERE id = ?').bind(d.order_id).first<Record<string, unknown>>() : null
  const companyId = d.company_id ?? (typeof o?.company_id === 'string' ? o.company_id : null)
  const company = companyId ? await db.prepare(`SELECT c.id, c.closed_at, c.accountant_id, (${accessOpenSql('c')}) AS active FROM companies c WHERE c.id = ?`).bind(companyId).first<{ id: string; closed_at: number | null; accountant_id: string | null; active: number }>() : null
  // His word of 27 October 2026: the people's identification (birth numbers, addresses, documents, the signed file) is
  // seen and checked by the designated person alone, never by an accountant or another administrator.
  if (!await isOfficer(db, user)) return null
  if (company) {
    if (!company.active && write) return null
  } else if (write && o?.status !== 'open') return null
  const view = await dossierView(db, d)
  return view ? { view, order: o ? orderOf(o) : null, back: company ? `/ucto/klienti/${company.id}/aml` : `/ucto/aml/objednavky/${d.order_id}` } : null
}
export function registerAmlRoutes(app: Hono<Env>, render: Render): void {
  registerArchiveRoutes(app,render)
  const missing = (c: Ctx) => c.notFound()
  app.get('/aml/papier', async (c) => {
    if (c.get('who').user.team !== 'admin') return missing(c)
    return render(c, 'Overenie klienta s papierovou zmluvou', <section class="info stack">
      <a class="back" href="/ucto/klienti/novy">Späť na založenie klienta</a><h1 class="h1">Overenie pred papierovou zmluvou</h1>
      <p>Najprv zozbierame a overíme podklady. Klientsky účet vznikne až po potvrdení určenej osoby a po zaznamenaní podpísanej zmluvy.</p>
      <form class="stack" method="post" action="/ucto/aml/papier">
        {[['ico','IČO',12],['firma','Obchodné meno',160],['adresa','Sídlo',200],['osoba','Meno osoby konajúcej za firmu',120],['email','E-mail tejto osoby',200]].map(([name,label,max]) => <div class="field"><label class="field__label" for={`papier-${name}`}>{label}</label><input class="field__input" id={`papier-${name}`} name={String(name)} maxlength={Number(max)} required type={name === 'email' ? 'email' : 'text'} /></div>)}
        <label class="field__label" for="papier-balik">Navrhovaný balík</label><select id="papier-balik" class="field__input" name="balik">{PLANS.map((p) => <option value={p.id}>{p.name}</option>)}</select>
        <button class="btn btn--blue" type="submit">Poslať žiadosť o podklady</button>
      </form>
    </section>)
  })
  app.post('/aml/papier', async (c) => {
    const user = c.get('who').user
    const db = c.env.DB
    if (user.team !== 'admin') return missing(c)
    if (!await withinLimit(db,'aml-paper',user.id,12,3600)) return c.text('Skúste to, prosím, neskôr.',429)
    const body = await c.req.parseBody()
    const ico = normalizeIco(text(body.ico,12))
    const name = text(body.firma,160), address = text(body.adresa,200), person = text(body.osoba,120), email = text(body.email,200).toLowerCase()
    const plan = PLANS.find((p) => p.id === body.balik)
    if (!ico || name.length < 3 || address.length < 8 || person.length < 5 || !person.includes(' ') || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !plan) return c.text('Doplňte platné údaje firmy, osoby a e-mail.',422)
    // Programme 4.2 a)-c), § 7-8 Act 297/2008: never invent a sole director from a typed name.
    // https://static.slov-lex.sk/static/SK/ZZ/2008/297/20260817.html
    const lookup = await lookupCompany(ico)
    const registered = 'found' in lookup ? lookup.found : null
    const entity = registered?.rpoId ? await lookupEntity(registered.rpoId) : null
    if (!registered || registered.terminated || !entity || entity.directors.length === 0) return c.text('Údaje firmy a oprávnenie konať sa nepodarilo overiť v registri. Skontrolujte IČO a skúste to znova.',409)
    if (name !== registered.name || address !== registered.address || !entity.directors.some((d) => d.name === person)) return c.text('Obchodné meno, sídlo a konajúca osoba musia zodpovedať aktuálnemu registru.',422)
    if (!oneMayConclude(entity.form ?? registered.form,entity.directors,entity.acting)) return c.text('Za túto firmu konajú viaceré osoby spoločne. Tento postup podporuje jedného samostatne konajúceho zástupcu. Pred založením účtu treba individuálne overiť všetky konajúce osoby.',409)
    const id = crypto.randomUUID(), token = newToken(), ts = now()
    const inserted = await db.prepare(`INSERT INTO orders (id,token,created_at,expires_at,ico,company,address,directors,plan,person,email,legal_form,aml_paper,acting,register_line)
      SELECT ?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,1,?13,?14 WHERE EXISTS (SELECT 1 FROM users WHERE id = ?15 AND team = 'admin')`)
      .bind(id,await sha256Hex(token),ts,ts+ORDER.days*86400,ico,registered.name,registered.address,JSON.stringify(entity.directors),plan.id,person,email,entity.form ?? registered.form,entity.acting,registered.registerLine,user.id).run()
    if (!inserted.meta.changes) return missing(c)
    const link=`${siteOrigin(c)}/objednavka/${token}`
    await db.batch([queueStatement(db,{key:`aml-intake:${id}`,to:email,subject:'Firmony: podklady pred začatím spolupráce',body:`Dobrý deň,\n\nna tomto odkaze vyplníte vyhlásenie a nahráte podpísaný súbor pre ${name}:\n${link}\n\nPodklady najprv overíme. Týmto odkazom ešte neuzatvárate zmluvu.\n\nFirmony`}),db.prepare("INSERT INTO events (at,user_id,action,subject) VALUES (?,?,'aml.paper.intake.created',?)").bind(ts,user.id,id)])
    later(c,flushOutbox(db,c.env.EMAIL))
    return c.redirect(`/ucto/aml/objednavky/${id}`,303)
  })
  app.get('/aml/objednavky/:id', async (c) => {
    const user = c.get('who').user
    if (!await isOfficer(c.env.DB, user)) return missing(c)
    const raw = await c.env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(c.req.param('id')).first<Record<string, unknown>>()
    if (!raw) return missing(c)
    const order = orderOf(raw)
    if (order.companyId) {
      const archived = await c.env.DB.prepare(`SELECT (${accessOpenSql('c')}) AS active FROM companies c WHERE c.id = ?`).bind(order.companyId).first<{ active: number }>()
      if (!archived?.active && !await isOfficer(c.env.DB, user)) return missing(c)
    }
    const view = await dossierOfOrder(c.env.DB, order.id)
    const designated = await isOfficer(c.env.DB, user)
    const proposals = view ? await dossierProposals(c.env, view.declaration, order.company, Date.now(), order.ico).catch(() => ({})) : {}
    const reports = await c.env.DB.prepare(`SELECT * FROM aml_prospect_reports WHERE order_id = ?1 AND (created_by = ?2 OR ${officerSql('?2')}) ORDER BY created_at DESC,id`).bind(order.id,user.id).all<ProspectReport>()
    const holds = designated ? await c.env.DB.prepare('SELECT id,created_at,until_on,reference FROM aml_prospect_holds WHERE order_id = ? ORDER BY created_at').bind(order.id).all<ProspectHold>() : null
    return render(c, 'Overenie pred zmluvou', <>
      <a class="back" href={order.requestId ? `/ucto/ziadosti/${order.requestId}/posudenie` : '/ucto/klienti/novy'}>Späť na prijatie klienta</a>
      <header class="phead"><h1 class="h1">Overenie pred zmluvou</h1><p class="phead__lead">{order.company}, {order.email}</p></header>
      {c.req.query('chyba') ? <p class="notice notice--error" role="alert">Záznam sa nepodarilo potvrdiť. Skontrolujte úplnosť dôkazov, rizikovú skupinu a aktuálnu verziu údajov.</p> : null}
      <AmlDossierPanel view={view} proposals={proposals} officer={designated} readOnly={order.status !== 'open'} returnTo={`/ucto/aml/objednavky/${order.id}`} download={view ? `/ucto/aml/spisy/${view.dossier.id}/subor` : ''} />
      <AmlProspectPanel orderId={order.id} reports={reports.results} holds={holds?.results ?? []} officer={designated} today={new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Bratislava'}).format(new Date())} readOnly={Boolean(order.companyId || raw.aml_delete_started_at)} ended={Boolean(raw.aml_ended_at)} />
      {view?.ready && order.status === 'open' ? <p><a class="btn btn--line" href={`/ucto/klienti/novy?aml=${order.id}`}>Založiť overeného klienta s papierovou zmluvou</a></p> : null}
    </>)
  })
  app.get('/aml/spisy/:id/subor', async (c) => {
    const found = await accessible(c, c.req.param('id'), false)
    if (!found || !c.env.FILES) return missing(c)
    const d = found.view.dossier
    const file = await c.env.FILES.get(d.file_key)
    if (!file) return missing(c)
    const bytes = new Uint8Array(await file.arrayBuffer())
    if (bytes.length !== d.file_bytes || await bytesHash(bytes) !== d.file_sha256) return c.text('Originál sa nepodarilo overiť.', 409)
    return new Response(bytes, { headers: { 'Content-Type': d.file_type === 'pdf' ? 'application/pdf' : 'application/vnd.etsi.asic-e+zip', 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(d.file_name)}`, 'Cache-Control': 'private, no-store' } })
  })
  app.post('/aml/spisy/:id/banka',async(c)=>{
    const found=await accessible(c,c.req.param('id'),true)
    if (!found || !c.env.FILES) return missing(c)
    const body=await c.req.parseBody(),account=await signatureFile(body.ucet),payment=await signatureFile(body.platba)
    if (!account || !payment) return c.text('Nahrajte oba pôvodné doklady ako PDF alebo ASiC-E, každý najviac 25 MB.',422)
    const statement=await prepareBankEvidence(c.env.DB,c.env.FILES,found.view.dossier,account,payment,c.get('who').user.id)
    await statement.run()
    return c.redirect(found.back,303)
  })
  app.get('/aml/spisy/:id/banka/:proof/:kind',async(c)=>{
    const found=await accessible(c,c.req.param('id'),false)
    if (!found || !c.env.FILES || !['ucet','platba'].includes(c.req.param('kind'))) return missing(c)
    const proof=(await bankEvidence(c.env.DB,found.view.dossier.id)).find((b)=>b.id === c.req.param('proof'))
    if (!proof) return missing(c)
    const account=c.req.param('kind') === 'ucet',file=await c.env.FILES.get(account?proof.account_key:proof.payment_key)
    if (!file) return missing(c)
    const bytes=new Uint8Array(await file.arrayBuffer())
    if (bytes.length !== (account?proof.account_bytes:proof.payment_bytes) || await bytesHash(bytes) !== (account?proof.account_sha256:proof.payment_sha256)) return c.text('Originál sa nepodarilo overiť.',409)
    return new Response(bytes,{headers:{'Content-Type':'application/octet-stream','Content-Disposition':'attachment; filename="Firmony-bankovy-doklad"','Cache-Control':'private, no-store'}})
  })
  app.get('/aml/spisy/:id/historia',async(c)=>{
    const found=await accessible(c,c.req.param('id'),false)
    if(!found) return missing(c)
    const decisions=await c.env.DB.prepare('SELECT * FROM aml_decisions WHERE dossier_id = ? ORDER BY id').bind(found.view.dossier.id).all()
    return c.body(JSON.stringify({dossier:found.view.dossier,checks:found.view.checks,placeChecks:found.view.placeChecks ?? [],policyReviews:found.view.policyReviews ?? [],decisions:decisions.results},null,2),200,{'Content-Type':'application/json; charset=utf-8','Content-Disposition':'attachment; filename="Firmony-overenie-historia.json"','Cache-Control':'private, no-store'})
  })
  app.post('/aml/spisy/:id/kontrola', async (c) => {
    const found = await accessible(c, c.req.param('id'), true)
    if (!found) return missing(c)
    const body = await c.req.parseBody()
    const intact = body.druh !== 'identity' || await sourceIntact(c.env.FILES, found.view.dossier)
    const ok = intact && await recordCheck(c.env.DB, c.get('who').user, found.view, {
      kind: text(body.druh, 30), result: text(body.vysledok, 20), source: text(body.zdroj), subject: text(body.podpisujuci, 160), hash: text(body.hash, 64), qualified: body.kvalifikovany === '1',
    })
    return c.redirect(`${found.back}${ok ? '?ok=kontrola' : '?chyba=kontrola'}`, 303)
  })
  app.post('/aml/spisy/:id/rozhodnutie', async (c) => {
    const found = await accessible(c, c.req.param('id'), true)
    const user = c.get('who').user
    if (!found || !await isOfficer(c.env.DB, user)) return missing(c)
    const body = await c.req.parseBody()
    const bank={id:text(body.banka,64),iban:text(body.iban,64).replace(/\s/g,''),country:text(body.bankaKrajina,2),owner:text(body.majitel,200),reference:text(body.prvaPlatba)}
    const bankReady=body.rozhodnutie !== 'approved' || body.riziko !== 'high' || body.bankaOverena === '1' && await bankOriginalsIntact(c.env.DB,c.env.FILES,found.view.dossier,bank.id)
    const consent = body.rozhodnutie !== 'approved' || body.riziko !== 'high' || body.suhlas === '1'
    const ok = consent && bankReady && await sourceIntact(c.env.FILES, found.view.dossier) && await decideDossier(c.env.DB, user, found.view, {
      decision: text(body.rozhodnutie, 20), level: text(body.riziko, 20), note: text(body.dovod), enhanced: text(body.zvysene), hash: text(body.hash, 64), bank,
    })
    // The director of an online order learns at once that the contract may be concluded (team/nudge.ts).
    if (ok && body.rozhodnutie === 'approved' && found.view.dossier.order_id) later(c, tellAdmitted(c.env, found.view.dossier.order_id, siteOrigin(c)))
    return c.redirect(`${found.back}${ok ? '?ok=overene' : '?chyba=overenie'}`, 303)
  })
  app.post('/aml/objednavky/:id/oznamenie', async (c) => {
    const db=c.env.DB,user=c.get('who').user,id=c.req.param('id')
    if (user.team !== 'admin' || !identifier.test(id)) return missing(c)
    const body=await c.req.parseBody(), note=text(body.text,6000)
    if (note.length < 12) return c.text('Doplňte konkrétne zistenie a dôvod.',422)
    const report=crypto.randomUUID(),ts=now(), designated=await officer(db)
    const result=await db.prepare(`INSERT INTO aml_prospect_reports (id,order_id,created_at,created_by,body)
      SELECT ?1,?2,?3,?4,?5 WHERE EXISTS (SELECT 1 FROM orders WHERE id=?2 AND company_id IS NULL AND aml_delete_started_at IS NULL)`)
      .bind(report,id,ts,user.id,note).run()
    if (!result.meta.changes) return missing(c)
    if (designated) {await db.batch([ringStatement(db,'aml-prospect-report',report,designated.email,bell.teamReport(`${siteOrigin(c)}/ucto/aml/objednavky/${id}`))]);later(c,flushOutbox(db,c.env.EMAIL))}
    return c.redirect(`/ucto/aml/objednavky/${id}`,303)
  })
  app.post('/aml/objednavky/:id/oznamenie/:report', async (c) => {
    const db=c.env.DB,user=c.get('who').user,id=c.req.param('id'),report=c.req.param('report')
    if (!await isOfficer(db,user) || !identifier.test(id) || !identifier.test(report)) return missing(c)
    const body=await c.req.parseBody(),note=text(body.dovod), decision=body.rozhodnutie
    if (note.length < 12 || decision !== 'reported' && decision !== 'not') return c.text('Doplňte rozhodnutie a jeho odôvodnenie.',422)
    await db.prepare(`UPDATE aml_prospect_reports SET decided_at=?1,decided_by=?2,decision=?3,decision_note=?4 WHERE id=?5 AND order_id=?6 AND decided_at IS NULL AND ${officerSql('?2')}`)
      .bind(now(),user.id,decision,note,report,id).run()
    return c.redirect(`/ucto/aml/objednavky/${id}`,303)
  })
  app.post('/aml/objednavky/:id/odmietnut', async (c) => {
    const db=c.env.DB,user=c.get('who').user,id=c.req.param('id')
    if (!await isOfficer(db,user) || !identifier.test(id)) return missing(c)
    const body=await c.req.parseBody(),note=text(body.dovod),decision=body.posudenie
    if (note.length < 12 || decision !== 'reported' && decision !== 'not' && decision !== 'pending') return c.text('Zaznamenajte dôvod odmietnutia a posúdenie neobvyklej obchodnej operácie.',422)
    const ts=now()
    await db.batch([
      db.prepare(`INSERT INTO aml_prospect_reports (id,order_id,created_at,created_by,body,decided_at,decided_by,decision,decision_note)
        SELECT ?1,?2,?3,?4,?5,?6,?7,?8,?9 WHERE EXISTS (SELECT 1 FROM orders WHERE id=?2 AND company_id IS NULL AND aml_delete_started_at IS NULL) AND ${officerSql('?4')}`)
        .bind(crypto.randomUUID(),id,ts,user.id,note,decision==='pending'?null:ts,decision==='pending'?null:user.id,decision==='pending'?null:decision,decision==='pending'?null:note),
      db.prepare(`UPDATE orders SET status='expired',aml_ended_at=COALESCE(aml_ended_at,?1) WHERE id=?2 AND company_id IS NULL AND aml_delete_started_at IS NULL AND ${officerSql('?3')}`).bind(now(),id,user.id),
      db.prepare(`UPDATE requests SET status='declined',aml_ended_at=COALESCE(aml_ended_at,?1) WHERE id=(SELECT request_id FROM orders WHERE id=?2 AND company_id IS NULL AND status='expired') AND ${officerSql('?3')}`).bind(now(),id,user.id),
    ])
    return c.redirect(`/ucto/aml/objednavky/${id}`,303)
  })
  app.post('/aml/objednavky/:id/uchovanie', async (c) => {
    const db=c.env.DB,user=c.get('who').user,id=c.req.param('id')
    if (!await isOfficer(db,user) || !identifier.test(id) || !c.env.FILES) return missing(c)
    const body=await c.req.parseBody(),reference=text(body.referencia,1000),until=text(body.do,10),file=await signatureFile(body.subor)
    const date = new Date(`${until}T12:00:00Z`)
    if (reference.length < 12 || !/^\d{4}-\d{2}-\d{2}$/.test(until) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0,10) !== until || !file) return c.text('Doplňte písomnú žiadosť FSJ, referenciu a platný dátum.',422)
    const hold=crypto.randomUUID(),key=`onboarding/${id}/holds/${hold}.${file.type}`
    await c.env.FILES.put(key,file.bytes,{httpMetadata:{contentType:file.type==='pdf'?'application/pdf':'application/vnd.etsi.asic-e+zip'}})
    try {await db.prepare(`INSERT INTO aml_prospect_holds (id,order_id,created_at,created_by,until_on,file_key,file_sha256,file_bytes,reference)
      VALUES (?,?,?,?,?,?,?,?,?)`).bind(hold,id,now(),user.id,until,key,file.sha256,file.bytes.length,reference).run()}
    catch {return c.text('Predĺženie nemožno zaznamenať. Skontrolujte koniec rokovania a lehotu žiadosti FSJ, najviac ďalších päť rokov.',409)}
    return c.redirect(`/ucto/aml/objednavky/${id}`,303)
  })
  app.get('/aml/objednavky/:id/uchovanie/:hold', async (c) => {
    const db=c.env.DB,user=c.get('who').user
    if (!await isOfficer(db,user) || !c.env.FILES) return missing(c)
    const hold=await db.prepare('SELECT file_key,file_sha256,file_bytes FROM aml_prospect_holds WHERE id=? AND order_id=?').bind(c.req.param('hold'),c.req.param('id')).first<{file_key:string;file_sha256:string;file_bytes:number}>()
    if (!hold) return missing(c)
    const file=await c.env.FILES.get(hold.file_key)
    if (!file) return missing(c)
    const bytes=new Uint8Array(await file.arrayBuffer())
    if (bytes.length!==hold.file_bytes || await bytesHash(bytes)!==hold.file_sha256) return c.text('Originál sa nepodarilo overiť.',409)
    return new Response(bytes,{headers:{'Content-Type':'application/octet-stream','Content-Disposition':'attachment; filename="FSJ-ziadost"','Cache-Control':'private, no-store'}})
  })
  app.get('/aml/urcena-osoba', async (c) => {
    const user = c.get('who').user
    if (user.team !== 'admin') return missing(c)
    const current = await officer(c.env.DB)
    const allowed = await isOfficer(c.env.DB, user)
    const people = allowed ? await c.env.DB.prepare("SELECT id,name,email FROM users WHERE team = 'admin' ORDER BY name").all<{ id: string; name: string | null; email: string }>() : null
    // Dossiers of clients still served, made under an older list of countries and not re-evaluated since (program 4.4 c)).
    const stale = allowed ? await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM aml_dossiers d LEFT JOIN orders ao ON ao.id = d.order_id
      LEFT JOIN companies ac ON ac.id = COALESCE(d.company_id, ao.company_id)
      WHERE COALESCE((SELECT r.policy_version FROM aml_policy_reviews r WHERE r.id = ${latestPolicyReviewSql('d')}), d.policy_version) <> ?
        AND (ao.company_id IS NULL AND ao.status = 'open' OR ac.id IS NOT NULL AND ${accessOpenSql('ac')})`).bind(COUNTRY_POLICY_VERSION).first<{ n: number }>() : null
    const count = (v: string | undefined) => (v && /^\d{1,4}$/.test(v) ? Number(v) : null)
    const reviewed = count(c.req.query('prehodnotene')), rising = count(c.req.query('rast'))
    const done = reviewed === null ? null : `Prehodnotených klientov: ${reviewed}. Nové rozhodnutie potrebuje: ${rising ?? 0}.`
    return render(c, 'Určená osoba AML', <section class="info stack"><h1 class="h1">Určená osoba AML</h1>
      <p>{current ? `${current.name ?? current.email}` : 'Určená osoba zatiaľ nie je aktivovaná.'}</p>
      <p>Prvý správca aktivuje určenú osobu podľa programu. Ďalšie poverenie zaznamenáva súčasná určená osoba. Rola administrátora sama osebe nesprístupňuje interné oznámenia. Súčasnú určenú osobu nemožno preradiť z roly správcu, kým nie je poverená iná.</p>
      {allowed ? <form class="stack" method="post" action="/ucto/aml/urcena-osoba"><label class="field__label" for="aml-osoba">Nová určená osoba</label><select class="field__input" id="aml-osoba" name="osoba">{people?.results.map((p) => <option value={p.id}>{p.name ?? p.email}</option>)}</select><label class="field__label" for="aml-poverenie">Referencia na schválenú zmenu programu a dôvod</label><textarea class="field__input field__area" id="aml-poverenie" name="dovod" minlength={12} maxlength={2000} required /><button class="btn btn--line" type="submit">Zapísať poverenie</button></form> : null}
      {allowed ? <section class="info stack" id="zoznamy" aria-labelledby="aml-zoznamy-t"><h2 id="aml-zoznamy-t" class="info__title">Zmena zoznamov krajín</h2>
        <p>Pravidlá krajín platia vo verzii {COUNTRY_POLICY_VERSION} (zoznamy EÚ a FATF overené {COUNTRY_LISTS_CHECKED_ON}). Klientov overených podľa staršej verzie: {stale?.n ?? 0}.</p>
        {done ? <p class="notice" role="status">{done}</p> : null}
        <p>Prehodnotenie vypočíta požadovanú rizikovú skupinu z uloženého vyhlásenia každého klienta podľa aktuálnych zoznamov. Klient, ktorého potvrdená skupina stačí, je znova overený. Klient so zvýšenou požadovanou skupinou potrebuje nové rozhodnutie a jeho kroky.</p>
        <form class="stack" method="post" action="/ucto/aml/urcena-osoba/prehodnotit"><label class="field__label" for="aml-prehodnotenie">Referencia na kontrolu zoznamov a dôvod prehodnotenia</label><textarea class="field__input field__area" id="aml-prehodnotenie" name="dovod" minlength={12} maxlength={2000} required /><button class="btn btn--line" type="submit">Prehodnotiť rizikové skupiny klientov</button></form>
      </section> : null}
    </section>)
  })
  app.post('/aml/urcena-osoba/prehodnotit', async (c) => {
    const db = c.env.DB
    const user = c.get('who').user
    if (!await isOfficer(db, user)) return missing(c)
    const body = await c.req.parseBody()
    const result = await reevaluatePolicy(db, user, text(body.dovod))
    if (!result) return c.text('Doplňte referenciu na kontrolu zoznamov a dôvod prehodnotenia.', 422)
    await db.prepare("INSERT INTO events (at,user_id,action,detail) VALUES (?,?,'aml.policy.reevaluated',?)").bind(now(), user.id, JSON.stringify({ version: COUNTRY_POLICY_VERSION, reviewed: result.reviewed, rising: result.rising.length })).run()
    return c.redirect(`/ucto/aml/urcena-osoba?prehodnotene=${result.reviewed}&rast=${result.rising.length}#zoznamy`, 303)
  })
  app.post('/aml/urcena-osoba', async (c) => {
    const db = c.env.DB
    const user = c.get('who').user
    if (!await isOfficer(db, user)) return missing(c)
    const body = await c.req.parseBody()
    const id = text(body.osoba, 64)
    const reason = text(body.dovod)
    if (!identifier.test(id) || reason.length < 12) return c.text('Doplňte osobu a dôvod poverenia.', 422)
    await db.prepare(`INSERT INTO aml_officers (user_id,appointed_at,appointed_by,reason) SELECT ?1,?2,?3,?4 WHERE ${officerSql('?3')}
      AND EXISTS (SELECT 1 FROM users WHERE id = ?1 AND team = 'admin')`).bind(id, now(), user.id, reason).run()
    return c.redirect('/ucto/aml/urcena-osoba', 303)
  })
}
