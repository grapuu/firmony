# Firmony: jasný produkt, jednoduchá práca

Zadanie Christiana z 21. 10. 2026. Stav kódu overený na `main` po PR #18, commit
`e46796114a163077321e639500f3b3fd95a4063d`. Tento dokument je návrh produktového smerovania a zadanie
ďalších úprav pre Clauda aj Codex. Pôvodná zmena PR #19 obsahovala iba projektové poznámky.
**Aktualizácia 22. 10. 2026 CEST: J1 je implementované v [klientskom prehľade](../client-overview.md).**
Nasledujúci text zostáva pôvodným zadaním; rozsah J1 a jeho hranice určuje uvedená implementačná poznámka.
Spoľahlivosť odosielania v J2 má [záznam implementácie](../client-delivery.md). Konkrétna otázka s odborným
vybavením, J3 až J5 a overenie s používateľmi zostávajú otvorené.

## Rozhodnutie, ktorým sa má riadiť ďalší vývoj

**Firmony má byť jedna účtovná služba s dvoma pracovnými pohľadmi. Klient rozumie stavu firmy a
hneď vie, čo od neho potrebujeme. Účtovníčka vidí priority, podklady a rozhodnutia, ktoré musí urobiť.**

Jednoduchosť, čitateľnosť, ľudskosť a prístupnosť sú výslovné požiadavky majiteľa. Nasledujúce
usporiadanie je náš návrh ich realizácie. Zložitosť nesie systém a odborná služba. Úloha sa považuje
za zjednodušenú až vtedy, keď človek potrebuje menej úsilia a výsledok zostáva správny a dohľadateľný.

Pracovná definícia produktu: „Firmony spája účtovný softvér a odbornú starostlivosť. Vy vidíte stav
svojej firmy a vybavíte potrebné kroky na jednom mieste.“ Je to interná definícia cieľa, nie nový
schválený slogan ani potvrdenie dostupnosti každej služby. Otvorený úvodný text webu ostáva rozhodnutím
majiteľa. Ceny 89, 169 a 329 eur sa týmto návrhom nemenia.

### Naše štyri políčka

| Kto používa Firmony | Čo potrebuje vedieť | Čo potrebuje urobiť |
| --- | --- | --- |
| Klient | Aký je stav mojej firmy? Čo vybavuje Firmony? | Čo teraz potrebujete odo mňa a dokedy? |
| Účtovníčka | Čo má dnes prednosť? Ktoré podklady sú pripravené a aktuálne? | Čo treba odborne rozhodnúť, opraviť alebo dokončiť? |

Matica je filter pri navrhovaní produktu. Neznamená štyri produkty, štyri povinné položky menu ani
odstránenie pokročilých účtovných agend. Administrátor má ďalšie oprávnenia v tom istom systéme.
Rozsah služby pre konkrétnu firmu sa posudzuje podľa jej situácie; samotná veľkosť firmy ani drahší
balík nedokazujú podporu všetkých jej prípadov.

## Čo máme dnes a kde začať

Ide o kontrolu zdrojového kódu, nie o pozorovanie živých zákazníkov. Odkazy vedú na existujúce súbory.

