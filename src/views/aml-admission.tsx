import { EU_COUNTRIES } from '../aml/enhanced'
import type { FC } from 'hono/jsx'
import type { Order } from '../order'
import type { DeclarationErrors, DeclarationValues } from '../app/aml'
import { DeclarationForm } from './declaration'
import { CHECK_LABELS, PLACE_CHECK_LABEL, type DossierView } from '../aml/model'
import { AML_CHECK_KINDS } from '../aml/schema'
import { COUNTRY_LISTS_CHECKED_ON, COUNTRY_POLICY_VERSION, COUNTRY_SOURCES } from '../aml/countries'
import { maskBirthNumber, type Person } from '../app/aml'
import { whenName } from '../app/copy'
import { bratislava } from '../app/remind'
import { formatEur, typeset } from '../format'
import { monthLabel } from './order'
import { AML_NO_CONSENT } from '../aml/consent'
import type { DossierProposals } from '../aml/proposals'


/** The offer accepted in the signed declaration of an online order: the plans to pick, the months, the terms' version. */
export interface IntakeContract { plans: { id: string; name: string; price: number }[]; months: string[]; terms: string }

export const AmlIntakePage: FC<{ order: Order; token: string; view: DossierView | null; values: DeclarationValues; errors?: DeclarationErrors; error?: string; editing?: boolean; contract?: IntakeContract | null; retype?: boolean }> = ({ order, token, view, values, errors = {}, error, editing, contract, retype }) => (
  <section class="section page"><link rel="stylesheet" href="/inside.css" />
    <div class="wrap reading page__inner">
      <h1 class="h1">Overenie pred začatím spolupráce</h1>
      <p class="lead">{order.company}. Pred uzavretím zmluvy potrebujeme overiť, kto za firmu koná a kto je jej konečným užívateľom výhod.</p>
      {error ? <p class="notice notice--error" role="alert">{error}</p> : null}
      {retype ? <p class="notice" role="note" data-aml-retype>Rodné čísla a číslo dokladu totožnosti na tejto stránke z bezpečnostných dôvodov nezobrazujeme. Pri úprave ich, prosím, napíšte znova.</p> : null}
      {view && !editing ? <section class="info" data-aml-waiting>
        <h2 class="info__title">Podklady sme prijali</h2>
        <p>Údaje a súbor {view.dossier.file_name} preveríme. Zmluvu budete môcť uzavrieť až po dokončení overenia a potvrdení rozsahu služby.</p>
        <p>Pri úprave údajov preveríme novú verziu.</p>
        <details><summary class="link">Doplniť bankové podklady na vyžiadanie</summary><p>Ak sme Vás o to požiadali, doplňte doklad o účte na meno Vašej firmy v banke pôsobiacej v EÚ a doklad o prvej platbe Firmony z tohto účtu. Pokyny k platbe dostanete osobitne. Samotné nahranie zmluvu neuzatvára.</p><form class="stack" method="post" enctype="multipart/form-data" action={`/objednavka/${token}/banka`}><label class="field__label" for="bank-account">Doklad o účte, najviac 25 MB</label><input id="bank-account" class="field__input" type="file" name="ucet" accept=".pdf,.asice" required /><label class="field__label" for="bank-payment">Doklad o prvej platbe, najviac 25 MB</label><input id="bank-payment" class="field__input" type="file" name="platba" accept=".pdf,.asice" required /><button class="btn btn--line" type="submit">Doplniť podklady</button></form></details>
        <a class="btn btn--line" href={`/objednavka/${token}?upravit=1`}>Upraviť podklady</a>
      </section> : <>
        <p>Vyplňte údaje, stiahnite vyhlásenie a podpíšte ho kvalifikovaným elektronickým podpisom. Potom nahrajte podpísaný PDF alebo ASiC-E súbor a odošlite podklady.</p>
        <p class="small" data-aml-consent>{typeset(AML_NO_CONSENT)} Podrobnosti nájdete v <a class="link" href="/pravne-informacie#ochrana-udajov">informácii o ochrane osobných údajov</a>.</p>
        <DeclarationForm values={values} errors={errors} editing={false} action={`/objednavka/${token}/overenie`} multipart>
          {contract ? <section class="info decl__part" aria-labelledby="zmluva-t" data-aml-contract>
            <h2 id="zmluva-t" class="info__title">Zmluva, ktorú po overení uzavriete</h2>
            <p class="info__lead">Vyhlásenie, ktoré podpíšete, obsahuje aj prijatie ponuky v tomto znení. Zmluvu potom možno uzavrieť iba presne takto a iba za osobu, ktorá vyhlásenie podpísala. Pri zmene podpíšete nové vyhlásenie.</p>
            <div class="fgrid">
              <div class="fgrid__cell"><label class="field__label" for="v-contractPlan">Balík</label>
                <select id="v-contractPlan" class="field__input" name="contractPlan" aria-invalid={errors.contractPlan ? 'true' : undefined}>
                  <option value="">Vyberte</option>
                  {contract.plans.map((p) => <option value={p.id} selected={values.contractPlan === p.id}>{p.name}, {formatEur(p.price * 100)} mesačne bez DPH</option>)}
                </select>
                {errors.contractPlan ? <p class="field__error">{errors.contractPlan}</p> : null}
              </div>
              <div class="fgrid__cell"><label class="field__label" for="v-contractStart">Prvý mesiac služby</label>
                <select id="v-contractStart" class="field__input" name="contractStart" aria-invalid={errors.contractStart ? 'true' : undefined}>
                  <option value="">Vyberte</option>
                  {contract.months.map((m) => <option value={m} selected={values.contractStart === m}>{monthLabel(m)}</option>)}
                </select>
                {errors.contractStart ? <p class="field__error">{errors.contractStart}</p> : null}
              </div>
            </div>
            <label class="tickbox"><input type="checkbox" name="contractAgree" value="1" checked={values.contractAgree === '1'} aria-invalid={errors.contractAgree ? 'true' : undefined} /><span>Za firmu prijímam ponuku podľa <a class="link" href="/podmienky" target="_blank" rel="noopener">obchodných podmienok</a> vo verzii {contract.terms}. Zmluva vznikne až po dokončení overenia.</span></label>
            {errors.contractAgree ? <p class="field__error">{errors.contractAgree}</p> : null}
          </section> : null}
          <section class="info decl__part" aria-labelledby="podpis-t">
            <h2 id="podpis-t" class="info__title">Podpísané vyhlásenie</h2>
            <p>Najprv stiahnite vyhlásenie s údajmi uvedenými vyššie. Stiahnutie formulár neodošle.</p>
            <button class="btn btn--line" type="submit" formaction={`/objednavka/${token}/vyhlasenie.pdf`}>Stiahnuť vyhlásenie na podpis</button>
            <label class="field__label" for="aml-podpis">Podpísaný súbor, najviac 25 MB</label>
            <input id="aml-podpis" class="field__input" type="file" name="podpis" accept=".pdf,.asice,application/pdf,application/vnd.etsi.asic-e+zip" aria-describedby="aml-podpis-note" />
            <p id="aml-podpis-note" class="field__hint">Nahrajte pôvodný podpísaný súbor. Platnosť podpisu a zhodu údajov overíme.</p>
            {errors.podpis ? <p class="field__error" role="alert">{errors.podpis}</p> : null}
          </section>
        </DeclarationForm>
      </>}
    </div>
  </section>
)

