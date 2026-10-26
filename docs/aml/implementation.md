# AML v aplikácii Firmony

Stav implementácie k 21. 10. 2026. Vetva `codex/aml-before-first-client`, PR #10. Zmeny sa nasadia až po úspešných kontrolách presného commitu a zlúčení. Tento záznam nepotvrdzuje právne schválenie ani prevádzkový test na skutočnom klientovi.

## Prijatie klienta

Objednávka najprv zhromaždí úplné vyhlásenie a pôvodný podpísaný súbor. PDF ani ASiC-E sa nahraním nepovažuje za overený podpis. Odborník musí overiť kvalifikovaný podpis, zhodu podpísaného obsahu a osoby, KUV, PEP, sankcie EÚ aj OSN a krajiny. Každá kontrola má autora, čas, výsledok, konkrétny zdroj a väzbu na nemennú verziu podkladov. Nový údaj alebo kontrola zneplatní staré schválenie.

Rizikovú skupinu a prijatie potvrdzuje výslovne určená osoba. Pri zvýšenom riziku je potrebná zdokumentovaná zvýšená starostlivosť, súhlas a overenie originálov o účte klienta v banke EÚ a prvej platbe. Prístup k uzavretiu zmluvy navyše vyžaduje platné právne a poistné schválenie aktuálnych podmienok a individuálne posúdenie služby s prideleným účtovníkom. Kontrola sa opakuje pri konečnom zápise do databázy.

Papierová zmluva ani zaškrtnutie administrátora nenahrádza AML. Ručný postup najprv overí firmu a konateľa v registri. Účet vznikne až z overených podkladov, po opätovnej kontrole originálov. Súčasný postup podporuje samostatne konajúceho člena štatutárneho orgánu. Spoločné konanie viacerých osôb a osobné overenie bez QES nemajú úplný aplikačný postup: zostávajú zablokované, kým nebude bezpečne doplnená identifikácia každého zástupcu. Neobchádzať vytvorením fiktívneho jediného konateľa.

## Uchovanie a prístup

Doklady, platby, výpisy, účtovníctvo, korešpondencia, udalosti a identifikačné podklady zostávajú najmenej päť kalendárnych rokov od skončenia vzťahu. Deväťdesiat dní určuje prístup klienta na stiahnutie, nie výmaz. Prístup končí aj bez spustenia plánovanej úlohy vrátane pôvodného odkazu na uzavretú objednávku. Zákonný archív klienta môže následne čítať iba určená osoba; účtovné exporty a pôvodné súbory zostávajú dostupné jej. Bežný administrátor nie je automaticky určenou osobou. Poverenia, zdroje, kontroly a rozhodnutia sú dopĺňané do histórie.

Odmietnutý záujemca má samostatnú päťročnú lehotu. Jej uplynutie neprebije nevyriešené interné oznámenie ani písomné predĺženie FSJ. Existujúce právne uchovania, otvorené incidenty a nevyriešené podania chránia záznamy pred výmazom. Výmaz má ochranné obdobie a kontrolu pred odstraňovaním súborov. Prípadné dlhšie povinnosti z iných predpisov sa posudzujú osobitne. Prevádzkový register incidentov a ochranných opatrení má vlastný oprávnený okruh a nenahrádza prístup k účtovnému archívu.

## Priebežná kontrola

Termíny obsahujú aktualizáciu identifikácie po 12 mesiacoch pri nízkom a štandardnom riziku, po 6 mesiacoch pri zvýšenom. Kontrola automaticky zaúčtovaného dokladu zaznamenáva konkrétnu verziu, autora a čas; zmena dokladu ju zneplatní. Nevybavené staršie doklady nevypadnú z práce účtovníka. Termín kontroly je koniec nasledujúceho mesiaca podľa programu 6.1.

## Overenie a otvorené zdrojové obmedzenie

Pridané kroky schémy 73 až 77. Prvých 72 krokov chráni test kontrolným súčtom aj skutočná migrácia samostatnej D1 so starými údajmi a originálom v R2. Runtime testy preverujú chýbajúce kontroly, zmenu podkladov počas podpisovania, nesprávny podpis, zmenu určenej osoby, prístup k archívu, päťročné uchovanie a výmaz záujemcu. Syntetické podpisové súbory v testoch dokazujú poradie a ochrany aplikácie, nie kryptografickú správnosť reálnych QES.