| Skutočný stav | Dôsledok pre ďalšiu prácu |
| --- | --- |
| [Klientsky rám](../../src/views/inside.tsx), `Shell`: Prehľad, Platby, Doklady, Faktúry, Dane podľa registrácie, Správy; Firma a nastavenia osobitne. Mobil má štyri záložky a pridanie dokladu, faktúry a dane v menu. | Už existuje kompaktný základ. Najprv overiť dokončenie úloh; nepreskupovať menu iba kvôli počtu položiek. Časté vystavovanie faktúr treba skúsiť aj na mobile. |
| [Prehľad](../../src/views/inside-pages.tsx), `Overview`: `calm` vychádza z `missingCount === 0 && paymentsCount > 0`. Daň na úhradu mení nadpis; ďalšie informácie o banke, výpise a prvých krokoch sú samostatné bloky. [Texty](../../src/app/copy.ts) obsahujú „Nemusíte nič robiť.“ | Spárované platby samy nestačia na celkový pokojný stav. Overiť kombinácie bez chýbajúcich dokladov, ale s potrebným výpisom, otázkou, schválením alebo neaktuálnou bankou. Zjednotenie stavu je prvá implementačná úloha. |
| `FirstSteps` v tom istom súbore už ukazuje prvé kroky a voliteľné nastavenia. Predzmluvné overenie má vlastný postup podľa [AML implementácie](../aml/implementation.md). | Nevytvoriť druhý onboarding. Jasne oddeliť vznik zmluvy od následného nastavenia služby a ukazovať iba zostávajúce relevantné kroky. |
| [Pracovisko účtovníčky](../../src/views/team.tsx), `ClientsPage`: časť Dnes, termíny, počty práce, firmy a odkaz na nedokončené podania. Navigácia už rozlišuje roly. | Rozšíriť existujúce Dnes o zrozumiteľné pracovné priority. Podklady pre úlohy už existujú; úplnosť spoločného zoznamu treba overiť. |
| `ClientPage` v tom istom súbore spája frontu dokladov, kontrolu, správy, chýbajúce podklady, zmluvu, termíny, údaje a odkazy do odborných agend. `BookPage` má originál pri účtovnom formulári a pokračovanie na ďalší doklad. | Zachovať rýchle účtovanie s originálom. V detaile firmy oddeliť každodennú prácu od nastavení a odborných agend, zachovať odkazy aj kontext. |
| [Evidencia podaní](../../src/views/filings.tsx) rozlišuje prípravu, odoslanie, prijatie, odmietnutie a preverovanie. [Automatické účtovanie](../autobook-consistency.md) chráni aktuálnosť podkladov a históriu. | Tieto rozdiely preniesť do jednoduchých klientskych vysvetlení. Nezameniť návrh, interné označenie alebo odoslanie za potvrdené vybavenie. |

Historické stratégie z 15. 10. a staré počty schém nie sú aktuálnym inventárom funkcií. Tento dokument
spresňuje produktový smer; stav konkrétnej implementácie sa vždy overí v kóde a aktuálnych poznámkach
`CLAUDE.md`. Nadväzuje na [jeden systém a automatizáciu](11-shared-product-and-automation.md) a
[výskum zákazníckej hodnoty](../research/customer-value-2026-10-21.md).

## Klient: najprv odpoveď, potom podrobnosti

Návrh úvodnej obrazovky má tri čitateľné časti:

1. **Od Vás potrebujeme.** Konkrétne zostávajúce úlohy s dôvodom a termínom. Najnaliehavejšia má
   hlavné tlačidlo; ostatné povinnosti zostávajú viditeľné. Jedno hlavné tlačidlo nesmie skryť ďalší
   splatný záväzok. Úloha končí tam, kde sa dá vybaviť, nie pri návode, v ktorom si človek hľadá ďalšiu cestu.
2. **Vybavujeme pre Vás.** Stav práce Firmony s obdobím, poslednou aktualizáciou a zodpovedným človekom,
   ak je pridelený. Rozlíšiť čakanie na podklad, odbornú kontrolu a vonkajší systém. Neodhadovať termín
   dokončenia, ktorý nemáme podložený.
3. **Dokončené.** Stručný výsledok s rozsahom a dostupným dôkazom. Čísla firmy, doklady a podrobnosti
   zostávajú prístupné bez toho, aby zatienili potrebné úkony.

Toto sú návrhy skupín na prehľade, nie nové databázové stavy. Najprv použiť existujúce fakty a oprávnenia.
Pri viacerých firmách musí byť názov aktívnej firmy zrejmý aj pri odoslaní alebo schválení.

