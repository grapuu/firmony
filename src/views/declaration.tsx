// "Kto stojí za firmou": what Act No. 297/2008 Z. z. asks a client to tell us, filled in by the owner of the company
// in the app (his word of 13 October 2026: nothing by email). The form first; once it is sent, what was given, with
// the birth numbers cut to their last four digits, and a button to change it. Nobody but the owner sees either: a
// member of the company is told only where it stands.
import type { Child, FC } from 'hono/jsx'
import { app, dayName, whenName } from '../app/copy'
import { ID_KINDS, KUVS, OWNER_SLOTS, TURNOVERS, maskBirthNumber, type DeclarationErrors, type DeclarationState, type DeclarationValues, type StoredDeclaration } from '../app/aml'
import { Flash, Heading } from './inside'
import { AML_NO_CONSENT } from '../aml/consent'
import { typeset } from '../format'
import { dayOf } from './inside-pages'

const d = app.declaration

const PILL: Record<DeclarationState, string> = { missing: 'pill--amber', waiting: 'pill--blue', checked: 'pill--ok' }

/** A field of the form: its label, the input, then its error or its hint. */
const Field: FC<{
  name: string
  label: string
  values: DeclarationValues
  errors: DeclarationErrors
  error?: string
  hint?: string
  wide?: boolean
  mode?: 'numeric' | 'text'
  placeholder?: string
  max: number
  auto?: string
}> = ({ name, label, values, errors, error, hint, wide, mode, placeholder, max, auto }) => {
  const id = `v-${name}`
  const wrong = errors[error ?? name]
  return (
    <div class={`fgrid__cell${wide ? ' fgrid__cell--wide' : ''}`}>
      <label class="field__label" for={id}>
        {label}
      </label>
      <input
        id={id}
        class="field__input"
        name={name}
        value={values[name] ?? ''}
        maxlength={max}
        inputmode={mode}
        placeholder={placeholder}
        autocomplete={auto ?? 'off'}
        aria-invalid={wrong ? 'true' : undefined}
        aria-describedby={wrong || hint ? `${id}-note` : undefined}
      />
      {wrong ? (
        <p class="field__error" id={`${id}-note`}>
          {wrong}
        </p>
      ) : hint ? (
        <p class="field__hint" id={`${id}-note`}>
          {hint}
        </p>
      ) : null}
    </div>
  )
}

/** Two answers, "Áno" and "Nie", as two pills. */
const YesNo: FC<{ name: string; legend: string; lead?: string; values: DeclarationValues; errors: DeclarationErrors }> = ({ name, legend, lead, values, errors }) => (
  <fieldset class="yesno" aria-describedby={errors[name] ? `v-${name}-note` : lead ? `v-${name}-lead` : undefined}>
    <legend class="yesno__legend">{legend}</legend>
    {lead ? (
      <p class="yesno__lead" id={`v-${name}-lead`}>
        {lead}
      </p>
    ) : null}
    <div class="yesno__options">
      <label class="yesno__option">
        <input type="radio" name={name} value="0" checked={values[name] === '0'} />
        <span>{d.no}</span>
      </label>
      <label class="yesno__option">
        <input type="radio" name={name} value="1" checked={values[name] === '1'} />
        <span>{d.yes}</span>
      </label>
    </div>
    {errors[name] ? (
      <p class="field__error" id={`v-${name}-note`}>
        {errors[name]}
      </p>
    ) : null}
  </fieldset>
)

const Part: FC<{ id: string; title: string; lead?: string; children: Child }> = ({ id, title, lead, children }) => (
  <section class="info decl__part" aria-labelledby={`${id}-t`}>
    <h2 id={`${id}-t`} class="info__title">
      {title}
    </h2>
    {lead ? <p class="info__lead">{lead}</p> : null}
    {children}
  </section>
)

