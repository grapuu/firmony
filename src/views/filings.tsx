import type { FC } from 'hono/jsx'
import type { Company, User } from '../app/store'
import { dayName } from '../app/copy'
import { periodName } from '../app/vat-store'
import { canTransition, CLIENT_DELIVERY_LABELS, DELIVERY_LABELS, DELIVERY_TONE, FILING_KINDS, TRANSITIONS, type DeliveryStatus, type DeliveryState, type FilingEvent, type FilingPackage, type FilingWorkItem } from '../filings/model'
import { DESTINATIONS, rowKey, type BundleItem } from '../filings/bundle'
import type { BundleExtra } from '../filings/extras'
import { Heading } from './inside'
import { dayOf } from './inside-pages'

const label = (period: string) => period.length === 4 ? `rok ${period}` : periodName(period)
/** A filing's state: the register's terms for the team, the client's own words on the client's pages (`client`). */
export const DeliveryNotice: FC<{ status?: DeliveryStatus; href: string; client?: boolean }> = ({ status = 'unverified', href, client }) => (
  <p class="notice">
    <span class={`pill pill--${DELIVERY_TONE[status]}`}>{(client ? CLIENT_DELIVERY_LABELS : DELIVERY_LABELS)[status]}</span>{' '}
    <a class="link" href={href}>{client ? 'Podanie a potvrdenka' : 'Podania a potvrdenky'}</a>
  </p>
)
export interface BundleView {
  toSend: BundleItem[]
  toConfirm: BundleItem[]
  /** OSS returns and Intrastat reports ready to go (filings/extras.ts). */
  extras?: BundleExtra[]
  today: string
  recorded: number
  errors: Record<string, string>
  values: Record<string, string>
}

const BundleRowFields: FC<{ i: BundleItem; values: Record<string, string>; error?: string; send: boolean }> = ({ i, values, error, send }) => {
  const key = rowKey(i)
  return (
    <li class={`bundle-row${error ? ' bundle-row--error' : ''}`}>
      <input type="hidden" name="row" value={key} />
      <div class="bundle-row__what">
        <strong>{i.company}</strong>
        <span>
          {i.label} · {label(i.period)}
        </span>
        {i.status === 'rejected' ? <span class="pill pill--red">Odmietnuté, poslať znova</span> : null}
        {!send && i.lastReference ? <span class="small">Odoslané pod číslom {i.lastReference}</span> : null}
      </div>
      <div class="bundle-row__fields">
        {send ? (
          <label class="field">
            <span class="field__label">Číslo podania</span>
            <input class="field__input" name={`ref:${key}`} value={values[`ref:${key}`] ?? ''} maxlength={160} autocomplete="off" />
          </label>
        ) : null}
        <label class="field">
          <span class="field__label">Potvrdenka{send ? ', ak ju už máte' : ''}</span>
          <input class="field__input" type="file" name={`receipt:${key}`} accept=".pdf,.xml,.jpg,.jpeg,.png,.webp,.asice,.asics" />
        </label>
        {i.status === 'rejected' ? (
          <label class="field bundle-row__wide">
            <span class="field__label">Čo ste opravili pred novým odoslaním</span>
            <input class="field__input" name={`reason:${key}`} value={values[`reason:${key}`] ?? ''} maxlength={1200} />
          </label>
        ) : null}
        <label class="tickbox bundle-row__wide">
          <input type="checkbox" name={`ok:${key}`} value="1" checked={values[`ok:${key}`] === '1'} />
          <span>Potvrdenka zodpovedá tejto firme, obdobiu, dokumentu a číslu podania.</span>
        </label>
      </div>
      {error ? (
        <p class="field__error bundle-row__wide" role="alert">
          {error}
        </p>
      ) : null}
    </li>
  )
}

