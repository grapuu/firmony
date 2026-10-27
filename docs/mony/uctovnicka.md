# Návod pre účtovníčky

Podklady asistenta Mony pre účtovníčky (27. 10. 2026). Opisuje pracovný postup v časti pre tím (/ucto). Podrobnosti
jednotlivých oblastí (DPH, kniha, závierka, mzdy) sú v pracovných poznámkach, ktoré Mony dostane k otázke.

## Orientácia

- Časť pre tím je na /ucto. Menu: Klienti (/ucto), Termíny (/ucto/terminy), Na zaúčtovanie (/ucto/doklady), Správy (/ucto/spravy), Podania (/ucto/podania), Výkaz práce (/ucto/vykaz), Presnosť AI (/ucto/ai).
- Účtovníčka vidí iba firmy, ktoré má pridelené. Správca vidí všetky a navyše žiadosti z webu, tím, fakturáciu Firmony a analytiku.
- Rozdelenie práce: softvér zbiera doklady a výpisy, číta ich, páruje platby, navrhuje zaúčtovanie, počíta knihy, DPH, mzdy a závierku a pripravuje súbory na podanie. Účtovníčka kontroluje a potvrdzuje, rieši neštandardné prípady, podáva pod plnou mocou a odpovedá klientom na odborné otázky.
- Všetko je v jednom systéme Firmony. Pohoda, Omega ani iný program netreba.
- Prihlásenie: prihlasovací kľúč (odtlačok, tvár, PIN), jedným dotykom na /app/prihlasenie, rovno do /ucto. Tím potvrdzuje kľúč najviac raz za 12 hodín, citlivé kroky (napríklad balík podaní) chcú dotyk z posledných 5 minút. Prvý kľúč nového člena tímu sa aktivuje kódom od správcu, ktorý odovzdá mimo e-mailu.

## Denná práca

1. Klienti (/ucto): pri každom klientovi je vidieť, čo čaká: doklady na zaúčtovanie, platby na kontrolu, nezodpovedané správy, platby bez dokladu u klienta. Zelená fajka znamená, že u klienta nič nečaká.
2. Termíny (/ucto/terminy): všetky lehoty všetkých klientov na jednej obrazovke. Skupiny Po termíne, Do 7 dní, Do mesiaca, Neskôr. Filter podľa toho, čia je úloha: naša alebo klientova. Každý riadok vedie tam, kde sa úloha robí.
3. Na zaúčtovanie (/ucto/doklady): fronta dokladov všetkých jej klientov, najstaršie prvé.
4. Správy (/ucto/spravy): klienti, ktorí čakajú na odpoveď, najdlhšie čakajúci prví. Sľub klientom: odpoveď do jedného pracovného dňa.

## Zaúčtovanie dokladu

- Obrazovka dokladu (/ucto/doklady/:id): vľavo originál, vpravo formulár s tým, čo prečítala AI, a zaúčtovanie MD a D, ako ho bude mať kniha.
- Polia: druh, kategória (s účtom), dodávateľ, IČO, číslo, dátumy, sumy, DPH, variabilný symbol, iný účet, stredisko. Pre platiteľa DPH „Odpočítať DPH“ a časť DPH (režim, deň dodania, IČ DPH, opravovaný doklad, obdobie, základ a daň podľa sadzieb).
- „Zaúčtovať a ďalší“ zaúčtuje a otvorí ďalší doklad klienta. „Uložiť bez zaúčtovania“ uloží rozpracované. „Zahodiť doklad“ pre duplikát alebo niečo, čo nie je doklad.
- „Zapamätať pre dodávateľa“ vytvorí pravidlo: ďalšie doklady toho dodávateľa dostanú rovnakú kategóriu a odpočet. Pravidlo sa hneď použije aj na čakajúce doklady.
- Zaúčtovaný doklad sa dá zmeniť alebo odúčtovať, nikdy zmazať. Zmenu v uzamknutom období treba najprv otvoriť (Kniha, Obdobia).
- Možný duplikát aplikácia označí sama (bloček z eKasy podľa kódu, inak podľa čísla a sumy). Kód eKasy sa dá overiť na finančnej správe odkazom pod originálom.
- Platbu k dokladu možno priradiť z ponúknutých kandidátov.
- Systém meria čas od otvorenia po zaúčtovanie; Výkaz práce ukazuje medián minút na doklad.

