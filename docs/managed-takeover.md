# Spravovaný prechod účtovníctva, G1

Implementácia 22. 10. 2026. Jedna služba a existujúce účtovné importy, schéma 78, ďalšia 79.
Predtým klient pripravoval list, oznamoval vlastné odoslanie a sám nahrával podklady. Teraz môže
na `/app/prechod` zadať kontakt, voliteľný požadovaný deň a potvrdiť presný rozsah koordinácie.
Ďalšiu administratívu môže prevziať pridelená účtovníčka vo Firmony.

## Práca klienta a účtovníčky

Klient vidí stav, zodpovednú osobu, termín ďalšieho kroku Firmony a prípadnú konkrétnu otázku.
Otázka je aj medzi akciami na úvodnom prehľade. Prečítaná správa nie je jej vybavenie. Kontakt
a súhlas sa neprepisujú: koordináciu možno odvolať a vedome zadať novú. Pôvodný list a nahrávanie
zostávajú v rozbaliteľnej osobnej alternatíve; staré odkazy fungujú.

Účtovníčka má frontu na `/ucto` a prípad v `/ucto/klienti/:id/prevzatie`, vedľa pôvodných importov.
Prevezme zodpovednosť, určí ďalší termín a zapíše overené oprávnenie s podkladom. Systém pripraví
text žiadosti. Ten odosiela človek po overení oprávnenia; aplikácia neposiela externému účtovníkovi
automatický e-mail alebo výpoveď. Záznam kontaktovania potrebuje skutočný dátum a konkrétny dôkaz.
Pripravený text, odoslanie, prijatie podkladov a ich úplnosť sú rozdielne udalosti.

Prijaté súbory môže nahrať priamo účtovníčka bez preposielania cez klienta. Nahratie samo neimportuje
údaje ani nevytvorí účtovný zápis. Používajú sa existujúce parsery a odborné potvrdenia. Mimoriadne
historické opravy, cudzie náklady a úkony mimo dohodnutej služby potrebujú predchádzajúcu dohodu.
Ceny, slogan, účtovné jadro a predzmluvné AML/release brány sa nemenia.

## Keď je potrebný klient

Nová alebo zmenená neprázdna otázka účtovníčky uloží aj stručný e-mailový zvonček pre aktuálnych
členov firmy. Telo obsahuje iba všeobecné upozornenie a odkaz. Samotná otázka, meno, kontakt ani
podklady sa do e-mailu nekopírujú. Aktuálny prípad je zdroj pravdy; zrušená alebo už vybavená otázka
sa starým odkazom neoživí. Nezmenená otázka neposiela ďalšie upozornenie pri každej úprave prípadu.

Zápis prípadu, nemenná história a outbox sú jedna D1 transakcia. `changes()` nad predchádzajúcim
UPDATE chráni pred upozornením po prehratom súbehu. Chyba vloženia outboxu vráti späť aj zmenu
prípadu a úspešnú históriu. Neistá transportná odpoveď žiada obnoviť skutočný stav pred opakovaním.
Jedinečný kľúč používa prípad, novú revíziu a člena. Existujúce odosielanie sa spustí až po úspešnom
zápise a opakuje sa pôvodnou službou; uloženie nie je potvrdenie doručenia do schránky.

`/app/prechod/otazka?ziadost=ID` znovu overí členstvo a klientsky prístup. Cudziemu používateľovi
neukáže firmu ani otázku. Ak je aktívna iná vlastná firma, najprv ukáže jej názov a vyžiada
výslovné prepnutie existujúcim POST formulárom. GET nemení firmu iným otvoreným formulárom.
Pri správnej firme odkaz otvorí aktuálnu koordináciu. Po výslovnom prepnutí sa otvorí prehľad
so skutočnou zostávajúcou úlohou. Odhlásenému klientovi sa tento konkrétny povolený cieľ prenesie
cez emailové prihlásenie a vedomé potvrdenie mailbox odkazu. Všeobecné prihlasovanie neprijíma
ľubovoľnú návratovú adresu. Passkeys tímu, kontrola čerstvého prístupu a ochrana POST zostávajú.

## Stavy a dôkaz dokončenia

`requested → coordinating → waiting → reviewing → completed`. Kontrola sa môže vrátiť na chýbajúce
podklady alebo do koordinácie. Dokončený prípad možno znovu otvoriť s dôvodom; pôvodný výsledok
zostane v histórii. Odvolaný prípad sa neobnovuje starým formulárom ani starým ID súhlasu.

Dokončenie potrebuje sedem posúdených oblastí: knihy/predvaha, otvorené položky, banka/pokladnica,
majetok/zásoby, mzdy, podania a nadväznosť počiatočných stavov. Každá má záznam kontroly; prevzatá
oblasť aj odkaz na uložený originál tejto firmy. Nepoužitá oblasť potrebuje dôvod. Knihy sa nedajú
vynechať. Prevzaté počiatočné stavy musia existovať v knihe. Originály sa kontrolujú aj v R2 podľa
dostupnosti a veľkosti, nie automaticky podľa správnosti obsahu alebo podpisu. Zmena podkladov od
otvorenia formulára odmietne dokončenie. Výsledok uchováva zoznam súborov a uložené počiatočné zápisy
v čase potvrdenia. Nevybavená požiadavka na klienta dokončenie blokuje.

