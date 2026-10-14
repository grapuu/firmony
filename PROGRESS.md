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

## Resources

- One continuous session; repository work by shell and file tools, research by web search and the Financial
  Administration's own eForm files (pfseform.financnasprava.sk) and slov-lex.sk. No paid external service was called,
  nothing was deployed. The test suites take about 3 s (units) and 45 s (runtime); a full mutation run about 15 minutes.
