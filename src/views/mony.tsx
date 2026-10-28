// Mony in the corner (assistant/mony.ts): a cloud of a panel at the bottom right, folded to its glass icon by the
// arrow and opened by the icon. Rendered hidden: client/mony.ts shows it, since without a script it cannot answer.
import type { FC } from 'hono/jsx'
import type { MonyAudience } from '../assistant/mony'
import { MONY } from '../assistant/mony'
import { asset } from '../config'

export const MONY_COPY = {
  role: 'Asistent Firmony',
  open: `Otvoriť ${MONY.name}`,
  hide: `Skryť ${MONY.name}`,
  fresh: 'Nová konverzácia',
  label: `Otázka pre ${MONY.name}`,
  send: 'Poslať otázku',
  placeholder: { public: 'Opýtajte sa na čokoľvek o Firmony…', client: 'Opýtajte sa, ako čo urobiť…', accountant: 'Opýtajte sa na postup…', admin: 'Opýtaj sa na čokoľvek o Firmony…' } as Record<MonyAudience, string>,
  hello: {
    public: `Dobrý deň, som ${MONY.name}, asistent Firmony. Opýtajte sa, ako služba funguje, koľko stojí alebo ako k nám prejsť.`,
    client: `Dobrý deň, som ${MONY.name}. Poradím Vám, ako čo vo Firmony urobiť, kde čo nájdete a ako služba funguje.`,
    accountant: `Dobrý deň, som ${MONY.name}. Pomôžem Vám s postupmi vo Firmony: doklady, DPH, mzdy, závierka aj podania.`,
    admin: `Ahoj, som ${MONY.name}. Poznám Firmony celé: produkt, stav projektu, ekonomiku aj kód.`,
  } as Record<MonyAudience, string>,
  chips: {
    public: ['Koľko stojí účtovníctvo?', 'Ako prejdem od súčasnej účtovníčky?', 'Čo všetko za mňa urobíte?', 'Je fakturácia naozaj zadarmo?'],
    client: ['Ako pridám doklad?', 'Ako nastavím banku?', 'Ako vystavím faktúru?', 'Čo mám zaplatiť a kedy?'],
    accountant: ['Ako podám DPH za klienta?', 'Kedy zapnúť Účtuje samo?', 'Ako uzavriem mzdy?', 'Ako prevezmem klienta z Pohody?'],
    admin: ['Čo ešte chýba pred spustením?', 'Koľko zarábame na klientovi?', 'Čo robí softvér a čo účtovníčka?', 'Kde v kóde je párovanie platieb?'],
  } as Record<MonyAudience, string[]>,
  note: {
    public: `${MONY.name} odpovedá z verejných informácií Firmony a môže sa pomýliť. Presnú ponuku pre Vašu firmu dostanete po nezáväznom dopyte.`,
    client: `${MONY.name} odpovedá z návodov Firmony a nevidí údaje Vašej firmy. Môže sa pomýliť; pri odbornej otázke Vám poradí účtovníčka.`,
    accountant: `${MONY.name} odpovedá z návodov a poznámok Firmony a nevidí údaje klientov. Odborný záver overte.`,
    admin: `${MONY.name} odpovedá z poznámok, dokumentov a mapy kódu Firmony.`,
  } as Record<MonyAudience, string>,
}

const Chevron: FC<{ dir: 'down' | 'left' }> = ({ dir }) => (
  <svg class="mony__glyph" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
    <path d={dir === 'down' ? 'M6 9.5l6 6 6-6' : 'M14.5 6l-6 6 6 6'} fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
  </svg>
)

export const MonyBubble: FC<{ audience: MonyAudience }> = ({ audience }) => (
  <div class="mony" data-mony={audience} hidden>
    <section class="mony__panel" id="mony-panel" aria-label={`${MONY.name}, ${MONY_COPY.role}`} hidden>
      <header class="mony__head">
        <img class="mony__avatar" src="/art/mony.webp" alt="" width="44" height="44" />
        <p class="mony__who">
          <strong class="mony__name">{MONY.name}</strong>
          <span class="mony__role">{MONY_COPY.role}</span>
        </p>
        <button type="button" class="mony__icon" data-mony-new aria-label={MONY_COPY.fresh} title={MONY_COPY.fresh}>
          <svg class="mony__glyph" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
            <path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" />
          </svg>
        </button>
        <button type="button" class="mony__icon" data-mony-hide aria-label={MONY_COPY.hide} title={MONY_COPY.hide}>
          <Chevron dir="down" />
        </button>
      </header>
      <div class="mony__log" data-mony-log role="log" aria-live="polite">
        <p class="mony__msg mony__msg--mony">{MONY_COPY.hello[audience]}</p>
        <div class="mony__chips" data-mony-chips>
          {MONY_COPY.chips[audience].map((chip) => (
            <button type="button" class="mony__chip" data-mony-ask={chip}>
              {chip}
            </button>
          ))}
        </div>
      </div>
      <form class="mony__form" data-mony-form>
        <label class="mony__sr" for="mony-question">
          {MONY_COPY.label}
        </label>
        <textarea id="mony-question" class="mony__input" name="question" rows={1} maxlength={MONY.questionChars} placeholder={MONY_COPY.placeholder[audience]} />
        <button type="submit" class="mony__send" aria-label={MONY_COPY.send}>
          <svg class="mony__glyph" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
            <path d="M12 19V5M6 11l6-6 6 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
      </form>
      <p class="mony__note">{MONY_COPY.note[audience]}</p>
    </section>
    <button type="button" class="mony__launcher" data-mony-open aria-controls="mony-panel" aria-expanded="false" aria-label={MONY_COPY.open}>
      <span class="mony__tab" aria-hidden="true">
        <Chevron dir="left" />
      </span>
      <img class="mony__face" src="/art/mony.webp" alt="" width="64" height="64" />
      <span class="mony__label" aria-hidden="true">
        {MONY.name}
      </span>
    </button>
    <script src={asset('/mony.js')} defer></script>
  </div>
)
