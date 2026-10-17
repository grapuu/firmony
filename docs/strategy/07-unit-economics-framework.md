# Unit Economics Framework

P8/P9. **Dnes nemáme preukázanú maržu, CAC, retenciu ani kapacitu na klienta.** Konfigurácia obsahuje reálne navrhnuté ceny, nie pozorované tržby. Tento dokument ich nepreceňuje ani nemení.

`src/config.ts`: Štart 89 €/20 dokladov, Rast 169 €/60, Firma 329 €/150 mesačne; mzdy 15 €/osoba/mesiac, závierka/DPPO 249 € samostatne. Uvedenie bez DPH podľa konfigurácie a podmienok. `ACCOUNTANT_PAY` sú interné plánové odmeny, nie potvrdená trhová ponuka ani úplné náklady. Historické modely v CLAUDE sú hypotézy; cieľ 60 % sa nesmie interpretovať ako dosiahnutý výsledok.

## Meracia jednotka a zdroje

Jednotka je **klient × mesiac × segment × rozsah**, plus osobitná kohorta prevzatia a závierky. Pri každom úkone zbierať typ, aktívne minúty, čakanie, rolu, príčinu výnimky/opakovaného spracovania a stav dokončenia. Čas zisťovať pracovným záznamom/časovačom a výberovou kontrolou, nie iba rozdielom medzi otvorením a odoslaním formulára.

| Vstup | Primárny doklad / spôsob získania | Pravidlo pri chýbaní |
|---|---|---|
| Výnos | Vystavená faktúra, dobropis, inkaso; oddeliť službu a DPH | Nie nula; výsledok NEOVERENÉ |
| Prevzatie | Čas odborníka, komunikácia s predchodcom, import, opravy | Samostatne, neskrývať v bežnom mesiaci |
| Kontrola/účtovanie | Úkon po type dokladu, režime a príčine zásahu | Zahrnúť aj opravy po prvom zaúčtovaní |
| Podania/závierka/mzdy | Kompletný cyklus vrátane odmietnutí a opráv | Sezónnosť a povinnosti merať osobitne |
| Podpora | Vecný čas a opakované kontakty, interné konzultácie | Prvá odpoveď nie je celý náklad problému |
| Dodávatelia | Reálna ponuka/zmluva a faktúra banky, poštára, AI, úložiska | Nevkladať internetový odhad ako produkčný náklad |
| Infraštruktúra | D1/R2/Worker, zálohy, monitoring, prenosy, e-mail | Priradiť spotrebu alebo transparentný alokačný kľúč |
| Ľudia | Skutočný kontrakt, náklady zamestnávateľa, dohľad a zástupca | Odmena freelancerovi nie je celá personálna vrstva |
| Vývoj/prevádzka | Náklady tímu podľa času a dodávok | Oddeliť od priamych nákladov, ale zahrnúť do cash plánu |
| Akvizícia | Výdavky kanála, tvorba, predajný čas, odmeny partnerom | Oddeliť platený a zmiešaný CAC |
| Retencia | Kohorta zaplatených aktívnych firiem a dôvod odchodu | Žiadna extrapolovaná životnosť z krátkeho pilotu |

**Zabrániť dvojitému započítaniu práce:** ak freelancer fakturuje fixný klientsky paušál, tento paušál je priamy náklad a jeho merané minúty sú kapacitný údaj. Nepripočítať ich znova ako hodinovú odmenu. Zvlášť zahrnúť skutočne ďalší interný dohľad, podporu a opravy, ktoré paušál nepokrýva. Pre hodinový model použiť minúty × skutočnú úplnú sadzbu. Každá alokácia musí byť reprodukovateľná.

## Výpočty bez fiktívnych vstupov

Všetky peniaze bez DPH, čas v minútach; storno/dobropisy znižujú výnos. Uvádzať účtovný aj peňažný pohľad.

```
priame_naklady = odmena_za_obsluhu + dalsia_priama_praca
               + variabilni_dodavatelia + alokovana_prevadzka
prispevok = cisty_vynos_sluzby - priame_naklady
prispevkova_marza = prispevok / cisty_vynos_sluzby   # iba ak výnos > 0
plny_vysledok = sucet_prispevkov - fixne_prevadzkove_naklady - vyvoj
CAC_kanala = uplne_naklady_kanala / novi_zaplateni_aktivovani_klienti
retencia_kohorty = zostavajuci_klienti_z_povodnej_kohorty / povodna_kohorta
```

Návratnosť CAC: prvý mesiac, keď kumulované skutočné príspevky kohorty pokryjú akvizičné náklady; zahrnúť náročné prevzatie. LTV zatiaľ neuvádzať ako `ARPA/churn`: krátka vzorka s nulovým odchodom neznamená nekonečnú životnosť. Zverejniť len pozorovaný príspevok a trvanie kohorty. Nulový počet klientov v menovateli vracia „nedá sa určiť“.

Fixnú prevádzku už alokovanú do priamych nákladov neodpočítavať vo `plny_vysledok` druhýkrát. Tabuľka nákladov musí obsahovať zdrojový doklad, alokačný kľúč a zaradenie; súčet alokovaných a zostávajúcich nákladov sa musí rovnať skutočne zaúčtovanému celku.

Závierkový výnos a práca patria do ročného pohľadu. Mesačná rezerva je riadiaci odhad označený ako odhad, musí sa následne porovnať so skutočnosťou. Ročný poplatok nerozpúšťať tak, aby zakrýval stratu pri odchode pred závierkou.

Kapacita: `použiteľné odborné minúty − dovolenka − školenia − dohľad − potvrdená rezerva`. Vydeliť konzervatívnou nameranou náročnosťou prijímaného mixu klientov, nie priemerom najľahšej firmy. Pri malej vzorke ukázať jednotlivé prípady/rozpätie; netváriť sa, že P90 z pár klientov je stabilný trhový odhad. Kontrolovať aj koncentráciu termínov a kapacitu zástupcu.

## Pilot a cenotvorba

Navrhované prvé firmy: nové alebo jednoduché servisné s. r. o. s tuzemskou EUR agendou, kvalifikované podľa 01. Horný počet pilotu určí meraná odborná kapacita; pre plán náboru navrhujeme najviac päť, nie tvrdenie o existujúcich klientoch. Aspoň jeden prípad prevzatia, jeden chýbajúci doklad a plánovaná neprítomnosť účtovníka, ak sa zmestia do kvalifikovaného rozsahu.

Po každom období: metodik skontroluje vzorku aj všetky závažné výnimky, zakladateľ vyhodnotí náklady a klient svoj skutočný čas. Pri škode či chybnom podaní sa problém najprv vyrieši; nevylučuje sa z datasetu. Úspech pilotu nie je počet registrácií.

Platobnú ochotu skúmať na úplnom rozsahu a ročnej cene: súčasná faktúra/rozsah, čo je dôvod zmeny, konkrétna ponuka a skutočné prijatie alebo odmietnutie. Hypotetická otázka „zaplatili by ste?“ nestačí. Nepoužívať klamlivú objednávku neexistujúcej služby.

Cena sa môže meniť až po nameranej segmentovej ekonomike, odlíšení mimoriadnej práce a kontrole zmluvného postupu. Dnes nemeníme cenník ani odmeny. Výsledok pred investíciou musí ukázať aj citlivosť na viac výnimiek, drahšieho dodávateľa, neprítomnosť a horšie inkaso; scenáre sa zostavia z reálnych rozsahov alebo sa výslovne označia ako hypotézy.
