import type { Child, FC } from 'hono/jsx'
import { BRAND } from '../config'
import type { User } from '../app/store'
import type { Grant, Passkey } from '../security/store'
import { Heading, InsideHead } from './inside'
import { Wordmark } from './layout'

const Frame: FC<{ title: string; children: Child }> = ({ title, children }) => (
  <html lang="sk">
    <InsideHead title={`${title} | ${BRAND.name}`} security />
    <body class="inside inside--door">
      <main id="obsah" class="door security">
        <div class="door__brand">
          <Wordmark href="/" />
        </div>
        <section class="door__card">{children}</section>
      </main>
    </body>
  </html>
)
export const SecurityPage: FC<{
  user: User
  keys: Passkey[]
  next: string
  verified: boolean
  error?: string
}> = ({ user, keys, next, verified, error }) => (
  <Frame title="Bezpečný prístup">
    <Heading first={verified ? 'Váš prístup' : 'Potvrďte prístup'} second="prihlasovacím kľúčom" small />
    <p class="door__lead">{user.name}, kľúč potvrdíte PIN-om, odtlačkom alebo zámkom zariadenia. Firmony tieto údaje nedostáva.</p>
    {error ? (
      <p class="notice notice--error" role="alert">
        {error}
      </p>
    ) : null}
    <p class="notice" data-auth-error role="alert" hidden />
    {keys.length ? (
      <form class="door__form" data-passkey="authenticate" method="post" action="/auth/options">
        <input type="hidden" name="next" value={next} />
        <button class="btn btn--blue btn--large" type="submit" disabled>
          Potvrdiť prístup kľúčom
        </button>
      </form>
    ) : (
      <p class="notice">
        {user.team
          ? 'Prvý kľúč aktivujete kódom od správcu. Kód Vám odovzdá overeným spôsobom mimo prihlasovacieho e-mailu.'
          : 'Pre bezpečné stiahnutie celého účtovníctva si nastavte kľúč. Prvé nastavenie vyžaduje čerstvé prihlásenie e-mailom.'}
      </p>
    )}
    <details class="security__setup" open={!keys.length}>
      <summary>{keys.length ? 'Pridať záložný kľúč alebo obnoviť prístup' : 'Nastaviť prihlasovací kľúč'}</summary>
      <form class="door__form" data-passkey="register" method="post" action="/auth/options">
        <input type="hidden" name="next" value={next} />
        <div class="field">
          <label class="field__label" for="key-name">
            Názov kľúča
          </label>
          <input id="key-name" class="field__input" name="name" maxlength={80} placeholder="Napríklad pracovný notebook" />
        </div>
        {user.team || keys.length ? (
          <div class="field">
            <label class="field__label" for="key-code">
              Aktivačný kód alebo kód schválenej obnovy
            </label>
            <input id="key-code" class="field__input" name="code" type="password" autocomplete="off" maxlength={80} aria-describedby="key-code-hint" />
            <p class="small" id="key-code-hint">
              Pri pridaní záložného kľúča po čerstvom overení kód nepotrebujete. Stratený kľúč nemožno obísť novým e-mailovým odkazom.
            </p>
          </div>
        ) : null}
        <button class="btn btn--line" type="submit" disabled>
          Nastaviť kľúč
        </button>
      </form>
    </details>
    {keys.length ? (
      <section class="security__keys" aria-label="Vaše prihlasovacie kľúče">
        <h2 class="h3">Vaše kľúče</h2>
        <ul>
          {keys.map((k) => (
            <li>
              <span>{k.name}</span>
              {verified ? (
                <form method="post" action={`/auth/keys/${encodeURIComponent(k.id)}/remove`}>
                  <button class="btn btn--text btn--small" type="submit">
                    Odobrať
                  </button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
        <p class="small">
          Nastavte si aj záložný kľúč, ktorý zostane dostupný pri strate hlavného zariadenia. Aktuálne použitý ani posledný kľúč neodstránime.
        </p>
      </section>
    ) : null}
    {verified ? (
      <p>
        <a class="link" href={next}>
          Pokračovať
        </a>
      </p>
    ) : null}
    {verified && user.team === 'admin' ? (
      <p>
        <a class="link" href="/auth/grants">
          Aktivácie a obnova prístupov
        </a>
      </p>
    ) : null}
    <noscript>
      <p class="notice notice--error">
        Prihlasovací kľúč potrebuje JavaScript a podporovaný prehliadač. Použite aktuálny prehliadač s podporou prihlasovacích kľúčov.
      </p>
    </noscript>
    <form method="post" action="/app/odhlasit">
      <button class="btn btn--text" type="submit">
        Odhlásiť sa
      </button>
    </form>
  </Frame>
)

export const GrantsPage: FC<{
  grants: (Grant & { email: string; creator_name?: string | null; approver_name?: string | null })[]
  actor?: string
  issued?: { token: string; email: string; recovery: boolean }
}> = ({ grants, issued, actor }) => (
  <Frame title="Aktivácie a obnova">
    <Heading first="Aktivácie" second="a obnova prístupov" small />
    {issued ? (
      <section class="notice">
        <p>Kód pre {issued.email} zobrazujeme iba teraz. Odovzdajte ho po overení identity mimo prihlasovacieho e-mailu.</p>
        <code class="security__code">{issued.token}</code>
        {issued.recovery ? <p>Obnovu musí pred použitím schváliť druhý správca, ktorý nie je príjemcom kódu.</p> : null}
      </section>
    ) : null}
    <form class="door__form" method="post" action="/auth/grants">
      <div class="field">
        <label class="field__label" for="grant-email">
          E-mail existujúceho účtu
        </label>
        <input class="field__input" id="grant-email" name="email" type="email" required />
      </div>
      <div class="field">
        <label class="field__label" for="grant-kind">
          Účel
        </label>
        <select class="field__input" id="grant-kind" name="kind">
          <option value="enroll">Prvý kľúč nového člena tímu</option>
          <option value="recover">Obnova stratených kľúčov</option>
        </select>
      </div>
      <div class="field">
        <label class="field__label" for="grant-evidence">
          Referencia overenia identity a oprávnenia
        </label>
        <input class="field__input" id="grant-evidence" name="evidence" minlength={12} maxlength={240} required />
      </div>
      <button class="btn btn--blue" type="submit">
        Vytvoriť jednorazový kód
      </button>
    </form>
    <section class="security__keys">
      <h2 class="h3">Čakajúce aktivácie</h2>
      <ul>
        {grants.map((g) => (
          <li class="security__grant">
            <strong>{g.email}</strong>
            <p>{g.kind === 'recover' ? (g.approved_by ? 'Obnova schválená druhým správcom' : 'Obnova čaká na druhého správcu') : 'Prvá aktivácia'}</p>
            <p class="small">
              Žiadateľ: {g.creator_name ?? 'Neaktívny účet'} · Platnosť do{' '}
              {new Date(g.expires_at * 1000).toLocaleString('sk-SK', { timeZone: 'Europe/Bratislava' })}
            </p>
            <p class="small">Referencia overenia: {g.evidence}</p>
            {g.approved_by ? (
              <p class="small">
                Schválil: {g.approver_name ?? 'Neaktívny účet'} · {g.approval_evidence}
              </p>
            ) : null}
            {g.kind === 'recover' && !g.approved_by && g.created_by !== actor && g.user_id !== actor ? (
              <form class="door__form" method="post" action={`/auth/grants/${g.id}/approve`}>
                <div class="field">
                  <label class="field__label" for={`approval-${g.id}`}>
                    Referencia Vášho nezávislého overenia
                  </label>
                  <input class="field__input" id={`approval-${g.id}`} name="reference" minlength={12} maxlength={240} required />
                </div>
                <button class="btn btn--line" type="submit">
                  Schváliť overenú obnovu
                </button>
              </form>
            ) : null}
            <form method="post" action={`/auth/grants/${g.id}/revoke`}>
              <button class="btn btn--text" type="submit">
                Zrušiť kód
              </button>
            </form>
          </li>
        ))}
      </ul>
    </section>
    <a class="link" href="/auth">
      Späť na zabezpečenie
    </a>
  </Frame>
)
