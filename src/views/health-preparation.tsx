import type { FC } from 'hono/jsx'
import type { HealthPlan } from '../payroll-reporting/health-store'
import type { User } from '../app/store'
import { REPORT_KINDS } from '../payroll-reporting/model'
import { formatEurExact } from '../format'
import { monthName, dayName } from '../app/copy'
import { Heading } from './inside'

export const HealthPreparationPage:FC<{plan:HealthPlan;base:string;user:User;values:Record<string,string>;error?:string}> = ({plan,base,user,values:v,error}) => {
  const field=(key:string,label:string,max:number,required=true,type='text',readOnly=false)=><div class="field"><label class="field__label" for={`health-${key}`}>{label}</label><input class="field__input" id={`health-${key}`} name={key} type={type} maxlength={max} required={required} readonly={readOnly} value={v[key]??''}/></div>
  return <div class="filing-work">
    <p><a class="link" href={`${base}/${plan.target.id}`}>Späť na výkaz a potvrdenky</a></p>
    <Heading first="Pripraviť zdravotný výkaz" second={monthName(`${plan.target.period}-01`)}/>
    <p class="info__lead">{plan.company.name} · {REPORT_KINDS[plan.target.kind]} · dávka 514</p>
    {error?<p class="notice notice--error" role="alert">{error}</p>:null}
    <section class="info"><h2 class="info__title">Úhrny z uzavretých miezd</h2><dl class="kv">
      <div><dt>Zamestnanci tejto poisťovne</dt><dd>{plan.totals.rows.length}</dd></div>
      <div><dt>Preddavky zamestnávateľa</dt><dd>{formatEurExact(plan.totals.employer)}</dd></div>
      <div><dt>Preddavky zamestnancov vrátane dopočtu</dt><dd>{formatEurExact(plan.totals.employee)}</dd></div>
      <div><dt>Spolu na zdravotné poistenie</dt><dd>{formatEurExact(plan.totals.total)}</dd></div>
      <div><dt>Určený výplatný termín</dt><dd>{dayName(plan.closure.payday,v.sendOn??'')}</dd></div>
    </dl><p class="small">Sumy a režim poistenia preberáme z uzavretých pások. Nezamieňame určený výplatný termín so skutočnou bankovou úhradou.</p></section>
    {plan.totals.rows.length?<section class="info" id="poistenci"><h2 class="info__title">Overení poistenci</h2><p>Rodné číslo preberte z overeného podkladu bez lomky. Z dátumu narodenia ho nevytvárame. Uložený údaj použijeme aj nabudúce; zahraničné a osobitné identifikátory pripravte odborne externe.</p>
      {plan.totals.rows.map((row,i)=>{const id=plan.identities.find((x)=>x.employee_id===row.employeeId), editing=v.employee===row.employeeId
        return <details class="info health-identity" open={!id||editing}><summary>{row.name} · {id?`overené, končí ${id.identifier.slice(-4)}`:'treba overiť identifikátor'}</summary>
          {id?<p class="small">Referencia overenia: {id.reference}. Oprava zachová pôvodný údaj a otvorí preverenie výkazov vytvorených z neho.</p>:null}
          {!plan.frozen&&(!id||user.team==='admin')?<form class="stack health-id-form" method="post" action={`${base}/${plan.target.id}/poistenec`}>
            <input type="hidden" name="employee" value={row.employeeId}/><input type="hidden" name="revision" value={id?.revision??0}/>
            <div class="field"><label class="field__label" for={`insured-${i}`}>Rodné číslo bez lomky{id?' · nový overený údaj':''}</label><input class="field__input" id={`insured-${i}`} name="identifier" inputmode="numeric" pattern="[0-9]{9,10}" minlength={9} maxlength={10} autocomplete="off" required value={editing?v.identifier??'':''}/></div>
            <div class="field"><label class="field__label" for={`insured-ref-${i}`}>Referencia overeného podkladu</label><input class="field__input" id={`insured-ref-${i}`} name="reference" minlength={12} maxlength={240} required value={editing?v.identityReference??'':''}/></div>
            {id?<div class="field"><label class="field__label" for={`insured-reason-${i}`}>Dôvod opravy</label><textarea class="field__input field__area" id={`insured-reason-${i}`} name="reason" minlength={12} maxlength={1200} required>{editing?v.identityReason??'':''}</textarea></div>:null}
            <label class="tickbox"><input type="checkbox" name="checked" value="1" required/><span>Overil(a) som totožnosť, identifikátor a jeho priradenie k tomuto zamestnancovi podľa uvedeného podkladu.</span></label>
            <button class="btn btn--line" type="submit">{id?'Uložiť opravu s históriou':'Uložiť overený identifikátor'}</button>
          </form>:<p class="small">{plan.frozen?'Účtovníctvo je uzamknuté na odovzdanie.':'Prípadnú opravu overeného identifikátora vykoná správca.'}</p>}
        </details>
      })}
    </section>:null}
    {plan.issues.length?<section class="info"><h2 class="info__title">Najprv vyriešte podklady</h2><ul>{plan.issues.map((s)=><li>{s}</li>)}</ul><p>Ak prípad presahuje podporovaný rozsah, použite odborné spracovanie a doložte externý výkaz.</p><a class="btn btn--line" href={`${base}/${plan.target.id}`}>Otvoriť evidenciu výkazu</a></section>:<form class="info stack health-report-form" method="post" action={`${base}/${plan.target.id}/generovat`}>
      <input type="hidden" name="token" value={plan.token}/><h2 class="info__title">Skontrolujte hlavičku a rozsah</h2>
      {field('name','Obchodné meno zamestnávateľa',80,true,'text',true)}{field('dic','DIČ',10,Boolean(plan.company.dic),'text',Boolean(plan.company.dic))}
      {field('payer','Číslo platiteľa pridelené poisťovňou · 10 číslic',10)}{field('branch','Kód poisťovne a pobočky · 4 číslice',4)}
      <p class="small">Kód pobočky overte podľa registrácie. Číslo platiteľa ani pobočku neodvodzujeme z IČO.</p>
      {field('iban','Vlastný IBAN zamestnávateľa',34)}{field('phone','Kontaktný telefón · +421 a 9 číslic',13,false,'tel')}{field('email','Kontaktný e-mail',75,false,'email')}
      <div class="field"><label class="field__label" for="health-kind">Charakter dávky</label><select class="field__input" id="health-kind" name="kind" required><option value="">Zvoľte podľa skutočného stavu</option><option value="N" selected={v.kind==='N'}>Nová · prvotný výkaz</option><option value="O" selected={v.kind==='O'}>Opravná · úplná náhrada</option></select><p class="small">Aditívny rozdielový výkaz pripravte odborne externe.</p></div>
      {field('sendOn','Dátum v dávke · plánované odoslanie',10,true,'date')}{field('batch','Poradové číslo dávky za mesiac',6)}{field('reference','Referencia odbornej kontroly úplnosti',240)}
      <div class="field"><label class="field__label" for="health-reason">Dôvod a rozsah ďalšej verzie{plan.target.package_id?'':' · voliteľné'}</label><textarea class="field__input field__area" id="health-reason" name="reason" maxlength={1200} minlength={plan.target.package_id?12:undefined} required={Boolean(plan.target.package_id)}>{v.reason??''}</textarea></div>
      <label class="tickbox"><input type="checkbox" name="checked" value="1" required checked={v.checked==='1'}/><span>Overil(a) som firmu, príjemcu, všetkých poistencov a úplnosť údajov. Výkaz nerieši zmenu poisťovne alebo režimu v mesiaci, materskú, nepeňažné príjmy, viac vzťahov jednej osoby ani príjmy za minulé obdobia; študentov na DoBPŠ a dôchodcov na dohodách nevykazujeme, platí za nich štát. Dni, odpočítateľná položka a prípadná výnimka z minimálneho preddavku sú správne a doložené.</span></label>
      <p class="small">Uložíme jednu textovú dávku UTF-8 s pôvodným názvom pre import do poisťovne. Plánovaný dátum ani vytvorenie súboru nie sú dôkazom odoslania. Výslednú potvrdenku evidujte samostatne.</p>
      <button class="btn btn--blue stack__submit" type="submit">Vytvoriť a uložiť dávku 514</button>
    </form>}
  </div>
}