| Situácia | Návrh ľudského vysvetlenia | Podmienka pravdivosti |
| --- | --- | --- |
| Chýba doklad k známej platbe | „K platbe 48 € pre [dodávateľa] chýba doklad.“ Tlačidlo „Pridať doklad“. | Použiť skutočné údaje platby a pri odoslaní znovu overiť jej stav. Suma je iba príklad. |
| Účtovníčka potrebuje obchodný účel | „Na čo ste tento nákup použili vo firme?“ Originál a známy kontext sú pri otázke. | Najprv skontrolovať dostupné podklady. Nežiadať klienta o účtovný predpis alebo daňový režim. |
| Nie je potrebný klientsky úkon, kontrola ešte beží | „Teraz od Vás nič nepotrebujeme. Doklady za [obdobie] kontroluje účtovníčka.“ | Musí byť známy stav kontroly a nesmie čakať iný úkon klienta. Samotné spárovanie nestačí. |
| Bankové údaje nie sú čerstvé | „Posledné údaje z banky máme k [dátum].“ Ďalší krok závisí od skutočnej príčiny. | Pri neznámom dátume priznať, že aktuálnosť nevieme potvrdiť. Výpadok na našej strane rieši Firmony. |
| Podklady na podanie sú hotové | „Podklady sú pripravené. Čaká ich [skutočný ďalší krok].“ | Prijatie možno uviesť až podľa existujúcej overenej potvrdenky; zachovať upozornenie na staršiu verziu. |

Bežná rutina: klient pridá súbor alebo fotografiu, dostane potvrdenie prijatia a priebeh, potom rieši
iba nevyhnutnú otázku. Pri chybe vidí, ktorý súbor neprešiel, dôvod a spôsob nápravy; už prijaté súbory
neposiela znova. Opakovaný pokus sa musí správať bezpečne aj po prerušení spojenia.

Platba dane, podpis a schválenie firemného výdavku zostávajú vedomými rozhodnutiami oprávneného človeka.
Pred potvrdením je zrejmé, čo sa stane. Hotový formulár neznamená, že peniaze odišli z banky.
Právne a bezpečnostné kroky sa vysvetlia pri správnom okamihu; nevypínajú sa pre kratšiu cestu.

## Účtovníčka: pripravené podklady, viditeľné výnimky

V existujúcej časti Dnes navrhujeme zoradiť prácu podľa termínu, závažnosti a závislostí. Každá položka
má firmu, obdobie, dôvod, termín, vlastníka a priamy vstup do práce. Duplicitu tej istej povinnosti
v termínoch, frontoch a podaniach riešiť spoločným odkazom na tú istú vec, nie ďalším nezávislým stavom.
Kritické prevádzkové incidenty zostávajú okamžite dostupné oprávneným ľuďom.

Pri doklade musí byť spolu originál, návrh, zdroj návrhu a konkrétna neistota. Účtovníčka má rýchlo
overiť, opraviť a pokračovať. Rutinné údaje znovu neprepisuje. Pri automatickom účtovaní sa zachová
odborná kontrola, aktuálnosť podkladov a vysvetlenie, prečo sa prípad zastavil. Číselná sebaistota
modelu sa nepovažuje za preukázanú správnosť. Hromadné potvrdenie nie je predvolená náhrada kontroly.

Detail firmy má pracovnú časť, odborné agendy a nastavenia. Pokročilá agenda sa otvorí pri príslušnej
firme s vybraným obdobím. Musí zostať nájditeľná pre oprávnenú účtovníčku aj pred prvým použitím;
jej zobrazenie nemožno podmieniť tým, že už obsahuje dáta. Presun v menu nesmie meniť serverové oprávnenia.

## Pravidlá každej ďalšej obrazovky

- Jedna zrozumiteľná hlavná úloha, jasný výsledok a cesta späť. Odborný detail sa rozbalí pri potrebe;
  naliehavá povinnosť, chyba a relevantné upozornenie ostávajú viditeľné.
