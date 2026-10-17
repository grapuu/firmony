# Spustenie Firmony krok za krokom

Pre Christiana. Každý krok je pár klikov v prehliadači, bez terminálu. Kde treba niečo zmeniť v kóde, napíšeš mi a
urobím to jedným commitom. Kľúče a heslá nikdy neposielaj do chatu: vkladáš ich sám priamo do Cloudflare.

Poradie je dôležité: kľúče tímu (passkey) fungujú len na konečnej doméne, preto doména ide prvá.

## 1. Doména

1. Kúp firmony.io (Websupport, v októbri 2026 stála 69,90 € ročne).
2. Cloudflare, Add a domain, firmony.io, plán Free.
3. Na Websupporte pri doméne zmeň nameservery na dva, ktoré ukáže Cloudflare.
4. Napíš mi „doména je kúpená“. Zmením jeden riadok (`DOMAIN` v `src/config.ts`) a pridám trasu do `wrangler.jsonc`.

## 2. Databáza a úložisko (obe v EÚ)

1. Cloudflare, Storage & Databases, D1, Create database: názov `firmony`, umiestnenie **EU jurisdiction**.
   Pošli mi jeho Database ID (nie je tajné). Zapíšem ho do `wrangler.jsonc`; bez neho nasadenie zámerne zlyhá.
2. R2, Create bucket: názov `firmony-files`, jurisdikcia **European Union (EU)**.

## 3. Worker

1. Workers & Pages, Create, Import a repository: GitHub, `grapuu/firmony`, produkčná vetva `main`.
2. Nasadenie ide samo po každom pushi do `main`. Prvé prejde, keď bude v kóde ID databázy z kroku 2.

## 4. E-mail

1. Pri doméne Email, Email Routing: pravidlo `ahoj@firmony.io` presmerovať do tvojej schránky (Cloudflare pošle
   overovací e-mail, klikni naň).
2. Catch-all pravidlo: Send to a Worker, `firmony`. Tak prídu doklady, ktoré klienti preposielajú na svoju adresu.
3. Email Service (odosielanie): pridať firmony.io. Cloudflare doplní záznamy DNS sám.

## 5. Čítanie dokladov

1. V Anthropic Console (console.anthropic.com) účet pre europio, vytvoriť API key.
2. Worker firmony, Settings, Variables and Secrets, Add: typ **Secret**, názov `ANTHROPIC_API_KEY`, hodnota kľúča.
   Bez neho ide každá fotka dokladu rovno účtovníčke.

## 6. Prvý správca (ty)

1. Otvor `https://firmony.io/app/prvy-spravca`. Ukáže tri nastavenia a náhodný kód.
2. Pridaj ich na Workeri ako tam stojí: `TEAM_BOOTSTRAP_EMAIL` (Text), `TEAM_BOOTSTRAP_TOKEN` (**Secret**),
   `TEAM_BOOTSTRAP_EXPIRES_AT` (Text).
3. Prihlás sa na `https://firmony.io/app/prihlasenie` tou adresou, otvor odkaz z e-mailu.
4. V menu Zabezpečenie prístupu zadaj kód a zaregistruj kľúč (Face ID, odtlačok alebo PIN počítača). Hneď pridaj
   **druhý kľúč na inom zariadení** (napríklad telefón aj počítač).
5. Na Workeri zmaž `TEAM_BOOTSTRAP_TOKEN`. Stránka prvy-spravca odvtedy neexistuje.

Ak by si raz stratil všetky kľúče, obnovu musia potvrdiť dvaja iní správcovia. Preto neskôr pridaj aspoň druhého
správcu.

## 7. Účtovníčka

1. Účtovníctvo pre tím, Tím: jej meno a e-mail, rola účtovníčka.
2. Zabezpečenie prístupu, Aktivácie a obnova prístupov: jej e-mail, účel „Prvý kľúč nového člena tímu“ a kde a
   ako si overil jej totožnosť. Kód sa ukáže iba raz: povedz jej ho telefonicky, nie e-mailom.
3. Ona sa prihlási svojím e-mailom, v Zabezpečení prístupu zadá kód a zaregistruje si dva kľúče.

## 8. europio vo Fakturácii

Účtovníctvo pre tím, Fakturácia: raz nastaviť europio (účet na platby, mesiac, od ktorého vedieme jeho knihy).
Odvtedy aplikácia vystavuje faktúry klientom sama z toho, čo vie.

## 9. Pred prvým klientom

Tieto veci aplikácia nevie urobiť za teba. Kým nie sú hotové, podpisovanie zmlúv online je zablokované.

1. Živnosť „Vedenie účtovníctva“ pre europio: slovensko.sk s eID, zadarmo, osvedčenie do 3 dní.
2. Do 30 dní od živnosti registrácia europio v goAML (Finančná spravodajská jednotka) a podpísaný program proti
   praniu špinavých peňazí.
3. Poistenie zodpovednosti za škodu pri vedení účtovníctva.
4. Právnik prečíta obchodné podmienky, plnú moc a program proti praniu.
5. Keď máš stanovisko právnika a poistnú zmluvu: Účtovníctvo pre tím, Žiadosti z webu, „Ako povoliť podpisovanie“.
   Napíšeš kto a kedy posúdil, poisťovňu s číslom zmluvy a do kedy to platí. Stránka pripraví hodnotu
   `CONTRACT_RELEASE`, ktorú vložíš na Worker (typ Text). Po každej zmene podmienok alebo cien treba novú.
6. Digitálny poštár na e-faktúry (od 1. 1. 2027 povinný). Web ich sľubuje v cene, preto ho treba vybrať pred
   prvým klientom.

## Čo nikdy

- Nevkladať kľúč ani heslo do chatu ani do GitHubu.
- Nemazať nič v R2 ani v D1 cez dashboard. Aplikácia maže sama, čo zákon a podmienky dovoľujú.
- Netlačiť `Delete` pri Workeri ani pri databáze.
