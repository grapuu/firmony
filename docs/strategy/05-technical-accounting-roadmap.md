# Technical & Accounting Roadmap

Priorita správnosti pred šírkou. P1–P10 označujú [karty návrhov](09-top-10-priorities.md). Implementácia vo vetve nemení produkciu. Opravy PR #4 sa znovu nestavajú.

## Rozdelenie rozhodovania

| Vrstva | Smie robiť | Musí odovzdať vyššie | Dôkaz |
|---|---|---|---|
| Deterministické pravidlá | Formát, aritmetika, saldo, duplicita identifikátora, obdobie, sadzby podľa účinnosti, práva, zámky | Nejednoznačný režim, rozpor dát, nepodporovaný rok | Verzia pravidla, vstupy, výsledok, regresná vzorka |
| AI návrh | Vyťažiť text, navrhnúť kategóriu, vysvetliť otázku | Chýbajúci údaj, konflikt originálu a výstupu, neznámy scenár | Originál, model/verzia, návrh a následná oprava; nespoliehať sa na sebahodnotenie modelu |
| Účtovník | Odborné posúdenie podstaty, kontrola, zaúčtovanie v kvalifikovanom rozsahu | Rizikové/nové režimy, nejasné právo, konflikt záujmov | Kto, kedy, čo skontroloval a prečo rozhodol |
| Metodik / oprávnený špecialista | Nový režim, závažná oprava, odborná eskalácia | Právna/daňovoporadenská vec mimo kompetencie | Metodické stanovisko, nezávislý očakávaný výsledok |
| Klient | Hospodárska podstata, pravdivosť, vlastné rozhodnutia, potrebná autorizácia | Neistota sa vráti odborníkovi | Jasná otázka, potvrdenie a čas; klient neschvaľuje nepochopenú účtovnú rutinu |

Presnosť vyťaženia merať po poliach na reprezentatívnej vzorke, vrátane nečitateľných dokladov a dobropisov. Prahy automatického prijatia kalibrovať na následky chyby a nezávislé dáta; nevymyslieť percento z „confidence“ textu. V počiatočnej službe ostáva kontrola človekom podľa súčasných podmienok. Jej odstránenie vyžaduje zmenu metodiky, dôkazy a zmluvné posúdenie.

## Konkrétne pracovné balíky

| Balík | Implementácia / závislosť | Akceptácia |
|---|---|---|
| P1 Bezpečnosť a obnova | Silnejšia autentifikácia tímu; revízia prístupov, tajomstiev, exportov a dodávateľov; záloha D1/R2 a runbook | Útok medzi firmami odmietnutý; expirovaný prístup nefunguje; obnova do čistého prostredia s overením manifestu a väzieb |
| P2 Odborné riadenie | Vlastník + zástupca, schvaľovací zoznam, typ výnimky, odborné vyriešenie oddelene od odpovede | Neprítomnosť nenechá termín bez vlastníka; história rozhodnutí; štvoroká kontrola rizikových prípadov |
| P3 Banka | Aktivovať partnera, overiť konkrétne banky/účty, kontinuitu a alarmy; cenová ponuka od dodávateľa | Expirácia, výpadok, stránkovanie, opakovanie, chýbajúci deň, spätné účtovanie a zámok; zostatok sedí s bankou |
| P4 eFaktúra | Adaptér poskytovateľa, validátor, identifikácia klienta, udalosti a archív | Celý príjem aj odoslanie podľa rozsahu, žiadne dvojité zaúčtovanie, export pôvodného XML |
| P5 Prevzatie | Register podkladov, odsúhlasenie zostatkov/saldokonta/DPH a rozdelenie podaní | Kontrolný protokol bez nevysvetleného rozdielu; skúška reálnej migrácie, nie iba upload |
| P7 Podania | Zaznamenať externé ID, prijatie/odmietnutie, presný obsah a splnomocnenie | XML prejde lokálnymi kontrolami aj autorizovaným portálovým procesom; odmietnutie vyvolá úlohu |
| P8/P9 Prevádzkové dáta | Úkony a trvania bez citlivého obsahu; priradiť opravy pôvodnej práci | Vie sa zostaviť cena obsluhy aj čas klienta; výpadok merania sa nezmení na nulu |
| P10 Odchod | Dokončiť reálnu skúšku prevzatia exportu a právne nastavenie uchovania | Iný účtovník otvorí celý balík; potvrdenie nesmie platiť na novšiu revíziu dát |

