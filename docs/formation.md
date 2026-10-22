# Založenie s.r.o. a prechod v jednom, G4 — špecifikácia

22. 10. 2026. Nadväzuje na [spravovaný prechod G1](managed-takeover.md) a [16](strategy/16-accounting-advantages.md)
a [17](strategy/17-formation-playbook.md). Toto je realizačná špecifikácia pre kód; samotný kód pôjde samostatnou
vetvou s novým krokom schémy 80. Ceny 89/169/329 €, slogan a účtovné jadro sa nemenia.

## Rozhodnutie

Klient dostane **založenie s.r.o. zadarmo, ak u nás vedie účtovníctvo aspoň 36 mesiacov**. Spolu so spravovaným
prechodom G1 to tvorí jednu ponuku „založíme alebo prevezmeme, a vy už len podpíšete". Viazanosť sa predáva ako
výhodný balík, nie ako putá: pri skoršom odchode sa založenie pomerne dopočíta (36 mesiacov).

## Tok a stavy

Klient (vlastník firemného účtu, po overení čerstvého prístupu) zadá žiadosť „Založím s.r.o." na `/app/zalozenie`:
meno a e-mail kontaktnej osoby, predstava o firme (predmet činnosti, spoločníci, plánované sídlo) a potvrdenie
rozsahu koordinácie + 36-mesačnej doby.

Stavy: `requested → preparing → waiting → registering → completed`, plus `cancelled`. Vrátenie je povolené len po
dopredu definovaných hranách (ako `mayMove` v G1). Jedna firma má najviac jeden neodvolaný prípad; história je nemenná.

Tímový prípad na `/ucto/klienti/:id/zalozenie`: zodpovedná osoba, ďalší termín, kontrolný zoznam založenia, vlastné
prijatie podkladov a záznam overeného oprávnenia. Klient vidí stav, zodpovednú osobu, termín a prípadnú otázku.
Po zápise do registra sa aktivuje účtovníctvo (prvé kroky, AML, zmluva, počiatočné stavy).

## Kontrolný zoznam založenia (štandardný postup, na validáciu právnikom)

1. **Zakladateľská listina / spoločenská zmluva** — pripraví notár alebo advokát. Obsah: obchodné meno, sídlo,
   predmet podnikania/činnosti, spoločníci a vklady, konatelia, základné imanie (min. 5 000 €).
2. **Oprávnenie na podnikanie** — živnostenské oprávnenie (Okresný úrad, živnostenský odbor) alebo iné oprávnenie
   podľa predmetu činnosti.
3. **Vklad základného imania + bankový účet** — vklady spoločníkov (spolu min. 5 000 €) na účet / notársku úschovu.
4. **Zápis do Obchodného registra** — Okresný súd, elektronicky (slovensko.sk) alebo papierovo. **Spoločnosť vzniká
   dňom zápisu.**
5. **Registrácia na daňovom úrade (DIČ)** — z registra alebo prihláškou; daňový úrad pridelí DIČ.
6. **Registrácia do Sociálnej poisťovne a zdravotnej poisťovne** — za zamestnancov a konateľov.
7. **Prípadne registrácia pre DPH** (IČO DPH) podľa situácie.

Presné tlačivá, poplatky a elektronická vs. papierová forma sa pred spustením overia z primárnych zdrojov
(slovensko.sk, MS SR, Finančná správa) a právnikom. Tento zoznam nie je právna rada.

## Poctivé zviazanie na 36 mesiacov

- „Založenie zadarmo" je promo viazané na 36 mesiacov vedenia účtovníctva vo Firmony.
- Pri odchode pred uplynutím 36 mesiacov sa zvyšok nákladu založenia dopočíta pomerne (transparentne, vopred v zmluve).
- Žiadna doživotná reťaz, žiadny skrytý poplatok, dáta klienta sú prenositeľné (existujúci export).

## Čo robí kód vs. čo robí človek

- Kód: žiadosť, stavy, história, kontrolný zoznam, vlastné prijatie podkladov, notifikácia (ako G1 zvonček), export,
  riadený výmaz.
- Človek/právnik: príprava listiny, živnosť, zápis do registra, banka, daňové a poisťovacie registrácie. Kód nikdy
  netvrdí automatické založenie ani nepodpisuje.

## Právne zdroje (na prečítanie pri implementácii)

Obchodný zákonník (s.r.o., §§ 56–75b a 105–153), živnostenský zákon, Občiansky zákonník (zastupovanie §§ 31–33b, 40),
AML zákon (§ 19) a zákon o účtovníctve (§§ 5, 8). Primárne znenia na slov-lex.sk sa otvoria a ocitujú v kóde,
ako to robí G1.

## Overenie

`test/formation.runtime.mjs` (Worker/D1: súbeh, stavy, oprávnenia, odvolanie, export, výmaz) a
`test/formation.browser.mjs` (klient + tím, labely, mobil, upload). SHA-256 stráži prvých 79 schém; nový krok **80**.
Live nasadenie až po zelenom `npm run check`, `npm test`, `test:runtime`, `test:ui`, `test:peppol` a browser kontrolách.
