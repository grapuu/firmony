import type { FC } from 'hono/jsx'
import type { Incident } from '../incidents/store'
import { Heading } from './inside'
const labels: Record<string, string> = {
  'incident.opened': 'Prípad založený',
  'incident.assigned': 'Zodpovedné osoby aktualizované',
  'hold.created': 'Uchovanie zabezpečené',
  'hold.reviewed': 'Uchovanie opätovne posúdené',
  'hold.release_requested': 'Žiadosť o uvoľnenie',
  'hold.released': 'Uvoľnenie schválené druhým správcom',
  'incident.closed': 'Prípad uzavretý',
}
function eventText(detail: string): string {
  try {
    const d = JSON.parse(detail)
    return [d.evidence, d.reviewRef, d.releaseRef, d.reference, d.reviewOn ? `Ďalšia kontrola: ${d.reviewOn}` : '']
      .filter((v) => typeof v === 'string' && v.length)
      .join(' · ')
  } catch {
    return ''
  }
}
const state = (i: Incident) =>
  i.closed_at
    ? 'Uzavretý'
    : i.released_at
      ? 'Čaká na uzavretie prípadu'
      : i.preservation === 'too_late'
        ? 'Mazanie už začalo – preveriť obnovu'
        : i.preservation === 'records_only'
          ? 'Uchované zostávajúce zmluvné záznamy'
          : 'Uchovanie aktívne'