export const DeclarationForm: FC<{ values: DeclarationValues; errors: DeclarationErrors; editing: boolean; action?: string; children?: Child; multipart?: boolean }> = ({ values, errors, editing, action = '/app/vyhlasenie', children, multipart }) => {
  const wrong = Object.keys(errors).length > 0
  return (
    <form class="decl" method="post" action={action} enctype={multipart ? 'multipart/form-data' : undefined} novalidate>
      {wrong ? <Flash text={d.errors.form} tone="error" /> : null}
      <Part id="konatel" title={d.director} lead={d.directorLead}>
        <div class="fgrid">
          <Field name="name" label={d.name} values={values} errors={errors} wide max={120} auto="name" />
          <Field name="rc" label={d.rc} values={values} errors={errors} hint={d.rcHint} mode="numeric" max={14} />
          <Field name="dob" label={d.dob} values={values} errors={errors} hint={d.dobHint} mode="numeric" placeholder="12. 3. 1990" max={14} />
          <Field name="address" label={d.address} values={values} errors={errors} hint={d.addressHint} wide max={200} />
          <Field name="nationality" label={d.nationality} values={values} errors={errors} max={60} />
          <Field name="citizenships" label="Kódy všetkých štátnych príslušností" hint="Napríklad SK. Pri viacerých uveďte SK, CZ." values={values} errors={errors} max={100} />
          <Field name="residenceCountry" label="Kód krajiny pobytu" hint="Napríklad SK alebo CZ." values={values} errors={errors} max={2} />
          <div class="fgrid__cell">
            <label class="field__label" for="v-idKind">
              {d.idKind}
            </label>
            <select id="v-idKind" class="field__input" name="idKind" aria-invalid={errors.idNumber ? 'true' : undefined}>
              <option value="">{d.choose}</option>
              {ID_KINDS.map((kind) => (
                <option value={kind} selected={values.idKind === kind}>
                  {d.idKinds[kind]}
                </option>
              ))}
            </select>
          </div>
          <Field name="idNumber" label={d.idNumber} values={values} errors={errors} max={20} />
        </div>
        <YesNo name="pep" legend={d.pep} lead={d.pepLead} values={values} errors={errors} />
      </Part>

      <Part id="kuv" title={d.kuv} lead={d.kuvLead}>
        <fieldset class="decl__kuv" aria-describedby={errors.kuv ? 'v-kuv-note' : undefined}>
          <legend class="sr">{d.kuv}</legend>
          {KUVS.map((kuv) => (
            <label class={`decl__choice decl__choice--${kuv}`}>
              <input type="radio" name="kuv" value={kuv} checked={values.kuv === kuv} />
              <span>{d.kuvs[kuv]}</span>
            </label>
          ))}
          {errors.kuv ? (
            <p class="field__error" id="v-kuv-note">
              {errors.kuv}
            </p>
          ) : null}
        </fieldset>
        <div class="decl__owners">
          <p class="decl__ownerslead">
            <strong>{d.owners}.</strong> {d.ownersLead}
          </p>
          {errors.owners ? <p class="field__error">{errors.owners}</p> : null}
          {Array.from({ length: OWNER_SLOTS }, (_, k) => k + 1).map((i) => (
            <details open={i === 1 || Boolean(values[`o${i}Name`]) || Object.keys(errors).some((key) => key.startsWith(`o${i}`))}><summary class="link">{d.owner(i)}</summary><fieldset class={`decl__owner${Object.keys(errors).some((key) => key.startsWith(`o${i}`)) ? ' decl__owner--wrong' : ''}`}>
              <legend class="decl__ownertitle">{d.owner(i)}</legend>
              <div class="fgrid">
                <Field name={`o${i}Name`} error={`o${i}name`} label={d.name} values={values} errors={errors} wide max={120} placeholder=" " />
                <Field name={`o${i}Rc`} error={`o${i}rc`} label={d.rc} values={values} errors={errors} hint={d.rcHint} mode="numeric" max={14} />
                <Field name={`o${i}Dob`} error={`o${i}dob`} label={d.dob} values={values} errors={errors} mode="numeric" placeholder="12. 3. 1990" max={14} />
                <Field name={`o${i}Address`} error={`o${i}address`} label={d.address} values={values} errors={errors} wide max={200} />
                <Field name={`o${i}Citizenships`} label="Kódy všetkých štátnych príslušností" values={values} errors={errors} max={100} />
                <Field name={`o${i}ResidenceCountry`} label="Kód krajiny pobytu" values={values} errors={errors} max={2} />
                <Field name={`o${i}Nationality`} error={`o${i}nationality`} label={d.nationality} values={values} errors={errors} max={60} />
                <Field name={`o${i}Share`} error={`o${i}share`} label={d.share} values={values} errors={errors} placeholder={d.sharePlaceholder} max={60} />
              </div>
              <label class="tickbox">
                <input type="checkbox" name={`o${i}Pep`} value="1" checked={values[`o${i}Pep`] === '1'} />
                <span>{d.ownerPep}</span>
              </label>
            </fieldset></details>
          ))}
          <label class="tickbox"><input type="checkbox" name="ownersOverflow" value="1" checked={values.ownersOverflow === '1'} /><span>Konečných užívateľov výhod je viac ako 12. Potrebujem individuálne spracovanie úplnej štruktúry.</span></label>
        </div>
      </Part>

      <Part id="cinnost" title={d.business}>
        <div class="fgrid">
          <Field name="activity" label={d.activity} values={values} errors={errors} placeholder={d.activityPlaceholder} wide max={300} />
          <Field name="income" label={d.income} values={values} errors={errors} placeholder={d.incomePlaceholder} wide max={300} />
          <div class="fgrid__cell fgrid__cell--wide">
            <label class="field__label" for="v-turnover">
              {d.turnover}
            </label>
            <select id="v-turnover" class="field__input decl__turnover" name="turnover" aria-invalid={errors.turnover ? 'true' : undefined}>
              <option value="">{d.choose}</option>
              {TURNOVERS.map((turnover) => (
                <option value={turnover} selected={values.turnover === turnover}>
                  {d.turnovers[turnover]}
                </option>
              ))}
            </select>
            {errors.turnover ? <p class="field__error">{errors.turnover}</p> : null}
          </div>
        </div>
        <YesNo name="cash" legend={d.cash} values={values} errors={errors} />
        <YesNo name="abroad" legend={d.abroad} values={values} errors={errors} />
        <div class="decl__where">
          <div class="fgrid">
            <Field name="abroadWhere" label={d.abroadWhere} values={values} errors={errors} wide max={200} />
          </div>
        </div>
      </Part>

      <Part id="miesto" title="Miesto podnikania a zastupovanie">
        <YesNo name="businessAtSeat" legend="Vykonáva Vaša firma podnikateľskú činnosť na adrese sídla?" values={values} errors={errors} />
        <div class="fgrid decl__business-address">
          <Field name="businessAddress" label="Skutočné miesto podnikateľskej činnosti" hint="Vyplňte, ak je odlišné od sídla." values={values} errors={errors} wide max={300} />
        </div>
        <div class="fgrid">
          <Field name="businessCountries" label="Kódy krajín sídla, pobočiek a prevádzkarní" hint="Napríklad SK alebo SK, CZ." values={values} errors={errors} wide max={400} />
          <Field name="partnerCountries" label="Kódy krajín pravidelných obchodných partnerov" hint="Napríklad SK, CZ, DE. Pri obchodoch mimo EÚ je tento údaj povinný." values={values} errors={errors} wide max={400} />
        </div>
        <YesNo name="ownBehalf" legend="Koná Vaša firma vo vlastnom mene a na vlastný účet?" lead="Ide o firmu, za ktorú toto vyhlásenie vypĺňate." values={values} errors={errors} />
        <div class="decl__principal">
          <p class="info__lead">Ak nie, záväzne uveďte osobu, v ktorej mene firma koná.</p>
          <label class="field__label" for="v-principalKind">Druh osoby</label>
          <select id="v-principalKind" class="field__input" name="principalKind" aria-invalid={errors.principalKind ? 'true' : undefined}>
            <option value="">Vyberte</option><option value="person" selected={values.principalKind === 'person'}>Fyzická osoba</option><option value="company" selected={values.principalKind === 'company'}>Právnická osoba</option>
          </select>
          {errors.principalKind ? <p class="field__error">{errors.principalKind}</p> : null}
          <div class="fgrid">
            <Field name="principalName" label="Meno a priezvisko alebo obchodné meno" values={values} errors={errors} wide max={200} />
            <Field name="principalRc" label="Rodné číslo fyzickej osoby" values={values} errors={errors} max={14} />
            <Field name="principalDob" label="Dátum narodenia, ak rodné číslo nebolo pridelené" values={values} errors={errors} max={14} placeholder="12. 3. 1990" />
            <Field name="principalAddress" label="Sídlo právnickej osoby" values={values} errors={errors} wide max={300} />
            <Field name="principalIco" label="IČO právnickej osoby" values={values} errors={errors} max={20} />
          </div>
        </div>
      </Part>
      {children}
      <section class="info decl__part decl__end" aria-label={d.send}>
        <label class="tickbox tickbox--top">
          <input type="checkbox" name="truthful" value="1" aria-invalid={errors.truthful ? 'true' : undefined} />
          <span>{d.truthful}</span>
        </label>
        {errors.truthful ? <p class="field__error">{errors.truthful}</p> : null}
        <div class="decl__buttons">
          <button class="btn btn--blue" type="submit">
            {d.send}
          </button>
          {editing ? (
            <a class="btn btn--text" href="/app/vyhlasenie">
              {d.back}
            </a>
          ) : null}
        </div>
      </section>
    </form>
  )
}

