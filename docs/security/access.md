# Aktivácia a obnova prístupov

## Pred prvým povolením tímu

Určiť zodpovedného prevádzkovateľa, nezávislý kanál overenia identity a správcu zariadení. Zvoliť konečnú doménu **pred registráciou kľúčov**: RP je presne hostname z `BRAND.origin`, pôvod musí byť jeho HTTPS adresa. Ľubovoľná náhľadová doména nie je povolená. Zmena RP vyžaduje plán prechodu kľúčov. Lokálny HTTP pôvod je povolený len na lokálnom hoste a výslovnom `DEMO=1`; to nesmie byť produkčná konfigurácia.

Úvodná aktivácia vyžaduje všetky tri nastavenia:

| Nastavenie | Význam |
|---|---|
| `TEAM_BOOTSTRAP_EMAIL` | Presný overený prvý správca. Existujúci správca pri prechode na túto verziu môže aktivovať prvý kľúč rovnakým jednorazovým postupom. |
| `TEAM_BOOTSTRAP_TOKEN` | Kryptograficky náhodných 32 bajtov vo formáte base64url (43 znakov), odovzdaných nezávisle od prihlasovacieho e-mailu. Uchovať ako tajomstvo, nikdy v GitHube. |
| `TEAM_BOOTSTRAP_EXPIRES_AT` | Krátka výslovná platnosť ako unixové sekundy. Chýbajúci, nečíselný alebo uplynutý údaj aktiváciu nepovolí. |

Tento balík tieto produkčné hodnoty nenastavil. Posúdiť v nasadzovacom pláne aj existujúcich členov tímu: bez aktivovaných kľúčov sa k účtovníctvu nedostanú. Neoslabovať ochranu dočasnou výnimkou pre e-mail. Správca vznikne automaticky len pri výslovnej konfigurácii a prázdnom tíme. Už po spotrebovaní úvodnej aktivácie zostáva trvalý databázový záznam; rovnaký postup neobnoví stratené existujúce kľúče. Po aktivácii úvodné tajomstvo odstrániť z prostredia.

Prvý správca sa prihlási odkazom, na stránke Zabezpečenie prístupu zadá aktivačný kód a potvrdí kľúč. Pridá druhý nezávisle dostupný kľúč. Aktivuje ďalších správcov a overí praktickú dostupnosť obnovy. **Obnova správcu potrebuje dvoch ďalších správcov, teda celkovo aspoň tri rozdielne účty**, alebo osobitný offline prevádzkový zásah. Záložné kľúče uložené v rovnakom synchronizovanom účte nemusia tvoriť nezávislú zálohu dostupnosti.

## Lokálna ukážka

Po `node test/build.mjs` a spustení `scripts/playground.mjs` otvoriť `http://localhost:8787/ucto/ukazka`. Skript vygeneruje len lokálny dočasný aktivačný kód a vypíše ho do svojho terminálu. Použiť pre prvý kľúč ukážkového správcu. Aj ukážka vyžaduje kľúč, nemá výnimku z overenia. Už zaregistrované kľúče v perzistentnej lokálnej databáze nový kód neobnovuje. Tento server s testovacími službami nesmie byť verejne nasadený.

## Aktivácia ďalšej osoby

Po čerstvom overení správca pridá existujúcemu účtu tímovú rolu. Aktivácie a obnova prístupov zobrazia jednorazový kód len pri vytvorení. Do databázy ide SHA-256, príjemca, pôvod, účel, žiadateľ, referencia a platnosť najviac 24 hodín. Kód sa nevkladá do pozvánky ani auditu. Identitu a oprávnenie overiť nezávislým dohodnutým kanálom; referencia sama nie je dokladom, že overenie prebehlo.

Prihlasovací odkaz nedáva tímový prístup bez UV. Pridaním roly existujúcej osobe sa jej staré relácie a odkazy zrušia. Formulár nedovolí správcovi odobrať si vlastnú rolu a databázový zápis kontroluje aktuálne oprávnenia aj zachovanie správcu.