- Bežná slovenčina a jednotné pomenovania. V klientskom rozhraní vykanie s veľkým V. Tlačidlo pomenuje
  čin a jeho predmet. Technickú príčinu možno rozbaliť pre podporu; človek vždy dostane ďalší použiteľný krok.
- Rovnaký údaj sa v jednom procese zbytočne nezadáva znova. Neplatné alebo bezpečnostne potrebné údaje
  sú výnimkou [S1, S2]. Oprava sa vráti na pôvodné miesto bez straty ostatných bezpečne uchovateľných údajov.
- Krátky úkon zostáva krátky. Dlhý proces má potrebné kroky, stav a návrat k rozpracovaniu. Pred záväzným
  odoslaním ukázať prehľad, z ktorého možno opraviť odpoveď [S4, S5]. Nepridávať checklist k jednej otázke.
- Klávesnica, viditeľný fokus, čitateľné popisy, zväčšenie a úzky displej patria k prijatiu každej zmeny.
  Stav sa rozlišuje aj textom, chyby sa spájajú s poľom a dynamické výsledky oznamujú asistenčným
  technológiám bez zbytočného presunu fokusu [S1, S3]. Cieľom je WCAG 2.2 AA; zhoda celej aplikácie
  týmto dokumentom nie je potvrdená.
- Rozhranie oznamuje prijatie, spracovanie, úspech aj zlyhanie. Pri dlhšom čakaní ukáže známy priebeh;
  nevymýšľa percentá ani presný zostávajúci čas. Prerušenie a opakovanie nesmú znamenať stratenú prácu.
- Rozhovor s AI môže pomôcť vysvetliť situáciu. Vystavenie faktúry, nahranie dokladu a odborné potvrdenie
  musia mať priamu ovládateľnú cestu. Kvalita sa posudzuje podľa dokončenej úlohy.

## Poradie implementácie pre Clauda a Codex

Každý riadok je samostatná menšia vetva. Pred úpravou overiť aktuálny kód, existujúce testy a prepojené
stavy; nevytvárať paralelnú evidenciu úloh alebo duplicitné komponenty bez potreby.

| Poradie | Konkrétna zmena a miesto | Dôkaz prijatia |
| --- | --- | --- |
| J1, prvá práca | Jednotná priorita stavu na `/app`: `src/app/routes.tsx`, `src/views/inside-pages.tsx`, `src/app/copy.ts`. Najprv spísať, ktoré fakty už prehľad dostáva a ktoré treba bezpečne doplniť. | Regresné scenáre: spárované platby plus chýbajúci výpis; neaktuálna banka; otázka čakajúca na klienta; potrebné schválenie; daň na úhradu; rozpracované prvé kroky; nula platieb; dve súčasné povinnosti; skončená zmluva. Nadpis ani hlavná akcia nesmú protirečiť ostatným blokom. „Nič nepotrebujeme“ sa vzťahuje iba na doložený klientsky stav. |
| J2 | Krátke odovzdanie dokladu a odpoveď na otázku: existujúce `AddCard`, `DocumentPage`, `PaymentPage`, `MessagesPage`, príslušné routy a skript pre nahrávanie. | Mobilná fotografia, viac súborov, čiastočné zlyhanie, slabé spojenie, návrat po overení prístupu, opakované odoslanie a už vyriešená otázka. Zachovať prijaté súbory a bezpečne obnoviteľný text; nevytvoriť druhé účtovné vybavenie. |
| J3 | Pracovné Dnes na `/ucto`: existujúce `ClientsPage`, termíny, fronta a podania. Prvý rez má využiť existujúce zdroje a vysvetliť priority. | Účtovníčka otvorí najnaliehavejší prípad s firmou a obdobím bez hľadania. Jedna povinnosť sa netvári ako dve práce. Opravené, zastarané a znovuotvorené prípady majú správny stav; rozsah zodpovedá oprávneniam. |
| J4 | Rozčlenenie `/ucto/klienti/:id` a odbornej práce v `src/views/team.tsx`. Zachovať originál pri rozhodovaní a rýchle pokračovanie. | Pridelená účtovníčka nájde kontrolu, chýbajúci podklad aj menej častú agendu. Pri návrate ostáva firma a obdobie; fungujú existujúce priame odkazy. Zmena roly, súbežná úprava a archív sa nedajú obísť cez nový pohľad. |
| J5 | Až po J1 až J4 overiť navigáciu a vstupný príbeh služby: `src/views/inside.tsx`, `src/views/team.tsx`, `src/views/home.tsx`. | V prototype porovnať existujúcu navigáciu s navrhovanou na rovnakých úlohách. Zahrnúť často fakturujúceho klienta, viac firiem a väčšiu firmu so schvaľovaním. Zachovať známe názvy, priame odkazy a dostupnosť relevantných funkcií. Úvodnú vetu webu neschváliť za majiteľa. |

