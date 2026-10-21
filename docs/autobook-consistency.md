# Automatické účtovanie pri súbežných zmenách

Oprava z 21. októbra 2026, vetva `codex/autobook-atomic`. Schéma zostáva 77, ďalší nový krok je 78.

## Konkrétna chyba

Automatické účtovanie preverovalo doklad, pravidlo dodávateľa, bankovú úhradu a nastavenia firmy pred zápisom.
Pôvodný zápis kontroloval iba časť týchto údajov. Zmena DPH, úhrady, pravidla alebo vypnutie automatiky medzi
overením a zápisom preto mohli viesť k zaúčtovaniu podľa zastaraných podkladov. Podobne sa mohli použiť staršie
nastavenia firmy pri ďalšom doklade v tom istom spracovaní.

Pri dvoch spracovaniach v rovnakej sekunde síce druhý zápis doklad znova nezaúčtoval, ale mohol pridať ďalšiu
udalosť `document.autobooked`. Samotná zhoda sekundy a autora na preukázanie vlastného zápisu nestačila.

Pôvodné správanie bolo reprodukované v izolovanom workerd s D1: 12 z prvých 15 regresných kontrol zlyhalo.
Testy používajú iba syntetické firmy a riadia okamih súbežnej zmeny; neupravujú produkčné údaje.

## Výsledné správanie

1. Doklad a existujúca revízia údajov firmy sa čítajú jednou požiadavkou a v rovnakom databázovom snímku.
   Až potom sa preverujú ďalšie podklady. Pri novej revízii sa znova načítajú nastavenia firmy aj podané priznania.
2. Zápis overí tú istú revíziu priamo v SQL. Súčasne vyžaduje aktuálne zapnutú automatiku a firmu, ktorej údaje
   nie sú v ukončovaní výmazu, vymazané ani v archíve len na čítanie. Existujúce ochrany uzamknutých období zostávajú.
3. Pri zmene počas overovania zostane doklad nezaúčtovaný. Môže sa znovu vyhodnotiť v ďalšom spracovaní alebo ho
   prevezme účtovníčka. Kontrola revízie je zámerne konzervatívna a môže odložiť aj súbežnú inú zmenu tej istej firmy.
4. Udalosť sa zapisuje v rovnakej transakcii iba po skutočne úspešnom vlastnom zápise. `changes()` odlišuje
   vlastnú zmenu od druhého spracovania v tej istej sekunde. Chyba pri zápise udalosti vráti späť aj zaúčtovanie.
5. Auditný zápis vráti revíziu po vlastnej zmene. Ďalší stabilný doklad môže využiť načítané nastavenia; neskoršia
   cudzia zmena si opäť vyžiada nové overenie. Revízia je viazaná na firmu, zmena u jedného klienta nezastaví ostatných.

Čítanie revízie je súčasťou čítania dokladu a návrat novej revízie súčasťou auditného zápisu. Na stabilnej ceste
sa nepridáva samostatné databázové volanie pre každý doklad. Nemení sa limit dávky ani počet potrebných použití
pravidla. Existujúca odborná kontrola automatických zápisov zostáva potrebná. Táto oprava nemení model čítačky ani
jej zmeranú presnosť kategórií.

## Regresné overenie

`test/autobook-atomic.runtime.mjs` je súčasťou celého `npm run test:runtime`. Sedemnásť kontrol pokrýva stabilnú
dávku, zmenu DPH, sumy úhrady, pravidla, osoby, dátumu, nastavení DPH, podaného priznania, vypnutie automatiky,
zdieľanú úhradu, opravu v ďalšom spracovaní, obnovenie nastavení medzi dokladmi, dvoch pracovníkov v tej istej
sekunde, zlyhanie auditu aj pokračovanie ďalšieho klienta. Doplnený prípad podaného priznania používa doklady
prijaté v už skončenom mesiaci pred jeho podaním.

Pred zlúčením musia na presnom konečnom commite prejsť všetky požadované Checks vrátane Node 24, Peppol, UI
a prehliadačových scenárov. Po zlúčení potvrdiť aktívny commit cez `Production verification`; výsledok zapísať do PR.

## Originálne technické zdroje

Prečítané 21. októbra 2026:

* Cloudflare D1, transakčné vykonanie batch:
  https://developers.cloudflare.com/d1/worker-api/d1-database/#batch
* SQLite, počet vlastných zmien bez vedľajších zmien triggerov:
  https://www.sqlite.org/c3ref/changes.html
* SQLite, návrat výsledku upravovaného riadka:
  https://www.sqlite.org/lang_returning.html

Existujúce kroky schémy a ich triggery sa nemenia. Oprava používa už existujúce revízie údajov.