## Účtuje samo

- Zapína ho účtovníčka pre konkrétneho klienta na jeho stránke („Účtuje samo“). Zaúčtuje hneď, čo je pripravené, a potom pri každom behu plánovača.
- Zaúčtuje sám iba doklad, kde všetko sedí: pravidlo dodávateľa použité aspoň dvakrát, prijatá faktúra alebo bloček, bežný náklad (materiál, palivo, energie, opravy, cestovné, služby, poplatky, poistenie, banka), najviac 1 700 €, v eurách, nie duplikát ani oprava, presne jedna banková platba rovnakej sumy, deň nie v budúcnosti a nie pred začiatkom kníh; u platiteľa DPH len tuzemský nákup, kde návrh sedí a obdobie nie je podané.
- Takto zaúčtované doklady za posledný mesiac sú na stránke klienta na kontrolu. Ostatné čakajú vo fronte ako doteraz.

## Stránka klienta (/ucto/klienti/:id)

- Na zaúčtovanie, platby bez dokladu na kontrolu („V poriadku“ alebo „Vrátiť klientovi“ so správou), chýbajúce doklady u klienta („Pripomenúť klientovi“), správy s odpoveďou, výpisy z banky, ktoré nenadväzujú („Zaúčtovať aj tak“ alebo „Nezaúčtovať“).
- Údaje firmy: DIČ, IČ DPH, registrácia pre DPH (neregistrovaná, platiteľ, § 7a), mesačné alebo štvrťročné obdobie, daňový úrad, osobný daňový účet, poznámka pre tím.
- Odkazy na DPH, Knihu, Závierku, Mzdy, Prevzatie, Identifikáciu a riziko, Podania a Mzdové podania tohto klienta.
- Zmluva a plná moc: nahratú plnú moc označí „Overená a podaná“, chybnú vráti klientovi s dôvodom.

## DPH (/ucto/klienti/:id/dph)

- Obdobia vedľa seba so stavom: beží, treba vyriešiť, pripravené, podané, zmenené po podaní.
- „Treba vyriešiť“ vymenuje každú prekážku s odkazom na doklad (nezaúčtovaný doklad, chýbajúce IČ DPH dodávateľa, dobropis bez pôvodnej faktúry a podobne).
- Pripravené obdobie: stiahnuť priznanie a kontrolný výkaz ako XML, nahrať v eDane („Načítať zo súboru“), skontrolovať, podpísať a odoslať pod plnou mocou, potom „Označiť ako podané“. Klient dostane správu, čo a kedy zaplatiť, s QR kódom na stránke Dane.
- Zmena po podaní: pred termínom opravné priznanie, po termíne dodatočné (aplikácia vypočíta rozdiel a pýta deň zistenia). Kontrolný výkaz opravný alebo dodatočný iba so zmenenými riadkami.
- Súhrnný výkaz, OSS (/dph/oss), Intrastat (/ucto/klienti/:id/intrastat), koeficient (/dph/koeficient) a nevymožiteľné pohľadávky podľa § 25a (/dph/nevymozitelne) sú na stránkach DPH klienta.
- Nadmerný odpočet sa prenáša do ďalšieho obdobia; pri splnení podmienok § 79 ods. 2 sa dá žiadať o vrátenie hneď (políčko v priznaní).

## Kniha (/ucto/klienti/:id/kniha)

