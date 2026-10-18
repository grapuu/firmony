// The register of fixed assets (17 October 2026): every asset with its depreciation in the books and for tax, a form
// to add one, and each asset's page with its plan year by year, its changes and its disposal. assets.ts has the rules.
import type { Child, FC } from 'hono/jsx'
import type { Company } from '../app/store'
import { dayName } from '../app/copy'
import { ASSET_ACCOUNTS, GROUP_YEARS, CAR_LIMIT_CENTS, DISPOSALS, assetKind, bookMonths, bookState, taxSchedule, type Asset, type AssetYear, type Disposal } from '../app/assets'
import { formatEurExact } from '../format'
import { LedgerHead, bookPath } from './ledger'
import { CenterSelect } from './centers'
import type { CostCenter } from '../app/centers'

export const ACCOUNT_NAMES: Record<keyof typeof ASSET_ACCOUNTS, string> = {
  '022': '022 Samostatné hnuteľné veci (stroje, autá, technika)',
  '021': '021 Stavby',
  '029': '029 Ostatný dlhodobý hmotný majetok',
  '013': '013 Softvér',
  '014': '014 Oceniteľné práva',
  '019': '019 Ostatný dlhodobý nehmotný majetok',
}
const GROUP_HINTS: Record<number, string> = {
  0: 'elektromobil, plug-in hybrid, elektrobicykel',
  1: 'osobné auto, počítač a kancelárska technika',
  2: 'nábytok, stroje, nákladné vozidlá',
  3: 'výrobné zariadenia, motory',
  4: 'montované a jednoduché stavby',
  5: 'budovy a stavby podľa prílohy č. 1',
  6: 'budovy a stavby podľa prílohy č. 1',
}
export const DISPOSAL_NAMES: Record<Disposal, string> = { sale: 'predaj', liquidation: 'likvidácia', damage: 'škoda alebo krádež', gift: 'darovanie' }
const eur = (cents: number) => formatEurExact(cents)

export interface AssetValues {
  name: string
  account: string
  inUseOn: string
  cost: string
  group: string
  method: string
  car: boolean
  books: 'tax' | 'months'
  months: string
  source: 'purchase' | 'opening'
  priorBook: string
  priorTax: string
  priorYears: string
  note: string
  /** The cost centre it serves ('' none). */
  center?: string
}
export type AssetFormErrors = Partial<Record<'name' | 'account' | 'inUseOn' | 'cost' | 'group' | 'method' | 'months' | 'prior' | 'disposal' | 'center' | 'form', string>>

export const emptyAssetValues = (today: string): AssetValues => ({
  name: '', account: '022', inUseOn: today, cost: '', group: '1', method: 'straight', car: false, books: 'tax', months: '', source: 'purchase', priorBook: '', priorTax: '', priorYears: '', note: '',
})
const money = (cents: number) => (cents / 100).toFixed(2).replace('.', ',')
export const valuesOf = (a: Asset & { note?: string | null }): AssetValues => ({
  name: a.name, account: a.account, inUseOn: a.inUseOn, cost: money(a.costCents), group: a.taxGroup === null ? '' : String(a.taxGroup), method: a.taxMethod, car: a.car,
  books: a.bookMonths === null ? 'tax' : 'months', months: a.bookMonths === null ? '' : String(a.bookMonths), source: a.source,
  priorBook: a.priorBookCents ? money(a.priorBookCents) : '', priorTax: a.priorTaxCents ? money(a.priorTaxCents) : '', priorYears: a.priorTaxYears ? String(a.priorTaxYears) : '', note: a.note ?? '',
  center: a.centerId ?? '',
})

const Err: FC<{ text?: string }> = ({ text }) => (text ? <p class="field__error">{text}</p> : null)

