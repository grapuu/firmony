import type { FC } from 'hono/jsx'
import type { Company, User } from '../app/store'
import { monthName, dayName } from '../app/copy'
import { DELIVERY_TONE, TRANSITIONS, canTransition, type FilingEvent } from '../filings/model'
import { REPORT_KINDS, REPORT_LABELS, type ReportItem, type ReportPackage, type ReportTarget } from '../payroll-reporting/model'
import type { RunEvidence } from '../payroll-reporting/store'
import { Heading } from './inside'
import { DeliveryForm } from './filings'
import type { GenerationEvidence, TargetReview, reviewScope } from '../payroll-reporting/generation-store'

const month = (p: string) => monthName(`${p}-01`)
const tone = (p: ReportItem) => p.sourceChanged ? 'red' : DELIVERY_TONE[p.status]
export const PayrollReportsPage: FC<{ company: Company; items: ReportItem[]; runs: RunEvidence[]; base: string; user?: User; today: string; frozen: boolean; period?: string; page?: number; hasNext?: boolean; error?: string; values?: Record<string, string> }> = ({ company, items, runs, base, user, today, frozen, period, page = 1, hasNext, error, values = {} }) => <div class="filing-work">
  <Heading first="Mzdové podania" second="a potvrdenky" />
  <p class="info__lead">{company.name}. Každá poisťovňa a finančná správa majú vlastný výkaz, obdobie a potvrdenie.</p>
  <p><a class="link" href={user ? `/ucto/klienti/${company.id}/mzdy${period ? `?obdobie=${period}` : ''}` : '/app/podania'}>Späť na prehľad</a>{period ? <> · <a class="link" href={base}>Všetky obdobia</a></> : null}</p>
  {error ? <p class="notice notice--error" role="alert">{error}</p> : null}
  {frozen ? <p class="notice">Účtovníctvo je uzamknuté na odovzdanie. Výkazy a dôkazy sú dostupné na čítanie.</p> : null}
  {runs.map((r) => <section class="info payroll-evidence" id={`vyplata-${r.period}`}>
    <h2 class="info__title">Mzdy za {month(r.period)}</h2>
    {!r.closureId ? <>
      <p>Uzávierka nemá samostatnú evidenciu výkazov. Staršie ručné označenie nepotvrdzuje prijatie jednotlivými príjemcami.</p>
      {user && !frozen ? <form method="post" action={`${base}/zalozit`} class="payroll-init"><input type="hidden" name="period" value={r.period} /><button class="btn btn--line" type="submit">Založiť evidenciu tejto uzávierky</button></form> : null}
    </> : <>
      {!r.needsPayout ? <p>Uzávierka neobsahuje príjmy na výplatu. Prípadné ďalšie príjmy mimo nej musí preveriť účtovný tím.</p> : r.payouts[0] ? <p>Skutočné vyplatenie príjmov: <strong>{dayName(r.payouts[0].paid_on, today)}</strong>. {r.payouts[0].report_period ? <>Overené obdobie prehľadu FS: <strong>{month(r.payouts[0].report_period)}</strong>.</> : <strong>Vykazované obdobie FS ešte musí preveriť správca.</strong>}</p> : <p>{user ? 'Plánovaný výplatný termín nepotvrdzuje skutočné vyplatenie. Overte skutočnú výplatu a osobitne určte vykazované obdobie prehľadu FS.' : 'Účtovný tím preverí skutočné vyplatenie príjmov a vykazované obdobie prehľadu pre finančnú správu.'}</p>}
      {user && !frozen && (!r.payouts.length && r.needsPayout || r.payouts.length > 0 && user.team === 'admin') ? <details class="payroll-payout" open={!r.payouts.length || values.period === r.period}>
        <summary>{r.payouts.length ? 'Preveriť alebo opraviť výplatu a obdobie prehľadu' : 'Potvrdiť skutočné vyplatenie'}</summary>
        <form class="stack" method="post" action={`${base}/vyplata`}>
          <input type="hidden" name="period" value={r.period} /><input type="hidden" name="closure" value={r.closureId} /><input type="hidden" name="revision" value={r.payouts[0]?.revision ?? 0} />
          <div class="field"><label class="field__label" for={`paid-${r.period}`}>Skutočný dátum vyplatenia všetkých príjmov</label><input class="field__input" id={`paid-${r.period}`} type="date" name="paidOn" min={`${r.period}-01`} max={today} required value={values.period === r.period ? values.paidOn : r.payouts[0]?.paid_on ?? ''} /></div>
          <div class="field"><label class="field__label" for={`report-period-${r.period}`}>Odborne overené obdobie prehľadu FS</label><input class="field__input" id={`report-period-${r.period}`} type="month" name="reportPeriod" min={r.period} max={today.slice(0, 7)} required value={values.period === r.period ? values.reportPeriod : r.payouts[0]?.report_period ?? ''} /><p class="small">Overte podľa zúčtovania, skutočnej výplaty a poučenia FS. Mesiac bankového prevodu sa sem automaticky nekopíruje.</p></div>
          <div class="field"><label class="field__label" for={`ref-${r.period}`}>Referencia overenia výplaty</label><input class="field__input" id={`ref-${r.period}`} name="reference" minlength={12} maxlength={240} required value={values.period === r.period ? values.reference : ''} /><p class="small">Napríklad identifikátor bankových transakcií a overeného výpisu. Samotný platobný príkaz nestačí.</p></div>
          {r.payouts.length ? <div class="field"><label class="field__label" for={`why-${r.period}`}>Dôvod opravy</label><textarea class="field__input field__area" id={`why-${r.period}`} name="reason" minlength={12} maxlength={1200} required>{values.period === r.period ? values.reason : ''}</textarea></div> : null}
          <label class="tickbox"><input type="checkbox" name="checked" value="1" required checked={values.period === r.period && values.checked === '1'} /><span>Overil(a) som, že všetky príjmy tejto uzávierky boli skutočne vyplatené v uvedený deň. Nejde o plán ani čiastočnú výplatu. Samostatne som preveril(a) správne vykazované obdobie prehľadu FS.</span></label>
          <p class="small">Pri čiastočných výplatách, rôznych dátumoch alebo ďalších príjmoch v mesiaci musí odborník posúdiť úplný prehľad. Potvrdenie výplaty nie je potvrdenie podania.</p>
          <button class="btn btn--blue stack__submit" type="submit">Uložiť overenú výplatu</button>
        </form>
      </details> : null}
      {r.payouts.length ? <details><summary>História overenia výplaty</summary><ol class="plain filing-history">{r.payouts.map((p) => <li class="filing-event"><strong>{dayName(p.paid_on, today)}</strong><p>{p.reference}</p><p>{p.report_period ? `Prehľad FS za ${month(p.report_period)}` : 'Vykazované obdobie FS nebolo overené'}</p><p class="small">{p.by_name ?? 'Účtovný tím'} · <time datetime={new Date(p.at * 1000).toISOString()}>{new Date(p.at * 1000).toLocaleString('sk-SK', { timeZone: 'Europe/Bratislava' })}</time></p>{p.reason ? <p>{p.reason}</p> : null}</li>)}</ol></details> : null}
    </>}
  </section>)}
  {items.length === 0 ? <section class="info"><h2 class="info__title">Žiadne evidované výkazy</h2><p>Po uzavretí miezd sa vytvoria povinnosti pre Sociálnu poisťovňu a príslušné zdravotné poisťovne. Prehľad finančnej správy vznikne po overení výplaty a vykazovaného obdobia.</p></section> : null}
  {items.map((r) => <article class="info filing-card payroll-report-card">
    <h2 class="info__title">{REPORT_KINDS[r.kind]} · {month(r.period)}</h2>
    <p><span class={`pill pill--${tone(r)}`}>{r.sourceChanged ? 'Podklady sa po uložení zmenili' : r.pkg ? REPORT_LABELS[r.status] : 'Treba doložiť pôvodný výkaz'}</span>{!r.active ? <span class="pill pill--grey">{r.kind === 'tax' ? 'Vyradené po odbornom preverení' : 'Staršia uzávierka'}</span> : null}</p>
    <p>Vybaviť do {dayName(r.due_on, today)}{r.kind === 'tax' ? ' · podľa odborne overeného obdobia' : ''}</p>
    <a class="btn btn--line" href={`${base}/${r.id}`}>{user ? 'Otvoriť výkaz a ďalší krok' : 'Zobraziť výkaz'}</a>
  </article>)}
  {page > 1 || hasNext ? <nav class="filing-pagination" aria-label="Strany mzdových podaní">{page > 1 ? <a class="btn btn--line" href={`${base}?${new URLSearchParams({ ...(period ? { obdobie: period } : {}), strana: String(page - 1) })}`}>Novšie podania</a> : null}{hasNext ? <a class="btn btn--line" href={`${base}?${new URLSearchParams({ ...(period ? { obdobie: period } : {}), strana: String(page + 1) })}`}>Staršie podania</a> : null}</nav> : null}
