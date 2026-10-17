// Intrastat of a client (/ucto/klienti/:id/intrastat?mesiac=&tok=): the months, a month's items of one flow with what
// keeps them back, the file and the mark, what changed since it was sent, the threshold and the settings; and a
// document's goods (/intrastat/doklad/:doc).
import type { FC } from 'hono/jsx'
import { formatEurExact } from '../format'
import { dayName, monthName } from '../app/copy'
import { textDay } from '../app/booking'
import type { Company } from '../app/store'
import { NATURES, REGIONS, TERMS, TRANSPORTS, SIMPLIFIED_CN, type Flow, type IntrastatDoc, type IntrastatSettings, type IntrastatView, type ThresholdWatch } from '../app/intrastat'
import { team as t } from '../team/copy'
import { Flash, Heading } from './inside'

const k = t.intrastat

const pill = (state: string) => (state === 'filed' ? 'pill--ok' : state === 'blocked' || state === 'changed' ? 'pill--red' : state === 'ready' ? 'pill--amber' : 'pill--grey')
const mm = (month: string) => `${month.slice(5, 7)}/${month.slice(0, 4)}`
const cnText = (cn: string) => `${cn.slice(0, 4)} ${cn.slice(4, 6)} ${cn.slice(6, 8)}`
const natureText = (code: string | null) => (code ? (code.length === 2 ? `${code[0]}/${code[1]}` : code) : '')

export interface IntrastatPageProps {
  company: Company
  settings: IntrastatSettings
  months: { month: string; A: string; D: string }[]
  view: IntrastatView
  watch: ThresholdWatch
  docs: Map<string, IntrastatDoc>
  today: string
  flash: string | null
  settingsForm: { values: Record<string, string>; errors: Record<string, string> } | null
}

export const IntrastatPage: FC<IntrastatPageProps> = (p) => {
  const base = `/ucto/klienti/${p.company.id}/intrastat`
  const v = p.view
  return (
    <>
      <a class="back" href={`/ucto/klienti/${p.company.id}/dph`}>
        {t.vat.title}
      </a>
      <header class="phead">
        <Heading first={k.title} second={p.company.name} />
        <p class="phead__lead">{k.lead}</p>
      </header>
      <Flash text={p.flash} />
      {!p.company.icdph || !p.company.address ? <Flash text={k.noVatId} tone="error" /> : null}
      <nav class="periods" aria-label={k.months}>
        {p.months.map((m) => (
          <a class="periods__item" href={`${base}?mesiac=${m.month}&tok=${v.flow}`} aria-current={v.month === m.month ? 'page' : undefined}>
            <span class="periods__name">{monthName(`${m.month}-01`, true)}</span>
            <span class={`pill ${pill(m[v.flow])}`}>{k.states[m[v.flow]]}</span>
          </a>
        ))}
      </nav>
      <nav class="periods" aria-label={k.title}>
        {(['A', 'D'] as Flow[]).map((flow) => {
          const state = p.months.find((m) => m.month === v.month)?.[flow] ?? 'none'
          return (
            <a class="periods__item" href={`${base}?mesiac=${v.month}&tok=${flow}`} aria-current={v.flow === flow ? 'page' : undefined}>
              <span class="periods__name">{k.flows[flow]}</span>
              <span class={`pill ${pill(state)}`}>{k.states[state]}</span>
            </a>
          )
        })}
      </nav>
      <div class="pgrid">
        <div class="pgrid__main">
          <MonthCard {...p} />
          <SettingsCard {...p} />
        </div>
        <aside class="pgrid__side">
          <SideCard {...p} />
          <ThresholdCard {...p} />
        </aside>
      </div>
    </>
  )
}

