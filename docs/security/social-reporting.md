# Mesačný výkaz Sociálnej poisťovne z uzavretých miezd

Stav: 17. 10. 2026, schéma **22**, pokračovanie PR #8. MVPP 2026 sa pripravuje z podporovaných
uzavretých miezd rokov 2026/2027. Výstup je **pripravený súbor**, nie registrácia, podanie ani prijatie SP.
Pred pilotom treba overiť skutočný import a výsledné kontroly v eSlužbách.

## Podporovaný rozsah a správnosť súm

Podporujeme bežný pracovný pomer s pravidelným mesačným príjmom, celý kalendárny mesiac a štandardný
osobný rozsah všetkých príslušných poistení. Každý fond sa preberá z uloženej pásky; výkaz mzdu nemení.
Kontrola porovná uzavreté vymeriavacie základy a odvody s oddelene pripnutými pravidlami vykazovania.
Chýbajúci rok pravidiel, fond, nesúlad, opakovaný zamestnanec či neúplná uzávierka prípravu zastavia.

- Zamestnanec: NP 1,4 %, SP 4 %, IP 3 %, PvN 1 %.
- Zamestnávateľ v podporovanom pracovnom pomere: NP 1,4 %, SP a SDS spolu 14 %, IP 3 %, PvN 0,5 %,
  PFP 0,5 %, ÚP 0,8 %, GP 0,25 %, RFS 4,75 %. SP a SDS sa vo výkaze uvádzajú spolu, aj pri II. pilieri.
- Strop je 16 764 eur pre rok 2026 a 17 820 eur pre rok 2027. Úrazové poistenie má samostatný
  neobmedzený základ. Každá suma sa overuje po zaokrúhlení nadol na cent, nie zo spoločného percenta.
- Úhrny vznikajú zo všetkých jednotlivých fondov. Zamestnanec s nulovou sumou sa z prílohy nestratí.
- Riadny R aj opravný O obsahujú celú podporovanú prílohu. Podľa poučenia opravný mesačný výkaz
  nahrádza pôvodný výkaz; nevytvárame rozdielové alebo záporné riadky. Typ a rozsah opravy určuje odborník.

Čiastočný mesiac potrebuje odborné externé spracovanie, vrátane správneho obmedzenia základov.
Dohody, nepravidelné alebo ďalšie osobitné príjmy, súbežné právne vzťahy, výnimky z poistenia,
dôchodkové režimy, prerušenia, PN, materská, štrajk, trénerské a športové úľavy, vykazované doby
starostlivosti o dieťa a náhrady mzdy z vážnych prevádzkových dôvodov zostávajú mimo generátora.
Poučenie 2026 vyžaduje údaje o niektorej starostlivosti o dieťa aj pri pracovne aktívnom rodičovi;
neprítomnosť materskej preto sama nepotvrdzuje úplnosť prílohy. Rozsah sa potvrdzuje výslovne.

## Údaje, ktoré nemožno odvodiť z výšky mzdy

Rodné číslo je spoločný overený údaj pre zdravotné výkazy aj SP. Existujúca tabuľka schémy 21
`payroll_health_ids` si ponecháva názov aj históriu. Pri príprave sa ukazujú iba posledné štyri číslice.
Deväť alebo desať číslic je kontrola formátu, nie overenie v registri. Z dátumu narodenia číslo nevyrábame.
Osobitné a zahraničné identifikátory sa riešia externe. Poistenec sa priraďuje iba zo zdrojovej uzávierky.

IČPV je 12-miestne číslo právneho vzťahu pridelené SP. Účtovník ho overí podľa konkrétneho podkladu
a uloží raz; ďalšie mesiace ho preberajú. Neodvodzuje sa z rodného čísla ani IČO. Aktuálne rovnaké IČPV
nemožno priradiť dvom zamestnancom firmy. Zmena skutočného právneho vzťahu nie je obyčajná oprava
preklepu: model automaticky neurčuje historickú právnu platnosť registrácie. Taký prípad treba preveriť externe.

