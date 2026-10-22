# Zákazník má dostať hodnotu skôr, než podpíše zmluvu

22. 10. 2026. Pokyn Christiana Juhása: využiť princípy Revolutu, Trading 212 a Robinhoodu,
bezplatné nástroje, jednoduchý prechod, možné kredity, založenie firmy, AI a prípadnú komunitu.
Toto je realizačný podklad pre ďalšiu prácu aj pre Clauda. Hlavná účtovná služba, dva pracovné pohľady
a dizajnový základ z [12](12-product-simplicity.md) pokračujú. Nový slogan ani nové platené produkty sa nezavádzajú.

## Rozhodnutie a to, čo je skutočne implementované

Prvá výhoda je samostatne použiteľný výsledok za 0 eur. Návštevník nemusí najprv odovzdať kontakt,
založiť účet alebo objednať účtovníctvo. Cena bezplatného nástroja nie je dotovaná skrytým predplatným.

V tejto vetve implementované:

1. `/faktura-zadarmo`: vyplnenie, živý náhľad a miestny PDF export bežnej tuzemskej faktúry neplatiteľa DPH
   medzi slovenskými podnikateľmi v EUR. Najviac 50 položiek, presné centy, validácia dátumov a slovenského IBAN.
   Rozpracované údaje si človek výslovne stiahne a načíta ako JSON. Žiadne automatické browser úložisko.
2. `/bezplatne-nastroje`: nový nástroj, existujúca mzdová kalkulačka a skutočné porovnanie účtovných nákladov.
3. Vstup z hlavnej stránky, pätičky, sitemap a llms.txt. Ponuka účtovnej služby je dobrovoľná a oddelená.
4. Nástroj nemá zapisovací endpoint, účet, platobnú kartu, reklamný pixel, AI volanie ani zber formulára.
   CSP zakazuje sieťové spojenia zo stránky aj pôvodné odoslanie formulára. Skript a fonty sú vlastné.
   Potvrdenia rozsahu sú prázdne aj po obnovení súboru; dokončený PDF nie je potvrdením účtovného overenia.

Je to prvý verejný fakturačný nástroj, nie nový plný fakturačný systém pre každý režim.
PDF nie je XML eFaktúra, odoslaná faktúra, archív, daňové priznanie ani založenie klientskeho vzťahu.
Existujúca fakturácia platiacich klientov sa nemení. Nástroj neprijíma klienta mimo AML brány.

**Zatiaľ sa nespúšťa:** kredit 100 eur, piata s. r. o. zadarmo, bezplatné založenie firmy, doživotná viazanosť,
plná verejná AI čítačka, AI daňový odhad, nový poradenský chat alebo sociálna sieť. Nie sú na webe ako hotové výhody.
Sú nižšie rozpracované ako ďalšie kroky, s konkrétnymi podmienkami spustenia.

## Čo už máme a čo zákazník ešte nedostáva

| Oblasť | Skutočný podklad v kóde | Rozdiel oproti novému návrhu |
| --- | --- | --- |
| Fakturácia klienta | `app/invoices.ts`, `views/invoices.tsx`, úhrady, dobropisy, zálohy, opakovanie, cudzie meny, UBL, PAY by square | Vyžaduje klientsky účet a službu. Nový verejný nástroj má výslovne užší rozsah. |
| AI čítačka | `app/read.ts`, `READER`, existujúce Anthropic API a asynchrónny príjem dokladov | Nie je to vševediaci poradenský model. Verejná neobmedzená čítačka by mala náklady a nové dátové povinnosti. |
| Prevzatie dát | `app/takeover.ts`, `takeover-store.ts`, `/ucto/klienti/:id/prevzatie` | Import a kontrola dát existujú; nesmieme sľúbiť bezchybný import ľubovoľného exportu. |
| Prechod klienta | `/app/prechod`, `views/papers.tsx`, žiadosť, výpoveď, upload podkladov a záznam `switching.sent` | Klient dnes žiadosť odosiela sám. Evidencia odoslania nie je spravované prevzatie ani dôkaz prijatia starou účtovníčkou. |
| Mzdový výpočet | `/mzdova-kalkulacka`, existujúci mzdový engine, zvoliteľný rok | Nie je to všeobecný daňový a odvodový výpočet SZČO alebo s. r. o. z nahraných dokladov. |
| Dôvera | právne podmienky, precontract AML, release gate, export, J1, potvrdenia odovzdania J2 | Reálne podpisy, poistenie a prevádzkový pilot musia byť doložené osobitne. |
| Nasadenie | `main` -> existujúci Cloudflare Workers Builds -> firmony.io, `/healthz` s revíziou | GitHub prístup a overenie verejného výsledku nie sú priamy prístup do Cloudflare dashboardu alebo registrátora. |

