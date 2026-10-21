# Overenie skutočného nasadenia

Stav k 21. októbru 2026. Push do `main` spustí nasadenie v Cloudflare Workers Builds. Zelené kontroly vetvy
potvrdzujú otestovaný kód. Až samostatná kontrola verejného webu potvrdí, že sa očakávaná verzia skutočne nasadila.

## Identifikácia verzie

`scripts/build-metadata.mjs` vytvorí pred zostavením `src/generated/deployment.ts`. Cloudflare pri zostavení
poskytuje `WORKERS_CI_COMMIT_SHA`. Použije sa celý 40-znakový identifikátor, pri neplatnej hodnote zostavenie zlyhá.
Premenná je dostupná počas zostavenia, preto sa identifikátor vloží priamo do balíka aplikácie. Nečíta sa z nastavení
Workera počas požiadavky. Žiadnu novú premennú ani secret netreba nastavovať.

Pri miestnom zostavení bez tejto premennej sa použije `git rev-parse HEAD`. Archív bez histórie Git dostane
`revision: null` a `source: "unknown"`; taká verzia nemôže prejsť kontrolou konkrétneho produkčného commitu.
Generovaný súbor sa neukladá do GitHubu. Vzniká pri `npm ci` cez `postinstall`, pri `build:assets` aj v runtime
zostavení. Opakované generovanie rovnakej hodnoty súbor neprepisuje. Do balíka vstupujú iba `revision` a `source`.

`GET /healthz` si ponecháva `ok` a číslo schémy a pridáva `build: { revision, source }`. Pri nepripravenej databáze
vráti HTTP 503 s `ok: false`, aj keby bol commit správny. Identifikátor nie je heslo a neobsahuje klientské údaje.

## Kontroly pred zlúčením a po ňom

1. Zmenu pripravte v samostatnej vetve. Pred zlúčením musia na jej presnom konečnom commite prejsť všetky kontroly
   workflow `Checks`: typy, jednotkové testy, Peppol, runtime na Node 24, UI a prehliadačové scenáre.
2. Po zlúčení spustí GitHub workflow `Production verification`. Najviac 20 minút čaká na celý identifikátor
   zlúčeného commitu v `/healthz`, `ok: true` a očakávanú schému. HTTP 200 alebo skrátený identifikátor nestačí.
3. Následne preverí všetky návody z `GUIDES`: HTTP 200, kanonickú adresu, štruktúrované údaje a dátum zmeny,
   odkazy na zdroje, aktuálny záznam v `sitemap.xml` a odkaz v `llms.txt`. Na konci opäť overí verziu a schému.
4. Novší push do `main` zruší staršie overovanie. Ručné spustenie je určené pre `main`; iné vetvy preskočí.

Workflow číta iba verejné stránky, nepotrebuje prihlasovanie ku Cloudflare ani jeho API kľúč. Má len právo čítať
repozitár. Nenasadzuje, nevracia verzie späť a neupravuje údaje klientov. Do logu nevypisuje telá neplatných odpovedí
ani ľubovoľné chybové detaily servera. Overenie možno zopakovať z čistého checkoutu požadovaného commitu na Node 24:

```sh
npm ci
npm run verify:deployment -- <cely-40-znakovy-identifikator-commitu>
```

Pri neúspechu skontrolujte príslušný Cloudflare build a jeho nasadenie. Zlyhanie kontroly po zlúčení samo neznamená
opravené ani vrátené nasadenie. Skutočne aktívny commit porovnajte s očakávaným v GitHube. Schému pri oprave nemažte
ani nevracajte späť; existujúce kroky zostávajú nemenné. Táto kontrola nenahrádza skúšku prihlásenia klienta,
účtovného mesiaca, doručovania ani obnovy produkčných dát.

## Overenie z 21. októbra

O 18:14 CEST všetkých päť nových návodov z PR #14 odpovedalo na firmony.io s HTTP 200 a malo očakávané údaje,
zdroje, sitemap a llms.txt. `/healthz` vtedy uvádzal schému 77. Staršia verzia tohto endpointu neuvádzala commit,
preto to nepotvrdzovalo konkrétnu revíziu celého Workera. Dôkaz nasadenia novej identifikácie a výsledok workflow
sa doplnia k [úlohe #16](https://github.com/grapuu/firmony/issues/16). Príčina predchádzajúceho oneskorenia nebola
z verejných odpovedí preukázaná.

## Originálny technický zdroj

Cloudflare Workers Builds, Configuration, Default variables, prečítané 21. októbra 2026:
https://developers.cloudflare.com/workers/ci-cd/builds/configuration/#default-variables

Dokumentácia rozlišuje premenné zostavenia a runtime. Tiež uvádza, že Workers Builds nepoužíva nastavenie
Custom Builds z Wrangler konfigurácie; preto generovanie nezávisí iba od tohto hooku a je aj v `postinstall`.
