// The adjustment of the deduction on investment property on an asset's page (vat-assets.ts, § 54 to § 54d): what its VAT
// was, how its use changed from a year, and each year of its period with what came of it.
import type { FC } from 'hono/jsx'
import { formatEurExact } from '../format'
import {
  ASSET_VAT_RATES,
  assetPlan,
  isFormer,
  lastYearOf,
  periodLength,
  shareText,
  type AssetPlanYear,
  type AssetUseErrors,
  type AssetUseValues,
  type AssetVat,
  type AssetVatErrors,
  type AssetVatValues,
} from '../app/vat-assets'

const Err: FC<{ text?: string }> = ({ text }) => (text ? <p class="field__error">{text}</p> : null)

const USE_NAMES: Record<string, string> = {
  taxable: 'na zdaniteľné plnenia (B = 1)',
  exempt: 'na plnenia oslobodené od dane bez nároku na odpočítanie (B = 0)',
  ratio: 'pomerne, koeficientom roka (§ 50)',
  share: 'iný podiel odpočítateľnej dane',
}

const STATE_NAMES: Record<AssetPlanYear['state'], string> = {
  first: 'prvotné použitie (oprava podľa § 53)',
  same: 'bez zmeny',
  below: 'rozdiel do 0,10: neupravuje sa (§ 54 ods. 6)',
  missing: 'chýba údaj',
  adjust: 'úprava',
  sale: 'dodanie majetku (§ 54 ods. 7)',
  after: 'po vyradení',
}

export interface AssetVatProps {
  base: string
  vat: AssetVat | null
  values: AssetVatValues
  errors: AssetVatErrors
  useValues: AssetUseValues
  useErrors: AssetUseErrors
  coefOf: (year: number) => number | null
  payer: boolean
  disposal: string | null
}

