import type { FC } from 'hono/jsx'
import type { Company, User } from '../app/store'
import { dayName } from '../app/copy'
import { periodName } from '../app/vat-store'
import { canTransition, DELIVERY_LABELS, DELIVERY_TONE, FILING_KINDS, TRANSITIONS, type DeliveryStatus, type DeliveryState, type FilingEvent, type FilingPackage, type FilingWorkItem } from '../filings/model'
import { Heading } from './inside'
import { dayOf } from './inside-pages'

const label = (period: string) => period.length === 4 ? `rok ${period}` : periodName(period)
export const DeliveryNotice: FC<{ status?: DeliveryStatus; href: string }> = ({ status = 'unverified', href }) => (
  <p class="notice">
    <span class={`pill pill--${DELIVERY_TONE[status]}`}>{DELIVERY_LABELS[status]}</span>{' '}
    <a class="link" href={href}>Podania a potvrdenky</a>
  </p>
)
export const FilingQueuePage: FC<{ rows: FilingWorkItem[]; page: number; hasNext: boolean }> = ({ rows, page, hasNext }) => <div class="filing-work">
  <Heading first="Podania" second="na dokončenie" />
  <p class="info__lead">Najprv odmietnuté a sporné potvrdenia, potom čakajúce odoslania a pripravené dokumenty. Aktuálne podania zostávajú v tomto zozname aj zo starších období.</p>
  <p><a class="link" href="/ucto/terminy">Termíny a povinnosti</a></p>
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
    <p class="info__lead">{company.name}. Každý dokument má vlastný stav doručenia. Pripravené podklady ešte neznamenajú prijatie podateľňou.</p>
    <p><a class="link" href={base.startsWith('/ucto') ? `/ucto/klienti/${company.id}` : '/app/dane'}>Späť na prehľad</a>{period ? <> · <a class="link" href={base}>Všetky obdobia</a></> : null}</p>
    {payrollHref ? <p><a class="link" href={payrollHref}>Mzdové podania a potvrdenky</a></p> : null}
    {legacy ? <p class="notice">Staršie interné označenia nemajú doložené prijatie. Nevydávame ich za potvrdenie od úradu.</p> : null}
    {packages.length === 0 ? <section class="info"><h2 class="info__title">Žiadne uložené podklady</h2><p>Po odbornej kontrole a uložení podkladov sa tu zobrazia jednotlivé dokumenty a ich potvrdenia.</p></section> : null}
    {packages.map((p) => <article class="info filing-card">
      <h2 class="info__title">{FILING_KINDS[p.kind]} · {label(p.period)}</h2>
      <p><span class={`pill pill--${DELIVERY_TONE[p.status]}`}>{DELIVERY_LABELS[p.status]}</span>{p.current ? null : <span class="pill pill--grey">Staršia verzia</span>}</p>
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
export const DeliveryForm: FC<{ action: string; revision: number; choices: DeliveryState[]; today: string; values?: Record<string, string>; channel?: string; payload?: string; labels?: Partial<Record<DeliveryState, string>> }> = ({ action, revision, choices, today, values = {}, channel = 'Finančná správa – OIZ', payload = 'uloženého XML', labels = ACTION_LABELS }) => (
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
  return <div class="filing-work">
    <p><a class="link" href={`${base}?obdobie=${p.period}`}>Podania za {label(p.period)}</a></p>
    <Heading first={FILING_KINDS[p.kind]} second={label(p.period)} />
    <p class="info__lead">{company.name}</p>
    <p><span class={`pill pill--${DELIVERY_TONE[p.status]}`}>{DELIVERY_LABELS[p.status]}</span></p>
    {!current ? <p class="notice">Toto sú staršie podklady. Ich potvrdenie nemení stav aktuálnej verzie dokumentu.</p> : null}
    {frozen ? <p class="notice">Účtovníctvo je uzamknuté na odovzdanie. Uložené podania a potvrdenky sú dostupné na čítanie.</p> : null}
    {p.status === 'accepted' ? <p class="notice">Prijatie evidujeme podľa priloženej potvrdenky, ktorú skontroloval účtovník.</p> : null}
    <section class="info filing-document"><h2 class="info__title">Uložený dokument</h2><p>{p.name}</p><a class="btn btn--line" href={`${base}/${p.id}/dokument.xml`}>Stiahnuť presné uložené XML</a></section>
    {error ? <p class="notice notice--error" role="alert">{error}</p> : null}
    {choices.length ? <section class="info"><h2 class="info__title">Ďalší krok</h2>
      <p>Podanie vykonajte oprávneným prístupom na príslušnom portáli. Ak už máte potvrdenku, môžete rovno doložiť výsledok. Samotné prevzatie portálom nenahrádza potvrdenku o prijatí podateľňou.</p>
      <DeliveryForm action={`${base}/${p.id}/stav`} revision={p.revision} choices={choices} today={today} values={values} />
    </section> : null}
    <section class="info"><h2 class="info__title">História doručenia</h2>
      {events.length === 0 ? <p>Podklady boli uložené {dayName(dayOf(p.created_at))}. Odoslanie ani prijatie zatiaľ nie sú doložené.</p> : <ol class="plain filing-history">{events.map((e) => <li class="filing-event">
        <h3>{DELIVERY_LABELS[e.to_state]}</h3><p>{dayName(e.external_on)} · {e.by_name ?? 'Účtovný tím'}</p><p>{e.channel} · {e.reference}</p>
        {e.reason ? <p>{e.reason}</p> : null}{e.file_key ? <a class="link" href={`${base}/${p.id}/potvrdenka/${e.id}`}>Stiahnuť potvrdenku</a> : null}
      </li>)}</ol>}
    </section>
  </div>
}
