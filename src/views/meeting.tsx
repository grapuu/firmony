// A client won at a meeting (meeting/): the designated person's page on his phone, the director's page on the director's
// phone, both following the same steps live (public/live.js), and the contract to print. Plain words for somebody who has
// never used Firmony; one thing to do at a time, the rest a path of ticks.
import type { FC } from 'hono/jsx'
import { ART, BRAND, CLOSING_PRICE, OPERATOR, PAYROLL_PRICE, PLANS, TERMS_VERSION, asset } from '../config'
import { TERMS, TERMS_TITLE, longDate } from '../content/terms'
import { formatEur, typeset } from '../format'
import { formatIco } from '../ico'
import { qrPicture } from '../app/paybysquare'
import type { DeclarationErrors, DeclarationValues } from '../app/aml'
import { AML_NO_CONSENT } from '../aml/consent'
import type { DossierView } from '../aml/model'
import type { Director } from '../rpo'
import type { Order } from '../order'
import { firstName, type MeetingStep } from '../meeting/store'
import type { ApprovalPlan } from '../meeting/approve'
import { DeclarationForm } from './declaration'
import { Flash, Heading } from './inside'
import { monthLabel } from './order'
import { Blank, PartyLine, Sign } from './papers'

const ORDER: MeetingStep[] = ['connect', 'declare', 'identify', 'approve', 'sign', 'enter', 'done']
const at = (step: MeetingStep) => ORDER.indexOf(step)

interface PathStep { title: string; now: string; done: string }

/** The steps as a path: done ones ticked, the one at hand lit, the rest waiting. */
const Path: FC<{ steps: PathStep[]; current: number; label: string }> = ({ steps, current, label }) => (
  <ol class="meet__path" aria-label={label}>
    {steps.map((s, i) => {
      const state = i < current ? 'done' : i === current ? 'now' : 'later'
      return (
        <li class={`meet__step meet__step--${state}`} aria-current={state === 'now' ? 'step' : undefined}>
          {state === 'done' ? <span class="tick tick--green meet__mark" aria-hidden="true" /> : <span class="meet__num" aria-hidden="true">{i + 1}</span>}
          <span class="meet__text">
            <span class="meet__name">{s.title}</span>
            {state !== 'later' ? <span class="meet__sub">{state === 'done' ? s.done : s.now}</span> : null}
          </span>
        </li>
      )
    })}
  </ol>
)

/** How far, as a bar of six parts. */
const Bar: FC<{ done: number; of: number }> = ({ done, of }) => (
  <span class={`meet__bar meet__bar--${Math.min(6, Math.round((done / of) * 6))}`} role="img" aria-label={`${done} z ${of}`} />
)

const Glass: FC<{ art: typeof ART.seal }> = ({ art }) => (art ? <img class="meet__glass" src={art.small?.src ?? art.src} width="96" height="96" alt="" /> : null)

/** The QR code of the director's link, drawn as one path. */
const Qr: FC<{ link: string }> = ({ link }) => {
  const q = qrPicture(link)
  return (
    <svg class="meet__qrcode" viewBox={`0 0 ${q.size} ${q.size}`} role="img" aria-label="QR kód s odkazom pre klienta" shape-rendering="crispEdges">
      <rect class="meet__qrback" width={q.size} height={q.size} />
      <path class="meet__qrdots" d={q.path} />
    </svg>
  )
}

/** A refresh offered when the page changed while something was typed in it. */
const LiveBar: FC<{ text: string }> = ({ text }) => (
  <p class="flash flash--warn meet__live" data-live-bar hidden>
    <span>{text}</span> <a class="link" href="">Obnoviť</a>
  </p>
)

// ---------------------------------------------------------------------------------------------------------------
// The designated person's start: the company from the register
// ---------------------------------------------------------------------------------------------------------------

export interface MeetingStartProps {
  ico: string
  found: { name: string; address: string | null; directors: Director[]; mayConclude: boolean; client: boolean } | null
  error?: string | null
  values: { director: string; email: string; plan: string }
}

