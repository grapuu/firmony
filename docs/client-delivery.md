# Spoľahlivé odovzdanie dokladov a správ, J2

Implementácia z 22. 10. 2026 CEST. Nadväzuje na [produktovú jednoduchosť](strategy/12-product-simplicity.md).
Rieši prerušenie odosielania v existujúcich obrazovkách. Nevytvára nový účtovný postup ani nový stav odborne vybavenej otázky.

## Čo sa zmenilo

Predtým `inside.js` po sieťovej chybe spustil pôvodný formulár znova. Odpoveď HTTP 200 pritom mohla byť
stránka s odmietnutým súborom; posledná odpoveď určovala výsledok celej dávky. Pri presmerovaní na overenie
prístupu sa stratil kontext otvorenej stránky. Skrytý univerzálny formulár navyše nemal viditeľné potvrdenie.

Teraz klient odosiela jeden súbor a žiada výslovné potvrdenie prijatia zo servera. Potvrdenie obsahuje aktuálny
účet a firmu a vznikne po dokončení existujúceho uloženia. Prijatie nie je potvrdenie správnosti účtovania.
Server rozlišuje nový doklad, už prijatý súbor, bankový výpis a odmietnutie. Bežné formuláre bez JavaScriptu
naďalej dostávajú HTML alebo pôvodné presmerovanie.

Každý súbor zostáva v pamäti otvorenej stránky spolu s výsledkom. Po chybe klient vidí, ktoré prijatia sú
potvrdené, ktoré sú odmietnuté a ktoré ešte nie sú potvrdené. Vedome opakuje len nepotvrdené položky;
pri odmietnutí jedného súboru môžu pokračovať ostatné. Pri výpadku, strate prístupu alebo zmenenej firme
sa dávka zastaví. Overenie sa dá otvoriť v ďalšom okne. Opakovaný pokus použije rovnakú zmenšenú fotografiu,
takže existujúce rozpoznanie súboru podľa obsahu funguje aj po strate odpovede. Pridanie ďalších súborov
nezahodí predchádzajúce výsledky. Univerzálny výber ukazuje výsledok vo viditeľnom obsahu stránky.

Správa má jedno identifikačné číslo odoslania. Rovnaký účet, firma, text a súvis s platbou môžu dostať
potvrdenie opakovane, ale vytvoria jedinú správu a auditnú udalosť. Rovnaké číslo s iným obsahom sa odmietne.
Súbežné pokusy chráni pôvodný primárny kľúč správy a atómová dávka D1 vrátane udalosti a upozornenia.
Overený opakovaný pokus sa vybaví pred čerpaním ďalšieho limitu správ.

Pri neistej odpovedi text zostáva v pôvodnom formulári dostupný na čítanie a kopírovanie; do potvrdenia
rovnakého odoslania sa neupravuje. Pri výslovnom odmietnutí validáciou sa dá upraviť. Chyba bežného formulára
zachová aj platnú väzbu na platbu. Zmena firmy alebo účtu v druhom okne odmietne nové rozšírené odoslanie
pred akýmkoľvek zápisom. Existujúce CSRF, prístupové a účtovné brány ostávajú platné.

## Overenie a hranice

`test/delivery.runtime.mjs` preveruje skutočné HTTP, D1 a R2: nové a opakované súbory, zmiešané odmietnutie,
väzbu na platbu, zmenu účtu/firmy, bežné formuláre, opakované a súbežné správy a ukončený príjem.
`test/delivery.browser.mjs` používa skutočný klientsky formulár a zámerne zahodí odpoveď až po jej uložení
serverom. Overuje pokračovanie dávky, zmenu firmy, odmietnutý súbor, mobil 320 a 390 px a opakovanú správu.
Povinné kontroly presného finálneho commitu a produkčná revízia sa evidujú v PR.

Neodoslané súbory a text sa neukladajú do localStorage, sessionStorage ani iného trvalého úložiska prehliadača.
Pri opustení s rozpracovaným obsahom sa žiada štandardné upozornenie prehliadača. Po zatvorení stránky,
páde prehliadača alebo mobilného procesu ich obnovu nesľubujeme; už prijaté údaje ostávajú na serveri.
Sieťový pokus má vnútorný limit 45 sekúnd vrátane prijatia potvrdenia; nie je to záruka času spracovania.
Existujúca deduplikácia dokladov je podľa obsahu v rámci firmy. Toto nie je zavedenie globálnej atómovej
jedinečnosti hashov pri ľubovoľných súbežných príchodoch z viacerých kanálov.

J2 je rozdelené na túto implementovanú spoľahlivosť odosielania a otvorený následný krok: výslovná konkrétna
otázka účtovníčky, jej cieľ, odpoveď a potvrdenie odborného vybavenia. Prečítanie správy ani prijatie dokladu
sa za vybavenie otázky nepovažuje. J3 až J5 a pilot s klientom aj účtovníčkou zostávajú otvorené.
Ceny, zmluvné záväzky, odborné agendy, navigácia a vzhľad sa nemenia. Schéma je 77, ďalšia migrácia 78.
