# Prijímanie klientov, schválenie služby a technický stav

## Rozhodnutie o príležitostiach s obratom 2 mil. € a 45 mil. €

Obe sú dnes **neposúdené obchodné príležitosti**. Nezamietnuť ich len pre veľkosť, ani ich neprijať cez automatický balík. Prejsť individuálnou odbornou kvalifikáciou a ak treba poskytovať službu cez ich existujúci ERP a seniorný tím. Taký model je návrh, nie existujúca integrácia alebo kapacita Firmony.

**Právny podklad L1** z [01](01-law-and-competition.md): § 2 zákona o účtovníctve stanovuje kategórie podľa aspoň dvoch kritérií a pravidiel príslušných období. Mikro hranice sú majetok 450 tis. €, čistý obrat 900 tis. € a priemerný prepočítaný počet zamestnancov 10. Pri malých/veľkých jednotkách sa uplatňujú aj hranice 5 mil. €, 10 mil. € a 50. § 19 pre dotknuté spoločnosti posudzuje audit cez aspoň dve podmienky v aktuálnom a bezprostredne predchádzajúcom období: majetok nad 4 mil. €, obrat nad 8 mil. € a zamestnanci nad 50, popri ďalších zákonných dôvodoch. Presná báza majetku, obdobia a osobitné režimy sa preveria podľa zákona. **Samotný obrat 2 alebo 45 mil. € nepostačuje na úplnú klasifikáciu ani záver o audite.**

| Krok | Potrebný dôkaz | Rozhodnutie |
|---|---|---|
| 1. Identita a oprávnenie | Entita, register, vlastníctvo, spoločné konanie konateľov, AML a mandáty | Jeden klik konateľa nesmie obísť spoločné podpisovanie alebo AML. |
| 2. Účtovný režim | Relevantné obdobia a všetky kritériá, audit, skupina, IFRS, hospodársky rok, odvetvie | Odborník určí kategóriu a výstupy; nepočítať len obrat. |
| 3. Prevádzka | Skutočné počty a druhy dokladov, banky/meny, zamestnanci, sklady, majetok, zahraničie, DPH, kontroly a spory | Matica každého scenára: podporované/testované, odborný manuálny postup alebo odmietnutie úlohy. |
| 4. Prevzatie | Otvorené obdobia a podania, saldo, počiatočné stavy, chýbajúce originály, doterajšie zmluvy, naplánované kontroly | Presný protokol hranice zodpovednosti a vlastníci doplnení. |
| 5. Tím a systém | Menovitý senior, kontrolór a zástupca; kapacita, prístupy, ERP, obnova, podania | Vyhodnotiť skutočnú podporu. Súčasný generátor mikro závierky neprezentovať ako podporu všetkých kategórií. |
| 6. Expozícia a financovanie | Klientsky aj portfóliový stresový scenár, ponuka poisťovne a súhlas k zmluve, vlastné zdroje | Schváliť záväzok pred cenou a marketingovým sľubom. |
| 7. Pilot a prevzatie | Paralelné porovnanie reprezentatívneho obdobia na povolených dátach, odsúhlasenie rozdielov seniorom a klientom | Žiadne dvojité podanie úradom; presný dátum, od ktorého vedie knihy Firmony. |

Pre 45-miliónový prípad navrhujeme osobitnú prevádzkovú a právnu vetvu, kým odborná analýza nepotvrdí vhodný model. Pre 2-miliónový prípad je rovnaké posúdenie povinné; reálna zložitosť môže byť vyššia než vo firme s väčším obratom. Všeobecná webová cena nie je odhad ceny ich individuálnej služby. Zmluvy a poistné limity nevytvárame z marketingovej hodnoty klienta.

## Čo je implementované v tejto zmene