export const MeetingStartPage: FC<MeetingStartProps> = ({ ico, found, error, values }) => (
  <section class="meet meet--desk">
    <header class="phead">
      <Heading first="Nový klient" second="na stretnutí." />
      <p class="phead__lead">{typeset('Celé za jedno stretnutie: firma z registra, klientov mobil cez QR kód, jeho údaje, občiansky preukaz, kontroly a zmluva na papier.')}</p>
    </header>
    <Flash text={error} tone="error" />
    <form class="meet__card meet__find" method="get" action="/ucto/stretnutie">
      <label class="field__label" for="meet-ico">IČO firmy</label>
      <div class="meet__inline">
        <input id="meet-ico" class="field__input" name="ico" inputmode="numeric" autocomplete="off" maxlength={12} value={ico} required />
        <button class="btn btn--blue" type="submit">Nájsť v registri</button>
      </div>
    </form>
    {found ? (
      found.client ? (
        <p class="flash flash--warn" role="status">Táto firma už je naším klientom.</p>
      ) : !found.mayConclude ? (
        <p class="flash flash--warn" role="status">{typeset('Za túto firmu konajú podľa registra viacerí spoločne. Stretnutie je pre firmu, za ktorú jeden človek koná sám; ostatných treba overiť jednotlivo v spise.')}</p>
      ) : (
        <form class="meet__card" method="post" action="/ucto/stretnutie">
          <input type="hidden" name="ico" value={ico} />
          <div class="meet__company">
            <span class="meet__companyname">{found.name}</span>
            <span class="meet__sub">{found.address ?? ''}{found.address ? ', ' : ''}IČO {formatIco(ico)}</span>
          </div>
          <fieldset class="meet__choices">
            <legend class="field__label">Kto je na stretnutí</legend>
            {found.directors.map((d, i) => (
              <label class="meet__choice">
                <input type="radio" name="konatel" value={d.name} checked={values.director === d.name || (!values.director && i === 0)} required />
                <span><strong>{d.name}</strong> <span class="meet__sub">{d.role}</span></span>
              </label>
            ))}
          </fieldset>
          <label class="field__label" for="meet-email">E-mail konateľa</label>
          <input id="meet-email" class="field__input" type="email" name="email" autocomplete="off" maxlength={200} value={values.email} required />
          <p class="field__hint">Ním sa bude prihlasovať. Prečítajte ho nahlas, nech sedí.</p>
          <fieldset class="meet__choices meet__plans">
            <legend class="field__label">Balík</legend>
            {PLANS.map((p) => (
              <label class="meet__choice">
                <input type="radio" name="balik" value={p.id} checked={values.plan === p.id} required />
                <span><strong>{p.name}</strong> <span class="meet__sub">{formatEur(p.price * 100)} mesačne, do {p.docs} dokladov{p.vatPayer ? ', platiteľ DPH' : ''}</span></span>
              </label>
            ))}
          </fieldset>
          <button class="btn btn--blue btn--large meet__go" type="submit">Začať stretnutie</button>
        </form>
      )
    ) : null}
    <section class="info meet__print">
      <h2 class="info__title">Zmluvu si vytlačte vopred</h2>
      <p>{typeset('Dva rovnopisy na klienta: jeden ostane jemu, jeden Vám. Údaje a dátum dopíšete na stretnutí rukou.')}</p>
      <a class="btn btn--line" href="/ucto/zmluva-na-papier">Zmluva na vytlačenie</a>
    </section>
  </section>
)

// ---------------------------------------------------------------------------------------------------------------
// The designated person's page during the meeting
// ---------------------------------------------------------------------------------------------------------------

export interface MeetingDeskProps {
  order: Order
  step: MeetingStep
  state: string
  person: string
  link: string | null
  view: DossierView | null
  plan: ApprovalPlan | null
  months: string[]
  accountants: { id: string; name: string }[]
  accountant: string
  flash?: string | null
  error?: string | null
}

const ID_KIND: Record<string, string> = { op: 'Občiansky preukaz', pas: 'Cestovný pas', iny: 'Doklad totožnosti' }

