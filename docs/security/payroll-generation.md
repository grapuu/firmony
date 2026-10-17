# PREHLADv26 a odborné priradenie obdobia

Stav: 16. 10. 2026, schéma **20**, pokračovanie existujúceho PR #8. Tento krok opravuje príliš
zjednodušený predpoklad schémy 19, že vykazované obdobie FS možno vždy automaticky prevziať z mesiaca
bankovej výplaty. Nepoužívať tento starší predpoklad ako účtovné pravidlo.

Nadväzujúca schéma 21 pridáva [textové zdravotné výkazy 514](health-reporting.md). Tento dokument
naďalej opisuje samostatný formát FS PREHLADv26; nejde o spoločnú alebo zameniteľnú dávku poisťovní.
Schéma 22 osobitne pridáva [MVPP 2026 pre SP](social-reporting.md) s overenými právnymi vzťahmi a hodinami.

## Obdobie nie je dátum bankového prevodu

FS v konkrétnych príkladoch uvádza februárový prehľad s marcovým dátumom výplaty. Formulár má osobitne
vykazované obdobie a dátum na riadku 1. Zároveň sa v návodoch a pri rôznych druhoch príjmov objavujú
odlišné formulácie. Tieto údaje preto aplikácia nezlučuje do jedného automaticky odvodeného mesiaca.

Účtovník samostatne overí skutočnú výplatu a vykazované obdobie podľa konkrétneho prípadu. Záznam
obsahuje oba údaje, referenciu, osobu a čas. Zmena už potvrdených údajov vyžaduje správcu a dôvod;
pôvodný záznam sa nemení. Príjmy s rovnakým overeným obdobím patria do jednej povinnosti. Lehota sa
počíta z tohto obdobia, nie z automatického posunu podľa banky. Výkaz nepreukazuje úhradu dane.

Migrácia nemení staré fakty výplaty ani originály podaní. Staršie priradenia dostanú neoverené obdobie
(`report_period = NULL`), ktoré treba výslovne preveriť. Ich prijaté potvrdenky ostávajú v histórii;
neuzatvoria aktuálne dokončenie ani neumožnia zmrazenie na odovzdanie. Celý pôvodný krok 19 zostáva
nezmenený; overený SHA-256 jeho serializovaného poľa SQL je
`1d22f406cada72ce9dda6640d74e86f870afa46ed6312657fd3d9f1846874d1e`.

Ak sa po oprave obdobia ukáže nesprávne založená povinnosť bez priradených príjmov, správca môže
zaznamenať odborné vyriešenie. Musí preveriť všetky príjmy aj skutočné externé podania. Pri už
evidovanom odoslaní potrebuje pôvodný podklad k vyriešeniu. Tento úkon nepodáva, neruší ani neodvoláva
nič na FS a nepredstiera prijatie výkazu. Odstráni iba nesprávnu úlohu z pracovného zoznamu; všetky
dôkazy zostávajú. Nové priradenie príjmu povinnosť znovu aktivuje bez obnovenia starej platnosti.
Rozhodnutie je viazané aj na históriu priradení a revízie podaní. Návrat k prázdnym podkladom
po ďalšom presune príjmu ani dodatočný externý dôkaz nesmú znovu použiť staré vyradenie; potrebujú
nové odborné vyriešenie.
Nevytvárať náhradný nulový výkaz ako spôsob odstránenia chybnej evidencie.

## Podporované generovanie

Príprava je určená pre bežné mzdy slovenskej s. r. o., pravidlá rokov 2026/2027 a PREHLADv26.
Uzavreté pásky musia byť úplné a konzistentné, výplaty overené a vykazované obdobie odborne potvrdené.
Generátor podporuje rovnaké mzdové a vykazované obdobie a výplatu v tomto alebo nasledujúcom mesiaci.
Používa presné uložené centové sumy; uzavretú mzdu neprepočítava novými pravidlami.

- Pred vyhotovením musí uplynúť vykazovaný mesiac. Neoverené výplaty relevantných uzávierok blokujú
  prípravu. Chýbajúce údaje, neznáme roky alebo rozporné pásky sa nenahrádzajú nulami.
- Riadky 0 a 1 vychádzajú zo zdroja. Dátum riadku 1 je posledný overený dátum príslušných výplat.
  Ďalšie časti nie sú doplnené odhadom; odborník výslovne potvrdzuje, že sa neuplatnia.
