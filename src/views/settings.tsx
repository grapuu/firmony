// Firma a nastavenia: the company's details as we keep them, its address for documents, its people (an owner
// invites a partner or a colleague), the reminders, the app on the phone, the other companies, signing out.
import type { FC } from 'hono/jsx'
import { signerRole } from '../rpo'
import { FORMATION, OFFLINE_TERMS, planById } from '../config'
import { formatEur, formatEurExact, typeset } from '../format'
import { exitMonths } from '../team/billing'
import { app, dayName, whenName } from '../app/copy'
import type { Ending } from '../app/ending'
import type { Paper, PoaState } from '../app/papers'
import type { DeclarationState } from '../app/aml'
import type { Company, Person } from '../app/store'
import { Flash, Heading, planName } from './inside'
import { dayOf } from './inside-pages'
import type { ExportReceipt } from '../app/handover-store'
import type { BillRow } from '../team/billing-store'
import { ClientBills } from './billing'

export interface CompanyPageProps {
  /** The company's place in the Peppol network (views/peppol.tsx), under its data. */
  peppol?: unknown
  company: Company
  people: Person[]
  me: Person
  companies: { id: string; name: string }[]
  inbox: string
  invite: { name: string; email: string }
  errors: { name?: string; email?: string; form?: string; notice?: string }
  flash?: string | null
  /** Where the power of attorney stands. */
  poa: PoaState
  /** Where the declaration for the law against money laundering stands. */
  declaration: DeclarationState
  today: string
  /** The last day of the contract if notice were given today. */
  noticeEnd: string
  /** The contract's end, once it has a last day. */
  ending: Ending | null
  /** The years there is anything to download, the newest first, and the books the accountant handed over. */
  years: string[]
  handover: Paper[]
  receipts?: ExportReceipt[]
  downloadError?: string | null
  /** Firmony's invoices to the company. */
  bills?: BillRow[]
}

const POA_PILL: Record<PoaState, string> = { missing: 'pill--amber', waiting: 'pill--blue', checked: 'pill--ok' }

/** What follows the contract's last day, in four lines (point 10.4 of the terms). */
const AfterEnd: FC<{ ending: Ending }> = ({ ending }) => {
  const e = app.ending
  return (
    <>
      <dl class="kv kv--end">
        <div>
          <dt>{e.last}</dt>
          <dd>{dayName(ending.endsOn)}</dd>
        </div>
        <div>
          <dt>{e.intake}</dt>
          <dd>{e.intakeValue(dayName(ending.intakeUntil))}</dd>
        </div>
        <div>
          <dt>{e.handover}</dt>
          <dd>{e.handoverValue(dayName(ending.handoverBy))}</dd>
        </div>
        <div>
          <dt>{e.access}</dt>
          <dd>
            <a class="link" href="#stiahnut">
              {e.accessValue(dayName(ending.accessUntil))}
            </a>
          </dd>
        </div>
      </dl>
      <p class="info__source">{e.kept}</p>
    </>
  )
}

/**
 * A company formed through the s. r. o. for 1 € that gives notice before its commitment ends: the exit fee the notice
 * brings (article 7 of the formation contract), said before the notice is given, and that its deposit is set off.
 */
const ExitFee: FC<{ company: Company; end: string }> = ({ company, end }) => {
  const plan = planById(company.plan)
  if (!company.foundingId || !company.startOn || !plan) return null
  const months = exitMonths(company.startOn, end, FORMATION.commitMonths, FORMATION.exitMaxMonths)
  if (months <= 0) return null
  return (
    <p class="notice">
      {typeset(
        `Firma je podľa zmluvy o založení viazaná na ${FORMATION.commitMonths} mesiacov. Pri výpovedi teraz zaplatí odstupné ${formatEur(months * plan.price * 100)} (${months} × ${formatEur(plan.price * 100)}). Odpočítame z neho zvyšok kaucie.`,
      )}
    </p>
  )
}