export const AssetVatSection: FC<AssetVatProps> = (p) => {
  const v = p.vat
  const plan = v ? assetPlan(v, p.coefOf) : null
  const n = v ? periodLength(v.account) : null
  return (
    <section class="info" id="dph" aria-labelledby="dph-t">
      <h2 id="dph-t" class="info__title">
        DPH: úprava odpočítanej dane (§ 54)
      </h2>
      <p class="info__lead">
        Ak sa investičný majetok počas obdobia na úpravu (5 rokov, pri stavbách 20 rokov vrátane roka prvotného použitia) použije inak ako pri prvotnom použití, odpočítaná daň sa upraví v poslednom
        zdaňovacom období roka: o pätinu alebo dvadsatinu rozdielu za rok, pri predaji za všetky zostávajúce roky naraz (príloha č. 1). Úprava ide do riadkov 18 až 19 priznania.
      </p>
      {!p.payer ? <p class="small">Firma nie je platiteľom DPH: úprava sa do priznania nedostane.</p> : null}
      <form class="stack asset-form" method="post" action={`${p.base}/dph`} novalidate>
        {p.errors.form ? (
          <p class="notice notice--error" role="alert">
            {p.errors.form}
          </p>
        ) : null}
        <div class="asset-form__grid">
          <label class="field">
            <span class="field__label">Sadzba dane</span>
            <select class="field__input" name="dph_sadzba">
              {ASSET_VAT_RATES.map((r) => (
                <option value={String(r)} selected={p.values.rate === String(r)}>{`${r} %`}</option>
              ))}
            </select>
            <Err text={p.errors.rate} />
          </label>
          <label class="field">
            <span class="field__label">Daň z obstarávacej ceny (DV) v eurách</span>
            <input class="field__input" name="dph_dv" value={p.values.dv} inputmode="decimal" autocomplete="off" aria-invalid={p.errors.dv ? 'true' : undefined} />
            <Err text={p.errors.dv} />
          </label>
          <label class="field">
            <span class="field__label">Rok prvotného použitia</span>
            <input class="field__input" name="dph_rok" value={p.values.firstYear} inputmode="numeric" maxlength={4} aria-invalid={p.errors.firstYear ? 'true' : undefined} />
            <Err text={p.errors.firstYear} />
          </label>
          <label class="field">
            <span class="field__label">Odpočítaný podiel pri prvotnom použití (A)</span>
            <input class="field__input" name="dph_odpocet" value={p.values.deducted} inputmode="decimal" autocomplete="off" aria-invalid={p.errors.deducted ? 'true' : undefined} />
            <Err text={p.errors.deducted} />
          </label>
          <label class="field">
            <span class="field__label">Podiel použitia na podnikanie vtedy</span>
            <input class="field__input" name="dph_podnikanie" value={p.values.business} inputmode="decimal" autocomplete="off" aria-invalid={p.errors.business ? 'true' : undefined} />
            <Err text={p.errors.business} />
          </label>
          <label class="field">
            <span class="field__label">Použitie v ďalších rokoch</span>
            <select class="field__input" name="dph_pouzitie">
              <option value="fixed" selected={p.values.regime === 'fixed'}>
                ako pri prvotnom použití, kým nezapíšete zmenu
              </option>
              <option value="ratio" selected={p.values.regime === 'ratio'}>
                pomerne, koeficientom každého roka (§ 50)
              </option>
            </select>
          </label>
          <label class="field asset-form__wide">
            <span class="field__label">Predaj alebo darovanie počas obdobia na úpravu (§ 54 ods. 7)</span>
            <select class="field__input" name="dph_predaj">
              <option value="" selected={p.values.sale === ''}>
                {p.disposal === 'sale' || p.disposal === 'gift' ? 'vyberte, ako bol majetok dodaný' : 'majetok nebol predaný ani darovaný'}
              </option>
              <option value="taxed" selected={p.values.sale === 'taxed'}>
                s daňou, alebo oslobodene s nárokom na odpočítanie (napríklad do iného štátu EÚ)
              </option>
              <option value="exempt" selected={p.values.sale === 'exempt'}>
                oslobodene bez nároku na odpočítanie (napríklad stavba po piatich rokoch, § 38)
              </option>
            </select>
          </label>
        </div>
        <p class="small">
          Podiel píšte ako 1, 0 alebo napríklad 0,74; zaokrúhľuje sa nahor na dve desatinné miesta. Pri majetku, ktorého obdobie na úpravu začalo do roku 2024, zapíšte rok, od ktorého plynie, a platia
          doterajšie pravidlá: úprava za všetky zostávajúce roky naraz (§ 85kp ods. 2).
        </p>
        <button class="btn btn--line" type="submit">
          {v ? 'Uložiť údaje DPH' : 'Zapísať údaje DPH'}
        </button>
      </form>
      {v ? (
        <>
          <h3 class="info__subtitle">Zmeny použitia</h3>
          {v.uses.length === 0 ? (
            <p class="small">{v.regime === 'ratio' ? 'Každý rok sa porovná koeficient roka s odpočítaným podielom.' : 'Majetok sa používa ako pri prvotnom použití.'}</p>
          ) : (
            <ul class="vissues">
              {v.uses.map((u) => (
                <li class="vissue">
                  <span class="vissue__text">
                    {`Od roku ${u.from}: ${USE_NAMES[u.use]}${u.use === 'share' && u.share !== null ? ` ${shareText(u.share)}` : ''}${u.business !== 100 ? `, na podnikanie ${shareText(u.business)}` : ''}`}
                  </span>
                  <form method="post" action={`${p.base}/dph/pouzitie/${u.id}/zrusit`}>
                    <button class="btn btn--text btn--small" type="submit">
                      Odstrániť
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}
          <form class="stack asset-form" method="post" action={`${p.base}/dph/pouzitie`} novalidate>
            <div class="asset-form__grid">
              <label class="field">
                <span class="field__label">Od roku</span>
                <input class="field__input" name="od" value={p.useValues.from} inputmode="numeric" maxlength={4} aria-invalid={p.useErrors.from ? 'true' : undefined} />
                <Err text={p.useErrors.from} />
              </label>
              <label class="field">
                <span class="field__label">Použitie</span>
                <select class="field__input" name="pouzitie">
                  {Object.entries(USE_NAMES).map(([id, name]) => (
                    <option value={id} selected={p.useValues.use === id}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              <label class="field">
                <span class="field__label">Podiel (pri inom podiele)</span>
                <input class="field__input" name="podiel" value={p.useValues.share} inputmode="decimal" autocomplete="off" aria-invalid={p.useErrors.share ? 'true' : undefined} />
                <Err text={p.useErrors.share} />
              </label>
              <label class="field">
                <span class="field__label">Podiel na podnikanie (§ 54a, § 54d)</span>
                <input class="field__input" name="podnikanie" value={p.useValues.business} inputmode="decimal" autocomplete="off" aria-invalid={p.useErrors.business ? 'true' : undefined} />
                <Err text={p.useErrors.business} />
              </label>
            </div>
            <button class="btn btn--line" type="submit">
              Zapísať zmenu použitia
            </button>
          </form>
          {plan && n ? (
            <>
              <h3 class="info__subtitle">{`Obdobie na úpravu ${v.firstYear} až ${lastYearOf(v)}${isFormer(v) ? ', doterajšie pravidlá' : ''}`}</h3>
              <div class="lscroll">
                <table class="ltable">
                  <thead>
                    <tr>
                      <th scope="col">Rok</th>
                      <th scope="col" class="num">
                        A
                      </th>
                      <th scope="col" class="num">
                        B
                      </th>
                      <th scope="col" class="num">
                        R
                      </th>
                      <th scope="col">Stav</th>
                      <th scope="col" class="num">
                        Odpočet navyše (+) / menej (−)
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.years.map((y) => (
                      <tr>
                        <td>{y.year}</td>
                        <td class="num">{shareText(y.a)}</td>
                        <td class="num">{y.b === null ? '' : shareText(y.b)}</td>
                        <td class="num">{y.r > 0 ? `${y.r}/${n}` : ''}</td>
                        <td>
                          {y.state === 'missing'
                            ? p.disposal === 'sale' || p.disposal === 'gift'
                              ? 'chýba, ako bol majetok dodaný'
                              : 'koeficient roka ešte nie je vysporiadaný'
                            : STATE_NAMES[y.state]}
                        </td>
                        <td class="num">{y.deduct !== 0 ? formatEurExact(y.deduct) : ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p class="small">Úprava roka ide do priznania za december (alebo 4. štvrťrok) a do kníh 31. decembra (548 proti 343.100), keď rok skončí.</p>
            </>
          ) : null}
          <form method="post" action={`${p.base}/dph/odstranit`}>
            <button class="btn btn--text" type="submit">
              Odstrániť údaje DPH, boli zapísané omylom
            </button>
          </form>
        </>
      ) : null}
    </section>
  )
}