| Ochrana | Implementácia | Praktická hranica |
|---|---|---|
| Celý kontrakt pri prijatí | `contracts.ts`, `order.ts`, migrácia 15 `contract_snapshots` | Text, cenník, dodávateľ, klient, podpis a čas sa ukladajú v rovnakom D1 batchi ako prijatie. Hash je kontrola konzistencie, nie kvalifikovaný podpis. |
| Staré zmluvy | `terms-archive/2026-10-13.json`, `resolveContract` | Rekonštrukcia sa jasne označí. Pri neznámej verzii nie je použitý aktuálny text ani dnešné doplnkové ceny. |
| Zmenená ponuka | Hash celého katalógu, údajov firmy a konateľov; skrytý údaj `proposal` | Server kontroluje nový hash pred podpisom; starý súhlas sa pri chybe odškrtne. Nejde o overenie identity konateľa cez eID. |
| Predbežné posúdenie klienta | `/ucto/ziadosti/:id/posudenie`, iba administrátor | Rozhodnutie štandard / individuálna služba / pozastavenie, referencia správy, zodpovedný účtovník a konkrétny balík. Človek musí pravdivo posúdiť podklady. |
| Úzka online cesta | Štandard len po potvrdení mikro režimu, podporovanej agendy, kapacity, krytia a oprávnenia konať | Zložité prípady nemajú automatický podpis. Individuálny podpis a ERP služba ešte nie sú produktovou funkciou. |
| Platnosť rozhodnutia | Najnovšie rozhodnutie, max. 7 dní, hash návrhu, posúdený balík a existujúci člen tímu | Nové „pozastaviť“ zneplatní staršie schválenie. Poslednú kontrolu robí aj podmienka databázového UPDATE, takže odvolanie medzi čítaním a zápisom nevytvorí kontrakt. |
| Právne a poistné uvoľnenie | Dôveryhodné nastavenie `CONTRACT_RELEASE` viazané na hash, referencie a čas | Bez nastavenia je podpis uzavretý. Referencia nie je automatické overenie poistnej zmluvy a úprava prostredia vyžaduje oprávnenú obsluhu. |
| Export a poškodenie | `/app/zmluva`, ZIP `zmluva.txt`, pri presnom zázname aj `zmluva.json` a `zmluva.sha256` | Poškodený záznam sa nenahrádza novým znením. Úplný export sa odmietne, kým sa pôvodný dôkaz neobnoví. |
| História a súkromie | Append-only posúdenia, oddelené interné referencie | Klientsky JSON neobsahuje interný odkaz na rizikovú správu či právne stanovisko. História prijatia uchová interné referencie v udalosti a v posúdení. |

Zmena nemení výpočty DPH/miezd a nenahrádza odbornú revíziu celého enginu. Používa existujúce kontroly prístupu, CSRF, transakcie a retenciu; nepridáva alternatívny verejný spôsob schválenia. Ručne vytvorený klientsky účet v tímovej časti **nie je uzavretie zmluvy ani povolenie začať nepokrytú službu**. Počiatočné AML a mandáty zostávajú samostatnou povinnosťou. Opakované podmienky a ceny nesmú byť označované za historické bez záznamu pri prijatí.

## Obsluha pred podpisovaním

1. Advokát a odborný garant schvália **celé** podmienky, nie iba článok o náhrade. Poisťovateľ schváli ich konkrétne riziká a vyplní maticu z [03](03-insurance-and-capacity.md). Schváli sa finančné zabezpečenie, reklamácie a uchovanie pri spore.
2. Z finálneho kódu vypočítať `contractCatalogueHash()` po finálnom texte a cenách. Výstup uložiť do schváleného release záznamu. V lokálnom overovacom bundle je dostupný cez `contracts.contractCatalogueHash()` v `.wrangler/tmp/units-bundle.mjs` po `npm test`; jeho hash nestačí, ak sa kód odvtedy zmenil.
3. Oprávnená obsluha nastaví `CONTRACT_RELEASE` ako JSON s poľami `catalogueHash`, `legalReview`, `insuranceReview`, `validUntil` (Unix sekundy). Referencie majú smerovať na skutočné schválené dôkazy. **Žiadny produkčný príklad s vymyslenou poistkou alebo hotovým dátumom tu nedodávame.** Účinnosť nesmie presiahnuť relevantnú platnosť schválení a krytia. Pri zániku krytia nastavenie bezodkladne odobrať a riešiť existujúce zmluvy samostatne.
4. V Žiadostiach z webu otvoriť „Posúdiť rozsah“. Zapísať výsledok na základe overenej správy. Pri štandardnom prijatí potvrdiť všetky kontroly a zodpovednú osobu. Samotné vyplnenie polí nenahrádza odborné posúdenie.
5. Klient môže podpísať iba posúdený balík počas platnosti ponuky. Zmena balíka, textu, tarify alebo relevantných údajov vyžaduje nové posúdenie. Po prijatí skontrolovať záznam, zodpovednú osobu, snapshot a onboardingové povinnosti. Automatické priznanie novej garancie starému klientovi je zakázaný predpoklad; potrebuje platný dodatok.

