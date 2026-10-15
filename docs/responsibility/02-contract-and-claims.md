# Zmluvný model a riešenie chyby – pracovné zadanie pre advokáta

Návrh, nie schválené obchodné podmienky. Právne podklady a obmedzenia sú v [01](01-law-and-competition.md). Text v `src/content/terms.ts`, verzia 2026-10-15, je návrhom základného článku 6 a súvisiacej povinnosti upozorniť v bode 3.6. Pri existujúcich zmluvách sa použije ich skutočne dohodnutý režim; nová verzia ich sama nemení.

## Odporúčaná skladba záväzku

1. **Zodpovedná služba:** menovite prevzaté agendy, obdobia a termíny; poskytovateľ zodpovedá aj za vlastný softvér a svojich ľudí v zákonnom režime. Výstup AI nie je ospravedlnenie chyby.
2. **Náprava na naše náklady:** odstránenie vlastnej chyby, odborná kontrola a podklady na opravný postup bez nového účtovného poplatku. Náklady externého zastúpenia sa dohodnú s právnikom a poisťovňou; nesľubovať automaticky akéhokoľvek poradcu za akúkoľvek cenu.
3. **Náhrada spôsobenej škody:** oprávnená preukázaná sankcia, úrok a ďalšia zákonne nahraditeľná škoda podľa príčiny. Nie výlučnosť nášho pochybenia ani automatické odmietnutie pri jednej neskorej faktúre.
4. **Finančné zabezpečenie:** konkrétna poistka a súhlas k záväzkom, vlastné financovanie spoluúčasti a nekrytej časti. Pre významného klienta individuálne dojednané zabezpečenie, až keď je záväzné a dostupné.
5. **Proces s dôkazmi:** chrániť termíny, vyčísliť škodu, prizvať nezávislého odborníka, zdokumentovať rozhodnutie a platbu. Sťažnosť nie je nový platený projekt klienta.

### Prílohy individuálnej zmluvy

| Príloha | Obsah, ktorý sa musí vyplniť pred podpisom |
|---|---|
| A – Rozsah a zodpovednosti | Entita, prevádzky, účty, meny, účtovné/daňové obdobia, DPH, mzdy, majetok, sklady, zahraničie, termíny; kto pripravuje, kontroluje, schvaľuje, podáva a uchováva potvrdenie |
| B – Prevzatie účtovníctva | Reconciliácia počiatočných stavov, zoznam starých chýb a otvorených kontrol, rizikové pozície, hranica odovzdania; neskoršia oprava predchádzajúcej chyby je osobitne prevzatá úloha |
| C – Služba a zastupovanie | Hlavný účtovník a zástupca, odborný kontrolór, mandáty, oprávnený daňový poradca, auditná súčinnosť, incidentný kontakt dostupný pre skutočné lehoty |
| D – Náhrada a zabezpečenie | Príčiny a kategórie náhrady, prípadný individuálny limit s právnym stanoviskom, poistný dokument a dodatky, spoluúčasť, likvidita, spôsob úhrady; žiadne nevyplnené sumy v podpísanej zmluve |
| E – Dôkazy a odchod | Presný kontrakt, nemenné podania a potvrdenia prijatia, prístupy, export, obnova, incidentný spis, pravidlá uchovania počas sporu a následného výmazu |

Prevzatý rozsah nesmie byť iba opis obchodného balíka „do 250 dokladov“. Napríklad bankové napojenie neznamená právo vykonávať klientove platby. XML na stiahnutie neznamená podanie a úspešné prijatie úradom. Príprava podkladu pre poradcu neznamená poskytovanie regulovaného stanoviska Firmony.

## Zásady formulácie pre advokáta

