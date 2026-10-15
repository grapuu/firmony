# Firmony: stratégia a realizácia

Stav k **15. októbru 2026**. Tento balík rozširuje [prvý audit](../konkurencny-audit-2026-10-15.md), neopakuje už opravené uzamknutie období, históriu podaní, mesačný SV ani bezpečné odovzdanie dát. Východiskom je [PR #4](https://github.com/grapuu/firmony/pull/4), commit `58f6520b7f1d190adfbce9bddea536633a9413db`. Ide o návrh stratégie a overenie kódu; rozhovory s klientmi ani produkčné overenie neprebehli.

| Dokument | Rozhodnutie, ktoré umožňuje |
|---|---|
| [01 Executive Strategy](01-executive-strategy.md) | Pre koho začíname a aký výsledok predávame |
| [02 Competitive Intelligence](02-competitive-intelligence.md) | Čo konkurenti verejne ponúkajú a čo ešte treba otestovať |
| [03 Product Gap Analysis](03-product-gap-analysis.md) | Čo je v kóde, čo je testované a čo blokuje službu |
| [04 Customer Experience Blueprint](04-customer-experience-blueprint.md) | Čo klient urobí v každom kroku a ako meriame jeho námahu |
| [05 Technical & Accounting Roadmap](05-technical-accounting-roadmap.md) | Úlohy, scenáre, závislosti a akceptačné testy |
| [06 Brand & Growth Strategy](06-brand-growth-strategy.md) | Príbeh zákazníka, dôkazy a experimenty distribúcie |
| [07 Unit Economics Framework](07-unit-economics-framework.md) | Ako zmerať náklady, kapacitu a udržateľnú cenu |
| [08 December Launch Plan](08-december-launch-plan.md) | Termíny, pilot a rozhodnutie GO / NO-GO |
| [09 Top 10 Strategic Priorities](09-top-10-priorities.md) | Poradie práce a spôsob overenia každej investície |
| [10 Red Team Report](10-red-team-report.md) | Ako môžeme zlyhať a čo tomu musí zabrániť |
| [Zdroje](sources.md) | Primárne URL, dátum, rozsah a limity dôkazov |
| [Register pripravenosti](launch-evidence.json) | Strojovo čitateľné brány; neznámy údaj nie je úspech |

## Ako čítať dôkazy

**K** = skontrolovaný kód; **T** = automatizovaný test; **V** = verejné vyjadrenie poskytovateľa; **O** = oficiálny právny alebo technický zdroj; **H** = hypotéza/návrh; **N** = neoverené. Verejné vyjadrenie nie je nezávislým testom služby. Nenájdená informácia nie je dôkazom chýbajúcej funkcie. Dátum pri externých zdrojoch je dátum kontroly, nie nevyhnutne dátum publikácie.

Všetky návrhy majú spoločné identifikátory P1–P10 z dokumentu 09. Tam je problém, dôkaz, odlíšenie, realizácia, test, riziko aj meranie úspechu. Podrobnosti v ostatných dokumentoch túto kartu dopĺňajú. Náklady sú relatívna náročnosť práce, nie vymyslený rozpočet. Ciele pilotu sú navrhované rozhodovacie prahy, nie dosiahnuté výsledky.

## Päť rozhodnutí pre zakladateľa

1. Začať úzkym segmentom slovenských servisných s. r. o. v EUR; každý ďalší režim prijať až po odbornej a technickej kvalifikácii.
2. Predávať pokoj podložený viditeľným vybavením a odbornou kontrolou. Samotné AI, aplikácia či eFaktúra nie sú obrannou výhodou.
3. December chápať ako podmienený pilot; január 2027 je verejný začiatok uvedený v kóde, nie potvrdená pripravenosť.
4. Najprv overiť odborníkov, podania, obnovu a partnerov bánk/eFaktúry. Marketing rozširovať podľa kapacity a meranej ekonomiky.
5. Každý sľub spojiť s dôkazom. Prvá realizovaná oprava z auditu chráni nezodpovedané otázky pred skrytím automatickým oznámením alebo ďalšou správou klienta.

## Rozšírenie zodpovednosti a prijímania klientov

Aktuálny [balík zodpovednosti](../responsibility/README.md) obsahuje primárne právne a poistné podklady, návrh nového článku 6, konkrétne schvaľovanie pred podpisom a opravu historického znenia kontraktu. Verejná bezrizikovosť ani skutočné poistné krytie nie sú potvrdené. Nové podpisovanie ostáva bez doložených schválení uzavreté.
