# Firmony: Bezúčtovníka, eFaktúra a priority do decembra 2026

Overené 15. októbra 2026. Rozhodovací dokument pre vývoj a prevádzku služby. Východisko kódu: `grapuu/firmony`, PR #3, commit `81421d31b8cfd26a2dd87cd052a1a658fd147e47`, a nadväzujúca vetva `codex/firmony-period-locks`. Funkcie vo vetvách nie sú dôkazom nasadenej ani odborne overenej služby. Návrhy nižšie sú odporúčania, nie popis už poskytovaných záväzkov.

## Rozhodnutie, ktoré z analýzy vyplýva

Firmony má súťažiť výsledkom: **podnikateľ dodá podklady, odborník prevezme zrozumiteľne vymedzenú prácu a klient vidí, čo je vybavené a čo potrebuje jeho rozhodnutie**. Výhodu treba preukázať časom klienta, presnosťou, prevádzkovou spoľahlivosťou a schopnosťou odovzdať kompletné dáta.

Bezúčtovníka je priamy konkurent. Jeho rozsah sa prekrýva s účtovnou službou, nie iba fakturáciou [B1, B2, B3]. Nemožno stavať stratégiu na predpoklade, že nemá účtovníkov, nepozná eFaktúru alebo s marketingom ešte nezačal. Verejne komunikuje odbornú pomoc [B3], aktívne publikuje [B6] a pripravuje eFaktúru s externým poskytovateľom [B8].

**Najväčšie dnešné riziko Firmony je rozdiel medzi širokým obchodným sľubom a preukázanou prevádzkou.** Kód pripravuje podklady a XML; nemá dokončenú doručovaciu integráciu eFaktúry ani automatické získavanie úradných potvrdení k daňovým podaniam. Bankové konektory sú implementované, ale lokálne náhrady bánk nepotvrdzujú produkčné oprávnenie a pokrytie konkrétnych bánk [F2–F5]. Pred rozširovaním marketingových sľubov treba tieto medzery uzavrieť.

## 1. Konkurenčná matica

Označenia dôkazov: **V** = overený obsah verejného zdroja; **T** = tvrdenie poskytovateľa, ktorého funkčnosť nebola prakticky otestovaná; **K** = overené v zdrojovom kóde Firmony; **?** = nepotvrdené. V/T neznamená nezávislú certifikáciu produktu. Nezakladal sa účet u konkurenta, nenahrávali sa doklady a neuskutočnilo sa žiadne skúšobné podanie.

