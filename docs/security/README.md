# Zabezpečenie prístupu a uchovanie dôkazov

Stav implementácie: **15. 10. 2026**. Tento balík nadväzuje na [zodpovednosť](../responsibility/README.md). Obsahuje fungujúce kontroly v aplikácii a lokálne skúšky. Produkčné nastavenia, nezávislá bezpečnostná revízia, prevádzkové osoby a poistné/právne schválenia zostávajú neoverené. Obchodné brány sa tým nemenia na PASS.

| Oblasť | Implementované správanie | Hranica dôkazu |
|---|---|---|
| Tím | E-mailový odkaz vytvorí obmedzenú reláciu. Na prácu s účtovníctvom je povinný WebAuthn kľúč s overením používateľa (UV). | Knižnica vyžaduje PIN/biometriu/zámok autentifikátora; neoverujeme certifikáciu zariadenia ani netvrdíme úroveň AAL. |
| Citlivé úkony | Úplný export vlastníka aj jeho potvrdenie, tímové exporty CSV/XML a miezd, zmeny tímu, odoberanie príloh, posúdenia a uvoľnenie/uzavretie prípadu potrebujú overenie najviac pred piatimi minútami. Bežná tímová práca najviac pred 12 hodinami. | Prístupové práva a členstvo vo firme sa kontrolujú osobitne. Overenie samo nepridá práva. |
| Prvé kľúče | Tím potrebuje nezávisle odovzdaný jednorazový aktivačný kód. Prvý zákaznícky kľúč potrebuje čerstvý e-mailový vstup. | Existujúce kľúče sa e-mailom nenahrádzajú. Obnova účtu zákazníka ide rovnakým schvaľovaným procesom. |
| Obnova prístupu | Dvaja rôzni aktuálni správcovia, odlišní od príjemcu, vlastné referencie overenia, platný jednorazový kód; výmena kľúčov a zrušenie starých relácií i odkazov v jednej transakcii. | Obnova správcu vyžaduje dvoch **ďalších** správcov. Pred prevádzkou zriadiť dostatok správcov a záložných kľúčov. |
| Incidenty | Vlastník, zástupca, naliehavosť, referencia, ďalšia kontrola, história, kontrolovaná zmena pridelenia. | Záznam prípadu neuznáva právnu zodpovednosť, nedokazuje platnosť nároku a neposiela hlásenie poisťovni. |
| Uchovanie | Otvorený prípad aj aktívne uchovanie blokujú príslušný bežný a konečný výmaz. Dátum kontroly ochranu nevypína. | Databázové ochrany bránia výmazu; všetky zmeny zdrojových dát tým nie sú zablokované. Nie je to WORM ani nezávislý archív. |
| Obnova dát | Automatizovaný lokálny prenos všetkých aplikačných tabuliek, schémy, indexov, triggerov, originálov a metadát do oddeleného D1/R2. Kontroly hashov, väzieb, zmlúv, uchovania a zneplatnenia prístupov. | Syntetické dáta pri pozastavených zápisoch; nejde o overenú produkčnú zálohu ani meranie produkčného RPO/RTO. |

## Prevádzkové postupy

- [Podania, originály XML a doložené prijatie](filing-evidence.md) — doplnené 16. 10. 2026, schéma 18; manuálna odborná kontrola potvrdeniek.
- [Mzdové podania podľa príjemcu](payroll-evidence.md) — schémy 19–20; overená výplata, samostatne potvrdené obdobie, originály a opravy.
- [Generovanie PREHLADv26](payroll-generation.md) — bežné mzdy, zdrojová kontrola a nemenný pôvod XML; bez automatického odoslania.
- [Zdravotné výkazy 514](health-reporting.md) — schéma 21; overení poistenci, uzavretý režim, textový import a opravy s históriou.
- [Mesačné výkazy SP](social-reporting.md) — schéma 22; MVPP 2026, spoločná identita, overené IČPV a mesačné hodiny, úplné opravné verzie.
- [Aktivácia, každodenná práca a obnova prístupov](access.md)
- [Incident, súbeh s mazaním a uvoľnenie uchovania](evidence.md)
- [Obnova D1/R2 a dôkazy pripravenosti](recovery.md)

## Technické zdroje a overenie

Overené podľa primárnej dokumentácie 15. 10. 2026:

1. [SimpleWebAuthn server v14](https://simplewebauthn.dev/docs/packages/server): generovanie a overovanie registrácie/prihlásenia, pôvod, RP, challenge a UV. Server aj prehliadač sú pripnuté na `14.0.0` v lockfile; produkčné rozhodnutia sa neopierajú o vlastný kryptografický overovač.
2. [SimpleWebAuthn passkeys](https://simplewebauthn.dev/docs/advanced/passkeys/): overenie používateľa a vlastnosti synchronizovaných kľúčov. Nezamieňať prítomnosť používateľa s jeho overením.
3. [OWASP MFA](https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html): citlivé zmeny a obnova musia zachovať silu ochrany. Samotné dva kanály držby nie sú dôkazom dvoch nezávislých faktorov.
4. [Cloudflare D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/): obnova databázy; nejde o obnovu R2 a operácia prepisuje databázu na mieste. Dĺžku histórie treba potvrdiť podľa skutočného plánu.
5. [Cloudflare D1 import/export](https://developers.cloudflare.com/d1/best-practices/import-export-data/): export a import SQL, poradie závislostí. Lokálny test používajúci skutočné D1 rozhranie nepovažujeme za skúšku prístupov ku Cloudflare účtu.

`npm run check`, `npm test`, `npm run test:runtime` a `npm run test:browser` tvoria regresie. Runtime používa skutočné podpisy P-256 a Workers WebCrypto; verifier nie je mock. Chrome skúška používa virtuálny CTAP2 autentifikátor a dodávaný klientsky balík. Posledný výsledok konkrétneho commitu je v GitHub CI a v PROGRESS. Do CI ani screenshotov nevkladať reálne kódy, relácie alebo osobné doklady.
