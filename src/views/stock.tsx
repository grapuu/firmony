// Stock (17 October 2026): how the company keeps it, its items with what is on hand and its value, the forms of a
// receipt, an issue and a count, pasting many at once, and each item's card. stock.ts has the rules.
import type { FC } from 'hono/jsx'
import type { Company } from '../app/store'
import { dayName } from '../app/copy'
import {
  MOVE_NAMES,
  STOCK_ACCOUNTS,
  STOCK_KINDS,
  STOCK_KIND_NAMES,
  STOCK_UNITS,
  quantityText,
  type ItemErrors,
  type ItemValues,
  type MoveErrors,
  type MoveValues,
  type StockItem,
  type StockKind,
  type StockSettings,
  type ValuedMove,
} from '../app/stock'
import { formatEurExact } from '../format'
import { LedgerHead, bookPath } from './ledger'

const eur = (cents: number) => formatEurExact(cents)
const Err: FC<{ text?: string }> = ({ text }) => (text ? <p class="field__error">{text}</p> : null)

export interface StockRow {
  item: StockItem
  quantity: number
  value: number
}

/** A document a receipt or an issue may name: its number, who, its day. */
export interface StockDocument {
  id: string
  label: string
}

export interface StockPageProps {
  company: Company
  settings: StockSettings | null
  rows: StockRow[]
  kinds: Record<StockKind, number>
  /** What the books hold on 112, 123 and 132 at the day (method A should agree). */
  books: Record<StockKind, number>
  day: string
  documents: StockDocument[]
  item: { values: ItemValues; errors: ItemErrors }
  move: { values: MoveValues; errors: MoveErrors }
  paste: { moves: string; items: string; errors: string[] }
  flash?: string | null
  error?: string | null
}

const SettingsForm: FC<{ action: string; settings: StockSettings | null }> = ({ action, settings }) => (
  <form class="stack" method="post" action={action}>
    <fieldset class="field asset-form__choice">
      <legend class="field__label">Spôsob účtovania zásob</legend>
      <label class="tickbox">
        <input type="radio" name="sposob" value="A" checked={settings?.method !== 'B'} />
        <span>A: priebežne. Príjemky na 112, 123 a 132 (z 111, 613 a 131), výdajky do 501, 613 a 504 v cene podľa ocenenia. Nákup tovaru ide na 131.</span>
      </label>
      <label class="tickbox">
        <input type="radio" name="sposob" value="B" checked={settings?.method === 'B'} />
        <span>B: inventúrou. Nákup ide do nákladov, inventúra dá stav zásob na účet a na druhý deň ho zúčtuje späť.</span>
      </label>
    </fieldset>
    <label class="field">
      <span class="field__label">Ocenenie úbytku (§ 25 ods. 5 zákona o účtovníctve)</span>
      <select class="field__input" name="ocenenie">
        <option value="average" selected={settings?.valuation !== 'fifo'}>
          vážený aritmetický priemer
        </option>
        <option value="fifo" selected={settings?.valuation === 'fifo'}>
          FIFO, prvá cena na vstupe, prvá na výstupe
        </option>
      </select>
    </label>
    <button class="btn btn--blue stack__submit" type="submit">
      {settings ? 'Uložiť spôsob' : 'Začať viesť sklad'}
    </button>
  </form>
)

