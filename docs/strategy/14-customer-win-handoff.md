# Pokyn majiteľa 22. 10. 2026: „zákazník vyhráva" a odovzdanie ďalšej práce

Toto je syntéza pokynu Christiana (rovnaký text dostal ChatGPT, Claude a teraz tento model), zmapovaná na
to, čo je už v repozitári, plus nové konkrétne body, ktoré zatiaľ nikde neboli. Nie je to nové rozhodnutie
o smerovaní ani sľub výsledku. Zápis má slúžiť na pokračovanie práce a na odovzdanie Claudovi/Codex.

## Čo majiteľ žiada (zhrnuté)

1. Prevziať stratégiu Revolut / Trading 212 / Robinhood: modernizovať starý priemysel (účtovníctvo),
   byť najlacnejší a najľudskejší, dať zákazníkovi pocit, že vyhral on — nie my.
2. Konkurenčná výhoda cez vlastné AI („cloud API, ktoré odpovedá") a prípadne komunitu / sociálny prvok.
3. Otázka na prístup: má model prístup na Cloudflare a doménu, aby menil live web?
4. Bezplatné veci (ľudia milujú zadarmo): SRO účtovníctvo zadarmo, prevzatie od inej firmy zadarmo
   (stačí odkliknúť), fakturačný nástroj zadarmo a lepší ako Kros/SuperFaktúra, AI skener účteniek,
   kalkulačka daní, nástroj pre živnostníkov/SRO z nahraných dokladov, 100 € kredit, založenie SRO zadarmo.
5. Založenie SRO zadarmo viazané na doživotné vedenie účtovníctva u nás — predané ako výborný deal,
   nie ako putá.
6. Dôveryhodnosť, psychologické princípy (inšpirácia Revolut/T212/Robinhood), jednoduchosť v štýle Jobsa.
7. Obrázky dogenerovať (3D, bezchybné, ako tie, čo už na webe sú).
8. „Jedna vec, ktorú treba dokončiť" — premyslieť a dať návrhy do poznámok.

## Kde to už je (neopakovať prácu)

- [13 Zákazník má dostať hodnotu skôr, než podpíše zmluvu](13-customer-advantage.md) — G1–G6, bezplatné
  nástroje, kredit, založenie, AI, komunita, s podmienkami spustenia. Implementované: bezplatný fakturačný
  nástroj `/faktura-zadarmo` + `/bezplatne-nastroje` a spravovaný prechod G1. Ostatné má stav návrhu.
- [12 Jednoduchosť produktu](12-product-simplicity.md) — Jobs/J1–J5 (štyri políčka, dva pracovné pohľady).
- [Výskum dôvery a výhodnosti](../research/trust-and-value-2026-10-22.md) — psychológia S1–S12
  (prospect theory, férovosť, transparentnosť práce, labor illusion, divide-and-prosper, referral,
  choice overload, vnímaná kvalita ceny). Už prenesené do webu a cenového porovnania.
- [01 Executive Strategy](01-executive-strategy.md) — positioning: odporúčaná **B** („viditeľne vybavená
  práca + dostupný odborník"), nie **A** („najlacnejšie automatické účtovníctvo").
- [09 Top 10 Priorities](09-top-10-priorities.md) — P1–P10 s dôkazmi, testami a meraním.

Väčšina vízie je teda už zachytená. Zvyšok tohto dokumentu rieši to, čo je v pokyne nové.

## Nové body z tohto pokynu

### 1. Prístup na GitHub, Cloudflare a doménu (priama odpoveď)

Stav k 22. 10. 2026 na tomto počítači: **žiadne oprávnenia na zápis.**

- `gh` CLI nie je nainštalovaný; nie je nastavená git identita, SSH kľúče, ani `CLOUDFLARE_API_TOKEN`.
- Model vie repo čítať a klonovať (je public) a vie robiť lokálnu prácu, ale **nevie pushnúť do GitHubu
  ani priamo nasadiť do Cloudflare**.
- Nasadenie je podľa [13](13-customer-advantage.md) zapojené ako `main -> Cloudflare Workers Builds ->
  firmony.io`. To znamená, že live zmena sa udeje **zlúčením do `main`**, nie ručným deployom — preto
  stačí, aby model vedel pushnúť/mergnúť do GitHubu.

Ako to odomknúť (treba od majiteľa, vybrať jednu cestu):

1. `gh auth login` (interaktívne, prehliadač) — najjednoduchšie pre prácu s PR/issues/deploy cez git.
2. Osobný GitHub token (PAT) s oprávnením `repo` + `workflow`, uložený ako secret/credential.
3. SSH kľúč registrovaný na účte `grapuu`.
4. (Iba pre priamy Cloudflare) `wrangler login` alebo API token + account ID.

Kým prístup nie je, model pripravuje vetvy lokálne a odovzdá ich na push/merge majiteľovi.

### 2. „Jedna vec na dokončenie" = PR #29 (Asistent Firmony, G2)

- PR **#29** `codex/contextual-assistant` → `main`. Názov: „Asistent Firmony s aktuálnymi údajmi a
  bezpečnou cestou k účtovníčke". 2 commity, 35 súborov, +1012/−11. Dokumentácia `docs/assistant.md`,
  kód `src/assistant/*` + `src/views/assistant.tsx` + testy (units/runtime/browser).
- Návrh zodpovedá pokynu „vlastné AI cez cloud API": Anthropic API (Haiku 5.5) sa volá **iba na
  zatriedenie otázky do pevnej témy** (7 tém). Model nevidí firemný kontext, negeneruje odpoveď, rady,
  platby, podpisy ani zmeny knihy — odpoveď zostavuje Firmony z oprávnených údajov. Limity 12/40/200
  volaní/deň, žiadny uložený chat, schéma 79. To je bezpečná a pravdivá realizácia „AI výhody".
- **Prečo ešte nie je v `main`:** git `merge-tree` je čistý (žiadne konflikty, vetva je 2 commity pred
  `main`). Blokuje ho CI `check`, ktorý padá **nie na TypeScript**, ale na
  `Failed to CreateArtifact: Artifact storage quota has been hit` (vyčerpaná kvóta GitHub Actions
  artifact storage; + deprecation warning Node 20 → 24).
- **Lokálne overené 22. 10. 2026 na head commite vetvy:** `npm run check` (TypeScript čisté),
  `npm test` (1 485 unit + 12 deployment testov) a `npm run test:peppol` (25) prechádzajú.
  Potvrdené, že blokáda je infraštruktúrna kvóta, nie kód.
- Kroky na dokončenie: (a) vymazať staré artefakty v Actions / počkať na prepočet kvóty, (b) znížiť
  upload artefaktov v workflow, (c) znovu spustiť `check` na presnom head commitu, (d) po zelenom
  merge → production verification (presný commit, schéma 79, `/inside.js` a ďalšie assety).

### 3. Obrázky (priama odpoveď)

Tento model **nedokáže generovať obrázky** — nemá nástroj na generovanie. Existujúce assety sú
v `art-src/` (zdroje) a `public/art/` (používané na webe). Nové 3D generácie musí dodať externý
image model; model vie pripraviť presnú špecifikáciu (predmet, štýl, pomer, pozadie, kde sa má
použiť) a zapojiť hotové súbory do kódu.

### 4. Napätie „najlacnejší" vs „vysoká marža" vs „dôvera"

Treba ho vyriešiť explicitne, inak si stratégia protirečí:

- „Najlacnejší" je pozícia A z [01](01-executive-strategy.md) — najľahšie napodobiteľná, tlak na cenu,
  riziko poddimenzovanej ľudskej kontroly. Účtovná služba nie je Robinhood: zodpovednosť a dôvera sú
  iné ako nulový poplatok za obchod.
- Odporúčaná a v dokumentoch už zvolená je **B**: klient vidí vybavenú prácu a má dostupného odborníka;
  „výhra" sa meria v ušetrenom čase a v hotových povinnostiach, nie len v nižšej cene.
- „Zákazník vyhráva" sa dá realizovať **bez zníženia ceny**: bezplatné nástroje a kredit prinášajú
  hodnotu pred zmluvou, maržu chráni viditeľná odborná práca (S5 labor illusion, S4 integrita dôvery).
- Ceny 89/169/329 € zostávajú, kým sa nepreukáže úplná ekonomika (P8). Kredit/zadarmo akcie majú v
  [13](13-customer-advantage.md) podmienky merania (CAC, príspevok, rozpočet nevyčerpaných výhod).

### 5. „Založenie SRO zadarmo" viazané na doživotné účtovníctvo

Už spracované v [13](13-customer-advantage.md) ako nespúšťané (G4), s právnymi odkazmi L2–L4
(§ 3a/§ 57 Obchodného zákonníka, forma založenia). Rámec: viazanosť sa nesmie predať ako „putá"
(klamlivé), ale ako výhodný balík; zároveň nesmie byť nespravodlivou podmienkou. Doživotná viazanosť
je právne a reputačne krehká — navrhujem pred akýmkoľvek nasadením právne posúdenie (existujúci
drafts `advokat-kosice.txt`) a pilot s meraním.

## Navrhované poradie ďalšej práce

1. **Odomknúť prístup** (bod 1) — bez neho nič nejde live.
2. **Dokončiť PR #29** (bod 2) — vyčistiť kvótu artefaktov, zelený `check`, merge, production verify.
   Toto je konkrétna „jedna vec na dokončenie".
3. **Komunikácia „zákazník vyhráva"** na webe — premietnuť princípy S1–S12 do hero/copy/onboardingu:
   merateľná výhra (ušetrený čas, vybavené povinnosti), férové ceny, viditeľná práca, znížená námaha
   prechodu, žiadne skryté viazanosti. Používateľský pilot pred zverejnením.
4. **Rozšíriť bezplatné nástroje** podľa [13](13-customer-advantage.md): AI daňový odhad / nástroj pre
   živnostníkov a SRO, verejná AI čítačka — s podmienkami spustenia (náklady, dáta, AML).
5. **Kredit 100 € a založenie SRO** — až po právnom a ekonomickom posúdení, s meraním CAC/retencie.
6. **Obrázky** — externá generácia podľa špecifikácie, zapojiť do kódu.

## Hranice, ktoré si strážime

Žiadna z týchto stratégií nepotvrdzuje miliardovú hodnotu ani garantovaný podiel na trhu. Komunikácia
nesmie sľubovať bezchybný import, nulové ľudské úkony, automatické podania ani výsledky, ktoré nie sú
dokázané. Každý sľub má mať dôkaz (pravidlo z [README](README.md)). Nové výhody sa nenasadzujú bez
merania nákladov a kapacity (P8).
