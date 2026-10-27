// The client's app: the frame every page stands in (a column on the left on a computer, a bar of tabs at the
// bottom of a phone), and the pages of signing in. The same white, blue and red as the site, his glass in tiles,
// the warm half of a title in the red serif; less to read than anywhere else.
import type { Child, FC } from 'hono/jsx'
import { ART, BRAND, type Art } from '../config'
import { app, dayName } from '../app/copy'
import type { Ending } from '../app/ending'
import type { Company, Who } from '../app/store'
import { Picture, Tile } from './home'
import { Wordmark } from './layout'
import { invoicingCopy } from '../content/invoicing'
import { peppolCopy } from '../peppol/copy'
import { MonyBubble } from './mony'
import type { MonyAudience } from '../assistant/mony'

export type Place = 'home' | 'payments' | 'documents' | 'invoices' | 'taxes' | 'messages' | 'company' | 'customers' | 'received'

/** The head of every page of the app: its own stylesheet after the site's, and its one small script. */
export const InsideHead: FC<{ title: string; security?: boolean }> = ({ title, security = false }) => (
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>{title}</title>
    <meta name="robots" content="noindex, nofollow" />
    <meta name="theme-color" content="#ffffff" />
    <link rel="icon" href="/favicon.ico" sizes="48x48" />
    <link rel="apple-touch-icon" href="/art/icon-180.png" />
    <link rel="manifest" href="/manifest.webmanifest" />
    <meta name="apple-mobile-web-app-title" content="Firmony" />
    <meta name="mobile-web-app-capable" content="yes" />
    <link rel="preload" href="/fonts/funnel-latin.woff2" as="font" type="font/woff2" crossorigin="anonymous" />
    <link rel="preload" href="/fonts/figtree-latin.woff2" as="font" type="font/woff2" crossorigin="anonymous" />
    <link rel="stylesheet" href="/app.css" />
    <link rel="stylesheet" href="/inside.css" />
    <script src="/inside.js" defer></script>
    {security ? <script src="/security.js" defer></script> : null}
  </head>
)

/** A title of the app: the plain half in the blue sans, the warm half in the red serif on a line of its own. */
export const Heading: FC<{ first: string; second?: string; small?: boolean; id?: string }> = ({ first, second, small, id }) => (
  <h1 id={id} class={`ptitle${small ? ' ptitle--small' : ''}`}>
    <span class="ptitle__sans">{first}</span>
    {second ? (
      <>
        {' '}
        <em class="ptitle__serif">{second}</em>
      </>
    ) : null}
  </h1>
)

/** A short sentence after something was done: green when it went well, amber when something needs a look. */
export const Flash: FC<{ text?: string | null; tone?: 'ok' | 'warn' | 'error' }> = ({ text, tone = 'ok' }) =>
  text ? (
    <p class={`flash flash--${tone}`} role="status">
      {tone === 'ok' ? <span class="tick" aria-hidden="true" /> : null}
      <span>{text}</span>
    </p>
  ) : null

const NAV: { place: Place; href: string; label: string; art: Art | null; tab: boolean }[] = [
  { place: 'home', href: '/app', label: app.nav.home, art: ART.mark, tab: true },
  { place: 'payments', href: '/app/platby', label: app.nav.payments, art: ART.paperBank, tab: true },
  { place: 'documents', href: '/app/doklady', label: app.nav.documents, art: ART.paperReceipt, tab: true },
  // Invoices are issued now and then: on a phone they are in the bar's menu, the tabs keep what is done daily.
  { place: 'invoices', href: '/app/faktury', label: app.invoices.nav, art: ART.paperInvoice, tab: false },
  // Taxes once a month, and only for a company registered for VAT: the column, and on a phone the bar's menu.
  { place: 'taxes', href: '/app/dane', label: app.nav.taxes, art: ART.paperReturn, tab: false },
  { place: 'messages', href: '/app/spravy', label: app.nav.messages, art: ART.chat, tab: true },
]
const TABS = NAV.filter((item) => item.tab)

const Count: FC<{ n: number; tone?: 'amber' | 'blue' }> = ({ n, tone = 'amber' }) => (n > 0 ? <span class={`count count--${tone}`}>{n}</span> : null)

