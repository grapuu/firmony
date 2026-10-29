// Prehľad (team/overview.ts): the administrator's page of the whole firm. What burns, what came since, how much there is,
// every client against its plan, what clients complain about, and the check by Claude. The page asks for itself again
// every minute and a half (public/inside.js, data-refresh) and puts the parts that changed in place.
import type { FC } from 'hono/jsx'
import { formatCount, formatEur, typeset } from '../format'
import { whenName } from '../app/copy'
import { usdText } from '../analytics/model'
import { ALARM_LABELS, COMPLAINT_DAYS, FRESH_LABELS, VOLUME_LABELS, WINDOWS, type Alarm, type Overview, type UsageRow } from '../team/overview'
import { CHECK, checkUsd, type CheckLevel, type CheckWhere, type StoredCheck } from '../team/overview-check'
import type { PlanUsage, UsageState } from '../team/plan-usage'
import { Flash, Heading } from './inside'

const n = (value: number) => formatCount(value)

const LEVELS: Record<Alarm['level'], { text: string; tone: string }> = {
  hori: { text: 'Horí', tone: 'pill--red' },
  pozor: { text: 'Pozor', tone: 'pill--amber' },
  info: { text: 'Na vedomie', tone: 'pill--grey' },
}

const CHECK_TONES: Record<CheckLevel, { text: string; tone: string }> = {
  hori: { text: 'Horí', tone: 'pill--red' },
  pozor: { text: 'Pozor', tone: 'pill--amber' },
  dobre: { text: 'Dobre', tone: 'pill--ok' },
  info: { text: 'Na vedomie', tone: 'pill--grey' },
}

const STATES: Record<UsageState, { text: string; tone: string }> = {
  ok: { text: 'V limite', tone: 'pill--ok' },
  near: { text: 'Blízko limitu', tone: 'pill--amber' },
  over: { text: 'Nad balíkom', tone: 'pill--red' },
  agree: { text: 'Nad najvyšším', tone: 'pill--red' },
}

/**
 * The month's documents against the plan in one line, on the client's page of an administrator: where it stands and, past
 * the plan, what it is billed as. It leads to the overview's table of plans.
 */
export const UsageLine: FC<{ usage: PlanUsage }> = ({ usage: u }) => (
  <a class={`pill ${STATES[u.state].tone}`} href="/ucto/prehlad#baliky">
    {typeset(
      `Doklady ${n(u.docs)} / ${n(u.limit)}, ${STATES[u.state].text.toLowerCase()}${u.state === 'over' ? `, vyúčtujeme ako ${u.billedAs.name}` : u.state === 'agree' ? ', cenu dohodnúť' : ''}${u.free ? ', mesiac zadarmo' : ''}`,
    )}
  </a>
)

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'máj', 'jún', 'júl', 'aug', 'sep', 'okt', 'nov', 'dec']
const monthShort = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1] ?? ''}`

/** How long ago, in words: "dnes", "pred 3 dňami". */
function ago(at: number, since: number): string {
  const days = Math.floor((at - since) / 86400)
  if (days <= 0) return 'dnes'
  if (days === 1) return 'včera'
  return `pred ${days} dňami`
}

/** A bar of a share up to twice the limit, drawn as SVG so that its width needs no style attribute. */
const UseBar: FC<{ share: number; state: UsageState }> = ({ share, state }) => {
  const width = Math.max(0, Math.min(100, share * 50))
  return (
    <svg class={`anbar usebar usebar--${state}`} viewBox="0 0 100 8" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <rect class="anbar__track" x="0" y="0" width="100" height="8" rx="4" />
      {width > 0 ? <rect class="anbar__fill" x="0" y="0" width={String(Math.round(width * 10) / 10)} height="8" rx="4" /> : null}
      <rect class="usebar__limit" x="49.6" y="0" width="0.8" height="8" />
    </svg>
  )
}

const Firms: FC<{ alarm: Alarm }> = ({ alarm }) =>
  alarm.firms.length === 0 ? null : (
    <p class="ovalarm__firms">
      {alarm.firms.slice(0, 6).map((f, i) => (
        <>
          {i > 0 ? ', ' : ''}
          <a class="link" href={`/ucto/klienti/${f.id}`}>
            {f.name}
          </a>
        </>
      ))}
      {alarm.firms.length > 6 ? typeset(` a ďalší ${n(alarm.firms.length - 6)}`) : ''}
    </p>
  )

const Alarms: FC<{ o: Overview }> = ({ o }) => (
  <section class="ansec" aria-labelledby="ov-hori-t" id="hori" data-part="ov-alarms">
    <h2 id="ov-hori-t" class="anhead">
      Čo horí a čo čaká
    </h2>
    {o.alarms.filter((a) => a.level !== 'info').length === 0 ? (
      <section class="info info--soft">
        <p class="info__lead">{typeset('Nič nehorí a nič nečaká. Všetko je vybavené.')}</p>
      </section>
    ) : null}
    {o.alarms.length > 0 ? (
      <ul class="ovalarms">
        {o.alarms.map((a) => (
          <li class={`ovalarm ovalarm--${a.level}`}>
            <span class={`pill ${LEVELS[a.level].tone}`}>{LEVELS[a.level].text}</span>
            <div class="ovalarm__body">
              <a class="ovalarm__title" href={a.href}>
                {typeset(ALARM_LABELS[a.key])}
                {a.key === 'release' ? null : <span class="ovalarm__n">{n(a.n)}</span>}
              </a>
              {a.since ? <span class="ovalarm__since">{typeset(`najstaršie ${ago(o.at, a.since)}`)}</span> : null}
              <Firms alarm={a} />
            </div>
          </li>
        ))}
      </ul>
    ) : null}
  </section>
)

const Fresh: FC<{ o: Overview }> = ({ o }) => (
  <section class="ansec" aria-labelledby="ov-nove-t" id="nove" data-part="ov-fresh">
    <h2 id="ov-nove-t" class="anhead">
      {o.hours === 24 ? 'Nové za 24 hodín' : o.hours === 72 ? 'Nové za 3 dni' : 'Nové za 7 dní'}
    </h2>
    <nav class="filters" aria-label="Obdobie">
      {WINDOWS.map((h) => (
        <a class="filters__item" href={`/ucto/prehlad${h === 24 ? '' : `?za=${h}`}#nove`} aria-current={o.hours === h ? 'page' : undefined}>
          {h === 24 ? '24 hodín' : h === 72 ? '3 dni' : '7 dní'}
        </a>
      ))}
    </nav>
    <dl class="figs__grid ovfigs">
      {o.fresh.map((f) => (
        <div class={`fig anfig${f.n > 0 ? ' ovfig--new' : ''}`}>
          <dt>{FRESH_LABELS[f.key]}</dt>
          <dd class="fig__value">{n(f.n)}</dd>
        </div>
      ))}
    </dl>
  </section>
)

