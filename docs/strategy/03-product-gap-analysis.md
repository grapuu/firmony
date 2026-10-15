# Product Gap Analysis

Audit kódu vychádza z kumulatívneho PR #4. `main` na začiatku auditu obsahoval starší stav; otvorený PR nie je nasadenie. Miestna snapshot história má iné SHA než GitHub. Rozhodujúci vzdialený základ je uvedený v [indexe](README.md). Nové overenia tejto vetvy sú v [PROGRESS](../../PROGRESS.md).

## Význam stavov

- **HOTOVÉ**: uzavretá implementačná úloha v uvedenom rozsahu; neznamená produkčnú pripravenosť.
- **TESTOVANÉ**: implementácia má automatizované regresné overenie; externé služby sú lokálne náhrady.
- **ČIASTOČNÉ**: časť toku alebo užší variant existuje.
- **PLÁNOVANÉ**: je návrh/roadmapa, nie funkcia.
- **CHÝBA**: v preskúmanom repozitári nebola nájdená implementácia daného rozsahu.
- **NEOVERENÉ**: stav nemožno určiť z dostupných dôkazov, najmä externá prevádzka.

V stĺpci „používateľ/produkcia“ je N vždy skutočná neistota. Automatizované testy sa nesmú vydávať za účtovný posudok, používateľský výskum ani produkčné meranie.

## Mapa schopností

| Schopnosť | Stav kódu | Dôkaz a presný rozsah | Používateľ / produkcia, ďalšia brána |
|---|---|---|---|
| Web, IČO, orientačný cenník, žiadosť | TESTOVANÉ | `src/index.tsx`, `order.ts`, `rpo.ts`, runtime | N; dôveryhodnosť ponuky a konverzia |
| Registrácia, e-mailový vstup, relácie | TESTOVANÉ | `src/app/session.ts`, runtime: expirácia/práva | N; bezpečnostná revízia a obnova prístupu |
| Roly firma/účtovník/admin | TESTOVANÉ | `app/routes.tsx`, `team/store.ts`, izolácia firiem | N; kontrola práv v produkcii |
| MFA pre odborný tím, silnejšie potvrdenie exportu | CHÝBA | Nenájdené TOTP/WebAuthn v prihlásení | Implementovať a otestovať obchádzanie |
| Zmluva a prijaté znenie | OPRAVA PÔVODNÉHO ZÁVERU | Pred týmto rozšírením sa ukladala iba verzia a cena, zobrazoval sa živý text. Nový snapshot a podpisové brány: [zodpovednosť](../responsibility/README.md). | Staré znenia bez snapshotu nie sú dokázané; právne/poistné schválenie N. |
| Plná moc, AML vyhlásenie, interné posúdenie | ČIASTOČNÉ | `papers.ts`, `aml.ts`, príslušné views | Žiadny dôkaz registrácií, reálneho overenia identity a účinnosti mandátov |
| Migrácia starej agendy | ČIASTOČNÉ | `papers.ts`, počiatočné stavy v `ledger*` | Automatický import účtovných databáz CHÝBA; úplnosť preverí účtovník |
| Mobilné pridanie, PDF, e-mail dokladov | TESTOVANÉ | `intake.ts`, `inbox.ts`, runtime | N; doručiteľnosť, škodlivé súbory, reálny mobil |
| OCR/AI návrh a čakanie na kontrolu | TESTOVANÉ | `read.ts`, `booking.ts`, runtime s náhradným modelom | Presnosť skutočného modelu N; stratifikovaná vzorka |
| eKasa kód, duplicity a kontrola originálu | ČIASTOČNÉ | `ekasa.ts`, hash/párovanie | Živá centrálna validácia nie je preukázaná; rovnaké doklady s rôznym obrázkom |
| Banka Enable Banking | TESTOVANÉ | `bank.ts`, návrat autorizácie a lokálny feed | Produkčná aktivácia, pokrytie, poplatky N |
| Fio token, camt.053, zaslaný výpis | TESTOVANÉ | `fio.ts`, `statements.ts`, kontinuita, opakovanie | Reálny účet, tajomstvá a výpadok N |
| Párovanie a nezaúčtované výnimky | TESTOVANÉ | `match.ts`, `store.ts`, ochrana zámkov | Presnosť na reálnych dátach N |
| Vystavená faktúra, verejný odkaz, UBL | TESTOVANÉ | `invoices.ts`, `xml.ts`, runtime | UBL súbor nie je doručenie eFaktúry |
| Certifikovaný poštár, účastníci, webhooky | CHÝBA | `PROGRESS.md` priority 4; nenájdený transport | Výber, zmluva, sandbox a produkčná akceptácia |
| Peppol/EN 16931/SK úplná validácia | CHÝBA | V testoch sú XSD daňových formulárov, nie plná BIS konformita | Pin verzií, negatívne prípady, FS mapovanie |
| Podvojné knihy, analytiky, saldokonto | TESTOVANÉ | `ledger.ts`, `ledger-store.ts` | Nezávislé porovnanie celého roka N |
| Manuálne a počiatočné zápisy | TESTOVANÉ | Formuláre knihy, revízie a zámky | Manuálny zápis nenahrádza osobitnú metodiku majetku/miezd |
| DPH/KV/SV, mesačný SV, opravy | TESTOVANÉ | `vat*`, test/XSD, história a XML hash | Portálové prijatie konkrétneho podania N |
| Termíny, blokátory a pripomienky | TESTOVANÉ | `team/deadlines*`, `remind.ts` | Prevádzkový alarm, zástupca, skutočné doručenie N |
| Mikro závierka a DPPO | ČIASTOČNÉ | `closing*`, kontrolné blokátory, XSD, verzovanie | Rozsah účtovnej jednotky/roka, metodický podpis a prijatie N |
| Výpočet jednoduchých miezd 2026/2027 | ČIASTOČNÉ | `payroll.ts`, histórie; nepodporovaný rok sa odmietne | Dohody, odmeny konateľov, PN/dovolenky, RZD a plné podania nepokryté |
| Majetok, odpisové plány, sklad | CHÝBA | Nie je samostatný register a kompletný životný cyklus | Manuálne účty sú iba technická možnosť |
| Autá, dividendy, OSS/IOSS, transferové prípady | ČIASTOČNÉ | Niektoré generické účty/DPH kategórie | Kompletný špecializovaný postup nie je dokázaný |
| Zámok období a zdrojových zápisov | TESTOVANÉ | `period-schema.ts`, `period-store.ts`, 66 runtime regresií PR #4 | Obídenie cez produkčné admin oprávnenia treba prevádzkovo riešiť |
| História podaní a uzávierok | TESTOVANÉ | Revízie, XML/SHA-256, export | Nie je externé nemenné úložisko všetkých auditných udalostí |
| Úplný export a potvrdené odovzdanie | TESTOVANÉ | `export.ts`, `handover-*`, `purge.ts`, viacročný export | Reálny odberateľský import a obnova N |
| Správy a pridelený účtovník | ČIASTOČNÉ → TESTOVANÉ pre opravu tejto vetvy | Pôvodne vek od poslednej správy; nový front od najstaršej nezodpovedanej | Včasná vecná odpoveď a skutočné vyriešenie stále N |
| Automatické eskalácie, zastupovanie tímu | PLÁNOVANÉ | P2 a P9 | Samotný nový front neznamená 24/7 dohľad |
| Bezpečné obnovenie D1 aj R2 | NEOVERENÉ | Nie je doložený vykonaný restore drill | Kritická brána P1; ZIP export nie je záloha prevádzky |
| Skutočná ekonomika, klientsky čas, spokojnosť | CHÝBA | Žiadny pilotný dataset | P8/P9; plánové odmeny nie sú zmerané náklady |
| Hosting a produkčné integrácie | NEOVERENÉ | Zástupné D1 ID v konfigurácii | Tento audit nepreveroval externú Cloudflare konzolu |