/** The form every page carries for adding documents from anywhere: the button of the side and the tab of a phone. */
const Pick: FC = () => (
  <form id="pick" class="pick" method="post" action="/app/doklady" enctype="multipart/form-data" data-upload>
    <label class="pick__label" for="pick-file">
      {app.nav.add}
    </label>
    <input id="pick-file" class="pick__file" type="file" name="file" multiple accept="image/*,application/pdf,.pdf,.xml,text/xml,application/xml" />
    <button class="btn btn--blue btn--small pick__send" type="submit">
      {app.add.send}
    </button>
  </form>
)

export interface ShellProps {
  who: Who & { company: Company }
  place: Place | null
  missing: number
  unread: number
  /** Every company of the user, to switch between them; one company shows no switch. */
  companies: { id: string; name: string }[]
  title: string
  /** The contract's end, once it has a last day: a line above every page says what follows. */
  ending?: Ending | null
  /** A workspace's received e-invoices: shown once the postman is connected or one came; the count waits to be paid. */
  received?: { unpaid: number } | null
  /** Mony in the corner, for whom it answers here; none without its key. */
  mony?: MonyAudience | null
  children: Child
}

/** Above every page from the day the contract has a last day: when it ends, and what is left to do after it. */
const EndBanner: FC<{ ending: Ending }> = ({ ending }) => {
  const e = app.ending
  const text =
    ending.phase === 'ending'
      ? e.banner.ending(dayName(ending.endsOn))
      : ending.phase === 'closing'
        ? e.banner.closing(dayName(ending.endsOn), dayName(ending.intakeUntil))
        : e.banner.ended(dayName(ending.endsOn), dayName(ending.accessUntil))
  return (
    <p class={`endline endline--${ending.phase}`} role="status">
      <span class="endline__text">{text}</span>
      <a class="endline__link" href={ending.phase === 'ending' ? '/app/firma#zmluva' : '/app/firma#stiahnut'}>
        {ending.phase === 'ending' ? e.next : e.download}
      </a>
    </p>
  )
}

export const Shell: FC<ShellProps> = (props) => {
  if (props.who.company.invoicingOnly) return <InvoicingShell {...props} />
  return <ClientShell {...props} />
}

/** The places of a workspace of invoicing alone (app/invoicing.ts): its invoices, its customers, what it received, its settings. */
const INVOICING_NAV: { place: Place; href: string; label: string; art: Art | null }[] = [
  { place: 'invoices', href: '/app/faktury', label: invoicingCopy.app.nav.invoices, art: ART.paperInvoice },
  { place: 'customers', href: '/app/odberatelia', label: invoicingCopy.app.nav.customers, art: ART.lens },
  { place: 'received', href: '/app/prijate', label: peppolCopy.received.nav, art: ART.envelope },
  { place: 'company', href: '/app/fakturacia', label: invoicingCopy.app.nav.settings, art: ART.key },
]

