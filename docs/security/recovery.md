# Obnova D1/R2 a prevádzkový dôkaz

## Vykonávaná lokálna skúška

`npm run test:runtime` zahŕňa `test/restore.runtime.mjs`. Syntetická aplikácia počas snímky neprijíma súbežné zápisy. Zachytí všetky aplikačné tabuľky a schému, indexy, triggery, všetky dostupné R2 objekty, ich bajty a HTTP/vlastné metadáta. Test zámerne používa viac strán listovania. Manifest kontroluje tabuľky, schému a každý súbor; chýbajúce alebo poškodené objekty aj poškodené SQL dáta odmietne.

Obnova prebehne do iného prázdneho D1 a R2 v reálnom Workers prostredí, so zapnutou kontrolou cudzích kľúčov a následným obnovením triggerov. Overí sa zhoda každej aplikačnej tabuľky, súborov a metadát, zmluvných snapshotov, zachovanie aktívneho uchovania a jeho účinnosti pri mazaní. Potom sa zrušia staré relácie, e-mailové odkazy, výzvy a nepoužité aktivačné/obnovovacie kódy. Čakajúce e-maily sa v izolovanej skúške nedoručujú a odstránia; registrované verejné kľúče a spotrebovaný bootstrap zostanú. Starý prehliadač je skutočnou aplikáciou odmietnutý.

Toto je opakovateľný dôkaz logiky **lokálnej obnovy**, nie zavedená produkčná záloha. Manifest/hash bez nezávisle uloženého dôveryhodného koreňa nedokazuje pôvod dát. Snímka bez pozastavenia zápisov nepredstavuje konzistentný stav D1 aj R2. Test nič nezálohuje do GitHubu a neobsahuje skutočné klientské dáta.

## Čo treba zriadiť pred produkciou

| Oblasť | Potrebný výsledok, ktorý zatiaľ nie je doložený |
|---|---|
| Zodpovedné osoby | Menovitý vedúci obnovy, zástupca, schvaľovateľ, bezpečný prístup nezávislý od jedného zariadenia a jedného kompromitovaného účtu. |
| Skutočné zdroje | Overené ID databázy a bucketu, jurisdikcia, zmluvy, plány, prístupové roly a nastavenie histórie D1; náhradné hodnoty konfigurácie nie sú dôkaz. |
| Kopírovanie R2 | Nezávislá chránená kópia originálov, metadát a manifestov; preveriť obnovu aj po zmazaní a strate hlavného účtu. D1 Time Travel nevráti súbor z R2. |
| Konzistencia | Schválený bod obnovy a postup pozastavenia príjmu, cronu, uploadov a externých zmien počas konzistentnej snímky/obnovy. Zaznamenať rozpracované operácie. |
| Tajomstvá a konfigurácia | Obnoviteľné bezpečné uloženie konfigurácie, kľúčov a oprávnení mimo GitHubu; zdokumentované rotácie a odpojenie poskytovateľov pri podozrení na kompromitáciu. |
| Izolovaný cieľ | Samostatná databáza/bucket, vypnuté živé odosielanie, banky, podania a cron. Overenie cieľových ID dvoma osobami pred importom. |
| Retencia a uchovanie | Súlad retenčných dôvodov, aktívnych prípadov a chránených kópií. Obnova nesmie vrátiť vymazané osobné údaje do prevádzky bez nového vyhodnotenia oprávnenosti. |
| Časy a objemy | Namerený produkčne reprezentatívny RPO/RTO, objem, obnova posledného platného bodu aj staršej kópie, reálni kontrolóri a podpísaný protokol. Cieľ SLA sa nesmie vymyslieť z lokálneho behu. |

## Postup skutočného nácviku

1. Vedúci určí rozsah, bod obnovy, dôvod, vlastníka dotknutých termínov a izolovaný cieľ. Uloží ID/časy zdrojov a nezávislé hash/manifest dôkazy. Živé systémy sa týmto dokumentom automaticky nemenia.
2. Zastaví alebo izoluje zápisy a externé vedľajšie účinky podľa odsúhlaseného postupu. Zdroj zachová; neobnovuje skúšku cez produkciu. Time Travel prepisuje databázu na mieste, preto jeho produkčné použitie vyžaduje konkrétny plán návratu a rozhodnutie zodpovednej osoby.
3. Obnoví konzistentné SQL aj zodpovedajúce originály do čistého cieľa. Skontroluje migrácie, foreign keys, počty, SHA-256, všetky referencie na súbory a samostatné potvrdenia podaní. Chýbajúci súbor znamená nevydarenú obnovu, nie kompletný archív.
4. Pred pripojením aplikácie zruší relácie, e-mailové odkazy, rozpracované výzvy a nepoužité kódy; preskúma otvorené objednávkové odkazy a opätovné použitie starých oprávnení. Zachová registrované kľúče a dôkazy spotrebovania úvodnej aktivácie. Nepošle starý e-mailový front bez kontroly.
5. Preverí roly, členstvá, ukončené prístupy, obnovené holdy a súlad s neskoršími právnymi výmazmi. Overí účtovníctvo na nezávislej vzorke, export a originály, zmluvy, stav banky a skutočný stav podaní u poskytovateľov. Starý lokálny stav sa nesmie považovať za nový bankový či úradný fakt.
6. Zaznamená začiatok, koniec, bod obnovy, stratu dát, zistené rozdiely, kontrolórov a neúspešné kroky. Až platný protokol a schválené nápravné úlohy môžu byť podkladom brány G4/operations. Prepnutie produkcie a oznámenia vyžadujú riadené prevádzkové rozhodnutie.

Primárne postupy: [D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/), [D1 import/export](https://developers.cloudflare.com/d1/best-practices/import-export-data/). Použiť aktuálne príkazy podľa reálneho účtu a plánu; táto zmena nevykonáva žiadnu vzdialenú obnovu.
