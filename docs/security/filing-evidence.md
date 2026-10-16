# Podania a potvrdenky

Stav implementácie: **16. 10. 2026**, schéma **18**, pokračovanie v existujúcom PR #8.
Tento modul eviduje prácu oprávneného účtovníka a ním skontrolované potvrdenky. Nevytvára pripojenie
k podateľni, nepodpisuje za klienta a neoveruje pravosť elektronického podpisu potvrdenky.

## Pracovný postup

1. Účtovník skontroluje doklady, účtovanie a podporované daňové výpočty. Uložením podkladov vznikne
   samostatná verzia každého potrebného XML. Pri DPH sú priznanie a kontrolný výkaz dva dokumenty;
   pri závierke sú DPPO a finančné výkazy dva dokumenty. Súhrnný výkaz má vlastné obdobie.
2. Na stránke **Podania a potvrdenky** stiahne presné uložené XML. Podá ho oprávneným prístupom na
   príslušnom portáli a overí výsledok. Samotné uloženie podkladov nemení termín na splnený.
3. Zaeviduje odoslanie a konkrétnu referenciu. Ak už má výslednú potvrdenku, môže ju priložiť priamo
   bez predchádzajúceho samostatného kliknutia na odoslanie. Pri prijatí alebo odmietnutí potrebuje
   originál potvrdenky a výslovnú kontrolu firmy, obdobia, typu dokumentu, referencie aj odoslaného XML.
4. Odmietnutie vyžaduje dôvod a ďalší postup. Rovnaký nezmenený dokument možno po vyriešení technického
   problému znovu odoslať. Obsahovo zmenený neodoslaný alebo odmietnutý dokument sa najprv znovu otvorí
   a odborne pripraví; automaticky sa z neho nerobí dodatočné priznanie.
5. Klient vidí ten istý stav, históriu a prílohy, bez povinnosti spravovať účtovníkovu evidenciu. Platobné
   pokyny sú oddelené od prijatia podania. Podateľňa nepotvrdzuje odbornú správnosť účtovníctva ani úhradu dane.

Spoločný pracovný zoznam **/ucto/podania** obsahuje iba aktuálne nedokončené verzie pridelených firiem,
vrátane starších období mimo výpočtového okna termínov. Odmietnuté a sporné potvrdenia sú prvé.
Zoznam je stránkovaný, rovnako ako firemný register. Staršie verzie zostávajú vo firemnej histórii.

| Stav | Čo dokazuje a čo treba urobiť |
|---|---|
| Podklady pripravené | Uložená verzia XML; externe ešte nič nepotvrdené. |
| Odoslanie evidované, čaká potvrdenie | Účtovník uviedol dátum, kanál a referenciu; treba výslednú potvrdenku. |
| Prijatie podateľňou doložené | Účtovník priložil a skontroloval potvrdenku konkrétneho dokumentu. Nejde o overenie cez API. |
| Podateľňa podanie odmietla | Zachované odmietnutie a dôvod; termín zostáva otvorený. |
| Potvrdenie treba preveriť | Správca otvoril preskúmanie; staré prijatie nezmizne, termín sa znovu otvorí. |
| Prijatie nedoložené | Staršie interné označenie bez novej preukázateľnej evidencie. Nevytvárame chýbajúce dôkazy. |

## Ochrana a nadväznosti

- XML, názov, autor a SHA-256 verzie sú nemenné. Každá zmena doručenia pridá udalosť s predchádzajúcim
  a novým stavom, osobou, časom, externým dátumom, referenciou, kanálom a prípadným originálom v R2.
- Prijatie aj odmietnutie potrebujú neprázdny podporovaný súbor do 10 MB (PDF/XML/JPG/PNG/WebP/ASiC).
  Kontroluje sa formát a odtlačok uložených bajtov; nejde o validáciu podpisu ASiC ani obsahu potvrdenky.
- Referencia alebo totožné bajty potvrdenky iného dokumentu tej istej firmy sa nemôžu opätovne použiť.
  Opätovné posúdenie pôvodnej potvrdenky toho istého dokumentu zachováva všetky udalosti.
- Zaevidované odoslanie, prijatie a preverovanie nemožno odstrániť jednoduchým zrušením zdrojového
  označenia. Opravy zachovajú pôvodný zdroj v histórii. Prijatie môže spochybniť a uzavrieť len správca.
- Oprávnenie účtovníka aj pridelenie firmy sa znovu kontrolujú v databázovej transakcii. Súbežné zápisy
  používajú revíziu; vyhrá iba jeden. Pri stratenej odpovedi po úspešnom commite sa dôkaz nemaže.