/** An OSS return or an Intrastat report in the form: sent is a tick, its portal gives no receipt to keep. */
const ExtraRowFields: FC<{ e: BundleExtra; values: Record<string, string>; error?: string }> = ({ e, values, error }) => (
  <li class={`bundle-row${error ? ' bundle-row--error' : ''}`}>
    <input type="hidden" name="extra" value={e.key} />
    <input type="hidden" name={`sig:${e.key}`} value={e.sig} />
    <div class="bundle-row__what">
      <strong>{e.company.name}</strong>
      <span>
        {e.label} · {label(e.period)}
      </span>
      <a class="link small" href={e.href}>
        Otvoriť
      </a>
    </div>
    <div class="bundle-row__fields">
      <label class="tickbox bundle-row__wide">
        <input type="checkbox" name={`sent:${e.key}`} value="1" checked={values[`sent:${e.key}`] === '1'} />
        <span>Odoslané {e.kind === 'oss' ? 'na portáli OSS' : 'na portáli Intrastat'}, súbor z tohto balíka</span>
      </label>
    </div>
    {error ? (
      <p class="field__error bundle-row__wide" role="alert">
        {error}
      </p>
    ) : null}
  </li>
)

const documents = (n: number) => (n === 1 ? '1 dokument' : n < 5 ? `${n} dokumenty` : `${n} dokumentov`)

/** Filing in one go: everything to send in one ZIP, and one form for the numbers and receipts afterwards. */
const Bundle: FC<{ b: BundleView }> = ({ b }) => {
  const extras = b.extras ?? []
  const files = b.toSend.length + extras.length
  if (b.toSend.length === 0 && b.toConfirm.length === 0 && extras.length === 0) {
    return b.recorded > 0 ? <p class="notice notice--ok">Zaevidované: {b.recorded}. Všetko je odoslané a doložené.</p> : null
  }
  const groups = Object.entries(DESTINATIONS)
    .map(([id, d]) => ({ id, name: d.name, rows: b.toSend.filter((i) => i.destination === id) }))
    .filter((g) => g.rows.length > 0)
  return (
    <section class="info bundle" aria-labelledby="balik-title">
      <h2 class="info__title" id="balik-title">
        Podanie jedným balíkom
      </h2>
      {b.recorded > 0 ? <p class="notice notice--ok">Zaevidované: {b.recorded}.</p> : null}
      {b.errors.form ? (
        <p class="notice notice--error" role="alert">
          {b.errors.form}
        </p>
      ) : Object.keys(b.errors).length > 0 ? (
        <p class="notice notice--error" role="alert">
          Pri niektorých dokumentoch treba ešte niečo doplniť. Ostatné sme zaevidovali.
        </p>
      ) : null}
      <ol class="bundle__steps">
        {files > 0 ? (
          <li>
            <span>
              <strong>Stiahnite balík.</strong> {documents(files)} v priečinkoch podľa úradu, s prehľadom, čo kam patrí.
            </span>
            <a class="btn btn--blue" href="/ucto/podania/balik.zip">
              Stiahnuť balík na podanie
            </a>
          </li>
        ) : null}
        {files > 0 ? (
          <li>
            <span>
              <strong>Nahrajte súbory na portáloch.</strong> Na portáli finančnej správy cez Načítať zo súboru, výkazy poistného v elektronických pobočkách poisťovní
              {extras.length > 0 ? ', priznania OSS na portáli OSS, hlásenia Intrastat na intrastat.financnasprava.sk' : ''}.
            </span>
          </li>
        ) : null}
        <li>
          <span>
            <strong>Zaevidujte všetko naraz.</strong> Číslo podania stačí. Keď priložíte aj skontrolovanú potvrdenku, podanie je hotové.
          </span>
        </li>
      </ol>
      <form class="bundle__form" method="post" action="/ucto/podania/naraz" enctype="multipart/form-data">
        <label class="field bundle__day">
          <span class="field__label">Dátum podania alebo potvrdenky</span>
          <input class="field__input" type="date" name="externalOn" max={b.today} value={b.values.externalOn ?? b.today} required />
        </label>
        {groups.map((g) => (
          <fieldset class="bundle__group">
            <legend class="bundle__legend">Na odoslanie · {g.name}</legend>
            <ul class="plain bundle__rows">
              {g.rows.map((i) => (
                <BundleRowFields i={i} values={b.values} error={b.errors[rowKey(i)]} send />
              ))}
            </ul>
          </fieldset>
        ))}
        {extras.length > 0 ? (
          <fieldset class="bundle__group">
            <legend class="bundle__legend">Na odoslanie · OSS a Intrastat</legend>
            <ul class="plain bundle__rows">
              {extras.map((e) => (
                <ExtraRowFields e={e} values={b.values} error={b.errors[e.key]} />
              ))}
            </ul>
          </fieldset>
        ) : null}
        {b.toConfirm.length > 0 ? (
          <fieldset class="bundle__group">
            <legend class="bundle__legend">Odoslané, čakajú na potvrdenku</legend>
            <ul class="plain bundle__rows">
              {b.toConfirm.map((i) => (
                <BundleRowFields i={i} values={b.values} error={b.errors[rowKey(i)]} send={false} />
              ))}
            </ul>
          </fieldset>
        ) : null}
        <p class="small">Riadok, ktorý necháte prázdny, nezmeníme. Prijatie evidujeme len s potvrdenkou, ktorú ste skontrolovali.</p>
        <button class="btn btn--blue" type="submit">
          Zaevidovať naraz
        </button>
      </form>
    </section>
  )
}

