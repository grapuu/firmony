import type { FC,Child } from 'hono/jsx'
import type { User } from '../app/store'
import type { SocialPlan } from '../payroll-reporting/social-store'
import { socialHoursLabel } from '../payroll-reporting/social'
import { formatEurExact } from '../format'
import { monthName,dayName } from '../app/copy'
import { Heading } from './inside'

export const SocialPreparationPage:FC<{plan:SocialPlan;base:string;user:User;values:Record<string,string>;error?:string}>=({plan,base,user,values:v,error})=>{
  const field=(key:string,label:string,max:number,required=true,type='text',readOnly=false)=><div class="field"><label class="field__label" for={`social-${key}`}>{label}</label><input class="field__input" id={`social-${key}`} name={key} type={type} maxlength={max} required={required} readonly={readOnly} value={v[key]??''}/></div>
  const factForm=(employee:string,section:string,revision:number,index:number,fields:Child)=>{
    const editing=v.factEmployee===employee&&v.factSection===section,prefix=`social-${section}-${index}`
    return <form class="stack social-fact-form" method="post" action={`${base}/${plan.target.id}/udaje-sp`} data-section={section}>
      <input type="hidden" name="token" value={plan.token}/><input type="hidden" name="employee" value={employee}/><input type="hidden" name="section" value={section}/><input type="hidden" name="revision" value={revision}/>
      {fields}
      <div class="field"><label class="field__label" for={`${prefix}-reference`}>Referencia overeného podkladu</label><input class="field__input" id={`${prefix}-reference`} name="reference" minlength={12} maxlength={240} required value={editing?v.factReference??'':''}/></div>
      {revision>0||section==='hours'?<div class="field"><label class="field__label" for={`${prefix}-reason`}>Dôvod opravy alebo použitia kódu 999{revision?'':' · pri overených číselných hodinách voliteľné'}</label><textarea class="field__input field__area" id={`${prefix}-reason`} name="reason" minlength={12} maxlength={1200} required={revision>0}>{editing?v.factReason??'':''}</textarea></div>:null}
      <label class="tickbox"><input type="checkbox" name="checked" value="1" required/><span>{section==='hours'?'Overil(a) som hodiny zodpovedajúce vykázanému vymeriavaciemu základu vrátane plateného neodpracovaného času. Osobitný kód 999 používam iba vtedy, keď počet hodín nemožno určiť.':'Overil(a) som identitu, údaj a jeho priradenie k tomuto zamestnancovi podľa uvedeného podkladu.'}</span></label>
      <button class="btn btn--line" type="submit">{revision?'Uložiť opravu s históriou':'Uložiť overený údaj'}</button>
    </form>
  }
  return <div class="filing-work">
    <p><a class="link" href={`${base}/${plan.target.id}`}>Späť na výkaz a potvrdenky</a></p>
    <Heading first="Pripraviť výkaz SP" second={monthName(`${plan.target.period}-01`)}/>
    <p class="info__lead">{plan.company.name} · MVPP 2026 · pracovné pomery, dohody a odmeny členov orgánov spoločnosti z uzavretých miezd</p>
    {error?<p class="notice notice--error" role="alert">{error}</p>:null}
    <section class="info"><h2 class="info__title">Úhrny z uzavretých miezd</h2><dl class="kv">
      <div><dt>Počet zamestnancov</dt><dd>{plan.totals.rows.length}</dd></div><div><dt>Poistné zamestnancov</dt><dd>{formatEurExact(plan.totals.employeeTotal)}</dd></div><div><dt>Poistné zamestnávateľa</dt><dd>{formatEurExact(plan.totals.employerTotal)}</dd></div><div><dt>Spolu na sociálne poistenie</dt><dd>{formatEurExact(plan.totals.total)}</dd></div><div><dt>Určený výplatný termín</dt><dd>{dayName(plan.closure.payday,v.declaredOn??'')}</dd></div>
    </dl><p class="small">Sumy každého fondu preberáme z uzavretých pások. Určený výplatný termín nepotvrdzuje skutočnú bankovú úhradu.</p></section>
    {plan.totals.rows.length?<section class="info" id="udaje-poistencov"><h2 class="info__title">Overené údaje poistencov</h2><p>Rodné číslo zdieľame s prípravou zdravotných výkazov. IČPV overte podľa registrácie v SP. Tieto údaje použijeme aj nabudúce; hodiny treba overiť za každý mesiac.</p>
      {plan.totals.rows.map((row,i)=>{
        const identity=plan.identities.find((x)=>x.employee_id===row.employeeId),relation=plan.relations.find((x)=>x.employee_id===row.employeeId),hours=plan.inputs.find((x)=>x.employee_id===row.employeeId),editing=v.factEmployee===row.employeeId
        const value=(section:string,fallback='')=>editing&&v.factSection===section?v.factValue??'':fallback
        const hoursText=(n:number)=>`${Math.floor(n/100)},${String(n%100).padStart(2,'0')}`
        const mode=editing&&v.factSection==='hours'?v.factMode??'':hours?.hours_mode??(row.paidHours!==null?'known':'')
        return <details class="info social-person" open={!identity||!relation||!hours||editing}><summary>{row.name} · {identity&&relation&&hours?'podklady overené':'treba doplniť podklady'}</summary>
          <h3 class="info__title">Rodné číslo</h3>{identity?<p class="small">Overené, končí {identity.identifier.slice(-4)} · {identity.reference}</p>:null}
          {!plan.frozen&&(!identity||user.team==='admin')?factForm(row.employeeId,'identity',identity?.revision??0,i,<div class="field"><label class="field__label" for={`social-identity-${i}`}>Overené rodné číslo bez lomky</label><input class="field__input" id={`social-identity-${i}`} name="value" inputmode="numeric" pattern="[0-9]{9,10}" minlength={9} maxlength={10} autocomplete="off" required value={value('identity')}/></div>):null}
          <h3 class="info__title">Právny vzťah v SP</h3>{relation?<p class="small">IČPV overené, končí {relation.icpv.slice(-4)} · {relation.reference}</p>:null}
          {!plan.frozen&&(!relation||user.team==='admin')?factForm(row.employeeId,'relation',relation?.revision??0,i,<div class="field"><label class="field__label" for={`social-relation-${i}`}>IČPV pridelené SP · 12 číslic</label><input class="field__input" id={`social-relation-${i}`} name="value" inputmode="numeric" pattern="[0-9]{12}" minlength={12} maxlength={12} autocomplete="off" required value={value('relation')}/></div>):null}
          <h3 class="info__title">Hodiny za {monthName(`${plan.target.period}-01`)}</h3>{hours?<p class="small">{socialHoursLabel(hours.hours,hours.hours_mode)} · {hours.reference}</p>:null}
          {!plan.frozen&&(!hours||user.team==='admin')?factForm(row.employeeId,'hours',hours?.revision??0,i,<>
            <div class="field"><label class="field__label" for={`social-hours-mode-${i}`}>Spôsob vykázania hodín</label><select class="field__input" id={`social-hours-mode-${i}`} name="mode" required><option value="">Zvoľte podľa podkladov</option><option value="known" selected={mode==='known'}>Overený počet hodín</option><option value="undetermined" selected={mode==='undetermined'}>Počet nemožno určiť · kód 999</option></select></div>
            <div class="field"><label class="field__label" for={`social-hours-${i}`}>Overený počet hodín · najviac dve desatinné miesta</label><input class="field__input" id={`social-hours-${i}`} name="value" inputmode="decimal" maxlength={6} value={value('hours',hours?.hours_mode==='known'?hoursText(hours.hours):!hours&&row.paidHours!==null?hoursText(row.paidHours):'')}/><p class="small">{row.paidHours!==null?`Navrhujeme ${hoursText(row.paidHours)} h z miezd: odpracované aj platené neodpracované hodiny (dovolenka, prekážky, sviatky), bez dní PN a neplateného voľna. `:''}Pri kóde 999 nechajte číselné pole prázdne a uveďte dôvod.</p></div>
          </>):null}
          {plan.frozen?<p class="small">Účtovníctvo je uzamknuté na odovzdanie.</p>:user.team!=='admin'&&identity&&relation&&hours?<p class="small">Opravu overeného údaja vykoná správca s dôvodom a zachovaním histórie.</p>:null}
        </details>
      })}
    </section>:null}
    {plan.issues.length?<section class="info"><h2 class="info__title">Najprv vyriešte podklady</h2><ul>{plan.issues.map((s)=><li>{s}</li>)}</ul><p>Prípady mimo podporovaného rozsahu pripravte odborne externe a doložte presný výkaz.</p><a class="btn btn--line" href={`${base}/${plan.target.id}`}>Otvoriť evidenciu výkazu</a></section>:<form class="info stack social-report-form" method="post" action={`${base}/${plan.target.id}/generovat`}>
      <input type="hidden" name="token" value={plan.token}/><h2 class="info__title">Skontrolujte hlavičku a úplnosť</h2>
      {field('name','Obchodné meno zamestnávateľa',144,true,'text',true)}{field('payer','Číslo zamestnávateľa pridelené SP · 10 číslic',10)}{field('iban','Vlastný IBAN, z ktorého odvádzate poistné',34)}
      {field('firstName','Meno osoby plniacej povinnosti voči SP',24)}{field('lastName','Priezvisko osoby plniacej povinnosti voči SP',36)}{field('phone','Telefón tejto osoby s medzinárodnou predvoľbou',50,true,'tel')}{field('email','E-mail tejto osoby',255,true,'email')}
      {field('preparedBy','Vypracoval(a)',30)}{field('declaredOn','Dátum vypracovania',10,true,'date')}
      <div class="field"><label class="field__label" for="social-kind">Typ výkazu</label><select class="field__input" id="social-kind" name="kind" required><option value="">Zvoľte podľa skutočného stavu</option><option value="R" selected={v.kind==='R'} disabled={plan.requiresCorrection}>Riadny mesačný výkaz</option><option value="O" selected={v.kind==='O'}>Opravný · úplná náhrada</option></select>{plan.requiresCorrection?<p class="small">Toto obdobie už má doložené prijatie SP. Ďalšia príprava je úplný opravný výkaz.</p>:null}</div>
      {field('reference','Referencia odbornej kontroly úplnosti',240)}
      <div class="field"><label class="field__label" for="social-reason">Dôvod a rozsah opravného alebo ďalšieho výkazu</label><textarea class="field__input field__area" id="social-reason" name="reason" minlength={12} maxlength={1200} required={Boolean(plan.target.package_id)||v.kind==='O'}>{v.reason??''}</textarea></div>
      <label class="tickbox"><input type="checkbox" name="checked" value="1" required checked={v.checked==='1'}/><span>Overil(a) som registrácie vrátane analytických údajov v SP, všetkých zamestnancov, typ ich vzťahu a úplnosť výkazu. Výkaz nerieši súbežné vzťahy s maximálnym základom, materskú a rodičovskú dovolenku, štrajk, trénerskú či športovú úľavu, sezónnu prácu, náhrady mzdy z vážnych prevádzkových dôvodov ani príjmy za minulé obdobia; také prípady pripravte odborne externe.</span></label>
      <p class="small">Pripravíme úplné XML MVPP 2026. Registráciu RLFO, podanie ani prijatie tento krok nevykoná. Súbor skontrolujte v eSlužbách a výslednú potvrdenku doložte samostatne.</p>
      <button class="btn btn--blue stack__submit" type="submit">Vytvoriť a uložiť XML pre SP</button>
    </form>}
  </div>
}