/** The checks the app prepared (aml/proposals.ts): a text and a result to record as they stand, or why there is none. */
export const AmlDossierPanel: FC<{ view: DossierView | null; officer: boolean; readOnly?: boolean; returnTo: string; download: string; proposals?: DossierProposals }> = ({ view, officer, readOnly = false, returnTo, download, proposals = {} }) => {
  if (!view) return <section class="info" data-aml-dossier><h2 class="info__title">Overenie pred zmluvou</h2><p>Čakáme na úplné vyhlásenie a pôvodný podpísaný súbor.</p></section>
  const { dossier: d, declaration: x, checks, decision } = view
  const results = {clear:'Overené, bez prekážky',high:'Zvýšené riziko',match:'Zistená prekážka',unresolved:'Nevyriešené'}
  const levels = {low:'Nízke',standard:'Štandardné',high:'Zvýšené'}
  const latest = AML_CHECK_KINDS.map((kind) => checks.find((k) => k.kind === kind))
  const today = bratislava(Date.now()).day
  // Birth numbers and the document's number cut short, as the client's own pages show them; the signed original has them in full.
  const born = (p: Pick<Person, 'birthNumber' | 'birthDate'>) => (p.birthNumber ? maskBirthNumber(p.birthNumber) : p.birthDate)
  const cut = (value: string) => (value.length > 3 ? `${'*'.repeat(Math.min(value.length - 3, 6))}${value.slice(-3)}` : value)
  const place = view.placeChecks?.[0]
  const required = view.requiredRisk ?? d.required_risk
  return <section class="info stack" data-aml-dossier aria-labelledby="aml-dossier-t">
    <h2 id="aml-dossier-t" class="info__title">Doklady a vykonané kontroly</h2>
    <p>{view.ready ? 'Overenie tejto verzie je dokončené.' : 'Táto verzia zatiaľ nemá dokončené overenie.'}</p>
    <dl class="kv">
      <div><dt>Osoba konajúca za firmu</dt><dd class="kv__long">{x.director.name}, {born(x.director)}, {x.director.address}, {x.director.nationality}. Doklad {cut(x.director.idNumber)}</dd></div>
      <div><dt>Koneční užívatelia výhod</dt><dd class="kv__long">{x.kuv !== 'others' ? `${x.director.name}; ` : ''}{x.owners.map((p) => `${p.name}, ${born(p)}, ${p.address}, ${p.nationality}, ${p.share}`).join('; ')}</dd></div>
      <div><dt>Skutočné miesto činnosti</dt><dd class="kv__long">{x.businessAtSeat ? 'Zhodné so sídlom' : x.businessAddress}. Krajiny: {x.businessCountries}.</dd></div>
      <div><dt>Konanie vo vlastnom mene</dt><dd class="kv__long">{x.ownBehalf ? 'Áno' : `Nie. ${x.principal?.name}, ${x.principal?.ico || (x.principal?.birthNumber ? maskBirthNumber(x.principal.birthNumber) : x.principal?.birthDate)}, ${x.principal?.address}`}</dd></div>
      {x.contract ? <div><dt>Podpísané prijatie ponuky</dt><dd class="kv__long">Balík {x.contract.plan}, od {x.contract.startOn}, podmienky vo verzii {x.contract.terms}</dd></div> : null}
      <div><dt>Pôvod príjmov a činnosť</dt><dd class="kv__long">{x.activity}. {x.income}. Krajiny partnerov: {x.partnerCountries || 'neuvedené'}.</dd></div>
      <div><dt>Odtlačok údajov vytlačený vo vyhlásení</dt><dd class="kv__long"><code>{view.declarationHash}</code></dd></div>
      <div><dt>Odtlačok súboru SHA-256</dt><dd class="kv__long"><code>{d.file_sha256}</code></dd></div>
    </dl>
    <a class="btn btn--line" href={download}>Stiahnuť pôvodný podpísaný súbor</a>
    <a class="link" href={`/ucto/aml/spisy/${d.id}/historia`}>Úplná história tejto verzie</a>
    <p class="info__source" data-aml-policy>{view.policyCurrent ? `Riziková skupina podľa pravidiel krajín vo verzii ${COUNTRY_POLICY_VERSION}, zoznamy overené ${COUNTRY_LISTS_CHECKED_ON}.` : `Overenie stojí na starších pravidloch krajín (${view.policyReviews?.[0]?.policy_version ?? d.policy_version}). Určená osoba ho prehodnotí na stránke Určená osoba AML.`} Požadovaná riziková skupina: {({ low: 'nízke', standard: 'štandardné', high: 'zvýšené' } as const)[required]}. <a class="link" href={COUNTRY_SOURCES.commission} target="_blank" rel="noopener noreferrer">Európska komisia</a>, <a class="link" href={COUNTRY_SOURCES.fatfHigh} target="_blank" rel="noopener noreferrer">FATF vysoké riziko</a>, <a class="link" href={COUNTRY_SOURCES.fatfMonitoring} target="_blank" rel="noopener noreferrer">FATF monitoring</a>.</p>
    {AML_CHECK_KINDS.map((kind, i) => { const prepared = (proposals as Record<string, DossierProposals[keyof DossierProposals]>)[kind]; const p = prepared && 'proposal' in prepared ? prepared.proposal : null; return <section class="info" aria-labelledby={`aml-${kind}-t`}>
      <h3 id={`aml-${kind}-t`} class="info__title">{CHECK_LABELS[kind]}</h3>
      {latest[i] ? <p class="info__source">{latest[i]?.by_name ?? latest[i]?.checked_by}, {whenName(latest[i]?.checked_at ?? 0, today)}. Výsledok: {latest[i] ? results[latest[i]!.result] : ''}. {latest[i]?.source}</p> : <p>Kontrola ešte nie je zaznamenaná.</p>}
      {!readOnly && p ? <p class="notice" data-aml-proposal={kind}>{p.result ? 'Kontrolu pripravila aplikácia. Prečítajte text, prípadne ho doplňte, a zapíšte ju.' : 'Aplikácia našla niečo na posúdenie. Prečítajte text, rozhodnite o výsledku a zapíšte kontrolu.'}</p> : null}
      {!readOnly && prepared && 'missing' in prepared ? <p class="small" data-aml-proposal-missing={kind}>{prepared.missing}</p> : null}
      {!readOnly ? <form class="stack" method="post" action={`/ucto/aml/spisy/${d.id}/kontrola`} data-aml-check>
        <input type="hidden" name="hash" value={d.facts_hash} /><input type="hidden" name="druh" value={kind} /><input type="hidden" name="spat" value={returnTo} />
        <label class="field__label" for={`aml-${kind}-vysledok`}>Výsledok kontroly</label>
        <select id={`aml-${kind}-vysledok`} class="field__input" name="vysledok" required>
          <option value="">Vyberte výsledok</option><option value="clear" selected={p?.result === 'clear'}>Overené, bez prekážky</option>
          {kind === 'pep' || kind === 'countries' ? <option value="high" selected={p?.result === 'high'}>Zistené zvýšené riziko</option> : <option value="match">Zistená prekážka</option>}
          <option value="unresolved">Nevyriešené</option>
        </select>
        {kind === 'identity' ? <>
          <label class="field__label" for="aml-podpisujuci">Meno podpisujúcej osoby podľa validácie</label><input id="aml-podpisujuci" class="field__input" name="podpisujuci" maxlength={160} />
          <label class="tickbox"><input type="checkbox" name="kvalifikovany" value="1" /><span>Overil som platný kvalifikovaný podpis aj zhodu obsahu podpísaného vyhlásenia s touto verziou údajov.</span></label>
        </> : null}
        <label class="field__label" for={`aml-${kind}-zdroj`}>Zdroj, výsledok a referencia na dôkaz</label>
        <textarea id={`aml-${kind}-zdroj`} class="field__input field__area" name="zdroj" rows={p ? 6 : 3} minlength={12} maxlength={2000} required>{p?.source ?? ''}</textarea>
        <button class={p?.result ? 'btn btn--blue' : 'btn btn--line'} type="submit">Zapísať kontrolu</button>
      </form> : null}
    </section> })}
    {x.businessAtSeat === false ? <section class="info" aria-labelledby="aml-place-t" data-aml-place>
      <h3 id="aml-place-t" class="info__title">{PLACE_CHECK_LABEL}</h3>
      <p>Adresa z vyhlásenia: {x.businessAddress}. Overte ju z dokladu tretej osoby (nájom, energie) alebo z verejného zdroja.</p>
      {place ? <p class="info__source">{place.by_name ?? place.checked_by}, {whenName(place.checked_at, today)}. Výsledok: {results[place.result]}. {place.source}</p> : <p>Kontrola ešte nie je zaznamenaná.</p>}
      {!readOnly ? <form class="stack" method="post" action={`/ucto/aml/spisy/${d.id}/kontrola`} data-aml-check>
        <input type="hidden" name="hash" value={d.facts_hash} /><input type="hidden" name="druh" value="place" /><input type="hidden" name="spat" value={returnTo} />
        <label class="field__label" for="aml-place-vysledok">Výsledok kontroly</label>
        <select id="aml-place-vysledok" class="field__input" name="vysledok" required><option value="">Vyberte výsledok</option><option value="clear">Overené, bez prekážky</option><option value="match">Zistená prekážka</option><option value="unresolved">Nevyriešené</option></select>
        <label class="field__label" for="aml-place-zdroj">Zdroj, výsledok a referencia na dôkaz</label>
        <textarea id="aml-place-zdroj" class="field__input field__area" name="zdroj" rows={3} minlength={12} maxlength={2000} required />
        <button class="btn btn--line" type="submit">Zapísať kontrolu</button>
      </form> : null}
    </section> : null}
    <section class="info stack"><h3 class="info__title">Účet a prvá platba pri zvýšenom riziku</h3><p>Pri online prijatí so zvýšeným rizikom overte banku pôsobiacu v EÚ, účet na meno klienta a skutočne prijatú prvú platbu z tohto účtu. Samotný príkaz na úhradu nestačí.</p>
      {view.bankEvidence?.map((b,i)=><p>Podklady {i+1}: <a class="link" href={`/ucto/aml/spisy/${d.id}/banka/${b.id}/ucet`}>Doklad o účte</a>, <a class="link" href={`/ucto/aml/spisy/${d.id}/banka/${b.id}/platba`}>Doklad o prvej platbe</a></p>)}
      {!readOnly ? <form class="stack" method="post" enctype="multipart/form-data" action={`/ucto/aml/spisy/${d.id}/banka`}><label class="field__label" for="staff-bank-account">Doklad o účte, najviac 25 MB</label><input id="staff-bank-account" class="field__input" type="file" name="ucet" accept=".pdf,.asice" required /><label class="field__label" for="staff-bank-payment">Doklad o prijatej prvej platbe, najviac 25 MB</label><input id="staff-bank-payment" class="field__input" type="file" name="platba" accept=".pdf,.asice" required /><button class="btn btn--line" type="submit">Doplniť pôvodné bankové podklady</button></form> : null}
    </section>
    {decision ? <p class="info__source">Rozhodnutie: {decision.decision === 'approved' ? 'Schválené' : 'Pozastavené'}, riziko {levels[decision.level]}. {decision.by_name ?? decision.decided_by}, {whenName(decision.decided_at, today)}. {decision.note}</p> : null}
    {officer && !readOnly ? <form class="stack" method="post" action={`/ucto/aml/spisy/${d.id}/rozhodnutie`} data-aml-decision>
      <h3 class="info__title">Potvrdenie určenej osoby</h3>
      <p class="small">Pri pravidelnej aktualizácii a pri každom ďalšom potvrdení toho istého klienta musia byť kontroly PEP, sankčných zoznamov EÚ a OSN a KUV zapísané až po predchádzajúcom potvrdení.</p>
      <input type="hidden" name="hash" value={d.facts_hash} /><input type="hidden" name="spat" value={returnTo} />
      <label class="field__label" for="aml-riziko">Riziková skupina</label><select id="aml-riziko" class="field__input" name="riziko"><option value="low" selected={required === 'low'}>Nízke</option><option value="standard" selected={required === 'standard'}>Štandardné</option><option value="high" selected={required === 'high'}>Zvýšené</option></select>
      <label class="field__label" for="aml-bank-id">Overené bankové podklady pri zvýšenom riziku</label><select id="aml-bank-id" class="field__input" name="banka"><option value="">Bez bankových podkladov</option>{view.bankEvidence?.map((b,i)=><option value={b.id}>Podklady {i+1}, {whenName(b.created_at,today)}</option>)}</select>
      <label class="field__label" for="aml-bank-iban">IBAN overeného účtu</label><input id="aml-bank-iban" class="field__input" name="iban" maxlength={34} />
      <label class="field__label" for="aml-bank-owner">Overený majiteľ účtu</label><input id="aml-bank-owner" class="field__input" name="majitel" maxlength={200} />
      <label class="field__label" for="aml-bank-country">Členský štát, v ktorom banka pôsobí</label><select id="aml-bank-country" class="field__input" name="bankaKrajina"><option value="">Vyberte kód štátu</option>{EU_COUNTRIES.map((code)=><option value={code}>{code}</option>)}</select>
      <label class="field__label" for="aml-bank-payment">Referencia na skutočne prijatú prvú platbu z tohto účtu</label><textarea id="aml-bank-payment" class="field__input field__area" name="prvaPlatba" maxlength={2000} rows={2} />
      <label class="tickbox"><input type="checkbox" name="bankaOverena" value="1" /><span>Overil som pôvodné bankové doklady, majiteľa účtu, banku pôsobiacu v EÚ a skutočne prijatú prvú platbu z tohto účtu. Vyžaduje sa pri zvýšenom riziku.</span></label>
      <label class="field__label" for="aml-dovod">Dôvod a rozsah overenia</label><textarea id="aml-dovod" class="field__input field__area" name="dovod" rows={3} minlength={12} maxlength={2000} required />
      <label class="field__label" for="aml-zvysene">Zvýšená starostlivosť: pôvod majetku a prostriedkov, dodatočné zdroje a opatrenia</label><textarea id="aml-zvysene" class="field__input field__area" name="zvysene" rows={3} maxlength={2000} />
      <label class="tickbox"><input type="checkbox" name="suhlas" value="1" /><span>Pri zvýšenom riziku výslovne súhlasím s uzavretím alebo pokračovaním vzťahu na základe zaznamenanej zvýšenej starostlivosti.</span></label>
      <div class="decl__buttons"><button class="btn btn--blue" type="submit" name="rozhodnutie" value="approved">Potvrdiť dokončené overenie</button><button class="btn btn--line" type="submit" name="rozhodnutie" value="hold">Pozastaviť prijatie</button></div>
    </form> : !officer && !readOnly ? <p>Zaradenie a súhlas potvrdzuje určená osoba podľa AML programu.</p> : null}
  </section>
}