export const FilingQueuePage: FC<{ rows: FilingWorkItem[]; page: number; hasNext: boolean; bundle?: BundleView }> = ({ rows, page, hasNext, bundle }) => <div class="filing-work">
  <Heading first="Podania" second="na dokončenie" />
  <p class="info__lead">Najprv odmietnuté a sporné potvrdenia, potom čakajúce odoslania a pripravené dokumenty. Aktuálne podania zostávajú v tomto zozname aj zo starších období.</p>
  <p><a class="link" href="/ucto/terminy">Termíny a povinnosti</a></p>
  {bundle ? <Bundle b={bundle} /> : null}
  {rows.length === 0 ? <section class="info"><h2 class="info__title">Žiadne aktuálne podanie na dokončenie</h2><p>Staršie interné označenia bez pôvodného súboru nájdete v prehľade konkrétnej firmy. Tento zoznam nepotvrdzuje ich prijatie.</p></section> : null}
  {rows.map((p) => <article class="info filing-card"><h2 class="info__title">{p.company_name}</h2><p>{p.label ?? (p.kind ? FILING_KINDS[p.kind] : 'Dokument')} · {label(p.period)}</p>
    <p><span class={`pill pill--${DELIVERY_TONE[p.status]}`}>{DELIVERY_LABELS[p.status]}</span></p>
    <a class="btn btn--line" href={p.href ?? `/ucto/klienti/${p.company_id}/podania/${p.id}`}>Dokončiť podanie</a>
  </article>)}
  <nav class="filing-pagination" aria-label="Strany pracovného zoznamu">{page > 1 ? <a class="btn btn--line" href={`/ucto/podania?strana=${page - 1}`}>Predchádzajúca strana</a> : null}{hasNext ? <a class="btn btn--line" href={`/ucto/podania?strana=${page + 1}`}>Ďalšia strana</a> : null}</nav>
