// Analytika (26 October 2026): the administrator's one page of how Firmony does. Big numbers with a small line of
// the days, the way from a visit to a contract, where people come from, what the clients use, where the app is slow
// or fails, every client in one table and the AI. Everything from analytics/store.ts; sums are never made here twice.
import type { FC } from 'hono/jsx'
import { dayName, whenName } from '../app/copy'
import { formatCount, typeset } from '../format'
import { BOT_NAMES, DEVICE_NAMES, HAIKU_PRICE, PERIODS, campaignName, featureName, msText, shareOf, sparkPath, usdText, type Period } from '../analytics/model'
import { sortClients, speedOf, type ClientSort, type Dashboard, type Figure, type Invoicing, type RouteStat } from '../analytics/store'
import { Heading, planName } from './inside'

const FUNNEL: Record<Dashboard['funnel'][number]['key'], string> = {
  visits: 'Návštevy webu',
  start: 'Otvorili formulár /zacat',
  requests: 'Poslali žiadosť',
  orders: 'Dostali objednávku',
  aml: 'Overení pred zmluvou (AML)',
  contracts: 'Uzavreli zmluvu',
}

const EVENTS: Record<string, string> = {
  'document.booked': 'Doklady zaúčtované účtovníčkou',
  'document.autobooked': 'Doklady zaúčtované samy',
  'invoice.issued': 'Vystavené faktúry',
  'invoice.pdf': 'Faktúry stiahnuté ako PDF',
  'invoice.shared': 'Faktúry zdieľané z aplikácie',
  'message.sent': 'Správy od klientov',
  'bank.linked': 'Prepojené banky',
  'statement.imported': 'Prijaté bankové výpisy',
  'export.downloaded': 'Stiahnuté ročné archívy',
}

const SOURCES: Record<string, string> = {
  upload: 'Nahraté v aplikácii',
  email: 'Prišli e-mailom',
  xml: 'E-faktúry',
  einvoice: 'E-faktúry',
  issued: 'Faktúry vystavené v aplikácii',
  takings: 'Tržby z eKasy',
  trip: 'Pracovné cesty',
  takeover: 'Prevzaté od predošlej účtovníčky',
  firmony: 'Faktúry Firmony',
}

const AML: Record<'checked' | 'waiting' | 'missing', { text: string; tone: string }> = {
  checked: { text: 'Overené', tone: 'pill--ok' },
  waiting: { text: 'Na overenie', tone: 'pill--amber' },
  missing: { text: 'Chýba', tone: 'pill--red' },
}

const SORTS: { key: ClientSort; label: string }[] = [
  { key: 'nazov', label: 'Firma' },
  { key: 'aktivita', label: 'Posledná aktivita' },
  { key: 'pouzivatelia', label: 'Ľudia, 30 dní' },
  { key: 'doklady', label: 'Doklady' },
  { key: 'faktury', label: 'Faktúry' },
  { key: 'asistent', label: 'Asistent' },
  { key: 'aml', label: 'AML' },
]

const n = (value: number) => formatCount(value)

/** A small line of the period's days, drawn on the server: no script, no style attribute. */
export const Spark: FC<{ values: number[] }> = ({ values }) => {
  const { line, area } = sparkPath(values, 100, 28)
  return (
    <svg class="spark" viewBox="0 0 100 28" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <path class="spark__area" d={area} />
      <path class="spark__line" d={line} vector-effect="non-scaling-stroke" />
    </svg>
  )
}

/** A bar of a share, drawn as SVG so that its width needs no style attribute. */
const Bar: FC<{ part: number; of: number }> = ({ part, of }) => {
  const width = of > 0 ? Math.max(0, Math.min(100, (part / of) * 100)) : 0
  return (
    <svg class="anbar" viewBox="0 0 100 8" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <rect class="anbar__track" x="0" y="0" width="100" height="8" rx="4" />
      {width > 0 ? <rect class="anbar__fill" x="0" y="0" width={String(Math.round(width * 10) / 10)} height="8" rx="4" /> : null}
    </svg>
  )
}

