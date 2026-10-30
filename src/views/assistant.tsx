import type { FC } from 'hono/jsx'
import { ASSISTANT, ASSISTANT_TOPICS, type AssistantAnswer } from '../assistant/model'
import type { AssistantDocument } from '../assistant/context'
import type { assistantControl } from '../assistant/store'
import { Heading } from './inside'

const date=new Intl.DateTimeFormat('sk-SK',{timeZone:'Europe/Bratislava',dateStyle:'medium',timeStyle:'short'})
export const AssistantPage:FC<{company:{id:string;name:string};base:string;context:string;documents:AssistantDocument[];available:boolean;
  answer?:AssistantAnswer;question?:string;document?:string;error?:string;submission?:string;team?:boolean}>=
  ({company,base,context,documents,available,answer,question='',document='',error,submission,team=false})=><>
  <header class="phead"><Heading first="Asistent Firmony" /><p class="phead__lead">Zistite stav dokladu, potrebné doplnenie alebo ďalší krok pre firmu {company.name}.</p></header>
  <section class="info stack assistant" aria-labelledby="asistent-otazka">
    <h2 class="info__title" id="asistent-otazka">S čím Vám pomôžeme?</h2>
    <form class="stack" action={`${base}#odpoved`} method="post" data-assistant-form novalidate>
      <input type="hidden" name="firma" value={company.id} /><input type="hidden" name="odoslanie" value={submission??crypto.randomUUID()} />
      <input type="hidden" name="kontext" value={context} />
      <label class="field" for="asistent-text"><span class="field__label">Vaša otázka</span>
        <textarea class="field__input field__area" id="asistent-text" name="otazka" rows={3} maxlength={ASSISTANT.questionChars} required aria-label="Vaša otázka" aria-describedby="asistent-sukromie" aria-invalid={error?'true':undefined}>{question}</textarea></label>
      <label class="field" for="asistent-doklad"><span class="field__label">Doklad, ak sa ho otázka týka</span>
        <select class="field__input" id="asistent-doklad" name="doklad" aria-label="Doklad, ak sa ho otázka týka"><option value="">Bez konkrétneho dokladu</option>
          {documents.map(d=><option value={d.id} selected={d.id===document}>{d.label}</option>)}
        </select></label>
      <p class="field__hint" id="asistent-sukromie">Pri otázke vlastnými slovami pošleme spoločnosti Anthropic iba jej text. Doklady, výpisy a ďalšie údaje firmy do tohto volania neposielame. Nepíšte heslá ani zbytočné osobné údaje. <a class="link" href="/pravne-informacie#asistent">Podrobnosti o spracovaní</a>.</p>
      {error?<p class="notice notice--error" role="alert">{error}</p>:null}
      {!available?<p class="notice">Softvér teraz nie je dostupný. Rýchle otázky nižšie čítajú stav priamo z aplikácie a fungujú ďalej.</p>:null}
      <div class="assistant__actions"><button class="btn btn--blue" type="submit" disabled={!available}>Opýtať sa softvéru</button>
        {!team?<button class="btn btn--line" type="submit" formaction="/app/asistent/odovzdat">Pripraviť otázku účtovníčke</button>:null}
        <a class="link" href={base}>Nová otázka</a></div>
      <p class="field__hint assistant__pending" role="status" aria-live="polite" hidden>Spracúvame Vašu otázku. Odpoveď načítame z aktuálnych údajov firmy.</p>
    </form>
    <details><summary>Čo asistent vie a kde pomôže účtovníčka</summary><p>Asistent vysvetlí evidovaný stav a ukáže zdroj aj čas načítania. Neurčuje daň, nevykonáva platby, nemení knihy, nič nepodpisuje a nepodáva. Odbornú otázku pripravíte účtovníčke na kontrolu. Text tejto otázky ani rozhovor v aplikácii neukladáme; správu účtovníčke uložíme až po Vašom odoslaní.</p></details>
  </section>
  {answer?<section class="info stack assistant" id="odpoved" aria-labelledby="asistent-odpoved" data-assistant-answer>
    <h2 class="info__title" id="asistent-odpoved">{answer.title}</h2>
    <p class="field__hint">Načítané {date.format(new Date(answer.at*1000))} pre firmu {company.name}.</p>
    {answer.paragraphs.map(p=><p>{p}</p>)}
    <ul class="assistant__sources">{answer.sources.map(s=><li><a class="link" href={s.href}>{s.title}</a><p>{s.detail}</p></li>)}</ul>
  </section>:null}
  <section class="info stack assistant" aria-labelledby="asistent-rychle"><h2 class="info__title" id="asistent-rychle">Rýchle otázky</h2>
    <p>Odpoveď z údajov aplikácie bez odoslania otázky do softvéru.</p>
    <ul class="assistant__topics">{Object.entries(ASSISTANT_TOPICS).filter(([k])=>k!=='expert').map(([k,label])=><li><a class="btn btn--line" href={`${base}?tema=${k}${document?`&doklad=${document}`:''}#odpoved`}>{label}</a></li>)}</ul>
  </section>
  {!team?<section class="info stack assistant"><h2 class="info__title">Potrebuje to odbornú odpoveď?</h2>
    <p>Pripravíme správu s Vašou otázkou. Pred odoslaním ju skontrolujete a môžete doplniť.</p>
    <a class="link" href="#asistent-text">Napísať alebo doplniť otázku</a>
  </section>:null}
</>

export const AssistantControl:FC<{control:Awaited<ReturnType<typeof assistantControl>>;error?:string;flash?:boolean}>=({control,error,flash})=><>
  <header class="phead"><Heading first="Prevádzka asistenta" /><p class="phead__lead">Riadenie cloudových otázok. Rýchle otázky z údajov aplikácie fungujú aj pri vypnutí softvéru.</p></header>
  <section class="info stack assistant"><h2 class="info__title">Cloudové otázky sú {control.enabled?'zapnuté':'vypnuté'}</h2>
    {flash?<p class="notice" role="status">Nastavenie bolo uložené.</p>:null}{error?<p class="notice notice--error" role="alert">{error}</p>:null}
    <p>Dnes rezervované volania: {control.calls} z {ASSISTANT.globalDaily}. Rozpracované: {control.pending}. Nepotvrdené výsledky: {control.failed}.</p>
    <p>Zaznamenané vstupné tokeny: {control.input}. Výstupné: {control.output}. Volania bez potvrdeného merania: {control.unknown}.</p>
    <p>Limit na používateľa je {ASSISTANT.userDaily} a na firmu {ASSISTANT.companyDaily} volaní denne. Aj neúspešná alebo neistá rezervácia sa počíta. Ide o limity použitia, nie o vyčíslenú cenu dodávateľa.</p>
    <form method="post" action="/ucto/ai/asistent"><input type="hidden" name="zapnute" value={control.enabled?'nie':'ano'} />
      <button class="btn btn--line" type="submit">{control.enabled?'Vypnúť cloudové otázky':'Zapnúť cloudové otázky'}</button></form>
    <a class="link" href="/ucto/ai">Späť na presnosť čítačky dokladov</a>
  </section>
</>