/** The notice: given (with taking it back while the contract runs), or the way to give it, folded away. */
const Notice: FC<{ company: Company; owner: boolean; today: string; end: string; ending: Ending | null; error?: string }> = ({ company, owner, today, end, ending, error }) => {
  const n = app.notice
  if (ending && ending.side === 'firmony') {
    return (
      <div class="notice-box notice-box--given">
        <p class="notice-box__text">{n.byUs(dayName(ending.endsOn))}</p>
        <AfterEnd ending={ending} />
      </div>
    )
  }
  if (company.noticeAt && company.endsOn) {
    return (
      <div class="notice-box notice-box--given">
        <p class="notice-box__text">{n.given(dayName(dayOf(company.noticeAt)), dayName(company.endsOn))}</p>
        {ending ? <AfterEnd ending={ending} /> : null}
        {owner && company.endsOn >= today ? (
          <form method="post" action="/app/firma/vypoved/spat">
            <p class="notice-box__text">{n.withdrawLead}</p>
            <button class="btn btn--line btn--small" type="submit">
              {n.withdraw}
            </button>
          </form>
        ) : null}
        {error ? <p class="field__error">{error}</p> : null}
      </div>
    )
  }
  return (
    <details class="more more--quiet notice-box" open={Boolean(error)}>
      <summary class="more__summary">{n.title}</summary>
      <div class="more__body">
        {owner ? (
          <form class="stack" method="post" action="/app/firma/vypoved" novalidate>
            <p class="info__lead">{n.lead(dayName(end))}</p>
            <ExitFee company={company} end={end} />
            <label class="tickbox tickbox--top">
              <input type="checkbox" name="potvrdit" value="1" aria-invalid={error ? 'true' : undefined} />
              <span>{n.confirm}</span>
            </label>
            {error ? <p class="field__error">{error}</p> : null}
            <button class="btn btn--line stack__submit" type="submit">
              {n.button}
            </button>
          </form>
        ) : (
          <p class="info__lead">{n.onlyOwner}</p>
        )}
      </div>
    </details>
  )
}

const c = app.company

