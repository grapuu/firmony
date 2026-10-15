# Customer Experience Blueprint

Hlavná jednotka zážitku je **úspešne dokončená povinnosť s čo najmenšou námahou klienta**. Počet kliknutí neobsahuje hľadanie dokladov, telefonovanie ani opakované vysvetľovanie. Meriame aj tieto činnosti. Všetky navrhnuté toky nižšie sú H, aktuálny stav je doložený v dokumente 03. Väzby: P2, P3, P5, P6, P7, P9, P10.

## Cesta od prvého kontaktu po odchod

| Krok | Dnešné trenie/riziko | Navrhnutý tok a potrebný úkon klienta | Akceptácia a meranie |
|---|---|---|---|
| 1 Návšteva | Široký sľub môže vytvoriť nesprávne očakávanie | Klient sa spozná v segmente, vidí začiatok služby a príklad výsledku | Pri testovaní vysvetlí ponuku vlastnými slovami; čas pochopenia |
| 2 Ponuka | Aplikácia môže pôsobiť ako úplná služba pre všetkých | Jednoduchý opis zahrnutých a nepokrývaných situácií, dostupného odborníka | Test odlíši bežné účtovanie od daňového poradenstva a nepodporovaných režimov |
| 3 Cena | Doklady nevystihujú všetku náročnosť | Krátke zisťovanie typu firmy, režimu, objemu a výnimiek; úplný ročný rozsah | Klient pozná mesačnú cenu, mzdy, závierku a schvaľovanie výnimiek; žiadne prekvapivé vyúčtovanie |
| 4 Registrácia | Registrácia sa môže zameniť za účinnú službu | E-mail overiť raz, uložiť postup; jasne oddeliť žiadosť, zmluvu a aktiváciu | Návrat po prerušení; čas/odpad na kroku, duplicitné účty |
| 5 Firma | Údaj z registra nedokazuje totožnosť a oprávnenie osoby | Predvyplnený register; klient potvrdí zmeny, tím vykoná AML a overenie | Bez doloženej identity/kompetencie sa služba neaktivuje |
| 6 Zmluvy a mandáty | Podpis súboru nemusí znamenať účinné zastupovanie na portáli | Jedna stránka „Potrebujeme od Vás“, stav každého dokumentu a mandátu | Vidieť podpísané znenie, overenie a úspešný test zastupovania; čas klienta vs čas čakania |
| 7 Prevzatie | Klient môže zháňať celý archív sám; import databázy chýba | Po autorizácii koordinuje prevzatie odborník; klient dá kontakt a potvrdí hranicu období | Podpísaný kontrolný protokol, rozdiely zostatkov vysvetlené; čas klienta a kalendárny čas |
| 8 Banka | Produkčné prepojenie neoverené, súhlas vyprší | Bankový redirect a výber účtu; ukázať poslednú úspešnú synchronizáciu a medzery | Výpadok nemôže vyzerať ako nulové transakcie; reautorizácia, spätné doplnenie a párovanie testované |
| 9 Doklady | Opakované fotenie faktúr, ktoré už existujú digitálne | Uprednostniť prijaté eFaktúry/e-mail; foto ako fallback, klient dodá iba chýbajúce | Originál a príjem bez duplicity, oprava chyby nahratia bez straty; aktívne minúty na doklad |
| 10 Účtovanie | Klient nemusí rozumieť priebežnému stavu | „Prijaté → kontrolujeme → zaúčtované“, pri čakaní kto a čo rieši | Každý stav zodpovedá skutočnému záznamu; žiadne zelené hotovo len po OCR |
| 11 Výnimka | Opakované otázky bez kontextu | Jedna otázka pri konkrétnej transakcii, dôvod, dve zrozumiteľné možnosti ak vhodné | Odpoveď obnoví správny prípad; kontrola práv a audit; počet opakovaných vysvetlení |
| 12 Kontrola | Nie je uzavretý odborný kontrolný zoznam | Účtovník schváli bežné prípady, rizikové metodik; klient schváli iba svoje rozhodnutia | Schválenie obsahuje autora, rozsah, verziu a prípadné výhrady |
| 13 Podanie | „Označiť podané“ nie je dôkaz prijatia | Pripravené → autorizované → odoslané → prijaté/odmietnuté; klient rieši potrebný súhlas/platbu | Uložené potvrdenie, termín a suma platby; prijatie sa nikdy neodvodí len z HTTP 200 |
| 14 Uzávierka/prehľad | Predbežný výsledok sa môže považovať za disponibilný zisk | Vysvetliť „priebežné/odsúhlasené“, posledný dátum banky a chýbajúce položky | Neaktuálne dáta označené, zisk oddelený od hotovosti a dividend; pochopenie majiteľom |
| 15 Podpora | Pôvodný front skrýval nezodpovedané otázky | Pridelený vlastník, najstaršie čakanie, termín odpovede, odovzdanie zástupcovi | Automatické oznámenie nie je odpoveď; prvá reakcia a vecné vyriešenie sú samostatné metriky |
| 16 Odchod | Technický ZIP ešte nemusí byť použiteľná agenda | Odborník pripraví odovzdanie, majiteľ overí export, nástupca odsúhlasí úplnosť | Doklady, knihy, podania, histórie a manifest; zmena dát zneplatní potvrdenie; reálne otvorenie/import |