/** What was given, as the owner reads it again: birth numbers and the document's number cut short. */
const Summary: FC<{ stored: StoredDeclaration; now: number }> = ({ stored, now }) => {
  const x = stored.data
  const cut = (value: string) => (value.length > 3 ? `${'*'.repeat(Math.min(value.length - 3, 6))}${value.slice(-3)}` : value)
  const born = (rc: string, day: string) => (rc ? maskBirthNumber(rc) : day ? dayName(day) : d.none)
  return (
    <>
      <section class="info" aria-labelledby="konatel-t">
        <h2 id="konatel-t" class="info__title">
          {d.director}
        </h2>
        <dl class="kv">
          <div>
            <dt>{d.name}</dt>
            <dd class="kv__long">{x.director.name}</dd>
          </div>
          <div>
            <dt>{x.director.birthNumber ? d.rc : d.dob}</dt>
            <dd>{born(x.director.birthNumber, x.director.birthDate)}</dd>
          </div>
          <div>
            <dt>{d.address}</dt>
            <dd class="kv__long">{x.director.address}</dd>
          </div>
          <div>
            <dt>{d.nationality}</dt>
            <dd>{x.director.nationality}</dd>
          </div>
          <div>
            <dt>{d.idKinds[x.director.idKind]}</dt>
            <dd>{cut(x.director.idNumber)}</dd>
          </div>
          <div>
            <dt>{d.short.pep}</dt>
            <dd>{x.director.pep ? d.yes : d.no}</dd>
          </div>
        </dl>
      </section>
      <section class="info" aria-labelledby="kuv-t">
        <h2 id="kuv-t" class="info__title">
          {d.kuv}
        </h2>
        <p class="info__lead">{d.kuvs[x.kuv]}</p>
        {x.owners.length > 0 ? (
          <ul class="plain">
            {x.owners.map((o) => (
              <li class="plain__row plain__row--two">
                <span class="plain__name">{o.name}</span>
                <span class="plain__sub">
                  <span>{o.share}</span>
                  <span>{born(o.birthNumber, o.birthDate)}</span>
                  <span>{o.nationality}</span>
                  {o.pep ? <span>{d.ownerPep}</span> : null}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
      <section class="info" aria-labelledby="cinnost-t">
        <h2 id="cinnost-t" class="info__title">
          {d.business}
        </h2>
        <dl class="kv">
          <div>
            <dt>{d.activity}</dt>
            <dd class="kv__long">{x.activity}</dd>
          </div>
          <div>
            <dt>{d.income}</dt>
            <dd class="kv__long">{x.income}</dd>
          </div>
          <div>
            <dt>{d.short.turnover}</dt>
            <dd>{d.turnovers[x.turnover]}</dd>
          </div>
          <div>
            <dt>{d.short.cash}</dt>
            <dd>{x.cash ? d.yes : d.no}</dd>
          </div>
          <div>
            <dt>{d.short.abroad}</dt>
            <dd class="kv__long">{x.abroad ? `${d.yes}: ${x.abroadWhere}` : d.no}</dd>
          </div>
        </dl>
        <p class="info__source">{d.by(stored.createdByName, whenName(stored.createdAt, dayOf(now)))}</p>
      </section>
      <p>
        <a class="btn btn--line" href="/app/vyhlasenie?zmenit=1">
          {d.change}
        </a>
      </p>
    </>
  )
}

export interface DeclarationPageProps {
  state: DeclarationState
  stored: StoredDeclaration | null
  owner: boolean
  /** The form is shown: nothing was given yet, the owner asked to change it, or what was sent came back with errors. */
  editing: boolean
  values: DeclarationValues
  errors: DeclarationErrors
  now: number
  flash?: string | null
  error?: string | null
  signature?: Child
}

export const DeclarationPage: FC<DeclarationPageProps> = ({ state, stored, owner, editing, values, errors, now, flash, error, signature }) => (
  <>
    <header class="phead phead--row">
      <div>
        <Heading first={d.title} second={d.serif} />
        <p class="phead__lead">{d.lead}</p>
        <p class="small" data-aml-consent>{typeset(AML_NO_CONSENT)}</p>
      </div>
      <span class={`pill ${PILL[state]} phead__aside`}>{d.state[state]}</span>
    </header>
    <Flash text={flash} />
    <Flash text={error} tone="error" />
    {!owner ? (
      <section class="info">
        <p class="info__lead">{d.onlyOwner}</p>
      </section>
    ) : (
      <div class="pgrid">
        <div class="pgrid__main">{editing || !stored ? <DeclarationForm values={values} errors={errors} editing={Boolean(stored)} multipart>{signature}</DeclarationForm> : <Summary stored={stored} now={now} />}</div>
        <aside class="pgrid__side">
          <section class={`info poastate poastate--${state}`} aria-live="polite">
            <p class="poastate__text">{d.stateLead[state]}</p>
          </section>
        </aside>
      </div>
    )}
  </>
)
