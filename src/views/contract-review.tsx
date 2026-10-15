import type { FC } from 'hono/jsx'
import { PLANS } from '../config'
import type { OrderReview } from '../contracts'
import type { Order } from '../order'
import { Heading } from './inside'

export const ContractReviewPage: FC<{
  requestId: string
  order: Order | null
  offerHash: string
  review: OrderReview | null
  people: { id: string; name: string }[]
  released: boolean
  error?: string
}> = ({ requestId, order, offerHash, review, people, released, error }) => (
  <>
    <a class="back" href="/ucto/ziadosti">
      Žiadosti z webu
    </a>
    <header class="phead">
      <Heading first="Posúdenie" second="pred podpisom" />
      <p class="phead__lead">{order?.company ?? 'Pre túto žiadosť nie je otvorená online objednávka.'}</p>
    </header>
    {!released ? <p class="notice">Podpisovanie je zablokované: chýba platné schválenie tohto znenia a cenníka po právnom a poistnom posúdení.</p> : null}
    {review ? (
      <p class="notice">
        Posledné rozhodnutie: {review.decision === 'standard' ? 'štandardný balík' : review.decision === 'bespoke' ? 'individuálny rozsah' : 'pozastavené'}.
        Nové rozhodnutie predchádzajúce nenahrádza v histórii.
      </p>
    ) : null}
    {error ? (
      <p class="notice notice--error" role="alert">
        {error}
      </p>
    ) : null}
    {order && order.status === 'open' ? (
      <form class="details" method="post" action={`/ucto/ziadosti/${requestId}/posudenie`}>
        <input type="hidden" name="proposal" value={offerHash} />
        <p>
          Štandardné prijatie je určené iba pre odborne overenú mikro účtovnú jednotku v podporovanom rozsahu. Obrat sám nestačí. Audit, IFRS, skupina alebo
          nepokrytá agenda vyžadujú individuálne riešenie.
        </p>
        <div class="field">
          <label class="field__label" for="review-decision">
            Rozhodnutie
          </label>
          <select class="field__input" id="review-decision" name="decision" required>
            <option value="hold">Pozastaviť do doplnenia podkladov</option>
            <option value="bespoke">Pripraviť individuálnu službu</option>
            <option value="standard">Schváliť štandardný balík</option>
          </select>
        </div>
        <div class="field">
          <label class="field__label" for="review-plan">
            Posúdený balík
          </label>
          <select class="field__input" id="review-plan" name="plan">
            {PLANS.map((p) => (
              <option value={p.id} selected={p.id === order.plan}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div class="field">
          <label class="field__label" for="review-accountant">
            Zodpovedná účtovníčka alebo účtovník
          </label>
          <select class="field__input" id="review-accountant" name="accountant">
            <option value="">Vyberte člena tímu</option>
            {people.map((p) => (
              <option value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <div class="field">
          <label class="field__label" for="review-evidence">
            Referencia na podpísané odborné posúdenie
          </label>
          <input class="field__input" id="review-evidence" name="evidence" maxlength={240} required aria-describedby="review-evidence-hint" />
          <p class="small" id="review-evidence-hint">
            Použite interné číslo alebo zabezpečený odkaz. Správa má doložiť kategóriu a obdobia, audit, rozsah, riziká, mandát, kapacitu tímu a posúdenie
            konkrétneho klienta voči poistke. Účtovné doklady ani osobné údaje sem nevkladajte.
          </p>
        </div>
        <fieldset class="field choice">
          <legend class="field__label">Pre schválenie štandardného balíka potvrďte všetky kontroly</legend>
          {[
            ['category', 'Kategória mikro a podmienky príslušných období sú overené; nejde o povinný audit, IFRS ani konsolidáciu.'],
            ['scope', 'Dohodnutá agenda, objem, mzdy, DPH a migrácia sú podporované; je určený zástupca a nezávislá kontrola.'],
            ['cover', 'Riziko tohto klienta a rozsah zmluvy sú posúdené voči skutočnému krytiu a finančnej kapacite.'],
            ['authority', 'Konanie za firmu vrátane prípadného spoločného podpisovania je overené. Jeden online podpis je pre túto firmu postačujúci.'],
          ].map(([name, label]) => (
            <label class="agree">
              <input type="checkbox" name={name} value="1" />
              <span>{label}</span>
            </label>
          ))}
        </fieldset>
        <p class="small">
          Potvrdenie je záznam ľudského rozhodnutia, nie automatické overenie pravdivosti podkladov. Platí najviac sedem dní, pre tento návrh a balík; prijatie
          zmluvy ešte nenahrádza AML a plnú moc pred začatím služby.
        </p>
        <button class="btn btn--blue" type="submit">
          Uložiť posúdenie
        </button>
      </form>
    ) : null}
  </>
)
