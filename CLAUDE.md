# Start here (written on 17 October 2026 at 15:45, when the owner moved to a new chat)

He asked for everything to be kept so that a new chat carries on ("chcem ísť do nového chatu a aby si mal dáta aj
kontext"). These notes are the whole memory of the work; no chat, scratch file, task list or browser tab carries
over. Bring this section up to date first whenever a session ends.

1. **Where it stands.** The software is done: the client's app, the accountants' side, the books, VAT, payroll,
   the closing, billing, the contract online, the end of a contract and the investors' sign-up, closed as one
   circle in seven stages on 17 October 2026 ("Closing the loop" below). Everything is on GitHub, `grapuu/firmony`
   (private), branch `main` (`claude/kruh` stays at `76b81a0`, the end of 17 October). GitHub's checks (the workflow
   "Checks": type check, units, runtime, Peppol, visual, browser passkeys) pass on every commit pushed.
   On 18 October 2026 (his word of the day before: every size of company, everything in our own software) came, each
   with its checks and pushed: OSS and Intrastat in the filing bundle, eight fixes of an independent review, every
   e-invoice validated against UBL 2.1 and the CEN and Peppol BIS 3.0 rules (`npm run test:peppol`), credit notes,
   how an invoice is taxed (§ 43, § 47, § 15, outside), domestic reverse charge with the control statement's A.2 and
   its corrections in C.1, advances (request, tax document issued by itself when the money comes, final invoice),
   invoices in another currency, invoices repeated by themselves, payment orders for the bank (SEPA pain.001) with a
   supplier's IBAN typed when missing, approving suppliers' invoices before they are paid, the customer's state, the
   company's own invoice numbers and logo, faster pages at volume (3 000 documents a month: books pages 1,0 to 1,3 s);
   and two serious faults found and mended: one company's locked period stopped every company's automatic pairing, and
   a credit note issued in the app made no entry in the books. All of it under "Invoices the client issues" and item 8.
   An independent reviewer read the day's commits afterwards: nine findings, each verified and mended (schema step 48;
   "Mended after the review of the invoices" under "Invoices the client issues"). Then business trips at home (cestovné
   náhrady, schema step 49, "Business trips" under the client's app), the cash box (pokladňa, schema step 50, "The
   cash box" there; a second independent review of both, six findings mended) and reminders with late interest (schema
   step 51, under "Invoices the client issues"), cost centres (schema step 52, "Cost centres" under the client's app)
   and a third independent review of the reminders, eight findings mended (schema step 53), and a fourth of the cost
   centres, six mended; then VAT on imports (customs paid, and self-assessed by an AEO under § 84a) and the takings of an
   eKasa till with the control statement's D.1 (schema step 54; "VAT: the return and the control statement" and "The
   takings of an eKasa till"), approvers with limits and two approvals for larger companies (schema step 55, under
   "Payment orders"); a fifth independent review, of imports and takings, nine findings mended (schema step 56); a sixth,
   of approving and the Slovak e-invoice terms, eight findings mended (schema step 57; a credit note's e-invoice with
   another day of supply failed the UBL schema); meals of employees in payroll, vouchers and the financial contribution
   (schema step 58, under "Payroll") and the social fund's mandatory allocation; a morning doorbell to approvers and
   budgets of cost centres (schema step 59); payroll by cost centre (schema step 60). **Nothing is live**: there
   is no Cloudflare Worker, no domain, no database. PRs #8 and #9 (Codex's work) were merged into `main` on
   17 October at 10:20, so every paragraph above "# Firmony: working notes" that says "continue PR #8" or "no
   merge" is history.
