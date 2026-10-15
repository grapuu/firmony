# Incident a uchovanie dôkazov

Register `/ucto/incidenty` je interný. Správca vidí prípady; účtovník iba svoju firmu alebo prípad, v ktorom je vlastníkom/zástupcom. Klient interný register nevidí. Obsahuje stručný opis, naliehavosť, referenciu podkladov, menovité osoby, kontrolný dátum a databázovú históriu. Citlivé dokumenty a právne stanoviská ukladať do riadeného spisu; do referencie nepatria ich celé texty.

Pri podozrení na chybu, nároku, blížiacej sa lehote alebo incidente založiť prípad ihneď, určiť vlastníka a iného zástupcu. Ak zatiaľ chýba zástupca, prípad sa aj tak dá otvoriť a zastaviť výmaz; chýbajúci zástupca zostane viditeľný. Právny/odborný vlastník musí určiť ďalší postup, oznamovacie povinnosti a potrebný rozsah uchovania. Systém sám neurčuje oprávnenosť nároku ani neposiela správy klientovi, úradu či poisťovni.

## Čo je chránené

Otvorený prípad alebo aktívne uchovanie blokuje bežný retenčný výmaz účtovníctva aj konečný výmaz zmluvných/AML záznamov. Databázové triggery chránia relevantné zdrojové tabuľky, firmu a históriu pred DELETE; plánovač a mazanie R2 to kontrolujú aj pred každou ďalšou dávkou súborov. Uchovanie sa týka dát konkrétnej firmy, nepredlžuje automaticky práva ďalších osôb na prístup.

Tieto ochrany **nepredstavujú nezávislý nemenný archív**: nebránia všetkým bežným úpravám účtovných dát a neodolajú privilegovanému správcovi infraštruktúry, ktorý zmení schému či priamo úložisko. Pri udalosti vytvoriť a overiť samostatný chránený dôkazový balík podľa právneho posúdenia (originály, stav kníh/podaní, potvrdenia, udalosti, platný kontrakt, manifest a externý doklad času/úschovy). Jeho automatické nezávislé uloženie tento balík ešte nedodáva.

## Súbeh s mazaním

Po potvrdení kompletného aktuálneho odovzdania a uplynutí štandardného okna plánovač najprv zmrazí účtovné zápisy. Najmenej **24 hodín** nezačne nevratnú fázu. Nejde o skrátenie klientovej existujúcej lehoty; reálny výmaz môže nastať neskôr. Pri aktívnom prípade sa nespustí. Samotné zamrznutie bez deštruktívneho nároku ešte umožní úplné uchovanie.

| Stav pri otvorení prípadu | Význam |
|---|---|
| Uchovanie aktívne | Databáza ešte nepridelila deštruktívnu fázu. Prípad a uchovanie vznikli atomicky. |
| Uchované zostávajúce zmluvné záznamy | Bežné účtovníctvo už bolo vymazané, konečný retenčný výmaz ešte nezačal. Nejde o návrat všetkých dokladov. |
| Mazanie už začalo – preveriť obnovu | Deštruktívna fáza bola pridelená skôr. Niektoré súbory už môžu chýbať; otvorený prípad zastaví ďalšie zastaviteľné kroky a uchová zostávajúce SQL dáta. |

D1 a R2 netvoria jednu spoločnú transakciu. Už odoslanú požiadavku na zmazanie súborov nemožno spoľahlivo vziať späť. Preto tretí stav nikdy neoznačíme ako bezpečné úplné uchovanie. Testy vkladajú incident medzi listovanie a mazanie R2 aj po uskutočnení prvej dávky. Prevádzkovateľ musí bezodkladne preveriť rozsah straty a možnosti obnovy. Pri prechode zo staršej verzie sa už rozbehnutý výmaz označí konzervatívne ako začatá deštruktívna fáza.

## Kontrola a uvoľnenie

Kontrolu plánovať najneskôr o 30 dní; prekročenie termínu ochranu automaticky neruší. Vlastník/zástupca alebo príslušný odborník posúdi potrebu ďalšieho uchovania a uloží referenciu. Nová kontrola zruší starú čakajúcu žiadosť o uvoľnenie, aby sa nezávislý súhlas nevzťahoval na zastarané rozhodnutie. Správca môže zmeniť pridelenie s kontrolou verzie; súbežné rozhodnutie sa neprepíše potichu.

Uvoľnenie vyžaduje referenciu odborného posúdenia a schválenie iným aktuálnym správcom, oboch po čerstvom overení. Zostane otvorený prípad, ktorý výmaz stále blokuje. Až samostatné uzavretie iným správcom než zakladateľom prípadu túto blokáciu odstráni, ak nezostáva iný aktívny prípad/uchovanie. História pretrvá bežný výmaz účtovníctva; konečný oprávnený výmaz firmy po ukončení všetkých dôvodov uchovania odstráni aj uzavretý spis. Všeobecnú lehotu zmluvného modelu nenahrádza individuálne právne posúdenie.
