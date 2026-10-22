import type { FC } from 'hono/jsx'
import { WAGE_PATH } from '../content/wage-calc'
import { INVOICE_PATH, TOOLS_PATH, blankInvoice } from '../tools/invoice'

const TOOLS = [
  { href: INVOICE_PATH, title: 'Faktúra v PDF', tag: 'Bez registrácie', text: 'Bežná tuzemská faktúra neplatiteľa DPH. Vyplníte údaje, skontrolujete náhľad a stiahnete PDF vo svojom prehliadači.', action: 'Vytvoriť faktúru' },
  { href: WAGE_PATH, title: 'Čistá mzda a cena práce', tag: 'Bez registrácie', text: 'Z hrubej mzdy zistíte orientačnú čistú mzdu, odvody aj celkové náklady zamestnávateľa. Podľa zvoleného roka.', action: 'Vypočítať mzdu' },
  { href: '/#kalkulacka', title: 'Porovnanie ceny účtovníctva', tag: 'Z Vašich údajov', text: 'Porovnajte svoje ročné náklady s Firmony vrátane závierky. Výsledok ukáže aj rovnakú alebo vyššiu cenu.', action: 'Porovnať náklady' },
] as const

export const FreeToolsTeaser: FC = () => (
  <section class="section free-tools" aria-labelledby="free-tools-title">
    <div class="wrap">
      <header class="head head--center">
        <p class="eyebrow">Firmony aj pred prvou zmluvou</p>
        <h2 id="free-tools-title" class="title"><span class="title__sans">Užitočné hneď.</span> <em class="title__serif">Zadarmo.</em></h2>
        <p class="lead">Použite nástroj, ktorý práve potrebujete. Bez platobnej karty a bez objednania účtovníctva.</p>
      </header>
      <ToolCards />
    </div>
  </section>
)

const ToolCards: FC = () => <div class="free-tools__grid">{TOOLS.map((tool) => (
  <article class="free-tools__card">
    <p class="free-tools__tag">{tool.tag} <span>0 €</span></p>
    <h3>{tool.title}</h3><p>{tool.text}</p>
    <a class="btn btn--blue" href={tool.href}>{tool.action}</a>
  </article>
))}</div>

export const FreeToolsPage: FC = () => (
  <div class="wrap tool-page">
    <header class="head"><p class="eyebrow">Bezplatné nástroje</p>
      <h1 class="title"><span class="title__sans">Vyskúšajte Firmony.</span> <em class="title__serif">Bez záväzku.</em></h1>
      <p class="lead">Faktúra, mzda alebo porovnanie nákladov. Vyberte si, čo Vám dnes uľahčí podnikanie.</p>
    </header>
    <ToolCards />
    <section class="tool-page__next"><h2>Keď chcete odovzdať aj účtovníctvo</h2>
      <p>Nástroje môžete používať samostatne. Ak hľadáte účtovnú službu, najprv spolu prejdeme Vašu agendu, rozsah a cenu.</p>
      <a class="btn btn--blue" href="/zacat">Nezáväzne preveriť moju firmu</a>
    </section>
  </div>
)

const Field: FC<{ name: string; label: string; value?: string; max?: number; type?: 'text' | 'date'; mode?: 'text' | 'numeric' | 'decimal'; help?: string }> = ({ name, label, value = '', max = 160, type = 'text', mode = 'text', help }) => (
  <label class="free-field" for={`invoice-${name}`}>
    <span>{label}</span><input id={`invoice-${name}`} name={name} type={type} inputmode={mode} maxlength={type === 'text' ? max : undefined} value={value} autocomplete="off" aria-describedby={help ? `help-${name}` : undefined} />
    {help ? <small id={`help-${name}`}>{help}</small> : null}
  </label>
)

const PartyFields: FC<{ side: 'supplier' | 'customer' }> = ({ side }) => <div class="free-form__fields">
  <Field name={`${side}.name`} label="Obchodné meno vrátane právnej formy" />
  <Field name={`${side}.address`} label="Ulica, číslo, PSČ a obec na Slovensku" max={240} />
  <Field name={`${side}.ico`} label="IČO" max={12} mode="numeric" />
  <Field name={`${side}.dic`} label="DIČ, ak bolo pridelené" max={10} mode="numeric" />
  {side === 'supplier' ? <Field name="supplier.registry" label="Register a číslo zápisu" max={240} help="Napríklad príslušný obchodný register, oddiel a vložka alebo číslo živnostenského registra." /> : null}
</div>