Hodiny sa overujú osobitne pre zamestnanca a uzávierku. Zodpovedajú vykázanému vymeriavaciemu
základu vrátane plateného neodpracovaného času; nie sú jednoduchým odhadom odpracovaných hodín.
Podporujeme dve desatinné miesta a rozsah do počtu hodín celého kalendárneho mesiaca. Neprenesú sa
automaticky z minulého mesiaca. Ak počet nemožno určiť, odborník výslovne zvolí kód **999**, nechá
číselné pole prázdne a uvedie dôvod. Neznáma hodnota sa nikdy nezmení na nulu.

Evidencia obsahuje referenciu, osobu, čas a nemennú revíziu. Prvý údaj uloží pridelený účtovník alebo
správca; opravu overeného údaja robí správca s dôvodom. Opraviť možno aj samotnú referenciu bez
vymýšľania odlišného čísla alebo hodín. Predchádzajúci záznam ostáva zachovaný.

## Príprava, opravy a doručenie

Hlavička ponúka vlastný účet firmy, číslo zamestnávateľa z nastavení a posledné skontrolované kontakty.
Desaťmiestne číslo zamestnávateľa SP sa nezamieňa s osemmiestnym IČO. IBAN je účet, z ktorého firma
odvádza poistné, nie príjmový účet SP. Meno a priezvisko osoby plniacej povinnosti sa neskracujú ani
nerozdeľujú odhadom. Údaje tejto osoby sa neoznačujú za zmenu kontaktov samotného zamestnávateľa.
Príprava vyžaduje vyplnený telefón s medzinárodnou predvoľbou a e-mail tejto osoby, hoci XSD technicky
pripúšťa prázdny text. Samotná XSD nie je úplnou vecnou kontrolou podania.
Určený výplatný termín pochádza z uzávierky; dátum vypracovania nie je dôkaz bankovej úhrady.

Náhľad je viazaný na zdroj, revíziu údajov, spoločnú identitu, IČPV a hodiny. Zápis znovu kontroluje
aktuálne oprávnenie v SQL, pridelenie, revízie a zdroj. Staré otvorenie stránky ani súbeh nezachovajú
právo zapisovať. Generovanie uloží súbor a pôvod atómovo. Pri nejasnom výsledku zápisu sa nezničí
už uložený originál. Príprava aj citlivé zmeny vyžadujú čerstvé overenie; odmietnutý POST sa neopakuje.

Oprava IČPV alebo hodín zneaktuálni dotknuté generované SP výkazy. Oprava spoločného rodného čísla
otvorí preverenie dotknutých SP aj zdravotných výkazov. Starší súbor a jeho potvrdenka sa nemenia.
Pracovný zoznam, termín a odovzdanie sa riadia aktuálnymi podkladmi. Ostatní príjemcovia sa nemenia.
Pri už doloženom prijatí SP generovanie vyžaduje opravný typ O aj v SQL; ďalší riadny výkaz sa nevytvorí.
Nová verzia po odoslanom, prijatom alebo preverovanom podaní vyžaduje správcu a dôvod. Samotná
oprava podkladu nepodáva opravný výkaz. Každé prijatie sa dokladá nezávislou, skontrolovanou potvrdenkou.

Klient dostáva stav, pôvod a originál súboru. Nemá formuláre na zadávanie IČPV alebo hodín. Pozvaní
členovia nemajú prístup k osobným mzdovým súborom. Tieto kroky nevykonávajú RLFO ani nenahrádzajú
overenie registrácií a oznámenie analytických údajov v SP. Percento automatizácie zatiaľ nemeriame.

## Migrácia, export a uchovanie

