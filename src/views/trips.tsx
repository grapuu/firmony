// Business trips (src/app/trips.ts): the list, the form, and the settlement as a sheet to print or save.
import type { FC } from 'hono/jsx'
import { formatEurExact } from '../format'
import { app, dayName } from '../app/copy'
import type { Company } from '../app/store'
import { carRateOn, formDays, TRANSPORTS, type TripErrors, type TripValues } from '../app/trips'
import type { Trip } from '../app/trips-store'
import { bratislavaDay } from '../time'
import { Flash, Heading } from './inside'
import { groupIban } from './inside-pages'

const t = app.trips

const clock = (at: string) => `${Number(at.slice(11, 13))}:${at.slice(14, 16)}`
const when = (at: string) => `${dayName(at.slice(0, 10))} ${clock(at)}`
/** A whole number of hundredths or thousandths as Slovak writes it: 6,5 or 1,539. */
const decimal = (n: number, scale: number) => (n / scale).toLocaleString('sk-SK', { maximumFractionDigits: 3 }).replace(/\s/g, '')

const stateOf = (trip: Trip) => (trip.paidOn ? t.paid(dayName(trip.paidOn)) : trip.documentId ? (trip.booked ? `${t.booked}, ${t.waiting.toLowerCase()}` : t.waiting) : '')

export const TripsPage: FC<{ trips: Trip[]; flash?: string | null }> = ({ trips, flash = null }) => (
  <>
    <header class="phead">
      <Heading first={t.title} second={t.serif} />
      <p class="phead__lead">{t.lead}</p>
    </header>
    <Flash text={flash} />
    <p>
      <a class="btn btn--blue" href="/app/cesty/nova">
        {t.add}
      </a>
    </p>
    {trips.length === 0 ? (
      <p class="over__empty">{t.empty}</p>
    ) : (
      <section class="info" aria-labelledby="cesty-t">
        <h2 id="cesty-t" class="info__title">
          {t.title}
        </h2>
        <ul class="plain trips">
          {trips.map((trip) => (
            <li class="trips__item">
              <a class="link" href={`/app/cesty/${trip.id}`}>
                {trip.number}
              </a>{' '}
              <span>
                {dayName(trip.start.slice(0, 10))}, {trip.traveller}, {trip.to}
              </span>
              <strong class="trips__amount">{formatEurExact(trip.totalCents)}</strong>
              <span class="trips__state">{stateOf(trip)}</span>
            </li>
          ))}
        </ul>
      </section>
    )}
  </>
)

const Text: FC<{ name: string; label: string; value: string; error?: string; hint?: string; wide?: boolean; mode?: 'numeric' | 'decimal'; max?: number }> = ({
  name,
  label,
  value,
  error,
  hint,
  wide,
  mode,
  max = 200,
}) => (
  <div class={`fgrid__cell${wide ? ' fgrid__cell--wide' : ''}`}>
    <label class="field__label" for={`t-${name}`}>
      {label}
    </label>
    <input id={`t-${name}`} class="field__input" name={name} value={value} inputmode={mode} maxlength={max} aria-invalid={error ? 'true' : undefined} />
    {error ? <p class="field__error">{error}</p> : hint ? <p class="field__hint">{hint}</p> : null}
  </div>
)