const Fig: FC<{ label: string; figure: Figure; tone?: 'red' }> = ({ label, figure, tone }) => (
  <div class={`fig anfig${tone && figure.total > 0 ? ` anfig--${tone}` : ''}`}>
    <dt>{label}</dt>
    <dd class="fig__value">{n(figure.total)}</dd>
    <dd class="fig__note">{typeset(`dnes ${n(figure.today)}`)}</dd>
    <dd class="anfig__spark">
      <Spark values={figure.series} />
    </dd>
  </div>
)

const Empty: FC<{ text?: string }> = ({ text }) => <p class="info__empty">{text ?? 'Za toto obdobie zatiaľ nič.'}</p>

/** A table of keys and counts with their share of a whole. */
const Shares: FC<{ rows: { label: string; n: number }[]; of: number; head: string }> = ({ rows, of, head }) =>
  rows.length === 0 ? (
    <Empty />
  ) : (
    <div class="lscroll">
      <table class="ltable antable">
        <thead>
          <tr>
            <th scope="col">{head}</th>
            <th scope="col" class="num">
              Počet
            </th>
            <th scope="col" class="num">
              Podiel
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr>
              <td class="antable__key">{r.label}</td>
              <td class="num">{n(r.n)}</td>
              <td class="num">{shareOf(r.n, of)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )

const sideName = (r: Pick<RouteStat, 'side'>) => (r.side === 'client' ? 'Klient' : 'Tím')

/** Invoicing for everyone: workspaces of a business's own invoices, counted only. No invoice, customer, sentence or
 *  address is shown. Before its schema is deployed the section says so. */
const InvoicingSection: FC<{ inv: Invoicing | null; measuredPdf: boolean }> = ({ inv, measuredPdf }) => (
  <section class="ansec" aria-labelledby="an-fakturacia-t" id="fakturacia">
    <h2 id="an-fakturacia-t" class="anhead">
      Fakturácia pre všetkých
    </h2>
    {!inv ? (
      <section class="info">
        <Empty text="Na tejto verzii aplikácie sa fakturácia pre všetkých ešte nemeria." />
      </section>
    ) : (
      <>
        <dl class="figs__grid anfigs">
          <Fig label="Nové pracovné priestory" figure={inv.started} />
          <div class="fig anfig">
            <dt>Aktívne za 30 dní</dt>
            <dd class="fig__value">{n(inv.active30)}</dd>
            <dd class="fig__note">{typeset(`z ${n(inv.open)} otvorených, vystavili faktúru`)}</dd>
          </div>
          <div class="fig anfig">
            <dt>Požiadali o účtovníctvo</dt>
            <dd class="fig__value">{n(inv.converted)}</dd>
            <dd class="fig__note">{inv.withIco > 0 ? typeset(`z ${n(inv.withIco)} s IČO (${shareOf(inv.converted, inv.withIco)})`) : 'zatiaľ žiadny priestor s IČO'}</dd>
          </div>
        </dl>
        <div class="angrid">
          <section class="info" aria-labelledby="an-faktury-t">
            <h3 id="an-faktury-t" class="info__title">
              Faktúry v období
            </h3>
            <dl class="kv">
              <div>
                <dt>Vystavené v pracovných priestoroch</dt>
                <dd>{n(inv.issuedWorkspaces)}</dd>
              </div>
              <div>
                <dt>Vystavené klientmi účtovníctva</dt>
                <dd>{n(inv.issuedClients)}</dd>
              </div>
              <div>
                <dt>Označené ako zaplatené ručne</dt>
                <dd>{n(inv.paidByHand)}</dd>
              </div>
              <div>
                <dt>Stiahnuté ako PDF</dt>
                <dd>{measuredPdf ? n(inv.pdf) : 'zatiaľ sa nemeria'}</dd>
              </div>
              <div>
                <dt>Nedokončené registrácie</dt>
                <dd>{n(inv.unfinished)}</dd>
              </div>
            </dl>
            <p class="info__source">{typeset('Nedokončenú registráciu uchovávame najviac 8 dní, preto je to stav posledných dní, nie celého obdobia.')}</p>
          </section>
          <section class="info" aria-labelledby="an-ai-faktury-t">
            <h3 id="an-ai-faktury-t" class="info__title">
              Návrh faktúry z jednej vety (AI)
            </h3>
            <dl class="kv">
              <div>
                <dt>Použitia</dt>
                <dd>{n(inv.ai.uses)}</dd>
              </div>
              <div>
                <dt>Úspešné návrhy</dt>
                <dd>{inv.ai.uses > 0 ? typeset(`${n(inv.ai.ok)} (${shareOf(inv.ai.ok, inv.ai.uses)})`) : '0'}</dd>
              </div>
              <div>
                <dt>Tokeny na vstupe a výstupe</dt>
                <dd>{typeset(`${n(inv.ai.input)} a ${n(inv.ai.output)}`)}</dd>
              </div>
              <div>
                <dt>Odhad ceny</dt>
                <dd>{typeset(`≈ ${usdText(inv.ai.usd)}`)}</dd>
              </div>
            </dl>
            <p class="info__source">
              {typeset(
                `Cena ${HAIKU_PRICE.model}: ${HAIKU_PRICE.inputPerMTok.toFixed(2).replace('.', ',')} USD za milión tokenov na vstupe a ${HAIKU_PRICE.outputPerMTok.toFixed(2).replace('.', ',')} USD na výstupe, podľa cenníka Anthropic prečítaného ${dayName(HAIKU_PRICE.read)}.`,
              )}
            </p>
          </section>
        </div>
        <section class="info" aria-labelledby="an-fakt-kampane-t">
          <h3 id="an-fakt-kampane-t" class="info__title">
            Odkiaľ prišli nové pracovné priestory
          </h3>
          <Shares head="Zdroj / médium / kampaň" of={inv.started.total} rows={inv.campaigns.map((c) => ({ label: c.key === '(bez kampane)' ? 'Bez kampane' : campaignName(c.key), n: c.n }))} />
        </section>
      </>
    )}
  </section>
)

export interface AnalyticsPageProps {
  dash: Dashboard
  sort: ClientSort
  now: number
}

export const AnalyticsPage: FC<AnalyticsPageProps> = ({ dash, sort, now }) => {
  const f = dash.figures
  const site = dash.site
  const visits = site.visits
  const funnelTop = Math.max(...dash.funnel.map((s) => s.n), 0)
  const speed = speedOf(dash.routes)
  const clients = sortClients(dash.clients, sort)
  const clientFeatures = dash.usage.features.filter((x) => x.side === 'client')
  const teamFeatures = dash.usage.features.filter((x) => x.side === 'team')
  const href = (p: Period, s: ClientSort = sort) => `/ucto/analytika?obdobie=${p}${s === 'nazov' ? '' : `&zoradit=${s}`}`
  const elsewhere = [
    site.botTotal > 0 ? `automaty ${n(site.botTotal)}` : '',
    site.internal > 0 ? `prihlásení (tím a klienti) ${n(site.internal)}` : '',
    site.notFound > 0 ? `nenájdené stránky ${n(site.notFound)}` : '',
    ...site.keyPages.map((k) => (k.key.startsWith('/f/') ? `faktúry otvorené odberateľmi ${n(k.n)}` : `odkazy na zmluvu ${n(k.n)}`)),
  ].filter(Boolean)
  return (
    <div class="analytics">
      <header class="phead">
        <Heading first="Analytika" second="Ako sa Firmony darí." />
        <p class="phead__lead">
          {typeset(
            'Návštevy webu, cesta k zmluve, čo klienti v aplikácii používajú a kde je pomalá. Meriame to sami, v denných súčtoch, bez cookies a bez cudzích skriptov.',
          )}
        </p>
      </header>

      <div class="antools">
        <nav class="filters antools__periods" aria-label="Obdobie">
          {PERIODS.map((p) => (
            <a class="filters__item" href={href(p)} aria-current={dash.period === p ? 'page' : undefined}>
              {`${p} dní`}
            </a>
          ))}
        </nav>
        <p class="antools__export">
          <span>Na analýzu:</span>
          <a class="link" href={`/ucto/analytika/export.json?obdobie=${dash.period}`}>
            JSON
          </a>
          <a class="link" href={`/ucto/analytika/export.csv?obdobie=${dash.period}`}>
            CSV
          </a>
        </p>
      </div>
      <p class="small antools__range">{typeset(`Od ${dayName(dash.from)} do ${dayName(dash.today)}. Stiahnutie potvrdíte prihlasovacím kľúčom.`)}</p>

      <section aria-labelledby="an-prehlad-t" class="ansec">
        <h2 id="an-prehlad-t" class="sr">
          Prehľad
        </h2>
        <dl class="figs__grid anfigs">
          <Fig label="Návštevy webu" figure={f.visits} />
          <Fig label="Žiadosti z webu" figure={f.requests} />
          <Fig label="Objednávky" figure={f.orders} />
          <Fig label="Uzavreté zmluvy" figure={f.contracts} />
          <Fig label="Aktívni klienti" figure={f.activeClients} />
          <Fig label="Chyby servera" figure={f.errors} tone="red" />
        </dl>
      </section>

      <section class="info ansec" aria-labelledby="an-cesta-t" id="cesta">
        <h2 id="an-cesta-t" class="info__title">
          Cesta k zmluve
        </h2>
        <ol class="anfunnel">
          {dash.funnel.map((step, i) => {
            const before = i > 0 ? dash.funnel[i - 1] : undefined
            return (
              <li class="anfunnel__step">
                <span class="anfunnel__name">{FUNNEL[step.key]}</span>
                <span class="anfunnel__n">{n(step.n)}</span>
                <span class="anfunnel__bar">
                  <Bar part={step.n} of={funnelTop} />
                </span>
                <span class="anfunnel__rate">
                  {/* A share above the whole would be no step of a funnel: the steps are sums of a period, not people (the note below). */}
                  {before && before.n > 0 && step.n <= before.n ? typeset(`${shareOf(step.n, before.n)} z predošlého`) : ''}
                </span>
              </li>
            )
          })}
        </ol>
        <p class="info__source">
          {typeset('Kroky sa počítajú za to isté obdobie, nie po jednotlivých ľuďoch. Zmluva podpísaná na papieri nemá objednávku ani návštevu webu.')}
        </p>
        <h3 class="info__sub">Bezplatné nástroje</h3>
        <div class="lscroll">
          <table class="ltable antable">
            <thead>
              <tr>
                <th scope="col">Nástroj</th>
                <th scope="col" class="num">
                  Zobrazenia
                </th>
                <th scope="col" class="num">
                  Z návštev
                </th>
                <th scope="col" class="antable__trend">
                  Priebeh
                </th>
              </tr>
            </thead>
            <tbody>
              {dash.tools.map((tool) => (
                <tr>
                  <td class="antable__key">
                    <a class="link" href={tool.path}>
                      {tool.label}
                    </a>
                  </td>
                  <td class="num">{n(tool.n)}</td>
                  <td class="num">{shareOf(tool.n, visits)}</td>
                  <td class="antable__trend">
                    <Spark values={tool.series} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section class="ansec" aria-labelledby="an-zdroje-t" id="zdroje">
        <h2 id="an-zdroje-t" class="anhead">
          Odkiaľ prichádzajú
        </h2>
        <div class="angrid">
          <section class="info" aria-labelledby="an-stranky-t">
            <h3 id="an-stranky-t" class="info__title">
              Najčítanejšie stránky
            </h3>
            <Shares head="Stránka" of={visits} rows={site.pages.map((p) => ({ label: p.key, n: p.n }))} />
          </section>
          <section class="info" aria-labelledby="an-odkazy-t">
            <h3 id="an-odkazy-t" class="info__title">
              Odkiaľ
            </h3>
            <Shares
              head="Stránka s odkazom"
              of={visits}
              rows={visits > 0 ? [...site.referrers.map((r) => ({ label: r.key, n: r.n })), { label: 'Priamo alebo bez odkazu', n: Math.max(0, visits - site.referred) }] : []}
            />
          </section>
          <section class="info" aria-labelledby="an-kampane-t">
            <h3 id="an-kampane-t" class="info__title">
              Kampane
            </h3>
            <Shares head="Zdroj / médium / kampaň" of={visits} rows={site.campaigns.map((c) => ({ label: campaignName(c.key), n: c.n }))} />
          </section>
          <section class="info" aria-labelledby="an-zariadenia-t">
            <h3 id="an-zariadenia-t" class="info__title">
              Zariadenia
            </h3>
            <Shares head="Zariadenie" of={visits} rows={visits > 0 ? site.devices.map((d) => ({ label: DEVICE_NAMES[d.key], n: d.n })) : []} />
          </section>
        </div>
        {elsewhere.length > 0 ? <p class="info__source anelse">{typeset(`Do návštev nerátame: ${elsewhere.join(', ')}.`)}</p> : null}
        {site.bots.length > 0 ? (
          <p class="info__source anelse">{typeset(`Automaty: ${site.bots.map((b) => `${BOT_NAMES[b.key] ?? b.key} ${n(b.n)}`).join(', ')}.`)}</p>
        ) : null}
      </section>

      <section class="ansec" aria-labelledby="an-pouzivanie-t" id="pouzivanie">
        <h2 id="an-pouzivanie-t" class="anhead">
          Čo klienti používajú
        </h2>
        <dl class="figs__grid anfigs anfigs--small">
          {(['client', 'team'] as const).flatMap((side) =>
            (['dau', 'wau', 'mau'] as const).map((k) => (
              <div class="fig">
                <dt>{`${side === 'client' ? 'Klienti' : 'Tím'}: ${k === 'dau' ? 'dnes' : k === 'wau' ? '7 dní' : '30 dní'}`}</dt>
                <dd class="fig__value">{n(dash.usage.active[side][k])}</dd>
              </div>
            )),
          )}
        </dl>
        <section class="info" aria-labelledby="an-funkcie-t">
          <h3 id="an-funkcie-t" class="info__title">
            Funkcie aplikácie klientov
          </h3>
          {clientFeatures.length === 0 ? (
            <Empty />
          ) : (
            <div class="lscroll">
              <table class="ltable antable">
                <thead>
                  <tr>
                    <th scope="col">Funkcia</th>
                    <th scope="col" class="num">
                      Firmy
                    </th>
                    <th scope="col" class="num">
                      Ľudia
                    </th>
                    <th scope="col" class="num">
                      Požiadavky
                    </th>
                    <th scope="col" class="antable__trend">
                      Priebeh
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {clientFeatures.map((x) => (
                    <tr>
                      <td class="antable__key">{featureName('client', x.feature)}</td>
                      <td class="num">{n(x.companies)}</td>
                      <td class="num">{n(x.users)}</td>
                      <td class="num">{n(x.n)}</td>
                      <td class="antable__trend">
                        <Spark values={x.series} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        <div class="angrid">
          <section class="info" aria-labelledby="an-udalosti-t">
            <h3 id="an-udalosti-t" class="info__title">
              Čo sa urobilo
            </h3>
            <dl class="kv">
              {dash.events.map((e) => (
                <div>
                  <dt>{EVENTS[e.key] ?? e.key}</dt>
                  <dd>{(e.key === 'invoice.pdf' || e.key === 'invoice.shared') && !dash.measured.includes(e.key) ? 'zatiaľ sa nemeria' : n(e.n)}</dd>
                </div>
              ))}
              <div>
                <dt>Otázky asistentovi</dt>
                <dd>{dash.assistant.failed > 0 ? typeset(`${n(dash.assistant.n)}, neúspešné ${n(dash.assistant.failed)}`) : n(dash.assistant.n)}</dd>
              </div>
            </dl>
          </section>
          <section class="info" aria-labelledby="an-doklady-t">
            <h3 id="an-doklady-t" class="info__title">
              Doklady podľa cesty
            </h3>
            <Shares head="Cesta" of={dash.sources.reduce((s, x) => s + x.n, 0)} rows={dash.sources.map((s) => ({ label: SOURCES[s.key] ?? s.key, n: s.n }))} />
          </section>
        </div>
        <section class="info" aria-labelledby="an-tim-t">
          <h3 id="an-tim-t" class="info__title">
            Tím: kde pracuje
          </h3>
          {teamFeatures.length === 0 ? (
            <Empty />
          ) : (
            <div class="lscroll">
              <table class="ltable antable">
                <thead>
                  <tr>
                    <th scope="col">Časť</th>
                    <th scope="col" class="num">
                      Ľudia
                    </th>
                    <th scope="col" class="num">
                      Požiadavky
                    </th>
                    <th scope="col" class="antable__trend">
                      Priebeh
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {teamFeatures.map((x) => (
                    <tr>
                      <td class="antable__key">{featureName('team', x.feature)}</td>
                      <td class="num">{n(x.users)}</td>
                      <td class="num">{n(x.n)}</td>
                      <td class="antable__trend">
                        <Spark values={x.series} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </section>

      <InvoicingSection inv={dash.invoicing} measuredPdf={dash.measured.includes('invoice.pdf')} />

      <section class="ansec" aria-labelledby="an-rychlost-t" id="rychlost">
        <h2 id="an-rychlost-t" class="anhead">
          Rýchlosť a chyby
        </h2>
        <section class="info" aria-labelledby="an-pomale-t">
          <h3 id="an-pomale-t" class="info__title">
            Najpomalšie stránky
          </h3>
          {speed.slow.length === 0 ? (
            <Empty />
          ) : (
            <div class="lscroll">
              <table class="ltable antable antable--wide">
                <thead>
                  <tr>
                    <th scope="col">Cesta</th>
                    <th scope="col">Strana</th>
                    <th scope="col" class="num">
                      Požiadavky
                    </th>
                    <th scope="col" class="num">
                      Medián
                    </th>
                    <th scope="col" class="num">
                      95 % do
                    </th>
                    <th scope="col" class="num">
                      Chyby
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {speed.slow.map((r) => (
                    <tr>
                      <td class="antable__key antable__route">{`${r.method === 'POST' ? 'POST ' : ''}${r.route}`}</td>
                      <td>{sideName(r)}</td>
                      <td class="num">{n(r.n)}</td>
                      <td class="num">{msText(r.p50)}</td>
                      <td class="num">{msText(r.p95)}</td>
                      <td class="num">{r.s5 > 0 ? <strong class="anred">{n(r.s5)}</strong> : '0'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p class="info__source">
            {typeset(
              'Čas servera tak, ako ho vidí Worker: čakanie na databázu a súbory áno, čisté počítanie medzi nimi nie. Medián a 95 % sú odhad z intervalov do 25, 50, 100, 200, 400, 800, 1 600 a 3 200 ms. Stránky s menej než 3 požiadavkami tu nie sú.',
            )}
          </p>
        </section>
        <section class="info" aria-labelledby="an-chyby-t">
          <h3 id="an-chyby-t" class="info__title">
            Stránky s chybami
          </h3>
          {speed.failing.length === 0 && site.errors.length === 0 ? (
            <Empty text="Za toto obdobie žiadne chyby." />
          ) : (
            <div class="lscroll">
              <table class="ltable antable antable--wide">
                <thead>
                  <tr>
                    <th scope="col">Cesta</th>
                    <th scope="col">Strana</th>
                    <th scope="col" class="num">
                      Požiadavky
                    </th>
                    <th scope="col" class="num">
                      Chyby servera
                    </th>
                    <th scope="col" class="num">
                      Odmietnuté alebo nenájdené
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {speed.failing.map((r) => (
                    <tr>
                      <td class="antable__key antable__route">{`${r.method === 'POST' ? 'POST ' : ''}${r.route}`}</td>
                      <td>{sideName(r)}</td>
                      <td class="num">{n(r.n)}</td>
                      <td class="num">{r.s5 > 0 ? <strong class="anred">{n(r.s5)}</strong> : '0'}</td>
                      <td class="num">{n(r.s4)}</td>
                    </tr>
                  ))}
                  {site.errors.map((e) => (
                    <tr>
                      <td class="antable__key antable__route">{e.key}</td>
                      <td>Web</td>
                      <td class="num" />
                      <td class="num">
                        <strong class="anred">{n(e.n)}</strong>
                      </td>
                      <td class="num" />
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </section>

      <section class="info ansec" aria-labelledby="an-klienti-t" id="klienti">
        <h2 id="an-klienti-t" class="info__title">
          {`Klienti (${n(clients.length)})`}
        </h2>
        <p class="info__lead">{typeset(`Doklady, faktúry a otázky asistentovi za ${dash.month === dash.today.slice(0, 7) ? 'tento mesiac' : dash.month}; ľudia, ktorí aplikáciu použili za posledných 30 dní.`)}</p>
        <nav class="filters anwrap" aria-label="Zoradiť klientov">
          {SORTS.map((s) => (
            <a class="filters__item" href={`${href(dash.period, s.key)}#klienti`} aria-current={sort === s.key ? 'page' : undefined}>
              {s.label}
            </a>
          ))}
        </nav>
        {clients.length === 0 ? (
          <Empty text="Zatiaľ žiadny klient." />
        ) : (
          <div class="lscroll">
            <table class="ltable antable antable--clients">
              <thead>
                <tr>
                  <th scope="col">Firma</th>
                  <th scope="col">Balík</th>
                  <th scope="col">Účtovníčka</th>
                  <th scope="col">Posledná aktivita</th>
                  <th scope="col" class="num">
                    Ľudia
                  </th>
                  <th scope="col" class="num">
                    Doklady
                  </th>
                  <th scope="col" class="num">
                    Faktúry
                  </th>
                  <th scope="col" class="num">
                    Asistent
                  </th>
                  <th scope="col" class="antable__aml">
                    AML
                  </th>
                </tr>
              </thead>
              <tbody>
                {clients.map((c) => (
                  <tr>
                    <td class="antable__key">
                      <a class="link" href={`/ucto/klienti/${c.id}`}>
                        {c.name}
                      </a>
                      {c.ico ? <span class="antable__sub">{`IČO ${c.ico}`}</span> : null}
                    </td>
                    <td>{planName(c.plan)}</td>
                    <td>{c.accountant ?? 'nikto'}</td>
                    <td>{c.lastActive === null ? 'zatiaľ nikdy' : whenName(c.lastActive, dash.today)}</td>
                    <td class="num">{n(c.active30)}</td>
                    <td class="num">{n(c.documents)}</td>
                    <td class="num">{n(c.invoices)}</td>
                    <td class="num">{n(c.assistant)}</td>
                    <td class="antable__aml">
                      <span class={`pill ${AML[c.aml].tone}`}>{AML[c.aml].text}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section class="info ansec" aria-labelledby="an-ai-t" id="ai">
        <h2 id="an-ai-t" class="info__title">
          AI tento mesiac
        </h2>
        <dl class="kv">
          <div>
            <dt>Doklady prečítané AI</dt>
            <dd>{n(dash.ai.read)}</dd>
          </div>
          <div>
            <dt>E-faktúry prečítané naším kódom</dt>
            <dd>{n(dash.ai.xml)}</dd>
          </div>
          <div>
            <dt>Neprečítala, išli k účtovníčke</dt>
            <dd>{n(dash.ai.failed)}</dd>
          </div>
          <div>
            <dt>Ešte sa čítajú</dt>
            <dd>{n(dash.ai.pending)}</dd>
          </div>
          <div>
            <dt>Zaúčtované bez jedinej opravy</dt>
            <dd>{dash.ai.booked > 0 ? typeset(`${n(dash.ai.unchanged)} z ${n(dash.ai.booked)} (${shareOf(dash.ai.unchanged, dash.ai.booked)})`) : '0 z 0'}</dd>
          </div>
          <div>
            <dt>Zaúčtované samy</dt>
            <dd>{n(dash.ai.autobooked)}</dd>
          </div>
          <div>
            <dt>Otázky asistentovi</dt>
            <dd>{dash.ai.assistantFailed > 0 ? typeset(`${n(dash.ai.assistant)}, neúspešné ${n(dash.ai.assistantFailed)}`) : n(dash.ai.assistant)}</dd>
          </div>
          <div>
            <dt>Tokeny asistenta</dt>
            <dd>{dash.ai.assistantUsd > 0 ? typeset(`${n(dash.ai.tokens)}, ≈ ${usdText(dash.ai.assistantUsd)}`) : n(dash.ai.tokens)}</dd>
          </div>
        </dl>
        <p class="anlinks">
          <a class="link" href="/ucto/ai">
            Presnosť AI po poliach
          </a>
          <a class="link" href="/ucto/ai/asistent">
            Prevádzka asistenta
          </a>
        </p>
      </section>
      <p class="small anfoot">{typeset(`Stav k ${whenName(now, dash.today)}.`)}</p>
    </div>
  )
}
