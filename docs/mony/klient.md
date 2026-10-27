# Návod pre klientov

Podklady asistenta Mony pre klientov (27. 10. 2026). Opisuje, čo klient robí v aplikácii Firmony a kde to nájde.
Adresy stránok sú presné. Pri každej zmene aplikácie, ktorá mení postup klienta, treba upraviť aj tento súbor.

## Orientácia

- Aplikácia klienta je na adrese /app. V počítači má menu vľavo, v telefóne lištu dole s piatimi kartami a v strede tlačidlom „+“ na pridanie dokladu.
- Hlavné stránky: Prehľad (/app), Platby (/app/platby), Doklady (/app/doklady), Správy (/app/spravy), Faktúry (/app/faktury), Dane (/app/dane), Firma a nastavenia (/app/firma), Banka (/app/banka).
- Jediná pravidelná úloha klienta: ku každej platbe na firemnom účte dodať doklad tam, kde chýba. Čítanie dokladov, párovanie s platbami, účtovanie, DPH, mzdy, termíny a podania robí Firmony a účtovníčka.
- Prehľad vždy ukazuje, čo práve chýba. Keď nič nechýba, píše „Všetko máme. Nemusíte nič robiť.“
- Na otázky k vlastnej firme odpovedá účtovníčka v Správach do jedného pracovného dňa.

## Prihlásenie a bezpečnosť

- Prihlásenie je na /app/prihlasenie. Najrýchlejšie je tlačidlo „Prihlásiť sa“: odtlačok prsta, tvár alebo PIN zariadenia, bez hesla a bez e-mailu. Správca hesiel (iCloud, Google, 1Password) ponúkne uložené prihlásenie aj priamo v poli na e-mail.
- Prvýkrát alebo na novom zariadení sa klient prihlási odkazom z e-mailu. Odkaz platí 20 minút a dá sa použiť raz. Hneď potom aplikácia ponúkne „Uložiť prihlásenie“, odvtedy stačí jeden dotyk.
- Uložené prihlásenie (prihlasovací kľúč) sa prenesie do ďalších zariadení s rovnakým účtom Apple alebo Google.
- Stratený telefón: prihlásiť sa odkazom z e-mailu a uložiť si nový kľúč. Starý kľúč sa dá odobrať na stránke Zabezpečenie prístupu (/auth).
- Citlivé kroky (napríklad stiahnutie celého archívu firmy) chcú čerstvé prihlásenie: dotyk kľúča alebo nový odkaz z e-mailu.
- Odtlačok ani tvár neodchádzajú z telefónu, Firmony ich nedostáva.

## Doklady

- Pridať doklad: tlačidlo „Pridať doklad“ (v telefóne „+“). Fotka bločku alebo faktúry, PDF alebo e-faktúra (XML), aj viac naraz, do 15 MB. Fotka sa zmenší ešte v telefóne.
- Faktúry z e-mailu stačí preposlať na adresu firmy na doklady (tvar doklady-kód@firmony.io). Presná adresa je na Prehľade a vo Firme a nastaveniach. Dá sa nastaviť aj automatické preposielanie v e-mailovej schránke.
- Doklad prečíta umelá inteligencia (dodávateľ, IČO, dátumy, sumy, DPH) a sama ho priradí k platbe. Účtovníčka zaúčtovanie skontroluje.
- Rovnaký doklad poslaný dvakrát sa uloží raz. Bloček z eKasy sa spozná podľa jeho kódu.
- Doklady sú na /app/doklady. Filter „bez platby“ ukáže doklady, ku ktorým ešte neprišla platba.
- Doklad zaplatený z vlastných peňazí: na stránke dokladu sa dá označiť, že ho majiteľ zaplatil sám. Účtovníčka mu ho zaúčtuje ako pohľadávku voči firme.
- Zaúčtovaný doklad klient nezmaže. Ak je chybný, napíše účtovníčke.

## Platby a banka