| Oblasť | Bezúčtovníka: dôkaz a neistota | Skutočný stav Firmony | Odlíšenie a potrebný dôkaz |
|---|---|---|---|
| Model produktu | V/T: účtovníctvo, fakturácia, OCR, automatizované účtovanie a podania [B1–B3]. | K: aplikácia pre klienta aj účtovníčku, knihy, výkazy a pracovné fronty [F1, F3]. Prevádzka služby nepotvrdená. | Predať dokončenú odbornú prácu s menom zodpovednej osoby a merateľným výsledkom. |
| Odborník | V/T: pomoc expertov v aplikácii [B3]; partneri pri vývoji [B9]. Rozsah pravidelnej kontroly a jej kapacita ?. | K: pridelenie účtovníčky, tímové oprávnenia a komunikácia [F1]. Skutočné personálne obsadenie ?. | Zastupovanie pri neprítomnosti, rozsah kontroly a eskalácia musia byť prevádzkovo overené. Samotný „ľudský dohľad“ nestačí. |
| Zodpovednosť | V: VOP 7.2 neukladajú skúmanie hospodárskej podstaty; 7.3 ukladajú klientovi kontrolu a schválenie výstupov [B5]. | K: návrh zmluvy sľubuje kontrolu človekom a náhradu sankcie spôsobenej výlučne našou chybou, obsahuje obmedzenia [F6]. | Právne posúdiť konkrétne povinnosti, nápravu a limity; doložiť ich schopnosť plniť. Zákonná zodpovednosť firmy zostáva [L1]. |
| Práca zákazníka | V/T: verejný postup zahŕňa schvaľovanie dokladov, mesačný výpis a schvaľovanie výstupov [B1]. Počet úkonov a ich čas ?. | K: vlastná adresa na doklady, upload a otázky účtovníčky; zaúčtovanie robí tím [F1, F7]. Čas klienta sa nemeria. | Klient potvrdzuje vecný účel a rozhodnutia; účtovné kódy, sadzby a rutinnú kontrolu rieši služba. Porovnať rovnaké úlohy meraním. |
| Banka | V/T: spracovanie výpisov a párovanie [B2]. Aktívne AIS napojenie ani zoznam podporovaných bánk sa z preverovaných stránok nepotvrdili. | K: Enable Banking AIS, Fio token, camt.053, história importov a párovanie [F2]. Produkčné pripojenia ?. | Výhoda až po overení súhlasov, obnovy prístupu, stránkovania, výpadkov a úplnosti pohybov na reálnych účtoch. |
| Daňové podania | V/T: FAQ pomenúva GovBox Pro, schválenie SMS a uloženie potvrdenia; ponúka aj vlastné podanie z PDF/XML [B3]. Reálny priebeh ?. | K: XML DPH/KV/SV a DPPO/závierky, označenie podania a archív originálov [F3]. Označenie nie je potvrdenie úradu. | Pripojiť oficiálny alebo sprostredkovaný spôsob podania, autorizáciu a úradný doklad o prijatí. eFaktúra túto časť nenahrádza. |
| eFaktúra | V/T: na LinkedIn pripravujú príjem a odosielanie cez externého poskytovateľa v existujúcich balíkoch; dokončenie nebolo potvrdené [B8]. | K: parser a generátor UBL; chýba prevádzkový konektor poštára, doručenky a overenie aktuálnych pravidiel [F4]. | Kompletný funkčný tok a hladký onboarding. Samotná nálepka „eFaktúra 2027“ je požiadavka trhu, nie trvalý náskok. |
| Prechod od účtovníčky | V/T: FAQ opisuje prechod aj počas roka [B3]. Praktická migrácia ?. | K: registračné údaje firmy, zmluva, plná moc, žiadosť o prevzatie a ručné počiatočné stavy [F1, F6]. Všeobecný import denníka/otvorených položiek chýba. | Riadená migrácia s kontrolou zostatkov, otvorených položiek a nadväznosti DPH, so zodpovedným človekom. |
| Zložitejšie prípady | V/T: odmeny konateľa, kontrola účtov dodávateľov a šablóny dokumentov [B2]; dividendy v cenníku [B4]. Rozsah výnimiek ?. | K: základné mzdy, zahraničné prijaté doklady a vybrané režimy DPH [F3, F5]. Významné výluky sú uvedené nižšie. | Odborne podporované prípady podľa jasnej matice. Bezpečný manuálny postup môže byť pred spustením vhodnejší než neoverená automatizácia. |
| AI | V/T: asistent Ema a návrhy faktúr [B2]. Miera správnosti a eskalácií ?. | K: štruktúrované čítanie dokladov, validačné kontroly a front účtovníčky [F7]. Univerzálny klientsky účtovný chatbot chýba. | Uchovávať pôvodný vstup, návrh, zmenu človeka a verziu pravidiel; klient nesmie kontrolovať účtovnú správnosť za AI. |
| Odchod a dáta | V: VOP 9.8–9.9: 15 dní po skončení, vlastný export bezplatný, následné vymazanie dovolené [B5]. Úplnosť exportu ?. | K: ročné ZIP, CSV/JSON, originály, história, kontrolné súčty, dokončenie a výslovné potvrdenie exportu; vymazanie až po riadenom odovzdaní a uplynutí lehoty [F8]. | Silný základ. Overiť import archívu nezávislou účtovníčkou; hash sám nepreukazuje účtovnú úplnosť ani zálohovanie. |
| Bezpečnosť | V/T: web deklaruje dvojfaktorové overenie a cloudové zálohovanie [B1]. Výsledky bezpečnostných a obnovovacích testov ?. | K: e-mailové prihlásenie, oprávnenia podľa firmy, CSP a kontrola pôvodu požiadaviek [F9]. MFA tímu a obnova po havárii nepreukázané. | Preukázateľná izolácia firiem, MFA tímu, správa tajomstiev a skúška obnovy dát aj súborov. |
| Mobil a použiteľnosť | V/T: použitie cez počítač aj mobil [B1]. Praktické časy ?. | K: responzívne stránky, fotografovanie, PWA a testy rozloženia [F10]. Používateľské meranie chýba. | Merať dokončenie úloh a chybovosť na telefóne, nie počet obrazoviek či subjektívnu estetiku. |
| Ceny | V: cenník uvádza s.r.o. 19/49/79 € mesačne (VOP 8.1: bez DPH); obsahuje aj ďalšie balíky a označenie „Už čoskoro“, ktorého priradenie treba potvrdiť [B4]. | K: nastavené 89/169/329 € bez DPH, limity 20/60/150 dokladov, závierka 249 €, mzdy 15 €/osoba [F11]. Ide o konfiguráciu návrhu. | Porovnávať rovnaký rozsah služby a doklady; nevyvodzovať z čísel rovnaké pokrytie ani výnosnosť. Ceny nemeníme na základe neovereného dojmu. |
| Marketing a trakcia | V/T: náborový príspevok zakladateľa hovorí o desiatkach platiacich zákazníkov [B7]. Čísla sú jeho tvrdenie. V: blog je aktívny [B6]. | K: prezentačný web a registrácia [F10]. Produkčná návštevnosť, konverzie a zákazníci neboli doložené. | Plánovať konkurenciu už dnes. Neodvodzovať dátum kampane, rozpočet ani veľkosť tržieb. |

### Čo ešte prakticky preveriť u konkurenta

V povolenom skúšobnom účte so syntetickými údajmi zaznamenať podporované banky, dostupné balíky, cestu k účtovníkovi, vlastný a automatický režim podania, dostupnosť poštára, kreditné doklady, export a obnovenie prístupu. Rovnaká sada úloh pre oba produkty: prijatie faktúry, duplicitný bloček, sporná DPH, nejednoznačná úhrada, chýbajúci doklad, chyba po podaní, migrácia a odchod. Merať aktívny čas, počet rozhodnutí, počet návratov a úspešné dokončenie. Počet zákazníkov, skutočnú správnosť a interné SLA nemožno potvrdiť prehliadkou webu.

## 2. Desať najdôležitejších príležitostí

Poradie je návrh podľa dopadu na klienta a dôveru, naliehavosti pred 1. 1. 2027 a možnosti použiť existujúci kód. Hodnotenia nie sú odhady návratnosti. „Realizovateľnosť“ opisuje technické a prevádzkové závislosti, nie potvrdenú kapacitu tímu.