export const IncidentsPage: FC<{
  incidents: Incident[]
  companies: { id: string; name: string }[]
  people: { id: string; name: string }[]
  user: string
  today: string
  error?: string
}> = ({ incidents, companies, people, user, today, error }) => (
  <>
    <header class="phead incident-head">
      <Heading first="Incidenty" second="a uchovanie dôkazov" />
      <p class="phead__lead">Každý prípad má vlastníka, referenciu podkladov a ďalšiu kontrolu. Založenie prípadu neznamená uznanie nároku.</p>
    </header>
    {error ? (
      <p class="notice notice--error" role="alert">
        {error}
      </p>
    ) : null}
    <details class="info incident-new">
      <summary>Nahlásiť prípad a zabezpečiť uchovanie</summary>
      <form class="details" method="post" action="/ucto/incidenty">
        <div class="field">
          <label class="field__label" for="incident-company">
            Firma
          </label>
          <select class="field__input" id="incident-company" name="company" required>
            <option value="">Vyberte firmu</option>
            {companies.map((c) => (
              <option value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div class="field">
          <label class="field__label" for="incident-title">
            Stručný opis
          </label>
          <input class="field__input" id="incident-title" name="title" minlength={8} maxlength={240} required />
        </div>
        <div class="field">
          <label class="field__label" for="incident-evidence">
            Referencia na podklady
          </label>
          <input class="field__input" id="incident-evidence" name="evidence" minlength={12} maxlength={240} required />
          <p class="small">Interné číslo alebo chránený odkaz. Osobné údaje a obsah rozhodnutia sem nevkladajte.</p>
        </div>
        <div class="field">
          <label class="field__label" for="incident-severity">
            Naliehavosť
          </label>
          <select class="field__input" id="incident-severity" name="severity">
            <option value="normal">Bežné preverenie</option>
            <option value="high">Vysoká</option>
            <option value="critical">Kritická – okamžité riešenie</option>
          </select>
        </div>
        <div class="field">
          <label class="field__label" for="incident-owner">
            Vlastník prípadu
          </label>
          <select class="field__input" id="incident-owner" name="owner">
            {people.map((p) => (
              <option value={p.id} selected={p.id === user}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div class="field">
          <label class="field__label" for="incident-backup">
            Zástupca
          </label>
          <select class="field__input" id="incident-backup" name="backup">
            <option value="">Zatiaľ nepridelený – treba doplniť</option>
            {people.map((p) => (
              <option value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <div class="field">
          <label class="field__label" for="incident-review">
            Ďalšia kontrola
          </label>
          <input class="field__input" id="incident-review" name="review" type="date" min={today} required />
        </div>
        <p class="small">
          Ak už začala deštruktívna fáza mazania, zaznamenáme ohrozenie a zastavíme ďalšie kroky, ktoré ešte možno zastaviť. Uchovanie už zmazaných súborov tým
          nepotvrdzujeme.
        </p>
        <button class="btn btn--blue" type="submit">
          Založiť prípad
        </button>
      </form>
    </details>
    <div class="incident-list">
      {incidents.map((i) => (
        <section class="info incident-card">
          <div>
            <a class="link" href={`/ucto/incidenty/${i.id}`}>
              <strong>
                {i.company_name}: {i.title}
              </strong>
            </a>
            <p class="info__source">{state(i)}</p>
          </div>
          <p class={`pill ${i.closed_at ? 'pill--grey' : i.preservation === 'too_late' ? 'pill--red' : 'pill--amber'}`}>
            {i.closed_at ? 'Uzavreté' : (i.hold_review_on ?? i.review_on) < today ? 'Kontrola po termíne' : `Kontrola ${i.hold_review_on ?? i.review_on}`}
          </p>
          {!i.backup_id && !i.closed_at ? <p class="notice">Chýba zástupca prípadu.</p> : null}
        </section>
      ))}
    </div>
    {!incidents.length ? <p class="notice">Zatiaľ neevidujeme žiadny prípad.</p> : null}
  </>
)
export const IncidentPage: FC<{
  incident: Incident
  admin: boolean
  events: {
    action: string
    at: number
    user_id: string
    user_name: string
    detail: string
  }[]
  people: { id: string; name: string }[]
  error?: string
}> = ({ incident: i, admin, events, people, error }) => (
  <>
    <a class="back" href="/ucto/incidenty">
      Incidenty
    </a>
    <header class="phead incident-head">
      <Heading first={i.company_name} second={i.title} />
      <p class="phead__lead">{state(i)}</p>
    </header>
    {error ? (
      <p class="notice notice--error" role="alert">
        {error}
      </p>
    ) : null}
    <section class="info">
      <dl class="kv incident-facts">
        <div>
          <dt>Referencia podkladov</dt>
          <dd class="kv__long">{i.evidence}</dd>
        </div>
        <div>
          <dt>Vlastník</dt>
          <dd class="kv__long">{i.owner_name ?? 'Účet už nie je aktívny'}</dd>
        </div>
        <div>
          <dt>Zástupca</dt>
          <dd class="kv__long">{i.backup_name ?? 'Nepridelený'}</dd>
        </div>
      </dl>
      {i.closed_at ? (
        <p class="notice">Prípad bol uzavretý po zdokumentovanom posúdení. Uplatní sa príslušný retenčný postup.</p>
      ) : i.released_at ? (
        <p class="notice">Osobitné uchovanie bolo uvoľnené. Otvorený prípad naďalej blokuje výmaz až do riadneho uzavretia.</p>
      ) : i.preservation === 'too_late' ? (
        <p class="notice notice--error">
          Súbory už môžu byť čiastočne zmazané. Preverte obnovu a rozsah straty. Otvorený prípad blokuje ďalšie mazanie; už prebiehajúca požiadavka na úložisko
          sa nemusí dať zastaviť.
        </p>
      ) : i.preservation === 'records_only' ? (
        <p class="notice">Bežné účtovné dáta už boli odstránené. Uchovávame záznamy, ktoré ešte zostávajú; nejde o obnovenie celej agendy.</p>
      ) : (
        <p class="notice">Otvorený prípad a aktívne uchovanie blokujú automatický výmaz. Kontrolný dátum sám ochranu neruší.</p>
      )}
    </section>
    {admin && !i.closed_at ? (
      <section class="info">
        <h2 class="h3">Zodpovedné osoby</h2>
        <form class="details" method="post" action={`/ucto/incidenty/${i.id}/priradit`}>
          <input type="hidden" name="version" value={i.version} />
          <div class="field">
            <label class="field__label" for="case-owner">
              Vlastník
            </label>
            <select class="field__input" id="case-owner" name="owner">
              {people.map((p) => (
                <option value={p.id} selected={p.id === i.owner_id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div class="field">
            <label class="field__label" for="case-backup">
              Zástupca
            </label>
            <select class="field__input" id="case-backup" name="backup">
              <option value="">Nepridelený</option>
              {people.map((p) => (
                <option value={p.id} selected={p.id === i.backup_id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <button class="btn btn--line" type="submit">
            Uložiť pridelenie
          </button>
        </form>
      </section>
    ) : null}
    {i.hold_id && !i.released_at ? (
      <section class="info">
        <h2 class="h3">Kontrola uchovania</h2>
        <form class="details" method="post" action={`/ucto/incidenty/${i.id}/kontrola`}>
          <div class="field">
            <label class="field__label" for="hold-review">
              Ďalšia kontrola
            </label>
            <input class="field__input" id="hold-review" name="review" type="date" required />
          </div>
          <div class="field">
            <label class="field__label" for="hold-reference">
              Referencia odborného posúdenia
            </label>
            <input class="field__input" id="hold-reference" name="reference" minlength={12} maxlength={240} required />
          </div>
          <button class="btn btn--line" type="submit">
            Potvrdiť ďalšie uchovanie
          </button>
        </form>
      </section>
    ) : null}
    {admin && i.hold_id && !i.released_at ? (
      <section class="info">
        <h2 class="h3">Uvoľnenie ochrany</h2>
        <p>Vyžaduje zdokumentované posúdenie a dvoch rôznych správcov. Zohľadnite všetky nároky, lehoty a dôvody uchovania.</p>
        {i.release_requested_by ? (
          <>
            <p class="info__source">Referencia žiadosti: {i.release_ref}</p>
            <form method="post" action={`/ucto/incidenty/${i.id}/schvalit-uvolnenie`}>
              <button class="btn btn--line" type="submit">
                Schváliť uvoľnenie druhým správcom
              </button>
            </form>
          </>
        ) : (
          <form class="details" method="post" action={`/ucto/incidenty/${i.id}/uvolnit`}>
            <div class="field">
              <label class="field__label" for="release-reference">
                Referencia schváleného posúdenia
              </label>
              <input class="field__input" id="release-reference" name="reference" minlength={12} maxlength={240} required />
            </div>
            <button class="btn btn--line" type="submit">
              Požiadať o uvoľnenie
            </button>
          </form>
        )}
      </section>
    ) : null}
    {admin && !i.closed_at ? (
      <section class="info">
        <h2 class="h3">Uzavretie vybaveného prípadu</h2>
        <p>Prípad uzatvára iný správca než ten, kto ho založil. Aktívne uchovanie musí byť najprv schválene uvoľnené.</p>
        <form class="details" method="post" action={`/ucto/incidenty/${i.id}/uzavriet`}>
          <div class="field">
            <label class="field__label" for="close-reference">
              Referencia vyriešenia a kontroly následkov
            </label>
            <input class="field__input" id="close-reference" name="reference" minlength={12} maxlength={240} required />
          </div>
          <button class="btn btn--line" type="submit">
            Uzavrieť prípad
          </button>
        </form>
      </section>
    ) : null}
    <section class="info">
      <h2 class="h3">História</h2>
      <ol class="incident-history">
        {events.map((e) => (
          <li>
            <strong>{labels[e.action] ?? 'Zmena prípadu'}</strong>
            <p class="info__source">
              {new Date(e.at * 1000).toLocaleString('sk-SK', {
                timeZone: 'Europe/Bratislava',
              })}{' '}
              · {e.user_name}
            </p>
            <p>{eventText(e.detail)}</p>
          </li>
        ))}
      </ol>
    </section>
  </>
)