- Platby sú na /app/platby. Filter „Chýba doklad“ ukazuje, čo treba doplniť.
- Pri platbe bez dokladu: „Odfotiť alebo nahrať doklad“, prípadne vybrať doklad, ktorý už máme. Ak aplikácia ponúkne doklad, ktorý sedí, stačí „Áno, je“.
- Doklad netreba (časť „Doklad k tejto platbe netreba?“): bankový poplatok alebo úrok, prevod medzi vlastnými účtami, mzda alebo odvody, daň alebo iná platba štátu, vklad do firmy alebo pôžička, niečo iné s pár slovami. Poplatky, dane, odvody a prevody medzi vlastnými účtami aplikácia väčšinou rozpozná sama. Účtovníčka to skontroluje.
- Neviete, čo s platbou? Na stránke platby je políčko „Poslať otázku“, ide priamo účtovníčke.
- Platby spred začiatku zmluvy doklad nepotrebujú, účtuje ich predchádzajúca účtovníčka.
- Banka (/app/banka): vyberte svoju banku a postupujte podľa krokov.
  - Slovenská sporiteľňa: v Georgi nastavíte denný elektronický výpis vo formáte SEPA XML na adresu firmy na doklady. Potom chodí sám každý deň s pohybom.
  - ČSOB: výpisy posiela e-mailom na adresu firmy na doklady.
  - Fio banka: v internet bankingu vytvoríte token len na čítanie (platí 180 dní) a raz ho vložíte. Platby sa potom načítavajú samy.
  - Tatra banka, VÚB, 365.bank, mBank, UniCredit, Prima banka, Revolut Business, Wise a iné: raz mesačne nahráte výpis vo formáte XML (camt.053). Pripomienka príde 3. dňa v mesiaci.
- Výpis sa dá nahrať aj ručne na stránke Platby alebo Banka. Platby, ktoré už máme, sa nezdvoja.
- Priame prepojenie všetkých bánk naraz (open banking) zatiaľ nie je zapnuté.

## Faktúry, ktoré firma vystavuje

- Faktúry sú na /app/faktury, nová na /app/faktury/nova. Odberateľa doplní aplikácia z registra podľa IČO, alebo ho vyberiete z doterajších odberateľov.
- „Uložiť koncept“ uloží rozpracovanú faktúru bez čísla, „Vystaviť faktúru“ jej dá číslo. Vystavená faktúra sa už nemení, opraví sa dobropisom.
- Na faktúre je QR kód PAY by square: odberateľ ju zaplatí v aplikácii banky jedným naskenovaním.
- Faktúru pošlete odberateľovi z jej stránky („Poslať odberateľovi“), alebo stiahnete PDF. Odberateľ dostane aj odkaz, kde nájde PDF, QR kód a e-faktúru.
- Zaplatená faktúra sa označí sama, keď príde platba s jej variabilným symbolom.
- Na stránke faktúry: „Vystaviť dobropis“, „Vystaviť podobnú“, opakovanie (mesačne, štvrťročne, ročne), pri neskorej platbe „Vystaviť faktúru na úrok a náhradu“.
- Zálohová faktúra: „Nová zálohová faktúra“ na stránke Faktúry. Keď záloha príde, daňový doklad k prijatej platbe vznikne sám; na konci vystavíte vyúčtovaciu faktúru.
- Faktúry v cudzej mene sa prepočítajú kurzom ECB.
- Upomienky po splatnosti môžu chodiť samé (nastavenie na stránke Faktúry). Vlastné číslovanie a logo: /app/faktury/cislovanie.
- Platitelia DPH vyberajú zdanenie: slovenská DPH, dodanie tovaru do EÚ, služba do EÚ, vývoz, prenesenie daňovej povinnosti, trojstranný obchod.

## E-faktúry (Peppol)

- Od 1. 1. 2027 musí každá firma vedieť prijímať e-faktúry. Firmony má digitálneho poštára zabudovaného; odosielanie priamo z Firmony zapíname pred 1. 1. 2027.
- Stav firmy v sieti Peppol je vo Firme a nastaveniach v časti E-faktúry. Prijaté e-faktúry sú na /app/prijate.
- Každá faktúra z Firmony už dnes vzniká aj ako e-faktúra vo formáte Peppol BIS 3.0.

## Ďalšie časti aplikácie

