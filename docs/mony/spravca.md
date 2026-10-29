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

- Ceny bez DPH: Štart 89 € mesačne (do 20 dokladov, neplatiteľ DPH), Rast 169 € (do 60, platiteľ), Firma 329 € (do 150). Mesiac s viac dokladmi sa vyúčtuje ako vyšší balík, nad 150 na mieru. Mzdy 15 € za človeka mesačne, závierka s daňovým priznaním 249 € ročne. Prvý mesiac zadarmo a bez viazanosti pri bežnej zmluve; pri s. r. o. za 1 € sa účtovníctvo platí od vzniku firmy a viazanosť je 36 mesiacov (toto sa na webe nekomunikuje, len sa tak fakturuje). Vystavené faktúry klienta sa do dokladov balíka nerátajú. Ceny ostávajú vysoko (rozhodnutie z 20. 10. 2026: elitná služba, marža z automatizácie, nie zo zliav).
- Účtovníčka je platená za odvedenú prácu (návrh, treba potvrdiť s ňou): 0,50 € doklad, 12 € obdobie DPH s podaným priznaním, 6 € ostatný mesiac klienta, 4 € osoba v mzdách mesačne, 90 € závierka, 30 € prevzatie klienta, vlastné opravy zadarmo. Výkaz práce (/ucto/vykaz) to spočíta sám, aj ako CSV.
- Príklad: firma s DPH a 40 dokladmi stojí účtovníčku 32 € mesačne, klient platí 169 €. Marže po účtovníčke a technike: bežný mesiac 82 % Štart, 78 % Rast a Firma; plný balík 78, 72 a 70 %; mzdy 71 %, závierka 62 %. Spodná hranica je 60 %.
- Náklady techniky na klienta: čítanie dokladov pod cent, server a e-maily desiatky centov, poštár Peppol podľa zmluvy (odhad finančnej správy 5 až 12 € mesačne za firmu, neoverené), banka zadarmo kým nie je open banking.

## Denný chod: kde treba tvoju pozornosť

- Cieľ: firma beží sama, ty riešiš predaj a marketing. Tvoje ruky sú dnes potrebné len pri krokoch nižšie; všetko ostatné robí softvér a účtovníčky.
- E-mail od Firmony je len zvonček bez obsahu (nová žiadosť, podpísané vyhlásenie, interné oznámenie, prihláška na založenie, správa klienta bez pridelenej účtovníčky). Obsah je vždy v aplikácii.
- Domov tímu (/ucto) otvára „Dnes na rade“: čo je po termíne alebo do týždňa. Nedoručené e-maily za 14 dní sú tam označené.
- Žiadosti z webu (/ucto/ziadosti): odpovedať do jedného pracovného dňa. „Posúdiť a poslať zmluvu“ pri s. r. o., a. s. a j. s. a., kde jeden človek koná sám; inak „Založiť bez online zmluvy“ (papierová zmluva) alebo osobná odpoveď.
- Posúdenie žiadosti na jedno kliknutie: stránka „Posúdiť a poslať zmluvu“ príde vyplnená. Aplikácia sama overí v registri právnických osôb, kto za firmu koná, v registri účtovných závierok, či posledná závierka je podaná ako mikro účtovná jednotka (šablóna Úč MUJ) alebo či firma vznikla tento či minulý rok bez závierky, počet zamestnancov (menej ako 10), balík, či má tím aspoň dvoch ľudí, a či platí schválenie advokátom a poisťovňou. Keď všetko sedí, je predvolené „Schváliť štandardný balík“, zaškrtnuté všetky štyri kontroly a vyplnená referencia; stačí „Uložiť posúdenie“. Čo sa overiť nepodarilo, je označené „Na posúdenie“ a rozhodneš ty.
- Posúdenie platí 7 dní. Keď schváliš overenie klienta (AML), predĺži sa samo raz o ďalších 7 dní, ak sa ponuka nezmenila, a konateľovi hneď príde „zmluva je pripravená“. Ak ani potom zmluvu neuzavrie a klikne „Predĺžiť odkaz“, žiadosť sa ti vráti na nové posúdenie.
- Overenie pred zmluvou (určená osoba): keď klient nahrá podpísané vyhlásenie, na stránke objednávky (/ucto/aml/objednavky/…) zapíšeš kontroly so zdrojom a rozhodnutie. Až potom môže konateľ uzavrieť zmluvu. Určenú osobu nastavuje /ucto/aml/urcena-osoba.
- Pripravené kontroly: sankčné zoznamy EÚ a OSN aj rizikové krajiny pripraví aplikácia sama (text so zdrojom, dňom zoznamu a výsledkom). Ty text prečítaš a klikneš „Zapísať kontrolu“. Pri možnej zhode mena aplikácia výsledok nevyberie a vypíše, s kým sa meno zhoduje; rozhodneš ty. Rovnaké meno s iným rokom narodenia uvedie ako vylúčené. Konečných užívateľov výhod aplikácia porovná so spoločníkmi v registri právnických osôb: keď sa mená zhodujú, pripraví zhodu (výšku podielov register neuvádza, berie sa z vyhlásenia); keď je spoločníkom firma alebo sa mená líšia, výsledok nevyberie a napíše, čo nesedí. Ručne ostáva: kvalifikovaný podpis a totožnosť, politicky exponovaná osoba.
- Zoznamy EÚ a OSN si aplikácia sťahuje raz denne priamo od vydavateľov (konsolidovaný zoznam finančných sankcií EÚ, konsolidovaný zoznam Bezpečnostnej rady OSN). Ak sa zoznam nepodarí načítať alebo je starší ako deň a pol, aplikácia nič nepripraví a napíše prečo; kontrolu vtedy urobíš ručne. Deň zoznamov ukazuje aj /healthz.
- Účtovníčka pre nového klienta: pri posúdení žiadosti aj pri založení klienta bez online zmluvy je predvolená účtovníčka s najmenej klientmi; firma založená cez s. r. o. za 1 € ju dostane sama pri zápise. Zmeniť sa dá na stránke klienta.
- Prihlášky na založenie s. r. o. (/ucto/zalozenia): časť nižšie.
- Fakturácia klientom (/ucto/fakturacia) beží sama: 1. až 5. deň v mesiaci o 9:00 aplikácia vystaví a doručí každú faktúru, pri ktorej nie je čo kontrolovať (balík vopred, mzdy a doklady navyše za minulý mesiac, podaná závierka). Zvonček príde len vtedy, keď niektorá faktúra čaká na teba: poznámka „ceny podľa aktuálneho cenníka“ alebo viac dokladov, než má najvyšší balík (dohodnúť cenu). Tú vystavíš po kontrole tlačidlom „Vystaviť“. Upomienky nezaplatených faktúr idú samé o 9:00: klientovi 3 a 14 dní po splatnosti (zvonček s odkazom na faktúru v aplikácii, nie skôr ako 5 dní po pripomienke poslanej ručne), a 30 dní po splatnosti dostaneš zvonček ty a rozhodneš, ako ďalej. Ručne ich možno poslať aj z tej istej stránky.
- Pripomienky nedokončených krokov idú samé o 9:00, aby nikto nemusel nováčikov naháňať: konateľovi, ktorý nedoplnil podklady, 2 a 5 dní po odoslaní odkazu (s novým odkazom, starý prestane platiť); konateľovi po dokončenom overení hneď e-mail „zmluva je pripravená“ a 2 a 5 dní potom pripomienka, kým zmluva nie je uzavretá a ponuka platí; zakladateľovi neodovzdanej prihlášky na s. r. o. za 1 € 3 a 10 dní od jej otvorenia (nie keď na nej práve pracuje); novému klientovi s nedokončenými prvými krokmi (vyhlásenie, plná moc, banka, prvý doklad, schválenie zmluvy o založení) 3 a 10 dní po zmluve zvonček na prehľad. Každá pripomienka ide najviac raz.
- Účtovníčky: nová na /ucto/tim a aktivačný kód na /auth/grants (časť Tím a prístupy). Ich výkazy na /ucto/vykaz; fakturujú europio raz mesačne.
- Chyby aplikácie hlásia účtovníčky na ahoj@firmony.io. Bezpečnostné incidenty a zadržanie dôkazov sú na /ucto/incidenty.

