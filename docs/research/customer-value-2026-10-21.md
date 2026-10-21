# Ako má klient s Firmony vyhrávať

Interný výskum pre Christiana, 21. 10. 2026. Bez zmeny aplikácie, cien alebo zmluvných sľubov. Balíky zostávajú 89, 169 a 329 eur mesačne bez DPH podľa `src/config.ts`.

Odporúčam budovať pocit výhody na štyroch overiteľných výsledkoch: klient rozumie cene, vidí vykonanú odbornú starostlivosť, administratíva mu reálne zaberá menej času a zachováva si kontrolu nad údajmi a odchodom. Nasledujúce návrhy sú hypotézy pre Firmony odvodené z výskumu. Účinok na slovenské účtovné služby zatiaľ nebol zmeraný.

## Čo ukazujú pôvodné práce

| Oblasť a originál | Čo bolo skúmané a čo z toho vyplýva | Hranica záveru |
| --- | --- | --- |
| S1. Kahneman a Tversky, 1979, Prospect Theory, Econometrica 47(2), 263 až 291 | Voľby medzi rizikovými alternatívami ukazujú význam referenčného bodu a rozdielneho hodnotenia ziskov a strát. Pri komunikácii výhody záleží na tom, s čím klient výsledok porovnáva. | Nie je to dôkaz, že strašenie pokutou zvýši konverziu účtovnej služby, ani univerzálny násobok citlivosti na stratu. |
| S2. Kahneman, Knetsch a Thaler, 1986, Fairness as a Constraint on Profit Seeking, AER 76(4), 728 až 741 | Kanadské telefonické prieskumy s rozdielnymi scenármi cien a miezd ukazujú, že ľudia posudzujú dôvod zmeny ceny a jej férovosť voči očakávanému vzťahu. | Ide o deklarované postoje k scenárom, nie experiment s dnešnými slovenskými firemnými klientmi. |
| S3. Bertini a Wathieu, 2005, Price Format and the Evaluation of Multicomponent Goods, HBS WP 05 087 | Päť štúdií skúma, ako rozdelenie celkovej ceny presúva pozornosť na jednotlivé súčasti ponuky. Účinok závisí od významu a hodnotenia súčasti; nie je vždy kladný. | Prečítaný je autorský pracovný text z 20. 9. 2005, nie tvrdenie o výsledku nášho cenníka. |
| S4. Mayer, Davis a Schoorman, 1995, An Integrative Model of Organizational Trust, AMR 20(3), 709 až 734 | Teoretický model odlišuje schopnosť, priaznivý záujem o druhú stranu a integritu ako súčasti vnímanej dôveryhodnosti. Pomáha rozlíšiť odbornosť od pekného sľubu. | Teoretická syntéza s výskumnými propozíciami, nie nový randomizovaný experiment ani dôkaz percentuálneho rastu predaja. |
| S5. Buell, Kim a Tsay, Creating Reciprocal Value Through Operational Transparency, HBS WP 14 115, revízia 29. 9. 2015; publikované Management Science 63(6), 2017 | Terénne a laboratórne experimenty v stravovaní skúmajú viditeľnosť procesu a zákazníka. Viditeľná práca ovplyvnila vnímanie úsilia, ocenenie služby aj správanie pracovníkov. | Pracovný text a publikovaný článok sú rozlíšené. Výsledok z kuchyne nemožno prevziať ako predpoveď účinku účtovného dashboardu. |
| S6. Schmitt, Skiera a Van den Bulte, 2011, Referral Programs and Customer Value, Journal of Marketing 75(1), 46 až 59 | Panel zákazníkov jednej nemeckej banky porovnáva odporučených a ostatných klientov; odporučení mali priaznivejšiu retenciu a hodnotu, s rozdielmi medzi segmentmi. | Observačné dáta jednej banky. Výber podobných klientov a kontext obmedzujú prenos aj kauzálny záver; odmena sama osebe negarantuje zisk. |

