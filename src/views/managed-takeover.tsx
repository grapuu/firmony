import type { FC } from 'hono/jsx'
import type { Company } from '../app/store'
import type { Paper } from '../app/papers'
import { dayName } from '../app/copy'
import { AREA_KEYS, CHECK_AREAS, HANDOVER_CONSENT, HANDOVER_STATES, mayMove, type HandoverRequestValues } from '../migration/model'
import type { ManagedHandover, HandoverUpdate } from '../migration/store'

const moment = new Intl.DateTimeFormat('sk-SK',{timeZone:'Europe/Bratislava',dateStyle:'medium',timeStyle:'short'})
const whenName = (seconds: number, _now: number) => moment.format(new Date(seconds * 1000))

/** A mail link never silently changes the session company while another tab may still hold a form. */
export const TakeoverCompanyChoice: FC<{company:{id:string;name:string}}> = ({company}) => <section class="info stack managed-takeover" data-takeover-company-choice>
  <h1 class="info__title">Upozornenie patrí inej Vašej firme</h1>
  <p>Otvoríte prehľad firmy <strong>{company.name}</strong>. Tam uvidíte aktuálnu požiadavku a priebeh prevzatia.</p>
  <form method="post" action="/app/firma/prepnut"><input type="hidden" name="firma" value={company.id} /><button class="btn btn--blue" type="submit">Otvoriť túto firmu</button></form>
  <a class="link" href="/app">Zostať v aktuálnej firme</a>
</section>

