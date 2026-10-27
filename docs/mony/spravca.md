# Podklady pre správcu

Podklady asistenta Mony pre správcu (majiteľ, Christian Juhás; 27. 10. 2026). Hlavný zdroj pravdy sú pracovné
poznámky CLAUDE.md: novší dátumovaný záznam má prednosť pred starším. Mony dostane k otázke aj príslušné časti poznámok,
dokumentov a mapy kódu.

## Orientácia

- Firmony je online účtovníctvo pre slovenské firmy, prevádzkuje ho europio s. r. o. (konateľ Christian Juhás). Web a aplikácia bežia ostro na firmony.io od 20. 10. 2026.
- Technika: jeden Cloudflare Worker (Hono), databáza D1 a súbory R2 v EÚ, nasadenie samé z GitHubu (grapuu/firmony, vetva main) cez Workers Builds; po každom nasadení beží Production verification. Kľúč ANTHROPIC_API_KEY je tajomstvo Workera.
- Správca má na /ucto navyše: Žiadosti z webu (/ucto/ziadosti), Tím (/ucto/tim), Fakturácia klientov (/ucto/fakturacia), Analytika (/ucto/analytika), Fakturačné účty zdarma (/ucto/fakturacne-ucty), AI asistent a jeho vypínač (/ucto/ai/asistent), Presnosť AI (/ucto/ai), Výkaz práce všetkých (/ucto/vykaz), Aktivácie a obnova prístupov (/auth/grants).
- Odpovede pre správcu: verdikt na začiatku, krátko, ľudsky, bez omáčky. Čo nie je postavené alebo zmerané, povedať rovno.

## Audit softvéru (27. 10. 2026)

- Verdikt: softvér je pre bežnú s. r. o. funkčne kompletný. Účtovníčka nič neprepisuje ani nepočíta; kontroluje, rozhoduje a podáva.
- Podiel softvéru: odhad asi 75 % času práce klasickej účtovníčky (bežná firma s DPH a 40 dokladmi: z asi 4 hodín mesačne ostane asi hodina), s automatickým účtovaním a naučenými pravidlami cieľ 85 až 90 %. Nie je zmerané; zmeria sa v prvom mesiaci podľa času na doklad vo Výkaze práce.
- AI (Claude API) je na štyroch miestach: čítanie dokladov (fotka, PDF, sken; Claude Haiku 5.5), faktúra z jednej vety, rýchly asistent v Správach (len rozpozná tému) a asistent Mony. Čísla (DPH, mzdy, závierka, párovanie) počíta presný kód podľa zákona, nie AI.
- Meranie čítačky: na 30 vymyslených dokladoch sumy, DPH, dátumy a IČO správne v 30 z 30; kategória v 22 až 26 z 30, preto ju potvrdzuje účtovníčka. Čítanie stojí menej ako desatinu centu za doklad.
- Automatizované: príjem dokladov (appka, e-mail, e-faktúra), výpisy (SLSP a ČSOB e-mailom, Fio tokenom, ostatné XML raz mesačne), párovanie platieb, platby bez dokladu, podvojné účtovníctvo celé, Účtuje samo pre bežné doklady do 1 700 €, DPH so všetkými výkazmi a špeciálnymi režimami, mzdy celé so súbormi pre poisťovne a daňový úrad, závierka s DPPO, termíny a pripomienky, podania jedným balíkom, fakturácia klientov (dobropisy, zálohy, opakované, upomienky, úroky, platobné príkazy, schvaľovanie), prevzatie z Pohody, Omegy, Money, KROS, AML kontrola pred zmluvou, zmluva online, export a odovzdanie.
- Ostáva účtovníčke: kontrola a potvrdenie dokladov (odhad pol minúty až minúta na doklad), neštandardné prípady, podanie cez eDane a portály poisťovní pod plnou mocou s potvrdenkou, vstupy do miezd a prihlášky zamestnancov, odborné úpravy závierky, odborné otázky klientov, kontrola automaticky zaúčtovaných dokladov. AML overenie robí určená osoba (správca).
- Čo ešte nie je: skúšobný mesiac so skutočnou firmou, odosielanie cez Peppol (postavené, zapne sa po zmluve s poskytovateľom), open banking pre všetky banky (pri asi 250 klientoch, 900 € mesačne), priame čítanie eKasy (len overovateľ), priame podanie na finančnú správu, zriedkavé mzdové prípady (zrážky dohodou, sezónna práca, kolektívna zmluva), výročná správa auditovaných firiem, daňové priznanie investorov.

