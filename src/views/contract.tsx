// Display acceptance-time evidence. Current terms and tariffs must never stand in for a missing old contract.
import type { FC } from 'hono/jsx'
import { signerRole } from '../rpo'
import type { ResolvedContract } from '../contracts'
import { formatEur } from '../format'
import { app, dayName, whenName } from '../app/copy'
import type { Company } from '../app/store'
import { Heading } from './inside'

const p = app.contractPage
export interface ContractOrder {
  plan: string
  priceCents: number | null
  acceptedAt: number | null
  signedBy: string | null
  signedRole?: string | null
  startOn: string | null
  termsVersion: string | null
}
export const ContractPage: FC<{ company: Company; order: ContractOrder | null; contract: ResolvedContract; paper?: boolean }> = ({ company, order, contract, paper }) => {
  const s = contract.snapshot
  const signedAt = s?.acceptedAt ?? order?.acceptedAt ?? company.contractAt
  const signedBy = s?.signedBy ?? order?.signedBy ?? company.signedBy
  const startOn = s?.startOn ?? order?.startOn ?? company.startOn
  const price = s?.plan.monthlyCents ?? order?.priceCents
  return (
    <>
      <a class="back" href="/app/firma#zmluva">
        {app.company.title}
      </a>
      <header class="phead">
        <Heading first={p.title} second={p.serif} />
        <p class="phead__lead">{p.lead}</p>
      </header>
      <p class={`notice contract-status ${contract.status === 'snapshot' ? 'contract-status--saved' : contract.status === 'corrupt' ? 'notice--error' : ''}`} role="status">
        {contract.notice}
      </p>
      {paper ? <p class="notice" role="note">Zmluvu ste podpísali na stretnutí. <a class="link" href="/app/zmluva/foto" target="_blank" rel="noopener">Fotka podpísanej zmluvy</a></p> : null}
      <div class="invoice">
        <div class="invoice__paper">
          <article class="sheet deed contract" aria-label={contract.terms?.title ?? p.title}>
            <h2 class="deed__title">{contract.terms?.title ?? p.title}</h2>
            {contract.terms ? <p class="contract__sub">{contract.terms.subtitle}</p> : null}
            <section class="contract__points" aria-labelledby="body-t">
              <h3 id="body-t" class="contract__heading">
                {p.points}
              </h3>
              <dl class="kv">
                <div>
                  <dt>{p.company}</dt>
                  <dd class="kv__long">
                    {s?.client.name ?? company.name}
                    {s?.client.ico ? `, IČO ${s.client.ico}` : ''}
                  </dd>
                </div>
                {price !== null && price !== undefined ? (
                  <div>
                    <dt>{p.plan}</dt>
                    <dd class="kv__long">
                      {s
                        ? `${s.plan.name}, ${p.price(formatEur(price), s.plan.docs)}`
                        : `${order?.plan ?? company.plan}, ${formatEur(price)} mesačne bez DPH; historický rozsah balíka treba overiť.`}
                    </dd>
                  </div>
                ) : null}
                {s ? (
                  <>
                    <div>
                      <dt>{p.payroll}</dt>
                      <dd class="kv__long">{p.payrollValue(formatEur(s.catalogue.payrollCents))}</dd>
                    </div>
                    <div>
                      <dt>{p.closing}</dt>
                      <dd class="kv__long">{p.closingValue(formatEur(s.catalogue.closingCents))}</dd>
                    </div>
                  </>
                ) : (
                  <div>
                    <dt>Cenník pri uzavretí</dt>
                    <dd class="kv__long">Úplný cenník sa neukladal. Aktuálne ceny ho nenahrádzajú.</dd>
                  </div>
                )}
                {startOn ? (
                  <div>
                    <dt>{p.start}</dt>
                    <dd>{dayName(startOn)}</dd>
                  </div>
                ) : null}
                <div>
                  <dt>{p.concluded}</dt>
                  <dd class="kv__long">{signedAt && signedBy ? p.concludedValue(whenName(signedAt, '1900-01-01'), signedBy, signerRole(company.legalForm, order?.signedRole ?? company.signedRole)) : p.offline}</dd>
                </div>
                {company.endsOn ? (
                  <div>
                    <dt>{p.ends}</dt>
                    <dd>{dayName(company.endsOn)}</dd>
                  </div>
                ) : null}
              </dl>
            </section>
            {contract.terms?.sections.map((section, i) => (
              <section class="contract__section" id={`clanok-${i + 1}`}>
                <h3 class="contract__heading">
                  {i + 1}. {section.title}
                </h3>
                <ol class="terms__points">
                  {section.points.map((point, j) => (
                    <li id={`bod-${i + 1}-${j + 1}`}>
                      <span class="terms__number">
                        {i + 1}.{j + 1}
                      </span>
                      <span>{point}</span>
                    </li>
                  ))}
                </ol>
              </section>
            ))}
          </article>
        </div>
        <aside class="invoice__side">
          <section class="info" aria-label={p.print}>
            <button class="btn btn--blue invoice__wide" type="button" data-print hidden>
              {p.print}
            </button>
            {contract.sha256 ? <p class="info__source contract__digest">SHA-256: {contract.sha256}</p> : null}
            <p class="info__source">
              {p.question}{' '}
              <a class="link" href="/app/spravy">
                {app.home.write}
              </a>
            </p>
          </section>
        </aside>
      </div>
    </>
  )
}