Prečítané boli pôvodné texty a relevantné metodické, výsledkové a diskusné časti, nie iba populárne zhrnutia. Neprebierame celé práce ani ich tabuľky.

Originály:

S1: https://web.mit.edu/curhan/www/docs/Articles/15341_Readings/Behavioral_Decision_Theory/Kahneman_Tversky_1979_Prospect_theory.pdf

S2: https://kahneman.scholar.princeton.edu/document/10
PDF má v prehliadači zavádzajúci technický názov Anomalies, jeho titulná strana a obsah sú uvedený článok o férovosti z roku 1986.

S3: https://www.hbs.edu/ris/Publication%20Files/05-087_1ea8dc68-5a6f-4b76-a8bb-3ed669f5a1f8.pdf

S4: https://www.makinggood.ac.nz/media/1270/mayeretal_1995_organizationaltrust.pdf
Originálny článok, identita overená aj na stránke vydavateľa: https://journals.aom.org/doi/10.5465/amr.1995.9508080335

S5: https://www.hbs.edu/ris/Publication%20Files/14-115_aee7737a-a405-46f1-85e9-67882dd95435.pdf
Publikovaná verzia a bibliografia: https://pubsonline.informs.org/doi/10.1287/mnsc.2015.2411

S6: https://faculty.wharton.upenn.edu/wp-content/uploads/2012/04/Schmitt-Skiera-vandenBulte-2011-Referral-Programs-Customer-Value.pdf

## Čo skutočne robia sledované firmy

Overené z ich vlastných verejných dokumentov 21. 10. 2026. Nebol vytvorený účet ani testovaná ich prihlásená aplikácia. Verejný opis funkcie preto nie je výsledok porovnávacieho UX testu. Ide o inšpiráciu obchodným modelom a procesom, nie o rovnaký typ služby.

| Firma | Preukázateľný postup | Čo je použiteľné pre Firmony |
| --- | --- | --- |
| Revolut, slovenská osobná ponuka | Standard má bezplatné predplatné, konkrétne operácie majú limity a poplatky. V odporúčaniach aplikácia ukazuje splnené kroky; podmienky závisia od kampane a odmenu spravidla získava pozývajúci. | Viditeľný stav a presné podmienky hodnoty. Bezplatný vstup nie je dôkaz, že komplexnú účtovnú službu možno ekonomicky poskytovať bezplatne. |
| Trading 212, Invest | Verejná pomoc uvádza obchodovanie a úschovu bez provízie, samostatné FX a prípadné náklady financovania či externé odvody. Pies a voliteľný AutoInvest zjednodušujú opakovanie rozhodnutého postupu. Firma opisuje príjmy z FX a požičiavania akcií; CFD majú ďalší model. | Automatizovať opakované úkony po zrozumiteľnom nastavení, nechať ich zastaviť a pred potvrdením vysvetliť cenu. Výnosové zdroje brokera nemožno považovať za náš rozpočet. |
| Robinhood, USA | Aktuálna stránka Tiered Referrals Program opisuje míľniky od 1. 9. 2026, oprávnený financovaný účet a obmedzenia odmien vrátane výberu. Ide o ponuku pre rezidentov USA. Platený Gold je samostatná vrstva služby. | Ocenenie odporúčania môže byť viditeľné a viazané na skutočnú aktiváciu. Americké podmienky neprezentovať ako ponuku slovenskému klientovi ani ako odmenu bez podmienok. |

Revolut: aktuálna webová stránka už zobrazuje budúce podmienky od 19. 12. 2026. Na stav k dnešnému dňu bol použitý odkaz na znenie účinné od 9. 7. 2026:
https://cdn.revolut.com/terms_and_conditions/pdf/personal_fees_standard_55677821_1.3.1_1781183425_en.pdf
Odkaz na históriu: https://www.revolut.com/en-SK/legal/standard-fees/
Podmienky a dokončené kroky odporúčania: https://help.revolut.com/en-SK/help/referrals/more-help-with-referrals/referrals-new/missed-steps/requirements-to-get-the-referral-reward/

