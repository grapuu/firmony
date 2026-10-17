# December Launch Plan

Východisko **15. 10. 2026**. December je cieľ pripravenosti/pilotu; verejný kód uvádza začiatok služby **1. 1. 2027** (`BRAND.launch`). Tieto dátumy nie sú rovnaké rozhodnutie. V súčasnom dôkazovom stave je výsledok pre verejné spustenie **NO-GO**. Nie preto, že dokázane zlyháva prevádzka, ale preto, že kritické prevádzkové dôkazy chýbajú.

## Roadmapa a rozhodovacie body

| Obdobie | Výsledok | Vlastník roly / závislosť | Ukončovacia podmienka |
|---|---|---|---|
| 15.–23. október | Uzavrieť audit, segment, vlastníkov brán, rozsah pilotu | Zakladateľ + metodik + technický vlastník; tieto roly ešte treba personálne potvrdiť | Každá kritická brána má konkrétnu osobu, nie iba názov roly |
| 24.–31. október | Partneri bánk/eFaktúry, právna a účtovná revízia, research plán | Skutočné ponuky a dostupnosť sandboxu | Zmluvný model, dátové spracovanie, náklady a akceptačný plán |
| 1.–15. november | Integrácie, bezpečnosť a obnova; metodická vzorka | P1–P4/P7; nečakať s obnovou do konca vývoja | Dokončené interné skúšky a rozlíšenie prijatia/odmietnutia |
| 16.–30. november | Suchá prevádzka od prevzatia po odchod, rozhovory a testy úloh | Odborník + zástupca + technický vlastník | Protokoly, bez nevyriešených kritických rozdielov; odhad kapacity z meraní |
| 1.–15. december | Kontrolovaný pilot kvalifikovaných firiem alebo tieňová prevádzka | Súhlas a presný rozsah; najviac kapacitný limit | Vecná kvalita, čas klienta a plné náklady zaznamenané |
| 16.–22. december | Nezávislé GO/NO-GO pre januárovú službu | Zakladateľ rozhodne na podpisoch metodika, práva a bezpečnosti | Všetky relevantné kritické brány PASS, platné dôkazy a dostupný zástupca cez sviatky |
| Koniec decembra / január | Prvé podania, opravy a vyhodnotenie kohorty | Pridelený odborník, zástupca, incident vlastník | Pokračovanie len pri splnenej kvalite; marketing podľa kapacity |

Dátumy sú navrhnutý plán, nie rezervovaná dostupnosť dodávateľov či klientov. Ak do polovice novembra nie je integračný partner pripravený, nepokúšať sa skryť chýbajúci transport generovaním XML. Vyhodnotiť legálne a prakticky odskúšaný externý portál poštára ako dočasný postup s kompletnou archiváciou, alebo posunúť prijímanie daného segmentu. Ručný fallback musí mať vlastníka, kapacitu a rovnaké kritériá dôkazu.

## Kritické brány

Strojový register je [launch-evidence.json](launch-evidence.json). `unknown` a `fail` znamenajú NO-GO pre príslušný rozsah. Žiadny automatizovaný test nesmie sám vyplniť produkčnú bránu.

| ID | Povinný dôkaz | Stav pri audite |
|---|---|---|
| G1 Účtovná správnosť | Nezávisle odsúhlasený mesiac/rok podľa segmentu, opravy a rozdiely vysvetlené; žiadna nevyriešená závažná chyba | UNKNOWN |
| G2 Právo a zodpovednosť | Posúdené podmienky, oprávnenie poskytovať rozsah, AML/GDPR, mandáty, zmluvy odborníkov, postup škody a relevantné poistenie | UNKNOWN |
| G3 Bezpečnosť | Overené práva firiem/tímu, autentifikácia, tajomstvá a exporty; bez otvorenej kritickej/vysokej chyby v rozsahu služby | UNKNOWN |
| G4 Obnova | Vykonaný restore D1 aj R2 do čistého prostredia; merané RPO/RTO odsúhlasené sľubom, overené počty/hash/väzby | UNKNOWN |
| G5 Podania | Účinné zastupovanie a úspešný autorizovaný proces, potvrdenie prijatia; skúška odmietnutia a nápravy | UNKNOWN |
| G6 Bankové dáta | Živý kvalifikovaný účet, súhlas, kontinuita, odvolanie, doplnenie a výpadok; prípadný fallback zmluvne uvedený | UNKNOWN |
| G7 eFaktúra | Pre relevantný rozsah 2027 registrácia a test príjmu/odoslania/opravy, certifikovaný partner, archivácia a plán výpadku | UNKNOWN |
| G8 Odborná kapacita | Konkrétny vlastník a zástupca, overená kompetencia, zmluva a nameraná kapacita aj na termíny | UNKNOWN |
| G9 Prevzatie a odchod | Reálna skúška úplnosti a čitateľnosti; určené obdobia a odovzdávací protokol | UNKNOWN |
| G10 Ekonomika a kvalifikácia | Známe náklady pilotu, limit prijímaných firiem a vynútenie výluk; plánované straty explicitne schválené ako pilotná investícia | UNKNOWN |

Register má obsahovať súkromný odkaz na protokol, kontrolóra, presný rozsah, dátum a platnosť. Citlivé klientské dáta ani tajomstvá neukladať do GitHub dokumentácie. Zmena pravidiel, partnera či rozsahu môže dôkaz zneplatniť.

## Bezpečná alternatíva pri NO-GO

**Tieňový pilot:** syntetické alebo so súhlasom odosobnené dáta, porovnanie s nezávislým odborníkom; bez prevzatia zodpovednosti za živé povinnosti klienta a bez tvrdenia, že sa podanie uskutočnilo. Pomôže zmerať prácu, ale neprejde ním produkčná brána.

**Obmedzený živý pilot:** iba po prejdení kritických právnych, bezpečnostných, obnovovacích a odborných brán; segment a rozsah výslovne ohraničené. Daňové a mzdové úlohy mimo systému vykoná dohodnutý oprávnený odborník overeným postupom a potvrdenie sa archivuje. Fallback nie je výnimka zo zákona a nesmie nechať chýbajúceho vlastníka termínu. Povinnosti eFaktúry nemožno po 1. januári ignorovať ani u prijímajúceho neplatiteľa.

Nábor maximálne do preukázanej kapacity, navrhnutý prvý strop päť firiem je plán, nie existujúci zoznam klientov. Každému určiť rozsah, obdobie, kontaktnú osobu, zástupcu, deň kontroly a postup incidentu. Verejné reklamy na neobmedzenú službu spustiť až po úspešnom dôkazovom rozhodnutí.

## Stop pravidlá

Strata/únik dát, nevysvetlený závažný rozdiel, zmeškané podanie, neúčinný mandát, neobnoviteľné dáta alebo preťažený dohľad zastavujú nové aktivácie. Existujúce povinnosti preberá zástupca podľa incidentného plánu. Opraviť príčinu, skontrolovať zasiahnuté obdobia, klienta informovať dohodnutým kanálom a až potom obnoviť príjem. Termín spustenia nie je dôvod znížiť odbornú bránu.