</div>

export const PayrollReportPage: FC<{ company: Company; target: ReportTarget; item: ReportItem; packages: ReportPackage[]; selected: ReportPackage | null; events: FilingEvent[]; base: string; user?: User; frozen: boolean; today: string; error?: string; values?: Record<string, string>; generation?: GenerationEvidence | null; reviews: TargetReview[]; scope: Awaited<ReturnType<typeof reviewScope>> | null }> = ({ company, target: t, item, packages, selected: p, events, base, user, frozen, today, error, values = {}, generation, reviews, scope }) => {
  const current = Boolean(p && t.package_id === p.id), canUpload = Boolean(user && !frozen && item.active && (!p || current) && (!item.pkg || ['prepared', 'rejected'].includes(item.pkg.status) || user.team === 'admin'))
  const choices = p && user && !frozen ? TRANSITIONS[p.status].filter((to) => canTransition(p.status, to, user.team === 'admin')) : []
  const versionBase = `${base}/${t.id}/verzie`
  return <div class="filing-work">
    <p><a class="link" href={`${base}?obdobie=${t.period}`}>Mzdové podania za {month(t.period)}</a></p>
    <Heading first={REPORT_KINDS[t.kind]} second={month(t.period)} />
    <p class="info__lead">{company.name} · vybaviť do {dayName(t.due_on, today)}</p>
    <p><span class={`pill pill--${current && item.sourceChanged ? 'red' : p ? DELIVERY_TONE[p.status] : 'amber'}`}>{current && item.sourceChanged ? 'Podklady sa po uložení zmenili' : p ? REPORT_LABELS[p.status] : 'Treba doložiť pôvodný výkaz'}</span>{p && !current ? <span class="pill pill--grey">Staršia verzia</span> : null}</p>
    {error ? <p class="notice notice--error" role="alert">{error}</p> : null}
    {item.sourceChanged ? <p class="notice notice--error">Od uloženia výkazu sa zmenili podklady, overenie výplaty alebo identifikácia poistenca. Staršia potvrdenka neuzatvára aktuálnu povinnosť. Odborník musí preveriť správny druh opravy a úplnosť podania.</p> : null}
    {!item.active ? <p class="notice">{t.kind === 'tax' ? 'Táto povinnosť bola po odbornom preverení vyradená z pracovného zoznamu.' : 'Táto uzávierka už nie je aktuálna.'} Pôvodné súbory a história zostávajú zachované.</p> : null}
    {item.active && reviews.length ? <p class="notice">Predchádzajúce vyradenie už nepokrýva aktuálne podklady alebo nové dôkazy. Účtovný tím ich preverí znova; pôvodná história zostáva zachovaná.</p> : null}
    {frozen ? <p class="notice">Účtovníctvo je uzamknuté na odovzdanie. Doklady sú dostupné na čítanie.</p> : null}
    {p ? <section class="info filing-document"><h2 class="info__title">Pôvodný výkaz</h2><p>{p.name} · {p.variant}</p>{p.reason ? <p>{p.reason}</p> : null}<a class="btn btn--line" href={`${versionBase}/${p.id}/dokument`}>Stiahnuť pôvodný výkaz</a>{p.status === 'accepted' ? <p class="small">Prijatie evidujeme podľa priloženej potvrdenky skontrolovanej účtovníkom. Neznamená schválenie vecnej správnosti.</p> : null}</section> : null}
    {canUpload && t.kind === 'tax' ? <section class="info"><h2 class="info__title">Pripraviť prehľad z miezd</h2><p>Bežné mzdy bez bonusov a osobitných daňových úprav môžeme zostaviť do PREHLADv26 z overených podkladov.</p><a class="btn btn--blue" href={`${base}/${t.id}/pripravit`}>Skontrolovať a pripraviť XML</a></section> : null}
    {canUpload && /^health(?:24|25|27)$/.test(t.kind) ? <section class="info"><h2 class="info__title">Pripraviť zdravotný výkaz z miezd</h2><p>Dávku 514 zostavíme z uložených pások a overených poistencov. Sumy sa neprepisujú ručne.</p><a class="btn btn--blue" href={`${base}/${t.id}/pripravit`}>Skontrolovať a pripraviť dávku 514</a></section> : null}
    {generation ? <section class="info prehlad-origin"><h2 class="info__title">Vytvorené vo Firmony</h2><p>{generation.format} · odbornú kontrolu zaznamenal(a) {generation.by_name ?? 'účtovný tím'}. Presné podklady a rozsah kontroly zostávajú zachované v histórii a úplnom exporte.</p></section> : null}
    {canUpload ? <details class="info payroll-upload" open={!p || Boolean(values.variant)}><summary>{item.pkg ? 'Pripraviť ďalšiu verziu výkazu' : 'Doložiť externý súbor výkazu'}</summary>
      <p>Výkaz pripravte a odborne skontrolujte na príslušnom portáli alebo v mzdovom programe. Uložte presný súbor. Pri prehľade finančnej správy skontrolujte všetky príjmy patriace do vykazovaného obdobia, aj tie mimo tejto aplikácie.</p>
      <form class="stack payroll-report-upload" method="post" action={`${base}/${t.id}/subor`} enctype="multipart/form-data">
        <input type="hidden" name="revision" value={t.revision} />
        <div class="field"><label class="field__label" for="report-variant">Druh a verzia formulára</label><input class="field__input" id="report-variant" name="variant" minlength={2} maxlength={120} value={values.variant ?? ''} required /><p class="small">Napríklad riadny mesačný výkaz, opravný výkaz alebo konkrétna verzia prehľadu. Správny typ zvolí odborník.</p></div>
        <div class="field"><label class="field__label" for="report-file">Presný súbor výkazu</label><input class="field__input" id="report-file" name="report" type="file" accept=".xml,.txt,.csv,.pdf,.asice,.asics" required /><p class="small">XML, textová dávka, PDF alebo ASiC; najviac 10 MB. Nahratie ešte neznamená odoslanie.</p></div>
        {item.pkg || t.kind === 'tax' ? <div class="field"><label class="field__label" for="report-reason">Dôvod a rozsah podania</label><textarea class="field__input field__area" id="report-reason" name="reason" maxlength={1200} minlength={item.pkg ? 12 : undefined} required={Boolean(item.pkg)}>{values.reason ?? ''}</textarea></div> : null}
        <label class="tickbox"><input type="checkbox" name="checked" value="1" required checked={values.checked === '1'} /><span>Skontroloval(a) som presný súbor, správneho príjemcu, firmu, obdobie, druh formulára, všetky potrebné údaje a úplnosť podania.</span></label>
        <button class="btn btn--blue stack__submit" type="submit">Uložiť pôvodný výkaz</button>
      </form>
    </details> : null}
    {choices.length && p ? <section class="info"><h2 class="info__title">Doručenie tejto verzie</h2><p>Odoslanie aj výsledok overte na portáli príjemcu. Doloženie výsledku vyžaduje potvrdenku zodpovedajúcu tomuto súboru a obdobiu.</p>
      <DeliveryForm action={`${versionBase}/${p.id}/stav`} revision={p.revision} choices={choices} today={today} values={values} payload="uloženého výkazu" channel={t.kind === 'tax' ? 'Finančná správa – OIZ' : t.kind === 'sp' ? 'Sociálna poisťovňa – eSlužby' : 'Elektronická pobočka zdravotnej poisťovne'} labels={{ submitted: 'Evidovať odoslanie mimo Firmony', accepted: 'Doložiť prijatie príjemcom', rejected: 'Evidovať odmietnutie', review: 'Otvoriť preverenie potvrdenia' }} />
    </section> : null}
    {p ? <section class="info"><h2 class="info__title">História doručenia tejto verzie</h2>{!events.length ? <p>Odoslanie ani prijatie zatiaľ nie sú doložené.</p> : <ol class="plain filing-history">{events.map((e) => <li class="filing-event"><h3>{REPORT_LABELS[e.to_state]}</h3><p>{dayName(e.external_on, today)} · {e.by_name ?? 'Účtovný tím'}</p><p>{e.channel} · {e.reference}</p>{e.reason ? <p>{e.reason}</p> : null}{e.file_key ? <a class="link" href={`${versionBase}/${p.id}/potvrdenka/${e.id}`}>Stiahnuť potvrdenku</a> : null}</li>)}</ol>}</section> : null}

    {user?.team === 'admin' && !frozen && scope?.canRetire && (!p || current) ? <details class="info payroll-scope"><summary>Odborne vyriešiť nesprávne založenú povinnosť</summary><p>Pre toto obdobie už nie sú priradené žiadne vyplatené príjmy. Overte všetky príjmy firmy aj prípadné skutočne podané prehľady a ich potrebné opravy. Táto akcia mení pracovnú evidenciu; nepodáva ani neodvoláva výkaz na FS.</p><form class="stack" method="post" action={`${base}/${t.id}/preverit-rozsah`} enctype="multipart/form-data"><input type="hidden" name="revision" value={scope.revision} /><div class="field"><label class="field__label" for="scope-reference">Referencia odborného vyriešenia</label><input class="field__input" id="scope-reference" name="reference" minlength={12} maxlength={240} required value={values.reviewReference ?? ''} /></div><div class="field"><label class="field__label" for="scope-reason">Dôvod a vyriešenie pôvodných podaní</label><textarea class="field__input field__area" id="scope-reason" name="reason" minlength={24} maxlength={1200} required>{values.reviewReason ?? ''}</textarea></div><div class="field"><label class="field__label" for="scope-evidence">Pôvodný odborný alebo úradný podklad{scope.sent ? ' · povinné' : ' · voliteľné'}</label><input class="field__input" type="file" id="scope-evidence" name="evidence" required={Boolean(scope.sent)} accept=".xml,.txt,.pdf,.asice,.asics" /></div><label class="tickbox"><input type="checkbox" name="checked" value="1" required /><span>Overil(a) som všetky príjmy a povinnosti za toto obdobie, vyriešil(a) prípadné podané prehľady a ich opravy a potvrdzujem vyradenie nesprávne založenej povinnosti z pracovného zoznamu.</span></label><button class="btn btn--line" type="submit">Zaznamenať odborné vyriešenie</button></form></details> : null}
    {reviews.length ? <section class="info"><h2 class="info__title">Odborné preverenia obdobia</h2><ol class="plain filing-history">{reviews.map((r) => <li class="filing-event"><h3>Vyradenie nesprávne založenej povinnosti</h3><p>{r.by_name ?? 'Správca'} · {r.reference}</p><p>{r.reason}</p>{r.file_key ? <a class="link" href={`${base}/${t.id}/preverenia/${r.id}/dokument`}>Stiahnuť podklad preverenia</a> : null}</li>)}</ol></section> : null}
    {packages.length ? <section class="info"><h2 class="info__title">Uložené verzie výkazu</h2><ol class="plain filing-history">{packages.map((v) => <li class="filing-event"><a class="link" href={`${versionBase}/${v.id}`}>{v.variant} · {v.name}</a><p>{REPORT_LABELS[v.status]}{v.id === t.package_id ? ' · aktuálna verzia' : ' · staršia verzia'}</p></li>)}</ol></section> : null}
  </div>
}
