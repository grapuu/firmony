import type { FC } from 'hono/jsx'
import { dayName, whenName } from '../app/copy'
import { monthEnd } from '../app/ledger'
import type { Company } from '../app/store'
import type { LockChange, LockValues, PeriodLock } from '../app/periods'
import { LedgerHead, bookPath } from './ledger'

export interface PeriodPageProps {
  company: Company
  lock: PeriodLock | null
  history: LockChange[]
  revision: number
  today: string
  start: string | null
  values?: LockValues
  error?: string | null
  flash?: string | null
  blockers?: { documents: number; payments: number }
}
export const PeriodPage: FC<PeriodPageProps> = (p) => {
  const action = bookPath(p.company, 'periods')
  const thisYear = Number(p.today.slice(0, 4)),
    thisMonth = Number(p.today.slice(5, 7))
  const lastMonth = monthEnd(thisMonth === 1 ? thisYear - 1 : thisYear, thisMonth === 1 ? 12 : thisMonth - 1).slice(0, 7)
  const fields = (
    <>
      <input type="hidden" name="verzia" value={String(p.lock?.version ?? 0)} />
      <input type="hidden" name="revizia" value={String(p.revision)} />
    </>
  )
  return (
    <>
      <LedgerHead
        company={p.company}
        tab="periods"
        title="Uzamknutie období"
        lead="Po kontrole uzamknite účtovníctvo do konca mesiaca. December uzamkne celý rok. Staršie zápisy zostanú chránené aj pri práci v ďalšom roku."
        error={p.error}
        flash={p.flash}
      />
      <section class="info" id="stav-uzamknutia" aria-labelledby="stav-uzamknutia-t">
        <h2 class="info__title" id="stav-uzamknutia-t">
          {p.lock?.through ? `Uzamknuté do ${dayName(p.lock.through)}` : 'Obdobia sú otvorené'}
        </h2>
        <p>
          Uzamknutie chráni doklady, ich párovanie a účty platieb, interné doklady, počiatočné stavy, mzdy a podania. Nové podklady možno prijímať; do
          uzamknutého obdobia sa zaúčtujú až po jeho otvorení.
        </p>
        {p.lock ? (
          <p class="info__source">
            Posledná zmena: {whenName(p.lock.at, p.today)}. {p.lock.reason}
          </p>
        ) : null}
        <p class="info__source">Uzamknutie je interná ochrana účtovníctva. Priznania a výkazy sa podávajú samostatne.</p>
      </section>
      {p.blockers && p.blockers.documents + p.blockers.payments > 0 ? (
        <section class="info" aria-labelledby="prekazky-uzamknutia-t">
          <h2 class="info__title" id="prekazky-uzamknutia-t">
            Pred uzamknutím doriešiť
          </h2>
          <p>
            Doklady: {p.blockers.documents}. Platby: {p.blockers.payments}. Doplňte zaúčtovanie, dátumy a účty chýbajúcich zápisov.
          </p>
          <a href={`${bookPath(p.company)}#doriesit`}>Zobraziť účtovnú knihu</a>
        </section>
      ) : null}
      <div class="period-forms">
        <section class="info" aria-labelledby="uzamknut-t">
          <h2 class="info__title" id="uzamknut-t">
            Uzamknúť obdobie
          </h2>
          <p>Chránia sa aj všetky skoršie mesiace a roky, pretože ich zostatky prechádzajú ďalej. Najprv doriešte známe chýbajúce zápisy vo vybranom období.</p>
          <form class="period-form" method="post" action={action}>
            {fields}
            <input type="hidden" name="akcia" value="lock" />
            <label class="field__label" for="uzamknut-mesiac">
              Do mesiaca vrátane
            </label>
            <input
              class="field__input"
              type="month"
              id="uzamknut-mesiac"
              name="mesiac"
              min={p.start?.slice(0, 7)}
              max={lastMonth}
              value={p.values?.action === 'lock' ? p.values.month : lastMonth}
              required
            />
            <label class="field__label" for="uzamknut-dovod">
              Poznámka ku kontrole (nepovinná)
            </label>
            <textarea class="field__input" id="uzamknut-dovod" name="dovod" rows={3} maxlength={1000}>
              {p.values?.action === 'lock' ? p.values.reason : ''}
            </textarea>
            <button class="btn btn--small" type="submit">
              Uzamknúť do konca mesiaca
            </button>
          </form>
        </section>
        {p.lock?.through ? (
          <section class="info" aria-labelledby="otvorit-t">
            <h2 class="info__title" id="otvorit-t">
              Otvoriť pre opravu
            </h2>
            <p>
              Otvorí sa vybraný mesiac aj všetky neskoršie mesiace. Skoršie mesiace zostanú chránené. Pre úplné otvorenie zvoľte prvý mesiac účtovníctva
              {p.start ? ` (${p.start.slice(0, 7)})` : ''}.
            </p>
            <form class="period-form" method="post" action={action}>
              {fields}
              <input type="hidden" name="akcia" value="open" />
              <label class="field__label" for="otvorit-mesiac">
                Otvoriť od mesiaca
              </label>
              <input
                class="field__input"
                type="month"
                id="otvorit-mesiac"
                name="mesiac"
                min={p.start?.slice(0, 7)}
                max={p.lock.through.slice(0, 7)}
                value={p.values?.action === 'open' ? p.values.month : p.lock.through.slice(0, 7)}
                required
              />
              <label class="field__label" for="otvorit-dovod">
                Dôvod otvorenia
              </label>
              <textarea class="field__input" id="otvorit-dovod" name="dovod" rows={3} minlength={10} maxlength={1000} required>
                {p.values?.action === 'open' ? p.values.reason : ''}
              </textarea>
              <button class="btn btn--line btn--small" type="submit">
                Otvoriť obdobie s dôvodom
              </button>
            </form>
          </section>
        ) : null}
      </div>
      <section class="info" id="historia-uzamknutia" aria-labelledby="historia-uzamknutia-t">
        <h2 class="info__title" id="historia-uzamknutia-t">
          História uzamknutia a otvorenia
        </h2>
        {p.history.length === 0 ? (
          <p class="info__empty">Zatiaľ žiadna zmena.</p>
        ) : (
          <ol class="period-history">
            {p.history.map((h) => (
              <li>
                <strong>
                  {h.through && (!h.before || h.through > h.before)
                    ? `Uzamknuté do ${dayName(h.through)}`
                    : h.through
                      ? `Otvorené od ${dayName(new Date(Date.parse(`${h.through}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10))}`
                      : 'Všetky obdobia otvorené'}
                </strong>
                <p>
                  {h.byName ?? h.by} · {whenName(h.at, p.today)} · zmena {h.version}
                </p>
                <p>{h.reason || 'Bez poznámky.'}</p>
              </li>
            ))}
          </ol>
        )}
        <p class="info__source">Zobrazuje sa posledných 100 zmien. Úplná história je súčasťou exportu účtovníctva.</p>
      </section>
    </>
  )
}