## eFaktúra 2027: rozsah, ktorý treba postaviť

Podľa FS2/FS3 od **1. 1. 2027** vznikajú povinnosti pri zákonom určených tuzemských B2B/B2G transakciách. Tuzemskí platitelia DPH majú v príslušnom rozsahu vystavovať štruktúrované faktúry a používať doručovaciu službu; prijímanie sa týka aj relevantných neplatiteľov. B2C a zahraničie nemožno bez posúdenia zahrnúť pod rovnaké pravidlo. Metodik musí každému klientovi priradiť presný rozsah a výnimky. Štruktúrovaný XML súbor v aktuálnom kóde ešte túto službu nesplní.

Rozhodnutie o poskytovateľovi: overiť FS4 znovu v deň výberu, napr. eFaktura s. r. o. (EFSK000028), Kaja Solutions (EFSK000012), Ionite B.V. (EFSK000003). Rozlíšiť certifikovaného poskytovateľa od sprostredkovateľa a žiadateľa. Firmony sa nevydáva za certifikovaného poštára. T4/T5 sú verejné integračné podklady, nie uzavretá zmluva. Výber podľa testov, SLA, zodpovednosti za oznamovanie, údajového spracúvania, exportu a ceny z reálnej ponuky; bez fiktívnych nákladov.

1. **Registrácia:** právna identita firmy, oprávnenie konateľa, mandát a overený identifikátor účastníka podľa poskytovateľa. Uložiť stav a platnosť registrácie; chybná firma nesmie byť naviazaná na cudziu schránku. Bankový súhlas nie je tento mandát.
2. **Vytvorenie/príjem:** originálne UBL Invoice/CreditNote a technické ID oddeliť od zobrazeného PDF. Obmedziť veľkosť a zložitosť XML, vypnúť externé entity a preveriť prílohy. Registrácia príjmu neznamená automatický súhlas s daňovým režimom.
3. **Validácia:** XSD UBL 2.1, EN 16931, Peppol BIS a platné SK pravidlá s verziou. FS5 v1.12 je najnovší overený odkaz v deň auditu; obsah XLSX nebol tu overený. Jeho transpozíciu a konkrétne testy musí ešte potvrdiť integračný balík. Pinovať pravidlá a dátumy účinnosti; spätné validácie nesmú potichu prepísať históriu.
4. **Odoslanie:** jedinečný idempotency key viazaný na firmu a nemennú verziu dokumentu, lokálny transactional outbox; pri timeoute najprv zistiť výsledok existujúceho pokusu. Nová oprava nie je retransmisia pôvodného dokladu.
5. **Udalosti:** overený podpis webhooku, ochrana opakovania, deduplikácia ID a tenant väzby. Uložiť aj udalosti mimo poradia; odvodiť stav podľa pravidiel, nie podľa posledného HTTP požiadavku. `accepted_by_provider`, `delivered`, obchodná reakcia, príslušné oznamovanie a `booked` sú rôzne fakty.
6. **Príjem a účtovanie:** trvalo uložiť originál pred potvrdením prevzatia. Poskytovateľské ID + hash + identita/číslo dodávateľa vytvárajú vrstvy detekcie duplicít; odlišný obsah s rovnakým číslom je výnimka. Pripraviť návrh existujúcemu účtovnému workflow, zámky platia aj tu.
7. **Chyba:** retriable sieťová chyba vs trvalá validácia vs nesúlad identity; backoff, hranica pokusov a front pre odborníka. Alarm má vlastníka a náhradníka. Poskytovateľský incident nesmie automaticky označiť faktúru za doručenú.
8. **Archív a odchod:** pôvodné XML, prílohy, validačná verzia a výsledok, odoslaný obsah, doručenky a história. Lehoty uchovania určiť podľa druhu záznamu a práva; pre relevantné účtovné doklady posúdiť desaťročné uchovanie. Obnova a export musia zachovať preukázateľnosť, nie len čitateľný náhľad.

Pred produkciou otestovať vypnutý webhook, dvojitú udalosť, obrátené poradie, neplatný podpis, cudzie tenant ID, výpadok medzi R2 a D1, opakované odoslanie po timeoute, dobropis, zmenu registrácie a výstupný export. SAPI-SK (T3) môže znížiť prácu adaptéra, ale nezaručuje právnu ani dátovú zameniteľnosť partnerov.