/** The frame of a workspace: the same column and tabs as a client's, with only what invoicing has. */
const InvoicingShell: FC<ShellProps> = ({ who, place, companies, title, received = null, mony = null, children }) => {
  const nav = invoicingCopy.app.nav
  const items = INVOICING_NAV.filter((item) => item.place !== 'received' || received)
  return (
    <html lang="sk">
      <InsideHead title={`${title} | ${BRAND.name}`} />
      <body class="inside inside--invoicing" data-client-context={`${who.user.id}:${who.company.id}`}>
        <a class="skip" href="#obsah">
          {app.skip}
        </a>
        <div class="shell">
          <aside class="side" aria-label={app.nav.label}>
            <div class="side__top">
              <Wordmark href="/app/faktury" label={nav.invoices} />
            </div>
            {companies.length > 1 ? (
              <details class="side__company side__company--switch">
                <summary class="side__summary">
                  <span class="side__name">{who.company.name}</span>
                  <span class="side__plan">{invoicingCopy.app.plan}</span>
                </summary>
                <div class="side__switch">
                  <p class="side__switchlabel">{app.nav.switch}</p>
                  {companies.map((other) => (
                    <form method="post" action="/app/firma/prepnut">
                      <input type="hidden" name="firma" value={other.id} />
                      <button class="side__other" type="submit" aria-current={other.id === who.company.id ? 'true' : undefined}>
                        {other.name}
                      </button>
                    </form>
                  ))}
                </div>
              </details>
            ) : (
              <div class="side__company">
                <span class="side__name">{who.company.name}</span>
                <span class="side__plan">{invoicingCopy.app.plan}</span>
              </div>
            )}
            <nav class="side__nav">
              {items.map((item) => (
                <a class="side__link" href={item.href} aria-current={place === item.place ? 'page' : undefined}>
                  <Tile art={item.art} size="sm" />
                  <span class="side__label">{item.label}</span>
                  {item.place === 'received' && received ? <Count n={received.unpaid} /> : null}
                </a>
              ))}
            </nav>
            <a class="btn btn--blue side__add" href="/app/faktury/nova">
              {nav.add}
            </a>
            <div class="side__foot">
              {who.user.team ? (
                <a class="side__team" href="/ucto">
                  {app.nav.team}
                </a>
              ) : null}
              <span class="side__user">{who.user.name}</span>
              <span class="side__email">{who.user.email}</span>
              <a class="side__out" href="/auth?next=%2Fapp%2Ffaktury">
                Zabezpečenie prístupu
              </a>
              <form method="post" action="/app/odhlasit">
                <button class="side__out" type="submit">
                  {app.nav.signOut}
                </button>
              </form>
            </div>
          </aside>
          <div class="stage">
            <header class="bar">
              <Wordmark href="/app/faktury" label={nav.invoices} />
              <BarMenu label={who.company.name} user={who.user}>
                {companies.length > 1 ? (
                  <>
                    <p class="barmenu__label">{app.nav.switch}</p>
                    {companies.map((other) => (
                      <form method="post" action="/app/firma/prepnut">
                        <input type="hidden" name="firma" value={other.id} />
                        <button class="barmenu__item" type="submit" aria-current={other.id === who.company.id ? 'true' : undefined}>
                          {other.name}
                        </button>
                      </form>
                    ))}
                  </>
                ) : null}
                {who.user.team ? (
                  <a class="barmenu__item" href="/ucto">
                    {app.nav.team}
                  </a>
                ) : null}
              </BarMenu>
            </header>
            <main id="obsah" class="content">
              {children}
            </main>
          </div>
        </div>
        <nav class="tabs" aria-label={app.nav.label}>
          {items.slice(0, 2).map((item) => (
            <InvoicingTab item={item} place={place} />
          ))}
          <a class="tabs__add" href="/app/faktury/nova" aria-label={nav.add}>
            <span class="tabs__plus" aria-hidden="true">
              +
            </span>
            <span class="tabs__label">{nav.addShort}</span>
          </a>
          {items.slice(2).map((item) => (
            <InvoicingTab item={item} place={place} />
          ))}
        </nav>
        {mony ? <MonyBubble audience={mony} /> : null}
      </body>
    </html>
  )
}

const InvoicingTab: FC<{ item: (typeof INVOICING_NAV)[number]; place: Place | null }> = ({ item, place }) => (
  <a class="tabs__link" href={item.href} aria-current={place === item.place ? 'page' : undefined}>
    <span class="tabs__icon">
      <Picture art={item.art} className="tabs__img" sizes="28px" />
    </span>
    <span class="tabs__label">{item.label}</span>
  </a>
)