/** Everything of the company, a year at a time, and the books the accountant handed over at the end. */
const Download: FC<{ years: string[]; handover: Paper[]; today: string; owner: boolean; receipts: ExportReceipt[]; error?: string | null }> = ({ years, handover, today, owner, receipts, error }) => {
  const d = app.download
  return (
    <section class="info" id="stiahnut" aria-labelledby="stiahnut-t">
      <h2 id="stiahnut-t" class="info__title">
        {d.title}
      </h2>
      <p class="info__lead">{d.lead}</p>
      <p class="info__source">{d.receiptLead} <a class="link" href="/app/firma#stiahnut">{d.refresh}</a></p>
      {error ? <p class="field__error">{error}</p> : null}
      {!owner ? <p class="info__source">{d.onlyOwner}</p> : years.length === 0 ? (
        <p class="info__empty">{d.empty}</p>
      ) : (
        <ul class="plain">
          {years.map((year) => (
            <li class="plain__row plain__row--person">
              <span class="plain__name">{d.year(year)}</span>
              <a class="btn btn--line btn--small" href={`/app/export?rok=${year}`} download>
                {d.button}
              </a>
            </li>
          ))}
        </ul>
      )}
      {receipts.map((receipt) => receipt.confirmed ? <p class="info__source">{d.confirmed(receipt.year)}</p> : owner ? (
        <form class="stack" method="post" action="/app/export/potvrdit">
          <input type="hidden" name="export" value={receipt.id} />
          <label class="tickbox"><input type="checkbox" name="potvrdit" value="1" /><span>{d.confirm(receipt.year)}</span></label>
          <button class="btn btn--line btn--small" type="submit">{d.confirmButton}</button>
        </form>
      ) : null)}
      {handover.length > 0 ? (
        <>
          <h3 class="info__subtitle">{d.handover}</h3>
          <p class="info__source">{d.handoverLead}</p>
          <ul class="plain">
            {handover.map((paper) => (
              <li class="plain__row plain__row--two">
                <a class="link plain__name" href={`/app/odovzdanie/${paper.id}`} download>
                  {paper.fileName}
                </a>
                <span class="plain__sub">
                  <span>{whenName(paper.createdAt, today)}</span>
                  {paper.createdByName ? <span>{paper.createdByName}</span> : null}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  )
}

/** Cents as typed in a field: 5000 or 1250,50. */
const moneyField = (cents: number): string => (cents % 100 === 0 ? String(cents / 100) : `${Math.floor(cents / 100)},${String(cents % 100).padStart(2, '0')}`)

export const CompanyPage: FC<CompanyPageProps> = ({ peppol = null, company, people, me, companies, inbox, invite, errors, flash, poa, declaration, today, noticeEnd, ending, years, handover, receipts = [], downloadError, bills = [] }) => {
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
          {peppol as never}

          <section class="info" id="zmluva" aria-labelledby="zmluva-t">
            <h2 id="zmluva-t" class="info__title">
              {app.contract.title}
            </h2>
            <dl class="kv">
              <div>
                <dt>{app.contract.label}</dt>
                <dd class="kv__long">{company.termsVersion === OFFLINE_TERMS && company.signedBy
                    ? app.contract.paper(company.signedBy)
                    : company.contractAt && company.signedBy
                      ? app.contract.concluded(dayName(dayOf(company.contractAt)), company.signedBy, signerRole(company.legalForm, company.signedRole))
                      : app.contract.offline}</dd>
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
                  <a class="link" href="/app/zmluva">
                    {company.termsVersion ? app.contract.termsVersion(company.termsVersion) : app.contract.open}
                  </a>
                </dd>
              </div>
              <div>
                <dt>{app.contract.declaration}</dt>
                <dd class="kv__long">
                  <span class={`pill ${POA_PILL[declaration]}`}>{app.declaration.state[declaration]}</span>{' '}
                  <a class="link" href="/app/vyhlasenie">
                    {app.contract.poaOpen}
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
            <Notice company={company} owner={owner} today={today} end={noticeEnd} ending={ending} error={errors.notice} />
          </section>

          <ClientBills rows={bills} today={today} />

          <Download years={years} handover={handover} today={today} error={downloadError} owner={owner} receipts={receipts} />

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

          <section class="info" id="schvalovanie" aria-labelledby="schvalovanie-t">
            <h2 id="schvalovanie-t" class="info__title">
              {c.approvals}
            </h2>
            <p class="info__lead">{c.approvalsLead}</p>
            {owner ? (
              <form class="stack approvals__form" method="post" action="/app/firma/schvalovanie" novalidate>
                <label class="tickbox">
                  <input type="checkbox" name="zapnut" value="1" checked={company.approvals} />
                  <span>{c.approvalsOn}</span>
                </label>
                <div class="fgrid">
                  <div class="fgrid__cell">
                    <label class="field__label" for="dve-od">
                      {c.approvalsTwo}
                    </label>
                    <input id="dve-od" class="field__input" name="dve_od" value={company.approvalTwoFrom ? moneyField(company.approvalTwoFrom) : ''} inputmode="decimal" maxlength={20} />
                    <p class="field__hint">{c.approvalsTwoHint}</p>
                  </div>
                </div>
                <input type="hidden" name="schvalovatelia" value="1" />
                <p class="invite__title">{c.approvers}</p>
                <p class="info__source">{c.approversLead}</p>
                {people.filter((p) => p.role !== 'owner').length === 0 ? <p class="info__source">{c.approversNone}</p> : null}
                {people
                  .filter((p) => p.role !== 'owner')
                  .map((person) => (
                    <div class="fgrid approvals__person">
                      <div class="fgrid__cell">
                        <label class="tickbox">
                          <input type="checkbox" name={`schvalovatel_${person.id}`} value="1" checked={Boolean(person.approver)} />
                          <span>
                            {person.name}: {c.approver}
                          </span>
                        </label>
                      </div>
                      <div class="fgrid__cell">
                        <label class="field__label" for={`limit-${person.id}`}>
                          {c.approverLimit}
                        </label>
                        <input
                          id={`limit-${person.id}`}
                          class="field__input"
                          name={`limit_${person.id}`}
                          value={person.approveLimit ? moneyField(person.approveLimit) : ''}
                          inputmode="decimal"
                          maxlength={20}
                        />
                        <p class="field__hint">{c.approverLimitHint}</p>
                      </div>
                    </div>
                  ))}
                <button class="btn btn--line btn--small" type="submit">
                  {c.remindersSave}
                </button>
              </form>
            ) : (
              <>
                <p class="info__source">{c.approvalsState(company.approvals)}</p>
                {company.approvals ? <p class="info__source">{c.approvalsShow(company.approvalTwoFrom ? formatEurExact(company.approvalTwoFrom) : null)}</p> : null}
                {me.approver ? <p class="info__source">{c.approverOf(me.approveLimit ? formatEurExact(me.approveLimit) : null)}</p> : null}
              </>
            )}
            {company.approvals ? (
              <p class="info__source">
                <a class="link" href="/app/schvalovanie">
                  {app.approvalsQueue.link}
                </a>
              </p>
            ) : null}
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
