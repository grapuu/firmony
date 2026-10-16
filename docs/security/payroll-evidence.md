# Mzdové výkazy a dôkazy doručenia

Stav: 16. 10. 2026, schéma **19**, existujúce PR #8. Podporovaný rozsah je pravidelná mesačná
mzda v existujúcom mzdovom výpočte. Ide o evidenciu práce účtovníka a presných externých súborov.
Oficiálne výkazy sa zatiaľ negenerujú ani automaticky neodosielajú; model zamestnanca nemá všetky
identifikátory potrebné na dôveryhodné generovanie formulárov poisťovní.

## Jeden pracovný tok

Uzavretie miezd uloží nemenný zdroj s kontrolným súčtom a založí samostatnú povinnosť pre Sociálnu
poisťovňu a každú zdravotnú poisťovňu zastúpenú v uzavretých páskach, aj pri nulovom odvode. Uložený
bankový účet ďalšej poisťovne sám povinnosť nezaloží. Staršiu uzávierku účtovník výslovne prevezme do
tejto evidencie; skupinové historické označenie zostáva nedoložené.

Plánovaný výplatný deň nie je dôkaz výplaty. Účtovník potvrdí skutočný dátum vyplatenia všetkých
príjmov danej uzávierky a uvedie referenciu overenia, napríklad transakcie a bankový výpis. Platobný
príkaz nestačí. Toto potvrdenie vyžaduje výslovné overenie jedného dátumu pre celú uzávierku.
Vznikne jeden prehľad FS za mesiac skutočného vyplatenia. Viac uzávierok vyplatených v rovnakom mesiaci
patrí do jednej povinnosti. Zdrojový mesiac a mesiac prehľadu sa môžu líšiť.

| Príjemca | Obdobie | Zobrazené vybavenie do |
|---|---|---|
| Sociálna poisťovňa | Uzavretý mzdový mesiac | Uložený výplatný termín |
| Každá dotknutá zdravotná poisťovňa | Uzavretý mzdový mesiac | Výplatný termín + 3 kalendárne dni |
| Finančná správa | Overený mesiac vyplatenia | Koniec nasledujúceho mesiaca, s daňovým pracovným kalendárom |

Pri poisťovniach ide o konzervatívne prevádzkové dátumy. Aplikácia na ne neprenáša víkendové predĺženia
z daňového procesu. Pri neštandardnom výplatnom režime a zákonných výnimkách musí lehotu posúdiť odborník.

Účtovník v **Mzdových podaniach** uloží presný externe pripravený výkaz a uvedie druh/verziu formulára.
Potvrdí odbornú kontrolu príjemcu, firmy, obdobia a úplnosti; pri FS aj ďalších príjmov mimo aplikácie.
Príprava, evidované odoslanie, doložené prijatie, odmietnutie a preverenie sú samostatné stavy.
Prijatie a odmietnutie potrebujú originál skontrolovanej potvrdenky. Prijatie nepotvrdzuje vecnú správnosť.
Neoverujeme elektronické podpisy potvrdeniek ani výsledky cez API príjemcu.

Spoločný pracovný zoznam **/ucto/podania** ukazuje nedokončených príjemcov aj starších období, vrátane
chýbajúceho overenia výplaty. Termíny sa dokončia iba pri prijatí aktuálnej verzie so zhodným zdrojom.
Vlastník klienta má rovnaký prehľad a dokumenty na čítanie, bez novej administračnej úlohy. Pozvaní členovia
nemajú prístup k mzdovým originálom ani týmto stránkam; kompletný export je tiež vyhradený vlastníkovi.

## Opravy, oprávnenia a uchovanie

- Opravu potvrdenej výplaty robí správca s dôvodom. Vzniká nový záznam s osobou a časom; pôvodný zostáva.
  Zmena zdrojov zneplatní aktuálne dokončenie FS prehľadu. Starý prijatý súbor a potvrdenka zostávajú
  dostupné ako historický dôkaz; novú zákonnú formu opravy vždy vyberie odborník.
- Ďalšia verzia už odoslaného, prijatého alebo preverovaného výkazu vyžaduje správcu a dôvod.
  Neodoslaná alebo odmietnutá verzia sa môže odborne nahradiť, pričom pôvodná história zostáva zachovaná.
  Po evidovanom odoslaní, prijatí, preverení alebo skutočnej výplate nemožno jednoducho znovu otvoriť mzdy.
