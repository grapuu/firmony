import type { FC } from 'hono/jsx'
import { whenName } from '../app/copy'

export interface ProspectReport { id: string; created_at: number; created_by: string; body: string; decided_at: number | null; decision: string | null; decision_note: string | null }
export interface ProspectHold { id: string; created_at: number; until_on: string; reference: string }
export const AmlProspectPanel: FC<{orderId:string;reports:ProspectReport[];holds:ProspectHold[];officer:boolean;today:string;readOnly:boolean;ended:boolean}> = ({orderId,reports,holds,officer,today,readOnly,ended}) => <section class="info stack" aria-labelledby="aml-prospect-reports-t">
  <h2 id="aml-prospect-reports-t" class="info__title">Dôverné interné oznámenia</h2>
  <p>Oznámenie vidí jeho autor a určená osoba. Klientovi sa nezobrazuje. Obsah ani podozrenie neuvádzajte v správe klientovi.</p>
  {!readOnly ? <form class="stack" method="post" action={`/ucto/aml/objednavky/${orderId}/oznamenie`}>
    <label class="field__label" for="aml-prospect-report">Čo ste zistili a prečo je to neobvyklé</label><textarea id="aml-prospect-report" class="field__input field__area" name="text" rows={4} minlength={12} maxlength={6000} required />
    <button class="btn btn--line" type="submit">Poslať určenej osobe</button>
  </form> : null}
  {reports.map((r) => <article class="info"><h3 class="info__title">Oznámenie z {whenName(r.created_at,today)}</h3><p>{r.body}</p>
    {r.decided_at ? <p class="info__source">Posúdené {whenName(r.decided_at,today)}. {r.decision === 'reported' ? 'Ohlásené FSJ.' : 'Neohlásiť.'} {officer ? r.decision_note : null}</p> : officer && !readOnly ? <form class="stack" method="post" action={`/ucto/aml/objednavky/${orderId}/oznamenie/${r.id}`}>
      <label class="field__label" for={`aml-report-${r.id}`}>Rozhodnutie a dôvod alebo referencia na hlásenie FSJ</label><textarea id={`aml-report-${r.id}`} class="field__input field__area" name="dovod" rows={3} minlength={12} maxlength={2000} required />
      <div class="decl__buttons"><button class="btn btn--line" type="submit" name="rozhodnutie" value="reported">Ohlásené FSJ</button><button class="btn btn--line" type="submit" name="rozhodnutie" value="not">Neohlásiť s odôvodnením</button></div>
    </form> : <p>Čaká na posúdenie určenej osoby.</p>}
  </article>)}
  {officer ? <>
    <h3 class="info__title">Písomná žiadosť FSJ o dlhšie uchovanie</h3>
    {holds.map((h) => <p>{h.reference}. Uchovanie do {h.until_on}. <a class="link" href={`/ucto/aml/objednavky/${orderId}/uchovanie/${h.id}`}>Pôvodná žiadosť</a></p>)}
    {ended && !readOnly ? <form class="stack" method="post" enctype="multipart/form-data" action={`/ucto/aml/objednavky/${orderId}/uchovanie`}>
      <label class="field__label" for="aml-hold-ref">Referencia na písomnú žiadosť FSJ</label><input id="aml-hold-ref" class="field__input" name="referencia" minlength={12} maxlength={1000} required />
      <label class="field__label" for="aml-hold-until">Dokedy FSJ žiada uchovanie</label><input id="aml-hold-until" class="field__input" name="do" type="date" required />
      <label class="field__label" for="aml-hold-file">Pôvodná žiadosť ako PDF alebo ASiC-E</label><input id="aml-hold-file" class="field__input" name="subor" type="file" accept=".pdf,.asice" required />
      <button class="btn btn--line" type="submit">Zaznamenať predĺženie uchovania</button>
    </form> : null}
    {!readOnly ? <form class="stack" method="post" action={`/ucto/aml/objednavky/${orderId}/odmietnut`}><p>Pri ukončení rokovania zostanú podklady uchované päť rokov. Klientovi sa dôvody interného posúdenia neoznamujú.</p><label class="field__label" for="aml-refusal-note">Dôvod a písomné posúdenie NOO, pri ohlásení referencia na hlásenie FSJ</label><textarea id="aml-refusal-note" class="field__input field__area" name="dovod" rows={4} minlength={12} maxlength={2000} required /><label class="field__label" for="aml-refusal-assessment">Výsledok posúdenia</label><select id="aml-refusal-assessment" class="field__input" name="posudenie" required><option value="">Vyberte</option><option value="not">Nejde o NOO, dôvod je uvedený</option><option value="reported">NOO bola ohlásená FSJ, referencia je uvedená</option><option value="pending">Posúdenie alebo ohlásenie ešte nie je uzavreté</option></select><button class="btn btn--line" type="submit">Zaznamenať odmietnutie alebo koniec rokovania</button></form> : null}
  </> : null}
</section>
