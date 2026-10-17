# Zdravotné výkazy z uzavretých miezd

Stav: 17. 10. 2026, schéma **21**, pokračovanie existujúceho PR #8. Dávku 514 v textovom formáte
možno pripraviť pre Dôveru (24), VšZP (25) a Union (27) v podporovanom rozsahu bežného pracovného
pomeru. Vytvorenie súboru je stav **pripravené**. Odoslanie ani prijatie poisťovňou nepredstierame.
Výkazy Sociálnej poisťovne naďalej potrebujú odbornú externú prípravu.

## Údaje a bezpečná automatizácia

Pri uzavretí novej mzdy sa spolu s páskou uloží režim zdravotného poistenia použitý pri výpočte:
zdravotné postihnutie, uplatnenie odpočítateľnej položky a výnimka z minimálneho preddavku. Neskoršia
zmena karty zamestnanca tento historický režim nemení. Uzavreté sumy sa pri príprave dávky neprepočítavajú.
Kontrola konzistencie porovná uložené odvody s podporovanými sadzbami; nenahrádza odbornú kontrolu mzdy.

Staršie pásky bez týchto uložených údajov ostávajú na externom odbornom postupe. Migrácia nekopíruje
dnešné príznaky zamestnanca do minulosti a nevytvára chýbajúce identifikátory. Existujúce externe
pripravené a doložené výkazy, ich sumy, potvrdenky a stav zostávajú zachované.

Účtovník overí rodné číslo podľa konkrétneho podkladu, potvrdí priradenie k zamestnancovi a uvedie
referenciu overenia. Kontrolujeme formát deviatich alebo desiatich číslic bez lomky; nepreukazujeme
existenciu čísla v registri ani nevytvárame číslo z dátumu narodenia. Zahraničné a osobitné identifikátory
potrebujú externý postup. Údaj sa uloží s osobou, časom a revíziou a používa sa aj pri ďalšej príprave.
Stránka ukazuje maskovaný údaj. Príprava, oprava aj stiahnutie originálu vyžadujú čerstvé overenie prístupu.

Opravu overeného identifikátora alebo referencie podkladu vykonáva správca s dôvodom. Pôvodný záznam sa nemení. Generované výkazy
viazané na predchádzajúcu revíziu už neuzatvoria aktuálnu úlohu, termín ani odovzdanie. Originálny súbor
a potvrdenka ostávajú historickým dôkazom. Ostatné poisťovne a bežné zmeny dnešnej karty zamestnanca
neprepisujú minulý výkaz. Pri zákonnej zmene samotnej identity alebo viacerých pracovných vzťahoch musí
účtovník preveriť aj historické obdobia; toto nie je automatický model právnej platnosti identifikátora v čase.

## Príprava dávky

- Samostatná dávka obsahuje iba poistencov príslušnej poisťovne. Súhrn však pozná celkový počet
  zamestnancov zo zdrojovej uzávierky. Zastúpený zamestnanec s nulovým odvodom sa nestratí.
- Bežný preddavok zamestnanca a dopočet do minima sú v prílohe oddelené. Súhrnný zamestnanecký
  preddavok obsahuje oba. Zdravotné postihnutie má samostatné sadzby a súhrny.
- Účtovník skontroluje číslo platiteľa a pobočku podľa registrácie. Tieto čísla neodvodzujeme z IČO.
  IBAN je vlastný účet zamestnávateľa, nie príjmový účet poisťovne. Hlavička sa ponúka z nastavení
  a poslednej uloženej prípravy, ale vyžaduje novú kontrolu.
- Výslovne sa zvolí nová dávka N alebo úplná opravná dávka O a poradové číslo. Aditívnu rozdielovú
  dávku A negenerujeme. Nástupca odoslanej/prijatej/preverovanej verzie potrebuje správcu a dôvod.
- Dátum v dávke je plánované odoslanie; určený výplatný termín pochádza z uzávierky. Žiadny z nich
  nepotvrdzuje bankovú úhradu ani skutočné doručenie výkazu.
- Súbor používa UTF-8 bez BOM, oddeľovač `|` aj na konci riadka, desatinnú čiarku a jednu úplnú
  prílohu. Zachováva názov `N514rrmm.001` alebo `O514rrmm.001` pri stiahnutí aj v úplnom archíve.
  Oddeľovače, riadiace znaky, neplatné hlavičky a chýbajúce fakty nie sú ticho opravované alebo nulované.

Náhľad je viazaný na zdroj, revízie identifikátorov a stav údajov. Zmena po otvorení stránky vyžaduje
obnovenie a nové potvrdenie. Súbežná príprava uloží jednu verziu. SQL znovu preverí živú rolu/pridelenie,
aktuálnu revíziu a identifikátory pri zápise; samotné staré otvorenie stránky nezachová oprávnenie.

