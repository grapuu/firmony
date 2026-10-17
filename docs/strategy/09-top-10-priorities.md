# Top 10 Strategic Priorities

Poradie podľa dopadu na správne poskytovanie služby, naliehavosti a závislostí; nejde o štatisticky vypočítané skóre. Náročnosť M/S/V = malá/stredná/veľká relatívna práca, nie rozpočet. Mená vlastníkov nie sú vymyslené; roly musí personálne potvrdiť zakladateľ. Pre každú kartu platí zákaz rozširovania marketingu nad preukázaný rozsah.

| Poradie | Návrh | Dopad | Náročnosť | Riziko realizácie | Naliehavosť |
|---|---|---|---|---|---|
| P1 | Úzky bezpečný rozsah a dôkazy pripravenosti | Kritický | V | V | Ihneď; brána každého živého pilota |
| P2 | Odborný vlastník, kontrola a zástupca | Kritický | S/V | V | Október, pred prvým klientom |
| P3 | Overená banková prevádzka | Vysoký | S/V | V, partner | Október–november |
| P4 | eFaktúra cez certifikovaného partnera | Kritický pre relevantný rozsah 2027 | V | V, partner/pravidlá | Začať október |
| P5 | Prevzatie s odsúhlasením stavov | Vysoký | S | S/V | Pred prvou migráciou |
| P6 | Dôveryhodný príbeh a presná ponuka | Vysoký | M/S | S | Teraz, potom používateľské overenie |
| P7 | Dôkaz prijatia podaní | Kritický | S/V | V, oprávnenia/portály | Pred prevzatím povinnosti |
| P8 | Meraná ekonomika a kvalifikácia firmy | Vysoký | S | S | Od prvého suchého prípadu |
| P9 | Viditeľné čakanie a meranie výsledku | Vysoký | S | S | Oprava frontu teraz, meranie v pilote |
| P10 | Použiteľný odchod a prenos dát | Vysoký | M/S nad existujúcim exportom | S | Pred živým pilotom |

## P1 — Bezpečný rozsah a brány

**Čo/prečo:** kvalifikovať úzky segment a nepustiť službu bez účtovného, právneho, bezpečnostného a obnovovacieho dôkazu. Chyba môže poškodiť firmu aj dôveru. **Dôkaz:** mapa 03, zástupné infra ID, chýbajúci restore protokol, L1. **Odlíšenie:** vynútiteľný rozsah a merané zotavenie; samotný bezpečnostný slogan nemá hodnotu. Konkurentovu kvalitu tým nepopierame.

**Implementácia:** kvalifikačné otázky a výluky pred zmluvou, silnejší vstup tímu, revízia prístupov a runbook obnovy. **Test:** tenant izolácia, obnova D1+R2, porovnanie hash/väzieb, kontrola obnovených práv. **Zlyhanie:** export sa zamieňa za obnovu alebo klient obíde kvalifikáciu. **Úspech:** G1–G4 majú skutočného kontrolóra a platné dôkazy, neprijatý segment sa nesprávne neaktivuje. Roly: technický vlastník, metodik, právo; zakladateľ rozhodne rozsah.

## P2 — Odborná služba s vlastníkom

**Čo/prečo:** pridelený odborník, náhradník a pravidlá kontroly podľa rizika. **Dôkaz:** podmienky sľubujú ľudskú kontrolu, kód priraďuje účtovníka, zástupnosť/capacity N; CI ukazuje obdobné odborné modely. **Odlíšenie:** dokazovať kontinuitu a kvalitu celého prípadu, nie exkluzivitu existencie účtovníka.

**Implementácia:** schvaľovací zoznam, metodická eskalácia, zastupovanie, samostatné vecné uzavretie otázky. **Test:** neprítomnosť pred termínom, rizikový doklad, konflikt návrhu AI a originálu. **Zlyhanie:** odborník sa zmení na úzke hrdlo alebo odklikáva bez kontroly. **Úspech:** každá kritická úloha má kvalifikovaného vlastníka a zástupcu; druhá kontrola nevykáže nevyriešený závažný rozdiel; meria sa náročnosť. Rola: vedúci účtovníctva.

