# Založenie s. r. o. — rozsah a podklad na cenu C (návrh na schválenie)

23. 10. 2026. Pracovný podklad k schváleniu skutočnej ceny založenia a pravidiel pomerného dopočtu.
Nenahrádza zmluvné znenie ani právnu radu; žiadna suma tu nie je stanovená, kým ju majiteľ neschváli.

## 1. Obchodný princíp (už schválený)

- Založenie s. r. o. je zahrnuté v cene služby, ak klient vedie účtovníctvo vo Firmony **nepretržite 36 mesiacov**.
- Pri skoršom ukončení sa **pomerne dopočíta vopred určená časť ceny založenia**.
- Viazanosť sa prezentuje ako férový balík, nie ako putá: odchod je možný, len sa dopočíta neodslúžená časť založenia.

## 2. Vzorec pomerného dopočtu (pracovný návrh, nie finálne ustanovenie)

```
dopočet = C × max(0, 36 − m) / 36
```

- **C** = vopred dohodnutá základná cena balíka založenia bez DPH (schváli majiteľ; v zmluve a v objednávke založenia).
- **m** = počet splnených **celých** mesiacov vedenia účtovníctva od začiatku služby, najviac 36.
- **Zaokrúhlenie**: navrhujem matematické zaokrúhlenie na centy (polovica centu nahor) — prosím potvrďte, prípadne určte iný spôsob (napr. vždy nadol, vždy nahor).
- Po 36 mesiacoch je dopočet 0 (ponuka je „odslúžená“).

## 3. Od ktorého okamihu plynie 36 mesiacov a súvisiace pravidlá (návrhy na schválenie)

| Otázka | Návrh |
| --- | --- |
| Začiatok 36 mesiacov | Odo dňa začiatku služby („začiatok“ v objednávke, vždy 1. deň mesiaca), nie odo dňa podania žiadosti o založenie. |
| Výpovedná lehota | Štandardná mesačná výpovedná lehota (bod 10.2 podmienok); do **m** sa započítavajú celé mesiace do skončenia zmluvy vrátane výpovednej lehoty. |
| Pozastavenie služby (napr. omeškanie s platbou) | Doba 36 mesiacov sa **predlžuje o dobu pozastavenia**; počas pozastavenia sa neodsluhuje. |
| Zmena spoločnosti (transformácia, prevod podielu, zmena právnej formy) | Záväzok prechádza na právneho nástupcu, ktorý pokračuje vo vedení účtovníctva; doba sa neprerušuje. |
| Neštandardné ukončenie (zánik firmy bez nástupcu, odstúpenie) | Dopočet sa uplatní bez ohľadu na dôvod skoršieho skončenia, **okrem** prípadu, keď klient odstupuje pre naše podstatné porušenie zmluvy (vtedy sa dopočet neuplatní). |

## 4. Rozsah založenia a kto čo znáša (podklad na cenu C)

**Dôležité:** základné imanie s. r. o. (min. 5 000 €) **nie je** náklad založenia a **nie je** súčasťou bezplatného založenia.
Je to peňažný vklad spoločníkov, ktorý zostáva majetkom spoločnosti. Musíme to tak komunikovať.

| Položka | Kto ju znáša (doplniť a schváliť) | Poznámka |
| --- | --- | --- |
| Notár / advokát (zakladateľská listina / spoločenská zmluva) | [Firmony / klient] | |
| Živnostenské oprávnenie + správny poplatok | [Firmony / klient] | |
| Zápis do Obchodného registra + súdny poplatok | [Firmony / klient] | |
| Registrácia na daňovom úrade (DIČ), poisťovne, prípadne DPH | [Firmony / klient] | zväčša bez poplatku, ide o administratívu |
| Základné imanie (vklad spoločníkov, min. 5 000 €) | **klient (spoločníci)** | majetok firmy, nie poplatok |
| Naša interná koordinácia a dohľad | Firmony | súčasť ceny C |
| Zápisnica, plná moc, tlačivá a príprava podkladov | [Firmony] | súčasť ceny C |

**Výstup na schválenie:** doplňte, ktoré položky kryjeme my (vstupujú do C) a ktoré znáša klient samostatne,
a potom stanovte číslo **C**. Dokiaľ nie je C schválené, zmluvné ustanovenie zostáva s nevyplnenou sumou.

## 5. Čo ešte treba rozhodnúť

1. **Cena C** (bez DPH) a presný zoznam položiek, ktoré zahŕňa.
2. **Spôsob zaokrúhlenia** dopočtu.
3. **Pozastavenie služby**: či sa doba 36 mesiacov predlžuje o dobu pozastavenia (navrhujem áno).
4. **Neštandardné ukončenie**: či sa dopočet odpúšťa pri našom podstatnom porušení (navrhujem áno).
5. **Obchodné označenie**: zákaznícky text karty a podmienok (pripravené v `src/copy.ts`, čaká na právne posúdenie).
