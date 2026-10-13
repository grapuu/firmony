// Firma a nastavenia: the company's details as we keep them, its address for documents, its people (an owner
// invites a partner or a colleague), the reminders, the app on the phone, the other companies, signing out.
import type { FC } from 'hono/jsx'
import { app, dayName } from '../app/copy'
import type { PoaState } from '../app/papers'
import type { Company, Person } from '../app/store'
import { Flash, Heading, planName } from './inside'
import { dayOf } from './inside-pages'

export interface CompanyPageProps {
  company: Company
  people: Person[]
  me: Person
  companies: { id: string; name: string }[]
  inbox: string
  invite: { name: string; email: string }
  errors: { name?: string; email?: string; form?: string }
  flash?: string | null
  /** Where the power of attorney stands. */
  poa: PoaState
}

const POA_PILL: Record<PoaState, string> = { missing: 'pill--amber', waiting: 'pill--blue', checked: 'pill--ok' }

const c = app.company

export const CompanyPage: FC<CompanyPageProps> = ({ company, people, me, companies, inbox, invite, errors, flash, poa }) => {
  const owner = me.role === 'owner'
  const others = companies.filter((other) => other.id !== company.id)
  return (
    <>
      <header class="phead">
        <Heading first={c.title} second={c.serif} />
        <p class="phead__lead">{c.lead}</p>
      </header>
      <Flash text={flash} />
      <Flash text={errors.form} tone="error" />
      <div class="pgrid">
        <div class="pgrid__main">
          <section class="info" id="udaje" aria-labelledby="udaje-t">
            <h2 id="udaje-t" class="info__title">
              {c.details}
            </h2>
            <dl class="kv">
              <div>
                <dt>{c.name}</dt>
                <dd class="kv__long">{company.name}</dd>
              </div>
              <div>
                <dt>{c.ico}</dt>
                <dd>{company.ico ?? c.none}</dd>
              </div>
              <div>
                <dt>{c.dic}</dt>
                <dd>{company.dic ?? c.none}</dd>
              </div>
              <div>
                <dt>{c.icdph}</dt>
                <dd>{company.icdph ?? (company.vatPayer ? c.none : c.vatNo)}</dd>
              </div>
              {company.address ? (
                <div>
                  <dt>{c.address}</dt>
                  <dd class="kv__long">{company.address}</dd>
                </div>
              ) : null}
              <div>
                <dt>{c.plan}</dt>
                <dd>{planName(company.plan)}</dd>
              </div>
              <div>
                <dt>{c.vat}</dt>
                <dd>{company.vatPayer ? c.vatYes : c.vatNo}</dd>
              </div>
              <div>
                <dt>{c.accountant}</dt>
                <dd>{company.accountantName ?? c.none}</dd>
              </div>
            </dl>
            <p class="info__source">
              {c.detailsLead}{' '}
              <a class="link" href="/app/spravy">
                {app.home.write}
              </a>
            </p>
          </section>

          <section class="info" id="zmluva" aria-labelledby="zmluva-t">
            <h2 id="zmluva-t" class="info__title">
              {app.contract.title}
            </h2>
            <dl class="kv">
              <div>
                <dt>{app.contract.label}</dt>
                <dd class="kv__long">{company.contractAt && company.signedBy ? app.contract.concluded(dayName(dayOf(company.contractAt)), company.signedBy) : app.contract.offline}</dd>
              </div>
              {company.startOn ? (
                <div>
                  <dt>{app.contract.start}</dt>
                  <dd>{dayName(company.startOn)}</dd>
                </div>
              ) : null}
              <div>
                <dt>{app.contract.terms}</dt>
                <dd>
                  <a class="link" href="/podmienky">
                    {company.termsVersion ? app.contract.termsVersion(company.termsVersion) : app.contract.terms}
                  </a>
                </dd>
              </div>
              <div>
                <dt>{app.contract.poa}</dt>
                <dd class="kv__long">
                  <span class={`pill ${POA_PILL[poa]}`}>{app.poa.state[poa]}</span>{' '}
                  <a class="link" href="/app/plna-moc">
                    {app.contract.poaOpen}
                  </a>
                </dd>
              </div>
            </dl>
            <p class="info__source">
              <a class="link" href="/app/prechod">
                {app.contract.switching}
              </a>
              . {app.contract.switchingLead}
            </p>
          </section>

          <section class="info" id="doklady-emailom" aria-labelledby="mail-t">
            <h2 id="mail-t" class="info__title">
              {c.inbox}
            </h2>
            <p class="info__lead">{c.inboxLead}</p>
            <p class="copyline">
              <span class="copyline__text">{inbox}</span>
              <button class="copyline__button" type="button" data-copy={inbox} data-done={app.add.copied} hidden>
                {app.add.copy}
              </button>
            </p>
            <p class="info__source">{c.inboxAuto}</p>
          </section>

          <section class="info" id="ludia" aria-labelledby="ludia-t">
            <h2 id="ludia-t" class="info__title">
              {c.people}
            </h2>
            <p class="info__lead">{c.peopleLead}</p>
            <ul class="plain">
              {people.map((person) => (
                <li class="plain__row plain__row--person">
                  <span class="plain__who">
                    <span class="plain__name">
                      {person.name}
                      {person.id === me.id ? <span class="plain__you"> ({c.you})</span> : null}
                    </span>
                    <span class="plain__mail">{person.email}</span>
                  </span>
                  <span class="pill pill--grey">{person.role === 'owner' ? c.owner : c.member}</span>
                  {owner && person.role !== 'owner' ? (
                    <form method="post" action={`/app/firma/ludia/${person.id}/odobrat`}>
                      <button class="btn btn--text btn--small" type="submit">
                        {c.remove}
                      </button>
                    </form>
                  ) : null}
                </li>
              ))}
            </ul>
            {owner ? (
              <form class="stack invite" method="post" action="/app/firma/pozvat" novalidate>
                <p class="invite__title">{c.invite}</p>
                <div class="fgrid">
                  <div class="fgrid__cell">
                    <label class="field__label" for="pozvat-meno">
                      {c.inviteName}
                    </label>
                    <input id="pozvat-meno" class="field__input" name="meno" value={invite.name} maxlength={120} autocomplete="off" aria-invalid={errors.name ? 'true' : undefined} />
                    {errors.name ? <p class="field__error">{errors.name}</p> : null}
                  </div>
                  <div class="fgrid__cell">
                    <label class="field__label" for="pozvat-email">
                      {c.inviteEmail}
                    </label>
                    <input id="pozvat-email" class="field__input" type="email" name="email" value={invite.email} maxlength={200} autocomplete="off" aria-invalid={errors.email ? 'true' : undefined} />
                    {errors.email ? <p class="field__error">{errors.email}</p> : null}
                  </div>
                </div>
                <button class="btn btn--blue stack__submit" type="submit">
                  {c.inviteButton}
                </button>
              </form>
            ) : (
              <p class="info__source">{c.onlyOwner}</p>
            )}
          </section>

          <section class="info" id="pripomienky" aria-labelledby="pripomienky-t">
            <h2 id="pripomienky-t" class="info__title">
              {c.reminders}
            </h2>
            <p class="info__lead">{c.remindersLead}</p>
            <form class="inline" method="post" action="/app/firma/pripomienky">
              <input type="hidden" name="poslane" value="1" />
              <label class="tickbox">
                <input type="checkbox" name="zapnut" value="1" checked={me.reminders} />
                <span>{c.remindersOn}</span>
              </label>
              <button class="btn btn--line btn--small" type="submit">
                {c.remindersSave}
              </button>
            </form>
          </section>
        </div>

        <aside class="pgrid__side">
          <section class="info" id="mobil" aria-labelledby="mobil-t">
            <h2 id="mobil-t" class="info__title">
              {c.phone}
            </h2>
            <p class="info__lead">{c.phoneLead}</p>
            <ul class="steps">
              <li>{c.phoneIos}</li>
              <li>{c.phoneAndroid}</li>
            </ul>
          </section>
          {others.length > 0 ? (
            <section class="info" aria-labelledby="firmy-t">
              <h2 id="firmy-t" class="info__title">
                {c.switch}
              </h2>
              <p class="info__lead">{c.switchLead}</p>
              <ul class="plain">
                {others.map((other) => (
                  <li class="plain__row plain__row--person">
                    <span class="plain__name">{other.name}</span>
                    <form method="post" action="/app/firma/prepnut">
                      <input type="hidden" name="firma" value={other.id} />
                      <button class="btn btn--line btn--small" type="submit">
                        {c.switchTo}
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          <section class="info" aria-label={c.signOut}>
            <p class="info__lead">
              {me.name}, {me.email}
            </p>
            <form method="post" action="/app/odhlasit">
              <button class="btn btn--line" type="submit">
                {c.signOut}
              </button>
            </form>
          </section>
        </aside>
      </div>
    </>
  )
}