## Založenie s. r. o. za 1 € (určená osoba)

- Zakladateľ na /zalozenie zadá e-mail, dostane odkaz (platí 180 dní), vyplní údaje, nahrá občiansky preukaz, podpíše zmluvu (eID, alebo na papieri a potom osobné stretnutie: totožnosť overí určená osoba s dokladom v ruke a prevezme originál; úradne osvedčený podpis ani fotka dokladu nie sú overením podľa § 8 zákona proti praniu špinavých peňazí), pošle 550 € na účet europio s variabilným symbolom 7RRRRNNNNN a prihlášku odovzdá. Prihlášky sa otvárajú len keď platí CONTRACT_RELEASE a europio má nastavený účet na faktúry; inak stránka zbiera záujemcov cez /zacat?nova=1. Limit 20 firiem mesačne.
- Na /ucto/zalozenia/… zapíšeš každú kontrolu so zdrojom (aspoň 12 znakov): totožnosť, politicky exponovaná osoba, sankčné zoznamy EÚ a OSN, dlžníci (Sociálna poisťovňa, zdravotné poisťovne, finančná správa) a register úpadcov, podpis zmluvy, platba z účtu na meno zakladateľa, pri papierovom podpise aj originál. Sankčné zoznamy a platbu (nájdenú podľa symbolu, s porovnaním mena) pripraví aplikácia, stačí ich prečítať a zaznamenať jedným klikom. Kým niečo chýba, overiť sa nedá.
- Potom „Overiť a prijať“ (zmluva vzniká), alebo „Odmietnuť“ (platbu vrátiť do 14 dní a zaznamenať „Platba je vrátená“), alebo „Vrátiť zakladateľovi na doplnenie“. Kontrola sa zapisuje tlačidlom „Zaznamenať kontrolu“. Ďalšie stavy: Advokát objednaný, Dokumenty advokáta poslané na podpis, Návrh podaný na súd, „Firma je zapísaná“ (zadáš IČO a deň vzniku; aplikácia overí meno v registri, založí firmu a pošle zakladateľovi odkaz na prihlásenie). Účtovníčku jej aplikácia pridelí sama podľa vyťaženia.
- Nesúčinnosť: „Poslať výzvu“ dvakrát, 30 dní po druhej „Odstúpiť pre nesúčinnosť“; platba sa nevracia.
- Ekonomika: 1 € založenie + 549 € kaucia vopred. Advokát a súdny poplatok stoja europio okolo 500 € (odporúčaný paušál advokáta 250 € s DPH, polovica pri podaní). Účtovníctvo sa platí mesačne od vzniku firmy. Kaucia sa vráti až zápočtom na posledné faktúry (od 31. mesiaca) alebo pri skončení; pri skoršom odchode odstupné za zostávajúce mesiace, najviac 12, mínus kaucia. Pri odchode po pár mesiacoch je europio zhruba na nule alebo v pluse; najhorší prípad (nikdy nezaplatí) je asi mínus 70 €, ak sa tvorcovi referencie platí až po troch zaplatených mesiacoch.
- Na webe sa nikdy neuvádza základné imanie 5 000 € ani to, že prvý mesiac zadarmo tu neplatí; v zmluve to celé je.

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
