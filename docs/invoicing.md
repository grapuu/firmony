# Fakturácia pre každého (26. 10. 2026)

Pokyn majiteľa z 26. 10. 2026: fakturácia zadarmo pre každého, pre klientov aj neklientov. Faktúry Firmony
odberateľom neposiela e-mailom: používateľ si stiahne PDF alebo ho zdieľa sám. Cieľ je najjednoduchšia
a najpríjemnejšia fakturácia na slovenskom trhu, s Claude API tam, kde je bezpečné.

## Čo dostane podnikateľ bez účtovníctva

- Verejná stránka `/fakturacia`: IČO a e-mail, údaje firmy z Registra právnických osôb, inak ručne (aj nová živnosť).
  Odkaz na dokončenie platí 24 hodín a raz; na jeho stránke meno a súhlas s podmienkami `/fakturacia/podmienky`.
- Fakturačný účet: `companies.invoicing_only = 1`, plán `faktury`, žiadna zmluva, účtovníčka ani fakturácia Firmony.
  Rovnaké faktúry, dobropisy, zálohové faktúry, konečné faktúry, úroky z omeškania, opakovanie, číslovanie, logo,
  PAY by square a e-faktúra (UBL, Peppol BIS 3.0) ako klient.
- Úhrada sa označí ručne (`invoices.hand_paid_on`); pri zálohovej faktúre sa daňový doklad k prijatej platbe
  vystaví hneď (platba `hand:<id>`, `invoices_payment` drží jeden).
- Faktúra ako PDF (`src/app/invoice-pdf.ts`, rovnaký model listu ako stránka, `src/app/invoice-sheet.ts`): stiahnuť,
  zdieľať z telefónu, napísať e-mail vlastným programom, kopírovať odkaz; pripomienka po splatnosti rovnako.
  Firmony odberateľovi nič neposiela (ani klientom účtovníctva) a upomienky samy nechodia.
- Celý rok v jednom ZIP (`/app/fakturacia/export?rok=`, `src/app/invoicing-export.ts`): PDF, e-faktúry a zoznam
  pre Excel; 10 za hodinu, udalosť `invoicing.exported`.
- Stránka odberateľa `/f/<token>` pri faktúre fakturačného účtu hovorí, že Firmony nie je dodávateľ a neoveruje
  jeho účet (ochrana pred zneužitím na podvodné faktúry); správca účet zablokuje na `/ucto/fakturacne-ucty`.
- Odberatelia `/app/odberatelia` z vystavených faktúr: počet, fakturované, neuhradené (po dobropisoch), ďalšia faktúra.
- Nastavenia `/app/fakturacia`: údaje na faktúre, IBAN (kontrolné číslice), splatnosť, platiteľ DPH s IČ DPH,
  zápis v registri; ponuka účtovníctva; zrušenie účtu so zmazaním (citlivý krok ako export).
- Faktúra z jednej vety (`src/app/invoice-ai.ts`): Claude Haiku 5.5 s vynúteným nástrojom `invoice_draft`.
  Modelu ide iba veta; výsledok sa kontroluje ako ručne zadaný; nič sa nevystaví. Limity 40/80/1500 za deň
  (osoba/firma/všetci). Udalosť `invoice.ai` drží len výsledok a tokeny, nie text.

## Čo ich oddeľuje od účtovníctva

- Triggery schémy (`src/app/invoicing-schema.ts`): značka sa nikdy nezmení; žiadna účtovníčka, zmluva, objednávka,
  žiadosť, prevádzkovateľ ani automatické účtovanie; do fakturačného účtu nemožno vložiť platby, účty, výpisy,
  správy, bankové prepojenia, zápisy knihy, zamestnancov ani iné doklady než vlastné vystavené faktúry.
- Tím ich nevidí (`visible`, `canSee`), IČO fakturačného účtu nerobí firmu klientom (`isClient`), adresa pre doklady
  odmieta poštu, incidenty a AML lehoty ich ignorujú.
- Aplikácia pustí reláciu fakturačného účtu len na stránky fakturácie (`invoicingPath`).

## Ochrana pred zneužitím

5 registrácií za hodinu z pripojenia aj zo siete /24, 3 e-maily s odkazom za deň na schránku (aj s +značkou), 120 registrácií za deň spolu,
200 vystavených faktúr za deň v účte, 10 fakturačných účtov na osobu. Nedokončené registrácie sa mažú 7 dní
po vypršaní odkazu.

## Právne texty

Podmienky používania fakturácie (`src/content/invoicing.ts`, verzia `INVOICING.termsVersion`), časť ochrany
údajov `#fakturacia` (`PRIVACY_VERSION` 2026-10-26). Zmluvné podmienky účtovníctva 2026-10-26: prvý mesiac
zadarmo (bod 4.7), vystavené faktúry sa nerátajú do dokladov balíka (bod 4.2); znenie 2026-10-21 je v archíve.
Právnik ich má prečítať pred spustením spolu s ostatnými podmienkami.

## Testy

`test/invoicing.runtime.mjs` (registrácia, odkaz, oddelenie, nastavenia, úhrada, záloha, odberatelia, veta,
tím, pošta, zrušenie), `test/invoicing.units.mjs` (dosah stránok, kontrola návrhu z vety).