- Základná náhrada nesmie závisieť iba od vôle poisťovne. Pri právnom nároku je dlžníkom Firmony, aj keď krytie nestačí. Poistný limit nie je automaticky limit náhrady.
- Ak sa dohodne limit, vyjednať konkrétnu sumu voči zdokumentovanému riziku, priehľadne riešiť jednu udalosť, sériu, rok aj celkový súbeh. Jeho platnosť a výnimky musí posúdiť advokát. V kóde ani návrhu nevymýšľame sumu.
- Neskoré oznámenie nie je automatický zánik nároku. Rozlišovať vplyv na skutočné zväčšenie škody, poistnú notifikáciu a zákonné premlčanie. Interný cieľ rýchleho hlásenia nie je skrytá prekluzívna lehota pre klienta.
- Nevylučovať všetko označené „daň“: riadne splatná daň sa odlišuje od nezvratne strateného zákonného odpočtu alebo iného nároku. O výške rozhoduje preukázaný rozdiel oproti správnemu zákonnému postupu po zohľadnení dostupnej nápravy.
- Výpadok banky či úradu neoslobodzuje automaticky. Overiť, či existovala povinnosť, dostatočná časová rezerva, varovanie, alternatíva a zákonné ospravedlnenie. Rovnako posúdiť dodávateľa, ktorého si zvolilo Firmony.
- Neviazať prešetrenie našej chyby na zákazníkovu verejnú mlčanlivosť, vzdanie sa ostatných nárokov alebo zaplatenie spornej faktúry. Chrániť dôvernosť a osobné údaje primerane.
- Podanie reklamácie, interné rokovanie a oznámenie poisťovni nesmú klientovi vziať možnosť chrániť súdne či správne lehoty. O prípadnom uznaní záväzku a prerušení premlčania rozhodne právnik.

## Ochrana pred zneužitím bez zbavovania sa zodpovednosti

| Riziko | Primeraná ochrana (návrh) | Čo nerobiť |
|---|---|---|
| Klient pridá starú pokutu | Prevzaté obdobie, pôvodné stavy, výpis rozhodnutia, dátum pôvodu chyby; vlastné zanedbanie neskôr prevzatej opravy sa posúdi samostatne. | Paušálne odmietnuť akýkoľvek problém zistený po migrácii. |
| Vymyslené alebo pozmenené podklady | Uchovať originál, čas prijatia, hash, verzie, prístupy, zmeny a dôvod kontroly; skúmať vecnú podstatu v dohodnutom rozsahu. | Dôverovať iba screenshotu alebo označiť každý chybný vstup za podvod. |
| Súbeh chyby klienta a Firmony | Rekonštruovať príčiny a zákonné spoluspôsobenie; právnik posúdi aj prípadnú solidaritu viacerých škodcov. | Odmietnuť celý nárok preto, že chybu nespôsobilo výlučne Firmony. |
| Škoda bola odvrátiteľná | Ochrana odvolania, opravné podanie, žiadosť a zákonná úhrada podľa situácie; zaznamenať pokyny a náklady. | Čakať na poistné plnenie, kým uplynie lehota. |
| Dvojitá náhrada | Vyčíslenie čistého zostatku po vrátení sankcie a plneniach; zákonné postúpenie/regres posúdiť v dohode. | Vylúčiť nárok už preto, že klient má vlastné poistenie. |
| Klient požaduje neobmedzený obchodný výnos | Doložený zákonný nárok, príčinná súvislosť, predvídateľnosť a primerané zmiernenie. | Automaticky sľúbiť všetok hypotetický ušlý zisk. |
| Úmysel alebo nezákonný pokyn | Odmietnuť nezákonný postup, zachovať dôkazy, eskalovať oprávneným osobám; dodržať AML a zákaz prezradenia tam, kde platí. | Preplácať zakázané sankcie alebo obísť zákon pod názvom garancie. |

## Postup udalosti

Navrhované **interné prevádzkové ciele**, zatiaľ nejde o zmluvné SLA ani dosiahnutú výkonnosť. Advokát a poisťovňa schvália záväzné lehoty a súhlasy. Núdzové lehoty úradu majú prednosť.