- Zápisy v SQL kontrolujú aktuálne pridelenie účtovníka, rolu a revíziu v transakcii. Citlivé zmeny
  a stiahnutie originálov vyžadujú čerstvé potvrdenie prístupu. Zamknuté účtovné sumy sa nemenia pri
  dodatočnom pripojení staršej evidencie.
- Rovnaké bajty potvrdenky nemožno použiť pre iný dokument. Referencie sa porovnávajú v rámci príjemcu;
  FS zdieľa tento priestor so svojimi daňovými formulármi. Nezávislé poisťovne môžu mať rovnaké číslo,
  ale každá potrebuje vlastný zodpovedajúci originál. Účtovník musí overiť význam referencie na portáli.
- Export obsahuje zdroje uzávierok, overené výplaty, povinnosti, všetky verzie, históriu a originály.
  Závislosti cez rok zostávajú v spoločných JSON záznamoch; binárne výkazy a potvrdenky sú podľa roka podania.
  Každý originál má kontrolný súčet. Chýbajúci alebo poškodený súbor znemožní úspešný úplný export.
- Nedokončené aktuálne podanie alebo neoverená výplata kladného príjmu blokujú zmrazenie na odovzdanie.
  Incidenty a právne uchovanie chránia aj tieto tabuľky a originály. Riadený výmaz používa existujúce
  potvrdenie úplného exportu a intervenčné okno. Historické uzávierky bez novej evidencie sa automaticky
  nepovažujú za potvrdené; pred odovzdaním vyžadujú osobitnú rekonciliáciu.

## Otvorený rozsah pred pilotom

Čiastočné výplaty, rôzne dátumy pre zamestnancov tej istej uzávierky, nepeňažné príjmy, nepravidelné
príjmy, doplatky po skončení pracovného pomeru, registrácie zamestnancov, ročné hlásenie a ročné
zúčtovanie tento tok automaticky nevyrieši. Nulová mzda v aplikácii nedokazuje, že firma nemá žiadnu
inú povinnosť voči FS. Tieto prípady potrebuje preveriť odborník v inom vhodnom mzdovom nástroji;
nesmú sa označiť za podporenú automatizáciu.

Pred pilotom treba otestovať reálne exporty a výsledné potvrdenky každého príjemcu, nadväzujúce chybové
protokoly, obsahové opravy už doručených miezd a úplnosť údajov pri prevzatí firmy. Súčasné testy používajú
iba **TEST_ONLY** súbory. Obnova D1/R2 je syntetická; produkčná obnova, živé integrácie a právne/poistné
schválenie zostávajú otvorené. Tento modul nemení schvaľovanie zmlúv ani rozsah služby pre veľké firmy.

## Primárne podklady

Overené 16. 10. 2026:

- [Finančná správa: mesačné prehľady](https://podpora.financnasprava.sk/879943-Pod%C3%A1vanie-mesa%C4%8Dn%C3%BDch-preh%C4%BEadov):
  skutočne zúčtované a vyplatené príjmy, mesačná lehota a PREHLADv26 pre roky 2026/2027.
- [Sociálna poisťovňa: zasielanie dokladov](https://socpoist.sk/kto-som/zamestnavatel/zasielanie-vykazov-dokladov/zasielat-spravne-vcas-vsetky-doklady):
  rozlišuje pravidelný mesačný výkaz a výkaz nepravidelných príjmov; nemožno ich zameniť.
- [Sociálna poisťovňa: platenie poistného](https://socpoist.sk/kto-som/zamestnavatel/platenie-poistneho/ako-zaplatim-poistne):
  väzba pravidelného poistného na určený výplatný deň a osobitné režimy splatnosti.
- [VšZP: zamestnávateľ](https://www.vszp.sk/platitelia/platenie-poistneho/zamestnavatel/):
  výkaz 514 pre poistencov poisťovne, lehota od splatnosti preddavku a rozdielne opravné postupy.
- [Dôvera: mesačné výkazy](https://www.dovera.sk/platitel/zamestnavatel/tema-poistne-mesacne-vykazy/zakladne-informacie-k-mesacnym-vykazom):
  povinnosť pri zastúpenom poistencovi a postupy riadneho, opravného a aditívneho výkazu.

Konkrétny zákonný režim, aktuálne znenie predpisov a povinnosti mimo podporovaného mesačného toku
musí pri zavádzaní klienta potvrdiť zodpovedný odborník. Verejný návod nie je právne schválenie celého produktu.
