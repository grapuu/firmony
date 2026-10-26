# E-faktúry cez sieť Peppol (26. 10. 2026)

Pokyn majiteľa z 26. 10. 2026: digitálny poštár musí byť zabudovaný priamo vo Firmony, jednoducho pre klienta,
účtovníčku aj fakturáciu zadarmo. Poskytovateľ doručovacej služby je len diaľnica pod aplikáciou.

## Čo funguje už teraz (bez zmluvy s poskytovateľom)

- Overenie, či odberateľ alebo vlastná firma prijíma e-faktúry: verejný register siete Peppol (SML) cez DNS
  over HTTPS (`src/peppol/participant.ts`). Slovenská firma je účastník `0245:<DIČ>`. Meno záznamu je
  `base32(sha256(lowercase("0245:DIČ")))` bez `=` + `.iso6523-actorid-upis.participant.sml.prod.tech.peppol.org`,
  záznam U-NAPTR „Meta:SMP“ s adresou SMP. Overené 26. 10. 2026 naživo: firma z Peppol Directory 0245:2023489446
  cez Google aj Cloudflare DoH a rovnaké meno ukázal nástroj peppol.helger.com pre SML OpenPeppol. Pravidlo názvu:
  „Peppol CNAME to NAPTR Migration Process“ v1.0.0 (17. 4. 2025), jeho vzorový príklad je unit test.
  Na Slovensku bolo v tom čase v Peppol Directory 13 782 účastníkov.
- Odpoveď sa pamätá (nájdený 3 dni, nenájdený 6 hodín), neznáma odpoveď sa nikdy neukáže ako „nie“.
- Faktúra slovenskému odberateľovi s DIČ ukáže kartu E-faktúra: či prijíma a že odosielanie zapíname pred
  1. 1. 2027. Firma a nastavenia (klient) aj Nastavenia fakturácie (fakturačný účet) ukážu stav vlastnej firmy.

## Čo sa zapne po zmluve s poskytovateľom

Premenné Workera: `PEPPOL_PROVIDER`, `PEPPOL_API_URL`, `PEPPOL_API_KEY` (secret), `PEPPOL_WEBHOOK_SECRET`
(secret, aspoň 32 znakov), `PEPPOL_SMP_HOST`. Pre skutočného poskytovateľa treba dopísať adaptér v
`src/peppol/provider.ts` (`providerOf`) podľa jeho API; referenčný protokol je v tom istom súbore a beží v testoch.

- Odoslanie jedným klikom (`POST /app/faktury/:id/einvoice`): zápis raz (`einvoice_sends`, jedno živé odoslanie na
  faktúru), XML z tej istej faktúry a jej odtlačok, idempotentný kľúč u poskytovateľa. Stavy: odosiela sa, odoslaná,
  doručená, odmietnutá, nedoručená; doručená a odmietnutá sa už nezmení (trigger). Zaneprázdnený poskytovateľ: ďalší
  pokus podľa rozvrhu (1, 5, 15, 60 minút, 3, 6, 12 hodín), potom nedoručená s dôvodom a tlačidlom Odoslať znova.
- Oznámenia poskytovateľa `POST /peppol/udalosti`: podpis HMAC-SHA256 `t=<unix>,v1=<hex>` nad `t.telo`, najviac
  5 minút staré; bez podpisu 403. Stav odoslania a prijaté e-faktúry.
- Prijatá e-faktúra: klientovi ako doklad (zdroj `einvoice`, číta ju náš kód, nie AI), fakturačnému účtu do
  „Prijaté“ (`/app/prijate`) s QR kódom PAY by square na úhradu, označením platby a stiahnutím XML.
- Limit 300 odoslaní za deň na firmu. Klientova zmluva po skončení: nič sa neposiela.

## Čo ostáva na majiteľovi

Zmluva s certifikovaným poskytovateľom (Flowis, Qvalia alebo iný) ako jeho sprostredkovateľ, aby si klienti mohli
zvoliť Firmony na portáli finančnej správy v časti eFaktúra. Návrh e-mailu poskytovateľom dostal 26. 10. 2026.
Názov poskytovateľa doplniť do ochrany údajov (`#peppol`) pred zapnutím odosielania.

## Testy

`test/peppol-network.units.mjs` (meno v SML, base32, podpis, oznámenia, adaptér, kedy faktúra nemôže ísť),
`test/peppol-network.runtime.mjs` (bez poskytovateľa, odoslanie raz, podpis, doručenie, zaneprázdnený poskytovateľ
a rozvrh, odmietnutie a nové odoslanie, prijatie klientovi aj fakturačnému účtu, QR, cudzí príjemca, únik adresy).