const MonthCard: FC<IntrastatPageProps> = ({ company, view: v, docs }) => {
  const doc = (id: string) => docs.get(id)
  const total = v.items.reduce((s, i) => s + i.euros, 0)
  const goodsHref = (id: string) => `/ucto/klienti/${company.id}/intrastat/doklad/${id}`
  return (
    <section class="info" aria-labelledby="istat-t">
      <header class="info__row">
        <h2 id="istat-t" class="info__title">
          {k.flows[v.flow]}, {monthName(`${v.month}-01`)}
        </h2>
        <span class={`pill ${pill(v.state)}`}>{k.states[v.state]}</span>
      </header>
      {k.stateLead[v.state] ? <p class="info__lead">{k.stateLead[v.state]}</p> : null}
      {v.issues.length > 0 ? (
        <ul class="vissues">
          {v.issues.map((i) => (
            <li class="vissue">
              <span class="vissue__text">{k.issues[i.code](i.ids.length)}</span>
              {i.ids[0] ? (
                <a class="link" href={i.code === 'unbooked' ? `/ucto/doklady/${i.ids[0]}` : goodsHref(i.ids[0])}>
                  {i.code === 'unbooked' ? t.oss.openDoc : k.edit}
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {v.items.length === 0 ? (
        <p class="info__empty">{v.state === 'none' ? k.emptyNone : k.empty}</p>
      ) : (
        <div class="lscroll">
          <table class="ltable">
            <thead>
              <tr>
                <th scope="col">{k.cols.doc}</th>
                <th scope="col">{k.cols.cn}</th>
                <th scope="col">{k.cols.country}</th>
                <th scope="col">{k.cols.origin}</th>
                <th scope="col" class="num">
                  {k.cols.kg}
                </th>
                <th scope="col" class="num">
                  {k.cols.value}
                </th>
              </tr>
            </thead>
            <tbody>
              {v.items.map((i) => (
                <tr>
                  <td>
                    <a class="link" href={goodsHref(i.docId)}>
                      {doc(i.docId)?.number ?? doc(i.docId)?.party ?? i.docId}
                    </a>
                  </td>
                  <td>{i.cn === SIMPLIFIED_CN ? k.simple : cnText(i.cn)}</td>
                  <td>{i.country}</td>
                  <td>{i.origin ?? ''}</td>
                  <td class="num">{i.kg !== null ? k.kg(i.kg) : ''}</td>
                  <td class="num">{k.euros(i.euros)}</td>
                </tr>
              ))}
              <tr>
                <td colspan={5}>
                  <strong>
                    {k.total}, {k.items(v.items.length)}
                  </strong>
                </td>
                <td class="num">
                  <strong>{k.euros(total)}</strong>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
      {v.credits.length > 0 ? <p class="info__source">{k.credits(v.credits.length)}</p> : null}
      {v.state === 'changed' && v.followUp ? (
        <>
          <h3 class="info__sub">{k.followUp.title}</h3>
          <ul class="vissues">
            {v.followUp.added.length > 0 ? <li class="vissue">{k.followUp.added(v.followUp.added.length)}</li> : null}
            {v.followUp.changed.length > 0 ? <li class="vissue">{k.followUp.changed(v.followUp.changed.length)}</li> : null}
            {v.followUp.removed.length > 0 ? <li class="vissue">{k.followUp.removed(v.followUp.removed.length)}</li> : null}
          </ul>
        </>
      ) : null}
    </section>
  )
}

const SideCard: FC<IntrastatPageProps> = ({ company, view: v, today }) => {
  const base = `/ucto/klienti/${company.id}/intrastat`
  const late = today > v.due && (v.state === 'ready' || v.state === 'blocked')
  const sendable = (v.state === 'ready' || v.state === 'changed') && v.issues.length === 0 && company.icdph && company.address
  return (
    <section class="info" aria-label={k.filings}>
      {v.state !== 'none' ? <p class={late ? 'flag' : 'info__lead'}>{k.due(dayName(v.due, today))}</p> : null}
      {v.filings.length > 0 ? (
        <>
          <h3 class="info__sub">{k.filings}</h3>
          <ul class="vissues">
            {v.filings.map((f) => (
              <li class="vissue">
                <span class="vissue__text">{k.filing(f.seq, textDay(f.filedOn), `AA${String(f.envelope).padStart(5, '0')}`)}</span>
                <a class="link" href={`${base}.xml?mesiac=${v.month}&tok=${v.flow}&podanie=${f.seq}`}>
                  {k.fileOf}
                </a>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {sendable ? (
        <>
          <a class="btn btn--line btn--small" href={`${base}.xml?mesiac=${v.month}&tok=${v.flow}`}>
            {v.state === 'changed' ? k.fileFollow : k.file}
          </a>
          <p class="info__source">{k.fileHint}</p>
          <form class="stack" method="post" action={`${base}/podane`}>
            <input type="hidden" name="mesiac" value={v.month} />
            <input type="hidden" name="tok" value={v.flow} />
            <label class="field__label" for="istat-den">
              {k.filedOn}
            </label>
            <input id="istat-den" class="field__input" name="datum" value={textDay(today)} maxlength={16} />
            <button class="btn btn--blue stack__submit" type="submit">
              {k.mark}
            </button>
          </form>
        </>
      ) : null}
      {v.filings.length > 0 ? (
        <form method="post" action={`${base}/zrusit`}>
          <input type="hidden" name="mesiac" value={v.month} />
          <input type="hidden" name="tok" value={v.flow} />
          <button class="btn btn--line btn--small" type="submit">
            {k.unmark}
          </button>
        </form>
      ) : null}
    </section>
  )
}

const ThresholdCard: FC<IntrastatPageProps> = ({ settings, view: v, watch }) => {
  const y = Number(v.month.slice(0, 4))
  const since = v.flow === 'A' ? settings.arrivals : settings.dispatches
  return (
    <section class="info" aria-labelledby="istat-prah-t">
      <h2 id="istat-prah-t" class="info__title">
        {k.threshold.title}
      </h2>
      <dl class="kv">
        <div>
          <dt>{k.threshold.window(`1. 10. ${y - 2}`, `30. 9. ${y - 1}`)}</dt>
          <dd>{formatEurExact(watch.window)}</dd>
        </div>
        <div>
          <dt>{k.threshold.year(String(y))}</dt>
          <dd>{formatEurExact(watch.year)}</dd>
        </div>
        <div class="kv__strong">
          <dt>{k.threshold.limit}</dt>
          <dd>{formatEurExact(watch.limit)}</dd>
        </div>
      </dl>
      <p class="info__source">{since ? k.threshold.obliged(monthName(`${since}-01`)) : watch.from ? k.threshold.crossed(monthName(`${watch.from}-01`)) : k.threshold.under}</p>
      <p class="info__source">{k.threshold.lead}</p>
    </section>
  )
}

const options = (codes: readonly string[], labels: Record<string, string>, empty?: string): Record<string, string> => ({
  ...(empty !== undefined ? { '': empty } : {}),
  ...Object.fromEntries(codes.map((c) => [c, labels[c] ?? c])),
})

const Select: FC<{ id: string; name: string; label: string; value: string; options: Record<string, string>; wide?: boolean }> = (p) => (
  <div class={`fgrid__cell${p.wide ? ' fgrid__cell--wide' : ''}`}>
    <label class="field__label" for={p.id}>
      {p.label}
    </label>
    <select id={p.id} class="field__input" name={p.name}>
      {Object.entries(p.options).map(([value, label]) => (
        <option value={value} selected={p.value === value}>
          {label}
        </option>
      ))}
    </select>
  </div>
)

const Field: FC<{ id: string; name: string; label: string; value: string; error?: string; hint?: string; wide?: boolean; max?: number; mode?: 'decimal' | 'numeric' }> = (p) => (
  <div class={`fgrid__cell${p.wide ? ' fgrid__cell--wide' : ''}`}>
    <label class="field__label" for={p.id}>
      {p.label}
    </label>
    <input id={p.id} class="field__input" name={p.name} value={p.value} maxlength={p.max ?? 80} inputmode={p.mode} aria-invalid={p.error ? 'true' : undefined} />
    {p.error ? <p class="field__error">{p.error}</p> : p.hint ? <p class="field__hint">{p.hint}</p> : null}
  </div>
)

/** The settings as the form shows them. */
export function settingsValues(s: IntrastatSettings): Record<string, string> {
  return {
    dovoz: s.arrivals ? mm(s.arrivals) : '',
    vyvoz: s.dispatches ? mm(s.dispatches) : '',
    agri: s.agri ? '1' : '',
    druh: s.nature,
    doprava: s.transport,
    podmienky: s.terms,
    region: s.region ?? '',
    povod: s.origin ?? '',
    kontakt: s.contact ?? '',
    telefon: s.phone ?? '',
    email: s.email ?? '',
  }
}

const SettingsCard: FC<IntrastatPageProps> = ({ company, settings, settingsForm, view: v }) => {
  const s = k.settings
  const values = settingsForm?.values ?? settingsValues(settings)
  const e = settingsForm?.errors ?? {}
  return (
    <section class="info" id="nastavenie" aria-labelledby="istat-set-t">
      <h2 id="istat-set-t" class="info__title">
        {s.title}
      </h2>
      <p class="info__lead">{s.lead}</p>
      <form class="fgrid" method="post" action={`/ucto/klienti/${company.id}/intrastat/nastavenie`} novalidate>
        <input type="hidden" name="mesiac" value={v.month} />
        <input type="hidden" name="tok" value={v.flow} />
        <Field id="istat-dovoz" name="dovoz" label={s.arrivals} value={values.dovoz ?? ''} error={e.dovoz} hint={s.monthHint} max={7} />
        <Field id="istat-vyvoz" name="vyvoz" label={s.dispatches} value={values.vyvoz ?? ''} error={e.vyvoz} hint={s.monthHint} max={7} />
        <div class="fgrid__cell fgrid__cell--wide">
          <label class="tickbox">
            <input type="checkbox" name="agri" value="1" checked={values.agri === '1'} />
            <span>{s.agri}</span>
          </label>
        </div>
        <Select id="istat-druh" name="druh" label={s.nature} value={values.druh ?? ''} options={options(NATURES, k.natures)} />
        <Select id="istat-doprava" name="doprava" label={s.transport} value={values.doprava ?? ''} options={options(TRANSPORTS, k.transports)} />
        <Select id="istat-podmienky" name="podmienky" label={s.terms} value={values.podmienky ?? ''} options={options(TERMS, {})} />
        <Select id="istat-region" name="region" label={s.region} value={values.region ?? ''} options={options(REGIONS, k.regions, s.regionNone)} />
        <Field id="istat-povod" name="povod" label={s.origin} value={values.povod ?? ''} error={e.povod} hint={s.originHint} max={2} wide />
        <Field id="istat-kontakt" name="kontakt" label={s.contact} value={values.kontakt ?? ''} max={80} wide />
        <Field id="istat-telefon" name="telefon" label={s.phone} value={values.telefon ?? ''} max={30} />
        <Field id="istat-email" name="email" label={s.email} value={values.email ?? ''} max={120} />
        <div class="fgrid__cell fgrid__cell--wide">
          <button class="btn btn--blue" type="submit">
            {s.save}
          </button>
        </div>
      </form>
    </section>
  )
}

// ---------------------------------------------------------------------------------------------------------------
// A document's goods
// ---------------------------------------------------------------------------------------------------------------

export const GOODS_ROWS = 3

export interface GoodsPageProps {
  company: Company
  doc: IntrastatDoc
  month: string
  flow: Flow | null
  values: Record<string, string>
  errors: Record<string, string>
}

export const GoodsPage: FC<GoodsPageProps> = ({ company, doc, month, flow, values, errors }) => {
  const g = k.goods
  const back = `/ucto/klienti/${company.id}/intrastat?mesiac=${month}${flow ? `&tok=${flow}` : ''}`
  const lines = Math.max(
    GOODS_ROWS,
    ...Object.keys(values)
      .filter((key) => /^kn_\d+$/.test(key) && values[key])
      .map((key) => Number(key.slice(3)) + 2),
  )
  const small = Math.abs(doc.cents) < 100_000
  return (
    <>
      <a class="back" href={back}>
        {g.back}
      </a>
      <header class="phead">
        <Heading first={g.title} second={company.name} />
        <p class="phead__lead">{g.lead}</p>
      </header>
      {Object.keys(errors).length > 0 ? <Flash text={errors.none ?? t.client.detailsFix} tone="error" /> : null}
      <section class="info">
        <p class="info__lead">
          <strong>{g.doc(doc.number ?? doc.id, doc.party ?? '')}</strong> {g.value(formatEurExact(Math.abs(doc.cents)), monthName(`${month}-01`), flow ? (k.flows[flow] ?? flow) : '')}
        </p>
        <form class="fgrid" method="post" action={`/ucto/klienti/${company.id}/intrastat/doklad/${doc.id}`} novalidate>
          {small ? (
            <div class="fgrid__cell fgrid__cell--wide">
              <label class="tickbox">
                <input type="checkbox" name="zjednodusene" value="1" checked={values.zjednodusene === '1'} />
                <span>{g.simple}</span>
              </label>
            </div>
          ) : null}
          {doc.cents < 0 ? (
            <div class="fgrid__cell fgrid__cell--wide">
              <label class="tickbox">
                <input type="checkbox" name="vratene" value="1" checked={values.vratene === '1'} />
                <span>{g.returned}</span>
              </label>
            </div>
          ) : null}
          {Array.from({ length: lines }, (_, n) => (
            <div class="fgrid__cell fgrid__cell--wide">
              <h3 class="info__sub">{g.line(n + 1)}</h3>
              <div class="fgrid fgrid--three">
                <Field id={`kn-${n}`} name={`kn_${n}`} label={g.cn} value={values[`kn_${n}`] ?? ''} error={errors[`kn_${n}`]} max={10} mode="numeric" />
                <Field id={`povod-${n}`} name={`povod_${n}`} label={g.origin} value={values[`povod_${n}`] ?? ''} error={errors[`povod_${n}`]} max={2} />
                <Field id={`kg-${n}`} name={`kg_${n}`} label={g.kg} value={values[`kg_${n}`] ?? ''} error={errors[`kg_${n}`]} max={16} mode="decimal" />
                <Field id={`mj-${n}`} name={`mj_${n}`} label={g.su} value={values[`mj_${n}`] ?? ''} max={12} />
                <Field id={`mnozstvo-${n}`} name={`mnozstvo_${n}`} label={g.quantity} value={values[`mnozstvo_${n}`] ?? ''} error={errors[`mnozstvo_${n}`]} max={16} mode="decimal" />
                <Field id={`hodnota-${n}`} name={`hodnota_${n}`} label={g.lineValue} value={values[`hodnota_${n}`] ?? ''} error={errors[`hodnota_${n}`]} max={16} mode="decimal" />
                <Field id={`opis-${n}`} name={`opis_${n}`} label={g.description} value={values[`opis_${n}`] ?? ''} max={240} wide />
              </div>
            </div>
          ))}
          <div class="fgrid__cell fgrid__cell--wide">
            <h3 class="info__sub">{g.more}</h3>
          </div>
          <Select id="g-druh" name="druh" label={g.nature} value={values.druh ?? ''} options={options(NATURES, k.natures, g.fromSettings)} />
          <Select id="g-doprava" name="doprava" label={g.transport} value={values.doprava ?? ''} options={options(TRANSPORTS, k.transports, g.fromSettings)} />
          <Select id="g-podmienky" name="podmienky" label={g.terms} value={values.podmienky ?? ''} options={options(TERMS, {}, g.fromSettings)} />
          <Select id="g-region" name="region" label={g.region} value={values.region ?? ''} options={options(REGIONS, k.regions, g.fromSettings)} />
          <Field id="g-stat" name="stat" label={g.country} value={values.stat ?? ''} error={errors.stat} max={2} wide />
          {flow === 'D' ? <Field id="g-partner" name="partner" label={g.partner} value={values.partner ?? ''} error={errors.partner} hint={g.partnerHint} max={16} wide /> : null}
          <Field id="g-mesiac" name="mesiac" label={g.month} value={values.mesiac ?? ''} error={errors.mesiac} max={7} wide />
          <div class="fgrid__cell fgrid__cell--wide">
            <label class="tickbox">
              <input type="checkbox" name="nevykazovat" value="1" checked={values.nevykazovat === '1'} />
              <span>{g.skip}</span>
            </label>
          </div>
          <div class="fgrid__cell fgrid__cell--wide">
            <button class="btn btn--blue" type="submit" name="akcia" value="ulozit">
              {g.save}
            </button>
          </div>
        </form>
        {doc.goods ? (
          <form method="post" action={`/ucto/klienti/${company.id}/intrastat/doklad/${doc.id}`}>
            <input type="hidden" name="akcia" value="odstranit" />
            <button class="btn btn--line btn--small" type="submit">
              {g.remove}
            </button>
          </form>
        ) : null}
      </section>
    </>
  )
}

export { cnText, natureText, mm }