Trading 212:
https://helpcentre.trading212.com/hc/en-us/articles/11471996799517-What-are-the-fees-in-the-Invest-ISAs-and-SIPP
https://helpcentre.trading212.com/hc/en-us/articles/360007139838-What-are-the-fees-for-funding-my-account
https://helpcentre.trading212.com/hc/en-us/articles/360008682638-How-does-Trading-212-make-money
https://helpcentre.trading212.com/hc/en-us/articles/30661163244317-Pies-AutoInvest-Introduction

Robinhood:
https://robinhood.com/us/en/support/articles/invite-friends-get-free-stock/
Táto stránka obsahuje aj opis Gold ako plateného predplatného. Stránku How Robinhood makes money sa nepodarilo načítať, preto z nej nevyvodzujeme aktuálnu skladbu príjmov. Staré články s náhodnou akciou za každé odporúčanie sa nemajú zamieňať s novými míľnikmi.

Z týchto zdrojov nemožno potvrdiť všeobecné tvrdenie, že všetky tri firmy sú vždy najlacnejšie alebo že zákazník nad nimi ekonomicky vyhráva. Pre Firmony je overiteľná výhoda dôležitejšia ako prevzatie reklamného dojmu.

## Deväť konkrétnych návrhov pre Firmony

Toto sú odporúčania na rozhodnutie a testovanie. Nie sú označené ako existujúce funkcie alebo schválené zmluvné záväzky.

1. **Predvídateľný účet na celý rok.** Pred objednávkou ukázať mesačný balík, jeho limity, skutočné dohodnuté ročné položky, mzdy a pravidlo prekročenia. Celková suma musí zodpovedať rovnakým vstupom ako fakturácia. Zdroj S2 a S3; vlastná hypotéza: menej prekvapení podporí vnímanú férovosť. Merať porozumenie ceny a reklamácie faktúr, nielen kliknutie na kúpu. Existujúci cenník a kalkulátor treba najprv porovnať s takýmto úplným scenárom, nevytvárať nepravdivé všetko v cene.

2. **Mesačný dôkaz vykonanej starostlivosti.** Klient dostane stručný stav: ktoré povinnosti sú dokončené, čo overil účtovník, čo zostáva a kto je na rade. Do detailu iba na vyžiadanie. Skutočné prijatie podania sa odlíši od prípravy súboru. Zdroj S4 a S5; hypotéza: viditeľná práca zvýši dôveru bez nových úloh klienta. Merať správnosť pochopenia stavu, počet otázok čo ste vlastne urobili a čas klienta.

3. **Prevzatie účtovníctva organizuje Firmony.** Jeden prehľad súhlasov a nevyhnutných podkladov, jasný vlastník prevzatia, zoskupené otázky namiesto opakovaného zháňania dokumentov. Kontakt s pôvodnou účtovníčkou len s oprávnením klienta. Zdroj S4; produktová hypotéza o nižšom úsilí, nie priamy experiment s Firmony. Merať počet kontaktov, minúty klienta a čas do odborne prevzatého účtovníctva; nepočítať iba registráciu účtu.

4. **Preukázaný čas späť klientovi.** Ak ukážeme ušetrený čas, porovnáme rovnakú agendu s jeho vlastným vstupným meraním a uvedieme, čo je odhad. Daňový prínos zobrazíme iba po odbornom overení a bez dvojitého započítania. Zdroj S1 ako rámec referenčného bodu; konkrétne meranie je náš návrh. Nepoužívať vymyslenú priemernú účtovníčku ani súčet hypotetických pokút.

5. **Cena sa mení zrozumiteľne.** Včas ukázať blížiaci sa limit, pravidlo a dôsledok podľa skutočnej zmluvy. Dodatočný individuálny rozsah schváli klient pred začatím podľa zmluvného postupu. Zdroj S2; hypotéza: dôvera pretrvá aj pri vyššom objeme práce. Merať počet neočakávaných zvýšení a porozumenie, kontrolovať súlad upozornenia s faktúrou. Nie je tu sľúbená nemenná cena pri neobmedzenom počte dokladov.

