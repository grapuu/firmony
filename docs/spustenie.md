# Spustenie Firmony krok za krokom

Pre Christiana, stav k 21. októbru 2026. Doména a infraštruktúra v krokoch 1 až 5 sú už pripravené. Pokračujte
prvým správcom a overením skutočných podmienok služby. Kľúče a heslá neposielajte do chatu ani do GitHubu.
Podrobnosti AML sú v [implementácii](aml/implementation.md) a [programe](aml/program.html).

## 1. Doména

Hotové 20. októbra 2026. firmony.io je pripojená ku Cloudflare a nastavená v aplikácii. Tento krok neopakujte.

## 2. Databáza a úložisko (obe v EÚ)

Hotové 20. októbra 2026. Existujú D1 `firmony` a R2 `firmony-files` v EÚ. Nevytvárajte ich znova. Aktuálna schéma
je 77; ďalšie zmeny schémy sú iba nové kroky.

## 3. Worker

Hotové 20. októbra 2026. Worker je pripojený k `grapuu/firmony`. Každý push do `main` spúšťa nasadenie. Zmeny sa
pripravujú v samostatnej vetve a zlučujú až po všetkých požadovaných kontrolách podľa CLAUDE.md.

Po zlúčení overte aj výsledok `Production verification`: potvrdí celý commit aktívny na firmony.io, schému a
verejné návody. Podrobnosti sú v [overení nasadenia](deployment.md). Úspešná kontrola vetvy sama nepotvrdzuje
dokončené nasadenie v Cloudflare.

## 4. E-mail

Hotové 20. októbra 2026. Príjem cez Email Routing aj odosielanie pre firmony.io sú nastavené. Pri skúške overte
skutočné doručenie klientovi aj spracovanie dokladu; samotné nastavenie nie je dôkazom konkrétneho doručenia.

## 5. Čítanie dokladov

Existujúci secret `ANTHROPIC_API_KEY` je podľa projektových podkladov vložený od 20. októbra 2026. Jeho hodnotu
netreba čítať ani posielať. Bez čítačky ide doklad účtovníčke. Skutočné meranie na 30 syntetických dokladoch a jeho
hranice sú v [uložených výsledkoch](reader/measurement-2026-10-21.json). Správna suma sama osebe nepotvrdzuje kategóriu.

## 6. Prvý správca (ty)

1. Otvorte `https://firmony.io/app/prvy-spravca`. Ukáže tri nastavenia a náhodný kód.
2. Pridajte ich na Workeri podľa stránky: `TEAM_BOOTSTRAP_EMAIL` (Text), `TEAM_BOOTSTRAP_TOKEN` (**Secret**),
   `TEAM_BOOTSTRAP_EXPIRES_AT` (Text).
3. Prihláste sa na `https://firmony.io/app/prihlasenie` uvedenou adresou a otvorte odkaz z e-mailu.
4. V menu Zabezpečenie prístupu zadajte kód a zaregistrujte kľúč (Face ID, odtlačok alebo PIN počítača). Pridajte
   **druhý kľúč na inom zariadení** (napríklad telefón aj počítač).
5. Po úspešnej aktivácii odstráňte na Workeri `TEAM_BOOTSTRAP_TOKEN`.

Pri strate všetkých kľúčov obnovu potvrdzujú dvaja iní správcovia. Pripravte preto aj zastupovanie.

Na `/ucto/aml/urcena-osoba` overte poverenie podľa skutočne podpísaného programu. V jeho aktuálnom bode 2.1 je
určenou osobou Christian Juhás. Prvý správca vytvára prvé aplikačné poverenie, ďalšiu zmenu zaznamenáva súčasná
určená osoba s referenciou na zmenu programu. Samotná rola administrátora nenahrádza toto poverenie.

## 7. Účtovníčka

1. V Účtovníctve pre tím, Tím, pridajte jej meno, e-mail a rolu účtovníčka.
2. Zabezpečenie prístupu, Aktivácie a obnova prístupov: jej e-mail, účel „Prvý kľúč nového člena tímu“ a kde a
   ako ste overili jej totožnosť. Kód sa ukáže iba raz: odovzdajte ho overeným samostatným kanálom podľa aplikácie.
3. Ona sa prihlási svojím e-mailom, v Zabezpečení prístupu zadá kód a zaregistruje si dva kľúče.
4. Pred prístupom ku klientskym údajom dokončite zmluvný rozsah, mlčanlivosť, ochranu údajov a odbornú prípravu.
   [Pracovný návrh zmluvy](drafts/README.md) nie je podpísanou dohodou.

## 8. europio vo Fakturácii

V Účtovníctve pre tím, Fakturácia, nastavte skutočné údaje europio, platobný účet a začiatok jeho účtovníctva.
Pri skúške overte vystavenie a doručenie faktúry za službu podľa dohodnutého rozsahu.

## 9. Pred prvým klientom

Tieto kroky vyžadujú skutočné podklady a rozhodnutia. Kým nie sú splnené príslušné kontroly, zmluvu nemožno uzavrieť.