## P3 — Banka bez rutinných výpisov

**Čo/prečo:** doručiť kontinuitu transakcií s minimom klientskych zásahov. **Dôkaz:** `bank.ts`/`fio.ts` majú lokálne regresie, produkcia N; DK3/K2 dokazujú, že bankové napojenie už nie je unikátna myšlienka. **Odlíšenie:** rozpoznanie medzier, ich oprava a minimálna námaha v celom mesiaci.

**Implementácia:** partner a konkrétne účty, stav súhlasu, posledná synchronizácia, kontrola zostatkov a alarm. **Test:** odvolaný súhlas, chýbajúci deň, duplicitný import, spätná oprava a zámok obdobia. **Zlyhanie:** zastarané dáta vyzerajú ako aktuálne. **Úspech:** celé testované obdobie sedí s bankou, medzera je viditeľná, klient nenahráva rutinný výpis pri funkčnom spojení; počet reautorizácií zaznamenaný. Rola: integračný vlastník + účtovník.

## P4 — eFaktúra ako zvládnutá zmena

**Čo/prečo:** príjem a potrebné vystavovanie/doručenie/archivácia cez certifikovaného partnera podľa rozsahu FS2/FS3. **Dôkaz:** dnešné UBL nie je transport; FS1–FS5/T1, konkurenti B7/K3/DK2 tiež komunikujú eFaktúru. **Odlíšenie:** kompletná registrácia a spracovanie bez prenášania technických problémov na majiteľa.

**Implementácia:** plán 05 vrátane verzií pravidiel, idempotencie, udalostí a identity. **Test:** validácia, cudzie ID, opakovanie, chybný podpis, timeout a dobropis. **Zlyhanie:** „odoslané“ sa zamieňa za prijaté alebo zaúčtované. **Úspech:** celý kvalifikovaný tok má preukázateľný výsledok a export originálu; G7 PASS až po externých dôkazoch. Rola: integračný vlastník + metodik.

## P5 — Prevzatie bez opakovaného naháňania klienta

**Čo/prečo:** koordinované vyžiadanie agendy a kontrola nadväznosti. **Dôkaz:** dnešné šablóny/počiatočné stavy sú len časť; M3/U3 ukazujú zrelý konkurujúci proces. **Odlíšenie:** menej aktívneho času klienta a žiadna povinnosť stratená medzi dvoma kanceláriami.

**Implementácia:** vlastník zoznamu podkladov, hranica období, zostatky, saldokonto, DPH, majetok a otvorené podania. **Test:** chýbajúca databáza, nevysvetlený rozdiel, migrácia uprostred roka. **Zlyhanie:** sľubujeme rýchlosť závislú od tretej strany bez výhrady. **Úspech:** odsúhlasený protokol, meraný klientsky a čakací čas, jasne pridelené všetky povinnosti. Rola: preberajúci účtovník.

## P6 — Príbeh a rozsah, ktorému zákazník rozumie

**Čo/prečo:** podnikateľ ako hrdina, odborná služba ako sprievodca; nahradiť absolútne sľuby presným výsledkom. **Dôkaz:** pôvodný hero predbiehal mapu 03; výskum zákazníckych obáv ešte chýba. **Odlíšenie:** konkrétny dokázateľný výsledok; „pokoj s aplikáciou“ komunikujú aj iní.

**Implementácia:** originálny hero a vysvetlenie, úplný rozsah ceny, dôkazové stránky, plán 06. **Test:** varianty A/B/C a pochopenie ročnej ceny/hraníc bez pomoci. **Zlyhanie:** krajší text zvyšuje nesprávne očakávania. **Úspech:** vhodný klient správne vysvetlí ponuku a nepredpokladá neobmedzené krytie; platená aktivácia sa sleduje po kvalite. Rola: zakladateľ + UX/growth.