Zákon 297/2008 bol prečítaný v znení účinnom od 17. 8. 2026, najmä §§ 7 až 12, 14 až 21:
https://static.slov-lex.sk/static/SK/ZZ/2008/297/20260817.html

Zoznam EÚ je overený z primárnej tabuľky Európskej komisie, konsolidácia k 29. 1. 2026 vrátane nariadení 2026/46 a 2026/83:
https://finance.ec.europa.eu/financial-crime/anti-money-laundering-and-countering-financing-terrorism-international-level_en

Úplný konsolidovaný originál EUR-Lex blokuje automatickým overením návštevníka. Nie je pravdivé označiť požiadavku na jeho prečítanie za splnenú. Pred prvým klientom ho musí určená osoba alebo advokát porovnať s konštantami v `src/aml/countries.ts`:
https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:02016R1675-20260129

Originálne zoznamy FATF z 19. 6. 2026 sú oddelené. Zvýšené monitorovanie samo osebe neznamená výzvu FATF na zvýšenú starostlivosť. Program Firmony ho používa ako štandardný rizikový faktor:
https://www.fatf-gafi.org/en/publications/High-risk-and-other-monitored-jurisdictions/call-for-action-june-2026.html
https://www.fatf-gafi.org/en/publications/High-risk-and-other-monitored-jurisdictions/increased-monitoring-june-2026.html

## Opravy po dvoch nezávislých kontrolách (krok schémy 81, 26. 10. 2026)

- Krajiny: kódy sa čítajú iba z polí s kódmi (pobyt, štátne príslušnosti, krajiny sídla a partnerov), názvy iba z polí s názvom krajiny alebo štátnej príslušnosti. Adresa ulice sa na krajinu nečíta. Partneri v krajine pod monitoringom FATF sú jeden faktor, nie dva. Verzia pravidiel krajín je `2026-10-26`, zoznamy sú overené 21. 10. 2026.
- Zmena zoznamov (program 4.4 c)): určená osoba na stránke Určená osoba AML prehodnotí klientov. Server vypočíta požadovanú skupinu z uloženého vyhlásenia a zapíše ju s novou verziou (`aml_policy_reviews`). Klient, ktorého potvrdená skupina stačí, je hneď znova overený; ostatní potrebujú nové rozhodnutie.
- Skutočné miesto výkonu činnosti (4.2 a)): ak nie je zhodné so sídlom, schválenie vyžaduje kontrolu z nezávislého zdroja (`aml_place_checks`).
- Pravidelná aktualizácia (4.7): každé ďalšie schválenie toho istého klienta vyžaduje kontroly PEP, sankčných zoznamov EÚ a OSN a KUV zapísané po predchádzajúcom schválení.
- Online zmluva: podpísané vyhlásenie obsahuje aj prijatie ponuky (balík, prvý mesiac, verzia podmienok). Zmluvu možno uzavrieť iba presne v tomto znení, aj na úrovni SQL; držiteľ e-mailového odkazu nemôže v mene overenej osoby uzavrieť nič iné. Papierová cesta overuje podpisujúceho voči štatutárnemu orgánu z registra rovnako.
- Verejný odkaz objednávky nezobrazuje rodné čísla ani číslo dokladu; pri úprave sa píšu znova.
- Uchovanie: odobratý člen firmy stráca prístup hneď, ale jeho záznam ostáva, kým sa uchovávajú záznamy firmy (`member_removals`). Platby odobratého bankového účtu sa presunú mimo účtovníctva do `dropped_payments` a vymažú sa až s firmou. Žiadosť z webu bez začatej identifikácie sa vymaže 365 dní od odoslania.
- Interné oznámenie: autor vidí výsledok, nie odôvodnenie určenej osoby (7.2). Určenú osobu nemožno preradiť z roly správcu, kým nie je poverená iná.

## Pred prvým skutočným klientom

Christian potvrdí totožnosť prvého správcu a jeho poverenie určenou osobou podľa podpísaného programu. Advokát overí podmienky, ochranu údajov, program, zmluvné dokumenty a nepokryté postupy. Poisťovňa písomne potvrdí konkrétne krytie; do aplikácie sa zaznamenajú skutočné referencie. Zostáva podpis programu, registrácia goAML a skúška úplného mesiaca s účtovníkom. Samotné zelené testy nenahrádzajú tieto kroky ani overenie skutočného kvalifikovaného podpisu.