## Inšpirácia: kopírovať mechanizmus hodnoty, overiť jeho ekonomiku

Verejné originály poskytovateľov prečítané 22. 10. 2026. Ide o ich tvrdenia a viditeľné podmienky,
nie o nezávislé používanie prihláseného účtu. Neodvodzujeme z nich príčinu rastu ani rovnaký právny režim pre SR.

| Poskytovateľ | Čo preukazuje originál | Prevod do Firmony |
| --- | --- | --- |
| Revolut | Bezplatný základ, platené plány a balíky výhod; odhady hodnoty majú predpoklady a podmienky. [R1] | Najprv reálny výsledok bez platenia; účtovná služba má samostatný rozsah a úplnú cenu. Nevymyslieť hodnotu balíka. |
| Trading 212 | Bez obchodnej provízie a custody fee v uvedených účtoch, osobitná FX položka a externé poplatky, zobrazenie ceny pred potvrdením. [R2] | Veľmi lacná rutinná úloha cez softvér, profesionálnu službu oceňovať z celkových nákladov. Cena musí byť zrozumiteľná pred rozhodnutím. |
| Robinhood | Aktuálny americký referral program podmieňuje kvalifikáciu otvorením a úspešným financovaním účtu, má míľniky a pravidlá. [R3] | Odmena až za skutočne aktívneho klienta. Žiadne peniaze za hromadné emailové kontakty či fiktívne registrácie. |
| Zoho Invoice | Bezplatná fakturácia, limity používateľov/projektov/faktúr a branding; samostatná ponuka pokročilej služby. [R4] | Bezplatný výsledok môže ukázať kvalitu skôr než zmluva. Rozsah uviesť pri nástroji, nie až po vyplnení. |
| Wave | Bezplatný Starter, platené automatizácie a oddelené profesionálne vedenie účtovníctva. [R5] | Oddeliť softvérovú rutinu od práce odborníka. Ich zahraničné ceny neurčujú slovenské náklady. |
| Crunch | Bezplatné nástroje s reklamou a platené účtovné služby. [R6] | Bezplatná užitočnosť ako vstup. Reklamy a predaj dát nepreberáme do nového nástroja. |
| Xolo | Prechod existujúcej firmy, bezplatný fakturačný nástroj a komunitné ponuky sú viditeľné časti ponuky. [R7] | Prechod a prípadná komunita môžu mať vlastnú hodnotu; ich existencia sama nepotvrdzuje efekt na retenciu. |

Nový originál psychológie: Shampanier, Mazar a Ariely (2007), *Zero as a Special Price*, Marketing Science,
doi:10.1287/mksc.1060.0254 [S1]. Experimenty rozlišujú nulovú cenu od malého kladného poplatku a skúmajú
afektívne vysvetlenie. Časť je hypotetická, časť používa reálne voľby pri lacných produktoch.
Výsledok nie je dôkazom konverzie do slovenského B2B účtovníctva ani dôvodom skryť náklady.
Použitie tu: skutočné 0 eur za konkrétny výsledok, bez povinného plateného pokračovania.
Ďalšie originály férovosti, dôvery, ceny, transparentnosti a odporúčaní sú v
[predchádzajúcom výskume](../research/trust-and-value-2026-10-22.md), vrátane obmedzení prístupu a dôkazov.

## Nasledujúce výhody v poradí realizácie

### G1. Spravovaný prechod namiesto samostatného vybavovania klientom

Najbližší veľký kandidát. Klient zadá kontakt pôvodnej účtovníčky, skontroluje konkrétne poverenie a potvrdí
rozsah. Prípady s chýbajúcim oprávnením alebo nedokončeným AML sa neodosielajú. Formy podpisu a rozsah
zastupovania musí potvrdiť advokát; jednoduchý checkbox sa nesmie vydávať za kvalifikovaný podpis.

Realizácia: žiadosť so samostatným stavom a identitou žiadateľa, pridelený zodpovedný účtovník, termín,
kontaktný súhlas/poverenie a jeho verzia, záznam oslovenia, zoznam požadovaných podkladov, potvrdenie prijatia,
kontrola úplnosti a odsúhlasené počiatočné stavy. Importovať možno až po kontrole, nie na základe doručenia emailu.
Stavy `potrebujeme potvrdenie`, `vybavujeme`, `čakáme na podklady`, `kontrolujeme`, `prevzaté` majú jasný dôkaz.
Opakovaný klik nesmie poslať duplicitnú žiadosť; správy a prílohy sú oddelené podľa firmy a oprávnenia.

