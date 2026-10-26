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

- **Kto smie posielať a prijímať (naviazanie, `peppol_bindings`).** Nikdy podľa DIČ napísaného vo Firmony. Firma je
  naviazaná až na oznámenie poštára `registered` (firma si Firmony zvolila na portáli FS, jej zástupca sa prihlásil
  eID) **a** potvrdenie správcu: klient aj fakturačný účet čakajú (`peppol_unrouted`, dôvod `unverified`), kým
  správca neoverí DIČ v zozname daňových subjektov FS a že účet patrí tejto firme (kontakt z obchodného registra), a
  nepripojí ho na `/ucto/fakturacne-ucty#peppol` (citlivá akcia, čerstvé potvrdenie kľúčom). Pripojenie vo vnútri
  dávky znova overí, že firma má práve toto DIČ. Viac firiem s tým DIČ, žiadna, alebo už iné naviazanie: tiež k
  správcovi. `unregistered` naviazanie zruší a čakajúcu registráciu uzavrie; správca vie odpojiť. Naviazanie firmy,
  ktorá zmenila DIČ, už nič nedoručí (`conflict`) a rozvrh ho zmaže. Pri pripojení dostane firma hneď aj e-faktúry,
  ktoré prišli medzitým; správca vie doručiť aj jednotlivo.
- Odoslanie jedným klikom (`POST /app/faktury/:id/einvoice`): len naviazaná firma s otvorenou zmluvou (do dňa konca,
  nie 10 dní príjmu dokladov), zápis raz (`einvoice_sends`, jedno platné odoslanie na faktúru vrátane odmietnutého),
  XML z tej istej faktúry a jej odtlačok, idempotentný kľúč u poskytovateľa. Klik si odoslanie zaberie na 2 minúty,
  rozvrh si ho zaberie podmienkou pred volaním poskytovateľa, takže ho nikdy neposielajú dvaja naraz; 409 sa skúša
  znova. Stavy: odosiela sa, odoslaná, doručená (do schránky odberateľa), odmietnutá, nedoručená; doručená ešte môže
  byť odmietnutá, inak sa stav nevracia (trigger). Odmietnutá sa znova neposiela, ponúkne sa dobropis. Zaneprázdnený
  poskytovateľ: ďalší pokus podľa rozvrhu (1, 5, 15, 60 minút, 3, 6, 12 hodín), potom nedoručená s tlačidlom Odoslať
  znova.
- Oznámenia poskytovateľa `POST /peppol/udalosti` (najviac 15 MB): podpis HMAC-SHA256 `t=<unix>,v1=<hex>` nad
  `t.` a bajtmi tela, najviac 5 minút staré; bez podpisu 403. Viac ako 100 udalostí alebo viac ako 10 e-faktúr: 413
  bez spracovania (poskytovateľ pošle po častiach; jedna e-faktúra stojí tucet volaní D1, limit je 1 000). Každá
  udalosť zvlášť: chyba jednej nezastaví ďalšie, zapíše sa správcovi aj s XML a oznámenie dostane 503, aby ho
  poskytovateľ poslal znova (všetko sa dá bezpečne zopakovať; úspešné doručenie chybu uzavrie). Stav k referencii,
  ktorú ešte nemáme (stratená odpoveď), čaká v `einvoice_status_pending`, po zápise sa skúsi ešte raz a použije sa
  pri zápise referencie.
- Prijatá e-faktúra: len naviazanej firme; klientovi ako doklad (zdroj `einvoice`, číta ju náš kód, nie AI),
  fakturačnému účtu do „Prijaté“ (`/app/prijate`) s QR kódom PAY by square, označením platby a stiahnutím XML.
  Dobropis a faktúra k zaplatenej zálohe (386) nič nepýtajú: bez QR, bez označenia platby, nerátajú sa. Ak sa
  odosielateľ v sieti nezhoduje s EndpointID dodávateľa (z parsovaného XML) alebo slovenský odosielateľ nemá DIČ z IČ
  DPH dodávateľa, stránka varuje a QR neponúkne; klientovi sa IBAN z takého dokladu nezoberie do príkazov na úhradu.
  Stránka vždy ukáže, kto ju v sieti poslal. Polia e-faktúry
  sú orezané pri čítaní (`readInvoice`). Nenaviazaný príjemca alebo firma po skončení zmluvy: e-faktúra sa uloží
  správcovi (`peppol/unrouted/<id>.xml`), ten ju stiahne a označí ako vybavenú; vybavené sa mažú po roku.
- Limity odoslaní za 24 hodín: klient 300, fakturačný účet 50, všetky fakturačné účty spolu 2 000.
- Uchovávanie: odpovede SML pod odtlačkom (nie DIČ), najviac 3 dni; čakajúce stavy 30 dní; 90-dňové mazanie po konci
  zmluvy zmaže aj súbory prijatých e-faktúr a naviazanie; ZIP roka fakturačného účtu obsahuje `prijate/` a
  `prijate.csv`. Ihrisko s `PEPPOL=1` naviaže ukážkové firmy samo.

## Čo ostáva na majiteľovi

Zmluva s certifikovaným poskytovateľom (Flowis, Qvalia alebo iný) ako jeho sprostredkovateľ, aby si klienti mohli
zvoliť Firmony na portáli finančnej správy v časti eFaktúra. Návrh e-mailu poskytovateľom dostal 26. 10. 2026.
Názov poskytovateľa doplniť do ochrany údajov (`#peppol`) pred zapnutím odosielania.

## Testy

`test/peppol-network.units.mjs` (meno v SML, base32, podpis, oznámenia, adaptér, kedy faktúra nemôže ísť),
`test/peppol-network.runtime.mjs` (bez poskytovateľa, nič pred naviazaním, naviazanie klienta oznámením a
fakturačného účtu správcom, odoslanie raz, podpis, 413, doručenie, zaneprázdnený poskytovateľ a rozvrh, stav pred
referenciou, odmietnutie po doručení a dobropis, prijatie klientovi aj fakturačnému účtu, QR, dobropis a záloha bez
QR, cudzí odosielateľ, príliš veľké polia, cudzí príjemca u správcu, ZIP, odtlačky a mazanie odpovedí, odhlásenie).
