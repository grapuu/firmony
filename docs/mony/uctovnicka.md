# Návod pre účtovníčky

Podklady asistenta Mony pre účtovníčky (27. 10. 2026). Opisuje pracovný postup v časti pre tím (/ucto). Podrobnosti
jednotlivých oblastí (DPH, kniha, závierka, mzdy) sú v pracovných poznámkach, ktoré Mony dostane k otázke.

## Orientácia

- Časť pre tím je na /ucto. Menu: Klienti (/ucto), Termíny (/ucto/terminy), Na zaúčtovanie (/ucto/doklady), Správy (/ucto/spravy), Podania (/ucto/podania), Výkaz práce (/ucto/vykaz), Presnosť AI (/ucto/ai).
- Účtovníčka vidí iba firmy, ktoré má pridelené. Správca vidí všetky a navyše žiadosti z webu, tím, fakturáciu Firmony a analytiku.
- Rozdelenie práce: softvér zbiera doklady a výpisy, číta ich, páruje platby, navrhuje zaúčtovanie, počíta knihy, DPH, mzdy a závierku a pripravuje súbory na podanie. Účtovníčka kontroluje a potvrdzuje, rieši neštandardné prípady, podáva pod plnou mocou a odpovedá klientom na odborné otázky.
- Všetko je v jednom systéme Firmony. Pohoda, Omega ani iný program netreba.
- Prihlásenie: prihlasovací kľúč (odtlačok, tvár, PIN), jedným dotykom na /app/prihlasenie, rovno do /ucto. Tím potvrdzuje kľúč najviac raz za 12 hodín, citlivé kroky (napríklad balík podaní) chcú dotyk z posledných 5 minút. Prvý kľúč nového člena tímu sa aktivuje kódom od správcu, ktorý odovzdá mimo e-mailu.

## Prvý deň v tíme

1. Správca Vás pridá na /ucto/tim a príde Vám pozvánka e-mailom.
2. Na /app/prihlasenie zadáte svoj e-mail a otvoríte odkaz z e-mailu (platí 20 minút, raz).
3. Otvorí sa stránka Zabezpečenie prístupu (/auth). V časti „Nastaviť prihlasovací kľúč“ napíšete názov kľúča (napríklad pracovný notebook) a aktivačný kód od správcu. Kód Vám správca odovzdá osobne alebo telefonicky, nikdy e-mailom; platí 24 hodín a raz.
4. Kľúč potvrdíte odtlačkom, tvárou alebo PIN-om zariadenia. Hneď pridajte aj záložný kľúč na inom zariadení (telefón alebo druhý počítač): pri strate jediného kľúča nepomôže ani nový e-mailový odkaz a obnovu musí schváliť ďalší správca.
5. Odvtedy sa prihlasujete jedným dotykom na /app/prihlasenie a aplikácia Vás pustí rovno do /ucto. Nových klientov dostáva účtovníčka s najmenej klientmi (aplikácia ju navrhne alebo pridelí sama, správca to môže zmeniť); kým nemáte žiadneho, zoznam klientov je prázdny.
- Mony (asistentka v rohu každej stránky) Vám vysvetlí akýkoľvek postup v aplikácii. Nevidí údaje klientov.

## Čo vidíte a čo nie

- Vidíte iba firmy, ktoré máte pridelené: ich doklady, platby, knihy, DPH, mzdy, závierku, podania, správy a Identifikáciu a riziko.
- Kontaktné údaje klientov (e-maily a telefóny) aplikácia účtovníčkam nezobrazuje. S klientom komunikujete v Správach na stránke klienta; klient dostane e-mailom len upozornenie bez obsahu.
- Žiadosti z webu, overenie nových klientov pred zmluvou, prihlášky na založenie s. r. o., fakturáciu Firmony a tím rieši správca. Interné oznámenie o podozrení vidí len jeho autor a určená osoba.
- Citlivé kroky (stiahnutie balíka podaní, exporty) chcú dotyk kľúča z posledných 5 minút; aplikácia o neho požiada sama a potom sa vráti na rovnakú stránku.

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
- Kontrola: pri každom takom doklade napíšete „Výsledok posúdenia a dôvod“ (aspoň 12 znakov), potvrdíte, že ste posúdili pôvodný doklad, platbu a súlad s profilom klienta, a kliknete „Zapísať odborné posúdenie“. Doklad potom nesie značku „Odborne posúdené“. Ak treba niečo zmeniť, otvorte doklad a zaúčtujte ho inak; podozrivý prípad riešte interným oznámením na stránke Identifikácia a riziko.
- Kedy zapnúť: Účtuje samo potrebuje pravidlá dodávateľov použité aspoň dvakrát, preto pomôže až vtedy, keď ste klientovi doklady pravidelných dodávateľov zaúčtovali s „Zapamätať pre dodávateľa“ a čítanie jeho dokladov sedí (Presnosť AI, /ucto/ai).

## Výkaz práce a Vaša odmena

- Výkaz práce (/ucto/vykaz, mesiac sa vyberá) spočíta Vašu prácu sám z toho, čo aplikácia zaznamenala, aj ako CSV pre Excel. Podľa neho fakturujete europio s. r. o. raz mesačne.
- Sadzby (dohodnuté so správcom): 0,50 € za doklad, ktorý ste prvýkrát zaúčtovali alebo zahodili; 12 € za obdobie DPH s podaným riadnym priznaním; 6 € za každý iný mesiac klienta; 4 € za osobu v uzavretých mzdách mesačne; 90 € za podanú závierku s daňovým priznaním; 30 € za prevzatie nového klienta (raz). Správy sú v mesačnom poplatku. Oprava vlastnej chyby sa neplatí a doklady, ktoré zaúčtuje aplikácia sama, tiež nie.
- Pod výkazom je medián minút na doklad (od otvorenia po zaúčtovanie).

## Keď niečo nejde

- Postup v aplikácii: opýtajte sa Mony.
- Odborná otázka (zákon, výklad): rozhodujete Vy ako účtovníčka; Mony vysvetlí, ako aplikácia s vecou pracuje.
- Chyba aplikácie (niečo počíta zle, stránka padá, chýba funkcia): napíšte správcovi na ahoj@firmony.io s adresou stránky a čo ste čakali. Klientovi medzitým napíšte do Správ, že to riešite.
- Iba správca: pridelenie alebo odobratie klienta, nový člen tímu, obnova strateného kľúča, overenie klienta pred zmluvou, ukončenie zmluvy z našej strany.

## Stránka klienta (/ucto/klienti/:id)

- Na zaúčtovanie, platby bez dokladu na kontrolu („V poriadku“ alebo „Vrátiť klientovi“ so správou), chýbajúce doklady u klienta („Pripomenúť klientovi“), správy s odpoveďou, výpisy z banky, ktoré nenadväzujú („Zaúčtovať aj tak“ alebo „Nezaúčtovať“).
- Pripomienky robí aplikácia sama, netreba ich písať: chýbajúce doklady každý pondelok a 5. dňa v mesiaci, výpis 3. dňa, nedokončené prvé kroky nového klienta (vyhlásenie, plná moc, banka, prvý doklad) 3 a 10 dní po zmluve. „Pripomenúť klientovi“ je na mimoriadny prípad.
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