## Konkrétne obrazovky

**Domov klienta:** tri oddelené bloky „Vybavené“, „Riešime za Vás“, „Potrebujeme od Vás“. Každá úloha má dôvod, zodpovednú osobu, termín a jednu hlavnú akciu. Prázdny blok potrebných úkonov má pokojný text; nesmie tvrdiť, že sú všetky povinnosti hotové, ak banka nebola synchronizovaná. Hlavička zobrazuje firmu a posledné pokryté obdobie. Návrh; celý nový dashboard v tejto vetve neimplementujeme.

**Prevzatie firmy:** odovzdávací zoznam s vlastníkom každej položky, zdrojom, obdobím, stavom kontroly a odchýlkou. Klient nevidí interné AML podozrenia. Podklad, ktorý účtovník už prevzal, sa znova nepýta. Pri neúplnosti je zrejmé, ktoré podanie zabezpečuje stará kancelária a ktoré Firmony; žiadna povinnosť nesmie zostať medzi nimi.

**Otázka k dokladu:** originál, suma/dátum a zrozumiteľná otázka bez internej účtovej terminológie. Stav „odpovedané klientom“ čaká na odborné potvrdenie; odpoveď klienta automaticky nepotvrdí daňový odpočet.

**Účtovnícky front podpory:** najstaršia nezodpovedaná správa, počet čakajúcich správ, pridelená účtovníčka alebo chýbajúce pridelenie, čas cieľovej odpovede a omeškanie. Úvodný text nesmie sľubovať, že samotná prvá reakcia vyriešila vec. V tejto vetve realizované; evidencia vecného uzavretia, zástupcu a automatické upozornenie sú ďalšia práca P2/P9.

**eFaktúra:** čitateľný náhľad, zachovaný originál, identita partnera, validačné chyby pre odborníka a zrozumiteľný stav pre klienta. Technický prenos, prijatie druhou stranou a účtovné schválenie sú odlišné udalosti. Klient nemá riešiť opakované webhooky ani výber validačnej schémy.

## Výskum pred investíciou do veľkého redizajnu

Navrhujeme nábor **8 majiteľov** (nová firma, meniaci účtovníka, spokojný s dnešným riešením) a **3 účtovníkov**. Toto sú plánované počty, rozhovory neprebehli. Nežiadať účastníkov zdieľať živé rodné čísla alebo citlivé doklady; použiť syntetický prípad a ich opis minulého správania.

Rozhovor: posledný skutočný problém/termín, ako zistili stav, čo museli urobiť, kde opakovali informácie, za čo platia zvlášť a prečo by nezmenili účtovníka. Nepýtať sa iba „používali by ste AI“. Pozorovať úlohy: pochopiť rozsah a ročnú cenu, pripojiť banku v simulácii, vyriešiť nejasný výdavok, nájsť potvrdenie a export. Nechať používateľa hovoriť a konať bez navigovania moderátorom.

Zaznamenať úspech bez pomoci, omyl, aktívny čas, návraty, subjektívnu istotu pred/po a presný dôvod zlyhania. Pre positioning A/B/C rotovať poradie variantov, nezačínať chválou Firmony. Každú obavu označiť počtom a typom účastníkov; malú vzorku nezovšeobecniť na celý trh.

Navrhovaná podmienka iterácie: ani jeden účastník nesmie pochopiť návrh ako neobmedzené krytie všetkých daní či odstránenie zákonnej zodpovednosti. Opakujúce sa zlyhanie úlohy opravíme pred plateným získavaním podobných klientov. Úsporu času zverejníme až z porovnateľných úplných období, s rozsahom, vzorkou a rozdelením výsledkov.
