# Firmony: working notes

Accounting for young Slovak companies (s. r. o.), run by europio s. r. o. (the owner's company; no new s. r. o.,
his word of 12 October 2026). AI does the routine, a freelance accountant checks and files, one fixed monthly
price. The service starts on 1 January 2027; until then the site collects non-binding requests.
The owner does not use a terminal: everything has to work by pushing to `main`, and anything he must do himself
is a few clicks in a dashboard. He writes Slovak, often dictated, reads little: verdict first, short.

## Where things stand (written on the night of 12 to 13 October 2026, brought up to date on 14 October at about 02:00)

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
- All checks pass: `npm test` (238 unit checks) and `npm run test:runtime` (420 checks in workerd). The sixth
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
  about 02:00 on 14 October (commit named in "The end of a contract" below), all checks passing (units 238, runtime
  420): the administrator ends a contract from our side, the last month's documents are taken ten days past the last
  day, the accountant hands the books over in the app, everything downloads as a ZIP a year, and ninety days past the
  end the schedule deletes the company's data, the identification five years later. The AML program doc (rev 25)
  says so, and a doubled sentence in its section 3 was put right. The previews: the app version 10 ("Koniec
  zmluvy" in its bar: the overview, Firma, Doklady and Faktúry twenty days past the end, and the team's client page
  with the handover; "Stiahnuť ZIP" says in the preview what the app downloads), the site version 17 (the terms and
  the privacy notice of the end, the FAQ "Musím sa viazať?").

## What he has to do before it is live (each a few clicks)

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
7. The first administrator: once email works, he signs in at /app/prihlasenie with `ahoj@firmony.ai`
   (`TEAM.bootstrapEmail`): while nobody of the team exists, that address becomes the administrator
   ("Christian Juhás"). Then he adds accountants on /ucto/tim; each signs in with her own email.
8. Before the page is public: at least one accountant agreed (his to-do list of 12 October: call 3 to 5 freelance
   accountants to confirm 28/55/110 € a client, 5 € a payroll and 90 € a closing), the trade licence "vedenie účtovníctva" added to europio, liability
   insurance, and a digital postman (Qvalia was the lead: ask for its per-client API price).
9. The bank by open banking (read on 13 October 2026 in Enable Banking's documentation, Control Panel and linked
   accounts): an account for europio in its Control Panel (enablebanking.com); an application for **Production**
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
  to be checked.
- Proposed, not yet decided by him: phase 1 by 1 January 2027 is the pipe (a client app: photo, email forwarding,
  eKasa QR, e-invoices and bank by themselves, "missing document" per payment, VAT due and when, messages with the
  accountant) and an accountant's cockpit (AI proposes MD/D, VAT and the control statement line; she confirms;
  bank matched; VAT return and control statement as XML; every client's deadlines on one screen). The ledger and
  the closing stay in a certified program (Pohoda or Omega) until there are hundreds of clients. First piece
  offered: intake (email, photo, eKasa QR) with AI posting proposals, tried on europio's documents.
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
  `/zacat` (the IČO, then the details; `?balik=`, `?nova=1`), `/zacat/hotovo`, `/pravne-informacie` (company,
  privacy, cookies), robots, sitemap, `/healthz`.
- The comparison is a GET form (`mesacne`, `za-doklad`, `doklady`, `zavierka`, `dph`, `ludia`) computed on the
  server in cents (`src/calc.ts`); before anything is typed it shows a worked example (60 € a month, 25
  documents at 5,20 €, closing 160 €: 2 440 € against 977 €).
- The request: the IČO is looked up in the register (`src/rpo.ts`, four seconds at most, 30 lookups an hour per
  connection); on sending, the register is asked again and its name is what is kept and mailed, never a name the
  form carried. A confirmation repeats nothing a stranger could type (spam through our form), at most two a day
  per address. Six requests an hour per connection (an IPv6 address counts by its /64). A hidden field catches
  bots. Campaign tags (utm_*, ref) travel with the forms and are kept with the request.
