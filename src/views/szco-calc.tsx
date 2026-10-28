// The SZČO tax-and-levy calculator (/szco-kalkulacka): a GET form computed by the engine, with what it counts, its
// questions and its sources. No script.
import type { FC } from 'hono/jsx'
import { formatEurExact, typeset as t } from '../format'
import { SZCO_PAGE as w, SZCO_PATH, szcoNote, szcoSocialNote } from '../content/szco-calc'
import { szcoYears, type SzcoQuery, type SzcoResult } from '../app/szco-calc'
import { GUIDES } from '../content/guides'
import { StartForm } from './home'
import { copy } from '../copy'

const eur = (cents: number) => formatEurExact(cents)
const amount = (cents: number) => (cents / 100).toFixed(2).replace('.', ',').replace(/,00$/, '')

const Line: FC<{ label: string; value: string; total?: boolean }> = ({ label, value, total }) => (
  <p class={`calc__line${total ? ' calc__line--total' : ''}`}>
    <span>{t(label)}</span>
    <strong>{value}</strong>
  </p>
)

export const SzcoCalcPage: FC<{ query: SzcoQuery | null; result: SzcoResult | null; error: boolean; year: number }> = ({ query, result, error, year }) => (
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
        <form class="calc__form" method="get" action={`${SZCO_PATH}#vysledok`} novalidate>
          <label class="calc__field">
            <span class="calc__label">{w.form.revenue}</span>
            <span class="calc__input calc__input--suffix">
              <input class="input" type="text" name="prijem" value={query ? amount(query.revenue) : ''} placeholder="25 000" inputmode="decimal" autocomplete="off" />
              <span class="calc__suffix">€</span>
            </span>
          </label>
          <fieldset class="calc__field calc__choice">
            <legend class="calc__label">{w.form.year}</legend>
            <span class="seg">
              {szcoYears().map((y) => (
                <label class="seg__option">
                  <input type="radio" name="rok" value={String(y)} checked={y === year} />
                  <span>{y}</span>
                </label>
              ))}
            </span>
          </fieldset>
          <fieldset class="calc__field calc__choice">
            <legend class="calc__label">{w.form.expenses}</legend>
            <span class="seg">
              <label class="seg__option">
                <input type="radio" name="vydavky" value="pausal" checked={!query || query.mode === 'pausal'} />
                <span>60 %</span>
              </label>
              <label class="seg__option">
                <input type="radio" name="vydavky" value="real" checked={query?.mode === 'real'} />
                <span>Skutočné</span>
              </label>
            </span>
          </fieldset>
          {query?.mode === 'real' ? (
            <label class="calc__field">
              <span class="calc__label">{w.form.realSum}</span>
              <span class="calc__input calc__input--suffix">
                <input class="input" type="text" name="vydavky_suma" value={amount(query.expenses)} placeholder="10 000" inputmode="decimal" autocomplete="off" />
                <span class="calc__suffix">€</span>
              </span>
            </label>
          ) : null}
          <button class="btn btn--blue calc__button" type="submit">{w.form.button}</button>
        </form>
        <div class="calc__result" id="vysledok" role="status">
          {error ? (
            <p class="calc__message">{t(w.form.error)}</p>
          ) : result ? (
            <>
              <Line label={w.result.revenue} value={eur(result.query.revenue)} />
              <Line label={result.query.mode === 'pausal' ? w.result.expenses : w.result.realExpenses} value={`−${eur(result.expenses)}`} />
              <Line label={w.result.czd} value={eur(result.czd)} />
              <Line label={w.result.sp} value={`−${eur(result.spYear)}`} />
              <Line label={w.result.zp} value={`−${eur(result.zpYear)}`} />
              <Line label={w.result.odvody} value={`−${eur(result.odvody)}`} />
              <Line label={w.result.nczd} value={`−${eur(result.nczd)}`} />
              <Line label={w.result.tax} value={`−${eur(result.tax)}`} />
              <Line label={result.query.mode === 'pausal' ? w.result.netPausal : w.result.net} value={eur(result.net)} total />
              {szcoSocialNote(result).map((line) => (
                <p class="small">{t(line)}</p>
              ))}
              <p class="small">{t(szcoNote(result.query.year))}</p>
            </>
          ) : (
            <p class="calc__message">{t(w.form.empty)}</p>
          )}
        </div>
      </div>
      {w.sections.map((sec) => (
        <section>
          <h2 class="h3">{t(sec.h)}</h2>
          {sec.p.map((p) => (
            <p>{t(p)}</p>
          ))}
        </section>
      ))}
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
        <p>{t('Účtovníctvo, dane a mzdy pre s. r. o. za Vás vybavíme. Ak už s. r. o. máte, zadajte jej IČO. Názov a sídlo doplníme z registra, je to nezáväzné.')}</p>
        <StartForm carry={[]} id="ico-szco" compact />
        <p class="small">
          <a class="link" href="/zalozenie">{copy.final.noCompany}</a>
        </p>
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