const ClientShell: FC<ShellProps> = ({ who, place, missing, unread, companies, title, ending = null, mony = null, children }) => {
  // Ten days past the last day nothing more is taken: the buttons for a document lead to the page that says so.
  const intake = !ending || ending.phase !== 'ended'
  return (
  <html lang="sk">
    <InsideHead title={`${title} | ${BRAND.name}`} />
    <body class="inside" data-client-context={`${who.user.id}:${who.company.id}`}>
      <a class="skip" href="#obsah">
        {app.skip}
      </a>
      <div class="shell">
        <aside class="side" aria-label={app.nav.label}>
          <div class="side__top">
            <Wordmark href="/app" label={app.nav.home} />
          </div>
          {companies.length > 1 ? (
            <details class="side__company side__company--switch">
              <summary class="side__summary">
                <span class="side__name">{who.company.name}</span>
                <span class="side__plan">{app.nav.plan(planName(who.company.plan))}</span>
              </summary>
              <div class="side__switch">
                <p class="side__switchlabel">{app.nav.switch}</p>
                {companies.map((other) => (
                  <form method="post" action="/app/firma/prepnut">
                    <input type="hidden" name="firma" value={other.id} />
                    <button class="side__other" type="submit" aria-current={other.id === who.company.id ? 'true' : undefined}>
                      {other.name}
                    </button>
                  </form>
                ))}
              </div>
            </details>
          ) : (
            <div class="side__company">
              <span class="side__name">{who.company.name}</span>
              <span class="side__plan">{app.nav.plan(planName(who.company.plan))}</span>
            </div>
          )}
          <nav class="side__nav">
            {NAV.filter((item) => item.place !== 'taxes' || who.company.vatStatus !== 'none').map((item) => (
              <a class="side__link" href={item.href} aria-current={place === item.place ? 'page' : undefined}>
                <Tile art={item.art} size="sm" />
                <span class="side__label">{item.label}</span>
                {item.place === 'payments' ? <Count n={missing} /> : null}
                {item.place === 'messages' ? <Count n={unread} tone="blue" /> : null}
              </a>
            ))}
          </nav>
          {intake ? (
            <a class="btn btn--blue side__add" href="/app/doklady#pridat" data-pick>
              {app.nav.add}
            </a>
          ) : null}
          <div class="side__foot">
            <a class="side__team" href="/app/firma" aria-current={place === 'company' ? 'page' : undefined}>
              {app.nav.settings}
            </a>
            {who.user.team ? (
              <a class="side__team" href="/ucto">
                {app.nav.team}
              </a>
            ) : null}
            <span class="side__user">{who.user.name}</span>
            <span class="side__email">{who.user.email}</span>
            <a class="side__out" href="/auth?next=%2Fapp">Zabezpečenie prístupu</a>
            <form method="post" action="/app/odhlasit">
              <button class="side__out" type="submit">
                {app.nav.signOut}
              </button>
            </form>
          </div>
        </aside>
        <div class="stage">
          <header class="bar">
            <Wordmark href="/app" label={app.nav.home} />
            <BarMenu label={who.company.name} user={who.user}>
              <a class="barmenu__item" href="/app/faktury">
                {app.invoices.nav}
              </a>
              {who.company.vatStatus !== 'none' ? (
                <a class="barmenu__item" href="/app/dane">
                  {app.nav.taxes}
                </a>
              ) : null}
              <a class="barmenu__item" href="/app/firma">
                {app.nav.settings}
              </a>
              {companies.length > 1 ? (
                <>
                  <p class="barmenu__label">{app.nav.switch}</p>
                  {companies.map((other) => (
                    <form method="post" action="/app/firma/prepnut">
                      <input type="hidden" name="firma" value={other.id} />
                      <button class="barmenu__item" type="submit" aria-current={other.id === who.company.id ? 'true' : undefined}>
                        {other.name}
                      </button>
                    </form>
                  ))}
                </>
              ) : null}
              {who.user.team ? (
                <a class="barmenu__item" href="/ucto">
                  {app.nav.team}
                </a>
              ) : null}
            </BarMenu>
          </header>
          <main id="obsah" class="content">
            {ending ? <EndBanner ending={ending} /> : null}
            {children}
          </main>
        </div>
      </div>
      <nav class="tabs" aria-label={app.nav.label}>
        {TABS.slice(0, 2).map((item) => (
          <TabLink item={item} place={place} n={item.place === 'payments' ? missing : 0} />
        ))}
        <a class="tabs__add" href="/app/doklady#pridat" data-pick={intake ? true : undefined} aria-label={app.nav.add}>
          <span class="tabs__plus" aria-hidden="true">
            +
          </span>
          <span class="tabs__label">{app.nav.addShort}</span>
        </a>
        {TABS.slice(2).map((item) => (
          <TabLink item={item} place={place} n={item.place === 'messages' ? unread : 0} />
        ))}
      </nav>
      {intake ? <Pick /> : null}
      {mony ? <MonyBubble audience={mony} /> : null}
    </body>
  </html>
  )
}

