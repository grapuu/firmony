# Firmony: progress of the continuation

The report of the session that continued Firmony from 14 October 2026 (15:17 Bratislava), milestone by milestone:
what was built, what each rule leans on, which checks pass, what remains, and what a professional should read before
it is relied on. The project's own notes are `CLAUDE.md`; this file is the report beside them.

Branch: `claude/firmony-deadlines-closing-payroll` (pushed; pull requests are opened and never merged by the builder:
`main` is the owner's to merge). Nothing is deployed, no production data exist, nothing was bought.

## The start: what was found (14 October 2026, 15:17)

- The repository `grapuu/firmony` was mounted at `/workspace/firmony`, writable, `main` at `277764d`, clean.
- `npm ci`: 65 packages, no vulnerability. `npm run check` (TypeScript): clean. `npm test`: 466 of 466.
  `npm run test:runtime` (the deployable bundle in workerd): 552 of 552. There was nothing to repair first.
- "Step 26 of 53": no such plan is in the repository (neither in `CLAUDE.md` nor in the history). What was followed is
  the order the owner was given at 10:53 on 14 October (`CLAUDE.md`, "Where things stand") in the priorities of the
  session: (1) every client's deadlines on one screen, (2) the closing and the corporate income tax return,
  (3) payroll, (4) the digital postman, (5) eKasa receipts, (6) the gaps `CLAUDE.md` lists.
- Not decided and not touched: the domain (firmony.ai stays the placeholder in `BRAND`), the product for investors.

## Milestone 1: every client's deadlines on one screen (done, 14 October 2026)

What the accountant gets (`/ucto/terminy`, second in the column and in the phone's tabs):

- Every client's deadlines in groups (overdue, within 7 days, within a month, later, done on demand), four figures
  (overdue, within a week, ready to be filed, the client's), filters by whose a deadline is, and the administrator's
  choice of an accountant. Each row: the day (red with the days past when late), what it is, the client, whose it is,
  its state, and the link where it is done. The same list for one client on the client's page ("Termíny").
- What is listed: the VAT return and the control statement of each period, in the state of the VAT page itself
  (ready, blocked with how many things, running, filed); a payer's older period of ours never filed; a corrective or
  a supplementary return of a period changed after filing; the recapitulative statement of a period with supplies to
  another member state (marked as filed here, since the app does not prepare it yet); the VAT the client has to pay
  until the bank shows it paid; the client's documents of a month by the 10th; the closing and the corporate income
  tax return of last year by 31 March (marked as filed here until milestone 2 files it); the handover of the books at
  the end of a contract.
- Code: `src/team/deadlines.ts` (the rules, pure), `src/team/deadlines-store.ts` (a fixed number of queries whatever
  the number of clients, no lists of ids), `src/views/deadlines.tsx`, `POST /ucto/klienti/:id/podane` (the mark),
  schema step 6 (`filings`), deleted with the company's data at the end of a contract.

What it leans on (read on 14 October 2026):

- VAT deadlines: the 25th after the period, the next working day (§ 78(1), § 78a(7) of Act No. 222/2004 Z. z.; § 27(2)
  of Act No. 563/2009 Z. z.), as the VAT milestone already had them. A supplementary return by the end of the month
  after the finding (§ 16 of Act No. 563/2009 Z. z.).
- The recapitulative statement: § 80 of the VAT Act, within 25 days after the period, monthly as a rule, quarterly for
  services alone or goods up to 50 000 € (Financial Directorate, methodical guidance to § 80; dauc.sk; poučenie
  SVDPHv20). A person registered under § 7a files it for the quarter.
- The closing: § 49(1) of Act No. 595/2003 Z. z. (three months after the year, the next working day), the extension by
  notice under § 49(3) (podpora.financnasprava.sk; FR SR information 7/PO/2026/IM); points 5.2 and 10.4 of Firmony's
  terms for which years are ours.
- The days off: Act No. 241/1993 Z. z. as amended by Act No. 261/2025 Z. z. (slov-lex.sk consolidated text, Národný
  inšpektorát práce, aksamec.sk).

Found on the way and put right:

- The days a deadline moves past listed 17 November, 8 May and 15 September for every year. Since 1 November 2025,
  17 November is no day off (§ 2(3)); 8 May and 15 September are none in 2026 (§ 4b). No VAT deadline met those days,
  but payroll's will. `isWorkingDay` is now year-aware; `workingDayFrom` is shared.
- A month of a person registered under § 7a with a document not booked yet was "Nepodáva sa" (nothing to file): the
  document may be the very service from abroad that obliges it to file. It is now "Treba vyriešiť" until every document
  of the month is booked.

Checks: units 466 → 504, runtime 552 → 582, all passing; the screens were looked at in the playground at 1440, 390 and
320 px (nothing overflows). 32 rules taken out once with `scripts/dev/mutate.mjs`: 31 held at once, and the last ("only
what is not done can be late") since a check was added for it.

For a professional to read:

- Whether 8 May and 15 September are days off again in 2027 (the transitional § 4b names 2026 alone; a later act could
  extend it). The code says they are; one line changes it.
- The recapitulative statement of a quarterly VAT payer that supplies goods to the EU above 50 000 € a quarter is
  monthly; the screen shows it for the VAT period. Rare for a young company; the accountant decides.
- The closing of the year before the contract started is listed as the former accountant's (point 5.2 of the terms,
  "ak sa nedohodneme inak"); an agreement to do it cannot be recorded yet.

What remains of it: the recapitulative statement's own XML; payroll's deadlines (with payroll); the motor vehicle tax
and the advances on income tax (with the closing). At hundreds of clients the screen reads every VAT client's last four
months of documents: to measure on the first real month.

## Milestone 2: the closing and the corporate income tax return (done, 14 October 2026)

What the accountant gets (`/ucto/klienti/:id/zavierka?rok=`, from the client's books card and from every closing on
the screen of deadlines):

- The financial statements of a micro entity (Súvaha Úč MUJ 1-01 and Výkaz ziskov a strát Úč MUJ 2-01) worked out from
  the books, in whole euros, with the year before when the books hold it.
- The corporate income tax return worked out row by row (100 to 1110, Tables A, B, D, F, K): the rate by the taxable
  revenues, the losses of five years, the minimum tax (halved, shortened, or none in a first period), its credit in
  three years, the advances paid that the bank shows, the tax to pay or the overpayment, and the advances the next year
  brings. The books propose what they can (representation, gifts, bank interest taxed by withholding, depreciation, the
  taxable revenues, the advances); the accountant adjusts the rest in one form, and what equals a proposal keeps
  following the books.
- What keeps the closing back, each with the way to it (documents and payments of the year not in the books, cash
  below nought, an account the statements have no row for, the company's DIČ, seat and SK NACE, the tax not booked).
- "Zaúčtovať daň": the tax booked by an internal document on 31 December (591 against 341).
- The two files the Financial Administration takes, validated against its own schemas in the tests: the return
  (DPPOv25) and the statements (UZMUJv14), for "Načítať zo súboru" in eDane.
- The deadline moved by a notice (§ 49(3)), shown and used everywhere; red once it has passed.
- "Označiť ako podané": the client gets a message with the tax to pay, the due day, the account (prefix 500224 and the
  personal tax account) and the variable symbol (170099 and the year), or the overpayment, and the advances to pay
  next; "Zrušiť označenie" takes it back and tells the client.
- The client's Dane page lists the income tax with a PAY by square QR code; the screen of deadlines shows "Úhrada dane
  z príjmov" as the client's until the bank shows it paid.
- Code: `src/app/closing.ts` (the rules, pure), `closing-form.ts` (the adjustments, pure), `closing-xml.ts` (the two
  files), `closing-store.ts` (the table, the payments, the year put together), `src/views/closing.tsx`, the routes in
  `src/team/routes.tsx`, schema step 7 (`closings`), deleted with the company's data at the end of a contract.

What it leans on (read on 14 October 2026, from the sources themselves):

- The eForms and their schemas from pfseform.financnasprava.sk: DPPOv25 (form.622, with the eForm's own formulas,
  e.g. rows 150 and 250 computed from Table B) and its poučenie MF/012187/2025-721; UZMUJv14 (form.301, measure
  MF/15464/2013-74 as amended), with the accounts each row names.
- Act No. 595/2003 Z. z.: § 15(b) the rates for 2025 on (10 % up to 100 000 € of taxable revenues, 21 %, 24 % above
  5 000 000 €), § 2(w) the micro-taxpayer (60 000 €), § 30 the losses, § 46b the minimum tax (with the band of
  11 520 € from 2026), § 42 the advances, § 47 rounding, § 49(1), (3), (11) the deadline, its extension, the
  statements.
- The Financial Directorate's information 7/PO/2026/IM (financnasprava.sk): the account 500224-OÚD/8180, the symbol
  1700992025, nothing to pay up to 5 €, the extension's notice by 31 March, the new deadline the end of a month, the
  tax due then (1/PO/2025/IM, as seminare.sfera.sk republished it, says the same of 2024). Its answers on interest
  taxed by withholding (row 210, stays in row 560) and a first period (no minimum tax). Decree No. 378/2011 Z. z.
  (podnikajte.sk, opytajsauctovnika.sk) for the symbols of advances.

Found on the way and put right:

- An advance on the income tax carries the same kind of symbol as VAT (1100MMRRRR): a payment to the income tax's
  account was booked as VAT and counted as VAT paid. The books (`reasonAccount`) and the VAT paid (`taxPaid`, the
  screen of deadlines) now tell them apart by the prefix of the account the money went to (500224 or 500240).
- The eForm computes rows 150 and 250 from Table B; typing them directly would be overwritten when the file is opened.
  The form asks for Table B instead and fills both rows from it.

Changed from milestone 1: the closing is no longer marked filed on the screen of deadlines (`filings`, kind `closing`)
but on its own page (`closings`), which tells the client what to pay; schema step 7 moves any mark it finds. The
screen's closing row links to the page; the recapitulative statement keeps its mark.

Checks: units 504 → 562, runtime 582 → 619, all passing, TypeScript clean. The pages were looked at in the playground
at 1440, 390 and 320 px (nothing overflows; on a phone the statements' table scrolls inside its card, as the books'
tables do). 52 rules taken out once with `scripts/dev/mutate.mjs`: 49 held at once, the other three once a check was
added for each (the statements changed since the filing, a tick stored only against the proposal, the income tax paid
with the year's own symbol).

For a professional to read (the builder's reading, not an accountant's or a tax adviser's):

- The rounding of the statements to whole euros: when the two results would differ, the difference goes into row 22
  (money) of the balance sheet. Practice differs (some put it into other receivables or liabilities).
- 042 and 052 (assets being acquired, advances for them) go to row 06 whatever the asset; the form spreads them over
  rows 05 to 07 by kind. Every receivable and liability is taken as short-term (the books keep no maturity); 47x and
  48x stand in row 35.
- 431 (the result waiting for the general meeting) stands in row 32 with 428 and 429 in the next year's balance sheet.
- The first year with Firmony: the year before comes from the former accountant's statements, which the app does not
  hold; the page says to fill it in eDane.
- The tax depreciation is proposed equal to the books' (551, which also holds intangible assets); a difference is the
  accountant's to type in Table B.
- A period that begins after 1 January is taken as a company's first one (no minimum tax, § 46b(7)), which she can
  untick; a company founded on 1 January is not caught. Whether the 60 000 € of a micro-taxpayer is shortened for a
  first period shorter than a year was not read; the app does not shorten it.
- Deferred tax is not booked (a micro entity is understood not to have to; to confirm).
- The client's message says the advances are paid from the first quarter (or month) after the filing deadline,
  quarterly to the end of each quarter, monthly to the end of each month (§ 42); to confirm the wording.
- `opravnenaOsoba` names europio's representative as "splnomocnenec"; the share of the tax for a recipient (§ 50) is
  left unassigned (`c7paragraf50`), the client's to decide, which the app does not ask.
- DPPOv25 is the form for periods of 2025. Firmony's first closings are for 2027 (the service starts on 1 January
  2027): the form for that period (published in January 2028) and its SK NACE list must replace the schema before the
  first real filing; the schema check in the tests will say what changed.
- The advances the bank shows are those paid to the income tax's account with a symbol of the year: a bank that does
  not say the other side's account (rare: Fio, open banking and SEPA XML statements do) leaves it to the accountant.

What remains of it: the notes to the statements (poznámky, written by the accountant and attached as a PDF), a company
that is not a micro entity (Úč POD), a supplementary return of a filed year (the page says when one is to be
considered), the notice of extension as a file (OZN493; filed in eDane today), the closing entries (710, 702), asset
cards and depreciation, the relief rows and the special tax bases, a request to refund the overpayment, reminders of
each advance's day.

## Milestone 3: payroll, first part (done, 14 October 2026)

Scope chosen: employees in an employment relationship with a monthly wage, the case of a young company's first hires.
The other kinds (agreements, a director's remuneration, pensioners, students) and the reports as files come next.

What the accountant gets (`/ucto/klienti/:id/mzdy`, from the client's books card and the screen of deadlines):

- Employees (wage, insurer, start and end, the signed declaration, a disability, the deductible item, an exception
  from the minimum health advance, children for the bonus, the IBAN).
- A month's payslips worked out from the income she types (the wage offered, a share of it for part of a month): each
  kind of social insurance of both sides, health insurance with the minimum advance and the deductible item, the
  non-taxable part, the tax by the four bands of 2026, the child bonus with its cap and its cut for high incomes, the
  net wage, the employer's cost; a breakdown and a payslip to print.
- "Uzavrieť mesiac": the payslips kept as they were, the month booked (521, 524, 331, 336.100, 336.200, 342), and the
  client told in the app what to pay, to whom and where: each employee's net wage, the Social Insurance Agency, each
  health insurer, the tax office (prefix 500259, symbol 1100 and the month, within five days of the payout).
- The books recognise the payments: the Social Insurance Agency's, an insurer's or the tax office's sum of a closed
  month goes to its account (336.100, 336.200, 342), anything else marked payroll is wages (331).
- The screen of deadlines: each month closed by its payday, and its reports (Social Insurance Agency by the payday,
  health insurers within three days, the tax office's overview by the end of the next month), marked when filed.

What it leans on (read on 14 October 2026, from the sources themselves where they publish it): the Social Insurance
Agency (tables from 1 January 2026; the general assessment base of 2025, 19 440 €; deadlines and rounding), VšZP and
Dôvera (rates from 2026, the minimum advance, the report within three days), the Financial Directorate's pages on the
advance, the bands, the child bonus of 2026, rounding since 2020, the remittance and the overview, and the subsistence
minimum of 1 July 2026 (295,22 €) for 2027. Checked against published figures: SuperFaktúra, Bezúčto, Peniaze.sk,
KROS (each named in the unit checks).

Found on the way and put right: the app's date reader refused a birth date before 2000 (it now takes the 1900s where a
birth date is asked for).

Checks: units 562 → 590, runtime 619 → 639, all passing, TypeScript clean. The page was looked at in the playground at
1440, 390 and 320 px (the month's table scrolls inside its card on a phone). 32 rules taken out once with
`scripts/dev/mutate.mjs`: 30 held at once, the other two once a check was added for each (nobody employed has no days
in a month; the employer's social insurance goes to 524).

For a professional to read (a payroll accountant's eye):

- 2027's figures: the subsistence minimum and the average wage are published; the rates of 2026 are carried (the
  health rate of 5 % is legislated for 2026 and 2027); the child bonus of 2027 is taken as 2026's. To confirm in
  December 2026.
- The employer's unemployment insurance is split 0,5 % + 0,5 % (the support in short-time work), as a company that
  pays the latter; to confirm that every client is such an employer.
- The child bonus for the month of a birth is granted (the bonus "for the month the child is born"); and the bonus is
  granted with the declaration alone (the employer asks for the documents).
- The minimum health advance is shared by the days of the month in employment; the exceptions are the accountant's
  tick.
- The payday decides the due day of the insurance and its reports (the Social Insurance Agency's report on the payday,
  § 143(2) of Act No. 461/2003 Z. z.); a company without a payday agreed pays by the last day of the next month.

What remains of payroll: agreements (dohody) and their exemptions, a director's remuneration, working pensioners and
students, sick pay (náhrada príjmu, 14 days from 2026) and holiday pay worked out, the annual reconciliation (ročné
zúčtovanie), deductions, meal allowances, the employees' registrations, and the reports as files: the Social Insurance
Agency's monthly report, the health insurers' batch 514, the overview PREHLADv26 and the yearly Hlásenie.

## Priority 4: the digital postman (not started: the owner's choice)

Nothing was built: the provider is his to pick (Qvalia was the lead; `CLAUDE.md`, item 8 of "What he has to do"), and
each provider's interface differs (sending, receiving, the Peppol participant's registration). What already stands
for it: issued invoices are e-invoices (UBL 2.1, Peppol BIS 3.0) and a received e-invoice is read by our own code; the
missing piece is the delivery itself. Once he names the provider: its API for receiving and sending, the registration
of each client as a participant, and the price per client into the margin check.

## Milestone 4: eKasa receipts, first part (done, 14 October 2026)

The priority was "eKasa receipts by their QR code": the code on a receipt points to the receipt in the Financial
Administration's eKasa system, so a receipt could come in as data instead of a photo the AI reads. Whether that may
be used at scale was open (`CLAUDE.md`, "The key"). It was read first, and the answer decides what was built.

What the law says (read on 14 October 2026 in the original):

- Act No. 384/2025 Z. z. on recording takings (zákon o evidencii tržieb), in force since 1 January 2026, replaced Act
  No. 289/2008 Z. z. (static.slov-lex.sk, the text as of 1 January 2026; FR SR's information 1/ZoET/2025/I).
- § 2(ai): the service for verifying receipts lets one verify, through a receipt's QR code, the data the eKasa system
  holds, "sprístupňovať a získavať tieto údaje"; § 2(aj): a verifier (overovateľ) is a person entitled to use it and
  obtain the data "po splnení podmienok podľa § 18 ods. 11".
- § 18(1) and (3): FR SR lets the public verify a receipt by its QR code or its identifier through an application,
  repeatedly; the seller has to tolerate it.
- § 18(11): before using the service a verifier notifies FR SR of the IP address it will use, sends FR SR true results
  of what it verified, and follows the conditions of use and of communication FR SR sets and publishes on its site.
- § 19(6): the financial administration proceeds under § 18(11) only from a day FR SR sets and publishes.
- Not found on FR SR's site that day (its eKasa pages for sellers and for producers, ePeňaženka, OPD): the verifiers'
  conditions, the day of § 19(6), an interface for verifiers. Poradca.sk (28 January 2026) writes that the service was
  made at the request of accounting firms and that FR SR will publish the conditions. FR SR's eKasa page also says that
  since 1 January 2025 the VAT recapitulation is no longer a compulsory part of what a till sends, so Over doklad may
  show it incompletely (the VAT of each item stays).

So asking the Financial Administration by program, for every client's receipts, is the verifier's way, and it needs:
(1) the owner's decision to be one (europio, for its clients), (2) FR SR's conditions, which are not published, (3) a
fixed IP address: a Worker has none of its own (Cloudflare's egress addresses are shared); a fixed one is a paid
option (dedicated egress, or a small proxy with its own address) and not ours to buy. Firmony asks the service
nothing, and the address its web page calls (not documented by FR SR) is not used.

What was built meanwhile (it works today, and it is what the lookup will need):

- The reader reads the two codes every eKasa receipt carries, as FR SR's "Popis integračného rozhrania systému eKASA"
  (4 November 2022) defines them: the identifier (UID, chapter 2.7: a letter, "-" and 32 hexadecimal characters; a
  receipt the till sent at once has it, and it is the whole content of its QR code, chapter 2.10) and the seller's
  verification code (OKP, chapter 2.2: five blocks of eight hexadecimal characters; every receipt has it, and the QR
  code of a receipt sent late begins with it, chapter 2.9). Each is checked against its form, written as FR SR writes
  it (capitals, the blocks, a nought read for the letter O put right), and kept with the document (schema step 9:
  `documents.ekasa_uid`, `ekasa_okp`). Code: `src/app/ekasa.ts`, the reader's tool in `src/app/read.ts`.
- Duplicates: a receipt photographed twice (or photographed and forwarded) is one even when its amount or its day was
  read wrong once: its codes agree, a few characters misread allowed (up to four of 32 or 40; two receipts' codes
  differ in nearly all). Two receipts whose codes differ are two even with the same number and amount: a till numbers
  its receipts from 1 again every calendar month (chapter 3.3.12.14), so the old rule (number and amount) took a
  monthly parking receipt for a duplicate of last month's. Without codes the old rule stands.
- Put right on the way: the search for a duplicate looked at the 20 oldest documents of the same amount, so a company
  with many of one amount (parking, coffee) stopped finding new duplicates; it looks at the 50 latest now, and names
  the original rather than another duplicate.
- The accountant's booking screen shows the code under the original, with "Overiť na finančnej správe" (FR SR's Over
  doklad on the web, opd.financnasprava.sk, which she opens herself: the public use of § 18(3)).
- The sample company's receipts carry codes, printed on their originals.

Checks: units 590 → 603, runtime 639 → 647, all passing, TypeScript clean. The booking screen was looked at in the
playground at 1440, 390 and 320 px (nothing overflows; the code keeps one line down to 390 px). 22 rules taken out once
with `scripts/dev/mutate.mjs`: all held (the checks of a code read exactly, of the original named as the twin and of a
receipt without an amount were written with the rules, before the run; one rule's mutation was first written so that
it broke the query instead of the rule, and was run again done right).

For the owner to decide, and a professional to read:

- Whether europio becomes a verifier. A letter to FR SR is drafted below (through "Opýtajte sa finančnej správy", or
  by an e-filing to the Financial Directorate); its answer decides the next step and its cost (the fixed address).
- Whether data fetched from the service may stand in the books for the paper receipt (Act No. 431/2002 Z. z.: § 10 on
  what an accounting document holds, and its rules on the form of accounting records). Until it is answered, the photo
  stays the document and the codes only identify it.
- The tolerance of four characters is the builder's judgement of a thermal slip read from a phone photo.

The letter (draft, Slovak, his to send and sign):

> Vec: Služba na overovanie dokladov pre overovateľa podľa § 18 ods. 11 zákona č. 384/2025 Z. z.
>
> Dobrý deň,
>
> spoločnosť europio s. r. o., IČO 57 442 452, DIČ 2122734449, K lesu 2218/39A, 040 18 Košice, pripravuje službu
> vedenia účtovníctva pre malé obchodné spoločnosti. Klienti nám posielajú pokladničné doklady z pokladníc eKasa ako
> fotografie. Správnosť ich údajov by sme radi overovali službou na overovanie dokladov ako overovateľ podľa § 2 písm.
> aj) a § 18 ods. 11 zákona č. 384/2025 Z. z. o evidencii tržieb. Prosíme o informáciu:
>
> 1. kde finančné riaditeľstvo zverejnilo, alebo kedy zverejní, podmienky používania služby na overovanie dokladov
>    overovateľom a podmienky komunikácie s ňou, a deň podľa § 19 ods. 6 zákona;
> 2. ako sa oznamuje IP adresa podľa § 18 ods. 11 a či možno oznámiť viac adries alebo ich rozsah;
> 3. či je služba určená aj na automatizované overovanie programom (rozhranie, jeho dokumentácia, počet overení,
>    poplatok);
> 4. v akej forme a lehote overovateľ zasiela výsledky overenia podľa § 18 ods. 11 druhej vety;
> 5. či overovateľ môže overovať doklady, ktoré mu poskytnú jeho klienti (kupujúci), a uchovávať získané údaje ako
>    súčasť ich účtovníctva.
>
> Ďakujeme.
>
> S pozdravom
> Christian Juhás, konateľ, europio s. r. o.

What remains of it: the QR code decoded from the picture (the reader reads the printed codes; decoding the QR needs the
phone's browser, whose BarcodeDetector Chrome on Android has and Safari has not, or a decoder on the server, which costs
CPU on every photo), the lookup itself once allowed, a receipt taken as data without a photo, and a client's own eKasa
takings in the VAT return (row D.1 of the control statement, `CLAUDE.md`).

## Resources

- One continuous session (milestone 1 from 15:17 to 16:03, milestone 2 to 17:22, milestone 3 to 17:57, milestone 4 to
  18:31); repository work by shell and file tools, research by web search and the Financial Administration's own
  files (pfseform.financnasprava.sk, financnasprava.sk: the eForms, the eKasa interface's description) and
  slov-lex.sk. No paid external service was called, nothing was deployed, no production data exist. The test suites
  take about 3 s (units) and 50 s (runtime); a full mutation run of milestone 2 (52 rules) about 20 minutes, of
  milestone 4 (22 rules) about 12, most rules failing the units first.
