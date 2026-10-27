// Používatelia (/ucto/pouzivatelia): everybody Firmony knows, for the administrator (team/people.ts). A list to search
// and filter, a page of everything about one person, and the list for Excel after a fresh passkey.
import type { FC } from 'hono/jsx'
import { typeset } from '../format'
import { team as t } from '../team/copy'
import { KIND_NAMES, KIND_SLUGS, PERSON_KINDS, STATE_NAMES, brokerName, planName, type Person, type PersonDetail, type PersonKind } from '../team/people'
import { Heading } from './inside'
import { dayOf, whenName } from './inside-pages'

const n = (value: number) => value.toLocaleString('sk-SK')
const KIND_TONE: Record<PersonKind, string> = { client: 'pill--ok', invoicing: 'pill--blue', lead: 'pill--amber', investor: 'pill--mist', team: 'pill--grey' }
const STATE_TONE: Record<string, string> = { client: 'pill--ok', ending: 'pill--amber', ended: 'pill--grey', invoicing: 'pill--blue', none: 'pill--grey' }
const SITUATIONS = t.requests.situation as Record<string, string>
const STATUSES = t.requests.status as Record<string, string>
const ROLES: Record<string, string> = { owner: 'majiteľ', member: 'člen' }
const WAYS: Record<string, string> = { sam: 'sám', 'za-mna': 'za neho' }

const Kinds: FC<{ kinds: PersonKind[] }> = ({ kinds }) => (
  <span class="people__kinds">
    {kinds.map((k) => (
      <span class={`pill ${KIND_TONE[k]}`}>{KIND_NAMES[k]}</span>
    ))}
  </span>
)

const when = (seconds: number | null, now: number) => (seconds === null ? 'zatiaľ nie' : whenName(seconds, now))

export interface UsersPageProps {
  people: Person[]
  shown: Person[]
  kind: PersonKind | null
  query: string
  now: number
}

/** At most this many rows on the page; the rest is found by a search or downloaded. */
export const PEOPLE_SHOWN = 300

