# Návrh zmluvných ustanovení: prvý mesiac zadarmo a založenie s. r. o.

23. 10. 2026. Toto je **návrh** na právne a obchodné schválenie; **nemení** `src/content/terms.ts` ani žiadnu
už uzavretú zmluvu. Po schválení sa vloží do podmienok, `TERMS_VERSION` sa zvýši a znenie sa archivuje ako
skutočne odsúhlasené pri uzavretí novej zmluvy (mechanizmus SHA-256 snapshotu už existuje — `src/contracts.ts`).

## A. Prvý mesiac zadarmo — doplnenie článku 4 „Cena a platby“

Návrh nového bodu (za bod 4.3 „Cenu balíka fakturujeme mesačne vopred…“):

> **4.x Prvý mesiac zadarmo.** Klientovi, ktorý u nás službu ešte nevyužíval, sa na faktúre za prvý mesiac
> služby uplatní 100 % zľava z mesačnej ceny jeho základného účtovného balíka. Zľava sa vzťahuje **len** na
> mesačnú cenu balíka; mzdy, dopočet za mesiac s viac dokladmi, závierka a daňové priznanie a práce dohodnuté
> individuálne sa účtujú v plnej výške podľa cenníka. Zľavu uplatníme práve raz, na prvej faktúre za balík,
> a na už vystavené faktúry sa spätne nevzťahuje.

Poznámky k schváleniu:
- „Prvý mesiac služby“ = prvý mesiac vedenia účtovníctva podľa objednávky (deň začiatku), čo je jednoznačné a deterministické.
- Zľava je zobrazená ako samostatný riadok faktúry (záporná suma), takže je auditačne viditeľná pôvodná cena, zľava aj výsledná suma.

## B. Založenie s. r. o. pri 36-mesačnej spolupráci — nový článok

Návrh nového článku (za článok 5 „Začiatok a prechod…“ alebo samostatne):

> **Článok X. Založenie spoločnosti s ručením obmedzeným**
>
> 1. Ak klient spolu so zmluvou o vedení účtovníctva využije koordináciu založenia spoločnosti s ručením
>    obmedzeným, je založenie zahrnuté v cene služby za podmienky, že klient vedie účtovníctvo vo Firmony
>    nepretržite 36 mesiacov odo dňa začiatku služby.
>
> 2. Základná cena balíka založenia (ďalej „C“) je **____ €** bez DPH a je uvedená v objednávke založenia.
>    Zahŕňa [rozsah podľa schválenia]. Nezahŕňa vklad základného imania spoločníkov, ktorý zostáva majetkom
>    spoločnosti, ani [položky, ktoré znáša klient — podľa schválenia].
>
> 3. Ak zmluva skončí pred uplynutím 36 mesiacov, klient uhradí pomernú časť ceny založenia vo výške
>    **C × (36 − m) / 36**, kde **m** je počet celých mesiacov vedenia účtovníctva od začiatku služby do
>    skončenia zmluvy, najviac 36. Suma sa zaokrúhli na centy [spôsob podľa schválenia].
>
> 4. Ak bola služba pozastavená, doba 36 mesiacov sa predlžuje o dobu pozastavenia.
>
> 5. Pri zmene právnej formy, premene alebo prevode obchodného podielu záväzok prechádza na právneho nástupcu,
>    ktorý pokračuje vo vedení účtovníctva; doba sa neprerušuje. Ak spoločnosť zanikne bez právneho nástupcu,
>    dopočet podľa bodu X.3 sa uplatní.
>
> 6. Dopočet sa neuplatní, ak klient od zmluvy odstúpi pre naše podstatné porušenie zmluvy.

Poznámky k schváleniu:
- Suma **C** a rozsah v bode X.2 sú **nevyplnené** — čakajú na schválenie (viď `docs/formation-pricing.md`).
- Odporúčam doplniť aj zákaznícky ekvivalent (karta + FAQ už pripravené v `src/copy.ts`).

## C. Konzistentnosť a verzovanie

- Po schválení sa oba texty vložia do `src/content/terms.ts`, `FORMATION_CONSENT` sa zosúladí a `TERMS_VERSION` sa zvýši.
- Nové znenie sa archivuje (`src/content/terms-archive/`) a pri uzavretí každej novej zmluvy sa uloží SHA-256 snapshot
  skutočne odsúhlaseného znenia (existujúci mechanizmus). Už uzavreté zmluvy sa nemenia — `resolveContract` ich vracia
  v pôvodnom znení.
- Podpísanie zmluvy vyžaduje platný `CONTRACT_RELEASE` (právne + poistné schválenie); zmena podmienok preto zneplatní
  súčasný release a bude treba nový.