## Matica slovenských účtovných scenárov

„T“ nižšie označuje existujúcu automatizovanú regresiu užšieho jadra. Každý scenár potrebuje nezávislý očakávaný výsledok od metodika, referenciu právnej účinnosti, kontrolóra a dôkaz; nie všetky scenáre sú podporované v pilote.

| Scenár | Očakávané bezpečné správanie | Dnešný dôkaz / ďalší test |
|---|---|---|
| Tuzemská EUR faktúra, neplatiteľ | Správny záväzok/náklad a úhrada | T; odborný príklad a celý mesiac |
| Tuzemská faktúra, platiteľ | Základy/sadzby a nárok posúdené oddelene | T DPH; metodik a portál |
| Zmiešané sadzby, zaokrúhlenie | Súčty dokladu a výkazu bez skrytého rozdielu | T; nezávislé hraničné doklady |
| Reprezentácia / súkromný výdavok | Návrh bez neoprávneného automatického odpočtu | T kategórie; podstata od klienta |
| Faktúra v cudzej mene | Nezaúčtovať nepreverený kurz/režim | Čiastočné; plné FX mimo základného pilotu |
| EÚ služba § 7a | Správny mesiac a príslušné podanie | T jadra; úplný metodický prípad |
| EÚ tovar/reverse charge | Rozlíšiť tovar, službu a účastníka | T niektorých kategórií; druhá kontrola |
| Zmena štvrťročného SV na mesačný | Nezdvojiť už podané obdobie | T PR #3 vrátane opráv; portálové potvrdenie |
| Prechod registrácie DPH | Účinný dátum a nárok podľa režimu | T čiastkových pravidiel; migrácia/metodik |
| Záloha a vyúčtovanie | Žiadne dvojité výnosy či daň | Úplný tok neoverený; nepokryté prípady eskalovať |
| Dobropis pred/po podaní | Väzba na originál, správne obdobie/opravný postup | T jadra; reálny viacobdobný príklad |
| Duplicitný sken/eFaktúra | Identická vec nevytvorí dva záväzky | T hash/eKasa; sémantická duplicita a nový transport |
| Čiastočná/hromadná platba | Nejednoznačné väzby nejdú potichu do knihy | T základného párovania; odborná rozšírená vzorka |
| Bankový poplatok / vlastný prevod | Žiadna zbytočná žiadosť o faktúru | T pravidiel; nesprávne rozpoznanie eskalovať |
| Medzera a opakovanie bankového feedu | Deduplikácia, viditeľná medzera | T náhradných služieb; živý účet |
| Neskorý doklad po zámku | Originál prijať, knihu nemení bez riadeného otvorenia | T PR #4 |
| Zmena po podaní | Zachovať pôvodné XML/históriu a indikovať opravu | T PR #2/#3; metodik rozhodne postup |
| Majetok a odpisy | Odborný register, účtovný aj daňový plán | Modul CHÝBA; mimo základného pilotu |
| Firemné auto / lízing / zmiešané použitie | Osobitné posúdenie nákladov, DPH a dane | Kompletný tok N; neprijímať automaticky |
| Dividendy / pôžička spoločníka | Rozlíšiť právny titul, zrážky a vlastné imanie | Generický zápis nestačí; metodická brána |
| Jednoduchá pracovná mzda | Výpočet podľa roka, uložený nemenný výsledok | T 2026/2027; nezávislé porovnanie a výkazy |
| Dohody, odmena konateľa, PN, exekúcia | Odmietnuť nepodporovaný automatický výpočet | Rozšírenie CHÝBA; externý odborný postup alebo výluka |
| OSS/IOSS, dovoz, sklad | Nesmie sa tváriť ako tuzemská rutina | Mimo základného pilotu |
| Závierka, strata, minimálna daň | Prepočet, kontrola, presný export a oprava | T mikro/DPPO; rozsah a portál N |
| Prevzatie uprostred roka | Pokryté zostatky, saldokonto, podania a vlastník období | Manuálne časti; skúška migrácie |
| Odchod a obnova | Kompletné knihy aj originály, potvrdenie správnej revízie | T exportu; nezávislé otvorenie a restore drill |

Každý nový účet alebo scenár môže zmeniť závierku, DPH, párovanie, export aj zámky. Definition of Done preto zahŕňa celý dopad, opravu pôvodne podaného prípadu, prístupové testy a históriu; zelený izolovaný výpočet nestačí.
