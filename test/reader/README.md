# Meranie čítačky

Tridsať pôvodných syntetických dokladov vytvára `scripts/reader/make-documents.py`. Všetky spoločnosti, čísla a kódy sú testovacie. Očakávané polia sú v `expected.json`, referenčné kategórie a ich dôvody v `categories.json`. Označenia boli určené z položiek generátora a uvedeného modelového scenára pred spustením modelu.

Každý z 30 dokladov má kategóriu. Generátor ju pri ďalšom vytvorení sady zachová. Harness kontroluje povolené hodnoty a zhodu s mapou pred volaním API; prázdny výber nezobrazí falošný úspech. Kategória je súčasťou tabuľky presnosti aj počtu dokumentov so všetkými porovnávanými poľami správne. Existujúci limit 98 % pre sumu, DPH, deň vystavenia a IČO sa nemení a kategória sa vykazuje osobitne.

## Čo znamená správna kategória

Referenčné označenie je zaradenie do existujúcej taxonómie aplikácie v konkrétnom testovacom scenári. Doklad často neobsahuje účel výdavku, účastníkov obeda, služobnú cestu, zámer ďalšieho predaja alebo účtovnú politiku majetku. Takéto prípady sú označené `contextDependent: true`; dôvod je pri každom súbore. Model túto vysvetľujúcu mapu pri čítaní nedostáva. Jeho nesúhlas s ňou sa preto nemá vydávať za preukázanú účtovnú chybu.

Výstup uvádza celú zhodu kategórií aj osobitnú zhodu pri scenároch nezávislých od takéhoto doplňujúceho účelu. Zmiešaný bloček má jednu referenčnú kategóriu; meranie nepredstiera správne rozúčtovanie každého jeho riadka. Správna kategória sama osebe nepreukazuje daňovú uznateľnosť ani nárok na odpočet. Odborná kontrola zostáva potrebná.

## Spustenie a dôkaz

Workflow Reader používa už existujúci repozitárový secret; hodnotu netreba čítať ani zadávať do chatu. Zachované je ručné spustenie v Actions. Pridané je úzko obmedzené spustenie pri zmene testov alebo samotnej čítačky vo vetve `codex/reader-categories`, aby bolo možné vykonať zadaný beh aj cez konektor, ktorý nemá dispatch operáciu. Zmena samotného CLAUDE.md beh znovu nevyvolá.

Kompletný malý syntetický report sa uloží do `.wrangler/reader/report.json` a aj do logu za značkou `READER_REPORT_JSON`, s modelom, časom a odtlačkom očakávanej sady. Upload ZIP archívu môže zlyhať pre existujúcu kvótu GitHub; taký výpadok neprebíja výsledok čítačky. Chyba merania a nedosiahnutie pôvodného limitu naďalej spôsobia neúspešný krok.

Výsledok 30 modelových dokladov nie je dôkaz presnosti na populácii skutočných klientskych dokladov. Pri ďalšom ladení zachovať aj nezávislú kontrolnú sadu a nemeniť referenčné kategórie len preto, aby súhlasili s odpoveďou modelu.