export const StockPage: FC<StockPageProps> = (p) => {
  const base = `${bookPath(p.company)}/sklad`
  const s = p.settings
  const m = p.move.values
  const me = p.move.errors
  const iv = p.item.values
  const ie = p.item.errors
  return (
    <>
      <LedgerHead
        company={p.company}
        tab="stock"
        title="Sklad"
        second="a zásoby"
        lead="Skladové karty tovaru, materiálu a výrobkov, príjemky, výdajky a inventúra. Ich účtovanie ide do kníh samo, mesiac po mesiaci."
        flash={p.flash}
        error={p.error}
      />
      {!s ? (
        <section class="info" aria-labelledby="sposob-t">
          <h2 id="sposob-t" class="info__title">
            Ako firma vedie zásoby
          </h2>
          <p class="info__lead">Vyberte spôsob podľa vnútornej smernice firmy. Firma bez zásob sklad viesť nemusí.</p>
          <SettingsForm action={`${base}/nastavenie`} settings={null} />
        </section>
      ) : (
        <>
          <section class="info" aria-labelledby="zasoby-t">
            <header class="info__row">
              <h2 id="zasoby-t" class="info__title">
                Zásoby k {dayName(p.day)}
              </h2>
              <span class="pill pill--blue">{s.method === 'A' ? 'Spôsob A' : 'Spôsob B'}, {s.valuation === 'fifo' ? 'FIFO' : 'vážený priemer'}</span>
            </header>
            <form class="stock-day" method="get" action={base}>
              <label class="field">
                <span class="field__label">Ku dňu</span>
                <input class="field__input" type="date" name="ku" value={p.day} />
              </label>
              <button class="btn btn--line" type="submit">
                Ukázať
              </button>
            </form>
            {p.rows.length === 0 ? (
              <p class="info__empty">Zatiaľ žiadna položka. Pridajte ju formulárom nižšie alebo ich vložte zoznamom.</p>
            ) : (
              <div class="lscroll">
                <table class="ltable stock-table">
                  <thead>
                    <tr>
                      <th scope="col">Kód</th>
                      <th scope="col">Názov</th>
                      <th scope="col">Druh</th>
                      <th scope="col" class="num">
                        Množstvo
                      </th>
                      <th scope="col" class="num">
                        Priemerná cena
                      </th>
                      <th scope="col" class="num">
                        Hodnota
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.rows.map((r) => (
                      <tr>
                        <td>
                          <a class="link" href={`${base}/${r.item.id}`}>
                            {r.item.code}
                          </a>
                        </td>
                        <td>{r.item.name}</td>
                        <td>{STOCK_KIND_NAMES[r.item.kind]}</td>
                        <td class="num">{`${quantityText(r.quantity)} ${r.item.unit}`}</td>
                        <td class="num">{r.quantity > 0 ? eur(Math.round((r.value * 1000) / r.quantity)) : ''}</td>
                        <td class="num">{eur(r.value)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <dl class="kv stock-kinds">
              {STOCK_KINDS.filter((k) => p.kinds[k] !== 0 || p.books[k] !== 0).map((k) => (
                <div>
                  <dt>{`${STOCK_KIND_NAMES[k]}: na kartách / v knihe na ${STOCK_ACCOUNTS[k].stock}`}</dt>
                  <dd>
                    {eur(p.kinds[k])} / {eur(p.books[k])}
                  </dd>
                </div>
              ))}
            </dl>
            {s.method === 'A' && STOCK_KINDS.some((k) => p.kinds[k] !== p.books[k]) ? (
              <p class="flag">Hodnota na kartách sa líši od účtu v knihe: na účet zásob účtuje aj iný doklad. Pozrite účet v hlavnej knihe.</p>
            ) : null}
            {s.method === 'B' ? <p class="small">Pri spôsobe B je zásoba na účte len v deň inventúry; počas roka ide nákup do nákladov.</p> : null}
          </section>

          <section class="info" aria-labelledby="pohyb-t">
            <h2 id="pohyb-t" class="info__title">
              {s.method === 'A' ? 'Príjemka, výdajka alebo inventúra' : 'Inventúra'}
            </h2>
            <form class="stack asset-form" method="post" action={`${base}/pohyby`} novalidate>
              {me.form ? (
                <p class="notice notice--error" role="alert">
                  {me.form}
                </p>
              ) : null}
              <div class="asset-form__grid">
                <label class="field">
                  <span class="field__label">Pohyb</span>
                  <select class="field__input" name="pohyb">
                    {(s.method === 'A' ? (['in', 'out', 'count'] as const) : (['count'] as const)).map((k) => (
                      <option value={k} selected={m.kind === k}>
                        {MOVE_NAMES[k]}
                      </option>
                    ))}
                  </select>
                  <Err text={me.kind} />
                </label>
                <label class="field">
                  <span class="field__label">Položka</span>
                  <select class="field__input" name="polozka" aria-invalid={me.item ? 'true' : undefined}>
                    {p.rows.map((r) => (
                      <option value={r.item.id} selected={m.item === r.item.id}>
                        {`${r.item.code}: ${r.item.name}`}
                      </option>
                    ))}
                  </select>
                  <Err text={me.item} />
                </label>
                <label class="field">
                  <span class="field__label">Deň</span>
                  <input class="field__input" type="date" name="den" value={m.on} aria-invalid={me.on ? 'true' : undefined} />
                  <Err text={me.on} />
                </label>
                <label class="field">
                  <span class="field__label">{s.method === 'A' ? 'Množstvo (pri inventúre zistený stav)' : 'Zistené množstvo'}</span>
                  <input class="field__input" name="mnozstvo" value={m.quantity} inputmode="decimal" autocomplete="off" aria-invalid={me.quantity ? 'true' : undefined} />
                  <Err text={me.quantity} />
                </label>
                <label class="field">
                  <span class="field__label">{s.method === 'A' ? 'Hodnota v eurách (príjemka; pri prebytku z inventúry, ak ju poznáte)' : 'Hodnota zásoby v eurách'}</span>
                  <input class="field__input" name="hodnota" value={m.value} inputmode="decimal" autocomplete="off" aria-invalid={me.value ? 'true' : undefined} />
                  <Err text={me.value} />
                </label>
                <label class="field">
                  <span class="field__label">Doklad (nepovinné)</span>
                  <select class="field__input" name="doklad">
                    <option value="" selected={m.document === ''}>
                      bez dokladu
                    </option>
                    {p.documents.map((d) => (
                      <option value={d.id} selected={m.document === d.id}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                  <Err text={me.document} />
                </label>
                <label class="field asset-form__wide">
                  <span class="field__label">Poznámka</span>
                  <input class="field__input" name="poznamka" value={m.note} maxlength={300} />
                </label>
              </div>
              <p class="small">
                {s.method === 'A'
                  ? 'Výdajka sa ocení sama podľa zvoleného ocenenia. Inventúra porovná zistený stav s kartou: manko pôjde na 549, prebytok tovaru a materiálu na 648, výrobkov na 613.'
                  : 'Inventúra dá hodnotu zásoby na 112, 123 alebo 132 proti 501, 613 alebo 504 a na druhý deň ju zúčtuje späť.'}
              </p>
              <button class="btn btn--blue stack__submit" type="submit" disabled={p.rows.length === 0}>
                Zapísať pohyb
              </button>
            </form>
          </section>

          <section class="info" aria-labelledby="polozka-t">
            <h2 id="polozka-t" class="info__title">
              Nová položka
            </h2>
            <form class="stack asset-form" method="post" action={`${base}/polozky`} novalidate>
              <div class="asset-form__grid">
                <label class="field">
                  <span class="field__label">Kód</span>
                  <input class="field__input" name="kod" value={iv.code} maxlength={40} autocomplete="off" aria-invalid={ie.code ? 'true' : undefined} />
                  <Err text={ie.code} />
                </label>
                <label class="field">
                  <span class="field__label">Názov</span>
                  <input class="field__input" name="nazov" value={iv.name} maxlength={160} aria-invalid={ie.name ? 'true' : undefined} />
                  <Err text={ie.name} />
                </label>
                <label class="field">
                  <span class="field__label">Merná jednotka</span>
                  <input class="field__input" name="jednotka" value={iv.unit} maxlength={8} list="jednotky" aria-invalid={ie.unit ? 'true' : undefined} />
                  <datalist id="jednotky">
                    {STOCK_UNITS.map((u) => (
                      <option value={u} />
                    ))}
                  </datalist>
                  <Err text={ie.unit} />
                </label>
                <label class="field">
                  <span class="field__label">Druh</span>
                  <select class="field__input" name="druh">
                    {STOCK_KINDS.map((k) => (
                      <option value={k} selected={iv.kind === k}>
                        {STOCK_KIND_NAMES[k]}
                      </option>
                    ))}
                  </select>
                  <Err text={ie.kind} />
                </label>
              </div>
              <button class="btn btn--line stack__submit" type="submit">
                Pridať položku
              </button>
            </form>
          </section>

          <section class="info" aria-labelledby="vlozit-t">
            <h2 id="vlozit-t" class="info__title">
              Vložiť zoznamom z iného programu
            </h2>
            <p class="info__lead">Skopírujte riadky z tabuľky alebo CSV (bodkočiarka alebo tabulátor). Vezmeme všetky naraz, alebo žiadny, ak je niektorý zlý.</p>
            {p.paste.errors.length > 0 ? (
              <ul class="notice notice--error stock-errors" role="alert">
                {p.paste.errors.map((e) => (
                  <li>{e}</li>
                ))}
              </ul>
            ) : null}
            <form class="stack" method="post" action={`${base}/vlozit-polozky`}>
              <label class="field">
                <span class="field__label">Položky: kód; názov; jednotka; druh (tovar, materiál, výrobky)</span>
                <textarea class="field__input field__area" name="riadky" rows={4}>
                  {p.paste.items}
                </textarea>
              </label>
              <button class="btn btn--line stack__submit" type="submit">
                Vložiť položky
              </button>
            </form>
            <form class="stack" method="post" action={`${base}/vlozit-pohyby`}>
              <label class="field">
                <span class="field__label">{s.method === 'A' ? 'Pohyby: deň; kód; druh (príjem, výdaj, inventúra); množstvo; hodnota v eurách; poznámka' : 'Inventúra: deň; kód; inventúra; množstvo; hodnota v eurách; poznámka'}</span>
                <textarea class="field__input field__area" name="riadky" rows={5}>
                  {p.paste.moves}
                </textarea>
              </label>
              <button class="btn btn--line stack__submit" type="submit">
                Vložiť pohyby
              </button>
            </form>
          </section>

          <details class="info stock-settings">
            <summary class="info__title">Spôsob účtovania a ocenenia</summary>
            <p class="small">Zmena prepočíta účtovanie všetkých pohybov; obdobie, ktoré je už uzamknuté, zmeniť nedovolíme.</p>
            <SettingsForm action={`${base}/nastavenie`} settings={s} />
          </details>
        </>
      )}
    </>
  )
}

export interface StockItemPageProps {
  company: Company
  settings: StockSettings
  item: StockItem
  moves: ValuedMove[]
  documents: Map<string, string>
  values: ItemValues
  errors: ItemErrors
  flash?: string | null
  error?: string | null
}

/** An item's card: every move with the stock after it, the item's details and its removal. */
export const StockItemPage: FC<StockItemPageProps> = (p) => {
  const base = `${bookPath(p.company)}/sklad`
  const last = p.moves[p.moves.length - 1]
  return (
    <>
      <LedgerHead company={p.company} tab="stock" title={p.item.name} second={`skladová karta ${p.item.code}`} flash={p.flash} error={p.error} />
      <section class="info" aria-labelledby="karta-t">
        <header class="info__row">
          <h2 id="karta-t" class="info__title">
            Pohyby
          </h2>
          <span class="pill pill--grey">{`${quantityText(last?.after.quantity ?? 0)} ${p.item.unit}, ${eur(last?.after.value ?? 0)}`}</span>
        </header>
        {p.moves.length === 0 ? (
          <p class="info__empty">Zatiaľ žiadny pohyb.</p>
        ) : (
          <div class="lscroll">
            <table class="ltable stock-card">
              <thead>
                <tr>
                  <th scope="col">Číslo</th>
                  <th scope="col">Deň</th>
                  <th scope="col">Pohyb</th>
                  <th scope="col" class="num">
                    Množstvo
                  </th>
                  <th scope="col" class="num">
                    Hodnota
                  </th>
                  <th scope="col" class="num">
                    Stav
                  </th>
                  <th scope="col" class="num">
                    Hodnota stavu
                  </th>
                  <th scope="col">Doklad, poznámka</th>
                  <th scope="col">
                    <span class="sr">Odstrániť</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {p.moves.map((mv) => (
                  <tr>
                    <td>{mv.number}</td>
                    <td>{dayName(mv.on)}</td>
                    <td>{MOVE_NAMES[mv.kind]}</td>
                    <td class="num">
                      {mv.kind === 'count' && p.settings.method === 'A' ? `${quantityText(mv.quantity)} (${mv.difference > 0 ? '+' : ''}${quantityText(mv.difference)})` : `${mv.kind === 'out' ? '−' : ''}${quantityText(mv.quantity)}`}
                    </td>
                    <td class="num">{mv.kind === 'in' ? eur(mv.value ?? 0) : mv.kind === 'out' ? `−${eur(mv.cost)}` : p.settings.method === 'A' ? eur(mv.cost) : eur(mv.value ?? 0)}</td>
                    <td class="num">{quantityText(mv.after.quantity)}</td>
                    <td class="num">{eur(mv.after.value)}</td>
                    <td>{[mv.documentId ? p.documents.get(mv.documentId) ?? 'doklad' : null, mv.note].filter(Boolean).join(' · ')}</td>
                    <td>
                      <form method="post" action={`${base}/pohyby/${mv.id}/odstranit`}>
                        <button class="btn btn--text" type="submit">
                          Odstrániť
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section class="info" aria-labelledby="udaje-t">
        <h2 id="udaje-t" class="info__title">
          Údaje položky
        </h2>
        <form class="stack asset-form" method="post" action={`${base}/${p.item.id}`} novalidate>
          <div class="asset-form__grid">
            <label class="field">
              <span class="field__label">Kód</span>
              <input class="field__input" name="kod" value={p.values.code} maxlength={40} aria-invalid={p.errors.code ? 'true' : undefined} />
              <Err text={p.errors.code} />
            </label>
            <label class="field">
              <span class="field__label">Názov</span>
              <input class="field__input" name="nazov" value={p.values.name} maxlength={160} aria-invalid={p.errors.name ? 'true' : undefined} />
              <Err text={p.errors.name} />
            </label>
            <label class="field">
              <span class="field__label">Merná jednotka</span>
              <input class="field__input" name="jednotka" value={p.values.unit} maxlength={8} aria-invalid={p.errors.unit ? 'true' : undefined} />
              <Err text={p.errors.unit} />
            </label>
            <label class="field">
              <span class="field__label">Druh</span>
              <select class="field__input" name="druh">
                {STOCK_KINDS.map((k) => (
                  <option value={k} selected={p.values.kind === k}>
                    {STOCK_KIND_NAMES[k]}
                  </option>
                ))}
              </select>
              <Err text={p.errors.kind} />
            </label>
          </div>
          {p.errors.form ? <p class="field__error">{p.errors.form}</p> : null}
          <button class="btn btn--blue stack__submit" type="submit">
            Uložiť údaje
          </button>
        </form>
        {p.moves.length === 0 ? (
          <form method="post" action={`${base}/${p.item.id}/odstranit`}>
            <button class="btn btn--text" type="submit">
              Odstrániť položku
            </button>
          </form>
        ) : null}
      </section>
    </>
  )
}