| # | Príležitosť a výstup | Dopad | Realizovateľnosť | Naliehavosť a dôkaz dokončenia |
|---|---|---|---|---|
| 1 | Dokončená odborná služba: zodpovedný človek, zastupovanie, kontrola a eskalácie. | Veľmi vysoký | Stredná; potrebný odborný tím a právne vymedzenie. | P0. Každý prijatý klient má vlastníka; neštandardné prípady nemôžu zostať bez riešiteľa [F1, F6]. |
| 2 | Kompletná eFaktúra cez certifikovaného partnera. | Veľmi vysoký | Stredná; existuje UBL základ, chýba transport, pravidlá a dôkazy. | P0. Platný príjem aj odoslanie, opakované udalosti bez duplicít, originál a potvrdenie dostupné [E1–E6]. |
| 3 | Banka bez pravidelného výpisu a s kontrolou úplnosti. | Veľmi vysoký | Stredná; konektory existujú, produkcia závisí od poskytovateľa a banky. | P0. Podporované banky otestované, zostatky zosúladené, výpadok a expirácia viditeľné [F2, E7]. |
| 4 | Prevzatá povinnosť podať a dohľadať potvrdenie. | Veľmi vysoký | Stredná až nižšia; samostatná integrácia a oprávnenia. | P0. Každé podanie má ID a potvrdenie úradu; stav „pripravené“ sa nezamieňa s „prijaté“ [F3, B3]. |
| 5 | Minimum otázok klientovi, adresované iba jeho rozhodnutiam. | Vysoký | Vyššia; nad existujúcimi správami a frontmi. | P0/P1. Každá otázka má dôvod, návrh a väzbu na doklad; meraný čas klienta klesá [F1, F7]. |
| 6 | Prechod s overenými počiatočnými stavmi a inventúrou otvorených položiek. | Vysoký | Stredná; ručné stavy existujú, migrácia musí doplniť ďalšie evidencie. | P0 pre prvých klientov. Podpísané odsúhlasenie začiatku a nadväznosti dát [F1, F6]. |
| 7 | Bezpečný odchod s preukázateľne použiteľným archívom. | Vysoký | Vyššia; veľká časť je implementovaná. | P0. Nezávislý preberajúci účtovník dokáže z archívu pokračovať [F8]. |
| 8 | Kontrolovateľné účtovníctvo: zámky, verzovanie opráv a história rozhodnutí. | Vysoký | Vyššia pre zámky; stredná pre úplnú históriu každej zmeny. | P0. Žiadna otestovaná cesta nezmení uzamknuté zápisy; otvorenie má dôvod a autora [F12]. |
| 9 | Dôveryhodné spustenie: MFA tímu, zálohy, obnova a dostupnosť. | Veľmi vysoký | Stredná; vyžaduje prevádzkové prostredie a skúšky. | P0. Obnova izolovanej kópie DB aj originálov, kontrola prístupov a reakcie na incident [F9]. |
| 10 | Značka založená na dôkazoch a špecializovaný nábor klientov. | Vysoký | Vyššia pre obsah, stredná pre overenie konverzie a kvality. | P1 súbežne s pilotom. Meraný prechod od návštevy k aktivovanej službe; odborné prípadové štúdie [B6–B8, F10]. |

## 3. Konkrétny návrh produktu a automatizácie

### Účtovník preberá odbornú prácu

Navrhovaná zodpovednosť: klient potvrdzuje pravdivosť podkladov, účel nejasnej transakcie a obchodné rozhodnutia; pridelená účtovníčka kontroluje klasifikáciu, DPH, úplnosť a výkazy; vedúci odborník rieši nové a rizikové situácie; prevádzkovateľ rieši dostupnosť a opravu chýb. Ide o potrebné roly, nie potvrdené obsadenie.

Doplniť pracovný záznam kontroly mesiaca: identita účtovníčky, rozsah, nevyriešené položky, kontrola banky, DPH a miezd, verzia dát, rozhodnutie o podaní, dôkaz podania a prípadné otvorenie. „Skontrolované“ zneplatniť pri zmene jeho podkladov. Pridelenie klienta jednej osobe bez zastupovania nie je SLA [F1, F3, F12].

Zmluva Firmony už obsahuje odlišný záväzok kontroly a nápravy [F6]. Pred publikovaním treba právne posúdiť jeho vykonateľnosť, hranice náhrady škody, výluky, termíny a súlad so skutočnou kapacitou. Bez potvrdenia netvrdiť, že existuje poistenie. Zákonnú zodpovednosť účtovnej jednotky nemožno marketingom odobrať [L1].

### Spracovanie podľa rizika

Navrhovaný tok: príjem originálu → deterministická validácia → návrh → odborná kontrola → zaúčtovanie → uzamknutie → výkaz/podanie → archivácia. Na každom kroku uložiť pôvod, verziu pravidiel, rozhodnutie a osobu alebo automatický mechanizmus, ktorý konal. Toto je návrh rozšírenia existujúcej fronty, nie tvrdenie o už hotovom engine [F7, F12].

- **Rutinné podklady:** štruktúrované XML a čitateľné doklady sa spracujú bez prepisovania. Opakujúci sa dodávateľ je pomôcka, nie dôkaz daňovej uznateľnosti. Kým platí sľub kontroly každého výsledku človekom, automatizácia pripravuje prácu odborníkovi.
- **Neistota:** nezhoda súm, chýbajúci dátum, neoverený partner, viac rovnako pravdepodobných úhrad, duplicita, majetok, súkromné použitie alebo neznámy režim idú do frontu s konkrétnym dôvodom. Jedno numerické „AI confidence“ bez kalibrácie nestačí.
- **Otázka podnikateľovi:** iba vec, ktorú odborník nevie z dokladov: na čo nákup slúžil, kto bol na ceste, či sa majetok používa súkromne. Jedna zrozumiteľná otázka s odporúčaním, nie výber účtov 5xx alebo paragrafov DPH.
- **Oprava:** zachovať predchádzajúcu hodnotu, autora, dôvod a väzbu na výkaz. Opravenie účtovníctva a opravné/dodatočné daňové podanie sú súvisiace, ale odlišné úkony.
- **Odolnosť:** opakovaná správa nesmie opakovane vytvoriť doklad, úhradu ani podanie. Čiastočné zlyhanie sa obnoví z trvalého stavu; neukrýva sa iba do všeobecného logu. Toto musí overiť test s prerušením procesu.

### Banka a priebežná úplnosť

Použiť existujúci Enable Banking AIS pre podporované banky; Fio zachovať ako konkrétny alternatívny konektor a výpis ako núdzový vstup [F2]. Dokumentácia AIS odlišuje sandbox od produkcie a produkčný prístup podmieňuje aktiváciou a formalitami; registrácia testovacej aplikácie sama nestačí [E7]. Dostupnosť banky a rozsah dát overovať cez poskytovateľa a reálny súhlas, nie podľa statického marketingového zoznamu.

Doplniť plánovač s posledným úspešným načítaním, stránkovaním, prekrytím obdobia, bezpečným opakovaním a detekciou medzery. Klient má vidieť aktuálnosť dát a jedinú potrebnú akciu pri obnovení súhlasu. Účtovník potrebuje výnimky: rozdiel banky a knihy, neznáma platba, konflikt účtov, kurz či viac možných dokladov. Priebežná synchronizácia nesmie znamenať sľub okamžitosti každej banky. Presné frekvencie a limity sa overia pre konkrétny produkčný prístup [E7, E8].