/** On a phone the column on the left is gone: the bar's menu holds who is signed in, the switch and signing out. */
export const BarMenu: FC<{ label: string; user: { name: string; email: string }; children?: Child }> = ({ label, user, children }) => (
  <details class="barmenu">
    <summary class="barmenu__summary">
      <span class="barmenu__name">{label}</span>
    </summary>
    <div class="barmenu__panel">
      {children}
      <p class="barmenu__who">
        <span class="barmenu__user">{user.name}</span>
        <span class="barmenu__email">{user.email}</span>
      </p>
      <a class="barmenu__item" href="/auth">Zabezpečenie prístupu</a>
      <form method="post" action="/app/odhlasit">
        <button class="barmenu__item barmenu__item--out" type="submit">
          {app.nav.signOut}
        </button>
      </form>
    </div>
  </details>
)

const TabLink: FC<{ item: (typeof NAV)[number]; place: Place | null; n: number }> = ({ item, place, n }) => (
  <a class="tabs__link" href={item.href} aria-current={place === item.place ? 'page' : undefined}>
    <span class="tabs__icon">
      <Picture art={item.art} className="tabs__img" sizes="28px" />
      {n > 0 ? <span class={`tabs__dot${item.place === 'messages' ? ' tabs__dot--blue' : ''}`}>{n}</span> : null}
    </span>
    <span class="tabs__label">{item.label}</span>
  </a>
)

const PLAN_NAMES: Record<string, string> = { start: 'Štart', rast: 'Rast', firma: 'Firma' }
export const planName = (id: string) => PLAN_NAMES[id] ?? id

// ---------------------------------------------------------------------------------------------------------------
// Signing in
// ---------------------------------------------------------------------------------------------------------------

/** A page of its own for signing in: the wordmark, one card, and the way back to the site. */
export const Door: FC<{ title: string; children: Child; security?: boolean; foot?: boolean }> = ({ title, children, security = false, foot = true }) => (
  <html lang="sk">
    <InsideHead title={`${title} | ${BRAND.name}`} security={security} />
    <body class="inside inside--door">
      <main id="obsah" class="door">
        <div class="door__brand">
          <Wordmark href="/" />
        </div>
        <div class="door__card">{children}</div>
        {/* Somebody already signed in (the offer to save the sign-in) or on the way in by a link is a client already. */}
        {foot ? (
          <p class="door__foot">
            {app.login.notClient}{' '}
            <a class="link" href="/zacat">
              {app.login.start}
            </a>
          </p>
        ) : null}
      </main>
    </body>
  </html>
)

export const LoginForm: FC<{ value?: string; error?: string; next?: string }> = ({ value = '', error, next }) => (
  <>
    <Tile art={ART.key} size="lg" eager />
    <Heading first={app.login.title} second={app.login.serif} small />
    <p class="door__lead">{app.login.lead}</p>
    {/* One touch, no email: the browser offers the passkeys it keeps for Firmony. Hidden where the browser has none. */}
    <form class="door__form door__key" method="post" action="/app/prihlasenie" data-passkey="signin" data-hide-unsupported="1">
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <p class="field__error" data-auth-error tabindex={-1} hidden></p>
      <button class="btn btn--blue btn--large door__button" type="submit" disabled>
        {app.login.keyButton}
      </button>
      <p class="door__or">{app.login.or}</p>
    </form>
    <form class="door__form" method="post" action="/app/prihlasenie" novalidate>
      <p class="door__note">{app.login.emailLead}</p>
      {next ? <input type="hidden" name="n" value={next} /> : null}
      <label class="field__label" for="email">
        {app.login.email}
      </label>
      <input
        id="email"
        class="field__input"
        type="email"
        name="email"
        value={value}
        autocomplete="username webauthn"
        inputmode="email"
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={error ? 'email-error' : undefined}
        autofocus
      />
      {error ? (
        <p id="email-error" class="field__error">
          {error}
        </p>
      ) : null}
      <button class="btn btn--line btn--large door__button" type="submit">
        {app.login.button}
      </button>
    </form>
  </>
)

