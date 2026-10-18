# The rules every Peppol access point runs

`npm run test:peppol` (`test/peppol.mjs`) checks every kind of e-invoice Firmony writes against the UBL 2.1 schema and
the two rule sets of Peppol BIS Billing 3.0, as the digital postmen (certified providers, from 1 January 2027 the only
way a VAT payer's domestic invoice goes out) validate them before they send it.

- `CEN-EN16931-UBL.xslt`: the CEN rules of EN 16931 for UBL, version 1.3.15 (last update 2025-10-16), as Peppol ships
  them in `rules/sch/CEN-EN16931-UBL.sch` (SHA-256 bdcbb7b7...ad331).
- `PEPPOL-EN16931-UBL.xslt`: Peppol's own rules, "2025 November release 3.0.20", `rules/sch/PEPPOL-EN16931-UBL.sch`
  (SHA-256 5ddf3a2f...64b1d).

Both from github.com/OpenPEPPOL/peppol-bis-invoice-3 at commit 261c458474e27d58a25be629cccac28883171c92
(16 March 2026), compiled on 18 October 2026 with the ISO Schematron skeleton (github.com/Schematron/schematron, commit
77dcd36c53d12ed786c144ece3b2af7694abdc56: `iso_dsdl_include.xsl`, `iso_abstract_expand.xsl`, `iso_svrl_for_xslt2.xsl`)
run by SaxonJS (`xslt3` 2.7.0). The test compiles them to SaxonJS's form once into `.wrangler/tmp` (about 25 s) and
runs them on each invoice; an assert flagged `fatal` fails the check, a `warning` is printed.

The Financial Administration's Slovak transposition of Peppol BIS (`2026.10.14_Peppol_Bis3_v1_12.xlsx` on
financnasprava.sk, e-faktúra) could not be read from here (the site refuses the workspace); its rules are not in these
files. The CEN rules are © CEN, reproduced in Peppol's repository with CEN's permission (EUPL 1.2).

SHA-256 of the compiled files:

- `CEN-EN16931-UBL.xslt` 1f570f728429df3090bf045f6be6f4ab66ff2ad20e9235298cad15ae3fdc236f
- `PEPPOL-EN16931-UBL.xslt` 2e9692ff53b109defbb96565d101975757ee571332ea48f8eecd2de96d8ec9f9

The UBL 2.1 schemas (`test/xsd/ubl21`): `maindoc/UBL-Invoice-2.1.xsd`, `maindoc/UBL-CreditNote-2.1.xsd` and `common/`
as OASIS published them (UBL 2.1, © OASIS Open 2013), taken from github.com/phax/ph-ubl at commit
31ded97ab4013a5959f5b1ad582c5b81506c18cf (`ph-ubl21/src/main/resources/external/schemas/ubl21`), with the schemas
they import without a location from github.com/phax/ph-xsds at commit 05cfddc0b9211de8db60529785f43e04a43d732b
(`CCTS_CCT_SchemaModule.xsd` as `common/CCTS_CCT_SchemaModule-2.1.xsd`, `xmldsig-core-schema.xsd` as
`common/UBL-xmldsig-core-schema-2.1.xsd`, `XAdES01903v132-201601.xsd` and `XAdES01903v141-201601.xsd` as
`common/UBL-XAdESv132-2.1.xsd` and `common/UBL-XAdESv141-2.1.xsd`); the only change: those imports were given their
`schemaLocation`, so xmllint finds them.