### eFaktúra: rozsah povinností a hranice dnešného kódu

Podľa manuálu FS sa od 1. 1. 2027 povinné vystavovanie pri zákonom určených tuzemských dodaniach týka tuzemských platiteľov DPH; príjem treba zabezpečiť aj dotknutým neplatiteľom a ďalším právnickým osobám. Spotrebiteľské B2C dodania nemajú tento istý režim. Povinnosť nemožno paušálne pripísať každej faktúre alebo každej osobe registrovanej na DPH [E1, E2]. Výnimky a konkrétny prípad má potvrdiť odborník podľa aktuálneho znenia zákona.

Firmony má UBL parser a generátor. Vygenerovaný súbor s `CustomizationID` však ešte nepreukazuje validitu všetkých prípadov, dostupného príjemcu ani doručenie [F4]. Úplná validácia potrebuje UBL XSD, pravidlá EN 16931 a Peppol BIS v Schematrone [E4, E5]. FS zverejnila aktualizáciu slovenských transpozícií **14. 10. 2026, verzia 1.12** [E3]. Jej existenciu a verziu sme overili; XLSX sa cez použitý webový reader nedal načítať, jednotlivé scenáre preto neboli vykonané. Sú povinnou vstupnou sadou pre implementáciu, nie splneným testom.

Odporúčaná architektúra, ktorá sa má doplniť:

| Časť | Požadované správanie a uložený dôkaz |
|---|---|
| Nastavenie firmy | Právne oprávnenie, výber poštára príslušnou osobou, identifikácia firmy a test príjmu. API kľúč sa nezamieňa s právnym splnomocnením [E6]. |
| Dátový model | Oddeliť obchodnú faktúru, originálne XML, validačný výsledok, transportnú obálku, účtovné rozhodnutie a stav úhrady. Každá verzia má hash, typ a dátum pravidiel. |
| Vystavenie | Vyhodnotiť režim dodania a príjemcu, vytvoriť správny Invoice/CreditNote, validovať, vydať číslo a uložiť nemennú odosielanú verziu. Pri neistote nepokračovať potichu. |
| Odoslanie | Trvalý outbox a idempotentný identifikátor; uložiť požiadavku a ID poskytovateľa. Timeout vedie najprv k zisťovaniu výsledku, až potom k bezpečnému opakovaniu. |
| Príjem | Overiť firmu, pôvod udalosti a ochranu pred opakovaním. Uložiť pôvodné XML a obálku; potvrdiť prevzatie až po trvalom zápise. Rovnaké doručenie vytvorí jeden doklad. |
| Stavy | Rozlišovať „vytvorené“, „platné“, „čaká na odoslanie“, „prevzaté poskytovateľom“, „doručené“ a „chyba“. Obchodné schválenie, zaúčtovanie, zaplatenie a daňové oznamovanie sú samostatné stavy. |
| Zosúladenie | Webhook aj pravidelné dočítanie podľa kurzora. Spracovať oneskorené a prehodené udalosti bez prepísania novšieho dôkazu starším. Neúspechy dostane pridelený riešiteľ. |
| Účtovanie | Kontrola partnera, súm a režimu DPH, duplicít a zámku obdobia. Doručenie faktúry nepotvrdzuje jej vecnú správnosť ani daňovú uznateľnosť. |
| Opravy | Väzba dobropisu/opravného dokladu na pôvodný, zachovanie oboch originálov, zrozumiteľný dopad na účtovníctvo a podania. Generátor dobropisov dnes chýba [F4]. |
| Archív a odchod | Originál, prílohy, validačný výsledok, doručenky a história v exporte; možnosť zmeny poskytovateľa bez straty dôkazov. |

SAPI-SK je použiteľný kandidát pre spoločné rozhranie adaptéra; jeho špecifikácia opisuje odoslanie, príjem a potvrdenie prevzatia. Nie je to centrálna služba a jednotliví poskytovatelia zodpovedajú za vlastnú implementáciu. Technická autentifikácia nenahrádza mandát [E6]. Pripnúť verziu kontraktu a otestovať rozdiely konkrétnych poskytovateľov; nesľubovať ich zameniteľnosť bez testu.

**Predbežný výber partnera, bez objednávky alebo záväzku:**

| Kandidát | Čo sa overilo | Čo rozhodne o výbere |
|---|---|---|
| eFaktura s. r. o. / efaktura.sk | V zozname FS 9. 10. 2026, EFSK000028 [E9]. Verejne opisuje sandbox, API, idempotenciu, podpisované webhooky a dôkazy doručenia [P1]. | Prvý technický kandidát podľa dostupnej dokumentácie. Treba akceptačný test, oddelenie klientov, mandáty, export originálov/dôkazov, produkčnú zmluvu, podporu a aktuálnu ponuku. |
| Kaja Solutions / epostak.sk | V tom istom zozname, EFSK000012 [E9]. Verejné integračné rozhrania, dokumentácia a rozlíšenie priameho klienta, integrátora a white label spolupráce [P2]. | Porovnávací kandidát. Potvrdiť spôsob správy viacerých firiem, získanie sandboxu, transportné dôkazy, možnosti opakovania a zmluvný model. |
| Ionite B.V. | V zozname FS, EFSK000003 [E9]; jeho technické materiály odkazuje aj FS [E3]. | Alternatíva, ak komerčné podmienky a konkrétne API pokryjú potrebný model. Technická dokumentácia sama nepotvrdzuje vhodnú zmluvu alebo lokálnu podporu. |

Porovnať všetkých rovnakou sadou: platiteľ/neplatiteľ, Invoice/CreditNote, zaokrúhľovanie, neplatný identifikátor, odmietnutie, príloha, opakované doručenie, výpadok po odoslaní, dočítanie, zmena poskytovateľa a kompletný export. Ceny, marže a náklady neodhadujeme. Certifikovaný stav treba pred podpisom overiť znova; kandidát „v procese akreditácie“ nie je totožný s certifikovaným poskytovateľom [E9, E10].