export const MeetingDeskPage: FC<MeetingDeskProps> = (p) => {
  const { order, step, view } = p
  const name = p.person
  const base = `/ucto/stretnutie/${order.id}`
  const steps: PathStep[] = [
    { title: 'Mobil klienta', now: `${name} naskenuje QR kód fotoaparátom.`, done: 'Pripojený.' },
    { title: 'Údaje o firme', now: `${name} ich vypĺňa na svojom mobile.`, done: 'Vyplnené.' },
    { title: 'Občiansky preukaz', now: 'Porovnajte ho s údajmi a odfoťte.', done: 'Totožnosť overená osobne.' },
    { title: 'Kontroly a schválenie', now: 'Zapíšte ich jedným ťuknutím.', done: 'Schválené.' },
    { title: 'Zmluva', now: 'Podpíšte ju obaja a odfoťte.', done: 'Podpísaná.' },
    { title: 'Vstup do Firmony', now: `${name} ťukne na svojom mobile.`, done: `${name} je vo Firmony.` },
  ]
  const current = Math.min(at(step), steps.length)
  const live = step !== 'done'
  const d = view?.declaration.director
  return (
    <section class="meet meet--desk" data-live={live ? `${base}/stav` : undefined} data-live-state={p.state}>
      {live ? <script src={asset('/live.js')} defer></script> : null}
      <header class="meet__head">
        <p class="meet__eyebrow">Stretnutie s klientom</p>
        <h1 class="ptitle ptitle--small"><span class="ptitle__sans">{order.company}</span> <em class="ptitle__serif">{order.person}</em></h1>
        <Bar done={current} of={steps.length} />
      </header>
      <LiveBar text="Na druhom mobile sa medzitým niečo zmenilo." />
      <Flash text={p.flash} />
      <Flash text={p.error} tone="error" />
      <Path steps={steps} current={current} label="Kroky stretnutia" />

      {step === 'connect' || step === 'declare' ? (
        <section class="meet__card" aria-labelledby="meet-now">
          <h2 id="meet-now" class="meet__title">{step === 'connect' ? `Nech si ${name} naskenuje tento kód` : `${name} vypĺňa údaje`}</h2>
          {step === 'declare' ? <p class="meet__lead"><span class="meet__dots" aria-hidden="true" /> {typeset('Na svojom mobile, asi päť minút. Táto stránka sa posunie sama, keď bude hotovo.')}</p> : null}
          {p.link ? (
            step === 'connect' ? (
              <div class="meet__qr">
                <Qr link={p.link} />
                <p class="meet__qrnote">{typeset('Fotoaparátom mobilu, nič netreba inštalovať.')}</p>
              </div>
            ) : (
              <details class="meet__more"><summary class="link">Ukázať QR kód znova</summary><div class="meet__qr"><Qr link={p.link} /></div></details>
            )
          ) : (
            <form class="stack" method="post" action={`${base}/pripojit`}>
              <p>{typeset('Odkaz pre klienta je uložený len v prehliadači, v ktorom ste stretnutie začali. Tu môžete vytvoriť nový; ten doterajší prestane platiť.')}</p>
              <button class="btn btn--blue" type="submit">Vytvoriť nový QR kód</button>
            </form>
          )}
          <details class="meet__more">
            <summary class="link">Nejde to? Pošlite odkaz e-mailom</summary>
            <form class="stack" method="post" action={`${base}/email`}>
              <label class="field__label" for="meet-email">E-mail klienta</label>
              <input id="meet-email" class="field__input" type="email" name="email" maxlength={200} value={order.email} required />
              <button class="btn btn--line" type="submit">Poslať odkaz</button>
            </form>
          </details>
        </section>
      ) : null}

      {step === 'identify' && view && d ? (
        <section class="meet__card" aria-labelledby="meet-now">
          <Glass art={ART.lens} />
          <h2 id="meet-now" class="meet__title">Občiansky preukaz</h2>
          <p class="meet__lead">{typeset('Porovnajte tieto údaje s dokladom a podobu s fotografiou v ňom.')}</p>
          <dl class="kv meet__kv">
            <div><dt>Meno</dt><dd>{d.name}</dd></div>
            <div><dt>{d.birthNumber ? 'Rodné číslo' : 'Dátum narodenia'}</dt><dd>{d.birthNumber || d.birthDate}</dd></div>
            <div><dt>{ID_KIND[d.idKind] ?? 'Doklad'}</dt><dd>č. {d.idNumber}</dd></div>
            <div><dt>Trvalý pobyt</dt><dd class="kv__long">{d.address}</dd></div>
            <div><dt>Štátna príslušnosť</dt><dd>{d.nationality}</dd></div>
          </dl>
          <form class="stack" method="post" action={`${base}/doklad`} enctype="multipart/form-data">
            <input type="hidden" name="hash" value={view.dossier.facts_hash} />
            <div class="meet__shots">
              <label class="meet__shot"><span class="meet__shotname">Predná strana</span><input class="field__input" type="file" name="predna" accept="image/*,application/pdf" capture="environment" required /></label>
              {d.idKind === 'pas' ? null : <label class="meet__shot"><span class="meet__shotname">Zadná strana</span><input class="field__input" type="file" name="zadna" accept="image/*,application/pdf" capture="environment" required /></label>}
            </div>
            <label class="tickbox"><input type="checkbox" name="porovnane" value="1" required /><span>{typeset(`Údaje sedia s dokladom a podoba s fotografiou v ňom. ${name} je tu osobne.`)}</span></label>
            <button class="btn btn--blue btn--large meet__go" type="submit">Totožnosť overená</button>
          </form>
          <p class="small">{typeset(`Údaje nesedia? ${name} ich opraví na svojom mobile (Opraviť údaje); táto stránka sa potom obnoví.`)}</p>
        </section>
      ) : null}

      {step === 'approve' && view && p.plan ? (
        <section class="meet__card" aria-labelledby="meet-now">
          <Glass art={ART.seal} />
          <h2 id="meet-now" class="meet__title">Kontroly a schválenie</h2>
          <ul class="meet__checks">
            {p.plan.items.map((item) => (
              <li class={`meet__check meet__check--${item.state}`}>
                {item.state === 'recorded' || item.state === 'ready' ? <span class="tick tick--green" aria-hidden="true" /> : <span class={`mark ${item.state === 'manual' ? 'mark--amber' : 'mark--blue'}`} aria-hidden="true" />}
                <span class="meet__text"><span class="meet__name">{item.label}</span><span class="meet__sub">{item.text}</span></span>
              </li>
            ))}
          </ul>
          {p.plan.blocked ? (
            <div class="stack">
              <p class="flash flash--warn" role="status">{p.plan.blocked}</p>
              <a class="btn btn--line" href={`/ucto/aml/objednavky/${order.id}`}>Dokončiť v spise</a>
            </div>
          ) : (
            <form class="stack" method="post" action={`${base}/schvalit`}>
              <input type="hidden" name="hash" value={view.dossier.facts_hash} />
              {p.plan.items.some((i) => i.kind === 'kuv' && i.state === 'confirm') ? (
                <>
                  <label class="field__label" for="meet-kuv">Ako ste overili konečných užívateľov výhod</label>
                  <textarea id="meet-kuv" class="field__input field__area" name="kuv" rows={3} minlength={12} maxlength={1500} required placeholder="Napríklad: obchodný register (orsr.sk), spoločník … 100 %, zhoda s vyhlásením." />
                </>
              ) : null}
              {p.plan.items.some((i) => i.kind === 'pep' && i.state === 'confirm') ? (
                <label class="tickbox"><input type="checkbox" name="pep" value="1" required /><span>{typeset('Overil som vo verejných zdrojoch, že nikto z nich nie je politicky exponovaná osoba.')}</span></label>
              ) : null}
              <p class="small">Riziková skupina: <strong>{p.plan.level === 'low' ? 'nízke' : 'štandardné'}</strong>, podľa vyhlásenia.</p>
              <button class="btn btn--blue btn--large meet__go" type="submit">Zapísať kontroly a schváliť</button>
            </form>
          )}
        </section>
      ) : null}

      {step === 'sign' ? (
        <section class="meet__card" aria-labelledby="meet-now">
          <Glass art={ART.paperInvoice} />
          <h2 id="meet-now" class="meet__title">Zmluva</h2>
          <ol class="meet__how">
            <li>{typeset('Dopíšte do oboch rovnopisov údaje firmy, balík, prvý mesiac a dátum.')}</li>
            <li>{typeset(`Podpíšte ich obaja. Jeden si ${name} nechá.`)}</li>
            <li>{typeset('Odfoťte prvú stranu podpísaného rovnopisu, ktorý ostáva Vám.')}</li>
          </ol>
          <p class="small"><a class="link" href={`${base}/zmluva`}>Zmluva s údajmi tejto firmy na vytlačenie</a></p>
          <form class="stack" method="post" action={`${base}/zmluva`} enctype="multipart/form-data">
            <label class="meet__shot"><span class="meet__shotname">Fotka podpísanej zmluvy</span><input class="field__input" type="file" name="zmluva" accept="image/*,application/pdf" capture="environment" required /></label>
            <div class="fgrid">
              <div class="fgrid__cell"><label class="field__label" for="meet-plan">Balík</label>
                <select id="meet-plan" class="field__input" name="balik">{PLANS.map((x) => <option value={x.id} selected={order.plan === x.id}>{x.name}, {formatEur(x.price * 100)} mesačne</option>)}</select></div>
              <div class="fgrid__cell"><label class="field__label" for="meet-start">Prvý mesiac služby</label>
                <select id="meet-start" class="field__input" name="start">{p.months.map((m) => <option value={m}>{monthLabel(m)}</option>)}</select></div>
            </div>
            <label class="field__label" for="meet-mail">E-mail na prihlásenie</label>
            <input id="meet-mail" class="field__input" type="email" name="email" autocomplete="off" maxlength={200} value={order.email} required />
            <p class="field__hint">{typeset(`Prečítajte ho klientovi nahlas. Ak nesedí, opravte ho tu.`)}</p>
            <label class="tickbox"><input type="checkbox" name="dph" value="1" checked={PLANS.find((x) => x.id === order.plan)?.vatPayer ?? false} /><span>Firma je platiteľ DPH</span></label>
            <label class="field__label" for="meet-acc">Účtovníčka</label>
            <select id="meet-acc" class="field__input" name="uctovnicka">
              <option value="">Zatiaľ nikto</option>
              {p.accountants.map((a) => <option value={a.id} selected={p.accountant === a.id}>{a.name}</option>)}
            </select>
            <label class="tickbox"><input type="checkbox" name="podpisana" value="1" required /><span>{typeset(`Zmluvu sme obaja podpísali. Má obchodné podmienky v znení z ${longDate(TERMS_VERSION)}.`)}</span></label>
            <button class="btn btn--blue btn--large meet__go" type="submit">{`${name} je náš klient`}</button>
          </form>
        </section>
      ) : null}

      {step === 'enter' || step === 'done' ? (
        <section class="calm meet__calm" aria-labelledby="meet-now">
          <div class="calm__text">
            <p class="calm__hello">{order.company}</p>
            <h2 id="meet-now" class="calm__title">
              {step === 'done' ? `${name} je vo Firmony.` : 'Hotovo.'} <em class="calm__serif">{step === 'done' ? 'Vitajte medzi nami.' : 'Nový klient.'}</em>
            </h2>
            <p class="calm__lead">{step === 'done' ? typeset('Ukážte ešte prvé kroky v aplikácii: plnú moc, banku a prvý doklad.') : typeset(`Na mobile klienta teraz svieti Vstúpiť do Firmony. Prihlasovací odkaz príde aj e-mailom na ${order.email}.`)}</p>
            {order.companyId ? <p class="meet__calmgo"><a class="btn btn--white" href={`/ucto/klienti/${order.companyId}`}>Otvoriť klienta</a> <a class="btn btn--text meet__light" href="/ucto/stretnutie">Ďalšie stretnutie</a></p> : null}
          </div>
          {ART.seal ? <img class="calm__glass" src={ART.seal.small?.src ?? ART.seal.src} width="240" height="240" alt="" /> : null}
        </section>
      ) : null}

      {step !== 'enter' && step !== 'done' ? <p class="small meet__foot"><a class="link" href={`/ucto/aml/objednavky/${order.id}`}>Celý spis overenia</a></p> : null}
    </section>
  )
}