Schéma 22 pridáva `payroll_social_relations`, `payroll_social_inputs` a `payroll_social_generations`.
Nové údaje chránia nemenná história, revízie, incidenty, právne uchovanie a zámok odovzdania.
Úplný export obsahuje registrácie, analytickú históriu, presné originály a pôvod s overenými kontrolnými
súčtami. Syntetická obnova aj riadený výmaz zahŕňajú nové tabuľky.

Staršie externé SP podania a generované zdravotné výkazy si zachovajú pôvodnú aktuálnosť, súbory
a potvrdenky. Migrácia nevymýšľa IČPV ani hodiny. Schémy 19–21 sa nemenia; SHA-256 serializovaného
poľa SQL schémy 21 ostáva `226d83b5103a7b28098d7fc4dae1004db2c7cc365a5c1dc76404791e34d0d8f7`.

## Primárne podklady a hranice overenia

Overené 17. 10. 2026:

- [Rozhranie SP](https://www.socpoist.sk/node/6042) a [MVPP-v2026.xsd](https://www.socpoist.sk/www/sites/default/files/2025-08/MVPP-v2026.xsd).
  Pôvodných 36 608 bajtov je uložených v `test/xsd/mvpp2026.xsd`, SHA-256
  `39b03c603ad1883cc1f3647f4e6afbbd7e15057a035d29cc6aedfebcb4a4d132`.
  Poznámka k IČPV uvádza, že ho vyžaduje vecná kontrola, aj keď je v XSD nepovinné.
- [Formuláre SP](https://www.socpoist.sk/formulare): [poučenie MVPP 2026](https://www.socpoist.sk/api/idsp/download/d360c51e-c8c8-4554-8a3f-4a7344765bf5),
  SHA-256 `629517f81cc60e77906dbffbaea8ae73144bd79a5be1b7d2fa859e170db5b222`,
  a [poučenie prílohy 2026](https://www.socpoist.sk/api/idsp/download/35cd0fa0-ef07-4adb-b296-a4c66b855904),
  SHA-256 `42a9416a35fbc9804ffa3aaf8230ea5721595472147a7f1101e38c4652583c82`.
  Rozlišujú úplný opravný výkaz, dni 2026, IČPV, význam hodín/kódu 999 a ďalšie povinné údaje prílohy.
- [Tabuľky poistného 2026](https://socpoist.sk/socialne-poistenie/platenie-poistneho/tabulky-platenia-poistneho/tabulky-platenia-poistneho-od-1-6),
  [zákon č. 461/2003 Z. z., znenie od 1. 1. 2027, najmä § 130–138](https://static.slov-lex.sk/static/SK/ZZ/2003/461/20270101.html)
  a [SP k maximálnemu základu 2027 a osobitnej športovej úprave](https://socpoist.sk/node/7038).
  Pre podporovaný pracovný pomer sa PvN zamestnávateľa 0,5 % a PFP 0,5 % vykazujú oddelene.
- [SP k analytickým údajom](https://www.socpoist.sk/news/zamestnavatelia-oznamovanie-analytickych-udajov-socialnej-poistovni-priklady).
  Údaje RLFO a mesačné hodiny sú odlišné povinnosti.
- [Oznam z 15. 1. 2026](https://www.socpoist.sk/node/6916) potvrdzuje nasadenie **VPP**, pričom vtedy ešte
  uvádzal obmedzenie **MVP**. Nie je dôkazom dnešného prijímania MVPP ani potvrdením nášho súboru.
  Verejný katalóg schémy stále používa aj označenie pripravovaného rozhrania; aktuálny živý import treba overiť.

Kontroly používajú oficiálnu XSD a nezávislý čítač výsledného súboru, skutočné HTTP/Chrome toky,
samostatný prechod 21 → 22, súbehy, role, opravy, export a uchovanie. Osoby a potvrdenky sú syntetické.
Produkčné prijatie, obnova skutočných dát, kapacita účtovného tímu a právne/poistné/enterprise schválenia
zostávajú otvorené. Táto zmena neuvoľňuje zmluvné garancie ani spustenie pre veľkých klientov.