### Onboarding, komunikácia a zákaznícky čas

Jeden zodpovedný človek prevedie klienta od založenia účtu po prvý skontrolovaný mesiac. Základné údaje sa načítajú, ale firma potvrdí oprávnenie konať, režim DPH, bankové účty, zamestnancov a začiatok služby. Migrácia musí obsahovať otvorené pohľadávky/záväzky, DPH, majetok, mzdy a predošlé podania; samotná vyrovnaná predvaha nestačí [F1, F3, F5].

Na hlavnej stránke klienta majú byť tri odpovede: čo je hotové, čo rieši Firmony, čo potrebuje klienta. Každá požiadavka má termín, dôvod, návrh a zodpovednú osobu. Súvisiace neurgentné otázky zoskupiť; urgentnú chybu alebo podanie s rizikom omeškania eskalovať samostatne. Existujúce pripomienky, termíny a správy sú základ, chýba preukázané meranie doručenia a času vyriešenia [F1, F3, F10]. Navrhované SLA sa smie zverejniť až po overení kapacity.

### Pokrytie reálnych účtovných situácií

| Scenár | Stav v kóde | Podmienka prijatia do služby |
|---|---|---|
| Bežná domáca s.r.o., EUR, faktúry a bločky | Knihy a účtovné návrhy existujú [F3, F7]. | Odborný referenčný súbor a celý mesačný cyklus vrátane banky a uzavretia. |
| Platiteľ/neplatiteľ/§ 7a, mesačná/štvrťročná DPH | Vybrané režimy a XML existujú vrátane mesačného SV pri štvrťročnej DPH [F3]. | Otestovať presnú kombináciu; registrácia § 7 a § 7a sa nesmie zamieňať. |
| Zahraničné prijaté služby a nadobudnutie tovaru | Podporované vybrané režimy [F3]. | Kontrola miesta dodania, dátumov, partnera a nároku na odpočet odborníkom. |
| Zahraničná vydaná faktúra | Jednoduchý generátor má domácu adresnú logiku [F4]. | Nerozširovať automatický sľub bez modelu krajiny, typu plnenia a validačných scenárov. |
| Dovoz, trojstranný obchod, domáce prenesenie povinnosti | Významné výluky opísané v projektových poznámkach [F5]. | Odborné spracovanie mimo automatického toku s kontrolou výsledku, alebo obmedzenie prijímania takých klientov. |
| Bežný pracovný pomer | Základný výpočet a uzavreté pásky existujú; podpora rokov je obmedzená [F5]. | Overená legislatíva príslušného roka a odborné porovnanie pások. |
| Dohody, odmena konateľa, dôchodca/študent, PN/dovolenka | Nie sú kompletným mzdovým modulom [F5]. | Jasný postup odborného spracovania a kontroly; nepovažovať ručné zadanie sumy za automatický výpočet náhrady. |
| Registrácie a mesačné výkazy poisťovniam | Zatiaľ manuálne v externých portáloch podľa údajov stránky [F5]. | Evidovať podanie a prijatie; zodpovednosť osoby a termíny nesmú zostať iba poznámkou. |
| Majetok a odpisy | Nákup môže ísť na 042, ďalšie kroky cez interný doklad; nie kompletné karty [F5]. | Evidencia obstarania, uvedenia do používania, účtovných/daňových odpisov a vyradenia. |
| Auto, súkromné použitie, cestovné a lízing | Kompletné špecializované procesy neboli v kóde potvrdené [F5, F7]. | Rozhodnutie odborníka a doloženie podkladov pred účtovaním. |
| Dividendy a iné výplaty spoločníkovi | Kompletný schvaľovací a daňový proces nebol potvrdený [F3–F5]. | Overiť obdobie zisku, oprávnenosť výplaty, rozhodnutie a daňové povinnosti; obyčajná platba nestačí. |
| Cudzia mena, pokladnica, zásoby | Úplné moduly chýbajú [F5]. | Pred širším náborom definovať obmedzenia a odborné riešenie; neúčtovať cudziu menu akoby išlo o EUR. |

## 4. Zásadné riziká súčasného návrhu Firmony