// ---------------------------------------------------------------------------------------------------------------
// The director's page on the director's phone
// ---------------------------------------------------------------------------------------------------------------

export interface MeetingClientProps {
  order: Order
  token: string
  step: MeetingStep
  state: string
  host: string
  values: DeclarationValues
  errors?: DeclarationErrors
  error?: string | null
  editing: boolean
  retype: boolean
}

export const MeetingClientPage: FC<MeetingClientProps> = (p) => {
  const { order, token, step, host } = p
  const first = firstName(order.person)
  const steps: PathStep[] = [
    { title: 'Údaje o firme', now: 'Vyplňte ich nižšie, asi päť minút.', done: 'Vyplnené.' },
    { title: 'Občiansky preukaz', now: `${host} si ho pozrie a odfotí.`, done: 'Overený.' },
    { title: 'Zmluva', now: `${host} Vám ju podá na podpis.`, done: 'Podpísaná.' },
    { title: 'Vstup do Firmony', now: 'Jedno ťuknutie nižšie.', done: 'Ste vo Firmony.' },
  ]
  const filling = p.editing || step === 'connect' || step === 'declare'
  const current = filling ? 0 : step === 'identify' ? 1 : step === 'approve' || step === 'sign' ? 2 : step === 'enter' ? 3 : 4
  const live = !filling && step !== 'done'
  return (
    <section class="section page meet-page">
      <link rel="stylesheet" href={asset('/inside.css')} />
      {live ? <script src={asset('/live.js')} defer></script> : null}
      <div class="wrap reading page__inner meet meet--client" data-live={live ? `/objednavka/${token}/stav` : undefined} data-live-state={p.state}>
        <header class="meet__head">
          <p class="meet__eyebrow">{order.company}</p>
          <h1 class="ptitle ptitle--small"><span class="ptitle__sans">{first ? `Dobrý deň, ${first}.` : 'Dobrý deň.'}</span> <em class="ptitle__serif">Vitajte vo Firmony.</em></h1>
          <Bar done={current} of={steps.length} />
        </header>
        <LiveBar text="Stretnutie medzitým pokročilo." />
        <Flash text={p.error} tone="error" />
        <Path steps={steps} current={current} label="Vaše kroky" />

        {filling ? (
          <section class="meet__card meet__card--form" aria-labelledby="meet-now">
            <h2 id="meet-now" class="meet__title">Údaje o firme</h2>
            <p class="meet__lead">{typeset(`Kto za firmu koná a kto ju vlastní. Zákon ich od nás vyžaduje pred každou zmluvou; ${host} ich porovná s Vaším občianskym preukazom.`)}</p>
            {p.retype ? <p class="notice" role="note">{typeset('Rodné čísla a číslo dokladu tu z bezpečnostných dôvodov nezobrazujeme. Pri úprave ich, prosím, napíšte znova.')}</p> : null}
            <p class="meet__login">{typeset('Do Firmony sa budete prihlasovať e-mailom ')}<strong>{order.email}</strong>{typeset('. Ak nesedí, povedzte to hneď; opraví sa pri podpise zmluvy.')}</p>
            <p class="small">{typeset(AML_NO_CONSENT)}</p>
            <DeclarationForm values={p.values} errors={p.errors ?? {}} editing={false} action={`/objednavka/${token}/stretnutie`} />
          </section>
        ) : step === 'identify' ? (
          <section class="meet__card" aria-labelledby="meet-now">
            <Glass art={ART.lens} />
            <h2 id="meet-now" class="meet__title">Ukážte, prosím, občiansky preukaz</h2>
            <p class="meet__lead">{typeset(`${host} ho porovná s údajmi, ktoré ste vyplnili, a odfotí. Kópiu dokladu uchovávame, ako to vyžaduje zákon.`)}</p>
            <p class="small"><a class="link" href={`/objednavka/${token}?upravit=1`}>Opraviť údaje</a></p>
          </section>
        ) : step === 'approve' || step === 'sign' ? (
          <section class="meet__card" aria-labelledby="meet-now">
            <Glass art={ART.paperInvoice} />
            <h2 id="meet-now" class="meet__title">{step === 'approve' ? 'Ešte chvíľu' : 'Zmluva'}</h2>
            <p class="meet__lead">{step === 'approve' ? typeset(`${host} dokončuje overenie. Potom Vám podá zmluvu na podpis.`) : typeset('Podpíšte oba rovnopisy zmluvy. Jeden je Váš.')}</p>
            <p class="small"><a class="link" href="/podmienky" target="_blank" rel="noopener">Obchodné podmienky</a></p>
          </section>
        ) : step === 'enter' ? (
          <section class="calm meet__calm" aria-labelledby="meet-now">
            <div class="calm__text">
              <p class="calm__hello">{order.company}</p>
              <h2 id="meet-now" class="calm__title">Ste naším klientom. <em class="calm__serif">Poďme na to.</em></h2>
              <p class="calm__lead">{typeset('Ťuknite a ste v aplikácii. Potom si uložte prihlásenie do mobilu, nabudúce bez hesla aj bez e-mailu.')}</p>
              <form method="post" action={`/objednavka/${token}/vstup`} class="meet__calmgo"><button class="btn btn--white btn--large" type="submit">Vstúpiť do Firmony</button></form>
            </div>
            {ART.key ? <img class="calm__glass" src={ART.key.small?.src ?? ART.key.src} width="240" height="240" alt="" /> : null}
          </section>
        ) : (
          <section class="meet__card" aria-labelledby="meet-now">
            <h2 id="meet-now" class="meet__title">Ste vo Firmony</h2>
            <p class="meet__lead">{typeset(`Prihlásite sa na ${new URL(BRAND.origin).hostname} e-mailom ${order.email}, alebo uloženým prihlásením v mobile.`)}</p>
            <a class="btn btn--blue" href="/app">Otvoriť aplikáciu</a>
          </section>
        )}
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------------------------------------------
// The contract to print: blank lines to fill in at the meeting, or this company's data
// ---------------------------------------------------------------------------------------------------------------

export interface PaperParty { name: string; address: string | null; ico: string; register: string | null; person: string; role: string }

export const PaperContractPage: FC<{ party: PaperParty | null; back: string }> = ({ party, back }) => (
  <>
    <a class="back" href={back}>Späť</a>
    <header class="phead">
      <Heading first="Zmluva" second="na vytlačenie." />
      <p class="phead__lead">{typeset(`Vytlačte dva rovnopisy aj s obchodnými podmienkami. Znenie podmienok z ${longDate(TERMS_VERSION)}: keď sa zmenia, vytlačte nové.`)}</p>
      <button class="btn btn--blue" type="button" data-print hidden>Vytlačiť</button>
    </header>
    <article class="sheet deed cpaper" aria-label="Zmluva o vedení účtovníctva">
      <h2 class="deed__title">Zmluva o vedení účtovníctva</h2>
      <p class="cpaper__sub">uzavretá podľa § 269 ods. 2 Obchodného zákonníka</p>
      <section class="deed__block">
        <p class="deed__label">Poskytovateľ</p>
        <PartyLine name={OPERATOR.name} address={`${OPERATOR.street}, ${OPERATOR.postalCity}`} ico={OPERATOR.companyId.replace(/\s/g, '')} register={OPERATOR.register} director="Christian Juhás" role="konateľ" tail="(ďalej „poskytovateľ“)" />
      </section>
      <section class="deed__block">
        <p class="deed__label">Klient</p>
        {party ? (
          <PartyLine name={party.name} address={party.address} ico={party.ico} register={party.register} director={party.person} role={party.role.toLocaleLowerCase('sk')} tail="(ďalej „klient“)" />
        ) : (
          <p class="deed__party">obchodné meno <Blank wide />, so sídlom <Blank wide />, IČO <Blank />, v mene ktorej koná <Blank wide />, funkcia <Blank /> (ďalej „klient“)</p>
        )}
      </section>
      <ol class="deed__list cpaper__points">
        <li>{typeset(`Poskytovateľ bude pre klienta viesť účtovníctvo a poskytovať mu službu ${BRAND.name} v rozsahu zvoleného balíka a obchodných podmienok.`)}</li>
        <li>
          {typeset('Balík (označte jeden):')}
          <ul class="cpaper__plans">
            {PLANS.map((x) => <li><span class="cpaper__box" aria-hidden="true" /> {typeset(`${x.name}: ${formatEur(x.price * 100)} mesačne, do ${x.docs} dokladov mesačne${x.vatPayer ? ', pre platiteľa DPH' : ''}`)}</li>)}
          </ul>
          {typeset(`Mzdy ${formatEur(PAYROLL_PRICE * 100)} mesačne za každého zamestnanca. Účtovná závierka a daňové priznanie k dani z príjmov ${formatEur(CLOSING_PRICE * 100)} ročne. Prvý mesiac služby je zadarmo (bod 4.7 podmienok). Ceny sú bez DPH; kým poskytovateľ nie je platiteľom DPH, DPH sa k nim nepripočítava (bod 4.1 podmienok).`)}
        </li>
        <li>Služba začína 1. dňa mesiaca <Blank wide />.</li>
        <li>{typeset(`Súčasťou zmluvy sú ${TERMS_TITLE} v znení z ${longDate(TERMS_VERSION)} (ďalej „podmienky“), ktoré sú k zmluve pripojené a zverejnené na ${new URL(BRAND.origin).hostname}/podmienky. Klient potvrdzuje, že sa s nimi oboznámil a súhlasí s nimi.`)}</li>
        <li>{typeset('Odchylne od bodu 1.3 podmienok zmluva vzniká podpisom oboch zmluvných strán. Odchylne od bodu 9.2 podmienok môže poskytovateľ overiť totožnosť osoby konajúcej za klienta za jej fyzickej prítomnosti podľa dokladu totožnosti (§ 8 ods. 1 písm. a) zákona č. 297/2008 Z. z.); vyhlásenie, ktoré vyplnila v aplikácii, potom nepodpisuje kvalifikovaným elektronickým podpisom. Ustanovenia tejto zmluvy majú prednosť pred podmienkami (§ 273 ods. 2 Obchodného zákonníka).')}</li>
        <li>{typeset('Poskytovateľ je povinnou osobou podľa zákona č. 297/2008 Z. z. a na jeho účely spracúva osobné údaje aj bez súhlasu dotknutých osôb (§ 19 ods. 1 a § 21 ods. 3 tohto zákona). Podrobnosti sú v článku 9 podmienok a v informácii o ochrane osobných údajov.')}</li>
        <li>{typeset(`Zmluva je vyhotovená v dvoch rovnopisoch, každá zmluvná strana dostane jeden. Zmluvu, podmienky a dokumenty služby nájde klient aj v aplikácii ${BRAND.name}.`)}</li>
      </ol>
      <p class="deed__place">V <Blank /> dňa <Blank /></p>
      <div class="deed__signs">
        <Sign label="Za poskytovateľa" name="Christian Juhás" role="konateľ" of={OPERATOR.name} />
        <Sign label="Za klienta" name={party ? party.person : null} role={party ? party.role.toLocaleLowerCase('sk') : ''} of={party ? party.name : ''} />
      </div>
    </article>
    <article class="sheet deed cpaper cpaper--terms contract" aria-label={TERMS_TITLE}>
      <h2 class="deed__title">{TERMS_TITLE}</h2>
      <p class="cpaper__sub">{typeset(`Príloha zmluvy o vedení účtovníctva. Znenie z ${longDate(TERMS_VERSION)}.`)}</p>
      {TERMS.map((section, i) => (
        <section class="contract__section">
          <h3 class="contract__heading">{i + 1}. {section.title}</h3>
          <ol class="terms__points">
            {section.points.map((point, j) => <li><span class="terms__number">{i + 1}.{j + 1}</span><span>{point}</span></li>)}
          </ol>
        </section>
      ))}
    </article>
  </>
)