export interface ClientTakeoverProps {
  company: Company; h: ManagedHandover | null; owner: boolean; open: boolean; submission: string; now: number
  values?: HandoverRequestValues; errors?: string[]
}
export const ClientTakeover: FC<ClientTakeoverProps> = ({company,h,owner,open,submission,now,values,errors}) => (
  <section class="info managed-takeover" id="koordinacia" aria-labelledby="koordinacia-t">
    <h2 class="info__title" id="koordinacia-t">Prechod vybavíme s Vami</h2>
    <p class="info__lead">Dajte nám kontakt na doterajšiu účtovníčku. Dohodneme s ňou odovzdanie a skontrolujeme podklady. Vy sa zapojíte pri potrebnom podpise alebo otázke, ktorú za Vás nevieme rozhodnúť.</p>
    {errors?.length ? <div class="notice notice--error" role="alert"><ul>{errors.map(e => <li>{e}</li>)}</ul></div> : null}
    {h ? <>
      <p><strong>{HANDOVER_STATES[h.state]}</strong></p>
      <p>{h.contactName}, {h.contactEmail}. Aktualizované {whenName(h.updatedAt,now)}.</p>
      {h.responsibleName ? <p>Zodpovedá {h.responsibleName}{h.dueOn && h.state !== 'completed' && h.state !== 'cancelled' ? `. Ďalší krok Firmony do ${dayName(h.dueOn)}.` : '.'}</p> : h.state !== 'cancelled' ? <p>Žiadosť čaká na prevzatie pridelenou účtovníčkou.</p> : null}
      {h.publicNote ? <p class="managed-takeover__text">{h.publicNote}</p> : null}
      {h.clientAction && h.state !== 'cancelled' ? <div class="notice" role="status"><p><strong>Od Vás potrebujeme</strong></p><p class="managed-takeover__text">{h.clientAction}</p><a class="btn btn--blue" href="/app/spravy">Odpovedať účtovníčke</a></div> : null}
      {h.state === 'completed' ? <p>Účtovníčka potvrdila kontrolu prevzatých podkladov a nadväznosti knihy. Toto potvrdenie sa týka prevzatia, nie všetkých budúcich povinností firmy.</p> : null}
      <details><summary>Rozsah Vašej žiadosti</summary><p>{h.consentText}</p><p>Potvrdil/a {h.requesterName}, {whenName(h.createdAt,now)}. Verzia {h.consentVersion}.</p></details>
      {owner && open && !['cancelled','completed'].includes(h.state) ? <form method="post" action="/app/prechod/odvolat" class="managed-takeover__cancel">
        <input type="hidden" name="firma" value={company.id} /><input type="hidden" name="ziadost" value={h.id} /><input type="hidden" name="verzia" value={h.revision} />
        <p class="field__hint">Odvolanie zastaví ďalšiu koordináciu. Už vykonané úkony tým nevráti späť.</p><button class="btn btn--line" type="submit">Odvolať koordináciu</button>
      </form> : null}
    </> : null}
    {(!h || h.state === 'cancelled') && open && owner ? <form method="post" action="/app/prechod/poverit" class="stack managed-takeover__request">
      <input type="hidden" name="firma" value={company.id} /><input type="hidden" name="odoslanie" value={submission} />
      <label class="field" for="prechod-meno"><span class="field__label">Meno účtovníčky alebo kancelárie</span><input class="field__input" id="prechod-meno" name="meno" value={values?.name ?? ''} maxlength={120} required autocomplete="off" /></label>
      <label class="field" for="prechod-email"><span class="field__label">Jej e-mail</span><input class="field__input" id="prechod-email" name="email" value={values?.email ?? ''} type="email" maxlength={254} required autocomplete="off" /></label>
      <label class="field" for="prechod-den"><span class="field__label">Požadovaný deň prevzatia, ak ho poznáte</span><input class="field__input" id="prechod-den" name="den" value={values?.day ?? ''} type="date" /><span class="field__hint">Termín ešte potvrdíme podľa Vašej doterajšej zmluvy a pripravenosti podkladov.</span></label>
      <details><summary>Čo nám zadávate</summary><p>{HANDOVER_CONSENT}</p></details>
      <label class="tickbox" for="prechod-suhlas"><input id="prechod-suhlas" type="checkbox" name="suhlas" value="ano" required /><span>Za firmu {company.name} žiadam o koordináciu v uvedenom rozsahu a potvrdzujem, že ju môžem zadať.</span></label>
      <button class="btn btn--blue stack__submit" type="submit">Poveriť Firmony koordináciou</button>
      <p class="field__hint">Táto žiadosť sama neukončí pôvodnú zmluvu. Potrebný podpis alebo plnomocenstvo s Vami vybavíme osobitne.</p>
    </form> : !owner && !h ? <p>Koordináciu môže zadať vlastník firemného účtu. Požiadajte ho o tento krok.</p> : !open ? <p>Po skončení služby sa nové prevzatie nezačína. Ak potrebujete pomoc, napíšte nám v Správach.</p> : null}
  </section>
)

