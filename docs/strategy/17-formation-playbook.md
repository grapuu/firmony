# Založenie s.r.o. zadarmo + prechod + „všetko za zákazníka" — môj uhol pohľadu (22. 10. 2026)

Dopĺňa [16](16-accounting-advantages.md) a [13](13-customer-advantage.md), nemení rozhodnutia. Toto je
najsilnejší nápad majiteľa: chytiť firmu **pri vzniku**, kým ešte nemá účtovníka, a urobiť z Firmony
predvolenú voľbu. Súhlasím, že je to obrovské; nižšie je poctivý rozbor a ako to postaviť bez právnej chyby.

## Prečo je to naozaj obrovské

- Na Slovensku ročne vznikajú **desiatky tisíc nových s.r.o.** (presné číslo overiť zo Štatistického úradu SR
  alebo Finstat; rádovo ide o desiatky tisíc ročne, pri ~státisícoch aktívnych s.r.o.).
- Každá s.r.o. **zo zákona potrebuje účtovníctvo**. Moment vzniku je jediný okamih, keď ešte nemá vybraného
  účtovníka — tam je akvizícia najlacnejšia a „default = Firmony".
- Založenie aj prechod sú administratívne náročné; „podpíšete a podnikáte" je hmatateľná výhra.

## Dve polovice, ktoré si nesmieme zamieňať

1. **Kód (viete postaviť teraz):** „predné dvierka" — žiadosť o založenie + koordinácia + pravdivý stav,
   presne ako spravovaný prechod G1 (`/app/prechod`). Zákazník vyjadrí záujem, tím ho koordinuje, klient vidí
   priebeh a robí iba nevyhnutné potvrdenia. Toto je produktová kostra „všetko za zákazníka".
2. **Právo a prevádzka (nesmie nahradiť kód):** samotné založenie (zakladateľská listina, živnosť, obchodný
   register, základné imanie, banka, daňový úrad) je právny a administratívny proces. Kód ho **koordinuje**,
   ale vykonáva ho človek/právnik — inak by sme sľubovali automatické založenie, ktoré neexistuje.
   Existujúce podklady: `docs/drafts/advokat-kosice.txt`, `docs/responsibility/`.

## „Zviazať ich" — ako to predať bez pút (moja úprimná rada)

Doživotná viazanosť „musíte u nás viesť účtovníctvo navždy" je právne krehká aj zlá marketingová emócia
(nikto nechce putá). Silnejšie aj čistejšie je:

- **„Prečo by ste odchádzali?"** — viazať kvalitou a spínacím nákladom (máte u nás všetko, dáta sú vaše,
  odchod je možný a transparentný), nie zmluvnou reťazou.
- **Poctivá forma balíka:** „založenie zadarmo, ak u nás vediete účtovníctvo aspoň 12 mesiacov; pri skoršom
  odchode sa založenie pomerne dopočíta." Toto je zákonné, férové a stále predajné ako „výborný deal".
- **Prednosť pred konkurenciou:** nikto iný nespája založenie + účtovníctvo + viditeľný stav v jednej
  aplikácii od prvého dňa.

## Konkrétne, čo sa dá postaviť (kostra G4)

Analógia k spravovanému prechodu G1, s novým krokom schémy:

1. Verejná žiadosť „Založím s.r.o." (alebo v aplikácii) — meno, základné údaje, predstava o firme.
2. Prípad pre tím: kontrolný zoznam založenia (dokumenty, živnosť, register, banka, daňový úrad, podpis).
3. Klient vidí stav a robí iba potrebné potvrdenia (podpis, údaje) — žiadne „riešte si to sami".
4. Po zápise do registra sa aktivuje účtovníctvo (prvé kroky, AML, zmluva).
5. Pravdivé stavy, žiadny sľub „založíme za 24 hodín".

Toto je tá istá osvedčená cesta ako G1: samostatná vetva, nový krok schémy, regresie (HTTP/D1/browser),
živé nasadenie až po zelenom CI.

## Hranice

Žiadny automatický podpis, žiadne „založíme bez vás", žiadne skrývanie poplatkov. Založenie zadarmo je
promo na prvú dobu viazanosti, nie dar s doživotnými putami. Presná štatistika trhu sa pred použitím v
marketingu overí z primárneho zdroja.
