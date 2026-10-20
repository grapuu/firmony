// The net wage calculator (/mzdova-kalkulacka): a GET form, computed on the server by the payroll engine, with what it
// counts, its questions and its sources. No script.
import type { FC } from 'hono/jsx'
import { formatEurExact } from '../format'
import { typeset as t } from '../format'
import { WAGE_PAGE as w } from '../content/wage-calc'
import { calcYears, type WageQuery, type WageResult } from '../app/wage-calc'
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

export const WageCalcPage: FC<{ query: WageQuery | null; result: WageResult | null; error: boolean; year: number }> = ({ query, result, error, year }) => {
  const s = result?.slip
  return (
    <article class="section page guide">
      <div class="wrap narrow page__inner legal">
        <nav class="guide__crumbs" aria-label="Kde ste">
          <a class="link" href="/">
            Firmony
          </a>
          <span aria-hidden="true"> / </span>
          <span>{t(w.nav)}</span>
        </nav>
        <h1 class="title guide__title">
          <span class="title__sans">{t(w.first)}</span> <em class="title__serif">{t(w.second)}</em>
        </h1>
        <p class="lead">{t(w.lead)}</p>
        <div class="calc wage">
          <form class="calc__form" method="get" action="/mzdova-kalkulacka#vysledok" novalidate>
            <label class="calc__field">
              <span class="calc__label">{t(w.form.gross)}</span>
              <span class="calc__input calc__input--suffix">
                <input class="input" type="text" name="hruba" value={query ? amount(query.gross) : ''} placeholder="1 500" inputmode="decimal" autocomplete="off" />
                <span class="calc__suffix">€</span>
              </span>
            </label>
            <fieldset class="calc__field calc__choice">
              <legend class="calc__label">{w.form.year}</legend>
              <span class="seg">
                {calcYears().map((y) => (
                  <label class="seg__option">
                    <input type="radio" name="rok" value={String(y)} checked={y === year} />
                    <span>{y}</span>
                  </label>
                ))}
              </span>
            </fieldset>
            <label class="calc__field">
              <span class="calc__label">{w.form.young}</span>
              <span class="calc__input">
                <input class="input" type="text" name="deti" value={String(query?.young ?? 0)} inputmode="numeric" autocomplete="off" />
              </span>
            </label>
            <label class="calc__field">
              <span class="calc__label">{w.form.teen}</span>
              <span class="calc__input">
                <input class="input" type="text" name="deti15" value={String(query?.teen ?? 0)} inputmode="numeric" autocomplete="off" />
              </span>
            </label>
            <label class="agree">
              <input type="checkbox" name="vyhlasenie" value="1" checked={query ? query.declaration : true} />
              <span>{t(w.form.declaration)}</span>
            </label>
            <label class="agree">
              <input type="checkbox" name="zps" value="1" checked={query?.disabled ?? false} />
              <span>{t(w.form.disabled)}</span>
            </label>
            <button class="btn btn--blue calc__button" type="submit">
              {w.form.button}
            </button>
          </form>
          <div class="calc__result" id="vysledok" role="status">
            {error ? (
              <p class="calc__message">{t(w.form.error)}</p>
            ) : s && result ? (
              <>
                <Line label={w.result.gross} value={eur(s.gross)} />
                <Line label={w.result.social} value={`−${eur(s.socialEmployee)}`} />
                <Line label={w.result.health} value={`−${eur(s.healthEmployee)}`} />
                <Line label={w.result.advance} value={`−${eur(s.advance)}`} />
                {s.bonus > 0 ? <Line label={w.result.bonus} value={`+${eur(s.bonus)}`} /> : null}
                <Line label={w.result.net} value={eur(s.net)} total />
                <Line label={w.result.employerSocial} value={eur(s.socialEmployer)} />
                <Line label={w.result.employerHealth} value={eur(s.healthEmployer)} />
                <Line label={w.result.cost} value={eur(result.cost)} total />
                {s.gross < result.minimumWage ? <p class="small">{t(w.result.below(eur(result.minimumWage)))}</p> : null}
                <p class="small">{t(w.result.note)}</p>
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
                <a class="link" href={src.url} rel="noopener">
                  {t(src.title)}
                </a>
              </li>
            ))}
          </ul>
        </section>
        <section class="guide__start" aria-labelledby="guide-start">
          <h2 id="guide-start" class="h3">
            Začnite s IČO Vašej firmy
          </h2>
          <p>{t('Mzdy, odvody aj prihlášky zamestnancov za Vás vybavíme. Názov a sídlo doplníme z registra, je to nezáväzné.')}</p>
          <StartForm carry={[]} id="ico-wage" compact />
        </section>
        <nav class="guide__more" aria-label="Ďalšie články">
          <h2 class="h3">Ďalšie články</h2>
          <ul>
            {GUIDES.map((g) => (
              <li>
                <a class="link" href={g.path}>
                  {t(`${g.first} ${g.second}`)}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </article>
  )
}
