# Asistent Firmony, G2

Implementácia 22. októbra 2026. Presný testovaný commit a výsledok živého nasadenia sú v sprievodnom PR.
Jedna existujúca účtovná služba, dva pohľady, bez nového predplatného a bez zmeny cien.

## Čo dostane klient a účtovníčka

Klient otvorí asistenta zo Správ na `/app/asistent`. Pridelená účtovníčka alebo administrátor
z pracoviska firmy na `/ucto/klienti/:id/asistent`. Prístup vyžaduje aktívnu službu alebo demo,
aktuálne členstvo či pridelenie; skončená, uzavretá alebo archivovaná firma nemá otvorený AI chat.
Pred zmluvou sa nezobrazuje odkaz vedúci na neprístupnú funkciu. AML a zmluvné brány ostávajú.

Rýchle otázky čítajú aktuálny stav bez cloudového volania. Vlastná otázka môže cez existujúce serverové
Anthropic API vybrať jednu zo siedmich tém: prehľad, doplnenie, termíny, doklad, cena, ďalší krok, odborník.
Firmony potom zostaví odpoveď z vlastných údajov. Viditeľné sú zdroje, čas v Bratislave a konkrétny ďalší krok.
Čísla, odkazy, účtovné predpisy ani text odpovede neprichádzajú od modelu. Vybraný doklad patrí aktuálnej firme;
číslo alebo meno v otázke samo nevyhľadáva ďalšie doklady. Výber obsahuje posledných dvadsať a prípadný
konkrétny starší doklad z vlastného odkazu. Cudzie identifikátory vracajú 404 pred cloudovým volaním.

Prehľad rozlišuje prijatie, čítanie, zaúčtovanie a aktuálnu odbornú kontrolu automatiky.
Spárovanie alebo zaúčtovanie nie je označené za úplné dokončenie služby. Chýbajúce platby používajú
existujúce pravidlo `MISSING`. Termíny používajú rovnakú klientsku projekciu ako prehľad, bez interných
AML záznamov. Cena vychádza z cenníka uloženého pre fakturáciu; nezistený či poškodený cenník sa
nedopĺňa vymysleným číslom. Bežný člen nedostane súkromné zmluvné sumy vlastníka.

Odborné posúdenie ide do existujúcej komunikácie. Klient môže pripraviť najnovší text a vybraný doklad
účtovníčke aj bez volania AI. Zobrazí sa editovateľný koncept. Až ďalší výslovný klik odošle správu
cez pôvodný idempotentný composer. Príprava neposiela email, oznámenie ani správu. Všeobecný stav
odborného vybavenia otázky je stále samostatná nedokončená časť J2; prečítanie ho nenahrádza.

## Hranica modelu a ochrana údajov

Do klasifikácie posielame iba napísanú otázku, pevný systémový pokyn a pevný enum tém.
Nepridávame identitu firmy, doklady, čísla účtov, bankové pohyby, správy alebo iný podnikový kontext.
Samotný klientov text môže osobné údaje obsahovať: formulár to vysvetľuje pred odoslaním a odkazuje
na `/pravne-informacie#asistent`. Použitie cloudovej otázky je voliteľné.

Validátor prijme iba jednu povolenú `firmony_topic` tool odpoveď s jediným poľom `topic`,
potvrdeným ukončením a platným meraním tokenov. Ostatný modelový text sa nikdy nevykreslí.
Nesprávny nástroj, odmietnutie, skrátenie, neplatné meranie a odpoveď nad 32 KiB skončia dostupnou
ľudskou cestou. Ani nesprávne zaradenie témy nemôže spustiť platbu, podpis, podanie, zmenu knihy,
voľný SQL dotaz alebo cudzí odkaz. Model nemá také nástroje.

Používame existujúci model `READER.model`, aktuálne `claude-haiku-5-5`, a existujúcu runtime väzbu.
Hodnota kľúča sa nečíta, nevypisuje ani nezakladá. Čítačka dokladov a jej protokol sa nemenia.
Nový klasifikačný endpoint používa zdokumentovanú verziu API `2026-10-21` a forced tool use podporovaný
Haiku 5.5. Chyba alebo chýbajúca väzba nespúšťajú automatické ďalšie platené pokusy.

Otázku ani odpoveď neukladáme ako rozhovor. `assistant_uses` obsahuje iba identifikátor pokusu,
firmu, používateľa, stranu, kryptografický odtlačok otázky a výberu dokladu, deň/čas, stav, tému,
model a dostupné počty tokenov. Odtlačok a metadáta nepovažujeme za anonymné údaje. Sú súčasťou
chráneného exportu a existujúceho režimu uchovávania služby. Po 90 dňoch sa nemažú ako technický outbox.
Skutočný konečný povolený výmaz ich odstráni spolu s firmou; incident a právny hold ho blokujú.
Účtovníčke odoslaná otázka sa uloží ako obyčajná správa podľa existujúcich pravidiel.