| Riziko | Zistenie a dôsledok | Náprava pred verejným sľubom |
|---|---|---|
| Šírka služby pred pokrytím | Zmluva zahŕňa podania a mzdy, kód má výluky a manuálne kroky [F3, F5, F6]. | Zoznam prijímaných prípadov, manuálne odborné postupy a zodpovedné osoby; zosúladiť predaj, zmluvu a produkt. |
| Falošný pocit podania | Export XML a interné označenie podania nie sú prijatie úradom [F3]. | Rozdeliť stavy a ukladať úradné potvrdenie; kontrolovať zoznam podaní pred termínom. |
| Neskorá eFaktúra | UBL bez transportu, aktuálnej validácie a mandátu nenaplní pripravenosť [F4, E1–E6]. | Integračný pilot a aktuálna pravidlová sada do novembra; alternatívny prevádzkový postup, ak partner zlyhá. |
| Účtovník ako skryté úzke miesto | Každý výsledok má skontrolovať človek, nie je doložená kapacita ani zastupovanie [F1, F6]. | Merať čas podľa prípadu a frontov; obmedziť počet prijatých klientov podľa reálnej kapacity. |
| Neoverená marža | Konfigurácia obsahuje plánované ceny a odmeny; historické komentáre tvrdili dosiahnutie marže bez nameranej spotreby a času [F11]. | Bez merania netvrdiť výnosnosť. Zahrnúť onboarding, podporu, opravy, banku, poštára a odborné výnimky; čísla nenahrádzať odhadom. |
| Prístup a tajomstvá | Magic link nie je samostatný druhý faktor; Fio token sa ukladá do textového poľa DB bez aplikačného šifrovania [F2, F9]. Nejde o tvrdenie, že infraštruktúra nešifruje úložisko. | MFA tímu, minimálne oprávnenia, šifrovanie/rotácia citlivých poverení, redakcia logov a audit prístupov. |
| Obnova a dostupnosť | Lokálne testy ani export nepreukazujú zálohu, obnovu alebo SLA [F8–F10]. | Obnova DB aj R2 do izolovanej kópie, kontrola hashov, prístupov a nadväznosti; zmerať RPO/RTO. |
| Odovzdanie a retencia | Potvrdenie exportu zablokuje pôvodne bezpodmienečné vymazanie po 90 dňoch; bez potvrdenia môže odklad trvať dlhodobo [F8]. | Pred produkciou zosúladiť zmluvu, výzvy klientovi, eskalácie a retenčný postup. Bezpečné odovzdanie nemá byť neurčitým retenčným pravidlom. |
| Závislosť od dodávateľa | Banka, čítanie dokladov, e-mail a budúci poštár sú samostatné body zlyhania [F2, F7]. | Trvalé úlohy, opakovanie, dočítanie, eskalácia, viditeľná aktuálnosť a manuálny núdzový postup. |
| Úpravy spätne | Knihy sa odvodzujú zo zdrojov; párovanie alebo zmena nastavenia môže ovplyvniť staršie zápisy [F3]. | Rozpracovaný míľnik dopĺňa databázové zámky, históriu a kontrolu súbehu [F12]. Úplná história každej editácie zostáva ďalšia práca. |
| „Vždy aktuálna“ legislatíva | Výpočtové roky a pravidlá sú verzované len čiastočne; mzdy nepodporujú ľubovoľný budúci rok [F5]. | Menovaný odborný vlastník, dátum účinnosti, regresné referenčné prípady a blokovanie nepodporovaných rokov. |
| Právny sľub AI a ochrany dát | Zmluva sľubuje ľudskú kontrolu a nepoužitie dát na tréning [F6]; nasadené nastavenia dodávateľov sa nepreverovali. | Overiť spracovateľské zmluvy, prenosy, retenčné nastavenia a skutočné prístupy. Nerobiť z kódu dôkaz zmluvnej zhody. |
| Mobil bez reálneho merania | Responzivita je overiteľná automaticky, čas podnikateľa zatiaľ nie [F10]. | Moderované úlohy na mobile, výsledok a čas aj pri chybe siete; merať celé dokončenie vrátane pomoci. |

## 5. Priority pred decembrovým spustením a po ňom

Presný decembrový deň nebol potvrdený. Nasledujúci harmonogram je návrh pre pripravenosť koncom novembra, nie garancia spustenia. Úlohy s externým schválením sa nezačnú považovať za hotové iba preto, že uplynul dátum.

| Obdobie | Konkrétny výstup | Zodpovedná rola | Podmienka dokončenia |
|---|---|---|---|
| 15.–23. 10. | Uzamknutie období; matica rozsahu služby; výber integračných kandidátov; plán prístupov a tajomstiev; zmluvné pripomienky. | Vývoj, odborný vedúci, prevádzkovateľ, právnik. | Testy a história zámkov; každý podporovaný prípad má postup a vlastníka; zoznam externých závislostí. |
| 24. 10.–6. 11. | Príjem/odoslanie eFaktúry v sandboxe; autentifikácia a mandáty; produkčné bankové overenie na povolených účtoch; návrh dôkazov podania. | Vývoj a odborný vedúci. | Reálne protokolové výsledky, žiadne dvojité doklady, zosúladenie banky, test zlyhania a obnovy. |
| 7.–20. 11. | Odborný referenčný súbor, kompletný mesiac a oprava po podaní; prevzatie účtovníctva; MFA tímu; obnova a export preberajúcemu účtovníkovi. | Odborný vedúci a vývoj/prevádzka. | Nezávislá kontrola výsledkov, odovzdanie použiteľných dát, nameraná obnova a vyriešené závažné chyby. |
| 21.–30. 11. | Obmedzený pilot s dobrovoľne zapojenými firmami z podporovaného segmentu; meranie času a kapacity; dokončenie návodov a predajných tvrdení. | Prevádzkovateľ, účtovníci a produkt. | Celý mesačný cyklus, prijaté podania, vyriešené výnimky, preukázateľná zastupiteľnosť a kapacita pre ďalších klientov. |
| December | Kontrolované prijímanie klientov v overenom rozsahu; eFaktúra aktivovaná pre dotknuté firmy pred 1. 1. 2027. | Prevádzkovateľ a odborný vedúci. | P0 chyby vyriešené, produkční partneri a mandáty aktívni, podpora pripravená. Ak nie, čakačka alebo užší pilot namiesto širokého sľubu. |
| Ďalšie obdobie | Podľa reálneho dopytu: úplné mzdy a výkazy, odmeny konateľov, majetkové karty, odpisy, dividendy, meny, cestovné a širšie integrácie. | Produkt, vývoj a odborný tím. | Pre každý modul referenčné prípady, manuálny núdzový postup a meranie správnosti; žiadne automatické rozšírenie zmluvného rozsahu. |

### Marketing, ktorý má oporu v produkte

Konkurent už buduje obsah pre konkrétne účtovné otázky [B6] a komunikuje eFaktúru [B8]. Predpoklad nulového marketingového náskoku je nesprávny. Navrhovaný positioning Firmony: odborná služba s jednoduchou aplikáciou, konkrétnou zodpovednou osobou a minimum potrebných rozhodnutí klienta. Dôkazy musia predchádzať silným absolútnym tvrdeniam.

1. Vybrať prvý segment podľa skutočného pokrytia: malé domáce s.r.o. s EUR a overenými scenármi, nie celý trh živnostníkov a zložitých firiem naraz [F3–F5].
2. Pripraviť presné stránky „Prechod od účtovníčky“, „eFaktúra pre neplatiteľa“, „eFaktúra pre platiteľa“, „Ako kontrolujeme účtovníctvo“ a „Ako odovzdáme dáta“. Každá má odborného autora, dátum kontroly, zdroje a jednu cestu k úvodnému rozhovoru.
3. Ukázať skutočný priebeh: mobilný doklad → otázka iba pri nejasnosti → skontrolované účtovníctvo → dohľadateľný výkaz. Použiť označené demo, neskôr pravdivú prípadovú štúdiu so súhlasom klienta.
4. Najprv zakladateľom vedené rozhovory, odporúčania a partnerstvá. Platené kampane rozširovať podľa aktivácie, kvality a kapacity; neurčovať rozpočet alebo CAC bez dát.
5. Konverzia znamená firmu s úspešným nastavením a prvým spracovaným mesiacom, nie iba vyplnený formulár. Verejné porovnanie konkurenta má uvádzať dátum a presný rozsah; vyhnúť sa tvrdeniam o jeho údajnej nespoľahlivosti.