Prístupnosť a výkon sa overujú od J1, nečakajú na J5. K produktovej karte vždy zapísať konkrétny
scenár, východiskový stav, navrhovanú úsporu práce a hranice. Nový prieskum alebo prepis dizajnu nesmie
odkladať známu opravu protirečivého stavu.

## Ako preukážeme, že je to jednoduchšie

Východiskový čas úloh ani úspešnosť živých používateľov zatiaľ nemáme zmerané. Nasledujúce čísla sú
**navrhnuté ciele prvého pilotu**, nie výsledky alebo všeobecné UX zákony. Pri malej vzorke uvádzať
počty aj jednotlivé časy; percento by zakrývalo počet pokusov.

| Úloha v izolovanom prostredí so syntetickými údajmi | Navrhnutý cieľ pilotu |
| --- | --- |
| Klient po prihlásení povie, čo má urobiť a čo vybavuje Firmony. | Do 10 sekúnd nájde správny potrebný krok; vlastnými slovami správne rozlíši svoju úlohu od práce Firmony. |
| Klient odošle už pripravenú fotografiu dokladu alebo odpovie na jednu obchodnú otázku. | Do 60 sekúnd aktívneho času, bez vysvetľovania obsluhy. Sieť a čakanie na model sa merajú osobitne aj v celkovom čase. |
| Klient nájde vystavenie faktúry, daň na úhradu a kontakt na účtovníčku. | Každú cestu nájde bez pomoci a správne vysvetlí výsledok akcie. Zaznamenať čas, návraty a prípadné omyly. |
| Účtovníčka vyberie ďalší prípad a vysvetlí, prečo má prednosť. | Do 15 sekúnd; nájde originál a dôvod kontroly. Odborné rozhodnutie sa časovým limitom neskracuje. |
| Rozpracovaný úkon sa preruší chybou alebo overením prístupu. | Bez straty bezpečne uchovateľnej práce a bez nechceného druhého zápisu; používateľ vie pokračovať. |

Najprv pozorovať aspoň troch ľudí v úlohe klienta a jednu účtovníčku. Je to skoré hľadanie problémov,
nie reprezentatívny dôkaz. Použiť rovnaké úlohy pred zmenou a po nej, zaznamenať poradie pokusov a
zohľadniť naučenie. Súčasne sledovať, či úspora klienta iba nepridala prácu účtovníčke. Väčšie firmy
a zvláštne agendy overovať samostatne. Do poznámok neukladať osobné údaje klientov ani tajomstvá.

Pri každom pokuse zapísať rolu, scenár, commit, zariadenie, aktívny aj celkový čas, dokončenie,
pomoc, chybu a opravu. Automatické UI testy preukážu konkrétne vlastnosti rozhrania; úspech človeka
sa musí pozorovať. Meranie presnosti AI patrí k samostatnej agende a vzorke. Výsledok Reader 22/30
kategórií z [merania](../reader/measurement-2026-10-21.json) nie je 99 % autonómie služby.

