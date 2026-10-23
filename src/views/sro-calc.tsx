// The SRO corporate-tax and dividend calculator (/sro-kalkulacka): a GET form computed by the engine. No script.
import type { FC } from 'hono/jsx'
import { formatEurExact, typeset as t } from '../format'
import { SRO_PAGE as w, SRO_PATH } from '../content/sro-calc'
import { sroCalc, sroRevenueOf, type SroQuery, type SroResult } from '../app/sro-calc'
import { GUIDES } from '../content/guides'
import { StartForm } from './home'

const eur = (cents: number) => formatEurExact(cents)
const amount = (cents: number) => (cents / 100).toFixed(2).replace('.', ',').replace(/,00$/, '')

const Line: FC<{ label: string; value: string; total?: boolean }> = ({ label, value, total }) => (
  <p class={`calc__line${total ? ' calc__line--total' : ''}`}>
    <span>{t(label)}</span>
    <strong>{value}</strong>
  </p>
)

export const SroCalcPage: FC<{ query: SroQuery | null; result: SroResult | null; error: boolean }> = ({ query, result, error }) => (
  <article class="section page guide">
    <div class="wrap narrow page__inner legal">
      <nav class="guide__crumbs" aria-label="Kde ste">
        <a class="link" href="/">Firmony</a>
        <span aria-hidden="true"> / </span>
        <span>{t(w.nav)}</span>
      </nav>
      <h1 class="title guide__title">
        <span class="title__sans">{t(w.first)}</span> <em class="title__serif">{t(w.second)}</em>
      </h1>
      <p class="lead">{t(w.lead)}</p>
      <div class="calc wage">
        <form class="calc__form" method="get" action={`${SRO_PATH}#vysledok`} novalidate>
          <label class="calc__field">
            <span class="calc__label">{w.form.revenue}</span>
            <span class="calc__input calc__input--suffix">
              <input class="input" type="text" name="prijem" value={query ? amount(query.revenue) : ''} placeholder="120 000" inputmode="decimal" autocomplete="off" />
              <span class="calc__suffix">€</span>
            </span>
          </label>
          <label class="calc__field">
            <span class="calc__label">{w.form.expenses}</span>
            <span class="calc__input calc__input--suffix">
              <input class="input" type="text" name="vydavky" value={query ? amount(query.expenses) : ''} placeholder="40 000" inputmode="decimal" autocomplete="off" />
              <span class="calc__suffix">€</span>
            </span>
          </label>
          <button class="btn btn--blue calc__button" type="submit">{w.form.button}</button>
        </form>
        <div class="calc__result" id="vysledok" role="status">
          {error ? (
            <p class="calc__message">{t(w.form.error)}</p>
          ) : result ? (
            <>
              <Line label={w.result.profit} value={eur(result.profit)} />
              <Line label={w.result.corporate} value={`−${eur(result.corporate)}`} />
              <Line label={w.result.netProfit} value={eur(result.netProfit)} />
              <Line label={w.result.dividend} value={`−${eur(result.dividend)}`} />
              <Line label={w.result.net} value={eur(result.net)} total />
              <p class="small">{t(w.result.note)}</p>
            </>
          ) : (
            <p class="calc__message">{t(w.form.empty)}</p>
          )}
        </div>
      </div>
      <section id="otazky">
        <h2 class="h3">Časté otázky</h2>
        <div class="faq">
          {w.faq.map((item) => (
            <details class="faq__item">
              <summary>{t(item.q)}</summary>
              <p>{t(item.a)}</p>
            </details>
          ))}
        </div>
      </section>
      <section>
        <h2 class="h3">Zdroje</h2>
        <ul>
          {w.sources.map((src) => (
            <li>
              <a class="link" href={src.url} rel="noopener">{t(src.title)}</a>
            </li>
          ))}
        </ul>
      </section>
      <section class="guide__start" aria-labelledby="guide-start">
        <h2 id="guide-start" class="h3">Začnite s IČO Vašej firmy</h2>
        <p>{t('Daň z príjmov, závierku aj mzdy za Vás vybavíme. Názov a sídlo doplníme z registra, je to nezáväzné.')}</p>
        <StartForm carry={[]} id="ico-sro" compact />
      </section>
      <nav class="guide__more" aria-label="Ďalšie články">
        <h2 class="h3">Ďalšie články</h2>
        <ul>
          {GUIDES.map((g) => (
            <li>
              <a class="link" href={g.path}>{t(`${g.first} ${g.second}`)}</a>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  </article>
)