- Účtovník skontroluje hlavičku, zvolí riadny alebo opravný prehľad a podávateľa. Opravný prehľad potrebuje
  dátum zistenia. Ďalšia verzia potrebuje dôvod a pri predchádzajúcom odoslaní/prijatí/preverení aj správcu.
- Zastúpenie europio sa nepredpokladá automaticky. Vyžaduje skontrolovanú plnú moc; iné zastúpenie,
  dedičstvo a konkurz nie sú podporované. Priamy podávateľ znamená spoločnosť, nie udelenie nových práv.
- Povinná odborná kontrola pokrýva všetky príjmy aj podklady mimo aplikácie. Bonusy, RZ dane, RZZP,
  zahraničné/nepeňažné príjmy, dodatočné zrážky, preplatky, doplatky z iných období a žiadosti o vrátenie
  ostávajú v externom odbornom postupe. Generátor nesmie obísť tieto obmedzenia.

Kontrola, súbor, zdrojový hash, presné vstupy, verzia formátu/XSD, osoba a čas sa uložia spolu v jednej
transakcii. Zmena od otvorenia formulára zruší platnosť náhľadu; vstupy ostanú na opravu a kontrola sa
musí potvrdiť znova. Súbežné požiadavky vytvoria jednu verziu. Práva a plná moc sa kontrolujú aj pri zápise.
Uloženie vytvorí stav **pripravené**, nie odoslané. Nasleduje odborné overenie/import na portáli FS a
existujúci tok samostatnej potvrdenky. Pravý podpis ani výsledok podateľne automaticky neoverujeme.

Klient má rovnaký stav a dostupný originál bez prípravných formulárov. Úplný export obsahuje aj doklady
generovania, odborné vyriešenia a ich originály s hashmi. Incidenty, uchovanie, zmrazenie a riadený výmaz
sa vzťahujú na nové záznamy. Syntetická obnova zahŕňa nové tabuľky a ochranné SQL pravidlá.

## Overenie a primárne zdroje

- [Oficiálna XSD prehlad2026.xsd](https://ekr.financnasprava.sk/Formulare/XSD/prehlad2026.xsd), získaná
  16. 10. 2026 cez [katalóg FS](https://www.financnasprava.sk/sk/danovi-a-colni-specialisti/technicke-informacie/podklady-pre-tvorcov-sw/xsd-schemy).
  Nezmenený súbor je v `test/xsd/prehlad2026.xsd`, SHA-256
  `df44ab4383bf2900967eb57a2114622e6ec429bd828e1f7394292c0948dcc2ba`.
- [Oficiálny eForm PREHLADv26](https://pfseform.financnasprava.sk/Formulare/eFormVzor/INE/form.624.html)
  a jeho [mapovanie XML](https://pfseform.financnasprava.sk/Formulare/eFormVzor/INE/Scripts/form.624.xmlfdf.js).
  Overené poradie prvkov, právna forma, formát dátumov a obmedzenia vstupov. SHA-256 načítaného mapovania:
  `ddab480d35ba1e23ffdfffa6cb417641490354a90878e8da1ba14c1ddcdec8b3`.
- [FS: mesačné prehľady, najmä otázka 12](https://podpora.financnasprava.sk/879943-Pod%C3%A1vanie-mesa%C4%8Dn%C3%BDch-preh%C4%BEadov)
  a [poučenie](https://pfseform.financnasprava.sk/Formulare/Poucenia/PREHLADv26-poucenie.pdf):
  oddelené obdobie a dátum výplaty, riadky a potreba úplného príjmového rozsahu.
- [FS: nové poučenie z marca 2026](https://www.financnasprava.sk/_img/pfsedit/Dokumenty_PFS/Zverejnovanie_dok/Dane/Novinky_leg/Priame_dane_uct/2026/2026.03.19_007_DZPaU_2026_I_New_pouc.pdf)
  upozorňuje na zmenu osobitného riadku 1b; táto agenda nie je súčasťou podporeného generátora.

Testy overujú XML nezávislou oficiálnou XSD, povolené/nepodporované prípady, skutočný HTTP/Chrome tok,
súbehy, odobratie oprávnení, uchovanie a prechod skutočne rekonštruovanej schémy 19 do 20. Súbory sú
syntetické; potvrdenky sú označené **TEST_ONLY**. Validácia XSD nepreukazuje prijatie podateľňou ani vecnú správnosť všetkých
údajov. Pred pilotom zostáva skúška importu na FS a odborné potvrdenie vykazovacích scenárov vrátane
oneskorených výplat a prelomu roka. Produkčná obnova a právne/poistné schválenia zostávajú otvorené.