export const TripFormPage: FC<{ values: TripValues; errors: TripErrors; employees: { id: string; name: string }[]; error?: string | null }> = ({ values, errors, employees, error = null }) => {
  const days = formDays(values)
  return (
    <>
      <a class="back" href="/app/cesty">
        {t.back}
      </a>
      <header class="phead">
        <Heading first={t.newTitle} small />
        <p class="phead__lead">{t.newLead}</p>
      </header>
      <Flash text={error} tone="error" />
      <form class="invform" method="post" action="/app/cesty" novalidate>
        <input type="hidden" name="dni" value={values.free ? days.join(',') : ''} />
        <section class="info" aria-labelledby="kto-t">
          <h2 id="kto-t" class="info__title">
            {t.who}
          </h2>
          <div class="fgrid">
            {employees.length > 0 ? (
              <div class="fgrid__cell fgrid__cell--wide">
                <label class="field__label" for="t-zamestnanec">
                  {t.employee}
                </label>
                <select id="t-zamestnanec" class="field__input" name="zamestnanec">
                  <option value="">{t.employeeNone}</option>
                  {employees.map((e) => (
                    <option value={e.id} selected={values.employee === e.id}>
                      {e.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            <Text name="kto" label={t.traveller} value={values.traveller} error={errors.traveller} hint={t.travellerHint} wide max={120} />
            <Text name="iban" label={t.iban} value={values.iban} error={errors.iban} hint={t.ibanHint} wide max={42} />
          </div>
        </section>
        <section class="info" aria-labelledby="cesta-t">
          <h2 id="cesta-t" class="info__title">
            {t.trip}
          </h2>
          <div class="fgrid">
            <Text name="ucel" label={t.purpose} value={values.purpose} error={errors.purpose} hint={t.purposeHint} wide max={300} />
            <Text name="odkial" label={t.from} value={values.from} error={errors.places} max={120} />
            <Text name="kam" label={t.to} value={values.to} max={200} />
            <Text name="odchod" label={t.start} value={values.start} error={errors.start} hint={t.timeHint} max={20} />
            <Text name="navrat" label={t.end} value={values.end} error={errors.end} hint={t.timeHint} max={20} />
            <div class="fgrid__cell fgrid__cell--wide">
              <label class="field__label" for="t-doprava">
                {t.transport}
              </label>
              <select id="t-doprava" class="field__input" name="doprava">
                {TRANSPORTS.map((k) => (
                  <option value={k} selected={values.transport === k}>
                    {t.transports[k]}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>
        <section class="info trips__car" aria-labelledby="auto-t">
          <h2 id="auto-t" class="info__title">
            {t.carTitle}
          </h2>
          <div class="fgrid">
            <Text name="km" label={t.km} value={values.km} error={errors.car} mode="numeric" max={8} />
            <Text name="spotreba" label={t.consumption} value={values.consumption} hint={t.consumptionHint} mode="decimal" max={8} />
            <Text name="cena" label={t.price} value={values.price} hint={t.priceHint} mode="decimal" max={8} />
            <Text name="spz" label={t.plate} value={values.plate} max={12} />
          </div>
        </section>
        <section class="info" aria-labelledby="jedlo-t">
          <h2 id="jedlo-t" class="info__title">
            {t.meals}
          </h2>
          <fieldset class="trips__question">
            <legend class="field__label">{t.mealsQuestion}</legend>
            <label class="tickbox">
              <input type="radio" name="jedlo" value="nie" checked={!values.free} /> {t.mealsNo}
            </label>
            <label class="tickbox">
              <input type="radio" name="jedlo" value="ano" checked={values.free} /> {t.mealsYes}
            </label>
          </fieldset>
          {errors.meals ? <p class="field__error">{errors.meals}</p> : null}
          {values.free && days.length > 0 ? (
            <table class="trips__meals">
              <caption class="field__label">{t.mealsDays}</caption>
              <thead>
                <tr>
                  <th scope="col">{t.day}</th>
                  <th scope="col">{t.breakfast}</th>
                  <th scope="col">{t.lunch}</th>
                  <th scope="col">{t.dinner}</th>
                </tr>
              </thead>
              <tbody>
                {days.map((day) => (
                  <tr>
                    <th scope="row">{dayName(day)}</th>
                    {(
                      [
                        ['r', 'breakfast'],
                        ['o', 'lunch'],
                        ['v', 'dinner'],
                      ] as const
                    ).map(([prefix, meal]) => (
                      <td>
                        <input type="checkbox" name={`${prefix}-${day}`} value="1" checked={Boolean(values.meals[day]?.[meal])} aria-label={`${t[meal]} ${dayName(day)}`} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : values.free ? (
            <p class="field__hint">{t.mealsAfter}</p>
          ) : null}
        </section>
        <div class="invform__actions">
          <button class="btn btn--line" type="submit" name="akcia" value="prepocitat">
            {t.recount}
          </button>
          <button class="btn btn--blue" type="submit" name="akcia" value="ulozit">
            {t.save}
          </button>
        </div>
      </form>
    </>
  )
}

export const TripSheet: FC<{ trip: Trip; company: Company }> = ({ trip, company }) => {
  const r = trip.result
  const meal = (d: (typeof r.days)[number]) =>
    [d.breakfast ? t.breakfast : null, d.lunch ? t.lunch : null, d.dinner ? t.dinner : null].filter((x): x is string => x !== null).map((x) => x.toLowerCase())
  const perKm = carRateOn(trip.start.slice(0, 10)) ?? 0
  return (
    <article class="sheet" aria-label={`${t.sheetTitle} ${trip.number}`}>
      <header class="sheet__head">
        <div class="sheet__from">
          <p class="sheet__company">{company.name}</p>
          {company.address ? <p>{company.address}</p> : null}
        </div>
        <div class="sheet__title">
          <p class="sheet__kind sheet__kind--long">{t.sheetTitle}</p>
          <p class="sheet__number">{t.number(trip.number)}</p>
        </div>
      </header>
      <div class="sheet__parties">
        <div class="sheet__to">
          <p class="sheet__label">{t.who}</p>
          <p class="sheet__company">{trip.traveller}</p>
          <p>
            {t.purpose}: {trip.purpose}
          </p>
          <p>
            {t.from}: {trip.from}, {t.to.toLowerCase()}: {trip.to}
          </p>
          <p>
            {t.transports[trip.transport]}
            {trip.plate ? `, ${t.plate} ${trip.plate}` : ''}
          </p>
        </div>
        <dl class="sheet__dates">
          <div>
            <dt>{t.start}</dt>
            <dd>{when(trip.start)}</dd>
          </div>
          <div>
            <dt>{t.end}</dt>
            <dd>{when(trip.end)}</dd>
          </div>
          <div>
            <dt>{t.settled}</dt>
            <dd>{dayName(bratislavaDay(trip.createdAt))}</dd>
          </div>
        </dl>
      </div>
      <div class="sheet__table">
        <table>
          <thead>
            <tr>
              <th scope="col">{t.day}</th>
              <th scope="col">{t.hours}</th>
              <th scope="col">{t.allowance}</th>
              <th scope="col">{t.cut}</th>
              <th scope="col">{t.owed}</th>
            </tr>
          </thead>
          <tbody>
            {r.days.map((d) => (
              <tr>
                <td>
                  {dayName(d.day)}
                  {meal(d).length > 0 ? <span class="trips__given">{t.mealsGiven(meal(d))}</span> : null}
                </td>
                <td>{t.duration(d.minutes)}</td>
                <td>{formatEurExact(d.allowance)}</td>
                <td>{formatEurExact(-d.cut)}</td>
                <td>{formatEurExact(d.owed)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {trip.car ? null : <p class="sheet__note">{t.noCar}</p>}
      <div class="sheet__bottom">
        <div class="sheet__payment">
          {trip.iban ? (
            <dl class="sheet__pay">
              <div>
                <dt>{t.payTo}</dt>
                <dd>{groupIban(trip.iban)}</dd>
              </div>
            </dl>
          ) : null}
        </div>
        <dl class="sheet__totals">
          <div>
            <dt>{t.mealsTotal}</dt>
            <dd>{formatEurExact(r.meals)}</dd>
          </div>
          {trip.car ? (
            <>
              <div>
                <dt>{t.carBasic(trip.car.km, decimal(perKm, 1000))}</dt>
                <dd>{formatEurExact(r.carBasic)}</dd>
              </div>
              <div>
                <dt>{t.carFuel(trip.car.km, decimal(trip.car.consumption, 100), decimal(trip.car.priceMilli, 1000))}</dt>
                <dd>{formatEurExact(r.carFuel)}</dd>
              </div>
            </>
          ) : null}
          <div class="sheet__total">
            <dt>{t.total}</dt>
            <dd>{formatEurExact(r.total)}</dd>
          </div>
        </dl>
      </div>
      {r.total === 0 ? <p class="sheet__note">{t.nothing}</p> : null}
      <p class="sheet__note">{t.rules}</p>
    </article>
  )
}

export const TripPage: FC<{ trip: Trip; company: Company; flash?: string | null; error?: string | null }> = ({ trip, company, flash = null, error = null }) => {
  const removable = !trip.removedAt && !trip.booked && !trip.paidOn
  return (
    <>
      <a class="back" href="/app/cesty">
        {t.back}
      </a>
      <header class="phead phead--row">
        <div>
          <Heading first={`${t.sheetTitle} ${trip.number}`} small />
          <p class="phead__lead">
            {trip.traveller}, {formatEurExact(trip.totalCents)}
          </p>
        </div>
        {trip.removedAt ? null : <span class={`pill ${trip.paidOn ? 'pill--ok' : 'pill--blue'} phead__aside`}>{stateOf(trip) || t.nothing}</span>}
      </header>
      <Flash text={flash} />
      <Flash text={error} tone="error" />
      <div class="invoice">
        <div class="invoice__paper">
          <TripSheet trip={trip} company={company} />
        </div>
        <aside class="invoice__side">
          <section class="info">
            {trip.removedAt ? <p class="info__lead">{t.removed}</p> : null}
            {trip.documentId && !trip.removedAt ? (
              <a class="btn btn--line invoice__wide" href={`/app/doklady/${trip.documentId}`}>
                {t.document}
              </a>
            ) : null}
            <button class="btn btn--line invoice__wide" type="button" data-print hidden>
              {t.print}
            </button>
            {removable ? (
              <form method="post" action={`/app/cesty/${trip.id}/zrusit`}>
                <button class="btn btn--line invoice__wide" type="submit">
                  {t.remove}
                </button>
                <p class="info__source">{t.removeHint}</p>
              </form>
            ) : null}
          </section>
        </aside>
      </div>
    </>
  )
}