/** The form of an asset: what it is, when it was put in use and for how much, and how it is depreciated. */
const AssetForm: FC<{ action: string; values: AssetValues; errors: AssetFormErrors; submit: string; centers?: CostCenter[] }> = ({ action, values: v, errors: e, submit, centers = [] }) => (
  <form class="stack asset-form" method="post" action={action} novalidate>
    {e.form ? (
      <p class="notice notice--error" role="alert">
        {e.form}
      </p>
    ) : null}
    <div class="asset-form__grid">
      <label class="field asset-form__wide">
        <span class="field__label">Názov</span>
        <input class="field__input" name="nazov" value={v.name} maxlength={160} aria-invalid={e.name ? 'true' : undefined} />
        <Err text={e.name} />
      </label>
      <label class="field">
        <span class="field__label">Účet</span>
        <select class="field__input" name="ucet">
          {Object.entries(ACCOUNT_NAMES).map(([id, name]) => (
            <option value={id} selected={v.account === id}>
              {name}
            </option>
          ))}
        </select>
        <Err text={e.account} />
      </label>
      <label class="field">
        <span class="field__label">Deň zaradenia do užívania</span>
        <input class="field__input" type="date" name="zaradenie" value={v.inUseOn} aria-invalid={e.inUseOn ? 'true' : undefined} />
        <Err text={e.inUseOn} />
      </label>
      <label class="field">
        <span class="field__label">Vstupná cena v eurách</span>
        <input class="field__input" name="cena" value={v.cost} inputmode="decimal" autocomplete="off" aria-invalid={e.cost ? 'true' : undefined} />
        <Err text={e.cost} />
      </label>
      <label class="field">
        <span class="field__label">Odpisová skupina (hmotný majetok)</span>
        <select class="field__input" name="skupina">
          <option value="" selected={v.group === ''}>
            nehmotný majetok, bez skupiny
          </option>
          {Object.keys(GROUP_YEARS).map((g) => (
            <option value={g} selected={v.group === g}>
              {`${g}: ${GROUP_YEARS[Number(g)]} ${Number(g) === 0 ? 'roky' : 'rokov'}, ${GROUP_HINTS[Number(g)]}`}
            </option>
          ))}
        </select>
        <Err text={e.group} />
      </label>
      <label class="field">
        <span class="field__label">Daňové odpisovanie</span>
        <select class="field__input" name="metoda">
          <option value="straight" selected={v.method !== 'accelerated'}>
            rovnomerné (§ 27)
          </option>
          <option value="accelerated" selected={v.method === 'accelerated'}>
            zrýchlené (§ 28), len skupina 2 a 3
          </option>
        </select>
        <Err text={e.method} />
      </label>
      <label class="tickbox asset-form__wide">
        <input type="checkbox" name="auto" value="1" checked={v.car} />
        <span>Osobný automobil (KP 29.10.2). Pri vstupnej cene od {eur(CAR_LIMIT_CENTS)} ukážeme aj odpisy z tejto sumy (§ 17 ods. 34).</span>
      </label>
      <fieldset class="field asset-form__wide asset-form__choice">
        <legend class="field__label">Účtovné odpisy</legend>
        <label class="tickbox">
          <input type="radio" name="uctovne" value="tax" checked={v.books !== 'months'} />
          <span>Rovnako ako daňové, rozpočítané po mesiacoch</span>
        </label>
        <label class="tickbox">
          <input type="radio" name="uctovne" value="months" checked={v.books === 'months'} />
          <span>Rovnomerne počas počtu mesiacov (nehmotný majetok vždy)</span>
        </label>
        <input class="field__input asset-form__months" name="mesiace" value={v.months} inputmode="numeric" placeholder="počet mesiacov" aria-label="Počet mesiacov účtovného odpisovania" />
        <Err text={e.months} />
      </fieldset>
      <fieldset class="field asset-form__wide asset-form__choice">
        <legend class="field__label">Pôvod</legend>
        <label class="tickbox">
          <input type="radio" name="povod" value="purchase" checked={v.source !== 'opening'} />
          <span>Kúpený alebo vytvorený v týchto knihách: zaradíme ho z účtu obstarania (041 alebo 042)</span>
        </label>
        <label class="tickbox">
          <input type="radio" name="povod" value="opening" checked={v.source === 'opening'} />
          <span>Majetok spred začiatku kníh, už v počiatočných stavoch</span>
        </label>
        <div class="asset-form__prior">
          <label class="field">
            <span class="field__label">Doterajšie oprávky v eurách</span>
            <input class="field__input" name="opravky" value={v.priorBook} inputmode="decimal" />
          </label>
          <label class="field">
            <span class="field__label">Doteraz uplatnené daňové odpisy v eurách</span>
            <input class="field__input" name="danove" value={v.priorTax} inputmode="decimal" />
          </label>
          <label class="field">
            <span class="field__label">Počet rokov daňového odpisovania</span>
            <input class="field__input" name="roky" value={v.priorYears} inputmode="numeric" />
          </label>
        </div>
        <Err text={e.prior} />
      </fieldset>
      {centers.some((c) => !c.archived) || v.center ? (
        <div class="field asset-form__wide">
          <label class="field__label" for="a-stredisko">
            Stredisko
          </label>
          <CenterSelect centers={centers} value={v.center || null} id="a-stredisko" />
          {e.center ? <p class="field__error">{e.center}</p> : <p class="field__hint">Odpisy a zostatková cena pri vyradení sa v prehľade stredísk započítajú tomuto stredisku.</p>}
        </div>
      ) : null}
      <label class="field asset-form__wide">
        <span class="field__label">Poznámka</span>
        <input class="field__input" name="poznamka" value={v.note} maxlength={300} />
      </label>
    </div>
    <button class="btn btn--blue stack__submit" type="submit">
      {submit}
    </button>
  </form>
)

