import type { Child, FC } from 'hono/jsx'
import { ART, BRAND, OPERATOR } from '../config'
import { copy } from '../copy'
import { typeset } from '../format'
import { GUIDES } from '../content/guides'

export interface PageMeta {
  title: string
  description: string
  /** The path of the page, for its canonical address. */
  path: string
  /** Pages that are not for search engines (a form step, an error). */
  noindex?: boolean
  /** The link of the header's button: on the home page it scrolls to the form at its end. */
  ctaHref?: string
  /** What the header's button says, where it is not the way to start with a company (the investors' page). */
  ctaText?: string
  /** What search engines read beside the page: schema.org data as JSON-LD (src/seo.ts), already serialised. */
  jsonLd?: string
}

/** His glass F beside the name, set in the blue sans, with a full stop in the red of the serif. */
export const Wordmark: FC<{ href?: string; label?: string }> = ({ href = '/', label = copy.nav.home }) => (
  <a class="wordmark" href={href} aria-label={label}>
    {ART.logo ? <img class="wordmark__mark" src={ART.logo.src} width={ART.logo.width} height={ART.logo.height} alt="" /> : null}
    <span class="wordmark__name" aria-hidden="true">
      firmony<span class="wordmark__dot">.</span>
    </span>
  </a>
)

export const Layout: FC<{ meta: PageMeta; children: Child }> = ({ meta, children }) => (
  <html lang="sk">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>{meta.title}</title>
      <meta name="description" content={meta.description} />
      <link rel="canonical" href={`${BRAND.origin}${meta.path}`} />
      {meta.noindex ? <meta name="robots" content="noindex" /> : null}
      <meta property="og:type" content="website" />
      <meta property="og:site_name" content={BRAND.name} />
      <meta property="og:title" content={meta.title} />
      <meta property="og:description" content={meta.description} />
      <meta property="og:url" content={`${BRAND.origin}${meta.path}`} />
      <meta property="og:locale" content="sk_SK" />
      {meta.jsonLd ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: meta.jsonLd }} /> : null}
      <meta name="theme-color" content="#ffffff" />
      {ART.logo ? (
        <>
          <link rel="icon" href="/favicon.ico" sizes="48x48" />
          <link rel="icon" href="/art/icon-192.png" type="image/png" sizes="192x192" />
          <link rel="apple-touch-icon" href="/art/icon-180.png" />
          <meta property="og:image" content={`${BRAND.origin}/art/share.png`} />
        </>
      ) : (
        <link rel="icon" href="data:," />
      )}
      <link rel="preload" href="/fonts/funnel-latin.woff2" as="font" type="font/woff2" crossorigin="anonymous" />
      <link rel="preload" href="/fonts/figtree-latin.woff2" as="font" type="font/woff2" crossorigin="anonymous" />
      <link rel="preload" href="/fonts/news-latin-italic.woff2" as="font" type="font/woff2" crossorigin="anonymous" />
      <link rel="stylesheet" href="/app.css" />
    </head>
    <body class={meta.path === '/' ? 'is-home' : 'is-page'}>
      <a class="skip" href="#obsah">
        {copy.skip}
      </a>
      <header class="top">
        <div class="top__inner wrap">
          <Wordmark />
          <nav class="top__nav" aria-label="Hlavná navigácia">
            <a href="/#ako-to-funguje">{copy.nav.how}</a>
            <a href="/#cennik">{copy.nav.pricing}</a>
            <a href="/#kto-sme">{copy.nav.about}</a>
            <a href="/#otazky">{copy.nav.faq}</a>
            <a href="/investori" aria-current={meta.path === '/investori' ? 'page' : undefined}>
              {copy.nav.investors}
            </a>
          </nav>
          <a class="top__login" href="/app/prihlasenie">
            {copy.nav.login}
          </a>
          <a class="btn btn--blue btn--small top__cta" href={meta.ctaHref ?? '/zacat'}>
            {meta.ctaText ?? copy.nav.start}
          </a>
        </div>
      </header>
      <main id="obsah">{children}</main>
      <footer class="foot">
        <div class="wrap">
          <div class="foot__grid">
            <div class="foot__brand">
              <Wordmark />
              <p>{copy.footer.tagline}</p>
            </div>
            <nav class="foot__col" aria-label={copy.footer.service}>
              <p class="foot__head">{copy.footer.service}</p>
              <a href="/#ako-to-funguje">{copy.nav.how}</a>
              <a href="/#cennik">{copy.nav.pricing}</a>
              <a href="/#kalkulacka">{copy.footer.calc}</a>
              <a href="/#otazky">{copy.nav.faq}</a>
              <a href="/investori">{copy.nav.investors}</a>
              <a href="/app/prihlasenie">{copy.nav.login}</a>
            </nav>
            <nav class="foot__col" aria-label={copy.footer.guides}>
              <p class="foot__head">{copy.footer.guides}</p>
              {GUIDES.map((g) => (
                <a href={g.path}>{typeset(g.nav)}</a>
              ))}
            </nav>
            <nav class="foot__col" aria-label={copy.footer.company}>
              <p class="foot__head">{copy.footer.company}</p>
              <a href="/#kto-sme">{copy.nav.about}</a>
              <a href="/podmienky">{copy.footer.terms}</a>
              <a href="/pravne-informacie">{copy.footer.legal}</a>
              <a href="/pravne-informacie#ochrana-udajov">{copy.footer.privacy}</a>
              <a href="/pravne-informacie#cookies">{copy.footer.cookies}</a>
            </nav>
            <div class="foot__col">
              <p class="foot__head">{copy.footer.contact}</p>
              <a href={`mailto:${BRAND.email}`}>{BRAND.email}</a>
              <a href={OPERATOR.phoneHref}>{OPERATOR.phone}</a>
              <p>{copy.footer.reply}</p>
            </div>
          </div>
          <div class="foot__legal">
            <p>{copy.footer.imprint}</p>
            <p>{copy.footer.rights}</p>
          </div>
        </div>
      </footer>
    </body>
  </html>
)
