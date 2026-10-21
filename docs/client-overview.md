# Klientsky prehľad: pravdivý stav a ďalší krok

Implementácia J1 z [produktového zadania](strategy/12-product-simplicity.md), 22. 10. 2026 v čase Europe/Bratislava.
Zachováva existujúci produkt, vzhľad, ceny, navigáciu a účtovné postupy. Nová schéma ani externá služba nevzniká.

## Viditeľná zmena

Prehľad už nepoužíva spárované platby ako dôvod na všeobecné „Nemusíte nič robiť“.
Hlavný krok vychádza z konkrétnych údajov a ostatné známe povinnosti zostávajú viditeľné:

- úhrady z existujúcich termínov vrátane faktúr Firmony, odvodov a daní,
- chýbajúce doklady a bankový výpis,
- potvrdenie účtu a obnova súhlasu pre oprávneného vlastníka účtu firmy,
- faktúry, ktoré práve tento používateľ môže schváliť,
- neprečítané správy a zostávajúce potrebné nastavenie služby.

Splatná alebo omeškaná položka má prednosť, starší termín ide prvý. Ostatné kroky majú stabilné poradie:
vypršaná banka, potvrdenie účtu, výpis, doklady, osobné schválenie, správa, prvé nastavenie,
budúca úhrada a blížiaca sa obnova súhlasu. Ďalšie úlohy sa neschovávajú za hlavné tlačidlo.
Prehľad klienta nenahrádza odborný pracovný zoznam účtovníčky.

Ak k dostupným platbám nechýbajú doklady, text to výslovne ohraničí na prijaté platby.
Neoznačí tým účtovanie, kontrolu ani podania za ukončené. Rozdiel medzi pripravením,
odoslaním a doloženým prijatím podania zostáva zachovaný v existujúcej evidencii.

## Odkiaľ pochádza stav

[`overviewActions`](../src/app/overview.ts) iba vyberá z existujúcich faktov. Nevytvára druhú evidenciu úloh.
Termíny pochádzajú z `clientDeadlines`, správy z existujúcej evidencie neprečítaných správ a výpisy
z `statementDue` a čakajúcich potvrdení. Počet chýbajúcich dokladov využíva celý existujúci súčet podľa
mesiacov; neobmedzuje sa na 200 platieb načítaných pre návrhy párovania.

Prehľad aj `/app/schvalovanie` používajú spoločný výber `approvalQueueOf` v `src/app/routes.tsx`.
Rešpektuje aktuálny limit, oprávnenie, zákaz vlastného druhého schválenia a pravidlo zadávateľa IBAN.
Oprávnenia členov sa čítajú naraz, bez samostatného dotazu pre každého prvého schvaľovateľa.
Existujúce kontroly pri samotnom schvaľovaní zostávajú rozhodujúce aj pri súbežnej zmene údajov.

Pripojená banka ani prijatý výpis s nulovým počtom pohybov neznamenajú nedokončené nastavenie.
Prvý prijatý doklad môže prísť aj automaticky; klient sa ho nemusí učiť nahrávať znova.
Vlastná faktúra Firmony sama tento krok nedokončí. Čerstvosť bankových dát je samostatná informácia.

## Banka a neznáme údaje

Vypršaný súhlas sa zohľadní aj pred aktualizáciou jeho stavu plánovanou úlohou. Prístup sa používateľovi
neponúka obnovovať cez nedostupný agregátor a kolegovi sa neukazuje úkon vyhradený vlastníkovi.

Pri chybe, chýbajúcom prvom načítaní alebo dlhšej prestávke sa zobrazuje upozornenie a posledný známy
čas úspešného načítania. Neznámy čas sa nenahradí dnešným dátumom. Surová diagnostika poskytovateľa
sa do klientského prehľadu neprenáša. Samotné upozornenie na chybu nevytvára požiadavku na nové pripojenie.

`BANK_DELAY_SECONDS` sú dva intervaly `BANK.syncEverySeconds`, aktuálne 12 hodín. Ide o interný prah
viditeľnosti oneskorenia, nie zákonnú lehotu, meranú dostupnosť alebo záruku aktuálnosti všetkých údajov.
Pri viacerých bankách sa zobrazuje najzávažnejší známy problém; všetky spojenia sú dostupné na stránke Banka.

## Rozsah a hranice

Neprečítaná správa znamená krok „Prečítať správu“. Existujúci model nemá samostatný príznak,
že konkrétna otázka vyžaduje klientsku odpoveď. Neodvodzujeme ho z otázniku, posledného autora ani
automatického oznámenia. Prečítanie nevytvorí odpoveď a pokojnejší nadpis nie je potvrdením vybavenia otázky.
Konkrétne zadávanie a dokončovanie klientskych otázok patrí do ďalšieho kroku J2.

Zostávajú existujúce hranice zdrojových zoznamov: fronta schvaľovania pracuje s najviac 300 kandidátmi,
faktúry Firmony na prehľade s poslednými 24 záznamami. Tento prehľad nie je nový úplný register všetkých
záväzkov. Úprava nemení fakturáciu, právne alebo AML brány ani serverové oprávnenia. Po skončení príjmu
dokladov má prednosť odovzdanie a stiahnutie údajov; aktívne kroky sa nezobrazujú.

## Overenie

Jednotkové scenáre kombinujú termíny, úhrady, správy, prvé kroky a bankové hranice. HTTP scenáre používajú
skutočný workerd a D1: vlastník a kolega, limit a dve schválenia, nulové pohyby, chýbajúci výpis, neznáma
alebo chybná banka, viac súčasných úloh, 243 chýbajúcich podkladov a skončený príjem. Samostatný prehliadačový
scenár na mobile prejde hlavným tlačidlom až k správe a overí, že sa nevytvorila odpoveď.
Desať nových stavov vstupuje do existujúceho UI overenia pri 1440, 390 a 320 px vrátane prvých krokov
kolegu, ktorý nemôže obnoviť bankový súhlas vlastníka. Vysvetlenie používa existujúcu pozíciu ovládania,
aby na mobile nevytvorilo ďalší široký stĺpec.
Existujúce AML očakávanie používa skutočný bratislavský deň zaznamenaného odborného rozhodnutia;
opakovaná faktúra sa kontroluje voči okamihu plánovanej úlohy. Zmena opravuje časové predpoklady testov,
nemení výpočet termínov alebo vystavovanie faktúr v aplikácii.

Rozhodujúci výsledok všetkých povinných kontrol je pri konkrétnom commite v príslušnom PR.
Automatické kontroly nenahrádzajú používateľský pilot ani skúšobný mesiac so skutočným klientom.