Nie je to univerzálny životný cyklus všetkých otázok z J2. Tu otázku výslovne zapisuje a po vybavení
ruší účtovníčka. Ani ukončené prevzatie nepotvrdzuje všetky budúce povinnosti firmy.

## Oprávnenia, história, export a uchovávanie

Žiadosť aj odvolanie zadáva iba vlastník firemného účtu po overení čerstvého prístupu. Rola účtu
nenahrádza dôkaz štatutárneho oprávnenia. Server znovu kontroluje session, firmu, pridelenie, aktívnu
službu a verziu. Súbežne odvolaná koordinácia odmietne aj rozpracovaný zápis prijatého súboru.
Jedna firma má najviac jeden neodvolaný prípad. ID odoslania a databázová podmienka chránia súbeh.
Úspešná zmena vytvorí v tom istom SQL kroku nemennú históriu s osobou, časom a úplným stavom.
Starší formulár neprepíše novší; neúspešný pokus nevytvorí úspešnú revíziu.

Celý opakovaný súborový upload nie je globálne deduplikovaný. Pri čiastočnom zlyhaní sa zobrazia
uložené súbory a zopakujú sa iba chýbajúce. Základná kontrola súborov predchádza uloženiu dávky.
Klientsky jednoduchý pohľad neukazuje odborné referencie oprávnenia a kontaktovania; obchodná
história koordinácie je súčasťou úplného exportu. Interné AML oznámenia patria do oddelenej agendy.

Nové záznamy používajú existujúci režim: klientovo sťahovanie 90 dní, potom iba určená osoba cez
zákonný archív. Prípady a história sa nemažú pri prevádzkovej očiste, až pri riadenom konečnom výmaze
zákonných záznamov. Blokácie a otvorené incidenty platia ďalej. Zmena koordinácie zvyšuje revíziu
dát a zneplatní staré potvrdenie úplnosti exportu.

## Originály prečítané 22. 10. 2026

- [Občiansky zákonník, aktuálne znenie od 31. 7. 2026](https://static.slov-lex.sk/static/SK/ZZ/1964/40/20260731.html),
  §§ 31 až 33b a 40: rozsah, forma, prekročenie a odvolanie zastupovania. Žiadosť nepredstiera overené
  všeobecné plnomocenstvo, kvalifikovaný podpis ani automatické ukončenie cudzej zmluvy. Konkrétny
  úkon a jeho formu pred použitím posúdi zodpovedný odborník a advokát.
- [Zákon o účtovníctve, znenie od 1. 6. 2026](https://static.slov-lex.sk/static/SK/ZZ/2002/431/20260601.html),
  §§ 5 a 8: poverenie neodstraňuje zákonnú zodpovednosť firmy; preukázateľnosť knihy ostáva potrebná.
- [AML zákon, znenie od 17. 8. 2026](https://static.slov-lex.sk/static/SK/ZZ/2008/297/20260817.html), § 19:
  nadväzuje na pôvodný režim programu; nový workflow neobchádza predzmluvné overenie ani uchovávanie.
- [D1 batch](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch): transakčné dávky;
  nové triggery a revízne podmienky spájajú jediný úspešný zápis s dôkazom.
- [SQLite changes](https://www.sqlite.org/c3ref/changes.html): iba predchádzajúci top-level zápis,
  bez zmien jeho triggerov. Použité pre transakčný zvonček.
- [D1 limity](https://developers.cloudflare.com/d1/platform/limits/): LIKE/GLOB majú 50 bajtov;
  testy identifikátorov používajú porovnanie prefixu cez substr, nie dlhý LIKE vzor.

## Overenie a ďalší krok

`test/managed-takeover.runtime.mjs` ovláda skutočný Worker/D1/R2: súbeh, prístup, stavy, zdroje,
odvolanie, export a konečný výmaz; aj rollback outboxu, súbeh otázok, súkromie, login a výber firmy.
SHA-256 stráži prvých 77 nezmenených schém; tento doplnok nemení už nasadený krok 78.
`test/managed-takeover.browser.mjs` skúša reálne klientské a tímové formuláre, labely, mobil,
upload a odvolanie; tri nové stavy sú aj v povinnej UI sade. Všetky povinné kontroly presnej
finálnej revízie a následné živé nasadenie sa evidujú v PR. Lokálna TS6 nenahrádza `npm run check` v CI.
Production verification preveruje aj presný verejný `/inside.css` oproti zostaveniu, popri pôvodných nástrojoch.

Právny release, platné zastupovanie a skutočné prevzatia sa kódom nepotvrdzujú. Pilot ostáva päť
reálnych prechodov: aktívny čas oboch rolí, kontakty, podpisy, chýbajúce podklady a čas do kontroly.