- Dane (/app/dane): čo zaplatiť za DPH a daň z príjmov, do kedy, na aký účet, s QR kódom.
- Na úhradu (/app/uhrady): faktúry dodávateľov na zaplatenie; vytvorí platobný príkaz (XML) na nahratie do banky.
- Schvaľovanie faktúr dodávateľov: zapína majiteľ vo Firme a nastaveniach; faktúry čakajúce na schválenie sú na /app/schvalovanie. Dajú sa nastaviť schvaľovatelia s limitom a dvojité schválenie od určitej sumy.
- Pokladňa (/app/pokladna): príjmy a výdavky v hotovosti. Platba v hotovosti nad 5 000 € je zákonom zakázaná.
- Tržby z eKasy (/app/trzby): denná uzávierka pokladne, hotovosť aj karty.
- Pracovné cesty (/app/cesty): cestovné náhrady na Slovensku, stravné aj auto; vznikne doklad na vyplatenie zamestnancovi.
- Strediská (/app/strediska): rozdelenie nákladov a výnosov napríklad na prevádzky alebo projekty, aj s rozpočtom.
- Podania (/app/podania) a mzdové podania (/app/mzdove-podania): čo účtovníčka podala a potvrdenky.

## Firma, zmluva a prvé kroky

- Firma a nastavenia (/app/firma): údaje firmy, adresa na doklady, ľudia vo firme (pozvať spoločníka alebo kolegu odkazom platným 7 dní), pripomienky zapnúť alebo vypnúť, zmluva, výpoveď, stiahnutie údajov.
- Prvé kroky po uzavretí zmluvy: vyhlásenie „Kto stojí za firmou“ (/app/vyhlasenie, povinné podľa zákona proti praniu špinavých peňazí), plná moc (/app/plna-moc), banka alebo výpis, prvý doklad.
- Plná moc: stiahnuť ako PDF, podpísať občianskym preukazom s čipom v aplikácii D.Signer na slovensko.sk (vznikne súbor .asice) a nahrať na /app/plna-moc. Dá sa podpísať aj na papieri.
- Zmena účtovníčky (/app/prechod): Firmony môže prechod koordinovať, alebo si klient vytlačí list pre doterajšiu účtovníčku sám.
- Zmluva s podmienkami je na /app/zmluva. Bez viazanosti: výpoveď sa dáva vo Firme a nastaveniach a platí ku koncu nasledujúceho mesiaca; kým neuplynie, dá sa vziať späť.
- Po skončení zmluvy: doklady za posledný mesiac sa prijímajú ešte 10 dní, účtovníčka odovzdá účtovníctvo v aplikácii a všetko sa dá stiahnuť ako ZIP za každý rok (Firma a nastavenia, „Stiahnuť doklady a údaje“) ešte 90 dní.
- Nového zamestnanca nahláste v aplikácii (Správy) najneskôr 3 pracovné dni pred nástupom, aby ho účtovníčka stihla prihlásiť do poisťovní.
- Aplikácia sa dá dať na plochu telefónu bez obchodu s aplikáciami: v Safari Zdieľať a Pridať na plochu, v Chrome Inštalovať aplikáciu.

## Bezplatná fakturácia

- Firmy a živnostníci môžu fakturovať zadarmo aj bez účtovníctva (/fakturacia). Registrácia: IČO a e-mail, potom odkaz z e-mailu. Ďalej sa prihlasujú jedným dotykom.
- Fakturačný účet má len faktúry a ich nastavenia. Vo Firme a nastaveniach je „Účtovníctvo s Firmony“, ak chce firma prejsť na vedenie účtovníctva, a možnosť stiahnuť všetky faktúry alebo účet zrušiť.

## Čo Mony nerobí

- Neposudzuje daňové ani právne otázky konkrétnej firmy, nepočíta jej daň a neradí, ako investovať. Pri takej otázke vysvetlí všeobecné pravidlo z návodov Firmony a odporučí napísať účtovníčke do Správ (/app/spravy).
- Nevidí doklady, platby ani údaje firmy. Nevykonáva platby, podania ani zmeny v účtovníctve.
