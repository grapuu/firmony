# Executive Strategy

**Rozhodnutie:** Firmony má byť riadená účtovná služba pre malú s. r. o., v ktorej majiteľ vidí, čo je vybavené, čo rieši účtovník a ktoré rozhodnutie potrebuje od neho. Nemáme dôkaz, že tento výsledok už poskytujeme v produkcii. Máme rozpracovaný a automatizovane testovaný vlastný systém.

## Tri hlavné riziká

1. **Rozsah sľubov predbieha prevádzku.** Kód má bankové adaptéry a XML exporty, ale nemáme dôkaz produkčného bankového spojenia, doručenia cez digitálneho poštára ani prijatého daňového podania. V `wrangler.jsonc` je zástupné ID databázy. Pôvodná titulná stránka sľubovala prevzatie všetkej práce. [K: 03; P1, P3, P4, P7]
2. **Ľudská kontrola má neznámu cenu a kapacitu.** Podmienky počítajú s kontrolou každého dokladu človekom; odmeny v konfigurácii sú plánovacie predpoklady. Bez merania migrácií, opráv a podpory nie je preukázaná marža ani počet klientov na účtovníka. [K: `src/config.ts`, `src/content/terms.ts`; P2, P8]
3. **Bežný positioning sa dá ľahko zameniť.** Slovenskí konkurenti už komunikujú online zónu, osobného účtovníka, prehľady aj prevzatie agendy. Ani údajná absencia odborníkov u Bezúčtovníka nie je platný základ stratégie. [V: CI profily; P5, P6]

## Tri najlepšie príležitosti

1. Znížiť meraný čas klienta: najprv banky a doklady, potom iba otázky o hospodárskej podstate a potrebné autorizácie. Meranie má zahŕňať aj čas mimo aplikácie, nielen počet kliknutí. [P3, P5, P9]
2. Prepojiť odborného vlastníka prípadu s overiteľným dokončením: kontrola, prijaté podanie, vysvetlenie odchýlky, zastupovanie pri neprítomnosti. Výhodou má byť výsledok celého procesu, nie izolovaný modul. [P2, P7]
3. Prevziať malú firmu do roku 2027 spolu s eFaktúrou, bezpečnou migráciou a otvoreným exportom. Samotný prenos XML už konkurencia ponúka alebo pripravuje; pohodlie a spoľahlivosť celku musíme ešte dokázať. [P4, P5, P10]

## Prvý segment a hranice služby

**Navrhovaný prvý segment:** slovenská servisná s. r. o., tuzemské EUR doklady, jeden jednoduchý bankový tok, bez skladu, bez zložitej personálnej agendy. Nová firma alebo firma s odborne odsúhlasenými počiatočnými stavmi. Neplatiteľ DPH nie je bez povinností pri prijímaní eFaktúr; tento tok musí byť pripravený pred príslušnými povinnosťami roku 2027. [O: FS1–FS3]

Plný platiteľ DPH môže vstúpiť až po nezávislej kontrole DPH/KV/SV a reálnom teste autorizovaného podania. § 7a nie je totožný s plným platiteľom; vyžaduje osobitné prijímacie pravidlá. Mzdy majú vlastný produktový limit aj pri jednoduchom výpočte. Zo základného pilotu vylúčiť OSS/IOSS, sklad, výrobu, hotovostne náročné prevádzky, viac mien, rekonštrukcie, komplikované autá/majetok a neštandardné odmeny konateľov. To je navrhovaná prevádzková politika; aktuálna registrácia ju ešte nevynucuje.

Zložitosť sa zisťuje pred cenovou ponukou. Klient dostane konkrétne „prijmeme / preveríme / teraz nepokrývame“ s dôvodom a ďalším krokom. Žiadne tiché odmietnutie ani univerzálny paušál na ľubovoľný objem.

## Tri možné pozície značky

Hodnotenia sú kvalitatívne hypotézy podľa auditu, nie výsledky zákazníckeho výskumu.

| Pozícia | Potreba | Vierohodnosť dnes | Rozdielnosť | Napodobnenie | Prevádzka | Obchodný potenciál |
|---|---|---|---|---|---|---|
| A: Najlacnejšie automatické účtovníctvo | Citlivosť na cenu treba zmerať | Slabá: nepoznáme plné náklady | Slabá oproti lacným aplikáciám | Ľahké zníženie ceny | Riziko poddimenzovania kontroly | Neoverený, tlak na cenu |
| B: Účtovníctvo s viditeľne vybavenou prácou a dostupným odborníkom | Obava z nejasného stavu je hypotéza | Stredná v kóde, službu treba overiť | Stredná; rozhodnú merané výsledky | Text ľahký, sústava procesov ťažšia | Realizovateľná v úzkom segmente | Najlepšia hypotéza pre pilot |
| C: Centrum všetkých firemných financií | Silná pri väčšej firme, výskum chýba | Slabá pre súčasný rozsah | Slabá voči ekosystémom | Náročná integrácia | Príliš široká do decembra | Neskoršia expanzia, dlhý predaj |

**Odporúčaná B.** Prísľub: „Viete, čo je vybavené. Máte sa na koho obrátiť.“ UVP: jedna služba s prideleným účtovníkom, spoločným kontextom firmy, jasnými potrebnými rozhodnutiami a dôkazom o vybavení. Zákazník je hrdina budujúci firmu; Firmony je pokojný odborný sprievodca, ktorý preberá dohodnutú rutinu.

Túto pozíciu smieme vyhlásiť za výhodu až po porovnaní rovnakých úloh v pilote. Nestačí počet testov ani pozitívny rozhovor. [P6, P9]

## Ako vznikne obranná výhoda

Každá opakovaná odborná výnimka sa zmení na zdokumentované pravidlo, nezávisle odsúhlasený príklad a regresný test. Pravidlo má verziu, platnosť, pôvod a výnimky. Účtovník opravuje návrh v jednom prostredí; klient neopakuje údaje; zmluva a aplikácia opisujú rovnaký rozsah. Prínos overíme časom na prípad, chybovosťou a úspešným dokončením podaní. Konkurenčné texty, vizuály a kód sa nepreberajú.

Závislosť od dodávateľa eFaktúry či banky nie je obranná výhoda. Adaptéry a exporty majú umožniť výmenu partnera bez straty účtovnej histórie. Prevádzková dokumentácia, vzťah s klientom a odborne validované postupy môžu vytvoriť náskok; dnes je to smer práce, nie existujúci obchodný moat.