Základné prevzatie môže byť zahrnuté v službe, ak cenový model unesie vykonanú prácu. Historické opravy,
rekonštrukcia, mimoriadny objem a cudzie poplatky sa vopred odsúhlasia. Absolútny sľub rýchlosti závislej
od pôvodnej účtovníčky sa nezavedie. Klient nemusí telefonovať Firmony; nevyhnutné doplnenie môže dostať v aplikácii.
Najprv 5 skutočných prechodov so záznamom času klienta a účtovníka. Toto je navrhnutý pilot, nie nameraný výsledok.

### G2. Vlastný asistent znamená vlastný kontext a kontrolu, nie vševediaci model

Existujúci Anthropic kľúč sa nečíta ani nevytvára nový. Ďalšia implementácia môže použiť serverové API,
ale doterajšia čítačka sa nemení na otvorený chat bez dátového a prevádzkového návrhu.

Prvý rozsah: vysvetlenie aktuálneho stavu dokladu, presné chýbajúce podklady, najbližšie evidované termíny,
vysvetlenie ceny z faktúry a postup ďalšieho kroku. Každé tvrdenie o firme má odkaz na konkrétny doklad alebo stav
a čas jeho načítania. Súčty robí existujúci deterministický engine; model ich nevymýšľa.

Technické podmienky: server odvodí firmu a používateľa zo session, povolené funkcie nemajú voľné SQL alebo
voľný identifikátor cudzej firmy, len nevyhnutné údaje, štandardne iba čítanie, limity otázok/tokenov a súbehu,
časový limit, rozpočet, vypnutie, meranie nákladov a dostupnosti. Obsah dokladu je údaj, nikdy systémový pokyn.
Bez nástrojov na platbu, podpis, zmenu knihy alebo podanie; neistota a odborná otázka idú účtovníčke so súhlasom
klienta a s viditeľným stavom. Hranice promptov nie sú zárukou ochrany; potrebné sú serverové oprávnenia [T1].

Pred zapnutím: právny a dátový rozsah spracovania chatu, nastavenie dodávateľa a jeho podmienok,
aktuálnosť zdrojov, testy cudzích firiem, prompt injection, neexistujúceho dokladu, zmenených údajov,
odmietnutého API a eskalácie. Bez tvrdenia, že AI pozná všetko alebo nikdy nechybí.

### G3. Kredit ako náklad na získanie klienta, nie imaginárne peniaze

Majiteľ navrhol 100 eur. Ide o navrhovanú nominálnu hodnotu, nie o schválenú kampaň alebo hotovosť v aplikácii.
Rozumný prvý variant: jednorazový servisný kredit po skutočnom začiatku a zaplatení služby nového klienta.
Alternatíva: odmena za kvalifikované odporúčanie; nekombinovať viac kampaní bez spoločného limitu.

Pred implementáciou určiť financovanie, oprávnené firmy, konkrétne služby, použitie pri fakturácii, menu,
DPH a účtovné zachytenie, splatnosť a platnosť, pravidlá zrušenia a reklamácie, súbeh s inými výhodami,
limit na príjemcu/kampaň a zostatok. Žiadny skrytý automatický súhlas s predplatným.
Prepojené firmy a vlastné odporúčanie kontrolovať primerane; spoločná IP adresa sama nie je dôkaz podvodu.

Technicky: nemenný kreditný denník, jedinečný pôvod nároku, transakčná rezervácia a čerpanie proti konkrétnej
faktúre, vrátenie pri stornovaní, presná evidencia a rovnaká suma v aplikácii aj účtovníctve. Credit balance sa
nesmie počítať z editovateľného jedného čísla. Až potom zobrazovať benefit vo verejnej ponuke.

### G4. Založenie s. r. o. so zrozumiteľnou dotáciou a možnosťou odísť

Doživotnú viazanosť nenavrhnúť ako ochranu marže. Je to produktový úsudok: podporuje obavu zo závislosti a
je v rozpore s doterajším sľubom prenositeľnosti. Nejde o tvrdenie, že každá dlhá B2B zmluva je automaticky neplatná.