- Mutácie a citlivé sťahovanie vyžadujú čerstvé overenie prístupu. Klient má iba čítanie v rámci svojej
  firmy. Konflikt formulára zachová vyplnené údaje, neprehrá zablokovaný POST a nevymyslí nový úspech.
- Priznanie a výkaz sú splnené až po doložení všetkých príslušných dokumentov. Rozdielny stav sa
  nezjednodušuje na spoločné prijatie. Pri zmenách v čiastočne doručenom balíku treba odborné rozhodnutie;
  neautomatizujeme voľbu riadneho/opravného/dodatočného podania pre všetky zmiešané kombinácie.
- Zaradenie starého štvrťročného SV k poslednému mesiacu zachová identitu pôvodného XML, potvrdenku
  a zdrojové obdobie; nevytvára druhé prijatie. Nasledujúca oprava dostane vlastnú verziu a vlastný výsledok.
- Export obsahuje verzie XML, ich odtlačky, úplnú históriu a pôvodné potvrdenky. Chýbajúci alebo poškodený
  originál zabráni dokončeniu archívu. Nová udalosť zneplatní predchádzajúce potvrdenie aktuálnosti exportu.
- Aktuálne nedokončené podanie blokuje automatické zmrazenie pred výmazom. Inaktívny neodoslaný draft
  môže účtovník znovu otvoriť; jeho história zostane v archíve. Po zmrazení je register iba na čítanie.
  Aktívny incident/uchovanie naďalej blokuje výmaz. Riadená retencia zahŕňa aj R2 potvrdenky; výmaz firmy
  nesmie obísť ochranu cez kaskádu. Nejde o WORM úložisko ani nezávislé uchovanie dôkazov.

## Hranice a ďalšie práce

Podporovaných je päť existujúcich generovaných druhov: DPH, KV, SV, DPPO a závierka mikro účtovnej jednotky.
Toto nerozširuje účtovnú agendu na všetky veľké spoločnosti alebo režimy. Staršie interné označenia
sa automaticky nepremenia na potvrdené prijatie. Ich rekonciliácia vyžaduje odborný postup a skutočné podklady.

Mzdové hlásenia jednotlivým poisťovniam a finančnej správe ešte nemajú samostatné doklady doručenia.
Pôvodné ručné označenie preto zostáva **nedoložené a nesplní termín**. Je potrebné doplniť model každého
príjemcu, výkaz, jeho lehotu a potvrdenie. Neoznačovať túto agendu za prevádzkovo dokončenú.

Pred pilotom preveriť skutočné potvrdenky v každej podporovanej agende, postup pri neskoršom chybovom
protokole, obsahové opravy po doručení a dostupnosť odborného zástupcu. Samotné prijatie nie je konečné
schválenie daňového obsahu; neskorší protokol rieši účtovník, prípadne otvorí incident a preverenie.
Automatické čítanie správ podateľne, overenie elektronických podpisov a plné opravy ročných podaní sú ďalšia
práca. Certifikované doručovanie eFaktúr cez digitálneho poštára je samostatná, stále neoverená integrácia.

Testy používajú výrazne označené **TEST_ONLY** podklady a náhradné externé služby. Neodosielajú nič
finančnej správe. D1/R2 regresie overujú súbehy, oprávnenia, odmietnutie, prenosnosť, poškodené prílohy,
uchovanie a obnovu. Chrome overuje skutočný formulár účtovníka, stiahnutie originálu a rovnaký stav klienta.
Úspešné testy nepreukazujú produkčné bankové napojenie, pravosť reálnej potvrdenky ani bezchybnú službu.

## Primárne podklady

Overené 16. 10. 2026:

- [Finančná správa: OIZ v40, časť 8.1, strana 108](https://www.financnasprava.sk/_img/pfsedit/Dokumenty_PFS/Elektronicke_sluzby/Elektronicka_komunikacia/Elektronicka_komunikacia_dane/Prirucky_navody/2025/2025.01.28_OIZ_v40.pdf).
  Rozlišuje prevzatie portálom, prijatie v EKR, odmietnutie, neprijatie a chybu pri odosielaní. Preto aplikácia
  nevyhlási prípravu XML alebo samotné odoslanie za doložené prijatie.
- [Finančná správa: Podanie elektronickými prostriedkami](https://podpora.financnasprava.sk/194801-Podanie-elektronick%C3%BDmi-prostriedkami).
  Vysvetľuje doručenie do elektronickej podateľne a potvrdenie v elektronickej schránke. Konkrétny právny
  účinok a dostatočnosť dokladov v pilotných prípadoch preverí odborník; UI nepredstavuje právnu garanciu.