export const FreeInvoicePage: FC<{ today: string }> = ({ today }) => {
  const invoice = blankInvoice(today)
  return <div class="wrap tool-page free-invoice">
    <a class="tool-back" href={TOOLS_PATH}>Všetky bezplatné nástroje</a>
    <header class="head"><p class="eyebrow">0 € · Bez účtu · Bez platobnej karty</p>
      <h1 class="title"><span class="title__sans">Vaša faktúra.</span> <em class="title__serif">O chvíľu v PDF.</em></h1>
      <p class="lead">Pre slovenských podnikateľov, ktorí nie sú platiteľmi DPH. Údaje zostávajú vo Vašom prehliadači. Náhľad aj PDF vznikajú priamo u Vás.</p>
    </header>
    <noscript><p class="free-notice">Na vytvorenie faktúry zapnite JavaScript. Formulár údaje nikam neodosiela.</p></noscript>
    <div class="free-invoice__layout" data-invoice-tool>
      <div>
        <div class="free-invoice__draft-actions" hidden data-js>
          <button class="btn btn--line" type="button" data-save-draft>Stiahnuť rozpracované údaje</button>
          <label class="btn btn--line" for="invoice-restore">Načítať uložené údaje</label>
          <input id="invoice-restore" type="file" accept=".json,application/json" data-load-draft />
        </div>
        <p class="free-note">Údaje automaticky neukladáme. Ak chcete pokračovať neskôr, stiahnite si ich do súboru. Pred odchodom si uložte aj hotové PDF.</p>
        <form class="free-form" id="free-invoice-form" novalidate>
          <fieldset><legend>1. Kto faktúru vystavuje</legend><PartyFields side="supplier" /></fieldset>
          <fieldset><legend>2. Komu fakturujete</legend><PartyFields side="customer" /></fieldset>
          <fieldset><legend>3. Číslo a dátumy</legend>
            <div class="free-form__fields free-form__fields--two">
              <Field name="number" label="Číslo faktúry z Vášho číselného radu" max={40} help="Pokračujte vo svojom číslovaní. Nástroj nekontroluje duplicity ani neprideľuje číslo." />
              <Field name="issued" label="Dátum vystavenia" type="date" value={invoice.issued} />
              <Field name="supplied" label="Dátum dodania" type="date" value={invoice.supplied} />
              <Field name="due" label="Dátum splatnosti" type="date" />
            </div>
          </fieldset>
          <fieldset><legend>4. Za čo fakturujete</legend>
            <p class="free-note">Ceny v EUR, bez DPH. Množstvo najviac na 3 desatinné miesta, cena na 2. Každá položka sa zaokrúhli na cent.</p>
            <div data-invoice-lines></div>
            <button class="btn btn--line" type="button" data-add-line hidden data-js>Pridať položku</button>
          </fieldset>
          <details class="free-form__optional"><summary>Platobné údaje a poznámka</summary><div class="free-form__fields">
            <Field name="iban" label="Slovenský IBAN, nepovinné" max={34} help="Skontrolujte, že účet patrí dodávateľovi. Overujeme formát a kontrolné číslice, nie majiteľa účtu." />
            <Field name="vs" label="Variabilný symbol, nepovinné" max={10} mode="numeric" />
            <label class="free-field" for="invoice-note"><span>Poznámka, nepovinné</span><textarea id="invoice-note" name="note" rows={3} maxlength={1000}></textarea></label>
          </div></details>
          <fieldset class="free-form__confirm"><legend>Pred stiahnutím potvrďte rozsah</legend>
            <label><input type="checkbox" name="nonVat" id="invoice-nonVat" />Dodávateľ nie je platiteľom DPH.</label>
            <label><input type="checkbox" name="domestic" id="invoice-domestic" />Ide o bežné tuzemské dodanie medzi slovenskými podnikateľmi v EUR, bez osobitného daňového režimu.</label>
          </fieldset>
          <div id="invoice-errors" class="free-errors" role="alert" tabindex={-1} hidden></div>
          <button class="btn btn--blue free-invoice__download" type="submit" disabled data-download>Stiahnuť faktúru v PDF</button>
          <p class="free-note">PDF skontrolujte, uložte a odošlite odberateľovi. Samotné stiahnutie faktúru neodošle ani nezaúčtuje. Nástroj nevedie archív faktúr.</p>
        </form>
        <p class="free-status" data-invoice-status role="status" aria-live="polite"></p>
      </div>
      <aside class="free-preview" aria-labelledby="invoice-preview-title">
        <div class="free-preview__top"><h2 id="invoice-preview-title">Náhľad faktúry</h2><span>EUR</span></div>
        <div class="free-preview__paper" data-invoice-preview><p>Vyplňte údaje. Tu uvidíte priebežný náhľad.</p></div>
        <p class="free-note">PDF má vlastnú sadzbu na A4 so všetkými vyplnenými údajmi. Náhľad nie je potvrdením správnosti dokladu.</p>
      </aside>
    </div>
    <section class="tool-page__next">
      <h2>Čo tento nástroj zvládne</h2>
      <p>Jednorazové vytvorenie faktúry neplatiteľa DPH s najviac 50 položkami. Pre platiteľov DPH, zahraničie, zálohy, dobropisy a osobitné režimy použite zodpovedajúci fakturačný systém. PDF nie je štruktúrovaná eFaktúra ani doručenie digitálnym poštárom.</p>
      <p>Údaje ani súbory z tohto formulára neposielame Firmony alebo AI. Pri zatvorení stránky sa neuložené údaje stratia. Existenciu firmy ani údaje v registri neoverujeme. Za správne údaje, číslovanie, interné overenie a uchovanie dokladu zodpovedá vystavovateľ.</p>
      <p>Právne podklady skontrolované 22. 10. 2026: <a href="https://static.slov-lex.sk/static/SK/ZZ/2002/431/20260601.html#paragraf-10" rel="noopener noreferrer">§ 10 zákona o účtovníctve</a>, <a href="https://static.slov-lex.sk/static/SK/ZZ/1991/513/20260817.html#paragraf-3a" rel="noopener noreferrer">§ 3a Obchodného zákonníka</a> a <a href="https://static.slov-lex.sk/static/SK/ZZ/2004/222/20260101.html#paragraf-69" rel="noopener noreferrer">§ 69 ods. 5 zákona o DPH</a>.</p>
      <h2>Faktúrou sa účtovníctvo nekončí</h2><p>Ak chcete odovzdať aj účtovníctvo, prejdeme s Vami rozsah služby a cenu. Bezplatný nástroj môžete používať aj bez toho.</p>
      <a class="btn btn--blue" href="/zacat">Nezáväzne preveriť moju firmu</a>
    </section>
    <script src="/free-invoice.js" defer></script>
  </div>
}
