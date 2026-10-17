# Jeden systém, minimum práce klienta

Spresnenie zadania majiteľa z 15. 10. 2026. Toto sú konkrétne produktové kritériá a stav implementácie,
nie vyhlásenie o pripravenosti celej služby. Obe pracoviská používajú rovnaké firmy, originály dokladov,
platby, účtovné zápisy a históriu; `/app` a `/ucto` majú rozdielne oprávnenia a úlohy.

## Čo má robiť človek

| Situácia | Klient | Automatizácia | Účtovník |
|---|---|---|---|
| Nový doklad | Pošle doklad, ak nepríde automaticky | Originál, hash, XML/OCR, návrh kategórie, pravidlo dodávateľa, hľadanie duplicít a úhrady | Overí účtovný a daňový obsah, schváli alebo opraví návrh |
| Nejasný vstup | Odpovie iba na potrebnú obchodnú otázku | Zachová originál; neistotu nezamení za potvrdený fakt | Najprv preverí dostupné podklady a položí konkrétnu otázku |
| Platba | Potvrdí súhlas s bankou; rieši skutočne chýbajúci podklad | Priebežné čítanie a párovanie po aktivácii bankovej služby | Rieši výnimky a kontrolu účtovania |
| Daňová povinnosť | Dostane vysvetlenie a platobné údaje; vykoná potrebnú úhradu | Výpočet/podklady, interný stav a termíny v podporovanom rozsahu | Kontrola, oprávnené externé podanie a jeho dôkaz |
| Zmena služby / odovzdanie | Jasná informácia a prenosný archív | Evidencia prevzatia, ochrana dát a riadená retencia | Kontrola úplnosti a riešenie výnimiek |

V prvom riadku je **implementované navrhovanie s odborným potvrdením**, nie preukázaná 99 % autonómia.
Práca účtovníka sa nesmie považovať za prácu AI len preto, že na začiatku prebehlo OCR. Zodpovednosť
za odbornú kontrolu sa neprenáša na klienta cez neurčité „schváliť všetko“.

## Opravené prekážky v tejto iterácii

- Rovnaké číslo a suma už samy neoznačia faktúry rôznych dodávateľov za duplicitu. Rozdielne známe IČO
  majú prednosť pred podobným názvom; chýbajúcu identitu nedopĺňame domnienkou. Bez eKasa kódu rozdielne
  známe dátumy chránia aj opakovane použité čísla bločkov. Výsledok zostáva návrhom na kontrolu.
- Duplicita sa môže odvolávať len na skoršie vložený doklad. Zhodný čas v sekundách rozlišuje poradie
  vloženia v databáze. Kontrola spoločnej dávky preto nevytvorí vzájomné odkazy a nezablokuje prvý originál.
  Keď OCR staršieho originálu skončí neskôr, znova preveríme novšie nezaúčtované kópie. Vyhľadávanie
  kandidátov zostáva ohraničené na 50 v každom smere; nejde o záruku nájdenia každej duplicity.
- Výstup OCR odmieta neexistujúce kalendárne dátumy a hodnoty zdedené z prototypu objektu ako účtovné
  kategórie či typy. Poškodená štruktúra odpovede ide na manuálne spracovanie bez výnimky v procese čítania.
- Opätovné overenie prístupu vracia zablokovanú zmenu na existujúcu pracovnú stránku. Zachová účtovné
  obdobie len z tej istej stránky na našej adrese. Pôvodný POST sa automaticky neopakuje. Pri správe kľúčov
  sa zobrazí zrozumiteľná stránka s funkčným overením namiesto surovej JSON chyby.

## Doplnené 16. 10. 2026

[Samostatná evidencia podaní](../security/filing-evidence.md) už oddeľuje pripravené XML, evidované odoslanie,
odborníkom skontrolované prijatie, odmietnutie a preverovanie. Klient má rovnaký prehľad bez povinnosti
spravovať potvrdenky. Spoločný pracovný zoznam účtovníka ukáže aktuálne nedokončené dokumenty aj zo starších
období. Toto je manuálne doloženie výsledku, nie aktivovaná integrácia s podateľňou. Mzdové potvrdenia
po jednotlivých príjemcoch a všetky zmiešané scenáre opráv zostávajú otvorené.

## Čo ešte musíme preukázať alebo dopracovať

| Priorita | Konkrétna práca | Dôkaz dokončenia |
|---|---|---|
| 1 | Reálne prejsť účet klienta a účtovníka na podporovaných prípadoch od onboarding-u po uzávierku | Nezávisle skontrolované účtovné výsledky, čas a počet zásahov; odstránené blokujúce chyby |
| 2 | Aktivovať a overiť produkčné bankové spojenia a chybové stavy súhlasov | Získané transakcie, zosúladenie s výpisom, opakovaný pokus bez duplicít; žiadna potreba bežného ručného importu |
| 3 | Doplniť dôkaz prijatia externého podania a certifikované doručovanie eFaktúr | Podanie/doručenie potvrdené príslušným systémom, odmietnutie viditeľné a riešené; samotné XML ani interné označenie „podané“ tento dôkaz nenahrádza |
| 4 | Overiť obnovu skutočných záloh databázy aj originálov | Izolovaná obnova, kontrola úplnosti, prístupov a nameraného času; existujúci syntetický test nestačí |
| 5 | Uzavrieť odborné kapacity, zmluvný rozsah a poistné dojednanie | Písomné schválenie konkrétneho rozsahu a platné krytie; evidované v podmienkach uvoľnenia podpisovania |

Tieto položky nepredstierajú aktivované externé služby ani hotový softvér pre komplexné veľké spoločnosti.
Pokrytie majetku/odpisov, zložitých miezd a ďalších režimov je v [mape medzier](03-product-gap-analysis.md).
Začatie práce pre väčšiu firmu vyžaduje individuálne posúdenie, nie iba vyšší cenový balík.

## Ako vyhodnotíme „minimum práce“

V pilotnej vzorke oddelene meriame čas klienta, počet jeho nevyhnutných otázok/úkonov, čas účtovníka,
podiel návrhov prijatých bez opravy, chybné párovania/duplicity, neodhalené chyby a čas vyriešenia výnimky.
Menovateľom je konkrétna podporovaná agenda a obdobie. Nové alebo komplikované scenáre vykazujeme osobitne.
Automatizačné percento bez takejto vzorky nemáme. Toto je plán merania, nie už implementovaný analytický modul.

Testy v tejto iterácii používajú syntetické podklady a náhradné externé služby. Skutočný prehliadač overuje
opätovné overenie a bezpečný návrat k pracovnej akcii; tým sa nepreukazuje presnosť živého modelu ani celý
produkt bez chýb. Širšie kritériá uvedené v [release pláne](README.md) zostávajú otvorené.