`PRIVACY_VERSION` je `2026-10-22`, `TERMS_VERSION` sa nemení. Verejná informácia opisuje predvolené
nepoužitie komerčného API na trénovanie, nie absolútne vylúčenie všetkých výnimiek. Štandardné uchovávanie
Anthropic je do 30 dní s výnimkami pre bezpečnostné pravidlá a zákonné povinnosti; osobitné nulové
uchovávanie nepredpokladáme. Neposielame poskytovateľovi spätnú väzbu s obsahom otázky.
Táto implementácia nepotvrdzuje právny release, podpísanú spracovateľskú dohodu ani celý režim transferu.
Existujúci release gate sa neobchádza.

## Limity a neisté výsledky

Otázka má najviac 1 200 znakov a 3 600 UTF-8 bajtov; výstup 128 tokenov a timeout 12 sekúnd.
Počítané rezervácie: 12 na používateľa, 40 na firmu a 200 globálne za bratislavský deň.
Jeden používateľ má najviac jeden nový rozpracovaný pokus počas 60 sekúnd.
Neúspešná rezervácia s neistým plateným výsledkom sa nevracia do rozpočtu. Ide o stropy volaní,
nie o garantovanú eurovú cenu alebo dosiahnutú maržu. Cenu dodávateľa tu nevymýšľame.

Rezervácia je jeden podmienený SQL zápis; súbežné požiadavky neprekročia strop. UUID a odtlačok
viažu pokus na firmu, autora a presný vstup. Opakovanie toho istého pokusu nepoužije API druhýkrát.
Potvrdená téma sa môže znovu použiť, ale fakty sa vždy čítajú čerstvé. Zmenený text vyžaduje nový pokus.
Pri neistom finálnom zápise zostane text a ľudská cesta; opakované odoslanie nespustí ďalšie volanie.

Oprávnenie, aktívna firma a prihlásený účet sa kontrolujú pred aj po externom čakaní a čítaní faktov.
Skrytý kontext viaže formulár na účet aj firmu otvorenú v danom okne. Zmena firmy, odobratie členstva,
zmena pridelenia alebo vypnutie cloudu počas volania nepovolia publikovanie výsledku.

Administrátor na `/ucto/ai/asistent` vidí denné rezervácie, neisté výsledky a známe/neznáme meranie.
Môže okamžite zastaviť cloudové otázky; zmena vyžaduje čerstvé overenie a zanechá udalosť.
Účtovník a klient globálny prepínač nevidia. Vypnutie necháva funkčné priame otázky a ľudskú cestu.

## Schéma, kontrola a nasadenie

Iba nový krok 79; prvých 78 je nezmenených. SHA-256 ich serializácie:
`47362b29a0d135a664308a70ce9fd5e32d06445e70adee41015bcf0831e0277e`.
Nemenná história použitia, databázové kontroly prístupu a ochrana pred skorým výmazom sú aj v triggeroch.
Zápis použitia zvyšuje revíziu firemného exportu. Ďalší voľný krok po zlúčení je 80.

Jednotkové testy hranice poskytovateľa a reálne D1/Worker scenáre zahŕňajú súbeh, cudzí doklad,
zmenu firmy/členstva/pridelenia počas volania, vypnutie počas volania, zlyhanie finálneho zápisu,
všetky tri denné stropy, zmluvnú cenu, export, archív a konečný výmaz. Lokálny provider je výlučne
syntetický, nevolá Anthropic ani neposiela email. Browser scenár používa skutočné formuláre a overené
testovacie session vrátane prípravy a vedomého odoslania otázky. Päť UI stavov sa kontroluje pri
320, 390 a 1440 px. Celá povinná sada pred main: check, test, Node 24 runtime, UI, Peppol a browser.

Production verification overuje presnú revíziu, schému a aj presné SHA-256 `/inside.js`, `/inside.css`,
`/free-invoice.js`, `/app.css`. Starý skript k novému Workeru sa neoznačí za úspešné nasadenie.
Syntetické testy nie sú dokončený živý klientsky pilot alebo meranie správnosti reálneho poskytovateľa.
Pred širokým používaním odmerať nejasné otázky, úspešnosť nájdenia zdroja, dostupnosť cloudovej klasifikácie
a čas klienta. Odborné odpovede zostávajú na odborníkovi.

## Originály prečítané 22. októbra 2026

* https://platform.claude.com/docs/en/api/messages/create
* https://platform.claude.com/docs/en/api/versioning
* https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools
* https://privacy.claude.com/en/articles/7996868-is-my-data-used-for-model-training
* https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data
* https://static.slov-lex.sk/static/SK/ZZ/2018/18/20260818.html, najmä § 3 ods. 2:
  pri GDPR spracovaní sa všeobecná vnútroštátna časť automaticky nepoužíva ako právny základ.

Originálny GDPR dokument na EUR-Lex bol pri overovaní blokovaný robotickou kontrolou; netvrdíme,
že bol v tejto úlohe znovu prečítaný. Nepridávame nový údajný zákonný základ alebo osvedčenie súladu.
Zmena informácie vysvetľuje skutočný nový tok údajov a zachováva existujúce právne/release kontroly.
