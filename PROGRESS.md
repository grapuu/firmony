# Firmony: progress of the continuation

## Tretia vlna (Cline, 30. október 2026 CEST)

- **Mony READ: suma v otázke o výplate.** „Môžem si vyplatiť 100?“ dostane presný verdict z rovnakého pravidla
  ako formulár na prehľade (`payoutVerdict`): suma, čo ostane na záväzky, alebo o koľko záväzky presiahnu a ktorý
  prvý by nebol uhradený. Suma sa číta ako číslo najbližšie k slovu „vyplatiť“ (`payoutAskedAnswer` v
  `src/assistant/context.ts`, čistá funkcia); otázka bez sumy ďalej odpovedá prehľadom okna. Nasadené a overené
  produkčnou verifikáciou (`21bc976..c42ecf0`).

## Druhá vlna (Cline, 30. október 2026 CEST)

Nasadené priamo na main a overené produkčnou verifikáciou:

- **Peniaze vopred aj pre tím:** stránka klienta (`/ucto/klienti/:id`) zobrazuje rovnakú kartu peňazí ako klient
  na svojom domove (rovnaké funkcie `moneyView`/`moneyOutgoings`, nikdy iná suma); formulár „Koľko si môžete
  vyplatiť?“ je na tímovej strane skrytý, účtovníčka číta čísla bez klientovho formulára. Karta na domove klienta
  navyše dostala **rozklikávací zoznam očakávaných platieb** po položkách (deň, suma, čo to je).
- **Mony READ: otázky o faktúrach.** Otázka s číslom faktúry odpovedá splatnosťou a sumou priamo z evidencie;
  číslo, ktoré v evidencii nie je, sa povie, bez vymysleného dátumu. „Kedy mi príde platba?“ vypíše nezaplatené
  vystavené faktúry, „čo odíde / kedy zaplatiť“ známe záväzky. Všetko píše kód Firmy z dát firmy, model vidí len
  text otázky (klasifikácia); téma `money` v prompte klasifikátora rozšírená o príchod platieb.
- **Cenník poctivo:** karta balíka ukazuje „Prvý rok so závierkou“ = 11 mesiacov + závierka (prvý mesiac je
  zadarmo), doplnené, že ďalší rok je 12 mesiacov. `firstYearPlanCents` v `src/calc.ts`.
- **Rýchlosť:** `public/_headers` — fonty 30 dní, obrázky 7 dní, CSS/JS (hashované `?v=`) ročne immutable.
  Zvyšok (preload fontov, `font-display: swap`, rozmery, `srcset`, lazy) už bol v poriadku.
- **Zákaznícke rozhovory:** do sprievodcu pribudlo 5 hotových e-mailových šablón (pozvánka pre klienta,
  neklienta a odídenca, pripomienka, poďakovanie) a pravidlá oslovovania.

## Overenie v CI a oprava založenia: celá sada zelená (Cline, 30. október 2026 CEST)