</div>
export const FilingsPage: FC<{ company: Company; packages: (Omit<FilingPackage, 'xml'> & { current: boolean })[]; base: string; legacy: boolean; period?: string; page?: number; hasNext?: boolean; payrollHref?: string }> = ({ company, packages, base, legacy, period, page = 1, hasNext, payrollHref }) => (
  <div class="filing-work">
    <Heading first="Podania" second="a potvrdenky" />
    {base.startsWith('/ucto')
      ? <p class="info__lead">{company.name}: každý dokument má vlastný stav doručenia. Pripravené podklady ešte neznamenajú prijatie podateľňou.</p>
      : <p class="info__lead">Priznania a výkazy, ktoré podávame za Vašu firmu. Pri každom vidíte, či ho úrad prijal, a potvrdenku si stiahnete.</p>}
    <p><a class="link" href={base.startsWith('/ucto') ? `/ucto/klienti/${company.id}` : '/app/dane'}>{base.startsWith('/ucto') ? 'Späť na prehľad' : 'Späť na Dane'}</a>{period ? <> · <a class="link" href={base}>Všetky obdobia</a></> : null}</p>
    {payrollHref ? <p><a class="link" href={payrollHref}>Mzdové podania a potvrdenky</a></p> : null}
    {legacy ? <p class="notice">Staršie interné označenia nemajú doložené prijatie. Nevydávame ich za potvrdenie od úradu.</p> : null}
    {packages.length === 0 ? <section class="info"><h2 class="info__title">Žiadne uložené podklady</h2><p>Po odbornej kontrole a uložení podkladov sa tu zobrazia jednotlivé dokumenty a ich potvrdenia.</p></section> : null}
    {packages.map((p) => <article class="info filing-card">
      <h2 class="info__title">{FILING_KINDS[p.kind]} · {label(p.period)}</h2>
      <p><span class={`pill pill--${DELIVERY_TONE[p.status]}`}>{(base.startsWith('/ucto') ? DELIVERY_LABELS : CLIENT_DELIVERY_LABELS)[p.status]}</span>{p.current ? null : <span class="pill pill--grey">Staršia verzia</span>}</p>
      <a class="btn btn--line" href={`${base}/${p.id}`}>{base.startsWith('/ucto') ? 'Otvoriť podanie a ďalší krok' : 'Zobraziť podanie'}</a>
    </article>)}
    {page > 1 || hasNext ? <nav class="filing-pagination" aria-label="Strany podaní">
      {page > 1 ? <a class="btn btn--line" href={`${base}?${new URLSearchParams({ ...(period ? { obdobie: period } : {}), strana: String(page - 1) })}`}>Novšie podania</a> : null}
      {hasNext ? <a class="btn btn--line" href={`${base}?${new URLSearchParams({ ...(period ? { obdobie: period } : {}), strana: String(page + 1) })}`}>Staršie podania</a> : null}
    </nav> : null}
  </div>
)
const ACTION_LABELS: Partial<Record<DeliveryState, string>> = {
  submitted: 'Evidovať odoslanie mimo Firmony', accepted: 'Doložiť prijatie podateľňou', rejected: 'Evidovať odmietnutie', review: 'Otvoriť preverenie potvrdenia',
}
export const DeliveryForm: FC<{ action: string; revision: number; choices: DeliveryState[]; today: string; values?: Record<string, string>; channel?: string; payload?: string; labels?: Partial<Record<DeliveryState, string>> }> = ({ action, revision, choices, today, values = {}, channel = 'Osobná internetová zóna finančnej správy', payload = 'uloženého XML', labels = ACTION_LABELS }) => (
      <form class="stack filing-form" method="post" action={action} enctype="multipart/form-data">
        <input type="hidden" name="revision" value={revision} />
        <div class="field"><label class="field__label" for="filing-state">Čo evidujete</label><select class="field__input" id="filing-state" name="to">{choices.map((s) => <option value={s} selected={values.to === s}>{labels[s]}</option>)}</select></div>
        <div class="field"><label class="field__label" for="filing-day">Dátum udalosti na portáli alebo potvrdenke</label><input class="field__input" id="filing-day" type="date" name="externalOn" max={today} value={values.externalOn ?? today} required /></div>
        <div class="field"><label class="field__label" for="filing-channel">Portál alebo spôsob doručenia</label><input class="field__input" id="filing-channel" name="channel" value={values.channel ?? channel} maxlength={120} required /></div>
        <div class="field"><label class="field__label" for="filing-reference">Číslo konkrétneho podania alebo potvrdenky</label><input class="field__input" id="filing-reference" name="reference" value={values.reference ?? ''} minlength={4} maxlength={160} required /></div>
        <div class="field"><label class="field__label" for="filing-file">Potvrdenka alebo informácia o odmietnutí</label><input class="field__input" id="filing-file" name="receipt" type="file" accept=".pdf,.xml,.jpg,.jpeg,.png,.webp,.asice,.asics" /><p class="small">Pri prijatí a odmietnutí je príloha povinná. Najviac 10 MB. Každé nové potvrdenie pridá záznam do histórie.</p></div>
        <div class="field"><label class="field__label" for="filing-reason">Dôvod a ďalší postup</label><textarea class="field__input field__area" id="filing-reason" name="reason" maxlength={1200} rows={3}>{values.reason ?? ''}</textarea><p class="small">Pri odmietnutí, preverovaní a opätovnom odoslaní uveďte aspoň 12 znakov.</p></div>
        <label class="tickbox"><input type="checkbox" name="checked" value="1" checked={values.checked === '1'} /><span>Skontroloval(a) som, že potvrdenka zodpovedá tejto firme, obdobiu, typu dokumentu, číslu podania a odoslaniu {payload} a dokladá zvolený výsledok.</span></label>
        <button class="btn btn--blue stack__submit" type="submit">Uložiť záznam</button>
      </form>
)
export const FilingPage: FC<{
  company: Company; pkg: FilingPackage; events: FilingEvent[]; current: boolean; base: string; user?: User; today: string
  error?: string; values?: Record<string, string>; frozen?: boolean
}> = ({ company, pkg: p, events, current, base, user, today, error, values = {}, frozen }) => {
  const choices = user && !frozen ? TRANSITIONS[p.status].filter((to) => canTransition(p.status, to, user.team === 'admin')) : []
  const client = !base.startsWith('/ucto')
  const labels = client ? CLIENT_DELIVERY_LABELS : DELIVERY_LABELS
  return <div class="filing-work">
    <p><a class="link" href={`${base}?obdobie=${p.period}`}>Podania za {label(p.period)}</a></p>
    <Heading first={FILING_KINDS[p.kind]} second={label(p.period)} />
    <p class="info__lead">{company.name}</p>
    <p><span class={`pill pill--${DELIVERY_TONE[p.status]}`}>{labels[p.status]}</span></p>
    {!current ? <p class="notice">Toto sú staršie podklady. Ich potvrdenie nemení stav aktuálnej verzie dokumentu.</p> : null}
    {frozen ? <p class="notice">Účtovníctvo je uzamknuté na odovzdanie. Uložené podania a potvrdenky sú dostupné na čítanie.</p> : null}
    {p.status === 'accepted' ? <p class="notice">{client ? 'Úrad podanie prijal. Potvrdenku sme skontrolovali a nájdete ju nižšie.' : 'Prijatie evidujeme podľa priloženej potvrdenky, ktorú skontroloval účtovník.'}</p> : null}
    <section class="info filing-document"><h2 class="info__title">{client ? 'Podaný súbor' : 'Uložený dokument'}</h2><p>{p.name}</p><a class="btn btn--line" href={`${base}/${p.id}/dokument.xml`}>{client ? 'Stiahnuť súbor (XML)' : 'Stiahnuť presné uložené XML'}</a></section>
    {error ? <p class="notice notice--error" role="alert">{error}</p> : null}
    {choices.length ? <section class="info"><h2 class="info__title">Ďalší krok</h2>
      <p>Podanie vykonajte oprávneným prístupom na príslušnom portáli. Ak už máte potvrdenku, môžete rovno doložiť výsledok. Samotné prevzatie portálom nenahrádza potvrdenku o prijatí podateľňou.</p>
      <DeliveryForm action={`${base}/${p.id}/stav`} revision={p.revision} choices={choices} today={today} values={values} />
    </section> : null}
    <section class="info"><h2 class="info__title">{client ? 'Priebeh podania' : 'História doručenia'}</h2>
      {events.length === 0 ? <p>{client ? `Pripravili sme ho ${dayName(dayOf(p.created_at))}. Keď ho úrad prijme, nájdete tu potvrdenku.` : `Podklady boli uložené ${dayName(dayOf(p.created_at))}. Odoslanie ani prijatie zatiaľ nie sú doložené.`}</p> : <ol class="plain filing-history">{events.map((e) => <li class="filing-event">
        <h3>{labels[e.to_state]}</h3><p>{dayName(e.external_on)} · {e.by_name ?? 'Účtovný tím'}</p><p>{e.channel} · {e.reference}</p>
        {e.reason ? <p>{e.reason}</p> : null}{e.file_key ? <a class="link" href={`${base}/${p.id}/potvrdenka/${e.id}`}>Stiahnuť potvrdenku</a> : null}
      </li>)}</ol>}
    </section>
  </div>
}