1. Príjem: incident môže oznámiť klient aj tím. Zapísať čas, dotknutú entitu a obdobie, typ škody, rozhodnutie a koniec lehoty. Prideliť vedúceho prípadu a zástupcu; pri hroziacej lehote okamžitá eskalácia, inak cieľ potvrdiť prijatie do jedného pracovného dňa.
2. Ochrana: zabezpečiť dôkazy proti bežným zmenám a **pozastaviť príslušné mazanie**. Právnik určí nevyhnutné údaje, právny základ, prístupy a dátum ďalšieho preskúmania. Nezastavovať všetko spracovanie bez dôvodu.
3. Notifikácia: bezodkladne oznámiť poisťovni okolnosti podľa skutočnej poistky; nečakať na právoplatnosť. Súčasne chrániť úradné, platobné a opravné lehoty s oprávneným zástupcom.
4. Prešetrenie: dvojica nezúčastnených odborníkov porovná pôvodný pokyn, vstupy, odbornú povinnosť, verzie, kontrolu a potvrdenia podania. Cieľ do piatich pracovných dní poslať priebežné stanovisko alebo konkrétny dôvod, prečo treba viac času; bez vymýšľania rozhodnutia poisťovne.
5. Rozhodnutie: oddeliť opravu, právnu zodpovednosť a poistné krytie. Klient dostane vysvetlenie príčiny, náhrady a ďalšieho postupu. Uznanie, dohoda a platba sa koordinujú s poisťovňou podľa jej podmienok; dohoda nesmie spôsobiť zánik klientových zákonných lehôt.
6. Platba: nesporná suma a prípadné preklenutie likvidity podľa právnikom schválenej dohody. Konkrétna splatnosť a súhlas poisťovne sa vyplnia pred predajom tejto výhody. **Nezavádzame sľub platby pred súhlasom**, ktorý by zničil krytie. Zamietnutie poisťovne samo nezamieta oprávnený nárok voči Firmony.
7. Poučenie: príčina, nápravné opatrenie, vlastník, termín, overenie a kontrola ostatných klientov. Sériový problém hlásiť ako súvisiace udalosti, nie umelo rozdrobiť nároky. Uchovanie a výmaz spisu schvaľovať podľa právneho režimu.

Samostatný register škôd, právnych blokácií výmazu a platobných autorizácií ešte nie je implementovaný. Pred prijatím klienta musí existovať funkčný náhradný postup s menovitým vlastníkom a preukázaným zastavením automatického výmazu; samotný tento dokument nestačí. Je to otvorená brána v registri pripravenosti.

## Scenáre pre právnu a poistnú akceptáciu

| Prípad | Očakávané posúdenie, nie automatický výrok o krytí |
|---|---|
| Všetky podklady a mandát boli včas, podanie sa zabudlo | Naša povinnosť, náprava, príčinná sankcia/úrok a možná ďalšia zákonná škoda; preveriť deadline výluku poistky. |
| Chýbal jeden doklad, tím ignoroval zvyšok podania | Rozlíšiť dôsledok chýbajúceho dokladu od nášho samostatného zlyhania; žiadne všeobecné odmietnutie. |
| Zlá AI klasifikácia prešla kontrolou | Chyba služby; nepresúvať ju na model. Skúmať aj sériový dopad. |
| Klient dostal správne a včas platobné údaje, sám nezaplatil | Preskúmať prijatie upozornenia, rozsah našej úlohy a príčinu. Bez prevzatia platby nemôžeme garantovať jej vykonanie. |
| Chybou tímu sa nezvratne zmeškal zákonný nárok | Osobitne posúdiť stratu nároku; neopísať ju všeobecne ako „daň sa nehradí“. |
| Poisťovňa odmietla pre zmluvnú garanciu alebo cloud incident | Právny nárok klienta zostáva predmetom posúdenia voči Firmony; krytie a vlastné zdroje sú náš problém. |
| Klient má kontrolu za obdobie pred Firmony | Prevzatý rozsah a neskoršie samostatné pochybenie pri výslovne prevzatej úlohe. |
| Podpis vyžaduje dvoch konateľov | Súčasný online podpis jednou osobou nepoužiť; individuálny overený proces. |