Lepší kandidát na právne a ekonomické preverenie: Firmony uhradí konkrétne vymenované náklady do vopred
stanoveného stropu; dotácia sa znižuje počas konečného obdobia. Pri skoršom odchode sa rieši len jasne
dohodnutá primeraná nevyčerpaná časť, bez bránenia exportu. Parametre zatiaľ nie sú zvolené a nepatria na web.
Ak klient platí štátu, notárovi alebo advokátovi, celá služba sa nesmie predstierať ako beznákladová.

Predpoklady: reálna partnerská ponuka, kto robí právnu službu, presné plnomocenstvo/podpisy, AML,
proces odmietnutia zápisu, refundácie, reklamácie a odchodu. Aktuálne § 57 ods. 1 a 3 Obchodného zákonníka
vyžaduje príslušnú notársku alebo advokátsku formu zakladateľského dokumentu [L2,L4]; samotné odkliknutie
vo Firmony nevytvorí hotovú s. r. o. Nová obchodná ponuka ani zmluva v tejto vetve nevzniká.

### G5. Plná fakturácia a verejná čítačka rozširovaná podľa používania

PDF nástroj môže neskôr dostať voľbu daňového režimu, úložisko, riadené číslovanie, import/export, QR, históriu,
opakovanie a skutočné odoslanie. Nepridávať iba prepínač DPH bez úplného daňového modelu a aktuálnych pravidiel.
Existujúci klientsky engine sa má zdieľať cez čisté funkcie a serverové oprávnenia; netvoriť konkurenčnú účtovnú knihu.

Verejný AI skener najprv ako ohraničený pokus s vlastnými testovacími dokladmi, jasným spracovaním osobných údajov,
počtom strán/veľkosťou, limitom na účet a denným rozpočtom. Anonymný neobmedzený upload nevystaviť na produkčný kľúč.
Meranie čítačky z 21. 10. ostáva platné so svojimi obmedzeniami; kategória 22/30 nie je 99 % spoľahlivosť.

Daňový odhad z dokladov je osobitná úloha: typ subjektu, obdobie, príjmy vs. výnosy, úhrady, účtovné vs. daňové
náklady, DPH, zamestnanie/poistenie, straty, osobné situácie, úplnosť a správne aktuálne predpisy.
AI extrakcia nemá nahradiť tieto vstupy. Výsledok musí uviesť chýbajúce podklady a predpoklady; bez nich
nesmie zobrazovať presné číslo ako skutočnú daň a odvody. Nový daňový nástroj v tejto vetve nie je.

### G6. Komunita až s konkrétnou úlohou a vlastnou hodnotou

Namiesto všeobecnej sociálnej siete najprv overiť záujem o dobrovoľné odborné otázky a odpovede,
podnikateľské spolupráce a reálne dohodnuté partnerské výhody. Účtovné doklady a finančné údaje nie sú verejné.
Otázky pred zverejnením vyžadujú anonymizáciu, moderáciu a pravidlá odbornej odpovede.
Odporúčanie odborníka nesmie predstierať overenú kvalifikáciu; partnerské výhody až po reálnej dohode.
Najprv 10 rozhovorov o konkrétnej potrebe. Aktivita a počet príspevkov nie sú náhradou správneho účtovníctva.

## Ekonomika: lacnejšie pre klienta musí vychádzať z nižšieho nákladu na obsluhu

Cenník 89/169/329 eur, mzdy 15 eur a závierka 249 eur sa touto vetvou nemenia. Majiteľov cieľ nízkej ceny
a vysokej marže je zaznamenaný, ale nie je dokázaný sloganom alebo zahraničným príkladom.
Rozpor medzi starším pokynom držať ceny a novým cieľom najnižšej ceny riešiť meraním rovnakého rozsahu a nákladov.
Nevyhlasovať Firmony za najlacnejšieho poskytovateľa. Poznámky o 60 % marži v historickom modeli nie sú dôkaz
aktuálnej dosiahnutej hrubej marže, čistého zisku alebo cenovej prevahy.

Mesačný príspevok klienta = skutočný výnos bez DPH po kreditoch a vratkách mínus priama odborná práca,
AI, bankové a poštové služby, platby, podpora, onboarding a opravy priradené klientovi. Fixné náklady,
právne služby a poistenie evidovať osobitne pri výsledku firmy; účtovnú klasifikáciu potvrdí odborník.
Ročnú závierku nevydávať za celý mesačný výnos; náklad práce a inkaso majú svoje obdobie.