Testy používajú výslovne označené **TEST-ONLY** referencie a lokálne služby. Nie sú dôkazom skutočného krytia, advokátskeho schválenia alebo získaného klienta. `wrangler.jsonc` neobsahuje produkčné schválenie. V tejto úlohe sa nič nenasadzuje.

## Pred spustením: otvorené brány

| Brána | Podmienka prijatia | Vlastník na pridelenie |
|---|---|---|
| Celý právny balík | Podpísané stanovisko, rozsah a spôsob zmeny existujúcich zmlúv | Advokát + štatutár |
| Oprávnenia a tím | Overené činnosti, senior, zástupca, daňový poradca kde potrebný, kapacita | Odborný garant |
| Krytie | Záväzná poistka, relevantné dodatky a písomná odpoveď ku každému riziku | Sprostredkovateľ + štatutár |
| Vlastné financie | Overená likvidita, spoluúčasť, portfóliová koncentrácia, schválené záväzky | Finančný vlastník |
| Škody a retencia | Funkčný register udalostí, pozastavenie výmazu pri spore, právne odôvodnené lehoty a nácvik | Právnik + prevádzka |
| Prevádzková bezpečnosť | Obnova, segregácia práv, incidentný kontakt, potvrdenia podaní, núdzové alternatívy | Technický a odborný garant |
| Každý klient | Podpísané odborné posúdenie, rozsah, mandát, AML, úspešný pilot podľa rizika | Vedúci klienta |

### Známe limity, ktoré nemožno zameniť za hotovú funkciu

- Automatická blokácia výmazu pre prebiehajúci nárok ešte neexistuje. Pred reálnym prevzatím služby je potrebné doplniť a otestovať právny hold alebo preukázať riadený náhradný postup vrátane zastavenia plánovaného mazania. Aktuálny proces po odovzdaní dát a päťročná retencia zmluvných záznamov nie sú univerzálnym riešením pre každý spor.
- Databázový správca môže zmeniť databázu či odstrániť trigger a prepočítať hash. Nezávislý archív/časová pečiatka, obnoviteľná záloha a kontrola privilegovaných prístupov sú samostatné otvorené dôkazy.
- Neexistuje automatická klasifikácia veľkosti jednotky, priame prepojenie poisťovne ani overenie odborného stanoviska; schvaľovateľ nesie vecnú zodpovednosť za rozhodnutie. Neaktivovať podpisovanie iba preto, že test prešiel.
- Individuálna podniková zmluva, viac podpisujúcich a prevádzka cez cudzie ERP nie sú implementované. V tomto kroku ich systém bezpečne oddeľuje od štandardného podpisu.

## Usporiadanie vetiev a kontrol

Táto vetva je pokračovaním celého doterajšieho vývoja, nie alternatívny začiatok z pôvodnej stránky na `main`. Cieľom je jeden aktuálny kumulatívny PR do `main`, ktorý zahŕňa účtovné opravy, históriu, SV, zámky období, zákaznícku podporu, stratégiu aj túto zmenu. Staršie PR sa smú označiť za nahradené až po overení, že ich head commity sú predkami novej vetvy. Ich vetvy a história sa zachovajú; nič sa automaticky nemerguje a neprepisuje silou.

Workflow už nemá špeciálny push trigger na dávno prekonanú pracovnú vetvu. Kontroly bežia na PR a po prípadnom schválenom merge na `main`. Táto zmena nespúšťa deploy. Počet testov a screenshoty sa vykazujú len pre konkrétny overený commit, nie ako záruka nulovej chybovosti.
