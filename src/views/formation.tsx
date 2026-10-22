import type { FC } from 'hono/jsx'
import type { Company } from '../app/store'
import { FORMATION_STATES, STEP_KEYS, FORMATION_STEPS, mayMove, type FormationRequestValues } from '../formation/model'
import type { FormationCase } from '../formation/store'
import { dayName } from '../app/copy'

const moment = new Intl.DateTimeFormat('sk-SK',{timeZone:'Europe/Bratislava',dateStyle:'medium',timeStyle:'short'})
const whenName = (seconds: number) => moment.format(new Date(seconds * 1000))

export const ClientFormation: FC<{ company: Company; f: FormationCase | null; owner: boolean; submission: string; values?: FormationRequestValues; errors?: string[] }> = ({ company, f, owner, submission, values, errors }) => (
  <section class="info managed-takeover" id="zalozenie" aria-labelledby="zalozenie-t">
    <h2 class="info__title" id="zalozenie-t">Založíme firmu s Vami</h2>
    <p class="info__lead">Zadáte, čo chcete podnikať. My pripravíme dokumenty, vybavíme oprávnenia, zápis do registra aj registrácie. Vy urobíte len nevyhnutné podpisy a potvrdenia. Založenie je v cene, ak u nás vediete účtovníctvo 36 mesiacov.</p>
    {errors?.length ? <div class="notice notice--error" role="alert"><ul>{errors.map(e => <li>{e}</li>)}</ul></div> : null}
    {f ? <>
      <p><strong>{FORMATION_STATES[f.state]}</strong></p>
      <p>Kontakt: {f.contactName}, {f.contactEmail}. Aktualizované {whenName(f.updatedAt)}.</p>
      {f.responsibleName ? <p>Zodpovedá {f.responsibleName}{f.dueOn && f.state !== 'completed' && f.state !== 'cancelled' ? `. Ďalší krok Firmony do ${dayName(f.dueOn)}.` : '.'}</p> : f.state !== 'cancelled' ? <p>Žiadosť čaká na prevzatie pridelenou účtovníčkou.</p> : null}
      {f.publicNote ? <p class="managed-takeover__text">{f.publicNote}</p> : null}
      {f.clientAction && f.state !== 'cancelled' ? <div class="notice" role="status"><p><strong>Od Vás potrebujeme</strong></p><p class="managed-takeover__text">{f.clientAction}</p><a class="btn btn--blue" href="/app/spravy">Odpovedať účtovníčke</a></div> : null}
      {f.state === 'completed' ? <p>Firma je zapísaná do Obchodného registra. Aktivujeme účtovníctvo a ďalšie povinnosti.</p> : null}
      <details><summary>Rozsah Vašej žiadosti</summary><p>{f.consentText}</p><p>Potvrdil/a {f.requesterName}, {whenName(f.createdAt)}. Verzia {f.consentVersion}.</p></details>
      {owner && !['cancelled','completed'].includes(f.state) ? <form method="post" action="/app/zalozenie/zrusit" class="managed-takeover__cancel">
        <input type="hidden" name="firma" value={company.id} /><input type="hidden" name="ziadost" value={f.id} /><input type="hidden" name="verzia" value={f.revision} />
        <p class="field__hint">Zrušenie zastaví ďalšiu koordináciu. Už vykonané úkony tým nevráti späť.</p><button class="btn btn--line" type="submit">Zrušiť koordináciu</button>
      </form> : null}
    </> : owner ? <form method="post" action="/app/zalozenie" class="stack">
      <input type="hidden" name="odoslanie" value={submission} />
      <label class="field" for="zalozenie-meno"><span class="field__label">Meno a priezvisko kontaktnej osoby</span><input class="field__input" id="zalozenie-meno" name="meno" maxlength={120} value={values?.name ?? ''} required /></label>
      <label class="field" for="zalozenie-email"><span class="field__label">E-mail</span><input class="field__input" id="zalozenie-email" name="email" type="email" maxlength={254} value={values?.email ?? ''} required /></label>
      <label class="field" for="zalozenie-predmet"><span class="field__label">Čo chcete podnikať</span><textarea class="field__input field__area" id="zalozenie-predmet" name="predmet" maxlength={1000} rows={3} required>{values?.idea ?? ''}</textarea></label>
      <label class="tickbox"><input type="checkbox" name="suhlas" value="1" required /><span>Súhlasím s koordináciou založenia a s 36-mesačnou dobou vedenia účtovníctva. Založenie je v cene pri dodržaní tejto doby; pri skoršom odchode sa dopočíta.</span></label>
      <button class="btn btn--blue stack__submit" type="submit">Odoslať žiadosť</button>
    </form> : <p>Žiadosť o založenie zadáva vlastník firemného účtu.</p>}
  </section>
)