export interface AssetRow {
  asset: Asset & { note: string | null }
  bookAccumulated: number
  bookResidual: number
  taxThisYear: number
  taxResidual: number
}

/** A row of the register: what it is and where its depreciation stands today. */
export function assetRow(asset: Asset & { note: string | null }, today: string): AssetRow {
  const year = Number(today.slice(0, 4))
  // The books depreciate a month once it has ended: the register says where they stand, the month before this one.
  const m = Number(today.slice(5, 7))
  const ended = m === 1 ? `${year - 1}-12` : `${year}-${String(m - 1).padStart(2, '0')}`
  const book = bookState(asset, ended)
  const schedule = taxSchedule(asset)
  const thisYear = schedule.find((y) => y.year === year)
  const before = [...schedule].reverse().find((y) => y.year < year)
  const taxResidual = thisYear ? thisYear.residual : before ? before.residual : asset.costCents - (asset.source === 'opening' ? asset.priorTaxCents : 0)
  return { asset, bookAccumulated: book.accumulated, bookResidual: book.residual, taxThisYear: thisYear?.cents ?? 0, taxResidual }
}

export const AssetsPage: FC<{ company: Company; rows: AssetRow[]; year: number; summary: AssetYear; values: AssetValues; errors: AssetFormErrors; flash?: string | null; today: string; centers?: CostCenter[] }> = (p) => {
  const base = `${bookPath(p.company)}/majetok`
  const total = (f: (r: AssetRow) => number) => p.rows.filter((r) => !r.asset.disposedOn).reduce((s, r) => s + f(r), 0)
  return (
    <>
      <LedgerHead company={p.company} tab="assets" title="Majetok" second="a odpisy" lead="Dlhodobý majetok s účtovnými aj daňovými odpismi. Odpisy idú do kníh každý mesiac samy, daňové do závierky." flash={p.flash} />
      <section class="info" aria-labelledby="majetok-t">
        <h2 id="majetok-t" class="info__title">
          Evidencia majetku
        </h2>
        {p.rows.length === 0 ? (
          <p class="info__empty">Zatiaľ žiadny majetok. Pridajte ho formulárom nižšie.</p>
        ) : (
          <div class="lscroll">
            <table class="ltable asset-table">
              <thead>
                <tr>
                  <th scope="col">Inv. č.</th>
                  <th scope="col">Názov</th>
                  <th scope="col">Zaradené</th>
                  <th scope="col" class="num">
                    Vstupná cena
                  </th>
                  <th scope="col">Odpisovanie</th>
                  <th scope="col" class="num">
                    Oprávky
                  </th>
                  <th scope="col" class="num">
                    Zostatková cena
                  </th>
                  <th scope="col" class="num">
                    Daňový odpis {p.year}
                  </th>
                  <th scope="col" class="num">
                    Daňová ZC
                  </th>
                </tr>
              </thead>
              <tbody>
                {p.rows.map((r) => (
                  <tr class={r.asset.disposedOn ? 'asset-table__gone' : undefined}>
                    <td>
                      <a class="link" href={`${base}/${r.asset.id}`}>
                        {r.asset.number}
                      </a>
                    </td>
                    <td>
                      {r.asset.name}
                      {r.asset.disposedOn ? <span class="pill pill--grey">{`vyradené ${dayName(r.asset.disposedOn)}`}</span> : null}
                    </td>
                    <td>{dayName(r.asset.inUseOn)}</td>
                    <td class="num">{eur(r.asset.costCents)}</td>
                    <td>
                      {assetKind(r.asset.account) === 'intangible'
                        ? `${r.asset.account}, ${r.asset.bookMonths} mes.`
                        : `${r.asset.account}, skupina ${r.asset.taxGroup}, ${r.asset.taxMethod === 'accelerated' ? 'zrýchlene' : 'rovnomerne'}`}
                    </td>
                    <td class="num">{eur(r.bookAccumulated)}</td>
                    <td class="num">{eur(r.bookResidual)}</td>
                    <td class="num">{eur(r.taxThisYear)}</td>
                    <td class="num">{eur(r.taxResidual)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr class="ltable__total">
                  <th scope="row" colspan={3}>
                    Spolu v užívaní
                  </th>
                  <td class="num">{eur(total((r) => r.asset.costCents))}</td>
                  <td />
                  <td class="num">{eur(total((r) => r.bookAccumulated))}</td>
                  <td class="num">{eur(total((r) => r.bookResidual))}</td>
                  <td class="num">{eur(total((r) => r.taxThisYear))}</td>
                  <td class="num">{eur(total((r) => r.taxResidual))}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>
      {p.rows.length > 0 ? (
        <section class="info" aria-labelledby="rok-t">
          <h2 id="rok-t" class="info__title">
            Rok {p.year} pre závierku
          </h2>
          <dl class="kv">
            <div>
              <dt>Účtovné odpisy hmotného majetku</dt>
              <dd>{eur(p.summary.bookTangible)}</dd>
            </div>
            <div>
              <dt>Daňové odpisy hmotného majetku</dt>
              <dd>{eur(p.summary.taxTangible)}</dd>
            </div>
            <div>
              <dt>Účtovné odpisy nehmotného majetku</dt>
              <dd>{eur(p.summary.bookIntangible)}</dd>
            </div>
            {p.summary.saleShares > 0 ? (
              <div>
                <dt>Pomerná časť odpisu pri predaji (§ 22 ods. 12)</dt>
                <dd>{eur(p.summary.saleShares)}</dd>
              </div>
            ) : null}
            {p.summary.carExcess > 0 ? (
              <div>
                <dt>Odpisy áut nad odpisy zo 48 000 € (§ 17 ods. 34)</dt>
                <dd>{eur(p.summary.carExcess)}</dd>
              </div>
            ) : null}
            {p.summary.disposedTax > 0 || p.summary.disposedBook > 0 ? (
              <div>
                <dt>Vyradený majetok: daňová a účtovná zostatková cena</dt>
                <dd>
                  {eur(p.summary.disposedTax)} / {eur(p.summary.disposedBook)}
                </dd>
              </div>
            ) : null}
          </dl>
          <p class="small">Závierka prevezme účtovné a daňové odpisy hmotného majetku do tabuľky B. Úpravu podľa § 17 ods. 34 a rozdiel zostatkových cien vyradeného majetku posúďte v priznaní.</p>
        </section>
      ) : null}
      <section class="info" aria-labelledby="novy-t">
        <h2 id="novy-t" class="info__title">
          Pridať majetok
        </h2>
        <AssetForm action={base} values={p.values} errors={p.errors} submit="Pridať do evidencie" centers={p.centers} />
      </section>
    </>
  )
}

/** " Stredisko SKLAD Sklad." of an asset's centre, else nothing. */
const centreName = (centers: CostCenter[] | undefined, id: string | null | undefined): string => {
  const c = id ? centers?.find((x) => x.id === id) : undefined
  return c ? ` Stredisko ${c.code} ${c.name}.` : ''
}

export const AssetPage: FC<{
  company: Company
  asset: Asset & { note: string | null }
  values: AssetValues
  errors: AssetFormErrors
  flash?: string | null
  today: string
  centers?: CostCenter[]
  /** The adjustment of the deduction on investment property (asset-vat.tsx). */
  vat?: Child
}> = (p) => {
  const base = `${bookPath(p.company)}/majetok`
  const a = p.asset
  const tax = taxSchedule(a)
  const book = new Map<number, number>()
  for (const m of bookMonths(a)) book.set(Number(m.month.slice(0, 4)), (book.get(Number(m.month.slice(0, 4))) ?? 0) + m.cents)
  const years = [...new Set([...tax.map((y) => y.year), ...book.keys()])].sort((x, y) => x - y)
  let bookLeft = a.costCents - (a.source === 'opening' ? a.priorBookCents : 0)
  const car = tax.some((y) => y.limited !== null)
  return (
    <>
      <LedgerHead
        company={p.company}
        tab="assets"
        title={a.name}
        second={a.number}
        lead={`${ACCOUNT_NAMES[a.account]}, zaradené ${dayName(a.inUseOn)}, vstupná cena ${eur(a.costCents)}.${centreName(p.centers, a.centerId)}`}
        flash={p.flash}
      />
      <p>
        <a class="link" href={base}>
          Späť na evidenciu majetku
        </a>
      </p>
      <section class="info" aria-labelledby="plan-t">
        <h2 id="plan-t" class="info__title">
          Odpisový plán
        </h2>
        <div class="lscroll">
          <table class="ltable">
            <thead>
              <tr>
                <th scope="col">Rok</th>
                <th scope="col" class="num">
                  Daňový odpis
                </th>
                <th scope="col" class="num">
                  Daňová ZC na konci roka
                </th>
                {car ? (
                  <th scope="col" class="num">
                    Odpis zo 48 000 €
                  </th>
                ) : null}
                <th scope="col" class="num">
                  Účtovné odpisy
                </th>
                <th scope="col" class="num">
                  Účtovná ZC na konci roka
                </th>
              </tr>
            </thead>
            <tbody>
              {years.map((year) => {
                const t = tax.find((y) => y.year === year)
                const b = book.get(year) ?? 0
                bookLeft -= b
                return (
                  <tr>
                    <td>{year}</td>
                    <td class="num">{t ? eur(t.cents + t.saleShare) : ''}</td>
                    <td class="num">{t ? eur(t.residual) : ''}</td>
                    {car ? <td class="num">{t?.limited !== null && t?.limited !== undefined ? eur(t.limited) : ''}</td> : null}
                    <td class="num">{eur(b)}</td>
                    <td class="num">{eur(bookLeft)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {a.taxMethod === 'accelerated' && a.source === 'opening' ? <p class="small">Pri zrýchlenom odpisovaní majetku spred začiatku kníh porovnajte prvý rok s pôvodnou evidenciou.</p> : null}
      </section>
      {p.vat ?? null}
      <section class="info" aria-labelledby="vyradenie-t">
        <h2 id="vyradenie-t" class="info__title">
          Vyradenie
        </h2>
        {a.disposedOn && a.disposal ? (
          <form class="stack" method="post" action={`${base}/${a.id}/vyradit`}>
            <p>
              Vyradené {dayName(a.disposedOn)}, {DISPOSAL_NAMES[a.disposal]}. Zostatková cena išla do nákladov v ten deň.
            </p>
            <input type="hidden" name="zrusit" value="1" />
            <button class="btn btn--line" type="submit">
              Zrušiť vyradenie
            </button>
          </form>
        ) : (
          <form class="stack asset-form" method="post" action={`${base}/${a.id}/vyradit`} novalidate>
            <div class="asset-form__grid">
              <label class="field">
                <span class="field__label">Deň vyradenia</span>
                <input class="field__input" type="date" name="den" value={p.today} />
              </label>
              <label class="field">
                <span class="field__label">Spôsob</span>
                <select class="field__input" name="sposob">
                  {DISPOSALS.map((d) => (
                    <option value={d}>{DISPOSAL_NAMES[d]}</option>
                  ))}
                </select>
              </label>
            </div>
            <Err text={p.errors.disposal} />
            <button class="btn btn--line" type="submit">
              Vyradiť majetok
            </button>
          </form>
        )}
      </section>
      <section class="info" aria-labelledby="zmena-t">
        <h2 id="zmena-t" class="info__title">
          Zmeniť údaje
        </h2>
        <AssetForm action={`${base}/${a.id}`} values={p.values} errors={p.errors} submit="Uložiť zmeny" centers={p.centers} />
        <form method="post" action={`${base}/${a.id}/odstranit`}>
          <button class="btn btn--text" type="submit">
            Odstrániť z evidencie, bol zadaný omylom
          </button>
        </form>
      </section>
    </>
  )
}