### Meranie kvality služby

Všetky prahy nižšie sú **návrhy akceptácie**, nie existujúce výsledky. Začať meraním v pilote a zohľadniť jeho malú vzorku. Samotný počet softvérových testov nepreukazuje daňovú správnosť služby.

| Metrika | Presná definícia / spôsob merania | Navrhovaná podmienka spustenia |
|---|---|---|
| Správnosť účtovania | Vzorka nezávisle overených dokladov; oddeliť nesprávnu sumu, účet, dátum a režim DPH. Menovateľom sú skontrolované prípady, nie všetky importy. | Žiadna nevyriešená závažná chyba v referenčnej sade; chybovosť a rozsah vzorky zdokumentované. |
| Úplnosť banky | Počet a suma pohybov proti výpisu; rozdiel zostatku banky a knihy s vysvetlením každej nezúčtovanej položky. | Žiadna nevysvetlená strata alebo dvojité zaúčtovanie. |
| Spoľahlivosť podania | Povinnosti splatné v období proti podaniam s úradným potvrdením, vrátane opráv a výpadkov. | Každá splatná pilotná povinnosť má prijatie alebo zdokumentovanú eskaláciu a riešenie. |
| Čas klienta | Aktívne minúty od dodania podkladu po vyriešenie vrátane správ a schvaľovania; rovnaké scenáre pre oba produkty. | Namerané hodnoty medián/p90 a úspešnosť; úsporu publikovať až po porovnaní. |
| Čas spracovania | Od prvého prijatia po odborné dokončenie; čas čakania na klienta evidovať samostatne. | Stabilný front v dostupnej kapacite; bez skrytých prestarnutých prípadov. |
| Manuálne zásahy | Počet zmien návrhu odborníkom a počet otázok klientovi na doklad/prípad, podľa typu. | Neznižovať zásahy na úkor správnosti; poznať príčiny, nie iba súhrnný podiel automatizácie. |
| Duplicity a opakovania | Opakovaný webhook/import, prerušenie po odoslaní, duplicitná fotka; sledovať nesprávne zlúčenia aj dvojité položky. | Regresné prípady bez straty originálu, dvojitého dokladu alebo opakovaného podania. |
| Odborná pomoc | Čas prvej vecnej odpovede a vyriešenia, percentily a nevybavené eskalácie. Automatické potvrdenie sa nepočíta ako vecná odpoveď. | Overiť, že tím zvládne sľub odpovede do pracovného dňa [F11] aj pri neprítomnosti. |
| Obnova a prenositeľnosť | Obnoviť izolovanú kópiu DB/súborov; iný účtovník prevezme export a odsúhlasí zostatky a evidencie. | Skutočne vykonaná obnova aj prevzatie, zaznamenané RPO/RTO a nedostatky. |
| Spokojnosť a aktivácia | Krátka otázka po prvom dokončenom mesiaci a po riešení problému; poznať dôvod odchodu. | Uvádzať počet odpovedí; nahrádzať dojmy konkrétnymi problémami a opravami. |

## Zdroje a hranice overenia

Verejné zdroje boli čítané 15. 10. 2026. VOP konkurenta uvádzajú verziu 1.0 – 20260303. Webové tvrdenia o bezchybnosti, bezpečnosti či počte zákazníkov sme neprezentovali ako nezávisle overenú prevádzkovú skutočnosť. Instagram a Facebook odkázané z webu sa v použitom readeri nenačítali; ich obsah, dosah, platená reklama a rozpočet neboli overené. LinkedIn relatívne dátumy nie sú presným harmonogramom budúcich kampaní.

### Konkurent

