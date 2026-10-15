# Zodpovednosť Firmony a prijímanie väčších klientov

Pracovný stav **15. 10. 2026**. Rozhodnutie: **NO-GO pre aktiváciu novej garancie a automatické podpisovanie**, kým nižšie uvedené dôkazy nie sú schválené. Toto je konkrétna predpríprava pre advokáta, účtovného garanta a poisťovacieho sprostredkovateľa, nie ich stanovisko, potvrdenie poistného krytia ani ponuka klientovi.

Firmony má niesť následky vlastnej chyby a vedieť ich finančne uniesť. Sľub absolútnej bezrizikovosti by nepomohol klientovi ani nám. Klientovi predáme prevzatú prácu, overiteľné kontroly a vymáhateľný záväzok, ku ktorému existujú peniaze a jasný postup pri probléme.

| Podklad | Čo je pripravené |
|---|---|
| [Právny rámec a konkurencia](01-law-and-competition.md) | Primárne zdroje, rozdiel medzi verejnou a zmluvnou zodpovednosťou, sporné limity |
| [Zmluvný model pre advokáta](02-contract-and-claims.md) | Rozsah, náhrada, ochrana pred zneužitím, proces udalosti, scenáre |
| [Krytie a finančná kapacita](03-insurance-and-capacity.md) | Zadanie na upisovanie rizika, výluky, stresové scenáre a financovanie |
| [Klienti, prevádzka a implementácia](04-intake-and-release.md) | Individuálna cesta pre väčšie firmy, brány, obsluha nového kódu a jeho limity |
| [Register dôkazov](readiness.json) | Menovité dôkazy, ktoré ešte chýbajú; prázdny údaj nie je schválenie |

## Konkrétna zmena oproti pôvodnému stavu

Pôvodné podmienky 2026-10-13 viazali náhradu sankcií na **výlučnú** chybu Firmony a predvídateľnú škodu opisovali ako 12 mesačných poplatkov. Samotný tento text neposkytuje presvedčivú ochranu veľkému klientovi. Nový **návrh** 2026-10-15 pracuje so zákonnou zodpovednosťou, príčinnou súvislosťou, nápravou a náhradou preukázanej škody bez tohto paušálneho stropu. Nezavádza sľub neobmedzenej garancie všetkých sankcií. Individuálny limit alebo širšia garancia vyžadujú osobitne odsúhlasený dodatok a finančné posúdenie. Pôvodné zmluvy sa spätne nemenia.

Doteraz sa ukladalo číslo verzie podmienok a základná cena, ale stránka aj ZIP zobrazovali aktuálny text. To bol nesprávny podklad pre dôveru aj riešenie sporu. Nové prijatie ukladá celý text, všetky ponúkané tarify, konkrétny balík, objednávku, klienta, podpisujúceho, čas a schválenia. Záznam je pri bežných databázových operáciách nemenný a kontroluje sa SHA-256. **Nie je to kvalifikovaný elektronický podpis, nezávislá časová pečiatka ani archív odolný proti administrátorovi databázy.**

Archív 2026-10-13 je rekonštrukcia verzie z repozitára, výslovne označená ako taká. Nevytvárame chýbajúci dôkaz historického súhlasu. Neznáma verzia sa nenahrádza dnešnou. Úprava opravuje aj príliš silné tvrdenie o uloženom znení v predchádzajúcej produktovej analýze.

## Čo nepovažujeme za vybavené

Nemáme doloženú poistnú zmluvu, pripoistenie garancie, schválenie advokáta, veľkosť rezervy, produkčnú obnovu, odbornú kapacitu ani akceptáciu klienta. Správca môže do systému zapísať referenciu na posúdenie; systém neoverí jeho vecnú pravdivosť. Dôkazy musia existovať mimo samotných polí formulára a musí ich schváliť zodpovedná osoba.

Používateľ uviedol príležitosti s obratom približne 2 mil. € a 45 mil. €. Nejde o potvrdených klientov ani overené finančné dáta. Obrat neurčuje poistný limit, kategóriu ani cenu. Nepoužívame odhad pravdepodobnosti získania klienta ako vstup do finančného plánu.
