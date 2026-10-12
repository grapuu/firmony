import type { Child, FC } from 'hono/jsx'
import { ART, BRAND } from '../config'
import { copy } from '../copy'

export interface PageMeta {
  title: string
  description: string
  /** The path of the page, for its canonical address. */
  path: string
  /** Pages that are not for search engines (a form step, an error). */
  noindex?: boolean
  /** The link of the header's button: on the home page it scrolls to the form at its end. */
  ctaHref?: string
}

export const Wordmark: FC<{ href?: string; label?: string }> = ({ href = '/', label = copy.nav.home }) => (
  <a class="wordmark" href={href} aria-label={label}>
    {ART.logo ? <img class="wordmark__logo" src={ART.logo.src} alt="" width={ART.logo.width} height={ART.logo.height} /> : null}
    <span class="wordmark__text">
      firmony<span class="wordmark__dot" aria-hidden="true">.</span>
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
      <meta name="theme-color" content="#000000" />
      <meta name="color-scheme" content="dark" />
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
      <link rel="preload" href="/fonts/serif-latin.woff2" as="font" type="font/woff2" crossorigin="anonymous" />
      <link rel="preload" href="/fonts/host-latin.woff2" as="font" type="font/woff2" crossorigin="anonymous" />
      <link rel="stylesheet" href="/app.css" />
    </head>
    <body>
      <a class="skip" href="#obsah">
        {copy.skip}
      </a>
      <header class="top">
        <div class="top__inner wrap">
          <Wordmark />
          <nav class="top__nav" aria-label="Hlavná navigácia">
            <a href="/#ako-to-funguje">{copy.nav.how}</a>
            <a href="/#cennik">{copy.nav.pricing}</a>
            <a href="/#otazky">{copy.nav.faq}</a>
          </nav>
          <a class="btn btn--white btn--small top__cta" href={meta.ctaHref ?? '/zacat'}>
            {copy.nav.start}
          </a>
        </div>
      </header>
      <main id="obsah">{children}</main>
      <footer class="foot">
        <div class="foot__inner wrap">
          <div class="foot__brand">
            <Wordmark />
            <p>{copy.footer.tagline}</p>
          </div>
          <nav class="foot__nav" aria-label="Pätička">
            <a href="/#ako-to-funguje">{copy.nav.how}</a>
            <a href="/#cennik">{copy.nav.pricing}</a>
            <a href="/#otazky">{copy.nav.faq}</a>
            <a href="/pravne-informacie">{copy.footer.legal}</a>
            <a href="/pravne-informacie#ochrana-udajov">{copy.footer.privacy}</a>
            <a href={`mailto:${BRAND.email}`}>{BRAND.email}</a>
          </nav>
          <p class="foot__rights">{copy.footer.rights}</p>
        </div>
      </footer>
    </body>
  </html>
)