- The schedule (every 15 minutes) sends the outbox and deletes what the privacy notice promises: requests after
  365 days, sent email after 90, counters after 2 days.
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
- Not built yet: the digital postman, eKasa receipts by their QR code, deleting files at the end of their ten
  years, thumbnails. Not seen in a real
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
- Not built yet: a credit note, an invoice in another currency, an advance invoice, recurring invoices sent by
  themselves, the e-invoice sent through a digital postman, invoice numbering of the company's own pattern, the
  company's logo on the invoice.

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
  and accountant for the administrator), its people, the CSV for the accountant's program by month (UTF-8 with
  BOM, ';', amounts as "12,40", no cell that Excel would run), and the suppliers' rules.
- Booking (/ucto/doklady and /ucto/doklady/:id): the queue of all her clients, oldest first. One screen: the
  original (a photo, or a PDF framed beside the form; a phone gets the link), the form (kind, what it is for as a
  category with its account, supplier, IČO, number, dates typed "11. 10. 2026", amounts, VAT, VS, another account),
  "Odpočítať DPH" for a VAT payer, "Zapamätať pre dodávateľa", and the entry it makes, MD and D, live from the form
  (`entryFor` in `src/app/booking.ts`: a received invoice against 321, a receipt against 221 from the company's
  account, 365 when the owner paid it himself, 211 from cash; VAT on 343 only when it is deducted; an issued
  invoice 311 against 602 or 604 and 343). "Zaúčtovať a ďalší" books and opens the client's next document;
  "Uložiť bez zaúčtovania"; "Zahodiť doklad" (a duplicate, or what is no document); a booked one can be changed
  or unbooked, and is never deleted, by the client or the team. The reader proposes the category (`kategoria`);
  a supplier's rule wins over it and is applied at once to the supplier's other waiting documents. The same
  document sent twice (same number and amount, or same supplier, day and amount) is marked "Možný duplikát" and is
  never paired by itself. A payment can be given to a document from its best candidates.
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
- Not built yet on this side: the VAT return and the control statement as XML, deadlines of every client on one
  screen, the closing, booking the bank's own payments (a fee, a tax) as entries, a log of who changed what on the
  pages (the events are recorded), assigning many clients at once, search in the queue.

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
npm test                 # unit checks (238): pairing, statements, e-invoices, reading, invoices, PAY by square, the bank, prices, papers, doorbells, the declaration, the archive, the end
npm run test:runtime     # the deployable bundle in workerd (420): the site, the order, and the app end to end, to the deletion
node --no-warnings scripts/playground.mjs          # http://127.0.0.1:8787 with pretend register, email and reader
node scripts/dev/look.mjs <folder> [paths]          # screenshots at three widths, says what overflows
node scripts/dev/mutate.mjs [words]                 # takes this change's rules out one at a time (24)
node scripts/dev/preview-app.mjs <folder> <photo>   # the clickable copy of the app (a fresh playground first)
```

The team in the playground: `/ucto/ukazka` (the administrator) or `/ucto/ukazka?ako=uctovnicka` (Lucia).
The app in the playground: `/app/ukazka` signs in to the sample company; a photo added there is "read" by the
pretend reader (`readerAnswer` in `test/pretend.mjs`) as yesterday's café receipt for 12,40 €, which pairs it with
the café payment. The bank: /app/banka, a bank of the list, "Povoliť prístup" on /playground/banka, and the pretend
Enable Banking's payments arrive (invoice 20260007 becomes paid). A fresh sample company: remove
`.wrangler/playground-d1` and `.wrangler/playground-r2` before starting. `mutate.mjs` works in a copy in the system's temporary folder; replace its list with the next change's
rules.

In the playground IČO 57442452 is found (europio), 35757442 makes the register fail, anything else is unknown;
`/playground/mail` shows what was "sent". To stop it: `pkill -f "node --no-warnings [s]cripts/playground"` in a
command of its own (a command line that contains the start command is killed by the same pattern).
