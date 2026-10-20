// A guide of the site (content/guides.ts): one question people search, answered on a page of its own in the site's
// own type, with its questions, its sources, the other guides and the way to start. Server-rendered, no script.
import type { FC } from 'hono/jsx'
import type { Guide } from '../content/guides'
import { GUIDES } from '../content/guides'
import { dayName } from '../app/copy'
import { typeset as t } from '../format'
import { StartForm } from './home'

export const GuidePage: FC<{ guide: Guide }> = ({ guide: g }) => (
  <>
    <article class="section page guide">
      <div class="wrap narrow page__inner legal">
        <nav class="guide__crumbs" aria-label="Kde ste">
          <a class="link" href="/">
            Firmony
          </a>
          <span aria-hidden="true"> / </span>
          <span>{t(g.first.replace(/\.$/, ''))}</span>
        </nav>
        <h1 class="title guide__title">
          <span class="title__sans">{t(g.first)}</span> <em class="title__serif">{t(g.second)}</em>
        </h1>
        <p class="lead">{t(g.lead)}</p>
        <p class="small">{`Aktualizované ${dayName(g.modified)}`}</p>
        {g.sections.map((s) => (
          <section>
            <h2 class="h3">{t(s.h)}</h2>
            {s.p.map((p) => (
              <p>{t(p)}</p>
            ))}
            {s.list ? (
              <ul>
                {s.list.map((item) => (
                  <li>{t(item)}</li>
                ))}
              </ul>
            ) : null}
          </section>
        ))}
        {g.faq.length > 0 ? (
          <section id="otazky">
            <h2 class="h3">Časté otázky</h2>
            <div class="faq">
              {g.faq.map((item) => (
                <details class="faq__item">
                  <summary>{t(item.q)}</summary>
                  <p>{t(item.a)}</p>
                </details>
              ))}
            </div>
          </section>
        ) : null}
        {g.sources.length > 0 ? (
          <section>
            <h2 class="h3">Zdroje</h2>
            <ul>
              {g.sources.map((s) => (
                <li>
                  <a class="link" href={s.url} rel="noopener">
                    {t(s.title)}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        <section class="guide__start" aria-labelledby="guide-start">
          <h2 id="guide-start" class="h3">
            Začnite s IČO Vašej firmy
          </h2>
          <p>{t('Názov a sídlo doplníme z registra. Je to nezáväzné a ozveme sa do jedného pracovného dňa.')}</p>
          <StartForm carry={[]} id="ico-guide" compact />
          <p>
            <a class="link" href="/#cennik">
              Pozrieť cenník
            </a>
          </p>
        </section>
        <nav class="guide__more" aria-label="Ďalšie články">
          <h2 class="h3">Ďalšie články</h2>
          <ul>
            {GUIDES.filter((other) => other.path !== g.path).map((other) => (
              <li>
                <a class="link" href={other.path}>
                  {t(`${other.first} ${other.second}`)}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </article>
  </>
)