## P7 — Skutočne prijaté podanie

**Čo/prečo:** spojiť generovanie, autorizáciu, prenos, prijatie a nápravu. **Dôkaz:** existujú XML/XSD/histórie; neexistuje doložené portálové prijatie. **Odlíšenie:** klient vie overiť výsledok namiesto neurčitého zeleného štítku; nepredpokladáme, že konkurencia potvrdenia nemá.

**Implementácia:** externé ID a potvrdenie pri presnom obsahu, odmietnutie s vlastníkom a termínom. **Test:** účinnosť mandátu, odmietnutie, prerušenie prenosu a oprava už podaného obdobia. **Zlyhanie:** ručné „podané“ sa považuje za dôkaz úradu. **Úspech:** G5 PASS pre presný formulár/rok/segment, v produkcii žiadne nepodložené tvrdenie o prijatí. Rola: účtovník + technický vlastník.

## P8 — Ekonomika a limity rastu

**Čo/prečo:** rozhodovať podľa úplných nákladov a kapacity, nie rozdielu paušálu a plánovej odmeny. **Dôkaz:** `ACCOUNTANT_PAY` je predpoklad, časový dataset chýba. **Odlíšenie:** udržateľná kvalita aj pri raste, nie slepá cenová vojna.

**Implementácia:** metodika 07, meranie podľa segmentu a výnimky, kvalifikácia pred ponukou. **Test:** migrácia, náročný mesiac, výpadok odborníka a závierka; skontrolovať dvojité započítanie práce. **Zlyhanie:** pilot obsahuje len najľahších známych a výsledok sa extrapoluje. **Úspech:** reprodukovateľný výnos/náklad/kapacita a otvorene označené neznáme; škálovať až podľa kohorty. Rola: zakladateľ + vedúci účtovníctva.

## P9 — Čakanie a kvalita viditeľné v práci

**Čo/prečo:** otázka nesmie zmiznúť pod oznámením ani začať čakať odznova po pripomenutí. **Dôkaz:** pôvodné dotazy `team/store.ts` brali poslednú správu; audit našiel reálnu logickú chybu. **Odlíšenie:** merať dôslednosť podpory, nie tvrdiť, že nikto iný odpovedá pomaly.

**Implementácia teraz:** spoločná definícia nezodpovedanej správy pre front/počty/zoznam firiem, auditovaná priama odpoveď, pôvodný čas, termín, vlastník a počet správ. **Ďalej:** vecné uzavretie, eskalácia a zastupovanie. **Test:** automatické správy aj s autorom, viac správ, rovnaká sekunda, zmena pridelenia, cudzie firmy, sviatok/DST. **Zlyhanie:** prázdna prvá odpoveď vylepší metriku bez pomoci. **Úspech:** regresie držia pôvodné čakanie; samostatne sledovať prvú reakciu, čas vyriešenia a opakované otvorenie. Rola: produkt/technický vlastník + odborná podpora.

## P10 — Slobodný a použiteľný odchod

**Čo/prečo:** klient dostane čitateľnú, úplnú a nadväzujúcu agendu. **Dôkaz:** export/revízie/potvrdenie už sú testované; skutočný import nástupcom N. B5/S1 ukazujú odlišné pravidlá odchodu, žiadna univerzálna slabina trhu. **Odlíšenie:** odborné odovzdanie a preukázaná použiteľnosť, nie len existencia ZIP tlačidla.

**Implementácia:** dokončiť príjem balíka iným účtovníkom, právne odsúhlasiť uchovanie a výmaz, zahrnúť budúce eFaktúry/doručenky. **Test:** viac rokov, neskorá zmena revízie, nedostupný originál, neúplné potvrdenie. **Zlyhanie:** klient potvrdí neotvorený archív alebo chýba príloha. **Úspech:** protokol nástupcu, úplný manifest, žiadny predčasný výmaz; presný postup známy pred zmluvou. Rola: účtovník + technický vlastník + právo.