export const TeamFormation: FC<{ company: Company; f: FormationCase; base: string }> = ({ company, f, base }) => (
  <section class="info managed-takeover" aria-labelledby="zalozenie-t">
    <h2 class="info__title" id="zalozenie-t">Založenie firmy {company.name}</h2>
    <p><strong>{FORMATION_STATES[f.state]}</strong>. Žiadateľ {f.requesterName}, kontakt {f.contactName} ({f.contactEmail}).</p>
    <p class="managed-takeover__text">Predstava: {f.idea}</p>
    {['cancelled','completed'].includes(f.state) ? <p>Táto evidencia je iba na čítanie.</p> : <form method="post" action={base} class="stack">
      <input type="hidden" name="ziadost" value={f.id} /><input type="hidden" name="verzia" value={f.revision} />
      <label class="field" for="zalozenie-stav"><span class="field__label">Stav</span><select class="field__input" id="zalozenie-stav" name="stav">{Object.entries(FORMATION_STATES).filter(([k]) => k !== 'cancelled' && (k === f.state || mayMove(f.state, k as never))).map(([k, label]) => <option value={k} selected={k === f.state}>{label}</option>)}</select></label>
      <label class="field" for="zalozenie-termin"><span class="field__label">Ďalší termín (dátum)</span><input class="field__input" id="zalozenie-termin" name="termin" type="date" /></label>
      <label class="field" for="zalozenie-opravnenie"><span class="field__label">Overené oprávnenie (referencia podkladu)</span><input class="field__input" id="zalozenie-opravnenie" name="opravnenie" maxlength={240} /></label>
      <details><summary>Kontrolný zoznam založenia</summary>
        {STEP_KEYS.map(k => <fieldset class="managed-takeover__check"><legend>{FORMATION_STEPS[k]}</legend>
          <label class="field" for={`zalozenie-${k}-stav`}><span class="field__label">Výsledok</span><select class="field__input" id={`zalozenie-${k}-stav`} name={`krok_${k}`}>{Object.entries({pending:'Čaká',received:'Hotové',not_applicable:'Netýka sa'}).map(([key,label]) => <option value={key} selected={f.steps[k].result === key}>{label}</option>)}</select></label>
          <label class="field" for={`zalozenie-${k}-poznamka`}><span class="field__label">Čo ste overili</span><textarea class="field__input field__area" id={`zalozenie-${k}-poznamka`} name={`poznamka_${k}`} maxlength={1000} rows={2}>{f.steps[k].note}</textarea></label>
        </fieldset>)}
      </details>
      <label class="field" for="zalozenie-otazka"><span class="field__label">Čo potrebujete od klienta (prázdne, ak nič)</span><textarea class="field__input field__area" id="zalozenie-otazka" name="otazka" maxlength={1000} rows={2}>{f.clientAction}</textarea></label>
      <label class="field" for="zalozenie-dovod"><span class="field__label">Záznam tejto zmeny</span><textarea class="field__input field__area" id="zalozenie-dovod" name="dovod" maxlength={1000} minlength={10} rows={3} required>{f.reason}</textarea></label>
      <button class="btn btn--blue stack__submit" type="submit">Uložiť overený priebeh</button>
    </form>}
  </section>
)