/** Right after a sign-in by email: save a passkey on this device, and sign in with one touch from now on. */
export const QuickSignin: FC<{ next: string }> = ({ next }) => (
  <>
    <Tile art={ART.key} size="lg" eager />
    <Heading first={app.login.quickTitle} second={app.login.quickSerif} small />
    <p class="door__lead">{app.login.quickLead}</p>
    <form class="door__form" method="post" action="/auth" data-passkey="register">
      <input type="hidden" name="next" value={next} />
      <input type="hidden" name="name" value={app.login.quickKeyName} />
      <p class="field__error" data-auth-error tabindex={-1} hidden></p>
      <button class="btn btn--blue btn--large door__button" type="submit" disabled>
        {app.login.quickButton}
      </button>
    </form>
    <p class="door__note">{app.login.quickNote}</p>
    <a class="btn btn--line door__button" href={next}>
      {app.login.quickLater}
    </a>
  </>
)

export const LinkSent: FC = () => (
  <>
    <Tile art={ART.envelope} size="lg" eager />
    <Heading first={app.login.sentTitle} second={app.login.sentSerif} small />
    <p class="door__lead">{app.login.sentLead}</p>
    <p class="door__note">{app.login.sentAgain}</p>
    <a class="btn btn--line door__button" href="/app/prihlasenie">
      {app.login.sentButton}
    </a>
  </>
)

/** The values the first administrator puts into the Worker's settings, with a code made just now and kept nowhere. */
export const FirstAdmin: FC<{ code: string; expires: number; until: string }> = ({ code, expires, until }) => (
  <>
    <Tile art={ART.key} size="lg" eager />
    <Heading first={app.firstAdmin.title} second={app.firstAdmin.serif} small />
    <p class="door__lead">{app.firstAdmin.lead}</p>
    <ol class="door__steps">
      {app.firstAdmin.steps.map((step) => (
        <li>{step}</li>
      ))}
    </ol>
    <dl class="kv door__values">
      <div>
        <dt>TEAM_BOOTSTRAP_EMAIL</dt>
        <dd>{app.firstAdmin.email}</dd>
      </div>
      <div>
        <dt>TEAM_BOOTSTRAP_TOKEN</dt>
        <dd class="kv__long">
          <code>{code}</code>
        </dd>
      </div>
      <div>
        <dt>TEAM_BOOTSTRAP_EXPIRES_AT</dt>
        <dd class="kv__long">
          <code>{String(expires)}</code> ({app.firstAdmin.until(until)})
        </dd>
      </div>
    </dl>
    <a class="btn btn--line door__button" href="/app/prvy-spravca">
      {app.firstAdmin.again}
    </a>
  </>
)

export const Enter: FC<{ token: string; next?: string }> = ({ token, next }) => (
  <>
    <Tile art={ART.key} size="lg" eager />
    <Heading first={app.login.enterTitle} second={app.login.enterSerif} small />
    <p class="door__lead">{app.login.enterLead}</p>
    <form class="door__form" method="post" action="/app/vstup">
      <input type="hidden" name="t" value={token} />
      {next ? <input type="hidden" name="n" value={next} /> : null}
      <button class="btn btn--blue btn--large door__button" type="submit">
        {app.login.enterButton}
      </button>
    </form>
  </>
)

/** A client confirms a sensitive step (the whole archive) by a new link from the email: no key, no password. */
export const ConfirmByLink: FC<{ email: string; next: string; sent: boolean }> = ({ email, next, sent }) => (
  <section class="nothing">
    <Tile art={sent ? ART.envelope : ART.key} size="lg" />
    <p class="nothing__title">{sent ? app.confirm.sentTitle : app.confirm.title}</p>
    <p class="nothing__lead">{sent ? app.confirm.sentLead(email) : app.confirm.lead(email)}</p>
    <form method="post" action="/app/potvrdit">
      <input type="hidden" name="next" value={next} />
      <button class={`btn ${sent ? 'btn--line' : 'btn--blue'}`} type="submit">
        {sent ? app.confirm.again : app.confirm.button}
      </button>
    </form>
  </section>
)

export const Expired: FC<{ noCompany?: boolean }> = ({ noCompany }) => (
  <>
    <Tile art={ART.paperReturn} size="lg" eager />
    <Heading first={app.login.expiredTitle} second={noCompany ? undefined : app.login.expiredSerif} small />
    <p class="door__lead">{noCompany ? app.login.noCompany : app.login.expiredLead}</p>
    <a class="btn btn--blue btn--large door__button" href="/app/prihlasenie">
      {app.login.sentButton}
    </a>
  </>
)