6. **Viditeľné zodpovedné riešenie chyby.** Klient vie, kam chybu oznámiť, kto ju rieši, aký je ďalší krok a aký nárok poskytuje jeho konkrétna zmluva. Odškodnenie a poistné krytie sa uvádzajú až po právnom a poistnom potvrdení. Zdroj S4; hypotéza: zrozumiteľný postup znižuje neistotu. Merať čas do prvého vecného kroku a vyriešenia. Nepoužívať sľub nulového rizika ani automaticky zamietať každý prípad so súčinnosťou klienta.

7. **Jednoduchý odchod a použiteľné dáta.** Pri prevzatí služby vysvetliť export a lehoty; pri odchode odovzdať kompletné údaje s kontrolou prevzatia. S4 je teoretická opora integrity, dopad na konverziu je hypotéza. Merať, či nezávislý účtovník vie prevzatý export použiť a koľko úkonov klient potrebuje. Existuje ročný ZIP a 90 dní prístupu; výskum z toho nerobí sľub neobmedzeného prístupu po skončení zmluvy.

8. **Odporúčanie až po preukázanej spokojnosti.** Najprv overiť úspešné prevzatie a prvý spracovaný mesiac, potom dobrovoľne požiadať o predstavenie ďalšej firmy. Prípadnú odmenu podmieniť skutočným prijatím a úhradou služby, určiť limit, ochranu pred vlastnými a duplicitnými odporúčaniami a jasné podmienky pre obe strany. S6 a overené platformové mechanizmy sú podklad, náš výsledok zostáva hypotézou. Výšku odmeny určiť až z reálnych nákladov a retencie; žiadna suma ani nový program sa týmto neschvaľuje.

9. **Skutočné dokončenie ďalšieho kroku.** Pri onboardingu klient vidí, čo je hotové a jednu nevyhnutnú ďalšiu akciu, s vysvetlením dôvodu a možnosťou pomoci. Verejne doložené kroky Revolutu a voliteľná automatizácia Trading 212 sú inšpirácia; nejde o dôkaz účinku nášho formulára. Merať dokončenie platného AML procesu a chybovosť podkladov. Nepridávať fiktívny náskok, umelé čakanie, konfety za rizikové rozhodnutie ani obídenie identifikácie.

## Odporúčaný postup rozhodnutia

Pred spustením vybrať návrhy 1, 2 a 3 pre kvalitatívny test s piatimi až ôsmimi podnikateľmi. To je navrhnutá veľkosť rozhovorov, nie počet existujúcich klientov. Každý dostane rovnaký scenár a vysvetlí vlastnými slovami cenu, povinnosti a stav služby. Čas merať pri reálnej úlohe; zistiť aj počet potrebných opráv, prístupnosť na mobile a mieru dôvery. Ďalším overením je skutočný mesiac s účtovníkom, nie samotná otázka páči sa Vám to.

Po nazbieraní prevádzkových údajov porovnať varianty prezentácie s vopred určenou hlavnou metrikou, veľkosťou vzorky a hranicou prakticky významného rozdielu. Obe skupiny dostávajú všetky zákonné upozornenia a rovnakú kvalitu služby. Sledovať aj chyby, meškania, minúty účtovníka, náklady a odchody, aby nárast konverzie neprekrýval horší výsledok klienta. Malý pilot sa nemá vydávať za štatistický dôkaz.

Neodporúčam automaticky pridať bezplatnú neaktívnu firmu. Aj tá má konkrétnu agendu a riziká; súčasné údaje nepreukazujú takmer nulové náklady. Ani plánovaný digitálny poštár sa nemá sľubovať ako bezplatne zahrnutý bez dodávateľskej ceny a potvrdeného rozsahu. Marketingový sľub o čase, záruke alebo cene sa pustí až vtedy, keď zodpovedá reálnemu procesu, dokumentom a meraniu.