## Ekonomika

- Ceny bez DPH: Štart 89 € mesačne (do 20 dokladov, neplatiteľ DPH), Rast 169 € (do 60, platiteľ), Firma 329 € (do 150). Mesiac s viac dokladmi sa vyúčtuje ako vyšší balík, nad 150 na mieru. Mzdy 15 € za človeka mesačne, závierka s daňovým priznaním 249 € ročne. Prvý mesiac zadarmo, bez viazanosti. Ceny ostávajú vysoko (rozhodnutie z 20. 10. 2026: elitná služba, marža z automatizácie, nie zo zliav).
- Účtovníčka je platená za odvedenú prácu (návrh, treba potvrdiť s ňou): 0,50 € doklad, 12 € obdobie DPH s podaným priznaním, 6 € ostatný mesiac klienta, 4 € osoba v mzdách mesačne, 90 € závierka, 30 € prevzatie klienta, vlastné opravy zadarmo. Výkaz práce (/ucto/vykaz) to spočíta sám, aj ako CSV.
- Príklad: firma s DPH a 40 dokladmi stojí účtovníčku 32 € mesačne, klient platí 169 €. Marže po účtovníčke a technike: bežný mesiac 82 % Štart, 78 % Rast a Firma; plný balík 78, 72 a 70 %; mzdy 71 %, závierka 62 %. Spodná hranica je 60 %.
- Náklady techniky na klienta: čítanie dokladov pod cent, server a e-maily desiatky centov, poštár Peppol podľa zmluvy (odhad finančnej správy 5 až 12 € mesačne za firmu, neoverené), banka zadarmo kým nie je open banking.

## Pred prvým klientom (kroky správcu)

- Podpísať AML program (docs/aml/program.html), registrácia europio v goAML do 19. 11. 2026, zmena predmetu podnikania v obchodnom registri cez notára alebo advokáta.
- Advokát: podmienky, zmluva, plná moc, AML program, zmluva s účtovníčkou. Poistenie zodpovednosti za vedenie účtovníctva. Bez referencií advokáta a poisťovne ostáva podpisovanie zmlúv online zatvorené (CONTRACT_RELEASE na /ucto/ziadosti/schvalenie).
- Zmluva s poskytovateľom poštára Peppol (Flowis alebo Qvalia). Zmluva s účtovníčkou podľa sadzieb vyššie.
- Skúšobný mesiac so skutočnou overenou firmou, každá chyba zapísaná a opravená.

## Tím a prístupy

- Nová účtovníčka: správca ju pridá na /ucto/tim, ona dostane pozvánku e-mailom. Na /auth/grants správca vytvorí jednorazový aktivačný kód (s referenciou overenia totožnosti) a odovzdá jej ho mimo e-mailu, napríklad osobne alebo telefonicky. Ona sa prihlási odkazom, zadá kód a uloží si prihlasovací kľúč, ideálne aj záložný.
- Strata všetkých kľúčov člena tímu: obnovu schvaľujú dvaja ďalší správcovia. Kým je správca jeden, treba mať záložný kľúč (správca má MacBook cez iCloud a záložný v Google).
- Klienti sa prihlasujú kľúčom jedným dotykom, e-mail len prvýkrát; e-mail je pre klienta koreň účtu, takže stratený telefón ho nezamkne.

## Kde čo je v kóde

- src/index.tsx verejný web a hlavný router; src/app aplikácia klienta (routes.tsx, store.ts, ledger.ts kniha, vat.ts DPH, payroll.ts mzdy, closing.ts závierka, read.ts čítačka dokladov, match.ts párovanie, autobook.ts Účtuje samo, invoices.ts faktúry); src/team časť pre tím (routes.tsx, deadlines.ts termíny, billing.ts fakturácia klientov, work-pay.ts výkaz práce); src/security prístup a kľúče; src/aml AML; src/peppol e-faktúry; src/assistant asistenti vrátane Mony; src/views stránky; src/copy.ts texty webu, src/app/copy.ts texty aplikácie, src/team/copy.ts texty tímu; src/config.ts ceny, sadzby a limity; src/db.ts schéma databázy (kroky sa len pridávajú).
- Testy: npm run check, npm test, npm run test:runtime (Node 24), test:ui, test:peppol, test:browser. Na main sa ide len po prechode všetkých.