export interface TeamTakeoverProps {
  company: Company; h: ManagedHandover | null; files: Paper[]; revision: number; open: boolean; now: number
  history: { revision:number; at:number; by_name:string; data:string }[]
  values?: HandoverUpdate
}
export const TeamTakeover: FC<TeamTakeoverProps> = ({company,h,files,revision,open,now,history,values}) => {
  if (!h) return <section class="info managed-takeover" id="koordinacia"><h2 class="info__title">Spravovaný prechod</h2><p>Klient zatiaľ nezadal koordináciu na /app/prechod. Existujúce importy môžete používať ďalej.</p></section>
  const base = `/ucto/klienti/${company.id}/prevzatie/prechod`
  const v = values ?? {state:h.state,due:h.dueOn ?? '',authority:h.authorityReference,contact:h.contactReference,contactOn:h.contactOn ?? '',note:h.publicNote,action:h.clientAction,reason:'',checks:h.checks,sourceRevision:revision}
  const writable = open && h.state !== 'cancelled'
  return <section class="info managed-takeover" id="koordinacia" aria-labelledby="koordinacia-t">
    <h2 class="info__title" id="koordinacia-t">Spravovaný prechod</h2>
    <p><strong>{HANDOVER_STATES[h.state]}</strong>. Žiadosť od {h.requesterName}, {whenName(h.createdAt,now)}.</p>
    <p>Kontakt: {h.contactName}, <a class="link" href={`mailto:${h.contactEmail}`}>{h.contactEmail}</a>{h.requestedOn ? `. Požadované prevzatie ${dayName(h.requestedOn)}.` : '.'}</p>
    <p>Zodpovedá {h.responsibleName ?? 'zatiaľ nikto'}{h.dueOn ? `, ďalší krok do ${dayName(h.dueOn)}` : ''}. Stav aj verejnú poznámku vidí klient.</p>
    <details><summary>Potvrdený rozsah koordinácie</summary><p>{h.consentText}</p><p>Verzia {h.consentVersion}. Pred zastupovaním overte konkrétne oprávnenie, jeho rozsah, podpis a prípadné odvolanie.</p></details>
    {writable ? <>
      {h.authorityReference && h.state !== 'requested' ? <p><a class="link" href={`${base}/ziadost.txt`}>Pripravený text žiadosti o podklady</a>. Text sa sám neodosiela; skutočný kontakt zapíšte s dôkazom. Súbory prevezmite dohodnutou bezpečnou cestou a uložte ich nižšie.</p> : null}
      <form class="stack" method="post" action={`${base}/stav`}>
        <input type="hidden" name="firma" value={company.id} /><input type="hidden" name="ziadost" value={h.id} /><input type="hidden" name="verzia" value={h.revision} /><input type="hidden" name="podklady_verzia" value={revision} />
        <label class="field" for="prevzatie-stav"><span class="field__label">Ďalší stav</span><select class="field__input" id="prevzatie-stav" name="stav">{Object.entries(HANDOVER_STATES).filter(([k]) => mayMove(h.state,k as ManagedHandover['state'])).map(([k,label]) => <option value={k} selected={k === v.state}>{label}</option>)}</select></label>
        <label class="field" for="prevzatie-termin"><span class="field__label">Termín ďalšieho kroku Firmony</span><input class="field__input" id="prevzatie-termin" type="date" name="termin" value={v.due} required /></label>
        <label class="field" for="prevzatie-opravnenie"><span class="field__label">Overené oprávnenie a jeho podklad</span><textarea class="field__input field__area" id="prevzatie-opravnenie" name="opravnenie" maxlength={1000} rows={3}>{v.authority}</textarea><span class="field__hint">Kto smie konať, na aký úkon, z čoho a kedy ste to overili. Daňová plná moc nemusí pokrývať prevzatie alebo výpoveď.</span></label>
        <label class="field" for="prevzatie-kontakt-den"><span class="field__label">Dátum uskutočneného kontaktovania</span><input class="field__input" id="prevzatie-kontakt-den" type="date" name="kontakt_den" value={v.contactOn} /></label>
        <label class="field" for="prevzatie-kontakt"><span class="field__label">Dôkaz kontaktovania</span><textarea class="field__input field__area" id="prevzatie-kontakt" name="kontakt" maxlength={1000} rows={3}>{v.contact}</textarea><span class="field__hint">Kanál, adresát a konkrétny identifikátor správy alebo zápisu. Odoslanie samo nepotvrdzuje prijatie podkladov.</span></label>
        <label class="field" for="prevzatie-poznamka"><span class="field__label">Priebeh pre klienta</span><textarea class="field__input field__area" id="prevzatie-poznamka" name="verejne" maxlength={1000} rows={3}>{v.note}</textarea></label>
        <label class="field" for="prevzatie-otazka"><span class="field__label">Čo potrebujeme od klienta</span><textarea class="field__input field__area" id="prevzatie-otazka" name="od_klienta" maxlength={1000} rows={3}>{v.action}</textarea><span class="field__hint">Prázdne, ak nič nepotrebujete. Po vybavení vymažte. Prečítaná správa sama otázku nevybaví.</span></label>
        <details open={h.state === 'reviewing' || h.state === 'completed'}><summary>Kontrola úplnosti a nadväznosti</summary>
          <p>Každú oblasť posúďte. Pri prevzatí vyberte jej originál; pri nepoužitej oblasti zapíšte konkrétny dôvod. Uloženie súboru ešte neznamená import. Počiatočné stavy skontrolujte v účtovnej knihe.</p>
          {AREA_KEYS.map(k => <fieldset class="managed-takeover__check"><legend>{CHECK_AREAS[k]}</legend>
            <label class="field" for={`prevzatie-${k}-stav`}><span class="field__label">Výsledok</span><select class="field__input" id={`prevzatie-${k}-stav`} name={`stav_${k}`}>{Object.entries({pending:'Čaká na kontrolu',received:'Prevzaté a skontrolované',not_applicable:'Netýka sa firmy'}).map(([key,label]) => <option value={key} selected={v.checks[k].result === key}>{label}</option>)}</select></label>
            <label class="field" for={`prevzatie-${k}-subor`}><span class="field__label">Podklad</span><select class="field__input" id={`prevzatie-${k}-subor`} name={`subor_${k}`}><option value="">Vyberte podklad</option>{files.map(f => <option value={f.id} selected={v.checks[k].file === f.id}>{f.fileName}</option>)}</select></label>
            <label class="field" for={`prevzatie-${k}-poznamka`}><span class="field__label">Čo ste overili alebo prečo sa netýka</span><textarea class="field__input field__area" id={`prevzatie-${k}-poznamka`} name={`poznamka_${k}`} maxlength={1000} rows={2}>{v.checks[k].note}</textarea></label>
          </fieldset>)}
        </details>
        <label class="field" for="prevzatie-dovod"><span class="field__label">Záznam tejto zmeny</span><textarea class="field__input field__area" id="prevzatie-dovod" name="dovod" maxlength={1000} minlength={10} rows={3} required>{v.reason}</textarea><span class="field__hint">História s Vaším menom je súčasťou klientovho exportu. Interné AML oznámenia patria iba do Identifikácie a rizika. Pri návrate z dokončenia vysvetlite, čo treba znovu preveriť.</span></label>
        <button class="btn btn--blue stack__submit" type="submit">Uložiť overený priebeh</button>
      </form>
      {!['completed','cancelled'].includes(h.state) ? <form class="stack managed-takeover__files" method="post" action={`${base}/podklady`} enctype="multipart/form-data">
        <input type="hidden" name="firma" value={company.id} /><input type="hidden" name="ziadost" value={h.id} /><input type="hidden" name="verzia" value={h.revision} />
        <label class="field" for="prevzatie-podklady"><span class="field__label">Podklady prijaté účtovníčkou</span><input class="field__input" id="prevzatie-podklady" type="file" name="file" multiple required /></label>
        <p class="field__hint">Najviac 10 súborov naraz. PDF, export ZIP/XML/CSV/Excel alebo fotografie. Údaje pôvodnej účtovníčky sa tým ešte nezaúčtujú.</p><button class="btn btn--line" type="submit">Uložiť prijaté podklady</button>
      </form> : null}
    </> : <p>Táto evidencia je iba na čítanie. Odvolaná koordinácia sa neobnovuje bez novej žiadosti klienta.</p>}
    {files.length ? <ul class="plain">{files.map(f => <li class="plain__row plain__row--two"><a class="link plain__name" href={`/ucto/klienti/${company.id}/prevzatie/${f.id}`}>{f.fileName}</a></li>)}</ul> : null}
    <details><summary>História koordinácie</summary><ol class="managed-takeover__history">{history.map(e => {const data = JSON.parse(e.data) as {state:ManagedHandover['state'];reason:string}; return <li><strong>{HANDOVER_STATES[data.state]}</strong><p>{whenName(e.at,now)}, {e.by_name}. Verzia {e.revision}.</p><p class="managed-takeover__text">{data.reason || 'Žiadosť klienta bola prijatá.'}</p></li>})}</ol></details>
  </section>
}