const Plans: FC<{ o: Overview }> = ({ o }) => {
  const over = o.plans.filter((p) => p.usage.state === 'over' || p.usage.state === 'agree')
  const extra = o.plans.reduce((s, p) => s + p.usage.extraCents, 0)
  return (
    <section class="ansec" aria-labelledby="ov-baliky-t" id="baliky" data-part="ov-plans">
      <h2 id="ov-baliky-t" class="anhead">
        Balíky a doklady tento mesiac
      </h2>
      <p class="phead__lead">
        {typeset(
          'Doklady rátame presne tak ako fakturácia: každý doklad, ktorý prišiel, raz, bez vymazaných, bez našich faktúr a bez otvorených položiek prevzatých od predošlej účtovníčky. Faktúry, ktoré klient vystaví v aplikácii, nerátame, ak to jeho zmluva sľubuje. Klient toto nevidí.',
        )}
      </p>
      {o.plans.length === 0 ? (
        <section class="info">
          <p class="info__empty">Zatiaľ žiadny klient so zmluvou.</p>
        </section>
      ) : (
        <>
          <dl class="figs__grid figs__grid--four ovfigs">
            <div class={`fig anfig${over.length > 0 ? ' anfig--red' : ''}`}>
              <dt>Nad balíkom</dt>
              <dd class="fig__value">{n(over.length)}</dd>
              <dd class="fig__note">{typeset(`z ${n(o.plans.length)} klientov`)}</dd>
            </div>
            <div class="fig anfig">
              <dt>Blízko limitu</dt>
              <dd class="fig__value">{n(o.plans.filter((p) => p.usage.state === 'near').length)}</dd>
              <dd class="fig__note">{typeset('od 80 % balíka')}</dd>
            </div>
            <div class="fig anfig">
              <dt>Príplatky tento mesiac</dt>
              <dd class="fig__value">{formatEur(extra)}</dd>
              <dd class="fig__note">{typeset('bez DPH, ak mesiac skončí takto')}</dd>
            </div>
            <div class="fig anfig">
              <dt>Ponúknuť vyšší balík</dt>
              <dd class="fig__value">{n(o.plans.filter((p) => p.usage.offer).length)}</dd>
              <dd class="fig__note">{typeset('nad balíkom 2 z 3 mesiacov')}</dd>
            </div>
          </dl>
          <div class="lscroll">
            <table class="ltable antable ovplans">
              <thead>
                <tr>
                  <th scope="col">Klient</th>
                  <th scope="col">Balík</th>
                  <th scope="col" class="num">
                    Doklady
                  </th>
                  <th scope="col">Stav</th>
                  <th scope="col">Vyúčtujeme</th>
                  <th scope="col" class="num">
                    Odhad
                  </th>
                  <th scope="col">Predošlé mesiace</th>
                  <th scope="col">Ponúknuť</th>
                </tr>
              </thead>
              <tbody>
                {o.plans.map((p) => (
                  <PlanRow row={p} />
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  )
}

const PlanRow: FC<{ row: UsageRow }> = ({ row }) => {
  const u = row.usage
  return (
    <tr>
      <td class="antable__key">
        <a class="link" href={`/ucto/klienti/${row.company.id}`}>
          {row.company.name}
        </a>
        {row.tariff === 'pricelist' || row.tariff === 'corrupt' ? <span class="antable__sub">{typeset('ceny podľa cenníka, overte zmluvu')}</span> : null}
        {u.free ? <span class="antable__sub">{typeset('prvý mesiac zadarmo, nefakturujeme')}</span> : null}
      </td>
      <td data-label="Balík">{u.plan.name}</td>
      <td class="num ovplans__use" data-label="Doklady">
        <span class="ovplans__docs">{typeset(`${n(u.docs)} / ${n(u.limit)}`)}</span>
        <UseBar share={u.share} state={u.state} />
      </td>
      <td class="ovplans__state">
        <span class={`pill ${STATES[u.state].tone}`}>{STATES[u.state].text}</span>
      </td>
      <td data-label="Vyúčtujeme">{u.billedAs.id === u.plan.id && u.state !== 'agree' ? 'svoj balík' : typeset(`${u.billedAs.name}, +${formatEur(u.extraCents)}${u.state === 'agree' ? ', cenu dohodnúť' : ''}`)}</td>
      <td class="num" data-label="Odhad">{u.projected === null ? 'zatiaľ nie' : typeset(`${n(u.projected)}${u.projectedAs && u.projectedAs.id !== u.plan.id ? ` (${u.projectedAs.name})` : ''}`)}</td>
      <td data-label="Predošlé mesiace">{u.history.length === 0 ? 'zatiaľ žiadne' : typeset(u.history.map((h) => `${monthShort(h.month)} ${n(h.docs)}${h.over ? ' nad' : ''}`).join(', '))}</td>
      <td data-label="Ponúknuť">{u.offer ? <strong>{u.offer.name}</strong> : 'netreba'}</td>
    </tr>
  )
}

const Volumes: FC<{ o: Overview }> = ({ o }) => (
  <section class="ansec" aria-labelledby="ov-objem-t" id="objem" data-part="ov-volumes">
    <h2 id="ov-objem-t" class="anhead">
      Koľko toho máme
    </h2>
    <dl class="figs__grid ovfigs">
      {o.volumes.map((v) => (
        <div class="fig anfig">
          <dt>{VOLUME_LABELS[v.key]}</dt>
          <dd class="fig__value">{n(v.n)}</dd>
        </div>
      ))}
    </dl>
    <p class="info__source">
      {typeset('Návštevy webu, cestu k zmluve a používanie aplikácie nájdete v ')}
      <a class="link" href="/ucto/analytika">
        Analytike
      </a>
      .
    </p>
  </section>
)

const Complaints: FC<{ o: Overview }> = ({ o }) => (
  <section class="ansec" aria-labelledby="ov-staznosti-t" id="staznosti" data-part="ov-complaints">
    <h2 id="ov-staznosti-t" class="anhead">
      {typeset(`Sťažnosti za ${COMPLAINT_DAYS} dní`)}
    </h2>
    {o.complaints.length === 0 ? (
      <section class="info">
        <p class="info__empty">{typeset('V správach klientov sme nenašli sťažnosť ani nespokojnosť.')}</p>
      </section>
    ) : (
      <div class="lscroll">
        <table class="ltable antable">
          <thead>
            <tr>
              <th scope="col">Klient</th>
              <th scope="col" class="num">
                Správy
              </th>
              <th scope="col">Posledná</th>
            </tr>
          </thead>
          <tbody>
            {o.complaints.map((c) => (
              <tr>
                <td class="antable__key">
                  <a class="link" href={`/ucto/klienti/${c.firm.id}#spravy`}>
                    {c.firm.name}
                  </a>
                </td>
                <td class="num">{n(c.n)}</td>
                <td>{whenName(c.last, o.today)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
    <p class="info__source">{typeset('Hľadáme slová ako sťažnosť, reklamácia, nespokojný, nefunguje, chybný, pokuta či výpoveď. Text správ zostáva u nás, Claude ho nevidí.')}</p>
  </section>
)

const WHERE_SECTIONS: Partial<Record<CheckWhere, string>> = { baliky: '#baliky', nove: '#nove', objem: '#objem', staznosti: '#staznosti' }

const CheckPanel: FC<{ o: Overview; check: StoredCheck | null; available: boolean; error: string | null }> = ({ o, check, available, error }) => {
  const hrefOf = (where: CheckWhere) => WHERE_SECTIONS[where] ?? o.alarms.find((a) => a.key === where)?.href ?? '#hori'
  return (
    <section class="info info--ai ovcheck" aria-labelledby="ov-kontrola-t" id="kontrola">
      <div class="ovcheck__head">
        <h2 id="ov-kontrola-t" class="info__title">
          Kontrola s Claude
        </h2>
        <form method="post" action="/ucto/prehlad/kontrola" class="ovcheck__form">
          <button class="btn btn--blue" type="submit" disabled={!available}>
            Skontrolovať
          </button>
        </form>
      </div>
      <p class="info__lead">
        {typeset(
          available
            ? 'Claude prejde celý prehľad a povie, čo horí, čo stihnúť tento týždeň a čo ide dobre. Dostane len čísla a stavy, firmy ako K1, K2, bez mien, e-mailov a textov správ. Bod, ktorého čísla nesedia s údajmi, nezobrazíme.'
            : 'Kontrola potrebuje kľúč Anthropic (ANTHROPIC_API_KEY) na Workeri.',
        )}
      </p>
      {error ? (
        <p class="flash flash--error" role="alert">
          {typeset(error)}
        </p>
      ) : null}
      {check ? (
        <div class="ovcheck__result">
          <p class="info__source">{typeset(`Posledná kontrola ${whenName(check.at, o.today)}, ${check.model}, ${usdText(checkUsd(check))}.`)}</p>
          {check.summary ? <p class="ovcheck__summary">{typeset(check.summary)}</p> : null}
          {check.points.length > 0 ? (
            <ul class="ovalarms">
              {check.points.map((p) => (
                <li class={`ovalarm ovalarm--${p.level}`}>
                  <span class={`pill ${CHECK_TONES[p.level].tone}`}>{CHECK_TONES[p.level].text}</span>
                  <div class="ovalarm__body">
                    <a class="ovalarm__title" href={hrefOf(p.where)}>
                      {typeset(p.title)}
                    </a>
                    {p.detail ? <p class="ovalarm__detail">{typeset(p.detail)}</p> : null}
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
          {check.dropped > 0 ? <p class="info__source">{typeset(`${n(check.dropped)} ${check.dropped === 1 ? 'bod sme vynechali, lebo jeho čísla alebo firmy nesedeli' : 'body sme vynechali, lebo ich čísla alebo firmy nesedeli'} s údajmi.`)}</p> : null}
        </div>
      ) : (
        <p class="info__empty">{typeset('Zatiaľ žiadna kontrola.')}</p>
      )}
      <p class="info__source">{typeset(`Najviac ${CHECK.perDay} kontrol denne. Jedna stojí približne desatinu centa.`)}</p>
    </section>
  )
}

export interface OverviewPageProps {
  o: Overview
  check: StoredCheck | null
  available: boolean
  error: string | null
  flash: string | null
}

export const OverviewPage: FC<OverviewPageProps> = ({ o, check, available, error, flash }) => {
  const burning = o.alarms.filter((a) => a.level === 'hori').length
  const watch = o.alarms.filter((a) => a.level === 'pozor').length
  return (
    <div class="analytics overview" data-refresh="90">
      <header class="phead">
        <Heading first="Prehľad" second="Celá firma na jednej stránke." />
        <p class="phead__lead" data-part="ov-stamp">
          {typeset(
            `${burning === 0 ? 'Nič nehorí' : `Horí: ${n(burning)}`}, ${watch === 0 ? 'nič nečaká' : `treba pozrieť: ${n(watch)}`}. Stav ${whenName(o.at, o.today)}, obnovuje sa sám každú minútu a pol.`,
          )}
        </p>
      </header>
      {flash ? <Flash text={flash} /> : null}
      <CheckPanel o={o} check={check} available={available} error={error} />
      <Alarms o={o} />
      <Plans o={o} />
      <Fresh o={o} />
      <Complaints o={o} />
      <Volumes o={o} />
    </div>
  )
}