## Čo si strážime pri zjednodušovaní

Zostávajú odborné rozhodnutia, reálne oprávnenia, originály, história, uzamknuté obdobia, prenosnosť
dát a predzmluvné kontroly. Neaktuálne, neznáme alebo odmietnuté spracovanie potrebuje vlastné čitateľné
vysvetlenie. Nové usporiadanie nesmie odhaliť interné AML oznámenia ani údaje inej firmy.

Do ďalšieho rozširovania hlavnej navigácie alebo nových samostatných produktov najprv vyžadujeme
preukázanú potrebu a funkčný základ J1 až J4. Existujúce odborné agendy sa nemažú; ich dostupnosť sa
overí v reálnych úlohách. Prepracovanie investorov a nové marketingové sľuby nemajú prednosť pred jadrom.

Aktivácia bánk, živé doručovanie eFaktúr, externé prijatie podaní, právne a poistné dojednanie, skutočná
obnova a skúšobný mesiac zostávajú samostatnými závislosťami v [návode na spustenie](../spustenie.md).
Žiadne zjednodušenie obrazovky ich samo nedokončí.

## Primárne podklady pre návrh

Prečítané relevantné časti originálov 21. 10. 2026. Ide o technické štandardy a návrhové usmernenia,
nie nový právny výklad alebo dôkaz účinku na Firmony. W3C Understanding vysvetľuje kritériá; samotné
normatívne znenie je v odporúčaní WCAG. Prebraté princípy sú vyššie označené; konkrétne usporiadanie
Firmony, poradie J1 až J5 a časy pilotu sú naše návrhy.

- **S1:** [W3C WCAG 2.2, odporúčanie](https://www.w3.org/TR/WCAG22/), najmä 2.4.3, 2.4.7, 3.3.1,
  3.3.2, 3.3.7 a 4.1.3: poradie a viditeľnosť fokusu, označenie chýb, popisy, opakovaný vstup a stavové správy.
- **S2:** [W3C Understanding 3.3.7](https://www.w3.org/WAI/WCAG22/Understanding/redundant-entry.html):
  uľahčenie opakovaného zadania v jednom procese s uvedenými výnimkami; nevyžaduje automaticky uchovanie medzi reláciami.
- **S3:** [W3C Understanding 4.1.3](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html):
  oznamovanie dynamického stavu asistenčným technológiám bez prevzatia fokusu.
- **S4:** [GOV.UK Check answers](https://design-system.service.gov.uk/patterns/check-answers/):
  prehľad pred odoslaním a možnosť opravy; pri rozsiahlej transakcii overiť vhodné členenie s používateľmi.
- **S5:** [GOV.UK Complete multiple tasks](https://design-system.service.gov.uk/patterns/complete-multiple-tasks/):
  najprv zjednodušiť proces, zoznam úloh používať pre dlhšie transakcie, ukázať priebeh a relevantné závislosti.

## Pokyn na nadviazanie

J1 má [samostatný záznam implementácie](../client-overview.md). Ďalšia implementačná práca je
**J2, spoľahlivé odosielanie, je implementované:** [záznam](../client-delivery.md). Ďalšia časť J2 je
konkrétna otázka účtovníčky a výslovné odborné vybavenie; prečítanie správy ho nenahrádza. Táto časť J2,
J3 až J5 a používateľský pilot nie sú označené za hotové.
Každá úprava má vlastnú vetvu, aktualizáciu `CLAUDE.md` a pred zlúčením úspešné `npm run check`, `npm test`,
Node 24 `npm run test:runtime`, `npm run test:ui`, `npm run test:peppol` a existujúce prehliadačové kontroly.
`main` sa okamžite nasadzuje. Schéma ostáva 77; prípadná nová migrácia až 78, pôvodné kroky sa nemenia.
