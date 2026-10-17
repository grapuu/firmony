import type { FC } from 'hono/jsx'
import type { GenerationPlan } from '../payroll-reporting/generation-store'
import { monthName, dayName } from '../app/copy'
import { formatEurExact } from '../format'
import { Heading } from './inside'

export const PrehladPreparationPage: FC<{ plan: GenerationPlan; base: string; values: Record<string,string>; error?: string }> = ({ plan, base, values: v, error }) => {
  const period = plan.target.period, blocked = plan.totals.issues.length > 0
  const field = (key: string, label: string, max: number, required = true, type = 'text', readOnly = false) => <div class="field"><label class="field__label" for={`overview-${key}`}>{label}</label><input class="field__input" id={`overview-${key}`} name={key} type={type} value={v[key] ?? ''} maxlength={max} required={required} readonly={readOnly} /></div>
  return <div class="filing-work">
    <p><a class="link" href={`${base}/${plan.target.id}`}>Späť na výkaz a potvrdenky</a></p>
    <Heading first="Pripraviť prehľad FS" second={monthName(`${period}-01`)} />
    <p class="info__lead">{plan.company.name} · PREHLADv26 · mzdy, odmeny, náhrady príjmu pri PN a daňový bonus na deti</p>
    {error ? <p class="notice notice--error" role="alert">{error}</p> : null}
    <section class="info"><h2 class="info__title">Úhrny z overených miezd</h2><dl class="kv">
      <div><dt>Zdaniteľné príjmy · riadok 0</dt><dd>{formatEurExact(plan.totals.gross)}</dd></div>
      <div><dt>Zrazené preddavky · riadok 1</dt><dd>{formatEurExact(plan.totals.advance)}</dd></div>
      <div><dt>Posledná overená výplata</dt><dd>{plan.totals.paidOn ? dayName(plan.totals.paidOn, v.declaredOn ?? '') : 'Treba preveriť'}</dd></div>
      <div><dt>Počet zamestnancov v podkladoch</dt><dd>{plan.totals.employees}</dd></div>
    </dl><p class="small">Použijeme uložené uzavreté pásky a účtovníkom potvrdené obdobie. Výplatný termín ani bankový prevod sám neurčujú vykazovaný mesiac. Suma preddavkov nie je potvrdenie ich úhrady.</p></section>
    {blocked ? <section class="info"><h2 class="info__title">Najprv vyriešte podklady</h2><ul>{plan.totals.issues.map((i) => <li>{i}</li>)}</ul><p>Pre tento prípad použite odborné spracovanie a doložte externý výkaz do existujúcej evidencie.</p><a class="btn btn--line" href={base}>Otvoriť mzdové podania</a></section> : <form class="info stack prehlad-form" method="post" action={`${base}/${plan.target.id}/generovat`}>
      <input type="hidden" name="token" value={plan.token} />
      <h2 class="info__title">Skontrolujte hlavičku a rozsah</h2>
      {field('name','Obchodné meno spoločnosti',111,true,'text',true)}
      {field('dic','DIČ',10,true,'text',Boolean(plan.company.dic))}
      <p class="small">Podporovaná právna forma: slovenská spoločnosť s ručením obmedzeným (112).</p>
      {field('street','Ulica',30,false)}{field('number','Súpisné / orientačné číslo',11,false)}{field('postal','PSČ',5)}{field('city','Obec',60)}
      <div class="field"><label class="field__label" for="overview-kind">Druh prehľadu</label><select class="field__input" id="overview-kind" name="kind" required><option value="">Zvoľte podľa skutočného stavu</option><option value="R" selected={v.kind==='R'}>Riadny</option><option value="O" selected={v.kind==='O'}>Opravný</option></select></div>
      {field('foundOn','Dátum zistenia chyby · iba pri opravnom prehľade',10,false,'date')}
      <div class="field"><label class="field__label" for="overview-representation">Kto podáva prehľad</label><select class="field__input" id="overview-representation" name="representation" required><option value="">Zvoľte oprávneného podávateľa</option><option value="company" selected={v.representation==='company'}>Spoločnosť priamo</option><option value="firmony" selected={v.representation==='firmony'}>europio ako splnomocnený zástupca</option></select><p class="small">Zastúpenie europio vyžaduje skontrolovanú plnú moc. Iný druh zastúpenia pripravte odborne externe.</p></div>
      {field('preparedBy','Vypracoval(a)',100)}{field('phone','Kontaktný telefón',13,false,'tel')}{field('email','Kontaktný e-mail',254,false,'email')}{field('declaredOn','Dátum vypracovania',10,true,'date')}
      {field('reference','Referencia odbornej kontroly úplnosti',240)}
      <div class="field"><label class="field__label" for="overview-reason">Dôvod a rozsah ďalšej verzie{plan.target.package_id ? '' : ' · voliteľné'}</label><textarea class="field__input field__area" id="overview-reason" name="reason" maxlength={1200} minlength={plan.target.package_id ? 12 : undefined} required={Boolean(plan.target.package_id)}>{v.reason ?? ''}</textarea></div>
      <label class="tickbox"><input type="checkbox" name="checked" value="1" required checked={v.checked==='1'} /><span>Overil(a) som firmu, zastúpenie, obdobie a všetky príjmy. Prehľad nerieši zahraničné a nepeňažné príjmy, daňový bonus na zaplatené úroky, opravy za minulé obdobia ani žiadosť o vyplatenie bonusu nad preddavky (oddiel III); také prípady doplňte odborne. Všetky údaje prehľadu sú úplné.</span></label>
      <p class="small">Vznikne presné XML na odbornú kontrolu a podanie na portáli finančnej správy. Odoslanie a výslednú potvrdenku evidujte samostatne pri tomto súbore.</p>
      <button class="btn btn--blue stack__submit" type="submit">Vytvoriť a uložiť XML prehľadu</button>
    </form>}
  </div>
}