- Predvaha s tým, čo bráni úplnosti kníh, a porovnaním banky s knihou. Denník, účet (hlavná kniha), saldokonto, platby bez dokladu (účet sa dá zadať), interné doklady, počiatočné stavy, majetok a odpisy, sklad, uzamknutie období (/kniha/obdobia).
- Knihy sa počítajú z dokladov, platieb, miezd a podaní vždy nanovo, nemôžu sa rozísť s podkladmi.
- Súbory pre Excel: denník, hlavná kniha, predvaha, saldokonto.

## Mzdy (/ucto/klienti/:id/mzdy)

- Zamestnanci (pracovný pomer, dohody, konatelia, dôchodcovia, študenti), mesiac s príjmami, PN, dovolenkou, nadčasmi, stravným a exekúciami, výplatná páska, uzavretie mesiaca (zaúčtuje mzdy a klientovi pošle, čo a komu zaplatiť), ročné zúčtovanie (/mzdy/rocne), zrážky (/mzdy/zrazka).
- Mzdové podania (/ucto/klienti/:id/mzdove-podania): výkaz do Sociálnej poisťovne, oznámenie zdravotným poisťovniam (514) a prehľad o preddavkoch (PREHLAD) ako súbory; po podaní na portáli sa nahrá potvrdenka.
- Prihlášky a odhlášky zamestnancov sa robia na portáloch poisťovní a zaznačia na stránke Mzdy.

## Závierka (/ucto/klienti/:id/zavierka)

- Súvaha a výkaz ziskov a strát (mikro aj malá a veľká účtovná jednotka), poznámky ako PDF, daňové priznanie právnickej osoby ako XML, odložená daň, rozdelenie zisku.
- Účtovníčka dopĺňa odborné úpravy (pripočítateľné a odpočítateľné položky, daňové odpisy, straty, rezervy) a potvrdzuje body poznámok, ktoré vie len ona.
- „Zaúčtovať daň“, súbory na podanie, „Označiť ako podané“. Klient dostane správu, koľko zaplatiť a aké preddavky ho čakajú.

## Podania naraz (/ucto/podania)

- Fronta všetkých nepodaných podaní jej klientov. „Podanie jedným balíkom“ stiahne ZIP so všetkými súbormi na podanie po úradoch a firmách; po podaní sa čísla a potvrdenky zaznačia naraz.
- Podanie sa nepovažuje za prijaté, kým nie je zaznačená potvrdenka.

## Nový klient a prevzatie

- Prevzatie (/ucto/klienti/:id/prevzatie): načíta predvahu, otvorené položky, majetok a zamestnancov zo súborov Pohoda, Omega, Money, KROS alebo Excel. Účtovníčka skontroluje a uloží počiatočné stavy.
- Spravovaný prechod: ak klient poverí Firmony koordináciou, prípad je na stránke prevzatia so stavmi, oprávnením a kontrolným zoznamom.
- Identifikácia a riziko (/ucto/klienti/:id/aml): vyhlásenie klienta, jeho overenie a riziko. Rozhoduje určená osoba (správca). Podozrenie hlási účtovníčka internou správou na tej istej stránke; klient ju nikdy nevidí.

## Koniec zmluvy

- Po poslednom dni sa 10 dní ešte prijímajú doklady za posledný mesiac. Účtovníčka nahrá odovzdávacie súbory v časti Odovzdanie účtovníctva na stránke klienta do 30 dní. Klient si všetko stiahne ešte 90 dní.

## Čo robí Firmony samo a čo nie

- Samo: čítanie dokladov AI, e-faktúry a bankové výpisy kódom, párovanie platieb, platby bez dokladu (poplatky, dane, odvody, vlastné prevody), pripomienky klientom, výpočty DPH, miezd a závierky, súbory na podanie, termíny.
- Nie samo: odoslanie podaní na finančnú správu a do poisťovní (robí účtovníčka cez portály), odborné posúdenie, odpovede na odborné otázky klientov.
- Priame čítanie bločkov z eKasy zo systému finančnej správy nie je povolené (len overovateľ); bloček sa číta z fotky.