## Architektúra a technický dlh

Cloudflare Worker + Hono SSR/TSX; bez klientskych skriptov; lokálne CSS a fonty. D1 ukladá firmy, prístupy, bankové fakty, doklady, väzby, pravidlá, knihy, podania, mzdy, udalosti a front e-mailov. R2 obsahuje originály. Cron spracúva fronty, obnovy čítania a retenčné kroky. `src/db.ts` má vo východisku 14 idempotentných migračných krokov; zámky a odovzdanie majú databázové ochrany. Podrobnosti zmien ostávajú v PROGRESS, neimplementujú sa znova.

Riziká: veľmi rozsiahle súbory routes/store a runtime scenár s mnohými nadväznosťami; účtovný model odvádza časť výsledkov zo zdrojov, preto každá nová cesta zápisu potrebuje revízie a kontrolu zámkov. Rozdeľovať po menších doménach pri dotknutej zmene, bez plošného prepisu pred pilotom. Pridať reprodukovateľnú odbornú vzorku nezávislú od implementačných vzorcov.

E-mailové prihlásenie prenáša dôveru na schránku. Existujú ochrany relácií, CSRF/Origin, CSP a prístupov, ale tie samy nedokazujú bezpečnosť. Prístup k mzdám, originálom a úplným exportom vyžaduje cielenú revíziu. GDPR tvrdenia o lokalite či subdodávateľoch treba porovnať so skutočnými nastaveniami a zmluvami; z komentára v kóde sa nedajú potvrdiť.

## Overenie a hranica záveru

Východiskový CI na presnom SHA PR #4: **660 jednotkových, 781 runtime a 12 kontrol rozloženia**, natívny TypeScript 7; [run](https://github.com/grapuu/firmony/actions/runs/38720694257). Runtime simuluje banky, register, model a e-mail. Počet testov nie je percento účtovnej správnosti ani pokrytie všetkých zákonov.

Nevyriešené blokátory pôvodného auditu sú poštár, živé banky, potvrdenia podaní, odborná a právna validácia, produkčná bezpečnosť/obnova, meranie kapacity a širšie účtovné prípady. Opravené historické chyby sa nesmú znovu vykazovať ako nové nedostatky. Decembrové rozhodnutie používa [samostatné brány](08-december-launch-plan.md).