CI na vetve `cline/audit-final` (PR #31) **celá zelená**: `check`, 1 768 unit, Peppol, **2 739 runtime** a
**130 browser**. Cesta cez GitHub Actions umožnila testy, ktoré lokálne neboli spustiteľné (bez `node`):

- CI odhalila a opravili sa 2 chyby mojich zmien: TS2532 (`uncovered[0]` pod `noUncheckedIndexedAccess`)
  a `moneyWindow` bez predvolených 30 dní (RangeError pri volaní bez počtu dní).
- **Opravená predtým existujúca flaky chyba na `main`** (3 zlyhávajúce founding testy, ktoré padali aj na
  main): overenie po opätovnom odovzdaní prihlášky počítalo kontroly podľa sekundy (`k.at >= since`), takže
  kontroly z predošlého kola v tej istej sekunde „prežili“ a prihláška sa dala overiť bez nových kontrol.
  Oprava v `src/founding/store.ts`: udalosti aj kontroly dostávajú **monotónne sekundy** (najmenej o 1 viac
  ako predchádzajúce udalosti/posledné odovzdanie) a kontroly sa počítajú prísne `>` od posledného
  odovzdania. Runtime teraz prejde deterministicky.
- Mony browser testy rozšírené o READ cestu (dátová odpoveď bez znalostného streamu), pričom pôvodné
  poradie testov (prenos konverzácie, skladanie panela) ostalo zachované.

## Mony READ: odpovede o firme z dát aplikácie + téma „Koľko si môžem vyplatiť?“ (Cline, 30. október 2026 CEST)

Pokračovanie „Peniaze vopred“ do asistenta: klientova otázka sa najprv klasifikuje (Haiku, iba text otázky —
**žiadne firemné dáta neopúšťajú aplikáciu**) a ak patrí medzi dátové témy, odpoveď skladá deterministický kód
z údajov firmy (`assistantAnswer`, `src/assistant/mony-route.ts` READ blok). Mimo týchto tém ide otázka do
znalostnej cesty (Sonnet z návodov) ako doteraz. Pridaná nová téma **`money: „Koľko si môžem vyplatiť?“`** do
`ASSISTANT_TOPICS` + klasifikačného systému + `assistantAnswer` (počíta tú istú logiku ako domov — `money.ts`,
takže asistent a prehľad sa nikdy nerozídu). Rýchla otázka pribudla aj do asistenta, Mony copy zosúladené
(„odpovedá z údajov Vašej firmy…“). Testy: `mony.runtime.mjs` (dátová odpoveď bez znalostného streamu, meterovanie
s témou), `mony.browser.mjs` (knowledge cesta cez tému `expert`, READ cesta cez `money`), assistant.units
automaticky pokrýva novú tému. Pridaný `docs/research/customer-interviews.md` (8 testov validácie pred ďalšími
modulmi). Stále platí: sadu treba spustiť u Claudea (lokálne nie je `node`).

## Peniaze vopred: finančný prehľad a scenár výplaty (Cline, 30. október 2026 CEST)

Najväčšia rozpoznaná medzera oproti vízii „digitálny partner podnikateľa“: pohľad dopredu. Nová sekcia na
domovskej obrazovke klienta (`/app`, `src/views/inside-pages.tsx` `MoneyCard`): **„Peniaze vopred“** — karta
„Voľné peniaze“ (zostatok + čo príde − čo odíde za 30 dní) s náladou (kryté / tesné / chýba / neznáme),
dlaždice Príde / Odíde / Na účte a **scenár „Koľko si môžete vyplatiť?“** (GET formulár bez skriptu, odpoveď
počíta, či po výplate ostane na známe záväzky, pomenuje prvý nekrytý záväzok; výslovne „pohľad na peniaze,
nie na zisk“).

- Čistá logika `src/app/money.ts` (okno 30 dní, nálady, payoutVerdict s kontrolou každého záväzku v jeho deň,
  najhlbší prepad, `immediate`), store `src/app/money-store.ts` (nezaplatené vystavené faktúry, nezaplatené
  prijaté faktúry, dane a mzdy z tých istých termínov ako `clientDeadlines` — dva pohľady sa nemôžu rozísť),
  kópia `app.home.money`, CSS `public/inside.css` (modrý gradient ako ticket, nálady vlastnými farbami).
- Hero webu komunikuje výhodu priamo: „V aplikácii vidíte aj to, čo Vám príde, čo odíde a koľko si môžete vyplatiť.“
- Testy: `test/money.units.mjs` (okno, nálady, výplata: krytie v deň, príjem po záväzku nekryje, najhlbší prepad,
  nulový zostatok, neznámy zostatok). Spustenie sady ostáva na Claudeovi (lokálne nie je `node`).

## Komunikácia: „umelá inteligencia“ → „softvér“ všade + audit Claude API (Cline, 30. október 2026 CEST)

Pokyn majiteľa: všade na webe aj v softvéri zmazať slovo „umelá inteligencia“ a nahradiť ho slovom „softvér“.
Vymenené všetky výskyty (hero, FAQ, SEO, robots/llms.txt, guides, právne informácie, obchodné podmienky,
asistent, fakturácia z vety, free tools, team UI „Presnosť softvéru“ / „Návrh od softvéru“, analytika).
V `terms.ts` preto **TERMS_VERSION 2026-10-26 → 2026-10-30** (zmena znenia podľa pravidla; po nasadení treba
obnoviť `CONTRACT_RELEASE` v Cloudflare dashboardi, lebo hash cenníka sa zmenil). Testy, ktoré kontrolovali
staré texty, zosúladené (e2e, assistant runtime/browser, ai-accuracy, analytics).

Audit Claude API častí (assistant/provider/service/store, mony, invoice-ai, reader): bez nálezu poškodenia;
kód na `main` prešiel CI. Zistené medzery (iba zdokumentované, nemenené): ročný údaj v cenníku počíta 12
mesiacov + závierku aj pri prvom mesiaci zadarmo (prvý rok je 11 platených) a interné komentáre stále hovoria
o „AI“ (čitateľ, analytika) — technické názvy, nie zákaznícke texty.

## Finálny polishing ponuky a oprava cache/deploy (Cline, 23. október 2026 CEST)

Presné texty od majiteľa (finálne): eyebrow „Výhodnejší štart s Firmony“, nadpis „Začnite s náskokom. Štyri
výhody za 0 €.“, podnadpis a štyri karty s akcentom „ZA 0 €“ (názov + popis) a nápoveda „Objavte všetky štyri
výhody.“ (mobile „Potiahnite prstom a objavte ďalšie výhody.“). Jediná odchýlka: pomlčka v popise karty 1
nahradená bodkou, lebo projekt zakazuje dlhé pomlčky. Zlepšený kontrast a riadkovanie doplnkového textu kariet
(biely 0.94, line-height 1.55) bez pretečenia na žiadnej šírke.
Vizuálny polishing: nadpis o stupeň menší, sekcia kompaktnejšia (menší padding aj medzery), stredná karta
dominantnejšia a bočné viac ustupujú (scale 0.85, opacity 0.85, posun 12 px), navigácia + nápoveda + CTA ako
jeden celok, čistejší prechod do sekcie „Vy pošlete doklady“.

Oprava cache/deploy: HTML malo `no-store`, ale CSS/JS/assets mali `public, max-age=0, must-revalidate` + etag,
takže sa po deployi mohla miešať nová stránka so starým CSS/JS z cache. Pridaný cache-busting: `asset(path)`
v config.ts pripája `?v=<revision>` (prvých 8 znakov commitu z BUILD_METADATA) k `/app.css` a `/flow.js`, takže
každý deploy má vlastnú URL a prehliadač aj edge cache vždy ťahajú nový súbor. Overené: check, 1 494 unit +
12 deployment, 2 272 runtime, UI sada 1440/390/320 px, Playwright Chromium aj WebKit na
1440/1280/1920/768/390/320 (stred = 0 px, bočné karty viditeľné, bez pretečenia). Bez zmeny schémy.

## Nekonečný 3D kolotoč ponuky (Cline, 23. október 2026 CEST)

Sekcia „Táto ponuka sa nedá odmietnuť“ je nekonečný kruhový kolotoč štyroch kariet: vpredu je hrdina presne
v strede, po bokoch dve plne viditeľné karty, štvrtá vzadu. `public/flow.js` (jediný skript) otáča kruh o štvrť
otáčky na klik, šípku, potiahnutie či klávesnicu — 2.5D orbita len z vodorovného posunu, mierky a tieňa (bez
`rotateY`/`perspective`/`filter`, ktoré v Safari skrývali bočné karty), takže nikde nekončí ani nepreskakuje.
Bočné karty stoja tesne vedľa hlavnej (dosah = jedna šírka karty), zostava zaberá ~76 % šírky a tri panely
(≈342 px) sú súčasne viditeľné; na mobile jedna karta a výrez suseda. Vpredu otvára „Založenie s. r. o. zadarmo“
(počítadlo „2 / 4“). Každá karta je sýty modrofialový sklenený panel s vlastným odtieňom, bielym „0 €“ odznakom,
veľkou 3D ikonou (okraje orezané na sklo, `object-fit: contain`) a plagátovým názvom s veľkým svetlomodrým
„ZADARMO“. Šípky, počítadlo a nápoveda sú pod kruhom, potom CTA; sekcia je bez okraja, biely–modrý–biely
gradient ju prepája s hero aj mesiacom. Overené v Chromium aj WebKit (Playwright): stred = 0 px, bočné karty
viditeľné a hit-testovateľné, rotácia ±10 klikov, 1440/1280/1920/768/390/320, bez pretečenia. check, 1 494 unit
+ 12 deployment, 2 272 runtime, UI sada 1440/390/320 px. Bez zmeny schémy.

## Kalkulačka odvodov a dane SZČO (Cline, 23. október 2026 CEST)

`/szco-kalkulacka`: ročný príjem → paušál 60 % (strop 20 000 €), SP 33,15 % a ZP 16 % s min/max základmi,
daň 15 % do 100 000 € príjmov inak progresívna 19/25/30/35 %, nezdaniteľná časť s redukciou. Čísla overené
proti primárnym zdrojom; osem kontrolných hodnôt systému sedí. Orientácia, bez súbehu/mikroodvodu/ZŤP.
1490 unit + 2272 runtime + 102 browser. Live.

Pridané `/sro-kalkulacka` (daň PO 10/21/24 %, dividendy 7 %) a domovka zviditeľňuje založenie a prechod zadarmo.
1494 unit + 2272 runtime + 102 browser. Live.

## Založenie s.r.o. + prechod, G4 (Cline, 22. október 2026 CEST)

[Implementácia](docs/formation.md): žiadosť klienta na `/app/zalozenie`, prípad tímu na `/ucto/klienti/:id/zalozenie`,
stavy + kontrolný zoznam 7 krokov, fronta na `/ucto`, zrušenie, nemenná história, súbeh, export a riadený výmaz.
Založenie v cene pri 36-mesačnom vedení; skorší odchod sa dopočíta. Kód koordinuje, právne úkony vykonáva človek.
Krok 80, SHA-256 stráži prvých 79. Overené: check, 1 485 unit + 12 deployment, 2 272 runtime (18 formation),
102 browser. Live.

## Dokončenie a nasadenie asistenta G2 (Cline, 22. október 2026 CEST)

PR #29 bol zablokovaný skutočným zlyhaním browser testu, nie len kvótou artefaktov: prístupný názov
selectu/textarea obsahoval hodnotu alebo možnosti. Oprava `aria-label` + asertia 200 (JSON receipt) +
vymazanie 95 artefaktov + `continue-on-error` na diagnostický upload. Overené: check, 1 485 unit,
12 deployment, 25 peppol, 102 browser. Zlúčené do main, Workers Builds úspešné, production verification
úspešná. Pridané doc 14 a art-spec. Schéma 79; ceny a terms bez zmeny.

## Asistent pre klienta aj účtovníčku, G2 (Codex, 22. október 2026 CEST)

[Implementácia](docs/assistant.md) v existujúcej službe: priame otázky bez cloudu a vlastná otázka
cez existujúce API. Model iba vyberá tému, Firmony skladá odpoveď z oprávnených aktuálnych údajov,
uvádza zdroje a čas. Cudzia firma/doklad, strata členstva či pridelenia, prepnutá session a vypnutie
počas volania neposkytnú odpoveď. Žiadne platby, generované daňové rady, voľné SQL alebo automatické podania.
Odborná otázka sa najprv pripraví z aktuálneho textu a výberu dokladu; klient ju ešte skontroluje a odošle.
Transakčné limity a opakovanie UUID chránia platené volania aj pri neistom finálnom zápise.
Admin má metadáta použitia a overený vypínač; textový chat sa neukladá, použitie patrí do exportu/archívu.
Nová schéma 79, prvých 78 nezmenených. Ďalší krok 80. Nová privacy verzia a pravdivý popis toku otázky,
bez nového kľúča, účtu alebo zmeny cien. Rozhranie ostáva v pôvodnom dizajne a dvoch pracovných pohľadoch.
HTTP/D1 súbeh, poruchy, tri rozpočty, browser formuláre a päť UI stavov; presné výsledky celej povinnej sady
a živé nasadenie sú v PR. Syntetický provider nie je produkčný pilot. G3-G6 a odborné uzavretie J2 ostávajú otvorené.

## Rovnaký postup prechodu na všetkých vstupoch (Codex, 22. október 2026 CEST)

Karta hlavnej stránky a tri existujúce návody opisujú spravovanú koordináciu rovnako ako nové FAQ.
Odstránená povinnosť klienta nahrať všetky podklady osobne aj nepodložený sľub pokračovania bez
prerušenia pred overením importu. Pôvodná osobná alternatíva zostáva. Prehľad vysvetľuje všetky
potrebné doplnenia; nepredstiera jedinú otázku pri viacerých úlohách. Právne pravidlá, ceny a výpočty
sa nemenia. Stratégia 13 rozlišuje historický inventár a implementovaný G1. Kontroly a nasadenie v PR.

## Upozornenie na doplnenie pri prechode (Codex, 22. október 2026 CEST)

Uloženie novej otázky a súkromného upozornenia je jedna transakcia so stavom aj históriou.
Súbeh vytvorí iba jednu verziu; rovnaká otázka neposiela ďalšie upozornenie. E-mail neobsahuje otázku
ani kontaktné údaje. Odkaz kontroluje členstvo a pri inej vlastnej firme žiada výslovné prepnutie;
nič nemení obyčajným otvorením. Cieľ sa zachová aj pri emailovom prihlásení bez otvoreného redirectu.
Regresie pokrývajú transakčný rollback, súbeh, súkromie, login a skutočné prepnutie cez prehliadač.
Nový stav výberu firmy je aj v UI sade 1440/390/320 px. Bez zmeny schémy 78, cien alebo overovania tímu.
Povinné kontroly presnej revízie a nasadenie sa evidujú v samostatnom PR. Doručenie závisí od existujúceho
outboxu a mailovej služby; nesľubujeme matematické exactly-once doručenie cez SMTP.

## Zrozumiteľné vysvetlenie prechodu na webe (Codex, 22. október 2026 CEST)

FAQ nadväzuje na spravovaný prechod G1: kontakt a potvrdenie, administratíva Firmony, odborná kontrola,
prípadný potrebný podpis a viditeľný priebeh. Ukážka rozhovoru žiada len užitočný podklad a obchodný účel;
nesľubuje paušálne daňové zaradenie podľa ceny notebooku. Ukážka e-faktúr pomenúva pripravované napojenie.
Bez novej zľavy, zmeny sloganu, účtovného výpočtu alebo predstieranej aktivácie poštára. Povinné kontroly
samostatnej vetvy a presné produkčné nasadenie sa evidujú v PR. Účinok na konverziu treba zmerať.

## Spravovaný prechod, G1 (Codex, 22. október 2026 CEST)

[Implementácia](docs/managed-takeover.md): krátka žiadosť klienta a odvolanie; prípad na pracovisku
účtovníčky, zodpovednosť a termín, overené oprávnenie/kontaktovanie, vlastný príjem súborov, kontrola
siedmich oblastí a nadväznosť na pôvodné importy. Priebeh a otázka sú aj na klientskom prehľade.
Nemenná história každej verzie, ochrana súbehu a starých formulárov, úplný export, zachované uchovávanie
a riadený konečný výmaz. Nový iba krok 78, prvých 77 bez zmeny. Osobná cesta klienta zostáva.
Text kontaktu odosiela účtovníčka po overení oprávnenia; žiadny automatický podpis, výpoveď alebo
predstierané prijatie či správnosť importu. Žiadne nové ceny a kľúče. HTTP/D1/R2 aj browser scenáre;
finálne povinné kontroly a živá revízia v PR. G2-G6, používateľský pilot a právne/poistné kroky zostávajú otvorené.

## Bezplatný fakturačný nástroj a ďalšie zákaznícke výhody (Codex, 22. október 2026 CEST)

Následná reálna kontrola živého webu doplnila jednotný slovenský výber súboru bez druhého systémového
ovládača. Zachovaný skutočný file input a viditeľný klávesnicový fokus; browser test používa Enter a file chooser.

Implementované `/faktura-zadarmo` a `/bezplatne-nastroje`, vstup z webu a vyhľadateľné metadáta.
PDF a rozpracované JSON údaje vznikajú iba v prehliadači, bez účtu, karty a odoslania fakturačných údajov.
Rozsah: bežná tuzemská B2B faktúra neplatiteľa DPH v EUR, najviac 50 položiek; presné centy, dátumy,
SK IBAN, bezpečný text a názov súboru. PDF má kontrolované zalomenie dlhého textu a odmieta znaky,
ktoré použitý writer nevie zachovať. Obnovenie vyžaduje nové potvrdenie rozsahu.
Žiadna nová databáza, úprava existujúcej fakturácie, zníženie cien alebo automatický marketingový kredit.
Samostatné jednotkové, HTTP a browser testy vrátane skutočného sťahovania a absencie sieťových zápisov.
[Realizačný podklad](docs/strategy/13-customer-advantage.md) rozpracúva ďalšie návrhy majiteľa, aktuálne
zahraničné originály, psychológiu nulovej ceny, náklady, hranice a postup G1 až G6 pre Clauda.
Prvý ďalší kandidát je spravovaný prechod, nie doživotné uzamknutie klienta. Výsledky finálnych kontrol
a overenie nasadeného commitu sú v PR. Používateľský pilot a ostatné návrhy sa neoznačujú za dokončené.

## Dôvera a výhodnosť na verejnom webe (Codex, 22. október 2026 CEST)

Na nový pokyn majiteľa [rozšírená rešerš originálov a konkrétna implementácia](docs/research/trust-and-value-2026-10-22.md).
Web vysvetľuje úlohu klienta, odbornú kontrolu a nezáväzný začiatok; ročný základ so závierkou je pri každom
balíku, rozsah/zodpovednosť a ochrana údajov dostupné pri cene. Kalkulačka už nepodsúva modelovú úsporu pred
vstupom zákazníka, uvádza predpoklady a ukáže aj vyššiu cenu alebo rovnosť. Jediný výpočet roka pre balíky aj
porovnanie, bez zmeny cien. Pridané reálne HTTP a mobilné browser scenáre. Povinné kontroly a nasadenie v PR.
Po čítaní pôvodného aktuálneho a vyhláseného budúceho zákona o DPH spresnená aj e-fakturačná komunikácia
a existujúci návod: určené dodania, rozdielne povinnosti príjemcu a platiteľa, sankcie a pripravované napojenie.
Bez fotografií, novej schémy, zmluvných sľubov, sledovania citlivých vstupov alebo programu odmien.
Pri záverečnej kontrole opravená aj kompatibilita odosielania plnej moci: rozšírený protokol je obmedzený
na dva dokladové endpointy, plná moc a banka majú pôvodné formuláre. Pridaný skutočný browser regresný scenár.
Predajný účinok a porozumenie skutočných záujemcov zostávajú na pilot; výskum nie je garancia rastu.


## Spoľahlivé odovzdanie dokladov a správ, časť J2 (Codex, 22. október 2026 CEST)

Implementované [potvrdenie jednotlivých prijatí](docs/client-delivery.md), pokračovanie nepotvrdenej dávky
po výpadku, zachovanie čiastočného výsledku a ochrana pred odoslaním do firmy prepnutou v druhom okne.
Opakovaná správa vrátane súbehu vytvorí jeden záznam a jednu udalosť; text zostáva v otvorenom formulári.
Pridané reálne HTTP/D1/R2 a mobilné prehliadačové scenáre so stratou odpovede až po serverovom zápise.
Bez novej schémy a zmeny cien, smerovania, účtovných postupov či oprávnení. Finálne kontroly a nasadenie v PR.
Výslovné odborné vybavenie konkrétnej otázky, J3 až J5 a používateľský pilot ešte otvorené.


## Pravdivý klientsky prehľad, J1 (Codex, 22. október 2026 CEST)

Implementovaný [spoločný výber ďalšieho kroku](docs/client-overview.md) z existujúcich údajov.
Úhrada, výpis, doklady, správa, osobné schválenie a potrebné nastavenie sa už neschovajú za všeobecný
pokojný nadpis odvodený iba zo spárovania. Ostatné známe kroky zostávajú viditeľné. Schvaľovanie používa
rovnaký výber ako jeho existujúca fronta a aktuálne oprávnenia sa čítajú bez série dotazov na jednotlivých ľudí.
Chýbajúce doklady sa počítajú z celého súčtu podľa mesiacov, banka ukazuje problém a posledné úspešné načítanie.
Pripojenie bez pohybov, prijatý nulový výpis a automaticky prijatý doklad nevyvolávajú zbytočné prvé nastavenie.

Zachované ceny, vzhľad, navigácia, účtovné postupy, AML a oprávnenia; bez novej schémy.
Pridané kombinované jednotkové a HTTP scenáre, desať stavov pre desktop a mobil a skutočné prekliknutie
hlavnej akcie v prehliadači. Povinné kontroly finálneho commitu a produkčný dôkaz sú evidované v PR.
J2 až J5, explicitné dokončenie klientskej otázky a používateľský pilot zostávajú otvorené.

## Jednoduchosť ako základ produktu (Codex, 21. október 2026)

Na pokyn majiteľa pripravený [produktový smer a odovzdanie](docs/strategy/12-product-simplicity.md)
pre Clauda aj Codex. Východisko je živý `main` po PR #18, `e46796114a163077321e639500f3b3fd95a4063d`.
Matica potrieb klienta a účtovníčky vychádza z existujúcich obrazoviek a oddeľuje overený stav od návrhu.
Poradie J1 až J5 začína pravdivým spoločným stavom `/app`, pokračuje odovzdaním dokladu a otázkou,
pracovným Dnes účtovníčky a členením firmy; zmeny navigácie sa najprv porovnajú na reálnych úlohách.
Každý krok má konkrétne miesta v kóde, akceptačné scenáre a navrhnuté meranie s používateľmi.

Táto zmena obsahuje iba poznámky. Nové rozhranie, ciele pilotu ani zhoda celej aplikácie s WCAG nie sú
označené za dokončené. Ceny, otvorený slogan, databáza a produkčné správanie sa nemenia. Ďalšia
implementácia: J1 podľa dokumentu, v samostatnej vetve a so všetkými povinnými kontrolami pred zlúčením.
Staršie záznamy pod týmto bodom sú história, nie aktuálny zoznam otvorenej práce.

## Ordinary MVPP preparation with shared identity and verified analytical facts (Codex, 17 October 2026)

Continues PR #8 on `codex/firmony-security-and-evidence`, remote parent
`bdf50dc88a362485b3df33e011ee827ec6114764`. Additive schema **22**; no merge or deployment.

- Prepares full ordinary R or corrective O MVPP 2026 XML from exact closed social-insurance figures.
  Independently pins 2026/2027 rules, preserves each fund, caps and uncapped accident insurance, and includes
  zero-paid employees. The official XSD and an independent output reader verify the actual XML.
- Reuses verified RČ across SP and health. Adds versioned, masked IČPV and separately checked monthly hours.
  Hours are not copied from the preceding month or inferred from salary; a reasoned explicit 999 choice handles
  genuinely undeterminable hours. First intake belongs to staff, never the customer.
- Source/fact/revision-bound previews and live SQL authority/CAS guards protect writes. Admin corrections
  append history, reopen affected generated reports/deadlines/queue and prevent a falsely complete handover.
  Original reports and receipts remain. IČPV/hour corrections leave unrelated recipients current; a shared
  RČ correction affects both generated SP and relevant health reports.
- Portable exports, incident holds, synthetic all-table restoration and positive controlled purge include
  registrations, monthly facts and provenance. Independent schema-21 upgrade checks preserve accepted external
  SP and internally generated health evidence without manufacturing missing data. Schemas 19–21 stay unchanged.
- Chrome journeys cover intake, a full replacement, an exact XML download and owner-only evidence. Layout
  checks cover staff/owner/error/correction states at desktop and mobile widths, including readable whole totals.
  Exact published-head counts, checksums and manual visual review are recorded in PR #8.
- [Scope and primary sources](docs/security/social-reporting.md) distinguish supported ordinary full-month
  employment, official XSD validity and unverified live acceptance. Special employment, RLFO, real portal
  import, production recovery, service capacity and legal/insurance/enterprise approval remain open.

## Insurer-scoped 514 preparation and verified identity history (Codex, 17 October 2026)

Continues PR #8 on `codex/firmony-security-and-evidence`, remote parent
`be6aa9d71da8985c766de32463c4c3a0e099a012`. Additive schema **21**; no merge or deployment.

- Generates UTF-8 text batches 514 for supported ordinary employment, separately for Dôvera, VšZP
  and Union. Uses closed contribution figures, separate minimum top-ups and the exact captured health
  regime. Later edits to an employee card do not rewrite historical payroll. Legacy slips without the
  captured regime stay on the external professional path; no missing facts are inferred.
- Adds masked, professionally verified insured identifiers with immutable version/reference history.
  Staff capture them once; admin corrections require reasons. A corrected identity invalidates affected
  generated coverage, deadlines and handover completion while preserving files and receipts.
- Header, source and identifier revisions bind the preview. SQL checks live role/assignment and concurrent
  writes; one preview commits one exact report/origin record. Output is prepared, never automatically
  submitted or accepted. Existing independent delivery/receipt and expert replacement controls remain.
- Owners receive the same file and origin without a new administrative form. Invited members cannot
  access employee files. Exports preserve the normative import filename, identity history and checked
  original hashes. Incident protection, frozen handover, synthetic recovery and controlled purge include
  the new records. Existing schemas 19–20 are preserved byte-for-byte.
- Independent text-contract, HTTP, actual Chrome, layout and separate schema-20-upgrade scenarios cover
  the implementation. Exact published-head check counts, artifact hash and visual review are recorded
  in PR #8. These are synthetic records and receipts, not live insurer acknowledgements.
- [Scope and primary sources](docs/security/health-reporting.md): official MZ SR 2026 text specification,
  insurer guidance and explicit exclusions. Live import/results for every insurer, SP generation,
  special employment, production recovery, staffing and legal/insurance approval remain open.

## Reviewed reporting periods and regular PREHLADv26 generation (Codex, 16 October 2026)

Continues existing PR #8 on `codex/firmony-security-and-evidence`, remote parent
`fed4389e160c496c247b66481e4a9c33329d5624`. Additive schema **20**; no merge or deployment.

- Corrects the preceding entry's overbroad cash-month assumption. Official FS examples distinguish the
  reporting period from the actual payout date. An accountant must confirm both separately; the system
  no longer infers the reporting period from a bank transfer. Existing payout facts and original receipts
  remain intact, while their old automatic period assignments require explicit review.
- Generates PREHLADv26 for supported ordinary regular s.r.o. wages without bonuses or special tax
  adjustments, using stored closed payslips and reviewed reporting periods. Previewed totals, explicit
  R/O kind, representation, header and scope attestation bind to the source/data revision. Generation
  saves exact XML and immutable provenance atomically; acceptance remains a separate checked receipt.
- Unsupported or incomplete sources lead to professional external preparation. Missing/invalid data is
  not replaced with zero. Representation by europio needs a checked power of attorney; a concurrent
  source or permission change prevents generation from committing with the old review.
- Administrators can document resolution of an empty incorrect period. Already recorded external
  submissions need an original supporting document. This retires internal work only, preserves all
  versions and does not cancel any statutory filing. Newly assigned income reactivates the task.
  Historical assignment identities and package revisions prevent reuse of an old resolution after
  another allocation cycle or late external evidence.
- Portable exports, original checksums, incident protection, handover freeze, synthetic restoration and
  controlled purge cover generation/review evidence. Owners receive read-only provenance and files;
  no additional customer administration is introduced.
- Local validation: **785 unit checks and 1,104 real workerd checks**, including the independent
  schema-19-to-20 transition and official XSD validation. Supplementary local TypeScript 6 passed;
  authoritative TS7, real Chrome and desktop/mobile validation on the published head are recorded in PR #8.
  Additional allocation-cycle and late-evidence regressions protect the freshness of expert resolutions.
- [Scope, exact format hashes and primary sources](docs/security/payroll-generation.md). Insurer reports,
  special/partial/noncash wages, annual payroll, live filing, real portal acceptance, production recovery
  and legal/insurance approval remain open. Tests use synthetic data; no perfect-service claim is made.

## Payroll evidence by recipient and actual paid month (Codex, 16 October 2026)

Historical schema-19 entry: its universal paid-month FS mapping and absence of any official payroll
generator are superseded by schema 20 above. Preserve this entry as change history, not a current rule.

Continues existing PR #8 on `codex/firmony-security-and-evidence`, remote parent
`1da802f8f81cecbfaf959ec4c7136a79b543cb29`. Schema **19**; no merge or deployment.

- Closing regular monthly payroll atomically saves an immutable source and separate SP/represented health-insurer
  obligations, including zero contributions. Legacy closed runs can gain evidence without unlocking financial data.
- An accountant explicitly verifies actual payment with a date and settlement reference. The FS prehľad belongs
  to the paid month; several wage runs paid in that month share one target. Later income or a corrected payout
  invalidates earlier completion while preserving the original report and receipt. Planned payday is not cash proof.
- Exact externally prepared files have separate prepared/submitted/accepted/rejected/review states and immutable
  version/receipt history. Acceptance/refusal requires a checked original. Admin review is required for successors
  of sent/accepted/disputed reports and corrections of an attested payout. No statutory correction type is invented.
- Recipient work appears in the existing all-period queue and deadlines. Owners see the same read-only evidence;
  invited members cannot access payroll originals. Fresh verification, live SQL assignment/role checks, revision
  guards and receipt reuse protection apply. Independent recipient reference namespaces do not cause false collisions.
- Complete portable exports include sources, payouts, every report version and original proof. Checksums, incident
  holds, source undo protection, pending-work handover freeze and controlled retention cover the new data. Lost commit
  acknowledgements retain originals; concurrent uploads/decisions commit once. All-table synthetic restoration includes it.
- Local validation: **768 unit checks and 1,066 real workerd checks passed**, plus supplementary TypeScript 6
  (native TypeScript 7 runs in CI). Added an actual Chrome payroll/owner journey and five desktop/mobile capture
  pages. Published-head CI, artifact digest and visual review are recorded in PR #8.
- [Scope and primary sources](docs/security/payroll-evidence.md): official payroll files still require an external
  payroll program/portal and professional checking. Partial, irregular and noncash income, annual returns, live
  delivery, production recovery and legal/insurance approval remain open. No automation percentage or production
  perfection is asserted. Larger companies still need the existing individual scope/capacity/coverage review.

## Separate delivery evidence for shared accounting workflows (Codex, 16 October 2026)

Continues PR #8 on `codex/firmony-security-and-evidence`, remote parent
`ee090d450d7a71c4d0fdf20d3bba5449c3a33789`. Schema **18**; no merge or deployment.

- Replaced the misleading internal “filed” success with exact prepared XML versions and independent
  VAT/KV/SV/DPPO/UZ delivery histories. An accountant records external submission or checks a receipt;
  acceptance/refusal requires an original and explicit matching. Preparation is never proof from an authority.
- Added a shared company register for accountant and client, a scoped work queue across all current periods,
  direct receipt completion, pagination, meaningful conflicts and mobile layouts. The customer has no new
  evidence-management duties. Payment instructions remain distinct from acceptance.
- Pending, refused, disputed and legacy unverified forms stay open. Changed unsent/refused drafts require
  reopening instead of a fabricated statutory correction. Mixed-state corrections still require expert handling.
- SQL guards preserve XML/history, prevent receipt reuse across forms, check live assignment/role, serialize
  stale revisions and prevent source undo or company deletion from erasing sent evidence. Accepted SV
  reclassification preserves original payload identity. Ambiguous commit failures keep committed R2 originals.
- Original receipts and history are portable, checksum verified and covered by incident holds, synthetic
  restoration and controlled retention. A pending current form blocks handover freeze; frozen dossiers are
  read-only. Missing/corrupt receipts prevent a successful complete export.
- Validation before publication: **753 unit checks and 1,012 real workerd checks passed**; supplementary local
  TypeScript 6 passed (native TS7 requires CI in this environment). Added real Chrome filing/client journeys
  and five mobile/desktop capture pages; exact published-head CI and visual review are recorded in PR #8.
- [Operational scope and evidence](docs/security/filing-evidence.md) explain the manual receipt verification,
  official FS sources, unchanged legal/insurance gates and remaining work. Payroll confirmations for each
  recipient remain unverified; the old group checkbox no longer closes their deadline. Live filing, certified
  eInvoice delivery, production backup recovery and an independently reviewed pilot remain prerequisites.


## Shared workflow, AI validation and duplicate correctness (Codex, 15 October 2026)

Follow-up on the existing cumulative PR #8, remote parent `4d5669e0387a84367ea7cf2d95f9ac4ef8886ead`.
The schema stays at **17**. No extra PR/branch, merge or production deployment.

- Fixed false duplicate proposals across independent suppliers sharing a number and amount. Known different
  IČOs override similar names; missing identity is not invented. Distinct known dates protect reused receipt
  numbers when no eKasa code is available. Strong eKasa identity continues to take precedence.
- Duplicate edges now point backwards in ingestion order, including equal timestamps. Concurrent checks of
  one batch cannot create a cycle. Finishing older OCR rechecks newer unbooked copies, so out-of-order model
  responses do not bypass the new ordering. Candidate search remains bounded; this is no perfect-detection claim.
- AI dates must be actual calendar days. Document kinds/categories use own properties rather than inherited
  object members. Malformed response envelopes/tool inputs fall back to a person without throwing in the reader.
  Invalid facts remain empty for professional review; the client is not asked to repair the model's answer.
- A rejected mutation resumes on an existing GET work page after authentication, retaining accounting-period
  query context only from that same page/origin. It never replays the POST. Key-management failures render the
  usable verification form and return to key management, rather than raw JSON. Authorization remains separate.
- Added concurrent D1 and HTTP workflow regressions, a Chrome CTAP2 journey through a real POST-only handover
  action, and narrow/desktop captures of blocked actions, key errors and uncertain-document review.
  Local checks and final exact-head CI are recorded in the PR. External bank/model/filing acceptance and production
  restoration remain unproven; unit/runtime/browser success does not prove an error-free accounting service.
- [One shared product](docs/strategy/11-shared-product-and-automation.md) records the owner's requirements,
  actual responsibilities, remaining concrete work and measurement criteria. No 99% automation rate, active
  insurance or signed legal approval is asserted.

## Passkeys, incident evidence and recovery drill (Codex, 15 October 2026)

Current branch: `codex/firmony-security-and-evidence`, based on the final cumulative PR #7 head
`04ec8eb8112fda32e6170b85d43ec2b8f16ce3fa`. All previous accounting and contract work is preserved.
Schema steps **16–17** add UV passkeys, controlled provisioning/recovery, incidents and retention guards.

- [Security and operations](docs/security/README.md): mandatory team WebAuthn UV; 12-hour ordinary and
  five-minute sensitive freshness; rotating sessions, one-use five-minute challenges, canonical HTTPS RP,
  pinned official verifier/browser libraries. Email alone cannot replace an existing key or open team work.
- First staff enrollment requires independent activation. Explicit finite bootstrap has a durable consumed marker.
  Recovery needs two distinct current administrators, separate from the recipient, with identity references;
  consumption rechecks approval/revocation and atomically replaces keys and invalidates sessions/mail links.
  A fresh customer mailbox session may enroll the first key; full owner exports require recent UV.
- Internal incident register has scoped access, owner/backup, review dates, versioned reassignment and immutable
  decision history. Open cases and holds block SQL/R2 retention deletion; review dates never expire protection.
  A new review cancels a pending release. Release and closure require independent administrators.
- Confirmed handover first freezes writes for at least 24 hours before destructive deletion. A case arriving
  after that claim is explicitly flagged as potentially partially lost; subsequent stoppable deletion is blocked.
  Tests inject cases during R2 listing and after deletion. Retiring handover attachments keeps the original
  and provenance until controlled retention; portable exports include clearly labelled retired files.
  Failed new paper uploads clean up their uncommitted UUID object after a concurrent freeze. No cross-D1/R2 atomicity or WORM claim is made.
- Local restore drill copies all business tables, schema/triggers and originals/metadata into another empty D1/R2,
  checks hashes/foreign keys/contracts/holds, rejects corruption and disables restored bearer credentials.
  It uses quiescent synthetic data. Production backup, independent evidence archive, live-provider recovery,
  staffing and measured production RPO/RTO remain unverified. Business readiness stays UNKNOWN/NO-GO.
- Verification at `f201c33f`: native TypeScript 7, **699 unit / 944 workerd / 7 Chrome WebAuthn checks**,
  and **57 layouts** passed [CI](https://github.com/grapuu/firmony/actions/runs/38782077416).
  The downloaded 58-image artifact matched SHA-256
  `85ae2576fd80a9afa14ac4ef69d60804ad51f4122fabb2c7eee615a033511017`; reviewed desktop and narrow screens,
  including retired attachments and stacked incident facts. The browser test explicitly waits for the signed
  re-verification response and resulting work form; the final head receives the same complete CI.
  New dependency audit reported zero advisories when checked. No merge or production deployment.


## Responsibility, contract evidence and larger-client intake (Codex, 15 October 2026)

Current branch: `codex/firmony-liability-and-enterprise-readiness`, based on PR #6 at
`ecc5ab1f8d5a93dd31e9e8019f5599e01d1b3c2a`. It contains all previous accounting, history, period-lock,
SV and support work. Schema step **15** adds contract snapshots and append-only intake reviews.

- [Responsibility preparation](docs/responsibility/README.md): current Slovak primary law, a qualified discussion
  of conflicting appellate approaches to liability caps, competitor contract evidence, a concrete clause/process
  pack for the lawyer, the broker's underwriting matrix, financial-capacity scenarios and an individual route for
  user-reported opportunities of approximately €2M/€45M turnover. No client, policy, limit, reserve or premium is invented.
- Proposed terms **2026-10-15** remove the twelve-fee foreseeability shortcut and exclusive-fault wording,
  distinguish legally due tax from irreversible loss of a lawful entitlement, and retain causation and mitigation.
  These terms await legal/underwriting approval. Existing contracts are not changed retrospectively.
- Ordinary professional-policy documents can exclude explicit guarantees and contract deadlines. Insurer consent,
  notification, serial losses, cloud/AI and liquidity must be resolved before sale; an insurance refusal does not
  itself extinguish a valid claim against the service provider. All seven new business evidence gates are UNKNOWN/NO-GO.
- Fixed a substantive defect: old code stored the terms version but displayed/exported today's wording and tariffs.
  New acceptance stores the full text, catalogue, operator, client, chosen plan, signer, start and time in the same
  transaction, with SHA-256. The app/ZIP read the saved snapshot. A corrupt snapshot blocks a complete export.
  Legacy 2026-10-13 is a labelled reconstruction, not fabricated proof of acceptance; unknown versions have no live-text fallback.
- Signing is closed without valid, catalogue-bound legal/insurance release evidence. Each order also needs an
  admin's documented expert review, supported micro scope, verified signing authority, named accountant, capacity/
  risk assessment and specific plan. Bespoke/held/expired/revoked cases cannot sign a standard package. The final
  transaction rechecks the latest decision, including revocation after the request read. Internal report links
  are not exposed in the client's contract JSON. Manual creation of a client account is not contract acceptance.
- SHA-256 and ordinary database immutability are not qualified signatures or protection from database administrators.
  Claims register/legal hold, independent evidence preservation, live insurance, staffing and production restore
  remain explicitly open prerequisites, not completed features. No external message, merge or deployment was made.
- Local verification before publication: **690 unit checks and 844 workerd checks** passed; supplementary TypeScript 6.
  New cases cover release validity, price/wording changes, tenant/role access, missing evidence, stale proposals,
  different plans, expiry, revocation races, duplicate acceptance, exact exports, missing archives and deliberate corruption.
  CI adds four actual contract/review captures to the existing seven at 1440/390/320 px (33 layouts).
- The first exact-head CI passed native TypeScript 7, all 690/844 checks and all 33 layouts
  ([run](https://github.com/grapuu/firmony/actions/runs/38732063245)). Its downloaded screenshot artifact matched
  SHA-256 `a90b446ffbd86b78e60ce354eb7c579f5c9f77bce59064adcb96ee0d40967f63`. Visual review prompted a small
  mobile improvement: contract facts stack label above value at narrow widths, and a verified stored record
  uses a calm blue status rather than an amber warning. The final commit receives its own CI verification.
- Removed the obsolete single-feature push trigger from CI; PRs and `main` remain checked. Prior PR heads were
  verified as ancestors of this cumulative base; branches/history are retained. The current PR is the review entry
  to `main`; merging and deployment remain the owner's separate decision.


## Strategy and unanswered support (Codex, 15 October 2026)

Branch `codex/firmony-strategy-and-service-quality`, based on PR #4 at
`58f6520b7f1d190adfbce9bddea536633a9413db`. No merge, production deployment, destructive migration,
external messages or advertising spend. The existing schema stays at step 14.

- [Ten strategy documents](docs/strategy/README.md), a primary-source register and an explicit launch evidence
  registry. They cover the actual capability map, 13 competitor/reference profiles across 14 dimensions,
  the 16-step client journey, accounting scenario matrix, eFaktúra/provider design, customer research plan,
  original positioning, channel experiments, economics without invented inputs, ranked implementation cards,
  December gates and 20 failure scenarios. Proposed pilot/research numbers are plans, not existing clients.
- Production is not proven. All ten critical launch gates remain UNKNOWN/NO-GO until real evidence is reviewed.
  Local XML/mocks do not prove tax filing, live banking or Peppol delivery. Previous period locks, SV corrections,
  histories and handover guards are reused rather than rebuilt. December readiness/pilot is distinguished from
  the 1 January 2027 service date currently configured in the public site.
- Fixed a concrete service defect: the inbox, company list and navigation used the last message, so a client
  follow-up reset the wait and a system notification could hide an unanswered question. They now share a query
  scoped to visible companies and retain the oldest client message after the last explicitly audited personal
  reply. `message.answered` must match the company, message and author; notices signed by an accountant are still
  notices. Equal timestamps use stable insertion order. Missing evidence keeps the question pending.
- The inbox displays original waiting time, unanswered-message count, assigned accountant or missing assignment,
  next-working-day response target and lateness. The target preserves Bratislava wall time across DST and uses
  the existing Slovak holiday calendar, including temporary 2026 exceptions. This measures first personal response,
  not substantive resolution. Automatic escalation, substitute assignment and resolution tracking remain roadmap work.
- The original hero now puts the owner first: “Vy budujete firmu. My strážime účtovníctvo.” The explanation and meta
  description state the agreed scope. Prices, planned accountant pay and accepted contract wording are not changed.
- Validation: **675 unit checks and 808 workerd checks passed**, plus the supplementary TypeScript 6 check.
  Fifteen new unit cases cover ordinary days, weekends, local midnight, DST, Easter, year end and holiday exceptions.
  Twenty-seven new runtime cases cover notifications (including named authors), reading, explicit replies,
  foreign events/authors, tenant visibility, demo/closed firms, reassignment, same-second ordering and escaped previews.
  A first completed runtime run passed 806 cases; a later local run lost a loopback socket before the new tests,
  and a clean rerun passed all 808. All external services remain local mocks.
- CI uses native TypeScript 7 and expands browser verification from four to seven real runtime captures at
  1440/390/320 px: monthly SV, transition, open/locked periods, home, waiting support and empty support.
  It checks overflow, unique IDs and page-specific controls; screenshots stay in the Actions artifact.
- The first exact-head CI passed all 675/808 checks, native TypeScript 7 and all 21 layouts
  ([run](https://github.com/grapuu/firmony/actions/runs/38726782077)). Its downloaded screenshot archive matched
  the published SHA-256 digest. Visual review of the real desktop/mobile home and 320px support screen prompted
  a final small polish: shorter queue instructions and a naturally wrapping deadline badge, rather than two
  narrow text columns. The first-response clock still does not measure substantive resolution.

The report of the session that continued Firmony from 14 October 2026 (15:17 Bratislava), milestone by milestone:
what was built, what each rule leans on, which checks pass, what remains, and what a professional should read before
it is relied on. The project's own notes are `CLAUDE.md`; this file is the report beside them.

Branch: `claude/firmony-deadlines-closing-payroll` (pushed; pull requests are opened and never merged by the builder:
`main` is the owner's to merge). Nothing is deployed, no production data exist, nothing was bought.

## The start: what was found (14 October 2026, 15:17)

- The repository `grapuu/firmony` was mounted at `/workspace/firmony`, writable, `main` at `277764d`, clean.
- `npm ci`: 65 packages, no vulnerability. `npm run check` (TypeScript): clean. `npm test`: 466 of 466.
  `npm run test:runtime` (the deployable bundle in workerd): 552 of 552. There was nothing to repair first.
- "Step 26 of 53": no such plan is in the repository (neither in `CLAUDE.md` nor in the history). What was followed is
  the order the owner was given at 10:53 on 14 October (`CLAUDE.md`, "Where things stand") in the priorities of the
  session: (1) every client's deadlines on one screen, (2) the closing and the corporate income tax return,
  (3) payroll, (4) the digital postman, (5) eKasa receipts, (6) the gaps `CLAUDE.md` lists.
- Not decided and not touched: the domain (firmony.ai stays the placeholder in `BRAND`), the product for investors.

## Milestone 1: every client's deadlines on one screen (done, 14 October 2026)

What the accountant gets (`/ucto/terminy`, second in the column and in the phone's tabs):

- Every client's deadlines in groups (overdue, within 7 days, within a month, later, done on demand), four figures
  (overdue, within a week, ready to be filed, the client's), filters by whose a deadline is, and the administrator's
  choice of an accountant. Each row: the day (red with the days past when late), what it is, the client, whose it is,
  its state, and the link where it is done. The same list for one client on the client's page ("Termíny").
- What is listed: the VAT return and the control statement of each period, in the state of the VAT page itself
  (ready, blocked with how many things, running, filed); a payer's older period of ours never filed; a corrective or
  a supplementary return of a period changed after filing; the recapitulative statement of a period with supplies to
  another member state (marked as filed here, since the app does not prepare it yet); the VAT the client has to pay
  until the bank shows it paid; the client's documents of a month by the 10th; the closing and the corporate income
  tax return of last year by 31 March (marked as filed here until milestone 2 files it); the handover of the books at
  the end of a contract.
- Code: `src/team/deadlines.ts` (the rules, pure), `src/team/deadlines-store.ts` (a fixed number of queries whatever
  the number of clients, no lists of ids), `src/views/deadlines.tsx`, `POST /ucto/klienti/:id/podane` (the mark),
  schema step 6 (`filings`), deleted with the company's data at the end of a contract.

What it leans on (read on 14 October 2026):

- VAT deadlines: the 25th after the period, the next working day (§ 78(1), § 78a(7) of Act No. 222/2004 Z. z.; § 27(2)
  of Act No. 563/2009 Z. z.), as the VAT milestone already had them. A supplementary return by the end of the month
  after the finding (§ 16 of Act No. 563/2009 Z. z.).
- The recapitulative statement: § 80 of the VAT Act, within 25 days after the period, monthly as a rule, quarterly for
  services alone or goods up to 50 000 € (Financial Directorate, methodical guidance to § 80; dauc.sk; poučenie
  SVDPHv20). A person registered under § 7a files it for the quarter.
- The closing: § 49(1) of Act No. 595/2003 Z. z. (three months after the year, the next working day), the extension by
  notice under § 49(3) (podpora.financnasprava.sk; FR SR information 7/PO/2026/IM); points 5.2 and 10.4 of Firmony's
  terms for which years are ours.
- The days off: Act No. 241/1993 Z. z. as amended by Act No. 261/2025 Z. z. (slov-lex.sk consolidated text, Národný
  inšpektorát práce, aksamec.sk).

Found on the way and put right:

- The days a deadline moves past listed 17 November, 8 May and 15 September for every year. Since 1 November 2025,
  17 November is no day off (§ 2(3)); 8 May and 15 September are none in 2026 (§ 4b). No VAT deadline met those days,
  but payroll's will. `isWorkingDay` is now year-aware; `workingDayFrom` is shared.
- A month of a person registered under § 7a with a document not booked yet was "Nepodáva sa" (nothing to file): the
  document may be the very service from abroad that obliges it to file. It is now "Treba vyriešiť" until every document
  of the month is booked.

Checks: units 466 → 504, runtime 552 → 582, all passing; the screens were looked at in the playground at 1440, 390 and
320 px (nothing overflows). 32 rules taken out once with `scripts/dev/mutate.mjs`: 31 held at once, and the last ("only
what is not done can be late") since a check was added for it.

For a professional to read:

- Whether 8 May and 15 September are days off again in 2027 (the transitional § 4b names 2026 alone; a later act could
  extend it). The code says they are; one line changes it.
- The recapitulative statement of a quarterly VAT payer that supplies goods to the EU above 50 000 € a quarter is
  monthly; the screen shows it for the VAT period. Rare for a young company; the accountant decides.
- The closing of the year before the contract started is listed as the former accountant's (point 5.2 of the terms,
  "ak sa nedohodneme inak"); an agreement to do it cannot be recorded yet.

What remains of it: the recapitulative statement's own XML; payroll's deadlines (with payroll); the motor vehicle tax
and the advances on income tax (with the closing). At hundreds of clients the screen reads every VAT client's last four
months of documents: to measure on the first real month.

## Milestone 2: the closing and the corporate income tax return (done, 14 October 2026)

What the accountant gets (`/ucto/klienti/:id/zavierka?rok=`, from the client's books card and from every closing on
the screen of deadlines):

- The financial statements of a micro entity (Súvaha Úč MUJ 1-01 and Výkaz ziskov a strát Úč MUJ 2-01) worked out from
  the books, in whole euros, with the year before when the books hold it.
- The corporate income tax return worked out row by row (100 to 1110, Tables A, B, D, F, K): the rate by the taxable
  revenues, the losses of five years, the minimum tax (halved, shortened, or none in a first period), its credit in
  three years, the advances paid that the bank shows, the tax to pay or the overpayment, and the advances the next year
  brings. The books propose what they can (representation, gifts, bank interest taxed by withholding, depreciation, the
  taxable revenues, the advances); the accountant adjusts the rest in one form, and what equals a proposal keeps
  following the books.
- What keeps the closing back, each with the way to it (documents and payments of the year not in the books, cash
  below nought, an account the statements have no row for, the company's DIČ, seat and SK NACE, the tax not booked).
- "Zaúčtovať daň": the tax booked by an internal document on 31 December (591 against 341).
- The two files the Financial Administration takes, validated against its own schemas in the tests: the return
  (DPPOv25) and the statements (UZMUJv14), for "Načítať zo súboru" in eDane.
- The deadline moved by a notice (§ 49(3)), shown and used everywhere; red once it has passed.
- "Označiť ako podané": the client gets a message with the tax to pay, the due day, the account (prefix 500224 and the
  personal tax account) and the variable symbol (170099 and the year), or the overpayment, and the advances to pay
  next; "Zrušiť označenie" takes it back and tells the client.
- The client's Dane page lists the income tax with a PAY by square QR code; the screen of deadlines shows "Úhrada dane
  z príjmov" as the client's until the bank shows it paid.
- Code: `src/app/closing.ts` (the rules, pure), `closing-form.ts` (the adjustments, pure), `closing-xml.ts` (the two
  files), `closing-store.ts` (the table, the payments, the year put together), `src/views/closing.tsx`, the routes in
  `src/team/routes.tsx`, schema step 7 (`closings`), deleted with the company's data at the end of a contract.

What it leans on (read on 14 October 2026, from the sources themselves):

- The eForms and their schemas from pfseform.financnasprava.sk: DPPOv25 (form.622, with the eForm's own formulas,
  e.g. rows 150 and 250 computed from Table B) and its poučenie MF/012187/2025-721; UZMUJv14 (form.301, measure
  MF/15464/2013-74 as amended), with the accounts each row names.
- Act No. 595/2003 Z. z.: § 15(b) the rates for 2025 on (10 % up to 100 000 € of taxable revenues, 21 %, 24 % above
  5 000 000 €), § 2(w) the micro-taxpayer (60 000 €), § 30 the losses, § 46b the minimum tax (with the band of
  11 520 € from 2026), § 42 the advances, § 47 rounding, § 49(1), (3), (11) the deadline, its extension, the
  statements.
- The Financial Directorate's information 7/PO/2026/IM (financnasprava.sk): the account 500224-OÚD/8180, the symbol
  1700992025, nothing to pay up to 5 €, the extension's notice by 31 March, the new deadline the end of a month, the
  tax due then (1/PO/2025/IM, as seminare.sfera.sk republished it, says the same of 2024). Its answers on interest
  taxed by withholding (row 210, stays in row 560) and a first period (no minimum tax). Decree No. 378/2011 Z. z.
  (podnikajte.sk, opytajsauctovnika.sk) for the symbols of advances.

Found on the way and put right:

- An advance on the income tax carries the same kind of symbol as VAT (1100MMRRRR): a payment to the income tax's
  account was booked as VAT and counted as VAT paid. The books (`reasonAccount`) and the VAT paid (`taxPaid`, the
  screen of deadlines) now tell them apart by the prefix of the account the money went to (500224 or 500240).
- The eForm computes rows 150 and 250 from Table B; typing them directly would be overwritten when the file is opened.
  The form asks for Table B instead and fills both rows from it.

Changed from milestone 1: the closing is no longer marked filed on the screen of deadlines (`filings`, kind `closing`)
but on its own page (`closings`), which tells the client what to pay; schema step 7 moves any mark it finds. The
screen's closing row links to the page; the recapitulative statement keeps its mark.

Checks: units 504 → 562, runtime 582 → 619, all passing, TypeScript clean. The pages were looked at in the playground
at 1440, 390 and 320 px (nothing overflows; on a phone the statements' table scrolls inside its card, as the books'
tables do). 52 rules taken out once with `scripts/dev/mutate.mjs`: 49 held at once, the other three once a check was
added for each (the statements changed since the filing, a tick stored only against the proposal, the income tax paid
with the year's own symbol).

For a professional to read (the builder's reading, not an accountant's or a tax adviser's):

- The rounding of the statements to whole euros: when the two results would differ, the difference goes into row 22
  (money) of the balance sheet. Practice differs (some put it into other receivables or liabilities).
- 042 and 052 (assets being acquired, advances for them) go to row 06 whatever the asset; the form spreads them over
  rows 05 to 07 by kind. Every receivable and liability is taken as short-term (the books keep no maturity); 47x and
  48x stand in row 35.
- 431 (the result waiting for the general meeting) stands in row 32 with 428 and 429 in the next year's balance sheet.
- The first year with Firmony: the year before comes from the former accountant's statements, which the app does not
  hold; the page says to fill it in eDane.
- The tax depreciation is proposed equal to the books' (551, which also holds intangible assets); a difference is the
  accountant's to type in Table B.
- A period that begins after 1 January is taken as a company's first one (no minimum tax, § 46b(7)), which she can
  untick; a company founded on 1 January is not caught. Whether the 60 000 € of a micro-taxpayer is shortened for a
  first period shorter than a year was not read; the app does not shorten it.
- Deferred tax is not booked (a micro entity is understood not to have to; to confirm).
- The client's message says the advances are paid from the first quarter (or month) after the filing deadline,
  quarterly to the end of each quarter, monthly to the end of each month (§ 42); to confirm the wording.
- `opravnenaOsoba` names europio's representative as "splnomocnenec"; the share of the tax for a recipient (§ 50) is
  left unassigned (`c7paragraf50`), the client's to decide, which the app does not ask.
- DPPOv25 is the form for periods of 2025. Firmony's first closings are for 2027 (the service starts on 1 January
  2027): the form for that period (published in January 2028) and its SK NACE list must replace the schema before the
  first real filing; the schema check in the tests will say what changed.
- The advances the bank shows are those paid to the income tax's account with a symbol of the year: a bank that does
  not say the other side's account (rare: Fio, open banking and SEPA XML statements do) leaves it to the accountant.

What remains of it: the notes to the statements (poznámky, written by the accountant and attached as a PDF), a company
that is not a micro entity (Úč POD), a supplementary return of a filed year (the page says when one is to be
considered), the notice of extension as a file (OZN493; filed in eDane today), the closing entries (710, 702), asset
cards and depreciation, the relief rows and the special tax bases, a request to refund the overpayment, reminders of
each advance's day.

## Milestone 3: payroll, first part (done, 14 October 2026)

Scope chosen: employees in an employment relationship with a monthly wage, the case of a young company's first hires.
The other kinds (agreements, a director's remuneration, pensioners, students) and the reports as files come next.

What the accountant gets (`/ucto/klienti/:id/mzdy`, from the client's books card and the screen of deadlines):

- Employees (wage, insurer, start and end, the signed declaration, a disability, the deductible item, an exception
  from the minimum health advance, children for the bonus, the IBAN).
- A month's payslips worked out from the income she types (the wage offered, a share of it for part of a month): each
  kind of social insurance of both sides, health insurance with the minimum advance and the deductible item, the
  non-taxable part, the tax by the four bands of 2026, the child bonus with its cap and its cut for high incomes, the
  net wage, the employer's cost; a breakdown and a payslip to print.
- "Uzavrieť mesiac": the payslips kept as they were, the month booked (521, 524, 331, 336.100, 336.200, 342), and the
  client told in the app what to pay, to whom and where: each employee's net wage, the Social Insurance Agency, each
  health insurer, the tax office (prefix 500259, symbol 1100 and the month, within five days of the payout).
- The books recognise the payments: the Social Insurance Agency's, an insurer's or the tax office's sum of a closed
  month goes to its account (336.100, 336.200, 342), anything else marked payroll is wages (331).
- The screen of deadlines: each month closed by its payday, and its reports (Social Insurance Agency by the payday,
  health insurers within three days, the tax office's overview by the end of the next month), marked when filed.

What it leans on (read on 14 October 2026, from the sources themselves where they publish it): the Social Insurance
Agency (tables from 1 January 2026; the general assessment base of 2025, 19 440 €; deadlines and rounding), VšZP and
Dôvera (rates from 2026, the minimum advance, the report within three days), the Financial Directorate's pages on the
advance, the bands, the child bonus of 2026, rounding since 2020, the remittance and the overview, and the subsistence
minimum of 1 July 2026 (295,22 €) for 2027. Checked against published figures: SuperFaktúra, Bezúčto, Peniaze.sk,
KROS (each named in the unit checks).

Found on the way and put right: the app's date reader refused a birth date before 2000 (it now takes the 1900s where a
birth date is asked for).

Checks: units 562 → 590, runtime 619 → 639, all passing, TypeScript clean. The page was looked at in the playground at
1440, 390 and 320 px (the month's table scrolls inside its card on a phone). 32 rules taken out once with
`scripts/dev/mutate.mjs`: 30 held at once, the other two once a check was added for each (nobody employed has no days
in a month; the employer's social insurance goes to 524).

For a professional to read (a payroll accountant's eye):

- 2027's figures: the subsistence minimum and the average wage are published; the rates of 2026 are carried (the
  health rate of 5 % is legislated for 2026 and 2027); the child bonus of 2027 is taken as 2026's. To confirm in
  December 2026.
- The employer's unemployment insurance is split 0,5 % + 0,5 % (the support in short-time work), as a company that
  pays the latter; to confirm that every client is such an employer.
- The child bonus for the month of a birth is granted (the bonus "for the month the child is born"); and the bonus is
  granted with the declaration alone (the employer asks for the documents).
- The minimum health advance is shared by the days of the month in employment; the exceptions are the accountant's
  tick.
- The payday decides the due day of the insurance and its reports (the Social Insurance Agency's report on the payday,
  § 143(2) of Act No. 461/2003 Z. z.); a company without a payday agreed pays by the last day of the next month.

What remains of payroll: agreements (dohody) and their exemptions, a director's remuneration, working pensioners and
students, sick pay (náhrada príjmu, 14 days from 2026) and holiday pay worked out, the annual reconciliation (ročné
zúčtovanie), deductions, meal allowances, the employees' registrations, and the reports as files: the Social Insurance
Agency's monthly report, the health insurers' batch 514, the overview PREHLADv26 and the yearly Hlásenie.

## Priority 4: the digital postman (not started: the owner's choice)

Nothing was built: the provider is his to pick (Qvalia was the lead; `CLAUDE.md`, item 8 of "What he has to do"), and
each provider's interface differs (sending, receiving, the Peppol participant's registration). What already stands
for it: issued invoices are e-invoices (UBL 2.1, Peppol BIS 3.0) and a received e-invoice is read by our own code; the
missing piece is the delivery itself. Once he names the provider: its API for receiving and sending, the registration
of each client as a participant, and the price per client into the margin check.

## Milestone 4: eKasa receipts, first part (done, 14 October 2026)

The priority was "eKasa receipts by their QR code": the code on a receipt points to the receipt in the Financial
Administration's eKasa system, so a receipt could come in as data instead of a photo the AI reads. Whether that may
be used at scale was open (`CLAUDE.md`, "The key"). It was read first, and the answer decides what was built.

What the law says (read on 14 October 2026 in the original):

- Act No. 384/2025 Z. z. on recording takings (zákon o evidencii tržieb), in force since 1 January 2026, replaced Act
  No. 289/2008 Z. z. (static.slov-lex.sk, the text as of 1 January 2026; FR SR's information 1/ZoET/2025/I).
- § 2(ai): the service for verifying receipts lets one verify, through a receipt's QR code, the data the eKasa system
  holds, "sprístupňovať a získavať tieto údaje"; § 2(aj): a verifier (overovateľ) is a person entitled to use it and
  obtain the data "po splnení podmienok podľa § 18 ods. 11".
- § 18(1) and (3): FR SR lets the public verify a receipt by its QR code or its identifier through an application,
  repeatedly; the seller has to tolerate it.
- § 18(11): before using the service a verifier notifies FR SR of the IP address it will use, sends FR SR true results
  of what it verified, and follows the conditions of use and of communication FR SR sets and publishes on its site.
- § 19(6): the financial administration proceeds under § 18(11) only from a day FR SR sets and publishes.
- Not found on FR SR's site that day (its eKasa pages for sellers and for producers, ePeňaženka, OPD): the verifiers'
  conditions, the day of § 19(6), an interface for verifiers. Poradca.sk (28 January 2026) writes that the service was
  made at the request of accounting firms and that FR SR will publish the conditions. FR SR's eKasa page also says that
  since 1 January 2025 the VAT recapitulation is no longer a compulsory part of what a till sends, so Over doklad may
  show it incompletely (the VAT of each item stays).

So asking the Financial Administration by program, for every client's receipts, is the verifier's way, and it needs:
(1) the owner's decision to be one (europio, for its clients), (2) FR SR's conditions, which are not published, (3) a
fixed IP address: a Worker has none of its own (Cloudflare's egress addresses are shared); a fixed one is a paid
option (dedicated egress, or a small proxy with its own address) and not ours to buy. Firmony asks the service
nothing, and the address its web page calls (not documented by FR SR) is not used.

What was built meanwhile (it works today, and it is what the lookup will need):

- The reader reads the two codes every eKasa receipt carries, as FR SR's "Popis integračného rozhrania systému eKASA"
  (4 November 2022) defines them: the identifier (UID, chapter 2.7: a letter, "-" and 32 hexadecimal characters; a
  receipt the till sent at once has it, and it is the whole content of its QR code, chapter 2.10) and the seller's
  verification code (OKP, chapter 2.2: five blocks of eight hexadecimal characters; every receipt has it, and the QR
  code of a receipt sent late begins with it, chapter 2.9). Each is checked against its form, written as FR SR writes
  it (capitals, the blocks, a nought read for the letter O put right), and kept with the document (schema step 9:
  `documents.ekasa_uid`, `ekasa_okp`). Code: `src/app/ekasa.ts`, the reader's tool in `src/app/read.ts`.
- Duplicates: a receipt photographed twice (or photographed and forwarded) is one even when its amount or its day was
  read wrong once: its codes agree, a few characters misread allowed (up to four of 32 or 40; two receipts' codes
  differ in nearly all). Two receipts whose codes differ are two even with the same number and amount: a till numbers
  its receipts from 1 again every calendar month (chapter 3.3.12.14), so the old rule (number and amount) took a
  monthly parking receipt for a duplicate of last month's. Without codes the old rule stands.
- Put right on the way: the search for a duplicate looked at the 20 oldest documents of the same amount, so a company
  with many of one amount (parking, coffee) stopped finding new duplicates; it looks at the 50 latest now, and names
  the original rather than another duplicate.
- The accountant's booking screen shows the code under the original, with "Overiť na finančnej správe" (FR SR's Over
  doklad on the web, opd.financnasprava.sk, which she opens herself: the public use of § 18(3)).
- The sample company's receipts carry codes, printed on their originals.

Checks: units 590 → 603, runtime 639 → 647, all passing, TypeScript clean. The booking screen was looked at in the
playground at 1440, 390 and 320 px (nothing overflows; the code keeps one line down to 390 px). 22 rules taken out once
with `scripts/dev/mutate.mjs`: all held (the checks of a code read exactly, of the original named as the twin and of a
receipt without an amount were written with the rules, before the run; one rule's mutation was first written so that
it broke the query instead of the rule, and was run again done right).

For the owner to decide, and a professional to read:

- Whether europio becomes a verifier. A letter to FR SR is drafted below (through "Opýtajte sa finančnej správy", or
  by an e-filing to the Financial Directorate); its answer decides the next step and its cost (the fixed address).
- Whether data fetched from the service may stand in the books for the paper receipt (Act No. 431/2002 Z. z.: § 10 on
  what an accounting document holds, and its rules on the form of accounting records). Until it is answered, the photo
  stays the document and the codes only identify it.
- The tolerance of four characters is the builder's judgement of a thermal slip read from a phone photo.

The letter (draft, Slovak, his to send and sign):

> Vec: Služba na overovanie dokladov pre overovateľa podľa § 18 ods. 11 zákona č. 384/2025 Z. z.
>
> Dobrý deň,
>
> spoločnosť europio s. r. o., IČO 57 442 452, DIČ 2122734449, K lesu 2218/39A, 040 18 Košice, pripravuje službu
> vedenia účtovníctva pre malé obchodné spoločnosti. Klienti nám posielajú pokladničné doklady z pokladníc eKasa ako
> fotografie. Správnosť ich údajov by sme radi overovali službou na overovanie dokladov ako overovateľ podľa § 2 písm.
> aj) a § 18 ods. 11 zákona č. 384/2025 Z. z. o evidencii tržieb. Prosíme o informáciu:
>
> 1. kde finančné riaditeľstvo zverejnilo, alebo kedy zverejní, podmienky používania služby na overovanie dokladov
>    overovateľom a podmienky komunikácie s ňou, a deň podľa § 19 ods. 6 zákona;
> 2. ako sa oznamuje IP adresa podľa § 18 ods. 11 a či možno oznámiť viac adries alebo ich rozsah;
> 3. či je služba určená aj na automatizované overovanie programom (rozhranie, jeho dokumentácia, počet overení,
>    poplatok);
> 4. v akej forme a lehote overovateľ zasiela výsledky overenia podľa § 18 ods. 11 druhej vety;
> 5. či overovateľ môže overovať doklady, ktoré mu poskytnú jeho klienti (kupujúci), a uchovávať získané údaje ako
>    súčasť ich účtovníctva.
>
> Ďakujeme.
>
> S pozdravom
> Christian Juhás, konateľ, europio s. r. o.

What remains of it: the QR code decoded from the picture (the reader reads the printed codes; decoding the QR needs the
phone's browser, whose BarcodeDetector Chrome on Android has and Safari has not, or a decoder on the server, which costs
CPU on every photo), the lookup itself once allowed, a receipt taken as data without a photo, and a client's own eKasa
takings in the VAT return (row D.1 of the control statement, `CLAUDE.md`).

## Milestone 5: the recapitulative statement (done, 14 October 2026; priority 6, a gap the notes listed)

Why this gap first: a young Slovak company that sells services or goods to businesses in other member states (an IT
company invoicing a German client is the typical one) files a recapitulative statement (súhrnný výkaz) every period it
does; the app listed its deadline since milestone 1 but left the statement itself to the accountant ("Firmony ho
zatiaľ nepripravuje"). It is a filing with a fixed form and every figure already in the books.

What the accountant gets (the VAT page of the period, card "Súhrnný výkaz", `#suhrnny`):

- Each customer's row worked out from the issued invoices: goods supplied to another member state without a code,
  services with code 2, by the customer's VAT number, in whole euros (half up), each row with its invoices; the total.
- What keeps it back, each with the document: an invoice not booked (or a document not read yet), a customer without a
  VAT number of another member state, lines missing; the company's own VAT number or seat.
- The file the Financial Administration takes (SVDPHv20, form.471), written as the eForm writes it and validated
  against the eForm's own schema in both test suites; the mark that it was filed, with what the file held.
- A change after filing (an invoice corrected, added or removed): before the deadline a corrective statement with every
  row; after it a supplementary statement with only the rows that change, a row that is no more at nought, a wrong code
  cancelled with the code 0. "Zrušiť označenie" takes a correction back to the statement it corrected.
- A person registered under § 7a: the statement for the calendar quarter. A quarterly payer whose goods pass 50 000 € in
  a quarter is stopped with the explanation (monthly statements are due; the app does not make them).
- The screen of deadlines shows the statement in the state of its card (ready, blocked, running, done; a correction as
  "Opravný" or "Dodatočný súhrnný výkaz") and leads to the card. The mark moved from the screen to the card (it now
  keeps what was filed); the screen keeps the mark of the payroll reports.
- Code: `src/app/vat-summary.ts` (the rules, pure), `summaryXml` in `src/app/vat-xml.ts`, the store in
  `src/app/vat-store.ts` (`svViewOf`, `fileSummaryStatement`, `unfileSummaryStatement`), the card in
  `src/views/vat.tsx`, routes `/ucto/klienti/:id/dph/suhrnny-vykaz.xml`, `/dph/suhrnny-vykaz/podane`,
  `/dph/suhrnny-vykaz/zrusit`; schema step 10 (`filings.data`); the schema in `test/xsd/svdph2020.xsd`.

What it leans on (read on 14 October 2026, in the original):

- § 80 of Act No. 222/2004 Z. z. as in force from 1 January 2027 (static.slov-lex.sk): who files and for what period
  (1) to (3), what the statement holds (4), the value in the period the tax fell due, whole euros half up (6), a
  correction of the base in its own period (7), the corrective and the supplementary statement (8), 25 days after the
  period (9). § 19(8): goods supplied to another member state fall due on the 15th of the next month, or on the day of
  the invoice issued before it.
- The poučenie to SVDPHv20 (measure No. 405/2019 Z. z., pfseform.financnasprava.sk), parts I to IV and examples 1 to 14
  (the rows, the codes, the cancelling rows of a supplementary statement); the eForm form.471 (its schema
  form.471.sk.xsd and its script, which shows the month written 1 to 12, the quarter I to IV, the kind as 1 and 0, the
  twelve rows of each part to a page).

Found on the way and put right:

- Goods supplied to another member state were placed in the period of their day of supply; § 19(8) puts them in the
  period of the 15th of the next month (or the invoice's day, if earlier). Only an invoice issued late changes period;
  the return's row 14 and the statement now agree with the law.
- The link from the screen of deadlines to a quarterly payer's statement went to a month its VAT page does not have.

Checks: units 603 → 626, runtime 647 → 663, all passing, TypeScript clean. The card and the screen were looked at in the
playground at 1440, 390 and 320 px (nothing overflows); the sample company's statement for September downloaded from
the playground validates against the schema with `xmllint` too. 26 rules taken out once with `scripts/dev/mutate.mjs`:
all held (three checks were written with the rules, before the run: an invoice and its credit note that cancel out,
the company's own VAT number, the file of a statement already filed).

For a professional to read:

- `konatel` (the person authorised to file) names europio, as the VAT return's `opravnenaOsoba` does; to see on the
  first real filing what eDane wants there.
- A credit note is placed by its own day of supply, as the VAT return places it (§ 80(7) says: the period the
  correction was notified to the customer); a credit note that carries the original supply's day would fall into the
  original period. The accountant can name the period on the document.
- An invoice issued before the goods were dispatched is taken to fall due on the dispatch, not on its own day (as the
  app already did for acquisitions); § 19(8) read literally says the invoice's day.
- A supplementary statement has no deadline in § 80(8); the screen lists it for today and never as late.

What remains of it: triangular trade (code 1), goods moved to another member state of one's own (§ 43(4)), call-off
stock (part II), the monthly statements of a quarterly payer above 50 000 € of goods, a customer's VAT number given
later (§ 80(6)).

## Resources

- One continuous session (milestone 1 from 15:17 to 16:03, milestone 2 to 17:22, milestone 3 to 17:57, milestone 4 to
  18:31, milestone 5 to 19:05); repository work by shell and file tools, research by web search and the Financial Administration's own
  files (pfseform.financnasprava.sk, financnasprava.sk: the eForms, the eKasa interface's description) and
  slov-lex.sk. No paid external service was called, nothing was deployed, no production data exist. The test suites
  take about 3 s (units) and 50 s (runtime); a full mutation run of milestone 2 (52 rules) about 20 minutes, of
  milestone 4 (22 rules) about 12, of milestone 5 (26 rules) about 9, most rules failing the units first.


## Correctness repairs (Codex, 14 October 2026)

Branch `codex/firmony-correctness-and-history`, stacked PR #2 against this continuation. No merge or deployment.

- Payroll: prorate the health deductible by employment days; disability exempts the minimum advance. Unknown years
  fail explicitly rather than borrowing the latest known legislation. Every stored payroll month stays accessible,
  including closed payslips whose year is no longer supported for new calculations.
- Closing: revision checks make competing tax bookings accept one ledger write. A filing captures the exact DPPO
  and UZMUJ XML, filenames, declaration date and SHA-256. Later downloads replay these files. Legacy filings without
  saved XML return 409 rather than manufacturing an original. Reopening retains previous filed and payroll snapshots.
- SV: the goods limit checks the current quarter and the previous four. A quarterly payer requiring monthly SV
  cannot generate or mark a quarterly statement. Separate monthly SV for quarterly VAT payers remains outside this
  implementation; the page directs the accountant to eDane.
- Handover: year discovery includes payroll, closings, filings and internal entries; queries respect D1's compound
  SELECT limit. ZIPs include lossless JSON, closed payslips, stored filing XML, history, handover attachments and a
  SHA-256 manifest. Missing files or ZIP limits abort rather than acknowledging a partial archive. Export row caps
  were removed. Full archives include employee personal data and are now restricted to company owners.
- Deletion: an owner acknowledges completed archives for every year at the current data revision. Accounting writes
  invalidate old acknowledgements. Purge checks the revision and expiry again, freezes writes before deleting files,
  and rotates deferred companies so missing acknowledgements do not starve the queue. This intentionally changes the
  previous unconditional 90-day deletion policy; assess the contract text before any production release.
- Schema steps 11 and 12 append history, revisions and receipts; old migration steps remain unchanged. Existing
  filings without original XML are not backfilled with recalculated files.
- Test builds are local esbuild bundles, without `wrangler deploy`. Miniflare's independent Request.cf metadata fetch
  is explicitly disabled (`cf: false`); all application outbound services use the local fixtures. The workspace's
  native TypeScript 7 executable cannot resolve `/proc/self/exe`; supplementary TypeScript 6 checks are clean.

Rule references: health insurance Act 580/2004, § 16(16)–(18) and § 16a(2)(c),
https://static.slov-lex.sk/static/SK/ZZ/2004/580/20260701.html ; SV Act 222/2004, § 80(2),
https://static.slov-lex.sk/static/SK/ZZ/2004/222/20270101.html .

Verified locally after the repairs: 636/636 unit checks, 694/694 workerd runtime checks, TypeScript 6 clean, `git diff --check` clean. Runtime checks include deliberately stale concurrent tax bookings, byte-identical filing downloads after edits, cancelled/incomplete exports, access control and invalidation of acknowledged handovers.


## Monthly SV of a quarterly VAT payer (Codex, 14 October 2026)

Branch `codex/firmony-monthly-summary`, stacked over PR #2. The VAT return stays quarterly; SV has independent
monthly periods, files, filing/correction marks and deadlines. This completes the ordinary monthly-SV limitation
listed above. No merge or deployment.

- The 50 000 € test uses the current quarter and four preceding quarters; page and deadline loaders fetch that
  history. Tax-day months are independent of a manually selected VAT quarter. Services alone do not trigger the goods
  limit. Once monthly filings exist, a sequence cannot silently revert to a quarterly duplicate.
- At a mid-quarter crossing, earlier months wait for that month's end and share its deadline. Corrections use this
  adjusted deadline too. The deadlines screen includes completed SV months while their VAT quarter is still running.
- A previously filed quarter can be explicitly reclassified to its last month, following FR SR methodology example 18.
  Existing last-month filings are never overwritten. Missing original rows require resolving the legacy case through
  the tax portal. New filings capture exact XML, filenames and SHA-256; prior values survive corrections,
  reclassification and cancellation in schema step 13's `filing_history` and the yearly handover.
- Revision guards reject two writes prepared from the same books, including corrections within the same second.
  Invalid SV periods do not fall back to another period. Company access rules and local service mocks remain.
- Regression: 646 unit checks and 715 workerd checks. UI captures come from actual runtime responses. The CI
  layout check renders monthly and transition screens at 1440, 390 and 320 pixels, checks overflow and unique headings,
  and keeps screenshots as a short-lived Actions artifact. Test services never call a live tax or banking endpoint.

Primary references checked in the 2026 and 2027 law versions: § 80 of Act 222/2004,
https://static.slov-lex.sk/static/SK/ZZ/2004/222/20260101.html and
https://static.slov-lex.sk/static/SK/ZZ/2004/222/20270101.html . Transition deadlines and return to quarterly filing:
https://podpora.financnasprava.sk/670936-Zmena-obdobia-u-platite%C4%BEa . Late reclassification: FR SR methodology,
https://www.financnasprava.sk/_img/pfsedit/Dokumenty_PFS/Zverejnovanie_dok/Dane/Metodicke_pokyny/Nepriame_dane/2019/2019.12.31_MP_par_80.pdf , example 18.


## Period locks and a verified competitive plan (Codex, 15 October 2026)

Branch `codex/firmony-period-locks`, stacked over PR #3. A completed month, or December for a whole year, can be
locked by the assigned accountant or an administrator. Reopening from a month keeps older months protected;
reopening from the beginning removes the active cutoff. Every transition retains its author, reason, before/after
cutoffs and version. History cannot be edited or removed in ordinary operation. An optimistic data revision
protects readiness from concurrent changes, including company settings and changes inside the same second.

Schema step 14 guards source writes in the same transaction: posted documents, both sides of date moves, payments,
receipt dependencies and allocations, bank analytic accounts, manual/opening entries, VAT settings, returns and
nested correction dates, filings, payroll and issued invoices/lines. Late raw bank facts and unbooked documents can
arrive without silently changing the locked journal. Automatic pairing skips protected sources and logs an event
only when the pair is actually inserted. Expected conflicts return a readable 409 without SQL. A lock created during
an upload rolls back the document and removes the new object. History and the current lock are exported and can be
purged only through the already controlled handover process. This is an internal posting lock, not a claim of legal
year-end closure or a substitute for closing entries, an authority filing or professional review.

The competitive report is `docs/konkurencny-audit-2026-10-15.md`: matrix with evidence levels, ten ranked
opportunities, engine and customer workflows, full postman integration design, three partner candidates, current
accounting gaps, launch gates through November, later modules and precisely defined quality metrics. Public sources
were checked on 15 October: all five requested competitor pages, its blog and LinkedIn (including the founder's
recruitment post), FS manuals and provider lists, OpenPeppol and primary provider documentation. The FS page lists
Slovak transpositions v1.12 dated 14 October; the XLSX could not be parsed by the web reader, so its scenarios are
explicitly not claimed as run. Instagram/Facebook content, actual competitor task times and independent customer
counts remain unverified. No competitor account, submission, provider signup or purchase was made.

The report identifies operational gaps instead of declaring a market lead: Firmony has no complete eFaktúra
transport or authority-receipt loop, production bank coverage and staffing remain unverified, and secure recovery,
MFA, actual time/cost measurements and the revised handover retention policy need completion before public launch.
The configuration comment about an assured margin was corrected; existing prices and planned pay were not changed.

Validation: 660 unit checks, 781 workerd runtime checks and supplementary TypeScript 6. Native TypeScript 7 and
browser layouts are checked in GitHub Actions; the browser suite includes the open/locked period screens and
monthly-SV screens at 1440, 390 and 320 pixels. No production deployment, merge or real tax/bank operation.