Podporené sú pravidlá rokov 2026/2027 a bežný pracovný pomer s doloženými dňami a stabilným režimom.
Zmeny poisťovne alebo režimu počas mesiaca, PN, materská, dohody, viac pracovných vzťahov jednej osoby,
nepeňažné alebo ďalšie príjmy a podpora v čase skrátenej práce potrebujú osobitné odborné spracovanie.
Kontrola úplnosti pokrýva aj podklady mimo aplikácie. Súbor sa pred podaním musí odborne skontrolovať.

Súhrny zdravotného výkazu aj prehľadu FS ponechávajú sumy a dátumy na jednom riadku aj na úzkom
telefóne. Dlhý názov sa zalomí v dostupnom priestore. Chrome kontroluje aj samotnú čitateľnosť hodnôt,
nie iba chýbajúci vodorovný posuvník.

## Prístup a uchovanie

Klient nemá nový formulár ani povinnosť dopĺňať identifikátory. Vlastník vidí rovnaký stav, pôvod
súboru a originál na stiahnutie. Pozvaní členovia tieto osobné mzdové údaje nedostávajú.

Generovanie uchováva presné vstupy hlavičky, zdrojový a súborový hash, verziu rozhrania, revízie
identifikátorov, osobu a čas. Úplný export zahŕňa aj históriu identifikátorov, pôvod všetkých verzií
a originály. Kontrolné súčty bránia úspešnému úplnému exportu chýbajúceho alebo poškodeného súboru.
Incidenty a právne uchovanie chránia aj nové tabuľky; riadený výmaz používa potvrdené odovzdanie
a intervenčné okno. Syntetická obnova overuje aj tieto záznamy a pravidlá SQL.

Schémy 19 a 20 sa nemenia. Schéma 21 pridáva oddelenú históriu identifikátorov a pôvodu dávok a mení
iba pomenované pravidlá aktuálnosti. SHA-256 serializovaného poľa SQL schémy 20 ostáva
`d78f2a456a90fe96aa901d77be9038acb5b072d5d4645c655e34bb7ed12235bc`.

## Primárne podklady a hranice overenia

Overené 17. 10. 2026:

- [MZ SR: vykazovanie poistného](https://www.health.gov.sk/?poistne-2023) a aktuálny
  [podklad pre rok 2026](https://www.health.gov.sk/Zdroje?/Sources/dokumenty/financovanie/vykazy_2026.rtf).
  Použitá je časť textového rozhrania dávky 514, nie časť dividendovej dávky 590. SHA-256 pôvodného RTF:
  `fc1cce5f760582ceb52ab29a040ae22863b24959d5c8b6ea53639e14073f184d`.
- [Publikovaná schéma 514-2023.xsd](https://www.health.gov.sk/Zdroje?/Sources/dokumenty/financovanie/514-2023.xsd),
  SHA-256 `1b809ecdc0f40b103ac66acf85e833b52874646c11e13dad21d83ecf9050d2c6`.
  Obsahuje rozporné obmedzenia, napríklad `xs:date` s číselným formátom bez pomlčiek a hranice
  `minInclusive = maxInclusive = 6` pri počítadlách. Tento modul preto používa explicitne opísané
  textové rozhranie; neoznačovať TXT za XML overené touto XSD.
- [VšZP: pravidlá vykazovania a dopočtu minima](https://www.vszp.sk/platitelia/platenie-poistneho/oznamenia-zmeny/zmeny-od-01-01.2023/),
  [VšZP: sadzby a minimum 2027](https://www.vszp.sk/platitelia/platenie-poistneho/oznamenia-zmeny/zmeny-od-01-01-2027/)
  a [Dôvera: aktuálna štruktúra od 2023](https://www.dovera.sk/platitel/zamestnavatel/tema-legislativne-informacie/minimalny-preddavok-zamestnanca).
  Starý návod Dôvery označený „platná od 1. 2. 2015“ nie je podkladom generátora.
- [Sociálna poisťovňa: rozhrania 2026](https://www.socpoist.sk/node/6042) majú samostatný model a ďalšie
  povinné údaje. Neboli zamieňané so zdravotnou dávkou 514 ani vydávané za implementovaný výstup.

Testy používajú syntetické osoby a potvrdenky TEST_ONLY. Nezávislý čítač kontroluje rozloženie
10/13/20/17 polí, počty, sadzby, súhrny, základ a dopočet v skutočne vytvorenom súbore. HTTP, Chrome,
migrácia, opravy, súbehy, export, uchovanie a obnova majú vlastné scenáre. Toto nie je dôkaz prijatia
živou podateľňou: pred pilotom treba overiť import a výsledný chybový protokol každej poisťovne,
zastupovanie, aktuálnu registráciu, zákonné scenáre a kapacitu služby. Produkčná obnova a právne/poistné
schválenia zostávajú otvorené; tento modul nemení zmluvné garancie ani pripravenosť veľkých klientov.