## Stratené kľúče

1. Dostupný záložný kľúč je prvá možnosť. Následne zrušiť kompromitovaný kľúč a skontrolovať relácie a udalosti.
2. Ak sa nedá použiť žiadny kľúč, správca overí príjemcu a vytvorí žiadosť **Obnova stratených kľúčov** s referenciou. Príjemca ani žiadateľ ju nemôžu sami schváliť.
3. Iný čerstvo overený správca vykoná vlastné overenie a uloží svoju referenciu. Kód bez druhého súhlasu nefunguje. Pri spotrebovaní sa znovu kontroluje, či sú obaja stále správcami, kód nebol zrušený a neuplynula jeho platnosť.
4. Príjemca potvrdí nový kľúč. Jedna databázová transakcia vymení staré kľúče, spotrebuje kód, zruší všetky ostatné relácie aj čakajúce e-mailové odkazy a otočí aktuálnu cookie.
5. Pridať záložný kľúč a preveriť príčinu straty. Obnova nepreberá firmu ani nemení zmluvné oprávnenia.

Ak nie sú dostupní dvaja potrební správcovia, webový postup sa zastaví. Prevádzkovateľ infraštruktúry musí mať vopred schválený **offline postup** s dvoma oprávnenými kontrolórmi, overením identity/oprávnenia a protokolom pred i po zásahu. Chránený technický zásah do D1 môže zriadiť potrebných overených správcov/aktivácie; nie je to univerzálny obnovovací odkaz a tento balík ho automaticky nevykonáva. Pred produkciou treba konkrétny postup nezávisle nacvičiť; samotná existencia databázového administrátora nie je splnená brána obnovy.

## Trvanie a relácie

Overenie tímu platí 12 hodín; citlivé akcie päť minút. Úspech otočí token cookie, pôvodnú expiráciu relácie nepredlžuje. Výzva platí päť minút, je viazaná na používateľa aj konkrétnu reláciu a spotrebuje sa len raz. Server kontroluje podpis, RP, presný pôvod, UV/UP a nonce; vloženie do cudzieho rámca odmieta. Limity pokusov platia pre účet a pri získavaní možností aj IP.

Pri vypršanom potvrdení sa POST **nespustí znovu automaticky**. Používateľ po overení uvidí bezpečnú pracovnú stránku a vedome zopakuje akciu. Odkaz na zabezpečenie je v menu klienta aj tímu. Členovi tímu e-mail po existujúcej registrácii kľúča neposkytuje náhradný vstup do chráneného účtu. Odstránenie kľúča zruší overenie existujúcich relácií; posledný a práve použitý kľúč odstrániť nemožno.

## Klienti (od 27. 10. 2026)

Pokyn majiteľa: prihlásenie bez e-mailu pri každom vstupe. Klient sa prihlási kľúčom jedným dotykom
(`/app/prihlasenie/kluc/moznosti` a `/overit`: bez zoznamu účtov, s povinným UV, podpis sa použije raz a len pre účet,
ktorému kľúč patrí) alebo odkazom z e-mailu. Pri klientovi je koreňom účtu e-mail, kľúč je pohodlná cesta: po
čerstvom prihlásení odkazom (do piatich minút) si klient uloží kľúč bez kódu aj vedľa existujúcich (nové alebo
stratené zariadenie), nič sa nemaže. Relácia klienta trvá ako doteraz bez dvanásťhodinového opätovného overenia.
Citlivý krok klienta vyžaduje prihlásenie z poslednej štvrťhodiny (kľúčom alebo odkazom) alebo dotyk kľúča v
posledných piatich minútach; klient s kľúčom ide na `/auth`, kde môže namiesto neho požiadať o odkaz. Tímu sa nič
nemení: kľúč každých 12 hodín, aktivačný kód mimo e-mailu, obnova dvoma správcami.