export const UsersPage: FC<UsersPageProps> = ({ people, shown, kind, query, now }) => {
  const count = (k: PersonKind) => people.filter((p) => p.kinds.includes(k)).length
  const week = now - 7 * 86400
  const href = (k: PersonKind | null) => {
    const q = new URLSearchParams()
    if (k) q.set('kto', KIND_SLUGS[k])
    if (query) q.set('hladat', query)
    const s = q.toString()
    return `/ucto/pouzivatelia${s ? `?${s}` : ''}`
  }
  const csv = `/ucto/pouzivatelia.csv${kind || query ? `?${new URLSearchParams({ ...(kind ? { kto: KIND_SLUGS[kind] } : {}), ...(query ? { hladat: query } : {}) }).toString()}` : ''}`
  return (
    <div class="people">
      <header class="phead">
        <Heading first="Používatelia" second="Všetci, ktorých poznáme." />
        <p class="phead__lead">
          {typeset(
            'Klienti, fakturácia zadarmo, záujemcovia z webu, investori aj tím na jednom mieste, s e-mailom, telefónom, firmou a poslednou aktivitou. Rodné čísla a doklady sú len v identifikácii klienta.',
          )}
        </p>
      </header>

      <dl class="figs__grid figs__grid--four people__figs">
        <div class="fig">
          <dt>Spolu</dt>
          <dd class="fig__value">{n(people.length)}</dd>
        </div>
        <div class="fig">
          <dt>Noví za 7 dní</dt>
          <dd class="fig__value">{n(people.filter((p) => p.createdAt >= week).length)}</dd>
        </div>
        <div class="fig">
          <dt>Aktívni za 7 dní</dt>
          <dd class="fig__value">{n(people.filter((p) => (p.lastActive ?? 0) >= week).length)}</dd>
        </div>
        <div class="fig">
          <dt>S prihlasovacím kľúčom</dt>
          <dd class="fig__value">{n(people.filter((p) => p.passkeys > 0).length)}</dd>
        </div>
      </dl>

      <nav class="filters people__filters" aria-label="Kto">
        <a class="filters__item" href={href(null)} aria-current={kind === null ? 'page' : undefined}>
          {`Všetci ${n(people.length)}`}
        </a>
        {PERSON_KINDS.map((k) => (
          <a class="filters__item" href={href(k)} aria-current={kind === k ? 'page' : undefined}>
            {`${KIND_NAMES[k]} ${n(count(k))}`}
          </a>
        ))}
      </nav>

      <div class="people__tools">
        <form class="search" method="get" action="/ucto/pouzivatelia" role="search">
          {kind ? <input type="hidden" name="kto" value={KIND_SLUGS[kind]} /> : null}
          <label class="sr" for="hladat">
            Hľadať
          </label>
          <input id="hladat" class="search__input" type="search" name="hladat" value={query} maxlength={80} placeholder="Meno, e-mail, telefón, firma alebo IČO" autocomplete="off" />
          <button class="btn btn--line btn--small search__button" type="submit">
            Hľadať
          </button>
          {query ? (
            <a class="search__clear" href={href(kind)}>
              Zrušiť
            </a>
          ) : null}
        </form>
        <p class="people__export">
          <a class="link" href={csv}>
            Stiahnuť pre Excel
          </a>
          <span class="small">{typeset('Potvrdíte prihlasovacím kľúčom.')}</span>
        </p>
      </div>

      {shown.length === 0 ? (
        <p class="info__empty">{query ? 'Nikoho sme nenašli.' : 'Zatiaľ tu nikto nie je.'}</p>
      ) : (
        <div class="lscroll">
          <table class="ltable people__table">
            <thead>
              <tr>
                <th scope="col">Meno a e-mail</th>
                <th scope="col">Telefón</th>
                <th scope="col">Kto je</th>
                <th scope="col">Firma</th>
                <th scope="col">Prvý kontakt</th>
                <th scope="col">Posledná aktivita</th>
              </tr>
            </thead>
            <tbody>
              {shown.slice(0, PEOPLE_SHOWN).map((p) => {
                const first = p.companies[0]
                const asked = p.requests[0]
                return (
                  <tr>
                    <td class="people__who">
                      <a class="link people__name" href={`/ucto/pouzivatelia/${p.key}`}>
                        {p.name ?? p.email}
                      </a>
                      <a class="people__mail" href={`mailto:${p.email}`}>
                        {p.email}
                      </a>
                    </td>
                    <td class="people__phone">{p.phone ? <a href={`tel:${p.phone.replace(/\s+/g, '')}`}>{p.phone}</a> : ''}</td>
                    <td>
                      <Kinds kinds={p.kinds} />
                    </td>
                    <td class="people__company">
                      {first ? (
                        <>
                          <span class="people__cname">{first.name}</span>
                          <span class="small">
                            {[first.ico ? `IČO ${first.ico}` : '', first.state === 'invoicing' ? '' : planName(first.plan), STATE_NAMES[first.state]].filter(Boolean).join(' · ')}
                            {p.companies.length > 1 ? ` · a ďalšie ${p.companies.length - 1}` : ''}
                          </span>
                        </>
                      ) : asked ? (
                        <>
                          <span class="people__cname">{asked.company ?? 'Bez firmy'}</span>
                          <span class="small">{[asked.ico ? `IČO ${asked.ico}` : '', SITUATIONS[asked.situation] ?? asked.situation].filter(Boolean).join(' · ')}</span>
                        </>
                      ) : p.investor ? (
                        <span class="small">{p.investor.brokers.map(brokerName).join(', ') || 'Investor'}</span>
                      ) : null}
                    </td>
                    <td class="people__when">{dayOf(p.createdAt).split('-').reverse().join('. ')}</td>
                    <td class="people__when">{when(p.lastActive, now)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {shown.length > PEOPLE_SHOWN ? (
        <p class="small">{typeset(`Zobrazených ${n(PEOPLE_SHOWN)} z ${n(shown.length)}. Ostatných nájdete hľadaním alebo v súbore pre Excel.`)}</p>
      ) : null}
    </div>
  )
}

const Fact: FC<{ label: string; value: unknown }> = ({ label, value }) => (
  <div>
    <dt>{label}</dt>
    <dd>{(value as never) ?? 'neuvedené'}</dd>
  </div>
)

export const UserPage: FC<{ person: Person; detail: PersonDetail | null; now: number }> = ({ person: p, detail, now }) => (
  <div class="people">
    <p class="back">
      <a class="link" href="/ucto/pouzivatelia">
        Všetci používatelia
      </a>
    </p>
    <header class="phead">
      <Heading first={p.name ?? p.email} />
      <p class="phead__lead">
        <Kinds kinds={p.kinds} />
      </p>
    </header>

    <div class="people__cards">
      <section class="info">
        <h2 class="info__title">Kontakt</h2>
        <dl class="kv">
          <Fact
            label="E-mail"
            value={
              <a class="link" href={`mailto:${p.email}`}>
                {p.email}
              </a>
            }
          />
          <Fact label="Telefón" value={p.phone ? <a class="link" href={`tel:${p.phone.replace(/\s+/g, '')}`}>{p.phone}</a> : null} />
          <Fact label="Prvý kontakt" value={when(p.createdAt, now)} />
          <Fact label="Posledná aktivita" value={when(p.lastActive, now)} />
          {p.userId ? (
            <>
              <Fact label="Posledné prihlásenie" value={when(p.lastSignIn, now)} />
              <Fact label="Prihlasovacie kľúče" value={String(p.passkeys)} />
              <Fact label="Pripomienky e-mailom" value={p.reminders ? 'zapnuté' : 'vypnuté'} />
            </>
          ) : (
            <Fact label="Účet v aplikácii" value="nemá" />
          )}
          {p.team ? <Fact label="V tíme" value={t.nav.role[p.team as keyof typeof t.nav.role] ?? p.team} /> : null}
        </dl>
        {detail && detail.passkeys.length > 0 ? (
          <ul class="plain people__keys">
            {detail.passkeys.map((k) => (
              <li class="plain__row plain__row--two">
                <span class="plain__name">{k.name}</span>
                <span class="plain__sub">{typeset(`pridaný ${when(k.createdAt, now)}, naposledy ${when(k.lastUsedAt, now)}`)}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      {p.companies.length > 0 ? (
        <section class="info">
          <h2 class="info__title">Firmy</h2>
          <div class="lscroll">
            <table class="ltable">
              <thead>
                <tr>
                  <th scope="col">Firma</th>
                  <th scope="col">IČO</th>
                  <th scope="col">Rola</th>
                  <th scope="col">Balík</th>
                  <th scope="col">Stav</th>
                  <th scope="col">Od</th>
                  <th scope="col">Účtovníčka</th>
                </tr>
              </thead>
              <tbody>
                {p.companies.map((c) => (
                  <tr>
                    <td>
                      {c.state === 'invoicing' ? (
                        c.name
                      ) : (
                        <a class="link" href={`/ucto/klienti/${c.id}`}>
                          {c.name}
                        </a>
                      )}
                      {c.demo ? <span class="small"> (ukážka)</span> : null}
                    </td>
                    <td>{c.ico ?? ''}</td>
                    <td>{ROLES[c.role] ?? c.role}</td>
                    <td>{c.state === 'invoicing' ? '' : planName(c.plan)}</td>
                    <td>
                      <span class={`pill ${STATE_TONE[c.state] ?? 'pill--grey'}`}>{c.state === 'ending' && c.endsOn ? `Končí ${c.endsOn.split('-').reverse().join('. ')}` : STATE_NAMES[c.state]}</span>
                    </td>
                    <td>{c.since ? c.since.split('-').reverse().join('. ') : ''}</td>
                    <td>{c.accountant ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {p.requests.length > 0 ? (
        <section class="info">
          <h2 class="info__title">Žiadosti z webu</h2>
          <div class="lscroll">
            <table class="ltable">
              <thead>
                <tr>
                  <th scope="col">Kedy</th>
                  <th scope="col">Firma</th>
                  <th scope="col">Balík</th>
                  <th scope="col">Situácia</th>
                  <th scope="col">Stav</th>
                  <th scope="col">Zdroj</th>
                </tr>
              </thead>
              <tbody>
                {p.requests.map((r) => (
                  <tr>
                    <td>{when(r.createdAt, now)}</td>
                    <td>{[r.company ?? 'Bez firmy', r.ico ? `IČO ${r.ico}` : ''].filter(Boolean).join(', ')}</td>
                    <td>{planName(r.plan)}</td>
                    <td>{SITUATIONS[r.situation] ?? r.situation}</td>
                    <td>{STATUSES[r.status] ?? r.status}</td>
                    <td>{r.source ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {p.requests
            .filter((r) => r.note)
            .map((r) => (
              <p class="info__lead">{typeset(`Poznámka (${when(r.createdAt, now)}): ${r.note}`)}</p>
            ))}
          <p>
            <a class="link" href="/ucto/ziadosti">
              Otvoriť žiadosti z webu
            </a>
          </p>
        </section>
      ) : null}

      {p.investor ? (
        <section class="info">
          <h2 class="info__title">Investor</h2>
          <dl class="kv">
            <Fact label="Brokeri" value={p.investor.brokers.map(brokerName).join(', ') || null} />
            <Fact label="Ako to chce" value={p.investor.way ? (WAYS[p.investor.way] ?? p.investor.way) : null} />
            <Fact label="Zapísaný" value={when(p.investor.createdAt, now)} />
            <Fact label="Zdroj" value={p.investor.source} />
          </dl>
        </section>
      ) : null}

      {detail ? (
        <section class="info">
          <h2 class="info__title">Posledné aktivity</h2>
          {detail.events.length === 0 ? (
            <p class="info__empty">Zatiaľ nič.</p>
          ) : (
            <ul class="plain">
              {detail.events.map((e) => (
                <li class="plain__row plain__row--two">
                  <span class="plain__name">{e.action}</span>
                  <span class="plain__sub">{[when(e.at, now), e.company].filter(Boolean).join(' · ')}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </div>
  </div>
)
