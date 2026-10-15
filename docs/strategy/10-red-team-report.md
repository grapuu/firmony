# Red Team Report

Úlohou tohto dokumentu je napadnúť stratégiu vrátane našich návrhov. Nasledujúce scenáre sú riziká a hypotézy, nie tvrdenia o existujúcom incidente. Stav spustenia ostáva NO-GO do splnenia brán 08. Zelené CI neoprávňuje ignorovať tieto dôvody zlyhania.

| Ako môže Firmony zlyhať | Dôkaz/varovný signál | Konkrétna obrana a overenie | Zvyšné riziko / vlastník |
|---|---|---|---|
| 1 Sľubuje viac, než vie odborne obslúžiť | Širší marketing než preukázaný kód/prevádzka | P1/P6, kvalifikácia a výluky pred zmluvou; používateľ musí správne pochopiť rozsah | Hraničné prípady; zakladateľ + metodik |
| 2 Chybne vypočíta daň aj pri zelených testoch | Test kopíruje implementačný vzorec alebo nepokrýva nový zákon | Nezávislá odborná sada, účinnosť pravidiel a kontrola celého obdobia | Chyba referenčného posudku; druhý kontrolór |
| 3 Odborník nestíha alebo odíde | Úloha bez zástupcu, backlog rastie | P2, zmluva a skúška neprítomnosti; brzdiť aktivácie podľa kapacity | Súbežný výpadok viacerých ľudí; vedúci účtovníctva |
| 4 Jednotková ekonomika sa zrúti | Nepočítaný čas otázok, prevzatia a opráv | P8, úplné úkony a kohorty, bez dvojitého započítania; náročné firmy kvalifikovať | Malá vzorka a sezónnosť; zakladateľ |
| 5 Údaje vyzerajú aktuálne pri nefunkčnej banke | Posledná synchronizácia stará, medzera neviditeľná | P3, kontinuita/zostatky a vlastník incidentu; skúška odvolaného súhlasu | Externá nedostupnosť; integračný vlastník |
| 6 eFaktúra nebude pripravená načas | Nie je partner, registrácia ani konformitný test | P4, skorý integračný míľnik, otestovaný externý postup alebo odklad segmentu | Výpadok partnera/pravidlá; zakladateľ + integrácie |
| 7 Zámena doručenia a zaúčtovania | Jeden univerzálny stav „hotovo“ | Samostatné fakty a idempotencia; udalosti mimo poradia a timeout test | Chybná externá doručenka; integrácie |
| 8 Podanie zostane neprijaté alebo po termíne | Ručné označenie bez potvrdenia úradu | P7, externé ID a odmietnutie s vlastníkom, účinný mandát | Výpadok portálu pred lehotou; odborník + zástupca |
| 9 Únik medzi firmami alebo prevzatie účtu | Export cez nesprávne oprávnenie, kompromitovaná schránka | P1, cielená revízia a silnejší vstup tímu, expirácia a reakcia na incident | Dodávateľ identity/e-mailu; bezpečnostný vlastník |
| 10 Máme zálohu, ale nevieme obnoviť službu | ZIP existuje, restore protokol chýba | Obnova D1+R2 do čistého prostredia, hash/väzby/práva a merané RPO/RTO | Poškodenie/konfigurácia mimo zálohy; technický vlastník |
| 11 Prevzatie prenesie starú chybu alebo stratí povinnosť | Neodsúhlasené stavy, nejasná hranica podaní | P5, protokol a vlastníctvo všetkých období; nevysvetlený rozdiel blokuje prevzatie | Nesúčinnosť predchodcu; preberajúci účtovník |
| 12 Klient odíde s nepoužiteľným exportom | Archív otvorený len naším vlastným kódom | P10, nezávislé otvorenie/import, manifest, potvrdenie aktuálnej revízie | Odlišný dátový model nástupcu; odovzdávajúci odborník |
| 13 Lepší konkurent kúpi distribúciu | Existujúce bankové/účtovné kanály CI; náš kanál N | Úzky segment, partneri a merané aktivácie; nepreplácať reklamu bez ekonomiky | Kopírovateľný messaging; growth + zakladateľ |
| 14 Zákazník nechce opustiť dobrú účtovníčku | Zmena má riziko a cenu, digitálne nástroje už dostupné | Výskum spokojnej kontrolnej skupiny, porovnať celý výsledok vrátane migrácie | Nedostatočne silná potreba; produktový vlastník |
| 15 Podporu „zrýchlime“ iba metricky | Automatická správa alebo prázdna reakcia zavrie čakanie | Oprava P9; prvá ľudská reakcia oddelene od vecného uzavretia a opakovania | Kvalita obsahu vyžaduje kontrolu; vedúci podpory |
| 16 AI vydá presvedčivý nesprávny návrh | Návrh bez pôvodu alebo bez výnimkovej kontroly | Originál, verzie, deterministické kontroly, odborník pri neistote; adversariálna vzorka | Odborník si chybu nevšimne; metodik |
| 17 Decembrový pilot dá falošnú istotu | Pár jednoduchých známych, bez januárových lehôt a závierky | Obmedziť záver na pozorovaný rozsah, pokračovať cez prvé reálne podania a náročné obdobie | Dlhý chvost chýb; zakladateľ + metodik |
| 18 Právne texty nezodpovedajú prevádzke | Návrh podmienok uvádza neoverenú lokalitu/rozsah, nejasná škoda | G2, právna revízia podľa reálnych kontraktov a nastavení, verzované znenia | Neskoršia zmena dodávateľa; právo + prevádzka |
| 19 Príliš veľa vývoja rozriedi prioritnú prácu | Nové moduly bez uzavretia partnera, podaní a obnovy | P1–P10, týždenne uzatvárať dôkazy, nie počítať obrazovky | Náročnosť integrácií; technický vlastník |
| 20 Služba je správna, no klient tomu nerozumie | Predbežný výsledok berie ako zisk na výber | P6/04, test pochopenia stavu, hotovosti a rozhodnutia; jasný kontakt | Odlišná finančná gramotnosť; UX + odborník |