- **B1:** [Domov a verejný pracovný postup](https://bezuctovnika.sk/).
- **B2:** [Funkcie](https://bezuctovnika.sk/funkcie/).
- **B3:** [FAQ: odborná pomoc, schvaľovanie, GovBox Pro a vlastné podanie](https://bezuctovnika.sk/faq/).
- **B4:** [Cenník](https://bezuctovnika.sk/cennik/). Získaný text obsahuje aj označenie „Už čoskoro“ medzi balíkmi; jeho vizuálne priradenie a aktuálnu objednateľnosť treba overiť, nevyvodzujeme nedostupnosť konkrétnej funkcie.
- **B5:** [Obchodné podmienky, najmä čl. 7 a 9.7–9.9](https://bezuctovnika.sk/obchodne-podmienky/).
- **B6:** [Blog s článkami zo septembra a októbra 2026](https://bezuctovnika.sk/blog/) a [článok o eFaktúre z 31. 8. 2026](https://bezuctovnika.sk/blog/e-faktura-ako-sa-na-nu-pripravit/).
- **B7:** [Filip Benčo: nábor prvého marketéra a vlastné tvrdenie o platiacich zákazníkoch](https://www.linkedin.com/posts/filip-benco_h%C4%BEad%C3%A1me-prv%C3%A9ho-market%C3%A9ra-pre-bezuctovnikask-activity-7495798041917054976-07ij). Počet nebol nezávisle doložený.
- **B8:** [Firemný LinkedIn: príprava eFaktúry cez externého poskytovateľa a existujúce balíky](https://www.linkedin.com/company/bezuctovnika/). Príspevok bol pri čítaní označený „1w“; ide o plán, nie potvrdený produkčný výsledok.
- **B9:** [O nás: ľudia a deklarovaný odborný dohľad pri vývoji](https://bezuctovnika.sk/o-nas/).

### Právne a technické primárne zdroje

- **L1:** [Zákon 431/2002 Z. z., časová verzia 1. 6.–31. 12. 2026, § 5](https://static.slov-lex.sk/static/SK/ZZ/2002/431/20260601.html).
- **E1:** [FS: manuál povinnej eFakturácie od 1. 1. 2027, 26. 8. 2026](https://www.financnasprava.sk/_img/pfsedit/Dokumenty_PFS/Podnikatelia/Dan_z_pridanej_hodnoty/efaktura/2026/2026.08.26_manual_efakturacia.pdf).
- **E2:** [FS: 1/DPH/2026/I, novela 385/2025, účinnosť 2027 a 2030](https://www.financnasprava.sk/_img/pfsedit/Dokumenty_PFS/Zverejnovanie_dok/Dane/Novinky_leg/Nepriame_dane/2026/2026.01.14_001_DPH_2026_I.pdf).
- **E3:** [FS: eFaktúra, zoznamy, výber poskytovateľa a implementačné materiály](https://www.financnasprava.sk/sk/podnikatelia/dane/dan-z-pridanej-hodnoty/e-faktura), vrátane [transpozícií v1.12 z 14. 10. 2026](https://www.financnasprava.sk/_img/pfsedit/Dokumenty_PFS/Podnikatelia/Dan_z_pridanej_hodnoty/efaktura/2026/2026.10.14_Peppol_Bis3_v1_12.xlsx). XLSX nebol obsahovo načítaný ani vykonaný.
- **E4:** [OpenPeppol: BIS Billing 3.0, May 2026 Release, syntax, pravidlá a Schematron](https://docs.peppol.eu/poacc/billing/3.0/).
- **E5:** [Projektový tím eFaktúry: sprievodca pre vývojárov](https://www.info-efaktura.sk/vyvojari), odkazovaný z portálu FS. Ide o informatívnu projektovú stránku, nie náhradu záväzného práva.
- **E6:** [SAPI-SK: rozhranie a oddelenie technického prístupu od právneho mandátu](https://www.sapi-sk.sk/).
- **E7:** [Enable Banking: oficiálna API dokumentácia, AIS, registrácia a sandbox/produkcia](https://enablebanking.com/docs/api/reference/).
- **E8:** [Fio: oficiálna API dokumentácia](https://www.fio.cz/docs/cz/API_Bankovnictvi.pdf).
- **E9:** [FS: certifikovaní poskytovatelia, zoznam z 9. 10. 2026](https://www.financnasprava.sk/_img/pfsedit/Dokumenty_PFS/Podnikatelia/Dan_z_pridanej_hodnoty/efaktura/2026/2026.10.09_zoznam_cert.pdf).
- **E10:** [FS: poskytovatelia v procese akreditácie, 9. 10. 2026](https://www.financnasprava.sk/_img/pfsedit/Dokumenty_PFS/Podnikatelia/Dan_z_pridanej_hodnoty/efaktura/2026/2026.10.09_zoznam_cert_akred.pdf).
- **P1:** [eFaktura.sk: vlastná dokumentácia API a integračných možností](https://efaktura.sk/api-rest). Produktové tvrdenia poskytovateľa; ich prevádzka nebola testovaná.
- **P2:** [ePošťák: vlastná dokumentácia integračných možností](https://epostak.sk/api-integracia). Produktové tvrdenia poskytovateľa; ich prevádzka nebola testovaná.

### Overené časti projektu Firmony

Odkazy sú voči tejto vetve. Sú dôkazom implementácie, nie nasadenia, kvalifikácie personálu alebo právnej certifikácie.

- **F1:** [Tímové postupy](../src/team/routes.tsx), [oprávnenia a klienti](../src/team/store.ts), [model firmy a správy](../src/app/store.ts), [onboarding/zmluva](../src/order.ts).
- **F2:** [Enable Banking](../src/app/bank.ts), [Fio](../src/app/fio.ts), [bankové výpisy](../src/app/statements.ts), [import a párovanie](../src/app/store.ts).
- **F3:** [Knihy](../src/app/ledger.ts), [DPH a výkazy](../src/app/vat.ts), [SV](../src/app/vat-summary.ts), [uložené podania](../src/app/vat-store.ts), [závierka](../src/app/closing-store.ts), [tímové označenie podania](../src/team/routes.tsx).
- **F4:** [Generátor a model faktúry](../src/app/invoices.ts), [parser XML](../src/app/xml.ts), [spracovanie prijatých súborov](../src/app/intake.ts).
- **F5:** [Výpočty miezd](../src/app/payroll.ts), [uzavreté mzdy](../src/app/payroll-store.ts), [DPH](../src/app/vat.ts), [účtovné knihy](../src/app/ledger.ts), [výslovné výluky v projektových poznámkach](../CLAUDE.md).
- **F6:** [Návrh zmluvných podmienok](../src/content/terms.ts).
- **F7:** [Čítanie dokladov](../src/app/read.ts), [príjem](../src/app/intake.ts), [účtovné kategórie a pravidlá](../src/app/booking.ts), [párovanie](../src/app/match.ts).
- **F8:** [Export](../src/app/export.ts), [úplné podklady a história](../src/app/handover-data.ts), [potvrdenie prevzatia](../src/app/handover-store.ts), [riadené vymazanie](../src/app/purge.ts).
- **F9:** [Prihlásenie](../src/app/session.ts), [HTTP ochrany](../src/index.tsx), [tímové oprávnenia](../src/team/store.ts), [schéma uložených poverení](../src/db.ts).
- **F10:** [Klientské stránky](../src/views/inside-pages.tsx), [web](../src/views/home.tsx), [mobilné správanie](../public/inside.js), [runtime kontroly](../test/e2e.workerd.mjs), [prehliadačové kontroly](../test/visual.mjs).
- **F11:** [Existujúce ceny, plánované odmeny a sľub odpovede](../src/config.ts). Komentáre o nákladových predpokladoch nie sú overenou ekonomikou podnikania.
- **F12:** [Zámky a história](../src/app/period-store.ts), [databázové ochrany](../src/app/period-schema.ts), [validácia a pripravenosť](../src/app/periods.ts), [runtime scenáre](../test/periods.runtime.mjs).