Známy vstup z `ACCOUNTANT_RATES`: navrhované prevzatie 30 eur a závierka 90 eur za príslušnú vykonanú prácu,
plus ďalšie jednotlivé úkony podľa konfigurácie. Stále potrebujú skutočnú dohodu; nie sú celkovým nákladom služby.
Cena AI, poštára, zmluvy, bankovej služby, podpory a štátnych/partnerských úkonov sa tu nevymýšľa.

Kampaň je prípustná až s meraním:

* náklad na získaného platiaceho klienta vrátane priznaných kreditov a prevzatia,
* príspevok po skutočných zľavách a podpore, návratnosť získania, udržanie a príčiny odchodu,
* rozpočet na všetky priznané a ešte nevyčerpané výhody, nie len dnešné použité kredity,
* čas klienta, čas odborníka, správnosť, opravy a reklamácie, nielen registrácie a obrat.

Piata firma zadarmo nie je automaticky lacná: môže mať vysoký objem, zamestnancov a riziko. Ak by sa niekedy
pilotovala skupinová ponuka, limity a príslušná agenda musia byť explicitné. Teraz sa nenasadzuje.

## Meranie prvého nástroja a ďalší handoff

Najprv testy reálneho prehliadača: prázdny a chybný formulár, centové počty, pridanie/odstránenie položky,
skutočné PDF/JSON stiahnutie, neplatný a obnovený súbor, žiadny únik údajov, 320/390/1440 px a viditeľné popisy.
PDF skontrolovať aj po vykreslení, vrátane diakritiky, viac strán a dlhého popisu. Testy sú syntetické.

Potom dobrovoľný pilot s 5 ľuďmi: vytvoriť faktúru bez vysvetľovania, nájsť rozsah a uložený súbor,
rozumieť rozdielu medzi bezplatným nástrojom a platenou účtovnou službou. Merať čas a neúspešné kroky.
Ide o plán, pilot neprebehol. Konverziu do kvalifikovaných klientov hodnotiť bez zachytávania údajov faktúry.
Žiadny nový sledovací systém sa teraz nepridáva.

Nasadenie overuje aj skutočné dve verejné stránky s aktuálnymi záznamami v sitemap/llms.txt a presné
SHA-256 zhodné verejné `/free-invoice.js` a `/app.css` oproti danému zostaveniu. Správny Worker commit
bez pripraveného skriptu nie je úspešné nasadenie nástroja. Overovanie iba číta verejné dáta.

Ďalší kódový kandidát je G1, v samostatnej vetve a s novým krokom schémy 78, ak ho model vyžaduje.
J2 odborné uzavretie otázky, J3 až J5, skutočný prevádzkový pilot a právne/poistné spustenie zostávajú otvorené.
Žiadna z týchto stratégií nepotvrdzuje miliardovú hodnotu alebo garantovaný podiel na trhu.

## Originálne zdroje

* R1 https://www.revolut.com/en-SK/our-pricing-plans/
* R2 https://helpcentre.trading212.com/hc/en-us/articles/11471996799517-What-are-the-fees-in-the-Invest-ISAs-and-SIPP
* R3 https://robinhood.com/us/en/support/articles/invite-friends-get-free-stock/
* R4 https://www.zoho.com/invoice/pricing/
* R5 https://www.waveapps.com/pricing
* R6 https://www.crunch.co.uk/what-we-do/online-accounting-software
* R7 https://www.xolo.io/zz-en/leap (ponuky v navigácii; nie dôkaz použitia či výsledkov komunity)
* S1 https://people.duke.edu/~dandan/webfiles/PapersPI/Zero%20as%20a%20Special%20Price.pdf
* T1 https://platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/mitigate-jailbreaks
* L1 https://static.slov-lex.sk/static/SK/ZZ/2002/431/20260601.html#paragraf-10
* L2 https://static.slov-lex.sk/static/SK/ZZ/1991/513/20260817.html#paragraf-3a a § 57 (forma založenia)
* L3 https://static.slov-lex.sk/static/SK/ZZ/2004/222/20260101.html#paragraf-69 (ods. 5)
* L4 https://static.slov-lex.sk/static/SK/ZZ/2026/29/20260817.html (zmena § 57 ods. 1 a 3)

L1 až L4 sú aktuálne znenia prečítané 22. 10. 2026. Nový PDF nástroj sa neodvoláva na budúcu eFaktúru ako
na svoju funkciu a nezavádza daňový režim platiteľa. Právny podklad je aj pri implementácii a na stránke.