1. Osvedčenie pre Vedenie účtovníctva bolo podľa projektových podkladov prijaté 21. októbra, s oprávnením od
   20. októbra 2026. Uchovajte pôvodný podpísaný súbor.
2. Podpíšte právne posúdený AML program a dokončite goAML. Projektový termín je 19. november 2026. § 21 ods. 2
   stanovuje registráciu do 30 dní od vzniku postavenia povinnej osoby, zákon obsahuje aj prechodný § 36d.
   Skutočnú registráciu musí potvrdiť Christian, nie poznámka v GitHube.
3. Získajte konkrétnu poistnú zmluvu a právne stanovisko k dokumentom služby. Návrhy v `docs/drafts/` nenahrádzajú
   ich schválenie. Rozsah krytia sa musí zhodovať so službou a zmluvnou zodpovednosťou.
4. Doplňte blokované overenie úplných originálov EUR-Lex: zoznam EÚ 2016/1675 a relevantné ustanovenia GDPR.
   Určená osoba alebo advokát porovná krajiny s `src/aml/countries.ts` a doplní skutočnú spracovateľskú prílohu.
5. Na `/ucto/ziadosti/schvalenie` zaznamenajte skutočné právne a poistné referencie a platnosť. Stránka pripraví
   `CONTRACT_RELEASE`, ktorý vložíte na Worker ako Text. Schválenie musí zodpovedať aktuálnym dokumentom a katalógu;
   po ich zmene staré schválenie nestačí. Nevypĺňajte fiktívne referencie kvôli testu.
6. Dokončite výber a overenie digitálneho poštára. Príprava XML a validácia Peppol samy osebe nepotvrdzujú aktívne
   doručovanie cez poskytovateľa.

Originál AML zákona bol opätovne prečítaný 21. októbra 2026 v znení od 17. augusta 2026, najmä § 8, § 10,
§ 19, § 20, § 21 ods. 2 a § 36d:
https://static.slov-lex.sk/static/SK/ZZ/2008/297/20260817.html

## 10. Prijatie firmy a celý skúšobný mesiac

Produkcia už neumožňuje založiť klienta bez IČO len zaškrtnutím papierovej zmluvy. Platí to aj pre skúšanie.

1. Pri online žiadosti klient najprv vyplní vyhlásenie a nahrá pôvodný podpísaný súbor. Pri papierovej zmluve
   začnite na `/ucto/aml/papier`. Firma a konajúca osoba sa preverujú v registri.
2. V Žiadostiach alebo v overení papierovej objednávky odborník zaznamená kvalifikovaný podpis, zhodu osoby
   a podpísaného obsahu, KUV, PEP, sankcie EÚ aj OSN a krajiny. Každá kontrola potrebuje zdroj, autora a čas.
   Nahratie PDF ani ASiC-E nie je samo osebe overením podpisu.
3. Určená osoba potvrdí riziko a prijatie. Zvýšené riziko potrebuje aj zdokumentovanú zvýšenú starostlivosť,
   súhlas, účet v mene klienta v banke EÚ a prvú platbu s overenými originálmi podľa programu.
4. Až po aktuálnom AML overení a právnom aj poistnom uvoľnení možno uzavrieť zmluvu. Papierový klient vzniká
   z overenej objednávky po zaznamenaní podpísanej zmluvy.
5. Spoločné konanie viacerých zástupcov a fyzická identifikácia bez QES zatiaľ nemajú dokončený bezpečný postup.
   Neprekonávajte blokovanie zadaním fiktívneho jediného konateľa alebo zmenou údajov.

Nácvik s vymyslenými firmami a dokladmi robte v izolovanom playgrounde podľa CLAUDE.md. Produkčný skúšobný klient
prechádza rovnakým overením ako každý skutočný klient. Do živých účtovných kníh nevkladajte vymyslené obchodné prípady.

S účtovníčkou prejdite doklady z fotky a e-mailu, bankové podklady a úhrady, kontrolu účtovania, chýbajúci doklad,
DPH a výkazy, mzdy podľa potreby, opravu chyby a export. Pri podaní overte aj oprávnenie a potvrdenie úradu.
Výsledok zapíšte s dátumom, rolou, podkladmi a konkrétnou chybou. Automatické účtovanie zapínajte až po overení
nastavení a odborného procesu. Zelené automatické testy nenahrádzajú túto skúšku ani skutočnú produkčnú obnovu.

Klientsky prístup na stiahnutie trvá 90 dní od skončenia zmluvy. Nie je to okamih výmazu: zákonný archív zostáva
najmenej päť rokov a neskôr je dostupný iba určenej osobe na čítanie. Otvorené prípady a ďalšie uchovania môžu lehotu
predĺžiť. Účtovná archivačná povinnosť klienta sa posudzuje samostatne.

## Čo nikdy

- Nevkladajte kľúč ani heslo do chatu ani do GitHubu.
- Nemažte nič v R2 ani v D1 ručne cez dashboard.
- Nemažte Worker ani databázu.