## Pokusy vyvrátiť odporúčanú stratégiu

„Viditeľne vybavená práca“ môže byť len slušný štandard, za ktorý klient nezaplatí viac. Pred investíciou preto testovať, či používateľ už dnešný stav považuje za vyriešený a aký konkrétny problém ho prinútil meniť poskytovateľa. Ak rovnaký pokoj poskytuje jeho súčasná kancelária s Doklado alebo KROS, ukážka krajšej aplikácie nie je dôvod prechodu.

Úzky segment znižuje riziko, ale môže znížiť obchodný priestor. Overiť skutočne dostupné vhodné firmy a cenu ich získania, nie počítať celý počet s. r. o. ako adresovateľný trh. Ak vhodné firmy často vyžadujú majetok, odmenu konateľa či zahraničie, zmeniť kvalifikáciu a metodiku až po dôkazoch, nie potichu prijímať nepokryté prípady.

Odborná kontrola každého dokladu môže byť spočiatku správna, no pri raste drahá. Odpoveďou nie je automaticky ju odstrániť. Najprv odstrániť opakovaný zber údajov, zlepšiť odborné nástroje a zmerať riziko podľa typu prípadu. Až kalibrované pravidlá a posúdené zmeny zodpovednosti umožnia bezpečne meniť kontrolnú vrstvu.

Výhodu nesmieme dokazovať vlastným počtom testov ani porovnaním s hypoteticky zlou účtovníčkou. Nezávislý kontrolór má dostať rovnaký súbor prípadov, úplný čas klienta, skutočné opravy a výsledky podaní. Ak Firmony nevyjde lepšie, priorita je opraviť príčinu alebo zmeniť segment/ponuku, nie upraviť marketingový výklad.