2. **A new workspace.** Add the repository with `add_repo` (owner `grapuu`, repo `firmony`, access "push"), clone
   it, `npm ci`. Node 24 for the runtime suite, as GitHub runs it (the workspace's own node may be 22):
   `mkdir -p ~/node24 && ln -sf "$(npx -y node@24 -p process.execPath)" ~/node24/node`, then
   `PATH=~/node24:$PATH npm run test:runtime`. Chromium for `test:ui` and `test:browser` is under
   `/opt/pw-browsers` (`FIRMONY_CHROME=/opt/pw-browsers/chromium-<n>/chrome-linux/chrome`). Run `npm run check`,
   `npm test` and the runtime suite once before changing anything ("Before pushing" has the counts).
3. **What is next is his, not code**: his guide, in Slovak and in order, is `docs/spustenie.md` (the domain
   first, because passkeys are bound to it; then D1 and R2 in the EU, the Worker from GitHub, email, the
   Anthropic key, the first administrator at `/app/prvy-spravca`, the accountant, europio in Fakturácia, and what
   comes before the first client). His word: firmony.io (69,90 € a year at Websupport), not bought yet; the code
   says firmony.ai until he writes that it is bought (`DOMAIN` in `src/config.ts`, a route in `wrangler.jsonc`).
   Besides: the meeting with the accountant he picked, about two weeks after 17 October (her pay is
   `ACCOUNTANT_PAY`: 28, 55, 110 € a client, 5 € a payroll, 90 € a closing); the trade "Vedenie účtovníctva" for
   europio; liability insurance; a lawyer for the terms, the contract and the power of attorney
   (`CONTRACT_RELEASE` stays closed until the lawyer's and the insurer's references exist:
   `/ucto/ziadosti/schvalenie`); the AML program signed and europio registered in goAML.
4. **His first word in the new chat.** To "pokračuj" alone: three lines on where things stand, then what is
   worth doing next with what it costs him in time, and his pick is waited for. When he writes that a step of the
   guide is done, do the code side of it in one commit (the domain, the database id) and say what he clicks next.
5. **Open with him, nothing decided:** the opening line of the site (the code has Codex's "Vy budujete firmu. My
   strážime účtovníctvo."; the older "Postaráme sa o všetko. Vy rastiete." is his to bring back); the investors'
   tax return is not built, its prices are a proposal (29, 49 and 89 €); Enable Banking is built and switched on
   only at about 250 clients (900 € a month).
6. **The picture he follows** is the artifact "Kruh Firmony" (https://claude.ai/artifact/6RwoEgbSJZx3hpdBafRN3M):
   all seven stages full, and his steps before launch at the end. Its source was a scratch file of the session of
   17 October; a new session reads the page with the Artifact tool (`action: "read"`, then the saved file) and
   republishes to the same URL.
8. **Every size of company (his word of 17 October 2026, 16:01).** Not only small s. r. o.: new, small, medium,
   large and very large companies, and the software is to manage all of it, volume included, everything in our own
   software (the accountant needs no tools of her own). Filing stays the accountant's, but as one package she submits
   with a click. Real data not yet; a test with fictional data is welcome. His steps (the domain, Cloudflare, the
   trade, goAML, the lawyer, insurance) wait until the product is perfect; the trade licence comes first of them. The
   accountants he is looking at: doc. Ing. Alena Andrejovská, PhD. and Ing. Radoslav Bajus, PhD. (Katedra financií,
   EkF TUKE), offered the work as a lucrative side income. The order he was given (each with its time): texts for
   every size (done: `CUSTOM_PLAN` 'mieru', the card "Na mieru" under the plans, the third way in "Vediete väčšiu
   firmu", no online order for it, the team sees "na mieru"); filing in one click (done: `src/filings/bundle.ts`, on
   /ucto/podania "Podanie jedným balíkom": `/ucto/podania/balik.zip` holds every current document to send, of the
   filings and the payroll reports, in a folder per office and company with PREHLAD.txt, each fingerprint checked
   again; `/ucto/podania/naraz` records every number and checked receipt in one form, each row through
   `recordDelivery` against the rows she may work on now; an empty row changes nothing; test/bundle.runtime.mjs);
   a load test with a large fictional (built: `npm run test:load`, `test/load.mjs`, one TEST-ONLY company of a year
   with `FIRMONY_LOAD_DOCS` documents a month (3 000 by default), as many payments from three accounts and 100
   employees, every heavy page timed three times, the report in `.wrangler/load/report.json`; at 300 a month it found
   three seconds of a page spent making date formatters: `bratislavaDay` and its kin now keep one formatter, and
   `vatDocsByPeriod` sorts the documents by period once, so the team's home went from 3 179 to 139 ms and the
   client's overview from 2 523 to 140 ms on this machine);
   at 3 000 a month (36 000 documents and 36 000 payments a year) every page answered, in 1,3 to 3,8 s here: the
   books are worked out from every document each time (`booksOf`), the next step for volume; the journal and an
   account's ledger show 500 lines a page (`pageSlice`, `?strana=`); the VAT page of such a month is 1,5 MB;
   fixed assets and depreciation (built: `src/app/assets.ts`, `assets-store.ts`, `views/assets.tsx`, schema step 26
   `assets`, the books' tab "Majetok" at `/ucto/klienti/:id/kniha/majetok`; the Income Tax Act read in the original on
   slov-lex, version of 1 January 2026: § 22(2) 1 700 €, § 22(7) 2 400 €, § 22(8) intangible as the books, § 26(1)
   groups 0 to 6 in 2 to 40 years, § 27 straight with the first year's months share and the rest in the year after,
   § 28 accelerated 6/7 and 8/9 for groups 2 and 3, § 47 rounding, § 22(11) and (12), § 17(34) the car of 48 000 €;
   the books get the putting in use from 041/042, each ended month's depreciation on 551 in one entry, the disposal;
   the closing's Table B takes the register's tangible assets; changes reaching a locked period are refused by the
   schema; purge and the yearly archive (`data/majetok.json`) carry it; test/assets.runtime.mjs);
   the closing of small and large entities (built: `src/app/closing-pod.ts`, Súvaha Úč POD 1-01 rows 001 to 145 with
   gross, correction, net and the net before, Výkaz ziskov a strát Úč POD 2-01 rows 01 to 61, read from the eForm
   UZPODv14, whose schema is `test/xsd/uzpod2014.xsd` byte for byte; `statementsXml` writes UZMUJv14 or UZPODv14 by the
   form, the file `UZPOD_<IČO>_<year>.xml`; the size group by § 2(5) to (13) of the Act on Accounting read on slov-lex
   (450 000 / 900 000 / 10, 5 000 000 / 10 000 000 / 50, two periods before, a new company's choice kept) proposed and
   set in the closing's form with the average employees from payroll, accounts placed in a row of her own (a
   receivable due after a year, a related party), the audit of § 19(1)(a) said; `closingBalancesByYear` reads every
   year in one pass; test/closing-pod.runtime.mjs); then, in this order: full payroll (agreements, directors,
   sick leave, holidays, overtime, the annual settlement: built on 17 October 2026, see below); migration from Pohoda, Omega, Money, KROS; foreign
   currencies, OSS, Intrastat and joint-stock companies. Deferred tax (built: § 10 of the measure MF/23054/2002-92 as
   of 1 January 2026, required with the audit, never for a micro entity; the register's temporary differences
   (`temporaryDifferences`), the provisions proposed, what she types, tax losses on her word; booked with the year's
   tax document on 481.100 and 481.200 against 592, shown apart in rows 052 and 117). The notes (built:
   `src/app/notes.ts` drafts Poznámky Úč MUJ 3-01 or Úč POD 3-01 by the size, the articles of the measures, a large
   entity's tables and its cash flows by the indirect method; `src/app/pdf.ts` writes them as an ASCII PDF in the
   viewer's Helvetica with the Slovak letters by /Differences; `/ucto/klienti/:id/zavierka/poznamky.pdf`, saved with
   the podklady and put beside the statements in the filing bundle; what the draft says that only she can confirm is
   listed on the page, `NOTE_CHECKS`). Stock (built: `src/app/stock.ts`, `stock-store.ts`, `views/stock.tsx`, schema
   step 27 `stock_settings`, `stock_items`, `stock_moves`, the books' tab "Sklad" at `/ucto/klienti/:id/kniha/sklad`;
   § 25(5) of the Act, the weighted average or FIFO; method A continuously, goods bought to 131 (`Company.stockMethod`),
   receipts 132/131, 112/111, 123/613, issues 504, 501, 613, a count's shortage to 549 and surplus to 648 or 613 by § 11
   of the accounting procedures; method B by counts, each count on the account and back the next day; each month's
   receipts and issues one entry each; an issue that would leave the stock short refused; items and moves pasted from
   another program, all or none; the closing asks for the year's count; test/stock.runtime.mjs). Full payroll, stage 1
   (built 17 October 2026, schema step 28: employees' `contract`, `regular`, `pension`, `exemption`, `wage_kind`,
   `weekly_hours`, `leave_days`, the table `sick_leaves`): `src/app/payroll.ts` insures each relationship by the Agency's
   tables (employment; DoVP, DoPČ, DoBPŠ regular or irregular; a director's remuneration without accident and guarantee
   insurance, 1 % unemployment whole; pensions; the deduction 200 € in 2026, 300 € from 2027; students on DoBPŠ and
   every pensioner (old age, early old age, disability, service after the age) on DoVP or DoPČ outside health
   insurance; corrected on 17 October 2026 after an independent review, each point read on socpoist.sk and vszp.sk:
   the support in short-time work is an employment's alone, so a regular agreement pays the employer's unemployment
   insurance whole, 1 %, and a pensioner in employment keeps the support while losing unemployment insurance; a service
   pension after the age (`'service'`) drops disability insurance only; a pensioner claims the deduction with an
   irregular income too (that row has no MVPP type and is prepared outside); a pensioner pays no minimum health advance
   (`stateInsured`); a student's agreement may have a regular income (ZECD3, ZECD3V), insured the same; each child's
   bonus adds up to the bonus; an annual settlement's refund is settled by the April wage, an underpayment by December); `src/app/pay-month.ts` works a month out of its parts
   (the wage by weekdays less absences, an hourly wage by hours, holiday and obstacles at the average earnings of § 134,
   overtime 25 %, night 40 %, Saturday 50 %, Sunday 100 % of the minimum hourly wage, a public holiday 100 %, bonus)
   and sick pay by Act 462/2003 read on slov-lex (calendar days 1 to 14, 25 % and 55 %, the daily base proposed from
   the closed months of the decisive period, capped, rounded up); sick pay is taxed and no assessment base; the books
   take 521, 523 (director), 527 (sick pay); the page has each person's parts below the table, the PN card, the
   employee form with the relationship, the holiday taken; registrations skip health for the state-insured;
   test/payroll-full.runtime.mjs. Stage 2 (reports, schema step 29): MVPP reports every relationship with its typZec
   (ZEC, ZECN for a director without the support's attributes, ZECD1 to ZECD3 with N and V), partial months by their
   days, the deduction off the pension base, hours proposed from the payroll (`pay.paid`); a pensioner's deduction needs
   a regular income (the codes ZECD1V and ZECD2V) and a pensioner on an agreement has no sickness insurance; the 514
   leaves out the state-insured (`healthInsuredCoverageSql`, the generation trigger replaced in step 29, no target for
   them alone); PREHLAD takes sick pay into row 00 and the child bonus into row 05 and section II (rows A to C). Left
   open by the review, not changed: whether the minimum health advance applies with the deductible item claimed
   (§ 16a of Act 580/2004), the annual bonus for months without income (FR SR 549090), sick days in the base period
   (§ 54 of Act 461/2003), the minimum hourly wage for a shorter statutory week (174 hours always).
   Stage 3 (the annual settlement, schema step 30 `tax_settlements`): `src/app/tax-settlement.ts` (§ 38: the partial
   base of the year here and at the employers before, the taxpayer's part with the 2026 reduction 14 661,11 € less a
   third, the spouse's, supplementary pension saving up to 180 €, a pension off the part, the bands, the year's bonus by
   month with the cut above 27 432 € and the share caps), `/ucto/klienti/:id/mzdy/rocne?rok=` (each employee, the form,
   the result, the month to settle in; never changed once that month is closed), the settlement on the month's slip
   (`settlementTax`, `settlementBonus`) and in the overview's row 02 (down to the advances; the rest the employer's own,
   asked of the tax office) and row 05; `/mzdy/potvrdenie` the statement of taxable income; the annual report's figures
   (its eForm for 2026 is published in 2027: then its XML). Migration from Pohoda, Omega, Money, KROS (built
   17 October 2026, schema step 31: `prior_statements`, `documents.takeover`, `assets.takeover`): `src/app/table-read.ts`
   reads a file of any program (.xlsx by its own ZIP reader, CSV or text in UTF-8, UTF-16 or Windows-1250, rows pasted)
   and finds the columns by their Slovak or Czech headings; `src/app/takeover.ts` reads the trial balance (closing
   balances KS MD/D, one signed, or PS with turnover; analytic accounts over a synthetic one; costs and revenues as the
   result on 431; a longer analytic number said), the open items (a table or Pohoda's XML of invoices), the register of
   assets, the employees and the statements filed before (UZMUJ or UZPOD from eDane: the year and the year before from
   its column); `/ucto/klienti/:id/prevzatie` (linked from the client page's books card and the opening balances):
   the trial balance fills the opening balances' form to check and save (800 rows), the open items become booked
   documents before the books start with no VAT of ours (`openItemsStatements`, one JSON parameter a thousand rows), an
   item after the start or one already among the documents refuses the list, the assets become opening assets, the
   employees whoever is not in payroll yet; every list all or none with its lines said; a list removed whole while
   nothing of it was used. The books put an open item taken over in the saldokonto and the payment that comes settles
   it on 311 or 321 (`ledger.ts`, source 'takeover' only). The closing reads the statements taken over as the year
   before (`previousFrom`: books, prior, otherForm) and in the size group and the audit. Found on the way: every POST
   of the team was refused above 8 kB (a payroll month of 100 people, large opening balances, real receipts): the team
   side now takes 68 MB, the client's app 1 MB, the public pages still 8 kB (`LIMITS`). test/takeover.runtime.mjs.
   Foreign currencies (built 17 October 2026, schema step 32: `fx_rates`, `documents.fx_rate`, `accounts.currency`, the
   documents' lock guard made again with `fx_rate`): `src/app/fx.ts` (§ 24 of the Act on Accounting and § 23, § 26 of
   the VAT Act as FR SR's 931674, 812673 and 297846 explain them: the ECB's reference rate of the day before the
   accounting case, the last one before a day without it; the rate of the balance sheet day; rates in millionths,
   euros rounded to the cent), `src/app/fx-store.ts` (the schedule fetches eurofxref-hist-90d.xml once the ECB has
   declared the day, at most once an hour; the pretend ECB in `test/pretend.mjs`). The books (`ledger.ts`): a document
   in another currency at the rate the accountant confirmed on the booking form (Mena, Kurz za 1 €, the ECB's proposed
   and kept when the field is left empty) or the kept rate of the day before its day; one without any is `unrated` and
   said on the trial balance, the closing and the period lock; a receipt in another currency paid alone from a euro
   account is the euros the bank took; an invoice in another currency is settled whole by its payment and the
   difference goes to 563 or 663; an invoice still open at a year's end is revalued at that day's rate (entry
   `fx:<year>`, kind 'fx', "KR <year>"); a payment of a foreign currency account at the rate of the day before it, and
   the account revalued at each year's end from its balance in its currency (`fxb:<year>:<account>`); the bank card
   shows such an account in its currency. VAT proposes a document's lines in euros at its rate. Not built: a cash box in another currency (invoices the client issues in another currency: since 18 October
   2026, under "Invoices the client issues"), revaluation of other assets than receivables,
   payables and bank accounts (advances, loans in a foreign currency booked by hand), the tax treatment of unrealised
   differences. test/currency.runtime.mjs, units "Foreign currencies".
   The one-stop shop (built 17 October 2026, schema step 33: `documents.vat_country`, `companies.oss_since`,
   `oss_returns`): `src/app/oss.ts` (the EU scheme as Forvis Mazars and Art. 366 of the Directive describe it: a
   calendar quarter, by the end of the month after it and not moved, filed also when nothing was supplied, in euros at
   the ECB's rate of the quarter's last day or the next declared, corrections of filed quarters in a later return; the
   file DPOSS_EUv01, the EU's OSSVATReturnMSCON, kept as `test/xsd/dposs_eu01.xsd` byte for byte, SHA-256 4f0982aa...,
   fetched through the browser pane because the shell cannot reach ekr.financnasprava.sk; the member states' standard
   rates of 2026 tell STANDARD from REDUCED). The booking form offers the mode "Spotrebiteľovi v inom štáte EÚ (OSS)"
   with the member state, its rate, the base and VAT to a company with "OSS od" in its details; such a supply is left
   out of the Slovak return and booked on 343.400 (`VAT_OSS`). `/ucto/klienti/:id/dph/oss?stvrtrok=` (linked from the VAT
   page): the quarters since, each running, waiting (the one before not filed), blocked (no state, no rate of the
   quarter's end, a negative line, services to Northern Ireland, a supply not booked), ready, filed or changed since;
   the lines, the corrections, each state's balance, the file `/dph/oss.xml`, the mark with its day (the client told the
   tax and the deadline), the last quarter's mark taken back. The deadlines list it (kind 'oss', ours). Not built: the
   import scheme (IOSS), supplies from a fixed establishment in another state (MSESTSupplies), the 10 000 € threshold
   watched, the payment's account and reference (the client is sent to the portal's confirmation). In the filing
   bundle since 18 October 2026 (below). test/oss.runtime.mjs, units "The one-stop shop".
   Intrastat (built 17 October 2026, schema step 34: `companies.intrastat`, `intrastat_goods`, `intrastat_returns`):
   `src/app/intrastat.ts` (read that day on intrastat.financnasprava.sk, the Statistical Office's handbook for 2026:
   the threshold 1 000 000 € a flow, 200 000 € arrivals and 400 000 € dispatches for SK NACE 01, 02, 03, 10, 11, 12,
   the window 1 October to 30 September before the year or the year so far; by the 15th after the month, the next
   working day; the month of the VAT tax day; the value the VAT base up to the whole euro, at least 1 €; the mass in
   whole kg, under 1 kg up; Greece GR; an invoice below 1 000 € simply as 9950 00 00; nil reports; later items in a
   further regular report, errors by a corrective report M with the item's original number, a cancelled item at 0;
   the file instat62.xsd, ISO-8859-2, kept as `test/xsd/instat62.xsd` byte for byte, SHA-256 03d5dd7c..., fetched
   through the browser pane). Items come from booked documents (acquisition is arrivals A, eu_goods dispatches D, a
   credit note only when its goods came back, as 2/1 in the other flow), one per kind of goods of a document (none
   summed). `/ucto/klienti/:id/intrastat?mesiac=&tok=` (linked from the VAT page): twelve months, each flow's state
   (not reported before the month in the settings, running, blocked, ready, sent, changed since), the items, the
   threshold from the books, the settings (months each flow from, agriculture, nature, transport, terms, region,
   origin, contact), the file `/intrastat.xml` (latin2, envelope AA plus month, flow and filing), the mark, the last
   mark taken back; `/intrastat/doklad/:doc` a document's goods (lines with CN8, origin, mass, supplementary unit,
   value; nature, transport, terms, region, state, partner, month, returned, skipped). The deadlines list each flow
   (kind 'intrastat', ours). Not built: the CN tariff with its supplementary units (typed by the accountant), goods
   moved without a document (own goods to a warehouse abroad, processing), items summed, the threshold watched on the
   screen of deadlines, sending through the portal's web service. test/intrastat.runtime.mjs, units "Intrastat".
   OSS and Intrastat in the filing bundle (built 18 October 2026, `src/filings/extras.ts`): the ready OSS returns (the
   deadlines' last five quarters, ended) and the Intrastat reports to send (the last four months of each flow, ended,
   first reports and what follows a changed month) of her companies go into `/ucto/podania/balik.zip` (folders `OSS/`
   and `Intrastat/`, the Intrastat file in ISO-8859-2 dated at the download), listed under "Na odoslanie · OSS a
   Intrastat" with a tick each; `/naraz` marks a ticked one through `team/marks.ts` (`markOssFiled`,
   `markIntrastatFiled`, the same the company's pages use) only when the fingerprint the page carried (`sig:`) still
   matches what would go, else it asks her to download again. test/bundle-extras.runtime.mjs.
   Joint-stock companies (built 17 October 2026, schema step 35: `orders.legal_form`, `orders.acting`,
   `orders.signed_role`, `companies.legal_form`, `companies.signed_role`, `closings.distribution`,
   `closings.distribution_entry`): `src/rpo.ts` reads the register's detail of an entity, seen live that day: the legal
   form by its code (CL000056: 112 s. r. o., 121 a. s., 125 j. s. a.; else by the name), the statutory body (CL010113:
   3 konateľ, 99 predstavenstvo, each member's role "Predseda predstavenstva" and the like; the supervisory board and
   ended members left out) and the manner of acting (`authorizations`, the proxy's left out). An order is made for all
   three forms; one member concludes online only when the register says the members act alone ("samostatne" and nothing
   that asks for more) or there is only one (`oneMayConclude`); otherwise the order page, the review (which shows who
   acts and how) and the link say the contract is signed on paper by all of them. This mended a gap of s. r. o. too:
   two konatelia who act together were each allowed to conclude it alone. The signer's role is kept and printed on the
   power of attorney, the letter to the former accountant, the contract and the archive (`signerRole`); the paper
   contract's form takes the legal form and the role, and a client's details its legal form. The terms (TERMS_VERSION
   2026-10-18), the site, the declaration, the privacy notice, payroll's labels and the import read the statutory body
   for every form. The DPPO and the PREHLAD write the company's own `pravnaForma` (they had 112 fixed). The audit of
   § 19(1)(a) of the Act on Accounting is the same for every company since 2026 (two of 4 000 000 €, 8 000 000 €, 50,
   read in the versions of 1 June 2026 and 1 January 2027): nothing changed. A year's result distributed
   (`src/app/distribution.ts`, the Commercial Code § 67, § 124, § 217, § 220h and the Income Tax Act § 43(1)(a), (11),
   § 52zzz(4), § 52zzzb read on slov-lex that day): on the closing page (`#rozdelenie`) the result after tax, the
   capital, the fund, what was kept and the losses; the reserve fund's minimum (an s. r. o. 5 % of the profit until
   10 % of the capital, an a. s. and a j. s. a. 10 % until 20 %), no dividend before it, nothing paid out beyond the
   profit and what was kept after the losses; booked by an internal document on the approval day (431 against 421,
   429, 364, 428; a dividend beyond the profit 428 against 364; a loss 429 against 431) and the tax withheld on
   dividends to natural persons (7 %, 10 % of the profits of 2024) on the payout day (364 against 342); its payment and
   notice by the 15th after the payout is a deadline of ours (kind 'dividendTax'; the client's list says to pay it),
   marked on the closing page. Not built: two or more signature lines on the power of attorney when members act
   together (the paper contract is signed outside), the annual report (výročná správa) of an audited company and its
   later filing, the notice of the tax withheld as a file (FS's form), a micro a. s.'s own shares in the notes (the
   sentence says it has none), the reserve fund for own shares (row 089 of Úč POD, placed by hand), the supervisory
   board in the declaration. test/joint-stock.runtime.mjs, units "Joint-stock companies".
   Mended after an independent review (18 October 2026, schema step 36): the closings' period guards leave out the
   distribution and the revision (`closingsGuardsWithoutDistribution`; a year locked past its end no longer blocks
   the distribution, which is decided in the next year and guarded by its documents' days; a lock error on taking it
   back or marking the tax is said, not a 500); the reserve fund gets its share of every profit, dividends or not
   (podnikajte.sk on § 124: at least 5 % of the net profit, up to 10 % of the capital); the result is distributed only
   after the year's tax is booked as computed (`taxUnbooked`), and the distribution keeps the equity it was booked
   against (`basis`) so a later change of the year is flagged on its card; a loss year may cover the loss out of what
   was kept (428) or the reserve fund (421) and pay dividends out of what was kept after the losses; the part of the
   dividends to natural persons paid out of profits taxed at the other rate (`peopleOther`: 2024's 10 %, or before
   2024 at 7 % when the year is 2024) is asked and withheld at its rate, each part rounded to the cent (FS: rounding
   is mathematical since 2020); `actingMode` says 'alone' only when "samostatne" is said of every member without an
   amount's limit or a named office (the chairman alone, "nad 10 000 eur ... oboch"), and the proxy is left out also
   as "prokúra"; the OSS and Intrastat pages' marks carry the fingerprint of what the page offers (`sig`, 'stale'
   when it changed); goods that go back keep their origin (acquired goods the supplier's state, ours from the
   settings); a goods line needs a mass above zero unless it has a supplementary unit. Left as they are: Intrastat's
   envelope number repeats each year (month, flow, filing), the deadlines list the last four months of a flow and a
   month done by its first report, a legal form left empty is read as s. r. o. (all clients before step 35 were), a
   positive corrective invoice is reported as goods, the free equity reads only 411, 421, 428 and 429.
   Volume (18 October 2026, after midnight): the client's lists of payments and documents show 400 a page with
   "Staršie" and "Novšie" (`?strana=`, `LIST_PAGE` in `src/app/routes.tsx`; they ended at 400 before); the VAT page shows
   at most 25 issues of a kind and how many more (`capped` in `src/views/vat.tsx`: 166 kB became 51 kB at 300 documents
   a month, a month of 3 000 was 1,5 MB). test/lists.runtime.mjs. Profiled (18 October 2026, `FIRMONY_LOAD_PROFILE=1 npm run test:load`:
   the runtime's own CPU profile per page through the DevTools protocol, the functions that take the most): dates
   formatted by Intl on every row (`bratislavaDay` and the lists' day and clock now arithmetic by the EU summer-time
   rule, `src/time.ts`, checked against Intl across 18 years), a working day worked out again for each document
   (remembered now, `workingDayFrom`), the VAT issues deduplicated by scanning their list (a key set now). At 1 000
   documents a month: deadlines 554 to 346 ms, the client's page 1 119 to 923, the client's overview 546 to 378, VAT
   670 to 472, the lists 213 to 145. What is left on the books' pages (about 0,55 s): reading every document of the
   company from D1 and the garbage of it; next for volume, the books kept per data revision (a cache within an
   isolate needs a bound on memory: 36 000 documents a year would not fit).
   Later on 18 October: the books and the VAT periods read only the columns they need (`BOOK_DOC_COLUMNS`, no reader's
   proposal, file, names or codes) and each document's VAT is worked out once for its entry (`documentLines` takes the
   plan). Measured by `npm run test:load` here, each page three times: at 1 000 documents a month the trial balance
   451 to 349 ms, the journal 431 to 314, an account 470 to 326, the closing 460 to 366, VAT 396 to 329, the client's
   page 804 to 704, the team's home 330 to 261; at 3 000 a month (36 000 documents and payments a year) every books page
   answers in 1,0 to 1,3 s (1,3 to 3,8 s on 17 October), the client's page in 2,1 s (3,8), the team's home in 0,7 s (1,7).
   The site promises a
   large company only an offer of its own until the software does each part; every text widens when a part lands.
9. **How he is worked with.** Slovak, short, the verdict first; say how long a piece of work takes before it
   starts. No keys or passwords in chat; he pastes them into Cloudflare himself. Push to `main` only after every
   check passes and when he has asked for the work to be put there (his word of 15:32 on 17 October: "ak sú
   skontrolované a funkčné perfektne dávaj ich ostro na GitHub"). Nothing is bought, no account is made and no
   terms are accepted for him.

Current social-reporting follow-up (17 October 2026): [docs/security/social-reporting.md](docs/security/social-reporting.md).
Additive schema **22** prepares full R/O MVPP 2026 XML for supported ordinary full-month employment in
2026/2027, with independent historical fund/rate/cap checks and official XSD validation. Verified RČ is shared
with health preparation; versioned IČPV is reused, while monthly analytical hours are explicitly checked afresh.
Unknown hours use a separate, reasoned 999 choice, never an inferred zero. Admin corrections invalidate the
affected generated coverage, queue/deadline and handover, retaining original files and receipts. SQL checks live
authority/revisions; owners get read-only evidence and no new forms. Exports, synthetic restoration and controlled
purge cover all three new tables. Schemas 19–21 remain byte-for-byte unchanged. Earlier notes saying all SP files
need external preparation are superseded only within this documented ordinary scope. Special employment,
RLFO, actual portal import/acceptance, production recovery and legal/insurance/enterprise readiness remain open.
The January 2026 announcement concerned VPP and explicitly still restricted MVP; it is not proof of live MVPP
acceptance. No automation percentage or perfect production behavior is claimed. Continue PR #8, preserve history;
no automatic merge/deploy. Exact-head CI counts and visual evidence are recorded in the PR.

Current health-reporting follow-up (17 October 2026): [docs/security/health-reporting.md](docs/security/health-reporting.md).
Additive schema **21** prepares insurer-scoped UTF-8 514 batches for supported ordinary employment.
New closed payslips retain their exact health regime; legacy slips without it require external preparation.
Verified insured identifiers are masked in preparation, versioned, reused and corrected only by an admin with
a reason. An identity correction invalidates affected generated coverage, deadlines and handover completion
without erasing original reports/receipts or altering unrelated recipients. Header, source and identity revisions
bind the review; live SQL assignment/CAS guards apply. Owners have read-only origin/files and no new form.
Complete exports preserve required import names, identity history and provenance. Holds, synthetic restoration
and controlled purge cover new records. Schemas 19–20 remain unchanged. Live insurer acceptance, SP generation,
special employment, production recovery and legal/insurance/enterprise approval remain open. No merge/deploy;
continue PR #8, preserve history, and never claim that a prepared batch has been submitted or accepted.

Current payroll-generation follow-up (16 October 2026): [docs/security/payroll-generation.md](docs/security/payroll-generation.md).
Schema **20** separates the verified actual payout date from the accountant-reviewed FS reporting period.
The old universal cash-month assignment was too broad: existing schema-19 payouts migrate with an unreviewed
period, preserving their facts and historical receipts. An administrator can document resolution of an empty
incorrect target; newly assigned income reactivates it. No fake zero report or automatic cancellation is created.
Regular Slovak s.r.o. wages without bonuses/special tax adjustments can generate an exact PREHLADv26 file,
with a source-bound review, immutable provenance and ordinary independent receipt workflow. Official XSD
validation is covered by tests; real portal acceptance remains unverified. SP reports still need external
files; schema 21 above extends supported health output. Payout corrections, owner-only evidence, exports and retention remain shared with schema 19 below.
Partial/irregular/noncash income, annual reports, live delivery and production verification remain outside scope.
Receipt matching is a professional's recorded check, not API proof. Prior paid-month assumptions are superseded.
Existing legal/insurance/enterprise gates remain NO-GO. No automatic merge/deploy; continue PR #8 and preserve history.

Current filing-evidence follow-up (16 October 2026): [docs/security/filing-evidence.md](docs/security/filing-evidence.md).
Schema **18** separates saved XML from recorded submission, accountant-checked acceptance, refusal and review.
Each VAT/KV/SV/DPPO/UZ document has its own immutable payload, receipt history and scoped permissions. The
current unfinished queue spans all periods; deadlines never treat preparation or legacy marks as acceptance.
Portable exports and retention include original receipts. Pending current filings block handover freeze.
Payroll recipient-level evidence is extended by schema 19 above. Mixed-state correction workflows, live FS/Peppol delivery, production
recovery and business/legal/insurance approval remain open. Tests are synthetic, not real authority receipts.
No automatic merge/deploy; continue the existing cumulative PR #8 and preserve all branches/history.

Current shared-product follow-up (15 October 2026): [docs/strategy/11-shared-product-and-automation.md](docs/strategy/11-shared-product-and-automation.md).
The existing cumulative PR #8 now also fixes cross-supplier duplicate collisions, same-second duplicate cycles,
out-of-order OCR rechecks, malformed AI output and impossible dates, and safe return to work after passkey
confirmation. It preserves period context only from the same work page/origin; rejected POSTs never replay.
This is tested code, not a measured 99% automation rate or whole-product production acceptance. Schema remains 17.
No automatic merge or production deployment; keep the existing PR and preserve previous branches/history.

Current security implementation (15 October 2026): [docs/security/README.md](docs/security/README.md).
The current cumulative branch is `codex/firmony-security-and-evidence` (base PR #7 `04ec8eb8`), schema 17.
Team work now requires passkey UV; sensitive actions require fresh confirmation. Incidents/holds block retention,
and a synthetic D1/R2 restore drill verifies recovery with revoked old sessions. Independent evidence archiving,
production backup/recovery and business readiness remain unverified. See the first PROGRESS entry. Historical
claims below about missing MFA/claims registers or no client JavaScript are superseded by this scoped change.
No automatic merge or production deployment; preserve prior branches and history.

# Firmony: working notes

Current responsibility and signing controls (15 October 2026): [docs/responsibility/README.md](docs/responsibility/README.md).
Schema 15 stores full acceptance-time contracts and tariffs; known legacy text is a labelled reconstruction,
unknown versions never show today's terms. Proposed terms 2026-10-15 await lawyer/underwriter approval.
Signing stays closed without catalogue-bound CONTRACT_RELEASE and an admin's documented per-order expert review.
Only reviewed supported micro scope can sign a standard package; larger or complex firms need an individual service.
No actual insurance, reserve, enterprise capacity or legal approval has been established. The new evidence register
is NO-GO; claims retention/legal hold and independent preservation are still prerequisites. The current cumulative
branch is codex/firmony-liability-and-enterprise-readiness. Prior commits/branches are preserved; no automatic merge/deploy.


Current strategy and evidence (15 October 2026): [docs/strategy/README.md](docs/strategy/README.md).
Its ten documents distinguish implemented code, local mocks, public competitor claims and unknown production
readiness. Historical economics and launch assumptions below are not measured results. The new support queue
keeps the first unanswered client's time until an explicitly audited personal reply; automated filing notices
do not count. See the latest PROGRESS entry for scope and validation. No merge or production deployment.

Accounting for young Slovak companies (s. r. o.), run by europio s. r. o. (the owner's company; no new s. r. o.,
his word of 12 October 2026). AI does the routine, a freelance accountant checks and files, one fixed monthly
price. The service starts on 1 January 2027; until then the site collects non-binding requests.
The owner does not use a terminal: everything has to work by pushing to `main`, and anything he must do himself
is a few clicks in a dashboard. He writes Slovak, often dictated, reads little: verdict first, short.

## Closing the loop (17 October 2026, from 10:19; branch `claude/kruh`)

His word: the whole software "na 100 % hotový", every piece of noise out or merged, the project a closed circle with
no dashed line ("ten kruh chcem, aby bol celý plynule uzavretý"); he has picked an accountant and meets her in about
two weeks; the trade licence and the rest of the online steps come after the software is ready. He was given seven
stages (about five working days) and is told after each: (1) critical faults, (2) from a request to the first
document, (3) Firmony's own billing, (4) one desk for the accountant, (5) texts that are true, (6) operations,
(7) a check of the whole circle by a reader who wrote none of it. The picture he follows is the artifact "Kruh
Firmony" (https://claude.ai/artifact/6RwoEgbSJZx3hpdBafRN3M; its source is the scratchpad's `kruh/kruh.html` of that
session, so a new session reads it with the Artifact tool and republishes to its URL). Nothing is merged or deployed
by the builder until his word of 15:32 (see "Start here"). Open with him: the opening line (the code has Codex's
"Vy budujete firmu. My strážime účtovníctvo."; "Postaráme sa o všetko. Vy rastiete." is his to bring back).

- Stage 1 (`640bb91`): a company in handover no longer stops the bank for the others; a freeze without a reason is
  lifted; schema step 24 (the archive's revision moves only when data change); an original is never deleted when a
  write is uncertain; removing an account keeps the payments already worked on; a client without a passkey confirms
  an archive by a fresh link; the night's jobs run step by step.
- Stage 2 (`7dabc08`): a request becomes an order that waits for the administrator's review, and only then is a
  contract link sent; a link run out asks for a new one; a client is made by hand only with a paper contract
  (`OFFLINE_TERMS`); the switch of accountants in the app (the letter sent, what the former one handed over, taken
  over on the client page).
- Stage 3 (`f3fe4a9`, schema 25): europio is a company in the app (the operator) and bills every client from what
  the app knows (`src/team/billing.ts`): the plan in advance, a month above the plan as the next plan, payroll for
  each person employed, the closing once filed; the invoice arrives among the client's documents and is paid by
  itself from europio's statement.
- Stage 4 (`e78baa4`): one truth for deadlines. A filing sent and waiting for its receipt is never late; the team's
  home opens with "Dnes na rade" (ours, late or due within a week, `pressing`); a client with something pressing is
  never ticked as done (`clientDone` in `src/team/store.ts`). The client's overview reads the team's deadlines
  (`companyDeadlines`, `clientDeadlines` in `src/app/deadlines.ts`). Payments before the books start
  (`booksFromSql`: the opening entry's day, else the contract's first day) ask for no document and no statement
  (`MISSING`; pairing still sees them through the filter 'unpaired'). Filing files (VAT, control statement,
  summary statement, closing) are served only from saved podklady. Removed: the monthly CSV (the books' own files
  replace it), new hand marks of payroll reports (an old one can only be undone), long dashes anywhere (a unit check).
- Stage 5 (texts that are true): the terms say what billing does (`TERMS_VERSION` 2026-10-17: payroll per person
  employed in employment with a monthly wage, what a document is, when each part is billed, the closing of a micro
  entity), and the deletion as the code does it: 90 days after the end once every year's archive is confirmed,
  else a year after the end (`ENDING.unconfirmedDays`, `unconfirmedFloor`; an open case or an unfinished filing
  postpones it). The app, the FAQ and the legal page say the same; no text promises ten years of access.
- Stage 6 (operations): `/app/prvy-spravca` gives the first administrator's settings (item 7 below), `keep_vars`
  in `wrangler.jsonc`, and email that could not be sent in fourteen days is flagged on the team's home
  (`failedMail`). `/ucto/ziadosti/schvalenie` (administrators) says whether `CONTRACT_RELEASE` holds and why not
  (`releaseState`: missing, unreadable, for other terms or prices, expired) and prepares the value from the
  lawyer's and the insurer's references and a last day (`releaseValue`: valid until the midnight that ends that day
  in Bratislava); nothing is stored. The domain is one constant (`DOMAIN` in `src/config.ts`; his word was
  firmony.io, still to buy, so it still says firmony.ai). His guide, in Slovak and in the order that works (the
  domain first, because passkeys are bound to it): `docs/spustenie.md`. A separate doc for it was refused by the
  tooling as not asked for; it is offered to him.

- Stage 7 (the check of the whole circle): an independent reader (one helper, read only) walked the circle; every
  finding was verified in the code before it was mended. What changed:
  - Registrations with the Social Insurance Agency and the health insurers (`src/team/registrations.ts`, read in
    the original on 17 October 2026: Act 461/2003 s. 231(1)(a), (b), Act 580/2004 s. 24(1)(c), (k)): the employer
    the day before its first employee starts, an employee the day before the start, the insurer within eight working
    days of a start or an end, the Agency within eight days of an end; only while the contract is ours. They are
    deadlines of ours (kind 'registration'), filed by the accountant in the portals and recorded on the payroll
    page ("Prihlásenia a odhlásenia", events `registration.done` and `registration.undone`, the newest counts; one
    recorded stays visible a month after its day or after it was recorded). Terms 2.2: the client reports a hire in
    the app three working days before it.
  - Income tax advances (Act 595/2003 s. 42(1), (2), (7)): the next one a filed return asks for is a deadline of
    the client's (kind 'taxAdvance', `nextTaxAdvance`), from the month after the filing deadline, monthly or by the
    end of each calendar quarter, moved to a working day; whether it was paid is not read from the bank. So are a
    closed month's wages and levies, until its payday (kind 'payrollPay'; the client's app leads to the message
    with the sums and accounts).
  - The handover counts as made only with the files and the power of attorney given up (terms 10.4; the event
    `poa.resigned`, `handedOverSql`), recorded on the client's handover card.
  - A wrong power of attorney goes back to the client with why (`/ucto/klienti/:id/plna-moc/:file/vratit`,
    `returnPoaStatements`, event `poa.returned`, a message in the app); never one that was checked.
  - An online order that lapsed before its review is renewed for 30 days with a new token
    (`/ucto/ziadosti/:id/obnovit`, `renewOrderStatement`), never for a client; the review page always offers the
    paper contract too, and says so for a bespoke decision. `latestOrderOfRequest` replaces three copies of a query.
  - The team page marks a member without a passkey and leads to the activation code; the invitation says the code
    comes outside email. An accountant is told that the administrator ends a contract. Fio not answering is said as
    that (`fio-neodpoveda`), not as "too soon". Taking back a notice says it can be taken back.
  - The payroll page says what is prepared where (monthly reports and the tax office's summary in "Mzdové
    podania", registrations recorded on the page itself); a name on a stacked row wraps instead of ending in "...".
  - Noise out: six unused exports and nine unused texts.
  - 16 rules taken out once (`scripts/dev/mutate.mjs`); units 866, runtime 1320 on Node 24, the visual test with
    five more pages at 1440, 390 and 320 px. Commit: see the log ("Close the loop: the check of the whole circle
    (stage 7)").
- On main since 17 October 2026 at about 15:40, his word of 15:32: "ak su skontrolovane a funkcne perfetkne davaj
  ich ostra na github ... chcem aby tato cast bola hotova, a riesime uz len omacky okolo ako su potvrdenia zivnost
  uctovnik". The seven commits of the loop were pushed to `main` after `npm run test:browser` (31) passed as well;
  there is still no Worker, so nothing went live. What is left is his: the steps of `docs/spustenie.md`.

## Where things stand (written on the night of 12 to 13 October 2026, brought up to date on 14 October at 19:05)

- Built in one evening, at his word "pracuj na maximum": the brand and the website as the company's presentation
  ("najprv brand, naša web stránka, prezentácia ... niečo, čo rozbije konkurenciu"). Software for the accountants
  comes after it.
- Name: **Firmony** (firma + harmony), chosen by the builder on his "zhodnoť ty". firmony.ai and firmony.app were
  free at Websupport on 12 October 2026 (.ai 193,80 € for the first two years, then 96,90 € a year; .app 21,90 €
  a year); firmony.com is taken; a web search found no business of that name. He wanted .ai, .io, .com or .app and
  nothing Slovak-sounding ("nie účtik alebo účtovník a bodka sk").
- The domain, his word at 23:43: "Tak drahú doménu kupovať nebudeme. Maximálne to .io pretože to je lacnejšie"
  (he had read the .ai price as 20 € a month). firmony.io was free at Websupport that night at 69,90 € a year;
  .app is 21,90 €. **Not chosen and not bought**: buying is his. Until he names it, `BRAND.origin`, `BRAND.email`
  and `MAIL.from` say firmony.ai; when he does, those three change, and so do the test's `site`, the notes'
  firmony.ai, and `wrangler.jsonc` once a route is added.
- Nothing is deployed. The code is on GitHub, `grapuu/firmony` (private), created on 13 October 2026 at 16:20
  from the browser pane of his desktop app, which he signed in to GitHub (account grapuu) for it; `main` is pushed.
  A new session adds the repository with `add_repo` (owner grapuu, access "push"). There is no Worker yet.
- All checks pass: `npm test` (443 unit checks) and `npm run test:runtime` (496 checks in workerd). The sixth
  design is committed (13 October 2026, from 15:07): white, blue and red, built as CloudTalk builds its site.
- **The client's app, first version** (13 October 2026, from 16:44, his word: "môže začať stavať software ...
  doslova okopíruj ten model ... aby ten človek z toho nemal strach ... také interaktívne, také moderné, jak web
  stránka. A hlavne ten systém musí fungovať logicky a dokonale"). Built under `/app`, pushed (`90032d6`), not
  deployed. What it is and how it works: "The client's app" below. A clickable copy with the sample company is the
  artifact "Firmony aplikácia" (https://claude.ai/artifact/RiaH2Z4AzYHCM2EQw7EPhc), sent to him at about 17:20 with
  what to click.
- **The whole structure, from 17:48** (his word: "Nič som nechcel dopísať. Potrebujem, aby sme to nejak dokončili
  a ešte raz musíš okopírovať tú štruktúru a to, čo ľudia milujú ... a dorob to celé, nech to už vytvorí štruktúru
  a vieme postupovať ďalej"). He was sent four steps with a time for each, and a message after each:
  1. The accountants' side and his administration (about 20:00): **done at 18:37** (`b4e7e1e`), "The
     accountants' side" below; the artifact (version 3) has both sides, the bar at its bottom switches them.
  2. For the client (about 21:30): **done at about 19:00**: documents forwarded by email, reminders by email,
     first steps after signing in, the company's page (inviting a partner), the app on the phone's home screen,
     search; "The client's app" below has each.
  3. Issuing invoices, also as e-invoices, marked paid by themselves when the payment comes (he was told
     about 21:00): **done at about 19:45**, "Invoices the client issues" below; the artifact (version 5) has them,
     and its bar has "Faktúra u odberateľa", the page a customer opens.
  4. The bank by open banking (Enable Banking), switched on by his registration (he was told about midnight):
     **done at about 20:15**, "The bank by open banking" below; the artifact (version 6) has it (Platby, "Prepojiť
     banku", the sample of a bank's sign-in, the bank linked, invoice 20260007 paid by the money it brought). What
     switches it on is his: item 9 of the list below.

- At 21:16 he asked how to do Enable Banking ("claudfare potom ostatne, ale budujeme model ktory funguje a robi
  miliony ... nebudujeme tu ruzove okuliare"). He was given the order: his own account in Enable Banking's
  Control Panel now (accounts are not made for him), and an email asking their price per connected account (at
  100, 1 000 and 5 000) and the contract for production, Czech banks included; the production application only
  once the domain, the site on Cloudflare and the terms of service exist (they ask for those URLs). No public
  price list was found on 13 October 2026. On the model he was told: proven abroad, but the millions come from
  clients, not software (1 M€ of revenue is about 800 clients at 105 €; Slovakia is about 12 times smaller than
  France, so millions of profit need Czechia and further), and what kills it is the cost of a client and
  accountants who keep up (Bench).
- From 21:18 to 21:44 (13 October 2026). He asked for the grammar everywhere ("Vás s malým v aj Vám ... všade
  chyby tieto") and for the pricing with every cost; then whether the price list belongs on the web, how onboarding
  and the contract are done, and whether a person is needed. The texts were corrected and pushed (`8b1be32`: polite
  forms with a capital V, "Vy rastiete." for "Vy rastite.", agreement and gender, "platiteľom DPH", the register
  entry in the locative, the legal page names the app's sign-in cookie); both previews were republished (the site
  version 12, the app version 7). He did not open an Enable Banking account ("účet si nevytváram, načo") and wrote
  to them himself at 21:26 from juhasgr@gmail.com (the price per account at 100, 1 000 and 5 000, the production
  contract, Czech banks); the account waits for their answer and is due in November. He wants to be ready in
  December ("ideálne ak v decembri by sme boli ready"). He was told: the free trade "Vedenie účtovníctva" is
  announced online at slovensko.sk with eID, free (7 € in person), the certificate comes within 3 days and the
  accounting may be kept from the day of the announcement; the commercial register entry costs 50 € and since
  17 August 2026 (Act No. 29/2026 Z. z.) only an advocate or a notary may represent the company in it (about 100 to
  200 € and one to two weeks; whether the change of the business object needs a notarial form was not read in the
  Act); as a seller of accounting europio is an obliged person under Act No. 297/2008 Z. z. (goAML within 30 days
  of the trade, an AML program that the builder writes, the client identified at onboarding), which has nothing to
  do with employing anybody. He feared that November is too tight for winning clients; he was told that 1 January
  is only the best moment for those who switch: 5 to 10 firms of his own circle for January, marketing from
  December for February and March, new companies in any month. His word at 21:40: "budeme mať najlepší produkt,
  najlepší marketing a zdominujeme to tu."

- From 21:49 to 23:00 (13 October 2026). His "ano zacni" to the onboarding with the contract online, after
  "účtovníčka nebude robiť za 25 eur" and, for the price list, "ak príde eshop čo má 100 000 dokladov mesačne bude mať
  rovnakú cenu" and "maržu musíme mať aspoň 60 percent"; his "ano" at 22:04 to the new price list (Product decisions).
  Built and pushed, each with all checks passing:
  - `0e218dd`: the price list by documents a month, payroll and the closing apart, the accountants' pay, a unit check
    that every plan leaves at least 60 %.
  - `86f91d2`: the contract concluded online by a director the register names ("The order and the contract online"
    below), the terms of service at /podmienky.
  - `578f1c7`: the power of attorney to sign and upload, the accountant's check, the notice to the former accountant,
    the new first steps ("The power of attorney and the notice" below).
  - The privacy notice names what the app and the contract process (Anthropic, Enable Banking, the accountants, the
    authorities, the AML records; `PRIVACY_VERSION` 2026-10-13).
  - The AML program ("Program vlastnej činnosti", § 20 of Act No. 297/2008 Z. z.) is his doc "Program proti praniu
    špinavých peňazí" (https://claude.ai/code/artifact/8ea0b7dd-211f-495e-ab08-744e5796b0d1), a draft for him to
    approve and sign, with what is still missing in its section 8 (goAML registration, the client's declaration in
    the app, a lawyer's reading, the accountants bound to it in their contracts).
  - The rules of the order and of the papers were each taken out once (`scripts/dev/mutate.mjs`): 14 of 14 held.
  - The previews: the site version 15 (the terms; the contract page, reached from the note under the IČO card and
    from the thanks page), the app version 8 (Plná moc, Prechod, and "Nová firma" in the bar: Ateliér Nova with the
    power of attorney first among its steps).
  - Nobody has read the terms, the power of attorney or the AML program for him; a lawyer should before the first
    client. (Deleting a closed client's data after 90 days is built since the night of 14 October: below.)

- From 23:03 (13 October 2026). His word: "ano makaj, nechcem ziadnu komunikaciu mailom nic take... vsetko v nasom
  uzamknutom ekosysteme": his yes to the client's declaration in the app, and nothing by email. He was told how it was
  read (Product decisions) and "2 až 3 hodiny". Built and pushed at 23:55 (`6a6fb04`), with all checks passing
  (units 218, runtime 366):
  - "Everything in the app" below: every email to a client or the team is a doorbell without content
    (`src/bell.ts`); the client's declaration for the law against money laundering at /app/vyhlasenie, first of
    four first steps; the contract and its terms in full at /app/zmluva (the email that carried them is gone); the
    notice given and taken back in Firma a nastavenia; the terms and the privacy notice say so.
  - The team's "Identifikácia a riziko" (/ucto/klienti/:id/aml): the declaration in full, its check, the risk, the
    internal reports with the designated person's decision ("The accountants' side" below).
  - The AML program doc is brought up to date (in-app declaration and reports, no email; the two items of its section
    8 checked) and the app names the highest risk "Zvýšené", as the program and the law do.
  - 26 rules taken out once (`scripts/dev/mutate.mjs`): 26 held (one, a reminder once for a person, after its set
    was taken out: the outbox key holds it).
  - The previews: the app version 9 (Kto stojí za firmou, Zmluva, the notice in Firma; "Nová firma" in the bar opens
    Eva's empty declaration; the team's Identifikácia a riziko from both clients' pages), the site version 16 (the
    FAQ "Ako spolu budeme komunikovať?", the terms with every notice in the app).

- From 23:56 (13 October 2026). He asked whether people will download the app from the App Store ("za to sú
  poplatky u Apple") and said "Jasné, dobre, pusť sa na to" to the next step he was offered: what happens when a
  contract ends. He was told: no store, no download and no fee to Apple or Google: Firmony is a web app that goes
  on the phone's home screen from the browser (Safari: Zdieľať, Pridať na plochu; Chrome: Inštalovať aplikáciu),
  and an app in the stores could come later if ever wanted; and, for the end, "asi 3 hodiny". Built and pushed at
  00:36 on 14 October (`8eb3c82`), all checks passing (units 238, runtime 420): the administrator ends a contract
  from our side, the last month's documents are taken ten days past the last
  day, the accountant hands the books over in the app, everything downloads as a ZIP a year, and ninety days past the
  end the schedule deletes the company's data, the identification five years later. The AML program doc (rev 25)
  says so, and a doubled sentence in its section 3 was put right. The previews: the app version 10 ("Koniec
  zmluvy" in its bar: the overview, Firma, Doklady and Faktúry twenty days past the end, and the team's client page
  with the handover; "Stiahnuť ZIP" says in the preview what the app downloads), the site version 17 (the terms and
  the privacy notice of the end, the FAQ "Musím sa viazať?").

- From 08:26 (14 October 2026). His word: "ano mozeme ist na to, nas workflow musi byt elitny a jasny aby sme
  postupne urobili vsetko a boli sme skutocne best na trhu, nie len ruzove okluiare alebo na oko. ale skutocne." It
  was his yes to step 1 of the order he was given that morning: (1) the VAT return and the control statement as XML
  from the booked documents, (2) an export to Pohoda or Omega (about 3 hours), (3) every client's deadlines on one
  screen (about 2 hours), (4) the digital postman once he picks a provider (about 4 hours), (5) eKasa receipts by
  their QR code (about 2 hours), (6) in November europio's own documents, then two or three firms he knows. His, in
  parallel: the domain, the trade licence, 3 to 5 accountants called, an email to Qvalia, a lawyer. He was told
  "3 až 4 hodiny". Built: "VAT: the return and the control statement" under the accountants' side. Midway the
  builder found that a period filed and then changed would have been offered as a regular return again, and that
  row 34 (the excess deduction of the month before, § 79(1)) was never filled; both were built that morning
  (corrective and supplementary returns and control statements, the carried excess, the box of § 79(2)). Also:
  an overview with nothing missing but a tax to pay says "Zostáva zaplatiť DPH." with a button to Dane, and the
  deadlines' lead says that the client pays the tax. All checks passing (units 388, runtime 457), 35 rules taken
  out once and every one held. Pushed at 10:27 (`3d62898`). The app preview is version 11 ("DPH" in its bar: September
  ready, then filed; the client's Dane with the QR code; "Keď nič nechýba" now asks to pay the VAT).

- From 10:53 (14 October 2026). He asked "do toho ale nevybudujeme si vsetko svoje?" and was told yes, with the new
  order: (1) our own books (about 5 hours), (2) every client's deadlines on one screen (about 2 hours), (3) the micro
  company's closing and the corporate tax return as XML (about 6 hours, by February), (4) payroll (about 2 days, by
  the end of January), (5) the digital postman and eKasa receipts. The export to Pohoda or Omega is no longer
  planned. His word at 10:57: "do toho". Built: "The books" under the accountants' side (the journal, the general
  ledger, the trial balance, the open items, the bank against the books, payments without a document, internal
  documents, the opening balances, CSV files for Excel and the books in the client's yearly ZIP). All checks passing
  (units 443, runtime 496); 42 rules taken out once, and every one held (two only after a check was added for each:
  an invoice the owner paid himself, and a removed internal document's number never given again). Pushed at 11:58
  (`62712e3`). The app preview is version 12 ("Účtovná kniha" in its bar, with every page of the books of the sample
  company).

- At 12:15 (14 October 2026) he asked for Enable Banking's answer to be read (juhasgr@gmail.com; Deborah Katwikirize,
  12:05 that day, with "Enable Banking | Startup Offer.pdf", read in the browser pane). The offer: we work under their
  licence; building and testing with our own accounts costs nothing, paying starts at going live; a licensing fee of
  1 500 € a month, for a startup 900 € in the first year (40 % off, 1 800 accounts included), 1 200 € in the second
  (2 400 included), 1 500 € from the third (3 000 included); an account above them 0,50 € a month (up to 5 000),
  0,30 € (to 50 000), 0,20 € (above); data fetched without limit; the whole EU (2 700 banks in 29 countries, Czechia
  included). Whether the 0,50 € is only above the accounts included, and the contract's term, were not said. Against
  our model (2 € an account, `TECH` in `test/units.test.mjs`): 900 € is 2 € an account at 450 accounts; with Štart
  alone the 60 % holds from about 253 clients (the bank may cost 3,57 € a client there). Checked the same day:
  GoCardless Bank Account Data takes no new signups ("New signups for Bank Account Data are currently disabled");
  Tatra banka's Premium API (KROS, POHODA and Money S3 use it; it also reads accounts at other banks) publishes no
  price. He was told: do not sign now; start January with statements uploaded in the app; switch the bank on at
  about 250 clients or on better terms; a reply to them asking for no minimum fee in the first year was drafted.

- From 12:26 (14 October 2026). His word: "dobre ale to asi neprijmu cize pod tak, aby sme sa tomu vedeli vyhnut a
  boli aj tak elita top smooth jednoduchy smart a elitny proste". He was told: the bank comes in three ways that cost
  nothing (the bank itself emails a statement to the company's address, Fio banka's free token, a statement added
  once a month), Enable Banking at about 250 clients, about four hours. At 12:48 he asked for a product for investors
  too (the tax return clicked through by themselves, or done by us; one brand; shared by influencers; "keď to
  používaš ako investor a si s tým spokojný, založíš si raz firmu, pôjdeš k nám"). He was told yes, as the way in,
  after the bank: prices proposed and not decided (29 € for one broker, 49 € for every broker and crypto, 89 € done
  by us), about two days, ready in December, and a page "Pre investorov" that collects requests until then. Built:
  "The bank without an aggregator" under the client's app. All checks passing (units 466, runtime 552); 31 rules
  taken out once and every one held (five only after a check was added for each: the yes that judges the next
  statements as they come, the accountant told of them, statements the bank sends and accounts a link reads never
  asked for, the 3rd and no other day, a bank of once a month remembered). Pushed at 14:02 (`fc41ff6`). The app
  preview is version 13 (the sample company's bank sends its statements by email; "Banka" and "Nový účet" in its bar;
  every bank's steps; the next statement paying invoice 20260007; Fio linked; Lucia's statement to check).

- From 15:17 (14 October 2026), a new session continued the order of 10:53 on its own branch,
  `claude/firmony-deadlines-closing-payroll`, with pull requests that the builder never merges (`main` stays his to
  merge; nothing is deployed). The priorities it was given: (1) every client's deadlines on one screen, (2) the closing
  and the corporate income tax return, (3) payroll, (4) the digital postman, (5) eKasa receipts, (6) the gaps these
  notes list. The domain and the product for investors stay his, not decided. Its report, milestone by milestone, with
  what each leans on and what a professional should read: `PROGRESS.md`. Built first: "Every client's deadlines" under
  the accountants' side (all checks passing: units 504, runtime 582; 32 rules taken out once, every one held, one only
  after a check was added for it: what is done is never late). Found on the way and put right: the days off a deadline
  moves past (Act No. 261/2025 Z. z.: 17 November is a working day since 1 November 2025, 8 May and 15 September in
  2026), and a month of a person registered under § 7a whose documents are not all booked was said to have nothing to
  file. Built second (until 17:22): "The closing" under the accountants' side, the financial statements of a micro
  entity and the corporate income tax return from the books, as files of the official eForms (all checks passing:
  units 562, runtime 619; 52 rules taken out once, every one held, three only after a check was added for each).
  Found on the way: an advance on the income tax shares its symbol with VAT (1100…), so a payment to the income tax's
  account was taken for VAT; the books and the VAT paid now tell them apart by the account (prefix 500224 or 500240).
  Built third (until 17:57): "Payroll" under the accountants' side, employees in an employment relationship with
  a monthly wage, under the rules of 2026 and 2027 as the authorities published them (all checks passing: units 590,
  runtime 639; 32 rules taken out once, every one held, two only after a check was added for each). The digital
  postman waits for his choice of a provider. Built fourth: "eKasa receipts" under the client's app (all checks
  passing: units 603, runtime 647; 22 rules taken out once, every one held). Found first: asking the Financial
  Administration for a receipt by program is for a verifier under § 18(11) of Act No. 384/2025 Z. z., whose conditions
  FR SR has not published; whether europio becomes one is his decision, and a letter asking FR SR is drafted in
  `PROGRESS.md`. Built meanwhile: the reader reads a receipt's two codes, which tell one receipt from another.
  Built fifth (until 19:05), a gap these notes listed: the recapitulative statement (súhrnný výkaz) under "VAT", as the
  eForm's file from the issued invoices, with its corrective and supplementary statements (all checks passing: units
  626, runtime 663; 26 rules taken out once, every one held). Found on the way: goods supplied to another member state
  fall due by § 19(8) (the 15th of the next month, or the invoice's day before it), not on the day of supply.

- From 14:05 (14 October 2026), the investors, as he was told at 14:02 ("Teraz idem na investorov ... asi 3 hodiny").
  Built: "Firmony for investors" below, the page /investori that collects sign-ups until January 2027. Before the page
  said a rate, each rule was read again on 14 October 2026 (sources under "What the page says, and where it was
  read"): the dividend sentence was made "spravidla 7 %" (profits of 2024 are taxed at 10 %), and payouts of a
  distributing ETF are said to be 19 % and no dividends. All checks passing on its own branch (units 466, runtime
  577); 13 rules taken out once, every one held. On 17 October 2026 it was merged onto PR #8's head (`d242ff6`) as
  `claude/investori-pr8`: its table became schema step 23. There units 821 and runtime 1215 passed on Node 24 (the
  version GitHub's checks use; this workspace has 22, on which the restore drill at the suite's end stopped with
  "other side closed"; on Node 24 it stopped so twice and passed once, on PR #8's head alone too once: a flaky drill,
  not the investors' code, whose checks all passed every time).

## What he has to do before it is live (each a few clicks)

The same in his words and in the order that works: `docs/spustenie.md` (17 October 2026). Signing online opens
only with `CONTRACT_RELEASE`, which `/ucto/ziadosti/schvalenie` prepares once a lawyer and an insurer have looked.

1. Buy firmony.ai (Websupport or any registrar), add the domain to Cloudflare (free plan), point the registrar's
   nameservers to Cloudflare.
2. GitHub: done on 13 October 2026 (`grapuu/firmony`, private, `main` pushed).
3. Cloudflare, D1: a database named `firmony`, location **EU jurisdiction**; its ID goes into `wrangler.jsonc`
   (the zeros there are a placeholder, so a deploy fails instead of creating a database outside the EU; the
   privacy notice says the database is in the EU).
4. Cloudflare, Workers & Pages, Create, Import a repository: `firmony`, production branch `main`. It is then live
   at its workers.dev address (which answers `noindex`). With the domain in the account: a route
   `{ "pattern": "firmony.ai", "custom_domain": true }` (and www) in `wrangler.jsonc`.
5. Email: Cloudflare Email Routing for firmony.ai: a rule `ahoj@firmony.ai` forwarded to his mailbox, and the
   catch-all rule "Send to a Worker", `firmony` (it takes `doklady-<code>@`, documents by email, and refuses any
   other address); Email Service, firmony.ai onboarded for sending. Until then requests are kept and their emails wait in the outbox (retried
   every fifteen minutes, ten times).
6. For the client's app: an R2 bucket `firmony-files` in the **EU jurisdiction** (before the first deploy that
   carries `r2_buckets`), and the secret `ANTHROPIC_API_KEY` on the Worker (an API key of an Anthropic account of
   europio; without it every photo goes to the accountant). Before the first client: the privacy notice names
   Anthropic (photos and PDFs of documents, read and not kept for training), R2 for the files, and what the app
   keeps and how long (documents ten years by the accounting act, s. 35), and the email that arrives at a
   company's address (sender and subject kept 90 days, the attachments as documents). Written on 13 October 2026
   (`PRIVACY_VERSION` 2026-10-13), with Enable Banking, the accountants and the AML records.
7. The first administrator (since 17 October 2026): while nobody of the team exists, `/app/prvy-spravca` shows the
   three settings with a random code made on the spot and kept nowhere: `TEAM_BOOTSTRAP_EMAIL` (his address, Text),
   `TEAM_BOOTSTRAP_TOKEN` (the code, **Secret**), `TEAM_BOOTSTRAP_EXPIRES_AT` (unix seconds, 48 hours on, Text). He
   adds them on the Worker (Settings, Variables and Secrets), signs in at /app/prihlasenie with that address, enters
   the same code under Zabezpečenie prístupu, registers a passkey and a second one on another device, then deletes the
   code's secret. The page answers 404 once anybody of the team exists. `"keep_vars": true` in `wrangler.jsonc` keeps
   settings added as Text through every deploy. Then he adds accountants on /ucto/tim; each signs in with her own
   email. Recovering an administrator who lost every passkey needs two other administrators (docs/security/access.md).
8. Before the page is public: at least one accountant agreed (his to-do list of 12 October: call 3 to 5 freelance
   accountants to confirm 28/55/110 € a client, 5 € a payroll and 90 € a closing), the trade licence "vedenie účtovníctva" added to europio, liability
   insurance, and a digital postman (Qvalia was the lead: ask for its per-client API price).
9. The bank by open banking, not before about 250 clients (his word of 12:26 on 14 October; until then the bank
   comes without it: "The bank without an aggregator"). Read on 13 October 2026 in Enable Banking's documentation,
   Control Panel and linked accounts: an account for europio in its Control Panel (enablebanking.com); an application for **Production**
   with the redirect URL `https://firmony.ai/app/banka/navrat` (and the workers.dev one while there is no domain),
   a description, a data protection email (`ahoj@firmony.ai`), the privacy policy URL
   (`https://firmony.ai/pravne-informacie#ochrana-udajov`) and the terms of service URL
   (`https://firmony.ai/podmienky`); "generate in the browser" saves the private key as `<application id>.pem`.
   A new production application is "Inactive"; "Activate by linking accounts" with europio's own account makes it
   active in restricted mode, in which only accounts linked to it can be read, until a contract is signed (then
   clients' accounts; the price is theirs to quote). On the Worker: the variable `ENABLE_BANKING_APP` (the id, the
   file's name without `.pem`) and the secret `ENABLE_BANKING_KEY` (the whole text of the file; PKCS#8 and PKCS#1
   both work, also pasted on one line). The privacy notice names Enable Banking Oy (Finland) as the service that
   reads the accounts with the client's consent (since 13 October 2026); the terms of service are at /podmienky.
   Their price (14 October 2026): 900 € a month in the first year with 1 800 accounts included, then 1 200 € and
   1 500 €; testing with our own accounts is free ("Where things stand", 12:15 on 14 October).
10. AML (Act No. 297/2008 Z. z.): approve and sign the program (his doc above; the client's declaration, the risk
   and the internal reports are in the app since the night of 13 October), register europio in the Financial
   Intelligence Unit's goAML, and have a lawyer confirm that a power of attorney signed with eID verifies the director's
   identity without a meeting. The trade "Vedenie účtovníctva" comes first (item 8).

## Product decisions

His (13 October 2026, 22:04, "ano" to the builder's price list after his "maržu musíme mať aspoň 60 percent,
inak to nejde" and "účtovníčka nebude robiť za 25 eur ... bežne berú 50 až 100 eur za akéhokoľvek klienta"):
- Plans per month without VAT, by documents a month: Štart 89 € (up to 20, not a VAT payer), Rast 169 € (up to 60,
  VAT payer), Firma 329 € (up to 150). A month with more documents is billed as the next plan; above 150 a price is
  agreed (an e-shop). Payroll 15 € a person a month on every plan. Annual closing and the corporate tax return:
  249 € a year. Every figure in `PLANS`, `PAYROLL_PRICE` and `CLOSING_PRICE`.
- The accountant (freelance, invoices us) is paid 28, 55 and 110 € a client a month, 5 € a person's payroll and
  90 € a closing (`ACCOUNTANT_PAY`): about a third of the price, for the check, the returns and the answers, the app
  doing the rest. In Slovakia nobody stamps or certifies an s. r. o.'s books (he had asked whether she would only
  "dávať pečiatku"). Every plan, payroll and the closing leave at least 60 % after her pay, the bank, the digital
  postman, the reading and a reserve of 2 % (`npm test` holds it: "every plan leaves at least 60 %"). Employing an
  accountant pays from 60 to 100 clients each (about 2 300 € a month with levies).
- The site says "Platíte podľa počtu dokladov" where it said "Bez poplatkov za doklad" and "Doklady navyše zadarmo".
- Until then (12 October 2026): 69, 129 and 249 € with 30, 80 and 200 documents and payroll for 0, 2 and 5 people
  inside, closing 149 €, accountants 25, 40 and 70 €; nobody employed, no profit shared with an accounting office.
- Ads in young media and his own content; the brand is to "embrace" stressed young founders: "chceme ich objať
  a prijať, pomôžeme im, postaráme sa im o všetko a s nami môžu rásť".
- Inspired by Pennylane, Dougs, inFakt, Bench and the Slovak CloudTalk. He asked to copy their designs and texts
  and translate them; that was not done (copyright, and a clone), and he was told so in one sentence. Their
  structure and arguments were taken: Dougs' clear prices and reassurance, inFakt's two ways in (founding or
  switching), Bench's "no judgment" about messy books, Pennylane's e-invoicing banner, CloudTalk's parallel of
  AI and human and its plain FAQ.

His (14 October 2026, 12:26): no aggregator for now ("pod tak, aby sme sa tomu vedeli vyhnut a boli aj tak elita
top smooth jednoduchy smart"). The bank comes by statements the bank emails, Fio's token and a statement added once a
month; Enable Banking stays built and is switched on at about 250 clients or on better terms. Proposed at 12:48 and
not decided: a product for investors under the same brand (prices above, under "Where things stand").

His (14 October 2026, 10:53 and 10:57): "do toho ale nevybudujeme si vsetko svoje?", then "do toho". Everything is
built by us, the books and the closing included; no certified program (Pohoda, Omega) stands behind them and no
export to one is planned. The order he was given: the books, every client's deadlines on one screen, the closing
and the corporate tax return by February, payroll by the end of January, then the digital postman and eKasa.

His (13 October 2026, 23:03): "nechcem žiadnu komunikáciu mailom nič také ... všetko v našom uzamknutom ekosystéme".
Read as, and he was told so before the work started: messages, documents, data, the contract and every notice live
only in the app; an email to a client or to the team is a doorbell with a link and nothing else (`src/bell.ts`).
What still carries words, because it cannot be otherwise: the sign-in link (the key to the door), an invitation to a
company or to the team (who invites, so it is not taken for phishing), an invoice a client sends to its own customer
(who has no account), and the two emails to somebody who is not a client yet (the confirmation of a request, the link
to the contract). The documents' own address (`doklady-<code>@`) takes email in: that is a way in, not communication.

The builder's proposals, shown on the site and his to change (in `PLANS`, `CLOSING_PRICE`, `REPLY_WITHIN`, copy):
- No lock-in: one month's notice. Answers within one working day.
- Prices "bez DPH" with the sentence that VAT is not added while the company is not a VAT payer (europio is
  registered under § 7a only; crossing 50 000 € turnover makes it a payer, about June 2027 in the plan).
- The founder's note on the home page is written in his name and has to be read by him.

## The key, as read on 13 October 2026 (his question at 16:24: what did the French and the Americans have, what is missing here)

He asked what system to build behind the site to be the fastest, cheapest, most efficient and easiest, and what
the key of the winners abroad is. He wants .io for the domain (CloudTalk has one), bought later, after a talk
about marketing. What was found (sources: Dealroom on Pennylane, Pennylane's PDP page, Digitiz and independant.io
on Dougs, Dougs' 2025 retrospective, Outsource Accelerator and ICAEW on Bench, The Next Web on Rillet, Reuters
on Crete, the sites of Matax, Bezúčto and Keepi, TASR on Digitoo, Enable Banking's Slovak page, podnikajte.sk):
- The winners sell "the client does nothing": documents and the bank flow in by themselves, software posts them,
  a person checks and answers. Dougs (an online firm, our model): 14 000 clients in 2023, "plus de 49 000" in
  2026, 49 to 159 € a month, bank sync, app, photographed receipts, real-time dashboard, unlimited questions,
  company formation free with accounting; criticised for hard-to-reach people on complex matters, changing
  contacts and errors found late. Pennylane (software for client and accountant): 4 500 firms, 350 000 SMEs,
  €75M at €2B in April 2025; its certified e-invoicing platform is free for its clients; Dougs was among the
  first nine certified platforms (December 2025).
- Bench (over $100M raised) shut down abruptly in December 2024: late bookkeeping, proprietary software, no
  export; customers locked out in tax season. Rillet ($1B, August 2026): AI agents keep the ledger, accountants
  review. Crete (Thrive, June 2025): $500M to buy accounting firms and give them AI.
- Slovakia has DIY software (Bezúčto 19,99 € a month for an s. r. o., Keepi, KROS, Pohoda), AI for offices
  (Digitoo, 2023: 70 % less time per invoice) and offices with photo and email delivery (Matax: 90, 160 and 400 €
  a month, closing from 200 €, no app or bank link on its site). Nobody joins a person who does it for you with a
  system where everything flows in. Firmony is 19 to 38 % cheaper than Matax.
- The Slovak edge from 1 January 2027: e-invoices arrive as data through a digital postman, the bank through open
  banking (Enable Banking lists SLSP, VÚB, Tatra, ČSOB, Poštová, 365.bank), and an eKasa receipt's QR code points
  to the receipt in the Financial Administration's database ("Over doklad"). Whether that may be used at scale is
  to be checked. (Checked on 14 October 2026: only by a verifier under § 18(11) of Act No. 384/2025 Z. z., on
  conditions FR SR has not published yet; see "eKasa receipts".)
- Proposed, not yet decided by him: phase 1 by 1 January 2027 is the pipe (a client app: photo, email forwarding,
  eKasa QR, e-invoices and bank by themselves, "missing document" per payment, VAT due and when, messages with the
  accountant) and an accountant's cockpit (AI proposes MD/D, VAT and the control statement line; she confirms;
  bank matched; VAT return and control statement as XML; every client's deadlines on one screen). The ledger and
  the closing stay in a certified program (Pohoda or Omega) until there are hundreds of clients. First piece
  offered: intake (email, photo, eKasa QR) with AI posting proposals, tried on europio's documents. (Superseded on
  14 October 2026 at 10:53: his word is to build everything ourselves, the ledger and the closing included; see
  "The books".)
- For marketing later: since 17 August 2026 an s. r. o. is founded only through a notary or an advocate, and
  over 24 000 companies were founded by mid-September 2026 (95 % s. r. o.); Dougs wins clients at founding.

## The pricing with every cost (13 October 2026, 21:45; superseded at 22:04 by the price list under Product decisions, kept for the reasoning)

Per client and month, from the prices and the accountants' pay he set; what is not known yet is an assumption, to
be replaced by the quotes: Enable Banking 2 € an account, the digital postman 2 €, servers and email 0,20 €,
reading by Claude under 1 cent a document (Haiku 5.5 at $0.10 and $0.50 a million tokens, three tries), a reserve
for our own errors of 2 % of the price, nothing for collecting (our own invoice paid by transfer and paired by the
bank link; Stripe would take 0,83 to 2,09 € by SEPA and 1,77 to 5,73 € by card). What is left: Štart 38,37 €
(56 %), Rast 82,09 € (64 %), Firma 167,50 € (67 %); with the closing (149 €, 100 € of it the accountant's) 42,46,
86,18 and 171,59 €. A client won costs 250 € and about 40 € of an accountant's time for the opening balances, so
Štart pays back in 6,8 months, Rast in 3,4 and Firma in 1,7. A mix of 50/40/10 % is 111 € a client and 72,86 €
left (66 %); a million of revenue a year is about 750 clients. Proposed to him: keep the prices; take payroll out
of the plans as 15 € a person a month (10 € to the accountant), since at 10 € a head paid on top Rast leaves
62 € and Firma 120 €; say in the contract that 23 % VAT is added once europio is a VAT payer (Štart's 69 € becomes
84,87 € for a client who is not one); invoice monthly by transfer. The real risks are the accountants' pay (to be
confirmed in his calls) and the cost of winning a client, not the software.

## The economics (the evening of 12 October 2026, scratch model; base case)

ARPU 105 €, variable cost 41,83 € (accountant 34, tech 6, payment fee 1,83), contribution 63,17 € (60 %).
CAC 250 €, churn 1,5 % a month, LTV over 36 months 1 767 €, payback 4 months. Deepest cash point about −8 600 €
(February 2027); first profitable month March 2027. Kill rule at the end of April 2027: CAC above 400 €, churn
above 2,5 % or accountant cost above 40 € a client.

## The law it leans on (read 12 October 2026)

- From 1 January 2027 every legal person and every taxable entrepreneur must be able to receive e-invoices through
  a certified delivery provider ("digitálny poštár"); VAT payers must also issue them for domestic supplies.
  § 85o of the VAT Act, inserted by Act No. 385/2025 Z. z. (pravnenoviny.sk, 25 August 2026; podnikajte.sk).
- Bookkeeping is a free trade (voľná živnosť); tax returns may be prepared without giving tax advice.
- The Register of Legal Entities (api.statistics.sk/rpo/v1/search?identifier=) is public under CC BY 4.0: the
  page that shows its data names the source.

## How it is built

- One Cloudflare Worker: Hono with hono/jsx, pages rendered on the server, **no script at all** (CSP
  `script-src 'none'`), no inline styles. D1 (`DB`) for requests, the outbox and the counters; Cloudflare's email
  binding (`EMAIL`). Static files in `public/` (stylesheet, fonts).
- `src/config.ts` holds every fact: brand, company, plans, limits, retention, pictures (`ART`, empty until he
  makes them). `src/copy.ts` holds every text, typeset once (`src/format.ts`: a one-letter word never ends a
  line, a number stays with its unit, "s. r. o.", "§ 7a", dates).
- Pages: `/` (the opening with the card on the IČO, one month, four figures, the hug, everything in one price,
  AI and the accountant, the e-invoice date, prices, the comparison, two ways in, who is behind it, questions,
  the closing form),
  `/zacat` (the IČO, then the details; `?balik=`, `?nova=1`), `/zacat/hotovo`, `/investori` and `/investori/hotovo`
  (the investors' sign-up, "Firmony for investors" below), `/pravne-informacie` (company, privacy, cookies), robots,
  sitemap, `/healthz`.
- The comparison is a GET form (`mesacne`, `za-doklad`, `doklady`, `zavierka`, `dph`, `ludia`) computed on the
  server in cents (`src/calc.ts`); before anything is typed it shows a worked example (60 € a month, 25
  documents at 5,20 €, closing 160 €: 2 440 € against 977 €).
- The request: the IČO is looked up in the register (`src/rpo.ts`, four seconds at most, 30 lookups an hour per
  connection); on sending, the register is asked again and its name is what is kept and mailed, never a name the
  form carried. A confirmation repeats nothing a stranger could type (spam through our form), at most two a day
  per address. Six requests an hour per connection (an IPv6 address counts by its /64). A hidden field catches
  bots. Campaign tags (utm_*, ref) travel with the forms and are kept with the request.
- The schedule (every 15 minutes) sends the outbox and deletes what the privacy notice promises: requests after
  365 days (an investor's sign-up 365 days after its last), sent email after 90, counters after 2 days.
- Headers: CSP without anything inline or foreign, no framing, HSTS, `noindex` on `/zacat` and on any host but
  firmony.ai; http and www are redirected; a form is accepted only from our own pages and under 8 kB.

## The client's app (`src/app/`, views in `src/views/inside.tsx` and `inside-pages.tsx`; 13 October 2026)

The model is Dougs' and Pennylane's: every payment on the company's account needs a document, and the client's only
task is to add one where it is missing. Everything else (reading it, pairing it with its payment, the deadlines,
filing) is ours. One amber thing in sight on every page: what is missing; when nothing is, the overview says
"Všetko máme. Nemusíte nič robiť." in the panel of light of the site.

- Signing in (`session.ts`): an email, a link valid for 20 minutes and once (`login_links`, a hash), then a
  cookie `__Host-firmony` for 30 days (`sessions`, a hash; HttpOnly, Secure, SameSite Lax). The link opens a page
  with one button (POST), so a mail scanner that opens links cannot use it up. The form answers the same for an
  address we do not know. Accounts are made by us (`users`, `members`, `companies`); there is no sign-up.
- Pages: `/app` (overview: what is missing, up to six payments; the month in figures; deadlines; adding
  documents and the address for forwarding; the accountant), `/app/platby` (filters `hotove`, `vsetky`), a payment
  (`/app/platby/:id`: send a document, confirm the one offered, pick one we have, or "no document needed" with a
  reason; a question about it), `/app/doklady` (filter `bez-platby`), a document (what was read, its payment, "paid
  from my own money", delete), `/app/spravy`. Desktop: a column on the left; phone: a bar on top and five tabs,
  the middle one "+" for a document. Every page works without its script (`public/inside.js`: a file goes off as
  soon as it is picked, a photo is made a JPEG of at most 2400 px first, files can be dropped on the card, a
  document being read is looked at again, the address is copied).
- Every query names the company of the session (`store.ts`). Whether a payment needs a document is never stored:
  `exempt` and `links` decide it. A document belongs to one payment (`links.document_id` is the key); a payment may
  have several documents.
- Pairing (`match.ts`, the rule at its top): the same amount to the cent, the right direction (an issued invoice
  is paid in), dates that fit (a receipt: a day before to five after; an invoice: fifteen days before it was
  issued to sixty after it was due); a score of amount 50, symbol 40, account 30, name 20, three days 10. Paired
  without asking only at 70 or more and when neither has another candidate; from 50 offered to the client.
- No document needed by itself (`autoExempt`): a payment between the company's own accounts, to the State
  Treasury (bank code 8180: taxes, social insurance, fees), and the bank's fee or interest (no account, words of a
  fee). The client can pick: bank, own accounts, payroll, the state, money put in or lent, something else (with a
  few words). The accountant is meant to check them (her side is not built).
- Reading (`read.ts`, `xml.ts`): a file is what its first bytes say (JPEG, PNG, WebP, HEIC, PDF, XML), never its
  name; the same file twice is kept once (`file_hash`), and on a payment's page the one we have is given to it. A
  photo or a PDF goes to Claude (`READER` in config: claude-haiku-5-5, a tool with Slovak fields, every field
  checked; 5 MB for a picture, 25 MB for a PDF); HEIC, a file too large, no key or no answer: "Prečíta ho
  účtovníčka". An e-invoice (UBL 2.1, Peppol) and the bank's statement (camt.053; VS, SS and KS wherever banks put
  them; a batch split; the closing balance kept) are read by our code. XML that declares entities is refused. The
  schedule reads again what was cut off, three times.
- Files are in R2 (`FILES`, `companies/<id>/documents/<doc>.<ext>`) and handed out only to their company
  (`/app/subory/:id`: a picture or text in a sandbox, XML as text, a PDF with its viewer).
- Messages go to us by email (`ahoj@firmony.ai`, "Správa od klienta"), with the payment they are about.
- The sample company (`demo.ts`, "Ukážková firma s. r. o.", Martin Novák, dated from today) exists only at
  `/app/ukazka` on a developer's machine with `DEMO=1`, which only the playground sets; the runtime test holds that
  it is 404 on the Worker.
- Not built yet: the digital postman, eKasa receipts as data from the Financial Administration (their codes are read
  since 14 October: "eKasa receipts" below), deleting files at the end of their ten years, thumbnails. Not seen in a real
  browser: a PDF opened by "Otvoriť originál" under its CSP; a photo from an iPhone made smaller by the script
  (HEIC).

### What the client's app got on the evening of 13 October 2026 (step 2)

- Documents by email (`src/app/inbox.ts`, the Worker's `email` handler): mail to `doklady-<code>@` the domain of
  `BRAND.email` is parsed (postal-mime 2.7.6); each attachment is what its bytes say (a photo, a PDF, an
  e-invoice), a picture inside the text or smaller than `APP.mailImageMin` (a logo) is skipped, the same file twice
  is one document, and they are read and paired like an upload (`src/app/intake.ts`, shared with the pages). An
  email without a document leaves the client a short note in the messages, five a day at most. An unknown address,
  a code on another domain and a message over 25 MB are refused; at most 100 files a day by email. `inbound_mail`
  keeps sender, subject and the outcome for 90 days. Tested through Miniflare's `/cdn-cgi/local/email`.
- Reminders (`src/app/remind.ts`, from the schedule with its `scheduledTime`): Monday 9:00 in Bratislava to a
  company with payments without a document, and the 5th at 9:00 for the past month's documents (due on the
  10th); never for the sample companies, only to people with `users.reminders`, once (the outbox key).
- The overview of a new company shows "Začíname" (statement, first photo, forwarding, a partner, the phone) until
  the first three are done.
- Firma a nastavenia (/app/firma, `src/views/settings.tsx`): the company's data as we keep them, the address for
  documents with how to forward automatically, its people (an owner invites a partner or a colleague with a link
  valid 7 days, and removes a member), reminders on or off, the app on the home screen, the other companies,
  signing out. On a phone the bar's menu has it, the switch and signing out.
- The app can be added to a phone's home screen (`public/manifest.webmanifest`, `icon-512.png`).
- Payments and documents have a search (party, note, symbol, amount; "12,40" finds the amount); a search looks
  through everything, whatever tab was open.
- A message of another person of the company carries that person's name, not "Vy".

### Everything in the app (13 October 2026, from 23:03; `src/bell.ts`, `src/app/aml.ts`, `src/views/declaration.tsx`, `src/views/contract.tsx`)

- Doorbells (`src/bell.ts`): `bell.*` makes the subject and the body ("Dobrý deň," a lead, the link, "Na tento e-mail
  neodpovedajte, všetko vybavíte v aplikácii Firmony."), and `ringStatement(db, kind, about, to, bell)` queues it
  once (outbox key `bell:<kind>:<about>:<email>`). No bell takes a message, an amount, a name or a company: the unit
  check calls every one with links only. A new message rings the other side only when nothing of that side was
  unread before it (`seen_at`): five messages before anybody looked are one email; the client's side rings every
  member, the team's side the company's accountant (else `ahoj@`). Reminders (weekly, monthly) ring a person once,
  whatever number of her companies miss documents. Rung: the answer, a returned "no document needed", the
  reminder of missing documents, the bank's renewal, the contract (with the sign-in link), the welcome; for the
  team a client's message, a power of attorney, a declaration, a notice, a new contract, a request from the site,
  an internal report (every administrator).
- Kto stojí za firmou (/app/vyhlasenie; `src/app/aml.ts`): the owner gives the director's name, birth number (else
  the date of birth), permanent address, nationality, the identity document and its number, whether a politically
  exposed person; who the beneficial owners are (only me, me and others, others; up to three others with their
  share or control); what the company does, where its money comes from, the turnover expected, cash over 10 000 €
  at once, partners outside the EU and where; and ticks that it is true and that changes are reported here. A
  birth number is checked (nine digits before 1954, else divisible by 11 or the old rule with 0; a day that exists).
  Every send is a new row of `declarations` (none is changed or removed: five years, s. 19); the page shows the
  newest with birth numbers cut to their last four digits and the document number to its last three; "Zmeniť
  údaje" opens the form from it. A member who is no owner is told only where it stands (403 on a POST). The
  owners' blocks show only when somebody else owns the company, a second and third owner only once the one before
  has a name, the countries only when there are partners outside the EU (`:has()`, all shown without it).
- The first steps are four that matter: the declaration, the power of attorney, the bank (or a statement), the first
  document (`first__bar--0..4`).
- The contract (/app/zmluva): the main points (company, plan and its price that day from `orders`, payroll, the
  closing, the start, when and by whom it was concluded, the notice period, the end once notice was given) and the
  terms in full, numbered (`bod-<a>-<p>`), with "Uložiť ako PDF alebo vytlačiť". Firma a nastavenia links it.
- The notice (Firma a nastavenia, #zmluva; folded away): the owner ticks and gives it (`companies.notice_at`,
  `notice_by`, `ends_on` = the last day of the month after the notice, `noticeEndsOn`; once); it stands in the
  messages as the client's ("Vypovedám zmluvu ..."), the team is rung, the list and the client page say "Končí ...".
  Until that day the owner can take it back (point 10.2 of the terms: we agree to that in advance), which is in the
  messages too. What happens at the end is "The end of a contract" below.
- The terms (`TERMS_VERSION` stays 2026-10-13: nobody has accepted them): 1.3 the contract and its terms are in the
  app, 3.1 documents in the app or by forwarding to the company's address, 4.5, 4.6, 8.5 and 11.2 notices in the
  app, 9.2 the director fills in the declaration in the app and reports its changes there, 10.2 notice in the app
  and taking it back, 11.1 we communicate by messages in the app, a doorbell carries no content, and a message
  counts as delivered the next working day. The privacy notice says what the declaration keeps, who sees it and that
  email only rings. The site's FAQ has "Ako spolu budeme komunikovať?", and "Musím sa viazať?" says that notice is
  given in the app.
- Not built: notices the team gives in the app (a price change, a change of the terms: by a message today), an
  acknowledgement of training of the accountants, a periodic check that a declaration is up to date.

### The end of a contract (14 October 2026; `src/app/ending.ts`, `src/app/export.ts`, `src/zip.ts`, `src/app/purge.ts`)

What Bench did not do (its customers were locked out when it shut, December 2024) and what point 10.4 of the terms
promises: the client takes everything along, the books are handed over in the app, and nothing of the company stays
with us longer than the law wants. Every figure is in `ENDING` (`src/config.ts`).

- The last day: the client's notice in Firma a nastavenia (the end of the month after it, as before), or ours. The
  administrator's form on the team's client page ("Ukončiť zmluvu z našej strany", folded under "Zmluva a plná moc"):
  a day, today or later, the earliest of a notice under 10.2 named (an earlier one is for 10.3 or an agreement),
  and a reason that stays in the event `contract.ended` and never reaches the client. The client gets a message in
  the app that says the day and what follows (and a doorbell); the administrator can take it back while it runs
  (`contract.ended.cancelled`, a message). `companies.notice_side` says whose end it is ('client' or 'firmony'):
  the client takes back only its own notice and cannot give one over ours. An accountant cannot end a contract.
- After it (`endingOf`, phases): until the last day "ending" (a line above every page: "Zmluva skončí ...", and in
  Firma a nastavenia the four days: the last day, documents until, the handover by, the download until); from the
  next day no invoice is issued (a draft can be thrown away), no bank is linked and no renewal of a consent asked
  for; for ten more days ("closing", `ENDING.intakeDays`) the last month's documents and statements still come in,
  by the app, by email and from the bank; then ("ended") nothing more is taken: the upload, the "+" on a phone and
  the statement form are gone, the address for documents answers the sender that the contract ended, the bank is
  read no more, no reminder goes out (the monthly one only for the last month), and the overview says "Spolupráca
  skončila. Ďakujeme, že ste boli s nami." with the download. The line above every page turns red then.
- The download (Firma a nastavenia, "Stiahnuť doklady a údaje", `#stiahnut`, there always, not only at the end): a
  ZIP a year (`/app/export?rok=`, any member, ten an hour, `export.downloaded` in the events), streamed and stored
  without compression (`src/zip.ts`, names in plain ASCII, CRC-32 checked by the tests against Node's zlib):
  `citajte.txt`; `doklady/` the originals as they came, named by day, partner and number; `doklady.csv` (what was
  read, the category, the account, booked, the payment, the file's name in the archive); `platby.csv` (whether a
  document is there, or why none is needed); `faktury/<number>.xml` the issued invoices as e-invoices and
  `faktury.csv`; `spravy.txt`; `zmluva.txt` with the terms. The CSVs are for Slovak Excel (BOM, ';', "12,40").
  Past 65 000 files or 4 GB the rest is named in `CHYBAJUCE-SUBORY.txt` (no ZIP64).
- The handover (the team's client page, "Odovzdanie účtovníctva", shown once there is a last day): the accountant
  uploads up to ten files at a time (`company_files` kind 'handover'; PDF, pictures, any ZIP such as an export of
  Pohoda or an .xlsx, XML, CSV or text, an old .xls; anything with NUL bytes that is no such file is refused,
  `sniffHandover`); the client gets a message naming them and finds them under the download (`/app/odovzdanie/:id`,
  always downloaded, never shown). The list of clients says "Odovzdať do ..." until something is handed over, red
  ("Odovzdanie mešká") past the thirty days. A file uploaded by mistake can be removed.
- The deletion (`purgeEnded` from the schedule, three companies a run): ninety days past the last day the files go
  (everything under the company's prefix in R2 but the power of attorney's) and then, in one batch, the documents,
  links, payments, accounts, the bank's consents (closed at Enable Banking first), invoices and their lines,
  messages, the email that came in, the suppliers' rules, the handover, the sessions and members, and the accounts
  of the company's people who belong to no other company and no team; the company row keeps its name, register
  data and contract and gets `purged_at` and `closed_at` (event `company.purged`). A person who belongs to no
  company and no team (an owner removed them) is forgotten at every run (`forgetLonely`). Five years past the last
  day (`recordsFloor`) the rest goes: the power of attorney, the declarations, the risk, the reports, the order, the
  events and the company row. The administrator finds ended companies at the foot of /ucto ("Skončení klienti") and
  opens their Identifikácia a riziko for those five years; nobody opens their page of work; an accountant sees none.
- The terms (8.8 and 10.4) and the privacy notice say all of it (`TERMS_VERSION` stays 2026-10-13: nobody has
  accepted them). The site's FAQ "Musím sa viazať?" says that the books are handed over in the app and that
  everything can be downloaded there for 90 days after the end.
- In the playground: `/playground/koniec?dni=20` puts the sample company twenty days past its last day (the team's
  form takes no day in the past), `&zrusit=1` takes it back; the app's preview has "Koniec zmluvy" in its bar.
- Checked: 24 rules taken out once (`scripts/dev/mutate.mjs`), 24 held. Not checked by a test: the bank read stopping (no
  consent is active at that point of the runtime test), reminders after the end, the closing of the consent at the
  bank during the deletion. Not built: a credit note or a closing for the year the contract ended (by agreement,
  by hand), ending many contracts at once.

### Invoices the client issues (step 3, 13 October 2026; `src/app/invoices.ts`, `src/views/invoices.tsx`)

What SuperFaktúra, Fakturoid and Pennylane give, made for this pipe: an invoice issued here is a document of the
company at once, so the payment that pays it pairs with it by its variable symbol and the invoice says "Zaplatená"
by itself.

- Faktúry (/app/faktury, in the column; on a phone in the bar's menu): what waits to be paid, what is overdue,
  what was paid this month, and every invoice with its state (Koncept, Nezaplatená, Po splatnosti, Zaplatená).
- The form (/app/faktury/nova): the customer by IČO from the register ("Doplniť z registra"), or one of the
  customers of earlier invoices (up to six, each once: `?odberatel=<id>`); days typed the Slovak way; lines with
  quantity, unit, price and, for a VAT payer, 23, 19, 5 or 0 %; the account (the company's own, else its first
  bank account); a note. "Uložiť koncept" keeps a draft without a number; "Vystaviť faktúru" gives the next
  number. An IBAN is checked by its check digits (mod 97).
- The number: the year and its order in the company's year, `20260001`, which is also the variable symbol;
  counted in the same statement that writes the invoice (`saveInvoiceStatements`: one `MAX(seq) + 1` for the
  number and the order), and `UNIQUE (company_id, number)` refuses a second one. An issued invoice is never
  changed or deleted (an error is put right by a credit note, which the accountant writes for now); a draft is.
  VAT is counted per rate from the sum of the lines (`totalsOf`), as the VAT Act counts it.
- An invoice's page is the invoice as paper (`InvoiceSheet`, the same for the client, the customer, print and the
  accountant's booking screen): with the QR code every Slovak bank's app reads (PAY by square 1.2, written by the
  library `bysquare` 4.0.2, drawn as one SVG path by `uqr` 0.1.3; `src/app/paybysquare.ts`): the account, the
  amount, the variable symbol, the due day and the beneficiary's name, so the money arrives with the number that
  pairs it. Not on a paid invoice. Beside it: send to the customer (an email with the link and the account; a
  reply goes to the person who sent it; without the customer's email, one typed there, which is kept), remind an
  overdue one (never a paid one), print or save as PDF, the e-invoice, "Vystaviť podobnú" (`?podla=<id>`: the
  customer and the lines, today's days), the payment, and the customer's link.
- The customer's page (/f/<token>, no sign-in, `noindex`, a draft's token opens nothing): the invoice, the QR
  code, the e-invoice to download, how to save a PDF; "Faktúra je zaplatená. Ďakujeme." once it is.
- The e-invoice (`ublOf`): UBL 2.1, Peppol BIS Billing 3.0 (EN 16931), each side addressed by its DIČ under EAS
  0245; S for a rate above nought, E with its reason for 0 % (Slovakia has no zero rate at home), O for a seller
  who is no VAT payer, without a rate or either side's VAT identifier (BR-O-02); a discount keeps its price
  positive and its quantity negative (BR-27). Read back by our own reader as issued by us, and by the customer's
  as received, with its sums (unit checks).
- Credit notes (built 18 October 2026, schema step 37: `invoices.kind`, `invoices.corrects`, `invoices.reason`): an
  issued invoice's page offers "Vystaviť dobropis" (`/app/faktury/nova?dobropis=<id>`): the invoice's customer (taken
  from it whatever is posted) and lines to start from, typed as what the invoice is lowered by and kept with the minus
  (`creditLines`), a reason asked, no more at any rate than the invoice has left after its credit notes
  (`creditLeft`, `creditTooMuch`); numbered in the invoices' row; its document is `invoice_out` with minus amounts
  and `documents.corrects` the invoice's number (the control statement's C.1); its sheet says "Dobropis", the invoice
  it corrects and the reason, "Spolu na vrátenie", no QR code or way to pay; it is mailed as a credit note, never
  reminded; the invoice lists its credit notes and the list's sum to collect is lowered by them. A credit note's VAT
  is rounded on the amount and given its minus, so it mirrors the invoice's (`totalsOf`). test/credit-notes.runtime.mjs.
- The e-invoice checked as the digital postmen check it (18 October 2026): `npm run test:peppol` (`test/peppol.mjs`,
  also on GitHub) validates every kind Firmony writes (VAT payer at three rates with a discount, exempt, no VAT payer,
  no account, a customer abroad, a credit note) against the UBL 2.1 schema (`test/xsd/ubl21`) and the CEN and
  Peppol BIS 3.0.20 rules (`test/peppol/`, provenance in its README; SaxonJS compiles them once into .wrangler/tmp).
  What it found and was mended: an invoice without an account named a credit transfer without one (BR-61: now
  means 1), a customer abroad had no electronic address (PEPPOL-EN16931-R010: now its VAT number under Peppol's
  scheme of its state) and every party was in Slovakia (now the state of its VAT number, EL as GR); the address goes
  in its parts (street, town, postal code; `src/app/address.ts`). The Financial Administration's Slovak transposition
  ("Transpozície štandardu Peppol BIS v podmienkach Slovenskej legislatívy", v1.12 of 14 October 2026, an XLSX on
  financnasprava.sk's eFaktúra page) was read through the browser pane on 18 October 2026: what it asks beyond Peppol is
  now written: the IČO of either side when it has one (BT-30, BT-47) with its scheme, ISO 6523 ICD 0158; the seller's
  legal form and register entry (BT-33, § 3a of the Commercial Code, `CompanyLegalForm` from `registerLine`); the day of
  supply when it differs from the day of issue (BT-7 `TaxPointDate`, § 74(1)(d); BT-8 never). Its other "required"
  terms are Peppol's own or required only within their group (the account within a credit transfer). The digital
  postman reports each invoice to the tax authority as a Tax Data Document (docs.peppol.eu/tdd/sk, version 1.0.0,
  14 April 2026), made by the postman from the invoice. The Peppol test has a case for these terms (24 checks). Mended
  after the review: a credit note's day of supply comes right after its day of issue (the CreditNote schema's order; a
  credit note takes its invoice's day of supply, so every such file failed UBL), and a seller whose legal form is not
  known (a client added by hand as "Iná") writes its register entry alone, no s. r. o. guessed.
- How an invoice is taxed (built 18 October 2026, schema step 38: `invoices.vat_mode`, `documents.vat_hint`): a
  VAT payer chooses "Zdanenie": Slovak VAT (the rates), goods to a VAT payer of another member state (§ 43), a service
  whose customer in another member state pays the VAT (§ 15(1)), an export (§ 47), a supply outside Slovakia. Without
  Slovak VAT the lines have no rate whatever their select says; goods or a service to another member state ask for the
  customer's VAT number there; the sheet prints what § 74(1) asks ("Dodanie je oslobodené od dane podľa § 43 ...",
  "Prenesenie daňovej povinnosti", § 47, not subject in Slovakia; podnikajte.sk's list of § 74, updated 26 January
  2026); the e-invoice is K, AE, G or O with its VATEX code (K names the state the goods went to, O carries no rate
  or VAT number); the document carries the mode as `vat_hint`, which `proposeVat` follows until the accountant
  confirms (so r14, r15 and the recapitulative statement read it); goods go to `sales_goods` (Intrastat reads them);
  a credit note is taxed as its invoice. A domestic exempt supply now says "Dodanie je oslobodené od dane". A customer
  abroad is addressed on Peppol by its VAT number, also beyond the Union where Peppol has its scheme (CH, GB, RS...).
- Domestic reverse charge issued (built 18 October 2026, schema step 39: `invoices.vat_reverse`,
  `documents.vat_reverse`, `ReverseGoods` in vat.ts): an invoice's "Zdanenie" offers "Prenesenie daňovej povinnosti
  (§ 69 ods. 12)" with the kind (j construction, g metals, f crops, h phones and i circuits from 5 000 €, other: a
  to e) and for f and g the four digits of the customs tariff; only to a Slovak payer; no VAT; "Prenesenie daňovej
  povinnosti" on the sheet; AE in the e-invoice; the quantity of goods from the lines when they share kg, t, m or ks
  (units t and m added). The VAT engine reports an issued `reverse` in the control statement's A.2 alone (Odb, F,
  Den, Z, TK for f and g, TD MT or IO, Mn and MJ for f to i; none for a to e, which the customer alone reports; no row
  of the return, read in KVDPH's instructions of 2021 and a podnikajte.sk article), and blocks what A.2 cannot take
  (no Slovak VAT number, no kind, goods without code or quantity, phones or circuits under 5 000 €). A corrective invoice
  of one (since 18 October 2026) goes into C.1 with the base's difference and no VAT or rate (DR and S left out), for
  goods with TK, TD, Mn and MJ as A.2 has them, the quantity a difference too (a minus when the base goes down), as the
  control statement's instructions say (read in Stormware's copy of the poučenie: "rozdiel sumy dane" and "sadzba" not
  filled for corrections of A.2, "rozdiel množstva tovaru so znamienkom mínus"); a warning asks the accountant to look
  at the quantity, which the lines give whole (a credit note for a price alone changes no quantity). The accountant's booking form has the same fields for any issued document (dph_ptp_*).
  A Slovak customer without a DIČ is addressed on Peppol by the digits of its IČ DPH.
- Advances (built 18 October 2026, schema step 40: `invoices.vs`, `relates`, `payment_id`, `invoice_lines.vat_cents`,
  `documents.advance_cents`, unique indexes `invoices_payment` and `invoices_final`): "Nová zálohová faktúra" on
  /app/faktury makes a request for an advance (kind 'proforma'): numbered `ZF<year><0001>` in a row of its own, paid
  with its own variable symbol `9<year><00001>` (9202600001: an invoice's symbol begins with its year, so the two never
  meet), no document of the company and no e-invoice (404, also at the
  customer's link), "nie je daňovým dokladom" on the sheet, a QR code, mailed and reminded with that symbol. A VAT
  payer makes one only for a supply with Slovak VAT (`proformaMode`): a payment before a supply abroad is no tax point,
  and its documents are not built. Money on the request's symbol gets its document by itself at the next pairing
  (`autoAdvances` in `src/app/advance-auto.ts`, called first by `matchCompany`: linked 'auto', and mailed to the
  customer when the request was mailed); one that waits (a payment the client gave another document is skipped)
  shows on the request's page with "treba vystaviť do" (15 days, § 73) and "Vystaviť daňový doklad k prijatej platbe"
  (`POST /app/faktury/:id/zaloha`, the same `issueAdvances`): one document a payment
  (kind 'advance', numbered in the invoices' row, the payment's day as the day received, linked to the payment; a
  second click or two at once make none, `invoices_payment`), the payment split by the request's rates as each asks
  with its VAT, each part's base the part divided by one and the rate and its VAT what is left (`advanceLines`, kept
  as the line's own `vat_cents`; POHODA's worked examples of § 19(4): 1 000 € at 20 % is 833,33 € and 166,67 €), so the
  document makes exactly the payment; its document is category 'advance' (324, revenue side), its e-invoice a
  prepayment invoice 386 with `PrepaidAmount` and nothing payable, and our reader takes a received 386 at its total
  with VAT. A company that is no VAT payer gets "Doklad o prijatej platbe" without VAT. "Vystaviť vyúčtovaciu
  faktúru" (`?vyuctovanie=<request>`) starts from the request; issued, it deducts every advance's document rate by
  rate as minus lines with their base and VAT (`deductionLines`), so its VAT is the whole supply's less the advances'
  and the advances and it make exactly the supply's total; one final invoice a request (`invoices_final`, `finalDone`),
  after it the request leads to it and makes no advance. Its document keeps the advances' base (`advance_cents`),
  which the books move from 324 to the revenue (`documentLines`), so 324 is left with nothing and the revenue is the
  whole supply. A final invoice takes credit notes up to its whole supply (`creditLeft` leaves the deductions out).
  test/advances.runtime.mjs, units "Advances", Peppol cases 386 and the final invoice.
- Invoices in another currency (built 18 October 2026, schema step 41: `invoices.currency`, `fx_rate`, `fx_day`): the
  form's "Úhrada" has "Mena" (the euro and the ECB's currencies, `INVOICE_CURRENCIES`; no lev since Bulgaria's euro)
  and "Kurz za 1 €" (empty: the ECB's rate of the day before the supply, § 26 of the VAT Act, `rateFor(..., 'before')`;
  typed: kept as typed without a day; none known and none typed: the invoice asks for one, `rateUnknown`). Amounts are
  in the currency; the sheet prints them with the code ("1 528,50 USD", `formatMoney`), the rate and its day, and the
  VAT in euros rate by rate and in all (`eurVat`: each rate's VAT converted to the cent, as vat.ts converts a
  document's lines; art. 230 of the Directive: the VAT to pay in the national currency); no QR code (Slovak banks pay
  one in euros). The e-invoice is in the currency with `TaxCurrencyCode` EUR and a second TaxTotal in euros (BT-6,
  BT-111, BR-53; Peppol cases in dollars and an export in dollars, and BR-53 seen failing without it). The document
  takes the currency and the rate (`documents.fx_rate`), so the books and the VAT return convert it as any document in
  another currency (the books' difference to 563 or 663 when it is paid). A credit note keeps its invoice's currency
  and rate (§ 25), a similar invoice its currency; a request for an advance and a final invoice are in euros only
  (`currencyAdvance`). The list sums in euros at each invoice's rate; the yearly `faktury.csv` has the currency and
  the rate. Pairing compares amounts in one currency (crowns are never taken for euros); a payment in euros pairs with
  an invoice in another currency by its number and euros within 5 % of the invoice's at its rate (`FX_SLACK` in
  match.ts). test/invoice-currency.runtime.mjs, units "Invoices in another currency".
- Invoices issued again by themselves (built 18 October 2026, schema step 42: `invoice_repeats`, `invoices.repeat_id`,
  `src/app/repeat.ts`): an issued invoice (not a credit note, a request, an advance or a final invoice) has
  "Opakovanie" on its page: every month, quarter or year (`REPEAT_EVERY`), the next day (today or later; offered a
  month after the invoice's day), the last day (optional), mailed to the customer or not. The schedule
  (`repeatScheduled` in routes.tsx, every quarter of an hour) issues a repeat whose day has come in Bratislava, dated
  today: the same customer, lines, taxation, account and note, in its currency at the ECB's rate of the day before
  (none yet: it waits and says so), due as many days after it as the invoice was, numbered in the invoices' row, paired
  with a payment that came already, mailed as "Poslať odberateľovi" mails it (the reply to who started the repeat),
  then moves on to its next day after today, kept to its day of the month (`anchoredDay`: from the 31st the last day of
  a shorter month; a schedule that did not run issues one invoice, not every missed one). One repeat that runs an
  invoice (`invoice_repeats_template`), one invoice a repeat a day (`invoices_repeat`): a second run issues nothing
  twice. It ends past its last day or the contract's; a locked period or a failure is said on the repeat. The list
  shows the repeats ("Opakované faktúry"), the invoice it issued says "Vystavená sama z opakovania", "Zastaviť
  opakovanie" stops it; purge deletes them. test/repeat.runtime.mjs, units "Invoices issued again".
- The company's own invoice numbers (built 18 October 2026, schema step 46: `companies.invoice_prefix`, `invoice_sep`,
  `invoice_digits`, `invoice_from_year`, `invoice_from`): "Číslovanie" on /app/faktury (`/app/faktury/cislovanie`,
  owners change it) sets a prefix (letters, digits, hyphen, up to 8), a mark between the year and the order (none, -,
  /), the order's digits (3 to 6) and the next order of this year, so a company that comes in the middle of a year goes
  on with its row (an order lower than one issued is not used). The number is made in the statement that writes the
  invoice (`saveInvoiceStatements`: FA2026-0143), invoices, credit notes and advances' documents in one row, requests
  for advances in their own (ZF...). The variable symbol stays the year and the order (`invoices.vs`, 20260143; the
  number for invoices issued before), on the sheet, in PAY by square, the e-invoice's PaymentID, the mails, the
  document (`documents.vs`) and so in pairing; europio's reminders name it too. A request's symbol begins with 9, so
  no order of any size meets it (until the review it was the year, 9 and the order, which order 90 001 of an invoice
  met). test/numbering.runtime.mjs.
- Reminders and late interest (built 18 October 2026, schema step 51: `companies.dunning`, `invoices.reminders`,
  `invoices.interest_of`; `src/app/dunning.ts`). Read that day: nariadenie vlády č. 21/2013 Z. z. in its version from
  1 January 2015 (static.slov-lex.sk; § 1(1) the ECB's main refinancing rate valid on the first day of each calendar
  half-year of the delay plus eight points for that half-year, § 1(2) the creditor's other choice, not worked out:
  the first day's rate plus nine; § 2 the flat compensation 40 € once, § 369c of the Commercial Code), the ECB's
  decisions (press release of 10 September 2026: 2,65 % from 16 September 2026; the changes since 2023 in `MRO_RATES`,
  one line a new decision: **add it when the ECB changes its rates**). The delay begins the day after the due day,
  interest to the day of payment or today, a year of 365 days, rounded once. An invoice (not a request, credit note,
  advance or an invoice of interest) in euros paid late or still unpaid shows "Úrok z omeškania" on its page (the days,
  the amount on what it asks after its credit notes, the half-years' rates) and, to a business customer (IČO or IČ DPH),
  "Vystaviť faktúru na úrok a náhradu" (`POST /app/faktury/:id/urok`): an issued invoice of the interest and 40 €,
  numbered in the invoices' row, due in the company's days, outside VAT ('outside', O in the e-invoice) with its own
  sentence "nie sú predmetom dane z pridanej hodnoty" (`INTEREST_NOTE`) and the rule in its note, category 'interest'
  (644), one for an invoice (`invoices_interest`; a second click leads to it). Reminders that go by themselves
  (`/app/faktury/upomienky`, owners; a card on /app/faktury): from nine in Bratislava the schedule
  (`dunningScheduled`) sends an overdue invoice or request mailed to its customer before its reminder 3 days after the
  due day ("Pripomienka"), 14 ("Upomienka") and 30 ("Druhá upomienka"), never within five days of another (one sent by
  hand too), each once (`invoices.reminders` moved from the step it read, the outbox key), the reply to who issued it;
  the invoice says how many went. Not built: a consumer's late interest (nariadenie vlády č. 87/1995 Z. z.), interest
  of a debt paid in parts, the rate of § 1(2), the income tax's rule that late interest not received is added back
  until paid (§ 17(27) of the Income Tax Act: the closing does not adjust for it), the reminders' wording chosen by the
  company. test/dunning.runtime.mjs, units "Reminders and late interest".
  Mended after a third independent review (18 October 2026, of commit 537c20e; each finding verified first; schema
  step 53 `invoices.interest_to`, the invoices' lock guard made again): interest is invoiced once for each day
  (`interest_to`, the last day an invoice of interest counts; the next counts from the day after, `lateInterest`'s
  `since`; unique by invoice and day, so a second click the same day leads to the one made) and the 40 € only with
  the first; an invoice of interest a credit note took back whole counts for neither, and that credit note is interest
  too (644, `interestOf`); an invoice of interest is never copied ("Vystaviť podobnú" takes its customer alone) or
  repeated. Reminders: a credit note lowers what is asked (`stillAsked`; credited whole, none; the mail says "po
  dobropise na sumu"), by hand too; a request with its final invoice is never reminded; the first reminder waits five
  days after the invoice was mailed (`sent_at` counts as contact); the schedule's query asks everything (unpaid, money
  on its symbol not yet paired, credited, the step's day, five days since contact), so a hundred invoices not due
  cannot keep the due ones from their turn; and a reminder goes only once the company's bank (a payment, a statement
  taken, a linked bank read) reaches the day before the step's day, so a payment the bank has not told of yet is no
  reason to remind (a company with no bank data gets none). The period lock guards only what an invoice says
  (`INVOICE_FIELDS`): reminders, mailing and the customer's email change an invoice of a locked month.
- The company's logo on its invoices (built 18 October 2026, schema step 47: `companies.logo_key`, `logo_type`): on
  the same page (#logo) an owner uploads a PNG, JPEG or WebP up to 512 kB (by its bytes, `logoTypeOf`; no SVG, which
  could carry a script), kept in R2 under `companies/<id>/brand/` with a new key each time (the one before deleted;
  purge deletes the folder); the sheet shows it above the company's name in the app (`/app/logo`) and on the
  customer's page (`/f/<token>/logo`), served as a picture that runs nothing (sandbox, nosniff); removed by
  `/app/faktury/logo/odstranit`. The accountant's booking screen shows the sheet without it.
- The customer's state (built 18 October 2026, schema step 44: `invoices.customer_country`): the form's "Štát"
  (`COUNTRIES`, the Union, the rest of Europe and the usual partners, by their Slovak names; empty: the state of the
  VAT number, else Slovakia, `customerCountryOf`); a state against the VAT number is refused (`customerCountry`); the
  sheet prints a state other than Slovakia, the e-invoice names it for the customer and for K's delivery; credit notes,
  similar invoices, advances and repeats carry it. A private person has no Peppol address, so such a file breaks
  Peppol's R010 alone (the Peppol test allows exactly that for its case) and is for import, never sent on the network.
- Payment orders (built 18 October 2026, schema step 43: `payment_orders`, `payment_order_items`,
  `src/app/payorders.ts`, `src/views/payorders.tsx`): "Na úhradu" (/app/uhrady, linked from Doklady) lists the
  suppliers' invoices the company owes (a received invoice read or booked, in euros, no payment paired, not paid by
  the owner, not deleted or a suspected duplicate), the earliest due first, overdue in red; those with the supplier's
  IBAN are ticked (unless in an order already, "v príkaze na ..."), the others are listed to pay by hand with why (no
  IBAN, another currency). The client picks the account (euro accounts) and the day (today or later) and gets the order
  as pain.001.001.03 (`painXml`; the schema `test/xsd/pain.001.001.03.xsd` from the Python package sepaxml 2.7.0,
  SHA-256 ed4be425..., which adds one comment naming iso20022.org): one payment block from the account, without BIC
  (NOTPROVIDED), SLEV, each credit transfer with the symbols as the Slovak Banking Association's convention writes
  them in the End-to-End Identification ("/VS2026118/SS/KS", NOTPROVIDED without one), names and texts in SEPA's basic
  Latin (no accents). Each order is kept with its items, so its file is made again the same
  (`/app/uhrady/:id/xml`); the bank's statement then pairs each payment as any payment. Purge deletes them.
  test/payorders.runtime.mjs (the file validated against the schema), units "Payment orders". An invoice the reader
  found no IBAN on takes one typed on the page (`/app/uhrady/iban`, its check digits checked; `party_iban` is no field
  the period lock guards). Not built: payment in another currency, a batch to the bank by its API.
  Approving before paying (built 18 October 2026, schema step 45: `companies.approvals`, `documents.approved_at`,
  `approved_by`): an owner turns "Schvaľovanie faktúr dodávateľov" on in Firma a nastavenia (#schvalovanie); then a
  supplier's invoice goes into a payment order only once an owner approved it on its page ("Schváliť na úhradu",
  `/app/doklady/:id/schvalit`, taken back by `/neschvalit`; it says who and when); a colleague sees that it waits.
  Not the books' business: no period guard covers it.
  For larger companies (since 18 October 2026, schema step 55: `members.approver`, `members.approve_limit`,
  `companies.approval_two_from`, `documents.first_approved_at`, `first_approved_by`; `src/app/approvals.ts`): in the
  same section of Firma a nastavenia an owner makes colleagues approvers, each up to a limit or without one, and sets
  from what amount two people approve. An owner approves any amount; an approver only within his limit (else 403); an
  invoice in another currency counts above every limit. From the two-approval amount the first approval is kept on the
  document ("Prvé schválenie: ..."), its own approver cannot give the second ("Schváliť ako druhý" is offered to
  somebody else allowed the amount), and only the second approves it whole for payment orders; each step is written
  only from the state it was read in. "Zrušiť schválenie" (anybody allowed the amount) takes both back; so does another
  total or currency saved on the booking screen, or an IBAN typed by anybody but an owner. "Na schválenie"
  (`/app/schvalovanie`, from Doklady and the settings): what the person may approve, then what waits for others (a second
  approval, above his limit). test/approvals.runtime.mjs, units "Approving for larger companies". Not built: approvals
  by cost centre or by supplier, a doorbell to the approvers when an invoice waits, approving issued invoices.
  Mended after a sixth independent review (18 October 2026, of commits bff5c1a and 2494f4f; each finding verified first;
  schema step 57 `documents.iban_by`): a colleague who typed a supplier's IBAN never approves that invoice himself
  (`approvalStep` 'iban'; an owner may), so somebody else sees whom it pays; an approval carries what its page showed
  (`approvalSeen`: total, currency, IBAN, the hidden field `stav`) and is written only while the invoice is so, else
  "Faktúra sa medzitým zmenila"; a first approval counts only while its approver may still approve the amount (removed,
  no approver, a lower limit: the next approval takes its place, 'again'); a first approval left when the owners raise or
  clear the amount of two is enough, also for the person who gave it; the booking screen takes an approval back also for
  another kind, supplier or variable symbol (the payment order carries it); the queue lists only what a payment order
  pays (`PAYABLE_DOC` in payorders.ts: no credit note taking back, no prepayment invoice, nothing to pay) and a colleague
  who approves nothing reads "čaká na schvaľovateľa".
  The doorbell of a working morning (built 18 October 2026, `remindApprovals` in remind.ts, `waitingFor` in
  approvals.ts): at nine on a working day each person an invoice waits for (an owner, an approver within his limit, for
  an approval that counts: first, again or final, never who typed its IBAN or the first approver for the second) gets one
  doorbell "faktúry na schválenie" with the link to the queue, once a day whatever number of invoices and companies,
  never who turned reminders off.
- Mended after the review of the invoices (18 October 2026, an independent reader of commits c97c5c5 to 885e572; each
  finding verified in the code first; schema step 48 `documents.prepaid`): a final invoice its advances paid whole
  (total nought, the usual case) made no entry, so 324 kept the advance and the revenue missed the supply, and its VAT
  was guessed exempt with no lines and blocked the period (`planOf` takes a nought with `advance_cents`, `proposeVat`
  proposes nothing for it, `stateOf` says paid, it is never reminded); money on a request's symbol is matched with
  the bank's noughts in front and only in euros (a payment in crowns made a euro advance of its cents); issuing the
  final invoice first gives every payment on the request its tax document (after it none is made); `autoAdvances`
  leaves out requests with their final invoice (they held its twenty places) and goes by the oldest payment; a request's
  symbol begins with 9 (above); a repeat moves on only from the day its run read (`next_on = ?` and a row that cannot be
  written when nothing changed, so a run across midnight issues nothing twice); an IBAN is typed on "Na úhradu" only
  where the document has none that is one, and typed by anybody but an owner it takes the approval back; the payment
  orders leave out a supplier's credit note (it corrects an invoice and its lines take back) and a prepayment invoice
  (386, `prepaid` from the e-invoice: paid already), and list a corrective invoice that adds to pay by hand. Units
  1159, runtime 1650.
- Found on the way (18 October 2026) and mended: automatic pairing asked the period lock of `p.id` and `d.id` inside
  subqueries that name their own `payments p` and `documents d`, so once any company had a locked period with a booked
  document or a payment in it, no company's payments paired by themselves any more (`linkStatement` now asks it of
  the ids bound as ?5 and ?4); and a credit note issued in the app made no entry in the books (its total keeps the
  minus; `planOf` takes a minus total that corrects an invoice).
- Not built yet: an advance in another
  currency, advances for a supply without Slovak VAT (goods to the EU, export, reverse charge: the request is refused),
  a rate that changes between the advance and the supply, a repeat whose lines change (indexed rent, hours of the month), the e-invoice sent through a
  digital postman.

### Business trips (18 October 2026; `src/app/trips.ts`, `trips-store.ts`, `src/views/trips.tsx`, schema step 49 `trips`)

What an employee (or a director who is not employed) is owed for a trip in Slovakia, worked out by the app and kept as
the company's document, so a company with many people travelling needs no spreadsheet and no accountant's arithmetic.

- Read on 18 October 2026 (podnikajte.sk, "Cestovné náhrady v roku 2026", updated 27 July 2026, and "Konateľ s.r.o. a
  cestovné náhrady"; Act No. 283/2002 Z. z.): the meal allowance for each calendar day by its hours, 5 to 12 hours
  9,30 €, over 12 to 18 hours 13,80 €, over 18 hours 20,60 € (measure No. 280/2025 Z. z., from 1 December 2025), under
  5 hours nothing; a meal given free cuts 25 % (breakfast), 40 % (lunch), 35 % (dinner) of the over-18-hours amount,
  never below nothing; a private car 0,313 € a started kilometre (measure No. 340/2025 Z. z., from 1 January 2026) and
  the fuel, km × consumption per 100 km (the vehicle's document) × the price of a litre (the receipt, else the
  Statistical Office's average), each to the cent; a director not employed is owed the same (§ 1(1), (2)); the employer
  settles within 10 working days (§ 36), the document's due day. The rates sit in `MEAL_RATES` and `CAR_RATES` with
  the day each measure holds from: a new measure is one line (the meal allowance changes when prices rise 5 %).
- "Pracovné cesty" (`/app/cesty`, from Doklady): any member enters a trip (`/app/cesty/nova`): a payroll employee (the
  name and IBAN payroll keeps) or a name typed, an IBAN, the purpose, from and to, departure and return (typed
  "14. 10. 2026 7:30"; not before 2026, not in the future, at most 31 days), the transport (a private car asks for km,
  consumption, price and the plate; its fields hide by `:has()` otherwise), and whether any meal was free; only then
  are the meals asked day by day, and a form that did not show the trip's days shows them first (`dni`, "Prepočítať").
  Saved (`tripStatements`, one batch): the trip numbered in its year (`CP2026-001`), what it came to as worked out then
  (`result` JSON), and a document (`source` 'trip', `invoice_in`, category 'allowance' 512 with `payable` 333 in
  `CATEGORIES`, outside VAT altogether: `vat_mode` 'none', of the return's day in the books, due in 10 working days,
  the traveller's IBAN, so "Na úhradu" offers it in a SEPA order); pairing runs at once (the payment to the employee
  pairs by amount, name and IBAN). A trip owed nothing (under 5 hours, no private car) makes no document.
- The books: `payableOf` puts the open item of such a document on 333 (Saldokonto shows "Zamestnanci: cestovné
  náhrady, 333" when anything stands there) and its payment settles it from 333; the booking screen shows the
  settlement as the original, with the entry 512 against 333; no supplier's rule is made of it or touches it
  (`ruleStatement`, the form's "Zapamätať" off).
- The settlement (`/app/cesty/:id`): the company, the traveller, purpose, places, transport and plate, departure,
  return and the day settled, each day with its hours, allowance, cut (which meals) and what is owed, the car's two
  parts, the total, the account, the rules it follows; printed or saved as PDF. Taken back (`/zrusit`) only while its
  document is neither booked nor paired (the document is deleted with it, its number never given again); the
  document's own "delete" leads to the trip. The yearly ZIP has `cesty.csv`; purge deletes the trips.
- Not built: trips abroad (the ministry of finance's allowances by country, the currency), an advance before the trip,
  costs proven by documents inside the settlement (tickets, accommodation, parking stay documents of their own: an
  employee who paid them is the accountant's to book, 333), the company car's fuel (the company's own purchase), the
  hour summer time adds or takes on its night, whether a director not employed is better booked on another account than
  333 (practices differ; 333 is used), approving a trip before it is paid beyond the approvals of payment orders.
  test/trips.runtime.mjs, units "Business trips at home" and the ledger's trip.

### Cost centres (18 October 2026; `src/app/centers.ts`, `centers-store.ts`, `src/views/centers.tsx`, schema step 52)

A company's own division of its costs and revenues (strediská: a shop, a branch, a project, a contract), for the
management of a medium or large company; the books stay as they are.

- The list (`cost_centers`; `/app/strediska`, from Doklady; owners make and archive): a code (letters without accents,
  digits, a dash, up to 12, kept in capitals, once a company) and a name; archived, a centre keeps its documents, takes
  no new ones and stays in the report while it has any.
- A document's centre (`documents.center_id`, management information: no period guard holds it): any member gives it
  on the document's page (`/app/doklady/:id/stredisko`), the accountant on the booking screen (the form's "Stredisko");
  only a centre of the company in use.
- The report (`centerTotals`): for a year and months from and to, each centre's revenues (class 6) and costs (class 5)
  of the entries of its documents (its own entry, an exchange difference of its payment), the result, and "Spoločné":
  payroll, depreciation, a bank's fee, the accountant's internal documents and documents without a centre; the total
  is the books' result of the period. The yearly ZIP: `doklady.csv` names each document's centre, `data/strediska.json`
  the list; purge deletes them.
- Mended after an independent review (18 October 2026, of commit f3b7b5a; each finding verified first): the booking
  screen writes the centre only when it was changed there (`stredisko_bolo`, the centre the page showed), so one the
  client gave meanwhile stays, and a form sent back with an error keeps the centre picked; a payment of several invoices
  in another currency puts each exchange difference in its own invoice's centre (`LedgerLine.docId`); a credit note, an
  invoice of late interest and an invoice issued by a repeat take the centre of the invoice they come from
  (`centerFrom`); the page of a refused deletion shows the document's centre; a document saved again with its own
  (archived) centre is no error; a code too long is refused, not cut, and only a code taken is said to be taken; an
  archived centre stays in the report while it has documents of any period. "Spoločné" names everything it holds:
  payroll, depreciation, goods sold out of stock (booked by months, not by document), the year's revaluation of what is
  open in another currency, a bank's fee, internal documents, the income tax and documents without a centre.
- Budgets (built 18 October 2026, schema step 59 `cost_center_budgets`): an owner plans each centre's revenues and
  costs for a calendar year ("Rozpočet na rok", `/app/strediska/rozpocet`, a row a centre in use, empty nought and no
  row); the report shows under each centre's revenues and costs its months' share of the year's (`budgetShare`, a twelfth
  a month) and how much of it was earned or spent (`budgetUse`, red above 100 %); a colleague reads the budgets. Handover
  and the yearly ZIP carry them (`rozpocty-stredisk`), purge deletes them.
- A supplier's rule remembers the centre (built 18 October 2026, `supplier_rules.center_id` in schema step 59): booked
  with "Zapamätať pre dodávateľa", the rule keeps the centre the form leaves the document with, and gives it to the
  supplier's next documents that have none (a centre in use; `ruleStatement`); the client page names it.
- Payroll by centre (built 18 October 2026, schema step 60 `employees.center_id`): the employee form has "Stredisko"
  (a centre of the company in use, or the one he has); a closed month keeps each line's centre (`RunLine.center`), the
  books' payroll entry carries each centre's cost of work (`centerCosts`: the slip's cost of work and the social fund's
  allocation of its employees), and the report moves it from what is in common to the centre; the books' lines stay
  as they were.
- A centre on the invoice form (built 18 October 2026, `invoices.center_id` in schema step 60): a company with centres
  in use picks one on a new invoice ("Stredisko", not printed on the sheet); the invoice keeps it (drafts too) and its
  document takes it, else the centre of the invoice it comes from as before; a similar invoice, a repeat, a final
  invoice and an advance's tax document start from their invoice's centre.
- Not built: a
  document split among centres, an employee split among centres, depreciation or the cost of goods sold by centre, the accountant's own report
  screen, budgets by month or by account. test/centers.runtime.mjs, units "Cost centres" and "Budgets of cost centres".

### The cash box (18 October 2026; `src/app/cash.ts`, `cash-store.ts`, `src/views/cash.tsx`, schema step 50)

The company's cash, as its books hold it: account 211 day by day. Receipts paid from the cash box were booked against
211 before (a receipt nobody paid by bank or himself); everything else that moves cash now has its cash document.

- Read on 18 October 2026: Act No. 394/2012 Z. z. as in force from 1 January 2026 (zakonypreludi.sk): a cash payment
  above 5 000 € is forbidden (§ 4(1)), split payments of one legal relationship count together (§ 6(2)), a legal
  person's fine up to 150 000 € (§ 10(2)); cash taken from or put into the company's own bank pays nobody. Every cash
  movement is an accounting case with its document (§ 10 of the Act on Accounting).
- Cash documents (`CASH_KINDS`): money in (PPD): taken from the bank (211/261), the owner's loan (211/365), the
  capital paid in cash (211/353), an advance given back (211/335), a customer's invoice paid in cash (211/311); money
  out (VPD): put into the bank (261/211), the loan paid back (365/211), an advance to an employee (335/211), wages in
  cash (331/211), a supplier's invoice or a trip's settlement paid in cash (321 or 333 against 211, `payableOf`). They
  are ledger entries of the kind 'cash' (`cash_kind`, `party`, `document_id`, `payment_id`), numbered by year and side
  in the statement that writes them (`PPD2026-001`, `VPD2026-001`), booked at once, guarded by the period lock as every
  ledger entry, removed only by a mark (the number stays taken). One cash document an invoice and one a bank payment
  (unique partial indexes).
- The client (`/app/pokladna`, from Platby): the balance now, the year's money in and out, the book of the year (each
  document of the books that moves 211 with the balance after it, a balance below nought in red and a warning), the
  receipts paid in cash the accountant has not booked yet listed apart; "Príjem do pokladne" and "Výdaj z pokladne"
  (`/app/pokladna/nova?strana=prijem|vydaj`): the kind, the day (not ahead), the amount and who (an invoice's are the
  invoice's), the invoice (unpaid, in euros, not a credit note or a prepayment invoice), or for cash from or to the bank
  the bank's payment of the last 90 days, which is then marked as money between the company's own accounts (261) with
  the document's number and freed when it is taken back; no amount typed takes the payment's. Refused: more than there
  is (`lowestFrom`: the box stays at nought or above from that day on, the books' 211), more than 5 000 € paid in cash
  (not for cash from or to the bank), a period the accountant locked, after the contract's intake. Taken back
  (`/zrusit`) unless the box would go below nought. An unpaid invoice's page offers "Zaplatené z pokladne v hotovosti"
  (or "Odberateľ zaplatil v hotovosti"); one paid so says so and is paid everywhere (`CASH_PAID`: not loose, not paired
  by the bank, not in the payment orders, an issued invoice paid, a trip paid).
- The books: a cash entry with `document_id` settles that invoice's open item (`buildBooks`), the journal names it
  "Pokladničný doklad"; the yearly ZIP carries them in `data/` with the other ledger entries.
- Mended after a second independent review (18 October 2026, commits 5098197 and f7c5a78, each finding verified
  first): a document paid in cash could still be paired with a bank payment by the accountant, the client or a file
  sent again (settled twice): `linkStatement` and `privatelyStatement` now refuse it (`CASH_PAID`), the booking screen
  says it was paid in cash and offers no payment (`CASH_PAID_COLUMN` in every document query); it is not deleted or
  discarded while its cash document stands, and its kind, currency and account owed (`payableOf`) do not change; an
  invoice is paid in cash by what was paid (empty: what it still asks for, an issued one less its credit notes; never
  more); the balance is checked and the document written at one data revision (`company_data_revisions`, two at once
  cannot pay out the same cash; taking back likewise); no cash document before the books start; `doklady.csv` names a
  cash payment, and `data/pracovne-cesty.json` carries the trips.
- Not built: cash in another currency, a count of the cash at the year's end (inventory, § 30), a limit check across several documents of one legal relationship (§ 6(2):
  each is checked alone), the cash book printed as its own file (the journal and account 211 are).
  test/cash.runtime.mjs, units "The cash box" and the ledger's VPD.

### The takings of an eKasa till (18 October 2026; `src/app/takings.ts`, `takings-store.ts`, `src/views/takings.tsx`, schema step 54)

A shop, a café or a hairdresser records its sales in an eKasa till; the till's daily closing (denná uzávierka) says
what was taken by rate. Until this, Firmony had no way to take a company's own takings, so a retail company could not
file its VAT with us.

- "Tržby z eKasy" (`/app/trzby`, from the cash box; any member): the day (not ahead), the closing's number
  (optional), the takings with VAT at 23, 19 and 5 % and exempt (a company that is no VAT payer: one amount), each
  rate's VAT as the closing says it (empty: worked out from the takings, rate / (100 + rate), `vatInGross`), the part
  paid by card (the rest is cash), goods (604) or services (602), and a cost centre. Refused: nothing written, a negative
  amount, VAT above its takings, more by card than the takings, a day before the books start, a period the accountant
  locked (the documents' lock guard, `takings_cash` in it).
- Kept as the company's document of its own (`documents.source` 'takings', `invoice_out`, "Tržba z eKasy", its VAT
  confirmed: `domestic` by rate for a payer, `none` for anybody else; booked at once by who wrote it;
  `documents.takings_cash` the cash part). The books (`documentLines`): the cash part into the cash box (211), the card
  part to money on its way (261) until the bank brings it, against the revenue and 343.200; no open item (`buildBooks`),
  never paired with a bank payment, offered to the cash box or listed as waiting for a payment (`CASH_PAID` covers it),
  and the booking screen keeps it an issued document in euros. The cash book shows it with the balance.
- The VAT return: rows 01 to 04 by rate, 13 for what is exempt; the control statement: one D.1 line of the period
  (SumaObratov the takings with VAT of all tills, exempt included; Z and D the basic rate; ZZn and DZn the reduced ones),
  never A.1 or D.2 (`VatDoc.takings`); a supplementary statement repeats a changed D.1 as two lines, as D.2.
- Taken back (`/app/trzby/:id/zrusit`, a mark, at the data revision the cash box was checked at) unless its cash was
  paid out since (the box would go below nought); the documents' "delete" leads there.
- Read on 18 October 2026: KVDPH's instructions of 2021 (part D.1: the turnover of all tills including corrections,
  exempt supplies may be left out, an invoice also recorded in the till may be counted twice; D.2 only what D.1 does not
  hold) and the schema's D1 element (kv_dph_2025.xsd).
- Mended after an independent review (18 October 2026, of commit b3eb001; each finding verified first; schema step 56,
  `documents_takings`): the control statement is filed whenever a part has a line, so a supply with domestic reverse
  charge (A.2, in no row) is never left out by a nil return, goods alone or imports alone (`PeriodResult.skip` says why
  none is filed, and the VAT page says it for imports); the booking screen changes, unbooks and discards no takings
  (the client takes them back and writes again); the client's list and page say "Zaplatená pri pokladnici" with the
  cash and card parts, and takings are never "paid privately"; a day before the registration for VAT is written
  without VAT (the revenue whole); the VAT typed for a rate is refused when it is off the VAT in the takings by more
  than 10 cents or one per cent; a closing's number is at most 32 characters and never blocks the period; the same
  closing twice (the day and number, or without one the total) is refused, also by a unique index; the event is
  written only with the document; `doklady.csv` gives takings their day and amount paid and the cash part.
- Not built: the till's data read from the Financial Administration (only a verifier may, "eKasa receipts"), the card
  settlement from the acquirer paired by itself (the accountant gives the bank's payment 261 and the fee 568), takings in
  another currency, refunds (a negative day: corrections by the accountant). test/takings.runtime.mjs, units "imports"
  and "takings" under VAT and the ledger's takings.

### The bank without an aggregator (14 October 2026; `src/app/statements.ts`, `src/app/fio.ts`, `src/views/bank.tsx`)

Enable Banking asked 900 € a month (see 12:15 on 14 October). So the bank comes the ways that cost nothing, set once:

- The ways, by bank (`BANK_WAYS` in `src/config.ts`): Slovenská sporiteľňa emails a statement every day with a
  movement (`daily`: George, the account's statement settings, a new electronic statement, SEPA XML, daily, the
  company's address; in Business24 a request for new statement settings); ČSOB emails them (`email`; its format was
  not read: "XML, daily if the bank offers it"); Fio banka by the client's token (`token`); Tatra banka (its
  "Výpis do účtovníctva" in XML, from the inbox of messages), VÚB, 365.bank, mBank, UniCredit, Prima, Revolut
  Business (Camt.053), Wise (CAMT.053) and any other bank once a month (`monthly`). Read on 14 October 2026:
  Slovenská sporiteľňa's page of electronic statements (formats PDF, SEPA XML, MT940; daily, monthly or yearly;
  email is a channel). Not read: whether its emailed XML comes zipped or encrypted, and from which address.
- The page (/app/banka, `BankPage`): without Enable Banking it opens with the list of banks; a bank picked
  (`?banka=<id>#postup-banka`) shows its steps, the company's address for documents with a copy button, and the
  one action that finishes it: "Hotovo, nastavené" (`POST /app/banka/nastavene`, `companies.bank_setup` with the
  bank and the moment, for the two banks that send by themselves), the token form, or the monthly upload (which
  remembers its bank). Then it waits for the first statement ("Čakáme na prvý výpis"), says after three days that
  none came and what to check (`STATEMENTS.waitDays`), and once statements come it says when the last came and folds
  the steps away ("Ako je to nastavené") and the list too ("Iná banka"). Below: "Pridať výpis ručne" and the
  statements that came. With Enable Banking set up, its banks come first as before and these ways follow as
  "Alebo bez prepojenia".
- Every statement is kept with its file (`statements`, schema step 5; R2 `companies/<id>/statements/<file>.xml`;
  ten years like any accounting document; `/app/vypisy/:id/subor` downloads it). A file may hold statements of
  several accounts (`part`). What becomes of each (`verdictOf`, the whole rule): a member of the company who adds it
  on a page is trusted (a new account included). One that came by email: an account the company does not have
  waits for an owner (`confirm`); the same movements again are `known`; then it has to have both balances, its
  movements have to make its closing balance from its opening one (`sum`), the account's balance has to be known
  (`unknown`), it may not start before the day of that balance (`overlap`), and it has to open with that balance
  (`gap`); else it is `held` for the accountant. A stranger who knows the IBAN (it is on every invoice) does not know
  the balance. Taken: its payments come in (`importEntries`, nothing twice), its closing balance becomes the
  account's, and the payments pair with their documents.
- The owner's answer (`answerAccount`, `POST /app/vypisy/:id/ucet`, owners only; a card on the overview and on the
  bank page, "Prišiel výpis z nového účtu", showing the IBAN): yes makes the account the company's and takes the
  first statement that waited, and the next ones of that account have to follow it as if they came then; no refuses
  them all, and nothing of them reaches the books. The accountant's answer (`answerHeld`, "Výpisy z banky" on the
  team's client page, `#vypisy`, with why it waits in figures; counted under "Na kontrolu" in the list of clients):
  "Zaúčtovať aj tak" or "Nezaúčtovať". Each answer is in the events.
- Doorbells, rung at once: `statementConfirm` to the owners, `teamStatement` to the company's accountant (else
  ahoj@). No IBAN and no amount in them.
- The month whose statement is due (`statementDue`): an account that no active link reads and whose last statement
  did not come by email (a bank that emails sends nothing on a day without a movement) has to have a balance on the
  last day of the month before. The overview says so from the 1st ("Výpis z banky za ..."), and the company's people
  are rung on the 3rd at 9:00 (`remindStatements`, once a month for each person, only those with reminders on).
- Fio banka (`src/app/fio.ts`; its manual, API_Bankovnictvi.pdf version 1.9): the owner creates a token that only
  reads, valid 180 days, and pastes it once (`POST /app/banka/fio`; 64 letters and digits, `isFioToken`). It is a
  link like Enable Banking's (`bank_links.kind` 'fio', `token`): read at once (90 days back), then by the schedule
  every six hours also while Enable Banking is not set up, and on "Načítať teraz"; one token at most every 30
  seconds (`FIO.minSeconds`, `tried_at`; 409 from Fio is said as "o chvíľu"). A token Fio refuses (401, 403, 404)
  ends the link and the overview offers a new one; unlinking forgets the token; a new token for the same account
  takes the old link's place. Movements: column 22 the id (`fio:<id>`), 0 the day, 1 the amount, 2 and 3 the other
  account (made an IBAN, `ibanOf`), 10 its name, 4 to 7 the symbols, 16 the message, 8 the kind ("kart" is a card).
  Never seen against the real API.
- The yearly download holds the statements (`vypisy/<day> <last four of the IBAN>.xml`, `vypisy.csv`); the
  deletion ninety days past the end removes them with their files.
- The playground runs without Enable Banking, as January will (`EB=1` brings it back). The sample company's bank
  sends its statements by email: eleven, one for each day with a movement, each with its file, taken
  (`seedStatements` in `src/app/demo.ts`). `/playground/vypis?typ=dalsi` emails the next one (a card payment and the
  money that pays invoice 20260007), `typ=novy` one of an account the company does not have, `typ=medzera` one that
  does not follow. The pretend Fio takes any token of 64 letters and digits.
- Not built: a ZIP attachment with XML inside (a bank that zips its statements) is not opened; MT940 is not read
  (Slovenská sporiteľňa offers it; the steps ask for SEPA XML); a statement in another currency is taken as it is.
  Not seen: a statement emailed by a real bank, Fio's real API, ČSOB's emailed format.

### The bank by open banking (step 4, 13 October 2026; `src/app/bank.ts`, `src/views/bank.tsx`)

What Pennylane and Dougs do: the client picks the bank, signs in there and allows reading; the payments then arrive by
themselves and pair with their documents. Enable Banking (Enable Banking Oy, Finland) is the account information
service under PSD2; `src/app/bank.ts` is the only file that talks to it. Without `ENABLE_BANKING_APP` and
`ENABLE_BANKING_KEY` nothing of it shows and the statement upload is as before.

- Every call carries a token the application signs with its key (RS256, `kid` the application's id, `iss`
  enablebanking.com, `aud` api.enablebanking.com, an hour long; kept for the isolate). The key may be PKCS#8 or
  PKCS#1 (`pkcs8Of` wraps it), with "\n" written out or not.
- Banka (/app/banka; Platby has a card that links there, the first steps' first step is "Prepojte banku"): the
  banks of Slovakia that read a business's accounts (`GET /aspsps?country=SK&psu_type=business&service=AIS`, kept
  six hours), each a link (not a form: the page's rules let a form lead only to our pages) to
  `/app/banka/pripojit?banka=`, refused when `Sec-Fetch-Site` says another site sent it, 20 an hour per company.
  It writes a pending consent with a hash of its state and sends the client to the bank (`POST /auth`, 180 days or
  the bank's most, `psu_type` business, `language` sk). Back at `/app/banka/navrat` the state must be a pending
  consent of this person in this company younger than an hour; the code becomes a session (`POST /sessions`), each
  account with an IBAN becomes the company's (`accounts.link_id`, `remote_id`; a card without one does not), and a
  consent the new one took every account from is closed at the bank (`DELETE /sessions/<id>`). Cancelled at the
  bank (`error=`), the pending consent is forgotten.
- Reading (`readLink`): every account of a consent, from 90 days back the first time and from five days before the
  last read afterwards (late bookings), all pages; only what is booked (`status` BOOK); the amount's direction from
  `credit_debit_indicator`; the other side's name and IBAN; the Slovak symbols from `reference_number` and
  `remittance_information`; a card payment named by its merchant; the bank's balance (CLBD first). New payments
  pair at once, an invoice paid by its number says "Zaplatená". The schedule reads a consent every six hours
  (`tried_at`, so a failed read waits too: PSD2 allows four reads a day without the client, RTS art. 36(5); a first
  read that failed is tried again within a quarter of an hour, since the client waits for it); "Načítať
  teraz" (six an hour) sends the client's address and browser (`Psu-Ip-Address`, `Psu-User-Agent`), so the bank
  does not count it among the four. A 401 or a code that means the consent ended marks it expired.
- The same payment from a statement and from the bank is one (`importEntries` in `store.ts`): another source's
  payment of the same day and amount, and of the same symbol and other account where both have them, stands for one
  entry; a payment already read from the same source takes no other's place (so two coffees stay two, whatever
  order the bank gives them in).
- Pairing (`match.ts`): a variable symbol that names exactly one candidate, which no other candidate payment
  carries, decides, so of two invoices of the same amount the payment with the number of one pays that one.
- Renewing: ten days before the end the overview says so with "Obnoviť prístup" (`noticeOf`), and the owners get one
  email at nine (`remindBankRenewals`, key `bank-renew:<consent>:<owner>`); ended, the overview says the payments
  stopped. Renewing is linking again: the new consent takes the accounts over, the ended one is not shown.
- An owner can unlink (closed at the bank, the payments stay) and take out an account that is not the company's (a
  personal one allowed at the bank by mistake): read no more, and the payments the bank brought for it that no
  document hangs on are removed.
- The accountant's page of a client says in its head line whether the bank is linked and when it was read.
- The sample: the playground has a pretend Enable Banking (`pretendBank` in `test/pretend.mjs`: it checks the token
  as the real API does, knows ten Slovak banks, approves at `/playground/banka`), whose account is the sample
  company's: the café of yesterday arrives once, the money for invoice 20260007 pays it, a card payment at BILLA and
  a fee arrive.
- Not seen against the real API: anything (no application exists). Read in its reference: the token, `/aspsps`,
  `/auth`, `/sessions`, transactions with `continuation_key`, balances, `DELETE /sessions`. Not read: the exact
  codes of its errors (`ErrorResponse` was cut off in the reference), whether a bank needs `auth_method`, how long
  an account's `uid` lasts beyond its session.

### eKasa receipts (14 October 2026, evening; `src/app/ekasa.ts`)

What "eKasa receipts by their QR code" was meant to be: the code points to the receipt in the Financial
Administration's eKasa system, so a receipt could come in as data instead of a photo read by the AI. What the law
allows was read first (Act No. 384/2025 Z. z. on recording takings, in force since 1 January 2026, in the original on
static.slov-lex.sk; the full reading and a letter to FR SR are in `PROGRESS.md`, milestone 4): the public may check a
receipt by its code (§ 18(1) and (3)); a program asking for receipts and taking their data is a verifier's
(overovateľ, § 2(aj)), who notifies FR SR of its IP address, reports its results back and follows conditions FR SR
publishes (§ 18(11)), from a day FR SR publishes (§ 19(6)); neither was published on 14 October 2026. A Worker has no
fixed address of its own. So Firmony asks the service nothing until he decides and FR SR answers.

- The codes (`ekasaUid`, `ekasaOkp`), as FR SR's "Popis integračného rozhrania systému eKASA" (4 November 2022) has
  them: the identifier (UID: a letter, "-", 32 hexadecimal characters; given by the eKasa system to a receipt the till
  sent at once, and the whole content of its QR code) and the seller's verification code (OKP: five blocks of eight
  hexadecimal characters; on every receipt, and the first part of the QR code of a receipt sent late). The reader's
  tool asks for both (`ekasa_uid`, `ekasa_okp`, "znak po znaku"); each is kept only in its form, in capitals, the OKP
  in its blocks, a nought read for the letter O put right (`documents.ekasa_uid`, `ekasa_okp`, schema step 9).
- One receipt or two (`sameReceipt`, used first by `sameDocument`): the same when either code agrees, up to four
  characters misread (`MISREAD`; two receipts' codes differ in nearly all of their 32 or 40); two when the codes both
  have disagree, whatever their number and amount (a till numbers receipts from 1 again every calendar month); with
  nothing to compare, the old rule. `markDuplicate` looks at the 50 latest documents of the same amount, or with the
  receipt's exact code, or coded ones of its day, and names the original, not another duplicate.
- The accountant's booking screen shows the code under the original, wrapped anywhere but never cut, with "Overiť na
  finančnej správe" (`EKASA_VERIFY`, opd.financnasprava.sk, which she opens herself).
- The sample company's receipts have codes (`sampleCodes`, made up from the document's id), printed on their PDFs.
- The pretend reader takes what a test's photo says it shows: the bytes `PRETEND` and a JSON object of the tool's
  fields (`readerAnswer` in `test/pretend.mjs`).
- Not built: the QR code decoded from the picture (the printed codes are read; Chrome on Android's BarcodeDetector,
  not Safari's, or a decoder on the server, CPU on every photo), the lookup once allowed, a receipt as data without a
  photo (a client's own eKasa takings: since 18 October 2026, "The takings of an eKasa till").

## The order and the contract online (`src/order.ts`, `src/order-mail.ts`, `src/views/order.tsx`, `src/content/terms.ts`; 13 October 2026)

What Dougs and Pennylane do at the end of their sign-up: the contract is concluded on a page, by the person who may
bind the company, and the app opens at once. Here the person is a director (konateľ) the register names.

- A request for an s. r. o. the register knows, that is not ended and not a client yet, becomes an order (`orders`,
  30 days, `ORDER.days`); the email to the typed address carries the link `/objednavka/<token>` (a hash of the token
  is kept) and nothing a stranger could type (`orderLinkMail`). The directors in office are read from the register's
  entity (`lookupDirectors` in `src/rpo.ts`: `statutoryBodies`, those whose `validTo` passed are left out; four
  seconds at most). A company that is a client, or whose register cannot be asked, gets the old confirmation.
- The order page: the company from the register (name, seat, IČO, the register line in the genitive), the main points
  in a bordered table (price of the chosen plan, payroll, closing, start, invoices, notice, documents, answers; the rows
  follow the radios by `:has()`), the plan, the first month (`ORDER.firstMonth` 2027-01 and the five after it,
  `startMonths`), the director picked from the register's list (typed, with a space, when the register named nobody),
  the box for the terms, "Uzavrieť zmluvu". `noindex`, 10 acceptances an hour per connection.
- Accepting (`acceptStatements`): one batch whose first statement closes the order only while it is open and in time,
  and whose others (the company with `contract_at`, `terms_version`, `signed_by`, `start_on`, `register_line`; the user;
  the owner's membership; the event `contract.accepted`; the request marked `client`) run only when that statement
  found it (`EXISTS` on the order's id, company and time). Then a doorbell with the sign-in link (7 days) to the
  client and one to us (`bell.contract`, `bell.teamContract`; the terms are read in the app at /app/zmluva since the
  night of 13 October), and the browser is signed in (`/app?ok=zmluva`).
  An accepted order shows what was agreed; one that ran out answers 410.
- The terms (`/podmienky`, `TERMS_VERSION` 2026-10-13): 11 articles, numbered as the contract refers to them
  (`bod-<article>-<point>`), the processing on the client's behalf as article 8 (art. 28 GDPR), AML as article 9.
  A unit check holds every "bod x.y" reference to a point that exists. The builder's draft; no lawyer has read it.

## The power of attorney and the notice (`src/app/papers.ts`, `src/views/papers.tsx`; 13 October 2026)

- `/app/plna-moc`: the power of attorney as the company's own paper (`PoaSheet`): the company from the register and
  the contract (the director who concluded it, else a line to write on), europio with Christian Juhás, the scope (tax
  administration under s. 9 of the Tax Procedure Code, the Social Insurance Agency and the health insurers, the
  register of financial statements, taking the books over from the former accountant), substitution, indefinite term.
  Beside it: what stands (`poaStateOf`: missing, waiting, checked), how to sign with eID (save as PDF, sign in
  slovensko.sk's D.Signer, an .asice comes out), the upload, the files, and signing on paper. On a phone the side
  comes first (`invoice--side-first`).
- An upload (`POST /app/plna-moc`, in `UPLOADS`, 10 an hour) is what its bytes say (`sniffPaper`): PDF, JPEG, PNG,
  WebP, or an ASiC-E/ASiC-S container ("mimetype" as the ZIP's first entry); R2 `companies/<id>/papers/<file>.<ext>`,
  a row in `company_files` (kind `poa`), the event `poa.added`, and an email to the company's accountant (else to
  ahoj@) with the link to the client's page. A container is downloaded, never shown (`paperResponse`).
- The team: the client's page has "Zmluva a plná moc" (`ContractCard`: when, by whom, which terms, from when; each
  file with "Overená a podaná", which records who checked it, once, and `poa.checked`); the list of clients says
  "Plná moc chýba" or "na overenie", and a client is "done" only with it checked.
- The first steps (`FirstSteps`): the power of attorney, the bank (or a statement), the first document are the three
  that matter; then the notice for a company whose request said it changes accountants, the email forwarding, a
  partner, the phone. They stay until the three are done.
- `/app/prechod`: the notice to the former accountant and the request to hand over the books (`LetterSheet`): the six
  kinds of records to hand over, the revocation of her power of attorney, signed by the director; the form beside it
  fills in to whom, her address, the day of the contract and the last day (in the page's address only, nothing kept).
- The company page has "Zmluva a plná moc": the contract, its start, the terms' version, where the power of attorney
  stands, the notice.
- The sample: Martin's power of attorney (a PDF) checked by Lucia; Eva's not signed, so Ateliér Nova shows the first
  steps and "Plná moc chýba".

## The accountants' side (`src/team/`, views in `src/views/team.tsx`; 13 October 2026, from 17:48)

What Pennylane and Dougs give the accountant, for the work behind the client's app: every client's work counted
on one screen, a document booked on one screen with its original beside the form, the next one a click away.

- Who: `users.team` is 'admin' or 'accountant' (null for a client). The same sign-in by link for everybody;
  somebody of the team without a company lands on /ucto, one who also has a company of their own lands in it and
  has "Účtovníctvo pre tím" in the column (and "Moja firma" on the team side). An accountant sees the companies
  whose `accountant_id` is hers (`canSee`, `visible` in `src/team/store.ts`); the administrator sees all, makes
  clients (/ucto/klienti/novy), reads the requests from the site (/ucto/ziadosti) and adds the team (/ucto/tim,
  an email with the sign-in page goes to the new person). A client at any /ucto address gets a plain "not found"
  page; anything a user may not see answers 404. Every POST is checked like the rest of the site (origin, length).
- Klienti (/ucto): a table with what waits at each client (to book, to check, an unanswered message, payments
  without a document at the client) and four figures above it; a client with nothing waiting has a green tick.
- A client (/ucto/klienti/:id): to book, payments the client marked "no document needed" (OK, or "Vrátiť
  klientovi", which clears the mark and writes to the client with the payment), the messages with a reply box
  (the client is emailed "Firmony: máte novú správu"), payments without a document with "Pripomenúť klientovi"
  (a message listing them, and an email), the company's data (DIČ, IČ DPH, VAT payer, the note for the team; plan
  and accountant for the administrator), its people, and the suppliers' rules. (The monthly CSV "for the
  accountant's program" was removed on 17 October 2026: the books' own files, `dennik.csv` and the rest, are the one
  truth.)
- Booking (/ucto/doklady and /ucto/doklady/:id): the queue of all her clients, oldest first. One screen: the
  original (a photo, or a PDF framed beside the form; a phone gets the link), the form (kind, what it is for as a
  category with its account, supplier, IČO, number, dates typed "11. 10. 2026", amounts, VAT, VS, another account),
  "Odpočítať DPH" for a VAT payer, "Zapamätať pre dodávateľa", and the entry it makes, MD and D, as the books hold
  it (`entryFor` in `src/app/booking.ts`, through `bookingLines` in `src/app/ledger.ts`: a received invoice against
  321, a receipt against the bank account's 221.00x or 261 when it was paid by card, 365 when the owner paid it
  himself, 211 from cash; VAT on 343.100 only when it is deducted; an issued invoice 311 against 602 or 604 and
  343.200). "Zaúčtovať a ďalší" books and opens the client's next document;
  "Uložiť bez zaúčtovania"; "Zahodiť doklad" (a duplicate, or what is no document); a booked one can be changed
  or unbooked, and is never deleted, by the client or the team. The reader proposes the category (`kategoria`);
  a supplier's rule wins over it and is applied at once to the supplier's other waiting documents. The same
  document sent twice (an eKasa receipt by its codes; otherwise the same number and amount, or the same supplier, day
  and amount) is marked "Možný duplikát" and is never paired by itself. An eKasa receipt's code stands under its
  original with "Overiť na finančnej správe". A payment can be given to a document from its best candidates.
- Messages (/ucto/spravy): the clients whose last message is theirs, the longest waiting first. A client's message
  is emailed to the company's accountant, or to ahoj@ while it has none.
- A request from the site becomes a client in one form (`?ziadost=`): company, person, plan, accountant, VAT, and
  a welcome email with a sign-in link valid for `TEAM.welcomeDays` (7) days and the address for forwarding.
- Identifikácia a riziko (/ucto/klienti/:id/aml, `src/views/aml.tsx`): the client's newest declaration in full
  (birth numbers and the document number as given; what deserves a look in red), "Totožnosť a údaje overené"
  (only the newest version, once: `checkDeclarationStatement`, event `declaration.checked`), the risk (nízke,
  štandardné, zvýšené, the declaration's suggestion preselected by `suggestedLevel`: a politically exposed person,
  or cash and partners outside the EU together, is zvýšené; one of them štandardné; a note why; every setting kept
  in `risks`), and the internal reports (`reports`): anybody of the team writes one, every administrator is rung, an
  accountant sees her own and the administrator all, and only the administrator, the designated person, decides
  ("Ohlásené cez goAML" or "Neohlásiť", with reasons, once). The client never sees a report (s. 18). The client
  page has a button to it, the state of the identification, the risk and the open reports; the list flags "Údaje
  chýbajú / na overenie", open reports (red) and "Končí ...", and a client is "done" only with the identification
  checked and no open report. The members' emails are text, not links to write from.
- The sample team: /ucto/ukazka in the playground signs in as the administrator (Christian Juhás),
  `?ako=uctovnicka` as Lucia Horváthová, who keeps Ukážková firma; Jana Kováčová keeps Ateliér Nova s. r. o.
  (Eva Kollárová, with Martin Novák as her partner, so Martin's app shows the switch between the two companies).
  Every sample document has its original, a small PDF made from its own figures (`demoPdf` in `src/app/demo.ts`).
  Martin's declaration (a date of birth, no birth number) is checked by Lucia, risk nízke; Eva has none (her
  overview shows it first, `/app/ukazka?ako=eva` signs her in), and Jana has an open report about Ateliér Nova.
- On a phone the column is a menu in the bar (`BarMenu`): who is signed in, the switch, signing out.
- Not built yet on this side: a log of who changed what on the pages (the events are recorded), assigning many
  clients at once, search in the queue. (The bank's own payments are booked since 14 October: "The books"; every
  client's deadlines are on one screen since the afternoon of 14 October: "Every client's deadlines"; the closing and
  the corporate income tax return since its evening: "The closing".)

### VAT: the return and the control statement (14 October 2026; `src/app/vat.ts`, `vat-summary.ts`, `vat-xml.ts`, `vat-store.ts`, `vat-form.ts`, views in `src/views/vat.tsx` and `taxes.tsx`)

What Pennylane's and Dougs' accountants have: the period worked out from the books, every blocker with the
document to open, the files the tax office takes, and the client told what to pay. Nothing is sent to the
Financial Administration by us: the accountant loads the files in eDane or in the client's internet zone
("Načítať zo súboru"), checks them, signs and sends them under the power of attorney, then marks them as filed here.

- Read on 14 October 2026, and what each rule leans on: the eForm packages DPHv25 (the return for periods from
  1 July 2025, vzor MF/007833/2025-731, with its poučenie and the eForm's own checks, among them `vypocet_r33_C3`:
  row 33 is a positive amount) and KVDPHv25 (the control statement from 1 January 2025; it ends on 1 July 2030);
  their schemas are in `test/xsd` (the KV schema's tabs made two spaces) and every file is validated against them
  in both suites (`xmllint-wasm`). The poučenie of 2021 (mfsr.sk, `Poucenie_DP_DPH_2021.pdf`, points 49 to 52)
  for rows 34, 36 and 37, read in the original with pdf.js; the 2025 form keeps those rows. Statutes in the
  original on static.slov-lex.sk, in the versions in force from 1 January 2027: Act 222/2004 § 78a (the control
  statement; its paragraph 1 has the two cases with no statement, paragraph 12 the corrective and the
  supplementary one) and § 79 (the excess deduction: deducted in the next period, refunded at once under
  paragraph 2), both as in 2026 but for a new paragraph of § 79 on interim measures; Act 563/2009 § 16 (a
  corrective return before the deadline replaces the filed one; a supplementary one by the end of the month after
  the finding, and the tax it adds is due then). The Financial Administration's answers 835490 (when the control
  statement is filed), 082854 (A.1 to a customer without IČ DPH), 165311 (exempt supplies and supplies abroad);
  podnikajte.sk 2026 for the variable symbol (1100MMRRRR, a quarter 11004QRRRR).
- The engine (`vat.ts`, pure): a document's VAT is a mode (domestic, reverse charge, goods from the EU, goods to the
  EU, a service to the EU, export, exempt, outside, none) and lines by rate (23, 19, 5 and 0 %) with base, tax and
  deduction; until the accountant confirms it, it is proposed from the reader or the e-invoice (`proposeVat`).
  The period is the tax day's; goods from the EU fall due on the 15th of the next month; a deduction from a Slovak
  supplier stays in its period when the document came by that period's deadline, else goes to the period it came,
  and never into a period filed before it came (`periodOfDoc`). Deadlines are the 25th, moved past weekends and
  Slovak days off (Easter computed; `isWorkingDay` and `workingDayFrom`, the days off as Act No. 241/1993 Z. z. stands
  after Act No. 261/2025 Z. z., read on slov-lex.sk on 14 October 2026: 1 September is no day off since 2024, 17 November
  none since 1 November 2025, 8 May and 15 September none in 2026 alone). `workOut` gives the rows (01 to 37), the control statement (A.1, B.1, B.2,
  B.3.1 or B.3.2 from 3 000 € deducted from receipts, C.1, C.2, D.2), which documents make each row, and the
  issues: blocking (unbooked, no lines, a rate that is none, another currency without euro amounts, a Slovak
  supplier without IČ DPH, a credit note without the invoice it corrects, a number over 32 characters) and
  warnings (proposed, the recapitulative statement, § 7a cases, before the registration). Row 34 is the excess
  deduction carried from the month before, at most row 32. The control statement is not filed for a nil return
  nor for one of goods to the EU and exports alone without a deduction. A person registered under § 7a files the
  return only for a month with tax (and a month has none only once every document of it is booked: until then it is
  "Treba vyriešiť", not "Nepodáva sa"), no control statement, and does not pay 5 € or less. A company that is not
  registered and buys a service from abroad is told, on its page and on the document, that it must register under
  § 7a first, whatever the amount.
- The files (`vat-xml.ts`): the return as the eForm writes it (every element present, amounts with two decimals,
  the declaration's date DD.MM.YYYY, the representative europio in `opravnenaOsoba`), the control statement in its
  namespace with ISO dates. Kinds R, O, D in both: `rdp`, `odp`, `ddp` with `datumZisteniaDdp`; `Druh` R, O, D,
  and in a supplementary statement only the lines that change, a line taken back with `KOpr="1"` as it was filed
  and a new or right one with `KOpr="2"` (`kvDiff`). The box of § 79(2) (`splneniePodmienok`) is offered for an
  excess deduction of a monthly payer registered 12 months before the month's end, ticked by default, with the
  third condition (no arrears over 1 000 € in six months) for the accountant to confirm.
- A period's state (`vat-store.ts`, `viewOf`): running, blocked, ready, filed, changed after filing (rows or the
  control statement), none (§ 7a with nothing). A payer's period waits until the one before it, of ours, is filed
  (its excess deduction counts here). `planFiling` says what is filed now: ready, the regular return and statement;
  changed before the deadline, a corrective return and statement in their place; after it, a supplementary return
  with rows 36 and 37 (`settle`: the difference against the last result filed; row 37 the same, unless the excess
  deduction filed has been neither refunded nor deducted, which the page asks, inferred from the next month being
  filed or the 30 days of § 79(2) having passed) and a supplementary statement; only the statement when the
  return's rows are as filed (then the client is told nothing). A correction waits while anything of the period
  blocks. The day of finding is asked (between the filing and today) and sets the deadline.
- Stored: the documents' VAT (`vat_mode`, `vat_lines`, `supplied_on`, `party_vat_id`, `corrects`, `vat_period`,
  `foreign_party`), the company's registration (`vat_payer`, `vat_7a`, `vat_quarterly`, `vat_since`, `tax_office`,
  `tax_account`, `vat_carry`: an excess deduction brought from before us, deducted in our first period), and
  `vat_returns`: one row a period with what the Financial Administration knows of it now (the rows sent, the
  statement as `{kind, full, sent}`, the kind, the box, what was carried in, the day of finding, the totals to pay
  and to get back, the due day) and the filing it replaced in `prev`, so that "Zrušiť označenie" takes a
  correction back to it and a first filing away. A correction replaces only the filing it was made against.
  Schema step 3; it never reached a database, and was edited in place that day.
- The team's pages: /ucto/klienti/:id/dph (six periods side by side, the status card first on a phone, what to
  resolve, the rows with their documents, the control statement's parts, one form for the box, the day of finding,
  the files and the mark), the files at `/dph/priznanie.xml` and `/dph/kontrolny-vykaz.xml` (DPH_, DPH_O_, DPH_D_
  and KVDPH_ with the IČ DPH and the period), the booking form's VAT (`vatbox`: mode, day of supply, IČ DPH, the
  invoice corrected, the period, base and tax by rate, where it goes), the client page's VAT card, and the company
  details (registration, period, since, tax office, personal tax account as typed: a base number, the account with
  its six-digit prefix, or the IBAN with its check digits; the excess deduction from before).
- The client: the mark writes to the client in the app (a doorbell by email, nothing of the amount in it): the
  kind filed, what is left to pay (payments with the period's symbol from the bank count), by when, to which account
  (SKxx 8180 500240 and the personal account) and the symbol, or the excess deduction and when it comes back, or an
  overpayment. /app/dane lists every filed period with a PAY by square QR code for what is left (and, since the
  evening of 14 October, every income tax return filed: "The closing"); the overview's deadlines say "Zaplatiť DPH za ..." until it is paid, and the deadlines' lead says that
  we file and the client pays the tax.
- The sample: Ukážková firma is a monthly payer from the month of its contract, with documents of every kind of
  September; `scratchpad/vatflow.mjs` of that session filed it in the playground, and a document moved into
  September afterwards showed the corrective flow (pictures at 1440, 390 and 320 px, nothing overflows).
- The recapitulative statement (súhrnný výkaz; `src/app/vat-summary.ts`, since the evening of 14 October 2026), read
  that day: § 80 of the VAT Act as in force from 1 January 2027 (static.slov-lex.sk), the poučenie to SVDPHv20 (measure
  No. 405/2019 Z. z.) and the eForm form.471 itself (its schema `form.471.sk.xsd`, kept as `test/xsd/svdph2020.xsd`, and
  its script, which shows how it writes the file). Each customer's total by its VAT number, from the issued invoices
  of goods to the EU (`eu_goods`, no code) and of services there (`eu_service`, code 2), in the period the return counts
  them (`taxDay`, independently of the VAT period; goods by § 19(8)), a credit
  note in its own period (§ 80(7)), whole euros half up, the total of the first page the sum of the rows; the payer's
  periods are independent of the VAT return. A quarterly payer gets three monthly SVs when the goods limit in the
  current or preceding four quarters requires them; § 7a stays quarterly. Earlier months of a transition share the
  crossing month's deadline. The VAT return remains quarterly. Existing monthly marks keep a monthly sequence.
  A filed quarter can be explicitly reclassified to its last month (FR SR methodology example 18), preserving
  original XML and history before the last-month correction. Blocked by an invoice not booked
  or unread, a customer without a VAT number of another member state (`svVatId`), lines missing, and the company's own
  VAT number or seat (not its tax office: the form names none). States: none, running, blocked, ready, filed, changed.
  Its card on the VAT page (`#suhrnny`: the rows with their invoices, the total, the file `/dph/suhrnny-vykaz.xml`, the
  mark `/dph/suhrnny-vykaz/podane`, taken back by `/dph/suhrnny-vykaz/zrusit`; the client is told nothing, no money is
  in it); the file as the eForm writes it (the month without its nought, the quarter I to IV, 1 and 0, the name in four
  lines, europio as the authorised person, twelve rows of part I and twelve empty rows of part II a page). Kept in
  `filings` (kind `sv`, JSON includes rows, the prior filing and exact XML/hash). Schema step 13 keeps old
  values in `filing_history` on correction, unmarking or reclassification; export and purge include it. Changed after
  filing: a corrective statement with every row before the deadline, a supplementary one after it with only the rows
  that change (§ 80(8): the right value; nought for a row that is no more; the code 0 for a row whose code was 1, or 2
  while the customer stays under another, the poučenie's examples 10 to 14), which § 80(8) gives no deadline (the screen
  lists it for today). Not built: triangular trade (code 1), goods moved to another member state of one's own (§ 43(4)),
  call-off stock (part II), a customer's VAT number
  that comes later (§ 80(6), the period it is given).
- Imports (since 18 October 2026; read in the poučenie to DPHv25, points 30a, 30b, 38, 38a, and FR SR's information
  8/DPH/2025/IM on § 84a): the booking form's received modes "Dovoz tovaru, DPH zaplatená colnému úradu" (`import`: the
  customs declaration confirmed by the customs office, the base the customs value with duty, its VAT deducted in rows 18
  to 19 and, of them, 22, 22a and 23; deducted when the document came by the deadline, as an invoice; booked as a Slovak
  supplier's, the VAT inside the document's total, the duty the cost) and "Dovoz tovaru, DPH v priznaní (§ 84a, status
  AEO)" (`import84a`: in the period the customs declaration was accepted, rows 11c to 11e and 12c to 12e, row 13 for an
  exempt import, corrections in 24 and 25 with the deduction's in 28, deducted in 18 to 19 and 23a to 23c; booked as a
  purchase from abroad, its VAT both owed and deducted). Neither goes into the control statement (§ 78a asks for none),
  and a return whose only content is VAT deducted on imports needs no control statement (KVDPH's instructions of 2021),
  nor one of goods supplied under § 43 or § 47 with VAT deducted on imports alone (§ 78a(1)(b), and § 84a for the
  importer's own VAT, both read in the original on static.slov-lex.sk through the browser pane on 18 October 2026, the
  version of 1 January 2026: § 84a(2)(b) also takes an importer in centralised clearance registered under § 5).
  The payment to the customs office comes from the State Treasury (8180) and is taken as the state's: the accountant gives
  it the customs document's account. Not built: proposing an import by itself (the supplier's invoice from outside the
  EU is still proposed as a service from abroad: the accountant sets it "Bez DPH" and the customs declaration "Dovoz").
- Not built: triangular trade, bad debts (§ 25a, § 53b), the coefficient (§ 50), documents in another
  currency without their euro amounts, a request to refund an overpayment, interest or a penalty on a supplementary
  return, a switch between monthly and quarterly periods, filing through an interface of the Financial
  Administration. To see on the first real filing: that eDane opens the files as they are, and what the form wants
  in `opravnenaOsoba` (europio s. r. o., with its phone and email, is written today).

### The books (14 October 2026; `src/app/ledger.ts`, `src/app/ledger-store.ts`, views in `src/views/ledger.tsx`)

His word of 10:53, "do toho ale nevybudujeme si vsetko svoje?": the books are ours, not a certified program's
(Pohoda, Omega), and the export to one is no longer planned. What an accountant keeps for an s. r. o. in double
entry (Act No. 431/2002 Z. z.): the journal, the general ledger, the trial balance, the open items, the bank against
the books; worked out from what the app holds, never typed twice.

- Nothing of the books is stored as entries (`buildBooks`, pure). Each entry is worked out every time from what
  stands behind it, so it cannot drift from it:
  - a booked document: the entry of `entryFor` with the VAT the return counts (deducted: the lines' `deduct`; owed:
    the lines' VAT; what the company pays itself on a purchase from abroad, deducted or part of the cost) on 343.100
    (deducted) and 343.200 (owed), on its day of supply, else of issue, else the day it came. A credit note (a
    corrective document whose lines are minus) books the other way. An invoice the owner paid himself is also owed
    to him (321 against 365); a receipt nobody paid by bank or himself is paid from the cash box (211).
  - a payment, on the day the bank booked it, against its bank account's analytic account (221.001; given once in
    `accounts.ledger` and never renumbered, `NEXT_BANK_LEDGER` in `src/db.ts`): an invoice paid (321) or paid to us
    (311); a receipt paid by card against the bank itself when the payment is its alone, to the cent and in its
    month (the entry then stands on the bank's day), otherwise through money in transit, 261 (`receiptContra`).
    Several documents on one payment: each its own amount, the last what is left. A payment is booked once its
    documents are.
  - a payment without a document: the account the accountant gave it (`payments.contra`, never 221), else its
    reason's (`reasonAccount`: a bank fee 568, interest 662, between own accounts 261, VAT to or from the tax office
    343.300 by its symbol 1100… when the money went to VAT's account (prefix 500240) or the bank did not say where,
    the income tax and its advances 341 when it went to the income tax's (500224: an advance's symbol is 1100… too)
    or by the year's own symbol 170099…, capital paid in 353 when its note says "imani", otherwise 365, wages paid
    331, and of a payroll month closed the sum due to the Social Insurance Agency 336.100, to a health insurer
    336.200, to the tax office 342 (also by its prefix 500259), whether the client marked it payroll or the app took it
    for the state's; `treasuryTax` reads the prefix from the other side's IBAN, `payments.party_iban`). A tax other
    than these, insurance or anything else waits for her account.
  - a payroll month closed (`payroll_runs`, "Payroll"), on its last day: the wages 521 against 331, the employee's
    insurance from 331 to 336.100 and 336.200, the tax withheld less the bonuses from 331 to 342 (the other way when the
    bonuses are more), the employer's insurance 524 against 336.100 and 336.200.
  - a VAT return marked as filed settles its period on its last day: what is owed (rows 17 and 25) from 343.200 and
    what is deducted (rows 18, 18a and 19, less row 28) from 343.100 to 343.300, the account with the tax office,
    which the tax paid clears. A corrective return settles in place of the regular one; a supplementary one by its
    difference, on the day it was filed (`filingChain` reads the filings back through `prev`). An excess deduction
    carried needs no entry: it stays on 343.300.
  - the accountant's internal documents and the opening balances are stored (`ledger_entries`, schema step 4).
    An internal document is numbered `ID-2027-001` in the same statement that writes it and is removed only by a
    mark, so a number is never given twice. The opening balances are one entry against 701, both sides equal,
    written anew as a whole.
- The books start on the opening balances' day, else the contract's first day (`start_on`). Documents and payments
  before it are left out and counted on the page: they belong to the accountant before us, or into the opening.
- A year opens with the balance-sheet accounts (classes 0 to 4) as the year before closed them and the results of
  the years before on 431, until the accountant distributes them by an internal document; costs, revenues and the
  closing accounts start from nothing (`yearOpening`). The opening balances count as the opening (PS), not as turnover.
- An account is three digits and, after a full stop, its analytic number as typed (`canonicalAccount`: 518,
  518.001; "518001" is 518.001), classes 0 to 7. `CHART` names the synthetic accounts of the Slovak chart (rámcová
  účtová osnova) a young company uses; 343.100, 343.200 and 343.300 are ours, a bank account is named by its IBAN.
- The team's pages, `/ucto/klienti/:id/kniha`: Predvaha (what keeps the books from being whole, each with the way
  to it: documents to book, payments that need an account, payments waiting for their documents, payments the
  client has no document for, another currency, the cash box in minus, money in transit, before the start; the
  result of the year so far; each bank account against the books on the day the bank last said its balance, with
  what is not booked yet and what is left, usually the opening balance not written in yet; the trial balance by
  class, analytic accounts under their synthetic one, a balance with its side MD or D, from January to a chosen
  month), Denník (a month's entries; each account a link), an account's movements (`/kniha/ucet/:account`, the
  balance after each line), Saldokonto (the open invoices of 311 and 321 with the days past due, and what is on the
  account without an invoice), Platby bez dokladu (each with its account, proposed or hers, and a field to give
  another), Interné doklady, Počiatočné stavy. Files for Slovak Excel: `dennik.csv`, `hlavna-kniha.csv`,
  `predvaha.csv`, `saldokonto.csv`; the same in the client's yearly ZIP under `uctovnictvo/`.
- The booking form shows a document's entry as the books hold it (`bookingLines`: 343.100, the bank's analytic
  account or 261); after a mistake in the form, the entry of the form's own figures. The client page has the books
  in short (the result of the year so far, how many things wait, "Otvoriť knihu"); its jump bar links them.
- Events: `ledger.contra`, `ledger.internal`, `ledger.removed`, `ledger.opening`. The deletion at the end of a
  contract deletes `ledger_entries` with the rest (the client took the books along in its download).
- The sample company: opening balances on its first day (the capital subscribed and not paid in, 353 against 411),
  the administrative fee given 538 by Lucia, a receipt the owner paid, and a bank balance (6 718,93 €) the books
  agree with once the three payments without a document are counted.
- Not built: depreciation and asset cards (an asset bought goes to 042; putting it to use and depreciating it is an
  internal document for now), the closing entries (the statements are
  worked out without them: "The closing"), another currency than the euro, a cash book of its own (since 18 October 2026: "The cash box"), a log of each change of a
  booked document beyond the events.

### Every client's deadlines (14 October 2026, from 15:17; `src/team/deadlines.ts`, `deadlines-store.ts`, views in `src/views/deadlines.tsx`)

What Pennylane's cockpit gives the accountant: every client's deadlines on one screen, each with where it stands and
the place it is done. Nothing of it is stored but the marks of what the app does not file itself: every deadline is
worked out from what the app holds every time, so it cannot disagree with the VAT page, the payments or the contract.

- What is listed, and what each leans on (`deadlinesOf`, pure; the rule is at the top of the file): the VAT return and
  the control statement of a period, with the VAT page's own state (`viewOf`: ready, blocked with how many things keep
  it back, running, filed) and deadline; a payer's period of ours older than the four months worked out and never filed,
  overdue as it is ("Obdobie sme neprepočítali"); a period filed and changed since, a corrective return before its
  deadline or a supplementary one after it by the end of the month after today (§ 16 of the Tax Procedure Code, until
  the accountant names the day of finding); the recapitulative statement of a period with goods or services supplied
  to another member state (§ 80 of the VAT Act, within 25 days after the period: the payer's period, the calendar
  quarter of a person registered under § 7a; read in the Financial Directorate's methodical guidance to § 80 and
  dauc.sk), in the state of its card on the VAT page (`svViewOf`), a correction as for the return (a supplementary
  statement for today: § 80(8) names no deadline); the VAT a filed return asks the client
  to pay, until the bank shows it paid; the client's documents of a month by the 10th, while payments of it have none
  and the intake is open; the closing and the corporate income tax return of the year that ended last, by 31 March or
  the end of the month a notice moved it to, the next working day if that is a day off (§ 49(1) and (3) of the Income
  Tax Act; `closingDue`), only when the books were ours at the year's end and the contract did not end in it (points
  5.2 and 10.4 of the terms), done once its page marks it filed (`closings`); the income tax a filed closing asks the
  client to pay (`taxPay`, the client's), until the bank shows it paid with the year's symbol; a month's payroll
  (`payroll`, the last three months with somebody employed), closed by its payday (a day off moves it on), and once
  closed its reports (`payrollReports`: the Social Insurance Agency's by the payday, the health insurers' within three
  days, the tax office's overview by the end of the next month; marked as filed, kind `mz`); the handover at the end
  of a contract, within its thirty days.
- Which VAT periods are worked out (`vatWindow`): those that ended in the last four months (a quarterly payer's last two
  quarters), none before our first period (`firstPeriod`) nor after the contract's last month. What still runs is shown
  once its deadline is 45 days near (`DEADLINES.aheadDays`); what can be done now always (a supplementary return may be
  due in two months); what was done for 45 days (`doneDays`), when asked for.
- The screen (`/ucto/terminy`, "Termíny" second in the column and the tabs; the administrator's sixth place, Tím, goes
  to the bar's menu on a phone): four figures (overdue, within a week, ready to be filed, the client's), filters by whose
  it is (`?kto=my|klient`), done ones on demand (`?hotove=1`), the administrator's choice of an accountant
  (`?uctovnicka=<id>|none`; an accountant sees her own whatever the address says); the groups Po termíne, Do 7 dní, Do
  mesiaca, Neskôr, Hotové; each row the day (red when late, with how many days), what it is, the client, whose, the
  accountant (for the administrator), its state as a pill and the link where it is done (the period on the VAT page,
  the client's missing documents, the closing's page, the handover). The client's page has its own as "Termíny" in the side
  column (open ones), with the jump bar's link.
- Loaded in a fixed number of queries whatever the number of clients (`teamDeadlines`): the companies, the returns
  filed, the VAT paid by symbol, the payments without a document by month, the marks and the closings with the income
  tax paid towards each, each one statement over the
  companies the user sees (no list of ids: D1 binds at most 100 values), and the documents of each VAT company's periods
  worked out, forty companies in one batch (a batch is one call to D1, read on 14 October 2026). At hundreds of clients
  it reads every VAT company's last four months: measure it on the first real month.
- The marks (`filings`, schema step 6: company, kind, period, day, who; once): "Označiť ako podané" and "Zrušiť
  označenie" on the row (`POST /ucto/klienti/:id/podane`, a month's payroll reports (`mz`) of a month that has ended,
  events `filing.marked` and `filing.unmarked`; the way back only to the screen or a client's page). The
  recapitulative statement (`sv`) is marked on the VAT page with what was filed (schema step 10, `filings.data`) since
  the evening of 14 October; its row on the screen leads there.
  The closing's mark moved to its own page and table on the evening of 14 October (schema step 7 moves any it finds).
  The deletion at the end of a contract deletes them with the rest.
- Checked: 32 rules taken out once (`scripts/dev/mutate.mjs`), every one held (one after its check was added). Not
  built: the payroll reports as files, the deadline of the motor vehicle tax and of each advance on the income tax
  (the closing says the advances' amount).

### The closing (14 October 2026, from 16:03; `src/app/closing.ts`, `closing-form.ts`, `closing-xml.ts`, `closing-store.ts`, views in `src/views/closing.tsx`)

What an online firm's accountant does once a year for an s. r. o.: the financial statements of a micro entity and the
corporate income tax return, worked out from the books, every row traceable, filed as the official eForms take them,
and the client told what to pay. As with VAT, nothing is sent by us: the accountant loads the files in eDane
("Načítať zo súboru"), attaches the notes, signs and sends them, then marks the closing filed here.

- Read on 14 October 2026, and what each rule leans on (the full list at the top of `closing.ts`): the eForm packages
  DPPOv25 (form.622: the return for periods of 2025, its poučenie MF/012187/2025-721 and the eForm's own formulas,
  among them rows 150 and 250 computed from Table B) and UZMUJv14 (form.301: Súvaha Úč MUJ 1-01, rows 01 to 45, and
  Výkaz ziskov a strát Úč MUJ 2-01, rows 01 to 38, each row with the accounts the form names beside it), downloaded
  from pfseform.financnasprava.sk; their schemas are in `test/xsd` (`dppo2025.xsd`, `uzmuj2014.xsd`) and every file is
  validated against them in both suites. Act No. 595/2003 Z. z.: § 15(b) the rate (from 2025: 10 % up to 100 000 € of
  taxable revenues, 21 %, 24 % above 5 000 000 €; 2024: 15 % up to 60 000 €), § 2(w) the micro-taxpayer (60 000 €),
  § 30 the losses (five periods; half of the base, the whole of it for a micro-taxpayer's losses of periods from 2021),
  § 46b the minimum tax (340, 960, 1 920, 3 840 €, 11 520 € above 5 000 000 € from 2026; half under (3), a share of a
  shorter period under (6), none in a company's first period under (7), the excess credited in three periods under
  (5)), § 42 the advances (quarterly above 5 000 € of row 1110, monthly above 16 600 €), § 49(1) and (3) the deadline
  and its extension by notice (the end of a month, three months on, six with income from abroad; the tax is due then),
  § 49(11) the statements filed by the same deadline. The Financial Directorate's information 7/PO/2026/IM: the tax is
  paid to the account with prefix 500224 and the personal tax account (OÚD), symbol 1700992025 (170099 and the year);
  an advance 1100MMRRRR, 11004QRRRR or 110000RRRR to the same account; row 1100 is nought, and nothing is paid, up to
  5 €. Interest on a current account taxed by withholding goes to row 210 and stays in row 560.
- The statements (`statementsOf`, pure): every account's balance at the year's end (`closingBalances`: the opening,
  the year's entries, the years before's costs and revenues as 431), each placed in its row by the longest prefix the
  form lists (`placeOf`): a receivable or a liability by its side (31x, 32x, 33x, 34x, 35x to 39x, 22x: a bank account
  in overdraft is a loan, row 44, each bank account by itself), 431 with the results of the years before (row 32),
  353 as a minus in row 28; a cost or a revenue by its synthetic account (`profitRowOf`), the income tax 591 and 595 in
  row 36. The sums are the form's formulas; row 33 is what makes the balance sheet balance. In whole euros each row is
  rounded and the sums made again; when the results of the two statements would part by the rounding, the difference
  goes into row 22 and the page says so. An account the form has no row for is listed (`unplaced`) and keeps the
  closing back.
- The return (`taxOf`, pure; every row of the form from 100 to 1110 in its order): row 100 the result before tax (the
  profit and loss account's row 35); Table A (rows 1 to 16, sum row 130); Table B (the books' and the tax's
  depreciation, row 6 its formula, the difference into row 150 or 250, as the eForm computes them); the rows typed
  (110, 140, 170, 180, 210, 230, 260 to 290); Table D, the losses of five periods, the oldest first, within the cap,
  as much as the accountant deducts (`lossDeduct`, null for all); the rate by row 560; the minimum tax; Table K, the
  minimum tax of three periods credited on the tax above the minimum; the advances (1010) and the tax withheld that
  counts as one (1030); row 1100 or the overpayment of row 1101; row 1110 and the advances it brings. Not built: the
  relief rows, the special tax bases (§ 17f, § 51e), the patent box (§ 13a, § 13b; row 240), rows 220 (no company
  founded for business has it), 302 to 308, 320, 330, the share for a recipient under § 50 (left as the client's,
  `c7paragraf50` 1), a request to refund the overpayment, a non-micro company's statements (Úč POD), deferred tax.
- What the books propose (`proposeTax`) and the accountant sets (`taxInputOf`, `closing-form.ts`): the taxable
  revenues are every revenue of class 6 (she lowers them by what is not subject to tax or exempt); representation 513
  is Table A's row 6 and gifts 543 its row 8; interest 662 row 210; the depreciation of 551 Table B's rows 1 and 2
  alike (nothing is added back until she says the tax depreciation differs); the micro-taxpayer follows row 560; a
  period that begins after 1 January is a first one, which pays no minimum tax and counts its months; the advances are
  what the bank shows paid to the income tax's account with a symbol of the year (`incomePaid`: by the account's
  prefix, since VAT's symbol is the same). She may set every one: what equals the proposal is not stored, so it keeps
  following the books. Stored (`closings.inputs`, JSON, each value checked again on reading by `storedInputs`): Table
  A, Table B, the typed rows, row 560, the micro-taxpayer, the losses (year among the five before, amount, used
  before), how much to deduct, the period's first day, the minimum tax's exemption and halving, the minimum taxes to
  credit (three years), the advances, the tax withheld, SK NACE ("62.01.0", the format checked, not the list), the
  activity in words, the day the statements were approved (after the year). The activity of the last year that has
  one is offered for the next.
- What keeps a closing back (`closingIssues`): documents of the year, or of no day yet, not booked or making no entry
  (`Books.docDays`); the year's payments not in the books (without a document, waiting for one, to be classified: the
  bank's balance would not be the statement's) or in another currency; cash below nought; an account without a row; the
  company's DIČ, seat and activity, which both forms ask for; the tax not booked as computed (once the year has ended).
  To look at: money in transit (261) at the year's end, the rounding put in row 22. A year that runs is worked out
  ahead (the tax it heads to), its files and mark come after its end.
- The page (`/ucto/klienti/:id/zavierka?rok=`; the client page's books card and every closing on the screen of
  deadlines lead there): the last five years of the books side by side with their states (Rok beží, Treba vyriešiť,
  Pripravené, Podané, Nepodané), last year first when it is ours; what to resolve, each with the way to it; the
  return's rows that hold anything; the statements in whole euros with the year before when the books hold it (else
  the page says to fill it in eDane from the former accountant's statements); the adjustments (the seldom parts folded
  unless they hold something, "z kníh" beside a proposal); and the side card: the deadline (red once it has passed),
  the result, the tax, what to pay, the micro-taxpayer, "Zaúčtovať daň" (`POST /zavierka/dan`: an internal document on
  31 December, 591 against 341, the whole of row 1050, in place of the one this button booked before; the advances
  were booked to 341 when paid), the files (`/zavierka/priznanie.xml`, `DPPO_<DIČ>_<year>.xml`; `/zavierka/zavierka.xml`,
  `UZMUJ_<IČO>_<year>.xml`; only when nothing keeps it back), the note that the notes are the accountant's (a PDF in
  eDane), "Označiť ako podané" and "Zrušiť označenie", and a card for the deadline a notice moved (`POST
  /zavierka/lehota`, the six ends of month). Events: `closing.saved`, `closing.tax`, `closing.return.downloaded`,
  `closing.statements.downloaded`, `closing.extended`, `closing.filed`, `closing.unfiled`.
- Stored (`closings`, schema step 7, one row a company's year): the inputs, who saved them, the deadline a notice
  moved, the tax's internal document, and once filed the day, who, what was filed (the return's rows, the statements
  in whole euros, the advances it brings), the tax it asked to pay (row 1100) and by when. Nothing is changed once it
  is filed but by taking the mark back; a filed year whose books changed since says which rows did and that a
  supplementary return (§ 16 of the Tax Procedure Code) and a correction of the statements are to be considered.
  The deletion at the end of a contract deletes the closings with the rest.
- The client: the mark writes to the client in the app (a doorbell by email): what is left to pay (payments with the
  year's symbol count), by when, to which account (SKxx 8180 500224 and the personal account) and the symbol, or the
  overpayment left on the personal tax account, and the advances the next period brings. /app/dane lists every filed
  year first ("Daň z príjmov za rok …") with the PAY by square QR code for what is left; the screen of deadlines has
  "Úhrada dane z príjmov za rok …" as the client's until the bank shows it paid.
- In the playground the sample companies' books start this year, so `/ucto/klienti/demo-company/zavierka` shows the
  year that runs; a past year needs its entries (the e2e test's "Závierková s. r. o." is one).
- To see on the first real filing: that eDane opens both files as they are (a DPPOv26 for 2026 is published in January
  2027: its schema replaces `dppo2025.xsd`, and the first Firmony closings are for 2027), what eDane wants in
  `opravnenaOsoba` (europio's representative, as for VAT), and whether the SK NACE list of DPPOv26 is still Rev. 2.

### Payroll (14 October 2026, from 17:22; `src/app/payroll.ts`, `payroll-store.ts`, views in `src/views/payroll.tsx`)

What the accountant of an online firm does each month for a young company's first employees: the payslips, what the
company pays and where, the books, and the reports to file. Built for employees in an employment relationship with a
monthly wage; nothing is sent to the insurers or the tax office by us.

- Read on 14 October 2026 (the full list at the top of `payroll.ts`): the Social Insurance Agency's tables from
  1 January 2026 (rates; the cap 16 764 € a month, 11 times the average wage of two years before; the base and each
  amount rounded down, each kind on its own) and its notice that the general assessment base of 2025 is 19 440 €
  (average 1 620 €: the cap of 2027 is 17 820 €); VšZP and Dôvera (health 5 % and 11 % in 2026 and 2027, halved with a
  disability, rounded down, the minimum advance 45,45 € in 2026, the deductible item below 570 €, the advance due on
  the payday and its report within three days); the Financial Directorate's pages on the advance (the bands from 2026,
  19, 25, 30 and 35 % at 154,8, 212,4 and 264 times the subsistence minimum, a twelfth a month: 3 665,28 €, 5 029,10 €,
  6 250,86 € in 2026), the child bonus of 2026 (100 € to the month a child turns 15, 50 € to 18, 29 to 64 % of the base,
  a tenth of the base above 1,5 times the average wage off each child), rounding since 2020 (mathematical, § 47), the
  remittance (within five days of the payout to 500259 and the personal tax account, symbol 1100 and the month) and
  the overview (prehľad, by the end of the next month); the subsistence minimum of 1 July 2026 (295,22 €) for 2027's
  non-taxable part (6 199,62 €, 516,64 € a month) and bands.
- The engine (`payslip`, pure): the gross the accountant gives for the month (the wage, offered; a share of it for part
  of a month), each kind of social insurance of each side, health with the deductible item and the minimum topped up
  (by the days employed; an exception declared skips it), the partial base, the non-taxable part with the signed
  declaration, the advance by the bands rounded once, the bonus per child, what is withheld (minus: the bonus paid out
  with the wage), the net, the employer's cost. `PAYROLL_YEARS` holds 2026 and 2027; a later year uses 2027's until
  its figures are added. Checked against published figures: SuperFaktúra's 1 500 € with a daughter (1 234,51 €),
  Bezúčto's minimum wage of 2027 (772,11 € net, 1 323,85 € the employer's cost), the Agency's capped amounts,
  Peniaze.sk's low wage with two children (141,75 € of bonus), KROS's 3 000 € with two (71,80 € and 21,80 €).
- Stored (schema step 8): `employees` (name, birth day, insurer 24/25/27, start and end, monthly wage, the
  declaration, a disability, the deductible item claimed, an exception from the minimum health advance, children for
  the bonus, the IBAN for the net wage), `payroll_runs` (a company's month: the incomes typed and the payday while it
  is open; once closed, each line with its payslip and days as they were, who closed it and when), `companies.payroll`
  (the payday of the month, the Social Insurance Agency's account and the employer's number, each insurer's account
  and number). The deletion at the end of a contract deletes them with the rest.
- The page (`/ucto/klienti/:id/mzdy?obdobie=`; the client page's books card leads there): the last six months with
  their states, the month's table (each employee's income to type, the insurance, the tax after the bonus, the net,
  the cost, a breakdown and the payslip to print, `/mzdy/paska`), the payday, "Prepočítať a uložiť" and "Uzavrieť
  mesiac" (only after the month: the payslips kept, booked, and the client's message), "Otvoriť mesiac znova" (the
  client told that it does not stand), what to pay and where (each employee's net to their account, the Social
  Insurance Agency, each insurer, the tax office), the employees (`/mzdy/zamestnanec`), the settings. Events:
  `payroll.saved`, `payroll.closed`, `payroll.reopened`, `payroll.settings`, `employee.added`, `employee.changed`.
- Since 17 October 2026 (item 8 of "Start here"): agreements, a director's remuneration, pensioners and students,
  sick pay, holiday, obstacles, overtime and surcharges worked out by the app, the annual settlement, and the reports
  of every relationship. Not built: wage deductions (exekúcie), seasonal work, a collective
  agreement's rates, the annual report's eForm file (its figures are on the settlement page), the § 33a bonus on
  mortgage interest. The client is told in a message, not yet with QR codes on its Dane page.
- Meals of employees (built 18 October 2026, schema step 58 `employees.meal_way`; `src/app/meals.ts`). Read in the
  original on static.slov-lex.sk through the browser pane, the version of 1 January 2026: § 152 of the Labour Code (a
  meal a shift over four hours; the employer pays at least 55 % of the meal's price and at most 55 % of the meal
  allowance of a trip of 5 to 12 hours, rounded up to the cent; a voucher worth at least 75 % of that allowance; the
  employee chooses vouchers or the financial contribution for 12 months; the financial contribution is the employer's
  contribution, at least 55 % of the least voucher; the social fund adds) and § 5(7)(b), § 19(2)(c)(5) of the Income
  Tax Act (exempt, the employer's expense). With the allowance of 9,30 € (trips.ts, from 1 December 2025): a voucher at
  least 6,98 €, the employer at most 5,12 € a meal, the financial contribution at least 3,84 € (`mealBounds`). The
  payroll settings (`companies.payroll.meals`) take the company's way (none, vouchers, the financial contribution), a
  voucher's value, the employer's and the social fund's contribution a meal, refused outside the bounds of today
  (`mealIssues`); the employee form takes his own choice ("Ako firma", vouchers, the contribution, none), vouchers only
  where the company has a voucher's value (`mealWayOf`). The month's parts of an employment have "Jedlá (stravovanie),
  počet", proposed as the hours worked divided by the working day when it is over four hours (`mealsProposed`), a whole
  number up to 62 typed. The slip: neither taxed nor insured; with vouchers the employee's part (value less the
  employer's and the fund's) comes off the net, with the contribution the employer's and the fund's parts are paid with
  it; the employer's part is in the cost of work. The books (the month's entry): the employer's part 527, the fund's
  472, against 213 for vouchers (with the employee's part from 331) or 331 for the contribution. Not built: a canteen of
  the company's or meals bought from another (documents), the social fund's own creation (Act No. 152/1994 Z. z., an
  internal document 527/472), meals of agreements, a day of a business trip with its allowance (the count is typed),
  vouchers bought (the supplier's invoice to 213 by the booking form's own account, its fee to 518).
  test/meals.runtime.mjs, units "Meals of employees".
  Mended after a seventh independent review (18 October 2026, of commit 3b8f608; each finding verified first): the tax
  office's overview (PREHLAD) refused every month with meals, since its check of a slip's net knew nothing of them (now
  less the vouchers' part, plus the contribution); the employer's least is 55 % of the voucher "najviac však" his most
  (`employerLeast`: a voucher of 10 € asks 5,12 €, before no figure passed); overtime is no second shift (the proposal
  leaves the overtime hours out); a net below nought keeps the month back (`monthIssues` 'negative'); a month is closed
  only while the meal settings meet the bounds of its last day (else "mzdy-stravne"); the meals field shows only for who
  takes meals; the month's table says what the meals did to each net and the handover's `pasky.csv` has their two
  columns; the client's message says how many vouchers of what value to hand out to whom. The social fund's creation
  (above) answers the finding that 472 was only ever debited.
- The social fund's mandatory allocation (built 18 October 2026, `src/app/social-fund.ts`; no schema step: the rate in
  `companies.payroll.fundRate`, each closed line's allocation in its `fund`). Read on static.slov-lex.sk by WebFetch,
  Act No. 152/1994 Z. z. as of 1 January 2025 (the latest version the register shows): § 3(1)(a) 0,6 % to 1 % of the
  base, § 3(2) up to 1 % for an employer with a profit as it says, else 0,6 %; § 4(1) the base is the gross wages
  (footnote: § 118(2) of the Labour Code) accounted for payment; § 6(2) created by the payday; § 6(3) settled by
  31 January. What a wage is (podnikajte.sk 25 September 2023, Mzdové centrum 16 September 2019): no wage compensation
  (holiday, obstacles), no sick pay, no reward of an agreement, no remuneration of a director, so a line's base is its
  `MonthPay.earned` of an employment (`fundOf`, rounded to the cent). The payroll settings take the rate ("Sociálny fond:
  povinný prídel, %", empty 0,6 %, 0,6 to 1 % allowed); the month says the allocation; the month's entry books it 527
  against 472. Not built: the further allocation of § 3(1)(b) (collective agreement, travel), a profit's allocation
  (§ 4(3)), the transfer to the fund's own account, the yearly settlement beyond the months' sums.

## Firmony for investors (14 October 2026; `src/views/investors.tsx`, `INVESTORS` in `src/config.ts`, `copy.investors`)

His word of 12:48: a tax return for people who invest through a broker, clicked through by themselves or done by us,
under the same brand, to be shared by investors with an audience ("keď to používaš ako investor a si s tým spokojný,
založíš si raz firmu, pôjdeš k nám"). He was told yes, as the way in, after the bank; the return itself is ready in
December, and until then the page collects the people who want it. Nothing of the return is built yet.

- The page /investori (in the header's menu and the footer; in the sitemap; for search engines): the site's own
  parts (the panel of light with the card over its edge, his glass in tiles, the sheet of two ways, the questions,
  the closing panel). The header's button is "Zapísať sa" and leads to the form on the page (`ctaHref`, `ctaText`
  of `PageMeta`). Sections: the opening with the e-mail card, the brokers (XTB, Trading 212, Interactive Brokers,
  Revolut), three steps, six rules it counts, the two ways with their prices, the bridge to the firms' accounting,
  six questions, and the closing form, which also asks for the brokers (chips) and the way.
- The prices are the builder's proposal, **not his decision**: Sám 29 € for one broker, 49 € for every broker, Za Vás
  89 € (`INVESTORS.prices`), "Ceny sú konečné, DPH sa k nim nepripočítava." Ask him before the return is sold.
- A sign-up (`POST /investori`): an e-mail, the brokers we know (anything else is dropped), the way (`sam`, `za-mna`)
  and the campaign tags; `investor_requests`, schema step 23 (it was 6 on its own branch), one row an address in small letters
  (`upsertInvestorStatement`): its last way counts, its brokers stay when a later sign-up names none, and a year
  runs from the last sign-up (`purge`). Six an hour from one connection; a field nobody sees catches bots; a wrong
  address is said at the form it was typed in, which keeps what was ticked (`forma=zapis`). A confirmation goes to
  the address at most twice a day (the same counter as a request's), keyed by the second it was asked in (a double
  click is one e-mail), with nothing that was typed and the way to be forgotten ("odpíšte na tento e-mail a adresu
  vymažeme"; it replies to ahoj@). Nobody of the team is rung: the administrator sees them on /ucto/ziadosti
  ("Investori", the newest 200 and how many there are); an accountant and a client get 404 there. The privacy notice
  names what is kept, why and how long (`PRIVACY_VERSION` 2026-10-14). The sample has three in the playground.
- What the page says, and where it was read (14 October 2026, through search and the summarising tool; **no statute
  was read in the original**: the shell does not reach slov-lex and the browser pane was not connected):
  - Shares and ETFs admitted to a regulated market (or a similar one abroad), held more than a year and not business
    property, are exempt (§ 9 ods. 1 písm. k); the Financial Administration's answer 798719). A gain within the year
    is taxed with the rest of the base at 19, 25, 30 and 35 % (boundaries 43 983,32, 60 349,21 and 75 010,32 € for
    2026; answer 081400 and podnikajte.sk's numbers for 2026), after the 500 € exemption of § 9 ods. 1 písm. i):
    a gain after expenses up to 500 € is exempt and not reported, above it only the rest is taxed (answers 798719 and
    575795; the 500 € is shared with the other incomes of § 8 it covers). The sales of one year are summed (the
    purchase price and the costs of buying and selling are the expenses); a net loss counts for nothing ("Pri
    príjmoch z predaja cenných papierov nie je možné vykázať stratu", 575795).
  - Dividends from abroad: 7 % for profits of 2017 to 2023 and from 2025, 10 % for profits of 2024, 35 % from a
    non-cooperating state; tax withheld abroad is credited up to what the treaty allows, so nothing is paid when more
    than 7 % was withheld; they go into Príloha 2 of DPFO typ B (answer 830591; Tatra banka's page). Payouts of a
    distributing ETF are capital income at 19 %, not dividends; interest from abroad (§ 7) 19 % (081400; Tatra banka).
  - Health insurance on a gain that is taxed: 16 % from 1 January 2026 to 31 December 2027; none on what is exempt,
    on dividends or on interest (Tatra banka, "Zdaňovanie príjmov z investovania", state of 1 June 2026, updated
    13 October 2026). The page says only that it is paid and that we say how much.
  - The return for 2026 is due on 31 March 2027; with income from abroad it can be moved to 30 September 2027 by a
    notice given by 31 March (podnikajte.sk). A return is due when taxable income exceeds 2 983,37 €.
  - Crypto: not claimed (its rules were not settled in what was read); the page says it comes after shares and ETFs.
- Still to read in the original before the return is built (static.slov-lex.sk/static/SK/ZZ/2003/595/, the pane):
  § 8 (the expenses, the summing of sales, the loss), § 9 ods. 1 písm. i) and k) as in force for 2026, § 51e,
  the crypto rules, the health insurance act on § 8, and how a foreign currency is converted for somebody who keeps
  no books (the page says "kurzom Európskej centrálnej banky", without the day).
- Next, the return itself (about two days): reading the yearly statements of XTB, Trading 212, Interactive Brokers
  and Revolut (CSV or PDF as each gives them), pairing every sale with its purchase, the time test, the rates of the
  ECB, the DPFO typ B as XML for eDane, and the paid flow (Sám, Za Vás with the accountant's check and the filing
  under a power of attorney). The prices first, from him.

## Design (the sixth one, built on the afternoon of 13 October 2026)

History: the first design (plum, mist, coral, Literata) he called "odporná ... jak z Wordu"; the second (black,
glass, Host Grotesk bold) "tuctové"; the third (black, his iridescent glass objects in every section,
Instrument Serif headlines) "nie najhoršie ... stále nie elita" at 01:10 and at 01:25 "tuctová web stránka z
umelej inteligencie"; the fourth (night turning into a white day, a pile of papers flying into a ledger, Geist
only) at 14:09 "nie je to zlé, ale úprimne, nebral by CEO Apple, Nvidia, Tesla ... je to slabé". The fifth
(black and filmic like Apple's and Robinhood's product pages, one large phone drawn in CSS with the app on it,
his glass papers flying into it, Newsreader headlines with Geist) at 15:07: "nechutné ... neprehľadné ... čisto
vygenerované umelou inteligenciou ... kvantum textu, vyzerá to lacno, ten telefón je úplne od veci". What he
asked for instead, with screenshots of CloudTalk and Tesla: more white ("nechaj biely"), blue and red; the
elegant type in a pleasant red and the modern type in blue; his glass icons kept, made clear and modern and set
as CloudTalk sets its own ("okopíruj aj tie ikony, ako majú"); far less text; no phone; an opening like
CloudTalk's or Tesla's; CloudTalk's structure, its fonts and its centred layout; the plans kept ("asi musí byť")
but made premium. At 15:08: the motion stays ("sú pekné, to zanechaj"), done otherwise. The first look went out
at about 16:00 (preview version 9). At 16:14 he accepted it, having seen it on a computer and not yet on a phone:
"na počítači už to za mňa je celkom úroveň ... nechávame to v tomto stave". Asked whether Musk or Huang would
accept it, he was told: the design would pass; what such people judge is proof (real clients and numbers, never
invented), people (his real photo, an accountant with a name) and a finished thing (domain, email, live site).

- Type: **Funnel Display** (The Funnel Project, OFL) for titles, figures and the name, 600, set tight
  (-0.035 to -0.045em): CloudTalk sets GT Pressura (Grilli Type, paid) at 500; this is the free face nearest to
  it. **Figtree** (Erik Kennedy, OFL) for everything read and every interface, for CloudTalk's Silka (paid).
  **Newsreader italic** (opsz pinned at 60, weights 300 to 500) for the warm half of a title, set a tenth larger
  than the sans so that the two stand level. The files come from `@fontsource-variable/funnel-display` and
  `figtree` (devDependencies), latin and latin-ext, 18 to 20 kB each; Geist and Newsreader's upright are gone.
- Colour (`:root` in `public/app.css`): white page; `--mist` #f5f6fb for the light panels; hairlines `--line`
  #e5e8f1; `--ink` #0d1330 for figures and names, `--text` and two greys leaning to the blue. **Blue** #1c2ef0
  (7.8 to 1 on white) for every title's sans half, every button and link; **red** #e1344c for the serif half
  (large type only, 4.4 to 1; `--red-ink` #c0233a for small red text). Green only for "booked", amber for the
  flag on a slip. The panels of light (the opening, the e-invoice band, the close) are one sky of blue, violet
  and red in radial gradients, each lit from another side, with film grain (an SVG feTurbulence data URI at
  20 %, overlay), as CloudTalk lays it over its own; on them the type is white and the serif a light rose
  (#ffb9c6).
- Titles: `.title` with `.title__sans` (blue) and `.title__serif` (red italic, its own line), centred over each
  section (`.head--center`), as CloudTalk centres its sections. His glass icons stand in `.tile`s: rounded
  squares (radius 30 % of the side) of white to a faint blue with a touch of pink in one corner, a hairline,
  40, 56 or 84 px; the glass fills 84 % of it.
- The opening (`.hero`): CloudTalk's composition. A panel of light (radius 32, up to 720 px high) with a pill
  "Účtovníctvo pre mladé s. r. o.", the promise in white ("Postaráme sa" held together by a no-break space, so
  the line breaks before "o všetko"; "Vy rastiete." in the rose serif (it was "Vy rastite.", which is no Slovak form: the imperative is "rasťte", and the statement fits the pair "Vy pošlete doklady. My urobíme zvyšok.")) and the lead; three of his glass objects
  float in its right part (the invoice, the coins, the slip), each bobbing and drifting up at its own pace as
  the page scrolls. The white card where a client starts (the F in a tile, "Začnite s IČO Vašej firmy", the IČO
  field and its button in one row, "Ešte nemám firmu") lies over the panel's lower right edge: the grid has a
  second row of 124 px and the card spans both. Under the panel on the left: the price line and "Pozrieť
  cenník", "Ako to funguje". The words keep left of the card at every height (`--pad-x`, `--card-w`,
  `--card-r`). On a tablet the card comes under the panel and overlaps it by 96 px; on a phone the glass is one
  invoice in the top corner, and none below 380 px. The opening arrives once (words, card, glass) on load.
- One month (`.flow`, "Vy pošlete doklady. My urobíme zvyšok."): a white card of October as CloudTalk shows a
  feed (head, five rows each with its icon in a tile, title, amount and a green pill, and "Všetko zaúčtované")
  on a light panel. Where scroll timelines exist and the screen is at least 700 px high, the track is 235vh and
  the stage sticky: the five glass papers float beside the card (above it in a panel under 900 px, two of them
  coming in from the sides) and fly one by one into the icon of their row, which lights as it is booked; then
  the foot appears. The card's measures are numbers on `.flow__panel` (`--head-n`, `--row-n`, `--pad-n`,
  `--tile-n`, `--fly-n`) and every landing is reckoned from them (`--lx`, `--ly`, `--ls`); a paper's start is a
  share of the panel's width (`--p`, in `cqw`) and a height from the card's top. Without the flight the card
  stands finished, two papers beside it.
- Then: four figures in light cards (89 €, 0 €, 1 deň, 1. 1. 2027); the hug, lit word by word; everything in
  the price as CloudTalk's interactive list (six cards with a radio each, the checked one white with a blue
  check; the light panel beside them shows the picked one: the machine reading a torn slip under its beam with
  MD 513 / D 221 and the flag, the filed VAT return, e-invoices received, payroll, deadlines with the missing
  slip, the question to the accountant, each but the slip with its glass beside the card's top corner),
  switched by `:has()` with no script; the machine and the person as
  two cards tinted blue and rose; the e-invoice date as a panel of light with the envelope; the prices as one
  sheet of three columns whose six rows stand level (`subgrid`, the list's lines `display: contents`), the lead
  plan lit from above with a blue-to-red bar and a blue price; the comparison; two ways in; who is behind it
  (his words in the red serif); questions; the close as a panel of light with his glass F; a white footer.
- The pages of the request and the legal page are white with a faint blue light at their top.
- Pictures: `scripts/art.py logo art-src/icons/f.png` cuts the glass F from its own transparency: the logo
  files see-through, the favicon see-through, the phone icons and the shared link's picture on white, the name
  in Funnel Display, blue with a red full stop.
- `scripts/dev/preview.mjs <folder>` makes a static copy of the pages for the owner's artifact (relative
  addresses, the stylesheet inlined, the forms stopped with a note); published as "Firmony" on 13 October 2026
  and republished from the same file path (version 9 is the first of the sixth design; version 11, of 16:10,
  adds the glass beside the previews).

## Before pushing

```
npm run check            # TypeScript
npm test                 # 1232 unit checks (18 October 2026), including credit notes, invoice modes, A.2, advances, currencies, repeats, payment orders, business trips, the cash box, late interest
npm run test:runtime     # 1813 workerd checks on Node 24 (as GitHub runs them), including test/centers.runtime.mjs
npm run test:peppol      # 24 checks: every kind of e-invoice against UBL 2.1 and the CEN and Peppol BIS 3.0 rules
FIRMONY_CAPTURE_DIR=.wrangler/ui npm run test:runtime && npm run test:ui  # 1440/390/320 px; requires Chromium or FIRMONY_CHROME
node --no-warnings scripts/playground.mjs          # http://127.0.0.1:8787 with pretend register, email and reader
node scripts/dev/look.mjs <folder> [paths]          # screenshots at three widths, says what overflows
node scripts/dev/mutate.mjs [words]                 # takes this change's rules out one at a time (16)
node scripts/dev/preview-app.mjs <folder> <photo>   # the clickable copy of the app (a fresh playground first)
```

The team in the playground: `/ucto/ukazka` (the administrator) or `/ucto/ukazka?ako=uctovnicka` (Lucia). VAT:
`/ucto/klienti/demo-company/dph`; September of the sample company is ready to be filed. The books:
`/ucto/klienti/demo-company/kniha`. Every client's deadlines: `/ucto/terminy` (the sample company's September, its
recapitulative statement, both companies' documents of the month). The closing: `/ucto/klienti/demo-company/zavierka`
(the year that runs). Payroll: `/ucto/klienti/demo-company/mzdy` (the sample company has no employees: add one there).
The app in the playground: `/app/ukazka` signs in to the sample company; a photo added there is "read" by the
pretend reader (`readerAnswer` in `test/pretend.mjs`) as yesterday's café receipt for 12,40 €, which pairs it with
the café payment. The bank: /app/banka shows the sample company's bank sending its statements by email;
/playground/vypis?typ=dalsi emails the next one (invoice 20260007 becomes paid), typ=novy one of a new account, typ=medzera
one that does not follow; any token of 64 letters and digits links the pretend Fio. With `EB=1` in front of the
command: a bank of the list, "Povoliť prístup" on /playground/banka, and the pretend Enable Banking's payments arrive.
A fresh sample company: remove
`.wrangler/playground-d1` and `.wrangler/playground-r2` before starting (on 14 October each start was fresh anyway:
Miniflare kept the data in a temporary folder of its own). `mutate.mjs` works in a copy in the system's temporary folder; replace its list with the next change's
rules.

The investors' page is `/investori`; the administrator's /ucto/ziadosti shows the three sample sign-ups under
"Investori". `scripts/dev/preview.mjs` copies it into the site's preview (`investori.html`, `investori-hotovo.html`).
In the playground IČO 57442452 is found (europio), 35757442 makes the register fail, anything else is unknown;
`/playground/mail` shows what was "sent". To stop it: `pkill -f "node --no-warnings [s]cripts/playground"` in a
command of its own (a command line that contains the start command is killed by the same pattern).


## Period locks and the competitive baseline (Codex, 15 October 2026)

The next milestone is on `codex/firmony-period-locks`, stacked over PR #3. Schema step 14 adds a continuous lock
through a completed month, an explicit reason for reopening, immutable transition history, source-table guards
and data-revision checks. The team manages it at `/ucto/klienti/:id/kniha/obdobia`; December closes the whole year.
Earlier years are protected because their balances carry forward. Intake of late unbooked documents and raw bank
facts stays possible, but locked sources cannot be posted or paired until reopened. A later payroll cannot
reclassify an earlier payment. Opening balances, settings, linked receipts, old/new dates and nested VAT correction
dates are covered. Current lock state and full history travel in each accounting archive and controlled purge.

`docs/konkurencny-audit-2026-10-15.md` is the current source-backed competitive baseline and pre-December plan:
verified public statements are distinct from operationally tested capabilities. Bezúčtovníka already advertises
expert help, filing and planned eFaktúra delivery through a partner. Firmony's complete postman connection, authority
receipts, production banking verification, staff capacity, MFA and restore drills are still launch dependencies.
Existing configured prices/pay are planning inputs, not a measured margin. Do not claim these dependencies are
finished because a feature exists in a development branch. No merge or deployment was authorized for this milestone.
